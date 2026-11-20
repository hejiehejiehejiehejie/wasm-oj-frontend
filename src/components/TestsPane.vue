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
  lastTestsPaneSide,
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

const props = defineProps({
  cases: { type: Array, required: true },
  running: Boolean,
  elapsed: { type: Number, default: 0 },
  runBlocked: { type: String, default: '' },
  notice: { type: Object, default: null },
  showSubmit: Boolean,
  submitting: Boolean,
})

const emit = defineEmits(['add', 'remove', 'run-one', 'run-all', 'submit', 'drag-start'])

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
 * 双击页头空白：在「底部横跨 ↔ 上一次纵向侧」之间一键切换（方案四的零视觉彩蛋）。
 * 页签上的双击仍是切样例 / 编辑，不触发；`lastTestsPaneSide()` 由布局层在每次
 * 纵向停靠时记住，切到底部不会把这一记忆抹掉。
 */
function onHeaderDblClick(event) {
  if (getTestsPaneDragStartKind(event.target)?.kind !== 'head') return
  const target = testsPaneSide() === 'bottom' ? lastTestsPaneSide() : 'bottom'
  testsPaneDrag.settle?.(target, 'island')
}

/* ------------------------------------------------------------ 折叠窄条

   岛被 splitter 拖到极窄时（见 EditorPaneGrid 的折叠阈值），正文与页头都保留挂载、
   只隐藏，窄条顶替它们的可见位置：
     · 页头不能卸载 —— #tests-pane-tabs / -context / -actions 是 Teleport 落点；
     · TestPanel 不能卸载 —— textarea 撤销栈与当前样例都住在里面。
   窄条里只留三件事：通过个数、每条样例页签（判定码水印）、运行全部。
   展开 / 折叠都交给「改岛宽的拖拽条」（分割条，见 EditorPaneGrid 的单击切换）；
   样例页签点下去先展开、再写 pendingCaseId，让 TestCaseTabs 在可见布局上落选中。 */
