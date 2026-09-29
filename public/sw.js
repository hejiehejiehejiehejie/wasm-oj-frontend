/* unnamed 的 Service Worker。

   目标：装完外壳即可离线打开，所以 install 阶段只预缓存「构建产物 + 静态资源」。
   **语言工具链不预缓存**（clang 52MB / CPython 24MB）：用户用哪个语言才拉哪个，
   第一次真正请求时由 fetch 处理器的 cacheFirst 按 /wasm/ 前缀写进 TOOLCHAIN_CACHE；
   拉过一次之后同样能离线用。这样不为「可能用不到的语言」在安装时强占带宽与配额。
   **题解渲染器（/md/，katex + marked）同理**：它不算构建产物，进不了
   precache-manifest，用户在设置里点「下载」时才由页面写进 MD_CACHE。

   两条边界：
   1) 不能拦截跨域请求 —— 判题服务地址是用户在顶栏填的，SW 一旦插手就会变成 CORS 事故；
   2) 构建产物带内容哈希，不能在源码里硬编码文件名，安装时去读构建期生成的
      /precache-manifest.json（见 vite.config.js 的 cph-precache-manifest 插件）。 */

const VERSION = 'v3'

// 分开三个桶：工具链与渲染器体积大、基本不变，外壳小而常变，升级外壳时不必重下它们。
// TOOLCHAIN_CACHE / MD_CACHE 都不由 install 预填，只作 cacheFirst 的按需落点
// （见下面的 /wasm/、/md/ 判定）；MD_CACHE 这个名字与 services/mdRuntime.js 里的
// CACHE_NAME 必须一致 —— 页面负责往里写，activate 的 keep 负责别把它清掉。
const SHELL_CACHE = `cph-shell-${VERSION}`
const TOOLCHAIN_CACHE = `cph-toolchain-${VERSION}`
const MD_CACHE = 'cph-md-runtime-v1'

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

// 逐条容错：网络抖动或配额不足都属常见，一条失败不该让整次 install 作废
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

      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, TOOLCHAIN_CACHE, MD_CACHE])
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

// 构建产物、工具链与题解渲染器都带 immutable 语义（文件名带哈希 / 目录名固定且带版本），
// 可以放心缓存优先。
async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached

  const response = await fetch(request)
  if (response.ok && response.type === 'basic') {
    const cache = await caches.open(bucketFor(request.url))
    cache.put(request, response.clone())
  }
  return response
}

/**
 * 按路径前缀分桶：工具链与题解渲染器各自一桶（便于「卸载」整桶删掉），
 * 其余外壳资产进 SHELL_CACHE。
 */
function bucketFor(url) {
  if (url.includes('/wasm/')) return TOOLCHAIN_CACHE
  if (url.includes('/md/')) return MD_CACHE
  return SHELL_CACHE
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