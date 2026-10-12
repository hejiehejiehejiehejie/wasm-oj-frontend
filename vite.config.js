import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import pxtorem from 'postcss-pxtorem'
import { SERVICE_WORKER_CONSTANTS } from './src/services/storageNames.js'

// 本地沙箱（runno 的 WASI 运行时）靠 SharedArrayBuffer 在 Worker 之间传 stdin，
// 而浏览器只在「跨域隔离」的页面里开放 SharedArrayBuffer，所以开发服务器必须带上这两个头。
// 缺任何一个，本地运行环境都会以 SharedArrayBuffer is not defined 之类的错误启动失败。
const crossOriginIsolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

// 云端同步（Cloudflare Worker cf-config-api）的接口挂在 www 域名的 /api/* 上，
// 而 Worker 自己的 workers.dev 子域在国内网络不通，所以本地跑的时候把 /api 代理过去。
// 浏览器视角仍然是一次同源请求：不用配 CORS，也不会和上面的 COEP: require-corp 打架。
// 线上不需要这一层 —— 生产站点本身就是 www.998244353.best，/api/* 由 Worker Route 直接接住。
const apiProxy = {
  '/api': {
    target: 'https://www.998244353.best',
    changeOrigin: true,
  },
}

// 构建产物文件名带内容哈希，Service Worker 没法在源码里硬编码，所以构建完把清单单独写一份，
// install 阶段读取它来预缓存。这样不必引入 vite-plugin-pwa 之类的依赖。
function precacheManifest() {
  return {
    name: 'cp-precache-manifest',
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

// Service Worker 是 classic worker，不能用 import 读 services/storageNames.js，
// 所以它那份桶名常量由下面这个插件在构建期拼进源码。模板是 src/sw.js（不是产物）。
const SW_TEMPLATE = fileURLToPath(new URL('./src/sw.js', import.meta.url))

function renderServiceWorker() {
  const declared = Object.entries(SERVICE_WORKER_CONSTANTS)
    .map(([name, value]) => `const ${name} = ${JSON.stringify(value)}`)
    .join('\n')
  const banner = [
    '// ---------------------------------------------------------------------------',
    '// 以下常量由 vite.config.js 的 cp-service-worker 插件生成，唯一出处是',
    '// src/services/storageNames.js 的 SERVICE_WORKER_CONSTANTS —— 不要手改这一块，',
    '// 改了会在下次构建时被覆盖（SW 是 classic worker，没法直接 import 那个模块）。',
    '// ---------------------------------------------------------------------------',
  ].join('\n')
  // 模板每次现读：dev 下每次请求都走这里，改了 src/sw.js 不必重启开发服务器
  return `${banner}\n${declared}\n\n${readFileSync(SW_TEMPLATE, 'utf8')}`
}

/**
 * 产出 /sw.js。
 *
 * 之所以要生成、而不是直接放在 public/ 里：桶名必须与页面共用同一份定义
 * （services/storageNames.js），而 SW 读不到模块。放在 public/ 就只能再抄一份字面量，
 * 正是这个文件要消灭的重复。
 *
 * - 构建：把生成结果 emit 成 dist/sw.js —— 与原先 public/sw.js 的 URL 完全一致，
 *   vercel.json / main.js 里那条 register('/sw.js') 都不用动。
 * - dev：public/ 下已经没有这个文件了，所以挂个中间件现场拼给浏览器；少这一步的话
 *   dev 下 /sw.js 直接 404、SW 装不上，而 npm run verify 跑的正是 dev server。
 * - preview 不用管：它服务 dist/，产物已在里面。
 */
function serviceWorker() {
  return {
    name: 'cp-service-worker',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: renderServiceWorker() })
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if ((req.url ?? '').split('?')[0] !== '/sw.js') return next()
        res.setHeader('Content-Type', 'text/javascript; charset=utf-8')
        // 与 vercel.json 里 /sw.js 的 Cache-Control 对齐：SW 必须能及时更新
        res.setHeader('Cache-Control', 'no-cache')
        res.end(renderServiceWorker())
      })
    },
  }
}

