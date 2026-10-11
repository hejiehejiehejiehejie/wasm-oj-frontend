/**
 * notifications —— 全站通知（toast）的服务层单一出处。
 *
 * 【形态】模块级单例（同 shellSettings.js / editorSettings.js 的体例）：任何服务、
 * 任何组件都 import 同一份 `notifications` ref，写入口只有下面的 `notify()`。
 *
 * 【不持久化，是刻意的】通知是易逝状态：刷新之后「3 秒前那条警告」已经没有意义，
 * 剩下的只有被打断的体验。所以这里不落任何 `cp.*` 键，也因此与坑 36 无涉
 * （不持久化就不存在「服务层用 usePersistentRef 落不了首值」的问题）。
 *
 * 【行为契约（2026-10-12 定，来自用户给的原型 ide_notification_system.html）】
 * - 四种类型：info / success / warning / error，各自带图标与颜色（组件侧用
 *   base.css 里现成的 --info / --ok / --warn / --fail，不另开色）。
 * - `duration` 毫秒后自动消失；**0（或缺省）= 常驻**，只能手动关。
 * - 最多同显 `MAX_VISIBLE`（4）条，超出的进 `queue` 排队；空出位置后**展示那一刻**
 *   才重新起算时限 —— 排队时间不计入，否则「排了 8 秒的 3 秒通知」一露头就没了。
 * - 视觉排序：常驻的排最上，剩余时间短的排最下（按 expireAt 降序）。
 *   排序交给 NotificationCenter 用 CSS `order` 实现，本数组保持**展示顺序**不动 ——
 *   数组重排会让 Vue 挪动 DOM 节点，进场动画会从头再播一遍（原型里专门避开这一点，
 *   见它 updateOrder 的注释）。
 * - 退场走 200ms 淡出：dismiss 先给条目打 `leaving` 标记，动画播完才真正出数组；
 *   这期间同一条的重复 dismiss 直接忽略。
 * - `actions`（2026-10-12 加）：通知可以自带**操作按钮**，点击先执行调用方给的
 *   回调、再按普通流程退场（不传回调的按钮就只是「点掉这条」）。至多收前 2 个 ——
 *   卡片宽 320px，按钮再多就挤成一排小字，不如拆成两条通知。回调拿到的就是这条
 *   通知对象，想在点击后发下一条直接在里面 notify()。Ⓐ 通知不持久化，回调函数
 *   自然也只活在本次会话里。
 * - `tag`（2026-10-12 加，随评测结果通知）：给通知挂一个归属标识（如
 *   `run:<文件路径>`），配 `dismissByTag(tag)` 整组收掉 —— 在场与排队里同 tag 的
 *   一起算。常驻型业务通知（CE）靠它实现「重跑 / 切页签 / 关页签就收」，
 *   不用调用方自己记 id。
 */
import { ref } from 'vue'

/** 类型表（唯一出处）。组件的图标映射与颜色分支都按这四个 id 走。 */
export const NOTIFICATION_TYPES = ['info', 'success', 'warning', 'error']

/** 同屏上限。队列不设上限（排队中的通知只是迟一点露面）。 */
export const MAX_VISIBLE = 4

/** 退场动画时长，须与 NotificationCenter.vue 里 `notif-out` 的 duration 一字不差。 */
const EXIT_MS = 200

let seq = 0

/**
 * 当前在场（含退场中）的通知。展示顺序即插入顺序，**别对它排序**（理由见文件头）。
 * 每条：{ id, type, title, message, duration, expireAt, timerId, leaving }
 * - `expireAt`：绝对过期时刻；常驻为 Infinity。组件按它排 CSS order。
 * - `timerId`：自动消失的定时器；常驻与排队中为 0。
 * - `leaving`：退场动画播放中。置位后按钮再点也不重复计数。
 */
export const notifications = ref([])

/** 排队中的通知：已经受理、还没上屏。 */
const queue = []

/** 清掉某条的自动消失定时器（手动关闭时要收，防止回调打在已退场的条目上） */
function clearTimer(notif) {
  if (notif.timerId) {
    window.clearTimeout(notif.timerId)
    notif.timerId = 0
  }
}

/** 每颗操作按钮一个稳定的 key（v-for 用），与通知自己的 id 同一个计数器分流 */
let actionSeq = 0

/**
 * 归一操作按钮：只认 `{ label, run? }`，label 转字符串、run 只收函数。
 * 超过 2 个的丢弃（见文件头的行为契约）。传坏值（非数组 / 元素不是对象）一律空表，
 * 不让调用方的脏数据把上屏流程打断。
 */
