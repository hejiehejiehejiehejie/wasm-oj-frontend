/**
 * workspaceStore —— 工作区的响应式单例（不引状态库，原生 reactive）。
 *
 * 【核心纪律】tree 的所有变更只允许出现在 provider 的事件回调里：
 * action 函数只 await provider 方法，不直接改 tree。
 * 这样未来换成 GitHubVFSProvider，store 与组件零修改。
 *
 * 本模块同时负责：
 * - openTabIds / activeId / 展开目录的持久化；
 * - 启动时把上次会话的 tab 恢复为 model（引用计数 + retain）；
 * - reset 后清理已不存在的 tab（并 release model），同步存活 model 的节点元数据。
 */
import { computed, reactive, watch } from 'vue'
import { t } from '../../i18n/index.js'
import { flush, isAutoSaveEnabled } from '../autoSave.js'
import { modelManager } from '../monaco/modelManager.js'
import { languageForPath } from '../monaco/language.js'
import { defaultCode } from '../templates.js'
import { basename, join, normalize } from './paths.js'
import { uniqueNameIn } from './treeOps.js'
import { getVFS } from './vfsFactory.js'
import { getWorkspaceMode, getWorkspaceRoot, MODE_FOLDER } from './workspaceMode.js'

/**
 * 会话键按**工作区**分桶。
 *
 * 两种工作区是两套完全不同的 id 空间（虚拟工作区是 uuid，本机文件夹也是 uuid，但两份
 * 互不相干），共用一个键会让「切过去一趟再切回来」把另一边的页签会话覆盖掉。所以本机文件夹
 * 模式给这几个键加一个由**根路径**派生的后缀；虚拟工作区后缀为空，键名与历史数据原样保留。
 *
 * 后缀里不能放原始绝对路径（键名会长得离谱、且路径里有 `/`）：取它的 djb2 哈希即可 ——
 * 这里只需要「同一台设备、同一目录必然同桶；不同目录必然不同桶」，不需要抗碰撞。
 */
function sessionSuffix() {
  if (getWorkspaceMode() !== MODE_FOLDER) return ''
  const root = getWorkspaceRoot()
  if (!root) return ''
  let hash = 5381
  for (let index = 0; index < root.length; index += 1) {
    hash = ((hash << 5) + hash + root.charCodeAt(index)) | 0
  }
  return `.folder.${(hash >>> 0).toString(36)}`
}

/** 本页生命周期内固定不变（切模式会整页重载），求值一次即可 */
const SESSION_SUFFIX = sessionSuffix()

const EXPANDED_KEY = `cp.vfsExpanded${SESSION_SUFFIX}`
const TABS_KEY = `cp.openTabs${SESSION_SUFFIX}`
const ACTIVE_KEY = `cp.activeFile${SESSION_SUFFIX}`
const SELECTED_KEY = `cp.selectedNode${SESSION_SUFFIX}`

// ------------------------------------------------------------ 本地存储小工具

function readJSON(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key)
    return raw === null ? fallback : JSON.parse(raw)
  } catch {
    return fallback
  }
}

function writeJSON(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 存储不可用：只在内存工作 */
  }
}

// ------------------------------------------------------------ 状态

