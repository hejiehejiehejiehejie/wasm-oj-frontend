/**
 * 「我现在跑在哪种外壳里」的唯一出处。
 *
 * Tauri 桌面壳会往 window 注入 `__TAURI_INTERNALS__`（v2 必注入），网页版没有。
 * 桌面版与网页版**共用同一份 `dist`**（见 HANDOFF 第 14 节），所以平台只能在运行时判，
 * 不能用构建期变量 —— 那会逼出第二条构建线，还会带来「忘设变量就走错分支」的隐患。
 *
 * 需要按平台分岔的地方（引擎注册表、Service Worker 注册、PWA 安装入口、扩展抓题链路、
 * 工具链下载）都读这里，不要再各写一份 `'__TAURI_INTERNALS__' in window`。
 */
export const IS_DESKTOP = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

/** 网页版（含本机 dev server）为 true；桌面版为 false */
export const IS_WEB = !IS_DESKTOP

/**
 * Tauri 壳里、宿主是 Android 时为 true。
 *
 * 与上面两个不同，这一条只能从 UA 认：Tauri 没有把宿主系统暴露给前端的免依赖通路
 * （os 插件要额外引一个 npm 包 + 一个 Rust crate，见项目约定「新增依赖要先讨论」）。
 * Android WebView 的 UA 必含 `Android`，认错的代价只是「Android 专有的那条分支」走错。
 *
 * **只在 Android 专有的事上用**（目前唯一一处：随包 C++ 工具链的准备，
 * 见 services/nativeToolchain.js）。「是不是桌面壳」仍旧看 IS_DESKTOP —— 那才是
 * 那个二值判定的正确粒度。
 */
export const IS_ANDROID =
  IS_DESKTOP && typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)

/**
 * 宿主系统：`'windows'` / `'mac'` / `'other'`。
 *
 * **只用于挑「按系统写」的提示文案**（比如自检失败时告诉用户去哪儿装编译器），
 * 不要拿它当功能开关 —— 功能按平台分流看上面的 `IS_DESKTOP` / `IS_WEB` 就够，
 * 而那两个是精确探测，这个是从 userAgent 猜的。
 *
 * 用 UA 而不是 Tauri 的 os 插件：为一句提示引一个 npm 包 + 一个 Rust crate 不划算
 * （见项目约定「新增依赖要先讨论」）。猜错的代价仅仅是提示里写了另一个系统的装法。
 */
export const HOST_OS = detectHostOs()

function detectHostOs() {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent || ''
  if (/Windows/i.test(ua)) return 'windows'
  // WebView 上 macOS 的 UA 是 `(Macintosh; Intel Mac OS X …)`
  if (/Macintosh|Mac OS X/i.test(ua)) return 'mac'
  return 'other'
}
