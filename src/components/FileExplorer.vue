<script setup>
/**
 * FileExplorer —— 资源管理器面板：头部操作（新建 / 导入）+ 树容器 + 右键菜单
 * （打开题目 / 题目信息 / 新建 / 导入 / 导出 / 重命名 / 删除）+ 两张自绘弹窗（删除确认、题目信息）
 * 与导出落点选择。
 *
 * 「资源管理器」这个标题由统一侧边栏的页签承担（见 Sidebar.vue），这里头部只留操作按钮。
 * 新建的目标目录可以是任意已存在目录：页头按钮跟随**主选中那一行**（选中文件时取其父目录；
 * 点树里空白处 = 选中根，回落根目录），右键目录则显式指定该目录。导入的目标目录同理。
 * 选中态是唯一来源，读取与写入都在 workspaceStore 里。
 * 名字仍是单级（assertName 拒绝 /），嵌套路径留待后续。
 *
 * 【多选】（2026-10-12 加）高亮集合是 `workspace.selectedIds`，`workspace.selectedId` 是其中的
 * **主选中兼锚点**（页头新建的目标、Shift 区间选择的起点）。三种手势在 FileTreeItem 里分岔：
 * 单击 = 收成单选、⌥/Alt + 单击 = 加选 / 减选、Shift + 单击 = 锚点到这一行整段。
 * ⌘/Ctrl + A 全选的是**焦点节点所在父文件夹里的内容**（2026-10-12 用户拍板，见 `selectAllNodes`）；
 * 焦点在树的空白处时那个「文件夹」就是根，于是选中的是顶层那些节点。
 * 区间与全选都以本组件手上的状态为准（DOM 顺序 / 父子关系只有这里拿得到），所以那两个入口
 * （`selectRangeTo` / `selectAllNodes`）留在本组件并 provide 下去 / 由全局快捷键调用。
 * 删除与导出（右键那两项、以及全局的 ⌘⌫ / Delete）作用于**整个选区** —— 选区只有一项时退化成
 * 那一行。
 *
 * 【选中高光两档】（2026-11-18 加，对齐 VS Code）选中行的底色分「资源管理器是活动区域」与
 * 「不是」两档（`--active` / `--active-idle`，样式在 FileTreeItem），判据是本组件的
 * `treeActive`：按在侧栏里就是活动，按到编辑区 / 别处就退一档。行上的右键也把那一行选中
 * （`openContextMenu`）。判据**刻意不用焦点**，理由见「活动区域」那一节。
 *
 * 【导入 / 导出】（2026-10-12 加）与外部文件系统之间搬文件，通路全在 `services/fileTransfer.js`
 * （选文件 / 打包 / 落盘都不在这个组件里）。本组件只负责**入口与落点**：
 * - 导入：页头两颗（文件 / 文件夹）+ 右键目录那两项，都落在「被右键的目录」或主选中目录；
 * - 从系统里**拖进来**（2026-10-12 加）：手势与落点判定全在 `composables/usePageDrop.js`
 *   （整页都是落点；压在行上就落进那一行所在的目录，别处落进根目录）。本组件只接落地那一脚
 *   —— `importItems`，与选文件那条**同源** —— 并把落点灯亮起来（`mergedDropRowId` /
 *   `mergedRootDrop`，与站内拖拽的高亮合流）。结果播报走 `announce` 这一个出口：
 *   页头 / 右键导入落行内横幅，页面级拖入由 App.vue 换成全局通知（2026-10-13 加，
 *   那条要把「放到了哪儿」也说出来，见 `announceImportInline`）；
 * - 导出：右键那一项。非桌面端直接下载（单文件不套 zip）；桌面壳先弹一张二选一的小卡片
 *   （写进本机文件夹 / 下载为 zip），因为只有它做得到写盘。
 *
 * 通过 provide 向递归树项提供能力：右键菜单、**打开题目**、根 DOM、重命名目标、焦点管理、
 * 范围选择入口，内联新建的状态与提交入口，以及拖拽（起手 / 落点高亮 / 点击抑制）。输入行由
 * InlineCreateRow 渲染：根目录这份在本组件，建在某个目录里的那份在 FileTreeItem 的 role="group" 里。
 * 另经 defineExpose 对外给出四个入口：三个给全局快捷键（`startRename` / `requestDelete` /
 * `selectAllNodes`，都收**可空**的节点 id：焦点在树的空白处时 App.vue 给 null，前两个拿主选中
 * 那一行顶上、全选把「空白处」当成根，见 `keyboardRowId` / `folderContentIds`，供 F2 / ⌘⌫ /
 * ⌘·Ctrl+A 调用），一个给页面级拖入（`importDroppedItems`）—— 见文件末尾。
 * 2026-11-17 又加了第五个 `startCreate`：空编辑区那块板上的「新建文件」行与全局 ⌥⌘N 都走它，
 * 在这里起一行内联新建。落点见 `shortcutCreateTarget()`：右键菜单开着就落菜单指的那个目录
 * （菜单里那条「新建文件」的右列就写着这个键位），否则与页头那颗同一个（跟随主选中）。
 * 那三条快捷键的作用域闸门是「焦点在资源管理器这块面板里」（行上或树的空白处都算，见 App.vue 的
 * treeScopeFrom），所以空白处也必须是个焦点落点：容器上有 `tabindex="-1"`，由 onTreePointerDown 接住。
 */