export const workspace = reactive({
  ready: false,
  /** @type {import('./BaseVFSProvider.js').VFSNode[]} 嵌套树 */
  tree: [],
  /** @type {string[]} 打开的文件 id（tab 顺序） */
  openTabIds: [],
  /** @type {string|null} 活跃文件 id */
  activeId: null,
  /**
   * **主选中**的树节点 id（文件或目录）。与 activeId 分工不同：activeId 是「编辑器里打开的那个
   * 文件」，目录进不去；本字段才是「页头新建落在哪个目录」的唯一来源，多选时它同时充任
   * **Shift 区间选择的锚点**（见 FileExplorer 的 selectRangeTo）：Shift + 单击只刷新高亮集合、
   * 不动这里，于是连着 Shift 点几个地方都是从同一个起点重新划范围（VS Code 同款）。
   * null = 根目录 —— 界面上就是「什么都没有选中」，新建落在根。
   * ⚠️ **哪几行高亮**看的是下面的 `selectedIds`；本字段只回答「哪一个算主」。
   * @type {string|null}
   */
  selectedId: null,
  /**
   * 当前高亮的全部节点 id（**含**主选中那一个）。
   *
   * 空数组 = 一项都没选中（= 选中根），此时 `selectedId` 也必须是 null —— 这两者的一致性
   * 只由 `applySelection()` 一处保证，别在别处分别写这两个字段（三处状态各自为政必然走歪）。
   *
   * 刻意**不落 localStorage**：跨会话只恢复主选中那一个（`cp.selectedNode`）—— 与 VS Code
   * 一致（重开只剩「当前项」，不会拖着一整片上次的旧选区）。
   * @type {string[]}
   */
  selectedIds: [],
  /**
   * 预览页签 id（VS Code 式斜体临时页签，全局至多一个）。
   *
   * 单击文件树 → 占这个槽；再单击别的文件就把上一个**顶替**掉（见 openFile 的 preview 选项）。
   * 双击文件 / 双击页签 / 在预览页签里编辑 → 钉住（归 null，页签转正体）。
   * 刻意**不落 localStorage**：刷新后退化成普通页签，既是无害的降级，也省一处会话恢复分叉
   * （页签本身照旧由 cp.openTabs 恢复）。
   * @type {string|null}
   */
  previewTabId: null,
  /** @type {string[]} 展开的目录 id */
  expandedIds: [],
})

// 先吃进上次的偏好（tab 的 model 恢复在 initStore 里做）
workspace.expandedIds = Array.isArray(readJSON(EXPANDED_KEY, [])) ? readJSON(EXPANDED_KEY, []) : []

/**
 * id → 最近一次树重建时的节点（供 tab / 恢复使用）。
 * 必须是响应式 Map：重命名后 tab 标题要靠它的跟踪自动重渲染。
 * @type {Map<string, import('./BaseVFSProvider.js').VFSNode>}
 */
const nodeIndex = reactive(new Map())

// ------------------------------------------------------------ 事件 → tree

/**
 * 从 provider 重建整树，并维护索引。
 * （本项目中 rename/delete 一律聚合为 reset；create/update 重建也无歧义、无开销问题。）
 */
async function rebuildTree() {
  const vfs = getVFS()
  const rawTree = await vfs.getTree()

  // getTree 只返回根的子节点；把根本身也放进索引，供根级新建时取父路径。
  // 刻意在 clear 之前先取好：下面「清空 → 填回」必须是一段**同步**代码，中间夹一个 await，
  // 排在微任务里的 watcher（如 App.vue 里跟随 activeNode 的那几个）就会读到一个空索引，
  // 把「当前文件」看成 null —— 界面会闪一下，评测面板的样例连同运行结论一起被重建。
  let rootNode = null
  try {
    rootNode = await vfs.stat('/')
  } catch {
    /* 取不到根也不阻塞树 */
  }

  workspace.tree = rawTree

  // 原地更新响应式 Map（保持同一个对象，触发依赖它的 tab / 树重渲染）
  nodeIndex.clear()
  if (rootNode) nodeIndex.set('root', rootNode)
  const walk = (nodes) => {
    for (const node of nodes) {
      nodeIndex.set(node.id, node)
      if (node.children) walk(node.children)
    }
  }
  walk(rawTree)

  // 1) 同步存活 model 的最新节点元数据：改名后 path 变了；本机文件夹里还要认磁盘版本
  //    （mtime 变了就换成磁盘正文，或在不干净时标成「磁盘已变更」，见 modelManager.syncNode）
  for (const id of workspace.openTabIds) {
    const node = nodeIndex.get(id)
    if (!node) continue
    try {
      await modelManager.syncNode(node)
    } catch {
      /* 单个文件同步失败（外部正好把它删了 / 读不动）不该拖垮整树重建 */
    }
  }
  // 2) 清理指向已删除节点的 tab（release model）
  const surviving = workspace.openTabIds.filter((id) => nodeIndex.has(id))
  for (const id of workspace.openTabIds) {
    if (!nodeIndex.has(id)) modelManager.release(id)
  }
  if (surviving.length !== workspace.openTabIds.length) workspace.openTabIds = surviving
  if (workspace.activeId && !nodeIndex.has(workspace.activeId)) {
    workspace.activeId = surviving[surviving.length - 1] ?? null
  }
  // 3) 预览槽指向的文件没了：清掉，别让下一个文件去顶一个不存在的页签
  if (workspace.previewTabId && !nodeIndex.has(workspace.previewTabId)) {
    workspace.previewTabId = null
  }
  // 4) 选中的节点没了（删掉 / 被移走）：从高亮集合里摘掉那些消失的；主选中若也没了就往下顺
  //    一位（一个不剩才真正收回根状态）。删除多选时这一条就是「删完选区自己清干净」的实现。
  const aliveSelected = workspace.selectedIds.filter((id) => nodeIndex.has(id))
  if (aliveSelected.length !== workspace.selectedIds.length) workspace.selectedIds = aliveSelected
  if (workspace.selectedId && !nodeIndex.has(workspace.selectedId)) {
    workspace.selectedId = aliveSelected[aliveSelected.length - 1] ?? null
  }
  if (!workspace.selectedId && workspace.selectedIds.length) workspace.selectedIds = []
}

