<script setup>
/**
 * TestsGuide —— 评测岛的新手引导（2026-11-21）。
 *
 * 五步，对应五种手势：
 *   ① 从侧栏分出岛 → ② 拖页头换边 → ③ 拖分隔条改大小 → ④ 双击页头折叠/展开
 *   → ⑤ 拖浮岛换边。
 * 教程是**定死的**：场景只由步骤号决定（见 prepareTestsGuideScene），不看用户当前
 * 开没开岛、岛停在哪、侧栏收没收起；播放期间遮罩挡住自由操作，结束时再还原开场状态。
 * 先改大小、后折叠：折叠会把 tests 叶摘掉，分隔条随之消失，把「改大小」放在折叠前，
 * 每一步的目标都必然存在。
 *
 * 形式是「聚光灯 + 步骤卡」：四块压暗面板围出目标的内孔，另有一层透明拦截层
 * 吃掉所有点击 —— 用户不能在中途把岛拖走 / 折叠，步骤目标不会因自由操作而失效。
 * 目标是运行时查询的（侧栏胶囊 / 活动栏 / 浮岛 / 底部裸轨 / 左右页头），
 * 所以打开期间用一个 160ms 的低频轮询跟着布局走，关闭即停。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { t } from '../i18n/index.js'
import {
  closeTestsGuide,
  prepareTestsGuideScene,
  setTestsGuideStep,
  TESTS_GUIDE_STEPS,
  testsGuide,
} from '../services/testsGuide.js'
import { testsPaneSide, testsRail, testsSplitInfo } from '../services/editorPanes.js'

const STEP_KEYS = ['detach', 'move', 'resize', 'toggle', 'float']
const LAST_STEP = TESTS_GUIDE_STEPS - 1
const stepKey = computed(() => STEP_KEYS[testsGuide.step] ?? STEP_KEYS[0])
const titleKey = computed(() => `tests.guide.steps.${stepKey.value}.title`)
const textKey = computed(() => `tests.guide.steps.${stepKey.value}.text`)

const rect = ref(null)
const scrims = ref([])
const cardEl = ref(null)
const cardStyle = ref({ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' })
let pollTimer = 0

/** 第一步 / 第二步 / 第三步的页头：浮岛 / 底部裸轨 / 左右页头三种形态 */
function headerEl() {
  if (testsRail.floating) return document.querySelector('.tests-float')
  if (testsPaneSide() === 'bottom') return document.querySelector('.workbench__rail-head')
  return document.querySelector('.tests-pane__head')
}

/**
 * 第一步的落点：岛已在侧栏里（开场由 prepareTestsGuideScene 保证），量侧栏那颗
 * 「评测」段（展开态在胶囊里、收起态在活动栏）。折叠侧栏只是把内层元素 visibility
 * 归零、布局还在，量 rect 前必须排掉，否则会亮到一棵看不见的 DOM 上。
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
  if (stepKey.value === 'detach') return detachTarget()
  if (stepKey.value === 'float') return document.querySelector('.tests-float') || headerEl()
  if (stepKey.value === 'resize') {
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
    rect.value = null
    scrims.value = []
  } else {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const r = { top: box.top, left: box.left, width: box.width, height: box.height }
    rect.value = r
    scrims.value = [
      { top: 0, left: 0, width: vw, height: Math.max(0, r.top) },
      {
        top: r.top + r.height,
        left: 0,
        width: vw,
        height: Math.max(0, vh - r.top - r.height),
      },
      { top: r.top, left: 0, width: Math.max(0, r.left), height: r.height },
      {
        top: r.top,
        left: r.left + r.width,
        width: Math.max(0, vw - r.left - r.width),
        height: r.height,
      },
    ]
  }
  nextTick(placeCard)
}

/** 卡片优先落在目标下方；贴边的窄目标（活动栏图标、竖向分隔条）改落在侧边，别盖住它 */
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

function startPolling() {
  clearInterval(pollTimer)
  pollTimer = window.setInterval(measure, 160)
}

function stopPolling() {
  clearInterval(pollTimer)
  pollTimer = 0
}

/** 每一步都先把场景摆到该步的固定形态，再切步骤 —— 自由操作已被遮罩挡住，场景不会漂 */
function goToStep(step) {
  const target = Math.min(LAST_STEP, Math.max(0, step))
  prepareTestsGuideScene(target)
  setTestsGuideStep(target)
  nextTick(measure)
}

function nextStep() {
  if (testsGuide.step >= LAST_STEP) {
    closeTestsGuide()
    return
  }
  goToStep(testsGuide.step + 1)
}

function prevStep() {
  goToStep(testsGuide.step - 1)
}

