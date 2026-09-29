/**
 * mdFormat —— 题解工具栏的纯变换层。
 *
 * 只做一件事：给定全文与若干选区（**绝对字符偏移**），算出「改哪里、改成什么、光标落到哪」。
 * 不碰 Monaco、不碰 DOM，所以每条变换都能脱离编辑器单独验；更重要的是「开关语义」
 * （同一个按钮按第二次该退回原样）在这里一处说清，不用在十几个按钮回调里各写一遍。
 *
 * 【为什么写偏移而不是行列】行列要带 lineStarts 来回换算，变换本身却只关心字符串位置；
 * 换算留给调用方（EditorPane 用 model.getOffsetAt / getPositionAt 各转一道）更省心。
 *
 * 【回位口径】
 * - 包起来那类（加粗 / 斜体 / 删除线 / 行内代码 / 公式）：没选区就插入占位文案并**选中占位文案**，
 *   接着打字正好替换掉；有选区就把 marker 加在外侧、选区留在内容上，连按两次即原样退回。
 * - 行级那类（标题 / 引用 / 列表）：把选区铺到整行，逐行加前缀；再按一次脱前缀。
 * - 插入那类（表格 / 分割线）：光标落到插入内容之后（表格额外选中第一格，方便直接改名）。
 */
import { t } from '../i18n/index.js'

/** 行内包裹类：marker 与无选区时的占位文案 key */
const WRAP = {
  bold: { marker: '**', phKey: 'app.md.tool.ph.bold' },
  italic: { marker: '*', phKey: 'app.md.tool.ph.italic' },
  strike: { marker: '~~', phKey: 'app.md.tool.ph.strike' },
  code: { marker: '`', phKey: 'app.md.tool.ph.code' },
  math: { marker: '$', phKey: 'app.md.tool.ph.math' },
}

/**
 * 行级前缀开关。
 * test 必须锚在行首；`add` 收「本次要加前缀的第几行」（有序列表要编号），不用编号就给字符串。
 */
