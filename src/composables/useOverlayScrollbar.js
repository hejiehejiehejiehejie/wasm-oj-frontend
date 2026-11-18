/**
 * useOverlayScrollbar —— 覆盖式滚动条：不占宽度、浮在内容之上、滚动时才淡入。
 *
 * 【要解决的】原生滚动条是**占位**的：它一出现就从内容里挖掉一条（base.css 里是 11px），
 * 于是内容跟着变窄，滚回去又跳回来 —— 窄侧栏里这一下尤其显眼。这里把原生滚动条藏掉
 * （调用方在自己的 scoped 里补 `scrollbar-width: none` + `::-webkit-scrollbar { width: 0 }`），
 * 改用一条挂在 `body` 上的 `position: fixed` 自绘滑块：浮在内容之上、不触发布局，
 * 只在滚动时淡入，停下 HIDE_DELAY 之后淡出。样式在 base.css（颜色走 `--scrollbar-thumb*`）。
 *
 * 【为什么挂 body，而不是塞进组件里】塞进被滚动的那个元素里，它会跟着内容一起滚；
 * 塞进它的父元素，又要求那个父元素变成定位上下文，还得保证 Vue 在 patch 时不会把我们
 * 插进去的节点当成自己渲染的。fixed + 逐帧写 left/top 没有这两个包袱，代价是每帧要读一次
 * `getBoundingClientRect()` —— 这圈 rAF 只在滑块可见的那一小段时间里跑，停下来即停。
 *
 * 【几何怎么算】track = clientHeight、content = scrollHeight；滑块长 = track × clientHeight / content，
 * 下限 MIN_THUMB（几千行的树里滑块会细成一根线，给个下限才抓得住）；
 * 位置 = scrollTop 在 [0, content − clientHeight] 上的比例，映射到 [0, track − 滑块长]。
 *
 * 【什么时候重算】① 滚动；② 容器尺寸变化（ResizeObserver）；③ 滑块可见期间逐帧。
 * 内容高度变了却没人滚（比如折叠一张用例卡）时滑块本来就是隐藏的，不必为它挂 MutationObserver
 * —— 真正要紧的是「可见期间不许错位」，那正是 ③ 管的。
 *
 * 【滑块不是纯指示灯】pointerdown 起手 + setPointerCapture 接管，位移按同一条比例换回 scrollTop。
 * 拖拽期间不淡出（dragging 挡住 scheduleHide），指针悬在滑块上同理。
 *
 * @param {import('vue').Ref<HTMLElement|null>} elRef 滚动容器的模板 ref（它自己必须能滚）
 */
import { onBeforeUnmount, onMounted, watch } from 'vue'

/** 停止滚动后多久淡出（ms）—— 与 VS Code 的 1s 同量级，稍快一点 */
const HIDE_DELAY = 800
/** 滑块最短长度（px） */
const MIN_THUMB = 20
/** 滑块与容器**右缘**的留白（px）：2026-10-13 由 3px 收到 1px —— 按要求往边线再靠一点 */
const EDGE_INSET_X = 1
/** 滑块与容器**上 / 下缘**的留白（px）：留着这 3px，滑块压不到行的悬停底色 */
const EDGE_INSET_Y = 3

