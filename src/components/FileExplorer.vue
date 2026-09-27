<script setup>
/**
 * FileExplorer —— 资源管理器：头部操作（新建文件 / 文件夹）+ 树容器 + 右键菜单。
 *
 * 通过 provide 向递归树项提供能力：右键菜单、删除确认、内联新建输入、
 * 根 DOM、重命名目标、焦点管理。树项不直接操作这些状态，避免跨层耦合。
 */
import { nextTick, provide, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import ContextMenu from './ContextMenu.vue'
import FileTreeItem from './FileTreeItem.vue'
import {
  createDirectory,
  createFile,
  deleteNode,
  getNodeById,
  workspace,
} from '../services/vfs/workspaceStore.js'
import { assertName, join } from '../services/vfs/paths.js'

const rootEl = ref(null)

/** 内联新建状态：{ type:'file'|'directory', parentId, value, error } | null */
const creating = ref(null)
/** 右键菜单状态：{ x, y, node, items } | null */
const menu = ref(null)
/** 需要进入重命名的节点 id */
const renameTarget = ref(null)
/** 树内最近获得焦点的 id（roving tabindex） */
const focusedId = ref(null)

// ------------------------------------------------------------ 内联新建

function startCreate(type, parentId = 'root') {
  menu.value = null
  if (parentId !== 'root' && !workspace.expandedIds.includes(parentId)) {
    workspace.expandedIds.push(parentId)
  }
  creating.value = { type, parentId, value: '', error: '' }
}

function cancelCreate() {
  creating.value = null
}

async function commitCreate() {
  const state = creating.value
  if (!state) return
  const name = state.value.trim()
  if (!name) {
    cancelCreate()
    return
  }
  try {
    assertName(name)
    const parent = getNodeById(state.parentId)
    const path = join(parent ? parent.path : '/', name)
    if (state.type === 'file') await createFile(path)
    else await createDirectory(path)
    creating.value = null
  } catch (error) {
    state.error = error.message || '创建失败'
  }
}

// ------------------------------------------------------------ 右键菜单

function openContextMenu(event, node) {
  if (!node) return // 索引尚未就绪等情况：静默，不弹菜单
  focusedId.value = node.id
  menu.value = { x: event.clientX, y: event.clientY, node, items: buildMenuItems(node) }
}

function buildMenuItems(node) {
  if (node.type === 'directory') {
    return [
      { id: 'new-file', label: '新建文件' },
      { id: 'new-folder', label: '新建文件夹' },
      { id: 'actions-divider', divider: true },
      { id: 'rename', label: '重命名', disabled: node.id === 'root' },
      { id: 'delete', label: '删除', disabled: node.id === 'root' },
    ]
  }
  return [
    { id: 'rename', label: '重命名' },
    { id: 'delete', label: '删除' },
  ]
}

async function onMenuSelect(id) {
  const node = menu.value?.node
  menu.value = null
  if (!node) return
  if (id === 'new-file') startCreate('file', node.id)
  else if (id === 'new-folder') startCreate('directory', node.id)
  else if (id === 'rename') beginRename(node.id)
  else if (id === 'delete') requestDelete(node)
}

function beginRename(id) {
  renameTarget.value = null
  // 先清空再置位：同一节点连续触发也能被 watch 感知
  nextTick(() => {
    renameTarget.value = id
  })
}

function onRenameDone() {
  renameTarget.value = null
}

async function requestDelete(node) {
  const suffix = node.type === 'directory' ? '目录内的全部内容将一并删除。' : ''
  if (!window.confirm(`确定删除 ${node.path} ？${suffix}`)) return
  await deleteNode(node.path)
}

// 在树空白处右键：给根目录菜单
function onTreeContextMenu(event) {
  event.preventDefault()
  openContextMenu(event, getNodeById('root'))
}

// ------------------------------------------------------------ 焦点（roving tabindex）

function isTabbable(id) {
  if (focusedId.value) return focusedId.value === id
  if (workspace.activeId) return workspace.activeId === id
  return workspace.tree[0]?.id === id
}

function setFocusedId(id) {
  focusedId.value = id
}

function onTreeFocus(event) {
  const row = event.target.closest('[data-tree-id]')
  if (row) setFocusedId(row.dataset.treeId)
}

provide('openContextMenu', openContextMenu)
provide('requestDelete', requestDelete)
provide('creating', creating)
provide('commitCreate', commitCreate)
provide('cancelCreate', cancelCreate)
provide('treeRootEl', rootEl)
provide('renameTarget', renameTarget)
provide('isTabbable', isTabbable)
provide('setFocusedId', setFocusedId)
</script>

<template>
  <section class="explorer">
    <header class="explorer__head">
      <span class="explorer__title">资源管理器</span>
      <span class="explorer__actions">
        <button type="button" class="explorer__btn" title="新建文件" @click="startCreate('file')">
          <AppIcon name="file" :size="14" />
        </button>
        <button type="button" class="explorer__btn" title="新建文件夹" @click="startCreate('directory')">
          <AppIcon name="folder" :size="14" />
        </button>
      </span>
    </header>

    <div ref="rootEl" class="explorer__tree" role="tree" @contextmenu="onTreeContextMenu" @focusin="onTreeFocus">
      <template v-if="creating?.parentId === 'root'">
        <div class="explorer__create">
          <span class="explorer__create-arrow"></span>
          <AppIcon class="explorer__create-icon" :name="creating.type === 'file' ? 'file' : 'folder'" :size="15" />
          <input
            v-model="creating.value"
            class="explorer__input"
            :placeholder="creating.type === 'file' ? 'main.cpp' : 'folder'"
            autofocus
            @keydown.enter.prevent="commitCreate"
            @keydown.esc.prevent="cancelCreate"
            @blur="commitCreate"
          />
        </div>
        <p v-if="creating.error" class="explorer__error">{{ creating.error }}</p>
      </template>

      <FileTreeItem
        v-for="node in workspace.tree"
        :key="node.id"
        :node="node"
        :depth="0"
        @rename-done="onRenameDone"
      />

      <p v-if="!workspace.tree.length && !creating" class="explorer__empty">
        还没有文件，点上方按钮新建
      </p>
    </div>

    <ContextMenu
      v-if="menu"
      :x="menu.x"
      :y="menu.y"
      :items="menu.items"
      @select="onMenuSelect"
      @close="menu = null"
    />
  </section>
</template>

<style scoped>
.explorer {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1 1 auto;
}

.explorer__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 35px;
  padding: 0 8px 0 12px;
  border-bottom: 1px solid var(--border-soft);
  background: var(--bg-panel-head);
}

