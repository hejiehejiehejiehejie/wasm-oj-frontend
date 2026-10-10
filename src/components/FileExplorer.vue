<script setup>
/**
 * FileExplorer —— 资源管理器面板：头部操作（新建文件 / 文件夹）+ 树容器 + 右键菜单（打开题目 / 题目信息 / 新建 / 重命名 / 删除）。
 *
 * 「资源管理器」这个标题由统一侧边栏的页签承担（见 Sidebar.vue），这里头部只留操作按钮。
 * 新建的目标目录可以是任意已存在目录：页头按钮跟随**选中的那一行**（选中文件时取其父目录；
 * 点树里空白处 = 选中根，回落根目录），右键目录则显式指定该目录。
 * 选中态（`workspace.selectedId`）是唯一来源，读取与写入都在 workspaceStore 里。
 * 名字仍是单级（assertName 拒绝 /），嵌套路径留待后续。
 *
 * 通过 provide 向递归树项提供能力：右键菜单、**打开题目**、根 DOM、重命名目标、焦点管理，
 * 内联新建的状态与提交入口，以及拖拽（起手 / 落点高亮 / 点击抑制）。输入行由 InlineCreateRow
 * 渲染：根目录这份在本组件，建在某个目录里的那份在 FileTreeItem 的 role="group" 里。
 * 另经 defineExpose 对外给出两个入口（`startRename` / `requestDelete`，都收节点 id），
 * 供全局快捷键 F2 / Delete 调用 —— 见文件末尾。
 */