import { computed, inject, nextTick, onMounted, onUnmounted, provide, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import AppIcon from './AppIcon.vue'
import ContextMenu from './ContextMenu.vue'
import FileTreeItem from './FileTreeItem.vue'
import InlineCreateRow from './InlineCreateRow.vue'
import LoadingSpinner from './LoadingSpinner.vue'
import { useTreeDrag } from '../composables/useTreeDrag.js'
import { useOverlayScrollbar } from '../composables/useOverlayScrollbar.js'
import { pageDropTarget } from '../composables/usePageDrop.js'
import { IS_MAC, formatCombo, useShortcutManager } from '../composables/useShortcutManager.js'
import { t } from '../i18n/index.js'
import { fileIconName } from '../services/fileIcons.js'
import { templateForPath } from '../services/fileTemplates.js'
import {
  CAN_EXPORT_TO_DISK,
  canPickFolder,
  collectExport,
  exportAsZip,
  exportSingleFile,
  importInto,
  pickFromDisk,
  planImport,
} from '../services/fileTransfer.js'
import {
  activeLanguage,
  createDirectory,
  createFile,
  deleteNode,
  getNodeById,
  moveNode,
  openFile,
  problemUrlKey,
  revealId,
  selectMany,
  selectNode,
  toggleExpand,
  updateFileMeta,
  workspace,
} from '../services/vfs/workspaceStore.js'
import { assertName, basename, join } from '../services/vfs/paths.js'
import { pruneNestedNodes } from '../services/vfs/treeOps.js'
import { onStartupNotice } from '../services/vfs/workspaceNotices.js'
import {
  OJ_LIST,
  difficultyOptionsFor,
  difficultySystemFor,
  emptyMeta,
  labelOf,
  normalizeMeta,
  openProblemUrl,
  problemUrlOf,
  todayISO,
} from '../services/problemMeta.js'
import { CHECKERS } from '../services/checkers.js'
import {
  solvedLockedOfUrl,
  solvedSourceOfUrl,
  toggleSolvedUrl,
} from '../services/solvedIndex.js'
import { watchBackLayer } from '../services/backStack.js'

/**
 * 弹窗里的比对方式选项：**全部五档都列**（2026-11-09 改）。
 *
 * 原来只列「默认逐行之外的几种」，因为默认值不落盘、选了也是空串。现在全局设置
 * （cp.checker）可能是「忽略空白」，题目若需要「逐行」就得能显式钉住 —— 把 `lines`
 * 从选项里剔掉，那道题就永远跟着全局走了。留空一项表示「跟随全局设置」。
 */
const CHECKER_OPTIONS = CHECKERS

/**
 * 窄屏下把文件拖出树（朝编辑区去）时通知外层收起抽屉。
 * 本组件不知道侧栏是展开还是折叠 —— 那是 App 的 panelVisible，见下面的 onDragOut。
 */
const emit = defineEmits(['drag-out'])

const rootEl = ref(null)

// 页头右侧的动作区（新建文件 / 文件夹两颗钮）经 Teleport 投进 Sidebar 的共享页头
// （#sidebar-context），只在本面板激活时投 —— 切换器单实例上提后（2026-10-11），
// 各面板留给页头的只剩这一小条上下文动作
const { activeTab } = inject('sidebarTabs')
const isActivePanel = computed(() => activeTab.value === 'explorer')

/** 快捷键绑定表：菜单右列的键位读它（设置里改绑，这里跟着变，见 shortcutOf） */
const { bindings } = useShortcutManager()

/** 内联新建状态：{ type:'file'|'directory', targetId, targetPath, value, error } | null
 *  targetId 为 'root' 或目标目录的节点 id；targetPath 是它的绝对路径（根为 '/'）。 */
const creating = ref(null)
/** 内联新建输入行的句柄（InlineCreateRow 挂载时注册）；同一时刻只有一行 */
const creatingRow = ref(null)
/** 右键菜单状态：{ x, y, node, items } | null */
const menu = ref(null)
/** 查找文件：搜索栏是否展开（展开时结果列表替代文件树） */
const searchOpen = ref(false)
/** 查找文件：搜索词，可以是文件名片段或完整的 / 部分题目链接 */
const searchQuery = ref('')
/** 查找文件：当前高亮的结果下标（方向键 / 指针移动） */
const searchActive = ref(0)
/** 查找文件：输入框，展开后把焦点送进去 */
const searchInput = ref(null)
/** 需要进入重命名的节点 id */
const renameTarget = ref(null)
/** 树内最近获得焦点的 id（roving tabindex） */
const focusedId = ref(null)
/** 待确认删除的节点**列表**（多选删除时不止一个）；空数组 = 没有待确认的删除 */
const pendingDelete = ref([])
/** 删除确认弹窗里最多列几条路径（再多就折成一句「另有 N 项」，免得卡片长得没法看） */
const DELETE_LIST_MAX = 6
/** 确认弹窗里的「删除」按钮：弹窗打开时把焦点送进去 */
const confirmBtn = ref(null)
/** 待删名单里有没有目录 —— 有就多提示一句「里面的东西会一起删掉」 */
const hasDirectory = computed(() => pendingDelete.value.some((node) => node.type === 'directory'))

/** 待导出的节点（**只有桌面壳**会先攒在这里弹二选一卡片）；空数组 = 卡片没开 */
const pendingExport = ref([])
/** 导出卡片里第一颗按钮：卡片打开时把焦点送进去（Esc 才落在卡片上、Enter 能直接确认） */
const exportFirstBtn = ref(null)
/** 导入 / 导出进行中：两颗页头按钮与菜单项据此禁用，别让用户连点 */
const transferBusy = ref(false)

/**
 * 导入 / 导出 / 删除进行中的行内提示：`{ key, params } | null`。
 *
 * **延迟 120ms 才露面**：小文件、单条删除经常几十毫秒就完事，立刻亮一行「正在…」
 * 只会闪一下、还把树往下顶一次。真等到这一刻的用户才需要看见它；不足 120ms 的
 * 操作从头到尾什么都不多出来。
 */
const transferPhase = ref(null)
let transferPhaseTimer = 0
let transferPhaseToken = 0

function beginTransferNotice(key, params) {
  const token = ++transferPhaseToken
  window.clearTimeout(transferPhaseTimer)
  transferPhaseTimer = window.setTimeout(() => {
    if (token === transferPhaseToken) transferPhase.value = { key, params }
  }, 120)
  return token
}

function endTransferNotice(token) {
  if (token !== transferPhaseToken) return
  transferPhaseToken += 1
  window.clearTimeout(transferPhaseTimer)
  transferPhase.value = null
}

const transferNotice = computed(() => {
  const phase = transferPhase.value
  return phase ? t(phase.key, phase.params) : ''
})

/** 正在编辑题目信息的节点；null = 弹窗关闭 */
const metaTarget = ref(null)
/** 题目信息表单的绑定值 */
const metaForm = ref(emptyMeta())
/** 保存失败的提示 */
const metaError = ref('')
/** 弹窗里的「OJ」下拉：出现后把焦点送进去 */
const metaFirstField = ref(null)

// ------------------------------------------------------------ 内联新建

/**
 * 新建时的默认名字：文件跟着当前判题语言给 new.cpp / new.py，目录给「新建文件夹」；
 * 与目标目录下已有名字撞了就往后排 new-2、new-3……——预填的名字不该让用户敲下回车先吃一个「已存在」。
 * @param {'file'|'directory'} type
 * @param {string} targetId 'root' 或目标目录的节点 id
 * @returns {string}
 */
function defaultName(type, targetId) {
  const siblings =
    targetId === 'root' ? workspace.tree : (getNodeById(targetId)?.children ?? [])
  const taken = new Set(siblings.map((node) => basename(node.path)))
  if (type !== 'file') return uniqueName(taken, t('explorer.defaultFolderName'))
  return uniqueName(taken, 'new', activeLanguage.value === 'python' ? '.py' : '.cpp')
}

/**
 * @param {Set<string>} taken
 * @param {string} base
 * @param {string} [ext] 目录留空
 * @returns {string}
 */
function uniqueName(taken, base, ext = '') {
  if (!taken.has(base + ext)) return base + ext
  let index = 2
  while (taken.has(`${base}-${index}${ext}`)) index += 1
  return `${base}-${index}${ext}`
}

/**
 * 页头按钮的目标目录：跟随**主选中那一行**（目录就是它自己，文件取其父目录），
 * 什么都没选中（= 选中根）或索引未就绪时回落根目录 —— 界面上此时整棵树都不高亮。
 * 多选时主选中是锚点那一个（见 workspace.selectedIds 的注释）。
 * @returns {object|null}
 */
function headerCreateTarget() {
  const node = workspace.selectedId ? getNodeById(workspace.selectedId) : null
  if (!node) return null
  if (node.type === 'directory') return node
  return getNodeById(node.parentId) ?? null
}

/**
 * @param {'file'|'directory'} type
 * @param {object|null} target 目标目录节点；null = 根目录
 */
function startCreate(type, target = null) {
  menu.value = null
  const targetId = target ? target.id : 'root'
  // 输入行渲染在目标目录的 role="group" 里，而那个 div 挂着 v-if="expanded"——
  // 目标目录折叠时行根本不存在，得先展开（沿用 expandedIds，会一起被持久化）。
  if (target && !workspace.expandedIds.includes(targetId)) toggleExpand(targetId)
  creating.value = {
    type,
    targetId,
    targetPath: target ? target.path : '/',
    value: defaultName(type, targetId),
    error: '',
  }
  // autofocus 属性对动态插入的节点不生效（浏览器只在解析 HTML 时认它），得自己把焦点送进去。
  // 与 FileTreeItem 的重命名同款：聚焦 + 只选中主干（后缀留在选中区外），
  // 默认名字可以直接敲回车接受，也可以直接打字替换主干。选中范围在 InlineCreateRow.focus() 里定。
  nextTick(focusCreateInput)
}

function focusCreateInput() {
  creatingRow.value?.focus()
}

/**
 * 全局「新建文件」键位（⌥⌘N / Ctrl+Alt+N）落在哪个目录。
 *
 * 右键菜单**开着**时以它指的那一行为准 —— 菜单里那条「新建文件」的右列就写着这个键位，
 * 两者必须是同一件事。行上的右键 2026-11-18 起会顺手把那一行选中（见 openContextMenu），
 * 所以绝大多数时候它和页头那颗按钮（跟**主选中**）本来就指向同一处；仍然按 `menu.node`
 * 算是为了**空白处那份菜单**：它没有节点，`node` 是 `headerCreateTarget()` 现算的，
 * 与页头那颗同源，键位落在哪儿跟着同一个判据走。
 * 菜单落在文件行上时取它的父目录（文件行那份菜单里没有「新建文件」，但键位是全局的，
 * 照样得有个合理落点）；菜单没开就与页头那颗同源（`headerCreateTarget()`），
 * 什么都没选中时回落根目录。
 *
 * @returns {object|null} 目标目录节点，null = 根目录
 */
function shortcutCreateTarget() {
  const node = menu.value?.node
  if (!node) return headerCreateTarget()
  return node.type === 'directory' ? node : (getNodeById(node.parentId) ?? null)
}

/**
 * 在途的创建轮次（= 已经交给 VFS、还没回来的那些 state 对象）。
 * 用来区分「用户离开输入框」和「我们自己把焦点弄丢了」，见 onCreateBlur。
 * @type {Set<object>}
 */
const createFlights = new Set()

function cancelCreate() {
  creating.value = null
}

/**
 * 输入框失焦。正常情况（用户点到别处）就提交；但有一类**程序性**失焦必须挡掉：
 * 创建完成后会自动打开新文件，Monaco 顺势 focus() 把焦点抢走（EditorPane 里换 model 后
 * 的那行 instance.focus()）。那不是用户要离开输入框 —— 照常提交的话，会凭空多出一个
 * 用默认名建出来的文件（连点两次「新建文件」时最明显：第二轮输入框刚聚焦就被提交掉）。
 * 触屏上抢不走：那行 focus() 被 isTouchPointer() 挡了（见 HANDOFF 第 3 节触摸屏那节），
 * 所以这条只对鼠标设备生效；触屏下要提交得按回车或真的点到别处去。
 *
 * 分两种：
 * - 屏幕上这个输入框自己就在提交中：这次失焦正来自「打开刚建好的文件」，跳过重复提交，
 *   也不去抢焦点 —— 它马上就会被移除，焦点留给 Monaco 正合适。
 * - 在途的是上一轮（连点两次「新建文件」）：这个刚聚焦的输入框是被误伤的，把焦点要回来
 *   （Monaco 的 focus 在 pre-flush watcher 里，nextTick 抢得赢），并放弃这次提交。
 */
function onCreateBlur() {
  if (!createFlights.size) {
    commitCreate()
    return
  }
  if (!createFlights.has(creating.value)) nextTick(focusCreateInput)
}

async function commitCreate() {
  const state = creating.value
  if (!state) return
  const name = state.value.trim()
  if (!name) {
    cancelCreate()
    return
  }
  createFlights.add(state)
  try {
    assertName(name)
    const path = join(state.targetPath, name)
    // 按扩展名归一到语言、取该语言的模板当初始正文（认不出的扩展名给空串＝空文件）。
    // 设置页可改这三份模板，见 services/fileTemplates.js。
    if (state.type === 'file') await createFile(path, templateForPath(path))
    else await createDirectory(path)
    // 只关掉自己这一轮：创建是异步的，等它回来的这段时间里用户可能又点了一次「新建文件」
    // （blur 会先提交上一轮），无条件清空会把刚打开的新输入框一起抹掉。
    if (creating.value === state) creating.value = null
  } catch (error) {
    state.error = error.message || t('explorer.createFailed')
  } finally {
    createFlights.delete(state)
  }
}

// ------------------------------------------------------------ 右键菜单

function openContextMenu(event, node) {
  if (!node) return // 索引尚未就绪等情况：静默，不弹菜单
  focusedId.value = node.id
  // 右键也把这一行的高光「落下」（2026-11-18 加，用户要求对齐 VS Code：右键之后要有较深的
  // 高光代表选中）。语义照 VS Code：落在**选区外**就把选区收成这一行，落在**多选里面**则保留
  // 那一整片 —— 菜单里「导出 N 项 / 删除 N 项」正是按选区报数的（见 buildMenuItems 的 multi），
  // 右键其中一项就把多选冲掉的话，那条菜单永远报不出 N。
  if (!workspace.selectedIds.includes(node.id)) selectNode(node.id)
  menu.value = { x: event.clientX, y: event.clientY, node, items: buildMenuItems(node) }
}

/**
 * 收掉右键菜单。触屏那条路是 useTreeDrag 在用：长按到点它会自己把菜单弹出来（`openContextMenu`），
 * 手指随后一移就把这次手势改判成拖拽，菜单得跟着退场（见 useTreeDrag.js 的 startDrag）。
 */
function closeContextMenu() {
  menu.value = null
}

/**
 * 取出这一行可安全打开的题目链接，拿不到就返回空串。
 *
 * 判据本体在 `services/problemMeta.js` 的 `problemUrlOf`（页签栏的右键菜单与 ⌘ / Ctrl + 单击
 * 共用同一份），这里只是把节点换成它的 `meta`，让下面的调用点保持 node 口径。
 */
function problemUrl(node) {
  return problemUrlOf(node?.meta)
}

/**
 * 在新标签页打开这一行的题目。返回「到底开没开」—— 调用方（树项里的 ⌘ / Ctrl + 单击）要靠它
 * 决定要不要退化成普通单击，所以拿不到链接时**必须**回 false，不能只是静默。
 *
 * 出口同样在 problemMeta.js（`openProblemUrl`）：与页签右键菜单、页签上的 ⌘ / Ctrl + 单击
 * 是同一个实现，别在这儿另开一条 window.open。
 * @param {object} node
 * @returns {boolean}
 */
function openProblem(node) {
  return openProblemUrl(node?.meta)
}

/**
 * 切换这一行题目的「已通过」手动标记。自动命中的切换不动（见 solvedIndex 文件头），
 * 所以菜单项在那种情况下压根不给（判据与这里同一个函数）。
 * @param {object} node
 */
function toggleSolved(node) {
  const url = problemUrl(node)
  if (url) toggleSolvedUrl(url)
}

/**
 * 菜单的分组口径（2026-11-17 用户重排，三份菜单同一套路）：
 *
 * 1. **核心业务置顶**：右键一行，用户最想干的是操作**这一行本身**——文件是它的题目属性
 *    （打开题目 / 标记已通过 / 题目信息），目录是往里加东西（新建）。
 * 2. **同类跟随、异类隔线**：往目录里灌外部内容（导入）与新建不同源，用分隔线隔开，
 *    但都还在上半区，因为它们都是「内容扩充」。
 * 3. **全局操作下放**：⌘ + ⇧ + F 是资源管理器级的全量搜索，与某一行关系最弱，
 *    排在「对节点本身的管理」之后、危险操作之前，绝不占首位。
 * 4. **危险操作置底**：删除永远单独一条分隔线垫在最后，防误触。
 *
 * 题目信息只对文件有意义；新建 / 导入只对目录有意义——目标就是被右键的那个目录。
 * （页头按钮那条路只能跟随聚焦节点，表达不了「建在哪个目录」。）
 *
 * 「重命名 / 删除」两项挂上右列键位：它们是真的能按的（键位读绑定表 —— mac 上重命名是 Enter、其它平台 F2，见下 shortcutOf），
 * 不是装饰。目录与文件共用同一组键位。
 *
 * 「导入文件夹」只在真选得动文件夹的平台上给（Android / iOS 的 file input 拿不到目录结构，
 * 见 fileTransfer.canPickFolder）。
 */
function buildMenuItems(node) {
  const items = []
  // 右键落在**多选中的某一行**上时，导出 / 删除作用于整个选区（VS Code 口径），标签也就跟着
  // 报数，免得用户以为只动手底下这一个。右键一行不在选区里时照旧只对它自己。
  const multi = node && workspace.selectedIds.includes(node.id) && workspace.selectedIds.length > 1
  if (node?.type === 'file') {
    // 右列不是 keydown 组合键，是 ⌘ / Ctrl + 单击这一行这个**手势**本身 —— 走不了 formatCombo
    // （它只吃 'Mod+KeyX' 那种串），但它是真的能按的，所以照旧填右列、不留空。
    // 其中「单击」不是单词，是 `shortcutIcon: 'pointer'` 画出来的一枚指针（2026-11-17 用户口径
    // 「单击换成鼠标的指针的 logo」）—— 所以文案只到「⌘ +」为止，别把它再写回字面。
    if (problemUrl(node)) {
      const problemLink = problemUrl(node)
      items.push({
        id: 'open-url',
        label: t('explorer.menu.openUrl'),
        shortcut: t('explorer.menu.openUrlPointer', { mod: IS_MAC ? '⌘' : 'Ctrl' }),
        shortcutIcon: 'pointer',
      })
      // 「已通过」标记就挂在「打开题目」下面 —— 两者都只对有题目链接的文件成立。
      // 锁住的（CF 上真有 OK 提交 / 本站刚交过 AC）时**不给这一项**：手动取消不了它，
      // 给了就是个点了没反应的菜单（判据见 services/solvedIndex.js 文件头）。
      const source = solvedSourceOfUrl(problemLink)
      if (!solvedLockedOfUrl(problemLink)) {
        items.push({
          id: 'toggle-solved',
          label: source === 'manual' ? t('cf.solved.unmark') : t('cf.solved.mark'),
        })
      }
    }
    items.push({ id: 'meta', label: t('explorer.menu.meta') })
    // 第一组到此为止：上面三条都是「这道题」的属性，下面的都是文件本身的管理动作。
    items.push({ divider: true })
    // 第二组：通用文件流转。重命名排在导出前面 —— 频率更高（改个名字比打包下载常见）。
    items.push({
      id: 'rename',
      label: t('explorer.menu.rename'),
      shortcut: shortcutOf('rename-node'),
    })
    items.push({
      id: 'export',
      label: multi
        ? t('explorer.menu.exportMany', { n: workspace.selectedIds.length })
        : t('explorer.menu.export'),
    })
    // 第三组：全局搜索。它与「这一个文件」关系最弱，下放到管理动作之后、删除之前。
    items.push({ divider: true })
    items.push({
      id: 'find-file',
      label: t('explorer.menu.findFile'),
      shortcut: shortcutOf('find-file'),
    })
  } else if (node?.type === 'directory') {
    // 第一组：往这个目录里「生成」新东西 —— 右键文件夹的第一诉求。
    // 「新建文件」的右列挂全局那条键位（=`new-file` 动作，读绑定而不写死）。它与重命名 /
    // 删除那两条同一个口径：菜单里报的就是真按得动的那个键，用户在设置里改绑这里跟着变。
    items.push({
      id: 'new-file',
      label: t('explorer.menu.newFile'),
      shortcut: shortcutOf('new-file'),
    })
    items.push({ id: 'new-folder', label: t('explorer.menu.newFolder') })
    // 第二组：扩充内容，但来源是「外部」（导入 ≠ 新建），所以隔一条线。
    items.push({ divider: true })
    items.push({ id: 'import-file', label: t('explorer.menu.importFile') })
    if (canPickFolder()) items.push({ id: 'import-folder', label: t('explorer.menu.importFolder') })
    // 第三组：全局搜索，紧跟内容扩充之后。
    items.push({ divider: true })
    items.push({
      id: 'find-file',
      label: t('explorer.menu.findFile'),
      shortcut: shortcutOf('find-file'),
    })
    // 第四组：对这个目录自身的管理（重命名在前，频率高于导出）。
    items.push({ divider: true })
    items.push({
      id: 'rename',
      label: t('explorer.menu.rename'),
      shortcut: shortcutOf('rename-node'),
    })
    items.push({
      id: 'export',
      label: multi
        ? t('explorer.menu.exportMany', { n: workspace.selectedIds.length })
        : t('explorer.menu.export'),
    })
  }
  // 危险操作一律垫底，并且**自己**一条分隔线隔开（文件 / 目录两份菜单共用这一段）。
  items.push({ divider: true })
  items.push({
    id: 'delete',
    label: multi
      ? t('explorer.menu.deleteMany', { n: workspace.selectedIds.length })
      : t('explorer.menu.delete'),
    shortcut: shortcutOf('delete-node'),
  })
  return items
}

/**
 * 菜单右列的键位。读的是快捷键绑定表 —— 在设置里改绑这里跟着变（与 `EditorPane` 状态栏读
 * `formatCombo(bindings.run)` 是同一个口径，**别写成写死的 'F2' / 'Delete'**）。
 * 未绑定时给空串，`ContextMenu` 那边 `v-if` 一挡，右列那一格就不出现。
 * @param {string} actionId
 * @returns {string}
 */
function shortcutOf(actionId) {
  return bindings.value[actionId] ? formatCombo(bindings.value[actionId]) : ''
}

async function onMenuSelect(id) {
  const node = menu.value?.node
  menu.value = null
  // 「查找文件」是资源管理器级动作，与具体节点无关；空白处那份菜单也给它
  if (id === 'find-file') openSearch()
  // 「往这个目录里加东西」这四项节点行与空白处两份菜单共用：`node` 就是目标目录（行上那份是那一行，
  // 空白处那份由 onTreeContextMenu 用 headerCreateTarget() 算出来；null = 根目录，见两个签名的默认值）。
  else if (id === 'new-file') startCreate('file', node)
  else if (id === 'new-folder') startCreate('directory', node)
  // 导入的两条必须在**这次点击的调用栈里**走到 pickFromDisk 的 input.click() ——
  // 浏览器的规矩是「文件选择器只能由用户手势打开」，绕到 await 后面就会被静默忽略。
  // runImport 的第一句就是它，中间没有别的 await，所以这条链是安全的（别在前面插入 await）。
  else if (id === 'import-file') void runImport('file', node)
  else if (id === 'import-folder') void runImport('folder', node)
  // 下面这几项都作用于**节点本身**，没有节点就没什么可做的（空白处那份菜单压根不给它们）
  else if (!node) return
  else if (id === 'meta') beginEditMeta(node)
  else if (id === 'open-url') openProblem(node)
  else if (id === 'toggle-solved') toggleSolved(node)
  else if (id === 'export') requestExport(node.id)
  else if (id === 'rename') beginRename(node.id)
  else if (id === 'delete') requestDelete(node.id)
}

// ------------------------------------------------------------ 查找文件

/** 结果条数上限：再多也没人逐个翻，滚动成本反而更高 */
const SEARCH_RESULT_LIMIT = 200

/** 工作区里的全部文件（展平嵌套树）；目录只在结果行的路径里出现 */
const searchableFiles = computed(() => {
  const files = []
  const walk = (nodes) => {
    for (const node of nodes) {
      if (node.type === 'file') files.push(node)
      if (node.children) walk(node.children)
    }
  }
  walk(workspace.tree)
  return files
})

/**
 * 搜索词 / 题目链接归一成可比键。
 *
 * 完整链接走 `problemUrlKey`；用户常省略协议（`codeforces.com/contest/1/problem/A`），
 * 补一个 `https://` 再归一。纯关键词（`cpp`、`main`）不参与 —— 否则短词会命中所有带它的链接。
 * @param {string} [text]
 * @returns {string}
 */
function normalizedUrlKey(text) {
  const trimmed = (text || '').trim()
  if (!trimmed) return ''
  const key = problemUrlKey(trimmed)
  if (key) return key
  if (!/[./]/.test(trimmed)) return ''
  return problemUrlKey(`https://${trimmed.replace(/^\/+/, '')}`)
}

/**
 * 搜索匹配：文件名 > 路径 > 题目链接。
 *
 * 链接先按 `problemUrlKey` 归一再比，所以 `/contest/1/problem/A` 与
 * `/problemset/problem/1/A` 两种写法能互相命中（归一判据与去重共用一份）。
 */
const searchResults = computed(() => {
  const raw = searchQuery.value.trim()
  if (!raw) return searchableFiles.value.slice(0, SEARCH_RESULT_LIMIT)

  const needle = raw.toLowerCase()
  const needleUrl = normalizedUrlKey(raw).toLowerCase()
  const matches = []

  for (const node of searchableFiles.value) {
    const name = node.name.toLowerCase()
    const path = node.path.toLowerCase()
    const url = (node.meta?.url || '').toLowerCase()
    let score = 0
    if (name === needle) score = 100
    else if (name.startsWith(needle)) score = 80
    else if (name.includes(needle)) score = 60
    else if (path.includes(needle)) score = 40
    else if (url.includes(needle)) score = 30
    else if (needleUrl) {
      const urlKey = normalizedUrlKey(node.meta?.url).toLowerCase()
      if (urlKey === needleUrl || urlKey.includes(needleUrl)) score = 35
    }
    if (score) matches.push({ node, score })
  }

  matches.sort((a, b) => b.score - a.score || a.node.path.localeCompare(b.node.path))
  return matches.slice(0, SEARCH_RESULT_LIMIT).map((item) => item.node)
})

watch(searchQuery, () => {
  searchActive.value = 0
})

watch(searchResults, (list) => {
  if (searchActive.value >= list.length) searchActive.value = Math.max(list.length - 1, 0)
})

/** 打开搜索栏（快捷键 / 右键菜单两条入口都走这里） */
function openSearch() {
  menu.value = null
  searchOpen.value = true
  searchQuery.value = ''
  searchActive.value = 0
  nextTick(() => searchInput.value?.focus())
}

function closeSearch() {
  searchOpen.value = false
  searchQuery.value = ''
  searchActive.value = 0
}

function moveSearchActive(delta) {
  const total = searchResults.value.length
  if (!total) return
  searchActive.value = (searchActive.value + delta + total) % total
}

/**
 * 搜索框键盘：上/下选结果、回车打开、Esc 关栏。
 *
 * 组字中的按键一个都不接：中文输入法里「回车」常常是「确认候选词」而不是「提交」，
 * 那一发 keydown 的 isComposing 还是 true —— 照旧往下走，等于拼音刚上屏、搜索栏连同
 * 整块查找一起被关掉（结果列表里恰好有命中时还会顺手把文件打开）。上/下键同理，
 * 那是输入法在选候选词。keyCode 229 是部分输入法组字时不报 isComposing 的补漏；
 * 与全局快捷键同一条规矩（见 App.vue 的 onKeydown）。
 */
function onSearchKeydown(event) {
  if (event.isComposing || event.keyCode === 229) return
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    moveSearchActive(event.key === 'ArrowDown' ? 1 : -1)
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    openSearchResult(searchResults.value[searchActive.value])
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    closeSearch()
    nextTick(() => rootEl.value?.focus({ preventScroll: true }))
  }
}

