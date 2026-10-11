import { computed, ref } from 'vue'

/**
 * 「这个引擎到底有没有『把网站装成应用』这套 API」—— 一条同步判据，开机就能读。
 *
 * **是属性检测，不是等事件**。`beforeinstallprompt` 只在**满足可安装条件之后**才派发，
 * 所以「等不到事件」既可能是「这个浏览器不支持」、也可能是「这一刻还不满足条件」
 * —— 拿它当「支不支持」的判据，等于把两件完全不同的事混成一种表现（这正是设置面板
 * 原来那句「已安装或不支持」的毛病）。`'onbeforeinstallprompt' in window` 没有这个问题：
 * 它问的是**引擎有没有实现这个事件**，同步、零等待，而且正好落在真实边界上 ——
 * Blink（Chrome / Edge / 360 / QQ / Opera）为 `true`，Firefox / Safari 与全部 iOS 为 `false`。
 *
 * 两个纪律：
 * 1. **`installSupported`（引擎有没有）与 `canInstall`（此刻能不能一键装）是两个问题**，
 *    别互相替换：前者决定那句状态词，后者只决定按钮亮不亮。
 * 2. **它完全不看浏览器型号 / UA**，所以「应用」这一栏不需要 `BROWSER` —— 那是插件栏的判据。
 *    代价要认：Firefox 的网页应用能力（Windows 143+ 地址栏那个图标）**在 JS 里没有任何 API**，
 *    再准的探测也照不到它，所以 Windows 上的 Firefox 一律落「不支持」。这是刻意的取舍
 *    （2026-10-11 定），别为了那句例外回头去猜 UA。
 */
export const INSTALL_API_SUPPORTED =
  typeof window !== 'undefined' && 'onbeforeinstallprompt' in window

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

export const canInstall = computed(
  () => !installed.value && !runningStandalone.value && deferred.value !== null,
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
