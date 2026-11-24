<script setup>
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import AppTooltip from './AppTooltip.vue'
import ContextMenu from './ContextMenu.vue'
import LoadingSpinner from './LoadingSpinner.vue'
import TestCaseCard from './TestCaseCard.vue'
import TestCaseTabs from './TestCaseTabs.vue'
import VerdictBadge from './VerdictBadge.vue'
import { useOverlayScrollbar } from '../composables/useOverlayScrollbar.js'
import { useScrollEdge } from '../composables/useScrollEdge.js'
import { isTouchPointer } from '../composables/useMobileKeyboard.js'
import { formatCombo, useShortcutManager } from '../composables/useShortcutManager.js'
import { mountConfetti, unmountConfetti } from '../services/confetti.js'
import { onToolchainProgress } from '../services/runnoSandbox.js'
import { CASE_VIEWS, caseView, isNarrowLayout, setCaseView } from '../services/shellSettings.js'
import { subscribeStatus } from '../services/wasmRuntime.js'
import { t } from '../i18n/index.js'

// 页头右侧的 verdict + 耗时经 Teleport 投进共享页头：侧栏场景是 Sidebar 的
// `#sidebar-context`，评测岛场景是 TestsPane 页头的 `#tests-pane-context`（见 props.variant）。
// 侧栏契约在单例切换器上提后（2026-10-11）只剩这一小条上下文，所以这里必须容错 ——
// 评测岛渲染在 EditorPaneGrid 里，注入源（Sidebar）根本不在它的祖先链上。
const sidebarTabs = inject('sidebarTabs', null)
const activeTab = sidebarTabs?.activeTab ?? ref('tests')
const verdictCompact = sidebarTabs?.verdictCompact ?? ref(false)

/**
 * 用例列表是面板里唯一的长滚动区：原生滚动条会占掉 11px 宽度（卡片跟着变窄、出现 / 消失时
 * 折行位置还会跳），改用覆盖式滑块（2026-10-13）。原生那条由下面 .cases 的
 * scrollbar-width / ::-webkit-scrollbar 藏掉。
 * 分项模式的滚动所有者在 TestCaseTabs 里（它自己挂一条），两者不会同时存在。
 */
const listEl = ref(null)
useOverlayScrollbar(listEl)

// 庆祝纸屑层（2026-10-23 加）：canvas 铺满这块面板，尺寸 / 颜色 / 摆法全在
// services/confetti.js 里，这里只负责「挂上 / 摘掉」这一对。
// 触发方是 App（整轮 ▶ 全过走 celebrateIfAllPassed，逐张 ▶ 刚好凑齐全过走 runOne），
// 不是这里 watch props.cases —— 用例回写会在运行途中整批换掉卡片对象，
// watch 拿到的「上一份 status」经常已经丢了。
const confettiEl = ref(null)
// verdict 在「运行中」时要能显示工具链下载进度：阶段从状态总线拿，百分比从
// onToolchainProgress 的压缩态字节拿（不解析文案里的百分号，i18n 改了就会断）。
const liveStatus = ref(null)
const downloadProgress = ref(null)
let unsubscribeStatus = null
let unsubscribeProgress = null
onMounted(() => {
  mountConfetti(confettiEl.value)
  unsubscribeStatus = subscribeStatus((status) => {
    liveStatus.value = status
    // 离开 download 阶段就丢掉旧的百分比，下次下载从新的一轮重新计数
    if (status.stage !== 'download') downloadProgress.value = null
  })
  unsubscribeProgress = onToolchainProgress((progress) => {
    if (progress.phase === 'download' && progress.total > 0) {
      downloadProgress.value = { loaded: progress.loaded, total: progress.total }
    }
  })
})
onBeforeUnmount(() => {
  unmountConfetti()
  unsubscribeStatus?.()
  unsubscribeProgress?.()
})

const props = defineProps({
  cases: { type: Array, required: true },
  running: Boolean,
  // 最慢的那张用例卡片耗时（毫秒，只计运行段，与卡片同口径）
  elapsed: { type: Number, default: 0 },
  /**
   * 不可运行的原因（由 App 按活跃文件算好）。空串＝可运行。
   * 它同时是四处地方：**空态那行标题**、页脚那行说明、两个 ▶ 的 title、以及
   * 「置灰」这件事的判据。App 对「没打开文件」与「打开了但不是代码」各给了一句
   * 独立成案的文案（`tests.panel.runBlockedNoFile` / `tests.panel.runBlocked`），
   * 所以这里不用再分辨是哪种情形，直接用。
   */
  runBlocked: { type: String, default: '' },
  /**
   * 提交请求在途：按钮置灰，防止连点（扩展那边一次只跑一趟）
   */
  submitting: Boolean,
  /**
   * 这一屏能不能交（由 App 算好：是不是题 + 扩展能力 + 语言都齐了才算）。
   * **交不了就整个不渲染**（2026-10-23 改，用户要求「不要占用视觉」）——
   * 所以这里没有「置灰的提交按钮」，也没有属于它的原因行；原因只走快捷键那条通知。
   */
  showSubmit: Boolean,
  /**
   * 空态里追加的一行提示，没有就是 null（非题目文件、或样例已经在了）。两种形状：
   *   { text, tone }                            —— 纯文本（正在抓 / 抓失败）
   *   { before, linkText, after, tone, url?|action? } —— 中间带一个可点的链接（还没到手 /
   *                                                   没装插件）。`url` 走外链 <a>，
   *                                                   `action` 走站内跳转（按钮，样式同链接）
   * tone：'' 走常态的暗灰，'info' 是进行中，'warn' 是失败。
   */
  notice: { type: Object, default: null },
  /**
   * 渲染场景：'sidebar'（侧栏里那页，默认）或 'pane'（编辑区里的评测岛，见 TestsPane.vue）。
   * 差别只有两处：页头结论投进哪个 Teleport 目标、是否总按「激活」算（岛上没有侧栏切换器）。
   */
  variant: { type: String, default: 'sidebar' },
  /**
   * 底部横跨的评测岛：把页脚那一排「提交 / 运行全部」缩成 26px 的小条 Teleport 进岛页头，
   * 页脚整条收掉，纵向空间全让给正文。左右停靠 / 侧栏场景保持 false。
   */
  compactActions: Boolean,
  /**
   * 工作台布局（2026-11-20 方案一，仅在底部横跨 + 分项视图 + 有样例时成立）：
   * 左侧样例轨 + 右侧满高分栏，页头与状态栏一起让位。由 TestsPane 算好传下来 ——
   * 判据同时决定「页头还要不要画」，只能有一个来源。
   */
  workbench: Boolean,
  /**
   * 纵向停靠的评测岛（2026-11-20 方案二，左右停靠）：页头不再放结论（让给样例页签），
   * 页脚换成「左状态、右动作」的紧凑栏 —— 取代原来那颗通栏大绿钮。
   * 2026-11-20 起侧栏的分项标签视图也走这一档（整岛方案整合），列表视图 / 底部横跨不动。
   */
  verticalDock: Boolean,
})

const emit = defineEmits(['add', 'remove', 'run-one', 'run-all', 'submit', 'drag-start', 'head-context-menu'])

const isPane = computed(() => props.variant === 'pane')
// 工作台只在 TestPanel 真正渲染分项视图时成立（用例清空时会退回列表空态，
// 那时左侧轨也不存在，动作必须回到页头）。
const isWorkbench = computed(
  () => props.workbench && props.cases.length > 0 && caseView.value === 'tabs',
)
// 岛上没有侧栏页签这回事，永远算激活；侧栏场景才看 Sidebar 当前选中的页
const isActivePanel = computed(() => isPane.value || activeTab.value === 'tests')
// 页头结论的落点：侧栏共享页头 / 评测岛页头。
// 工作台不投递 —— 那一支由 TestCaseTabs 用下面几个 summary prop 自己画结论
// （两个版面的目标节点随 v-if 整块换掉，Teleport 不会重新解析，硬投会投进已摘掉的旧节点）。
const contextTarget = computed(() => (isPane.value ? '#tests-pane-context' : '#sidebar-context'))

/**
 * 样例栏有两种列表面孔（2026-11-19，用户提的方案）：
 *   - `list`：纵向卡片流，每张卡可折叠 —— 适合「扫一眼几条样例都是什么结果」；
 *   - `tabs`：顶部标签轨 + 单用例正文 —— 适合「盯住一条改」，纵向空间全给代码面。
 *
 * 偏好住在 `services/shellSettings.js` 的模块级单例里（键 `cp.caseView`），**不在这里**：
 * 写它的入口是**设置 › 外观 › 评测样例视图**那一行，两处读的是同一个 ref，
 * 所以设置里改完这块面板当场就换。外壳与正文的划分见 TestCaseTabs / TestCaseCard
 * 的文件头，这一层只管「渲染哪一套」与两种模式共用的空态 / 页脚。
 */
