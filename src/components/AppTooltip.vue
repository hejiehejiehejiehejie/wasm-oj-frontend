<script setup>
import { nextTick, onBeforeUnmount, ref } from 'vue'
import { isHoverable } from '../services/hoverCapability.js'

/**
 * 轻量提示框：包住触发元素，悬停 / 键盘聚焦后在它正上方弹一枚无边框的深色气泡。
 *
 * 为什么不用原生 title（2026-10-24 晚，用户要求）：原生提示框带一圈灰色实体边框、
 * 底色跟着系统走，在深色界面里像一块贴上去的系统控件；而且位置由浏览器决定，
 * 经常偏到触发元素左侧。这里自己画：近黑底 + 柔和投影 + 水平居中于触发元素。
 *
 * 为什么 Teleport 到 body：评测样例面板 .cases 是 overflow-y: auto，气泡留在卡片里
 * 会被滚动容器裁掉；挂到 body 才能真浮起来。
 *
 * 定位匣是**可视视口**（与 usePopoverLayer 同一口径，理由见那里）：软键盘弹起时
 * window.innerHeight 不变，拿它当匣会让气泡停到键盘底下。默认在上方，
 * 上方放不下就翻到下方，左右夹进视口。
 *
 * 【触屏不弹】（2026-11-09，用户报「触屏点击运行单个样例的按钮之后，会出现一个悬浮的提示」）
 * 手指抬起之后浏览器会补一串**兼容鼠标事件**，mouseover / mouseenter 都在其中 —— 于是轻点
 * 一下 ▶ 就被当成「悬停」，排出 300ms 后的气泡，而它要一直挂到下一次按下别处才被
 * pointerdown 收掉。触屏上压根没有「悬停」这个动作，这枚气泡永远不是用户要的。
 * 判据是 services/hoverCapability.js 的 `isHoverable()` —— 与 `<html>` 上的 `is-hoverable`
 * 同一个值：手指按下当刻为假、真鼠标划过又回真。
 * ⚠️ 别换成 `matchMedia('(hover: hover)')`：设备级判据挡不住「触屏本 / 手机开桌面版」
 * 上补出来的那串鼠标事件，理由见那个文件头。也**别把键盘那条一起挡掉**：它由
 * `:focus-visible` 把关（触屏轻点不会命中），是纯粹的无障碍通路。
 */
const props = defineProps({
  text: { type: String, default: '' },
  /** 悬停多久才弹（毫秒）。键盘聚焦立即弹，不受它影响 */
  delay: { type: Number, default: 300 },
  /** 与触发元素、视口边缘的间隙 */
  gap: { type: Number, default: 8 },
})

const trigger = ref(null)
const bubble = ref(null)
const visible = ref(false)
// 量到尺寸之前不显形，否则会先在左上角闪一下再跳到触发元素上方
const ready = ref(false)
const position = ref({ left: '0px', top: '0px' })

let timer = null
let listening = false

function clearTimer() {
  if (timer === null) return
  window.clearTimeout(timer)
  timer = null
}

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

async function place() {
  await nextTick()
  const el = bubble.value
  const anchor = trigger.value
  if (!el || !anchor) return
  const a = anchor.getBoundingClientRect()
  const b = el.getBoundingClientRect()
  const box = viewportBox()
  const left = Math.max(
    box.left + props.gap,
    Math.min(a.left + a.width / 2 - b.width / 2, box.right - b.width - props.gap),
  )
  let top = a.top - b.height - props.gap
  if (top < box.top + props.gap) top = a.bottom + props.gap
  top = Math.max(box.top + props.gap, Math.min(top, box.bottom - b.height - props.gap))
  position.value = { left: `${Math.round(left)}px`, top: `${Math.round(top)}px` }
  ready.value = true
}

function attachWindowListeners() {
  if (listening) return
  listening = true
  // 滚动用捕获：内部滚动容器（.cases / 编辑器）滚动时也要收，scroll 不冒泡
  window.addEventListener('scroll', hide, true)
  window.addEventListener('resize', hide)
  window.addEventListener('blur', hide)
  window.addEventListener('pointerdown', hide, true)
}

function detachWindowListeners() {
  if (!listening) return
  listening = false
  window.removeEventListener('scroll', hide, true)
  window.removeEventListener('resize', hide)
  window.removeEventListener('blur', hide)
  window.removeEventListener('pointerdown', hide, true)
}

function show() {
  if (!props.text || visible.value) return
  clearTimer()
  visible.value = true
  ready.value = false
  attachWindowListeners()
  place()
}

function scheduleShow() {
  if (!props.text || visible.value) return
  // 悬停这条路要「此刻真的能悬停」：触屏轻点补出来的 mouseenter 不算（见文件头那条）
  if (!isHoverable()) return
  clearTimer()
  timer = window.setTimeout(() => {
    timer = null
    show()
  }, props.delay)
}

function hide() {
  clearTimer()
  if (!visible.value) return
  visible.value = false
  ready.value = false
  detachWindowListeners()
}

function onFocusIn(event) {
  // 只认键盘聚焦：鼠标点进来也会触发 focusin，但那一下通常紧接着要执行动作，
  // 弹提示反而碍事。:focus-visible 只在键盘（或程序化）聚焦时为真。
  if (event.target instanceof Element && event.target.matches(':focus-visible')) show()
}

onBeforeUnmount(() => {
  clearTimer()
  detachWindowListeners()
})
</script>

<template>
  <span
    ref="trigger"
    class="app-tip__trigger"
    @mouseenter="scheduleShow"
    @mouseleave="hide"
    @focusin="onFocusIn"
    @focusout="hide"
    @pointerdown="hide"
  >
    <slot />
    <Teleport to="body">
      <div
        v-if="visible"
        ref="bubble"
        class="app-tip"
        :class="{ 'is-ready': ready }"
        :style="position"
        role="tooltip"
      >
        {{ text }}
      </div>
    </Teleport>
  </span>
</template>

<style scoped>
.app-tip__trigger {
  display: inline-flex;
}

.app-tip {
  position: fixed;
  z-index: 160;
  /* 气泡只是说明书，不该挡住底下的任何点击（尤其是触发元素自己） */
  pointer-events: none;
  max-width: min(260px, calc(100vw - 16px));
  padding: 6px 9px;
  border-radius: 6px;
  font-size: 11.5px;
  line-height: 1.45;
  letter-spacing: 0.01em;
  text-align: center;
  color: var(--tooltip-text);
  background: var(--tooltip-bg);
  box-shadow: var(--tooltip-shadow);
  opacity: 0;
  transition: opacity 0.12s ease;
  overflow-wrap: break-word;
}

.app-tip.is-ready {
  opacity: 1;
}
</style>