function normalizeActions(actions) {
  if (!Array.isArray(actions)) return []
  return actions
    .slice(0, 2)
    .filter((action) => action !== null && typeof action === 'object')
    .map((action) => ({
      id: ++actionSeq,
      label: String(action.label ?? ''),
      run: typeof action.run === 'function' ? action.run : null,
    }))
}

/** 队列里还有位就放一条上屏。上屏那一刻才起算时限（见文件头的行为契约）。 */
function dequeue() {
  if (!queue.length || notifications.value.length >= MAX_VISIBLE) return
  const next = queue.shift()
  if (next.duration > 0) next.expireAt = Date.now() + next.duration
  show(next)
}

/** 真正上屏：入数组、起定时器。（排队判断在 notify 里，这里不做容量检查） */
function show(notif) {
  notifications.value = [...notifications.value, notif]
  if (notif.duration > 0) {
    notif.timerId = window.setTimeout(() => dismissNotification(notif.id), notif.duration)
  }
}

/**
 * 发一条通知。这是全站唯一的入口。
 *
 * @param {object} options
 * @param {'info'|'success'|'warning'|'error'} [options.type='info'] 类型，认不出的按 info 处理
 * @param {string} [options.title=''] 标题。文案由调用方定（组件/服务里不写字面量，
 *   界面文案走 i18n；运行期产生的动态文本——比如编译器吐回来的报错——直接传原文）
 * @param {string} [options.message=''] 正文，可省
 * @param {number} [options.duration=0] 自动消失的毫秒数；0 = 常驻，需手动关闭
 * @param {Array<{label: string, run?: (notif: object) => void}>} [options.actions=[]]
 *   操作按钮，至多收前 2 个。点击：先跑 `run`（拿到本条通知对象），再退场；
 *   没有 `run` 的按钮只做「点掉这条」。见文件头的行为契约。
 * @param {string} [options.tag=null] 归属标识，配 dismissByTag 用；无归属就不传
 */
export function notify({ type = 'info', title = '', message = '', duration = 0, actions = [], tag = null } = {}) {
  const id = ++seq
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0
  const notif = {
    id,
    type: NOTIFICATION_TYPES.includes(type) ? type : 'info',
    title: String(title),
    message: message ? String(message) : '',
    duration: safeDuration,
    expireAt: safeDuration > 0 ? Date.now() + safeDuration : Infinity,
    timerId: 0,
    leaving: false,
    actions: normalizeActions(actions),
    tag: tag == null || tag === '' ? null : String(tag),
  }
  if (notifications.value.length >= MAX_VISIBLE) {
    queue.push(notif)
  } else {
    show(notif)
  }
  return id
}

/**
 * 关掉一条（手动点 × 或定时器到期都走这里）。
 *
 * 先置 `leaving` 让组件播 200ms 退场动画，播完才出数组、才给队列腾位置 ——
 * 立刻出数组会让淡出无从谈起（元素没了）。退场中重复调用直接忽略：
 * 那条的定时器已清、位置已让，再走一遍只会把 EXIT_MS 的时序打乱。
 *
 * @param {number} id notify 返回的那个 id
 */
export function dismissNotification(id) {
  const notif = notifications.value.find((item) => item.id === id)
  if (!notif || notif.leaving) return
  clearTimer(notif)
  notif.leaving = true
  window.setTimeout(() => {
    notifications.value = notifications.value.filter((item) => item.id !== id)
    dequeue()
  }, EXIT_MS)
}

/** 全部清掉：在场的一并退场，排队里的直接作废（它们还没上屏，没有动画可播）。 */
export function dismissAllNotifications() {
  queue.length = 0
  for (const notif of notifications.value) {
    if (notif.leaving) continue
    clearTimer(notif)
    notif.leaving = true
  }
  window.setTimeout(() => {
    // 200ms 里 notify() 新塞进来的条目没被打过 leaving，要留下
    notifications.value = notifications.value.filter((item) => !item.leaving)
  }, EXIT_MS)
}

/**
 * 按归属标识整组收掉：在场且未在退场中的逐条走 dismissNotification（播淡出、
 * 清定时器、给队列腾位），排队里的直接作废——它们没上屏，没有动画可言。
 * 幂等：没有匹配项时什么也不做。同 tag 的通知理论上不该并存
 * （调用方发新的之前应先 dismissByTag），真并存了也一并收走。
 *
 * @param {string} tag notify 时传的 tag
 */
export function dismissByTag(tag) {
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].tag === tag) queue.splice(i, 1)
  }
  for (const notif of notifications.value) {
    if (notif.tag === tag && !notif.leaving) dismissNotification(notif.id)
  }
}
