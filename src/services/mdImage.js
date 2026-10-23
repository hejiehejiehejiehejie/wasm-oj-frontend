/**
 * mdImage —— 把 .md 文件里的选区（没有选区时是整篇）**按题解预览的排版**渲染成一张 PNG。
 *
 * 与 codeImage.js 的分工：那边画的是「代码」（等宽字体、行号、Monaco 着色），
 * 这边画的是「文档」（Markdown 结构 + KaTeX 公式）。调用方（useEditorMenu 的「生成图片」）
 * 按当前文件的 languageId 选路；**渲染器没下载时回落到 codeImage**，不是报错 ——
 * 用户要的是一张图，选哪套画法只是观感，不该因为少一份运行时就把入口打死。
 *
 * 【为什么复用 MarkdownPreview 的 scoped 样式，而不是自己写一份排版】
 * 导出图的观感必须与预览一致，而预览的排版全在 MarkdownPreview.vue 的 scoped 样式里
 * （编译后是 `.md-preview__body[data-v-xxxx] h1` 这种形态）。所以这里现读一份预览正文的
 * `data-v-*` 属性抄到离屏容器上，再把 `md-preview__body` 类挂上去 —— 规则就原样命中，
 * 不必维护第二份会漂移的排版表。
 *
 * 【DOM → PNG 的路：SVG foreignObject，不引第三方库】
 * 项目纪律是不为导出再加一个 html2canvas 之类的依赖（它们本身也是同一套路数）。步骤：
 *   1) 在页面里挂一个离屏容器（`position: fixed; left: -100000px`），renderMarkdown 进去；
 *   2) 把每个元素的**计算样式**内联到克隆体上（下面 STYLE_PROPERTIES 的白名单；
 *      SVG 元素另抄 fill/stroke —— 见 SVG_STYLE_PROPERTIES 的注释）；
 *   3) 连同 @font-face（字体转 data URL）一起塞进 `<svg><foreignObject>`，用 <img> 解码；
 *   4) 按质量档放大画到 canvas。
 * 为什么要内联字体：SVG 作为图片加载时**不会去取外部资源**，KaTeX 的 20 个 woff2 与站内
 * 三款等宽字体都必须以 data URL 进 SVG，否则公式会退回系统字体、上下标全歪。
 *
 * 【Safari / WebKit 的兼容口径】（2026-10-21 补）
 * WebKit 能画 foreignObject（macOS Safari 27 / Playwright WebKit 实测都出图正确），但有几个坑，
 * 踩上任何一处，用户看到的都是「点了没反应」或「一张白图」：
 * · 窗口不可见（后台标签 / 最小化 / 被盖住）时 rAF 完全不触发 —— nextFrame 用定时器兜底；
 * · `onload` 只代表解码完成，栅格化可能没落位 —— 加载后补一次 `decode()`（带超时）；
 * · `fonts.ready`、KaTeX 样式表、图片解码都可能永不落定 —— 每步都套 STEP_TIMEOUT；
 * · 超长 base64 data URL 的 SVG 图片会解码失败 —— 改走 percent-encoding；
 * · 万一还是画不出来 —— 量缩略图的着墨量判空白，抛 MD_IMAGE_BLANK / _UNREADABLE，
 *   由调用方回落代码图（口径与「渲染器没下载」一致）。
 *
 * 【边缘口径】
 * · 图宽固定 720 + 四周 32 留白：不跟预览面板宽度走，换窗口导出同一段内容排版不变；
 * · 配色跟当前界面主题（与代码图同一条口径）：底色取 --bg-editor-pane，正文色由
 *   `.md-preview__body` 的 `color: var(--text)` 继承，全部在计算样式里已经解析成实际色值；
 * · 不画卡片、圆点与行号（用户 2026-10-21 定的「纯净文档」），只有内容与留白；
 * · 导出质量复用设置里的 codeImageQuality —— 它就是「渲染倍率」，与代码图同一档位。
 */
import { imageQualityScale } from './codeImage.js'
import { renderMarkdown } from './mdRenderer.js'

