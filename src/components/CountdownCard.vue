<template>
  <Teleport to="body">
    <div
      v-if="countdown.open"
      class="cd-card"
      :class="{ 'is-locked': countdown.locked, 'is-dragging': dragMode === 'move' }"
      :style="cardStyle"
      role="group"
      :aria-label="t('countdown.title')"
      @pointerdown="onPointerDown"
    >
      <!-- ===== 未锁定：标题行 ===== -->
      <header v-if="!countdown.locked" class="cd-head">
        <span class="cd-dot" :class="`is-${phase}`" :title="t(`countdown.status.${phase}`)" />
        <span class="cd-title">{{ t('countdown.title') }}</span>
        <div class="cd-actions">
          <button
            v-if="phase === 'running' || phase === 'paused'"
            type="button"
            class="cd-icon"
            data-no-drag
            :title="t(phase === 'paused' ? 'countdown.resume' : 'countdown.pause')"
            :aria-label="t(phase === 'paused' ? 'countdown.resume' : 'countdown.pause')"
            @pointerdown.stop
            @click.stop="toggleCountdownPause"
          >
            <AppIcon :name="phase === 'paused' ? 'play' : 'pause'" :size="13" />
          </button>
          <button
            v-if="phase !== 'setup'"
            type="button"
            class="cd-icon is-danger"
            data-no-drag
            :title="t(phase === 'done' ? 'countdown.reset' : 'countdown.cancel')"
            :aria-label="t(phase === 'done' ? 'countdown.reset' : 'countdown.cancel')"
            @pointerdown.stop
            @click.stop="cancelCountdown"
          >
            <AppIcon :name="phase === 'done' ? 'reset' : 'stop'" :size="13" />
          </button>
          <!-- 会话动作（暂停 / 停止）与窗口动作（锁定 / 关闭）之间留一道细缝：
               四个图标同尺寸同节奏，但一眼能分出「这一组是操作计时的、那一组是操作窗口的」 -->
          <span v-if="phase !== 'setup'" class="cd-actions__sep" aria-hidden="true" />
          <button
            v-if="phase !== 'setup'"
            type="button"
            class="cd-icon"
            data-no-drag
            :title="t('countdown.lock')"
            :aria-label="t('countdown.lock')"
            @pointerdown.stop
            @click.stop="onToggleLock"
          >
            <AppIcon name="lock" :size="13" />
          </button>
          <button
            type="button"
            class="cd-icon"
            data-no-drag
            :title="t('countdown.close')"
            :aria-label="t('countdown.close')"
            @pointerdown.stop
            @click.stop="closeCountdown"
          >
            <AppIcon name="close" :size="13" />
          </button>
        </div>
      </header>

      <!-- ===== 设置时长 ===== -->
      <div v-if="!countdown.locked && phase === 'setup'" class="cd-setup" data-no-drag>
        <div class="cd-dms">
          <label>
            <input
              v-model.number="countdown.form.h"
              type="number"
              min="0"
              max="99"
              inputmode="numeric"
              @focus="$event.target.select()"
              @blur="clampCountdownForm"
            />
            <i>{{ t('countdown.hours') }}</i>
          </label>
          <span class="cd-sep">:</span>
          <label>
            <input
              v-model.number="countdown.form.m"
              type="number"
              min="0"
              max="59"
              inputmode="numeric"
              @focus="$event.target.select()"
              @blur="clampCountdownForm"
            />
            <i>{{ t('countdown.minutes') }}</i>
          </label>
          <span class="cd-sep">:</span>
          <label>
            <input
              v-model.number="countdown.form.s"
              type="number"
              min="0"
              max="59"
              inputmode="numeric"
              @focus="$event.target.select()"
              @blur="clampCountdownForm"
            />
            <i>{{ t('countdown.seconds') }}</i>
          </label>
        </div>

        <div class="cd-presets">
          <button
            v-for="preset in presets"
            :key="preset.seconds"
            type="button"
            data-no-drag
            :class="{ 'is-on': formSeconds === preset.seconds }"
            @click.stop="applyPreset(preset.seconds)"
          >
            {{ preset.label }}
          </button>
        </div>

        <button
          type="button"
          class="cd-primary"
          :disabled="formSeconds <= 0"
          data-no-drag
          @click.stop="startCountdown"
        >
          {{ t('countdown.start') }}
        </button>
      </div>

      <!-- ===== 环形 + 数字 ===== -->
      <div v-if="phase !== 'setup'" class="cd-body" :ref="setBodyEl">
        <svg
          class="cd-ring"
          :width="ringSize"
          :height="ringSize"
          :viewBox="`0 0 ${UNIT} ${UNIT}`"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="cd-arc-grad" x1="0" y1="0" x2="1" y2="1">
              <stop class="cd-stop-start" offset="0%" />
              <stop class="cd-stop-end" offset="100%" />
            </linearGradient>
          </defs>
          <circle
            class="cd-ring__track"
            :cx="UNIT / 2"
            :cy="UNIT / 2"
            :r="radius"
            fill="none"
            :stroke-width="thickness"
          />
          <circle
            class="cd-ring__value"
            :class="{ 'is-paused': phase === 'paused', 'is-done': phase === 'done' }"
            :cx="UNIT / 2"
            :cy="UNIT / 2"
            :r="radius"
            fill="none"
            :stroke-width="thickness"
            stroke-linecap="round"
            :stroke-dasharray="circumference"
            :stroke-dashoffset="dashOffset"
            :transform="`rotate(-90 ${UNIT / 2} ${UNIT / 2})`"
          />
          <circle
            v-if="headDot"
            class="cd-ring__head"
            :class="{ 'is-paused': phase === 'paused', 'is-done': phase === 'done' }"
            :cx="headDot.x"
            :cy="headDot.y"
            :r="thickness * 0.62"
          />
        </svg>

        <!-- 数字不塞进 SVG：字体渲染与本地化都交给 CSS，字号随环一起放大 -->
        <div class="cd-readout" :style="{ '--cd-size': `${readoutPx}px` }">
          <div class="cd-clock">
            <template v-if="countdown.withHours">
              <span>{{ parts.h }}</span><span class="cd-colon">:</span>
            </template>
            <span>{{ parts.m }}</span><span class="cd-colon">:</span><span>{{ parts.s }}</span>
          </div>
          <div v-if="phase === 'done'" class="cd-done">{{ t('countdown.done') }}</div>
        </div>
      </div>

      <!-- ===== 锁定态：只剩环与一颗常显解锁按钮 ===== -->
      <button
        v-if="countdown.locked"
        type="button"
        class="cd-unlock"
        :class="{ 'is-peek': fabPeek, 'is-hover': hoverNear }"
        :style="unlockStyle"
        data-no-drag
        :title="t('countdown.unlock')"
        :aria-label="t('countdown.unlock')"
        @pointerdown.stop
        @click.stop="onToggleLock"
      >
        <AppIcon name="unlock" :size="12" />
        <span>{{ t('countdown.unlockShort') }}</span>
      </button>

      <div
        v-if="!countdown.locked"
        class="cd-resize"
        data-no-drag
        @pointerdown.stop.prevent="onResizeDown"
      ></div>
    </div>
  </Teleport>
