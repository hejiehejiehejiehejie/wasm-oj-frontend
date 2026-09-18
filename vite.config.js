import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 本地沙箱（runno 的 WASI 运行时）靠 SharedArrayBuffer 在 Worker 之间传 stdin，
// 而浏览器只在「跨域隔离」的页面里开放 SharedArrayBuffer，所以开发服务器必须带上这两个头。
// 缺任何一个，本地运行环境都会以 SharedArrayBuffer is not defined 之类的错误启动失败。
const crossOriginIsolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

// 构建产物文件名带内容哈希，Service Worker 没法在源码里硬编码，所以构建完把清单单独写一份，
// install 阶段读取它来预缓存。这样不必引入 vite-plugin-pwa 之类的依赖。
function precacheManifest() {
  return {
    name: 'cph-precache-manifest',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle)
        .sort()
        .map((name) => `/${name}`)
      this.emitFile({
        type: 'asset',
        fileName: 'precache-manifest.json',
        source: JSON.stringify(files),
      })
    },
  }
}

export default defineConfig({
  plugins: [vue(), precacheManifest()],
  server: {
    port: 5199,
    strictPort: false,
    headers: crossOriginIsolation,
  },
  preview: {
    headers: crossOriginIsolation,
  },
  build: {
    // Monaco ships a few large chunks; raise the warning threshold instead of
    // splitting the editor across many lazy chunks.
    chunkSizeWarningLimit: 4000,
    // 两个入口：主应用 + 使用指南（guide.html）。指南页被搜索引擎直接抓取，
    // 所以要作为真正的 HTML 入口构建，才能复用 base.css 的两套主题配色（色值只定义在那里）。
    // 注意：precacheManifest 在 generateBundle 阶段从 bundle 生成、早于 vite:build-html，
    // 所以清单里只有 guide 的 js/css，永远不含 .html，这一页不进 Service Worker 预缓存。
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        guide: fileURLToPath(new URL('./guide.html', import.meta.url)),
      },
    },
  },
})