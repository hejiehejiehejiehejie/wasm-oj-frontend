/**
 * 文件名 → 文件 logo（图标名）。
 *
 * 同一份映射被两处用：资源管理器里的一行（FileTreeItem）与编辑器页签（EditorTabs）。
 * 单独成模块是为了让这两处**永远是同一个 logo** —— 各写一份迟早会漂：在树里加了新类型、
 * 页签忘了跟，用户就会看到「同一个文件在左边和上边长得不一样」。
 *
 * 返回值同时是着色修饰类的后缀（`.is-cpp` / `.is-python` / `.is-markdown`），
 * 两处各自的 scoped 样式里按这套类名上色（色值都是 base.css 的 --icon-* 变量）。
 *
 * ⚠️ 与 services/monaco/language.js 的口径**不同**，别合并：那边头文件（.h/.hpp）按 cpp
 * 高亮、和 .cpp 归成一档，这边头文件要单独一个图标。
 *
 * @param {string} name 文件名（不带目录）
 * @returns {'header'|'python'|'markdown'|'cpp'|'file'} 图标名，同时也是 `is-*` 的后缀
 */
export function fileIconName(name) {
  const lower = String(name ?? '').toLowerCase()
  if (/\.(h|hpp|hh|hxx)$/.test(lower)) return 'header'
  if (lower.endsWith('.py')) return 'python'
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'markdown'
  if (/\.(cpp|cc|cxx|c)$/.test(lower)) return 'cpp'
  return 'file'
}