/**
 * Codeforces 抽题组件的「安装态」。
 *
 * 与 wasmRuntime / mdRuntime 是同一个套路的第三个成员：没下载过的用户，外壳里没有它
 * 任何一份数据（题库在 IndexedDB 里、Worker 也不存在）。差别在于它的「下载」不是拉文件，
 * 而是**预取一次题库**（见 cf/cfWorker.js 的 prefetch），所以这里没有清单、没有 Cache Storage，
 * 判据就是「库里到底有没有题库」。
 *
 * 【默认安装】这个组件随站点自带：main.js 每次启动都会调 ensureCfPickerInstalled()，
 * 没题库就静默预取（失败不打扰用户，下次打开再试）。所以设置页那一行是「状态 + 失败重试 + 卸载」，
 * 其中卸载必须连「默认安装」一起关掉（那一步在 EditorSettingsPanel 里做）—— 不关的话
 * 下次启动 ensureCfPickerInstalled() 又把它装回来，按钮就成了假的。
 *
 * 【为什么把安装态放在服务层而不是设置面板里】侧栏那颗按钮也要读它 ——
 * 两个消费方必须看到同一个状态。所以这是一个模块级 ref 单例，谁都能 import。
 *
 * 【标记只用来播种首帧】`cp.cfPicker.ready` 是 localStorage 里的一个 JSON bool，
 * 作用是让「已下载的用户」在首帧就把侧栏按钮亮出来，不必等 Worker 起来问一圈。
 * 真正的判据永远是库里的数据（浏览器随时可能清掉 IndexedDB 而标记还留着），
 * 所以 reconcileCfRuntime() 会拿 cfStatus() 的结论把标记与内存 ref 一起正回来。
 *
 * 【为什么探针不无条件跑】cfStatus() 要走 Worker —— 那意味着给**每个**打开设置的人
 * 起一个后台线程，包括从没下载过这个组件的人。所以先看标记：标记说没装就直接算没装，
 * 一个线程都不起；只有标记说装过（可能是被浏览器清掉了）才值得去库里核实一次。
 */

import { ref } from 'vue'

import { cfClear, cfPrefetch, cfStatus, onCfProgress } from './cfClient.js'

/** 「已下载」的存档标记。与 mdRuntime 的键同族，值是 JSON 的 true/false。 */
export const CF_READY_FLAG_KEY = 'cp.cfPicker.ready'

/**
 * 「默认安装」开关的落盘键。它是**偏好**（要不要自动装），不是事实（本机装没装），
 * 所以在 cloudProfile.js 的同步白名单里 —— 而上面的 CF_READY_FLAG_KEY 是设备事实，不进白名单。
 * 缺省为 true：这个组件随站点自带，只有显式关掉才不再自动预取。
 */
export const CF_AUTO_INSTALL_KEY = 'cp.cfPicker.autoInstall'

/** 读「默认安装」开关。坏值 / 缺省一律按 true —— 默认安装就是这个组件的默认行为。 */
export function readCfAutoInstall() {
  try {
    return JSON.parse(window.localStorage.getItem(CF_AUTO_INSTALL_KEY)) !== false
  } catch {
    return true
  }
}

function readFlag() {
  try {
    return JSON.parse(window.localStorage.getItem(CF_READY_FLAG_KEY)) === true
  } catch {
    return false
  }
}

function writeFlag(value) {
  try {
    window.localStorage.setItem(CF_READY_FLAG_KEY, JSON.stringify(value))
  } catch {
    /* 写不进去就算了，下次打开页面还有库里的数据兜底 */
  }
}

/**
 * 组件是否已下载。侧栏按钮与设置面板那一行都读它。
 * 初值取自动落盘的标记（同步），首次校正由 reconcileCfRuntime() 完成。
 * @type {import('vue').Ref<boolean>}
 */
export const cfReady = ref(readFlag())

/** @type {Promise<{ type: string, [key: string]: unknown }> | null} 在途的下载（连点两次只跑一次） */
let downloading = null

