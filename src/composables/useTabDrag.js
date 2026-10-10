/**
 * useTabDrag —— 编辑器页签的拖动排序（鼠标与触屏共用一套 Pointer Events）。
 *
 * 【只排文件页签】条带里有两类页签：真实文件页签（`workspace.openTabIds`）与合成视图页签
 * （设置 / 抽题，`editorViews.viewOrder`）。这里**只让文件页签参与排序**，视图页签恒定排在
 * 文件页签之后 —— 两类页签分属两份状态，硬做成一条可混排的序列等于把两处状态合并，
 * 违反「视图页签不进 openTabIds」那条纪律（见 services/editorViews.js 的文件头）。
 * 落点下标因此恒落在 `[0, openTabIds.length]`，把文件页签拖到视图页签上也只会停在末尾。
 * 参与排序的页签靠 `data-tab-id` 认（只有文件页签带这个属性）。
 *
 * 【为什么不用 HTML5 拖放】同 useTreeDrag：`dragstart` / `drop` 在触屏上根本不触发，
 * 幽灵元素的外观与自动滚动也不可控。这里从 `pointerdown` 起手自己实现。
 *
 * 【两类设备的起手判据】
 *   - 鼠标 / 笔：不需要长按，横向位移超过 5px 即算拖。
 *   - 触屏：条带本身是**横向滚动容器**，直接拖会与滚动打架，所以按住约 450ms 先进入
 *     armed（可拖）态，之后继续移动才真的开始拖；armed 之后立即用**非被动** `touchmove`
 *     + `preventDefault()` 把滚动按住（`touch-action` 在手势开始时就读定了、中途改它无效，
 *     这条结论与 useTreeDrag / App.vue 分隔条出自同一次踩坑）。
 *
 * 【拖拽期间不动 openTabIds】只在松手那一刻提交排序，收尾补间交给 TransitionGroup 的
 * `.tab-move`。中途改数组会让「被拖的那个」也被 FLIP 补间一次，与拖拽视觉打架。
 *
 * 【本模块不碰 VFS / store】落盘由调用方的 `onDrop(id, insertIndex)` 交给 store 的 moveTab。
 */
import { onBeforeUnmount, ref, shallowRef } from 'vue'

/** 触屏长按多久算「我要拖了」。与 useTreeDrag 同值，手感一致 */
const LONG_PRESS_MS = 450
/** 鼠标判定成拖拽的位移（像素）。比 useTreeDrag 的 4px 大一点：页签窄，抖动误触的代价是「位置被改」 */
const MOUSE_MOVE_PX = 5
/** 触屏 armed 之后判定成拖拽的位移（比鼠标大一点，给手指留抖动余量） */
const TOUCH_MOVE_PX = 8
/** 指针距条带左右边缘多近开始自动滚动 */
const EDGE_PX = 24
/** 自动滚动每帧步长 */
const SCROLL_STEP = 8
/** 拖拽结束后用来吃掉紧随其后那次 click 的时间上限 */
const CLICK_SUPPRESS_MS = 300

/**
 * @param {object} options
 * @param {import('vue').Ref<HTMLElement|null>} options.rootEl `.editor-tabs` 根元素
 *   （指示条相对它定位，所以要拿它算 rect，而不能只看条带）
 * @param {(id: string, insertIndex: number) => void} options.onDrop 松手时的落盘回调
 */
