/**
 * 工具链落盘的**唯一写入源**（方案 A，2026-11-22）。
 *
 * ## 为什么所有写入都收敛到这里
 *
 * 旧链路里有两拨人在写同一个 `cp-toolchain` 桶：SW 的 fetch 拦截（tee + 实时 gzip）和
 * 页面的预取。首访窗口、`waitUntil` 未完成时的冷读复验、同键并发双写，全是从这里长出来的。
 * 现在改成职责分离：
 *
 * - **SW 只认外壳**：遇到 `.gzbin` 与 `__toolchain_manifest__.json` 直接透传网络，
 *   不进桶、不压缩、不做 cacheFirst（见 src/sw.js 的 `isToolchainPayload`）。
 * - **页面 / Worker 直接读写 Cache Storage**（`window.caches` / `self.caches` 都能用），
 *   所以不再依赖 SW 是否已接管当前页面 —— 首访点「下载」也能一次成功。
 *
 * ## 落盘格式
 *
 * 服务端给的是 `*.gzbin`：**已经 gzip 压缩、但不带 `Content-Encoding`**。浏览器不会替我们
 * 解压，页面拿到的就是压缩字节，原样写进桶（~38MB，而不是解压态的 ~137MB）。
 * 桶里的条目带 `x-cp-storage-encoding: gzip` 标记；运行时用 `DecompressionStream('gzip')`
 * 流式解压后再交给 `compileStreaming`。旧格式（`.br` 经浏览器透明解压后的条目）没有标记，
 * 读取时原样使用 —— 老用户不必强制重下。
 *
 * ## manifest 是唯一事实源
 *
 * 三件资产全部写完、并且**逐条冷读复验**（真的把 body 流读完，不是只看头）之后，
 * 才写 `__toolchain_manifest__.json`。它是「已就绪」的提交点：
 * - 探针只看 manifest + 三件命中 + 桶里记录的 Content-Length；
 * - 下载失败 / 中途退出绝不会留下一个「看起来就绪」的半份。
 *
 * 服务端静态清单 `toolchain-assets.json` 由构建脚本生成（scripts/build-toolchain-gzbin.mjs），
 * 给出每件资产**压缩态 / 解压态**的精确字节数：前者是下载进度与写后复验的基准，
 * 后者是运行时解压进度条的分母（wire 上的 Content-Length 是压缩态，不能混用）。
 */

import { TOOLCHAIN_CACHE } from './storageNames.js'

/** 工具链目录版本号：拼资源地址与 manifest 里的 version 都用它 */
export const TOOLCHAIN_VERSION = '23.1.0'

const ASSETS = `${location.origin}${import.meta.env.BASE_URL}wasm/${TOOLCHAIN_VERSION}`

/** 工具链目录的绝对地址（不带尾斜杠），给需要拼 PCH 等同类路径的模块用 */
export const TOOLCHAIN_ASSETS_BASE = ASSETS

/** 服务端静态清单（构建产物）：每件的 compressedSize / uncompressedSize */
export const TOOLCHAIN_ASSET_LIST_URL = `${ASSETS}/toolchain-assets.json`

/** 桶内清单的 key。与资产同前缀，`pruneLegacyToolchainCache` 不会把它当旧版本清掉 */
export const TOOLCHAIN_MANIFEST_KEY = `${ASSETS}/__toolchain_manifest__.json`

/** manifest 的格式版本；读到别的值一律当「没装」 */
export const TOOLCHAIN_FORMAT = 'gzip-v1'

/** 桶里这份 body 是怎么编码的（旧条目没有这个头 = 已经是解压态） */
export const STORAGE_ENCODING_HEADER = 'x-cp-storage-encoding'
export const STORAGE_ENCODING_GZIP = 'gzip'

/**
 * 桶里这份 body 的**压缩态**字节数。
 *
 * 为什么不只依赖 `Content-Length`：它由我们自己写进 Response，但 Cache API / 浏览器
 * 对「流式 body + 手写 Content-Length」的处理各实现不一（有的会把它当作计算值丢掉）。
 * 这个自定义头是探针的可靠依据；`content-length` 在时也一起核对，两个都在就要求一致。
 */
export const STORAGE_SIZE_HEADER = 'x-cp-size'

/** 三件资产在运行时的名字（compressedSize / uncompressedSize 都以 key 索引） */
export const TOOLCHAIN_ASSET_KEYS = ['clang', 'linker', 'sysroot']

