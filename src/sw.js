/* unnamed 的 Service Worker —— **源码模板**，构建产物是同路径的 dist/sw.js。

   目标：装完外壳即可离线打开，所以 install 阶段只预缓存「构建产物 + 静态资源」。
   **语言工具链不预缓存**（clang 52MB / CPython 24MB）：用户用哪个语言才拉哪个，
   第一次真正请求时由 fetch 处理器的 cacheFirst 按 /wasm/ 前缀写进 TOOLCHAIN_CACHE；
   拉过一次之后同样能离线用。这样不为「可能用不到的语言」在安装时强占带宽与配额。
   **题解渲染器（/md/，katex + marked）同理**：它不算构建产物，进不了
   precache-manifest，用户在设置里点「下载」时才由页面写进 MD_CACHE。

   五条边界：
   1) 不能拦截跨域请求 —— 判题服务地址是用户在顶栏填的，SW 一旦插手就会变成 CORS 事故；
   2) 构建产物带内容哈希，不能在源码里硬编码文件名，安装时去读构建期生成的
      /precache-manifest.json（见 vite.config.js 的 cp-precache-manifest 插件）；
   3) 不能拦截 /api/* —— 那是**随时会变**的数据（同一 handle 的云端配置每次上传都换一份），
      没有内容哈希可依赖，落进 cacheFirst 就等于把第一次读到的那份永久钉死。
      见下面 fetch 处理器里的放行判断。
   4) 同理不能拦 /manifest.webmanifest（2026-10-14 加）—— 它也是**会变、且没有内容哈希**的
      文件。原本它进 STATIC_ASSETS 预缓存、之后又被 fetch 的 cacheFirst 兜底写进外壳桶，
      而外壳桶在 activate 的白名单里**永不过期**：线上 theme_color 改了，装了应用的设备
      却一直读旧的那份。实感就是安卓上「添加到主屏后那条状态栏永远是旧配色」
      （2026-10-14 实测：设备停在 10-04 那版的 `#2a2a2b`，线上早已是 `#1c1c1c`）。
      它不必离线可用，直接放行给网络。
   5) 站点图标一组（`/favicon.svg`、`/favicon.ico`、`/icons/*.png`）同样不能拦
      （2026-10-15 加）—— 与 4 是同一条判据：**会变、路径里又没有内容哈希**。它们原先
      躺在 STATIC_ASSETS 里，被 cacheFirst 钉进那个永不过期的外壳桶，于是「图换了、
      老设备永远看不到新的」。实感：把图标的白底改成透明圆角重新发版后，用户反复看到
      白底、普通刷新一直是旧的、偶尔一次硬刷新（绕过 SW）才对，过一会又变回去 ——
      因为只有那一次是网络给的，其余都吃桶里那份装机时的图（2026-10-15 CDP 实测：
      标签页的 `/favicon.ico` 请求 `fromServiceWorker: true`；把旧图塞进桶后普通刷新
      拿到旧图、`Network.setBypassServiceWorker` 后再刷才拿到新图）。
      图标不必离线可用（离线时页面本来就靠外壳桶渲染），放行给网络。

   ⚠ 下面用到的桶名常量（SHELL_CACHE / TOOLCHAIN_CACHE / MD_CACHE / LEGACY_BUCKETS）
   **不在本文件里定义**。SW 是 classic worker，没有 import，读不到 services/storageNames.js，
   所以它们由 vite.config.js 的 cp-service-worker 插件在构建期（dev 下是每次请求）
   生成一段 `const …` 声明前置到这份源码上 —— 要看定义和改名注意事项，去那个文件。 */

