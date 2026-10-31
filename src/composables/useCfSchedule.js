/**
 * useCfSchedule —— Codeforces 页「赛程」模式：近期比赛列表 + 每秒重算的倒计时。
 *
 * 【它是 P0 里唯一默认打开的一页】没有贴链接、没有算题、没有榜单，用户一进比赛面板就该看到
 * 「下一场是什么时候 / 有没有正在进行的」。所以这一页不依赖用户输入，打开即取。
 *
 * 【倒计时同样不累减】与 useCfContest 一条纪律：每秒只推进 `now`，剩余量由
 * `contestRemainingMs(contest, fetchedAt, now)` 现算。contest.list 里的 relativeTimeSeconds
 * 是服务器在**取数那一刻**算好的，减去本地放了多久就是此刻的剩余量，不受后台标签页节流影响。
 *
 * 【阶段自己算，不跟着 phase 走】列表可能缓存了一小时（Worker 侧 contest.list 的 TTL），
 * 期间某场从 BEFORE 变成 CODING。界面若要等下一次刷新才翻面，会在开赛那一刻显示错的状态。
 * 这里用 `contestStatus(contest, remainingMs)` 按时间推，phase 只作为「已结束」的权威信号。
 *
 * 【不自动轮询列表】非 gym 的 contest.list 只变「有没有新场次」，几分钟一次没有意义；
 * 每次打开这一页静默取一次（超过 `STALE_MS` 时 force 越过 Worker 的 1 小时缓存），
 * 取回的列表与手上那份没差就不动 DOM —— 没有手动刷新按钮。
 *
 * 【报名状态是另一条路，2026-10-26 加】`contest.list` 里没有「我能不能报名 / 报没报过」这回事
 * —— 那是账号级的，只能读 `/contests` 页面上渲染出来的那几个字。于是由浏览器扩展去读
 * （见 useCompanionBridge 的 requestContestStates），这里只存一份 `contestId -> 枚举`。
 * 它**不是**列表的一部分：扩展没装 / 没登录时整列都不出现，老版本行为一字不变。
 *
 * 【报名与开 VP 是不可逆动作】这里只负责「点下去之后」：调一次接口、等一个枚举、把状态就地
 * 改掉。确认卡片在组件里（CfContestSchedule），组合式不弹任何界面 —— 也绝不自动重放。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import {
  contestRemainingMs,
  contestStatus,
  durationParts,
  formatStartTime,
} from '../cf/contest.js'
import { t } from '../i18n/index.js'
import { cfContests } from '../services/cfClient.js'
import { useCompanionBridge } from './useCompanionBridge.js'

/**
 * 进行中（running）的场次数，供抬头「Live」角标读 —— 不新增请求。
 *
 * 【为什么不跟着赛程页那颗心跳走】`now` 只在「赛程页可见」时跳（见文件末对 active 的 watch），
 * 于是这个数字过去只在**重新打开赛程页**那一刻重算：用户把 Codeforces 页停在抽题 / 比赛、
 * 或者干脆在别处写代码，比赛到点了角标也不会自己冒出来（2026-11-01 用户报障）。
 *
 * 这里另起一只**只在阶段切换那一刻醒来**的定时器：算出「下一场什么时候开赛 / 结束」，
 * setTimeout 到点再算一次，中间零开销（这个数字只在阶段边界上变，不值得每秒轮询），
 * 也不会像把 `now` 挪到模块级那样让 v-show 着的赛程列表在后台每秒重排一遍。
 */
export const cfRunningCount = ref(0)

/** 赛程页最近一次落地的列表快照：离开赛程页之后仍要靠它推算「此刻有没有在打」 */
let liveContests = []
let liveFetchedAt = 0
let liveTimer = 0

/** 一次最多睡这么久：机器休眠 / 改过系统时间之后，最迟一小时内自纠一次 */
const LIVE_WAKE_CAP_MS = 60 * 60 * 1000
/** 宁可晚一点点也不要早于边界 —— 早 1ms 醒来只会看到「还没开赛」，白醒一趟 */
const LIVE_WAKE_SLACK_MS = 50

