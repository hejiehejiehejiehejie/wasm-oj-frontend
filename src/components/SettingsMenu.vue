<script setup>
/**
 * SettingsMenu —— 齿轮点出来的下拉菜单（Quick Settings）。
 *
 * 形态照 VS Code 那颗齿轮：一级列里既有「点开二级再选」的多档项，也有当场就能改完的
 * 内联开关 / 步进器；末尾留两个进完整设置面板的入口（一个总入口，一个按分类直达）。
 * 「云端同步」是第三种二级（2026-10-11 加）：**二级里是个小表单**，形态跟着「这台设备绑没绑
 * 人」走（见 `cloudBound`）—— 未绑定只有一行：用户名框 + 导入 + 登录；已绑定则是
 * 「用户名 + 已绑定标记」一行、这位自己的三件事（上传 / 下载 / 解绑）一行、分隔线，最后仍
 * 是用户名框 + 导入那一行（导入是「取一份配置」，与绑不绑无关）。用户名框与其按钮同处一行，
 * 不拆成两步。
 * 取到码之后原地换成「验证码 + 两步操作 + 验证」，要覆盖本机或断开绑定的则先问一句确认。
 * 表单的状态与动作都在 `services/cloudSession.js`，与设置面板**同一份**（否则一边取了码
 * 另一边看不见）；这里只画它。
 *
 * 【为什么不用 ContextMenu.vue】那份只有扁平的 action 列表。二级 + 内联控件 + 键盘导航
 * 塞进去，会把站内唯一的右键菜单拖成两件套。但有三件事仍然共用：
 * - 颜色走同一组 `--menu-*` 令牌（base.css 里 VS Code Dark+ / Light+ 的原装配对）；
 * - 尺寸走同一个等比缩放系数 `--menu-scale`（HANDOFF 第 5 节坑 33 明令
 *   「要调大小只动这一个数，别单独动某一项 px」）；
 * - 定位收敛与关闭逻辑走同一个 `composables/usePopoverLayer.js`。
 *
 * 【数据在哪】一行数据都不在本文件：整张表连同「写哪份偏好」都在
 * `services/settingsMenu.js`，这里只按 `kind` 挑控件。加一项不必改这个组件。
 *
 * 【键盘】↑↓ 移动高亮，→ / Enter 进二级或触发，← 收回二级，Esc 关，Tab 也关
 * （原生菜单的口径：焦点走出菜单就等于放弃）。高亮行用 roving tabindex 收焦点 ——
 * 只有当前那一行是 Tab 能到的（tabindex=0），其余 -1，Tab 因此不会在菜单里空转一轮。
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { usePopoverLayer } from '../composables/usePopoverLayer.js'
import { formatCombo, useShortcutManager } from '../composables/useShortcutManager.js'
import { t } from '../i18n/index.js'
import { SETTINGS_MENU_ROWS } from '../services/settingsMenu.js'
import { readActiveProfile } from '../services/cloudEntry.js'
import {
  adoptCloud,
  busy as cloudBusy,
  CF_SOCIAL_URL,
  cancelCloudCode,
  canFillCode,
  cloudCfHint,
  cloudAccount,
  code as cloudCode,
  codeCopied,
  codeMode as cloudCodeMode,
  confirmCloudCode,
  copyCloudCode,
  downloadCloud,
  error as cloudError,
  fillCloudCode,
  filling as cloudFilling,
  handleInput as cloudHandle,
  loginCloud,
  notice as cloudNotice,
  probeCloud,
  splitLinkText,
  unbindCloud,
  uploadCloud,
} from '../services/cloudSession.js'

const props = defineProps({
  /** 锚点（通常是那颗齿轮）的 rect；菜单按它的位置展开 */
  anchor: { type: Object, required: true },
  /**
   * 展开方式：
   * - `below-end`：挂在锚点下方、右缘与锚点右缘对齐（侧栏页头那颗齿轮）
   * - `beside`：贴在锚点旁边往屏幕内侧展开（折叠图标栏那颗 —— 它就贴在屏幕边缘，
   *   往下会让菜单压到自己那一栏或者直接溢出）
   */
  placement: { type: String, default: 'below-end' },
})

const emit = defineEmits(['close'])

const { bindings } = useShortcutManager()

// ---------------------------------------------------------------------- 展开位置
const GAP = 4

/**
 * 期望的那个点。
 *
 * `beside` 的朝向判据取「锚点在视口的哪一半」而不是「侧边栏的首选项」：要躲的是屏幕边缘，
 * 而那条图标栏本来就贴在边缘上，与用户把侧边栏放左还是放右无关。
 * `align` 说明这个点是浮层的哪条边 —— 右缘对齐时由 usePopoverLayer 在量到宽度后
 * 左移一个身位（见那里的注释），这里不必先把宽度搞到手。
 */
const desired = computed(() => {
  const rect = props.anchor
  if (props.placement === 'beside') {
    const onLeftHalf = rect.left + rect.width / 2 < window.innerWidth / 2
    return onLeftHalf
      ? { x: rect.right + GAP, y: rect.top, align: 'left' }
      : { x: rect.left - GAP, y: rect.top, align: 'right' }
  }
  return { x: rect.right, y: rect.bottom + GAP, align: 'right' }
})

const { root, position, ready } = usePopoverLayer({
  x: () => desired.value.x,
  y: () => desired.value.y,
  align: () => desired.value.align,
  onDismiss: () => emit('close'),
})

// ---------------------------------------------------------------------- 键盘漫游
/** 一级表里的高亮下标（含 divider 位，只是 divider 不可选） */
const activeIndex = ref(-1)
/** 展开的二级是哪一个：存它在 SETTINGS_MENU_ROWS 里的下标；null = 不在二级里 */
const openSubmenu = ref(null)
/** 二级里的高亮行 */
const subActiveIndex = ref(0)
const itemRefs = ref([])
/** 二级贴着屏幕右边缘时翻到左侧去（判据见下面那个 watch） */
const subFlipped = ref(false)
/**
 * 二级要整体上抬多少像素（0 = 就贴着所属那一行的顶端）。
 *
 * 二级是 absolute 挂在一级行右侧的，`usePopoverLayer` 的视口收敛管不到它 —— 那一层只
 * 夹一级这一块。于是「一级被夹到视口下沿、而这一行又靠菜单底部」时，二级整块掉到屏幕
 * 外：折叠态那颗齿轮就在图标栏贴底那一组，实测 1400×900 下一级落在 519–892，
 * 「设置分类」的二级从 852 伸到 1089，**底部溢出 189px**。所以这里再收一次垂直方向。
 */
