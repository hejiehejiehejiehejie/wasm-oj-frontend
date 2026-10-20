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
 * 底部贴底两枚＝编辑区里的合成页签（Codeforces / 设置）：与页头那两颗同源，
 * 同样不展开侧栏 —— 它们开的是编辑区里的页签，不是侧栏面板。
 * Codeforces 那颗 2026-10-19 起与页头同口径：点它弹组件菜单（CfMenu），
 * 菜单里挑「随机抽题 / 比赛」；它贴着屏幕边缘，所以 placement="beside"。
 *
 * 面板数据由 App 从 Sidebar 的 defineExpose 透传进来（状态只有一份，仍是 cp.sidebarTab），
 * 本组件不自己存一份。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import CfMenu from './CfMenu.vue'
import SettingsMenu from './SettingsMenu.vue'
import { t } from '../i18n/index.js'
import { cfReady } from '../services/cfRuntime.js'
import { cfContestTab, cfPickerTab, settingsTab } from '../services/editorViews.js'

defineProps({
  /** Sidebar 透传的面板表：{ id, icon, label, active } */
  panels: { type: Array, default: () => [] },
})
defineEmits(['select'])

// ------------------------------------------------------------ 两个下拉菜单
// 齿轮弹 SettingsMenu、Codeforces 那颗弹 CfMenu，机制与侧栏页头同款。
// 菜单在捕获阶段用 pointerdown 收自己，所以点按钮想关菜单时会先被那一层收掉、
// 按钮的 click 又进来，得记一笔「刚刚那一发是不是点在它身上」。
const menuAnchor = ref(null)
const menuButton = ref(null)
const cfMenuAnchor = ref(null)
const cfMenuButton = ref(null)

let suppressOpen = false
let suppressCfOpen = false

function onGlobalPointerDown(event) {
  suppressOpen = Boolean(menuAnchor.value && menuButton.value?.contains(event.target))
  suppressCfOpen = Boolean(cfMenuAnchor.value && cfMenuButton.value?.contains(event.target))
}

function toggleMenu() {
  if (suppressOpen) {
    suppressOpen = false
    return
  }
  menuAnchor.value = menuAnchor.value ? null : menuButton.value?.getBoundingClientRect() ?? null
}

function closeMenu() {
  menuAnchor.value = null
}

function toggleCfMenu() {
  if (suppressCfOpen) {
    suppressCfOpen = false
    return
  }
  cfMenuAnchor.value = cfMenuAnchor.value ? null : cfMenuButton.value?.getBoundingClientRect() ?? null
}

function closeCfMenu() {
  cfMenuAnchor.value = null
}

onMounted(() => window.addEventListener('pointerdown', onGlobalPointerDown, true))
onBeforeUnmount(() => window.removeEventListener('pointerdown', onGlobalPointerDown, true))
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
        <AppIcon :name="panel.icon" size="24" />
      </button>
    </div>

    <!-- 贴底：Codeforces 是可卸载的可选模块（没下载过就整颗不渲染），齿轮是常驻的那个。
         那颗点开的是组件菜单（与页头同款），开着任一 CF 页签时提亮。 -->
    <div class="activity-bar__group activity-bar__group--tools">
      <button
        v-if="cfReady"
        ref="cfMenuButton"
        type="button"
        class="activity-bar__item"
        :class="{ 'is-active': cfPickerTab.active || cfContestTab.active }"
        :title="t('cf.menu.title')"
        :aria-label="t('cf.menu.title')"
        aria-haspopup="menu"
        :aria-expanded="Boolean(cfMenuAnchor)"
        @click="toggleCfMenu"
      >
        <AppIcon name="codeforces" size="24" />
      </button>

      <button
        ref="menuButton"
        type="button"
        class="activity-bar__item"
        :class="{ 'is-active': settingsTab.active }"
        :title="t('app.settings')"
        :aria-label="t('app.settings')"
        aria-haspopup="menu"
        :aria-expanded="Boolean(menuAnchor)"
        @click="toggleMenu"
      >
        <AppIcon name="gear" size="24" />
      </button>

      <SettingsMenu v-if="menuAnchor" :anchor="menuAnchor" placement="beside" @close="closeMenu" />
      <CfMenu v-if="cfMenuAnchor" :anchor="cfMenuAnchor" placement="beside" @close="closeCfMenu" />
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
}

/* 展开态不写规则：这一栏的在场与否由 App 的 v-show 决定（判据与 is-collapsed 同源），
   展开那一刻整条就是 display: none，不进布局、也不需要先把宽度让出去。
   2026-10-14 之前这里有一条 `.activity-bar:not(.is-collapsed) { flex-basis: 0 }`，
   那是给 CSS 补间路径当「宽度让位」用的 —— 补间路径已删，这条再也没有可能命中。 */

.activity-bar__group {
  display: flex;
  flex-direction: column;
  /* 方块定宽 40px + 固定左边距 3px，靠 flex-start 钉在同一列（别改成 center / stretch：
     这一栏伸缩时容器在变窄，居中会让方块跟着横移） */
  align-items: flex-start;
  /* 相邻两格的间隔：格里是 24px 图标、方块 40×40，不留间隔时两枚图标是「紧挨着的两个方块」，
     加 4px 后图标之间的呼吸感与 VS Code 接近（间距只加在这里，方块本身的可点面积不变） */
  gap: 4px;
}

/* 40×40 的圆角方块：hover 时整块提亮（而不是只提亮图标），可点范围一眼可见。
   尺寸写死（原来给的是 100%）：伸缩时这一栏的宽度会变，方块若跟着变窄，
   图标就会在方块里居中位移、看着像在飘；定宽 + 固定左边距之后方块钉在原地，
   由 .activity-bar 的 overflow: hidden 把它裁出去。 */
.activity-bar__item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  /* 2026-10-11：可点区从「整宽 48×40 长条」改成 40×40 的圆角正方形（用户要求），
     格子四周的留白因此不再进可点范围。左边距 3px = (栏 48 − 左右 1px 边框 − 方块 40) / 2，
     方块在栏内水平居中（用户反馈：4px 时右边只剩 2px，看得出来偏左）；
     仍用固定边距而不是居中对齐：这一栏伸缩时宽度从右边变，固定的左边距让方块
     一直钉在同一列上，不会随容器变窄而横移。半径 10px 与这条栏自己的圆角同值。 */
  width: 40px;
  height: 40px;
  margin-left: 3px;
  padding: 0;
  border: none;
  border-radius: 10px;
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