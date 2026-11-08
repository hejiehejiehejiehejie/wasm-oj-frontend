/**
 * cfClient —— 主线程侧的 Codeforces Worker 客户端。
 *
 * 只做三件事：单例 Worker 的生命周期、「发一条消息 / 等它回」包成 Promise、
 * 把 Worker 主动推的进度转发给订阅者。业务语义（筛选条件怎么来的、结果长什么样）
 * 不在这一层 —— 它只保证「postMessage 出去，resolve/reject 回来」这条信道可靠。
 *
 * 【Worker 必须惰性创建】不 import 本模块就永远不 new Worker：抽题是可选组件，
 * 没下载 / 没用过的用户不该平白多起一个后台线程。
 *
 * 【为什么 worker 的 URL 写死在 new Worker(...) 里，不抽成常量】
 * Vite 只在 `new Worker(new URL('...', import.meta.url))` **成对字面量出现**时才认得这是
 * 一个 worker 入口，从而 dev 按模块直出、build 单独打成一个 chunk。一旦把 URL 存进
 * 常量再传进来，构建期就分析不到，产物里会留一个指向不存在文件的 Worker —— 本地不报错，
 * 上线才 404。所以这一行必须原样保留这种写法。
 *
 * 【Worker 崩了怎么办】onerror 里把所有在途请求一起失败掉。否则调用方的
 * `await cfPick(...)` 会永远挂着，界面就卡在「抽取中…」再也不会变。
 */
/** @type {Worker | null} */
let worker = null
let nextId = 1
/**
 * @type {Map<number, { resolve: (value: any) => void, reject: (error: Error) => void, payload: object }>}
 * payload 也要留着 —— worker 脚本取不到时，这条请求要**原样重投**给换上的新 worker
 * （见下面的 rescueWorker）。
 */
const pending = new Map()
/** @type {Set<(stage: string) => void>} */
const progressListeners = new Set()
/**
 * 兜底只做一次。首选 URL 与「清单里那个」都起不来时就别再找了，直接把错误抛给调用方
 * —— 否则每次请求都会多一趟清单请求，还会在离线时反复空转。
 */
let rescueTried = false

/** 把 Worker 回的失败信封翻成一个带 code 的 Error，调用方据此分辨 NO_MATCH / 网络错误 */
function toError(message) {
  const error = new Error(message?.message || message?.code || 'Codeforces request failed')
  error.code = message?.code || 'ERROR'
  return error
}

/** 让所有在途请求一起失败（Worker 崩了 / 被销毁时） */
function failAll(error) {
  const entries = [...pending.values()]
  pending.clear()
  for (const entry of entries) entry.reject(error)
}

/**
 * 本站「当前部署」的 cfWorker 文件名。
 *
 * 【为什么需要】这个 Worker 是**按需**起的：页面打开时不加载，点「下载题库」/抽题时才
 * `new Worker(...)`。而站点装成 PWA 之后由 SW 接管，SW 换版时会按 /retain-manifest.json
 * 把外壳桶里「不在当前清单里」的 /assets/ 条目清掉（见 sw.js 的 pruneStaleShellArtifacts）。
 * 于是**停留在旧版本页面**上的用户去点下载：这个 chunk 桶里已被清、服务器上是新部署
 * （Vercel 只保留当次构建）—— 两头都没有，404。而 404 触发的 ErrorEvent 的 message 是
 * **空字符串**，于是界面只显示 cfClient 的兜底文案「Codeforces worker error」，看不出真因。
 * （2026-10-30 实测：`new Worker('/assets/cfWorker-DOES-NOT-EXIST.js')` 的 onerror
 * message 为空；同一个文件存在时能正常回 status。）
 *
 * 【所以】发现脚本取不到时，去清单里找**当前部署**的那个 cfWorker 顶上。它加载的是一整套
 * 同代资源（相对 URL 都指回自己的 chunk 目录），所以自洽；消息协议是同一份代码演进出来的，
 * 旧主线程发的那几种 type 新 worker 全认。
 *
 * 【⚠️ 清单请求必须带时间戳】`/retain-manifest.json` 落在外壳桶里走 cacheFirst，
 * 不带差异的 URL 会拿回**上一版**的清单（里面列的正是已经被删掉的那些文件）。
 * 带一个变化的 query 就绕开了 caches.match，直接问网络。
 *
 * 【协议约束】这个兜底成立的前提是「type 只增不改」。将来真要改某个 type 的入参 / 出参形状，
 * 得先想清楚旧页面会不会用新 worker —— 不能直接改，要么加新 type，要么两版并存。
 */
