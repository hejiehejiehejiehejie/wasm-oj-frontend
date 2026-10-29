/**
 * cfStartReminder —— 站内报名成功的比赛，开赛前的提醒（2026-10-30）。
 *
 * 【链路】报名成功（CfContestSchedule 的 submitEntry，kind === 'register'）→
 * `recordRegisteredContest()` 记下 id / 名字 / 开赛时刻并落 localStorage →
 * 到 **T-10 分钟**弹一条常驻通知：标题「十分钟后开赛」，带一行活倒计时
 * （notifications 的 countdown，每秒重算剩余、到点那行转「已开赛」），
 * 以及一颗「开始比赛」→ `startRequest` 置上比赛 id → CfCodeforcesPanel 的 watch
 * 接住：切到 Codeforces 页签的比赛模式、载入这场、整场导入、打开第一题
 * （自动导入在 useCfContest.importAllAndOpenFirst）。
 *
 * 【为什么记在服务里而不是赛程组件里】定时器与存档都活不过组件：
 * 报名几天后才开赛，中途刷新 / 重开站点是常态。所以数据落 `cp.cfRegisteredContests`
 * （本机事实，不进云同步白名单，见 storageNames.js），本模块被 main.js import 即执行
 * —— 启动时扫一遍存档：没到 T-10 的补排定时器，已在窗口内 / 已开赛的立刻补弹。
 *
 * 【会话内去重（2026-10-30 用户口径）】同一场比赛本次会话只弹一次：通知被关掉
 * （或点过开始）之后，刷新前的剩余时间里不再弹；重开站点（新会话）比赛还在进行中
 * 则再弹一次 —— 那是用户自己把「要不要打」的决定权要回来的机会。
 *
 * 【为什么不等赛程列表】提醒的时刻在**报名那一刻**就已知（列表里的
 * startTimeSeconds），到点弹窗不需要任何网络请求；提前一天挂一只 setTimeout
 * 比轮询列表便宜得多。标签页被节流只影响定时器精度，通知的倒计时行每秒用
 * `Date.now()` 现算（见 notifications.js 文件头），读数不会漂。
 */
import { ref } from 'vue'

import { formatDuration } from '../cf/contest.js'
import { t } from '../i18n/index.js'
import { notify } from './notifications.js'
import { CF_REGISTERED_CONTESTS_KEY } from './storageNames.js'

/** 开赛前多少分钟提醒 */
const LEAD_MS = 10 * 60 * 1000

/**
 * 已结束多久之后的记录从存档里清掉。留这段宽限是给「比赛刚结束就重开站点」的
 * 场次一个体面的退场：没到宽限线就还在 `reminded` 的语义里（本会话弹不弹看它），
 * 过了线记录就没意义了 —— 存档不该越攒越多。
 */
const KEEP_AFTER_END_MS = 24 * 60 * 60 * 1000

/** setTimeout 的上限（2^31-1 ms ≈ 24.8 天）。CF 的赛程不会排到那么远，纯防御 */
const TIMER_CAP_MS = 2 ** 31 - 1

/**
 * 待「开始比赛」的比赛 id（空串 = 没有）。CfCodeforcesPanel 的 watch 消费后置回空串。
 * 放服务层是因为通知的按钮回调活得比任何组件的局部作用域都久 —— 通知点下那一刻
 * 组件肯定在（常驻挂载），但回调闭包里能拿到的只有这一条中转站。
 */
export const startRequest = ref('')

/** 本会话已经弹过（或点过开始）的比赛 id —— 会话内去重的唯一依据 */
const reminded = new Set()

/** 读存档。存档是用户能手改的地方，解析失败 / 不是数组就当没有 */
function readEntries() {
  try {
    const raw = window.localStorage.getItem(CF_REGISTERED_CONTESTS_KEY)
    const parsed = raw === null ? [] : JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((entry) => entry && typeof entry === 'object') : []
  } catch {
    return []
  }
}

