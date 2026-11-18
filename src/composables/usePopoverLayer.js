import { nextTick, onBeforeUnmount, onMounted, ref, toValue, watch } from 'vue'

import { pushBackLayer } from '../services/backStack.js'
import { appViewportBox, onViewportChange, swallowGestureTail } from './useMobileKeyboard.js'

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
 * ⚠️ **那个「视口」是应用层实测出来的可视范围，不是布局视口**（2026-10-14 修）：软键盘弹起时
 * 两者会分家，拿 `window.innerHeight` 当匣，菜单就会伸到键盘底下那一段去。匣的定义收在
 * `useMobileKeyboard.js` 的 `appViewportBox()` 里（与应用层 `.app.is-keyboard` 同一份几何）。
 * **别在这里自己读 `visualViewport`**：收键盘时有的引擎只把 height 还回去、offsetTop 留着
 * 上一相的残值，应用层已经按归一化后的 `--vv-top` 归位了，浮层若还按原始读数算匣，就会夹进
 * 一个整体下移了的假视口、跑到屏幕外（2026-11-13 用户报：窗口矮时在同步设置的输入框里唤出
 * 键盘，收起后设置菜单出屏）。
 *
 * 【关闭】五路：点浮层外（捕获阶段）/ Esc（捕获阶段）/ 窗口失焦 / 视口尺寸变化 /
 * 系统返回（2026-10-30 加，装成 app 时的返回键，见 `services/backStack.js`）。
 * 前四路走下面同一个 `dismiss`，第五路注册的也是它 —— 所以任何一路关闭都会把
 * 「当前最上层」一起清掉，不会在返回栈里留幽灵条目。
 * （视口尺寸变化那一路有例外：焦点在浮层里时只重匣位置、不收 —— 那是软键盘，见 onResize）。
 * 「焦点在浮层里」的口径包含**浮层自己把焦点弄丢**的那一格（表单换相卸掉输入框，焦点掉到
 * `body`），否则用户点「导入 / 登录」之后键盘一收，菜单就跟着没了 —— 见 `ownsFocus()`。
 * ⚠️ 「视口尺寸变化」有**两个来源**：`window.resize`，以及 useMobileKeyboard 实测出来的
 * `--vvh` / `--vv-top` 变化（`onViewportChange`）。后者不能省 —— 收键盘时有的引擎一个
 * resize 都不派发，而 `.app` 与浮层的锚点会跟着可视视口一起挪（2026-11-07 用户报
 * 「收起键盘后整屏错位」就是这么漏出来的），见 onMounted 里那段。
 * 注册时机是**分开的**（2026-10-19 修，见 onMounted 里那段）：`pointerdown` 延迟一拍 ——
 * 打开这一下往往就是某个 pointerdown / click 带出来的，当场挂上会被同一发事件立刻关掉
 * （表现为「点了没反应」）；Esc / blur / resize / 返回 当场挂上 —— 它们打开不了浮层，
 * 晚挂只会吞键。
 * 另外 resize 也会关：浮层是 fixed 定位、贴着某个元素，视口一变那个元素就挪走了，
 * 留在原地的浮层会指向错的位置 —— 重定位不如直接收掉（原生菜单也是这么干的）。
 *
 * 「浮层能待在哪儿」的那个匣 —— 与应用层同一份几何，定义在 `appViewportBox()` 里（见文件头）。
 *
 * @param {Object} options
 * @param {number|import('vue').Ref<number>|(() => number)} options.x 期望的左缘（可传 ref / getter）
 * @param {number|import('vue').Ref<number>|(() => number)} options.y 期望的上缘（同上）
 * @param {() => void} options.onDismiss 请求关闭时的回调（调用方通常翻一个 v-if 用的标记）
 * @param {number} [options.gap] 与**可视范围**四边的最小间隙
 * @param {string|(() => string)} [options.align] `x` 是浮层的左缘（'left'，默认）还是右缘（'right'）
 * @param {() => (Element|null|Array<Element|null>)} [options.alsoInside]
 *   伴生盒子：与 `root` 一起算「还在浮层里」的那些元素。设置菜单把二级 Teleport 到 body 之后
 *   用得上 —— 它不再是 `root` 的子孙，点它 / 焦点落进去都不该被当成「点到外面」而收掉菜单。
 */
