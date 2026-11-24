import { computed, onBeforeUnmount, ref } from 'vue'

import { findProblemByUrl, problemUrlKey } from '../services/vfs/workspaceStore.js'
import { IS_DESKTOP } from '../services/platform.js'

/**
 * 浏览器扩展（改造版 Competitive Companion）的网页接收端。
 *
 * 扩展拿不到网页的 JS 作用域，所以它在目标网站里注入一个内容脚本做桥接
 * （CC-for-Web 的 src/bridge.ts），用 window.postMessage 中转这几种消息：
 *   - cp-task：扩展把解析出来的题目 JSON 推过来
 *   - cp-ping / cp-info：网页主动握手，问扩展「装没装、版本号多少、快捷键绑了什么」
 *   - cp-set-config / cp-config：网页改投递目标开关
 *   - cp-query-need / cp-need-answer：扩展问「这道题要不要抓样例」，网页作答（见下）
 *   - cp-fill-code / cp-fill-code-result：网页请扩展在 Codeforces 上替用户填验证码（见下）
 *   - cp-fill-code-saved：扩展报「那枚码在 Codeforces 上保存落下去没有」（见下）
 *   - cp-cf-check / cp-cf-check-result：网页问「这个浏览器在 Codeforces 上登的是不是我填的
 *     那个 handle」，扩展只回一个枚举（见下）
 *   - cp-scrape-contest / cp-scrape-contest-done：网页请扩展**整场**抓样例（见下）
 *   - cp-submit / cp-submit-result：网页请扩展把当前文件提交到 Codeforces（见下）
 *   - cp-submit-status：扩展回报这次提交的评测状态变化（见下）
 *   - cp-contest-states / cp-contest-states-result：网页读赛程上每一场的报名状态（见下）
 *   - cp-register / cp-register-result：网页请扩展替用户报名（见下）
 *   - cp-start-virtual / cp-start-virtual-result：网页请扩展替用户开一场 VP（见下）。
 *     2026-11-03 起带 `startAt`（毫秒时间戳，0 = 现在），受 `contest-virtual-start-time` 保护
 *   - cp-unofficial-rank / cp-unofficial-rank-result：网页问自己在一场里的非正式名次（见下）
 *
 * 这几个消息名是**跨仓契约**（2026-10-01 与扩展一起从 `cph-` 前缀改成 `cp-`）：
 * 改了任何一条都必须同步改 CC-for-Web 并发新版插件，否则新旧两边互相认不出、
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
 * 投递回来的每一道题必须带着**它自己那一页**的地址，否则按 url 认题的站点会把整场并成一道
 * —— 扩展侧已改（CC-for-Web，2026-10-26），旧扩展的「整场页地址」由 `retargetContestTask` 兜底改回来。
 *
 * 【cp-fill-code-saved 是 2026-10-20 加的，把代填串成一条链路】`cp-fill-code-result` 只说明
 * 「字填进输入框了」，而验证要等 Codeforces **把表单提交、服务端读完、页面跳回来**才算数 ——
 * 那个时刻网页看不见，猜一个固定延时必然两头不讨好（猜短了验不过、猜长了白转圈）。
 * 于是改成由扩展回报：它在提交那一趟跳转走完之后发 `cp-fill-code-saved`（带 `saved` 布尔，
 * 成功时顺手关掉它自己开的那个 Codeforces 标签页），网页收到就直接去验证。
 * 它是**加**出来的一条：老扩展不发，站点等不到就退回「回来点验证」那句提示（见
 * `services/cloudSession.js` 的 fillCloudCode），行为与改动前一致；判断还多一道
 * `capabilities` 里的 `fill-saved`（见 canFillSaved），老扩展下连等都不会等。
 *
 * 【cp-submit / cp-submit-status 这一组是 2026-10-23 新加的】网页请扩展把当前文件提交到
 * Codeforces，并跟到评测结果。站点自己做不到：跨源拿不到 cookies、也读不到提交页的 CSRF
 * token；而扩展本来就注入在 codeforces.com、本来就带着用户登录态 —— 与「代填验证码」是
 * 同一条信任边界：**源码由网页显式递过去，扩展只把它写进提交表单**，不读 cookie、不回传
 * 页面内容。`cp-submit-result` 只说明「提交这半步成没成 + submissionId」，之后由扩展在
 * 那个标签页里盯着 `/my` 页，verdict 每变一次发一条 `cp-submit-status`（`testing` 之后
 * 才有终态）：AC 收掉自己开的标签页，非 AC 留着并导航到提交详情页（用户要看的失败现场）。
 * 同样受 `capabilities` 的 `submit-code` 保护。
 *
 * 【比赛动作这四对是 2026-10-26 新加的（扩展 2.68.0）】P1 把 CF 比赛页的核心功能搬进站内：
 * 赛程上直接看每场能不能报名、直接报名、开一场 VP、在榜单上看见自己的非正式名次。
 * 这四件事站点**都做不到**（跨源、且报名与 VP 必须对着 CF 自己的表单发 POST），所以全交给扩展；
 * 与上面几条同一条信任边界：**只回枚举与数字，绝不回传 CF 的 cookie 或页面内容**。
 * 报名与开 VP 是**不可逆动作**，一律先弹站内确认卡片、用户点下去才调一次接口，绝不自动重放；
 * 四条都受 `capabilities` 保护（contest-schedule / contest-register / contest-virtual /
 * contest-unofficial），老扩展下这些入口压根不出现，界面与改动前一致。
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
/**
 * 是否已经探出过结论（不管探到没探到）。
 *
 * 只有**第一次**探活还悬着的时候才「不知道」，界面先按正常文案显示；
 * 已经得出过一次「没有插件」之后再重探（设置面板那颗刷新、切回来重探），
 * 结论出来前必须沿用上一轮的结论 —— 否则空态会在重探那一两秒里翻成
 * 「打开题目链接会自动抓」那句假话（2026-11-24 用户报的就是这个）。
 */
