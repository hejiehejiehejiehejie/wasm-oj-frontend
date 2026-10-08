/**
 * LocalFolderVFSProvider —— 「本机文件夹」工作区实现（仅 Tauri 桌面端）。
 *
 * 与 LocalVFSProvider 平级：它把用户的真实目录当工作区，**真源就是磁盘本身**，内存里的
 * 这张表只是 `fs_scan` 的一次快照。上层（workspaceStore / Monaco / 树组件）照旧只面向
 * BaseVFSProvider 的接口，零修改。
 *
 * 【为什么不直接给前端 fs 权限】绝对根只存在 Rust 的 `WorkspaceState` 里，本模块拿到的
 * 也只有相对根的一串 POSIX 相对路径；所有读写都经由 `invoke('fs_*')`（见
 * src-tauri/src/workspace.rs）。前端即使被注入脚本也拼不出根外的路径。
 *
 * 【节点 id 从哪来】root 固定 `'root'`，其余节点的 id 是 sidecar（`.unnamed/ids.json`）
 * 按**相对路径**登记的稳定 uuid（见 workspaceSidecar.js）。id 与路径解耦，是为了让
 * rename / move 只改 path、**不改 id** —— 已打开的页签、Monaco model 与 undo 栈因此
 * 全都不受影响；跨重启也稳定，页签会话才恢复得回来。
 *
 * 【磁盘没有回滚】provider 的每次 mutation 都立刻落盘，`_rollback` 是 no-op。
 * 失败时靠 `refresh()` 重扫对齐内存索引（见 #withDisk / batch 覆写）。
 */
import { invoke } from '@tauri-apps/api/core'
import { BaseVFSProvider } from './BaseVFSProvider.js'
import { t } from '../../i18n/index.js'
import { scanIgnore } from './ignoreRules.js'
import { getWorkspaceRoot } from './workspaceMode.js'
import { assertName, dirname, isWithin, normalize, splitPath } from './paths.js'
import {
  assignId,
  getConfig,
  getMeta,
  initSidecar,
  reconcile,
  removePrefix,
  renamePrefix,
  setConfig as setSidecarConfig,
  setMeta as setSidecarMeta,
} from './workspaceSidecar.js'

/** 根节点的固定 id（与 LocalVFSProvider 一致） */
const ROOT_ID = 'root'

/** Tauri 的 Err 回的是字符串错误码（不是 Error），这里统一取成可读文本 */
function errorText(error) {
  if (error && typeof error === 'object' && 'message' in error) return String(error.message)
  return String(error ?? '')
}

/**
 * 把 Rust 的稳定错误码翻成人话（翻译留在前端，Rust 只回码）。
 * @param {unknown} error
 * @param {{ path?: string, name?: string }} context
 * @returns {string}
 */
function diskMessage(error, context = {}) {
  const code = errorText(error)
  if (code === 'already-exists') return t('error.duplicateName', { name: context.name ?? context.path ?? '' })
  if (code === 'not-found') return t('error.notFound', { path: context.path ?? '' })
  if (code === 'outside-root') return t('error.workspaceOutsideRoot')
  if (code === 'no-root') return t('error.workspaceNoRoot')
  return t('error.workspaceOpenFailed', { message: code })
}

/**
 * 读文件的错误码 → 人话。二进制 / 超大与写路径的口径不同，单独一套。
 * @param {unknown} error
 * @param {string} path
 */
function readMessage(error, path) {
  const code = errorText(error)
  if (code === 'binary') return t('error.workspaceBinary')
  if (code === 'too-large') return t('error.workspaceTooLarge')
  if (code === 'not-found') return t('error.fileNotFound', { path })
  if (code === 'outside-root') return t('error.workspaceOutsideRoot')
  if (code === 'no-root') return t('error.workspaceNoRoot')
  return t('error.workspaceOpenFailed', { message: code })
}

export class LocalFolderVFSProvider extends BaseVFSProvider {
  /** @type {Map<string, import('./BaseVFSProvider.js').VFSNode>} id → 节点 */
  #nodes = new Map()
  /** @type {Map<string, string>} path → id */
  #pathIndex = new Map()
  /** @type {Map<string, Set<string>>} parentId → 子节点 id */
  #childrenIndex = new Map()

  // ------------------------------------------------------------ 初始化与重扫

