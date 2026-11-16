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
 * 【全局限速是本文件的一条硬纪律】CF 的公开 API 限 **1 次 / 2 秒**，是**按来源 IP**
 * 算的：抽题、赛程、榜单、提交记录、提交详情全都在同一个配额里。所以这里只有一条
 * 串行闸门 `apiFetch()`（任意两次请求至少隔 API_MIN_GAP），**任何新接口都必须走它**，
 * 别在别处直接 fetch。同一条 URL 上的并发请求再由 `once()` 合并成一个 Promise ——
 * 榜单页开着轮询时，另一个入口顺手取同一场榜单不该多付一次配额。**`once()` 里只允许
 * 出现「真的要去取数」的路径**（缓存判定一律写在外面），所以 `force` 不进合并键（见其注释）。
 *
 * 【榜单不落 IndexedDB】一场 6k–15k 行、单次 2–6MB，只在该场**已结束**时在内存里
 * 留 60 秒（它不会再变），进行中的只留 3 秒。落库会让 IndexedDB 随「看过几场比赛」
 * 一路长大，而它的价值只在这一次会话里。
 *
 * 【消息协议】
 *   主线程 → Worker：
 *     { id, type: 'status' | 'prefetch' | 'pick' | 'checkHandles' | 'clear', ... }
 *     { id, type: 'contest' | 'contestProblems' | 'standings' | 'submissions' | 'submissionDetail', ... }
 *     { id, type: 'contests', force } —— 赛程用的比赛列表
 *   Worker → 主线程：{ id, ok: true, ...payload } / { id, ok: false, code, message }
 *   另有主动推送：{ type: 'progress', stage } —— stage 是机器码，文案由主线程翻译，
 *   这里刻意不做 i18n（Worker 不该关心界面语言）。**轮询类请求不推 progress**，
 *   否则抽题面板正在显示进度时会被榜单轮询的机器码顶掉。
 *
 * 【跨域】CF API 回 `access-control-allow-origin: *`，Worker 里可以直连，不需要代理。
 */
import {
  pickRandomCF,
  cfProblemToTask,
  contestCategory,
  normalizeCats,
  normalizeHandles,
  normalizeLetters,
  normalizeTags,
  problemKey,
} from './pick.js'
import { contestProblemUrl } from './contest.js'
import { normalizeStandings, problemStatistics } from './standings.js'
import { readRecord, writeRecord, clearRecords } from './cfCache.js'

const CF_API = 'https://codeforces.com/api'

/** 缓存键与有效期 */
const PROBLEMSET_KEY = 'problemset'
const PROBLEMSET_TTL = 24 * 60 * 60 * 1000
const SOLVED_TTL = 12 * 60 * 60 * 1000
const HANDLE_TTL = 60 * 60 * 1000
/**
 * 比赛列表的缓存期。比题库短得多：`phase` 会随着开赛 / 结束变化，
 * 而倒计时靠 `relativeTimeSeconds` + 记录的取数时刻自洽（见 contest.js），
 * 所以这里只需要「别太旧」，1h 足够。
 */
const CONTEST_LIST_TTL = 60 * 60 * 1000

/** 非 gym 与 gym 是两个独立列表（CF 的接口按 gym 参数分开返回），缓存也分开存 */
const CONTEST_LIST_KEY = 'contestList'
const CONTEST_LIST_GYM_KEY = 'contestList:gym'

/**
 * 每场比赛题目列表的缓存。**来源只有 standings**（见 loadContestProblems 的长注释），
 * 比赛开赛后题目清单就不会再变，缓存给 24h：老比赛重看零请求，最坏也一天付一次流量。
 */
const CONTEST_PROBLEMS_TTL = 24 * 60 * 60 * 1000

/**
 * 某场比赛题目列表的缓存键（按场次分开，量级是几 KB，不是榜单那几 MB）。
 *
 * 带 `:2`：2026-10-27 起请求统一带 `Accept-Language: en`，之前落库的题名是俄文那套。
 * 不换键的话，看过的比赛会顶着旧名字撑满 24h。旧记录留在库里不碍事（几 KB/场）。
 */
const contestProblemsKey = (contestId) => `contestProblems:2:${contestId}`


const solvedKey = (handle) => `solved:${handle.toLowerCase()}`
/**
 * 账号信息的缓存键。带 `:3`：2026-11-05 起这份缓存还要存账号的**官方写法**
 * （CF 的 handle 大小写不敏感，但 `user.info` 回的那份才是官方写法，界面要显示它），
 * 旧记录里没有这个字段 —— 换键让填错大小写的老用户下一次校验时就改回来，
 * 旧键随 1h TTL 自然作废。
 */
const handleKey = (handle) => `handle:3:${handle.toLowerCase()}`

// ------------------------------------------------------------ 全局限速

