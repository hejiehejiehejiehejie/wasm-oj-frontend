/**
 * useCfPicker —— 抽题页签「一次抽取」的全过程。
 *
 * 【页签开关不在这里】抽题是编辑区里的一个合成页签，与设置同形态，开关状态统一归
 * src/services/editorViews.js 管（侧栏那颗 Codeforces 按钮与页签栏读的是同一份）。
 * 这里只管抽题表单、进度与结果。
 *
 * 【表单为什么是 usePersistentRef 逐字段存】「下次打开还记得上次的筛选条件」是参考实现的
 * 明确定位，而本项目已经有现成的持久化 ref（挂载时读、改动即写）。逐字段存还有个好处：
 * 刷新页面 / 换会话时**天然**回填上次的值，不需要额外写 restore/save 两套代码。
 *
 * 【抽取为什么全交给 Worker】题库一万多道题，筛选 + 排序放主线程会卡 Monaco。
 * 这里只负责：把表单翻译成 filters、把进度/错误翻成界面状态、把结果捧着（不落盘 ——
 * 落盘是第 6 步「导入工作区」的事，用户不看中就不该动工作区），抽到了再发一条全局通知
 * （**抽题期间页签可能已经被切走**，见 run() 里那段注释）。
 *
 * 【样例从哪来】Codeforces 的题库接口不返回样例（题目页也没有 CORS 头，网页自己抓不到），
 * 所以抽来的题一律是「先落盘、样例后补」：用户之后打开这道题的页面时，由浏览器扩展自动抓
 * 一遍补进同一个文件。要不要抓、什么时候抓都由扩展与工作区当场对话决定，这里不必记账
 * （见 useCompanionBridge.js 里那段「自动抓取样例」）。
 *
 * 【导入后的页签归组】（2026-10-20 用户口径）一批抽到的题打开成页签后归进**同一个标签页组**，
 * 条带上一眼就看出「这些是这次抽的」；而一批超过 5 道（BULK_TAB_LIMIT）就只落盘、不开页签，
 * 免得十张页签把条带挤满还把抽题面板顶掉。建组只走 tabGroups 的公开入口，见 trackBatchTab。
 *
 * 【错误为什么存 key 不存字符串】i18n 纪律：文案在 computed / 模板里 t()，
 * 数据层只留 key 与参数，否则切语言时这条错误会停在旧语言上。
 */

import { computed, nextTick, ref, toRaw, watch } from 'vue'

import { t } from '../i18n/index.js'
import { COUNT_MAX, COUNT_MIN, normalizeHandles, problemKey } from '../cf/pick.js'
import { cfHandle } from '../cf/myHandle.js'
import { cfCheckHandles, cfPick, onCfProgress } from '../services/cfClient.js'
import { cfReady } from '../services/cfRuntime.js'
import { closeCodeforcesTab } from '../services/editorViews.js'
import { notify } from '../services/notifications.js'
import { addTabsToGroup, groupOfId, groupTabs } from '../services/tabGroups.js'
import { importProblem } from '../services/vfs/problemImport.js'
import { usePersistentRef } from './usePersistentRef.js'

/**
 * 一批抽到的题超过这个数就**只落盘、不开页签**（2026-10-20 用户口径）：
 * 十道题一起弹出来会把条带挤满、还会把用户正看着的面板顶掉，收益为零。
 * 判据是**抽到的数量**（results.length），不是「这次导入了几道」—— 后者会随导入进度变化。
 */
const BULK_TAB_LIMIT = 5

/** cfReady 翻回 false（例如浏览器清了 IndexedDB，reconcileCfRuntime 把标记正回来）时页签必须跟着关 —— 否则会留下一张点不开（侧栏按钮已经没了）的空页签 */
watch(cfReady, (ready) => {
  if (!ready) closeCodeforcesTab()
})

/** 偏好键。统一 `cp.cf.` 前缀，与设置页的 `cp.cfPicker.ready` 同族。
 *  账号（`cp.cf.handle`）不在这里 —— 它由 cf/myHandle.js 的模块级 ref 统一持有，
 *  排行榜 / 提交记录的「我」读的是同一份。 */
