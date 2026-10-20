<script setup>
/**
 * FileTreeItem —— 递归树项（文件 / 目录）。
 *
 * - 单击：先把这一行选中（**单选**，会把多选收掉），然后目录折叠、文件以**预览页签**打开
 *   （斜体临时页签，再点别的文件就顶替掉它）。
 * - **⌥ / Alt + 单击**：切换这一行的选中（多选加选 / 减选），不打开文件、不折叠目录。
 * - **Shift + 单击**：从锚点（`workspace.selectedId`）到这一行整段选中，同样不打开不折叠。
 * - **⌘ / Ctrl + 单击**：直接在新标签页打开这一行的题目；这一行没有题目链接时退化成普通单击。
 *   「打开题目」占着这个手势（用户点名的就是它），所以**加选让给了 Alt** —— 两者不能同键。
 *   它是鼠标事件的修饰键，`useShortcutManager` 那套 keydown 管线（comboFromEvent）接不住，
 *   所以也不进绑定表、不占任何键位。
 * - 双击文件：把预览页签钉住（转正体）；Enter 等同双击，直接常开。
 *   **macOS 例外（2026-10-20）**：单按回车是「重命名」（与 Finder / VS Code 一致），
 *   「打开 / 切换展开」移到 **⌘ + ↓**；Windows / Linux 不变。
 * - 右键菜单与树内键盘导航均通过 FileExplorer provide 的能力完成（行上的方向键 / Enter 归这里，
 *   而重命名、Delete 删除、⌘/Ctrl+A 全选是全局快捷键，见 onKeyDown 末尾那条注释）。
 * - 重命名为内联输入：Enter 提交 / Esc 取消 / 失焦提交；改名冲突显示行内错误。
 */
