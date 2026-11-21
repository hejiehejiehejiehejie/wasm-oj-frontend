<script setup>
/**
 * TestsGuide —— 评测岛交互式新手引导（2026-11-21 第二版）。
 *
 * 每一步都是真机任务：固定场景 → 用户自己做手势 → 检测到状态变化后自动进入下一步。
 * 五步：① 从侧栏分出岛 → ② 拖页头换边 → ③ 拖分隔条改大小 → ④ 双击折叠
 * → ⑤ 拖浮岛换边。
 *
 * 场景只由步骤号决定（见 prepareTestsGuideScene），不看用户当前布局；每一步进入前
 * 都先把状态摆到「动作之前」，所以目标一定存在。用户乱操作导致目标消失（如第 3 步
 * 中途折叠了岛）时，1.2s 后自动复位到本步起点并提示「已复位」。
 *
 * 聚光灯只压暗、不拦指针 —— 用户必须能操作高亮目标；卡片自己可点，放在目标对侧。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { t } from '../i18n/index.js'
import {
  closeTestsGuide,
  prepareTestsGuideScene,
  TESTS_GUIDE_STEPS,
  testsGuide,
} from '../services/testsGuide.js'
import { testsLeaf, testsPaneSide, testsRail, testsSplitInfo } from '../services/editorPanes.js'

const props = defineProps({
  /** 用户是否正在拖分隔条：第 3 步要等松手后才判完成，避免拖到一半就切步 */
  resizing: { type: Boolean, default: false },
})

const STEP_KEYS = ['detach', 'move', 'resize', 'toggle', 'float']
const LAST_STEP = TESTS_GUIDE_STEPS - 1
const stepKey = computed(() => STEP_KEYS[testsGuide.step] ?? STEP_KEYS[0])
const titleKey = computed(() => `tests.guide.steps.${stepKey.value}.title`)
const textKey = computed(() => `tests.guide.steps.${stepKey.value}.text`)
const doingKey = computed(() => `tests.guide.steps.${stepKey.value}.doing`)

