/**
 * cfWorker —— Codeforces 抽题组件的后台 Worker（module worker）。
 *
 * 【为什么要有 Worker】题库一万多道题、user.status 也有几千条；拉取 + 全量筛选 + 排序
 * 放主线程会卡住 Monaco 与分屏拖拽。所以拉取、缓存、加权随机**全在 Worker 里做完**，
 * 只把最终抽中的那几道题 postMessage 回主线程 —— 主线程永远不持有整个题库。
 *
 * 【数据落在 IndexedDB】见 cfCache.js。TTL：题库 24h、已 AC 12h、账号 1h。
 * 命中缓存就不再触网 —— CF API 有频率限制，缓存是**必需**而不是优化。
 *
 * 【消息协议】
 *   主线程 → Worker：{ id, type: 'status' | 'prefetch' | 'pick' | 'checkHandles' | 'clear', ... }
 *   Worker → 主线程：{ id, ok: true, ...payload } / { id, ok: false, code, message }
 *   另有主动推送：{ type: 'progress', stage } —— stage 是机器码，文案由主线程翻译，
 *   这里刻意不做 i18n（Worker 不该关心界面语言）。
 *
 * 【跨域】CF API 回 `access-control-allow-origin: *`，Worker 里可以直连，不需要代理。
 */
import {
  pickRandomCF,
  cfProblemToTask,
  normalizeHandles,
  normalizeTags,
  problemKey,
} from './pick.js'
import { readRecord, writeRecord, clearRecords } from './cfCache.js'

const CF_API = 'https://codeforces.com/api'

/** 缓存键与有效期 */
const PROBLEMSET_KEY = 'problemset'
const PROBLEMSET_TTL = 24 * 60 * 60 * 1000
const SOLVED_TTL = 12 * 60 * 60 * 1000
const HANDLE_TTL = 60 * 60 * 1000

const solvedKey = (handle) => `solved:${handle.toLowerCase()}`
const handleKey = (handle) => `handle:${handle.toLowerCase()}`

const post = (message) => self.postMessage(message)
const notify = (stage) => post({ type: 'progress', stage })

/**
 * 调一次 CF API。CF 用 HTTP 200 + body.status 表示成败（失败时 comment 里有原因），
 * 所以两处都得判，不能只看 response.ok。
 */
async function fetchResult(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const body = await response.json()
  if (body?.status !== 'OK') throw new Error(body?.comment || 'Codeforces API error')
  return body.result
}

/**
 * 取题库。24h 内命中缓存就直接返回，否则重新拉并落库。
 * 丢掉没有 contestId / index / name 的条目 —— 那是 ACM-ICPC 的 problemsetName 题，
 * 拼不出 /contest/<id>/problem/<index> 链接，抽出来也没法打开。
 * @returns {Promise<Array<Record<string, any>>>}
 */
async function loadProblemset({ force = false } = {}) {
  if (!force) {
    const cached = await readRecord(PROBLEMSET_KEY, PROBLEMSET_TTL)
    if (Array.isArray(cached?.data) && cached.data.length) return cached.data
  }
  notify('problemset')
  const result = await fetchResult(`${CF_API}/problemset.problems`)
  const problems = (result.problems || []).filter(
    (problem) => problem && problem.contestId && problem.index && problem.name,
  )
  await writeRecord(PROBLEMSET_KEY, problems)
  return problems
}

/**
 * 取某账号已 AC 的题目键（problemKey 的产物）。verdict === 'OK' 才算通过；缓存 12h。
 * @returns {Promise<string[]>}
 */
async function loadSolvedKeys(handle, { force = false } = {}) {
  const key = solvedKey(handle)
  if (!force) {
    const cached = await readRecord(key, SOLVED_TTL)
    if (Array.isArray(cached?.data)) return cached.data
  }
  notify('solved')
  const result = await fetchResult(
    `${CF_API}/user.status?handle=${encodeURIComponent(handle)}&from=1&count=100000`,
  )
  const keys = []
  for (const submission of result || []) {
    const problem = submission?.problem
    if (submission?.verdict === 'OK' && problem?.contestId && problem?.index) {
      keys.push(problemKey(problem))
    }
  }
  await writeRecord(key, keys)
  return keys
}

/**
 * 校验账号是否存在，结果缓存 1h。
 * 网络失败一律回 `{ ok: false, reason: 'network' }` —— 由调用方区分「不存在」与「连不上」，
 * 后者不该拦着用户抽题。
 * @returns {Promise<{ ok: boolean, reason: 'empty'|'ok'|'not_found'|'network' }>}
 */
