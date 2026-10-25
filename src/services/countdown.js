/**
 * 悬浮倒计时卡的状态与计时。
 *
 * 【为什么是模块级单例】卡片的入口在齿轮菜单（settingsMenu.js），而计时本身必须比组件
 * 活得久：卡关掉 / 页面重载后仍要接着走。状态放在这里、由 CountdownCard.vue 直接读写，
 * 菜单与组件就只是同一份状态的两个使用者。
 *
 * 【时间口径】一律存「结束时间戳 endAt」，渲染时用 now 现减 —— 不靠累加 tick。
 * 页面切后台时定时器会被浏览器降频，累加出来的秒数会偏慢；按时间戳算则不会。
 * 暂停时冻结的是 `pausedRemain`，继续时重新算 endAt，与演示版一致。
 *
 * 【位置尺寸】存的是**设计 px（100% 缩放下的值）**，渲染处一律过 `px()`。
 * 拖拽时把物理位移除以当前缩放再落盘，这样换档位（100% → 150%）时卡片
 * 按同一比例长大，而不是内容涨了、壳没涨。持久化名见 storageNames.js。
 */
import { computed, reactive, ref, watch } from 'vue'
import { px, uiScale } from '../composables/useUiScale.js'
import { COUNTDOWN_KEY } from './storageNames.js'

export const COUNTDOWN_DEFAULT_W = 300
export const COUNTDOWN_DEFAULT_H = 212
export const COUNTDOWN_MIN_W = 260
// 2026-10-24 设置区随视觉重做长大（输入 40 + 预设 28 + 主按钮 38 + 两处间距），
// 186 会把这组内容压出卡外（卡片 overflow: hidden，按钮会被裁掉），最低抬到 200
export const COUNTDOWN_MIN_H = 200

const PHASES = ['setup', 'running', 'paused', 'done']
const MAX_TOTAL_MS = 99 * 3600 * 1000

const clampNumber = (value, min, max, fallback) => {
  const n = Number(value)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

const intIn = (value, min, max, fallback) =>
  Math.round(clampNumber(value, min, max, fallback))

function defaults() {
  return {
    /**
     * 组件是否「装着」（2026-10-21）。与运行环境那几个组件同一套语义：
     * 卸载后「组件 › 工具」里不再出现这一格、齿轮菜单那一行也随之收起，
     * 只剩设置 › 应用 › 组件里一行带「安装」按钮的记录可以装回来。
     * 默认 true —— 它是内置组件，老存档（没有这个字段）一律按装着算。
     */
    installed: true,
    /** 卡片此刻是否显示 */
    open: false,
    /** 锁定后只留环形，点击穿透 */
    locked: false,
    phase: 'setup',
    endAt: 0,
    totalMs: 0,
    pausedRemain: 0,
    /** 本次总时长是否超过 1 小时（决定是否显示小时位） */
    withHours: false,
    form: { h: 0, m: 5, s: 0 },
    /** null = 还没摆过，首次打开时落在右下角 */
    x: null,
    y: null,
    w: COUNTDOWN_DEFAULT_W,
    h: COUNTDOWN_DEFAULT_H,
  }
}

function load() {
  const state = defaults()
  if (typeof window === 'undefined') return state

  let raw = null
  try {
    raw = JSON.parse(window.localStorage.getItem(COUNTDOWN_KEY))
  } catch {
    raw = null
  }
  if (!raw || typeof raw !== 'object') return state

  // 只有明确写了 false 才算卸载：老存档没有这个字段，按「装着」处理
  state.installed = raw.installed !== false
  state.open = raw.open === true
  state.locked = raw.locked === true
  state.phase = PHASES.includes(raw.phase) ? raw.phase : 'setup'
  state.form = {
    h: intIn(raw.form?.h, 0, 99, 0),
    m: intIn(raw.form?.m, 0, 59, 5),
    s: intIn(raw.form?.s, 0, 59, 0),
  }
  state.totalMs = clampNumber(raw.totalMs, 0, MAX_TOTAL_MS, 0)
  state.endAt = clampNumber(raw.endAt, 0, Number.MAX_SAFE_INTEGER, 0)
  state.pausedRemain = clampNumber(raw.pausedRemain, 0, state.totalMs, 0)
  state.withHours = raw.withHours === true
  state.w = clampNumber(raw.w, COUNTDOWN_MIN_W, 4000, COUNTDOWN_DEFAULT_W)
  state.h = clampNumber(raw.h, COUNTDOWN_MIN_H, 4000, COUNTDOWN_DEFAULT_H)
  // 注意别用 Number(null)：它等于 0，会把「还没摆过」误判成左上角
  state.x = Number.isFinite(raw.x) ? raw.x : null
  state.y = Number.isFinite(raw.y) ? raw.y : null

  // 存档里可能留着「刷新前还在跑」的现场：过了点就地收尾，别让圆环倒着走
  if (state.phase === 'running') {
    if (!state.totalMs || !state.endAt) state.phase = 'setup'
    else if (Date.now() >= state.endAt) state.phase = 'done'
  }
  if (state.phase === 'paused' && state.pausedRemain <= 0) state.phase = 'done'
  if (state.phase === 'done' && !state.totalMs) state.phase = 'setup'
  if (state.phase === 'setup') {
    state.endAt = 0
    state.totalMs = 0
    state.pausedRemain = 0
  }
  // 卸载状态下不该留着一张开着的卡（存档里可能是更早一次会话留下的现场）
  if (!state.installed) state.open = false
  return state
}

export const countdown = reactive(load())

/**
 * 「默认安装」开关的落盘键（2026-10-25 加）。
 *
 * 与 cfRuntime 的 `cp.cfPicker.autoInstall` 同一档：它是**偏好**（要不要自动装），
 * 所以进 `cloudProfile.js` 的同步白名单；上面 `COUNTDOWN_KEY` 里的 `installed` 才是
 * 「这台设备此刻装没装」的事实，不进。写法也照 cfRuntime：键就定义在服务这里、
 * 由本模块导出，设置面板不另写一份字面量。
 */
export const COUNTDOWN_AUTO_INSTALL_KEY = 'cp.countdown.autoInstall'

/**
 * 读「默认安装」开关。坏值 / 缺省一律按 `true`：这个组件一直是默认装着的
 * （老存档里根本没有这个键），把「没有键」读成 false 会等于悄悄卸载了它。
 */
export function readCountdownAutoInstall() {
  try {
    return JSON.parse(window.localStorage.getItem(COUNTDOWN_AUTO_INSTALL_KEY)) !== false
  } catch {
    return true
  }
}

/** 计时的心跳；与状态分开，以免每 200ms 触发一次落盘 */
export const countdownNow = ref(Date.now())

let ticker = 0
let saveTimer = 0

function tick() {
  countdownNow.value = Date.now()
  if (countdown.phase === 'running' && countdownNow.value >= countdown.endAt) {
    countdown.phase = 'done'
    countdown.pausedRemain = 0
  }
}

function syncTicker() {
  if (typeof window === 'undefined') return
  const shouldRun = countdown.phase === 'running'
  if (shouldRun && !ticker) ticker = window.setInterval(tick, 200)
  if (!shouldRun && ticker) {
    window.clearInterval(ticker)
    ticker = 0
  }
}

watch(() => countdown.phase, syncTicker, { immediate: true })

// 从后台切回来时补一次：定时器可能被浏览器压到几十秒才响一次
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) tick()
    else flushSave()
  })
}

