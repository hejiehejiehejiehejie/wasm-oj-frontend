/**
 * useSwipeTrack —— 触屏左右滑动，切换一整排「页」（单层轨道）。
 *
 * 手感照 `EditorSettingsPanel.vue` 的「触屏横滑换分类」（2026-11-07 加，2026-11-09 重构成
 * 单层轨道）：跟手阻尼、瞬时速度判甩、落位时长 = 剩余路程 ÷ 手速、过渡中按下即接管、
 * 划过一手吞掉抬手那发合成 click。两处是同一套口径 —— 改阈值时两边都要想一遍。
 * （暂时各留一份实现：设置页那份经真机验证、600 行，抽成共用件的风险大于收益；等这边也
 * 在真机上稳了再谈合并。）
 *
 * 【为什么这里用 touch 事件，而不是设置页那套 pointer + `touch-action: pan-y`】
 * 设置页敢在取景框上声明 `pan-y`，是因为它正文里没有横向滚动区。CF 不同：榜单
 * `.cf-standings__scroll` 是两轴滚动（`overflow: auto` + `max-height`），而 `touch-action`
 * 沿祖先链**取交集** —— 祖先声明 `pan-y`，子元素的横向拖动就彻底失效，手机上榜单只能看
 * 左半边。所以这里换成：`touchstart` 记坐标 → 判出横向才 `preventDefault`（这一刻才真正
 * 接管，纵向仍旧让给浏览器滚）。`touchmove` 必须是非被动的（`{ passive: false }`），与
 * `useTabDrag.js` 里那条结论同源。
 *
 * 【起手落在横向可滚区 / 输入框里就不接管】
 * 判据是「横向拖动在这儿本来就有别的含义」：横滚容器是滚它自己、文本框里是选字、页签行是
 * 翻页签。横滚容器不写死选择器，而是在 `touchstart` 时沿祖先链看一眼
 * `scrollWidth > clientWidth` —— 以后再加一张宽表也不必回来补名单。
 *
 * 【为什么没有「撑高 + 收滚动」那半套】
 * 设置页整页共用一个滚动容器，翻页时旧页退出会夹一次 `scrollTop`，所以它要撑住旧高度再把
 * 滚动收到顶。这里每页的 `.cf-view` 自己就是滚动容器，三页各自保留滚动位置 —— 那一套在
 * 这里纯属多余。
 *
 * 【位移模型】
 * 调用方把页排成一条 `display: flex` 的轨道，每页 `flex: 0 0 100%`。第 `i` 页的基准位置是
 * `-i × 一页宽`（**绝对下标，切页时不变**），轨道自身的位移 = 基准 + 跟手偏移。整趟手势
 * 只写轨道这一层的**内联** `transform`，一个响应式值都不碰 —— `touchmove` 在 120Hz 的机器上
 * 一秒一百多次，写 ref 等于每帧把整页重渲一遍。时长也走内联：写 ref 要等 Vue 的微任务，
 * 而位移已经同步落下去了，那一帧用的还是上一条时长（快甩按长时长走，正好慢半拍）。
 */

import { onBeforeUnmount, onMounted } from 'vue'

/** 起手多少像素之后才判方向 */
const SWIPE_SLOP = 12
/** 横向得比纵向大这么多才认；斜着划一律让给滚动 */
const SWIPE_AXIS = 1.2
/** 不看速度时要划掉一页宽度的这么多 */
const SWIPE_RATIO = 0.18
/** 但位移本身至少这么远（甩一下也算数，见 SWIPE_FLING） */
const SWIPE_MIN = 28
/** px/ms：抬手时的瞬时速度到这个数就算甩（不是整手的平均速度） */
const SWIPE_FLING = 0.5
/** 跟手最多挪一页宽度的这么多，再往外只剩橡皮筋 */
const SWIPE_LIMIT = 0.65
/** 落位兜底：过渡结束由 transitionend 说了算，这个只用防它不来 */
const SWIPE_SETTLE_MS = 600
/** 落位那趟的时长按「剩下的路 ÷ 手速」算，两个端点 */
const SWIPE_DUR_MAX = 320
const SWIPE_DUR_MIN = 160
/**
 * 松手后那趟的曲线 —— **开头必须是满速**。
 * 抬手那一刻内容已经有初速度，用 `ease` / `ease-in-out` 会在开头重新「加速」，
 * 观感就是手指离开后先顿一下再窜出去（设置页 2026-11-08 定下的那条）。
 */
