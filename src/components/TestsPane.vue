<script setup>
/**
 * TestsPane —— 编辑区里的「评测岛」外壳：35px 页头 + TestPanel 正文。
 *
 * 【它为什么不是一个页签】评测样例在编辑区里是布局树的**一等叶子**（`content: 'tests'`），
 * 与代码窗格并排、共享分屏几何；不是 EditorTabs 里的第二张合成视图。所以这里没有文件页签，
 * 只有一条与 `EditorTabs` 严格同高（35px / 无边框 / 透明底）的页头 —— 并排时
 * 两座岛的顶沿与底部分隔线必须连成一条水平线。
 *
 * 【页头顺带装下标签轨】2026-11-20（方案一）：分项视图的样例标签轨经 Teleport 住进
 * `#tests-pane-tabs`，页头不再只是「标题 + 空白 + 拖动」；列表视图里这一格空着，
 * 静态标题照常显示（见样式里的 :has）。
 *
 * 【被动窗格】它永远不接 `focusedPaneId`（见 services/editorPanes.js 的 `focusPane`），
 * 点里面的输入框不会改 `workspace.activeId`。
 *
 * 【位置靠拖动，不靠按钮】页头是拖动把手（2026-11-19 用户口径：原来那两颗「移至底部 /
 * 右侧」「停靠回侧边栏」按钮太死板）：按住页头拖到编辑区右侧 / 底部松手就换停靠侧，
 * 拖到侧边栏或活动栏上方松手就停靠回去。落点判定与高亮在 EditorPaneGrid 里（它才看得见
 * 自己的几何与侧栏的 DOM），本组件只负责把 pointerdown 抛出去（`drag-start`）。
 * 2026-11-20 方案四：不放任何实体抓手 —— 样例页签本身可拖（7px 阈值、触屏纵向拉出），
 * 页头空白右键出停靠菜单、双击在「底部 ↔ 上次纵向侧」切换；删除 × / 新增 + / 输入框仍严格不拖。
 *
 * 【单活】全站只有这一份 TestPanel 实例：移出后侧栏那页只显示占位（见 App.vue 的 `#tests`
 * 槽），所以之前担心的双快捷键 / 双纸屑 / 状态漂移不会发生。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { t } from '../i18n/index.js'
import { isTouchPointer } from '../composables/useMobileKeyboard.js'
import { formatCombo, useShortcutManager } from '../composables/useShortcutManager.js'
import {
  expandTestsPane,
  testsPaneSide,
  testsRail,
} from '../services/editorPanes.js'
import { caseInputPreview, caseStampCode, caseStampTone } from '../services/caseSummary.js'
import { caseView } from '../services/shellSettings.js'
import {
  getTestsPaneDragStartKind,
  testsPaneDrag,
} from '../services/testsPaneDrag.js'
import AppIcon from './AppIcon.vue'
import AppTooltip from './AppTooltip.vue'
import ContextMenu from './ContextMenu.vue'
import TestPanel from './TestPanel.vue'
import VerdictBadge from './VerdictBadge.vue'

const props = defineProps({
  cases: { type: Array, required: true },
  running: Boolean,
  elapsed: { type: Number, default: 0 },
  runBlocked: { type: String, default: '' },
  notice: { type: Object, default: null },
  showSubmit: Boolean,
  submitting: Boolean,
  /** 悬浮迷你岛实例：只渲染折叠窄条，不挂页头 / 正文，拖拽由外壳接管 */
  floating: Boolean,
})

const emit = defineEmits([
  'add',
  'remove',
  'run-one',
  'run-all',
  'submit',
  'drag-start',
  'toggle-collapse',
])

/**
 * 底部横跨态：把「提交 / 运行全部」缩成一颗 26px 的小条挪进页头，页脚整条收掉。
 * 只在**岛真的横跨整块编辑区**时成立（`testsPaneSide() === 'bottom'`）；左右停靠时
 * 页头本来就窄，动作留在页脚的通栏主条里更好用。布局树一变（拖动换边）这里自动跟着翻。
 */
const isBottomDocked = computed(() => testsPaneSide() === 'bottom')

/**
 * 左右停靠（纵向岛）判据：2026-11-20 方案二。
 * 与底部横跨共用同一座岛，但内部排布完全相反 —— 底部是「左侧样例轨 + 右侧三列」，
 * 纵向是「上输入 + 下期望/实际并排 + 紧凑底栏」（见 TestPanel 的 verticalDock）。
 * `testsPaneSide()` 在没有岛时返回 null，TestsPane 只在岛存在时渲染，所以这里不必再判空。
 */
const isSideDocked = computed(() => {
  const side = testsPaneSide()
  return side === 'left' || side === 'right'
})

/**
 * 底部横跨 + 分项视图 + 有样例 → 「工作台」布局（2026-11-20 方案一）：
 * 左侧样例轨 + 右侧满高 I/O 面板。判据与 TestPanel 的 `showTabs` 严格同源，
 * 只是把「视图偏好」和「有没有样例」提前到这里 —— 因为页头要不要让位是这座岛的事。
 * 列表视图 / 侧栏 / 左右停靠一律走改造前的布局，一个字都不动。
 */
const workbench = computed(
  () => isBottomDocked.value && caseView.value === 'tabs' && props.cases.length > 0,
)

/**
 * 页头按下 → 按起手档位决定要不要交给拖拽服务（2026-11-20 方案三）。
 *
 * 页签从「一律放行」改成「可代理拖拽」：页签上按下先照常参与点击（含触屏长按菜单），
 * 只有位移越过各自阈值才由 testsPaneDrag 接管成换边；真正拖起来后那一发 click 会被
 * 全局捕获拦截吞掉，所以不会顺手切样例。删除 × / 新增 + / 输入框仍在严格排除里。
 *
 * 只有页头空白的 `head` 档在按下时也**不** preventDefault —— 禁文本选择已经由
 * CSS 的 `user-select: none` 负责；拦住 pointerdown 会连带吞掉随后的 click / dblclick，
 * 双击切换停靠位就永远收不到。页签同样不乱 preventDefault（还要拿到 click）。
 */
