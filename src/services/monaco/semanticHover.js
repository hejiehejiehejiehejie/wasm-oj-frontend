/**
 * 语义级悬停（实验，设置 › 编辑器 › 「语义分析」开关）。
 *
 * 【为什么能算「语义级」】不是自己写类型推导，而是借用站内那颗 clang 的**代码补全**前端：
 * 把光标位置交给 `-code-completion-at=`，clang 会按真实语义列出该处可见的符号，
 * 每条形如 `COMPLETION: push_back : [#void#]push_back(<#const value_type &__x#>)`。
 * 于是容器成员（`v.push_back`）、结构体字段、重载这些都拿得到 —— 静态签名表和
 * tree-sitter 都给不出这些结论。
 *
 * 【代价，写进设置页的 hint，也是本模块存在的边界】
 * - 每次悬停要跑一遍 clang 前端：带 PCH 时约 0.2–1s（弱机更久），与语法检查共用同一颗宿主，
 *   宿主忙（正在运行 / 生成 PCH）时直接放弃，退回基础提示；
 * - 首次开启会 `preloadToolchain()`：下载约 30MB 工具链并常驻约 23MiB 内存。
 *   下载由设置页那个开关触发（见 hover.js 的 watch），**本模块自己不偷偷下**；
 * - 结果只到「签名 / 类型」为止，拿不到声明位置与注释 —— 补全协议里没有这两样。
 *
 * 【失败一定是软失败】运行时没加载、宿主忙、这次查询被取消、clang 报了错：
 * 一律返回 null，让上层继续走静态表 / tree-sitter。语义分析不该让悬停变空。
 */

import {
  SYNTAX_STATUS,
  TOOLCHAIN_ASSET_BYTES,
  checkCppCompletion,
  isToolchainReady,
  onToolchainProgress,
  preloadToolchain,
} from '../runnoSandbox.js'
import { noteHostActivity, probeFrontendToolchain, warmupPch } from '../wasmRuntime.js'

/** 一条补全行的形状：`COMPLETION: 名字 : [#类型#]正文` */
const COMPLETION_LINE = /^COMPLETION: (.+?) : (.+)$/u
/** 正文开头的返回类型块 */
const RESULT_TYPE = /^\[#(.*?)#\]/u

const CACHE_LIMIT = 200
/** key → 签名文本（null 表示「这个位置查过了，没有结论」） */
const CACHE = new Map()

/** 同一时刻只放一枪：悬停会跟着鼠标连发，排队只会把宿主的语法检查挤得更久 */
let querying = false

// ------------------------------------------------------------------ state bridge
// Only enums and numbers cross the module boundary; the Vue component owns the
// wording (see i18n/messages/semanticHover.js legend). Keeping the bridge here
// (instead of a separate module) is what lets semanticHover stay one lazy chunk.

const SAMPLE_SIZE = 64
/** A cold toolchain is a 26MB download: never block a hover longer than this. */
const WAKE_TIMEOUT_MS = 2500
/** Do not flash the loading row for cache hits or sub-150ms queries. */
const LOADING_DELAY_MS = 150

export const semanticState = { phase: 'idle', percent: 0 }
const stateListeners = new Set()

/**
 * @param {(state: { phase: string, percent: number }) => void} listener
 * @returns {() => void} unsubscribe
 */
export function onSemanticStateChange(listener) {
  stateListeners.add(listener)
  listener(semanticState)
  return () => stateListeners.delete(listener)
}

function setPhase(phase, percent) {
  semanticState.phase = phase
  if (percent !== undefined) semanticState.percent = percent
  for (const listener of stateListeners) {
    try {
      listener(semanticState)
    } catch {
      /* one broken subscriber must not stop the rest */
    }
  }
}

// -------------------------------------------------------------------- telemetry
const metrics = {
  total: 0,
  cacheHit: 0,
  clangHit: 0,
  emptyOrBusy: 0,
  timeoutOrError: 0,
  cancelled: 0,
}
const samples = new Float64Array(SAMPLE_SIZE)
let sampleCount = 0
let sampleCursor = 0

function recordDuration(ms) {
  samples[sampleCursor] = ms
  sampleCursor = (sampleCursor + 1) % SAMPLE_SIZE
  if (sampleCount < SAMPLE_SIZE) sampleCount += 1
}

/**
 * Session metrics for FR10. `hitRate` counts positions answered without a
 * compiler round-trip (LRU hits or real clang answers) over all attempts.
 * p50 / p95 are computed from the last 64 clang durations only.
 */
export function getSemanticHoverMetrics() {
  const resolved = metrics.cacheHit + metrics.clangHit
  const hitRate = metrics.total ? Math.round((resolved / metrics.total) * 100) : 0
  if (sampleCount === 0) return { ...metrics, hitRate, p50: 0, p95: 0 }
  // TypedArray.sort sorts numerically, unlike Array.sort.
  const sorted = samples.subarray(0, sampleCount).sort()
  const pick = (q) => Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))])
  return { ...metrics, hitRate, p50: pick(0.5), p95: pick(0.95) }
}