export default defineConfig({
  plugins: [vue(), precacheManifest(), serviceWorker()],
  css: {
    // 全局 UI 缩放的「止血防线」：把 CSS 里的 px 转成 rem，缩放时只改根字号即可。
    // 但转换只发生在 CSS 声明上，JS 内联样式 / JS 常量 / @media·@container 断点都不受影响，
    // 所以下面四项是把「会被 JS 以 px 语义读取」的部分强行留在 px 坐标系：
    postcss: {
      plugins: [
        pxtorem({
          rootValue: 16, // 基准字号（100% 比例）
          unitPrecision: 5, // 转出的 rem 保留 5 位小数（16 的幂次分母在十进制里精确）
          // 1px / 2px 不转：亚像素会让细边框、小间距忽粗忽细，甚至在取整时消失
          minPixelValue: 3,
          // 断点不转：@media (max-height: 479px)（EditorPane）与 JS 的 SHORT_VIEWPORT = 480
          // （useMobileKeyboard）是成对契约，转成 rem 后两者在缩放时不再等价
          mediaQuery: false,
          // Monaco 自带样式表经 node_modules 进 Vite 管线，必须整包排除
          exclude: /node_modules/i,
          // 双保险：本项目自己若有 monaco 关键字选择器也不转
          selectorBlackList: [/monaco/],
          // 被 App.vue 的 measureLimits() 用 getPropertyValue + parseFloat 读取的变量，
          // 一旦转成 rem，parseFloat("15rem") 会得到 15 而不是 240，拖拽上限直接算错。
          // 注意 --seg-w / --seg-h 不放进来：它们是纯视觉尺寸、无 JS 读取，
          // 只需跟 rem 一起缩放才能保住胶囊的宽高比例（只保护其中一个会扭形）。
          propList: ['*', '!--tests-min-cap', '!--tests-min-floor', '!--tests-min-ratio'],
        }),
      ],
    },
  },
  server: {
    port: 5199,
    strictPort: false,
    headers: crossOriginIsolation,
    proxy: apiProxy,
  },
  preview: {
    headers: crossOriginIsolation,
    proxy: apiProxy,
  },
  // Monaco 按需引入专用（见 src/services/monaco/editorBundle.js）。它照 editor.main.js 逐条
  // 引 esm 源码，而 monaco-editor 的 exports map 只有 `./*` → `./esm/vs/*.js` 一条 —— 走它
  // 既引不到 .css（会被拼成 .css.js），也到不了 esm 下的深层路径。所以单给一个前缀直取源码。
  // 尾斜杠是有意的：alias 按前缀匹配，防止将来冒出同名前缀时误伤。
  resolve: {
    alias: {
      'monaco-esm/': fileURLToPath(new URL('./node_modules/monaco-editor/esm/vs/', import.meta.url)),
    },
  },
  build: {
    // Monaco ships a few large chunks; raise the warning threshold instead of
    // splitting the editor across many lazy chunks.
    chunkSizeWarningLimit: 4000,
    // 七个入口：主应用 + 使用指南（guide.html + guide.en.html）+ 第三方许可清单（notice.html + notice.en.html）
    // + 隐私政策（privacy.html + privacy.en.html）。
    // 指南页被搜索引擎直接抓取，所以要作为真正的 HTML 入口构建，才能复用 base.css 的两套主题配色（色值只定义在那里）；
    // 英文版 guide.en.html 与中文版共用同一份 guide.css，也必须单独列进来，否则不会被构建。
    // notice 两页同理，而且它们**是生成物**——由 scripts/render-notice.mjs 从 NOTICE.md / NOTICE.en.md 生成
    // （npm run notice，已挂在 prebuild 上），不要手改那两页，改源文件后重新生成。
    // privacy 两页是手写的（与 guide 一样，共用 guide.css）；它同时是 Edge / Firefox 商店要求填写的隐私政策 URL。
    // 注意：precacheManifest 在 generateBundle 阶段从 bundle 生成、早于 vite:build-html，
    // 所以清单里只有内容页的 js/css，永远不含 .html，这些内容页都不进 Service Worker 预缓存。
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        guide: fileURLToPath(new URL('./guide.html', import.meta.url)),
        guideEn: fileURLToPath(new URL('./guide.en.html', import.meta.url)),
        notice: fileURLToPath(new URL('./notice.html', import.meta.url)),
        noticeEn: fileURLToPath(new URL('./notice.en.html', import.meta.url)),
        privacy: fileURLToPath(new URL('./privacy.html', import.meta.url)),
        privacyEn: fileURLToPath(new URL('./privacy.en.html', import.meta.url)),
      },
    },
  },
})