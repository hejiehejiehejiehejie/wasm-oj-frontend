/**
 * 编辑器内的 C++ / Python 语法诊断 —— 用站内工具链把错误变成红波浪线。
 *
 * 两条语言各跑各的一次性检查，但共用同一套调度纪律：
 * - **C++**：站内那份 clang 8 跑 `-fsyntax-only`（见 runnoSandbox.checkCppSyntax）。
 * - **Python**：站内那份 python.wasm 跑 `-c` 脚本对源码 `compile()`（见
 *   runnoSandbox.checkPythonSyntax）—— 只解析、绝不执行，`while True:` 不会烧进来；
 *   stderr 被脚本译成 clang 同款格式，下面的解析器一份两用。
 *
 * 为什么是「跑一次就退出的检查」，而不是常驻的语言服务器：
 * 沙箱的执行模型是 `WASI.start()` 一次性调用（实例化 → 跑 `_start` → 拿结果，stdin 拉空即 EOF），
 * 装不下 clangd 那种「读一行 JSON-RPC、算完再等下一行」的长驻进程（那需要另一套
 * emscripten + pthreads 运行时，且 wasm 内存声明就是 2GiB 共享内存）。所以这里走一次性路线：
 * 停手 300ms 就起一个实例、到各自的前端就停、退出。等待时长**不是固定值**，按重建次数退避到
 * 1200ms（照 clangd 的 `DebouncePolicy{50, 500, 1}` 那套：下限 × 连续重建次数，上限封顶；
 * 我们单次成本 100–300ms 级、比 clangd 的增量重建贵一个量级，所以两个数都往上抬）。
 * 「设置 › 编辑器 › 性能 › 低配模式」另给一对 1200–3600ms 的档，供老机器少烧一点 CPU。
 *
 * 四条纪律：
 * 1. **不主动下载**。运行时不在内存里时先探本机缓存（`ensureRuntimeLoaded`，全程不触网）：
 *    缓存齐了就静默读进内存（几十到几百毫秒），于是**装过一次之后，打开文件就有红线**，
 *    不必先跑一遍；缓存里没有就静默跳过（checkCppSyntax / checkPythonSyntax 返回 null）——
 *    绝不能在「打开一个 .cpp / .py」时偷下几十 MB。
 * 2. **只有最新一枪的结果能落地**。续写会 kill 掉还在跑的实例，序号对不上的一律丢弃 ——
 *    否则慢的那一枪回来会把新代码的标记覆盖成旧代码的。
 * 3. **判据与真编译共用一份来源**：C++ 的检查参数与真编译共用 FRONTEND_ARGS；
 *    Python 的检查只比真运行少一个「执行」——诊断说没问题、运行时却跑不过，
 *    比没有诊断更糟。
 * 4. **按内容指纹缓存**：切回文件 / 撤销回去直接重放，不重跑。
 * 5. **区间宽度自己算**：clang 的文本诊断只给「起始行列」，没有结构化 range
 *    （那是 clangd 的 JSON 才有）。若只画 `列..列+1`，`solve()` 就只有那个 `s` 被划上；
 *    这里按源码在该列的词法边界把整个标识符 / 数字 / 字面量标出来，与 VSCode 的观感一致。
 *    刻意**不用** `monaco.editor.tokenize`：cpp 的 monarch 定义是懒加载的
 *    （`loader: () => import('./cpp.js')`），没加载时它会把整行当成一个空 token，
 *    反而标满一整行。
 */
import { monaco } from '../../monaco-setup.js'
import { editorSettings } from '../editorSettings.js'
import { ensureRuntimeLoaded } from '../wasmRuntime.js'
import {
  checkCppSyntax,
  checkPythonSyntax,
  isPythonRuntimeReady,
  isToolchainReady,
  onRuntimeReady,
} from '../runnoSandbox.js'

/** 标记的 owner。同名 owner 每次 setModelMarkers 会整批替换，正是想要的语义 */
const OWNER = 'clang-syntax'
/**
 * 防抖的四个数（毫秒）：下限、上限，各给正常 / 低配两套。
 *
 * 这套算法抄的是 clangd `TUScheduler` 的 `DebouncePolicy{50, 500, 1}`：等待时长 =
 * **下限 ×（连续重建次数 + 1）**，到上限封顶（比例 1 就是线性增长，10 次重建后触顶）。
 * 它解决的是「固定值怎么取都别扭」——取短了连续输入时反复起实例，取长了停手后半天没反应。
 * 自适应之后：你偶尔改一处，300ms 就有红线；你正在大改，它自己退到 1200ms 少起几枪，
 * 停手超过 1.8s 再动手，又回到 300ms（低配那档 1200–3600ms，清零阈值按上限算）。
 *
 * 为什么两个数都比 clangd 大一个量级：它每次只重解析 body（5–20ms），我们每次是
 * 冷启动 + 反序列化 8.6MB PCH（实测 180ms 级）。下限再往下压，收益全被「起了就被下一枪 kill」
 * 抵消。
 */
