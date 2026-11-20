<script setup>
/**
 * Sidebar —— 统一侧边栏外壳：页头（面板切换 + 各面板的上下文动作）+ 内容区两个面板
 * （具名插槽由 App.vue 填入 FileExplorer / TestPanel）。
 *
 * 页头只有一份（2026-10-11 重构）：切换器曾经渲染在两个面板各自的页头里、靠 v-show
 * 藏一个来「看起来只有一份」，代价是滑动动画只能用 keyframes 假装、两份 DOM 要防
 * 首屏误播。现在切换器上提到这里、全站单实例，滑动是真实的 transform 过渡；
 * 右侧的上下文动作区（新建文件/文件夹、verdict + 耗时）仍归各面板所有 ——
 * 它们经 Teleport 投进 #sidebar-context，只投当前激活的那一份。
 *
 * 两个面板都用 v-show 切换（不是 v-if）：文件树的展开态、评测样例里用户手写的输入
 * 与卡片折叠态都挂在 DOM 上，不能因切换而销毁重建。
 *
 * 页签状态与持久化都留在这里，经 provide 下发给页头里的切换组件与两个面板。
 * 宽度与显隐不在这里管：外层 .pane--tests 作为一个整体参与与 Monaco 的分屏拖拽
 * （见 App.vue 的 .splitter 与 measureLimits）。
 */
import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import SidebarSwitcher from './SidebarSwitcher.vue'
import ContextMenu from './ContextMenu.vue'
import { t } from '../i18n/index.js'
import { isTouchPointer } from '../composables/useMobileKeyboard.js'
import { usePersistentRef } from '../composables/usePersistentRef.js'
import { uiScale } from '../composables/useUiScale.js'
import { countdown } from '../services/countdown.js'
import { flipPanelPosition, isNarrowLayout } from '../services/shellSettings.js'
import {
  closeSettingsTab,
  codeforcesTab,
  openSettingsTab,
  settingsTab,
} from '../services/editorViews.js'
import { closeTestsPane, hasTestsPane } from '../services/editorPanes.js'

// 侧栏停靠在哪一侧（'left' / 'right'，状态归 services/shellSettings.js，由 App 透传进来）。
// 本组件只拿它算一件事：窄屏底部那颗「收起侧栏」的箭头朝哪边（见下面的 collapseEntry）。
const props = defineProps({
  panelPosition: { type: String, default: 'left' },
})

// 收起侧栏：窄屏底部那条上那颗箭头按钮。动作本身不在本组件（折叠是 App 的 togglePanel ——
// 宽度、动画、View Transitions 全在那儿），这里只派发出去，与拖分隔条到边界走的是同一条路。
const emit = defineEmits(['collapse'])

// 侧边栏里的两个面板。数组顺序就是页头胶囊里两段的顺序。
// 只存 key：翻译必须发生在渲染那一刻（见 i18n 的调用纪律），下面的两个 computed 负责 t()。
// labelKey 是全称（title / aria-label 用），shortLabelKey 是胶囊段位上图标旁的短标签。
// iconActive 是「这一栏正开着」时的图标（可选，2026-11-12 加）：资源管理器开着一枚
// 掀盖的文件夹（Lucide `folder-open`），与组件那颗的 grid / grid-open 是同一套语言。
// ⚠️ 折叠态那条图标栏（ActivityBar）**不吃** iconActive：那时侧栏整个收着、面板并没有
// 打开，它照旧画合着的 folder —— 见 SidebarSwitcher 里选图标那一处。
const PANEL_TABS = [
  {
    id: 'explorer',
    labelKey: 'app.sidebar.explorer',
    shortLabelKey: 'app.sidebar.explorerShort',
    icon: 'files',
    iconActive: 'folder-open',
  },
  {
    id: 'tests',
    labelKey: 'app.sidebar.tests',
    shortLabelKey: 'app.sidebar.testsShort',
    icon: 'cases',
  },
]

/** 给一个页签补上当前语言的显示名（全称 + 短标签） */
const withLabel = (tab) => ({
  ...tab,
  label: t(tab.labelKey),
  shortLabel: t(tab.shortLabelKey),
})

// 当前页签：默认落在资源管理器，与改动前的默认视觉一致
const activeTab = usePersistentRef('cp.sidebarTab', 'explorer')
// 存档里可能是旧值 / 脏值：认不出来就退回默认页签，免得两个面板被一起藏掉
if (!PANEL_TABS.some((tab) => tab.id === activeTab.value)) activeTab.value = 'explorer'