function onHeaderPointerDown(event) {
  if (event.button !== 0) return
  const kind = getTestsPaneDragStartKind(event.target)
  if (!kind) return
  emit('drag-start', event)
}

/** 浮岛实例的拖拽由 EditorPaneGrid 的外壳接管；窄条自己不再起停靠拖拽 */
function onRailPointerDown(event) {
  if (props.floating) return
  onHeaderPointerDown(event)
}

/**
 * 页头右键菜单（2026-11-20 方案四）：去掉实体抓手后，不想横跨大半屏拖拽的用户
 * 可以在页头空白处右键，直接选停靠位。四项动作走与拖拽完全相同的
 * `testsPaneDrag.settle` —— 换边 / 回侧栏只有那一个落位入口。
 * 页签自己的右键菜单会先 preventDefault（运行 / 删除），这里看到已处理就放行；
 * 触屏长按按全站口径交给系统，不接管。
 */
const dockMenu = ref(null)

const dockMenuItems = computed(() => {
  const side = testsPaneSide()
  return [
    { id: 'dock-heading', heading: true, label: t('tests.pane.dockMenuLabel') },
    { id: 'dock:left', label: t('tests.pane.dropLeft'), checked: side === 'left' },
    { id: 'dock:bottom', label: t('tests.pane.dropBottom'), checked: side === 'bottom' },
    { id: 'dock:right', label: t('tests.pane.dropRight'), checked: side === 'right' },
    { id: 'dock-divider', divider: true },
    { id: 'dock:sidebar', label: t('tests.pane.dockSidebar') },
  ]
})

function onHeaderContextMenu(event) {
  if (event.defaultPrevented || isTouchPointer()) return
  // 只认「页头空白 / 标题」：页签走它自己的菜单，按钮与输入框不弹停靠菜单
  if (getTestsPaneDragStartKind(event.target)?.kind !== 'head') return
  event.preventDefault()
  dockMenu.value = { x: event.clientX, y: event.clientY, items: dockMenuItems.value }
}

function onDockMenuSelect(id) {
  dockMenu.value = null
  if (!id.startsWith('dock:')) return
  testsPaneDrag.settle?.(id.slice('dock:'.length), 'island')
}

/**
 * 页头的「再次点击折叠」手势（2026-11-21 用户口径）：落点是**可拖动的页头本身** ——
 * 左右停靠是页头（含标签轨空白），贴底工作台是左侧样例轨头，不再放在分割条上。
 * 第一下只冒气泡、第二下才折叠；节奏与气泡由 EditorPaneGrid 统一处理。
 * 页签 / 按钮 / 输入框（kind !== 'head'）照常走自己的动作，不参与这个手势。
 */
function onSectionClick(event) {
  if (props.floating) return
  if (getTestsPaneDragStartKind(event.target)?.kind !== 'head') return
  if (!event.target.closest('.tests-pane__head, .workbench__rail-head')) return
  emit('toggle-collapse', { x: event.clientX, y: event.clientY })
}

/* ------------------------------------------------------------ 折叠窄条

   岛被 splitter 拖到极窄时（见 EditorPaneGrid 的折叠阈值），正文与页头都保留挂载、
   只隐藏，窄条顶替它们的可见位置：
     · 页头不能卸载 —— #tests-pane-tabs / -context / -actions 是 Teleport 落点；
     · TestPanel 不能卸载 —— textarea 撤销栈与当前样例都住在里面。
   窄条里只留三件事：通过个数、每条样例页签（判定码水印）、运行全部。
   展开 / 折叠都交给「改岛宽的拖拽条」（分割条，见 EditorPaneGrid 的单击切换）；
   样例页签点下去先展开、再写 pendingCaseId，让 TestCaseTabs 在可见布局上落选中。 */
const collapsed = computed(() => props.floating || testsRail.collapsed)
const railHorizontal = computed(() =>
  props.floating ? testsRail.edge === 'bottom' : testsPaneSide() === 'bottom',
)
/** 窄条气泡朝编辑区一侧弹：右停靠 → 左，左停靠 → 右，底部 → 上，不压住岛自己的内容 */
const railTipPlacement = computed(() =>
  railHorizontal.value
    ? 'top'
    : (props.floating ? testsRail.edge : testsPaneSide()) === 'left'
      ? 'right'
      : 'left',
)

const railCounts = computed(() => {
  const tally = { passed: 0, failed: 0, error: 0, stale: 0, running: 0 }
  for (const item of props.cases) {
    if (item.status === 'passed') tally.passed += 1
    else if (item.status === 'failed') tally.failed += 1
    else if (item.status === 'error') tally.error += 1
    if (item.stale) tally.stale += 1
    if (item.status === 'running') tally.running += 1
  }
  return tally
})

/**
 * 窄条读数（方案一，2026-11-21 用户要求）：横排折叠态把读数挪到最右端；
 * 数字形态交给共享的 VerdictBadge（与页头 / 工作台同一套 tone 与排版）。
 * 结论过期时分子用 `?`（与页脚 verdict 同口径），运行中写 `RUN`。
 */
const railSummary = computed(() => {
  const total = props.cases.length
  if (!total) {
    return { tone: 'muted', passed: 0, total: 0, label: '' }
  }
  if (railCounts.value.running) {
    return { tone: 'info', passed: null, total: 0, label: 'RUN' }
  }
  if (railCounts.value.stale) {
    return { tone: 'warn', passed: '?', total, label: '' }
  }
  const passed = railCounts.value.passed
  // tone 与 TestPanel 的 verdict 完全同源：error 单独走 --err，不再混进 fail
  let tone = 'muted'
  if (passed === total) tone = 'passed'
  else if (railCounts.value.error) tone = 'error'
  else if (railCounts.value.failed) tone = 'failed'
  return { tone, passed, total, label: '' }
})

