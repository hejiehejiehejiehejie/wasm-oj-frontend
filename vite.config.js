import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
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
//
// 有两类产物**故意不进清单**：tree-sitter 的语法引擎 wasm（运行时 ~200KB + cpp 语法 ~4.4MB）。
// 它们只在第一次悬停时用到，预缓存等于让每次装 SW 都白拉 4.6MB —— 与 editorBundle.js
// 开头那条「首屏不要下用不到的大块」是同一个取舍。文件本身仍带哈希、按需请求后可长期缓存。
const PRECACHE_SKIP = /tree-sitter(?:-cpp)?-\w+\.wasm$/u

function precacheManifest() {
  return {
    name: 'cp-precache-manifest',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle)
        .filter((name) => !PRECACHE_SKIP.test(name))
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

/**
 * 产出 `/retain-manifest.json` —— **这一版还要留哪些缓存条目**，给 Service Worker 的
 * activate 回收用（见 sw.js 的 pruneStaleShellArtifacts）。
 *
 * 与 precache-manifest 分成两份、而不是合成一份：
 * - precache-manifest 是「install 时该预下载什么」，只装 rollup 产物（`/assets/`）；
 *   fonts 与扩展包**故意不预缓存**（第 1 节硬约束：它们靠文件名带版本轮换），塞进去
 *   等于每次装 SW 都白拉几百 KB。
 * - retain-manifest 是「桶里哪些条目还有消费者」，所以要多扫 `public/` 下那两类
 *   按文件名带版本的静态资产 —— 构建期读目录，就是它们此刻的版本。
 *
 * 判据一句话：**桶里的条目，其 URL 只有当这一版仍然部署着它时才有意义**。带内容哈希的
 * 产物看 bundle；带文件版本号的静态资产看目录。将来再加一类「会变但没有哈希」的资产，
 * **必须补进下面的扫描列表** —— sw.js 的 `pruneStaleShellArtifacts` 现在只保留清单里的
 * 条目，漏登记就等于在 activate 时把它当残骸删掉。
 */
function retainManifest() {
  const PUBLIC_DIR = fileURLToPath(new URL('./public', import.meta.url))
  const listPublic = (dir, ext) => {
    try {
      return readdirSync(join(PUBLIC_DIR, dir))
        .filter((name) => name.endsWith(ext))
        .sort()
        .map((name) => `/${dir}/${name}`)
    } catch {
      // 目录不在（裁剪过的产物 / 本地清理过）就是没有这一类，别让整次构建挂掉
      return []
    }
  }

  return {
    name: 'cp-retain-manifest',
    apply: 'build',
    generateBundle(_options, bundle) {
      const shell = [
        ...Object.keys(bundle)
          .filter((name) => name.startsWith('assets/'))
          .map((name) => `/${name}`),
        ...listPublic('fonts', '.woff2'),
        ...listPublic('extension', '.zip'),
      ].sort()
      this.emitFile({
        type: 'asset',
        fileName: 'retain-manifest.json',
        source: JSON.stringify({ shell }),
      })
    },
  }
}

// Service Worker 是 classic worker，不能用 import 读 services/storageNames.js，
// 所以它那份桶名常量由下面这个插件在构建期拼进源码。模板是 src/sw.js（不是产物）。
const SW_TEMPLATE = fileURLToPath(new URL('./src/sw.js', import.meta.url))

function renderServiceWorker(buildId = 'dev') {
  const declared = Object.entries(SERVICE_WORKER_CONSTANTS)
    .map(([name, value]) => `const ${name} = ${JSON.stringify(value)}`)
    .join('\n')
  const banner = [
    '// ---------------------------------------------------------------------------',
    '// 以下常量由 vite.config.js 的 cp-service-worker 插件生成，唯一出处是',
    '// src/services/storageNames.js 的 SERVICE_WORKER_CONSTANTS —— 不要手改这一块，',
    '// 改了会在下次构建时被覆盖（SW 是 classic worker，没法直接 import 那个模块）。',
    '//',
    `// 构建指纹 ${buildId}`,
    '// 它唯一的用途是让浏览器判定 sw.js 已更新：脚本字节不变时浏览器不会重新',
    '// install / activate，activate 里那趟「清掉上一版外壳产物」也就不会跑。',
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
    generateBundle(_options, bundle) {
      // 指纹取「本次产物的文件名集合」：构建产物带内容哈希，任何一次真改动都会换掉
      // 至少一个文件名，于是 sw.js 的字节也跟着变、浏览器才会去装这份新 SW
      const buildId = createHash('sha1')
        .update(Object.keys(bundle).sort().join('\n'))
        .digest('hex')
        .slice(0, 12)
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: renderServiceWorker(buildId) })
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

/**
 * 23.1.0 的四件资产是**预压 brotli** 的（`clang.wasm.br` / `wasm-ld.wasm.br` /
 * `sys23-fs.tar.br` / `pch-*.pch.br`）：Vercel 自己的 br 档位比本机 q11 弱 ~1.38×，
 * 所以自己压、用 `Content-Encoding: br` 让浏览器透明解压。
 *
 * 浏览器只认响应头，不认扩展名 —— 少了这个中间件，dev/preview 会把 `.br` 当
 * `application/octet-stream` 原样吐出去，`instantiateStreaming` 立刻报 magic word 错，
 * sysroot 解包则变成空文件系统。线上由 vercel.json 的 headers 做同一件事。
 */
function wasmBrotliAssets() {
  const serve = (req, res, next) => {
    const path = (req.url ?? '').split('?')[0]
    if (!/^\/wasm\/[^/]+\/[^/]+\.br$/.test(path) || path.includes('..')) return next()
    try {
      const bytes = readFileSync(join(process.cwd(), 'public', path))
      res.setHeader('Content-Encoding', 'br')
      res.setHeader(
        'Content-Type',
        path.endsWith('.wasm.br')
          ? 'application/wasm'
          : path.endsWith('.pch.br')
            ? 'application/octet-stream'
            : 'application/x-tar',
      )
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      res.setHeader('Content-Length', bytes.length)
      res.end(bytes)
    } catch {
      next()
    }
  }
  return {
    name: 'cp-wasm-brotli-assets',
    configureServer(server) {
      server.middlewares.use(serve)
    },
    configurePreviewServer(server) {
      server.middlewares.use(serve)
    },
  }
}

export default defineConfig({
  plugins: [vue(), precacheManifest(), retainManifest(), serviceWorker(), wasmBrotliAssets()],
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