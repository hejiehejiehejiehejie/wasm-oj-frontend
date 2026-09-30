/**
 * LocalVFSProvider —— 本地 VFS 实现。
 *
 * 存储策略：**内存树为真源 + IndexedDB 持久化**。
 * - init() 从 IDB（库 cph-vfs：nodes / contents 两 store）载入全部节点与正文；
 * - 每次 mutation 先改内存索引，再写 IDB；
 * - IDB 不可用 / 打开失败（隐私模式等）→ 自动降级为纯内存：功能不缺，仅刷新丢失。
 *
 * rename / delete 内部统一走 batch：一次事务、一个 reset 事件，
 * 目录改名时后代 id 全部保留（只重算 path），打开的 model 不受影响。
 */
import { BaseVFSProvider } from './BaseVFSProvider.js'
import { t } from '../../i18n/index.js'
import { commitTransaction, openDatabase, withTransaction } from './idb.js'
import { assertName, isWithin, normalize, splitPath } from './paths.js'

const DB_NAME = 'cph-vfs'
const DB_VERSION = 1
const NODES_STORE = 'nodes'
const CONTENTS_STORE = 'contents'
const STORES = [NODES_STORE, CONTENTS_STORE]

/** 生成节点 id：优先原生 UUID，否则随机回退 */
function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

function freshNode({ id, name, type, parentId, path }) {
  const now = Date.now()
  return { id, name, type, parentId, path, createdAt: now, updatedAt: now }
}

export class LocalVFSProvider extends BaseVFSProvider {
  /** @type {Map<string, VFSNode>} */
  #nodes = new Map()
  /** @type {Map<string, string>} id → 文件正文 */
  #contents = new Map()
  /** @type {Map<string, string>} path → id */
  #pathIndex = new Map()
  /** @type {Map<string, Set<string>>} parentId → 子节点 id */
  #childrenIndex = new Map()
  /** @type {IDBDatabase | null} */
  #db = null

  // batch 的待写内容
  #pending = { puts: new Map(), deletes: new Set() }
  /** @type {{ nodes: Map<string, VFSNode>, contents: Map<string, string> } | null} */
  #snapshot = null

  // ------------------------------------------------------------ 初始化

