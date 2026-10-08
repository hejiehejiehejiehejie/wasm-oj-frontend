import * as monaco from 'monaco-editor'

// Monaco runs its language services in a web worker. Vite's `?worker` suffix
// bundles it as a separate module; the `monaco-editor/<subpath>` form is the
// public export map of monaco-editor 0.55+.
//
// C++ and Python only ship a synchronous tokenizer, so the plain editor worker
// covers everything this tool needs. Add the json/css/html/ts workers here if a
// new language ever requires them.
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
    // 光标所在行那个 2px 方框（Monaco 的 current-line-exact 装饰）。
    // vs-dark 自己不定义这一项，于是落到注册表默认值 #282828 —— 而我们的编辑区底色被
    // 压到了 #181818（比 vs-dark 原装的 #1e1e1e 更暗），那个灰框的对比被放大，很抢眼。
    // 取深色主题的 --bg-panel-head（#222225）：比 #181818 只亮一档，「光标在哪一行」看得出来，
    // 但不构成一圈显眼的边。注意**不能**写成 null 或省略 —— 那会退回 #282828 默认值，等于没改。
    // 浅色主题（base: 'vs'）刻意不写：那边的默认值 #eeeeee 在落白底上本来就淡。
    'editor.lineHighlightBorder': '#222225',
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
  },
})

export default monaco
export { monaco }
