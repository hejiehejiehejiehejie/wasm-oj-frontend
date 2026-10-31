import { nextTick, onBeforeUnmount, onMounted, ref, toValue, watch } from 'vue'

import { pushBackLayer } from '../services/backStack.js'

/**
 * usePopoverLayer —— Teleport 到 body 的浮层躲不开的两件事：定位收敛 + 什么时候关。
 *
 * 抽自 `ContextMenu.vue`（2026-10-11）：新加的设置下拉菜单要的是同一套行为，
 * 复制一份等于让「位置匣在视口内」「同一发 pointerdown 不能立刻把刚开的浮层关掉」
 * 这类讲究各自走偏，所以收在这里共用。
 *
 * 【定位】调用方给的是**期望的那条边**：`x` 默认是浮层的左缘，但 `align: 'right'` 时它是
 * 右缘（菜单挂在齿轮右侧、右对齐时必须这么量）。换算因此只能发生在「量到真实宽度之后」
 * —— 也就是下面那次 nextTick；剩下的职责只有「匣进视口」：
 * 把左上角夹到 `[gap, 视口 - 尺寸 - gap]` 里。
 * 掉头（右边放不下就改挂左边）由调用方决定 —— 只有它知道锚点在哪一侧，
 * 而这里只认左上角。
 * ⚠️ **那个「视口」是可视视口，不是布局视口**（2026-10-14 修，见 `viewportBox()`）：
 * 软键盘弹起时两者会分家，拿 `window.innerHeight` 当匣，菜单就会伸到键盘底下那一段去。
 *
 * 【关闭】五路：点浮层外（捕获阶段）/ Esc（捕获阶段）/ 窗口失焦 / 视口尺寸变化 /
 * 系统返回（2026-10-30 加，装成 app 时的返回键，见 `services/backStack.js`）。
 * 前四路走下面同一个 `dismiss`，第五路注册的也是它 —— 所以任何一路关闭都会把
 * 「当前最上层」一起清掉，不会在返回栈里留幽灵条目。
 * （视口尺寸变化那一路有例外：焦点在浮层里时只重匣位置、不收 —— 那是软键盘，见 onResize）。
 * 注册时机是**分开的**（2026-10-19 修，见 onMounted 里那段）：`pointerdown` 延迟一拍 ——
 * 打开这一下往往就是某个 pointerdown / click 带出来的，当场挂上会被同一发事件立刻关掉
 * （表现为「点了没反应」）；Esc / blur / resize / 返回 当场挂上 —— 它们打开不了浮层，
 * 晚挂只会吞键。
 * 另外 resize 也会关：浮层是 fixed 定位、贴着某个元素，视口一变那个元素就挪走了，
 * 留在原地的浮层会指向错的位置 —— 重定位不如直接收掉（原生菜单也是这么干的）。
 *
 * @param {Object} options
 * @param {number|import('vue').Ref<number>|(() => number)} options.x 期望的左缘（可传 ref / getter）
 * @param {number|import('vue').Ref<number>|(() => number)} options.y 期望的上缘（同上）
 * @param {() => void} options.onDismiss 请求关闭时的回调（调用方通常翻一个 v-if 用的标记）
 * @param {number} [options.gap] 与**可视视口**四边的最小间隙
 * @param {string|(() => string)} [options.align] `x` 是浮层的左缘（'left'，默认）还是右缘（'right'）
 */
/**
 * 「浮层能待在哪儿」的那个匣 —— **可视视口**（`visualViewport`），不是布局视口。
 *
 * 软键盘弹起时两者会分家：只缩可视视口、不动布局视口的那一族（iOS 全程如此，安卓也常是
 * 这个行为）里 `window.innerHeight` 一动不动，而本站的应用层已经按 `--vvh` / `--vv-top`
 * 把自己收进了可视视口（见 `useMobileKeyboard.js` 与 `.app.is-keyboard`）。拿布局视口当匣，
 * 菜单就会停在键盘底下那一段 —— 用户 2026-10-14 报的「键盘弹着时长按，换出来的菜单被
 * 键盘挡住」正是这个（实测：可视高 596 时在 y=543 长按，245px 高的菜单有 200px 在键盘下）。
 *
 * 返回的是**布局视口坐标系**里的矩形 —— `fixed` 定位用的就是这个坐标系，而可视视口在
 * 该坐标系里的可见区间正是 `[offsetLeft, offsetLeft + width] × [offsetTop, offsetTop + height]`。
 * 没有 `visualViewport` 时退回布局视口（老浏览器，行为与以往一致）。
 */
function viewportBox() {
  const vv = window.visualViewport
  if (!vv) return { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }
  return {
    left: vv.offsetLeft,
    top: vv.offsetTop,
    right: vv.offsetLeft + vv.width,
    bottom: vv.offsetTop + vv.height,
  }
}

