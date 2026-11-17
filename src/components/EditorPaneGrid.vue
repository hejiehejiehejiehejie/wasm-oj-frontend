<script setup>
/**
 * EditorPaneGrid —— 编辑区渲染层：把 `services/editorPanes.js` 的布局树画成实际窗格。
 *
 * 【职责边界】
 * - 树仍是唯一真源：这里只**读** `editorPanes.root`（经 `computePaneRects` 换成百分比矩形），
 *   写只发生在三处：`setRatio`（拖分割条）、`focusPane`（点/聚焦哪片窗格）、
 *   `closeEmptyPane`（空窗格占位上的按钮，见 EditorPane.vue —— 只有分屏刚造出来、还没装过
 *   页签的格子才走得到；装过页签又变空的格子由 `editorPanes.reapEmptyPanes()` 自动收掉）。
 * - 每片叶子一个 `<EditorPane :pane-id>`，`:key` 用 **leaf.id**。分割叶子时 editorPanes
 *   复用原叶子 id（不变式 4），所以分割那一刻原窗格的 Monaco 实例不重建、不闪。
 * - 宽窄屏共用同一套几何（`computePaneRects`）：布局树怎么分就怎么画，旋屏只改变容器尺寸，
 *   不会把上下分翻成左右、也不会归并窗格。
 *
 * 【对外接口】App.vue 把原来直接挂在 EditorPane 上的 ref 挂到这里，`layout()` /
 * `focus()` / `exportImage()` / `openNode()` 一律转给**焦点窗格**的实例；其余 props 与
 * 监听器经 `$attrs` 原样透传给每一片 EditorPane（它们都是同一份全局设置）。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  computePaneRects,
  editorPanes,
  focusPane,
  focusedLeaf,
  paneOf,
  setRatio,
} from '../services/editorPanes.js'
import {
  paneDropHint,
  clearPaneDropHint,
  resolvePaneDrop,
  setPaneDropHint,
} from '../services/paneDropTarget.js'
import { createPaneForDrop, paneTabDragSource } from '../services/editorPaneDrop.js'
import { beginPaneResize, endPaneResize } from '../services/paneResize.js'
import { registerDropZone } from '../composables/useTreeDrag.js'
import { openFile, pinTab } from '../services/vfs/workspaceStore.js'
import EditorPane from './EditorPane.vue'

// 监听器与 class 等非 prop 属性直接落到 EditorPane 上（本组件不声明 emits）
defineOptions({ inheritAttrs: false })

defineProps({
  settings: { type: Object, required: true },
  panelPosition: { type: String, required: true },
  timeLimit: { type: Number, required: true },
  memoryLimit: { type: Number, required: true },
  checker: { type: String, required: true },
  judge: { type: Object, required: true },
  connection: { type: Object, required: true },
  uiScale: { type: Number, required: true },
})

const gridEl = ref(null)

/** 渲染用的矩形：宽窄屏同一套几何，直接按布局树换算 */
const layout = computed(() => computePaneRects(editorPanes.root))

function cellStyle(rect) {
  return {
    left: `${rect.x}%`,
    top: `${rect.y}%`,
    width: `${rect.w}%`,
    height: `${rect.h}%`,
  }
}

function splitterStyle(splitter) {
  if (splitter.axis === 'y') {
    return {
      left: `${splitter.x}%`,
      top: `calc(${splitter.at}% - 4px)`,
      width: `${splitter.w}%`,
      height: '8px',
    }
  }
  return {
    left: `calc(${splitter.at}% - 4px)`,
    top: `${splitter.y}%`,
    width: '8px',
    height: `${splitter.h}%`,
  }
}

/* ------------------------------------------------------------ 拖放高亮
   整块网格**只有一个**高亮层（不是每片窗格各一个）。落点从「这一片的右半边」换到「那一片
   的下半」时，同一个元素只改 left/top/width/height，那块底色就会滑过去；如果按窗格各放一个，
   换片等于销毁重建，只能闪一下换位置。
   元素常驻、靠 `.is-on` 切透明度 —— 落点消失时停在原地淡出，不会先跳回原点。 */
