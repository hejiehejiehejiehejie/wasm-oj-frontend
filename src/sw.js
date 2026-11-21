/* unnamed 的 Service Worker —— **源码模板**，构建产物是同路径的 dist/sw.js。

   目标：装完外壳即可离线打开，所以 install 阶段只预缓存「构建产物 + 静态资源」。
   **语言工具链不预缓存**（C++ 约 38MB / CPython 24MB）：用户用哪个语言才拉哪个。
   Python 仍由 fetch 处理器的 cacheFirst 按 /wasm/ 前缀写进 TOOLCHAIN_CACHE；
   **C++ 工具链自 2026-11-22 起由页面 / Worker 直接写桶**（见边界 7），SW 只透传。
   拉过一次之后同样能离线用，这样不为「可能用不到的语言」在安装时强占带宽与配额。
   **题解渲染器（/md/，katex + marked）同理**：它不算构建产物，进不了
   precache-manifest，用户在设置里点「下载」时才由页面写进 MD_CACHE。

   七条边界：
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
   6) PCH（`*.pch.br`）不进 Cache Storage（2026-11-03 加）—— 页面把它存在 IndexedDB
      （`cp-pch`），编译与语法检查只从那里读；SW 再存一份纯属冗余，而且 Cache API 存的是
      **解压后**的 body（实测请求头 `Content-Length` 8.29MB，桶里占 18.37MB）。
      更麻烦的是它会在同目录里换名（改编译参数 / 改万能头），旧条目落在「当前版本前缀」
      里，`pruneLegacyToolchainCache` 的版本判据清不到，只能永久占着。放行进网络即可：
      资源自带 `immutable, max-age=1y` 的 HTTP 磁盘缓存，IndexedDB 被手动清掉时照样
      免流量恢复。
   7) 工具链新格式（`*.gzbin` 与 `__toolchain_manifest__.json`）**纯透传网络**（2026-11-22 加，
      边界 1 的单一写入源原则）—— 它们只由页面 / Worker 通过 services/toolchainStore.js
      直接写 `cp-toolchain`。SW 一旦也走 cacheFirst 或写桶，就会出现同键并发双写
      （存储锁冲突、双倍内存），而且「修复重下」时旧坏缓存会被 SW 原样吐回给下载逻辑。
      回退读旧条目（`.br`）也由页面侧的 `caches.match` 完成，不需要 SW 插手。

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

/**
 * 工具链桶里**旧条目**的存储编码标记（2026-11-05 加，P3）。
 *
 * 历史：那时 `.br` 靠 `Content-Encoding: br` 让浏览器透明解压，Cache API 落桶的是
 * 77.3MB 的解压态，SW 只好用 `CompressionStream('gzip')` 再压一遍。这个头就是
 * 「桶里这份是 gzip」的标记，读取时必须解压。
 *
 * 2026-11-22 起新链路换成 `*.gzbin`（服务端就是 gzip 字节、页面原样落桶），
 * 写入完全由 services/toolchainStore.js 负责，**SW 不再参与**；`activate` 里那次
 * 全量重压缩迁移也已删除（手机端在 SW 里压 89MB 几乎注定被系统随时杀掉）。
 * 这个标记只留给老用户桶里的旧条目做读取兼容 —— 新写入的条目同样带它，
 * 但那是 toolchainStore 写的，与下面这两个常量无关。
 */
const STORAGE_ENCODING_HEADER = 'x-cp-storage-encoding'
const STORAGE_ENCODING_GZIP = 'gzip'


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
 * 外壳桶里永远要留的两份入口。清单只管「按 URL 取」的静态资产，外壳不在清单里 ——
 * 而离线兜底正是靠 `caches.match('/index.html')` 取的，绝不能把它当残留删掉。
 */
const SHELL_ALWAYS_KEEP = ['/', '/index.html']

