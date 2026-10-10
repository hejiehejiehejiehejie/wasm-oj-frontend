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
   边框用 --border-faint 而不是 .pane 那条 --border-soft：折叠态下它是全界面唯一在场
   的卡片边界（侧栏收起、编辑器那半张卡离得远），同一支笔在这里会偏亮、抢戏。
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
  border-radius: 10px;
  border: 1px solid var(--border-faint);
  background: var(--bg-panel);
  /* 侧栏收起 / 展开时这一栏跟着伸缩（宽度过渡 200ms，与布局切换同一支曲线）；
     展开方向还要整条淡出（见下面那条），与宽度同一支曲线、同一段时长。
     透明度走 transition 而不是 animation：动画中途掉头（展开没播完就点折叠）时
     透明度会从当前值平滑掉头，而 animation 会在规则撤掉的那一帧直接跳回 1，白闪一下。 */
  transition: flex-basis 200ms cubic-bezier(0.22, 0.61, 0.36, 1),
    opacity 200ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

/* 展开方向：这一栏把位置让给长出来的侧栏，整条（连同图标）一起淡出 ——
   与宽度段同长同曲线，抽屉从它背后滑出的同时它原地溶解，而不是被侧栏边缘一刀切掉。
   挂在 is-animating 上（而不是只挂 :not(.is-collapsed)）：减弱动效下 App 不给 is-animating，
   这条规则不存在，栏跟着布局直切，与其它几处的口径一致。
   闸门（PANEL_LOCK_MS）摘掉 is-animating 的那一帧，整条栏正好被 display 收起，
   透明度回到 1 也看不见，不会回闪。 */
.activity-bar.is-animating:not(.is-collapsed) {
  opacity: 0;
}

/* 侧栏是展开的（含展开动画进行中）：这一栏宽度收到 0，把位置让给长出来的侧栏。
   折叠态什么都不用写 —— 上面那条 flex 就是它的 48px。
   宽度不能像别处那样走内联 style：48px 会被 postcss-pxtorem 转成 rem 跟着全局缩放走，
   JS 里内联的 px 不会，界面缩放到 150% 时两边就对不上了。 */
.activity-bar:not(.is-collapsed) {
  flex-basis: 0;
}

/* 第二段：浮现。折叠时这一栏从 0 长到 48px，图标要等宽度那一段收好了才出现 ——
   延迟期间靠 backwards 停在 opacity 0，也就是宽度整段里这一栏是空白的。
   挂在 is-animating 上而不是只挂 is-collapsed：一来「减弱动效」下 App 不给 is-animating，
   这条规则干脆不存在，图标从第一帧就该是可见的（否则会先按 backwards 空一帧）；
   二来闸门摘掉的时刻正好是这段动画结束的时刻，撤销时不会有回跳。
   展开方向不挂这一下：那边是侧栏的页头控件与内容在浮现（见 App.vue），
   而这一栏在那边是整条淡出（见上面那条），不需要图标再单独淡一次。
   延迟 / 时长与 App.vue 的 PANEL_LOCK_MS 同源，改一处要一起改。 */
.activity-bar.is-animating.is-collapsed .activity-bar__item svg {
  animation: activity-bar-icon-in 120ms cubic-bezier(0.22, 0.61, 0.36, 1) 180ms backwards;
}

@keyframes activity-bar-icon-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.activity-bar__group {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  /* 相邻两格的间隔：格里是 20px 图标、格高 40px，不留间隔时两枚图标是「紧挨着的两个格子」，
     加 4px 后图标之间的呼吸感与 VS Code 接近（间距只加在这里，格子的可点面积不变） */
  gap: 4px;
}

/* 48×40 的整宽图标格：hover 时整格提亮（而不是只提亮图标），可点范围一眼可见。
   宽度写死成 48px（原来给的是 100%）：伸缩时这一栏的宽度会变，格子若跟着变窄，
   图标就会在格子里居中位移、看着像在飘；定宽之后格子钉在原地，由 .activity-bar 的
   overflow: hidden 把它裁出去。 */
.activity-bar__item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
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