const SWIPE_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'
/** 非手势切换（点页签 / 赛程点一行 / 前进后退）的横移时长 */
const FOLLOW_MS = 220
/** 抬手之后那发合成 click 的有效期 */
const SWALLOW_MS = 350

/**
 * 默认不接管的地方：输入框与文本域里横拉是选字。
 * **故意不排除 `<select>` 与勾选框** —— 设置页踩过这个坑：排除多了手势会「时灵时不灵」，
 * 而这些控件横拉本来就拖不出任何事。
 */
const DEFAULT_IGNORE = [
  'textarea',
  'input',
  '[contenteditable=""]',
  '[contenteditable="true"]',
]

const REDUCED_MOTION =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null

function reducedMotion() {
  return !!REDUCED_MOTION?.matches
}

/**
 * @param {object} options
 * @param {import('vue').Ref<HTMLElement|null>} options.viewport 取景框（宽度基准 + 事件源）
 * @param {import('vue').Ref<HTMLElement|null>} options.track 轨道（`display: flex` 的那一层）
 * @param {() => number} options.index 当前页下标
 * @param {() => number} options.count 页数
 * @param {(next: number) => void} options.onSwipe 抬手判出翻页时调用（由调用方改状态）
 * @param {() => boolean} [options.enabled] 整块不可见时返回 false（手势直接不启动）
 * @param {string[]} [options.ignore] 额外忽略的选择器
 */