/** 版心宽度（逻辑像素）。用户 2026-10-21 定：固定 720，不跟随预览栏宽度 */
const CONTENT_WIDTH = 720
/** 四周留白 */
const PADDING = 32
/** 画布总宽 = 版心 + 两侧留白 */
const TOTAL_WIDTH = CONTENT_WIDTH + PADDING * 2

const XHTML_NS = 'http://www.w3.org/1999/xhtml'

/**
 * 要内联到克隆体上的计算样式。
 *
 * 不抄全部属性有两个理由：一是 `getComputedStyle` 逐项取值不便宜（一篇题解里的 KaTeX
 * 公式动辄上千个 span），二是抄了也用不上（动画 / 过渡 / 指针事件都不影响出图）。
 * 这份清单覆盖三处：Markdown 排版（内外边距 / 字体 / 颜色 / 列表 / 表格 / 边框）、
 * KaTeX 的盒子模型（`vertical-align` / 宽高 / `position` / `top` / `left` / `transform`）、
 * 以及代码块的底色与等宽字体。**加排版特性时记得回到这里补属性**，漏一项的症状是
 * 「预览里对、图里错位」。
 */
const STYLE_PROPERTIES = [
  'display',
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'float',
  'clear',
  'box-sizing',
  'width',
  'height',
  'min-width',
  'min-height',
  'max-width',
  'max-height',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'border-top-style',
  'border-right-style',
  'border-bottom-style',
  'border-left-style',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-left-radius',
  'border-bottom-right-radius',
  'background-color',
  'color',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'font-variant',
  'font-feature-settings',
  'line-height',
  'letter-spacing',
  'word-spacing',
  'text-align',
  'text-indent',
  'text-decoration-line',
  'text-decoration-style',
  'text-decoration-color',
  'text-transform',
  'text-shadow',
  'white-space',
  'word-break',
  'word-wrap',
  'overflow-wrap',
  'vertical-align',
  'list-style-type',
  'list-style-position',
  'overflow-x',
  'overflow-y',
  'opacity',
  'visibility',
  'z-index',
  'transform',
  'transform-origin',
  'box-shadow',
  'clip-path',
  '-webkit-clip-path',
  'direction',
  'unicode-bidi',
  'table-layout',
  'border-collapse',
  'border-spacing',
  'caption-side',
  'flex-direction',
  'flex-wrap',
  'justify-content',
  'align-items',
  'align-self',
  'flex-grow',
  'flex-shrink',
  'flex-basis',
  'gap',
  'row-gap',
  'column-gap',
  'order',
]

/**
 * SVG 元素额外内联的颜色属性（只对 SVG 命名空间的元素抄，HTML 元素绝不抄）。
 *
 * KaTeX 的横大括号（`\underbrace` / `\overbrace`）、根号、弹性定界符都是
 * `<svg><path/></svg>`，路径本身不带 fill/stroke 属性，颜色全靠 KaTeX CSS 的
 * `.katex svg { fill: currentColor; stroke: currentColor }` —— 而导出的 foreignObject
 * 里没有 KaTeX CSS，`fill` 一旦漏抄就回落到 SVG 初始值**黑**（2026-10-22 实测：
 * 深色出图里公式是白的、横大括号是黑的）。
 *
 * 为什么不放进 STYLE_PROPERTIES：HTML 元素的 `fill` / `stroke` 计算值是初始值（黑），
 * 全量内联会顺着继承盖到 svg 头上，正好把对的值顶掉。只对 SVG 元素抄计算值，
 * 且 `currentColor` 在计算样式里已经解析成实际色值，图里不依赖任何 CSS 规则。
 */
const SVG_STYLE_PROPERTIES = ['fill', 'stroke', 'stroke-width']

