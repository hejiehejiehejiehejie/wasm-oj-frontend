import { onBeforeUnmount, ref } from 'vue'

import { findProblemByUrl, problemUrlKey } from '../services/vfs/workspaceStore.js'

/**
 * 浏览器扩展（改造版 Competitive Companion）的网页接收端。
 *
 * 扩展拿不到网页的 JS 作用域，所以它在目标网站里注入一个内容脚本做桥接
 * （cph-companion 的 src/bridge.ts），用 window.postMessage 中转这几种消息：
 *   - cp-task：扩展把解析出来的题目 JSON 推过来
 *   - cp-ping / cp-info：网页主动握手，问扩展「装没装、版本号多少、快捷键绑了什么」
 *   - cp-set-config / cp-config：网页改投递目标开关
 *   - cp-query-need / cp-need-answer：扩展问「这道题要不要抓样例」，网页作答（见下）
 *
 * 这几个消息名是**跨仓契约**（2026-10-01 与扩展一起从 `cph-` 前缀改成 `cp-`）：
 * 改了任何一条都必须同步改 cph-companion 并发新版插件，否则新旧两边互相认不出、
 * 抓题直接失联。下一行的 EXTENSION_SOURCE 是扩展侧的来源标识，不属于这批消息名。
 *
 * 状态放模块级是刻意的：扩展是否已安装是全局事实，设置面板和 App 应当看到同一份结果，
 * 不该每个组件各探一次（多次探测还会互相覆盖 currentRequestId）。
 */

const PAGE_SOURCE = 'cp-page'
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

/** 改配置的回执超时：扩展开着通常几毫秒就回 */
const CONFIG_TIMEOUT = 1000
/**
 * 答完「要抓」之后等题目投递回来的上限。
 * 扩展侧等样例渲染最多 20s（cph-companion 的 autoParse.ts），再加上解析与投递，
 * 留 10s 余量；超过就认定这一趟空手而归，界面上转成「重开页面可再试」。
 */
const SCRAPE_TIMEOUT = 30000

const taskHandlers = new Set()
const seenTaskIds = new Set()

let pingSeq = 0
let pingTimers = []
let currentRequestId = null
let attached = false

let configSeq = 0
/** requestId -> { resolve, timer }：等待扩展对某次改配置的确认 */
const pendingConfigs = new Map()

function clearPingTimers() {
  for (const timer of pingTimers) window.clearTimeout(timer)
  pingTimers = []
}

function sendPing() {
  currentRequestId = `cp-ping-${++pingSeq}`
  window.postMessage(
    { source: PAGE_SOURCE, type: 'cp-ping', requestId: currentRequestId },
    window.location.origin,
  )
}

/** 主动问一次扩展：装没装、版本号、快捷键绑定 */
export function refreshExtensionInfo() {
  clearPingTimers()
  // 刻意**不**先清空 extensionInfo：设置面板里那一整块（投递开关、快捷键）挂在
  // v-if="extensionInfo" 上，清空会让它整块消失再长回来 —— 每次切到「应用」栏都闪一下。
  // 探活要「不知道就说不知道」这件事由 checking 承担（状态行显示「检测中」），
  // 快照本身留到有结论再换：探到就换成新的一份，探不到才置 null
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
        extensionInfo.value = null
      },
      PING_DELAYS[PING_DELAYS.length - 1] + PING_TIMEOUT,
    ),
  )
}

/**
 * 让扩展改一个投递目标开关（sendToWebPage / sendToLocalTools）。
 * 回执 cp-config 到达后就地更新 extensionInfo.value.config —— 刻意不重跑 refresh，
 * 否则设置面板会闪一下「检测中」。返回是否写成功。
 */
export function setExtensionConfig(key, value) {
  return new Promise((resolve) => {
    if (!extensionInfo.value) {
      resolve(false)
      return
    }

    const requestId = `cp-set-${++configSeq}`
    const timer = window.setTimeout(() => {
      pendingConfigs.delete(requestId)
      resolve(false)
    }, CONFIG_TIMEOUT)

    pendingConfigs.set(requestId, { resolve, timer })
    window.postMessage(
      { source: PAGE_SOURCE, type: 'cp-set-config', requestId, key, value },
      window.location.origin,
    )
  })
}

// ------------------------------------------------------- 自动抓取样例
//
// 【为什么不存名单】早先的做法是：导入时把「没带样例的题」记成一份名单推给扩展，用户之后
// 打开题目页时扩展照名单抓。但名单有两份、各存各的，谁丢一次账就对不上；而且「这道题还要不要
// 样例」这个判断只有工作区答得出来 —— 扩展看不见工作区。所以 2026-10-01 起改成**不存名单**：
// 扩展每打开一个题目页就问一句（cp-query-need），这边按「工作区里认得出这道题、且它的样例
// 还是空的」当场作答，答案只活在这一问一答里。
//
// 这里记的只是本题会话的**过程状态**，供评测面板空态显示；刷新页面即可丢掉，不落盘。