/**
 * 下载组件：把题库预取到本机。幂等 —— 已就绪时立刻返回，在途时复用同一个 Promise。
 *
 * @param {(stage: string) => void} [onStage] 进度回调，stage 是 Worker 给的机器码
 * @returns {Promise<{ type: 'ready', count?: number, durationMs?: number } | { type: 'failure', message: string }>}
 */
export function downloadCfPicker(onStage) {
  if (cfReady.value) return Promise.resolve({ type: 'ready', durationMs: 0 })
  if (downloading) return downloading

  const unsubscribe = onStage ? onCfProgress(onStage) : null
  const startedAt = performance.now()

  downloading = cfPrefetch({ force: true })
    .then((result) => {
      writeFlag(true)
      cfReady.value = true
      return {
        type: 'ready',
        count: result?.count ?? 0,
        durationMs: Math.round(performance.now() - startedAt),
      }
    })
    .catch((error) => ({ type: 'failure', message: error?.message || String(error) }))
    .finally(() => {
      unsubscribe?.()
      downloading = null
    })

  return downloading
}

/**
 * 卸载组件：把题库从本机清掉，再把标记归零。语义与 wasmRuntime / mdRuntime 的卸载一致
 * ——「这东西别留在本机」。
 *
 * 【调用方还要关掉「默认安装」】这一步只负责清本机；「默认安装」是偏好、且会跟着账号同步，
 * 属于界面那一行的决定（见 EditorSettingsPanel 的 confirmUninstall）。不关的话下次启动
 * ensureCfPickerInstalled() 又把它装回来，用户会觉得卸载没生效。
 *
 * 清库失败（Worker 起不来）也照样把标记打回 false：标记只是首帧的播种值，
 * 库里的真实情况由下一次 reconcileCfRuntime() 正回来。
 *
 * @returns {Promise<void>}
 */
export async function uninstallCfPicker() {
  try {
    await cfClear()
  } catch {
    /* 清不掉也继续：标记照样归零，下次 reconcile 以库里的真实情况为准 */
  }
  writeFlag(false)
  cfReady.value = false
}

/**
 * 默认安装的入口：站点每次启动时调用（main.js）。
 *
 * 开关（CF_AUTO_INSTALL_KEY）关着就整个跳过 —— 那是用户明说「别自动装」，连探针都不必起。
 * 标记说装过也什么都不做（连 Worker 都不起 —— 首帧靠标记，校正留给 reconcileCfRuntime）。
 * 标记说没装才去库里核实一次：库里其实有数据（标记丢了）就只补标记，真没有就静默预取。
 * 预取失败不打扰用户：downloadCfPicker 自己把失败收成返回值，这里直接丢弃，
 * 标记保持「没装」，下次打开站点自然再试一次。
 */
export async function ensureCfPickerInstalled() {
  if (!readCfAutoInstall()) return
  if (readFlag()) return

  try {
    const status = await cfStatus()
    if ((status?.count ?? 0) > 0) {
      writeFlag(true)
      cfReady.value = true
      return
    }
  } catch {
    /* Worker 起不来也照样试预取，那边会把失败收成返回值 */
  }

  await downloadCfPicker()
}

/**
 * 用库里的真实情况校正安装态（不触网）。设置面板每次打开、以及需要「确认按钮该不该亮」
 * 的时候调用。标记说没装时**不起 Worker**，直接返回 false。
 *
 * @returns {Promise<boolean>} 校正后的安装态
 */
export async function reconcileCfRuntime() {
  if (!readFlag()) {
    cfReady.value = false
    return false
  }
  try {
    const status = await cfStatus()
    const installed = (status?.count ?? 0) > 0
    if (cfReady.value !== installed) cfReady.value = installed
    // 库被浏览器清过：标记也要跟着改，否则下次打开又白起一次 Worker 去核实
    if (!installed) writeFlag(false)
    return installed
  } catch {
    // 问不到（Worker 起不来等）：保持当前值，宁可信标记也不要让按钮莫名其妙消失
    return cfReady.value
  }
}
