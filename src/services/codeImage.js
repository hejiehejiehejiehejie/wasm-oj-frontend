/**
 * codeImage —— 选中代码 → PNG（Monaco 着色 + Canvas 绘制）。
 *
 * 唯一的消费点是编辑区的上下文菜单（composables/useEditorMenu.js 的「生成图片」）。
 *
 * 【配色：一律从编辑器现场采，不内置字典】
 * 用户口径 —— 编辑器里什么样，导出的图就得什么样。Monaco 把当前主题的一切都摊在页面上：
 *   · 每个 token 色写成一条 `.mtkN { color: … }` 规则注入样式表（N 就是它的 ColorId）；
 *   · 主题色写成 `--vscode-*` 自定义属性挂在 `.monaco-editor` 上
 *     （本站的两套自定义主题见 monaco-setup.js）。
 * 所以这里只读这两处，好处是换主题、以后给主题补 token 规则，导出的图自动跟着变，
 * 不用再维护一份会漂移的字典；坏处是必须先有 `.monaco-editor` 在页面上（编辑器一直都在，
 * 所以不成立问题），采不到时的兜底见 FALLBACK_COLORS。
 *
 * 【文本与颜色分两路取】
 * 文本走 `monaco.editor.tokenize`（给每个 token 的 offset，制表符原样保留）；
 * 颜色走 `monaco.editor.colorize`（给每个 token 的 class）。两者用的是同一个分词器，
 * token 一一对应。之所以不直接用 colorize 吐出来的 HTML 文本：它会把制表符按 tabSize
 * 展开成空格，缩进信息就没了（见 layoutLine 的 tab 停靠位）。
 * **不解析编辑区的 DOM**：那里只有可视范围内的行有节点，而且 span 是复用的，
 * 抄 DOM 既拿不全、又会拿到与当前 model 不一致的旧文本。
 *
 * 【画布尺寸：由固定字号算出，与编辑器、屏幕都无关】
 * 用户 2026-10-12 定的口径 —— 「不要用屏幕上的尺寸，换一个标准，不同的图片中字号要相同」。
 * 所以：字号是常量 EXPORT_FONT_SIZE（不吃编辑器的 fontSize、不吃 `--ui-scale`），
 * 行高是它的固定倍数，画布的逻辑尺寸就只由「代码有多少行、最长那行有多宽」决定；
 * 再乘质量档的倍率得到物理像素。**副作用是刻意的**：编辑器字号调得再大，导出的图
 * 里字都一样大；1x 屏与 2x 屏导出的图尺寸也一致（不再跟随 devicePixelRatio）。
 */
import { monaco } from '../monaco-setup.js'

/**
 * 画布四周的**透明**留白：卡片铺不满画布，多出来这一圈是给弥散阴影用的
 * （不留就会被画布边缘直接切断）。卡片本身的内边距在下面 CODE_PADDING_*。
 */
const MARGIN = 40
/** 卡片外圆角 */
const RADIUS = 12
/** 卡片顶部的窗口栏高度。只在画圆点时占位置 —— 关掉圆点它就塌掉，图更紧凑 */
const TITLE_BAR_HEIGHT = 40
/** macOS 三个圆点的直径 10（半径 5）。比系统的 12 小一档：按小样那版缩放后 12 偏抢眼 */
const DOT_RADIUS = 5
/** 圆点之间的 gap：6px（直径缩到 10 后 8 显得散） */
const DOT_GAP = 6
/** 圆点圆心距卡片左缘：窗口栏的 padding-left 16 + 半径 */
const DOT_INSET = 16
/** 代码区的内边距（上 / 右 / 下 / 左） */
const CODE_PADDING_TOP = 20
const CODE_PADDING_RIGHT = 32
const CODE_PADDING_BOTTOM = 30
const CODE_PADDING_LEFT = 32
/**
 * 关掉窗口栏圆点时，标题栏会整条塌掉，代码区顶上只剩 CODE_PADDING_TOP 那点留白，
 * 看着比「有圆点」那版明显空 —— 所以这一档单独放宽（用户 2026-10-12 定的口径）。
 */
