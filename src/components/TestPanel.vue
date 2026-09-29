<script setup>
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import SidebarSwitcher from './SidebarSwitcher.vue'
import TestCaseCard from './TestCaseCard.vue'
import { t } from '../i18n/index.js'

const props = defineProps({
  cases: { type: Array, required: true },
  running: Boolean,
  // 最慢的那张用例卡片耗时（毫秒，只计运行段，与卡片同口径）
  elapsed: { type: Number, default: 0 },
})

const emit = defineEmits(['add', 'remove', 'run-one', 'run-all'])

const counts = computed(() => {
  // stale 是附加维度：卡片状态仍是 passed/failed/error，但代码或输入已改动、结论过期
  const tally = { idle: 0, running: 0, passed: 0, failed: 0, error: 0, stale: 0 }
  for (const item of props.cases) {
    tally[item.status] = (tally[item.status] ?? 0) + 1
    if (item.stale) tally.stale += 1
  }
  return tally
})

// 与卡片徽标同一套判定词：AC 就是通过。混合结果只报「几 / 几 AC」，
// 具体是 WA 还是 TLE 由各张卡片的徽标说明，页头不再堆第二个长句。
// 只要有一张卡片的结论已过期（stale），就不能再宣称「全部 AC」——
// 上一轮通过不代表改完代码后仍通过。
const verdict = computed(() => {
  const total = props.cases.length
  if (!total) return { text: t('tests.verdict.noCases'), tone: 'muted' }
  if (counts.value.running) return { text: t('tests.verdict.running'), tone: 'info' }
  // 有结论过期就报不出确切的通过数，用 ? 代替（卡片各自标明哪些待刷新）
  if (counts.value.stale) return { text: t('tests.verdict.stale', { total }), tone: 'warn' }
  if (counts.value.passed === total) return { text: t('tests.verdict.allPassed'), tone: 'passed' }
  const tone = counts.value.error ? 'error' : counts.value.failed ? 'failed' : 'muted'
  return { text: t('tests.verdict.partial', { passed: counts.value.passed, total }), tone }
})

// 有过期结论时，页头耗时同样来自上一轮，跟着藏掉，免得和「结果待刷新」自相矛盾
const elapsedText = computed(() => {
  if (!props.elapsed || counts.value.stale) return ''
  return props.elapsed >= 1000 ? `${(props.elapsed / 1000).toFixed(2)}s` : `${props.elapsed}ms`
})
</script>

<template>
  <section class="panel" :aria-label="t('tests.panel.ariaLabel')">
    <header class="panel__head">
      <SidebarSwitcher />
      <div class="panel__heading">
        <span class="verdict" :data-tone="verdict.tone">{{ verdict.text }}</span>
        <span
          v-if="elapsedText"
          class="elapsed"
          :title="t('tests.elapsedTitle', { time: elapsedText })"
        >
          <AppIcon name="clock" :size="11" />{{ elapsedText }}
        </span>
      </div>
    </header>

    <ul class="cases">
      <li v-if="!cases.length" class="empty">
        <p class="empty__title">{{ t('tests.empty.title') }}</p>
        <p class="empty__text">{{ t('tests.empty.text') }}</p>
        <button class="add add--inline" @click="emit('add')">
          <AppIcon name="plus" :size="13" />
          <span>{{ t('tests.panel.addFirst') }}</span>
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
        <span>{{ t('tests.panel.addCase') }}</span>
      </button>
      <button
        class="run-inline"
        :disabled="running || !cases.length"
        :title="t('tests.panel.runAll')"
        @click="emit('run-all')"
      >
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
  /* 作为统一侧边栏「评测样例」页签里的 flex 子项撑满内容区（与 FileExplorer 的 .explorer 同款） */
  flex: 1 1 auto;
  min-height: 0;
  background: var(--bg-panel);
}

.panel__head {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  /* 左侧是「资源管理器 / 评测样例」切换入口，右侧只剩徽标与耗时；
     与资源管理器页头同高（min-height 35px）；挤不下时整体换行而不是让徽标溢出自己的盒子 */
  flex-wrap: wrap;
  gap: 10px;
  row-gap: 4px;
  min-height: 35px;
  padding: 4px 10px 4px 4px;
  border-bottom: 1px solid var(--border-soft);
  background: var(--bg-panel-head);
}

.panel__heading {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  /* 换行后单独占一行时仍然贴右（不写会在换行那一行落到左边） */
  margin-left: auto;
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

/* 有结论过期（代码/输入改后未重跑）：琥珀色提示，不再给绿色「全部 AC」 */
.verdict[data-tone='warn'] {
  color: var(--warn);
  background: rgba(201, 164, 92, 0.14);
}

.elapsed {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: var(--mono-font);
  font-size: 11px;
  color: var(--text-faint);
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
