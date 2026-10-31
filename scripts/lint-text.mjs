#!/usr/bin/env node
/**
 * 中文字面量审计（2026-10-31 建，`npm run lint:text`）
 *
 * 【为什么需要它】HANDOFF §1 硬约束：**组件 / composable / service 里不许出现中文字面量**，
 * 文案一律写进 `src/i18n/messages/<域>.js` 并中英两栏并排。这条规矩靠人记必漏：
 * 加个 `console.warn('题目导入失败')`、模板里顺手写一句 `title="复制"`，
 * 构建不报错、页面在中文下也「看起来正常」，只有切到英文才露馅 —— 而没人天天切英文。
 *
 * 【判据】扫描 `src/**` 下的 .vue / .js / .mjs，把**注释**、`<style>` 块和**正则字面量**挖掉之后，
 * 凡是还带汉字的位置都报出来，分两类：
 *  1. `string-cjk`   —— 字符串字面量里出现汉字（含模板属性值，如 `title="复制"`）。
 *  2. `template-cjk` —— 模板文本节点里出现汉字（`<button>保存</button>`）。
 *
 * 【严重级别】按文件分：`.vue` 里的中文是界面文案，切断言（退出码 1）；composables / services
 * 里的多半是 console 日志、`throw new Error('…')`、平台名这类内部常量，记提示（退出码 0）。
 * `--strict` 时提示也算失败。
 *
 * 【放行】`src/i18n/**` 是文案的家，整目录跳过。个别必须写中文的地方
 * （外部接口要求的常量、按中文分词写死的名字）在该行加 `lint-text-ok` 注释即可。
 *
 * 【用法】`node scripts/lint-text.mjs [目录] [--strict]`
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const ARGS = process.argv.slice(2)
const STRICT = ARGS.includes('--strict')
const SCAN_DIR = path.resolve(ARGS.find((a) => !a.startsWith('--')) ?? path.join(ROOT, 'src'))

/** 文案的家，整目录跳过 */
const SKIP_DIR = [path.join('src', 'i18n')]

/** 汉字：字符串里只要有汉字就算命中（`'—'`、`'…'` 这种占位符不算） */
const HAN = /[\u3400-\u4dbf\u4e00-\u9fff]/

/** 文本节点：汉字或中文标点都算 */
const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\u3001\u3002\uff01\uff08\uff09\uff0c\uff1a\uff1b\uff1f]/

const RULES = {
  'string-cjk': '字符串字面量里有中文（文案该进 src/i18n/messages）',
  'template-cjk': '模板文本 / 非字符串位置有中文（文案该进 src/i18n/messages）',
}

/**
 * 严重级别按**文件**分，不按位置分：
 *  - `.vue` 里的中文 = 界面文案，一定会被用户看见，切断言（error）；
 *  - 其余（composables / services）里的中文多半是 console 日志、`throw new Error('…')`、
 *    平台名之类的内部常量 —— 它们不上界面，但确实绕过了 i18n，记成提示（warn）。
 * 这样 `npm run lint:text` 今天是绿的，而「往模板里顺手写一句中文」会立刻变红。
 */
const levelOf = (file) => (file.endsWith('.vue') ? 'error' : 'warn')

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      if (SKIP_DIR.some((d) => full.endsWith(d))) continue
      walk(full, out)
    } else if (/\.(vue|js|mjs)$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

const findings = []
const report = (rule, file, line, snippet) => {
  findings.push({ rule, file: path.relative(ROOT, file), line, snippet })
}

const countNl = (s) => (s.match(/\n/g) || []).length

/**
 * 斜杠前面是这些字符时，它开的是正则而不是除法。
 * 少判一个（例如把 `)` 也算进来）顶多漏掉一次正则，多判一个就会把除号后面的代码当成正则整段吞掉，
 * 所以这里只列「几乎只可能出现在表达式开头」的那些。
 */
const REGEX_PREV = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '~', '^', '<', '>'])

/**
 * 逐字符扫一遍，把「字符串里的中文」和「其余位置的中文」分开报。
 *
 * 为什么要自己走一遍而不是逐行正则：注释里全是中文（这个仓库的注释写得比代码长），
 * 逐行判断分不清 `// 保存` 和 `title="保存"`；而注释标记本身也可能出现在字符串里
 * （`'https://…'` 里的 `//`），正则替换会当场把代码咬掉半截。
 */
