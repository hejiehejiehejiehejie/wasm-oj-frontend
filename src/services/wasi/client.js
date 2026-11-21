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

import wasiWorkerUrl from './wasi.worker.js?worker&url'
import {
  createMirror,
  OUTPUT_LIMIT_BYTES,
  readMirror,
  resetMirror,
} from './stdoutMirror.js'
import { TOOLCHAIN_ERROR } from '../toolchainStore.js'
import { t } from '../../i18n/index.js'

/**
 * Worker 脚本地址（**Vite 打包后的产物地址**）。单独导出：设置页的离线诊断要拿它去
 * `caches.match` 判「这份 chunk 在不在外壳桶里」。
 *
 * 为什么用 `?worker&url` 而不是 `new URL('./wasi.worker.js', import.meta.url)`：
 * 后者只在**字面量**出现在 `new Worker(...)` 里时才会被 Vite 当成 worker 入口去打包；
 * 一旦把 URL 存进变量（这里为了导出给诊断用必须存），Vite 只会把它当普通静态资源
 * 原样复制，worker 里的 `import` 就全部悬空。`?worker&url` 明确表达「打包成 worker，
 * 给我产物 URL」，两条用途（构造 + 诊断）指向同一份文件。
 */
export const WASI_WORKER_URL = new URL(wasiWorkerUrl, import.meta.url).href

/**
 * Worker 启动失败的结构化错误码。
 *
 * 与 `TOOLCHAIN_ERROR` 分开：这几个讲的是「脚本根本没起来」，而不是「工具链资产有问题」。
 */
export const WORKER_ERROR = {
  /** 离线且 worker 脚本不在缓存里（发版窗口 / 外壳预缓存没收进去） */
  SCRIPT_MISSING: 'WORKER_SCRIPT_MISSING',
  /** 5 秒内没收到 BOOTED：脚本加载了但求值卡住 / 模块依赖坏了 */
  BOOT_TIMEOUT: 'WORKER_BOOT_TIMEOUT',
  /** 已经 BOOTED，之后宿主自己崩了 */
  CRASHED: 'WORKER_CRASHED',
}

/**
 * BOOTED 握手时限。
 *
 * 5 秒而不是 3 秒：低端安卓机 PWA 冷启时主线程繁忙，3 秒会把「慢」误报成「坏」。
 * 真正的「脚本没加载出来」不会等这张表 —— 浏览器加载失败会几乎瞬间触发 `worker.onerror`，
 * 那条路直接短接到缓存命中判定（见 ensureWorker）。
 */
const WORKER_BOOT_TIMEOUT_MS = 5000

/** worker 脚本是否在 Cache Storage 里；`null` = 拿不到 Cache Storage，判不了 */
async function workerScriptCached(url) {
  if (typeof caches === 'undefined') return null
  try {
    return Boolean(await caches.match(url))
  } catch {
    return null
  }
}

/**
 * Worker 回的 `TOOLCHAIN_*` 错误码 → 用户文案。
 *
 * Worker 里没有 isDesktop / localStorage 这些上下文，也不该把中文文案写死在里面；
 * 码和 detail 过线，翻译留在主线程。
 */
function localizeToolchainError(message) {
  const detail = message.detail ?? {}
  switch (message.code) {
    case TOOLCHAIN_ERROR.NOT_INSTALLED:
      return t('error.toolchainNotInstalled')
    case TOOLCHAIN_ERROR.EVICTED:
      return t('error.toolchainEvicted')
    case TOOLCHAIN_ERROR.PARTIAL:
      return t('error.toolchainPartial', {
        missing: (detail.missing ?? []).join(', ') || '?',
      })
    case TOOLCHAIN_ERROR.CORRUPTED:
      return t('error.toolchainCorrupted', {
        asset: detail.file ?? detail.asset ?? '?',
      })
    default:
      return message.error || 'C++ WASI 宿主错误'
  }
}

const OUTPUT_LIMIT_MIB = OUTPUT_LIMIT_BYTES / 1024 / 1024

/**
 * 输出被截断时补在末尾的提示。
 *
 * 走 i18n 而不是写死在这里：它会被拼进 ACTUAL，是**给用户看的文案**，
 * 与这个文件里其余那些「不上界面」的抛错不是一回事。
 */
