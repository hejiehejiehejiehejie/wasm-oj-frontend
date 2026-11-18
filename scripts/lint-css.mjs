#!/usr/bin/env node
/**
 * CSS 静态审计（2026-10-31 建，`npm run lint:css`）
 *
 * 【为什么需要它】批量改 CSS（sed / 脚本替换 / 一次改几十个文件）最常砸坏的是
 * **选择器列表**：`.a:hover, .b:hover {}` 里的逗号被替换掉，就变成一条
 * `.a:hover .b:hover {}` 后代选择器 —— 语法完全合法，构建不报错，浏览器也不报错，
 * 只是**这条规则永远不命中**。2026-10-30 那一轮「全站 :hover 加 is-hoverable 前缀」
 * 一口气砸出四处（倒计时卡的解锁按钮恒 opacity:0 就是其中最明显的一处），
 * 而它们全都在 `npx vite build` 与 `npm run verify` 的眼皮底下溜过去了。
 *
 * 【判据】只用「结构上不可能 / 几乎不可能是本意」这类硬判据，不做风格检查：
 *
 * 阻断（error，退出码 1）——
 *  1. `selector-comma-missing` —— 跨行写出的选择器列表，中间某行没以逗号结尾
 *     （下一行以 `> + ~` 开头的不算，那是续行）。
 *  2. `selector-html-not-first` —— `html` / `:root` 出现在选择器的非首段。
 *     根元素不可能是别人的后代，这类选择器恒为假。
 *  3. `selector-repeated-class` —— 同一条选择器里同一个类名出现两次以上
 *     （`.x .y .x` 这种多半是两条规则被粘成了一条）。
 *  4. `hover-without-gate` —— 含 `:hover` 却漏了 `:where(html.is-hoverable)` 前缀
 *     （HANDOFF §1 硬约束：触屏 :hover 会粘滞）。guide / privacy 四页不走 main.js，
 *     拿不到这个类，故按文件放行。
 *  5. `color-hardcoded` —— 组件 / 非 base.css 的样式里写死十六进制颜色
 *     （HANDOFF §4：颜色只在 `src/styles/base.css` 定义，组件只读变量）。
 *     这类写死的颜色**不会跟着主题切换**，深色下好看、切到浅色就是一坨死色。
 *
 * 提示（warn，退出码 0；`--strict` 时一并算失败）——
 *  6. `radius-off-scale` —— 圆角不在 10 / 6 / 4 三档（HANDOFF §1.A）。
 *     全仓存量偏离已在 §1.A 里列明，逐条迁；判据的作用是**拦住新增的第四个值**。
 *  7. `radius-pill` —— `border-radius` 大到恒被夹成「高的一半」= 胶囊形（HANDOFF §1：
 *     按钮 / 芯片 / 徽标 / 提示条一律圆角矩形）。几何件（滚动条滑块、开关轨道、
 *     放大镜镜片）按设计就是要圆的，按选择器放行。
 *
 * 【为什么 warn 不阻断】6 / 7 两条的存量是 HANDOFF 明确登记过的欠账 ——
 * 一上来全飘红只会让人把整个脚本关掉。等哪天真迁完了，把 `--strict` 接进 CI 即可。
 *
 * 【为什么不用 postcss】它是 `postcss-pxtorem` 的传递依赖，不在 devDependencies 里；
 * 为了一个 linter 去动 package-lock 不值得（见 HANDOFF 里锁文件被 npm 版本改花的记录）。
 * 这里自带一个只认花括号 / 注释 / 字符串的极简扫描器，够用且零风险。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
// 允许把扫描目录当第一个参数传进来（自测用：拿 /tmp 里的一份坏样例验证判据还行不行）
const ARGS = process.argv.slice(2)
const STRICT = ARGS.includes('--strict')
const SCAN_DIR = path.resolve(ARGS.find((a) => !a.startsWith('--')) ?? path.join(ROOT, 'src'))

/** 不加载 main.js 的样式：拿不到 `<html>.is-hoverable`，悬停前缀按设计缺席 */
const NO_HOVER_GATE = [/styles[\\/]guide\.css$/, /styles[\\/]privacy\.css$/]