import { computed, nextTick, onUnmounted, provide, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import ContextMenu from './ContextMenu.vue'
import FileTreeItem from './FileTreeItem.vue'
import InlineCreateRow from './InlineCreateRow.vue'
import SidebarSwitcher from './SidebarSwitcher.vue'
import { useTreeDrag } from '../composables/useTreeDrag.js'
import { IS_MAC, formatCombo, useShortcutManager } from '../composables/useShortcutManager.js'
import { t } from '../i18n/index.js'
import { templateForPath } from '../services/fileTemplates.js'
import {
  activeLanguage,
  createDirectory,
  createFile,
  deleteNode,
  getNodeById,
  moveNode,
  selectNode,
  toggleExpand,
  updateFileMeta,
  workspace,
} from '../services/vfs/workspaceStore.js'
import { assertName, basename, join } from '../services/vfs/paths.js'
import { onStartupNotice } from '../services/vfs/workspaceNotices.js'
import {
  OJ_LIST,
  difficultyOptionsFor,
  difficultySystemFor,
  emptyMeta,
  labelOf,
  normalizeMeta,
  todayISO,
} from '../services/problemMeta.js'

const rootEl = ref(null)

/** 快捷键绑定表：菜单右列的键位读它（设置里改绑，这里跟着变，见 shortcutOf） */
const { bindings } = useShortcutManager()

/** 内联新建状态：{ type:'file'|'directory', targetId, targetPath, value, error } | null
 *  targetId 为 'root' 或目标目录的节点 id；targetPath 是它的绝对路径（根为 '/'）。 */
const creating = ref(null)
/** 内联新建输入行的句柄（InlineCreateRow 挂载时注册）；同一时刻只有一行 */
const creatingRow = ref(null)
/** 右键菜单状态：{ x, y, node, items } | null */
const menu = ref(null)
/** 需要进入重命名的节点 id */
const renameTarget = ref(null)
/** 树内最近获得焦点的 id（roving tabindex） */
const focusedId = ref(null)
/** 待确认删除的节点；null = 没有待确认的删除 */
const pendingDelete = ref(null)
/** 确认弹窗里的「删除」按钮：弹窗打开时把焦点送进去 */
const confirmBtn = ref(null)

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
 * 页头按钮的目标目录：跟随**选中的那一行**（目录就是它自己，文件取其父目录），
 * 什么都没选中（= 选中根）或索引未就绪时回落根目录 —— 界面上此时整棵树都不高亮。
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
 * 取出可安全打开的题目链接，拿不到就返回空串。
 *
 * `meta.url` 是不可信输入（一半来自扩展解析结果、一半来自用户手输），`javascript:` 这类
 * 伪协议会被 window.open 当代码执行，所以只放行 http / https，且返回归一化后的 href。
 * 菜单项与开链接共用这一个判据：拿不到链接就不给这一项，免得出现点了没反应的菜单。
 */
function problemUrl(node) {
  const raw = node?.meta?.url
  if (!raw) return ''
  try {
    const target = new URL(raw)
    return target.protocol === 'http:' || target.protocol === 'https:' ? target.href : ''
  } catch {
    return ''
  }
}

/**
 * 在新标签页打开这一行的题目。返回「到底开没开」—— 调用方（树项里的 ⌘ / Ctrl + 单击）要靠它
 * 决定要不要退化成普通单击，所以拿不到链接时**必须**回 false，不能只是静默。
 *
 * 菜单里那一项与 ⌘ / Ctrl + 单击共用这一个出口，判据（`problemUrl`）也只有一份。
 * @param {object} node
 * @returns {boolean}
 */
function openProblem(node) {
  const url = problemUrl(node)
  if (!url) return false
  window.open(url, '_blank', 'noopener')
  return true
}

/**
 * 题目信息只对文件有意义；新建只对目录有意义——目标就是被右键的那个目录。
 * （页头按钮那条路只能跟随聚焦节点，表达不了「建在哪个目录」。）
 *
 * 「重命名 / 删除」两项挂上右列键位：它们是真的能按的（F2 / Delete，见下 shortcutOf），
 * 不是装饰。目录与文件共用同一组键位。
 */
function buildMenuItems(node) {
  const items = []
  if (node?.type === 'file') {
    // 右列不是 keydown 组合键，是 ⌘ / Ctrl + 单击这个**手势**本身 —— 走不了 formatCombo
    // （它只吃 'Mod+KeyX' 那种串），但它是真的能按的，所以照旧填右列、不留空。
    if (problemUrl(node)) {
      items.push({
        id: 'open-url',
        label: t('explorer.menu.openUrl'),
        shortcut: t('explorer.menu.openUrlClick', { mod: IS_MAC ? '⌘' : 'Ctrl' }),
      })
    }
    items.push({ id: 'meta', label: t('explorer.menu.meta') })
  } else if (node?.type === 'directory') {
    items.push({ id: 'new-file', label: t('explorer.menu.newFile') })
    items.push({ id: 'new-folder', label: t('explorer.menu.newFolder') })
  }
  items.push({ id: 'rename', label: t('explorer.menu.rename'), shortcut: shortcutOf('rename-node') })
  items.push({ id: 'delete', label: t('explorer.menu.delete'), shortcut: shortcutOf('delete-node') })
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
  if (!node) return
  if (id === 'meta') beginEditMeta(node)
  else if (id === 'open-url') openProblem(node)
  else if (id === 'new-file') startCreate('file', node)
  else if (id === 'new-folder') startCreate('directory', node)
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

/**
 * 删除入口：先把待删节点记下来、弹确认框，**点「删除」之后**才动 VFS。
 *
 * 这里不用 window.confirm：原生弹窗的返回值在 webview / 装成应用窗口打开时不由我们
 * 掌控（被浏览器抑制时它自己直接返回一个值），出现过「弹窗上点了取消，文件还是没了」。
 * 自己画的弹窗没有这层不确定性，取消就是取消。
 */
function requestDelete(node) {
  if (node) pendingDelete.value = node
}

function cancelDelete() {
  const node = pendingDelete.value
  pendingDelete.value = null
  // 弹窗一出现就把焦点送进了「删除」那颗按钮（见下面那条 watch），弹窗一撤焦点就落到 <body> 上。
  // 交还给原来那一行 —— 否则「Esc 取消删除」之后紧接着再按 Delete 是没反应的，得先点回那一行。
  if (node) refocusRow(node.id)
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

async function confirmDelete() {
  const node = pendingDelete.value
  // 先关弹窗再动 VFS：删除过程中（可能要等 VFS 的异步事件）不该再留一个可点的按钮
  pendingDelete.value = null
  if (node) await deleteNode(node.path)
}

// 弹窗一出现就把焦点放到「删除」上：Enter 确认、Esc 取消都能纯键盘走完
watch(pendingDelete, (node) => {
  if (node) nextTick(() => confirmBtn.value?.focus())
})

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

// 在树空白处右键：只屏蔽浏览器原生菜单（没有针对「整个工作区」的操作）
function onTreeContextMenu(event) {
  event.preventDefault()
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
} = useTreeDrag({ treeEl: rootEl, onDrop: onDropNode, openContextMenu, closeContextMenu })

/** 幽灵元素上的图标：只分文件 / 目录，够用来认出手里拖的是谁 */
const ghostIcon = computed(() => (draggingNode.value?.type === 'directory' ? 'folder' : 'file'))

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

// 工作区启动期的一次性提示（如侧车 JSON 损坏）：provider 只投递 i18n key，这里翻成文案弹横幅。
// 订阅放在这里（组件 setup）而不是 onMounted —— FileExplorer 比 App.vue 的 onMounted 先初始化，
// 于是 provider 在 init() 里投递时订阅已就位。
onUnmounted(onStartupNotice((key) => showNotice(t(key))))

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
  if (!row) return
  setFocusedId(row.dataset.treeId)
  // 树里的选中跟随焦点：键盘把焦点挪到哪一行就选中哪一行（于是页头新建也落在它那儿）。
  // 鼠标 / 触屏点行时这条也会先跑一遍，与 FileTreeItem 里那次写入同值，无副作用；
  // 触屏上万一没补焦点，还有行点击那条兜着。
  selectNode(row.dataset.treeId)
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

provide('openContextMenu', openContextMenu)
// 「打开题目」的出口：菜单里那一项与树项上的 ⌘ / Ctrl + 单击都归它，判据只有 problemUrl 一份
provide('openProblem', openProblem)
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
provide('dropTargetRowId', dropTargetRowId)
provide('draggingId', draggingId)
// 触屏长按的两段提示：按压进度（还在等）与就绪态（已经到点 —— 菜单已弹出，此后移动即拖动）
provide('pressingId', pressingId)
provide('armedId', armedId)

/**
 * 全局快捷键（F2 重命名 / Delete 删除）的入口。
 *
 * 这两条动作的键位登记在 `useShortcutManager` 的 SHORTCUT_ACTIONS 里，但**执行不了在那里**：
 * 它要做的事全在本组件手上（起内联重命名、弹删除确认框），而它作用于「资源管理器里当前有焦点的
 * 那一行」。所以 App.vue 的全局监听先过一道作用域闸门，再从这里进来 —— 动作与右键菜单那两条
 * **完全同源**（`beginRename` / `requestDelete`），不另写一份。
 *
 * 只收**节点 id**（调用方手里只有事件落点那一行的 `dataset.treeId`），节点在这里查一次；
 * 节点已经不在了就静默什么也不做（`requestDelete(null)` 自带 `if (node)` 保护）。
 */
defineExpose({
  /** @param {string} id 要重命名的节点 id */
  startRename: (id) => beginRename(id),
  /** @param {string} id 要删除的节点 id */
  requestDelete: (id) => requestDelete(getNodeById(id)),
})
</script>

<template>
  <section class="explorer">
    <header class="explorer__head">
      <SidebarSwitcher />
      <span class="explorer__actions">
        <button
          type="button"
          class="explorer__btn"
          :title="t('explorer.menu.newFile')"
          @click="startCreate('file', headerCreateTarget())"
        >
          <AppIcon name="file-plus" :size="14" />
        </button>
        <button
          type="button"
          class="explorer__btn"
          :title="t('explorer.menu.newFolder')"
          @click="startCreate('directory', headerCreateTarget())"
        >
          <AppIcon name="folder-plus" :size="14" />
        </button>
      </span>
    </header>

    <!-- 拖拽 / 粘贴失败只在这里提示一句（没有行内位置可放），约 4s 后自己消失 -->
    <p v-if="notice" class="explorer__notice" role="status" @click="notice = ''">{{ notice }}</p>

    <div
      ref="rootEl"
      class="explorer__tree"
      :class="{ 'is-drop-root': isRootDrop }"
      role="tree"
      @contextmenu="onTreeContextMenu"
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
         点遮罩 / Esc = 取消，只有点「删除」才会真的动文件。 -->
    <Teleport to="body">
      <div v-if="pendingDelete" class="confirm" @pointerdown.self="cancelDelete">
        <div
          class="confirm__card"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          aria-describedby="confirm-desc"
          @keydown.esc.stop.prevent="cancelDelete"
        >
          <p id="confirm-title" class="confirm__title">{{ t('explorer.deleteConfirm.title') }}</p>
          <p id="confirm-desc" class="confirm__desc">
            <span class="confirm__path">{{ pendingDelete.path }}</span>
            <template v-if="pendingDelete.type === 'directory'">
              {{ t('explorer.deleteConfirm.directoryNote') }}
            </template>
          </p>
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

.confirm__path {
  color: var(--text);
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

.confirm__btn:hover {
  background: var(--bg-hover);
}

/* 危险动作沿用 icon-btn--danger 的配色，两套主题各自有变量 */
.confirm__btn--danger {
  border-color: transparent;
  background: var(--danger-bg);
  color: var(--danger-text);
}

.confirm__btn--danger:hover {
  background: var(--danger-bg-hover);
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

.meta__btn:hover {
  background: var(--bg-hover);
}

.meta__btn--primary {
  border-color: transparent;
  background: var(--accent);
  color: var(--text-on-accent);
}

.meta__btn--primary:hover {
  background: var(--accent-hover);
}

.meta__btn:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
}

.explorer__head {
  display: flex;
  align-items: center;
  /* 左侧是「资源管理器 / 评测样例」切换入口（两个 logo），右侧是两颗操作按钮；
     两边加起来也远比面板下限窄，所以不折行（折行只留给评测样例页头） */
  justify-content: space-between;
  gap: 8px;
  /* 与评测样例页头同高 */
  height: 35px;
  padding: 0 8px 0 4px;
  /* 页头不再铺底纹、也不画分隔线（2026-10-04）：侧栏展开后它是整栏的最上一条，
     铺 --bg-panel-head 会在最上方留下一道比正文亮的色带，再加上底下那根发丝线，
     看上去像两条叠在一起的东西。去掉后整块侧栏从头到尾一个色，胶囊自己浮在上面 */
  background: transparent;
}

.explorer__actions {
  display: inline-flex;
  flex: 0 0 auto;
  /* 折到第二行时仍然贴右 */
  margin-left: auto;
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
  /* 底部这 24px 是「选中根目录」的点击区（点空白处 = 什么都不选中、新建落在根）。
     树内容撑满整个面板时行与行之间没有空白，滚到底还有这一条可用，入口不会消失。 */
  padding: 4px 0 24px;
}

/* 落点是根目录（拖到树的空白处）时：与行落点同一支颜色，只是铺满整个树容器、透明度更淡
   （--bg-drop-root）—— 铺满一整个面板时，行上那个浓度会糊成一片蓝。
   贴的是容器自身的背景层 —— 行、范围线、小圆点都是它的子元素，仍画在这层之上，
   所以整框泛蓝的同时，树结构照样看得清。 */
.explorer__tree.is-drop-root {
  background: var(--bg-drop-root);
  border-radius: 4px;
}

/* 拖拽 / 粘贴失败的临时提示 */
.explorer__notice {
  margin: 0;
  padding: 4px 10px;
  border-bottom: 1px solid var(--border-soft);
  background: var(--bg-panel-head);
  color: var(--danger-text);
  font-size: 11.5px;
  line-height: 16px;
  cursor: default;
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
