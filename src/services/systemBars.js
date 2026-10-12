/**
 * 壳（安卓 APK）的**状态栏**跟着站内主题走 —— 底色与图标明暗两件事，前端这一侧的唯一出处。
 *
 * 为什么网页上做不到：系统状态栏不是页面的一部分，`<meta name="theme-color">` 只有浏览器认
 * （Chrome / Edge 拿它画窗口标题栏与系统栏），WebView 里没人读它；而壳里的那条栏归 Activity
 * 的窗口管。所以主题得从这儿送出去：
 *
 *   本文件 → invoke → src-tauri/src/system_bars.rs → JNI → SystemBars.kt → window
 *
 * 两条纪律（与 services/nativeToolchain.js 同）：
 * 1) **只在 Android 上调**。桌面壳里那条命令根本没注册，浏览器里也没有 `invoke` 的落点，
 *    所以 `IS_ANDROID` 是硬闸门 —— 它判的是「Tauri 壳 + 宿主安卓」，见 platform.js。
 * 2) **不产出面向用户的话术**。失败只往控制台记一句：界面配色那时已经生效了，
 *    顶多那条栏颜色不对，不该因此打扰用户，也不该打断调用方。
 */
import { invoke } from '@tauri-apps/api/core'
import { IS_ANDROID } from './platform.js'

/**
 * 把当前主题送进壳的状态栏。
 *
 * @param {boolean} dark 是不是深色主题 —— 决定状态栏图标画成浅色还是深色
 * @param {string} color 状态栏底色，形如 `#rrggbb`（调用方从 `--bg-chrome` 读出来）。
 *   传空串 = **只改图标明暗、不动底色**：开发服务器下首帧 CSS 可能还没注进来
 *   （`base.css` 是 main.js 里靠后的一批 import，而主题那个 watch 是 immediate 的），
 *   这一种情形下状态栏保持透明、由网页自己那层底色透出来，与没有这个功能时一致。
 *   打包后的产物没有这个问题：CSS 是 index.html `<head>` 里的一条 link，早于任何脚本。
 */
export function syncSystemBars(dark, color) {
  if (!IS_ANDROID) return
  invoke('set_system_bars', { dark, color: color || '' }).catch((error) => {
    console.warn('[systemBars] set_system_bars failed:', error)
  })
}
