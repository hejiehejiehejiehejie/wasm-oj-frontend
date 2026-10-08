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