/**
 * 这场比赛的阶段下一次在多久之后变（毫秒）：未开赛 → 距开赛，进行中 → 距结束。
 * 已结束 / 拿不到时间字段时返回 null（它不会再变，不必为它设闹钟）。
 */
function untilNextPhase(contest, now) {
  const remaining = contestRemainingMs(contest, liveFetchedAt, now)
  if (remaining === null) return null
  if (remaining > 0) return remaining
  const durationMs = (contest?.durationSeconds || 0) * 1000
  if (durationMs && remaining + durationMs > 0) return remaining + durationMs
  return null
}

/** 按此刻重算角标数字，并把下一次唤醒排到最近的阶段边界上 */
function syncRunningCount() {
  window.clearTimeout(liveTimer)
  liveTimer = 0

  const now = Date.now()
  let count = 0
  let soonest = null

  for (const contest of liveContests) {
    if (contestStatus(contest, contestRemainingMs(contest, liveFetchedAt, now)) === 'running') {
      count += 1
    }
    const wait = untilNextPhase(contest, now)
    if (wait !== null && wait > 0 && (soonest === null || wait < soonest)) soonest = wait
  }

  // 只在真的变了才写 ref：同一个值反复赋值会让抬头那颗角标白跑一轮 patch
  if (cfRunningCount.value !== count) cfRunningCount.value = count
  if (soonest === null) return

  liveTimer = window.setTimeout(
    syncRunningCount,
    Math.min(soonest + LIVE_WAKE_SLACK_MS, LIVE_WAKE_CAP_MS),
  )
}

/** 回来时数据超过这个岁数就 force 取一次（否则走 Worker 缓存，绝大多数情况下不触网） */
const STALE_MS = 10 * 60 * 1000
/** 「最近结束」留多少场：够用来回看刚打完的比赛，不让几千条历史灌进 DOM */
const FINISHED_LIMIT = 12
/** 报名状态多久算过期。它比列表变得勤（报名开关、报名成功），但读一次要开一页 CF，别太频繁 */
const STATES_STALE_MS = 3 * 60 * 1000
/** 倒计时从大到小的档位（键名同时是 `cf.contest.schedule.units.*` 的键） */
const SPAN_UNITS = ['weeks', 'days', 'hours', 'minutes', 'seconds']

function errorText(failure) {
  const code = failure?.code
  if (code === 'RATE_LIMITED') return t('cf.contest.errors.rateLimited')
  if (code === 'WORKER_ERROR' || code === 'DISPOSED') return t('cf.contest.errors.worker')
  return t('cf.contest.errors.fetch', { detail: failure?.message || '' })
}

/**
 * 一场比赛里会改变界面结构的字段。
 *
 * 【为什么不比整条】`relativeTimeSeconds` 是**取数那一刻**的剩余量，每次请求都不同；
 * 拿它比就永远「有变化」，静默刷新等于每次都重排。名字 / 类型 / 阶段 / 时长的变化
 * 才是列表真的变了。
 */
function listKey(contest) {
  return [
    contest?.id,
    contest?.name,
    contest?.type,
    contest?.phase,
    contest?.startTimeSeconds,
    contest?.durationSeconds,
  ].join('\u0001')
}

/** 两份列表内容是否一样（按顺序比；CF 的列表本身顺序稳定） */
function sameList(left, right) {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (listKey(left[index]) !== listKey(right[index])) return false
  }
  return true
}

/**
 * @param {{active: import('vue').Ref<boolean>}} options active = 这一页此刻看不看得见
 */
