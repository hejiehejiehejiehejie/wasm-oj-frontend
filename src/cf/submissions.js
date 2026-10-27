/**
 * submissions.js —— Codeforces 提交记录的**纯逻辑**：行归一化、增量合并、判定配色。
 *
 * 与 standings.js 同一性质：无框架、无网络、无存储，能在 Node 里直接跑。
 * 界面（CfSubmissionList.vue）只管画。
 *
 * 【为什么要合并而不是整份替换】比赛中的提交流是轮询来的（5 秒一次），每次只取最近 N 条。
 * 用户往下翻过的旧记录不能因为下一次轮询就消失，所以按 id 去重后并进同一份，按时间倒序截断。
 *
 * 【状态码口径】CF 的 `verdict` 是枚举字符串，TESTING / SUBMITTED 不是终态 —— 界面要把它们
 * 画成「进行中」，不能当成失败。其余枚举一个不落地映射到短码（AC / WA / TLE …），
 * 与站内评测卡片、扩展通知用的是同一套判定码（见 services/ojSubmit.js 的 VERDICT_KEYS）。
 */

/** CF verdict 枚举 → 站内短码。没列到的原样落成空串，界面显示 `?` 而不是假装成功 */
const VERDICT_CODES = {
  OK: 'AC',
  WRONG_ANSWER: 'WA',
  TIME_LIMIT_EXCEEDED: 'TLE',
  MEMORY_LIMIT_EXCEEDED: 'MLE',
  RUNTIME_ERROR: 'RE',
  COMPILATION_ERROR: 'CE',
  PRESENTATION_ERROR: 'PE',
  IDLENESS_LIMIT_EXCEEDED: 'ILE',
  SECURITY_VIOLATED: 'SV',
  CRASHED: 'CRASHED',
  INPUT_PREPARATION_CRASHED: 'IPC',
  FAILED: 'FAILED',
  PARTIAL: 'PARTIAL',
  CHALLENGED: 'CHALLENGED',
  SKIPPED: 'SKIPPED',
  REJECTED: 'REJECTED',
  TESTING: 'TESTING',
  SUBMITTED: 'SUBMITTED',
}

/** CF 自己的全名（提交页悬停/详情里给的就是这一串）。属数据，不进 i18n 表 */
const VERDICT_NAMES = {
  OK: 'Accepted',
  WRONG_ANSWER: 'Wrong answer',
  TIME_LIMIT_EXCEEDED: 'Time limit exceeded',
  MEMORY_LIMIT_EXCEEDED: 'Memory limit exceeded',
  RUNTIME_ERROR: 'Runtime error',
  COMPILATION_ERROR: 'Compilation error',
  PRESENTATION_ERROR: 'Presentation error',
  IDLENESS_LIMIT_EXCEEDED: 'Idleness limit exceeded',
  SECURITY_VIOLATED: 'Security violated',
  CRASHED: 'Denial of judgement',
  INPUT_PREPARATION_CRASHED: 'Input preparation crashed',
  FAILED: 'Failed',
  PARTIAL: 'Partial result',
  CHALLENGED: 'Hacked',
  SKIPPED: 'Skipped',
  REJECTED: 'Rejected',
  TESTING: 'Testing',
  SUBMITTED: 'Submitted',
}

/** 还在跑的判定：界面挂 pending 态，轮询会把它换成终态 */
const PENDING_VERDICTS = new Set(['TESTING', 'SUBMITTED'])

/**
 * `relativeTimeSeconds` 的可信上限。
 *
 * 【为什么需要它】赛后 / 练习提交（PRACTICE）CF 会把该字段填成 INT32_MAX
 * （2147483647）。那是「没有比赛内时刻」的哨兵，不是秒数 —— 照常格式化会得到
 * `596523:14`，把 46px 的时间列撑爆、压到题号上。比赛窗口最长也就十几天，
 * 取 100 天作上限：超出的一律当「没有比赛内时刻」，界面退回本地时间。
 */
const RELATIVE_TIME_MAX = 100 * 24 * 60 * 60

function contestRelativeTime(value) {
  if (!Number.isFinite(value) || value < 0 || value >= RELATIVE_TIME_MAX) return null
  return value
}

/**
 * verdict → 色调。只有四级：
 *   ok      —— AC
 *   warn    —— PARTIAL（有分但不完整）
 *   fail    —— 确定没通过（WA / TLE / RE / CE …）
 *   pending —— 还没判完
 *   muted   —— 不算结果的（SKIPPED / REJECTED / 未知枚举）
 */
export function verdictTone(verdict) {
  const code = String(verdict ?? '').toUpperCase()
  if (code === 'OK') return 'ok'
  if (code === 'PARTIAL') return 'warn'
  if (PENDING_VERDICTS.has(code)) return 'pending'
  if (!code || code === 'SKIPPED' || code === 'REJECTED') return 'muted'
  return 'fail'
}