/** 错误 payload 里给人看 / 给日志看的资产名（`linker` 的产物名是 wasm-ld） */
export const TOOLCHAIN_ASSET_LABELS = {
  clang: 'clang.wasm',
  linker: 'wasm-ld.wasm',
  sysroot: 'sys23-fs.tar',
}

/**
 * 工具链的结构化错误码（第三步，2026-11-22）。
 *
 * 为什么要有码：同一条「本地沙箱不可用：…」背后是四种完全不同的处境，恢复动作却一致
 * （联网重新下载）。界面 / 诊断面板靠码分流，文案靠 i18n，别再让调用方解析中文字符串。
 */
export const TOOLCHAIN_ERROR = {
  /** 本机从来没装过（桶里没有 manifest，也没有安装痕迹） */
  NOT_INSTALLED: 'TOOLCHAIN_NOT_INSTALLED',
  /** 缓存桶被单独清掉、站点存储还在：manifest 没了但 lastInstalledAt 有值 */
  EVICTED: 'TOOLCHAIN_EVICTED',
  /** manifest 还在，但三件套里缺件 / 尺寸对不上（写了一半、迁移中断） */
  PARTIAL: 'TOOLCHAIN_PARTIAL',
  /** 读到了字节，但解压或 WebAssembly.compile 失败（磁盘上的文件半截损坏） */
  CORRUPTED: 'TOOLCHAIN_CORRUPTED',
}

/**
 * 造一个带码的错误。`detail` 只放可结构化克隆的数据 —— 它会随 worker 的 error 消息
 * 回到主线程，再进诊断 JSON。
 */
export function createToolchainError(code, message, detail = {}) {
  const error = new Error(message)
  error.code = code
  error.detail = detail
  return error
}

/**
 * 上次**成功提交 manifest** 的时间（纯诊断痕迹，不参与就绪判定）。
 *
 * 唯一用途是把 `TOOLCHAIN_EVICTED` 与 `TOOLCHAIN_NOT_INSTALLED` 分开：Firefox / Safari
 * 触发整站回收时会连 localStorage 一起清空，那种情况在纯前端下与「从没装过」无法区分；
 * 能捕获的是「缓存桶被单独清掉、站点存储尚存」或迁移异常。
 */
export const LAST_INSTALLED_KEY = 'cp.toolchain.lastInstalledAt'

/** 读安装痕迹（毫秒时间戳）；没有 / 不可用返回 0 */
export function readLastInstalledAt() {
  try {
    const raw = Number(localStorage.getItem(LAST_INSTALLED_KEY))
    return Number.isFinite(raw) && raw > 0 ? raw : 0
  } catch {
    // 隐私模式 / 老浏览器 / Worker 里没有 localStorage：按「没有痕迹」处理
    return 0
  }
}

function rememberInstalledAt(timestamp = Date.now()) {
  try {
    localStorage.setItem(LAST_INSTALLED_KEY, String(timestamp))
  } catch {
    /* 只是诊断痕迹，写不进去不影响下载成功 */
  }
}

/**
 * 用户主动卸载时清掉安装痕迹。
 *
 * 不清理的话，卸载后第一次离线运行会被判成 `TOOLCHAIN_EVICTED`（「缓存被浏览器清理」），
 * 而真实情况是用户自己删的 —— 诊断面板应该说「未安装」。
 */
export function clearLastInstalledAt() {
  try {
    localStorage.removeItem(LAST_INSTALLED_KEY)
  } catch {
    /* 没有 localStorage 就没有痕迹可清 */
  }
}

/** 新格式（预压缩 .gzbin，页面直接落桶） */
export const TOOLCHAIN_ASSET_URLS = {
  clang: `${ASSETS}/clang.wasm.gzbin`,
  linker: `${ASSETS}/wasm-ld.wasm.gzbin`,
  sysroot: `${ASSETS}/sys23-fs.tar.gzbin`,
}

/**
 * 旧格式（`.br` 由浏览器透明解压）。只用于**读缓存**，绝不拿去请求网络：
 * 新链路里没有任何人需要再下这份 89MB 的解压态资产。
 */
export const LEGACY_ASSET_URLS = {
  clang: `${ASSETS}/clang.wasm.br`,
  linker: `${ASSETS}/wasm-ld.wasm.br`,
  sysroot: `${ASSETS}/sys23-fs.tar.br`,
}

