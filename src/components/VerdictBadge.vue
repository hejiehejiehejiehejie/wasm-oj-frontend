<script setup>
/**
 * VerdictBadge —— 评测结论的唯一形态（2026-11-21 用户方案二）。
 *
 * 为什么要有这个组件：页头右上角（TestPanel）、底部工作台轨头（TestCaseTabs）、
 * 折叠评测条（TestsPane）原先各抄一份 verdict 样式，词表还分裂成 ok/fail 与
 * passed/failed/error 两套。这里把「比例 + 文案 + 弱染分子」收成一处：
 *   · 零装饰：不要信号点、不要底色，颜色只以 78% 混入 --text 的弱饱和形式染分子；
 *   · 比例拆成「分子 / 斜杠 / 分母」三阶灰度，等宽、500 字重、负字距；
 *   · tone 只认 verdict 的六值：passed / failed / error / warn / info / muted。
 * 改样式只改这一个文件，四处自然同步。
 */
import { computed } from 'vue'
import LoadingSpinner from './LoadingSpinner.vue'

const props = defineProps({
  /** 'passed' | 'failed' | 'error' | 'warn' | 'info' | 'muted' */
  tone: { type: String, default: 'muted' },
  /** 分子；`'?'` 表示结论过期给不出确切通过数，`null` 表示没有比例可报 */
  passed: { type: [Number, String], default: null },
  /** 分母；0 也可渲染（折叠条的空用例读数是 0/0） */
  total: { type: Number, default: 0 },
  /** 比例后的文案（如 AC / 无测试用例 / 运行中），空串表示不渲染 */
  label: { type: String, default: '' },
  /** 运行中那张 spinner 的尺寸（页头 9、底栏 10，由调用方按行高挑） */
  spinnerSize: { type: Number, default: 10 },
})

/** `passed` 为 null / undefined 表示这档没有比例可报（无用例 / 运行中），只渲染文案 */
const hasRatio = computed(() => props.passed !== null && props.passed !== undefined)
</script>

<template>
  <span class="verdict" :data-tone="tone">
    <LoadingSpinner v-if="tone === 'info'" :size="spinnerSize" class="verdict__spin" />

    <span v-if="hasRatio" class="verdict__ratio">
      <span class="verdict__num">{{ passed }}</span>
      <span class="verdict__sep" aria-hidden="true">/</span>
      <span class="verdict__den">{{ total }}</span>
    </span>

    <span v-if="label" class="verdict__label">{{ label }}</span>
  </span>
</template>

<style scoped>
.verdict {
  /* 唯一的语义色出口：78% 语义色 + 22% 文字色，只染分子 */
  --v-tone: var(--text-dim);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: -0.01em;
  line-height: 1;
  color: var(--text-dim);
  white-space: nowrap;
  user-select: none;
}

/* 六种标准 tone：与 TestPanel 的判定词表完全同源 */
.verdict[data-tone='passed'] {
  --v-tone: var(--ok);
}

.verdict[data-tone='failed'] {
  --v-tone: var(--fail);
}

.verdict[data-tone='error'] {
  --v-tone: var(--err);
}

.verdict[data-tone='warn'] {
  --v-tone: var(--warn);
}

.verdict[data-tone='info'] {
  --v-tone: var(--info);
}

.verdict__spin {
  flex: 0 0 auto;
}

/* 比例数字：精密等宽，拆开分子 / 斜杠 / 分母三阶灰度 */
.verdict__ratio {
  display: inline-flex;
  align-items: baseline;
  font-family: var(--mono-font);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}

/* 语义色只轻染分子（混入 22% --text 降饱和），其余字符全中性 */
.verdict__num {
  font-weight: 500;
  color: color-mix(in srgb, var(--v-tone) 78%, var(--text));
}

.verdict[data-tone='muted'] .verdict__num,
.verdict:not([data-tone]) .verdict__num {
  color: var(--text-dim);
}

.verdict__sep {
  margin: 0 1px;
  font-size: 11px;
  font-weight: 400;
  color: color-mix(in srgb, var(--text-dim) 40%, transparent);
}

.verdict__den {
  font-size: 11.5px;
  font-weight: 400;
  color: var(--text-dim);
}

/* 附带文字（AC / 待重测 / 无测试用例）：继承界面字体，保持安静中性 */
.verdict__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-dim);
}
</style>

