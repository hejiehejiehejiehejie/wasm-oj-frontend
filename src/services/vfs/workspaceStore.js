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
import {
  editorPanes,
  fileTabs,
  focusedLeaf,
  hydrate,
  moveTabInPane,
  neighborFileTab,
  paneFocus,
  paneOf,
  placeTab,
  pruneTabs,
  removeTab,
  replaceTab,
} from '../editorPanes.js'
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

/**
 * 原始状态对象。**三个与窗格相关的字段不再是真的数据字段**，而是定义在它上面的访问器
 * （见下面的 defineProperties）：读写都转交给 services/editorPanes.js 的焦点叶子。
 *
 * 访问器必须定义在 `reactive()` **之前**的原始对象上：
 *   · 代理会转发 get / set，属性读取照样进入依赖收集（getter 里读 editorPanes 也会被追踪）；
 *   · 反过来在代理上 defineProperty 会落到目标对象，热更新时还容易重复定义。
 * 这样三十多处 `workspace.activeId = x` 的调用点一行都不用改。
 */
const workspaceState = {
  ready: false,
  /** @type {import('./BaseVFSProvider.js').VFSNode[]} 嵌套树 */
  tree: [],
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
  /** @type {string[]} 展开的目录 id */
  expandedIds: [],
}

Object.defineProperties(workspaceState, {
  /**
   * 打开的文件 id（按窗格内的页签顺序展平）。**只读**：成员与顺序都由 editorPanes 的
   * leaf.tabs 决定，写它会在严格模式下抛错 —— 想改页签请走 openFile / closeTab / moveTab。
   * @type {string[]}
   */
  openTabIds: {
    enumerable: true,
    configurable: true,
    get: () => fileTabs(),
  },
  /**
   * 活跃文件 id = **焦点窗格**的 active。这是全局「正在编辑的文件」的唯一读法。
   *
   * setter 必须做跨窗格路由：回溯 / 全局搜索可能把一个躺在非焦点窗格里的文件写进来，
   * 无脑往当前窗格塞会造出「焦点在 A、文件却在 B 的页签里」的幽灵态。所以先查归属：
   *   · 已在某个窗格 → 先把焦点移过去，再切它的 active；
   *   · 不在任何窗格 → 忽略（正常打开走 openFile，它会先 placeTab）。
   * @type {string|null}
   */
  activeId: {
    enumerable: true,
    configurable: true,
    get: () => focusedLeaf()?.active ?? null,
    set: (value) => {
      const leaf = focusedLeaf()
      if (!leaf) return
      if (value == null) {
        leaf.active = null
        return
      }
      const owner = paneOf(value)
      if (!owner) return
      editorPanes.focusedPaneId = owner.id
      owner.active = value
    },
  },
  /**
   * 预览页签 id（VS Code 式斜体临时页签，**每个窗格至多一个**）。
   *
   * 单击文件树 → 占焦点窗格的预览槽；再单击别的文件就把上一个**顶替**掉（见 openFile 的
   * preview 选项）。双击文件 / 双击页签 / 在预览页签里编辑 → 钉住（归 null，页签转正体）。
   * 刻意**不落 localStorage**：刷新后退化成普通页签，既是无害的降级，也省一处会话恢复分叉
   * （页签本身照旧由 cp.openTabs 恢复）。
   * @type {string|null}
   */
  previewTabId: {
    enumerable: true,
    configurable: true,
    get: () => focusedLeaf()?.preview ?? null,
    set: (value) => {
      const leaf = focusedLeaf()
      if (leaf) leaf.preview = value ?? null
    },
  },
})

