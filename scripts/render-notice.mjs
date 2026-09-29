/**
 * render-notice —— 把根目录的 `NOTICE.md` 生成成可部署、可打开的静态页 `notice.html`。
 *
 * 为什么要有这一步：`NOTICE.md` 是第三方组件清单的**唯一出处**（分发义务），
 * 但它躺在仓库里，站点访客打不开。手抄一份 HTML 等于多一个会漂移的副本，
 * 所以这里按「构建期从源文件生成」处理——改 `NOTICE.md` 之后跑一次 `npm run notice`
 * （或 `npm run build` 之前先跑），页面就跟着更新。**别手改 notice.html。**
 *
 * 依赖纪律：不引第三方的 markdown 解析器（本项目新增 npm 包要先讨论）。
 * `NOTICE.md` 是我们自己维护的文件，语法固定在下面这个子集里，够用且不会被上游改坏：
 *
 *   标题 (# / ## / ###)   段落   无序列表 (-)   有序列表 (1.)
 *   表格（GFM 管道语法）   围栏代码块 (``` 带语言名)   引用块 (>)   分隔线 (---)
 *   行内：`代码` / **加粗** / [文字](http 或 https 链接)
 *
 * 除此之外的语法一律按纯文本原样输出（会转义），不会吞内容。
 *
 * 用法：
 *   node scripts/render-notice.mjs          # 写 notice.html
 *   node scripts/render-notice.mjs --check  # 只校验 notice.html 是否是最新的（不一致就退出码 1）
 */

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SOURCE = fileURLToPath(new URL('../NOTICE.md', import.meta.url))
const TARGET = fileURLToPath(new URL('../notice.html', import.meta.url))

/** 生成标记：源文件摘要写进 HTML 注释，--check 靠它判断有没有过期 */
const HASH_RE = /generated-from-notice\.md sha256:([0-9a-f]{12})/

const escapeHtml = (text) =>
  String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/**
 * 行内标记。顺序有讲究：先整体转义，再把代码片段换成占位符保护起来，
 * 最后才处理加粗与链接——否则 `**<vector>**` 这类内容会被 HTML 解析吃掉。
 * @param {string} text
 * @returns {string}
 */
