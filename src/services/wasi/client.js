/**
 * 阶段 4 的 C++ 宿主客户端：一个常驻 Worker 的薄封装。
 *
 * 与 `host.js` 的分工：host 只做同步 WASI 语义；这里负责 Worker 生命周期、
 * 消息编号、stdout/stderr 的增量回传，以及看门狗要的 `kill()`。
 *
 * 为什么常驻：clang 73 MB、wasm-ld 41 MB，sysroot 1385 条。每次 run 重新实例化 +
 * clone 一份就是阶段 2 那 13–17 s 的来源；这里只在 init 时付一次。
 *
 * ## 一条队列，三条使用线
 *
 * 这颗 worker 被三处共用：**运行**（compile / link / run）、**编辑器语法诊断**（syntax）、
 * **PCH 后台备料**（compile）。一条 wasm 消息动辄几百毫秒到几十秒，且并发 post 会互相
 * 覆盖回复，所以任务必须排队、一次只发一条（见 `send`）。
 *
 * 排队必然带来一件事：**「等别人跑完」的时间不该算成「这条任务跑了多久」**。曾经两边
 * 的看门狗都是「发起那一刻上弦」，于是排在编译后面的那一枪语法检查在自己还没发出去
 * 就先到点，`kill()` 把整颗 worker 掐了 —— 正在跑的编译跟着一起死，卡片报
 * 「本地沙箱不可用：C++ WASI worker 已终止」（2026-10-27 定位：把语法那 15 s 表压到
 * 200 ms 可稳定复现，终止栈落在 `runnoSandbox.checkCppSyntax` 的看门狗上）。
 *
 * 所以现在的口径是**派发时刻起算**：`send(payload, { timeoutMs })` 的计时器只在消息
 * 真正 `postMessage` 出去的那一刻上弦。任何新增任务都必须走这条路 —— 在外面自己
 * `setTimeout` + `kill()`，等于把同一个坑再挖一遍。
 *
 * 第二条纪律是**前台优先**（见 `send` 的 `priority`）：用户点的那一下永远排在排队中的
 * 后台活前面；后台活要是**已经派发**出去了，就整颗换掉（wasm 里没有中断点），
 * 排队中的前台任务由 `terminate` 交接给新 worker —— 见 KILL_REASON 与 preserveWaiting。
 *
 * 唯一的例外是**语法诊断**（label `'syntax'`）：它只有百毫秒级，而杀一次要重建整颗
 * worker（~400ms）外加一枪 ABORTED、旧红线留在编辑器里。所以前台让它跑完，自己不杀它。
 */

import { createMirror, readMirror, resetMirror } from './stdoutMirror.js'

const DEFAULT_INIT = {
  clangURL: '',
  linkerURL: '',
  sysrootURL: '',
  universalHeaderPath: '/sys/include/wasm32-wasip1/bits/stdc++.h',
  universalHeader: '',
  pchSource: '',
}

/** 用户点的那一下（编译 / 链接 / 跑程序 / 工具链预载）。默认就是它 */
export const HOST_PRIORITY_FOREGROUND = 0
/** 可无限延后的活（语法诊断 / PCH 预热）：任何前台任务都能插到它前面 */
export const HOST_PRIORITY_BACKGROUND = 1

/**
 * init / preload 的上限。worker 里要下约 23MB（clang + wasm-ld + sysroot）并解 1385 条 sysroot。
 *
 * 为什么要在这里兜：这段时间里宿主还没交到上层手上（`onHost` 在 loadToolchain 之后才被
 * 调用），上层的阶段看门狗**够不着**这颗 worker，拿不到 kill() 的把手。少了这条表，
 * 一个不回话的 init 就是「点了运行，然后永远转圈」。
 *
 * 给到 5 分钟而不是 180 秒：这 23MB 走的是**用户的网**，200 KB/s 就要两分半；设置页那颗
 * 「下载」按钮更该让慢网下完。这条表是「彻底不回话」的兜底，不是下载预算 —— 用户看到
 * 「准备超过 180 秒」那条判定仍然由 wasmRuntime 的阶段表给出，两者各管各的。
 */
