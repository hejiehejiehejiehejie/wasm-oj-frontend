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
  leafById,
  paneOf,
  previewSplitRect,
  setRatio,
} from '../services/editorPanes.js'
import {
  paneDropHint,
  clearPaneDropHint,
  resolvePaneDrop,
  setPaneDropHint,
  splitTargetOf,
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

/**
 * 是否处于分屏（两片及以上）。
 *
 * 分屏与单窗格不是同一套语法：单窗格时整块 `.pane--editor` 就是一张「悬浮岛」，
 * 网格只是岛里的内容；一旦分屏，外圈那张岛就**溶回地面**，每一片窗格各自成岛
 * （见 App.vue 的 `.pane--editor.is-split` 与本文件 `is-split` 那几条）。
 */
const isSplit = computed(() => layout.value.leaves.length > 1)

function cellStyle(rect) {
  return {
    left: `${rect.x}%`,
    top: `${rect.y}%`,
    width: `${rect.w}%`,
    height: `${rect.h}%`,
  }
}

function splitterStyle(splitter) {
  // 厚度不写在这里：热区宽度按指针形态路由（默认 8px / 触屏 24px，见样式里的
  // --splitter-hit）。内联样式盖不过媒体查询，所以这里只写「与热区无关」的三个数
  // （长度向的 x/w 或 y/h，以及缝的位置 --splitter-at），厚度与偏移全交给样式表
  // 的 calc 去算 —— calc(var(--splitter-at) - var(--splitter-hit) / 2) 保证热区
  // 中心永远压在缝上，加宽只向两侧对称生长。
  if (splitter.axis === 'y') {
    return {
      left: `${splitter.x}%`,
      width: `${splitter.w}%`,
      '--splitter-at': `${splitter.at}%`,
    }
  }
  return {
    top: `${splitter.y}%`,
    height: `${splitter.h}%`,
    '--splitter-at': `${splitter.at}%`,
  }
}

/* ------------------------------------------------------------ 拖放高亮
   整块网格**只有一个**高亮层（不是每片窗格各一个）。落点从「这一片的右半边」换到「那一片
   的下半」时，同一个元素只改 left/top/width/height，那块底色就会滑过去；如果按窗格各放一个，
   换片等于销毁重建，只能闪一下换位置。
   元素常驻、靠 `.is-on` 切透明度 —— 落点消失时停在原地淡出，不会先跳回原点。 */
/**
 * 这次落点会不会把**源窗格**搬空回收：只在跨窗格拖页签、且源窗格只剩被拖这一张时成立
 * （`placeTab` 搬走唯一页签 → 源格空 → `closeEmptyPane` 收掉，落地几何因此变样，
 * 见 editorPanes 的 previewSplitRect）。文件树拖入不搬页签，恒 null。
 *
 * 2026-11-18 口径：落点在**源窗格自己的边缘**也算 —— 照常建新窗格 + 搬页签（取代
 * 2026-11-17 的「只切分、不搬页签」），原格随即搬空被回收、新窗格顶满原格的位置，
 * 高亮必须按这个真实结果画（previewSplitRect 支持 recyclePaneId === paneId 的模拟）。
 */
const recycleSourceId = computed(() => {
  const hint = paneDropHint.value
  const source = paneTabDragSource.value
  if (!hint || !source) return null
  return leafById(source)?.tabs.length === 1 ? source : null
})

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
  // 四边落点：高亮 = **落地后真实会出现的那块区域**（2026-11-18 06:29 用户口径）。
  // splitPane 会把同轴链重排成等分、搬空最后一个页签的源窗格还会被回收 —— 两片并排时
  // 把一片的最后一张页签拖到另一片底缘，落地是上下两栏各占一半，naive 的「那片的一半」
  // 是错的。按 previewSplitRect 在克隆树上模拟整次落地取新窗格矩形；模拟不出才退回
  // 下面的对半矩形（纯几何兜底，正常路径到不了）。
  const side = splitTargetOf(hint.zone)
  if (side) {
    const sim = previewSplitRect({
      paneId: hint.paneId,
      axis: side.axis,
      side: side.side,
      recyclePaneId: recycleSourceId.value,
    })
    if (sim) return sim
  }
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
      // 页签栏只占窗格顶部一条：高亮也只铺那一条，别让人以为整片正文要被顶掉。
      // dx/dy/dw/dh 是边框补偿（2026-11-18 06:15；06:54 缝 8→4 后边框 4px → 2px）：
      // 高亮层带 2px 透明边框，可见底色画在 padding-box —— 不补偿的话横带比页签栏矮
      // 4px（上下各 2px）、整体坠下 2px。把边框盒上下各反向撑出去 2px，可见底色正好
      // 等于页签栏矩形（口径见样式 .is-band）。
      // 水平补偿分模式：分屏时 cell 自带 2px 透明边框，横带铺满 cell 宽收进 padding-box
      // 恰好等于条带宽，不用补；单窗格时 cell 没有边框、条带横跨整个 cell 宽，
      // 高亮层自己的 2px 边框会把可见宽度左右各吃 2px —— 反向撑出去抵消。
      const band = hint.band ?? { top: 0, height: 100 }
      return {
        x: rect.x,
        y: rect.y + (band.top / 100) * rect.h,
        w: rect.w,
        h: (band.height / 100) * rect.h,
        dy: -2,
        dh: 4,
        dx: isSplit.value ? 0 : -2,
        dw: isSplit.value ? 0 : 4,
      }
    }
    default:
      return { x: rect.x, y: rect.y, w: rect.w, h: rect.h }
  }
})

