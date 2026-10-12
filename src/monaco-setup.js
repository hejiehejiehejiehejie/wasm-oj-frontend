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

export default monaco
export { monaco }