export function useSwipeTrack({
  viewport,
  track,
  index,
  count,
  onSwipe,
  enabled = () => true,
  ignore = [],
}) {
  const ignoreSelector = [...DEFAULT_IGNORE, ...ignore].join(', ')

  /** 跟手位移（px，相对当前页基准），0 = 当前页正好贴住取景框 */
  let shift = 0
  /** 手指正按着、且已判出横向 */
  let swiping = false
  /** 落位过渡还没走完：手势期间按下要在它中途接管 */
  let settling = false
  let settleTimer = 0
  /** 上一帧量到的一页宽：宽度一变（窗口缩放、界面缩放）就得把整排重新对到基准上 */
  let trackWidth = 0
  /** 这一次触摸的现场，判出横向之后才有意义 */
  let touch = null
  /** 抬手之后浏览器补的那发合成 click 要不要吃掉 */
  let swallowClick = false
  let swallowTimer = 0
  let observer = null

  /** 一页宽：阈值与基准都按它算，别写死像素 */
  function width() {
    return viewport.value?.clientWidth || 0
  }

  /** 第 i 页的轨道坐标：这一页左缘贴住取景框左缘时，整排该有的 translateX */
  function baseFor(i) {
    return -Math.max(0, i) * width()
  }

  /**
   * 写轨道的位置 —— 整排只有这一处在动。
   * transform 与 transition 在同一任务里一前一后写完：浏览器渲染前只重算一次样式，
   * 看到的就是「过渡从无到有 + 位移变了」。
   */
  function apply(px, dur = 0) {
    shift = px
    const el = track.value
    if (!el) return
    el.style.transition = dur > 0 ? `transform ${dur}ms ${SWIPE_EASE}` : 'none'
    el.style.transform = `translate3d(${baseFor(index()) + px}px, 0, 0)`
  }

  /** 跟手阻尼：65% 以内 1:1；越过之后只剩 1/4 余量；到头 / 尾那一侧再打三折 */
  function dampShift(dx) {
    const limit = width() * SWIPE_LIMIT
    const atEdge = dx > 0 ? index() <= 0 : index() >= count() - 1
    const raw = Math.abs(dx) * (atEdge ? 0.3 : 1)
    const damped = raw <= limit ? raw : limit + (raw - limit) * 0.25
    return Math.sign(dx) * damped
  }

  /**
   * 这一趟落位走多久：速度决定「该有多急」，剩余距离决定「还要走多久」。
   * 夹在 160~320ms —— 太短看不出方向，太长就永远被下一手接走。
   */
  function settleDuration(speed, remaining) {
    const s = Math.min(Math.max(speed, 0.3), 2.5)
    const ms = Math.round((remaining / s) * 0.45)
    return Math.min(SWIPE_DUR_MAX, Math.max(SWIPE_DUR_MIN, ms))
  }

  /** 落位窗：这期间按下要接管，transitionend 来了才收尾 */
  function beginSettle() {
    settling = true
    window.clearTimeout(settleTimer)
    settleTimer = window.setTimeout(finishSettle, SWIPE_SETTLE_MS)
  }

  function finishSettle() {
    window.clearTimeout(settleTimer)
    settling = false
    const el = track.value
    // 兜底收尾可能落在下一手已起手之后：那时不能把过渡写回去，一写跟手就变成
    // 「每帧都在追一个动画」。内联 transition: none 留着正好。
    if (el && !swiping) el.style.transition = ''
  }

  function onTransitionEnd(event) {
    if (event.target !== track.value || event.propertyName !== 'transform') return
    if (!settling) return
    finishSettle()
  }

  /**
   * 读整排此刻的视觉位移（相对当前页基准）并就地冻结 —— 中途接管的入口。
   * 读的是 computed transform 的 `m41`（内联值已经是终点了）；先读后写，于是原地停住。
   */
  function freezeShift() {
    const el = track.value
    if (!el) return 0
    const tf = getComputedStyle(el).transform
    const x = tf && tf !== 'none' ? new DOMMatrixReadOnly(tf).m41 : baseFor(index())
    const px = x - baseFor(index())
    apply(px, 0)
    return px
  }

  /** 按下时冻结过、但这一手其实是纵向滚动：把停住的那一趟续上 */
  function resumeSettle() {
    const dur = settleDuration(0.8, Math.abs(shift))
    beginSettle()
    apply(0, dur)
  }

  /** 收一趟落位（「减弱动效」时不走过渡，也不进落位态） */
  function land(dur) {
    if (reducedMotion()) {
      settling = false
      apply(0, 0)
      return
    }
    beginSettle()
    apply(0, dur)
  }

  /** 起手落在横向可滚区里吗 —— 那儿横拉是滚它自己 */
  function startsInHScroller(target) {
    const stop = viewport.value
    for (let el = target; el && el !== stop; el = el.parentElement) {
      // 页面自己的 `.cf-view` 是**纵向**滚动容器（overflow-x 被算成 auto），跳过它，
      // 否则只要内容比框宽一点点，整页的手势就全没了
      if (el.classList?.contains('cf-view')) continue
      if (el.scrollWidth - el.clientWidth <= 1) continue
      const overflowX = getComputedStyle(el).overflowX
      if (overflowX === 'auto' || overflowX === 'scroll') return true
    }
    return false
  }

  /** 上膛：合成 click 紧跟 touchend，留 350ms 窗口；过了就作废，免得吞掉下一步真正的轻点 */
  function armClickSwallow() {
    swallowClick = true
    window.clearTimeout(swallowTimer)
    swallowTimer = window.setTimeout(() => {
      swallowClick = false
    }, SWALLOW_MS)
  }

  /** 捕获阶段拦在取景框上：划过一手之后，那发 click 不许落到刚滑上来的那一页 */
  function onClickCapture(event) {
    if (!swallowClick) return
    swallowClick = false
    window.clearTimeout(swallowTimer)
    event.preventDefault()
    event.stopPropagation()
  }

  /**
   * 中途放弃这一手（判成纵向滚动、第二根指头落下、系统把触摸收走）。
   *
   * **已经判出横向的必须落位**：不落，整排就停在两页中间 —— 这是「不接管则已、接管必收尾」
   * 那条纪律的最后一个出口。只冻结过、还没判出横向的则把停住的那一趟续上。
   */
  function abortTouch() {
    if (!touch) return
    const paged = swiping && touch.axis === 'x'
    const resumed = touch.resumed
    touch = null
    swiping = false
    if (paged) {
      land(SWIPE_DUR_MAX)
      return
    }
    if (resumed) resumeSettle()
  }

  function onTouchStart(event) {
    if (!enabled() || !width()) return
    if (event.touches.length !== 1) {
      abortTouch()
      return
    }
    const point = event.touches[0]
    const target = event.target
    if (!(target instanceof Element)) return
    if (target.closest(ignoreSelector)) return
    if (startsInHScroller(target)) return

    window.clearTimeout(swallowTimer)
    swallowClick = false

    // 上一趟还在飞：按下这一刻就冻住（指哪停哪），新手势从这个像素接着走
    let base = 0
    let resumed = false
    if (settling) {
      window.clearTimeout(settleTimer)
      settling = false
      base = freezeShift()
      resumed = true
    }

    touch = {
      x: point.clientX,
      y: point.clientY,
      dx: 0,
      axis: null,
      base,
      resumed,
      vx: 0,
      lastDx: 0,
      lastT: performance.now(),
      startT: performance.now(),
    }
  }

  function onTouchMove(event) {
    if (!touch) return
    const point = event.touches[0]
    if (!point) return
    // 第二根指头落下 = 另一件事（缩放），整场交还给浏览器
    if (event.touches.length > 1) {
      abortTouch()
      return
    }

    const dx = point.clientX - touch.x
    const dy = point.clientY - touch.y
    if (!touch.axis) {
      if (Math.abs(dx) < SWIPE_SLOP && Math.abs(dy) < SWIPE_SLOP) return
      // 主要是纵向：这一次触摸就是滚动，整场都不再当手势（纵向本来就归浏览器）
      if (Math.abs(dx) <= Math.abs(dy) * SWIPE_AXIS) {
        abortTouch()
        return
      }
      touch.axis = 'x'
      swiping = true
      touch.lastDx = dx
      touch.lastT = performance.now()
      touch.vx = 0
      // 判方向已经用掉了 dx，基准要让出这一截，否则第一帧会从冻结位置再跳一个 dx
      touch.base -= dampShift(dx)
    } else {
      // 瞬时速度：一阶低通（单帧抖动不至于把「甩」判错，也不至于把慢慢划判成甩）
      const now = performance.now()
      const dt = now - touch.lastT
      if (dt > 0) {
        touch.vx = touch.vx * 0.35 + ((dx - touch.lastDx) / dt) * 0.65
        touch.lastT = now
        touch.lastDx = dx
      }
    }

    touch.dx = dx
    // 判出横向之后才接管：纵向那一趟从头到尾没被 preventDefault 过，浏览器照常滚
    if (event.cancelable) event.preventDefault()
    apply(touch.base + dampShift(dx), 0)
  }

  function onTouchEnd() {
    if (!touch) return
    const current = touch
    touch = null

    if (current.axis !== 'x') {
      // 按下了、但整场都没判出横向（轻点一下、或只是纵向滚）：冻结的那一趟要续上，
      // 否则整排就停在两页中间
      swiping = false
      if (current.resumed) resumeSettle()
      return
    }

    // 判翻页只看**这一手**划了多远：接管时 base 是上一趟剩下的偏移，算进来会替用户做决定
    const moved = Math.abs(current.dx)
    const held = Math.max(1, performance.now() - current.startT)
    // 抬手前手停住了（最后一次 move 之后过了 60ms 以上）就不算甩
    const speed = performance.now() - current.lastT > 60 ? 0 : Math.abs(current.vx)
    const widthPx = width()
    const far = moved >= Math.max(SWIPE_MIN, widthPx * SWIPE_RATIO)
    // 甩一下也算：手机上一半的翻页是这么来的
    const fling = moved >= SWIPE_MIN && speed >= SWIPE_FLING
    // 方向听谁：甩的时候听速度，否则听总位移
    const toward = fling ? Math.sign(current.vx) : Math.sign(current.dx)
    const next = far || fling ? index() - toward : index()

    if (moved >= SWIPE_MIN) armClickSwallow()
    swiping = false

    if (next < 0 || next >= count() || next === index()) {
      // 回弹：滑回当前页的基准。接管场景下这一步就是「把停住的动画走完」
      const dur = settleDuration(speed || moved / held, Math.abs(shift))
      land(dur)
      return
    }

    // 剩下的路 = 一页宽减去已经露出来的部分
    const remaining = Math.max(0, widthPx - Math.abs(shift))
    const dur = settleDuration(speed || moved / held, remaining)
    // 先换页码（baseFor 随即变成新页的基准），再写位移：一条过渡走完剩下那一截
    onSwipe(next)
    land(dur)
  }

  /**
   * 系统把这一手收走了（来电、切后台、弹出原生选择器）：退回原位，页码不动。
   * 不按 `dx` 判翻页 —— 那时它可能是任意中途值，等于替用户做决定。
   */
  function onTouchCancel() {
    abortTouch()
  }

  /**
   * 一页宽变了（窗口缩放、外观里的界面缩放）就把整排重新对到基准上。
   * 基准是像素，旧值就错位；手势中不动（等松手自然对齐），落位中就地换算、不打断。
   */
  function sync() {
    if (swiping) return
    const next = width()
    if (Math.abs(next - trackWidth) < 0.5) return
    trackWidth = next
    apply(settling ? shift : 0, 0)
  }

  /**
   * 非手势切页（点页签 / 赛程点一行 / 前进后退）：调用方改完状态后叫一下，
   * 整排滑到新页的基准上。`animate = false` 是瞬切（跨页点选、减弱动效）。
   */
  function followIndex(animate = true) {
    if (reducedMotion() || !animate) {
      settling = false
      apply(0, 0)
      return
    }
    settling = false
    apply(0, FOLLOW_MS)
  }

  /** 这一趟手势还占着轨道吗 —— 调用方的 watch 看到 true 就让路 */
  function isBusy() {
    return swiping || settling
  }

  onMounted(() => {
    const el = viewport.value
    if (!el) return
    // touchmove 必须非被动：Chrome 在 touchstart 那一刻就按「有没有非被动监听」决定
    // 这次手势要不要等 JS 说话，之后补挂的监听器不保证还拦得住第一帧滚动
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('touchcancel', onTouchCancel)
    el.addEventListener('click', onClickCapture, true)
    track.value?.addEventListener('transitionend', onTransitionEnd)

    if (typeof ResizeObserver === 'function') {
      observer = new ResizeObserver(sync)
      observer.observe(el)
    }
    trackWidth = width()
    apply(0, 0)
  })

  onBeforeUnmount(() => {
    const el = viewport.value
    if (el) {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchCancel)
      el.removeEventListener('click', onClickCapture, true)
    }
    track.value?.removeEventListener('transitionend', onTransitionEnd)
    observer?.disconnect()
    observer = null
    window.clearTimeout(settleTimer)
    window.clearTimeout(swallowTimer)
  })

  return { followIndex, sync, isBusy }
}
