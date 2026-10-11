/**
 * useTabDrag —— 编辑器页签的拖动排序（鼠标与触屏共用一套 Pointer Events）。
 *
 * 【一条混排的序列，两类页签都能拖】条带上有两类页签：真实文件页签（`workspace.openTabIds`）
 * 与合成视图页签（设置 / 抽题，`editorViews.viewOrder`）。它们**混排在同一条序列里**，
 * 拖动可以跨类换位 —— 文件能插到设置左边，设置也能排到某个 .cpp 前面。
 * 这条统一顺序不在那两份状态里（它们各自装不了对方），而是第三份 UI 状态 `tabStrip.stripOrder`
 * —— 它只管顺序、由自己维持，页签元素统一用 `data-strip-id` 认（两类都带这个属性）。
 * 落点下标因此在整个条带里数：`[0, ...stripOrder]`。
 * 为什么可以放心这么做：视图 id **永远不进 openTabIds**（见 services/tabStrip.js 与
 * services/editorViews.js 的文件头），同步与写回都在 tabStrip 那一层收口。
 *
 * 【为什么不用 HTML5 拖放】同 useTreeDrag：`dragstart` / `drop` 在触屏上根本不触发，
 * 幽灵元素的外观与自动滚动也不可控。这里从 `pointerdown` 起手自己实现。
 *
 * 【两类设备的起手判据】
 *   - 鼠标 / 笔：不需要长按，横向位移超过 5px 即算拖。
 *   - 触屏：条带本身是**横向滚动容器**，直接拖会与滚动打架，所以按住约 450ms 先进入
 *     armed（可拖）态，之后继续移动才真的开始拖；armed 之后用**非被动** `touchmove`
 *     + `preventDefault()` 把滚动按住（`touch-action` 在手势开始时就读定了、中途改它无效，
 *     这条结论与 useTreeDrag / App.vue 分隔条出自同一次踩坑）。
 *
 * 【触屏要补的三件事，缺一件都只在真机上现形】`dispatchTouchEvent` 那类合成事件**不跑浏览器
 * 的手势识别器**，所以下面三条在无头探针里永远测不出来（2026-10-10 用户报「拖动页签没对触摸屏
 * 做适配」就是这三条）—— 它们只有两处能看到痕迹：**真机**，以及「直接派发一个 cancelable 的
 * 合成事件、看 defaultPrevented」。
 *   ① `touch-action: pan-x`（写在 EditorTabs.vue 的 `.editor-tabs__item` 上）：
 *      `auto` 允许双指缩放 / 双击缩放，手势里插进第二根手指就会立刻收到 pointercancel，
 *      正在拖的那一帧被打断。与文件树行 `.tree-item__row` 的 `pan-y` 同源、方向相反。
 *   ② `user-select: none` + `-webkit-touch-callout: none`（同上）：长按 450ms 起手时不许
 *      选中标签文字 —— iOS 一旦开始选词就会连带弹出 callout（放大镜 + 菜单），拖拽当场变成选词。
 *   ③ 系统长按菜单（`contextmenu`）**从按下那一刻就接管**（见 onTabPointerDown）：各家系统
 *      的阈值大多在 500ms 上下，与我们这 450ms 贴得很近，等 armed 再拦已经晚了一步 ——
 *      菜单会在拖拽中途弹出来，还要等下一次点击才关掉。页签本来没有右键菜单，拦掉不损失功能。
 *      这三条与 useTreeDrag 的对应处完全同源，改一处记得看另一处。
 *
 * 【③ 为什么挂在按下、而不是 armed】非被动 `touchmove` 也一并提前挂（拦截本身仍只在
 * armed / dragging 时 preventDefault，所以「短滑滚页签条」不受影响）。理由是浏览器在
 * **touchstart 那一刻**就决定了「这次手势要不要等 JS 说话」，中途补挂的监听器不保证还拦得住
 * 第一帧滚动。代价：按压期间每次 touchmove 都要等一次 JS（滚动会晚一帧），换来的是「浏览器
 * 不可能已经先把手势判成滚动」。
 *
 * 【拖拽期间不动顺序状态】只在松手那一刻提交排序（不动 stripOrder / openTabIds / viewOrder），
 * 收尾补间交给 TransitionGroup 的 `.tab-move`。中途改数组会让「被拖的那个」也被 FLIP 补间
 * 一次，与拖拽视觉打架。
 *
 * 【本模块不碰 store】落盘由调用方的 `onDrop(id, insertIndex)` 交给 tabStrip 的 moveStripItem
 * —— 由它分部写回 openTabIds（含持久化）与 viewOrder。
 */
import { onBeforeUnmount, ref, shallowRef } from 'vue'