  async init() {
    const root = getWorkspaceRoot()
    if (!root) throw new Error(t('error.workspaceRootMissing'))

    // 侧车先读：ids.json 决定每个路径的节点 id，扫描时要用
    if (!(await initSidecar())) {
      // 坏 JSON 按空表处理、不阻断启动。重新分配 id 的代价只是上次页签会话失效一次。
      console.warn('[workspace] .unnamed/ids.json 无法解析，已按空表处理')
    }

    // 页面重载 / 应用重启后 Rust 侧的授权状态是空的，把上次记住的路径再递一次重新授权。
    try {
      await invoke('workspace_open', { root })
    } catch (error) {
      throw new Error(t('error.workspaceOpenFailed', { message: errorText(error) }))
    }

    await this.refresh()
  }

  /**
   * 全量重扫授权根、重建内存索引，然后对外发一个 reset（整树重建）。
   * 由 init 与失败恢复调用；第 5 步的文件监听也会自动调它。
   * @returns {Promise<void>}
   */
  async refresh() {
    const report = await invoke('fs_scan', { ignore: scanIgnore() })
    const entries = Array.isArray(report?.nodes) ? report.nodes : []
    // 与侧车对账：新路径分配 uuid、消失的路径回收（外部新建 / 删除在这里被认领）
    const ids = reconcile(entries.map((entry) => entry.rel))

    this.#nodes.clear()
    this.#pathIndex.clear()
    this.#childrenIndex.clear()
    this.#indexNode({
      id: ROOT_ID,
      name: '',
      type: 'directory',
      path: '/',
      parentId: null,
      createdAt: 0,
      updatedAt: 0,
    })

    for (const entry of entries) {
      const path = `/${entry.rel}`
      const id = ids.get(entry.rel) ?? ROOT_ID
      const parentPath = dirname(path)
      const parentRel = parentPath === '/' ? '' : parentPath.slice(1)
      const node = {
        id,
        name: entry.name,
        type: entry.kind === 'directory' ? 'directory' : 'file',
        path,
        parentId: parentPath === '/' ? ROOT_ID : ids.get(parentRel) ?? ROOT_ID,
        createdAt: entry.mtimeMs ?? 0,
        updatedAt: entry.mtimeMs ?? 0,
        size: entry.size,
        mtimeMs: entry.mtimeMs ?? null,
        binary: Boolean(entry.binary),
      }
      // 题目元数据与抓题配置都存在侧车里（磁盘上只有正文），这里按 id 挂回节点
      const meta = getMeta(id)
      if (meta) node.meta = meta
      const config = getConfig(id)
      if (config) node.config = config
      this.#indexNode(node)
    }

    this._emit({ type: 'reset', id: '', path: '/' })
  }

  // ------------------------------------------------------------ 索引维护

  /** @param {import('./BaseVFSProvider.js').VFSNode} node */
  #indexNode(node) {
    const existing = this.#nodes.get(node.id)
    if (existing) {
      this.#pathIndex.delete(existing.path)
      if (existing.parentId) this.#childrenIndex.get(existing.parentId)?.delete(node.id)
    }
    this.#nodes.set(node.id, node)
    this.#pathIndex.set(node.path, node.id)
    if (node.parentId) {
      let set = this.#childrenIndex.get(node.parentId)
      if (!set) {
        set = new Set()
        this.#childrenIndex.set(node.parentId, set)
      }
      set.add(node.id)
    }
  }

  #unindexNode(id) {
    const node = this.#nodes.get(id)
    if (!node) return
    this.#pathIndex.delete(node.path)
    if (node.parentId) this.#childrenIndex.get(node.parentId)?.delete(id)
    this.#nodes.delete(id)
  }

  /** 自身 + 全部后代的 id（前序遍历） */
  #subtree(id, out = []) {
    out.push(id)
    for (const childId of this.#childrenIndex.get(id) ?? []) this.#subtree(childId, out)
    return out
  }

  /** 父目录必须已存在且是目录，返回其 id */
  #requireDirectory(dirPath) {
    const norm = normalize(dirPath)
    const id = this.#pathIndex.get(norm)
    const node = id ? this.#nodes.get(id) : null
    if (!node || node.type !== 'directory') throw new Error(t('error.parentMissing', { path: dirPath }))
    return id
  }

  /**
   * 落盘包装：磁盘操作失败时把内存索引拉回磁盘真相。
   *
   * batch 内失败交给 batch() 统一收尾 —— 此刻发的 reset 会被批次丢弃，
   * 由外层在批次结束后补一次（见下面 batch 覆写）。
   * @template T
   * @param {() => Promise<T>} work
   * @param {{ path?: string, name?: string }} [context]
   * @returns {Promise<T>}
   */
  async #withDisk(work, context) {
    try {
      return await work()
    } catch (error) {
      if (!this._isBatching()) await this.refresh().catch(() => {})
      throw new Error(diskMessage(error, context))
    }
  }

  /**
   * 覆写 batch：磁盘没有回滚，批次失败后**重扫对齐**并把 reset 发出去。
   * （基类在失败批次里会丢弃全部排队事件，所以对齐必须放在批次收尾之后。）
   */
  async batch(exec) {
    try {
      return await super.batch(exec)
    } catch (error) {
      await this.refresh().catch(() => {})
      throw error
    }
  }

  // ------------------------------------------------------------ 读取

  async readFile(path) {
    const id = this.#pathIndex.get(normalize(path))
    const node = id ? this.#nodes.get(id) : null
    if (!node || node.type !== 'file') throw new Error(t('error.fileNotFound', { path }))

    try {
      const result = await invoke('fs_read', { rel: node.path.slice(1) })
      return String(result?.content ?? '')
    } catch (error) {
      throw new Error(readMessage(error, path))
    }
  }

  async stat(path) {
    const id = this.#pathIndex.get(normalize(path))
    const node = id ? this.#nodes.get(id) : null
    return node ? { ...node } : null
  }

  async getTree() {
    const build = (parentId) => {
      const nodes = [...(this.#childrenIndex.get(parentId) ?? [])]
        .map((id) => this.#nodes.get(id))
        .filter(Boolean)
      // 与 LocalVFSProvider 同一套排序：目录在前，同类按名字
      nodes.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      return nodes.map((node) => {
        const clone = { ...node }
        if (node.type === 'directory') clone.children = build(node.id)
        return clone
      })
    }
    return build(ROOT_ID)
  }

  // ------------------------------------------------------------ 写入

  async createFile(path, initialContent = '') {
    const norm = normalize(path)
    if (this.#pathIndex.has(norm)) throw new Error(t('error.alreadyExists', { path: norm }))
    const { dir, name } = splitPath(norm)
    assertName(name)
    const parentId = this.#requireDirectory(dir)
    const text = String(initialContent ?? '')

    const node = await this.#withDisk(async () => {
      const written = await invoke('fs_write', { rel: norm.slice(1), content: text })
      const fresh = {
        id: assignId(norm.slice(1)),
        name,
        type: 'file',
        path: norm,
        parentId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        size: Number(written?.size ?? text.length),
        mtimeMs: written?.mtimeMs ?? null,
        binary: false,
      }
      this.#indexNode(fresh)
      return fresh
    }, { path: norm, name })

    this._emit({ type: 'create', id: node.id, path: norm, node: { ...node } })
    return { ...node }
  }

  async createDirectory(path) {
    const norm = normalize(path)
    if (this.#pathIndex.has(norm)) throw new Error(t('error.alreadyExists', { path: norm }))
    const { dir, name } = splitPath(norm)
    assertName(name)
    const parentId = this.#requireDirectory(dir)

    const node = await this.#withDisk(async () => {
      await invoke('fs_mkdir', { rel: norm.slice(1) })
      const fresh = {
        id: assignId(norm.slice(1)),
        name,
        type: 'directory',
        path: norm,
        parentId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        size: 0,
        mtimeMs: null,
        binary: false,
      }
      this.#indexNode(fresh)
      return fresh
    }, { path: norm, name })

    this._emit({ type: 'create', id: node.id, path: norm, node: { ...node } })
    return { ...node }
  }

  async writeFile(path, content) {
    const norm = normalize(path)
    const id = this.#pathIndex.get(norm)
    const existing = id ? this.#nodes.get(id) : null

    if (!existing) return this.createFile(norm, content)
    if (existing.type !== 'file') throw new Error(t('error.targetIsDirectory', { path: norm }))

    const text = String(content ?? '')
    const node = await this.#withDisk(async () => {
      const written = await invoke('fs_write', { rel: norm.slice(1), content: text })
      const next = {
        ...existing,
        updatedAt: Date.now(),
        size: Number(written?.size ?? text.length),
        mtimeMs: written?.mtimeMs ?? null,
      }
      this.#indexNode(next)
      return next
    }, { path: norm })

    this._emit({ type: 'update', id: node.id, path: norm, node: { ...node } })
    return { ...node }
  }

  // ------------------------------------------------------------ 题目元数据 / 抓题配置

  /**
   * 写题目元数据。**只落侧车**（`.unnamed/meta.json`），不动磁盘上的正文。
   * meta 为 null / 空对象时清除。
   * @param {string} path
   * @param {object|null} meta
   */
  async setMeta(path, meta) {
    const norm = normalize(path)
    const id = this.#pathIndex.get(norm)
    const node = id ? this.#nodes.get(id) : null
    if (!node || node.type !== 'file') throw new Error(t('error.fileNotFound', { path }))

    const next = { ...node, updatedAt: Date.now() }
    // 与 LocalVFSProvider 同一规矩：null / 空对象把字段整个摘掉，不留空壳
    if (meta && Object.keys(meta).length) next.meta = meta
    else delete next.meta

    this.#indexNode(next)
    setSidecarMeta(id, next.meta ?? null)
    this._emit({ type: 'update', id, path: norm, node: { ...next } })
    return { ...next }
  }

  /**
   * 写抓题配置（含 samples）。同样只落侧车（`.unnamed/config.json`），与 meta 各占一个文件。
   * config 为 null / 空对象时清除。
   * @param {string} path
   * @param {object|null} config
   */
  async setConfig(path, config) {
    const norm = normalize(path)
    const id = this.#pathIndex.get(norm)
    const node = id ? this.#nodes.get(id) : null
    if (!node || node.type !== 'file') throw new Error(t('error.fileNotFound', { path }))

    const next = { ...node, updatedAt: Date.now() }
    if (config && Object.keys(config).length) next.config = config
    else delete next.config

    this.#indexNode(next)
    setSidecarConfig(id, next.config ?? null)
    this._emit({ type: 'update', id, path: norm, node: { ...next } })
    return { ...next }
  }

  // ------------------------------------------------------------ 改名 / 删除

  async rename(path, newPath) {
    const norm = normalize(path)
    const target = normalize(newPath)
    const id = this.#pathIndex.get(norm)
    const node = id ? this.#nodes.get(id) : null
    if (!node) throw new Error(t('error.notFound', { path }))
    if (id === ROOT_ID) throw new Error(t('error.rootRename'))
    if (target === norm) return

    const { dir, name } = splitPath(target)
    assertName(name)
    // 不能把目录移进自己的后代
    if (node.type === 'directory' && isWithin(norm, target)) throw new Error(t('error.moveIntoChild'))
    const newParentId = this.#requireDirectory(dir)
    // 真文件夹里重名**拒绝并提示**，不替用户把磁盘上的东西改名
    if (this.#pathIndex.has(target)) throw new Error(t('error.duplicateName', { name }))

    await this.#withDisk(
      () => invoke('fs_rename', { from: norm.slice(1), to: target.slice(1) }),
      { path: norm, name },
    )

    // 磁盘已改：内存索引与 sidecar 各改一次前缀，**节点 id 全部保留**
    const now = Date.now()
    const moved = node.type === 'directory' ? this.#subtree(id) : [id]
    for (const movedId of moved) {
      const old = this.#nodes.get(movedId)
      if (!old) continue
      const suffix = old.path.slice(norm.length) // 自身为空串，后代含开头的 '/'
      const next = { ...old, path: target + suffix, updatedAt: now }
      if (movedId === id) {
        next.name = name
        next.parentId = newParentId
      }
      this.#indexNode(next)
    }
    renamePrefix(norm.slice(1), target.slice(1))

    this._emit({ type: 'reset', id: '', path: '/' })
  }

  async delete(path) {
    const norm = normalize(path)
    const id = this.#pathIndex.get(norm)
    const node = id ? this.#nodes.get(id) : null
    if (!node) throw new Error(t('error.notFound', { path }))
    if (id === ROOT_ID) throw new Error(t('error.rootDelete'))

    await this.#withDisk(
      () => invoke('fs_delete', { rel: norm.slice(1), recursive: node.type === 'directory' }),
      { path: norm },
    )

    for (const deletedId of this.#subtree(id)) this.#unindexNode(deletedId)
    removePrefix(norm.slice(1))

    this._emit({ type: 'reset', id: '', path: '/' })
  }

  get capabilities() {
    // realFolder 让 workspaceStore 避开「在真实磁盘上凭空创建 /main.cpp」这类
    // 只在虚拟工作区成立的动作；watch 到第 5 步接上文件监听后才转 true。
    return { watch: false, persistent: true, remote: false, realFolder: true }
  }
}