const subShift = ref(0)
/**
 * 二级整体左右挪多少像素（0 = 就贴在所属那一行的旁边）。
 *
 * 与上面那条垂直收敛是同一个道理的横向版本，但只在**翻转也救不回来**时才动：
 * 窄屏（手机）上一级菜单本身就占掉大半宽度，二级翻到左侧同样出屏（实测 414×896
 * 折叠态：不翻右缘 493 > 414，翻了左缘 -184 < 0 —— 两侧都塞不下）。这时候只能把它
 * 夹回视口里，代价是压住一级那一行 —— 出屏比遮挡严重得多。
 */
const subShiftX = ref(0)
/**
 * 盯着二级自己的尺寸（见 `watchSubmenuSize`）：字体 / 文案 / 相一变，宽度就变，收敛量得跟着重算。
 * 每次展开在 v-for / v-if 里重新挂一份。
 */
let subObserver = null

/**
 * 此刻要画的那几行 = 表里通过 `when` 的那些。
 *
 * 过滤放在这里、判据留在表里（见 `settingsMenu.js` 文件头）：组件只认「这一行在不在」，
 * 不必知道「装没装扩展」这类业务事实。表里大多数行没有 `when`，缺省就是在。
 * 下标（`activeIndex` / `openSubmenu`）一律按**过滤后**这一份算，所以条件行的位置要挑对：
 * 它们都排在 `cloud` 之后、两颗导航行之前 —— 于是**所有可展开的行都在它们上面**，
 * `openSubmenu` 存的那份下标不会被它们出现 / 消失推着走（下面那两颗导航行只是行号会挪，
 * 它们本来就不存下标）。
 */
const rows = computed(() => SETTINGS_MENU_ROWS.filter((row) => row.when?.() ?? true))
const FIRST_SELECTABLE = computed(() => rows.value.findIndex((row) => row.kind !== 'divider'))

// ------------------------------------------------------------------ 云端同步表单
/** 这台设备有没有绑着一位：`cp.cloudAccount` 里有用户名就是已绑定 */
const cloudBound = computed(() => Boolean(cloudAccount.value.handle))

/**
 * 二级表单的三个相，由「云会话状态」推出来，不另存一份状态：
 * - `code`：已经取到码、正等用户去 Codeforces 改完 Last name 回来点验证；
 * - `confirm`：等用户点头的那一下（导入会覆盖本机设置并刷新、解绑会断开绑定）；
 * - `input`：其余时候，就是填用户名的那个框。
 *
 * 码这个相**两种用途都要显示**：菜单里已绑定态有「上传本机设置」，令牌失效时它也要取码，
 * 那时遮住不显示的话，用户会看到按钮没反应（显示的文案按 `codeMode` 换，见下）。
 */
const cloudPhase = computed(() => {
  if (cloudCode.value) return 'code'
  if (cloudPendingConfirm.value) return 'confirm'
  return 'input'
})

/**
 * 等用户点头的那一下：`kind` 是 'import'（把云端的配置套到本机）还是 'unbind'（断开绑定）。
 * 两件事的可逆程度不同，但都属于「不该手滑就办了」，所以共用同一个相、同一句问法。
 */
const cloudPendingConfirm = ref(null)
/**
 * 用户名框本身：表单一展开就把焦点送进去。
 *
 * 用函数 ref 而不是字符串 ref：整个二级都在一级的 `v-for` 里面，同名字符串 ref 会被 Vue
 * 收成数组（与下面取 `.settings-menu__sub` 那条同一个坑），`.focus()` 遂报「不是函数」。
 */
const cloudField = ref(null)

function focusCloudField() {
  const el = Array.isArray(cloudField.value) ? cloudField.value[0] : cloudField.value
  el?.focus()
}

/** 「把上面的验证码填进 {link}的 Last name」—— 链接那半句在整句里，两边共用同一份劈法 */
const cloudStep1 = computed(() => splitLinkText('settings.cloud.codeStep1'))

// 码那一步的说明、第二步与按钮名都有两份（登录 / 上传），按当前用途挑 —— 用哪个词
// 由 `codeMode` 决定，菜单不自己判断「这次是在干什么」。
const cloudCodeIntro = computed(() =>
  t(cloudCodeMode.value === 'upload' ? 'settings.cloud.codeIntroUpload' : 'settings.cloud.codeIntro'),
)
const cloudCodeStep2 = computed(() =>
  t(cloudCodeMode.value === 'upload' ? 'settings.cloud.codeStep2Upload' : 'settings.cloud.codeStep2'),
)
const cloudVerifyLabel = computed(() =>
  t(cloudCodeMode.value === 'upload' ? 'settings.cloud.verifyUpload' : 'settings.cloud.verifyLogin'),
)

/** 等点头那一下的说明与按钮名，同样按 `kind` 挑 */
const cloudConfirmDesc = computed(() => {
  const pending = cloudPendingConfirm.value
  if (!pending) return ''
  return pending.kind === 'unbind'
    ? t('settings.cloud.unbindConfirmDesc', { handle: pending.handle })
    : t('settings.cloud.applyConfirmDesc', { handle: pending.handle })
})
const cloudConfirmLabel = computed(() =>
  t(cloudPendingConfirm.value?.kind === 'unbind' ? 'settings.cloud.unbind' : 'settings.cloud.import'),
)

async function runCloudImport() {
  const handle = cloudHandle.value.trim()
  if (!handle) {
    cloudError.value = t('settings.cloud.errorHandle')
    return
  }
  cloudBusy.value = true
  const probe = await probeCloud(handle)
  cloudBusy.value = false
  if (!probe.ok) {
    cloudError.value = probe.error
    return
  }
  cloudPendingConfirm.value = { kind: 'import', handle, data: probe.data, updatedAt: probe.updatedAt }
}

/** 解绑先问一句：它会把绑定与设备令牌一起丢掉，误触一次就得重新验证才能再上传 */
function requestCloudUnbind() {
  cloudPendingConfirm.value = { kind: 'unbind', handle: cloudAccount.value.handle }
}

async function confirmPending() {
  const pending = cloudPendingConfirm.value
  if (!pending) return
  if (pending.kind === 'unbind') {
    unbindCloud()
    cloudPendingConfirm.value = null
    return
  }
  cloudBusy.value = true
  // 成功那一步会整页刷新，所以下面这句只在「云端那份一个白名单键都没有」时才走得到
  const applied = await adoptCloud(pending.data, pending.handle, pending.updatedAt)
  cloudBusy.value = false
  if (!applied) cloudError.value = t('settings.cloud.emptyProfile')
}

