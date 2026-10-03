<script setup>
/**
 * FileTreeItem —— 递归树项（文件 / 目录）。
 *
 * - 单击：先把这一行选中（文件与目录同一套高亮，选中目录 = 页头新建落进它里面），
 *   然后目录折叠、文件以**预览页签**打开（斜体临时页签，再点别的文件就顶替掉它）。
 * - 双击文件：把预览页签钉住（转正体）；Enter 等同双击，直接常开。
 * - 右键菜单、删除确认、键盘导航均通过 FileExplorer provide 的能力完成。
 * - 重命名为内联输入：Enter 提交 / Esc 取消 / 失焦提交；改名冲突显示行内错误。
 */
import { computed, inject, nextTick, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import InlineCreateRow from './InlineCreateRow.vue'
import { t } from '../i18n/index.js'
import { autoSaveEnabled } from '../services/autoSave.js'
import { fileIconName } from '../services/fileIcons.js'
import { modelManager } from '../services/monaco/modelManager.js'
import {
  getNodeById,
  openFile,
  pinTab,
  renameNode,
  selectNode,
  toggleExpand,
  workspace,
} from '../services/vfs/workspaceStore.js'
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
/** 这一行是不是选中项。文件与目录同一套判据（选中是**单选**的）—— 目录也能被选中，
 *  选中它就意味着「页头新建落在它里面」。根目录不画成行，所以没选中时整棵树都不亮。 */
const selected = computed(() => workspace.selectedId === props.node.id)
/** 未保存标记。开了自动保存就不显示：dirty 只存在几百毫秒，圆点只会闪一下，
    反倒是「这文件没保存」的误导。 */
const dirty = computed(() => !autoSaveEnabled.value && modelManager.isDirty(props.node.id))
/** 拖拽态：被拖的那一行变淡，合法落点那一行铺选中色 */
const isDragging = computed(() => draggingId?.value === props.node.id)
const isDropTarget = computed(() => dropTargetRowId?.value === props.node.id)

/** 选中项的父目录 id。选中目录时不算——只有节点才有「它属于哪个文件夹」这回事 */
const selectedParentId = computed(() => {
  const node = workspace.selectedId ? getNodeById(workspace.selectedId) : null
  return node?.parentId ?? null
})
/** 本目录正是选中项的父目录 → 它这一列的缩进线跟着亮起（与拖拽落点同一种亮法） */
const isActiveParent = computed(() => selectedParentId.value === props.node.id)

/** 题目元数据的悬停摘要；没有元数据时为空串（行上就不设 title，别弹空提示） */
const metaTooltip = computed(() => formatMetaTooltip(props.node.meta))

/** 只有文件画图标：文件夹改用裸的折角箭头表示（试一下不带 logo 的样子），
 *  于是这里也就不需要再区分 folder / folder-open 了。
 *  映射本身在 services/fileIcons.js —— 编辑器页签用的是同一份，别在这里另写一套。 */
const iconName = computed(() => fileIconName(props.node.name))

// ------------------------------------------------------------ 点击 / 右键

/**
 * 打开/折叠这一行。`preview` 只给单击用 —— 浏览式地「点开看一眼」不该在页签栏留下常驻页签。
 * @param {{ preview?: boolean }} [options]
 */
function activate({ preview = false } = {}) {
  // 拖拽收尾的那一次 click 要吃掉，否则松手会顺带折叠/展开落点目录
  if (consumeClickSuppression?.()) return
  // 先把这一行选中（文件 / 目录同一套高亮），再干它本来该干的事：目录折叠/展开、文件预览打开
  selectNode(props.node.id)
  if (props.node.type === 'directory') toggleExpand(props.node.id)
  else openFile(props.node.id, null, { preview }).catch(() => {})
}

function onClick() {
  activate({ preview: true })
}

/** 键盘 Enter 是「确认要打开」，按常开页签算（页签栏里单击页签也不钉住，但 Enter 意图更明确） */
function onEnter() {
  activate()
}

/**
 * 双击＝钉住。时序上第一下 click 已经把它开成了预览页签，这里只需把预览槽清掉。
 * 目录上的双击是空操作（pinTab 对非预览 id 不做事）。
 */
function onDblClick() {
  if (consumeClickSuppression?.()) return
  pinTab(props.node.id)
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

/**
 * 回车提交重命名。中文输入法里「回车」常常是「确认候选词」而不是「提交」，
 * 组字期间敲下去会把半截拼音当成新名字落盘 —— 和全局快捷键同一条规矩（见 App.vue 的 onKeydown）：
 * 组字中一律不当成提交。keyCode 229 是部分输入法在组字时不报 isComposing 的补漏。
 */
function submitRenameOnEnter(event) {
  if (event.isComposing || event.keyCode === 229) return
  event.preventDefault()
  commitRename()
}

async function commitRename() {
  if (!renameMode.value) return
  const value = renameValue.value.trim()
  if (value === props.node.name) {
    cancelRename()
    return
  }
  // 每轮尝试先清掉上一轮的报错：报错段落只看 renameError 非空（不看是否还在重命名中），
  // 不清的话，先撞名失败、删掉那个同名文件后再改成功，那句「已存在」会一直挂在树上。
  renameError.value = ''
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
  // 输入法组字期间的按键不是树导航：重命名框里拼音选词的回车会一路冒泡到 'Enter' 分支，
  // 把文件顺手打开；方向键也会被当成移动焦点，把候选词高亮抢走（同一条规矩见 App.vue 的 onKeydown）
  if (event.isComposing) return

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
      onEnter()
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
  <div class="tree-item" :class="{ 'tree-item--drop': isDropTarget }">
    <div
      class="tree-item__row"
      :class="{
        'tree-item__row--dir': node.type === 'directory',
        'tree-item__row--active': selected,
        'tree-item__row--dragging': isDragging,
        'tree-item__row--drop': isDropTarget,
      }"
      :style="{ '--depth': depth }"
      :title="metaTooltip || undefined"
      role="treeitem"
      :data-tree-id="node.id"
      :aria-expanded="node.type === 'directory' ? expanded : undefined"
      :aria-selected="selected"
      :tabindex="isTabbable(node.id) ? 0 : -1"
      @click="onClick"
      @dblclick="onDblClick"
      @pointerdown="onPointerDown"
      @contextmenu.stop="onContextMenu"
      @keydown="onKeyDown"
    >
      <!-- 文件行没有折角箭头，整条槽就一并收掉：留着的话名字前面会空出 16px
           （原本那块空当靠小圆点填着，圆点去掉后就是一片纯空白）。
           收掉之后文件图标与同层文件夹的折角箭头同列，名字也与同级文件夹名对齐。 -->
      <span v-if="node.type === 'directory'" class="tree-item__arrow">
        <AppIcon :name="expanded ? 'chevron' : 'chevron-right'" :size="14" />
      </span>
      <AppIcon
        v-if="node.type === 'file'"
        class="tree-item__icon"
        :class="`is-${iconName}`"
        :name="iconName"
        :size="15"
      />
      <span v-if="!renameMode" class="tree-item__label">{{ node.name }}</span>
      <span v-if="!renameMode && dirty" class="tree-item__dot" :title="t('app.tabs.dirty')"></span>
      <!-- data-keep-focus-on-pan：这张框失焦即提交（下面的 @blur），滑动时不许被
           useMobileKeyboard 代劳 blur —— 那会把「拖选一段文字」变成「提交改名」，选区也一起丢。 -->
      <input
        v-if="renameMode"
        ref="renameInput"
        v-model="renameValue"
        class="tree-item__input"
        data-keep-focus-on-pan
        @keydown.enter="submitRenameOnEnter"
        @keydown.esc.prevent="cancelRename"
        @blur="commitRename"
      />
    </div>
    <p v-if="renameError" class="tree-item__error" :style="{ '--depth': depth }">
      {{ renameError }}
    </p>

    <div
      v-if="node.type === 'directory' && expanded"
      class="tree-item__children"
      :class="{
        'tree-item__children--drop': isDropTarget,
        'tree-item__children--active': isActiveParent,
      }"
      role="group"
      :style="{ '--depth': depth }"
    >
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
/**
 * 目录的「范围线」：画在这个 group 上，而不是画在行上。
 * group 天然只包住这个目录的全部子节点，所以线的上下端正好是这个文件夹的起止，
 * 收起时 group 不存在、线也就自动没了 —— 不需要任何 JS 计算。
 * x 取父行箭头中心（父行 padding-left = depth*10+8，箭头宽 16），恰好落在子节点箭头左侧一点。
 * 用伪元素画、**不能**用 group 自己的 background：子元素总画在父元素背景之上，行一有 hover / 选中
 * 的底色（不透明）就会把线盖掉。升到行之上只需要绝对定位 + z-index，行本身没有 position，压得住。
 * 也不用 border-left：那会把每层子节点整体右移 1px，层层累加会歪。
 */
.tree-item__children {
  /* 给 ::before 当定位上下文；不加 z-index，所以不生成层叠上下文 */
  position: relative;
}

.tree-item__children::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: calc(var(--depth, 0) * 10px + 16px);
  width: 1px;
  background: var(--tree-guide);
  /* 线的 x 落在行的左侧留白里（文字与图标之左），所以盖在行上也不会压到任何内容 */
  pointer-events: none;
  z-index: 1;
}