const URL_PATTERN = /url\((['"]?)([^'")]+)\1\)/g

/**
 * 单步等待的上限。
 *
 * Safari（以及所有 WebKit）在**窗口不可见 / 后台标签 / 最小化**时会把 requestAnimationFrame
 * 掐掉，字体就绪与 SVG 图片的解码回调也可能永远不来 —— 没有上限就是整次导出无限挂起，
 * 用户看到的是「点了没反应」。超时一律抛带 code 的错误，由调用方回落到代码图。
 */
const STEP_TIMEOUT = 5000

/** 给一个 Promise 套上限；超时抛 `code` 指定的错误 */
function withTimeout(promise, ms, code) {
  let timer = 0
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`markdown image: ${code}`)
      error.code = code
      reject(error)
    }, ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/**
 * 单张 canvas 的尺寸上限。
 *
 * WebKit（Safari，以及 iOS 上所有浏览器）只给到 16384 边长 / 16.7M 像素面积，**超了不抛错**：
 * Safari 的 `toDataURL` 直接返回 `"data:,"`，存下来就是一张 0 字节的图。Blink 宽松得多
 * （边长 65535、面积 268M，2026-10-21 在 Chrome 实测），所以按引擎分档 ——
 * 别让 Chrome 上正常的长题解白降质量。
 */
const WEBKIT_CANVAS_LIMIT = { side: 16384, area: 16_777_216 }
const BLINK_CANVAS_LIMIT = { side: 65535, area: 268_435_456 }
/** 缩到这个倍率还装不下，就不画了（一万多行文档本来也不该拿一张图承载），回落代码图 */
const MIN_CANVAS_SCALE = 0.25

/**
 * 是不是 WebKit 系（Safari / iOS 上的所有浏览器）。
 * 它们的 UA 都带 `AppleWebKit`，Chromium 系则另带 Chrome / Edg / OPR 这类标识（iOS 上是 CriOS）。
 */
function isWebKit() {
  const ua = navigator.userAgent
  return /AppleWebKit/i.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Android/i.test(ua)
}

/**
 * 把「逻辑尺寸 × 质量倍率」收进 canvas 上限。
 *
 * 超限时按**同一比例**缩小宽高（版面不变形、内容不裁切），所以长题解在 Safari 上会以
 * 低一点的倍率出图，而不是变成 0 字节。宽高都取整，实际倍率以取整后的尺寸为准。
 * @param {number} width 逻辑宽
 * @param {number} height 逻辑高
 * @param {number} scale 质量倍率（2 / 3 / 4）
 * @returns {{width: number, height: number}}
 */
function fitCanvas(width, height, scale) {
  const limit = isWebKit() ? WEBKIT_CANVAS_LIMIT : BLINK_CANVAS_LIMIT
  const allowed = Math.min(
    Math.sqrt(limit.area / (width * height)),
    limit.side / width,
    limit.side / height,
  )
  const fitted = Math.min(scale, allowed)
  if (fitted < MIN_CANVAS_SCALE) {
    const error = new Error('markdown image: layout is too large for a canvas')
    error.code = 'MD_IMAGE_TOO_LARGE'
    throw error
  }
  return {
    width: Math.max(1, Math.round(width * fitted)),
    height: Math.max(1, Math.round(height * fitted)),
  }
}

/**
 * 预览正文的 scoped 属性名（`data-v-xxxxxx`）。样式规则长这样：
 * `.md-preview__body[data-v-xxxxxx] h1 { … }`，所以把同一个属性抄到离屏容器上即可命中。
 * 找不到时返回 null —— 调用方据此回落到代码图（.md 下 MarkdownPreview 常挂，正常走不到）。
 * @returns {string | null}
 */
function findScopeAttribute() {
  const body = document.querySelector('.md-preview__body')
  if (!body) return null
  return body.getAttributeNames().find((name) => name.startsWith('data-v-')) ?? null
}

/**
 * 离屏容器：类名与 scoped 属性复用预览正文，几何则全部用内联样式压住 ——
 * 预览那份 `flex: 1 1 auto` / `overflow: auto` / rem 内边距在这里都不适用。
 * @param {string} scopeAttribute
 */
function createHost(scopeAttribute) {
  const host = document.createElement('div')
  host.className = 'md-preview__body'
  if (scopeAttribute) host.setAttribute(scopeAttribute, '')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText = [
    'position: fixed',
    'left: -100000px',
    'top: 0',
    'margin: 0',
    `width: ${TOTAL_WIDTH}px`,
    `padding: ${PADDING}px`,
    'box-sizing: border-box',
    'overflow: visible',
    'flex: none',
    'pointer-events: none',
    'z-index: -1',
  ].join('; ')
  return host
}

/**
 * KaTeX 的样式表是 mdRuntime 用 `<link>` 现插的，`loadMdRenderer` 只等脚本、不等 CSS。
 * 渲染前它可能还没到位：那会让公式按兜底字体排版，量出来的高度与最终图对不上。
 * 所以这里补等一次 link 的 load / error（已经到了就直接返回）。
 */
async function ensureRuntimeStylesheet() {
  const link = document.querySelector('link[data-md-runtime="style"]')
  if (!link || link.sheet) return
  await withTimeout(
    new Promise((resolve) => {
      link.addEventListener('load', resolve, { once: true })
      link.addEventListener('error', resolve, { once: true })
    }),
    STEP_TIMEOUT,
    'MD_IMAGE_TIMEOUT',
  )
}

/**
 * 等一帧，让字体 / 图片落位后的行盒收尾。
 *
 * 但**不能只等 rAF**：Safari 在窗口不可见（后台标签、最小化、被盖住）时把 rAF 完全掐掉，
 * 只等它就会永远卡在这一步。所以再挂一条定时器兜底，谁先到算谁。
 */
function nextFrame() {
  return new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      resolve()
    }
    requestAnimationFrame(finish)
    setTimeout(finish, 120)
  })
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/** 取一个资源并转成 data URL；跨域被拒 / 404 一律返回 null，由调用方决定怎么退化 */
async function fetchAsDataUrl(url) {
  try {
    const response = await fetch(url, { mode: 'cors' })
    if (!response.ok) return null
    return await blobToDataUrl(await response.blob())
  } catch {
    return null
  }
}

