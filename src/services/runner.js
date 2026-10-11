import { compareOutput } from './compare.js'
import { t } from '../i18n/index.js'

/**
 * 编排层：把引擎返回的 outcome 翻译成测试卡片需要的状态补丁。
 * 界面只认 patch.status，具体走哪个引擎、协议长什么样都在 engines/ 里面。
 *
 * @typedef {'idle'|'running'|'passed'|'failed'|'error'} CaseStatus
 * @typedef {'AC'|'WA'|'CE'|'TLE'|'MLE'|'RE'|'ERR'} Verdict 卡片徽标上的判定码，只有跑完才有
 * @typedef {{status: CaseStatus, verdict: Verdict|'', actualOutput: string, detail: string, durationMs: number|null}} CasePatch
 */

const LANGUAGE_UNSUPPORTED = (engine) =>
  t('tests.outcome.unsupportedLanguage', { engine: t(engine.labelKey) })

// 全局时限（毫秒），只计程序运行段，不含编译。
// 本地沙箱靠它 kill 掉跑不完的程序（TLE），远端引擎各自换算成自己的参数。
export const TIME_LIMIT_DEFAULT_MS = 1000
export const TIME_LIMIT_OPTIONS = [1000, 2000, 5000, 10000]

// 全局内存上限（字节），与运行时限同口径：所有用例统一，超了判 MLE。
// 只对「引擎能兑现」的场合生效：wasm 沙箱在链接期把线性内存封顶（--max-memory），
// Judge0 透传 memory_limit（KB）；兑现不了的引擎（piston / native）忽略它。
export const MEMORY_LIMIT_DEFAULT_BYTES = 256 * 1024 * 1024
export const MEMORY_LIMIT_OPTIONS = [64, 128, 256, 512, 1024].map((mb) => mb * 1024 * 1024)

function failed(detail, durationMs = null, extra = {}) {
  return { status: 'error', verdict: 'ERR', actualOutput: '', detail, durationMs, ...extra }
}

/**
 * @returns {Promise<CasePatch>}
 */
export async function evaluateCase({ engine, base, languageId, entryPath, code, testCase, timeLimitMs, memoryLimitBytes, signal }) {
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
      return { status: 'idle', verdict: '', actualOutput: '', detail: '', durationMs: null }

    case 'ok': {
      const match = compareOutput(result.stdout, testCase.expectedOutput)
      return {
        status: match ? 'passed' : 'failed',
        verdict: match ? 'AC' : 'WA',
        actualOutput: result.stdout,
        detail: '',
        durationMs,
      }
    }

    case 'compile-error':
      return {
        status: 'error',
        verdict: 'CE',
        actualOutput: result.stdout ?? '',
        detail: result.stderr || t('tests.outcome.compileFailed'),
        durationMs,
      }

    case 'timeout':
      return {
        status: 'error',
        verdict: 'TLE',
        actualOutput: result.stdout ?? '',
        detail: t('tests.outcome.timeout'),
        durationMs,
      }

    case 'mle':
      return {
        status: 'error',
        verdict: 'MLE',
        actualOutput: result.stdout ?? '',
        detail: t('tests.outcome.memoryExceeded'),
        durationMs,
      }

    case 'runtime-error':
      return {
        status: 'error',
        verdict: 'RE',
        actualOutput: result.stdout ?? '',
        detail: result.stderr || t('tests.outcome.runtimeError'),
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
export async function runCases({ engine, base, languageId, entryPath, code, cases, timeLimitMs, memoryLimitBytes, signal, concurrency = 2, onCase }) {
  const queue = cases.map((testCase, index) => ({ testCase, index }))

  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, queue.length)) }, async () => {
    for (;;) {
      if (signal?.aborted) return
      const next = queue.shift()
      if (!next) return
      const patch = await evaluateCase({ engine, base, languageId, entryPath, code, testCase: next.testCase, timeLimitMs, memoryLimitBytes, signal })
      onCase?.(next.testCase, patch, next.index)
    }
  })

  await Promise.all(workers)
  return queue.length
}