const CODE_PADDING_TOP_NO_DOTS = 32
/** 三点配色（红 / 黄 / 绿），取 macOS 的标准值 */
const DOT_COLORS = ['#FF5F57', '#FEBC2E', '#28C840']
/** 彩色括号认哪几对。与 Monaco 的语言配置同口径：`<>` 不算括号 */
const BRACKET_PAIRS = { '(': ')', '[': ']', '{': '}' }
/** 主题里括号色的档数（`--vscode-editorBracketHighlight-foreground1..6`） */
const BRACKET_COLOR_COUNT = 6
/**
 * 弥散阴影（对应 CSS 的 `0 20px 60px`）。
 * ⚠️ Canvas 的 shadowBlur / shadowOffset 走**设备像素**、不吃 ctx.scale，
 * 所以下面要自己乘一遍倍率，否则 3 倍导出时阴影只有 1/3 大。
 */
const SHADOW_OFFSET_Y = 20
const SHADOW_BLUR = 60
/** 阴影浓度：深底按小样那档，浅底压淡（浅色卡片挂 0.4 的黑影太脏） */
const SHADOW_COLOR = { dark: 'rgba(0, 0, 0, 0.4)', light: 'rgba(0, 0, 0, 0.18)' }
/** 制表符宽度（列）的兜底值：调用方没给（纯 UI 之外的调用）时与编辑器的默认缩进同口径 */
const DEFAULT_TAB_SIZE = 4

/**
 * 导出图里代码**固定用这个字号**（px）。刻意不跟随编辑器的 fontSize ——
 * 否则各人字号设置不同、导出去的图里字大小就不一样，拼在一处对比时很别扭。
 * 值取编辑器默认字号那一档，观感与站内一致。
 */
const EXPORT_FONT_SIZE = 14
/** 行高 = 字号 × 这个比例（向上取整），与编辑器默认的行高比例同口径 */
const EXPORT_LINE_HEIGHT_RATIO = 1.5

/**
 * 质量档 → 渲染倍率（画布 = 逻辑尺寸 × 倍率）。
 * PNG 无损、`toDataURL` 的质量参数会被忽略，所以「质量」只能是**清晰度**：倍率越高
 * 文字边缘越平滑、放大看越锐利，代价是文件越大、渲染越久。默认 'high'。
 */
const QUALITY_SCALES = { medium: 2, high: 3, ultra: 4 }
/** 认不出来的质量值（存档被手改过、旧值）落到这里 */
const DEFAULT_QUALITY = 'high'

/**
 * 行号栏与正文之间的留白。随字号走（VS Code 装订区同量级），小字号下不低于 12px ——
 * 否则数字会贴到代码上，看着像正文的一部分。
 */
function gutterGap(fontSize) {
  return Math.max(12, Math.round(fontSize * 1.5))
}

/** 默认等宽字体栈：调用方没给字体时兜底（与 editorOptions 的默认栈同口径） */
const FALLBACK_FONT = 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace'

/**
 * 采色失败时的兜底（页面里还没有 `.monaco-editor`、或主题的自定义属性缺项）。
 * 取 VS Code Dark+ 的那几个值，只保证「图还能看」，不是设计意图。
 */
const FALLBACK_COLORS = {
  background: '#1E1E1E',
  foreground: '#D4D4D4',
  lineNumber: '#6D6D72',
  border: '#E1E1E1',
}

/** 亮度超过这个值就算「浅底」，浅底卡片要补一条边才看得出边界（深色不必） */
const LIGHT_BACKGROUND_LUMINANCE = 0.6

/**
 * `#rgb` / `#rrggbb` / `rgb()` / `rgba()` → [r, g, b]，认不出来返回 null。
 * 主题色在自定义属性里是 hex、在样式表规则里是 `rgb()`，两种都得认。
 */
function parseColor(value) {
  const text = String(value ?? '').trim()
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text)
  if (hex) {
    const raw = hex[1]
    const full = raw.length === 3 ? raw.replace(/./g, (c) => c + c) : raw
    return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
    ]
  }
  const fn = /^rgba?\(([^)]+)\)$/i.exec(text)
  if (fn) {
    const parts = fn[1].split(/[\s,/]+/).filter(Boolean).map(Number)
    if (parts.length >= 3 && parts.every((n) => Number.isFinite(n))) return parts.slice(0, 3)
  }
  return null
}