/** 唯一允许出现十六进制颜色的文件（HANDOFF §4：颜色只在这里定义） */
const COLOR_HOME = /styles[\\/]base\.css$/

/**
 * 例外：CF 段位色。这七档表达的是「选手段位」而不是界面层次，`CfCodeforcesPanel.vue`
 * 的文件头注释里明确写了「刻意不抽象成主题变量」，深色那组还把太暗的四支提亮过。
 * 按**值**放行而不是按文件放行 —— 该文件里出现这七个值以外的十六进制颜色照样报。
 */
const COLOR_OK_HEX = new Set(
  [
    '#9e9e9e', '#1fae1f', '#03a89e', '#5b8cff', '#d96cd9', '#ff8c00', '#ff5252', // 深色
    '#808080', '#008000', '#0000ff', '#aa00aa', '#ff0000', // 浅色
  ].map((c) => c.toLowerCase()),
)

/** 营销长文（guide / privacy）自有一套 4 / 7 / 8px 的圆角语言，别拿应用的档位去要求它 */
const NO_RADIUS_CHECK = [/styles[\\/]guide\.css$/, /styles[\\/]privacy\.css$/]

/** 圆角只有这三档（px，0 是「不圆」也允许） */
const RADIUS_SCALE = new Set([0, 4, 6, 10])

/** 胶囊形按设计就是要圆的几何件（HANDOFF §1「刻意不迁的形状」） */
const PILL_OK = [
  /\.oscroll-thumb/, // 滚动条滑块
  /\.switch\b/, // 设置页开关轨道
  /\.pk-switch__track/, // 抽题面板开关轨道
  /\.magnifier__lens/, // 拖拽放大镜镜片
]

/** 圆角按 §1.A「刻意不迁的形状」放行的选择器（值本身不在三档里，但有几何理由） */
const RADIUS_OK = [
  /\.notif/, // 通知卡：原型定的「便签」形态，与 10px 卡片语言故意不同档（连同它里面那几颗 2px）
  /\.sidebar-switcher__indicator/, // = 轨道 10 − 2×1px 内距，同心
  /\.sidebar-switcher__seg/,
  /\.editor-tabs__item/, // 页签：上两角 8px、下沿要接页签栏直线；悬停影子跟着页签走同值
  // 分屏窗格（与拖放高亮）：12 = 10px 岛圆角 + 2px 透明呼吸缝，同心 —— 与上面那条
  // sidebar-switcher__indicator 同一种「外框扣除内距」的算法，不是第四个圆角档位
  // （06:54 缝 8 → 4：边框 4px → 2px，外框 14 → 12，可见圆角 10 不变）
  /\.editor-grid__cell/,
  /\.editor-grid__drop/,
]

const RULES = {
  'selector-comma-missing': '选择器列表疑似少了逗号（多条选择器被粘成一条后代选择器，规则恒不命中）',
  'selector-html-not-first': 'html / :root 出现在非首段，这条选择器永远匹配不到',
  'selector-repeated-class': '同一条选择器里同一个类名出现多次，疑似两条规则被粘成一条',
  'hover-without-gate': ':hover 缺少 :where(html.is-hoverable) 前缀（HANDOFF §1 硬约束）',
  'color-hardcoded': '写死了十六进制颜色（HANDOFF §4：颜色只在 styles/base.css 定义）',
  'radius-off-scale': '圆角不在 10 / 6 / 4 三档（HANDOFF §1.A）',
  'radius-pill': '胶囊形圆角（HANDOFF §1：按钮 / 芯片 / 徽标一律圆角矩形）',
}

/** 前四条是结构上失效，必须为零；后三条是纪律与存量 */
const LEVEL = {
  'selector-comma-missing': 'error',
  'selector-html-not-first': 'error',
  'selector-repeated-class': 'error',
  'hover-without-gate': 'error',
  'color-hardcoded': 'error',
  'radius-off-scale': 'warn',
  'radius-pill': 'warn',
}