// -------------------------------------------------------------------- prepare

/** In-flight prepare only. Never cached after success: a hibernated host must be rebuilt. */
let preparing = null

/**
 * Bring the semantic runtime up. Resolves to `true` when a query can run.
 * Never rejects: a failed load becomes phase `error` so the UI can offer retry.
 * @returns {Promise<boolean>}
 */
export function prepareSemanticHover() {
  if (isToolchainReady()) {
    warmupPch()
    noteHostActivity()
    if (semanticState.phase !== 'ready') setPhase('ready', 100)
    return Promise.resolve(true)
  }
  if (!preparing) preparing = startPrepare().finally(() => { preparing = null })
  return preparing
}

async function startPrepare() {
  let cached = false
  try {
    cached = await probeFrontendToolchain()
  } catch {
    cached = false
  }
  // Waking = cached locally (hibernated host). Downloading = needs network.
  setPhase(cached ? 'waking' : 'downloading', cached ? 100 : 0)

  const loaded = { clang: 0, sysroot: 0 }
  const total = TOOLCHAIN_ASSET_BYTES.clang + TOOLCHAIN_ASSET_BYTES.sysroot
  let unsubscribe = null
  if (!cached) {
    unsubscribe = onToolchainProgress(({ key, loaded: bytes }) => {
      if (loaded[key] === undefined) return
      loaded[key] = Math.max(loaded[key], bytes)
      const percent = Math.min(99, Math.round(((loaded.clang + loaded.sysroot) / total) * 100))
      setPhase('downloading', percent)
    })
  }
  try {
    await preloadToolchain()
  } catch {
    setPhase('error', 0)
    return false
  } finally {
    unsubscribe?.()
  }

  setPhase('warming', 100)
  const warming = warmupPch()
  noteHostActivity()
  if (warming) {
    void warming.finally(() => {
      if (semanticState.phase === 'warming') setPhase('ready', 100)
    })
  } else {
    setPhase('ready', 100)
  }
  return true
}

/** Retry after a failed load (offline, quota, transient network). */
export function retrySemanticHover() {
  setPhase('idle', 0)
  return prepareSemanticHover()
}

/**
 * 取光标处标识符的语义签名。
 *
 * @param {import('monaco-editor').editor.ITextModel} model
 * @param {{ lineNumber: number, column: number }} position
 * @returns {Promise<string | null>} 多行签名（重载最多三条）；没有结论 → null
 */
