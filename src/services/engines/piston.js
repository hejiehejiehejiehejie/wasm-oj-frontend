import { pickReason, requestJson, trimBase } from './http.js'

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
  label: 'Piston',
  hint: '推荐自建：docker run -p 2000:2000 ghcr.io/piston-cli/piston:stable，然后填 http://localhost:2000',
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
    if (response.aborted) return { ok: false, message: '已取消' }
    if (response.unreachable) {
      return { ok: false, message: `连不上 ${trimBase(base)}（${response.text}）` }
    }
    if (!response.ok) {
      return { ok: false, message: pickReason(response.text, response.status) }
    }
    const stdout = (response.data?.run?.stdout ?? '').trim()
    return stdout === '1' ? { ok: true, message: `服务可用，${response.durationMs}ms` } : { ok: false, message: '响应格式不是 Piston' }
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
        detail: `无法连接评测服务 ${trimBase(base)}/execute。用左上角设置改成自建 Piston 地址即可。`,
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
      return { outcome: 'compile-error', stdout, stderr: compileOutput || '编译失败', durationMs: response.durationMs }
    }
    if (run.signal === 'SIGKILL' || run.signal === 'SIGXCPU' || run.code === 137) {
      return { outcome: 'timeout', stdout, stderr, durationMs: response.durationMs }
    }
    if ((typeof run.code === 'number' && run.code !== 0) || stderr) {
      return { outcome: 'runtime-error', stdout, stderr: stderr || `退出码 ${run.code}`, durationMs: response.durationMs }
    }
    return { outcome: 'ok', stdout, stderr: '', durationMs: response.durationMs }
  },
}
