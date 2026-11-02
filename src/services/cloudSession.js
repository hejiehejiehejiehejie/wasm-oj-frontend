/**
 * cloudSession —— 云同步那套「会话状态」：用户名 / 验证码 / 忙不忙 / 提示与报错，
 * 以及取码、登录、验证这几个动作。
 *
 * 【为什么从 `EditorSettingsPanel.vue` 搬出来】2026-10-11 起齿轮菜单要在自己的二级菜单里
 * 直接做导入与登录（填用户名 → 取码 → 验证），面板与菜单必须操作**同一份**状态：两份 ref
 * 必然走偏 —— 一边取了码另一边看不见，一边在忙另一边按钮还亮着。这里是单一真相，
 * 面板与菜单都只是消费方。
 *
 * 【持久化的只有账号与令牌】其余（用户名框 / 验证码 / 报错）都是一次会话里的临时状态：
 * 验证码 10 分钟就该过期，用户名框留着下次打开反而是「上次填了一半」的噪音。
 * 账号与令牌**按 HANDOFF 第 5 节坑 36 的规矩自己读写 localStorage**：这里是服务层模块，
 * 没有组件实例，`usePersistentRef` 那份靠 `onMounted` 落首值的机制不会执行。
 *
 * 【文案】报错一律 `t()` —— 服务层里不许出现中文字面量，与别处同一条 i18n 纪律。
 * 只在函数体内调用（模块顶层调 `t()` 会把语言冻结在第一帧，见 i18n/index.js）。
 */
import { computed, ref, watch } from 'vue'
import { flush } from './autoSave.js'
import {
  canCheckCf,
  canFillCode,
  canFillSaved,
  checkCfIdentity,
  requestCodeFill,
} from '../composables/useCompanionBridge.js'
import {
  applyProfile,
  collectProfile,
  fetchCloudProfile,
  requestCode,
  saveWithToken,
  verifyAndSave,
} from './cloudProfile.js'
import { forgetActiveProfile, writeActiveProfile, writeCloudEntryPath } from './cloudEntry.js'
import { dismissByTag, notify, notifyAfterReload, updateNotification } from './notifications.js'
import { CLOUD_ACCOUNT_KEY, CLOUD_TOKEN_KEY } from './storageNames.js'
import { t } from '../i18n/index.js'

/** 读一个 JSON 存档；认不出来就退回默认值（存档是用户能手改的地方，别拿垃圾去拼接口） */
function readStored(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null) return fallback
    const parsed = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object') return fallback
    return parsed
  } catch {
    return fallback
  }
}

/**
 * 读一个 JSON **字符串**存档。设备令牌落盘的是字符串（persist 直接 stringify 它），
 * 不能走上面那份 readStored —— 那里的 `typeof parsed !== 'object'` 守卫会把字符串
 * 当垃圾退回空值，令牌就会在每次刷新后凭空消失（2026-10-25 修：表现为每次上传都要
 * 重新取码验证，本会话内正常、重开页面必复发，正是这条守卫的指纹）。
 */
function readStoredString(key) {
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null) return ''
    const parsed = JSON.parse(raw)
    return typeof parsed === 'string' ? parsed : ''
  } catch {
    return ''
  }
}

/**
 * Codeforces「个人资料 › Social」一页的地址 —— 验证码要填进那页的 Last name。
 * 面板与菜单的说明文字里各有一条指向它的链接，通知上「跳转到网页」那颗按钮也去同一处，
 * 所以收成一份常量，别在三个地方各写一遍字面量。
 */
export const CF_SOCIAL_URL = 'https://codeforces.com/settings/social'

/** 成功类通知的停留时长：与「图片已复制」同一档，看一眼就走 */
const SUCCESS_NOTICE_MS = 5000

/** 等待验证那条通知的 tag：取到码发一条、码没了整组收（见下面那个 watch） */
const CODE_NOTICE_TAG = 'cloud:code'

/**
 * 当下那条「等待验证」通知的 id（0 = 没发过 / 已收）。
 * 只在过期那一刻用它 `updateNotification` 把那颗「验证」换成「重新取码」——
 * 换按钮不新发通知，位置与进场动画都不动（见 notifications.js 的那条契约）。
 */
let codeNoticeId = 0

/**
 * 验证码有效期：**必须与 i18n 里那句 codeHint（10 分钟）和后端一致**。
 * 通知就用它当停留时长 —— 码什么时候作废，通知就什么时候走。
 */
const CODE_TTL_MS = 10 * 60 * 1000

/**
 * 「导入 / 登录成功」两条通知的词条（顺序：标题、正文）。标题与正文分开收，
 * 是为了让这里只剩一张表、调用方只看 kind 一个参数（见 adoptCloud）。
 */
const CLOUD_NOTICES = {
  import: ['notifications.cloud.importedTitle', 'notifications.cloud.importedBody'],
  login: ['notifications.cloud.loggedInTitle', 'notifications.cloud.loggedInBody'],
}

function persist(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 配额满 / 隐私模式：这次没记住，功能照走，只是下次要重新验证 */
  }
}

/**
 * 绑定的账号（用户名 + 云端最近更新时间）。只留在本机：它是「**这台设备**绑的是谁」的事实，
 * 换台设备要重新验证，所以不进 cloudProfile 的同步白名单。handle 为空串 = 未绑定。
 */