// ------------------------------------------------------------ 初始化与会话恢复

/**
 * 应用启动时调用（provider 已 init + 迁移完成）。
 * 1) 订阅事件；2) 先建一次树；3) 恢复上次的 tab（逐个建 model + retain）。
 */
/** rebuild 串行链：多个事件接连到来时排队执行，避免并发重建互相覆盖索引 */
let rebuildChain = Promise.resolve()
function scheduleRebuild() {
  rebuildChain = rebuildChain.then(() => rebuildTree()).catch(() => {
    /* 一次刷新失败不致命，下个事件再来 */
  })
}

export async function initWorkspaceStore() {
  const vfs = getVFS()
  vfs.onDidChange(scheduleRebuild)

  await rebuildTree()

  /** @type {string[]} */
  const savedTabs = Array.isArray(readJSON(TABS_KEY, [])) ? readJSON(TABS_KEY, []) : []
  const restored = []
  for (const id of savedTabs) {
    const node = nodeIndex.get(id)
    if (!node || node.type !== 'file') continue
    try {
      await modelManager.getModel(node)
      modelManager.retain(id)
      restored.push(id)
    } catch {
      /* model 建不出来就丢弃该 tab */
    }
  }
  workspace.openTabIds = restored

  const savedActive = readJSON(ACTIVE_KEY, null)
  workspace.activeId = restored.includes(savedActive)
    ? savedActive
    : restored[restored.length - 1] ?? null

  // 首次使用（或上次所有 tab 都已失效）：默认打开规范文件 /main.cpp。
  // **本机文件夹工作区里绝不能这么做** —— openLanguage 在一个不存在的路径上建文件，
  // 等于在用户真实目录里凭空造一个 main.cpp（见 capabilities.realFolder）。
  if (!workspace.activeId && !vfs.capabilities.realFolder) await openLanguage('cpp')

  workspace.ready = true

  // 恢复上次选中的那一行（只有主选中那一个，见 selectedIds 的注释）。**必须放在最后**：
  // 上面恢复 activeId 时那条 watch 会把选中带到打开的文件上，这里再盖回来 —— 否则
  // 「上次选中的文件夹」每次启动都会被当前文件顶掉。已删除的节点直接回落根（= 不选中），
  // 与 rebuildTree 的清理同一条判据。
  const savedSelected = readJSON(SELECTED_KEY, null)
  if (typeof savedSelected === 'string' && nodeIndex.has(savedSelected)) {
    selectNode(savedSelected)
  }
}

// ------------------------------------------------------------ 持久化偏好

