import { t } from '../../i18n/index.js'

/**
 * IVFSProvider —— 虚拟文件系统的抽象接口（VFS Adapter Pattern）。
 *
 * 界面与 Monaco 逻辑只面向本接口，不关心文件存在 IndexedDB、内存还是远端。
 * 未来接入 GitHub / 自研后端时新增一个子类即可，上层零修改。
 *
 * 本文件同时承载：
 * - 全部 VFS 相关的 JSDoc typedef（接口契约）；
 * - 事件发射器与 batch 的默认编排，子类只需实现存储细节。
 */

/**
 * @typedef {Object} VFSNode
 * @property {string} id                 不透明身份；root 固定 'root'，其余由工厂生成
 * @property {string} name               单级名称，不含 '/'
 * @property {'file'|'directory'} type
 * @property {string} path               标准 POSIX 绝对路径，如 '/src/main.cpp'
 * @property {string|null} parentId
 * @property {number} createdAt
 * @property {number} updatedAt
 * @property {VFSNodeMeta} [meta]        题目元数据（仅文件；见 problemMeta.js）
 * @property {Record<string, unknown>} [config] 抓题时的原始配置（含 samples 样例等；仅文件）
 * @property {VFSNode[]} [children]      仅 getTree() 的返回里组装；存储层不维护
 */

/**
 * @typedef {Object} VFSNodeMeta
 * @property {string} [url]        题目链接
 * @property {string} [oj]         OJ 的 id（problemMeta.js 的 OJ_LIST）
 * @property {string} [difficulty] 难度：分数段 / 洛谷等级 id / 自由文本，由 OJ 决定口径
 * @property {string} [date]       做题日期，YYYY-MM-DD
 */

/**
 * @typedef {'create'|'update'|'delete'|'reset'} VFSChangeType
 * @typedef {Object} VFSChangeEvent
 * @property {VFSChangeType} type  reset = 批量 / 迁移 / 远端全量同步后，UI 整树重建
 * @property {string} id
 * @property {string} path
 * @property {VFSNode} [node]
 */

/**
 * @typedef {Object} VFSCapabilities
 * @property {boolean} watch       是否对外发出变更事件
 * @property {boolean} persistent  刷新后数据是否保留
 * @property {boolean} remote      是否为远端存储
 */

/**
 * @typedef {(event: VFSChangeEvent) => void} VFSChangeListener
 */

/** 惰性取：模块求值那一刻还不能 t()，否则会定格在首帧语言 */
const notImplemented = () => t('error.notImplemented')

export class BaseVFSProvider {
  /** @type {Set<VFSChangeListener>} */
  #listeners = new Set()
  /** @type {VFSChangeEvent[]} */
  #queuedEvents = []
  #batchDepth = 0

  // ------------------------------------------------------------ 生命周期与读写

  /**
   * 打开存储并载入全量节点。首次调用时由上层注入种子（见各子类）。
   * @returns {Promise<void>}
   */
  async init() {
    throw new Error(notImplemented())
  }

  /**
   * @param {string} path
   * @returns {Promise<string>}
   */
  async readFile(path) {
    throw new Error(notImplemented())
  }

  /**
   * 新建或覆盖文件内容；父目录必须已存在。
   * @param {string} path
   * @param {string} content
   * @returns {Promise<VFSNode>}
   */
  async writeFile(path, content) {
    throw new Error(notImplemented())
  }

  /**
   * @param {string} path
   * @param {string} [initialContent]
   * @returns {Promise<VFSNode>}
   */
  async createFile(path, initialContent = '') {
    throw new Error(notImplemented())
  }

  /**
   * @param {string} path
   * @returns {Promise<VFSNode>}
   */
  async createDirectory(path) {
    throw new Error(notImplemented())
  }

  /**
   * 改名 / 移动；目录则整棵子树移动（后代 id 不变）。
   * @param {string} path
   * @param {string} newPath
   * @returns {Promise<void>}
   */
  async rename(path, newPath) {
    throw new Error(notImplemented())
  }

  /**
   * 删除；目录递归删除。
   * @param {string} path
   * @returns {Promise<void>}
   */
  async delete(path) {
    throw new Error(notImplemented())
  }