// 用例空着时一律退回列表模式的空态外壳：
// 分项模式的标签轨与状态栏在 0 条用例时没有意义，而空态只有一份实现，不必写两套。
// 2026-11-24 起分项偏好下这颗添加按钮也收回空态里（标题下方居中，见 `.empty__add`），
// 列表偏好下仍是底部那颗通栏 Add New —— 同一片空白里只放一个添加入口。
const showTabs = computed(() => caseView.value === 'tabs' && props.cases.length > 0)

/**
 * 评测栏的右键菜单（2026-11-20 加，用户要求）：在面板任意空白 / 卡片上右键，
 * 就地切换「评测样例视图」（卡片流 / 分项标签）。
 *
 * 【为什么不另写一份菜单】与设置菜单那一行读的是同一组 `CASE_VIEWS` 与同一个
 * `caseView` ref，改完当场换壳，也不用新增文案。
 *
 * 【只接管「没人认领」的右键】分项胶囊与输入 / 输出框各自有菜单，它们会先
 * `preventDefault()`（见 TestCaseTabs / TestCaseBody）；这里看到事件已被处理就放行，
 * 既不叠一份菜单，也不会把它们的菜单顶掉。触屏长按同样会派发 contextmenu，按全站口径
 * （Sidebar 页头 / ActivityBar）不接管，交给系统。
 */
const panelMenu = ref(null)

const viewMenuItems = computed(() => [
  // 分组标题：给下面两档一个名字，否则「卡片流 / 分项标签」在菜单里没有上下文
  { id: 'heading', heading: true, label: t('settings.appearance.caseView.label') },
  ...CASE_VIEWS.map((view) => ({
    id: `view:${view.id}`,
    label: t(view.labelKey),
    checked: caseView.value === view.id,
  })),
])

function onPanelContextMenu(event) {
  if (event.defaultPrevented || isTouchPointer()) return
  // 工作台页头（左侧样例轨的标题行）的右键归评测岛：停靠菜单在 TestsPane，
  // 这里别再把「列表 / 分项」视图菜单盖上去（2026-11-21 用户反馈）。
  if (event.target instanceof Element && event.target.closest('.workbench__rail-head')) return
  event.preventDefault()
  panelMenu.value = { x: event.clientX, y: event.clientY, items: viewMenuItems.value }
}

function onPanelMenuSelect(id) {
  panelMenu.value = null
  if (id.startsWith('view:')) setCaseView(id.slice('view:'.length))
}

// 页脚主条里面那行气泡文案（2026-10-24 凌晨用户要求「鼠标在运行全部按钮上时，显示它的快捷键」）。
// 组合键走 formatCombo(bindings.run) —— 绑定表是唯一口径，设置里改键这里跟着变；解绑了退回纯动作名。
// 跑不了时仍填原因（与改前同义）：禁用按钮收不到鼠标事件、气泡弹不出来，
// 那行原因由页脚 .run-blocked 那行看得见的字负责。
// 2026-11-10：口径从「原生 title」改成站内自绘气泡（用户：「运行全部按钮的 hover 悬浮提示
// 和这几个都不同」）—— 页脚这一排与样例卡片里那几颗现在共用 AppTooltip 一套观感。
const { bindings } = useShortcutManager()
const runDisabled = computed(
  () => props.running || !props.cases.length || Boolean(props.runBlocked),
)
const runTitle = computed(() => {
  if (props.runBlocked) return props.runBlocked
  const combo = formatCombo(bindings.value.run)
  return combo ? t('tests.panel.runAllTip', { key: combo }) : t('tests.panel.runAll')
})
// 「添加测试样例」那颗的 title 同样带上它的快捷键（2026-10-24 凌晨，用户继运行全部之后点名）。
// 行动 id 是 `new-case`（App.vue 的绑定表）。置灰时原生禁用按钮悬不出 title，不用另写原因分支。
const addTitle = computed(() => {
  const combo = formatCombo(bindings.value['new-case'])
  return combo ? t('tests.panel.addCaseTip', { key: combo }) : t('tests.panel.addCase')
})
// 「提交到 Codeforces」那颗同上（2026-10-24 凌晨，用户逐颗点名到第三颗）。
// 行动 id 是 `submit-solution`；它是纯图标按钮，这行字就是它唯一的可见说明，所以更要带全。
// 2026-11-10：从**原生 title** 换成站内自绘气泡（AppTooltip，与样例卡片里那两颗图标钮同一套）。
// 原生 title 在这颗上一直悬不出来（用户报「不像运行全部那样有个 hover 提示」）——它是浏览器
// 自己那套灰框，触发时机与位置都不受我们控制，图上又只有 12px 图标、鼠标稍有移动就被收掉；
// 换成自绘气泡后 300ms 稳定弹出，位置居中于按钮。文案仍是「动作名（快捷键）」这一条口径。
const submitTitle = computed(() => {
  const combo = formatCombo(bindings.value['submit-solution'])
  return combo ? t('tests.submit.buttonTip', { key: combo }) : t('tests.submit.button')
})
/**
 * 页脚那行「为什么跑不了」：只在**列表里还有用例**时兜底显示 —— 空态那行标题
 * 只说明「跑不了」的原因（见模板里 `.empty`），列表非空时它根本不渲染
 * （`.empty` 那个 `li` 是 `v-if="!cases.length"`），原因没处说，页脚补上；
 * 列表空着时标题已经说了同一句话，页脚让它空着，一句话只在一个地方说。
 * 两个 ▶ 与卡片 ▶ 的置灰、title 仍用 `runBlocked`，一个字都没少。
 */
const footBlocked = computed(() => (props.cases.length ? props.runBlocked : ''))

/**
 * 页头右上那块（verdict + 耗时）画不画（2026-11-17 加；2026-11-18 放宽判据）。
 *
 * 跑不了（`runBlocked` 非空）时整块不画：胶囊只会写「无测试用例」或拿旧结论报
 * 「n/m AC」，而空态标题 / 页脚已经把真正该说的「为什么跑不了」说了 —— 一边说
 * 跑不了、一边报用例数，是在同一屏里自相矛盾（2026-11-18 用户要求）。
 *
 * 之前判据只认「没打开文件」（且带 `cases.length` 兜底：真出现「没认到活跃文件、
 * 却还留着用例」的情形想把真实结论留下来）。现在闸门关着就藏 —— 对跑不了的文件，
 * 任何用例数都没有意义，留着反而误导。
 *
 * 2026-11-21 用户要求：一条用例都没有时也不画 —— 那时页头那颗只会写「无测试用例」，
 * 与空态本身说的是同一件事；侧栏页头因此不再出现这行字。
 */
const showVerdict = computed(() => !props.runBlocked && props.cases.length > 0)

/**
 * 窄屏侧栏（2026-11-20 用户要求「与纵向评测岛同一套形态」）：页头不再放结论与耗时，
 * 整格内容改由底栏左侧承载；Sidebar 那边同时把 `#sidebar-context` 整块摘掉。
 * 判据只有一份 —— 与 CSS 的 `html.is-narrow` 同读 shellSettings 的 `isNarrowLayout()`。
 */
const narrowSidebar = computed(() => !isPane.value && isNarrowLayout())

/**
 * 紧凑底栏是否成立（2026-11-20 方案二）：左右停靠的评测岛、窄屏侧栏，或侧栏的分项标签
 * 视图（整岛方案已整合进侧栏，正文 / 页签 / 底栏共用同一套）。
 * 列表流空着时不换 —— 末尾那颗「添加样例」正需要多出来的高度，而且底栏左侧会是一颗
 * 与空态状态重复的「无测试用例」。
 * 分项标签空态曾用紧凑底栏（2026-11-21 用户要求），2026-11-24 改为**底栏整体隐藏**：
 * 0 个样例时置灰的「运行全部」没有交互价值，空态区块下面空出来更舒展
 * （见模板里两处 `cases.length` 守卫）。
 */
const verticalBar = computed(
  () =>
    (props.cases.length > 0 || caseView.value === 'tabs') &&
    (props.verticalDock ||
      narrowSidebar.value ||
      (!isPane.value && caseView.value === 'tabs')),
)

/**
 * 底部横跨且一个用例都没有时（2026-11-21 用户要求）：页头右上那组
 * 「无测试用例 | 提交 / 运行全部」没有任何作用 —— 空态已经说明没有用例，
 * 运行也没有对象。整组不 Teleport 上去。侧栏与纵向岛不走这一支。
 */
const emptyBottomPane = computed(
  () => isPane.value && !props.verticalDock && !props.cases.length,
)

/**
 * 页头右上的结论（2026-11-20）：侧栏分项视图虽然也用了紧凑底栏，但宽屏下结论仍留在页头
 * 右上角 —— 那是侧栏原有位置，不跟着底栏走。只有真正的评测岛（isPane）与窄屏侧栏
 * 才把结论下沉到底栏。
 */
const showHeaderVerdict = computed(
  () =>
    !isWorkbench.value &&
    !narrowSidebar.value &&
    (!verticalBar.value || !isPane.value) &&
    !emptyBottomPane.value,
)