const dropRect = computed(() => {
  const hint = paneDropHint.value
  if (!hint) return null
  // 外沿跨越：高亮不铺在某片窗格里，而是整块网格的一条 —— 三列落底部就是「底部那条
  // 横贯全宽」，与松手后 `splitSpanning` 切出来的形状一致。比例取 hint.span.share
  // （由 editorPanes 的 spanPaneShare 现算），跟落地用同一个数。
  if (hint.span) {
    const p = Math.min(100, Math.max(0, hint.span.share * 100))
    if (hint.span.axis === 'y') {
      return hint.span.side === 'before'
        ? { x: 0, y: 0, w: 100, h: p }
        : { x: 0, y: 100 - p, w: 100, h: p }
    }
    return hint.span.side === 'before'
      ? { x: 0, y: 0, w: p, h: 100 }
      : { x: 100 - p, y: 0, w: p, h: 100 }
  }
  const rect = layout.value.leaves.find((leaf) => leaf.id === hint.paneId)
  if (!rect) return null
  switch (hint.zone) {
    case 'left':
      return { x: rect.x, y: rect.y, w: rect.w / 2, h: rect.h }
    case 'right':
      return { x: rect.x + rect.w / 2, y: rect.y, w: rect.w / 2, h: rect.h }
    case 'top':
      return { x: rect.x, y: rect.y, w: rect.w, h: rect.h / 2 }
    case 'bottom':
      return { x: rect.x, y: rect.y + rect.h / 2, w: rect.w, h: rect.h / 2 }
    case 'tabstrip': {
      // 页签栏只占窗格顶部一条：高亮也只铺那一条，别让人以为整片正文要被顶掉
      const band = hint.band ?? { top: 0, height: 100 }
      return {
        x: rect.x,
        y: rect.y + (band.top / 100) * rect.h,
        w: rect.w,
        h: (band.height / 100) * rect.h,
      }
    }
    default:
      return { x: rect.x, y: rect.y, w: rect.w, h: rect.h }
  }
})

/**
 * 页签栏落点的插入线（竖线）。位置由 paneDropTarget 在指针所在的那两格之间算出来，
 * 这里只把百分比换成高亮层的坐标系。没有插入线就不画 —— 落点不在页签栏上时它是 null。
 */
const insertBarStyle = computed(() => {
  const hint = paneDropHint.value
  if (hint?.zone !== 'tabstrip' || hint.insertX == null) return null
  const rect = layout.value.leaves.find((leaf) => leaf.id === hint.paneId)
  if (!rect) return null
  const band = hint.band ?? { top: 0, height: 100 }
  return {
    left: `${rect.x + (hint.insertX / 100) * rect.w}%`,
    top: `${rect.y + (band.top / 100) * rect.h}%`,
    height: `${(band.height / 100) * rect.h}%`,
  }
})

/** 高亮层当前该在哪（百分比）。落点消失时故意保留上一块 —— 只淡出，不跳位 */
const dropStyle = ref(null)
/** 位移补间的开关：第一次出现没有起点，那一帧先别挂过渡（否则会从左上角的零尺寸长出来） */
const dropPlaced = ref(false)

watch(
  dropRect,
  (rect) => {
    if (!rect) return
    const first = !dropStyle.value
    dropStyle.value = {
      left: `${rect.x}%`,
      top: `${rect.y}%`,
      width: `${rect.w}%`,
      height: `${rect.h}%`,
    }
    if (first) nextTick(() => { dropPlaced.value = true })
  },
  { immediate: true },
)

/* ------------------------------------------------------------ 焦点联动
   捕获阶段挂在整块网格上：页签、Monaco、空态占位的任何一次 pointerdown 都先把
   焦点落到所在窗格；focusin 兜键盘 / 程序化聚焦（Tab 进另一片窗格时同样生效）。
   `workspace.activeId` 是焦点叶子的访问器，所以这里只改 focusedPaneId 一处。 */
function focusPaneAt(event) {
  const cell = event.target?.closest?.('.editor-grid__cell')
  const paneId = cell?.dataset?.paneId
  if (paneId) focusPane(paneId)
}

/* ------------------------------------------------------------ 拖放：页签 / 文件树
   落点的五区判定在 services/paneDropTarget.js。两条入口共用同一份高亮（`paneDropHint`）：
   · 页签拖拽：EditorTabs 开拖时写下源窗格（paneTabDragSource），这里挂 window 上的
     pointermove 跟着算 —— 不能只监听网格自己的 `@pointermove`：拖到左边文件树上方时
     网格收不到事件，高亮会僵在最后一帧；
   · 文件树拖拽：useTreeDrag 逐帧回调 onDragOver（拖文件跨组件，见 registerDropZone）。
   ⚠️ 命中必须走 elementsFromPoint：拖拽中的元素跟手浮在指针下面，`closest` 会沿 DOM
   父链认成源窗格（见 paneDropTarget 文件头）。 */