/** 感知亮度（0–1）。只用来判「这张卡片是深底还是浅底」，精度要求不高 */
function luminance(value) {
  const rgb = parseColor(value)
  if (!rgb) return 0
  const [r, g, b] = rgb.map((channel) => channel / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * 「这个主题色是不是等于没给」—— 主题**没定义**某个颜色时，Monaco 会把变量填成
 * `rgba(0, 0, 0, 0)`（本站主题只给了 3 档括号色，第 4 档起读出来就是它）。
 * 拿透明去画等于把字画没，所以这里统一判成「无色」，调用方据此沿用原本的 token 色。
 * @param {string} value
 * @returns {string | null} 原样返回，或 null 表示不可用
 */
function opaqueColor(value) {
  const text = String(value ?? '').trim()
  if (!text) return null
  const fn = /^rgba?\(([^)]+)\)$/i.exec(text)
  if (fn) {
    const parts = fn[1].split(/[\s,/]+/).filter(Boolean).map(Number)
    if (parts.length >= 4 && Number.isFinite(parts[3]) && parts[3] < 0.05) return null
  }
  return text
}

/**
 * 「token 类名 → 颜色」表：扫一遍页面样式表的 `.mtkN` 规则就能建起来。
 * Monaco 在 setTheme 时把整套 ColorId 写成 `.mtkN { color: … }` 注入，
 * 换主题时它自己重刷，所以每次导出现扫一遍 —— 扫的是十几条规则，不值得缓存。
 * @returns {Map<string, string>}
 */
function collectTokenColors() {
  const map = new Map()
  for (const sheet of document.styleSheets) {
    let rules
    try {
      rules = sheet.cssRules
    } catch {
      continue // 跨域样式表读 cssRules 会抛，跳过
    }
    for (const rule of rules) {
      const match = /^\.mtk(\d+)$/.exec(rule.selectorText ?? '')
      if (match && rule.style?.color) map.set(`mtk${match[1]}`, rule.style.color)
    }
  }
  return map
}

/**
 * 当前编辑器主题的采色结果。
 * @returns {{ background: string, foreground: string, lineNumber: string,
 *             border: string | null, light: boolean, tokens: Map<string, string>,
 *             bracketColors: (string | null)[], unexpectedBracket: string | null }}
 */
function currentThemeColors() {
  // 自定义属性只挂在 .monaco-editor 上（Monaco 自己只产出那一条规则），所以从它身上读
  const host = document.querySelector('.monaco-editor')
  const style = host ? getComputedStyle(host) : null
  const read = (name, fallback) => style?.getPropertyValue(name)?.trim() || fallback
  const background = read('--vscode-editor-background', FALLBACK_COLORS.background)
  const foreground = read('--vscode-editor-foreground', FALLBACK_COLORS.foreground)
  const light = luminance(background) > LIGHT_BACKGROUND_LUMINANCE
  return {
    background,
    foreground,
    // 行号：跟随主题自己的行号色（本站的深色主题把它压暗过一档，见 monaco-setup.js）
    lineNumber: read('--vscode-editorLineNumber-foreground', foreground),
    // 白卡片贴到白色背景上看不出边界，补一条 1px 边；深色不需要
    border: light ? read('--vscode-editorWidget-border', FALLBACK_COLORS.border) : null,
    // 阴影浓度与内侧描边都要按深浅分档，交给调用方判断
    light,
    tokens: collectTokenColors(),
    // 彩色括号：按档读主题那 6 个色；主题没给的档（透明）留 null，见 opaqueColor
    bracketColors: Array.from({ length: BRACKET_COLOR_COUNT }, (_, i) =>
      opaqueColor(read(`--vscode-editorBracketHighlight-foreground${i + 1}`, '')),
    ),
    // 配不上对的括号（编辑器标红用的那档）
    unexpectedBracket: opaqueColor(
      read('--vscode-editorBracketHighlight-unexpectedBracket-foreground', ''),
    ),
  }
}

/**
 * `monaco.editor.colorize` 的 HTML → 每行的 token 类名序列。
 * 只取 class，文本仍用 tokenize 的原始行（colorize 会把制表符展开成空格）。
 * @param {string} text
 * @param {string} languageId
 * @returns {Promise<string[][]>}
 */
async function colorizeClasses(text, languageId) {
  let html = ''
  try {
    html = await monaco.editor.colorize(text, languageId)
  } catch {
    // 语言没注册 tokenizer 之类：颜色退化成正文色（layoutLine 里认不出类名就是这个落点），
    // 但排版、行号、缩进照旧 —— 导出失败比少几条颜色更糟
    return []
  }
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const lines = []
  let current = []
  const visit = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        // 行与行之间是 <br/>，但保险起见：文本里的裸换行也按换行处理
        String(child.nodeValue ?? '')
          .split('\n')
          .forEach((part, index) => {
            if (index) {
              lines.push(current)
              current = []
            }
          })
        continue
      }
      if (child.nodeName === 'BR') {
        lines.push(current)
        current = []
        continue
      }
      const cls = child.nodeType === Node.ELEMENT_NODE ? child.getAttribute('class') : null
      if (cls) current.push(cls)
      visit(child)
    }
  }
  visit(doc.body)
  lines.push(current)
  return lines
}