export const workspace = reactive(workspaceState)

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
  // 2) 清理指向已删除节点的 tab（release model）。页签现在散在布局树的各个叶子里，
  //    统一交给 editorPanes.pruneTabs：它顺手把失主的 active / preview 按叶子各自修好，
  //    返回被摘掉的文件 id。合成视图不是 VFS 节点，不会被误删。
  const removedTabs = pruneTabs((id) => nodeIndex.has(id))
  for (const id of removedTabs) modelManager.release(id)
  // 3) 选中的节点没了（删掉 / 被移走）：从高亮集合里摘掉那些消失的；主选中若也没了就往下顺
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
  // 页签的成员资格归布局树：启动时先把根叶子灌好，再走 activeId 的正常赋值
  hydrate(restored)

  const savedActive = readJSON(ACTIVE_KEY, null)
  workspace.activeId = restored.includes(savedActive)
    ? savedActive
    : restored[restored.length - 1] ?? null

  // 首次使用（或上次所有 tab 都已失效）：默认打开规范文件 /main.cpp。
  // **本机文件夹工作区里绝不能这么做** —— openLanguage 在一个不存在的路径上建文件，
  // 等于在用户真实目录里凭空造一个 main.cpp（见 capabilities.realFolder）。
  // 「一个文件都没有」要看全库，不能看焦点窗格的 active：允许空窗格之后，
  // 焦点停在空窗格上时 activeId 为 null，但别的窗格可能还开着好几个文件。
  if (workspace.openTabIds.length === 0 && !vfs.capabilities.realFolder) await openLanguage('cpp')

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

// ------------------------------------------------------------ Actions

/**
 * 「用户要看的是一份代码」的注入点：`openFile()` 在两条成功路径上都会调它，把编辑区里的合成
 * 视图（设置 / 抽题 / 比赛）让开。由 `services/editorViews.js` 在模块加载时注册成
 * `deactivateViewsIn`（只让开**目标窗格**的视图）—— 那边 import 本模块，本模块不能反向 import
 * （成环），所以做成注入。
 *
 * 【为什么不能只靠 editorViews 里那条 `watch(activeId)`】那条只在 activeId **变化**时触发。
 * 而「文件树焦点停在一个文件上、屏幕上却是设置页」这种状态里，activeId 早就是那个文件了：
 * 再点一次它，赋值前后是同一个值 → watch 不触发 → 点完还是设置页（2026-10-25 用户报的）。
 * 所以判据不能是「活跃文件变了」，得是「用户表达了看代码的意图」，openFile 正是那个收口点。
 *
 * @type {{show: (() => void)|null}}
 */
export const codeViewIntent = { show: null }

/**
 * 「用户要打开 / 切到这张页签」的注入点（2026-11-16 加，给页签分组用）：`openFile()` 的
 * 两条成功路径与 `setActiveTab()` 在**赋值之后无条件**调一次，包括 activeId 压根没变的情形。
 * 由 `services/tabGroups.js` 在模块加载时注册成「焦点落在被折叠的组里就展开那一组」。
 *
 * 【为什么还要它 —— watch(activeId) 不够】与上面 `codeViewIntent` 同一个洞：watch 只在值
 * **变化**时触发。重复打开同一道题 / 同一个文件时 `openFile` 赋的还是同一个 id，watch 不响；
 * 而「那张页签此刻被折叠藏着」与「activeId 早就指着它」完全可以并存（刷新后从
 * `cp.activeFile` 恢复、或视图像盖着编辑区时焦点一直停在那个文件上）。CF 抽题 / 比赛页
 * 重复导同一道题走的正是这条路（`problemImport` 里明写「已经打开过这道题时 activeId 不变」）。
 * 所以判据落在意图上，与 `codeViewIntent` 同一口径。
 * @type {{show: ((id: string) => void)|null}}
 */