export function useCfSchedule({ active }) {
  const contests = ref([])
  const fetchedAt = ref(0)
  const loading = ref(false)
  const error = ref('')

  /** 每秒推进一次，只作为 computed 的依赖（见文件头「倒计时同样不累减」） */
  const now = ref(Date.now())

  // ------------------------------------------------------------ 报名状态（扩展）

  const {
    canReadContestStates,
    requestContestStates,
    requestContestEntry,
  } = useCompanionBridge()

  /** contestId -> 'open' | 'before' | 'closed' | 'registered' | 'count' | 'unknown' */
  const states = ref({})
  const statesLoading = ref(false)
  /** 读不到时的原因枚举（not-logged-in / challenge / page / timeout …）；空串 = 正常 */
  const statesError = ref('')
  const statesFetchedAt = ref(0)
  /** 正在提交报名 / VP 的场次 id；空串 = 没有在途操作（同一时刻只允许一个） */
  const entryBusy = ref('')

  let statesSeq = 0
  let statesPromise = null

  let seq = 0
  let loadingPromise = null

  /** @param {{force?: boolean, silent?: boolean}} [options] */
  async function load({ force = false, silent = false } = {}) {
    // 连点刷新 / 回访与手动撞在一起时复用同一发，别为了同一份列表占两次限流额度
    if (loadingPromise) return loadingPromise

    const mine = ++seq
    if (!silent) loading.value = true
    error.value = ''

    loadingPromise = cfContests({ force })
      .then((response) => {
        if (mine !== seq) return
        const next = Array.isArray(response?.contests) ? response.contests : []
        // 内容没变就不换：`relativeTimeSeconds` 与 `fetchedAt` 是配套的，
        // 只换其中一样会让倒计时整体偏移；所以「没变」= 两样都不动
        if (contests.value.length && sameList(next, contests.value)) return
        contests.value = next
        fetchedAt.value = response?.fetchedAt || Date.now()
        now.value = Date.now()
        // 抬头角标用它自己算一份：赛程页看不见时也要在开赛那一刻翻面（见 cfRunningCount）
        liveContests = next
        liveFetchedAt = fetchedAt.value
        syncRunningCount()
      })
      .catch((failure) => {
        if (mine !== seq || silent) return
        error.value = errorText(failure)
      })
      .finally(() => {
        if (mine === seq) loading.value = false
        loadingPromise = null
      })

    return loadingPromise
  }

  /**
   * 此刻距**开赛**的剩余量（毫秒，负数 = 已开赛多久）。
   *
   * 【别把它当「还剩多久」】开赛之后它是负的已进行时长：一场 2 小时比赛开赛 20 分钟后，
   * 这里是 −20 分钟。「还剩多久结束」是 `untilEndOf`（= 这个值 + 总时长）。
   */
  function remainingOf(contest) {
    return contestRemainingMs(contest, fetchedAt.value, now.value)
  }

  function statusOf(contest) {
    return contestStatus(contest, remainingOf(contest))
  }

  /**
   * 进行中那一场「还剩多久结束」（毫秒，正数）。已开赛 20 分钟、总时长 2 小时 → 100 分钟。
   * 拿不到时间字段或本场没有时长时为 null（界面落「—」，不猜）。
   */
  function untilEndOf(contest) {
    const remaining = remainingOf(contest)
    const durationMs = (contest?.durationSeconds || 0) * 1000
    if (remaining === null || !durationMs) return null
    return remaining + durationMs
  }

  /** 进行中比赛的进度 0..1（开赛 0、结束 1）。缺时长字段时给 0，进度条不出现 */
  function progressOf(contest) {
    const durationMs = (contest?.durationSeconds || 0) * 1000
    if (!durationMs) return 0
    const remaining = remainingOf(contest)
    if (remaining === null) return 0
    // 已进行 = −remaining（remaining 开赛后为负）。**别写成 duration − remaining**：
    // 那样开赛瞬间就已经是 duration，进度线起步即满格、之后一直满（2026-11-01 发现）
    return Math.max(0, Math.min(1, -remaining / durationMs))
  }

  /** 开赛时刻 `MM-DD HH:MM`；列表里偶尔缺 startTimeSeconds，落空串让列留白 */
  function startText(contest) {
    return formatStartTime(contest?.startTimeSeconds)
  }

  /**
   * 时长 → 「3 周 6 天 21 小时」。
   *
   * 【为什么不再用 HH:MM:SS】几十上百小时的数字要心算，「天 / 周」一眼就读懂。
   * 【最多三档】从最大的非零档往下取三档：远期只看周 / 天 / 小时，一天以内才带秒
   * —— 否则「23 小时 59 分钟 59 秒」这一长串每秒都在跳，主信息反而看不清。
   */
  function spanText(ms) {
    const parts = durationParts(ms)
    const shown = SPAN_UNITS.filter((key) => parts[key] > 0).slice(0, 3)
    if (!shown.length) return t('cf.contest.schedule.units.seconds', { n: 0 })
    return shown.map((key) => t(`cf.contest.schedule.units.${key}`, { n: parts[key] })).join(' ')
  }

  /**
   * 时钟那一格显示什么：
   *   - 未开赛 → 距开赛还剩多久（「3 周 6 天 21 小时」）
   *   - 进行中 → **距结束还剩多久**（「还剩 1 小时 20 分钟」）。2026-11-01 用户口径：开赛之后
   *     只显示已开赛时间、看不到还剩多少，不方便 —— 于是这一格改成剩余，把「已进行 / 本场
   *     共多长」挪进悬停提示（见 `runningHintOf`），行底那条进度线也在表达同一件事
   *   - 已结束 / 拿不到时间 → 空串（界面落「—」）
   */
  function countdownOf(contest) {
    const remaining = remainingOf(contest)
    if (remaining === null) return ''
    const state = statusOf(contest)
    if (state === 'upcoming') return spanText(remaining)
    if (state === 'running') {
      const left = untilEndOf(contest)
      // 列表偶尔缺 durationSeconds：退回「已进行」——总比一格空白有用
      return left === null
        ? spanText(-remaining)
        : t('cf.contest.schedule.remaining', { time: spanText(left) })
    }
    return ''
  }

  /**
   * 进行中那一格的悬停提示：格子里只放「还剩」，「已进行多少 / 本场共多长」放这儿。
   * 不是进行中的场次返回空串（`title=""` 不会冒出空提示）。
   */
  function runningHintOf(contest) {
    if (statusOf(contest) !== 'running') return ''
    const remaining = remainingOf(contest)
    const total = (contest?.durationSeconds || 0) * 1000
    if (remaining === null || !total) return ''
    return t('cf.contest.schedule.elapsedHint', {
      time: spanText(-remaining),
      total: spanText(total),
    })
  }

  const sortedByStart = computed(() =>
    contests.value.filter((contest) => typeof contest?.startTimeSeconds === 'number'),
  )

  const upcoming = computed(() =>
    sortedByStart.value
      .filter((contest) => statusOf(contest) === 'upcoming')
      .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds),
  )

  const running = computed(() =>
    sortedByStart.value
      .filter((contest) => statusOf(contest) === 'running')
      .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds),
  )

  // 抬头那枚 Live 角标**不在这里**跟着 running 走：它的数字由模块级 syncRunningCount 维护
  // （赛程页不可见时也得在开赛那一刻翻面，见文件头 cfRunningCount 的注释）

  const finished = computed(() =>
    sortedByStart.value
      .filter((contest) => statusOf(contest) === 'finished')
      .sort((a, b) => b.startTimeSeconds - a.startTimeSeconds)
      .slice(0, FINISHED_LIMIT),
  )

  /** 抬头那颗「下一场」：正在进行的优先（用户更关心能不能现在打） */
  const next = computed(() => running.value[0] || upcoming.value[0] || null)

  // ------------------------------------------------------------ 报名状态与两个动作

  /**
   * 读一次报名状态。扩展没装 / 太旧就直接返回（整列由组件按 canReadContestStates 隐藏）。
   * 失败不扔手里那份：与列表同一条纪律 —— 旧状态比一片空白有用。
   */
  function loadStates({ silent = true } = {}) {
    if (!canReadContestStates.value) return Promise.resolve()
    if (statesPromise) return statesPromise

    const mine = ++statesSeq
    if (!silent) statesLoading.value = true

    statesPromise = requestContestStates()
      .then((result) => {
        if (mine !== statesSeq) return
        if (!result.ok) {
          statesError.value = result.reason
          return
        }
        states.value = result.states
        statesError.value = ''
        statesFetchedAt.value = Date.now()
      })
      .finally(() => {
        if (mine === statesSeq) statesLoading.value = false
        statesPromise = null
      })

    return statesPromise
  }

  /** 这一场的报名状态枚举；没读到 / 不在列表第一页就是空串，界面按「—」显示 */
  function stateOf(contest) {
    return states.value[String(contest?.id ?? '')] || ''
  }

  /**
   * 报名 / 开 VP。返回 `{ ok, reason }`，界面负责把 reason 折成一句人话。
   *
   * `options.unrated`（2026-10-30 加）只对报名有意义：用户在确认卡片上选了「不计分」，
   * 原样递给扩展。设不上那颗控件时扩展回 `unrated-unavailable`，这次报名没有发生。
   *
   * 成功后只对「报名」就地改状态：报名一落定，那一列就该马上显示「已报名」（下次刷新会对齐）；
   * VP 不改报名状态 —— 它本来就不是官方报名，那一列说的是「报名」，不是「参赛」。
   */
  async function submitEntry(contest, kind, options = {}) {
    const id = String(contest?.id ?? '')
    if (!id) return { ok: false, reason: 'unsupported' }
    if (entryBusy.value) return { ok: false, reason: 'busy' }

    entryBusy.value = id

    try {
      const result = await requestContestEntry(id, kind, options)
      if (result.ok && kind === 'register') {
        states.value = { ...states.value, [id]: 'registered' }
      }
      return result
    } finally {
      entryBusy.value = ''
    }
  }

  // ------------------------------------------------------------ 心跳与回访

  let timer = 0

  function startTick() {
    if (timer) return
    now.value = Date.now()
    timer = window.setInterval(() => {
      now.value = Date.now()
    }, 1000)
  }

  function stopTick() {
    window.clearInterval(timer)
    timer = 0
  }

  // 只在这一页可见时跳秒：切去题目 / 榜单时，倒计时没人看，白养一只 interval 没意义
  watch(
    active,
    (visible) => {
      if (!visible) {
        stopTick()
        return
      }
      startTick()
      // 每次打开这一页都取一次：首屏要看见转圈（否则会先闪一下「没有取到比赛列表」的空态）；
      // 之后回访静默取，不打扰已经显示着的那份列表 —— 内容没变就不换（见 load）
      if (!fetchedAt.value) void load()
      else void load({ silent: true, force: Date.now() - fetchedAt.value > STALE_MS })
    },
    { immediate: true },
  )

  onBeforeUnmount(stopTick)

  // 报名状态跟着「这一页可见 + 扩展支持」取。扩展握手是异步的（最长约两秒才判「没装」），
  // 所以不能只在挂载时判一次 —— 否则第一屏永远等不到这一列
  watch(
    [active, canReadContestStates],
    ([visible, capable]) => {
      if (!visible || !capable) return
      if (!statesFetchedAt.value || Date.now() - statesFetchedAt.value > STATES_STALE_MS) {
        void loadStates()
      }
    },
    { immediate: true },
  )

  return {
    contests,
    fetchedAt,
    loading,
    error,
    upcoming,
    running,
    finished,
    next,
    load,
    remainingOf,
    statusOf,
    progressOf,
    startText,
    countdownOf,
    runningHintOf,
    states,
    statesLoading,
    statesError,
    statesFetchedAt,
    entryBusy,
    loadStates,
    stateOf,
    submitEntry,
  }
}