/**
 * 底栏那颗「单测」跑的是**当前选中的样例** —— 这个状态只在 TestCaseTabs 里。
 * 所以这里拿它的 ref，把「跑当前样例」这个动作原样转发（守卫 / singleRun 全在它那边）。
 * 列表视图没有「当前样例」这回事，底栏就不渲染这颗按钮（见模板里的 v-if="showTabs"）。
 */
const tabsRef = ref(null)

function runActiveCase() {
  tabsRef.value?.runActive()
}

/** 当前样例序号（1 起；无选中为 0），由 TestCaseTabs 的当前页签算出来 */
const activeCaseNumber = computed(() => Number(tabsRef.value?.activeNumber) || 0)

/**
 * 左钮的悬停说明：跑不了时填原因（禁用按钮收不到鼠标事件，气泡弹不出来），
 * 否则明确「只跑这一条」并带出序号。
 */
const runOneTitle = computed(() => {
  if (props.runBlocked) return props.runBlocked
  return activeCaseNumber.value
    ? t('tests.panel.runOneTip', { n: activeCaseNumber.value })
    : t('tests.card.runOne')
})

// 页脚上沿那条「还有下文」线（2026-10-23 加；判据同日按用户口径翻过一面）：
// 页脚底色已改成与面板同色（--bg-editor，即整页地面），不再靠色差与列表分开，
// 于是改由一条发丝线交代边界。
//
// ⚠️ **判据与页头（Sidebar.syncHeadScrolled）正好相反，别顺手抄那一条**：
//   页头在顶上：scrollTop > 0 才画（内容从页头底下穿过去了）。
//   页脚在底下：**没滚到底才画** —— 还有内容压在这条线后面，才需要把它描出来；
//   滚到最底 / 一屏装得下 / 空列表，都没有「下文」，线就不该出现（用户 2026-10-23 纠正）。
// ⚠️ 别改成「恒定描边」：列表装得下时，那条线会把一块空白切成两截。
// ⚠️ 这条 border 常时也在（透明），只是为了显示 / 隐藏时页脚高度不抖 1px。
//
// 2026-11-19：判定逻辑搬进 composables/useScrollEdge.js —— 分项视图的滚动所有者换成了
// `.case-viewport`，同一套判据要服务两个容器。这里只负责「哪种视图的判定结果算数」。
const { moreBelow: listMoreBelow, sync: syncFootEdge } = useScrollEdge(listEl)
// 分项视图那边的值由子组件算好 emit 上来（它自己也是 useScrollEdge 的使用者）
const tabsMoreBelow = ref(false)
const moreBelow = computed(() => (showTabs.value ? tabsMoreBelow.value : listMoreBelow.value))

// 增删用例（以及改动输入让卡片长高 / 变矮）改的是内容高度，没人滚 —— 补一次重算。
// 卡片自己的折叠态在子组件里，这里看不到：那种情形最多在「收起后刚好不再溢出」时
// 多留一条线，滚一下就自愈，不值得为它再挂一个 MutationObserver。
watch(() => props.cases, () => nextTick(syncFootEdge), { deep: true })

const counts = computed(() => {
  // stale 是附加维度：卡片状态仍是 passed/failed/error，但代码或输入已改动、结论过期
  const tally = { idle: 0, running: 0, passed: 0, failed: 0, error: 0, stale: 0 }
  for (const item of props.cases) {
    tally[item.status] = (tally[item.status] ?? 0) + 1
    if (item.stale) tally.stale += 1
  }
  return tally
})

// 与卡片徽标同一套判定词：AC 就是通过。混合结果只报「几 / 几 AC」，
// 判定按「信号 + 比例 + 文案」拆开，交给 VerdictBadge 统一渲染：
// tone 只认 passed / failed / error / warn / info / muted 六值；
// passed / total 是比例，label 是「AC」这类后缀（空串表示不显示）。
// 只要有一张卡片的结论已过期（stale），就不能再宣称「全部 AC」——
// 上一轮通过不代表改完代码后仍通过。
// 窄侧栏（verdictCompact 由 Sidebar 按 <400 逻辑 px 算好，比胶囊标签的 350 早收一档，
// 2026-11-01 用户要求「异步收窄」）直接不给 AC 后缀：这时胶囊段位还带着文字标签，
// 先让判定文案省出 ~25px；「0/4 AC」加耗时在侧栏最窄时会挤到折行（2026-10-12）。
const verdict = computed(() => {
  const total = props.cases.length
  // AC 是「通过」的通用说法，两套语言都不译（见 i18n 的 tests.verdict 注释）
  const suffix = verdictCompact.value ? '' : 'AC'
  if (!total) {
    return { tone: 'muted', passed: null, total: 0, label: t('tests.verdict.noCases') }
  }
  if (counts.value.running) {
    // 首次运行 / 缓存被清后的运行会先下工具链：这段时间 verdict 报下载百分比，
    // 比只说「运行中」更能解释为什么还没出结果。loadToolchain 开头也会把阶段报成
    // download（此时缓存命中、并没有下载），所以只认真正收到过的进度事件。
    const progress = liveStatus.value?.stage === 'download' ? downloadProgress.value : null
    if (progress) {
      const percent = Math.min(99, Math.round((progress.loaded / progress.total) * 100))
      return { tone: 'info', passed: null, total: 0, label: t('tests.verdict.downloading', { percent }) }
    }
    return { tone: 'info', passed: null, total: 0, label: t('tests.verdict.running') }
  }
  // 有结论过期就报不出确切的通过数，用 ? 代替（卡片各自标明哪些待重测）
  if (counts.value.stale) {
    return { tone: 'warn', passed: '?', total, label: suffix }
  }
  if (counts.value.passed === total) {
    return { tone: 'passed', passed: total, total, label: suffix }
  }
  const tone = counts.value.error ? 'error' : counts.value.failed ? 'failed' : 'muted'
  return { tone, passed: counts.value.passed, total, label: suffix }
})

// 有过期结论时，页头耗时同样来自上一轮，跟着藏掉，免得和「结果待重测」自相矛盾
const elapsedText = computed(() => {
  if (!props.elapsed || counts.value.stale) return ''
  return props.elapsed >= 1000 ? `${(props.elapsed / 1000).toFixed(2)}s` : `${props.elapsed}ms`
})
</script>

