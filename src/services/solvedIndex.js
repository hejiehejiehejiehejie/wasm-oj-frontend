/**
 * solvedIndex —— 「这道题我通过了吗」的唯一出处。
 *
 * 【三个来源，一个答案】
 * 1. **本站提交**（'earned'）：用户点站内「提交」交给 Codeforces、判定回来是 AC 的那一道，
 *    落在 `cp.cf.earned`。见下面那段「为什么要有它」。
 * 2. **自动**（'auto'）：本机填的 Codeforces 账号已 AC 的题。数据来自 Worker 的 `user.status`
 *    （12h 缓存），与抽题面板「排除已通过的题」读的是**同一份** `loadSolvedKeys` ——
 *    两处不会各拉一次接口，也不会出现「被排除掉了却没标上勾」这种自相矛盾的画面。
 * 3. **手动**（'manual'）：用户自己点的「标记为已通过」，落在 `cp.cf.solved`。
 * 三个集合取并集，谁也不覆盖谁；显示时按上面的顺序取第一个命中的。
 *
 * 【为什么要有「本站提交」这一半（2026-11-08 用户口径）】站内的提交按钮本来就能拿到
 * 判定（扩展推 cp-submit-status，见 App.vue 的 submitActiveFile）。既然刚 AC 的那一秒
 * 就知道结果了，却非要等下一趟 `user.status`（12h 缓存，且刚交的题在缓存窗口里根本
 * 看不见）才亮勾 —— 用户会觉得「我明明过了，勾呢」。所以判定为 ac 的那一刻直接记下来。
 *
 * 它比自动那一半**更强也更及时**：自动要等接口、要 12h 缓存过期；这个不需要网络、
 * 不需要填 handle，交完就有。而且它是「我自己在这台机器上交出来的」事实，
 * 删掉账号也不该跟着消失 —— 所以它单独落盘，`refreshSolved` 清空 autoKeys 时不动它。
 *
 * 【为什么手动不能取消自动的 / 本站提交的】自动命中意味着 CF 上确实有一条 OK 提交，
 * 本站提交命中意味着刚刚亲手交出一条 AC 的代码。允许手动抹掉它们，「已通过」就变成
 * 一件可以撒谎的事 —— 而自动那边同时是抽题的排除判据（Worker 里那份 solvedSet）。
 * 所以手动只负责「CF 不知道、我也没交过的那部分」（本地做过的题、别的 OJ），
 * 这两类命中时切换入口直接不给。
 *
 * 【键怎么定】CF 的题统一成 `cf/pick.js` 里 problemKey 的写法（`1234:A`），与 Worker
 * 回的键逐字相同，所以这里不做格式转换、只做大小写收敛；认不出是 CF 题的（洛谷、AtCoder、
 * 用户自建）退回 `problemUrlKey`（`luogu.com.cn/problem/P1001`）。两套写法不会撞车：
 * 前者一定不含 `/`。手动标记因此对**任何 OJ** 都成立，不只是 Codeforces。
 *
 * 【为什么不写进题目元数据】那要改写 VFS 节点（每点一次标记就动一次工作区），而「通过」
 * 是账号侧的事实、会变（换账号、重测），元数据是题目自身的属性。放在这里还有个实际好处：
 * 换台设备只要填同一个 handle，自动那一半立刻回来。
 *
 * 【为什么自动那一半的请求要等 cfReady】Codeforces 是**可选组件**：没装它的人不该
 * 为「界面上的一个勾」多打一趟网络。cfClient 本身是静态依赖（cfRuntime 在 main.js 里就
 * 引了它，代码早就在首屏包里），所以这里省下的不是下载量，而是**请求**。
 *
 * 【刷新时机】只在「组件已装 + 填了账号」时拉，且账号串变化做 600ms 防抖 ——
 * 账号是输入框绑定的，逐字符都会变，不防抖就是边打字边打接口。12h 缓存窗口里刚在 CF
 * 上交 AC 的题要靠 `refreshSolved({ force: true })` 才看得见（缓存口径与「排除已通过的题」
 * 一致）；但**从本站在站内交出来的 AC 不必等它** —— 判定一到就进 `earnedKeys`（见上）。
 */
import { computed, ref, watch } from 'vue'

