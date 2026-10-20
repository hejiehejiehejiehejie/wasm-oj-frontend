/**
 * useCfContest —— 比赛：贴链接 → 倒计时 → 题目列表 → 导入工作区 → 抓样例。
 *
 * 【它不负责界面】与 useCfPicker 同一分工：页签开关归 editorViews，这里只管数据与过程。
 * 界面是独立组件 CfContestPanel（编辑区里的第三个合成视图 cfContest，2026-10-19 从
 * 抽题面板里拆出来单飞），**只在那一个组件的 setup 里调用本组合式函数** ——
 * 与 useCfPicker 只归 CfPickerPanel 是同一条纪律。
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
 * 会问一句要不要抓（见 useCompanionBridge.js 的自动抓取样例）；② 主动 —— 面板上那颗
 * 「抓样例」把整场交给扩展读一遍（P2，要扩展支持 `contest-batch` 能力）。
 * 两条路最后都落到同一条 cp-task 投递上，由 importProblem 按 url 并进已有的题里。
 */
import { computed, onBeforeUnmount, ref, toRaw, watch } from 'vue'

import { t } from '../i18n/index.js'
import {
  contestProblemsUrl,
  contestRemainingMs,
  contestStatus,
  contestUrl,
  formatDuration,
  parseContestSpec,
  sortByIndex,
} from '../cf/contest.js'
import { cfContest, cfContestProblems } from '../services/cfClient.js'
import { cfReady } from '../services/cfRuntime.js'
import { closeCfContestTab } from '../services/editorViews.js'
import { importProblem } from '../services/vfs/problemImport.js'
import { canScrapeContest, requestContestScrape } from './useCompanionBridge.js'
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

  /** 每秒推进一次。只作为 computed 的依赖，不参与任何累减 */
  const now = ref(Date.now())
  const remainMs = computed(() => contestRemainingMs(contest.value, fetchedAt.value, now.value))
  const status = computed(() => contestStatus(contest.value, remainMs.value))

  /** 比赛在网页上的地址（元数据没到也能拼，group 会带上 groupId） */
  const url = computed(() => contestUrl(spec.value))

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

  /** 换了一场：把上一场的导入账与抓取状态清掉，否则新一场的题会带着旧的对勾与旧的结果 */
  function resetResults() {
    importedUrls.value = new Set()
    importingUrl.value = ''
    importingAll.value = false
    resetScrape()
  }

  /**
   * 把一道题落进工作区。
   *
   * 难度按 CF 的 rating 交给 importProblem，与抽题面板一致（它会据此分目录并写进元数据）。
   * **单题导入仍然抢焦点**（importProblem 末尾 openFile）：用户点的是这一道，跳过去是预期行为。
   * 批量那条路（抓样例前的「先落题」）走 `quiet: true`，见 scrapeSamples。
   *
   * ⚠️ `toRaw(problem.task)` 不能省：`problems` 是 ref，`problem.task` 与其嵌套字段都是 reactive
   * Proxy，IndexedDB 的 structured clone 拒绝它（DataCloneError），落库会整批失败 ——
   * 界面上看着导入成功、刷新后题目没了。抽题面板同款，见 HANDOFF 坑 62。
   */
  async function importOne(problem) {
    const target = problem?.task?.url
    if (!target || importingUrl.value || importedUrls.value.has(target)) return

    importingUrl.value = target
    try {
      await importProblem(toRaw(problem.task), {
        difficulty: problem.rating == null ? '' : String(problem.rating),
      })
      importedUrls.value = new Set(importedUrls.value).add(target)
    } catch (failure) {
      error.value = {
        key: 'cf.contest.errors.importFailed',
        params: { detail: failure?.message || '' },
      }
    } finally {
      importingUrl.value = ''
    }
  }

  /** 全部导入：串行 await，与抽题面板同一理由（并发落库会让树抖好几下） */
  async function importAll() {
    if (importingAll.value || importingUrl.value) return

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

  /** 导入按钮该显示哪种状态：文案在模板里 t(`cf.picker.result.${importState}`) */
  function importState(problem) {
    const target = problem?.task?.url
    if (importedUrls.value.has(target)) return 'imported'
    if (importingUrl.value === target) return 'importing'
    return 'import'
  }

  const allImported = computed(
    () =>
      problems.value.length > 0 &&
      problems.value.every((problem) => importState(problem) === 'imported'),
  )

  // ------------------------------------------------------------ 组件卸载的联动

  /**
   * cfReady 翻回 false（设置 › 应用 › 组件里卸载，或浏览器清了 IndexedDB 被
   * reconcileCfRuntime 正回来）时，比赛页签必须跟着关 —— 否则会留下一张点不开
   * （侧栏按钮已经没了）的空页签。与 useCfPicker 对抽题页签那条 watch 同一条纪律；
   * 这里顺带把本场的状态清干净，重装后再打开是一张干净的面板。
   * `specText` 是表单偏好、不属本机资产，留着不动（与抽题表单同口径）。
   *
   * 【代次计数器也要动】在途的两条取数回来时按代次认领，不清的话卸载瞬间在途的
   * 那一发会把刚清空的 contest / problems 原样填回来；但清了代次，`finally` 里
   * 「只有最后一次认领才复位」的 loading 也永远不会归零，所以要一并手动打回 false。
   */
  watch(cfReady, (ready) => {
    if (ready) return
    closeCfContestTab()
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

  /**
   * 扩展报回来的失败码 → 界面文案。认不出的一律落 `scrapeFailed` 并把码当 detail 显示 ——
   * 与其猜一个新码的含义，不如把原样递出去（这些码是给人看的：busy / load-failed / …）。
   */
  const SCRAPE_ERROR_KEYS = {
    unsupported: 'cf.contest.errors.scrapeUnsupported',
    busy: 'cf.contest.errors.scrapeBusy',
    timeout: 'cf.contest.errors.scrapeTimeout',
  }

  /** 扩展有没有 `contest-batch` 能力。没有就不显示那颗按钮（老扩展下界面等于 P1） */
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

  /**
   * 把整场样例抓下来。
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
    if (!current || scraping.value) return

    const seq = ++scrapeSeq
    scraping.value = true
    scrapedCount.value = 0
    scrapeError.value = null

    try {
      for (const problem of problems.value) {
        if (importedUrls.value.has(problem.task.url)) continue
        // toRaw 的理由见 importOne 上面那段（reactive Proxy 进不了 IndexedDB）
        await importProblem(toRaw(problem.task), {
          difficulty: problem.rating == null ? '' : String(problem.rating),
          quiet: true,
        })
        if (seq !== scrapeSeq) return
        importedUrls.value = new Set(importedUrls.value).add(problem.task.url)
      }

      const result = await requestContestScrape(contestProblemsUrl(current))
      if (seq !== scrapeSeq) return

      if (result.ok) {
        scrapedCount.value = result.count
      } else {
        scrapeError.value = SCRAPE_ERROR_KEYS[result.reason]
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
    // 导入
    importOne,
    importAll,
    importState,
    importedUrls,
    importingAll,
    allImported,
    // 抓样例
    scrapeAvailable,
    scraping,
    scrapedCount,
    scrapeNote,
    scrapeSamples,
  }
}