// 评测岛在编辑区里时（全站单活），侧栏由「资源管理器」独占。这里要分开两个概念：
//   · availableTabs —— **能切换**的面板（动作路由：toggle / 快捷键 / showPanel 的兜底）；
//   · panels         —— 页头**要画**的面板，永远是两段；评测那段标 `detached`，
//                       表达「它不是另一个待选页签，而是在编辑区里」。
// 别再合并成一份：外置态若把评测段从 DOM 里删掉，页头左侧就塌成两颗孤零零的工具钮，
// 宽度也会骤降一整枚胶囊（2026-11-20 用户报）。胶囊保持原尺寸，点下去只有一个动作：
// 把评测收回来（见 togglePanel / dockTestsPanel）。
// 评测页本身仍在 DOM 里（岛在时由 App 的 v-if 不挂第二份），岛收回后原样回来。
const testsDocked = computed(() => hasTestsPane())
const availableTabs = computed(() =>
  testsDocked.value ? PANEL_TABS.filter((tab) => tab.id !== 'tests') : PANEL_TABS,
)
watch(
  testsDocked,
  (docked) => {
    if (docked && activeTab.value === 'tests') activeTab.value = 'explorer'
  },
  // immediate：冷启动就带着岛（布局是恢复出来的）时，存档里的 tests 页签要当场让位，
  // 否则会落进「文件面板藏着、评测面板又没挂载」的空白侧栏。
  { immediate: true },
)

// 页头胶囊（定稿形态见 SidebarSwitcher 头注释）：两段并排、当前段填亮，
// 整枚是一颗 toggle 按钮 —— 点轨道上任意位置都翻到另一个面板。
// 设置那颗独立：它开关的是编辑区里的合成页签，与面板互不排斥（见第 5 节坑 7），
// 不进胶囊（进同一个胶囊就暗示它也是面板之一，且是同一个单选组）。
const panels = computed(() =>
  PANEL_TABS.map((tab) => ({
    ...withLabel(tab),
    active: tab.id === activeTab.value,
    // 外置态（2026-11-20）：评测岛在编辑区里，这一段不再表示「另一个可选面板」，
    // 而是「评测现在在编辑区，点一下收回来」。视觉与点击语义见 SidebarSwitcher
    // 的 .is-detached 一段；ActivityBar 也读这个字段。
    detached: tab.id === 'tests' && testsDocked.value,
    // 打开态图标一次性补齐：消费方只判 `active ? iconActive : icon`，不再自己查表
    iconActive: tab.iconActive ?? tab.icon,
  })),
)

// 胶囊上要写的是「将要去的那一个」：整枚是一个动作按钮，文案得说清点下去会去哪
const targetPanel = computed(() =>
  withLabel(availableTabs.value.find((tab) => tab.id !== activeTab.value) ?? availableTabs.value[0]),
)

// 外置态的胶囊只有一个动作（收回评测），文案不能再说「切换到评测样例」。
// 正常态那句与 verify-ui 的 A 组钉在一起（`切换到评测样例`），改词条要同步改探针。
const pillTitle = computed(() =>
  testsDocked.value
    ? t('app.sidebar.dockTests')
    : t('app.sidebar.switchTo', { panel: targetPanel.value.label }),
)

function togglePanel() {
  // 外置态：胶囊整枚就是「把评测收回来」，不存在「翻到另一页」——那一页此刻没有挂载
  if (testsDocked.value) {
    dockTestsPanel()
    return
  }
  // 只有两个面板时就是「另一个」；写成 find 是为了数组真变长时也不会错得很离谱
  const next = availableTabs.value.find((tab) => tab.id !== activeTab.value)
  if (!next) return
  activeTab.value = next.id
}

/**
 * 把编辑区里的评测岛收回侧栏，并把侧栏翻到评测页。
 *
 * `closeTestsPane()` 是同步改树的：树一变，App 那个 `v-if="!testsPaneOpen"` 的 #tests
 * 槽与下面的 v-show 会在**同一次渲染**里对齐，不会先亮出一块空面板。
 * 关不掉（理论上到不了）就什么都不做 —— 不能留一个 activeTab='tests' 的空侧栏。
 */
function dockTestsPanel() {
  if (!closeTestsPane()) return
  activeTab.value = 'tests'
}

function toggleSettings() {
  // 再点一次＝收起设置，回到刚才那个代码文件（与顶栏那颗齿轮的旧行为一致）
  settingsTab.active ? closeSettingsTab() : openSettingsTab()
}

// 设置那颗整条做成一个 computed 对象：属性跟着 settingsTab 走，
// 下发给子组件后在模板里直接写 settings.active 就行（不用 .value）
const settingsEntry = computed(() => ({
  icon: 'gear',
  label: t('app.settings'),
  active: settingsTab.active,
}))