/** 触屏长按多久算「我要拖了」。与 useTreeDrag 同值，手感一致
 *  ⚠️ 这个数牵着一处样式：`EditorTabs.vue` 里按压进度那条 `transition: background-color 450ms linear`
 *  ——底色要在到点那一刻刚好走完，改一边就得改另一边（见那两个类上的注释）。 */
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

  /**
   * 触屏按压中的页签 id —— 页签上的「按住进度」底色靠它（见 EditorTabs 的 --pressing）。
   * 只对触屏置位：鼠标按下就该立刻拖，中间那段「等待」不存在，给进度反而像卡了。
   * 与 useTreeDrag 的 pressingId 同款 —— 触屏借不到 hover，这 450ms 不给反馈就是「按了没反应」。
   */
  const pressingId = shallowRef(null)
  /**
   * 长按已成、但还没松手也没开始拖的页签 id —— 页签上的「弹一下」靠它（见 --armed）。
   * 与 pressingId 的分工：pressing 是「还在等」，armed 是「已经就绪，现在拖动即可换位」。
   */
  const armedId = shallowRef(null)

  /** 当前这一轮按压的全部临时状态；null = 没有按压在途 */
  let press = null
  let scrollFrame = 0
  let scrollDelta = 0
  let suppressClick = false
  let suppressClickTimer = 0

  const stripEl = () => rootEl.value?.querySelector('.editor-tabs__strip') ?? null

  /** 参与排序的页签元素（按 DOM 顺序，即 tabStrip.stripOrder 的当前顺序） */
  function tabEls() {
    const strip = stripEl()
    return strip ? [...strip.querySelectorAll('.editor-tabs__item[data-strip-id]')] : []
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
    // 整条条带只剩一张时无处可放，不起手（既省掉一次无意义的拖拽，也不会有「拖动一个不动的页签」的怪感）
    if (tabEls().length < 2) return

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
    if (press.pointerType !== 'mouse') {
      // 按压进度：页签底色从当前底色线性走到 --bg-hover（450ms 那条过渡写在 EditorTabs 的
      // --pressing 上，与这张表同步）；到点由 arm() 换成「就绪态」。
      pressingId.value = id
      press.timer = window.setTimeout(arm, LONG_PRESS_MS)
      // 触屏专用的两条都挂在**按下这一刻**，不能等 armed 再挂（理由见文件头「触屏要补的三件事」）：
      //   · touchmove 非被动 —— 浏览器在 touchstart 时就决定了「这次手势要不要等 JS 说话」，
      //     中途补挂的监听器不保证还拦得住第一帧滚动；
      //   · contextmenu —— 系统长按菜单的阈值与我们的 450ms 太近，等 armed 再拦晚一步。
      // 按下就挂**不影响「短滑滚页签条」**：onTouchMoveBlock 只在 armed / dragging 时才
      // preventDefault，那 450ms 里手指滑动照旧是原生横滚。
      window.addEventListener('touchmove', onTouchMoveBlock, { passive: false, capture: true })
      window.addEventListener('contextmenu', onContextMenuBlock, true)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
  }

  /** 触屏按住不动到点了：进入可拖态（这一下只翻标志位 —— 拦滚动的那条 touchmove 按下时已挂好） */
  function arm() {
    if (!press || press.dragging) return
    press.timer = 0
    press.armed = true
    // 到点了：页签换成「就绪态」——弹一下，底色停在 --bg-hover 上（不是页签自己的 --bg-tab-hover：
    // 那一档太淡，实拍量过只比栏底差 6 阶，当进度条等于没有；理由写在 EditorTabs 那段注释里），直到松手或开始拖。
    // 这一刻是整条手势里唯一「告诉用户长按成功了」的信号，别把它省掉。
    // pressing 必须同时退场：两态互斥（等 → 已就绪），而且 --pressing 自带那条 450ms linear
    // 的过渡会跟着留下，松手时整块底色要用 450ms 才淡回去、比别的页签慢一拍。
    pressingId.value = null
    armedId.value = press.id
  }

  /**
   * 不让浏览器把这次手势当滚动。
   * **armed 之前必须什么都不做**：那 450ms 里手指横向滑动就是「滚页签条」，
   * 一拦（条带是横向滚动容器，页签不溢出时也滚不动）就再也滚不动了。
   */
  function onTouchMoveBlock(event) {
    if (press && (press.armed || press.dragging) && event.cancelable) event.preventDefault()
  }

  /** 按住期间不让系统长按菜单插进来（页签没有自己的右键菜单，拦掉不损失功能） */
  function onContextMenuBlock(event) {
    if (press) event.preventDefault()
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
    // 真的拖起来了：按压 / 就绪那一套退场，改由 draggingId 表达（底色压暗 + 插入指示条）。
    // 留着的话，被拖的那一张会同时挂着就绪底色与「变淡」，叠起来很脏。
    pressingId.value = null
    armedId.value = null

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

    // 触屏的 touchmove 拦截在 pointerdown 那一刻就挂好了，这里再挂一次是给**退化的那条路**
    // 兜底：浏览器不给 pointerType 时上面按 'mouse' 处理（那时不会挂 touchmove），
    // 而它仍然可能发真触摸事件。同一函数 + 同一 capture 重复挂是幂等的，没有副作用。
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
   * 落点命中：拿指针的 clientX 与「其余页签」的中线比（文件与视图一视同仁 —— 这是一条混排
   * 的序列，跨类换位本来就该成立）。
   *
   * 用 rect 而不是 offsetLeft 是因为条带可能正在横向滚动 —— rect 天然含滚动偏移，
   * 省得再补一个 scrollLeft（也就不会与自动滚动那次重算脱节）。
   * 插到最右时取**全部**页签的右缘（含被拖那一个）：被拖项还占着自己那一格，
   * 若只看「其余」的右缘，把最后一个页签往右拖时指示条会画到它自己的左缘上去。
   */
  function resolveDrop(clientX) {
    const root = rootEl.value
    const strip = stripEl()
    if (!root || !strip) return

    const all = tabEls()
    const rest = all.filter((el) => el.dataset.stripId !== draggingId.value)

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
    window.removeEventListener('contextmenu', onContextMenuBlock, true)
    window.removeEventListener('keydown', onKeyDown, true)
    stopAutoScroll()
    press = null
    dropIndex = null
    // 触屏那两个提示态统一在这里收：松手、Esc、pointercancel、组件卸载都汇到这条路上，
    // 漏掉任何一个出口，页签上「弹过了 / 正按着」的样子就会一直挂在那儿
    pressingId.value = null
    armedId.value = null
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
    /** 触屏按压中的页签 id（「按住进度」底色用） */
    pressingId,
    /** 长按已成、尚未松手的页签 id（「弹一下」动画用） */
    armedId,
    onTabPointerDown,
    consumeClickSuppression,
  }
}
