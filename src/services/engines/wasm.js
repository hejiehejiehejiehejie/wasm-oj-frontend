/**
 * 本地 WASM 沙箱引擎 —— 在浏览器里用 runno 跑代码，不经过任何后端。
 * C++ 走「wasm 版 clang 编译 + wasm-ld 链接」，Python 走「解释器直接执行」，
 * 两条管线都落在 src/services/runnoSandbox.js，由 src/services/wasmRuntime.js
 * （工具链缓存 + 阶段播报 + 看门狗中断 + 语言路由）统一调度。
 * 这个文件只做一件事：把回来的一串消息翻译成 runner 认识的 EngineExecution。
 */

import { runCase } from '../wasmRuntime.js'
import { withSourceName } from '../runnoSandbox.js'
import { t } from '../../i18n/index.js'

const SUPPORTED_LANGUAGES = new Set(['cpp', 'python'])

/**
 * 程序没走到 exit 0 时卡片上那行说明的**来源优先级**：
 *   用户自己的 stderr → trap 的「人话 + 原文」→ 退出码兜底。
 *
 * 为什么要中间这一层（2026-10-25 用户报障）：宿主把**任何** wasm trap 都折成退出码 134，
 * 于是越界、`unreachable`、`abort()` 全都显示「程序退出码 134」—— 同一个数字，用户没法
 * 判断是哪种错，而且 134 在真机上是 SIGABRT，会把人带偏。trap 原文其实一直在
 * `message.trap` 里（`RuntimeError: memory access out of bounds` 这种），只是没人用。
 *
 * 归类用正则而不是精确匹配：同一件事在不同浏览器 / V8 版本上措辞会变
 * （`unreachable` / `unreachable executed`），认不出来就原样透出 —— 宁可英文，也别丢真因。
 */
const TRAP_LABELS = [
  [/memory access out of bounds/i, 'error.trapOutOfBounds'],
  [/table index is out of bounds/i, 'error.trapTableIndex'],
  [/null function or function signature mismatch/i, 'error.trapNullFunction'],
  [/divide by zero/i, 'error.trapDivideByZero'],
  [/remainder by zero/i, 'error.trapRemainderByZero'],
  [/integer overflow/i, 'error.trapIntegerOverflow'],
  [/invalid conversion to integer/i, 'error.trapInvalidConversion'],
  [/unreachable/i, 'error.trapUnreachable'],
  [/call stack (exhausted|size exceeded)|maximum call stack/i, 'error.trapStackOverflow'],
  // C++ 未捕获异常（throw / vector::at 越界 / std::stoi 抛 invalid_argument …）在宿主侧
  // 只剩这一串 JS 对象字面量：`Exception: [object WebAssembly.Exception]`。
  // 拿不到 what()（得知道模块自己的 tag 才能 getArg），所以只给它一句人话；
  // 这里的「原文」没有信息量，文案里也就不带 {raw}。
  [/\[object WebAssembly\.Exception\]/, 'error.trapUncaught'],
]

/** 给一段 trap 文本套上「人话（原文）」；认不出来的、空的都原样返回 */
function describeTrap(trap) {
  const raw = String(trap ?? '').replace(/^[A-Za-z]*Error:\s*/, '').trim()
  if (!raw) return ''
  const hit = TRAP_LABELS.find(([pattern]) => pattern.test(raw))
  return hit ? t(hit[1], { raw }) : raw
}