// ⚠ 这份列表里的东西会被 fetch 处理器当**不变**的资产缓存优先生效，所以只放
// 「构建产物 + 永不改内容的静态资源」。判据是**内容会不会变**，不是「在不在 public/ 下」——
// 两类被挡在外面：
//   · `/manifest.webmanifest` —— 随发版改（`theme_color` 就改过三次），见文件头边界 4；
//   · 站点图标一组（`/favicon.svg`、`/favicon.ico`、`/icons/*.png`，2026-10-15 摘）——
//     它们**改过**（白底改透明圆角），而路径里没有内容哈希，留着就等于拿装机那一刻的图
//     永久盖住新图，见文件头边界 5。
// 同一判据的另外两个样板是 `public/extension/*.zip` 与 `public/fonts/*.woff2`：同样是会变、
// 无哈希的资产，靠**文件名带版本**轮换，所以也不进这份列表。
const STATIC_ASSETS = ['/', '/index.html']

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

/**
 * 把改名前的旧桶原样搬进新桶，再删掉旧桶。
 *
 * 逐条 `put` 时把旧桶 match 出来的 Response 直接交出去，靠 Cache API 自己流式落盘，
 * 不把 76MB 读进内存（`response.blob()` 那种写法在老设备上会直接崩）。
 * 任一条出错就整个放弃、**不删旧桶** —— 让下面那趟白名单清理兜底删掉它，
 * 用户最多重下一次，好过留一个半拉子新桶让工具链加载失败。
 */
async function migrateLegacyBuckets() {
  for (const [from, to] of LEGACY_BUCKETS) {
    try {
      const names = await caches.keys()
      if (!names.includes(from)) continue

      const source = await caches.open(from)
      const target = await caches.open(to)
      for (const request of await source.keys()) {
        if (await target.match(request)) continue
        const response = await source.match(request)
        if (response) await target.put(request, response)
      }
      await caches.delete(from)
    } catch {
      /* 搬不动就交给下面那趟清理处理 */
    }
  }
}

/**
 * 外壳桶里**按版本换代**的三类路径。共同性质：URL 里带着版本（内容哈希 / 文件名里的
 * 字体或扩展版本），所以旧 URL 永远没人再取 —— 桶里剩下它就是纯占地方。
 */
const SHELL_VERSIONED_PREFIXES = ['/assets/', '/fonts/', '/extension/']

/**
 * 清掉外壳桶里「上一版留下、这一版再没人要」的条目 —— **版本清单驱动的回收**。
 *
 * 为什么必须有这一趟：install 只往桶里**加**，activate 的清理又是按**整桶**删的
 * （见下面白名单），同桶内的旧条目没有任何一条代码会回收。而外壳桶里有一整类
 * 「URL 随版本换代」的资产：构建产物带内容哈希（每发一次版就多一份新的 `main-*.js`，
 * 4.3–4.5MB）、字体文件名带字体内部版本、扩展安装包文件名带扩展版本。旧的那份再也没人
 * 按它的 URL 取，却一直占着配额（实测 2026-10-25：`cp-shell-v5` 68 条 / 约 170MB，
 * 其中只有 16 条 / 5.2MB 是当前这版，其余全是 10-14 至 10-24 历次发版的残骸）。
 *
 * 判据收窄到上面那三类前缀，别的一律不碰：`/`、`/index.html`、guide / notice / privacy
 * 这些按固定 URL 存的页面由 networkFirstNavigation 覆盖写同一个 key，本来就不会堆积；
 * `/<handle>` 那种「一 handle 一个 key」的入口页也不是旧产物，是另一个人的入口。
 *
 * 清单（`/retain-manifest.json`，vite.config.js 的 cp-retain-manifest 生成）拿不到
 * ——网络抖动 / 部署中 / 上一版根本没这个文件——就整趟放弃：宁可这一轮不清，也不能在
 * 清单为空时把当前外壳删光，那会让离线打开直接白屏。
 *
 * 工具链那半不在这里：`cp-toolchain` 里的旧目录由页面侧
 * `runnoSandbox.pruneLegacyToolchainCache()` 按当前资产前缀回收（SW 读不到版本号，
 * 硬编码一张「要清哪一代」的表又会漏掉下一代）。
 */
