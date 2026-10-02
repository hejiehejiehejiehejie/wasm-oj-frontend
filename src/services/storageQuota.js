/**
 * 浏览器存储的三件事：申请「持久化」、读「已用 / 配额」、拆「占用明细」。都只有这一个出口。
 *
 * - 持久化是**隐性**的：IndexedDB 默认 best-effort，空间吃紧时浏览器能在不通知页面的情况下
 *   清掉整个源 —— 对本站来说就是 cp-vfs 里的全部代码。启动时静默申请一次（见 App.vue），
 *   拿不拿得到都不打扰用户，界面上也不展示这个状态。
 *   Chrome 按站点参与度自动批，Firefox 要用户点一下授权，Safari 至今不实现 —— 所以申请不到
 *   不是错误，只是没拿到（返回 false 即可，别当异常往上抛）。
 *
 * - 配额：storage.estimate() 的 usage / quota 是**整个源**的占用，含工具链与外壳缓存，
 *   不只是用户代码 —— 界面上按这个口径写。
 *
 * - 明细见 readStorageBreakdown()。它慢（要遍历缓存条目与本地数据库），只在用户主动
 *   展开时才该被调用，别塞进任何常驻的刷新路径。
 *
 * 全程不抛：这些 API 在隐私模式、老浏览器上可能整个不存在，调用方不该为此写 try/catch。
 */

import {
  CF_DB_NAME,
  LEGACY_BUCKETS,
  LEGACY_PCH_DB_NAME,
  LEGACY_VFS_DB_NAME,
  MD_CACHE,
  PCH_DB_NAME,
  SHELL_CACHE,
  TOOLCHAIN_CACHE,
  VFS_DB_NAME,
} from './storageNames.js'

/** 拿到 StorageManager；隐私模式或老浏览器上没有 navigator.storage */
function storageManager() {
  return typeof navigator === 'undefined' ? undefined : navigator.storage
}

/**
 * 申请持久化。幂等：已持久化时直接返回 true，不会重复弹窗。
 * 调用方通常不关心结果（隐性申请），留着返回值只是为了可测。
 * @returns {Promise<boolean>} 申请后是否处于持久化状态
 */
export async function requestPersistence() {
  const storage = storageManager()
  if (!storage?.persist) return false
  try {
    if (await storage.persisted()) return true
    return await storage.persist()
  } catch {
    return false
  }
}

/**
 * 读已用 / 配额（字节）。estimate() 取不到时回 null 而不是 0 —— 0 会被读成「一点都没用」，
 * 界面据此把这一行收起来。
 */
export async function readStorageUsage() {
  const storage = storageManager()
  if (!storage?.estimate) return { usage: null, quota: null }
  try {
    const estimate = await storage.estimate()
    return {
      usage: Number.isFinite(estimate?.usage) ? estimate.usage : null,
      quota: Number.isFinite(estimate?.quota) ? estimate.quota : null,
    }
  } catch {
    return { usage: null, quota: null }
  }
}

// ---------------------------------------------------------------- 占用明细
//
// 【为什么总量与分类是两套口径】estimate().usage 是浏览器给的权威值，但它只把占用拆到
// caches / indexedDB 两级，没有「哪个缓存桶、哪个库各占多少」的接口。所以总量取 usage
// （不撒谎），分类靠我们自己量：
// - Cache Storage：逐条累加 Content-Length（拿不到就按流数一遍），桶名 → 类别见下表；
// - IndexedDB：没有体积接口，开库逐条按记录内容估一个大小。
// 两者都与真实值有出入，差额连同外壳缓存一并并进 'other' 段 —— 条状图因此永远是
// 100% = usage，既不缺一块也不会溢出去。

/**
 * 缓存桶 → 类别。LEGACY_BUCKETS 里的旧桶名一并归到各自的目标桶名下：
 * 不认旧名的话，改名后残留的旧桶会被算进「其它」，用户看着像凭空多出来一块。
 *
 * 工具链桶先落到中间名 'toolchain'，再由 cacheCategory() 按资产路径拆成 C++ 与 Python ——
 * 一个桶里混装两套运行时，而界面上它们分列在「本地运行环境」的两条。
 * 外壳桶显式归到 'other'：它装的是构建产物，和用户资产无关。
 */
const CACHE_CATEGORY = new Map([
  [TOOLCHAIN_CACHE, 'toolchain'],
  [MD_CACHE, 'markdown'],
  [SHELL_CACHE, 'other'],
])
for (const [legacy, current] of LEGACY_BUCKETS) {
  const id = CACHE_CATEGORY.get(current)
  if (id) CACHE_CATEGORY.set(legacy, id)
}

/**
 * 工具链桶里两套运行时按路径分家：`/wasm/python-<版本>/` 下是 CPython，
 * 其余（`/wasm/<clang 版本>/` 下的 clang.wasm / wasm-ld.wasm / clang-fs.tar.gz）是 C++。
 */
function TOOLCHAIN_SPLIT(url) {
  return url.includes('python') ? 'python' : 'cpp'
}

