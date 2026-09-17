import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * 浏览器的安装入口（PWA）。
 *
 * `beforeinstallprompt` 只在满足可安装条件后触发，而且事件本身要求由用户手势才能调用
 * `prompt()`，所以这里把它拦下来存着，交给顶栏的按钮去触发。
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

  return { canInstall, installed, runningStandalone, install }
}