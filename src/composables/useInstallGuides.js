import { onBeforeUnmount, onMounted, watch } from 'vue'

import { canInstall } from './useInstallPrompt.js'
import { runAutoGuides } from '../services/installGuides.js'

/**
 * 「安装引导」的自动弹一次 —— 挂在 App 上（全站唯一，组件本身不画东西）。
 *
 * 【为什么要等】这一整套判据开机那一刻都还没定：
 * - 插件探活要跑完 `PING_DELAYS`（0 / 400 / 1500ms，每次 500ms 超时）才知道装没装，
 *   太早评估会把「正在探」当成「没装」，朝已经装了插件的人喊「快装插件」；
 * - `beforeinstallprompt` 什么时候到不由站点定。
 * 所以趟一压在 2.5s（探活最迟 2s 落定），趟二 10s 专门补「有 API 却拿不到入口」那一格
 * （理由见 `installGuides.js` 的 `runAutoGuides`）。
 *
 * 【为什么还要 watch】安装事件晚于趟一到达时，页面上会缺掉那条最该出现的「安装」引导；
 * 事件一到就补一趟 —— 服务层记着「哪几条弹过了」，补跑不会重复。
 */
const EARLY_MS = 2500
const LATE_MS = 10000

export function useInstallGuides() {
  const timers = []
  let settled = false

  onMounted(() => {
    timers.push(
      window.setTimeout(() => {
        settled = true
        runAutoGuides('early')
      }, EARLY_MS),
    )
    timers.push(window.setTimeout(() => runAutoGuides('late'), LATE_MS))
  })

  watch(canInstall, (value) => {
    if (value && settled) runAutoGuides('early')
  })

  onBeforeUnmount(() => {
    for (const id of timers) window.clearTimeout(id)
  })
}