import { cfHandle, myHandles } from '../cf/myHandle.js'
import { cfSolved } from './cfClient.js'
import { cfReady } from './cfRuntime.js'
import { problemUrlKey } from './vfs/workspaceStore.js'

/**
 * 手动标记的落盘键（值是字符串数组）。与抽题那些 `cp.cf.*` 同族，但**不进云同步白名单**：
 * 自动那一半本来就跟着账号走，手动这半是本机补充，同步过去会和另一台设备的 CF 状态打架
 * （见 services/cloudProfile.js 的清单）。
 */
export const SOLVED_STORAGE_KEY = 'cp.cf.solved'

/**
 * 本站提交判为 AC 的题的落盘键（2026-11-08 加）。同样**不进云同步白名单** ——
 * 它记的是「这台设备上交出过哪几道 AC」，换台设备把别人的交题记录摆过来没有意义。
 */
export const EARNED_STORAGE_KEY = 'cp.cf.earned'

/** 两个集合各自的条数上限：防手改 / 防异常值把 localStorage 写爆 */
const MANUAL_MAX = 4000
const EARNED_MAX = 4000

/** 防抖：账号串是输入框绑定的，逐字符都会变 */
const HANDLE_DEBOUNCE_MS = 600

/** `www.` 已在下面剥掉；m1 / m2 是同一站点的镜像入口，题目键要与主站一致 */
const CF_HOST = /^(?:m\d+\.)?codeforces\.com$/

/** 读一份题目键存档。坏值 / 非数组 / 空串一律按空集 —— 标记丢了顶多少一个勾，不能白屏 */
function readKeySet(storageKey, max) {
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    const keys = parsed
      .filter((key) => typeof key === 'string' && key)
      .slice(0, max)
    return new Set(keys)
  } catch {
    return new Set()
  }
}

/**
 * 手动标记集合（题目键）。**改动要整体换一个新 Set**（`manualKeys.value = next`）：
 * 这里用的是浅监听，原地 add 不会触发写盘，刷新后就丢了。
 */
export const manualKeys = ref(readKeySet(SOLVED_STORAGE_KEY, MANUAL_MAX))

/**
 * 本站提交判为 AC 的集合（题目键），只读 —— 它记的是既成事实，切换入口不碰它；
 * 唯一的写入方是 `markSolvedBySubmission()`（App.vue 拿到 ac 判定时调）。
 * 同样必须整体换 Set（理由见上）。
 */
export const earnedKeys = ref(readKeySet(EARNED_STORAGE_KEY, EARNED_MAX))

/** 自动集合（来自 CF 账号），只读 —— 切换入口不碰它，见文件头 */
export const autoKeys = ref(new Set())

/** 这批自动数据覆盖的账号（空数组 = 没有自动数据），界面用它解释「勾是哪来的」 */
export const autoHandles = ref([])

/** 正在拉取（首次进入 / 账号刚改） */
export const solvedLoading = ref(false)

/** 上一次成功拉到自动数据的时间戳（0 = 还没拉到过） */
export const solvedFetchedAt = ref(0)

/**
 * 上一次拉取是否失败了（失败后 autoKeys 保持原样，可能是空的）。
 * 界面暂时不显示它 —— 自动那一半拿不到时，「没有勾」本身就是一个可接受的降级；
 * 留着这个状态是给探针 / 排障用的（见 HANDOFF §30 的实测）。
 */
export const solvedError = ref(false)

/** 两份存档的写盘口径一致：值都是字符串数组，写不进去就只活在内存里 */
function persistKeySet(storageKey, value) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify([...value]))
  } catch {
    /* 隐私模式 / 配额满：这一趟只在内存里生效，与 usePersistentRef 同一取舍 */
  }
}

watch(manualKeys, (value) => persistKeySet(SOLVED_STORAGE_KEY, value))
watch(earnedKeys, (value) => persistKeySet(EARNED_STORAGE_KEY, value))

/**
 * 把 Worker 回的 problemKey（`<contestId>:<INDEX>`）收敛成同一把尺子。
 * 只做大小写与空值处理 —— 格式本身由 cf/pick.js 的 problemKey 一处定义，
 * 这里不另立一套。
 * @param {string} raw
 * @returns {string}
 */