/**
 * 圆角矩形路径。优先用 `ctx.roundRect`（Chrome 99+ / Safari 16+），
 * 老一点的引擎退回 `arcTo` 手画 —— 这条路径只服务导出，不值得为它引 polyfill。
 */
function roundRectPath(ctx, x, y, width, height, radius) {
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, width, height, radius)
    return
  }
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + width, y, x + width, y + height, radius)
  ctx.arcTo(x + width, y + height, x, y + height, radius)
  ctx.arcTo(x, y + height, x, y, radius)
  ctx.arcTo(x, y, x + width, y, radius)
  ctx.closePath()
}

/**
 * 一行的排版：切成若干「可画片段」（文本 + 落点 x），制表符按「停靠位」处理。
 *
 * 【制表符为什么不能直接画】Canvas 的 fillText 把 `\t` 当成普通控制字符，画出来只有一个
 * 空格宽（甚至为零宽），代码里的缩进会整段塌掉。编辑器的做法是按 **tab stop** 前进：
 * 跳到 `tabSize` 的下一个整数倍（列从行首算起），这里照抄同一口径，导出的图才和编辑器里
 * 看到的缩进一致。
 *
 * 量宽与绘制共用这一份：两边各写一遍迟早会漂，漂一点点就是「卡片算窄了、最长那行被裁掉」。
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} line 行文本
 * @param {{ offset: number, type: string }[]} row 这一行的 token 列表（没有就当整行一个片段）
 * @param {string[]} classes 这一行的 token 类名序列（与 row 一一对应，来自 colorize）
 * @param {number} startX 正文左边界
 * @param {number} tabSize 制表符宽度（列数）
 * @param {number} charWidth 单字符像素宽（等宽字体下就是列宽）
 * @param {Map<string, string>} tokens 「类名 → 颜色」表
 * @param {string} foreground 认不出类名时的落点色
 * @param {(string | null)[] | null} rowColors 这一行的**字符级**配色（彩色括号），null 表示没有
 * @returns {{ pieces: { text: string, color: string, x: number }[], width: number }}
 */
function layoutLine(ctx, line, row, classes, startX, tabSize, charWidth, tokens, foreground, rowColors) {
  const pieces = []
  let x = startX
  const stops = Math.max(1, Math.round(tabSize) || DEFAULT_TAB_SIZE)
  const colorAt = (index) => tokens.get(classes[index]) ?? foreground
  /** 跳到下一个 tab 停靠位（tab 本身不画，只把落点推过去） */
  function toNextStop() {
    const column = charWidth > 0 ? (x - startX) / charWidth : 0
    x = startX + (Math.floor(column / stops) + 1) * stops * charWidth
  }
  /** 把 [from, to) 这段文本按 tab 切开画出来 */
  function draw(from, to, color) {
    line
      .slice(from, to)
      .split('\t')
      .forEach((part, index) => {
        if (index) toNextStop()
        if (!part) return
        pieces.push({ text: part, color, x })
        x += ctx.measureText(part).width
      })
  }
  // token 段：row 为空（纯空白行、空行）时整行当一个片段
  const ranges = row.length
    ? row.map((token, index) => ({
        start: token.offset,
        end: index + 1 < row.length ? row[index + 1].offset : line.length,
        color: colorAt(index),
      }))
    : [{ start: 0, end: line.length, color: colorAt(0) }]
  for (const range of ranges) {
    if (!rowColors) {
      draw(range.start, range.end, range.color)
      continue
    }
    // 段内再按字符级配色（彩色括号）切成同色的小段：逐字符推进，颜色一变就收一段
    let from = range.start
    let color = rowColors[range.start] ?? range.color
    for (let i = range.start + 1; i <= range.end; i++) {
      const next = i < range.end ? rowColors[i] ?? range.color : null
      if (next === color) continue
      draw(from, i, color)
      from = i
      color = next ?? range.color
    }
    draw(from, range.end, color)
  }
  return { pieces, width: x - startX }
}

