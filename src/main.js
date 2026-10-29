// 必须排在最前：i18n / 快捷键 / mdView 在模块求值阶段就要读这些键（见 storageMigration.js 文件头）
import './services/storageMigration.js'
import { createApp } from 'vue'
import App from './App.vue'
import { armBackStack } from './services/backStack.js'
import { captureCloudHandleFromPath } from './services/cloudEntry.js'
import { ensureCfPickerInstalled } from './services/cfRuntime.js'
import { countdown, installCountdown, readCountdownAutoInstall } from './services/countdown.js'
// 悬停能力判定：要在首帧之前把 <html> 的 is-hoverable 落定，全站 :hover 都靠它把关
// （见 services/hoverCapability.js 文件头）。
import './services/hoverCapability.js'
import { IS_WEB } from './services/platform.js'
import './styles/base.css'

// 仅开发环境：把 Monaco / modelManager 暴露到 window，供浏览器端自动化断言
// （model 泄漏、语言状态等）。生产构建会被整段裁掉。
if (import.meta.env.DEV) {
  Promise.all([
    import('./services/monaco/editorBundle.js'),
    import('./services/monaco/modelManager.js'),
    import('./services/vfs/workspaceStore.js'),
  ]).then(([{ monaco }, { modelManager }, store]) => {
    // ⚠️ 取 `.monaco`：editorBundle 的模块命名空间是 `{ monaco, default }`，
    // 不像 monaco-editor 的入口那样本身就是 API（`monaco.editor` 之类的挂载点）。
    window.__cp = { monaco, modelManager, store }
  })
}

// 地址形态的云配置入口（/<handle>）：在挂载前先把 handle 收下来。云端到底有没有这份配置、
// 要不要打开设置页，要等 App 起来、会话恢复完之后再探（见 cloudEntry.js 的 confirmCloudEntry）——
// 没有配置时那次探测会顺手把地址抹回根路径，不能在这里做。
captureCloudHandleFromPath()

// 装成 app（独立窗口）时才武装：把系统返回接成站内动作。**必须在 mount 之前** ——
// 组件 setup 里的 watchBackLayer 可能立刻注册第一层（比如刷新时正停在 Markdown 全屏里），
// 那时候栈得已经武装好。浏览器标签页里它自己会跳过，不影响 Alt+← 的历史语义。
armBackStack()

createApp(App).mount('#app')

// 随机抽题是默认安装的组件：打开站点时若无题库就静默预取一次（失败不打扰，下次再试）。
// 刻意放在 mount 之后：首帧渲染不该等一个 2MB 的网络请求
void ensureCfPickerInstalled()

// 倒计时同理（2026-10-25 起它也有了「默认安装」开关）：内置组件没有资产要下，
// 「装」就是让入口回来。开关关掉、又确实卸过的人不该每次启动都被装回去 ——
// 设置里卸载时会把开关一并关掉（见 EditorSettingsPanel 的 confirmUninstall）。
if (readCountdownAutoInstall() && !countdown.installed) installCountdown()

// Service Worker 只在网页版的生产构建里注册：
// - dev server 的模块是即时编译的，把它们缓存下来只会让改完代码看到旧页面；
// - 桌面端（Tauri）没有 Service Worker，注册也起不来（见 HANDOFF 第 14 节第 5 条）。
if (import.meta.env.PROD && IS_WEB && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}