function optionsOf(index) {
  const row = rows.value[index]
  return row && row.kind === 'radio' ? row.options() : []
}

/** 从 from 往 delta 方向找下一个可选项，找不到就原地不动 */
function step(from, delta) {
  for (let i = from + delta; i >= 0 && i < rows.value.length; i += delta) {
    if (rows.value[i].kind !== 'divider') return i
  }
  return from
}

function focusRow(index) {
  if (index < 0) return
  activeIndex.value = index
  nextTick(() => itemRefs.value[index]?.focus())
}

function closeSubmenu() {
  openSubmenu.value = null
}

function openSubmenuAt(index) {
  const row = rows.value[index]
  // 云端同步那一行展开的是表单，没有档位可算高亮
  if (row?.kind === 'cloud') {
    openSubmenu.value = index
    return
  }
  if (row?.kind !== 'radio') {
    closeSubmenu()
    return
  }
  const options = optionsOf(index)
  // 二级高亮落在当前值上：鼠标扫过来时高亮所在的那一行就是已经选中的那一档
  const at = row.current ? options.findIndex((option) => option.id === row.current()) : -1
  subActiveIndex.value = at >= 0 ? at : 0
  openSubmenu.value = index
}

/** 执行一级行（switch 翻面 / radio 展开二级 / action 打开面板） */
function trigger(index) {
  const row = rows.value[index]
  if (!row || row.kind === 'divider') return
  if (row.kind === 'radio' || row.kind === 'cloud') {
    openSubmenuAt(index)
    return
  }
  if (row.kind === 'action') {
    row.run()
    emit('close')
    return
  }
  if (row.kind === 'switch') row.toggle()
  // stepper 那一行没有「整行点击」的语义：改字号只认 ± 那两颗（或方向键，见 onRootKeydown）
}

/**
 * 选了二级里的一档。
 *
 * 刻意**不关菜单**：调缩放、切语言这类动作常常要连着试几档，关掉反而碍事。
 * （会关菜单的只有「打开设置面板」与「直达某个分类」那两类 action，见 trigger。）
 */
function pickOption(row, option) {
  if (!option) return
  row.select(option.id)
  if (row.closes) {
    emit('close')
    return
  }
  closeSubmenu()
}

function onRootKeydown(event) {
  if (event.key === 'Escape' || event.key === 'Tab') {
    event.preventDefault()
    emit('close')
    return
  }

  // 二级表单里的输入框：方向键 / Home / End / 组字用的键都得还给它，别拿去漫游菜单
  // （Esc 与 Tab 上面已经处理掉了 —— 它们仍然是「放弃这一层」）
  if (event.target instanceof HTMLInputElement) return

  // 在二级里：↑↓ 换档、← 收回、Enter / → 选中
  const subIndex = openSubmenu.value
  if (subIndex !== null) {
    const options = optionsOf(subIndex)
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      subActiveIndex.value = (subActiveIndex.value + 1) % options.length
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      subActiveIndex.value = (subActiveIndex.value - 1 + options.length) % options.length
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      closeSubmenu()
      focusRow(subIndex)
    } else if (event.key === 'Enter' || event.key === 'ArrowRight') {
      event.preventDefault()
      pickOption(rows.value[subIndex], options[subActiveIndex.value])
    }
    return
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    focusRow(activeIndex.value < 0 ? FIRST_SELECTABLE.value : step(activeIndex.value, 1))
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    focusRow(step(activeIndex.value < 0 ? rows.value.length : activeIndex.value, -1))
  } else if (event.key === 'ArrowRight' || event.key === 'Enter') {
    event.preventDefault()
    trigger(activeIndex.value)
  } else if (event.key === 'ArrowLeft') {
    closeSubmenu()
  }
}

// ---------------------------------------------------------------------- 鼠标 / 触屏
// hover 当场展开二级；移出一整块之后给 220ms 的宽限再收 —— 从一级挪进二级的途中
// 会短暂离开两个盒子，没有这段宽限二级会在半路消失。
let closeTimer = 0

function onRowPointerEnter(index) {
  window.clearTimeout(closeTimer)
  closeTimer = 0
  activeIndex.value = index
  openSubmenuAt(index)
}

/**
 * 移出整块后收二级 —— **只收鼠标那一套**。
 *
 * 触屏没有「悬停」：手指抬起时那个 pointer 直接不存在了，浏览器会照规矩补一发
 * `pointerleave`（`pointerType === 'touch'`）。照鼠标那样排 220ms 的定时器，二级会在
 * 用户手指还没落下去之前自己收掉 —— 实测（430×800、hasTouch）轻点「设置分类」后
 * 160ms 二级还在（8 项）、450ms 已经归零，二级**根本点不到**；手速极快（80ms 内）才选得中。
 * 所以触屏改成「轻点展开、二级常驻」：轻点别的行换二级，收起交给「点菜单外」那一路。
 */
function onRootPointerLeave(event) {
  if (event?.pointerType && event.pointerType !== 'mouse') return
  window.clearTimeout(closeTimer)
  closeTimer = window.setTimeout(closeSubmenu, 220)
}

// 打开即接过焦点：不然 Esc / 方向键都落在别处。高亮钉在第一行而不是容器上，
// 上下键才有起点（滚动容器自身不可聚焦也不会吞掉方向键）。
watch(ready, (shown) => {
  if (shown) nextTick(() => focusRow(FIRST_SELECTABLE.value))
})

/**
 * 收敛时用的视口尺寸。
 *
 * 横向刻意用 `documentElement.clientWidth` 而不是 `window.innerWidth`：后者**含滚动条**，
 * 而浮层打开的那一瞬页面常会闪一下滚动条，收敛那一刻量到的是没滚动条的宽度（实测 414 的
 * 窗口在收敛那一帧报 426），等收敛完、滚动条落定，二级右缘就正好悬在屏幕外那十几像素里 ——
 * 这正是窄屏上「收敛明明跑了还是出屏 8px」的真因。clientWidth 是内容宽度，不受它影响。
 *
 * 纵向仍用 `window.innerHeight`：软键盘顶起来时缩的就是它，而这一条收敛要的正是
 * 「现在能看见多高」。
 */
function viewportBox() {
  return {
    w: document.documentElement?.clientWidth || window.innerWidth,
    h: window.innerHeight,
  }
}