/** 每件资产解压后的 MIME：clang / wasm-ld 交给 compileStreaming，sysroot 是 tar */
const ASSET_CONTENT_TYPES = {
  clang: 'application/wasm',
  linker: 'application/wasm',
  sysroot: 'application/x-tar',
}

async function openToolchainCache() {
  if (typeof caches === 'undefined') return null
  try {
    return await caches.open(TOOLCHAIN_CACHE)
  } catch {
    // 隐私模式 / 配额 / 未安全上下文：调用方按「没有缓存」处理
    return null
  }
}

/**
 * 读服务端静态清单。它是构建产物，路径固定、内容随构建变，所以请求带 `no-store`。
 * @returns {Promise<{version: string, format: string, assets: Array<{key: string, file: string, compressedSize: number, uncompressedSize: number}>}>}
 */
export async function fetchAssetList() {
  const response = await fetch(TOOLCHAIN_ASSET_LIST_URL, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`工具链清单获取失败（HTTP ${response.status}）`)
  }
  const data = await response.json()
  if (!data || data.format !== TOOLCHAIN_FORMAT || data.version !== TOOLCHAIN_VERSION) {
    throw new Error('工具链清单版本不匹配，请刷新页面后重试')
  }
  if (!Array.isArray(data.assets)) throw new Error('工具链清单格式不正确')
  for (const asset of data.assets) {
    if (
      !TOOLCHAIN_ASSET_KEYS.includes(asset?.key) ||
      typeof asset.file !== 'string' ||
      !Number.isFinite(asset.compressedSize) ||
      !Number.isFinite(asset.uncompressedSize)
    ) {
      throw new Error('工具链清单格式不正确')
    }
  }
  return data
}

/**
 * 读桶里的 manifest（提交点）。任何异常 —— 没有条目、JSON 坏了、版本对不上 —— 都返回 null，
 * 调用方据此判定「未就绪」，而不是把异常漏到界面上。
 */
export async function readCachedManifest() {
  const cache = await openToolchainCache()
  if (!cache) return null
  try {
    const response = await cache.match(TOOLCHAIN_MANIFEST_KEY)
    if (!response) return null
    const data = await response.json()
    if (!data || data.format !== TOOLCHAIN_FORMAT || data.version !== TOOLCHAIN_VERSION) return null
    if (!Array.isArray(data.assets)) return null
    return data
  } catch {
    return null
  }
}

/**
 * 写 manifest —— **只能在三件资产全部通过写后复验之后调用**。
 *
 * 这是整条下载流程的提交点：它出现的时刻，桶里已经有一份逐字节核对过的完整资产。
 * 反过来说，任何提前写 manifest 的改动都会让探针把半份资产报成「已就绪」。
 */
export async function writeCachedManifest(manifest) {
  const cache = await openToolchainCache()
  if (!cache) throw new Error('浏览器不支持 Cache Storage，无法保存离线工具链')
  await cache.put(
    new Request(TOOLCHAIN_MANIFEST_KEY),
    new Response(JSON.stringify(manifest), {
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      },
    }),
  )
  // 纯诊断痕迹（见 LAST_INSTALLED_KEY）：只在提交点之后写，用来区分 EVICTED / NOT_INSTALLED。
  // 不参与任何就绪判定 —— 唯一的就绪事实源仍是上面这份 manifest。
  rememberInstalledAt()
}

/**
 * 把 body 流读完并累加真实字节数。
 *
 * **必须读 body，不能只看 `Content-Length` 响应头**：头是写入时我们自己填的元数据字符串，
 * 磁盘上的 body 有没有被截断（配额写满、Safari 中途回收、进程被杀）它证明不了。
 * 逐块累加、边读边丢，不攒内存 —— 手机端扫 38MB 只要百毫秒级。
 */
async function countBodyBytes(response) {
  if (!response.body) return 0
  const reader = response.body.getReader()
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
    }
    return total
  } finally {
    reader.releaseLock()
  }
}

/**
 * 下载一件 `.gzbin` 并写进桶，然后**冷读复验**。
 *
 * 写入走单消费者：计数用的 TransformStream 直接串在 `cache.put` 的 body 上，
 * 不做 `tee()` —— 两路消费会在慢的一端积压缓冲，正是要避免的内存峰值。
 *
 * 任一步失败都删掉这一条（半份条目比占地方更糟），异常继续往上抛；
 * 此时 manifest 还没写，探针不会把它当成「已就绪」。
 *
 * @param {string} url
 * @param {Response} response 网络响应（body 是原始 gzip 字节）
 * @param {{ expectedSize: number, onProgress?: (loaded: number) => void }} options
 */
