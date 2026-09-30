/**
 * prepare-md-runtime —— 把 Markdown / LaTeX 渲染器（katex + marked）从 node_modules
 * 落到 `public/md/`，让它能像 `public/wasm/` 下的本地运行时一样「按需下载」。
 *
 * 为什么必须是固定路径、而不是跟着打包产物走：
 * 1) 打包产物带内容哈希，页面事先列不出「要下载哪些文件」，也就没法做下载进度与完整性校验；
 * 2) `cp-precache-manifest` 只收集 rollup 的输出，`public/` 下的文件不会进预缓存清单 ——
 *    这正是我们要的：没下载过的用户，外壳里没有它任何一份。
 *
 * 为什么只保留 woff2：katex 的 CSS 同时引 woff 与 ttf 两套回退，全拷是 1.1MB，
 * 而 woff2 一共 296KB（20 个字重），现代浏览器都支持。
 *
 * 产物：
 *   public/md/katex.min.js      公式渲染（UMD，暴露 window.katex）
 *   public/md/katex.min.css     公式样式（@font-face 已裁成只剩 woff2）
 *   public/md/marked.min.js     Markdown 解析（UMD，暴露 window.marked）
 *   public/md/fonts/*.woff2     20 个公式字体
 *   public/md/assets.json       { katex, marked, bytes, assets[] } —— 下载清单的唯一出处
 *
 * 用法：node scripts/prepare-md-runtime.mjs（`npm run dev` / `npm run build` 前会自动跑）
 */

import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const KATEX_DIST = join(ROOT, 'node_modules/katex/dist')
const MARKED_DIST = join(ROOT, 'node_modules/marked')
const OUT = join(ROOT, 'public/md')

function readPackageVersion(name) {
  return JSON.parse(readFileSync(join(ROOT, `node_modules/${name}/package.json`), 'utf8')).version
}

/**
 * 把 @font-face 里的 woff / ttf 回退项裁掉，只留 woff2。
 * 每条形如 `src:url(fonts/KaTeX_AMS-Regular.woff2) format("woff2"),url(…woff) format("woff"),url(…ttf) format("truetype")`，
 * 所以按「逗号 + woff 项 + ttf 项」整段替换，改完再断言没有残留。
 */
function stripLegacyFontFormats(css) {
  const trimmed = css.replace(
    /,url\(fonts\/[^)]+\.woff\) format\("woff"\),url\(fonts\/[^)]+\.ttf\) format\("truetype"\)/g,
    '',
  )
  const left = trimmed.match(/fonts\/[^)]+\.(?:woff|ttf)\)/g)
  if (left) throw new Error(`CSS 里仍有 woff/ttf 引用：${left.slice(0, 3).join(', ')}`)
  return trimmed
}

function main() {
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(join(OUT, 'fonts'), { recursive: true })

  const css = stripLegacyFontFormats(readFileSync(join(KATEX_DIST, 'katex.min.css'), 'utf8'))
  writeFileSync(join(OUT, 'katex.min.css'), css)
  cpSync(join(KATEX_DIST, 'katex.min.js'), join(OUT, 'katex.min.js'))
  cpSync(join(MARKED_DIST, 'marked.min.js'), join(OUT, 'marked.min.js'))

  const fontNames = []
  for (const file of readdirSync(join(KATEX_DIST, 'fonts')).sort()) {
    if (!file.endsWith('.woff2')) continue
    cpSync(join(KATEX_DIST, 'fonts', file), join(OUT, 'fonts', file))
    fontNames.push(file)
  }

  const assets = [
    '/md/katex.min.css',
    '/md/katex.min.js',
    '/md/marked.min.js',
    ...fontNames.map((name) => `/md/fonts/${name}`),
  ]
  const bytes = assets.reduce((sum, url) => sum + statSync(join(OUT, url.slice('/md/'.length))).size, 0)

  writeFileSync(
    join(OUT, 'assets.json'),
    `${JSON.stringify(
      { katex: readPackageVersion('katex'), marked: readPackageVersion('marked'), bytes, assets },
      null,
      2,
    )}\n`,
  )

  console.log(
    `prepare-md-runtime: ${assets.length} 个文件，共 ${(bytes / 1024).toFixed(0)}KB ` +
      `(katex ${readPackageVersion('katex')} / marked ${readPackageVersion('marked')})`,
  )
}

main()