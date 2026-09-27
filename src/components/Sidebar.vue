<script setup>
/**
 * Sidebar —— 工作区左侧栏外壳：只管壳（背景 / 右缘调宽 / 响应式抽屉），
 * 内容由 FileExplorer 经插槽填入。
 *
 * 桌面：flex 子项，隐藏时 display:none，不占工作区宽度。
 * 窄屏（≤520px）：fixed 覆盖抽屉 + 半透明遮罩，宽度 86vw。
 */
import { onBeforeUnmount, ref } from 'vue'
import { setSidebarWidth, toggleSidebar, workspace } from '../services/vfs/workspaceStore.js'

const NARROW_QUERY = '(max-width: 520px)'
const narrowMedia = window.matchMedia(NARROW_QUERY)
const isNarrow = ref(narrowMedia.matches)
narrowMedia.addEventListener('change', onNarrowChange)
function onNarrowChange(event) {
  isNarrow.value = event.matches
}

// ------------------------------------------------------------ 右缘拖拽调宽

let resizing = false

function startResize(event) {
  if (isNarrow.value) return
  event.preventDefault()
  resizing = true
  const startX = event.clientX
  const startWidth = workspace.sidebarWidth

  function onPointerMove(moveEvent) {
    if (!resizing) return
    setSidebarWidth(startWidth + (moveEvent.clientX - startX))
  }
  function onPointerUp() {
    resizing = false
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
  }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
}

onBeforeUnmount(() => {
  narrowMedia.removeEventListener('change', onNarrowChange)
})
</script>

<template>
  <aside
    v-if="workspace.sidebarVisible"
    class="sidebar"
    :class="{ 'sidebar--drawer': isNarrow }"
    :style="isNarrow ? undefined : { width: `${workspace.sidebarWidth}px` }"
    aria-label="侧边栏"
  >
    <div class="sidebar__body">
      <slot />
    </div>
    <div
      v-if="!isNarrow"
      class="sidebar__resize"
      role="separator"
      aria-orientation="vertical"
      aria-label="调整侧边栏宽度"
      @pointerdown="startResize"
    ></div>
  </aside>
  <div
    v-if="isNarrow && workspace.sidebarVisible"
    class="sidebar__backdrop"
    @click="toggleSidebar"
  ></div>
</template>

<style scoped>
.sidebar {
  position: relative;
  flex: 0 0 auto;
  min-width: 0;
  /* 与编辑区 / 测试面板同款圆角卡片：右缘留 6px 空隙，三块卡片才各成一体 */
  margin-right: 6px;
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  background: var(--bg-panel);
  overflow: hidden;
}

.sidebar__body {
  height: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

/* 右缘调宽热区：8px 命中、视觉 1px，触摸与鼠标统一走指针事件 */
.sidebar__resize {
  position: absolute;
  top: 0;
  right: -4px;
  width: 9px;
  height: 100%;
  cursor: col-resize;
  touch-action: none;
  z-index: 5;
}

@media (max-width: 520px) {
  .sidebar--drawer {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: 86vw;
    max-width: 320px;
    z-index: 90;
    /* 抽屉贴着屏幕左缘：左边不留圆角与空隙，只圆右侧 */
    margin-right: 0;
    border-radius: 0 8px 8px 0;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
    animation: sidebar-slide-in 0.18s ease;
  }

  .sidebar__backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.32);
    z-index: 80;
    animation: sidebar-fade-in 0.18s ease;
  }
}

@keyframes sidebar-slide-in {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(0);
  }
}

@keyframes sidebar-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .sidebar--drawer,
  .sidebar__backdrop {
    animation: none;
  }
}
</style>