async function verifyHandle(rawHandle) {
  const handle = String(rawHandle || '').trim()
  if (!handle) return { ok: true, reason: 'empty' }

  const cached = await readRecord(handleKey(handle), HANDLE_TTL)
  if (cached?.data) return cached.data

  try {
    notify('handle')
    // 这里不能走 fetchResult：CF 对「账号不存在」是 **HTTP 400** + status:FAILED，
    // fetchResult 会在读 body 之前就按 !response.ok 抛错，于是「拼错了」被误判成「连不上」
    // —— 用户看到的是「网络错误」，而抽题还会照常进行（排除已 AC 悄悄失效）。
    // 所以自己读一次 body，只有 comment 明确写着 not found 才算「不存在」。
    const response = await fetch(`${CF_API}/user.info?handles=${encodeURIComponent(handle)}`)
    const body = await response.json().catch(() => null)

    if (body?.status === 'OK' && Array.isArray(body.result) && body.result.length) {
      const outcome = { ok: true, reason: 'ok' }
      await writeRecord(handleKey(handle), outcome)
      return outcome
    }

    // 限流 / 5xx / 解析不出来都算「连不上」：这一档不该拦着用户抽题，也不该缓存 1 小时
    if (!/not found/i.test(body?.comment || '')) return { ok: false, reason: 'network' }
    const outcome = { ok: false, reason: 'not_found' }
    await writeRecord(handleKey(handle), outcome)
    return outcome
  } catch {
    return { ok: false, reason: 'network' }
  }
}

// ------------------------------------------------------------ 消息处理

const handlers = {
  /** 状态探针：题库有没有、多少道、什么时候拉的（不看 TTL，过期数据也照报） */
  async status() {
    const record = await readRecord(PROBLEMSET_KEY, 0)
    const problems = Array.isArray(record?.data) ? record.data : []
    return { ready: problems.length > 0, count: problems.length, fetchedAt: record?.ts ?? 0 }
  },

  /** 预取题库（组件「下载」时调用），force=true 时无视缓存重拉 */
  async prefetch(message) {
    const problems = await loadProblemset({ force: !!message.force })
    return { count: problems.length }
  },

  /**
   * 校验账号（支持一次多个）。返回的字段名刻意**不叫 `ok`** —— 信封里已经有一个 `ok`
   * （这次调用成没成功），载荷里再来一个 `ok`（账号存不存在）会在
   * `{ id, ok: true, ...payload }` 里互相覆盖，结果是「账号不存在」被主线程当成
   * 「这次调用失败」而 reject。所以这里只回 `{ results }`，`ok` 永远专指信封。
   *
   * 逐个校验而不是一次性 `user.info?handles=a;b`：CF 那个接口只要有一个 handle 不存在
   * 就整体 FAILED，分不出是哪一个拼错了；而且逐个走的是各自 1h 的缓存，命中时是瞬时的。
   */
  async checkHandles(message) {
    const handles = normalizeHandles(message.handles)
    const results = []
    for (const handle of handles) {
      const outcome = await verifyHandle(handle)
      results.push({ handle, valid: outcome.ok, reason: outcome.reason })
    }
    return { results }
  },

  /** 抽题：读库 → （可选）取已 AC → 跑算法 → 只回抽中的那几道 */
  async pick(message) {
    const filters = message.filters || {}
    const problems = await loadProblemset()

    // 「排除已通过的题」支持多个账号：取各自已 AC 的**并集**，
    // 于是留下的就是「这些账号都没做过的题」
    const handles = normalizeHandles(filters.handles)
    let solvedSet = null
    if (filters.excludeSolved && handles.length) {
      solvedSet = new Set()
      for (const handle of handles) {
        for (const key of await loadSolvedKeys(handle)) solvedSet.add(key)
      }
    }

    const picked = pickRandomCF(problems, {
      ratingMin: filters.ratingMin ?? null,
      ratingMax: filters.ratingMax ?? null,
      tags: normalizeTags(filters.tags),
      count: filters.count,
      requireRated: filters.ratingMin != null || filters.ratingMax != null,
      excludeSolved: !!filters.excludeSolved,
      solvedSet,
      preferNew: !!filters.preferNew,
      // 「换一批」：主线程把当前这批题的键发过来，剔掉它们。
      // 走数组而不是 Set —— postMessage 虽然能克隆 Set，但显式传数组更省心
      excludeKeys: new Set(filters.excludeKeys || []),
    })

    if (!picked.length) {
      const error = new Error('no-match')
      error.code = 'NO_MATCH'
      throw error
    }

    // 只回主线程真正要用的字段 + 现成的 task，别把整个题库塞进消息里
    return {
      problems: picked.map((problem) => ({
        contestId: problem.contestId,
        index: problem.index,
        name: problem.name,
        rating: typeof problem.rating === 'number' ? problem.rating : null,
        tags: problem.tags || [],
        task: cfProblemToTask(problem),
      })),
    }
  },

  /** 清空缓存（卸载组件） */
  async clear() {
    await clearRecords()
    return {}
  },
}

self.onmessage = (event) => {
  const message = event.data
  if (!message || typeof message !== 'object') return

  const handler = handlers[message.type]
  if (!handler) {
    post({ id: message.id, ok: false, code: 'UNKNOWN_TYPE' })
    return
  }

  handler(message).then(
    (payload) => post({ id: message.id, ok: true, ...payload }),
    (error) =>
      post({
        id: message.id,
        ok: false,
        code: error?.code || 'ERROR',
        message: String(error?.message || error),
      }),
  )
}