/**
 * 每一行、每个字符「是不是真代码」的掩码：字符串、注释、正则里的括号**不算**括号，
 * 拿它们去配对会把后面的嵌套全算错（编辑器的 tokenizer 同样先分词、再配色）。
 * @param {string[]} lines
 * @param {{ offset: number, type: string }[][]} rows tokenize 的结果
 * @returns {boolean[][]}
 */
function buildCodeMask(lines, rows) {
  return lines.map((line, index) => {
    const mask = new Array(line.length).fill(true)
    const row = rows[index] ?? []
    for (let i = 0; i < row.length; i++) {
      const base = String(row[i].type ?? '').split('.')[0].toLowerCase()
      if (base !== 'string' && base !== 'comment' && base !== 'regexp' && base !== 'regex') continue
      const end = i + 1 < row.length ? row[i + 1].offset : line.length
      for (let j = row[i].offset; j < end; j++) mask[j] = false
    }
    return mask
  })
}

/**
 * 彩色括号：扫一遍文本算嵌套深度，给出每行每字符该用的括号色（没有就是 null）。
 *
 * 与编辑器同源的三条口径（实测对照编辑区 DOM 的 `bracket-highlighting-N` 类名与计算色）：
 *   · 括号集是 `() [] {}`（Monaco 的 language configuration 就是这三对，`<>` 不算）；
 *   · 颜色按**嵌套深度**取，最外层第 1 档，深一层换一档；
 *   · 档数 = 主题里**实际给了几档**（本站主题只给了 3 档，第 4 层会绕回第 1 档的金色 ——
 *     Monaco 就是这么循环的，不是取到空档就不染）。主题没定义的档读出来是透明，过滤掉。
 * 配不上对的括号用主题的 `unexpectedBracket` 色（编辑器里也是这条规则）。
 * @param {string[]} lines
 * @param {boolean[][]} mask 「是不是真代码」
 * @param {{ bracketColors: (string | null)[], unexpectedBracket: string | null }} palette
 * @returns {(string | null)[][] | null} 没有任何可用颜色时返回 null（调用方据此整段跳过）
 */
function bracketColorRows(lines, mask, palette) {
  const colors = palette.bracketColors ?? []
  // 主题没给的档是透明，过掉 —— 剩下的才是真正会循环的那几档
  const usable = colors.filter(Boolean)
  if (!usable.length && !palette.unexpectedBracket) return null
  const rows = lines.map((line) => new Array(line.length).fill(null))
  const colorForDepth = (depth) => (usable.length ? usable[depth % usable.length] : null)
  const stack = [] // { char, line, index, depth }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    for (let j = 0; j < line.length; j++) {
      if (!mask[i][j]) continue
      const ch = line[j]
      if (ch === '(' || ch === '[' || ch === '{') {
        const depth = stack.length
        const color = colorForDepth(depth)
        if (color) rows[i][j] = color
        stack.push({ char: ch, line: i, index: j, depth })
        continue
      }
      if (ch === ')' || ch === ']' || ch === '}') {
        const top = stack[stack.length - 1]
        if (top && BRACKET_PAIRS[top.char] === ch) {
          stack.pop()
          const color = colorForDepth(top.depth)
          if (color) rows[i][j] = color
        } else if (palette.unexpectedBracket) {
          // 多出来的闭括号：编辑器标红
          rows[i][j] = palette.unexpectedBracket
        }
      }
    }
  }
  // 一直没等到另一半的开括号：同样标红
  if (palette.unexpectedBracket) {
    for (const open of stack) rows[open.line][open.index] = palette.unexpectedBracket
  }
  return rows
}

