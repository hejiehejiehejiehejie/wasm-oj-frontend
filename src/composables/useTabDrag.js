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
 * 【折叠的分组怎么算】折叠组的成员页签仍然在 DOM 里，只是 display: none（见
 * services/tabGroups.js 的文件头：摘出序列会让这里的下标数学整体错位）。它们量不出矩形、
 * 不进让位序列，在虚拟序列里由所属组的**芯片**代表 —— 芯片就画在组的左缘，页签拖过
 * 芯片的中线就算越过了整段组；提交时（commitIndex）芯片再展开成它藏着的成员，
 * 换算回全表下标。反过来，`onTabPointerDown` 的「只剩一张就别拖」只数**可见**的页签：
 * 全被折叠藏起来时拖无可拖。
 *
 * 【实时让位（2026-10-20 十一改，替代「竖线指示条 + 松手才换位」，Chrome 原生手感）】
 * 拖拽期间 DOM 顺序一律不动，条带的每个可见单元（页签 + 分组芯片）按一份**虚拟序列**
 * 算目标槽位，差值用 translate3d 写到元素上：被拖的那张**无过渡**逐帧跟手（锁 X 轴、
 * 钳在条带内容范围内，z-index 抬到 100），其余的交给 CSS 过渡（200ms
 * cubic-bezier(0.2, 0, 0, 1)，写在 EditorTabs 的 is-dragging 规则里）滑到新槽位。
 * 换位判据是「被拖页签的中心越过相邻槽位的中线」，且中线永远按**换位后的目标位置**
 * 算 —— 用当前位置会在交换瞬间自我反馈、来回横跳。松手才把虚拟序列换算成全表下标
 * 提交（不动 stripOrder / openTabIds / viewOrder），提交那一刻调用方把 TransitionGroup
 * 切到 tab-instant（FLIP 不发），由 settle() 从**提交前记下的**各元素视觉位置用 150ms
 * ease-out 补间到新车位 —— 已经就位的差为 0 自动跳过，还在半路的平滑接上。
 * （残差为什么必须提交前记：见 finishDrag 里的注释。）
 *
 * 【拖入 / 拖出分组（2026-10-20 十三改，Chrome 原生手感）】被拖页签的**实时归属**记在
 * `drag.gid`（初始 = 真实归属），拖拽期间随几何阈值翻转，并经 `liveGroup` ref 喂给
 * EditorTabs 的包络线测量 —— DOM 上的真实归属（tabGroups.memberOf）**一概不动**，松手
 * 才随下标一起提交（onDrop 的第三参）。判定全部走扁平槽位模型（见下），组内拖 / 组外拖
 * 不是两套逻辑，只是「成员身份」会挡住两类普通换位、并给出一组额外的阈值判定。
 * **判据全部锚在被拖页签自己的边缘上，而不是中心**：页签比芯片宽得多，邻位停放时中心
 * 早就越过芯片的任何固定线，中心判据会在起拖瞬间误触发（且与拖动方向无关）——
 *   · 拖入（未分组 → 吸进组）：从左是**右缘压上组首成员左缘再深入 12px**（成为该组
 *     第 1 个成员，插到芯片右边；组被拖空时退化为右缘完全越过芯片）；从右是**左缘越过
 *     组末成员右缘往左 40% 页签宽**（并入组尾）。视图页签不参与分组；折叠组是一整段
 *     槽位，拖过它只换位、不吸入（Chrome 同款）。
 *   · 拖出（两阶段退出）：先脱离分组（物理顺序不动，包络线立刻收缩；左出例外 ——
 *     要排到芯片左侧），再与外部单元普通换位。右出 = 左缘越过「组剩余部分右缘」20px
 *     （脱离阈值，防误触）；左出 = 右缘收回到芯片中线以左（几乎完全拖出芯片才算）。
 *     唯一成员的组拖空后，芯片**拖拽期间保留**（反悔拖回去还能吸入），松手结算时才由
 *     tabGroups.removeEmptyGroups 摘除。
 *
 * 【本模块不碰 store】落盘由调用方的 `onDrop(id, insertIndex, liveGid)` 交给 tabStrip 的
 * moveStripItem —— 由它分部写回 openTabIds（含持久化）与 viewOrder；第三参是拖拽结束时
 * 被拖页签的实时归属，调用方据它结算成员关系（拖出组 = 退组、拖进组 = 入组、拖空的组
 * 就地摘除）。
 */
