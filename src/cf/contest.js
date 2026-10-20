/**
 * contest.js —— Codeforces 比赛的**纯逻辑**：链接解析、倒计时换算、题目排序。
 *
 * 与 pick.js 一个性质：无框架、无存储、无网络，能在 Node 里直接跑。
 *
 * 【为什么自己解析链接，而不是让用户填 contestId】用户手里只有地址栏那一串，
 * 逼他手工摘 ID 是最容易被放弃的一步。这里把 cf-tool 那张正则表换成了 URL 分段 ——
 * 同样的覆盖范围，但不用维护 14 条互相重叠的正则，也不会因为查询串 / 尾斜杠翻脸。
 *
 * 支持的写法（与 cf-tool 对齐）：
 *   https://codeforces.com/contest/2276
 *   https://codeforces.com/contest/2276/problem/A
 *   https://codeforces.com/gym/100524/problem/B
 *   https://codeforces.com/group/<id>/contest/123456
 *   https://codeforces.com/problemset/problem/1/A
 *   2276 / 2276A / 100524（裸 ID，位数 ≥ 6 判 gym）
 *   镜像 codeforces.ml / .es / .net，带不带协议都行
 */

/**
 * 裸 ID 的 gym 判据：位数 ≥ 这个值当 gym。
 *
 * 沿用 cf-tool 的经验值（`len(contestID) < 6` 判 contest）。CF 没有公开规则说明这条分界，
 * 但 gym 的编号事实上都在 100000 以上，而非 gym 的还没到这个量级。只用于**裸 ID**；
 * 从 URL 解析时路径里已经写明是 /contest/ 还是 /gym/，不必猜。
 */
const GYM_MIN_ID = 100000

/** CF 的镜像域。它们共用同一套路径，只是会话不互通（登录态各算各的） */
const CF_HOST = /(^|\.)codeforces\.(com|ml|es|net)$/i

/**
 * 路径分段里「第几个是 ID」的规则表。`seg` 是匹配到的路径段，
 * `at` 是 ID 所在的下标（负数从尾部数）。
 */
const ID_PATTERN = /^\d+$/

/**
 * 把用户粘贴的字符串解析成一只比赛。
 *
 * @param {unknown} raw
 * @returns {{ kind: 'contest'|'gym'|'group', contestId: string, groupId: string, problemIndex: string } | null}
 *   `problemIndex` 只在链接指向具体题目时非空（形如 `A` / `B1`，统一大写）
 */
export function parseContestSpec(raw) {
  const text = String(raw ?? '').trim()
  if (!text) return null

  // 1) 先当网址解。没写协议的（codeforces.com/contest/1）也认 —— 补一个 https 再解
  let url = null
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`)
  } catch {
    url = null
  }

  if (url && CF_HOST.test(url.hostname)) {
    const parts = url.pathname.split('/').filter(Boolean)
    const lower = parts.map((part) => part.toLowerCase())

    // /problemset/problem/<contestId>/<index>
    const problemsetAt = lower.indexOf('problemset')
    if (problemsetAt !== -1 && lower[problemsetAt + 1] === 'problem') {
      const contestId = parts[problemsetAt + 2] ?? ''
      if (ID_PATTERN.test(contestId)) {
        return {
          kind: 'contest',
          contestId,
          groupId: '',
          problemIndex: upperIndex(parts[problemsetAt + 3]),
        }
      }
      return null
    }

    // /group/<groupId>/contest/<contestId>(/problem/<index>)
    const groupAt = lower.indexOf('group')
    if (groupAt !== -1 && lower[groupAt + 2] === 'contest') {
      const groupId = parts[groupAt + 1] ?? ''
      const contestId = parts[groupAt + 3] ?? ''
      if (groupId && ID_PATTERN.test(contestId)) {
        return {
          kind: 'group',
          contestId,
          groupId,
          problemIndex: upperIndex(parts[groupAt + 5]),
        }
      }
      return null
    }

    // /contest/<contestId> 与 /gym/<contestId>，都可带 /problem/<index>
    for (const kind of ['contest', 'gym']) {
      const at = lower.indexOf(kind)
      if (at === -1) continue
      const contestId = parts[at + 1] ?? ''
      if (!ID_PATTERN.test(contestId)) continue
      return {
        kind,
        contestId,
        groupId: '',
        // problem 段固定在 kind 之后两位，越界时 split 取不到就是空串，正好当「没指定」
        problemIndex: lower[at + 2] === 'problem' ? upperIndex(parts[at + 3]) : '',
      }
    }

    return null
  }

  // 2) 不是网址：裸 ID，或 ID 紧接题号（2276A / 100524B1）
  const bare = /^(\d+)([a-z]\d*)?$/i.exec(text)
  if (!bare) return null

  const contestId = bare[1]
  return {
    kind: Number(contestId) >= GYM_MIN_ID ? 'gym' : 'contest',
    contestId,
    groupId: '',
    problemIndex: upperIndex(bare[2]),
  }
}

/** 题号统一大写：CF 的 index 可能是 `A`、`B1`、`E2`，小写写法不该进到 URL 或认题键里 */
function upperIndex(value) {
  return String(value ?? '').trim().toUpperCase()
}

/** 这场比赛在网页上的地址（练习页；group 要带上 groupId，否则会 404） */
export function contestUrl(spec) {
  if (!spec || !spec.contestId) return ''
  if (spec.kind === 'group') {
    return `https://codeforces.com/group/${spec.groupId}/contest/${spec.contestId}`
  }
  return `https://codeforces.com/${spec.kind}/${spec.contestId}`
}

