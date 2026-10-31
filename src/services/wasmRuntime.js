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
 * - run 段用调用方给的时限（界面上的全局时限）：到点不立刻杀，留
 *   `max(100ms, 5%)` 的宽限；是否 TLE 按**程序自己的结束时刻**与时限比较（§4.2）。
 */
import {
  crossCheckRun,
  ensurePch,
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
import { supportsCppToolchain } from './wasmFeatures.js'
import { KILL_REASON } from './wasi/client.js'
import { t } from '../i18n/index.js'
import { vfsToRunnoFs } from './vfs/runnoFs.js'

// Python 解释器的冷启动（wasm 实例化 + zipimport 找标准库）实测约 190ms，
// 它发生在 run 段里，而 run 段正是 TLE 判定的那一段。不给余量的话，
// 1s 的时限会被解释器启动本身吃掉一大截，跑得再快的程序也可能被判 TLE。
// 留 500ms 覆盖慢机器上的冷启动，代价是 TLE 最多晚 0.5s 报出来。
const PYTHON_STARTUP_ALLOWANCE_MS = 500

// 约 23MB 传输（三件预压 br；裸文件约 131MB），正常几秒到十几秒；
// 3 分钟还没回来基本可以断定网络有问题
const DOWNLOAD_TIMEOUT_MS = 3 * 60 * 1000
// 编译 + 链接一个竞赛程序通常 1 s 以内，60 s 还没回来是卡死而不是慢
const COMPILE_TIMEOUT_MS = 60 * 1000
// 调用方没给时限时的兜底：宁可误判超时，也不能让程序无限跑下去
const DEFAULT_RUN_TIMEOUT_MS = 1000

// 对拍（crossCheck）单次运行的上限：对拍只问「输出一不一样」，不问 -O0 版快不快。
// 1s 而不是调用方的时限 —— -O0 慢两三倍是常态，用原时限会把「本来就慢」误判成
// 「不敢比」，而多给它也没有收益：真 UB 通常在很小的输入上就能显出差异。
const CROSS_CHECK_RUN_MS = 1000
// 对拍的总预算（软上限）：编译 + 最多两次运行。超了就不再往下做，结论宁可不给。
// 3s 的来历：一次对拍编译 400–600ms（不带 PCH，见 runnoSandbox 的 OPT_MAIN），
// 两次运行各 ≤1s，留一点余量。它约束的是「还要不要再跑一遍」，不是「编译能不能慢」
// —— 编译段仍由 60s 的编译看门狗管，卡死是另一类故障，不在这里另设阈值。
const CROSS_CHECK_BUDGET_MS = 3000

// 对拍那边崩掉时，唯一「不算 UB 证据」的一类：栈溢出。
// -O0 的栈帧比 -O2 大 3.2 倍（实测同一个递归函数 8.5 万层 vs 27.5 万层），深递归在这一遍
// 爆栈是编译器给的栈深度差异，不是源码有错 —— 拿它提示「源码可能含未定义行为」就是误报。
// 两者在 trap 文本上分得开（2026-10-31 实测）：爆栈是
// `RangeError: Maximum call stack size exceeded`，而漏 return 撞上 clang 补的
// `unreachable` 是 `RuntimeError: unreachable`。
const CROSS_CHECK_STACK_TRAP = /call stack|stack size exceeded|stack overflow/i

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

/**
 * 杀掉当前 WASI 实例。C++ 是常驻宿主 worker，terminate 后下一次 `loadToolchain` 会重建；
 * Python 仍是 runno 的单次实例，工具链缓存不受影响。
 *
 * 必须带上**原因**（见 wasi/client.js 的 KILL_REASON）：宿主据此决定排队里的用户任务
 * 是「交接给新 worker」还是「一起收掉」，上层据此决定失败要不要记成永久标记。
 * @param {'timeout'|'user-cancel'} reason
 */
function killHost(entry, reason) {
  const host = entry.host
  if (!host || typeof host.kill !== 'function') return
  try {
    host.kill(reason)
  } catch {
    /* 实例还没 start()，没有 worker 可杀 */
  }
}

/**
 * 给当前阶段上弦：每个阶段一条独立定时器，进入新阶段就重新计一次。
 * 到点只做一件事——杀掉当前的 WASI 实例；剩下的交给 runCpp 抛错、runCase 翻译。
 *
 * run 段不在 T 到点就杀，而是等 `T + max(100ms, 5%)`（判定规范 §4.2）：主线程被
 * 事件循环 / GC 卡一下时，worker 里其实已经跑完的程序不该被误杀。**判定阈值不变**
 * —— 到底算不算 TLE 由 runCase 拿程序自己的结束时刻（runMs）与 T 比较，这里的宽限
 * 只决定「什么时候动手」。
 */
function armTimer(entry) {
  clearTimeout(entry.timer)
  entry.timer = 0
  const limit = entry.stage === 'run' ? entry.runLimit : STAGE_TIMEOUTS[entry.stage]
  if (!limit) return
  const delay = entry.stage === 'run' ? limit + Math.max(100, Math.round(limit * 0.05)) : limit
  entry.timer = setTimeout(() => {
    entry.timedOut = true
    killHost(entry, KILL_REASON.TIMEOUT)
  }, delay)
}

/**
 * 起一个可被看门狗 / signal 中断的任务上下文。
 *
 * `silent`：不往状态栏播报（也不在收尾时把状态打回 idle）。对拍用的是它 ——
 * 那件事发生在「用例已经全跑完、结果已经出来」之后，用户此刻看到的状态是结论，
 * 半路冒出「正在编译」再掉回「空闲」，只会让人以为刚才那次运行没算数。
 * 看门狗、kill、signal 中断这些照样生效，只是不出声。
 */
function beginTask(signal, timeLimitMs, { silent = false } = {}) {
  const entry = {
    stage: 'boot',
    stageStartedAt: performance.now(),
    // run 段的时限（毫秒）：只计程序运行，不含编译 / 链接
    runLimit: timeLimitMs ?? DEFAULT_RUN_TIMEOUT_MS,
    host: null,
    cancelled: false,
    timedOut: false,
    silent,
    timer: 0,
  }

  entry.onStatus = (stage, message) => {
    entry.stage = stage
    entry.stageStartedAt = performance.now()
    if (!silent) publish(stage, message)
    armTimer(entry)
  }

  // runnoSandbox 每起一个 WASI 实例就把 host 交上来，卡死或被取消时靠它 kill()
  entry.onHost = (host) => {
    entry.host = host
    if (host && entry.cancelled) killHost(entry, KILL_REASON.USER_CANCEL)
    else if (host && entry.timedOut) killHost(entry, KILL_REASON.TIMEOUT)
  }

  if (signal) {
    entry.onAbort = () => {
      entry.cancelled = true
      killHost(entry, KILL_REASON.USER_CANCEL)
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
    // 静默任务收尾时不把状态栏打回 idle：它从没占用过状态栏（见 beginTask）
    if (!entry.silent) publish('idle', '')
  }
}

/** 队列里还没收工的前台任务条数（含正在跑的那条）。对拍据此判断「现在还有没有人要用」 */
let pending = 0

/**
 * 串行执行，前一个任务失败也照常排队下一个。
 *
 * 这条队列只装**用户任务**（运行 / 预载）。对拍不在里面 —— 它跑在自己的宿主上，
 * 由 `crossEnqueue` 另外串行（2026-11-01，见那个函数）。
 */
function enqueue(task) {
  pending += 1
  const run = queue.then(() => task())
  queue = run.then(
    () => {},
    () => {},
  )
  const done = () => {
    pending = Math.max(0, pending - 1)
  }
  run.then(done, done)
  return run
}

/**
 * 对拍自己的串行链 —— 与上面那条**互不相干**。
 *
 * 对拍现在跑在第二颗宿主上（见 runnoSandbox.loadCrossToolchain），所以它既不排在用户
 * 运行后面，也不会把用户运行挡在后面 —— 这正是开第二颗宿主换来的东西，上一版的
 * 「后台活可被前台抢占」（abort → terminate 整颗 worker）随之取消：掐断一条不再挡路的
 * 后台活，只会让下一次对拍白付一次宿主重建。
 *
 * 这条链只保证「同一颗宿主上一次只发一条」：两批用例连着跑完时，两条对拍不会在同一个
 * `entry` 上互相盖看门狗。
 */
let crossQueue = Promise.resolve()
function crossEnqueue(task) {
  const run = crossQueue.then(() => task())
  crossQueue = run.then(
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
 * 后台静默备好 STL 预编译头（见 runnoSandbox.ensurePch）：先取服务端预编译好的那份，
 * 取不到再本机生成。
 *
 * 触发时机不是「首屏」，而是「工具链已经在内存里」之后：首屏时 toolchain 还是 null，
 * 放在那里要么空转、要么被迫替用户拉起 23MB 下载，两条都和「不影响首屏」矛盾。
 * 所以由 runCase / preload 在工具链就绪后调一次，再等系统空闲才真正开工。
 *
 * **不进 enqueue**（2026-10-27 改）：那条队列是**用户任务的串行队列**，把 PCH 塞进去
 * 意味着「全部运行」的第 2..N 个用例要等这一份 8MB 的下载和 18MB 的存档写完 ——
 * 用户点了运行就该立刻跑，不该给预热让路。
 *
 * 真正的互斥有两层，都不在这条链路上：
 * - 下载 / 读存档那条路根本不碰宿主；
 * - 本机生成要用的那颗 worker 由 `WasiWorkerHost` 自己排队，而且生成是**后台优先级**，
 *   用户一点运行就把它整颗换掉（见 services/wasi/client.js 的抢占）。
 */
export function warmupPch() {
  if (pchWarmupStarted) return
  pchWarmupStarted = true
  whenIdle(() => {
    void (async () => {
      // 排队期间可能刚被别的任务清过场（卸载运行时），开工前再确认一次工具链还在
      if (!isToolchainReady()) {
        pchWarmupStarted = false
        return
      }
      try {
        const bytes = await ensurePch()
        // 没备成（宿主正忙 / 这一轮没轮到）：把「本会话只试一次」的闸放开，
        // 下一次运行结尾还会来这里 —— 否则一次撞车就等于本会话永远没有 PCH。
        if (!bytes) pchWarmupStarted = false
      } catch (error) {
        // 被外力掐断（用户点运行抢占 / 看门狗）：这一轮不算数，下次再来。
        // 真·生成失败（老机器 OOM）已在 runnoSandbox 里写成永久标记，不再重试。
        if (error?.reason) pchWarmupStarted = false
        // 后台任务：不播报、不打扰用户，用例照常走普通编译。
      }
    })()
  })
}

/**
 * 编译并运行一段代码 —— 沙箱调度器，按语言分流到两条并列的管线：
 * - cpp：clang 编译 + wasm-ld 链接 + 跑产物（见 runnoSandbox.runCpp），有 compile / run 两段；
 * - python：不编译，解释器直接执行入口文件（见 runnoSandbox.runPython），只有 run 一段。
 * cpp 走自写常驻宿主（services/wasi/），python 仍走 runno；两条线共用 stdout / stderr
 * 拦截与同一个看门狗，所以超时强杀（TLE）、取消、阶段播报在两种语言下行为一致。
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
      const runOnce = async () =>
        isPython
          ? runPython({
              code,
              entryPath: entryFile,
              fs: await vfsToRunnoFs({ overrides: { [entryFile]: code }, entryPath: entryFile }),
              stdin,
              onStatus: entry.onStatus,
              onHost: entry.onHost,
            })
          : runCpp({
              code,
              stdin,
              memoryLimitBytes,
              onStatus: entry.onStatus,
              onHost: entry.onHost,
            })
      let result = await runOnce()
      if (entry.cancelled) return { type: 'cancelled' }

      // 首编产物的第一遍是**冷 JIT**：wasm 是分层编译，这份 Module 的函数先跑 V8 的
      // Liftoff 基线代码，热了之后 TurboFan 才接手，所以整遍比稳态慢 25–40%
      // （2026-10-26 实测 1M 2.5→1.6、100M 197.6→150.9、300M 602.9→427.6 ms）。
      // 而一份产物在整批用例里只编一次、Module 也只建一次，于是**这份偏差全压在第一条
      // 用例上**：同一条时限 175 ms 的用例，首条那一遍超过 175 ms 判了 TLE，后面两条
      // 163 / 161.5 ms 正常通过 —— 用户看到的就是「第一次运行，第一条样例的运行时间
      // 凭空多出来，甚至 TLE」。
      //
      // 修法：冷的那一遍**整遍不算数**（耗时与输出都丢掉），再跑一遍拿它的数当这条
      // 用例的结论。三条边界：
      // - 判据只有「cold 且正常收尾（exit 0、无 trap）」：**不能**再加「首遍没超时」
      //   —— 首遍恰恰是因为冷 JIT 才超的（175 ms 那条就是这样被判的 TLE），拿它当门槛
      //   等于把要修的现象留在原地。程序真跑不完时看门狗会在第一遍就掐断（超时走 catch），
      //   根本到不了这里，所以「多跑一遍」最坏也只是把墙钟翻倍、上界仍是 `时限 + 宽限`；
      // - 第二遍仍是 cold（说明 worker 被看门狗重建过、Module 缓存也跟着没了）就不再循环，
      //   退回第一遍的数 —— 只跑两遍，绝不做「跑到不冷为止」的循环；
      // - 两遍各自重新上弦（runCpp 每遍都会 onStatus('run')），所以看门狗对每一遍都是
      //   完整的 `时限 + 宽限`，不会因为多跑一遍把时限算成一半。
      if (!isPython && result.cold && result.ok) {
        const warmed = await runOnce()
        if (entry.cancelled) return { type: 'cancelled' }
        if (!warmed.cold) result = warmed
      }
      // 程序自己跑完了，但结束时刻晚于时限 → TLE（判定规范 §4.2）。用宿主补丁记的
      // runMs（_start 的起止墙钟），而不是消息处理时刻；补丁不在（null）时不做这一步，
      // 仍然只靠看门狗。阈值取 entry.runLimit：C++ 就是 timeLimitMs，Python 额外含着
      // 启动余量（PYTHON_STARTUP_ALLOWANCE_MS），与看门狗同一口径。
      if (typeof result.runMs === 'number' && result.runMs > entry.runLimit) {
        return {
          type: 'timeout',
          stdout: result.stdout ?? '',
          stderr: result.stderr ?? '',
          durationMs: result.runMs,
        }
      }
      // 编译这步真走完了（成功或编译错误都算），说明工具链已在内存里 —— 趁空闲把 PCH 备好给下一批用。
      // PCH 是 C++ 专属的，跑 Python 不该去拉那 23MB 工具链。
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
      return {
        type: 'failure',
        stage: entry.stage === 'run' ? 'run' : 'infra',
        message: error?.message || String(error),
        // 运行段被搞崩（真栈溢出之类）也算「程序打到一半出事」：镜像里那截照样带回去
        stdout: error?.partialStdout ?? '',
      }
    } finally {
      endTask(entry)
    }
  })
}

/**
 * 对拍：把同一份源码换成 -O0 再编一遍，拿同一条用例再跑一次，和 -O2 那次的输出比对。
 *
 * 用途只有一句话：**AC 了的代码不一定对**。源码里的 UB 在 -O2 下可能被「优化对了」
 * （漏 return 错位到下一条指令、越界读被折成常量、严格别名下两次写被合并），
 * 于是同一个错误在别的 OJ 上炸、在这里 AC。关掉优化再跑一遍，两次输出不同就是证据。
 *
 * 四条纪律（B 版口径，2026-10-31 定）：
 * 1. **只跑一条用例**：UB 是代码结构问题，与用例规模无关，调用方挑最快的一条（见 runner）；
 * 2. **异步、不挡路**：延到空闲时段开工，跑在**自己那颗宿主**上（2026-11-01 起，见
 *    runnoSandbox.loadCrossToolchain）—— 用户随后再点运行既不排队也不掐断它，代价只是
 *    多一份常驻内存；
 * 3. **超时即放弃、不提示**：-O0 慢两三倍是常态，跑不完只能说明「比不出来」，
 *    不能当成 UB 证据 —— 假阳性比漏报更伤害这个提示的可信度；
 * 4. **-O0 直接崩掉算证据，栈溢出除外**（2026-10-31 用户报障后补的）：同一份源码
 *    -O2 上 AC、关掉优化就跑不完，本身就是「这段代码依赖优化的容错」的直接证据。
 *    实测漏 `return` 的程序 -O2 打出 `ACAACA`，-O0 撞上 clang 在函数尾补的
 *    `unreachable` → exit 134。原先这类一律按「比不出来」吞掉，等于把最典型的一类
 *    UB 藏了起来。唯一要挡的是深递归爆栈（理由见 CROSS_CHECK_STACK_TRAP）。
 *
 * 非确定性输出（rand / time / 打印地址）会天然误报，所以「第一次就有结论」时再跑一遍
 * 同样的 -O0：两次一致才算数，不一致就当比不出来。这一步只在已经有结论时付钱。
 *
 * @returns {Promise<{ status: 'same' | 'differed' | 'crashed' | 'skipped', attempts: number }>}
 *   differed / crashed 都只表示「-O0 与 -O2 的行为不同」，判定由上层决定怎么用（当前只提示）
 */
export function crossCheckCase({ language = 'cpp', code, stdin, baselineStdout, memoryLimitBytes, signal, budgetMs = CROSS_CHECK_BUDGET_MS }) {
  // 延到空闲时段开工：对拍发生在结论之后，不该在用户刚看到结果时就开始占 CPU。
  // 「异步」只保证不拖慢结论的显示。
  return new Promise((resolve) => {
    whenIdle(() => {
      void crossCheckNow({ language, code, stdin, baselineStdout, memoryLimitBytes, signal, budgetMs }).then(resolve)
    })
  })
}

async function crossCheckNow({ language, code, stdin, baselineStdout, memoryLimitBytes, signal, budgetMs }) {
  // 前台正忙（用户又点了运行）：这一趟比的还是上一份代码，干脆不做 —— 那次运行结束后
  // 会自己再安排一趟。注意这里**只放弃、不掐断**：已经开工的那趟占的是它自己的宿主，
  // 掐断只会让下一次对拍白付一次重建（见 runnoSandbox.loadCrossToolchain）。
  if (pending > 0) return { status: 'skipped', attempts: 0 }
  return crossEnqueue(async () => {
    if (language !== 'cpp' || signal?.aborted) return { status: 'skipped', attempts: 0 }
    const baseline = String(baselineStdout ?? '')
    const deadline = performance.now() + budgetMs
    const remain = () => deadline - performance.now()
    // 单次运行时限：剩余预算里挑，但留 250ms 地板 —— 编译把预算吃光时仍然值得跑一次
    // （编译都花了，不跑等于白花；一次 250ms 的比对远好过什么都不说）。
    const nextLimit = () => Math.max(250, Math.min(CROSS_CHECK_RUN_MS, remain()))
    // 不传调用方的 signal：这颗宿主只服务对拍，中途放弃时让那一条消息自己跑完（最长
    // 一遍 -O0 编译 + 一次 ≤1s 的运行）比把 worker 掐掉再重建划算得多。看门狗照旧 ——
    // 那才是「这条消息真卡死了」的判据。
    const entry = beginTask(null, CROSS_CHECK_RUN_MS, { silent: true })
    try {
      // 第一遍的结论：`{ crashed: true }` 或 `{ out }`。第二遍只负责确认它可复现
      let first = null
      for (let attempts = 1; ; attempts += 1) {
        if (signal?.aborted) return { status: 'skipped', attempts: attempts - 1 }
        // 看门狗按这个数上弦（armTimer 在 run 段读它），所以每遍都要先写好
        entry.runLimit = nextLimit()
        let ran
        try {
          ran = await crossCheckRun({ code, stdin, memoryLimitBytes, onStatus: entry.onStatus, onHost: entry.onHost })
        } catch {
          // 看门狗掐断 / 程序把宿主搞崩：对拍这一趟不影响任何东西，静默收场
          return { status: 'skipped', attempts }
        }
        if (signal?.aborted) return { status: 'skipped', attempts }
        // 跑超了对拍自己设的短时限：-O0 慢两三倍是常态，只能说明比不出来（纪律 3）。
        // 这和「崩溃」是两回事 —— TLE 有 runMs 且超过上限，崩溃是程序自己退出了。
        const overLimit = typeof ran.runMs === 'number' && ran.runMs > entry.runLimit
        // 非 0 退出且不是爆栈 → 这一遍真的崩了（纪律 4）。爆栈要单独挡掉，见常量处的说明
        const crashed = !ran.ok && !CROSS_CHECK_STACK_TRAP.test(`${ran.trap ?? ''}\n${ran.stderr ?? ''}`)
        if (overLimit || (!ran.ok && !crashed)) return { status: 'skipped', attempts }

        if (attempts === 1) {
          if (crashed) {
            first = { crashed: true }
          } else {
            const out = String(ran.stdout ?? '')
            if (out === baseline) return { status: 'same', attempts }
            first = { out }
          }
          // 已经有结论，但还差一次复现确认（真 UB 可复现，rand / 时间这类不会）：
          // 预算不够就宁可不给结论。
          if (remain() < 400) return { status: 'skipped', attempts }
          continue
        }
        // 第二遍：必须收敛到和第一遍同一个结论，否则当作程序本身不确定
        if (first.crashed) return crashed ? { status: 'crashed', attempts } : { status: 'skipped', attempts }
        if (crashed) return { status: 'skipped', attempts }
        return String(ran.stdout ?? '') === first.out
          ? { status: 'differed', attempts }
          : { status: 'skipped', attempts }
      }
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
  // 浏览器缺 wasm 异常 / SIMD 时，C++ 那三件资产**装了也跑不起来**：别让设置页显示
  // 「已下载」、也别让预取白下 23 MiB。判据同 runnoSandbox.loadToolchain 的前置检查。
  if (language === 'cpp' && !supportsCppToolchain()) return false
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
 * 之后 fetch 一定命中缓存；反过来直接 preload，缓存缺失时就会真的下 23MB。
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