  /**
   * 写入文件的题目元数据，不影响正文。meta 为 null 时清除已有元数据。
   * @param {string} path
   * @param {VFSNodeMeta|null} meta
   * @returns {Promise<VFSNode>}
   */
  async setMeta(path, meta) {
    throw new Error(notImplemented())
  }

  /**
   * 写入文件的抓题配置（含样例），不影响正文，也不与 meta 互相覆盖。
   * config 为 null / 空对象时清除已有配置。
   * @param {string} path
   * @param {Record<string, unknown>|null} config
   * @returns {Promise<VFSNode>}
   */
  async setConfig(path, config) {
    throw new Error(notImplemented())
  }

  /**
   * @param {string} path
   * @returns {Promise<VFSNode|null>}
   */
  async stat(path) {
    throw new Error(notImplemented())
  }

  /**
   * root 的嵌套子树。
   * @returns {Promise<VFSNode[]>}
   */
  async getTree() {
    throw new Error(notImplemented())
  }

  // ------------------------------------------------------------ 事件

  /**
   * 订阅变更事件，返回取消订阅函数。
   * @param {VFSChangeListener} listener
   * @returns {() => void}
   */
  onDidChange(listener) {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  /**
   * 发布变更：batch 期间先入队，结束后统一发布；非 batch 立即发布。
   * 子类的所有 mutation 都必须走这里，不许自己调监听器。
   * @param {VFSChangeEvent} event
   */
  _emit(event) {
    if (this.#batchDepth > 0) {
      this.#queuedEvents.push(event)
      return
    }
    this.#publishNow(event)
  }

  #publishNow(event) {
    for (const listener of this.#listeners) {
      try {
        listener(event)
      } catch {
        /* 一个订阅者出错不影响其余 */
      }
    }
  }

  // ------------------------------------------------------------ 批量

  /**
   * 是否处于 batch 中。子类的持久化路径用它判断：
   * true 时只记录待写内容，不单独落库。
   * @returns {boolean}
   */
  _isBatching() {
    return this.#batchDepth > 0
  }

  /**
   * 批量执行：期间挂起事件发布，子类应在 {@link BaseVFSProvider#_commit} 里
   * 把累积的改动一次落库；结束后发布聚合事件（多处变更合并为单个 reset）。
   *
   * 未来 GitHubProvider 将重写 _commit：多 blob → 单 tree → 单 commit。
   * @template T
   * @param {() => T | Promise<T>} exec
   * @returns {Promise<T>}
   */
  async batch(exec) {
    this.#batchDepth += 1
    let failed = false
    try {
      const result = await exec()
      if (this.#batchDepth === 1) await this._commit()
      return result
    } catch (error) {
      failed = true
      if (this.#batchDepth === 1) await this._rollback().catch(() => {})
      throw error
    } finally {
      this.#batchDepth -= 1
      if (this.#batchDepth === 0) {
        const queued = this.#queuedEvents
        this.#queuedEvents = []
        // 失败批次已回滚内存，它的半成品事件必须丢弃，不能再通知 UI
        if (!failed) for (const event of this._coalesce(queued)) this.#publishNow(event)
      }
    }
  }

  /**
   * 子类钩子：把 batch 累积的改动一次持久化。默认 no-op（纯内存场景）。
   * @returns {Promise<void>}
   */
  async _commit() {}

  /**
   * 子类钩子：batch 失败时把内存状态回滚到批次开始时。默认 no-op。
   * @returns {Promise<void>}
   */
  async _rollback() {}

  /**
   * 聚合 batch 内事件：恰好一条 → 原样发布；否则合并为一次 reset，
   * 让 UI 用 getTree() 整树重建，避免 N 条局部补丁在组件里排序打架。
   * @param {VFSChangeEvent[]} events
   * @returns {VFSChangeEvent[]}
   */
  _coalesce(events) {
    if (events.length === 1) return events
    return [{ type: 'reset', id: '', path: '/' }]
  }

  // ------------------------------------------------------------ 能力

  /** @returns {VFSCapabilities} */
  get capabilities() {
    return { watch: true, persistent: true, remote: false }
  }
}
