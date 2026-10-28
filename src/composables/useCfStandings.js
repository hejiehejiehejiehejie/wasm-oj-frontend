/**
 * useCfStandings —— 比赛面板的「排行榜」：取一次 standings、归一化、分页、轮询。
 *
 * 【只画官方榜】Codeforces 的 `contest.standings` 只返回 `CONTESTANT`（正式参赛者），
 * VP / 非正式参赛者不在里面（2026-10-26 拿 2184 的 15,725 行验过）。所以这一页不假装
 * 「能看见所有人的实时排名」，界面上明说口径。用户想知道自己那一个非正式名次时，点抬头
 * 「非正式名次」由扩展去读 CF 的 HTML 页面（2026-10-27 起，见 CfStandingsTable 与
 * useCompanionBridge 的 requestUnofficialRank）；这一页本身仍然只画 API 给的官方榜。
 *
 * 【为什么自己算「要不要轮询」而不是无脑 setInterval】
 *   - 比赛中（`live`）10 秒一次：榜单要跟得上，而 CF 的限流是全局 1 次 / 2 秒，
 *     10 秒一条榜单 + 5 秒一条提交，合起来 3 次 / 10 秒，不越界。
 *   - 已结束：一次都不轮询。榜单不会再变，再拉就是白占额度。
 *   - 页面不可见 / 这一页没被选中：停表。切回来时补一次（见 visibilitychange）。
 * 用 setTimeout 链而不是 setInterval：一次请求慢于周期时不会把请求堆起来。
 *
 * 【分页在客户端做】API 没有分页参数，一份 2–6MB 的榜单一次拿全。DOM 不能画 15,000 行，
 * 所以每页 100 行；「跳到我」只改页码，不额外请求。
 *
 * 【复用同一份 standings】Worker 里 `contest.standings` 与题目列表共用一个请求与一份内存
 * 复用（直播中 3 秒、已结束 60 秒，见 cfWorker.js 的 requestStandings），所以这一页
 * 与「题目」页不会各拉一遍。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import { findMyRow, normalizeStandings, problemStatistics } from '../cf/standings.js'
import { myHandles } from '../cf/myHandle.js'
import { t } from '../i18n/index.js'
import { cfStandings } from '../services/cfClient.js'

/** 每页行数。与 CF 自己的榜单页同量级：再大就顶不住 15,000 行时的重排 */
export const STANDINGS_PAGE_SIZE = 100

const LIVE_POLL_MS = 10000

/**
 * 重新打开这一页时，距上次成功取数超过这么久才 force（绕过 Worker 的复用窗口，见文件头）。
 * 窗口内的重开直接复用 —— 数据本来就是几秒前的，不值得再打一次 CF。
 */
const REOPEN_FORCE_MS = 5000

function errorText(failure) {
  const code = failure?.code
  if (code === 'CONTEST_NEEDS_LOGIN') return t('cf.contest.errors.needsLogin')
  if (code === 'RATE_LIMITED') return t('cf.contest.errors.rateLimited')
  if (code === 'WORKER_ERROR' || code === 'DISPOSED') return t('cf.contest.errors.worker')
  return t('cf.contest.errors.fetch', { detail: failure?.message || '' })
}

/** 认「是不是我」只看 handle；团队赛任何一名成员命中都算 */
function specKey(spec) {
  if (!spec?.contestId) return ''
  return `${spec.kind || 'contest'}:${spec.groupId || ''}:${spec.contestId}`
}

/**
 * @param {{
 *   spec: import('vue').Ref<object|null>,
 *   active: import('vue').Ref<boolean>,
 *   live: import('vue').Ref<boolean>,
 * }} options
 *   active —— 排行榜这一子页此刻看不看得见
 *   live   —— 比赛此刻在进行中（由 useCfContest 的 status 推出来）
 */
