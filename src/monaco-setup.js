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
monaco.editor.defineTheme('cph-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#252526',
    'editorGutter.background': '#252526',
    'minimap.background': '#252526',
  },
})

// 浅色版与之对应：内芯 = 浅色主题的 --bg-panel
monaco.editor.defineTheme('cph-light', {
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
