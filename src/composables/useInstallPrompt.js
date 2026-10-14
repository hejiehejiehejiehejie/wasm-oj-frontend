import { computed, ref } from 'vue'

import { BROWSER } from '../services/platform.js'

/**
 * 引擎自己实现了 `beforeinstallprompt` 吗 —— **纯属性检测**，也是这个模块唯一「不可伪装」的
 * 一条原始事实。`beforeinstallprompt` 只在**满足可安装条件之后**才派发，所以「等不到事件」
 * 既可能是「这个浏览器不支持」、也可能是「这一刻还不满足条件」—— 拿它当「支不支持」的判据，
 * 等于把两件完全不同的事混成一种表现（这正是设置面板原来那句「已安装或不支持」的毛病）。
 * `'onbeforeinstallprompt' in window` 没有这个问题：它问的是**引擎有没有实现这个事件**，
 * 同步、零等待，开机就能读。
 *
 * ⚠️ 但它是**原始事实，不是判据** —— 判据是下面的 `INSTALL_API_SUPPORTED`（还要扣掉
 * `MANUAL_INSTALL_BROWSER` 那一档）。别再拿这个常量去驱动界面。
 */
const INSTALL_EVENT_IMPLEMENTED =
  typeof window !== 'undefined' && 'onbeforeinstallprompt' in window

/**
 * 「这个引擎的安装入口只在它自己的 UI 里」那一档 —— 目前只有**三星 Internet**
 * （2026-10-14 加，用户报「三星手机的三星浏览器打开网址，没有正确的安装引导，并且设置菜单中
 * 没有安装为应用的按钮」）。
 *
 * 【为什么非要单独一档】三星浏览器是 Chromium 基座，属性检测在它身上**是假阳性**：
 * `'onbeforeinstallprompt' in window` 为真，可它的安装事件实践中不派发（三星自家开发文档
 * 从未提到这个事件，它的安装入口是地址栏那个「＋」徽标与菜单 ›「添加页面到」›「主屏幕」）。
 * 用户在这台机器上看到的正是这个组合：设置面板写「当前浏览器支持」、按钮却永远灰着，
 * 齿轮菜单那颗「安装为应用」永远不出现（它要 `canInstall`），也没有任何引导告诉他在三星
 * 浏览器上该怎么装 —— 一处都不对。
 *
 * 【它为什么按 UA 认】这是本模块**唯一一处** UA 判据，与「判据是能力探测、不是 UA」那条
 * 主纪律不冲突：属性检测在绝大多数引擎上仍是对的，三星是**已知的假阳性例外**，而例外只能
 * 按型号认（没有任何 API 能问出「你这个事件到底派不派发」）。判据收在 `platform.js` 的
 * `BROWSER`（UA 里的 `SamsungBrowser/`），这一档就是那份例外清单。
 */
export const MANUAL_INSTALL_BROWSER = BROWSER === 'samsung'

/**
 * 「**网页侧**能不能靠这个引擎一键装」—— 状态词 / 按钮 / 齿轮菜单那一行全看它这一条。
 *
 * 2026-10-14 起它不再等于纯属性检测：要在它之上扣掉 `MANUAL_INSTALL_BROWSER`（三星的假阳性）。
 * 于是这个文件里三样东西的层次是：`INSTALL_EVENT_IMPLEMENTED`（原始事实，内部）→
 * `INSTALL_API_SUPPORTED`（可用性，对外）→ `canInstall`（此刻真能一键装的**事件**判据）。
 *
 * 两个纪律（原来的两条照旧）：
 * 1. **`installSupported`（引擎有没有）与 `canInstall`（此刻能不能一键装）是两个问题**，
 *    别互相替换：前者决定那句状态词，后者只决定按钮亮不亮。
 * 2. **它完全不看浏览器型号 / UA** —— 除了上面那条三星例外。代价要认：Firefox 的网页应用
 *    能力（Windows 143+ 地址栏那个图标）**在 JS 里没有任何 API**，再准的探测也照不到它，
 *    所以 Windows 上的 Firefox 一律落「不支持」。这是刻意的取舍（2026-10-11 定），别为了
 *    那句例外回头去猜一堆 UA。
 */
export const INSTALL_API_SUPPORTED = INSTALL_EVENT_IMPLEMENTED && !MANUAL_INSTALL_BROWSER