// ---------------------------------------------------------------- 文件收集

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      walk(full, out)
    } else if (entry.name.endsWith('.vue') || entry.name.endsWith('.css')) {
      out.push(full)
    }
  }
  return out
}

/** 取出文件里所有 CSS 片段（.vue 只取 <style> 块），带起始行号 */
function styleBlocks(file) {
  const text = fs.readFileSync(file, 'utf8')
  if (file.endsWith('.css')) return [{ css: text, startLine: 1 }]

  const blocks = []
  const re = /<style\b[^>]*>([\s\S]*?)<\/style>/g
  let m
  while ((m = re.exec(text)) !== null) {
    const before = text.slice(0, m.index + m[0].indexOf('>') + 1)
    blocks.push({ css: m[1], startLine: before.split('\n').length })
  }
  return blocks
}

// ---------------------------------------------------------------- 扫描器

const countNl = (s) => (s.match(/\n/g) || []).length

/**
 * 逐字符扫描：只在「规则列表」这一层攒 prelude（选择器或 @ 规则），
 * 遇到 `{` 就把攒下来的东西交出去，并按 `@` 与否决定里面是声明还是规则。
 *
 * onRule(prelude, line) —— 每个 `{` 之前的选择器 / @ 规则
 * onDecl(text, line)    —— 声明块里每条 `prop: value`（换行已被吃掉，行号靠 declLine 记）
 */
function walkRules(css, startLine, onRule, onDecl) {
  let i = 0
  let line = startLine
  let prelude = ''
  let preludeLine = startLine
  let declLine = startLine
  const stack = ['rules']

  const flushDecl = () => {
    if (prelude.trim()) onDecl(prelude, declLine)
    prelude = ''
    declLine = line
  }

  while (i < css.length) {
    const ch = css[i]

    if (ch === '\n') {
      line += 1
      // 换行要留在 prelude 里：判据 1 靠的正是「跨行写出来的选择器列表」这个形状，
      // 早期版本只数行号不保留换行，结果四条被粘成一条的选择器在扫描器眼里全是一行，一条都没报出来
      if (stack[stack.length - 1] === 'rules') prelude += '\n'
      i += 1
      continue
    }
    if (ch === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2)
      const stop = end === -1 ? css.length : end + 2
      line += countNl(css.slice(i, stop))
      i = stop
      continue
    }
    if (ch === '"' || ch === "'") {
      const quote = ch
      i += 1
      while (i < css.length && css[i] !== quote) {
        if (css[i] === '\\') i += 1
        if (css[i] === '\n') line += 1
        i += 1
      }
      i += 1
      continue
    }
    if (ch === '{') {
      onRule(prelude, preludeLine)
      stack.push(/^\s*@/.test(prelude) ? 'rules' : 'decls')
      prelude = ''
      i += 1
      preludeLine = line
      declLine = line
      continue
    }
    if (ch === '}') {
      if (stack[stack.length - 1] === 'decls') flushDecl()
      stack.pop()
      prelude = ''
      i += 1
      preludeLine = line
      declLine = line
      continue
    }
    if (stack[stack.length - 1] === 'decls') {
      if (ch === ';') flushDecl()
      else {
        if (prelude.trim() === '') declLine = line
        prelude += ch
      }
      i += 1
      continue
    }
    if (ch === ';') {
      // @import / @charset 这类以分号结尾的语句
      prelude = ''
      i += 1
      preludeLine = line
      continue
    }
    if (prelude.trim() === '') preludeLine = line
    prelude += ch
    i += 1
  }
}

// ---------------------------------------------------------------- 选择器分析

/** 按顶层逗号切分（`:is(.a, .b)` 里的逗号不算） */
function splitTopLevel(selector) {
  const parts = []
  let depth = 0
  let cur = ''
  let line = 0
  for (const ch of selector) {
    if (ch === '\n') line += 1
    if (ch === '(' || ch === '[') depth += 1
    if (ch === ')' || ch === ']') depth -= 1
    if (ch === ',' && depth === 0) {
      parts.push({ text: cur, line: line - countNl(cur) })
      cur = ''
      continue
    }
    cur += ch
  }
  parts.push({ text: cur, line: line - countNl(cur) })
  return parts
}

