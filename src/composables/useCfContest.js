/**
 * useCfContest —— 比赛：贴链接 → 倒计时 → 题目列表 → 导入工作区（「抓整场样例」封存中）。
 *
 * 【它不负责界面】与 useCfPicker 同一分工：页签开关归 editorViews，这里只管数据与过程。
 * 界面是独立组件 CfContestPanel（2026-10-19 从抽题面板里拆出来单飞；2026-10-27 起它
 * 挂进合并后的 Codeforces 页签 CfCodeforcesPanel 里，不再自己占一个视图 id），
 * **只在那一个组件的 setup 里调用本组合式函数** —— 与 useCfPicker 只归 CfPickerPanel 是
 * 同一条纪律。
 *
 * 【倒计时为什么不累减】浏览器会把后台标签页的定时器节流到 1s 以上（更长时可能几分钟
 * 才触发一次），累减出来的时间必然越走越慢。这里每秒只推进一个 `now`，剩余量由
 * `contestRemainingMs` 用「绝对开赛时刻 / 取数时刻 + relativeTimeSeconds」现算 ——
 * 标签页被冻结再回来，数字立刻是对的，不需要补账。（2026-11-16 起优先按 `startTimeSeconds`
 * 算：CF 那份 relative 是内部快照、实测比响应旧几十秒，细则见 cf/contest.js。）
 * 同一条纪律在 cloudSession 的取码倒计时上已经用过。
 *
 * 【为什么要分开两条取数】倒计时是开赛前唯一要看的东西，而题目列表要拉一次整场榜单、
 * 再兜底 5.9MB 榜单。合成一条，用户为了看个倒计时得等十几秒。所以元数据先到、
 * 题目列表随后自己补上（两条消息见 services/cfClient.js）。
 *
 * 【样例从哪来】CF 的接口不给样例，题目页又没有 CORS 头，所以导入的题一律是
 * 「先落盘、样例后补」。补法有两种：① 被动 —— 用户之后打开这道题的页面时，浏览器扩展
 * 会问一句要不要抓（见 useCompanionBridge.js 的自动抓取样例）；② 主动 —— 扩展支持
 * `contest-batch` 时可以把整场交给它读一遍。**② 自 2026-11-13 起封存**（入口撤了，
 * 实现留在本文件末尾，见那一段的说明），所以现在实际只有①这一条路在跑。
 * 两条路最后都落到同一条 cp-task 投递上，由 importProblem 按 url 并进已有的题里。
 *
 * 【VP 改写这一场的「开赛时刻」（2026-11-03）】开过虚拟参赛的场次不按官方时刻算：状态、
 * 倒计时、锁题全部读本机的 VP 账本（services/cfVirtualContest.js）。VP 到点前题面与榜单
 * 都拿不到 —— CF 的接口对一场「官方已结束」的比赛照常给题，不自己拦就等于提前看题。
 */
import { computed, nextTick, onBeforeUnmount, ref, toRaw, watch } from 'vue'

import { t } from '../i18n/index.js'
import {
  PHASE,
  contestProblemsUrl,
  contestRemainingMs,
  contestStatus,
  contestUrl,
  formatDuration,
  formatStartTime,
  mergeContestMeta,
  parseContestSpec,
  sortByIndex,
  virtualContestStatus,
} from '../cf/contest.js'
import { cfContest, cfContestProblems } from '../services/cfClient.js'
import { cfReady } from '../services/cfRuntime.js'
import { virtualContestOf } from '../services/cfVirtualContest.js'
import { closeCodeforcesTab, deactivateViews } from '../services/editorViews.js'
import {
  addTabsToGroup,
  findGroupByName,
  groupOfId,
  groupTabs,
  renameGroup,
} from '../services/tabGroups.js'
import { importProblem, openProblemByUrl } from '../services/vfs/problemImport.js'
import { findProblemByUrl, openFile } from '../services/vfs/workspaceStore.js'
import { canScrapeContest, requestContestScrape } from './useCompanionBridge.js'
import { compactContestName } from './useCfSchedule.js'
import { usePersistentRef } from './usePersistentRef.js'

/** 偏好键，与抽题那组同为 `cp.cf.` 前缀 */
const KEY = {
  spec: 'cp.cf.contestSpec',
}

/** Worker 回的失败码 → 界面要显示的那条文案 */
function toErrorValue(failure) {
  const code = failure?.code
  if (code === 'CONTEST_NEEDS_LOGIN') return { key: 'cf.contest.errors.needsLogin' }
  if (code === 'BAD_CONTEST_ID') return { key: 'cf.contest.errors.badLink' }
  if (code === 'WORKER_TIMEOUT') return { key: 'cf.contest.errors.timeout' }
  if (code === 'DISPOSED' || code === 'WORKER_ERROR') return { key: 'cf.contest.errors.worker' }
  return { key: 'cf.contest.errors.fetch', params: { detail: failure?.message || '' } }
}