function solvedKeyFromProblemKey(raw) {
  const text = String(raw ?? '')
  const cut = text.indexOf(':')
  if (cut <= 0) return ''
  const contestId = text.slice(0, cut)
  const index = text.slice(cut + 1).toUpperCase()
  return contestId && index ? `${contestId}:${index}` : ''
}

/**
 * 从 CF 的题目路径里认出一场题：`contest/<cid>/problem/<idx>`（含 group 里的同一段）、
 * `gym/<cid>/problem/<idx>`、`problemset/problem/<cid>/<idx>`。
 * edu 那种深层路径（`/edu/course/…/contest/28047/problem/A`）也靠扫 `contest` 段命中。
 *
 * 刻意的宽松：只要求「有个 contest 段 + 紧跟着 problem 段」，不校验段数 ——
 * 认错的唯一后果是键对不上、勾不出现（不会误标成另一道题，键里带着 cid 与 idx）。
 * @param {string[]} segments
 * @returns {[string, string] | null}
 */
function cfContestPair(segments) {
  if (segments[0] === 'gym' && segments.length === 4 && segments[2] === 'problem') {
    return [segments[1], segments[3]]
  }
  for (let i = 0; i + 3 < segments.length; i += 1) {
    if (segments[i] === 'contest' && segments[i + 2] === 'problem') {
      return [segments[i + 1], segments[i + 3]]
    }
    if (segments[i] === 'problemset' && segments[i + 1] === 'problem') {
      return [segments[i + 2], segments[i + 3]]
    }
  }
  return null
}

/**
 * 题目链接 → 题目键。空串表示「这道题没法标记」（没有链接、或链接根本不是个 URL）。
 *
 * CF 的题产出 `1234:A`（与 problemKey 逐字一致，这样自动集合能直接对上）；
 * 其它站点退回 `problemUrlKey` 的产出 `host/path`。手动标记不分 OJ，两种写法都收。
 *
 * @param {string} url 题目链接（通常是节点的 `meta.url`）
 * @returns {string}
 */
export function solvedKeyOfUrl(url) {
  if (typeof url !== 'string' || !url) return ''

  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return ''
  }

  const host = parsed.hostname.replace(/^www\./, '')
  if (CF_HOST.test(host)) {
    const segments = parsed.pathname.replace(/\/+$/, '').split('/').filter(Boolean)
    const pair = cfContestPair(segments)
    if (pair && pair[0] && pair[1]) return `${pair[0]}:${pair[1].toUpperCase()}`
  }

  // 认不出是 CF 题的（包括 CF 的 acmsguru 那种没有 contest 段的）走工作区认题那把尺子：
  // 手动标记照样成立，只是自动那一半对不上（它只会产出 `cid:IDX`）。
  return problemUrlKey(url)
}

/**
 * 这个链接的通过状态：`'earned'`（本站提交判为 AC）、`'auto'`（CF 账号）、
 * `'manual'`（手动标记）、`''`（没有）。
 *
 * 取第一个命中的，顺序即优先级：`earned` 最新鲜（就是刚才那一趟提交）、
 * `auto` 更强（整个账号的历史），两者都不可手动取消（见文件头）。
 * @param {string} url
 * @returns {'earned'|'auto'|'manual'|''}
 */
export function solvedSourceOfUrl(url) {
  const key = solvedKeyOfUrl(url)
  if (!key) return ''
  if (earnedKeys.value.has(key)) return 'earned'
  if (autoKeys.value.has(key)) return 'auto'
  if (manualKeys.value.has(key)) return 'manual'
  return ''
}

/**
 * 这个链接的勾是不是「锁住」的 —— 即点击 / 菜单都改不动它（earned 与 auto）。
 * 界面据此决定给不给「标记 / 取消」入口：给了却点不动，比没有更糟。
 * @param {string} url
 */
export function solvedLockedOfUrl(url) {
  const source = solvedSourceOfUrl(url)
  return source === 'earned' || source === 'auto'
}

/** 这道题通过了吗（不论来源） */
export function isSolvedUrl(url) {
  return solvedSourceOfUrl(url) !== ''
}

/**
 * 本机已知「已通过」的全部题目键（本站提交 + 手动标记），给抽题的「排除已通过的题」用。
 *
 * 为什么需要它：Worker 那份排除集只认 `user.status`（12h 缓存），刚在站内交 AC 的题
 * 在那个窗口里还不存在 —— 不把这两个集合递过去，用户会看到「勾着已通过、却又被抽出来」
 * 的画面。自动那一半由 Worker 自己按账号取，不在这里重复。
 *
 * 回数组而不是 Set：它要经 postMessage 交给 Worker。
 * @returns {string[]}
 */
