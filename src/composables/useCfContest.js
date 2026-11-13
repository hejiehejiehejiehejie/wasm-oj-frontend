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
 * `contestRemainingMs` 用「取数时刻 + relativeTimeSeconds」现算 —— 标签页被冻结再回来，
 * 数字立刻是对的，不需要补账。同一条纪律在 cloudSession 的取码倒计时上已经用过。
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
  contestProblemsUrl,
  contestRemainingMs,
  contestStatus,
  contestUrl,
  formatDuration,
  formatStartTime,
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
        startTimer()
        return
      }

      stopTimer()
      // next === 'unknown' 说明 `contest` 被清空了（换一场 / 取数失败），不是时间推着翻的面：
      // 这条路上 load() 紧接着自己就要发这两条请求，补刷只会多打一次
      // —— 题目那条要拉一次整场榜单（裸参 2–6MB），不能白付。
      if (previous === 'upcoming' && next !== 'unknown') {
        void loadContest({ silent: true })
        void loadProblems()
      }
    },
    { immediate: true },
  )

  /** 页面从后台回到前台：立刻校正一次。后台期间定时器被节流，`now` 停在老值上 */
  function onVisibilityChange() {
    if (document.visibilityState === 'visible') now.value = Date.now()
  }
  document.addEventListener('visibilitychange', onVisibilityChange)

  onBeforeUnmount(() => {
    stopTimer()
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

  /** 元数据。silent 时不动错误槽（给「到点自动刷新」用，不该把已有错误覆盖掉） */
  async function loadContest({ silent = false } = {}) {
    const current = spec.value
    if (!current) return

    const seq = ++contestSeq
    loadingContest.value = true
    if (!silent) error.value = null
    try {
      const response = await cfContest(current)
      if (seq !== contestSeq) return

      contest.value = response.contest ?? null
      fetchedAt.value = response.fetchedAt || Date.now()
      // 立刻对一次表：从缓存拿到的 relativeTimeSeconds 可能是 40 分钟前的，
      // 不校正的话第一屏会先显示一个偏大的数再跳回来
      now.value = Date.now()

      // group 的比赛本来就不在 contest.list 里，拿不到元数据不算错
      if (!response.contest && current.kind !== 'group' && !silent) {
        error.value = { key: 'cf.contest.errors.notFound' }
      }
    } catch (failure) {
      if (seq === contestSeq && !silent) error.value = toErrorValue(failure)
    } finally {
      if (seq === contestSeq) loadingContest.value = false
    }
  }

  /** 题目列表。慢的那一条，不阻塞倒计时 */
  async function loadProblems() {
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
    loadingProblems.value = true
    try {
      const response = await cfContestProblems(current)
      if (seq !== problemsSeq) return

      problems.value = sortByIndex(response.problems || [])
      // 拿到东西就把空态说明撤掉；空列表则留一句 —— 但**不进 error**，它不该抢占状态行
      if (problems.value.length) {
        problemsNote.value = null
      } else {
        // pending = 还没开赛，题目本来就还没出现。这与「开赛了但一道题都没有」是两种境况，
        // 说错一句用户会去查自己的网络
        problemsNote.value = {
          key: response.pending ? 'cf.contest.errors.notStarted' : 'cf.contest.errors.noProblems',
        }
      }
    } catch (failure) {
      if (seq !== problemsSeq) return
      problems.value = []
      error.value = toErrorValue(failure)
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

    resetResults()
    problems.value = []
    problemsNote.value = null
    contest.value = null
    error.value = null

    await loadContest()
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