</template>

<script setup>
/**
 * CountdownCard —— 全站悬浮倒计时卡（演示版 ellipse-demo 的移植）。
 *
 * 【与演示版的差别】
 * - 圆环改成纯 SVG 自绘（stroke-dasharray / dashoffset），不再依赖 vue-ellipse-progress；
 * - 颜色一律走 base.css 的变量，深 / 浅两套主题自动成立；
 * - 状态与计时在 services/countdown.js（单例 + 持久化），组件只负责画与手势；
 * - 文案走 i18n，中英两栏；
 * - 几何量存设计 px，渲染处过 px() —— 与全站 UI 缩放同一套口径，拖拽时把物理位移
 *   除以当前倍数再落盘，换档位后卡片按同一比例长大。
 *
 * 【为什么数字不塞进 SVG】SVG 文本不吃 rem / 字体回退链，字号还得手算 baseline；
 * 用绝对定位的 DOM 盖在环心，居中与字距都交给 CSS。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import { t } from '../i18n/index.js'
import { px, uiScale } from '../composables/useUiScale.js'
import {
  COUNTDOWN_MIN_H,
  COUNTDOWN_MIN_W,
  cancelCountdown,
  clampCountdownBox,
  clampCountdownForm,
  closeCountdown,
  countdown,
  countdownFormSeconds as formSeconds,
  countdownParts as parts,
  countdownProgress as progress,
  startCountdown,
  toggleCountdownLock,
  toggleCountdownPause,
} from '../services/countdown.js'

const phase = computed(() => countdown.phase)

const presets = computed(() => [
  { seconds: 300, label: t('countdown.preset.minutes', { n: 5 }) },
  { seconds: 600, label: t('countdown.preset.minutes', { n: 10 }) },
  { seconds: 1800, label: t('countdown.preset.minutes', { n: 30 }) },
  { seconds: 3600, label: t('countdown.preset.hour') },
])

function applyPreset(seconds) {
  countdown.form.h = Math.floor(seconds / 3600)
  countdown.form.m = Math.floor((seconds % 3600) / 60)
  countdown.form.s = seconds % 60
}

// ---------------------------------------------------------------- 几何
const UNIT = 100

const ringSize = ref(0)
const bodyEl = ref(null)
let observer = null

function measureRing() {
  const el = bodyEl.value
  if (!el) return
  // clientWidth / clientHeight 含 padding，这一层没有内边距，正好就是可用方框
  const side = Math.min(el.clientWidth, el.clientHeight)
  ringSize.value = Math.max(56, Math.round(side - 2))
}

function setBodyEl(el) {
  observer?.disconnect()
  observer = null
  bodyEl.value = el
  if (!el) {
    ringSize.value = 0
    return
  }
  observer = new ResizeObserver(measureRing)
  observer.observe(el)
  measureRing()
}

/** 线宽按环径的比例走，并夹在一个「看得见但不糊成圈」的区间里（换算成 viewBox 单位） */
const thickness = computed(() => {
  // 首帧量到 0 时不画：比例公式会把线宽放大到几百，半径变成负数（SVG 会报错）
  if (ringSize.value <= 0) return 0
  const size = ringSize.value
  const min = (8 / size) * UNIT
  const max = (36 / size) * UNIT
  return Math.min(max, Math.max(min, 6.2))
})