function updateTabDropHint(event) {
  const source = paneTabDragSource.value
  if (!source) return
  const target = resolvePaneDrop({ x: event.clientX, y: event.clientY }, { sourcePaneId: source })
  // 同一片窗格的中心区 = 条带自己的排序，不是「跨窗格落点」，不亮
  setPaneDropHint(target)
}

watch(paneTabDragSource, (source) => {
  if (source) window.addEventListener('pointermove', updateTabDropHint)
  else {
    window.removeEventListener('pointermove', updateTabDropHint)
    clearPaneDropHint()
  }
})

/**
 * 文件树拖进来时不认页签栏的「插到第几张」：`openFile` 只会追加到末尾，没有插入下标
 * 这个概念，所以页签栏按「并进这片窗格」的中心区处理，免得高亮画出一条骗人的插入线。
 * @param {{paneId: string, zone: string}|null} target
 */
function asPaneDrop(target) {
  return target?.zone === 'tabstrip' ? { paneId: target.paneId, zone: 'center' } : target
}

/**
 * 文件树拖进编辑区：中心区 = 在这片窗格里打开；边缘 = 先按边缘切分，再在新窗格里打开
 * （外沿落点靠 `createPaneForDrop` 判成跨越式，见 services/editorPaneDrop.js）。
 * 文件已经开着时**不切**（v1 禁止同一文件双开）：把焦点送回宿主窗格，与 openFile 的
 * 跨窗格路由同一条规矩 —— 切出来的新窗格只会空着等人，不如不切。
 */
async function onFileDrop(node, point) {
  const target = asPaneDrop(resolvePaneDrop(point))
  if (!target) return
  const open = paneOf(node.id)
  if (open) {
    focusPane(open.id)
  } else if (target.zone !== 'center') {
    focusPane(createPaneForDrop(target) ?? target.paneId)
  } else {
    focusPane(target.paneId)
  }
  try {
    await openFile(node.id, null)
  } catch {
    return // 拖到一半文件被删了之类：静默收场
  }
  pinTab(node.id)
}

function onFileDragOver(_node, point) {
  setPaneDropHint(asPaneDrop(resolvePaneDrop(point)))
}

function onFileDragLeave() {
  clearPaneDropHint()
}

let unregisterDropZone = null