  async init() {
    this.#db = await openDatabase(DB_NAME, DB_VERSION, (db) => {
      if (!db.objectStoreNames.contains(NODES_STORE)) db.createObjectStore(NODES_STORE, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(CONTENTS_STORE)) db.createObjectStore(CONTENTS_STORE, { keyPath: 'id' })
    })

    if (this.#db) {
      const nodeRecords = await withTransaction(this.#db, [NODES_STORE], 'readonly', (tx) =>
        tx.objectStore(NODES_STORE).getAll(),
      )
      const contentRecords = await withTransaction(this.#db, [CONTENTS_STORE], 'readonly', (tx) =>
        tx.objectStore(CONTENTS_STORE).getAll(),
      )
      for (const node of nodeRecords ?? []) if (node && typeof node.path === 'string') this.#indexNode(node)
      for (const record of contentRecords ?? []) this.#contents.set(record.id, String(record.content ?? ''))
    }

    if (!this.#nodes.has('root')) {
      this.#indexNode({
        id: 'root',
        name: '',
        type: 'directory',
        path: '/',
        parentId: null,
        createdAt: 0,
        updatedAt: 0,
      })
    }
  }

  // ------------------------------------------------------------ 索引维护

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

  /** @param {string} id @param {string[]} [out] */
  #collectSubtree(id, out = []) {
    out.push(id)
    for (const childId of this.#childrenIndex.get(id) ?? []) this.#collectSubtree(childId, out)
    return out
  }

  // ------------------------------------------------------------ 读取

  async readFile(path) {
    const id = this.#pathIndex.get(normalize(path))
    const node = id ? this.#nodes.get(id) : null
    if (!node || node.type !== 'file') throw new Error(t('error.fileNotFound', { path }))
    return this.#contents.get(id) ?? ''
  }

  async stat(path) {
    const id = this.#pathIndex.get(normalize(path))
    const node = id ? this.#nodes.get(id) : null
    return node ? { ...node } : null
  }

  async getTree() {
    const build = (parentId) => {
      const ids = [...(this.#childrenIndex.get(parentId) ?? [])]
      const nodes = ids.map((id) => this.#nodes.get(id)).filter(Boolean)
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
    return build('root')
  }

  // ------------------------------------------------------------ 写入

  async createFile(path, initialContent = '') {
    const norm = normalize(path)
    if (this.#pathIndex.has(norm)) throw new Error(t('error.alreadyExists', { path: norm }))
    const { dir, name } = splitPath(norm)
    assertName(name)
    const parentId = this.#requireDirectory(dir)
    this.#assertSiblingFree(parentId, name)

    const node = freshNode({ id: newId(), name, type: 'file', parentId, path: norm })
    const text = String(initialContent ?? '')
    this.#indexNode(node)
    this.#contents.set(node.id, text)
    await this.#schedulePut(node, text)
    this._emit({ type: 'create', id: node.id, path: norm, node })
    return { ...node }
  }

  async createDirectory(path) {
    const norm = normalize(path)
    if (this.#pathIndex.has(norm)) throw new Error(`已存在：${norm}`)
    const { dir, name } = splitPath(norm)
    assertName(name)
    const parentId = this.#requireDirectory(dir)
    this.#assertSiblingFree(parentId, name)

    const node = freshNode({ id: newId(), name, type: 'directory', parentId, path: norm })
    this.#indexNode(node)
    await this.#schedulePut(node, null)
    this._emit({ type: 'create', id: node.id, path: norm, node })
    return { ...node }
  }

  async writeFile(path, content) {
    const norm = normalize(path)
    const id = this.#pathIndex.get(norm)
    const existing = id ? this.#nodes.get(id) : null

    if (!existing) {
      // 「新建或覆盖」：文件不存在时等价 createFile
      return this.createFile(norm, content)
    }
    if (existing.type !== 'file') throw new Error(t('error.targetIsDirectory', { path: norm }))

    const text = String(content ?? '')
    const node = { ...existing, updatedAt: Date.now() }
    this.#indexNode(node)
    this.#contents.set(id, text)
    await this.#schedulePut(node, text)
    this._emit({ type: 'update', id, path: norm, node })
    return { ...node }
  }

  /**
   * 写题目元数据；content 传 null 表示只动 nodes store、不碰正文。
   * @param {string} path
   * @param {import('./BaseVFSProvider.js').VFSNodeMeta|null} meta
   */
  async setMeta(path, meta) {
    const norm = normalize(path)
    const id = this.#pathIndex.get(norm)
    const node = id ? this.#nodes.get(id) : null
    if (!node || node.type !== 'file') throw new Error(t('error.fileNotFound', { path }))

    const next = { ...node, updatedAt: Date.now() }
    // meta 为 null / 空对象时把字段整个摘掉，不在节点上留空壳
    if (meta && Object.keys(meta).length) next.meta = meta
    else delete next.meta

    this.#indexNode(next)
    await this.#schedulePut(next, null)
    this._emit({ type: 'update', id, path: norm, node: next })
    return { ...next }
  }

  /**
   * 写抓题配置（含样例）；与 setMeta 各占一个字段，互不覆盖。
   * content 传 null 表示只动 nodes store、不碰正文。
   * @param {string} path
   * @param {Record<string, unknown>|null} config
   */
  async setConfig(path, config) {
    const norm = normalize(path)
    const id = this.#pathIndex.get(norm)
    const node = id ? this.#nodes.get(id) : null
    if (!node || node.type !== 'file') throw new Error(t('error.fileNotFound', { path }))

    const next = { ...node, updatedAt: Date.now() }
    // 与 setMeta 同一规矩：null / 空对象把字段整个摘掉，不留空壳
    if (config && Object.keys(config).length) next.config = config
    else delete next.config

    this.#indexNode(next)
    await this.#schedulePut(next, null)
    this._emit({ type: 'update', id, path: norm, node: next })
    return { ...next }
  }

  // ------------------------------------------------------------ 改名 / 删除

  async rename(path, newPath) {
    return this.#inBatch(() => this.#renameInBatch(path, newPath))
  }

  async delete(path) {
    return this.#inBatch(() => this.#deleteInBatch(path))
  }

  /** 内部包一层 batch：单事务落库、对外只发一次 reset */
  async #inBatch(work) {
    if (this._isBatching()) return work()
    return this.batch(work)
  }

  #renameInBatch(path, newPath) {
    const norm = normalize(path)
    const target = normalize(newPath)
    const id = this.#pathIndex.get(norm)
    const node = id ? this.#nodes.get(id) : null
    if (!node) throw new Error(t('error.notFound', { path }))
    if (id === 'root') throw new Error(t('error.rootRename'))
    if (target === norm) return
    // 不能把目录移进自己的后代
    if (node.type === 'directory' && isWithin(norm, target)) throw new Error(t('error.moveIntoChild'))

    const { dir, name } = splitPath(target)
    assertName(name)
    const newParentId = this.#requireDirectory(dir)
    if (newParentId !== node.parentId || name !== node.name) this.#assertSiblingFree(newParentId, name, id)

    const now = Date.now()
    const updated = { ...node, name, parentId: newParentId, path: target, updatedAt: now }
    this.#indexNode(updated)
    this.#queuePendingPut(updated, null)

    if (node.type === 'directory') {
      for (const descendantId of this.#collectSubtree(id)) {
        if (descendantId === id) continue
        const oldNode = this.#nodes.get(descendantId)
        const suffix = oldNode.path.slice(norm.length) // 含开头的 '/'
        const descendant = { ...oldNode, path: target + suffix, updatedAt: now }
        this.#indexNode(descendant)
        this.#queuePendingPut(descendant, null)
      }
    }
  }

  #deleteInBatch(path) {
    const norm = normalize(path)
    const id = this.#pathIndex.get(norm)
    if (!id) throw new Error(t('error.notFound', { path }))
    if (id === 'root') throw new Error(t('error.rootDelete'))

    const ids = this.#collectSubtree(id)
    this.#ensureSnapshot()
    for (const did of ids) {
      this.#unindexNode(did)
      this.#contents.delete(did)
      this.#pending.puts.delete(did)
      this.#pending.deletes.add(did)
    }
  }

  // ------------------------------------------------------------ 持久化调度

  /**
   * 非 batch：立即落库；batch：入队，由 _commit 一次提交。
   * content 为 null 表示只更新元数据。
   */
  async #schedulePut(node, content) {
    if (this._isBatching()) {
      this.#queuePendingPut(node, content)
      return
    }
    await this.#persistPuts([{ node, content }])
  }

  #queuePendingPut(node, content) {
    this.#ensureSnapshot()
    const previous = this.#pending.puts.get(node.id)
    this.#pending.puts.set(node.id, {
      node,
      content: content !== null ? content : previous?.content ?? null,
    })
  }

  async _commit() {
    const puts = [...this.#pending.puts.values()]
    const deletes = [...this.#pending.deletes]
    this.#snapshot = null
    this.#pending = { puts: new Map(), deletes: new Set() }
    if (!this.#db || (!puts.length && !deletes.length)) return

    await commitTransaction(this.#db, STORES, 'readwrite', (tx) => {
      const nodesStore = tx.objectStore(NODES_STORE)
      const contentsStore = tx.objectStore(CONTENTS_STORE)
      for (const { node, content } of puts) {
        const { children: _children, ...metadata } = node
        nodesStore.put(metadata)
        if (content !== null) contentsStore.put({ id: node.id, content })
      }
      for (const deletedId of deletes) {
        nodesStore.delete(deletedId)
        contentsStore.delete(deletedId)
      }
    })
  }

  async _rollback() {
    if (this.#snapshot) {
      this.#nodes = new Map([...this.#snapshot.nodes].map(([id, node]) => [id, { ...node }]))
      this.#contents = new Map(this.#snapshot.contents)
      this.#pathIndex = new Map()
      this.#childrenIndex = new Map()
      for (const node of this.#nodes.values()) {
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
    }
    this.#snapshot = null
    this.#pending = { puts: new Map(), deletes: new Set() }
  }

  /** 立即写一批（非 batch 的单条 mutation） */
  async #persistPuts(puts) {
    if (!this.#db) return
    await commitTransaction(this.#db, STORES, 'readwrite', (tx) => {
      const nodesStore = tx.objectStore(NODES_STORE)
      const contentsStore = tx.objectStore(CONTENTS_STORE)
      for (const { node, content } of puts) {
        const { children: _children, ...metadata } = node
        nodesStore.put(metadata)
        if (content !== null) contentsStore.put({ id: node.id, content })
      }
    })
  }

  #ensureSnapshot() {
    if (this.#snapshot) return
    this.#snapshot = {
      nodes: new Map([...this.#nodes].map(([id, node]) => [id, { ...node }])),
      contents: new Map(this.#contents),
    }
  }

  // ------------------------------------------------------------ 校验辅助

  /** 目录路径必须存在，返回其 id */
  #requireDirectory(dirPath) {
    const id = this.#pathIndex.get(normalize(dirPath))
    const node = id ? this.#nodes.get(id) : null
    if (!node || node.type !== 'directory') throw new Error(t('error.parentMissing', { path: dirPath }))
    return id
  }

  /** 同目录下名字必须唯一（rename 时排除自身） */
  #assertSiblingFree(parentId, name, exceptId = null) {
    for (const siblingId of this.#childrenIndex.get(parentId) ?? []) {
      if (siblingId === exceptId) continue
      if (this.#nodes.get(siblingId)?.name === name) {
        throw new Error(t('error.duplicateName', { name }))
      }
    }
  }

  get capabilities() {
    return { watch: true, persistent: this.#db !== null, remote: false }
  }
}
