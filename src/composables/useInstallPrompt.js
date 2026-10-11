import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

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
 * 浏览器的安装入口（PWA）。
 *
 * `beforeinstallprompt` 只在满足可安装条件后触发，而且事件本身要求由用户手势才能调用
 * `prompt()`，所以这里把它拦下来存着，交给设置面板的按钮去触发。
 * 装完之后（或已经在独立窗口里跑）按钮就不该再出现，因此额外跟踪 `appinstalled`
 * 与 `display-mode: standalone`。
 */
export function useInstallPrompt() {
  const deferred = ref(null)
  const installed = ref(false)

  // iOS Safari 没有 beforeinstallprompt，只能用 navigator.standalone 判断是否已是独立窗口
  const standalone = window.matchMedia('(display-mode: standalone)')
  const isStandalone = () => standalone.matches || window.navigator.standalone === true
  const runningStandalone = ref(isStandalone())

  const canInstall = computed(
    () => !installed.value && !runningStandalone.value && deferred.value !== null,
  )

  function onBeforeInstallPrompt(event) {
    // 不拦下来的话 Chrome 会走自己的迷你信息条，我们就没机会用自己的按钮触发
    event.preventDefault()
    deferred.value = event
  }

  function onInstalled() {
    deferred.value = null
    installed.value = true
  }

  function onDisplayModeChange() {
    runningStandalone.value = isStandalone()
  }

  onMounted(() => {
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
    standalone.addEventListener('change', onDisplayModeChange)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.removeEventListener('appinstalled', onInstalled)
    standalone.removeEventListener('change', onDisplayModeChange)
  })

  // prompt() 每个事件只能调一次，用完即弃
  async function install() {
    const event = deferred.value
    if (!event) return null
    event.prompt()
    const { outcome } = await event.userChoice
    deferred.value = null
    return outcome
  }

  return {
    canInstall,
    installed,
    runningStandalone,
    // 引擎有没有这套 API（模块级常量，随进程不变，所以不走 ref）
    installSupported: INSTALL_API_SUPPORTED,
    install,
  }
}