export const wasmEngine = {
  id: 'wasm',
  // 引擎注册表里只放 key：label / hint 是数据，必须在渲染那一刻才求值（见 i18n 调用纪律）
  labelKey: 'engine.wasm.label',
  hintKey: 'engine.wasm.hint',
  executesCode: true,
  // 链接期 --max-memory 封顶线性内存；分配是否真的失败由 sbrk 探针计数（判定规范 §5.2）
  enforcesMemoryLimit: true,
  // 内置引擎没有服务地址，按注册表约定固定填 'local'
  defaultBase: 'local',
  // 只在网页版出现：桌面壳里没有 COOP/COEP（SharedArrayBuffer 起不来）也没有 Cache Storage，
  // 沙箱在那里跑不动，桌面端由 engines/native.js 顶上（见 HANDOFF 第 14 节）
  platforms: ['web'],

  supports(languageId) {
    return SUPPORTED_LANGUAGES.has(languageId)
  },

  async health() {
    // 唯一的硬前提是跨域隔离：没有它 WASI 的 SharedArrayBuffer 起不来
    if (typeof SharedArrayBuffer !== 'function' || !globalThis.crossOriginIsolated) {
      return { ok: false, message: t('engine.wasm.noIsolation') }
    }
    return { ok: true, message: t('engine.wasm.ready') }
  },

  async execute({ languageId, entryPath, code, stdin, signal, timeLimitMs, memoryLimitBytes = 0 }) {
    const message = await runCase({ language: languageId, entryPath, code, stdin, signal, timeLimitMs, memoryLimitBytes })
    // 耗时口径：C++ 只算运行段（不含编译，编译是整批用例共享的一次性开销）；
    // Python 没有编译段，这里就是解释器启动 + 程序执行的墙钟。
    // 程序没跑起来（编译失败 / 环境不可用）时是 null，卡片就不显示时间。
    const durationMs = typeof message.durationMs === 'number' ? message.durationMs : null

    if (message.type === 'cancelled') {
      return { outcome: 'cancelled', stdout: '', stderr: '', durationMs: null }
    }
    if (message.type === 'timeout') {
      return { outcome: 'timeout', stdout: message.stdout ?? '', stderr: message.stderr ?? '', durationMs }
    }
    if (message.type === 'failure') {
      // 编译阶段超时被中断时 stage 是 'compile'：这是编译阶段的失败，按编译错误报给用户，
      // 让卡片直接把原因显示出来，而不是笼统地说「服务不可达」。
      if (message.stage === 'compile') {
        return { outcome: 'compile-error', stdout: '', stderr: withSourceName(message.message, entryPath), durationMs }
      }
      // 运行段 worker 崩溃（探针实测 2026-10-12：真栈溢出会炸掉 runno 的宿主，无 exitCode）
      // 是**程序**的问题 → RE；stderr 透传 worker 消息，runner 的 RE 分支直接拿它当 detail，
      // 卡片能显示「call stack exhausted」这类真实原因。
      if (message.stage === 'run') {
        return {
          outcome: 'runtime-error',
          stdout: message.stdout ?? '',
          stderr: describeTrap(message.message) || message.message,
          durationMs,
        }
      }
      return {
        outcome: 'unreachable',
        stdout: '',
        stderr: '',
        detail: t('engine.wasm.unavailable', { message: message.message }),
        durationMs,
      }
    }

    const stdout = message.stdout ?? ''
    const stderr = (message.stderr ?? '').trim()

    // Worker 的 stage 说明停在哪一步：'compile' 是编译器没过，'run' 是程序跑起来了但退出异常
    if (message.stage === 'compile') {
      // 诊断里的 `/program.cpp` 换成用户实际文件名（`/main.cpp`），只是显示层的替换
      return { outcome: 'compile-error', stdout, stderr: withSourceName(stderr, entryPath) || t('error.compileFailed'), durationMs }
    }
    if (!message.ok) {
      // MLE 的第一证据是**分配真的失败过**：链接期塞进去的探针接管了 sbrk，每次
      // memory.grow 失败记一笔，宿主补丁在 trap 之后把计数带回来（message.sbrkFailures）。
      // 只有「开了上限 + 退出码 134 + 失败次数 > 0」才判 MLE；空指针写入、运行期除零、
      // abort()、栈溢出同样折成 134，但分配从未失败 → RE（判定规范 §2.1 / §5.2 / §8）。
      //
      // 补丁不在（拿到了 null）时退回旧的「134 + 空 stderr」启发式：那是已知会误判的
      // 兜底，不能因为拿不到证据就把真正的 MLE 全判成 RE。
      if (memoryLimitBytes > 0 && message.exitCode === 134) {
        if (typeof message.sbrkFailures === 'number') {
          if (message.sbrkFailures > 0) return { outcome: 'mle', stdout, stderr: '', durationMs }
        } else if (!stderr) {
          return { outcome: 'mle', stdout, stderr: '', durationMs }
        }
      }
      return {
        outcome: 'runtime-error',
        stdout,
        stderr: stderr || describeTrap(message.trap) || t('error.programExitCode', { code: message.exitCode }),
        durationMs,
      }
    }
    return { outcome: 'ok', stdout, stderr: '', durationMs }
  },
}