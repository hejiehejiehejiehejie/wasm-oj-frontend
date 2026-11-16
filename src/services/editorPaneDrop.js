/**
 * editorPaneDrop —— 拖页签会话的**源窗格**登记（只存界面状态，不碰布局树）。
 *
 * 分工：
 *   · `components/EditorTabs.vue` 在 useTabDrag 真正开拖的那一帧写下「从哪片窗格出发」，
 *     松手 / 取消 / 卸载时清空 —— 它知道 `paneId`；
 *   · `components/EditorPaneGrid.vue` 监听这个值：非空时在 window 上跟指针算落点（五区
 *     判定见 services/paneDropTarget.js）并画高亮；
 *   · 真正的落盘归 EditorTabs 的 onStripDrop（它从 useTabDrag 的 payload 里拿到松手坐标）；
 *   · 「按落点建窗格」这一步也在这里（`createPaneForDrop`）：跨窗格拖页签与文件树拖入共用，
 *     跨越式落点只实现一处，不会出现两边不一致。
 *
 * 为什么不让 useTabDrag 直接管：它对窗格一无所知（只认一条页签栏的 DOM），跨窗格是
 * 渲染层的语义，跨界会在 composable 里留下一个「向上依赖布局树」的口子。
 */
import { shallowRef } from 'vue'
import { splitPane, splitSpanning } from './editorPanes.js'
import { splitTargetOf } from './paneDropTarget.js'

/** 拖拽发起时的源窗格 id；null = 当前没有跨窗格拖拽在途 */
export const paneTabDragSource = shallowRef(null)

/**
 * @param {string|null} paneId
 */
export function setPaneTabDragSource(paneId) {
  const next = paneId || null
  if (paneTabDragSource.value !== next) paneTabDragSource.value = next
}

/** 拖拽结束（提交 / 取消 / 组件卸载）时归零；渲染层据此收掉高亮 */
export function clearPaneTabDrag() {
  setPaneTabDragSource(null)
}

/**
 * 落点 → 建窗格。拖页签（`components/EditorTabs.vue`）与拖文件树（`components/EditorPaneGrid.vue`）
 * **共用这一处**：跨越式落点（`target.span`）若只在一处实现，另一处就会「高亮画对了、松手却
 * 只切了一片」—— 这种不一致光看代码很难发现。
 *
 *   · `target.span` → `splitSpanning`：在整棵树外面接一条，新窗格横跨全部（三列落底部 =
 *     横跨三列的一整行；三排落左右 = 纵贯三排的一整列）；
 *   · 普通四边 → `splitPane`：只把指针所在的那片窗格一分为二；
 *   · 中心区 / 页签栏 → null：不建窗格，内容并进现有那片。
 *
 * @param {{paneId: string, zone: string, span?: object|null}|null} target
 * @returns {string|null} 新窗格 id；没有可建的东西 / 已到上限时 null
 */
export function createPaneForDrop(target) {
  if (!target) return null
  if (target.span) return splitSpanning(target.span.axis, target.span.side)
  const side = splitTargetOf(target.zone)
  return side ? splitPane(target.paneId, side.axis, side.side) : null
}
