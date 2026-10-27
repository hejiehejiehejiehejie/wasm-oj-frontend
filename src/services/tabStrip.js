/**
 * tabStrip —— 页签栏的**统一顺序**：文件页签与合成视图页签（设置 / 抽题）混排在同一条序列里，
 * 拖动可以跨两类换位（文件插到设置左边、抽题排到某个 .cpp 前面，都成立）。
 *
 * 【为什么要有第三份状态】顺序要能跨两类页签，而它们各自那份状态都装不了对方：
 *   · `workspace.openTabIds` 只能装真实 VFS 节点 —— 塞一个合成视图 id 进去，rebuildTree 会
 *     把它当「文件已删除」顺手清掉，modelManager 也会去 release 一个不存在的 model
 *     （纪律见 services/editorViews.js 的文件头）；
 *   · `editorViews.viewOrder` 只记合成视图。
 * 于是这里单独存一份「条带上出现哪些 id、按什么先后」，由它驱动渲染。id 空间天然不冲突
 * （VFS 节点 id 是 UUID / `f_*`，视图 id 只有 EDITOR_VIEW_IDS 那两个），所以一份字符串
 * 数组就够，不必包成对象。
 *
 * 【谁改谁】
 *   · **顺序**：只有这里改 —— 拖动排序改 stripOrder，随后**分部写回**两份状态：文件那一段
 *     按新次序逐个 moveTab 落进 openTabIds（含持久化），视图那一段整体交给 setViewOrder。
 *   · **成员**：反过来由两头同步进来 —— 文件的开关看 openTabIds、视图的开关看 viewOrder，
 *     这里只同步**增减**、不同步顺序。连顺序一起纠的话，两个 watch 会各推一次、来回抖。
 *   换句话说：**stripOrder 是顺序的权威，两头只提供「有哪些」**。
 *
 * 【新页签落在哪】常规打开（openFile 往 openTabIds 末尾 push）的新文件**一律落在整条条带的
 * 最右端** —— 排在视图页签右边，而不是「最后一张文件页签」右边（2026-10-26 用户口径：从抽题 /
 * 比赛载入的题目页签要排在所有页签最后，不能被末尾的组件页签挡住）。openTabIds 中间插进来的
 * 新文件（目前没有这种入口）仍贴到「前一位文件页签」右边，保证文件子序列与 openTabIds 同序。
 * 视图是「谁先开谁靠左」，开的时候一律追加到最右。
 *
 * 【不落盘】这份顺序本身不进 localStorage：文件部分的相对顺序由 openTabIds 顺带持久化，
 * 而合成视图本来就不跨会话恢复（刷新后回到代码文件是预期行为）。
 */
import { reactive, watch } from 'vue'
import { EDITOR_VIEW_IDS, setViewOrder, viewOrder } from './editorViews.js'
import { moveTab, workspace } from './vfs/workspaceStore.js'

/** @param {string} id @returns {boolean} 这个 id 是不是合成视图（否即文件节点 id） */
export function isViewId(id) {
  return EDITOR_VIEW_IDS.includes(id)
}

/**
 * 条带的混排顺序（文件 id 与视图 id 混在一起，DOM 顺序就是它）。
 * @type {string[]}
 */
export const stripOrder = reactive([])

/** 文件侧的成员同步：只处理增删，已有成员的位置保持 stripOrder 的现状 */
function syncFiles(ids) {
  for (let i = stripOrder.length - 1; i >= 0; i -= 1) {
    const id = stripOrder[i]
    if (!isViewId(id) && !ids.includes(id)) stripOrder.splice(i, 1)
  }
  // 新开的按 openTabIds 的次序排：**最后一位直接贴到条带最右端**（越过视图页签），
  // 其余贴到「前一位文件页签」右边。常规打开（openFile / 预览顶替 / 题目导入）都是 push 到
  // openTabIds 末尾，于是新页签总在用户眼皮底下的最右边；若照旧按「前一位文件」插，条带
  // 末尾常站着视图页签（设置 / 抽题 / 比赛），新页签会插到它前面、看着像从中间冒出来。
  let cursor = -1
  for (let k = 0; k < ids.length; k += 1) {
    const id = ids[k]
    const at = stripOrder.indexOf(id)
    if (at !== -1) {
      cursor = at
      continue
    }
    if (k === ids.length - 1) {
      stripOrder.push(id)
      cursor = stripOrder.length - 1
      continue
    }
    stripOrder.splice(cursor + 1, 0, id)
    cursor += 1
  }
}