/**
 * 选中并打开一条结果。`revealId` 先把祖先目录展开 —— 关掉搜索后回到树里，
 * 那一行才是可见的（选区高亮与页签同时到位）。
 * @param {object} [node]
 */
function openSearchResult(node) {
  if (!node) return
  revealId(node.id)
  selectNode(node.id)
  closeSearch()
  openFile(node.id, node).catch(() => {})
}

/** 结果行的目录部分：切掉文件名，去掉末尾分隔符；根目录给 '/' */
function directoryOf(node) {
  const dir = node.path.slice(0, node.path.length - node.name.length)
  return dir.replace(/\/+$/, '') || '/'
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

/**
 * 删除入口：先把待删的那**一批**节点记下来、弹确认框，**点「删除」之后**才动 VFS。
 *
 * 删哪几个交给 `selectionFor`（与导出同一份口径）。
 *
 * 这里不用 window.confirm：原生弹窗的返回值在 webview / 装成应用窗口打开时不由我们
 * 掌控（被浏览器抑制时它自己直接返回一个值），出现过「弹窗上点了取消，文件还是没了」。
 * 自己画的弹窗没有这层不确定性，取消就是取消。
 * @param {string} id
 */
function requestDelete(id) {
  const nodes = selectionFor(id)
  if (nodes.length) pendingDelete.value = nodes
}

/**
 * 这次动作（删除 / 导出）该作用于哪几个节点。
 *
 * 被点的那一行若在选区里、且选区不止一项，就是整个选区（右键多选项、或焦点在多选里按
 * Delete）；否则只有这一行。选了目录又选了它里面的文件时先做一次去重（见 pruneNested）——
 * 删掉目录之后那条子路径已经不存在了；导出同理，留下子项只会把同一份内容打两遍。
 * @param {string} id
 * @returns {object[]}
 */
function selectionFor(id) {
  if (!getNodeById(id)) return []
  const ids =
    workspace.selectedIds.includes(id) && workspace.selectedIds.length > 1
      ? workspace.selectedIds
      : [id]
  return pruneNested(ids)
}

/**
 * 去掉「祖先也在名单里」的项：选了 `a/` 又选了 `a/b.cpp` 时只留 `a/`。
 * 判据本体在 `treeOps.pruneNestedNodes`（导出那边也要用，见那里的注释）；
 * 这里只是把 id 换成节点 —— 调用方手里只有 id。
 * @param {string[]} ids
 * @returns {object[]}
 */
function pruneNested(ids) {
  return pruneNestedNodes(ids.map((id) => getNodeById(id)).filter(Boolean))
}

function cancelDelete() {
  const list = pendingDelete.value
  pendingDelete.value = []
  // 弹窗一出现就把焦点送进了「删除」那颗按钮（见下面那条 watch），弹窗一撤焦点就落到 <body> 上。
  // 交还给主选中那一行（没有就还给名单里的头一个）—— 否则「Esc 取消删除」之后紧接着再按 Delete
  // 是没反应的，得先点回那一行。
  const id = workspace.selectedId ?? list[0]?.id
  if (id) refocusRow(id)
}

/**
 * 把焦点交还给树上的某一行（节点已经不在时静默什么也不做）。
 * 目前只有「取消删除」这一条调用：同样的事在重命名那边由 `FileTreeItem.refocusRow` 负责，
 * 但那是组件内部的事，这里需要按 id 跨层找行。
 * @param {string} id
 */
function refocusRow(id) {
  nextTick(() => rootEl.value?.querySelector(`[data-tree-id="${CSS.escape(id)}"]`)?.focus())
}

/**
 * 真正落盘删除：逐条串行。
 *
 * 串行而不是 Promise.all，是因为每次 delete 都会让 provider 投一次 reset、`rebuildTree` 排队重建
 * 整棵树（见 workspaceStore 的 scheduleRebuild）—— 并发发出去只是把重建排得更挤。
 *
 * 一条失败（磁盘上被别的程序占住、权限不足）**不停下后面的**：这些都是彼此独立的路径，
 * 为一条失败把剩下的都撂下更糟。失败的条数攒起来最后报一句。
 */
async function confirmDelete() {
  const list = pendingDelete.value
  // 先关弹窗再动 VFS：删除过程中（可能要等 VFS 的异步事件）不该再留一个可点的按钮
  pendingDelete.value = []
  let failed = 0
  const token = beginTransferNotice('explorer.transfer.deleting', { n: list.length })
  try {
    for (const node of list) {
      try {
        await deleteNode(node.path)
      } catch {
        failed += 1
      }
    }
  } finally {
    endTransferNotice(token)
  }
  if (failed) showNotice(t('explorer.deleteFailed', { n: failed }))
}

// 弹窗一出现就把焦点放到「删除」上：Enter 确认、Esc 取消都能纯键盘走完
watch(
  () => pendingDelete.value.length,
  (count) => {
    if (count) nextTick(() => confirmBtn.value?.focus())
  },
)

/**
 * 装成 app 时的**系统返回** = 取消删除（2026-10-30）：与 Esc、点遮罩同一个出口。
 * 删除确认是这张卡片唯一「不可撤销」的入口，返回键必须能退掉它 ——
 * 独立 app 里返回键的语义就是「退掉眼前这一件」，不该等于「确认」。
 */
const stopBackDelete = watchBackLayer(() => pendingDelete.value.length > 0, cancelDelete)

// 导出卡片同理：焦点进第一颗按钮，Esc 才落得到卡片上（keydown 是绑在卡片元素上的）
watch(
  () => pendingExport.value.length,
  (count) => {
    if (count) nextTick(() => exportFirstBtn.value?.focus())
  },
)

/**
 * 导出卡片也接上返回键（2026-10-30）：它是二选一（下载 / 写进本机目录），
 * 返回键**不能替用户选**，只能退掉卡片 —— 与点遮罩那个 `cancelExport` 同一个出口。
 */
const stopBackExport = watchBackLayer(() => pendingExport.value.length > 0, cancelExport)

// ------------------------------------------------------------ 导入 / 导出

/**
 * 导入的目标目录：被右键的那个目录，或**主选中那一行**推出来的目录（与页头新建同一份口径，
 * 见 `headerCreateTarget`）。都取不到就是根。
 * @param {object|null} node
 * @returns {string}
 */
function importTargetPath(node) {
  if (node?.type === 'directory') return node.path
  return headerCreateTarget()?.path ?? '/'
}

/**
 * 导入入口（页头两颗按钮与右键那两项都走它）。
 *
 * 第一句就是 `pickFromDisk`：文件选择器只能在用户手势的调用栈里弹（见 `onMenuSelect`
 * 的注释），所以**不能**在它前面插入任何 await。
 *
 * @param {'file'|'folder'} mode
 * @param {object|null} node 右键的那个节点；null = 页头按钮（跟随主选中）
 */
async function runImport(mode, node = null) {
  if (transferBusy.value) return
  const targetPath = importTargetPath(node)
  const files = await pickFromDisk({ directory: mode === 'folder' })
  if (!files.length) return
  await importItems(targetPath, planImport(files))
}

/**
 * 导入结果的**默认播报出口**：资源管理器底部那条行内横幅（页头 / 右键导入走的就是它）。
 *
 * 另一个出口是页面级拖入用的**全局通知**（App.vue 的 `reportDropImport`）—— 两处收到的是
 * **同一种结构化结果**，各自决定怎么说、在哪儿说。横幅这个出口不报「放到了哪儿」：
 * 页头 / 右键导入的目标是用户刚点过的那个目录，屏幕上就看得到，说了是废话。
 *
 * @param {{ kind: 'done'|'empty'|'failed', imported?: number, skipped?: number, message?: string }} result
 */
function announceImportInline({ kind, imported = 0, skipped = 0, message = '' }) {
  if (kind === 'empty') return showNotice(t('explorer.transfer.importEmpty'))
  if (kind === 'failed') return showNotice(message || t('explorer.transfer.importFailed'))
  showNotice(
    skipped
      ? t('explorer.transfer.importSkipped', { n: imported, k: skipped })
      : t('explorer.transfer.importDone', { n: imported }),
  )
}

/**
 * 一批条目落进某个目录 —— **选文件与「从系统拖进来」共用这一条**：导入、报结果、把新文件
 * 摆到眼前（展开目标目录 + 选中第一个 + 滚进视野）。
 *
 * 结果只报给 `announce` 一个出口，本函数不管它怎么呈现 —— 默认是行内横幅，页面级拖入
 * 换成全局通知（见 `announceImportInline` 的说明）。
 *
 * @param {string} targetPath 目标目录的绝对路径
 * @param {import('../services/fileTransfer.js').ImportItem[]} items
 * @param {object} [options]
 * @param {(result: object) => void} [options.announce] 结果播报出口；默认落资源管理器里的横幅
 * @returns {Promise<{ imported: number, skipped: number, failed: number, firstId: string|null }|null>}
 *          导入统计；条目为空或正在搬运时给 null（调用方据此不做后续动作）
 */
async function importItems(targetPath, items, { announce = announceImportInline } = {}) {
  if (!items.length) {
    announce({ kind: 'empty', path: targetPath })
    return null
  }
  if (transferBusy.value) return null
  transferBusy.value = true
  const token = beginTransferNotice('explorer.transfer.importing', { n: items.length })
  try {
    const stats = await importInto(targetPath, items)
    if (stats.imported) {
      announce({ kind: 'done', path: targetPath, imported: stats.imported, skipped: stats.skipped })
    } else {
      announce({ kind: 'empty', path: targetPath })
    }
    await revealImported(targetPath, stats.firstId)
    return stats
  } catch (error) {
    announce({ kind: 'failed', path: targetPath, message: error.message || '' })
    return null
  } finally {
    transferBusy.value = false
    endTransferNotice(token)
  }
}

/**
 * 导入完成后把结果摆到用户眼前：展开目标目录、把选中与焦点落到第一个新文件上、滚进视野。
 *
 * 树的整树重建是**异步**的（provider 发 reset → workspaceStore 那条 rebuild 串行链里跑
 * `getTree()`），所以索引里要过一会儿才有新节点 —— 这里轮询等它出现，最长约 1 秒。
 * 不等的话 `revealId` / `selectNode` 会作用在一个还不存在的 id 上，静默什么也不做。
 * @param {string} targetPath
 * @param {string|null} firstId
 */
async function revealImported(targetPath, firstId) {
  if (targetPath && targetPath !== '/') {
    const dir = findNodeByPath(targetPath)
    if (dir && !workspace.expandedIds.includes(dir.id)) toggleExpand(dir.id)
  }
  if (!firstId) return
  for (let attempt = 0; attempt < 40 && !getNodeById(firstId); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  if (!getNodeById(firstId)) return
  revealId(firstId)
  selectNode(firstId)
  setFocusedId(firstId)
  await nextTick()
  rootEl.value
    ?.querySelector(`[data-tree-id="${CSS.escape(firstId)}"]`)
    ?.scrollIntoView({ block: 'nearest' })
}

/**
 * 在当前这棵树里按路径找一个节点（导入的目标目录要用它拿 id）。
 * @param {string} path
 * @returns {object|null}
 */
function findNodeByPath(path) {
  const walk = (nodes) => {
    for (const node of nodes) {
      if (node.path === path) return node
      const found = node.children ? walk(node.children) : null
      if (found) return found
    }
    return null
  }
  return walk(workspace.tree)
}

/**
 * 导出入口。落点按平台分岔：**只有桌面壳**做得到「写进我选的那个目录」，
 * 所以那边先弹一张二选一的小卡片；其余平台直接下载。
 * @param {string} id
 */
function requestExport(id) {
  const nodes = selectionFor(id)
  if (!nodes.length) return
  if (CAN_EXPORT_TO_DISK) {
    pendingExport.value = nodes
    return
  }
  void runExportDownload(nodes)
}

function cancelExport() {
  pendingExport.value = []
}

/**
 * 下载那条路：恰好一个文件就**直接下那个文件**（不套 zip），否则打成一个 zip。
 *
 * 空内容（选中项里一个文件都没读出来）直接报「没有可导出的文件」，不产出空包 ——
 * 一个 22 字节的空 zip 在用户眼里是「导出成功了但什么也没有」，比报错更难懂。
 * @param {object[]} nodes
 */
async function runExportDownload(nodes) {
  pendingExport.value = []
  transferBusy.value = true
  const token = beginTransferNotice('explorer.transfer.exporting', { n: nodes.length })
  try {
    if (nodes.length === 1 && nodes[0].type === 'file') {
      await exportSingleFile(nodes[0])
      showNotice(t('explorer.transfer.exportAs', { name: nodes[0].name }))
      return
    }
    const { name, files, skipped } = await exportAsZip(nodes)
    if (!files) {
      showNotice(t('explorer.transfer.exportEmpty'))
      return
    }
    let text = t('explorer.transfer.exportAs', { name })
    if (skipped) text += t('explorer.transfer.exportSkipped', { k: skipped })
    showNotice(text)
  } catch (error) {
    showNotice(error.message || t('explorer.transfer.exportFailed'))
  } finally {
    transferBusy.value = false
    endTransferNotice(token)
  }
}

/**
 * 落盘那条路（只有桌面壳）：先弹原生目录选择器，再把每个条目逐个 `export_write` 过去。
 *
 * 四个细节：
 * - **目录条目也要建**：provider 那边的 `create_dir_all` 只在写文件时顺手建父目录，
 *   空目录因此会整个丢掉，所以目录条目单独走一条 `export_mkdir`。
 * - **逐条串行、一条失败不停下后面的**：本机文件夹模式里每写一笔都可能触发文件监听回流，
 *   并发发出去只会把后端的事件挤成一团；而路径太长 / 权限不足这类失败只影响那一条，
 *   为它把剩下的都撂下更糟（与 confirmDelete 同一条口径）。
 * - **写完必收**：`export_close` 放在 finally 里，成功失败都收回这条写盘通道。
 * - **取消选择器 = 整趟没发生**（`dir` 为空直接返回），不报错。
 * @param {object[]} nodes
 */
async function runExportToDisk(nodes) {
  pendingExport.value = []
  transferBusy.value = true
  const token = beginTransferNotice('explorer.transfer.exporting', { n: nodes.length })
  try {
    const { entries, files, skipped } = await collectExport(nodes)
    if (!files) {
      showNotice(t('explorer.transfer.exportEmpty'))
      return
    }
    const dir = await invoke('export_choose')
    if (!dir) return
    let written = 0
    let overwritten = 0
    let failed = 0
    try {
      for (const entry of entries) {
        try {
          if (entry.path.endsWith('/')) {
            await invoke('export_mkdir', { rel: entry.path.slice(0, -1) })
            continue
          }
          const report = await invoke('export_write', {
            rel: entry.path,
            content: new TextDecoder().decode(entry.data),
          })
          written += 1
          if (report?.overwritten) overwritten += 1
        } catch {
          failed += 1
        }
      }
    } finally {
      await invoke('export_close')
    }
    if (!written && failed) {
      showNotice(t('explorer.transfer.exportFailed'))
      return
    }
    let text = overwritten
      ? t('explorer.transfer.exportToDiskOverwrite', { n: written, dir, k: overwritten })
      : t('explorer.transfer.exportToDiskDone', { n: written, dir })
    if (skipped || failed) {
      text += t('explorer.transfer.exportSkipped', { k: skipped + failed })
    }
    showNotice(text)
  } catch (error) {
    showNotice(error.message || t('explorer.transfer.exportFailed'))
  } finally {
    transferBusy.value = false
    endTransferNotice(token)
  }
}

// ------------------------------------------------------------ 多选（可见行区间 / 全选）

/**
 * 树里当前**可见**的行 id，按 DOM 顺序（= 屏幕上从上到下）。
 *
 * 折叠的子树整个不在 DOM 里，所以这个列表天然就是「看得见的那些行」—— **只有 Shift 区间
 * 选择以它为准**（区间本来就是在屏幕上量出来的；⌘/Ctrl+A 那个全选走的是 `folderContentIds`，
 * 按树上的父子关系取、连折叠目录里的也算，不看 DOM，见下）。少一个 offsetParent 过滤也不碍事：
 * 这里没有用 v-show 藏起来的行。
 * @returns {string[]}
 */
function visibleRowIds() {
  const root = rootEl.value
  if (!root) return []
  return [...root.querySelectorAll('[data-tree-id]')].map((row) => row.dataset.treeId)
}

/**
 * ⌘ / Ctrl + A 要选的那一批 id：**焦点节点所在父文件夹里的全部内容**。
 *
 * 2026-10-12 用户定：**选中一个目录就等于把它里面的东西一起选中**（上一版只取同辈那一层，
 * 结果是目录被选上了、目录里的文件没被选上）。所以同辈里的每个目录都要往下递归展开，
 * 深度优先、DOM 顺序 —— 折叠起来的目录照样算数（删除 / 导出确实会作用到它们）。
 *
 * 节点取不到（`rowId` 为 null，= 焦点在树的空白处 = 焦点在根上）、或它本来就挂在顶层时一律给
 * **根的内容**（`workspace.tree`）：顶层节点的 `parentId` 是字面量 `'root'`，而索引里那份根
 * （`stat('/')` 的浅拷贝）**不带 children** —— 2026-10-12 探针踩过，顺着 `parentId` 取会拿到
 * 空数组、⌘A 静默什么都不选。
 *
 * 与 Shift 区间（`visibleRowIds`）刻意不同：那条按**可见行**量，这条按**树上的父子关系**取。
 * @param {string|null} rowId
 * @returns {string[]}
 */
function folderContentIds(rowId) {
  const node = rowId ? getNodeById(rowId) : null
  // 顶层节点的 `parentId` 是字面量 `'root'`，而根在索引里的那一份是 `stat('/')` 的浅拷贝、
  // **不带 children**。所以父目录只在「指向一个真目录节点」时才用索引，其余（顶层节点、根、
  // 取不到节点）一律读 `workspace.tree`（它就是根的孩子）。
  const parentId = node?.parentId
  const parent = parentId && parentId !== 'root' ? getNodeById(parentId) : null
  const ids = []
  const collect = (nodes) => {
    for (const item of nodes) {
      ids.push(item.id)
      // 目录连带它里面的东西 —— 这一条就是「选中文件夹 = 里面都选中」的落点
      if (item.children?.length) collect(item.children)
    }
  }
  collect(parent?.children ?? workspace.tree)
  return ids
}

/**
 * Shift + 单击 / Shift + 方向键：从**锚点**（`workspace.selectedId`）到 `id` 整段选中。
 *
 * 锚点刻意不跟着终点走（`selectMany` 的第二个实参原样传锚点）：连着 Shift 点几处不同位置，
 * 每次都是从同一个起点重划范围 —— 这正是 VS Code 的行为（它那边 anchor 也是不动的）。
 * 锚点已经不在可见列表里（刚被折叠进去、或已被删）就退化成单选这一行。
 * @param {string} id
 */
function selectRangeTo(id) {
  const order = visibleRowIds()
  const anchor = workspace.selectedId
  const from = anchor ? order.indexOf(anchor) : -1
  const to = order.indexOf(id)
  if (from === -1 || to === -1) {
    selectNode(id)
    return
  }
  selectMany(order.slice(Math.min(from, to), Math.max(from, to) + 1), anchor)
}

/**
 * ⌘ / Ctrl + A：全选**焦点节点所在父文件夹里的全部内容**（`folderContentIds`）。
 * 2026-10-12 用户拍板两次：口径先由「工作区里全部节点（含折叠目录里的）」收窄成「当前这一层」，
 * 随后补上「**选中目录 = 连它里面的文件一起选中**」（`folderContentIds` 递归展开同辈目录）。
 *
 * 为什么不留「全选整棵工作区」：按一下 ⌘A 就把别的题目目录里的文件也一并选中，紧接着一个
 * Delete 会连着它们一起删 —— 收窄到「我所在的这个文件夹」既对得上直觉，也保住了这条防线。
 *
 * 焦点落在树的空白处 = 焦点在根目录上（点空白本来就是这个含义，见 `onTreeClick`），
 * 于是全选根的内容（含各层子目录里的），也就是整棵树。整棵树空着时什么也不做。
 *
 * 主选中保住原来那个（还在这一层里的话），否则取第一个 —— 页头新建仍落在用户原来的位置附近。
 * @param {string|null} rowId 焦点所在的行 id；null = 焦点在树的空白处（或没有焦点）
 */
function selectAllNodes(rowId) {
  const ids = folderContentIds(rowId ?? keyboardRowId())
  if (!ids.length) return
  const anchor =
    workspace.selectedId && ids.includes(workspace.selectedId) ? workspace.selectedId : ids[0]
  selectMany(ids, anchor)
}

// ------------------------------------------------------------ 题目信息弹窗

/** 当前 OJ 对应的难度口径：rating / luogu / free / null（未选 OJ） */
const metaSystem = computed(() => difficultySystemFor(metaForm.value.oj))
/** 难度下拉选项；自由文本 / 未选 OJ 时为 null（模板据此换成文本框） */
const metaDifficultyOptions = computed(() => difficultyOptionsFor(metaForm.value.oj))

/** 打开弹窗：有元数据就回填，日期留空则预填今天。timeLimit 以秒回填（ms → s 字符串） */
function beginEditMeta(node) {
  const saved = node.meta ?? {}
  metaForm.value = {
    url: saved.url ?? '',
    oj: saved.oj ?? '',
    difficulty: saved.difficulty ?? '',
    date: saved.date || todayISO(),
    timeLimit: saved.timeLimit ? String(saved.timeLimit / 1000) : '',
    // 空 = 跟随全局设置（cp.checker）；选了就是这一道题的固定口径，优先级高于全局
    checker: saved.checker ?? '',
  }
  metaError.value = ''
  metaTarget.value = node
}

function cancelMeta() {
  metaTarget.value = null
  metaError.value = ''
}

/** 换 OJ 就必须清掉难度：两套口径的 id 互不相通，留着会存进一个对不上的值 */
function onOjChange() {
  metaForm.value.difficulty = ''
}

async function confirmMeta() {
  const node = metaTarget.value
  if (!node) return
  try {
    // normalizeMeta 全空时给 null，setMeta 会把节点上的 meta 整个摘掉
    // timeLimit：表单里是秒字符串，这里换算回 ms；留空 = 0（= 清除）
    const form = {
      ...metaForm.value,
      timeLimit: metaForm.value.timeLimit ? Math.round(Number(metaForm.value.timeLimit) * 1000) : 0,
    }
    await updateFileMeta(node.path, normalizeMeta(form))
    metaTarget.value = null
  } catch (error) {
    metaError.value = error.message || t('explorer.saveFailed')
  }
}

// 弹窗一出现就把焦点放到第一个字段上
watch(metaTarget, (node) => {
  if (node) nextTick(() => metaFirstField.value?.focus())
})

/**
 * 树空白处右键：弹一份「往当前目录里加东西 + 全局搜索」的菜单
 * （新建文件 / 新建文件夹 ── 导入文件 / 导入文件夹 ── 查找文件），与落在目录行上的那份
 * 是同一组条目、同一批 i18n key、同一个分组口径（用户 2026-11-17 重排）：
 * 空白处没有具体实体，讲不了「重命名 / 导出 / 删除」，于是只剩「生成」与「全局搜索」两段，
 * 菜单因此极简 —— 别把行上那份的管理项顺手带过来。
 *
 * 空白处没有节点，所以目标目录与页头那四颗按钮同源 —— `headerCreateTarget()`：主选中那一行
 * 推出来的目录（选中的是目录就是它自己，选中的是文件就取其父目录），什么都没选中
 * （= 点过空白处）或索引未就绪时回落根目录。整棵树此时不高亮，也就是根。
 * 这里**不动选区**：右键不会触发 click，用户攒下的选区原样留着。
 *
 * 行上的右键由 FileTreeItem 自己 preventDefault + stop，走不到这里；剩下的判定是给内联
 * 新建输入框留的原生菜单（汉字输入法的候选框就挂在它上面），那份不能抢。
 */
function onTreeContextMenu(event) {
  if (event.target.closest('.tree-item, .create-row')) return
  event.preventDefault()
  // 与目录行上那份同一套分组（新建 → 导入 → 查找），只是砍掉了「对节点本身的管理」那一段 ——
  // 空白处没有选中实体，重命名 / 导出 / 删除在这里无从谈起。
  const items = [
    { id: 'new-file', label: t('explorer.menu.newFile'), shortcut: shortcutOf('new-file') },
    { id: 'new-folder', label: t('explorer.menu.newFolder') },
    { divider: true },
    { id: 'import-file', label: t('explorer.menu.importFile') },
  ]
  // 判据与目录行上那一项共用：Android / iOS 的 file input 拿不到目录结构，见 fileTransfer.canPickFolder
  if (canPickFolder()) items.push({ id: 'import-folder', label: t('explorer.menu.importFolder') })
  items.push(
    { divider: true },
    { id: 'find-file', label: t('explorer.menu.findFile'), shortcut: shortcutOf('find-file') },
  )
  menu.value = { x: event.clientX, y: event.clientY, node: headerCreateTarget(), items }
}

// ------------------------------------------------------------ 拖拽移动

/**
 * 一次拖拽的落盘。
 *
 * 移动本身只是 `vfs.rename`，**节点 id 不变**，所以已打开的页签、Monaco model 与 undo 栈
 * 都不受影响。这里额外做两件事：把目标目录展开（拖进折叠目录是常见路径，展开了才看得到
 * 刚落进去的东西），以及把被移动的那一行滚进视野 —— 拖到远处的目录后，用户得立刻看到结果。
 *
 * @param {object} node 被拖的节点
 * @param {{ rowId: string, path: string }} target 落点（rowId 为 'root' 表示根目录）
 */
async function onDropNode(node, target) {
  try {
    await moveNode(node.path, target.path)
    if (target.rowId !== 'root' && !workspace.expandedIds.includes(target.rowId)) {
      toggleExpand(target.rowId)
    }
    setFocusedId(node.id)
    // 树已经由 reset 事件重建过一轮，等本轮渲染落地再找那一行
    await nextTick()
    rootEl.value
      ?.querySelector(`[data-tree-id="${CSS.escape(node.id)}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  } catch (error) {
    showNotice(error.message || t('explorer.moveFailed'))
  }
}

const {
  draggingNode,
  draggingId,
  ghostPos,
  dropTargetRowId,
  isRootDrop,
  suppressContextMenu,
  pressingId,
  armedId,
  onRowPointerDown,
  consumeClickSuppression,
} = useTreeDrag({
  treeEl: rootEl,
  onDrop: onDropNode,
  openContextMenu,
  closeContextMenu,
  // 窄屏：拖出树 = 要去编辑区。侧栏这时是盖在编辑区上的抽屉，不收起来就永远投不进去
  // （文件打不开、边缘切分屏也不亮）。收起由 App 做 —— panelVisible 只有那一份。
  onDragOut: () => emit('drag-out'),
})

// 覆盖式滚动条：原生那条会占掉 11px 内容宽度、出现/消失时行跟着跳，换成浮在行之上的滑块
// （2026-10-13；原生那条由下面 .explorer__tree 的 scrollbar-width / ::-webkit-scrollbar 藏掉）
useOverlayScrollbar(rootEl)

/** 幽灵元素上的图标：只分文件 / 目录，够用来认出手里拖的是谁 */
const ghostIcon = computed(() => (draggingNode.value?.type === 'directory' ? 'folder' : 'file'))

// 落点高亮只有一个信号源，两套拖拽在这里合流。
//
// 站内拖拽（useTreeDrag）与「从系统里拖文件进来」（composables/usePageDrop.js）是两套手势，
// 但落点语义完全一样：压在目录行上就是那个目录、压在文件行上就是它所在的目录、别处是根。
// 树项只认 `dropTargetRowId` 一个信号（见 FileTreeItem 的 isDropTarget），所以合并在这一处，
// 树里那些行一个字都不用改（provide 见下）。
//
// 指针不在资源管理器里时不亮：那时文件照样落到根目录（整页都是落点，见 usePageDrop），
// 但让整棵树亮成一片会让人以为文件要进树里 —— 判据因此多要一个 `inExplorer`。
const mergedDropRowId = computed(() => dropTargetRowId.value ?? pageDropTarget.value?.rowId ?? null)
const mergedRootDrop = computed(
  () =>
    isRootDrop.value || (pageDropTarget.value?.inExplorer === true && !pageDropTarget.value.rowId),
)

/** 拖拽 / 粘贴失败的临时提示（这两件事都没有行内位置可放，见方案 D5）；空串 = 不显示 */
const notice = ref('')
let noticeTimer = 0

function showNotice(text) {
  notice.value = text
  window.clearTimeout(noticeTimer)
  noticeTimer = window.setTimeout(() => {
    notice.value = ''
  }, 4000)
}

/** 点横幅关掉结果提示；进行中的那条点不掉（操作还没结束，点掉只会让人以为它停了） */
function dismissNotice() {
  if (!transferPhase.value) notice.value = ''
}

// 工作区启动期的一次性提示（如侧车 JSON 损坏）：provider 只投递 i18n key，这里翻成文案弹横幅。
// 订阅放在这里（组件 setup）而不是 onMounted —— FileExplorer 比 App.vue 的 onMounted 先初始化，
// 于是 provider 在 init() 里投递时订阅已就位。
onUnmounted(onStartupNotice((key) => showNotice(t(key))))
onUnmounted(() => window.clearTimeout(transferPhaseTimer))
onUnmounted(() => stopBackDelete())
onUnmounted(() => stopBackExport())

// ------------------------------------------------------------ 焦点（roving tabindex）

function isTabbable(id) {
  if (focusedId.value) return focusedId.value === id
  if (workspace.activeId) return workspace.activeId === id
  return workspace.tree[0]?.id === id
}

function setFocusedId(id) {
  focusedId.value = id
}

/**
 * 「焦点在树的空白处」时，重命名 / Delete 该作用于哪一行：**主选中**（`workspace.selectedId`）。
 * 没有主选中就给 null —— 动作那边自己静默（`beginRename` 没人接、`requestDelete` 自带空值保护）。
 *
 * 两条都是刻意的：
 * - 口径取主选中，而不是 roving tabindex 的焦点记账（`focusedId`）：那是「键盘最后走到哪一行」，
 *   点过空白处之后它仍是**没有高亮**的那一行 —— 拿它当兜底会删掉 / 改名一个「看不见被选中」
 *   的东西（2026-10-12 探针实测：空白处按 F2 去改名了早已取消选中的 src）。主选中与页头新建 /
 *   导出 / 删除是同一份「当前对象」口径（见 `cancelDelete`、`headerCreateTarget`），跟着它走才一致。
 * - 点空白处是「我什么都不选」（`onTreeClick` 清空选区），连着按重命名 / Delete 就该没反应。
 *
 * 空值分支只有 App.vue 那条全局快捷键走得到：鼠标路径永远带着一行的 id（右键菜单、点击都在行上）。
 */
function keyboardRowId() {
  return workspace.selectedId ?? null
}

/**
 * 焦点进树：只更新 roving tabindex 的记账，**不动选区**。
 *
 * 2026-10-12 撤掉了这里原来那句 `selectNode(...)`：多选之后「焦点一动就把选区收成单选」
 * 会把刚攒好的那一片冲掉 —— ⌥/Alt + 单击 的 pointerdown 先聚焦、click 才切换选中，
 * 于是加选永远变成「先清空再加一个」。选区的写入改由明确的入口负责：鼠标点击在
 * FileTreeItem.onClick 里（单击收成单选、Alt 加选、Shift 划范围），键盘在 focusRowAt 里。
 */
function onTreeFocus(event) {
  const row = event.target.closest('[data-tree-id]')
  if (!row) return
  setFocusedId(row.dataset.treeId)
}

/**
 * 点树里的空白处 = 选中根目录（整棵树都不高亮，页头新建落在根）。
 *
 * 只有真正落在节点子树之外的点击才算「空白」：行、行下面的子节点区、内联新建输入框都在
 * `.tree-item` 里（`data-tree-id` 只挂在行上，所以判据用 `.tree-item` 而不是行本身）。
 * 拖拽收尾那一次 click 也要吃掉——把文件拖到空白处 = 拖进根，不该顺手把选中也清掉。
 */
function onTreeClick(event) {
  if (consumeClickSuppression()) return
  if (event.target.closest('.tree-item')) return
  selectNode(null)
}

/**
 * 点树的空白处：把焦点收进**这棵树自己**（容器上有 `tabindex="-1"`）。
 *
 * 为什么非接住不可：作用域受限的三条快捷键（⌘/Ctrl+A 全选、重命名、Delete 删除）按
 * 「焦点在不在资源管理器里」分流（见 App.vue 的 treeScopeFrom）。不接的话焦点掉到 `<body>`，
 * 那三条就整条失灵 —— 用户 2026-10-12 报的「资源管理器区域不支持 ⌘A 之类的快捷键」正是这个。
 *
 * 两处要排掉：
 * - **行**（`.tree-item` 子树）：行自己有 tabindex，浏览器本来就会把焦点给它，这里再插一手
 *   只会把「行获得焦点」这件事搅乱（拖拽起手也在 pointerdown 上，别去动它）。
 * - **内联新建行**（`.create-row`）：它虽然是容器的直接子节点（不在 `.tree-item` 里），
 *   但抢走它的焦点等于让那个刚冒出来的输入框立刻失焦提交。
 */
function onTreePointerDown(event) {
  if (event.target.closest('.tree-item, .create-row')) return
  rootEl.value?.focus({ preventScroll: true })
}

// ------------------------------------------------------------ 活动区域（选中高光的深浅）

/**
 * 资源管理器此刻是不是「活动区域」—— 决定选中那一行用重高光还是退一档的浅高光
 * （2026-11-18 加，用户要求对齐 VS Code：点过 / 右键过的那一行高光重，指针去了编辑区就变浅）。
 *
 * 判据刻意**不是**「焦点在不在树里」，这一点必须记清楚：点一行文件会把它打开，
 * EditorPane 换完 model 立刻 `instance.focus()` 把焦点交给 Monaco（那是「点开就能直接打字」
 * 的既定行为，见那边的注释），于是「焦点判据」会让刚点的那一行**立刻**变浅 —— 与要的正好相反。
 * 所以这里按**用户最后一次把指针按在哪儿**记账（捕获阶段监听，先于任何组件自己的处理器）：
 *
 * - 按在侧栏里 → 活动。整栏都算：树、页头那几颗新建钮（它们是从本面板 Teleport 上去的）、
 *   内联新建框、查找框。按行判的话，点页头那颗按钮会先浅一帧、再被内联新建框的聚焦点亮回来。
 * - 按在别处（编辑区、页签栏、活动栏、分隔条……）→ 不活动。
 * - 焦点自己落进侧栏（键盘 Tab / 方向键、程序化 focus）→ 也算活动，但**不反向**：
 *   焦点离开侧栏不判「不活动」，那条只归指针管。原因同上（Monaco 抢焦点），
 *   顺带也换来一条稳定的语义 —— 高亮不会因为程序的某次 focus() 自己闪。
 * - 点自家右键菜单（Teleport 到 body）不算离开：菜单项常常顺手把焦点送回树里（重命名），
 *   中间夹一帧浅色就是一次闪烁。两侧确认卡片没这层顾虑 —— 点上去按「离开」算，
 *   而「取消删除」会把焦点还回那一行，于是它自己又亮回来（见 cancelDelete）。
 * - 菜单那张铺满视口的遮罩（`.menu-scrim`，右键 / 设置 / 组件三个菜单共用同一张，见
 *   MenuScrim.vue）**按底下的东西判**，不按它自己判 —— 否则「菜单开着点树的空白处」
 *   会被读成「点到了资源管理器外面」，高光退浅一档
 */
const treeActive = ref(false)

/** 这次的按下点在不在侧栏里。用类名判，不用 DOM 包含关系：页头动作区在另一棵子树里。 */
function inSidebar(target) {
  return !!target?.closest?.('.sidebar')
}

/**
 * 菜单遮罩挡着时，指针命中的永远是那张透明层（`.menu-scrim`，铺满视口、在菜单
 * 下面），可用户认定的落点是**它底下那一格**。于是用坐标反查：取命中栈里第一个不属于菜单的
 * 元素，就当作真正的落点。遮罩本身没有坐标信息可给，只能这么问。
 * 右键 / 设置 / 组件三个菜单共用这张遮罩（MenuScrim.vue），类名只有一个 `.menu-scrim` ——
 * 改类名必须与那边成对改。
 */
function underScrim(event) {
  const stack = document.elementsFromPoint(event.clientX, event.clientY)
  return stack.find((el) => !el.closest?.('.context-menu, .menu-scrim')) ?? null
}

/**
 * 这一格算不算「树的空白处」—— 与 onTreePointerDown / onTreeClick 同一套判据
 * （节点子树 `.tree-item` 之外、且不在内联新建行上）。
 */
function isTreeBlank(target) {
  if (!target?.closest?.('.explorer__tree')) return false
  return !target.closest('.tree-item, .create-row')
}

function onDocPointerDown(event) {
  // 遮罩把这一发吞了（底下什么都收不到），所以「点的是哪儿」只能自己按坐标反查
  const onScrim = !!event.target?.closest?.('.menu-scrim')
  const target = onScrim ? underScrim(event) : event.target
  // 自家右键菜单是 body 下的浮层，点它不等于离开资源管理器
  if (target?.closest?.('.context-menu')) return
  if (inSidebar(target)) {
    treeActive.value = true
    /**
     * 菜单开着时点树的空白处：遮罩吃掉了这一发，`onTreePointerDown` / `onTreeClick` 一个都收
     * 不到 —— 菜单关掉了、选区却还在，而且高光被上面判断成「已离开」退成了浅的一档
     * （2026-11-18 用户报「点空白高光应该直接消失，而不是变浅」就是这个）。空白处没有别的语义，
     * 所以这里替它们把那一脚补上：焦点回到根（容器上 `tabindex="-1"`），选区清空。
     * 落在**行**上则不补 —— 关菜单的那一下只关菜单，不去改选中（与遮罩的既定口径一致）。
     */
    if (onScrim && isTreeBlank(target)) {
      selectNode(null)
      /**
       * 焦点**不能当场给**：这一发的落点是遮罩，`mousedown` 的默认动作会在事件派发结束后
       * 把焦点拨给 `body`（实测时间线：`focusin: explorer__tree` 紧跟着 `focusout: explorer__tree
       * → body`，同步调 `focus()` 会被它当场抹掉）。等这一发走完再给。
       */
      requestAnimationFrame(() => rootEl.value?.focus({ preventScroll: true }))
    }
    return
  }
  treeActive.value = false
}

/** 焦点进侧栏（行、树的空白处、内联新建框都算）：只往「活动」这一侧写，见上面的口径 */
function onDocFocusIn(event) {
  if (inSidebar(event.target)) treeActive.value = true
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerDown, true)
  document.addEventListener('focusin', onDocFocusIn, true)
})
onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocPointerDown, true)
  document.removeEventListener('focusin', onDocFocusIn, true)
})

provide('openContextMenu', openContextMenu)
// 「打开题目」的出口：菜单里那一项与树项上的 ⌘ / Ctrl + 单击都归它，判据只有 problemUrl 一份
provide('openProblem', openProblem)
// Shift + 单击 / Shift + 方向键的范围选择。可见行的 DOM 顺序只有本组件拿得到，
// 所以算法在这里、树项只负责把手势转过来（见 selectRangeTo）。
provide('selectRangeTo', selectRangeTo)
// 删除确认不再经 provide 下发：唯一的调用方是全局快捷键 Delete（原来在 FileTreeItem 的
// 行内 keydown 里），2026-10-10 改走 defineExpose 那条路，见文件末尾。
provide('treeRootEl', rootEl)
// 树项需要报一句「这个文件打不开」（本机文件夹里的二进制 / 超大文件），用的就是上面那条横幅
provide('showNotice', showNotice)
provide('renameTarget', renameTarget)
provide('isTabbable', isTabbable)
provide('setFocusedId', setFocusedId)
provide('creating', creating)
provide('creatingRow', creatingRow)
provide('commitCreate', commitCreate)
provide('cancelCreate', cancelCreate)
provide('onCreateBlur', onCreateBlur)
// 拖拽（useTreeDrag）：行上起手、落点高亮、点击抑制、右键菜单让位
provide('onRowPointerDown', onRowPointerDown)
provide('consumeClickSuppression', consumeClickSuppression)
provide('suppressContextMenu', suppressContextMenu)
// 落点高亮（站内拖拽与系统拖入合流后的那一份，见上面的 mergedDropRowId）
provide('dropTargetRowId', mergedDropRowId)
provide('draggingId', draggingId)
// 触屏长按的两段提示：按压进度（还在等）与就绪态（已经到点 —— 菜单已弹出，此后移动即拖动）
provide('pressingId', pressingId)
provide('armedId', armedId)
// 选中高光的深浅档（`--active` / `--active-idle` 二选一）：资源管理器是不是当前活动区域，
// 见上面「活动区域」那一节
provide('treeActive', treeActive)

/**
 * 全局快捷键（重命名 / Delete 删除 / ⌘·Ctrl+A 全选）的入口。
 *
 * 这三条动作的键位登记在 `useShortcutManager` 的 SHORTCUT_ACTIONS 里，但**执行不了在那里**：
 * 它们要做的事全在本组件手上（起内联重命名、弹删除确认框、按父文件夹收全选），而且都作用于
 * 「资源管理器里当前有焦点的那些行」。所以 App.vue 的全局监听先过一道作用域闸门，再从这里进来
 * —— 动作与右键菜单那两条**完全同源**（`beginRename` / `requestDelete`），不另写一份。
 *
 * 三条都收**行 id**，可空：焦点落在树的空白处时 App.vue 给 null（那一刻没有「哪一行」）。
 * 前两条退回 `keyboardRowId()` 现算一个（见那里的注释）；全选把「空白处」读成「焦点在根上」，
 * 于是选根的内容（见 `folderContentIds`）。传进来的 id 已经不在了就静默什么也不做
 * （`requestDelete` 自带 `getNodeById` 的空值保护）。
 */
defineExpose({
  /** @param {string|null} id 要重命名的节点 id */
  startRename: (id) => beginRename(id ?? keyboardRowId()),
  /** @param {string|null} id 要删除的节点 id（它在选区里就删整个选区） */
  requestDelete: (id) => requestDelete(id ?? keyboardRowId()),
  /** @param {string|null} id ⌘ / Ctrl + A：全选这个节点所在父文件夹里的内容 */
  selectAllNodes: (id) => selectAllNodes(id ?? null),
  /**
   * 就地起一行内联新建。两个入口走这里：空编辑区那块板的「新建文件」行 / 全局 ⌥⌘N，
   * 以及（菜单开着时）右键菜单里那条「新建文件」的右列键位。
   *
   * 落点：右键菜单开着就落到**菜单指的那个目录**（见 shortcutCreateTarget），
   * 否则与页头那颗「新建文件」同源 —— 跟随主选中那一行（目录就是它自己、文件取其父目录），
   * 什么都没选中就落在根目录。菜单里报的键位与按下它建到哪儿，必须是同一处。
   * @param {'file'|'directory'} [type]
   */
  startCreate: (type = 'file') => startCreate(type, shortcutCreateTarget()),
  /** 打开「查找文件」搜索栏（快捷键 / 右键菜单同源） */
  openSearch,
  /**
   * 从系统里拖进来的文件落进某个目录（App.vue 的 usePageDrop 调它）。
   * 与选文件那条同源（`importItems`），返回导入统计 —— 调用方据此决定要不要顺手打开它。
   * `options.announce` 由 App.vue 换成全局通知（见 `announceImportInline` 的说明）。
   * @param {string} targetPath
   * @param {import('../services/fileTransfer.js').ImportItem[]} items
   * @param {object} [options]
   */
  importDroppedItems: (targetPath, items, options) => importItems(targetPath, items, options),
})
</script>

<template>
  <section class="explorer">
    <!-- 页头动作区：投进 Sidebar 共享页头的 #sidebar-context。不激活时 disabled、
         内容原地渲染（面板本身被 v-show 藏着，不可见）；defer 是因为目标元素与源同在
         一棵挂载树里，首挂时目标尚未进 document，等整个应用挂完再解析（否则内容
         永远挂不上、下一次 patch 直接崩 emitsOptions）。
         按钮的目标目录照旧跟随选中的那一行（见 headerCreateTarget） -->
    <Teleport defer :disabled="!isActivePanel" to="#sidebar-context">
      <span class="explorer__actions">
        <button
          type="button"
          class="explorer__btn"
          :title="t('explorer.menu.newFile')"
          @click="startCreate('file', headerCreateTarget())"
        >
          <AppIcon name="file-plus" :size="17" class="explorer__btn__icon explorer__btn__icon--file" />
        </button>
        <button
          type="button"
          class="explorer__btn"
          :title="t('explorer.menu.newFolder')"
          @click="startCreate('directory', headerCreateTarget())"
        >
          <AppIcon name="folder-plus" :size="17" class="explorer__btn__icon explorer__btn__icon--folder" />
        </button>
      </span>
    </Teleport>

    <!-- 搬运结果与进行中状态共用这一行：进行中排在前面（转圈 + 正在做什么），
         结束后立刻换成结果 / 失败提示。延迟露面的判据见 transferPhase 的注释。 -->
    <p
      v-if="transferNotice || notice"
      class="explorer__notice"
      :class="{ 'explorer__notice--busy': !!transferNotice }"
      role="status"
      @click="dismissNotice"
    >
      <LoadingSpinner v-if="transferNotice" :size="11" />
      <span>{{ transferNotice || notice }}</span>
    </p>

    <!-- 查找文件：树顶部搜索栏；展开时结果列表替代文件树（两条入口见 openSearch / buildMenuItems） -->
    <div v-if="searchOpen" class="explorer__search">
      <input
        ref="searchInput"
        v-model="searchQuery"
        class="explorer__search-input"
        type="text"
        :placeholder="t('explorer.search.placeholder')"
        data-keep-focus-on-pan
        @keydown="onSearchKeydown"
      />
      <button
        type="button"
        class="explorer__search-close"
        :title="t('app.cancel')"
        @click="closeSearch"
      >
        <AppIcon name="close" :size="14" />
      </button>
    </div>

    <div v-if="searchOpen" class="explorer__results" role="listbox">
      <button
        v-for="(node, index) in searchResults"
        :key="node.id"
        type="button"
        class="explorer__result"
        :class="{ 'explorer__result--active': index === searchActive }"
        role="option"
        :aria-selected="index === searchActive"
        :title="node.meta?.url || node.path"
        @click="openSearchResult(node)"
        @pointermove="searchActive = index"
      >
        <AppIcon
          class="explorer__result-icon"
          :class="`is-${fileIconName(node.name)}`"
          :name="fileIconName(node.name)"
          :size="15"
        />
        <span class="explorer__result-text">
          <span class="explorer__result-name">{{ node.name }}</span>
          <span class="explorer__result-path">{{ directoryOf(node) }}</span>
        </span>
      </button>
      <p v-if="!searchResults.length" class="explorer__empty">
        {{ t('explorer.search.noResults') }}
      </p>
    </div>

    <div
      v-show="!searchOpen"
      ref="rootEl"
      class="explorer__tree"
      :class="{ 'is-drop-root': mergedRootDrop }"
      role="tree"
      tabindex="-1"
      @contextmenu="onTreeContextMenu"
      @pointerdown="onTreePointerDown"
      @click="onTreeClick"
      @focusin="onTreeFocus"
    >
      <!-- 建在根目录的输入行；建在某个目录里的那份由 FileTreeItem 渲染（同一个组件） -->
      <InlineCreateRow v-if="creating && creating.targetId === 'root'" :state="creating" :depth="0" />

      <FileTreeItem
        v-for="node in workspace.tree"
        :key="node.id"
        :node="node"
        :depth="0"
        @rename-done="onRenameDone"
      />

      <p v-if="!workspace.tree.length && !creating" class="explorer__empty">
        {{ t('explorer.emptyTree') }}
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

    <!-- 删除确认：自己实现的弹窗（不用 window.confirm，见 requestDelete 的注释）。
         点遮罩 / Esc = 取消，只有点「删除」才会真的动文件。
         多选删除时标题报个数、正文把路径列出来（超过 DELETE_LIST_MAX 条折成一句「另有 N 项」）。 -->
    <Teleport to="body">
      <div v-if="pendingDelete.length" class="confirm" @pointerdown.self="cancelDelete">
        <div
          class="confirm__card"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          aria-describedby="confirm-desc"
          @keydown.esc.stop.prevent="cancelDelete"
        >
          <p id="confirm-title" class="confirm__title">
            {{
              pendingDelete.length > 1
                ? t('explorer.deleteConfirm.titleMany', { n: pendingDelete.length })
                : t('explorer.deleteConfirm.title')
            }}
          </p>
          <div id="confirm-desc" class="confirm__desc">
            <ul class="confirm__list">
              <li v-for="node in pendingDelete.slice(0, DELETE_LIST_MAX)" :key="node.id">
                {{ node.path }}
              </li>
            </ul>
            <p v-if="pendingDelete.length > DELETE_LIST_MAX" class="confirm__more">
              {{ t('explorer.deleteConfirm.more', { n: pendingDelete.length - DELETE_LIST_MAX }) }}
            </p>
            <p v-if="hasDirectory" class="confirm__more">
              {{ t('explorer.deleteConfirm.directoryNote') }}
            </p>
          </div>
          <div class="confirm__actions">
            <button type="button" class="confirm__btn" @click="cancelDelete">
              {{ t('app.cancel') }}
            </button>
            <button
              ref="confirmBtn"
              type="button"
              class="confirm__btn confirm__btn--danger"
              @click="confirmDelete"
            >
              {{ t('explorer.menu.delete') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 导出落点：**只有桌面壳**弹这张卡片 —— 别的平台只有一个落点（下载），点菜单就直接走了。
         两个按钮各自带一句 title 说明代价（写盘会覆盖同名文件 / zip 是个压缩包）。
         与删除确认同款自绘卡片（理由见 requestDelete 的注释），复用 .confirm 那套样式。 -->
    <Teleport to="body">
      <div v-if="pendingExport.length" class="confirm" @pointerdown.self="cancelExport">
        <div
          class="confirm__card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="export-title"
          @keydown.esc.stop.prevent="cancelExport"
        >
          <p id="export-title" class="confirm__title">{{ t('explorer.transfer.exportTitle') }}</p>
          <div class="confirm__desc">
            <ul class="confirm__list">
              <li v-for="node in pendingExport.slice(0, DELETE_LIST_MAX)" :key="node.id">
                {{ node.path }}
              </li>
            </ul>
            <p v-if="pendingExport.length > DELETE_LIST_MAX" class="confirm__more">
              {{ t('explorer.deleteConfirm.more', { n: pendingExport.length - DELETE_LIST_MAX }) }}
            </p>
          </div>
          <div class="confirm__actions confirm__actions--stack">
            <button
              ref="exportFirstBtn"
              type="button"
              class="confirm__btn confirm__btn--primary"
              :title="t('explorer.transfer.exportToDiskHint')"
              @click="runExportToDisk(pendingExport)"
            >
              {{ t('explorer.transfer.exportToDisk') }}
            </button>
            <button
              type="button"
              class="confirm__btn"
              :title="t('explorer.transfer.exportZipHint')"
              @click="runExportDownload(pendingExport)"
            >
              {{ t('explorer.transfer.exportZip') }}
            </button>
            <button type="button" class="confirm__btn" @click="cancelExport">
              {{ t('app.cancel') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 题目信息：与删除确认同款自绘弹窗。难度控件跟着 OJ 走（见 problemMeta.js）。 -->
    <Teleport to="body">
      <div v-if="metaTarget" class="meta" @pointerdown.self="cancelMeta">
        <div
          class="meta__card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="meta-title"
          @keydown.esc.stop.prevent="cancelMeta"
        >
          <p id="meta-title" class="meta__title">{{ t('explorer.meta.title') }}</p>
          <p class="meta__file">{{ metaTarget.path }}</p>

          <label class="meta__field">
            <span class="meta__label">{{ t('explorer.meta.url') }}</span>
            <input v-model="metaForm.url" class="meta__input" type="url" placeholder="https://…" />
          </label>

          <label class="meta__field">
            <span class="meta__label">OJ</span>
            <select ref="metaFirstField" v-model="metaForm.oj" class="meta__input" @change="onOjChange">
              <option value="">{{ t('explorer.meta.ojUnset') }}</option>
              <option v-for="item in OJ_LIST" :key="item.id" :value="item.id">
                {{ labelOf(item) }}
              </option>
            </select>
          </label>

          <label class="meta__field">
            <span class="meta__label">{{ t('explorer.meta.difficulty') }}</span>
            <select v-if="metaDifficultyOptions" v-model="metaForm.difficulty" class="meta__input">
              <option value="">{{ t('explorer.meta.difficultyUnset') }}</option>
              <option v-for="item in metaDifficultyOptions" :key="item.id" :value="item.id">
                {{ labelOf(item) }}
              </option>
            </select>
            <input
              v-else-if="metaSystem === 'free'"
              v-model="metaForm.difficulty"
              class="meta__input"
              type="text"
              :placeholder="t('explorer.meta.difficultyCustom')"
            />
            <input
              v-else
              class="meta__input"
              type="text"
              disabled
              :placeholder="t('explorer.meta.difficultyPickOj')"
            />
          </label>

          <label class="meta__field">
            <span class="meta__label">{{ t('explorer.meta.date') }}</span>
            <input v-model="metaForm.date" class="meta__input" type="date" />
          </label>

          <label class="meta__field">
            <span class="meta__label">{{ t('explorer.meta.timeLimit') }}</span>
            <input
              v-model="metaForm.timeLimit"
              class="meta__input"
              type="number"
              min="0.1"
              step="0.5"
              :placeholder="t('explorer.meta.timeLimitPlaceholder')"
              inputmode="decimal"
            />
          </label>

          <!-- 输出比对方式（2026-10-25 加，2026-11-09 改为「按题覆盖」）：留空 = 跟随
               设置 › 评测 › 输出比对；选了就把这道题钉死，与全局设置无关。
               只影响 exit 0 之后的 AC / WA 判定，不改变 TLE / MLE / RE 的口径。 -->
          <label class="meta__field">
            <span class="meta__label">{{ t('explorer.meta.checker') }}</span>
            <select v-model="metaForm.checker" class="meta__input">
              <option value="">{{ t('explorer.meta.checkerDefault') }}</option>
              <option v-for="item in CHECKER_OPTIONS" :key="item.id" :value="item.id">
                {{ t(item.labelKey) }}
              </option>
            </select>
          </label>

          <p v-if="metaError" class="meta__error">{{ metaError }}</p>

          <div class="meta__actions">
            <button type="button" class="meta__btn" @click="cancelMeta">
              {{ t('app.cancel') }}
            </button>
            <button type="button" class="meta__btn meta__btn--primary" @click="confirmMeta">
              {{ t('app.save') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 拖拽幽灵：跟着指针走，必须 pointer-events: none，否则 elementFromPoint 只命中它自己 -->
    <Teleport to="body">
      <div
        v-if="draggingNode"
        class="drag-ghost"
        :style="{ left: `${ghostPos.x}px`, top: `${ghostPos.y}px` }"
      >
        <AppIcon :name="ghostIcon" :size="14" />
        <span class="drag-ghost__label">{{ draggingNode.name }}</span>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.explorer {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1 1 auto;
}

/* ---------------------------------------------------------------- 删除确认
   Teleport 到 body，所以这里的定位与色值都只依赖主题变量，不依赖侧边栏的容器 */
.confirm {
  position: fixed;
  inset: 0;
  /* 高于右键菜单（120），低于顶栏下拉之类的系统级浮层 */
  z-index: 130;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.32);
}

.confirm__card {
  width: min(340px, 100%);
  padding: 14px;
  border: 1px solid var(--border-soft);
  border-radius: 10px;
  background: var(--bg-raised);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.34);
}

.confirm__title {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 650;
  color: var(--text);
}

.confirm__desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-dim);
  /* 长路径要能换行，别把卡片撑破 */
  overflow-wrap: anywhere;
}

/* 待删路径列表：一行一条（单条删除时也就这一行，看着与原先那句纯文本一样） */
.confirm__list {
  margin: 0;
  padding: 0;
  list-style: none;
  color: var(--text);
}

/* 折行提示与「目录里的东西一起删」那句：与路径拉开一点，别糊成一坨 */
.confirm__more {
  margin: 4px 0 0;
}

.confirm__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}

.confirm__btn {
  padding: 5px 14px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-panel);
  color: var(--text);
  font: 500 12.5px/1.5 var(--font-sans, system-ui);
  cursor: pointer;
}

:where(html.is-hoverable) .confirm__btn:hover {
  background: var(--bg-hover);
}

/* 危险动作沿用 icon-btn--danger 的配色，两套主题各自有变量 */
.confirm__btn--danger {
  border-color: transparent;
  background: var(--danger-bg);
  color: var(--danger-text);
}

:where(html.is-hoverable) .confirm__btn--danger:hover {
  background: var(--danger-bg-hover);
}

/* 导出卡片那颗主操作：沿用 accent（与题目信息弹窗的「保存」、站内其它主要按钮同色） */
.confirm__btn--primary {
  border-color: transparent;
  background: var(--accent);
  color: var(--text-on-accent);
}

:where(html.is-hoverable) .confirm__btn--primary:hover {
  background: var(--accent-hover);
}

/* 导出卡片的三颗是竖排的：它们不是「取消 / 确认」那种对照关系，而是三个并列的落点
   （写进磁盘 / 打成 zip / 算了），横排会挤成一坨，也分不清哪个是主操作 */
.confirm__actions--stack {
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
}

.confirm__actions--stack .confirm__btn {
  width: 100%;
  padding: 6px 14px;
}

.confirm__btn:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
}

/* ---------------------------------------------------------------- 题目信息
   与删除确认同款：Teleport 到 body，只依赖主题变量 */
.meta {
  position: fixed;
  inset: 0;
  z-index: 130;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.32);
}

.meta__card {
  width: min(360px, 100%);
  /* 六项字段在矮屏（手机横屏 / 小窗口）会顶破视口：卡片自己滚，遮罩不动 */
  max-height: calc(100dvh - 32px);
  overflow-y: auto;
  padding: 14px;
  border: 1px solid var(--border-soft);
  border-radius: 10px;
  background: var(--bg-raised);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.34);
}

.meta__title {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 650;
  color: var(--text);
}

.meta__file {
  margin: 0 0 12px;
  font: 400 11.5px/16px var(--font-mono, ui-monospace, monospace);
  color: var(--text-faint);
  overflow-wrap: anywhere;
}

.meta__field {
  display: block;
  margin-bottom: 10px;
}

.meta__label {
  display: block;
  margin-bottom: 4px;
  font-size: 12px;
  color: var(--text-dim);
}

.meta__input {
  width: 100%;
  height: 28px;
  padding: 0 8px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font: 400 13px/26px var(--font-sans, system-ui);
}

.meta__input:focus {
  outline: none;
  border-color: var(--accent);
}

.meta__input:disabled {
  opacity: 0.5;
}

.meta__error {
  margin: 0 0 8px;
  color: var(--danger-text);
  font-size: 11.5px;
  line-height: 16px;
}

.meta__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}

.meta__btn {
  padding: 5px 14px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-panel);
  color: var(--text);
  font: 500 12.5px/1.5 var(--font-sans, system-ui);
  cursor: pointer;
}

:where(html.is-hoverable) .meta__btn:hover {
  background: var(--bg-hover);
}

.meta__btn--primary {
  border-color: transparent;
  background: var(--accent);
  color: var(--text-on-accent);
}

:where(html.is-hoverable) .meta__btn--primary:hover {
  background: var(--accent-hover);
}

.meta__btn:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
}

/* 页头本身已上提到 Sidebar 的共享页头（.sidebar__head，2026-10-11）：
   透明底、滚动才描边的那套都在那里；这里只剩 Teleport 上去的动作区样式 */

.explorer__actions {
  display: inline-flex;
  flex: 0 0 auto;
  /* 折到第二行时仍然贴右 */
  margin-left: auto;
  /* 新建那两颗之间的间距（2026-10-12：2px → 0 → 4px → 2px，随用户三次要求来回调） */
  gap: 2px;
}

/* 26px 是共享页头里图标按钮的统一尺寸（左侧胶囊 / 齿轮同为 26×26），
   也正好卡在页头内容区上限：.sidebar__head 是 min-height 35px + 上下各 4px 内边距 = 27px，
   再高就会把页头顶到 36px、与编辑区页签栏那 35px 错开 */
.explorer__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--text-dim);
  cursor: pointer;
}

:where(html.is-hoverable) .explorer__btn:hover {
  background: var(--bg-control-hover);
  color: var(--text);
}

/* 禁用态（比上面那条 :hover 更具体，压得住） */
.explorer__btn:disabled,
:where(html.is-hoverable) .explorer__btn:disabled:hover {
  background: transparent;
  color: var(--text-dim);
  opacity: 0.4;
  cursor: default;
}

/* ---------------------------------------------------------------- 两颗新建钮的「墨迹底」对齐
   2026-11-17 用户要求「新建文件夹与新建文件的底边平齐」。两颗按钮的盒子本来就一样
   （26×26、同一行、align-items: center），差的是图标墨迹的底边：

   | 图标 | 24 网格里的墨迹 | 17px 下的墨迹底 |
   |---|---|---|
   | `file-plus`   | y 2→22（上下各留 2 格） | 30.79px |
   | `folder-plus` | y 3→20（Lucide 的文件夹族天生高半个格） | 29.73px |

   相差 2 格 = 1.42px，并排看就是一高一低。做法是**各让一格**：文件上移、文件夹下移，
   两条墨迹底一起落在 30.08px（16px 那一版是 29.67，随图标尺寸等比上移）。

   - **为什么对半分而不是只挪文件夹**：`file-plus` 的墨迹在网格里本来就上下对称、是「正」
     的那枚；但只把文件夹往下压 1.42px，它的重心会比同排的组件 / 齿轮低 1.4px（那两枚的
     墨迹底在 31.7、中线在 23）。各挪 0.71 之后两颗都只偏离中线半个多像素，整排重心不动。
   - **为什么写百分比**：一格 = 1/24 画布 = 4.1667%，这个差量是**字形**的属性、跟着图标
     尺寸走；写成 px 会被 postcss-pxtorem 转成 rem、跟着根字号放大，而 `AppIcon` 的 `size`
     是写死的 px 属性（不吃全局缩放），两边比例会越缩越对不上。
   - ⚠️ 只作用于页头这两颗：`file-plus` / `folder-plus` 全站只在这里用（AppIcon 里那几条
     「上游原样的 d、不做任何位移」的纪律也没破 —— 位移写在消费处，不动字形）。 */
.explorer__btn__icon--file {
  transform: translateY(-4.1667%);
}

.explorer__btn__icon--folder {
  transform: translateY(4.1667%);
}

.explorer__tree {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  /* 原生滚动条藏掉，改由 useOverlayScrollbar 那条浮在行之上的滑块接手（2026-10-13）：
     原生那条占 11px 内容宽度，行会随它出现 / 消失整体挪一下（窄侧栏里尤其明显）。
     scrollbar-width 走标准路径（Chromium 121+ 起只认它），::-webkit-scrollbar 兜住旧内核。 */
  scrollbar-width: none;
  /* 底部这 24px 是「选中根目录」的点击区（点空白处 = 什么都不选中、新建落在根）。
     树内容撑满整个面板时行与行之间没有空白，滚到底还有这一条可用，入口不会消失。
     顶部 4px → 6px（2026-10-13）：与评测样例首个卡片的首行对齐（那边把 .cases 的顶内边距
     收到 0 之后，头行内容中心在页头下沿 18px 处；本处行高 24px、文字 20px 居中，
     6 + 12 = 18）。两处是一对，改一处要看另一处。
     左右这 4px（2026-11-18 加）：行高亮原本左右顶满岛沿，而浅色下高亮色（岛面掺 7% 黑
     ≈234）与岛外地面（#e3e5e8，227）只差 7 阶、中间只隔一根极淡的 1px 岛沿 —— 实拍
     确认高亮带读起来「延续到地面里」（用户报「选中高亮的区域与地面有些重叠」）。收进
     4px + 行圆角 4px（见 FileTreeItem 的 .tree-item__row），高亮成了岛内的胶囊，与地面
     之间永远隔着一截岛面。 */
  padding: 6px 4px 24px;
}

.explorer__tree::-webkit-scrollbar {
  width: 0;
  height: 0;
}

/* 焦点收进树容器（= 焦点落在「根」上，见 onTreePointerDown）时**不画焦点圈**。
   那一刻屏幕上没有任何一行是高亮的，沿整块树套一圈蓝框既是噪声、又会被读成「根这个节点
   被选中了」。容器上的焦点只是键盘作用域的记账，真正的焦点指示由行自己的选中态承担
   —— 键盘 Tab 进来命中的是行（行有 tabindex），走的不是这条（2026-10-12 用户要求）。
   要压掉的是 base.css 里那条全局 :focus-visible，故必须同时写 :focus（程序化 focus 在
   部分浏览器上不匹配 :focus-visible）。 */
.explorer__tree:focus,
.explorer__tree:focus-visible {
  outline: none;
}

/* 落点是根目录（拖到树的空白处）时：与行落点同一支颜色，只是铺满整个树容器、透明度更淡
   （--bg-drop-root）—— 铺满一整个面板时，行上那个浓度会糊成一片蓝。
   贴的是容器自身的背景层 —— 行、范围线、小圆点都是它的子元素，仍画在这层之上，
   所以整框泛蓝的同时，树结构照样看得清。 */
.explorer__tree.is-drop-root {
  background: var(--bg-drop-root);
  border-radius: 4px;
}

/* 拖拽 / 粘贴失败、以及导入 / 导出 / 删除进行中的临时提示 */
.explorer__notice {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 4px 10px;
  border-bottom: 1px solid var(--border-soft);
  background: var(--bg-panel-head);
  color: var(--danger-text);
  font-size: 11.5px;
  line-height: 16px;
  cursor: default;
}

/* 进行中是中性灰，不是错误红：它说的是「稍等」，不是「出事了」 */
.explorer__notice--busy {
  color: var(--text-dim);
}

/* ---------------------------------------------------------------- 查找文件
   搜索栏贴在树顶部；展开时结果列表整块接替文件树（见模板里的 v-show）。 */
.explorer__search {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border-soft);
}

.explorer__search-input {
  flex: 1 1 auto;
  min-width: 0;
  height: 26px;
  padding: 0 8px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font: 400 12.5px/24px var(--font-sans, system-ui);
}

.explorer__search-input:focus {
  outline: none;
  border-color: var(--accent);
}

.explorer__search-close {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--text-dim);
  cursor: pointer;
}

:where(html.is-hoverable) .explorer__search-close:hover {
  background: var(--bg-control-hover);
  color: var(--text);
}

.explorer__results {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 0 24px;
  scrollbar-width: none;
}

.explorer__results::-webkit-scrollbar {
  width: 0;
  height: 0;
}

.explorer__result {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 24px;
  padding: 2px 8px;
  background: transparent;
  border: none;
  color: var(--text);
  text-align: left;
  cursor: pointer;
}

:where(html.is-hoverable) .explorer__result:hover {
  background: var(--bg-hover-soft);
}

.explorer__result--active,
:where(html.is-hoverable) .explorer__result--active:hover {
  background: var(--bg-hover);
}

.explorer__result-icon {
  flex: 0 0 auto;
}

.explorer__result-icon.is-cpp {
  color: var(--icon-cpp);
}

.explorer__result-icon.is-python {
  color: var(--icon-python);
}

.explorer__result-icon.is-markdown {
  color: var(--icon-markdown);
}

.explorer__result-text {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  flex-direction: column;
}

.explorer__result-name,
.explorer__result-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.explorer__result-name {
  font-size: 13px;
  line-height: 17px;
}

.explorer__result-path {
  color: var(--text-faint);
  font-size: 11px;
  line-height: 14px;
}

/* 拖拽幽灵：Teleport 到 body，只依赖主题变量 */
.drag-ghost {
  position: fixed;
  z-index: 140;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 220px;
  padding: 2px 8px;
  border: 1px solid var(--border-soft);
  border-radius: 4px;
  background: var(--bg-raised);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.28);
  color: var(--text);
  /* 让指针事件穿过去，命中测试才找得到底下的行 */
  pointer-events: none;
  /* 挪到指针右下一点点，别挡住手指底下那一行 */
  transform: translate(10px, 8px);
}

.drag-ghost__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
  line-height: 18px;
}

.explorer__empty {
  margin: 8px 12px;
  color: var(--text-faint);
  font-size: 12px;
  line-height: 18px;
}
</style>
