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
import LoadingSpinner from './LoadingSpinner.vue'
import { appViewportBox, onViewportChange } from '../composables/useMobileKeyboard.js'
import { usePopoverLayer } from '../composables/usePopoverLayer.js'
import { formatCombo, useShortcutManager } from '../composables/useShortcutManager.js'
import { t } from '../i18n/index.js'
import { SETTINGS_MENU_ROWS } from '../services/settingsMenu.js'
import { THEMES } from '../services/editorOptions.js'
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
  codeCountdown as cloudCodeCountdown,
  codeMode as cloudCodeMode,
  confirmCloudCode,
  copyCloudCode,
  downloadCloud,
  error as cloudError,
  fillCloudCode,
  fillCodeChained,
  filling as cloudFilling,
  handleInput as cloudHandle,
  loginCloud,
  notice as cloudNotice,
  probeCloud,
  refreshCloudCode,
  splitLinkText,
  syncAccountHandleCase,
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

/** 二级那个盒子：Teleport 到 body、单独定位（见下面 placeSubmenu 那一段） */
const subRoot = ref(null)
/**
 * 此刻这个 `subRoot` 是被哪一行的 `v-if` 挂上来的。
 *
 * 二级各挂在自己那一行的 `v-if` 里，同一时刻只有一份；换展开项时 Vue 按 v-for 的**行序**
 * 逐行 patch：展开项往后换（下标变大）是「先卸旧的、再挂新的」，往回换却反过来 ——
 * 先挂新的、再卸旧的，而卸下发的那发 ref 回调会带一个 `null` 进来，把刚挂好的新盒子抹掉。
 * 于是 `placeSubmenu` 量不到东西、`subPos` 停在 null，二级一直 `visibility: hidden`：
 * 观感就是「先开主题、再开别的、回头再点主题打不开」（2026-11-14 用户报，触屏点按路径
 * 最容易踩 —— 触屏没有悬停，换二级只能点，每一步都走这个卸载）。所以这里记一份归属，
 * 卸下的那一发只清自己那一行，别人的不动。
 */
const subRootIndex = ref(null)
/** 二级的定位结果；null = 还没量好（此时靠样式表的 visibility: hidden 藏着） */
const subPos = ref(null)

/**
 * 二级盒子的 ref 回调（两处 Teleport 共用）。
 *
 * 挂上：记为当前盒子并记下归属；卸下：只有它正是当前这一份时才清空 ——
 * 上面那段说的「后到的 null 抹掉新盒子」就挡在这里。
 */
function bindSubRoot(el, index) {
  if (el) {
    subRoot.value = el
    subRootIndex.value = index
    return
  }
  if (subRootIndex.value !== index) return
  subRoot.value = null
  subRootIndex.value = null
}

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
  // 二级 Teleport 到了 body，不再是主盒的子孙 —— 点它 / 焦点落进去都得算「还在菜单里」
  alsoInside: () => subRoot.value,
})

/**
 * 一级菜单能不能滚。
 *
 * 二级曾经因为「absolute 挂在行上、会被滚动容器裁掉」而在展开时让开这个上限（HANDOFF §54），
 * 代价是一级下沿露出屏幕。2026-11-14 起二级 Teleport 到 body、自己拿一条 fixed 坐标，
 * 一级的 overflow 再也管不到它，所以上限任何时候都照用 —— 见 §55。
 */
const menuScrollable = computed(() => Boolean(position.value.maxHeight))

// ---------------------------------------------------------------------- 键盘漫游
/** 一级表里的高亮下标（含 divider 位，只是 divider 不可选） */
const activeIndex = ref(-1)
/** 展开的二级是哪一个：存它在 SETTINGS_MENU_ROWS 里的下标；null = 不在二级里 */
const openSubmenu = ref(null)
/** 二级里的高亮行 */
const subActiveIndex = ref(0)
const itemRefs = ref([])
/**
 * 盯着二级自己的尺寸（见 `watchSubmenuSize`）：字体 / 文案 / 相一变，宽度就变，定位得跟着重算。
 * 每次展开重新挂一份。
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
 * 收成数组（二级盒子 `subRoot` 同一个坑，见模板里那条注释），`.focus()` 遂报「不是函数」。
 */
const cloudField = ref(null)

/**
 * 这次云端等待是从哪颗按钮起的：只让被点的那颗转圈，其余照常灰着。
 * 判据是本组件自己记的动作名，不拿全局的 `cloudBusy` 去点亮一整排 ——
 * 那一排同时灰着的时候，用户看不出到底哪件事在跑。
 */
