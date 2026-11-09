/**
 * 输出差异 —— 只回答「差在哪」，不做判定（2026-11-09 加；同日第二轮改标记模型；
 * 第三轮改成**只改字色的双侧标记**，框下那块差异摘要撤掉了）。
 *
 * 【它不是什么】AC / WA 的唯一出处在 `services/checkers.js`（`checkOutput`）。
 * 这里只负责把「哪几个字符不一样」算出来交给界面染色。两边的前处理必须同源：换行统一走
 * `compare.js` 的 `normalizeNewlines`、逐行口径走 `normalizeLines` —— 一旦这里多切 / 少切
 * 一截，界面就会指着一模一样的两段文本说「这儿不一样」。
 *
 * 【两份标记，三种颜色】返回 `{ got, want }`：
 *
 *   got  —— 落在 **ACTUAL** 原文上的区间
 *   want —— 落在 **EXPECTED** 原文上的区间
 *
 *   kind        ACTUAL            EXPECTED        含义
 *   replace     WA 红（--fail）   悬停才亮        这一段两边不一样
 *   extra       RE 黄（--err）    —               实际输出多出来的
 *   missing     —                 RE 黄（--err）  期望有、实际没有的
 *
 * 这是这一版的关键：**缺失不再往实际侧挤**。之前「实际漏了几个字」只能在实际侧插一根
 * 竖线（零宽区间画不出来），现在直接把 EXPECTED 里那一段染黄 —— 那边本来就有内容，
 * 天然不存在「画不出来」的问题。
 *
 * 【pair：两侧同一处共用一个编号】`replace` 是「两边都有、但不一样」，所以两侧各有一段
 * 标记，带着**同一个 `pair`** —— 界面靠它在鼠标停到某一处时把对侧也点亮（见
 * `TestCaseCard.vue` 的 `onMarkOver`）。期望侧那一份带 `quiet`：平时不着色，只在悬停时出现，
 * 因为用户明确要求 EXPECTED 只标「少了的内容」，不该让每一处替换都把期望输出染红。
 * `extra` / `missing` 只有一侧有标记，各自占一个新编号（悬停时只有自己亮）。
 *
 * 【偏移一律在原文上】`got` / `want` 会被拿去切两个框里的原文，所以行 / 词元的
 * `start` / `end` 都必须在原文上数，不能拿归一化之后的字符串算 —— 否则实际输出里每出现
 * 一个 `\r`，标记就往前错一位。`strict` 的比较只能发生在归一化文本上，它那份偏移由
 * `toRawIndex` 换算回来。
 *
 * 【对齐：元素对元素，按位置配】（2026-11-09 用户口径，同日第三轮）
 *   - `lines`     ：第 i 行对第 i 行；行内第 k 个词元对第 k 个词元
 *   - `tokens` / `float`：全局第 k 个词元对第 k 个词元
 *   - `unordered` ：单位是行，按多重集比（顺序本来就不参与判定）
 *   - `strict`    ：整串先掐公共前后缀，只报中间那一块
 *
 * **不做 LCS / 不跨位置找配对**。少一个词的时候 LCS 能把后面的词整体前移救回来，代价是
 * 把「第 1 个元素写错了」说成「第 1 个元素缺了、末尾多了一个」—— 高亮落点不在用户真正敲错的
 * 位置上。`3 1 2` 对 `1 2 3` 就是最难看的一例：LCS 配掉中间的 `1 2`，只剩一句「3 换了 3」。
 * 位置本身是有意义的（行号、行内第几个词），所以固定 k ↔ k；代价是多插一个元素之后，
 * 后面的元素全按「不一致」标 —— 与「行按行号配」的代价是同一类，用户已确认接受。
 *
 * 唯一保留的前后缀裁剪发生在**已经配对的同一对单位内部**（`markPair`）：两个词元一对一时，
 * 只染真正不同的那几个字符，否则 `100800` 整条变色、`Impossible` 整条变色，等于没标。
 * 这一步不移动任何元素的位置，和「按位置配」不冲突。
 *
 * 【只在 WA 时算】调用方（`TestCaseCard.vue`）拿 `status === 'failed'` 当闸门，
 * AC 的卡片不触发这里的任何一次切分。
 */