const storedAccount = readStored(CLOUD_ACCOUNT_KEY, {})
export const cloudAccount = ref({
  handle: typeof storedAccount.handle === 'string' ? storedAccount.handle : '',
  updatedAt: typeof storedAccount.updatedAt === 'string' ? storedAccount.updatedAt : '',
})
watch(cloudAccount, (value) => persist(CLOUD_ACCOUNT_KEY, value), { immediate: true, deep: true })

/**
 * 设备令牌：/verify-save 验证成功时由服务端签发，之后的写入走 /api/save，不必再让用户去改
 * 一遍 Codeforces 的 Last name —— 这就是它存在的唯一理由。与账号一样只留在本机，且**绝不进
 * 同步白名单**：令牌与 handle 一对一，同步过去等于把别的设备的写入权也搬过来。
 */
export const cloudToken = ref(readStoredString(CLOUD_TOKEN_KEY))
watch(cloudToken, (value) => persist(CLOUD_TOKEN_KEY, value), { immediate: true })

// ---------------------------------------------------------------- 一次会话里的临时状态
/** 用户名框 */
export const handleInput = ref('')
/** 取过码、还没验证通过的那一次「待办」：它是取码用的用户名（已绑定时就是绑定的那个） */
export const pendingHandle = ref('')
/** 验证码；非空就表示「验证那一步正开着」（面板与菜单都据此换形态） */
export const code = ref('')
/** 验证码面板的用途：'login' 只证明身份（不碰云端）、'upload' 用本机覆盖云端 */
export const codeMode = ref('login')
export const busy = ref(false)
export const error = ref('')
export const notice = ref('')
/**
 * 登录验证时回写的「云端原文」，以及它的更新时间。
 * 回写会把服务端的 updatedAt 顶成此刻，可那不是「用户改了配置」，显示它只会误导，
 * 所以绑定时记的是这份读到的旧时间。
 */
export const remoteProfile = ref(null)
export const remoteUpdatedAt = ref('')

export function clearCloudFeedback() {
  error.value = ''
  notice.value = ''
}

/**
 * 服务端返回的中文 msg（验证码错了 / 太频繁）原样显示。
 * 没有 msg 就说明请求压根没走到服务端，用本地文案兜底 —— 这里要区分两种情形，
 * 否则用户只能看到一句「网络有问题」，既不知道是断网还是请求被谁拦下了。
 */
export function cloudFailure(result) {
  if (result.msg) return result.msg
  if (result.transport === 'badBody') {
    return t('settings.cloud.errorBadBody', { status: result.status })
  }
  return t('settings.cloud.errorNetwork')
}

/**
 * 取码。同一个函数服务两处入口：未绑定时传输入框的值，已绑定时传已绑定的用户名。
 * （导入的 `requestCode` 是 cloudProfile 那个，本函数叫 requestCloudCode，别混。）
 *
 * @returns {Promise<boolean>} 是否真的拿到了一枚新码 —— `refreshCloudCode` 靠它分辨
 *   「换了一枚」与「被限流 / 断网，什么都没变」，后者不能把通知的倒计时重置成 10 分钟。
 */
export async function requestCloudCode(handle) {
  if (busy.value) return false
  const target = handle.trim()
  clearCloudFeedback()
  if (!target) {
    error.value = t('settings.cloud.errorHandle')
    return false
  }
  busy.value = true
  const result = await requestCode(target)
  busy.value = false
  if (!result.success) {
    error.value = cloudFailure(result)
    return false
  }
  pendingHandle.value = target
  code.value = result.code
  // 新码上台，倒计时跟着重头开始（不能只靠 watch(code)：万一同一个值再来一次就漏了）
  startCodeTimer()
  // 新码上台，「已复制」得跟着归零：那三个字现在指的已经不是屏幕上这一枚了
  resetCodeCopied()
  // 换了码就是新的一轮：先丢掉上一轮的结论，再问一次「这台浏览器登的是不是他」
  cloudCfStatus.value = 'unknown'
  refreshCfStatus()
  return true
}

export function cancelCloudCode() {
  code.value = ''
  pendingHandle.value = ''
  resetCodeCopied()
  // 这一轮结束了，别把它的结论留给下一轮
  cloudCfStatus.value = 'unknown'
  clearCloudFeedback()
}

// ------------------------------------------------- 验证码倒计时（2026-10-19 加）
//
// 服务端给这枚码的 TTL 就是 CODE_TTL_MS（KV 600s，见 docs/云端同步服务.md），而这一步的
// 主战场在**另一个网站**：用户得在 Codeforces 上把码填进 Last name、点保存、再回来。
// 那边折腾多久这边都得看得见还剩多少 —— 否则只会在点「验证」时撞回一句「验证码已过期或
// 未获取」，分不清是码过期了还是自己填错了。
//
// 起点取「收到码的那一刻」，不是服务端签发时刻：客户端拿不到签发时间，而网络延迟那一秒
// 吃不掉整分钟 —— 宁可晚一丁点判过期，也别把还活着的码提前判死。
//
// 剩余量每次都拿 Date.now() 重算、绝不累减：后台标签页 / 移动端的 interval 会被节流到
// 一分钟一次甚至冻住，累减出来的读数会比真实时间慢一大截（回来一看还写着 8:30）。

/** 到期时刻（`Date.now()` 口径）；0 = 当前没有在计时的码 */
export const codeDeadline = ref(0)
/** 剩余毫秒（随滴答更新；0 = 已过期或没在计时） */
export const codeRemainMs = ref(0)

let codeTickTimer = 0

