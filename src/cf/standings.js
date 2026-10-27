/**
 * standings.js —— Codeforces 排行榜的**纯逻辑**：行归一化、计分口径、题格文案。
 *
 * 与 pick.js / contest.js 一个性质：无框架、无网络、无存储，能在 Node 里直接跑。
 * 界面（CfStandingsTable.vue）只负责把这里算好的东西画出来。
 *
 * 【两套计分口径，别混】
 *   - CF 制：每道题按 max(0.3*max, max - floor(max*floor(t/60)/250) - 50*rejected) 扣分，
 *     `row.points` 是**已经算好的总分**（含 +100*成功 hack、-50*失败 hack，2026-10-26
 *     拿 2272 的 6092 行逐行验过），界面直接显示，别自己重算。
 *   - ICPC 制：`row.points` 是**过题数**，`row.penalty` 是罚时（分钟 + 10*拒绝次数；
 *     2184 的第一名 186 分逐项验过）。
 *   - IOI：`row.points` 是总分（0–100 制），没有罚时，题格只显示得分。
 *
 * 【API 榜单只有正式参赛者】2026-10-26 实测 2184（15,725 行）全部是 `CONTESTANT`：
 * VP / 非正式参赛者不在 API 榜单里。所以界面上要明确写「官方榜」，别把「没有我」
 * 当成「我没参赛」—— 精确的非正式排名要靠扩展读 HTML（P1）。
 *
 * 【为什么不能把非正式选手也列进表里】2026-10-27 量化过 2276：官方 7805 行 = 40 页，
 * 勾上 `showUnofficial` 后变成 126 页（约 25,200 行，多出来的全是 VP / unrated）。
 * 逐页抓要 86 个请求 × 每页 ~1MB，而且 CF 对 `/standings/page/N?showUnofficial=true`
 * 直接 403（匿名，实测；带登录态的标签页能过，代价仍是 86 页）。所以表只画接口给的
 * 官方行；非正式选手的标记（`*`）留在归一化里，数据真带上来时不会漏画。
 * 「我自己的非正式名次」是另一条路：扩展读一页（P1 的按钮），见 CfStandingsTable。
 *
 * 【题名有英 / 俄两套】接口按 `Accept-Language` 选（不带就是俄文），Worker 统一要 en，
 * 见 cfWorker.js 的 apiFetch。
 *
 * 【冻结】`contest.frozen` 为真时题格是 `PRELIMINARY`（系统测试前冻结的分），
 * 归一化时保留 `cell.type`，界面据此挂「已冻结」提示。
 */

/** 计分口径。判据只看 contest.type，认不出的按 CF 制（最常见、显示总分不会误导） */
export const SCORING = {
  CF: 'cf',
  ICPC: 'icpc',
  IOI: 'ioi',
}

/** @param {{type?: string}|null} contest */
export function scoringOf(contest) {
  const type = String(contest?.type ?? '').toUpperCase()
  if (type === 'ICPC') return SCORING.ICPC
  if (type === 'IOI') return SCORING.IOI
  return SCORING.CF
}

/** 题格里的分数：整数就不带小数位（CF 的 470.0 显示成 470），非整数保留一位 */
function formatPoints(points) {
  if (typeof points !== 'number' || !Number.isFinite(points)) return ''
  return Number.isInteger(points) ? String(points) : points.toFixed(1)
}

/**
 * 把 Worker 回来的原始 standings 收成界面好用的形状。
 *
 * @param {{contest?: object|null, problems?: object[], rows?: object[], fetchedAt?: number, pending?: boolean}} payload
 * @returns {{
 *   kind: 'cf'|'icpc'|'ioi',
 *   contest: object|null,
 *   problems: Array<{index: string, name: string, rating: number|null, maxPoints: number|null}>,
 *   rows: Array<object>,
 *   frozen: boolean,
 *   pending: boolean,
 *   fetchedAt: number,
 * }}
 */