<template>
  <section
    class="panel"
    :class="{ 'is-pane': isPane, 'is-workbench': isWorkbench }"
    :aria-label="t('tests.panel.ariaLabel')"
    @contextmenu="onPanelContextMenu"
  >
    <!-- 页头动作区：耗时与结论投进 Sidebar 共享页头的 #sidebar-context（顺序见下面那一簇）。
         不激活时 disabled、内容原地渲染（面板 v-show 藏着，不可见）；defer 的来历
         见 FileExplorer 里那颗同款 Teleport 的注释。
         具体是 WA 还是 TLE 由各张卡片的徽标说明，这里不堆长句。
         2026-11-18：跑不了（`runBlocked` 非空，含「没打开文件」与「打开了但不是代码」
         两种）时**结论那一对**（verdict + 耗时）不画 —— 那时这里只会是一颗「无测试用例」
         或一份没有意义的旧结论，与空态标题「为什么跑不了」自相矛盾（判据见脚本的
         `showVerdict`）。
         2026-11-19：视图切换钮曾住在这块末尾（同日又按用户要求挪进「设置 › 外观」），
         现在这一格只剩结论那一对 —— 于是外层 `v-if` 与 `showVerdict` 又合成一层。
         2026-11-20（方案二）：纵向停靠时结论下沉到底栏左侧（见 verticalBar），
         页头这一格整个不投 —— 把 35px 页头的全部宽度让给样例页签。 -->
    <Teleport v-if="showHeaderVerdict" defer :disabled="!isActivePanel" :to="contextTarget">
      <div v-if="showVerdict" class="panel__heading" :class="{ 'is-pane': isPane }">
        <!-- 顺序：耗时在前、结论在后（2026-11-19 用户要求交换）。右端最后落的是那枚 12px/600
             的判定，它是这一簇里唯一的重音；耗时是 11px 的淡色附注，放在左边当引子。
             两段都是 `flex: 0 0 auto`，交换只动 DOM 顺序，宽度与折行判据一点没变。 -->
        <span
          v-if="elapsedText"
          class="elapsed"
          :title="t('tests.elapsedTitle', { time: elapsedText })"
        >
          <AppIcon name="clock" :size="11" />{{ elapsedText }}
        </span>
        <VerdictBadge
          :tone="verdict.tone"
          :passed="verdict.passed"
          :total="verdict.total"
          :label="verdict.label"
          :spinner-size="9"
        />
      </div>
    </Teleport>

    <!-- 两种列表面孔二选一（2026-11-19）：列表流 / 分项标签。同一时刻只有一套在 DOM 里 ——
         不是 v-show —— 因为分项模式的核心就是「只留一份正文」：挂着四张卡不动，
         等于四份 textarea、四份差异计算、四条折叠外壳一起常驻。
         2026-11-24（用户要求）：分项标签一条样例都没有时不渲染页签轨 —— 不必为「以后
         这里会是标签栏」在页头留一条空轨，添加按钮收回下面 `.empty` 里、标题下方居中。
         点完添加、出现「样例 1」之后页签轨再照常回来。 -->
    <ul
      v-if="caseView === 'list' || !cases.length"
      ref="listEl"
      class="cases"
      :class="{
        'is-empty': !cases.length,
        'is-tabs-empty': !cases.length && caseView === 'tabs',
      }"
    >
      <li v-if="!cases.length" class="empty">
        <!-- 空态（2026-11-24 用户要求）：正常空态**不再写「暂无样例」这行标题** ——
             「一条用例都没有」是最显然的状态，这句话只是占了黄金分割点。现在只留
             「添加样例」按钮 + 抓样提示，一屏很轻。
             唯一例外是跑不了（`runBlocked` 非空）：那行换成闸门原因
             （「非代码文件无法运行」/「没有打开的文件」，App 各给一句），因为这时
             连添加按钮都不出现；不说明原因，用户就不知道发生了什么。
             列表流仍是原来的「底部通栏 Add New」。 -->
        <p v-if="runBlocked" class="empty__title">{{ runBlocked }}</p>
        <!-- 分项标签空态的主操作（方案三）：实心高对比，「点这里开始」的确定感。
             跑不了（`runBlocked`）时不画 —— 与列表末尾、页脚两颗按钮的闸门一致。 -->
        <button
          v-if="caseView === 'tabs' && !runBlocked"
          type="button"
          class="empty__add"
          :disabled="running"
          @click="emit('add')"
        >
          <AppIcon name="plus" :size="14" />
          <span>{{ t('tests.panel.addCase') }}</span>
        </button>
        <!-- 跑不了的原因现在在空态标题里说（见上），这一栏越干净越好。
             抓样那三条提示仍然照旧（它们说的是「样例为什么还没到手」，与能不能运行无关）。 -->
        <p v-if="notice" class="empty__notice" :data-tone="notice.tone">
          <!-- 抓取在途（tone = info）时把等待画在这一行里：空态期间没有别的东西可看，
               转起来才知道它还在动 -->
          <LoadingSpinner v-if="notice.tone === 'info'" :size="11" />
          <span>
            <!-- 三段式：before + 中间可点的一段 + after 拼成一句（另两段是纯文本，见 props 说明）。
                 中间那段两种走法：`url` 是外链（题目链接，新窗口打开），`action` 是站内跳转
                 （「安装或重载插件」→ 设置面板的浏览器插件那一栏，2026-11-12）—— 后者必须是
                 <button>，拿 <a href="#"> 会污染地址栏、还会被中键当成新页签。 -->
            <template v-if="notice.url">
              {{ notice.before
              }}<a class="empty__link" :href="notice.url" target="_blank" rel="noopener noreferrer">{{
                notice.linkText
              }}</a
              >{{ notice.after }}
            </template>
            <template v-else-if="notice.action">
              {{ notice.before
              }}<button type="button" class="empty__link" @click="notice.action()">{{
                notice.linkText
              }}</button
              >{{ notice.after }}
            </template>
            <template v-else>{{ notice.text }}</template>
          </span>
        </p>
      </li>

      <TestCaseCard
        v-for="(item, index) in cases"
        :key="item.id"
        :test-case="item"
        :index="index"
        :locked="running"
        :run-blocked="runBlocked"
        @remove="emit('remove', $event)"
        @run="emit('run-one', $event)"
      />

      <!-- 添加用例：从页脚挪到列表末尾（2026-10-23，用户：「移到样例栏中去，
           到所有样例的后面」）。它是这条列表的收尾项；2026-11-10 起不再通栏，
           左右各让 12 / 6，与卡片里 INPUT / Expected 那些框同宽（见 .cases__add 那条注释）。
           `flex: 0 0 auto` 不能省：卡片也靠同一条避免被压扁（见 .card 的头注），
           用例一多、列表开始滚动时它同样不该被压。
           空列表时它由 .cases.is-empty 推回列表底部（见样式里那条），
           与绝对定位在 38.2% 处的空态文案各安其位。
           ⚠️ `title` 不能省：窄屏下那个 `span` 被隐藏（规则在 Sidebar.vue 的窄屏块里），
           AppIcon 是 aria-hidden，没有它这颗按钮就成了一个没有名字的图标按钮。 -->
      <li v-if="!runBlocked" class="cases__add">
        <button
          class="add"
          :title="addTitle"
          :disabled="running || Boolean(runBlocked)"
          @click="emit('add')"
        >
          <AppIcon name="plus" :size="14" />
          <span class="add__label">{{ t('tests.panel.addCase') }}</span>
        </button>
      </li>
    </ul>

    <!-- 分项标签视图（2026-11-19）：标签轨 + 单用例状态栏 + 唯一滚动区。
         `@more-below` 是页脚那条发丝线的判据来源（滚动所有者在它内部，见上面 moreBelow）。 -->
    <TestCaseTabs
      v-else
      ref="tabsRef"
      :cases="cases"
      :running="running"
      :run-blocked="runBlocked"
      :add-title="addTitle"
      :teleport-rail="isPane"
      :workbench="isWorkbench"
      :vertical="verticalDock"
      :show-submit="showSubmit"
      :submitting="submitting"
      :run-title="runTitle"
      :submit-title="submitTitle"
      :verdict="verdict"
      :verdict-visible="showVerdict"
      :elapsed-text="elapsedText"
      @add="emit('add')"
      @remove="emit('remove', $event)"
      @run-one="emit('run-one', $event)"
      @run-all="emit('run-all')"
      @submit="emit('submit')"
      @more-below="tabsMoreBelow = $event"
      @drag-start="emit('drag-start', $event)"
      @head-context-menu="emit('head-context-menu', $event)"
    />

    <!-- 紧凑底栏（2026-11-20 方案二；侧栏分项视图同款）：左状态、右动作。
         右侧三个独立控件按「幽灵 → 中性 → 主色」排成阶梯：提交无底、单跑中性浅底、
         全跑是唯一的绿色焦点钮并放在最右收口，不再让两颗绿钮互相抢焦点。
         2026-11-24（用户要求）：0 个样例时整条底栏不渲染 —— 置灰的「运行全部」
         没有交互价值，空态区块下面空出来，视觉更舒展。 -->
    <footer v-if="verticalBar && cases.length" class="panel__foot is-vertical">
      <div class="panel__foot-status">
        <p v-if="footBlocked" class="run-blocked">{{ footBlocked }}</p>
        <template v-else-if="showVerdict && cases.length && (isPane || narrowSidebar)">
          <VerdictBadge
            :tone="verdict.tone"
            :passed="verdict.passed"
            :total="verdict.total"
            :label="verdict.label"
            :spinner-size="10"
          />
          <span
            v-if="elapsedText"
            class="elapsed"
            :title="t('tests.elapsedTitle', { time: elapsedText })"
          >
            <AppIcon class="elapsed-clock" name="clock" :size="11" />{{ elapsedText }}
          </span>
        </template>
      </div>
      <div class="panel__foot-actions">
        <AppTooltip v-if="showSubmit" class="submit-wrap" :text="submitTitle">
          <button
            class="submit-inline"
            :class="{ 'is-submitting': submitting }"
            :disabled="running || submitting"
            :aria-label="submitting ? t('tests.submit.submitting') : t('tests.submit.button')"
            @click="emit('submit')"
          >
            <AppIcon name="upload" :size="13" />
          </button>
        </AppTooltip>
        <AppTooltip v-if="showTabs && !runBlocked" class="run-one-wrap" :text="runOneTitle">
          <button class="btn-run-one" :disabled="runDisabled" @click="runActiveCase">
            <AppIcon name="play-solid" :size="14" />
            <span class="btn-run-one__label">{{ t('tests.panel.runOneLabel') }}</span>
          </button>
        </AppTooltip>
        <AppTooltip v-if="!runBlocked" class="run-all-wrap" :text="runTitle">
          <button class="btn-run-all" :disabled="runDisabled" @click="emit('run-all')">
            <AppIcon name="list-video" :size="14" />
            <span class="btn-run-all__label">{{ t('tests.panel.runAllLabel') }}</span>
          </button>
        </AppTooltip>
      </div>
    </footer>

    <footer
      v-else-if="!verticalBar && cases.length"
      class="panel__foot"
      :class="{ 'is-more-below': moreBelow && !compactActions, 'is-compact': compactActions }"
    >
      <!-- 跑不了的原因写成一行看得见的字（置灰的按钮在浏览器里收不到鼠标事件，
           title 也就悬不出来）。**提交那条不在这里**：交不了的时候那颗按钮压根不渲染
           （见 showSubmit 与 App 里那段说明）。
           2026-11-18：`footBlocked` 只在列表里还有用例时兜底 —— 列表空着时空态里
           已经说了同一句话（见 `.empty` 里那颗 `runBlocked` 标题），页脚再写一遍
           就是重复；列表非空时 `.empty` 那个 `li` 根本不渲染，原因没处说，这里补上。
           2026-11-20（底部横跨）：动作条整排 Teleport 进岛页头（compactActions），
           页脚只剩可能的原因行；没有原因时整条塌成 0 高。 -->
      <p v-if="footBlocked" class="run-blocked">{{ footBlocked }}</p>
      <Teleport
        v-if="!isWorkbench && !emptyBottomPane"
        defer
        to="#tests-pane-actions"
        :disabled="!compactActions"
      >
        <div class="panel__foot-row" :class="{ 'is-compact': compactActions }">
        <!-- 一键提交（2026-10-23 加）：次要动作，保持纯图标、靠左，与主条同高。
             只在**真交得了**的时候出现（2026-10-23 改）：交不了的场合连按钮带原因
             一起收掉，页脚不留占位（原因走快捷键那条通知）。
             2026-10-24：与「运行全部」交换左右顺序，提交落在最左。
             2026-10-29：图标从 arrow-up 换成纸飞机 send —— 箭头与「把输出誊进期望」
             那颗同形，且只表达「朝上」；纸飞机的「发送出去」更贴提交。
             2026-11-11：又换回箭头，但换成 arrow-up-from-line（箭头 + 底线）—— 用户指定；
             底线把「交上去 / 落到底」这层意思补上，也就与「誊进期望」那颗光箭头区分开了。
             2026-11-12：换成 upload（箭头 + 托盘）—— 用户指定，托盘的方框比一根底线更像
             「交到一个地方去」，与光箭头 arrow-up 也更容易分开。
             **尺寸 13 是算出来的**：右边「运行全部」的 play 用 14，但两枚字形占的格数不同 ——
             play 只占 16×18（viewBox 单位），upload 铺满 18×18，同样 14 下 upload 的墨迹会宽
             1.1px、看着比 ▶ 大一圈。取 13 后 DSF8 实测墨迹 11.0×10.9，对着 play@14 的
             10.6×11.75 是同档（宽 0.4、矮 0.9），并排看不出谁大谁小。
             2026-11-10：悬停说明改由 AppTooltip 自绘气泡承担（见脚本 submitTitle 那段），
             不再挂原生 title —— 原生那条在这颗图标钮上悬不出来，用户对照「运行全部」报的。 -->
          <AppTooltip
            v-if="showSubmit"
            class="submit-wrap"
            :text="submitTitle"
            :placement="compactActions ? 'bottom' : 'top'"
          >
            <button
              class="submit-inline"
              :class="{ 'is-submitting': submitting }"
              :disabled="running || submitting"
              :aria-label="submitting ? t('tests.submit.submitting') : t('tests.submit.button')"
              @click="emit('submit')"
            >
              <AppIcon name="upload" :size="13" />
            </button>
          </AppTooltip>
          <!-- 主操作（2026-10-24 改）：原先是一颗 32px 的线框 ▶，用户嫌「太单薄、像个漂在角落的
               图标」。现在是通栏图文条：宽度由内容撑开、底色只用低透明度的 --ok 磨砂面，
               文字同时充当可访问名。窄到一个字都放不下之前都不收字 —— 侧栏下限 158px 时
               「▶ 运行全部」仍有富余（见样式里那条宽高账）。
               2026-10-24 凌晨：title 里带上它的快捷键（用户要求「鼠标在运行全部按钮上时，
               显示它的快捷键」），组合键走绑定表，见脚本 runTitle。
               2026-11-10：跟提交那颗一样换成 AppTooltip 自绘气泡（用户：「运行全部的 hover
               悬浮提示和这几个都不同」）—— 原生那条灰框在同一个排里独一份，其余几颗早就是
               站内气泡了。`.run-inline` 的 `flex: 1 1 auto` 随之挪到外层 .run-all-wrap 上：
               气泡的触发体是它自己那个 span，只有它才是这一排的 flex 子项。 -->
          <AppTooltip
            v-if="!runBlocked"
            class="run-all-wrap"
            :text="runTitle"
            :placement="compactActions ? 'bottom' : 'top'"
          >
            <button
              class="run-inline"
              :disabled="runDisabled"
              @click="emit('run-all')"
            >
              <AppIcon name="list-video" :size="14" />
              <span class="run-inline__label">{{ t('tests.panel.runAllLabel') }}</span>
            </button>
          </AppTooltip>
        </div>
      </Teleport>
    </footer>

    <!-- 庆祝纸屑层（2026-10-23 加）：铺满整块样例面板、盖在列表与页脚之上，
         但不吃指针事件 —— 卡片、▶、覆盖式滑块照常能点。位图尺寸由
         services/confetti.js 每次放之前按 getBoundingClientRect 现设，这里只管「和面板一样大」。
         aria-hidden：纯装饰，不进无障碍树（同样理由，也不用 aria-live 念出来）。 -->
    <canvas ref="confettiEl" class="panel__confetti" aria-hidden="true"></canvas>

    <!-- 评测栏右键菜单（2026-11-20）：切「评测样例视图」。卡片流 / 分项标签两档带勾，
         读的是设置菜单同一份 CASE_VIEWS（见脚本 viewMenuItems）。 -->
    <ContextMenu
      v-if="panelMenu"
      :x="panelMenu.x"
      :y="panelMenu.y"
      :items="panelMenu.items"
      @select="onPanelMenuSelect"
      @close="panelMenu = null"
    />
  </section>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  /* 作为统一侧边栏「评测样例」页签里的 flex 子项撑满内容区（与 FileExplorer 的 .explorer 同款） */
  flex: 1 1 auto;
  min-height: 0;
  /* 与统一侧边栏同色（--bg-panel，即岛面）：这个面板盖在 .sidebar 上，
     两边不同值的话切页签就能看出「底板被换了一档」（2026-10-23）。
     2026-11-18 悬浮岛：侧栏整座岛铺 --bg-panel（05:54 便当盒模型，见 App.vue 的
     .pane--tests），评测栏作为侧栏的一个页签必须同值 —— 曾经跟着「地面」口径写过
     --bg-ground，那版模型下面板是坐地上的；岛模型下它坐在岛面上，不跟改就会
     在资源管理器 ↔ 评测栏之间切页签时露馅。 */
  background: var(--bg-panel);
  /* 纸屑层（.panel__confetti）的定位上下文。写成 relative 而不是给画布用 position: fixed ——
     画布必须跟着面板走，面板被 v-show 藏起来时它才一起消失（2026-10-23）。 */
  position: relative;
}

