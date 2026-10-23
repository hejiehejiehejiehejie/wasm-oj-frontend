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
 * 这颗提交按钮该不该出现在样例面板页脚。
 * 判据是「这个文件是不是一道题」，与能不能交无关 —— 洛谷题、题解文件也显示，
 * 置灰并在标题里说清原因，比按钮凭空消失更容易理解。
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

/** 扩展失败原因 → 文案。跨仓契约里的枚举，认不出的折成一句兜底 */
const REASON_KEYS = {
  unsupported: 'tests.submit.reason.unsupported',
  timeout: 'tests.submit.reason.timeout',
  'not-logged-in': 'tests.submit.reason.notLoggedIn',
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