/**
 * 质量档 → 渲染倍率。认不出来（旧存档、手改过的值）一律回落到默认档。
 *
 * 导出到模块外是给 mdImage.js 用的：Markdown 导出与代码图共用设置里的同一档质量，
 * 两处各抄一份 2 / 3 / 4 迟早会漂。
 * @param {'medium'|'high'|'ultra'} quality
 */
export function imageQualityScale(quality) {
  return QUALITY_SCALES[quality] ?? QUALITY_SCALES[DEFAULT_QUALITY]
}

/**
 * 把一段代码渲染成一张 canvas（导出链路唯一的一次绘制）。
 *
 * 返回 canvas 而不是字符串：下面两条出口**要的不是同一种东西** ——
 * 下载要 data URL，`<a download>` 只认它；写剪贴板却要 Blob，而且手机上绝不能绕 data URL
 * （见 copyCanvasToClipboard）。先统一画成 canvas，两条出口各取所需。
 *
 * @param {object} options
 * @param {string} options.code 要画的代码（通常是编辑器里的选区）
 * @param {string} [options.languageId='plaintext'] Monaco 的语言 id，决定分词结果
 * @param {boolean} [options.showDots=true] 是否画左上角三个窗口圆点
 * @param {boolean} [options.showLineNumbers=true] 是否在正文左侧画行号栏（设置项 codeImageLineNumbers）
 * @param {number} [options.startLine=1] 第一行的行号（选区从中间开始时要跟着选区走）
 * @param {number} [options.tabSize=4] 制表符宽度（列数），取编辑器当前文件的缩进宽度
 * @param {'medium'|'high'|'ultra'} [options.quality='high'] 导出质量（见 QUALITY_SCALES）
 * @param {boolean} [options.bracketColorize=true] 是否按嵌套深度给括号上色（编辑器设置项
 *   bracketPairColorization；题解 .md 下编辑器自己会关掉，调用方也传 false）
 * @param {string} [options.fontFamily] 等宽字体栈，缺省用编辑器当前字体
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function renderCodeCanvas({
  code,
  languageId = 'plaintext',
  showDots = true,
  showLineNumbers = true,
  startLine = 1,
  tabSize = DEFAULT_TAB_SIZE,
  quality = DEFAULT_QUALITY,
  bracketColorize = true,
  fontFamily = FALLBACK_FONT,
} = {}) {
  // 必须等字体就绪：Canvas 的 measureText 在 webfont 到位前量到的是兜底字体的宽度，
  // 算出来的卡片宽度会比真实排版窄（首屏首次导出时最容易踩到）。
  if (document.fonts?.ready) await document.fonts.ready

  const palette = currentThemeColors()
  const text = String(code ?? '')
  const lines = text.split(/\r?\n/)
  // 文本边界与颜色分两路：tokenize 给 offset（制表符原样）、colorize 给类名（对应主题色）
  const [classes, rows] = await Promise.all([
    colorizeClasses(text, languageId),
    Promise.resolve(monaco.editor.tokenize(text, languageId)),
  ])
  const font = `${EXPORT_FONT_SIZE}px ${fontFamily}`
  const step = Math.round(EXPORT_FONT_SIZE * EXPORT_LINE_HEIGHT_RATIO)

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  ctx.font = font
  // 列宽：等宽字体下「0」的宽度就是一列，tab 停靠位与行号栏的位数都按它算
  const charWidth = ctx.measureText('0').width || EXPORT_FONT_SIZE * 0.6
  // 行号栏 = 行号位数那一列 + 与正文之间的一条留白；关掉时这段宽度为零，正文顶到左边距
  const firstLine = Math.max(1, Math.round(startLine) || 1)
  const gutter = showLineNumbers
    ? Math.round(String(firstLine + lines.length - 1).length * charWidth) + gutterGap(EXPORT_FONT_SIZE)
    : 0
  // 关掉圆点后没有标题栏顶着，代码区上内边距单独放宽一档
  const paddingTop = showDots ? CODE_PADDING_TOP : CODE_PADDING_TOP_NO_DOTS
  // 正文左边界 = 卡片左缘（＝ MARGIN）+ 代码区左内边距 + 行号栏
  const textX = MARGIN + CODE_PADDING_LEFT + gutter

  // 彩色括号：先按「字符串 / 注释不算括号」打掩码，再算嵌套深度取色
  const bracketRows =
    bracketColorize && languageId !== 'plaintext'
      ? bracketColorRows(lines, buildCodeMask(lines, rows), palette)
      : null

  // 先量宽：逐行排版一次，把片段连同落点记下来（绘制阶段直接复用，不再排第二遍）。
  let contentWidth = 0
  const layouts = []
  for (let i = 0; i < lines.length; i++) {
    const layout = layoutLine(
      ctx,
      lines[i],
      rows[i] ?? [],
      classes[i] ?? [],
      textX,
      tabSize,
      charWidth,
      palette.tokens,
      palette.foreground,
      bracketRows?.[i] ?? null,
    )
    layouts.push(layout)
    if (layout.width > contentWidth) contentWidth = layout.width
  }

  // 卡片：窗口栏（画圆点时才占高度）+ 代码区；画布再往外扩一圈 MARGIN 给阴影
  const titleBar = showDots ? TITLE_BAR_HEIGHT : 0
  const cardX = MARGIN
  const cardY = MARGIN
  const cardWidth = CODE_PADDING_LEFT + gutter + Math.ceil(contentWidth) + CODE_PADDING_RIGHT
  const cardHeight = titleBar + paddingTop + lines.length * step + CODE_PADDING_BOTTOM
  const width = cardWidth + MARGIN * 2
  const height = cardHeight + MARGIN * 2

  // 按质量档放大画布再用 ctx.scale 缩回来，导出的 PNG 才不糊。
  // 注意给 canvas.width 赋值会重置 2d 上下文的状态，所以下面要重设一次字体。
  const ratio = imageQualityScale(quality)
  canvas.width = Math.round(width * ratio)
  canvas.height = Math.round(height * ratio)
  ctx.scale(ratio, ratio)
  ctx.font = font
  ctx.textBaseline = 'middle'

  // 卡片底：这一笔是唯一带阴影的（阴影挂在 fill 上），画完立刻收掉，
  // 否则后面的文字、圆点全都会拖一层影子。
  ctx.save()
  ctx.shadowColor = palette.light ? SHADOW_COLOR.light : SHADOW_COLOR.dark
  // shadowBlur / shadowOffset 走设备像素、不吃 ctx.scale，所以自己乘倍率
  ctx.shadowBlur = SHADOW_BLUR * ratio
  ctx.shadowOffsetY = SHADOW_OFFSET_Y * ratio
  roundRectPath(ctx, cardX, cardY, cardWidth, cardHeight, RADIUS)
  ctx.fillStyle = palette.background
  ctx.fill()
  ctx.restore()

  // 浅底那圈外边：白卡片贴到白背景上看不出边界，靠它界定（深色主题不需要）。
  // 曾经还有一道「内侧 1px 高光」（小样的 inset 高光，深底是白色 10%），用户 2026-10-12
  // 让去掉 —— 深色主题下它看着就是卡片外面一圈白边。
  if (palette.border) {
    roundRectPath(ctx, cardX + 0.5, cardY + 0.5, cardWidth - 1, cardHeight - 1, RADIUS)
    ctx.strokeStyle = palette.border
    ctx.lineWidth = 1
    ctx.stroke()
  }

  // 窗口栏三点：圆心落在窗口栏那条带的正中
  if (showDots) {
    const centerY = cardY + titleBar / 2
    DOT_COLORS.forEach((color, index) => {
      ctx.beginPath()
      ctx.arc(cardX + DOT_INSET + DOT_RADIUS + index * (DOT_RADIUS * 2 + DOT_GAP), centerY, DOT_RADIUS, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
    })
  }

  // 正文：逐行画行号（右对齐到那条留白的左缘），再按排版好的片段逐段画
  for (let i = 0; i < lines.length; i++) {
    const y = cardY + titleBar + paddingTop + i * step + step / 2
    if (showLineNumbers) {
      const label = String(firstLine + i)
      ctx.fillStyle = palette.lineNumber
      ctx.fillText(label, textX - gutterGap(EXPORT_FONT_SIZE) - ctx.measureText(label).width, y)
    }
    for (const piece of layouts[i].pieces) {
      ctx.fillStyle = piece.color
      ctx.fillText(piece.text, piece.x, y)
    }
  }

  return canvas
}

/** canvas → PNG Blob。`toBlob` 是回调式的，包一层 Promise 好在 async 里用 */
function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob returned null'))),
      'image/png',
    )
  })
}

