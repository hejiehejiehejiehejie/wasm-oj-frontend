import { createApp } from 'vue'
import App from './App.vue'
import './styles/base.css'

createApp(App).mount('#app')

// Service Worker 只在生产构建里注册：dev server 的模块是即时编译的，
// 把它们缓存下来只会让改完代码看到旧页面。
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}