async function currentWorkerUrl() {
  try {
    const response = await fetch(`/retain-manifest.json?v=${Date.now()}`, { cache: 'no-store' })
    if (!response.ok) return ''
    const manifest = await response.json()
    const entry = (manifest?.shell || []).find((path) => /(^|\/)cfWorker-[\w-]+\.js$/.test(path))
    return entry ? new URL(entry, window.location.origin).href : ''
  } catch {
    return ''
  }
}

/**
 * 首选脚本取不到时换一个能起的，并把在途请求原样重投过去。
 *
 * 不做「清单里的是不是同一个文件」这种比较 —— 要拿到当前脚本的 URL 就得再写一次
 * `new URL('../cf/cfWorker.js', import.meta.url)`，而 Vite 会把它当成静态资源**再打一份**
 * 产物（实测：多出一个 33KB 的未压缩 cfWorker）。所以这里不比较，直接试一次；
 * 万一清单里就是同名的那个，它照样会 onerror，落回下面的 failAll，代价只是一次空跑。
 */
async function rescueWorker() {
  const url = await currentWorkerUrl()
  if (!url) {
    failAll(workerFailure())
    return
  }

  let next
  try {
    next = new Worker(url, { type: 'module' })
  } catch {
    failAll(workerFailure())
    return
  }

  attach(next)
  worker = next

  // 在途的请求一条都不能丢：id 保持不变，新 worker 回信时对得上
  for (const entry of pending.values()) next.postMessage(entry.payload)
}

function workerFailure(detail) {
  // detail 是 Worker 内部抛错时 ErrorEvent 给的那句原文（脚本取不到时它是空的）
  const error = new Error(detail || 'Codeforces worker error')
  error.code = 'WORKER_ERROR'
  return error
}

/**
 * 给一颗 worker 挂上消息与错误处理。首次创建与兜底换代共用这一份 ——
 * 两处各写一份的话，兜底那颗会漏掉 progress 转发，抽题进度就卡住不动了。
 * @param {Worker} target
 */
function attach(target) {
  target.onmessage = (event) => {
    const message = event.data
    if (!message || typeof message !== 'object') return

    // 主动推送的进度：不是响应，不进 pending 表
    if (message.type === 'progress') {
      for (const listener of progressListeners) listener(message.stage)
      return
    }

    const entry = pending.get(message.id)
    if (!entry) return
    pending.delete(message.id)
    if (message.ok) entry.resolve(message)
    else entry.reject(toError(message))
  }

  target.onerror = (event) => {
    // 这颗 worker 不管怎么坏的都已经不可用了：先丢掉引用，下一次请求重新起一颗。
    // （漏了这一句的后果不是「慢一点」—— 后面请求会往死掉的 worker postMessage，
    //  Promise 永远不结算，界面就卡在「下载中…」，比报错更糟。）
    worker = null

    // message 与 filename 都为空 = 脚本根本没取到（404 / 离线 / MIME 不对），
    // 不是 worker 里抛了异常。只有这种才值得换一个 URL 再试。
    const scriptMissing = !event?.message && !event?.filename
    if (scriptMissing && !rescueTried) {
      rescueTried = true
      // 兜底本身也不许静默失败：它一挂就把在途请求全部收掉，别让调用方干等
      void rescueWorker().catch(() => failAll(workerFailure()))
      return
    }
    failAll(workerFailure(event?.message))
  }
}

