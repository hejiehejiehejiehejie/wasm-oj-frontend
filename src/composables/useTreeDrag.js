/**
 * useTreeDrag —— 资源管理器文件树的拖拽移动（鼠标与触屏共用一套 Pointer Events）。
 *
 * 【为什么不走 HTML5 拖放】`dragstart` / `drop` 在触屏上根本不触发，幽灵元素的外观与
 * 自动滚动也不可控。这里从 `pointerdown` 起手自己实现，两条路径只在「怎么算起手」上分叉：
 *   - 鼠标：不需要长按，位移超过 4px 就算拖。
 *   - 触屏：按住不动约 450ms 到点，**菜单当场弹出来**（2026-10-11 改，以前要等抬手才弹）——
 *     原地抬手 = 菜单留在屏幕上接着点；此后一动（超过 8px）= 把菜单收掉、改判成拖拽。触屏的
 *     `contextmenu` 在**按下那一刻**就被接管，所以这张菜单只会有我们自己弹的那一份，
 *     与系统长按阈值无关。
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
import { getNodeById } from '../services/vfs/workspaceStore.js'
import { dirname, isWithin } from '../services/vfs/paths.js'
import { contentElementAt } from './contentHit.js'
import { createSpringOpen } from './springOpen.js'

/** 触屏长按多久算「到点了」—— 这一刻菜单当场弹出，也从此可以拖。与系统长按菜单的阈值无关
 *  （按下即接管，见下）——450ms 只是手感。
 *  ⚠️ 这个数牵着一处样式：`FileTreeItem.vue` 里按压进度那条 `transition: background-color 450ms linear`
 *  ——底色要在到点那一刻刚好走完，改一边就得改另一边（见那两个类上的注释）。 */
const LONG_PRESS_MS = 450
/** 鼠标判定成拖拽的位移（像素） */
const MOUSE_MOVE_PX = 4
/** 触屏 armed 之后判定成拖拽的位移（比鼠标大一点，给手指留抖动的余量） */
const TOUCH_MOVE_PX = 8
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
 * 【矩形 + 命中元素，两道都要】矩形这道是为了跟幽灵无关：拖拽时幽灵就贴在手底下，谁压在谁
 * 上面全靠 DOM 顺序，只看 elementFromPoint 就得先赌幽灵 `pointer-events: none` 万无一失。
 *
 * 但**只看矩形会误判**（2026-10-31 用户报）：窄屏（`html.is-narrow`）下侧栏不是并排的一栏，
 * 而是**压在编辑区之上的覆盖层** —— 编辑区自己的盒子照旧铺满整块工作区，412 宽的实测几何是
 * `stage: 7 → 405`、侧栏 `51.7 → 405.7`，编辑区的矩形把整棵树都框在里面。于是在树里任何
 * 「树内落点为空」的位置（拖的是根目录下的文件、落点就是根，按下面的规则算无效）都会顺手
 * 点亮编辑区：用户看到的是「想拖到根，亮起来的却是编辑区」。所以要再问一句指针底下**确实是
 * 它**才算命中 —— 指针在树里时，`elementFromPoint` 拿到的是树的元素，编辑区就被排除了。
 *
 * @param {object} source 被拖的节点（给 canDrop 判要不要接）
 * @param {Element|null} [probe] 指针底下那个内容元素（调用方已算好时传进来，省一次命中测试）
 */
function hitDropZone(clientX, clientY, source, probe) {
  const hit = probe === undefined ? contentElementAt(clientX, clientY) : probe
  for (const zone of zones) {
    if (zone.canDrop && !zone.canDrop(source)) continue
    const rect = zone.el?.getBoundingClientRect()
    // 面板被折没了（宽 0）不算落点
    if (!rect || rect.width <= 0) continue
    const inside =
      clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
    if (!inside) continue
    if (hit instanceof Element && zone.el.contains(hit)) return zone
  }
  return null
}

/**
 * @param {object} options
 * @param {import('vue').Ref<HTMLElement|null>} options.treeEl 树容器（用于取矩形与滚动）
 * @param {(node: object, target: { rowId: string, path: string }) => void} options.onDrop
 * @param {(event: { clientX: number, clientY: number }, node: object) => void} options.openContextMenu
 * @param {() => void} options.closeContextMenu 收掉菜单（长按弹出后又在原地移动 = 改判成拖拽）
 */
