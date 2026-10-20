import { computed, onBeforeUnmount, ref } from 'vue'

import { findProblemByUrl, problemUrlKey } from '../services/vfs/workspaceStore.js'
import { IS_DESKTOP } from '../services/platform.js'

/**
 * 浏览器扩展（改造版 Competitive Companion）的网页接收端。
 *
 * 扩展拿不到网页的 JS 作用域，所以它在目标网站里注入一个内容脚本做桥接
 * （cph-companion 的 src/bridge.ts），用 window.postMessage 中转这几种消息：
 *   - cp-task：扩展把解析出来的题目 JSON 推过来
 *   - cp-ping / cp-info：网页主动握手，问扩展「装没装、版本号多少、快捷键绑了什么」
 *   - cp-set-config / cp-config：网页改投递目标开关
 *   - cp-query-need / cp-need-answer：扩展问「这道题要不要抓样例」，网页作答（见下）
 *   - cp-fill-code / cp-fill-code-result：网页请扩展在 Codeforces 上替用户填验证码（见下）
 *   - cp-cf-check / cp-cf-check-result：网页问「这个浏览器在 Codeforces 上登的是不是我填的
 *     那个 handle」，扩展只回一个枚举（见下）
 *   - cp-scrape-contest / cp-scrape-contest-done：网页请扩展**整场**抓样例（见下）
 *
 * 这几个消息名是**跨仓契约**（2026-10-01 与扩展一起从 `cph-` 前缀改成 `cp-`）：
 * 改了任何一条都必须同步改 cph-companion 并发新版插件，否则新旧两边互相认不出、
 * 抓题直接失联。下一行的 EXTENSION_SOURCE 是扩展侧的来源标识，不属于这批消息名。
 *
 * 【cp-fill-code 这一对是 2026-10-11 新加的】它是网页发起的第二条**动作请求**（头一条是
 * cp-set-config），只服务云端同步里「取码 → 改 Codeforces Last name」那一步 —— 那一步必须
 * 在带着用户 Codeforces 登录态的页面上做，而扩展本来就注入在 codeforces.com。
 * 两条纪律：① 只回一个 reason 枚举，**绝不回传 CF 的 cookie 或页面内容**（信任模型与手工
 * 填写一字不差，服务端仍然只认 user.info 里读回来的那枚 Last name）；② 只在用户显式点按时
 * 触发一次，不做轮询、不在后台自动跑。
 * 它是**加**出来的一对：老扩展不认识就不回，站点按超时收场；再叠一层 `capabilities`
 * 能力协商（见 canFillCode），旧扩展下这颗按钮根本不出现，行为与改动前一致。
 *
 * 【cp-cf-check 这一对同样是 2026-10-11 新加的】取码之后问一句「这个浏览器登的是不是 he-jie」，
 * 好让界面**提前**说清代填能不能成，而不是让用户白点一次再看失败文案。
 * 三条纪律：① **只回枚举，不回用户名** —— 扩展在本地比对（它捎带读的是 Codeforces 页面上
 * 公开可见的那个链接，不是 cookie），所以这个回答里**没有任何本站原本不知道的信息**；
 * ② 一律当**提示**用，绝不参与鉴权 —— 扩展是用户可替换的组件，伪造一个就能回答任意 handle，
 * 所以它只能决定「显示什么」，不能决定「放行什么」（服务端那条 Last name 验证一字不改）；
 * ③ 拿不到就按 `unknown` 收场，界面退回改动前的样子。
 *
 * 【cp-scrape-contest 这一对是 2026-10-19 新加的】抽题面板导入的题目**没有样例**
 * （CF 的 problemset 接口不返回样例，题目页又没有 CORS 头），以前只能靠「用户打开这道题的
 * 页面、扩展顺手补」这条被动链路。整场抓样例把这步变成一次点击：网页把这场比赛题目列表页的
 * 地址递过去，扩展在后台开一个不激活的标签页读一遍（整场题面都在那一页里），解析结果仍然
 * **走既有的 cp-task 逐题投递** —— 站点不必为「补样例」再造一条入库路径，扩展也不必另写
 * 一遍解析。它同样受 `capabilities` 的 `contest-batch` 保护，老扩展下那颗按钮不出现。
 *
 * 状态放模块级是刻意的：扩展是否已安装是全局事实，设置面板和 App 应当看到同一份结果，
 * 不该每个组件各探一次（多次探测还会互相覆盖 currentRequestId）。
 */