const LINE = {
  heading: { test: /^#{1,6} /, add: '## ' },
  quote: { test: /^> ?/, add: '> ' },
  list: { test: /^[-*+] /, add: '- ' },
  orderedList: { test: /^\d+\. /, add: (index) => `${index + 1}. ` },
}

/**
 * 工具栏按钮的编排：一层是一组，组间画竖线。
 * 键名一身三职 —— 动作名、AppIcon 的图标名、i18n 的 `app.md.tool.<键>`，改名要一起动。
 */
export const MD_TOOL_GROUPS = [
  ['bold', 'italic', 'strike', 'code'],
  ['heading', 'quote', 'list', 'orderedList', 'codeBlock'],
  ['link', 'image', 'math', 'table', 'hr'],
]

/**
 * 每条动作的键位，写法与 useShortcutManager 内部那一套完全一致
 * （`Mod+Ctrl+Alt+Shift+<KeyboardEvent.code>`，见那边的文件头）。
 *
 * 【为什么这些键不登记进全局快捷键系统】那套表是「全应用一份、每台机器一份、用户可改」，
 * 而这几条只在题解里说得通 —— 在 .cpp 里按 ⌘K 冒出一个 Markdown 链接显然不对。
 * 所以它们注册进 Monaco，作用域交给 `editorLangId == markdown`（见 EditorPane 的
 * registerMarkdownActions）：同一台机器上，⌘K 在 .cpp 里仍可以被绑成别的动作。
 * 代价是这些键不可改、也不出现在设置面板的快捷键列表里 —— 键位写在工具栏的悬浮提示上。
 *
 * 【键位来源】对齐 VS Code / 洛谷 Markdown 编辑器的习惯。其中两条是「自私」的：
 * ⌘B 与全局的「收侧栏」、⌘⇧E 与全局的「翻侧栏面板」撞了同一个组合 —— 焦点在编辑器里
 * 时由编辑器优先（见 App.vue 的 onKeydown），否则那两条题解键永远收不到按键。
 */
export const MD_SHORTCUTS = {
  bold: 'Mod+KeyB',
  italic: 'Mod+KeyI',
  strike: 'Mod+Shift+KeyX',
  code: 'Mod+Shift+KeyE',
  heading: 'Mod+Shift+KeyH',
  quote: 'Mod+Shift+KeyQ',
  list: 'Mod+Shift+KeyU',
  orderedList: 'Mod+Shift+KeyO',
  codeBlock: 'Mod+Shift+KeyK',
  link: 'Mod+KeyK',
  image: 'Mod+Shift+KeyP',
  math: 'Mod+Shift+KeyM',
  table: 'Mod+Alt+KeyT',
  hr: 'Mod+Alt+KeyR',
}

/**
 * 把动作＋当前全文＋选区换算成一批编辑与一批新选区。
 * @param {string} action MD_TOOL_GROUPS 里的某个动作名
 * @param {string} text 当前全文
 * @param {Array<{ start: number, end: number }>} ranges 选区（偏移，可多段；已按 start 升序）
 * @param {{ label?: string, url?: string }} [options] 链接 / 图片要的附加信息
 * @returns {{ edits: Array<{ start: number, end: number, text: string }>, selections: Array<{ start: number, end: number }> } | null}
 *          认不出的动作返回 null；edits 已升序且互不重叠，可直接喂给 editor.executeEdits
 */
export function formatMarkdown(action, text, ranges, options = {}) {
  const covered = ranges.length ? ranges : [{ start: 0, end: 0 }]
  if (action in WRAP) {
    const { marker, phKey } = WRAP[action]
    return combine(covered.map((range) => wrapRange(text, range, marker, t(phKey))))
  }
  if (action in LINE) return toggleLinePrefix(text, covered, LINE[action])
  if (action === 'codeBlock') return fenceBlock(text, covered[0])
  if (action === 'table') return insertTable(text, covered[0])
  if (action === 'hr') return insertAt(text, covered[0], '---\n', 0)
  if (action === 'link' || action === 'image') return insertLink(text, covered[0], options, action === 'image')
  return null
}

/**
 * 工具栏右端那行「N 字 · M 行」。
 * 字数据**不含空白**算：题解里换行与缩进是排版手段，不该算进篇幅。
 * @param {string} text
 */
export function markdownStats(text) {
  return {
    chars: (text ?? '').replace(/\s/g, '').length,
    lines: text ? text.split('\n').length : 0,
  }
}

/* ------------------------------------------------------------------ 各动作实现 */

/** 行内包裹 / 拆包（单段选区）。返回的 edits 已保证互不重叠 */
function wrapRange(text, range, marker, placeholder) {
  const { start, end } = range
  const inner = text.slice(start, end)

  if (!inner) {
    // 光标正卡在一对 marker 当中（`**|**`，把占位文案删掉就是这个样子）：再按一次即拆掉
    const before = text.slice(Math.max(0, start - marker.length), start)
    const after = text.slice(start, start + marker.length)
    if (before === marker && after === marker) {
      return {
        edits: [{ start: start - marker.length, end: start + marker.length, text: '' }],
        selections: [{ start: start - marker.length, end: start - marker.length }],
      }
    }
    return {
      edits: [{ start, end, text: marker + placeholder + marker }],
      selections: [{ start: start + marker.length, end: start + marker.length + placeholder.length }],
    }
  }

  // 选区正好卡在一对同类 marker **内侧**（`**|粗|**`，也就是本功能插完占位符的样子）：
  // 再按一次就该拆掉，而不是在外面再套一层变成 `****粗****`
  const outerBefore = text.slice(Math.max(0, start - marker.length), start)
  const outerAfter = text.slice(end, end + marker.length)
  if (outerBefore === marker && outerAfter === marker) {
    return {
      edits: [
        { start: start - marker.length, end: start, text: '' },
        { start: end, end: end + marker.length, text: '' },
      ],
      selections: [{ start: start - marker.length, end: end - marker.length }],
    }
  }

  // 选区自己就带着一对同类 marker（`**粗**` 整段被选中）：脱掉
  if (inner.length > marker.length * 2 && inner.startsWith(marker) && inner.endsWith(marker)) {
    const body = inner.slice(marker.length, -marker.length)
    return { edits: [{ start, end, text: body }], selections: [{ start, end: start + body.length }] }
  }

  return {
    edits: [{ start, end, text: marker + inner + marker }],
    selections: [{ start: start + marker.length, end: start + marker.length + inner.length }],
  }
}

/** 行级前缀：整段都带前缀就全脱掉，否则给缺的那些补上 */
function toggleLinePrefix(text, ranges, { test, add }) {
  const starts = lineStarts(text)
  const lines = []
  for (const range of ranges) {
    const last = lastLineOf(starts, range)
    for (let index = lineOf(starts, range.start); index <= last; index += 1) {
      if (!lines.includes(index)) lines.push(index)
    }
  }
  lines.sort((a, b) => a - b)

  const prefixed = (index) => test.test(text.slice(starts[index]))
  const strip = lines.every(prefixed)
  const edits = []
  let added = 0
  for (const index of lines) {
    const from = starts[index]
    if (strip) {
      const matched = test.exec(text.slice(from))[0]
      edits.push({ start: from, end: from + matched.length, text: '' })
    } else if (!prefixed(index)) {
      const prefix = typeof add === 'function' ? add(added) : add
      added += 1
      edits.push({ start: from, end: from, text: prefix })
    }
  }
  return { edits, selections: selectionsThrough(ranges, edits) }
}

/** 围栏代码块：拿选区铺到的整行当内容，两侧各补一行 ``` */
function fenceBlock(text, range) {
  const starts = lineStarts(text)
  const from = lineOf(starts, range.start)
  const to = lastLineOf(starts, range)
  const open = starts[from]
  const close = lineEnd(text, starts, to)
  const cursor = open + 4

  if (open === close) {
    // 空行上按代码块：一次插入，省得两个编辑落在同一偏移上打架
    return { edits: [{ start: open, end: open, text: '```\n\n```' }], selections: [{ start: cursor, end: cursor }] }
  }
  return {
    edits: [
      { start: open, end: open, text: '```\n' },
      { start: close, end: close, text: '\n```' },
    ],
    selections: [{ start: cursor, end: cursor }],
  }
}

function insertTable(text, range) {
  const head = t('app.md.tool.tableHead')
  const cell = t('app.md.tool.tableCell')
  const body = `| ${head} | ${head} |\n| --- | --- |\n| ${cell} | ${cell} |\n`
  // 选中第一格，接着打字就是改表头
  return insertAt(text, range, body, 2, head.length)
}

/**
 * 插一段块级内容。
 * 前面补齐到「空行」为止：`---` 紧跟在文字下面会被当成 setext 标题（上一行变 h2），
 * 表格同样不能打断段落，两者都要求前面有一个真正的空行。
 */
function insertAt(text, range, body, selectOffset, selectLength = 0) {
  const before = text.slice(0, range.start)
  const gap = blankGap(before)
  const at = range.start + gap.length
  const start = at + selectOffset
  return {
    edits: [{ start: range.start, end: range.start, text: gap + body }],
    selections: [{ start, end: start + selectLength }],
  }
}

/** 链接 / 图片：label 优先用输入框，其次用选中的文字，最后退回地址本身 */
function insertLink(text, range, { label, url }, image) {
  const inner = text.slice(range.start, range.end)
  const body = `${image ? '!' : ''}[${label || inner || url}](${url})`
  const end = range.start + body.length
  // 光标落在整段之后：地址是刚填的，接着要写的通常是下一句话
  return { edits: [{ start: range.start, end: range.end, text: body }], selections: [{ start: end, end }] }
}

/* ------------------------------------------------------------------ 小工具 */

/**
 * offset 所在行的起始偏移表（第 i 项即第 i 行行首）。
 * 末尾若以 '\n' 收尾会多出最后那个空行的行首，与编辑器里看到的空行一致。
 */
function lineStarts(text) {
  const starts = [0]
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\n') starts.push(index + 1)
  }
  return starts
}