/** 读数气泡：`2/5` 说不清过期 / 运行中，仍复用展开态页脚那套文案 */
const railSummaryTitle = computed(() => {
  if (!props.cases.length) return t('tests.pane.passedTooltip', { passed: 0, total: 0 })
  if (railCounts.value.running) return t('tests.verdict.running')
  const passed = railCounts.value.stale ? '?' : railCounts.value.passed
  return t('tests.pane.passedTooltip', { passed, total: props.cases.length })
})

const { bindings } = useShortcutManager()
const railRunDisabled = computed(
  () => props.running || !props.cases.length || Boolean(props.runBlocked),
)
const railRunTitle = computed(() => {
  if (props.runBlocked) return props.runBlocked
  const combo = formatCombo(bindings.value.run)
  return combo ? t('tests.panel.runAllTip', { key: combo }) : t('tests.panel.runAll')
})

function onRailCase(id) {
  // 顺序不能反：先把岛展开，再让 TestCaseTabs 消费选中请求
  expandTestsPane()
  if (caseView.value === 'tabs') testsRail.pendingCaseId = id
}

/**
 * 折叠窄条样例的右键菜单（2026-11-21 用户要求）：与展开态页签同一份菜单 ——
 * 运行这一条 / 删除这一条，状态也同一口径（运行中整份只读，跑不了就禁用运行项）。
 * 菜单走 TestsPane 已有的 ContextMenu（停靠菜单也用它），动作仍落回 run-one / remove。
 */
const caseMenu = ref(null)

function onRailCaseContextMenu(event, item) {
  event.preventDefault()
  caseMenu.value = {
    x: event.clientX,
    y: event.clientY,
    caseId: item.id,
    items: [
      {
        id: 'run',
        label: t('tests.tabs.runOne'),
        disabled: props.running || Boolean(props.runBlocked),
      },
      { id: 'remove', label: t('tests.card.remove'), disabled: props.running },
    ],
  }
}

function onCaseMenuSelect(id) {
  const menu = caseMenu.value
  // 选中即收：菜单盖住的那片区域会吞掉下一次按下
  caseMenu.value = null
  if (!menu) return
  // 父级 runOne / removeCase 收的是**用例对象**（不是 id）：这里按 id 回指当前那一批，
  // 既兼容菜单打开期间用例被换过，也不会把字符串当用例传上去。
  const target = props.cases.find((item) => item.id === menu.caseId)
  if (!target) return
  if (id === 'run') emit('run-one', target)
  if (id === 'remove') emit('remove', target)
}

// 开跑 / 跑完时收掉菜单：items 是打开那一刻的快照，留着会和当前状态对不上
watch(
  () => props.running,
  () => {
    caseMenu.value = null
  },
)

/** 底部横条：把纵向滚轮映射成横向滚动（列表本身没有纵向溢出） */
function onRailWheel(event) {
  if (!railHorizontal.value) return
  if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
  event.currentTarget.scrollLeft += event.deltaY
  event.preventDefault()
}

/* ------------------------------------------------------------ 横排窄条按空间选页签形态

   用户口径（2026-11-21）：「看下方的空间有多少，如果多，则为展开态，少则为折叠。」
   竖排只有 48px 宽，永远是「状态点 + 序号」的紧凑胶囊；横排铺满编辑区宽度，
   放得下时就把样例还原成纵向岛页头那套展开态页签（状态点 + 「样例 N」+ 判定水印）。

   判据用一条隐藏量尺量真实排版宽度（不猜字号 / 不按字数估）：
   量尺按展开态排同样几条胶囊，总宽不超过列表可视宽就上展开态，
   否则退回紧凑态。竖排 / 收起时不渲染量尺，直接按紧凑态走。 */
const railEl = ref(null)
const railCasesEl = ref(null)
const railMeasureEl = ref(null)
const railRoomy = ref(false)
let railObserver = null

function updateRailRoomy() {
  const room = railCasesEl.value?.clientWidth ?? 0
  const need = railMeasureEl.value?.scrollWidth ?? 0
  railRoomy.value = Boolean(railHorizontal.value && room > 0 && need > 0 && need <= room)
}

function bindRailObserver() {
  railObserver?.disconnect()
  railObserver = null
  if (!collapsed.value || !railEl.value) return
  railObserver = new ResizeObserver(updateRailRoomy)
  railObserver.observe(railEl.value)
  updateRailRoomy()
}

// 岛展开 / 收起、换边、增删样例都会换掉量尺或可用宽度：重挂一次观察器再量
watch([collapsed, railHorizontal, () => props.cases.length], () => nextTick(bindRailObserver), {
  immediate: true,
})
onMounted(bindRailObserver)
onBeforeUnmount(() => railObserver?.disconnect())
</script>

