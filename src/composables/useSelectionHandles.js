/**
 * useSelectionHandles —— 触屏编辑区的选区手柄（2026-10-10 加）。
 *
 * Monaco **没有**「拖两端圆点改选区」的能力（它的 `Gesture` 只认轻点 / 双击 / 长按，
 * 见 HANDOFF 第 5 节坑 31），所以这一层整个自己画：一块盖在编辑器上的浮层 + 两颗圆点。
 *
 * 【位置怎么算】
 * `editor.getScrolledVisiblePosition(position)` —— 给的是**相对编辑器 DOM 节点**（`.monaco-editor`）
 * 的 `{ top, left, height }`，**已经含滚动偏移**，比自己在 JS 里复刻一遍行高 / 折行 / 横向滚动可靠。
 * 浮层挂在 `.editor-pane__stage` 上（host 的父层），所以再补一个「host 相对 stage」的偏移即可。
 *
 * 【拖动怎么改选区】
 * 按下时把**对面那一端**的位置存成 `fixed`，此后每次移动都用
 * `getTargetAtClientPoint()` 把手势坐标换回 model 位置，再 `setSelection(Range.fromPositions(fixed, next))`。
 * 选区、高亮、状态栏的「已选中 N 字符」全部仍由 Monaco 自己维护，这里不碰任何渲染。
 *
 * ⚠️ **拖动期间必须让手柄对命中测试隐身**（`dragging` → CSS 的 `.is-dragging`）。
 * `getTargetAtClientPoint` 在没传 `eventTarget` 时会**自己做一次 DOM 命中测试**
 * （`mouseTarget.js` 的 `HitTestRequest._useHitTestTarget`），而我们的手柄是编辑器 DOM
 * **之外**的元素 —— 落点压在手柄上时，`_hitTestViewLines` 拿到的 target 不在 `.overflow-guard`
 * 里，于是整条链走到 `fulfillUnknown()`，返回 `type: 0 / position: null`，`applyDrag` 直接
 * 放弃这一帧。后果是**手指一旦移进手柄自己那 44px 的盒子里就再也拖不动了**（实测：
 * 起点手柄往上拖一行的距离正好落在盒内，拖动当场卡死；x 轴上扫一遍能看到
 * `elementFromPoint` 从 `span.selection-handle--start` 切到 `span.mtk8` 的那一列就是分界）。
 * `pointer-events: none` 的元素会被 `elementFromPoint` 跳过，所以拖动一开始就把两颗手柄
 * 都设成隐身即可；监听挂在 window 上、触摸另有隐式指针捕获，拖动本身不受影响。
 *
 * 【只对触摸出手柄】
 * 桌面鼠标本来就有一条「按住拖选」的路，再挂两颗圆点只会碍事（也挡不住手柄底下的点击）。
 * 判据是「最近一次落在编辑区的指针是不是触摸」：初值取触摸屏的两种口径
 * （`isTouchPointer()` 看粗指针、`navigator.maxTouchPoints` 看有没有触摸硬件，后者是给
 * 「触摸屏笔记本 + 鼠标」这种粗指针为 fine 的设备兜底），之后每次 `pointerdown` 按
 * `pointerType` 更新 —— 鼠标一按就收起来，不需要猜设备型号。
 *
 * 【两颗手柄的朝向】
 * 起点手柄的圆点在选区**上沿之上**、杆向下接到文字；终点手柄的圆点在**下沿之下**、杆向上。
 * 这是 iOS / Android 原生文本控件的样子。盒子位置夹在编辑器可视区内：端点滚出视口时
 * 手柄贴在边上，不会飘到页签栏或状态栏上（见 `place()`）。
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { monaco } from '../monaco-setup.js'
import { isTouchPointer } from './useMobileKeyboard.js'

/**
 * 手柄盒子的逻辑尺寸 —— **必须与 `.selection-handle` 的 CSS 宽高一致**。
 * 那一边写 px，构建期被 postcss-pxtorem 转成 rem、跟着 `--ui-scale` 缩放，
 * 所以这里读一次 `--ui-scale` 再乘上去，两边才是同一套屏幕坐标（见 `uiScale()`）。
 */
const HANDLE_BOX = 44
/** 圆点直径与它离盒子端边的间距 —— 同样必须与 `.selection-handle::before` 的 CSS 一致 */
const KNOB_SIZE = 16
const KNOB_GAP = 6
/** 手指拖到距编辑器上下边这么近就开始自动滚动（逻辑 px） */
const EDGE_ZONE = 32
/** 自动滚动每帧的量（逻辑 px） */
const EDGE_STEP = 8
/** 拖动时把坐标再往内容区里推一点，免得落在行号槽上拿不到 position */
const CONTENT_PAD = 2

