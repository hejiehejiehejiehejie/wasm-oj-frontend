import { onBeforeUnmount, onMounted, ref } from 'vue'

// 触摸屏默认开启（鼠标设备上不生效）：键盘弹起之后只做三件事——
//   1. 改变窗口大小：把整块应用收缩到键盘上方（visualViewport 的 height / offsetTop
//      写成 --vvh / --vv-top，见 App.vue 的 .app.is-keyboard）；
//   2. 焦点不要改变：点非可编辑元素时拦掉默认行为（键盘收起是因为焦点被移走）；
//      滑动（滚动）时若焦点跑到了可编辑元素上，再把它还回去；
//   3. 视口矮了要知会外面：可视高度小于 SHORT_VIEWPORT 时把 shortViewport 置真
//      （App.vue 挂 .app.is-short，用来收掉编辑器状态栏，见 EditorPane.vue）。
//
// 唤出键盘的时机仍是浏览器默认的（焦点落进可输入文字的框里就弹），这里只是不让
// 「滑动」也算唤出——用户口径：**滑动只滚动，轻点才聚焦**。
// 反过来，**键盘一旦弹着，就只有键盘自己的返回键能把它收掉**，滑动不许收。所以「滑动
// 时清焦点」这条只在键盘**没**弹着时执行（见 keyboardUpAtTouchStart 那道闸）。
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
// 判「键盘现在弹着没有」用的最小收缩量。iOS 上键盘只缩「可视视口」（visualViewport），
// 布局视口（window.innerHeight）不动；Android Chrome 默认 resizes-content，两个一起缩。
// 所以两头都要看，取或。100px 是为了滤掉地址栏收放、旋转动画带出来的几十像素抖动。
const KEYBOARD_MIN = 100
// 可视高度小于它就认为视口「矮」，把编辑器状态栏收掉（口径 480px，见 EditorPane.vue）。
// 必须按 visualViewport 量：iOS 上键盘弹起时布局视口不缩，@media (max-height) 看不见它。
const SHORT_VIEWPORT = 480

const isEditable = (node) => node instanceof Element && Boolean(node.closest(FOCUSABLE_SURFACE))
// 焦点是不是还在编辑器里（Monaco 的输入面，Chrome 是 .native-edit-context、其余是
// 隐藏的 textarea.inputarea，两者都在 .monaco-editor 里面）
const isInEditor = (node) => node instanceof Element && Boolean(node.closest('.monaco-editor'))

export function useMobileKeyboard() {
  const active = ref(window.matchMedia('(pointer: coarse)').matches)
  // 可视高度矮于 SHORT_VIEWPORT（含键盘弹起的压缩）时为 true，App.vue 拿它挂 .app.is-short
  const shortViewport = ref(false)

  let listening = false
  // 本次触摸的状态：起点、是否已判为滑动、滑动前焦点在哪、开始那刻键盘弹没弹
  let startX = 0
  let startY = 0
  let panning = false
  let focusBeforeTouch = null
  let keyboardUpAtTouchStart = false

  // 键盘可见性（见 KEYBOARD_MIN）：baselineHeight 是「没弹键盘时」的布局视口高
  let baselineHeight = window.innerHeight
  let lastWidth = window.innerWidth
  let keyboardUp = false

  function isKeyboardUp() {
    const viewport = window.visualViewport
    return (
      baselineHeight - window.innerHeight > KEYBOARD_MIN ||
      (viewport ? window.innerHeight - viewport.height > KEYBOARD_MIN : false)
    )
  }

  // 滑动不该改变焦点：编辑器里的焦点直接清掉（理由见下），其余情况把焦点还回滑动前那个；
  // 本来就没有焦点就别聚焦（键盘不弹）。
  // 两种时机都会调到这里——判定为滑动的那一刻（iOS 在 touchstart 就把焦点给了输入框，
  // 那时还没滑，得在滑动成立时补一次），以及滑动过程中焦点又被移走时（focusin）。
  function undoFocusChangeFromPan() {
    // 键盘本来就弹着：用户是想滚动，不是想换焦点。此时清焦点正是「滑一下就收键盘」的
    // 成因，而用户口径是除了键盘自己的返回键，键盘不许收——所以整场滑动都不碰焦点。
    // 键盘没弹着（包括刚按过返回键、焦点还留在编辑器里的那种）才走下面，否则手势一结束
    // 就会被系统把键盘重新弹起来。
    if (keyboardUpAtTouchStart) return
    const current = document.activeElement
    if (!isEditable(current)) return
    // 编辑器里还留着焦点：直接清掉，别「还回去」。
    // Android Chrome 上，一个已经聚焦的输入框会在手势结束时被系统重新弹起键盘
    // （这一步连 focusin 都不派发，所以下面 over-mousedown / 手势 Tap 两道闸都看不见它），
    // 只有把焦点清掉才能断掉这个前提。真机反馈正是「滑之前点过编辑器、抬手后才弹」。
    if (current.closest('.monaco-editor')) {
      current.blur()
      return
    }
    if (current === focusBeforeTouch) return
    if (isEditable(focusBeforeTouch) && focusBeforeTouch.isConnected) focusBeforeTouch.focus({ preventScroll: true })
    else if (current instanceof HTMLElement) current.blur()
  }

  function onTouchStart(event) {
    const touch = event.touches[0]
    startX = touch ? touch.clientX : 0
    startY = touch ? touch.clientY : 0
    panning = false
    keyboardUpAtTouchStart = keyboardUp
    const current = document.activeElement
    focusBeforeTouch = current instanceof HTMLElement && current !== document.body ? current : null
    // 「用户在键盘上按返回键把键盘收掉了，但焦点还留在编辑器里」这一种，和下面
    // 滑动那条是同一个成因（已聚焦的输入框会被系统在手势结束时重新弹起键盘），只是
    // 轻点也会触发、而且拦 mousedown 来不及（合成 mousedown 在 touchend 之后才来）。
    // 用户口径：键盘收掉之后点哪儿都不该再把它捞回来。所以在 touchstart 就把这个前提
    // 断掉——键盘没弹着还残留着编辑器焦点，先 blur。点编辑器文本时的重新聚焦不用管，
    // 那是 Monaco 自己的 Tap 干的（焦点本来就是这个入口给的）；点别处则不再弹键盘。
    // 键盘弹着时不能这样做：那时正确行为是保焦（点按钮、点输出区都不收键盘）。
    if (!keyboardUpAtTouchStart && isInEditor(current)) {
      current.blur()
      focusBeforeTouch = null
    }
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
    // 宽度变了（旋转、桌面拖窗）就把基线重取：否则横屏时基线还留着竖屏那个高，
    // 会被误判成「键盘弹着」，滑动就再也不清焦点了。键盘弹出只缩高度、不改宽度，
    // 所以不会误触发重取。
    if (window.innerWidth !== lastWidth) {
      lastWidth = window.innerWidth
      baselineHeight = window.innerHeight
    }
    baselineHeight = Math.max(baselineHeight, window.innerHeight)
    keyboardUp = isKeyboardUp()

    const viewport = window.visualViewport
    const height = Math.round(viewport ? viewport.height : window.innerHeight)
    const top = Math.round(viewport ? viewport.offsetTop : 0)
    const style = document.documentElement.style
    shortViewport.value = height < SHORT_VIEWPORT
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

  return { active, shortViewport }
}