const rect = ref(null)
const scrims = ref([])
const cardEl = ref(null)
const cardStyle = ref({ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' })
const done = ref(false)
const notice = ref('')

/** 每步起点：换边比 side、改大小比 ratio、拖浮岛比 edge */
let baseline = { side: '', ratio: null, edge: '' }
let pollTimer = 0
let advanceTimer = 0
let noticeTimer = 0
let invalidSince = 0
/** 进入新步骤后的静置期：期间只重采基线，不判完成，避免布局收尾误触发 */
let armedUntil = 0

/** 第一步 / 第二步 / 第四步的页头：浮岛 / 底部裸轨 / 左右页头三种形态 */
function headerEl() {
  if (testsRail.floating) return document.querySelector('.tests-float')
  if (testsPaneSide() === 'bottom') return document.querySelector('.workbench__rail-head')
  return document.querySelector('.tests-pane__head')
}

/**
 * 第一步的落点：岛已在侧栏里（开场由 prepareTestsGuideScene 保证）。
 * 折叠侧栏只是把内层元素 visibility 归零、布局还在，量 rect 前必须排掉。
 */
function detachTarget() {
  const seg = document.querySelector('.sidebar-switcher__seg[data-panel="tests"]')
  if (seg && !seg.closest('.is-collapsed')) return seg
  return (
    document.querySelector('.activity-bar__item[data-panel="tests"]') ||
    document.querySelector('.activity-bar') ||
    null
  )
}

function resolveTarget() {
  const key = stepKey.value
  if (key === 'detach') return detachTarget()
  if (key === 'float') return document.querySelector('.tests-float') || headerEl()
  if (key === 'resize') {
    const info = testsSplitInfo()
    return info
      ? document.querySelector(`.editor-grid__splitter[data-split-id="${info.splitId}"]`)
      : null
  }
  return headerEl()
}

function measure() {
  if (!testsGuide.open) return
  const node = resolveTarget()
  const box = node?.getBoundingClientRect()
  if (!box || !box.width || !box.height) {
    if (rect.value) {
      rect.value = null
      scrims.value = []
    }
    return
  }
  const vw = window.innerWidth
  const vh = window.innerHeight
  const next = { top: box.top, left: box.left, width: box.width, height: box.height }
  const prev = rect.value
  const moved =
    !prev ||
    Math.abs(prev.top - next.top) > 0.5 ||
    Math.abs(prev.left - next.left) > 0.5 ||
    Math.abs(prev.width - next.width) > 0.5 ||
    Math.abs(prev.height - next.height) > 0.5
  if (!moved) return
  rect.value = next
  scrims.value = [
    { top: 0, left: 0, width: vw, height: Math.max(0, next.top) },
    {
      top: next.top + next.height,
      left: 0,
      width: vw,
      height: Math.max(0, vh - next.top - next.height),
    },
    { top: next.top, left: 0, width: Math.max(0, next.left), height: next.height },
    {
      top: next.top,
      left: next.left + next.width,
      width: Math.max(0, vw - next.left - next.width),
      height: next.height,
    },
  ]
  nextTick(placeCard)
}

/** 卡片优先落在目标下方；贴边窄目标（活动栏图标 / 浮岛 / 竖分隔条）改落侧边 */
function placeCard() {
  const el = cardEl.value
  if (!testsGuide.open || !el) return
  const r = rect.value
  if (!r) {
    cardStyle.value = { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
    return
  }
  const vw = window.innerWidth
  const vh = window.innerHeight
  const margin = 14
  const gap = 14
  const w = el.offsetWidth
  const h = el.offsetHeight
  const nearLeft = r.left < 96
  const nearRight = vw - (r.left + r.width) < 96
  const narrow = r.width < 96
  let left
  let top
  if (narrow && nearLeft) {
    left = r.left + r.width + gap
    top = r.top + r.height / 2 - h / 2
  } else if (narrow && nearRight) {
    left = r.left - w - gap
    top = r.top + r.height / 2 - h / 2
  } else {
    const below = vh - (r.top + r.height) >= h + gap + margin || r.top < h + gap + margin
    left = r.left + r.width / 2 - w / 2
    top = below ? r.top + r.height + gap : r.top - h - gap
  }
  left = Math.max(margin, Math.min(left, vw - w - margin))
  top = Math.max(margin, Math.min(top, vh - h - margin))
  cardStyle.value = {
    left: `${Math.round(left)}px`,
    top: `${Math.round(top)}px`,
    transform: 'none',
  }
}

function captureBaseline() {
  baseline = {
    side: testsPaneSide() ?? '',
    ratio: testsSplitInfo()?.ratio ?? null,
    edge: testsRail.edge ?? '',
  }
}

/** 切到某一步：先把场景摆到「动作之前」，再记基线 */
function goToStep(step) {
  clearTimeout(advanceTimer)
  const target = Math.min(LAST_STEP, Math.max(0, step))
  prepareTestsGuideScene(target)
  testsGuide.step = target
  done.value = false
  notice.value = ''
  invalidSince = 0
  armedUntil = Date.now() + 450
  captureBaseline()
  nextTick(() => {
    measure()
    placeCard()
  })
}

function stepComplete() {
  switch (testsGuide.step) {
    case 0:
      return Boolean(testsLeaf()) || testsRail.floating
    case 1:
      return Boolean(baseline.side) && testsPaneSide() !== baseline.side
    case 2: {
      if (props.resizing) return false
      const ratio = testsSplitInfo()?.ratio
      return (
        typeof ratio === 'number' &&
        baseline.ratio != null &&
        Math.abs(ratio - baseline.ratio) > 0.003
      )
    }
    case 3:
      return testsRail.floating === true
    case 4:
      return testsRail.floating && Boolean(baseline.edge) && testsRail.edge !== baseline.edge
    default:
      return false
  }
}

/** 当前步骤的目标是否还成立；不成立 1.2s 后复位 */
function stateValid() {
  if (testsGuide.step === 0) return true
  if (testsGuide.step === 4) return testsRail.floating
  return Boolean(testsLeaf()) && !testsRail.floating
}

function advance() {
  if (done.value) return
  done.value = true
  clearTimeout(advanceTimer)
  advanceTimer = window.setTimeout(() => {
    if (!testsGuide.open) return
    if (testsGuide.step >= LAST_STEP) {
      closeTestsGuide()
      return
    }
    goToStep(testsGuide.step + 1)
  }, 650)
}

function repair() {
  goToStep(testsGuide.step)
  notice.value = t('tests.guide.repaired')
  clearTimeout(noticeTimer)
  noticeTimer = window.setTimeout(() => {
    notice.value = ''
  }, 2200)
}

function tick() {
  measure()
  if (!testsGuide.open || done.value) return
  // 静置期：布局可能在开岛 / 换边 / 折叠后收尾，期间持续重采基线，不判完成
  if (Date.now() < armedUntil) {
    captureBaseline()
    return
  }
  if (stepComplete()) {
    advance()
    return
  }
  if (stateValid()) {
    invalidSince = 0
    return
  }
  if (!invalidSince) invalidSince = Date.now()
  else if (Date.now() - invalidSince > 1200) {
    invalidSince = 0
    repair()
  }
}

function skipStep() {
  if (testsGuide.step >= LAST_STEP) {
    closeTestsGuide()
    return
  }
  goToStep(testsGuide.step + 1)
}

function onKeydown(event) {
  if (event.key === 'Escape') closeTestsGuide()
}

function startPolling() {
  clearInterval(pollTimer)
  pollTimer = window.setInterval(tick, 120)
}

function stopPolling() {
  clearInterval(pollTimer)
  pollTimer = 0
}

watch(
  () => testsGuide.open,
  (open) => {
    clearTimeout(advanceTimer)
    clearTimeout(noticeTimer)
    if (open) {
      done.value = false
      notice.value = ''
      armedUntil = Date.now() + 450
      measure()
      nextTick(placeCard)
      startPolling()
      window.addEventListener('keydown', onKeydown)
    } else {
      stopPolling()
      invalidSince = 0
      rect.value = null
      scrims.value = []
      window.removeEventListener('keydown', onKeydown)
    }
  },
)

onMounted(() => {
  if (!testsGuide.open) return
  measure()
  nextTick(placeCard)
  startPolling()
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  stopPolling()
  clearTimeout(advanceTimer)
  clearTimeout(noticeTimer)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="testsGuide.open"
      class="tests-guide"
      role="dialog"
      aria-modal="false"
      :aria-label="t('tests.guide.aria')"
    >
      <div v-if="!rect" class="tests-guide__scrim tests-guide__scrim--full" aria-hidden="true"></div>
      <div
        v-for="(scrim, index) in scrims"
        :key="index"
        class="tests-guide__scrim"
        :style="{
          top: `${scrim.top}px`,
          left: `${scrim.left}px`,
          width: `${scrim.width}px`,
          height: `${scrim.height}px`,
        }"
        aria-hidden="true"
      ></div>
      <div
        v-if="rect"
        class="tests-guide__ring"
        :style="{
          top: `${rect.top}px`,
          left: `${rect.left}px`,
          width: `${rect.width}px`,
          height: `${rect.height}px`,
        }"
        aria-hidden="true"
      ></div>

      <div ref="cardEl" class="tests-guide__card" :class="{ 'is-done': done }" :style="cardStyle">
        <div class="tests-guide__meta">
          <span class="tests-guide__count">{{ testsGuide.step + 1 }} / {{ TESTS_GUIDE_STEPS }}</span>
          <span class="tests-guide__dots" aria-hidden="true">
            <i
              v-for="n in TESTS_GUIDE_STEPS"
              :key="n"
              class="tests-guide__dot"
              :class="{ 'is-on': n - 1 === testsGuide.step, 'is-past': n - 1 < testsGuide.step }"
            ></i>
          </span>
        </div>
        <p class="tests-guide__title">{{ t(titleKey) }}</p>
        <p class="tests-guide__status" :class="{ 'is-done': done, 'is-notice': notice }">
          <span class="tests-guide__signal" aria-hidden="true"></span>
          {{ done ? t('tests.guide.done') : notice || t(doingKey) }}
        </p>
        <p class="tests-guide__text">{{ t(textKey) }}</p>
        <div class="tests-guide__actions">
          <button type="button" class="tests-guide__ghost" @click="skipStep">
            {{ t('tests.guide.skipStep') }}
          </button>
          <span class="tests-guide__spacer"></span>
          <button type="button" class="tests-guide__ghost" @click="closeTestsGuide">
            {{ t('tests.guide.exit') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.tests-guide {
  position: fixed;
  inset: 0;
  z-index: 9000;
  pointer-events: none;
}

/* 压暗只负责视觉，点击继续穿透给真实界面：用户要能在高亮目标上做手势 */
.tests-guide__scrim {
  position: fixed;
  background: var(--dialog-scrim);
  pointer-events: none;
}

.tests-guide__scrim--full {
  inset: 0;
}

/* 目标外圈：1.5px 主色环 + 14% 光晕，轻微呼吸 */
.tests-guide__ring {
  position: fixed;
  border-radius: 8px;
  box-shadow:
    0 0 0 1.5px var(--accent),
    0 0 0 6px color-mix(in srgb, var(--accent) 14%, transparent);
  pointer-events: none;
  transition:
    top 0.16s ease,
    left 0.16s ease,
    width 0.16s ease,
    height 0.16s ease;
  animation: tests-guide-breathe 2.2s ease-in-out infinite;
}

@keyframes tests-guide-breathe {
  0%,
  100% {
    filter: brightness(1);
  }
  50% {
    filter: brightness(1.35);
  }
}

.tests-guide__card {
  position: fixed;
  box-sizing: border-box;
  width: 292px;
  padding: 13px 14px 11px;
  border: 1px solid var(--border-hairline);
  border-radius: 10px;
  background: var(--menu-bg);
  backdrop-filter: var(--menu-backdrop);
  box-shadow: var(--menu-shadow);
  color: var(--text);
  font-family: var(--ui-font);
  pointer-events: auto;
  transition: border-color 0.16s ease;
}

.tests-guide__card.is-done {
  border-color: color-mix(in srgb, var(--ok) 42%, transparent);
}

.tests-guide__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 7px;
}

.tests-guide__count {
  font-family: var(--mono-font);
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  color: var(--text-faint);
}

.tests-guide__dots {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.tests-guide__dot {
  width: 4px;
  height: 4px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--text-dim) 30%, transparent);
  transition:
    background-color 0.14s ease,
    width 0.14s ease;
}

.tests-guide__dot.is-past {
  background: color-mix(in srgb, var(--accent) 40%, transparent);
}

.tests-guide__dot.is-on {
  width: 12px;
  background: var(--accent);
}

.tests-guide__title {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.45;
  color: var(--text);
}

.tests-guide__text {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--text-dim);
}

/* 当前该做的动作：紧跟标题、用正文色，比下面的解释更先被读到 */
.tests-guide__status {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 6px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text);
}

.tests-guide__signal {
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: var(--accent);
  animation: tests-guide-blink 1.4s ease-in-out infinite;
}

.tests-guide__status.is-done {
  color: var(--ok);
}

.tests-guide__status.is-done .tests-guide__signal {
  background: var(--ok);
  animation: none;
}

.tests-guide__status.is-notice {
  color: var(--warn, var(--text-dim));
}

.tests-guide__status.is-notice .tests-guide__signal {
  background: var(--warn, var(--text-dim));
  animation: none;
}

@keyframes tests-guide-blink {
  0%,
  100% {
    opacity: 0.35;
  }
  50% {
    opacity: 1;
  }
}

.tests-guide__actions {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 10px;
}

.tests-guide__spacer {
  flex: 1 1 auto;
}

.tests-guide__ghost {
  height: 24px;
  padding: 0 7px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--text-dim);
  font-family: var(--ui-font);
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
}

:where(html.is-hoverable) .tests-guide__ghost:hover {
  color: var(--text);
  background: var(--icon-hover-bg);
}

@media (prefers-reduced-motion: reduce) {
  .tests-guide__ring,
  .tests-guide__signal {
    animation: none;
  }
}
</style>