const PAGE_SOURCE = 'cp-page'
const EXTENSION_SOURCE = 'competitive-companion'

/** 扩展开着的话通常几毫秒就回，超过这个时间就当没装 */
const PING_TIMEOUT = 500
/** 内容脚本只在页面加载时注入（manifest 里是 document_start）。
 *  扩展被重载过、页面一直没刷新时会失联，所以隔一段时间多探几次。 */
const PING_DELAYS = [0, 400, 1500]

/**
 * null = 未检测到扩展。
 *
 * **导出的是这份模块级 ref 本身**（2026-10-12 加 export）：除了设置面板，齿轮菜单里那一行
 * 「安装 / 下载浏览器插件」也要按它决定在不在（见 `services/settingsMenu.js`）——
 * 「扩展装没装」是全局事实，两处读的必须是同一份（同文件上面那条纪律）。
 */
export const extensionInfo = ref(null)
/** 正在探测。设置面板据此显示「检测中」，而不是一上来就断言「未安装」 */
const checking = ref(false)

/** 改配置的回执超时：扩展开着通常几毫秒就回 */
const CONFIG_TIMEOUT = 1000
/**
 * 答完「要抓」之后等题目投递回来的上限。
 * 扩展侧等样例渲染最多 20s（cph-companion 的 autoParse.ts），再加上解析与投递，
 * 留 10s 余量；超过就认定这一趟空手而归，界面上转成「重开页面可再试」。
 */
const SCRAPE_TIMEOUT = 30000

/**
 * 等扩展把验证码填进 Codeforces 的上限。
 *
 * 比上面几条宽得多，因为这一步扩展可能要**新开一个 Codeforces 标签页**（用户还没登录过、
 * 或那个标签页被关了）再等页面就绪 —— 那是几秒级的事。扩展开着、CF 标签页也在时通常一两秒。
 */
const FILL_TIMEOUT = 15000

/**
 * 等扩展回答「这个浏览器登的是不是这个 handle」的上限。
 *
 * 比代填短得多：这一问**不打开任何页面、不发任何请求**，扩展只是拿它自己存的会话缓存比一下
 * （见 cph-companion 的 background.ts），正常是毫秒级。留 3s 是给「service worker 刚被回收
 * 需要唤醒」那一档。超时一律当 unknown —— 这一问只是锦上添花，绝不能拖慢界面。
 */
const CF_CHECK_TIMEOUT = 3000

/**
 * 扩展对「这个浏览器登的是不是这个 handle」可能给的四种回答（也是**跨仓契约**）。
 * 多一个没见过的值一律收敛成 `unknown`：界面只有四种形态，不该被一个新枚举撬开第五种。
 */
const CF_IDENTITY_STATUSES = ['match', 'mismatch', 'not-logged-in', 'unknown']

/**
 * 等扩展整场抓完的上限。
 *
 * 这一趟比单题重得多：扩展要开一个标签页把整场题目页 load 完（上限 45s）、解析、
 * 再逐题投递（扩展侧整趟上限 120s）。留 30s 余量 —— 宁可晚一点判失败，也不要
 * 在扩展其实还在跑的时候把界面切成「失败」，那会让用户重复点。
 */
const CONTEST_SCRAPE_TIMEOUT = 150000

const taskHandlers = new Set()
const seenTaskIds = new Set()