// 「组件」那颗（2026-10-20 起是这个身份）：点它弹出组件菜单（ComponentsMenu），
// 菜单里是 Codeforces 与倒计时并排的两格（2026-11-14 起不分「类」了，抬头只写「组件」）。
// 按钮不再跟着 cfReady 显隐（过去叫 Codeforces 那颗时是「没下载就不渲染」）：
// 工具那一类与 Codeforces 装没装无关，卸载了模块照样要有入口。
// 开着任一组件（Codeforces 页签或倒计时卡）时填亮，与齿轮「填亮＝开着」同一种语言。
const componentsEntry = computed(() => ({
  icon: 'grid',
  label: t('components.menu.title'),
  active: codeforcesTab.active || countdown.open,
}))

// 「收起侧栏」那颗（2026-10-13 加，只出现在窄屏的底部那条上）：
// 箭头指向**侧栏收走的方向** —— 停在左朝左（←）、停在右朝右（→），位置也贴那一侧的外端，
// 所以「箭头指哪、按钮就在哪、点下去就往哪收」三者一致。它与折叠后那条图标栏是互补的：
// 展开态从这里收起来，折叠态在图标栏上点回来。
const collapseEntry = computed(() => ({
  icon: props.panelPosition === 'right' ? 'chevron-right' : 'chevron-left',
  side: props.panelPosition === 'right' ? 'right' : 'left',
  label: t('app.sidebar.collapse'),
  toggle: () => emit('collapse'),
}))

// ------------------------------------------------------------ 页头右键菜单（2026-11-19 加）
/**
 * 页头右键＝折叠态那条图标栏右键菜单里的「侧边栏移到左/右侧」这一项（用户口径）。
 *
 * 判据与 ActivityBar 的 onBarContextMenu 完全一致：**窄屏 / 触屏不接管**。
 * 窄屏页头是 display: contents、左簇已经沉到侧栏底部，没有桌面意义上的「页头」；
 * 触屏长按同样会派发 contextmenu，放开会让长按页头冒出一份桌面菜单。
 * 这两种情况直接 return（不 preventDefault），交给全局那条兜底。
 */
const headMenuAt = ref(null)

function onHeadContextMenu(event) {
  if (isNarrowLayout() || isTouchPointer()) return
  event.preventDefault()
  headMenuAt.value = { x: event.clientX, y: event.clientY }
}

// 动作项写「移到另一侧」而不是「当前在哪侧」—— 与 ActivityBar 的 barMenuItems 同一套文案
const headMenuItems = computed(() => [
  {
    id: 'flip-side',
    label: t(props.panelPosition === 'right' ? 'components.bar.moveLeft' : 'components.bar.moveRight'),
  },
])

function onHeadMenuSelect(id) {
  headMenuAt.value = null
  if (id === 'flip-side') flipPanelPosition()
}

// ------------------------------------------------------------ 页头的两种自适应
const rootEl = ref(null)

// ① 两档紧凑：判定文案先收、胶囊段位标签后收（2026-11-01 用户要求「异步收窄」）。
//   - verdictCompact（< 400 逻辑 px）：评测面板页头的「全部 AC / n/m AC」先换短文案
//     （去掉「 AC」后缀，见 TestPanel 的 verdict），这一档先省下 ~25px；
//   - compact：胶囊段位再收起文字标签、退回纯图标 —— 带标签那一份**实测**，右侧上下文
//     动作区按**常规内容的固定预留**估（理由与取值见下）。
//   两档分开而不是共用一条：一起收的话，页头会在同一档宽度上「整排缩一下」。
//
//   分界线怎么算（2026-11-20 用户问「是不是太宽、还有很大空间」）：
//     sidebarW ≥ 左内边距 4 + 带标签的切换器 208 + 右内边距 8 + 预留 76 ≈ 296
//   （预留 76 里已经含两簇间距 8 与常规内容 61~67；判据就是「页头右沿 − 切换器右沿 ≥ 76」。）
//   之前预留取 120（「耗时 + 判定」最宽那一档），于是 344 才放行、而平时右侧只占 54~67，
//   中间那一大段就白留了。现在按**常驻内容**取值：资源管理器两颗图标钮 54、评测的
//   「无测试用例 / 0/2 AC」61~67 —— 76 刚好盖住（再小会在两个面板之间出现几像素的翻面带），
//   随 uiScale 缩放（与 verdictCompact 的 400 同口径）。跑完带耗时的结论会到 98 左右，
//   真放不下时页头先折行，由下面的单向收合接住；不会为了它把整条线抬到三百四十多。
//
//   稳定性怎么保（2026-11-20 用户两次报「胶囊换来换去」）：
//   - **不观察 #sidebar-context**。那簇宽度跟着文件和运行结果变；只在侧栏宽度变了时完整
//     重判（含「弹回带标签」），页头自己折行（= 内容真放不下）时只许收、不许弹。
//     于是内容变化最多让标签收一次，绝不会来回翻。
//
//   两条滞回（hysteresis）：折了立刻收；回弹平时要多留 8px（`slack >= 16` = 两簇间距 8 +
//   呼吸 8），中间这一档维持现状，免得拖分隔条压在临界点上抖。侧栏正在**变宽**时按 0 放行
//   （见 onMounted 的 judge）：挂载那一帧宽度从 0 长上来，不给这条出口会把临界宽度锁死。
//   （slack 是「带标签时」两簇之间的空当；收到最紧时它就是那条 gap = 8。）
//
//   用 ResizeObserver 而不用 @container：页头里有 fixed 定位的浮层（SettingsMenu），
//   container-type 附带的 layout containment 会把它的定位基准从视口改到页头。
const compact = ref(false)
const verdictCompact = ref(false)
const headEl = ref(null)
let compactObserver = null

