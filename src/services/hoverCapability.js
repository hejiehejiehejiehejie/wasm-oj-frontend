/**
 * hoverCapability —— 「此刻这个指针究竟能不能悬停」的唯一出口。
 *
 * 命中时给 `<html>` 挂 `is-hoverable`，全站每一条悬停反馈都以
 * `:where(html.is-hoverable)` 作前缀（写成 `:where()` 是为了**不增加特异性**，
 * 同权重规则之间的先后顺序照旧由源码位置决定，改这一层不会打乱任何现有覆盖关系）。
 *
 * 【为什么不能只用 @media (hover: hover)】
 * 触屏上 `:hover` 会**粘住**：手指抬起之后，浏览器仍把那个元素当成「悬停中」，
 * 直到点了别处。而媒体查询判的是**设备**有没有悬停能力，判不了「这一次是手指按的」——
 * 三种常见的设备会漏：
 *   - 安卓的「长按模拟悬停」：长按（拖动分隔条就是长按）期间 `(hover: hover)` 会成立，
 *     于是被媒体查询挡住的那条悬停规则照样生效，松手后蓝线留在原处；
 *   - 手机开「桌面版网站」、Windows 触屏本这类**既有鼠标又有手指**的设备，
 *     媒体查询恒为真，用手指点按照样把悬停态粘在按钮上；
 *   - 同一台设备上鼠标与手指交替使用时，媒体查询根本不会变。
 * 所以判据要落在**输入事件**上：手指按下 → 关；鼠标 / 触控笔动一下 → 开。
 * 这是全站唯一一份实现，别在组件里再写一份 matchMedia。
 *
 * 【落定时机】模块被 import 时立刻落一次（调用方 main.js），早于首帧渲染 ——
 * 否则桌面端会先按「不能悬停」画一帧再补上，鼠标恰好压在某个按钮上时会闪一下。
 *
 * 【触摸后的静默期】手指抬起后浏览器会补一串**兼容鼠标事件**（安卓 / Chrome 上还可能
 * 补出 `pointerType: 'mouse'` 的移动），不挡的话手指刚离开就把悬停又打开了，
 * 粘住的悬停态立刻复活。所以触摸后 TOUCH_QUIET_MS 内一律不认鼠标移动。
 *
 * 【为什么初值与「开」的闸门用 any-hover】`(hover: hover)` 说的是**主指针**，
 * 而我们要的是「这台设备有没有任何一个能悬停的指针」—— 触屏本上主指针常被算成手指，
 * `(hover: hover)` 于是为假，可它的鼠标明明能悬停。反过来，纯触屏设备（手机 / 平板）
 * 的 any-hover 恒为假，于是那种设备上**永远**不会因为浏览器补出来的鼠标事件把悬停打开
 * （实测踩过：手机上 `page.click` 补一个 pointerType 为 mouse 的按下，悬停立刻复活）。
 */

const DEVICE_HOVER_QUERY = '(any-hover: hover)'
const TOUCH_QUIET_MS = 700

const deviceHoverQuery = window.matchMedia(DEVICE_HOVER_QUERY)

// 设备整体有没有能悬停的指针：没有就再也不开（纯触屏）
const deviceCanHover = () => deviceHoverQuery.matches

let hoverable = deviceCanHover()
let lastTouchAt = 0

function apply(next) {
  if (next === hoverable) return
  hoverable = next
  document.documentElement.classList.toggle('is-hoverable', hoverable)
}

// 首帧之前就落定（调用方是 main.js，import 即执行）
document.documentElement.classList.toggle('is-hoverable', hoverable)

// 按下：手指 → 关（并记时刻）；鼠标 / 触控笔 → 开（且这台设备确实有能悬停的指针）。
// 捕获阶段：任何一处 stopPropagation 都挡不住这次判定。
window.addEventListener(
  'pointerdown',
  (event) => {
    if (event.pointerType === 'touch') {
      lastTouchAt = Date.now()
      apply(false)
      return
    }
    apply(deviceCanHover())
  },
  true,
)

// 只认真实的指针移动（不是触摸派生出来的那串兼容事件）：鼠标一划过就说明这台设备此刻
// 是用鼠标在操作，悬停反馈立刻回来。passive 是因为我们从不 preventDefault。
window.addEventListener(
  'pointermove',
  (event) => {
    if (event.pointerType !== 'mouse' || hoverable) return
    if (Date.now() - lastTouchAt < TOUCH_QUIET_MS) return
    if (!deviceCanHover()) return
    apply(true)
  },
  { capture: true, passive: true },
)

// 平板插拔键盘 / 接上鼠标这类切换会让媒体查询自己变，跟着它复位
deviceHoverQuery.addEventListener('change', () => apply(deviceCanHover()))

/**
 * 「此刻这个指针能不能悬停」——与 `<html>` 上的 `is-hoverable` **同一个值**。
 *
 * 给 JS 侧的悬停**动作**用：CSS 那边靠类名把关（`:where(html.is-hoverable) …:hover`），
 * 而有的东西不是样式、是事件驱动的（例如 `AppTooltip` 在 mouseenter 上排一个定时器弹气泡），
 * 那类地方读这个函数，别自己再写一份 matchMedia（判不了「这一次是手指按的」，
 * 理由见文件头）。
 *
 * 现值而不是常量：手指按下当刻就为假、真鼠标划过又回真，恰恰是调用方要的时间语义。
 * @returns {boolean}
 */
export const isHoverable = () => hoverable
