import { echoEngine } from './echo.js'
import { judge0Engine } from './judge0.js'
import { nativeEngine } from './native.js'
import { pistonEngine } from './piston.js'
import { wasmEngine } from './wasm.js'
import { IS_DESKTOP } from '../platform.js'

/**
 * 评测引擎注册表 —— 想接学校 OJ、WASM 本地执行、或者别的判题服务，
 * 只需要新增一个满足下面契约的对象并塞进 ENGINES，界面与运行器都不用改。
 *
 * @typedef {'ok'|'compile-error'|'runtime-error'|'timeout'|'mle'|'rejected'|'unreachable'|'cancelled'} Outcome
 *
 * @typedef {Object} EngineExecution
 * @property {Outcome} outcome
 * @property {string} stdout               程序标准输出（outcome === 'ok' 时才参与判定）
 * @property {string} stderr               运行错误 / 编译错误正文
 * @property {number|null} durationMs
 * @property {string} [detail]             额外诊断，直接展示给用户的一句话
 *
 * @typedef {Object} JudgeEngine
 * @property {string} id                   localStorage 里存的引擎标识
 * @property {string} labelKey             设置面板中的名称（i18n key，**不是算好的字符串**）
 * @property {string} hintKey              设置面板中的一行说明（i18n key）
 * @property {boolean} executesCode        false 时界面要标出"不执行代码"
 * @property {'web'|'desktop'} [platforms]  限定只在哪些平台出现；不写表示两端都可用
 * @property {string} defaultBase          默认服务地址；内置引擎填 'local'
 * @property {(languageId: string) => boolean} [supports]
 * @property {(base: string, signal?: AbortSignal) => Promise<{ok: boolean, message: string}>} health
 * @property {(input: {base: string, languageId: string, entryPath?: string, code: string, stdin: string, signal?: AbortSignal, timeLimitMs?: number, memoryLimitBytes?: number}) => Promise<EngineExecution>} execute
 *
 * timeLimitMs 是界面上的全局时限（毫秒），**只计运行段**，不含编译。
 * 引擎自己决定怎么兑现：本地沙箱用看门狗 kill()，Piston 透传 run_timeout，
 * Judge0 换算成 cpu_time_limit；兑现不了就忽略它，不要假装遵守。
 *
 * memoryLimitBytes 是界面上的全局内存上限（字节），超了判 MLE（outcome 'mle'）。
 * 同样由引擎自己兑现：wasm 沙箱在链接期给产物封顶（--max-memory），Judge0 透传
 * memory_limit（KB）；兑现不了的引擎（piston / native）忽略它，不要假装遵守。
 *
 * entryPath 是入口文件在 VFS 里的绝对路径，给需要「文件名」的引擎用
 * （本地沙箱的 Python 就是拿它当 argv[1]）；远端引擎按 code 直接提交，忽略它即可。
 */
/**
 * 当前跑在哪种外壳里由 services/platform.js 统一判定（那里是唯一出处）。
 */

/** 引擎在当前平台能不能用。没写 platforms 的表示两端都能用。 */
function runsHere(engine) {
  return !engine.platforms || engine.platforms.includes(IS_DESKTOP ? 'desktop' : 'web')
}

// 顺序就是设置面板里的顺序。两个「本地」引擎各自只在自己那端出现：
// 网页版是 WASM 沙箱，桌面端是原生编译器 —— 沙箱在桌面壳里起不来（没有 COOP/COEP、
// 也没有 Cache Storage，见 HANDOFF 第 14 节第 1、3 条），所以标成 web 专用。
export const ENGINES = [wasmEngine, nativeEngine, pistonEngine, judge0Engine, echoEngine]

const BY_ID = new Map(ENGINES.map((engine) => [engine.id, engine]))

/** 当前平台的默认引擎：列表里第一个能在本平台跑的（网页版是 wasm，桌面端是 native） */
const DEFAULT_ENGINE = ENGINES.find(runsHere) ?? ENGINES[0]

export function getEngine(id) {
  const engine = BY_ID.get(id)
  // 存档里的 id 可能来自另一端（比如云端同步带过来的 cp.engine），
  // 当前平台跑不了就退回本端默认引擎，别把用户卡在一个点了就报错的选项上
  return engine && runsHere(engine) ? engine : DEFAULT_ENGINE
}

/**
 * 给设置面板用的引擎列表。只透出 key，**不在这里 t()**：这张表求值一次就定格了，
 * 在这里翻译会在切语言后留下上一轮语言的字符串（见 i18n 的调用纪律）。
 * 只列本平台可用的引擎：另一端的引擎选了也跑不起来，露出来只会误导。
 */
export function engineChoices() {
  return ENGINES.filter(runsHere).map(({ id, labelKey, hintKey, executesCode, defaultBase }) => ({
    id,
    labelKey,
    hintKey,
    executesCode,
    defaultBase,
  }))
}

/** 每个引擎各存一个地址，切引擎时不用重新填。同样只列本平台可用的。 */
export function defaultBases() {
  return Object.fromEntries(ENGINES.filter(runsHere).map((engine) => [engine.id, engine.defaultBase]))
}

// 默认走本端那个不用任何外部服务的引擎：网页版是 WASM 沙箱，桌面端是原生编译器
export const DEFAULT_ENGINE_ID = DEFAULT_ENGINE.id