<template>
  <section
    class="tests-pane"
    :class="{
      'is-bottom': isBottomDocked,
      'is-side': isSideDocked,
      'is-workbench': workbench,
      'is-collapsed': collapsed,
      'is-floating': floating,
    }"
    :aria-label="t('tests.pane.ariaLabel')"
    @click="onSectionClick"
  >
    <!-- 工作台布局（方案一）没有页头：拖动把手、结论、动作全部住进左侧样例轨
         （见 TestCaseTabs 的 workbench 分支）。页头在这里整条摘掉，右侧满高分栏
         才有「从顶到底都是数据」的那一版形态。 -->
    <!-- 页头即拖拽面（2026-11-20 方案四）：不再放任何占位的六点抓手。
         按住页签或空白超过阈值就拎起整座岛；右键空白出停靠菜单；双击空白在
         「底部 ↔ 上次纵向侧」之间切换。页签多时整条 35px 页头几乎全是可拖区。 -->
    <header
      v-if="!workbench && !floating"
      v-show="!collapsed"
      class="tests-pane__head"
      @pointerdown="onHeaderPointerDown"
      @contextmenu="onHeaderContextMenu"
    >
      <!-- 静态标题只在「没有标签轨可占位」时出现（列表视图）；分项视图下
           标签本身就是语义标识，这一格让给 Teleport 进来的标签轨。判据见样式里的 :has。 -->
      <span class="tests-pane__title">{{ t('tests.pane.title') }}</span>
      <!-- 分项标签轨的 Teleport 落点（TestPanel → TestCaseTabs，variant='pane'）。
           空着时 :has(:not(:empty)) 会让上面的标题留下。 -->
      <div id="tests-pane-tabs" class="tests-pane__tabs"></div>
      <!-- TestPanel 的 verdict + 耗时经 Teleport 投进这里（variant="pane"） -->
      <div id="tests-pane-context" class="tests-pane__context"></div>
      <!-- 底部横跨态的动作区：提交 / 运行全部从页脚 Teleport 到这里（见 TestPanel 的
           compactActions）。左右停靠时这一格空着，动作留在页脚。 -->
      <div id="tests-pane-actions" class="tests-pane__actions"></div>
    </header>

    <TestPanel
      v-if="!floating"
      v-show="!collapsed"
      variant="pane"
      :compact-actions="isBottomDocked"
      :vertical-dock="isSideDocked"
      :workbench="workbench"
      :cases="cases"
      :running="running"
      :elapsed="elapsed"
      :run-blocked="runBlocked"
      :notice="notice"
      :show-submit="showSubmit"
      :submitting="submitting"
      @add="emit('add')"
      @remove="emit('remove', $event)"
      @run-one="emit('run-one', $event)"
      @run-all="emit('run-all')"
      @submit="emit('submit')"
      @drag-start="emit('drag-start', $event)"
      @head-context-menu="onHeaderContextMenu"
    />

    <!-- 折叠窄条：岛被 splitter 拖到极窄时顶替页头 + 正文的可见位置。
         整条窄条点一下即展开（拖动则是换位）；样例页签与运行键各自 stop。
         `data-pane-drag-proxy` 让整条窄条都能按住拖动换边 —— 与样例页签同一档 7px 阈值，
         位移越过阈值才接管，单击照常落到按钮自己的动作上。 -->
    <div
      v-if="collapsed"
      class="tests-rail"
      :class="railHorizontal ? 'is-horizontal' : 'is-vertical'"
      :aria-label="t('tests.pane.railLabel')"
      ref="railEl"
      :data-pane-drag-proxy="floating ? undefined : ''"
      @pointerdown="onRailPointerDown"
    >
      <!-- 读数（方案一，2026-11-21 用户要求）：横排挪到最右端，与展开态顶栏
           右上角的 1/2 同一处空间记忆；形态交给共享的 VerdictBadge（方案二：
           无信号点，语义色只轻染分子）。 -->
      <AppTooltip
        class="tests-rail__summary-wrap"
        :text="railSummaryTitle"
        :placement="railTipPlacement"
      >
        <VerdictBadge
          :tone="railSummary.tone"
          :passed="railSummary.passed"
          :total="railSummary.total"
          :label="railSummary.label"
          :spinner-size="9"
        />
      </AppTooltip>
      <span class="tests-rail__sep" aria-hidden="true"></span>
      <div ref="railCasesEl" class="tests-rail__cases" @wheel="onRailWheel">
        <AppTooltip
          v-for="(item, index) in cases"
          :key="item.id"
          class="tests-rail__case-wrap"
          :text="caseInputPreview(item.input)"
          :placement="railTipPlacement"
          code
        >
          <button
            type="button"
            class="tests-rail__case"
            :class="{ 'is-stamped': Boolean(caseStampCode(item)), 'is-wide': railRoomy }"
            :data-tone="caseStampTone(item) || null"
            :aria-label="t('tests.pane.caseTab', { n: index + 1 })"
            @click.stop="onRailCase(item.id)"
            @contextmenu="onRailCaseContextMenu($event, item)"
          >
            <span class="tests-rail__num">{{ index + 1 }}</span>
            <span v-if="railRoomy" class="tests-rail__label">{{
              t('tests.card.title', { n: index + 1 })
            }}</span>
            <span
              v-if="caseStampCode(item)"
              class="tests-rail__stamp"
              :class="{ 'is-long': caseStampCode(item).length >= 3 }"
              aria-hidden="true"
              >{{ caseStampCode(item) }}</span
            >
          </button>
        </AppTooltip>
      </div>
      <!-- 隐藏量尺：按展开态的样子排同样几条页签，只用来量总宽（见脚本里的 updateRailRoomy）。
           绝对定位在轨内、visibility: hidden，不参与布局也不出滚动条。 -->
      <div v-if="railHorizontal" ref="railMeasureEl" class="tests-rail__measure" aria-hidden="true">
        <span
          v-for="(item, index) in cases"
          :key="item.id"
          class="tests-rail__case is-wide"
          :class="{ 'is-stamped': Boolean(caseStampCode(item)) }"
          :data-tone="caseStampTone(item) || null"
        >
          <span class="tests-rail__label">{{ t('tests.card.title', { n: index + 1 }) }}</span>
          <span
            v-if="caseStampCode(item)"
            class="tests-rail__stamp"
            :class="{ 'is-long': caseStampCode(item).length >= 3 }"
            >{{ caseStampCode(item) }}</span
          >
        </span>
      </div>
      <!-- 脚：运行全部。竖排仍贴底（与展开态页脚同位）；横排由 order 提到最左端，
           与读数、样例轨组成「▶ 2/3 | 样例…」的原始控制簇。 -->
      <AppTooltip
        class="tests-rail__run-wrap"
        :text="railRunTitle"
        :placement="railTipPlacement"
      >
        <button
          type="button"
          class="tests-rail__run"
          :disabled="railRunDisabled"
          :aria-label="t('tests.panel.runAll')"
          @click.stop="emit('run-all')"
        >
          <!-- 两种朝向共用描边 ▶：竖排不再用实心 play-solid（2026-11-21 用户要求
               与横排样式一致）。 -->
          <AppIcon name="play" :size="14" />
        </button>
      </AppTooltip>
    </div>

    <!-- 页头右键的停靠菜单：与拖拽落位共用 testsPaneDrag.settle -->
    <ContextMenu
      v-if="dockMenu"
      :x="dockMenu.x"
      :y="dockMenu.y"
      :items="dockMenu.items"
      @select="onDockMenuSelect"
      @close="dockMenu = null"
    />

    <!-- 折叠窄条样例的右键菜单：与展开态页签同一份（运行这一条 / 删除这一条） -->
    <ContextMenu
      v-if="caseMenu"
      :x="caseMenu.x"
      :y="caseMenu.y"
      :items="caseMenu.items"
      @select="onCaseMenuSelect"
      @close="caseMenu = null"
    />
  </section>