/** 按顶层组合符切分复合段，并记下每一段前面是哪种组合符（后代 = ' '） */
function splitCompounds(selector) {
  const out = []
  let depth = 0
  let cur = ''
  let pending = ' ' // 第一段前面没有组合符，按后代算（不会被用到）
  for (const ch of selector) {
    if (ch === '(' || ch === '[') depth += 1
    if (ch === ')' || ch === ']') depth -= 1
    const isCombinator = depth === 0 && (ch === '>' || ch === '+' || ch === '~' || /\s/.test(ch))
    if (isCombinator) {
      if (cur.trim()) {
        out.push({ text: cur.trim(), comb: pending })
        cur = ''
        pending = ' '
      }
      if (ch !== ' ' && ch !== '\t' && ch !== '\n') pending = ch
      continue
    }
    cur += ch
  }
  if (cur.trim()) out.push({ text: cur.trim(), comb: pending })
  return out
}

const classesOf = (compound) => (compound.match(/\.-?[_a-zA-Z][\w-]*/g) || []).map((c) => c.slice(1))

function analyzeSelector(selector, line, file, report) {
  const flat = selector.trim()
  if (!flat || flat.startsWith('@')) return

  // 判据 1：跨行写出的选择器列表，中间行必须以逗号收尾
  const rawLines = selector.split('\n')
  let commaHit = false
  if (rawLines.length > 1) {
    let ln = line
    for (let k = 0; k < rawLines.length - 1; k += 1) {
      const cur = rawLines[k].trim()
      const next = rawLines[k + 1].trim()
      if (cur && !cur.endsWith(',') && !/^[>+~]/.test(next)) {
        report('selector-comma-missing', file, ln, `${cur}  ⟶  ${next}`)
        commaHit = true
      }
      ln += 1
    }
  }
  // 逗号一丢，后面两条判据在这条规则上必然跟着报 —— 同一处只留根因，别刷三条
  if (commaHit) return

  for (const part of splitTopLevel(selector)) {
    const one = part.text.trim()
    if (!one) continue
    const at = line + part.line
    const compounds = splitCompounds(one)

    // 判据 2：html / :root 只能在首段
    if (compounds.length > 1) {
      let bad = false
      for (let k = 1; k < compounds.length; k += 1) {
        if (/(^|[^\w-])html(?![-\w])|:root/.test(compounds[k].text)) {
          report('selector-html-not-first', file, at, one)
          bad = true
          break
        }
      }
      if (bad) continue
    }

    // 判据 3：同一个类名在同一选择器里出现两次以上。
    // 只认「后代」位置的那一次 —— `.row + .row` 这种相邻兄弟写法是正经用法，
    // 报出来只会变成噪声（第一版就误报了 4 条 .setting-row / .engine）。
    const seen = new Set()
    let dup = null
    for (const compound of compounds) {
      for (const cls of classesOf(compound.text)) {
        if (seen.has(cls) && compound.comb === ' ') {
          dup = cls
          break
        }
        seen.add(cls)
      }
      if (dup) break
    }
    if (dup) report('selector-repeated-class', file, at, `.${dup}  ⟶  ${one}`)

    // 判据 4：:hover 必须过 is-hoverable 闸门
    if (
      one.includes(':hover') &&
      !one.includes('is-hoverable') &&
      !NO_HOVER_GATE.some((re) => re.test(file))
    ) {
      report('hover-without-gate', file, at, one)
    }
  }
}

// ---------------------------------------------------------------- 声明分析

/** 解析 `prop: value`，拿不到就丢掉（CSS 嵌套里被当成声明的 `& .x` 会落在这里） */
function parseDecl(text) {
  const m = text.match(/^\s*([-\w]+)\s*:\s*([\s\S]*)$/)
  if (!m) return null
  return { prop: m[1].toLowerCase(), value: m[2].trim() }
}

