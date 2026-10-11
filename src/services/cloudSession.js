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
import { ref, watch } from 'vue'
import { flush } from './autoSave.js'
import {
  applyProfile,
  collectProfile,
  fetchCloudProfile,
  requestCode,
  saveWithToken,
  verifyAndSave,
} from './cloudProfile.js'
import { writeActiveProfile, writeCloudEntryPath } from './cloudEntry.js'
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
const storedToken = readStored(CLOUD_TOKEN_KEY, '')
export const cloudToken = ref(typeof storedToken === 'string' ? storedToken : '')
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
 */
export async function requestCloudCode(handle) {
  if (busy.value) return
  const target = handle.trim()
  clearCloudFeedback()
  if (!target) {
    error.value = t('settings.cloud.errorHandle')
    return
  }
  busy.value = true
  const result = await requestCode(target)
  busy.value = false
  if (!result.success) {
    error.value = cloudFailure(result)
    return
  }
  pendingHandle.value = target
  code.value = result.code
}

export function cancelCloudCode() {
  code.value = ''
  pendingHandle.value = ''
  clearCloudFeedback()
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
  if (!(await adoptCloud(profile, handle, appliedVersion))) {
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
 * 把一份云端配置落到本机、然后刷新页面。返回是否真的应用了（写进去 0 条就是没有）。
 *
 * 刷新的理由：设置散落在 Monaco / 各个单例里，逐个通知不如整页重来可靠；刷新前先 flush，
 * 把编辑器里还没落盘的正文写回 VFS —— 否则这一步会丢掉用户正在编辑的内容。
 *
 * 「登录成功」「点下载」「导入」共用这里：三者的语义都是「这台设备改用云端那一套」。
 * 注意方向始终是**只下不传**：这个函数不碰云端一个字节。
 */
export async function adoptCloud(data, handle, updatedAt = '') {
  if (!applyProfile(data)) return false
  writeCloudEntryPath(handle)
  writeActiveProfile(handle, updatedAt)
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