/** 行号 → 行首偏移 */
function lineOf(starts, offset) {
  let low = 0
  let high = starts.length - 1
  while (low < high) {
    const mid = (low + high + 1) >> 1
    if (starts[mid] <= offset) low = mid
    else high = mid - 1
  }
  return low
}

/**
 * 选区覆盖到的**最后一行**。
 * 选区正好停在某行行首时那一行不算在内——这与编辑器里「选中到行尾、下一行/光标不在选区内」
 * 的观感一致，也是各家 Markdown 编辑器的通行口径。
 */
function lastLineOf(starts, range) {
  const last = lineOf(starts, range.end)
  return last > 0 && range.end === starts[last] && range.end > range.start ? last - 1 : last
}

/** 要让插入点前面凑出一个空行，还差几个换行（开头与已经空行的情况都不差） */
function blankGap(before) {
  if (before === '' || before.endsWith('\n\n')) return ''
  return before.endsWith('\n') ? '\n' : '\n\n'
}

/** 第 index 行的末尾偏移（不含它自己的换行符） */
function lineEnd(text, starts, index) {
  return index + 1 < starts.length ? starts[index + 1] - 1 : text.length
}

/**
 * 把若干段各自算出的编辑与选区并成一份（行内包裹类要多光标各包各的）。
 * 每段算的都是**改自己那一段之前**的坐标，所以从第二段起要按前面几段的净位移挪一下 ——
 * 不挪的话多光标下第二处之后的光标会全部落在原地（前面插进去的 marker 把它顶偏了）。
 */
function combine(parts) {
  const edits = []
  const selections = []
  let delta = 0
  for (const part of parts) {
    selections.push(...part.selections.map((selection) => ({ start: selection.start + delta, end: selection.end + delta })))
    for (const edit of part.edits) {
      edits.push(edit)
      delta += edit.text.length - (edit.end - edit.start)
    }
  }
  return { edits: edits.sort((a, b) => a.start - b.start), selections }
}

/** 让选区穿过一批编辑活下来（行级、插入类都靠它，省得每处各推一遍位移） */
function selectionsThrough(ranges, edits) {
  return ranges.map((range) => ({ start: mapOffset(range.start, edits), end: mapOffset(range.end, edits) }))
}

/** 单个偏移穿过一批（升序、互不重叠的）编辑后的新位置；落在编辑内部就夹到它的结果区间里 */
function mapOffset(offset, edits) {
  let delta = 0
  for (const edit of edits) {
    if (offset >= edit.end) {
      delta += edit.text.length - (edit.end - edit.start)
      continue
    }
    if (offset > edit.start) return edit.start + delta + Math.min(offset - edit.start, edit.text.length)
    break
  }
  return offset + delta
}