function truncationNote() {
  // key 是**扁平**的（这份消息表里没有 `engines:` 那一层，见 messages/engines.js 的 `stage`）
  return t('output.truncated', { n: OUTPUT_LIMIT_MIB })
}

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
    /** BOOTED 握手的看门狗（只属于当前这颗 worker，重建 / 收掉时必须清） */
    this.bootTimer = 0
    /** 已经派发（postMessage 已发出）的那条任务；空 = 这条队列此刻空闲 */
    this.active = null
    /** 已入队、还没轮到的任务（按入队顺序，取的时候按 priority 挑） */
    this.waiting = []
    /** 生命周期订阅，见 onEvent */
    this.eventListeners = new Set()
    /** idle 已经排进微任务，别重复排 */
    this.idleScheduled = false
    /** 当前这条任务的 stdout / stderr 增量累积（派发时清空，见 resetOutput） */
    this.stdout = ''
    this.stderr = ''
    /** 已累积的字符数，与 OUTPUT_LIMIT_BYTES 配对 */
    this.stdoutChars = 0
    this.stderrChars = 0
    this.stdoutTruncated = false
    this.stderrTruncated = false
    // stdout 的跨线程镜像：TLE 掐断之后靠它取回「已经打印出来的部分」。
    // 第一次 run 时才分配（8 MiB 的 SAB，别在构造时空占）。
    this.mirror = null
    /**
     * 镜像里那份字节**属于哪一条任务**（job.id，0 = 没人认领）。
     *
     * 镜像没有「消息送达」这个环节，也就没有自带归属信息 —— 谁最后带着 `stdoutSAB`
     * 派发出去，里面的字节就是谁的。不记这一笔会出两种串台（都是本节要防的那件事）：
     * - 掐掉一次编译（它不走镜像）却报出上一次运行的 stdout 当 partial；
     * - 队列里第二条 run 在入队时清零，把正在跑的第一条镜像抹掉。
     */
    this.mirrorOwner = 0
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
   * 被掐断时能拿到的 stdout —— **镜像优先，且只认当前这条任务**。
   *
   * 为什么不信 `this.stdout`：worker 里的输出是按 64 KiB 攒批 post 的，`terminate()`
   * 那一刻缓冲区里还剩一截没发出去（2026-10-25 实测：打印 3 行后死循环，3 行全丢；
   * 打印 128 KiB 才留下两个整块）。镜像逐字节写在共享内存里，没有「消息送达」这个窗口。
   *
   * 为什么要核对 `mirrorOwner`：镜像里是**上一颗字节流**的残影，只有它的主人还在跑时才算数。
   * 不核对的两个后果（都是「别人的输出混进这一条」）：
   * - 一条不带镜像的活（编译 / 链接 / 语法）被掐断时，会把上一次运行的 stdout 当成自己的 partial；
   * - 队列里排着第二条 run 时（入队不再清零，见 run），镜像仍是第一条的 —— 而 active 是第一条，
   *   核对得上，正常读；反过来若真的是第一条已死、第二条还没派发，这里就一件都对不上，读空。
   */
  partialStdout() {
    const active = this.active
    if (this.mirror && active && this.mirrorOwner === active.id) {
      const { text } = readMirror(this.mirror)
      if (text) return text
    }
    return this.stdout
  }

  /**
   * 清空这一条任务的增量输出与额度。
   *
   * **必须发生在派发那一刻**（`dispatch`），不能在 `send()` 里：`run()` 会先把消息入队，
   * 如果那时候就清，排队期间上一条任务还在往这里流 chunk，清掉的和流进来的就错位了。
   * 结算与掐断之后也要清，否则上一条的尾巴会被下一条的 result 当成自己的。
   */
  resetOutput() {
    this.stdout = ''
    this.stderr = ''
    this.stdoutChars = 0
    this.stderrChars = 0
    this.stdoutTruncated = false
    this.stderrTruncated = false
  }

  /**
   * 累积一段增量输出，**有上限**（见 stdoutMirror.OUTPUT_LIMIT_BYTES）。
   *
   * 为什么主线程还要自己守一道：worker 已经截了，但发版后会出现「新客户端 + 缓存里的
   * 旧 worker」这种混用（SW 的 retain-manifest 只管 chunk，不管这份 worker 的语义版本），
   * 旧 worker 不带上限。这一道让最坏情况停在限额（见 OUTPUT_LIMIT_BYTES），而不是等内存耗尽。
   *
   * 计数用字符数（worker 侧用字节数）：UTF-8 下字符数恒 ≤ 字节数，所以同一份输出在主线程
   * 这边总是后到上限，不会被提前截断成和 worker 不一致的内容。
   */
  appendOutput(kind, text) {
    if (typeof text !== 'string' || !text) return
    const isOut = kind === 'stdout'
    const used = isOut ? this.stdoutChars : this.stderrChars
    if (used >= OUTPUT_LIMIT_BYTES) {
      if (isOut) this.stdoutTruncated = true
      else this.stderrTruncated = true
      return
    }
    const room = OUTPUT_LIMIT_BYTES - used
    const piece = text.length <= room ? text : text.slice(0, room)
    if (isOut) {
      this.stdout += piece
      this.stdoutChars = used + piece.length
      if (piece.length < text.length) this.stdoutTruncated = true
    } else {
      this.stderr += piece
      this.stderrChars = used + piece.length
      if (piece.length < text.length) this.stderrTruncated = true
    }
  }

  onMessage(message) {
    const active = this.active
    // stdout / stderr 只认**当前这条任务**的。terminate 之后才送到的那几条属于上一条，
    // 之前能不出事全靠「result 里那份完整 stdout 覆盖掉累积值」—— 现在累积值就是唯一
    // 来源（worker 不再带整串），不按 id 认人就会把上次运行的输出算进这一次的 ACTUAL。
    if (message.type === 'stdout' || message.type === 'stderr') {
      if (!active || message.id !== active.id) return
      this.appendOutput(message.type, message.text)
      return
    }
    // Progress events carry no request id and must not settle the active job.
    if (message.type === 'asset-progress') {
      this.onAssetProgress?.(message)
      return
    }
    if (!active || active.id !== message.id) return
    this.active = null
    if (message.type === 'error') {
      const error = new Error(localizeToolchainError(message))
      error.code = message.code || 'WORKER_ERROR'
      error.detail = message.detail ?? null
      error.stage = message.stage
      error.partialStdout = this.partialStdout()
      error.partialStderr = this.stderr
      active.settle(error)
      // init 失败 = 这颗 worker 永远不可用（工具链缺件 / 损坏 / 启动异常）。
      // 必须在这里就地判死并终结整条队列：否则 `pump()` 会把后面排着的 preload / compile
      // 派发进一个 baseFs / clangModule 都没建好的 worker，用户看到的是
      // 「宿主还没 init」——真正的结构化错误码被这句内部措辞盖掉了。
      if (active.payload?.type === 'init') {
        this.dead = true
        this.ready = null
        this.generation += 1
        const worker = this.worker
        this.worker = null
        if (worker) {
          try {
            worker.terminate()
          } catch {
            /* 已经退出 */
          }
        }
        this.fail(error)
        this.emitEvent({ type: 'terminated', reason: null, message: error.message })
        return
      }
    } else {
      const result = message.result ?? {}
      // 输出以增量累积为准；老版本 worker 还会在 result 里带整份，那时以它为准
      // （带整份说明它没走 captureOutput: false，也就不会给出截断标记）。
      //
      // 截断标记两边都要看：worker 是在**写入**那一刻判定的，它一停就不再回调，于是主线程
      // 收到的字节正好停在限额上、一次都不会「超」（2026-11-16 实测：超限输出被截到
      // 限额对应的字符数，但提示行没出现 —— 只看本地计数就是这个症状）。
      const out = result.stdout ?? (this.stdoutTruncated || result.stdoutTruncated ? this.stdout + truncationNote() : this.stdout)
      const err = result.stderr ?? (this.stderrTruncated || result.stderrTruncated ? this.stderr + truncationNote() : this.stderr)
      result.stdout = out
      result.stderr = err
      this.resetOutput()
      active.settle(null, result)
    }
    this.pump()
  }

  ensureWorker() {
    if (this.alive) return this.worker
    // 旧 worker 的握手表先清掉（它要么在 terminate 里已经清过，要么从没起来）
    if (this.bootTimer) {
      clearTimeout(this.bootTimer)
      this.bootTimer = 0
    }
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
    const worker = new Worker(WASI_WORKER_URL, {
      type: 'module',
      name: 'cp-cpp-wasi',
    })

    /**
     * BOOTED 握手（2026-11-22，第三步）。
     *
     * 为什么需要它：离线冷启时如果这颗 worker 的 chunk 不在缓存里，`new Worker` 不会抛，
     * 只会在几乎同一拍触发 `worker.onerror`；而此时 init 还挂在 5 分钟的下载表上，
     * 用户看到的是「准备环境一直转圈」。这里把「脚本没起来」与「脚本起来了、init 慢」
     * 分开：前者立刻查 `caches.match(workerUrl)`，缺就是 WORKER_SCRIPT_MISSING。
     *
     * 两条纪律：
     * - onerror 且尚未 BOOTED → 不进 5 秒等待，直接查缓存（发版窗口里最常见的就是这一格）；
     * - 超时 5 秒（不是 3 秒）：低端安卓冷启主线程繁忙，3 秒容易误报。
     */
    let booted = false
    let bootSettled = false
    const clearBootTimer = () => {
      if (this.bootTimer) {
        clearTimeout(this.bootTimer)
        this.bootTimer = 0
      }
    }
    const failBoot = async (fallbackMessage, fallbackCode) => {
      if (bootSettled) return
      bootSettled = true
      clearBootTimer()
      const cached = await workerScriptCached(WASI_WORKER_URL)
      // cached === false 才是「确实不在缓存里」；null（隐私模式 / 没有 Cache Storage）
      // 不能拿来指控脚本缺失，退回调用方给的措辞。
      const missing = cached === false
      const error = Object.assign(
        new Error(missing ? t('error.workerScriptMissing') : fallbackMessage),
        {
          code: missing ? WORKER_ERROR.SCRIPT_MISSING : fallbackCode,
          detail: { url: WASI_WORKER_URL, cached },
        },
      )
      this.failBootedWorker(worker, error)
    }

    worker.onmessage = (event) => {
      const data = event.data
      if (!booted) {
        booted = true
        bootSettled = true
        clearBootTimer()
      }
      // BOOTED 只用于握手，不交给队列（它没有 id，也不该 settle 任何任务）
      if (data?.type === 'booted') return
      this.onMessage(data)
    }
    worker.onerror = (event) => {
      const message = event?.message || t('error.workerCrash')
      if (!booted) {
        // 离线缺 chunk 会在这一拍到达 —— 不要傻等 5 秒超时
        void failBoot(message, WORKER_ERROR.CRASHED)
        return
      }
      const error = new Error(message)
      error.code = WORKER_ERROR.CRASHED
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
    this.bootTimer = setTimeout(() => {
      void failBoot(t('error.workerBootTimeout'), WORKER_ERROR.BOOT_TIMEOUT)
    }, WORKER_BOOT_TIMEOUT_MS)
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

  /**
   * 握手失败 / 脚本缺失时收掉这颗 worker。
   *
   * 与 `terminate` 分开：那条路要区分 KILL_REASON、还要决定排队任务是否交接；
   * 这里只有一种结论 —— 这颗 worker 从未可用，所有任务都该拿到同一条结构化错误。
   */
  failBootedWorker(worker, error) {
    // 异步查缓存期间这颗 worker 可能已经被换掉（新一轮 ensureWorker）：
    // 旧 worker 的结论不能落在新 worker 的任务上
    if (this.worker !== worker) return
    this.dead = true
    this.generation += 1
    this.ready = null
    try {
      worker.terminate()
    } catch {
      /* 已经退出 */
    }
    this.worker = null
    this.fail(error)
    this.emitEvent({ type: 'terminated', reason: null, message: error.message })
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
    // 每条任务的输出从零开始，**清在派发这一刻**：`send()` 时上一条可能还在流 chunk，
    // 那时候清就会「清掉的和流进来的错位」。结算与掐断也会清（见 resetOutput）。
    this.resetOutput()
    // 带镜像的那条（run）在这里清零并认领：镜像只被一条任务占用，派发是唯一安全的时点
    // —— 上一条已经结束（pump 保证一次只有一条 active），下一条还没收到消息。
    if (this.mirror && job.payload.stdoutSAB) {
      resetMirror(this.mirror)
      this.mirrorOwner = job.id
    }
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
    // **不在这里清零**。入队时清零会踩两条：一是「队列里排着第二条 run」时把正在跑的第一条
    // 镜像抹掉（它后面被 TLE 掐断就只能拿到半截），二是清零发生在派发之前、和 worker 的写入
    // 之间隔着一个调度窗口。清零 + 认领改在 dispatch 那一刻做（同步、紧接着 postMessage），
    // 「排着队就被掐」那条则由 mirrorOwner 核对出来读空。
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
    // 握手表只属于被收掉的那颗 worker；留着会在新 worker 上误报一次 BOOT_TIMEOUT
    if (this.bootTimer) {
      clearTimeout(this.bootTimer)
      this.bootTimer = 0
    }
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
    // 掐断之后这两份增量输出就属于上一条任务了，留着会被下一条的 result 当成自己的。
    // 镜像同理：字节还留在 SAB 里（下一条 run 派发时才清），把归属一起放掉，
    // 中间发生的任何 partialStdout() 都读不到上一条的残影。
    this.resetOutput()
    this.mirrorOwner = 0

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