/**
 * @param {{
 *   editor: import('vue').Ref,
 *   host: import('vue').Ref,
 *   stage: import('vue').Ref,
 *   active: import('vue').Ref<boolean>,
 * }} options
 *   `editor` = Monaco 实例（setup 里还是 null，由 watch 在它出现时补订阅）
 *   `host` = 编辑器容器（指针类型探测挂它）
 *   `stage` = 浮层的定位父层（手柄坐标相对它）
 *   `active` = 编辑区此刻真的露着（被设置 / 抽题 / 预览盖住时为 false，手柄整层收掉）
 */
export function useSelectionHandles({ editor, host, stage, active }) {
  /** 两颗手柄相对 stage 的**盒子左上角**；null = 当下不该显示 */
  const handles = ref(null)

  /**
   * 是否正在拖。模板拿它挂 `.is-dragging`，好让手柄在拖动期间对命中测试隐身
   * （为什么必须这么做见文件头那条 ⚠️）。
   */
  const dragging = ref(false)

  /** 最近一次落在编辑区的指针是不是触摸 */
  const touchActive = ref(
    typeof navigator !== 'undefined' &&
      (isTouchPointer() || navigator.maxTouchPoints > 0),
  )

  /** Monaco 事件订阅，实例就绪时挂、卸载 / 换实例时摘 */
  let disposables = []
  /** 拖动现场；null = 没在拖 */
  let drag = null
  /** 边缘自动滚动的 rAF 句柄 */
  let edgeFrame = 0
  /** 重算的 rAF 句柄（滚动 / 选区变动会成串地来，一帧算一次够了） */
  let updateFrame = 0

  /** `--ui-scale` 是 `applyUiScale()` 写在 `<html>` 上的无单位倍数，读不到就按 1 */
  function uiScale() {
    if (typeof document === 'undefined') return 1
    const value = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--ui-scale'),
    )
    return Number.isFinite(value) && value > 0 ? value : 1
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max)
  }

  // --------------------------------------------------------------- 算位置

  function schedule() {
    if (updateFrame) return
    updateFrame = window.requestAnimationFrame(() => {
      updateFrame = 0
      update()
    })
  }

  function update() {
    const instance = editor.value
    const hostEl = host.value
    const stageEl = stage.value
    if (
      !instance?.getModel() ||
      !hostEl ||
      !stageEl ||
      !active.value ||
      !touchActive.value
    ) {
      handles.value = null
      return
    }
    const selection = instance.getSelection()
    if (!selection || selection.isEmpty()) {
      handles.value = null
      return
    }

    const hostRect = hostEl.getBoundingClientRect()
    const stageRect = stageEl.getBoundingClientRect()
    const dx = hostRect.left - stageRect.left
    const dy = hostRect.top - stageRect.top
    const viewW = hostEl.clientWidth
    const viewH = hostEl.clientHeight
    const scale = uiScale()
    const box = HANDLE_BOX * scale
    /** 圆点整个露出来所需的最小边距（＝圆点到盒子那一条端边的距离） */
    const inset = (KNOB_GAP + KNOB_SIZE) * scale

    /**
     * `pos` → 盒子的左上角（相对 stage）。
     * 「起点」的盒子往上挂（下边中点落在选区上沿），「终点」的盒子往下挂（上边中点落在下沿）。
     *
     * 夹取**只保证圆点不出可视区** —— 盒子为了凑满 44px 触摸目标，允许伸到编辑器外面，
     * 那部分由 `.selection-handles` 的 `overflow: hidden` 裁掉。这样两头都占着：
     * 圆点始终完整可见可抓，而编辑器之外（页签栏 / 状态栏那一条）不会留下一块看不见的点击区。
     */
    function place(pos, which) {
      if (!pos) return null
      // 整行都滚出去了就没有意义；只露半行时仍留手柄（贴在边上）
      if (pos.top + pos.height <= 0 || pos.top >= viewH) return null
      const anchorX = pos.left + dx
      const anchorY = which === 'start' ? pos.top + dy : pos.top + pos.height + dy
      const left = clamp(anchorX - box / 2, (KNOB_SIZE / 2) * scale - box / 2, viewW + (KNOB_SIZE / 2) * scale - box / 2)
      const top =
        which === 'start'
          ? clamp(anchorY - box, inset - box, viewH - box)
          : clamp(anchorY, 0, viewH - inset)
      return { left: Math.round(left), top: Math.round(top) }
    }

    const next = {
      start: place(instance.getScrolledVisiblePosition(selection.getStartPosition()), 'start'),
      end: place(instance.getScrolledVisiblePosition(selection.getEndPosition()), 'end'),
    }
    handles.value = next.start || next.end ? next : null
  }

  // --------------------------------------------------------------- 拖动

  function onHandleDown(which, event) {
    const instance = editor.value
    const selection = instance?.getSelection()
    if (!instance || !selection || selection.isEmpty()) return
    event.preventDefault()
    event.stopPropagation()
    // 对面那一端全程钉住；自己这一端跟着手指走
    const fixed = which === 'start' ? selection.getEndPosition() : selection.getStartPosition()
    drag = {
      pointerId: event.pointerId,
      fixed: new monaco.Position(fixed.lineNumber, fixed.column),
      x: event.clientX,
      y: event.clientY,
    }
    // 先把两颗手柄对命中测试隐身，再收后续事件 —— 顺序反了第一帧就会撞上「落点在盒子里」
    dragging.value = true
    window.addEventListener('pointermove', onDragMove, { passive: false })
    window.addEventListener('pointerup', onDragEnd)
    window.addEventListener('pointercancel', onDragEnd)
  }

  function onDragMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return
    event.preventDefault()
    drag.x = event.clientX
    drag.y = event.clientY
    applyDrag()
    pumpEdgeScroll()
  }

  function applyDrag() {
    const instance = editor.value
    const hostEl = host.value
    if (!instance || !hostEl || !drag) return
    const rect = hostEl.getBoundingClientRect()
    const layout = instance.getLayoutInfo()
    // 夹进可视区，且横向避开门线与行号槽（`getTargetAtClientPoint` 只认编辑器的矩形，
    // 越界返回 null，落在行号上则 position 为 null，两种都得先夹住）
    const x = clamp(drag.x, rect.left + layout.contentLeft + CONTENT_PAD, rect.right - 1)
    const y = clamp(drag.y, rect.top + 1, rect.bottom - 1)
    const position = instance.getTargetAtClientPoint(x, y)?.position
    if (!position) return
    instance.setSelection(monaco.Range.fromPositions(drag.fixed, position))
  }

  function pumpEdgeScroll() {
    if (edgeFrame) return
    edgeFrame = window.requestAnimationFrame(stepEdgeScroll)
  }

  function stepEdgeScroll() {
    edgeFrame = 0
    const instance = editor.value
    const hostEl = host.value
    if (!drag || !instance || !hostEl) return
    const rect = hostEl.getBoundingClientRect()
    let dir = 0
    if (drag.y < rect.top + EDGE_ZONE) dir = -1
    else if (drag.y > rect.bottom - EDGE_ZONE) dir = 1
    if (dir === 0) return // 手指回到中间，循环就此停下（下一次 pointermove 会再拉起来）
    const max = instance.getScrollHeight() - instance.getLayoutInfo().height
    const current = instance.getScrollTop()
    const next = clamp(current + dir * EDGE_STEP * uiScale(), 0, Math.max(0, max))
    if (next === current) return // 已经到顶 / 到底
    instance.setScrollTop(next)
    applyDrag()
    edgeFrame = window.requestAnimationFrame(stepEdgeScroll)
  }

  function onDragEnd(event) {
    if (!drag || (event && event.pointerId !== drag.pointerId)) return
    drag = null
    dragging.value = false
    if (edgeFrame) {
      window.cancelAnimationFrame(edgeFrame)
      edgeFrame = 0
    }
    window.removeEventListener('pointermove', onDragMove)
    window.removeEventListener('pointerup', onDragEnd)
    window.removeEventListener('pointercancel', onDragEnd)
    schedule()
  }

  // --------------------------------------------------------------- 挂 / 摘

  /** 编辑区里落下一次指针就更新「是不是触摸」；值真的变了才写 ref，免得空转重算 */
  function onHostPointerDown(event) {
    const next = event.pointerType !== 'mouse'
    if (next !== touchActive.value) touchActive.value = next
  }

  watch([active, touchActive], () => update())

  watch(
    editor,
    (instance) => {
      disposables.forEach((dispose) => dispose.dispose())
      disposables = []
      if (instance) {
        disposables.push(instance.onDidChangeCursorSelection(schedule))
        disposables.push(instance.onDidScrollChange(schedule))
        disposables.push(instance.onDidLayoutChange(schedule))
        disposables.push(instance.onDidChangeModel(schedule))
      }
      update()
    },
    { immediate: true },
  )

  onMounted(() => {
    host.value?.addEventListener('pointerdown', onHostPointerDown, true)
  })

  onBeforeUnmount(() => {
    host.value?.removeEventListener('pointerdown', onHostPointerDown, true)
    onDragEnd(null)
    if (updateFrame) {
      window.cancelAnimationFrame(updateFrame)
      updateFrame = 0
    }
    disposables.forEach((dispose) => dispose.dispose())
    disposables = []
  })

  return { handles, dragging, onHandleDown }
}