export function useTreeDrag({ treeEl, onDrop, openContextMenu, closeContextMenu }) {
  /** 正在被拖的节点；null = 没在拖 */
  const draggingNode = shallowRef(null)
  /** 幽灵元素的位置（跟手） */
  const ghostPos = ref({ x: 0, y: 0 })
  /** 当前合法落点：{ rowId, path }；rowId 为 'root' 表示落点是根目录 */
  const dropTarget = ref(null)
  /** 长按已接管 contextmenu（触屏原地松手时会自己弹菜单，不能让系统菜单再插一脚） */
  const suppressContextMenu = ref(false)

  /**
   * 触屏按压中的行 id —— 行上的「按住进度」底色靠它（见 FileTreeItem 的 --pressing）。
   * 只对触屏置位：鼠标按下就该立刻拖，中间那段「等待」不存在，给进度反而像卡了。
   */
  const pressingId = shallowRef(null)
  /**
   * 长按已成（菜单也弹出来了）、但还没松手也没开始拖的行 id —— 行上的「弹一下」动画与就绪底色靠它。
   * 与 pressingId 的分工：pressing 是「还在等」，armed 是「已经到点，此后移动即拖动」。
   */
  const armedId = shallowRef(null)

  /** 当前这一轮按压的全部临时状态；null = 没有按压在途 */
  let press = null
  let scrollFrame = 0
  let scrollDelta = 0
  /** 悬停在折叠目录上自动展开的时钟（与系统拖入共用一份实现，见 springOpen.js） */
  const springOpen = createSpringOpen()
  let suppressClick = false
  let suppressClickTimer = 0
  /** 吃「长按抬手那一发 click」的网是否张着（见 armSwallowClick） */
  let swallowClickOn = false

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
      /** 长按到点时弹的那张菜单还在屏幕上（收它归这次手势负责，见 startDrag / onPointerCancel） */
      menuOpen: false,
      captureEl: event.currentTarget instanceof Element ? event.currentTarget : null,
      timer: 0,
    }
    if (press.pointerType !== 'mouse') {
      // 按压进度：行的底色从透明线性走到 --bg-hover（450ms 那条过渡写在 FileTreeItem 里，
      // 与下面这张表同步）；到点由 arm() 换成「就绪态」。
      pressingId.value = node.id
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

  /** 触屏按住不动到点了：**当场把菜单弹出来**，并把本次手势的滚动按住（contextmenu 从按下就已接管） */
  function arm() {
    if (!press || press.dragging) return
    press.timer = 0
    press.armed = true
    // 到点了：行换成「就绪态」——弹一下 + 底色加深，一直留到松手或开始拖。
    // 这一刻是整条手势里唯一「告诉用户长按成功了」的信号，别把它省掉。
    // pressing 必须同时退场：两态是互斥的（等 → 已就绪），而且 --pressing 自带那条
    // 450ms linear 的过渡会跟着留下，松手时整行要用 450ms 才淡回去、比别的行慢一拍。
    pressingId.value = null
    armedId.value = press.node.id
    window.addEventListener('touchmove', onTouchMoveBlock, { passive: false, capture: true })
    // 菜单就弹在手指底下（到点这一刻指头离起点还不到 8px，用起点就够准）。接下来的分叉全看这根
    // 指头干什么：原地抬手 = 菜单留下接着点（见 onPointerUp）；一动 = 收掉菜单改判成拖（见 startDrag）。
    press.menuOpen = true
    openContextMenu?.({ clientX: press.startX, clientY: press.startY }, press.node)
    // 抬手那一下浏览器还会补一发合成 click，落点可能就是菜单里的某一条（见 onSwallowClick）
    armSwallowClick()
  }

  /** armed 之后不让浏览器把这次手势当滚动（touch-action 已经改不动了，只能这样拦） */
  function onTouchMoveBlock(event) {
    if (press && event.cancelable) event.preventDefault()
  }

  function onContextMenuBlock(event) {
    if (press) event.preventDefault()
  }

  /**
   * 长按弹出的菜单是**手指还按着的时候**浮上来的，所以抬手那一下浏览器还会补一发合成 click。
   * 它的落点跟着菜单被视口推到的位置走 —— 在屏幕下半部按住时，菜单会被整个推到指头之上，
   * 点击目标正好是某一根条目，于是「长按看一眼菜单」就变成「顺手把第一条执行了」。所以这一发
   * 从捕获阶段整个吃掉：既 `preventDefault` 也 `stopPropagation`，菜单那边收不到它。
   */
  function onSwallowClick(event) {
    event.preventDefault()
    event.stopPropagation()
    disarmSwallowClick()
  }

  function armSwallowClick() {
    if (swallowClickOn) return
    swallowClickOn = true
    window.addEventListener('click', onSwallowClick, true)
    // 兜底收网：没等到那发 click 就说明浏览器不补（有些平台如此），下一根指头按下来时收掉，
    // 免得它一直张着、把用户随后正常点的那一下吃掉。
    window.addEventListener('pointerdown', disarmSwallowClick, true)
  }

  /**
   * 收掉吃 click 的那张网。**不能挂在 cancelPress 上**：抬手正是要把那发 click 吃掉，而
   * cancelPress 比它早一步跑（见 onPointerUp）——挂在那里等于刚张网就收网。
   */
  function disarmSwallowClick() {
    if (!swallowClickOn) return
    swallowClickOn = false
    window.removeEventListener('click', onSwallowClick, true)
    window.removeEventListener('pointerdown', disarmSwallowClick, true)
  }

  function onPointerMove(event) {
    if (!press || event.pointerId !== press.pointerId) return

    if (press.dragging) {
      updatePointer(event.clientX, event.clientY)
      return
    }

    const distance = Math.hypot(event.clientX - press.startX, event.clientY - press.startY)
    if (press.armed) {
      // 长按之后动了 = 收掉菜单、改判成拖拽；没动就松手 = 菜单留在屏幕上接着点（onPointerUp 那边
      // 只需把这一下 click 吃掉，不再弹菜单）
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
    // 触屏长按后原地松手：菜单已经在 arm() 里弹好了，这里不用再弹一个 —— 只把「这一下 click
    // 不算数」补上（菜单没盖住指头时，它落在行上会顺手把目录折叠 / 文件打开）。
    if (state.armed) markClickSuppressed()
  }

  function onPointerCancel(event) {
    if (!press || event.pointerId !== press.pointerId) return
    const state = press
    cancelPress()
    // 手势被浏览器收走（判成滚动等）：长按弹出的那张菜单没有了归属，一起收掉
    if (state.menuOpen) closeContextMenu?.()
    disarmSwallowClick()
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
    // 真的拖起来了：按压 / 就绪那一套退场，改由 draggingId 表达（行变淡 + 幽灵跟手）。
    // 留着的话，被拖的那一行会同时挂着就绪底色与投影，跟「变淡」叠在一起很脏。
    pressingId.value = null
    armedId.value = null
    ghostPos.value = { x: event.clientX, y: event.clientY }
    suppressContextMenu.value = true
    // 长按弹出的菜单要让位：指头一动，这次手势就从「看菜单」变成「拖」了。
    // 得要它先退场 —— 菜单就压在指针底下，`elementFromPoint` 命中的会是它而不是树里的行。
    if (press.menuOpen) {
      press.menuOpen = false
      closeContextMenu?.()
    }
    // 菜单都收了，吃抬手那发 click 的网也不必再张着（拖拽的收尾由 markClickSuppressed 管）
    disarmSwallowClick()

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
   * 另外还得**穿透两件浮在内容上的界面件**（覆盖式滚动条的滑块、两栏之间的分隔条热区）：
   * 它们盖住树右缘那一条，会让这里的命中测试拿不到行、落点退化成「树空白处 = 根目录」。
   * 这一层封装在 `contentHit.js` 的 `contentElementAt` 里（另两处同款：usePageDrop、
   * App.vue 的 ⌘A 区域判据）。
   *
   * 落点语义只有「拖进目录」一种：目录行 = 该目录；文件行 = 它的父目录（跟 VS Code 一样，
   * 让可投递的面积大一些）；树容器空白处 = 根目录。拖回原目录、拖到自己身上、把目录拖进
   * 自己的后代，都算无效，不高亮也不起手。
   */
  function resolveTarget(clientX, clientY, source, probe) {
    const hit = probe === undefined ? contentElementAt(clientX, clientY) : probe
    // 长按弹出的那张菜单在「收掉」与「真的从 DOM 里消失」之间隔着一帧（Vue 的更新是异步的）。
    // 这一帧里指针底下压着的就是菜单本身，按「树空白处」算会闪出一整棵树都高亮的落点 —— 当作
    // 没命中，下一帧落点就正常回来了。
    if (hit instanceof Element && hit.closest('.context-menu')) return null
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
    // 指针底下「究竟是谁」两个判据共用：树内落点与树外落点各查一次 DOM 命中，这里先算一遍
    const hit = contentElementAt(clientX, clientY)
    const next = resolveTarget(clientX, clientY, press.node, hit)
    // 树里没命中才轮到外部面板（编辑区）—— 顺序反过来的话，在树里划过时会把编辑区也点亮
    activeDropZone.value = next ? null : hitDropZone(clientX, clientY, press.node, hit)
    const changed = next?.rowId !== dropTarget.value?.rowId
    dropTarget.value = next
    // 悬停在折叠的目录行上就自动展开 —— 触屏拖拽时手指腾不出来点它
    if (changed) springOpen.hover(next?.rowId ?? null)
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
    springOpen.cancel()
    press = null
    // 触屏那两个提示态统一在这里收：松手、Esc、pointercancel、组件卸载都汇到这条路上，
    // 漏掉任何一个出口，行上的「弹过了 / 正按着」的样子就会一直挂在那儿
    pressingId.value = null
    armedId.value = null
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

  onBeforeUnmount(() => {
    cancelPress()
    // 卸载时那发 click 已经无从出口，网一并收掉（它挂在 window 上，留着会跨组件活）
    disarmSwallowClick()
  })

  return {
    /** 正在被拖的节点（幽灵渲染用） */
    draggingNode,
    draggingId,
    ghostPos,
    dropTargetRowId,
    isRootDrop,
    suppressContextMenu,
    /** 触屏按压中的行 id（「按住进度」底色） */
    pressingId,
    /** 长按已成、尚未松手的行 id（「弹一下」动画 + 就绪底色 / 投影） */
    armedId,
    onRowPointerDown,
    consumeClickSuppression,
  }
}