let pingSeq = 0
let pingTimers = []
let currentRequestId = null
let attached = false

let configSeq = 0
/** requestId -> { resolve, timer }：等待扩展对某次改配置的确认 */
const pendingConfigs = new Map()

let fillSeq = 0
/** requestId -> { resolve, timer }：等待扩展报「验证码填好了 / 为什么没填成」 */
const pendingFills = new Map()

let cfCheckSeq = 0
/** requestId -> { resolve, timer }：等待扩展报「这个浏览器登的是不是这个 handle」 */
const pendingCfChecks = new Map()

let contestScrapeSeq = 0
/** requestId -> { resolve, timer }：等待扩展报「这一场抓完了没有」 */
const pendingContestScrapes = new Map()

function clearPingTimers() {
  for (const timer of pingTimers) window.clearTimeout(timer)
  pingTimers = []
}

function sendPing() {
  currentRequestId = `cp-ping-${++pingSeq}`
  window.postMessage(
    { source: PAGE_SOURCE, type: 'cp-ping', requestId: currentRequestId },
    window.location.origin,
  )
}

/** 主动问一次扩展：装没装、版本号、快捷键绑定 */
export function refreshExtensionInfo() {
  // 桌面端没有浏览器扩展这条路（见 HANDOFF 第 14 节第 6 条）：桥的另一端根本不存在，
  // 探活只会白等一轮超时。整条链路直接不接，extensionInfo 永远停在 null。
  if (IS_DESKTOP) return

  clearPingTimers()
  // 刻意**不**先清空 extensionInfo：设置面板里那一整块（投递开关、快捷键）挂在
  // v-if="extensionInfo" 上，清空会让它整块消失再长回来 —— 每次切到「应用」栏都闪一下。
  // 探活要「不知道就说不知道」这件事由 checking 承担（状态行显示「检测中」），
  // 快照本身留到有结论再换：探到就换成新的一份，探不到才置 null
  checking.value = true

  for (const delay of PING_DELAYS) {
    pingTimers.push(window.setTimeout(sendPing, delay))
  }

  // 最后一轮也超时没回音，就认定没装
  pingTimers.push(
    window.setTimeout(
      () => {
        checking.value = false
        currentRequestId = null
        extensionInfo.value = null
      },
      PING_DELAYS[PING_DELAYS.length - 1] + PING_TIMEOUT,
    ),
  )
}

/**
 * 让扩展改一个投递目标开关（sendToWebPage / sendToLocalTools）。
 * 回执 cp-config 到达后就地更新 extensionInfo.value.config —— 刻意不重跑 refresh，
 * 否则设置面板会闪一下「检测中」。返回是否写成功。
 */
export function setExtensionConfig(key, value) {
  return new Promise((resolve) => {
    if (!extensionInfo.value) {
      resolve(false)
      return
    }

    const requestId = `cp-set-${++configSeq}`
    const timer = window.setTimeout(() => {
      pendingConfigs.delete(requestId)
      resolve(false)
    }, CONFIG_TIMEOUT)

    pendingConfigs.set(requestId, { resolve, timer })
    window.postMessage(
      { source: PAGE_SOURCE, type: 'cp-set-config', requestId, key, value },
      window.location.origin,
    )
  })
}

/**
 * 扩展自报的能力清单（`cp-info` 的 `info.capabilities`）。
 *
 * 做成**能力协商**而不是按版本号比大小：站点不该记「2.67.0 起才有代填」这种账 ——
 * 那笔账一旦记错方向就反了，而且每加一条能力都要回来改比较逻辑。
 * 老扩展（2.66.3 及以前）根本不带这个字段，落到空数组，于是代填那颗按钮不出现，
 * 行为与改动前一字不差 —— 这正是「加一对消息不必两边同版」的前提。
 */
export const canFillCode = computed(() =>
  (extensionInfo.value?.capabilities ?? []).includes('fill-code'),
)

