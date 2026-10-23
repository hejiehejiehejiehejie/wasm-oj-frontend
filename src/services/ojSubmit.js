/**
 * ojSubmit —— 「一键提交到 OJ」的唯一前端边界（2026-10-23 加）。
 *
 * 三件事：把活跃文件映射成「哪道题 + 哪种语言」、算出可不可提交、把扩展回来的
 * 失败原因 / 判定码翻成人话。真正的提交动作在扩展里（见 useCompanionBridge 的
 * requestSubmit）—— 本站自己提交不了：提交页要 CSRF token，跨源也读不到登录 cookie。
 *
 * 【首版只认 Codeforces】其余 OJ 的提交页各有各的形态（洛谷要 token、牛客/LeetCode
 * 是接口），一次只做通一条。认不出来的一律置灰并说清「只支持 Codeforces」，不装作能交。
 *
 * 【提交的是未保存的正文】`peekActiveContent()` 取的是 Monaco 当前的 model 值，
 * 不是磁盘上的旧版本 —— 「一键提交」要交的就是眼前这一份，先存盘反而多一步。
 *
 * 【为什么地址解析不设在后台】扩展也要解析一遍（它自己算出提交页，不信任网页递过来的
 * 任意 URL）。两份解析必须同口径：这里认 contest / problemset / gym / group 四种写法，
 * 与 cph-companion 的 background 一一对应；改一处就要改另一处。
 */
import { activeLanguage, activeNode, peekActiveContent } from './vfs/workspaceStore.js'
import { canSubmitCode, requestSubmit } from '../composables/useCompanionBridge.js'
import { IS_DESKTOP } from './platform.js'
import { t } from '../i18n/index.js'

/** 只认正牌 codeforces.com。镜像站（m1 / m2 / codeforces.ml）是另一套登录态，不替它提交 */
const CF_HOSTS = new Set(['codeforces.com', 'www.codeforces.com'])

/** CF 的题号都是 A / B1 / C2 这种短串；不合法就别往下算提交页 */
const CF_INDEX = /^[A-Z]\d{0,2}$/i

/**
 * 把题目页地址解析成 Codeforces 的提交页。
 *
 * 四种写法（与 problemUrlKey 认的两种相比，这里多出 gym / group —— 提交路径不同，
 * 不能再归一成 contest）：
 *   /contest/{id}/problem/{index}        → /contest/{id}/submit
 *   /problemset/problem/{id}/{index}     → /contest/{id}/submit
 *   /gym/{id}/problem/{index}            → /gym/{id}/submit
 *   /group/{gid}/contest/{cid}/problem/{index} → /group/{gid}/contest/{cid}/submit
 *
 * @param {string} url
 * @returns {{ contestPath: string, index: string, submitUrl: string, myUrl: string }|null}
 */
export function parseCodeforcesProblem(url) {
  if (typeof url !== 'string' || !url) return null

  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  if (!CF_HOSTS.has(parsed.hostname)) return null

  const segments = parsed.pathname.split('/').filter(Boolean)
  let contestPath = ''
  let index = ''

  if (segments.length === 4 && segments[0] === 'contest' && segments[2] === 'problem') {
    contestPath = `/contest/${segments[1]}`
    index = segments[3]
  } else if (segments.length === 4 && segments[0] === 'problemset' && segments[1] === 'problem') {
    contestPath = `/contest/${segments[2]}`
    index = segments[3]
  } else if (segments.length === 4 && segments[0] === 'gym' && segments[2] === 'problem') {
    contestPath = `/gym/${segments[1]}`
    index = segments[3]
  } else if (
    segments.length === 6 &&
    segments[0] === 'group' &&
    segments[2] === 'contest' &&
    segments[4] === 'problem'
  ) {
    contestPath = `/group/${segments[1]}/contest/${segments[3]}`
    index = segments[5]
  } else {
    return null
  }

  if (!CF_INDEX.test(index)) return null

  const origin = `https://${parsed.hostname}`
  return {
    contestPath,
    index: index.toUpperCase(),
    submitUrl: `${origin}${contestPath}/submit`,
    myUrl: `${origin}${contestPath}/my`,
  }
}