/** 把设置区里越过范围的手输值收回合法区间（离开输入框时调用） */
export function clampCountdownForm() {
  countdown.form.h = intIn(countdown.form.h, 0, 99, 0)
  countdown.form.m = intIn(countdown.form.m, 0, 59, 0)
  countdown.form.s = intIn(countdown.form.s, 0, 59, 0)
}

function save() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(COUNTDOWN_KEY, JSON.stringify(countdown))
  } catch {
    /* 隐私模式 / 配额已满：只在内存里用 */
  }
}

let savePending = false

/** 只把**还压着没写**的那一次落盘；没改过就不写（见下面 beforeunload） */
function flushSave() {
  if (!savePending) return
  window.clearTimeout(saveTimer)
  savePending = false
  save()
}

watch(
  countdown,
  () => {
    if (typeof window === 'undefined') return
    savePending = true
    window.clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => {
      savePending = false
      save()
    }, 150)
  },
  { deep: true },
)

// 拖拽 / 缩放用的是 150ms 的防抖落盘，关标签页那一刻可能还压着一次没写。
// 刻意**只在有挂起改动时**写：无脑 save() 会让「另一个标签页 / 外部改过的存档」
// 在离开这一页时被本页的旧状态盖回去。
if (typeof window !== 'undefined') window.addEventListener('beforeunload', flushSave)

// ---------------------------------------------------------------- 时间读数

/** 当前剩余毫秒（暂停时读冻结量，结束为 0） */
export const countdownRemaining = computed(() => {
  if (countdown.phase === 'paused') return Math.max(0, countdown.pausedRemain)
  if (countdown.phase === 'running') return Math.max(0, countdown.endAt - countdownNow.value)
  if (countdown.phase === 'done') return 0
  return 0
})

/** 圆环进度：剩余量占总时长的百分比 */
export const countdownProgress = computed(() => {
  if (!countdown.totalMs) return 0
  return Math.min(100, Math.max(0, (countdownRemaining.value / countdown.totalMs) * 100))
})

