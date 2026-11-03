/**
 * mdRenderer —— 题解的渲染管线：marked 解析 → DOMPurify 清洗 → KaTeX 渲染公式。
 *
 * 【为什么是这个顺序】（这是本模块唯一需要解释的事）
 * KaTeX 吐出来的是 MathML + 一堆内联样式/类名，DOMPurify 的默认白名单会把它们当成
 * 可疑标记删掉 —— 「先渲染公式、再整体清洗」等于把公式洗没。反过来，先清洗用户正文、
 * 再往干净的空壳里灌公式就绕开了这个矛盾：
 *   1) marked 把公式（下面那几个扩展，各认一种写法）解析成**空壳元素**
 *      （`.md-math`，正文以纯文本放在里面，
 *      一个标签、一个属性都不来自用户）；
 *   2) DOMPurify 清洗整棵 HTML —— 这一步只面对用户写的正文（含 raw HTML 与粘贴来的
 *      `<img onerror=…>`），公式此刻还只是纯文本，不会被误删；
 *   3) 再对每个空壳调 katex.render()，把公式填进已经洗净、且完全由我们自己生成的壳里。
 * 公式源码里的 `\href{javascript:…}` 这类也进不来：KaTeX 默认 trust: false，不会为
 * `\href` / `\htmlStyle` 生成标签或样式。
 *
 * 【为什么 marked / katex 要按需下载，DOMPurify 却是直接 import】
 * marked 与 katex 是 `/md/` 下的运行时资产（连同 20 个字重共 577KB，见 mdRuntime.js），
 * 没下载过的用户外壳里一份都没有；DOMPurify 则早就跟着 monaco 一起在打包产物里了
 * （见 NOTICE.md），再走一遍下载只是白等一次网络。
 */
import DOMPurify from 'dompurify'
import { loadMdRenderer } from './mdRuntime.js'

/**
 * 公式里的 HTML 字符引用还原。
 *
 * Codeforces / Polygon 的题面源文本整篇是 HTML 转义的：`_` 写成 `&#95;`（否则 CF 自己的
 * markdown 会把下划线当强调符），`<` / `>` / `&` 也各留一份。这些字符引用若原样进 KaTeX，
 * 会被当成字面文本 —— `&#95;` 直接让整条公式解析失败，而 throwOnError: false 的失败展示
 * 就是整段红字。公式空壳里的 `&` 又被 mathShell 转义成 `&amp;`，浏览器解析回来仍是字面
 * `&#95;`，所以必须在转义之前还原。
 *
 * 只认 `&…;` 这一种形态：数学里的 `&`（cases / matrix 的对齐点）后面不跟 `;`，不会被误伤；
 * 认不出的命名实体原样保留 —— 宁可让 KaTeX 报一个看得见的错，也不擅自改写正文。
 */
const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' }

function decodeMathEntities(text) {
  if (!text.includes('&')) return text
  return text.replace(/&(?:#(\d{1,7})|#x([0-9a-fA-F]{1,6})|([a-z][a-z0-9]{1,31}));/gi, (whole, dec, hex, name) => {
    if (dec) {
      const code = Number(dec)
      return code <= 0x10ffff ? String.fromCodePoint(code) : whole
    }
    if (hex) {
      const code = parseInt(hex, 16)
      return code <= 0x10ffff ? String.fromCodePoint(code) : whole
    }
    return NAMED_ENTITIES[name.toLowerCase()] ?? whole
  })
}

/**
 * 公式空壳。正文放在**文本节点**里而不是属性里：一来不用自己做属性转义，
 * 二来万一渲染器没就绪，界面上留下的就是原始 TeX 文本，本身可读。
 */