/**
 * 按实测位置把二级收进视口：右边放不下就翻到左侧，翻转也救不回来就左右夹，
 * 下边放不下就整块上抬。
 *
 * 一级菜单自己的收敛（见 usePopoverLayer）只管一级那一块，管不到挂出来的二级 ——
 * 二级是 absolute 挂在所属那一行上的，不是浮层本身的盒子。
 *
 * 每一步都要重新量：翻转是靠 class 切 `right: 100%` 实现的，改完得等那一帧画完才有新位置。
 */
async function clampSubmenu() {
  // 分帧收敛：每一轮都**按「没挪过」的位置重算绝对值**（所以重跑是幂等的，不会越收越偏），
  // 量到连续两帧不动就收工，最多 12 帧。
  //
  // 为什么要重跑而不是一次量准：菜单是**弹开**的 —— 打开后的头一百来毫秒里它自己还在
  // 0.95 → 1 的缩放动画里，`getBoundingClientRect` 量到的都是被缩过的那一份。逐帧实测
  // （414×896、英文、未绑定）：二级宽 227.23 → 239.19，比值正好 0.95，收敛按这一份算出的
  // 右缘收完仍出屏 10.5px；动画走完再算才落回 410（= 视口 - GAP）。ResizeObserver 帮不上
  // 这个忙 —— 祖先的 transform 不改元素的布局盒，它不会为此再响一次。
  let prev = null
  for (let pass = 0; pass < 12; pass += 1) {
    await clampSubmenuPass()
    const now = measureSubmenu()
    if (now && prev && sameBox(prev, now)) return
    prev = now
    await nextTick()
    await new Promise((resolve) => requestAnimationFrame(resolve))
  }
}

/** 二级当前的**实际**盒子（含已写上的收敛量） */
function measureSubmenu() {
  const r = root.value?.querySelector('.settings-menu__sub')?.getBoundingClientRect?.()
  if (!r) return null
  return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
}

/** 两帧量到的盒子是不是同一个（半个像素内算同一个，浮点误差不算动） */
function sameBox(a, b) {
  return ['left', 'right', 'top', 'bottom'].every((k) => Math.abs(a[k] - b[k]) <= 0.5)
}

/**
 * 收敛一轮：量位置 → 定翻转 → 定横向 / 纵向偏移。
 */
async function clampSubmenuPass() {
  // 按选择器取而不是用 ref：二级那批 div 都在 v-for / v-if 里，hover 从一行挪到另一行时
  // 卸载与挂载的先后不保证，ref 有可能停在上一个元素（或 null）上。同一时刻只渲染一个。
  const measure = () => root.value?.querySelector('.settings-menu__sub')?.getBoundingClientRect?.()

  /**
   * 「没挪过」的位置。
   *
   * 量到的 rect 是**含着当前收敛量**的（横向是 transform，纵向是 top），而下面的判断必须
   * 以原位置为基准算绝对值 —— 拿含偏移的 rect 去算「还超出去多少」，等于把上一次的结果
   * 当基准再挪一点：每重跑一次收敛量就被吃掉一截（resize 再跑一遍，实测右缘从 421.9
   * 退回 436.7，越收越出屏）。
   */
  const raw = () => {
    const r = measure()
    if (!r) return null
    return {
      left: r.left - subShiftX.value,
      right: r.right - subShiftX.value,
      top: r.top + subShift.value,
      bottom: r.bottom + subShift.value,
    }
  }

  const { w: vw, h: vh } = viewportBox()

  if (raw()?.right > vw - GAP) {
    subFlipped.value = true
    await nextTick()
  }

  // 翻过去之后左边反而出屏（窄屏两侧都塞不下）→ 翻回来，交给下面的左右夹兜底
  if (subFlipped.value && raw()?.left < GAP) {
    subFlipped.value = false
    await nextTick()
  }

  const rect = raw()
  if (!rect) return

  const overshootRight = rect.right - (vw - GAP)
  const undershootLeft = GAP - rect.left
  subShiftX.value = overshootRight > 0 ? -overshootRight : undershootLeft > 0 ? undershootLeft : 0

  // 上抬到「底部离视口下沿 GAP」为止；二级比视口还高时（小屏）只抬到顶部也留 GAP，
  // 宁可两头都溢出一点，也别把顶部推到屏幕外 —— 那样连第一行都看不见了
  const overflow = rect.bottom - (vh - GAP)
  subShift.value = overflow > 0 ? Math.min(overflow, Math.max(0, rect.top - GAP)) : 0
}

watch(openSubmenu, async (index) => {
  subFlipped.value = false
  subShift.value = 0
  subShiftX.value = 0
  subObserver?.disconnect()
  subObserver = null
  if (index === null) return
  await nextTick()
  // 云端同步那一行：表单一展开就把焦点送进用户名框。框空着时把本机认得的那一位填进去
  // （先认已绑定的账号、再认「本机在跟谁」），导入过一次之后就不必把用户名重打一遍。
  if (rows.value[index]?.kind === 'cloud') {
    if (!cloudHandle.value.trim()) {
      cloudHandle.value = cloudAccount.value.handle || readActiveProfile().handle
    }
    nextTick(focusCloudField)
  }
  await clampSubmenu()
  watchSubmenuSize()
})

/**
 * 二级的宽度不是写死的，是**内容算出来的**（用户名框的固有宽度、按钮文字、账号名长短），
 * 而字体会在打开之后的一百来毫秒里陆续换上去 —— 逐帧实测：414×896 下它从 227.23 慢慢长到
 * 239.19（约 120ms / 7 帧）。于是首次收敛量到的位置是「还没长开」的那一份，收完右缘仍出屏
 * 10.6px；换语言、切到验证码 / 确认相、账号名变长变短也都属于同一类变化。
 *
 * 所以盯着它自己的尺寸：一长一缩就重算一次收敛量（收敛量走 transform / top，不改它的
 * border-box，因此不会自己触发自己）。元素在 v-for / v-if 里会换身份，所以每次展开重新挂。
 */
function watchSubmenuSize() {
  if (typeof ResizeObserver === 'undefined') return
  const el = root.value?.querySelector('.settings-menu__sub')
  if (!el) return
  subObserver = new ResizeObserver(() => clampSubmenu())
  subObserver.observe(el)
}

/**
 * 视口变了就重收一次：手机上点进用户名框会顶起软键盘，视口矮一截 ——
 * 一级菜单由 usePopoverLayer 重新匣进视口，挂出来的二级得自己跟上。
 */