/** 环心的数字：不显示小时位时分钟不封顶（1 小时从 60:00 往回走） */
export const countdownParts = computed(() => {
  const remain = countdownRemaining.value
  const pad = (n) => String(Math.floor(n)).padStart(2, '0')
  if (!countdown.withHours) {
    return { h: '', m: pad(remain / 60000), s: pad((remain % 60000) / 1000) }
  }
  return {
    h: pad(remain / 3600000),
    m: pad((remain % 3600000) / 60000),
    s: pad((remain % 60000) / 1000),
  }
})

// ---------------------------------------------------------------- 位置与尺寸

/**
 * 把卡片收回视口：至少留 80 物理 px 可见。
 * 首次打开（x/y 为 null）落在右下角；之后一直用用户拖到的地方。
 */
export function clampCountdownBox() {
  if (typeof window === 'undefined') return
  const scale = uiScale.value || 1
  const viewportW = window.innerWidth
  const viewportH = window.innerHeight

  // 卡片不能比视口还大（小屏 / 高缩放下按住上限）
  countdown.w = clampNumber(
    countdown.w,
    COUNTDOWN_MIN_W,
    Math.max(COUNTDOWN_MIN_W, (viewportW - 16) / scale),
    COUNTDOWN_MIN_W,
  )
  countdown.h = clampNumber(
    countdown.h,
    COUNTDOWN_MIN_H,
    Math.max(COUNTDOWN_MIN_H, (viewportH - 16) / scale),
    COUNTDOWN_MIN_H,
  )

  if (countdown.x === null || countdown.y === null) {
    countdown.x = (viewportW - px(countdown.w) - 24) / scale
    countdown.y = (viewportH - px(countdown.h) - 24) / scale
  }

  const keepVisibleX = 80 / scale
  const keepVisibleY = 44 / scale
  const minX = keepVisibleX - countdown.w
  const maxX = (viewportW - keepVisibleX) / scale
  countdown.x = Math.min(Math.max(countdown.x, minX), Math.max(minX, maxX))
  countdown.y = Math.min(Math.max(countdown.y, 0), Math.max(0, (viewportH - keepVisibleY) / scale))
}

if (typeof window !== 'undefined') {
  window.addEventListener('resize', clampCountdownBox)
  watch(uiScale, clampCountdownBox)
}

// ---------------------------------------------------------------- 动作

/**
 * 装 / 卸（设置 › 应用 › 组件那一行用）。
 *
 * 这里没有资产可删 —— 组件本体就在仓库里，所谓「卸载」是把它的入口收起来：
 * 卡片关掉、计时现场清回待开始，位置与尺寸留着（再装回来时还在原处）。
 * 与 Codeforces 组件同一个形态：卸了之后设置里那一行还在，点「安装」即可回来。
 */
export function installCountdown() {
  countdown.installed = true
}

export function uninstallCountdown() {
  countdown.installed = false
  countdown.open = false
  countdown.locked = false
  countdown.phase = 'setup'
  countdown.endAt = 0
  countdown.totalMs = 0
  countdown.pausedRemain = 0
}

export function openCountdown() {
  // 卸载后两处入口都该收起，这里是兜底：真被点到也不弹一张空卡
  if (!countdown.installed) return
  countdown.open = true
  clampCountdownBox()
}

export function closeCountdown() {
  countdown.open = false
}

/** 设置区里的 时/分/秒 → 总秒数（越界值在这里夹住） */
export const countdownFormSeconds = computed(
  () =>
    intIn(countdown.form.h, 0, 99, 0) * 3600 +
    intIn(countdown.form.m, 0, 59, 0) * 60 +
    intIn(countdown.form.s, 0, 59, 0),
)

export function startCountdown() {
  const totalSeconds = countdownFormSeconds.value
  if (totalSeconds <= 0) return
  countdown.totalMs = totalSeconds * 1000
  // 正好 1 小时也走 60:00，超过 1 小时才出现小时位（与演示版一致）
  countdown.withHours = totalSeconds > 3600
  countdown.endAt = Date.now() + countdown.totalMs
  countdown.pausedRemain = 0
  countdownNow.value = Date.now()
  countdown.phase = 'running'
}

export function cancelCountdown() {
  countdown.phase = 'setup'
  countdown.endAt = 0
  countdown.totalMs = 0
  countdown.pausedRemain = 0
}

export function toggleCountdownPause() {
  if (countdown.phase === 'running') {
    countdown.pausedRemain = Math.max(0, countdown.endAt - Date.now())
    countdown.phase = 'paused'
  } else if (countdown.phase === 'paused') {
    countdown.endAt = Date.now() + countdown.pausedRemain
    countdownNow.value = Date.now()
    countdown.phase = 'running'
  }
}

export function toggleCountdownLock() {
  countdown.locked = !countdown.locked
}