const INIT_TIMEOUT_MS = 5 * 60 * 1000

/**
 * 掐断宿主的原因。
 *
 * 为什么要一个显式枚举：上层要拿它区分「这台机器真的不行」与「被外力打断」。
 * PCH 的永久标记（`cp.pchUnsupported`）只能在**真失败**时打 —— 一次用户取消、
 * 一次看门狗超时、一次被前台任务抢占，都不该让这台机器永远失去 PCH。
 * 靠错误文案或通用 `code` 猜这件事太脆：文案会改，而 `killed` 同时覆盖了三种原因。
 */
export const KILL_REASON = {
  /** 看门狗到点：宿主真卡死了，只有 terminate 才能把线程放出来 */
  TIMEOUT: 'timeout',
  /** 被前台任务抢占（用户点运行），或诊断换新一枪 */
  PREEMPTED: 'preempted',
  /** 用户主动取消当前任务 */
  USER_CANCEL: 'user-cancel',
  /** 卸载运行时 / 释放宿主 */
  DISPOSED: 'disposed',
}

function terminatedError(
  message = 'C++ WASI worker 已终止',
  { code = 'killed', reason = KILL_REASON.PREEMPTED, timedOut = false, keepOutput = true, stdout = '', stderr = '' } = {},
) {
  const error = new Error(message)
  error.code = code
  // 没有 reason 的错误才是「真失败」；带 reason 的一律视为被外力打断（见 KILL_REASON）
  error.reason = reason
  if (timedOut) error.timedOut = true
  error.partialStdout = keepOutput ? stdout : ''
  error.partialStderr = keepOutput ? stderr : ''
  return error
}

export class WasiWorkerHost {
  constructor(options = {}) {
    // Callbacks cannot survive structured clone, so they stay on this side and
    // the init payload keeps only serializable fields.
    const { onAssetProgress = null, ...init } = options
    this.options = { ...DEFAULT_INIT, ...init }
    this.onAssetProgress = onAssetProgress
    this.worker = null
    this.ready = null
    this.dead = false
    /**
     * 这颗宿主正被一段**不可打断的长任务**占着。目前有两个持有人：
     * - 运行（runCpp 的整个期间，含编译、链接、跑程序）；
     * - PCH 后台备料（ensurePch 的**本机生成**那条分支，正常机器约 1s，老机器几十秒，
     *   看门狗给到 3 分钟）。注意下载现成 PCH 那条路不占宿主 —— 2026-10-27 起优先走它。
     *
     * 为什么要有这个标记：这颗 worker 是常驻的、被多处共用的 —— 上面两个长任务用它，
     * 编辑器的语法诊断也用它。诊断那一枪有自己的超时表，到点会 terminate **整颗 worker**，
     * 于是「诊断超时」变成「别人被掐断」。
     *
     * 约定：被占期间诊断**让路**（checkCppSyntax 见 busy 直接返回 BUSY 状态，不排队、不上表）。
     * 别在这里表达「忙碌」以外的语义 —— 它不参与 alive 判定，也不阻止别人的消息入队。
     *
     * 两个持有人的代价不同，别搞混：掐断一次运行只是这次白跑，再点一次就有；
     * 掐断一次 PCH 生成会被 ensurePch 的 catch 记成「本机扛不住」写进
     * `cp.pchUnsupported`，同一代内核里**永不重试** —— 之后每次编译都慢一截。
     * 所以掐断时必须带 KILL_REASON；只有不带 reason 的真失败才允许写那个永久标记。
     *
     * 用**计数**而不是布尔：两个持有人有可能同时在场（PCH 生成收尾与用户点运行之间
     * 没有互斥），布尔会被先收尾的那一方抹成 false，诊断于是以为没人用、照常上表并
     * kill —— 正是要防的那件事。占用请用 `hold()`，别直接写这个字段。
     */
    this.holders = 0
    this.nextId = 1
    /** 每次重建 worker 递增。排队中的旧任务靠它对不上而判死，不会塞进新 worker */
    this.generation = 0
    /** 已经派发（postMessage 已发出）的那条任务；空 = 这条队列此刻空闲 */
    this.active = null
    /** 已入队、还没轮到的任务（按入队顺序，取的时候按 priority 挑） */
    this.waiting = []
    /** 生命周期订阅，见 onEvent */
    this.eventListeners = new Set()
    /** idle 已经排进微任务，别重复排 */
    this.idleScheduled = false
    this.stdout = ''
    this.stderr = ''
    // stdout 的跨线程镜像：TLE 掐断之后靠它取回「已经打印出来的部分」。
    // 第一次 run 时才分配（8 MiB 的 SAB，别在构造时空占）。
    this.mirror = null
    // 看门狗拿到这个对象后只调 kill()，不碰内部
    this.kill = this.kill.bind(this)
  }