/** 视图侧的成员同步：同样是只增删，不动顺序 */
function syncViews(ids) {
  for (let i = stripOrder.length - 1; i >= 0; i -= 1) {
    const id = stripOrder[i]
    if (isViewId(id) && !ids.includes(id)) stripOrder.splice(i, 1)
  }
  for (const id of ids) {
    if (!stripOrder.includes(id)) stripOrder.push(id)
  }
}

watch(() => [...workspace.openTabIds], syncFiles, { immediate: true })
watch(() => [...viewOrder], syncViews, { immediate: true })

/**
 * 拖动排序的落盘入口（useTabDrag 的 onDrop 转交）：在整条混排序列里把 id 挪到 insertIndex。
 *
 * insertIndex 按「去掉被拖项」的列表数 —— 与 store.moveTab 同一契约（含同样的夹取）。
 * 重排之后立刻分部写回两份状态：文件那一段按新次序逐个 moveTab 落进 openTabIds（顺带持久化），
 * 视图那一段整体交给 setViewOrder。
 *
 * @param {string} id
 * @param {number} insertIndex
 */
export function moveStripItem(id, insertIndex) {
  const at = stripOrder.indexOf(id)
  if (at === -1) return
  stripOrder.splice(at, 1)
  const target = Math.max(0, Math.min(stripOrder.length, insertIndex))
  stripOrder.splice(target, 0, id)

  const fileIds = stripOrder.filter((x) => !isViewId(x))
  // 逐个 moveTab：每段都很像「把它挪到第 i 位」，且前一个搬完之后第 i 位正好轮到它 ——
  // 于是 N 次单步换算成一次重排，不用另开一条整段替换的口子给外部改 openTabIds。
  fileIds.forEach((fileId, index) => moveTab(fileId, index))
  setViewOrder(stripOrder.filter(isViewId))
}

/**
 * 拖动**整组**的落盘入口（useTabDrag 芯片拖动的 onDrop 转交，2026-10-20 十八改）：
 * 把一整段连续的成员 id 挪到 insertIndex。芯片不进 stripOrder（它只是渲染在组首前的
 * 把柄），搬组 = 搬它的成员段，芯片跟着组首走。
 *
 * insertIndex 与 moveStripItem 同一契约 —— 按「去掉被搬段」的列表数（useTabDrag 的
 * commitIndex 数到的就是这份坐标）。段不连续（不该发生 —— 组的不变式保证连续）就拒绝，
 * 不做半吊子重排。重排之后与 moveStripItem 同样分部写回两份状态。
 *
 * @param {string[]} ids 组成员 id（保持原有相对次序）
 * @param {number} insertIndex
 */
export function moveStripRun(ids, insertIndex) {
  if (!Array.isArray(ids) || ids.length === 0) return
  const at = ids.map((id) => stripOrder.indexOf(id))
  if (at.some((i) => i === -1)) return
  for (let k = 1; k < at.length; k += 1) {
    if (at[k] !== at[k - 1] + 1) return
  }
  const rest = stripOrder.filter((id) => !ids.includes(id))
  const target = Math.max(0, Math.min(rest.length, insertIndex))
  stripOrder.splice(0, stripOrder.length, ...rest.slice(0, target), ...ids, ...rest.slice(target))

  const fileIds = stripOrder.filter((x) => !isViewId(x))
  fileIds.forEach((fileId, index) => moveTab(fileId, index))
  setViewOrder(stripOrder.filter(isViewId))
}
