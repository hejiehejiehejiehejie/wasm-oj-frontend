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
 * @param {IDBDatabase} db
 * @param {string[]} stores
 * @param {IDBTransactionMode} mode
 * @param {(tx: IDBTransaction) => void} fn
 * @returns {Promise<boolean>}
 */
export function commitTransaction(db, stores, mode, fn) {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(stores, mode)
      fn(tx)
      tx.oncomplete = () => resolve(true)
      tx.onabort = tx.onerror = () => resolve(false)
    } catch {
      resolve(false)
    }
  })
}