/**
 * 落点是否落在页签栏那条横带上。只用来选高亮的形状（上圆下方的横带 / 全圆角的岛形），
 * 见样式里的 `is-band` —— 横带的上沿要跟住窗格顶部两角的 10px 圆角轮廓，
 * 下沿保持方角与本行的矩形页签同一套语言（2026-11-18 06:15 用户口径）。
 */
const dropIsBand = computed(() => paneDropHint.value?.zone === 'tabstrip')

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
    // px 补偿（dy / dh 等）：横带要抵消 2px 透明边框对可见底色的侵蚀（见 tabstrip 分支）。
    // 用 calc 混排百分比与像素 —— calc 与裸百分比之间可以互相插值，过渡照常走。
    const pct = (v, d) => (d ? `calc(${v}% + ${d}px)` : `${v}%`)
    dropStyle.value = {
      left: pct(rect.x, rect.dx),
      top: pct(rect.y, rect.dy),
      width: pct(rect.w, rect.dw),
      height: pct(rect.h, rect.dh),
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

/** 正在拖的是哪一条分割线（null = 没在拖）。分割线平时不画（分屏靠地面缝隙分开），
 *  只在悬停 / 拖动时亮出来 —— 拖动时指针未必还压在条上（拖得快、拖到窗格外），
 *  所以不能只靠 :hover。记 id 而不是布尔：四宫格里有三条线，只该亮被拖的那一条。 */
const resizingId = ref(null)

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
  resizingId.value = splitter.id
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
  resizingId.value = null
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
    :class="{ 'is-split': isSplit }"
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
      :class="{
        'is-on': !!dropRect,
        'is-placed': dropPlaced,
        'is-band': dropIsBand,
      }"
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
      :class="[
        `editor-grid__splitter--${splitter.axis}`,
        { 'is-active': resizingId === splitter.id },
      ]"
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

/* 分屏（2026-11-18「悬浮岛」）：外圈整片都让给地面，**每片窗格是浮在地面上的岛**。
   缝的宽窄与工作区两栏之间那道一致（06:54 起 4px）：两片之间、窗格与侧栏之间读起来
   是同一种呼吸。
   为什么不在布局树里留 gap：布局树是比例真源（拖分割条只改 ratio），物理缝画在
   渲染层，拖拽换算仍按原比例，怎么分都不会差半格。
   负外边距 −2px 与下面窗格的 2px 透明边框配套：缝只出现在**窗格与窗格之间**，
   整块编辑区的外沿仍与单窗格时逐像素对齐（不会被缝整体往里推 2px）。
   ⚠️ 缝底必须铺在这一层：`.editor-grid__cell` 的透明边框透出的就是它。
   2026-11-18 05:39 口径：缝底 = --bg-ground（与页面四周同一块地面，从两座岛之间
   「自然流过」）。05:19 那版曾把缝底单独压暗成「沟」（--bg-gutter），用户驳回 ——
   「它们之间的颜色与底部颜色并不相同」。
   05:57 再撤一档「谷影」（分割条上的渐变，--pane-gutter-trench 已删）：实测中缝边缘
   dc、而活动栏 ↔ 编辑区那道缝全程纯地面 f1 —— 同屏两种空隙两种画法（用户：「阴影
   不匹配」），且方形渐变带撞上窗格 10px 圆角就生硬截断（「圆角不匹配」）。静置时
   **全应用所有空隙统一：纯地面、无影**，岛与地的分界只靠内芯色阶（contrast 靠岛沿环）。
   之前给窗格投 box-shadow 的三代方案也全都有结构性毛病（border-box 在缝心相接，
   影叠在正中成深色核），别再回去。 */
.editor-grid.is-split {
  margin: -2px;
  background: var(--bg-ground);
}

/* 每片窗格绝对定位 —— 单叶时就是 inset: 0，与改造前同一个盒模型 */
.editor-grid__cell {
  position: absolute;
  overflow: hidden;
}