const probed = ref(false)

/** 改配置的回执超时：扩展开着通常几毫秒就回 */
const CONFIG_TIMEOUT = 1000
/**
 * 答完「要抓」之后等题目投递回来的上限。
 * 扩展侧等样例渲染最多 20s（CC-for-Web 的 autoParse.ts），再加上解析与投递，
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
 * 等扩展报「这枚码在 Codeforces 上**保存落下去了**」的上限。
 *
 * 扩展那一侧给这一趟 10s（提交之后那次整页跳转，`FILL_SAVE_TIMEOUT`），这里留 3s 余量。
 * 超时一律当「没等到」—— 界面退回改动前那句「回来点验证」，用户手动点一下照样能完成，
 * 所以宁可早一点放手，也不要让按钮一直转。
 */
const FILL_SAVED_TIMEOUT = 13000

/**
 * 等扩展回答「这个浏览器登的是不是这个 handle」的上限。
 *
 * 比代填短得多：这一问**不打开任何页面、不发任何请求**，扩展只是拿它自己存的会话缓存比一下
 * （见 CC-for-Web 的 background.ts），正常是毫秒级。留 3s 是给「service worker 刚被回收
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

/** requestId -> (saved: boolean) => void：等待扩展报「保存落下去没有」（见 waitFillSaved） */
const pendingFillSaved = new Map()

/** 结算一条「保存完成」的等待；对不上号（超时后才回来 / 这一轮已经翻篇）就丢掉 */
function settleFillSaved(requestId, saved) {
  const settle = pendingFillSaved.get(requestId)
  if (!settle) return

  pendingFillSaved.delete(requestId)
  settle(Boolean(saved))
}

/**
 * 等扩展报「这枚码已经在 Codeforces 上保存好了」（并顺手把那一页收掉）。
 *
 * **要在发请求之前挂上**：那一趟回报可能是 `ok` 之后几百毫秒就到的，等 `ok` 回来再挂
 * 就漏掉了。所以 `requestCodeFill` 里先建这个 Promise、再 postMessage。
 */
function waitFillSaved(requestId) {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      pendingFillSaved.delete(requestId)
      resolve(false)
    }, FILL_SAVED_TIMEOUT)

    pendingFillSaved.set(requestId, (saved) => {
      window.clearTimeout(timer)
      resolve(saved)
    })
  })
}

let cfCheckSeq = 0
/** requestId -> { resolve, timer }：等待扩展报「这个浏览器登的是不是这个 handle」 */
const pendingCfChecks = new Map()

