import { onBeforeUnmount, ref } from 'vue'

/**
 * 浏览器扩展（改造版 Competitive Companion）的网页接收端。
 *
 * 扩展拿不到网页的 JS 作用域，所以它在目标网站里注入一个内容脚本做桥接
 * （cph-companion 的 src/bridge.ts），用 window.postMessage 中转两种消息：
 *   - cph-task：扩展把解析出来的题目 JSON 推过来
 *   - cph-ping / cph-info：网页主动握手，问扩展「装没装、版本号多少、快捷键绑了什么」
 *
 * 状态放模块级是刻意的：扩展是否已安装是全局事实，设置面板和 App 应当看到同一份结果，
 * 不该每个组件各探一次（多次探测还会互相覆盖 currentRequestId）。
 */

const PAGE_SOURCE = 'cph-page'
const EXTENSION_SOURCE = 'competitive-companion'

/** 扩展开着的话通常几毫秒就回，超过这个时间就当没装 */
const PING_TIMEOUT = 500
/** 内容脚本只在页面加载时注入（manifest 里是 document_start）。
 *  扩展被重载过、页面一直没刷新时会失联，所以隔一段时间多探几次。 */
const PING_DELAYS = [0, 400, 1500]

/** null = 未检测到扩展 */
const extensionInfo = ref(null)
/** 正在探测。设置面板据此显示「检测中」，而不是一上来就断言「未安装」 */
const checking = ref(false)

const taskHandlers = new Set()
const seenTaskIds = new Set()

let pingSeq = 0
let pingTimers = []
let currentRequestId = null
let attached = false

function clearPingTimers() {
  for (const timer of pingTimers) window.clearTimeout(timer)
  pingTimers = []
}

function sendPing() {
  currentRequestId = `cph-ping-${++pingSeq}`
  window.postMessage(
    { source: PAGE_SOURCE, type: 'cph-ping', requestId: currentRequestId },
    window.location.origin,
  )
}

/** 主动问一次扩展：装没装、版本号、快捷键绑定 */
export function refreshExtensionInfo() {
  clearPingTimers()
  extensionInfo.value = null
  checking.value = true

  for (const delay of PING_DELAYS) {
    pingTimers.push(window.setTimeout(sendPing, delay))
  }

  // 最后一轮也超时没回音，就认定没装
  pingTimers.push(
    window.setTimeout(
      () => {
        checking.value = false
        currentRequestId = null
      },
      PING_DELAYS[PING_DELAYS.length - 1] + PING_TIMEOUT,
    ),
  )
}

function dispatchTask(data) {
  if (typeof data.payload !== 'string') return

  // 同站多开标签页时扩展会广播，按 taskId 去重，免得同一道题进两次
  if (data.taskId) {
    if (seenTaskIds.has(data.taskId)) return
    seenTaskIds.add(data.taskId)
  }

  let task
  try {
    task = JSON.parse(data.payload)
  } catch {
    return
  }

  for (const handler of taskHandlers) handler(task)
}

function onMessage(event) {
  // 只认本窗口、同源的消息：挡掉 iframe 与外部页面伪造
  if (event.source !== window || event.origin !== window.location.origin) return

  const data = event.data
  if (!data || data.source !== EXTENSION_SOURCE) return

  if (data.type === 'cph-task') {
    dispatchTask(data)
    return
  }

  if (data.type !== 'cph-info') return
  // 只认自己那一轮的握手回包（页面里可能有其它脚本也在 postMessage）
  if (data.requestId !== currentRequestId) return

  clearPingTimers()
  checking.value = false
  currentRequestId = null
  extensionInfo.value = data.info ?? null
}

function attach() {
  if (attached) return
  attached = true

  window.addEventListener('message', onMessage)
  // 挂上就先探一次，设置面板打开之前状态就已经就绪
  refreshExtensionInfo()
}

/**
 * 取用扩展状态；`onTask` 传了就顺便订阅解析结果。
 * 卸载时按函数引用自动退订。
 */
export function useCompanionBridge(onTask) {
  attach()

  if (onTask) {
    taskHandlers.add(onTask)
    onBeforeUnmount(() => taskHandlers.delete(onTask))
  }

  return { extensionInfo, checking, refresh: refreshExtensionInfo }
}
