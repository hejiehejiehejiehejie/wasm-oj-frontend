/**
 * ModelManager —— Monaco ITextModel 的全局注册表。
 *
 * 分屏/多标签场景下的铁律：**一个文件一个 model**，N 个编辑器挂同一个 model；
 * 输入实时互见，光标与滚动由各编辑器自己保存（ICodeEditorViewState）。
 *
 * - model URI = vfs://file/<fileId>：与 path 解耦，文件改名不重建 model，
 *   撤销历史与同行状态全部保留；
 * - retain/release 做引用计数（计数 = 全局打开该文件的 tab 数），归零立即 dispose；
 * - 每个 model 只挂一次内容监听，维护响应式 dirty 集合；
 * - save/saveAll 把 model 正文写回 VFS 后清 dirty。
 */
import * as monaco from 'monaco-editor'
import { reactive } from 'vue'
import { t } from '../../i18n/index.js'
import { getVFS } from '../vfs/vfsFactory.js'
import { languageForPath } from './language.js'

const URI_PREFIX = 'vfs://file/'

/**
 * @typedef {Object} ModelEntry
 * @property {import('monaco-editor').ITextModel} model
 * @property {import('../vfs/BaseVFSProvider.js').VFSNode} node
 * @property {number} refs
 * @property {number|null} diskMtimeMs 上一次见到的磁盘 mtime（本机文件夹工作区用来认外部改写）
 * @property {boolean} silent 正在程序化写入正文：这次内容变化不算用户的编辑
 */

class ModelManager {
  /** @type {Map<string, ModelEntry>} */
  #entries = new Map()
  /** 当前未保存的文件 id（响应式，供标签圆点 / 文件树使用） */
  dirtyIds = reactive(new Set())
  /**
   * 「磁盘上的内容变过、但本地还有没保存的改动」的文件 id（响应式，供页签上的琥珀点）。
   * 只在本机文件夹工作区可能出现：外部编辑器改了同一个文件，而用户这里的缓冲还没落盘。
   * 用户一保存（缓冲覆盖磁盘）就清掉。
   */
  staleIds = reactive(new Set())
  /**
   * 编辑事件订阅者（自动保存用，见 services/autoSave.js）。
   *
   * 刻意做成「向外登记回调」而不是让 modelManager 去 import autoSave：那样会成环
   * （autoSave 需要 saveAll，modelManager 需要 autoSave 的通知）。回调是运行时读集合，
   * 所以订阅时机与 model 何时创建无关。
   * @type {Set<(fileId: string) => void>}
   */
  #editListeners = new Set()

  /**
   * 订阅「正文被改动」（每个 tab 的每次输入都会调）。
   * @param {(fileId: string) => void} listener
   * @returns {() => void} 退订
   */
  onDidEdit(listener) {
    this.#editListeners.add(listener)
    return () => this.#editListeners.delete(listener)
  }