const DEBOUNCE_MIN_MS = 300
const DEBOUNCE_MAX_MS = 1200
const LOW_POWER_MIN_MS = 1200
const LOW_POWER_MAX_MS = 3600
/**
 * 停手多久算「这一段写完了」：把重建次数清零，下一次回到最快那一档。
 *
 * **必须比该档的上限大**，否则「等得够久让计时器跑完」与「停手清零」是同一个条件，
 * 退避永远攒不到上限（低配模式下曾出现：上限 3600、清零阈值 2000，实际最高只到 2400）。
 * 取上限的 1.5 倍，留出「最后一枪跑完」的余量。
 */
const QUIET_RESET_RATIO = 1.5

/** 连续重建次数：每真正起一次检查 +1，停手够久清零 */
let rebuildCount = 0
/** 上一次安排检查（≈ 每一次击键）的时刻，用来判「是不是又一段连续编辑」 */
let lastEditAt = 0
/** 上一份被安排的 model，切文件时重建次数归零 */
let lastModelKey = ''

/**
 * 下一次该等多久 —— 现算，改设置立即对下一次生效。
 * @param {string} key model 的 uri
 */
function nextDelay(key) {
  const now = Date.now()
  const lowPower = editorSettings.value.lowPower
  const min = lowPower ? LOW_POWER_MIN_MS : DEBOUNCE_MIN_MS
  const max = lowPower ? LOW_POWER_MAX_MS : DEBOUNCE_MAX_MS
  if (key !== lastModelKey) {
    rebuildCount = 0
    lastModelKey = key
  } else if (now - lastEditAt > max * QUIET_RESET_RATIO) {
    // 停手够久：这一轮编辑结束了，回到最快那一档
    rebuildCount = 0
  }
  lastEditAt = now
  return Math.min(min * (rebuildCount + 1), max)
}
/** 一次最多落多少条标记（clang 那边 -ferror-limit 4，实际远小于这个数） */
const MARKER_LIMIT = 50
/** 诊断原文最长保留多少字符，防止模板爆炸时把整条 message 撑爆 */
const MESSAGE_LIMIT = 1500

/** 每次检查的序号：只有等于最新序号的结果才允许写标记 */
let latestSeq = 0
/** 防抖定时器 */
let timer = 0
/** 正在跑的实例（用来在下一枪开始时 kill 掉） */
let runningHost = null
/** 每个 model 上一次检查过的「内容指纹」→ 标记，切回文件 / 撤销回去时直接重放，不重跑 */
const checked = new Map()

/**
 * 这个 model 能不能查、用哪个运行时。`.c` 与 C++ 同一条（判据与判题一致：
 * runnoSandbox 的编译固定 `-x c++`）。
 * @param {import('monaco-editor').editor.ITextModel | null} model
 * @returns {'cpp' | 'python' | null} null = 不查
 */
function checkableLanguage(model) {
  if (!model || model.isDisposed()) return null
  const id = model.getLanguageId()
  if (id === 'cpp' || id === 'c') return 'cpp'
  if (id === 'python') return 'python'
  return null
}

/** 该语言的运行时是否已在内存里（诊断绝不主动下载，见文件头纪律 1） */
function runtimeReady(language) {
  return language === 'python' ? isPythonRuntimeReady() : isToolchainReady()
}

/** 该语言的一次性检查。返回 null = 这次没有结论（运行时没就绪或 WASI 崩了） */
function runSyntaxCheck(language, text, { onHost }) {
  return language === 'python'
    ? checkPythonSyntax(text, { onHost })
    : checkCppSyntax(text, { onHost })
}

/**
 * 「本机已经下过这个运行时、只是还没进内存」时，把它读进来 —— **不产生任何下载**。
 *
 * 判据在 `ensureRuntimeLoaded` 里：先用 probeRuntime 探缓存（SW 用 caches.match，
 * dev 用 only-if-cached，都不触网），缓存齐了才 preload。缓存里没有就直接放弃，
 * 等用户自己点运行 —— 绝不能因为「打开了一个 .cpp」就去下 50MB。
 *
 * 每语言每会话只试一次：读了缓存之后仍失败（配额 / 缓存被清）就不要再反复探了，
 * 下一次机会是用户真跑一次代码（`onRuntimeReady` 会接住）。
 */
const bootstrapAttempts = new Set()

