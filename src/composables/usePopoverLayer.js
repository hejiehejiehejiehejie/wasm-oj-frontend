import { nextTick, onBeforeUnmount, onMounted, ref, toValue } from 'vue'

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
 *
 * 【关闭】四路：点浮层外（捕获阶段）/ Esc（捕获阶段）/ 窗口失焦 / 视口尺寸变化
 * （最后一路有例外：焦点在浮层里时只重匣位置、不收 —— 那是软键盘，见 onResize）。
 * 监听是**延迟一拍**注册的：打开这一下往往就是某个 pointerdown / click 带出来的，
 * 当场挂上会被同一发事件立刻关掉（表现为「点了没反应」）。
 * 另外 resize 也会关：浮层是 fixed 定位、贴着某个元素，视口一变那个元素就挪走了，
 * 留在原地的浮层会指向错的位置 —— 重定位不如直接收掉（原生菜单也是这么干的）。
 *
 * @param {Object} options
 * @param {number|import('vue').Ref<number>|(() => number)} options.x 期望的左缘（可传 ref / getter）
 * @param {number|import('vue').Ref<number>|(() => number)} options.y 期望的上缘（同上）
 * @param {() => void} options.onDismiss 请求关闭时的回调（调用方通常翻一个 v-if 用的标记）
 * @param {number} [options.gap] 与视口四边的最小间隙
 * @param {string|(() => string)} [options.align] `x` 是浮层的左缘（'left'，默认）还是右缘（'right'）
 */
export function usePopoverLayer({ x, y, onDismiss, gap = 8, align = 'left' }) {
  const root = ref(null)
  // 初值直接用期望位置：收敛要等下一帧量到尺寸才生效，first paint 先落在期望处
  const position = ref({ left: `${toValue(x)}px`, top: `${toValue(y)}px` })
  // 量完之前不显形，否则会看见「先在期望位置闪一下再被拉回来」
  const ready = ref(false)

  // 稳定引用：onDismiss 若是个每次渲染都变的内联箭头函数，removeEventListener 会认不出来
  const dismiss = () => onDismiss?.()

  function onPointerDown(event) {
    if (root.value && !root.value.contains(event.target)) dismiss()
  }

  function onKeyDown(event) {
    if (event.key !== 'Escape') return
    event.preventDefault()
    dismiss()
  }

  /**
   * 量到真实尺寸后把左上角夹进视口。
   *
   * 挂载时走一次（夹完才显形，否则会看见「先在期望位置闪一下再被拉回来」），
   * 软键盘顶起视口时再走一次 —— 浮层是 fixed 的，视口变了它就得跟着挪。
   */
  async function clampIntoViewport() {
    await nextTick()
    const el = root.value
    if (!el) return
    const rect = el.getBoundingClientRect()
    // 右缘对齐时先左移一个自身宽度，把「右缘」换算成「左缘」，之后才夹进视口
    const rawX = toValue(align) === 'right' ? toValue(x) - rect.width : toValue(x)
    const left = Math.max(gap, Math.min(rawX, window.innerWidth - rect.width - gap))
    const top = Math.max(gap, Math.min(toValue(y), window.innerHeight - rect.height - gap))
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

  let timers = []

  onMounted(async () => {
    await clampIntoViewport()
    ready.value = true
    const timer = window.setTimeout(() => {
      window.addEventListener('pointerdown', onPointerDown, true)
      window.addEventListener('keydown', onKeyDown, true)
      window.addEventListener('blur', dismiss)
      window.addEventListener('resize', onResize)
    }, 0)
    timers.push(timer)
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
  })

  return { root, position, ready }
}