function scan(src, file, isVue) {
  let i = 0
  let line = 1
  // 上一个非空白字符：用来区分「除号」和「正则开头」（`/"/g` 里的 `"` 不是字符串起点）
  let prev = ''

  // 单行文本片段收集：同一行连续的中文并成一条，别一个字报一次
  let textStartLine = 0
  let textBuf = ''

  const flushText = () => {
    // 收尾的尖括号 / 冒号只是把「标签边界」并进来了，去掉再判断，免得把 `保存<` 当成文案
    const clean = textBuf.trim().replace(/[\s{}()[\]<>,.:;|=+-]+$/, '')
    if (clean) report('template-cjk', file, textStartLine, clean.slice(0, 80))
    textBuf = ''
  }

  const pushText = (ch, ln) => {
    if (!textBuf) textStartLine = ln
    textBuf += ch
    // 中文之间夹的空白 / 标点不打断，但遇到换行要断开
    if (ch === '\n') flushText()
  }

  while (i < src.length) {
    const ch = src[i]

    // 注释：整段跳过，行号照数
    if (ch === '/' && src[i + 1] === '/') {
      flushText()
      while (i < src.length && src[i] !== '\n') i += 1
      continue
    }
    if (ch === '/' && src[i + 1] === '*') {
      flushText()
      const end = src.indexOf('*/', i + 2)
      const stop = end === -1 ? src.length : end + 2
      line += countNl(src.slice(i, stop))
      i = stop
      continue
    }
    // 正则字面量：`/[,，、;；\s]+/` 里的中文是代码不是文案。
    // 判据只看斜杠**前面**那个字符（`(` `,` `=` `:` 之后是正则；字母 / `)` / `]` 之后是除号），
    // 不这么分的话，`?"/g` 里的 `"` 会被当成字符串开头，从此整个文件的行号全错位
    if (ch === '/' && REGEX_PREV.has(prev)) {
      flushText()
      i += 1
      let inClass = false
      while (i < src.length) {
        const c = src[i]
        if (c === '\\') {
          i += 2
          continue
        }
        if (c === '\n') break // 正则不跨行，说明前面判错了，别把后面整段吃掉
        if (c === '[') inClass = true
        else if (c === ']') inClass = false
        else if (c === '/' && !inClass) {
          i += 1
          break
        }
        i += 1
      }
      prev = '/'
      continue
    }
    // HTML 注释（.vue）
    if (isVue && src.startsWith('<!--', i)) {
      flushText()
      const end = src.indexOf('-->', i + 4)
      const stop = end === -1 ? src.length : end + 3
      line += countNl(src.slice(i, stop))
      i = stop
      continue
    }
    // <style> 块整段跳过：CSS 里的中文只可能是注释（已被上面的 /* */ 处理），
    // 真出现 content: "中文" 也属于样式层的事，不归这个脚本管
    if (isVue && src.startsWith('<style', i)) {
      flushText()
      const end = src.indexOf('</style>', i)
      const stop = end === -1 ? src.length : end + '</style>'.length
      line += countNl(src.slice(i, stop))
      i = stop
      continue
    }
    // 字符串字面量：整段读到底，看里面有没有中文
    if (ch === '"' || ch === "'" || ch === '`') {
      flushText()
      const quote = ch
      const startLine = line
      let body = ''
      i += 1
      while (i < src.length && src[i] !== quote) {
        if (src[i] === '\\') {
          body += src[i]
          i += 1
        }
        if (src[i] === '\n') line += 1
        body += src[i]
        i += 1
      }
      i += 1
      if (HAN.test(body)) {
        report('string-cjk', file, startLine, `${quote}${body.trim().slice(0, 80)}${quote}`)
      }
      prev = quote
      continue
    }

    if (ch === '\n') {
      flushText()
      line += 1
      i += 1
      continue
    }

    if (CJK.test(ch)) {
      pushText(ch, line)
      prev = ch
      i += 1
      continue
    }

    // 中文两边紧邻的空白 / 标点并进同一条，别把「行 { line }」拆散
    if (textBuf && /[\s{}()[\]<>,.:;|=+-]/.test(ch)) {
      textBuf += ch
      prev = ch
      i += 1
      continue
    }
    flushText()
    if (!/\s/.test(ch)) prev = ch
    i += 1
  }
  flushText()
}

// 带 `lint-text-ok` 的行整行放行（写在这些行上的中文是有理由的）
const OPT_OUT = /lint-text-ok/

for (const file of walk(SCAN_DIR).sort()) {
  const src = fs.readFileSync(file, 'utf8')
  const before = findings.length
  scan(src, file, file.endsWith('.vue'))

  for (let k = findings.length - 1; k >= before; k -= 1) {
    const f = findings[k]
    const text = src.split('\n')[f.line - 1] ?? ''
    if (OPT_OUT.test(text)) findings.splice(k, 1)
  }
}

if (findings.length === 0) {
  console.log('文案审计通过：组件 / composable / service 里没有中文，文案都在 src/i18n。')
  process.exit(0)
}

for (const f of findings) f.level = levelOf(f.file)

const byLevel = { error: [], warn: [] }
for (const f of findings) byLevel[f.level].push(f)

const title = { error: '错误（阻断）', warn: '提示（内部日志 / 常量，不阻断）' }
for (const level of ['error', 'warn']) {
  const list = byLevel[level]
  if (list.length === 0) continue
  console.log(`\n${title[level]} · ${list.length} 处`)

  const byRule = new Map()
  for (const f of list) {
    if (!byRule.has(f.rule)) byRule.set(f.rule, [])
    byRule.get(f.rule).push(f)
  }
  for (const [rule, group] of byRule) {
    console.log(`\n  [${rule}] ${RULES[rule]}  (${group.length})`)
    for (const f of group) console.log(`    ${f.file}:${f.line}  ${f.snippet}`)
  }
}

const { error, warn } = byLevel
console.log('')
if (error.length) {
  console.log(`错误 ${error.length} 处：界面文案必须走 src/i18n/messages/<域>.js 的中英两栏。`)
}
if (warn.length) {
  console.log(`提示 ${warn.length} 处：内部日志 / 抛错 / 平台名，不上界面，但也没走 i18n。`)
}
if (error.length || (STRICT && warn.length)) process.exit(1)
process.exit(0)
