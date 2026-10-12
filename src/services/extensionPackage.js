/**
 * extensionPackage —— 浏览器插件安装包的常量，以及「这台机器上该走哪条路」。
 *
 * 【为什么单独一个文件】2026-10-12 起这份数据有**两个消费者**：设置面板的「浏览器插件」那一栏，
 * 以及齿轮下拉菜单里那几颗一次性的行（安装 / 下载 / 更新）连同它们的显隐判据 —— 「装着的这版
 * 是不是旧了」也在这里（`isExtensionOutdated`，两边共用一份比对）。以前这几个常量住在
 * `EditorSettingsPanel.vue` 里，菜单要用就得抄一份副本 —— 抄一份的下场是发新版时漏改一处，
 * 而**文件名里那个版本号是有用的**（见下），漏改会让老用户一直拿到旧包。
 * 所以唯一出处挪到这里，面板改成 import。
 *
 * 安装包放在 `public/extension/` 下。**文件名带版本号是刻意的**：Service Worker 对同源 GET 走
 * cacheFirst 且从不重新校验，不带版本号的 URL 会把旧包一直喂给已经来过的用户。
 * 发新版插件时只改 `EXTENSION_VERSION`，再把新 zip 拷进 `public/extension/`（原文那句
 * 「改两个常量」里的另一个是文件名，它由版本号拼出来）。
 */
import { computed } from 'vue'
import { BROWSER, BROWSER_PLATFORM, IS_DESKTOP } from './platform.js'

export const EXTENSION_VERSION = '2.66.4'
export const EXTENSION_FILE = `cc-for-web-${EXTENSION_VERSION}.zip`
export const EXTENSION_DOWNLOAD_URL = `/extension/${EXTENSION_FILE}`

// Firefox 版已上架 AMO，直接外链过去一键装；Chrome 仍未上架，只能给 zip 手动加载。
// 这个地址不随版本走（AMO 那个页面永远是「最新版」），不在上面「发新版改一处」之列。
export const FIREFOX_EXTENSION_URL = 'https://addons.mozilla.org/zh-CN/firefox/addon/cc-for-web/'

// Edge 加载项商店版还没上架（上架材料见 cph-companion 的 SUBMISSION-EDGE.md：Partner Center
// 账号未注册、截图未拍）。地址先留在这里 —— 上架后把 URL 填上，面板那颗「Edge 版」按钮会自己
// 出现，别的地方一个都不用改。
// **空着就整颗不渲染**：宁可暂时少一颗按钮，也不给用户一个点开是 404 的入口。
export const EDGE_EXTENSION_URL = ''

/**
 * 这台机器上**真能走通**的安装路径，按推荐顺序：
 *
 * - `'firefox'`：去 AMO 一键装（Firefox 桌面与安卓都算 —— manifest 标了 gecko_android 兼容）；
 * - `'manual'`：下载 zip → 扩展管理页开「开发者模式」→「加载已解压的扩展程序」。
 *
 * 空数组 = 一条都没有：Safari（含 iOS 上所有浏览器 —— 扩展走 App Store 是另一套分发）、
 * 安卓上的非 Firefox（安卓 Chrome 完全不支持扩展），以及桌面壳（webview 装不了扩展）。
 *
 * **认不出浏览器时两条都给**（与面板同一处纪律）：猜错的代价是用户看不到入口，
 * 比多摆一条路糟得多 —— 所以 `unknown` 落在这里而不是落空。
 */
export const EXTENSION_ROUTES = computed(() => {
  if (IS_DESKTOP) return []
  if (BROWSER === 'firefox') return ['firefox']
  if (BROWSER === 'safari') return []
  if (BROWSER_PLATFORM !== 'desktop') return []
  if (BROWSER === 'unknown') return ['firefox', 'manual']
  return ['manual']
})

/**
 * 「装着的这一版是不是比本站发的旧」 —— **唯一出处**（2026-10-12 从面板挪进来，齿轮菜单也要用）。
 *
 * 入参是扩展自报的版本串（`cp-info` 的 `info.version`）。空串 = 没探到扩展，一律 false ——
 * 「没探到」由调用方按自己的语义处理（面板与菜单都是落「安装」口径，不该落「更新」）。
 *
 * 两条纪律：
 * 1. **只拿它报「有新版本」，不用它判能力** —— 能力走 `capabilities` 协商（HANDOFF 13.1），
 *    这笔账按版本号比大小一记错方向就反了。
 * 2. `x.y.z` 逐段比大小；版本串来自扩展自报，不信任格式，非数字段按 0 算。
 */
export function isExtensionOutdated(version) {
  if (!version) return false

  const got = String(version).split('.')
  const latest = EXTENSION_VERSION.split('.')
  for (let i = 0; i < Math.max(got.length, latest.length); i += 1) {
    const diff = (parseInt(got[i], 10) || 0) - (parseInt(latest[i], 10) || 0)
    if (diff !== 0) return diff < 0
  }
  return false
}

/**
 * 走「下载 zip」那条：面板里是一颗 `<a download>`，菜单里没有锚点元素，所以自己造一颗点掉
 * （由用户点击触发的合成 click 不会被拦成「弹窗」）。
 */
export function downloadExtensionPackage() {
  const link = document.createElement('a')
  link.href = EXTENSION_DOWNLOAD_URL
  link.download = EXTENSION_FILE
  document.body.appendChild(link)
  link.click()
  link.remove()
}

/** 走「AMO 一键装」那条：外链到 Firefox 附加组件商店，与面板那颗按钮同一个地址 */
export function openExtensionStore() {
  window.open(FIREFOX_EXTENSION_URL, '_blank', 'noopener,noreferrer')
}