/* 分屏时四边各加 2px **透明边框**（2026-11-18 06:54 用户「8px 间隔有些宽了」：缝 8 → 4，
   窗格各让 2px）：边框自己不画东西，透出来的是网格铺的地面（--bg-ground），于是相邻
   两片之间自然让出 4px 缝。背景只画到 padding-box，圆角因此要从 12 收到 10（12 − 2），
   与侧栏、设置卡那套圆角一致。
   每片窗格的盒面铺 --bg-panel（岛面）：Monaco / 设置视图自己还会铺一层
   --bg-editor-pane 的内芯，但盒面是岛的最后兜底 —— 任何没被子内容盖住的角落露出来的
   都是岛料，不是地面。
   ⚠️ 窗格**不要**带 box-shadow：影从 border-box 起向外投，而两片窗格的 border-box
   正好在缝心相接 —— 两片各投一段，叠出来的是「缝心一块深色核」（2026-11-18 实测
   浅色缝心被压到 #d9d9d9、比地面深 24 阶）。缝缘的谷影后来也撤了
   （05:57，与工作区其它空隙统一成纯地面，见 .editor-grid.is-split 的注释）。 */
.editor-grid.is-split .editor-grid__cell {
  border: 2px solid transparent;
  border-radius: 12px;
  background: var(--bg-panel);
  background-clip: padding-box;
}

/* 岛的「沿」：一圈 1px 的 --island-edge，画在**岛的内侧**（贴 padding-box，圆角 10 = 12 − 2）。
   不用 box-shadow 的 `0 0 0 1px`：那是画在盒子外面的，两片相邻时会各画一条、在缝里
   叠成一条 2px 的深线 —— 正好变回用户不要的分割线。贴内侧则永远跨不过缝。
   06:30 四阶重校准后十套 --island-edge 全部有值（深 5% 白 / 浅 6% 黑 / 各主题微光 /
   contrast 实灰），这条沿在所有主题都真实画出 —— 马赫带效应补足 4px 窄缝的分离感。
   用伪元素而不是 inset box-shadow：后者画在子内容**下面**，页签栏 / Monaco 一铺就看不见了。 */
.editor-grid.is-split .editor-grid__cell::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  border-radius: 10px;
  box-shadow: inset 0 0 0 1px var(--island-edge);
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
  /* 岛形（2026-11-18 06:15 用户：「除了页签栏的高亮都要圆角」）：与窗格同一套 2px 透明
     边框 + padding-box 背景，单窗格 / 分屏**都**吃 —— 原先这套只挂在 .is-split 上，
     单窗格时拖出来的落点高亮是方角，与分屏后的圆角高亮两套语言（用户报「有时有圆角
     有时没有」）。外沿 span 落点只在 ≥3 片时出现，本来就是分屏态，不受影响。
     边框同时是几何基准：可见底色画在 padding-box，正好压在窗格的可视面上，
     不溢进 4px 缝里。
     ⚠️ 别改成 border 里填色：填色的边框会跨过缝，落点一变就像多画了半条分割线。 */
  border: 2px solid transparent;
  border-radius: 12px;
  background-clip: padding-box;
}

.editor-grid__drop.is-on {
  opacity: 1;
}

/* 落在页签栏那条横带上：**上圆下方**（2026-11-18 06:15 用户口径：页签栏高亮不要整体
   圆角，但横带的上边贴着窗格顶部两角 —— 「窗格的划分」决定了那两角是 10px 圆角，
   上沿得跟住这条轮廓；下沿仍要方的，与本行的矩形页签、2px 插入线同一套语言。
   外圈 12 − 2px 边框 = 可见的 10px，与窗格可视面同值（06:54 缝 8→4：14/4px → 12/2px）。
   高度对齐也在这一版修：可见底色画在 padding-box，原先横带被边框上下各吃掉一截，
   比页签栏矮、整体坠下 —— 几何层（dropRect 的 tabstrip 分支）现在把边框盒
   上下各反向撑出去 2px，可见底色正好等于页签栏矩形。
   优先级说明：本类比基础规则多一段类名、且写在后面，同权重下后写者胜 —— 别调换顺序。 */