  get alive() {
    return Boolean(this.worker) && !this.dead
  }

  /** 有没有人正占着这颗宿主（见上面 holders 那段）。读者只用它，别自己拼布尔 */
  get busy() {
    return this.holders > 0
  }

  /** 正被派发出去的那条任务的 label；空串 = 没人在跑 */
  get activeLabel() {
    return this.active ? this.active.label : ''
  }

  /** 还排在队里等着的条数。后台活（PCH 本机生成）据此判断「现在该不该开工」 */
  get queued() {
    return this.waiting.length
  }

  /**
   * 占用宿主。返回**幂等**的释放函数 —— 配 try/finally 用，别手动写 holders。
   */
  hold() {
    this.holders += 1
    let released = false
    return () => {
      if (released) return
      released = true
      this.holders = Math.max(0, this.holders - 1)
      // 占用的往往是「编译完还要等上层来收尾」的那段时间；释放才是真正空闲的起点
      this.scheduleIdleNotify()
    }
  }

  /**
   * 订阅宿主的生命周期。上层的一次性闸门（语法预热、PCH 预热）挂在它上面，
   * 而不是自己写一份「每会话只试一次」后就不管宿主死活了。
   *
   * - `terminated`：worker 被收掉（看门狗 / 抢占 / 崩溃 / 卸载），带 `reason`；
   * - `idle`：队列排空且没有任何 hold 占用。
   *
   * idle **不在任务 settle 的同一拍发出**：`settle` 之后上层的 `finally` 才调
   * releaseHost()，同步发时 holders 往往还没降下来，订阅者会再次看到 busy
   * （PCH 生成结束后的语法补查就卡在这里）。所以排进微任务，发之前重新核验一次。
   */
  onEvent(listener) {
    this.eventListeners.add(listener)
    return () => this.eventListeners.delete(listener)
  }

  emitEvent(event) {
    for (const listener of this.eventListeners) {
      try {
        listener(event)
      } catch {
        /* 一个订阅者坏了不连坐 */
      }
    }
  }

  scheduleIdleNotify() {
    if (this.idleScheduled || !this.eventListeners.size) return
    this.idleScheduled = true
    queueMicrotask(() => {
      this.idleScheduled = false
      // 这期间可能又派发了新任务 / 有人 hold 住了 / 宿主已经死了 —— 都不算空闲
      if (this.dead || this.active || this.waiting.length || this.holders > 0) return
      this.emitEvent({ type: 'idle' })
    })
  }

  /** 懒分配 stdout 镜像；SAB 用不了（没开跨域隔离）时返回 null，退回消息那条路 */
  ensureMirror() {
    if (this.mirror) return this.mirror
    try {
      this.mirror = createMirror()
    } catch {
      this.mirror = null
    }
    return this.mirror
  }