/**
 * 右侧上下文动作区在**判据里**占的宽度（逻辑 px，随 uiScale 缩放）。
 * 76 = 两个面板的常规内容（资源管理器 54 / 评测 61~67）留一点余量 —— 再小就会在
 * 两个面板之间出现几像素的翻面带（一侧放得下、另一侧差 2~3px）。
 * 别按最坏文案（带耗时的 98+）取：那条会把分界线抬到 340 多，平时白留一大截
 * （2026-11-20 用户报）；真放不下由「折行只收不弹」那条兜住，不会来回翻。
 */
const CONTEXT_RESERVE = 76

/** 页头「带标签」时还放得下吗；顺便回一段左右余量给滞回用 */
function headFitWithLabels() {
  const head = headEl.value
  // 窄屏页头是 display: contents（没有自己的盒子），那一档不吃 compact —— 底栏另有判据
  if (!head || head.getClientRects().length === 0) return null
  const nav = head.querySelector('.sidebar-switcher')
  const ctx = head.querySelector('.sidebar__context')
  if (!nav || !ctx) return null

  const wasCompact = nav.classList.contains('is-compact')
  if (wasCompact) nav.classList.remove('is-compact')
  const navBox = nav.getBoundingClientRect()
  const ctxBox = ctx.getBoundingClientRect()
  if (wasCompact) nav.classList.add('is-compact')

  // ctx 贴右（margin-left: auto），右缘就是页头内容区的右沿；按固定预留算余量，
  // 此刻是哪个面板、结论文案多长都不影响判据（见上面 ①）
  const slack = ctxBox.right - navBox.right - CONTEXT_RESERVE * uiScale.value
  // 同一行时 ctx 在 nav 里垂直居中（ctx.top < nav.bottom），折到第二行才会掉到它下面
  const wrapped = slack < 0 || ctxBox.top >= navBox.bottom - 0.5
  return { wrapped, slack }
}

// ② 滚动显影：列表没滚动时页头与正文一色（2026-10-04「透明页头」的定稿不变）；
//   一旦内容滚动，页头下沿浮出 1px 发丝线，交代「内容正从页头底下穿过」。
const headScrolled = ref(false)
const scrollCleanups = []

/** 读当前激活面板的滚动容器：scrollTop > 0 就给页头描边 */
function syncHeadScrolled() {
  const selector = activeTab.value === 'explorer' ? '.explorer__tree' : '.cases'
  const scroller = rootEl.value?.querySelector(selector)
  headScrolled.value = (scroller?.scrollTop ?? 0) > 0
}

// 切面板后按新面板的滚动位置重算（两个面板的 scrollTop 各自独立）
watch(activeTab, syncHeadScrolled)

onMounted(() => {
  // 两个面板都常驻 DOM（v-show），两个滚动容器这时都已存在
  for (const selector of ['.explorer__tree', '.cases']) {
    const scroller = rootEl.value?.querySelector(selector)
    if (!scroller) continue
    scroller.addEventListener('scroll', syncHeadScrolled, { passive: true })
    scrollCleanups.push(() => scroller.removeEventListener('scroll', syncHeadScrolled))
  }
  syncHeadScrolled()

  /**
   * @param {boolean} allowExpand 是否允许「弹回带标签」。只有侧栏宽度真的变了才允许 ——
   *   内容变宽 / 页头折行触发的这一轮只许收（内容回瘦时不跟着弹，否则切文件就来回翻）。
   * @param {number} expandAt 回弹需要的余量：平常留 16px 呼吸带；侧栏正在**变宽**时
   *   按 0 放行 —— 挂载那一帧宽度是从 0 长上来的，不给这条出口的话，临界宽度会被
   *   一次「窄宽度下的提前收合」永久锁在图标档（同一个宽度、刷新两次结果不一样）。
   */
  const judge = (allowExpand = true, expandAt = 16) => {
    const width = rootEl.value?.getBoundingClientRect().width ?? 0
    // 阈值是逻辑尺寸，要随 uiScale 走（与 useUiScale 的 px() 同口径）
    verdictCompact.value = width > 0 && width < 400 * uiScale.value
    const fit = headFitWithLabels()
    if (!fit) return
    if (fit.wrapped) compact.value = true
    else if (allowExpand && fit.slack >= expandAt) compact.value = false
    // 夹在中间就维持现状：这一条就是滞回带，别改成 else compact = false
  }
  // 盯两处：侧栏宽度（rootEl，完整重判）与页头自身高度（headEl，只用来兜底折行）。
  // **不观察 .sidebar__context**：那簇宽度跟着文件 / 运行结果变，一观察就等于把内容
  // 放回判据，胶囊会随切文件来回翻（见上面 ①）。
  let lastWidth = 0
  compactObserver = new ResizeObserver((entries) => {
    const width = rootEl.value?.getBoundingClientRect().width ?? 0
    const widthChanged = entries.some((entry) => entry.target === rootEl.value)
    const grew = widthChanged && width > lastWidth + 0.5
    if (widthChanged) lastWidth = width
    judge(widthChanged, grew ? 0 : 16)
  })
  if (rootEl.value) {
    compactObserver.observe(rootEl.value)
    if (headEl.value) compactObserver.observe(headEl.value)
  }
  judge()
})

