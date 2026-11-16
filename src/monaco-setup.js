// ⚠️ Monaco 只有这一个入口，它本身不引 monaco-editor 的全量包 —— 按需引入的清单在
// editorBundle.js 里（那里写了为什么、以及升级 Monaco 后怎么复核）。
import { monaco } from './services/monaco/editorBundle.js'

// Monaco runs its editor-core work (tokenization / diff) in a web worker. Vite's
// `?worker` suffix bundles it as a separate module; the `monaco-editor/<subpath>`
// form is the public export map of monaco-editor 0.55+.
//
// C / C++ / Python / Markdown only ship a synchronous tokenizer, so the plain editor
// worker covers everything this tool needs. The json/css/html/ts workers Monaco
// normally ships are not even built any more (see editorBundle.js) — add the worker
// here only if a language that needs a real language service is ever introduced.
import editorWorker from 'monaco-editor/editor/editor.worker.js?worker'
// 副作用导入：在这里给 C / C++ / Python 注册静态补全 provider（见该文件头）。
// 放在 MonacoEnvironment 之前无妨 —— 注册 provider 不起 worker，worker 只在建 model 时才要。
import './services/monaco/completion.js'
// 同理：C / C++ 的静态悬停签名（见 hover.js 文件头）
import './services/monaco/hover.js'
// 副作用导入：把悬停气泡的尺寸与落点夹进编辑区（见 hoverBounds.js 文件头）。
// 必须在编辑器建起来之前执行 —— 它改的是 ContentHoverWidget 的原型方法
import './services/monaco/hoverBounds.js'

self.MonacoEnvironment = {
  getWorker() {
    return new editorWorker()
  },
}

// 卡片式布局要求编辑器内芯与卡片底色一致，否则圆角卡片的四角会露出主题自带的方角。
// gutter / minimap 必须一起改：它们在原主题里被写死成了别的底色。
// 这个 #181818 就是深色主题的 --bg-editor-pane，改一边就得改另一边。
//
// 【深色主题不覆盖任何 token 色】代码颜色就是 vs-dark 原色。之前整套按亮度压档的那版
// （rules 里 27 条 token + 括号色 / 行号 / 缩进参考线）实机看整体偏暗，已全部回退。
monaco.editor.defineTheme('dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#181818',
    'editorGutter.background': '#181818',
    'minimap.background': '#181818',
    // 光标所在行：整行铺底色，不要 2px 方框（Monaco 的 current-line-exact 装饰会同时画
    // 背景（lineHighlightBackground）和边框（lineHighlightBorder），两色取同一个值就只剩
    // 一条干净的色带）。底色取深色主题的 --bg-card（#252528）：比编辑区底 #181818 亮约
    // 4 阶，比先前试过的 --bg-tab-hover（#28282b）再暗一档 —— 那一档实机偏亮、有点抢眼。
    // 阶梯（由暗到亮，都是调色板里现成的值）：#181818 编辑区 → #1d1d1e 面板 →
    // #222225 面板头 → #252528 卡片 ← 当前 → #28282b 页签悬停。
    // 注意**不能**省略 —— 省略会退回注册表默认值（背景透明 + 边框 #282828），又变回那个灰框。
    // 浅色主题同理，见下面 light 主题的注释。
    'editor.lineHighlightBackground': '#252528',
    'editor.lineHighlightBorder': '#252528',
    // 行号。默认值（#858585，光标那一行再自动提亮到 #c6c6c6）跟正文灰得很近，
    // 一栏数字在左边一直是「满格」的，读代码时视线容易被它拉过去。这里整体压暗一档，
    // 让行号退成参考信息：普通行取 --text-faint，光标那一行取 --text-dim（仍保留
    // Monaco 固有的「当前行行号更亮」层级，只是两档都往下走了一格）。
    // 只影响代码文件 —— .md 的行号被 lineNumbers: 'md-off' 收掉了，看不见。
    'editorLineNumber.foreground': '#6d6d72',
    'editorLineNumber.activeForeground': '#9b9b9b',
    // 括号对的引导线：光标所在那一层的竖线 + 上下横线（见 indentGuides 的
    // .vertical / .horizontal-top / .horizontal-bottom）。这三项不配的话 Monaco 会兜底
    // 成括号色**原色**（#FFD700 / #DA70D6 / #179FFF），一整条线拉满饱和太抢眼。
    // 给成括号色的 70% 透明度（B3）：只压线，括号字符本身仍是 vs-dark 原色。
    'editorBracketPairGuide.activeBackground1': '#FFD700B3',
    'editorBracketPairGuide.activeBackground2': '#DA70D6B3',
    'editorBracketPairGuide.activeBackground3': '#179FFFB3',
  },
})