</template>

<style scoped>
/* 底色与 TestPanel 同值（--bg-panel）：岛模型下这是一座独立的「评测面板岛」，
   与代码岛之间靠圆角轮廓 + 网格的 4px 地面缝区分；页头自 2026-11-20 起也不另铺色。 */
.tests-pane {
  /* 严整基准线：页头、正文容器、页脚共用同一个水平内边距。
     纵向停靠 10px（页头轻、只有 35px）；底部横跨 12px（页头升到 42px 后有足够横向呼吸）。 */
  --pane-px: 10px;
  --head-h: 35px;
  /* 页头里控件的高度基准：标签胶囊本来就是这个高度，底部横跨时动作按钮也缩到同一档 */
  --head-ctrl-h: 26px;

  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--bg-panel);
  border-radius: inherit;
}

/* 折叠态外壳透明（2026-11-21 用户方案一）：轨道只负责把迷你岛贴顶，
   下半段直接透出外画布，不再用一整根通天卡片兜底 */
.tests-pane.is-collapsed {
  background: transparent;
}

/* 悬浮迷你岛实例（2026-11-21 用户方案）：外壳（EditorPaneGrid 的 .tests-float）
   负责边框 / 底 / 影，这里只留排布；窄条自身的岛面与圆角收掉，避免双层材质。 */
.tests-pane.is-floating {
  background: transparent;
}

.tests-pane.is-floating .tests-rail {
  cursor: grab;
}

.tests-pane.is-floating .tests-rail.is-vertical,
.tests-pane.is-floating .tests-rail.is-horizontal {
  padding: 0;
  border-radius: 0;
  background: transparent;
}

/* 底部横跨：页头不再受 35px（对齐 EditorTabs）束缚 —— 横跨时左右没有代码页签栏，
   42px 让 26px 的 Run/Submit 上下各留 8px，正好避开 10px 外圆角的弧线。 */
.tests-pane.is-bottom {
  --pane-px: 12px;
  --head-h: 42px;
}

/* 工作台（方案一）：没有页头，正文从岛顶一直到岛底。左右基准线仍用 12px，
   与样例轨的 10px 内边距、三列面板的 12px 列头内边距同一条竖线。 */
.tests-pane.is-workbench {
  --pane-px: 12px;
}

/* 高度与 EditorTabs 严格对齐：35px、无边框。
   背景**不铺** --bg-panel-head（2026-11-20 用户要求）：页头透明，直接露出 `.tests-pane`
   的 --bg-panel，与岛正文同色；并排时仍靠 35px 高度把两座岛的页头底沿拉在同一条水平线上。 */
.tests-pane__head {
  position: relative;
  flex: 0 0 var(--head-h);
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  height: var(--head-h);
  padding: 0 var(--pane-px);
  background: transparent;
  /* 页头与正文之间不画收口线（2026-11-20 用户要求去掉）：与 EditorTabs 一样靠 35px
     的同高、同色把两座岛的页头底沿拉平，分隔交给留白。 */
  /* 页头就是拖动把手：grab 光标 + 禁掉文本选择与触摸滚动，拖动时不会先选中 verdict。
     2026-11-20 方案四：触屏保持 `pan-x` —— 页签轨的横滑交给原生滚动，页签起手只有
     纵向拉出 ≥10px 才升级成岛拖拽（见 testsPaneDrag 的方向判定）。 */
  cursor: grab;
  user-select: none;
  touch-action: pan-x;
}

.tests-pane__title {
  flex: 0 0 auto;
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
}

/* 标签轨一进来，静态标题就让位（方案一：样例标签本身就是最好的语义标识）。
   Teleport 的注释锚点不计入 :empty，所以列表视图 / 侧栏场景标题照常显示。 */
.tests-pane__head:has(.tests-pane__tabs:not(:empty)) .tests-pane__title {
  display: none;
}

/* 标签轨的落点：吃掉页头里除 verdict / actions 之外的全部宽度。
   container-type 让 TestCaseTabs 的窄容器缩写规则以**页头这一格**为容器尺寸
   （轨已经不在 .tabs-view 里了，那套 @container 按祖先容器解析，够不着它）。 */
.tests-pane__tabs {
  flex: 1 1 0;
  min-width: 0;
  height: 100%;
  display: flex;
  align-items: center;
  /* 与右侧 verdict/动作之间留出固定呼吸；轨自己的 16px 羽化负责文字，不在这里上 mask
     —— mask 会把轨右端那颗常驻「+」一起淡掉。 */
  padding-right: 12px;
  container-type: inline-size;
  /* 触屏横滑只滚标签轨，不触发页头拖拽（拖拽需要纵向拉出，见 testsPaneDrag） */
  touch-action: pan-x;
  /* 页头整体是 grab；标签 / 按钮上不该读成「可拖」 */
  cursor: default;
}

/* Teleport 落点：verdict / 耗时插在这里，靠右排在标签轨后面 */
.tests-pane__context {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

/* 底部横跨态的动作区（提交 / 运行全部，26px 小条）。空着时不占宽 ——
   Teleport 内容不在时这一格宽度为 0；页头 gap 仍在，由上下文那一格自己吸收。 */
.tests-pane__actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
}

.tests-pane__actions:empty {
  display: none;
}

/* 状态读数与操作按钮之间的 1×14 竖分割线：只在这一对都非空时出现。 */
.tests-pane__context:not(:empty) + .tests-pane__actions:not(:empty)::before {
  content: '';
  display: block;
  flex: 0 0 auto;
  width: 1px;
  height: 14px;
  margin-right: 10px;
  background: var(--border-soft);
}