function inline(text) {
  const codes = []
  let out = escapeHtml(text).replace(/`([^`]+)`/g, (_match, code) => {
    codes.push(code)
    return `\u0000${codes.length - 1}\u0000`
  })

  out = out
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // 只认 http/https：这份文件里的链接全是上游仓库地址，顺带挡掉伪协议
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
    )

  return out.replace(/\u0000(\d+)\u0000/g, (_match, index) => `<code>${codes[Number(index)]}</code>`)
}

/** 表格行 → 单元格数组（去掉首尾那两个空串） */
const splitRow = (line) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())

const isDelimiterRow = (line) => /^\|[\s:|-]+\|$/.test(line.trim())
const isTableRow = (line) => /^\|.*\|$/.test(line.trim())

/**
 * NOTICE.md → `<main class="doc">` 的内含 HTML。
 * @param {string} markdown
 * @returns {string}
 */
export function renderNoticeBody(markdown) {
  const lines = String(markdown).replace(/\r\n?/g, '\n').split('\n')
  const out = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()

    // 空行：块与块之间的分隔，本身不产出内容
    if (!trimmed) {
      index += 1
      continue
    }

    // 围栏代码块
    const fence = trimmed.match(/^```(\w*)$/)
    if (fence) {
      const code = []
      index += 1
      while (index < lines.length && lines[index].trim() !== '```') {
        code.push(lines[index])
        index += 1
      }
      index += 1 // 跳过收尾的 ```
      const className = fence[1] ? ` class="language-${escapeHtml(fence[1])}"` : ''
      out.push(`<pre><code${className}>${escapeHtml(code.join('\n'))}</code></pre>`)
      continue
    }

    // 标题
    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      const level = heading[1].length
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`)
      index += 1
      continue
    }

    // 分隔线
    if (/^-{3,}$/.test(trimmed)) {
      out.push('<hr />')
      index += 1
      continue
    }

    // 表格（表头 + |---| 分隔行）
    if (isTableRow(line) && index + 1 < lines.length && isDelimiterRow(lines[index + 1])) {
      const head = splitRow(line)
      const rows = []
      index += 2
      while (index < lines.length && isTableRow(lines[index])) {
        rows.push(splitRow(lines[index]))
        index += 1
      }
      const headHtml = head.map((cell) => `<th>${inline(cell)}</th>`).join('')
      const bodyHtml = rows
        .map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join('')}</tr>`)
        .join('\n              ')
      out.push(
        [
          '<div class="table-wrap">',
          '  <table>',
          `    <thead><tr>${headHtml}</tr></thead>`,
          `    <tbody>${bodyHtml}</tbody>`,
          '  </table>',
          '</div>',
        ].join('\n'),
      )
      continue
    }

    // 引用块 → 与 guide.html 同款的浅底提示块
    if (/^>/.test(trimmed)) {
      const quoted = []
      while (index < lines.length && /^>/.test(lines[index].trim())) {
        quoted.push(lines[index].trim().replace(/^>\s?/, ''))
        index += 1
      }
      out.push(`<p class="note">${inline(quoted.join(' '))}</p>`)
      continue
    }

    // 列表（不嵌套；NOTICE.md 里的列表都是平铺的）
    const bullet = /^[-*]\s+/.test(trimmed)
    const numbered = /^\d+\.\s+/.test(trimmed)
    if (bullet || numbered) {
      const items = []
      const test = bullet ? /^[-*]\s+/ : /^\d+\.\s+/
      while (index < lines.length && test.test(lines[index].trim())) {
        items.push(inline(lines[index].trim().replace(test, '')))
        index += 1
      }
      const tag = bullet ? 'ul' : 'ol'
      out.push(`<${tag}>${items.map((item) => `<li>${item}</li>`).join('')}</${tag}>`)
      continue
    }

    // 段落：连续的非空行并成一段
    const paragraph = []
    while (index < lines.length) {
      const current = lines[index]
      const currentTrimmed = current.trim()
      if (
        !currentTrimmed ||
        /^```/.test(currentTrimmed) ||
        /^#{1,6}\s/.test(currentTrimmed) ||
        /^-{3,}$/.test(currentTrimmed) ||
        /^>/.test(currentTrimmed) ||
        /^[-*]\s+/.test(currentTrimmed) ||
        /^\d+\.\s+/.test(currentTrimmed) ||
        isTableRow(current)
      ) {
        break
      }
      paragraph.push(currentTrimmed)
      index += 1
    }
    out.push(`<p>${inline(paragraph.join(' '))}</p>`)
  }

  return out.join('\n        ')
}

/** 整页外壳：与 guide.html 同一套类名与主题同步脚本，两页观感一致 */
function renderPage(body, hash) {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/src/styles/guide.css" />
    <link rel="canonical" href="https://www.998244353.best/notice.html" />
    <meta
      name="description"
      content="unnamed 的完整第三方开源组件清单：运行时分发依赖、本地沙箱工具链、界面素材、浏览器扩展、构建期工具与外部评测服务的版本、许可证与落点。"
    />
    <title>unnamed 第三方开源组件与许可（完整清单）</title>
    <!--
      本文件由 scripts/render-notice.mjs 从根目录的 NOTICE.md 生成，请勿手改。
      改完 NOTICE.md 后跑：npm run notice
      generated-from-notice.md sha256:${hash}
    -->
    <script>
      try {
        var saved = JSON.parse(localStorage.getItem('cph.editorSettings'))
        var theme = saved && saved.theme
        if (theme === 'light' || theme === 'cph-light') {
          document.documentElement.dataset.theme = 'light'
        }
      } catch (error) {
        /* 隐私模式或存档损坏：按默认深色渲染即可 */
      }
    </script>
  </head>
  <body>
    <div class="page">
      <header class="page__top">
        <a class="brand" href="/">
          <span class="brand__mark" aria-hidden="true">&lt;/&gt;</span>
          <span class="brand__name">unnamed</span>
        </a>
        <a class="cta" href="/guide.html">返回使用指南</a>
      </header>

      <main class="doc">
        ${body}
      </main>

      <footer class="page__foot">
        <a class="cta" href="/">打开 unnamed</a>
        <p>本页由仓库根目录的 NOTICE.md 生成，以该文件为准。</p>
        <p>面向用户的精简版在使用指南的「致谢与开源许可」一节。</p>
      </footer>
    </div>
  </body>
</html>
`
}

/**
 * 生成整页 HTML。
 * @param {string} markdown NOTICE.md 的内容
 * @returns {string}
 */
export function renderNoticePage(markdown) {
  const hash = createHash('sha256').update(markdown).digest('hex').slice(0, 12)
  return renderPage(renderNoticeBody(markdown), hash)
}

/** 源文件摘要，写在生成标记里 */
export function sourceHash(markdown) {
  return createHash('sha256').update(markdown).digest('hex').slice(0, 12)
}

function main() {
  const markdown = readFileSync(SOURCE, 'utf8')
  const page = renderNoticePage(markdown)
  const check = process.argv.includes('--check')

  if (check) {
    let current = ''
    try {
      current = readFileSync(TARGET, 'utf8')
    } catch {
      console.error('notice.html 不存在，先跑 npm run notice')
      process.exit(1)
    }
    const found = current.match(HASH_RE)?.[1]
    if (found !== sourceHash(markdown)) {
      console.error(
        `notice.html 已过期（页面里是 ${found ?? '无标记'}，NOTICE.md 现在是 ${sourceHash(markdown)}）：跑 npm run notice 重新生成`,
      )
      process.exit(1)
    }
    console.log('notice.html 与 NOTICE.md 一致')
    return
  }

  writeFileSync(TARGET, page)
  console.log(`notice.html 已生成（来自 NOTICE.md，摘要 ${sourceHash(markdown)}）`)
}

// 只有直接被 node 执行时才写文件；被 import 时只导出纯函数
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main()
