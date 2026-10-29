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
monaco.editor.defineTheme('light', {
  base: 'vs',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#ffffff',
    'editorGutter.background': '#ffffff',
    'minimap.background': '#ffffff',
    // 光标所在行：与深色主题同口径，整行铺底色而非方框。取浅色主题的 --bg-control-hover
    // （#e0e0e0），比白底压深 8 阶（深色那支同一天连降两档，这支跟着降一档保持一致；
    // 浅色下「暗」＝更明显，方向与深色相反）。边框取同色，免得又画出一圈边。
    'editor.lineHighlightBackground': '#e0e0e0',
    'editor.lineHighlightBorder': '#e0e0e0',
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
// 行高亮对齐 --bg-hover（#e9e2d2 / #dbe4d6）。
monaco.editor.defineTheme('paper', {
  base: 'vs',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#f6f0e1',
    'editorGutter.background': '#f6f0e1',
    'minimap.background': '#f6f0e1',
    'editor.lineHighlightBackground': '#e9e2d2',
    'editor.lineHighlightBorder': '#e9e2d2',
    'editor.foreground': '#2f2a22',
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
    'editor.lineHighlightBackground': '#dbe4d6',
    'editor.lineHighlightBorder': '#dbe4d6',
    'editor.foreground': '#26302a',
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

// 雾蓝：浅色（base vs），内芯 #edf1f7、行高亮 --bg-hover #dbe3ee，正文取主题正文色
monaco.editor.defineTheme('mist', {
  base: 'vs',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#edf1f7',
    'editorGutter.background': '#edf1f7',
    'minimap.background': '#edf1f7',
    'editor.lineHighlightBackground': '#dbe3ee',
    'editor.lineHighlightBorder': '#dbe3ee',
    'editor.foreground': '#2e3440',
  },
})

export default monaco
export { monaco }
