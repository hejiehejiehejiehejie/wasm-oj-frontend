/**
 * 输出差异 —— 给界面看的那一份（2026-11-09 加）。
 *
 * 【它不是什么】它**不做判定**。AC / WA 的唯一出处在 `services/checkers.js`
 * （`checkOutput`），这里只回答「差在哪、差成什么样」，供卡片把不同的那几处标出来。
 * 两边的前处理必须同源：换行统一走 `compare.js` 的 `normalizeNewlines`、
 * 逐行口径走 `normalizeLines` —— 一旦这里多切 / 少切一截，界面就会指着一段其实相同的
 * 文本说「这儿不一样」。
 *
 * 【偏移一律在原文上】`marks` 会被拿去切 ACTUAL 框里那段**原文**，所以行 / 词元的
 * `start` / `end` 都必须在原文上数，不能拿归一化之后的字符串算 —— 否则实际输出里每出现
 * 一个 `\r`，高亮就往前错一位。`strict` 的比较只能发生在归一化文本上，它那份偏移由
 * `toRawIndex` 换算回来。
 *
 * 【为什么不是逐字符 LCS】样例输出可以到几十万字符，字符级 LCS 是 O(n·m)，
 * 一次 WA 就能把主线程按住几秒。所以按**比对方式的单位**来比：
 *   - `lines`     ：单位是行，且**只按行号配**（`positionalOps`，理由见那里）
 *   - `unordered` ：单位是行，按多重集比（顺序本来就不参与判定）
 *   - `tokens` / `float`：单位是词元，用 LCS 对齐（少一个词时，后面的词靠它才救得回来）
 *   - `strict`    ：先掐掉公共前后缀，只报中间那一块（线性，且足够说明问题）
 * 每处差异再在单位内部掐一次公共前后缀，只有**真正不同的那几个字符**才打标 ——
 * 否则一整行 60 列都会变红，等于什么都没标。
 *
 * 【只在 WA 时算】调用方（`TestCaseCard.vue`）拿 `status === 'failed'` 当闸门，
 * AC 的卡片不触发这里的任何一次切分。
 */

import { normalizeLines, normalizeNewlines } from './compare.js'
import { DEFAULT_CHECKER_ID, FLOAT_TOLERANCE, isCheckerId } from './checkers.js'

/** 最多列几处差异。卡片在 160~400px 的侧栏里，再多就成了另一份输出 */
const MAX_ENTRIES = 3
/** 每侧每处最多显示多少字符（从差异处向两侧取，超出打省略号） */
const SIDE_WINDOW = 160
/** 超过这个字符数就不比了：切词元 / 建 LCS 表的代价不再值得，而且卡片本来就显示不下 */
const MAX_CHARS = 100_000
/** LCS 的规模上限（中段 a·b 的格子数）。160k 格 ≈ 0.6 MB Int32，约 1 ms */
const LCS_CELLS = 160_000
/** 框内内联高亮每处最多标多少字符（严格比对那一支可能「后面全都不一样」） */
const INLINE_CHARS = 24

/**
 * 把一段文本按「要标出来的区间」切成片段。
 *
 * @param {string} text
 * @param {Array<[number, number]>} ranges 左闭右开、互不重叠、升序
 * @returns {Array<{ text: string, mark?: boolean }>}
 */
export function markSegments(text, ranges) {
  if (!text) return []
  const out = []
  let at = 0
  for (const [from, to] of ranges) {
    const start = Math.max(at, Math.min(from, text.length))
    const end = Math.max(start, Math.min(to, text.length))
    if (start > at) out.push({ text: text.slice(at, start) })
    if (end > start) out.push({ text: text.slice(start, end), mark: true })
    at = Math.max(at, end)
  }
  if (at < text.length) out.push({ text: text.slice(at) })
  return out
}

/**
 * 同 markSegments，但文本太长时只留差异附近的一段（两侧补 `…`）。
 *
 * 卡片是侧栏，一行 1000 个字符的样例在这里只能横滚 —— 用户要看的不是那一整行，
 * 而是「哪个位置不一样」。所以窗口按**第一处**差异居中取。
 */
function clip(text, ranges) {
  if (text.length <= SIDE_WINDOW) return markSegments(text, ranges)
  const anchor = ranges.length ? ranges[0][0] : 0
  const start = Math.min(Math.max(0, anchor - Math.floor(SIDE_WINDOW / 2)), text.length - SIDE_WINDOW)
  const end = Math.min(text.length, start + SIDE_WINDOW)
  const body = text.slice(start, end)
  const shifted = ranges
    .filter(([a, b]) => b > start && a < end)
    .map(([a, b]) => [Math.max(a, start) - start, Math.min(b, end) - start])
  const segments = markSegments(body, shifted)
  if (start > 0) segments.unshift({ text: '…' })
  if (end < text.length) segments.push({ text: '…' })
  return segments
}