import { computed, inject, nextTick, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import InlineCreateRow from './InlineCreateRow.vue'
import { t } from '../i18n/index.js'
import { autoSaveEnabled } from '../services/autoSave.js'
import { IS_MAC } from '../composables/useShortcutManager.js'
import { fileIconName } from '../services/fileIcons.js'
import { modelManager } from '../services/monaco/modelManager.js'
import {
  getNodeById,
  openFile,
  pinTab,
  renameNode,
  selectNode,
  toggleExpand,
  toggleSelection,
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
/** 「打开题目」的唯一出口（在 FileExplorer 里，判据与菜单那一项同源）；开成了返回 true */
const openProblem = inject('openProblem')
/** Shift + 单击的范围选择（可见行区间在 FileExplorer 那边算，它才拿得到 DOM 顺序） */
const selectRangeTo = inject('selectRangeTo')
const treeRootEl = inject('treeRootEl')
const showNotice = inject('showNotice')
const renameTarget = inject('renameTarget')
const isTabbable = inject('isTabbable')
const creating = inject('creating')
/** 拖拽（见 composables/useTreeDrag.js）：起手、落点高亮、点击抑制、右键菜单让位 */
const onRowPointerDown = inject('onRowPointerDown')
const consumeClickSuppression = inject('consumeClickSuppression')
const suppressContextMenu = inject('suppressContextMenu')
const dropTargetRowId = inject('dropTargetRowId')
const draggingId = inject('draggingId')
const pressingId = inject('pressingId')
const armedId = inject('armedId')

const expanded = computed(() => workspace.expandedIds.includes(props.node.id))
/** 这一行在不在高亮集合里。文件与目录同一套判据 —— 目录也能被选中，选中它就意味着
 *  「页头新建落在它里面」。根目录不画成行，所以没选中时整棵树都不亮。 */
const selected = computed(() => workspace.selectedIds.includes(props.node.id))
/** 未保存标记。开了自动保存就不显示：dirty 只存在几百毫秒，圆点只会闪一下，
    反倒是「这文件没保存」的误导。 */
const dirty = computed(() => !autoSaveEnabled.value && modelManager.isDirty(props.node.id))
/** 拖拽态：被拖的那一行变淡，合法落点那一行铺选中色 */
const isDragging = computed(() => draggingId?.value === props.node.id)
const isDropTarget = computed(() => dropTargetRowId?.value === props.node.id)
/** 触屏按住了、还没到长按阈值：整行用底色当「按住进度」，见样式里的 --pressing */
const isPressing = computed(() => pressingId?.value === props.node.id)
/** 触屏长按已成（菜单也在这一刻弹出来了）：跳一下 + 换成就绪底色，此后移动即拖动，见 --armed */
const isArmed = computed(() => armedId?.value === props.node.id)

/**
 * 打不开的文件：本机文件夹里由 Rust 扫描判出的二进制 / 超大文件。
 * 行照常画（用户得看得见它存在），但图标调暗，点下去只弹一句提示 —— 不建 model、不开页签。
 */
const unopenable = computed(
  () => props.node.type === 'file' && (props.node.binary || props.node.tooLarge),
)

/** 本目录里有没有（任一）被选中的节点 → 它这一列的缩进线跟着亮起（与拖拽落点同一种亮法）。
 *  多选时只要选区里有它的孩子就亮，「这几个文件属于哪个文件夹」照样一眼可见。 */
const isActiveParent = computed(() =>
  workspace.selectedIds.some((id) => getNodeById(id)?.parentId === props.node.id),
)

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
  if (props.node.type === 'directory') {
    toggleExpand(props.node.id)
    return
  }
  // 二进制 / 超大文件：只报一句，不建 model、不开页签（阅读器拿它们没辙，硬开还会卡住界面）
  if (unopenable.value) {
    showNotice?.(t(props.node.binary ? 'error.workspaceBinary' : 'error.workspaceTooLarge'))
    return
  }
  openFile(props.node.id, null, { preview }).catch(() => {})
}

/**
 * 三个手势在这里分岔（顺序即优先级）：
 *
 * - **⌥ / Alt + 单击** = 切换这一行的选中（多选）。只改选区：**不打开文件、不折叠目录** ——
 *   加选是「攒一批待操作的文件」，顺手把文件开一堆、把文件夹收起来都不是此时想要的。
 * - **Shift + 单击** = 从锚点到这一行整段选中。只改选区，同上。区间按**可见行**算
 *   （折叠的子树不在 DOM 里，也就进不了区间），起点是谁由 FileExplorer 定。
 * - **⌘ / Ctrl + 单击** = 打开题目（老行为）。开成了就到此为止 —— 不能再落到 activate() 上，
 *   否则会顺手把这个文件也打开成页签。没链接时 openProblem 回 false，整条退化成普通单击。
 *   平台主修饰键按 IS_MAC 分岔：macOS 上 Control + 单击是系统右键，不能拿来当「打开」。
 * - 其余 = 普通单击：选区收成这一行（清掉多选），再打开 / 折叠。
 *
 * 两个修饰键的手势都**不自己写焦点**：pointerdown 的默认行为已经把这一行聚焦了
 * （行上有 tabindex），focusin 那边只更新 roving tabindex 的记账，不再动选区
 * （2026-10-12 改 —— 原来 focusin 里会 selectNode，那会把刚攒好的多选冲掉）。
 */
function onClick(event) {
  // 拖拽收尾的那一次 click 要吃掉，否则松手会顺带折叠/展开落点目录
  if (consumeClickSuppression?.()) return

  if (event.altKey) {
    toggleSelection(props.node.id)
    return
  }
  if (event.shiftKey) {
    selectRangeTo?.(props.node.id)
    return
  }

  const withModifier = IS_MAC ? event.metaKey : event.ctrlKey
  if (withModifier && openProblem?.(props.node)) return
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
  // 菜单由它在长按到点那一刻自己弹，这里绝不能再弹一个。鼠标右键不走那条路，照旧在这里弹。
  if (suppressContextMenu?.value) return
  openContextMenu?.(event, props.node)
}

// ------------------------------------------------------------ 内联重命名

const renameMode = ref(false)
const renameValue = ref('')
const renameError = ref('')
const renameInput = ref(null)
/** 这一行的 DOM（重命名结束后把焦点交还给它，见 refocusRow） */
const rowEl = ref(null)

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
async function submitRenameOnEnter(event) {
  // 组字中一律不拦：中文输入法的回车是「候选词上屏」，不是提交（见上面那条注释）
  if (event.isComposing || event.keyCode === 229) return
  event.preventDefault()
  // 必须截住冒泡：这个输入框长在行**内部**，keydown 会冒到 row 的 onKeyDown，那里
  // 的 'Enter' 分支会顺手把文件打开 —— 改完名立刻弹出一个页签，看着像误操作。
  event.stopPropagation()
  await commitRename()
  // 提交成功才把焦点交还这一行；撞名失败时输入框还在（renameMode 仍是 true），
  // 那时抢走焦点用户就没法接着改了（refocusRow 里也有这道闸）。
  refocusRow()
}

/**
 * 重命名结束后把焦点交还这一行。
 *
 * 只走「回车提交 / Esc 取消」两条明确的键盘路径 —— **失焦提交那条不能走**：那条正是
 * 「用户点到别处去了」，把焦点拽回来刚好违反他的意图。所以这两个入口各调一次，而不是塞进
 * `cancelRename()` 里（它同时被失焦那条路用着）。
 *
 * 少了这一步会怎样：重命名框一消失，焦点就落到 `<body>` 上，紧接着按 F2 / Delete 是没反应的
 * —— 得再点一次那一行才认，快捷键的观感就成了「只能用一次」。
 */
function refocusRow() {
  if (renameMode.value) return
  nextTick(() => rowEl.value?.focus())
}

/** Esc 取消重命名。单独一个入口只为一件事：取消之后把焦点交还这一行（见 refocusRow） */
function cancelRenameByEsc() {
  cancelRename()
  refocusRow()
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

// ------------------------------------------------------------ 展开 / 折叠动画

/**
 * `.tree-item__children` 的展开 / 折叠动画（见模板里包着的 <Transition>）。
 *
 * 高度从 `auto` 到 `0` 是**不可过渡**的，所以这里只干一件事：在进出场那一帧把高度
 * 换成实测像素，让 CSS 里那条 `transition: height` 有具体数值可插值 —— 时长与曲线
 * 全部在样式表里（.tree-children-enter-active / .leave-active），与页签那套分工一致。
 *
 * 三处细节：
 * - `void el.offsetHeight` 强制一次 reflow：同一帧里连着写「0px」再写目标值会被浏览器
 *   合并成一次样式变更，那样只会看到瞬间跳到位、没有过渡。读一次布局把 0px 定下来。
 * - 进场量的是 `scrollHeight`（此刻被钉在 0 高度，量不到 offsetHeight），退场量的是
 *   `offsetHeight`（此刻还是自然高度，最准）。
 * - `after-enter` 立刻把内联高度交还给 CSS：此后内容还会变（新建、改名、子目录展开），
 *   留着写死的像素值会把容器框住、撑不开。
 */
function onChildrenEnter(el) {
  el.style.height = '0px'
  void el.offsetHeight
  el.style.height = `${el.scrollHeight}px`
}

function onChildrenAfterEnter(el) {
  el.style.height = ''
}

function onChildrenLeave(el) {
  el.style.height = `${el.offsetHeight}px`
  void el.offsetHeight
  el.style.height = '0px'
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
      // macOS：⌘ + ↓ = 打开文件 / 展开折叠目录（Finder、VS Code 同一套口径）。
      // mac 上单按回车已经让给「重命名」了（全局那条捕获监听先拦走），「打开」必须有别的键；
      // Windows / Linux 不动，仍是回车打开、⌘/Ctrl+↓ 按顺序移到下一行。
      if (IS_MAC && event.metaKey) {
        event.preventDefault()
        onEnter()
        break
      }
      event.preventDefault()
      focusRowAt(items[index + 1], event.shiftKey)
      break
    case 'ArrowUp':
      event.preventDefault()
      focusRowAt(items[index - 1], event.shiftKey)
      break
    case 'Home':
      event.preventDefault()
      focusRowAt(items[0], event.shiftKey)
      break
    case 'End':
      event.preventDefault()
      focusRowAt(items[items.length - 1], event.shiftKey)
      break
    case 'ArrowRight':
      event.preventDefault()
      if (props.node.type === 'directory') {
        if (!expanded.value) toggleExpand(props.node.id)
        else focusRowAt(items[index + 1], event.shiftKey)
      }
      break
    case 'ArrowLeft':
      event.preventDefault()
      if (props.node.type === 'directory' && expanded.value) {
        toggleExpand(props.node.id)
      } else if (props.node.parentId) {
        focusRowAt(
          treeRootEl.value?.querySelector(`[data-tree-id="${CSS.escape(props.node.parentId)}"]`),
          event.shiftKey,
        )
      }
      break
    case 'Enter':
      // macOS 上单按回车是**重命名**（默认键位，见 useShortcutManager 的 rename-node）：
      // App.vue 的窗口捕获监听先一步 preventDefault + stopPropagation，所以这一支在 mac
      // 上根本收不到。留在这里是有意的兜底 —— 用户若把重命名改绑到别的键，回车就会重新
      // 落到这儿当「打开」，不至于变成一个按了没反应的键。
      // 非 mac 上回车照旧是打开 / 切换展开（F2 才是重命名）。
      event.preventDefault()
      onEnter()
      break
    case 'Escape':
      // Esc 把多选收成单选（落在主选中那一行）。本来就是单选就整条放行 —— 别拦，
      // Esc 在浏览器里还担着「停止加载 / 退出全屏」这些活，没我们的事就不该挡。
      if (workspace.selectedIds.length > 1) {
        event.preventDefault()
        selectNode(workspace.selectedId ?? props.node.id)
      }
      break
    // 重命名（mac Enter / 其它平台 F2）、Delete（删除）、⌘/Ctrl + A（全选）**刻意不在这里**：
    // 2026-10-10 起前两条、2026-10-12 起全选也是，都登记在 useShortcutManager 里的全局动作，由 App.vue
    // 那个窗口捕获监听统一处理（先过作用域闸门「焦点在资源管理器里、且不在输入框上」，
    // 再进 FileExplorer 的 startRename / requestDelete / selectAllNodes）。留在这里就等于
    // 第二份真相：全局那条在捕获阶段就 stopPropagation 了，这里的分支永远收不到按键；
    // 而且设置里改绑了键位，这里也不会跟着变。
  }
}

/**
 * 键盘把焦点挪到某一行，并按有没有按 Shift 决定选区怎么走。
 *
 * - 不带 Shift：选区收成那一行（**单选**）—— 与鼠标单击同一条语义（原来靠 focusin 里的
 *   selectNode 兜着，2026-10-12 那条撤了，改成这里显式调用，免得焦点一动就把多选冲掉）。
 * - 带 Shift：从锚点扩到那一行（**锚点不动**，所以连着按 Shift+↓ 是从同一个起点越划越长）。
 * - 目标行不存在（已经在头 / 尾）就什么都不做。
 *
 * @param {HTMLElement|undefined} el
 * @param {boolean} extend
 */
function focusRowAt(el, extend) {
  if (!el) return
  el.focus()
  const id = el.dataset.treeId
  if (!id) return
  if (extend) selectRangeTo?.(id)
  else selectNode(id)
}
</script>

<template>
  <div class="tree-item" :class="{ 'tree-item--drop': isDropTarget }">
    <div
      ref="rowEl"
      class="tree-item__row"
      :class="{
        'tree-item__row--dir': node.type === 'directory',
        'tree-item__row--active': selected,
        'tree-item__row--dragging': isDragging,
        'tree-item__row--drop': isDropTarget,
        'tree-item__row--pressing': isPressing,
        'tree-item__row--armed': isArmed,
        'tree-item__row--muted': unopenable,
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
           useMobileKeyboard 代劳 blur —— 那会把「拖选一段文字」变成「提交改名」，选区也一起丢。
           Enter / Esc 都 stop：keydown 会冒到这一行的 onKeyDown（'Enter' 会打开文件、
           'Escape' 会改选区），改名这个闭环里不许它们插进来。 -->
      <input
        v-if="renameMode"
        ref="renameInput"
        v-model="renameValue"
        class="tree-item__input"
        data-keep-focus-on-pan
        @keydown.enter="submitRenameOnEnter"
        @keydown.esc.stop.prevent="cancelRenameByEsc"
        @blur="commitRename"
      />
    </div>
    <p v-if="renameError" class="tree-item__error" :style="{ '--depth': depth }">
      {{ renameError }}
    </p>

    <!-- 展开 / 折叠的高度动画。仍是 v-if：折叠时不留在 DOM 里（键盘导航的可见项
         判据、拖拽落点都按「DOM 里没有 = 不存在」走的，不能改成 v-show）。
         高度怎么钉成可过渡的像素见脚本里那段注释。 -->
    <Transition
      name="tree-children"
      @enter="onChildrenEnter"
      @after-enter="onChildrenAfterEnter"
      @leave="onChildrenLeave"
    >
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
    </Transition>
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
  /* 选中项换行时线要跟着亮起 / 淡掉，跟行底色同一条曲线、同一个时长 */
  transition: background-color 150ms cubic-bezier(0.22, 0.61, 0.36, 1);
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

/* 展开 / 折叠（模板里 <Transition name="tree-children">）：时长与曲线只写在这里，
   高度值由脚本在进出场那一帧钉成实测像素（见 onChildrenEnter / onChildrenLeave）。
   过渡期间 overflow: hidden 把子项裁在容器里 —— 少了它，收缩到底的那一刻子项会
   先溢出到下面的行上再消失。上面那条范围线画在这个容器的 ::before 上、上下端就是
   容器的起止，所以它会跟着一起收放，不需要额外处理。
   没有 animation-delay，减弱动效下走 base.css 那条全局兜底（压 duration）即可干净退化。 */
.tree-children-enter-active,
.tree-children-leave-active {
  overflow: hidden;
  transition:
    height 180ms cubic-bezier(0.22, 0.61, 0.36, 1),
    opacity 180ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

.tree-children-enter-from,
.tree-children-leave-to {
  opacity: 0;
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
  /* 底色过渡：悬停、选中、取消选中都是同一支笔在同一行上加/减一层底，走同一条曲线
     就不会有「跳一下」的观感。只过渡背景色 —— 行的布局（高度、缩进）绝不参与动画。 */
  transition: background-color 150ms cubic-bezier(0.22, 0.61, 0.36, 1);
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

/* ---------------------------------------------------------------- 触屏长按（2026-10-10 加）
   触屏上借不到 hover，而从按住到「能拖」中间隔着 450ms 的等待 —— 这一段不给反馈，
   手感就是「按了没反应」。所以拆成两段提示（两个 id 都只在 pointerType !== 'mouse' 时置位，
   鼠标路径完全不受影响）：

   - `--pressing`「还在等」：整行底色当作进度条，从透明线性走到 --bg-hover，
     到点那一刻刚好走完（时长必须与 useTreeDrag.js 的 LONG_PRESS_MS 一致）。
   - `--armed`「已经到点」：跳一下（放大回弹），就绪底色一直留到松手或真的开始拖。
     这一刻菜单已经弹出来了（2026-10-11 改，以前要等抬手才弹），此后的分叉看指头怎么走：
     「就此移动 = 收掉菜单改判拖走」「原地抬手 = 菜单留着接着点」。动画本身不区分这两条，
     只负责说「长按已经成功」。

   两条都写成「元素 + 类」的双类 (0,2,0)：单类 (0,1,0) 压不过上面那两条 :hover / --active:hover；
   而触屏浏览器常常在按下时就补一个 :hover，写成单类的话进度条一上来就被悬停色顶掉、根本出不来。 */
.tree-item__row.tree-item__row--pressing {
  background: var(--bg-hover);
  /* 线性（不加缓动）：进度条要走得均匀，到头才是「正好可以松手」的那一瞬。
     减弱动效时这条会被 base.css 的 prefers-reduced-motion 兜底压成 0.01ms —— 那就只剩
     到点时的跳一下，仍然说得清「成功了」。 */
  transition: background-color 450ms linear;
}

.tree-item__row.tree-item__row--armed {
  /* 跳一下时行会短暂溢出，压在上下相邻两行之上，免得被它们切断 */
  position: relative;
  z-index: 2;
  background: var(--bg-hover);
  /* 「跳一下」：只动 transform，行不位移也不留形变，播完自己回到原样。
     刻意不加投影（2026-10-10 按要求去掉）：就绪感只靠「底色保持 + 跳一下」表达。
     放到 animation 而不是 transition，是为了让它**只播这一次**——留在就绪态里等松手时
     不会再被任何属性变化重新触发。 */
  animation: tree-press-pop 220ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

@keyframes tree-press-pop {
  0% {
    transform: scale(1);
  }
  40% {
    transform: scale(1.04);
  }
  100% {
    transform: scale(1);
  }
}

/* 打不开的文件（本机文件夹里的二进制 / 超大文件）：图标与名字调暗一档，说明「这一行点了也看不
   了」，但行本身照旧可选中 / 可改名 / 可删。点下去弹一句提示，见 activate()。 */
.tree-item__row--muted .tree-item__icon,
.tree-item__row--muted .tree-item__label {
  opacity: 0.45;
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