/**
 * 环外必须留出的余量（viewBox 单位）。
 *
 * 圆环本体按「外沿刚好贴到 viewBox 边」画是不行的：弧头那颗圆点的半径、以及它的
 * drop-shadow（1.5 CSS px，随环径换算成用户单位）都落在圆周之外，SVG 根元素默认
 * overflow: hidden 会把它们切平 —— 弧头走到 12 点附近时能看见圆点被削掉一块。
 * 这里把圆点半径 + 发光 + 半像素余量一起让出来，环与光晕就都留在框内。
 */
const haloPad = computed(() => {
  if (ringSize.value <= 0) return 0
  return thickness.value * 0.62 + (1.5 * UNIT) / ringSize.value + 0.5
})

const radius = computed(() =>
  Math.max(UNIT * 0.1, UNIT / 2 - thickness.value / 2 - haloPad.value),
)
const circumference = computed(() => 2 * Math.PI * radius.value)

const dashOffset = computed(() => circumference.value * (1 - progress.value / 100))

const unlockStyle = computed(() => ({ top: `${px(10)}px` }))

/** 弧头那颗小圆点（进度为 0 时不画，免得停在十二点误导成「刚开始」） */
const headDot = computed(() => {
  if (progress.value <= 0 || progress.value >= 100) return null
  const angle = (progress.value / 100) * Math.PI * 2 - Math.PI / 2
  return {
    x: UNIT / 2 + radius.value * Math.cos(angle),
    y: UNIT / 2 + radius.value * Math.sin(angle),
  }
})

/** 环心数字：只有 分:秒 时放大一档，避免环心显空 */
const readoutPx = computed(() => {
  const base = countdown.withHours ? 0.16 : 0.2
  return Math.max(12, Math.round(ringSize.value * base))
})

const cardStyle = computed(() => {
  const x = countdown.x ?? 24
  const y = countdown.y ?? 24
  return {
    left: `${px(x)}px`,
    top: `${px(y)}px`,
    width: `${px(countdown.w)}px`,
    height: `${px(countdown.h)}px`,
  }
})

