import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 本地沙箱（runno 的 WASI 运行时）靠 SharedArrayBuffer 在 Worker 之间传 stdin，
// 而浏览器只在「跨域隔离」的页面里开放 SharedArrayBuffer，所以开发服务器必须带上这两个头。
// 缺任何一个，本地运行环境都会以 SharedArrayBuffer is not defined 之类的错误启动失败。
const crossOriginIsolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

export default defineConfig({
  plugins: [vue()],
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
  },
})