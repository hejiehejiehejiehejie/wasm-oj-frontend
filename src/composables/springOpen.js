/**
 * springOpen —— 拖拽时「指针停在一个**折叠的目录**上，过一会儿它自己张开」。
 *
 * 【为什么单独一份】这条效果在两套拖拽里都要有，而两套的手势状态各归各的：
 * 站内挪文件走 Pointer Events（`useTreeDrag`）、从系统里拖文件进来走 HTML5 拖放
 * （`usePageDrop`）。效果必须是**同一份**（同一个阈值、同样只对折叠目录、同样到点只展开一次），
 * 所以时钟与判据放这儿，两边各持一个实例 —— `createSpringOpen()` 返回的是**一次拖拽过程内**
 * 的状态，别做成模块级单例（两次互不相干的拖拽会共用同一个计时器，前一发的悬停能把后一发的
 * 目录撑开）。
 *
 * 【三条判据，少一条都会出怪样子】
 * 1. 只对**折叠的目录**计时：展开的目录、文件行（它的 rowId 是父目录，父目录必然已展开）、
 *    根（根没有 rowId）都不计；
 * 2. 目标没变就**不重新计时**：调用方每帧都会问一次，重挂计时器的话永远等不到到点；
 * 3. 到点只 `toggleExpand` 一次并清空手里的 id —— 展开后指针底下那一行往往已经不是它了
 *    （新长出来的子行把位置顶掉了），下一发命中按新行重新判。
 *
 * 【调用方要自己管的】指针离开目录 / 拖拽结束（松手、Esc、离开窗口）时调 `cancel()`，
 * 否则计时器会在拖拽结束之后补一发 `toggleExpand`，凭空张开一个目录。
 */
import { getNodeById, toggleExpand, workspace } from '../services/vfs/workspaceStore.js'

/**
 * 悬停多久自动展开。触屏拖拽时手指腾不出来点目录，这个必须有；鼠标拖拽同样受益。
 * ⚠️ 改它只需改这一处 —— 站内拖拽与系统拖入共用本常量。
 */
export const SPRING_OPEN_MS = 600

/**
 * @param {object} [options]
 * @param {number} [options.delay] 覆盖默认的 `SPRING_OPEN_MS`
 * @param {(id: string) => void} [options.onOpen] 到点张开之后的通知（`usePageDrop` 用它按
 *   同一位置重算落点：新长出来的行可能已经顶到指针底下了）
 * @returns {{ hover: (nextId: string|null) => void, cancel: () => void }}
 */
export function createSpringOpen({ delay = SPRING_OPEN_MS, onOpen } = {}) {
  /** 正在计时的目录 id；null = 没有在计时 */
  let id = null
  let timer = 0

  function cancel() {
    if (timer) {
      window.clearTimeout(timer)
      timer = 0
    }
    id = null
  }

  /**
   * 指针此刻悬停在 `nextId` 这一行上（null = 不在任何行上）。
   * 每走一步都可以调，重复的目标不会再起一个计时器。
   * @param {string|null} nextId
   */
  function hover(nextId) {
    if (nextId === id) return
    cancel()
    if (!nextId) return
    const node = getNodeById(nextId)
    if (!node || node.type !== 'directory') return
    if (workspace.expandedIds.includes(nextId)) return
    id = nextId
    timer = window.setTimeout(() => {
      timer = 0
      id = null
      toggleExpand(nextId)
      onOpen?.(nextId)
    }, delay)
  }

  return { hover, cancel }
}