function ensureRuntimeReadyInBackground(language) {
  if (runtimeReady(language) || bootstrapAttempts.has(language)) return
  bootstrapAttempts.add(language)
  // 成功之后不用在这里补枪：loadToolchain / loadPythonRuntime 会发 onRuntimeReady，
  // 下面那个模块级订阅统一处理（避免和它重复排两次检查）
  ensureRuntimeLoaded(language).catch(() => {})
}

/** 词法边界：标识符允许 Unicode 字母（Python 的中文变量名、C++ 的 UCN） */
const WORD_START = /[\p{L}_$]/u
const WORD_PART = /[\p{L}\p{N}_$]/u
/** 数字里可能出现的字符（`0x1F`、`1e-9`、`1'000`、`1.5f`） */
const NUMBER_PART = /[0-9A-Za-z._']/

/**
 * 该列所在的整个词占哪几列（1-based，右开区间）。
 *
 * clang 只告诉我们 `行:列`，没有长度；而「红线只盖一个字母」比「盖住整个标识符」
 * 差得多 —— VSCode 里点开也是整个 token。这里按最小词法常识找边界：
 * 标识符 / 数字 / 字符串字面量各自吃到自己的结尾，运算符、括号、分号保持单列。
 *
 * 列越界（clang 偶尔指到行尾之后）或落在空白上时保持单列宽度。
 */
function tokenRangeAt(line, column) {
  const single = [column, column + 1]
  if (!line) return single
  const offset = column - 1
  if (offset < 0 || offset >= line.length) return single
  const first = line[offset]

  // 字符串 / 字符字面量：吃到同一行里配对的引号（跳过 `\` 转义）
  if (first === '"' || first === "'") {
    let i = offset + 1
    while (i < line.length) {
      if (line[i] === '\\') {
        i += 2
        continue
      }
      if (line[i] === first) {
        i += 1
        break
      }
      i += 1
    }
    return [column, Math.min(i, line.length) + 1]
  }

  // 标识符 / 关键字：`solve` 整段；中文标识符同样成立
  if (WORD_START.test(first)) {
    let end = offset + 1
    while (end < line.length && WORD_PART.test(line[end])) end += 1
    return [column, end + 1]
  }

  // 数字：`1e-9` 里的 `-` 不并进来（`1e` / `-` / `9` 三段），够用了
  if (first >= '0' && first <= '9') {
    let end = offset + 1
    while (end < line.length && NUMBER_PART.test(line[end])) end += 1
    return [column, end + 1]
  }

  return single
}

/**
 * clang 的列号是**字节**偏移，而 Monaco 的列是 UTF-16 码元 —— 行内只要有中文，
 * 同一个 token 就会整体右移：行首四空格 + 一段含四个汉字的注释 + `int a = ;`，
 * 分号实际在第 24 列，clang 报 32（四个汉字各多 2 字节 = 偏 8），红线于是落到行外。
 *
 * Python 那条**不能**换算：CPython 的 `SyntaxError.offset` 本来就是字符列
 * （实测同一行中文，`:` 报 10 而不是 14）。
 * @param {string} line 该行源码
 * @param {number} column clang 给的 1-based 字节列
 */
function byteColumnToChar(line, column) {
  const target = column - 1
  if (!line || target <= 0) return column
  let bytes = 0
  let index = 0
  while (index < line.length && bytes < target) {
    const code = line.codePointAt(index)
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4
    index += code > 0xffff ? 2 : 1
  }
  return index + 1
}

/**
 * 解析 clang 的诊断原文。
 *
 * 只认 `路径:行:列: 级别: 消息` 这一种行（clang 8 的固定格式）；note 一律丢掉 ——
 * 它们是错误的补充说明，铺成标记只会把正文挤满。后面那几行缩进的源码回显也对不上正则，
 * 自然被跳过。
 * @param {string} stderr
 * @param {{ text?: string, language?: 'cpp' | 'python' }} [source]
 *   text 用来算列单位与区间宽度；language 只影响列单位（clang 是字节列、Python 是字符列）
 */
function parseDiagnostics(stderr, { text = '', language = 'cpp' } = {}) {
  const lines = String(text).split('\n')
  const byteColumns = language !== 'python'
  const markers = []
  for (const line of String(stderr ?? '').split('\n')) {
    if (markers.length >= MARKER_LIMIT) break
    const match = /^(.+?):(\d+):(\d+): (fatal error|error|warning|note): (.*)$/.exec(line)
    if (!match) continue
    const [, , lineText, columnText, level, message] = match
    if (level === 'note') continue
    const lineNumber = Number(lineText)
    const rawColumn = Number(columnText)
    if (!Number.isFinite(lineNumber) || !Number.isFinite(rawColumn)) continue
    const source = lines[lineNumber - 1]
    const column = byteColumns ? byteColumnToChar(source, rawColumn) : rawColumn
    const [startColumn, endColumn] = tokenRangeAt(source, column)
    markers.push({
      severity:
        level === 'warning' ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Error,
      message: message.slice(0, MESSAGE_LIMIT),
      startLineNumber: lineNumber,
      startColumn,
      endLineNumber: lineNumber,
      endColumn,
      source: 'clang',
    })
  }
  return markers
}

/** 把标记落地；model 已经销毁就什么都不做 */
function applyMarkers(model, markers) {
  if (!model || model.isDisposed()) return
  monaco.editor.setModelMarkers(model, OWNER, markers)
}

/**
 * 跑一次检查。
 * @param {import('monaco-editor').editor.ITextModel} model
 * @param {'cpp' | 'python'} language
 * @param {string} text 触发这次检查时的正文（用来判断期间有没有又改过）
 */
async function runCheck(model, language, text) {
  const seq = ++latestSeq
  // 运行时没就绪：跳过，但**不清**已有标记（清掉等于告诉用户「代码突然对了」）
  if (!runtimeReady(language)) return
  if (seq !== latestSeq || model.isDisposed()) return

  let result = null
  try {
    result = await runSyntaxCheck(language, text, {
      onHost: (host) => {
        // 下一枪开始时 runningHost 已经换成新实例，这里只在「自己还是当前那一枪」时登记
        if (seq === latestSeq) runningHost = host
      },
    })
  } catch {
    // WASI 崩溃（OOM / 被杀）时保留上一次的结论，不制造假的红线
    return
  } finally {
    if (seq === latestSeq) runningHost = null
  }
  if (!result) return
  if (seq !== latestSeq || model.isDisposed()) return
  // 期间内容又变了：这一枪的结论已经过期，等下一枪
  if (model.getValue() !== text) return

  const markers = parseDiagnostics(result.stderr, { text, language })
  checked.set(model.uri.toString(), { text, markers })
  applyMarkers(model, markers)
}

/**
 * 安排一次检查（自适应防抖，见上面 `nextDelay`）。
 *
 * @param {import('monaco-editor').editor.ITextModel | null} model
 * @param {{ immediate?: boolean }} [options] immediate：切文件时用，不等防抖
 */
export function scheduleSyntaxCheck(model, { immediate = false } = {}) {
  const language = checkableLanguage(model)
  if (!language) return
  // 运行时不在内存里：若本机缓存过就静默读进来（不下载），否则就此打住
  ensureRuntimeReadyInBackground(language)
  const text = model.getValue()
  const key = model.uri.toString()

  // 同一份内容已经查过：直接重放，不重跑（切回文件、撤销回去都走这条）
  const previous = checked.get(key)
  if (previous && previous.text === text) {
    applyMarkers(model, previous.markers)
    return
  }

  // 空文件没什么可查的，顺手把旧标记清掉（新建文件 / 清空内容）
  if (!text.trim()) {
    applyMarkers(model, [])
    checked.delete(key)
    return
  }

  // 切文件时不等防抖，但仍然走一遍计时函数：它负责「换文件就清零重建次数」
  const delay = nextDelay(key)
  clearTimeout(timer)
  timer = setTimeout(() => {
    timer = 0
    // 一次真重建。切文件那一枪不算「连续编辑」，不计入退避
    if (!immediate) rebuildCount += 1
    // 上一枪还在跑就先掐掉：它的结论一定比这一枪旧
    latestSeq += 1
    try {
      runningHost?.kill()
    } catch {
      /* 已经跑完或被杀过 */
    }
    runningHost = null
    runCheck(model, language, text).catch(() => {})
  }, immediate ? 0 : delay)
}

/**
 * 运行时在「文件已经打开」之后才进内存的那一枪：先开坏文件、后点运行，
 * 若不在这里补一枪，红线要等到下一次击键才出现（用户会当成「诊断没生效」）。
 * 模块级注册一次就够——监听器随模块常驻，与面板生命周期无关；来的语言和当前
 * model 对不上时，runCheck 里的就绪判据自己会跳过。
 */
onRuntimeReady(() => {
  const ed = monaco.editor.getEditors()[0]
  if (ed) scheduleSyntaxCheck(ed.getModel(), { immediate: true })
})

/** 面板卸载时收尾：定时器与在跑的实例都停掉，避免卸载后还有人往销毁的 model 上写标记 */
export function releaseSyntaxDiagnostics() {
  clearTimeout(timer)
  timer = 0
  latestSeq += 1
  try {
    runningHost?.kill()
  } catch {
    /* 已经跑完或被杀过 */
  }
  runningHost = null
  checked.clear()
  // 退避状态也归零：下次挂载（换文件、重开面板）从最快那一档开始
  rebuildCount = 0
  lastEditAt = 0
  lastModelKey = ''
}
