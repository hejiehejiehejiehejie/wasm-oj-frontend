/**
 * cfCache —— Codeforces 抽题组件的 IndexedDB 读写（只被 cfWorker 使用）。
 *
 * 【为什么不用 localStorage】题库一万多道题、序列化后约 2–3MB，localStorage 的 5MB
 * 硬上限（还是同步 API）随时会被撑爆；IndexedDB 既没有这个上限，也是异步的，
 * 而且**在 Worker 里可用** —— 这正是「拉取与缓存都在后台做」的前提。
 *
 * 【为什么一条记录装整个题库】抽题每次都要全量扫一遍做筛选，拆成一行一题只会把
 * 「读全库」变成一万多次 get。所以 store 里就是「一个 key 一条大记录」，
 * 读一次拿全量，剩下的筛选 / 排序都在内存里做。
 *
 * 【失败不抛错】沿用 services/vfs/idb.js 的约定：IndexedDB 不可用（隐私模式 / 被阻止）
 * 时返回 null / false，由上层降级成「这次没缓存，下次重新拉」，绝不把存储故障炸到界面。
 */
import { openDatabase, withTransaction, commitTransaction } from '../services/vfs/idb.js'
import { CF_DB_NAME } from '../services/storageNames.js'

/** 库里只有一个 store：key → { ts, data } */
const STORE = 'cache'

/** @type {Promise<IDBDatabase | null> | null} */
let opening = null

/** 惰性开库（一个 Worker 生命周期内只开一次）。建表放 onUpgrade，版本升级时才跑。 */
function database() {
  if (!opening) {
    opening = openDatabase(CF_DB_NAME, 1, (db) => {
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' })
    })
  }
  return opening
}

/**
 * 读一条记录。**ttlMs <= 0 表示不看有效期**（状态探针、卸载前统计要用到过期数据）。
 * @param {string} key
 * @param {number} [ttlMs]
 * @returns {Promise<{ ts: number, data: unknown } | null>} 缺失 / 过期 / 库不可用都是 null
 */
export async function readRecord(key, ttlMs = 0) {
  const db = await database()
  if (!db) return null
  const record = await withTransaction(db, [STORE], 'readonly', (tx) => tx.objectStore(STORE).get(key))
  if (!record) return null
  if (ttlMs > 0 && Date.now() - (record.ts || 0) >= ttlMs) return null
  return { ts: record.ts || 0, data: record.data }
}

/**
 * 覆盖写一条记录。返回是否**提交**成功 —— put 的请求成功只代表进队，
 * 配额超限要到事务提交时才失败（见 idb.js 的同名说明）。
 * @returns {Promise<boolean>}
 */
export async function writeRecord(key, data) {
  const db = await database()
  if (!db) return false
  return commitTransaction(db, [STORE], 'readwrite', (tx) => {
    tx.objectStore(STORE).put({ key, ts: Date.now(), data })
  })
}

/** 清空全部缓存（卸载组件 / 强制重拉前用）。库不可用时视为已经没什么可清，返回 true。 */
export async function clearRecords() {
  const db = await database()
  if (!db) return true
  return commitTransaction(db, [STORE], 'readwrite', (tx) => tx.objectStore(STORE).clear())
}