// 浅色版与之对应：内芯 = 浅色主题的 --bg-editor-pane
//
// 【语法配色：对齐 VS Code 的默认浅色主题 Light Modern】—— 2026-11-16 加（用户：
// 「如果配置开源的话，模仿 vscode 的 2026 浅色主题来做 monaco 中的颜色配置」）。
// 色值不是估的，取 VS Code 内置主题的**继承链实际结果**：`light_modern.json`（只覆盖
// workbench 色 + 前景 #3B3B3B）→ 引 `light_plus.json`（函数 / 类型 / 变量 / 常量 /
// 控制流）→ 再引 `light_vs.json`（注释 / 字符串 / 数字 / 关键字 / preprocessor）。
// 复核方式：在 VS Code 源码 `extensions/theme-defaults/themes/` 下看那三个文件。
//
// ⚠️ Monaco 的 token 名和 TextMate scope 是两套东西：C++ / Python 走 monarch，吐出来的
// 只有 keyword / identifier / number / string / comment / delimiter / type 这几档
// （实测 `monaco.editor.tokenize('…','cpp')` 的 type 集合见下），没有「函数 vs 变量」的
// 语义区分。所以下面每条都是**在 Monaco 能给到的粒度上**取 Light Modern 最接近的一档：
//   - `identifier` 按 `variable`（#001080）上色 —— VS Code 里变量是这支深蓝，函数是
//     #795E26；Monaco 分不出函数名，只能二选一。选了变量色：函数名跟着深蓝，
//     若哪天觉得「满屏深蓝」，把这条删掉就退回 base vs 的黑（其余规则不受影响）。
//   - `keyword.flow` 用 Light Modern 的紫 #AF00DB（light_plus 的 keyword.control）。
//     注意 C++ 的 return / if 在 VS Code 里仍是蓝（cpp grammar 不把它归进
//     keyword.control），但 monarch 只给到 `keyword`，所以这里实际只对 CSS / SCSS 那种
//     真吐 `keyword.flow` 的语言生效。
//   - `metatag` / `tag` / `attribute.*` 是给 Markdown / HTML 预览里的内联标签用的，
//     取 light_vs 的对应值（VS Code 里就是这套：标签 #800000、属性名 #E50000）。
//   - 括号配对的三色（#0431FA / #319331 / #7B3814）**不覆盖**：VS Code 浅色用的就是
//     这三支，等于已经对齐。
// 下面 colors 里那些「本项目自己调过」的项（行高亮 / 选区 / 同词高亮 / 缩进线 / 查找命中）
// **不跟 Light Modern** —— 它们的值是按可读性逐档量过的，理由写在各条注释里；照搬
// VS Code 的 #F5F5F5 / #ADD6FF 会把之前几轮调优全冲掉。行号是例外：vs 默认那支蓝
// #237893 是「一眼不像 VS Code」的主要来源，这轮改成 Light Modern 的灰（见下）。
monaco.editor.defineTheme('light', {
  base: 'vs',
  inherit: true,
  rules: [
    { token: '', foreground: '3B3B3B' },
    { token: 'comment', foreground: '008000' },
    { token: 'keyword', foreground: '0000FF' },
    { token: 'keyword.flow', foreground: 'AF00DB' },
    { token: 'string', foreground: 'A31515' },
    { token: 'number', foreground: '098658' },
    { token: 'regexp', foreground: '811F3F' },
    { token: 'type', foreground: '267F99' },
    { token: 'identifier', foreground: '001080' },
    { token: 'variable', foreground: '001080' },
    { token: 'constant', foreground: '0070C1' },
    { token: 'operator', foreground: '000000' },
    { token: 'delimiter', foreground: '3B3B3B' },
    { token: 'tag', foreground: '800000' },
    { token: 'metatag', foreground: '800000' },
    { token: 'attribute.name', foreground: 'E50000' },
    { token: 'attribute.value', foreground: '0451A5' },
  ],
  colors: {
    'editor.background': '#ffffff',
    // 正文前景：Light Modern 的 editor.foreground #3B3B3B（vs 原为纯黑）—— 柔一档，
    // 与上面 rules 的 `token: ''` 必须一致，否则未命中规则的那部分文字会和正文分家。
    'editor.foreground': '#3B3B3B',
    'editorGutter.background': '#ffffff',
    'minimap.background': '#ffffff',
    // 行号：vs 默认是蓝的（#237893），浅色下与语法里的关键字蓝撞在一起，也是「一眼不像
    // VS Code」的地方。改成 Light Modern 的两档：普通行 #6E7681（灰）、当前行 #171184
    // （深靛）—— 当前行仍然靠色相跳出来，但整栏不再是蓝色数字。
    'editorLineNumber.foreground': '#6E7681',
    'editorLineNumber.activeForeground': '#171184',
    // 光标所在行：与深色主题同口径，整行铺底色而非方框。边框取同色，免得又画出一圈边。
    // **2026-11-16 由 #e0e0e0 提到 #f0f0f0**（用户：「指针所在行的高亮颜色太深了」）。
    // 那一版取的是 --bg-control-hover，比白底压深 31 阶，在 #ffffff 的编辑区上读成一整条
    // 灰阴影；现在压深 15 阶（约 6% 灰），仍能一眼定位光标行，但不与正文抢注意力。
    // **别再往 --bg-control-hover / --border-soft 那类「控件面」上靠** —— 那些档位都是给
    // 小块按钮 / 描边定的，铺满整行宽度就会重一大截。取值的参照关系是「比同词高亮
    // #E8E8E8 更淡」：行带面积大，理应比小面积高亮更轻。
    'editor.lineHighlightBackground': '#f0f0f0',
    'editor.lineHighlightBorder': '#f0f0f0',
    // 选中文字：vs 自带的 #ADD6FF 压在白底上只有约 1.5:1，选中了也几乎看不出来
    // （用户报「浅色下选中的颜色太淡」）。换成同色相（--accent 那支蓝）再压深一档的
    // #A8CDF4（约 1.65:1）—— 早一版取 #9CC6F2（1.8:1）实机偏重，往白底方向退一档，
    // 仍明显高于 vs 原值。正文仍是深色，选中后语法色不受影响。
    // 失焦态默认是更淡的灰蓝 #E5EBF1，点一下侧栏选区就像消失了；给到常亮那支的
    // 70% 不透明度，既与常亮区分开，又不会看不见。
    'editor.selectionBackground': '#A8CDF4',
    'editor.inactiveSelectionBackground': '#A8CDF4B3',
    // 选中同词的其他出现位置：vs 默认按旧的 #ADD6FF 30% 算，压在白底上只有 1.1:1，
    // 基本等于没有。取选中色 #A8CDF4 的 30% 混白（#DCEBFA，约 1.2:1）—— 比选区浅两档，
    // 只做「还有一个同名」的提示，不跟真正的选区抢注意力。
    'editor.selectionHighlightBackground': '#DCEBFA',
    // 指针停在某个词上时的三档高亮：vs 浅色默认是 #57575740 叠白（约 1.5:1），
    // 加上语法色后整块偏灰、读数时像被压了一块阴影。统一显式降到约 1.2:1 的极淡面：
    // wordHighlight = 读引用，wordHighlightText = 同名文本出现处（默认会继承前一项，
    // 但那是注册主题时的静态计算，不随覆盖联动，这里必须再写一遍），
    // wordHighlightStrong = 写引用（赋值/声明），比读引用略明显一点，取同词高亮那支。
    'editor.wordHighlightBackground': '#E8E8E8',
    'editor.wordHighlightTextBackground': '#E8E8E8',
    'editor.wordHighlightStrongBackground': '#DCEBFA',
    // 缩进参考线：vs 默认 #D3D3D3 只有 1.5:1，浅色下几乎断线；压到 #C7C7C7（约 1.7:1）
    // —— 早一版 #BDBDBD（1.9:1）在满屏缩进时偏重，退回到「看得出断在哪、又不抢代码」。
    // 活跃那根从 #939393 抬到 #8E8E8E（约 3.3:1，原 #7A7A7A 4.3:1 太重），
    // 仍明显重于普通参考线，光标所在层级一眼能定位。
    'editorIndentGuide.background1': '#C7C7C7',
    'editorIndentGuide.activeBackground1': '#8E8E8E',
    // 非当前查找命中：vs 默认 #EA5C0055 叠白后只有 1.5:1，散落的橙色块很难扫到；
    // 换成实色 #F2CDB1（约 1.5:1，原 #EFC09E 1.7:1 略重）。当前命中仍是 vs 的
    // #A8AC94，两者仍能区分。
    'editor.findMatchHighlightBackground': '#F2CDB1',
  },
})