function onViewportResize() {
  if (openSubmenu.value !== null) clampSubmenu()
}
window.addEventListener('resize', onViewportResize)

/**
 * 收敛量落到内联样式上；两项都是 0 时不写，交给样式表自己的位置。
 * 纵向改 `top`（相对所属那一行上抬），横向走 transform —— 翻到左侧时是 `right: 100%`
 * 定位的，那边改 margin-left 挪不动它。
 */
const subStyle = computed(() => {
  const style = {}
  if (subShift.value) style.top = `${-subShift.value}px`
  if (subShiftX.value) style['--sub-shift-x'] = `${subShiftX.value}px`
  return Object.keys(style).length ? style : null
})

onBeforeUnmount(() => {
  window.clearTimeout(closeTimer)
  window.removeEventListener('resize', onViewportResize)
  subObserver?.disconnect()
})

/** 键位显示：数据一律来自绑定表，不写死字符串（面板里改绑这里跟着变） */
function comboOf(actionId) {
  const combo = actionId ? bindings.value[actionId] : ''
  return combo ? formatCombo(combo) : ''
}

function optionLabel(option) {
  return option.labelKey ? t(option.labelKey) : option.label
}
</script>

<template>
  <Teleport to="body">
    <div
      ref="root"
      class="settings-menu"
      :class="{ 'settings-menu--ready': ready }"
      :style="position"
      role="menu"
      :aria-label="t('app.settings')"
      @keydown="onRootKeydown"
      @pointerleave="onRootPointerLeave"
    >
      <template v-for="(row, index) in rows" :key="row.id ?? index">
        <div v-if="row.kind === 'divider'" class="settings-menu__divider" role="separator"></div>

        <!-- 一级行只是个定位上下文：可点的是里面那颗 <button>，二级由此能 absolute
             贴到它的右侧，不必再 Teleport 一层、也不用同步两个浮层的关闭 -->
        <div v-else class="settings-menu__row" @pointerenter="onRowPointerEnter(index)">
          <button
            :ref="(el) => (itemRefs[index] = el)"
            type="button"
            class="settings-menu__item"
            :class="{ 'is-active': activeIndex === index || openSubmenu === index }"
            :tabindex="activeIndex === index ? 0 : -1"
            :aria-haspopup="row.kind === 'radio' || row.kind === 'cloud' ? 'true' : undefined"
            :aria-expanded="
              row.kind === 'radio' || row.kind === 'cloud' ? openSubmenu === index : undefined
            "
            :role="row.kind === 'switch' ? 'menuitemcheckbox' : 'menuitem'"
            :aria-checked="row.kind === 'switch' ? row.checked() : undefined"
            @click="trigger(index)"
            @focus="activeIndex = index"
          >
            <span class="settings-menu__label">{{ t(row.labelKey) }}</span>

            <span class="settings-menu__tail">
              <span v-if="row.actionId" class="settings-menu__shortcut">{{ comboOf(row.actionId) }}</span>

              <!-- 箭头转 90°：子菜单往右展开，三角就得指向右（它是「往哪边长出来」的指示器） -->
              <AppIcon
                v-else-if="row.kind === 'radio' || row.kind === 'cloud'"
                name="chevron"
                :size="12"
                class="settings-menu__chevron"
              />

              <template v-else-if="row.kind === 'stepper'">
                <button
                  type="button"
                  class="settings-menu__step"
                  :aria-label="t('settings.menu.decrease')"
                  @pointerdown.stop
                  @click.stop="row.step(-1)"
                >
                  <span aria-hidden="true">−</span>
                </button>
                <span class="settings-menu__value">{{ row.value() }}</span>
                <button
                  type="button"
                  class="settings-menu__step"
                  :aria-label="t('settings.menu.increase')"
                  @pointerdown.stop
                  @click.stop="row.step(1)"
                >
                  <span aria-hidden="true">+</span>
                </button>
              </template>

              <span
                v-else-if="row.kind === 'switch'"
                class="settings-menu__switch"
                :class="{ 'is-on': row.checked() }"
                aria-hidden="true"
              >
                <span class="settings-menu__thumb"></span>
              </span>
            </span>
          </button>

          <div
            v-if="row.kind === 'radio' && openSubmenu === index"
            class="settings-menu__sub"
            :class="{ 'settings-menu__sub--left': subFlipped }"
            :style="subStyle"
            role="menu"
            :aria-label="t(row.labelKey)"
          >
            <button
              v-for="(option, optionIndex) in row.options()"
              :key="option.id"
              type="button"
              class="settings-menu__item settings-menu__item--sub"
              :class="{ 'is-active': subActiveIndex === optionIndex }"
              :role="row.current ? 'menuitemradio' : 'menuitem'"
              :aria-checked="row.current ? option.id === row.current() : undefined"
              tabindex="-1"
              @click.stop="pickOption(row, option)"
              @pointerenter="subActiveIndex = optionIndex"
            >
              <!-- 打勾位常驻（哪怕这一档没选中也占位），选中的标记出现时文字不横向弹跳 -->
              <span class="settings-menu__check" aria-hidden="true">
                <AppIcon v-if="row.current && option.id === row.current()" name="check" :size="12" />
              </span>
              <span class="settings-menu__label">{{ optionLabel(option) }}</span>
            </button>
          </div>

          <!-- 云端同步的二级：一个小表单，三相互斥（填用户名 / 看验证码 / 问一句确认）。
               整块竖排、比档位列表宽一号；点里面任何一处都不该牵动一级那一行的行为。 -->
          <div
            v-else-if="row.kind === 'cloud' && openSubmenu === index"
            class="settings-menu__sub settings-menu__sub--form"
            :class="{ 'settings-menu__sub--left': subFlipped }"
            :style="subStyle"
            role="group"
            :aria-label="t(row.labelKey)"
            @click.stop
          >
            <template v-if="cloudPhase === 'input'">
              <!-- 已绑定：先报一句「这台设备在跟谁」（用户名 + 已绑定标记），再是这位自己的事
                   （上传 / 下载 / 解绑）；分隔线以下是 handle + 导入 —— 导入是「取一份配置」，
                   与绑不绑无关，绑着的时候照样能取别人的。
                   未绑定时上面这一块整个不出现，就只剩下面那一行、外加一颗「登录」。 -->
              <template v-if="cloudBound">
                <div class="settings-menu__account">
                  <AppIcon name="cloud" :size="12" />
                  <span class="settings-menu__account-name">{{ cloudAccount.handle }}</span>
                  <span class="settings-menu__account-tag">{{ t('settings.cloud.boundTag') }}</span>
                </div>
                <div class="settings-menu__actions">
                  <button
                    type="button"
                    class="settings-menu__action settings-menu__action--primary"
                    :disabled="cloudBusy"
                    @click="uploadCloud"
                  >
                    {{ t('settings.cloud.upload') }}
                  </button>
                  <button
                    type="button"
                    class="settings-menu__action"
                    :disabled="cloudBusy"
                    @click="downloadCloud"
                  >
                    {{ t('settings.cloud.download') }}
                  </button>
                  <button
                    type="button"
                    class="settings-menu__action settings-menu__action--danger"
                    :disabled="cloudBusy"
                    @click="requestCloudUnbind"
                  >
                    {{ t('settings.cloud.unbind') }}
                  </button>
                </div>
                <div class="settings-menu__divider" role="separator"></div>
              </template>

              <!-- handle 框与导入 / 登录挤在同一行：它是同一件事的两半（填谁 → 取谁的），
                   摆成两行会被读成两个步骤。窄的时候先挤框（框 flex:1 + min-width:0），
                   按钮不缩、标签不折行。 -->
              <div class="settings-menu__row">
                <input
                  :ref="(el) => (cloudField = el)"
                  v-model.trim="cloudHandle"
                  class="settings-menu__input"
                  type="text"
                  spellcheck="false"
                  autocomplete="off"
                  autocapitalize="off"
                  :aria-label="t('settings.cloud.handle.label')"
                  :placeholder="t('settings.menu.cloudHandlePlaceholder')"
                  @keydown.enter.prevent="cloudBound ? runCloudImport() : loginCloud()"
                />
                <button
                  type="button"
                  class="settings-menu__action"
                  :class="{ 'settings-menu__action--primary': cloudBound }"
                  :disabled="cloudBusy"
                  @click="runCloudImport"
                >
                  {{ t('settings.cloud.import') }}
                </button>
                <button
                  v-if="!cloudBound"
                  type="button"
                  class="settings-menu__action settings-menu__action--primary"
                  :disabled="cloudBusy"
                  @click="loginCloud"
                >
                  {{ t('settings.cloud.login') }}
                </button>
              </div>
            </template>

            <template v-else-if="cloudPhase === 'code'">
              <div class="settings-menu__code">
                <span class="settings-menu__code-label">{{ t('settings.cloud.codeLabel') }}</span>
                <span class="settings-menu__code-row">
                  <!-- user-select: all：点一下就整段选中，省得手动拖 -->
                  <code class="settings-menu__code-value">{{ cloudCode }}</code>
                  <button
                    type="button"
                    class="settings-menu__copy"
                    :class="{ 'is-copied': codeCopied }"
                    :title="t('settings.cloud.copyCodeTitle')"
                    @click="copyCloudCode"
                  >
                    <AppIcon :name="codeCopied ? 'check' : 'copy'" :size="12" />
                    <span>{{
                      t(codeCopied ? 'settings.cloud.copied' : 'settings.cloud.copyCode')
                    }}</span>
                  </button>
                </span>
                <span class="settings-menu__code-hint">{{ t('settings.cloud.codeHint') }}</span>
              </div>
              <p class="settings-menu__note">{{ cloudCodeIntro }}</p>
              <!-- 代填只在装了扩展（且扩展自报 fill-code 能力）时出现；没装的用户看到的与改动前
                   一样。它替用户跑一趟 Codeforces，验证那一步仍然由用户回本页点（理由见
                   cloudSession.js 的 fillCloudCode），所以下面两步照旧摆着。 -->
              <div v-if="canFillCode" class="settings-menu__fill">
                <button
                  type="button"
                  class="settings-menu__action settings-menu__action--primary settings-menu__fill-btn"
                  :disabled="cloudBusy || cloudFilling"
                  :title="t('settings.cloud.fillCodeTitle')"
                  @click="fillCloudCode"
                >
                  <AppIcon name="codeforces" :size="12" />
                  <span>{{
                    t(cloudFilling ? 'settings.cloud.fillCodeBusy' : 'settings.cloud.fillCode')
                  }}</span>
                </button>
                <span
                  class="settings-menu__note"
                  :class="cloudCfHint.tone && `settings-menu__note--${cloudCfHint.tone}`"
                >
                  {{ t(cloudCfHint.key, cloudCfHint.params) }}
                </span>
              </div>
              <ol class="settings-menu__steps">
                <li>
                  {{ cloudStep1.before
                  }}<a
                    class="settings-menu__link"
                    :href="CF_SOCIAL_URL"
                    target="_blank"
                    rel="noopener noreferrer"
                    >{{ t('settings.cloud.codeStep1Link') }}</a
                  >{{ cloudStep1.after }}
                </li>
                <li>{{ cloudCodeStep2 }}</li>
              </ol>
              <div class="settings-menu__actions">
                <button
                  type="button"
                  class="settings-menu__action"
                  :disabled="cloudBusy"
                  @click="cancelCloudCode"
                >
                  {{ t('settings.cloud.cancel') }}
                </button>
                <button
                  type="button"
                  class="settings-menu__action settings-menu__action--primary"
                  :disabled="cloudBusy"
                  @click="confirmCloudCode"
                >
                  {{ cloudVerifyLabel }}
                </button>
              </div>
            </template>

            <template v-else>
              <p class="settings-menu__note">{{ cloudConfirmDesc }}</p>
              <div class="settings-menu__actions">
                <button
                  type="button"
                  class="settings-menu__action"
                  :disabled="cloudBusy"
                  @click="cloudPendingConfirm = null"
                >
                  {{ t('settings.cloud.cancel') }}
                </button>
                <button
                  type="button"
                  class="settings-menu__action settings-menu__action--primary"
                  :disabled="cloudBusy"
                  @click="confirmPending"
                >
                  {{ cloudConfirmLabel }}
                </button>
              </div>
            </template>

            <p
              v-if="cloudError || cloudNotice"
              class="settings-menu__feedback"
              :class="{ 'is-error': cloudError }"
            >
              {{ cloudError || cloudNotice }}
            </p>
          </div>
        </div>
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
/* 尺寸的单一来源是 --menu-scale（与 ContextMenu 共用同一个值）：模板原值留在 calc() 里
   当被乘数，别把乘出来的结果当成手感值写死 —— HANDOFF 第 5 节坑 33。
   颜色一律走 base.css 的 --menu-* 令牌，这里不写死任何色值。 */