export function usePopoverLayer({ x, y, onDismiss, gap = 8, align = 'left', alsoInside }) {
  const root = ref(null)
  // 初值直接用期望位置：收敛要等下一帧量到尺寸才生效，first paint 先落在期望处
  const position = ref({ left: `${toValue(x)}px`, top: `${toValue(y)}px` })
  // 量完之前不显形，否则会看见「先在期望位置闪一下再被拉回来」
  const ready = ref(false)
  /**
   * 浮层是不是被**往上**夹了（下方空间不够，只能长到锚点上方）。
   *
   * 判据只看「最终 top 比期望 y 小」：那是匣把浮层往上推的直接证据，不需要知道锚点在哪。
   *
   * 为什么要暴露它：入场动画的 `transform-origin` 写死在样式表里（菜单 top left、
   * 设置与组件菜单 top right），而贴底那颗齿轮（`.activity-bar__group--tools`）弹菜单时
   * 一定走这条路 —— 实测 700px 高的窗口里齿轮在 y=656，菜单被夹到 349，**整体在齿轮上方**，
   * origin 却还是右上角：菜单从离齿轮最远的那一角长出来、位移方向也朝下，读起来就是
   * 「向上展开却在往下掉」。组件拿这个标记换 origin 与位移方向（见 --menu-enter-y）。
   */
  const flipped = ref(false)

  /** 返回键那一层的注销函数（注册在 onMounted，见那里那段） */
  let releaseBack = null
  /** 「可视视口几何变了」的订阅注销函数（同上） */
  let offViewport = null

  // 稳定引用：onDismiss 若是个每次渲染都变的内联箭头函数，removeEventListener 会认不出来
  const dismiss = () => {
    // 先出栈再关：任何一路关闭（点外 / Esc / blur / resize / 系统返回）都要让
    // 「当前最上层」立刻跟上，否则残留的那个条目会让下一次返回落在空处
    releaseBack?.()
    releaseBack = null
    onDismiss?.()
  }

  /**
   * 这个节点算不算「在浮层里」：主盒的子孙，或调用方交上来的伴生盒子（见 `alsoInside`）。
   *
   * 「点外面才关」「焦点还在不在」两处判据共用它 —— 分散写必然有一处漏掉伴生盒，
   * 而漏掉的后果都很具体：前者是二级里点一下就整份菜单没了，后者是键盘一弹正在填的表单被销毁。
   */
  function contains(target) {
    if (!(target instanceof Node)) return false
    const extra = alsoInside?.()
    const list = Array.isArray(extra) ? extra : [extra]
    return [root.value, ...list].some((el) => el instanceof Element && el.contains(target))
  }

  function onPointerDown(event) {
    if (!root.value || contains(event.target)) return
    /**
     * 这一下点在浮层外面，多半就是落在编辑区上 —— 而浮层一关（遮罩跟着卸载），那一发
     * 手势的**收尾会重新命中到底下的元素上**：兼容鼠标 mousedown 打进 Monaco 会落光标、
     * 抢焦点、弹软键盘；click 打到页签 / 文件上会切页签、开文件（2026-11-18 探针实测）。
     * 用户的口径是「点外部只收菜单，不触发底下任何业务逻辑」，所以关闭之前先登记
     * `swallowGestureTail()`（鼠标 + 触屏同一口径）：把这一发手势的收尾整段吞掉
     * （含 Monaco 的 Tap 那条路），详见 useMobileKeyboard 里的说明。
     * 下一发新手势照常，不会变成「点了没反应」。
     */
    swallowGestureTail()
    dismiss()
  }

  function onKeyDown(event) {
    if (event.key !== 'Escape') return
    event.preventDefault()
    dismiss()
  }

  /**
   * 最后一次 `focusin` 是不是落在浮层里（见 `ownsFocus`）。
   *
   * 只记落点、不记「浮层里有没有焦点」：元素被浮层自己卸掉时浏览器会把焦点交给
   * `body`，而**没有**对应的 `focusin` 落在 `body` 上 —— 这时上一条落点仍然是浮层里
   * 那一格，正是要继续沿用的那一份。
   */
  let focusOwned = false

  function onFocusTrack(event) {
    const el = root.value
    if (!el || !(event.target instanceof Node)) return
    focusOwned = contains(event.target)
  }

  /**
   * 这一下视口变化，焦点算不算「还在我们手上」。
   *
   * 除了常规的「焦点还在浮层里」，还要接住一种：**浮层把焦点自己弄丢了** ——
   * 落在 `body` / `null` 上，而最后一次 `focusin` 明明在浮层里。典型是设置菜单「云端同步」
   * 那个小表单：点「导入 / 登录」之后表单从「填用户名」切成「看验证码 / 问一句确认」，
   * 那个 `<input>` 被 `v-if` 卸掉，焦点无处可去、掉到 `body`；键盘随之收起 → 可视视口变高
   * → 走到这里。
   *
   * 不接住的话后果就是用户报的那一下（2026-11-09）：菜单被当成「焦点在外面」直接收掉，
   * 刚换出来的验证码 / 确认按钮根本点不到，整件事只能从头再来一遍。
   *
   * 判据刻意收得很窄：只有「焦点真的丢在 body 上」才算 —— 焦点若跑到了浮层外的某个
   * 元素上，必有一发 `focusin` 落在那里（`focusOwned` 同步变假，照旧收掉）；而用户点到
   * 浮层外面时，那一发 `pointerdown` 已经先把浮层关了。
   */
  function ownsFocus() {
    const el = root.value
    if (!el) return false
    const active = document.activeElement
    if (active && contains(active)) return true
    return (!active || active === document.body) && focusOwned
  }

  /**
   * 量到真实尺寸后把左上角夹进**可视范围**（匣的定义见 `appViewportBox()`）。
   *
   * 挂载时走一次（夹完才显形，否则会看见「先在期望位置闪一下再被拉回来」），
   * 软键盘顶起视口时再走一次 —— 浮层是 fixed 的，视口变了它就得跟着挪。
   */
  async function clampIntoViewport() {
    await nextTick()
    const el = root.value
    if (!el) return
    /**
     * 尺寸取**布局盒**（offsetWidth / offsetHeight），不取 `getBoundingClientRect()`。
     * 挂载那一帧元素还在入场动画里（`scale(0.95 → 1)`），rect 量到的是被缩小过的那一份，
     * 按它匣出来的位置在动画结束后就偏了一截，得靠 animationend / 200ms 那两次再匣把它
     * 挪正 —— 用户看到的就是「浮层先出现在一处、再跳到另一处」（2026-11-13 用户报：
     * 触屏长按分组芯片，卡片先在手指处、再跳到芯片下方；除了那条二次打开的成因外，
     * 这一路的偏差也让它更明显）。offset* 不吃 transform，第一次量到的就是最终尺寸，
     * 匣一次即是终态 —— 后面那两次再匣退化成幂等兜底（留给字体换相 / 内容变高）。
     */
    const box = appViewportBox()
    const width = el.offsetWidth || el.getBoundingClientRect().width
    /**
     * 高：**放不下就压一个 max-height、让它自己滚**。
     *
     * 匣比浮层还矮的时候（矮窗口；键盘顶起来、可视区只剩两百来像素），旧口径是只把上沿
     * 夹到匣顶、底下一截永远够不着 —— 设置菜单最底下的「同步设置」正好在这一截里，点都点
     * 不到。现在改成把内容压进匣里，由样式表里的 `overflow-y: auto` 出滚动条。
     *
     * 量「自然高度」前得先把身上的 max-height 让开：`offsetHeight` 量到的是被压过的那一份，
     * 不然「视口重新变高、上限该撤掉」这件事永远发现不了，菜单会一直矮一截。
     */
    const span = box.bottom - box.top - gap * 2
    const applied = el.style.maxHeight
    el.style.maxHeight = 'none'
    const natural = el.offsetHeight || el.getBoundingClientRect().height
    el.style.maxHeight = applied
    const capped = span > 0 && natural > span
    const height = capped ? span : natural
    // 右缘对齐时先左移一个自身宽度，把「右缘」换算成「左缘」，之后才夹进视口
    const rawX = toValue(align) === 'right' ? toValue(x) - width : toValue(x)
    const left = Math.max(box.left + gap, Math.min(rawX, box.right - width - gap))
    const desiredTop = toValue(y)
    const top = Math.max(box.top + gap, Math.min(desiredTop, box.bottom - height - gap))
    // 被往上夹了 = 下方放不下，浮层实际长在锚点上方（见 flipped 的说明）
    flipped.value = top < desiredTop - 0.5
    position.value = {
      left: `${left}px`,
      top: `${top}px`,
      maxHeight: capped ? `${span}px` : undefined,
    }
  }

  /**
   * 视口尺寸变化：默认收掉（浮层贴着某个元素，视口一变那个元素就挪走了，留在原地的
   * 浮层会指向错的位置 —— 重定位不如直接收掉，原生菜单也是这么干的）。
   *
   * **例外：焦点在浮层里面时不收**。手机上点进输入框会顶起软键盘，安卓因此把视口压矮
   * 并派发 resize —— 照默认口径收掉，等于把用户正在填的表单当场销毁（实测：414×896
   * 点进设置菜单里那个用户名框，视口一变矮整个菜单就没了）。所以只重匣一次位置。
   * 「焦点还在不在浮层里」的判据见 `ownsFocus()` —— 它把「浮层自己把焦点弄丢了」也算作
   * 还在，不然点「导入 / 登录」换相那一下照样会收掉菜单（2026-11-09 用户报）。
   */
  function onResize() {
    if (ownsFocus()) {
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

  /**
   * 弹开动画结束之后再匣一次（**兜底，正常情况下是幂等的**）。
   *
   * 历史上这一手是必需的：首次匣在 `nextTick` 之后量，那一帧元素还压在「0.95 → 1」的
   * 入场动画中途，`getBoundingClientRect()` 量到的是被缩小过的那一份（实测 412×861 下
   * 设置菜单真高 373.5 只量到 345），按它算出来的位置偏低，最后一行被切掉。
   * 2026-11-13 起 `clampIntoViewport` 改量 `offsetHeight`（不吃 transform），首次匣
   * 就是终态，这一手因此只剩「内容在动画期间真的变高了」这类情形要接（字体换相、
   * 异步填进来的内容）。留着不亏：位置没变时写回同一个值，不会产生位移。
   *
   * 只在 `event.target` 是自己时动手：`animationend` 会从子元素冒泡上来（转圈、对勾那些）。
   * 另外补一枚 200ms 的定时器兜底 —— 元素没跑动画（或动画被系统关掉）时它不会响。
   */
  function onOwnAnimationEnd(event) {
    if (event.target === root.value) clampIntoViewport()
  }

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
    // 记「最后一次 focusin 落在哪儿」给 `ownsFocus()` 用。与上面几路一样当场挂：
    // 浮层里第一个聚焦动作（菜单打开时的高亮行、表单自动送进用户名框）可能就发生在
    // 这一拍里，晚挂会漏掉它，`focusOwned` 便永远是假。
    document.addEventListener('focusin', onFocusTrack, true)

    /**
     * 应用层跟着可视视口挪动时（`--vvh` / `--vv-top` 变了）也必须重匣一次。
     *
     * 这一路**不在 `window.resize` 上**：收键盘时有的引擎连 resize 都不派发（安卓 Firefox
     * 既不 resize 窗口、也不发 `visualViewport` 的 resize / scroll，见 useMobileKeyboard 里
     * 那三条兜底），只挂 resize 就会漏掉整条路 —— 菜单留在键盘弹着那一刻的位置上，而它的
     * 锚点（那颗齿轮）已经跟着 `.app` 挪走了。用户看到的正是「收起键盘之后整屏错位」
     * （2026-11-07 报）。
     *
     * 走同一个 `onResize`：焦点在浮层里就只重匣一次（正在填的表单不能销毁），焦点在外面
     * 则照旧收掉 —— 那条口径与「视口一变、锚点就挪了」完全一致，只是补上了事件的缺口。
     */
    offViewport = onViewportChange(onResize)

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
    // 入场动画一结束就把「被缩过的那一份」纠正回来（见 onOwnAnimationEnd）；
    // 定时器兜底元素没跑动画的情形
    root.value?.addEventListener('animationend', onOwnAnimationEnd)
    timers.push(window.setTimeout(() => clampIntoViewport(), 200))
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
    document.removeEventListener('focusin', onFocusTrack, true)
    root.value?.removeEventListener('animationend', onOwnAnimationEnd)
    offViewport?.()
    offViewport = null
    // 外层 `v-if` 直接收掉浮层（既没走 dismiss 也没走那四路）时，这一层就靠这里出栈
    releaseBack?.()
    releaseBack = null
  })

  return { root, position, ready, flipped }
}