/* 庆祝纸屑层：铺满整块面板，纯装饰。
   ⚠️ 别给它 `overflow` / `border-radius` 之类：画布不裁剪，粒子「落出」面板下沿就自然消失
   （超出画布的部分浏览器本来就不画）。`pointer-events: none` 是硬要求 ——
   没有它，整块面板上就再也点不到卡片与页脚那两颗按钮。 */
.panel__confetti {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

/* 页头本身已上提到 Sidebar 的共享页头（.sidebar__head，2026-10-11）：折行、
   滚动描边、35px 同高都在那里；这里只剩 Teleport 上去的 verdict + 耗时样式 */

.panel__heading {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  /* 换行后单独占一行时仍然贴右（不写会在换行那一行落到左边） */
  margin-left: auto;
  /* 与侧栏右沿之间多留 6px（2026-11-19，用户：「太靠右了，加入一个右边距」）。
     页头本身只给 8px 内边距（合计 14px），而侧栏顶部是个圆角岛 —— 判定那一簇最后几个字
     正好压在拐角弧线上，读起来像贴边。这 6px 也只在这种「纯文字、无边框」的判定上才显得紧：
     资源管理器那两颗图标钮有自己的 32px 热区，8px 就够。
     ⚠️ 窄屏这一档必须归零（见下面 :where(html.is-narrow) 那条）：那时页头是居中的唯一
     顶栏，左右内边距刻意做成对称，单边加 6px 会让整簇偏 3px。 */
  margin-right: 6px;
}

/* 窄屏：页头这条退成「唯一的顶栏」，Sidebar 把 padding 改成左右对称 8/8 就是为了居中准
   （见 Sidebar 的 :where(html.is-narrow) .sidebar__context），这里多出的右边距会把内容盒
   挤偏 —— 归零。特异性 (0,2,0)，不参与 Sidebar 那条 margin-left 的争夺。 */
:where(html.is-narrow) .panel__heading {
  margin-right: 0;
}

/* 评测岛页头：这一簇后面接拖动把手（TestsPane 负责，页头即把手），
   所以不再贴右、右边距归零，间距略收 */
.panel__heading.is-pane {
  margin-right: 0;
  gap: 7px;
}

/* 判定徽标（信号点 + 比例 + 文案）已抽到 VerdictBadge.vue：
   同一套 tone 词表与排版由页头、工作台轨头、折叠评测条共享。 */

.elapsed {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: var(--mono-font);
  font-size: 11px;
  color: var(--text-faint);
}

.cases {
  flex: 1 1 auto;
  min-height: 0;
  margin: 0;
  /* 横向 8px：列表与面板分隔条之间的留白。卡片自身已无外框（2026-10-24 晚），
     这 8px 现在只剩一件事：不让代码面贴上分隔条。
     顶部单独给 0（2026-10-13，用户要求「首个样例与首个文件离页头一样远」）：
     卡片头行自带 7px 上内边距 + 头行内容（22px 的折叠箭头盒）居中，所以卡片盒顶留 8px
     时首行墨迹比文件树低 10px。去掉这 8px 后——卡片头行盒顶 7px、内容中心 18px——
     与文件树（.explorer__tree 顶 6px、行文字中心 18px）两个口径同时对上（各差 1px）。
     ⚠️ 别把顶部补回 8px 去「和左右对齐」：左右那 8px 是给列表的横向余量，
     纵向没有对应的东西，补回来首行就又低 8px。 */
  padding: 0 8px 8px;
  list-style: none;
  display: flex;
  flex-direction: column;
  /* 留白即边界，且留白要匀（2026-10-24 晚）：卡片底色、外框、头部分隔线全部撤掉后，
     样例与样例之间只靠空白分开。2026-10-24 深夜底部那条单线也去掉，间距保持原样。
     账目：上侧 = .card__body 的下内边距 10 + .card 自身的下内边距 10 = 20；
     下侧 = 这里的 gap 10 + 下一张头栏的上内边距 2 + 标题在 32px 行内的居中余量约 8 = 20。
     改 gap 就要同步改那两处内边距，否则上下两半会一胖一瘦。 */
  gap: 10px;
  overflow-y: auto;
  overflow-x: hidden;
  /* 原生滚动条藏掉，由 useOverlayScrollbar 那条滑块接手（2026-10-13）：原生那条占掉 11px，
     卡片宽度会随它出现 / 消失变一下、折行位置跟着跳。标准属性 + 旧内核伪元素各写一条 */
  scrollbar-width: none;
  container-type: inline-size;
  /* 空态那行字是绝对定位的（见 .empty），这里给它一个基准盒 */
  position: relative;
}

.cases::-webkit-scrollbar {
  width: 0;
  height: 0;
}

/* 岛内列表：横向留白交给 `.card__body` 的 --pane-px（底部 12 / 纵向 10），
   这里归零，页头 gripping/标签的左沿才与正文第一列盒面同一条线。
   侧栏不经过这一支（.panel 无 is-pane），8px 原样保留。 */
.panel.is-pane .cases {
  padding-left: 0;
  padding-right: 0;
}

/* 空态（2026-10-06 照参照稿改；2026-10-11 改定位）：一行居中的淡灰字。
   原来是个虚线框 + 底色 + 左对齐的一堆东西 —— 参照稿里根本没有框，那层虚线只是把
   一行字围起来，删掉之后空态才真的「空」。
   位置原来靠 `padding: 40px 0` 顶在列表最上面，现在整块摆到黄金分割靠上的那个分点上：
   绝对定位到「列表可视区高度的 38.2%」，再用 translateY(-50%) 让**这一块的中心**落在
   那个点上（不是顶边）。38.2% = 1 / 1.618²，与 61.8% 互为黄金分割的两个分点，
   略在可视区中心之上、构图更稳。
   分母是 .cases 的 padding box 高度：.cases 是滚动的列表容器，空态时里面没有任何
   内容、它的高度就是页头与页脚之间那整片可视区 —— 所以页头 / 页脚怎么改，这里都不用跟。
   left / right 给 0（吃不到 .cases 的 8px 横向内边距）不影响观感：这块是 text-align:
   center，两边多出的 8px 是对称的；它没有底色、不画框，视觉上仍在同一条中线上。 */
.empty {
  position: absolute;
  left: 0;
  right: 0;
  /* 38.2% 是「黄金分割点」，不是随手取的近似值 —— 改它等于改这条设计决定 */
  top: 38.2%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 6px;
  text-align: center;
}

.empty__title {
  margin: 0;
  font-size: 14px;
  /* 参照稿用的 text-muted，落到本项目的变量上就是最淡的那一档 */
  color: var(--text-faint);
}

/* 分项标签空态的主操作（2026-11-24）：页签轨已隐藏，添加按钮收回这块空态
   里、标题下方居中。
   材质与「▶ 运行」同系（2026-11-24 用户要求，按钮降噪）：暗灰实底 + 一档悬停，
   放弃纯白反转底 —— 它只是「点这里开始」，不该比运行按钮更刺眼。
   2026-11-24 再按用户要求去掉描边：暗灰实底本身已经和背景分得开，加线反而显重。
   字号 13 / 常规字重 / 高 32 / 圆角 6，与次级按钮同一把尺。
   间距：标题 → 按钮 16px（gap 6 + margin 10），按钮 → 抓样提示 24px（见下一条）。 */
.empty__add {
  align-self: center;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 10px;
  height: 32px;
  padding: 0 12px;
  border: 0;
  border-radius: 6px;
  background: var(--bg-hover-soft);
  color: var(--text);
  font-size: 13px;
  font-weight: 400;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 0.16s ease;
}

/* 图标比文字收暗一档（≈zinc-400），13px 常规字重下更协调 */
.empty__add svg {
  flex: none;
  color: var(--text-dim);
}

/* 悬停只提一档底色（--bg-hover-soft → --bg-hover），不描边 ——
   与「运行」按钮同一套反馈，不做反转或变色。 */
:where(html.is-hoverable) .empty__add:hover:not(:disabled) {
  background: var(--bg-hover);
}

.empty__add:disabled {
  opacity: 0.45;
  cursor: default;
}

/* 有主按钮时，抓样提示与它拉开 14px（gap 6 + 8）—— 提示是次级信息，但
   2026-11-24 用户觉得原来的 24px 松了，收近一档，两块读作一组。 */
.empty__add + .empty__notice {
  margin-top: 8px;
}

/* 自动抓取样例那一路的提示：见模板里的说明。
   2026-11-24：收一个 260px 的宽度上限，避免长句在宽面板里拉成一整行、
   换行时又只把最后一两个字挤到第二行（「页。」孤字）。
   颜色再压一档到 --text-faint（深色≈zinc-500 / 浅色≈zinc-400）：按钮降成灰底后，
   这行提示不能反客为主变成画面最亮的元素（用户 2026-11-24 要求「低对比冷灰」）。 */
.empty__notice {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  max-width: 260px;
  margin: 0 auto;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-faint);
}

