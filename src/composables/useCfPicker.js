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
 * 【结果也存一份（2026-11-08 用户口径）】「上次抽到的题目刷新 / 重开站点后要还在」——
 * 抽完可能就去写代码了，回来刷新一下结果全没了，等于白抽。于是 `results` 本身也换成
 * 持久化 ref（`cp.cf.picked`）：只存那一小串结果（≤10 条，各带 id / 名字 / rating / tags /
 * task），几 KB，与「导入工作区」（把正文与样例落进 VFS）仍然是两件事 —— **抽中不等于落盘**，
 * 用户不看中的那批题，工作区里一个字节都不会多出来。
 *
 * 【抽取为什么全交给 Worker】题库一万多道题，筛选 + 排序放主线程会卡 Monaco。
 * 这里只负责：把表单翻译成 filters、把进度/错误翻成界面状态、把结果捧着，抽到了再发一条
 * 全局通知（**抽题期间页签可能已经被切走**，见 run() 里那段注释）。
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
import {
  CONTEST_CATS,
  COUNT_MAX,
  COUNT_MIN,
  PROBLEM_LETTERS,
  normalizeCats,
  normalizeHandles,
  normalizeLetters,
  normalizeTags,
  problemKey,
} from '../cf/pick.js'
import { applyCanonicalHandles, cfHandle } from '../cf/myHandle.js'
import { cfCheckHandles, cfPick, onCfProgress } from '../services/cfClient.js'
import { cfReady } from '../services/cfRuntime.js'
import { closeCodeforcesTab } from '../services/editorViews.js'
import { notify } from '../services/notifications.js'
import { localSolvedKeys } from '../services/solvedIndex.js'
import { addTabsToGroup, groupOfId, groupTabs } from '../services/tabGroups.js'
import { importProblem } from '../services/vfs/problemImport.js'
import { findProblemByUrl, workspace } from '../services/vfs/workspaceStore.js'
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
  divisions: 'cp.cf.divisions',
  letters: 'cp.cf.letters',
  tags: 'cp.cf.tags',
  count: 'cp.cf.count',
  preferNew: 'cp.cf.preferNew',
  excludeSolved: 'cp.cf.excludeSolved',
  /** 上次抽到的那一批结果（见文件头「结果也存一份」）。**不进云同步白名单** ——
   *  它是「这台设备上刚才抽到了什么」的事实，换台设备把别人抽的题摆在眼前没有意义。 */
  picked: 'cp.cf.picked',
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
  const divisions = usePersistentRef(KEY.divisions, '')
  const letters = usePersistentRef(KEY.letters, '')
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
  /**
   * 抽中的题目（原始字段 + 现成的 task），展示用。
   *
   * 落盘（`cp.cf.picked`）：刷新 / 重开站点后这一批照样在结果区里（见文件头）。
   * 走 usePersistentRef 而不是自己 writeJSON —— 它「挂载时读、改动即写」，`run()` 换一批时
   * 先清空再填新结果的那两次赋值会各写一次，最终留在盘上的就是屏幕上这一批，不必另写一份
   * save 逻辑去跟屏（要跟的话少跟一处就漂移）。
   */
  const results = usePersistentRef(KEY.picked, [])

  /**
   * 存档的体检：只留**形如结果的**条目。存档是上一版代码写的、也可能被手改，
   * 而模板要直接读 `problem.tags.join` / `problem.task.url` —— 少一个字段就是一条渲染报错，
   * 且会连累整块结果区。认不出来的一律丢掉（宁可少一条，不要白屏）。
   */
  if (!Array.isArray(results.value)) {
    results.value = []
  } else {
    const sane = results.value.filter(
      (problem) =>
        problem &&
        typeof problem === 'object' &&
        typeof problem.contestId === 'number' &&
        problem.task &&
        typeof problem.task.url === 'string',
    )
    for (const problem of sane) {
      if (!Array.isArray(problem.tags)) problem.tags = []
      if (typeof problem.name !== 'string') problem.name = ''
      if (typeof problem.index !== 'string') problem.index = String(problem.index ?? '')
    }
    if (sane.length !== results.value.length) results.value = sane
  }

  /** 已导入工作区的题目 url。同一道题重复导入其实是无害的（按 url 认题、正文一个字不动），
   *  但按钮该在导过之后停用 —— 否则用户不知道点没点上 */
  const importedUrls = ref(new Set())

  /**
   * 把恢复出来的这批题按**工作区现状**标一遍「已导入」。
   *
   * `importedUrls` 本身是会话内的（哪一次导入成功就加一个），刷新后就空了 —— 而恢复出来的
   * 那一批大概率上次已经导过，不标的话每颗按钮都写着「导入」，点下去其实只是重开页签
   * （重复导入幂等，所以不危险，但等于让用户猜）。
   *
   * 判据走 `findProblemByUrl`（同步扫内存树、按 `problemUrlKey` 归一化认题）：抽题给的是
   * `/contest/<cid>/problem/<idx>`，而用户从题库进同一道题时地址是
   * `/problemset/problem/<cid>/<idx>`，只比字面量会漏认（见 workspaceStore 那段）。
   *
   * 必须等 `workspace.ready`：本 composable 在 CfPickerPanel 的 setup 里创建，那比
   * `initWorkspaceStore()` 早得多，此刻 `workspace.tree` 还是空的 —— 早标一次只会全部判成
   * 「没导过」，且不会再有第二次机会（除非另开一条 watch）。
   */
  function markImportedFromWorkspace() {
    let next = importedUrls.value
    for (const problem of results.value) {
      const url = problem?.task?.url
      if (typeof url !== 'string' || !url || next.has(url)) continue
      if (findProblemByUrl(url)) next = new Set(next).add(url)
    }
    if (next !== importedUrls.value) importedUrls.value = next
  }

  // 等工作区就绪再补标（immediate 那一次若已就绪就当场标）；只在 ready 翻真时做一次
  watch(
    () => workspace.ready,
    (ready) => {
      if (ready) markImportedFromWorkspace()
    },
    { immediate: true },
  )

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

  /** 校验时不存在的那几个账号：抽取前的静默校验用它点名（见 run） */
  const handleBad = ref([])

  const stageText = computed(() => {
    if (!picking.value) return ''
    return stage.value ? t(`cf.module.stage.${stage.value}`) : t('cf.picker.picking')
  })

  /** 数量夹取：失焦时把 `99` / `0` / `abc` 收回到合法区间 */
  function clampCount() {
    const value = Math.round(Number(count.value))
    count.value = Number.isFinite(value)
      ? Math.min(COUNT_MAX, Math.max(COUNT_MIN, value))
      : COUNT_MIN
  }

  /**
   * 这一档常用区间是不是「当前生效的那一档」：两格都等于它才算。
   *
   * 组件拿同一个函数判芯片的点亮态，所以「看到亮着」与「点下去会撤掉」永远是同一件事 ——
   * 手输成 800 / 1200 时那一档也亮着，点它能直接取消，不会出现「亮着却点不动」。
   */
  function isPresetActive(preset) {
    return (
      String(ratingMin.value ?? '') === String(preset.min) &&
      String(ratingMax.value ?? '') === String(preset.max)
    )
  }

  /**
   * 点一颗常用区间：不在就填上，**已经在就撤空**（回到「不限 – 不限」）。
   * 2026-11-08 用户口径：同一档要能再点一次取消 —— 与标签 / 类别 / 题号那几颗芯片同一个手势，
   * 否则清空只能靠手动删掉两格数字。
   */
  function applyPreset(preset) {
    const active = isPresetActive(preset)
    ratingMin.value = active ? '' : String(preset.min)
    ratingMax.value = active ? '' : String(preset.max)
  }

  /**
   * 已选标签（小写去重的数组）。**持久化仍是 `cp.cf.tags` 那一个逗号串** ——
   * 键名与格式都不动，所以这一版之前的旧值（手输的任意标签）原样认；
   * 归一化直接复用 Worker 那份 normalizeTags，界面与筛选对「什么算同一个标签」不会有两套说法。
   */
  const selectedTags = computed(() => normalizeTags(tags.value))

  /**
   * 点一颗标签芯片：在就撤掉，不在就追加。写回的是同一种逗号串（`, ` 分隔），
   * 顺序即点选顺序 —— 上面那行「选了哪些」照这个顺序念，与结果行的标签顺序无关。
   */
  function toggleTag(tag) {
    const key = String(tag ?? '').trim().toLowerCase()
    if (!key) return
    const next = selectedTags.value.includes(key)
      ? selectedTags.value.filter((item) => item !== key)
      : [...selectedTags.value, key]
    tags.value = next.join(', ')
  }

  /** 清掉上一次校验点出来的「不存在」名单 */
  function resetHandleState() {
    handleBad.value = []
  }

  /**
   * 已选的比赛类别（CONTEST_CATS 的 id 数组）。持久化仍是 `cp.cf.divisions` 那一个逗号串，
   * 与标签同一种存法：一格里存一串、点一下就重写一次，省掉「数组 vs JSON」的第二种格式。
   * 归一化复用 Worker 那份 normalizeCats —— 界面与筛选对「什么算同一个类别」不会有两套说法。
   */
  const selectedDivisions = computed(() => normalizeCats(divisions.value))

  /** 已选题号（A–M 的大写字母数组），存法与上面同一个口径（`cp.cf.letters`） */
  const selectedLetters = computed(() => normalizeLetters(letters.value))

  /** 点一颗类别芯片：在就撤掉，不在就追加（顺序即点选顺序，与标签芯片同一套） */
  function toggleDivision(cat) {
    const id = String(cat ?? '').trim().toLowerCase()
    if (!CONTEST_CATS.includes(id)) return
    const next = selectedDivisions.value.includes(id)
      ? selectedDivisions.value.filter((item) => item !== id)
      : [...selectedDivisions.value, id]
    divisions.value = next.join(', ')
  }

  /** 点一颗题号芯片：同上 */
  function toggleLetter(letter) {
    const key = String(letter ?? '').trim().toUpperCase()
    if (!PROBLEM_LETTERS.includes(key)) return
    const next = selectedLetters.value.includes(key)
      ? selectedLetters.value.filter((item) => item !== key)
      : [...selectedLetters.value, key]
    letters.value = next.join(', ')
  }

  /**
   * 静默校验账号（支持逗号分隔的多个）。**只在抽取前调用**（见 run）：拼错的账号会让
   * user.status 拿不到数据，「排除已通过的题」于是**悄悄失效** —— 比报错更糟。
   * 命中 1h 缓存时这一步是瞬时的。
   *
   * **竞态处理**：慢的那次可能后回来，所以回来时先看账号列表有没有又被改过 ——
   * 改过就只回结论、不动界面上那份「不存在」名单。
   * @returns {Promise<boolean>} 全部存在（或连不上、暂时无从判断）才算 true
   */
  async function checkHandle() {
    const current = normalizeHandles(handle.value)
    if (!current.length) {
      resetHandleState()
      return true
    }

    const { results } = await cfCheckHandles(current)
    const missing = results
      .filter((item) => item.reason === 'not_found')
      .map((item) => item.handle)

    // 校验成功就等于确认了官方写法：把存下来的大小写改回 CF 那份（见 applyCanonicalHandles）。
    // 改的只是大小写，handleSignature 按小写比，所以下面那一步「有没有又被改过」不受影响。
    applyCanonicalHandles(results)

    if (handleSignature(handle.value) !== handleSignature(current)) return missing.length === 0

    // 连不上 CF 不该拦着用户：判「未知」而不是「不存在」，原样放行，由抽取那一步再兜底。
    // 但只要有一个账号是**明确不存在**的，就照实报出来 —— 它会让「排除已通过的题」悄悄失效
    handleBad.value = missing
    return missing.length === 0
  }

  /**
   * 抽取。结果写进 `results`（顺带落盘，见文件头），**不进工作区** ——
   * 落盘题目正文与样例是「导入」那一步的事。
   */
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
      if (needsHandle && !(await checkHandle())) {
        error.value = {
          key: 'cf.picker.handle.notFound',
          params: { handles: (handleBad.value.length ? handleBad.value : handles).join(', ') },
        }
        return
      }

      const response = await cfPick({
        ratingMin: min,
        ratingMax: max,
        // 原样交给 Worker —— normalizeTags / normalizeHandles / normalizeCats / normalizeLetters
        // 都在那边，主线程不必知道怎么归一化
        divisions: divisions.value,
        letters: letters.value,
        tags: tags.value,
        count: count.value,
        preferNew: preferNew.value,
        excludeSolved: excludeSolved.value,
        handles,
        // 本机记下的「已通过」（站内提交判 AC + 手动标记）：Worker 那份排除集只认账号的
        // user.status（12h 缓存），刚交 AC 的题在窗口里还不存在 —— 不递过去就会出现
        // 「勾着已通过、又被抽出来」。见 services/solvedIndex.js 的 localSolvedKeys
        solvedExtra: localSolvedKeys(),
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
   * 判据是 `importedUrls`（会话内导过的题）—— 换一批（run）不清它，因为工作区里那些题
   * 还在；恢复出来的那一批由 `markImportedFromWorkspace()` 按工作区现状补标（见上）。
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
    selectedDivisions,
    selectedLetters,
    selectedTags,
    isPresetActive,
    // 动作
    clampCount,
    applyPreset,
    toggleDivision,
    toggleLetter,
    toggleTag,
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