/**
 * 扩展能不能回答「这个浏览器在 Codeforces 上登的是谁」。与 canFillCode 同一套能力协商。
 *
 * 与 `fill-code` **分开列**是刻意的：两条能力互不蕴含（一个管"能干活"、一个管"能答话"），
 * 合成一条会让「支持代填但不支持预检」的版本无路可走。
 */
export const canCheckCf = computed(() =>
  (extensionInfo.value?.capabilities ?? []).includes('cf-check'),
)

/**
 * 请扩展在 Codeforces 上替用户把验证码填进 Last name 并保存。
 *
 * 【为什么走扩展】服务端证明身份的方式是「能改这个 handle 的公开资料」，而这件事必须在
 * **带着用户 CF 登录态**的页面上做 —— 扩展本来就注入在 codeforces.com，这是它最合适的用处。
 * 网页自己做不到（跨源），也不该让用户的 CF 凭据离开浏览器（见项目讨论：读 cookie 那条路
 * 会让 CF 会话凭据进入后端，被否决）。
 *
 * 【刻意不做的事】扩展只回一个 reason 枚举，**不回传任何 CF cookie 或页面内容**；
 * 站点这一侧拿不到、也存不下 CF 的任何凭据。信任模型与手工填写完全一致：服务端仍然只认
 * `user.info` 里读回来的那枚 Last name。扩展侧另有三条约束：只认当前登录的 handle 与请求
 * 一致（不一致就什么都不写）、只在这一次调用里用这枚码、用完即弃。
 *
 * 返回 `{ ok, reason }`。扩展没装 / 太旧 / 超时都在这里折成一个失败结果，不往外抛 ——
 * 界面只需要「成功」或者「一句人话」。
 */
export function requestCodeFill(handle, code) {
  return new Promise((resolve) => {
    if (!canFillCode.value) {
      resolve({ ok: false, reason: 'unsupported' })
      return
    }

    const requestId = `cp-fill-${++fillSeq}`
    const timer = window.setTimeout(() => {
      pendingFills.delete(requestId)
      resolve({ ok: false, reason: 'timeout' })
    }, FILL_TIMEOUT)

    pendingFills.set(requestId, {
      resolve: (result) => {
        window.clearTimeout(timer)
        resolve(result)
      },
    })

    window.postMessage(
      { source: PAGE_SOURCE, type: 'cp-fill-code', requestId, handle, code },
      window.location.origin,
    )
  })
}

/**
 * 问扩展「这个浏览器在 Codeforces 上登的是不是我填的这个 handle」。
 *
 * 【为什么要问】取码之后，代填能不能成完全取决于这一件事。不问的话，用户只能白点一次、
 * 等失败文案才知道「哦这台浏览器没登 CF」。问了就能**提前**说清，把那句失败文案提前成提示。
 *
 * 【为什么只回枚举是安全的】本站问的是「是不是 he-jie」，而 he-jie 是用户自己填进来的 ——
 * 所以扩展回 match / mismatch / not-logged-in / unknown 里**没有一个字**是本站原本不知道的。
 * 扩展那边也不读 cookie：它读的是 Codeforces 页面上公开可见的那个 `/profile/<handle>` 链接
 * （见 cph-companion 的 src/cfIdentity.ts），判据与用户抬头看一眼等价。
 *
 * 【绝不用来鉴权】这个值只能决定界面显示什么。扩展是用户可替换的组件，伪造一个就能对任意
 * handle 回答 match —— 所以它不能参与「放行什么」。身份证明始终是服务端那条 user.info +
 * Last name，一字不改。
 *
 * 返回 `'match' | 'mismatch' | 'not-logged-in' | 'unknown'`；扩展没装 / 太旧 / 超时都收敛成
 * `unknown`，调用方据此退回改动前的界面。
 */
