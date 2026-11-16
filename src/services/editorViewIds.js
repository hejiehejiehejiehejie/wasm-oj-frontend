/**
 * editorViewIds —— 合成视图的**登记表与 id 空间**。
 *
 * 【为什么单独一个模块】这张表原先长在 services/editorViews.js 里，而那个文件为了
 * `codeViewIntent` / `workspace` 反向依赖了 services/vfs/workspaceStore.js。
 * 分屏之后 editorPanes.js 也需要判「这个 id 是不是合成视图」（它只认 id，不认视图状态），
 * 若直接 import editorViews 就会成环：
 *   editorPanes → editorViews → workspaceStore → editorPanes
 * 于是把「有哪些视图、id 长什么样」这层零依赖的元数据抽到这里，两个模块都往下依赖它。
 *
 * 【加一种视图要动哪里】仍只有两处：下面 EDITOR_VIEWS 加一行（id / 图标 / 文案 key），
 * 以及 EditorPane 的 stage 里给它一格渲染。
 */
export const EDITOR_VIEWS = [
  {
    id: 'settings',
    icon: 'gear',
    // 页签里这枚齿轮单独加粗一档（AppIcon 默认为 2）。页签图标只有 12px，同排的 cpp / python /
    // markdown 是实心字标、墨色本来就重，Lucide 标准的 2 号线在中间显得偏淡 —— 只在本页签
    // 提高描边，别动全站默认值。
    strokeWidth: 2.4,
    labelKey: 'app.settings',
    closeLabelKey: 'app.tabs.closeSettings',
  },
  {
    id: 'codeforces',
    icon: 'codeforces',
    labelKey: 'cf.view.title',
    closeLabelKey: 'cf.tab.close',
  },
]

/** 全部合成视图 id（由登记表派生，别另抄一份） */
export const EDITOR_VIEW_IDS = EDITOR_VIEWS.map((view) => view.id)

/** 按 id 取登记项；认不出来的 id 返回 null（调用方据此判「这不是视图」） */
export function viewOf(id) {
  return EDITOR_VIEWS.find((view) => view.id === id) ?? null
}

/**
 * @param {string} id
 * @returns {boolean} 这个 id 是不是合成视图（否即文件节点 id）
 */
export function isViewId(id) {
  return EDITOR_VIEW_IDS.includes(id)
}