.editor-grid__drop.is-band {
  border-radius: 12px 12px 0 0;
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

/* 分割条：8px 命中带罩住那 4px 呼吸缝（窗格各让 2px）—— 热区比缝宽，两侧各多压
   2px 的窗格透明边框区，手感不因缝变窄而变差（06:54）。
   **平时什么都不画**（2026-11-18 悬浮岛）：分屏已经由地面 + 缝交代清楚，常驻痕迹
   会把它又变回「一整块带分割线的大卡」。
   悬停 / 拖动时的反馈是**整条缝罩一层微光洗**（--pane-gutter-wash，深色白微光、浅色黑
   微影，整条缝铺满）：它是「这条缝被捏住了」，不是「出现了一条线」。05:39 之前这里
   是居中 2px 的实线 —— 浅色下比地面深得突兀（用户原话「拖拽的部分在浅色模式下颜色
   更深」），整条微光洗把对比摊薄到同一族中性色里。
   ⚠️ 不用 --accent，也不用 --splitter-line —— 后者是两栏主分隔条的蓝，语义是两码事。
   洗只画在 ::after 上、元素自身 background 保持透明：热区归热区，观感归观感。 */
/* 热区厚度按指针形态路由（2026-11-18 用户要求「触屏放大窗格拖拽的热区」）：
   鼠标 8px（原口径，逐字未变）；触屏 pointer: coarse 下 24px —— 对齐侧栏分隔条的
   触屏口径（那边也是 24px 热区 / 4px 净缝）。位置 = calc(at − 厚度一半)：热区中心
   永远压在缝上，加宽只向两侧对称生长，缝的位置与可见宽度一点没动。
   代价已知：横缝（--y，上下窗格）的 24px 会盖住下窗格页签条带顶部约 7px —— 页签在
   条带里是底对齐（条带 35px / 页签 30px，顶上留 5px），触屏点页签最顶端那一小条会
   命中分隔条；页签主体仍有 23px 可点，先接受这个代价，嫌碍事再把 y 向的伸入改成
   偏向编辑区一侧的非对称值。竖缝（--x）只盖两侧的编辑器正文，Monaco 光标落点在
   缝两侧 10px 内会被它接住 —— 与侧栏热区铺进编辑器 20px 是同一类取舍。
   手势冲突的裁决（2026-11-18 用户口径「标签页手势与分隔条手势冲突，优先分隔条」）：
   两种指针形态下这条都天然成立 —— 触屏靠下面的 z-index: 5（热区整层压过页签栏子树，
   elementsFromPoint 在交叠带里分隔条第一、页签第二；实测按住交叠带起的是 row-resize，
   页签无 pressing / armed / dragging、条带不滚、焦点不切），鼠标 8px 热区够不到页签
   本体 —— 热区下缘只压进条带 2px 的顶留白（条带 35px / 页签 30px 底对齐），离页签
   上缘还差 3px，鼠标下两个手势压根不相交。⚠️ 反过来说：这个 z-index
   就是冲突裁决的实现，别为了盖别的浮层把它降下去 —— 降过页签栏，触屏的缝就捏不到了。 */
.editor-grid__splitter {
  --splitter-hit: 8px;
  position: absolute;
  z-index: 5;
  touch-action: none;
  background: transparent;
}

@media (pointer: coarse) {
  .editor-grid__splitter {
    --splitter-hit: 24px;
  }
}

.editor-grid__splitter--x {
  cursor: col-resize;
  left: calc(var(--splitter-at) - var(--splitter-hit) / 2);
  width: var(--splitter-hit);
}

.editor-grid__splitter--y {
  cursor: row-resize;
  top: calc(var(--splitter-at) - var(--splitter-hit) / 2);
  height: var(--splitter-hit);
}

/* 整条缝的微光洗：**视觉宽度钉死在 8px**（2026-11-18 用户口径「视觉上不用加宽它」——
   触屏热区放大到 24px 只加大命中范围，洗不跟着长）。热区是透明的本就看不见，唯一
   会画墨迹的是这层 ::after：用 calc(50% ± 4px) 把它约束在热区正中的 8px 上 ——
   鼠标下热区本来就是 8px（inset: 0 与 8px 等宽），两种形态下洗的视觉逐像素一致，
   都比 4px 缝宽一点、边缘溢进窗格透明边框区被圆角裁掉，观感仍是「只罩缝」。 */
.editor-grid__splitter::after {
  content: '';
  position: absolute;
  background: var(--pane-gutter-wash, var(--text-dim));
  opacity: 0;
  transition: opacity 0.12s ease;
}

.editor-grid__splitter--x::after {
  top: 0;
  bottom: 0;
  left: calc(50% - 4px);
  right: calc(50% - 4px);
}

.editor-grid__splitter--y::after {
  left: 0;
  right: 0;
  top: calc(50% - 4px);
  bottom: calc(50% - 4px);
}

/* 拖动期间指针可能已经离开热区（拖得快、或拖到窗格外），所以除了 :hover 还要认
   `.is-active`（只挂在正被拖的那一条上，见 beginResize）—— 只靠 :hover 的话，
   洗会在拖动途中闪一下就没了；而四宫格里三条缝一起亮又太吵。
   触屏没有悬停：松手前洗不出现，也不影响拖（热区罩住整条缝，宽度见上面的 --splitter-hit）。 */
:where(html.is-hoverable) .editor-grid__splitter:hover::after,
.editor-grid__splitter.is-active::after {
  opacity: 1;
}
</style>
