/**
 * editorViewStates —— Monaco 的**视图状态**（光标、选区、滚动位置、折叠区）缓存。
 *
 * 键是文件 id，不是窗格 id。理由：
 *   · 不变式「一个文件最多在一个窗格里」（见 services/editorPanes.js）让 fileId 与
 *     「哪一份 ICodeEditorViewState」天然一一对应；
 *   · 把页签从一个窗格拖到另一个窗格时，源编辑器先 save、目标编辑器再 restore，
 *     滚动位置与折叠状态就能无缝跟过去，不需要任何迁移代码。
 *
 * 用普通 Map 而不是 reactive：Monaco 的视图状态是内部结构，放进 Vue 响应式会被深层
 * Proxy 劫持（高频读写 → 卡顿 / 内存泄漏）。组件里只在保存与恢复时同步读写。
 */

/** @type {Map<string, import('monaco-editor').editor.ICodeEditorViewState>} */
const states = new Map()

/** @param {string} fileId @param {any} state */
export function saveViewState(fileId, state) {
  if (!fileId || !state) return
  states.set(fileId, state)
}

/** @param {string} fileId @returns {any|null} */
export function getViewState(fileId) {
  return fileId ? states.get(fileId) ?? null : null
}

/** 文件被删 / 换工作区时清掉，避免 Map 跟着会话无限长胖 */
export function dropViewState(fileId) {
  states.delete(fileId)
}
