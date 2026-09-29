/**
 * useTreeDrag —— 资源管理器文件树的拖拽移动（鼠标与触屏共用一套 Pointer Events）。
 *
 * 【为什么不走 HTML5 拖放】`dragstart` / `drop` 在触屏上根本不触发，幽灵元素的外观与
 * 自动滚动也不可控。这里从 `pointerdown` 起手自己实现，两条路径只在「怎么算起手」上分叉：
 *   - 鼠标：不需要长按，位移超过 4px 就算拖。
 *   - 触屏：按住不动约 450ms 进入 armed（可拖）态 —— **原地松手仍然弹右键菜单**（保住触屏
 *     现有的入口），继续移动才真的开始拖。触屏的 `contextmenu` 在**按下那一刻**就被接管，
 *     所以这条长按菜单从按下到抬手始终只有我们自己会弹，与系统长按阈值无关。
 *
 * 【触屏滚动】行上声明的是 `touch-action: pan-y`（保住纵向滚动），不是 `none`。armed 之后
 * 浏览器仍可能把这次手势当成滚动，而 `touch-action` 在手势开始时就读定了、中途改它无效，
 * 所以只能靠**非被动** `touchmove` + `preventDefault()` 把滚动按住（见 onTouchMoveBlock）。
 * 这条结论与 App.vue 分隔条那段注释出自同一次踩坑。
 *
 * 【本模块不碰 VFS】落盘由 `onDrop` 回调交给调用方；这里只管手势、命中测试与高亮状态。
 *
 * 【树外的落点】除了树里的目录，还可以有「树以外的面板」——目前是编辑区：把文件拖过去 =
 * 打开 / 跳转页签。这类落点由面板自己用 `registerDropZone` 登记（见下方登记处），本模块只负责
 * 逐帧算出指针命中了哪一块，并把 `activeDropZone` 告诉它。命中顺序永远是「先树内、后树外」。
 */
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'
import { getNodeById, toggleExpand, workspace } from '../services/vfs/workspaceStore.js'
import { dirname, isWithin } from '../services/vfs/paths.js'

/** 触屏长按多久算「我要拖了」。与系统长按菜单的阈值无关（按下即接管，见下）——450ms 只是手感 */
const LONG_PRESS_MS = 450
/** 鼠标判定成拖拽的位移（像素） */
const MOUSE_MOVE_PX = 4
/** 触屏 armed 之后判定成拖拽的位移（比鼠标大一点，给手指留抖动的余量） */
const TOUCH_MOVE_PX = 8
/** 悬停在折叠目录上多久自动展开（触屏拖拽时没法先点开目录，这个必须有） */
const SPRING_OPEN_MS = 600
/** 距树上下边缘多近开始自动滚动 */
const EDGE_PX = 24
/** 自动滚动的每帧步长 */
const SCROLL_STEP = 8
/** 拖拽结束后用来吃掉紧随其后那次 click 的时间上限 */
const CLICK_SUPPRESS_MS = 300

// ------------------------------------------------------------ 外部落点登记处

/**
 * 树以外的落点（目前只有编辑区：拖文件过去 = 打开 / 跳转页签）。
 *
 * 为什么要在模块级牵这条线：本文件的状态是**每次 useTreeDrag 各一份**（FileExplorer 里那一个），
 * 编辑区是另一个组件，它既读不到 dropTarget 也没法把自己的元素塞进去。所以这里放一个双方都
 * 看得见的登记处 —— 面板挂载时登记自己的根元素与落点回调，拖拽时由这边逐帧问「指针在哪块里」，
 * 命中的那块拿 activeDropZone 决定要不要亮。
 *
 * 本模块照旧不碰 VFS：命中之后干什么，全由落点自己的 onDrop 说了算。
 */
const zones = new Set()

/** 当前指针命中的外部落点（null = 没有）。落点自己拿它跟自身比，相等才亮 */
export const activeDropZone = shallowRef(null)

/**
 * 登记一块外部落点。返回注销函数，请在 onBeforeUnmount 里调。
 *
 * @param {{ el: HTMLElement|null, canDrop?: (node: object) => boolean, onDrop: (node: object) => void }} zone
 * @returns {() => void}
 */
export function registerDropZone(zone) {
  zones.add(zone)
  return () => {
    zones.delete(zone)
    if (activeDropZone.value === zone) activeDropZone.value = null
  }
}

/**
 * 指针落在哪块外部落点里。
 *
 * 用矩形命中而不是 elementFromPoint：拖拽时幽灵元素就贴在手底下，谁压在谁上面全靠 DOM 顺序，
 * 用 elementFromPoint 得先赌幽灵 `pointer-events: none` 万无一失；矩形判断跟幽灵无关，稳。
 *
 * @param {object} source 被拖的节点（给 canDrop 判要不要接）
 */
