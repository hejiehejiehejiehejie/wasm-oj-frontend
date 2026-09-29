/**
 * mdRenderer —— 题解的渲染管线：marked 解析 → DOMPurify 清洗 → KaTeX 渲染公式。
 *
 * 【为什么是这个顺序】（这是本模块唯一需要解释的事）
 * KaTeX 吐出来的是 MathML + 一堆内联样式/类名，DOMPurify 的默认白名单会把它们当成
 * 可疑标记删掉 —— 「先渲染公式、再整体清洗」等于把公式洗没。反过来，先清洗用户正文、
 * 再往干净的空壳里灌公式就绕开了这个矛盾：
 *   1) marked 把 `$x$` 这类公式解析成**空壳元素**（`.md-math`，正文以纯文本放在里面，
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
 * 公式空壳。正文放在**文本节点**里而不是属性里：一来不用自己做属性转义，
 * 二来万一渲染器没就绪，界面上留下的就是原始 TeX 文本，本身可读。
 */
function mathShell(tex, display) {
  const escaped = tex.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<span class="md-math" data-display="${display ? '1' : '0'}">${escaped}</span>`
}

/**
 * 行内公式 `$…$`。
 * 两条克制的边界（都是为了让「不是公式的美元符号」留在原地）：
 * - 起始 `$` 后面不能是空白或另一个 `$`，收尾 `$` 前面不能是空白 —— 于是 `$5 和 $10`
 *   不会被当成一个公式；
 * - 内容不许跨行、不许出现裸 `$`，`\$` 仍可作为转义写在里面。
 */
const INLINE_MATH = {
  name: 'inlineMath',
  level: 'inline',
  start(src) {
    return src.match(/\$(?!\$)/)?.index
  },
  tokenizer(src) {
    const match = /^\$(?![\s$])((?:\\.|[^\\$\n])+?)(?<!\s)\$(?!\$)/.exec(src)
    if (!match) return undefined
    return { type: 'inlineMath', raw: match[0], text: match[1] }
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
    return src.match(/\$\$/)?.index
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
  marked.use({ gfm: true, breaks: true, extensions: [INLINE_MATH, BLOCK_MATH] })
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
  const html = marked.parse(source ?? '')
  // USE_PROFILES 只留 HTML：SVG / MathML 这两套命名空间在题解里没有正当用途，
  // 留着只是给 XSS 多开几扇门（公式的 MathML 是我们自己渲染的，不走这里）
  container.innerHTML = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })
  hydrateMath(container, katex)
}