export const focusTabIntent = { show: null }

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
    // 这一支 activeId 很可能**没变**（屏幕上盖着设置页时它早就是这个文件了），所以视图
    // 让位得在这里显式做一次（判据见上面 codeViewIntent）。
    codeViewIntent.show?.(paneOf(id)?.id)
    workspace.activeId = id
    focusTabIntent.show?.(id)
    revealId(id)
    return
  }
  // nodeIndex 由事件异步重建，刚写完的文件可能还没进索引：用调用方给的节点兜底
  const node = nodeIndex.get(id) ?? (nodeHint?.id === id ? nodeHint : null)
  if (!node || node.type !== 'file') throw new Error(t('error.fileNotFound', { path: id }))
  // 落点窗格在**读盘之前**定下来：getModel 是一次真实 await，期间焦点可能已经换到别的窗格
  // （P1 之后）。页签与预览槽都该进「发起这次打开时」的那个窗格，不能跟着焦点漂。
  const targetPane = focusedLeaf()
  // 视图让位放在校验之后：id 不存在时不能顺手把用户正看着的设置页收掉。
  // 这一支 activeId 一定会变（下面那次赋值），editorViews 的 watch 也会兜一次 ——
  // 两条路都走得到，重复调用是无害的（只改视图的 active 标志）。
  codeViewIntent.show?.(targetPane?.id)

  // ① 先把 model 备好，**这一段不许碰任何响应式状态**。
  //
  // getModel 是新文件唯一真正异步的一步（要 vfs.readFile 读正文）。它原先排在
  // 「顶掉旧预览页签」之后，一次 await 就把一次顶替劈成两次渲染：closeTab 引发的
  // 「条带少一格」先落地（Vue 的 flush 是微任务，await 一让出就执行），push 引发的
  // 「条带多一格」后落地。屏幕上于是是旧页签淡出、新页签再淡入；而 EditorTabs 那条
  // 「长度不变 + 只有一处 id 不同 = 预览顶替」的判据两次都不命中（长度分别是 -1、+1），
  // instantSwap 成了死代码。
  // 提到最前面之后，下面整段落在一个同步调用栈里，Vue 只渲染一次。
  await modelManager.getModel(node)

  // 等读盘这期间，同一个文件可能已经被另一次点击打开了（连点两下）：别再 push 一次
  if (workspace.openTabIds.includes(id)) {
    workspace.activeId = id
    focusTabIntent.show?.(id)
    revealId(id)
    return
  }

  modelManager.retain(id)

  // ② 顶替预览槽：**原位换人**，不走 closeTab。
  //
  // closeTab 的语义是「关掉一张页签」，会连带把焦点交给邻居（`handoffLeafFocus` →
  // tabGroups.settleLeafFocus）、往 MRU 记一笔 —— 对顶替来说这两件都是噪声：编辑器会先切到
  // 邻居再切回来（屏幕上闪一下别的文件），条带也多播一次关闭动画。这里只做一件事：这一格
  // 换了个人，长度与位置都不动。
  //
  // 现读**落点窗格**的预览槽（不是 await 之前的快照）：连点两个文件时两次续体依次落地，
  // 各自按当时的槽位接力，最后停下的是最后一次点的那个 —— 比拿 token 丢弃旧请求安全
  //（丢弃时那次已经建好的 model 没 retain 也没进 tabs，会留下无引用的孤儿）。
  // 槽位按窗格隔离之后，隔壁窗格的预览页签不会被这边的单击顶掉。
  const replacedId =
    preview && targetPane && targetPane.preview && targetPane.preview !== id
      ? targetPane.preview
      : null
  const replacedAt = replacedId ? paneOf(replacedId) : null
  if (replacedId && replacedAt === targetPane) {
    // 预览页签理论上是干净的（编辑即钉住，见下面那条 watch），这里只是兜底：
    // 与 closeTab 同一口径 —— 开关开着就先落盘，再释放 model。
    if (isAutoSaveEnabled() && modelManager.isDirty(replacedId)) void modelManager.save(replacedId)
    replaceTab(replacedId, id)
    modelManager.release(replacedId)
  } else {
    placeTab(id, { paneId: targetPane?.id, makeActive: false })
  }
  workspace.activeId = id
  focusTabIntent.show?.(id)
  // 预览槽写在**落点窗格**上：不带窗格的代理写的是「当前焦点」，而焦点可能刚被
  // activeId 的跨窗格路由挪走。
  if (preview && targetPane) targetPane.preview = id
  revealId(id)
}

