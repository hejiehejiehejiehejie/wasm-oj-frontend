/**
 * shellSettings —— 「外壳」那一层偏好的模块级单例：侧边栏位置、窄屏折叠方向、全局界面缩放。
 *
 * 【为什么单独抽出来】前两项原本写在 App.vue 里（`cp.panelPosition` / `cp.uiScale`），
 * App 是唯一持有方，别的入口要改它们就只能往上 emit、再经 prop 传回来。设置下拉菜单
 * （`SettingsMenu.vue`）挂在侧栏页头与折叠后的图标栏里，离 App 隔着两层，为了改一次
 * 侧边栏位置去拉一条 emit 链不值得 —— 编辑器偏好抽到 `services/editorSettings.js`
 * 是同一个理由，那边注释里有更详细的说法。
 *
 * 抽成单例之后，App.vue 与菜单读的是同一份 ref、写的是同一个入口，
 * 「菜单改完 App 立刻跟着变」不需要任何同步代码。
 *
 * 【「外壳」指什么】属于整个界面、而不是某个文件或某种语言的偏好：侧边栏在左还是右、
 * 窄屏折叠后图标栏贴上边还是下边、整套界面放多大。判据是「它会在很多意料之外的入口里
 * 被想起来要去改」。
 * 分工是：
 * - `editorSettings.js`：编辑器那一组偏好（Monaco 那 24 项）
 * - 本文件：外壳偏好
 * - `i18n/index.js` / `fileTemplates.js` / `useShortcutManager.js` 等：各自领域的偏好，
 *   本来就是模块级单例（自带持久化），不搬进来
 */
import { nextTick, ref, watch } from 'vue'
import {
  applyUiScale,
  DEFAULT_UI_SCALE,
  normalizeUiScale,
  uiScale as uiScaleSingleton,
} from '../composables/useUiScale.js'
// 触屏判定的唯一口径住在 composable 里（它还另外导出一份给「不许程序化抢焦点」那类调用点复用），
// 窄屏判据的**判值**走它；下面那处同款 matchMedia 只用来听 change 事件，不自己判一遍
import { isTouchPointer } from '../composables/useMobileKeyboard.js'

/**
 * 这几个键自己读写 localStorage，**刻意不用 usePersistentRef**。
 *
 * 那份 composable 的「首次访问也落盘」靠 `onMounted` —— 而服务层模块是在组件之外
 * 被 import 的，那里没有组件实例，那条钩子根本不会执行（Vue 只会给一句警告）。
 * 后果是第一次打开站点时不留下存档，回归脚本读 `cp.panelPosition` 得到 null。
 * 所以这里照 `editorSettings.js` / `i18n/index.js` / `fileTemplates.js` 那一体例：
 * 模块自己读盘，再用 `immediate` 的 watch 写回去（首值也立刻落盘）。
 */
const PANEL_POSITION_KEY = 'cp.panelPosition'
const UI_SCALE_KEY = 'cp.uiScale'
const NARROW_COLLAPSE_SIDE_KEY = 'cp.narrowCollapseSide'

function read(key, fallback, revive) {
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null || raw === undefined) return fallback
    const value = JSON.parse(raw)
    return revive ? revive(value) : value
  } catch {
    return fallback
  }
}

function persist(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 隐私模式或配额已满：只在内存里工作 */
  }
}

/**
 * 本项目的核心布局偏好：'left' | 'right'，默认在左侧。
 *
 * 注意它决定的是**两栏谁先谁后**（App.vue 里的 order），与「侧边栏有没有折叠」
 * （App 自己的 panelVisible）不是一回事。
 */
export const panelPosition = ref(read(PANEL_POSITION_KEY, 'left', (value) => (value === 'right' ? 'right' : 'left')))
watch(panelPosition, (value) => persist(PANEL_POSITION_KEY, value), { immediate: true })

/**
 * 两档的取值名。**档位表的唯一出处在这里**（i18n 只管文案）：设置面板那个下拉与菜单的
 * 二级子菜单都 import 这一份，加第三档只改这里。顺序是「左 → 右」，与两栏的实际排布一致。
 */