// 午夜蓝：与深色主题同一套 vs-dark 基色，只把内芯 / 行高亮 / 行号换成午夜蓝那支调色板
// （值必须与 base.css 的 :root[data-theme='midnight'] 对齐：--bg-editor-pane #101219、
//  --bg-card #1c1f2b、--text-faint #6b7488、--text-dim #98a3b8）。
monaco.editor.defineTheme('midnight', {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#101219',
    'editorGutter.background': '#101219',
    'minimap.background': '#101219',
    'editor.lineHighlightBackground': '#1c1f2b',
    'editor.lineHighlightBorder': '#1c1f2b',
    'editorLineNumber.foreground': '#6b7488',
    'editorLineNumber.activeForeground': '#98a3b8',
    // 同深色主题：不配会退回括号色原色，一条竖线拉满饱和太抢眼
    'editorBracketPairGuide.activeBackground1': '#FFD700B3',
    'editorBracketPairGuide.activeBackground2': '#DA70D6B3',
    'editorBracketPairGuide.activeBackground3': '#179FFFB3',
  },
})

// OLED 纯黑：地面纯黑，行高亮用 #101010（base.css 的 --bg-card），行号比深色再压暗一档
monaco.editor.defineTheme('oled', {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#000000',
    'editorGutter.background': '#000000',
    'minimap.background': '#000000',
    'editor.lineHighlightBackground': '#101010',
    'editor.lineHighlightBorder': '#101010',
    'editorLineNumber.foreground': '#707070',
    'editorLineNumber.activeForeground': '#a0a0a0',
    'editorBracketPairGuide.activeBackground1': '#FFD700B3',
    'editorBracketPairGuide.activeBackground2': '#DA70D6B3',
    'editorBracketPairGuide.activeBackground3': '#179FFFB3',
  },
})