// ---------------------------------------------------------------- 拖拽 / 缩放 / 触屏手势
/* 单指（或鼠标）拖动移动、双指捏合缩放、双击环心暂停 / 继续。
   所有指针按 pointerId 记账：第二根手指落下就切到 pinch，任一根抬起即收手。
   触屏的 tap 在 pointerup 里自己判 —— 触屏上 click / dblclick 的时序不可靠，
   而且拖动与点击共用同一次 pointerdown。 */
const dragMode = ref(null)
let origin = null
let pinchOrigin = null
const pointers = new Map()
let ringTapAt = 0
let ringTapX = 0
let ringTapY = 0

const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max))

/** 第二根手指落下：记下双指距离与中点，后续按比例缩放 */
function beginPinch() {
  const [a, b] = [...pointers.values()]
  const dist = Math.hypot(a.x - b.x, a.y - b.y)
  if (dist < 16) return

  const left = px(countdown.x ?? 0)
  const top = px(countdown.y ?? 0)
  const cx = (a.x + b.x) / 2
  const cy = (a.y + b.y) / 2

  pinchOrigin = {
    dist,
    w: countdown.w,
    h: countdown.h,
    // 双指中点在卡片里的相对位置（0–1）：缩放时这个点按住不动
    fx: clamp((cx - left) / px(countdown.w), 0, 1),
    fy: clamp((cy - top) / px(countdown.h), 0, 1),
    cx,
    cy,
  }
  dragMode.value = 'pinch'
  origin = null
}

function onPointerDown(event) {
  if (countdown.locked || event.button !== 0) return
  if (event.target.closest('[data-no-drag]')) return

  pointers.set(event.pointerId, {
    x: event.clientX,
    y: event.clientY,
    inRing: Boolean(event.target.closest('.cd-body')),
    pointerType: event.pointerType,
    time: performance.now(),
  })

  if (pointers.size >= 2) {
    beginPinch()
  } else {
    dragMode.value = 'move'
    origin = { px: event.clientX, py: event.clientY, x: countdown.x, y: countdown.y }
  }

  document.body.style.cursor = dragMode.value === 'pinch' ? 'nwse-resize' : 'grabbing'
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', stopDrag)
  window.addEventListener('pointercancel', stopDrag)
  event.preventDefault()
}

function onResizeDown(event) {
  if (countdown.locked) return
  dragMode.value = 'resize'
  origin = {
    px: event.clientX,
    py: event.clientY,
    w: countdown.w,
    h: countdown.h,
  }
  document.body.style.cursor = 'nwse-resize'
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', stopDrag)
  window.addEventListener('pointercancel', stopDrag)
}

function onPointerMove(event) {
  const tracked = pointers.get(event.pointerId)
  if (tracked) {
    tracked.x = event.clientX
    tracked.y = event.clientY
  }

  const scale = uiScale.value || 1

  if (dragMode.value === 'pinch') {
    if (!pinchOrigin || pointers.size < 2) return
    const [a, b] = [...pointers.values()]
    const ratio = Math.hypot(a.x - b.x, a.y - b.y) / pinchOrigin.dist
    const w = clamp(pinchOrigin.w * ratio, COUNTDOWN_MIN_W, (window.innerWidth - 16) / scale)
    const h = clamp(pinchOrigin.h * ratio, COUNTDOWN_MIN_H, (window.innerHeight - 16) / scale)

    countdown.w = w
    countdown.h = h
    // 以双指中点为锚：中点不动，卡片朝四周长大 / 收小
    countdown.x = clamp(
      (pinchOrigin.cx - pinchOrigin.fx * px(w)) / scale,
      -w + 80 / scale,
      (window.innerWidth - 80) / scale,
    )
    countdown.y = clamp(
      (pinchOrigin.cy - pinchOrigin.fy * px(h)) / scale,
      0,
      (window.innerHeight - 44) / scale,
    )
    return
  }

  if (!origin) return
  // 指针位移是物理 px，存档是设计 px —— 这里除以倍数，卡片才跟手
  const dx = (event.clientX - origin.px) / scale
  const dy = (event.clientY - origin.py) / scale

  if (dragMode.value === 'move') {
    countdown.x = clamp(origin.x + dx, -countdown.w + 80 / scale, (window.innerWidth - 80) / scale)
    countdown.y = clamp(origin.y + dy, 0, (window.innerHeight - 44) / scale)
  } else if (dragMode.value === 'resize') {
    countdown.w = clamp(
      origin.w + dx,
      COUNTDOWN_MIN_W,
      (window.innerWidth - px(countdown.x) - 8) / scale,
    )
    countdown.h = clamp(
      origin.h + dy,
      COUNTDOWN_MIN_H,
      (window.innerHeight - px(countdown.y) - 8) / scale,
    )
  }
}

