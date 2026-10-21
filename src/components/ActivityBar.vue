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
 * 底部贴底两枚＝编辑区里的合成页签（组件 / 设置）：与页头那两颗同源，
 * 同样不展开侧栏 —— 它们开的是编辑区里的页签，不是侧栏面板。
 * 「组件」那颗（2026-10-20 起由 Codeforces 那颗改名而来）点它弹组件菜单（ComponentsMenu），
 * 菜单里按类分组挑：Codeforces（随机抽题 / 比赛）与工具（倒计时）；它贴着屏幕边缘，
 * 所以 placement="beside"。按钮常驻 —— 工具类与 Codeforces 装没装无关。
 *
 * 面板数据由 App 从 Sidebar 的 defineExpose 透传进来（状态只有一份，仍是 cp.sidebarTab），
 * 本组件不自己存一份。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import ComponentsMenu from './ComponentsMenu.vue'
import SettingsMenu from './SettingsMenu.vue'
import { t } from '../i18n/index.js'
import { countdown } from '../services/countdown.js'
import { cfContestTab, cfPickerTab, settingsTab } from '../services/editorViews.js'

defineProps({
  /** Sidebar 透传的面板表：{ id, icon, label, active } */
  panels: { type: Array, default: () => [] },
})
defineEmits(['select'])

// ------------------------------------------------------------ 两个下拉菜单
// 齿轮弹 SettingsMenu、组件那颗弹 ComponentsMenu，机制与侧栏页头同款。
// 菜单在捕获阶段用 pointerdown 收自己，所以点按钮想关菜单时会先被那一层收掉、
// 按钮的 click 又进来，得记一笔「刚刚那一发是不是点在它身上」。
const menuAnchor = ref(null)
const menuButton = ref(null)
const compMenuAnchor = ref(null)
const compMenuButton = ref(null)

let suppressOpen = false
let suppressCompOpen = false