export function useOverlayScrollbar(elRef) {
  let el = null
  let thumb = null
  let ro = null
  let rafId = 0
  let looping = false
  let visible = false
  let hovering = false
  let dragging = false
  let hideTimer = 0
  let dragY = 0
  let dragTop = 0
  let dragScale = 0
  // 上一帧写进去的几何，三样都一样就跳过写——省掉每帧的样式失效
  let lastKey = ''

  /** 量一次几何；没有溢出（或容器整个不可见）时返回 null */
  function measure() {
    const view = el.clientHeight
    const content = el.scrollHeight
    if (view <= 0 || content - view <= 1) return null
    const track = view - EDGE_INSET_Y * 2
    const size = Math.max(MIN_THUMB, Math.round((track * view) / content))
    return { size, maxTop: Math.max(0, track - size), scrollable: content - view }
  }

  /** 重新量、重新摆；不可滚时就地藏掉。返回「现在能不能滚」 */
  function update() {
    if (!el || !thumb) return false
    const m = measure()
    const rect = m ? el.getBoundingClientRect() : null
    if (!m || !rect.width || !rect.height) {
      setVisible(false)
      return false
    }
    const top = m.maxTop > 0 ? Math.round((el.scrollTop / m.scrollable) * m.maxTop) : 0
    const left = Math.round(rect.right - thumb.offsetWidth - EDGE_INSET_X)
    const y = Math.round(rect.top + EDGE_INSET_Y + top)
    const key = `${left}|${y}|${m.size}`
    if (key !== lastKey) {
      lastKey = key
      thumb.style.left = `${left}px`
      thumb.style.top = `${y}px`
      thumb.style.height = `${m.size}px`
    }
    return true
  }

  function startLoop() {
    if (looping) return
    looping = true
    rafId = requestAnimationFrame(tick)
  }

  function stopLoop() {
    looping = false
    if (rafId) cancelAnimationFrame(rafId)
    rafId = 0
  }

  function tick() {
    rafId = 0
    if (!looping) return
    update()
    // update 里可能已经把自己藏了（内容不再溢出），那时 looping 已经被放掉
    if (looping) rafId = requestAnimationFrame(tick)
  }

  function setVisible(on) {
    if (!thumb || on === visible) return
    visible = on
    thumb.classList.toggle('is-visible', on)
    if (on) startLoop()
    else stopLoop()
  }

  function scheduleHide() {
    clearTimeout(hideTimer)
    if (dragging || hovering) return
    hideTimer = setTimeout(() => setVisible(false), HIDE_DELAY)
  }

  /** 滚动中的每一帧都走这里：量一次、显示、把淡出往后推 */
  function show() {
    if (!update()) return
    setVisible(true)
    scheduleHide()
  }

  /* ---------------------------------------------------------------- 拖动
     起手就 setPointerCapture：指针移出这 8px 宽的滑块也照收事件，
     不必往 window 上挂一堆临时监听（松手时也不用担心漏摘）。 */
  function onThumbDown(event) {
    if (event.button !== 0) return
    event.preventDefault()
    const m = measure()
    if (!m) return
    dragging = true
    clearTimeout(hideTimer)
    dragY = event.clientY
    dragTop = el.scrollTop
    dragScale = m.maxTop > 0 ? m.scrollable / m.maxTop : 0
    thumb.classList.add('is-dragging')
    thumb.setPointerCapture(event.pointerId)
  }

  function onThumbMove(event) {
    if (!dragging) return
    el.scrollTop = dragTop + (event.clientY - dragY) * dragScale
  }

  function onThumbUp(event) {
    if (!dragging) return
    dragging = false
    thumb.classList.remove('is-dragging')
    if (thumb.hasPointerCapture(event.pointerId)) thumb.releasePointerCapture(event.pointerId)
    scheduleHide()
  }

  function onThumbEnter() {
    hovering = true
    clearTimeout(hideTimer)
  }

  function onThumbLeave() {
    hovering = false
    scheduleHide()
  }

  /**
   * 挂到一个滚动容器上：造滑块、挂监听、量一次。
   *
   * 2026-11-19 起这套动作被 `bind` / `unbind` 包起来，由下面那条 watch 在**容器换人**时
   * 重新跑一遍：样例栏有两种视图（卡片流 / 分项标签），两者的滚动所有者不是同一个元素
   * （`.cases` 与 `.case-viewport`），来回切的时候模板 ref 指向的节点会被整个换掉。
   * 原来只在 onMounted 里绑一次 —— 切过去再切回来，滑块就永久留在第一个容器上了。
   * 资源管理器那边传的是稳定 ref，watch 不触发，行为与改前完全一样。
   */
  function bind(next) {
    el = next
    if (!el) return

    thumb = document.createElement('div')
    thumb.className = 'oscroll-thumb'
    // 纯装饰：屏幕阅读器与 Tab 顺序都不该认它
    thumb.setAttribute('aria-hidden', 'true')
    // 哪个滑块属于哪个滚动容器 —— 同一页面上会同时存在好几条（资源树一条、用例列表一条），
    // 排查与自动化断言都得有办法指名道姓，光靠 DOM 顺序容易认错人
    thumb.dataset.oscrollFor = el.id || el.classList[0] || 'anon'
    document.body.appendChild(thumb)

    el.addEventListener('scroll', show, { passive: true })
    thumb.addEventListener('pointerdown', onThumbDown)
    thumb.addEventListener('pointermove', onThumbMove)
    thumb.addEventListener('pointerup', onThumbUp)
    thumb.addEventListener('pointercancel', onThumbUp)
    thumb.addEventListener('pointerenter', onThumbEnter)
    thumb.addEventListener('pointerleave', onThumbLeave)

    ro = new ResizeObserver(() => update())
    ro.observe(el)
    update()
  }

  /** 摘干净，允许再次 bind。旧滑块整个删掉重造：它的几何与 key 都是上一个容器的 */
  function unbind() {
    clearTimeout(hideTimer)
    stopLoop()
    ro?.disconnect()
    ro = null
    el?.removeEventListener('scroll', show)
    thumb?.remove()
    el = null
    thumb = null
    lastKey = ''
    visible = false
    hovering = false
    dragging = false
  }

  onMounted(() => bind(elRef.value))

  // flush: 'post' —— 等 DOM patch 完、新节点已经在文档里再量，否则拿到的是 null 或旧盒子
  watch(elRef, (next) => {
    unbind()
    bind(next)
  }, { flush: 'post' })

  onBeforeUnmount(unbind)
}