/**
 * 题目链接。**不走 cfProblemToTask**：那条路只认 `contestId`，gym 与 group 会拼错。
 * @param {{ kind: string, contestId: string, groupId: string }} spec
 * @param {string} index
 */
export function contestProblemUrl(spec, index) {
  if (!spec || !spec.contestId) return ''
  const letter = upperIndex(index)
  if (spec.kind === 'group') {
    return `https://codeforces.com/group/${spec.groupId}/contest/${spec.contestId}/problem/${letter}`
  }
  return `https://codeforces.com/${spec.kind}/${spec.contestId}/problem/${letter}`
}

/**
 * 整场的「题目列表」地址（扩展抓样例时读的就是这一页）。
 *
 * 【为什么是这一页】Codeforces 把一场的所有题面连同样例都渲染在 `/problems` 这一页里
 * （2026-10-19 实测 contest 2276：一页 7 个 `.problem-frames > div`、7 组 `.input pre`），
 * 所以抓一整场只要一次页面加载，不必逐题开标签页。
 */
export function contestProblemsUrl(spec) {
  if (!spec || !spec.contestId) return ''
  return `${contestUrl(spec)}/problems`
}

/** 比赛阶段（CF 的 `phase` 字段）。只列会用到的四种，其余原样透传 */
export const PHASE = {
  BEFORE: 'BEFORE',
  CODING: 'CODING',
  FINISHED: 'FINISHED',
}

/**
 * 还剩多久开赛（毫秒，可能为负 = 已经开过了）。
 *
 * 【为什么用 relativeTimeSeconds 而不是 startTimeSeconds】前者是**取数那一刻**服务器算好的
 * 「距开赛多少秒」，天然含了服务器时钟；拿它减去「这份数据在本地放了多久」就得到此刻的剩余量，
 * 不必知道两边时钟差了多少 —— 这正是 cf-tool 那句 `Sleep(900ms)` 想补的偏差。
 * 只有 startTimeSeconds 时才退回按本地时钟算（gym 的列表里就没有 relativeTimeSeconds）。
 *
 * @param {{ startTimeSeconds?: number, relativeTimeSeconds?: number }} contest
 * @param {number} fetchedAt 这份数据取回来的本地时刻（Date.now()）
 * @param {number} [now] 便于测试注入
 * @returns {number|null} 拿不到时间字段时返回 null
 */
export function contestRemainingMs(contest, fetchedAt, now = Date.now()) {
  if (!contest) return null

  if (typeof contest.relativeTimeSeconds === 'number' && Number.isFinite(contest.relativeTimeSeconds)) {
    // relativeTimeSeconds 在开赛前是负数，取反就是剩余秒数
    return -contest.relativeTimeSeconds * 1000 - (now - fetchedAt)
  }

  if (typeof contest.startTimeSeconds === 'number' && Number.isFinite(contest.startTimeSeconds)) {
    return contest.startTimeSeconds * 1000 - now
  }

  return null
}

/**
 * 这场比赛此刻是什么状态。
 *
 * 【为什么不信 phase、还要自己算一遍】phase 是取数那一刻的快照：页面开着不动，
 * 到了开赛时刻 phase 仍然是 BEFORE。倒计时归零的瞬间要能自己翻面，不能等下一次请求。
 *
 * @returns {'upcoming'|'running'|'finished'|'unknown'}
 */
export function contestStatus(contest, remainingMs) {
  if (!contest) return 'unknown'
  if (contest.phase === PHASE.FINISHED) return 'finished'
  if (remainingMs === null) return contest.phase === PHASE.CODING ? 'running' : 'unknown'
  if (remainingMs > 0) return 'upcoming'
  // 开赛之后还有一段比赛时长；超过就当已结束（下一次刷新会拿到真实 phase）
  const durationMs = (contest.durationSeconds || 0) * 1000
  if (durationMs > 0 && remainingMs + durationMs > 0) return 'running'
  return durationMs > 0 ? 'finished' : 'running'
}

/**
 * 按题号自然序：A、B、B1、B2、C……（`localeCompare` 的数字感知对 `B1` vs `B10` 也对）
 * 认不出 index 的条目沉到最后，不让它们挤在 A 前面。
 */
export function sortByIndex(problems) {
  return [...(problems || [])].sort((a, b) => {
    const left = String(a?.index ?? '')
    const right = String(b?.index ?? '')
    if (!left) return 1
    if (!right) return -1
    return left.localeCompare(right, 'en', { numeric: true })
  })
}

/** 毫秒 → `HH:MM:SS`（超过 99 小时就照常往上加，不截断） */
export function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const pad = (value) => String(value).padStart(2, '0')
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}