export function localSolvedKeys() {
  return [...new Set([...earnedKeys.value, ...manualKeys.value])]
}

/**
 * 记下「这一道题本站提交判为 AC」。**唯一的写入方是 App.vue 的提交流程**
 * （`onVerdict` / 回执里看到 `ac` 时调），界面上的点击不会走到这里。
 *
 * 幂等：已经记过就早退，不产生新 Set、也就不触发一次多余的写盘 ——
 * 扩展可能对同一条提交重复推几次终态。
 *
 * @param {string} url 题目链接（活跃文件的 `meta.url`）
 * @returns {'earned'|''} 记下了（或本来就有）返回 `'earned'`；链接认不出题目键返回 `''`
 */
export function markSolvedBySubmission(url) {
  const key = solvedKeyOfUrl(url)
  if (!key) return ''
  if (earnedKeys.value.has(key)) return 'earned'

  // 新的放最前，同键去重；超上限时丢掉最旧的（与手动那份同一套「留最近」的思路）
  const next = [key, ...[...earnedKeys.value].filter((item) => item !== key)]
  earnedKeys.value = new Set(next.slice(0, EARNED_MAX))
  // 这道题以前可能被手动标过：现在有这么硬的一条记录，那条手动标记就是会复活的僵尸
  // （用户删掉存档里这一份之后它又冒出来），顺手剔掉
  pruneManualOverlap()
  return 'earned'
}

/**
 * 工作区节点是不是「已通过的题」。只有文件节点有意义（目录没有 meta.url），
 * 没有链接的文件一律判否 —— 键就是从链接来的。
 * @param {{ type?: string, meta?: { url?: string } } | null | undefined} node
 */
export function isSolvedNode(node) {
  return node?.type === 'file' && isSolvedUrl(node.meta?.url)
}

/**
 * 切换手动标记。返回切换后的来源（`'manual'` = 现在标着，`''` = 现在没标，
 * `'earned'` / `'auto'` = 本来就有更硬的记录，这一下没动）。
 *
 * 三种情况不写盘、只回现状：
 * - 链接认不出题目键（没有 url / 不是 URL）；
 * - 本站提交或自动已经命中（既成事实，不给手动抹，见文件头）；
 * - 手动条数已到上限（MANUAL_MAX）。
 * @param {string} url
 * @returns {'earned'|'auto'|'manual'|''}
 */
export function toggleSolvedUrl(url) {
  const key = solvedKeyOfUrl(url)
  if (!key) return ''
  if (earnedKeys.value.has(key)) return 'earned'
  if (autoKeys.value.has(key)) return 'auto'

  const next = new Set(manualKeys.value)
  if (next.has(key)) {
    next.delete(key)
  } else {
    if (next.size >= MANUAL_MAX) return ''
    next.add(key)
  }
  manualKeys.value = next
  return next.has(key) ? 'manual' : ''
}

/** 在途的那一趟拉取（组件与账号同时变化时只发一次） */
let inflight = null
/** 已经拉过的那批账号（小写排序后的签名），用来判断「同一批账号不必再拉」 */
let loadedFor = ''
/** 本轮失败已经重试过几次（成功即清零）。上限见 RETRY_MAX —— 拉不到就是拉不到，别死循环 */
let retries = 0
/** 失败重试的定时器 */
let retryTimer = 0
const RETRY_MAX = 2
const RETRY_DELAY_MS = 3000

/**
 * 把与「更硬的记录」重叠的手动标记剔掉。
 *
 * 场景：首屏那 600ms 里用户先手动标了一道其实已经 AC 的题（自动数据还没回来），
 * 或者手动标过一道后来自己在站内交 AC 了的题 —— 两条记录于是同时存在。留着不显示
 * （更硬的来源优先），但一旦那份硬记录没了（删账号 / 清掉本站提交的存档），那条手动标记
 * 就会「凭空复活」成一个勾。剔掉它更干净：那些来源给出的答案一样，且更权威。
 *
 * 两个来源都算：`autoKeys`（账号）与 `earnedKeys`（本站提交判 AC）。
 */