async function pruneStaleShellArtifacts() {
  let retain
  try {
    const response = await fetch('/retain-manifest.json', { cache: 'no-store' })
    if (!response.ok) return
    retain = await response.json()
  } catch {
    return
  }
  const keepList = retain?.shell
  if (!Array.isArray(keepList) || keepList.length === 0) return

  const keep = new Set(keepList)
  const cache = await caches.open(SHELL_CACHE)
  await Promise.all(
    (await cache.keys()).map((request) => {
      const { pathname } = new URL(request.url)
      const versioned = SHELL_VERSIONED_PREFIXES.some((prefix) => pathname.startsWith(prefix))
      return versioned && !keep.has(pathname) ? cache.delete(request) : null
    }),
  )
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await migrateLegacyBuckets()
      // 白名单：这三个桶之外的缓存一律删掉（旧外壳桶、上一代工具链桶都在这趟里清）
      const keep = new Set([SHELL_CACHE, TOOLCHAIN_CACHE, MD_CACHE])
      const names = await caches.keys()
      await Promise.all(names.map((name) => (keep.has(name) ? null : caches.delete(name))))
      await pruneStaleShellArtifacts()
      await self.clients.claim()
    })(),
  )
})

// 导航走网络优先：这样重新部署后刷新一次就能拿到新外壳，断网时再退回缓存里的 index.html。
//
// 回填缓存必须按路径分情况，不能一律写 /index.html：离线兜底是靠 caches.match('/index.html')
// 取的，只有「/ 与 /index.html」这两条配覆写它。像 /guide.html、/notice.html 同样是导航
// （mode === 'navigate'）却是完全不同的页面，若也写到 /index.html 上，用户看过一次使用指南
// 之后再断网打开站点，拿到的就是那份指南 —— 外壳被换掉了。这些页面按自己的 URL 存：
// 离线再开同一页仍能命中，别的页拿到的还是外壳。
async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const path = new URL(request.url).pathname
      // 站点的 /<handle> 入口（www.998244353.best/he-jie）也属于外壳：线上由 vercel.json 的
      // rewrite 交给 index.html 渲染，所以它同样按自己的 URL 存即可，内容是对的。
      const key = path === '/' || path === '/index.html' ? '/index.html' : request
      const cache = await caches.open(SHELL_CACHE)
      cache.put(key, response.clone())
    }
    return response
  } catch {
    const cached = (await caches.match(request)) ?? (await caches.match('/index.html'))
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

  // /api/* 一律放行（边界 3）：云端配置是**会变**的数据，必须每次问网络。
  // 之前它落到下面 cacheFirst 的兜底桶（即外壳桶 `cp-shell-*`），而那个桶在 activate 的
  // keep 白名单里永不过期 —— 同一台设备第二次点「下载到本机」拿回的永远是**第一次**读到的那份，
  // 表现就是「上传了新配置，云端同步却没起作用」。写入走 POST，本来就被上面的
  // method 判断挡掉了；这里要挡的是读配置的 GET /api/config/<handle>。
  if (url.pathname.startsWith('/api/')) return

  // /manifest.webmanifest 与 /api/* 同类（边界 4）：会变、无内容哈希。放行进网络，
  // **既不读缓存也不写缓存** —— 下面 cacheFirst 在未命中时也会把响应写进兜底桶，
  // 只把它从 STATIC_ASSETS 里摘掉是不够的。
  // 影响面：安卓（Firefox 添加到主屏）那条状态栏的配色就取自这份 manifest 的 theme_color，
  // 被钉住 = 用户永远停在装机那一刻的配色，重装图标才解得开。
  if (url.pathname === '/manifest.webmanifest') return

  // 站点图标与上面两条同类（边界 5）：会变、无内容哈希。同样**既不读缓存也不写缓存** ——
  // 只把它从 STATIC_ASSETS 里摘掉是不够的：下面 cacheFirst 在未命中时照样会把响应写进
  // 兜底桶，下次改图又回到「改了不生效」。`/icons/` 用整目录前缀，将来加尺寸不必回来补。
  if (url.pathname === '/favicon.svg' || url.pathname === '/favicon.ico') return
  if (url.pathname.startsWith('/icons/')) return

  event.respondWith(request.mode === 'navigate' ? networkFirstNavigation(request) : cacheFirst(request))
})
