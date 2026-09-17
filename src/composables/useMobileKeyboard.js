import { onBeforeUnmount, onMounted, ref } from 'vue'

// 触摸屏默认开启（鼠标设备上不生效）：键盘弹起之后只做两件事——
//   1. 改变窗口大小：把整块应用收缩到键盘上方（visualViewport 的 height / offsetTop
//      写成 --vvh / --vv-top，见 App.vue 的 .app.is-keyboard）；
//   2. 焦点不要改变：点非可编辑元素时拦掉默认行为（键盘收起是因为焦点被移走）；
//      滑动（滚动）时若焦点跑到了可编辑元素上，再把它还回去。
//
// 唤出键盘的时机仍是浏览器默认的（焦点落进可输入文字的框里就弹），这里只是不让
// 「滑动」也算唤出——用户口径：**滑动只滚动，轻点才聚焦**。
// 别加顶栏开关（点按钮自己会抢焦点，反而把已经弹着的键盘弄收，撤过一版）。
const EDITABLE = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]'
// 判「焦点是不是落进了能输入文字的地方」时要把 Monaco 的输入面也算上：Chrome 里它是
// EditContext 的 .native-edit-context（**不是** contenteditable，上面那个选择器认不出来），
// 其他浏览器走隐藏的 textarea.inputarea。漏了它，滑动时焦点被抢走就判不出来。
const FOCUSABLE_SURFACE = `${EDITABLE}, .monaco-editor .native-edit-context, .monaco-editor textarea.inputarea`
// Monaco 手势识别里的 Tap 事件名（vs/base/browser/touch.js 的 EventType.Tap）。
// 它把「位移不到 30px 的拖动」也算成 Tap，Tap 里会 focusTextArea()，键盘就是这么弹出来的；
// 事件派发在 .view-lines 上（bubbles=false、cancelable=true），所以捕获阶段能先截住。
const MONACO_GESTURE_TAP = '-monaco-gesturetap'
// 手指位移超过这个距离就算滑动，这次触摸不再允许改变焦点。
// 取值夹在两个阈值中间：平台自己的点按 slop（约 8px，决定浏览器会不会补一个 mousedown）
// 与 Monaco 手势识别的 30px。比平台 slop 略大，免得把手抖的轻点误判成滑动；
// 又远小于 30px，才能盖住 Monaco 把小幅拖动当点击的那一段。
const PAN_SLOP = 10

const isEditable = (node) => node instanceof Element && Boolean(node.closest(FOCUSABLE_SURFACE))

export function useMobileKeyboard() {
  const active = ref(window.matchMedia('(pointer: coarse)').matches)

  let listening = false
  // 本次触摸的状态：起点、是否已判为滑动、滑动前焦点在哪
  let startX = 0
  let startY = 0
  let panning = false
  let focusBeforeTouch = null

  // 滑动不该改变焦点：把焦点还给滑动前那个；本来就没有焦点就干脆别聚焦（键盘不弹）。
  // 两种时机都会调到这里——判定为滑动的那一刻（iOS 在 touchstart 就把焦点给了输入框，
  // 那时还没滑，得在滑动成立时补一次），以及滑动过程中焦点又被移走时（focusin）。
  function undoFocusChangeFromPan() {
    const current = document.activeElement
    if (!isEditable(current) || current === focusBeforeTouch) return
    if (isEditable(focusBeforeTouch) && focusBeforeTouch.isConnected) focusBeforeTouch.focus({ preventScroll: true })
    else if (current instanceof HTMLElement) current.blur()
  }

  function onTouchStart(event) {
    const touch = event.touches[0]
    startX = touch ? touch.clientX : 0
    startY = touch ? touch.clientY : 0
    panning = false
    const current = document.activeElement
    focusBeforeTouch = current instanceof HTMLElement && current !== document.body ? current : null
  }

  function onTouchMove(event) {
    if (panning) return
    const touch = event.touches[0]
    if (!touch) return
    if (Math.abs(touch.clientX - startX) > PAN_SLOP || Math.abs(touch.clientY - startY) > PAN_SLOP) {
      panning = true
      undoFocusChangeFromPan()
    }
  }

  function onFocusIn() {
    if (panning) undoFocusChangeFromPan()
  }

  // Monaco 在触摸设备上不用 mousedown（pointerHandler.js 对 pointerType === 'touch' 直接 return），
  // 它是靠上面那套手势识别：touchend 时只要位移 < 30px 就派一个 Tap，Tap 里 focusTextArea()。
  // 于是在编辑器上小幅滑动（10–30px）也会聚焦、弹键盘。这里按我们自己的阈值先截下来：
  // 判定为滑动就掐掉这次 Tap，Monaco 压根收不到，也就不会聚焦（不会有「闪一下又收」）。
  function onMonacoGestureTap(event) {
    if (!panning) return
    event.stopPropagation()
    event.preventDefault()
  }

  // 只拦默认行为，不抢焦点：对着非可编辑元素 preventDefault 一下，焦点原地不动、键盘不落。
  // 只挡 mousedown、不挡 pointerdown：挡 pointerdown 会把兼容的 click 一起吞掉，
  // 「运行全部」「添加样例」这些按钮就点不动了；挡 mousedown 只阻止焦点转移，click 照常。
  // 可编辑元素一律放行，Monaco 的 focus() 是它自己在 mousedown 里调的、不受影响。
  function onMouseDown(event) {
    const node = event.target
    if (!(node instanceof Element) || node.closest(EDITABLE)) return
    // 刚滑动过：这次 mousedown 是滑动收尾补上的，别让它把焦点改掉
    if (panning) event.stopPropagation()
    event.preventDefault()
  }

  // -------------------------------------------------- 可视高度（键盘剩余空间）
  function syncViewport() {
    const viewport = window.visualViewport
    const height = Math.round(viewport ? viewport.height : window.innerHeight)
    const top = Math.round(viewport ? viewport.offsetTop : 0)
    const style = document.documentElement.style
    style.setProperty('--vvh', `${height}px`)
    style.setProperty('--vv-top', `${top}px`)
  }

  function start() {
    if (listening) return
    listening = true
    document.addEventListener('touchstart', onTouchStart, true)
    document.addEventListener('touchmove', onTouchMove, true)
    document.addEventListener('mousedown', onMouseDown, true)
    document.addEventListener('focusin', onFocusIn, true)
    // 必须在捕获阶段：Monaco 的监听挂在 .view-lines 自己身上，冒泡阶段就晚了
    document.addEventListener(MONACO_GESTURE_TAP, onMonacoGestureTap, true)
    window.addEventListener('resize', syncViewport)
    window.addEventListener('orientationchange', syncViewport)
    window.visualViewport?.addEventListener('resize', syncViewport)
    window.visualViewport?.addEventListener('scroll', syncViewport)
    syncViewport()
  }

  function stop() {
    if (!listening) return
    listening = false
    document.removeEventListener('touchstart', onTouchStart, true)
    document.removeEventListener('touchmove', onTouchMove, true)
    document.removeEventListener('mousedown', onMouseDown, true)
    document.removeEventListener('focusin', onFocusIn, true)
    document.removeEventListener(MONACO_GESTURE_TAP, onMonacoGestureTap, true)
    window.removeEventListener('resize', syncViewport)
    window.removeEventListener('orientationchange', syncViewport)
    window.visualViewport?.removeEventListener('resize', syncViewport)
    window.visualViewport?.removeEventListener('scroll', syncViewport)
  }

  onMounted(() => {
    if (active.value) start()
  })
  onBeforeUnmount(stop)

  return { active }
}