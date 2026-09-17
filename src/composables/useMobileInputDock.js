import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { usePersistentRef } from './usePersistentRef.js'

// 触摸屏专用：把「当前正在编辑的输入框」停靠到视口底部，上方内容照常滚动。
//
// 三件事都在这里：
//   1. 模式状态与目标（编辑哪个用例的哪一项）；
//   2. 保焦——键盘弹起后用户点上方内容时不让焦点被抢走；
//   3. 可视高度——把 visualViewport 的剩余高度写成 --vvh，让 .app 收缩到键盘之上。
//
// 只在触摸屏入口下会被打开（按钮本身只在 pointer: coarse 出现），
// 所以桌面端不会挂上这里任何全局监听。
const FIELD_LABELS = { input: '标准输入', expectedOutput: '期望输出' }

export function useMobileInputDock(cases, getTextarea) {
  const open = usePersistentRef('cph.mobileInputDock', false)

  // 入口按钮本来就只在 pointer: coarse 下出现，所以存档里写着「开着」但当前是鼠标设备时
  // 不能照旧生效：那样会凭一份旧存档把鼠标的焦点也劫持走。粗指针才有虚拟键盘，也才有这个模式。
  if (!window.matchMedia('(pointer: coarse)').matches) open.value = false
  // 停靠目标：{ caseId, field }。故意不持久化——刷新后停靠回第一个用例的标准输入即可。
  const target = ref(null)

  // 目标用例：被删掉或没设过就回退到第一个，列表空了自动关闭模式
  const activeCase = computed(() => {
    const list = cases.value
    if (!list.length) return null
    const wanted = target.value ? list.find((item) => item.id === target.value.caseId) : null
    return wanted ?? list[0]
  })

  const field = computed(() => (target.value?.field === 'expectedOutput' ? 'expectedOutput' : 'input'))

  const resolved = computed(() => {
    const item = activeCase.value
    if (!item) return null
    const index = cases.value.indexOf(item)
    return { target: item, field: field.value, label: `#${index + 1} ${FIELD_LABELS[field.value]}` }
  })

  function openDock(caseId, nextField) {
    target.value = { caseId, field: nextField }
  }

  function close() {
    exiting = true
    textarea()?.blur()
    open.value = false
    window.setTimeout(() => {
      exiting = false
    }, 0)
  }

  async function toggle() {
    if (open.value) {
      close()
      return
    }
    open.value = true
    // 停靠栏是 v-if 渲染的，等它挂上再聚焦：仍在同一次用户手势内，键盘会直接弹起
    await nextTick()
    focusTextarea()
  }

  // ---------------------------------------------------------------- 保焦
  let exiting = false

  function textarea() {
    const el = getTextarea()
    return el && !el.disabled ? el : null
  }

  function focusTextarea() {
    const el = textarea()
    if (!el) return
    try {
      el.focus({ preventScroll: true })
    } catch {
      el.focus()
    }
  }

  // 只挡 mousedown，不挡 pointerdown：挡 mousedown 能阻止焦点转移，而 click 照常触发，
  // 「运行全部」这类按钮仍然可用；挡 pointerdown 会连带把 click 一起吞掉。
  function onMouseDown(event) {
    if (!open.value) return
    const node = event.target
    if (!(node instanceof Element)) return
    // 停靠栏内部放行（栏里的输入框与「完成」按钮要能正常用）
    if (node.closest('[data-dock-surface]')) return
    // 原生下拉必须让系统选择器弹出来，此时键盘收起是预期行为
    if (node.closest('select')) return

    event.preventDefault()

    // 点列表里的输入框 = 把那一项停靠到底部（元素上有 data-case-id / data-field）
    const field = node.closest('.ta[data-field]')
    if (!field) return
    openDock(Number(field.dataset.caseId), field.dataset.field)
    focusTextarea()
  }

  // 兜底：真被抢走了就立刻要回来。点「完成」时 relatedTarget 落在停靠栏内，放行。
  function onFocusOut(event) {
    if (!open.value || exiting) return
    const next = event.relatedTarget
    if (next instanceof Element && next.closest('[data-dock-surface]')) return
    focusTextarea()
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

  function clearViewport() {
    const style = document.documentElement.style
    style.removeProperty('--vvh')
    style.removeProperty('--vv-top')
  }

  let listening = false

  function start() {
    if (listening) return
    listening = true
    document.addEventListener('mousedown', onMouseDown, true)
    document.addEventListener('focusout', onFocusOut, true)
    window.addEventListener('resize', syncViewport)
    window.addEventListener('orientationchange', syncViewport)
    window.visualViewport?.addEventListener('resize', syncViewport)
    window.visualViewport?.addEventListener('scroll', syncViewport)
    syncViewport()
  }

  function stop() {
    if (!listening) return
    listening = false
    document.removeEventListener('mousedown', onMouseDown, true)
    document.removeEventListener('focusout', onFocusOut, true)
    window.removeEventListener('resize', syncViewport)
    window.removeEventListener('orientationchange', syncViewport)
    window.visualViewport?.removeEventListener('resize', syncViewport)
    window.visualViewport?.removeEventListener('scroll', syncViewport)
    clearViewport()
  }

  watch(open, (value) => (value ? start() : stop()), { immediate: true })

  // 用例被删空时模式没有意义了，直接关掉
  watch(
    () => cases.value.length,
    (count) => {
      if (!count && open.value) close()
    },
  )

  onBeforeUnmount(stop)

  return {
    open,
    resolved,
    disabled: computed(() => cases.value.length === 0),
    openDock,
    close,
    toggle,
  }
}