/**
 * 「这个文件是不是一道题」—— 提交按钮的第一道闸门。
 *
 * 它**不再单独决定按钮出不出**：还要 `submitBlockedReason()` 为空才真的显示
 * （2026-10-23 用户要求「如果无法提交，干脆就不要显示这个按钮」）。
 * 洛谷题（非 CF）在这里为 true，随后被 blockedOj 挡掉、按钮不渲染；桌面壳直接 false。
 */
export function shouldShowSubmit(node) {
  return !IS_DESKTOP && Boolean(node?.meta?.url)
}

/**
 * 不可提交的原因（空串 = 可以提交）。
 *
 * `checking` 是扩展握手还在路上的那一小段时间：此时别急着说「没装插件」，
 * 与空态那句 awaitingNoExtension 同一个口径。
 */
export function submitBlockedReason({ node, language, capability, checking }) {
  if (IS_DESKTOP) return t('tests.submit.blockedDesktop')
  if (!node) return t('tests.submit.blockedNoFile')
  if (!node.meta?.url) return t('tests.submit.blockedNoProblem')
  if (!parseCodeforcesProblem(node.meta.url)) return t('tests.submit.blockedOj')
  if (!language) return t('tests.submit.blockedLanguage')
  if (checking) return t('tests.submit.blockedChecking')
  if (!capability) return t('tests.submit.blockedExtension')
  return ''
}

/**
 * 提交当前文件。调用方（App.vue）负责先过闸门、发通知。
 *
 * @param {{onVerdict?: (status: {submissionId: string, verdict: string}) => void}} [options]
 * @returns {Promise<{ok: boolean, reason: string, submissionId: string, verdict: string, requestId: string}>}
 */
export function submitActiveSolution({ onVerdict } = {}) {
  const node = activeNode.value
  const language = activeLanguage.value
  const source = peekActiveContent()

  if (!node || !parseCodeforcesProblem(node.meta?.url) || !language || !source || !source.trim()) {
    return Promise.resolve({ ok: false, reason: 'unsupported', submissionId: '', verdict: '', requestId: '' })
  }

  return requestSubmit({ url: node.meta.url, source, language }, onVerdict)
}

/**
 * 用官方 API 补「这一条提交」的细节（2026-10-23 加）。
 *
 * 【为什么不靠扩展】扩展在 `/my` 页上只读得出判定码；挂在第几个测试点、耗时、内存都在
 * Submission 对象里（见官方 apiHelp）。站内直连 CF API 即可：接口回
 * `access-control-allow-origin: *`，匿名就能读公开数据，不必经扩展、也不必知道 handle。
 *
 * 【怎么定位这一条】`contest.status` 按提交 id 倒序返回；刚交完的那条就在最前面。
 * 官方没有「按 submissionId 取单条」的方法，所以只能取一页再按 id 找。`count=1000`
 * 是为了扛住比赛高峰（页面那 20 秒里可能又涌进几百条）。
 *
 * 【为什么给 12 秒超时】这个接口的耗时跟比赛新旧强相关（2026-10-23 实测）：最近一场
 * 1.3s，水题 4A 这类老比赛要 8~9s。所以调用方是在**拿到提交号时就开始查**（与评测并行），
 * 判定回来时结果通常已经在了；真拿不到也只是一条通知少点细节。
 *
 * 【拿不到就退回去】gym / 群组、比赛进行中的可见性限制、限流（1 次 / 2 秒）、网络问题，
 * 一律返回 null —— 调用方继续用扩展给的判定码，不让一条通知被 API 拖住。
 */
const DETAIL_COUNT = 1000