/**
 * 任意两次 CF API 请求的最小间隔。CF 明写 1 次 / 2 秒，多留 100ms 吸收时钟抖动。
 * 为什么是**全局**而不是各模块各排队：配额按来源 IP 算，抽题、赛程、榜单、提交记录
 * 共用同一个额度。各自排队的话，两处同时发车照样会撞在一起。
 */
const API_MIN_GAP = 2100

/** 普通请求的超时。题库 / 榜单都是几 MB，给宽一点 */
const API_TIMEOUT = 30000

/** 按提交号找单条提交的超时（见 ojSubmit.js 的历史注释：老比赛要 8~9s） */
const DETAIL_TIMEOUT = 12000

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const noop = () => {}

/** 串行闸门：每发一次就把 chain 往后接一段，保证任意两次 fetch 的**开始时刻**至少隔开 */
let apiChain = Promise.resolve()
let lastApiAt = 0

/**
 * 唯一允许触网的入口。`timeout` 管的是**真正发车之后**的时长 —— 排队等待不算在里面，
 * 否则前面压着两次榜单请求时，一条 12 秒的提交详情会在还没发出去时就先被自己的超时掐掉。
 *
 * 【语言必须是 en，不是「随浏览器」】CF 的题名有英 / 俄两套，接口**按 `Accept-Language`
 * 挑一套，不带这个头就回俄文那套**（2026-10-27 实测 2276：不带 → "Идеальные бутерброды"，
 * 带 en → "Perfect Sandwiches"，与网站 `title="A - Perfect Sandwiches"` 一致）。
 * 站点界面只有中 / 英，CF 也没有中文题名，所以一律要英文。`Accept-Language` 属于
 * CORS 安全列表内的请求头，不会触发预检。
 * @param {string} url
 * @param {RequestInit & { timeout?: number }} [init]
 */
function apiFetch(url, { timeout = API_TIMEOUT, ...init } = {}) {
  const run = apiChain.then(async () => {
    const wait = lastApiAt + API_MIN_GAP - Date.now()
    if (wait > 0) await sleep(wait)
    lastApiAt = Date.now()
    // 心跳：让主线程的看门狗能区分「慢」和「死」。没有它的话，一次 30s 的 fetch 与一次
    // 卡在死循环里的请求在主线程看来完全一样，只能靠一个足够大的常数去赌（见 cfClient）。
    beat()
    try {
      return await fetch(url, {
        ...init,
        headers: { 'Accept-Language': 'en', ...init.headers },
        signal: AbortSignal.timeout(timeout),
      })
    } finally {
      beat()
    }
  })
  // 队列本身不能因为某一次失败就断掉
  apiChain = run.then(noop, noop)
  return run
}

/** 同键合并正在进行中的请求：`key` 相同就复用同一个 Promise，结束后立即释放 */
const inflight = new Map()

/**
 * 同键合并：**只圈「真的要去 CF 取数」那一段**。
 *
 * 【纪律：缓存判定必须在 once 外面】这样进来的每一条都注定要触网，被合并的那一份就
 * 一定是「网络数据」，不会拿一次缓存命中去敷衍一个 `force` 调用。于是 `force` 不需要
 * 出现在 key 里，也不需要额外的新鲜度仲裁 —— 原来 `contestList:main:force` 与
 * `contestList:main` 是两个键，「赛程打开时的静默刷新」撞上任意一次普通读取，就会对
 * 同一个 URL 并发打两次 CF，白白多占一次 2 秒一次的配额。
 *
 * 代价是 `force` 调用方可能搭上一趟「刚刚发出」的取数（最多几十秒前的结果）。这仍然
 * 满足 force 的语义（**一定不是缓存**），而且比多打一次配额更划算。
 */
function once(key, task) {
  const existing = inflight.get(key)
  if (existing) return existing

  const promise = task().finally(() => {
    if (inflight.get(key) === promise) inflight.delete(key)
  })
  inflight.set(key, promise)
  return promise
}

/** CF 的限流文案有两种写法（API 注释 / HTTP 429），都折成同一个码，界面据此退避 */
function isRateLimited(comment, status) {
  return status === 429 || /call limit|limit exceeded/i.test(String(comment || ''))
}

/**
 * 调一次 CF API。CF 用 HTTP 200 + body.status 表示成败（失败时 comment 里有原因），
 * 所以两处都得判，不能只看 response.ok。
 */