/** 一条缓存响应属于哪一类；认不出的桶一律进「其它」，不让它凭空消失。 */
function cacheCategory(bucket, url) {
  const id = CACHE_CATEGORY.get(bucket)
  if (id === 'toolchain') return TOOLCHAIN_SPLIT(url)
  return id ?? 'other'
}

/** IndexedDB 库 → 类别。旧库名同样归到现名那一类（它们装的是同一批数据）。 */
const DB_CATEGORY = new Map([
  [VFS_DB_NAME, 'code'],
  [LEGACY_VFS_DB_NAME, 'code'],
  // 预编译头是 C++ 编译加速的一部分，和 clang 工具链算同一类（卸载说明里也是这么讲的）
  [PCH_DB_NAME, 'cpp'],
  [LEGACY_PCH_DB_NAME, 'cpp'],
  [CF_DB_NAME, 'cf'],
])

/** 明细的固定顺序：跟着设置 › 应用 的分区走（本地运行环境三条 → 组件 → 我的代码 → 其它） */
const BREAKDOWN_ORDER = ['cpp', 'python', 'markdown', 'cf', 'code', 'other']

/**
 * 一条缓存响应的字节数。优先用 Content-Length（响应头里现成的）；拿不到才按流读一遍
 * 数字节 —— **不整份读进内存**，工具链桶里有 52MB 的 clang，一次 arrayBuffer() 就是一场事故。
 */
async function responseBytes(response) {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > 0) return declared
  const body = response.body
  if (!body) return 0
  const reader = body.getReader()
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
  }
  return total
}

/** 逐条量一个缓存桶，按类别汇总。单条读不出来就跳过：差额最后由「其它」兜住。 */
async function measureCache(name) {
  const sizes = new Map()
  let cache
  let requests
  try {
    cache = await caches.open(name)
    requests = await cache.keys()
  } catch {
    return sizes
  }
  for (const request of requests) {
    try {
      const response = await cache.match(request)
      if (!response) continue
      const bytes = await responseBytes(response)
      if (!(bytes > 0)) continue
      const id = cacheCategory(name, request.url)
      sizes.set(id, (sizes.get(id) ?? 0) + bytes)
    } catch {
      /* 这条量不了，跳过 */
    }
  }
  return sizes
}

/**
 * 各类别的缓存字节数（跨桶汇总：工具链桶里的 C++ 与 Python 会分成两条）。
 * 只 open `caches.keys()` 报出来的桶名 —— caches.open() 对不存在的桶是**新建**，
 * 挨个点名会把空桶创建出来。
 * @returns {Promise<Map<string, number>>}
 */
async function measureCaches() {
  const sizes = new Map()
  if (typeof caches === 'undefined' || !caches.keys) return sizes
  let names = []
  try {
    names = await caches.keys()
  } catch {
    return sizes
  }
  for (const name of names) {
    for (const [id, bytes] of await measureCache(name)) {
      sizes.set(id, (sizes.get(id) ?? 0) + bytes)
    }
  }
  return sizes
}

/** 不带版本号开库：带版本可能触发 onupgradeneeded，拿低版本开高版本的库还会直接失败 */
function openExistingDatabase(name) {
  return new Promise((resolve) => {
    let request
    try {
      request = indexedDB.open(name)
    } catch {
      resolve(null)
      return
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = request.onblocked = () => resolve(null)
  })
}

/** 一次取回整个 store；失败当空 */
function readAll(db, storeName) {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readonly')
      const request = tx.objectStore(storeName).getAll()
      tx.oncomplete = () => resolve(request.result ?? [])
      tx.onabort = tx.onerror = () => resolve([])
    } catch {
      resolve([])
    }
  })
}

/**
 * 记录体积的近似值：字符串按字符数（单字节编码下 ≈ 字节数）、二进制按真实字节数，
 * 其余按各字段递归累加。**不是**浏览器给的权威值 —— PCH 那种
 * `{ id, bytes: Uint8Array, ... }` 靠这一层才不会把 6.9MB 的字节数组读成 `{}` 的 2 字节。
 */
function estimateBytes(value, depth = 0) {
  if (value == null) return 8
  const type = typeof value
  if (type === 'string') return value.length
  if (type === 'number' || type === 'boolean') return 8
  if (type === 'bigint') return 16
  if (typeof Blob !== 'undefined' && value instanceof Blob) return value.size
  if (value instanceof ArrayBuffer) return value.byteLength
  if (ArrayBuffer.isView(value)) return value.byteLength
  // 题库那种一万多条记录的大数组够深了，再往下的边际收益抵不上遍历成本
  if (depth >= 8) return 0
  if (Array.isArray(value)) {
    let total = 0
    for (const item of value) total += estimateBytes(item, depth + 1)
    return total
  }
  if (type === 'object') {
    let total = 0
    for (const key of Object.keys(value)) total += key.length + estimateBytes(value[key], depth + 1)
    return total
  }
  return 0
}

/** 单个库的近似体积 */
async function measureDatabase(name) {
  const db = await openExistingDatabase(name)
  if (!db) return 0
  let bytes = 0
  try {
    for (const storeName of Array.from(db.objectStoreNames)) {
      for (const record of await readAll(db, storeName)) bytes += estimateBytes(record)
    }
  } finally {
    db.close()
  }
  return bytes
}