/**
 * 安装入口的状态与动作 —— **模块级单例**（2026-10-12 改）。
 *
 * 【为什么必须是单例】`beforeinstallprompt` 只在开机后某一刻派发一次，而**拦下来的那个事件
 * 对象是唯一能调 `prompt()` 的东西**：谁先听到、存在谁手里，只有那一份能用。所以这份状态
 * 必须全局唯一。现在有两处消费它：设置面板那一行（它一直挂着，见 `EditorPane.vue` 的 `v-show`），
 * 以及**齿轮下拉菜单里那颗「安装为应用」**（只在真能一键装时才出现，见 `services/settingsMenu.js`）。
 * 两处读同一份，才可能都对。同款体例见 `useCompanionBridge.js`（「扩展装没装」也是模块级事实）。
 *
 * 【监听为什么挂在模块加载时、且没有 teardown】同一个理由：事件只在开机那一小段里派发，
 * 挂晚了就永远错过。本模块由设置面板 import，而面板是 `v-show` 常驻的，所以挂在模块顶层与
 * 挂在 `onMounted` 里效果一致 —— 但前者对「先打开的是菜单」这种情况也成立，更不容易坏。
 */
const deferred = ref(null)
const installed = ref(false)

const standalone =
  typeof window !== 'undefined' ? window.matchMedia('(display-mode: standalone)') : null

// iOS Safari 没有 beforeinstallprompt，只能用 navigator.standalone 判断是否已是独立窗口
const isStandalone = () => Boolean(standalone?.matches) || window.navigator?.standalone === true

const runningStandalone = ref(typeof window !== 'undefined' && isStandalone())

/**
 * 「此刻真能一键装」—— 四个条件：引擎可用（`INSTALL_API_SUPPORTED`）、没装过、不在独立窗口里、
 * 而且**安装事件真的到过**（`deferred` 非空，那是唯一能调 `prompt()` 的东西）。
 *
 * 【为什么要挂 `INSTALL_API_SUPPORTED` 而不是直接看事件】2026-10-14 跟着三星那一档加。
 * 三星上若某个版本偶发派发了事件，只看事件就会亮出按钮，可状态词按 `INSTALL_API_SUPPORTED`
 * 写着「当前浏览器不支持」—— 又变成「状态词与按钮互相打架」的老毛病。一致性优先：既然
 * 已认定这台引擎的一键入口不可依赖，就不亮按钮，入口一律走它自己的 UI（“＋”徽标 / 菜单），
 * 那条路 100% 能用。
 *
 * 注意这与「事件到达可以推翻已装锁」不冲突 —— 那是另一件事（见 `onBeforeInstallPrompt`）：
 * 锁该被冲掉，只是冲掉之后能不能亮按钮仍要看引擎这一条。
 */
export const canInstall = computed(
  () =>
    INSTALL_API_SUPPORTED && !installed.value && !runningStandalone.value && deferred.value !== null,
)

/** 「已知已装」：`appinstalled` 报过（刚装完那一下），或此刻正跑在独立窗口里 */
export const appInstalled = computed(() => installed.value || runningStandalone.value)

function onBeforeInstallPrompt(event) {
  // 不拦下来的话 Chrome 会走自己的迷你信息条，我们就没机会用自己的按钮 / 菜单项触发
  event.preventDefault()
  /**
   * 事件到达本身就是**「这台浏览器此刻认为没装」的证据**（Chrome 只在没装时才派发），
   * 所以它必须能推翻 `appinstalled` 那把一次性的锁 —— 否则「装完又卸掉」在同一会话里
   * 永远回不到「可装」，按钮一灰到底。2026-10-12 用户报的那条就落在这里。
   *
   * 注意这里**只清锁、不反过来设锁**：没收到事件不代表装过，可能只是这一刻条件不满足。
   */
  installed.value = false
  deferred.value = event
}

function onInstalled() {
  deferred.value = null
  installed.value = true
}

function onDisplayModeChange() {
  runningStandalone.value = isStandalone()
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  window.addEventListener('appinstalled', onInstalled)
  standalone?.addEventListener('change', onDisplayModeChange)
}

// prompt() 每个事件只能调一次，用完即弃
export async function install() {
  const event = deferred.value
  if (!event) return null
  event.prompt()
  const { outcome } = await event.userChoice
  deferred.value = null
  return outcome
}

/**
 * 面板那一行的取用口（留着这个函数是为了不动调用点）。返回的就是上面那一份模块级单例 ——
 * 它不再「每次调用各持一份状态」，所以菜单与面板拿到的东西永远一致。
 */
export function useInstallPrompt() {
  return {
    canInstall,
    installed,
    runningStandalone,
    // 引擎有没有这套 API（模块级常量，随进程不变，所以不走 ref）
    installSupported: INSTALL_API_SUPPORTED,
    install,
  }
}
