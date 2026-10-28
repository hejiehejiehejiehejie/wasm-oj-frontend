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

/** 进入中（running）的场次数。模块级只读，供抬头「Live」角标读 —— 不新增请求。 */
export const cfRunningCount = ref(0)

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

  /** 此刻的剩余量（毫秒，负数 = 已开赛）。拿不到时间字段时为 null */
  function remainingOf(contest) {
    return contestRemainingMs(contest, fetchedAt.value, now.value)
  }

  function statusOf(contest) {
    return contestStatus(contest, remainingOf(contest))
  }

  /** 进行中比赛的进度 0..1（开赛 0、结束 1）。缺时长字段时给 0，进度条不出现 */
  function progressOf(contest) {
    const durationMs = (contest?.durationSeconds || 0) * 1000
    if (!durationMs) return 0
    const elapsed = durationMs - remainingOf(contest)
    return Math.max(0, Math.min(1, elapsed / durationMs))
  }

  /** 开赛时刻 `MM-DD HH:MM`；列表里偶尔缺 startTimeSeconds，落空串让列留白 */
  function startText(contest) {
    return formatStartTime(contest?.startTimeSeconds)
  }

  /**
   * 倒计时 / 已进行时长 → 「3 周 6 天 21 小时」。
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

  /** 倒计时 / 已进行时长。已结束或拿不到时间时为空串 */
  function countdownOf(contest) {
    const remaining = remainingOf(contest)
    if (remaining === null) return ''
    const state = statusOf(contest)
    if (state === 'upcoming') return spanText(remaining)
    if (state === 'running') return spanText(-remaining)
    return ''
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

  // 抬头那枚 Live 角标与这里共用一份数字；赛程页没打开过时就是 0
  watch(
    running,
    (list) => {
      cfRunningCount.value = list.length
    },
    { immediate: true },
  )

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
   * 成功后只对「报名」就地改状态：报名一落定，那一列就该马上显示「已报名」（下次刷新会对齐）；
   * VP 不改报名状态 —— 它本来就不是官方报名，那一列说的是「报名」，不是「参赛」。
   */
  async function submitEntry(contest, kind) {
    const id = String(contest?.id ?? '')
    if (!id) return { ok: false, reason: 'unsupported' }
    if (entryBusy.value) return { ok: false, reason: 'busy' }

    entryBusy.value = id

    try {
      const result = await requestContestEntry(id, kind)
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