// 暖白纸张 / 护眼豆绿：都是浅色（base vs），只换内芯与行高亮，行号沿用浅色默认。
// 底色必须与 base.css 的 --bg-editor-pane 一字不差（#f6f0e1 / #eaf2e6）——
// 这两套的内芯是**带色**的纸 / 豆绿，不是接近白的那一档，否则卡片四角露白、风格也散。
// 行高亮从 --bg-hover（#e9e2d2 / #dbe4d6）再压深一点，与 light 主题保持相近的 1.2:1
// （vs 原值只有 1.13:1，光标行在纸色 / 豆绿底上几乎看不出来；压太深又变成一条色带）。
monaco.editor.defineTheme('paper', {
  base: 'vs',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#f6f0e1',
    'editorGutter.background': '#f6f0e1',
    'minimap.background': '#f6f0e1',
    'editor.lineHighlightBackground': '#e6dac0',
    'editor.lineHighlightBorder': '#e6dac0',
    'editor.foreground': '#2f2a22',
    // 选中文字：同 light 主题的理由（vs 默认 #ADD6FF 太淡），只是底色是暖纸，蓝的会发脏。
    // 取本主题 --bg-selection（#e5d6b0）附近的 #D5BF8B（约 1.6:1），与纸感同色相。
    'editor.selectionBackground': '#D5BF8B',
    'editor.inactiveSelectionBackground': '#D5BF8BB3',
    // 同 light 的那几项：同词高亮、指针所在词的三档高亮、缩进参考线（含活跃）、
    // 非当前查找命中，均按纸色背景重新取值。高亮面约 1.2:1、参考线约 1.7:1（活跃约 3.3:1）、
    // 查找命中约 1.6:1，避免 vs 的蓝色默认值在暖底上发脏，也不铺一块实色压住正文。
    'editor.selectionHighlightBackground': '#E9DCBF',
    'editor.wordHighlightBackground': '#E0DACD',
    'editor.wordHighlightTextBackground': '#E0DACD',
    'editor.wordHighlightStrongBackground': '#E9DCBF',
    'editorIndentGuide.background1': '#C5B69B',
    'editorIndentGuide.activeBackground1': '#8F836A',
    'editor.findMatchHighlightBackground': '#E2BB8D',
  },
})

monaco.editor.defineTheme('leaf', {
  base: 'vs',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#eaf2e6',
    'editorGutter.background': '#eaf2e6',
    'minimap.background': '#eaf2e6',
    'editor.lineHighlightBackground': '#cfdfca',
    'editor.lineHighlightBorder': '#cfdfca',
    'editor.foreground': '#26302a',
    // 选中文字：同 light 主题的理由（vs 默认 #ADD6FF 太淡），取本主题 --bg-selection
    // （#cbe3c8）附近的 #A4CAA0（约 1.6:1），保持豆绿的色相。
    'editor.selectionBackground': '#A4CAA0',
    'editor.inactiveSelectionBackground': '#A4CAA0B3',
    // 同 light 的那几项：同词高亮、指针所在词的三档高亮、缩进参考线（含活跃）、
    // 非当前查找命中，均按豆绿背景重新取值。高亮面约 1.2:1、参考线约 1.7:1（活跃约 3.2:1）、
    // 查找命中约 1.6:1。
    'editor.selectionHighlightBackground': '#CEE2CA',
    'editor.wordHighlightBackground': '#D5DCD1',
    'editor.wordHighlightTextBackground': '#D5DCD1',
    'editor.wordHighlightStrongBackground': '#CEE2CA',
    'editorIndentGuide.background1': '#ABC0A6',
    'editorIndentGuide.activeBackground1': '#7B8A79',
    'editor.findMatchHighlightBackground': '#CEBE94',
  },
})

