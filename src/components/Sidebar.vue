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
import { provide } from 'vue'
import { usePersistentRef } from '../composables/usePersistentRef.js'
import { closeSettingsTab, openSettingsTab, settingsTab } from '../services/settingsTab.js'

// 侧边栏里的两个面板
const PANEL_TABS = [
  { id: 'explorer', label: '资源管理器', icon: 'files' },
  { id: 'tests', label: '评测样例', icon: 'cases' },
]

// 页头里并排的三个入口。第三个不是面板，而是编辑区里那个「设置」合成页签的开关
// （2026-09 顶栏删除后从齿轮按钮搬过来的），所以它只参与渲染，不参与下面的 v-show 切换
const TABS = [...PANEL_TABS, { id: 'settings', label: '设置', icon: 'gear' }]

// 当前页签：默认落在资源管理器，与改动前的默认视觉一致
const activeTab = usePersistentRef('cph.sidebarTab', 'explorer')
// 存档里可能是旧值 / 脏值：认不出来就退回默认页签，免得两个面板被一起藏掉
if (!PANEL_TABS.some((tab) => tab.id === activeTab.value)) activeTab.value = 'explorer'

// 两个面板与「设置」互不排斥（设置开在编辑区、面板照旧显示），所以这里逐项判高亮
function isActive(id) {
  return id === 'settings' ? settingsTab.active : activeTab.value === id
}

function selectTab(id) {
  if (id === 'settings') {
    // 再点一次＝收起设置，回到刚才那个代码文件（与顶栏那颗齿轮的旧行为一致）
    settingsTab.active ? closeSettingsTab() : openSettingsTab()
    return
  }
  if (PANEL_TABS.some((tab) => tab.id === id)) activeTab.value = id
}

provide('sidebarTabs', { tabs: TABS, isActive, select: selectTab })

// 供父组件从外部切到指定面板（如 App.vue 在开跑时要把「评测样例」亮出来）。
// 状态与持久化仍只在这一处，这里只是多一个入口，不让父组件自己存一份
function showPanel(id) {
  if (PANEL_TABS.some((tab) => tab.id === id)) activeTab.value = id
}
defineExpose({ showPanel })
</script>

<template>
  <div class="sidebar">
    <div class="sidebar__body">
      <div v-show="activeTab === 'explorer'" class="sidebar__panel">
        <slot name="explorer" />
      </div>
      <div v-show="activeTab === 'tests'" class="sidebar__panel">
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