export async function findSemanticHover(model, position) {
  const word = model.getWordAtPosition(position)
  if (!word) return null
  metrics.total += 1

  const key = `${model.uri.toString()}|${model.getVersionId()}|${position.lineNumber}|${word.startColumn}`
  if (CACHE.has(key)) {
    metrics.cacheHit += 1
    return CACHE.get(key)
  }
  if (querying) {
    metrics.emptyOrBusy += 1
    return null
  }

  // FR11: a hibernated host is rebuilt within the same hover. Cold downloads
  // keep running in the background but must not stall the cursor.
  // After a hard failure only an explicit retry (or toggling the setting)
  // starts a new download; otherwise every hover would retry a dead network.
  if (!isToolchainReady()) {
    if (semanticState.phase === 'error') {
      metrics.timeoutOrError += 1
      return null
    }
    const ready = await Promise.race([
      prepareSemanticHover(),
      new Promise((resolve) => setTimeout(() => resolve(false), WAKE_TIMEOUT_MS)),
    ])
    if (!ready) {
      metrics.timeoutOrError += 1
      return null
    }
  }

  querying = true
  const loadingTimer = setTimeout(() => {
    if (semanticState.phase === 'ready') setPhase('querying')
  }, LOADING_DELAY_MS)
  const startedAt = performance.now()
  try {
    const lineText = model.getLineContent(position.lineNumber)
    const charColumn = word.endColumn - 1
    // clang 的列是 UTF-8 字节列；Monaco 给的是 UTF-16 码元列，行内有中文时必须换算
    const byteColumn = new TextEncoder().encode(lineText.slice(0, charColumn)).length + 1
    const result = await checkCppCompletion(model.getValue(), position.lineNumber, byteColumn)
    if (result.status === SYNTAX_STATUS.SUCCESS) {
      const signature = parseSignature(
        result.stdout ?? '',
        word.word,
        callArity(model, position.lineNumber, word.endColumn),
      )
      remember(key, signature)
      if (signature) {
        recordDuration(performance.now() - startedAt)
        metrics.clangHit += 1
      } else {
        metrics.emptyOrBusy += 1
      }
      return signature
    }
    if (result.status === SYNTAX_STATUS.BUSY) metrics.emptyOrBusy += 1
    else if (result.status === SYNTAX_STATUS.ABORTED) metrics.cancelled += 1
    else metrics.timeoutOrError += 1
    return null
  } catch {
    metrics.timeoutOrError += 1
    return null
  } finally {
    clearTimeout(loadingTimer)
    querying = false
    // 查询跑完宿主就空了：重新上弦，停手 5 分钟后由 hibernate 真正 terminate。
    // 命中缓存的那条路径不会走到这里 —— 没碰宿主就不该延长它的寿命。
    noteHostActivity()
    if (semanticState.phase === 'querying') setPhase('ready', 100)
  }
}

// Expose the metrics getter for FR10 acceptance (`cpSemanticMetrics()` in devtools).
if (typeof window !== 'undefined') window.cpSemanticMetrics = getSemanticHoverMetrics


/** @param {string} key @param {string | null} value */
function remember(key, value) {
  if (CACHE.size >= CACHE_LIMIT) CACHE.delete(CACHE.keys().next().value)
  CACHE.set(key, value)
}

/**
 * 从补全输出里挑出与光标词同名的条目，整理成可读签名。
 * @param {string} stdout
 * @param {string} name
 * @param {number | null} arity 这次调用的实参个数；null 表示不在调用处
 * @returns {string | null}
 */
function parseSignature(stdout, name, arity = null) {
  const lines = []
  for (const raw of stdout.split('\n')) {
    const match = COMPLETION_LINE.exec(raw)
    if (!match || match[1].trim() !== name) continue
    if (arity !== null && !acceptsArity(match[2], arity)) continue
    const signature = formatItem(match[2], name)
    if (signature !== null && !lines.includes(signature)) lines.push(signature)
    // 重载超过三条就不再列：悬停框不是文档页
    if (lines.length === 3) break
  }
  return lines.length ? lines.join('\n') : null
}

/**
 * 这次调用传了几个实参：`query(r)` → 1，`query(l, r)` → 2，不是调用 → null。
 *
 * 语义补全只按位置列出「这里能看见的符号」，不管这次调用实际给了几个参数，
 * 于是 `query(r)` 会把 `query(int p)` 和 `query(int l, int r)` 一起报上来。
 * 悬停要的是「这次调用能选中的那条」，所以按实参个数把接不上的重载筛掉。
 * @param {import('monaco-editor').editor.ITextModel} model
 * @param {number} lineNumber
 * @param {number} column 名字结束后的列（1-based）
 * @returns {number | null}
 */
