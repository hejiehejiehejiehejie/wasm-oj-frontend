/**
 * backStack —— 装成 app 之后，系统「返回」在站内的去处（2026-10-30）。
 *
 * 【能拦的不是系统事件，是后退历史】Web 没有 `backbutton`（那是 Cordova / Capacitor 的私有
 * 事件）。Android 上装成 PWA 之后，返回键与边缘返回手势都是**先走 webview 的历史**，
 * 历史空了才退出 app —— 所以这里做的事就一件：让历史里永远压着一条「哨兵」，
 * 把用户那一次返回接成一次 `popstate`，再翻译成站内的关闭动作。
 * iOS 独立窗口没有返回键，`navigator.standalone` 那一条命中后机制空转，无害。
 *
 * 【只在独立窗口武装】浏览器标签页里 `Alt+←` 是用户真想回上一页，拦下来站不住脚。
 * 判据见 `isAppWindow()`；本项目的 manifest 是 `display_override: ["fullscreen"]`，
 * 安卓装出来匹配的是 `(display-mode: fullscreen)` 而不是 `standalone` —— 三个都要列，
 * 漏一个就等于「装了 app 但没生效」。
 *
 * 【一条栈，不是一层压一条历史】也考虑过「开一层 pushState 一条」那种天然对齐的做法，
 * 否决的理由是刷新：一条 history 条目会静默残留，用户下次打开按返回，浏览器吃掉一层什么
 * 都不发生；而且点遮罩关闭时还得主动 `back()` 造一次伪后退。栈自己维护最干净 ——
 * 历史里恒定只有一条哨兵，UI 的层数完全由下面这个数组说了算。
 *
 * 【两种层：栈层与兜底层】栈层是「开 / 关型」的（浮层 / 确认框 / 全屏 / 窄屏抽屉），
 * 返回键把它关掉、它那个状态随之变假、自己出栈；**兜底层不是开关，而是「还能往回退
 * 一步的路」**（CF 页内后退：`pointer` 退一格，退完往往还能再退），可以反复消费，
 * 所以不占栈位 —— 只在栈空时问，消费一次也不注销。
 *
 * 【哨兵不能覆盖 history.state】`services/cloudEntry.js` 已经在 state 里放了 `cpCloudEntry`
 * （`/<handle>` 那套，见那边的 ENTRY_STATE_KEY）。所以一律 `{ ...history.state, ... }`。
 *
 * 【返回键永远不退 app，是刻意的】栈底（没有层可关、兜底也不管）时同样把哨兵补回去，
 * 这一发返回就等于「什么都不发生」。退 app 走系统那条默认路 —— Android 从最近任务划掉、
 * 桌面端关窗口。之所以不给「再按一次退出」的放行分支：Web 上根本做不到（哨兵要先被弹掉，
 * 那一发必然先进 `popstate`），而「一按就退」在 app 里太容易误触 —— 用户正想在站内退一步，
 * 手重一下就没了。少一个出口，比多一个后悔药强。
 */
import { watch } from 'vue'

/** 压在哨兵条目上的标记。与 `cpCloudEntry` 并列存于 history.state，互不改写 */
const SENTINEL_KEY = 'cpBackSentinel'

const APP_WINDOW_QUERIES = [
  '(display-mode: standalone)',
  '(display-mode: fullscreen)',
  '(display-mode: minimal-ui)',
]

/** 层：`{ onBack }`，后进先出。数组尾部就是「最上面那一层」 */
const layers = []

/**
 * 兜底层：**不占栈位**，只在栈空时才有机会消费一次返回（`{ fn, priority }`）。
 *
 * 与栈层的区别是「可反复消费」：栈层被返回键消费一次就出栈了，而兜底层描述的是
 * 「还有没有可以往回退一步的路」—— CF 页内后退是 `pointer` 减一格，退完往往还能再退，
 * 塞进栈里一次就没了。按 `priority` 从大到小问，第一个返回 `true` 的算消费。
 */