onBeforeUnmount(() => {
  scrollCleanups.forEach((cleanup) => cleanup())
  compactObserver?.disconnect()
})

provide('sidebarTabs', {
  panels,
  targetPanel,
  pillTitle,
  testsDocked,
  togglePanel,
  settings: settingsEntry,
  toggleSettings,
  components: componentsEntry,
  collapse: collapseEntry,
  // 两个面板拿它判「是不是该我把上下文动作投进页头」；切换器拿它判要不要收起文字标签
  activeTab,
  compact,
  // 评测面板专用：verdict 换短文案的阈值比胶囊标签的更宽（见上面 ① 的说明）
  verdictCompact,
})

// 供父组件从外部切到指定面板（如 App.vue 在开跑时要把「评测样例」亮出来）。
// 状态与持久化仍只在这一处，这里只是多一个入口，不让父组件自己存一份
function showPanel(id) {
  // 评测岛在编辑区时点「评测」（折叠态活动栏、拖回入口都走这里）＝ 把它收回来，
  // 而不是切到一个此刻没有挂载的页签。availableTabs 在这条分支之后才会放行。
  if (id === 'tests' && testsDocked.value) {
    dockTestsPanel()
    return
  }
  if (availableTabs.value.some((tab) => tab.id === id)) activeTab.value = id
}

/**
 * 快捷键（Mod+Shift+E）的「翻到另一个面板」：只在 availableTabs 里翻。
 * 不外置时它与 togglePanel 完全等价；外置时**是 no-op** —— 快捷键不该顺手把
 * 评测岛收回来，那是胶囊那一颗有明确文案与视觉的动作。
 */
function switchAvailablePanel() {
  const next = availableTabs.value.find((tab) => tab.id !== activeTab.value)
  if (next) activeTab.value = next.id
}

defineExpose({
  showPanel,
  // 供快捷键用（App.vue 的 switch-panel）：走的仍是「翻到另一个面板」这一条，
  // 只是在外置态下不把评测算进可翻的那一组（见 switchAvailablePanel 的注释）。
  // 动画与持久化照旧一致，不会出现「键盘切过去没动画」这种两套行为。
  switchPanel: switchAvailablePanel,
  // 供折叠态那条图标栏用（ActivityBar）：它要画「有哪两个面板、我停在哪一个、
  // 哪一个外置在编辑区（detached）」，但它不是本组件的子组件（是工作区的兄弟节点），
  // inject 够不到这里的 provide，所以由 App 把这份（已翻译、带 active / detached 的）
  // 表透传过去，状态仍只有这里一份
  panels,
})
</script>

<template>
  <div ref="rootEl" class="sidebar">
    <!-- 全站唯一的一份侧栏页头：左边是面板切换 + 抽题 + 设置（SidebarSwitcher），
         右边 #sidebar-context 是当前面板 Teleport 上来的上下文动作
         （资源管理器 = 新建文件/文件夹；评测样例 = verdict + 耗时）。 -->
    <header
      ref="headEl"
      class="sidebar__head"
      :class="{ 'is-scrolled': headScrolled }"
      @contextmenu="onHeadContextMenu"
    >
      <div class="sidebar__switcher"><SidebarSwitcher /></div>
      <span id="sidebar-context" class="sidebar__context"></span>
    </header>

    <div class="sidebar__body">
      <!-- data-panel：「现在停在哪个面板」的机器可读出处（无头回归按它判）。
           页头胶囊虽然也画了当前段，但从 DOM 反推「哪一段算选中」要连着读 class，
           不如在这里直接标一个数据集属性稳。 -->
      <div v-show="activeTab === 'explorer'" class="sidebar__panel" data-panel="explorer">
        <slot name="explorer" />
      </div>
      <div v-show="activeTab === 'tests'" class="sidebar__panel" data-panel="tests">
        <slot name="tests" />
      </div>
    </div>

    <!-- 页头右键菜单（自己 Teleport 到 body，挂在这里只为就近读状态） -->
    <ContextMenu
      v-if="headMenuAt"
      :x="headMenuAt.x"
      :y="headMenuAt.y"
      :items="headMenuItems"
      @select="onHeadMenuSelect"
      @close="headMenuAt = null"
    />
  </div>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  /* 岛面（--bg-panel，05:54 便当盒模型）：侧栏是一座岛，外层 .pane--tests 同铺
     --bg-panel + 微光沿；折叠态那条图标栏见 ActivityBar 的 .activity-bar，
     两处必须同值，别只改一处。 */
  background: var(--bg-panel);
}