/** 已答「要抓」、题目还没投递回来的题目键 */
const scrapingKeys = ref([])
/** 答了「要抓」但等到超时也没等到样例的题目键（下次重开题目页会重新走一遍） */
const failedKeys = ref([])

/** 题目键 -> 超时计时器。按题各记一个：同站开两个题目页时互不干扰 */
const scrapeTimers = new Map()

/** 这道题此刻的自动抓取状态，给评测面板空态用：'fetching' | 'failed' | ''（无事发生） */
export function autoScrapeState(url) {
  const key = problemUrlKey(url)
  if (!key) return ''
  if (scrapingKeys.value.includes(key)) return 'fetching'
  if (failedKeys.value.includes(key)) return 'failed'
  return ''
}

/** 工作区里这道题还在等样例吗（认题与判空都在这儿，答给扩展用） */
function needsSamples(url) {
  const node = findProblemByUrl(url)
  if (!node) return false

  const tests = Array.isArray(node.config?.tests) ? node.config.tests : []
  return tests.length === 0
}

function beginScraping(key) {
  if (!scrapingKeys.value.includes(key)) scrapingKeys.value = [...scrapingKeys.value, key]
  failedKeys.value = failedKeys.value.filter((item) => item !== key)

  window.clearTimeout(scrapeTimers.get(key))
  scrapeTimers.set(
    key,
    window.setTimeout(() => {
      scrapeTimers.delete(key)
      scrapingKeys.value = scrapingKeys.value.filter((item) => item !== key)
      if (!failedKeys.value.includes(key)) failedKeys.value = [...failedKeys.value, key]
    }, SCRAPE_TIMEOUT),
  )
}

/**
 * 题目投递回来了：这道题要是正等着抓样例，就把过程状态收干净。
 * 只在**确实带了样例**时才算办妥 —— 手动按快捷键抓一道本来就没样例的题不该销掉失败标记。
 */
function settleScraping(task) {
  const url = typeof task?.url === 'string' ? task.url : ''
  if (!url || !Array.isArray(task.tests) || task.tests.length === 0) return

  // 按题认，不按字符串：投递回来的地址可能是 /problemset/problem/…，而记的时候是
  // 抽题面板给的 /contest/…/problem/…（两者是同一道题，见 workspaceStore 的 problemUrlKey）
  const key = problemUrlKey(url)
  if (!key || !scrapeTimers.has(key)) return

  window.clearTimeout(scrapeTimers.get(key))
  scrapeTimers.delete(key)
  scrapingKeys.value = scrapingKeys.value.filter((item) => item !== key)
  failedKeys.value = failedKeys.value.filter((item) => item !== key)
}

/**
 * 答扩展那一问（cp-query-need → cp-need-answer）。
 *
 * 答「要」就在这里起一个超时计时：扩展开着的时候未必抓得到（样例一直没渲染出来、
 * 用户把页面关了），那种情况不该让面板永远停在「正在抓取」。
 */
function answerNeedQuery(data) {
  const url = typeof data.url === 'string' ? data.url : ''
  const key = url ? problemUrlKey(url) : ''
  const need = key !== '' && needsSamples(url)

  if (need) beginScraping(key)

  // postMessage 是结构化克隆，认不了响应式 Proxy —— 这里传的都是普通字符串 / 布尔，安全
  window.postMessage(
    { source: PAGE_SOURCE, type: 'cp-need-answer', queryId: data.queryId, need },
    window.location.origin,
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

  // 这道题正等着扩展补样例的话，到这里就算办妥了（handler 里 importProblem 会把它写进文件）
  settleScraping(task)

  for (const handler of taskHandlers) handler(task)
}

function onMessage(event) {
  // 只认本窗口、同源的消息：挡掉 iframe 与外部页面伪造
  if (event.source !== window || event.origin !== window.location.origin) return

  const data = event.data
  if (!data || data.source !== EXTENSION_SOURCE) return

  if (data.type === 'cp-task') {
    dispatchTask(data)
    return
  }

  // 扩展问「这个题目页要不要抓样例」：答案得当场给，所以同步答完就返回
  if (data.type === 'cp-query-need') {
    answerNeedQuery(data)
    return
  }

  if (data.type === 'cp-config') {
    const pending = pendingConfigs.get(data.requestId)
    if (!pending) return

    window.clearTimeout(pending.timer)
    pendingConfigs.delete(data.requestId)

    // 写成功才把新值并进快照，面板读的就是这份
    if (data.ok && extensionInfo.value) {
      extensionInfo.value = {
        ...extensionInfo.value,
        config: { ...extensionInfo.value.config, [data.key]: data.value },
      }
    }

    pending.resolve(Boolean(data.ok))
    return
  }

  if (data.type !== 'cp-info') return
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

  return { extensionInfo, checking, refresh: refreshExtensionInfo, setExtensionConfig }
}