/**
 * 清掉外壳桶里「这一版再没人要」的条目 —— **清单驱动的回收**。
 *
 * 为什么必须有这一趟：install 只往桶里**加**，activate 的清理又是按**整桶**删的
 * （见下面白名单），同桶内的旧条目没有任何一条代码会回收。外壳桶里会攒下三类残骸：
 *   · 构建产物带内容哈希（每发一次版就多一份新的 `main-*.js`，4.3–4.5MB）、字体文件名
 *     带字体内部版本、扩展安装包文件名带扩展版本；
 *   · `networkFirstNavigation` 按 request 存的导航条目 —— 站点的 `/<handle>` 入口页
 *     「一 handle 一个 key」，换个人打开就多一条，谁也不会再删；
 *   · 带查询串的 key（`fetch('/retain-manifest.json?v=<时间戳>')` 这类绕缓存请求），
 *     时间戳每次都不同，按 pathname 判重根本认不出来。
 * 实测 2026-10-25：`cp-shell-v5` 68 条 / 约 170MB，只有 16 条 / 5.2MB 是当前这版。
 *
 * 所以判据只有一条：**不在 `/retain-manifest.json` 的 shell 清单里就删**（外加两份
 * 外壳入口，见 SHELL_ALWAYS_KEEP）。清单列的是「这一版还部署着的 URL」，任何其它 key
 * 都是不会再被按原样取用的死数据。带查询串的 key 按**整串**比对 —— 只比 pathname 的话，
 * `/retain-manifest.json` 在清单里就能把它的无数个 `?v=` 变体全保下来。
 *
 * 代价是 `/guide.html`、`/notice.html` 这类固定 URL 的导航页也会在 activate 时被删掉：
 * 它们不堆积，但也不是这一版的资产。下一次打开那页会照常回填；这之间若断网打开，
 * 拿到的就是外壳（`networkFirstNavigation` 的兜底），不是那一页 —— 可以接受。
 *
 * 清单（vite.config.js 的 cp-retain-manifest 生成）拿不到 ——网络抖动 / 部署中 /
 * 上一版根本没这个文件——就整趟放弃：宁可这一轮不清，也不能在清单为空时把当前外壳
 * 删光，那会让离线打开直接白屏。
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

  const keep = new Set([...SHELL_ALWAYS_KEEP, ...keepList])
  const cache = await caches.open(SHELL_CACHE)
  await Promise.all(
    (await cache.keys()).map((request) => {
      const url = new URL(request.url)
      const key = url.search ? `${url.pathname}${url.search}` : url.pathname
      return keep.has(key) ? null : cache.delete(request)
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
      // 工具链的新格式（.gzbin + manifest）只在页面侧落桶，SW 不做任何迁移 / 重压缩：
      // 手机端在 SW 里压 89MB 会被系统随时杀掉，而且和页面的 cache.put 会变成同键双写。
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
async function cacheFirst(event, request) {
  const cached = await caches.match(request)
  if (cached) return serveCachedToolchain(cached)

  const response = await fetch(request)
  if (response.ok && response.type === 'basic') {
    // 工具链按 gzip 落盘（见 STORAGE_ENCODING_HEADER）：浏览器已经把 br 解开了，
    // 只有我们自己重压一遍，配额才会从 89MB 掉到 25MB。
    if (bucketFor(request.url) === TOOLCHAIN_CACHE && response.body) {
      return storeCompressedToolchain(event, request, response)
    }
    const cache = await caches.open(bucketFor(request.url))
    cache.put(request, response.clone())
  }
  return response
}

/**
 * 把缓存里的工具链条目还原成「解压态」再交出去。
 *
 * 新条目带 `x-cp-storage-encoding: gzip`，要过一遍 `DecompressionStream('gzip')`；
 * 旧条目（没有这个头）本来就是解压态，原样返回 —— 老用户的桶里两种都可能存在，
 * 2026-11-22 删除全量迁移之后仍要能读。
 *
 * 构造新 Response 时**必须保留 `Content-Type`**：工具链是 `application/wasm`，
 * 丢了它 `WebAssembly.compileStreaming` 会直接抛
 * `TypeError: Incorrect response MIME type. Expected 'application/wasm'`。
 */
function serveCachedToolchain(cached) {
  if (cached.headers.get(STORAGE_ENCODING_HEADER) !== STORAGE_ENCODING_GZIP) return cached
  if (typeof DecompressionStream === 'undefined' || !cached.body) return cached
  const headers = new Headers(cached.headers)
  headers.delete(STORAGE_ENCODING_HEADER)
  headers.delete('content-length')
  headers.delete('content-encoding')
  return new Response(cached.body.pipeThrough(new DecompressionStream(STORAGE_ENCODING_GZIP)), {
    status: cached.status,
    statusText: cached.statusText,
    headers,
  })
}

/**
 * 首次落盘：网络流拆成两路，一路原样回给调用方（保留 compileStreaming 的流式编译与
 * V8 的 wasm code cache），一路压成 gzip 写进桶。
 *
 * `event.waitUntil` 必须**在返回 Response 之前**注册：等 respondWith 的 promise 决议后
 * 再调会抛 `InvalidStateError: The event handler is already finished`。所以压缩写盘的
 * promise 在这里同步挂上，而不是在调用方 await 之后。
 *
 * tee 的缓存分支比客户端慢时会在 SW 里积压未消费缓冲 —— 这是这条路线唯一的内存风险，
 * 需要用低端机/限速实测 RSS（见方案 A 的风险项）。
 */
function storeCompressedToolchain(event, request, response) {
  if (typeof CompressionStream === 'undefined') return response
  const [clientBranch, cacheBranch] = response.body.tee()
  const headers = new Headers(response.headers)
  headers.set(STORAGE_ENCODING_HEADER, STORAGE_ENCODING_GZIP)
  headers.delete('content-length')
  headers.delete('content-encoding')
  const write = (async () => {
    const cache = await caches.open(TOOLCHAIN_CACHE)
    await cache.put(
      request,
      new Response(cacheBranch.pipeThrough(new CompressionStream(STORAGE_ENCODING_GZIP)), {
        status: response.status,
        statusText: response.statusText,
        headers,
      }),
    )
  })().catch(() => {
    /* 配额 / 中途取消：这次没存下不影响调用方，下次请求再补 */
  })
  if (typeof event.waitUntil === 'function') event.waitUntil(write)
  return new Response(clientBranch, response)
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

  // PCH 归 IndexedDB 独占（边界 6）：这里**既不读也不写** —— 只从 STATIC_ASSETS 摘掉不够，
  // cacheFirst 在未命中时照样会把 18MB 解压后的 body 写进工具链桶。
  if (/\.pch\.br$/.test(url.pathname)) return

  // 工具链新格式（边界 7）：`*.gzbin`、页面提交的 manifest，以及构建期生成的静态清单
  // 都必须纯透传 —— 前两个只能由 toolchainStore 写（cacheFirst 会让旧坏缓存拦住
  // 「修复重下」）；静态清单虽小，但它是同版本内**可能随构建变**的元数据，
  // 被 cacheFirst 钉住会让下载侧拿旧尺寸去校验新字节，表现为「下载永远失败」。
  if (
    url.pathname.endsWith('.gzbin') ||
    url.pathname.endsWith('/__toolchain_manifest__.json') ||
    url.pathname.endsWith('/toolchain-assets.json')
  )
    return

  event.respondWith(
    request.mode === 'navigate' ? networkFirstNavigation(request) : cacheFirst(event, request),
  )
})