  /**
   * 被掐断时能拿到的 stdout —— **镜像优先**。
   *
   * 为什么不信 `this.stdout`：worker 里的输出是按 64 KiB 攒批 post 的，`terminate()`
   * 那一刻缓冲区里还剩一截没发出去（2026-10-25 实测：打印 3 行后死循环，3 行全丢；
   * 打印 128 KiB 才留下两个整块）。镜像逐字节写在共享内存里，没有「消息送达」这个窗口。
   */
  partialStdout() {
    if (this.mirror) {
      const { text } = readMirror(this.mirror)
      if (text) return text
    }
    return this.stdout
  }

  ensureWorker() {
    if (this.alive) return this.worker
    // 上一颗已经死了（init 失败留下的 / 已被 kill）：彻底收掉再换新的
    if (this.worker) {
      try {
        this.worker.terminate()
      } catch {
        /* 已经退出 */
      }
      this.worker = null
    }
    this.dead = false
    this.generation += 1
    const worker = new Worker(new URL('./wasi.worker.js', import.meta.url), {
      type: 'module',
      name: 'cp-cpp-wasi',
    })
    worker.onmessage = (event) => this.onMessage(event.data)
    worker.onerror = (event) => {
      const error = new Error(event?.message || 'C++ WASI worker 崩溃')
      error.partialStdout = this.partialStdout()
      error.partialStderr = this.stderr
      this.dead = true
      // 世代推进 + 队列清空：崩溃之后排队的那几条再也不会有人回话
      this.generation += 1
      this.fail(error)
      // reason 为 null：不是外力掐断，是宿主自己崩的。语法侧同样要把闸门放开，
      // 否则「崩溃一次 → 本会话不再诊断」会变成没人能解释的假死。
      this.emitEvent({ type: 'terminated', reason: null, message: error.message })
    }
    this.worker = worker
    // init 走同一条队列（它必然是这颗 worker 的第一条消息），这样「一次只发一条」
    // 这条不变量只有一处实现
    this.ready = this.send(
      { type: 'init', ...this.options },
      { timeoutMs: INIT_TIMEOUT_MS, label: 'init' },
    ).then(() => undefined)
    this.ready.catch(() => {
      this.dead = true
    })
    return worker
  }

  onMessage(message) {
    if (message.type === 'stdout') {
      this.stdout += message.text
      return
    }
    if (message.type === 'stderr') {
      this.stderr += message.text
      return
    }
    // Progress events carry no request id and must not settle the active job.
    if (message.type === 'asset-progress') {
      this.onAssetProgress?.(message)
      return
    }
    const active = this.active
    if (!active || active.id !== message.id) return
    this.active = null
    if (message.type === 'error') {
      const error = new Error(message.error || 'C++ WASI 宿主错误')
      error.stage = message.stage
      error.partialStdout = this.partialStdout()
      error.partialStderr = this.stderr
      active.settle(error)
    } else {
      const result = message.result ?? {}
      // 结果里带完整 stdout；增量那些只给 kill 后的 partial 用，成功路径以完整值为准
      result.stdout = result.stdout || this.stdout
      result.stderr = result.stderr || this.stderr
      this.stdout = ''
      this.stderr = ''
      active.settle(null, result)
    }
    this.pump()
  }