/* 亮起的两种情况：拖拽的落点是这个文件夹，或选中项（文件 / 目录）就在这个文件夹里。
   都是「同一支白笔按到底」，不给它换颜色。下条必须留在基础线那条之后 ——
   三条特异性同为 (0,1,0)，靠源序压回来。
   指针停在文件行时落点是它的父目录，于是亮的正是父目录那条线：「会落进哪个文件夹」
   除了行底色之外，还多一条线指过去。 */
.tree-item__children--drop::before,
.tree-item__children--active::before {
  background: var(--tree-guide-strong);
}

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

/* 悬停用比选中（--bg-hover）淡一档的底色，否则鼠标划过别的行时看不出哪一行才是选中的。
   下面 --active 的两条要留在 :hover 之后：同为 (0,2,0) 特异性，靠源序压回来，
   不然悬停选中的那一行会把它「淡成」悬停色。 */
.tree-item__row:hover {
  background: var(--bg-hover-soft);
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

/* 合法落点：色块铺满**整个文件夹**（它自己那一行 + 展开的全部后代），而不是只铺那一行——
   「会落进这个文件夹」的边界因此一眼可见。铺在 .tree-item 容器上，它就是这棵子树本身。
   容器背景在行的背景之下，所以行的 hover / 选中底色仍会透出自己那一小块（不影响判断）。 */
.tree-item--drop {
  background: var(--bg-drop);
  border-radius: 4px;
}

/* 落点文件夹自己那一行：色块已经铺在容器上，这里把行的底色清成透明，
   免得悬停色（不透明）在整块蓝中间压出一条深色带。
   双类 + :hover 是为了压过上面的 :hover 与 --active:hover（拖拽时光标必然停在这一行）。 */
.tree-item__row.tree-item__row--drop,
.tree-item__row.tree-item__row--drop:hover {
  background: transparent;
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
  /* 文件行没有折角箭头槽，图标会直接贴到文件夹那条范围线上，左侧先收一道 3px 的小缝；
     同时把图标与名字之间的缝从 5px 收到 2px —— 两者相加仍是 20px，名字列跟文件夹名
     （槽 16px + 4px）保持同列。 */
  margin-left: 3px;
  margin-right: 2px;
}

/* 文件夹没有图标，名字直接跟在折角箭头后：补一点缝，别贴住箭头图形
   （箭头的槽宽固定 16px，箭头图标 14px 居中，两边各留 1px） */
.tree-item__row--dir .tree-item__label {
  margin-left: 4px;
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
