/**
 * tabStrip —— 页签栏顺序的**只读投影**。
 *
 * 【真源已经搬家】分屏之后，一条全局序列装不下「每个窗格各有一份页签」，
 * 顺序的唯一真源是 `services/editorPanes.js` 的 `leaf.tabs`。本模块只剩两件事：
 *   1. `stripOrder`：把布局树按 DFS 展平成一条 id 序列（computed，只读）；
 *   2. `moveStripItem / moveStripRun`：把拖拽落点翻译成**叶子内重排**，并顺手把
 *      视图部分的顺序投影到 `editorViews.viewOrder`（仅为兼容旧的持久化结构）。
 *
 * 【为什么不再自己写顺序】过去 stripOrder 是顺序权威、开两份 watch 从
 * openTabIds / viewOrder 同步成员，于是拖动后要「换算全局下标再分部写回」。
 * 分屏后窗格内看到的是 `leaf.tabs` 的子集，全局下标换算极易把页签插进别的窗格
 * （计划里的「预见坑 1」）。改成派生之后，窗格内拖拽直接操作本叶子的数组，
 * 既不需要换算，也不可能跨叶子错位。
 *
 * 【落点下标的口径】`insertIndex` 是「**去掉被拖项之后**、且**在同一个叶子内**」的
 * 插入下标（与 editorPanes.moveTabInPane 同一契约）。useTabDrag 的 DOM 下标数的是
 * 某一条页签栏内部，正好就是这个坐标系。
 */
import { computed } from 'vue'
import { setViewOrder } from './editorViews.js'
import { isViewId } from './editorViewIds.js'
import { leaves, moveRunInPane, moveTabInPane, paneOf } from './editorPanes.js'

export { isViewId }

/**
 * 条带的混排顺序（文件 id 与视图 id 混在一起）。
 * **派生值，不要写** —— 任何顺序改动都走 editorPanes。
 * @type {import('vue').ComputedRef<string[]>}
 */
export const stripOrder = computed(() => leaves().flatMap((leaf) => leaf.tabs))

/**
 * 拖动排序的落盘入口（useTabDrag 的 onDrop 转交）：把 id 挪到本叶子内的 insertIndex。
 *
 * 视图顺序仍写回 `setViewOrder`，但那只是**持久化投影**：`cp.editorViews` 的结构不变，
 * 刷新后视图依旧按存档顺序追加；顺序权威已经不在那里了。
 *
 * @param {string} id
 * @param {number} insertIndex
 */
export function moveStripItem(id, insertIndex) {
  const leaf = paneOf(id)
  if (!leaf) return
  moveTabInPane(leaf.id, id, insertIndex)
  setViewOrder(stripOrder.value.filter(isViewId))
}

/**
 * 拖动**整组**的落盘入口（useTabDrag 芯片拖动的 onDrop 转交）：把一整段连续的成员 id
 * 挪到本叶子内的 insertIndex。段不连续（组的不变式保证不会发生）就拒绝，不做半吊子重排。
 *
 * @param {string[]} ids 组成员 id（保持原有相对次序）
 * @param {number} insertIndex
 */
export function moveStripRun(ids, insertIndex) {
  if (!Array.isArray(ids) || ids.length === 0) return
  const leaf = paneOf(ids[0])
  if (!leaf) return
  moveRunInPane(leaf.id, ids, insertIndex)
  setViewOrder(stripOrder.value.filter(isViewId))
}