function mathShell(tex, display) {
  const escaped = decodeMathEntities(tex).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<span class="md-math" data-display="${display ? '1' : '0'}">${escaped}</span>`
}

/**
 * 块级扩展的 start() 用它找「段落该切在哪」。两道闸：
 *
 * 1) 分隔符落在**行内代码**里时跳过。marked 把段落裁到 start() 返回的下标、再从那里
 *    重新按块解析，它看不见上下文 —— 于是 ``用 `\[x\]` 包起来`` 这种句子会从反引号中间
 *    被切开，`\[x\]` 变成一段真的行间公式，前后各剩一个落单的反引号。`$$` 那条早就带着
 *    这个毛病（``写 `$$x$$` 即可`` 会被切开），补 `\[` 时一并修掉。
 *    判据只看本行：从行首扫到候选点，按连续反引号的长度配对（`\`` 与 ``\`\``` 是两种
 *    定界符，等长才算闭合）。行内代码极少跨行，不往上一行看。
 *    一种漏网：段落第一个字符就是 `` `` `` 开的双反引号代码段时，开头那枚反引号看不见
 *    （marked 传进来的是 `src.slice(1)`），段内的 `\[` 仍会被当成公式。
 *
 * 2) `lineStartOnly` 要求候选项**落在行首**。只有 `\[` 需要这条：在 markdown 里 `\[`
 *    本来就是一个转义（写出字面的 `[`），于是 `见 \[1\] 式`、`区间 \[l,r\] 内` 这类
 *    纯正文天天出现 —— 认成公式会把方括号吃掉、把 `1` 居中摆到版面中间。而真正的行间
 *    公式本来就独占一行（`\[` 后跟换行、`\]` 收在行尾），行首这条判据不误伤它。
 *    `$$` / `$$$` 没有这层冲突（美元符号在 markdown 里不转义任何东西），所以不设这条。
 *
 * @param {string} src 段落源码
 * @param {RegExp} pattern 分隔符（不带 g，这里自己加）
 * @param {boolean} [lineStartOnly] 是否只认行首的候选
 * @returns {number | undefined} 第一个可用的候选下标
 */
function blockStartIndex(src, pattern, lineStartOnly = false) {
  const regex = new RegExp(pattern.source, 'g')
  let match
  while ((match = regex.exec(src))) {
    const index = match.index
    // 下标 0 是 marked 传进来的 src.slice(1) 的第 0 位（= 段落第 1 个字符），
    // 它前面那个字符看不见，算不上「确认在行首」
    if (lineStartOnly && (index === 0 || src[index - 1] !== '\n')) continue
    let fence = 0
    let i = src.lastIndexOf('\n', index - 1) + 1
    while (i < index) {
      if (src[i] === '`') {
        let run = 0
        while (src[i + run] === '`') run += 1
        if (fence === 0) fence = run
        else if (fence === run) fence = 0
        i += run
      } else {
        i += 1
      }
    }
    if (fence === 0) return index
  }
  return undefined
}

/**
 * 行内公式 `$…$`。
 * 三条克制的边界（都是为了让「不是公式的美元符号」留在原地）：
 * - 起始 `$` 后面不能是空白或另一个 `$`；
 * - 收尾 `$` 前面不能是空白 —— 于是 `价格 $5 和 $10` 不会被当成一个公式；
 * - 收尾 `$` 后面不能紧跟数字 —— 于是 `价格 $5和$10`（不带空格）也不会。这条取自
 *   Pandoc 的 `tex_math_dollars`：紧贴数字的 `$` 几乎一定是货币或计数器，而真公式
 *   收尾后紧跟数字的写法（`$a$2`）本来就不成立，要写也该是 `$a$ 2`。
 * - 内容不许跨行、不许出现裸 `$`，`\$` 仍可作为转义写在里面。
 */
const INLINE_MATH = {
  name: 'inlineMath',
  level: 'inline',
  start(src) {
    return src.match(/\$(?!\$)/)?.index
  },
  tokenizer(src) {
    const match = /^\$(?![\s$])((?:\\.|[^\\$\n])+?)(?<!\s)\$(?![\$\d])/.exec(src)
    if (!match) return undefined
    return { type: 'inlineMath', raw: match[0], text: match[1] }
  },
  renderer(token) {
    return mathShell(token.text, false)
  },
}

/**
 * 转义形态的正文还原：`\_` → `_`。
 *
 * 只用在 `\\(…\\)` / `\\[…\\]` 这两种形态里。它们是从「在 markdown 里显示 LaTeX」
 * 的地方复制来的 —— 分隔符 `\(` 在 markdown 里是「字面的 `(`」，于是作者写 `\\(`；
 * 同理下划线写 `\_`。原样交给 KaTeX **不会报错**，只是静默出错：
 * `\underbrace{…}\_{k}` 里的 `\_` 被当成字面下划线字符，下标那一块直接消失，
 * `throwOnError` 也不会响（渲染结果看着像「作者没写下标」）。
 *
 * 只还原这一个，不碰其它「反斜杠 + 标点」，原因有二：
 * - `\{` `\}` `\%` `\&` `\|` `\,` 这些在 TeX 里都是**有意义的命令**，还原掉就残了；
 *   而 `\_` 在 TeX 里只是「文本下划线」，与下标符 `_` 撞车，正是要拆开的那个。
 * - `\\`（TeX 换行）更不能碰：作者若已按 markdown 规则写成 `\\\`（三个），还原反而把
 *   换行变成控制空格、cases 挤成一行。所以这里只管 `\_`，别的原样透传给 KaTeX。
 */
function unescapeTex(text) {
  return text.replace(/\\_/g, '_')
}

/**
 * 行内公式的另一种写法 `\(…\)`，LaTeX 原生那一套。
 *
 * 为什么要认它：题解、笔记、题面多半是抄来改的，`$…$` 与 `\(…\)` 混着出现很常见。
 * 少认一种，那段公式就直接退化成正文 —— 反斜杠被 markdown 的转义规则吃掉
 * （`\(` 变 `(`、`\\` 变 `\`）、`&` 变成 `&amp;`，界面上是一行乱码。
 *
 * 与 `$` 版的两处不同，都是判据不同而非更宽松：
 * - 允许内容里有空白（`\( x \)` 是常见写法，`$ x $` 才有歧义）；
 * - 仍不许跨行 —— 一个落单的 `\(` 若允许跨行，会一路吞到下一个 `\)`，把半篇文章吃进公式。
 */
const INLINE_MATH_PAREN = {
  name: 'inlineMathParen',
  level: 'inline',
  start(src) {
    return src.match(/\\\(/)?.index
  },
  tokenizer(src) {
    const match = /^\\\(((?:\\.|[^\\\n])+?)\\\)/.exec(src)
    if (!match) return undefined
    return { type: 'inlineMathParen', raw: match[0], text: match[1] }
  },
  renderer(token) {
    return mathShell(token.text, false)
  },
}

/**
 * 行内公式的**转义形态** `\\(…\\)`。
 *
 * 为什么会有这一种：题解多半是抄来改的，而「在 markdown 里显示 LaTeX」的那些载体
 * （博客编辑器、论坛、聊天窗口）会把 `\(` 转义成 `\\(` —— 否则 markdown 自己先把
 * 反斜杠吃掉、`\(` 当场变成 `(`。实测的一整篇题解就是这种形态：`\\(` 20 处、
 * `\\[` 2 处，单写的 `\(` 一处都没有，于是 22 个公式全退化成正文乱码。
 *
 * 判据与 `\(…\)` 那条一样（允许空白、不许跨行），差别只在多认一个反斜杠、
 * 内容过一遍 unescapeTex。注意它**不**和普通版抢：`^\\\\\(` 在 `\(c\)` 上第 2 个字符
 * 是 `(`，匹配不上；普通版在 `\\(c\\)` 上同理也匹配不上。
 */
const INLINE_MATH_PAREN_ESCAPED = {
  name: 'inlineMathParenEscaped',
  level: 'inline',
  start(src) {
    return src.match(/\\\\\(/)?.index
  },
  tokenizer(src) {
    const match = /^\\\\\(((?:\\.|[^\\\n])+?)\\\\\)/.exec(src)
    if (!match) return undefined
    return { type: 'inlineMathParenEscaped', raw: match[0], text: unescapeTex(match[1]) }
  },
  renderer(token) {
    return mathShell(token.text, false)
  },
}

/** 独占一段的公式 `$$…$$`。marked 会先问块级扩展，所以它不会退化成行内公式 */
const BLOCK_MATH = {
  name: 'blockMath',
  level: 'block',
  start(src) {
    return blockStartIndex(src, /\$\$/)
  },
  tokenizer(src) {
    const match = /^\$\$([\s\S]+?)\$\$/.exec(src)
    if (!match) return undefined
    return { type: 'blockMath', raw: match[0], text: match[1].trim() }
  },
  renderer(token) {
    return mathShell(token.text, true)
  },
}

/**
 * 独占一段的公式 `\[…\]`，LaTeX 原生的行间公式 —— 从论文、题面、讲义里复制过来的
 * 行间公式基本都是这一种，`\begin{cases}` / `\underbrace` 这类多行公式尤其常见。
 *
 * 与 `$$` 版只差一处判据：**起始必须落在行首**（见 blockStartIndex 的第 2 道闸）。
 * `\[` 在 markdown 里是「字面的 `[`」，`见 \[1\] 式` 这种写法一抓一大把，全认成公式
 * 会把方括号吃掉、正文切成三段的排版。真正的行间公式本来就独占一行，行首判据不误伤。
 * 代价是「说明：\[x\]」这种把行间公式写进句子中间的人拿不到渲染 —— 那本来也不是
 * 行间公式该有的位置，作者真想要的话换成 `$$…$$` 即可。
 *
 * 内容里的 `\\`（换行）、`&`（对齐点）都照抄给 KaTeX：它们此刻还是纯文本节点，
 * 要等 DOMPurify 洗过之后才由 mathShell 里的文本节点灌进 KaTeX。
 */
const BLOCK_MATH_BRACKET = {
  name: 'blockMathBracket',
  level: 'block',
  start(src) {
    return blockStartIndex(src, /\\\[/, true)
  },
  tokenizer(src) {
    const match = /^\\\[([\s\S]+?)\\\]/.exec(src)
    if (!match) return undefined
    return { type: 'blockMathBracket', raw: match[0], text: match[1].trim() }
  },
  renderer(token) {
    return mathShell(token.text, true)
  },
}

/**
 * 独占一段的公式 `\\[…\\]`，`\[…\]` 的转义形态（来源同上）。
 *
 * 判据与 `\[` 版完全一致 —— 起始仍必须落在行首。多认的那个反斜杠不改变歧义的性质：
 * `\\[1\\]` 在 markdown 里同样是「字面的 [1]」，写在句中就该留在正文里。
 */
const BLOCK_MATH_BRACKET_ESCAPED = {
  name: 'blockMathBracketEscaped',
  level: 'block',
  start(src) {
    return blockStartIndex(src, /\\\\\[/, true)
  },
  tokenizer(src) {
    const match = /^\\\\\[([\s\S]+?)\\\\\]/.exec(src)
    if (!match) return undefined
    return { type: 'blockMathBracketEscaped', raw: match[0], text: unescapeTex(match[1]).trim() }
  },
  renderer(token) {
    return mathShell(token.text, true)
  },
}

/**
 * 独占一段的公式 `$$$…$$$`，Codeforces 那一套（那边的 markdown 把 `$$` 留给行内，
 * 行间公式统一写三个美元）。题解从 CF 抄过来就是这一种，而且不认它会**认错**：
 * `$$` 那条会先在 `$$$` 上吃掉前两个，剩下 `$ …` 一半进公式、末尾再漏一个光秃秃的 `$`。
 *
 * 必须排在 BLOCK_MATH **后面**：marked 的 use() 对每个扩展做 unshift（后注册的先试），
 * 排在前面反而轮不到它，`$$` 会先把 `$$$` 吃掉前两个美元。
 */
const BLOCK_MATH_TRIPLE = {
  name: 'blockMathTriple',
  level: 'block',
  start(src) {
    return blockStartIndex(src, /\$\$\$/)
  },
  tokenizer(src) {
    const match = /^\$\$\$([\s\S]+?)\$\$\$/.exec(src)
    if (!match) return undefined
    return { type: 'blockMathTriple', raw: match[0], text: match[1].trim() }
  },
  renderer(token) {
    return mathShell(token.text, true)
  },
}

/**
 * 正文里的链接一律新窗口打开：题解里放的是题面与参考博客，原页跳走会把正在编辑的
 * 这一份状态（未保存的正文、分栏位置）全丢掉。rel 一起写死，免得 `window.opener` 被利用。
 * 钩子是全局的，注册一次即可（DOMPurify.addHook 对同一个函数不会重复挂）。
 */
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

/**
 * 扩展对每个 marked 实例只装一次。按实例记（而不是一个模块级布尔）是因为
 * 「卸载渲染器」会把 window.marked 整个删掉，重新下载时是一个**新的**实例：
 * 布尔量留着 true，新实例就永远装不上扩展，$\LaTeX$ 会原地变成纯文本。
 */
const configured = new WeakSet()

function configure(marked) {
  if (configured.has(marked)) return
  // breaks: true —— 单个换行就当换行（中文题解里一行一句是常态，而 CommonMark 默认把
  // 单换行视作空格，会让整段挤成一行）；gfm 保留表格 / 任务列表 / 删除线
  marked.use({
    gfm: true,
    breaks: true,
    extensions: [
      // marked 的 use() 是逐个 unshift —— **后注册的先试**。所以 `$$$` 排在 `$$` 后面，
      // 它才会先被问到；反过来写就永远是 `$$` 抢走前两个美元。
      INLINE_MATH,
      INLINE_MATH_PAREN,
      INLINE_MATH_PAREN_ESCAPED,
      BLOCK_MATH,
      BLOCK_MATH_BRACKET,
      BLOCK_MATH_BRACKET_ESCAPED,
      BLOCK_MATH_TRIPLE,
    ],
  })
  configured.add(marked)
}

function hydrateMath(container, katex) {
  for (const element of container.querySelectorAll('.md-math')) {
    const tex = element.textContent ?? ''
    try {
      katex.render(tex, element, {
        displayMode: element.dataset.display === '1',
        throwOnError: false,
        // 默认的 'warn' 会把「公式里混了中文」这类提示刷满控制台，题解里太常见了
        strict: 'ignore',
      })
    } catch {
      // 渲染器认不出的极端输入可能直接抛错：把原始 TeX 放回去，别让一个公式炸掉整篇预览
      element.textContent = tex
    }
  }
}

/**
 * 把 Codeforces 题面里的 `$$$…$$$` 归一化。
 *
 * CF / Polygon 的数学定界符是 `$$$…$$$`：独占一行当行间公式，写在句子中间当行内公式。
 * 本项目只注册了块级 `$$$`，行内那一半会被段落裁剪拎出来当块级公式（`$$$n$$$ 个整数` 变
 * 成「$ / 居中 n / $ 个整数」三截）。这里只把**不独占一行**的那部分改写成标准 `\(…\)`，
 * 独占一行的原样留给块级扩展 —— 既有扩展一个都不用动。
 *
 * 为什么不直接加「行内 `$$$` 扩展」：`$$$` 与 `$$` 共用前缀，而 marked 的段落裁剪交给
 * 扩展的 start() 的是 `src.slice(1)`，下标 0 看不见它前面那个字符 —— `$$$` 会被 `$$` 从
 * 第二个美元起认成 `$$n$$`。改源头比和 marked 的裁剪顺序博弈可靠。
 *
 * 逐行处理就够了：行内公式不跨行；跨行的 `$$$` 一定是独占行的块级写法，行内凑不成对，
 * 原样保留。围栏代码和行内代码里的 `$$$` 是正文而不是公式，跳过。
 */
function normalizeCodeforcesMath(source) {
  if (!source.includes('$$$')) return source
  const lines = source.split('\n')
  let fence = null
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)
    if (marker) {
      const run = marker[1]
      if (!fence) fence = { char: run[0], length: run.length }
      else if (run[0] === fence.char && run.length >= fence.length) fence = null
      continue
    }
    if (fence || !line.includes('$$$')) continue
    lines[index] = normalizeCodeforcesLine(line)
  }
  return lines.join('\n')
}

/** 行内代码占用的区间，`$$$` 落在这里面时不算公式。 */
function inlineCodeRanges(line) {
  const ranges = []
  let index = 0
  while (index < line.length) {
    if (line[index] !== '`') {
      index += 1
      continue
    }
    let run = 1
    while (line[index + run] === '`') run += 1
    let next = index + run
    let close = -1
    while (next < line.length) {
      if (line[next] === '`') {
        let size = 1
        while (line[next + size] === '`') size += 1
        if (size === run) {
          close = next + size
          break
        }
        next += size
      } else next += 1
    }
    if (close === -1) {
      index += run
      continue
    }
    ranges.push([index, close])
    index = close
  }
  return ranges
}

function inRanges(ranges, index) {
  return ranges.some(([start, end]) => index >= start && index < end)
}

/** 配对：下一个不在行内代码里的 `$$$`，且中间确有内容（`$$$$$$` 这种空对不认）。 */
function findClosingTriple(line, from, code) {
  const close = line.indexOf('$$$', from)
  if (close === -1) return -1
  if (inRanges(code, close)) return findClosingTriple(line, close + 3, code)
  return line.slice(from, close).trim() ? close : -1
}

function normalizeCodeforcesLine(line) {
  const code = inlineCodeRanges(line)
  let out = ''
  let cursor = 0
  let from = 0
  while (from < line.length) {
    const open = line.indexOf('$$$', from)
    if (open === -1) break
    if (inRanges(code, open)) {
      from = open + 3
      continue
    }
    const close = findClosingTriple(line, open + 3, code)
    if (close === -1) {
      from = open + 3
      continue
    }
    // 两端都紧邻更多 `$` 时不动（如 6 美元的 CF 行间写法）：那是同一串美元被拆成
    // 两截 `$$$`，拆开会把 `$` 的连续性弄坏，反而让 KaTeX 收到 `\(…\)` 这种块级公式里
    // 非法的内容。只有闭合侧多出一个 `$`（题面源里常见的手滑）不算这种情况：照常归一，
    // 那枚多出来的 `$` 作为普通字符留在正文里。
    const longerOpen = (line[open - 1] ?? '') === '$'
    const longerClose = (line[close + 3] ?? '') === '$'
    if (longerOpen && longerClose) {
      from = open + 3
      continue
    }
    // 两侧只剩空白 = 独占一行，交给块级扩展；其余一律当行内公式
    const alone =
      !/[^ \t\r]/.test(line.slice(0, open)) &&
      !/[^ \t\r]/.test(line.slice(close + 3))
    if (alone) {
      from = close + 3
      continue
    }
    const tex = line.slice(open + 3, close).trim()
    if (!tex) {
      from = open + 3
      continue
    }
    out += line.slice(cursor, open) + '\\(' + tex + '\\)'
    cursor = close + 3
    from = cursor
  }
  return out ? out + line.slice(cursor) : line
}

/**
 * 把题解渲染进容器。
 *
 * 未下载渲染器时抛 `code === 'MD_RUNTIME_MISSING'`（由 mdRuntime.loadMdRenderer 抛出），
 * 调用方据此显示「去下载」入口，而不是显示一篇空白的预览。
 *
 * @param {string} source 题解正文（Markdown）
 * @param {HTMLElement} container 承载结果的元素
 */
export async function renderMarkdown(source, container) {
  const { marked, katex } = await loadMdRenderer()
  configure(marked)
  const html = marked.parse(normalizeCodeforcesMath(source ?? ''))
  // USE_PROFILES 只留 HTML：SVG / MathML 这两套命名空间在题解里没有正当用途，
  // 留着只是给 XSS 多开几扇门（公式的 MathML 是我们自己渲染的，不走这里）
  container.innerHTML = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })
  hydrateMath(container, katex)
}