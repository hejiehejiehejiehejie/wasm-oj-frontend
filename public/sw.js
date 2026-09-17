/* CPH Workbench 的 Service Worker。

   目标：装完就能离线用，所以 install 阶段一次性把「构建产物 + 静态资源 + 52MB 的 clang
   工具链」全部预缓存。工具链是本项目最大的资产，也是离线编译的硬前提。

   两条边界：
   1) 不能拦截跨域请求 —— 判题服务地址是用户在顶栏填的，SW 一旦插手就会变成 CORS 事故；
   2) 构建产物带内容哈希，不能在源码里硬编码文件名，安装时去读构建期生成的
      /precache-manifest.json（见 vite.config.js 的 cph-precache-manifest 插件）。 */

const VERSION = 'v1'

// 分开两个桶：工具链体积大、基本不变，外壳小而常变，升级外壳时不必重下 52MB
const SHELL_CACHE = `cph-shell-${VERSION}`
const TOOLCHAIN_CACHE = `cph-toolchain-${VERSION}`

// 目录名就是工具链版本号，升级时换目录即可，与 vercel.json 的 immutable 缓存对齐
const TOOLCHAIN_ASSETS = [
  '/wasm/8.0.1/clang.wasm',
  '/wasm/8.0.1/wasm-ld.wasm',
  '/wasm/8.0.1/clang-fs.tar.gz',
]

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
]

// 逐条容错：工具链有 52MB，网络抖动或配额不足都属常见，一条失败不该让整次 install 作废
// （install 失败等于永远装不上）。没进缓存的，之后真正请求时再由 fetch 处理器补。
async function addAllSafe(cache, urls) {
  await Promise.all(urls.map((url) => cache.add(url).catch(() => {})))
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const manifest = await fetch('/precache-manifest.json', { cache: 'no-store' })
        .then((response) => (response.ok ? response.json() : []))
        .catch(() => [])

      const shell = await caches.open(SHELL_CACHE)
      await addAllSafe(shell, [...STATIC_ASSETS, ...manifest])

      // 工具链走 HTTP 缓存复用，不会真的重新下载一遍
      const toolchain = await caches.open(TOOLCHAIN_CACHE)
      await addAllSafe(toolchain, TOOLCHAIN_ASSETS)

      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, TOOLCHAIN_CACHE])
      const names = await caches.keys()
      await Promise.all(names.map((name) => (keep.has(name) ? null : caches.delete(name))))
      await self.clients.claim()
    })(),
  )
})

// 导航走网络优先：这样重新部署后刷新一次就能拿到新外壳，断网时再退回缓存里的 index.html。
async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE)
      cache.put('/index.html', response.clone())
    }
    return response
  } catch {
    const cached = await caches.match('/index.html')
    return cached ?? Response.error()
  }
}

// 构建产物与工具链都带 immutable 语义（文件名带哈希 / 目录名带版本），可以放心缓存优先。
async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached

  const response = await fetch(request)
  if (response.ok && response.type === 'basic') {
    const bucket = request.url.includes('/wasm/') ? TOOLCHAIN_CACHE : SHELL_CACHE
    const cache = await caches.open(bucket)
    cache.put(request, response.clone())
  }
  return response
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  // 跨域（判题服务）一律放行，交给页面自己处理 CORS
  if (url.origin !== self.location.origin) return

  // Range 请求的响应是 206，塞进 Cache Storage 会抛错，直接放行
  if (request.headers.has('range')) return

  event.respondWith(request.mode === 'navigate' ? networkFirstNavigation(request) : cacheFirst(request))
})