export async function putAsset(url, response, { expectedSize, onProgress }) {
  const cache = await openToolchainCache()
  if (!cache) throw new Error('浏览器不支持 Cache Storage，无法保存离线工具链')
  if (!response.body) throw new Error('下载响应没有 body')

  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > 0 && declared !== expectedSize) {
    // 不消费 body 会让连接一直挂着，顺手放掉
    try {
      await response.body?.cancel()
    } catch {
      /* 已经出错了，取消失败无所谓 */
    }
    throw new Error(`资产大小与清单不一致（${declared} ≠ ${expectedSize}）`)
  }

  let written = 0
  const tracked = response.body.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        written += chunk.byteLength
        onProgress?.(written)
        controller.enqueue(chunk)
      },
    }),
  )
  const headers = new Headers({
    'content-type': 'application/octet-stream',
    'cache-control': 'public, max-age=31536000, immutable',
    [STORAGE_ENCODING_HEADER]: STORAGE_ENCODING_GZIP,
    [STORAGE_SIZE_HEADER]: String(expectedSize),
  })
  // 顺手写一份 Content-Length：探针优先核对它；浏览器若在落盘时丢掉，还有上面的自定义头
  headers.set('content-length', String(expectedSize))

  try {
    await cache.put(new Request(url), new Response(tracked, { headers }))
    if (written !== expectedSize) {
      throw new Error(`资产写入不完整（${written}/${expectedSize} 字节）`)
    }
    const cached = await cache.match(url)
    if (!cached) throw new Error('资产写入后无法从缓存读回')
    const stored = await countBodyBytes(cached)
    if (stored !== expectedSize) {
      throw new Error(`资产落盘校验失败（${stored}/${expectedSize} 字节）`)
    }
  } catch (error) {
    try {
      await cache.delete(url)
    } catch {
      /* 删不掉也只是占地方；manifest 没提交，下次会重下 */
    }
    throw error
  }
}

/**
 * 一次性拉齐三件套并提交 manifest。**取消 wasm-ld 懒加载**是有意的：
 * 断网后第一次链接才发现缺链接器，报的是模糊的 NetworkError，用户根本不知道要联网补什么。
 *
 * @param {{ signal?: AbortSignal, onProgress?: (progress: { loaded: number, total: number, key: string }) => void }} [options]
 */
export async function downloadToolchain({ signal, onProgress } = {}) {
  const list = await fetchAssetList()
  const total = list.assets.reduce((sum, asset) => sum + asset.compressedSize, 0)

  const assets = []
  let done = 0
  for (const key of TOOLCHAIN_ASSET_KEYS) {
    const asset = list.assets.find((item) => item.key === key)
    if (!asset) throw new Error(`工具链清单缺少 ${key}`)
    const url = `${ASSETS}/${asset.file}`
    // no-store：这份 body 要原样进 Cache Storage，不能再让 HTTP 磁盘缓存存第二份 38MB
    const response = await fetch(url, { cache: 'no-store', signal })
    if (!response.ok) {
      throw new Error(`${asset.file} 下载失败（HTTP ${response.status}）`)
    }
    await putAsset(url, response, {
      expectedSize: asset.compressedSize,
      onProgress: (loaded) => {
        onProgress?.({ key, loaded: done + loaded, total })
      },
    })
    done += asset.compressedSize
    assets.push({
      key,
      url,
      compressedSize: asset.compressedSize,
      uncompressedSize: asset.uncompressedSize,
    })
  }

  // 三件全部复验通过，才提交。此前任何失败都不会留下「已就绪」的假象。
  const manifest = {
    version: TOOLCHAIN_VERSION,
    format: TOOLCHAIN_FORMAT,
    createdAt: Date.now(),
    assets,
  }
  await writeCachedManifest(manifest)
  // 清理旧 `.br` 是 best-effort：manifest 已经提交，清理失败不能把一次成功的下载判成失败
  void deleteLegacyEntries()
  return manifest
}

