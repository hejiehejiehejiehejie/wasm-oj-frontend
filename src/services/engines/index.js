import { echoEngine } from './echo.js'
import { judge0Engine } from './judge0.js'
import { pistonEngine } from './piston.js'
import { wasmEngine } from './wasm.js'

/**
 * 评测引擎注册表 —— 想接学校 OJ、WASM 本地执行、或者别的判题服务，
 * 只需要新增一个满足下面契约的对象并塞进 ENGINES，界面与运行器都不用改。
 *
 * @typedef {'ok'|'compile-error'|'runtime-error'|'timeout'|'rejected'|'unreachable'|'cancelled'} Outcome
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
 * @property {string} defaultBase          默认服务地址；内置引擎填 'local'
 * @property {(languageId: string) => boolean} [supports]
 * @property {(base: string, signal?: AbortSignal) => Promise<{ok: boolean, message: string}>} health
 * @property {(input: {base: string, languageId: string, entryPath?: string, code: string, stdin: string, signal?: AbortSignal, timeLimitMs?: number}) => Promise<EngineExecution>} execute
 *
 * timeLimitMs 是界面上的全局时限（毫秒），**只计运行段**，不含编译。
 * 引擎自己决定怎么兑现：本地沙箱用看门狗 kill()，Piston 透传 run_timeout，
 * Judge0 换算成 cpu_time_limit；兑现不了就忽略它，不要假装遵守。
 *
 * entryPath 是入口文件在 VFS 里的绝对路径，给需要「文件名」的引擎用
 * （本地沙箱的 Python 就是拿它当 argv[1]）；远端引擎按 code 直接提交，忽略它即可。
 */
// 顺序就是设置面板里的顺序：本地沙箱不需要任何服务，放第一个
export const ENGINES = [wasmEngine, pistonEngine, judge0Engine, echoEngine]

const BY_ID = new Map(ENGINES.map((engine) => [engine.id, engine]))

export function getEngine(id) {
  return BY_ID.get(id) ?? ENGINES[0]
}

/**
 * 给设置面板用的引擎列表。只透出 key，**不在这里 t()**：这张表求值一次就定格了，
 * 在这里翻译会在切语言后留下上一轮语言的字符串（见 i18n 的调用纪律）。
 */
export function engineChoices() {
  return ENGINES.map(({ id, labelKey, hintKey, executesCode, defaultBase }) => ({
    id,
    labelKey,
    hintKey,
    executesCode,
    defaultBase,
  }))
}

/** 每个引擎各存一个地址，切引擎时不用重新填。 */
export function defaultBases() {
  return Object.fromEntries(ENGINES.map((engine) => [engine.id, engine.defaultBase]))
}

// 默认走本地沙箱：它不需要任何外部服务，新访客打开就能直接跑；Piston / Judge0 要用户自己填服务地址
export const DEFAULT_ENGINE_ID = wasmEngine.id
