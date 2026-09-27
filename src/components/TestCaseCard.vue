<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  testCase: { type: Object, required: true },
  index: { type: Number, required: true },
  locked: Boolean,
})

const emit = defineEmits(['remove', 'run'])

// 徽标文案：跑完的用例用 runner 给的判定码（AC / WA / CE / TLE / RE / ERR），
// 没跑过或正在跑才用状态名。判定码比「通过 / 未通过」短一个量级，窄面板下不会被挤成竖排。
const STATUS = {
  idle: { label: '待运行', icon: '' },
  running: { label: '运行中', icon: '' },
  passed: { label: 'AC', icon: 'check' },
  failed: { label: 'WA', icon: 'close' },
  error: { label: 'ERR', icon: 'alert' },
}

const status = computed(() => STATUS[props.testCase.status] ?? STATUS.idle)
const badgeLabel = computed(() => props.testCase.verdict || status.value.label)

// 折叠状态与用例记录放在一起，卡片被复用（v-for key 为 id）时不会丢。
const isCollapsed = computed(() => props.testCase.collapsed === true)

function toggleCollapse() {
  props.testCase.collapsed = !isCollapsed.value
}

// The card edits its own record in place: the case objects live in App's
// reactive `testCases` array, so a two-way binding per field is enough.
function field(name) {
  return computed({
    get: () => props.testCase[name],
    set: (value) => {
      props.testCase[name] = value
      if (props.testCase.status !== 'idle' && props.testCase.status !== 'running') {
        props.testCase.stale = true
      }
    },
  })
}

const input = field('input')
const expectedOutput = field('expectedOutput')

// 输入 / 期望输出框的高度随内容自适应：最多长到 MAX_IO_HEIGHT，超出后框内滚动。
const MAX_IO_HEIGHT = 320
const inputEl = ref(null)
const expectedEl = ref(null)

function autoGrow(el) {
  if (!el) return
  // v-show 折叠时元素不可见，scrollHeight 为 0，此时不动高度，展开后会重新计算。
  if (!el.scrollHeight) return
  const cs = getComputedStyle(el)
  const border = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth)
  el.style.height = 'auto'
  const full = el.scrollHeight + border
  el.style.height = `${Math.min(full, MAX_IO_HEIGHT)}px`
  el.style.overflowY = full > MAX_IO_HEIGHT ? 'auto' : 'hidden'
}

function growAll() {
  autoGrow(inputEl.value)
  autoGrow(expectedEl.value)
}

watch([input, expectedOutput], () => nextTick(growAll))
watch(isCollapsed, (collapsed) => {
  if (!collapsed) nextTick(growAll)
})

// 卡片所在的面板（统一侧边栏的「评测样例」页签）默认是 display: none，
// onMounted 那一刻 scrollHeight 为 0，autoGrow 会直接跳过；之后切到该页签时
// 没有任何重算时机，输入框就会一直塌成一行。ResizeObserver 能接住「从不可见变为可见」
// （宽度 0 → 有值）以及面板宽度变化，只在宽度变大时重算 —— 宽度不受我们自己设的
// height 影响，不会形成回调环。
let growObserver = null
let lastGrownWidth = 0
onMounted(() => {
  growAll()
  growObserver = new ResizeObserver((entries) => {
    const width = entries[0]?.contentRect.width ?? 0
    if (width === lastGrownWidth) return
    lastGrownWidth = width
    if (width > 0) growAll()
  })
  if (inputEl.value) growObserver.observe(inputEl.value)
})
onBeforeUnmount(() => growObserver?.disconnect())

const outputText = computed(() => {
  const { actualOutput, detail } = props.testCase
  return [actualOutput, detail].filter((part) => part && part.trim()).join('\n')
})

const timing = computed(() => {
  const { durationMs } = props.testCase
  if (durationMs === null || durationMs === undefined) return ''
  return durationMs >= 1000 ? `${(durationMs / 1000).toFixed(2)} s` : `${durationMs} ms`
})

async function copyOutput() {
  if (!outputText.value) return
  try {
    await navigator.clipboard.writeText(outputText.value)
  } catch {
    /* clipboard blocked: nothing else to try */
  }
}
</script>