/**
 * 轻量 preflight（运行前 / 启动探针共用）。**不读 body**：
 * manifest 存在 + 指定的几件都在 + 桶里的 `x-cp-size` 与 manifest 一致，即可。
 * 写后复验（putAsset）已经读过一遍真实字节，这里只负责在 5ms 内给出结论与**缺哪件**。
 *
 * 状态口径：
 * - `ready`：可以开跑；
 * - `not-installed`：没有 manifest，也没有安装痕迹 → 从没装过；
 * - `evicted`：没有 manifest，但有 `lastInstalledAt` → 桶被单独清掉 / 迁移异常；
 * - `partial`：manifest 在，但某件缺失或尺寸戳对不上 → 半份 / 被改坏；
 * - `unavailable`：拿不到 Cache Storage（隐私模式等）。
 *
 * @param {string[]} [keys] 默认三件套；语义悬停只关心 clang + sysroot
 * @param {{ lastInstalledAt?: number }} [options] Worker 里没有 localStorage，由页面把痕迹传进来
 * @returns {Promise<{status: 'ready'|'not-installed'|'evicted'|'partial'|'unavailable', missing: string[], manifest: object|null, assets: Array<object>}>}
 */
export async function inspectToolchain(keys = TOOLCHAIN_ASSET_KEYS, { lastInstalledAt } = {}) {
  const manifest = await readCachedManifest()
  if (!manifest) {
    const hinted = lastInstalledAt === undefined ? readLastInstalledAt() : lastInstalledAt
    return {
      status: hinted ? 'evicted' : 'not-installed',
      missing: [...keys],
      manifest: null,
      assets: [],
    }
  }
  const cache = await openToolchainCache()
  if (!cache) return { status: 'unavailable', missing: [...keys], manifest, assets: [] }

  const assets = await Promise.all(
    keys.map(async (key) => {
      const asset = manifest.assets.find((item) => item.key === key)
      const sizes = asset
        ? {
            url: asset.url,
            compressedSize: asset.compressedSize,
            uncompressedSize: asset.uncompressedSize,
          }
        : {}
      if (!asset) return { key, ok: false, reason: 'absent-from-manifest', ...sizes }
      const cached = await cache.match(asset.url)
      if (!cached) return { key, ok: false, reason: 'missing', ...sizes }
      const stamped = Number(cached.headers.get(STORAGE_SIZE_HEADER))
      const rawLength = cached.headers.get('content-length')
      const length = rawLength === null ? null : Number(rawLength)
      // `.gzbin` 由 toolchainStore 独占写入，必须带 x-cp-size 戳；旧 SW 重压过的条目
      // 没有这个头（见 openCachedAsset 的同一条防线），在这里同样算缺件。
      const sizeOk = Number.isFinite(stamped) && stamped === asset.compressedSize
      // content-length 在缓存实现里可能被丢掉；只要它存在，就必须与清单一致
      const lengthOk = length === null || !Number.isFinite(length) || length === asset.compressedSize
      return {
        key,
        ok: sizeOk && lengthOk,
        reason: sizeOk && lengthOk ? null : 'size-mismatch',
        ...sizes,
        stampedSize: Number.isFinite(stamped) ? stamped : null,
        contentLength: Number.isFinite(length) ? length : null,
        storageEncoding: cached.headers.get(STORAGE_ENCODING_HEADER),
      }
    }),
  )
  const missing = assets.filter((asset) => !asset.ok).map((asset) => asset.key)
  return {
    status: missing.length ? 'partial' : 'ready',
    missing,
    manifest,
    assets,
  }
}

/**
 * 轻量探针（日常「已就绪」判定）。**不读 body**，结论与 `inspectToolchain` 同一份逻辑。
 * @param {string[]} [keys] 默认三件套；语义悬停只关心 clang + sysroot
 * @returns {Promise<boolean>}
 */
export async function probeToolchain(keys = TOOLCHAIN_ASSET_KEYS) {
  return (await inspectToolchain(keys)).status === 'ready'
}

/** 旧格式资产是否都在桶里（老用户免重下的判据，只用于读取回退） */
export async function hasLegacyToolchain(keys = TOOLCHAIN_ASSET_KEYS) {
  const cache = await openToolchainCache()
  if (!cache) return false
  const results = await Promise.all(
    keys.map(async (key) => Boolean(await cache.match(LEGACY_ASSET_URLS[key]))),
  )
  return results.every(Boolean)
}