export function useTabDrag({ rootEl, onDrop }) {
  /** 正在被拖的页签 id；null = 没在拖（页签上的拖拽态类看它） */
  const draggingId = shallowRef(null)
  /** 插入指示条相对 `.editor-tabs` 左缘的偏移（px）；null = 不显示 */
  const indicatorX = ref(null)

  /** 落点插入下标（在「去掉被拖项」的列表里的位置，见 moveTab 契约） */
  let dropIndex = null
  /** 当前这一轮按压的全部临时状态；null = 没有按压在途 */
  let press = null
  let scrollFrame = 0
  let scrollDelta = 0
  let suppressClick = false
  let suppressClickTimer = 0

  const stripEl = () => rootEl.value?.querySelector('.editor-tabs__strip') ?? null

  /** 参与排序的文件页签元素（按 DOM 顺序，即当前 openTabIds 顺序） */
  function fileTabEls() {
    const strip = stripEl()
    return strip ? [...strip.querySelectorAll('.editor-tabs__item[data-tab-id]')] : []
  }

  // ------------------------------------------------------------ 按压

  /**
   * 页签上的 pointerdown，由模板转交（`@pointerdown`）。
   * @param {PointerEvent} event
   * @param {string} id
   */
  function onTabPointerDown(event, id) {
    if (event.button !== 0) return
    if (press || draggingId.value) return
    // 关闭按钮（×）上起手不拖 —— 那是要关页签
    if (event.target instanceof Element && event.target.closest('.editor-tabs__close')) return
    // 只有一个文件页签时无处可放，不起手（既省掉一次无意义的拖拽，也不会有「拖动一个不动的页签」的怪感）
    if (fileTabEls().length < 2) return

    press = {
      id,
      pointerId: event.pointerId,
      // 老浏览器可能不给 pointerType，按鼠标处理（退化成「直接拖」而不是「拖不动」）
      pointerType: event.pointerType || 'mouse',
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      armed: false,
      dragging: false,
      captureEl: event.currentTarget instanceof Element ? event.currentTarget : null,
      timer: 0,
    }
    if (press.pointerType !== 'mouse') press.timer = window.setTimeout(arm, LONG_PRESS_MS)

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
  }

  /** 触屏按住不动到点了：进入可拖态，并把本次手势的滚动按住 */
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

  function onPointerMove(event) {
    if (!press || event.pointerId !== press.pointerId) return
    press.lastX = event.clientX
    press.lastY = event.clientY

    if (press.dragging) {
      updateDrop(event.clientX, event.clientY)
      return
    }

    const distance = Math.hypot(event.clientX - press.startX, event.clientY - press.startY)
    if (press.armed) {
      // 长按之后动了 = 拖拽；没动就松手 = 什么都不做（在 onPointerUp 里处理）
      if (distance > TOUCH_MOVE_PX) startDrag(event)
      return
    }
    if (press.pointerType === 'mouse') {
      if (distance > MOUSE_MOVE_PX) startDrag(event)
      return
    }
    // 触屏还没到长按阈值就滑走了：这是一次横向滚动，放弃本次按压（浏览器多半已发 pointercancel）
    if (distance > TOUCH_MOVE_PX) cancelPress()
  }

  function onPointerUp(event) {
    if (!press || event.pointerId !== press.pointerId) return
    const state = press

    if (state.dragging) {
      const index = dropIndex
      cancelPress()
      // 松手与 click 是两次事件，不挡一下会顺带触发页签的 activate（切过去）
      markClickSuppressed()
      if (index !== null) onDrop?.(state.id, index)
      return
    }

    cancelPress()
    // 触屏长按后原地松手：多半是想拖但没动，不当作点击（吃掉紧随其后的 activate）
    if (state.armed) markClickSuppressed()
  }

  function onPointerCancel(event) {
    if (!press || event.pointerId !== press.pointerId) return
    cancelPress()
  }

  function onKeyDown(event) {
    if (event.key !== 'Escape') return
    // 拖动中按 Esc：取消，并且别让 Esc 再触发别的东西
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
    draggingId.value = press.id

    // 指针捕获：横向拖出条带之后事件仍然回得来。只在该开始拖时才捕获 —— 提前捕获会把
    // 普通点击与横向滚动一起搅进来（指针可能已失效，照 App.vue 分隔条的写法兜住）。
    const el = press.captureEl
    if (el?.setPointerCapture) {
      try {
        el.setPointerCapture(press.pointerId)
      } catch {
        /* 指针已经失效，忽略即可 */
      }
    }

    window.addEventListener('touchmove', onTouchMoveBlock, { passive: false, capture: true })
    window.addEventListener('keydown', onKeyDown, true)

    updateDrop(event.clientX, event.clientY)
  }

  /** 拖拽中的每次移动：重算落点与指示条，必要时自动滚动 */
  function updateDrop(clientX, clientY) {
    resolveDrop(clientX)
    updateAutoScroll(clientX, clientY)
  }

  /**
   * 落点命中：拿指针的 clientX 与「其余文件页签」的中线比。
   *
   * 用 rect 而不是 offsetLeft 是因为条带可能正在横向滚动 —— rect 天然含滚动偏移，
   * 省得再补一个 scrollLeft（也就不会与自动滚动那次重算脱节）。
   * 插到最右时取**全部**文件页签的右缘（含被拖那一个）：被拖项还占着自己那一格，
   * 若只看「其余」的右缘，把最后一个页签往右拖时指示条会画到它自己的左缘上去。
   */
  function resolveDrop(clientX) {
    const root = rootEl.value
    const strip = stripEl()
    if (!root || !strip) return

    const all = fileTabEls()
    const rest = all.filter((el) => el.dataset.tabId !== draggingId.value)

    let index = 0
    let edgeX = null
    for (const el of rest) {
      const rect = el.getBoundingClientRect()
      if (clientX < rect.left + rect.width / 2) {
        edgeX = rect.left
        break
      }
      index += 1
    }
    if (edgeX === null) {
      const last = all[all.length - 1]
      edgeX = last ? last.getBoundingClientRect().right : strip.getBoundingClientRect().left
    }

    dropIndex = index
    indicatorX.value = edgeX - root.getBoundingClientRect().left
  }

  /** 指针贴近条带左右边缘时持续横向滚动（页签多到溢出时，拖到边缘能继续挪） */
  function updateAutoScroll(clientX, clientY) {
    const strip = stripEl()
    if (!strip) return
    const rect = strip.getBoundingClientRect()
    // 指针已不在条带的纵向范围内（比如拖到编辑区里去）：别滚
    if (clientY < rect.top - 12 || clientY > rect.bottom + 12) {
      stopAutoScroll()
      return
    }
    let delta = 0
    if (clientX < rect.left + EDGE_PX) delta = -SCROLL_STEP
    else if (clientX > rect.right - EDGE_PX) delta = SCROLL_STEP

    scrollDelta = delta
    if (!delta) {
      stopAutoScroll()
      return
    }
    if (!scrollFrame) scrollFrame = window.requestAnimationFrame(stepAutoScroll)
  }

  function stepAutoScroll() {
    scrollFrame = 0
    const strip = stripEl()
    if (!strip || !scrollDelta || !press?.dragging) return

    const before = strip.scrollLeft
    strip.scrollLeft = before + scrollDelta
    // 已经到顶 / 到底：停下，别空转
    if (strip.scrollLeft === before) return

    // 滚动把页签挪了位置，落点与指示条要按同一个指针位置重算
    resolveDrop(press.lastX)
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
    window.removeEventListener('keydown', onKeyDown, true)
    stopAutoScroll()
    press = null
    dropIndex = null
    draggingId.value = null
    indicatorX.value = null
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

  /** 页签的 activate / 双击钉住开头调用；返回 true 表示这次点击是拖拽的尾巴，应当忽略 */
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
    /** 正在被拖的页签 id（页签上的拖拽态类用） */
    draggingId,
    /** 插入指示条相对根容器的左偏移；null = 不显示 */
    indicatorX,
    onTabPointerDown,
    consumeClickSuppression,
  }
}
