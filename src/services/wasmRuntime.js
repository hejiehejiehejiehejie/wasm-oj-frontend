/**
 * 本地 WASM 沙箱的共享入口 —— 阶段播报、看门狗、取消都收在这一层。
 *
 * 流水线本体在 services/runnoSandbox.js（runno 的 clang + wasm-ld）。换掉 Wasmer 之后
 * 这一层反而更简单了，因为 runno 的 WASIWorkerHost 提供 kill()：
 *
 * 1. 不再需要养一个常驻 Worker。工具链（两个 wasm 二进制 + 解包后的 sysroot）就是内存里的
 *    blob URL 和对象，任何一次编译都直接复用，卡死也不会污染它。
 * 2. 卡死不用再「整只 Worker 回收」。看门狗现在浅杀当前那个 WASI 实例即可，
 *    已缓存的工具链完好无损，用户重试的成本只是重新编译一次。
 * 3. 任务串行执行：一次编译要往 WASI 里塞约 8.7MB 的 sysroot，
 *    并发跑多个用例只会让内存和带宽翻倍，没有收益。
 *
 * 看门狗按阶段计时：每进入一个新阶段就重新上弦，超时后 kill() 掉当前的 WASI 实例。
 * 用定时器而不是固定间隔轮询，是因为 TLE 的判定精度不能受轮询间隔拖累。
 * - download 是网络，慢是正常的，给一个宽松的上限；
 * - compile 正常情况下只要几百毫秒，超时基本可以断定卡死；
 * - run 段用调用方给的时限（界面上的全局时限），到点即 TLE：
 *   回一条 type 'timeout'，由引擎翻译成 outcome 'timeout'，卡片显示成 TLE。
 */
import { generatePch, isToolchainReady, preloadToolchain, runCpp } from './runnoSandbox.js'

// 约 50MB 裸文件（走 Vercel 边缘压缩，实际传输量小得多），正常几秒到十几秒；
// 3 分钟还没回来基本可以断定网络有问题
const DOWNLOAD_TIMEOUT_MS = 3 * 60 * 1000
// 编译 + 链接一个竞赛程序通常 1 s 以内，60 s 还没回来是卡死而不是慢
const COMPILE_TIMEOUT_MS = 60 * 1000
// 调用方没给时限时的兜底：宁可误判超时，也不能让程序无限跑下去
const DEFAULT_RUN_TIMEOUT_MS = 1000

// 固定上限只覆盖前两个阶段；run 段的时限随任务传进来（见 beginTask）
const STAGE_TIMEOUTS = {
  boot: DOWNLOAD_TIMEOUT_MS,
  download: DOWNLOAD_TIMEOUT_MS,
  compile: COMPILE_TIMEOUT_MS,
}

/** @type {Set<(status: { stage: string, message: string }) => void>} */
const listeners = new Set()
/** @type {{ stage: string, message: string } | null} */
let currentStatus = null

/** @type {{ cancel: () => void } | null} */
let active = null
let queue = Promise.resolve()

function publish(stage, message) {
  currentStatus = { stage, message }
  for (const listener of listeners) listener(currentStatus)
}

/**
 * 订阅沙箱的实时阶段播报（boot / download / compile / run）。
 * 订阅时会立刻收到最近一次状态，方便刚打开的面板直接显示当前进度。
 * @returns {() => void} 取消订阅
 */
export function subscribeStatus(listener) {
  listeners.add(listener)
  if (currentStatus) listener(currentStatus)
  return () => listeners.delete(listener)
}

function timeoutMessage(entry) {
  const seconds = Math.round((performance.now() - entry.stageStartedAt) / 1000)
  if (entry.stage === 'compile') {
    return `本地编译超过 ${seconds} s 没有返回，已中断（正常编译只要几百毫秒，超时多半是这段代码触发了工具链的极端情况）。`
  }
  return `本地运行环境准备超过 ${seconds} s 没有返回，已中断，请检查网络后重试。`
}

/** 杀掉当前 WASI 实例。工具链是常驻内存的缓存，不受影响。 */
function killHost(entry) {
  const host = entry.host
  if (!host) return
  try {
    host.kill()
  } catch {
    /* 实例还没 start()，没有 worker 可杀 */
  }
}

/**
 * 给当前阶段上弦：每个阶段一条独立定时器，进入新阶段就重新计一次。
 * 到点只做一件事——杀掉当前的 WASI 实例；剩下的交给 runCpp 抛错、runCase 翻译。
 */
function armTimer(entry) {
  clearTimeout(entry.timer)
  entry.timer = 0
  const limit = entry.stage === 'run' ? entry.runLimit : STAGE_TIMEOUTS[entry.stage]
  if (!limit) return
  entry.timer = setTimeout(() => {
    entry.timedOut = true
    killHost(entry)
  }, limit)
}