.settings-menu {
  --menu-scale: 0.92;
  position: fixed;
  z-index: 125;
  min-width: calc(220px * var(--menu-scale));
  padding: calc(6px * var(--menu-scale)) 0;
  background: var(--menu-bg);
  border: 1px solid var(--menu-border);
  border-radius: calc(6px * var(--menu-scale));
  box-shadow: var(--menu-shadow);
  visibility: hidden;
  /* 弹开时从齿轮那个角长出来：与右键菜单同一种动画，只是 transform-origin 换成右上 */
  transform-origin: top right;
}

.settings-menu--ready {
  visibility: visible;
  animation: settings-menu-in 0.1s ease;
}

@keyframes settings-menu-in {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
}

.settings-menu__row {
  position: relative;
}

/* 与 ContextMenu 同一套条目写法：通栏方形悬停（容器左右不留内边距给了这份自由）、
   12/20px 左右内边距、行高交给字体的天然行盒 */
.settings-menu__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(12px * var(--menu-scale));
  width: 100%;
  padding: calc(6px * var(--menu-scale)) calc(12px * var(--menu-scale));
  background: transparent;
  border: none;
  border-radius: 0;
  color: var(--menu-text);
  font-family: var(--font-sans, system-ui);
  font-size: calc(13px * var(--menu-scale));
  line-height: normal;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.1s ease, color 0.1s ease;
}