/** 双击环心：暂停 / 继续。两击间隔 320ms、落点相距 24px 以内才算 */
function registerRingTap(x, y) {
  const now = performance.now()
  if (now - ringTapAt <= 320 && Math.hypot(x - ringTapX, y - ringTapY) <= 24) {
    ringTapAt = 0
    toggleCountdownPause()
    return
  }
  ringTapAt = now
  ringTapX = x
  ringTapY = y
}

function stopDrag(event) {
  const start = event ? pointers.get(event.pointerId) : null
  if (event) pointers.delete(event.pointerId)

  // 触屏轻点：没有第二根手指、没离开原地、时间够短、并且落在环区
  const isTap =
    event?.type === 'pointerup' &&
    pointers.size === 0 &&
    dragMode.value === 'move' &&
    start &&
    start.pointerType !== 'mouse' &&
    start.inRing &&
    performance.now() - start.time < 300 &&
    Math.hypot(event.clientX - start.x, event.clientY - start.y) < 8 &&
    (phase.value === 'running' || phase.value === 'paused')

  if (origin || pinchOrigin) clampCountdownBox()
  dragMode.value = null
  origin = null
  pinchOrigin = null
  pointers.clear()
  document.body.style.cursor = ''
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', stopDrag)
  window.removeEventListener('pointercancel', stopDrag)

  if (isTap) registerRingTap(event.clientX, event.clientY)
}

// ---------------------------------------------------------------- 锁定态提示
/* 锁定后整卡 pointer-events: none，拿不到 :hover，所以用 window 的 pointermove
   判断指针是否落进卡片矩形 —— 与演示版同一种做法 */
const hoverNear = ref(false)
const HOVER_PAD = 10

function onWindowPointerMove(event) {
  if (!countdown.locked) {
    if (hoverNear.value) hoverNear.value = false
    return
  }
  const left = px(countdown.x ?? 0)
  const top = px(countdown.y ?? 0)
  const right = left + px(countdown.w)
  const bottom = top + px(countdown.h)
  hoverNear.value =
    event.clientX >= left - HOVER_PAD &&
    event.clientX <= right + HOVER_PAD &&
    event.clientY >= top - HOVER_PAD &&
    event.clientY <= bottom + HOVER_PAD
}

const fabPeek = ref(false)
let peekTimer = 0

// 锁定那一刻短暂自亮一次，好让人知道解锁胶囊在哪
const stopPeek = () => window.clearTimeout(peekTimer)
const startPeek = () => {
  fabPeek.value = true
  stopPeek()
  peekTimer = window.setTimeout(() => (fabPeek.value = false), 1500)
}

function onToggleLock() {
  stopDrag()
  toggleCountdownLock()
  if (countdown.locked) {
    startPeek()
  } else {
    stopPeek()
    fabPeek.value = false
    hoverNear.value = false
  }
}

onMounted(() => {
  // 冷启动就恢复上次打开状态的卡：视口可能变了（换屏 / 转屏 / 改缩放），先收回可视区
  if (countdown.open) clampCountdownBox()
  window.addEventListener('pointermove', onWindowPointerMove, { passive: true })
})
onBeforeUnmount(() => {
  stopPeek()
  observer?.disconnect()
  window.removeEventListener('pointermove', onWindowPointerMove)
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', stopDrag)
  window.removeEventListener('pointercancel', stopDrag)
  document.body.style.cursor = ''
})
</script>