import { nextTick, onBeforeUnmount, shallowRef } from 'vue'

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
/** 拖出分组的脱离阈值（px）：组末成员的左缘越过「组剩余部分右缘」这么多才算真出组。
 *  太小会误触（在组边抖两下就退组），太大的话退组手感迟钝 —— 取需求给的 15~25px 中值。 */
const GROUP_EXIT_PX = 20
/** 从右拖入分组的吸入深度（占被拖页签宽度的比例）：左缘越过组末成员右缘往左这么多
 *  才吸入（需求给的 30%~50% 区间取中）。与 20px 的脱离阈值合起来，在组右缘留出一段
 *  「既不吸入也不退出」的防抖死区。 */
const GROUP_JOIN_FRAC = 0.4
/** 从左拖入分组的吸入深度（px）：右缘压上组首成员左缘再深入这么多才吸入。
 *  与芯片相关的全部判据都锚在**被拖页签自己的边缘**上（见 tryJoinGroup 的注释）——
 *  页签比芯片宽得多，邻位停放时中心早就越过芯片的任何固定线，中心判据会在起拖
 *  瞬间误触发（且与拖动方向无关）。 */
const GROUP_JOIN_OVERLAP = 12

/**
 * @param {object} options
 * @param {import('vue').Ref<HTMLElement|null>} options.rootEl `.editor-tabs` 根元素
 *   （指示条相对它定位，所以要拿它算 rect，而不能只看条带）
 * @param {(id: string, insertIndex: number) => void} options.onDrop 松手时的落盘回调
 */
