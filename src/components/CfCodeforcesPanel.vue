<template>
  <!-- 合并后的 Codeforces 组件（2026-10-27）：抽题与比赛塞进同一个合成页签。
       两个子面板各自是 absolute 铺满的 .cf-view，所以这里给它们一个 position: relative
       的 stage；抬头只负责「抽题 / 比赛」这一层切换，子面板自己的抬头先原样留着。
       UI 之后再设计：现在只求两套功能都能从这一个页签进来。 -->
  <div class="cf-codeforces" data-native-focus>
    <header class="cf-codeforces__bar">
      <span class="cf-codeforces__title">{{ t('cf.view.title') }}</span>
      <span class="cf-codeforces__modes">
        <button
          v-for="item in MODES"
          :key="item"
          type="button"
          class="cf-codeforces__seg"
          :class="{ 'is-on': mode === item }"
          @click="mode = item"
        >
          {{ t(`cf.view.mode.${item}`) }}
        </button>
      </span>
    </header>

    <div class="cf-codeforces__stage">
      <CfPickerPanel v-show="mode === 'picker'" />
      <CfContestPanel
        v-show="mode === 'contest'"
        :active="props.active && mode === 'contest'"
        @submit-active="emit('submit-active')"
      />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

import CfContestPanel from './CfContestPanel.vue'
import CfPickerPanel from './CfPickerPanel.vue'
import { t } from '../i18n/index.js'

const emit = defineEmits(['submit-active'])

/**
 * 这一整页（合成页签）此刻露没露出来。子面板是常驻挂载的，只在模板里 v-show 它们
 * 看不见这件事 —— 没有这个 prop，赛程会在整页启动时就取数（报名状态还会让扩展开一个 CF 页）。
 */
const props = defineProps({
  active: { type: Boolean, default: true },
})

const MODES = ['picker', 'contest']

/** 打开时先落在抽题（比赛那侧原来的默认页是赛程，仍留在它自己的模式轴里） */
const mode = ref('picker')
</script>

<style scoped>
.cf-codeforces {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
}

/* 抬头与子面板的 .cf-bar 同一档高度与配色，切换条不抢内容区的高度 */
.cf-codeforces__bar {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 28px;
  padding: 2px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-panel-head);
}

.cf-codeforces__title {
  color: var(--text-dim);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.cf-codeforces__modes {
  display: inline-flex;
}

/* 直角分段（与比赛的赛程/比赛开关同一套语言），不做胶囊 */
.cf-codeforces__seg {
  height: 20px;
  padding: 0 10px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-faint);
  font-family: var(--ui-font);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  cursor: pointer;
}

.cf-codeforces__seg + .cf-codeforces__seg {
  border-left: none;
}

.cf-codeforces__seg:hover {
  color: var(--text);
}

.cf-codeforces__seg.is-on {
  background: var(--bg-control);
  color: var(--text);
}

/* 子面板的 .cf-view 是 absolute inset: 0，容器必须是定位上下文，
   同时要让出抬头那一行 —— min-height: 0 让内容自己滚动而不是把整列撑高 */
.cf-codeforces__stage {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
}
</style>
