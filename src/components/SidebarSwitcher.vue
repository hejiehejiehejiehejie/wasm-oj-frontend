<script setup>
/**
 * SidebarSwitcher —— 侧栏页头里的三个入口：资源管理器 / 评测样例 / 设置。
 *
 * 它被渲染在两个面板各自的页头里（同一时刻只有一个面板可见，视觉上只有一份），
 * 不再单独占一行页签栏。状态与持久化都在外层 Sidebar，经 provide 下发，
 * 本组件只负责渲染与派发切换。
 *
 * 前两个切换侧边栏里的面板；第三个（2026-09 顶栏删除后搬过来的）开关编辑区里的
 * 设置页签，所以三者的高亮是各自判的（见 Sidebar.vue 的 isActive）。
 * 只画 logo 不写字：页头空间本来就紧张，名字靠 title / aria-label 交代。
 */
import { inject } from 'vue'
import AppIcon from './AppIcon.vue'

const { tabs, isActive, select } = inject('sidebarTabs')
</script>

<template>
  <nav class="sidebar-switcher" aria-label="侧边栏面板">
    <button
      v-for="tab in tabs"
      :key="tab.id"
      type="button"
      class="sidebar-switcher__tab"
      :class="{ 'is-active': isActive(tab.id) }"
      :title="tab.label"
      :aria-label="tab.label"
      :aria-pressed="isActive(tab.id)"
      @click="select(tab.id)"
    >
      <AppIcon :name="tab.icon" size="16" />
    </button>
  </nav>
</template>

<style scoped>
.sidebar-switcher {
  display: inline-flex;
  align-items: stretch;
  /* 26px 高 + 页头上下各 4px 内边距 + 1px 下边框 = 35px，与面板头同高 */
  height: 26px;
  flex: 0 0 auto;
}

.sidebar-switcher__tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  padding: 0;
  border: none;
  /* 常驻 2px 透明底边：激活时只换颜色，行高不跳 */
  border-bottom: 2px solid transparent;
  border-radius: 0;
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  transition: color 0.16s ease, background-color 0.16s ease, border-color 0.16s ease;
}

.sidebar-switcher__tab:hover {
  color: var(--text);
  background: var(--bg-hover);
}

.sidebar-switcher__tab.is-active {
  color: var(--text);
  background: var(--bg-panel);
  border-bottom-color: var(--focus);
}
</style>