function ensureWorker() {
  if (worker) return worker

  // ⚠️ 这一行的 URL 字面量必须**紧贴** new Worker(...)：Vite 只在
  // `new Worker(new URL('...', import.meta.url))` **成对出现**时才认得这是 worker 入口，
  // 抽成常量传进来构建期就分析不到，产物里会留一个指向不存在文件的 Worker（本地不报错，
  // 上线才 404）。反过来也别在这附近另写一句裸 `new URL('...', import.meta.url)` ——
  // 构建器会把它当成静态资源，给同一个 worker **多打一份**产物（2026-10-30 踩过）。
  worker = new Worker(new URL('../cf/cfWorker.js', import.meta.url), { type: 'module' })
  attach(worker)

  return worker
}

/**
 * 发一条请求并等响应。
 * @param {Record<string, unknown>} payload 至少含 type
 * @returns {Promise<any>} 响应信封（含 ok:true 与各 type 自己的字段）
 */
function request(payload) {
  const target = ensureWorker()
  const id = nextId
  nextId += 1
  const envelope = { id, ...payload }
  return new Promise((resolve, reject) => {
    // payload 存下来是为了兜底换代时重投同一个信封（见 rescueWorker）
    pending.set(id, { resolve, reject, payload: envelope })
    target.postMessage(envelope)
  })
}

/**
 * 订阅 Worker 进度。stage 是机器码，文案由调用方翻译。
 * @param {(stage: string) => void} listener
 * @returns {() => void} 取消订阅
 */
export function onCfProgress(listener) {
  progressListeners.add(listener)
  return () => progressListeners.delete(listener)
}

/** 缓存状态：题库有没有、多少道、什么时候拉的 */
export function cfStatus() {
  return request({ type: 'status' })
}

/** 预取题库（组件「下载」时调用）；force=true 无视缓存重拉 */
export function cfPrefetch({ force = false } = {}) {
  return request({ type: 'prefetch', force })
}

/** 抽题。失败时 reject 的 Error.code 可能是 NO_MATCH / WORKER_ERROR / ERROR */
export function cfPick(filters) {
  return request({ type: 'pick', filters })
}

/**
 * 校验若干 CF 账号是否存在，resolve `{ results: [{ handle, valid, reason, rating }] }`。
 * reason ∈ `'ok' | 'not_found' | 'network'`；**账号不存在不会 reject**
 * （那是业务结论不是故障），只有 Worker 本身出事才会 reject。
 * 字段叫 valid 不叫 ok，是为了跟信封的 ok（这次调用成没成功）区分开，见 cfWorker.js。
 * `rating` 是同一份 user.info 顺带留下的分段（未定级 / 不存在 / 连不上都是 null），
 * 账号胶囊按它上色 —— 别为分数再调一次接口。
 * @param {string[]} handles
 */
export function cfCheckHandles(handles) {
  return request({ type: 'checkHandles', handles })
}

/**
 * 取这些账号**已通过（AC）**的题目键（`<contestId>:<INDEX>`，多账号并集）。
 *
 * 与「排除已通过的题」共用 Worker 里那份 12h 缓存（`loadSolvedKeys`），
 * 所以界面上的「已通过」标记与抽题时的排除判据永远是同一份数据。
 * 没有账号时 Worker 回空数组 —— 那不是失败，只表示自动那一半不可用。
 *
 * @param {string[]} handles
 * @param {{ force?: boolean }} [options] force=true 无视缓存重拉（12h 内刚 AC 的题要靠它）
 * @returns {Promise<{ keys: string[] }>}
 */
export function cfSolved(handles, { force = false } = {}) {
  return request({ type: 'solved', handles, force })
}

