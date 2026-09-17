<script setup>
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import TestCaseCard from './TestCaseCard.vue'
import { TIME_LIMIT_OPTIONS } from '../services/runner.js'

const props = defineProps({
  cases: { type: Array, required: true },
  running: Boolean,
  // 最慢的那张用例卡片耗时（毫秒，只计运行段，与卡片同口径）
  elapsed: { type: Number, default: 0 },
  // 全局时限（毫秒），只计运行段
  timeLimit: { type: Number, required: true },
})

const emit = defineEmits(['add', 'remove', 'run-one', 'run-all', 'update:time-limit'])

function limitLabel(ms) {
  return `${ms / 1000} s`
}

const counts = computed(() => {
  const tally = { idle: 0, running: 0, passed: 0, failed: 0, error: 0 }
  for (const item of props.cases) tally[item.status] = (tally[item.status] ?? 0) + 1
  return tally
})

const verdict = computed(() => {
  if (!props.cases.length) return { text: '还没有测试用例', tone: 'muted' }
  if (counts.value.running) return { text: '运行中', tone: 'info' }
  if (counts.value.error) return { text: `${counts.value.error} 个报错`, tone: 'error' }
  if (counts.value.failed) return { text: `${counts.value.failed} 个未通过`, tone: 'failed' }
  if (counts.value.passed === props.cases.length) return { text: '全部通过', tone: 'passed' }
  return { text: `${counts.value.passed}/${props.cases.length} 已通过`, tone: 'muted' }
})
const elapsedText = computed(() => {
  if (!props.elapsed) return ''
  return props.elapsed >= 1000 ? `${(props.elapsed / 1000).toFixed(2)}s` : `${props.elapsed}ms`
})
</script>

<template>
  <section class="panel" aria-label="CPH 评测面板">
    <header class="panel__head">
      <div class="panel__heading">
        <h2 class="panel__title">Test Cases</h2>
        <span class="verdict" :data-tone="verdict.tone">{{ verdict.text }}</span>
        <span v-if="elapsedText" class="elapsed" :title="`最慢用例耗时 ${elapsedText}（只计运行段，不含编译）`">
          <AppIcon name="clock" :size="11" />{{ elapsedText }}
        </span>
      </div>

      <label class="limit" title="运行时限：只计程序运行阶段（不含编译），超出即判 TLE">
        <span class="limit__label">时限</span>
        <span class="select">
          <select
            :value="timeLimit"
            @change="emit('update:time-limit', Number($event.target.value))"
          >
            <option v-for="ms in TIME_LIMIT_OPTIONS" :key="ms" :value="ms">{{ limitLabel(ms) }}</option>
          </select>
          <AppIcon name="chevron" :size="12" class="select__chevron" />
        </span>
      </label>
    </header>

    <ul class="cases">
      <li v-if="!cases.length" class="empty">
        <p class="empty__title">暂无测试用例</p>
        <p class="empty__text">点击下方按钮新增一个用例，填写标准输入与期望输出。</p>
        <button class="add add--inline" @click="emit('add')">
          <AppIcon name="plus" :size="13" />
          <span>添加第一个用例</span>
        </button>
      </li>

      <TestCaseCard
        v-for="(item, index) in cases"
        :key="item.id"
        :test-case="item"
        :index="index"
        :locked="running"
        @remove="emit('remove', $event)"
        @run="emit('run-one', $event)"
      />
    </ul>

    <footer class="panel__foot">
      <button class="add" @click="emit('add')" :disabled="running">
        <AppIcon name="plus" :size="14" />
        <span>添加测试样例</span>
      </button>
      <button class="run-inline" :disabled="running || !cases.length" title="运行全部测试用例" @click="emit('run-all')">
        <AppIcon name="play" :size="13" />
      </button>
    </footer>
  </section>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100%;
  background: var(--bg-panel);
}

.panel__head {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 10px 9px 14px;
  border-bottom: 1px solid var(--border-soft);
  background: var(--bg-panel-head);
}

.panel__heading {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
}

.panel__title {
  margin: 0;
  font-size: 11.5px;
  font-weight: 650;
  letter-spacing: 0.9px;
  text-transform: uppercase;
  color: var(--text);
}

.verdict {
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
  color: var(--text-dim);
  background: var(--case-chip-bg);
  border: 1px solid transparent;
  white-space: nowrap;
  transition: color 0.18s ease, background-color 0.18s ease;
}

.verdict[data-tone='passed'] {
  color: var(--ok);
  background: rgba(137, 209, 133, 0.13);
}

.verdict[data-tone='failed'] {
  color: var(--fail);
  background: rgba(244, 135, 113, 0.13);
}

.verdict[data-tone='error'] {
  color: var(--err);
  background: rgba(224, 163, 78, 0.13);
}

.verdict[data-tone='info'] {
  color: var(--info);
  background: rgba(79, 193, 255, 0.12);
}

.elapsed {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: var(--mono-font);
  font-size: 11px;
  color: var(--text-faint);
}

/* 时限选择器：贴着面板头部右侧，宽度不参与压缩 */
.limit {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
}

.limit__label {
  font-size: 11.5px;
  color: var(--text-faint);
}

.select {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.select select {
  appearance: none;
  padding: 4px 24px 4px 8px;
  border-radius: 5px;
  background: var(--bg-control);
  border: 1px solid var(--border);
  font-size: 12px;
  font-family: var(--mono-font);
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.select select:hover {
  background: var(--bg-control-hover);
}

.select__chevron {
  position: absolute;
  right: 7px;
  pointer-events: none;
  color: var(--text-dim);
}

.cases {
  flex: 1 1 auto;
  min-height: 0;
  margin: 0;
  padding: 12px;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  overflow-x: hidden;
  container-type: inline-size;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 22px 18px;
  border: 1px dashed var(--border);
  border-radius: 8px;
  background: var(--bg-input);
}

.empty__title {
  margin: 0;
  font-size: 13px;
  color: var(--text);
}

.empty__text {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-faint);
}

.add {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  width: 100%;
  height: 32px;
  border-radius: 6px;
  font-size: 12.5px;
  color: var(--info-soft-text);
  background: var(--info-soft-bg);
  border: 1px solid var(--info-soft-border);
  transition: background-color 0.16s ease, border-color 0.16s ease;
}

.add:hover:not(:disabled) {
  background: var(--info-soft-bg-hover);
  border-color: var(--info-soft-border-hover);
}

.add:disabled {
  opacity: 0.5;
  cursor: default;
}

.add--inline {
  width: auto;
  margin-top: 6px;
}

.panel__foot {
  flex: 0 0 auto;
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid var(--border-soft);
  background: var(--bg-panel-head);
}

.run-inline {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 32px;
  padding: 0 14px;
  border-radius: 6px;
  font-size: 12.5px;
  color: var(--text-on-accent);
  background: var(--run-green);
  transition: background-color 0.16s ease;
}

.run-inline:hover:not(:disabled) {
  background: var(--run-green-hover);
}

.run-inline:disabled {
  opacity: 0.45;
  cursor: default;
}
</style>
