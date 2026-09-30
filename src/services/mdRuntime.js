/**
 * Markdown / LaTeX 渲染器的本地运行时。
 *
 * 与 `public/wasm/` 下的 C++ / Python 工具链同一套路数：资产放在固定路径 `/md/` 下、
 * 不进打包产物、不进预缓存清单，用户点了「下载」才逐个写进 Cache Storage。
 * 这样「没下载过的用户，外壳里没有它任何一份」是真的，而不是一句口号。
 *
 * 三个与工具链不同的地方，都是因为渲染器是 JS 而不是 WASM：
 * 1) 没有 IndexedDB 落盘，也不解压 —— 下载就是 `fetch` + `cache.put`；
 * 2) 清单来自构建期生成的 `/md/assets.json`（见 scripts/prepare-md-runtime.mjs），
 *    所以 katex 升版后不需要改这里的任何一行；
 * 3) 判据只看 Cache Storage：页面自己就能读写 Cache Storage（不需要 SW 控制），
 *    所以 dev 模式下的「已下载」同样成立，不需要像 wasmRuntime 那样退回 HTTP 缓存 ——
 *    那层缓存没有 API 可清，卸载后会把资产立刻判回「已就绪」。
 *
 * 缓存桶名不在这里写死：定义在 services/storageNames.js（`MD_CACHE`），SW 那边管保留
 * 与清理、这里管读写，共用同一份 —— 各写一份字面量时改漏一处，用户下载好的渲染器
 * 会被 SW 当垃圾删掉。
 */

import { t } from '../i18n/index.js'
import { MD_CACHE } from './storageNames.js'

const BASE = '/md/'
const MANIFEST_URL = `${BASE}assets.json`

/**
 * 「已下载」的存档标记，与设置面板里那一行共用同一个键（值就是 JSON 的 true/false，
 * 与 usePersistentRef 的写法一致）。
 *
 * 它只是**首帧的播种值**：真正的判据永远是 probeMdRuntime() 的缓存探针（浏览器随时
 * 可能清缓存，标记却还留着）。放在这里是为了让「预览面板点了下载」与「设置面板点了下载」
 * 落的是同一份记录 —— 否则从预览下的那一次，下次打开设置会先闪一下「未下载」。
 */
export const MD_READY_FLAG_KEY = 'cp.localRuntime.markdownReady'

function writeReadyFlag(value) {
  try {
    window.localStorage.setItem(MD_READY_FLAG_KEY, JSON.stringify(value))
  } catch {
    /* 存不进去就算了，探针下次打开还会以缓存为准校正 */
  }
}

/** @type {{ assets: string[], bytes: number } | null} 本次会话读到的清单（探针/下载共用） */
let manifest = null
/** @type {{ marked: unknown, katex: unknown } | null} 注入完成后的渲染器 */
let renderer = null
/** @type {Promise<{ marked: unknown, katex: unknown }> | null} */
let injecting = null

/**
 * 已在缓存里的清单；读不到就返回 null（**不触网** —— 探针每次打开设置都会跑）。
 * @returns {Promise<{ assets: string[], bytes: number } | null>}
 */
async function readCachedManifest() {
  if (manifest) return manifest
  try {
    const cached = await caches.match(MANIFEST_URL)
    if (!cached) return null
    manifest = await cached.json()
    return manifest
  } catch {
    // Cache Storage 用不了（隐私模式等）：当作没下载
    return null
  }
}

async function areAssetsCached(assets) {
  try {
    const hits = await Promise.all(assets.map((url) => caches.match(url)))
    return hits.every(Boolean)
  } catch {
    return false
  }
}

/**
 * 资产是否都在本机（不触网）。有内存里已注入的渲染器就直接算就绪 ——
 * 那条路径在本次会话里一定可用，不必再去翻缓存。
 * @returns {Promise<boolean>}
 */
export async function probeMdRuntime() {
  if (renderer) return true
  const cached = await readCachedManifest()
  if (!cached) return false
  return areAssetsCached(cached.assets)
}

/**
 * 把所有资产拉进 Cache Storage。清单本身也存一份，探针才能在离线时知道「要查哪些文件」。
 * @param {(status: { stage: string, message: string }) => void} [onStatus]
 * @param {AbortSignal} [signal]
 */
