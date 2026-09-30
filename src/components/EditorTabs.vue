<script setup>
/**
 * EditorTabs —— 编辑器标签栏（单编辑器组）。
 * - 点击切换活跃标签；中键关闭；× 按钮关闭；双击钉住预览页签。
 * - 预览页签（单击文件树开出来的那个）标签用斜体，见 workspace.previewTabId。
 * - dirty 文件显示圆点替代图标；活跃标签顶边取主题强调色。开着自动保存时不显示圆点
 *   （dirty 只存在几百毫秒，圆点只会闪一下），见下面的 isDirtyTab。
 * - 横向溢出时可横向滚动，不换行。
 *
 * 这里不再有运行按钮（2026-09-28 删）：运行入口只剩全局快捷键（⌘/Ctrl + Enter）
 * 与评测样例面板页脚那颗 ▶，两处都直连 App.vue 的 runAll，跑起来会自己把侧栏
 * 展开并切到「评测样例」，所以删掉页签栏这颗不会出现「点了看不到结果」。
 */
import AppIcon from './AppIcon.vue'
import { t } from '../i18n/index.js'
import { autoSaveEnabled } from '../services/autoSave.js'
import { modelManager } from '../services/monaco/modelManager.js'
import {
  activateCfPickerTab,
  activateSettingsTab,
  cfPickerTab,
  closeCfPickerTab,
  closeSettingsTab,
  deactivateViews,
  settingsTab,
  viewActive,
} from '../services/editorViews.js'
import {
  closeTab,
  getNodeById,
  pinTab,
  setActiveTab,
  workspace,
} from '../services/vfs/workspaceStore.js'

function activate(id) {
  // 点文件页签＝要看代码：先把合成视图（设置 / 抽题）让开。已经停在同一个文件上时
  // activeId 不变，editorViews 里那条 watch 不会触发，所以这里必须显式让一次。
  deactivateViews()
  setActiveTab(id)
}

/** 页签上这个未保存标记要不要显示：开了自动保存就不显示（dirty 只存在几百毫秒） */
function isDirtyTab(id) {
  return !autoSaveEnabled.value && modelManager.isDirty(id)
}

/** 中键关掉合成视图页签（设置 / 抽题同一套） */
function onViewMouseDown(event, close) {
  if (event.button === 1) {
    event.preventDefault()
    close()
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
    <div class="editor-tabs__strip" role="tablist" :aria-label="t('app.tabs.listLabel')">
      <button
        v-for="id in workspace.openTabIds"
        :key="id"
        type="button"
        class="editor-tabs__item"
        :class="{
          'editor-tabs__item--active': id === workspace.activeId && !viewActive,
          'editor-tabs__item--preview': id === workspace.previewTabId,
        }"
        role="tab"
        :data-preview="id === workspace.previewTabId || undefined"
        :aria-selected="id === workspace.activeId && !viewActive"
        :title="getNodeById(id)?.path"
        @click="activate(id)"
        @dblclick="pinTab(id)"
        @mousedown="onMouseDown($event, id)"
      >
        <span
          v-if="isDirtyTab(id)"
          class="editor-tabs__dot"
          :title="t('app.tabs.dirty')"
        ></span>
        <AppIcon v-else name="code" :size="12" class="editor-tabs__icon" />
        <span class="editor-tabs__label">{{ getNodeById(id)?.name ?? t('app.tabs.untitled') }}</span>
        <span
          class="editor-tabs__close"
          role="button"
          :aria-label="t('app.tabs.closeTab')"
          @click.stop="closeTab(id)"
        >
          <AppIcon name="close" :size="12" />
        </span>
      </button>

      <!-- 抽题页签：默认安装的组件，题库就绪后才有侧栏入口（cfPickerTab.open 只由侧栏那颗骰子按钮点亮）。
           排在设置之前，与侧栏页头里「骰子在齿轮左侧」的顺序一致 -->
      <button
        v-if="cfPickerTab.open"
        type="button"
        class="editor-tabs__item"
        :class="{ 'editor-tabs__item--active': cfPickerTab.active }"
        role="tab"
        :aria-selected="cfPickerTab.active"
        :title="t('cf.button.label')"
        @click="activateCfPickerTab"
        @mousedown="onViewMouseDown($event, closeCfPickerTab)"
      >
        <AppIcon name="dice" :size="12" class="editor-tabs__icon" />
        <span class="editor-tabs__label">{{ t('cf.button.label') }}</span>
        <span
          class="editor-tabs__close"
          role="button"
          :aria-label="t('cf.tab.close')"
          @click.stop="closeCfPickerTab"
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
        :title="t('app.settings')"
        @click="activateSettingsTab"
        @mousedown="onViewMouseDown($event, closeSettingsTab)"
      >
        <AppIcon name="gear" :size="12" class="editor-tabs__icon" />
        <span class="editor-tabs__label">{{ t('app.settings') }}</span>
        <span
          class="editor-tabs__close"
          role="button"
          :aria-label="t('app.tabs.closeSettings')"
          @click.stop="closeSettingsTab"
        >
          <AppIcon name="close" :size="12" />
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.editor-tabs {
  flex: 0 0 35px;
  display: flex;
  align-items: stretch;
  /* 横向滚动归内部的 .editor-tabs__strip */
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

/* 预览页签：斜体是唯一的视觉信号（VS Code 同款）。只动标签文字，
   不动图标/宽度/关闭按钮 —— 页签栏那套宽度实测（HANDOFF 第 3 节）不受影响 */
.editor-tabs__item--preview .editor-tabs__label {
  font-style: italic;
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
