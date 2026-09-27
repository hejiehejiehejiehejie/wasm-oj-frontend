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
import { modelManager } from '../monaco/modelManager.js'
import { languageForPath } from '../monaco/language.js'
import { defaultCode } from '../templates.js'
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

// ------------------------------------------------------------ 事件 → tree

/**
 * 从 provider 重建整树，并维护索引。
 * （本项目中 rename/delete 一律聚合为 reset；create/update 重建也无歧义、无开销问题。）
 */
async function rebuildTree() {
  const vfs = getVFS()
  workspace.tree = await vfs.getTree()

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
  walk(workspace.tree)

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
  if (!node || node.type !== 'file') throw new Error(`文件不存在：${id}`)
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
 * 删除（调用方负责先做确认弹窗）。
 * @param {string} path
 */
export async function deleteNode(path) {
  await getVFS().delete(path)
  // tab 清理由 reset 事件里的 rebuildTree 完成
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