function pruneManualOverlap() {
  const overlapping = [...manualKeys.value].filter(
    (key) => autoKeys.value.has(key) || earnedKeys.value.has(key),
  )
  if (!overlapping.length) return
  const next = new Set(manualKeys.value)
  for (const key of overlapping) next.delete(key)
  manualKeys.value = next
}

/**
 * 拉一次自动集合。**重复调用是安全的**：签名没变就什么都不做（除非 force）。
 *
 * 没有账号时把自动集合清空 —— 用户把账号删掉之后，屏幕上那些勾应当跟着消失，
 * 否则它们会以「手动标记」的身份留在那里，用户还没法取消（自动的不可取消）。
 *
 * @param {{ force?: boolean }} [options] force=true 无视 12h 缓存（刚在 CF 上 AC 完要用它）
 * @returns {Promise<void>}
 */
export function refreshSolved({ force = false } = {}) {
  const handles = myHandles()
  const signature = handles
    .map((handle) => handle.toLowerCase())
    .sort()
    .join(',')

  if (!signature) {
    autoKeys.value = new Set()
    autoHandles.value = []
    loadedFor = ''
    retries = 0
    return Promise.resolve()
  }
  if (!force && signature === loadedFor) return Promise.resolve()
  if (inflight) return inflight

  inflight = (async () => {
    solvedLoading.value = true
    try {
      const response = await cfSolved(handles, { force })
      const keys = Array.isArray(response?.keys) ? response.keys : []
      autoKeys.value = new Set(keys.map(solvedKeyFromProblemKey).filter(Boolean))
      autoHandles.value = handles
      solvedFetchedAt.value = Date.now()
      solvedError.value = false
      loadedFor = signature
      retries = 0
      pruneManualOverlap()
    } catch {
      // 连不上 / Worker 挂了：**保持原样**（可能是上一次的结果），只是这一趟没更新。
      // 清空会让用户以为「我忽然一道题都没通过」，比不更新糟得多。
      solvedError.value = true
      scheduleRetry()
    } finally {
      solvedLoading.value = false
      inflight = null
    }
  })()

  return inflight
}

/**
 * 失败后隔 3 秒再试，最多两次。
 *
 * 为什么需要它（2026-11-08 实测发现）：启动那一刻的第一次拉取会与 Worker 的**冷启动**
 * 撞在一起（页面刚打开，cf 的 Worker 才第一次被创建），失败一次之后就没有第二次机会了
 * —— 界面上的表现是「一道题都不显示已通过」，而且当次会话再也不会自己好起来。
 * 探针里正是这个现象：手动调一次就 3060 条，启动那次却是空的。
 *
 * 只重试两次：12h 缓存口径下，拉不到多半是离线 / CF 不通，多试没有意义；
 * 下次刷新会再来一遍（`loadedFor` 没被写上，所以下一个成功的机会不会被跳过）。
 */
function scheduleRetry() {
  if (retries >= RETRY_MAX || retryTimer) return
  retries += 1
  retryTimer = setTimeout(() => {
    retryTimer = 0
    void refreshSolved()
  }, RETRY_DELAY_MS)
}

/**
 * 启动与账号变化时的自动拉取。
 *
 * 两个闸门，缺一不可：
 * - `cfReady`：组件没装就一个请求都不发（也就不会起 Worker、不会打 CF 的接口）——
 *   没装组件的人不该为「界面上的一个勾」付后台线程与一趟网络；
 * - 账号存在：没填账号时 `refreshSolved` 内部直接返回。
 *
 * 防抖的理由见文件头（账号是输入框绑定的）。
 */
let handleTimer = 0
watch(
  [cfReady, cfHandle],
  ([ready]) => {
    if (!ready) return
    clearTimeout(handleTimer)
    // 账号换了就是新的一轮：把上一轮排着的重试与计数一起丢掉，别让它拿旧账号的数据回来
    clearTimeout(retryTimer)
    retryTimer = 0
    retries = 0
    handleTimer = setTimeout(() => {
      void refreshSolved()
    }, HANDLE_DEBOUNCE_MS)
  },
  { immediate: true },
)

/** 自动集合的条数（诊断 / 测试用；不参与界面） */
export const autoSolvedCount = computed(() => autoKeys.value.size)