const cloudPending = ref('')

async function runCloud(action, fn) {
  if (cloudPending.value) return
  cloudPending.value = action
  try {
    await fn()
  } finally {
    cloudPending.value = ''
  }
}

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

/**
 * 代填那颗的文案 / title：链路版与老版本各一套。判据只有 `fillCodeChained` 一份
 * （与设置面板同一段写法，见 EditorSettingsPanel 的同名 computed）。
 */
const cloudFillLabel = computed(() =>
  t(
    cloudFilling.value
      ? fillCodeChained.value
        ? 'settings.cloud.fillCodeChainBusy'
        : 'settings.cloud.fillCodeBusy'
      : fillCodeChained.value
        ? 'settings.cloud.fillCodeChain'
        : 'settings.cloud.fillCode',
  ),
)
const cloudFillTitle = computed(() =>
  t(fillCodeChained.value ? 'settings.cloud.fillCodeChainTitle' : 'settings.cloud.fillCodeTitle'),
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

// 主题二级：深色一行、浅色一行（与设置面板色卡同一口径，来源都是 editorOptions 的 THEMES）
const themeGroups = [
  { scheme: 'dark', items: THEMES.filter((item) => item.scheme === 'dark') },
  { scheme: 'light', items: THEMES.filter((item) => item.scheme === 'light') },
]

/** 主题卡在 optionsOf 里的全局下标：键盘上下键的高亮仍按扁平顺序走 */
function themeOptionIndex(option) {
  if (openSubmenu.value === null) return -1
  return optionsOf(openSubmenu.value).findIndex((item) => item.id === option.id)
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

/** 执行一级行（switch 翻面 / toggle 换档 / radio 展开二级 / action 打开面板） */
function trigger(index) {
  const row = rows.value[index]
  if (!row || row.kind === 'divider') return
  if (row.kind === 'toggle') {
    // 一键切换：点行空白处 = 翻到另一档；行尾那两颗段钮负责点名（点谁选谁，见模板）。
    // 与 radio 不同，这里不展开二级、菜单也不关 —— 改完常常还想顺手改别的。
    const other = row.options().find((option) => option.id !== row.current())
    if (other) row.select(other.id)
    return
  }
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

/**
 * 指针移进一级行：鼠标才当场展开二级。
 *
 * 【触屏为什么不能走这条】触屏没有「悬停」，`pointerenter` 是在 **touchstart 那一刻**来的，
 * 于是二级立刻插进 DOM；而同一根手指抬起后浏览器补的那发 `click`，是按**那一刻**落点
 * 重新做命中测试的 —— 它会落到刚长出来的二级上。窄屏首当其冲：二级按「两侧都塞不下就夹回
 * 视口」被压在所属那一行上（见 placeSubmenu），第一格「深色」正好在指头下面，于是「点主题」
 * 变成「直接切深色」（2026-11-01 用户报障）。
 * 触屏的展开改由 click 走 `trigger` → `openSubmenuAt`：DOM 在那发 click **之后**才变，
 * 自己长出来的二级就不可能把自己这一下接走。`activeIndex` 仍在这里记 —— 按下即高亮。
 */
function onRowPointerEnter(event, index) {
  window.clearTimeout(closeTimer)
  closeTimer = 0
  activeIndex.value = index
  // 空串的平台（老浏览器 / 合成事件）按鼠标算，与下面 onRootPointerLeave 同一条口径
  if (event?.pointerType && event.pointerType !== 'mouse') return
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

/**
 * 指针从一级行挪进二级：取消待收。
 *
 * 二级 Teleport 到了 body，两个盒子之间不再有包含关系 —— 指针跨过去时一级会先收到一发
 * `pointerleave`（排上 220ms 的收起定时器），只能靠二级这一发 `pointerenter` 把它撤掉。
 * 触屏不算：那条 220ms 的定时器本来就不会为触屏排（见上面 onRootPointerLeave）。
 */
function keepOpen(event) {
  if (event?.pointerType && event.pointerType !== 'mouse') return
  window.clearTimeout(closeTimer)
  closeTimer = 0
}

// 打开即接过焦点：不然 Esc / 方向键都落在别处。高亮钉在第一行而不是容器上，
// 上下键才有起点（滚动容器自身不可聚焦也不会吞掉方向键）。
watch(ready, (shown) => {
  if (shown) nextTick(() => focusRow(FIRST_SELECTABLE.value))
})

/**
 * 二级的定位：Teleport 到 body、`position: fixed`，按所属那一行的实测盒子摆。
 *
 * 以前它 `position: absolute` 挂在行上，于是躲不开两件事：一级在矮视口里被压了
 * `max-height`、变成滚动容器时，二级会被裁进容器里；而一级的视口收敛又管不到它，
 * 得再自己算一次上抬 / 左右挪，两套坐标的来源还不一样。现在它自己拿一条 fixed 坐标：
 *
 * - 横向：**往哪边长只看一级站在屏幕哪一半** —— 一级在左半屏就往右长、在右半屏就往左长。
 *   刻意不问「哪边塞得下」：窄屏上一级 202 + 二级 278 本来就超过一屏，右侧永远不够，
 *   按「塞得下」判就会把二级翻到左边、整段压在所属那一行上，两级叠成一坨
 *   （2026-11-14 触屏用户报）。按半屏判则始终是「一级在左、二级在右」这种错开的读法；
 *   真放不下时夹回视口，允许压住一级的一角 —— **不必强求不重叠**（同日用户口径），
 *   为躲重叠去收窄二级反而把它的胶囊挤成一列、长出一大截，得不偿失。
 * - 纵向：顶端与所属行对齐后往上让一截容器内边距，底部放不下就整体上抬，
 *   比可视范围还高时压 `max-height` 自己滚。
 *
 * 「可视范围」取 `appViewportBox()`（与应用层 `.app.is-keyboard` 同一份几何）：
 * 键盘顶起来时上沿是 `--vv-top`，只认底边会把二级抬到应用上方那块空白里去。
 *
 * 返回量到的几何给收敛循环比对；没得量（行没挂出来）时返回 null。
 */
async function placeSubmenu() {
  await nextTick()
  const el = subRoot.value
  const row = rowElement()
  if (!el || !row) return null
  const box = appViewportBox()
  const rect = row.getBoundingClientRect()
  const width = el.offsetWidth || el.getBoundingClientRect().width
  const scale = menuScaleOf(el)

  // 二级贴着一级的哪条边：基准取**一级盒子的边框盒**，不是那一行 ——
  // 行比盒子窄 1px 边框，拿行算出来的二级会压在一级的边线上。
  const menuRect = root.value?.getBoundingClientRect() ?? rect
  const middle = (box.left + box.right) / 2
  const toRight = menuRect.left + menuRect.width / 2 < middle
  let left = toRight ? menuRect.right : menuRect.left - width
  left = Math.max(box.left + GAP, Math.min(left, box.right - width - GAP))

  // 量自然高度前先把身上的 max-height 让开，否则「视口长回去、上限该撤掉」永远发现不了
  const applied = el.style.maxHeight
  el.style.maxHeight = 'none'
  const natural = el.offsetHeight || el.getBoundingClientRect().height
  el.style.maxHeight = applied
  const span = box.bottom - box.top - GAP * 2
  const capped = span > 0 && natural > span
  const height = capped ? span : natural

  // 上沿与那一行对齐后再让出一截容器内边距：让一级 / 二级的第一个条目在自己那一侧看齐
  // （旧 CSS 靠 translateY(-6px * scale)，换算成绝对坐标就是这个 inset）
  const wantTop = rect.top - 6 * scale
  const top = Math.max(box.top + GAP, Math.min(wantTop, box.bottom - height - GAP))

  subPos.value = {
    left: `${left}px`,
    top: `${top}px`,
    maxHeight: capped ? `${span}px` : undefined,
  }
  return { left, top, width, height }
}

/**
 * 二级的缩放系数从它自己的 `--menu-scale` 读。
 *
 * Teleport 出去之后它不再继承 `.settings-menu` 上那个变量（样式表里已经给它补了同一档），
 * 这里也读同一份，别在脚本里再写一个 0.92 —— 改大小仍然只动样式表那一处。
 */
function menuScaleOf(el) {
  const scale = Number.parseFloat(getComputedStyle(el).getPropertyValue('--menu-scale'))
  return Number.isFinite(scale) && scale > 0 ? scale : 1
}

/** 当前展开的那一行：从行按钮往上找 `.settings-menu__row`（比按选择器数第几个可靠） */
function rowElement() {
  const index = openSubmenu.value
  if (index === null) return null
  return itemRefs.value[index]?.closest?.('.settings-menu__row') ?? null
}

/**
 * 分帧收敛：一级菜单弹开后的头一百来毫秒还在 0.95 → 1 的缩放入场动画里，行位置每帧都在变，
 * 量一次就定死会偏。量到连续两帧不动就收工，最多 12 帧。
 */
async function settleSubmenu() {
  let prev = null
  for (let pass = 0; pass < 12; pass += 1) {
    const now = await placeSubmenu()
    if (!now) return
    if (prev && sameSpot(prev, now)) return
    prev = now
    await new Promise((resolve) => requestAnimationFrame(resolve))
  }
}

/** 两帧量到的位置 / 尺寸是不是同一个（半个像素内算同一个） */
function sameSpot(a, b) {
  return ['left', 'top', 'width', 'height'].every((key) => Math.abs(a[key] - b[key]) <= 0.5)
}

/**
 * 一级滚动了：二级是 fixed 的，不会跟着行走，得按行的新位置重算一次。
 * 用 rAF 收一下 —— 惯性滚动时会连着来几十发。
 */
let scrollRaf = 0
function onMenuScroll() {
  if (openSubmenu.value === null || scrollRaf) return
  scrollRaf = requestAnimationFrame(() => {
    scrollRaf = 0
    placeSubmenu()
  })
}

watch(openSubmenu, async (index) => {
  subPos.value = null
  subObserver?.disconnect()
  subObserver = null
  if (index === null) return
  await nextTick()
  // 云端同步那一行：表单一展开就把焦点送进用户名框。框空着时把本机认得的那一位填进去
  // （先认已绑定的账号、再认「本机在跟谁」），导入过一次之后就不必把用户名重打一遍。
  if (rows.value[index]?.kind === 'cloud') {
    // 老账号的存档可能还是随手填的大小写：这里要显示账号名，顺手核对一次（一个会话只问一次）
    void syncAccountHandleCase()
    if (!cloudHandle.value.trim()) {
      cloudHandle.value = cloudAccount.value.handle || readActiveProfile().handle
    }
    nextTick(focusCloudField)
  }
  await settleSubmenu()
  watchSubmenuSize()
})

/**
 * 二级的宽度不是写死的，是**内容算出来的**（用户名框的固有宽度、按钮文字、账号名长短），
 * 而字体会在打开之后的一百来毫秒里陆续换上去 —— 逐帧实测：414×896 下它从 227.23 慢慢长到
 * 239.19（约 120ms / 7 帧）。于是首次定位量到的是「还没长开」的那一份，右缘就出屏一截；
 * 换语言、切到验证码 / 确认相、账号名变长变短也都属于同一类变化。
 *
 * 所以盯着它自己的尺寸：一长一缩就重算一次定位（定位改的是 left / top，不改它的
 * border-box，因此不会自己触发自己）。每次展开重新挂。
 */
function watchSubmenuSize() {
  if (typeof ResizeObserver === 'undefined') return
  const el = subRoot.value
  if (!el) return
  subObserver = new ResizeObserver(() => settleSubmenu())
  subObserver.observe(el)
}

/**
 * 视口变了就重新定位一次：手机上点进用户名框会顶起软键盘，视口矮一截 ——
 * 一级菜单由 usePopoverLayer 重新匣进视口，二级得按行的新位置 / 新可视范围跟上。
 *
 * 两个触发源都要挂：
 * - `window.resize`：桌面拖窗 / 旋转；
 * - `onViewportChange`：useMobileKeyboard 实测出来的 `--vvh` / `--vv-top` 变化 ——
 *   **收键盘那一下有的引擎一个 resize 都不派发**（安卓 Firefox），而那时视口恰恰变高了，
 *   二级要是不重算，就会留在「按键盘弹着时那点高度算出来的」位置上，整块飘在所属那一行
 *   上方几百像素处（2026-11-07 用户报「关掉键盘后显示错位」，截图里那个表单就是飘着的）。
 */
function onViewportResize() {
  if (openSubmenu.value !== null) settleSubmenu()
}
window.addEventListener('resize', onViewportResize)
const offViewport = onViewportChange(onViewportResize)

/**
 * 一级菜单自己也动了（换边重锚、视口收敛改位置）时，二级要重新定位。
 *
 * 二级是 fixed 的，按所属那一行的实测盒子摆 —— 一级挪一格，行也跟着挪，上一轮算出来的
 * 绝对坐标就不再成立。触发源的先后不保证（重锚在父组件、收敛在 usePopoverLayer），
 * 所以不指望通知的顺序，改成盯 position 本身。
 */
watch(position, () => {
  if (openSubmenu.value !== null) settleSubmenu()
})

onBeforeUnmount(() => {
  window.clearTimeout(closeTimer)
  window.cancelAnimationFrame(scrollRaf)
  scrollRaf = 0
  window.removeEventListener('resize', onViewportResize)
  offViewport()
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

/** 一键切换行的「当前档」：按 current() 在档位表里反查，找不到（值异常）退回第一档 */
function currentOption(row) {
  return row.options().find((option) => option.id === row.current()) ?? row.options()[0]
}
</script>

<template>
  <Teleport to="body">
    <div
      ref="root"
      class="settings-menu"
      :class="{ 'settings-menu--ready': ready, 'settings-menu--scroll': menuScrollable }"
      :style="position"
      role="menu"
      :aria-label="t('app.settings')"
      @keydown="onRootKeydown"
      @pointerleave="onRootPointerLeave"
      @scroll.passive="onMenuScroll"
    >
      <template v-for="(row, index) in rows" :key="row.id ?? index">
        <div v-if="row.kind === 'divider'" class="settings-menu__divider" role="separator"></div>

        <!-- 一级行：可点的是里面那颗 <button>；二级在下面 Teleport 到 body 单独定位，
             这里只留一个 pointerenter 用来换展开项 -->
        <div v-else class="settings-menu__row" @pointerenter="onRowPointerEnter($event, index)">
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

              <!-- 两档一键切换（侧边栏位置 / 窄屏折叠方向）：行尾一颗钮，显示当前档
                   （形如「左侧」），点一下翻到另一档。与步进器同款：内嵌在行按钮里，
                   事件自己 .stop —— 点这颗钮翻面；点行空白处走外层的 trigger，同样是翻面。 -->
              <button
                v-else-if="row.kind === 'toggle'"
                type="button"
                class="settings-menu__seg"
                :aria-label="optionLabel(currentOption(row))"
                @pointerdown.stop
                @click.stop="trigger(index)"
              >
                {{ optionLabel(currentOption(row)) }}
              </button>

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

          <!-- 二级单独 Teleport 到 body、fixed 定位（见 placeSubmenu）：这样一级在矮视口里
               压高度、出现滚动条时也不会把它裁掉，两级各自夹进可视范围。
               注意 ref 用函数写法：这段还在 `v-for` 里，字符串 ref 会被 Vue 收成数组。 -->
          <Teleport v-if="row.kind === 'radio' && openSubmenu === index" to="body">
            <div
              :ref="(el) => bindSubRoot(el, index)"
              class="settings-menu__sub"
              :class="{ 'settings-menu__sub--ready': subPos }"
              :style="subPos"
              role="menu"
              :aria-label="t(row.labelKey)"
              @keydown="onRootKeydown"
              @pointerenter="keepOpen"
              @pointerleave="onRootPointerLeave"
            >
              <!-- 主题：10 档横排成两行（深色一行、浅色一行）。竖排列表在这里会长到
                   比屏幕还高，也不利于一次扫完；键盘仍按扁平顺序上下走（见 themeOptionIndex） -->
              <div v-if="row.id === 'theme'" class="settings-menu__theme-rows">
                <div v-for="group in themeGroups" :key="group.scheme" class="settings-menu__theme-row">
                  <button
                    v-for="option in group.items"
                    :key="option.id"
                    type="button"
                    class="settings-menu__theme-chip"
                    :class="{
                      'is-active': subActiveIndex === themeOptionIndex(option),
                      'is-on': row.current && option.id === row.current(),
                    }"
                    role="menuitemradio"
                    :aria-checked="row.current ? option.id === row.current() : undefined"
                    tabindex="-1"
                    @click.stop="pickOption(row, option)"
                    @pointerenter="subActiveIndex = themeOptionIndex(option)"
                  >
                    {{ optionLabel(option) }}
                  </button>
                </div>
              </div>

              <template v-else>
                <button
                  v-for="(option, optionIndex) in row.options()"
                  :key="option.id"
                  type="button"
                  class="settings-menu__item settings-menu__item--sub"
                  :class="{
                    'is-active': subActiveIndex === optionIndex,
                    'settings-menu__item--with-icon': option.icon,
                  }"
                  :role="row.current ? 'menuitemradio' : 'menuitem'"
                  :aria-checked="row.current ? option.id === row.current() : undefined"
                  tabindex="-1"
                  @click.stop="pickOption(row, option)"
                  @pointerenter="subActiveIndex = optionIndex"
                >
                  <!-- 打勾位常驻（哪怕这一档没选中也占位），选中的标记出现时文字不横向弹跳。
                       设置分类那几档带图标：图标就占这一格 —— 它本来对分类永远空着，
                       两者不会同时出现，文字左缘也不动 -->
                  <span v-if="option.icon" class="settings-menu__icon" aria-hidden="true">
                    <AppIcon :name="option.icon" :size="12" />
                  </span>
                  <span v-else class="settings-menu__check" aria-hidden="true">
                    <AppIcon v-if="row.current && option.id === row.current()" name="check" :size="12" />
                  </span>
                  <span class="settings-menu__label">{{ optionLabel(option) }}</span>
                </button>
              </template>
            </div>
          </Teleport>

          <!-- 云端同步的二级：一个小表单，三相互斥（填用户名 / 看验证码 / 问一句确认）。
               整块竖排、比档位列表宽一号；点里面任何一处都不该牵动一级那一行的行为。
               与档位列表一样 Teleport 到 body、单独定位（见 placeSubmenu）。 -->
          <Teleport v-else-if="row.kind === 'cloud' && openSubmenu === index" to="body">
            <div
              :ref="(el) => bindSubRoot(el, index)"
              class="settings-menu__sub settings-menu__sub--form"
              :class="{ 'settings-menu__sub--ready': subPos }"
              :style="subPos"
              role="group"
              :aria-label="t(row.labelKey)"
              @keydown="onRootKeydown"
              @pointerenter="keepOpen"
              @pointerleave="onRootPointerLeave"
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
                      @click="runCloud('upload', uploadCloud)"
                    >
                      <LoadingSpinner v-if="cloudPending === 'upload'" :size="11" />
                      <span>{{ t('settings.cloud.upload') }}</span>
                    </button>
                    <button
                      type="button"
                      class="settings-menu__action"
                      :disabled="cloudBusy"
                      @click="runCloud('download', downloadCloud)"
                    >
                      <LoadingSpinner v-if="cloudPending === 'download'" :size="11" />
                      <span>{{ t('settings.cloud.download') }}</span>
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
                    @keydown.enter.prevent="
                      cloudBound
                        ? runCloud('import', runCloudImport)
                        : runCloud('login', loginCloud)
                    "
                  />
                  <button
                    type="button"
                    class="settings-menu__action"
                    :class="{ 'settings-menu__action--primary': cloudBound }"
                    :disabled="cloudBusy"
                    @click="runCloud('import', runCloudImport)"
                  >
                    <LoadingSpinner v-if="cloudPending === 'import'" :size="11" />
                    <span>{{ t('settings.cloud.import') }}</span>
                  </button>
                  <button
                    v-if="!cloudBound"
                    type="button"
                    class="settings-menu__action settings-menu__action--primary"
                    :disabled="cloudBusy"
                    @click="runCloud('login', loginCloud)"
                  >
                    <LoadingSpinner v-if="cloudPending === 'login'" :size="11" />
                    <span>{{ t('settings.cloud.login') }}</span>
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
                  <!-- 倒计时：见面板侧同一行，判据与文案都由 cloudSession 的 codeCountdown 给 -->
                  <span
                    class="settings-menu__code-timer"
                    :class="{ 'is-expired': cloudCodeCountdown.expired }"
                  >
                    {{ t(cloudCodeCountdown.key, cloudCodeCountdown.params) }}
                  </span>
                  <span class="settings-menu__code-hint">{{ t('settings.cloud.codeHint') }}</span>
                </div>
                <p class="settings-menu__note">{{ cloudCodeIntro }}</p>
                <!-- 代填只在装了扩展（且扩展自报 fill-code 能力）时出现；没装的用户看到的与改动前
                     一样。扩展能回报「保存完了」时（fill-saved）它会把验证也一起做完，文案随之换成
                     链路版 —— 下面那两步是给人手动填的路子，两种情况都照旧摆着。 -->
                <div v-if="canFillCode" class="settings-menu__fill">
                  <button
                    type="button"
                    class="settings-menu__action settings-menu__action--primary settings-menu__fill-btn"
                    :disabled="cloudBusy || cloudFilling"
                    :title="cloudFillTitle"
                    @click="fillCloudCode"
                  >
                    <LoadingSpinner v-if="cloudFilling" :size="11" />
                    <AppIcon v-else name="codeforces" :size="12" />
                    <span>{{ cloudFillLabel }}</span>
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
                  <!-- 过期后「验证」必然被打回，这里直接换成「重新取码」（与面板那颗同一判据） -->
                  <button
                    v-if="cloudCodeCountdown.expired"
                    type="button"
                    class="settings-menu__action settings-menu__action--primary"
                    :disabled="cloudBusy"
                    @click="runCloud('refresh', refreshCloudCode)"
                  >
                    <LoadingSpinner v-if="cloudPending === 'refresh'" :size="11" />
                    <span>{{ t('settings.cloud.refreshCode') }}</span>
                  </button>
                  <button
                    v-else
                    type="button"
                    class="settings-menu__action settings-menu__action--primary"
                    :disabled="cloudBusy"
                    @click="runCloud('verify', confirmCloudCode)"
                  >
                    <LoadingSpinner v-if="cloudPending === 'verify'" :size="11" />
                    <span>{{ cloudVerifyLabel }}</span>
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
                    @click="runCloud('confirm', confirmPending)"
                  >
                    <LoadingSpinner v-if="cloudPending === 'confirm'" :size="11" />
                    <span>{{ cloudConfirmLabel }}</span>
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
          </Teleport>
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
  /* 换边 / 折叠这类 View Transition 里必须自己成组：浮层 Teleport 到 body、排在 #app 之后，
     成组后画在两栏快照之上；不成组的话它只是 root 快照的一部分，会被两栏的组盖住 ——
     观感就是「换边那一下菜单闪没了、动画结束又冒出来」（2026-11-01 用户报）。
     自身位置变化（换边后重锚）也因此跟着布局一起移动，而不是硬跳。 */
  view-transition-name: settings-menu;
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

/**
 * 匣比菜单矮时（矮窗口 / 键盘顶起来只剩一小条）由 usePopoverLayer 压一个 max-height，
 * 这里负责让整份表能滚到 —— 否则最底下的「同步设置」永远点不到。
 *
 * 任何时候都能挂：二级已经 Teleport 到 body、单独 fixed 定位（见 placeSubmenu），
 * 不再受一级这个滚动容器的裁剪影响（2026-11-14，HANDOFF §55）。
 */
.settings-menu--scroll {
  overflow-y: auto;
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
:where(html.is-hoverable) .settings-menu__item:hover:not(:disabled) {
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

:where(html.is-hoverable) .settings-menu__step:hover {
  background: rgba(255, 255, 255, 0.12);
}

.settings-menu__value {
  min-width: calc(18px * var(--menu-scale));
  text-align: center;
  font-variant-numeric: tabular-nums;
}

/* 两档一键切换（侧边栏位置 / 窄屏折叠方向）：行尾一颗小钮，显示当前档（如「左侧」），
   点一下翻到另一档。**亮度**跟同列的步进器读数（.settings-menu__value）对齐 —— 它读的也是
   「当前值」，压成 muted 会在菜单里显得暗一档；**字号**比它小一档（12 对 13）：段钮是行尾
   的状态胶囊，跟正文同号会抢行首标签。2026-11-01 用户要求「再小一点」定的这一档。
   亮底沿用步进器 hover 那份白（菜单这一层自有一套 --menu-* 变量，不认主题的输入框底），
   尺寸挂 --menu-scale 跟整组等比缩放。 */
.settings-menu__seg {
  display: inline-flex;
  align-items: center;
  padding: calc(2px * var(--menu-scale)) calc(7px * var(--menu-scale));
  border: none;
  border-radius: calc(3px * var(--menu-scale));
  background: transparent;
  color: var(--menu-text);
  font-size: calc(12px * var(--menu-scale));
  line-height: 1.2;
  cursor: pointer;
  transition: background-color 0.14s ease, color 0.14s ease;
}

.settings-menu__item.is-active .settings-menu__seg {
  color: var(--menu-hover-text);
}

:where(html.is-hoverable) .settings-menu__seg:hover {
  background: rgba(255, 255, 255, 0.14);
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
   Teleport 到 body、`position: fixed`，坐标由脚本按所属那一行实测给出（见 placeSubmenu）；
   这里只负责长相。

   ⚠️ 它已经不在 `.settings-menu` 里了，那个盒子上定义的 `--menu-scale` 继承不过来，
   所以这里必须补同一档。改大小仍然是两处一起动（`.settings-menu` 与这里），别只改一处。
   颜色不用管：`--menu-*` 令牌挂在 `:root` 上，Teleport 到 body 照样拿得到。
   z-index 要压过一级（125），否则二级会被一级盖在下面。 */
.settings-menu__sub {
  --menu-scale: 0.92;
  position: fixed;
  z-index: 126;
  min-width: calc(150px * var(--menu-scale));
  padding: calc(6px * var(--menu-scale)) 0;
  background: var(--menu-bg);
  border: 1px solid var(--menu-border);
  border-radius: calc(6px * var(--menu-scale));
  box-shadow: var(--menu-shadow);
  /* 量好之前藏着（与一级的 --ready 同一套路）：fixed 元素还没有 left / top 时落在
     文档流的静态位置，露出半帧就会在屏幕角落闪一下 */
  visibility: hidden;
  /* 比可视范围还高时（矮窗口 / 键盘顶起来）脚本会压一个 max-height，这里负责滚 */
  overflow-y: auto;
}

.settings-menu__sub--ready {
  visibility: visible;
}

.settings-menu__item--sub {
  gap: calc(8px * var(--menu-scale));
}

/* 主题二级：深色一组、浅色一组；组内按宽度弹性排列（auto-fill），放不下就换行，
   不压成一条挤在一起的窄条。宽度与最小胶囊宽都随 --menu-scale 缩放。 */
.settings-menu__theme-rows {
  display: flex;
  flex-direction: column;
  gap: calc(6px * var(--menu-scale));
  padding: calc(4px * var(--menu-scale)) calc(6px * var(--menu-scale));
  width: calc(300px * var(--menu-scale));
}

.settings-menu__theme-row {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(calc(68px * var(--menu-scale)), 1fr));
  gap: calc(4px * var(--menu-scale));
}

.settings-menu__theme-chip {
  min-height: calc(24px * var(--menu-scale));
  padding: calc(3px * var(--menu-scale)) calc(4px * var(--menu-scale));
  border: 1px solid var(--menu-border);
  border-radius: calc(4px * var(--menu-scale));
  background: transparent;
  color: var(--menu-text);
  font: inherit;
  font-size: calc(11.5px * var(--menu-scale));
  line-height: 1.2;
  text-align: center;
  cursor: pointer;
}

:where(html.is-hoverable) .settings-menu__theme-chip:hover,
.settings-menu__theme-chip.is-active {
  border-color: var(--menu-muted);
}

/* 选中档铺色，和竖排列表里「高亮 + 打勾」的读法一致 */
.settings-menu__theme-chip.is-on {
  background: var(--menu-hover-bg);
  border-color: var(--menu-hover-bg);
  color: var(--menu-hover-text);
}

/* 带图标的二级项（「设置分类」）：图标紧挨文字，不跟着 space-between 被甩到最左、
   文字孤零零顶到右缘（实测图标右缘 232、文字左缘 275–311 不等）。有图标的一档
   才是「图标 + 名字」的一行，其余档位列表仍是打勾位 + 右对齐的短标签。
   用一个类而不是 `:has()`：后者要 Firefox 121+ 才有，老一档的安卓 Firefox 会退回上面的排法。 */
.settings-menu__item--with-icon {
  justify-content: flex-start;
}

.settings-menu__check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: calc(12px * var(--menu-scale));
  flex: 0 0 auto;
  color: var(--menu-text);
}

/* 二级里带图标的那几档（设置分类）：占的正是打勾位那一格，尺寸也照它 ——
   于是有图标与没图标的二级项左缘一致，文字不会因多一颗图标整体右移。
   颜色跟着名字走（与上面 .settings-menu__check 同一口径）：这一格是**行首图标**，
   不是行尾的附注信息，用 muted 会比名字暗一档（浅色下 even 反过来更亮）；
   --menu-muted 留给箭头 / 快捷键 / 步进器那些真正的次要位。 */
.settings-menu__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: calc(12px * var(--menu-scale));
  flex: 0 0 auto;
  color: var(--menu-text);
}

.settings-menu__item.is-active .settings-menu__icon {
  color: var(--menu-hover-text);
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: calc(5px * var(--menu-scale));
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

:where(html.is-hoverable) .settings-menu__action:hover:not(:disabled) {
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

:where(html.is-hoverable) .settings-menu__action--primary:hover:not(:disabled) {
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

/* 倒计时：与面板同一套写法 —— 等宽定宽数字防抖，到点转 --warn 并换回正文字体 */
.settings-menu__code-timer {
  color: var(--menu-text);
  font-family: var(--mono-font);
  font-size: calc(11.5px * var(--menu-scale));
  font-variant-numeric: tabular-nums;
}

.settings-menu__code-timer.is-expired {
  color: var(--warn);
  font-family: inherit;
  font-variant-numeric: normal;
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

:where(html.is-hoverable) .settings-menu__copy:hover {
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