export const PANEL_POSITIONS = [
  { id: 'left', labelKey: 'settings.option.sideLeft' },
  { id: 'right', labelKey: 'settings.option.sideRight' },
]

/**
 * 窄屏（手机 / 平板竖屏）下，折叠后的图标栏贴工作区的哪条边：'bottom'（默认）| 'top'。
 *
 * 【只管窄屏】宽屏折叠后图标栏是贴侧栏那一侧的**竖条**（48px 宽、满高），没有上下之分 ——
 * 所以这一项在宽屏上是空转的，改了也看不出（判据见本文件下面的 `isNarrowLayout()`）。
 * 于是**两处设置入口都只在窄屏摆出这一行**（2026-10-13 用户要求：设置菜单里它是噪音）——
 * 靠行上的 `when: () => isNarrowLayout()` 过滤（本文件下面那个出口），
 * 见 `settingsMenu.js` / `EditorSettingsPanel.vue` 的 `appearanceRows`。
 *
 * 【与 panelPosition 正交】那个管「侧栏在左还是在右」（宽屏的主轴方向），
 * 这个管「窄屏折叠后图标栏贴哪条边」（窄屏的主轴方向）。四个组合都成立、互不推导。
 */
export const narrowCollapseSide = ref(
  read(NARROW_COLLAPSE_SIDE_KEY, 'bottom', (value) => (value === 'top' ? 'top' : 'bottom')),
)
watch(narrowCollapseSide, (value) => persist(NARROW_COLLAPSE_SIDE_KEY, value), { immediate: true })

/**
 * 两档的取值名（与 PANEL_POSITIONS 同一体例：**档位表的唯一出处在这里**，i18n 只管文案）。
 * 顺序按中文里的「上下」来 —— 只是列表顺序，默认值仍是 'bottom'（第二档），
 * 与 2026-10-13 定这条形态时一样。
 */
export const NARROW_COLLAPSE_SIDES = [
  { id: 'top', labelKey: 'settings.option.sideTop' },
  { id: 'bottom', labelKey: 'settings.option.sideBottom' },
]

/**
 * 指定窄屏折叠后的图标栏贴哪条边（设置菜单与设置面板两处走这里）。
 *
 * 与 setPanelPosition 不同，这里**不走 View Transitions**：它只在窄屏生效，改的是那一条
 * 通栏横条落在主轴的头还是尾，没有「两栏互换」那种大范围重排（编辑器宽度也不变），
 * 直切即可 —— 真为它播一次整屏快照补间，反而会把设置菜单一起拍进去。
 */
export function setNarrowCollapseSide(next) {
  if (next !== 'top' && next !== 'bottom') return
  narrowCollapseSide.value = next
}

