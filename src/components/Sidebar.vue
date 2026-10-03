<script setup>
/**
 * Sidebar —— 统一侧边栏外壳：内容区按激活态切换两个面板
 * （具名插槽由 App.vue 填入 FileExplorer / TestPanel）。
 *
 * 两个面板都用 v-show 切换（不是 v-if）：文件树的展开态、评测样例里用户手写的输入
 * 与卡片折叠态都挂在 DOM 上，不能因切换而销毁重建。
 *
 * 切换入口不再单独占一行页签栏，而是渲染进两个面板各自的页头里
 * （见 SidebarSwitcher.vue）：同一时刻只有一个面板可见，视觉上仍只有一份。
 * 页签状态与持久化都留在这里，经 provide 下发给页头里的切换组件。
 *
 * 宽度与显隐不在这里管：外层 .pane--tests 作为一个整体参与与 Monaco 的分屏拖拽
 * （见 App.vue 的 .splitter 与 measureLimits）。
 */
import { computed, provide, ref } from 'vue'
import { t } from '../i18n/index.js'
import { usePersistentRef } from '../composables/usePersistentRef.js'
import { cfReady } from '../services/cfRuntime.js'
import {
  cfPickerTab,
  closeCfPickerTab,
  closeSettingsTab,
  openCfPickerTab,
  openSettingsTab,
  settingsTab,
} from '../services/editorViews.js'

// 侧边栏里的两个面板。数组顺序就是页头胶囊里两段的顺序。
// 只存 key：翻译必须发生在渲染那一刻（见 i18n 的调用纪律），下面的两个 computed 负责 t()。
const PANEL_TABS = [
  { id: 'explorer', labelKey: 'app.sidebar.explorer', icon: 'files' },
  { id: 'tests', labelKey: 'app.sidebar.tests', icon: 'cases' },
]

/** 给一个页签补上当前语言的显示名 */
const withLabel = (tab) => ({ ...tab, label: t(tab.labelKey) })

// 当前页签：默认落在资源管理器，与改动前的默认视觉一致
const activeTab = usePersistentRef('cp.sidebarTab', 'explorer')
// 存档里可能是旧值 / 脏值：认不出来就退回默认页签，免得两个面板被一起藏掉
if (!PANEL_TABS.some((tab) => tab.id === activeTab.value)) activeTab.value = 'explorer'

// 页头里的两组入口（2026-09-28 改了两轮，定稿形态见下）：
// - 两个面板合成一枚**胶囊开关**（见 SidebarSwitcher）：两段图标并排、当前段填亮，
//   但整枚胶囊是**一颗 toggle 按钮** —— 点轨道上任意位置（含内边距与当前段本身）
//   都翻到另一个面板。两段只负责「把两个面板和我在哪一个同时画出来」，不各自接点击：
//   光有一颗画「将要去的那一个」的动作钮看不出可切换（用户第一次反馈），
//   光有两段各自可点又留了 2px 死区、点边缘没反应（用户第二次反馈）。
// - 设置那颗独立：它开关的是编辑区里的合成页签，与面板互不排斥（见第 5 节坑 7），
//   不进胶囊（进同一个胶囊就暗示它也是面板之一，且是同一个单选组）。
const panels = computed(() =>
  PANEL_TABS.map((tab) => ({ ...withLabel(tab), active: tab.id === activeTab.value })),
)

// 胶囊上要写的是「将要去的那一个」：整枚是一个动作按钮，文案得说清点下去会去哪
const targetPanel = computed(() =>
  withLabel(PANEL_TABS.find((tab) => tab.id !== activeTab.value) ?? PANEL_TABS[0]),
)

// 滑动动画只在「用户点了胶囊」之后才放（见 SidebarSwitcher 的 data-switched）：
// 首屏那次渲染同样是「从隐藏变可见」，不拦一下就会平白播一次「切换」——那并不存在。
// 一次真的切换之后就常开：此后任何一次翻面（包括 App 里 showPanel 把人推过去）都该有动画。
const hasSwitched = ref(false)

