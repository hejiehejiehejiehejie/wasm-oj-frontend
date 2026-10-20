/**
 * IndexedDB 的极简 Promise 封装 —— 与项目约定一致（参照 services/pchStore.js），
 * 但泛化到任意 store：调用方自己在 onUpgrade 里建表。
 *
 * 所有导出都**不抛异常**：IndexedDB 不可用 / 被阻止 / 事务失败时返回 null 或 false，
 * 由上层（LocalVFSProvider）决定降级，绝不让存储故障炸到用户界面。
 */

/**
 * 打开（必要时升级）数据库。
 * @param {string} name
 * @param {number} version
 * @param {(db: IDBDatabase, oldVersion: number, transaction?: IDBTransaction) => void} onUpgrade
 * @returns {Promise<IDBDatabase | null>}
 */
export function openDatabase(name, version, onUpgrade) {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null)
      return
    }
    let request
    try {
      request = indexedDB.open(name, version)
    } catch {
      // Firefox 隐私模式：open 直接抛
      resolve(null)
      return
    }
    request.onupgradeneeded = () => {
      try {
        onUpgrade(request.result, request.oldVersion, request.transaction)
      } catch {
        /* 建表失败交给后续错误事件 */
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
    request.onblocked = () => resolve(null)
  })
}

/**
 * 在单个事务里执行一次取数（task 返回 IDBRequest），事务完成后 resolve 结果。
 * @template T
 * @param {IDBDatabase} db
 * @param {string[]} stores
 * @param {IDBTransactionMode} mode
 * @param {(tx: IDBTransaction) => IDBRequest} task
 * @returns {Promise<T | null>}
 */
export function withTransaction(db, stores, mode, task) {
  return new Promise((resolve) => {
    let request
    try {
      const tx = db.transaction(stores, mode)
      request = task(tx)
      tx.oncomplete = () => resolve(request?.result ?? null)
      tx.onabort = tx.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

/**
 * 在单个事务里执行多步写入，等事务真正提交后 resolve。
 * 注意：put 的请求成功只代表进队，配额超限在提交时才失败，所以必须看 oncomplete。
 *
 * ⚠️ `fn` 里**同步抛出**时（最典型：`put()` 撞上 structured clone 拒绝的值，比如 Vue 的
 * reactive Proxy 会 DataCloneError）必须主动 `abort()`：抛出点**之前**已经入队的记录否则
 * 会照常提交，留下「半批数据」—— 目录进了库、文件没进，界面因为内存是改过的、看着还成功，
 * 只有刷新后才露馅。2026-10-20 踩过（HANDOFF 坑 62）。
 * @param {IDBDatabase} db
 * @param {string[]} stores
 * @param {IDBTransactionMode} mode
 * @param {(tx: IDBTransaction) => void} fn
 * @returns {Promise<boolean>}
 */
export function commitTransaction(db, stores, mode, fn) {
  return new Promise((resolve) => {
    let tx
    try {
      tx = db.transaction(stores, mode)
      fn(tx)
      tx.oncomplete = () => resolve(true)
      tx.onabort = tx.onerror = () => resolve(false)
    } catch {
      // 这一刻 onabort 还没挂上，abort 不会造成二次 resolve；事务可能已被浏览器自动中止，
      // 再 abort 一次会抛 InvalidStateError，一并咽掉
      try {
        tx?.abort()
      } catch {
        /* 已中止 */
      }
      resolve(false)
    }
  })
}