// 紫夜：vs-dark 基色 + 紫灰内芯；行高亮取 --bg-card（#2d2f3d），行号取 --text-faint / --text-dim
monaco.editor.defineTheme('dusk', {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#282a36',
    'editorGutter.background': '#282a36',
    'minimap.background': '#282a36',
    'editor.lineHighlightBackground': '#2d2f3d',
    'editor.lineHighlightBorder': '#2d2f3d',
    'editorLineNumber.foreground': '#7d8199',
    'editorLineNumber.activeForeground': '#b9bac6',
    'editorBracketPairGuide.activeBackground1': '#FFD700B3',
    'editorBracketPairGuide.activeBackground2': '#DA70D6B3',
    'editorBracketPairGuide.activeBackground3': '#179FFFB3',
  },
})

// 深林墨绿：同上，内芯 #151b17、行高亮 --bg-card #1d2620
monaco.editor.defineTheme('forest', {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#151b17',
    'editorGutter.background': '#151b17',
    'minimap.background': '#151b17',
    'editor.lineHighlightBackground': '#1d2620',
    'editor.lineHighlightBorder': '#1d2620',
    'editorLineNumber.foreground': '#6d7d72',
    'editorLineNumber.activeForeground': '#93a398',
    'editorBracketPairGuide.activeBackground1': '#FFD700B3',
    'editorBracketPairGuide.activeBackground2': '#DA70D6B3',
    'editorBracketPairGuide.activeBackground3': '#179FFFB3',
  },
})

// 高对比：纯黑内芯 + 提亮的行高亮与行号（--bg-hover #1f1f1f / --text-faint #c0c0c0）
monaco.editor.defineTheme('contrast', {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#000000',
    'editorGutter.background': '#000000',
    'minimap.background': '#000000',
    'editor.lineHighlightBackground': '#1a1a1a',
    'editor.lineHighlightBorder': '#1a1a1a',
    'editorLineNumber.foreground': '#c0c0c0',
    'editorLineNumber.activeForeground': '#ffffff',
    'editorBracketPairGuide.activeBackground1': '#FFD700E6',
    'editorBracketPairGuide.activeBackground2': '#DA70D6E6',
    'editorBracketPairGuide.activeBackground3': '#179FFFE6',
  },
})

// 雾蓝：浅色（base vs），内芯 #edf1f7、行高亮从 --bg-hover #dbe3ee 再压深一点
// （#d1dcea，约 1.2:1，与 light 主题同档），正文取主题正文色
monaco.editor.defineTheme('mist', {
  base: 'vs',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#edf1f7',
    'editorGutter.background': '#edf1f7',
    'minimap.background': '#edf1f7',
    'editor.lineHighlightBackground': '#d1dcea',
    'editor.lineHighlightBorder': '#d1dcea',
    'editor.foreground': '#2e3440',
    // 选中文字：同 light 主题的理由（vs 默认 #ADD6FF 太淡），取本主题 --bg-selection
    // （#c3d5e8）附近的 #A4BFD9（约 1.7:1），与雾蓝底色同色相。
    'editor.selectionBackground': '#A4BFD9',
    'editor.inactiveSelectionBackground': '#A4BFD9B3',
    // 同 light 的那几项：同词高亮、指针所在词的三档高亮、缩进参考线（含活跃）、
    // 非当前查找命中，均按雾蓝背景重新取值。高亮面约 1.2:1、参考线约 1.7:1（活跃约 3.0:1）、
    // 查找命中约 1.6:1。
    'editor.selectionHighlightBackground': '#D0DDEB',
    'editor.wordHighlightBackground': '#D8DBE1',
    'editor.wordHighlightTextBackground': '#D8DBE1',
    'editor.wordHighlightStrongBackground': '#D0DDEB',
    'editorIndentGuide.background1': '#B0BCCD',
    'editorIndentGuide.activeBackground1': '#7F8B9C',
    'editor.findMatchHighlightBackground': '#D3BFA6',
  },
})

export default monaco
export { monaco }
