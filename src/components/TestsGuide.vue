<script setup>
/**
 * TestsGuide —— 评测岛交互式新手引导（2026-11-21 第二版）。
 *
 * 每一步都是真机任务：固定场景 → 用户自己做手势 → 检测到状态变化后自动进入下一步。
 * 宽屏五步：① 从侧栏分出岛 → ② 拖页头换边 → ③ 拖分隔条改大小 → ④ 双击页头空白折叠
 * → ⑤ 拖浮岛换边。窄屏四步（去掉换边，岛固定停底部）：① 从图标栏拖出 → ② 改大小
 * → ③ 折叠 → ④ 拖浮岛。（第 4 步在宽屏必须落在 `.tests-pane__grip` 那一格空白上：页签轨和加号
 * 会把页头吃满，中间的双击点往往是页签或「添加测试样例」，点了不折叠反而切样例 / 多建一条。）
 *
 * 步骤身份是 **key**（detach / move / resize / toggle / float），不是下标：两套轨道长度不同，
 * 完成判定、落点、文案全按 key 分支，下标只用来取「当前第几个」。
 *
 * 场景只由步骤 key 决定（见 prepareTestsGuideScene），不看用户当前布局；每一步进入前
 * 都先把状态摆到「动作之前」，所以目标一定存在。用户乱操作导致目标消失（如改大小
 * 中途折叠了岛）时，1.2s 后自动复位到本步起点并提示「已复位」。
 *
 * 聚光灯只压暗、不拦指针 —— 用户必须能操作高亮目标；卡片自己可点，放在目标对侧。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { t } from '../i18n/index.js'
import {
  closeTestsGuide,
  guideSteps,
  prepareTestsGuideScene,
  testsGuide,
} from '../services/testsGuide.js'
import { testsLeaf, testsPaneSide, testsRail, testsSplitInfo } from '../services/editorPanes.js'
import { isNarrowLayout, narrowCollapseSide } from '../services/shellSettings.js'

const props = defineProps({
  /** 用户是否正在拖分隔条：第 3 步要等松手后才判完成，避免拖到一半就切步 */
  resizing: { type: Boolean, default: false },
})

/** 两套轨道（宽屏五步 / 窄屏四步），旋屏当场换；`step` 是下标，key 才是身份 */
const steps = computed(() => guideSteps())
const LAST_STEP = computed(() => steps.value.length - 1)
const stepKey = computed(() => steps.value[testsGuide.step] ?? steps.value[0] ?? 'detach')
/** 窄屏专用文案只覆盖这四步（窄屏轨道正好就这四步） */
const NARROW_COPY = new Set(['detach', 'resize', 'toggle', 'float'])
const stepBase = computed(() => {
  const base = `tests.guide.steps.${stepKey.value}`
  // 旋屏的瞬间 step 可能还停在旧轨道的下标上（'move'）：宁可用宽屏文案，也不露 key
  return isNarrowLayout() && NARROW_COPY.has(stepKey.value) ? `${base}.narrow` : base
})
const titleKey = computed(() => `${stepBase.value}.title`)
const textKey = computed(() => `${stepBase.value}.text`)
const doingKey = computed(() => `${stepBase.value}.doing`)
/** 窄屏图标栏在哪条边（设置里可选上 / 下）—— 第一步文案要说对是哪条边 */
const barWhere = computed(() =>
  t(narrowCollapseSide.value === 'top' ? 'tests.guide.barTop' : 'tests.guide.barBottom'),
)

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