/* 两行排匀：text-wrap: balance 让浏览器按「行长接近相等」去切，而不是
   先填满第一行、再把剩余几个字丢到第二行。只影响折行，不影响短句。 */
.empty__notice > span {
  min-width: 0;
  text-wrap: balance;
}

.empty__notice[data-tone='info'] {
  color: var(--accent-strong);
}

/* 2026-11-24（用户要求，提示语降噪）：warn 态正文不再整行铺暖黄 —— 纯黑白灰的
   画面里，整句黄字太抢眼。这条染色规则因此删除，颜色统一走上面的 --text-faint。 */

/* 提示里的题目链接：真正的外链导航，保留强调色，只靠下划线表明「可点」 */
.empty__link {
  color: var(--accent-hover);
  text-decoration: underline;
  text-underline-offset: 2px;
}

/* 同一套外观的站内跳转（「安装或重载插件」）：它是个 <button>，把默认盒模型清零，
   字号 / 行高跟着整行走（`font: inherit`），免得与旁边的外链长短高低不一致。
   2026-11-12 曾让颜色继承整行（蓝字太跳）；2026-11-24 用户要求：正文压成冷灰后，
   这颗用 --text（≈zinc-300）就足够亮，不必再铺暖黄；下划线用 --text-faint，
   offset 拉到 4px，悬停只加粗、不改色。 */
button.empty__link {
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  color: var(--text);
  text-decoration: underline;
  text-decoration-color: var(--text-faint);
  text-underline-offset: 4px;
  cursor: pointer;
}

:where(html.is-hoverable) .empty__link:hover {
  color: var(--accent-strong);
}

/* 站内跳转的悬停只把下划线提亮一档 + 加粗，颜色保持 --text（别变回蓝色） */
:where(html.is-hoverable) button.empty__link:hover {
  color: var(--text);
  text-decoration-color: var(--text-dim);
  text-decoration-thickness: 2px;
}