/** 是否终态。轮询据此决定还要不要把这条记录挂着 */
export function isFinalVerdict(verdict) {
  return !PENDING_VERDICTS.has(String(verdict ?? '').toUpperCase())
}

/**
 * 一条 contest.status 原始行 → 界面行。
 *
 * 不在这里算「距今多久」：那是相对时间，每次渲染都要按当时钟重算，在纯模块里存成定值
 * 会在面板开着的时候慢慢过期。界面拿 `submittedAt` 现算（或直接用本地时间格式化）。
 *
 * @param {object} row CF `contest.status` 的一行
 */
export function normalizeSubmission(row) {
  const problem = row?.problem || {}
  const author = row?.author || {}
  const members = (author.members || [])
    .map((member) => String(member?.handle ?? '').trim())
    .filter(Boolean)
  const teamName = typeof author.teamName === 'string' ? author.teamName : ''
  const verdict = String(row?.verdict ?? '').toUpperCase()

  return {
    id: row?.id ?? null,
    contestId: row?.contestId ?? problem.contestId ?? null,
    problemIndex: String(problem.index ?? '').toUpperCase(),
    problemName: typeof problem.name === 'string' ? problem.name : '',
    members,
    authorName: teamName || members.join(', '),
    participantType: author.participantType || 'CONTESTANT',
    ghost: author.ghost === true,
    language: typeof row?.programmingLanguage === 'string' ? row.programmingLanguage : '',
    verdict,
    verdictCode: VERDICT_CODES[verdict] || '',
    verdictName: VERDICT_NAMES[verdict] || verdict,
    tone: verdictTone(verdict),
    passedTestCount: Number.isInteger(row?.passedTestCount) ? row.passedTestCount : null,
    timeMs: Number.isInteger(row?.timeConsumedMillis) ? row.timeConsumedMillis : null,
    memoryBytes: Number.isInteger(row?.memoryConsumedBytes) ? row.memoryConsumedBytes : null,
    submittedAt: Number.isFinite(row?.creationTimeSeconds) ? row.creationTimeSeconds : 0,
    relativeTime: contestRelativeTime(row?.relativeTimeSeconds),
  }
}

/**
 * Worker 回来的 `{ rows, fetchedAt }` → `{ rows, fetchedAt }`（行已归一化）。
 * 排序保持 **id 倒序**：同一秒内的提交 CF 也是按 id 递增落库的，用时间排序会抖。
 */
export function normalizeSubmissions(payload) {
  const rows = (payload?.rows || []).map(normalizeSubmission)
  rows.sort((a, b) => (b.id ?? 0) - (a.id ?? 0))
  return { rows, fetchedAt: payload?.fetchedAt || 0 }
}

/** 增量合并的容量上限：翻到很旧的提交没有意义，也避免轮询把内存越堆越大 */
export const SUBMISSION_CAP = 1000

/**
 * 把新一页并进已有列表：按 id 去重、新的覆盖旧的（判定会从 TESTING 变成终态）、
 * 按 id 倒序截断到 `cap`。
 *
 * @param {object[]} previous 已归一化的行（倒序）
 * @param {object[]} incoming 新归一化的行（倒序）
 * @param {{cap?: number}} [options]
 */
export function mergeSubmissions(previous, incoming, { cap = SUBMISSION_CAP } = {}) {
  const merged = new Map()
  for (const row of previous || []) if (row?.id != null) merged.set(row.id, row)
  for (const row of incoming || []) if (row?.id != null) merged.set(row.id, row)

  return [...merged.values()]
    .sort((a, b) => (b.id ?? 0) - (a.id ?? 0))
    .slice(0, Math.max(1, cap))
}

/**
 * 「只看我」的判据。团队赛任何一名成员命中都算 —— 与 standings 的 findMyRow 同一口径。
 * @param {object[]} rows
 * @param {string[]} handles
 */
export function filterMine(rows, handles) {
  const targets = new Set((handles || []).map((handle) => String(handle).toLowerCase()))
  if (!targets.size) return []
  return (rows || []).filter((row) =>
    (row?.members || []).some((handle) => targets.has(String(handle).toLowerCase())),
  )
}

/**
 * 比赛里的个人小结：过题与尝试。
 *
 * 【只数 `OK`】PARTIAL（IOI 的部分分）不算过题；同一题的多次 AC 只算一次。
 *
 * @param {object[]} rows 已按「只看我」筛过的行
 */
export function summarizeMine(rows) {
  const solved = new Set()
  const attempted = new Set()
  let accepted = 0
  let rejected = 0

  for (const row of rows || []) {
    const index = row?.problemIndex
    if (index) attempted.add(index)
    if (row?.verdict === 'OK') {
      accepted += 1
      if (index) solved.add(index)
    } else if (row?.tone === 'fail') {
      rejected += 1
    }
  }

  return {
    accepted,
    rejected,
    solved: [...solved].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })),
    attempted: attempted.size,
  }
}