/**
 * 把 canvas 里的图写进系统剪贴板。**不抛异常**，只回结果 ——
 * 调用方据此决定要不要退化成下载。
 *
 * 【为什么在 Android 上会失败，以及这里怎么绕】
 * 1. **Blob 直接取自 canvas，不再绕 data URL。** 旧写法是 `toDataURL()` 拿到几 MB 的 base64
 *    串、再 `fetch(dataUrl)` 解回 Blob：手机上这一步既慢又吃内存，等它跑完，「用户手势」
 *    那几秒的窗口早过期了 —— `write()` 于是以 NotAllowedError 收场，用户看到的便是
 *    「点了复制却变成下载」。toBlob 由浏览器内部编码，没有这一次来回。
 * 2. **ClipboardItem 的值传 Promise。** `write()` 因此能在手势所在的那个 task 里就发出去
 *    （Blob 随后由浏览器自己去取），Safari 严格要求这个写法，Chrome 也接受。
 * 3. **先问一句 `ClipboardItem.supports('image/png')`。** Android 上不少壳（老 WebView、
 *    Samsung Internet 一类）只有文本剪贴板，明说了不支持就别去撞，直接交给下载那条路。
 *
 * 仍留一道兜底：不认「值是 Promise」的老浏览器会走第二次尝试（先取 Blob 再写）。
 *
 * 【为什么要区分两种失败】（2026-10-21）
 * 失败分两类，给用户的话完全不同：**能力上没有**（没有 ClipboardItem / write，或
 * `supports('image/png')` 明说不行）才是「这个浏览器不支持」；**有能力却这次没写成**
 * （权限被拒、手势窗口过期、系统剪贴板被别的程序占住……）在正常桌面浏览器上很常见，
 * 不能也说成「不支持」—— 那会让人以为自己的浏览器有问题。所以 reason 分
 * `'unsupported'` / `'failed'` 两种，文案由调用方按它挑。
 *
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<{ok: boolean, reason?: 'unsupported' | 'failed'}>}
 */
