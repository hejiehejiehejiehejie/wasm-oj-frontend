// 必须排在最前：i18n / 快捷键 / mdView 在模块求值阶段就要读这些键（见 storageMigration.js 文件头）
import './services/storageMigration.js'
import { createApp } from 'vue'
import App from './App.vue'
import { captureCloudHandleFromPath } from './services/cloudEntry.js'
import { ensureCfPickerInstalled } from './services/cfRuntime.js'
import { IS_WEB } from './services/platform.js'
import './styles/base.css'

// 仅开发环境：把 Monaco / modelManager 暴露到 window，供浏览器端自动化断言
// （model 泄漏、语言状态等）。生产构建会被整段裁掉。
if (import.meta.env.DEV) {
  Promise.all([
    import('monaco-editor'),
    import('./services/monaco/modelManager.js'),
    import('./services/vfs/workspaceStore.js'),
  ]).then(([monaco, { modelManager }, store]) => {
    window.__cp = { monaco, modelManager, store }
  })
}

// 地址形态的云配置入口（/<handle>）：在挂载前先把 handle 收下来。云端到底有没有这份配置、
// 要不要打开设置页，要等 App 起来、会话恢复完之后再探（见 cloudEntry.js 的 confirmCloudEntry）——
// 没有配置时那次探测会顺手把地址抹回根路径，不能在这里做。
captureCloudHandleFromPath()

createApp(App).mount('#app')

// 随机抽题是默认安装的组件：打开站点时若无题库就静默预取一次（失败不打扰，下次再试）。
// 刻意放在 mount 之后：首帧渲染不该等一个 2MB 的网络请求
void ensureCfPickerInstalled()

// Service Worker 只在网页版的生产构建里注册：
// - dev server 的模块是即时编译的，把它们缓存下来只会让改完代码看到旧页面；
// - 桌面端（Tauri）没有 Service Worker，注册也起不来（见 HANDOFF 第 14 节第 5 条）。
if (import.meta.env.PROD && IS_WEB && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}