<style scoped>
/* 几何：位置与尺寸由脚本按设计 px 写在内联样式上（已乘缩放倍数）；
   下面所有 px 走 postcss-pxtorem，与卡片一起等比放大。
   颜色只引用 base.css 变量，两套主题自动成立。 */
.cd-card {
  position: fixed;
  z-index: 110;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  /* 顶部收窄（2026-10-26）：页头那行（圆点 + 标题 + 关闭）要贴近窗口顶，
     14px 的顶 padding 让标题离顶足有 40px。先收到 6px 用户说「太靠上了」，
     回到 10px 折中。左右与底部保持原值 —— 设置区三行控件贴边会挤，
     那是当初加宽 padding 的理由，别一起动 */
  padding: 10px 16px 12px;
  /* 不画实线边框：边界交给 --cd-shadow 的大范围柔影。
     深色主题阴影分不出层次，所以在同一支里垫一圈 4% 白的极淡描边（见 base.css） */
  border: 0;
  /* 2026-10-25 用户要求「圆角改为 10px」（原 16px）。整卡裁切靠这条 + 下面的 overflow: hidden，
     改它会连带改变环与弧头光点的可用内框，别和内部控件的 10px 混为一谈 */
  border-radius: 10px;
  /* 2026-10-24 凌晨用户要求「提高倒计时组件窗口的透明度」，并在「纯半透明」与
     「半透明 + 背景模糊」里选了后者：底色走 --cd-bg（70% 不透明），背后的代码在这里
     糊掉再透上来。模糊半径刻意写在组件里而不是 base.css —— 它是这支卡的观感参数，
     与色值分开调。2026-10-21 那轮「不透明 + 不模糊」的口径已被用户本轮推翻。 */
  background: var(--cd-bg);
  /* 只写标准属性，**不要补 -webkit- 前缀**（2026-10-26）：构建期 Lightning CSS 遇到
     「标准 + 前缀」成对出现时只保留前缀那条，而 Chrome 141 起已移除
     `-webkit-backdrop-filter` 别名 —— 线上产物于是整条失效，磨砂没了、
     卡片看起来比本地「透明」得多。标准属性 Chrome 76+ / Firefox 103+ /
     Safari 18+ 都认，前缀没有存在的意义。EditorPane / NotificationCenter 同批改。 */
  backdrop-filter: blur(14px);
  box-shadow: var(--cd-shadow);
  /* 圆角边之外一律不画：环、弧头光点、解锁胶囊再怎么变，都不会漏到边框外面 */
  overflow: hidden;
  color: var(--text);
  font-family: var(--ui-font);
  user-select: none;
  cursor: grab;
  touch-action: none;
}

.cd-card.is-dragging {
  cursor: grabbing;
}

/* 锁定：外框整个消失，只剩环本身，点击穿透到下面的页面。
   头部槽位保留（透明、不可见），否则环会突然长大一圈、和锁定前对不上。 */
.cd-card.is-locked {
  background: transparent;
  /* 整卡透明之后模糊也必须一起关：否则只剩环的那块矩形区域仍会把背后的代码糊出来，
     凭空多出一块磨砂方斑 */
  backdrop-filter: none;
  box-shadow: none;
  cursor: default;
  pointer-events: none;
}

.cd-card.is-locked::before {
  content: '';
  flex: none;
  height: 26px;
}

/* ---------------------------------------------------------------- 头部 */
.cd-head {
  display: flex;
  align-items: center;
  gap: 7px;
  flex: none;
  height: 26px;
}

.cd-dot {
  width: 7px;
  height: 7px;
  flex: none;
  border-radius: 50%;
  background: var(--text-faint);
}

.cd-dot.is-running {
  background: var(--ok);
  box-shadow: 0 0 3px var(--ok);
  animation: cd-pulse 2s ease-in-out infinite;
}

.cd-dot.is-paused {
  background: var(--warn);
}

.cd-dot.is-done {
  background: var(--fail);
}

@keyframes cd-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}

.cd-title {
  font-size: 12px;
  color: var(--text-dim);
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.cd-actions {
  display: flex;
  align-items: center;
  gap: 1px;
  flex: none;
  margin-left: auto;
}

/* 两组动作之间的细缝：比按钮间距略宽，但比真正的分隔线轻 */
.cd-actions__sep {
  flex: none;
  width: 1px;
  height: 12px;
  margin: 0 3px;
  background: var(--border);
}

.cd-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  transition: color 0.16s ease, background-color 0.16s ease;
}