/** move / toggle / float 的页头：浮岛 / 底部裸轨 / 左右页头三种形态 */
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
  // 折叠这一步要落在页头那块常驻空白上：页签轨 + 加号会把页头吃满，中间的双击
  // 落点常常是一颗页签或「添加测试样例」，点了不折叠反而切样例 / 多建一条。
  // 窄屏停靠底部时页头换成工作台的样例轨头（没有 grip），回退到轨头本身。
  if (key === 'toggle') return document.querySelector('.tests-pane__grip') || headerEl()
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
  const target = Math.min(LAST_STEP.value, Math.max(0, step))
  prepareTestsGuideScene(steps.value[target])
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
  switch (stepKey.value) {
    case 'detach':
      return Boolean(testsLeaf()) || testsRail.floating
    case 'move':
      // 必须真的换到另一侧：折叠（岛被摘走）时 side 会短暂变 null，那不算换边
      return (
        Boolean(baseline.side) &&
        Boolean(testsPaneSide()) &&
        testsPaneSide() !== baseline.side
      )
    case 'resize': {
      if (props.resizing) return false
      const ratio = testsSplitInfo()?.ratio
      return (
        typeof ratio === 'number' &&
        baseline.ratio != null &&
        Math.abs(ratio - baseline.ratio) > 0.003
      )
    }
    case 'toggle':
      return testsRail.floating === true
    case 'float':
      return testsRail.floating && Boolean(baseline.edge) && testsRail.edge !== baseline.edge
    default:
      return false
  }
}

/** 当前步骤的目标是否还成立；不成立 1.2s 后复位 */
function stateValid() {
  if (stepKey.value === 'detach') return true
  if (stepKey.value === 'float') return testsRail.floating
  return Boolean(testsLeaf()) && !testsRail.floating
}