/* 「拎起」反馈（2026-11-20 方案四）：整座岛在拖拽激活时降到 0.45。
   规则写在 App.vue 的全局块（body 不是组件模板的一部分，且 `:global(body…) .tests-pane`
   在 scoped CSS 里会被编译掉后代 —— 实测只剩 `body.is-tests-pane-dragging`）。 */

/* 空落点不占页头的 gap：纵向岛里 #tests-pane-context / #tests-pane-actions 都是空的，
   留着会让页签轨右侧凭空多出 16px 呼吸。 */
.tests-pane__context:empty {
  display: none;
}

/* ------------------------------------------------------------ 折叠窄条（可视 48px）

   2026-11-21 单中轴 + 零描边纯哑光体系（方案一）：横排把读数推到最右端，
   与展开态顶栏右上角的 1/2 同一处；左端只留压淡的 ▶ 与样例轨，横排不再画 |。
   读数拆成「分子 / 分母」两级配色（排版完全沿用 .verdict，语义色只落在分子）；
   竖排保持顶部紧凑读数、底部运行键的原样。
   整条窄条就是展开热区（点一下即展开，没有单独的折叠按钮），拖动则换位。
   样例项与展开态页签同源：横排按空间在「样例 N」与数字档之间切换。
   格子目标仍是 52px（2px 透明边 + 48px 可视），像素宽度见 editorPanes 的 TESTS_RAIL_PX。 */
.tests-rail {
  position: relative;
  flex: 1 1 auto;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  min-width: 0;
  min-height: 0;
  gap: 6px;
  overflow: hidden;
  cursor: default;
  user-select: none;
  background: var(--bg-panel);
}

/* 折叠竖排：紧裹内容的纯平迷你岛（2026-11-21 用户方案一）。
   取消 flex:1 的通天撑满，只占内容高度；样例多时到 max-height 后内部滚动。 */
.tests-rail.is-vertical {
  flex: 0 1 auto;
  flex-direction: column;
  width: 100%;
  max-height: 100%;
  gap: 5px;
  padding: 8px 0;
  border-radius: 10px;
  background: var(--bg-panel);
  box-shadow: none;
}

.tests-rail.is-horizontal {
  flex-direction: row;
  padding: 0 8px;
}

/* 横排里读数由 order 推到最右端，与展开态顶栏右上角的 1/2 保持同一处空间记忆；
   竖排留在顶部。左右各 5px 与左端 ▷ 的墨迹留白对称（2026-11-21 用户要求：
   横岛两端呼吸间距一致，读数不再贴住最后一格样例）。 */
.tests-rail__summary-wrap {
  flex: 0 0 auto;
  display: flex;
}

.tests-rail.is-horizontal .tests-rail__summary-wrap {
  order: 3;
  margin-left: auto;
  padding: 0 5px;
}

/* 竖排：只补上沿 5px，与底端 ▷ 的墨迹留白对称（2026-11-21 用户要求：
   竖岛两端呼吸间距一致，读数不再贴住小岛上沿）。下沿不补 —— 读数与第一格
   之间还有分隔占位 + 轨道 gap，再垫一层会把顶部的组间节奏撑散。 */
.tests-rail.is-vertical .tests-rail__summary-wrap {
  padding: 5px 0 0;
}

/* 分隔线：极淡发丝线，与 32px 控件形成柔和收束 */
.tests-rail__sep {
  flex: 0 0 auto;
  background: color-mix(in srgb, var(--text) 7%, transparent);
}

/* 竖排顶部不再画短横线，也不再留 4px 占位：读数与第一格之间只靠轨道 gap
   收口，间距从 14px 收到 10px（5 + 5）。 */
.tests-rail.is-vertical .tests-rail__sep {
  width: 1px;
  height: 0;
  margin: 0;
  background: transparent;
}

/* 横排不再需要这条竖线：读数已移到最右端，左端只剩「▶ + 样例轨」直接并排 */
.tests-rail.is-horizontal .tests-rail__sep {
  display: none;
}

/* 运行键：竖排贴底、横排由 order 钉在最左端（与右端读数分守两头）。
   两种朝向同一套样式（2026-11-21 用户要求）：无底座、单三角压淡一档，悬停再回亮。 */
.tests-rail__run-wrap {
  flex: 0 0 auto;
  display: flex;
}

.tests-rail.is-horizontal .tests-rail__run-wrap {
  order: -1;
}

.tests-rail__run {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: color-mix(in srgb, var(--ok) 30%, var(--text-dim));
  cursor: pointer;
  transition:
    background-color 0.14s ease,
    color 0.14s ease,
    opacity 0.14s ease;
}

/* 横排左端只剩这一枚：宽度收到 24px（14px 墨迹 + 左右各 5px），与右端读数的
   横向 padding 同档，两头呼吸间距对称。 */
.tests-rail.is-horizontal .tests-rail__run {
  width: 24px;
}

/* 竖排底端同理：高度收到 24px（14px 墨迹 + 上下各 5px），与顶端读数的纵向
   padding 同档，上下两头呼吸间距对称。 */
.tests-rail.is-vertical .tests-rail__run {
  height: 24px;
}

/* 单三角的视觉重心：flex 居中是几何居中，墨迹略偏左，右移 1px 才真正落在圆心 */
.tests-rail__run svg {
  transform: translateX(1px);
}

.tests-rail__run:disabled {
  opacity: 0.32;
  cursor: default;
}

/* 样例列表：紧凑等距，统一中轴 */
.tests-rail__cases {
  flex: 1 1 auto;
  display: flex;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  scrollbar-width: none;
}

.tests-rail__cases::-webkit-scrollbar {
  display: none;
}

.tests-rail.is-vertical .tests-rail__cases {
  flex: 0 1 auto;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 100%;
  overflow-x: hidden;
}

.tests-rail.is-horizontal .tests-rail__cases {
  flex-direction: row;
  align-items: center;
  gap: 4px;
  height: 100%;
  overflow-y: hidden;
}

