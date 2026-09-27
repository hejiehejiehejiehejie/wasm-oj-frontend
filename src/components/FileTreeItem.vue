<script setup>
/**
 * FileTreeItem —— 递归树项（文件 / 目录）。
 *
 * - 单击：目录折叠；文件打开（openFile 内含 reveal）。
 * - 右键菜单、删除确认、键盘导航均通过 FileExplorer provide 的能力完成。
 * - 重命名为内联输入：Enter 提交 / Esc 取消 / 失焦提交；改名冲突显示行内错误。
 */
import { computed, inject, nextTick, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { modelManager } from '../services/monaco/modelManager.js'
import { openFile, renameNode, toggleExpand, workspace } from '../services/vfs/workspaceStore.js'
import { dirname, join } from '../services/vfs/paths.js'
import { formatMetaTooltip } from '../services/problemMeta.js'

defineOptions({ name: 'FileTreeItem' })

const props = defineProps({
  node: { type: Object, required: true },
  depth: { type: Number, default: 0 },
})
const emit = defineEmits(['rename-done'])

const openContextMenu = inject('openContextMenu')
const requestDelete = inject('requestDelete')
const treeRootEl = inject('treeRootEl')
const renameTarget = inject('renameTarget')
const isTabbable = inject('isTabbable')

const expanded = computed(() => workspace.expandedIds.includes(props.node.id))
const active = computed(() => workspace.activeId === props.node.id)
const dirty = computed(() => modelManager.isDirty(props.node.id))

/** 题目元数据的悬停摘要；没有元数据时为空串（行上就不设 title，别弹空提示） */
const metaTooltip = computed(() => formatMetaTooltip(props.node.meta))

const iconName = computed(() => {
  if (props.node.type === 'directory') return expanded.value ? 'folder-open' : 'folder'
  const name = props.node.name.toLowerCase()
  if (/\.(h|hpp|hh|hxx)$/.test(name)) return 'header'
  if (name.endsWith('.py')) return 'python'
  if (/\.(cpp|cc|cxx|c)$/.test(name)) return 'cpp'
  return 'file'
})

// ------------------------------------------------------------ 点击 / 右键

function onClick() {
  if (props.node.type === 'directory') toggleExpand(props.node.id)
  else openFile(props.node.id).catch(() => {})
}

function onContextMenu(event) {
  event.preventDefault()
  openContextMenu?.(event, props.node)
}

// ------------------------------------------------------------ 内联重命名

const renameMode = ref(false)
const renameValue = ref('')
const renameError = ref('')
const renameInput = ref(null)

watch(renameTarget, (value) => {
  if (value === props.node.id) startRename()
})

function startRename() {
  renameMode.value = true
  renameValue.value = props.node.name
  renameError.value = ''
  nextTick(() => {
    renameInput.value?.focus()
    renameInput.value?.select()
  })
}

async function commitRename() {
  if (!renameMode.value) return
  const value = renameValue.value.trim()
  if (value === props.node.name) {
    cancelRename()
    return
  }
  try {
    const targetPath = join(dirname(props.node.path), value)
    await renameNode(props.node.path, targetPath)
    renameMode.value = false
    emit('rename-done')
  } catch (error) {
    renameError.value = error.message || '重命名失败'
  }
}

function cancelRename() {
  renameMode.value = false
  renameError.value = ''
  emit('rename-done')
}

// ------------------------------------------------------------ 键盘（ARIA treeview）

function visibleItems() {
  const root = treeRootEl?.value
  if (!root) return []
  return [...root.querySelectorAll('[data-tree-id]')].filter(
    (el) => el.offsetParent !== null || el.getClientRects().length > 0,
  )
}

function onKeyDown(event) {
  const items = visibleItems()
  const index = items.indexOf(event.currentTarget)

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      items[index + 1]?.focus()
      break
    case 'ArrowUp':
      event.preventDefault()
      items[index - 1]?.focus()
      break
    case 'ArrowRight':
      event.preventDefault()
      if (props.node.type === 'directory') {
        if (!expanded.value) toggleExpand(props.node.id)
        else items[index + 1]?.focus()
      }
      break
    case 'ArrowLeft':
      event.preventDefault()
      if (props.node.type === 'directory' && expanded.value) toggleExpand(props.node.id)
      else if (props.node.parentId) {
        treeRootEl.value
          ?.querySelector(`[data-tree-id="${CSS.escape(props.node.parentId)}"]`)
          ?.focus()
      }
      break
    case 'Enter':
      event.preventDefault()
      onClick()
      break
    case 'F2':
      event.preventDefault()
      startRename()
      break
    case 'Delete':
      event.preventDefault()
      requestDelete?.(props.node)
      break
  }
}
</script>

<template>
  <div class="tree-item">
    <div
      class="tree-item__row"
      :class="{ 'tree-item__row--active': active }"
      :style="{ paddingLeft: `${depth * 10 + 8}px` }"
      :title="metaTooltip || undefined"
      role="treeitem"
      :data-tree-id="node.id"
      :aria-expanded="node.type === 'directory' ? expanded : undefined"
      :aria-selected="active"
      :tabindex="isTabbable(node.id) ? 0 : -1"
      @click="onClick"
      @contextmenu.stop="onContextMenu"
      @keydown="onKeyDown"
    >
      <span class="tree-item__arrow">
        <AppIcon v-if="node.type === 'directory'" :name="expanded ? 'chevron' : 'chevron-right'" :size="12" />
      </span>
      <AppIcon class="tree-item__icon" :name="iconName" :size="15" />
      <span v-if="!renameMode" class="tree-item__label">{{ node.name }}</span>
      <span v-if="!renameMode && dirty" class="tree-item__dot" title="未保存"></span>
      <input
        v-if="renameMode"
        ref="renameInput"
        v-model="renameValue"
        class="tree-item__input"
        @keydown.enter.prevent="commitRename"
        @keydown.esc.prevent="cancelRename"
        @blur="commitRename"
      />
    </div>
    <p v-if="renameError" class="tree-item__error" :style="{ paddingLeft: `${depth * 10 + 8}px` }">
      {{ renameError }}
    </p>

    <div v-if="node.type === 'directory' && expanded" role="group">
      <FileTreeItem
        v-for="child in node.children ?? []"
        :key="child.id"
        :node="child"
        :depth="depth + 1"
        @rename-done="emit('rename-done')"
      />
    </div>
  </div>
</template>

<style scoped>
.tree-item__row {
  display: flex;
  align-items: center;
  height: 24px;
  padding-right: 8px;
  color: var(--text);
  cursor: default;
  user-select: none;
  white-space: nowrap;
}

.tree-item__row:hover {
  background: var(--bg-hover);
}

.tree-item__row--active,
.tree-item__row--active:hover {
  background: var(--bg-hover);
}

.tree-item__arrow {
  flex: 0 0 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-dim);
}

.tree-item__icon {
  flex: 0 0 auto;
  margin-right: 6px;
}

.tree-item__label {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  line-height: 20px;
}

.tree-item__dot {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  margin-left: 6px;
  border-radius: 50%;
  background: var(--text-dim);
}

.tree-item__input {
  flex: 1 1 auto;
  min-width: 0;
  height: 22px;
  padding: 0 6px;
  background: var(--bg-input);
  border: 1px solid var(--accent);
  border-radius: 4px;
  color: var(--text);
  font: 400 13px/20px var(--font-mono, ui-monospace, monospace);
}

.tree-item__error {
  margin: 2px 0;
  color: var(--danger-text);
  font-size: 11px;
  line-height: 16px;
}
</style>
