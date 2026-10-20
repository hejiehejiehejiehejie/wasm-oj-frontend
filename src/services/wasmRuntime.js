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
import {
  generatePch,
  isPythonRuntimeReady,
  isToolchainReady,
  preloadPythonRuntime,
  preloadToolchain,
  runCpp,
  runPython,
  runtimeAssetURLs,
  unloadRuntime,
} from './runnoSandbox.js'
import { preloadMdRuntime, probeMdRuntime, uninstallMdRuntime } from './mdRuntime.js'
import { t } from '../i18n/index.js'
import { vfsToRunnoFs } from './vfs/runnoFs.js'

// Python 解释器的冷启动（wasm 实例化 + zipimport 找标准库）实测约 190ms，
// 它发生在 run 段里，而 run 段正是 TLE 判定的那一段。不给余量的话，
// 1s 的时限会被解释器启动本身吃掉一大截，跑得再快的程序也可能被判 TLE。
// 留 500ms 覆盖慢机器上的冷启动，代价是 TLE 最多晚 0.5s 报出来。
const PYTHON_STARTUP_ALLOWANCE_MS = 500

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
    return t('error.compileTimeout', { seconds })
  }
  return t('error.prepareTimeout', { seconds })
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
 * 编译并运行一段代码 —— 沙箱调度器，按语言分流到两条并列的管线：
 * - cpp：clang 编译 + wasm-ld 链接 + 跑产物（见 runnoSandbox.runCpp），有 compile / run 两段；
 * - python：不编译，解释器直接执行入口文件（见 runnoSandbox.runPython），只有 run 一段。
 * 两条线共用同一个 WASI 宿主、同一套 stdout / stderr 拦截和同一个看门狗，所以
 * 超时强杀（TLE）、取消、阶段播报在两种语言下的行为完全一致。
 *
 * @param {{ language?: string, entryPath?: string, code: string, stdin?: string, signal?: AbortSignal, timeLimitMs?: number, memoryLimitBytes?: number }} options
 *   language   'cpp' | 'python'，缺省按 cpp（保持既有调用方不改也能跑）
 *   entryPath  入口文件在 VFS 里的绝对路径；python 用它当 argv[1]，同时决定 sys.path[0]
 *   memoryLimitBytes  内存上限（字节），只有 cpp 兑现它（链接期 --max-memory）；Python 忽略
 * @returns {Promise<object>} result / timeout / failure / cancelled 消息
 */
export function runCase({ language = 'cpp', entryPath, code, stdin, signal, timeLimitMs, memoryLimitBytes }) {
  return enqueue(async () => {
    if (signal?.aborted) return { type: 'cancelled' }
    const isPython = language === 'python'
    const entryFile = entryPath || (isPython ? '/main.py' : '/main.cpp')
    const entry = beginTask(signal, timeLimitMs)
    if (isPython) entry.runLimit += PYTHON_STARTUP_ALLOWANCE_MS
    try {
      // python 走解释执行：整棵 VFS 拍成 fs 一起塞进去，多文件 import 才有得找
      const result = isPython
        ? await runPython({
            code,
            entryPath: entryFile,
            fs: await vfsToRunnoFs({ overrides: { [entryFile]: code }, entryPath: entryFile }),
            stdin,
            onStatus: entry.onStatus,
            onHost: entry.onHost,
          })
        : await runCpp({
            code,
            stdin,
            memoryLimitBytes,
            onStatus: entry.onStatus,
            onHost: entry.onHost,
          })
      if (entry.cancelled) return { type: 'cancelled' }
      // 编译这步真走完了（成功或编译错误都算），说明工具链已在内存里 —— 趁空闲把 PCH 备好给下一批用。
      // PCH 是 C++ 专属的，跑 Python 不该去拉那 50MB 工具链。
      if (!isPython) warmupPch()
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
            // 和 runCpp 成功路径同口径：只算运行段，所以这个数字约等于时限本身
            durationMs: Math.round(performance.now() - entry.stageStartedAt),
          }
        }
        return { type: 'failure', stage: entry.stage === 'compile' ? 'compile' : 'infra', message: timeoutMessage(entry) }
      }
      // 运行段的异常 = 程序把 runno 的宿主搞崩了（探针实测 2026-10-12：真栈溢出的 wasm
      // trap 会从 worker 一路炸到主线程，无 exitCode）——这是**程序**的问题，标 'run'，
      // 引擎按 RE 报；prepare / compile 段的异常才是工具链层面的问题（下载失败、浏览器
      // 缺 API 等）：报 infra，别说成编译错误
      return { type: 'failure', stage: entry.stage === 'run' ? 'run' : 'infra', message: error?.message || String(error) }
    } finally {
      endTask(entry)
    }
  })
}

/**
 * 探测某个本地运行时的资产是否真的都在本机（全程不触网）。
 *
 * 三级判据，从最权威到兜底：
 * 1. 内存里已加载（isToolchainReady / isPythonRuntimeReady）——本次会话一定可用；
 * 2. SW 控制页面时，以 Cache Storage 为准（`caches.match`）：那里才是「当前安装」的
 *    实体，也是卸载清得掉的那一层；
 * 3. 没有 SW（dev 模式）时退回 only-if-cached 探 HTTP 缓存：缓存缺失浏览器以网络
 *    错误失败，于是「标记说下过、实际已被浏览器清掉」的情况能被如实识别。
 *
 * 为什么第 2 级不再顺带落到 HTTP 缓存：HTTP 缓存没有 JS 清除接口，卸载删不掉它，
 * 若仍拿它当判据，刚卸载完的资产会被那份残留立刻判回「已就绪」（见 runnoSandbox.unloadRuntime）。
 *
 * @param {string} language 'cpp' | 'python' | 'markdown'
 * @returns {Promise<boolean>}
 */