/**
 * 当前是不是「窄屏」（手机 / 平板竖屏那一套形态）—— **判据的唯一副本**。
 * 两条取并集，任一成立即窄屏：
 *   ① 触摸设备 **且 设备竖屏**（读 `screen` 的朝向，不是视口的高宽比）；
 *   ② 视口宽 ≤ 600px（与设备无关的硬底线）。
 * 命中时给 `<html>` 挂 `is-narrow`，CSS 那三处就认这个类（写 `:where(html.is-narrow) …`，
 * 见 Sidebar.vue / App.vue）；同时也写进下面这个 ref 给 JS 侧读。
 *
 * 【为什么不再写在 CSS 的 `@media` 里】（2026-10-13）`@media` 只能看**布局视口**，
 * 而软键盘弹起时安卓会把布局视口削矮（Tauri 那个 WebView 随窗口收缩，网页层的
 * `interactive-widget` 拦不住）—— 竖屏当场翻成 landscape、`(orientation: portrait)`
 * 不成立，整个窄屏形态在打字那一瞬间全弹回宽屏。用户报的「唤出键盘之后竟然退出了窄屏模式」
 * 就是这个。实测（无头 Chrome、平板竖屏 768×1024、键盘把布局视口削到 768×700）：
 * 旧查询由 true 变 false、`.sidebar__head` 的 `display` 从 `contents` 掉回 `flex`；
 * 同一刻 `screen` 仍是 768×1024、`screen.orientation.type` 仍是 `portrait-primary`。
 * 键盘改不动的是**设备朝向**，所以 ① 改读 screen；② 读的是宽度，键盘也改不动。
 *
 * 【副作用（有意）】视口朝向与设备朝向不一致时以**设备**为准：手机上开「桌面版网站」
 * （视口 980 宽、设备仍竖屏）现在也算窄屏 —— 这本来就是 ① 想表达的那句「竖屏的触摸设备」。
 * 正常形态下两者一致，探针 8 条既有判据逐条与改前相同。
 *
 * ⚠️ 判据只剩这一份：CSS 那三处不再各写一条 `@media`，只认这个类，改判据只改这里。
 * 有三个消费方：
 * - `App.vue` 的 `measureLimits`：窄屏的折叠折点不走「中点」那条算式，改用固定的指针容差
 *   `NARROW_HINGE_PX = 30`（指针离边缘 30px 内就折叠；2026-10-13 用户第二次改口径 —— 上一版
 *   取「最窄宽度的一半」，390 档落在离边缘 94.5px 处，太远、容易误触）。宽屏保持 2026-10-11 的
 *   「折叠后图标栏 48px 与最窄宽度的中点」。判据仍是这一条，只是折算出来的线不同 —— 现取现用。
 * - `settingsMenu.js` 的 `SETTINGS_MENU_ROWS` 与 `EditorSettingsPanel.vue` 的 `SHELL_ROWS`：
 *   「窄屏折叠方向」那一行**只在窄屏出现**（2026-10-13 用户要求；宽屏上它是空转的，
 *   摆在那里只是噪音）—— 两处都靠行上的 `when: () => isNarrowLayout()` 过滤。
 *
 * 底层刻意是**一个 ref**（不是每次现查）：上面那两处设置入口是按响应式依赖缓存的计算值 /
 * 渲染结果，现查会让它们把第一帧的答案一直缓存着（旋屏后那一行不回来）。
 * 不出这个 ref、只出函数：读的都是「此刻是不是窄屏」，没人需要它的历史值。
 */
const NARROW_MAX_WIDTH = 600
const NARROW_CLASS = 'is-narrow'

// 设备是不是竖屏。优先读 ScreenOrientation（语义最直白），不认它的浏览器退回比屏幕宽高。
// 两者描述的都是**屏幕**：键盘弹起、地址栏收放都改不动它们 —— 这一条的全部意义就在这里。
function isPortraitScreen() {
  const orientation = window.screen?.orientation
  if (typeof orientation?.type === 'string' && orientation.type) {
    return orientation.type.startsWith('portrait')
  }
  const screen = window.screen
  return Boolean(screen) && screen.height >= screen.width
}

const computeNarrowLayout = () =>
  (isTouchPointer() && isPortraitScreen()) || window.innerWidth <= NARROW_MAX_WIDTH

const narrowLayout = ref(false)
// 旋屏 / 拖窗口 / 分屏当场变。键盘那一次 resize 也会进来，但上面两条判据都读不到键盘
// （宽度不变、screen 不变），答案不会跟着抖 —— 这正是要的效果。
function applyNarrowLayout() {
  narrowLayout.value = computeNarrowLayout()
  document.documentElement.classList.toggle(NARROW_CLASS, narrowLayout.value)
}
// 与上面那几个偏好一样是页面生命周期的单例，不回收：监听挂在模块上，全局只有一份
window.addEventListener('resize', applyNarrowLayout)
window.addEventListener('orientationchange', applyNarrowLayout)
window.screen?.orientation?.addEventListener?.('change', applyNarrowLayout)
// 判据的三个输入要各有一条变更来源：视口宽 → resize；设备朝向 → orientationchange /
// screen.orientation 的 change；**主指针是不是触摸 → 这条**（平板插拔键盘、接上鼠标这类
// 场景下它真会变，只在 resize 上等会漏掉，答案就停在旧值上）。
// 这里只用它拿 change 事件，**判值仍旧走 isTouchPointer()** —— 口径只有一份，别在这儿再判一次。
window.matchMedia('(pointer: coarse)').addEventListener('change', applyNarrowLayout)
// 与 applyUiScale 一样在模块加载时就落一次：早于首帧渲染，不会先按宽屏画一帧再跳到窄屏
applyNarrowLayout()