async function fetchResult(url, { timeout = API_TIMEOUT } = {}) {
  const response = await apiFetch(url, { timeout })
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`)
    if (isRateLimited('', response.status)) error.code = 'RATE_LIMITED'
    throw error
  }
  const body = await response.json()
  if (body?.status !== 'OK') {
    const comment = String(body?.comment || '')
    const error = new Error(comment || 'Codeforces API error')
    if (isRateLimited(comment, 0)) error.code = 'RATE_LIMITED'
    throw error
  }
  return body.result
}

const post = (message) => self.postMessage(message)
const notify = (stage) => post({ type: 'progress', stage })

/**
 * 心跳（活着的证明）。`type: 'beat'` 是**协议里新增的唯一一种「不是响应」的消息**：
 * 旧版主线程收到它会走 `pending.get(undefined)` → 直接丢弃，安全；新版主线程拿它
 * 刷新「这颗 worker 还活着」的时刻，从而把「请求慢」与「请求永远回不来」分开
 * （见 cfClient 的看门狗）。不带 id —— 它不是任何一条请求的答复。
 */
const beat = () => post({ type: 'beat' })

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
  return once('fetch:problemset', async () => {
    notify('problemset')
    const result = await fetchResult(`${CF_API}/problemset.problems`)
    const problems = (result.problems || []).filter(
      (problem) => problem && problem.contestId && problem.index && problem.name,
    )
    await writeRecord(PROBLEMSET_KEY, problems)
    return problems
  })
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
  return once(`fetch:solved:${handle.toLowerCase()}`, async () => {
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
  })
}

/**
 * 校验账号是否存在，结果缓存 1h。
 * 网络失败一律回 `{ ok: false, reason: 'network' }` —— 由调用方区分「不存在」与「连不上」，
 * 后者不该拦着用户抽题。
 *
 * 顺手把 `rating` 留下（2026-10-29）：账号胶囊要按分数上色。同一份 user.info、同一份
 * 1h 缓存，不该为「存在」和「段位」分两处各拉一次。未打过 rated 比赛的账号没有这个字段，落成 null。
 *
 * 也把 `handle` 留下（2026-11-05）：那是 CF 回的**官方写法**。CF 的 handle 大小写不敏感，
 * 用户随手填 `tourist` 而账号是 `Tourist` 时，主线程据此把存下来的名字改回官方那份
 * （见 myHandle.js 的 applyCanonicalHandles）。「不存在 / 连不上」没有这份信息，留空。
 * @returns {Promise<{ ok: boolean, reason: 'empty'|'ok'|'not_found'|'network', handle?: string, rating?: number|null }>}
 */
async function verifyHandle(rawHandle) {
  const handle = String(rawHandle || '').trim()
  if (!handle) return { ok: true, reason: 'empty' }

  // 缓存判定在 once 外面（同一条纪律：once 里只允许出现「真的要去取数」的路径）
  const cached = await readRecord(handleKey(handle), HANDLE_TTL)
  if (cached?.data) return cached.data

  return once(`fetch:verify:${handle.toLowerCase()}`, async () => {
    try {
      notify('handle')
      // 这里不能走 fetchResult：CF 对「账号不存在」是 **HTTP 400** + status:FAILED，
      // fetchResult 会在读 body 之前就按 !response.ok 抛错，于是「拼错了」被误判成「连不上」
      // —— 用户看到的是「网络错误」，而抽题还会照常进行（排除已 AC 悄悄失效）。
      // 所以自己读一次 body，只有 comment 明确写着 not found 才算「不存在」。
      const response = await apiFetch(`${CF_API}/user.info?handles=${encodeURIComponent(handle)}`)
      const body = await response.json().catch(() => null)

      if (body?.status === 'OK' && Array.isArray(body.result) && body.result.length) {
        const user = body.result[0] || {}
        const outcome = {
          ok: true,
          reason: 'ok',
          // CF 自己那份写法：主线程拿到后把用户随手填的大小写改回来
          handle: typeof user.handle === 'string' && user.handle ? user.handle : handle,
          rating: typeof user.rating === 'number' ? user.rating : null,
        }
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
  })
}

// ------------------------------------------------------------ 比赛（看板 / 倒计时）

/**
 * 取比赛列表（非 gym 约 400KB、gym 约 1MB），缓存 1h。
 *
 * 只留会用到的七个字段：整份原样塞进 IndexedDB 既没必要，也会让 `contest.list` 里的
 * 名字 / 类型这类会变的东西跟着一起陈旧。`type` 是榜单列形的判据（CF / ICPC / IOI），
 * `relativeTimeSeconds` 必须留 —— 倒计时靠它自洽（见 contest.js 的 contestRemainingMs），
 * gym 的条目里没有这个字段，落成 null。
 *
 * force=true 绕过 1h 缓存（赛程每次打开时的静默刷新、以及倒计时归零时确认赛程真的翻面用）。
 *
 * @returns {Promise<{ list: Array<Record<string, any>>, fetchedAt: number }>}
 */
async function loadContestList(gym, { force = false } = {}) {
  const key = gym ? CONTEST_LIST_GYM_KEY : CONTEST_LIST_KEY
  if (!force) {
    const cached = await readRecord(key, CONTEST_LIST_TTL)
    if (Array.isArray(cached?.data) && cached.data.length) {
      return { list: cached.data, fetchedAt: cached.ts }
    }
  }

  // key 里不带 force：见 once() 的注释 —— 同一条 URL 的两种「新鲜度要求」不是两份数据
  return once(`fetch:contestList:${gym ? 'gym' : 'main'}`, async () => {
    notify('contestList')
    const result = await fetchResult(`${CF_API}/contest.list${gym ? '?gym=true' : ''}`)
    const list = (result || [])
      .filter((contest) => contest?.id)
      .map((contest) => ({
        id: contest.id,
        name: contest.name,
        type: contest.type ?? '',
        phase: contest.phase,
        startTimeSeconds: contest.startTimeSeconds ?? null,
        durationSeconds: contest.durationSeconds ?? null,
        relativeTimeSeconds: contest.relativeTimeSeconds ?? null,
      }))

    await writeRecord(key, list)
    return { list, fetchedAt: Date.now() }
  })
}

/**
 * 选中的比赛类别 → 允许抽的 contestId 集合（空 = 不限）。
 *
 * 【为什么要借 contest.list】题库接口只给 contestId，没有「这场比赛是 Div 几」这种字段，
 * 唯一能判的依据是比赛名（见 pick.js 的 contestCategory）。列表本身 1h 缓存、与赛程共用，
 * 抽题页开着时通常已经在库里，不必额外付配额；第一次勾类别时最多多下一份 400KB。
 *
 * 【为什么按题目遍历，而不是直接把列表里同类的场次全塞进来】集合只装「题库里真的出现过」
 * 的场次，于是「Others」天然涵盖了 contest.list 里没有的那些（group / 私有场次）——
 * 过滤时不必再为「查不到的 contestId 算不算 Others」多写一条分支。
 *
 * @param {unknown} rawCats 主线程传来的类别（字符串或数组）
 * @param {Array<Record<string, any>>} problems 题库
 * @returns {Promise<Set<number>|null>} null 表示这一项没设条件
 */
async function contestIdsOfCategories(rawCats, problems) {
  const wanted = new Set(normalizeCats(rawCats))
  if (!wanted.size) return null

  const { list } = await loadContestList(false)
  const categoryOf = new Map(
    list.map((contest) => [contest.id, contestCategory(contest.name, contest.id)]),
  )

  const ids = new Set()
  for (const problem of problems) {
    if (ids.has(problem.contestId)) continue
    // 不在列表里的场次不属于任何 Div，归 Others
    const category = categoryOf.get(problem.contestId) ?? 'others'
    if (wanted.has(category)) ids.add(problem.contestId)
  }
  return ids
}

/**
 * 在比赛列表里找一场。找不到返回 null（用户可能贴了 group 或 edu 的比赛，那些不在列表里）。
 *
 * 先查非 gym，没命中再查 gym —— 后者要多下 1MB，别为了一场普通比赛白拉。
 *
 * 【force 的用处】`contest.list` 缓存 1 小时，而 CF 会改某场的开赛时刻（延期 / 提前）。
 * 延期态下「查一次新时刻」必须绕过缓存，否则会一直回旧时刻（见 HANDOFF §56.6）。
 *
 * 【missing 与 null 的分家】`missing: true` = **查过了**，这场确实不在列表里（取消 / 已换场）；
 * 而 `null` = 两份列表一份都没拉到（断网 / 限流），什么都不能断言。两者混在一起的话，
 * 一次网络抖动就会被主线程说成「这场比赛被取消了」。
 */
async function findContest(contestId, preferGym, force = false) {
  const order = preferGym ? [true, false] : [false, true]
  let searched = false
  for (const gym of order) {
    try {
      const { list, fetchedAt } = await loadContestList(gym, { force })
      searched = true
      const contest = list.find((item) => String(item.id) === String(contestId))
      if (contest) return { contest, fetchedAt, missing: false }
    } catch {
      // 拉不到就换下一份：列表只是用来取名字和开赛时间，拿不到也不该把整件事炸掉
    }
  }
  return searched ? { contest: null, fetchedAt: 0, missing: true } : null
}

/**
 * 拉一场比赛**完整的** standings（contest + problems + rows），并做两级复用。
 *
 * 【为什么是同一个请求】`contest.standings` 的裸参数一次就回这三块；题目列表与排行榜
 * 分成两个 handler 只是为了让界面各取所需，底层不该为此付两次配额。所以这里是唯一的
 * 取数点，`contestProblems` 与 `standings` 都从它拿。
 *
 * 【复用窗口】结束的比赛榜单不会再变，内存里留 60 秒（切到提交页签再回来不必重拉 2–6MB）；
 * 进行中的留 3 秒（轮询间隔 10 秒，靠它挡掉「题目列表 + 排行榜首屏几乎同时发」那一对）。
 * 两个窗口都**只活在 Worker 内存里**，不落 IndexedDB —— 一场 15k 行的榜单落库，
 * 看过几场就能把库撑到几十 MB，而它只在这一回有用。
 * 窗口一过就**立刻放掉**（见 sweepStandings）：否则一条过期条目会一路留到第 5 场进来。
 *
 * 【两个坑，都在注释里写死了】
 *   1) 非 gym 只允许**裸参数**（带 from/count 直接 FAILED），见上面的体积说明。
 *   2) gym / group 的 standings 要 apiKey/apiSig 签名，浏览器这边没有凭据，会回
 *      "You have to be authenticated"。这不是故障，是能力边界：转成 CONTEST_NEEDS_LOGIN。
 *
 * @returns {Promise<{ contest: Record<string, any>|null, problems: Array<Record<string, any>>, rows: Array<Record<string, any>>, fetchedAt: number }>}
 */
const STANDINGS_LIVE_REUSE = 3000
const STANDINGS_FINAL_REUSE = 60000
const RECENT_STANDINGS_MAX = 4

/** contestId → { at, payload }。只留最近几场，换一场就把最旧的挤掉 */
const recentStandings = new Map()

/** 这一份还能不能被复用：结束的比赛不会再变，开着的那份每轮轮询都在变 */
function standingsReuseMs(payload) {
  return payload?.contest?.phase === 'FINISHED' ? STANDINGS_FINAL_REUSE : STANDINGS_LIVE_REUSE
}

/**
 * 丢掉已经过了复用窗口的条目。
 *
 * 【为什么必须有】这张表里每个值都是 2–6MB 的原始榜单（一场 15k 行）。原来只按「超过 4 场
 * 就挤掉最旧的」淘汰，而窗口只有 3s / 60s —— 一条记录在过期之后、在被第 5 场挤掉之前，
 * **再也不可能被复用**，却一直占着那几 MB。比赛打一整场只看一场榜单，那就是一份 6MB
 * 永久常驻；来回换几场就是几十 MB 堆在 Worker 里。判据不该是「留几份」，而是「还能不能用」。
 *
 * 剩下 4 这个上限只兜「60 秒内连翻好几场」的极端，正常情况下表里就是 1–2 条。
 */
function sweepStandings(now = Date.now()) {
  for (const [id, entry] of recentStandings) {
    if (now - entry.at >= standingsReuseMs(entry.payload)) recentStandings.delete(id)
  }
}

function rememberStandings(contestId, payload) {
  sweepStandings()
  recentStandings.delete(contestId)
  recentStandings.set(contestId, { at: Date.now(), payload })
  while (recentStandings.size > RECENT_STANDINGS_MAX) {
    recentStandings.delete(recentStandings.keys().next().value)
  }
}

async function requestStandings(contestId, { force = false } = {}) {
  const id = String(contestId)
  // 每轮轮询顺路清一次过期的：不然一份 6MB 要等「第 5 场」才会被放掉
  sweepStandings()
  const cached = recentStandings.get(id)
  if (!force && cached) {
    const reuse = standingsReuseMs(cached.payload)
    if (Date.now() - cached.at < reuse) return cached.payload
  }

  return once(`standings:${id}`, async () => {
    // 不走 fetchResult：它对 !response.ok 直接抛「HTTP 400」，把 CF 写在 body 里的原因丢了。
    // 而「这场还没开赛」与「gym 要认证」都只能靠那句 comment 区分，丢了就都变成一句网络错误。
    const response = await apiFetch(
      `${CF_API}/contest.standings?contestId=${encodeURIComponent(id)}`,
    )
    const body = await response.json().catch(() => null)

    if (body?.status !== 'OK') {
      const comment = String(body?.comment || '')

      // 未开赛：CF 回 400 + "Contest with id N has not started"。不是故障 —— 题目本来就还没出现
      if (/has not started/i.test(comment)) {
        const error = new Error('contest-not-started')
        error.code = 'CONTEST_NOT_STARTED'
        throw error
      }

      // gym / group 的榜单要 apiKey + apiSig，浏览器这边没有凭据
      if (/authenticated/i.test(comment)) {
        const error = new Error('contest-needs-login')
        error.code = 'CONTEST_NEEDS_LOGIN'
        throw error
      }

      const error = new Error(comment || `HTTP ${response.status}`)
      if (isRateLimited(comment, response.status)) error.code = 'RATE_LIMITED'
      throw error
    }

    const result = body.result

    // standings 的 problems 本来就属于这一场且自带 contestId，这里再补一遍是防御：
    // 后面拼链接与认题都假设字段在。**不回退 problemset** —— 部分缺失比完全失败更害人
    // （用户看着 2/6 当成全场就完了），连不上就报错重试。
    const problems = (result?.problems || []).map((problem) => ({
      ...problem,
      contestId: Number(id),
    }))

    // 补 rating：standings 没有，题库 dump 有。只读缓存，不触发网络。
    if (problems.length) {
      const dump = await readRecord(PROBLEMSET_KEY, 0)
      if (Array.isArray(dump?.data)) {
        const ratings = new Map(
          dump.data
            .filter((problem) => problem?.contestId != null && problem?.index)
            .map((problem) => [`${problem.contestId}:${problem.index}`, problem.rating]),
        )
        for (const problem of problems) {
          if (problem.rating == null) {
            problem.rating = ratings.get(`${problem.contestId}:${problem.index}`)
          }
        }
      }
    }

    const payload = {
      contest: result?.contest ?? null,
      problems,
      rows: Array.isArray(result?.rows) ? result.rows : [],
      fetchedAt: Date.now(),
    }
    rememberStandings(id, payload)
    return payload
  })
}

/**
 * 取某场比赛的题目列表。
 *
 * 【唯一来源是 standings】见 requestStandings 上面的注释。2026-10-20 用户实报：2274
 * （8 天前结束的 Div. 2）六道题只回来两道 —— 曾经的主路径 `problemset.problems`（全局题库
 * dump）**对部分比赛是不完整的**：那场的 C–F 是 olympiad 镜像题，CF 至今没把它们收进归档。
 * 所以「题库找不到才打 standings」的兜底口径整个作废：standings 的 problems 自带
 * contestId / index / name / tags，是唯一跟 CF 榜单对得上号的清单。
 *
 * 按场次缓存（contestProblems:<id>，24h）—— 每场只付一次；缓存里只有几 KB 的 problems
 * 数组，不存榜单行（榜单只在内存里短留，见 requestStandings）。
 *
 * @returns {Promise<{ problems: Array<Record<string, any>>, source: 'standings', pending?: boolean,
 *   contest?: Record<string, any> }>}
 *   `pending` 为真表示「这场还没开赛，题目还没出现」—— 空列表但**不是**错误。
 *
 *   `contest` 是 standings 响应自带的**最新**比赛元数据（`phase` / `startTimeSeconds` /
 *   `durationSeconds` 都在里面）。它只在真打了一次网络时才有 —— 命中 24h 题目缓存时**故意**
 *   不带（那是不知多旧的东西，拿来校正时刻比没有更糟）。主线程拿它当「已经开赛」的权威反面证据。
 */
async function loadContestProblems(contestId) {
  const key = contestProblemsKey(contestId)
  const cached = await readRecord(key, CONTEST_PROBLEMS_TTL)
  if (Array.isArray(cached?.data) && cached.data.length) {
    return { problems: cached.data, source: 'standings' }
  }

  notify('standings')
  let payload
  try {
    payload = await requestStandings(contestId)
  } catch (error) {
    if (error?.code === 'CONTEST_NOT_STARTED') {
      return { problems: [], source: 'standings', pending: true }
    }
    throw error
  }

  // 空列表不落库：还没开赛的「空」不能把 24h 缓存占住，开赛瞬间就该能取到真清单
  if (payload.problems.length) {
    // 题目表要显示「通过人数」，而 CF 的题目清单里没有这个字段。这里**复用刚刚已经
    // 拉下来的榜单行**算一遍（normalizeStandings → problemStatistics），不额外发请求；
    // 数字随题目一起进 24h 缓存 —— 已结束的比赛从此是定值，进行中的是载入时的快照。
    const stats = problemStatistics(
      normalizeStandings(payload).rows,
      payload.problems,
    )
    payload.problems.forEach((problem, index) => {
      problem.solved = stats[index]?.solved ?? 0
    })
    await writeRecord(key, payload.problems)
  }
  // contest 一律透传（哪怕 problems 为空）：它是这次网络请求的**顺带产物**，
  // 主线程靠它判断「CF 那边到底开没开赛、开赛时刻是多少」
  return { problems: payload.problems, source: 'standings', contest: payload.contest ?? null }
}

/**
 * 把主线程传来的参数收敛成一只 spec。两条比赛消息共用，判据只维护一份。
 * ID 不合法时抛 BAD_CONTEST_ID —— 正常走不到（主线程已经用 parseContestSpec 解析过），
 * 留着是为了让协议在只有 Worker 这一侧被调用时也能自己把关。
 */
function contestSpecOf(message) {
  const contestId = String(message?.contestId ?? '').trim()
  if (!/^\d+$/.test(contestId)) {
    const error = new Error('bad-contest-id')
    error.code = 'BAD_CONTEST_ID'
    throw error
  }

  const kind =
    message?.kind === 'gym' || message?.kind === 'group' ? message.kind : 'contest'

  return { kind, contestId, groupId: String(message?.groupId ?? '') }
}

/**
 * 取一场比赛的提交记录（最新在前）。
 *
 * `contest.status` 匿名可读，`from/count` 与 `handle` 都认：
 *   - 不带 handle：整场最新的 N 条（直播 5 秒一轮只取 200 条）；
 *   - 带 handle：某个账号在本场的提交（「只看我」用它，能翻到很早的记录）。
 *
 * **绝不全量拉**：旧比赛整场能到 60 万条 / 16.9MB gzip / 81 秒（2026-10-26 实测），
 * 那是一条能把标签页拖死的路。count 上限 1000，页面按需多取也只到这个数。
 *
 * 同键合并让轮询与手动刷新撞在一起时只付一次配额。
 */
const SUBMISSIONS_MAX = 1000

async function loadContestStatus({ contestId, handle = '', count = 200, timeout = API_TIMEOUT }) {
  const id = String(contestId)
  const size = Math.min(SUBMISSIONS_MAX, Math.max(1, Math.trunc(Number(count) || 200)))
  const who = String(handle || '').trim()

  const params = new URLSearchParams({ contestId: id, from: '1', count: String(size) })
  if (who) params.set('handle', who)

  return once(`status:${id}:${who.toLowerCase()}:${size}`, async () => {
    const result = await fetchResult(`${CF_API}/contest.status?${params}`, { timeout })
    return { rows: Array.isArray(result) ? result : [], fetchedAt: Date.now() }
  })
}

/**
 * 按提交号找单条提交：官方没有「按 id 取一条」的接口，只能取一页再按 id 找。
 * 比赛打完后新交的代码仍然排在最前，所以 `from=1` 的一页就够（见 ojSubmit 的说明）。
 */
async function loadSubmission({ contestId, submissionId, count = 1000 }) {
  const id = String(contestId)
  const target = String(submissionId)
  const { rows } = await loadContestStatus({ contestId: id, count, timeout: DETAIL_TIMEOUT })
  return { submission: rows.find((row) => String(row?.id) === target) ?? null }
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
   * 每条结果带 `rating`（未定级 / 不存在 / 连不上都是 null）：账号胶囊要按分数上色，
   * 与「校验存在」共用这一次 user.info。
   *
   * 逐个校验而不是一次性 `user.info?handles=a;b`：CF 那个接口只要有一个 handle 不存在
   * 就整体 FAILED，分不出是哪一个拼错了；而且逐个走的是各自 1h 的缓存，命中时是瞬时的。
   */
  async checkHandles(message) {
    const handles = normalizeHandles(message.handles)
    const results = []
    for (const handle of handles) {
      const outcome = await verifyHandle(handle)
      results.push({
        // 校验通过就报 CF 的官方写法；不存在 / 连不上没有官方名字，原样回用户的填法
        handle: outcome.handle || handle,
        valid: outcome.ok,
        reason: outcome.reason,
        rating: outcome.rating ?? null,
      })
    }
    return { results }
  },

  /**
   * 这几个账号已通过（AC）的题，多账号取**并集**。抽题结果区的「已通过」标记与
   * 「排除已通过的题」读的是同一份 `loadSolvedKeys` 缓存（12h），所以两处不会各拉一次
   * user.status，也不会出现「排除掉了但没标上」这种自相矛盾的画面。
   *
   * 回的是 `problemKey` 字符串数组（`<contestId>:<INDEX>`），**不在这里换成 url** ——
   * 键的口径归 `pick.js` 一处管，主线程按同一把尺子转（见 services/solvedIndex.js）。
   * 没有账号时回空数组（不是错误）：手动标记照样能用，只是没有自动那一半。
   */
  async solved(message) {
    const keys = new Set()
    for (const handle of normalizeHandles(message.handles)) {
      for (const key of await loadSolvedKeys(handle, { force: message?.force === true })) {
        keys.add(key)
      }
    }
    return { keys: [...keys] }
  },

  /** 抽题：读库 → （可选）取已 AC → 跑算法 → 只回抽中的那几道 */
  async pick(message) {
    const filters = message.filters || {}
    const problems = await loadProblemset()

    // 比赛类别（Div. 1/2/3/4、Edu、Div. 1+2、Global、Others）：把选中的几类翻成一个
    // contestId 集合。没勾就是 null，题库整个参与抽取。见 contestIdsOfCategories。
    const contestIds = await contestIdsOfCategories(filters.divisions, problems)

    // 「排除已通过的题」支持多个账号：取各自已 AC 的**并集**，
    // 于是留下的就是「这些账号都没做过的题」。
    // 主线程还会递来 `solvedExtra`（站内提交判 AC + 手动标记的键）：这些题在 user.status
    // 的 12h 缓存里还看不见，不并进去就会出现「勾着已通过、又被抽出来」。
    const handles = normalizeHandles(filters.handles)
    const extraSolved = Array.isArray(filters.solvedExtra)
      ? filters.solvedExtra.filter((key) => typeof key === 'string' && key)
      : []
    let solvedSet = null
    if (filters.excludeSolved && (handles.length || extraSolved.length)) {
      solvedSet = new Set(extraSolved)
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
      contestIds,
      // 题号（A–M）：只留首字母命中的，`B1` / `B2` 也算 B 题（见 pick.js 的 problemLetter）
      letters: normalizeLetters(filters.letters),
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

  /**
   * 比赛的元数据（名字、阶段、开赛时间）。
   *
   * 【为什么和题目列表分成两条消息】倒计时是开赛前唯一要看的东西，而题目列表可能要
   * 要拉一次整场榜单（裸参 2–6MB，见 loadContestProblems）。合成一条的话，用户为了看倒计时要等十几秒。
   * 拆开之后元数据先到、界面立刻有东西，题目列表随后自己补上。
   *
   * 返回的 `fetchedAt` 是**元数据取回来的本地时刻**，倒计时拿它算「这份数据放了多久」。
   *
   * `force` 绕过 1 小时列表缓存。**只在「查改期」时给**（延期态下的稀疏退避，一次 413KB）；
   * 倒计时归零那一刻不再 force —— 那条路走 standings，它成功时自带 `contest`（见
   * loadContestProblems），比 force 一份整列表便宜三个数量级。
   */
  async contest(message) {
    const spec = contestSpecOf(message)

    // group 的比赛不进 contest.list：名字与开赛时间都拿不到
    const meta =
      spec.kind === 'group'
        ? null
        : await findContest(spec.contestId, spec.kind === 'gym', message?.force === true)

    return {
      contest: meta?.contest ?? null,
      fetchedAt: meta?.fetchedAt ?? 0,
      // 查过但列表里没有这场（取消 / 换场），与「没查到」不是一回事 —— 见 findContest
      missing: meta?.missing === true,
    }
  },

  /** 某场比赛的题目列表（唯一来源是 standings，按场次缓存 —— 见 loadContestProblems） */
  async contestProblems(message) {
    const spec = contestSpecOf(message)
    const { problems, source, pending, contest } = await loadContestProblems(spec.contestId)

    return {
      source,
      pending: pending === true,
      // standings 顺路带回来的最新元数据（没打网络时为 null）—— 见 loadContestProblems 的说明
      contest: contest ?? null,
      problems: problems.map((problem) => {
        const index = String(problem.index ?? '').toUpperCase()
        return {
          contestId: spec.contestId,
          index,
          name: problem.name ?? '',
          rating: typeof problem.rating === 'number' ? problem.rating : null,
          tags: problem.tags || [],
          // task 在这里现拼：cfProblemToTask 只会拼 /contest/…，gym 与 group 的链接是另一种形态。
          // 名字用「题号 + 点 + 题名」（A. 1+2=3）而不是带上比赛 ID —— 比赛导入的文件会落在
          // 以比赛名命名的目录里，比赛 ID 是多余前缀，同一场里也不会撞名（2026-10-26 用户口径）
          task: {
            name: `${index}. ${problem.name ?? ''}`.trim(),
            url: contestProblemUrl(spec, index),
            timeLimit: 0,
            tests: [],
          },
        }
      }),
    }
  },

  /**
   * 赛程：非 gym 的整份比赛列表。界面自己按 phase 分成「进行中 / 即将开始 / 最近结束」。
   * force=true 用于手动刷新与倒计时归零后的确认。
   */
  async contests(message) {
    const { list, fetchedAt } = await loadContestList(false, { force: message?.force === true })
    return { contests: list, fetchedAt }
  },

  /**
   * 排行榜。走与题目列表同一个 standings 请求（共享内存复用），返回完整的 contest /
   * problems / rows —— 主线程拿去做行归一化与分页（见 cf/standings.js）。
   *
   * 还没开赛不是错误：回 `{ pending: true }`，界面说「开赛后才有榜单」。
   */
  async standings(message) {
    const spec = contestSpecOf(message)
    try {
      const payload = await requestStandings(spec.contestId, { force: message?.force === true })
      return {
        contest: payload.contest,
        problems: payload.problems,
        rows: payload.rows,
        fetchedAt: payload.fetchedAt,
      }
    } catch (error) {
      if (error?.code === 'CONTEST_NOT_STARTED') {
        return { pending: true, contest: null, problems: [], rows: [], fetchedAt: Date.now() }
      }
      throw error
    }
  },

  /** 提交记录（最新在前）。count 上限 1000，见 loadContestStatus */
  async submissions(message) {
    const spec = contestSpecOf(message)
    const { rows, fetchedAt } = await loadContestStatus({
      contestId: spec.contestId,
      handle: message?.handle,
      count: message?.count,
    })
    return { rows, fetchedAt }
  },

  /** 按提交号取单条（提交通知补细节用） */
  async submissionDetail(message) {
    const contestId = String(message?.contestId ?? '').trim()
    const submissionId = String(message?.submissionId ?? '').trim()
    if (!/^\d+$/.test(contestId) || !/^\d+$/.test(submissionId)) {
      const error = new Error('bad-submission-id')
      error.code = 'BAD_SUBMISSION_ID'
      throw error
    }
    return loadSubmission({ contestId, submissionId, count: message?.count })
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