  /**
   * 入队一条消息。返回的 promise 在**这一条**有结论时 settle。
   *
   * @param {object} payload 发给 worker 的消息体（函数不可克隆，回调只能放 options）
   * @param {object} [options]
   * @param {number} [options.timeoutMs] 看门狗。**从消息真正发出去那一刻起算**，排队时间不算。
   *   超时 = 这条消息把 worker 卡死了（wasm 里没有中断点），只能 terminate 整颗 —— 与
   *   「等别人跑完」不是一回事，后者永远不该触发这张表。0 = 不设表。
   * @param {number} [options.priority] HOST_PRIORITY_*；同优先级按入队顺序
   * @param {string} [options.label] 只用于超时措辞与 cancelQueued（'syntax' / 'pch' / …）
   * @param {() => void} [options.onDispatch] 消息真发出去的那一刻回调：上层的阶段看门狗
   *   靠它按「真开工」重新上弦（编译 / 运行的时限不该被排队时间吃掉）
   */
  send(payload, options = {}) {
    // 没有可用 worker 就顺手建一颗：它的 init 会排在这条前面
    if (!this.alive) this.ensureWorker()
    const job = {
      id: this.nextId++,
      payload,
      priority: options.priority ?? HOST_PRIORITY_FOREGROUND,
      timeoutMs: options.timeoutMs ?? 0,
      label: options.label ?? '',
      onDispatch: options.onDispatch ?? null,
      // 记下入队时这颗 worker 的世代：派发时对不上就说明它死了、换过新的
      generation: this.generation,
      timer: 0,
      settled: false,
      resolve: null,
      reject: null,
    }
    const promise = new Promise((resolve, reject) => {
      job.resolve = resolve
      job.reject = reject
    })
    job.settle = (error, result) => {
      if (job.settled) return
      job.settled = true
      if (job.timer) {
        clearTimeout(job.timer)
        job.timer = 0
      }
      if (error) job.reject(error)
      else job.resolve(result)
    }
    this.waiting.push(job)
    // 抢占：前台任务绝不排在后台活（PCH 本机生成）后面。
    // 后台那条**已经派发**了，wasm 里没有中断点，只能连同 worker 一起收掉；
    // 而排队中的前台任务本身没问题，由 terminate 交接给新 worker 继续跑
    // （见 terminate 的 preserveWaiting）。
    //
    // 语法诊断（label `'syntax'`）不在此列：它只有百毫秒级，杀一次却要重建整颗
    // worker（~400ms），还把那一枪变成 ABORTED、旧红线留在编辑器里 —— 让路反而更贵。
    // 它跑完后前台任务本来就排在队首，会立刻派发；真卡住有 15s 看门狗兜底。
    const active = this.active
    if (
      job.priority === HOST_PRIORITY_FOREGROUND &&
      active &&
      active.priority === HOST_PRIORITY_BACKGROUND &&
      active.label !== 'syntax'
    ) {
      this.terminate({
        message: `C++ WASI 后台任务（${active.label || 'background'}）已让路`,
        code: 'killed',
        reason: KILL_REASON.PREEMPTED,
        preserveWaiting: true,
      })
      return promise
    }
    this.pump()
    return promise
  }

  /** 取下一条要发的：优先级最高（小）的那条，同优先级按入队顺序 */
  takeNext() {
    if (!this.waiting.length) return null
    let best = 0
    for (let i = 1; i < this.waiting.length; i += 1) {
      if (this.waiting[i].priority < this.waiting[best].priority) best = i
    }
    return this.waiting.splice(best, 1)[0]
  }

  /** 有空就发下一条。同步、可重入（settle 里会回来接着推） */
  pump() {
    while (!this.active) {
      const job = this.takeNext()
      if (!job) {
        // 队列排空：下一拍通知订阅者（发之前会再核一次 hold / 新任务）
        this.scheduleIdleNotify()
        return
      }
      if (this.dead || !this.worker || job.generation !== this.generation) {
        // 它等的那颗 worker 已经没了 / 换过世代：这条永远跑不了了。
        // 必须就地判死，否则它会一直挂在队列里（「永远不出结果」的另一种形状）。
        job.settle(terminatedError())
        continue
      }
      this.dispatch(job)
    }
  }