watch(
  () => [...workspace.openTabIds],
  (value) => {
    // 恢复完成前绝不写盘：初始化竞态下的空数组会覆盖真实会话
    if (workspace.ready) writeJSON(TABS_KEY, value)
  },
  { deep: true },
)
watch(
  () => workspace.activeId,
  (value) => {
    if (workspace.ready) writeJSON(ACTIVE_KEY, value)
    // 切页签也是自动保存的「离开时点」：刚离开的那个文件可能还挂着 pending 的 debounce 计时，
    // flush() 会把它连同其它 dirty 一起写盘（没有 dirty 时是空操作）。
    if (workspace.ready) void flush()
    // 选中跟着活跃文件走：点页签、新建文件后自动打开、导入题目这些**不是从文件树发起**的
    // 打开动作，界面上的高亮必须跟着过去（树里点的那条路由 FileTreeItem 自己写选中）。
    // 走 selectNode 而不是直接写 selectedId：多选状态下这一下会把整片选区收成单选，
    // 正是「切到别的文件 = 别再拖着一堆高亮」想要的结果。
    // 启动恢复期间不参与 —— selectedId 的恢复放在 initWorkspaceStore 的最后一步。
    if (workspace.ready && value) selectNode(value)
  },
)
watch(
  () => workspace.selectedId,
  (value) => {
    if (workspace.ready) writeJSON(SELECTED_KEY, value)
  },
)
watch(
  () => [...workspace.expandedIds],
  (value) => writeJSON(EXPANDED_KEY, value),
  { deep: true },
)

/**
 * 编辑即钉住：在预览页签里敲下第一个字，它就转正体。
 *
 * 这既是 VS Code 的既定行为，也是触屏上唯一可靠的钉住途径 —— dblclick 在部分 Android/iOS
 * 浏览器里压根合成不出来（见 HANDOFF 第 5 节），预览页签若只靠双击钉住，触屏用户会被
 * 下一个文件的单击顶掉正在改的内容。
 *
 * 注意 dirtyIds 是响应式的，但 previewTabId 归 null 之后本 watch 的取值函数返回 false，
 * 不会反过来再触发一次。
 */
watch(
  () => (workspace.previewTabId ? modelManager.isDirty(workspace.previewTabId) : false),
  (dirty) => {
    if (dirty) workspace.previewTabId = null
  },
)

// DEV：追踪 openTabIds 每次变化与调用栈，定位「tab 被清空」竞态
if (import.meta.env.DEV) {
  window.__tabLog = []
  watch(
    () => [...workspace.openTabIds],
    (value) => {
      window.__tabLog.push({ at: Date.now(), value: [...value], stack: new Error().stack })
      if (window.__tabLog.length > 40) window.__tabLog.shift()
    },
    { deep: true },
  )
}

// ------------------------------------------------------------ 派生状态

export const activeNode = computed(() =>
  workspace.activeId ? nodeIndex.get(workspace.activeId) ?? null : null,
)

/**
 * 活跃文件对应的「判题语言」。引擎只支持 cpp/python：
 * .c 头/源按 cpp 走；其余扩展不可直接判题（null）。
 */
export const activeLanguage = computed(() => {
  const node = activeNode.value
  if (!node) return null
  const monacoLang = languageForPath(node.path)
  if (monacoLang === 'cpp' || monacoLang === 'c') return 'cpp'
  if (monacoLang === 'python') return 'python'
  return null
})

export const dirtyCount = computed(() => modelManager.dirtyIds.size)

// ------------------------------------------------------------ Actions

/**
 * 打开文件：已打开则只切活跃；否则建 model + retain + 加入 tab。
 *
 * `preview` 是「单击文件树」专用的预览语义：第一个文件占住预览槽，再点一个就把上一个
 * **顶替**掉。改过字的预览页签早被「编辑即钉住」那条 watch 摘出了预览槽，所以永远不会
 * 被顶替（不会丢内容）。新建文件、题目导入、首次启动的 main.cpp 都不传它，照旧是常开页签。
 *
 * @param {string} id
 * @param {import('./BaseVFSProvider.js').VFSNode|null} [nodeHint] 索引还没跟上时的兜底节点
 * @param {{ preview?: boolean }} [options]
 */
