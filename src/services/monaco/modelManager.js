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
 */

class ModelManager {
  /** @type {Map<string, ModelEntry>} */
  #entries = new Map()
  /** 当前未保存的文件 id（响应式，供标签圆点 / 文件树使用） */
  dirtyIds = reactive(new Set())

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
      this.#entries.set(node.id, { model: registered, node, refs: 0 })
      return registered
    }

    const content = await vfs.readFile(node.path)
    const model = monaco.editor.createModel(content, languageForPath(node.path), uri)
    model.onDidChangeContent(() => {
      this.dirtyIds.add(node.id)
    })
    this.#entries.set(node.id, { model, node, refs: 0 })
    return model
  }

  /**
   * 同步节点元数据（改名后 store 用事件里的新 node 调用）。
   * 若扩展名随改名变化，同步切换 model 语言。
   * @param {import('../vfs/BaseVFSProvider.js').VFSNode} node
   */
  syncNode(node) {
    const entry = this.#entries.get(node.id)
    if (!entry) return
    const previousPath = entry.node.path
    entry.node = node
    const previousLanguage = languageForPath(previousPath)
    const nextLanguage = languageForPath(node.path)
    if (previousLanguage !== nextLanguage) entry.model.setLanguage(nextLanguage)
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
    }
  }

  /** @param {string} fileId @returns {boolean} */
  isDirty(fileId) {
    return this.dirtyIds.has(fileId)
  }

  /**
   * 保存单个文件：model 正文写回 VFS，清 dirty。
   * @param {string} fileId
   */
  async save(fileId) {
    const entry = this.#entries.get(fileId)
    if (!entry) return
    await getVFS().writeFile(entry.node.path, entry.model.getValue())
    this.dirtyIds.delete(fileId)
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