/* ---------------------------------------------------------------- 页头
   不铺底纹（2026-10-04 定稿不变）：侧栏展开后它是整栏最上一条，整块侧栏从头到尾
   一个色，胶囊自己浮在上面。底边那 1px 留给滚动显影 —— 常时透明、不占视觉，
   列表一滚动才描成发丝线（.is-scrolled），所以常态高度仍是 35px 不抖动。
   折行本不该发生：computed 那边的 compact 会在「带标签放不下」时先收标签（见 headFitWithLabels）。
   留 flex-wrap 是给极窄档兜底（侧栏压到 ~230 以下，连纯图标 + 判定簇都摆不开）。 */
.sidebar__head {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  row-gap: 4px;
  box-sizing: border-box;
  min-height: 35px;
  padding: 4px 8px 4px 4px;
  background: transparent;
  border-bottom: 1px solid transparent;
  transition: border-color 0.15s ease;
}

.sidebar__head.is-scrolled {
  border-bottom-color: var(--border-soft);
}

/* 页头左侧那一块（面板胶囊 + 抽题 + 齿轮）的壳。宽屏下它只是页头里一个普通 flex 项；
   窄屏下这一整块要沉到侧栏底部（见下面的窄屏段），所以单独包一层 —— 直接把规则盖在
   SidebarSwitcher 的根上会和它自己的 scoped 规则撞特异性（两边都是 (0,2,0)，
   谁在样式表里靠后谁赢，跨组件不可控），包一层就没有这个不确定性。 */
.sidebar__switcher {
  display: flex;
  flex: 0 0 auto;
  min-width: 0;
}

/* 页头右侧的上下文动作位：当前面板经 Teleport 把动作投进来。
   折到第二行时仍然贴右（margin-left: auto） */
.sidebar__context {
  display: flex;
  align-items: center;
  min-width: 0;
  margin-left: auto;
}

/* 换面板时右侧动作区整体换了一份：淡入一下，不要硬跳。
   挂 > * 上：投进来的那份根节点一挂载就播，与是哪块内容无关 */
.sidebar__context > * {
  animation: sidebar-context-in 0.16s ease;
}

@keyframes sidebar-context-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* ---------------------------------------------------------------- 内容区
   占满剩余高度；面板过长时由面板自己滚动，不撑破外层卡片 */