function writeEntries(entries) {
  try {
    window.localStorage.setItem(CF_REGISTERED_CONTESTS_KEY, JSON.stringify(entries))
  } catch {
    /* 隐私模式 / 配额满：这一场的提醒就没有了，报名流程本身不受影响 */
  }
}

/** 清掉已结束超过宽限线的记录，返回剩下的（原顺序） */
function pruneEntries(entries) {
  const line = Date.now() - KEEP_AFTER_END_MS
  return entries.filter((entry) => Number(entry?.startMs) + Number(entry?.durationMs) > line)
}

/**
 * 到点（或启动时已在窗口内）弹提醒。真正的出口只有一个 notify()：
 * - 已开赛的标题换成「正在进行」，倒计时行由 countdown 的 expiredText 接管；
 * - duration 0 = 常驻：开赛在即，什么时候打该由用户决定，关掉即是「本会话不再弹」。
 */
function showReminder(entry) {
  if (reminded.has(entry.id)) return
  if (Date.now() > Number(entry.startMs) + Number(entry.durationMs)) return

  reminded.add(entry.id)
  notify({
    type: 'info',
    title: t(
      Date.now() >= entry.startMs
        ? 'cf.contest.schedule.remindLiveTitle'
        : 'cf.contest.schedule.remindTitle',
      { name: entry.name },
    ),
    duration: 0,
    tag: `cf-start:${entry.id}`,
    countdown: {
      deadline: entry.startMs,
      text: (remainingMs) =>
        t('cf.contest.schedule.remindCountdown', { time: formatDuration(remainingMs) }),
      expiredText: () => t('cf.contest.schedule.remindStarted'),
    },
    actions: [
      {
        label: t('cf.contest.schedule.startAction'),
        run: () => {
          startRequest.value = entry.id
        },
      },
    ],
  })
}

/** 补排一场的提醒：没到 T-10 就挂定时器，已在窗口内 / 已开赛的立刻补弹 */
function scheduleEntry(entry) {
  const delay = Number(entry.startMs) - LEAD_MS - Date.now()
  if (delay <= 0) {
    showReminder(entry)
    return
  }
  window.setTimeout(() => showReminder(entry), Math.min(delay, TIMER_CAP_MS))
}

/**
 * 报名成功那一刻记一笔（CfContestSchedule 在 submitEntry 成功后调）。
 *
 * 只认「开赛时刻在后未来」的场次：时间字段缺失（列表偶尔没有 startTimeSeconds）或
 * 已经开赛的，记了也没法按时刻提醒，静默跳过 —— 报名成功的通知照发，只是没有 T-10。
 * 同一场重复报名（理论上报过就报不进）按 id 去重，旧记录让位。
 *
 * @param {{id: number|string, name?: string, startTimeSeconds?: number, durationSeconds?: number}} contest
 *   赛程列表里的那一场（点报名时手上就有，不必再查）
 */
export function recordRegisteredContest(contest) {
  const id = String(contest?.id ?? '')
  const startMs = Number(contest?.startTimeSeconds) * 1000
  if (!id || !Number.isFinite(startMs) || startMs <= Date.now()) return

  const entry = {
    id,
    name: String(contest?.name || ''),
    startMs,
    durationMs: Math.max(0, Number(contest?.durationSeconds) || 0) * 1000,
  }

  const entries = pruneEntries(readEntries()).filter((item) => item.id !== id)
  entries.push(entry)
  writeEntries(entries)
  scheduleEntry(entry)
}

// 启动扫描（main.js import 本模块即执行）：清一遍存档，把还活着的场次重新排上。
// 定时器活不过刷新，而报名到开赛之间隔几天是常态 —— 这里是提醒不丢的关键。
const allEntries = readEntries()
const startup = pruneEntries(allEntries)
if (startup.length !== allEntries.length) writeEntries(startup)
for (const entry of startup) scheduleEntry(entry)