:where(html.is-hoverable) .cd-icon:hover {
  color: var(--text);
  background: var(--bg-hover);
}

:where(html.is-hoverable) .cd-icon.is-danger:hover {
  color: var(--fail);
  background: var(--danger-bg);
}

.cd-icon:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
}

/* ---------------------------------------------------------------- 设置时长 */
.cd-setup {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 14px;
  min-height: 0;
}

/* 三行同宽：时长输入、预设、开始按钮左右对齐，卡片中线不再有「中间窄、底下宽」的错位 */
.cd-dms {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: 8px;
  width: 100%;
}

.cd-dms label {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  align-items: center;
  /* 单位贴着数字：1px 是「同一组」的距离，再大就又变成两行了 */
  gap: 1px;
}

/* 浅色给一层无描边的浅实底；深色那支是 transparent —— 数字直接浮在卡面上，
   色块一去掉，这块就没有「组件库表单」的厚重感了。数字放大、字重降到 500：
   等宽字体笔画本来就匀，600 以上会显笨 */
.cd-dms input {
  width: 100%;
  height: 40px;
  padding: 0;
  text-align: center;
  border: 0;
  border-radius: 10px;
  background: var(--cd-field-bg);
  color: var(--text);
  font-family: var(--mono-font);
  font-size: 20px;
  font-weight: 500;
  letter-spacing: 0.01em;
  font-variant-numeric: tabular-nums;
  outline: none;
  transition: background-color 0.16s ease, box-shadow 0.16s ease;
  -moz-appearance: textfield;
}

/* 深色没有底色块撑着，数字再大一档，读起来才像仪表盘 */
html[data-scheme='dark'] .cd-dms input {
  font-size: 22px;
}

.cd-dms input::-webkit-outer-spin-button,
.cd-dms input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

/* 获焦也不回实线：底色提亮一点 + 一圈 1px 内描边（焦点必须看得见） */
.cd-dms input:focus {
  background: var(--cd-field-focus-bg);
  box-shadow: inset 0 0 0 1px var(--focus), 0 0 0 3px var(--focus-ring);
}

.cd-dms i {
  font-style: normal;
  font-size: 10px;
  letter-spacing: 0.06em;
  line-height: 1;
  color: var(--cd-label);
}

/* 冒号与输入框同高、垂直居中：不再靠 padding-top 猜基线 */
.cd-sep {
  display: flex;
  align-items: center;
  height: 40px;
  color: var(--cd-label);
  font-family: var(--mono-font);
  font-size: 16px;
}

.cd-presets {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  width: 100%;
}

/* 圆角矩形 + 无描边：未选中是比卡片底色深一档的灰面，选中的那枚只换「淡色面 + 彩字」，
   不再靠蓝线框标记（线框一多，整块设置区就碎了）。圆角与输入框 / 主按钮同一档 10px
   （2026-10-24 起全站禁用胶囊形，见 HANDOFF 第 1 节） */
.cd-presets button {
  height: 28px;
  padding: 0 4px;
  border: 0;
  border-radius: 10px;
  background: var(--cd-chip-bg);
  color: var(--text-dim);
  font-family: inherit;
  font-size: 11px;
  white-space: nowrap;
  cursor: pointer;
  transition: color 0.16s ease, background-color 0.16s ease;
}

:where(html.is-hoverable) .cd-presets button:hover {
  color: var(--text);
  background: var(--cd-chip-hover);
}

/* 与当前时长一致的那一枚：给出「这档已经选上了」的落点 */
.cd-presets button.is-on {
  color: var(--cd-chip-on-text);
  background: var(--cd-chip-on-bg);
  font-weight: 600;
}

/* 主按钮浅色用深藏青、深色用主题蓝：既压得住整块轻量控件，又不像近白面那样刺眼；
   圆角跟输入框同一档，不再用按钮自己的一套 */
.cd-primary {
  height: 38px;
  border: 0;
  border-radius: 10px;
  background: var(--cd-primary-bg);
  color: var(--cd-primary-text);
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition: background-color 0.16s ease;
}