const collapsed = computed(() => testsRail.collapsed)
const railHorizontal = computed(() => testsPaneSide() === 'bottom')
/** 窄条气泡朝编辑区一侧弹：右停靠 → 左，左停靠 → 右，底部 → 上，不压住岛自己的内容 */
const railTipPlacement = computed(() =>
  railHorizontal.value ? 'top' : testsPaneSide() === 'left' ? 'right' : 'left',
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
 * 窄条顶部的读数：空间只够写 `2/5` 这一档。结论过期时用 `?/n`（与页脚 verdict 同口径），
 * 运行中直接写 `RUN` —— 一条窄轨里「运行中」三个汉字会折行。
 */
const railSummary = computed(() => {
  const total = props.cases.length
  if (!total) {
    return {
      text: '0/0',
      tone: 'muted',
      title: t('tests.pane.passedTooltip', { passed: 0, total: 0 }),
    }
  }
  if (railCounts.value.running) {
    return { text: 'RUN', tone: 'info', title: t('tests.verdict.running') }
  }
  if (railCounts.value.stale) {
    return {
      text: `?/${total}`,
      tone: 'warn',
      title: t('tests.pane.passedTooltip', { passed: '?', total }),
    }
  }
  const passed = railCounts.value.passed
  const tone =
    passed === total ? 'ok' : railCounts.value.error || railCounts.value.failed ? 'fail' : 'muted'
  return {
    text: `${passed}/${total}`,
    tone,
    title: t('tests.pane.passedTooltip', { passed, total }),
  }
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
    :class="{ 'is-bottom': isBottomDocked, 'is-side': isSideDocked, 'is-workbench': workbench }"
    :aria-label="t('tests.pane.ariaLabel')"
  >
    <!-- 工作台布局（方案一）没有页头：拖动把手、结论、动作全部住进左侧样例轨
         （见 TestCaseTabs 的 workbench 分支）。页头在这里整条摘掉，右侧满高分栏
         才有「从顶到底都是数据」的那一版形态。 -->
    <!-- 页头即拖拽面（2026-11-20 方案四）：不再放任何占位的六点抓手。
         按住页签或空白超过阈值就拎起整座岛；右键空白出停靠菜单；双击空白在
         「底部 ↔ 上次纵向侧」之间切换。页签多时整条 35px 页头几乎全是可拖区。 -->
    <header
      v-if="!workbench"
      v-show="!collapsed"
      class="tests-pane__head"
      @pointerdown="onHeaderPointerDown"
      @contextmenu="onHeaderContextMenu"
      @dblclick="onHeaderDblClick"
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
      data-pane-drag-proxy
      @pointerdown="onHeaderPointerDown"
    >
      <!-- 读数 + 样例列表：窄条本身只当拖动把手，展开靠点分割条（见 EditorPaneGrid）。 -->
      <AppTooltip :text="railSummary.title" :placement="railTipPlacement">
        <div class="tests-rail__summary" :data-tone="railSummary.tone">
          <span class="tests-rail__count">{{ railSummary.text }}</span>
        </div>
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
      <!-- 脚：运行全部。与展开态页脚那颗「运行全部」同一位置（竖排贴底 / 横排贴右），
           展开与收起之间视线和鼠标都不用重新找。 -->
      <AppTooltip :text="railRunTitle" :placement="railTipPlacement">
        <button
          type="button"
          class="tests-rail__run"
          :disabled="railRunDisabled"
          :aria-label="t('tests.panel.runAll')"
          @click.stop="emit('run-all')"
        >
          <!-- 单三角（与展开态紧凑底栏的「运行」同一枚字形）：折叠态只有 32px，
               实心双三角 + 折线的 run-all 会读成播放器快进、墨量也比 < 与 1/2 重。
               语义仍是「运行全部」，由 aria-label 与气泡交代。 -->
          <AppIcon name="play-solid" :size="12" />
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

   2026-11-21 单中轴 + 零描边纯哑光体系：整条按「头 / 身 / 脚」收束 ——
   顶部是读数、中部是样例列表、底部（横条为右端）是运行全部，与展开态页脚
   那颗「运行全部」同位。整条窄条就是展开热区（点一下即展开，没有单独的折叠按钮），
   拖动则换位。样例项与展开态页签同源：横排按空间在「样例 N」与数字档之间切换。
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

.tests-rail.is-vertical {
  flex-direction: column;
  padding: 8px 0;
}

.tests-rail.is-horizontal {
  flex-direction: row;
  padding: 0 8px;
}

/* 读数：直接复用展开态页头 span.verdict 的那套字 —— 12px / 600、等宽数字、
   按状态上色；折叠条里放不下判定句的后半段，只保留 2/5 这一截。
   min-width 仍与下方 32px 控件对齐，两位数以上自然长宽、保持居中。
   只展示，不响应点击 —— 展开 / 折叠都点分割条。 */
.tests-rail__summary {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 22px;
  padding: 0 2px;
  border: 0;
  background: transparent;
  color: var(--text-dim);
  font: inherit;
  cursor: default;
}

.tests-rail__count {
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* 与 .verdict 同一组 tone 色：通过绿、失败红、待重测琥珀、运行中蓝 */
.tests-rail__summary[data-tone='ok'] {
  color: var(--ok);
}

.tests-rail__summary[data-tone='fail'] {
  color: var(--fail);
}

.tests-rail__summary[data-tone='warn'] {
  color: var(--warn);
}

.tests-rail__summary[data-tone='info'] {
  color: var(--info);
}

/* 运行键：克制的哑光灰实底（零描边、零渐变、零圆环），视觉沉稳 */
.tests-rail__run {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 7px;
  background: color-mix(in srgb, var(--text) 6%, transparent);
  color: var(--text);
  cursor: pointer;
  transition:
    background-color 0.14s ease,
    color 0.14s ease,
    opacity 0.14s ease;
}

.tests-rail__run:disabled {
  opacity: 0.32;
  cursor: default;
}

/* 分隔线：极淡发丝线，与 32px 控件形成柔和收束 */
.tests-rail__sep {
  flex: 0 0 auto;
  background: color-mix(in srgb, var(--text) 7%, transparent);
}

.tests-rail.is-vertical .tests-rail__sep {
  width: 20px;
  height: 1px;
  margin: 2px 0;
}

.tests-rail.is-horizontal .tests-rail__sep {
  width: 1px;
  height: 18px;
  margin: 0 2px;
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

/* 横排（底部折叠条）里的胶囊一律走纵向岛页签的材质：26px、内容宽、
   右侧留 24px 水印槽，透明底 / 6% 语义底、7px 点、12px/600 字。
   空间够（railRoomy）时换成「样例 N」全称；不够就保留页签收窄后的纯数字。 */
.tests-rail.is-horizontal .tests-rail__case {
  width: auto;
  padding: 0 24px 0 9px;
  gap: 5px;
  overflow: hidden;
  isolation: isolate;
  background: transparent;
}

.tests-rail.is-horizontal .tests-rail__case[data-tone] {
  background: color-mix(in srgb, var(--tone) 6%, transparent);
}

/* 页签的 7px 状态点；带了判定水印就不画点（与页签同一条规矩） */
.tests-rail.is-horizontal .tests-rail__case[data-tone]::before {
  width: 7px;
  height: 7px;
}

.tests-rail.is-horizontal .tests-rail__case.is-stamped[data-tone]::before {
  visibility: hidden;
}

/* 收窄档的序号：与页签同字体同字重（不是等宽小字） */
.tests-rail.is-horizontal .tests-rail__num {
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
}

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

/* 紧凑态不显示判定码水印：单行胶囊只留「状态点 + 序号」。
   若想改成「有结果时单行直接显示 WA / AC」，见下面的备选注释。 */
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

/* 悬停态：全部走干净的哑光加亮，不铺彩色脏底 */
:where(html.is-hoverable) .tests-rail__run:hover:not(:disabled) {
  background: color-mix(in srgb, var(--ok) 18%, transparent);
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