export function isNarrowLayout() {
  return narrowLayout.value
}

/**
 * 全局界面缩放（档位 100% / 110% / 125% / 150%，默认 100%）。
 *
 * CSS 的 px 已被 postcss-pxtorem 转成 rem，所以这里只需要写一次根字号；物理尺寸
 * 与拖拽数学都不受影响（三条边界见 useUiScale.js 顶部）。
 */
export const uiScalePref = ref(read(UI_SCALE_KEY, DEFAULT_UI_SCALE, normalizeUiScale))
watch(uiScalePref, (value) => persist(UI_SCALE_KEY, value), { immediate: true })

// 模块被 import 的那一刻就把缩放落到根字号上：早于首帧渲染，不会先按 100% 画一帧
// 再跳到目标档位（这条语句连同它的注释是从 App.vue 原样搬来的）
applyUiScale(uiScalePref.value)
watch(uiScalePref, applyUiScale)

/** 当前真实倍数（Monaco 侧要乘它）：与上面那个 ref 同一个单例，各处直接读它 */
export { uiScaleSingleton as uiScale }

/**
 * 系统「减弱动效」。全局那条兜底（`base.css` 的 `* { animation-duration: 0.01ms }`）压的是
 * CSS 动画，而**通配选择器不匹配伪元素** —— View Transitions 的时长恰恰挂在
 * `::view-transition-old / new` 上（同文件那 260ms），光靠 CSS 拦不住，所以凡是要播 VT
 * 的地方都得在 JS 里先问这一句。与 App.vue 的 `togglePanel` 同一口径（那边折叠也守它）。
 * 读的是 `.matches` 而不是包一层响应式：两个调用点都是「点一下才走一次」的动作，
 * 现取现判即可。
 */
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

/**
 * 把侧边栏换到另一侧（快捷键 `toggle-layout` 与设置面板那个下拉走这里）。
 *
 * 它只是「目标 = 另一边」的简写，真正的动作在 `setPanelPosition` —— 两个入口共用
 * 同一份动画实现，免得哪天只改了一处。
 */
export function flipPanelPosition() {
  setPanelPosition(panelPosition.value === 'right' ? 'left' : 'right')
}

/**
 * 指定侧边栏在哪一侧（设置菜单二级里那两档走这里）。
 *
 * 关键约束：这里只改 flex-direction / order，DOM 结构与 Monaco 实例都不动，
 * 所以切换布局不会销毁重建编辑器（不会闪屏）。改这块时别引入 `v-if`。
 *
 * 选的与当前相同时什么都不做 —— 用户点的是已经生效的那一档，那不是「再翻一次」。
 */
export function setPanelPosition(next) {
  if (next !== 'left' && next !== 'right') return
  if (next === panelPosition.value) return
  const apply = () => {
    panelPosition.value = next
  }
  // 减弱动效：整段直切。闸门放在最前面 —— 这一句同时管住下面两条路，
  // 免得开着减弱动效还让 settle 状态白翻一趟（它有 base.css 压着，看是看不出来，
  // 但没必要留个「在播」的状态）。口径与 App.vue 折叠那边一致。
  if (reduceMotion.matches) {
    apply()
    return
  }
  // 不支持 View Transitions 的浏览器：一步到位，不播任何动画 —— 与侧栏折叠同一口径
  // （2026-10-14 晚用户拍板统一）。这里原先会挂一个 `is-swapping` 类、让两栏自绘一段
  // 280ms 的 settle（`App.vue` 的 `pane-settle`），那是「同一类动作的第二种降级形态」；
  // 既然是降级，两边就都降成「直接翻」，那一套已连同 `swapping` 一起删掉。
  if (typeof document.startViewTransition !== 'function') {
    apply()
    return
  }
  // View Transitions 路径：只翻一次状态，位置与宽度由浏览器按快照补间
  document.startViewTransition(() => {
    apply()
    return nextTick()
  })
}
