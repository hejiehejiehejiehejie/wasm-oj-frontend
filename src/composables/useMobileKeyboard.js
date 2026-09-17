import { onBeforeUnmount, ref, watch } from 'vue'
import { usePersistentRef } from './usePersistentRef.js'

// 触摸屏专用：虚拟键盘弹起来之后不让它被挤下去。
//
// 只做两件事（2026-09-18 改版：原先还有个「底部输入停靠栏」，实测是多余的——
// 输入框本来就在卡片里，多一条停靠栏反而挤掉内容，而且它抢焦点抢得点不进 Monaco 编辑器）：
//   1. 可视高度——把 visualViewport 的剩余高度写成 --vvh，让 .app 收缩到键盘上方；
//   2. 保焦——点上方空白 / 按钮时不让焦点转移出去（键盘收起）。
//
// 关键：**只拦默认行为，不抢焦点**。点在可编辑元素上一律放行，焦点照常交给它。
//
// 只在触摸屏入口下会被打开（按钮本身只在 pointer: coarse 出现），
// 所以桌面端不会挂上这里任何全局监听。
export function useMobileKeyboard() {
  const open = usePersistentRef('cph.mobileKeyboard', false)

  // 入口按钮本来就只在 pointer: coarse 下出现，所以存档里写着「开着」但当前是鼠标设备时
  // 不能照旧生效：那样会凭一份旧存档把鼠标的点击也拦掉。粗指针才有虚拟键盘，也才有这个模式。
  if (!window.matchMedia('(pointer: coarse)').matches) open.value = false

  // 可编辑元素一律放行：Monaco 的输入面是个贴边的 textarea（.inputarea），卡片输入框是 .ta，
  // 原生下拉是 select——都要能正常拿到焦点。挡掉它们就等于「焦点进不去编辑器」。
  const EDITABLE = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]'

  // 只挡 mousedown，不挡 pointerdown：挡 mousedown 能阻止焦点转移，而 click 照常触发，
  // 「运行全部」这类按钮仍然可用；挡 pointerdown 会连带把 click 一起吞掉。
  //
  // 这里刻意**没有** focusout 抢焦兜底：早先那版挂过 focusout + focus({ preventScroll: true })，
  // 结果点 Monaco 编辑器时焦点被立刻抢回停靠栏的 textarea，编辑器根本点不进去（真机反馈的 bug）。
  function onMouseDown(event) {
    if (!open.value) return
    const node = event.target
    if (!(node instanceof Element)) return
    if (node.closest(EDITABLE)) return

    // 点在非可聚焦元素上（空白、标题、按钮……）：默认行为是把焦点移给 body、键盘随之收起，
    // 拦掉它焦点就留在原处。click 不受影响，按钮照常响应。
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
    window.removeEventListener('resize', syncViewport)
    window.removeEventListener('orientationchange', syncViewport)
    window.visualViewport?.removeEventListener('resize', syncViewport)
    window.visualViewport?.removeEventListener('scroll', syncViewport)
    clearViewport()
  }

  watch(open, (value) => (value ? start() : stop()), { immediate: true })
  onBeforeUnmount(stop)

  return {
    open,
    toggle: () => {
      open.value = !open.value
    },
  }
}