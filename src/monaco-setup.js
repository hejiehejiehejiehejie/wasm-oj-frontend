import * as monaco from 'monaco-editor'

// Monaco runs its language services in a web worker. Vite's `?worker` suffix
// bundles it as a separate module; the `monaco-editor/<subpath>` form is the
// public export map of monaco-editor 0.55+.
//
// C++ and Python only ship a synchronous tokenizer, so the plain editor worker
// covers everything this tool needs. Add the json/css/html/ts workers here if a
// new language ever requires them.
import editorWorker from 'monaco-editor/editor/editor.worker.js?worker'

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
