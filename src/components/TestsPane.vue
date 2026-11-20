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
import { computed, ref } from 'vue'
import { t } from '../i18n/index.js'
import { isTouchPointer } from '../composables/useMobileKeyboard.js'
import { lastTestsPaneSide, testsPaneSide } from '../services/editorPanes.js'
import { caseView } from '../services/shellSettings.js'
import {
  getTestsPaneDragStartKind,
  testsPaneDrag,
} from '../services/testsPaneDrag.js'
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

</style>
