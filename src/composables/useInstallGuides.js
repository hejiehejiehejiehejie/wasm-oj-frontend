import { onBeforeUnmount, onMounted, watch } from 'vue'

import { canInstall } from './useInstallPrompt.js'
import { runAutoGuides } from '../services/installGuides.js'

/**
 * 「安装引导」的自动弹一次 —— 挂在 App 上（全站唯一，组件本身不画东西）。
 *
 * 【为什么要等 2.5s】这一套判据开机那一刻都还没定：插件探活要跑完 `PING_DELAYS`
 * （0 / 400 / 1500ms，每次 500ms 超时）才知道装没装，太早评估会把「正在探」当成「没装」，
 * 朝已经装了插件的人喊「快装插件」。探活最迟 2s 落定，所以这一趟压在 2.5s。
 *
 * 【为什么还要 watch】`beforeinstallprompt` 什么时候到不由站点定，晚于 2.5s 到达时页面上会
 * 缺掉那条最该出现的「安装」引导；事件一到就补一趟 —— 服务层记着「哪几条弹过了」，补跑不会重复。
 *
 * 【2026-10-12 去掉 10s 那一趟】原来还有一趟 `late`（10s）专为「有 API 却拿不到入口」那一格；
 * 那一格已退出自动弹（它唯一会误报、又是常驻的黄色警告，见 `installGuides.js` 的 `available`），
 * 于是这趟随之取消，`runAutoGuides` 也不再收 `phase`。
 */
const EARLY_MS = 2500

export function useInstallGuides() {
  let settled = false
  let timer = 0

  onMounted(() => {
    timer = window.setTimeout(() => {
      settled = true
      runAutoGuides()
    }, EARLY_MS)
  })

  watch(canInstall, (value) => {
    if (value && settled) runAutoGuides()
  })

  onBeforeUnmount(() => window.clearTimeout(timer))
}