/**
 * 每个 IndexedDB 库的近似体积。
 *
 * `indexedDB.databases()` 不支持的浏览器（Firefox 至今没有）就直接不拆：宁可这几项
 * 并进「其它」，也不能为了量体积去 open 一个库 —— 那会把并不存在的空库创建出来。
 * @returns {Promise<Map<string, number>>}
 */
async function measureDatabases() {
  const sizes = new Map()
  if (typeof indexedDB === 'undefined' || !indexedDB.databases) return sizes
  let list = []
  try {
    list = await indexedDB.databases()
  } catch {
    return sizes
  }
  for (const entry of list) {
    const name = entry?.name
    if (name) sizes.set(name, await measureDatabase(name))
  }
  return sizes
}

/**
 * 读占用明细。总量取 estimate().usage 的权威值，分类按上面的办法自己量：量出来的
 * 每一桶 / 每一库先放回「缓存」「本地数据库」这两级（usageDetails）里等比校正，再让
 * 'other' 兜住剩下的差额 —— 条状图因此永远是 100% = usage。
 *
 * 【为什么 'other' 不能丢】它兜住的正是「找不到明确归属」的那部分（外壳桶、以及浏览器
 * 计进这两级但没被我们量到的开销）。上一版会在估算偏高时把 'other' 直接压成 0 再被
 * 过滤掉，用户看到的就是「外壳与其它」整段消失 —— 现在它永远在，最小值是实测到的
 * 外壳桶体积。
 *
 * 拿不到总量、或总量为 0 时返回 null —— 界面据此把整块收起。
 *
 * 【为什么是慢函数】要遍历每个缓存桶的每一条响应、还要开库遍历记录。只在用户主动
 * 展开时调一次，别放进任何常驻刷新路径。
 *
 * @returns {Promise<{ total: number, entries: { id: string, bytes: number }[] } | null>}
 */
export async function readStorageBreakdown() {
  const storage = storageManager()
  if (!storage?.estimate) return null
  let estimate = null
  try {
    estimate = await storage.estimate()
  } catch {
    return null
  }
  const usage = Number.isFinite(estimate?.usage) ? estimate.usage : null
  if (!usage || usage <= 0) return null

  const cacheSizes = await measureCaches()
  const dbSizes = await measureDatabases()

  /**
   * 一组实测值按该级的权威预算等比缩一下。浏览器给的 usageDetails.caches / .indexedDB
   * 是权威的，我们逐条估出来的总和可能偏高（IndexedDB 尤其），不缩的话条状图会顶出 100%。
   * 拿不到预算（Firefox 等没有 usageDetails）就用实测总和当预算，这一级等于不缩。
   */
  function fitToBudget(group, budget) {
    const measured = [...group.values()].reduce((sum, value) => sum + value, 0)
    if (!(measured > 0) || !(budget > 0) || measured <= budget) return group
    const ratio = budget / measured
    const scaled = new Map()
    for (const [name, bytes] of group) scaled.set(name, bytes * ratio)
    return scaled
  }

  /** @type {Map<string, number>} */
  const sizes = new Map()
  const add = (id, bytes) => {
    if (!id || !Number.isFinite(bytes) || bytes <= 0) return
    sizes.set(id, (sizes.get(id) ?? 0) + bytes)
  }

  const details = estimate.usageDetails ?? {}
  const sumOf = (group) => [...group.values()].reduce((sum, value) => sum + value, 0)
  for (const [id, bytes] of fitToBudget(cacheSizes, details.caches ?? sumOf(cacheSizes))) {
    add(id, bytes)
  }
  for (const [name, bytes] of fitToBudget(dbSizes, details.indexedDB ?? sumOf(dbSizes))) {
    add(DB_CATEGORY.get(name) ?? 'other', bytes)
  }

  const named = BREAKDOWN_ORDER.filter((id) => id !== 'other').map((id) => ({
    id,
    bytes: sizes.get(id) ?? 0,
  }))
  const otherMeasured = sizes.get('other') ?? 0

  // 命名分类先封顶在「总量扣掉其它」上，超出就整体缩回去：两级预算之和不会超过 usage，
  // 但个别项的估算仍可能互相打架。
  const namedMeasured = named.reduce((sum, entry) => sum + entry.bytes, 0)
  const budget = Math.max(0, usage - otherMeasured)
  if (namedMeasured > budget) {
    const ratio = budget / namedMeasured
    for (const entry of named) entry.bytes *= ratio
  }
  const namedTotal = named.reduce((sum, entry) => sum + entry.bytes, 0)
  // 差额归「其它」；它至少是实测到的外壳桶体积，绝不小于 0
  const other = Math.max(otherMeasured, usage - namedTotal)

  const entries = named.filter((entry) => entry.bytes > 0)
  // 'other' 永远保留：用户要能看见外壳占了多少，哪怕这一份此刻就是 0
  entries.push({ id: 'other', bytes: other })

  return {
    total: entries.reduce((sum, entry) => sum + entry.bytes, 0),
    entries,
  }
}