export function useTabDrag({ rootEl, onDrop }) {
  /** 正在被拖的页签 id；null = 没在拖（页签上的拖拽态类看它） */
  const draggingId = shallowRef(null)

  /**
   * 被拖页签的**实时归属**（组 id 或 null），只在拖拽期间有值；null 同时表示
   * 「没在拖」与「实时无组」—— 区分靠 draggingId。EditorTabs 的包络线测量读它：
   * DOM 上的 data-group-id 还是旧值，包络线要按这份实时归属画（拖进哪组、线就
   * 包到哪；拖出组，线立刻收缩）。
   */
  const liveGroup = shallowRef(null)

  /** 实时让位的整轮拖拽状态（结构见 beginLiveReorder）；null = 没在拖 */
  let drag = null

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

  /** 真的占着位置的页签（折叠组的成员也在条带里，但 display: none 量不出矩形） */
  function isRendered(el) {
    return el.getClientRects().length > 0
  }

  /**
   * 条带内容坐标系：条带是横向滚动容器，元素的 offsetLeft / 拖拽位移都活在「内容坐标」里，
   * 指针的 clientX 与元素的 getBoundingClientRect 都活在「视口坐标」里 —— 下面这个原点
   * 把两边接起来（含 scrollLeft，自动滚动改 scrollLeft 后同一套换算仍然成立）。
   */
  function stripOriginX(strip) {
    return strip.getBoundingClientRect().left - strip.scrollLeft
  }

  /**
   * 起手时盘点条带：抓出所有**可见**的让位单元（页签 + 分组芯片 —— 芯片也要跟着滑，
   * 否则页签滑过组边界时芯片留在原地、组包络线断开），量下它们的自然位置 / 宽度 /
   * 左右外边距；display:none 的折叠成员按组归档（提交换算下标时由芯片展开）。
   * DOM 顺序 == tabStrip.stripOrder 的当前顺序（芯片插在组首前，也在这个顺序里）。
   */
  function collectUnits(strip) {
    const hiddenByGroup = new Map()
    const units = []
    for (const el of strip.querySelectorAll('.editor-tabs__chip, .editor-tabs__item[data-strip-id]')) {
      const gid = el.dataset.groupId || null
      if (!isRendered(el)) {
        // 折叠藏起来的组员：记到组名下，虚拟序列里由芯片代表它们
        if (gid && el.dataset.stripId) {
          if (!hiddenByGroup.has(gid)) hiddenByGroup.set(gid, [])
          hiddenByGroup.get(gid).push(el.dataset.stripId)
        }
        continue
      }
      const cs = getComputedStyle(el)
      units.push({
        el,
        id: el.dataset.stripId || null,
        gid,
        kind: el.classList.contains('editor-tabs__chip') ? 'chip' : 'item',
        // 芯片是否折叠态（折叠组是整段槽位：不吸入、拖过只换位）；
        // 页签是否合成视图（视图不参与分组，拖入判定直接跳过）
        collapsed: el.classList.contains('editor-tabs__chip--collapsed'),
        view: !!el.dataset.viewId,
        left: el.offsetLeft,
        width: el.offsetWidth,
        ml: Number.parseFloat(cs.marginLeft) || 0,
        mr: Number.parseFloat(cs.marginRight) || 0,
        tx: 0,
      })
    }
    return { units, hiddenByGroup }
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
    // 看得见的只剩一张时无处可放，不起手（既省掉一次无意义的拖拽，也不会有「拖动一个不动的页签」的怪感）。
    // 只数可见的：折叠组藏起来的那几张不能算「有地方可放」。
    if (tabEls().filter(isRendered).length < 2) return

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
      updateDrag(event.clientX, event.clientY)
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
      // 松手与 click 是两次事件，不挡一下会顺带触发页签的 activate（切过去）
      finishDrag(true)
      markClickSuppressed()
      return
    }

    cancelPress()
    // 触屏长按后原地松手：多半是想拖但没动，不当作点击（吃掉紧随其后的 activate）
    if (state.armed) markClickSuppressed()
  }

  function onPointerCancel(event) {
    if (!press || event.pointerId !== press.pointerId) return
    // 拖拽中被系统打断（来电、第二根手指…）：不提交，原地回弹
    if (press.dragging) {
      finishDrag(false)
      return
    }
    cancelPress()
  }

  function onKeyDown(event) {
    if (event.key !== 'Escape') return
    // 拖动中按 Esc：取消回弹，并且别让 Esc 再触发别的东西
    event.preventDefault()
    event.stopPropagation()
    if (press?.dragging) finishDrag(false)
    else cancelPress()
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
    // 真的拖起来了：按压 / 就绪那一套退场，改由 draggingId 表达（浮起跟手 + 让位滑动）。
    // 留着的话，被拖的那一张会同时挂着就绪底色与拖拽态，叠起来很脏。
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

    // 起手盘点让位序列（量几何 + 算抓取锚点），失败（条带没了 / 单元找不到）就当没拖起来
    if (!beginLiveReorder()) {
      cancelPress()
    }
  }

  // ------------------------------------------------------------ 实时让位

  /**
   * 起手盘点：抓几何、建虚拟序列（初始 = DOM 顺序）、算抓取锚点，然后立刻按当前指针
   * 位置摆一次。返回 false = 盘不出来（条带没了 / 找不到被拖单元），调用方当没拖起来。
   */
  function beginLiveReorder() {
    const strip = stripEl()
    if (!strip) return false
    const { units, hiddenByGroup } = collectUnits(strip)
    const dragged = units.find((u) => u.id === press.id)
    if (!dragged || units.length < 2) return false
    drag = {
      id: press.id,
      unit: dragged,
      units,
      hiddenByGroup,
      // 被拖页签的实时归属：初始 = 真实归属，拖拽中随出入组判定翻转（见文件头）
      gid: dragged.gid ?? null,
      // 虚拟序列：拖拽期间的「逻辑顺序」。初始与 DOM 一致；换位只改它，DOM 不动
      order: units.slice(),
      // 虚拟序列里每个单元的目标左缘（内容坐标），layoutTargets 现算
      pos: new Map(),
      // 布局起点：DOM 首元左缘减它自己的左外边距（= 内容盒起点）。所有槽位以此为基准
      start: units[0].left - units[0].ml,
      // 抓取锚点：指针相对被拖页签左缘的偏移。全程按「指针 - 锚点」定位页签，
      // 起手那一帧不会跳
      grabDX: 0,
      // 被拖页签当前的视觉左缘（内容坐标）
      visual: 0,
    }
    liveGroup.value = drag.gid
    drag.grabDX = press.lastX - stripOriginX(strip) - dragged.left
    layoutTargets()
    updateDrag(press.lastX, press.lastY)
    return true
  }

  /** 按虚拟序列摆一遍槽位：单元的边距盒首尾相接（自然布局的间距模型，见 collectUnits） */
  function layoutTargets() {
    let cursor = drag.start
    for (const u of drag.order) {
      drag.pos.set(u, cursor + u.ml)
      cursor = drag.pos.get(u) + u.width + u.mr
    }
  }

  /** 这个芯片代表的组此刻能不能被拖入：折叠组是整段槽位（拖过只换位、不吸入 ——
   *  Chrome 同款：往折叠组里塞页签等于当场消失），视图页签不参与分组 */
  function joinableChip(u) {
    return !!u && u.kind === 'chip' && !u.collapsed && !drag.unit.view
  }

  /**
   * 拖出判定（两阶段退出的第一阶段，见文件头）：先把实时归属摘成 null —— 物理顺序
   * （虚拟序列位置）不动（左出例外：要排到芯片左侧），包络线立刻收缩；之后与外部
   * 单元的换位走下面的普通中线碰撞（第二阶段）。返回 true 表示翻了一次归属。
   */
  function tryExitGroup(slot, prev, next) {
    const chip = drag.order.find((u) => u.kind === 'chip' && u.gid === drag.gid)
    if (!chip) return false
    // 左出（prev 是自家芯片 = 被拖页签是组内第一名成员）：右缘收回到芯片中线以左，
    // 页签几乎完全拖出芯片才算真出组。判据用**右缘**不用中心 —— 邻位停放时中心本来
    // 就在芯片中线右边（页签比芯片宽得多），中心判据会在起拖瞬间误退组。
    if (prev === chip && drag.visual + drag.unit.width < drag.pos.get(chip) + chip.width / 2) {
      drag.order.splice(slot, 1)
      drag.order.splice(drag.order.indexOf(chip), 0, drag.unit)
      drag.gid = null
      return true
    }
    // 右出：右邻还是同组成员时谈不上右出（那是组内换位）。判据是**左缘**越过「组剩余
    // 部分的右缘」（除它之外的最后一名成员的右缘；它是唯一成员时就是芯片右缘）20px
    // —— 与「从右拖入」的 40% 深度判据之间留出死区，在组右缘来回拖不会反复翻转。
    if (next && next.gid === drag.gid) return false
    const members = drag.order.filter((u) => u !== drag.unit && u.kind === 'item' && u.gid === drag.gid)
    const last = members[members.length - 1]
    const boundary = last ? drag.pos.get(last) + last.width : drag.pos.get(chip) + chip.width
    if (drag.visual > boundary + GROUP_EXIT_PX) {
      drag.gid = null
      return true
    }
    return false
  }

  /**
   * 拖入判定（未分组页签 → 吸进组，见文件头）。判据全部锚在**被拖页签自己的边缘**上
   * 而不是中心：页签比芯片宽得多，邻位停放时中心早就越过芯片的任何固定线，中心判据
   * 会在起拖瞬间误吸入（且与拖动方向无关）。返回 true 表示翻了一次归属。
   */
  function tryJoinGroup(slot, prev, next) {
    // 从左吸入：右缘压上「组首成员左缘」再深入 12px → 成为该组第 1 个成员（插到芯片
    // 右边）。邻位停放时右缘恰好贴着组首左缘，必须再向右压 12px 才吸入 —— 方向安全、
    // 宽度无关。组被拖空（芯片暂留）时没有「组首成员」，退而求其次：右缘完全越过芯片。
    if (next && joinableChip(next)) {
      const after = drag.order[drag.order.indexOf(next) + 1]
      const firstMember = after && after.kind === 'item' && after.gid === next.gid ? after : null
      const at = firstMember
        ? drag.pos.get(firstMember) + GROUP_JOIN_OVERLAP
        : drag.pos.get(next) + next.width
      if (drag.visual + drag.unit.width > at) {
        drag.order.splice(slot, 1)
        drag.order.splice(drag.order.indexOf(next) + 1, 0, drag.unit)
        drag.gid = next.gid
        return true
      }
    }
    // 从右吸入：左缘越过「组末成员右缘往左 40% 页签宽」。prev 必须是它所在组的
    // **最后一名成员**（身后不再有同组单元 —— 被拖页签自己不算）才构成组的右边界；
    // 唯一的例外是「成员被拖空的组」（芯片拖拽期间暂留）：芯片此刻就是组的全部。
    let gid = null
    let boundary = 0
    if (prev?.kind === 'item' && prev.gid) {
      const pAt = drag.order.indexOf(prev)
      if (!drag.order.some((u, i) => i > pAt && u !== drag.unit && u.gid === prev.gid)) {
        gid = prev.gid
        boundary = drag.pos.get(prev) + prev.width
      }
    } else if (prev?.kind === 'chip' && !prev.collapsed) {
      gid = prev.gid
      boundary = drag.pos.get(prev) + prev.width
    }
    if (gid && drag.visual < boundary - drag.unit.width * GROUP_JOIN_FRAC) {
      drag.gid = gid
      return true
    }
    return false
  }

  /** 拖拽中的每次移动：被拖页签跟手 + 出入组判定 + 中线碰撞换位 + 必要时自动滚动 */
  function updateDrag(clientX, clientY) {
    const strip = stripEl()
    if (!strip || !drag) return
    const px = clientX - stripOriginX(strip)

    // 被拖页签实时跟手：锁 X 轴、横向钳在**可视条带**内（内容坐标 = scrollLeft ~
    // scrollLeft + clientWidth）。这就是条带级的移动边界钳制：左界 = 容器左内边（滚动了
    // 就是 scrollLeft），右界 = 容器右内边 − 页签宽 —— 不会拖出条带两端。本项目条带里
    // 没有固定页签区、也没有「+」按钮，两端即全部可拖区；将来若加了，这两界各往内收
    // 一段即可。不能钳在内容总宽里 —— 那样最后一个槽位的中线恰好等于内容右缘，中心
    // 永远只差 1px 越不过去（宽度不等时向左拖同理卡死）；Chrome 的做法就是允许拖进
    // 条带右侧的空白区，溢出时靠边缘自动滚动扩行程。
    // 元素自身的 transition 已被 --dragging 关掉，这里写多少走多少，跟手无延迟。
    const span = drag.unit.ml + drag.unit.width + drag.unit.mr
    const minLeft = strip.scrollLeft
    const maxLeft = strip.scrollLeft + strip.clientWidth - span
    drag.visual = Math.max(minLeft, Math.min(maxLeft, px - drag.grabDX))
    drag.unit.tx = drag.visual - drag.unit.left
    drag.unit.el.style.transform = `translate3d(${drag.unit.tx}px, 0, 0)`

    // 碰撞循环：可能一帧跨过好几格，循环换到位为止。每轮先重摆槽位，再依次过
    // 「拖出 → 拖入 → 普通换位」三道判定 —— 出入组的阈值与中线的先后关系见各分支注释。
    for (;;) {
      layoutTargets()
      const slot = drag.order.indexOf(drag.unit)
      const prev = drag.order[slot - 1] ?? null
      const next = drag.order[slot + 1] ?? null
      const center = drag.visual + drag.unit.width / 2

      // 出入组：成员身份走拖出判定，无身份走拖入判定（视图页签两侧都跳过）
      if (drag.gid ? tryExitGroup(slot, prev, next) : !drag.unit.view && tryJoinGroup(slot, prev, next)) {
        continue
      }

      // 普通换位：中心越过相邻**槽位**的中线就交换虚拟顺序（页签 ↔ 页签）。中线按换位
      // 后的目标位置算（layoutTargets 现摆的），不是按元素当前位置 —— 否则交换瞬间位置
      // 一变、条件立刻反过来，会来回横跳。两类例外：
      //   · 成员身份挡住与外部单元的换位（要先过脱离阈值退组）和与自家芯片的换位
      //     （左出判据管）—— 组内成员之间照常换位（组内排序）；
      //   · 与芯片换位不能用中心判据：芯片只有十几像素宽，邻位停放时页签中心本来就
      //     越过芯片中线，起拖瞬间就会被「交换」到芯片另一侧（宽度无关的起拖瞬移，
      //     旧实现的真实 bug）。向右改用**右缘压过芯片中线**；向左是中心越过芯片中线
      //     （那本就要拖过半枚页签才触发，天然安全）。
      //   · 可吸入的芯片不做「换位」—— 吸入（tryJoinGroup）取代它；没到吸入深度就
      //     谁也不动，页签单纯跟手。
      const nextIsJoinableChip = !!next && next.kind === 'chip' && !drag.gid && joinableChip(next)
      if (
        next &&
        !nextIsJoinableChip &&
        (!drag.gid || next.gid === drag.gid) &&
        (next.kind === 'chip'
          ? drag.visual + drag.unit.width > drag.pos.get(next) + next.width / 2
          : center > drag.pos.get(next) + next.width / 2)
      ) {
        drag.order.splice(slot, 1)
        drag.order.splice(slot + 1, 0, drag.unit)
        continue
      }
      if (
        prev &&
        (!drag.gid || (prev.kind !== 'chip' && prev.gid === drag.gid)) &&
        center < drag.pos.get(prev) + prev.width / 2
      ) {
        drag.order.splice(slot, 1)
        drag.order.splice(slot - 1, 0, drag.unit)
        continue
      }
      break
    }
    // 归属翻过的话同步给包络线（EditorTabs 的测量读这份 ref）
    if (liveGroup.value !== drag.gid) liveGroup.value = drag.gid
    applyOthers()
    updateAutoScroll(clientX, clientY)
  }

  /** 让位：其余单元滑向自己在虚拟序列里的槽位（过渡由 EditorTabs 的 is-dragging 规则给） */
  function applyOthers() {
    for (const u of drag.units) {
      if (u === drag.unit) continue
      const tx = drag.pos.get(u) - u.left
      if (u.tx === tx) continue
      u.tx = tx
      u.el.style.transform = `translate3d(${tx}px, 0, 0)`
    }
  }

  /**
   * 把虚拟序列换算成 moveStripItem 的落点下标（全表下标，含折叠藏起来的成员）：
   * 数一遍「排在被拖页签前面的条目」，芯片处展开成它藏着的成员 —— 折叠组在视觉上就是
   * 一枚芯片，提交后成员回到芯片右邻的槽位上，两边对得整整齐齐。
   */
  function commitIndex(d) {
    let index = 0
    for (const u of d.order) {
      if (u === d.unit) break
      if (u.kind === 'chip') index += d.hiddenByGroup.get(u.gid)?.length ?? 0
      else index += 1
    }
    return index
  }

  /**
   * 收尾：松手（commit=true）提交排序；取消 / Esc / pointercancel（commit=false）不提交。
   * 两种出口的视觉收尾相同 —— settle() 从各元素的**当前视觉位置**补间到（提交后的）
   * 自然车位。
   */
  function finishDrag(commit) {
    const d = drag
    const index = commit && d ? commitIndex(d) : null
    // 实时归属随下标一起交出去：拖出组 = null、拖进组 = 组 id、没翻过 = 原值。
    // 取消（commit=false）不给第三参 —— 调用方不做任何成员结算。
    const gid = commit && d ? d.gid : undefined
    // 元素清单先抓下来（cancelPress 会把 drag 置空）
    const els = d ? d.units.map((u) => u.el) : []
    // 视觉位置必须在**提交之前**记（内容坐标）：提交重排后 offsetLeft 变成新车位，
    // 再量 rect - offsetLeft 得到的只是「旧内联位移」—— 那会让页签先跳「新车位 + 旧位移」
    // 再滑回来，肉眼就是松手那一下先蹦一下（2026-10-20 用户报「松手动画不自然」）。
    // 正确的残差 = 提交前看到的视觉位置 - 提交后的自然车位，两边都得现量。
    const strip = stripEl()
    const visuals = new Map()
    if (d && strip) {
      const originX = stripOriginX(strip)
      for (const el of els) visuals.set(el, el.getBoundingClientRect().left - originX)
    }
    cancelPress()
    if (index !== null) onDrop?.(d.id, index, gid)
    if (d) nextTick(() => settle(els, visuals))
  }

  /**
   * 提交后的回弹归位：条带的 DOM 顺序刚被重排，每个元素的自然车位变了。从**提交前**
   * 记下的视觉位置（finishDrag 里的 visuals，含拖拽 / 让位残留）算出与新车位的差，
   * 一段 150ms ease-out 的 WAAPI 补间归零 —— 已就位的差为 0 自动跳过，还在半路的平滑
   * 接上。提交那一拍调用方把 TransitionGroup 切到 tab-instant（FLIP 不发），不会跟这段
   * 补间打架。内联 transform 在读数之前清掉。
   */
  function settle(els, visuals) {
    const strip = stripEl()
    if (!strip || !visuals) return
    const originX = stripOriginX(strip)
    for (const el of els) {
      const from = visuals.get(el)
      el.style.transform = ''
      if (from == null) continue
      const residual = from - (el.getBoundingClientRect().left - originX)
      if (Math.abs(residual) < 0.5) continue
      el.animate(
        [
          { transform: `translate3d(${residual}px, 0, 0)` },
          { transform: 'translate3d(0, 0, 0)' },
        ],
        { duration: 150, easing: 'ease-out' },
      )
    }
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

    // 滚动把页签挪了位置，跟手与让位要按同一个指针位置重算
    updateDrag(press.lastX, press.lastY)
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
    // 触屏那两个提示态统一在这里收：松手、Esc、pointercancel、组件卸载都汇到这条路上，
    // 漏掉任何一个出口，页签上「弹过了 / 正按着」的样子就会一直挂在那儿
    pressingId.value = null
    armedId.value = null
    draggingId.value = null
    // 实时归属一并收（没提交的翻转就地丢弃 —— 取消 / Esc 不该留任何副作用）
    liveGroup.value = null
    // 让位状态一并收（内联 transform 不在这里清 —— finishDrag 的 settle 还要拿它算残差）
    drag = null
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
    /** 被拖页签的实时归属（组 id | null）；只在拖拽期间有值 —— 包络线测量读它 */
    liveGroup,
    /** 触屏按压中的页签 id（「按住进度」底色用） */
    pressingId,
    /** 长按已成、尚未松手的页签 id（「弹一下」动画用） */
    armedId,
    onTabPointerDown,
    consumeClickSuppression,
  }
}