/* 列表末尾那条「添加测试样例」（2026-10-23 从页脚搬进来）。
   `flex: 0 0 auto` 与卡片同一条纪律：列表溢出时不许被压矮。
   上下留白：gap 10 + 这里的 margin-top 10 = 20，与样例之间的「线到下一块」同距；
   底部 padding 8 由 .cases 出 —— 它不再是页脚里那颗需要自己撑间距的按钮。

   左右 12 / 6（2026-11-10，用户：「添加测试样例的按钮宽度调整为与上方的输入框宽度相同」）：
   它原先是通栏的 —— 宽度等于 .cases 内容盒整宽，比卡片的代码面左边多出 12、右边多出 6，
   那 12 / 6 正是 .card__body 的 `padding: 0 6px 10px 12px`（见 TestCaseCard）。现在收进
   同一条轨：左边 12 接上标签与代码文字那条 22px 左轨（12 + 1 描边 + 9 内边距），右边 6 与
   代码面同止，于是这颗按钮的外框（含自身的 1px 虚线）与上方 .ta / .out 的外框等宽 ——
   300px 面板下实测两者都是 266px（原先按钮是 284）。
   ⚠️ 宽度账写在这一层 li、别挪到 .add 上：按钮自己是 `width: 100%`，与页脚 .submit-wrap
   一个套路（外层定框、内层撑满）；给按钮加左右 margin 会和它的禁用态 / hover 边框算式打架。 */
.cases__add {
  flex: 0 0 auto;
  margin: 10px 6px 0 12px;
}

/* 空列表：按钮落回列表底部（也就是它原先在页脚正上方的位置）。
   空态文案是绝对定位在 38.2% 的，不占布局；这里靠 auto 外边距把这一项推到底，
   没有它按钮会紧贴列表顶端，看起来像是「空列表里孤零零一颗按钮」。 */
.cases.is-empty .cases__add {
  margin-top: auto;
}

/* 分项标签空态已经有中心那颗主操作（见 .empty__add），列表末尾的通栏 Add New
   不再出现 —— 同一片空白里不放两个添加入口。 */
.cases.is-tabs-empty .cases__add {
  display: none;
}

.add {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  width: 100%;
  height: 32px;
  border-radius: 6px;
  font-size: 12.5px;
  /* 参考稿那种「Add New」框（2026-10-23，用户要求）：整宽、无底色、一圈极细虚线，
     「+ 添加测试样例」居中 —— 它读起来是列表末尾预留的一行空位，而不是又一颗彩色按钮。
     文字退到 --text-dim：虚线已经交代了「这里能加东西」，不必再靠颜色喊。 */
  color: var(--text-dim);
  background: transparent;
  border: 1px dashed var(--border-hairline);
  transition: border-color 0.16s ease, color 0.16s ease;
}

:where(html.is-hoverable) .add:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--border);
}

/* 三颗按钮的禁用态必须是同一档（2026-10-06）：原先 .add 是 0.5、.run-inline 是 0.45，
   两档差不出所以然，却会让「题解这类文件下按钮全灰」的那一屏看起来像两个不同的系统。
   .add 已在 2026-10-23 挪进列表，但它与页脚两颗仍是同一套语汇，这条注释仍然管三颗。 */
.add:disabled {
  opacity: 0.45;
  cursor: default;
}

.panel__foot {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  /* 左右 8px = .cases 的横向内边距：主操作条与列表里的卡片 / 「添加测试样例」同宽，
     页脚不再比上面窄 4px（2026-10-24） */
  padding: 10px var(--pane-px, 8px);
  /* 底色与面板同色（--bg-editor，即整页地面），照侧边栏页头那套「透明条」的做法（2026-10-23）：
     页脚不再是一块比正文亮一档的色斑，而是同一条地面的末段，剩下的按钮直接浮在上面。
     与正文的分界改由一条发丝线承担 —— 但它只在**还有内容压在下面**时才描出来
     （.is-more-below，判据在 script 的 syncFootEdge，与页头同一套显影语汇）。
     那条 border 常时也在、只是透明：显示 / 隐藏时不改盒高，页脚才不抖 1px。 */
  background: transparent;
  border-top: 1px solid transparent;
  transition: border-color 0.15s ease;
}

/* 列表没滚到底：页脚上沿浮出发丝线，交代「下面还有用例」。
   颜色与 Sidebar 页头那条滚动线同值（--border-soft），全站只有一种「滚动边界」的语汇。
   ⚠️ 判据与页头**相反**（页头是离了顶才画，页脚是没到底才画）—— 见 script 里那段说明 */
.panel__foot.is-more-below {
  border-top-color: var(--border-soft);
}

/* 底部横跨态（compactActions）：动作条已 Teleport 进岛页头，页脚只剩可能的原因行。
   没有原因时整条 0 高 —— 这正是这次挪按钮要换回来的那 ~56px（padding 10×2 + 36 条）。 */
.panel__foot.is-compact {
  padding: 0;
  border-top: none;
}

.panel__foot.is-compact .run-blocked {
  padding: 6px var(--pane-px, 8px) 8px;
}

/* 纵向停靠的底栏（2026-11-20 方案二；同日方案一重排）：左状态、右动作。
   高度改由内容撑开（28px 控件 + 上 8 / 下 --pane-px）：底边距与左右等宽，
   右下角按钮不再比右侧更贴边，圆角的「下坠感」消失。 */
.panel__foot.is-vertical {
  flex: 0 0 auto;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px var(--pane-px, 10px) var(--pane-px, 10px);
  border-top: 0;
  /* 底栏自己作为容器：岛被拖窄时按它的可用宽度收按钮文案（见下面 @container 那条） */
  container-type: inline-size;
}

/* 侧栏分项视图（非评测岛）：内容左右留白与纵向评测岛一致，统一 10px。
   左侧状态不再单独归零 —— 沿用基础那条 6px 引距（见 .panel__foot-status），
   verdict 的左沿因此与纵向评测岛落在同一条基线上（10 + 6）。 */
.panel:not(.is-pane) .panel__foot.is-vertical {
  padding: 10px;
}

/* 提交钮保留侧栏原来的 36px 热区（幽灵图标没有底色，视觉大小不变）；
   运行两颗按 2026-11-21 用户要求收到与纵向评测岛同档的 28px —— 没有提交钮时
   整条底栏也从 56px 收到 48px。 */
.panel:not(.is-pane) .panel__foot.is-vertical .submit-inline {
  width: 36px;
  height: 36px;
}

/* 左侧状态：统一 inline-flex 中轴、锁死 22px 行盒，图标与文字不再各自漂移。 */
.panel__foot-status {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding-left: 6px;
  overflow: hidden;
  font-size: 12px;
  line-height: 1;
}

