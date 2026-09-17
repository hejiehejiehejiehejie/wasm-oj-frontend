import { onBeforeUnmount, onMounted, ref } from 'vue'

// 触摸屏默认开启（鼠标设备上不生效）：键盘弹起之后只做两件事——
//   1. 改变窗口大小：把整块应用收缩到键盘上方（visualViewport 的 height / offsetTop
//      写成 --vvh / --vv-top，见 App.vue 的 .app.is-keyboard）；
//   2. 焦点不要改变：点非可编辑元素时拦掉默认行为，不让焦点移给 body（键盘随之收起）。
//
// 唤出键盘的逻辑不归这里管，就用浏览器默认的——焦点落进可输入文字的框里就弹。
// 别再加「滑动不唤键盘」「点按钮唤键盘」这类手势或补焦逻辑：真机上这些干预要么把
// 已经弹着的键盘弄收（点顶栏按钮自己会抢焦点），要么让滑动后轻点失效，两版都因此撤掉过。
const EDITABLE = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]'

export function useMobileKeyboard() {
  const active = ref(window.matchMedia('(pointer: coarse)').matches)

  let listening = false

  // 只拦默认行为，不抢焦点：键盘收起是因为焦点被移走了，所以对着非可编辑元素
  // preventDefault 一下，焦点原地不动、键盘不落。
  // 只挡 mousedown、不挡 pointerdown：挡 pointerdown 会把兼容的 click 一起吞掉，
  // 「运行全部」「添加样例」这些按钮就点不动了；挡 mousedown 只阻止焦点转移，click 照常。
  // 也只用 preventDefault、不用 stopPropagation：Monaco 的聚焦是它自己在 mousedown
  // 里主动 focus()，不受默认行为影响，轻点编辑器该弹键盘还是照弹。
  function onMouseDown(event) {
    const node = event.target
    if (!(node instanceof Element)) return
    if (node.closest(EDITABLE)) return
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
  }

  onMounted(() => {
    if (active.value) start()
  })
  onBeforeUnmount(stop)

  return { active }
}