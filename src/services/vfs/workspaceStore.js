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

const EXPANDED_KEY = 'cp.vfsExpanded'
const TABS_KEY = 'cp.openTabs'
const ACTIVE_KEY = 'cp.activeFile'

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
  // 3) 预览槽指向的文件没了：清掉，别让下一个文件去顶一个不存在的页签
  if (workspace.previewTabId && !nodeIndex.has(workspace.previewTabId)) {
    workspace.previewTabId = null
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
    // 切页签也是自动保存的「离开时点」：刚离开的那个文件可能还挂着 pending 的 debounce 计时，
    // flush() 会把它连同其它 dirty 一起写盘（没有 dirty 时是空操作）。
    if (workspace.ready) void flush()
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
    workspace.activeId = workspace.openTabIds[Math.min(index, workspace.openTabIds.length - 1)] ?? null
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