export async function probeRuntime(language) {
  // markdown 渲染器的资产在 Cache Storage 里，判据与工具链不同，交给它自己的模块
  if (language === 'markdown') return probeMdRuntime()
  if (language !== 'cpp' && language !== 'python') return false
  if (language === 'python' ? isPythonRuntimeReady() : isToolchainReady()) return true
  const urls = runtimeAssetURLs(language)
  if (!urls.length) return false
  const probes = await Promise.all(urls.map(isAssetCached))
  return probes.every(Boolean)
}

async function isAssetCached(url) {
  if (navigator.serviceWorker?.controller) {
    try {
      return Boolean(await caches.match(url))
    } catch {
      /* Cache Storage 用不了（隐私模式等）就退回下面的 HTTP 缓存探针 */
    }
  }
  try {
    // only-if-cached 要求 same-origin；这些资产本来就是同源自托管的
    const response = await fetch(url, { mode: 'same-origin', cache: 'only-if-cached' })
    return response.ok
  } catch {
    return false
  }
}

/**
 * 把一个**已经缓存过**的运行时读进内存（不产生任何下载）。
 *
 * 给编辑器内的语法诊断用的：诊断绝不主动下载，但「本机早就下过、只是还没进内存」
 * 与「本机没有」是两回事 —— 前者读缓存 + 解包只要几十到几百毫秒，不该逼用户
 * 先跑一次代码才能看到红线；后者直接放弃，等用户自己点运行。
 *
 * 判据做成两级：先 `probeRuntime` 探缓存（不触网），再 `preload*`。因为探针通过
 * 之后 fetch 一定命中缓存；反过来直接 preload，缓存缺失时就会真的下 50MB。
 *
 * @param {'cpp' | 'python'} language
 * @returns {Promise<boolean>} true = 现在已在内存里
 */
export async function ensureRuntimeLoaded(language) {
  if (language !== 'cpp' && language !== 'python') return false
  if (language === 'python' ? isPythonRuntimeReady() : isToolchainReady()) return true
  // 只在 SW 控制的页面上做（线上 / 装好的 PWA）：那时判据是 `caches.match`，静默。
  // 没有 SW（dev）就只能用 only-if-cached 探 HTTP 缓存，而**未命中时它本身是一条
  // 会失败的请求** —— 控制台记 ERR_CACHE_MISS、Network 里三行红。dev 里「先跑一次」
  // 本来就是常态，不值得为它刷一屏红字（与设置页探针同一条取舍）。
  if (!navigator.serviceWorker?.controller) return false
  if (!(await probeRuntime(language))) return false
  try {
    if (language === 'python') await preloadPythonRuntime()
    else await preloadToolchain()
    return true
  } catch {
    /* 探针说是缓存、实际读失败（缓存被清 / 配额）：当作没有，静默放弃 */
    return false
  }
}

/**
 * 卸载某个本地运行时的全部本地痕迹（设置页「本地运行环境」的卸载按钮）。
 *
 * 除 runnoSandbox 那边的缓存与内存，还要把本模块的 PCH 预热开关复位 ——
 * 否则工具链卸载之后再跑 C++，warmupPch() 会因为「已经预热过」直接跳过，
 * 白白丢掉本该重建的那份加速。
 *
 * @param {string} language 'cpp' | 'python' | 'markdown'
 */
export async function uninstallRuntime(language) {
  if (language === 'markdown') return uninstallMdRuntime()
  if (language === 'cpp') pchWarmupStarted = false
  await unloadRuntime(language)
}

/**
 * 只把指定语言的运行时拉到本地（不发评测任务），用于「本地运行环境」面板的下载按钮。
 *
 * @param {string} [language='cpp'] 'cpp' | 'python' | 'markdown'
 * @param {AbortSignal} [signal]
 * @param {(status: { stage: string, message: string }) => void} [onStatus]
 *   进度回调。工具链的进度走 subscribeStatus 那条总线，渲染器没有总线可挂，
 *   由面板把回调透传进来（见 EditorSettingsPanel 的 downloadRuntime）
 */
export function preload(language = 'cpp', signal, onStatus) {
  if (language === 'markdown') return preloadMdRuntime(signal, onStatus)
  const isPython = language === 'python'
  return enqueue(async () => {
    if (signal?.aborted) return { type: 'cancelled' }
    const entry = beginTask(signal)
    try {
      const durationMs = isPython
        ? await preloadPythonRuntime(entry.onStatus)
        : await preloadToolchain(entry.onStatus)
      if (entry.cancelled) return { type: 'cancelled' }
      // 用户手点「下载」就是在等工具链，这时候顺带把 PCH 生成掉最不打扰人。
      // PCH 是 C++ 专属，Python 没有这一步。
      if (!isPython) warmupPch()
      return { type: 'ready', durationMs }
    } catch (error) {
      if (entry.cancelled) return { type: 'cancelled' }
      return { type: 'failure', stage: 'infra', message: error?.message || String(error) }
    } finally {
      endTask(entry)
    }
  })
}