/**
 * CF 的 verdict 枚举 → 站内的判定码（与扩展那套一致）。TESTING / SUBMITTED 不是终态，
 * 返回空串让调用方退回扩展的判定。
 */
const API_VERDICTS = {
  OK: 'ac',
  WRONG_ANSWER: 'wa',
  TIME_LIMIT_EXCEEDED: 'tle',
  MEMORY_LIMIT_EXCEEDED: 'mle',
  RUNTIME_ERROR: 're',
  COMPILATION_ERROR: 'ce',
}

/** CF 全局限速 1 次 / 2 秒；本模块自己排队，别和紧接着的下一条提交撞上 */
const DETAIL_GAP = 2100
let lastDetailAt = 0

async function waitForDetailSlot() {
  const wait = lastDetailAt + DETAIL_GAP - Date.now()
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
  lastDetailAt = Date.now()
}

/**
 * @param {{url?: string, submissionId?: string}} input
 * @returns {Promise<{verdict: string, passedTestCount: number|null, timeConsumedMillis: number|null, memoryConsumedBytes: number|null, testset: string}|null>}
 */
export async function fetchSubmissionDetail({ url, submissionId }) {
  if (!/^\d+$/.test(String(submissionId ?? ''))) return null

  const parsed = parseCodeforcesProblem(url)
  // 群组比赛的 contestId 在 contest.status 里查不到（要 group 权限），别白跑一趟
  const contest = parsed?.contestPath.match(/^\/(contest|gym)\/(\d+)$/)
  if (!contest) return null

  await waitForDetailSlot()

  try {
    const response = await fetch(
      `https://codeforces.com/api/contest.status?contestId=${contest[2]}&from=1&count=${DETAIL_COUNT}`,
      { signal: AbortSignal.timeout(12000) },
    )
    if (!response.ok) return null
    const body = await response.json()
    if (body?.status !== 'OK' || !Array.isArray(body.result)) return null

    const item = body.result.find((entry) => String(entry?.id) === String(submissionId))
    if (!item) return null

    const verdict = API_VERDICTS[item.verdict] ?? ''
    if (!verdict) return null

    return {
      verdict,
      passedTestCount: Number.isInteger(item.passedTestCount) ? item.passedTestCount : null,
      timeConsumedMillis: Number.isInteger(item.timeConsumedMillis) ? item.timeConsumedMillis : null,
      memoryConsumedBytes: Number.isInteger(item.memoryConsumedBytes) ? item.memoryConsumedBytes : null,
      testset: typeof item.testset === 'string' ? item.testset : '',
    }
  } catch {
    return null
  }
}

/**
 * 重复提交的指纹表（2026-10-23 加）。
 *
 * 【为什么要有】Codeforces 不接受与先前完全相同的一份源码：它不生成提交记录，而是把提交页
 * 原样刷回来并提示「You have submitted exactly the same code before」。扩展那头看到的只是
 * 「点击之后页面没跳到 /my」，折成 rejected —— 不提前拦一下，用户就白跑一趟、还看到一句
 * 泛泛的「Codeforces 拒收了」。
 *
 * 【存什么】只存源码指纹（长度 + FNV-1a），不存源码、不存判定、不存提交号 —— 这不是一份
 * 提交记录，只回答「这份代码这道题是不是交过」。按题目 URL 分桶，同题留最近 5 份：
 * CF 到底拿「上一份」还是「任何一份」比对，站外行为我们说了不算，多留几份宁可多提示一次
 * （提示后仍可「仍然提交」，不会把人锁死）。
 *
 * 【为什么落 localStorage】CF 的判重跨越刷新与重启；只活在内存里的话，用户重开页面再交
 * 同一份代码，我们又会一声不吭地把他送到 CF 的拒绝页。
 */
const REPEAT_KEY = 'cp.submitRepeats'
const REPEAT_KEEP_PER_PROBLEM = 5
const REPEAT_KEEP_PROBLEMS = 40