  dispatch(job) {
    this.active = job
    if (job.timeoutMs > 0) {
      job.timer = setTimeout(() => {
        job.timer = 0
        // 秒级用「秒」，不到一秒的用毫秒 —— 前者是真实口径（15s / 180s），后者只会出现在探针里
        const span =
          job.timeoutMs >= 1000 ? `${Math.round(job.timeoutMs / 1000)} 秒` : `${job.timeoutMs} 毫秒`
        this.terminate({
          message: `C++ WASI ${job.label || '任务'} 超过 ${span}未返回`,
          code: 'timeout',
          reason: KILL_REASON.TIMEOUT,
          timedOut: true,
          // 卡死的是**当前这条**；排队里的用户任务本身没问题，换一颗 worker 接着跑。
          // 直接把它们一起判死会让「语法检查卡住」变成「用户的编译被掐」（见文件头 P0-2）。
          // init 自己不交接：它都起不来，换一颗只会再等 5 分钟，无限重来。
          preserveWaiting: job.label !== 'init',
        })
      }, job.timeoutMs)
    }
    try {
      this.worker.postMessage({ ...job.payload, id: job.id })
    } catch (error) {
      // worker 已终止 / 载荷不可克隆：这条不可能有回音了，收掉它继续往下推
      this.active = null
      job.settle(error)
      this.pump()
      return
    }
    if (job.onDispatch) {
      try {
        job.onDispatch()
      } catch {
        // 回调只用来播报阶段，出错也不能影响派发
      }
    }
  }

  /**
   * 丢掉还排在队里、label 匹配的任务（不碰正在跑的那条，也不 terminate worker）。
   *
   * 语法诊断用它撤掉上一枪「结论已经过期」的请求：那条消息还没发出去，撤掉是白撤；
   * 而 kill() 掐的是整颗 worker，会顺带打死别人的运行 / PCH 生成。
   * @returns {number} 撤掉几条
   */
  cancelQueued(label) {
    if (!this.waiting.length) return 0
    const dropped = []
    this.waiting = this.waiting.filter((job) => {
      if (job.label !== label) return true
      dropped.push(job)
      return false
    })
    for (const job of dropped) {
      job.settle(Object.assign(new Error('C++ WASI 任务已取消'), { code: 'cancelled' }))
    }
    return dropped.length
  }

  async start(payload, options) {
    await this.ready
    if (this.dead) throw new Error('C++ WASI worker 已退出')
    return this.send(payload, options)
  }

  async compile(
    { args, source, sourcePath = '/program.cpp', outputPath = '/program.o', pch = null },
    options,
  ) {
    return this.start({ type: 'compile', args, source, sourcePath, outputPath, pch }, options)
  }

  async link(
    { args, object, objectPath = '/program.o', outputPath = '/program.wasm', extraFiles = null },
    options,
  ) {
    return this.start({ type: 'link', args, object, objectPath, outputPath, extraFiles }, options)
  }

  async run({ binary, stdin = '', args = [] }, options) {
    const mirror = this.ensureMirror()
    // 每次开跑前清零：同一份镜像被这颗常驻 worker 反复使用
    if (mirror) resetMirror(mirror)
    this.stdout = ''
    this.stderr = ''
    return this.start({ type: 'run', binary, stdin, args, stdoutSAB: mirror?.sab }, options)
  }

  async syntax({ args, source, sourcePath = '/program.cpp', pch = null }, options) {
    return this.start({ type: 'syntax', args, source, sourcePath, pch }, options)
  }

  async preload(options) {
    await this.ready
    return this.send({ type: 'preload' }, { timeoutMs: INIT_TIMEOUT_MS, label: 'init', ...options })
  }