export async function openFile(id, nodeHint = null, { preview = false } = {}) {
  if (workspace.openTabIds.includes(id)) {
    // 已开着的文件被再次单击：只切活跃，**不动预览槽**（VS Code 亦然 —— 预览页签不会
    // 因为你顺手点了另一个已打开的文件就消失）
    workspace.activeId = id
    revealId(id)
    return
  }
  // nodeIndex 由事件异步重建，刚写完的文件可能还没进索引：用调用方给的节点兜底
  const node = nodeIndex.get(id) ?? (nodeHint?.id === id ? nodeHint : null)
  if (!node || node.type !== 'file') throw new Error(t('error.fileNotFound', { path: id }))
  // 顶替上一个预览页签：走 closeTab 才顺带 release model（refs 归零即 dispose）
  if (preview && workspace.previewTabId && workspace.previewTabId !== id) {
    closeTab(workspace.previewTabId)
  }
  await modelManager.getModel(node)
  modelManager.retain(id)
  workspace.openTabIds.push(id)
  workspace.activeId = id
  if (preview) workspace.previewTabId = id
  revealId(id)
}

/**
 * 关闭激活页签时的焦点回退策略（2026-10-20 十四改加的注入点）。默认 pick 为 null：
 * 沿用「原下标顶上来」的老行为。tabGroups.js 在模块加载时注入可见页签寻址
 * （findNextVisibleTab，先右后左）—— 可见性判据（分组折叠）活在那边，而本模块不能
 * 反向 import tabGroups（它已 import 这里，反向会成环），所以做成注入而不是直调。
 * pick 返回 null / undefined = 没找到可见页签，交回默认逻辑。
 * @type {{pick: ((closedId: string, index: number, openTabIds: string[]) => string|null|undefined)|null}}
 */
export const closeFocus = { pick: null }

/** @param {string} id */
export function closeTab(id) {
  const index = workspace.openTabIds.indexOf(id)
  if (index === -1) return
  // 关页签是自动保存的「离开时点」之一：下面 release() 会把 model dispose 掉，之后再读就没正文了。
  // 这里不必 await —— save() 的两个实参（path 与 getValue()）在 await 之前就求值成了字符串，
  // 所以紧跟着 release() 不会把内容弄丢。开关关着时不插手，回到「只认 Ctrl+S」的老行为。
  if (isAutoSaveEnabled() && modelManager.isDirty(id)) void modelManager.save(id)
  workspace.openTabIds.splice(index, 1)
  modelManager.release(id)
  if (workspace.previewTabId === id) workspace.previewTabId = null
  if (workspace.activeId === id) {
    // index 是 splice **后**的下标：原来右邻那张此刻恰好顶到 index 上。先问注入的
    // 可见页签寻址（先右后左，tabGroups.findNextVisibleTab）。
    const picked = closeFocus.pick?.(id, index, workspace.openTabIds)
    if (closeFocus.pick) {
      // 注入在场就信它的结论（2026-10-20 审计改）：picked 为 null = 条带上已经没有任何
      // **可见**页签（其余全被折叠藏起来）—— 焦点必须置 null（「焦点必可见」铁律），
      // 不能再退回「原下标顶上来」：那个下标顶上来的可能是折叠组里藏着的页签，
      // 焦点落上去就是「编辑区开着文件、条带找不到它」的幽灵态（与十七改的折叠路径同一条
      // 规矩）。旧注释里「点不到关闭所以走不到这里」不成立 —— 右键菜单 / 中键 / 快捷键
      // 都能在看不见页签的情况下关它。
      workspace.activeId = picked ?? null
    } else {
      // 注入还没装上（模块加载早期）才退回默认的「原下标顶上来」
      workspace.activeId =
        workspace.openTabIds[Math.min(index, workspace.openTabIds.length - 1)] ?? null
    }
  }
}

/**
 * 钉住预览页签（转正体）：双击文件树的行、双击页签、或在里面编辑时调用。
 * 不是预览页签时是空操作。
 * @param {string} id
 */