/**
 * 「这个叶子里的一张页签走了之后，焦点归谁」——**唯一的注入点**。
 *
 * 本模块只负责**摘页签**（`removeTab`）与**释放 model**，它不知道折叠组藏了哪些页签，
 * 也装不下合成视图 id（`activeId` 收的是 VFS 节点 id，视图走 editorViews 自己的 active 标志）。
 * 所以真正的落点交给 `tabGroups.settleLeafFocus()` —— 那边的判据同时覆盖两轴：
 * 可见性（折叠组）、以及「邻居是设置 / Codeforces 时把它点亮」。
 *
 * 一条链只可能有一条结论：
 *   · 关闭激活页签 → `closeTab()` → 这里；
 *   · 把页签拖到别的窗格 → `editorPanes.placeTab()` → `paneFocus.settle`（下面挂的同一个函数）；
 *   · 关掉一张**视图**页签 → `tabFlow.closeTabItem()` 直接调 tabGroups 那一个（那条路上没有
 *     `closeTab`，页签是 `editorViews.closeView()` 摘的，但落点必须一样）。
 *
 * 未注入时（模块加载极早期）退回 `neighborFileTab`：只认文件，行为与改造前一致。
 * @type {{settle: ((leaf: any, removedId: string, index: number) => string|null|undefined)|null}}
 */
export const closeFocus = { settle: null }

/** @param {string} id */
export function closeTab(id) {
  const leaf = paneOf(id)
  if (!leaf) return
  // 下标与「关的是不是这个窗格的 active」都要在摘除**之前**取：摘完数组就右移了，
  // 而多窗格下每片叶子各有一份 active，不能再用全局 activeId 判断。
  const index = leaf.tabs.indexOf(id)
  const wasActive = leaf.active === id
  // 关页签是自动保存的「离开时点」之一：下面 release() 会把 model dispose 掉，之后再读就没正文了。
  // 这里不必 await —— save() 的两个实参（path 与 getValue()）在 await 之前就求值成了字符串，
  // 所以紧跟着 release() 不会把内容弄丢。开关关着时不插手，回到「只认 Ctrl+S」的老行为。
  if (isAutoSaveEnabled() && modelManager.isDirty(id)) void modelManager.save(id)
  removeTab(id)
  modelManager.release(id)
  if (!wasActive) return
  handoffLeafFocus(leaf, id, index)
}

/**
 * 摘掉**激活**页签之后的焦点回退 —— 关页签与「把页签拖到别的窗格」共用这一个出口
 * （后者经 editorPanes.paneFocus 注入进来，见那边的说明）。**只做转发**：判据在
 * `tabGroups.settleLeafFocus()`（它才看得见折叠组与合成视图，见 `closeFocus` 的说明）。
 *
 * `index` 是 splice **之前**取的下标，摘除后它正好指向原来的右邻；`leaf.tabs` 是**本叶子的**
 * 页签序列，折叠组与邻居判定都只在这个窗格内进行。
 *
 * @param {any} leaf 摘除**之后**的叶子
 * @param {string} removedId 被摘走的那张
 * @param {number} index 它在摘除前的位置
 */
function handoffLeafFocus(leaf, removedId, index) {
  if (closeFocus.settle) {
    closeFocus.settle(leaf, removedId, index)
    return
  }
  // 注入还没装上（模块加载早期）才退回默认的「原下标顶上来」（跳过合成视图）
  leaf.active = neighborFileTab(leaf.tabs, index)
}

// 把这份判定交给 editorPanes：跨窗格搬页签时源窗格按同一规则回退焦点
//（那边不能反向 import 本模块，所以是注入）。
paneFocus.settle = handoffLeafFocus

/**
 * 钉住预览页签（转正体）：双击文件树的行、双击页签、或在里面编辑时调用。
 * 不是预览页签时是空操作。
 * @param {string} id
 */
export function pinTab(id) {
  // 按归属叶子清槽：不依赖「此刻焦点正好在这个窗格」这个时序假设
  const leaf = paneOf(id)
  if (leaf && leaf.preview === id) leaf.preview = null
}

/** @param {string} id */
export function setActiveTab(id) {
  if (!workspace.openTabIds.includes(id)) return
  workspace.activeId = id
  // 同上：值没变也要发一次意图（重复点同一张页签时 watch 不响）
  focusTabIntent.show?.(id)
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
  const leaf = paneOf(id)
  if (!leaf) return
  // 顺序真源是 leaf.tabs：只在本窗格内重排，不可能把一个页签挪进别的窗格
  moveTabInPane(leaf.id, id, insertIndex)
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