.explorer__title {
  color: var(--text);
  font-size: 11.5px;
  font-weight: 650;
  letter-spacing: 0.06em;
}

.explorer__actions {
  display: inline-flex;
  gap: 2px;
}

.explorer__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 5px;
  color: var(--text-dim);
  cursor: pointer;
}

.explorer__btn:hover {
  background: var(--bg-control-hover);
  color: var(--text);
}

.explorer__tree {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px 0;
}

.explorer__create {
  display: flex;
  align-items: center;
  height: 24px;
  padding-left: 8px;
}

.explorer__create-arrow {
  flex: 0 0 16px;
}

.explorer__create-icon {
  flex: 0 0 auto;
  margin-right: 6px;
}

.explorer__input {
  flex: 1 1 auto;
  min-width: 0;
  height: 22px;
  margin-right: 8px;
  padding: 0 6px;
  background: var(--bg-input);
  border: 1px solid var(--accent);
  border-radius: 4px;
  color: var(--text);
  font: 400 13px/20px var(--font-mono, ui-monospace, monospace);
}

.explorer__error {
  margin: 2px 8px 2px 30px;
  color: var(--danger-text);
  font-size: 11px;
  line-height: 16px;
}

.explorer__empty {
  margin: 8px 12px;
  color: var(--text-faint);
  font-size: 12px;
  line-height: 18px;
}
</style>