onMounted(() => {
  unregisterDropZone = registerDropZone({
    el: gridEl.value,
    // 目录不接：拖进编辑区是「打开」语义，移动目录请落在树里
    canDrop: (node) => node.type === 'file',
    onDragOver: onFileDragOver,
    onDragLeave: onFileDragLeave,
    onDrop: onFileDrop,
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', updateTabDropHint)
  clearPaneDropHint()
  // 拖到一半被卸载（关工作区、切到没有编辑区的视图）：把「正在拖」这个瞬时状态和一整套
  // window 监听一起收干净，否则页签栏会一直停在瞬时过渡上
  if (drag) endResize()
  unregisterDropZone?.()
  unregisterDropZone = null
})

/* ------------------------------------------------------------ 分割条拖拽 */

let drag = null

/**
 * pointerdown 时把「所属 split 节点的像素矩形」缓存下来：拖动只改这一条分割线的
 * ratio，父级几何不动，所以整段拖动期间这个矩形是稳定的。按它把指针位置换算成
 * ratio（a 的占比）即可，不需要每帧读 DOM。
 *
 * `beginPaneResize()` 是给页签栏看的（见 services/paneResize.js）：整段拖动期间窗格
 * 连同里面的页签栏都在视口里平移，TransitionGroup 的 FLIP 会把这当成列表重排、
 * 把页签倒拖回旧位置 —— 置位后页签栏切瞬时过渡，页签才跟得上条带。
 */
function beginResize(event, splitter) {
  if (event.button !== 0) return
  const rect = gridEl.value?.getBoundingClientRect()
  if (!rect || !rect.width || !rect.height) return
  event.preventDefault()
  const region = splitter.region
  drag = {
    id: splitter.id,
    axis: splitter.axis,
    left: rect.left + (region.x / 100) * rect.width,
    top: rect.top + (region.y / 100) * rect.height,
    width: (region.w / 100) * rect.width,
    height: (region.h / 100) * rect.height,
  }
  beginPaneResize()
  document.body.style.cursor = splitter.axis === 'y' ? 'row-resize' : 'col-resize'
  document.body.style.userSelect = 'none'
  window.addEventListener('pointermove', onResizeMove)
  window.addEventListener('pointerup', endResize)
  window.addEventListener('pointercancel', endResize)
}

function onResizeMove(event) {
  if (!drag) return
  const ratio =
    drag.axis === 'y'
      ? (event.clientY - drag.top) / drag.height
      : (event.clientX - drag.left) / drag.width
  setRatio(drag.id, ratio)
}

function endResize() {
  drag = null
  endPaneResize()
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  window.removeEventListener('pointermove', onResizeMove)
  window.removeEventListener('pointerup', endResize)
  window.removeEventListener('pointercancel', endResize)
}

/** 双击分割条回到对半 —— 拖歪了不用靠手感拖回来 */
function resetRatio(splitter) {
  setRatio(splitter.id, 0.5)
}

/* ------------------------------------------------------------ 对 App 的代理 */

const paneRefs = new Map()

function setPaneRef(paneId, instance) {
  if (instance) paneRefs.set(paneId, instance)
  else paneRefs.delete(paneId)
}

function focusedPane() {
  return paneRefs.get(focusedLeaf()?.id) ?? null
}

defineExpose({
  layout: () => focusedPane()?.layout(),
  exportImage: () => focusedPane()?.exportImage(),
  focus: () => focusedPane()?.focus(),
  openNode: (id) => focusedPane()?.openNode(id),
})
</script>

<template>
  <div
    ref="gridEl"
    class="editor-grid"
    @pointerdown.capture="focusPaneAt"
    @focusin="focusPaneAt"
  >
    <div
      v-for="rect in layout.leaves"
      :key="rect.id"
      class="editor-grid__cell"
      :data-pane-id="rect.id"
      :style="cellStyle(rect)"
    >
      <EditorPane
        :ref="(el) => setPaneRef(rect.id, el)"
        v-bind="$attrs"
        :settings="settings"
        :panel-position="panelPosition"
        :time-limit="timeLimit"
        :memory-limit="memoryLimit"
        :checker="checker"
        :judge="judge"
        :connection="connection"
        :ui-scale="uiScale"
        :pane-id="rect.id"
      />
    </div>

    <!-- 拖放落点高亮：整片网格只有这一层，换区 / 跨窗格时靠 left/top/width/height 的补间
         把同一块底色滑过去（见脚本里的 dropRect）。外沿落点是「跨越整块编辑区」的一整条
         （三列落底部 = 横贯全宽的一条），也铺在这一层上。压在最上层但 pointer-events: none，
         命中测试永远穿透到内容 -->
    <div
      class="editor-grid__drop"
      :class="{ 'is-on': !!dropRect, 'is-placed': dropPlaced }"
      :style="dropStyle"
      aria-hidden="true"
    />

    <!-- 页签栏落点的插入线：钉在「松手后会插进去的那条缝」上。不做补间 —— 插入点是离散
         的槽位，滑过去反而像没对准；跟着指针对齐才读得出「插在谁前面」。 -->
    <div
      v-if="insertBarStyle"
      class="editor-grid__insert"
      :style="insertBarStyle"
      aria-hidden="true"
    />

    <div
      v-for="splitter in layout.splitters"
      :key="splitter.id"
      class="editor-grid__splitter"
      :class="`editor-grid__splitter--${splitter.axis}`"
      :style="splitterStyle(splitter)"
      role="separator"
      :aria-orientation="splitter.axis === 'y' ? 'horizontal' : 'vertical'"
      @pointerdown="beginResize($event, splitter)"
      @dblclick="resetRatio(splitter)"
    />
  </div>
</template>

<style scoped>
/* 与改造前的 EditorPane 一样，是 `.pane--editor` 里那个「占满剩余空间」的 flex 子项 */
.editor-grid {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

/* 每片窗格绝对定位 —— 单叶时就是 inset: 0，与改造前同一个盒模型 */
.editor-grid__cell {
  position: absolute;
  overflow: hidden;
}

/* 拖放落点高亮：中心 = 整片窗格；四边 = 即将切出来的那一半；外沿 = 横跨整块编辑区的一条
   （三列落底部、三排落左右，见 paneDropTarget 的 spanTargetOf）。颜色与资源管理器
   「拖到根区域」同一个变量（两套主题自动跟随）。
   只留底色、不描边：这里的形状是「窗格的一半」，再套一圈内描边会像多出一层边框，
   与相邻窗格拼在一起还会出现双重线；靠底色对比已经足够指示落点。
   整片网格只有这一层（几何在脚本的 dropRect 里算）：换区、跨窗格都是同一个元素在改
   left/top/width/height，所以那块底色是**滑过去**的，而不是消失再出现。
   pointer-events: none 是硬要求：高亮层盖在 Monaco 上，命中测试（elementsFromPoint）
   必须能穿透它拿到窗格与正文。 */
.editor-grid__drop {
  position: absolute;
  z-index: 4;
  pointer-events: none;
  background: var(--bg-drop-root);
  opacity: 0;
  transition: opacity 0.12s ease;
}

.editor-grid__drop.is-on {
  opacity: 1;
}

/* 位移补间只在「已经落过一次位」之后才挂：首次出现没有起点，硬补间会从左上角的
   零尺寸长出来。130ms ease-out —— 跟手，但不至于指针划得很快时拖一条尾巴。
   指针在同一区里逐帧移动时这四个值没变，不会反复重启过渡。 */
.editor-grid__drop.is-placed {
  transition:
    opacity 0.12s ease,
    left 0.13s cubic-bezier(0.2, 0.8, 0.3, 1),
    top 0.13s cubic-bezier(0.2, 0.8, 0.3, 1),
    width 0.13s cubic-bezier(0.2, 0.8, 0.3, 1),
    height 0.13s cubic-bezier(0.2, 0.8, 0.3, 1);
}

/* 页签栏落点的插入线：2px 宽、居中压在「缝」上（margin-left 抵消一半）。颜色用主题色，
   与分割条悬停同一个口径 —— 这条线是「即将发生的动作」，不是常驻装饰，所以不跟分割线
   一起调淡。不倒圆角：2px 宽的线圆角看不出来，徒增一个圆角档位。
   pointer-events: none 同样必须：命中测试要能穿过去够到页签。 */
.editor-grid__insert {
  position: absolute;
  z-index: 5;
  margin-left: -1px;
  width: 2px;
  pointer-events: none;
  background: var(--accent, var(--text-dim));
}

/* 分割条：8px 命中带贴着分割线居中放（样式上只有中间那 2px 可见），
   因此两侧窗格可以严丝合缝，拖拽手感却不差。线宽与命中带宽度互不牵连 ——
   线走 ::after 的绝对定位，热区不变，加粗只影响「看得见的那一条」。 */
.editor-grid__splitter {
  position: absolute;
  z-index: 5;
  touch-action: none;
  background: transparent;
}

.editor-grid__splitter--x {
  cursor: col-resize;
}

.editor-grid__splitter--y {
  cursor: row-resize;
}

/* 分隔线：比 --border-soft 再淡一档（用户 2026-11-16 报「分割线颜色太深」）。
   用 color-mix 溶进透明，而不是写死一个更浅的灰度：线底下就是两片窗格各自的底色，
   十套主题（含 paper / leaf / mist）会自动跟着变淡，不必逐主题维护一份值。
   55% 是量出来的 —— 浅色 #e4e4e4 对 #fdfdfd（25 阶）落到 15 阶，
   深色 #2d2d32 对 #1c1c1c（17 阶）落到 9 阶：这个对比度仍交代得出「这里能拖」，又不抢正文。
   2026-11-17 用户要求「加粗窗格之间的分隔线」：线宽 1px → 2px，**色值不动** ——
   上一轮刚按「太深」压到 55%，厚度与深浅是两件事，加粗只补「看得见」，不把颜色调回去。
   悬停变主题色那条保留 —— 那是拖拽反馈，不该跟着变淡。 */
.editor-grid__splitter::after {
  content: '';
  position: absolute;
  background: color-mix(in srgb, var(--border-soft) 55%, transparent);
  transition: background-color 0.12s ease;
}

/* 居中用 calc(50% - 半宽) 而不是写死 left: 3px：线宽以后若再变（3px 以上会被
   postcss-pxtorem 转成 rem，跟着界面缩放走），这条偏移不用跟着重算。 */
.editor-grid__splitter--x::after {
  top: 0;
  bottom: 0;
  left: calc(50% - 1px);
  width: 2px;
}

.editor-grid__splitter--y::after {
  left: 0;
  right: 0;
  top: calc(50% - 1px);
  height: 2px;
}

:where(html.is-hoverable) .editor-grid__splitter:hover::after {
  background: var(--accent, var(--text-dim));
}
</style>
