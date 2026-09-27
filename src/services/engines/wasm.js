/**
 * 本地 WASM 沙箱引擎 —— 在浏览器里用 runno 跑代码，不经过任何后端。
 * C++ 走「wasm 版 clang 编译 + wasm-ld 链接」，Python 走「解释器直接执行」，
 * 两条管线都落在 src/services/runnoSandbox.js，由 src/services/wasmRuntime.js
 * （工具链缓存 + 阶段播报 + 看门狗中断 + 语言路由）统一调度。
 * 这个文件只做一件事：把回来的一串消息翻译成 runner 认识的 EngineExecution。
 */

import { runCase } from '../wasmRuntime.js'

const SUPPORTED_LANGUAGES = new Set(['cpp', 'python'])

export const wasmEngine = {
  id: 'wasm',
  label: '本地 WASM 沙箱',
  hint: '在浏览器里编译运行，代码不出本机；支持 C++ 与 Python，首次需下载本地运行时（C++ 约 50MB / Python 约 24MB）',
  executesCode: true,
  // 内置引擎没有服务地址，按注册表约定固定填 'local'
  defaultBase: 'local',

  supports(languageId) {
    return SUPPORTED_LANGUAGES.has(languageId)
  },

  async health() {
    // 唯一的硬前提是跨域隔离：没有它 WASI 的 SharedArrayBuffer 起不来
    if (typeof SharedArrayBuffer !== 'function' || !globalThis.crossOriginIsolated) {
      return {
        ok: false,
        message: '页面没有跨域隔离，SharedArrayBuffer 不可用：确认 dev server 已注入 COOP / COEP 响应头',
      }
    }
    return { ok: true, message: '本地沙箱可用，首次运行需下载本地运行时（C++ 约 50MB / Python 约 24MB，之后常驻缓存）' }
  },

  async execute({ languageId, entryPath, code, stdin, signal, timeLimitMs }) {
    const message = await runCase({ language: languageId, entryPath, code, stdin, signal, timeLimitMs })
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
      return {
        outcome: 'unreachable',
        stdout: '',
        stderr: '',
        detail: `本地沙箱不可用：${message.message}`,
        durationMs,
      }
    }

    const stdout = message.stdout ?? ''
    const stderr = (message.stderr ?? '').trim()

    // Worker 的 stage 说明停在哪一步：'compile' 是编译器没过，'run' 是程序跑起来了但退出异常
    if (message.stage === 'compile') {
      return { outcome: 'compile-error', stdout, stderr: stderr || '编译未通过', durationMs }
    }
    if (!message.ok) {
      return { outcome: 'runtime-error', stdout, stderr: stderr || `程序退出码 ${message.exitCode}`, durationMs }
    }
    return { outcome: 'ok', stdout, stderr: '', durationMs }
  },
}