function stopCodeTimer() {
  if (codeTickTimer) window.clearInterval(codeTickTimer)
  codeTickTimer = 0
  codeDeadline.value = 0
  codeRemainMs.value = 0
}

function tickCodeTimer() {
  const remain = codeDeadline.value - Date.now()
  if (remain > 0) {
    codeRemainMs.value = remain
    return
  }
  // 到点：把 deadline 也收掉，`codeCountdown` 据此翻成「已过期」
  stopCodeTimer()
}

function startCodeTimer() {
  stopCodeTimer()
  codeDeadline.value = Date.now() + CODE_TTL_MS
  codeRemainMs.value = CODE_TTL_MS
  codeTickTimer = window.setInterval(tickCodeTimer, 1000)
}

// 切回前台时立刻对一次表：后台标签页里没人给我们滴答，靠它自己醒过来会先显示一帧旧读数
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (codeTickTimer && document.visibilityState === 'visible') tickCodeTimer()
  })
}

/** `mm:ss`，向上取整 —— 还剩 0.4s 时写 0:01，别在码还活着的时候先亮 0:00 */
function formatRemain(ms) {
  const total = Math.ceil(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/**
 * 面板与齿轮菜单共用的一份倒计时文案（与 `cloudCfHint` 同一个写法：只回 key / params，
 * 让调用方在模板里 `t()` —— 语言一换，模板自己会重算）。
 *
 * `expired` 同时是「要不要把那颗『验证』换成『重新取码』」的判据：码都没了还留着验证按钮，
 * 只会把用户送去服务端换一句「已过期」。
 */
export const codeCountdown = computed(() => {
  if (!code.value) return { expired: false, key: '', params: {} }
  if (codeRemainMs.value <= 0) {
    return { expired: true, key: 'settings.cloud.codeExpired', params: {} }
  }
  return {
    expired: false,
    key: 'settings.cloud.codeCountdown',
    params: { time: formatRemain(codeRemainMs.value) },
  }
})

/**
 * 过期后重取一枚。服务端每发一枚新码就让上一枚立刻作废，所以这颗只在**过期之后**顶替
 * 「验证」出现（用户主动换码仍走「取消 → 重新登录」那条既有路径）。
 * 取码本身受频率限制（同一 handle 10 分钟 5 次），被限流时错误照常显示在这一栏里。
 *
 * 拿到新码后通知一般由 `watch(code)` 重建；**只有「同一个码值又来一次」时它不响**
 * （概率极低，但 mock 与真撞上都一样），那时通知会一直停在「已过期」上 ——
 * 所以这里补一次原地刷新，别让界面说的和实际状态不一致。
 */
export async function refreshCloudCode() {
  if (busy.value || !pendingHandle.value) return
  const previous = code.value
  const refreshed = await requestCloudCode(pendingHandle.value)
  if (refreshed && code.value === previous) refreshCodeNotice()
}

// ------------------------------------------------- 取码那一步的通知（2026-10-12 加）
//
// 为什么要有这条通知：验证码这一步的**主战场在另一个网站**（把码填进 Codeforces 的
// Last name）。用户离开本站、关掉设置页签、或者干脆是从齿轮菜单点的登录（菜单一收，
// 内联 UI 就没了），回头就找不到那枚码和那几颗按钮了。通知跟着编辑区走，够得着。

/**
 * 「跳转到网页」：新页签打开 Codeforces 的个人资料页（Last name 就在那一页）。
 * 与面板 / 菜单里那条说明中的链接同一个地址（CF_SOCIAL_URL），只是那两处是现成的
 * `<a>`，通知这边只有按钮，所以自己开一次；`noopener,noreferrer` 与
 * extensionPackage.js 的 openExtensionStore 同款。
 */
export function openCfProfileSettings() {
  window.open(CF_SOCIAL_URL, '_blank', 'noopener,noreferrer')
}

/**
 * 等待验证那条通知：取到码就发一条，五颗按钮 ——
 *   验证 / 一键填写（**只在装了带 fill-code 能力的扩展时出现**）/ 复制验证码 / 跳转到网页 / 取消。
 * 前四颗都是「还得再来一下」的动作（复制完往往还要跳转、跳转完还要回来点验证），
 * 所以都带 `keep: true` 不退场；「取消」那颗点了就结束这一轮（它会清掉 code，
 * 下面那个 watch 顺手把通知收掉）。
 *
 * **「一键填写」那颗在链路版下叫「填写并登录」（2026-10-20）**：扩展能回报「保存完了」时，
 * 它点下去会把验证也一起做完（见 fillCodeChained / fillCloudCode）。改的只是标签，
 * 动作仍是同一个 `fillCloudCode`。
 *
 * **「验证」那颗（2026-10-19 加）也是 `keep: true`**：验证成功会清空 `code`，watch 顺势收掉整条；
 * 失败则不清（见上），通知留在场上正好接着重试 —— 与面板上那颗的行为一字不差。
 * 有了它，这条通知自己就能把整条流程走完，不必再回设置面板。
 * 过期后它换成「重新取码」（见下面的 `watch(codeCountdown.expired)`）。
 *
 * 停留时长取 CODE_TTL_MS：码什么时候作废，通知就什么时候走。
 */
function codeActions() {
  const actions = []
  if (codeCountdown.value.expired) {
    actions.push({
      label: t('notifications.cloud.codeRefresh'),
      run: () => void refreshCloudCode(),
      keep: true,
    })
  } else {
    actions.push({
      label: t('notifications.cloud.codeVerify'),
      run: () => void confirmCloudCode(),
      keep: true,
    })
  }
  // 过期后不再给「一键填写」：往 Codeforces 上写一枚已经作废的码，只是白跑一趟
  if (canFillCode.value && !codeCountdown.value.expired) {
    actions.push({
      label: t(
        fillCodeChained.value
          ? 'notifications.cloud.codeFillChain'
          : 'notifications.cloud.codeFill',
      ),
      run: () => void fillCloudCode(),
      keep: true,
    })
  }
  actions.push({
    label: t('notifications.cloud.codeCopy'),
    run: () => void copyCloudCode(),
    keep: true,
  })
  actions.push({ label: t('notifications.cloud.codeOpen'), run: openCfProfileSettings, keep: true })
  actions.push({
    label: t(
      codeMode.value === 'upload'
        ? 'notifications.cloud.codeCancelUpload'
        : 'notifications.cloud.codeCancelLogin',
    ),
    run: cancelCloudCode,
  })
  return actions
}

/**
 * 通知正文下面那行活倒计时。起点与面板是同一个 `codeDeadline`（收到码的那一刻），
 * 所以两处读数始终差不超过一秒；文案与 mm:ss 格式都在这里给，通知组件只负责每秒问一次。
 */
function codeNoticeCountdown() {
  return {
    deadline: codeDeadline.value || Date.now() + CODE_TTL_MS,
    text: (remain) => t('notifications.cloud.codeCountdown', { time: formatRemain(remain) }),
    expiredText: () => t('notifications.cloud.codeExpired'),
  }
}

function notifyCodeWaiting() {
  codeNoticeId = notify({
    type: 'info',
    title: t('notifications.cloud.codeTitle'),
    message: t('notifications.cloud.codeBody', { code: code.value }),
    duration: CODE_TTL_MS,
    actions: codeActions(),
    countdown: codeNoticeCountdown(),
    tag: CODE_NOTICE_TAG,
  })
}

/**
 * 原地换掉那条通知里的内容（码 / 按钮 / 倒计时 / 停留时长），不新发一条。
 * 只在「同一个码值又来一次」这条窄路上用：那时 `watch(code)` 不会响，通知会一直停在
 * 「已过期，请重新取码」上，而码其实已经重新生效了。
 *
 * `updateNotification` 返回 false = 那条已经退场 / 被 × 掉了，这时补发一条新的。
 */
function refreshCodeNotice() {
  if (code.value && codeNoticeId) {
    const patched = updateNotification(codeNoticeId, {
      message: t('notifications.cloud.codeBody', { code: code.value }),
      actions: codeActions(),
      countdown: codeNoticeCountdown(),
      duration: CODE_TTL_MS,
    })
    if (patched) return
  }
  if (code.value) notifyCodeWaiting()
}

/**
 * 「验证那一步正开着」⇔「通知在场」：`code` 非空就是它开着的唯一判据（面板与菜单都据此
 * 换形态），所以这条通知也跟着它一个 ref 走 —— 取到码 / 换一枚新码就（重）发一条，
 * 取消与验证成功（都会清空 code）就整组收掉。验证失败**不清** code（码可能还有效，
 * 用户改完 Last name 能接着来），通知留着，那几颗按钮正好还用得上。
 *
 * 用 watch 而不是在每个清 `code` 的地方补一句 dismiss：清空点有五处（取消 / 两种验证
 * 成功 / …），漏一处就是一条甩不掉的通知。这里只认那一个 ref。
 */
watch(code, (value) => {
  dismissByTag(CODE_NOTICE_TAG)
  if (value) {
    notifyCodeWaiting()
    return
  }
  // 码没了就没有「还剩多久」这回事：取消 / 两种验证成功都从这里把倒计时收掉
  codeNoticeId = 0
  stopCodeTimer()
})

/**
 * 过期那一刻把通知上那颗「验证」换成「重新取码」—— 与面板 / 菜单同一判据。
 *
 * 通知的 auto-dismiss 也吃 CODE_TTL_MS、与码同时到点，所以这多半只在「这条排过队、
 * 上屏比码晚」时看得见：那时通知还挂着，而里面的「验证」点下去必然被服务端打回。
 * 只认 `expired` 这个**布尔**：computed 每次滴答都会产出新对象，盯着对象本身会每秒白跑一次。
 */
watch(
  () => codeCountdown.value.expired,
  (expired) => {
    if (!expired || !codeNoticeId) return
    if (!updateNotification(codeNoticeId, { actions: codeActions() })) codeNoticeId = 0
  },
)

// ---------------------------------------- 取码那一步的两处便利：复制 / 让扩展代填
//
// 这几件事都只服务于「把码搬到 codeforces.com」这个体力活，用户必须在另一个网站上完成，
// 所以它们是这套流程里**不点也罢、但点了明显省事**的地方：
//   1. 复制 —— 原本得在码上拖一道再按 Ctrl+C（`user-select: all` 只是让它好选一点）。
//   2. 代填 —— 装了扩展（且能力清单里有 `fill-code`）时，由扩展在 codeforces.com 上替用户
//      填进 Last name 并保存。**代填不等于免验证**：服务端仍然只认 `user.info` 里读回来的
//      那枚 Last name，信任模型与手工填写一字不差；扩展也绝不回传 cookie 或页面内容，
//      理由与边界都写在 useCompanionBridge 的 requestCodeFill 上面。
//      **2026-10-20 起它是一条链路**：扩展多报一条「保存落下去没有」（`fill-saved` 能力），
//      站点收到就直接接着验证 —— 用户点一下按钮，剩下的（填、保存、关掉那一页、验证、登录）
//      全在这条链上跑完。老扩展没有这条能力，就还是「填完提示一句，验证留给用户点」。
//   3. 预检 —— 装了扩展且能力清单里有 `cf-check` 时，取到码就先问一句「这个浏览器登的是不是
//      你填的这个 handle」（`cloudCfStatus` / `cloudCfHint`），把代填的成败**提前**说清。它只换一行提示
//      的措辞与颜色，不改变任何按钮的行为，更不参与鉴权。
//
// 状态与动作放这里而不是各组件：面板与菜单操作的是同一份取码会话（见文件头那段），
// 复制与代填的忙碌 / 结果同样只能有一份 —— 否则一边点着代填、另一边按钮还亮着。
//
// `canFillCode` / `canFillSaved` 从 useCompanionBridge 转出去，是为了让面板与菜单**只认
// cloudSession 一个入口**就能读全这块 UI 的状态，不必各自再去 import 一次桥。

export { canFillCode, canCheckCf, canFillSaved }

/**
 * 这一颗「自动填写」点下去会不会**顺手把验证也做完**（见 fillCloudCode 的链路）。
 *
 * 两个条件缺一不可：扩展具备 `fill-saved`（能回报「保存完了」），且这一轮是**登录**。
 * 上传那条路刻意不串：它会**覆盖云端**，而「覆盖」这一步的最后一次确认该由用户自己按，
 * 与登录「只是认下这个用户名」不是一个量级 —— 面板与菜单据此换按钮文案。
 */
export const fillCodeChained = computed(() => canFillSaved.value && codeMode.value === 'login')

/** 刚复制过验证码（按钮换「已复制」，2s 后复位） */
export const codeCopied = ref(false)
let codeCopyTimer = 0

/** 取到新码 / 取消时把复制态收干净：新码上还挂着「已复制」是错的 */
function resetCodeCopied() {
  window.clearTimeout(codeCopyTimer)
  codeCopied.value = false
}

export async function copyCloudCode() {
  if (!code.value) return
  try {
    await navigator.clipboard.writeText(code.value)
    codeCopied.value = true
    window.clearTimeout(codeCopyTimer)
    codeCopyTimer = window.setTimeout(resetCodeCopied, 2000)
  } catch {
    /* 非安全上下文或用户未授权：保持原样 —— 码就在屏幕上，手动选中也能抄走 */
  }
}

/** 代填进行中。按钮据此禁用，免得同一次填两遍 */
export const filling = ref(false)

/**
 * 扩展回报的原因 → 一句人话。
 *
 * 扩展只回一个枚举，不描述细节（它不知道站点要什么措辞，也不该往这里塞文案）。
 * 认不出来的枚举一律走兜底：宁可说「没填成，请手动」，也不要把用户卡在一次无解释的失败上。
 * 这些枚举是**跨仓契约**，与 CC-for-Web 的 fillCode 侧一一对应（见 HANDOFF 第 13 节）。
 */
function fillFailureText(reason) {
  switch (reason) {
    case 'not-logged-in':
      return t('settings.cloud.fillNotLoggedIn')
    case 'handle-mismatch':
      return t('settings.cloud.fillMismatch', { handle: pendingHandle.value })
    case 'no-tab':
      return t('settings.cloud.fillNoTab')
    case 'page':
      return t('settings.cloud.fillPage')
    case 'timeout':
      return t('settings.cloud.fillTimeout')
    case 'unsupported':
      return t('settings.cloud.fillUnsupported')
    default:
      return t('settings.cloud.fillFailed')
  }
}

/**
 * 这个浏览器在 Codeforces 上登的是不是当前这个 handle。
 *
 * `'match' | 'mismatch' | 'not-logged-in' | 'unknown'`，其中 unknown = 不知道，
 * 包括「没装扩展」「扩展太旧」「这个浏览器从没开过 Codeforces」全部情形。
 *
 * ⚠️ **只用来决定显示什么**，绝不参与鉴权。扩展是用户可替换的组件，伪造一个就能对任意
 * handle 回答 match —— 身份证明始终是服务端那条 user.info + Last name，一字不改。
 * 判据与边界写在 useCompanionBridge 的 checkCfIdentity 上面。
 */
export const cloudCfStatus = ref('unknown')

/**
 * 取码那一步要显示的那行提示 —— 两类组件共用这一份，免得面板与菜单各写一套 switch。
 *
 * `tone` 只管**配色**（`''` = 与改动前那句同色），`key` / `params` 交给调用方去 `t()`。
 * 只有两种颜色：`ok` = 已确认是这个账号；`warn` = 点之前就知道会失败（与面板里云端报错
 * 同一支 `--warn` 令牌）。刻意不给红色 —— 这两句是**事前提醒**，不是已经发生的错误，
 * 用报警色会把「还没点呢」说成「出事了」。
 */
export const cloudCfHint = computed(() => {
  switch (cloudCfStatus.value) {
    case 'match':
      return { tone: 'ok', key: 'settings.cloud.cfHintMatch', params: { handle: pendingHandle.value } }
    case 'mismatch':
      return { tone: 'warn', key: 'settings.cloud.cfHintMismatch', params: { handle: pendingHandle.value } }
    case 'not-logged-in':
      return { tone: 'warn', key: 'settings.cloud.cfHintNotLoggedIn', params: {} }
    default:
      return { tone: '', key: 'settings.cloud.fillCodeNote', params: {} }
  }
})

/**
 * 问一次扩展「这个浏览器登的是不是这个 handle」，把结果记进 cloudCfStatus。
 *
 * 刻意不 await：这一问只是把提示**提前**，绝不能挡住取码或代填（见 useCompanionBridge 的
 * CF_CHECK_TIMEOUT —— 3 秒到点就按 unknown 收场）。也刻意不做任何轮询：取一次码问一次、
 * 代填跑完再问一次，就这两处。
 */
async function refreshCfStatus() {
  if (!canCheckCf.value || !code.value) return

  const handle = pendingHandle.value

  try {
    const status = await checkCfIdentity(handle)
    // 用户可能在等待期间取消了取码：迟到一步的答案必须丢掉，否则会拿上一轮的结论说这一轮的话
    if (code.value && pendingHandle.value === handle) cloudCfStatus.value = status
  } catch {
    /* 锦上添花的一问，出任何问题都维持现状（界面与改动前一样） */
  }
}

/**
 * 请扩展把当前这枚码填进 Codeforces。只在 `canFillCode` 为真时会被调用（按钮本身据此显示）。
 *
 * 【2026-10-20 起它是一条链路】扩展具备 `fill-saved` 能力、且这一轮是**登录**时，这里不止
 * 「等它填好」，还会等它报**保存落下去**（那一刻它已经把那个 Codeforces 标签页关掉），然后
 * 直接接着验证 —— 用户点一下按钮，填 / 保存 / 关页 / 验证 / 登录一路跑完。
 *
 * 为什么不让用户自己点最后那一下：服务端要的「确认这一次写入」原本是怕站点替用户做主，
 * 可这一趟的每一步（填什么码、改哪个字段）用户都已经明确要求过，中间没有任何需要他再判断
 * 的东西；留下那一下只是多一次来回 —— 而且他此刻正盯着另一个网站的标签页，早就没得看了。
 * **上传那条路刻意不串**（见 fillCodeChained）：它会覆盖云端，最后一下该由用户按。
 *
 * 老扩展 / 等不到回报时照旧退回改动前的行为：提示「已填好，回来点验证」，码有 10 分钟有效期。
 */
export async function fillCloudCode() {
  if (filling.value || !code.value) return
  clearCloudFeedback()
  filling.value = true
  const result = await requestCodeFill(pendingHandle.value, code.value)

  if (!result.ok) {
    filling.value = false
    error.value = fillFailureText(result.reason)
    refreshCfStatus()
    return
  }

  // 等到「保存完了」才松手：这几秒里按钮一直转，免得用户以为没反应又点一次
  const saved = fillCodeChained.value && (await result.saved)
  filling.value = false

  // 只有**不接着验证**时才说这句 —— 链路上它紧接着就去验证了，此时提示「回来点验证」
  // 会与屏幕上的动作打架（而且那一轮结束时页面往往已经重载）
  if (!saved) notice.value = t('settings.cloud.fillCodeDone')
  // 扩展刚跑完一趟、会话缓存已经对齐（见 CC-for-Web 的 syncCfIdentityFromFill），
  // 再问一次就能把「没登录 / 登的不是你」这类提示从「失败后才知道」提前到「点之前就知道」
  refreshCfStatus()

  // 保存确实落下去了、码也还在（用户可能刚点了取消）→ 接着验证并登录。
  // 那一步自己会设 busy / error，成功时整页重载（见 verifyAndLogin → adoptCloud）
  if (saved && code.value) await verifyAndLogin()
}

/**
 * 登录。先读一眼云端，再决定要不要验证：
 *
 * - 云端已经有这个用户名的配置 → 必须证明你是主人，但**不能改动它**，所以走取码 → 填
 *   Codeforces → verify-save 回写「云端原文」那条路（见 verifyAndLogin）。
 * - 云端还没有配置 → 没有任何会被覆盖的东西，也就不必验证，直接在本机认领这个用户名。
 *   真正写入要等用户点「上传本机设置」。
 *
 * 这条设计是刻意的：登录永远不写云端。换台设备第一次登录时，本机往往还是一套默认设置，
 * 顺手推上去就把云端那份好的冲掉了。
 */
export async function loginCloud() {
  if (busy.value) return
  const target = handleInput.value.trim()
  clearCloudFeedback()
  if (!target) {
    error.value = t('settings.cloud.errorHandle')
    return
  }

  busy.value = true
  const probe = await fetchCloudProfile(target)
  busy.value = false

  if (probe.success) {
    remoteProfile.value = probe.data
    remoteUpdatedAt.value = probe.updatedAt ?? ''
    codeMode.value = 'login'
    await requestCloudCode(target)
    return
  }
  if (!probe.notFound) {
    error.value = cloudFailure(probe)
    return
  }

  cloudAccount.value = { handle: target, updatedAt: '' }
  handleInput.value = ''
  notice.value = t('settings.cloud.loginNoCloud')
  // 这条也是「登录成功」（只是云端还没有配置，没什么可套用的，所以不刷新）。
  // 通知与行内那句说同一件事：行内那句留在云端同步那一栏里当下一步的指引，
  // 通知负责让「从齿轮菜单点的登录」也能看见结果。
  notify({
    type: 'success',
    title: t('notifications.cloud.loggedInTitle'),
    message: t('notifications.cloud.loggedInNoCloud'),
    duration: SUCCESS_NOTICE_MS,
  })
}

/** 验证码面板上那颗按钮：按当前用途分发到登录 / 上传 */
export function confirmCloudCode() {
  return codeMode.value === 'upload' ? verifyAndUpload() : verifyAndLogin()
}

/**
 * 登录的验证。服务端是去读这个 handle 在 Codeforces 个人资料里的 Last name 跟验证码比对，
 * 对得上才写 KV —— 没有「只验证不写」的接口，所以这里把**刚读到的云端原文**原样传回去：
 * 服务端由此确认「你是主人」，而云端那份内容一个字段都不会变。
 *
 * 验证通过后顺手把那份原文拉到本机（adoptCloud）并刷新：登录的语义就是「这台设备改用云端
 * 这一套设置」。方向仍然是只下不传 —— 落地的只有刚读到的东西。
 */
export async function verifyAndLogin() {
  if (busy.value) return
  const handle = pendingHandle.value
  clearCloudFeedback()
  busy.value = true
  const result = await verifyAndSave(handle, remoteProfile.value ?? {})
  busy.value = false
  if (!result.success) {
    error.value = cloudFailure(result)
    return
  }
  // 先把绑定关系与设备令牌落下（下面那步会刷新页面，晚了就写不进去了）
  const profile = remoteProfile.value
  // 两处时间刻意不是同一个值：账号行显示的是「读到的旧时间」（回写会把服务端的 updatedAt 顶成
  // 此刻，可那不是「用户改了配置」，显示它只会误导）；而「本机在跟哪一版」要记**回写后的那一版**
  // —— 云端现在存着的就是它，记旧值会让下次打开站点白对齐一次（见 cloudEntry.js 的闸门）
  const appliedVersion = result.updatedAt ?? remoteUpdatedAt.value
  cloudAccount.value = { handle, updatedAt: remoteUpdatedAt.value }
  cloudToken.value = result.token ?? ''
  handleInput.value = ''
  code.value = ''
  pendingHandle.value = ''
  remoteProfile.value = null
  remoteUpdatedAt.value = ''
  // 刷新成功的话后面就不用走了；只有云端那份一个白名单键都没有时才会走到这里
  // （kind 传 'login'：那条通知说「登录成功」而不是「已导入」）
  if (!(await adoptCloud(profile, handle, appliedVersion, 'login'))) {
    notice.value = t('settings.cloud.loggedIn')
  }
}

/**
 * 验证并上传。服务端是去读这个 handle 在 Codeforces 个人资料里的 Last name 跟验证码比对，
 * 对得上才写 KV —— 所以「证明是我的」与「保存」本来就是同一个动作，没有单独的验证接口。
 */
export async function verifyAndUpload() {
  if (busy.value) return
  const handle = pendingHandle.value
  clearCloudFeedback()
  busy.value = true
  const result = await verifyAndSave(handle, collectProfile())
  busy.value = false
  if (!result.success) {
    error.value = cloudFailure(result)
    return
  }
  cloudAccount.value = { handle, updatedAt: result.updatedAt ?? '' }
  // 记下这枚令牌：之后点「上传本机设置」就直接写，不用再取码、不用再去改 Codeforces
  cloudToken.value = result.token ?? ''
  handleInput.value = ''
  code.value = ''
  pendingHandle.value = ''
  notice.value = t('settings.cloud.saved')
  // 云端刚存下这一套：地址栏跟着认下这位，「本机在跟哪一版」一起记上
  writeCloudEntryPath(handle)
  writeActiveProfile(handle, result.updatedAt ?? '')
}

/**
 * 用设备令牌写入：不取码，也不要求用户再去碰 Codeforces。
 *
 * 服务端回 401 表示这枚令牌不认了（过期 / 被吊销 / 属于别的 handle）：清掉它、退回取码流程，
 * 并用一行提示说明「为什么突然又要验证码」—— 不讲清楚的话，用户只会觉得同一颗按钮忽然变麻烦了。
 */
export async function uploadWithToken(handle) {
  if (busy.value) return
  clearCloudFeedback()
  busy.value = true
  const result = await saveWithToken(handle, cloudToken.value, collectProfile())
  busy.value = false

  if (result.success) {
    cloudAccount.value = { handle, updatedAt: result.updatedAt ?? '' }
    notice.value = t('settings.cloud.saved')
    // 云端现在存着的就是这一套，地址栏跟着认下这位，「本机在跟哪一版」也一起记上
    writeCloudEntryPath(handle)
    writeActiveProfile(handle, result.updatedAt ?? '')
    return
  }
  if (result.status !== 401) {
    error.value = cloudFailure(result)
    return
  }

  cloudToken.value = ''
  codeMode.value = 'upload'
  // requestCloudCode 一进来就会清反馈，所以提示只能压在它之后；只有真的把码取回来、
  // 验证码面板开出来了才提示，否则屏幕上已经有一句取码失败的报错了。
  await requestCloudCode(handle)
  if (code.value) notice.value = t('settings.cloud.tokenExpired')
}

/**
 * 已绑定态点「上传本机设置」。这条才是真的会覆盖云端。
 *
 * 有设备令牌就直接写 —— 「一次验证换长期免取码」换来的就是这个；本机没有令牌
 * （从没验证成功过）才退回取码验证那条路（`codeMode` 因此变成 'upload'，
 * 菜单与面板都要照它显示「验证并上传」那一套文案）。
 */
export async function uploadCloud() {
  const handle = cloudAccount.value.handle
  if (!handle) return
  if (cloudToken.value) {
    await uploadWithToken(handle)
    return
  }
  codeMode.value = 'upload'
  await requestCloudCode(handle)
}

/**
 * 下载到本机：把云端那份写进 localStorage，然后刷新页面（刷新的理由见 adoptCloud）。
 *
 * 「登录成功」「点下载」「导入」三条路共用 adoptCloud，语义都是「这台设备改用云端那一套」，
 * 方向始终是**只下不传** —— 上传是上面那个函数的事。
 */
export async function downloadCloud() {
  if (busy.value) return
  const handle = cloudAccount.value.handle
  if (!handle) return
  clearCloudFeedback()
  busy.value = true
  const result = await fetchCloudProfile(handle)
  busy.value = false
  if (!result.success) {
    error.value = result.notFound ? t('settings.cloud.noCloudConfig') : cloudFailure(result)
    return
  }
  // 成功那一步会整页刷新，所以下面这句只在「云端那份一个白名单键都没有」时才走得到
  if (!(await adoptCloud(result.data, handle, result.updatedAt ?? ''))) {
    error.value = t('settings.cloud.emptyProfile')
  }
}

/**
 * 解绑：只断开**本机**与这个用户名的关联，不碰云端。
 *
 * 刻意不发 unbind 请求。服务端那个接口要求先取码验证（没有码就回「验证码已过期或未获取，
 * 请重新取码」），可解绑在用户心里就是一次本机操作；硬要走「取码 → 改 Codeforces → 解绑」
 * 三步，只会让人以为按钮坏了。云端那份配置本来就在拿 handle 就能读的位置，留着它并不会
 * 多泄露什么 —— 想换账号，重新登录别的 handle 即可；想重新绑回来，登录一次就行。
 *
 * 「要不要先问一句」由调用方决定（面板弹自己的确认框、菜单在二级里内联问）。
 */
export function unbindCloud() {
  clearCloudFeedback()
  cloudAccount.value = { handle: '', updatedAt: '' }
  // 令牌是跟着 handle 走的：解绑就该一起丢掉，否则换登录别的 handle 时会带过去
  // （服务端也会因为 owner !== handle 而回 401，但那是兜底，不该靠它）
  cloudToken.value = ''
  handleInput.value = ''
  // 「本机在跟谁」一并忘掉：留着的话，下次打开站点会把这位的配置又自动套回来 ——
  // 那正是「解绑」最不该有的后果（这一步只删本机存档，仍然不发任何请求）
  forgetActiveProfile()
}

/**
 * 把一份云端配置落到本机、然后刷新页面。返回是否真的应用了（写进去 0 条就是没有）。
 *
 * 刷新的理由：设置散落在 Monaco / 各个单例里，逐个通知不如整页重来可靠；刷新前先 flush，
 * 把编辑器里还没落盘的正文写回 VFS —— 否则这一步会丢掉用户正在编辑的内容。
 *
 * 「登录成功」「点下载」「导入」共用这里：三者的语义都是「这台设备改用云端那一套」。
 * 注意方向始终是**只下不传**：这个函数不碰云端一个字节。
 *
 * @param {'import'|'login'} [kind='import'] 这次是「导入一份云端配置」还是「登录」——
 *   只影响刷新后补发的那条通知说哪句话（见 CLOUD_NOTICES）。默认按导入算：四条显式
 *   导入入口（面板导入 / 菜单导入 / 两处的「下载到本机」/ 链接套用）都走默认，
 *   只有 verifyAndLogin 传 'login'。
 */
export async function adoptCloud(data, handle, updatedAt = '', kind = 'import') {
  if (!applyProfile(data)) return false
  writeCloudEntryPath(handle)
  writeActiveProfile(handle, updatedAt)
  // 这条通知要跨过下面那次刷新：刷新前 notify() 等于没发（页面一走它就没了），
  // 所以先寄存在 sessionStorage 里，由下次启动的 flushFlashNotification 补发。
  // 必须排在 reload 之前 —— 与上面两个 write 同一条理由。
  const [titleKey, bodyKey] = CLOUD_NOTICES[kind] ?? CLOUD_NOTICES.import
  notifyAfterReload({
    type: 'success',
    title: t(titleKey),
    message: t(bodyKey, { handle }),
    duration: SUCCESS_NOTICE_MS,
  })
  await flush()
  window.location.reload()
  return true
}

/**
 * 只填用户名就把一份云端配置取回来：不发验证码、不认领用户名。
 *
 * 返回 `{ ok, data, updatedAt, error }`，**由调用方决定怎么确认** —— 面板走自己那个自绘
 * 确认弹窗，菜单在二级里内联问一句。这一步只是「读」，公开接口本来就不需要鉴权。
 */
export async function probeCloud(handle) {
  const result = await fetchCloudProfile(handle)
  if (result.success) return { ok: true, data: result.data, updatedAt: result.updatedAt ?? '' }
  return {
    ok: false,
    error: result.notFound ? t('settings.cloud.applyNoCloud', { handle }) : cloudFailure(result),
  }
}

/**
 * 把「整句里嵌一个链接」的文案劈成前后两段。
 *
 * 整句留在一个词条里、用 `{link}` 占位再在这里劈开，而不是拆成 before/link/after 三个键：
 * 拆开就看不见语序了 —— 英文里这个短句落在句子中间，三段式很容易对不上位。
 * （`t()` 不带 params 时原样返回，`{link}` 不会被插值吃掉。）
 * 面板与菜单都要渲染这句，所以放在这里共用一份劈法。
 */
export function splitLinkText(key) {
  const [before, after = ''] = t(key).split('{link}')
  return { before, after }
}
