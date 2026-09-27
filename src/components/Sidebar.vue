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
import { computed, provide } from 'vue'
import { usePersistentRef } from '../composables/usePersistentRef.js'
import { closeSettingsTab, openSettingsTab, settingsTab } from '../services/settingsTab.js'

// 侧边栏里的两个面板
const PANEL_TABS = [
  { id: 'explorer', label: '资源管理器', icon: 'files' },
  { id: 'tests', label: '评测样例', icon: 'cases' },
]

// 当前页签：默认落在资源管理器，与改动前的默认视觉一致
const activeTab = usePersistentRef('cph.sidebarTab', 'explorer')
// 存档里可能是旧值 / 脏值：认不出来就退回默认页签，免得两个面板被一起藏掉
if (!PANEL_TABS.some((tab) => tab.id === activeTab.value)) activeTab.value = 'explorer'

// 两个面板的入口在 2026-09 合并成了一颗按钮：点一下在两个面板之间来回切。
// 所以它画的是**将要去的那一个**（图标与文案都是），而不是当前这个 ——
// 只画图标不写字，画当前的话用户没法预判点下去会发生什么。
const targetPanel = computed(
  () => PANEL_TABS.find((tab) => tab.id !== activeTab.value) ?? PANEL_TABS[0],
)

// 页头里并排的两个入口：面板切换 + 编辑区里那个「设置」合成页签的开关
// （2026-09 顶栏删除后从齿轮按钮搬过来的）。后者不是面板，不参与下面的 v-show 切换。
// pressed 只有「设置」才有：面板那颗是动作按钮（点它执行切换），不是可按下状态。
const entries = computed(() => [
  { id: 'panel', icon: targetPanel.value.icon, label: `切换到${targetPanel.value.label}` },
  { id: 'settings', icon: 'gear', label: '设置', pressed: settingsTab.active },
])

function selectEntry(id) {
  if (id === 'settings') {
    // 再点一次＝收起设置，回到刚才那个代码文件（与顶栏那颗齿轮的旧行为一致）
    settingsTab.active ? closeSettingsTab() : openSettingsTab()
    return
  }
  activeTab.value = targetPanel.value.id
}

provide('sidebarTabs', { entries, select: selectEntry })

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
      <!-- data-panel：页头的切换钮画的是「将要去的那一个」，不再是当前面板的名字，
           所以「现在停在哪个面板」需要一个机器可读的出处（无头回归按它判）。 -->
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
