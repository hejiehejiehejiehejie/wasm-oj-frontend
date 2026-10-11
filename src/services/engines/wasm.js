/**
 * 本地 WASM 沙箱引擎 —— 在浏览器里用 runno 跑代码，不经过任何后端。
 * C++ 走「wasm 版 clang 编译 + wasm-ld 链接」，Python 走「解释器直接执行」，
 * 两条管线都落在 src/services/runnoSandbox.js，由 src/services/wasmRuntime.js
 * （工具链缓存 + 阶段播报 + 看门狗中断 + 语言路由）统一调度。
 * 这个文件只做一件事：把回来的一串消息翻译成 runner 认识的 EngineExecution。
 */

import { runCase } from '../wasmRuntime.js'
import { t } from '../../i18n/index.js'

const SUPPORTED_LANGUAGES = new Set(['cpp', 'python'])

export const wasmEngine = {
  id: 'wasm',
  // 引擎注册表里只放 key：label / hint 是数据，必须在渲染那一刻才求值（见 i18n 调用纪律）
  labelKey: 'engine.wasm.label',
  hintKey: 'engine.wasm.hint',
  executesCode: true,
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
        return { outcome: 'compile-error', stdout: '', stderr: message.message, durationMs }
      }
      // 运行段 worker 崩溃（探针实测 2026-10-12：真栈溢出会炸掉 runno 的宿主，无 exitCode）
      // 是**程序**的问题 → RE；stderr 透传 worker 消息，runner 的 RE 分支直接拿它当 detail，
      // 卡片能显示「call stack exhausted」这类真实原因。
      if (message.stage === 'run') {
        return { outcome: 'runtime-error', stdout: '', stderr: message.message, durationMs }
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
      return { outcome: 'compile-error', stdout, stderr: stderr || t('error.compileFailed'), durationMs }
    }
    if (!message.ok) {
      // MLE 判据（实测 2026-10-12，探针系列）：开 --max-memory 后，真实超内存的程序在
      // 第一次触碰超出上限的地址时 OOB trap → 退出码 134、stderr 为空。判据刻意收窄：
      // 只有「开了上限 + 134 + stderr 全空」才判 MLE。
      //
      // 已知边界（探针实测）：
      // - 用户自己 abort() 也是 134 + 空 stderr → 会误判成 MLE；
      // - 「分配了但从不读写」的退化程序（vector(n) 只打印 size()）在 -O2 下零填充被
      //   死存储消除、分配失败的 abort 分支被 libc++abi 的 unreachable 语义吞掉，
      //   会假成功退出 0 → 判 AC。真实 OJ 的 RSS 口径下这类程序也不算超内存，可接受；
      //   常量下标的读写同理（store-to-load 转发 + 死存储删除，探针实测）——运行期
      //   下标的循环转发不掉，必 trap，所以真实形态的竞赛程序都会正确落进 MLE；
      // - C 程序检查 malloc 返回 0 后自行退出的 → 退出码 1 → 判 RE。
      // 要精确就得读峰值内存（worker 注入记 grow，二期）。
      if (memoryLimitBytes > 0 && message.exitCode === 134 && !stderr) {
        return { outcome: 'mle', stdout, stderr: '', durationMs }
      }
      return {
        outcome: 'runtime-error',
        stdout,
        stderr: stderr || t('error.programExitCode', { code: message.exitCode }),
        durationMs,
      }
    }
    return { outcome: 'ok', stdout, stderr: '', durationMs }
  },
}