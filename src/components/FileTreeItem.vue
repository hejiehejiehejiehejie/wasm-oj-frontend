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
import InlineCreateRow from './InlineCreateRow.vue'
import { t } from '../i18n/index.js'
import { modelManager } from '../services/monaco/modelManager.js'
import { openFile, renameNode, toggleExpand, workspace } from '../services/vfs/workspaceStore.js'
import { dirname, join, stem } from '../services/vfs/paths.js'
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
const creating = inject('creating')
/** 拖拽（见 composables/useTreeDrag.js）：起手、落点高亮、点击抑制、右键菜单让位 */
const onRowPointerDown = inject('onRowPointerDown')
const consumeClickSuppression = inject('consumeClickSuppression')
const suppressContextMenu = inject('suppressContextMenu')
const dropTargetRowId = inject('dropTargetRowId')
const draggingId = inject('draggingId')

const expanded = computed(() => workspace.expandedIds.includes(props.node.id))
const active = computed(() => workspace.activeId === props.node.id)
const dirty = computed(() => modelManager.isDirty(props.node.id))
/** 拖拽态：被拖的那一行变淡，合法落点那一行铺选中色 */
const isDragging = computed(() => draggingId?.value === props.node.id)
const isDropTarget = computed(() => dropTargetRowId?.value === props.node.id)

/** 题目元数据的悬停摘要；没有元数据时为空串（行上就不设 title，别弹空提示） */
const metaTooltip = computed(() => formatMetaTooltip(props.node.meta))

const iconName = computed(() => {
  if (props.node.type === 'directory') return expanded.value ? 'folder-open' : 'folder'
  const name = props.node.name.toLowerCase()
  if (/\.(h|hpp|hh|hxx)$/.test(name)) return 'header'
  if (name.endsWith('.py')) return 'python'
  if (name.endsWith('.md') || name.endsWith('.markdown')) return 'markdown'
  if (/\.(cpp|cc|cxx|c)$/.test(name)) return 'cpp'
  return 'file'
})

// ------------------------------------------------------------ 点击 / 右键

function onClick() {
  // 拖拽收尾的那一次 click 要吃掉，否则松手会顺带折叠/展开落点目录
  if (consumeClickSuppression?.()) return
  if (props.node.type === 'directory') toggleExpand(props.node.id)
  else openFile(props.node.id).catch(() => {})
}

function onPointerDown(event) {
  onRowPointerDown?.(event, props.node)
}

function onContextMenu(event) {
  event.preventDefault()
  // 触屏的 contextmenu 已被 useTreeDrag 从按下那一刻全程接管（见 useTreeDrag.js 的 pointerdown）：
  // 菜单由它在手抬起时自己弹，这里绝不能再弹一个。鼠标右键不走那条路，照旧在这里弹。
  if (suppressContextMenu?.value) return
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

/**
 * 进入内联重命名。输入框里放整名（含后缀），但**只选中主干**：
 * 把 main.cpp 改成 two-sum.cpp 时，后缀留在选中区外，不会被一并打掉；目录名整段选中。
 */
function startRename() {
  renameMode.value = true
  renameValue.value = props.node.name
  renameError.value = ''
  nextTick(() => {
    const el = renameInput.value
    if (!el) return
    el.focus()
    const end = props.node.type === 'file' ? stem(props.node.name).length : el.value.length
    el.setSelectionRange(0, end)
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
    renameError.value = error.message || t('explorer.renameFailed')
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
      :class="{
        'tree-item__row--active': active,
        'tree-item__row--dragging': isDragging,
        'tree-item__row--drop': isDropTarget,
      }"
      :style="{ '--depth': depth }"
      :title="metaTooltip || undefined"
      role="treeitem"
      :data-tree-id="node.id"
      :aria-expanded="node.type === 'directory' ? expanded : undefined"
      :aria-selected="active"
      :tabindex="isTabbable(node.id) ? 0 : -1"
      @click="onClick"
      @pointerdown="onPointerDown"
      @contextmenu.stop="onContextMenu"
      @keydown="onKeyDown"
    >
      <span class="tree-item__arrow">
        <AppIcon v-if="node.type === 'directory'" :name="expanded ? 'chevron' : 'chevron-right'" :size="12" />
      </span>
      <AppIcon class="tree-item__icon" :class="`is-${iconName}`" :name="iconName" :size="15" />
      <span v-if="!renameMode" class="tree-item__label">{{ node.name }}</span>
      <span v-if="!renameMode && dirty" class="tree-item__dot" :title="t('app.tabs.dirty')"></span>
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
    <p v-if="renameError" class="tree-item__error" :style="{ '--depth': depth }">
      {{ renameError }}
    </p>

    <div v-if="node.type === 'directory' && expanded" role="group">
      <!-- 建在这个目录里的输入行。放在 group 内、而不是 .tree-item__row 内：那一行挂着
           @keydown="onKeyDown"（方向键导航），输入框进去会让编辑文字的光标键被树抢走。 -->
      <InlineCreateRow v-if="creating?.targetId === node.id" :state="creating" :depth="depth + 1" />
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
  /* 缩进步长走 rem（--depth 是模板给的无单位层数），全局缩放时与行高、字号同步 */
  padding-left: calc(var(--depth, 0) * 10px + 8px);
  padding-right: 8px;
  color: var(--text);
  cursor: default;
  user-select: none;
  white-space: nowrap;
  /* 触屏的关键：声明 pan-y 把纵向留给浏览器滚列表，横向留给我们的拖拽。不能用 none——
     那样子指在行上滑动就再也滚不动树了。而「长按起手后不让它滚」得靠非被动 touchmove
     拦（touch-action 在手势开始时就读定了，中途改无效），见 useTreeDrag.js 的注释。 */
  touch-action: pan-y;
}

.tree-item__row:hover {
  background: var(--bg-hover);
}

.tree-item__row--active,
.tree-item__row--active:hover {
  background: var(--bg-hover);
}

/* 正在被拖的那一行 */
.tree-item__row--dragging {
  opacity: 0.5;
  cursor: grabbing;
}

/* 合法落点。写成两个类是为了压过上面的 :hover / --active:hover —— 拖拽时光标必然悬停在
   落点行上，只用一个类的话 hover 的背景会盖掉高亮。 */
.tree-item__row.tree-item__row--drop,
.tree-item__row.tree-item__row--drop:hover {
  background: var(--bg-selection);
  border-radius: 4px;
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

/* 语言标志沿用 VS Code（Seti）的配色：三类字标各用各自的蓝，跟设置里的「本地运行环境」
   和页签栏是同一套变量。文件夹、头文件与通用文件仍是单色，不参与「这是哪种语言」的表达。 */
.tree-item__icon.is-cpp {
  color: var(--icon-cpp);
}

.tree-item__icon.is-python {
  color: var(--icon-python);
}

.tree-item__icon.is-markdown {
  color: var(--icon-markdown);
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
  padding-left: calc(var(--depth, 0) * 10px + 8px);
  color: var(--danger-text);
  font-size: 11px;
  line-height: 16px;
}
</style>