export function usePopoverLayer({ x, y, onDismiss, gap = 8, align = 'left' }) {
  const root = ref(null)
  // 初值直接用期望位置：收敛要等下一帧量到尺寸才生效，first paint 先落在期望处
  const position = ref({ left: `${toValue(x)}px`, top: `${toValue(y)}px` })
  // 量完之前不显形，否则会看见「先在期望位置闪一下再被拉回来」
  const ready = ref(false)

  /** 返回键那一层的注销函数（注册在 onMounted，见那里那段） */
  let releaseBack = null

  // 稳定引用：onDismiss 若是个每次渲染都变的内联箭头函数，removeEventListener 会认不出来
  const dismiss = () => {
    // 先出栈再关：任何一路关闭（点外 / Esc / blur / resize / 系统返回）都要让
    // 「当前最上层」立刻跟上，否则残留的那个条目会让下一次返回落在空处
    releaseBack?.()
    releaseBack = null
    onDismiss?.()
  }

  function onPointerDown(event) {
    if (root.value && !root.value.contains(event.target)) dismiss()
  }

  function onKeyDown(event) {
    if (event.key !== 'Escape') return
    event.preventDefault()
    dismiss()
  }

  /**
   * 量到真实尺寸后把左上角夹进**可视视口**（匣的定义见 `viewportBox()`）。
   *
   * 挂载时走一次（夹完才显形，否则会看见「先在期望位置闪一下再被拉回来」），
   * 软键盘顶起视口时再走一次 —— 浮层是 fixed 的，视口变了它就得跟着挪。
   */
  async function clampIntoViewport() {
    await nextTick()
    const el = root.value
    if (!el) return
    const rect = el.getBoundingClientRect()
    const box = viewportBox()
    // 右缘对齐时先左移一个自身宽度，把「右缘」换算成「左缘」，之后才夹进视口
    const rawX = toValue(align) === 'right' ? toValue(x) - rect.width : toValue(x)
    const left = Math.max(box.left + gap, Math.min(rawX, box.right - rect.width - gap))
    const top = Math.max(box.top + gap, Math.min(toValue(y), box.bottom - rect.height - gap))
    position.value = { left: `${left}px`, top: `${top}px` }
  }

  /**
   * 视口尺寸变化：默认收掉（浮层贴着某个元素，视口一变那个元素就挪走了，留在原地的
   * 浮层会指向错的位置 —— 重定位不如直接收掉，原生菜单也是这么干的）。
   *
   * **例外：焦点在浮层里面时不收**。手机上点进输入框会顶起软键盘，安卓因此把视口压矮
   * 并派发 resize —— 照默认口径收掉，等于把用户正在填的表单当场销毁（实测：414×896
   * 点进设置菜单里那个用户名框，视口一变矮整个菜单就没了）。所以只重匣一次位置。
   */
  function onResize() {
    if (root.value?.contains(document.activeElement)) {
      clampIntoViewport()
      return
    }
    dismiss()
  }

  /**
   * 锚点挪了就重新匣一次。
   *
   * 位置只在挂载与视口尺寸变化时算过，而锚点自己会走：侧栏换边时齿轮整颗搬到另一侧，
   * 不跟过去的话菜单会留在原地、指着一个已经搬走的按钮。调用方换锚点（`x` / `y` 的
   * 上游）时把新 rect 写回，这里重算一次位置。
   *
   * 与下面 resize 那一路同口径：只重匣、不收 —— 关不关由调用方决定（换边这条不动菜单）。
   */
  watch(
    () => [toValue(x), toValue(y), toValue(align)],
    () => clampIntoViewport(),
  )

  let timers = []

  onMounted(async () => {
    /**
     * ⚠️ **只有 pointerdown 该迟一拍，其余四路必须当场挂上**（2026-10-19 修；2026-10-30 起
     * 第五路「系统返回」同样归入这一组，见下面那段）。
     *
     * 四路统一塞进 `setTimeout(0)` 那版有个真实的吞键窗口：timer 还是排在
     * `await clampIntoViewport()`（要等一个 nextTick）之后的，浮层刚显出 `--ready`、
     * 主线程正忙时，0ms 的 timer 可能拖到几十毫秒才跑。实测「打开后立刻按 Esc」
     * 第一发完全不生效、第二发才关 —— 手速快的人当场就会遇到（探针里必现）。
     *
     * 分家的判据：`pointerdown` 是可能**打开**浮层的那个手势（菜单都挂在 click 上，
     * click 前面必有一发 pointerdown），当场挂上会被它自己立刻关掉，所以要等它派发完；
     * 而 Esc / 失焦 / 视口变化 / 系统返回打开不了任何浮层，晚挂只会漏掉按键，没有好处。
     * `blur` 也不能等：窗口在你等这一拍的时候失焦，浮层就永远留着了。
     */
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('blur', dismiss)
    window.addEventListener('resize', onResize)

    /**
     * 第五路关闭：装成 app 时的**系统返回**。它和 Esc / 失焦 / 视口变化一样，
     * 打开不了浮层，所以当场注册、不排队等那一拍。
     *
     * 注册点收在这里而不是各调用方：注销必须与注册成对，而浮层有四路关闭 + 外层 `v-if`
     * 卸载，散出去写必然漏（漏一个就在栈里留个幽灵条目，表现为「按了返回什么都没发生」）。
     * 这一路走的是 `dismiss`，所以四条老路也顺带把栈清干净了。
     */
    releaseBack = pushBackLayer(dismiss)

    const timer = window.setTimeout(() => {
      window.addEventListener('pointerdown', onPointerDown, true)
    }, 0)
    timers.push(timer)

    await clampIntoViewport()
    ready.value = true
  })

  onBeforeUnmount(() => {
    for (const timer of timers) window.clearTimeout(timer)
    timers = []
    // 卸载时监听可能还没注册（延迟那一拍还没到、浮层就被收掉了），
    // 所以这里成对的 remove 是幂等的 —— 没注册过也不会报错
    window.removeEventListener('pointerdown', onPointerDown, true)
    window.removeEventListener('keydown', onKeyDown, true)
    window.removeEventListener('blur', dismiss)
    window.removeEventListener('resize', onResize)
    // 外层 `v-if` 直接收掉浮层（既没走 dismiss 也没走那四路）时，这一层就靠这里出栈
    releaseBack?.()
    releaseBack = null
  })

  return { root, position, ready }
}
