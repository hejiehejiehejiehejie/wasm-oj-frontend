<script setup>
/**
 * ActivityBar —— 侧边栏折叠后顶替它的竖向图标栏（仿 VS Code 的 Activity Bar）。
 *
 * 只在折叠时出现：展开时页头里仍是「胶囊 + 齿轮」那一套（见 SidebarSwitcher），
 * 折叠后侧栏整栏 display:none，改由这条 48px 的图标栏承接入口 ——
 * 否则用户只能靠分隔条那条隐形热区把侧栏捞回来。
 *
 * 顶部两枚＝侧边栏的两个面板：点一下＝展开侧栏并切到该面板（展开那段在 App.vue 的
 * selectSidebarPanel 里，本组件只负责派发 select）。
 * 底部贴底两枚＝编辑区里的两个合成页签（抽题 / 设置）：与页头那两颗同源，
 * 同样不展开侧栏 —— 它们开的是编辑区里的页签，不是侧栏面板。
 *
 * 面板数据由 App 从 Sidebar 的 defineExpose 透传进来（状态只有一份，仍是 cp.sidebarTab），
 * 本组件不自己存一份。
 */
import AppIcon from './AppIcon.vue'
import { t } from '../i18n/index.js'
import { cfReady } from '../services/cfRuntime.js'
import {
  cfPickerTab,
  closeCfPickerTab,
  closeSettingsTab,
  openCfPickerTab,
  openSettingsTab,
  settingsTab,
} from '../services/editorViews.js'

defineProps({
  /** Sidebar 透传的面板表：{ id, icon, label, active } */
  panels: { type: Array, default: () => [] },
})
defineEmits(['select'])

// 与页头那两颗同一套肌肉记忆：开着再点一次＝收起
function toggleSettings() {
  settingsTab.active ? closeSettingsTab() : openSettingsTab()
}
function toggleCfPicker() {
  cfPickerTab.active ? closeCfPickerTab() : openCfPickerTab()
}
</script>

<template>
  <nav class="activity-bar" :aria-label="t('app.sidebar.switcherLabel')">
    <div class="activity-bar__group activity-bar__group--panels">
      <button
        v-for="panel in panels"
        :key="panel.id"
        type="button"
        class="activity-bar__item"
        :class="{ 'is-active': panel.active }"
        :data-panel="panel.id"
        :title="panel.label"
        :aria-label="panel.label"
        :aria-pressed="panel.active"
        @click="$emit('select', panel.id)"
      >
        <AppIcon :name="panel.icon" size="20" />
      </button>
    </div>

    <!-- 贴底：抽题是可卸载的可选模块（没下载过就整颗不渲染），齿轮是常驻的那个 -->
    <div class="activity-bar__group activity-bar__group--tools">
      <button
        v-if="cfReady"
        type="button"
        class="activity-bar__item"
        :class="{ 'is-active': cfPickerTab.active }"
        :title="t(cfPickerTab.active ? 'cf.button.close' : 'cf.button.open')"
        :aria-label="t('cf.button.label')"
        :aria-pressed="cfPickerTab.active"
        @click="toggleCfPicker"
      >
        <AppIcon name="codeforces" size="20" />
      </button>

      <button
        type="button"
        class="activity-bar__item"
        :class="{ 'is-active': settingsTab.active }"
        :title="t('app.settings')"
        :aria-label="t('app.settings')"
        :aria-pressed="settingsTab.active"
        @click="toggleSettings"
      >
        <AppIcon name="gear" size="20" />
      </button>
    </div>
  </nav>
</template>

<style scoped>
/* 与两块 .pane 同一种卡片外观（圆角 / 细边 / 面板底色），只是收窄成 48px 一竖条。
   宽度写 px 即可随全局缩放：postcss-pxtorem 会把它转成 rem（JS 不读这个值）。 */
.activity-bar {
  flex: 0 0 48px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: stretch;
  padding: 4px 0;
  overflow: hidden;
  border-radius: 8px;
  border: 1px solid var(--border-soft);
  background: var(--bg-panel);
}

.activity-bar__group {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  /* 相邻两格的间隔：格里是 20px 图标、格高 40px，不留间隔时两枚图标是「紧挨着的两个格子」，
     加 4px 后图标之间的呼吸感与 VS Code 接近（间距只加在这里，格子的可点面积不变） */
  gap: 4px;
}

/* 48×40 的整宽图标格：hover 时整格提亮（而不是只提亮图标），可点范围一眼可见 */
.activity-bar__item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 40px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  transition: color 0.16s ease, background-color 0.16s ease;
}

/* 选中态只提亮图标，**不画那道左缘 2px 主题色指示条**（2026-10-04 用户反馈去掉了）：
   图标栏只有一列、不分段，提亮已经说得清「这一个开着」，再加一条线就是多余的噪音。
   hover 另有自己的一套反馈 —— 那是「这一格能点」的信号，不是选中态。 */
.activity-bar__item:hover {
  color: var(--text);
  background: var(--bg-hover);
}

/* 上下两组在选中态上刻意不对称（2026-10-04）：
   上面两格是侧栏面板的入口，而折叠态下**总有一个面板是 active** —— 给它提亮就等于常驻高亮；
   何况点一下本来就会把侧栏展开，真实状态在那时看得见，这里不必先报一遍。
   下面两格是编辑区里的合成页签（抽题 / 设置），它们不会展开侧栏，
   开着时得在这条栏上直接看出来，所以保留提亮。 */
.activity-bar__group--tools .activity-bar__item.is-active {
  color: var(--text);
}
</style>