export function useCfContest() {
  /** 输入框里那串链接 / ID。逐字段持久化，刷新与换会话都能回填上次查的那场 */
  const specText = usePersistentRef(KEY.spec, '')
  const spec = computed(() => parseContestSpec(specText.value))

  /** 元数据 / 题目列表各自一个 loading —— 它们的目标就是「快的先到」 */
  const loadingContest = ref(false)
  const loadingProblems = ref(false)
  const error = ref(null)

  /** CF 给的比赛元数据；group 的比赛拿不到（不在 contest.list 里），此时为 null */
  const contest = ref(null)
  /** 元数据取回来的本地时刻，倒计时靠它算「这份数据放了多久」 */
  const fetchedAt = ref(0)
  const problems = ref([])
  /**
   * 题目列表的**空态说明**（还没开赛 / 这场没有列表）。
   *
   * 刻意与 `error` 分开：「还没开赛」不是故障，而且它绝不能顶掉状态行里的倒计时 ——
   * 开赛前用户唯一要看的就是那个数字，被一句「还没开赛」盖住是荒谬的。
   */
  const problemsNote = ref(null)

  /**
   * 「手上这份开赛时刻和 CF 对不上了」—— 延期，或者仅仅本机时钟快了一两秒（2026-11-16 加）。
   *
   * 【判据只有一条是真的】本地按时刻已经推过「已开赛」，而 CF 的榜单接口回了
   * "has not started"（`pending`）。两者不可能同时为真 —— 要么 `startTimeSeconds` 被 CF
   * 改了（延期），要么本机时钟比 CF 快了几秒。`contest.list` 在 Worker 里缓存一小时，
   * 延期正好落进这一小时就会这样：倒计时数完了，比赛其实还没开。
   *
   * 【它是一个**电平**，不是一个边沿】这是上一版最大的教训：当时靠 `status` 从 `upcoming`
   * 跳走的那个边沿去清理它，于是「本机时钟快 1 秒 → 置了 stale → CF 的 phase 后来变成
   * CODING，可 startTimeSeconds 没变、status 一直算作 running、永远不再跳变」这种情况
   * **清不掉**，界面会卡在「CF 说还没开赛」整整 20 分钟。现在只由 `applyContestMeta`
   * 按「远端亲口说了什么」来解封（见那里的说明），与 status 跳不跳变无关。
   *
   * 它做三件事：① 状态行不再撒谎；② 起一条两阶段自愈（见 POSTPONE_*）；
   * ③ 让手动「载入」带 force —— 那是用户自己要求「问 CF 要真时刻」。
   */
  const startStale = ref(false)

  /**
   * 失步刚开始的那 10 秒里，状态行说「正在同步开赛状态…」而不是「CF 尚未开赛」。
   *
   * 【为什么要有这一档】本机时钟快 1 秒时，归零那一帧 standings 必然回 has not started。
   * 若当场就写「CF 尚未开赛」，每一次准时开赛都会给用户看一句吓人的话，而 2 秒后它自己就
   * 好了。10 秒是阶段 1 的窗口（POSTPONE_QUICK_WINDOW_MS），过了它才认定是真延期。
   */
  const syncingStart = ref(false)

  /**
   * 这一场在这台设备上的虚拟参赛（没有 = null）。
   *
   * 【为什么开赛时刻从这里读】`contest.list` 里这一场可能早就 FINISHED 了，而用户的 VP 也许
   * 还没开始 —— 官方时刻在这件事上一点用都没有。账本是响应式的：站内开成功、
   * 扩展从 CF「Recent virt. contests」读回来，都会让这一页立刻换到 VP 的时刻。
   */
  const vp = computed(() => virtualContestOf(spec.value?.contestId))
  const virtual = computed(() => vp.value !== null)

  /** 每秒推进一次。只作为 computed 的依赖，不参与任何累减 */
  const now = ref(Date.now())
  const remainMs = computed(() => {
    if (vp.value) return Number(vp.value.startMs) - now.value
    return contestRemainingMs(contest.value, fetchedAt.value, now.value)
  })
  const status = computed(() => {
    if (vp.value) return virtualContestStatus(vp.value, now.value)
    return contestStatus(contest.value, remainMs.value)
  })

  /**
   * VP 还没到点：题面与榜单都不打开（与正式参赛开赛前同一口径）。
   *
   * 【为什么必须自己拦】正式比赛开赛前，CF 的接口里本来就没有题；VP 面对的那一场早就是
   * 「已结束」，接口会原样把题面与榜单给出来 —— 不拦就等于提前看题，比赛的计时失去意义。
   */
  const vpLocked = computed(() => virtual.value && status.value === 'upcoming')

  /** VP 开始时刻 `MM-DD HH:MM`（本机时区），挂在页头徽标上 */
  const vpStartText = computed(() => formatStartTime(Number(vp.value?.startMs || 0) / 1000))

  /** 比赛在网页上的地址（元数据没到也能拼，group 会带上 groupId） */
  const url = computed(() => {
    const base = contestUrl(spec.value)
    if (!base) return ''
    // VP 还没开始：CF 上那一页是倒计时页（/contest/{id}/countdown），开赛后自动跳回比赛页。
    // 与赛程行尾 ↗ 的落点一致（用户从 /contests 点 Enter 看到的也是它）
    return vpLocked.value ? `${base}/countdown` : base
  })

  /** 标题：优先用 CF 给的名字，拿不到就退回 ID */
  const title = computed(() => contest.value?.name || (spec.value ? `#${spec.value.contestId}` : ''))

  /**
   * 状态行文案。
   *
   * 【顺序有讲究】倒计时排在「正在获取题目列表」前面 —— 开赛前用户要看的就是那个数字，
   * 题目列表晚到几秒不该把它挤掉。「正在获取题目列表」只在**连比赛状态都还没有**时兜底
   * （group 的场次没有元数据）。
   */
  const statusText = computed(() => {
    if (error.value) return t(error.value.key, error.value.params)
    // VP 的时刻是本机账本给的，不必等元数据：开赛前用户要看的就是这个倒计时
    if (virtual.value) {
      if (status.value === 'upcoming') {
        return t('cf.contest.status.vpUpcoming', { time: formatDuration(remainMs.value) })
      }
      if (status.value === 'running') {
        return t('cf.contest.status.vpRunning', { time: formatDuration(-remainMs.value) })
      }
      if (status.value === 'finished') return t('cf.contest.status.finished')
    }
    if (loadingContest.value) return t('cf.contest.status.loading')
    if (startStale.value) {
      // 刚过点那 10 秒只是「本机时钟快了一两秒」的概率更高，别拿「CF 尚未开赛」吓人
      if (syncingStart.value) return t('cf.contest.status.syncing')
      return t('cf.contest.status.staleStart', {
        start: formatStartTime(contest.value?.startTimeSeconds) || '—',
        delay: formatDuration(Math.max(0, -(remainMs.value || 0))),
      })
    }
    if (status.value === 'upcoming') {
      return t('cf.contest.status.upcoming', { time: formatDuration(remainMs.value) })
    }
    if (status.value === 'running') {
      return t('cf.contest.status.running', { time: formatDuration(-remainMs.value) })
    }
    if (status.value === 'finished') return t('cf.contest.status.finished')
    if (loadingProblems.value) return t('cf.contest.status.problems')
    return ''
  })

  /**
   * 按钮的禁用条件**只看元数据**：题目列表还要再拉一次整场榜单，让按钮一直灰着
   * 就没法立刻换一场。列表本来就在后台补，换掉也不浪费 —— 旧的那次会被代次判废。
   */
  const busy = computed(() => loadingContest.value)

  // ------------------------------------------------------------ 时刻失步（延期）的自愈

  /**
   * 阶段 1（时钟偏置快探）的窗口。原定时刻之后这么久还没开赛，就不再当「本机时钟快了一两秒」。
   *
   * 【为什么是 10 秒】实测本机与 CF 的 `Date` 头差 < 2 秒，所以「时钟骗了我们」最多骗两三秒；
   * 过了 10 秒还没开，只能是 CF 真没开。
   */
  const POSTPONE_QUICK_WINDOW_MS = 10 * 1000
  /** 阶段 1 的快探节奏（自发现失步起）。standings 回 pending 时每次只要 79 字节（实测） */
  const POSTPONE_QUICK_DELAYS = [2000, 5000, 10 * 1000]
  /** 阶段 2 的「探活」：`contest.standings`，pending 79 字节，30 秒一次 */
  const POSTPONE_PROBE_MS = 30 * 1000
  /**
   * 阶段 2 的「查改期」阶梯：`contest.list` 一次 413KB（实测），只在阶梯点上付。
   * 首级 0 = 进入阶段 2 立刻付一次 —— 此刻手上那份时刻已经确认是旧的了，问得越早越好。
   */
  const POSTPONE_LIST_LADDER = [0, 60 * 1000, 2 * 60 * 1000, 3 * 60 * 1000, 5 * 60 * 1000]
  /** 兜底：三小时后停手，但**保留** startStale（文案继续说实话，手动载入仍带 force） */
  const POSTPONE_MAX_MS = 3 * 60 * 60 * 1000
  /** 快照有多新才算「刚拉过」：比这老就立刻付一次 list 问真时刻（见 onStandingsPending） */
  const POSTPONE_FRESH_MS = 10 * 1000

  let quickTimer = 0
  let probeTimer = 0
  let listTimer = 0
  let syncingTimer = 0
  let ladderIndex = 0
  /** 0 = 当前不在失步态。它是「这套定时器在不在跑」的唯一记号 */
  let postponeStartedAt = 0
  /** 比赛面板（v-show）此刻露没露出来。隐藏时暂停慢轮询，切回瞬间补探一次 */
  let panelVisible = true

  /**
   * 两条腿**各自下一次该发的时刻**（0 = 这一腿没有在等）。
   *
   * 【为什么要记死这个时刻】面板隐藏 / 切后台时只能把 timer 掐掉，但**不能把「本来该在
   * 12:00:30 发」这件事忘了**：选手在编辑器与题面之间来回切面板，以前每切回来就无条件补探
   * 一次，切五次付五次；`startSlowPoll` 还会把 `ladderIndex` 重置，退避阶梯永远走不到下一级。
   * 现在恢复时按 `dueAt - now` 重挂：没到点就接着等，过期了才立刻发一次。
   */
  let nextProbeDueAt = 0
  let nextListDueAt = 0

  /**
   * 「远端亲口确认开赛」的代数（2026-11-16 加，专治迟到的 pending）。
   *
   * 两条腿并发在途：`standings` 可能慢到 3–5 秒。若期间另一条腿先拿到「已开赛」的权威
   * 结论、把失步解封，随后那个**慢的** standings 才带着 `has not started` 回来 ——
   * 它描述的是几秒前的事，却会把刚解封的 `startStale` 重新置位，再起一轮轮询。
   * 每确认一次 `phase !== BEFORE` 就 +1；请求发出时记下当时的值，回来时对不上就丢掉。
   */
  let metaEpoch = 0

  /** 停掉所有延时任务，但**不动** `startStale`（三小时停手时用：文案还要继续说真话） */
  function stopPostponePoll() {
    window.clearTimeout(quickTimer)
    window.clearTimeout(probeTimer)
    window.clearTimeout(listTimer)
    window.clearTimeout(syncingTimer)
    quickTimer = 0
    probeTimer = 0
    listTimer = 0
    syncingTimer = 0
    ladderIndex = 0
    postponeStartedAt = 0
    nextProbeDueAt = 0
    nextListDueAt = 0
    syncingStart.value = false
  }

  /** 失步结束：停任务 + 撤标记（拿到新时刻 / 手动载入 / 换场次时用） */
  function clearPostpone() {
    stopPostponePoll()
    startStale.value = false
    // 心跳只为「开赛前那个数字」服务；失步期间它是为了让「已推迟 00:0x:xx」跟着走
    if (status.value !== 'upcoming') stopTimer()
  }

  function postponeExpired() {
    if (!postponeStartedAt) return false
    if (Date.now() - postponeStartedAt <= POSTPONE_MAX_MS) return false
    stopPostponePoll()
    return true
  }

  /**
   * 阶段 2 的探活腿：standings。它成功时顺路带回 `result.contest` 与题目，一步到位。
   *
   * `delay` 默认是整拍 30 秒；恢复（暂停结束）时传剩余时间，好把原来的 dueAt 接上。
   */
  function armProbe(delay = POSTPONE_PROBE_MS) {
    if (probeTimer || !startStale.value) return
    nextProbeDueAt = Date.now() + delay
    probeTimer = window.setTimeout(async () => {
      probeTimer = 0
      nextProbeDueAt = 0
      if (!startStale.value || postponeExpired()) return
      await loadProblems({ silent: true })
      if (startStale.value) armProbe()
    }, delay)
  }

  /**
   * 阶段 2 的查改期腿：contest.list（413KB），按阶梯退避，5 分钟封顶。
   *
   * 只有走阶梯（不传 `delay`）时才推进 `ladderIndex` —— 恢复时传的是剩余时间，
   * 那不是新的一拍，不能让它白白吃掉一级。
   */
  function armListProbe(delay) {
    if (listTimer || !startStale.value) return
    let wait = delay
    if (wait === undefined) {
      wait = POSTPONE_LIST_LADDER[Math.min(ladderIndex, POSTPONE_LIST_LADDER.length - 1)]
      ladderIndex += 1
    }
    nextListDueAt = Date.now() + wait
    listTimer = window.setTimeout(async () => {
      listTimer = 0
      nextListDueAt = 0
      if (!startStale.value || postponeExpired()) return
      await loadContest({ silent: true, force: true })
      if (startStale.value) armListProbe()
    }, wait)
  }

  /**
   * 阶段 2：探活 + 查改期两条腿并行。
   *
   * `fresh` = 手上这份时刻是刚拉的 —— 那就不必再立刻付 413KB（问也是同一个答案），
   * 从阶梯第二级起，由 30 秒一次的 79 字节探活先顶着。
   *
   * **只在进阶段 2 的那一刻调**（以及「已过点 > 10 秒」那一支）。恢复暂停不走这里 ——
   * 那条路要让阶梯接着走，见 `resumePostponePoll`。
   */
  function startSlowPoll({ fresh = false } = {}) {
    if (!startStale.value) return
    ladderIndex = fresh ? 1 : 0
    armProbe()
    armListProbe()
    // 进阶段 2 的这一刻用户可能正在编辑器里（面板 v-show 隐藏）或切走了标签页：
    // 先把两条腿的到期时刻算出来，再把 timer 掐掉。回到前台由 resumePostponePoll 按
    // 剩余时间接上 —— 挂起期间一个新请求都不发
    if (document.hidden || !panelVisible) pausePostponePoll()
  }

  /** 阶段 1：2s / 5s / 10s 各轻探一次；三次都没开就转阶段 2 */
  function runQuickProbe(step = 0) {
    quickTimer = 0
    if (!startStale.value || postponeExpired()) return
    void loadProblems({ silent: true }).then(() => {
      if (!startStale.value) return
      if (step + 1 < POSTPONE_QUICK_DELAYS.length) {
        const gap = POSTPONE_QUICK_DELAYS[step + 1] - POSTPONE_QUICK_DELAYS[step]
        quickTimer = window.setTimeout(() => runQuickProbe(step + 1), gap)
        return
      }
      startSlowPoll()
    })
  }

  /**
   * 题目列表回了「还没开赛」，而本地按时刻已经认为开赛了 —— 时刻失步，开始自愈。
   *
   * 两档判法，只差在「过了原定时刻多久」：
   *
   * - **≤ 10 秒**：先当本机时钟快了一两秒。2s/5s/10s 各轻探一次（每次 ≤ 79 字节），文案说
   *   「正在同步开赛状态…」。**不在这里付 413KB** —— 准点开赛的话 standings 自己会把
   *   `result.contest` 和题目一起带回来，根本不需要 contest.list。
   * - **> 10 秒**：手上那份时刻明显是旧的（典型：页面开着，缓存里那份开赛时刻早就过了）。
   *   立刻付一次 list 问真时刻，否则用户要干等一个轮询周期才第一次刷新。
   *
   * 【为什么不能只探 standings】延期的形态是「CF 把开赛时刻往后挪」：那 30 分钟里 standings
   * 一直回 has not started，只有 contest.list 知道新时刻。只探 standings 就等于放弃了
   * 「恢复倒计时」这件事，用户会干瞪着「CF 尚未开赛」直到真开赛 —— 两条腿缺一不可。
   */
  function onStandingsPending() {
    if (status.value === 'upcoming' || startStale.value) return

    startStale.value = true
    now.value = Date.now()
    postponeStartedAt = Date.now()
    // 失步期间状态行要报「已推迟 00:0x:xx」，那个数字得跟着秒走（watch 只在上游改变时跑）
    startTimer()

    const overdueMs = Math.max(0, -(remainMs.value || 0))
    const snapshotAgeMs = Date.now() - (fetchedAt.value || 0)

    if (overdueMs <= POSTPONE_QUICK_WINDOW_MS) {
      syncingStart.value = true
      syncingTimer = window.setTimeout(() => {
        syncingTimer = 0
        syncingStart.value = false
      }, POSTPONE_QUICK_WINDOW_MS)
      quickTimer = window.setTimeout(() => runQuickProbe(0), POSTPONE_QUICK_DELAYS[0])
      return
    }

    startSlowPoll({ fresh: snapshotAgeMs <= POSTPONE_FRESH_MS })
  }

  /** 面板被切走、或标签页切到后台：慢轮询全停，状态与文案留着 */
  function pausePostponePoll() {
    window.clearTimeout(probeTimer)
    window.clearTimeout(listTimer)
    probeTimer = 0
    listTimer = 0
    // dueAt 故意留着：恢复时靠它判断「挂起期间有没有跨过原定那一拍」
    // 阶段 1 那三次快探**不暂停**：选手常见做法是开赛前切去编辑器敲模板、等题目自己冒出来，
    // 把 10 秒内的探活掐掉，他们就永远等不到那次「题目到了」
  }

  /**
   * 回到前台 / 切回比赛面板：按**原定到期时刻**把两条腿接回去。
   *
   * 到点了（挂起期间跨过了 dueAt）就立刻发一次；没到点就按剩余时间重挂 —— 不无条件补探。
   * 这条规则是给「选手在题面与编辑器之间反复切面板」准备的：切五次不该付五次请求，
   * 更不该让退避阶梯被 `startSlowPoll` 重置回第一级。
   */
  function resumePostponePoll() {
    if (!startStale.value || document.hidden || !panelVisible) return
    if (quickTimer) return
    const nowMs = Date.now()
    now.value = nowMs
    if (nextProbeDueAt) armProbe(Math.max(0, nextProbeDueAt - nowMs))
    if (nextListDueAt) armListProbe(Math.max(0, nextListDueAt - nowMs))
  }

  /** 比赛面板露没露出来（外面是 v-show）。隐藏时慢轮询停掉，别在用户写代码时偷偷拉 413KB */
  function setVisible(value) {
    const next = value !== false
    if (next === panelVisible) return
    panelVisible = next
    if (next) resumePostponePoll()
    else pausePostponePoll()
  }

  // ------------------------------------------------------------ 倒计时的心跳

  let timer = 0

  function startTimer() {
    if (timer) return
    timer = window.setInterval(() => {
      now.value = Date.now()
    }, 1000)
  }

  function stopTimer() {
    window.clearInterval(timer)
    timer = 0
  }

  /**
   * 只在这一场还没开始时才跑心跳：已开赛 / 已结束的时间没必要每秒重算，
   * 也免得一张不动的面板白养一只 interval。
   *
   * 【翻面时要重取两条，不只是元数据】开赛那一刻 CF 那边 phase 已经变了，但手里这份还是 BEFORE：
   * 元数据不重取，「已开赛」会一直挂着旧名字与旧时长；**题目列表不重取，则会永久停在开赛前的空态**
   * —— 开赛前它是 `pending`（standings 回 "has not started"），那条「还没开赛，题目开赛后才会出现」
   * 会一直挂在屏幕上，要等用户自己再点一次「载入」才消失。所以两条一起刷。
   */
  watch(
    status,
    (next, previous) => {
      if (next === 'upcoming') {
        // 回到「还没开赛」= 手上的时刻被 CF 换成了新的（延期后追上了），失步到此结束
        clearPostpone()
        startTimer()
        return
      }

      // 失步期间心跳不能停：状态行里的「已推迟 00:0x:xx」要靠它走
      if (!startStale.value) stopTimer()
      // next === 'unknown' 说明 `contest` 被清空了（换一场 / 取数失败），不是时间推着翻的面：
      // 这条路上 load() 紧接着自己就要发这两条请求，补刷只会多打一次
      // —— 题目那条要拉一次整场榜单（裸参 2–6MB），不能白付。
      if (previous === 'upcoming' && next !== 'unknown') {
        // 【归零只问 standings】standings 成功时自带 `result.contest`（新 phase、新时长都在里面），
        // pending 时只要 79 字节 —— 比 force 一次 413KB 的 contest.list 便宜三个数量级。
        // 若本机时钟快了一两秒而收到 pending，由阶段 1 的快探在 2 秒内接手（见 onStandingsPending）。
        void loadProblems()
      }
    },
    { immediate: true },
  )

  /** 页面从后台回到前台：校正一次时间，顺便把失步态的自愈接上 */
  function onVisibilityChange() {
    if (document.visibilityState !== 'visible') {
      pausePostponePoll()
      return
    }
    now.value = Date.now()
    resumePostponePoll()
  }
  document.addEventListener('visibilitychange', onVisibilityChange)

  onBeforeUnmount(() => {
    stopTimer()
    clearPostpone()
    document.removeEventListener('visibilitychange', onVisibilityChange)
  })

  // ------------------------------------------------------------ 取数

  /**
   * 两条取数各有一个「代次」计数器。
   *
   * 【为什么不用 loading 当并发守卫】用户改一下输入框再点「载入」是很常见的动作：
   * 若上一条还在途就 return，新比赛**根本不会发请求**，界面于是停在旧的那场。
   * 所以两次并发都放行，回来时按代次认领 —— 只认最后一次，晚到的旧结果直接丢掉。
   * （同一条纪律在 useCfPicker 的账号校验里是另一种写法：那里比的是输入内容。）
   */
  let contestSeq = 0
  let problemsSeq = 0

  /**
   * VP 一旦锁上（刚开的那场 VP 被采纳、或用户在别处开过），手里已经取回的题面要立刻收掉：
   * 否则会留着一屏「开赛前不该看见的题」。作废在途的那一发，让晚到的结果落不进来。
   * 解锁（到点开赛）不用在这里做什么 —— status 的 watch 会照常重取。
   */
  watch(vpLocked, (locked) => {
    if (!locked) return
    problemsSeq += 1
    loadingProblems.value = false
    problems.value = []
    problemsNote.value = { key: 'cf.contest.errors.vpNotStarted' }
  })

  /**
   * 把一份**刚拿到的**比赛元数据落进状态，并按它判断「时刻失步结束了没」。
   *
   * 【为什么要一个统一入口】元数据现在有两条来路：`contest.list`（413KB，稀疏查改期）与
   * `contest.standings`（成功时自带 `result.contest`，pending 时才 79 字节）。两条路要更新
   * 同一份状态、按同一套规则解封，写两遍必然走偏。
   *
   * 【解封为什么不看 status 的跳变】`startStale` 是**电平**不是边沿。真实场景：本机时钟快
   * 1 秒 → 归零那一帧 standings 回 has not started → 置了 stale；随后 CF 的 phase 变成
   * CODING，可 `startTimeSeconds` 没变，`status` 一直算作 running、**永远不会再跳变** ——
   * 靠 watch 去清就等于清不掉（上一版正是这样卡了 20 分钟）。所以判据换成「远端亲口说了
   * 什么」：`phase !== 'BEFORE'`（开赛了 / 已结束），或它带回来的新时刻把状态推回了
   * `upcoming`（改期但还没到点）。两者任一成立，失步即刻结束。
   *
   * @param {Record<string, any>|null} raw 元数据（contest.list 的条目或 standings 的 result.contest）
   * @param {{fetchedAt?: number}} [options] 这份数据真正取回来的时刻（缓存命中时就是落库时刻）
   */
  function applyContestMeta(raw, { fetchedAt: at = Date.now() } = {}) {
    if (!raw) return

    // 【合并要挡倒退】standings 是实时口径，`contest.list` 走 CF 的边缘缓存（开赛瞬间常落后
    // 30–60 秒）。谁后到谁覆盖的话，界面会被一份更旧的数据打回 BEFORE / FINISHED。
    // 判据与取舍都写在 cf/contest.js 的 mergeContestMeta 里，这里只管调用。
    contest.value = mergeContestMeta(contest.value, raw)
    fetchedAt.value = at
    now.value = Date.now()

    // 远端亲口说「不再是开赛前」= 一次权威确认（哪怕这份数据的 startTimeSeconds 没变，
    // 见 metaEpoch 的说明）。用 raw 判，不用合并结果 —— 后者可能只是沿用了本地已知的相位
    const confirmed = raw.phase !== undefined && raw.phase !== PHASE.BEFORE
    if (confirmed) metaEpoch += 1

    const mergedPhase = contest.value?.phase
    const releasedByPhase = mergedPhase !== undefined && mergedPhase !== PHASE.BEFORE
    if (!confirmed && !releasedByPhase && status.value !== 'upcoming') return

    const wasStale = startStale.value
    clearPostpone()
    // 远端确认开赛、而我们手上还没有题目：补一次（题目只会在开赛之后才出现）
    if (wasStale && !problems.value.length && releasedByPhase) {
      void loadProblems({ silent: true })
    }
  }

  /**
   * 元数据。silent 时不动错误槽、也不亮载入态（给「到点自动刷新」与失步轮询用 ——
   * 每隔半分钟闪一次「正在获取比赛信息…」是不能接受的）。
   *
   * `force` 绕过 Worker 那 1 小时的 `contest.list` 缓存，只在两处给：失步态下查改期的
   * 那条腿（413KB，阶梯退避），以及用户手动点「载入」。归零那一刻**不再** force ——
   * 那条路走 standings，它自带 `result.contest`（见 loadProblems 与 applyContestMeta）。
   */
  async function loadContest({ silent = false, force = false } = {}) {
    const current = spec.value
    if (!current) return

    const seq = ++contestSeq
    if (!silent) loadingContest.value = true
    if (!silent) error.value = null
    try {
      const response = await cfContest(current, { force })
      if (seq !== contestSeq) return

      if (response.contest) {
        applyContestMeta(response.contest, { fetchedAt: response.fetchedAt || Date.now() })
      } else {
        contest.value = null
        fetchedAt.value = response.fetchedAt || 0
        now.value = Date.now()
      }

      // group 的比赛本来就不在 contest.list 里，拿不到元数据不算错
      if (!response.contest && current.kind !== 'group') {
        if (response.missing && force) {
          // 强制问过一次、CF 的列表里还是没有这一场：取消 / 已挪去别处，与延期不是一回事。
          // **silent 也照设**：这是终态，用户必须看见，否则界面会停在空状态行上
          clearPostpone()
          error.value = { key: 'cf.contest.errors.contestGone' }
        } else if (!silent) {
          error.value = { key: 'cf.contest.errors.notFound' }
        }
      }
    } catch (failure) {
      if (seq === contestSeq && !silent) error.value = toErrorValue(failure)
    } finally {
      if (seq === contestSeq) loadingContest.value = false
    }
  }

  /**
   * 题目列表。慢的那一条，不阻塞倒计时。
   *
   * `silent` 给失步态下的探活/快探用：不亮载入态、不往错误槽里写东西（一次网络抖动不该
   * 盖掉状态行，反正半分钟后又探一次）。**但有两件正事照做**：题目照收、
   * `result.contest` 照喂给 `applyContestMeta` —— 那正是这条探活腿的价值所在。
   */
  async function loadProblems({ silent = false } = {}) {
    const current = spec.value
    if (!current) return

    // VP 还没开始：接口会把题面原样给出来（这一场官方早就结束了），必须在这里拦住。
    // 空态说明与「尚未开赛」分开说 —— 用户等的是自己定的那个时刻
    if (vpLocked.value) {
      problemsSeq += 1
      loadingProblems.value = false
      problems.value = []
      problemsNote.value = { key: 'cf.contest.errors.vpNotStarted' }
      return
    }

    const seq = ++problemsSeq
    // 发出时的「权威确认」代数：回来若对不上，说明这期间另一条腿已经拿到更新的结论
    const epochAtSend = metaEpoch
    if (!silent) loadingProblems.value = true
    try {
      const response = await cfContestProblems(current)
      if (seq !== problemsSeq) return

      problems.value = sortByIndex(response.problems || [])
      // 【顺序有讲究】先把题目落进去，再喂元数据：applyContestMeta 在「刚解封」时会补拉一次
      // 题目，这一步先落就能让「题目已在手上」这个判据成立，不必再打一次榜单单。
      // `fetchedAt` 用响应带回来的真实取数时刻（内存复用命中时它比现在早几十秒）
      applyContestMeta(response.contest, { fetchedAt: response.fetchedAt || Date.now() })
      // 拿到东西就把空态说明撤掉；空列表则留一句 —— 但**不进 error**，它不该抢占状态行
      if (problems.value.length) {
        problemsNote.value = null
      } else if (
        response.pending &&
        (metaEpoch !== epochAtSend || spec.value?.contestId !== current.contestId)
      ) {
        // 【迟到的 pending】这条请求在途时，另一条腿已经拿到「CF 说开赛了」的确认。
        // 它描述的是几秒前的事，不能拿它把刚解封的失步状态重新锁上，也别写「还没开赛」。
        problemsNote.value = null
      } else {
        // pending = 还没开赛，题目本来就还没出现。这与「开赛了但一道题都没有」是两种境况，
        // 说错一句用户会去查自己的网络
        problemsNote.value = {
          key: response.pending ? 'cf.contest.errors.notStarted' : 'cf.contest.errors.noProblems',
        }
        if (response.pending) onStandingsPending()
      }
    } catch (failure) {
      if (seq !== problemsSeq) return
      problems.value = []
      if (!silent) error.value = toErrorValue(failure)
    } finally {
      if (seq === problemsSeq) loadingProblems.value = false
    }
  }

  /** 载入（按钮）。元数据先来，题目列表自己跟上 */
  async function load() {
    if (!spec.value) {
      error.value = { key: 'cf.contest.errors.badLink' }
      return
    }

    // 失步态下手动载入 = 「我要 CF 的真时刻」，必须绕过 1 小时缓存；正常载入不 force
    // （换场 / 首载本来就不在缓存里，白付一次 413KB 没有意义）
    const force = startStale.value
    clearPostpone()

    resetResults()
    problems.value = []
    problemsNote.value = null
    contest.value = null
    error.value = null

    await loadContest({ force })
    void loadProblems()
  }

  // ------------------------------------------------------------ 导入工作区

  /** 本次会话导入过的题目 url（只影响按钮状态，不落盘） */
  const importedUrls = ref(new Set())
  const importingUrl = ref('')
  const importingAll = ref(false)

  /**
   * 本场的页签组（2026-10-26 用户口径：比赛题目导入后归进一个以比赛名命名的组；
   * 2026-11-03 起组名改用 `compactContestName` 的短名，见 trackContestTab）。
   *
   * 与抽题那边的 `batchGroupId` 同一定位：这里只记组 id，建组 / 收编全走 tabGroups 的公开
   * 入口。不设「至少两道才建组」的门槛 —— 比赛的名字天生是组名，先导一道也该有组。
   * 刷新 / 换会话后组仍按名字找回（见 trackContestTab），所以这个变量只是本场的快路径。
   */
  let contestGroupId = null

  /** 换了一场：把上一场的导入账与抓取状态清掉，否则新一场的题会带着旧的对勾与旧的结果 */
  function resetResults() {
    importedUrls.value = new Set()
    importingUrl.value = ''
    importingAll.value = false
    contestGroupId = null
    resetScrape()
  }

  /**
   * 把刚导入的页签收进本场的组：组名 = 比赛**短名**。
   *
   * 短名复用赛程窄容器那一份 `compactContestName`（2026-11-03 用户口径：比赛全名太长，
   * 芯片上显示不全）：它把「Educational Codeforces Round 196 (Rated for Div. 2)」重排成
   * 「Edu 196(Div. 2)」—— 芯片放得下，而编号与 Div. 恰好是区分一场比赛的信息。
   * **只作用于组名**：落盘目录（`importOne` 的 `contestName`）仍用全名，别把短名灌进路径。
   *
   * 【为什么要等一次 nextTick】新页签是 openTabIds 的 watch（flush: 'pre'）排进 stripOrder 的，
   * 而 tabGroups 只收「条带上已有的」页签 —— 不等这次刷新，刚打开的页签会被静默过滤掉
   * （组建不出来 / 加不进去）。与 useCfPicker 的 trackBatchTab 同一条纪律。
   *
   * 同一场再导入（刷新后重新导、或分几次导）先按名字找回已有的组，找不到才新建；
   * 用户把整组关掉时 groupOfId 查不到，也会另建一个，不把页签塞进不存在的组。
   * 老版本用全名建的组按全名兜底找回、就地改成短名 —— 否则同一场会并排出现两枚芯片。
   * @param {string|undefined} tabId
   */
  async function trackContestTab(tabId) {
    if (!tabId) return
    await nextTick()
    const fullName = title.value.trim()
    const name = compactContestName(fullName)
    const byId = contestGroupId && groupOfId(contestGroupId)
    const byName = byId ? null : name && findGroupByName(name)
    // 只给「老版本用全名建的组」开这一条：按名字对上就顺手改名，别再改用户自己起的组名
    const legacy = byId || byName ? null : fullName && findGroupByName(fullName)
    const existing = byId || byName || legacy || null
    if (existing) {
      contestGroupId = existing.id
      if (legacy && name) renameGroup(existing.id, name)
      addTabsToGroup([tabId], existing.id)
      return
    }
    contestGroupId = groupTabs([tabId], name ? { name } : {})
  }

  /**
   * 把一道题落进工作区。
   *
   * 难度按 CF 的 rating 交给 importProblem，与抽题面板一致（它会写进元数据）；比赛导入的
   * 落盘目录是 `/<年月>/<OJ>/<比赛名>/`，由 `contestName` 传入。
   * **单题导入仍然抢焦点**（importProblem 末尾 openFile）：用户点的是这一道，跳过去是预期行为。
   * 批量那条路（封存中的「抓样例前先落题」与 2026-10-30 的「自动开始」）走 `quiet: true`，见 scrapeSamples
   * 与 importAllAndOpenFirst —— 前者别把用户的页签连翻七八次，后者要把焦点留给「第一题」。
   *
   * ⚠️ `toRaw(problem.task)` 不能省：`problems` 是 ref，`problem.task` 与其嵌套字段都是 reactive
   * Proxy，IndexedDB 的 structured clone 拒绝它（DataCloneError），落库会整批失败 ——
   * 界面上看着导入成功、刷新后题目没了。抽题面板同款，见 HANDOFF 坑 62。
   *
   * @returns {Promise<object|null>} 落进工作区的节点；没轮到（在途 / 已导入过）或失败时为 null。
   *   「自动开始」要拿它打开第一题，其余调用方不消费返回值。
   */
  async function importOne(problem, { quiet = false } = {}) {
    const target = problem?.task?.url
    if (!target || importingUrl.value || importedUrls.value.has(target)) return null

    importingUrl.value = target
    try {
      const { node } = await importProblem(toRaw(problem.task), {
        difficulty: problem.rating == null ? '' : String(problem.rating),
        contestName: title.value,
        quiet,
      })
      importedUrls.value = new Set(importedUrls.value).add(target)
      await trackContestTab(node?.id)
      return node
    } catch (failure) {
      error.value = {
        key: 'cf.contest.errors.importFailed',
        params: { detail: failure?.message || '' },
      }
      return null
    } finally {
      importingUrl.value = ''
    }
  }

  /** 全部导入：串行 await，与抽题面板同一理由（并发落库会让树抖好几下） */
  async function importAll() {
    if (importingAll.value || importingUrl.value || vpLocked.value) return

    importingAll.value = true
    try {
      for (const problem of problems.value) {
        if (importedUrls.value.has(problem.task.url)) continue
        await importOne(problem)
        if (error.value?.key === 'cf.contest.errors.importFailed') break
      }
    } finally {
      importingAll.value = false
    }
  }

  /**
   * 自动开始的导入腿（2026-10-30）：整场导入但**不抢焦点**（全走 quiet），落定后
   * 打开**第一道题** —— 通知那颗「开始比赛」承诺的就是「点完直接落进 A 题」。
   *
   * 【为什么不用 importProblem 的返回值串第一题】已导入过的题在循环里被 importOne 跳过
   * （返回 null），第一题可能恰好是它。收尾时按第一题的 url 现查一次（findProblemByUrl
   * 按 url 并题的同一套归一化），拿到谁是谁 —— 就算整场早就导过，这条路也能把 A 题摆出来。
   *
   * 【deactivateViews + openFile】与 importProblem 非 quiet 的收尾同一写法：此刻盖着
   * 编辑器的是 Codeforces 视图（正是「开始比赛」切过去的），先显式让开；openFile 负责
   * 建 model、开页签、展开祖先目录。
   */
  async function importAllAndOpenFirst() {
    if (importingAll.value || importingUrl.value || vpLocked.value) return

    importingAll.value = true
    try {
      for (const problem of problems.value) {
        await importOne(problem, { quiet: true })
        if (error.value?.key === 'cf.contest.errors.importFailed') return
      }

      const first = problems.value[0]
      const found = first ? await findProblemByUrl(first.task?.url) : null
      if (!found) return
      deactivateViews()
      await openFile(found.id, found)
    } finally {
      importingAll.value = false
    }
  }

  /** 导入按钮该显示哪种状态：文案在模板里 t(`cf.picker.result.${importState}`) */
  function importState(problem) {
    const target = problem?.task?.url
    if (importedUrls.value.has(target)) return 'imported'
    if (importingUrl.value === target) return 'importing'
    return 'import'
  }

  /**
   * 点题目行的空白处：打开这道题在工作区里的那个文件（2026-11-10 用户口径，与抽题面板同一套）。
   *
   * 只有**这一场里导过**的行才响应 —— 判据与那颗按钮上的「已导入」是同一个（`importState`），
   * 看得见的状态与能不能点不会打架。题名那颗链接仍去 Codeforces 网页。
   */
  async function openImported(problem) {
    if (importState(problem) !== 'imported') return
    await openProblemByUrl(problem?.task?.url)
  }

  const allImported = computed(
    () =>
      problems.value.length > 0 &&
      problems.value.every((problem) => importState(problem) === 'imported'),
  )

  // ------------------------------------------------------------ 组件卸载的联动

  /**
   * cfReady 翻回 false（设置 › 应用 › 组件里卸载，或浏览器清了 IndexedDB 被
   * reconcileCfRuntime 正回来）时，Codeforces 页签必须跟着关 —— 否则会留下一张点不开
   * （侧栏按钮已经没了）的空页签。与 useCfPicker 对同一个合页签那条 watch 同一条纪律；
   * 这里顺带把本场的状态清干净，重装后再打开是一张干净的面板。
   * `specText` 是表单偏好、不属本机资产，留着不动（与抽题表单同口径）。
   *
   * 【代次计数器也要动】在途的两条取数回来时按代次认领，不清的话卸载瞬间在途的
   * 那一发会把刚清空的 contest / problems 原样填回来；但清了代次，`finally` 里
   * 「只有最后一次认领才复位」的 loading 也永远不会归零，所以要一并手动打回 false。
   */
  watch(cfReady, (ready) => {
    if (ready) return
    closeCodeforcesTab()
    stopTimer()
    clearPostpone()
    contestSeq += 1
    problemsSeq += 1
    loadingContest.value = false
    loadingProblems.value = false
    error.value = null
    contest.value = null
    fetchedAt.value = 0
    problems.value = []
    problemsNote.value = null
    resetResults()
  })

  // ------------------------------------------------------------ 抓样例（浏览器扩展）
  //
  // 【整段封存中，2026-11-13】用户口径：先去掉「抓整场样例」这个功能，需要时再加回来。
  // 界面上的入口（比赛页题目标签那颗「抓样例」按钮、它旁边那行进度小字）已经撤掉，
  // 但**实现原样留在这里** —— 它是一条能自足的链路（先安静落题、再请扩展读整场、
  // 最后按工作区回查「真有几道题拿到了样例」），接回去只要在 CfContestPanel 那颗
  // 「全部导入」前面补回一颗按钮（`v-if="scrapeAvailable"` / `@click="scrapeSamples"`），
  // 连同一行 `<div v-if="scrapeNote">` 的小字。下面五个东西现在都没有外部调用方。
  //
  // 为什么不留成一个能被「全部导入」顺手调用的隐式行为：用户 2026-11-13 先要求合并、随即
  // 改口封存 —— 结论是「一场七八道题的样例抓取要扩展载入整个题目页、十几秒起步」，它不该
  // 藏在一个叫「全部导入」的按钮后面。

  /**
   * 扩展报回来的失败码 → 界面文案。认不出的一律落 `scrapeFailed` 并把码当 detail 显示 ——
   * 与其猜一个新码的含义，不如把原样递出去（这些码是给人看的：busy / load-failed / …）。
   */
  const SCRAPE_ERROR_KEYS = {
    unsupported: 'cf.contest.errors.scrapeUnsupported',
    busy: 'cf.contest.errors.scrapeBusy',
    timeout: 'cf.contest.errors.scrapeTimeout',
  }

  /** 扩展有没有 `contest-batch` 能力。封存期间没有调用方；接回按钮时它就是这个 `v-if` */
  const scrapeAvailable = canScrapeContest

  const scraping = ref(false)
  /** 上一次真正抓到几道（0 = 没抓过；抓到 0 道也算失败，走 scrapeError） */
  const scrapedCount = ref(0)
  const scrapeError = ref(null)

  /** 换了一场就作废在途的那一趟：晚到的结果不能记到新一场头上 */
  let scrapeSeq = 0

  function resetScrape() {
    scrapeSeq += 1
    scraping.value = false
    scrapedCount.value = 0
    scrapeError.value = null
  }

  /** 这一道题此刻在工作区里有几组样例（认题走 problemUrlKey 归一化，见 workspaceStore） */
  function sampleCountOf(url) {
    const node = findProblemByUrl(url)
    return Array.isArray(node?.config?.tests) ? node.config.tests.length : 0
  }

  /**
   * 等样例真正落进工作区，返回**已经带上样例的题数**。
   *
   * 【为什么不直接用扩展报的 count】那是「投递了几条」，不是「落到了几道题上」。两者在
   * 2026-10-26 之前差得很远：扩展把整场页的地址当成每道题的 url 投回来，站点按 url 认题，
   * 于是七八条投递全并进同一个文件，而该收样例的那几道题一道都没拿到 —— 界面却报
   * 「已抓取 7 道」。判据换成「工作区里真有几道题拿到了样例」，谎就撒不出来了。
   *
   * 【为什么要等一会儿】扩展那边最后一次投递完 300ms 就报 done，而站点每道题都要走一次
   * VFS 写入。多数时候早就写完了，慢一档就会少算一两道。所以等到「连续两轮数字不再涨」
   * 或超时，两个出口都返回此刻的真实值。
   *
   * @param {string[]} urls 本场每道题的地址
   * @param {number} [budgetMs]
   */
  async function waitForSamples(urls, budgetMs = 4000) {
    const deadline = Date.now() + budgetMs
    let previous = -1

    for (;;) {
      const count = urls.filter((url) => sampleCountOf(url) > 0).length
      if (count === urls.length || count === previous || Date.now() >= deadline) return count
      previous = count
      await new Promise((resolve) => setTimeout(resolve, 300))
    }
  }

  /**
   * 把整场样例抓下来。
   *
   * ⚠️ 封存中（2026-11-13）：界面已无调用方，见本节开头的说明。恢复时先补回那颗按钮。
   *
   * 【顺序是「先落题、再抓样例」】样例得有地方挂：没导入过的题先按元数据安静落盘
   * （`quiet`，不抢焦点），再请扩展读整场。扩展抓完仍然逐题 cp-task 回来，
   * 由 useCompanionImport 按 url 并进这些题里 —— 与用户点图标的走法一字不差。
   *
   * 【失败不写进 error】`error` 是状态行那一槽，被比赛级故障（链接不合法、取数失败）占着；
   * 抓样例失败只影响这一次动作，说在旁边一行小字上就够了。
   */
  async function scrapeSamples() {
    const current = spec.value
    if (!current || scraping.value || vpLocked.value) return

    const seq = ++scrapeSeq
    scraping.value = true
    scrapedCount.value = 0
    scrapeError.value = null

    // 本场的题目地址先钉住：抓完要拿它逐道回查「样例到底落上了没有」
    const targets = problems.value.map((problem) => problem.task.url)

    try {
      for (const problem of problems.value) {
        if (importedUrls.value.has(problem.task.url)) continue
        // toRaw 的理由见 importOne 上面那段（reactive Proxy 进不了 IndexedDB）
        await importProblem(toRaw(problem.task), {
          difficulty: problem.rating == null ? '' : String(problem.rating),
          contestName: title.value,
          quiet: true,
        })
        if (seq !== scrapeSeq) return
        importedUrls.value = new Set(importedUrls.value).add(problem.task.url)
      }

      const result = await requestContestScrape(contestProblemsUrl(current))
      if (seq !== scrapeSeq) return

      const landed = await waitForSamples(targets)
      if (seq !== scrapeSeq) return

      scrapedCount.value = landed
      // 扩展说成了、可工作区一道都没拿到 —— 这才是「抓样例没跑对」的样子，得说清
      if (landed === 0) {
        scrapeError.value = result.ok
          ? { key: 'cf.contest.errors.scrapeEmpty' }
          : SCRAPE_ERROR_KEYS[result.reason]
            ? { key: SCRAPE_ERROR_KEYS[result.reason] }
            : { key: 'cf.contest.errors.scrapeFailed', params: { detail: result.reason || '' } }
      }
    } catch (failure) {
      if (seq === scrapeSeq) {
        scrapeError.value = {
          key: 'cf.contest.errors.scrapeFailed',
          params: { detail: failure?.message || '' },
        }
      }
    } finally {
      if (seq === scrapeSeq) scraping.value = false
    }
  }

  /** 抓样例那一行小字：优先说失败，其次说进度，最后说结果 */
  const scrapeNote = computed(() => {
    if (scrapeError.value) return t(scrapeError.value.key, scrapeError.value.params)
    if (scraping.value) return t('cf.contest.status.scraping')
    if (scrapedCount.value > 0) return t('cf.contest.status.scraped', { n: scrapedCount.value })
    return ''
  })

  return {
    // 输入
    specText,
    spec,
    // 取数
    load,
    busy,
    loadingContest,
    loadingProblems,
    error,
    // 结果
    contest,
    problems,
    problemsNote,
    url,
    title,
    // 倒计时
    status,
    statusText,
    remainMs,
    /** 面板显隐（v-show）：失步轮询据此暂停 / 补探，见 setVisible */
    setVisible,
    // 虚拟参赛（VP）
    vp,
    virtual,
    vpLocked,
    vpStartText,
    // 导入
    importOne,
    importAll,
    importAllAndOpenFirst,
    importState,
    openImported,
    importedUrls,
    importingAll,
    allImported,
    // 抓样例（封存中：下面五项目前没有外部调用方，见本节开头）
    scrapeAvailable,
    scraping,
    scrapedCount,
    scrapeNote,
    scrapeSamples,
  }
}