const fallbacks = []

let armed = false

function isAppWindow() {
  if (typeof window === 'undefined') return false
  // 复核 / 探针用：浏览器标签页里带 ?backstack=1 也按「装成 app」跑一遍
  // （不加这个口子，这条功能在开发机上根本走不到）
  if (new URLSearchParams(window.location.search).has('backstack')) return true
  if (window.matchMedia && APP_WINDOW_QUERIES.some((query) => window.matchMedia(query).matches)) {
    return true
  }
  // iOS 添加到主屏：UA 依赖太多，标准出口只有这一个
  return window.navigator?.standalone === true
}

/** 要压进去的 state：保留原有键，只补自己的标记 */
function sentinelState() {
  const current = window.history.state
  const base = current && typeof current === 'object' ? current : {}
  return { ...base, [SENTINEL_KEY]: true }
}

/** 当前这一条是不是哨兵（刷新后靠它判断「已经压过了」） */
function hasSentinel() {
  const current = window.history.state
  return Boolean(current && typeof current === 'object' && current[SENTINEL_KEY])
}

/**
 * 压一条哨兵。
 *
 * 第三参数给 `location.href` 而不是省略：地址不变，但显式同源，避免个别 WebView
 * 把「空 url」当成一次真实跳转。跨源 / 沙箱拒绝时吞掉 —— 这一发不武装，
 * 比把异常抛进 `popstate` 里强。
 */
function pushSentinel() {
  try {
    window.history.pushState(sentinelState(), '', window.location.href)
  } catch {
    /* 拒绝就拒绝：返回键退回系统行为，站内功能不受影响 */
  }
}

/** 只在「武装过 + 当前条目已经不是哨兵」时补 —— 刷新后不能重复压，否则一层层叠上去 */
function ensureSentinel() {
  if (!armed || hasSentinel()) return
  pushSentinel()
}

/** 收到一次返回：先关最上层，栈空则问兜底；不管走哪条，哨兵都要补回去 */
function onPopState() {
  if (!armed) return
  try {
    // 先出栈再关：`onBack` 内部常会同步翻一个标记，而那个标记的 watch 又要来注销自己 ——
    // 先 pop 掉，注销那一下按 indexOf 找不到条目，是幂等的
    const top = layers.pop()
    if (top) {
      top.onBack()
      return
    }

    // 栈空：给兜底层一次机会（可反复消费，所以这一发被它吃掉之后照样补哨兵）
    runFallbacks()
  } finally {
    // 收在 finally 里，是为了让「永远不退 app」成为结构上的保证而不是各分支的自觉：
    // 层里那个 `onBack` 抛错、兜底抛错、哪个回调改了注册表，都不该把历史漏成空的 ——
    // 历史一空，下一次返回就归系统了，那就是「一按就退」。
    ensureSentinel()
  }
}

/**
 * 栈空时问兜底层。谁返回 `true` 谁就算消费了这一次，后面的不再问。
 * 兜底层自己不注销（可以反复消费），失效由它自己的判据负责。
 *
 * 不返回「有没有人接住」：接没接住对调用方的处理是一样的（都得把哨兵补回去），
 * 早先那个返回值现在没有读者，留着只会诱人去写「栈底才做点什么」的分支。
 */
function runFallbacks() {
  // 复制一份再遍历：兜底有可能在自己的 `fn` 里注销自己（比如「退到某一屏就不再管」），
  // 直接迭代原数组会把后面的条目跳过
  for (const entry of [...fallbacks]) {
    let handled = false
    try {
      handled = entry.fn()
    } catch (error) {
      // 某个兜底自己炸了不该连累整条返回链路：当作「不归我」，继续问下一个
      console.warn('[backStack] 兜底层报错，按「没接住」处理', error)
    }
    if (handled) return
  }
}