function analyzeDecl(decl, line, file, selector, report) {
  const d = parseDecl(decl)
  if (!d) return

  // 判据 5：十六进制颜色只许出现在 base.css
  if (!COLOR_HOME.test(file)) {
    const hexes = d.value.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []
    if (hexes.some((h) => !COLOR_OK_HEX.has(h.toLowerCase()))) {
      report('color-hardcoded', file, line, `${d.prop}: ${d.value}`)
    }
  }

  // 判据 6 / 7：圆角
  if (!/radius$/.test(d.prop)) return
  if (NO_RADIUS_CHECK.some((re) => re.test(file))) return

  // calc(6px * var(--menu-scale)) 这类：只认数字本身，var() 挖掉。
  // 不带单位的 `0` 也要算进来 —— 判断「贴边形状」靠的正是它（`0 1px 1px 0` 只有两个 px 数字）
  const naked = d.value.replace(/var\([^)]*\)/g, ' ')
  const nums = []
  for (const m of naked.matchAll(/(-?\d*\.?\d+)(px|%)|\b0\b(?![\d.])/g)) {
    if (m[2]) nums.push({ n: parseFloat(m[1]), u: m[2] })
    else nums.push({ n: 0, u: '' })
  }
  if (nums.length === 0) return // var(--x) / inherit 之类，静态看不出来

  const px = nums.filter((x) => x.u === 'px')

  // 胶囊：值大到恒被夹成高的一半。几何件按设计如此，放行
  if (px.some((x) => x.n >= 100)) {
    if (!PILL_OK.some((re) => re.test(selector))) {
      report('radius-pill', file, line, `${selector.trim()}  ⟶  ${d.value}`)
    }
    return
  }

  // 「两角圆、两角直」的贴边形状（页签的 8px 8px 0 0、附在边缘的 0 2px 2px 0）：
  // 有 0 角就说明这不是「一个四角一样的圆角矩形」，8px 在这里是贴着邻居算的，不算自创档位
  const hasZeroCorner = nums.length >= 3 && nums.some((x) => x.n === 0)
  if (hasZeroCorner) return
  if (RADIUS_OK.some((re) => re.test(selector))) return

  const off = px.filter((x) => !RADIUS_SCALE.has(x.n))
  if (off.length > 0) {
    report('radius-off-scale', file, line, `${selector.trim()}  ⟶  ${d.value}`)
  }
}

// ---------------------------------------------------------------- 主流程

const findings = []
const report = (rule, file, line, detail) => {
  findings.push({
    rule,
    level: LEVEL[rule],
    file: path.relative(ROOT, file),
    line,
    detail: detail.replace(/\s*\n\s*/g, ' '),
  })
}

for (const file of walk(SCAN_DIR).sort()) {
  for (const block of styleBlocks(file)) {
    // 声明要挂到「所属规则」上：胶囊放行、贴边形状判断都靠它
    let currentSelector = ''
    walkRules(
      block.css,
      block.startLine,
      (prelude, line) => {
        const head = prelude.trim()
        analyzeSelector(prelude, line, file, report)
        // @media / @supports 这类容器不是选择器，里面的规则会各自再报一次
        currentSelector = head.startsWith('@') ? '' : prelude
      },
      (decl, line) => analyzeDecl(decl, line, file, currentSelector, report),
    )
  }
}

if (findings.length === 0) {
  console.log('CSS 审计通过：选择器结构、颜色来源与圆角档位都没有问题。')
  process.exit(0)
}

const byLevel = { error: [], warn: [] }
for (const f of findings) byLevel[f.level].push(f)

const title = { error: '错误（阻断）', warn: '提示（存量 / 纪律，不阻断）' }
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
    for (const f of group) {
      console.log(`    ${f.file}:${f.line}  ${f.detail}`)
    }
  }
}

const { error, warn } = byLevel
console.log('')
if (error.length) {
  console.log(`错误 ${error.length} 处：这些规则语法合法、构建不报错，但永远不会按本意生效。`)
}
if (warn.length) {
  console.log(`提示 ${warn.length} 处：都是 HANDOFF §1 / §1.A 登记的存量偏离，逐条迁即可。`)
}
if (error.length || (STRICT && warn.length)) process.exit(1)
process.exit(0)
