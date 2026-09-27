<script setup>
/**
 * EditorTabs —— 编辑器标签栏（单编辑器组）。
 * - 点击切换活跃标签；中键关闭；× 按钮关闭。
 * - dirty 文件显示圆点替代图标；活跃标签顶边取主题强调色。
 * - 横向溢出时可横向滚动，不换行。
 * - 最右侧常驻一颗运行 / 停止按钮：2026-09 顶栏删除后从顶栏的「运行全部测试」
 *   搬过来的（侧边栏收起、或停在资源管理器页签时，这里是唯一的运行入口）。
 */
import AppIcon from './AppIcon.vue'
import { modelManager } from '../services/monaco/modelManager.js'
import {
  activateSettingsTab,
  closeSettingsTab,
  deactivateSettingsTab,
  settingsTab,
} from '../services/settingsTab.js'
import {
  closeTab,
  getNodeById,
  setActiveTab,
  workspace,
} from '../services/vfs/workspaceStore.js'

defineProps({
  running: Boolean,
  total: { type: Number, default: 0 },
})

const emit = defineEmits(['run-all'])

function activate(id) {
  // 点文件页签＝要看代码：先把设置视图让开。已经停在同一个文件上时
  // activeId 不变，settingsTab 里那条 watch 不会触发，所以这里必须显式让一次。
  deactivateSettingsTab()
  setActiveTab(id)
}

function onSettingsMouseDown(event) {
  if (event.button === 1) {
    event.preventDefault()
    closeSettingsTab()
  }
}

function onMouseDown(event, id) {
  // 中键关闭（auxclick 在部分时机不一致，统一在 mousedown 处理）
  if (event.button === 1) {
    event.preventDefault()
    closeTab(id)
  }
}
</script>

<template>
  <div class="editor-tabs">
    <div class="editor-tabs__strip" role="tablist" aria-label="打开的文件">
      <button
        v-for="id in workspace.openTabIds"
        :key="id"
        type="button"
        class="editor-tabs__item"
        :class="{ 'editor-tabs__item--active': id === workspace.activeId && !settingsTab.active }"
        role="tab"
        :aria-selected="id === workspace.activeId && !settingsTab.active"
        :title="getNodeById(id)?.path"
        @click="activate(id)"
        @mousedown="onMouseDown($event, id)"
      >
        <span v-if="modelManager.isDirty(id)" class="editor-tabs__dot" title="未保存"></span>
        <AppIcon v-else name="code" :size="12" class="editor-tabs__icon" />
        <span class="editor-tabs__label">{{ getNodeById(id)?.name ?? '未命名' }}</span>
        <span
          class="editor-tabs__close"
          role="button"
          aria-label="关闭标签"
          @click.stop="closeTab(id)"
        >
          <AppIcon name="close" :size="12" />
        </span>
      </button>

      <!-- 设置页签：与代码文件同一个皮，排在文件之后（跟「新开的排最后」一致）。
           dirty 圆点不适用（设置是即时生效的，没有保存概念），所以图标固定是齿轮 -->
      <button
        v-if="settingsTab.open"
        type="button"
        class="editor-tabs__item"
        :class="{ 'editor-tabs__item--active': settingsTab.active }"
        role="tab"
        :aria-selected="settingsTab.active"
        title="设置"
        @click="activateSettingsTab"
        @mousedown="onSettingsMouseDown"
      >
        <AppIcon name="gear" :size="12" class="editor-tabs__icon" />
        <span class="editor-tabs__label">设置</span>
        <span
          class="editor-tabs__close"
          role="button"
          aria-label="关闭设置"
          @click.stop="closeSettingsTab"
        >
          <AppIcon name="close" :size="12" />
        </span>
      </button>
    </div>

    <button
      class="editor-tabs__run"
      :class="{ 'is-running': running }"
      :aria-label="running ? '停止运行' : '运行全部测试'"
      :title="running ? '点击中断当前运行' : '运行全部测试用例 (⌘/Ctrl + Enter)'"
      :disabled="!running && total === 0"
      @click="emit('run-all')"
    >
      <AppIcon :name="running ? 'stop' : 'play'" :size="13" />
      <span>{{ running ? '停止' : '运行' }}</span>
    </button>
  </div>
</template>

<style scoped>
.editor-tabs {
  flex: 0 0 35px;
  display: flex;
  align-items: stretch;
  /* 横向滚动归内部的 .editor-tabs__strip：右边那颗运行按钮要钉住不跟着滚 */
  overflow: hidden;
  background: var(--bg-panel-head);
  border-bottom: 1px solid var(--border-soft);
}

.editor-tabs__strip {
  flex: 1 1 auto;
  display: flex;
  align-items: stretch;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}

.editor-tabs__strip::-webkit-scrollbar {
  height: 0;
}

/* 运行 / 停止：从顶栏搬来的那颗，压成页签栏高度的一颗小按钮 */
.editor-tabs__run {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  align-self: center;
  height: 25px;
  margin: 0 6px;
  padding: 0 11px;
  border: none;
  border-radius: 5px;
  background: var(--run-green);
  color: var(--text-on-accent);
  font-size: 12px;
  font-weight: 650;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 0.16s ease, opacity 0.16s ease;
}

.editor-tabs__run:hover:not(:disabled) {
  background: var(--run-green-hover);
}

.editor-tabs__run:disabled {
  opacity: 0.45;
  cursor: default;
}

.editor-tabs__run.is-running {
  background: var(--danger-bg);
  color: var(--danger-text);
}

.editor-tabs__run.is-running:hover {
  background: var(--danger-bg-hover);
}

.editor-tabs__item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  padding: 0 10px;
  background: transparent;
  border: none;
  border-right: 1px solid var(--border-soft);
  color: var(--text-dim);
  font-size: 12.5px;
  cursor: pointer;
}

.editor-tabs__item:hover {
  color: var(--text);
}

.editor-tabs__item--active {
  position: relative;
  background: var(--bg-tab-active);
  color: var(--text);
}

.editor-tabs__item--active::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--focus, var(--accent));
}

.editor-tabs__icon {
  color: var(--icon-code, currentColor);
}

.editor-tabs__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--text-dim);
}

.editor-tabs__label {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.editor-tabs__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  opacity: 0;
}

.editor-tabs__item:hover .editor-tabs__close,
.editor-tabs__item--active .editor-tabs__close {
  opacity: 0.75;
}

.editor-tabs__close:hover {
  opacity: 1;
  background: var(--bg-control-hover);
}
</style>