/** 起一个可被看门狗 / signal 中断的任务上下文 */
function beginTask(signal, timeLimitMs) {
  const entry = {
    stage: 'boot',
    stageStartedAt: performance.now(),
    // run 段的时限（毫秒）：只计程序运行，不含编译 / 链接
    runLimit: timeLimitMs ?? DEFAULT_RUN_TIMEOUT_MS,
    host: null,
    cancelled: false,
    timedOut: false,
    timer: 0,
  }

  entry.onStatus = (stage, message) => {
    entry.stage = stage
    entry.stageStartedAt = performance.now()
    publish(stage, message)
    armTimer(entry)
  }

  // runnoSandbox 每起一个 WASI 实例就把 host 交上来，卡死或被取消时靠它 kill()
  entry.onHost = (host) => {
    entry.host = host
    if (host && (entry.cancelled || entry.timedOut)) killHost(entry)
  }

  if (signal) {
    entry.onAbort = () => {
      entry.cancelled = true
      killHost(entry)
    }
    signal.addEventListener('abort', entry.onAbort, { once: true })
    // 任务先结束时要把监听摘掉，否则 signal 会一直攥着这个闭包
    entry.disposeSignal = () => signal.removeEventListener('abort', entry.onAbort)
  }

  active = entry
  armTimer(entry)
  return entry
}

function endTask(entry) {
  clearTimeout(entry.timer)
  if (entry.onAbort) entry.disposeSignal?.()
  if (active === entry) {
    active = null
    publish('idle', '')
  }
}

/** 串行执行，前一个任务失败也照常排队下一个 */
function enqueue(task) {
  const run = queue.then(() => task())
  queue = run.then(
    () => {},
    () => {},
  )
  return run
}

/** 放到空闲时段执行；没有 requestIdleCallback 的浏览器退化成延时 */
function whenIdle(task) {
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(task, { timeout: 5000 })
    return
  }
  window.setTimeout(task, 1500)
}

let pchWarmupStarted = false

/**
 * 后台静默生成 STL 预编译头（见 runnoSandbox.generatePch）。
 *
 * 触发时机不是「首屏」，而是「工具链已经在内存里」之后：首屏时 toolchain 还是 null，
 * 放在那里要么空转、要么被迫替用户拉起 50MB 下载，两条都和「不影响首屏」矛盾。
 * 所以由 runCase / preload 在工具链就绪后调一次，再等系统空闲才真正开工。
 *
 * 为什么必须排进同一条串行队列：生成时要把 ~9MB 的 sysroot 整体克隆进 worker，
 * 出来的 PCH 又有十几 MB，和用户编译并行就是内存翻倍 —— 老机器上正是要避开这个。
 * 排队的次序也天然合适：用户点了运行，编译先跑完，PCH 再补。
 */
export function warmupPch() {
  if (pchWarmupStarted) return
  pchWarmupStarted = true
  whenIdle(() => {
    void enqueue(async () => {
      // 队列里可能刚被别的任务清过场，开工前再确认一次工具链还在
      if (!isToolchainReady()) return
      try {
        await generatePch()
      } catch {
        // 失败（老机器 OOM / cc1 卡死）已在 runnoSandbox 里写成永久标记。
        // 这是后台任务：不播报、不打扰用户，用例照常走普通编译。
      }
    })
  })
}

/**
 * 编译并运行一段 C++。
 * @returns {Promise<object>} result / timeout / failure / cancelled 消息
 */
export function runCase({ code, stdin, signal, timeLimitMs }) {
  return enqueue(async () => {
    if (signal?.aborted) return { type: 'cancelled' }
    const entry = beginTask(signal, timeLimitMs)
    try {
      const result = await runCpp({
        code,
        stdin,
        onStatus: entry.onStatus,
        onHost: entry.onHost,
      })
      if (entry.cancelled) return { type: 'cancelled' }
      // 编译这步真走完了（成功或编译错误都算），说明工具链已在内存里 —— 趁空闲把 PCH 备好给下一批用
      warmupPch()
      return { type: 'result', ...result }
    } catch (error) {
      if (entry.cancelled) return { type: 'cancelled' }
      if (entry.timedOut) {
        // run 段超时就是 TLE：程序被 kill 了，但它已经打印出来的内容还挂在错误上，
        // 一并带回去，卡片才解释得清「跑到哪一步被掐断的」。
        if (entry.stage === 'run') {
          return {
            type: 'timeout',
            stdout: error?.partialStdout ?? '',
            stderr: error?.partialStderr ?? '',
          }
        }
        return { type: 'failure', stage: entry.stage === 'compile' ? 'compile' : 'infra', message: timeoutMessage(entry) }
      }
      // 工具链层面的问题（下载失败、浏览器缺 API 等）：报 infra，别说成编译错误
      return { type: 'failure', stage: 'infra', message: error?.message || String(error) }
    } finally {
      endTask(entry)
    }
  })
}

/** 只把运行时与工具链拉到本地（不发编译任务），用于「本地运行环境」面板的下载按钮。 */
export function preload(signal) {
  return enqueue(async () => {
    if (signal?.aborted) return { type: 'cancelled' }
    const entry = beginTask(signal)
    try {
      const durationMs = await preloadToolchain(entry.onStatus)
      if (entry.cancelled) return { type: 'cancelled' }
      // 用户手点「下载」就是在等工具链，这时候顺带把 PCH 生成掉最不打扰人
      warmupPch()
      return { type: 'ready', durationMs }
    } catch (error) {
      if (entry.cancelled) return { type: 'cancelled' }
      return { type: 'failure', stage: 'infra', message: error?.message || String(error) }
    } finally {
      endTask(entry)
    }
  })
}