function togglePanel() {
  // 只有两个面板时就是「另一个」；写成 find 是为了数组真变长时也不会错得很离谱
  const next = PANEL_TABS.find((tab) => tab.id !== activeTab.value)
  if (!next) return
  activeTab.value = next.id
  hasSwitched.value = true
}

function toggleSettings() {
  // 再点一次＝收起设置，回到刚才那个代码文件（与顶栏那颗齿轮的旧行为一致）
  settingsTab.active ? closeSettingsTab() : openSettingsTab()
}

/** Codeforces 那颗：开着就收起抽题页签，与设置齿轮同一套肌肉记忆 */
function toggleCfPicker() {
  cfPickerTab.active ? closeCfPickerTab() : openCfPickerTab()
}

// 设置那颗整条做成一个 computed 对象：属性跟着 settingsTab 走，
// 下发给子组件后在模板里直接写 settings.active 就行（不用 .value）
const settingsEntry = computed(() => ({
  icon: 'gear',
  label: t('app.settings'),
  active: settingsTab.active,
}))

// 抽题组件那颗：它默认安装（启动时静默预取题库），但预取未完成前页头里根本不该有它 ——
// 所以是 ready 驱动的显示/隐藏，而不是禁用态。状态在 services/cfRuntime.js 里，侧栏与
// 设置页那一行读的是同一个 cfReady。
// 点它开的是编辑区里的合成页签（与设置同形态），所以与齿轮并排、不进胶囊。
const cfPickerEntry = computed(() => ({
  icon: 'codeforces',
  label: t('cf.button.label'),
  title: t(cfPickerTab.active ? 'cf.button.close' : 'cf.button.open'),
  active: cfPickerTab.active,
  ready: cfReady.value,
  toggle: toggleCfPicker,
}))

provide('sidebarTabs', {
  panels,
  targetPanel,
  togglePanel,
  hasSwitched,
  settings: settingsEntry,
  toggleSettings,
  cfPicker: cfPickerEntry,
})

// 供父组件从外部切到指定面板（如 App.vue 在开跑时要把「评测样例」亮出来）。
// 状态与持久化仍只在这一处，这里只是多一个入口，不让父组件自己存一份
function showPanel(id) {
  if (PANEL_TABS.some((tab) => tab.id === id)) activeTab.value = id
}
defineExpose({
  showPanel,
  // 供快捷键用（App.vue 的 switch-panel）：与点胶囊走的是同一个 togglePanel，
  // 所以动画、hasSwitched、持久化都一致，不会出现「键盘切过去没动画」这种两套行为
  switchPanel: togglePanel,
  // 供折叠态那条图标栏用（ActivityBar）：它要画「有哪两个面板、我停在哪一个」，
  // 但它不是本组件的子组件（是工作区的兄弟节点），inject 够不到这里的 provide，
  // 所以由 App 把这份（已翻译、带 active 的）表透传过去，状态仍只有这里一份
  panels,
})
</script>

<template>
  <div class="sidebar">
    <div class="sidebar__body">
      <!-- data-panel：「现在停在哪个面板」的机器可读出处（无头回归按它判）。
           页头胶囊虽然也画了当前段，但从 DOM 反推「哪一段算选中」要连着读 class，
           不如在这里直接标一个数据集属性稳。 -->
      <div v-show="activeTab === 'explorer'" class="sidebar__panel" data-panel="explorer">
        <slot name="explorer" />
      </div>
      <div v-show="activeTab === 'tests'" class="sidebar__panel" data-panel="tests">
        <slot name="tests" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--bg-panel);
}

/* ---------------------------------------------------------------- 内容区
   占满剩余高度；面板过长时由面板自己滚动，不撑破外层卡片 */
.sidebar__body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.sidebar__panel {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
</style>