export function normalizeStandings(payload) {
  const contest = payload?.contest ?? null
  const kind = scoringOf(contest)

  const problems = (payload?.problems || []).map((problem) => ({
    index: String(problem?.index ?? '').toUpperCase(),
    name: problem?.name ?? '',
    rating: typeof problem?.rating === 'number' ? problem.rating : null,
    // CF 制的题头会显示「A (500)」；ICPC / IOI 没有这个字段，落 null
    maxPoints: typeof problem?.points === 'number' ? problem.points : null,
  }))

  const rows = (payload?.rows || []).map((row) => {
    const party = row?.party || {}
    const members = (party.members || [])
      .map((member) => String(member?.handle ?? '').trim())
      .filter(Boolean)
    const teamName = typeof party.teamName === 'string' ? party.teamName : ''

    return {
      rank: Number.isInteger(row?.rank) ? row.rank : null,
      partyId: party.participantId ?? null,
      members,
      name: teamName || members.join(', '),
      participantType: party.participantType || 'CONTESTANT',
      ghost: party.ghost === true,
      // API 榜单目前只有正式参赛者，这一条是给以后 / 边界数据留的标记
      unofficial: (party.participantType || 'CONTESTANT') !== 'CONTESTANT',
      points: typeof row?.points === 'number' ? row.points : null,
      penalty: typeof row?.penalty === 'number' ? row.penalty : null,
      successfulHacks: Number.isInteger(row?.successfulHackCount) ? row.successfulHackCount : 0,
      unsuccessfulHacks: Number.isInteger(row?.unsuccessfulHackCount)
        ? row.unsuccessfulHackCount
        : 0,
      // 与 problems 同下标；缺的补 null，题格才知道「没交过」与「这里没有题」的区别
      results: problems.map((_, index) => {
        const cell = row?.problemResults?.[index]
        if (!cell) return null
        return {
          points: typeof cell.points === 'number' ? cell.points : null,
          rejected: Number.isInteger(cell.rejectedAttemptCount) ? cell.rejectedAttemptCount : 0,
          bestTime: Number.isFinite(cell.bestSubmissionTimeSeconds)
            ? cell.bestSubmissionTimeSeconds
            : null,
          type: typeof cell.type === 'string' ? cell.type : '',
        }
      }),
    }
  })

  return {
    kind,
    contest,
    problems,
    rows,
    frozen: contest?.frozen === true,
    pending: payload?.pending === true,
    fetchedAt: payload?.fetchedAt || 0,
  }
}

/**
 * 题格要画什么。返回 `{ main, sub, tone }`：
 *   main —— 主数字（CF：得分；ICPC：`+` / `+n` / `-n`）
 *   sub  —— 副文字（CF / ICPC / IOI 都是**通过时刻**，与 CF 自己的榜单一致）
 *   tone —— `'ok' | 'partial' | 'fail' | 'empty'`，界面据此上色
 *
 * 【没通过的 `-n` 必须画在主行】那是「交了几次没过的」罚时标记，CF 的 ICPC 榜单就是
 * 一格红字 `-2`（`<span class="cell-rejected">-2</span>`）。2026-10-27 曾把它塞进 9px
 * 的副行，颜色又被 `.cf-table__sub` 的 faint 盖掉，等于看不见 —— 用户当场报「又不显示
 * 罚时了」。副行只留给通过时刻；没通过就没有时刻，别占位。
 *
 * 【时刻要画出来，不只是悬停才给】CF 的题格是两行：分数 / 时刻（2026-10-27 读页面
 * `<span class="cell-time">01:30</span>` 确认）。被拒次数 CF 只写进 `title`，我们也照办
 * （见 cellTitle）。
 *
 * 【CF 的得分不能跟题面满分比】`problemResults[].points` 是**已经扣减过的**得分
 * （2272 的 A 题面 500，完成时刻 320），跟 `problem.points` 比会把每道通过的题都判成
 * partial（悬停才看得出是绿的还是黄的，实测一整列都是黄）。真正的部分分只有 IOI 制才有。
 *
 * @param {'cf'|'icpc'|'ioi'} kind
 * @param {{points: number|null, rejected: number, bestTime: number|null}|null} cell
 * @param {{maxPoints: number|null}|undefined} problem
 */
