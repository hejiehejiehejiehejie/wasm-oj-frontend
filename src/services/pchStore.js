/**
 * PCH 的 IndexedDB 存档 —— 只干一件事：把一份二进制按 id 存进去、按 id 取回来。
 *
 * 为什么用原生 API 而不是 idb：这里没有事务编排、没有游标、没有多表，
 * 30 行就够，不值得为它引一个依赖（项目的重量级依赖只有 monaco + runno）。
 *
 * 存储形状刻意做得很薄：{ id, bytes, size, createdAt, encoding? }。id 由调用方算好，
 * 「什么时候算过期」也归调用方 —— 存档层不认识 PCH 的语义，只负责原样存取。
 * 所以这个文件不需要知道 clang 版本、头文件内容这些东西。
 *
 * **存储按 gzip 落盘**（2026-11-05 加，P3）：一份 PCH 解压态约 23.2MB，gzip 后 14.2MB。
 * 浏览器不会替我们压响应体，所以这里在写入前用 `CompressionStream('gzip')` 过一遍，
 * 记录上打 `encoding: 'gzip'`；读的时候解压回原字节。没有 `encoding` 的旧记录是
 * 解压态，照常可读，并在首次命中后于空闲时重存成压缩态（不阻塞当次编译）。
 *
 * 压缩是**可选**的：`CompressionStream` 缺席、压缩失败、或配额不足，都退回存原字节，
 * 行为与之前完全一致 —— 这个文件的所有承诺仍然是「拿不到就当没有」。
 * 字节始终是 Uint8Array（structured clone 的后代），不是 ArrayBuffer。
 */
import { LEGACY_PCH_DB_NAME, PCH_DB_NAME } from './storageNames.js'

const STORE_NAME = 'pch'
const DB_VERSION = 1
const ENCODING_GZIP = 'gzip'

/** @type {Promise<IDBDatabase | null> | null} */
let dbPromise = null

/**
 * 可选压缩：不支持 / 失败都返回 null，调用方退回存原字节。
 * `Blob` + `Response` 这一套是为了让压缩在流式管线里跑，不必自己拼 Chunk。
 */
async function gzipBytes(bytes) {
  if (typeof CompressionStream === 'undefined') return null
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream(ENCODING_GZIP))
    const compressed = new Uint8Array(await new Response(stream).arrayBuffer())
    return compressed.byteLength > 0 ? compressed : null
  } catch {
    return null
  }
}

/** 解压 gzip 记录；坏数据 / 不支持的浏览器返回 null（调用方按「没有存档」处理） */
async function gunzipBytes(bytes) {
  if (typeof DecompressionStream === 'undefined') return null
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(ENCODING_GZIP))
    const raw = new Uint8Array(await new Response(stream).arrayBuffer())
    return raw.byteLength > 0 ? raw : null
  } catch {
    return null
  }
}

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') {
        resolve(null)
        return
      }
      let request
      try {
        request = indexedDB.open(PCH_DB_NAME, DB_VERSION)
      } catch {
        // Firefox 隐私模式直接抛错，而不是给一个失败事件
        resolve(null)
        return
      }
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME, { keyPath: 'id' })
        }
      }
      request.onsuccess = () => {
        // PCH 是缓存，下次编译会自动重建：旧库（改名前的名字见 storageNames.js）留着
        // 白占约 6.9MB，静默删掉
        try {
          indexedDB.deleteDatabase(LEGACY_PCH_DB_NAME)
        } catch {
          /* 删不掉（被别的标签页占用等）也无所谓，旧库只是占地方 */
        }
        resolve(request.result)
      }
      request.onerror = () => resolve(null)
      request.onblocked = () => resolve(null)
    })
  }
  return dbPromise
}

/**
 * 事务封装：拿不到库 / 事务失败都返回 null。
 * 写操作必须等 tx.oncomplete —— put 的 request 成功只代表请求进队了，
 * 配额超限是在事务提交时才失败的。
 */
async function withStore(mode, task) {
  const db = await openDb()
  if (!db) return null
  return new Promise((resolve) => {
    let request
    try {
      const tx = db.transaction(STORE_NAME, mode)
      request = task(tx.objectStore(STORE_NAME))
      tx.oncomplete = () => resolve(request.result ?? null)
      tx.onabort = tx.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

/**
 * 按 id 取回 PCH 字节。
 * @returns {Promise<Uint8Array | null>} 没有存档 / 取不到都是 null
 */
export async function readPch(id) {
  const record = await withStore('readonly', (store) => store.get(id))
  const bytes = record?.bytes
  // 存进去是 Uint8Array，取回来是结构化克隆的结果；不认的形状一律当没有
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) return null
  // 命中时顺手清掉别的版本：id 里带着 PCH_CACHE_VERSION，换版之后旧存档再也取不到，
  // 只有这一趟能发现它还在（2026-10-25 实测 IndexedDB 19.6MB = 两版 PCH 各 8.6MB）
  void pruneOthers(id)
  if (record.encoding !== ENCODING_GZIP) {
    // 旧存档（解压态）照样能用，但顺手在空闲时重存成 gzip，下一次读才是瘦的。
    // 不在这一趟里同步重压：它会让「点运行」多等 ~0.4s，而 PCH 省下的也才 0.23–0.26s。
    recycleLegacyRecord(id, bytes)
    return bytes
  }
  const raw = await gunzipBytes(bytes)
  if (raw === null) {
    // 压缩态存档坏了 / 浏览器不支持解压：当没有存档，让编译自己重建 PCH
    void deletePch(id)
    return null
  }
  return raw
}

/**
 * 旧记录（解压态）的空闲重存。
 * 放 `requestIdleCallback`：压缩一张 23MB 的 PCH 约 0.4s，别和首次编译抢主线程。
 */
function recycleLegacyRecord(id, bytes) {
  const run = () => void writePch(id, bytes)
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(run, { timeout: 5000 })
  } else {
    setTimeout(run, 1500)
  }
}

/**
 * 存档一份 PCH。先压再写；压缩不可用/失败就退回原字节（此时不带 `encoding`，
 * 读路径按旧格式处理）。
 * @returns {Promise<boolean>} 是否真的写进去了；false 只表示「这次没存上」，
 * 调用方不应该因此中断编译
 */
export async function writePch(id, bytes) {
  const compressed = await gzipBytes(bytes)
  const record = compressed
    ? { id, bytes: compressed, size: bytes.byteLength, encoding: ENCODING_GZIP, createdAt: Date.now() }
    : { id, bytes, size: bytes.byteLength, createdAt: Date.now() }
  const result = await withStore('readwrite', (store) => {
    // 这个库只放 PCH，而 PCH 一辈子只该有一份：先清再写，与 put 同一个事务，
    // 换版留下的旧 id 不会跟着新存档一起留到下一次升级
    store.clear()
    return store.put(record)
  })
  return result !== null
}

/**
 * 只留 keepId 这一份存档。
 * 游标删除而不是「读 keys 再逐个删」：一次事务扫完，少一轮往返；
 * 失败一律静默 —— 这只是回收空间，不该影响编译。
 */
async function pruneOthers(keepId) {
  const db = await openDb()
  if (!db) return
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const cursorRequest = tx.objectStore(STORE_NAME).openCursor()
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result
      if (!cursor) return
      if (cursor.key !== keepId) cursor.delete()
      cursor.continue()
    }
  } catch {
    /* 删不掉就留着，不影响本次编译 */
  }
}

/** 判废：删掉存档（带 PCH 却编译不通过时用） */
export async function deletePch(id) {
  await withStore('readwrite', (store) => store.delete(id))
}