/**
 * 浏览器存储的两件事：申请「持久化」与读「已用 / 配额」。都只有这一个出口。
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
 * 全程不抛：这些 API 在隐私模式、老浏览器上可能整个不存在，调用方不该为此写 try/catch。
 */

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