export function useCfStandings({ spec, active, live }) {
  /** 已归一化的榜单；null = 还没取过 */
  const standings = ref(null)
  const loading = ref(false)
  const error = ref('')

  const page = ref(1)

  const handles = computed(() => myHandles())

  const rows = computed(() => standings.value?.rows || [])
  const problems = computed(() => standings.value?.problems || [])
  const contest = computed(() => standings.value?.contest || null)
  const kind = computed(() => standings.value?.kind || 'cf')
  const pending = computed(() => standings.value?.pending === true)
  const frozen = computed(() => standings.value?.frozen === true)
  const fetchedAt = computed(() => standings.value?.fetchedAt || 0)

  const pageCount = computed(() =>
    Math.max(1, Math.ceil(rows.value.length / STANDINGS_PAGE_SIZE)),
  )

  const pageRows = computed(() => {
    const from = (page.value - 1) * STANDINGS_PAGE_SIZE
    return rows.value.slice(from, from + STANDINGS_PAGE_SIZE)
  })

  const myRow = computed(() => findMyRow(standings.value, handles.value))
  const myIndex = computed(() => myRow.value?.index ?? -1)

  /**
   * 表尾那行统计（每题多少人通过 / 尝试）。由手里这份榜单现算，不额外取数 ——
   * 算在**整场**上而不是当前页上，与 CF 自己的表尾同口径。见 cf/standings.js。
   */
  const problemStats = computed(() => problemStatistics(rows.value, problems.value))

  function isMine(row) {
    if (!row || !handles.value.length) return false
    if (myRow.value?.row && row.partyId != null && row.partyId === myRow.value.row.partyId) {
      return true
    }
    const targets = new Set(handles.value.map((handle) => handle.toLowerCase()))
    return (row.members || []).some((handle) => targets.has(String(handle).toLowerCase()))
  }

  function gotoPage(value) {
    const next = Math.min(Math.max(1, Math.trunc(Number(value) || 1)), pageCount.value)
    page.value = next
  }

  /** 跳到我：把名字所在的那一页翻出来。找不到就什么都不做（界面上的按钮同时是灰的） */
  function gotoMyRank() {
    if (myIndex.value < 0) return
    page.value = Math.floor(myIndex.value / STANDINGS_PAGE_SIZE) + 1
  }

  // 榜单刷新后行数可能变少：把页码夹回合法区间，别停在一片空白上
  watch(pageCount, (count) => {
    if (page.value > count) page.value = count
  })

  // ------------------------------------------------------------ 取数

  let seq = 0
  let inFlight = null
  /** 上次拿到数据的时刻（取响应里的 fetchedAt，含 Worker 命中的复用包），给「重开要不要 force」用 */
  let lastLoadedAt = 0

  /** @param {{silent?: boolean, force?: boolean}} [options] */
  async function load({ silent = false, force = false } = {}) {
    const current = spec.value
    if (!current?.contestId) return

    // 手动刷新与轮询撞在一起时复用同一发；force 优先（用户明确要新的）
    if (inFlight && !force) return inFlight

    const mine = ++seq
    if (!silent) loading.value = true
    error.value = ''

    inFlight = cfStandings(current, { force })
      .then((response) => {
        if (mine !== seq) return
        const next = normalizeStandings(response)
        // 还没开赛：响应里没有 contest / rows，但这不是失败，界面据此说「开赛后才有榜单」
        standings.value = next
        lastLoadedAt = next.fetchedAt || Date.now()
      })
      .catch((failure) => {
        if (mine !== seq) return
        // 轮询失败不打扰：手里有一份旧榜单就继续看，下一轮再试
        if (!silent || !standings.value) error.value = errorText(failure)
      })
      .finally(() => {
        if (mine === seq) {
          loading.value = false
          planPoll()
          inFlight = null
        }
      })

    return inFlight
  }

  // ------------------------------------------------------------ 轮询与回访

  let pollTimer = 0

  function stopPoll() {
    window.clearTimeout(pollTimer)
    pollTimer = 0
  }

  /** 排下一次。只有「看得见 + 比赛中」才排；已结束 / 未开赛一次都不排 */
  function planPoll() {
    stopPoll()
    if (!active.value || document.visibilityState !== 'visible') return
    if (!live.value || !standings.value || standings.value.pending) return

    pollTimer = window.setTimeout(async () => {
      pollTimer = 0
      await load({ silent: true })
    }, LIVE_POLL_MS)
  }

  function onVisibilityChange() {
    if (document.visibilityState !== 'visible') {
      stopPoll()
      return
    }
    if (!active.value) return
    // 后台期间的榜单可能已经变了：回来先补一次，再重新排表
    if (live.value) void load({ silent: true })
    else planPoll()
  }

  document.addEventListener('visibilitychange', onVisibilityChange)

  // 换了一场：旧榜单一行都不能留，否则新比赛的第一屏会挂着上一场的名次
  watch(
    () => specKey(spec.value),
    () => {
      seq += 1
      inFlight = null
      stopPoll()
      standings.value = null
      loading.value = false
      error.value = ''
      page.value = 1
      if (active.value) void load()
    },
  )

  // 切进这一子页 / 比赛刚开赛：立刻取一次。开赛那一刻手里那份还是「还没开赛」的空态，
  // 不补这一次，用户会以为榜单坏了。
  //
  // 【重新打开也要刷新（2026-10-28）】切回排行榜、或从别的页签切回 Codeforces 页签，
  // active 都会 false → true，这里补一次。手里已经有榜单时走静默：不亮 loading、不闪列表，
  // 只是把数据与「刷新于 X 前」的那个时刻一起更新 —— 这就是「再次打开就自己刷一下」。
  // 但 Worker 对同一场榜单有 3s / 60s 的复用窗口（见 cfWorker 的 recentStandings），
  // 完结场次直接命中缓存就不会真的再取，所以距上次取数超过几秒时要 force 绕过它；
  // 刚刷过（几秒内）则不 force —— 那份数据本来就是新的，没必要多打一次 CF。
  watch(
    [active, live],
    ([visible, running], previous) => {
      const wasVisible = previous?.[0] === true
      const wasRunning = previous?.[1] === true
      if (!visible) {
        stopPoll()
        return
      }
      if (!wasVisible || (running && !wasRunning)) {
        const hasData = !!standings.value
        const starting = running && !wasRunning
        // 刚开赛：手里那份可能还是「还没开赛」的包；Worker 对 pending 包也有 3 秒复用窗口，
        // 不 force 的话这次补取会原样拿回旧包，界面就一直停在空态
        const reopening =
          hasData &&
          !starting &&
          !standings.value.pending &&
          Date.now() - lastLoadedAt >= REOPEN_FORCE_MS
        void load({ silent: hasData, force: starting || reopening })
        return
      }
      planPoll()
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    stopPoll()
    seq += 1
    document.removeEventListener('visibilitychange', onVisibilityChange)
  })

  const refresh = () => load({ force: true })

  return {
    standings,
    loading,
    error,
    pending,
    frozen,
    rows,
    problems,
    problemStats,
    contest,
    kind,
    fetchedAt,
    page,
    pageCount,
    pageRows,
    myRow,
    myIndex,
    handles,
    isMine,
    gotoPage,
    gotoMyRank,
    load,
    refresh,
  }
}