/**
 * 网络响应 → 可直接用的解压态 Response（Worker 的兜底路径也走这一份）。
 *
 * 一条硬边界：`.gzbin` 的响应**故意不带 Content-Encoding**（见 vercel.json 与
 * vite.config.js 的托管头），所以 body 是原始 gzip 字节，必须自己解。万一某个中间层
 * 擅自补了 `content-encoding: gzip`，浏览器已经替我们解过，这时绝不能再来一次 ——
 * 解两次的报错是 `incorrect header check`，看起来和「文件坏了」一模一样。
 *
 * @param {Response} response
 * @param {string} contentType 解压后的 MIME（application/wasm / application/x-tar）
 */
export function decodeNetworkAsset(response, contentType) {
  const headers = new Headers(response.headers)
  headers.set('content-type', contentType)
  headers.delete('content-length')
  const decoded = response.headers.get('content-encoding')
    ? response.body
    : response.body.pipeThrough(new DecompressionStream(STORAGE_ENCODING_GZIP))
  return new Response(decoded, { status: 200, statusText: 'OK', headers })
}

/**
 * 把桶里的条目还原成**解压态**的 Response。
 *
 * 读取顺序由调用方决定（新格式 → 旧 `.br` → 网络），这里只管「拿到一条缓存条目之后怎么解析」：
 * - 带 `x-cp-storage-encoding: gzip`（新 `.gzbin`，以及旧 SW 重压过的 `.br`）→ 流式解压；
 * - 没有这个头 → 旧 SW 之前落下的解压态，原样返回。
 *
 * 构造新 Response 时**必须重设 `Content-Type`**：`.gzbin` 在桶里是
 * `application/octet-stream`，而 `WebAssembly.compileStreaming` 只认 `application/wasm`。
 *
 * @param {string} url
 * @param {string} contentType 解压后的 MIME（application/wasm / application/x-tar）
 * @returns {Promise<Response | null>}
 */
export async function openCachedAsset(url, contentType) {
  const cache = await openToolchainCache()
  if (!cache) return null
  const cached = await cache.match(url)
  if (!cached) return null
  // 升级窗口的防线（2026-11-22）：线上旧版 SW 是按 `/wasm/` **前缀**拦截的，
  // 它不认识 `.gzbin`，会把这份 body 再用 CompressionStream 压一遍、删掉 content-length，
  // 并且它自己的 waitUntil 可能在本页校验通过之后才落盘、反向覆盖同一个 key。
  // 新格式条目缺 `x-cp-size` 就说明它不是我写的 —— 直接当没有，让调用方回退网络，
  // 绝不能把双层 gzip 喂给 compileStreaming（那会报一句无法定位的 magic word 错）。
  if (isManagedAssetURL(url) && !cached.headers.get(STORAGE_SIZE_HEADER)) return null
  return decodeCachedAsset(cached, contentType)
}

/** 这个 URL 是否属于新格式（由 toolchainStore 独占写入、必须带 x-cp-size 戳） */
function isManagedAssetURL(url) {
  return TOOLCHAIN_ASSET_KEYS.some((key) => TOOLCHAIN_ASSET_URLS[key] === url)
}

/**
 * @param {Response} cached
 * @param {string} contentType
 */
export function decodeCachedAsset(cached, contentType) {
  const headers = new Headers(cached.headers)
  headers.delete(STORAGE_ENCODING_HEADER)
  headers.delete(STORAGE_SIZE_HEADER)
  headers.delete('content-length')
  headers.delete('content-encoding')
  headers.set('content-type', contentType)
  const decoded =
    cached.headers.get(STORAGE_ENCODING_HEADER) === STORAGE_ENCODING_GZIP && cached.body
      ? cached.body.pipeThrough(new DecompressionStream(STORAGE_ENCODING_GZIP))
      : cached.body
  return new Response(decoded, { status: 200, statusText: 'OK', headers })
}

/** 按 key 取一件缓存的资产（新格式优先，旧格式回退），给 worker 用 */
export async function openToolchainAsset(key) {
  const contentType = ASSET_CONTENT_TYPES[key]
  const fresh = await openCachedAsset(TOOLCHAIN_ASSET_URLS[key], contentType)
  if (fresh) return fresh
  return openCachedAsset(LEGACY_ASSET_URLS[key], contentType)
}