export function checkCfIdentity(handle) {
  return new Promise((resolve) => {
    if (!canCheckCf.value || !handle) {
      resolve('unknown')
      return
    }

    const requestId = `cp-cf-${++cfCheckSeq}`
    const timer = window.setTimeout(() => {
      pendingCfChecks.delete(requestId)
      resolve('unknown')
    }, CF_CHECK_TIMEOUT)

    pendingCfChecks.set(requestId, {
      resolve: (status) => {
        window.clearTimeout(timer)
        resolve(status)
      },
    })

    window.postMessage(
      { source: PAGE_SOURCE, type: 'cp-cf-check', requestId, handle },
      window.location.origin,
    )
  })
}

/**
 * 扩展能不能**整场**抓样例（一次读一页，不再逐题开标签页）。与 canFillCode 同一套能力协商。
 *
 * 单独列一条而不是揉进 `fill-code`：两者管的完全是两件事。老扩展不带这条能力，
 * 比赛里那颗「抓样例」按钮就不出现，界面退回 P1 的样子（先落题、样例留给
 * 「打开题目页自动补」那条既有链路）。
 */
export const canScrapeContest = computed(() =>
  (extensionInfo.value?.capabilities ?? []).includes('contest-batch'),
)

/**
 * 请扩展抓一整场的样例，入参是这场比赛**题目列表页**的地址（`/contest/{id}/problems`）。
 *
 * 【为什么给页面地址而不是题号列表】Codeforces 把一场的全部题面连同样例都渲染在这一页里
 * （见 `cf/contest.js` 的 contestProblemsUrl），扩展读一页就够；给它题号反而要它自己
 * 拼 N 个地址、开 N 次页面。
 *
 * 【结果怎么落地】扩展那边抓完仍是**逐题 cp-task 投递**（与点图标抓题完全同一条链路），
 * 站点这边由 `importProblem` 按 url 并进已有的题里 —— 所以这个 Promise 只负责
 * 「这一场结束了没有」，样例入库不经过它。
 *
 * 返回 `{ ok, count, reason }`；扩展没装 / 太旧 / 超时都折成失败结果，不往外抛。
 */
export function requestContestScrape(url) {
  return new Promise((resolve) => {
    if (!canScrapeContest.value || !url) {
      resolve({ ok: false, count: 0, reason: 'unsupported' })
      return
    }

    const requestId = `cp-scrape-${++contestScrapeSeq}`
    const timer = window.setTimeout(() => {
      pendingContestScrapes.delete(requestId)
      resolve({ ok: false, count: 0, reason: 'timeout' })
    }, CONTEST_SCRAPE_TIMEOUT)

    pendingContestScrapes.set(requestId, {
      resolve: (result) => {
        window.clearTimeout(timer)
        resolve(result)
      },
    })

    window.postMessage(
      { source: PAGE_SOURCE, type: 'cp-scrape-contest', requestId, url },
      window.location.origin,
    )
  })
}

/**
 * 有没有一场整场抓取正在跑。给入库那边判「要不要安静地落库」用：
 * 一场会连着投七八道题，每道都抢一次焦点的话页签会连着翻七八次。
 */
export function isContestScrapeActive() {
  return pendingContestScrapes.size > 0
}

// ------------------------------------------------------- 自动抓取样例
//
// 【为什么不存名单】早先的做法是：导入时把「没带样例的题」记成一份名单推给扩展，用户之后
// 打开题目页时扩展照名单抓。但名单有两份、各存各的，谁丢一次账就对不上；而且「这道题还要不要
// 样例」这个判断只有工作区答得出来 —— 扩展看不见工作区。所以 2026-10-01 起改成**不存名单**：
// 扩展每打开一个题目页就问一句（cp-query-need），这边按「工作区里认得出这道题、且它的样例
// 还是空的」当场作答，答案只活在这一问一答里。
//
// 这里记的只是本题会话的**过程状态**，供评测面板空态显示；刷新页面即可丢掉，不落盘。