const KEY = {
  ratingMin: 'cp.cf.ratingMin',
  ratingMax: 'cp.cf.ratingMax',
  tags: 'cp.cf.tags',
  count: 'cp.cf.count',
  preferNew: 'cp.cf.preferNew',
  excludeSolved: 'cp.cf.excludeSolved',
}

/**
 * 账号列表的「签名」：用来判断一次校验回来时输入有没有又被改过。
 * 比原始字符串（大小写、分割符、空格都要一致）更稳 —— 同一个账号列表的两种写法算同一次。
 */
function handleSignature(raw) {
  return normalizeHandles(raw)
    .map((handle) => handle.toLowerCase())
    .sort()
    .join(',')
}

/** `''` / `'   '` / 非数字 → null；其余取整数值 */
function toRating(raw) {
  const text = String(raw ?? '').trim()
  if (!text) return null
  const value = Number(text)
  return Number.isFinite(value) ? Math.round(value) : null
}

/**
 * 抽题页签用的状态。**只在 CfPickerPanel 的 setup 里调一次** ——
 * 它内部用 usePersistentRef，那是个会在组件挂载时播种的 ref。
 */
export function useCfPicker() {
  const ratingMin = usePersistentRef(KEY.ratingMin, '')
  const ratingMax = usePersistentRef(KEY.ratingMax, '')
  const tags = usePersistentRef(KEY.tags, '')
  const count = usePersistentRef(KEY.count, 1)
  const preferNew = usePersistentRef(KEY.preferNew, true)
  const excludeSolved = usePersistentRef(KEY.excludeSolved, false)
  // 账号是跨面板共用的（排行榜的「跳到我」、提交记录的「只看我」），见 cf/myHandle.js
  const handle = cfHandle

  /** 抽取中 */
  const picking = ref(false)
  /** Worker 推来的阶段码（problemset / solved），文案在这里翻 */
  const stage = ref('')
  /** 出错：`{ key, params }`，key 用来 t()，params 是插值（可能没有） */
  const error = ref(null)
  /** 抽中的题目（原始字段 + 现成的 task），展示用 */
  const results = ref([])

  /** 已导入工作区的题目 url。同一道题重复导入其实是无害的（按 url 认题、正文一个字不动），
   *  但按钮该在导过之后停用 —— 否则用户不知道点没点上 */
  const importedUrls = ref(new Set())
  /** 正在导入的题目 url，'' 即空闲 */
  const importingUrl = ref('')
  /** 正在「全部导入」 */
  const importingAll = ref(false)

  /**
   * 本批抽到的题落在**同一个标签页组**里（2026-10-20 用户口径：「抽到的题直接生成一个
   * 标签页组，打开的页签放进去」）。这里只记组 id：组的建/收编全交给 tabGroups 的公开入口
   * （连续性、空组清理都在那边收口，见那个文件头）。
   *
   * 换一批（run）就重置 —— 每批一个组。组一旦建出来就归条带管，用户之后再往里拖页签、
   * 关掉成员，都与这里无关（`groupOfId` 查不到时会另建一个新的，见 trackBatchTab）。
   * 不放进 `tabGroups` 持久化的理由：它只是「本批的容器」这一层临时记忆，刷新后没有批次。
   */
  let batchGroupId = null

  const handleState = ref('') // '' | 'checking' | 'ok' | 'bad'
  const handleReason = ref('') // bad 时：'not_found' | 'network'
  /** bad 且是 not_found 时具体是哪些账号 —— 界面上要点名，用户才知道改哪个 */
  const handleBad = ref([])

  const stageText = computed(() => {
    if (!picking.value) return ''
    return stage.value ? t(`cf.module.stage.${stage.value}`) : t('cf.picker.picking')
  })

  const handleText = computed(() => {
    if (handleState.value === 'checking') return t('cf.picker.handle.checking')
    if (handleState.value === 'ok') return t('cf.picker.handle.ok')
    if (handleState.value === 'bad') {
      if (handleReason.value === 'not_found') {
        return t('cf.picker.handle.notFound', { handles: handleBad.value.join(', ') })
      }
      return t('cf.picker.handle.network')
    }
    return ''
  })

  /** 数量夹取：失焦时把 `99` / `0` / `abc` 收回到合法区间 */
  function clampCount() {
    const value = Math.round(Number(count.value))
    count.value = Number.isFinite(value)
      ? Math.min(COUNT_MAX, Math.max(COUNT_MIN, value))
      : COUNT_MIN
  }

  function applyPreset(preset) {
    ratingMin.value = String(preset.min)
    ratingMax.value = String(preset.max)
  }

  /** 清掉校验结论（输入被清空时） */
  function resetHandleState() {
    handleState.value = ''
    handleReason.value = ''
    handleBad.value = []
  }

  /**
   * 校验账号（支持逗号分隔的多个）。**竞态处理**：输入是防抖触发的，慢的那次可能后回来，
   * 所以回来时先看账号列表有没有又被改过 —— 改过就只回结论、不动界面。
   * @param {boolean} [silent] 静默校验（抽取前顺手确认），不动界面上的「校验中」
   * @returns {Promise<boolean>} 全部存在（或连不上、暂时无从判断）才算 true
   */
  async function checkHandle(silent = false) {
    const current = normalizeHandles(handle.value)
    if (!current.length) {
      resetHandleState()
      return true
    }
    if (!silent) handleState.value = 'checking'

    const { results } = await cfCheckHandles(current)
    const missing = results
      .filter((item) => item.reason === 'not_found')
      .map((item) => item.handle)
    const offline = results.some((item) => item.reason === 'network')

    if (handleSignature(handle.value) !== handleSignature(current)) return missing.length === 0

    // 连不上 CF 不该拦着用户：判「未知」而不是「不存在」，原样放行，由抽取那一步再兜底。
    // 但只要有一个账号是**明确不存在**的，就照实报出来 —— 它会让「排除已通过的题」悄悄失效
    if (offline && !missing.length) {
      handleState.value = silent ? '' : 'bad'
      handleReason.value = 'network'
      handleBad.value = []
      return true
    }

    handleState.value = missing.length ? 'bad' : 'ok'
    handleReason.value = missing.length ? 'not_found' : ''
    handleBad.value = missing
    return missing.length === 0
  }

  /** 抽取。结果只放在 results 里，不落盘。 */
  async function run() {
    if (picking.value) return
    // 「换一批」＝再抽一次，所以先把**当前这批**记下来，交给 Worker 剔掉。
    // 不这么做的话，preferNew 的加权（random()^4）会把最近的题反复端上来 —— 按下换一批，
    // 屏幕上几乎还是那几道。只排上一批、不累积历史：排除集合才不会越滚越大把题库榨干
    const previousKeys = results.value.map((problem) => problemKey(problem))
    error.value = null
    results.value = []
    // 新的一批：上一个批次的组就留在条带上当普通组，新批重新建
    batchGroupId = null
    resetHandleState()

    const min = toRating(ratingMin.value)
    const max = toRating(ratingMax.value)
    if (min != null && max != null && min > max) {
      error.value = { key: 'cf.picker.errors.ratingOrder' }
      return
    }

    // 「排除已通过的题」需要账号：可以是逗号分隔的多个，取它们已 AC 的并集来排除
    const needsHandle = excludeSolved.value
    const handles = normalizeHandles(handle.value)
    if (needsHandle && !handles.length) {
      error.value = { key: 'cf.picker.errors.handleRequired' }
      return
    }

    picking.value = true
    stage.value = ''
    const unsubscribe = onCfProgress((next) => {
      stage.value = next
    })

    try {
      // 账号必须在这里拦一道：拼错的账号会让 user.status 拿不到数据，
      // 「排除已通过的题」于是**悄悄失效**——比报错更糟。命中 1h 缓存时这一步是瞬时的。
      if (needsHandle && !(await checkHandle(true))) {
        error.value = {
          key: 'cf.picker.handle.notFound',
          params: { handles: (handleBad.value.length ? handleBad.value : handles).join(', ') },
        }
        return
      }

      const response = await cfPick({
        ratingMin: min,
        ratingMax: max,
        // 原样交给 Worker —— normalizeTags / normalizeHandles 都在那边，主线程不必知道怎么归一化
        tags: tags.value,
        count: count.value,
        preferNew: preferNew.value,
        excludeSolved: excludeSolved.value,
        handles,
        excludeKeys: previousKeys,
      })
      results.value = response.problems || []
      // 抽到就发一条全局通知。抽题是**非阻塞**的：题库首次拉取要下 2MB、勾了「排除已通过的题」
      // 还要多走一趟 user.status，用户多半会切回文件页签等 —— 那时抽题页签被 v-show 藏起来，
      // 结果只落在看不见的地方。通知就是「抽好了」的那句话（正文复用结果区抬头那句
      // `result.count` ——「抽中 N 道题」是同一件事，写两遍必然漂移）。
      if (results.value.length) {
        notify({
          type: 'success',
          title: t('cf.picker.notif.title'),
          message: t('cf.picker.result.count', { n: results.value.length }),
          duration: 5000,
        })
      }
    } catch (failure) {
      if (failure?.code === 'NO_MATCH') {
        error.value = { key: 'cf.picker.errors.noMatch' }
      } else if (failure?.code === 'DISPOSED' || failure?.code === 'WORKER_ERROR') {
        error.value = { key: 'cf.picker.errors.worker' }
      } else {
        error.value = {
          key: 'cf.picker.errors.fetch',
          params: { detail: failure?.message || '' },
        }
      }
    } finally {
      unsubscribe()
      picking.value = false
      stage.value = ''
    }
  }

  /**
   * 把抽中的一道题落进工作区，并把编辑器切过去（importProblem 自己会 openFile）。
   *
   * 难度：CF 的 rating 是**确定的数字**，所以作为 options.difficulty 交给 importProblem 一步到位
   * —— 它据此决定难度目录（`/<年月>/Codeforces/1600/`）并把难度写进元数据，用户不必再手填。
   * 扩展抓题那条路不带这个参数，照旧落「未分类」。
   *
   * 认题靠 url，重复导入同一道题是幂等的：正文一个字不动，只刷新样例与元数据。
   * 已经落过盘的题不会被搬到新目录（搬动 = 丢题解），难度也以用户手填的为准。
   *
   * 【⚠️ 必须 toRaw 再交给 importProblem】`results` 是 ref，元素与它底下每一层字段都是
   * reactive Proxy。`importProblem` 的 buildConfig 只做浅展开，嵌套值（`tests` / `languages` …）
   * 会原样保留 Proxy，而 IndexedDB 的 `put()` 走 structured clone、**拒绝 Proxy**（DataCloneError）。
   * toRaw 取回原始对象，它底下本来就是原始对象 —— 落库层只该看见纯数据。
   * 2026-10-20 踩过：导入看着成功（内存树、页签都在），刷新后题目整个没了，库里只剩三个空目录
   * （异常发生在入队中途，见 HANDOFF 坑 62）。
   * @param {{ task: Record<string, any>, rating: number|null }} problem 抽取结果里的一项
   * @param {{ quiet?: boolean }} [options] `quiet` 只落盘、不开页签也不建组
   *   （「全部导入」在一批超过 BULK_TAB_LIMIT 道时走它）
   */
  async function importOne(problem, options = {}) {
    const url = problem?.task?.url
    if (!url || importingUrl.value || importedUrls.value.has(url)) return

    importingUrl.value = url
    error.value = null
    try {
      const { node } = await importProblem(toRaw(problem.task), {
        // 无 rating 的题（用户没设难度区间时可能抽到）不给这个参数，由 importProblem 落「未分类」
        difficulty: problem.rating == null ? '' : String(problem.rating),
        quiet: !!options.quiet,
      })
      importedUrls.value = new Set(importedUrls.value).add(url)
      // quiet 时这张页签根本没开，入组也会被 tabGroups 过滤掉（它只收条带上已有的页签）
      if (!options.quiet) await trackBatchTab(node?.id)
    } catch (failure) {
      error.value = {
        key: 'cf.picker.errors.importFailed',
        params: { detail: failure?.message || '' },
      }
    } finally {
      importingUrl.value = ''
    }
  }

  /**
   * 把刚打开的页签收进**本批的组**。
   *
   * 组的粒度是「批」，不是「次点击」：判据用这批抽到几道（results.length ≥ 2 才建组）——
   * 免得用户点一道导一道，条带上排出一串只有一个成员的组。单抽一道题就只是打开一张页签。
   *
   * 组不命名 —— 一批抽来的题没有天然名字（难度区间、标签都可能重复），交给用户右键改；
   * 颜色走 tabGroups 自带的「用得最少的那个」，连续抽几批不会撞色。
   * @param {string|undefined} tabId
   */
  async function trackBatchTab(tabId) {
    if (!tabId) return
    if (results.value.length < 2) return
    // 新页签是 openTabIds 的 watch（flush: 'pre'）排进 stripOrder 的，而 tabGroups 只收
    // 「条带上已有的」页签 —— 不等这次刷新，刚打开的页签会被静默过滤掉（组建不出来 / 加不进去）
    await nextTick()
    if (batchGroupId && groupOfId(batchGroupId)) {
      addTabsToGroup([tabId], batchGroupId)
      return
    }
    // 组被用户整组关掉了（groupOfId 查不到）→ 另建一个，别把页签塞进一个不存在的组
    batchGroupId = groupTabs([tabId])
  }

  /**
   * 把这一批全部导入。逐个串行 await —— importProblem 内部走 VFS 的 batch 落库，
   * 并发跑会各自 emit 一次 reset、树跟着抖好几下。
   * 已经导过的跳过；失败就停在那一道上，错误照常显示在状态行里。
   *
   * **一批超过 BULK_TAB_LIMIT 道就只落盘、不打开页签**（判据见文件里的 BULK_TAB_LIMIT）：
   * 十张页签一起弹出来会把条带挤满，还会连着把抽题面板顶掉 —— 用户在结果区本来就看得到
   * 导没导，不需要靠页签确认。
   */
  async function importAll() {
    if (importingAll.value || importingUrl.value) return
    importingAll.value = true
    const quiet = results.value.length > BULK_TAB_LIMIT
    try {
      for (const problem of results.value) {
        if (importedUrls.value.has(problem.task.url)) continue
        await importOne(problem, { quiet })
        // importOne 失败时会把 error 挂上：这时别再往下导了，免得用户不知道是哪一道出的问题
        if (error.value) break
      }
    } finally {
      importingAll.value = false
    }
  }

  /**
   * 导入按钮该显示哪种状态：文案在模板里 t(`cf.picker.result.${importState(...)}`)。
   * 「导入了但样例还没到手」不再单列一个状态 —— 那件事的提示挪到了评测面板的空态里
   * （见 useCompanionBridge.js 的 autoScrapeState），结果行只回答「导没导过」。
   * 状态只在**本次会话导过**的题上出现（importedUrls 是会话内的），换个批次就重置。
   */
  function importState(problem) {
    const url = problem?.task?.url
    if (importedUrls.value.has(url)) return 'imported'
    if (importingUrl.value === url) return 'importing'
    return 'import'
  }

  return {
    // 表单
    ratingMin,
    ratingMax,
    tags,
    count,
    preferNew,
    excludeSolved,
    handle,
    // 派生
    stageText,
    handleText,
    handleState,
    // 动作
    clampCount,
    applyPreset,
    checkHandle,
    run,
    importOne,
    importAll,
    importState,
    // 结果
    picking,
    importingAll,
    error,
    results,
  }
}