/**
 * 两段文本的公共前后缀长度：`p` = 从第几个字符开始不同，`s` = 末尾多少个字符相同。
 */
function commonEdges(a, b) {
  const max = Math.min(a.length, b.length)
  let p = 0
  while (p < max && a[p] === b[p]) p += 1
  let s = 0
  while (s < max - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s += 1
  return { p, s }
}

/**
 * 把「归一化之后的字符下标」换算回原文下标（`normalizeNewlines` 的逆映射：
 * `\r\n` 与单独的 `\r` 都只产出一个 `\n`）。
 *
 * 只有 `strict` 需要它 —— 其余几支都在原文上直接切单位，偏移天生是原文的。
 */
function toRawIndex(raw, index) {
  let i = 0
  let j = 0
  while (j < index && i < raw.length) {
    if (raw[i] === '\r' && raw[i + 1] === '\n') i += 2
    else i += 1
    j += 1
  }
  return i
}

/**
 * 按行切，并带上每行在**原文**里的偏移（框内内联高亮要用）与行号。
 *
 * 行内容的口径与 `compare.js` 的 `normalizeLines` 一字不差（行尾空白抹掉、末尾空行丢弃），
 * 但**偏移必须基于原文**：界面拿 `marks` 去切的是 `<pre>` 里那段原文，一旦这里按
 * `\r\n` → `\n` 之后的字符串算偏移，实际输出里每出现一个 `\r`，高亮就会往前错一位
 * （`1\r\n2` vs `1\n3` 会标到换行符上，而不是那个 `2`）。
 */
function readLines(text) {
  const src = String(text ?? '')
  const lines = []
  const breaks = /\r\n|\r|\n/g
  const push = (start, end) => {
    const body = src.slice(start, end).replace(/[ \t]+$/, '')
    lines.push({ text: body, start, end: start + body.length, line: lines.length + 1 })
  }
  let from = 0
  let match
  while ((match = breaks.exec(src))) {
    push(from, match.index)
    from = match.index + match[0].length
  }
  push(from, src.length)
  while (lines.length && lines[lines.length - 1].text === '') lines.pop()
  return lines
}

/**
 * 按空白切词元，并记住每个词元在原文里的偏移、行号与「该行第几个词」。
 * 行号靠「上一个词元末尾到这一个词元开头之间数几个换行」递推，整体仍是 O(n)。
 * 单独出现的 `\r`（老式 Mac 换行）也算一次换行 —— `normalizeNewlines` 认它，
 * 这里的行号不能少算。
 */
function readTokens(text) {
  const tokens = []
  const re = /\S+/g
  let line = 1
  let column = 0
  let scanned = 0
  let match
  while ((match = re.exec(text))) {
    let breaks = 0
    for (let i = scanned; i < match.index; i += 1) {
      if (text[i] === '\n') breaks += 1
      else if (text[i] === '\r' && text[i + 1] !== '\n') breaks += 1
    }
    if (breaks) {
      line += breaks
      column = 0
    }
    const end = match.index + match[0].length
    column += 1
    tokens.push({ text: match[0], start: match.index, end, line, column })
    scanned = end
  }
  return tokens
}

/** 词元相等判定；float 那一支换成带容差的比较（口径同 checkers.js 的 FLOAT_TOLERANCE） */
function tokenEquals(a, b) {
  if (a === b) return true
  const left = Number(a)
  const right = Number(b)
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false
  const scale = Math.max(1, Math.abs(left), Math.abs(right))
  return Math.abs(left - right) <= FLOAT_TOLERANCE * scale
}

/**
 * 行的对齐：**只按行号配**，不做跨行匹配（2026-11-09 用户口径）。
 *
 * 期望 `1 / 2 / 3`、实际只有一行 `2` 时，LCS 会把那个 `2` 对到第 2 行，于是报
 * 「缺第 1 行、缺第 3 行」—— 等于告诉用户「你恰好对了第二行」，而该说的是
 * 「第一行就错了，后面两行没输出」。行号本身就是有意义的位置，所以固定 i ↔ i：
 * 两侧都有就比内容（不同 → replace），只有实际有 → extra，只有期望有 → missing。
 *
 * 代价（用户已确认接受）：实际多插一行（比如残留的 debug 输出）时，后面每一行都会
 * 标成 replace，而不是「第 2 行多出一行、其余都对上」。
 *
 * 词元**不**这样处理：`tokens` / `float` 里少一个词会让后面全部错开，靠 LCS 才救得回来，
 * 而「第几个词」也没有行号那么强的位置含义。
 */
function positionalOps(a, b, same) {
  const ops = []
  const shared = Math.min(a.length, b.length)
  for (let i = 0; i < shared; i += 1) {
    if (same(a[i], b[i])) ops.push({ type: 'same' })
    else ops.push({ type: 'del', a: i }, { type: 'ins', b: i })
  }
  for (let i = shared; i < a.length; i += 1) ops.push({ type: 'del', a: i })
  for (let i = shared; i < b.length; i += 1) ops.push({ type: 'ins', b: i })
  return ops
}

/**
 * 按内容对齐两串单位（`tokens` / `float` 走这条）。返回的每一项要么是 `del`（只在实际侧）、
 * `ins`（只在期望侧），要么是 `same`（对齐成功，只用来切开相邻的两处改动，不参与显示）。
 *
 * 中段太大（乘积超过 LCS_CELLS）时退化成「按位置配对 + 尾巴挂多 / 缺」：
 * 精度降一档，但保证不在一次 WA 上烧掉几百毫秒。
 */
function alignOps(a, b, same = (x, y) => x === y) {
  let head = 0
  while (head < a.length && head < b.length && same(a[head], b[head])) head += 1
  let tail = 0
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    same(a[a.length - 1 - tail], b[b.length - 1 - tail])
  ) {
    tail += 1
  }

  const aMid = a.slice(head, a.length - tail)
  const bMid = b.slice(head, b.length - tail)
  if (!aMid.length && !bMid.length) return []
  if (aMid.length * bMid.length <= LCS_CELLS) return lcsOps(aMid, bMid, head, same)

  const ops = []
  const pair = Math.min(aMid.length, bMid.length)
  for (let i = 0; i < pair; i += 1) {
    ops.push({ type: 'del', a: head + i }, { type: 'ins', b: head + i })
  }
  for (let i = pair; i < aMid.length; i += 1) ops.push({ type: 'del', a: head + i })
  for (let i = pair; i < bMid.length; i += 1) ops.push({ type: 'ins', b: head + i })
  return ops
}