let contestScrapeSeq = 0
/** requestId -> { url, resolve, timer }：等待扩展报「这一场抓完了没有」。
 *  `url` 是这一趟交给扩展的整场题面页地址，投递回来的题要靠它认领（见 retargetContestTask） */
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
        probed.value = true
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
 * 扩展能不能把代填**跑到底**：跟到 Codeforces 保存落下去，然后关掉它自己开的那个标签页、
 * 回一条 `cp-fill-code-saved`（2026-10-20 加，见文件头的说明）。
 *
 * 站点据此把「填写 → 验证 → 登录」串成一条链路（`cloudSession.js` 的 fillCloudCode）；
 * 老扩展没有这条能力，就还是「填完提示一句，验证留给用户点」。
 */
export const canFillSaved = computed(() =>
  (extensionInfo.value?.capabilities ?? []).includes('fill-saved'),
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
 * 返回 `{ ok, reason, requestId, saved }`。扩展没装 / 太旧 / 超时都在这里折成一个失败结果，
 * 不往外抛 —— 界面只需要「成功」或者「一句人话」。
 *
 * `saved` 是**另一条**等待（`cp-fill-code-saved` 那条，2026-10-20 加）：`ok` 只说明字填进了
 * 输入框，这条才说明表单提交完、Codeforces 那边真的落下去了 —— 它是「接着验证」的发令枪，
 * 也是「那个标签页已经被扩展收掉」的时刻。老扩展永远不发，于是它就是一句 13s 后的 `false`；
 * 调用方**只在 `canFillSaved` 为真时**才等它（否则白等十几秒还挡着按钮）。
 */
export function requestCodeFill(handle, code) {
  return new Promise((resolve) => {
    if (!canFillCode.value) {
      resolve({ ok: false, reason: 'unsupported', requestId: '', saved: Promise.resolve(false) })
      return
    }

    const requestId = `cp-fill-${++fillSeq}`
    // 先挂上「保存完成」这条等待，再发请求（理由见 waitFillSaved）
    const saved = waitFillSaved(requestId)
    const timer = window.setTimeout(() => {
      pendingFills.delete(requestId)
      // 连「填好没有」都没等到，就更不会有「保存完」：把那条等待一起结算掉，
      // 免得它在十几秒后回来拍一下早就翻篇的界面
      settleFillSaved(requestId, false)
      resolve({ ok: false, reason: 'timeout', requestId, saved })
    }, FILL_TIMEOUT)

    pendingFills.set(requestId, {
      resolve: (result) => {
        window.clearTimeout(timer)
        // 没填成就别留一份「保存完成」的等待悬在那儿
        if (!result.ok) settleFillSaved(requestId, false)
        resolve({ ...result, requestId, saved })
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
 * （见 CC-for-Web 的 src/cfIdentity.ts），判据与用户抬头看一眼等价。
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
 * 单独列一条而不是揉进 `fill-code`：两者管的完全是两件事。老扩展不带这条能力时，
 * 界面上的入口就不出现（P1 的样子：先落题、样例留给「打开题目页自动补」那条既有链路）。
 *
 * ⚠️ 站点这边的入口自 2026-11-13 起**封存**（比赛页那颗「抓样例」按钮撤了，见
 * useCfContest 的同名那一段）。这条能力位与 `requestContestScrape` 仍然留着 —— 它们是
 * 与浏览器扩展的协议，扩展侧照旧宣告 / 照旧能跑，恢复入口时不必动扩展。
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
      url,
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

// ------------------------------------------------------- 一键提交（2026-10-23 加）
//
// 【为什么必须走扩展】站点自己提交不了：Codeforces 的提交页要 CSRF token，跨源也读不到
// 用户的登录 cookie。扩展本来就注入在 codeforces.com、本来就带着登录态，与代填验证码
// 是同一条信任边界 —— 源码由网页显式递过去，扩展只写进表单，不读 cookie、不回传页面内容。
//
// 【提交成没成 vs 评测结果】扩展先回 `cp-submit-result`（表单提交这半步），之后在
// `/contest/{id}/my` 页面上盯新提交的 verdict，每变一次推一条 `cp-submit-status`。
// 站点这边把两件事分开等：前者决定按钮转不转圈，后者决定发哪条结果通知。

/**
 * 等扩展把「提交成没成」答回来的上限。
 *
 * 这一趟比代填重得多：可能要开一个新标签页、等加载、填表、提交、等整页跳到 `/my`、
 * 再解析出 submissionId。扩展侧每一段各有上限（开页 20s + 跳转 20s + 解析重试 5s），
 * 这里留 15s 余量。
 */
const SUBMIT_TIMEOUT = 60000

/** 一条 verdict 等待在站点这边的存活上限（扩展那边最多盯 2 分钟，这里给 5 分钟防表只增不减） */
const SUBMIT_WATCH_TIMEOUT = 5 * 60 * 1000

let submitSeq = 0
/** requestId -> { resolve, timer }：等待扩展回「提交这半步成没成」 */
const pendingSubmits = new Map()
/** requestId -> { onVerdict, timer }：提交成功之后等 verdict 变化 */
const submitWatchers = new Map()

/**
 * 扩展能不能把文件提交到 Codeforces。与 canFillCode 同一套能力协商：
 * 老扩展没有这条能力，提交按钮连出现都不出现。
 */
export const canSubmitCode = computed(() =>
  (extensionInfo.value?.capabilities ?? []).includes('submit-code'),
)

/**
 * 请扩展把当前文件提交到 Codeforces。
 *
 * @param {{url: string, source: string, language: 'cpp'|'python'}} payload
 *   `url` 是题目页地址（扩展据此算提交页）；`source` 是**编辑器里的当前正文**，
 *   不要求先存盘 —— 「一键提交」提交的就是眼前这一份。
 * @param {(status: {submissionId: string, verdict: string}) => void} [onVerdict]
 *   提交成功之后，verdict 每变一次调一次（`testing` 只是中转，终态之后不再调）。
 * @returns {Promise<{ok: boolean, reason: string, submissionId: string, verdict: string, requestId: string}>}
 *   扩展没装 / 太旧 / 超时都折成失败结果，不往外抛 —— 界面只需要「成功」或「一句人话」。
 */
export function requestSubmit({ url, source, language }, onVerdict) {
  return new Promise((resolve) => {
    if (!canSubmitCode.value || typeof source !== 'string' || !source.trim()) {
      resolve({ ok: false, reason: 'unsupported', submissionId: '', verdict: '', requestId: '' })
      return
    }

    const requestId = `cp-submit-${++submitSeq}`
    const timer = window.setTimeout(() => {
      pendingSubmits.delete(requestId)
      submitWatchers.delete(requestId)
      resolve({ ok: false, reason: 'timeout', submissionId: '', verdict: '', requestId })
    }, SUBMIT_TIMEOUT)

    pendingSubmits.set(requestId, {
      resolve: (result) => {
        window.clearTimeout(timer)
        // 提交都没成，就不会有 verdict 可等 —— 把那条等待一起收掉
        if (!result.ok) submitWatchers.delete(requestId)
        resolve({ ...result, requestId })
      },
    })

    if (typeof onVerdict === 'function') {
      const watchTimer = window.setTimeout(() => {
        submitWatchers.delete(requestId)
      }, SUBMIT_WATCH_TIMEOUT)

      submitWatchers.set(requestId, { onVerdict, timer: watchTimer })
    }

    window.postMessage(
      // `source` 这个名字已经被信封（cp-page）占了，源码那一栏改用 sourceCode
      { source: PAGE_SOURCE, type: 'cp-submit', requestId, oj: 'codeforces', url, sourceCode: source, language },
      window.location.origin,
    )
  })
}

// ------------------------------------------------------- 比赛动作（2026-10-26 加）
//
// 【四件事，一个共同前提】读赛程的报名状态、替用户报名、开一场 VP、读非正式名次 ——
// 这四件站点自己都做不到：跨源拿不到 CF 的会话，报名与开 VP 更必须对着 CF 自己的表单发 POST。
// 所以都交给扩展（CC-for-Web 2.68.0 起，见那边 src/contestActions.ts）。
//
// 【只在用户点按时发生】四条 request 都由界面上的按钮触发一次；报名与开 VP 之前还各有一张
// 确认卡片 —— 它们是不可逆的，确认之后才调接口，绝不自动重放。
//
// 【只回枚举与数字】状态枚举、原因枚举、名次数字；认不出的值在这里就被丢掉，
// 界面只有那几种形态，不该被一个新枚举撬开新分支。

/** 扩展侧回执里的报名状态枚举（跨仓契约，见 CC-for-Web 的 src/contestActions.ts） */
const REGISTRATION_STATES = ['open', 'before', 'closed', 'registered', 'count', 'unknown']

/** 等扩展读完比赛列表的上限：开页 + 加载 + 扫一遍表格 */
const CONTEST_STATES_TIMEOUT = 30000
/** 等报名 / 开 VP 的上限：开页 + 填表 + 提交后整页跳转（扩展侧每一段各有上限） */
const CONTEST_ACTION_TIMEOUT = 60000
/** 等非正式名次的上限：好友榜之外，扩展还可能现拉一次合并榜第一页 */
const CONTEST_RANK_TIMEOUT = 40000

let contestStatesSeq = 0
/** requestId -> { resolve, timer }：等待扩展回报名状态表 */
const pendingContestStates = new Map()

let contestActionSeq = 0
/** requestId -> { resolve, timer }：等待扩展回「报名 / 开 VP 成没成」 */
const pendingContestActions = new Map()

let contestRankSeq = 0
/** requestId -> { resolve, timer }：等待扩展回非正式名次 */
const pendingContestRanks = new Map()

/**
 * 扩展能不能读 /contests 列表上的报名状态。老扩展没有这条能力，赛程上就不出现那一列 ——
 * 与其摆一列永远「—」，不如让整列不存在。
 */
export const canReadContestStates = computed(() =>
  (extensionInfo.value?.capabilities ?? []).includes('contest-schedule'),
)

/** 能不能替用户报名。没有这条能力就不出现报名按钮（P1 之前只有「在 CF 打开」） */
export const canRegisterContest = computed(() =>
  (extensionInfo.value?.capabilities ?? []).includes('contest-register'),
)

/**
 * 报名时能不能选「不计分」（2026-10-30 加，扩展 2.69.0 起）。
 *
 * 【为什么要单独一条能力】CF 只对允许 unrated 的轮次在报名表单里放那颗控件，能不能拨得动
 * 只有扩展知道；老扩展收到 `unrated` 也不认识，会照旧按计分提交 —— 那等于把「不计分」这个
 * 选择悄悄吃掉。所以站点先看能力位，没有就整行选择不出现，与改动前一模一样。
 */
export const canRegisterUnrated = computed(() =>
  (extensionInfo.value?.capabilities ?? []).includes('contest-register-unrated'),
)

/** 能不能替用户开一场 VP。与报名**分开列**：两条能力互不蕴含，站点不必替扩展猜 */
export const canStartVirtual = computed(() =>
  (extensionInfo.value?.capabilities ?? []).includes('contest-virtual'),
)

/**
 * 开 VP 时能不能指定开始时刻（2026-11-03 加，扩展 2.70.0 起）。
 *
 * 【为什么要单独一条能力】老扩展收到 `startAt` 也不认识，会按「现在开始」提交 ——
 * 那等于把用户选的时间悄悄吃掉。所以站点先看能力位，没有就整行时间选择不出现，
 * 行为与改动前一模一样。
 */
export const canStartVirtualAt = computed(() =>
  (extensionInfo.value?.capabilities ?? []).includes('contest-virtual-start-time'),
)

/** 能不能读非正式名次。没有这条就退回 P0 的口径：榜单只画官方参赛者 */
export const canReadUnofficialRank = computed(() =>
  (extensionInfo.value?.capabilities ?? []).includes('contest-unofficial'),
)

/**
 * 非正式名次回包里有没有「一整行」（分数 + 每题格）。
 *
 * 【为什么要单独一条能力】最初的 `contest-unofficial` 只回 handle / 名次 / 是否非正式；
 * 2026-11-03 起扩展多回 `score` 与 `cells`，站点才能把 VP 那一行并进榜表格里看。
 * 老扩展没有这一条就退回改动前的样子：只显示名次那句话，不画行、也不留空格子。
 */
export const canReadUnofficialRow = computed(() =>
  (extensionInfo.value?.capabilities ?? []).includes('contest-unofficial-row'),
)

/**
 * 读 /contests 列表上每一场的报名状态。
 *
 * 返回 `{ ok, reason, states }`，`states` 是 `{ [contestId]: 枚举 }`：
 * `open` / `before` / `closed` / `registered` / `count` / `unknown`。
 * 扩展只读列表第一页 —— 没出现在里面的场次没有条目，界面按「—」显示。
 */
export function requestContestStates() {
  return new Promise((resolve) => {
    if (!canReadContestStates.value) {
      resolve({ ok: false, reason: 'unsupported', states: {} })
      return
    }

    const requestId = `cp-states-${++contestStatesSeq}`
    const timer = window.setTimeout(() => {
      pendingContestStates.delete(requestId)
      resolve({ ok: false, reason: 'timeout', states: {} })
    }, CONTEST_STATES_TIMEOUT)

    pendingContestStates.set(requestId, {
      resolve: (result) => {
        window.clearTimeout(timer)
        resolve(result)
      },
    })

    window.postMessage(
      { source: PAGE_SOURCE, type: 'cp-contest-states', requestId },
      window.location.origin,
    )
  })
}

/**
 * 替用户报名 / 开一场 VP。
 *
 * 这是**两个不可逆动作**，所以合成一个函数、共用一套等待表：调用一次 = 扩展上 CF 提交一次
 * 表单，没有撤销。界面那边必须先在确认卡片上问一句再调这里（见 CfContestSchedule）。
 *
 * `options.unrated`（2026-10-30 加）只对「报名」有意义：true = 请扩展按不计分报。
 * 受 `canRegisterUnrated` 保护 —— 老扩展不认识这个字段，别把选择发过去当没看见。
 * 这一场若没有不计分选项，扩展会回 `unrated-unavailable`，报名**没有发生**。
 *
 * `options.startAt`（2026-11-03 加）只对「开 VP」有意义：毫秒时间戳 = 虚拟参赛的开始时刻。
 * 受 `canStartVirtualAt` 保护，理由同上；缺省 / 0 = 扩展按「现在开始」提交。
 */
export function requestContestEntry(contestId, kind, options = {}) {
  return new Promise((resolve) => {
    const type = kind === 'virtual' ? 'cp-start-virtual' : 'cp-register'
    const capability = kind === 'virtual' ? canStartVirtual : canRegisterContest
    const unrated =
      kind === 'register' && options.unrated === true && canRegisterUnrated.value
    const startAt =
      kind === 'virtual' &&
      Number.isFinite(options.startAt) &&
      options.startAt > 0 &&
      canStartVirtualAt.value
        ? Math.round(options.startAt)
        : 0

    if (!capability.value || !contestId) {
      resolve({ ok: false, reason: 'unsupported' })
      return
    }

    const requestId = `cp-entry-${++contestActionSeq}`
    const timer = window.setTimeout(() => {
      pendingContestActions.delete(requestId)
      resolve({ ok: false, reason: 'timeout' })
    }, CONTEST_ACTION_TIMEOUT)

    pendingContestActions.set(requestId, {
      resolve: (result) => {
        window.clearTimeout(timer)
        resolve(result)
      },
    })

    window.postMessage(
      { source: PAGE_SOURCE, type, requestId, contestId: String(contestId), unrated, startAt },
      window.location.origin,
    )
  })
}

/**
 * 读这一场里这些 handle 的非正式名次（含 VP）。
 *
 * 返回 `{ ok, reason, source, ranks }`；`ranks` 是 `[{ handle, rank, unofficial }]`。
 * `source` 说明名次是从哪一页读到的：`friends`（好友榜，一页拿全）或 `page1`
 * （合并榜第一页兜底，只覆盖第一页）。两者名次口径相同，都是总榜名次。
 */
export function requestUnofficialRank(contestId, handles) {
  return new Promise((resolve) => {
    const list = Array.isArray(handles)
      ? handles.filter((handle) => typeof handle === 'string' && handle.trim().length > 0)
      : []

    if (!canReadUnofficialRank.value || !contestId || list.length === 0) {
      resolve({ ok: false, reason: 'unsupported', source: '', ranks: [] })
      return
    }

    const requestId = `cp-rank-${++contestRankSeq}`
    const timer = window.setTimeout(() => {
      pendingContestRanks.delete(requestId)
      resolve({ ok: false, reason: 'timeout', source: '', ranks: [] })
    }, CONTEST_RANK_TIMEOUT)

    pendingContestRanks.set(requestId, {
      resolve: (result) => {
        window.clearTimeout(timer)
        resolve(result)
      },
    })

    window.postMessage(
      { source: PAGE_SOURCE, type: 'cp-unofficial-rank', requestId, contestId: String(contestId), handles: list },
      window.location.origin,
    )
  })
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

/**
 * 整场抓取投递回来的题：把地址从「整场题面页」改回**这道题自己那一页**。
 *
 * 【为什么必须有这一步】扩展读的是 `/contest/{id}/problems` 这一页，七八道题的题面同在那
 * 一页里；2.67.4 及以前的扩展把**这一页的地址**当成每道题的 url 一起投回来（2026-10-26 实测，
 * 三条投递的 url 一模一样）。而站点这边按 url 认题（见 problemImport 的 findByUrl），于是：
 * 整场被并成同一道题、后一道的样例覆盖前一道；真正该收样例的那七八个文件一个字节都拿不到。
 * 扩展侧已改（CC-for-Web，按 `.problemindexholder[problemindex]` 指回各自那一页），
 * 这里留一条兜底，让还没更新的插件不至于静默写坏工作区。
 *
 * 只认「题名以题号打头」这一种（扩展给的 name 就是 `A. Theatre Square` 这种形状）；
 * 认不出来就原样放行 —— 宁可多出一个文件，也不要猜错题把样例写到别人头上。
 */
function retargetContestTask(task) {
  const url = typeof task?.url === 'string' ? task.url : ''
  const key = url ? problemUrlKey(url) : ''
  if (!key) return

  // 只在「有整场抓取正在跑、而且这条投递的地址正是那一趟的整场页」时动手
  let pageUrl = ''
  for (const pending of pendingContestScrapes.values()) {
    if (pending.url && problemUrlKey(pending.url) === key) {
      pageUrl = pending.url
      break
    }
  }
  if (!pageUrl) return

  const index = /^([A-Z]\d*)\./.exec(String(task.name ?? '').trim())?.[1]
  if (!index) return

  task.url = `${pageUrl.split('?')[0].replace(/\/problems$/, '')}/problem/${index}`
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

  retargetContestTask(task)

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

  // 扩展报「这枚码在 Codeforces 上保存落下去没有」（代填收尾那一趟）：按 requestId 结算
  // 上面那条等待。这一步同时意味着「那个标签页已经收掉了」，所以调用方收到就可以直接验证
  if (data.type === 'cp-fill-code-saved') {
    settleFillSaved(data.requestId, data.saved === true)
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

  // 扩展回「提交成没成」（cp-submit 的回执）：按 requestId 认领
  if (data.type === 'cp-submit-result') {
    const pending = pendingSubmits.get(data.requestId)
    if (!pending) return

    pendingSubmits.delete(data.requestId)
    pending.resolve({
      ok: data.ok === true,
      reason: typeof data.reason === 'string' ? data.reason : '',
      submissionId: typeof data.submissionId === 'string' ? data.submissionId : '',
      verdict: typeof data.verdict === 'string' ? data.verdict : '',
    })
    return
  }

  // 扩展推「这次提交的评测状态变了」：只往 onVerdict 转，不动按钮状态
  if (data.type === 'cp-submit-status') {
    const watcher = submitWatchers.get(data.requestId)
    if (!watcher) return

    const verdict = typeof data.verdict === 'string' ? data.verdict : ''
    if (!verdict) return

    watcher.onVerdict({
      submissionId: typeof data.submissionId === 'string' ? data.submissionId : '',
      verdict,
    })

    // testing 之外都是终态：收掉等待，让扩展之后即使再发也不再处理
    if (verdict !== 'testing') {
      window.clearTimeout(watcher.timer)
      submitWatchers.delete(data.requestId)
    }
    return
  }

  // 扩展回「比赛列表的报名状态」（cp-contest-states 的回执）：按 requestId 认领。
  // 认不出的状态值一律丢掉 —— 界面只有那六种形态，不该被一个新枚举撬开第七种
  if (data.type === 'cp-contest-states-result') {
    const pending = pendingContestStates.get(data.requestId)
    if (!pending) return

    pendingContestStates.delete(data.requestId)

    const states = {}
    if (data.states && typeof data.states === 'object') {
      for (const [id, state] of Object.entries(data.states)) {
        if (REGISTRATION_STATES.includes(state)) states[id] = state
      }
    }

    // 同一个回包顺带捎回「Recent virt. contests」（2026-11-03 加）：只认数字 id + 正数开始时刻，
    // 名字只管显示，其余字段一律不进账本（见 services/cfVirtualContest.js）
    const virtuals = Array.isArray(data.virtuals)
      ? data.virtuals.flatMap((entry) => {
          const id = String(entry?.id ?? '')
          const startMs = Number(entry?.startMs)
          if (!/^\d+$/.test(id) || !Number.isFinite(startMs) || startMs <= 0) return []
          return [{ id, name: typeof entry.name === 'string' ? entry.name : '', startMs }]
        })
      : []

    pending.resolve({
      ok: data.ok === true,
      reason: typeof data.reason === 'string' ? data.reason : '',
      states,
      virtuals,
    })
    return
  }

  // 扩展回「报名 / 开 VP 成没成」：两条消息共用一个等待表，reason 是唯一的信息
  if (data.type === 'cp-register-result' || data.type === 'cp-start-virtual-result') {
    const pending = pendingContestActions.get(data.requestId)
    if (!pending) return

    pendingContestActions.delete(data.requestId)
    pending.resolve({
      ok: data.ok === true,
      reason: typeof data.reason === 'string' ? data.reason : '',
    })
    return
  }

  // 扩展回「非正式名次」：只认形状完整的条目（handle 字符串 + 正数名次），脏的一条都别进界面
  if (data.type === 'cp-unofficial-rank-result') {
    const pending = pendingContestRanks.get(data.requestId)
    if (!pending) return

    pendingContestRanks.delete(data.requestId)

    const ranks = Array.isArray(data.ranks)
      ? data.ranks
          .filter(
            (entry) =>
              entry &&
              typeof entry.handle === 'string' &&
              typeof entry.rank === 'number' &&
              Number.isFinite(entry.rank) &&
              entry.rank > 0,
          )
          .map((entry) => {
            // 分数与题格是 2026-11-03 加的（capability `contest-unofficial-row`）：
            // 题号键只认 `A` / `B1` 这类；文字只当显示用，截到 40 字防脏数据撑破表格
            const cells = {}
            if (entry.cells && typeof entry.cells === 'object') {
              for (const [index, text] of Object.entries(entry.cells)) {
                if (/^[A-Z]\d{0,2}$/.test(index) && typeof text === 'string' && text) {
                  cells[index] = text.slice(0, 40)
                }
              }
            }
            return {
              handle: entry.handle,
              rank: entry.rank,
              unofficial: entry.unofficial === true,
              score: typeof entry.score === 'string' ? entry.score.slice(0, 40) : '',
              cells,
            }
          })
      : []

    pending.resolve({
      ok: data.ok === true,
      reason: typeof data.reason === 'string' ? data.reason : '',
      // 回包里这一页叫 `rankSource`：`source` 是信封自己的标记（'competitive-companion'），
      // 同名会被展开覆盖，整条消息会被 onMessage 丢掉（2026-10-27 实测过，名次一直等到超时）
      source: data.rankSource === 'friends' || data.rankSource === 'page1' ? data.rankSource : '',
      ranks,
    })
    return
  }

  if (data.type !== 'cp-info') return
  // 只认自己那一轮的握手回包（页面里可能有其它脚本也在 postMessage）
  if (data.requestId !== currentRequestId) return

  clearPingTimers()
  checking.value = false
  probed.value = true
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
    probed,
    refresh: refreshExtensionInfo,
    setExtensionConfig,
    canFillCode,
    canFillSaved,
    requestCodeFill,
    canCheckCf,
    checkCfIdentity,
    canSubmitCode,
    requestSubmit,
    canReadContestStates,
    canRegisterContest,
    canRegisterUnrated,
    canStartVirtual,
    canReadUnofficialRank,
    canReadUnofficialRow,
    requestContestStates,
    requestContestEntry,
    requestUnofficialRank,
  }
}