import { normalizeLines, normalizeNewlines } from './compare.js'
import { DEFAULT_CHECKER_ID, FLOAT_TOLERANCE, isCheckerId } from './checkers.js'

/** 超过这个字符数就不比了：切词元 / 逐单位配对的代价不再值得 */
const MAX_CHARS = 100_000
/** 词元吸附后这一段的长度上限。超了就放弃吸附，精确保留到单字符 */
const INLINE_CHARS = 24
/**
 * 最多保留多少**处**差异（`pair` 的编号上限，不是段数）。
 * 一处 `replace` 在两侧各占一段、`extra` / `missing` 只占一侧，所以按编号截断才能保证
 * 「同一处要么两边都在、要么两边都丢」；按数组长度各截 120 段会把某一处的另一半留在对侧，
 * 悬停时只亮半边（见 `tidy`）。
 */
const MAX_MARKS = 120

/**
 * 纯空白的一段差异，直接染色是看不见的：空格染红了还是空格，换行更是连字形都没有。
 * 这一档把它们换成看得见的符号（`↵` 后面补回真换行，行结构不变）。
 */
function showBlank(text) {
  return text
    .replace(/\r\n|\r/g, '\n')
    .replace(/ /g, '·')
    .replace(/\t/g, '⇥')
    .replace(/\n/g, '↵\n')
}

/**
 * 一段**被标记**的原文该显示成什么（2026-11-09 深夜，用户评审后收紧）。
 *
 * 旧版对每个标记段无条件跑 `showBlank`，于是：
 *   - `10 20 30`（整行多出）变成 `10·20·30` —— 整段本来已经是黄字，中间的分隔空格不需要中点；
 *   - 期望侧 `quiet` 的 `replace` 段里只要有空格 / 换行，未悬停就先露出 `·` / `↵`，
 *     「平时不着色」的静默被字形本身破了。
 *
 * 现在只把**看得出边界的空白**换掉：
 *   - 整段没有可见字符（一道多余缝隙、一个空行、一整行纯空格）→ 全换；
 *   - 有可见字符时只换首尾的空白 → `10 20` 原样，`10 ` 变成 `10·`（尾随空格才是指认对象）；
 *   - `quiet` 段**一个字都不换**：它靠悬停时的下划线出现，换字形就等于提前泄露。
 */
function markText(text, quiet) {
  if (quiet) return text
  if (!/\S/.test(text)) return showBlank(text)
  return text.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, (chunk) => showBlank(chunk))
}

/**
 * 把一段文本按标记切成片段，供 `<pre>` 逐段渲染。
 *
 * **没有一段能画出来时返回 `null`**（2026-11-09 深夜修）：旧版不论如何都会 push 一段
 * `kind: null` 的全文，于是返回值永远是真值数组。调用方拿「有没有数组」当闸门，就会在
 * 「标记全被 `limit` 裁掉」或「这一侧本来就没有标记」时误判 —— EXPECTED 被拴进只读
 * `<pre>`、ACTUAL 又被 `is-diffed` 撤掉了 `--fail-soft` 兜底红字，结果是「判了 WA、
 * 一个字没染、还长得跟 AC 一样」。
 *
 * @param {string} text 要渲染的那一份文本（通常就是框里显示的原文）
 * @param {Array<{from: number, to: number, kind: string, pair?: number, quiet?: boolean}>} marks
 *   原文的绝对偏移，左闭右开
 * @param {number|null} [limit] 只在这个下标之前标记（截断显示时传前缀长度；默认整段）
 * @returns {Array<{text: string, kind: string|null, pair?: number, quiet?: boolean}>|null}
 *   `kind` 为 `null` 的是原样正文；`null` = 这段文本一个字都不用染
 */
