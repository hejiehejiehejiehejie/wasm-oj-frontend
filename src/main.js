import { createApp } from 'vue'
import App from './App.vue'
import './styles/base.css'

// 仅开发环境：把 Monaco / modelManager 暴露到 window，供浏览器端自动化断言
// （model 泄漏、语言状态等）。生产构建会被整段裁掉。
if (import.meta.env.DEV) {
  Promise.all([
    import('monaco-editor'),
    import('./services/monaco/modelManager.js'),
    import('./services/vfs/workspaceStore.js'),
  ]).then(([monaco, { modelManager }, store]) => {
    window.__cph = { monaco, modelManager, store }
  })
}

createApp(App).mount('#app')

// Service Worker 只在生产构建里注册：dev server 的模块是即时编译的，
// 把它们缓存下来只会让改完代码看到旧页面。
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}