/**
 * manifest 提交成功之后的旧条目回收（独立 try/catch，best-effort）。
 *
 * 只删这一代的三个 `.br` key：它们是旧链路写进来的 ~89MB 解压态（或旧 SW 重压过的
 * ~25MB gzip）。上一代目录由 `pruneLegacyToolchainCache` 按前缀回收，不在这里处理。
 */
export async function deleteLegacyEntries() {
  try {
    const cache = await openToolchainCache()
    if (!cache) return
    await Promise.all(
      TOOLCHAIN_ASSET_KEYS.map((key) => cache.delete(LEGACY_ASSET_URLS[key]).catch(() => false)),
    )
  } catch {
    /* 清理旧包失败不影响刚完成的下载 */
  }
}

/**
 * 收集一份**纯数据**的离线诊断快照（设置页「复制诊断 JSON」的唯一来源）。
 *
 * 为什么要它：真机（Firefox Android / iOS 主屏）出问题时，最关键的三个事实都在
 * 页面里而不在界面上 —— SW 是不是接管了、有没有一个旧 SW 正在 waiting、以及
 * Cache Storage 里的三件套到底长得什么样。让用户接 USB 调试太贵，这里直接打包成
 * 一段可复制的 JSON。
 *
 * 只读、不修任何状态：拿不到的项目就地记 null，别让一个 API 缺失把整份报告废掉。
 *
 * @param {{ workerUrl?: string }} [options] `WasiWorkerHost` 用的 worker 脚本地址（client.js 导出）
 */
export async function collectToolchainDiagnostics({ workerUrl = '' } = {}) {
  const report = {
    generatedAt: new Date().toISOString(),
    userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
    serviceWorker: {
      supported: false,
      // 分开记：controller 是「当前页面归谁管」，waiting 是「有个旧版本正等着接班」。
      // 升级窗口里的故障必须靠这两项一眼分开，合成一个布尔就看不出来了。
      controller: null,
      waiting: null,
      installing: null,
      active: null,
      scope: null,
    },
    storage: {
      persisted: null,
      usage: null,
      quota: null,
      lastInstalledAt: readLastInstalledAt() || null,
    },
    worker: {
      url: workerUrl || null,
      cached: null,
    },
    toolchain: {
      status: 'unknown',
      missing: [],
      legacyCached: null,
      manifest: null,
      assets: [],
    },
  }

  try {
    const container = typeof navigator === 'undefined' ? null : navigator.serviceWorker
    if (container) {
      report.serviceWorker.supported = true
      report.serviceWorker.controller = Boolean(container.controller)
      const registration = await container.getRegistration?.()
      if (registration) {
        report.serviceWorker.waiting = Boolean(registration.waiting)
        report.serviceWorker.installing = Boolean(registration.installing)
        report.serviceWorker.active = Boolean(registration.active)
        report.serviceWorker.scope = registration.scope ?? null
      } else {
        report.serviceWorker.waiting = false
        report.serviceWorker.installing = false
        report.serviceWorker.active = false
      }
    }
  } catch {
    /* 隐私模式 / 不支持的浏览器：保持 null，报告里能看出来 */
  }

  try {
    const storage = typeof navigator === 'undefined' ? null : navigator.storage
    if (storage?.persisted) report.storage.persisted = await storage.persisted()
    if (storage?.estimate) {
      const estimate = await storage.estimate()
      report.storage.usage = Number.isFinite(estimate?.usage) ? estimate.usage : null
      report.storage.quota = Number.isFinite(estimate?.quota) ? estimate.quota : null
    }
  } catch {
    /* 同上 */
  }

  if (workerUrl && typeof caches !== 'undefined') {
    try {
      report.worker.cached = Boolean(await caches.match(workerUrl))
    } catch {
      report.worker.cached = null
    }
  }

  try {
    const inspection = await inspectToolchain()
    report.toolchain.status = inspection.status
    report.toolchain.missing = inspection.missing
    report.toolchain.legacyCached = await hasLegacyToolchain()
    report.toolchain.manifest = inspection.manifest
      ? {
          version: inspection.manifest.version,
          format: inspection.manifest.format,
          createdAt: inspection.manifest.createdAt ?? null,
          assets: inspection.manifest.assets,
        }
      : null
    report.toolchain.assets = inspection.assets
  } catch (error) {
    report.toolchain.status = 'error'
    report.toolchain.error = String(error?.message ?? error)
  }

  return report
}