export function markSegments(text, marks, limit = null) {
  const src = String(text ?? '')
  const cap = limit === null ? src.length : Math.max(0, Math.min(src.length, limit))
  const list = (marks ?? [])
    .map((mark) => ({
      from: Math.max(0, Math.min(mark.from, cap)),
      to: Math.max(0, Math.min(mark.to, cap)),
      kind: mark.kind,
      pair: mark.pair,
      quiet: Boolean(mark.quiet),
    }))
    .filter((mark) => mark.to > mark.from)
    .sort((x, y) => x.from - y.from)

  if (!list.length) return null

  const out = []
  let at = 0
  for (const mark of list) {
    // 理论上不会重叠（每个单位只产一段），真重叠了就跳过后面那段，别把 DOM 切乱
    if (mark.from < at) continue
    if (mark.from > at) out.push({ text: src.slice(at, mark.from), kind: null })
    out.push({
      text: markText(src.slice(mark.from, mark.to), mark.quiet),
      kind: mark.kind,
      pair: mark.pair,
      quiet: mark.quiet,
    })
    at = mark.to
  }
  if (at < src.length) out.push({ text: src.slice(at), kind: null })
  return out
}

/**
 * 追加一段标记。零宽区间直接丢掉（画不出来，`<span>` 里也没有字形可染）。
 *
 * 这里**不做相邻合并**：往同一个数组推标记的每一处（`markPair` 的两侧、`markRest`、
 * `lineRange`）都带一个新编号，同一个数组里不可能出现「同号且首尾相接」的两段；
 * 而不同编号的两段即使挨着也不能并 —— 并了悬停就会一起亮。真要能合并，得先有
 * 「同号多段」这种产出，等出现了再加。
 */
function pushMark(list, from, to, kind, pair, quiet = false) {
  if (!(to > from)) return
  list.push({ from, to, kind, pair, quiet })
}

/** 「第几处差异」的编号器。两侧共用一个计数器，所以同一个号在对侧一定能找到对应段 */
function pairGen() {
  let n = 0
  return () => {
    n += 1
    return n
  }
}

/**
 * 排序 + 按 `pair` 截断（排序是 `markSegments` 的前提）。
 *
 * **不能按数组长度截**：`extra` 只进 `got`、`missing` 只进 `want`，两侧下标天然不对齐。
 * 假设前 120 处都是 got 单侧的 `extra`（`want` 空），第 121 处才是 `replace` ——
 * 各截 120 段之后，got 里的 121 被丢掉、want 里的 121 却是第一段被留下，悬停时就只剩半边亮。
 * 按编号截是「同一处要么两侧都在、要么两侧都丢」。代价是最多 240 段（每侧 120）。
 */
function tidy(list) {
  const kept = list.filter((mark) => mark.pair <= MAX_MARKS)
  kept.sort((x, y) => x.from - y.from)
  return kept
}

/**
 * 两段文本的公共前后缀长度：`p` = 从第几个字符开始不同，`s` = 末尾多少个字符相同。
 *
 * `s < max - p` 那条是**防重叠**的：不加的话 `abbb` / `abb` 会同时求到 p=3、s=2，
 * 右侧边界跑到左侧边界前面去。加上之后两者之和不超过较短的那一段，
 * 只是「较短串是较长串的前缀」时较短那一侧会得到零宽区间 —— 那种情况由 `diffEdges`
 * 的边界吸附把切点推回词首 / 词尾，两侧一起标成 replace（见那里的注释）。
 */