:where(html.is-hoverable) .cd-primary:hover:not(:disabled) {
  background: var(--cd-primary-hover);
}

.cd-primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ---------------------------------------------------------------- 环形 */
.cd-body {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  transition: opacity 0.18s ease;
}

/* 锁定后内容退到六成：卡片让出视线，但读数还能瞥见；
   解锁胶囊是兄弟节点，不跟着变淡 */
.cd-card.is-locked .cd-body {
  opacity: 0.6;
}

.cd-ring {
  display: block;
  flex: none;
}

.cd-ring__track {
  stroke: var(--bg-control);
}

.cd-ring__value {
  stroke: url(#cd-arc-grad);
  transition: stroke-dashoffset 0.25s linear;
}

.cd-ring__value.is-paused {
  stroke: var(--warn);
}

.cd-ring__value.is-done {
  stroke: var(--fail);
}

.cd-stop-start {
  stop-color: var(--accent-strong);
}

.cd-stop-end {
  stop-color: var(--info);
}

.cd-ring__head {
  fill: var(--info);
  filter: drop-shadow(0 0 1.5px var(--info));
}

.cd-ring__head.is-paused {
  fill: var(--warn);
  filter: none;
}

.cd-ring__head.is-done {
  fill: var(--fail);
  filter: none;
}

.cd-readout {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  pointer-events: none;
}

.cd-clock {
  display: flex;
  align-items: baseline;
  color: var(--text);
  font-family: var(--mono-font);
  font-size: var(--cd-size, 20px);
  font-weight: 600;
  line-height: 1;
  letter-spacing: -0.005em;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* 冒号落在基线上、字形中心比数字低，抬一点整串才看着居中 */
.cd-colon {
  position: relative;
  top: -0.13em;
  padding: 0 0.04em;
  font-size: 0.92em;
  color: var(--text-faint);
}

.cd-done {
  color: var(--fail);
  font-size: 10px;
  letter-spacing: 0.08em;
}

/* ---------------------------------------------------------------- 锁定态的解锁按钮
   圆角 10px：26px 高装得下 10+10，不落到「相邻两角之和超边长被夹成半圆」那条；
   与设置区的输入框 / 预设 / 主按钮取同一档（2026-10-24 全站禁用胶囊形）。 */
.cd-unlock {
  position: absolute;
  left: 50%;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 11px 0 8px;
  border: 1px solid var(--ok);
  border-radius: 10px;
  background: var(--bg-raised);
  box-shadow: var(--toast-shadow);
  color: var(--ok);
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  pointer-events: auto;
  opacity: 0;
  transform: translateX(-50%) scale(0.92);
  transition: opacity 0.18s ease, transform 0.18s ease, background-color 0.18s ease,
    color 0.18s ease;
}

.cd-unlock.is-hover
:where(html.is-hoverable) .cd-unlock:hover
.cd-unlock:focus-visible
.cd-unlock.is-peek {
  opacity: 1;
  transform: translateX(-50%) scale(1);
}

:where(html.is-hoverable) .cd-unlock:hover {
  background: var(--ok);
  color: var(--bg-raised);
}

.cd-unlock:focus-visible {
  outline: 2px solid var(--ok);
  outline-offset: 2px;
}

/* ---------------------------------------------------------------- 缩放手柄 */
.cd-resize {
  position: absolute;
  right: 2px;
  bottom: 2px;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
  opacity: 0;
  transition: opacity 0.18s ease;
  background: linear-gradient(
      135deg,
      transparent 44%,
      var(--text-faint) 44%,
      var(--text-faint) 52%,
      transparent 52%
    ),
    linear-gradient(
      135deg,
      transparent 62%,
      var(--text-faint) 62%,
      var(--text-faint) 70%,
      transparent 70%
    );
}

:where(html.is-hoverable) .cd-card:hover .cd-resize {
  opacity: 0.7;
}

/* 触屏设备没有 hover：手柄常显一档，单指也摸得着（双指捏合另有一套） */
@media (pointer: coarse) {
  .cd-resize {
    width: 20px;
    height: 20px;
    opacity: 0.5;
  }
}
</style>
