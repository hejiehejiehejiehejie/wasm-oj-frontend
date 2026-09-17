<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  testCase: { type: Object, required: true },
  index: { type: Number, required: true },
  locked: Boolean,
})

const emit = defineEmits(['remove', 'run'])

const STATUS = {
  idle: { label: '待运行', icon: '' },
  running: { label: '运行中', icon: '' },
  passed: { label: '通过', icon: 'check' },
  failed: { label: '未通过', icon: 'close' },
  error: { label: '错误', icon: 'alert' },
}

const status = computed(() => STATUS[props.testCase.status] ?? STATUS.idle)

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
onMounted(growAll)

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
        <span>{{ status.label }}</span>
      </span>
      <!-- 判定区从状态徽标右侧一直延伸到删除按钮左侧：视觉不变，只把整条空白变成点得到的运行按钮 -->
      <button
        class="run-zone"
        title="仅运行该用例"
        aria-label="仅运行该用例"
        :disabled="locked"
        @click="emit('run', testCase)"
      >
        <span v-if="testCase.hint" class="hint">{{ testCase.hint }}</span>
        <span v-if="testCase.stale" class="stale" title="代码或输入已改动，下面的结论来自上一次运行">
          结果待刷新
        </span>
        <span class="grow"></span>
        <span v-if="timing" class="metric">{{ timing }}</span>
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
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: 0.2px;
}

.grow {
  flex: 1 1 auto;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
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

.hint,
.stale {
  font-size: 11px;
  color: var(--text-faint);
  white-space: nowrap;
}

.stale {
  color: var(--warn);
}

.metric {
  font-family: var(--mono-font);
  font-size: 11px;
  color: var(--text-dim);
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
</style>