function callArity(model, lineNumber, column) {
  const rest = model.getValue().slice(model.getOffsetAt({ lineNumber, column }))
  // 名字后面（允许空白，含换行）必须紧跟 `(` 才算调用
  if (!/^\s*\(/u.test(rest)) return null
  return parameterCount(rest.slice(rest.indexOf('(')))
}

/**
 * 参数列表里有多少个参数 —— 只看最外层 `( … )`，跳过嵌套括号、字符串，以及
 * `<#…#>` 占位标记里的逗号（模板实参 `std::pair<int, int>` 不能算成两个参数）。
 * @param {string} text 从参数列表的左括号开始（前面可以带返回类型块 / 函数名）
 * @returns {number | null} 括号不完整 → null
 */
function parameterCount(text) {
  const body = text.replace(RESULT_TYPE, '')
  const start = body.indexOf('(')
  if (start < 0) return null
  let depth = 0
  let marker = 0
  let commas = 0
  let empty = true
  for (let i = start + 1; i < body.length; i += 1) {
    if (body.startsWith('<#', i)) {
      marker += 1
      i += 1
      empty = false
      continue
    }
    if (body.startsWith('#>', i)) {
      marker = Math.max(0, marker - 1)
      i += 1
      continue
    }
    const ch = body[i]
    if (ch === '"' || ch === "'") {
      i = skipLiteral(body, i)
      empty = false
      continue
    }
    if (ch === '(' || ch === '[' || ch === '{') {
      depth += 1
      empty = false
      continue
    }
    if (ch === ')' || ch === ']' || ch === '}') {
      if (depth > 0) {
        depth -= 1
        continue
      }
      if (ch !== ')') return null
      return empty ? 0 : commas + 1
    }
    if (depth === 0 && marker === 0) {
      if (ch === ',') {
        commas += 1
        empty = false
      } else if (!/\s/u.test(ch)) {
        empty = false
      }
    }
  }
  return null
}

/** 跳过 `"…"` / `'…'` 字面量（含转义），返回收尾引号的下标 */
function skipLiteral(text, index) {
  const quote = text[index]
  let i = index + 1
  while (i < text.length) {
    if (text[i] === '\\') {
      i += 2
      continue
    }
    if (text[i] === quote) return i
    i += 1
  }
  return text.length
}

/**
 * 这条补全项能不能接受这次调用的实参个数。参数列表里有 `...` 视为可变参数，放行；
 * 数不出来（格式意外）也放行 —— 宁可多列一条，也不要漏掉真正选中的那条。
 * @param {string} body
 * @param {number} arity
 */
function acceptsArity(body, arity) {
  if (body.includes('...')) return true
  const count = parameterCount(body)
  return count === null || count === arity
}

/**
 * `[#int#]solve(<#int n#>)` → `int solve(int n);`
 * `[#int#]x` → `int x;`
 *
 * 类型名（`using ll = long long;` 里的 `ll`、类名）在补全输出里**没有** `[#类型#]` 块，
 * 只剩一个裸名字；照常拼会得到 `ll;` 这种既不是签名也没信息量的东西。这类条目丢弃 ——
 * 类型定义由 cppHover 的别名索引给出（源码里那行原样显示）。
 * @param {string} body
 * @param {string} name 光标处的标识符
 * @returns {string | null}
 */
function formatItem(body, name) {
  const typeMatch = RESULT_TYPE.exec(body)
  const resultType = typeMatch ? clean(typeMatch[1]) : ''
  const text = clean(typeMatch ? body.slice(typeMatch[0].length) : body)
  if (text === '') return null
  if (resultType === '' && text === name) return null
  // 构造 / 析构这类条目：正文本身就带类型名，再补返回值就成了 `Foo Foo()`
  const alreadyTyped =
    resultType === '' || text.startsWith(`${resultType}(`) || text.startsWith(`${resultType} `)
  return alreadyTyped ? `${text};` : `${resultType} ${text};`
}

/** 补全文本里的 `[#…]` / `<#…#>` 是占位与高亮标记，不是签名的一部分 */
function clean(text) {
  return text
    .replace(/<#/gu, '')
    .replace(/#>/gu, '')
    .replace(/\[#/gu, '')
    .replace(/#\]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
}
