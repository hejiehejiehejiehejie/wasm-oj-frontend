/**
 * cfClient —— 主线程侧的 Codeforces Worker 客户端。
 *
 * 只做三件事：单例 Worker 的生命周期、「发一条消息 / 等它回」包成 Promise、
 * 把 Worker 主动推的进度转发给订阅者。业务语义（筛选条件怎么来的、结果长什么样）
 * 不在这一层 —— 它只保证「postMessage 出去，resolve/reject 回来」这条信道可靠。
 *
 * 【Worker 必须惰性创建】不 import 本模块就永远不 new Worker：抽题是可选组件，
 * 没下载 / 没用过的用户不该平白多起一个后台线程。
 *
 * 【为什么 worker 的 URL 写死在 new Worker(...) 里，不抽成常量】
 * Vite 只在 `new Worker(new URL('...', import.meta.url))` **成对字面量出现**时才认得这是
 * 一个 worker 入口，从而 dev 按模块直出、build 单独打成一个 chunk。一旦把 URL 存进
 * 常量再传进来，构建期就分析不到，产物里会留一个指向不存在文件的 Worker —— 本地不报错，
 * 上线才 404。所以这一行必须原样保留这种写法。
 *
 * 【Worker 崩了怎么办】onerror 里把所有在途请求一起失败掉。否则调用方的
 * `await cfPick(...)` 会永远挂着，界面就卡在「抽取中…」再也不会变。
 */
/** @type {Worker | null} */
let worker = null
let nextId = 1
/** @type {Map<number, { resolve: (value: any) => void, reject: (error: Error) => void }>} */
const pending = new Map()
/** @type {Set<(stage: string) => void>} */
const progressListeners = new Set()

/** 把 Worker 回的失败信封翻成一个带 code 的 Error，调用方据此分辨 NO_MATCH / 网络错误 */
function toError(message) {
  const error = new Error(message?.message || message?.code || 'Codeforces request failed')
  error.code = message?.code || 'ERROR'
  return error
}

/** 让所有在途请求一起失败（Worker 崩了 / 被销毁时） */
function failAll(error) {
  const entries = [...pending.values()]
  pending.clear()
  for (const entry of entries) entry.reject(error)
}

function ensureWorker() {
  if (worker) return worker

  worker = new Worker(new URL('../cf/cfWorker.js', import.meta.url), { type: 'module' })

  worker.onmessage = (event) => {
    const message = event.data
    if (!message || typeof message !== 'object') return

    // 主动推送的进度：不是响应，不进 pending 表
    if (message.type === 'progress') {
      for (const listener of progressListeners) listener(message.stage)
      return
    }

    const entry = pending.get(message.id)
    if (!entry) return
    pending.delete(message.id)
    if (message.ok) entry.resolve(message)
    else entry.reject(toError(message))
  }

  worker.onerror = (event) => {
    const error = new Error(event?.message || 'Codeforces worker error')
    error.code = 'WORKER_ERROR'
    // 崩溃的 Worker 已经不可用，丢掉引用，下次请求重新起一个
    worker = null
    failAll(error)
  }

  return worker
}

/**
 * 发一条请求并等响应。
 * @param {Record<string, unknown>} payload 至少含 type
 * @returns {Promise<any>} 响应信封（含 ok:true 与各 type 自己的字段）
 */
function request(payload) {
  const target = ensureWorker()
  const id = nextId
  nextId += 1
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    target.postMessage({ id, ...payload })
  })
}

/**
 * 订阅 Worker 进度。stage 是机器码，文案由调用方翻译。
 * @param {(stage: string) => void} listener
 * @returns {() => void} 取消订阅
 */
export function onCfProgress(listener) {
  progressListeners.add(listener)
  return () => progressListeners.delete(listener)
}

/** 缓存状态：题库有没有、多少道、什么时候拉的 */
export function cfStatus() {
  return request({ type: 'status' })
}

/** 预取题库（组件「下载」时调用）；force=true 无视缓存重拉 */
export function cfPrefetch({ force = false } = {}) {
  return request({ type: 'prefetch', force })
}

/** 抽题。失败时 reject 的 Error.code 可能是 NO_MATCH / WORKER_ERROR / ERROR */
export function cfPick(filters) {
  return request({ type: 'pick', filters })
}

/**
 * 校验若干 CF 账号是否存在，resolve `{ results: [{ handle, valid, reason }] }`。
 * reason ∈ `'ok' | 'not_found' | 'network'`；**账号不存在不会 reject**
 * （那是业务结论不是故障），只有 Worker 本身出事才会 reject。
 * 字段叫 valid 不叫 ok，是为了跟信封的 ok（这次调用成没成功）区分开，见 cfWorker.js。
 * @param {string[]} handles
 */
export function cfCheckHandles(handles) {
  return request({ type: 'checkHandles', handles })
}

/** 清空本地缓存（卸载组件） */
export function cfClear() {
  return request({ type: 'clear' })
}

/** 关掉 Worker（卸载组件 / 页面卸载）。在途请求一律失败，避免留下悬挂的 await */
export function disposeCfClient() {
  if (!worker) return
  worker.terminate()
  worker = null
  failAll(Object.assign(new Error('Codeforces worker disposed'), { code: 'DISPOSED' }))
}
