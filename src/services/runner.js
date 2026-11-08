import { DEFAULT_CHECKER_ID, checkOutput, isCheckerId } from './checkers.js'
import { editorSettings } from './editorSettings.js'
import { t } from '../i18n/index.js'

/**
 * 编排层：把引擎返回的 outcome 翻译成测试卡片需要的状态补丁。
 * 界面只认 patch.status，具体走哪个引擎、协议长什么样都在 engines/ 里面。
 *
 * @typedef {'idle'|'running'|'passed'|'failed'|'error'} CaseStatus
 * @typedef {'AC'|'WA'|'CE'|'TLE'|'MLE'|'RE'|'ERR'} Verdict 卡片徽标上的判定码，只有跑完才有
 * @typedef {{status: CaseStatus, verdict: Verdict|'', actualOutput: string, detail: string, note: string, durationMs: number|null, checker?: string}} CasePatch
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
        // 这次判定用的比对方式（卡片据此算「差在哪」，见 services/outputDiff.js）。
        // 必须随结果落盘：用户在跑完之后改设置，不能把上一轮 WA 的差异改写成另一种口径。
        checker: isCheckerId(checker) ? checker : DEFAULT_CHECKER_ID,
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
 * 对拍：挑一条「实际跑得最快的、跑完了的用例」，让引擎关掉优化重编一遍再跑，
 * 输出不一致就补一行提示。
 *
 * 为什么 WA 也算（2026-10-31 用户口径「输出不一样就值得提醒」）：这条提示说的是
 * 「同一份源码在两种优化级别下行为不同」，也就是**这份代码本身可能含 UB** —— 与
 * 「这一次的答案对不对」是两个问题。WA 的提交里同样可能有 UB，只认 AC 等于把
 * 「答案错了、代码也是坏的」这一整类挡在门外。真正的边界是**有没有跑完**：
 * TLE / MLE / RE 的 stdout 是被掐断的半截，拿它去和 -O0 的完整输出比必然「不同」，
 * 那是最廉价的一种假阳性，所以只认 AC / WA 这两档。
 *
 * 为什么挑最快的那条：UB 是代码结构问题，跟用例规模无关，小数据一样能暴露；而这是
 * 整条链路上唯一真正花钱的一步（一次重编 + 最多两次运行）。最大的那条最贵、收益却一样。
 * 为什么 fire-and-forget：判定与结果通知（App.vue 的 notifyRunOutcome / 纸屑）已经按
 * 原时序走完了，这里再 await 会把「跑完了」这件事往后拖一两秒。
 * 为什么不用 onCase 而是单独的 onNote：**这条结论是事后到达的**（AC 之后 1–2 秒），
 * 而这期间界面很可能已经做过一次用例回写（flushCasesWrite → rebuildTree），
 * `testCase` 这个引用早就不在 `testCases` 里了 —— 补丁落在旧对象上就永远看不见
 * （2026-10-31 实测：结果回来了、卡片没变）。索引在整批重写前后是稳定的，
 * 所以只交回 (note, index)，由界面去当前那一批里找卡片。判定照旧一个字都不动。
 *
 * 引擎没有 crossCheck（远端引擎 / Python）时整段直接跳过。
 *
 * **开关**：设置 › 评测 的「关闭优化重跑比对」（`cp.editorSettings.crossCheck`，默认关，
 * 2026-11-01 用户定）。关着时在函数第一行返回 —— 早于建宿主、早于编译，所以这条偏好
 * 省下的是真金白银（第二颗宿主常驻的 22 MiB 与那一遍 -O0 编译），不只是少一行提示。
 * 读的是单例 ref 而不是入参：`runCases` 的签名已经很长，而且这个值只在运行**结束时**
 * 用一次，当场读当前值比一路透传更贴合「用户刚好在跑完之后把它关掉」这种情况。
 */
function crossCheckBest({ engine, languageId, code, results, memoryLimitBytes, signal, onNote }) {
  if (!editorSettings.value.crossCheck) return
  if (typeof engine?.crossCheck !== 'function') return
  // 只认「跑完且 stdout 是完整的」那两档：AC 与 WA（都是引擎的 outcome ok，见 evaluateCase）。
  // CE 根本没跑、TLE / MLE / RE 的 actualOutput 是半截 —— 都不能当基准。
  const finished = results.filter((item) => item.patch.verdict === 'AC' || item.patch.verdict === 'WA')
  if (!finished.length) return
  // 拿不到耗时的排最后：跑完的卡片一定有数，这里只是不让 undefined 参与比较
  finished.sort((a, b) => (a.patch.durationMs ?? Infinity) - (b.patch.durationMs ?? Infinity))
  const best = finished[0]
  void engine
    .crossCheck({
      languageId,
      code,
      stdin: best.testCase.input ?? '',
      // 基准是**这份代码在 -O2 下这条用例的实际输出**，不是用例的标准答案：
      // 对拍问的是「换一种优化，同一输入会不会打印别的东西」
      baselineStdout: best.patch.actualOutput ?? '',
      memoryLimitBytes,
      signal,
    })
    .then((result) => {
      // 用户中途停止 / 又点了一次运行：signal 已 abort，这条结论已经没有落点
      if (!result?.note || signal?.aborted) return
      onNote?.(result.note, best.index)
    })
    .catch(() => {
      /* 对拍是附加信息，任何异常都不该冒泡到评测流程 */
    })
}

/**
 * 小并发跑完一批用例，逐个回调补丁，界面可以实时看到卡片变色。
 * 回调签名固定为 (testCase, patch, index)。
 *
 * `onNote(note, index)` 是对拍那条事后结论的出口，与 onCase 分开：它可能在整批用例
 * 已经被重写过之后才到，只能靠索引回指（原因见 crossCheckBest）。
 */
export async function runCases({ engine, base, languageId, entryPath, code, cases, timeLimitMs, memoryLimitBytes, checker, signal, concurrency = 2, onCase, onNote }) {
  const queue = cases.map((testCase, index) => ({ testCase, index }))
  // 对拍要「挑最快的 AC」，而 onCase 回调只给得出当前这一张 —— 自己留一份
  const results = []

  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, queue.length)) }, async () => {
    for (;;) {
      if (signal?.aborted) return
      const next = queue.shift()
      if (!next) return
      const patch = await evaluateCase({ engine, base, languageId, entryPath, code, testCase: next.testCase, timeLimitMs, memoryLimitBytes, checker, signal })
      results.push({ testCase: next.testCase, patch, index: next.index })
      onCase?.(next.testCase, patch, next.index)
    }
  })

  await Promise.all(workers)
  // 跑完再看要不要对拍：中途被用户停掉的那次不再烧一次编译
  if (!signal?.aborted) crossCheckBest({ engine, languageId, code, results, memoryLimitBytes, signal, onNote })
  return queue.length
}