/** 已答「要抓」、题目还没投递回来的题目键 */
const scrapingKeys = ref([])
/** 答了「要抓」但等到超时也没等到样例的题目键（下次重开题目页会重新走一遍） */
const failedKeys = ref([])

/** 题目键 -> 超时计时器。按题各记一个：同站开两个题目页时互不干扰 */
const scrapeTimers = new Map()

/** 这道题此刻的自动抓取状态，给评测面板空态用：'fetching' | 'failed' | ''（无事发生） */
export function autoScrapeState(url) {
  const key = problemUrlKey(url)
  if (!key) return ''
  if (scrapingKeys.value.includes(key)) return 'fetching'
  if (failedKeys.value.includes(key)) return 'failed'
  return ''
}

/** 工作区里这道题还在等样例吗（认题与判空都在这儿，答给扩展用） */
function needsSamples(url) {
  const node = findProblemByUrl(url)
  if (!node) return false

  const tests = Array.isArray(node.config?.tests) ? node.config.tests : []
  return tests.length === 0
}

function beginScraping(key) {
  if (!scrapingKeys.value.includes(key)) scrapingKeys.value = [...scrapingKeys.value, key]
  failedKeys.value = failedKeys.value.filter((item) => item !== key)

  window.clearTimeout(scrapeTimers.get(key))
  scrapeTimers.set(
    key,
    window.setTimeout(() => {
      scrapeTimers.delete(key)
      scrapingKeys.value = scrapingKeys.value.filter((item) => item !== key)
      if (!failedKeys.value.includes(key)) failedKeys.value = [...failedKeys.value, key]
    }, SCRAPE_TIMEOUT),
  )
}

/**
 * 题目投递回来了：这道题要是正等着抓样例，就把过程状态收干净。
 * 只在**确实带了样例**时才算办妥 —— 手动按快捷键抓一道本来就没样例的题不该销掉失败标记。
 */
function settleScraping(task) {
  const url = typeof task?.url === 'string' ? task.url : ''
  if (!url || !Array.isArray(task.tests) || task.tests.length === 0) return

  // 按题认，不按字符串：投递回来的地址可能是 /problemset/problem/…，而记的时候是
  // 抽题面板给的 /contest/…/problem/…（两者是同一道题，见 workspaceStore 的 problemUrlKey）
  const key = problemUrlKey(url)
  if (!key || !scrapeTimers.has(key)) return

  window.clearTimeout(scrapeTimers.get(key))
  scrapeTimers.delete(key)
  scrapingKeys.value = scrapingKeys.value.filter((item) => item !== key)
  failedKeys.value = failedKeys.value.filter((item) => item !== key)
}

/**
 * 答扩展那一问（cp-query-need → cp-need-answer）。
 *
 * 答「要」就在这里起一个超时计时：扩展开着的时候未必抓得到（样例一直没渲染出来、
 * 用户把页面关了），那种情况不该让面板永远停在「正在抓取」。
 */
function answerNeedQuery(data) {
  const url = typeof data.url === 'string' ? data.url : ''
  const key = url ? problemUrlKey(url) : ''
  const need = key !== '' && needsSamples(url)

  if (need) beginScraping(key)

  // postMessage 是结构化克隆，认不了响应式 Proxy —— 这里传的都是普通字符串 / 布尔，安全
  window.postMessage(
    { source: PAGE_SOURCE, type: 'cp-need-answer', queryId: data.queryId, need },
    window.location.origin,
  )
}

function dispatchTask(data) {
  if (typeof data.payload !== 'string') return

  // 同站多开标签页时扩展会广播，按 taskId 去重，免得同一道题进两次
  if (data.taskId) {
    if (seenTaskIds.has(data.taskId)) return
    seenTaskIds.add(data.taskId)
  }

  let task
  try {
    task = JSON.parse(data.payload)
  } catch {
    return
  }

  // 这道题正等着扩展补样例的话，到这里就算办妥了（handler 里 importProblem 会把它写进文件）
  settleScraping(task)

  for (const handler of taskHandlers) handler(task)
}