/* 悬停与键盘高亮共用同一种反馈：通栏方块 + 提亮的文字 —— 「这是我的目标」只有一种说法 */
.settings-menu__item.is-active,
.settings-menu__item:hover:not(:disabled) {
  background: var(--menu-hover-bg);
  color: var(--menu-hover-text);
}

.settings-menu__item:focus-visible {
  outline: none;
}

.settings-menu__label {
  white-space: nowrap;
}

/* 右列：键位 / 箭头 / 步进器 / 开关，四选一 */
.settings-menu__tail {
  display: inline-flex;
  align-items: center;
  gap: calc(8px * var(--menu-scale));
  margin-left: auto;
}

.settings-menu__shortcut {
  color: var(--menu-muted);
  font-size: calc(11px * var(--menu-scale));
}

.settings-menu__item.is-active .settings-menu__shortcut {
  color: var(--menu-hover-muted);
}

.settings-menu__chevron {
  color: var(--menu-muted);
  transform: rotate(-90deg);
}

.settings-menu__item.is-active .settings-menu__chevron {
  color: var(--menu-hover-muted);
}

/* 步进器（字号）：± 两颗小方钮夹着当前值。value 一列必须定宽 + 居中 + 等宽数字，
   否则 13 → 14 的那一帧整行会左右弹一下。 */
.settings-menu__step {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: calc(18px * var(--menu-scale));
  height: calc(18px * var(--menu-scale));
  padding: 0;
  border: none;
  border-radius: calc(3px * var(--menu-scale));
  background: transparent;
  color: inherit;
  font-size: calc(13px * var(--menu-scale));
  line-height: 1;
  cursor: pointer;
}

.settings-menu__step:hover {
  background: rgba(255, 255, 255, 0.12);
}

.settings-menu__value {
  min-width: calc(18px * var(--menu-scale));
  text-align: center;
  font-variant-numeric: tabular-nums;
}

/* 开关：与设置面板那只 .switch 同一种语言（轨道 + 圆 thumb，on 时推到右端并填主题色），
   尺寸挂 --menu-scale 让它跟着整组等比缩放 */
.settings-menu__switch {
  position: relative;
  display: inline-block;
  width: calc(22px * var(--menu-scale));
  height: calc(12px * var(--menu-scale));
  flex: 0 0 auto;
  border-radius: calc(6px * var(--menu-scale));
  background: var(--menu-muted);
  transition: background-color 0.14s ease;
}

.settings-menu__switch.is-on {
  background: var(--accent);
}

.settings-menu__thumb {
  position: absolute;
  top: calc(2px * var(--menu-scale));
  left: calc(2px * var(--menu-scale));
  width: calc(8px * var(--menu-scale));
  height: calc(8px * var(--menu-scale));
  border-radius: 50%;
  background: var(--menu-bg);
  transition: transform 0.14s ease;
}

.settings-menu__switch.is-on .settings-menu__thumb {
  transform: translateX(calc(10px * var(--menu-scale)));
}

/* ------------------------------------------------------------------ 二级子菜单
   贴在所属那一行的右侧，顶端与行对齐后再往上让出一个容器内边距，让一级 / 二级的
   首在自己那一侧看齐（手写 -6px 而不是百分比：要的是一小截固定退让，与行高无关）。 */
.settings-menu__sub {
  position: absolute;
  top: 0;
  left: 100%;
  min-width: calc(150px * var(--menu-scale));
  padding: calc(6px * var(--menu-scale)) 0;
  background: var(--menu-bg);
  border: 1px solid var(--menu-border);
  border-radius: calc(6px * var(--menu-scale));
  box-shadow: var(--menu-shadow);
  /* 横向偏移由脚本按需写进 --sub-shift-x（窄屏两侧都放不下时的最后兜底），默认是 0 */
  transform: translate(var(--sub-shift-x, 0px), calc(-6px * var(--menu-scale)));
}

/* 右边放不下就翻到左边（判据见脚本里的那个 watch） */
.settings-menu__sub--left {
  left: auto;
  right: 100%;
}

.settings-menu__item--sub {
  gap: calc(8px * var(--menu-scale));
}

.settings-menu__check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: calc(12px * var(--menu-scale));
  flex: 0 0 auto;
  color: var(--menu-text);
}

.settings-menu__item.is-active .settings-menu__check {
  color: var(--menu-hover-text);
}

.settings-menu__divider {
  height: 1px;
  margin: calc(6px * var(--menu-scale)) calc(10px * var(--menu-scale));
  background: var(--menu-separator);
}

/* ------------------------------------------------------------------ 云端同步表单
   二级里要放输入框 / 验证码 / 操作步骤，比档位列表宽一号、整块竖排。
   尺寸一律乘 --menu-scale（坑 33：要调大小只动那一个数）；颜色走 --menu-* 与通用的
   --border / --bg-control / --accent，不写死色值。 */
.settings-menu__sub--form {
  display: flex;
  flex-direction: column;
  gap: calc(8px * var(--menu-scale));
  min-width: calc(260px * var(--menu-scale));
  /* 已绑定态第一行是三颗按钮，英文那三句长标签会把表单撑得很宽 —— 封个顶，让按钮换行 */
  max-width: calc(320px * var(--menu-scale));
  padding: calc(10px * var(--menu-scale));
}