/**
 * 正文里的图片也必须在图里看得见：SVG 作为图片加载时不取外部资源，所以先把 src
 * 换成 data URL。取不到（跨域、失效）就去掉 src —— 留下 alt 文本，比一个破图标干净。
 * @param {HTMLElement} root
 */
async function inlineImages(root) {
  const images = Array.from(root.querySelectorAll('img'))
  await Promise.all(
    images.map(async (image) => {
      const src = image.getAttribute('src') ?? ''
      if (src && !src.startsWith('data:')) {
        const data = await fetchAsDataUrl(new URL(src, location.href).href)
        if (data) image.setAttribute('src', data)
        else image.removeAttribute('src')
      }
      if (image.getAttribute('src')) {
        try {
          await image.decode()
        } catch {
          /* 坏图：保留 alt，不让一张图毁掉整次导出 */
        }
      }
    }),
  )
}

/** 字体文件按绝对地址缓存（同一款字体只取一次；导出多次时不必反复转 base64） */
const fontSourceCache = new Map()

/**
 * 只拼正文**真的用到**的那几条 `@font-face`，并把字体地址换成 data URL。
 *
 * 为什么要过滤：页面上还挂着 Monaco 的 codicon 等一两百 KB 的图标字体，一次导出根本用不着，
 * 不筛就白取白塞。判定用计算样式里的 font-family（KaTeX 的 `KaTeX_Main` / 站内的
 * `JetBrains Mono Web` 都在里面），所以升版换字体都不用改这里。
 *
 * 取不到的字体保留原 URL：在 SVG 图片里加载失败会自动退回下一款，出图不至于整次失败。
 * @param {HTMLElement} root 已渲染好的正文
 * @returns {Promise<string>}
 */
function buildFontCss(root) {
  const families = collectUsedFamilies(root)
  const rules = collectFontFaceRules(families)
  return Promise.all(
    rules.map(async ({ text, base }) => {
      const values = Array.from(text.matchAll(URL_PATTERN), (match) => match[2])
      const sources = new Map()
      await Promise.all(
        values.map(async (value) => {
          if (value.startsWith('data:') || sources.has(value)) return
          const absolute = new URL(value, base).href
          if (!fontSourceCache.has(absolute)) {
            fontSourceCache.set(absolute, fetchAsDataUrl(absolute))
          }
          sources.set(value, await fontSourceCache.get(absolute))
        }),
      )
      return text.replace(URL_PATTERN, (match, quote, value) => {
        const data = sources.get(value)
        return data ? `url(${data})` : match
      })
    }),
  ).then((list) => list.join('\n'))
}