/* AppTooltip 的触发壳：竖排里也必须能撑成一格，否则一排 tooltip 会挤成一条线 */
.tests-rail__case-wrap {
  flex: 0 0 auto;
  display: flex;
}

/* 样例项：与展开态页签同源的纯哑光无描边色块，严格单行居中 */
.tests-rail__case {
  --tone: var(--text-dim);
  position: relative;
  display: inline-flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 5px;
  width: 32px;
  height: 26px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: color-mix(in srgb, var(--text) 4%, transparent);
  color: var(--text-dim);
  font: inherit;
  cursor: pointer;
  transition:
    background-color 0.14s ease,
    color 0.14s ease;
}

/* 语义色集中映射：AC 压淡，异常档保持锋利。
   err（WA）走 --fail 红、re（CE / RE / ERR）走 --err 橙红 —— 与展开态页签的
   `--tab-tone` 映射逐条一致（2026-11-21 用户要求折叠态与页签样式对齐）。 */
.tests-rail__case[data-tone='ok'] {
  --tone: var(--ok);
}

.tests-rail__case[data-tone='err'] {
  --tone: var(--fail);
}

.tests-rail__case[data-tone='re'] {
  --tone: var(--err);
}

.tests-rail__case[data-tone='warn'] {
  --tone: var(--warn);
}

.tests-rail__case[data-tone='info'] {
  --tone: var(--info);
}

/* 哑光平铺语义底色（与展开态页签一致：无边框、无光晕） */
.tests-rail__case[data-tone] {
  background: color-mix(in srgb, var(--tone) 12%, transparent);
}

/* 单行形态：5px 实色状态点 + 序号并排居中，彻底去掉双行微字 */
.tests-rail__case[data-tone]::before {
  content: '';
  flex: 0 0 auto;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--tone);
}

/* 横排（底部折叠条）里的胶囊：26px、内容宽、左右各留 24px 水印槽 ——
   两边等宽，序号才落在胶囊的几何中心（右侧那格正好给判定水印）。
   底色与竖排键帽同一档（5% 文本底 / 11% 语义底），空间够（railRoomy）时
   换成「样例 N」全称；不够就保留纯数字。 */
.tests-rail.is-horizontal .tests-rail__case {
  width: auto;
  padding: 0 24px;
  gap: 5px;
  overflow: hidden;
  isolation: isolate;
  background: color-mix(in srgb, var(--text) 5%, transparent);
}

.tests-rail.is-horizontal .tests-rail__case[data-tone] {
  background: color-mix(in srgb, var(--tone) 11%, transparent);
}

/* 页签的 7px 状态点；带了判定水印就不画点（与页签同一条规矩） */
.tests-rail.is-horizontal .tests-rail__case[data-tone]::before {
  width: 7px;
  height: 7px;
}

/* 带水印时不画点：横排直接不占位（与竖排一致），序号才能真正居中 */
.tests-rail.is-horizontal .tests-rail__case.is-stamped[data-tone]::before {
  display: none;
}

/* 收窄档的序号沿用基础档的等宽小字（字号 / 字重 / 数字字形与竖排一致）。 */

.tests-rail__label {
  position: relative;
  z-index: 1;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
}

.tests-rail__case.is-wide .tests-rail__num {
  display: none;
}

/* 量尺：与真正的展开态页签同宽同距，只测宽不显示 */
.tests-rail__measure {
  position: absolute;
  left: 0;
  top: 0;
  display: flex;
  gap: 4px;
  width: max-content;
  visibility: hidden;
  pointer-events: none;
}

.tests-rail__measure > * {
  flex: 0 0 auto;
}