  /**
   * 获取（必要时创建）文件的 model。调用方随后须 {@link ModelManager#retain}。
   * @param {import('../vfs/BaseVFSProvider.js').VFSNode} node
   * @returns {Promise<import('monaco-editor').ITextModel>}
   */
  async getModel(node) {
    const existing = this.#entries.get(node.id)
    if (existing) {
      existing.node = node
      return existing.model
    }

    const uri = monaco.Uri.parse(URI_PREFIX + node.id)
    // 极端情况下 URI 已被 Monaco 登记（热重建），直接复用，避免 createModel 抛错
    const registered = monaco.editor.getModel(uri)
    const vfs = getVFS()

    if (registered) {
      registered.setLanguage(languageForPath(node.path))
      this.#entries.set(node.id, {
        model: registered,
        node,
        refs: 0,
        // 正文刚从磁盘读进来，此刻的 mtime 就是基准 —— 之后它变了才叫「外部改写」
        diskMtimeMs: node.mtimeMs ?? null,
        silent: false,
      })
      return registered
    }

    const content = await vfs.readFile(node.path)
    const model = monaco.editor.createModel(content, languageForPath(node.path), uri)
    const entry = {
      model,
      node,
      refs: 0,
      diskMtimeMs: node.mtimeMs ?? null,
      silent: false,
    }
    this.#entries.set(node.id, entry)
    model.onDidChangeContent(() => {
      // 程序化替换正文（外部改写的同步）也会走到这里，但那不是用户的编辑
      if (entry.silent) return
      this.dirtyIds.add(node.id)
      for (const listener of this.#editListeners) listener(node.id)
    })
    return model
  }

  /**
   * 用最新的节点元数据对齐 model：改名（路径 / 语言）与**磁盘版本**都走这里。
   *
   * 磁盘版本分三种情形：
   * - mtime 没变：什么都不做（绝大多数调用）；
   * - mtime 变了、缓冲是干净的：直接以磁盘正文替换 model —— 外部编辑器的改动照单全收；
   * - mtime 变了、缓冲里有没保存的内容：**保留用户缓冲**，只把页签标成 stale，
   *   等用户保存时由缓冲覆盖磁盘（见 save）。绝不静默丢掉用户敲进去的东西。
   *
   * @param {import('../vfs/BaseVFSProvider.js').VFSNode} node
   * @returns {Promise<void>}
   */
  async syncNode(node) {
    const entry = this.#entries.get(node.id)
    if (!entry) return
    const previousPath = entry.node.path
    entry.node = node
    const previousLanguage = languageForPath(previousPath)
    const nextLanguage = languageForPath(node.path)
    if (previousLanguage !== nextLanguage) entry.model.setLanguage(nextLanguage)

    const nextMtime = node.mtimeMs ?? null
    const previousMtime = entry.diskMtimeMs ?? null
    if (nextMtime === null || nextMtime === previousMtime) return
    const firstSighting = previousMtime === null
    entry.diskMtimeMs = nextMtime
    // 首次登记（本机制之前建的 model）只记基准，不当作外部改写
    if (firstSighting) return

    // mtime 变了不见得真的有冲突：我们自己那次保存落盘也会推一个事件，而它可能比
    // save() 的续体先到。所以先读一次磁盘、与缓冲比一比，再决定是「冲突」还是「回声」。
    const content = await getVFS().readFile(node.path)
    if (entry.model.getValue() === content) {
      // 磁盘 == 缓冲：没有可保护的内容，顺手把可能残留的标记清掉
      this.staleIds.delete(node.id)
      return
    }
    if (this.dirtyIds.has(node.id)) {
      // 有没保存的内容：保留用户缓冲，只标记「磁盘已变更」，保存时由缓冲覆盖磁盘
      this.staleIds.add(node.id)
      return
    }
    this.#replaceContent(entry, content)
  }

  /**
   * 程序化替换 model 正文。走 `silent` 闸门：`onDidChangeContent` 里不记 dirty、
   * 也不通知自动保存 —— 否则「外部改一次」会被当成用户编辑，转手又写回磁盘。
   * @param {ModelEntry} entry
   * @param {string} content
   */
  #replaceContent(entry, content) {
    entry.silent = true
    try {
      entry.model.setValue(content)
    } finally {
      entry.silent = false
    }
  }

  /**
   * 引用计数 +1：打开一个 tab 调一次。
   * @param {string} fileId
   */
  retain(fileId) {
    const entry = this.#entries.get(fileId)
    if (!entry) throw new Error(t('error.retainFailed', { id: fileId }))
    entry.refs += 1
  }

  /**
   * 引用计数 −1：关闭一个 tab 调一次；归零销毁 model。
   * @param {string} fileId
   */
  release(fileId) {
    const entry = this.#entries.get(fileId)
    if (!entry) return
    entry.refs -= 1
    if (entry.refs <= 0) {
      entry.model.dispose()
      this.#entries.delete(fileId)
      this.dirtyIds.delete(fileId)
      this.staleIds.delete(fileId)
    }
  }

  /** @param {string} fileId @returns {boolean} */
  isDirty(fileId) {
    return this.dirtyIds.has(fileId)
  }

  /**
   * 磁盘上的正文变过、而本地还有没保存的改动？页签据此提示「磁盘已变更」。
   * @param {string} fileId
   * @returns {boolean}
   */
  isStale(fileId) {
    return this.staleIds.has(fileId)
  }

  /**
   * 保存单个文件：model 正文写回 VFS，清 dirty。
   *
   * 顺手把磁盘基准 mtime 推进到这次写入的结果上 —— 这笔写入本身会触发一次监听事件
   * （Rust 侧 400ms 抑制窗之外的漏网之鱼），不更新基准就会被自己误判成「外部改写」。
   * stale 也在这里清掉：缓冲已覆盖磁盘，冲突解除了。
   * @param {string} fileId
   */
  async save(fileId) {
    const entry = this.#entries.get(fileId)
    if (!entry) return
    const node = await getVFS().writeFile(entry.node.path, entry.model.getValue())
    if (node) {
      entry.node = node
      entry.diskMtimeMs = node.mtimeMs ?? entry.diskMtimeMs
    }
    this.dirtyIds.delete(fileId)
    this.staleIds.delete(fileId)
  }

  /**
   * 保存全部 dirty 文件（运行前自动保存走这里）。
   * @returns {Promise<void>}
   */
  async saveAll() {
    const ids = [...this.dirtyIds]
    if (!ids.length) return
    await Promise.all(ids.map((id) => this.save(id)))
  }

  /**
   * 同步取已登记 model；model 尚未创建（无打开的 tab）→ null。
   * @param {string} fileId
   * @returns {import('monaco-editor').ITextModel | null}
   */
  getExistingModel(fileId) {
    return this.#entries.get(fileId)?.model ?? null
  }

  /**
   * 同步取已登记 model 的正文；model 尚未建（无打开的 tab）→ null。
   * @param {string} fileId
   * @returns {string|null}
   */
  peekValue(fileId) {
    return this.#entries.get(fileId)?.model.getValue() ?? null
  }

  /** 当前登记的文件 id（验收探针用） @returns {string[]} */
  listOpenModelIds() {
    return [...this.#entries.keys()]
  }
}

/** @type {ModelManager} */
export const modelManager = new ModelManager()