/**
 * 取一场比赛的元数据（名字、阶段、开赛时间）。`parseContestSpec` 的产物直接传进来。
 *
 * 与 cfContestProblems 分两条消息是刻意的：倒计时要在开赛前就能看，
 * 而题目列表可能要先拉题库（2MB）甚至兜底榜单（5.9MB）。合成一条会让倒计时跟着一起等。
 *
 * 失败时 reject 的 Error.code 见 cfContestProblems。`contest` 可能为 null ——
 * group 的比赛不在 contest.list 里，拿不到元数据但题目列表仍可能拿到。
 * @param {{ kind: string, contestId: string, groupId?: string }} spec
 */
export function cfContest(spec) {
  return request({
    type: 'contest',
    contestId: spec?.contestId,
    kind: spec?.kind,
    groupId: spec?.groupId,
  })
}

/**
 * 取一场比赛的题目列表。
 *
 * 失败时 reject 的 Error.code 可能是：
 *   BAD_CONTEST_ID       ID 不合法（正常走不到，调用方已解析过）
 *   CONTEST_NEEDS_LOGIN  gym / group 的榜单要 CF 凭据，浏览器这边拿不到 —— 是能力边界，
 *                        不是故障，界面该说「这类比赛要靠浏览器扩展」
 *   WORKER_ERROR / ERROR 其余（网络、CF 侧拒绝）
 * @param {{ kind: string, contestId: string, groupId?: string }} spec
 */
export function cfContestProblems(spec) {
  return request({
    type: 'contestProblems',
    contestId: spec?.contestId,
    kind: spec?.kind,
    groupId: spec?.groupId,
  })
}

/**
 * 赛程用的比赛列表（非 gym）。resolve `{ contests, fetchedAt }`，条目字段见 cfWorker 的
 * loadContestList（含 `type`：CF / ICPC / IOI，榜单列形靠它）。
 * @param {{force?: boolean}} [options] 赛程刷新 / 倒计时归零后确认翻面时用 force
 */
export function cfContests({ force = false } = {}) {
  return request({ type: 'contests', force })
}

/**
 * 某场比赛的排行榜。resolve `{ contest, problems, rows, fetchedAt }`；
 * 还没开赛时是 `{ pending: true, rows: [] }` —— 那不是错误。
 *
 * 失败时 reject 的 Error.code 与 cfContestProblems 同族（CONTEST_NEEDS_LOGIN / RATE_LIMITED / …）。
 * @param {{ kind: string, contestId: string, groupId?: string }} spec
 * @param {{force?: boolean}} [options]
 */
export function cfStandings(spec, { force = false } = {}) {
  return request({
    type: 'standings',
    contestId: spec?.contestId,
    kind: spec?.kind,
    groupId: spec?.groupId,
    force,
  })
}

/**
 * 某场比赛的提交记录（最新在前）。resolve `{ rows, fetchedAt }`，rows 是 CF 原始 Submission 对象。
 *
 * count 在 Worker 侧收敛到 1..1000：**永远不全量拉**（旧比赛整场 60 万条）。
 * @param {{ kind: string, contestId: string, groupId?: string }} spec
 * @param {{handle?: string, count?: number}} [options]
 */
export function cfSubmissions(spec, { handle = '', count = 200 } = {}) {
  return request({
    type: 'submissions',
    contestId: spec?.contestId,
    kind: spec?.kind,
    groupId: spec?.groupId,
    handle,
    count,
  })
}

/**
 * 按提交号取单条提交（提交通知补细节用）。resolve `{ submission }`，找不到时 submission 为 null。
 * 与其它接口共用 Worker 里那条 1 次 / 2.1 秒的全局闸门 —— 别再在主线程另排队。
 * @param {{contestId: string, submissionId: string, count?: number}} input
 */
export function cfSubmissionDetail({ contestId, submissionId, count = 1000 }) {
  return request({ type: 'submissionDetail', contestId, submissionId, count })
}

/** 清空本地缓存（卸载组件） */
export function cfClear() {
  return request({ type: 'clear' })
}
