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
import { modelManager } from '../monaco/modelManager.js'
import { languageForPath } from '../monaco/language.js'
import { defaultCode } from '../templates.js'
import { basename, join, normalize } from './paths.js'
import { uniqueNameIn } from './treeOps.js'
import { getVFS } from './vfsFactory.js'

const EXPANDED_KEY = 'cph.vfsExpanded'
const TABS_KEY = 'cph.openTabs'
const ACTIVE_KEY = 'cph.activeFile'

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

// ------------------------------------------------------------ UI 过滤

/**
 * 文件树里不显示的目录名。
 *
 * `.cph` 是导入题目的元数据目录（见 problemImport.js）：每道题一个与代码同名的 json，
 * 由工具自己维护，用户既不该编辑也不该删，摆在树里纯是干扰。
 * 代码文件本身不在这里 —— 它直接叫题目名，就摆在 OJ 目录下。
 *
 * 只过滤「交给 UI 的那棵树」——provider 的接口、nodeIndex、下面的清死 tab 逻辑一概照旧，
 * 读写 .cph 下的元数据完全不受影响。
 */
const HIDDEN_DIR_NAMES = new Set(['.cph'])

/**
 * 递归剔除隐藏目录及其内容。
 * 只摘目录：`.cph` 是个目录名，同名文件不在约定内，不必顺带处理。
 *
 * 返回值的引用规矩：这棵子树**一点没动**就原样返回入参（同一引用），父层靠它判断自己
 * 要不要换新对象；动了才返回新数组。判据是 `changed`，而它必须**同时**涵盖两种情况：
 *   1. 本层直接摘掉了节点；
 *   2. 某个子节点被换成了新对象（说明更深的地方动过）。
 * 只认第 1 种（或改比长度）都会漏：`.cph` 在两层之下，中间层自己一个节点没摘、
 * children 长度也没变，于是父层拿到「没变」的错误结论，继续挂着那份未过滤的旧子树，
 * `.cph` 就照旧显示出来。
 *
 * @param {import('./BaseVFSProvider.js').VFSNode[]} nodes
 * @returns {import('./BaseVFSProvider.js').VFSNode[]}
 */
function withoutHiddenDirs(nodes) {
  let changed = false
  const visible = []
  for (const node of nodes) {
    if (node.type === 'directory' && HIDDEN_DIR_NAMES.has(node.name)) {
      changed = true
      continue
    }
    if (!node.children) {
      visible.push(node)
      continue
    }
    const children = withoutHiddenDirs(node.children)
    if (children === node.children) {
      // 子树没变，沿用原对象（保持引用稳定，避免整棵树无谓换新）
      visible.push(node)
    } else {
      changed = true
      visible.push({ ...node, children })
    }
  }
  return changed ? visible : nodes
}

// ------------------------------------------------------------ 事件 → tree

/**
 * 从 provider 重建整树，并维护索引。
 * （本项目中 rename/delete 一律聚合为 reset；create/update 重建也无歧义、无开销问题。）
 */
async function rebuildTree() {
  const vfs = getVFS()
  const rawTree = await vfs.getTree()
  // 索引与清死 tab 继续看全量原始树，只有渲染用的这棵树摘掉隐藏目录
  workspace.tree = withoutHiddenDirs(rawTree)

  // 原地更新响应式 Map（保持同一个对象，触发依赖它的 tab / 树重渲染）
  nodeIndex.clear()
  // getTree 只返回根的子节点；把根本身也放进索引，供根级新建时取父路径
  try {
    const rootNode = await vfs.stat('/')
    if (rootNode) nodeIndex.set('root', rootNode)
  } catch {
    /* 取不到根也不阻塞树 */
  }
  const walk = (nodes) => {
    for (const node of nodes) {
      nodeIndex.set(node.id, node)
      if (node.children) walk(node.children)
    }
  }
  walk(rawTree)

  // 1) 同步存活 model 的最新节点元数据（改名后 path 变了）
  for (const id of workspace.openTabIds) {
    const node = nodeIndex.get(id)
    if (node) modelManager.syncNode(node)
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

  // 首次使用（或上次所有 tab 都已失效）：默认打开规范文件 /main.cpp
  if (!workspace.activeId) await openLanguage('cpp')

  workspace.ready = true
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
  },
)
watch(
  () => [...workspace.expandedIds],
  (value) => writeJSON(EXPANDED_KEY, value),
  { deep: true },
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
 * @param {string} id
 */
export async function openFile(id, nodeHint = null) {
  if (workspace.openTabIds.includes(id)) {
    workspace.activeId = id
    revealId(id)
    return
  }
  // nodeIndex 由事件异步重建，刚写完的文件可能还没进索引：用调用方给的节点兜底
  const node = nodeIndex.get(id) ?? (nodeHint?.id === id ? nodeHint : null)
  if (!node || node.type !== 'file') throw new Error(t('error.fileNotFound', { path: id }))
  await modelManager.getModel(node)
  modelManager.retain(id)
  workspace.openTabIds.push(id)
  workspace.activeId = id
  revealId(id)
}

/** @param {string} id */
export function closeTab(id) {
  const index = workspace.openTabIds.indexOf(id)
  if (index === -1) return
  workspace.openTabIds.splice(index, 1)
  modelManager.release(id)
  if (workspace.activeId === id) {
    workspace.activeId = workspace.openTabIds[Math.min(index, workspace.openTabIds.length - 1)] ?? null
  }
}

/** @param {string} id */
export function setActiveTab(id) {
  if (workspace.openTabIds.includes(id)) workspace.activeId = id
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
  const name = await uniqueNameIn(vfs, targetDirPath, basename(path), type)
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