export async function copyCanvasToClipboard(canvas) {
  if (!canvas || typeof ClipboardItem !== 'function' || !navigator.clipboard?.write) {
    return { ok: false, reason: 'unsupported' }
  }
  // 没有 supports 这个静态方法（老浏览器）时不拦 —— 那时只能真的试一次才知道
  if (typeof ClipboardItem.supports === 'function' && !ClipboardItem.supports('image/png')) {
    return { ok: false, reason: 'unsupported' }
  }
  const pending = canvasToBlob(canvas)
  // 第一次尝试若失败，这个 Promise 的 rejection 就没人接了，先挂个空 catch 免得冒
  // unhandledrejection；两次尝试共用同一个 Promise，编码只会做一次。
  pending.catch(() => {})
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': pending })])
    return { ok: true }
  } catch {
    /* 落到下面的兜底 */
  }
  try {
    const blob = await pending
    await navigator.clipboard.write([new ClipboardItem({ [blob.type || 'image/png']: blob })])
    return { ok: true }
  } catch {
    return { ok: false, reason: 'failed' }
  }
}

/**
 * 触发下载（用户指定的 `<a>` 那条路）。
 * 挂进 DOM 再点：部分浏览器只认「在文档里的」锚点，detached 的 click 会被忽略。
 * @param {string} dataUrl
 * @param {string} filename
 */
export function downloadImage(dataUrl, filename = 'code.png') {
  const anchor = document.createElement('a')
  anchor.href = dataUrl
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}