export function pinTab(id) {
  if (workspace.previewTabId === id) workspace.previewTabId = null
}

/** @param {string} id */
export function setActiveTab(id) {
  if (workspace.openTabIds.includes(id)) workspace.activeId = id
}

/**
 * 清空当前焦点（2026-10-20 十七改）。目前只有一个调用方：折叠分组时整条条带已经没有任何
 * **可见**页签了 —— 焦点必须跟着清掉，否则编辑区还开着那个文件、页签栏里却找不到它
 * （「状态幽灵化」）。与 setActiveTab 对称，组件不直接写 store 字段。
 * 清空后 activeNode 为 null，EditorPane 卸掉 model、露出「未打开任何文件」的占位。
 */
export function clearActiveTab() {
  workspace.activeId = null
}

/**
 * 把页签挪到新位置（页签栏拖动排序）。
 *
 * 只动 `openTabIds` 的顺序，**不碰** activeId / previewTabId / model —— 节点 id 没变，
 * 所以 Monaco model、undo 栈、预览槽一个都不受影响；开着的文件不会因此重载。
 *
 * `insertIndex` 是**「去掉被拖那一项之后」**的插入下标（取值 `0..rest.length`）。
 * 这样定义是因为调用方（useTabDrag）算落点时手里拿的就是「其余页签」的列表，
 * 换算成「在含被拖项的数组里的目标下标」要额外判方向、极易错；这里一句 filter 说清楚：
 * `rest[0..at]` 排在被拖项左边、`rest[at..]` 排在它右边。
 *
 * 落在原位时是空操作（新数组与原数组逐项相同），也就不会白播一次 `.tab-move` 补间。
 *
 * @param {string} id
 * @param {number} insertIndex
 */
export function moveTab(id, insertIndex) {
  if (!workspace.openTabIds.includes(id)) return
  const rest = workspace.openTabIds.filter((tabId) => tabId !== id)
  const at = Math.max(0, Math.min(rest.length, insertIndex))
  workspace.openTabIds = [...rest.slice(0, at), id, ...rest.slice(at)]
}

/**
 * 一次性写定整个选区。**selectedId 与 selectedIds 只有这一处能同时写** ——
 * 散着写必然出现「主选中不在高亮集合里」这类对不上的状态。三处约束：
 * - 高亮集合去重；
 * - 主选中必须落在集合里（不在就退到最后一个）；
 * - 集合为空时主选中必须是 null（= 选中根）。
 * @param {string[]} ids
 * @param {string|null} [primaryId]
 */
function applySelection(ids, primaryId = null) {
  const unique = [...new Set(ids)]
  workspace.selectedIds = unique
  workspace.selectedId = unique.includes(primaryId) ? primaryId : unique[unique.length - 1] ?? null
}

/**
 * 选中树里的一行（文件或目录）。作用有二：那一行高亮；页头「新建文件 / 文件夹」落进那个目录
 * （选中文件时取其父目录）。
 *
 * 传 `null`（或根节点 id `'root'`）表示选中根目录：根没有行可高亮，界面上就是「什么都没选中」，
 * 新建落在根 —— 「点树里空白处」走的就是这一条。
 *
 * 这是**单选**入口：顺手把多选的那一片收掉（VS Code 里不带修饰键点一下也是这个效果）。
 *
 * @param {string|null} id
 */
export function selectNode(id) {
  const single = !id || id === 'root' ? null : id
  applySelection(single ? [single] : [], single)
}

/**
 * 一次性选中若干项（Shift 区间选择、⌘/Ctrl + A 全选走这里）。
 *
 * `primaryId` 是**锚点**：区间选择刻意把锚点原样传进来（而不是改成最后点的那一项），
 * 这样连着 Shift 点几个不同位置都是从同一个起点重划范围。锚点不在 `ids` 里时退到最后一个。
 *
 * @param {string[]} ids
 * @param {string|null} [primaryId]
 */
export function selectMany(ids, primaryId = null) {
  applySelection(
    ids.filter((id) => id && id !== 'root'),
    primaryId,
  )
}

