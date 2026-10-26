import { DEFAULT_CHECKER_ID, checkOutput } from './checkers.js'
import { t } from '../i18n/index.js'

/**
 * 编排层：把引擎返回的 outcome 翻译成测试卡片需要的状态补丁。
 * 界面只认 patch.status，具体走哪个引擎、协议长什么样都在 engines/ 里面。
 *
 * @typedef {'idle'|'running'|'passed'|'failed'|'error'} CaseStatus
 * @typedef {'AC'|'WA'|'CE'|'TLE'|'MLE'|'RE'|'ERR'} Verdict 卡片徽标上的判定码，只有跑完才有
 * @typedef {{status: CaseStatus, verdict: Verdict|'', actualOutput: string, detail: string, note: string, durationMs: number|null}} CasePatch
 */

const LANGUAGE_UNSUPPORTED = (engine) =>
  t('tests.outcome.unsupportedLanguage', { engine: t(engine.labelKey) })

// 全局时限（毫秒），只计程序运行段，不含编译。
// 本地沙箱靠它 kill 掉跑不完的程序（TLE），远端引擎各自换算成自己的参数。
export const TIME_LIMIT_DEFAULT_MS = 2000
export const TIME_LIMIT_OPTIONS = [1000, 2000, 5000, 10000]

// 全局内存上限（字节），与运行时限同口径：所有用例统一，超了判 MLE。
// 只对「引擎能兑现」的场合生效：wasm 沙箱在链接期把线性内存封顶（--max-memory），
// Judge0 透传 memory_limit（KB）；兑现不了的引擎（piston / native）忽略它。
export const MEMORY_LIMIT_DEFAULT_BYTES = 256 * 1024 * 1024
export const MEMORY_LIMIT_OPTIONS = [64, 128, 256, 512, 1024].map((mb) => mb * 1024 * 1024)

function failed(detail, durationMs = null, extra = {}) {
  return { status: 'error', verdict: 'ERR', actualOutput: '', detail, note: '', durationMs, ...extra }
}

/**
 * 卡片上「时限 / 上限」的写法，与设置页同一套口径（`EditorSettingsPanel` 的
 * `memoryLimitLabel` 给的是 `256 MB`，时限选项是 `1 / 2 / 5 / 10 s`）。
 *
 * 为什么要显示它们（2026-10-25 用户问「TLE / MLE 输出什么」）：原来只有一句
 * 「运行超时 (TLE)」/「内存超限 (MLE)」，而这两个上限都是可改的全局设置、还能被
 * 每道题覆盖 —— 不写数字，用户没法判断「是我程序慢，还是我把时限调低了」。
 * 拿不到值（自检等路径没传）时返回空串，调用方退回不带数字的老文案。
 */
function timeLimitLabel(ms) {
  if (typeof ms !== 'number' || !(ms > 0)) return ''
  return ms % 1000 === 0 ? `${ms / 1000} s` : `${Math.round(ms)} ms`
}

function memoryLimitLabel(bytes) {
  if (typeof bytes !== 'number' || !(bytes > 0)) return ''
  return `${Math.round(bytes / 1024 / 1024)} MB`
}

/**
 * 跑一个用例并给出卡片补丁。
 *
 * checker 是输出比对方式（services/checkers.js 的 id）。空 / 未知一律按默认逐行，
 * 只在 exit 0 之后参与 AC / WA 判定，不影响 TLE / MLE / RE。
 *
 * @returns {Promise<CasePatch>}
 */
export async function evaluateCase({ engine, base, languageId, entryPath, code, testCase, timeLimitMs, memoryLimitBytes, checker = DEFAULT_CHECKER_ID, signal }) {
  if (engine?.supports && !engine.supports(languageId)) {
    return failed(LANGUAGE_UNSUPPORTED(engine))
  }

  const result = await engine.execute({
    base,
    languageId,
    entryPath,
    code,
    stdin: testCase.input ?? '',
    timeLimitMs,
    memoryLimitBytes,
    signal,
  })
  const durationMs = typeof result.durationMs === 'number' ? result.durationMs : null

  switch (result.outcome) {
    case 'cancelled':
      return { status: 'idle', verdict: '', actualOutput: '', detail: '', note: '', durationMs: null }

    case 'ok': {
      const match = checkOutput(result.stdout, testCase.expectedOutput, checker)
      return {
        status: match ? 'passed' : 'failed',
        verdict: match ? 'AC' : 'WA',
        actualOutput: result.stdout,
        detail: '',
        // 编译期诊断（当前只有「编译期确定的除以零」）单独占一行 `note`，**不进 detail**：
        // detail 会与 stdout 一起拼成 ACTUAL 的内容，那样「复制输出」会把这句提示也复制走，
        // 用户粘到别处时凭空多一行中文。判定照旧只看输出比对，AC / WA 不受它影响。
        note: result.warning ?? '',
        durationMs,
      }
    }

    case 'compile-error':
      return {
        status: 'error',
        verdict: 'CE',
        actualOutput: result.stdout ?? '',
        detail: result.stderr || t('tests.outcome.compileFailed'),
        note: '',
        durationMs,
      }

    case 'timeout': {
      const limit = timeLimitLabel(timeLimitMs)
      return {
        status: 'error',
        verdict: 'TLE',
        actualOutput: result.stdout ?? '',
        detail: limit ? t('tests.outcome.timeout', { limit }) : t('tests.outcome.timeoutPlain'),
        note: '',
        durationMs,
      }
    }

    case 'mle': {
      const limit = memoryLimitLabel(memoryLimitBytes)
      return {
        status: 'error',
        verdict: 'MLE',
        actualOutput: result.stdout ?? '',
        detail: limit ? t('tests.outcome.memoryExceeded', { limit }) : t('tests.outcome.memoryExceededPlain'),
        note: '',
        durationMs,
      }
    }

    case 'runtime-error':
      return {
        status: 'error',
        verdict: 'RE',
        actualOutput: result.stdout ?? '',
        detail: result.stderr || t('tests.outcome.runtimeError'),
        note: '',
        durationMs,
      }

    case 'unreachable':
      return failed(result.detail || t('tests.outcome.serviceUnreachable'), durationMs)

    default:
      return failed(
        result.detail || result.stderr || t('tests.outcome.failed', { outcome: result.outcome }),
        durationMs,
      )
  }
}

/**
 * 小并发跑完一批用例，逐个回调补丁，界面可以实时看到卡片变色。
 * 回调签名固定为 (testCase, patch, index)。
 */
export async function runCases({ engine, base, languageId, entryPath, code, cases, timeLimitMs, memoryLimitBytes, checker, signal, concurrency = 2, onCase }) {
  const queue = cases.map((testCase, index) => ({ testCase, index }))

  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, queue.length)) }, async () => {
    for (;;) {
      if (signal?.aborted) return
      const next = queue.shift()
      if (!next) return
      const patch = await evaluateCase({ engine, base, languageId, entryPath, code, testCase: next.testCase, timeLimitMs, memoryLimitBytes, checker, signal })
      onCase?.(next.testCase, patch, next.index)
    }
  })

  await Promise.all(workers)
  return queue.length
}