function hitDropZone(clientX, clientY, source) {
  for (const zone of zones) {
    if (zone.canDrop && !zone.canDrop(source)) continue
    const rect = zone.el?.getBoundingClientRect()
    // 面板被折没了（宽 0）不算落点
    if (!rect || rect.width <= 0) continue
    const inside =
      clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
    if (inside) return zone
  }
  return null
}

/**
 * @param {object} options
 * @param {import('vue').Ref<HTMLElement|null>} options.treeEl 树容器（用于取矩形与滚动）
 * @param {(node: object, target: { rowId: string, path: string }) => void} options.onDrop
 * @param {(event: { clientX: number, clientY: number }, node: object) => void} options.openContextMenu
 */
export function useTreeDrag({ treeEl, onDrop, openContextMenu }) {
  /** 正在被拖的节点；null = 没在拖 */
  const draggingNode = shallowRef(null)
  /** 幽灵元素的位置（跟手） */
  const ghostPos = ref({ x: 0, y: 0 })
  /** 当前合法落点：{ rowId, path }；rowId 为 'root' 表示落点是根目录 */
  const dropTarget = ref(null)
  /** 长按已接管 contextmenu（触屏原地松手时会自己弹菜单，不能让系统菜单再插一脚） */
  const suppressContextMenu = ref(false)

  /** 当前这一轮按压的全部临时状态；null = 没有按压在途 */
  let press = null
  let scrollFrame = 0
  let scrollDelta = 0
  let springOpenId = null
  let springOpenTimer = 0
  let suppressClick = false
  let suppressClickTimer = 0

  const dropTargetRowId = computed(() => dropTarget.value?.rowId ?? null)
  const isRootDrop = computed(() => dropTarget.value?.rowId === 'root')
  const draggingId = computed(() => draggingNode.value?.id ?? null)

  // ------------------------------------------------------------ 按压

  /**
   * 行上的 pointerdown。由 FileTreeItem 转交（`@pointerdown`）。
   * @param {PointerEvent} event
   * @param {object} node
   */
  function onRowPointerDown(event, node) {
    if (event.button !== 0) return
    if (press || draggingNode.value) return
    // 重命名输入框里按下的不拖（否则选词就变成拖文件）
    if (event.target instanceof Element && event.target.closest('input, textarea')) return

    press = {
      node,
      pointerId: event.pointerId,
      // 老浏览器可能不给 pointerType，按鼠标处理（退化成「直接拖」而不是「拖不动」）
      pointerType: event.pointerType || 'mouse',
      startX: event.clientX,
      startY: event.clientY,
      armed: false,
      dragging: false,
      captureEl: event.currentTarget instanceof Element ? event.currentTarget : null,
      timer: 0,
    }
    if (press.pointerType !== 'mouse') {
      press.timer = window.setTimeout(arm, LONG_PRESS_MS)
      // 触屏从**按下这一刻**就接管 contextmenu：各家系统长按菜单的阈值并不一致（多数 ~500ms，
      // 但某些 WebView / 系统设置更短），等到 armed 再拦可能已经晚了一步 —— 那会弹出第二个菜单，
      // 并且在随后的拖拽里残留到下一次点击才关。接管权从头拿住，弹菜单的时机就只由我们说了算。
      suppressContextMenu.value = true
      window.addEventListener('contextmenu', onContextMenuBlock, true)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
  }

  /** 触屏按住不动到点了：进入可拖态，并把本次手势的滚动按住（contextmenu 从按下就已接管） */
  function arm() {
    if (!press || press.dragging) return
    press.timer = 0
    press.armed = true
    window.addEventListener('touchmove', onTouchMoveBlock, { passive: false, capture: true })
  }

  /** armed 之后不让浏览器把这次手势当滚动（touch-action 已经改不动了，只能这样拦） */
  function onTouchMoveBlock(event) {
    if (press && event.cancelable) event.preventDefault()
  }

  function onContextMenuBlock(event) {
    if (press) event.preventDefault()
  }

  function onPointerMove(event) {
    if (!press || event.pointerId !== press.pointerId) return

    if (press.dragging) {
      updatePointer(event.clientX, event.clientY)
      return
    }

    const distance = Math.hypot(event.clientX - press.startX, event.clientY - press.startY)
    if (press.armed) {
      // 长按之后动了 = 拖拽；没动就松手 = 右键菜单（在 onPointerUp 里处理）
      if (distance > TOUCH_MOVE_PX) startDrag(event)
      return
    }
    if (press.pointerType === 'mouse') {
      if (distance > MOUSE_MOVE_PX) startDrag(event)
      return
    }
    // 触屏还没到长按阈值就滑走了：这是一次滚动，放弃本次按压（浏览器多半已发 pointercancel）
    if (distance > TOUCH_MOVE_PX) cancelPress()
  }

  function onPointerUp(event) {
    if (!press || event.pointerId !== press.pointerId) return
    const state = press

    if (state.dragging) {
      const target = dropTarget.value
      const zone = activeDropZone.value
      cancelPress()
      // 松手与 click 是两次事件，不挡一下会顺带把落点目录折叠/展开
      markClickSuppressed()
      // 树里没落点就交给外部面板（编辑区）：打开或跳到那个文件
      if (target) onDrop?.(state.node, target)
      else if (zone) zone.onDrop(state.node)
      return
    }

    cancelPress()
    // 触屏长按后原地松手 = 打开右键菜单（保住触屏原有的入口）
    if (state.armed) {
      markClickSuppressed()
      openContextMenu?.({ clientX: event.clientX, clientY: event.clientY }, state.node)
    }
  }

  function onPointerCancel(event) {
    if (!press || event.pointerId !== press.pointerId) return
    cancelPress()
  }

  function onKeyDown(event) {
    if (event.key !== 'Escape') return
    // 拖动中按 Esc：取消，并且不要让 Esc 再触发别的东西（如关闭标签页）
    event.preventDefault()
    event.stopPropagation()
    cancelPress()
    markClickSuppressed()
  }

  // ------------------------------------------------------------ 拖拽

  function startDrag(event) {
    press.dragging = true
    if (press.timer) {
      window.clearTimeout(press.timer)
      press.timer = 0
    }
    draggingNode.value = press.node
    ghostPos.value = { x: event.clientX, y: event.clientY }
    suppressContextMenu.value = true

    // 指针捕获：拖出这一行之后事件仍然回得来。只在真的开始拖时才捕获 —— 提前捕获
    // 会把普通点击与滚动一起搅进来。指针可能已经失效，照 App.vue 分隔条的写法兜住。
    const el = press.captureEl
    if (el?.setPointerCapture) {
      try {
        el.setPointerCapture(press.pointerId)
      } catch {
        /* 指针已经失效，忽略即可 */
      }
    }

    window.addEventListener('touchmove', onTouchMoveBlock, { passive: false, capture: true })
    window.addEventListener('contextmenu', onContextMenuBlock, true)
    window.addEventListener('keydown', onKeyDown, true)

    updateDropTarget(event.clientX, event.clientY)
    updateAutoScroll(event.clientX, event.clientY)
  }

  /** 拖拽中的每次移动：挪幽灵、重算落点、必要时自动滚动 */
  function updatePointer(clientX, clientY) {
    ghostPos.value = { x: clientX, y: clientY }
    updateDropTarget(clientX, clientY)
    updateAutoScroll(clientX, clientY)
  }

  /**
   * 命中测试：指针底下那一行是不是合法落点。
   *
   * 幽灵元素必须 `pointer-events: none` —— 否则 elementFromPoint 永远只命中它自己。
   * 落点语义只有「拖进目录」一种：目录行 = 该目录；文件行 = 它的父目录（跟 VS Code 一样，
   * 让可投递的面积大一些）；树容器空白处 = 根目录。拖回原目录、拖到自己身上、把目录拖进
   * 自己的后代，都算无效，不高亮也不起手。
   */
  function resolveTarget(clientX, clientY, source) {
    const hit = document.elementFromPoint(clientX, clientY)
    const row = hit instanceof Element ? hit.closest('[data-tree-id]') : null

    let rowId = null
    let dirPath = null
    if (row) {
      const node = getNodeById(row.dataset.treeId)
      if (!node) return null
      if (node.type === 'directory') {
        rowId = node.id
        dirPath = node.path
      } else {
        const parent = getNodeById(node.parentId)
        if (!parent) return null
        rowId = parent.id
        dirPath = parent.path
      }
    } else {
      const tree = treeEl?.value
      if (!tree) return null
      const rect = tree.getBoundingClientRect()
      const inside =
        clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
      if (!inside) return null
      rowId = 'root'
      dirPath = '/'
    }

    if (dirPath === source.path) return null
    // 已经在这个目录里了，拖过去等于什么都没做
    if (dirname(source.path) === dirPath) return null
    // 目录不能移进自己的后代（provider 也会拦，这里先不给出高亮）
    if (source.type === 'directory' && isWithin(source.path, dirPath)) return null
    return { rowId, path: dirPath }
  }

  function updateDropTarget(clientX, clientY) {
    if (!press?.dragging) return
    const next = resolveTarget(clientX, clientY, press.node)
    // 树里没命中才轮到外部面板（编辑区）—— 顺序反过来的话，在树里划过时会把编辑区也点亮
    activeDropZone.value = next ? null : hitDropZone(clientX, clientY, press.node)
    const changed = next?.rowId !== dropTarget.value?.rowId
    dropTarget.value = next
    if (changed) updateSpringOpen()
  }

  /** 悬停在折叠的目录行上就自动展开 —— 触屏拖拽时手指腾不出来点它 */
  function updateSpringOpen() {
    const id = dropTarget.value?.rowId
    if (id === springOpenId) return
    clearSpringOpen()
    if (!id || id === 'root') return
    const node = getNodeById(id)
    if (!node || node.type !== 'directory') return
    if (workspace.expandedIds.includes(id)) return
    springOpenId = id
    springOpenTimer = window.setTimeout(() => {
      springOpenTimer = 0
      springOpenId = null
      toggleExpand(id)
    }, SPRING_OPEN_MS)
  }

  function clearSpringOpen() {
    if (springOpenTimer) {
      window.clearTimeout(springOpenTimer)
      springOpenTimer = 0
    }
    springOpenId = null
  }

  /** 指针贴近树容器上下边缘时持续滚动（触屏拖拽时手指滚不了列表） */
  function updateAutoScroll(clientX, clientY) {
    const tree = treeEl?.value
    if (!tree) return
    const rect = tree.getBoundingClientRect()
    // 拖到树外面（比如编辑区）就别滚了 —— 树里的纵向位置照样贴近边缘，只看 Y 的话
    // 会一边拖着编辑区里晃、一边把左树自己滚到底
    if (clientX < rect.left || clientX > rect.right) {
      scrollDelta = 0
      stopAutoScroll()
      return
    }
    let delta = 0
    if (clientY < rect.top + EDGE_PX) delta = -SCROLL_STEP
    else if (clientY > rect.bottom - EDGE_PX) delta = SCROLL_STEP

    scrollDelta = delta
    if (!delta) {
      stopAutoScroll()
      return
    }
    if (!scrollFrame) scrollFrame = window.requestAnimationFrame(stepAutoScroll)
  }

  function stepAutoScroll() {
    scrollFrame = 0
    const tree = treeEl?.value
    if (!tree || !scrollDelta || !press?.dragging) return

    const before = tree.scrollTop
    tree.scrollTop = before + scrollDelta
    // 已经到顶 / 到底：停下，别再空转（也没必要继续改落点）
    if (tree.scrollTop === before) return

    const pos = ghostPos.value
    updateDropTarget(pos.x, pos.y)
    scrollFrame = window.requestAnimationFrame(stepAutoScroll)
  }

  function stopAutoScroll() {
    scrollDelta = 0
    if (scrollFrame) {
      window.cancelAnimationFrame(scrollFrame)
      scrollFrame = 0
    }
  }

  // ------------------------------------------------------------ 收尾

  /** 清掉这一轮按压的全部临时状态（不动 click 抑制，那个要活到 click 之后） */
  function cancelPress() {
    if (press?.timer) window.clearTimeout(press.timer)
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointercancel', onPointerCancel)
    window.removeEventListener('touchmove', onTouchMoveBlock, true)
    window.removeEventListener('contextmenu', onContextMenuBlock, true)
    window.removeEventListener('keydown', onKeyDown, true)
    stopAutoScroll()
    clearSpringOpen()
    press = null
    draggingNode.value = null
    dropTarget.value = null
    // 松手 / Esc / pointercancel / 卸载都汇到这儿：外部落点的高亮也一并收掉
    activeDropZone.value = null
    suppressContextMenu.value = false
  }

  function markClickSuppressed() {
    suppressClick = true
    if (suppressClickTimer) window.clearTimeout(suppressClickTimer)
    // 兜底：万一这次没有 click 跟上来，别让标记永远吞掉下一次正常点击
    suppressClickTimer = window.setTimeout(() => {
      suppressClickTimer = 0
      suppressClick = false
    }, CLICK_SUPPRESS_MS)
  }

  /** 行上的 onClick 开头调用；返回 true 表示这次点击是拖拽的尾巴，应当忽略 */
  function consumeClickSuppression() {
    if (!suppressClick) return false
    suppressClick = false
    if (suppressClickTimer) {
      window.clearTimeout(suppressClickTimer)
      suppressClickTimer = 0
    }
    return true
  }

  onBeforeUnmount(cancelPress)

  return {
    /** 正在被拖的节点（幽灵渲染用） */
    draggingNode,
    draggingId,
    ghostPos,
    dropTargetRowId,
    isRootDrop,
    suppressContextMenu,
    onRowPointerDown,
    consumeClickSuppression,
  }
}
