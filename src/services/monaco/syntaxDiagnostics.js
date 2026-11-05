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
 *    不必先跑一遍；缓存里没有就静默跳过（checkCppSyntax / checkPythonSyntax 返回
 *    `{ status: 'unavailable' }`）——
 *    绝不能在「打开一个 .cpp / .py」时偷下几十 MB。
 * 2. **只有最新一枪的结果能落地**。序号对不上的一律丢弃，还在跑的那一枪不掐（让它跑完，
 *    比重建一颗 23MB 的宿主便宜）—— 否则慢的那一枪回来会把新代码的标记覆盖成旧代码的。
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
import { ensureRuntimeLoaded, noteHostActivity, subscribeStatus } from '../wasmRuntime.js'
import {
  SYNTAX_STATUS,
  checkCppSyntax,
  checkPythonSyntax,
  isPythonRuntimeReady,
  isToolchainReady,
  onHostEvent,
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
/**
 * 一条诊断最多并进几条 `note:`。
 *
 * clang 的 note 就是「为什么不行」：`candidate function not viable: requires 2 arguments,
 * but 1 was provided`、`no known conversion from 'const char[4]' to 'int'`。
 * VS Code 把它们和错误一起铺在悬停里，这里也并进同一条标记 —— 标记的正文就是悬停里
 * 显示的内容（Monaco 的 MarkerHoverParticipant 直接读 `message`）。上限压住模板实例化
 * 爆炸时动辄十几条的候选列表。
 */
const NOTE_LIMIT = 3

/** 每次检查的序号：只有等于最新序号的结果才允许写标记 */
let latestSeq = 0
/** 防抖定时器 */
let timer = 0
/** 正在进行或已完成的实例（用来在下一枪开始时 kill 掉） */
let runningHost = null
/**
 * 被「宿主正被占着」挡下来的那一枪：`{ key, text, language }`，沙箱空闲时补跑（见文件末尾
 * 的 `subscribeStatus`）。只记最新一枪 —— 旧的一定会被新的覆盖。
 *
 * 为什么要记：C++ 的检查与运行 / PCH 生成共用一颗常驻宿主，那两位占着时 `checkCppSyntax`
 * 直接返回 null 让路（不能排队：它自己的 15s 看门狗从发起那刻就上弦，见 services/wasi/client.js
 * 的 busy）。让路的代价是这次没有结论 —— 不补的话，「打开文件的同一瞬间点运行」这种顺序下，
 * 那份文件该有的红线要等到用户下次击键才出现，看起来就像诊断对第一个文件失效了。
 * @type {{ key: string, text: string, language: 'cpp' | 'python' } | null}
 */
let deferred = null

/**
 * 补账的重试次数与间隔。
 *
 * 主路径现在是宿主自己的 `idle` 事件（见文件末尾的 onHostEvent）：队列排空、没有 hold
 * 占用时才发，PCH 本机生成结束也算。这里剩下的是兜底 —— 事件和计时器之间可能有极小的
 * 窗口（例如宿主在补查前又被新一轮运行占住），给几次延迟重试；次数封顶，免得空转。
 */
const DEFERRED_RETRY_MS = 600
const DEFERRED_RETRY_LIMIT = 4
let deferredTimer = 0
let deferredRetries = 0
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

/** 该语言的一次性检查。返回带 `status` 的结论（见 runnoSandbox.SYNTAX_STATUS） */
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
 * 只认 `路径:行:列: 级别: 消息` 这一种行（clang 8 的固定格式）。`note` 不单独成标记：
 * 它们是上一条错误的补充说明（候选函数为何不可行、两个类型为什么转不过去），
 * 这里并进那条标记的正文、每条占一行 —— 标记正文就是悬停里显示的文字
 * （Monaco 的 MarkerHoverParticipant 直接读 `message`），于是悬停错误处能看到
 * 与 VS Code 同款的「错误 + 原因」。后面那几行缩进的源码回显对不上正则，自然被跳过。
 * @param {string} stderr
 * @param {{ text?: string, language?: 'cpp' | 'python' }} [source]
 *   text 用来算列单位与区间宽度；language 只影响列单位（clang 是字节列、Python 是字符列）
 */
function parseDiagnostics(stderr, { text = '', language = 'cpp' } = {}) {
  const lines = String(text).split('\n')
  const byteColumns = language !== 'python'
  const markers = []
  /** 上一条错误 / 警告：note 只往它身上挂 */
  let current = null
  let notes = 0
  for (const line of String(stderr ?? '').split('\n')) {
    if (markers.length >= MARKER_LIMIT) break
    const match = /^(.+?):(\d+):(\d+): (fatal error|error|warning|note): (.*)$/.exec(line)
    if (!match) continue
    const [, , lineText, columnText, level, message] = match
    if (level === 'note') {
      if (!current || notes >= NOTE_LIMIT) continue
      const note = message.trim()
      // 同一句原因重复出现（模板多重实例化）时不叠第二遍
      if (!note || current.message.includes(note)) continue
      const merged = `${current.message}\nnote: ${note}`
      if (merged.length > MESSAGE_LIMIT) continue
      current.message = merged
      notes += 1
      continue
    }
    const lineNumber = Number(lineText)
    const rawColumn = Number(columnText)
    if (!Number.isFinite(lineNumber) || !Number.isFinite(rawColumn)) continue
    const source = lines[lineNumber - 1]
    const column = byteColumns ? byteColumnToChar(source, rawColumn) : rawColumn
    const [startColumn, endColumn] = tokenRangeAt(source, column)
    const marker = {
      severity:
        level === 'warning' ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Error,
      message: message.slice(0, MESSAGE_LIMIT),
      startLineNumber: lineNumber,
      startColumn,
      endLineNumber: lineNumber,
      endColumn,
      source: 'clang',
    }
    markers.push(marker)
    current = marker
    notes = 0
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
  // 运行时没就绪：跳过，但**不清**已有标记（清掉等于告诉用户「代码突然对了」）。
  // 还要把这一语言的补账收掉 —— 运行时都不在（宿主被看门狗收掉、或压根没下载），
  // 再重试多少次都不会有结论。宿主被收掉的情况由 terminated 订阅放开闸门（见文件末尾），
  // 下一次击键会「只读缓存、不下载」地重建，重建成功再通过 runtimeReady 的通知重查。
  if (!runtimeReady(language)) {
    clearDeferred(language)
    return
  }
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
  // 语法检查同样不走沙箱调度器（beginTask/endTask），跑完这一枪要自己续上闲置计时器；
  // 否则活跃编辑几分钟后会被休眠掐断，下一次击键又要付一遍宿主重建。
  noteHostActivity()
  // 没有结论：按具体原因分流，别再一律当成「宿主忙、过一会儿补一枪」
  const status = result?.status
  if (!result || status === SYNTAX_STATUS.BUSY) {
    // busy：宿主正被运行 / PCH 生成占着、checkCppSyntax 让了路 —— 记下来等沙箱空闲补一枪
    // （见文件末尾的 runDeferred）。只登记最新序号：别人已经排了新一枪的话，那一枪自己会给结论。
    if (seq === latestSeq) {
      deferred = { key: model.uri.toString(), text, language }
      scheduleDeferredRetry()
    }
    return
  }
  if (status === SYNTAX_STATUS.ABORTED) {
    // 宿主被外力掐断（看门狗 / 抢占 / 崩溃）。旧标记保留 —— 代码没变，结论就还成立。
    // 但**不要就此遗忘**：宿主的 terminate 若是就地重建（抢占），`runtimeReady` 仍是 true，
    // 这一枪其实值得再补一次；宿主真没了则交给 terminated 订阅去放开闸门、
    // 等 onRuntimeReady 重建后再查（见文件末尾）。
    if (seq === latestSeq && runtimeReady(language)) {
      deferred = { key: model.uri.toString(), text, language }
      scheduleDeferredRetry()
    } else {
      clearDeferred(language)
    }
    return
  }
  if (status !== SYNTAX_STATUS.SUCCESS) {
    // unavailable：宿主没了（看门狗 / 卸载）。保留旧标记，但不再补账 ——
    // 等 terminated 订阅放开闸门、onRuntimeReady 重建后由那个入口重查。
    clearDeferred(language)
    return
  }
  if (seq !== latestSeq || model.isDisposed()) return
  // 真拿到结论了：之前记下的「补一枪」请求作废（同一份内容已经有答案）
  deferred = null
  // 期间内容又变了：这一枪的结论已经过期，等下一枪
  if (model.getValue() !== text) return

  const markers = parseDiagnostics(result.stderr, { text, language })
  checked.set(model.uri.toString(), { text, markers })
  applyMarkers(model, markers)
}

/**
 * 收掉补账请求与重试定时器。只清当前语言的那一份 —— 另一种语言可能正等着。
 * @param {'cpp' | 'python'} language
 */
function clearDeferred(language) {
  if (!deferred || deferred.language !== language) return
  deferred = null
  clearTimeout(deferredTimer)
  deferredTimer = 0
  deferredRetries = 0
}

/**
 * 收拾上一枪占着的那颗宿主。
 *
 * **不再 kill 正在跑的那一枪**（2026-10-27 改）：结果是按 `latestSeq` 作废的，不需要
 * 用「掐断」来保证正确性；而 kill 掐的是整颗 worker（运行 / PCH 生成共用），重建要重新
 * 实例化 76MB 的模块 + 解 1385 条 sysroot —— 老机器上单次检查 1–2s > 防抖 300ms，
 * 每次击键都杀一遍重建一遍，CPU 翻倍、红线还更迟。让它跑完（最多 15s，宿主自己的表兜底）。
 *
 * 真正需要「立刻腾出宿主」的是用户点运行 —— 那件事由宿主的抢占负责
 * （前台消息会把正在跑的后台活连 worker 一起换掉，见 services/wasi/client.js 的 send），
 * 这里只需要把**还没派发**的旧枪撤掉。
 */
function retireRunningCheck() {
  const host = runningHost
  runningHost = null
  if (!host) return
  try {
    host.cancelQueued?.('syntax')
  } catch {
    /* 没有这个接口的宿主（旧宿主 / 别的运行时）就什么都不用做 */
  }
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
    // 上一枪还在跑就先收掉：它的结论一定比这一枪旧。收法见 retireRunningCheck
    // （撤队列里的旧枪 + 只在「正在跑的确实是语法检查」时才杀宿主）。
    latestSeq += 1
    retireRunningCheck()
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

/**
 * 宿主生命周期（2026-11-03）：一次性闸门跟着**宿主**走，而不是跟着页面会话走。
 *
 * - `terminated`：宿主没了（TLE / 看门狗 / 抢占 / 崩溃）。把 `bootstrapAttempts` 放开，
 *   下一次击键就会走 ensureRuntimeLoaded 的「只读缓存、不下载」重建；重建成功会
 *   `notifyRuntimeReady`，上面那一枪立刻重查。这里**不主动重建** —— 用户可能跑完 TLE
 *   就把文件关了，不该为诊断先拉起一颗宿主。卸载（DISPOSED）不会转发到这里。
 * - `idle`：队列排空且没有 hold 占用（PCH 本机生成结束也走这条）。补上「让路之后
 *   没人叫醒」的缺口，不再只靠 600ms×4 的盲轮询。
 */
onHostEvent((event) => {
  if (event.type === 'terminated') {
    bootstrapAttempts.delete('cpp')
    deferredRetries = 0
    return
  }
  if (event.type !== 'idle' || !deferred) return
  clearTimeout(deferredTimer)
  deferredTimer = 0
  deferredRetries = 0
  runDeferred()
})

/**
 * 把「运行期间被迫让路的那一枪」补上。
 *
 * 只在真有让路记录时才做事，所以平时它是空的。补跑前要重新核对：用户可能已经切了文件、
 * 或又改了内容 —— 那两种情况都不该拿旧正文去查（切回来会从 `checked` 重放，改字会自己
 * 触发新一枪）。核对通过就直接跑一次，不走防抖、也不碰退避计数：这是补账，不是用户又
 * 敲了一下键盘。
 *
 * 两个入口：宿主空闲（`onHostEvent` 的 idle，覆盖运行收尾 / PCH 生成结束）是主路径；
 * 沙箱状态机的 idle（`subscribeStatus`）与延迟重试兜住极小的时序窗口。
 * 补跑若又被让路，`runCheck` 会把记录重新写回来并再排一次重试，所以这里只负责「试一次」。
 */
function runDeferred() {
  if (!deferred) return
  const pending = deferred
  deferred = null
  const model = monaco.editor.getEditors()[0]?.getModel()
  if (!model || model.isDisposed()) return
  if (model.uri.toString() !== pending.key || model.getValue() !== pending.text) return
  // 同一份内容已经排在防抖队列上了：没必要再跑一次
  clearTimeout(timer)
  timer = 0
  runCheck(model, pending.language, pending.text).catch(() => {})
}

function scheduleDeferredRetry() {
  if (deferredTimer || deferredRetries >= DEFERRED_RETRY_LIMIT) return
  deferredTimer = setTimeout(() => {
    deferredTimer = 0
    deferredRetries += 1
    runDeferred()
  }, DEFERRED_RETRY_MS)
}

/**
 * 沙箱空闲（一次运行 / 预载收尾）时补账。每次运行结束都把重试预算重置一遍——
 * 那是新一轮「宿主空下来了」的起点。
 */
subscribeStatus((status) => {
  if (status?.stage !== 'idle' || !deferred) return
  clearTimeout(deferredTimer)
  deferredTimer = 0
  deferredRetries = 0
  runDeferred()
})

/** 面板卸载时收尾：定时器与在跑的实例都停掉，避免卸载后还有人往销毁的 model 上写标记 */
export function releaseSyntaxDiagnostics() {
  clearTimeout(timer)
  timer = 0
  latestSeq += 1
  // 补账记录与它的重试计时器一起清掉：面板都卸了，下次击键 / 切文件会自己重新安排
  deferred = null
  clearTimeout(deferredTimer)
  deferredTimer = 0
  deferredRetries = 0
  // 同上一处：收法见 retireRunningCheck —— 只撤队列里还没派发的旧枪；
  // 正在跑的那一枪不掐（那颗 worker 运行 / PCH 生成共用，卸载面板不该打断别人）
  retireRunningCheck()
  checked.clear()
  // 退避状态也归零：下次挂载（换文件、重开面板）从最快那一档开始
  rebuildCount = 0
  lastEditAt = 0
  lastModelKey = ''
}