/** 子树里出现过的所有 font-family 名（小写、去引号），用于筛 @font-face */
function collectUsedFamilies(root) {
  const families = new Set()
  const walk = (element) => {
    const value = getComputedStyle(element).fontFamily
    for (const part of value.split(',')) {
      const name = part.trim().replace(/^['"]|['"]$/g, '').toLowerCase()
      if (name) families.add(name)
    }
    for (const child of element.children) walk(child)
  }
  walk(root)
  return families
}

/** @returns {{text: string, base: string}[]} */
function collectFontFaceRules(families) {
  const rules = []
  for (const sheet of document.styleSheets) {
    let list
    try {
      list = sheet.cssRules
    } catch {
      continue // 跨域样式表读 cssRules 会抛
    }
    for (const rule of list) {
      if (rule.type !== CSSRule.FONT_FACE_RULE) continue
      const declared = /font-family:\s*([^;]+);/i
        .exec(rule.cssText)?.[1]
        ?.trim()
        .replace(/^['"]|['"]$/g, '')
        .toLowerCase()
      if (declared && !families.has(declared)) continue
      rules.push({ text: rule.cssText, base: sheet.href || location.href })
    }
  }
  return rules
}

/**
 * 克隆一棵子树并把计算样式内联进去（导出链路里唯一需要「抄样式」的地方）。
 * 文本节点逐字保留；元素用 cloneNode(false) 保住属性，再递归处理子节点。
 * @param {Node} node
 * @returns {Node}
 */
function cloneWithStyles(node) {
  if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.nodeValue ?? '')
  const clone = node.cloneNode(false)
  if (node.nodeType === Node.ELEMENT_NODE) {
    const computed = getComputedStyle(node)
    for (const property of STYLE_PROPERTIES) {
      const value = computed.getPropertyValue(property)
      if (value) clone.style.setProperty(property, value)
    }
    if (node instanceof SVGElement) {
      for (const property of SVG_STYLE_PROPERTIES) {
        const value = computed.getPropertyValue(property)
        if (value) clone.style.setProperty(property, value)
      }
    }
  }
  for (const child of node.childNodes) clone.appendChild(cloneWithStyles(child))
  return clone
}

/**
 * SVG 字符串 → 可 drawImage 的 Image。
 *
 * 【必须走 data URL，不能用 blob URL】（2026-10-21 实测）：Chrome 把「blob URL + foreignObject」
 * 出来的图画进 canvas 后会把 canvas 标成被污染，`toDataURL` 直接抛 SecurityError；
 * 同一份字符串换成 data URL 就干净。
 *
 * 【编码用 percent-encoding，不用 base64】Safari 对超长 base64 data URL 的 SVG 图片有解码问题，
 * 且 base64 还要先过一遍 FileReader（异步 + 大字符串）；`encodeURIComponent` 是 html-to-image
 * 一类库长期走的写法，Unicode 文字也一并处理了。
 *
 * 【加载后要 decode()】Safari 的 `onload` 只代表解码完成，栅格化可能还没落位，紧接着 drawImage
 * 会画出整张空白。`decode()` 是标准 API，Chrome 上幂等。
 *
 * @param {string} svg
 * @returns {Promise<HTMLImageElement>}
 */
async function loadSvgImage(svg) {
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  const image = new Image()
  await withTimeout(
    new Promise((resolve, reject) => {
      image.onload = resolve
      image.onerror = () => {
        const error = new Error('markdown image: svg decode failed')
        error.code = 'MD_IMAGE_UNREADABLE'
        reject(error)
      }
      image.src = dataUrl
    }),
    STEP_TIMEOUT,
    'MD_IMAGE_TIMEOUT',
  )
  try {
    // 有的实现里 decode() 会一直不落定（图片不在文档里时尤甚），同样给个上限
    await withTimeout(image.decode(), STEP_TIMEOUT, 'MD_IMAGE_TIMEOUT')
  } catch {
    /* 解码失败 / 超时交给调用方的空白检测兜底 */
  }
  return image
}

/**
 * 空白兜底：Safari 有过「onload 成功、decode 也过，但 drawImage 出来一片空白」的历史问题，
 * 而空图对用户毫无意义。把图缩到 64×64 量一下着墨量 —— 与左上角（永远是留白底色）一致的
 * 像素占据全部就判定为空。
 * 顺带把「canvas 被污染」也在这里暴露出来（`getImageData` 会抛），免得后面 toBlob 才炸。
 * @param {HTMLCanvasElement} canvas
 */
function assertNotBlank(canvas) {
  let data
  try {
    const thumb = document.createElement('canvas')
    thumb.width = 64
    thumb.height = 64
    const context = thumb.getContext('2d')
    context.drawImage(canvas, 0, 0, 64, 64)
    data = context.getImageData(0, 0, 64, 64).data
  } catch {
    const error = new Error('markdown image: canvas is not readable')
    error.code = 'MD_IMAGE_UNREADABLE'
    throw error
  }
  const [r, g, b] = data
  for (let i = 4; i < data.length; i += 4) {
    if (
      Math.abs(data[i] - r) > 8 ||
      Math.abs(data[i + 1] - g) > 8 ||
      Math.abs(data[i + 2] - b) > 8
    ) {
      return
    }
  }
  const error = new Error('markdown image: nothing was painted')
  error.code = 'MD_IMAGE_BLANK'
  throw error
}

/** 出图的底色：与预览共用的那块「地面」 */
function themeBackground() {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue('--bg-editor-pane')
    .trim()
  return value || '#181818'
}

/**
 * 把一段 Markdown（编辑器选区，或没有选区时的整篇）渲染成 canvas。
 *
 * 渲染器未下载时抛 `code === 'MD_RUNTIME_MISSING'`（由 mdRuntime.loadMdRenderer 抛出），
 * 调用方据此回落 codeImage —— 这里不自己兜底，免得两套画法在本模块里缠在一起。
 *
 * @param {object} options
 * @param {string} options.source Markdown 原文
 * @param {'medium'|'high'|'ultra'} [options.quality='high'] 导出质量（复用 codeImageQuality）
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function renderMarkdownCanvas({ source, quality = 'high' } = {}) {
  const scopeAttribute = findScopeAttribute()
  if (!scopeAttribute) {
    const error = new Error('markdown image: preview styles are unavailable')
    error.code = 'MD_IMAGE_UNAVAILABLE'
    throw error
  }

  const host = createHost(scopeAttribute)
  document.body.appendChild(host)
  try {
    await renderMarkdown(String(source ?? ''), host)
    await ensureRuntimeStylesheet()
    // 公式字体就位后再量高度：KaTeX 的上下标高度完全取决于那 20 个 woff2。
    // 但 Safari 里只要有一个字体一直 pending，`fonts.ready` 就永不落定 —— 只等到 STEP_TIMEOUT，
    // 到点还没好就按兜底字体出图（行高会略歪，也好过整次导出挂死）。
    await withTimeout(document.fonts.ready, STEP_TIMEOUT, 'MD_IMAGE_TIMEOUT').catch(() => {})
    await inlineImages(host)
    await nextFrame()

    const rect = host.getBoundingClientRect()
    const width = Math.round(rect.width)
    const height = Math.ceil(rect.height)
    if (!width || !height) throw new Error('markdown image: empty layout')

    const background = themeBackground()
    const fontCss = await buildFontCss(host)
    const clone = cloneWithStyles(host)
    // 离屏容器的几何是量尺寸用的，进 SVG 前必须改回「一块静态的、定宽的文档」
    clone.style.setProperty('position', 'static')
    clone.style.setProperty('left', 'auto')
    clone.style.setProperty('top', 'auto')
    clone.style.setProperty('margin', '0')
    clone.style.setProperty('width', `${width}px`)
    clone.style.setProperty('height', `${height}px`)
    clone.style.setProperty('overflow', 'visible')
    clone.style.setProperty('background-color', background)

    const inner = new XMLSerializer().serializeToString(clone)
    const svg = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
      `<style><![CDATA[${fontCss}]]></style>`,
      `<foreignObject x="0" y="0" width="${width}" height="${height}">`,
      `<div xmlns="${XHTML_NS}">${inner}</div>`,
      '</foreignObject>',
      '</svg>',
    ].join('')

    const image = await loadSvgImage(svg)

    const size = fitCanvas(width, height, imageQualityScale(quality))
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const context = canvas.getContext('2d')
    context.fillStyle = background
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    assertNotBlank(canvas)
    return canvas
  } finally {
    host.remove()
  }
}
