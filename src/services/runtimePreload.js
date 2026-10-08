/**
 * 「本地运行环境 › 预下载」的启动侧实现。
 *
 * 设置页给 C++ / Python / 题解渲染器各留了一个「预下载」勾选（存在 `cp.autoPreload`，
 * 是运行时 id 的数组），这里负责在**应用启动之后、浏览器空闲时**把勾了、本机又还没有的
 * 那几个拉下来。这样用户能先勾好，让它在后台自己下完 —— 而不是等到第一次点「运行」
 * 才现场下 50MB。
 *
 * 两条边界：
 * 1) 只在浏览器空闲后动手：下载不该和 Monaco / VFS 的初始化抢主线程与带宽；
 * 2) 尽力而为，不打扰人：探针说已有就跳过；失败也不弹任何东西 —— 用户本来就没盯着它，
 *    失败只意味着「这次没提前下好」，之后真正要用时照样会按需下载。
 */
import { preload, probeRuntime } from './wasmRuntime.js'
import { IS_DESKTOP } from './platform.js'

/** 勾选项落在这个键里：运行时 id 的数组，`[]`（默认）表示一个都不预下载 */
export const AUTO_PRELOAD_KEY = 'cp.autoPreload'

/**
 * 读勾选项。手改过 localStorage、存了别的形状、或者塞了不认识的语言名，
 * 一律按「没勾」处理 —— 这个函数被启动流程调用，不能抛。
 */
export function readAutoPreload() {
  try {
    const value = JSON.parse(window.localStorage.getItem(AUTO_PRELOAD_KEY))
    if (!Array.isArray(value)) return []
    return value.filter((id) => id === 'cpp' || id === 'python' || id === 'markdown')
  } catch {
    return []
  }
}

/**
 * 按勾选顺序逐个补齐。串行而不是并发：这些资产动辄几十 MB，一起下只会互相抢带宽，
 * 而且 wasmRuntime 内部本来就是一条串行队列（见那里的 enqueue），并发也没意义。
 */
export async function runAutoPreload() {
  for (const id of readAutoPreload()) {
    // 探针只读本地缓存、不触网：已经有了就跳过，别把 50MB 再下一次
    if (await probeRuntime(id)) continue
    const result = await preload(id)
    // 下一个大概率也下不动（断网 / 配额满），没必要挨个把几十 MB 试一遍
    if (result.type !== 'ready') return
  }
}

/** 等浏览器空闲再动手；没有 requestIdleCallback（老 Safari）就退回一个短延时 */
export function scheduleAutoPreload() {
  // 桌面端没有 Cache Storage，这套自托管运行时在那边既下不了也用不上
  // （用系统 clang++ 取代，见 HANDOFF 第 14 节第 3、4 条），不预下载。
  if (IS_DESKTOP) return

  const run = () => {
    void runAutoPreload()
  }
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout: 10000 })
    return
  }
  window.setTimeout(run, 3000)
}