/** 标准 LCS 回溯；两个下标都加 offset，回到「整串里的第几个单位」 */
function lcsOps(a, b, offset, same) {
  const n = a.length
  const m = b.length
  const w = m + 1
  const dp = new Int32Array((n + 1) * w)
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i * w + j] = same(a[i], b[j])
        ? dp[(i + 1) * w + j + 1] + 1
        : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1])
    }
  }
  const ops = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (same(a[i], b[j])) {
      ops.push({ type: 'same' })
      i += 1
      j += 1
      continue
    }
    if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) {
      ops.push({ type: 'del', a: offset + i })
      i += 1
    } else {
      ops.push({ type: 'ins', b: offset + j })
      j += 1
    }
  }
  while (i < n) {
    ops.push({ type: 'del', a: offset + i })
    i += 1
  }
  while (j < m) {
    ops.push({ type: 'ins', b: offset + j })
    j += 1
  }
  return ops
}

/**
 * 把 del / ins 混排的一串操作折成「条目」：同一次改动里两侧都有内容 → replace，
 * 只有一侧 → extra（实际多出）/ missing（实际缺少）。相邻的改动靠 same 切开。
 */
function groupOps(ops) {
  const pairs = []
  let k = 0
  while (k < ops.length) {
    while (k < ops.length && ops[k].type === 'same') k += 1
    const dels = []
    const inss = []
    while (k < ops.length && ops[k].type !== 'same') {
      if (ops[k].type === 'del') dels.push(ops[k].a)
      else inss.push(ops[k].b)
      k += 1
    }
    const aligned = Math.min(dels.length, inss.length)
    for (let i = 0; i < aligned; i += 1) pairs.push({ kind: 'replace', a: dels[i], b: inss[i] })
    for (let i = aligned; i < dels.length; i += 1) pairs.push({ kind: 'extra', a: dels[i] })
    for (let i = aligned; i < inss.length; i += 1) pairs.push({ kind: 'missing', b: inss[i] })
  }
  return pairs
}