.panel__foot-status .run-blocked {
  margin: 0;
  line-height: 1.2;
  color: var(--text-dim);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.panel__foot-status .verdict,
.panel__foot-status .elapsed {
  display: inline-flex;
  align-items: center;
  height: 22px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.panel__foot-status .verdict {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.panel__foot-status .elapsed {
  flex: 0 0 auto;
  font-size: 11px;
  color: var(--text-faint);
}

.panel__foot-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
}

/* AppTooltip 的触发体是它自己的 inline-flex span；统一对齐后才不会把按钮顶歪 1–2px */
.panel__foot-actions > * {
  display: inline-flex;
  align-items: center;
}

/* 提交钮：降噪为幽灵图标，28×28 与运行按钮等高 */
.panel__foot.is-vertical .submit-inline {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--text-dim);
  transition: background-color 0.14s ease, color 0.14s ease, border-color 0.14s ease;
}

:where(html.is-hoverable) .panel__foot.is-vertical .submit-inline:hover:not(:disabled) {
  background: var(--icon-hover-bg);
  color: var(--text);
}

/* 三个独立按钮按「幽灵 → 中性 → 实心主色」排成阶梯（2026-11-24 改实心）：
   提交 = 无底图标；单跑 = 实心暗灰底 + 亮文字；全跑 = 唯一实心绿，放最右收口。
   不再用 --ok-face 的半透明微光面（Linear / LeetCode 口径）：主次层级靠
   「实心主色 vs 实心灰面 vs 无底」一步到位，不用再让透明度去承担权重。 */
.btn-run-one,
.btn-run-all {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 28px;
  padding: 0 11px;
  border: 0;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 0.14s ease, color 0.14s ease, opacity 0.14s ease;
}

/* 次操作（运行）：实心暗灰，不参与绿色语义 —— 绿只留给全跑。
   字色与三角统一用 --text-active（夹在 --text 与 --text-dim 之间的一档），
   图标走 currentColor 自然同步。 */
.btn-run-one {
  color: var(--text-active);
  background: var(--bg-hover-soft);
}

:where(html.is-hoverable) .btn-run-one:hover:not(:disabled) {
  background: var(--bg-hover);
}

/* 主动作（全跑）：整排唯一的实心绿焦点钮 */
.btn-run-all {
  color: var(--run-green-text);
  background: var(--run-green);
}

:where(html.is-hoverable) .btn-run-all:hover:not(:disabled) {
  background: var(--run-green-hover);
}

.btn-run-one:disabled,
.btn-run-all:disabled {
  opacity: 0.45;
  cursor: default;
}

/* 底栏过窄：左右 / 窄屏的评测岛、窄屏侧栏，底栏左侧还有判定与耗时，约 17rem 内容宽
   以下两颗运行按钮只留 logo，把宽度让给状态。
   宽侧栏不在这一档 —— 那里的判定在页头、底栏左侧是空的，文案能留到更窄（见下面
   2026-11-21 那两条）。
   仍走容器查询而不是视口查询 —— 侧栏抽屉、左右停靠的评测岛宽度都由拖拽 / 分屏决定，
   与视口宽无关。按钮同时收成正方形，图标保持原来的 14px，悬停说明仍在 AppTooltip 上。 */
@container (max-width: 17rem) {
  .panel.is-pane .btn-run-one__label,
  .panel.is-pane .btn-run-all__label,
  :where(html.is-narrow) .panel:not(.is-pane) .btn-run-one__label,
  :where(html.is-narrow) .panel:not(.is-pane) .btn-run-all__label {
    display: none;
  }

  .panel.is-pane .btn-run-one,
  .panel.is-pane .btn-run-all,
  :where(html.is-narrow) .panel:not(.is-pane) .btn-run-one,
  :where(html.is-narrow) .panel:not(.is-pane) .btn-run-all {
    width: 28px;
    padding: 0;
  }
}

/* 宽侧栏（2026-11-21 用户反馈收得太早）：底栏左侧没有状态，判定在页头，两枚文案钮
   实测只需约 172px 内容宽。带提交钮时多 36px + 一个间距，14rem；没有提交钮时
   11.5rem 才真的放不下，都不必跟岛一起在 17rem 提前收。 */
@container (max-width: 14rem) {
  :where(html:not(.is-narrow)) .panel:not(.is-pane):has(.submit-wrap) .btn-run-one__label,
  :where(html:not(.is-narrow)) .panel:not(.is-pane):has(.submit-wrap) .btn-run-all__label {
    display: none;
  }

  :where(html:not(.is-narrow)) .panel:not(.is-pane):has(.submit-wrap) .btn-run-one,
  :where(html:not(.is-narrow)) .panel:not(.is-pane):has(.submit-wrap) .btn-run-all {
    width: 28px;
    padding: 0;
  }
}

@container (max-width: 11.5rem) {
  :where(html:not(.is-narrow)) .panel:not(.is-pane) .btn-run-one__label,
  :where(html:not(.is-narrow)) .panel:not(.is-pane) .btn-run-all__label {
    display: none;
  }

  :where(html:not(.is-narrow)) .panel:not(.is-pane) .btn-run-one,
  :where(html:not(.is-narrow)) .panel:not(.is-pane) .btn-run-all {
    width: 28px;
    padding: 0;
  }
}

/* 纵向岛再窄一档：底栏左侧的判定与耗时开始被裁（实测最坏组合 ——
   「提交 + 单测 + 运行全部」全带文案时，约 19.1rem 以下「0/100 AC + 钟表 + 12.34s」
   就放不下了）。这里向上取整到 20rem，把判定换成 x/x（与横跨岛同一套 short 文案）、
   同时收掉钟表图标；只作用于评测岛，侧栏那套宽度收束由 verdictCompact 负责。 */
@container (max-width: 20rem) {
  /* 判定只留 x/x：VerdictBadge 的 AC 后缀让位（与横跨岛同一口径） */
  .panel.is-pane .panel__foot-status :deep(.verdict__label) {
    display: none;
  }

  .panel.is-pane .panel__foot-status .elapsed-clock {
    display: none;
  }
}

.panel__foot.is-vertical .run-one-wrap,
.panel__foot.is-vertical .run-all-wrap {
  flex: 0 0 auto;
}

.panel__foot-row {
  display: flex;
  gap: 8px;
}

/* 岛页头只有 --head-ctrl-h（26px）：两颗按钮同高、同 6px 圆角，
   与标签胶囊同一把标尺；尺寸全部走变量，纵向停靠 / 侧栏不经过这一支。 */
.panel__foot-row.is-compact {
  display: flex;
  align-items: center;
  gap: 6px;
}

.panel__foot-row.is-compact .submit-inline,
.panel__foot-row.is-compact .run-inline {
  box-sizing: border-box;
  height: var(--head-ctrl-h, 26px);
  border-radius: 6px;
}

.panel__foot-row.is-compact .submit-inline {
  width: var(--head-ctrl-h, 26px);
}

.panel__foot-row.is-compact .run-inline {
  padding: 0 10px;
  gap: 6px;
  font-size: 12px;
  line-height: 1;
}

/* 不可运行的原因：说清楚就行，别用告警色 —— 编辑题解本来就不该有什么「出错」感 */
.run-blocked {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--text-faint);
}

/* 主操作条外面套着 AppTooltip（2026-11-10，与提交那颗同一天）：气泡的触发体是它自己那个
   span（display: inline-flex），所以**吃剩余宽度**这条从按钮挪到了这里 —— 现在它才是
   .panel__foot-row 的 flex 子项，`min-width: 0` 也一并跟过来，否则窄侧栏下按钮那串
   nowrap 文字会把这一排顶出去。
   宽高账（与原来同一笔）：侧栏下限 158px 时页脚内容宽 142，主条 = 142 - 36 - 8 = 98px，
   内容「14(图标) + 7(间距) + 50(四个 12.5px 汉字)」= 71px，再加左右 24px 内边距 = 95px，
   刚好放得下（英文 Run all 更短）。
   ⚠️ 名字叫 run-all-wrap 而不是 run-wrap：样例卡片里那颗 ▶ 的外套就叫 .run-wrap
   （TestCaseCard），同名虽然被 scoped 隔开、不会串样式，但调试时两个名字会认错人。 */
.run-all-wrap {
  flex: 1 1 auto;
  min-width: 0;
}

.run-inline {
  /* 主操作条（2026-10-24 改）：从 32px 的线框图标改成整条图文按钮。
     宽度由外面 .run-all-wrap 定（见上），这里撑满它；提交按钮不出现时就是通栏，
     出现时它也让出 36 + 8px 给提交那颗（提交在最左），主条仍占满其余宽度。
     完整动作名与快捷键走悬停气泡（见脚本里的 runTitle，2026-10-24 凌晨加快捷键，
     2026-11-10 由原生 title 换成 AppTooltip）。 */
  flex: 1 1 auto;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  height: 36px;
  padding: 0 12px;
  border-radius: 6px;
  font-size: 12.5px;
  /* 实心主操作（2026-11-24）：纯 --run-green 填充 + --run-green-text 字色、无边框。
     不再铺 --ok 的半透明微光面 —— 实心色块自己撑起主按钮的权重，
     与同排的灰面 / 幽灵按钮拉开一档就够；悬停加深一档，不换色。 */
  color: var(--run-green-text);
  background: var(--run-green);
  border: 0;
  white-space: nowrap;
  transition: background-color 0.16s ease;
}

:where(html.is-hoverable) .run-inline:hover:not(:disabled) {
  background: var(--run-green-hover);
}

.run-inline:disabled {
  opacity: 0.45;
  cursor: default;
}

/* 一键提交：与主条同高同圆角（36px / 6px），仍然是纯图标 + 发丝线 ——
   它是这一排的次要动作，不能和「运行全部」抢视觉权重。
   用 --accent 而不是运行那颗绿：「跑」和「交」是两件事，颜色分开才不用读悬停提示就知道点的是哪颗。
   禁用态与另外两颗同一档 0.45（见 .add 那条注释）。

   外面套着 AppTooltip（2026-11-10）：气泡的触发体是它自己那个 span，所以**不吃宽度的那条
   改成写在这个 span 上**（与 TestCaseCard 的 .trash-wrap / .run-wrap 同一手），
   按钮本身仍是定宽 36px 的方块。 */
.submit-wrap {
  flex: 0 0 auto;
}

.submit-inline {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border-radius: 6px;
  /* 与 .run-inline 同一种低对比语汇（2026-10-23 起；2026-10-29 用户要求把它也改成
     透明微光面并去掉描边，彻底对齐「运行全部」）：蓝色只留在图标上，底色是一层
     --accent 的低透明度面；「跑」与「交」仍靠色相区分，但这一排没有实心色块抢视线。 */
  color: var(--accent-text);
  background: var(--accent-face);
  border: 1px solid transparent;
  transition: background-color 0.16s ease, border-color 0.16s ease;
}

:where(html.is-hoverable) .submit-inline:hover:not(:disabled) {
  background: var(--accent-face-hover);
}

.submit-inline:disabled {
  opacity: 0.45;
  cursor: default;
}

/* 在途时轻微呼吸，表明「还在等 Codeforces」—— 没有这一步，慢的时候按钮看起来像坏了 */
.submit-inline.is-submitting {
  animation: submit-pulse 1.2s ease-in-out infinite;
}

@keyframes submit-pulse {
  0%,
  100% {
    opacity: 0.45;
  }
  50% {
    opacity: 0.85;
  }
}
</style>