function onKeydown(event) {
  if (event.key === 'Escape') closeTestsGuide()
}

watch(
  () => testsGuide.step,
  () => nextTick(measure),
)

watch(
  () => testsGuide.open,
  (open) => {
    if (open) {
      measure()
      startPolling()
      window.addEventListener('keydown', onKeydown)
    } else {
      stopPolling()
      rect.value = null
      scrims.value = []
      window.removeEventListener('keydown', onKeydown)
    }
  },
)

onMounted(() => {
  if (testsGuide.open) {
    measure()
    startPolling()
    window.addEventListener('keydown', onKeydown)
  }
})

onBeforeUnmount(() => {
  stopPolling()
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="testsGuide.open"
      class="tests-guide"
      role="dialog"
      aria-modal="true"
      :aria-label="t('tests.guide.aria')"
    >
      <!-- 透明拦截层：教程播放期间不允许拖动 / 折叠 / 切换，场景不会因自由操作而变 -->
      <div class="tests-guide__blocker" aria-hidden="true"></div>
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

      <div ref="cardEl" class="tests-guide__card" :style="cardStyle">
        <div class="tests-guide__meta">
          <span class="tests-guide__count">{{ testsGuide.step + 1 }} / {{ TESTS_GUIDE_STEPS }}</span>
          <span class="tests-guide__dots" aria-hidden="true">
            <i
              v-for="n in TESTS_GUIDE_STEPS"
              :key="n"
              class="tests-guide__dot"
              :class="{ 'is-on': n - 1 === testsGuide.step }"
            ></i>
          </span>
        </div>
        <p class="tests-guide__title">{{ t(titleKey) }}</p>
        <p class="tests-guide__text">{{ t(textKey) }}</p>
        <div class="tests-guide__actions">
          <button type="button" class="tests-guide__skip" @click="closeTestsGuide">
            {{ t('tests.guide.skip') }}
          </button>
          <span class="tests-guide__spacer"></span>
          <button
            v-if="testsGuide.step > 0"
            type="button"
            class="tests-guide__ghost"
            @click="prevStep"
          >
            {{ t('tests.guide.prev') }}
          </button>
          <button type="button" class="tests-guide__next" @click="nextStep">
            {{ testsGuide.step >= LAST_STEP ? t('tests.guide.done') : t('tests.guide.next') }}
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

/* 透明拦截层：吃掉遮罩内孔里的点击，目标自己也不可操作 */
.tests-guide__blocker {
  position: fixed;
  inset: 0;
  background: transparent;
  pointer-events: auto;
}

/* 四块压暗面板围出目标的内孔；只负责压暗，点击交给上面那层拦截层 */
.tests-guide__scrim {
  position: fixed;
  background: var(--dialog-scrim);
  pointer-events: none;
}

.tests-guide__scrim--full {
  inset: 0;
}

/* 目标外圈：一圈主色细环 + 一圈极淡光晕，只做定位，不做装饰 */
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
}

.tests-guide__card {
  position: fixed;
  box-sizing: border-box;
  width: 300px;
  padding: 14px 14px 12px;
  border: 1px solid var(--border-hairline);
  border-radius: 10px;
  background: var(--menu-bg);
  backdrop-filter: var(--menu-backdrop);
  box-shadow: var(--menu-shadow);
  color: var(--text);
  font-family: var(--ui-font);
  pointer-events: auto;
}

.tests-guide__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
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
  transition: background-color 0.14s ease, width 0.14s ease;
}

.tests-guide__dot.is-on {
  width: 12px;
  background: var(--accent);
}

.tests-guide__title {
  margin: 0 0 5px;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.45;
  color: var(--text);
}

.tests-guide__text {
  margin: 0;
  font-size: 12px;
  line-height: 1.65;
  color: var(--text-dim);
}

.tests-guide__actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
}

.tests-guide__spacer {
  flex: 1 1 auto;
}

.tests-guide__skip,
.tests-guide__ghost,
.tests-guide__next {
  height: 26px;
  padding: 0 9px;
  border: 1px solid transparent;
  border-radius: 6px;
  font-family: var(--ui-font);
  font-size: 11.5px;
  line-height: 1;
  cursor: pointer;
}

.tests-guide__skip,
.tests-guide__ghost {
  color: var(--text-dim);
  background: transparent;
}

.tests-guide__next {
  color: var(--accent-text);
  background: var(--accent-face);
  font-weight: 500;
}

:where(html.is-hoverable) .tests-guide__skip:hover,
:where(html.is-hoverable) .tests-guide__ghost:hover {
  color: var(--text);
  background: var(--icon-hover-bg);
}

:where(html.is-hoverable) .tests-guide__next:hover {
  background: var(--accent-face-hover);
}
</style>