async function downloadMdRuntime(onStatus, signal) {
  const response = await fetch(MANIFEST_URL, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(t('error.downloadFailed', { label: MANIFEST_URL, status: response.status }))
  }
  const fresh = await response.json()
  const cache = await caches.open(MD_CACHE)
  await cache.put(MANIFEST_URL, new Response(JSON.stringify(fresh)))

  const total = fresh.assets.length
  let done = 0
  for (const url of fresh.assets) {
    if (signal?.aborted) throw new DOMException('cancelled', 'AbortError')
    const asset = await fetch(url, { cache: 'no-store' })
    if (!asset.ok) {
      throw new Error(t('error.downloadFailed', { label: url, status: asset.status }))
    }
    await cache.put(url, asset)
    done += 1
    onStatus?.({ stage: 'download', message: t('runtime.markdown.progress', { done, total }) })
  }

  // 内存里的旧清单作废：新下载的可能换了版本（文件数不同）
  manifest = fresh
  writeReadyFlag(true)
}

/**
 * 设置页「下载」按钮的入口，返回契约与 wasmRuntime.preload 一致。
 * @param {AbortSignal} [signal]
 * @param {(status: { stage: string, message: string }) => void} [onStatus]
 */
export async function preloadMdRuntime(signal, onStatus) {
  if (signal?.aborted) return { type: 'cancelled' }
  onStatus?.({ stage: 'download', message: t('runtime.markdown.downloading') })
  const startedAt = performance.now()
  try {
    await downloadMdRuntime(onStatus, signal)
    return { type: 'ready', durationMs: Math.round(performance.now() - startedAt) }
  } catch (error) {
    if (signal?.aborted) return { type: 'cancelled' }
    return { type: 'failure', stage: 'infra', message: error?.message || String(error) }
  }
}

/**
 * 卸载：删桶 + 拔掉已注入的样式与脚本 + 清掉全局对象。
 *
 * 后两步不能省：`<script>` 一旦执行，`window.katex` 就一直在，只删缓存的话
 * 「卸载过的渲染器」还能继续渲染，面板却显示「未下载」—— 状态与实际对不上。
 */
export async function uninstallMdRuntime() {
  renderer = null
  injecting = null
  manifest = null
  writeReadyFlag(false)
  for (const element of document.querySelectorAll('[data-md-runtime]')) element.remove()
  delete window.katex
  delete window.marked
  try {
    await caches.delete(MD_CACHE)
  } catch {
    /* 缓存用不了（隐私模式等）：本来也没下载成功过，忽略 */
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = src
    script.dataset.mdRuntime = 'script'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(t('error.downloadFailed', { label: src, status: 0 })))
    document.head.append(script)
  })
}

async function injectRenderer() {
  const cached = await readCachedManifest()
  if (!cached || !(await areAssetsCached(cached.assets))) {
    const error = new Error('Markdown runtime is not downloaded')
    error.code = 'MD_RUNTIME_MISSING'
    throw error
  }
  if (!document.querySelector('link[data-md-runtime="style"]')) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = `${BASE}katex.min.css`
    link.dataset.mdRuntime = 'style'
    document.head.append(link)
  }
  // 顺序固定：marked 与 katex 都是 UMD，各挂各的全局，先后不影响结果，
  // 但串行加载能保证 resolve 时两个全局都已经就位
  await loadScript(`${BASE}marked.min.js`)
  await loadScript(`${BASE}katex.min.js`)
  renderer = { marked: window.marked, katex: window.katex }
  return renderer
}

/**
 * 拿到渲染器（marked + katex）。未下载时抛 `code === 'MD_RUNTIME_MISSING'` 的错误，
 * 由调用方决定是提示去下载还是干脆不渲染。
 * @returns {Promise<{ marked: unknown, katex: unknown }>}
 */
export function loadMdRenderer() {
  if (renderer) return Promise.resolve(renderer)
  if (!injecting) {
    injecting = injectRenderer().catch((error) => {
      // 失败不缓存，否则一次加载失败会把后面所有重试都钉死
      injecting = null
      throw error
    })
  }
  return injecting
}