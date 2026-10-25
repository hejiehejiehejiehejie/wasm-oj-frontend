/**
 * 桌面端原生引擎 —— 代码交给 Tauri 的 Rust 侧跑：C++ 落盘后用本机的 clang++ / g++ 编译，
 * Python 直接起本机解释器，都不下载任何运行时。「本机是哪一个」由 Rust 侧的
 * `src-tauri/src/toolchain.rs` 探测（那是唯一出处），这里不关心。
 *
 * 【跨语言契约】命令名与参数名必须与 src-tauri/src/native.rs 里
 * `#[tauri::command] fn run_cpp / run_python` 逐字对上：Tauri v2 按 camelCase
 * 反序列化参数（Rust 的 `time_limit_ms` ↔ 前端的 `timeLimitMs`），写错只会得到
 * 一句「参数缺失」。下面 COMMANDS 那张表就是两边的对账点。
 *
 * 【文案】Rust 侧刻意不产出任何界面话术（见项目约定「界面文案一律不写死」），
 * 所以只有「环境不可用」这类只有前端才知道的错因由这里翻成人话；
 * 编译错误 / 运行错误的正文是 clang 与解释器的原文，原样交给卡片。
 */

import { invoke } from '@tauri-apps/api/core'
import { t } from '../../i18n/index.js'
import { HOST_OS } from '../platform.js'

/** languageId → Rust 命令名。加语言时，这张表与 native.rs 的 #[tauri::command] 一起改。 */
const COMMANDS = { cpp: 'run_cpp', python: 'run_python' }

/** 自检用的小程序：跑通就说明这条语言的工具链在 */
const SELF_TEST = {
  cpp: { code: '#include <iostream>\nint main(){ std::cout << 1; return 0; }\n' },
  python: { code: 'print(1)\n' },
}

/** 只有环境出错时才有 detail；都没有就补一句「无更多信息」，别让卡片空着 */
function failureText(result) {
  return (result.detail || result.stderr || '').trim() || t('engine.native.noDetail')
}

/**
 * 按宿主系统挑「去哪儿装」的提示。
 *
 * 键名与 i18n 表里的 `cppHint*` / `pythonHint*` 对齐；表里三套后缀（Windows / Mac /
 * Other）都备着，免得在某台机器上拼出一个不存在的键、提示直接变成 key 本身。
 */
function osHint(kind) {
  const suffix = { windows: 'Windows', mac: 'Mac', other: 'Other' }[HOST_OS]
  return t(`engine.native.${kind}Hint${suffix}`)
}

/**
 * 调一次 Rust 命令，把返回体收成 EngineExecution 的形状。
 *
 * Rust 侧已经按同一套口径序列化好了（camelCase、`ok` 时 stderr 为空、
 * 编译失败 `durationMs` 为 null、outcome 用同一张词表），所以这里基本是原样递回，
 * 唯一要补的是把「Rust 说不可达」翻成一句人话（`runner.js` 那条分支只会看 detail）。
 */
async function runNative(command, { code, stdin, timeLimitMs }) {
  const payload = { code, stdin }
  // 时限是可选参数：不传时 Rust 取默认值。JSON.stringify 会丢掉 undefined，
  // 干脆只在确实是数字时带上，避免依赖「缺字段等价于 None」这种细节
  if (typeof timeLimitMs === 'number') payload.timeLimitMs = timeLimitMs

  let result
  try {
    result = await invoke(command, payload)
  } catch (error) {
    // invoke 本身失败（命令没注册 / 参数名写错 / 拿不到 IPC）：归到「环境不可用」，
    // 让卡片把原因显示出来，而不是静默失败
    return {
      outcome: 'unreachable',
      stdout: '',
      stderr: '',
      detail: t('engine.native.unavailable', { message: String(error?.message ?? error) }),
      durationMs: null,
    }
  }

  const durationMs = typeof result.durationMs === 'number' ? result.durationMs : null

  if (result.outcome === 'unreachable') {
    return {
      outcome: 'unreachable',
      stdout: '',
      stderr: '',
      detail: t('engine.native.unavailable', { message: failureText(result) }),
      durationMs,
    }
  }

  return {
    outcome: result.outcome,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    durationMs,
  }
}

export const nativeEngine = {
  id: 'native',
  labelKey: 'engine.native.label',
  hintKey: 'engine.native.hint',
  executesCode: true,
  // 本机进程不设内存上限：超了可能表现为 RE 或直接 AC，不会判 MLE（规范 §8）
  enforcesMemoryLimit: false,
  defaultBase: 'local',
  // 只在 Tauri 桌面壳里可用：网页版没有 IPC，选了也只会拿到 unreachable
  platforms: ['desktop'],

  supports(languageId) {
    return languageId in COMMANDS
  },

  /**
   * 自检两项系统依赖：C++ 要 clang++ 或 g++，Python 要有能用的解释器。
   * 各跑一句最小程序，比只看命令存不存在可靠 —— 缺的是整条编译 / 解释链路。
   * 失败时按宿主系统补一句「去哪儿装」（见 osHint）。
   */
  async health() {
    const cpp = await runNative(COMMANDS.cpp, { ...SELF_TEST.cpp, stdin: '', timeLimitMs: 10_000 })
    if (cpp.outcome !== 'ok' || cpp.stdout.trim() !== '1') {
      return {
        ok: false,
        message: t('engine.native.cppUnavailable', {
          message: failureText(cpp),
          hint: osHint('cpp'),
        }),
      }
    }

    const python = await runNative(COMMANDS.python, {
      ...SELF_TEST.python,
      stdin: '',
      timeLimitMs: 10_000,
    })
    if (python.outcome !== 'ok' || python.stdout.trim() !== '1') {
      return {
        ok: false,
        message: t('engine.native.pythonUnavailable', {
          message: failureText(python),
          hint: osHint('python'),
        }),
      }
    }

    return { ok: true, message: t('engine.native.ready') }
  },

  async execute({ languageId, code, stdin, signal, timeLimitMs }) {
    const command = COMMANDS[languageId]
    // runner.js 已经用 supports() 挡过一次，这里兜底防别的调用方直接进来
    if (!command) {
      return {
        outcome: 'unreachable',
        stdout: '',
        stderr: '',
        detail: t('engine.native.unsupportedLanguage', { language: languageId }),
        durationMs: null,
      }
    }

    // Rust 侧还没有中途取消的通路（见 HANDOFF §14.B「尚未做」），所以这里只认
    // 「还没开始跑就被取消」；跑起来之后按不下去，等那边补上 kill 通道再说
    if (signal?.aborted) {
      return { outcome: 'cancelled', stdout: '', stderr: '', durationMs: null }
    }

    return runNative(command, { code, stdin, timeLimitMs })
  },
}