/**
 * 切换一行的选中（⌥ / Alt + 单击）：已经在选区里就把它摘掉，否则加进去。
 *
 * 主选中永远跟着这一行走（VS Code 里 ctrl + 单击也会把焦点挪过去）—— 摘掉的是一个
 * 已选中项时，让主选中落到剩下的最后一个上，而不是回落成「什么都没选中」：
 * 页头新建的目标不该因为顺手取消一项就跳回根目录。
 * @param {string} id
 */
export function toggleSelection(id) {
  if (!id || id === 'root') return
  const current = workspace.selectedIds
  if (!current.includes(id)) {
    applySelection([...current, id], id)
    return
  }
  const next = current.filter((item) => item !== id)
  applySelection(next, workspace.selectedId === id ? next[next.length - 1] : workspace.selectedId)
}

/**
 * 确保文件的祖先目录全部展开（新建/外部打开时用）。
 * @param {string} id
 */
export function revealId(id) {
  let node = nodeIndex.get(id)
  while (node && node.parentId) {
    const parent = nodeIndex.get(node.parentId)
    if (!parent) break
    if (!workspace.expandedIds.includes(parent.id)) workspace.expandedIds.push(parent.id)
    node = parent
  }
}

/** @param {string} id */
export function toggleExpand(id) {
  const index = workspace.expandedIds.indexOf(id)
  if (index === -1) workspace.expandedIds.push(id)
  else workspace.expandedIds.splice(index, 1)
}

/**
 * 新建文件并打开它。
 * @param {string} path
 * @param {string} [initialContent]
 */
export async function createFile(path, initialContent = '') {
  const node = await getVFS().createFile(path, initialContent)
  await openFile(node.id, node)
  return node
}

/** @param {string} path */
export async function createDirectory(path) {
  return await getVFS().createDirectory(path)
}

/**
 * 改名 / 移动。
 * @param {string} path
 * @param {string} newPath
 */
export async function renameNode(path, newPath) {
  await getVFS().rename(path, newPath)
  // tree 与 model 元数据由紧随其后的 reset 事件刷新
}

/**
 * 把节点移进某个目录（拖拽落点、粘贴都走这里）。
 *
 * 目标目录里撞名就自动排成 name-2 —— 拖拽是高频动作，不该为了个重名把用户拦下来。
 * 底层仍是 `rename`：provider 只改 path / parentId / name，**节点 id 不变**，
 * 所以移动一个已打开的文件不会打断页签、Monaco model 与 undo 栈。
 *
 * @param {string} path 源路径
 * @param {string} targetDirPath 目标目录的绝对路径
 * @returns {Promise<string>} 移动后的新路径
 */
export async function moveNode(path, targetDirPath) {
  const vfs = getVFS()
  const type = (await vfs.stat(path))?.type ?? 'file'
  // 本机文件夹里**不替用户改名**：目标是他的磁盘，撞名就拒绝并提示（provider.rename 抛
  // duplicateName，一路冒到拖拽的提示里），而不是悄悄把文件变成 name-2。
  const name = vfs.capabilities.realFolder
    ? basename(path)
    : await uniqueNameIn(vfs, targetDirPath, basename(path), type)
  const newPath = join(targetDirPath, name)
  if (newPath !== normalize(path)) await vfs.rename(path, newPath)
  return newPath
}

/**
 * 删除（调用方负责先做确认弹窗）。
 * @param {string} path
 */
export async function deleteNode(path) {
  await getVFS().delete(path)
  // tab 清理由 reset 事件里的 rebuildTree 完成
}

/**
 * 写入文件的题目元数据（meta 为 null 时清除）。树的刷新由随后的 update 事件驱动。
 * @param {string} path
 * @param {import('./BaseVFSProvider.js').VFSNodeMeta|null} meta
 */
export async function updateFileMeta(path, meta) {
  await getVFS().setMeta(path, meta)
}

/**
 * 写入文件的抓题配置（含样例）。与 setMeta 各占一个字段，互不覆盖；树的刷新同样由事件驱动。
 * @param {string} path
 * @param {Record<string, unknown>} config
 */