<template>
  <li
    class="card"
    :data-status="testCase.status"
    :class="{ 'is-stale': testCase.stale, 'is-collapsed': isCollapsed }"
  >
    <header class="card__head">
      <button
        class="icon-btn icon-btn--toggle"
        :class="{ 'is-collapsed': isCollapsed }"
        :title="isCollapsed ? '展开该用例' : '折叠该用例'"
        :aria-expanded="!isCollapsed"
        :aria-label="isCollapsed ? '展开该用例' : '折叠该用例'"
        @click="toggleCollapse"
      >
        <AppIcon name="chevron" :size="13" />
      </button>
      <span class="card__title">#{{ index + 1 }}</span>
      <span class="badge" :data-status="testCase.status">
        <AppIcon v-if="status.icon" :name="status.icon" :size="11" :stroke-width="2.6" />
        <span>{{ badgeLabel }}</span>
      </span>
      <!-- 判定区从状态徽标右侧一直延伸到删除按钮左侧：视觉不变，只把整条空白变成点得到的运行按钮 -->
      <button
        class="run-zone"
        title="仅运行该用例"
        aria-label="仅运行该用例"
        :disabled="locked"
        @click="emit('run', testCase)"
      >
        <span v-if="testCase.stale" class="stale" title="代码或输入已改动，下面的结论来自上一次运行">
          结果待刷新
        </span>
        <span class="grow"></span>
        <span v-if="timing" class="metric" title="程序运行耗时（不含编译）">{{ timing }}</span>
        <span class="run-zone__icon">
          <AppIcon name="play" :size="12" />
        </span>
      </button>
      <button class="icon-btn icon-btn--danger" title="删除该用例" :disabled="locked" @click="emit('remove', testCase)">
        <AppIcon name="trash" :size="13" />
      </button>
    </header>

    <div v-show="!isCollapsed" class="card__body">
      <div class="io">
        <label class="field">
          <span class="field__label">Standard Input</span>
          <textarea
            v-model="input"
            ref="inputEl"
            class="ta"
            spellcheck="false"
            placeholder="标准输入 (stdin)"
            :disabled="locked"
          ></textarea>
        </label>
        <label class="field">
          <span class="field__label">Expected Output</span>
          <textarea
            v-model="expectedOutput"
            ref="expectedEl"
            class="ta"
            spellcheck="false"
            placeholder="期望输出"
            :disabled="locked"
          ></textarea>
        </label>
      </div>

      <div class="field">
        <span class="field__label field__label--row">
          <span>Actual Output</span>
          <button class="icon-btn" title="复制实际输出" :disabled="!outputText" @click="copyOutput">
            <AppIcon name="copy" :size="12" />
          </button>
        </span>
        <pre class="out" :class="{ 'is-empty': !outputText }" tabindex="0">{{
          outputText || '尚未运行'
        }}</pre>
      </div>
    </div>
  </li>
</template>

<style scoped>
.card {
  /* 关键：卡片自身 overflow:hidden 会让 flex 自动最小高度变成 0，
     若再允许收缩（默认 flex-shrink:1），用例一多就会被压扁，
     列表 scrollHeight 永远等于 clientHeight，滚不动。 */
  flex: 0 0 auto;
  border: 1px solid var(--border-soft);
  border-left: 3px solid var(--case-border);
  border-radius: 8px;
  background: var(--bg-card);
  overflow: hidden;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease;
}

.card:hover {
  border-color: var(--border);
  border-left-color: currentColor;
}

.card[data-status='passed'] {
  border-left-color: var(--ok);
}

.card[data-status='failed'] {
  border-left-color: var(--fail);
}

.card[data-status='error'] {
  border-left-color: var(--err);
}

.card[data-status='running'] {
  border-left-color: var(--info);
  box-shadow: 0 0 0 1px rgba(79, 193, 255, 0.25);
}

.card.is-stale {
  opacity: 0.86;
}

/* 折叠后只剩标题栏，去掉那条悬空的分隔线 */
.card.is-collapsed .card__head {
  border-bottom-color: transparent;
}

.card__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px 7px 10px;
  background: var(--bg-card-head);
  border-bottom: 1px solid var(--border-soft);
}

.card__title {
  flex: 0 0 auto;
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: 0.2px;
  white-space: nowrap;
}

.grow {
  flex: 1 1 auto;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  /* 徽标不参与压缩、也不换行：窄面板下宁可让判定区先让位，否则中文会被挤成竖排单字 */
  flex: 0 0 auto;
  white-space: nowrap;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 11px;
  border: 1px solid transparent;
  color: var(--text-dim);
  background: var(--case-chip-bg);
  transition: color 0.18s ease, background-color 0.18s ease, border-color 0.18s ease;
}

.badge[data-status='passed'] {
  color: var(--ok);
  background: rgba(137, 209, 133, 0.13);
  border-color: rgba(137, 209, 133, 0.4);
}

.badge[data-status='failed'] {
  color: var(--fail);
  background: rgba(244, 135, 113, 0.13);
  border-color: rgba(244, 135, 113, 0.4);
}

.badge[data-status='error'] {
  color: var(--err);
  background: rgba(224, 163, 78, 0.13);
  border-color: rgba(224, 163, 78, 0.4);
}

.badge[data-status='running'] {
  color: var(--info);
  background: rgba(79, 193, 255, 0.12);
  border-color: rgba(79, 193, 255, 0.4);
  animation: breathe 1.15s ease-in-out infinite;
}

@keyframes breathe {
  50% {
    opacity: 0.55;
  }
}