function commonEdges(a, b) {
  const max = Math.min(a.length, b.length)
  let p = 0
  while (p < max && a[p] === b[p]) p += 1
  let s = 0
  while (s < max - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s += 1
  return { p, s }
}

/** `index` 是不是一个词元边界（两侧至少有一边是空白），即「切在这里不会把词切开」 */
function isBoundary(text, index) {
  if (index <= 0 || index >= text.length) return true
  return /\s/.test(text[index - 1]) || /\s/.test(text[index])
}

/**
 * 公共前后缀 + **词元边界吸附**。
 *
 * 纯字符级裁剪会把词切开：`1 100800 3` vs `1 100000 3` 只染中间那个 `8`
 * （`100[8]00`），`Impossible` vs `Possible` 只染词首 `Imp`。数字和单词在算法题里是
 * 原子语义单位，标半个反而让人以为只错了那一位。所以切点落在词元内部时，把边界推到
 * 词元外沿 —— 但吸附后整段超过 `INLINE_CHARS` 就放弃（构造题里 50 位的 01 串不该整条变色）。
 *
 * **只有两侧的差异段都是零宽时**才直接返回（那时确实没东西可标）。历史上一版写的是
 * `gotEnd <= p` 单边短路，本意是「整段漏掉时不吸附」，但它同时挡住了「实际是期望的前缀」
 * 这一整类：`100` 对 `1000` 时 p=3、gotEnd=3，短路让吸附一步都走不动，于是实际侧
 * 一个字都不标、只在期望侧染个 `missing` 的 `0` —— 多一位数字标 replace、少一位实际框全白，
 * 同一个错误两侧不对称。`1.5` 对 `1.50001`（float 档）同理：数值算错了，却被说成「漏打了 0001」。
 * 现在两边都零宽才返回，`100` / `1000` 会吸附成整词 replace，与「`1000` / `100`」一致。
 */
function diffEdges(a, b) {
  const { p, s } = commonEdges(a, b)
  const gotEnd = a.length - s
  const wantEnd = b.length - s
  if (gotEnd <= p && wantEnd <= p) return { p, s }

  let left = p
  let extra = 0
  while (left > 0 && (!isBoundary(a, left) || !isBoundary(b, left))) left -= 1
  while (
    (gotEnd + extra < a.length && !isBoundary(a, gotEnd + extra)) ||
    (wantEnd + extra < b.length && !isBoundary(b, wantEnd + extra))
  ) {
    extra += 1
  }
  // 吸附会把右侧公共段吃回去，吃穿了就不是「吸附」而是另一种切法了
  if (extra > s) return { p, s }
  const gotLen = gotEnd + extra - left
  const wantLen = wantEnd + extra - left
  if (Math.max(gotLen, wantLen) > INLINE_CHARS) return { p, s }
  return { p: left, s: s - extra }
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
 * 按行切，并带上每行在**原文**里的偏移与行号。
 *
 * 行内容的口径与 `compare.js` 的 `normalizeLines` 一字不差（行尾空白抹掉、末尾空行丢弃），
 * 但**偏移必须基于原文**：界面拿标记去切的是 `<pre>` 里那段原文，一旦这里按 `\r\n` → `\n`
 * 之后的字符串算偏移，实际输出里每出现一个 `\r`，标记就会往前错一位。
 *
 * `text` 是**裁掉行尾空白之后**的内容，`end` 随之落在最后一个有意义字符之后 ——
 * 行尾那几个空格既不参与逐行比对，也不会被标出来。
 */
function readLines(text) {
  const src = String(text ?? '')
  const lines = []
  const breaks = /\r\n|\r|\n/g
  // `brk` = 结束这一行的那串换行有多长。空行本身没有字符可染，标记只能落在它后面那个换行上
  // （`[] 与 [1]` 的多重集差就是一个空行，这是唯一能指出去的位置）。
  // `rawEnd` = 抹掉行尾空白**之前**的结束位置 —— 「只有空格的一行」（`"   \n"`）裁完是空行，
  // 但它的换行在下标 3 而不是 0，光靠 `start + brk` 会标到第一个空格上去。
  const push = (start, end, brk) => {
    const body = src.slice(start, end).replace(/[ \t]+$/, '')
    lines.push({ text: body, start, end: start + body.length, rawEnd: end, brk, line: lines.length + 1 })
  }
  let from = 0
  let match
  while ((match = breaks.exec(src))) {
    push(from, match.index, match[0].length)
    from = match.index + match[0].length
  }
  push(from, src.length, 0)
  while (lines.length && lines[lines.length - 1].text === '') lines.pop()
  return lines
}

/**
 * 一整行的标记区间；空行退到它后面那个换行（否则零宽，画不出来）。
 * 换行的位置从 `rawEnd` 算 —— 行尾空白虽然不参与比对，但「这一行的换行」在原文里确实在它之后。
 */
function lineRange(line) {
  const to = line.end > line.start ? line.end : line.rawEnd + line.brk
  return [line.start, to]
}

/**
 * 按空白切词元，`base` 是这段文本在原文里的起始偏移。
 * 行内比对传行的起点，全局比对传 0 —— 两种口径共用一份切法，界面拿到的都是原文偏移。
 */
function tokensOf(text, base = 0) {
  const units = []
  const re = /\S+/g
  let match
  while ((match = re.exec(text))) {
    const start = base + match.index
    units.push({ text: match[0], start, end: start + match[0].length })
  }
  return units
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
 * 一对**已经按位置配上**的单位（同一行里的第 k 个词 / 全局第 k 个词）该标哪几个字符。
 *
 * 这是全文件唯一产出 `replace` / `extra` / `missing` 的地方。传进来的两个位置天然对齐，
 * 所以这里不再判断「谁该配谁」，只回答「这一对里哪几个字符不一样」：
 *
 * - 两边都有差异字符 → 同一个 pair（期望侧那份带 quiet，平时不着色）
 * - 只有实际侧有      → extra（多敲的）
 * - 只有期望侧有      → missing（漏了的，落在期望侧才有字可染）
 *
 * `same` 让 float 那一支用带容差的相等判定（容差内的数字不算差异）。
 */
function markPair(gotMarks, wantMarks, a, b, nextPair, same = (x, y) => x === y) {
  if (same(a.text, b.text)) return
  const { p, s } = diffEdges(a.text, b.text)
  const aEnd = a.text.length - s
  const bEnd = b.text.length - s
  if (aEnd > p && bEnd > p) {
    const pair = nextPair()
    pushMark(gotMarks, a.start + p, a.start + aEnd, 'replace', pair)
    pushMark(wantMarks, b.start + p, b.start + bEnd, 'replace', pair, true)
  } else if (aEnd > p) {
    pushMark(gotMarks, a.start + p, a.start + aEnd, 'extra', nextPair())
  } else if (bEnd > p) {
    pushMark(wantMarks, b.start + p, b.start + bEnd, 'missing', nextPair())
  }
}

/** 配不上的尾巴：多出来的单位整段标黄（实际多 → 实际侧，期望多 → 期望侧） */
function markRest(gotMarks, wantMarks, gotUnits, wantUnits, from, nextPair) {
  for (let k = from; k < gotUnits.length; k += 1) {
    pushMark(gotMarks, gotUnits[k].start, gotUnits[k].end, 'extra', nextPair())
  }
  for (let k = from; k < wantUnits.length; k += 1) {
    pushMark(wantMarks, wantUnits[k].start, wantUnits[k].end, 'missing', nextPair())
  }
}

/**
 * 一行里第 `k` 道缝隙：`k` 个词元把一行切成 `k + 1` 段空白（含行首、行尾）。
 * `k = 0` 是第一个词之前，`k = tokens.length` 是最后一个词之后。
 */
function gapOf(line, tokens, k) {
  const from = k === 0 ? line.start : tokens[k - 1].end
  const to = k === tokens.length ? line.end : tokens[k].start
  return { text: line.text.slice(from - line.start, to - line.start), start: from }
}

/**
 * 逐行：**第 i 行只跟第 i 行比，行内第 k 个词只跟第 k 个词比**（2026-11-09 用户口径）。
 *
 * 期望 `1 / 2 / 3`、实际只有一行 `2` 时，跨位置找配对会把那个 `2` 对到第 2 行，于是报
 * 「缺第 1 行、缺第 3 行」—— 等于告诉用户「你恰好对了第二行」，而该说的是
 * 「第一行就错了，后面两行没输出」。行号本身是有意义的位置，所以固定 i ↔ i。
 *
 * 行内同理：`1 2 3` 对 `2 3` 时，第 1 个词 `1` 对第 1 个词 `2`（不一致），第 2 个词对第 2 个
 * 词（`2` 对 `3`，不一致），第 3 个词只有期望侧有（少了）。旧实现靠公共后缀把 `2 3` 整段
 * 对上，只报「多了个 1」—— 位置对上了，说的却不是同一件事。
 *
 * 代价（与「行按行号配」同源，用户已确认接受）：实际多插一个词时，后面每个词都标成不一致。
 *
 * 两个例外：
 *   - **一侧是空行**（`\n10 20` 对 `10 20`）：空行切不出词元，按词配会一个标记都不落在
 *     那一侧 —— 真正的罪魁祸首（那个多出来的空行）毫无高亮，反而是下一行正确的 `10 20`
 *     被标成多出。所以整行落标，空行退到它的换行上。
 *   - **词元序列完全相同、只差间距**（`1  2` 与 `1 2`）：元素位置没动，只比词间那几道缝隙。
 *     不能对整行掐一次前后缀 —— 头尾各多一个空格时，`p` 停在第一处、`s` 停在最后一处，
 *     中间完全正确的 ` 2 3 4 5 ` 会被整段吞进去，一行从头红到尾。
 */
function lineMarks(got, want) {
  const gotLines = readLines(got)
  const wantLines = readLines(want)
  const gotMarks = []
  const wantMarks = []
  const nextPair = pairGen()
  const shared = Math.min(gotLines.length, wantLines.length)

  for (let i = 0; i < shared; i += 1) {
    const a = gotLines[i]
    const b = wantLines[i]
    if (a.text === b.text) continue

    if (!a.text || !b.text) {
      const pair = nextPair()
      if (a.text) {
        // 期望这边是空行、实际有内容：多出来的那一行
        pushMark(gotMarks, ...lineRange(a), 'extra', pair)
      } else {
        // 该有内容的地方实际是空的：实际侧的红落在那个换行上（`showBlank` 显示成 ↵），
        // 期望侧的正文按「少了」标黄，两侧共用编号，悬停能互相点亮
        pushMark(gotMarks, ...lineRange(a), 'replace', pair)
        pushMark(wantMarks, ...lineRange(b), 'missing', pair)
      }
      continue
    }

    const aTokens = tokensOf(a.text, a.start)
    const bTokens = tokensOf(b.text, b.start)
    if (aTokens.length === bTokens.length && aTokens.every((token, k) => token.text === bTokens[k].text)) {
      for (let k = 0; k <= aTokens.length; k += 1) {
        markPair(gotMarks, wantMarks, gapOf(a, aTokens, k), gapOf(b, bTokens, k), nextPair)
      }
      continue
    }
    const paired = Math.min(aTokens.length, bTokens.length)
    for (let k = 0; k < paired; k += 1) {
      markPair(gotMarks, wantMarks, aTokens[k], bTokens[k], nextPair)
    }
    markRest(gotMarks, wantMarks, aTokens, bTokens, paired, nextPair)
  }
  // 多出来的行 / 没打出来的行，整行标满（空行走 lineRange，退到后面那个换行上）
  for (let i = shared; i < gotLines.length; i += 1) {
    pushMark(gotMarks, ...lineRange(gotLines[i]), 'extra', nextPair())
  }
  for (let i = shared; i < wantLines.length; i += 1) {
    pushMark(wantMarks, ...lineRange(wantLines[i]), 'missing', nextPair())
  }
  return { got: gotMarks, want: wantMarks }
}

/**
 * 词元：**第 k 个词对第 k 个词**（`tokens` / `float` 共用，`same` 决定数字是否按容差比）。
 *
 * 这里不再做 LCS：多一个词时 LCS 会把后面整体前移救回来，代价是「第几个词」被悄悄改掉，
 * 高亮落点在别的词上。位置即含义，配不上的一律挂尾巴。
 */
function tokenMarks(got, want, same) {
  const gotTokens = tokensOf(got)
  const wantTokens = tokensOf(want)
  const gotMarks = []
  const wantMarks = []
  const nextPair = pairGen()
  const paired = Math.min(gotTokens.length, wantTokens.length)
  for (let k = 0; k < paired; k += 1) {
    markPair(gotMarks, wantMarks, gotTokens[k], wantTokens[k], nextPair, same)
  }
  markRest(gotMarks, wantMarks, gotTokens, wantTokens, paired, nextPair)
  return { got: gotMarks, want: wantMarks }
}

/**
 * 严格逐字符：掐掉公共前后缀，只标中间那一块。
 *
 * 「多了一个换行 / 一个空格」在这一支是最常见的 WA，而它们本身没有字形 ——
 * 交给 `showBlank` 换成 `·` / `⇥` / `↵`，否则染了色也看不见。
 */
function strictMarks(got, want) {
  const a = normalizeNewlines(got)
  const b = normalizeNewlines(want)
  if (a === b) return { got: [], want: [] }

  const { p, s } = commonEdges(a, b)
  const aEnd = a.length - s
  const bEnd = b.length - s
  const gotMarks = []
  const wantMarks = []
  const nextPair = pairGen()
  // 比较在归一化文本上做，标记却要落在原文：不换算的话，实际输出里每出现一个 `\r`，
  // 标记就往前错一位（`a\r\nb` vs `a\nc` 会标到换行上而不是那个 `b`）。
  if (aEnd > p && bEnd > p) {
    const pair = nextPair()
    pushMark(gotMarks, toRawIndex(got, p), toRawIndex(got, aEnd), 'replace', pair)
    pushMark(wantMarks, toRawIndex(want, p), toRawIndex(want, bEnd), 'replace', pair, true)
  } else if (aEnd > p) {
    pushMark(gotMarks, toRawIndex(got, p), toRawIndex(got, aEnd), 'extra', nextPair())
  } else if (bEnd > p) {
    pushMark(wantMarks, toRawIndex(want, p), toRawIndex(want, bEnd), 'missing', nextPair())
  }
  return { got: gotMarks, want: wantMarks }
}

/**
 * 忽略行序：行内容当多重集比。多的行在实际侧标黄，少的行在期望侧标黄 ——
 * 没有「第几行」的概念，因为顺序本来就不参与比对。
 */
function unorderedMarks(got, want) {
  const gotLines = readLines(got)
  const wantLines = readLines(want)
  /** text → 该内容在两侧出现的行 */
  const buckets = new Map()
  const bucketOf = (key) => {
    if (!buckets.has(key)) buckets.set(key, { want: [], got: [] })
    return buckets.get(key)
  }
  wantLines.forEach((line) => bucketOf(line.text).want.push(line))
  gotLines.forEach((line) => bucketOf(line.text).got.push(line))

  const gotMarks = []
  const wantMarks = []
  const nextPair = pairGen()
  for (const bucket of buckets.values()) {
    const delta = bucket.got.length - bucket.want.length
    if (delta > 0) {
      for (let i = 0; i < delta; i += 1) {
        const line = bucket.got[bucket.want.length + i]
        if (line) pushMark(gotMarks, ...lineRange(line), 'extra', nextPair())
      }
    } else if (delta < 0) {
      for (let i = 0; i < -delta; i += 1) {
        const line = bucket.want[bucket.got.length + i]
        if (line) pushMark(wantMarks, ...lineRange(line), 'missing', nextPair())
      }
    }
  }
  return { got: gotMarks, want: wantMarks }
}

/**
 * 算一次差异。
 *
 * @param {string} actual 程序标准输出
 * @param {string} expected 期望输出
 * @param {string} [checkerId] 与判定同一套 id（services/checkers.js）
 * @returns {{ got: Array<{from: number, to: number, kind: string, pair: number, quiet: boolean}>,
 *   want: Array<object> } | null}
 *   `null` = 这个比对方式下两段输出等价（没什么可标的）
 */
export function diffOutput(actual, expected, checkerId = DEFAULT_CHECKER_ID) {
  const id = isCheckerId(checkerId) ? checkerId : DEFAULT_CHECKER_ID
  const got = String(actual ?? '')
  const want = String(expected ?? '')

  // 太长：切表 / 建表的代价不再值得，直接不给标记（框里那段本来也是截断显示）
  if (got.length > MAX_CHARS || want.length > MAX_CHARS) return null

  // 逐行是最容易「算出来没差异、判定却是 WA」的一支（前处理有两处容易写歪：
  // 行尾空白与末尾空行）。先用判定那支的同一份 normalizeLines 对一次账：
  // 真等价就什么都不标，省得界面指着一模一样的两段文本说「不同」。
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
      result = strictMarks(got, want)
      break
    case 'tokens':
      result = tokenMarks(got, want, (x, y) => x === y)
      break
    case 'float':
      result = tokenMarks(got, want, tokenEquals)
      break
    case 'unordered':
      result = unorderedMarks(got, want)
      break
    default:
      result = lineMarks(got, want)
  }

  const gotMarks = tidy(result.got)
  const wantMarks = tidy(result.want)
  return gotMarks.length || wantMarks.length ? { got: gotMarks, want: wantMarks } : null
}
