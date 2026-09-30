/**
 * PCH 的 IndexedDB 存档 —— 只干一件事：把一份二进制按 id 存进去、按 id 取回来。
 *
 * 为什么用原生 API 而不是 idb：这里没有事务编排、没有游标、没有多表，
 * 30 行就够，不值得为它引一个依赖（项目的重量级依赖只有 monaco + runno）。
 *
 * 存储形状刻意做得很薄：{ id, bytes, size, createdAt }。id 由调用方算好，
 * 「什么时候算过期」也归调用方 —— 存档层不认识 PCH 的语义，只负责原样存取。
 * 所以这个文件不需要知道 clang 版本、头文件内容这些东西。
 *
 * 所有导出函数都**不会抛异常**：拿不到库（隐私模式 / 用户禁了站点数据）、
 * 配额不足、存档损坏，一律按「没有存档」处理并返回 null / false。
 * 调用方（runnoSandbox）默认就是把 PCH 当可选加速，没它也必须能编译。
 */
import { LEGACY_PCH_DB_NAME, PCH_DB_NAME } from './storageNames.js'

const STORE_NAME = 'pch'
const DB_VERSION = 1

/** @type {Promise<IDBDatabase | null> | null} */
let dbPromise = null

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
  return bytes instanceof Uint8Array && bytes.byteLength > 0 ? bytes : null
}

/**
 * 存档一份 PCH。
 * @returns {Promise<boolean>} 是否真的写进去了；false 只表示「这次没存上」，
 * 调用方不应该因此中断编译
 */
export async function writePch(id, bytes) {
  const record = { id, bytes, size: bytes.byteLength, createdAt: Date.now() }
  const result = await withStore('readwrite', (store) => store.put(record))
  return result !== null
}

/** 判废：删掉存档（带 PCH 却编译不通过时用） */
export async function deletePch(id) {
  await withStore('readwrite', (store) => store.delete(id))
}