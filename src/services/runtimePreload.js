/**
 * 「本地运行环境 › 预下载」的启动侧实现。
 *
 * 设置页给 C++ / Python / 题解渲染器各留了一个「预下载」勾选（存在 `cp.autoPreload`，
 * 是运行时 id 的数组）。**2026-10-25 起 C++ 默认开启**：缺省视为 `['cpp']`，显式 `[]`
 * 才是用户关闭。Python / 渲染器仍按勾选。
 *
 * 三条边界：
 * 1) **只下到 Cache Storage，不 init 宿主、不 untar**：`preloadToolchain()` 会建 worker、
 *    解 1385 条 sysroot（~27 MiB 常驻），后台预取不该让每个访客都为没用到的语言付内存；
 * 2) **等 SW 接管**：首访时 SW 还没 controller，那几发 fetch 不进 `cp-toolchain`；
 *    今天等 `ready` + `controllerchange` 后再 idle 动手；
 * 3) 尽力而为：探针说已有就跳过；失败静默，用户真正点▶时照样按需下载。
 */
import { preload, probeRuntime } from './wasmRuntime.js'
import { prefetchPch, prefetchRuntimeAssets, pruneLegacyToolchainCache } from './runnoSandbox.js'
import { supportsCppToolchain } from './wasmFeatures.js'
import { IS_DESKTOP } from './platform.js'

/** 勾选项落在这个键里：运行时 id 的数组；**缺省 = 预取 C++**，显式 `[]` = 全关 */
export const AUTO_PRELOAD_KEY = 'cp.autoPreload'

const DEFAULT_PRELOAD = ['cpp']

/**
 * 读勾选项。键不存在时给 `['cpp']`；手改成别的形状 / 不认识的语言名按空处理。
 * 这个函数被启动流程调用，不能抛。
 */
export function readAutoPreload() {
  try {
    const raw = window.localStorage.getItem(AUTO_PRELOAD_KEY)
    if (raw === null || raw === undefined) return [...DEFAULT_PRELOAD]
    const value = JSON.parse(raw)
    if (!Array.isArray(value)) return []
    return value.filter((id) => id === 'cpp' || id === 'python' || id === 'markdown')
  } catch {
    return []
  }
}

/**
 * 按勾选顺序逐个补齐。串行而不是并发：这些资产动辄几十 MB，一起下只会互相抢带宽。
 * 注意这里**不调用** `preload()` 去拉 C++ / Python —— 那条路会加载运行时；
 * 只有题解渲染器（markdown 是模块 + 资源，不是 WASI 工具链）仍走 `preload()`。
 */
export async function runAutoPreload() {
  // 先清掉不属于当前版本的 /wasm/ 条目（上一代工具链、换掉的 CPython）：
  // 当前档已经缓存时下面的 probe 会 continue，不在这里清就永远没人回收它们。
  await pruneLegacyToolchainCache()
  for (const id of readAutoPreload()) {
    try {
      // 浏览器缺 wasm 异常 / SIMD 时 C++ 那 23 MiB 装了也跑不起来 —— 别替用户下。
      // 用户真去点▶会拿到一句明确的「缺什么 / 要什么版本」，比在这里静默预取到底好。
      if (id === 'cpp' && !supportsCppToolchain()) continue
      if (id === 'markdown') {
        if (await probeRuntime(id)) continue
        const result = await preload(id)
        if (result.type !== 'ready') return
        continue
      }
      if (!(await probeRuntime(id))) await prefetchRuntimeAssets(id)
      // 预编译 PCH（约 8MB）单独一份：它不在 `runtimeAssetURLs` 里 —— 那张表同时是
      // 「工具链是否已下载」的判据，塞进去会让所有老用户被判成「没下过」。所以这里
      // **不看**上面那条探针结果，老用户也能补齐这一份（SW 命中时几乎没有成本）。
      if (id === 'cpp') await prefetchPch()
    } catch {
      // 断网 / 配额 / 探测失败：这次没提前下好，别继续把剩下的也试一遍
      return
    }
  }
}

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(false), ms)
  })
}

/**
 * 等 Service Worker 真正接管页面，再动手。
 *
 * `ready` 只保证 active，不保证 controller；首访是 `clients.claim()` 之后才接管。
 * 拿不到就返回 false（宁可不预取，也别在未受控页面上白下一遍）。
 */
async function waitForController(timeoutMs = 8000) {
  if (!('serviceWorker' in navigator)) return false
  if (navigator.serviceWorker.controller) return true
  try {
    await Promise.race([navigator.serviceWorker.ready, delay(timeoutMs)])
  } catch {
    return false
  }
  if (navigator.serviceWorker.controller) return true
  return await Promise.race([
    new Promise((resolve) => {
      const onChange = () => {
        navigator.serviceWorker.removeEventListener('controllerchange', onChange)
        resolve(Boolean(navigator.serviceWorker.controller))
      }
      navigator.serviceWorker.addEventListener('controllerchange', onChange)
    }),
    delay(Math.min(timeoutMs, 5000)),
  ])
}

/** 等浏览器空闲再动手；没有 requestIdleCallback（老 Safari）就退回一个短延时 */
export function scheduleAutoPreload() {
  // 桌面端没有 Cache Storage，这套自托管运行时在那边既下不了也用不上
  if (IS_DESKTOP) return
  // 自动化探针（verify:judge / verify-ui）不预取：它们要的是稳定、可重复的网络与内存
  if (navigator.webdriver) return
  // 省流模式：用户明确表示别替他下
  if (navigator.connection?.saveData) return

  const run = () => {
    void (async () => {
      if (!(await waitForController())) return
      await runAutoPreload()
    })()
  }
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout: 10000 })
    return
  }
  window.setTimeout(run, 3000)
}
