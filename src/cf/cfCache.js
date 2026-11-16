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

/**
 * 「一组输入就多一条」的键族：每看一场比赛 / 每验一个 handle 就多一行。
 *
 * 它们不共享固定 key，所以旧记录只能靠 TTL 自然失效；而 `readRecord` 命中过期记录时
 * 只是「当作没有」，旧行不会消失 —— 长期用下来库只增不减（见 readRecord 里的说明）。
 * 固定键（`problemset`、`contestList`、`contestList:gym`）不在这里，它们永远只有一条。
 */
const VOLATILE_PREFIXES = ['contestProblems:', 'contestMeta:', 'solved:', 'handle:']

/**
 * 易变键族的总条数上限。这些条目全是**纯缓存**（删掉最多重付一次 CF 请求），
 * 但不该无界增长：200 条足够覆盖常用的 handle 与看过的比赛，再旧的按 `ts` 淘汰。
 */
const MAX_VOLATILE_RECORDS = 200

const isVolatileKey = (key) => VOLATILE_PREFIXES.some((prefix) => key.startsWith(prefix))

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
 *
 * 过期时顺手**真删掉那一行**，而不是只返回 null：调用方拿到 null 会重新拉一份再写回来，
 * 旧行留着就永远没人回收 —— `solved:<handle>`、`handle:3:<handle>` 每换一个账号、
 * `contestProblems:2:<id>` 每看一场比赛都多一条，库就这么一路长下去。
 * 状态探针走 ttlMs = 0，过期数据仍会被读出来，不受这条影响。
 *
 * @param {string} key
 * @param {number} [ttlMs]
 * @returns {Promise<{ ts: number, data: unknown } | null>} 缺失 / 过期 / 库不可用都是 null
 */
export async function readRecord(key, ttlMs = 0) {
  const db = await database()
  if (!db) return null
  const record = await withTransaction(db, [STORE], 'readonly', (tx) => tx.objectStore(STORE).get(key))
  if (!record) return null
  if (ttlMs > 0 && Date.now() - (record.ts || 0) >= ttlMs) {
    // 尽力而为：删不掉也只是这一轮没清掉，不影响「这次没有缓存」的结论
    await commitTransaction(db, [STORE], 'readwrite', (tx) => tx.objectStore(STORE).delete(key))
    return null
  }
  return { ts: record.ts || 0, data: record.data }
}

/**
 * 把易变键族收敛到 MAX_VOLATILE_RECORDS 条，按 `ts` 最旧的先删。
 *
 * 先用 openKeyCursor **只扫键**：`problemset` 一条就有 2–3MB，为「数一遍条数」把它整个
 * 反序列化不值当；确认超限之后才 `get` 那些易变条目读 `ts`（它们每条只有几 KB）。
 * 固定键不参与淘汰。失败静默（后端约定：存储故障不炸到界面）。
 */
async function pruneVolatileRecords(db) {
  await commitTransaction(db, [STORE], 'readwrite', (tx) => {
    const store = tx.objectStore(STORE)
    const keys = []
    const cursorRequest = store.openKeyCursor()
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result
      if (cursor) {
        const key = String(cursor.primaryKey)
        if (isVolatileKey(key)) keys.push(key)
        cursor.continue()
        return
      }

      const excess = keys.length - MAX_VOLATILE_RECORDS
      if (excess <= 0) return

      const entries = []
      let pending = keys.length
      for (const key of keys) {
        const request = store.get(key)
        request.onsuccess = () => {
          entries.push({ key, ts: Number(request.result?.ts) || 0 })
          pending -= 1
          if (pending > 0) return
          entries.sort((a, b) => a.ts - b.ts)
          for (let i = 0; i < excess; i += 1) store.delete(entries[i].key)
        }
      }
    }
  })
}

/**
 * 覆盖写一条记录。返回是否**提交**成功 —— put 的请求成功只代表进队，
 * 配额超限要到事务提交时才失败（见 idb.js 的同名说明）。
 *
 * `ts` 只在「这份数据其实早就取回来了」时传（排行榜的内存复用最多 60 秒）：
 * 用写入时刻当锚点会让 `relativeTimeSeconds` 与实际取数时刻对不上，
 * 两条计时口径就会莫名其妙地分岔。
 * @returns {Promise<boolean>}
 */
export async function writeRecord(key, data, ts = Date.now()) {
  const db = await database()
  if (!db) return false
  const committed = await commitTransaction(db, [STORE], 'readwrite', (tx) => {
    tx.objectStore(STORE).put({ key, ts, data })
  })
  // 只有易变键族会把条数撑大；固定键写入时不必白扫一趟库。清理失败不影响写的结果
  if (committed && isVolatileKey(key)) await pruneVolatileRecords(db)
  return committed
}

/** 清空全部缓存（卸载组件 / 强制重拉前用）。库不可用时视为已经没什么可清，返回 true。 */
export async function clearRecords() {
  const db = await database()
  if (!db) return true
  return commitTransaction(db, [STORE], 'readwrite', (tx) => tx.objectStore(STORE).clear())
}