.stale {
  font-size: 11px;
  color: var(--warn);
  white-space: nowrap;
  /* 判定区里唯一能缩的一格（耗时与运行图标都是 flex: 0 0 auto）。给它省略号，
     窄到放不下时它自己截断，而不是让文字溢出、压住右边的耗时和运行图标。 */
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.metric {
  flex: 0 0 auto;
  font-family: var(--mono-font);
  font-size: 11px;
  color: var(--text-dim);
  white-space: nowrap;
}

/* 运行判定区：撑满徽标与删除按钮之间的空白，内部排版与原来的头栏完全一致 */
.run-zone {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  /* 去掉 UA 默认的按钮内边距，否则整条判定区的内容会整体偏移 */
  padding: 0;
  color: inherit;
  /* 兜底：判定区是头部唯一可压缩的一格，内容宁可被裁也不许压到相邻格上 */
  overflow: hidden;
}

.run-zone:disabled {
  cursor: default;
}

.run-zone__icon {
  display: inline-grid;
  place-items: center;
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  color: var(--text-dim);
  transition: background-color 0.15s ease, color 0.15s ease;
}

.run-zone:hover:not(:disabled) .run-zone__icon {
  background: var(--bg-hover);
  color: var(--text);
}

.run-zone:disabled .run-zone__icon {
  opacity: 0.35;
}

.icon-btn {
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  color: var(--text-dim);
  transition: background-color 0.15s ease, color 0.15s ease;
}

.icon-btn:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--text);
}

.icon-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.icon-btn--danger:hover:not(:disabled) {
  color: var(--fail);
  background: rgba(244, 135, 113, 0.14);
}

.icon-btn--toggle {
  margin-left: -3px;
  transition: transform 0.18s ease, background-color 0.15s ease, color 0.15s ease;
}

.icon-btn--toggle.is-collapsed {
  transform: rotate(-90deg);
}

.card__body {
  padding: 10px;
  display: grid;
  gap: 10px;
}

.io {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

@container (min-width: 560px) {
  .io {
    grid-template-columns: 1fr 1fr;
  }
}

.field {
  display: block;
  min-width: 0;
}

.field__label {
  display: block;
  margin-bottom: 4px;
  font-size: 11px;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: var(--text-faint);
}

.field__label--row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ta {
  display: block;
  width: 100%;
  /* 高度由脚本按内容自适应（上限 MAX_IO_HEIGHT），不再需要手动拖拽调整 */
  min-height: 76px;
  padding: 8px 9px;
  border-radius: 5px;
  background: var(--bg-input);
  border: 1px solid var(--border-soft);
  font-family: var(--mono-font);
  font-size: 13.5px;
  line-height: 1.55;
  resize: none;
  overflow-y: hidden;
  transition: border-color 0.15s ease;
}

.ta:focus {
  outline: none;
  border-color: var(--focus);
}

.out {
  margin: 0;
  min-height: 76px;
  max-height: 360px;
  overflow: auto;
  padding: 8px 9px;
  border-radius: 5px;
  background: var(--bg-input);
  border: 1px solid var(--border-soft);
  font-family: var(--mono-font);
  font-size: 13.5px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text);
  cursor: text;
}

.card[data-status='passed'] .out {
  color: var(--ok-soft);
}

.card[data-status='failed'] .out,
.card[data-status='error'] .out {
  color: var(--fail-soft);
}

.out.is-empty {
  color: var(--text-faint);
}

/* ---------- 窄容器下的降级 ----------
   容器是 TestPanel 里 .cases 的 inline-size（约等于面板宽度 − 24px 内边距 − 滚动条）。
   面板下限放宽到 240px 后（见 App.vue 的 --tests-min-cap），头部一行放不下全部内容：
   折叠箭头、#N、徽标、删除按钮都是 flex: 0 0 auto，不参与压缩，只剩判定区能缩。
   所以按重要性逐级让步，而不是让它们挤在一起。

   注意优先级：**每例的运行耗时（.metric）任何宽度下都不隐藏** —— 它是这一行里
   唯一「看完会想改代码」的信息，「结果待刷新」还有面板头部的 ?/N AC 徽标与卡片
   降透明度在提示，徽标图标（✓/✕）则只是装饰，文字本身已经说明结论。
   该让位的是后两者。 */
@container (max-width: 360px) {
  .card__head {
    gap: 6px;
    padding: 7px 6px 7px 8px;
  }

  /* 正文同步收一点内边距，把省下的宽度留给输入框与输出框 */
  .card__body {
    padding: 8px;
    gap: 8px;
  }

  .io {
    gap: 8px;
  }

  .ta,
  .out {
    padding: 7px 8px;
  }
}

/* 再挤一档：间距收到最小，并让掉徽标图标与「结果待刷新」，把宽度省给运行耗时 */
@container (max-width: 250px) {
  .card__head {
    gap: 4px;
    padding: 7px 5px 7px 6px;
  }

  .badge :deep(svg) {
    display: none;
  }

  .stale {
    display: none;
  }
}
</style>