function advance() {
  if (done.value) return
  done.value = true
  clearTimeout(advanceTimer)
  advanceTimer = window.setTimeout(() => {
    if (!testsGuide.open) return
    if (testsGuide.step >= LAST_STEP.value) {
      // 走完全程：保留用户最后摆出的样子（浮岛停在他刚拖到的那条边上），
      // 不再按开场快照「关回去」—— 否则最后一步做完，岛会当场消失。
      closeTestsGuide({ keepScene: true })
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
  if (testsGuide.step >= LAST_STEP.value) {
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

function startSession() {
  done.value = false
  notice.value = ''
  invalidSince = 0
  armedUntil = Date.now() + 450
  // 折叠确认气泡靠这个类浮到遮罩之上（见 EditorPaneGrid 里 `body.is-tests-guide` 那条）
  document.body.classList.add('is-tests-guide')
  captureBaseline()
  measure()
  nextTick(placeCard)
  startPolling()
  window.addEventListener('keydown', onKeydown)
}

function endSession() {
  stopPolling()
  invalidSince = 0
  rect.value = null
  scrims.value = []
  document.body.classList.remove('is-tests-guide')
  window.removeEventListener('keydown', onKeydown)
}

// `runId` 也看：引导已经开着时再点一次「重看」（帮助面板），open 不会变化，
// 只靠 open 的 watch 会连场景都不重摆。
watch(
  () => [testsGuide.open, testsGuide.runId],
  ([open]) => {
    clearTimeout(advanceTimer)
    clearTimeout(noticeTimer)
    if (open) startSession()
    else endSession()
  },
)

// 旋屏 / 拉窗口会换轨道（五步 ↔ 四步）：下标可能越界，收到最后一步并重摆场景。
// 反过来（窄 → 宽）下标仍合法，只是步骤身份变了，按 key 走的判定 / 文案会自己跟上。
watch(
  () => steps.value.length,
  (len) => {
    if (!testsGuide.open) return
    if (testsGuide.step > len - 1) goToStep(len - 1)
  },
)

onMounted(() => {
  if (!testsGuide.open) return
  startSession()
})

onBeforeUnmount(() => {
  stopPolling()
  clearTimeout(advanceTimer)
  clearTimeout(noticeTimer)
  document.body.classList.remove('is-tests-guide')
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
          <span class="tests-guide__count">{{ testsGuide.step + 1 }} / {{ steps.length }}</span>
          <span class="tests-guide__dots" aria-hidden="true">
            <i
              v-for="n in steps.length"
              :key="n"
              class="tests-guide__dot"
              :class="{ 'is-on': n - 1 === testsGuide.step, 'is-past': n - 1 < testsGuide.step }"
            ></i>
          </span>
        </div>
        <p class="tests-guide__title">{{ t(titleKey, { where: barWhere }) }}</p>
        <p class="tests-guide__status" :class="{ 'is-done': done, 'is-notice': notice }">
          <span class="tests-guide__signal" aria-hidden="true"></span>
          {{ done ? t('tests.guide.done') : notice || t(doingKey, { where: barWhere }) }}
        </p>
        <p class="tests-guide__text">{{ t(textKey, { where: barWhere }) }}</p>
        <div class="tests-guide__actions">
          <button type="button" class="tests-guide__ghost" @click="skipStep">
            {{ t('tests.guide.skipStep') }}
          </button>
          <span class="tests-guide__spacer"></span>
          <button type="button" class="tests-guide__ghost" @click="closeTestsGuide()">
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

/* 引导卡片：按项目里的右键菜单来做（2026-11-22 用户要求「参考右键菜单」）。
   与 ContextMenu 的容器逐条对齐：
     · 面 = --menu-bg，配 --menu-backdrop 微毛玻璃（原来就是这一对）；
     · **不画描边** —— 菜单的轮廓交给 --menu-shadow 首层那道虚化发丝影，卡片原来那条
       1px --border-hairline 会把它框回一个「盒子」，和菜单不是一种东西；
     · 圆角 6px × --menu-scale（菜单容器那一档，不再是另开的 10px）；
     · 内边距 = 菜单容器（6px / --menu-pad-x × scale）+ 菜单条目那一档
       （6px / --menu-item-pad-x × scale）：菜单里文字距边框是 4 + 12 = 16px，
       卡片没有可点的条目行，就把两级内边距并进容器，正文落在同一条读数上
       （≈ 11px / 14.7px，与改前的 13px / 14px 几乎一致）。 */
.tests-guide__card {
  position: fixed;
  box-sizing: border-box;
  width: 292px;
  padding: calc(6px * var(--menu-scale) * 2)
    calc((var(--menu-item-pad-x) + var(--menu-pad-x)) * var(--menu-scale));
  border: none;
  border-radius: calc(6px * var(--menu-scale));
  background: var(--menu-bg);
  backdrop-filter: var(--menu-backdrop);
  box-shadow: var(--menu-shadow);
  color: var(--menu-text);
  font-family: var(--ui-font);
  pointer-events: auto;
  transition: box-shadow 0.16s ease;
}

/* 完成态：菜单体系里没有「描边」，但这一步做完了必须看得出来 —— 用一层 1px 的
   语义色环叠在菜单影之前（视觉上等于原来那条 --ok 描边，位置从盒内挪到盒外，
   不参与布局，卡片尺寸不动）。 */
.tests-guide__card.is-done {
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--ok) 45%, transparent),
    var(--menu-shadow);
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
  font-size: calc(11px * var(--menu-scale));
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  /* 菜单里「退到背景里那一档」就是 --menu-muted（分组标题 / 快捷键用它） */
  color: var(--menu-muted);
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
  background: color-mix(in srgb, var(--menu-muted) 45%, transparent);
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
  /* 菜单条目的文字色（--menu-text），跟着 --menu-bg 的明暗一起换 */
  color: var(--menu-text);
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
  color: var(--menu-text);
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

/* 动作行与正文之间画一条菜单分隔线（--menu-separator，1px）：卡片里「跳过 / 退出」
   是唯一的可点区，用菜单那套「分隔 + 条目」的结构把它和说明文字分开。 */
.tests-guide__actions {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--menu-separator);
}

.tests-guide__spacer {
  flex: 1 1 auto;
}

/* 幽灵按钮 = 菜单里的次要条目：常态 --menu-muted，悬停换成菜单那枚深蓝胶囊
   （--menu-hover-bg / --menu-hover-text），圆角用菜单条目的 4px × --menu-scale。
   不再自带描边 —— 菜单条目没有描边，也不该有。 */
.tests-guide__ghost {
  height: 24px;
  padding: 0 calc(6px * var(--menu-scale));
  border: none;
  border-radius: calc(4px * var(--menu-scale));
  background: transparent;
  color: var(--menu-muted);
  font-family: var(--ui-font);
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
  transition:
    background-color 0.1s ease,
    color 0.1s ease;
}

:where(html.is-hoverable) .tests-guide__ghost:hover {
  color: var(--menu-hover-text);
  background: var(--menu-hover-bg);
}

@media (prefers-reduced-motion: reduce) {
  .tests-guide__ring,
  .tests-guide__signal {
    animation: none;
  }
}
</style>