function onMessage(event) {
  // 只认本窗口、同源的消息：挡掉 iframe 与外部页面伪造
  if (event.source !== window || event.origin !== window.location.origin) return

  const data = event.data
  if (!data || data.source !== EXTENSION_SOURCE) return

  if (data.type === 'cp-task') {
    dispatchTask(data)
    return
  }

  // 扩展问「这个题目页要不要抓样例」：答案得当场给，所以同步答完就返回
  if (data.type === 'cp-query-need') {
    answerNeedQuery(data)
    return
  }

  if (data.type === 'cp-config') {
    const pending = pendingConfigs.get(data.requestId)
    if (!pending) return

    window.clearTimeout(pending.timer)
    pendingConfigs.delete(data.requestId)

    // 写成功才把新值并进快照，面板读的就是这份
    if (data.ok && extensionInfo.value) {
      extensionInfo.value = {
        ...extensionInfo.value,
        config: { ...extensionInfo.value.config, [data.key]: data.value },
      }
    }

    pending.resolve(Boolean(data.ok))
    return
  }

  // 扩展报「验证码填进 Codeforces 了吗」（cp-fill-code 的回执）：按 requestId 认领
  if (data.type === 'cp-fill-code-result') {
    const pending = pendingFills.get(data.requestId)
    if (!pending) return

    pendingFills.delete(data.requestId)
    pending.resolve({
      ok: data.ok === true,
      // 扩展没给 reason 时留空串，由调用方的兜底文案接手
      reason: typeof data.reason === 'string' ? data.reason : '',
    })
    return
  }

  // 扩展报「这个浏览器登的是不是这个 handle」（cp-cf-check 的回执）：按 requestId 认领
  if (data.type === 'cp-cf-check-result') {
    const pending = pendingCfChecks.get(data.requestId)
    if (!pending) return

    pendingCfChecks.delete(data.requestId)
    // 认不出的枚举一律收敛成 unknown —— 多一个没见过的值不该让界面切到别的分支去
    pending.resolve(CF_IDENTITY_STATUSES.includes(data.status) ? data.status : 'unknown')
    return
  }

  // 扩展报「这一场抓完了 / 卡在哪一步」：按 requestId 认领
  if (data.type === 'cp-scrape-contest-done') {
    const pending = pendingContestScrapes.get(data.requestId)
    if (!pending) return

    pendingContestScrapes.delete(data.requestId)
    pending.resolve({
      ok: data.ok === true,
      count: typeof data.count === 'number' ? data.count : 0,
      reason: typeof data.reason === 'string' ? data.reason : '',
    })
    return
  }

  if (data.type !== 'cp-info') return
  // 只认自己那一轮的握手回包（页面里可能有其它脚本也在 postMessage）
  if (data.requestId !== currentRequestId) return

  clearPingTimers()
  checking.value = false
  currentRequestId = null
  extensionInfo.value = data.info ?? null
}

function attach() {
  if (attached) return
  attached = true

  // 桌面端不挂 message 监听：没有内容脚本会往页面投递题目（见上面 refreshExtensionInfo）
  if (IS_DESKTOP) return

  window.addEventListener('message', onMessage)
  // 挂上就先探一次，设置面板打开之前状态就已经就绪
  refreshExtensionInfo()
}

/**
 * 取用扩展状态；`onTask` 传了就顺便订阅解析结果。
 * 卸载时按函数引用自动退订。
 */
export function useCompanionBridge(onTask) {
  attach()

  if (onTask) {
    taskHandlers.add(onTask)
    onBeforeUnmount(() => taskHandlers.delete(onTask))
  }

  return {
    extensionInfo,
    checking,
    refresh: refreshExtensionInfo,
    setExtensionConfig,
    canFillCode,
    requestCodeFill,
    canCheckCf,
    checkCfIdentity,
  }
}
