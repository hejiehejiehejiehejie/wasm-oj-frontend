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

/**
 * 浏览器族：`'firefox'` / `'samsung'` / `'edge'` / `'chrome'` / `'safari'` / `'unknown'`。
 *
 * **只用来挑「去哪个商店装、用哪套手动步骤、该不该说移动端那套」这几句文案**，
 * 不是精确判定 —— 它从 userAgent 猜的，而且有几处天生分不开：
 *
 * - **360 / QQ / 搜狗 / 2345 这些套壳浏览器一律落 `'chrome'`**：它们（多数版本）的 UA
 *   里只有 `Chrome/`，没有自家 token，与 Chrome 本尊逐字一样。好在它们的扩展安装路径
 *   本来就与 Chrome 同源（扩展管理页 + 加载已解压），所以不细分也不影响推荐结果。
 *   **别为了「认出 360」去加 UA 特例** —— 认出来的那部分才是少数，反而多一份会走偏的分支。
 * - **`'samsung'` 单独一档（2026-10-14 加）**：三星 Internet 的 UA 既有自己的
 *   `SamsungBrowser/<版本>`、也带着 `Chrome/<版本>`，所以这一条必须排在 `Chrome/` 之前。
 *   它与上面那条纪律**不冲突**：认出 360 没用（扩展路径与 Chrome 同源），而认出三星有用 ——
 *   它的安装入口不在网页侧（详见 `useInstallPrompt.js` 的 `MANUAL_INSTALL_BROWSER`），
 *   挑错文案等于让用户照着 Chrome 那套去点一个不存在的入口。
 * - **`'safari'` 是唯一「一条路都没有」的一档**：Safari 扩展走 App Store 分发，
 *   与我们这套完全不通用。它同时也**收下了 iOS 上的所有浏览器** —— iOS 的 Chrome /
 *   Firefox 用 `CriOS` / `FxiOS` 标识、UA 里同样带 `Safari/`，而 iOS 上谁都装不了本插件，
 *   归到这一档正好是正确答案（别按桌面那套去认 `CriOS` 再分流，结论是一样的）。
 * - `'unknown'` 只剩真正认不出的怪 UA，此时**必须 fail-open**：把能给的路都摆出来。
 *   猜错的代价是用户看不到入口，比多给一条路糟得多。
 */
export const BROWSER = detectBrowser()

function detectBrowser() {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = navigator.userAgent || ''
  if (/Firefox\//i.test(ua)) return 'firefox'
  // 三星 Internet 必须排在 `Chrome/` 之前：它是 Chromium 基座，UA 里两个 token 都在
  if (/SamsungBrowser\//i.test(ua)) return 'samsung'
  // `Edg/` 是 Chromium 版 Edge，`EdgA/` 是安卓版；`Edge/` 那套 EdgeHTML 早已退役，
  // 这里不认它（正则的 `[A-Z]?` 配不上 `Edge/` 里的小写 e）
  if (/Edg[A-Z]?\//.test(ua)) return 'edge'
  if (/Chrome\/|Chromium\//i.test(ua)) return 'chrome'
  // 到这儿还带 `Safari/` 的就是 WebKit 本家（桌面 Safari 与全部 iOS 浏览器）
  if (/Safari\//.test(ua)) return 'safari'
  return 'unknown'
}

/**
 * 浏览器跑在哪类设备上：`'desktop'` / `'android'` / `'ios'`。
 *
 * 与 `IS_ANDROID`（那个是「Tauri 壳 + 宿主是安卓」）不是一回事，别混：这里问的是
 * **浏览器**在什么设备上，网页版也有安卓 / iOS 访客。
 *
 * 用途同样只有挑文案 —— 移动端与桌面端的扩展能力差得很远（见设置面板的插件一栏）。
 */
export const BROWSER_PLATFORM = detectBrowserPlatform()

function detectBrowserPlatform() {
  if (typeof navigator === 'undefined') return 'desktop'
  const ua = navigator.userAgent || ''
  if (/Android/i.test(ua)) return 'android'
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  // iPadOS 13+ 的 Safari 报的是 Macintosh，靠触点数把它与真 Mac 分开
  if (/Macintosh/i.test(ua) && (navigator.maxTouchPoints ?? 0) > 1) return 'ios'
  return 'desktop'
}