  /**
   * 收掉这颗 worker：正在跑的那条判死；排队里的那几条**按 preserveWaiting 决定**——
   * 为 true 时只把前台任务交接给下一颗 worker，后台活（语法 / PCH）直接扔掉。
   *
   * 为什么要交接而不是全判死：看门狗掐的是「当前这条卡住的消息」，队里那些用户任务
   * 根本没被派发过、也没出错，把它们一起判死就是「诊断超时 → 用户的编译跟着报错」。
   * 交接的实现是就地重建 worker（ensureWorker），把 carry 里的任务换成新世代再入队，
   * 这样 `runCpp` 手里的 host 引用依旧有效，上层不必重走 loadToolchain。
   *
   * @param {object} [options]
   * @param {boolean} [options.preserveWaiting] 见上；默认 false（取消 / 卸载就该整队收掉）
   */
  terminate({
    message,
    code = 'killed',
    reason = KILL_REASON.PREEMPTED,
    timedOut = false,
    keepOutput = true,
    preserveWaiting = false,
  } = {}) {
    this.dead = true
    const worker = this.worker
    this.worker = null
    this.ready = null
    this.generation += 1
    if (worker) {
      try {
        worker.terminate()
      } catch {
        /* 已经退出 */
      }
    }
    const error = terminatedError(message, {
      code,
      reason,
      timedOut,
      keepOutput,
      stdout: keepOutput ? this.partialStdout() : '',
      stderr: keepOutput ? this.stderr : '',
    })
    // 掐断之后这两份增量输出就属于上一条任务了，留着会被下一条的 result 当成自己的
    this.stdout = ''
    this.stderr = ''

    const active = this.active
    this.active = null
    if (active) active.settle(error)

    const waiting = this.waiting.splice(0, this.waiting.length)
    const carry = []
    for (const job of waiting) {
      if (preserveWaiting && job.priority === HOST_PRIORITY_FOREGROUND) carry.push(job)
      else job.settle(error)
    }
    // 先告诉订阅者「这颗 worker 已经没了」，再决定是否重建：语法侧要把
    // 「每会话只试一次」的闸门放开（见 runnoSandbox.onHostEvent），PCH 侧靠错误上的
    // reason 自己重置 —— 两边都不该靠猜下一次运行来恢复。
    this.emitEvent({ type: 'terminated', reason, message })
    if (!carry.length) return

    // 不可见的告警：用户没有做错事，不该看到报错，但排查时要知道发生过交接
    console.warn(
      `[wasi] ${message}；排队中的 ${carry.length} 条前台任务已交接给新 worker`,
    )
    try {
      this.ensureWorker()
    } catch (rebuildError) {
      for (const job of carry) job.settle(rebuildError)
      return
    }
    // ensureWorker 又推进了一次世代：交接的任务必须改签到新世代，否则 pump 会把它们判死
    for (const job of carry) job.generation = this.generation
    this.waiting.push(...carry)
    this.pump()
  }

  /**
   * 掐断宿主。
   * @param {'timeout'|'preempted'|'user-cancel'|'disposed'} [reason] 见 KILL_REASON
   */
  kill(reason = KILL_REASON.PREEMPTED) {
    this.terminate({
      message: 'C++ WASI worker 已终止',
      code: reason === KILL_REASON.USER_CANCEL ? 'cancelled' : 'killed',
      reason,
      timedOut: reason === KILL_REASON.TIMEOUT,
      // 超时：队里的用户任务仍然有效，交接；取消：用户不要这次了，整队收掉
      preserveWaiting: reason === KILL_REASON.TIMEOUT || reason === KILL_REASON.PREEMPTED,
    })
  }

  fail(error) {
    const active = this.active
    this.active = null
    if (active) active.settle(error)
    const waiting = this.waiting.splice(0, this.waiting.length)
    for (const job of waiting) job.settle(error)
  }

  dispose() {
    // 必须带 DISPOSED：这是「用户主动卸载 / 释放」，不是宿主意外死亡。
    // 订阅者（语法诊断）据此不重新武装 —— 否则卸载后每次击键都会白探一次缓存。
    this.terminate({
      message: 'C++ WASI worker 已释放',
      code: 'disposed',
      reason: KILL_REASON.DISPOSED,
      keepOutput: false,
    })
  }
}
