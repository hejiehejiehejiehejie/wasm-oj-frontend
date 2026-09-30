// 必须排在最前：i18n / 快捷键 / mdView 在模块求值阶段就要读这些键（见 storageMigration.js 文件头）
import './services/storageMigration.js'
import { createApp } from 'vue'
import App from './App.vue'
import { captureCloudHandleFromPath } from './services/cloudEntry.js'
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

// 地址形态的云配置入口（/<handle>）：在挂载前把 handle 收下来。地址**故意保留原样**
// （见 cloudEntry.js 文件头），确认与套用都在设置页里做。
captureCloudHandleFromPath()

createApp(App).mount('#app')

// Service Worker 只在生产构建里注册：dev server 的模块是即时编译的，
// 把它们缓存下来只会让改完代码看到旧页面。
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}