function readRepeats() {
  try {
    const value = JSON.parse(window.localStorage.getItem(REPEAT_KEY) ?? '{}')
    return value && typeof value === 'object' ? value : {}
  } catch {
    return {}
  }
}

/** 长度 + FNV-1a 32 位：碰撞概率对「同一份代码」这个判据足够低，也不必把几 KB 源码写进存储 */
function fingerprint(source) {
  let hash = 0x811c9dc5
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `${source.length}:${(hash >>> 0).toString(36)}`
}

/** 这份源码是不是这道题最近交过的其中一份 */
export function isDuplicateSubmission({ node, source }) {
  const url = node?.meta?.url
  if (!url || typeof source !== 'string' || !source.trim()) return false
  const entry = readRepeats()[url]
  return Array.isArray(entry?.hashes) && entry.hashes.includes(fingerprint(source))
}

/** 记下这一趟交出去的源码（只在真的可能已经到达 CF 时调，见 App 的 submitActiveFile） */
export function rememberSubmission({ node, source }) {
  const url = node?.meta?.url
  if (!url || typeof source !== 'string' || !source.trim()) return

  const all = readRepeats()
  const entry = Array.isArray(all[url]?.hashes) ? all[url] : { hashes: [] }
  const hash = fingerprint(source)
  entry.hashes = [hash, ...entry.hashes.filter((item) => item !== hash)].slice(
    0,
    REPEAT_KEEP_PER_PROBLEM,
  )
  entry.at = Date.now()
  all[url] = entry

  // 只留最近用过的若干道题：这只是一张防重复的便条，不值得无限长大
  const kept = Object.entries(all)
    .sort((a, b) => (b[1]?.at ?? 0) - (a[1]?.at ?? 0))
    .slice(0, REPEAT_KEEP_PROBLEMS)
  try {
    window.localStorage.setItem(REPEAT_KEY, JSON.stringify(Object.fromEntries(kept)))
  } catch {
    /* 存储不可用：这一趟就退化成不提示，提交本身不受影响 */
  }
}

/** 扩展失败原因 → 文案。跨仓契约里的枚举，认不出的折成一句兜底 */
const REASON_KEYS = {
  unsupported: 'tests.submit.reason.unsupported',
  timeout: 'tests.submit.reason.timeout',
  'not-logged-in': 'tests.submit.reason.notLoggedIn',
  challenge: 'tests.submit.reason.challenge',
  'problem-missing': 'tests.submit.reason.problemMissing',
  'language-missing': 'tests.submit.reason.languageMissing',
  rejected: 'tests.submit.reason.rejected',
  'no-tab': 'tests.submit.reason.noTab',
  page: 'tests.submit.reason.page',
  empty: 'tests.submit.reason.empty',
  'unsupported-url': 'tests.submit.reason.unsupportedUrl',
}

export function submitReasonText(reason) {
  return t(REASON_KEYS[reason] || 'tests.submit.reason.unknown')
}

/** 判定码 → 文案。判定码本身（AC / WA / …）是通用说法，不翻译；这里翻的是「它是什么意思」 */
const VERDICT_KEYS = {
  ac: 'tests.submit.verdict.ac',
  wa: 'tests.submit.verdict.wa',
  tle: 'tests.submit.verdict.tle',
  mle: 'tests.submit.verdict.mle',
  re: 'tests.submit.verdict.re',
  ce: 'tests.submit.verdict.ce',
  other: 'tests.submit.verdict.other',
}

export function submitVerdictText(verdict) {
  return t(VERDICT_KEYS[verdict] || 'tests.submit.verdict.other')
}

/** 判定码 → 通知色。AC 是成功；WA 是「结果不对」而不是系统故障，用 warning */
export function submitVerdictType(verdict) {
  if (verdict === 'ac') return 'success'
  if (verdict === 'wa') return 'warning'
  if (verdict === 'tle' || verdict === 'mle' || verdict === 're' || verdict === 'ce') return 'error'
  return 'info'
}