/** 行 / 词元的条目化：内容进条目，偏移进内联高亮 */
function unitEntries(ops, gotUnits, wantUnits, whereOf) {
  const pairs = groupOps(ops)
  const entries = []
  const marks = []

  for (const pair of pairs.slice(0, MAX_ENTRIES)) {
    const gotUnit = pair.a === undefined ? null : gotUnits[pair.a]
    const wantUnit = pair.b === undefined ? null : wantUnits[pair.b]
    let want = null
    let got = null
    let mark = null

    if (pair.kind === 'replace' && gotUnit && wantUnit) {
      // 单位内部再掐一次公共前后缀：只有真正不同的那几个字符打标
      const { p, s } = commonEdges(gotUnit.text, wantUnit.text)
      got = clip(gotUnit.text, [[p, gotUnit.text.length - s]])
      want = clip(wantUnit.text, [[p, wantUnit.text.length - s]])
      // 框内高亮取**原文**里的绝对位置，右边界钉在「差异段结束」，不是 p + 固定长度：
      // 否则一处只差一个空格的差异，会连带标掉后面几个其实相同的字符。
      const from = gotUnit.start + p
      const to = Math.min(gotUnit.end - s, from + INLINE_CHARS)
      if (to > from) mark = [from, to]
    } else if (gotUnit) {
      got = clip(gotUnit.text, [[0, gotUnit.text.length]])
      if (gotUnit.end > gotUnit.start) {
        mark = [gotUnit.start, Math.min(gotUnit.end, gotUnit.start + INLINE_CHARS * 4)]
      }
    } else if (wantUnit) {
      want = clip(wantUnit.text, [[0, wantUnit.text.length]])
    }

    entries.push({ kind: pair.kind, where: whereOf(pair, gotUnit, wantUnit), want, got })
    if (mark) marks.push(mark)
  }

  return { entries, marks, more: Math.max(0, pairs.length - MAX_ENTRIES) }
}

/** 行 / 词元两种模式的入口：切单位 → 对齐 → 折条目 */
function diffUnits(got, want, kind, whereOf) {
  const perToken = kind !== 'line'
  const gotUnits = perToken ? readTokens(got) : readLines(got)
  const wantUnits = perToken ? readTokens(want) : readLines(want)
  const gotText = gotUnits.map((unit) => unit.text)
  const wantText = wantUnits.map((unit) => unit.text)
  const same = kind === 'float' ? tokenEquals : (x, y) => x === y
  // 行按行号配，词元按内容配（理由见 positionalOps 的注释）
  const ops = perToken ? alignOps(gotText, wantText, same) : positionalOps(gotText, wantText, same)
  if (!ops.length) return { entries: [], marks: [], more: 0 }
  return unitEntries(ops, gotUnits, wantUnits, whereOf)
}

/**
 * 逐行的位置文案：行号优先取**期望侧**（用户对着 Expected 那个框找），
 * 只有「实际多出」才退到实际侧 —— 那一行在期望里根本不存在。
 */
function lineWhere(pair, gotUnit, wantUnit) {
  const n = (wantUnit ?? gotUnit)?.line ?? 0
  return [{ key: 'tests.diff.whereLine', params: { n } }]
}

/** 词元的位置文案：行 + 该行第几个词（行号同上，优先期望侧） */
function tokenWhere(pair, gotUnit, wantUnit) {
  const line = (wantUnit ?? gotUnit).line
  const column = (wantUnit ?? gotUnit).column
  return [
    { key: 'tests.diff.whereLine', params: { n: line } },
    { key: 'tests.diff.whereToken', params: { n: column } },
  ]
}

/**
 * 严格逐字符：掐掉公共前后缀，只报中间那一块。
 * 换行在块里看不见，显示时换成 `↵` —— 否则「只差一个空行」这种差异会显示成一段空白。
 */