/**
 * 启动时武装一次。**必须在 `createApp().mount()` 之前调**：组件 setup 里
 * （`watchBackLayer` 的 `immediate`）可能立刻注册第一层，那时候栈得已经武装好，
 * 否则那一层永远注册不上（刷新时正停在全屏里的情形）。
 *
 * @returns {boolean} 这次到底有没有武装（浏览器标签页里是 false）
 */
export function armBackStack() {
  if (armed) return true
  if (!isAppWindow()) return false
  armed = true
  if (!hasSentinel()) pushSentinel()
  window.addEventListener('popstate', onPopState)
  return true
}

/**
 * 压一层「可关对象」。
 *
 * 只给**拥有生命周期的地方**调（浮层 composable、卡片组件的状态 watch），
 * 不许业务代码各自 `push` —— 注册与注销必须成对，漏一个注销就等于栈里留个幽灵条目，
 * 表现为「按了返回什么都没发生」。
 *
 * @param {() => void} onBack 这一层被返回键关掉时做什么
 * @returns {() => void} 注销函数（幂等）
 */
export function pushBackLayer(onBack) {
  if (!armed) return () => {}
  const entry = { onBack }
  layers.push(entry)
  // 层可能是在 `popstate` 那一发里同步打开的（这时哨兵刚被弹掉、`finally` 还没补回来），
  // 也可能是在哨兵被外部改写之后 —— 一次幂等的兜底，正常路径下是空转
  ensureSentinel()
  return () => {
    const index = layers.indexOf(entry)
    if (index >= 0) layers.splice(index, 1)
  }
}

/**
 * 注册一个**兜底**：栈空时才轮到它，而且可以反复消费。
 *
 * 用在「还有没有可以往回退一步的路」这类地方（目前只有 CF 页内后退）—— 它们不是
 * 「开 / 关型状态」，`watchBackLayer` 那套一进一出的模型套不上。
 *
 * ⚠️ **兜底必须自己判「此刻该不该管」**：它不占栈位，也就没有「入栈 / 出栈」帮它收窄
 * 时机。CF 面板是常驻挂载的（`v-show` 保状态），所以那边一定得带上 `active`。
 *
 * @param {() => boolean} fn 返回 `true` = 这一次我处理了；`false` = 不归我，问下一个
 * @param {number} [priority] 大的先问（同值时按注册顺序）
 * @returns {() => void} 注销函数（幂等）
 */
export function addBackFallback(fn, priority = 0) {
  if (!armed) return () => {}
  const entry = { fn, priority }
  fallbacks.push(entry)
  // 同优先级保持注册顺序（Array#sort 在现代引擎里是稳定的）
  fallbacks.sort((a, b) => b.priority - a.priority)
  // 兜底可能是在 `popstate` 那一发里注册的（栈空时才轮到它，注册完那一发还没补哨兵），
  // 同上一处，幂等兜底
  ensureSentinel()
  return () => {
    const index = fallbacks.indexOf(entry)
    if (index >= 0) fallbacks.splice(index, 1)
  }
}

/**
 * 把一个**开 / 关型**的状态接到返回键上：`source` 为真时入栈，为假时出栈。
 *
 * 用它而不是自己写 watch，是因为「出栈」这件事必须发生在状态变假的那一刻 ——
 * 不管那是返回键干的、Esc 干的、点遮罩干的，还是业务逻辑自己关的。
 *
 * @param {import('vue').WatchSource<boolean>} source
 * @param {() => void} onBack
 * @returns {() => void} 停表 + 出栈（组件卸载时调）
 */
export function watchBackLayer(source, onBack) {
  let release = null
  const stop = watch(
    source,
    (open) => {
      if (open && !release) {
        release = pushBackLayer(onBack)
        return
      }
      if (!open && release) {
        release()
        release = null
      }
    },
    { immediate: true },
  )
  return () => {
    stop()
    if (release) release()
    release = null
  }
}