.sidebar__body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.sidebar__panel {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* ---------------------------------------------------------------- 窄屏：左簇沉底（2026-10-13）
   侧栏宽度跟着视口收（.pane--tests 的 min-width = clamp(160px, 50%, 240px)，
   实测 320px 视口下只剩 181px），而页头那一排「胶囊 + 抽题 + 齿轮 + 当前面板动作」
   最窄要 ~200px（装了抽题模块 ~221px，uiScale 110% 再涨一成）—— 挤不下就 flex-wrap
   折到第二行，看着就是「一排图标挤在一起又错位」。用户定的路子不是加宽侧栏，
   而是**窄屏把左簇整块搬到侧栏底部**：那里空间宽裕，又落在拇指区。

   做法是 display: contents 把页头**整条解散**，让它的两个子元素升成 .sidebar 的
   直接 flex 项，再用 order 把左簇排到最后一行 —— 底部那条因此是**真的一条**
   （占位、不压内容），不是浮在树上的抽屉。

   ⚠️ 不用 position: absolute 钉底：那得自己找包含块，而祖先链上一旦出现 transform，
   位置当场就跳 —— 原先的出处是展开动画给 .sidebar__head 加的那一下（App.vue 的
   panel-fade-in），它 2026-10-14 已随 CSS 补间删掉，同晚换边兜底的 is-swapping 也没了，
   所以这条现在属于「谁再加一条带 transform 的动画它就复活」的预防性说明。
   眼下站得住的是结构那条：display: contents 不生成盒子、不进定位体系，底部那条才能是
   flex 里真的一条（占位、不压内容），而不是浮在树上。

   判据（2026-10-13 定，同日从 CSS 挪进 JS）：**两条取并集**，任一成立即走窄屏布局 ——
     ① 触摸设备 + **设备**竖屏：竖屏的触摸设备，即手机竖屏与平板竖屏（横屏不算，横向不稀缺）。
        用 pointer 而不用宽度，是为了把「桌面窄窗口」排除在外（它有鼠标键盘，给移动形态反而碍事）。
        ⚠️ pointer 只认**主**指针：带触摸屏的笔记本主指针是触摸板 → 报 fine、不命中
        （要「只要存在触摸就命中」那种语义得写 any-pointer: coarse）。
     ② 视口宽 ≤ 600px：与设备无关的硬底线。视口窄到这个程度，页头那排**客观上**放不下
        （最坏要 ~221px，见上），不论输入方式都得走窄屏布局 —— 用户明确要求保留这条。
   600px 的来历：侧栏宽 ≈ 0.53 × 视口，按最坏 ~221px（uiScale 110% 时 ~243px）反推，
   会折行的范围到 ~450px 视口为止；取 600 是留余量的整数，桌面正常窗口（≥ 900px）不受影响。
   ⚠️ ① 的代价：**平板竖屏也会沉底**（768×1024 时侧栏 301px 本来够放那排、不折行）——
   这是有意的形态选择（竖屏横向稀缺），不是修 bug。
   ⚠️ ② 是**物理 px**、不随 cp.uiScale 走（布局尺寸是 rem）：uiScale 130% 时物理 600px
   只等于 ~461 逻辑 px，这条会偏宽松（该切时没切）。要口径一致得让判据读根字号。

   ⚠️ **判据只有一份**：`services/shellSettings.js` 的 `isNarrowLayout()`，命中时给 `<html>`
   挂 `is-narrow`；本块与 App.vue 那两块只认这个类。**别再往这儿加 @media 副本** ——
   `@media` 只能看**布局视口**，而软键盘一弹安卓就把布局视口削矮（Tauri 的 WebView 随窗口
   收缩，网页层的 `interactive-widget` 拦不住）：竖屏当场翻成 landscape，整个窄屏形态在打字
   那一瞬间全弹回宽屏（用户 2026-10-13 报「唤出键盘之后竟然退出了窄屏模式」，探针实测
   768×1024 被削成 768×700 时旧查询由 true 变 false）。判据里那句「设备竖屏」现在读的是
   `screen` 的朝向，键盘改不动它 —— 完整说法见 shellSettings.js 那条注释。

   ⚠️ 判据用 `:where()` 包住，是为了**不引入任何自适应特异性**：本块里的规则一律与宽屏那批
   同分（照旧靠源码顺序取胜），下面注释里那些 (0,x,0) 算式因此照旧成立。别图省事改成
   `html.is-narrow .x` 那种直写形式 —— 那会给整块凭空套上一层特异性，把这些算式全推翻。 */
:where(html.is-narrow) .sidebar__head {
  display: contents;
}

/* 顶层那一条：只剩当前面板的动作（资源管理器 = 新建文件/文件夹，
   评测样例 = verdict + 耗时）。页头没了盒子，它得自己兜住原来那 35px 高度，
   以及滚动显影的发丝线（is-scrolled 仍然挂在页头上，只是它不再画东西）。
   内容居中（2026-10-13 用户要求）：宽屏那一排动作是贴在右侧的，窄屏下左簇已经
   沉到底部、这一条成了唯一的顶栏，再贴右就和底栏那条居中的图标对不上。
   padding 同时改成左右对称（原样是 `4px 8px 4px 4px`，左 4 右 8）——
   内边距偏 2px，`justify-content: center` 居中的是**内容盒**，居出来也是偏的。
   margin-left: 0 是必须的：交叉轴上的 auto 外边距优先于 stretch，
   留着那一条它会缩成内容宽并被推到右边，发丝线就只剩按钮那一小段。 */
:where(html.is-narrow) .sidebar__context {
  order: 0;
  flex: 0 0 auto;
  box-sizing: border-box;
  min-height: 35px;
  padding: 4px 8px;
  margin-left: 0;
  justify-content: center;
  border-bottom: 1px solid transparent;
  transition: border-color 0.15s ease;
}

/* 投进来的那一份自己带着 `margin-left: auto`（宽屏靠它贴右、折行到第二行也贴右，
   见 FileExplorer 的 .explorer__actions 与 TestPanel 的 .panel__heading）——
   auto 外边距会先把剩余空间全吃掉，`justify-content: center` 就完全失效了，
   所以必须从它这一侧归零。两个面板都不是本组件的子节点（跨组件），用 :deep 打进去。

   ⚠️ 前面那个 `.sidebar` 不是装饰，是**特异性**：`.sidebar__context :deep(> *)` 编出来是
   `.sidebar__context[data-v-x] > *` = (0,2,0)，与两个面板各自那条
   `.explorer__actions[data-v-y]{margin-left:auto}` / `.panel__heading[data-v-z]{...}` **同分**，
   谁赢只看构建产物里的先后 —— 实测 `.explorer__actions` 排在本组件之后，于是资源管理器那一半
   margin 照旧是 auto、`justify-content: center` 被架空（2026-10-13 当场踩到：评测样例居中了、
   资源管理器没居中）。多挂一层 `.sidebar` 变成 (0,3,0) 就压得住，与源码顺序无关 ——
   和坑 45 里「跨组件覆盖要自己挣特异性、别拼顺序」是同一条。
   （这里也说明了外层为什么用 `:where()`：包着判据的那层不贡献特异性，这个 (0,3,0) 才是干净的。） */
:where(html.is-narrow) .sidebar .sidebar__context :deep(> *) {
  margin-left: 0;
}

:where(html.is-narrow) .sidebar__head.is-scrolled .sidebar__context {
  border-bottom-color: var(--border-soft);
}

:where(html.is-narrow) .sidebar__body {
  order: 1;
}

/* 评测面板页脚那颗「添加测试样例」：窄屏只留那个加号（2026-10-13 用户要求）。
   判据就借这一条现成的类，所以规则写在这里而不是 TestPanel.vue 里 ——
   判据只有一份（shellSettings 的 isNarrowLayout），为一个 `display: none` 不必再问一次。
   ⚠️ 文字藏了之后这颗按钮的可访问名只剩 `title`（AppIcon 是 aria-hidden），
   所以 TestPanel 那边给它补了 `:title` —— 别把那条删掉。 */
:where(html.is-narrow) .sidebar__body :deep(.add__label) {
  display: none;
}

/* 底部那一条：整行铺满、内容居中，上沿一条发丝线与树分开
   （语汇沿用页头那条滚动显影线，不另造颜色） */
:where(html.is-narrow) .sidebar__switcher {
  order: 2;
  justify-content: center;
  padding: 6px 8px;
  border-top: 1px solid var(--border-soft);
}

/* 软键盘弹着时（.app.is-typing）把侧栏里两条**不参与打字**的行一起收掉：
   一条是评测面板的页脚（TestPanel 的 .panel__foot —— 「提交」+「运行全部」那一排，
   含它上面那句跑不了的原因），另一条是底部那条面板菜单（.sidebar__switcher ——
   胶囊 + 抽题 + 齿轮 + 收起箭头）。2026-11-09 用户报：窄屏上唤出键盘、在评测栏的
   输入框里打字，这两行还留着，样例列表剩下的可视区小得几乎不能看。
   道理也直白：键盘已经按 --vvh 把整块应用砍成一半（见 App.vue 的 .app.is-keyboard），
   再让两条常驻行各吃四十来个像素，列表就只剩一张半卡片；而打字这一刻它们本来也用不上
   —— 底部那条是切面板用的，页脚那条更是「打完字才按」的动作。收起键盘（is-typing
   被实测摘掉）它们就回来，不需要额外状态。
   ⚠️ 判据必须是 is-typing（键盘**真的**弹着），不能换成 is-keyboard（那个只表示
   「这是台触摸设备」，在整台设备上恒真）—— 同 App.vue 收贴底图标栏那条，见 HANDOFF 坑 47。
   ⚠️ 只认 html.is-narrow：宽屏上这两处是排版的骨架，键盘也顶不到它们。
   ⚠️ 规则放在这里而不是 TestPanel.vue / SidebarSwitcher.vue：判据只有一份
   （shellSettings 的 isNarrowLayout），为一个 display: none 不必再问一次 —— 与上面
   .add__label 那条同款。`.panel__foot` 是跨组件的，所以要 :deep 打进去。
   ⚠️ 别改成 visibility: hidden / height: 0：要的是把这两块**地方**让给列表
   （.cases 是 flex: 1 1 auto，收掉谁它才长到谁身上），留着盒子照样吃空间。 */
:where(html.is-narrow) .app.is-typing .sidebar__switcher {
  display: none;
}

:where(html.is-narrow) .app.is-typing .sidebar__body :deep(.panel__foot) {
  display: none;
}

/* 底部这条上多出的「收起侧栏」（箭头指哪就往哪收）：**只在窄屏出现**。
   宽屏不给它位置 —— 那边有分隔条可拖、也有快捷键，多一颗入口是重复。
   显示开关写在子组件里（基础 display: none），这里带着 .sidebar__switcher 这个祖先打开它：
   特异性 (0,3,0) 高过子组件里那条同选择器的基础规则 (0,2,0)，
   不是同特异性拼源码顺序（跨组件谁靠后不可控，坑 45 记过这条）。 */
:where(html.is-narrow) .sidebar__switcher :deep(.sidebar-switcher__collapse) {
  display: inline-flex;
}
</style>