function diffStrict(got, want) {
  const a = normalizeNewlines(got)
  const b = normalizeNewlines(want)
  if (a === b) return { entries: [], marks: [], more: 0 }

  const { p, s } = commonEdges(a, b)
  const gotChunk = a.slice(p, a.length - s)
  const wantChunk = b.slice(p, b.length - s)
  const kind = gotChunk ? (wantChunk ? 'replace' : 'extra') : 'missing'
  const show = (text) => text.replace(/\n/g, '↵')
  const shownGot = show(gotChunk)
  const shownWant = show(wantChunk)
  // 比较在归一化文本上做，标记却要落在原文：不换算的话，实际输出里每出现一个 `\r`，
  // 高亮就往前错一位（`a\r\nb` vs `a\nc` 会标到换行上而不是那个 `b`）。
  const from = toRawIndex(got, p)
  const to = toRawIndex(got, p + Math.min(gotChunk.length, INLINE_CHARS))

  return {
    entries: [
      {
        kind,
        // 位置文案按归一化的字符序号：`\r\n` 在用户眼里就是一个换行，算两个字符反而不像「第几个字符」
        where: [{ key: 'tests.diff.whereChar', params: { n: p + 1 } }],
        want: wantChunk ? clip(shownWant, [[0, shownWant.length]]) : null,
        got: gotChunk ? clip(shownGot, [[0, shownGot.length]]) : null,
      },
    ],
    // 框内高亮的右边界钉在「差异段结束」：多标一个字符，界面就会指着一处其实相同的内容
    // 说「这儿不一样」（严格那一支尤其明显：只多一个空格时，24 字符的固定长度会带掉换行与下一行）
    marks: gotChunk && to > from ? [[from, to]] : [],
    more: 0,
  }
}

/**
 * 忽略行序：行内容当多重集比。多的行标出来，少的行列出来 —— 没有「第几行」，
 * 因为顺序本来就不参与比对。
 */
function diffUnordered(got, want) {
  const gotLines = readLines(got)
  const wantLines = readLines(want)
  /** text → 该内容在两侧出现的行下标 */
  const buckets = new Map()
  const bucketOf = (key) => {
    if (!buckets.has(key)) buckets.set(key, { want: [], got: [] })
    return buckets.get(key)
  }
  wantLines.forEach((line, index) => bucketOf(line.text).want.push(index))
  gotLines.forEach((line, index) => bucketOf(line.text).got.push(index))

  const entries = []
  const marks = []
  let total = 0
  for (const [, bucket] of buckets) {
    const delta = bucket.got.length - bucket.want.length
    if (!delta) continue
    const surplus = Math.abs(delta)
    total += surplus
    for (let i = 0; i < surplus && entries.length < MAX_ENTRIES; i += 1) {
      // delta > 0：实际多出来的行；delta < 0：期望有、实际没有的行
      const line = delta > 0 ? gotLines[bucket.got[bucket.want.length + i]] : wantLines[bucket.want[bucket.got.length + i]]
      entries.push({
        kind: delta > 0 ? 'extra' : 'missing',
        where: null,
        want: delta > 0 ? null : clip(line.text, [[0, line.text.length]]),
        got: delta > 0 ? clip(line.text, [[0, line.text.length]]) : null,
      })
      if (delta > 0 && line.end > line.start) marks.push([line.start, line.end])
    }
  }
  return { entries, marks, more: Math.max(0, total - entries.length) }
}

/**
 * 算一次差异。
 *
 * @param {string} actual 程序标准输出
 * @param {string} expected 期望输出
 * @param {string} [checkerId] 与判定同一套 id（services/checkers.js）
 * @returns {{ entries: Array<object>, marks: Array<[number, number]>, more: number, truncated?: boolean } | null}
 *   `null` = 在这个比对方式下两段输出等价（没什么可标的）
 */
export function diffOutput(actual, expected, checkerId = DEFAULT_CHECKER_ID) {
  const id = isCheckerId(checkerId) ? checkerId : DEFAULT_CHECKER_ID
  const got = String(actual ?? '')
  const want = String(expected ?? '')

  // 太长：切表 / 建表的代价不再值得。条目给空，界面据此只显示一句说明。
  if (got.length > MAX_CHARS || want.length > MAX_CHARS) {
    return { entries: [], marks: [], more: 0, truncated: true }
  }

  // 逐行是最容易「算出来没差异、判定却是 WA」的一支（前处理有两处容易写歪：
  // 行尾空白与末尾空行）。先用判定那支的同一份 normalizeLines 对一次账：
  // 真等价就什么都不显示，省得界面指着一模一样的两段文本说「不同」。
  if (id === 'lines') {
    const gotLines = normalizeLines(got)
    const wantLines = normalizeLines(want)
    if (gotLines.length === wantLines.length && gotLines.every((line, i) => line === wantLines[i])) {
      return null
    }
  }

  let result
  switch (id) {
    case 'strict':
      result = diffStrict(got, want)
      break
    case 'tokens':
      result = diffUnits(got, want, 'token', tokenWhere)
      break
    case 'float':
      result = diffUnits(got, want, 'float', tokenWhere)
      break
    case 'unordered':
      result = diffUnordered(got, want)
      break
    default:
      result = diffUnits(got, want, 'line', lineWhere)
  }

  return result.entries.length ? result : null
}
