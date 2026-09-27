<script setup>
/**
 * SidebarSwitcher —— 侧栏页头里的两个入口：面板切换 / 设置。
 *
 * 它被渲染在两个面板各自的页头里（同一时刻只有一个面板可见，视觉上只有一份），
 * 不再单独占一行页签栏。状态与持久化都在外层 Sidebar，经 provide 下发，
 * 本组件只负责渲染与派发。
 *
 * 资源管理器与评测样例的入口在 2026-09 合并成了一颗按钮：点一下在两个面板之间来回切，
 * 所以图标与文案画的是**将要去的那一个**，title 用「切换到…」这种祈使句。
 * 第二个（2026-09 顶栏删除后搬过来的）开关编辑区里的设置页签，与面板互不排斥，
 * 因此可按下状态（pressed）只有它才有，见 Sidebar.vue 的 entries。
 * 只画图标不写字：页头空间本来就紧张，名字靠 title / aria-label 交代。
 */
import { inject } from 'vue'
import AppIcon from './AppIcon.vue'

const { entries, select } = inject('sidebarTabs')
</script>

<template>
  <nav class="sidebar-switcher" aria-label="侧边栏面板与设置">
    <button
      v-for="entry in entries"
      :key="entry.id"
      type="button"
      class="sidebar-switcher__tab"
      :class="{ 'is-active': entry.pressed }"
      :title="entry.label"
      :aria-label="entry.label"
      :aria-pressed="entry.pressed"
      @click="select(entry.id)"
    >
      <AppIcon :name="entry.icon" size="16" />
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