function onGlobalPointerDown(event) {
  suppressOpen = Boolean(menuAnchor.value && menuButton.value?.contains(event.target))
  suppressCompOpen = Boolean(compMenuAnchor.value && compMenuButton.value?.contains(event.target))
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

function toggleCompMenu() {
  if (suppressCompOpen) {
    suppressCompOpen = false
    return
  }
  compMenuAnchor.value = compMenuAnchor.value ? null : compMenuButton.value?.getBoundingClientRect() ?? null
}

function closeCompMenu() {
  compMenuAnchor.value = null
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

    <!-- demo · 方向一：胶囊形态下两簇不再顶到条的两端（条本身已按内容定高），
         中间用一条 20px 的细线分组。横排（窄屏）时它自己转 90° 变成竖线，见样式。 -->
    <span class="activity-bar__divider" aria-hidden="true"></span>

    <!-- 贴底：组件与齿轮都是常驻入口。组件那颗点开组件菜单（与页头同款），
         开着任一组件（两个 CF 页签或倒计时卡）时提亮。 -->
    <div class="activity-bar__group activity-bar__group--tools">
      <button
        ref="compMenuButton"
        type="button"
        class="activity-bar__item"
        :class="{ 'is-active': cfPickerTab.active || cfContestTab.active || countdown.open }"
        :title="t('components.menu.title')"
        :aria-label="t('components.menu.title')"
        aria-haspopup="menu"
        :aria-expanded="Boolean(compMenuAnchor)"
        @click="toggleCompMenu"
      >
        <AppIcon name="grid" size="24" />
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
      <ComponentsMenu v-if="compMenuAnchor" :anchor="compMenuAnchor" placement="beside" @close="closeCompMenu" />
    </div>
  </nav>
</template>

<style scoped>
/* 与两块 .pane 同一种卡片外观（圆角 / 细边 / 面板底色），只是收窄成 48px 一竖条。
   边框用 --border-faint 而不是 .pane 那条 --border-soft：折叠态下它是全界面唯一在场
   的卡片边界（侧栏收起、编辑器那半张卡离得远），同一支笔在这里会偏亮、抢戏。
   宽度写 px 即可随全局缩放：postcss-pxtorem 会把它转成 rem（JS 不读这个值）。

   demo · 方向一（完整版，2026-10-21 第二版）：**脱排版**。不再当 flex 子项（原来的
   `flex: 0 0 48px` 作废），改成 absolute 浮在工作区上 —— 那个 48px 因此真正还给了编辑器
   （1400 档 1335 → 1383）。代价是它压在编辑器左侧那一列上，实测：与 Monaco 行号槽
   相交 42px、与代码正文相交 **0px**（只盖住中间那几行的行号）；窄屏 Dock 横过来
   压住底部 50px 的代码。
   上下两簇仍按内容定高，所以是一枚胶囊而不是一根通天的框。

   ⚠️ 居中**不用 transform**：横幅菜单（SettingsMenu）是 position: fixed，
   祖先链上只要出现 transform，fixed 就改以它为参照，菜单会整体跑偏 ——
   这正是备案 §1「代价」第一条点名的坑。改用纯盒模型：
   `top: 0; bottom: 0` + `height: fit-content` + `margin-block: auto`，
   两个 auto 外边距平分剩余空间，效果同居中但不产生 transform。

   ⚠️ 窄屏横排里它变成一枚**居中的悬浮 Dock**（见 App.vue 那组 is-narrow 规则：
   width/height: fit-content + left/right 归零 + margin-inline: auto）。 */
.activity-bar {
  position: absolute;
  top: 0;
  bottom: 0;
  /* 压在编辑器卡片之上，也压过分隔条那条 12px 热区（它 z-index: 5）：
     折叠态两者本来就抢同一块位置，让胶囊赢 —— 它是唯一看得见的东西 */
  z-index: 6;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: stretch;
  width: 48px;
  height: fit-content;
  /* 垂直居中（两个 auto 平分 top/bottom 归零后的剩余空间） */
  margin-block: auto;
  padding: 4px 0;
  overflow: hidden;
  border-radius: 10px;
  border: 1px solid var(--border-faint);
  background: var(--bg-panel);
}

/* demo · 方向一 · 可选的毛玻璃形态（默认不启用，评审时在 devtools 里把根元素的
   data-dock 改成 glass 就能对比）。⚠️ 与 2026-10-21 去掉倒计时卡毛玻璃的决定冲突 ——
   那次的理由是「叠字发糊」，而胶囊浮在代码之上，正是同一类场景，所以默认仍是实色。
   半透明比例取 0.72：再低会看不清它自己的边界，再高 blur 就看不出来。 */
.activity-bar[data-dock='glass'] {
  background: color-mix(in srgb, var(--bg-panel) 72%, transparent);
  backdrop-filter: blur(14px) saturate(120%);
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

/* 叠在一起的两簇之间那条分组线（demo · 方向一）。
   20px 长、1px 粗，左端对齐方块的中轴：方块左边距 3 + (40 − 20) / 2 = 13。
   上下各 2px 外边距 —— 配合组内 4px 的 gap，两条簇之间净空约 9px（比格间距 4 大一档，
   分组的界线才读得出来）。横排（窄屏）时它自己转 90°，见文件末尾那组窄屏规则。 */
.activity-bar__divider {
  flex: 0 0 auto;
  width: 20px;
  height: 1px;
  margin: 2px 0 2px 13px;
  background: var(--border-soft);
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

/* 横排（窄屏）里分组线转 90°：1px 宽、20px 高，居中 —— 与竖排里那条是同一根线，
   只是主轴翻了面。窄屏下这条栏本身已被 App.vue 还原成 stretch（见那边的注释）。 */
:where(html.is-narrow) .activity-bar__divider {
  width: 1px;
  height: 20px;
  margin: 0;
}
</style>