.settings-menu__input {
  width: 100%;
  padding: calc(5px * var(--menu-scale)) calc(8px * var(--menu-scale));
  border: 1px solid var(--border);
  border-radius: calc(4px * var(--menu-scale));
  background: var(--bg-control);
  color: var(--text);
  font-family: var(--font-sans, system-ui);
  font-size: calc(13px * var(--menu-scale));
}

.settings-menu__input:focus-visible {
  outline: none;
  border-color: var(--accent);
}

/* handle 框与导入 / 登录同一行：框吃掉剩余宽度，按钮不缩、标签不折行。
   `min-width: 0` 是必须的 —— flex 项的默认 `min-width: auto` 会撑住内容不让缩，
   窄屏上整行就会溢出（而不是把框挤窄）。 */
.settings-menu__row {
  display: flex;
  align-items: center;
  gap: calc(6px * var(--menu-scale));
}

.settings-menu__row .settings-menu__input {
  flex: 1 1 0;
  min-width: 0;
}

.settings-menu__row .settings-menu__action {
  flex: 0 0 auto;
  white-space: nowrap;
}

/* 已绑定态的头一行：这台设备在跟谁。用户名长了截断，标记与设置面板那一枚同款
   （等宽、暗色小字），不另造一种徽标样式。 */
.settings-menu__account {
  display: flex;
  align-items: center;
  gap: calc(6px * var(--menu-scale));
  color: var(--menu-muted);
}

.settings-menu__account-name {
  min-width: 0;
  overflow: hidden;
  color: var(--menu-text);
  font-size: calc(12px * var(--menu-scale));
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-menu__account-tag {
  flex: 0 0 auto;
  color: var(--menu-muted);
  font-family: var(--mono-font);
  font-size: calc(10px * var(--menu-scale));
}

.settings-menu__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: calc(8px * var(--menu-scale));
}

/* 按钮与设置面板那颗 .download-button 同一种语言（描边次要 / 实心 accent 主要），
   只是整体跟着菜单缩一号 */
.settings-menu__action {
  height: calc(26px * var(--menu-scale));
  padding: 0 calc(10px * var(--menu-scale));
  border: 1px solid var(--border);
  border-radius: calc(4px * var(--menu-scale));
  background: var(--bg-control);
  color: var(--text);
  font-family: inherit;
  font-size: calc(12px * var(--menu-scale));
  cursor: pointer;
  transition: background-color 0.1s ease;
}

.settings-menu__action:hover:not(:disabled) {
  background: var(--bg-control-hover);
}

.settings-menu__action:disabled {
  color: var(--text-faint);
  cursor: default;
}

.settings-menu__action--primary {
  border-color: transparent;
  background: var(--accent);
  color: var(--text-on-accent);
}

.settings-menu__action--primary:hover:not(:disabled) {
  background: var(--accent-hover);
}

/* 解绑：描边次要按钮，只是文字换警告色 —— 它是「会断开绑定」那颗，不该长得像主行动，
   但也没到要整颗涂红的程度（面板里那颗同款是 `is-uninstall`） */
.settings-menu__action--danger {
  color: var(--danger-text);
}

/* 验证码：与面板那块同一种写法 —— 小标签 + 放大的等宽码 + 一句时效 */
.settings-menu__code {
  display: flex;
  flex-direction: column;
  gap: calc(2px * var(--menu-scale));
}

.settings-menu__code-label,
.settings-menu__code-hint {
  color: var(--menu-muted);
  font-size: calc(11px * var(--menu-scale));
}

/* 码与「复制」同一行：码自己撑开，按钮固定不缩 */
.settings-menu__code-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(8px * var(--menu-scale));
}

/* 嵌在码卡片里的复制按钮：比常规动作按钮矮一号、字小一号，免得压过码本身 */
.settings-menu__copy {
  display: inline-flex;
  align-items: center;
  gap: calc(4px * var(--menu-scale));
  flex: 0 0 auto;
  height: calc(22px * var(--menu-scale));
  padding: 0 calc(8px * var(--menu-scale));
  border: 1px solid var(--menu-border);
  border-radius: calc(4px * var(--menu-scale));
  background: var(--bg-control);
  color: var(--text);
  font-family: inherit;
  font-size: calc(11.5px * var(--menu-scale));
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 0.1s ease, border-color 0.1s ease, color 0.1s ease;
}

.settings-menu__copy:hover {
  background: var(--bg-control-hover);
}

/* 复制成功：转绿 + 对勾，两秒后 codeCopied 自己复位 */
.settings-menu__copy.is-copied {
  border-color: var(--ok);
  background: transparent;
  color: var(--ok);
}

/* 代填：标签较长，主按钮独占一行，说明另起一行 */
.settings-menu__fill {
  display: flex;
  flex-direction: column;
  gap: calc(6px * var(--menu-scale));
}

.settings-menu__fill-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: calc(5px * var(--menu-scale));
  width: 100%;
}

.settings-menu__code-value {
  font-family: var(--mono-font);
  font-size: calc(18px * var(--menu-scale));
  letter-spacing: 0.08em;
  color: var(--menu-text);
  user-select: all;
}

.settings-menu__note {
  margin: 0;
  color: var(--menu-muted);
  font-size: calc(11.5px * var(--menu-scale));
  line-height: 1.5;
}

/* 取码预检那一行的结论色（见 cloudSession 的 cloudCfHint）：绿 = 已确认是这个账号；
   琥珀 = 点之前就知道会失败。刻意没有红色 —— 这是事前提醒，不是已经发生的错误。
   两条 modifier 必须排在本体之后：同名权重，靠顺序覆盖 */
.settings-menu__note--ok {
  color: var(--ok);
}

.settings-menu__note--warn {
  color: var(--warn);
}

.settings-menu__steps {
  margin: 0;
  padding-left: calc(16px * var(--menu-scale));
  color: var(--menu-muted);
  font-size: calc(11.5px * var(--menu-scale));
  line-height: 1.6;
}

.settings-menu__link {
  color: var(--accent);
}

/* 反馈行：报错与提示共用一格，报错才换成警告色（同一时刻只会有一句） */
.settings-menu__feedback {
  margin: 0;
  color: var(--menu-muted);
  font-size: calc(11.5px * var(--menu-scale));
  line-height: 1.5;
}

.settings-menu__feedback.is-error {
  color: var(--danger-text);
}
</style>
