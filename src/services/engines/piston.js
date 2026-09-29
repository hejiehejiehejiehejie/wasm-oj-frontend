import { pickReason, requestJson, trimBase } from './http.js'
import { t } from '../../i18n/index.js'

const RUN_TIMEOUT_MS = 5000
const COMPILE_TIMEOUT_MS = 10000

// Piston 侧的语言标识由引擎自己维护，界面层只认识 cpp / python。
const TARGETS = {
  cpp: { language: 'c++', version: '10.2.0', fileName: 'Main.cpp' },
  python: { language: 'python', version: '3.10.0', fileName: 'Main.py' },
}

async function executeOnce({ base, languageId, code, stdin, signal, runTimeout }) {
  const target = TARGETS[languageId]
  return requestJson(`${trimBase(base)}/execute`, {
    method: 'POST',
    signal,
    body: {
      language: target.language,
      version: target.version,
      files: [{ name: target.fileName, content: code }],
      stdin,
      compile_timeout: COMPILE_TIMEOUT_MS,
      run_timeout: runTimeout,
    },
  })
}

export const pistonEngine = {
  id: 'piston',
  labelKey: 'engine.piston.label',
  hintKey: 'engine.piston.hint',
  executesIntialized: true,
  executesCode: true,
  defaultBase: 'http://localhost:2000',

  supports(languageId) {
    return languageId in TARGETS
  },

  /** 真跑一句 print(1)，比 GET / 更能说明问题。 */
  async health(base, signal) {
    const response = await executeOnce({
      base,
      languageId: 'python',
      code: 'print(1)\n',
      stdin: '',
      signal,
      runTimeout: 2000,
    })
    if (response.aborted) return { ok: false, message: t('engine.piston.cancelled') }
    if (response.unreachable) {
      return {
        ok: false,
        message: t('engine.piston.unreachable', { base: trimBase(base), text: response.text }),
      }
    }
    if (!response.ok) {
      return { ok: false, message: pickReason(response.text, response.status) }
    }
    const stdout = (response.data?.run?.stdout ?? '').trim()
    return stdout === '1'
      ? { ok: true, message: t('engine.piston.available', { ms: response.durationMs }) }
      : { ok: false, message: t('engine.piston.notPiston') }
  },

  async execute({ base, languageId, code, stdin, signal, timeLimitMs }) {
    // 全局时限只计运行段，正好对应 Piston 的 run_timeout（编译另有 compile_timeout）。
    // 自检路径没传时限，退回默认值。
    const response = await executeOnce({ base, languageId, code, stdin, signal, runTimeout: timeLimitMs ?? RUN_TIMEOUT_MS })

    if (response.aborted) return { outcome: 'cancelled', stdout: '', stderr: '', durationMs: null }
    if (response.unreachable) {
      return {
        outcome: 'unreachable',
        stdout: '',
        stderr: '',
        detail: t('error.pistonConnect', { base: trimBase(base) }),
        durationMs: response.durationMs,
      }
    }
    if (!response.ok) {
      return {
        outcome: 'rejected',
        stdout: '',
        stderr: '',
        detail: pickReason(response.text, response.status),
        durationMs: response.durationMs,
      }
    }

    const compile = response.data?.compile ?? {}
    const run = response.data?.run ?? {}
    const compileOutput = (compile.output ?? '').trim()
    const stdout = run.stdout ?? ''
    const stderr = (run.stderr ?? '').trim()

    if ((typeof compile.code === 'number' && compile.code !== 0) || (compileOutput && !stdout && !stderr)) {
      return {
        outcome: 'compile-error',
        stdout,
        stderr: compileOutput || t('error.pistonCompileFailed'),
        durationMs: response.durationMs,
      }
    }
    if (run.signal === 'SIGKILL' || run.signal === 'SIGXCPU' || run.code === 137) {
      return { outcome: 'timeout', stdout, stderr, durationMs: response.durationMs }
    }
    if ((typeof run.code === 'number' && run.code !== 0) || stderr) {
      return {
        outcome: 'runtime-error',
        stdout,
        stderr: stderr || t('error.pistonExitCode', { code: run.code }),
        durationMs: response.durationMs,
      }
    }
    return { outcome: 'ok', stdout, stderr: '', durationMs: response.durationMs }
  },
}