export function problemCell(kind, cell, problem) {
  if (!cell) return { main: '', sub: '', tone: 'empty' }

  const rejected = cell.rejected ?? 0
  const clock = cell.bestTime == null ? '' : formatClock(cell.bestTime)

  if (kind === SCORING.ICPC) {
    if ((cell.points ?? 0) > 0) {
      return {
        main: rejected > 0 ? `+${rejected}` : '+',
        sub: clock,
        tone: 'ok',
      }
    }
    return rejected > 0
      ? { main: `-${rejected}`, sub: '', tone: 'fail' }
      : { main: '', sub: '', tone: 'empty' }
  }

  // CF / IOI：有分就是主数字，通过时刻作副文字
  if ((cell.points ?? 0) > 0) {
    const max = problem?.maxPoints
    const full = typeof max !== 'number' || cell.points >= max - 1e-6
    return {
      main: formatPoints(cell.points),
      sub: clock,
      tone: kind === SCORING.IOI && !full ? 'partial' : 'ok',
    }
  }

  return rejected > 0
    ? { main: `-${rejected}`, sub: '', tone: 'fail' }
    : { main: '', sub: '', tone: 'empty' }
}

/**
 * 每道题有多少人通过 / 多少人尝试 —— CF 榜单表尾那行 `Accepted / Tried`。
 *
 * 【为什么本地算】这组数字**不在接口里**，但可以从已经拿到的榜单行现算：
 *   通过 = 该题 `points > 0`；尝试 = 有过任何提交（通过过，或被拒过）。
 * 2026-10-27 拿两场逐题对过页面表尾，一字不差：
 *   2276（ICPC 制）A 7342 / 7618、B 5789 / 6119、C 5096 / 5424、D 3217 / 3585
 *   2272（CF 制）  A 5580 / 6036、B 4724 / 5282、C 3066 / 3610、D 1390 / 1858
 * 所以这一行不额外发请求。口径是**官方榜这批行**（接口本来也只有正式参赛者）。
 *
 * @param {Array<{results: Array<{points: number|null, rejected: number}|null>}>} rows 已归一化的行
 * @param {Array<unknown>} problems 只用来定列数 / 下标对齐
 * @returns {Array<{solved: number, tried: number}>}
 */
export function problemStatistics(rows, problems) {
  const stats = (problems || []).map(() => ({ solved: 0, tried: 0 }))
  for (const row of rows || []) {
    const cells = row?.results || []
    for (let index = 0; index < stats.length; index += 1) {
      const cell = cells[index]
      if (!cell) continue
      const points = cell.points ?? 0
      if (points > 0) stats[index].solved += 1
      if (points > 0 || (cell.rejected ?? 0) > 0) stats[index].tried += 1
    }
  }
  return stats
}

/** 题格完整说明（tooltip）：CF 的界面也只在悬停时给出时刻与尝试数 */
export function cellTitle(cell, kind) {
  if (!cell) return ''
  const notes = []
  if ((cell.points ?? 0) > 0 && cell.bestTime != null) {
    notes.push(formatClock(cell.bestTime))
  }
  if (cell.rejected > 0) notes.push(`-${cell.rejected}`)
  if (kind === SCORING.ICPC && (cell.points ?? 0) > 0) notes.unshift(`+${cell.rejected || ''}`)
  return notes.join(' · ')
}

/** 秒 → `HH:MM`（CF 榜里通过时刻的口径：向下取整到分钟） */
export function formatClock(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return ''
  const pad = (value) => String(value).padStart(2, '0')
  return `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor((seconds % 3600) / 60))}`
}

/**
 * 在榜单里找我。多个 handle 时按顺序找第一个命中的；团队赛任何一名成员命中都算。
 * @param {{rows: object[]}|null} standings
 * @param {string[]} handles
 * @returns {{row: object, index: number}|null}
 */
export function findMyRow(standings, handles) {
  const targets = new Set((handles || []).map((handle) => String(handle).toLowerCase()))
  if (!targets.size) return null

  const rows = standings?.rows || []
  for (let index = 0; index < rows.length; index += 1) {
    const members = rows[index]?.members || []
    if (members.some((handle) => targets.has(String(handle).toLowerCase()))) {
      return { row: rows[index], index }
    }
  }
  return null
}

/** 赛事名下面的那行小字：类型 + 参赛人数（人数是官方榜口径） */
export function contestTypeLabel(contest) {
  const type = String(contest?.type ?? '').toUpperCase()
  return type || ''
}