.tests-rail__num {
  color: var(--text);
  font-family: var(--mono-font);
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.tests-rail__case:not([data-tone]) .tests-rail__num {
  color: var(--text-dim);
}

/* 紧凑态默认不显示判定码水印；横排与纵向（2026-11-21 用户要求）都改用水印，
   各自的尺寸见下面两条分支。 */
.tests-rail__stamp {
  display: none;
}

/* 横排页签（全称 / 收窄两档）都带判定水印：贴右下角，字号与语义透明度全照页签
   （与 TestCaseTabs 的 .tab__stamp 同一组值）。 */
.tests-rail.is-horizontal .tests-rail__stamp {
  display: block;
  position: absolute;
  right: 8px;
  bottom: -1px;
  z-index: 0;
  font-family: var(--mono-font);
  font-size: 16px;
  font-weight: 800;
  font-style: italic;
  line-height: 0.85;
  letter-spacing: -0.04em;
  color: color-mix(in srgb, var(--tone) 22%, transparent);
  pointer-events: none;
  user-select: none;
}

.tests-rail.is-horizontal .tests-rail__stamp.is-long {
  right: 7px;
  bottom: 0;
  font-size: 13px;
  letter-spacing: -0.06em;
}

/* 未通过的状态比 AC 更醒目：一排扫过去绿色安静、红黄跳脱（与页签同档） */
.tests-rail.is-horizontal .tests-rail__case[data-tone='ok'] .tests-rail__stamp {
  color: color-mix(in srgb, var(--tone) 18%, transparent);
}

.tests-rail.is-horizontal .tests-rail__case[data-tone='err'] .tests-rail__stamp,
.tests-rail.is-horizontal .tests-rail__case[data-tone='warn'] .tests-rail__stamp,
.tests-rail.is-horizontal .tests-rail__case[data-tone='re'] .tests-rail__stamp,
.tests-rail.is-horizontal .tests-rail__case[data-tone='info'] .tests-rail__stamp {
  color: color-mix(in srgb, var(--tone) 28%, transparent);
}

/* 过期水印（2026-11-21）：与分项页签同一口径 —— 灰章保留上一轮判定码，后缀「?」
   交代「结果待重测」。问号继承水印的等宽 / 斜体 / 同色，只略收字号。
   两种折叠方向共用，纵向的章更小，见下面的 .is-vertical 分支。 */
.tests-rail__case[data-tone='stale'] .tests-rail__stamp {
  color: color-mix(in srgb, var(--tone) 30%, transparent);
}

.tests-rail__case[data-tone='stale'] .tests-rail__stamp::after {
  content: '?';
  margin-left: 1px;
  font-size: 0.78em;
  letter-spacing: 0;
  vertical-align: 0.08em;
}

/* 纵向折叠岛（2026-11-21 用户方案一）：34×32 舒展一格，序号退到左上安全区，
   与右下水印构成「左上 ↘ 右下」对角线；顶部不再画短横线。
   32px 宽的胶囊放不下 16px 的章，水印收到 12.5px（3 字母 10px）压右下角；
   有水印时状态点直接让位（不占位），序号不再居中。 */
.tests-rail.is-vertical .tests-rail__case {
  width: 34px;
  height: 32px;
  border-radius: 7px;
  overflow: hidden;
  isolation: isolate;
}

.tests-rail.is-vertical .tests-rail__case.is-stamped::before {
  display: none;
}

.tests-rail.is-vertical .tests-rail__num {
  position: relative;
  z-index: 1;
}

/* 有水印时序号退到左上内安全区：避开 7px 圆角弧线，和右下水印在垂直方向完全错开。
   字重降到 500、亮度收到 72%：不与顶部 2/3 抢亮度，异常项由下面一条单独提亮。 */
.tests-rail.is-vertical .tests-rail__case.is-stamped .tests-rail__num {
  position: absolute;
  top: 5px;
  left: 6px;
  display: block;
  font-size: 10.5px;
  font-weight: 500;
  line-height: 1;
  color: color-mix(in srgb, var(--text) 72%, transparent);
}

/* 异常样例（WA / TLE / RE）的序号保持亮白，自然往前浮半层；AC 留在 72% */
.tests-rail.is-vertical .tests-rail__case[data-tone='err'].is-stamped .tests-rail__num,
.tests-rail.is-vertical .tests-rail__case[data-tone='warn'].is-stamped .tests-rail__num,
.tests-rail.is-vertical .tests-rail__case[data-tone='re'].is-stamped .tests-rail__num {
  color: color-mix(in srgb, var(--text) 92%, transparent);
}

/* 水印左移 2px（right 3 → 5），只让底部轻微压边，右侧留出干净的呼吸 */
.tests-rail.is-vertical .tests-rail__stamp {
  display: block;
  position: absolute;
  right: 5px;
  bottom: -2px;
  z-index: 0;
  font-family: var(--mono-font);
  font-size: 12px;
  font-weight: 800;
  font-style: italic;
  line-height: 0.85;
  letter-spacing: -0.04em;
  color: color-mix(in srgb, var(--tone) 26%, transparent);
  pointer-events: none;
  user-select: none;
}

.tests-rail.is-vertical .tests-rail__stamp.is-long {
  right: 3.5px;
  bottom: -1px;
  font-size: 9.5px;
  letter-spacing: -0.06em;
}

/* 未通过的状态比 AC 更醒目：与横排章同一档，纵向再提亮到 34% 拉齐辨识度 */
.tests-rail.is-vertical .tests-rail__case[data-tone='ok'] .tests-rail__stamp {
  color: color-mix(in srgb, var(--tone) 26%, transparent);
}

.tests-rail.is-vertical .tests-rail__case[data-tone='err'] .tests-rail__stamp,
.tests-rail.is-vertical .tests-rail__case[data-tone='warn'] .tests-rail__stamp,
.tests-rail.is-vertical .tests-rail__case[data-tone='re'] .tests-rail__stamp,
.tests-rail.is-vertical .tests-rail__case[data-tone='info'] .tests-rail__stamp {
  color: color-mix(in srgb, var(--tone) 34%, transparent);
}

/* 过期章在纵向上也要比常规章实一档（与横排的 30% 对齐） */
.tests-rail.is-vertical .tests-rail__case[data-tone='stale'] .tests-rail__stamp {
  color: color-mix(in srgb, var(--tone) 30%, transparent);
}

/* 扁平纯平键帽（2026-11-21 用户方案一）：零阴影，只用极轻平铺底色区分 */
.tests-rail.is-vertical .tests-rail__case {
  box-shadow: none;
  background: color-mix(in srgb, var(--text) 5%, transparent);
}

.tests-rail.is-vertical .tests-rail__case[data-tone] {
  box-shadow: none;
  background: color-mix(in srgb, var(--tone) 11%, transparent);
}


/* ------------------------------------------------------------
   备选形态：若想直接单行显示 WA / AC 而不是「• 1」，
   把上面 ::before 和 .tests-rail__stamp 注释掉，启用下面 3 条即可：
   ------------------------------------------------------------
.tests-rail__case.is-stamped .tests-rail__num { display: none; }
.tests-rail__stamp {
  font-family: var(--mono-font);
  font-size: 10.5px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: -0.02em;
  color: var(--tone);
  pointer-events: none;
}
.tests-rail__stamp.is-long { font-size: 9.5px; letter-spacing: -0.04em; }
*/

/* 悬停只提亮墨迹，不铺热区底色（2026-11-21 用户要求） */
:where(html.is-hoverable) .tests-rail__run:hover:not(:disabled) {
  color: var(--ok);
}

:where(html.is-hoverable) .tests-rail__case:not([data-tone]):hover {
  background: color-mix(in srgb, var(--text) 8%, transparent);
}

:where(html.is-hoverable) .tests-rail__case:not([data-tone]):hover .tests-rail__num {
  color: var(--text);
}

:where(html.is-hoverable) .tests-rail__case[data-tone]:hover {
  background: color-mix(in srgb, var(--tone) 20%, transparent);
}

/* 横排页签的悬停：与展开态页签同一条哑光加亮（语义底再叠一档，不被整块盖掉） */
:where(html.is-hoverable) .tests-rail.is-horizontal .tests-rail__case:hover {
  background: var(--icon-hover-bg);
}

:where(html.is-hoverable) .tests-rail.is-horizontal .tests-rail__case[data-tone]:hover {
  background: color-mix(in srgb, var(--tone) 10%, var(--icon-hover-bg));
}

</style>