export async function updateFileConfig(path, config) {
  await getVFS().setConfig(path, config)
}

export async function saveActive() {
  if (workspace.activeId) await modelManager.save(workspace.activeId)
}

export async function saveAll() {
  await modelManager.saveAll()
}

/**
 * 首次启动 / 会话失效时的兜底：打开该语言的规范文件（没有就创建）。
 * 只由 initWorkspaceStore 调用——语言此后一律跟着活跃文件的扩展名走。
 * @param {'cpp'|'python'} languageId
 */
async function openLanguage(languageId) {
  const canonical = languageId === 'python' ? '/main.py' : '/main.cpp'
  const existing = await getVFS().stat(canonical)
  if (existing) await openFile(existing.id)
  else {
    const node = await getVFS().createFile(canonical, defaultCode(languageId))
    await openFile(node.id, node)
  }
}

/**
 * 取活跃 model 的当前正文（runAll 快照用）。
 * @returns {string|null}
 */
export function peekActiveContent() {
  if (!workspace.activeId) return null
  const id = workspace.activeId
  // modelManager 已登记的 model 同步取值
  return modelManager.peekValue(id)
}

/** @param {string} id @returns {import('./BaseVFSProvider.js').VFSNode|null} */
export function getNodeById(id) {
  return nodeIndex.get(id) ?? null
}

/**
 * 把题目链接归成一个可比的键 —— 比的是「同一道题」而不是同一串字符。
 *
 * 同一道题有两种常见写法：抽题面板导入时存的是 /contest/<cid>/problem/<idx>，
 * 而用户从题库点进去时地址栏是 /problemset/problem/<cid>/<idx>，两者是同一道题。
 * 只认字面量的话，「导入后隔一阵子才从题库逛到这道题」这条最常见的走法就白走了。
 *
 * 归不了的（gym / group / edu / acmsguru 等）退化成「主机 + 路径」精确比较：
 * 宁可漏认，也不能把两道不同的题认成同一道。查询串与 `#` 后缀一律不管（CF 的题目页会挂它们）。
 *
 * @param {string} url
 * @returns {string} 归不了 / 空串时返回空串（调用方据此判「不算一道题」）
 */
export function problemUrlKey(url) {
  if (typeof url !== 'string' || !url) return ''

  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return ''
  }

  // www / m1 / m2 是同一个站点的不同入口，去掉 www 就够（镜像域名另有 host，不并）
  const host = parsed.hostname.replace(/^www\./, '')
  const path = parsed.pathname.replace(/\/+$/, '')
  const segments = path.split('/').filter(Boolean)

  if (segments.length === 4 && segments[0] === 'contest' && segments[2] === 'problem') {
    return `${host}/${segments[1]}/${segments[3].toUpperCase()}`
  }

  if (segments.length === 4 && segments[0] === 'problemset' && segments[1] === 'problem') {
    return `${host}/${segments[2]}/${segments[3].toUpperCase()}`
  }

  return `${host}${path}`
}

/**
 * 工作区里按 url 找回那道题。
 *
 * 刻意同步扫内存里的 tree：扩展拿不定「这道题要不要抓样例」时会回来问一句
 * （见 useCompanionBridge.js 的 cp-query-need），那边等不起一次异步的 VFS 往返。
 * 也不复用 problemImport.js 里那个 findByUrl —— 那个走 vfs.getTree() 且只比字面量，
 * 两道题写成两种地址时它认不出来。
 *
 * @param {string} url
 * @returns {import('./BaseVFSProvider.js').VFSNode|null}
 */
export function findProblemByUrl(url) {
  const key = problemUrlKey(url)
  if (!key) return null

  let found = null
  const walk = (nodes) => {
    for (const node of nodes) {
      if (found) return
      if (node.type === 'file' && problemUrlKey(node.meta?.url) === key) {
        found = node
        return
      }
      if (node.children) walk(node.children)
    }
  }
  walk(workspace.tree)
  return found
}
