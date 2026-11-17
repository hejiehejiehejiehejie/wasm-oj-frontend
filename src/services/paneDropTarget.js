/**
 * paneDropTarget —— 编辑区拖放的**落点判定**与高亮状态。
 *
 * 【为什么要有它】分屏之后「落进编辑区」不再是一个布尔量：
 *   · 落在某片窗格的**页签栏** → 插到那两张页签之间（绝不分屏）；
 *   · 落在某片窗格的**内容区中心** → 放进这片窗格（页签追加到末尾 / 文件在此打开）；
 *   · 落在某片窗格的**内容区四边** → 把这片窗格在此边缘一分为二，内容放进新窗格。
 *
 * 【几何】边缘带宽 = min(内容区尺寸 × 25%, 120px)；角部按「归一化边缘深度」二选一
 * （到边的距离 ÷ 该方向的带宽，取更小者）。**不能直接比像素距离** —— 宽 800、高 300 的
 * 窗格里左右带 120px、上下带 75px，按像素比会让角部的分界线变成 45° 射线，与内框矩形
 * 的顶点对不上，鼠标沿内框拐角移动时会突然跳区。归一化之后分界线正好连接外框与内框的顶点。
 *
 * 【页签栏不是「上边缘」】命中只取 `.editor-pane__stage`（页签栏下方那块正文）的矩形。
 * 如果把整片窗格（含页签栏）当五区矩形，用户拖到页签栏时指针贴着窗格顶部，会被 100%
 * 判成「上边缘切分」—— 这是最典型的误触。
 *
 * 【四条防误触规则】
 *   1. 窗格数已到上限 → 两条轴一律不可切，整个内容区都是中心区（上限见 editorPanes 的
 *      `MAX_PANES`，宽窄屏一致）；
 *   2. 同一片窗格 + 唯一一张页签拖到自己的边缘 → **认**，但落地时只切分、不搬页签
 *      （见 EditorTabs 的 moveAcrossPanes）。切完原窗格不会空掉，于是不会触发空窗格回收，
 *      结果就是「原窗格留着这张页签 + 旁边多出一格空的」—— 与 ⌘⌥\ 的语义一致。
 *      早先这里一律不认：切分 + 搬页签 + 回收原窗格三步抵消，画面闪一下等于没变。可那样
 *      一来「本窗格只有一张页签」就**永远切不出分屏**，而且不亮高亮，鼠标和触摸看起来都是
 *      「手势没反应」。
 *      **例外（2026-11-17 用户口径）**：整个编辑区总共只有这一张页签时不切 —— 切出来的
 *      第二格必然是空的，那不算分屏，只是凭空多出一页占位页。判据在 `resolvePaneDrop`
 *      末尾（要全局页签数，几何层看不到这一层）。
 *   3. **最小尺寸保护**：目标内容区对半分之后两半都得站得住，太窄/太矮就只留另一条轴
 *      （宽窄屏同一套判据）；
 *   4. 同一片窗格的中心区 / 页签栏 → 交回条带自身的排序，不亮「跨窗格」高亮。
 *
 * 【外沿落点 = 跨越整块编辑区】并排三列时把页签拖到底部，切一片叶子得到的是「第三列再分
 * 上下」—— 半格只有一列宽，装不下代码。所以再加一条几何判据：落点那条边**正好压在网格
 * 边界上**（这片窗格的外沿就是编辑区的外沿）且叶子数 ≥ `SPAN_MIN_PANES` 时，改判为
 * 「在外面接一条」：新窗格横跨全部列（落左右时纵贯全部行），落地走 `splitSpanning`，
 * 高亮也按整块网格的一半（或 1/(n+1)）画。三列落底部、三排落左右都是这一条。
 *
 * 两片时不跨越：那时切一片正好得到一半宽/高，本来就好用，而「只切这一列」才是主操作 ——
 * 外沿判据只管 ≥3 片的并排，别把老手感改掉。
 *
 * 【迟滞】指针停在带宽边界上微微抖动时，zone 会在「边缘 ↔ 中心」之间高频切换。所以
 * 记住上一次命中的边（`stickyEdge`）：还在这条边上时把带宽外扩 12px，必须往中心方向多退
 * 12px 才认中心区。离开边缘后立刻恢复原带宽 —— 于是「进 120px、出 132px」形成一个
 * 12px 的死区，不会在两个状态之间抖。
 *
 * 【谁在用它】
 *   · `components/EditorPaneGrid.vue`：拖拽期间逐帧算落点、画高亮、提交文件树拖入；
 *   · `components/EditorTabs.vue`：松手时算落点，把页签搬进目标窗格 / 新分屏。
 * 高亮状态（`paneDropHint`）只是界面量，真正的落盘仍由各自的 `onDrop` / `onStripDrop` 做。
 *
 * 【命中用 elementsFromPoint】拖拽中的页签 / 幽灵跟手浮在指针下面，`elementFromPoint`
 * 拿到的常是它自己，`closest('.editor-grid__cell')` 会沿 **DOM 父链**回到**源**窗格，
 * 于是跨窗格落点永远被判成「同一片」。`elementsFromPoint` 只返回几何上盖住该点的元素，
 * 被拖元素不在其中（幽灵是 pointer-events: none，页签不在那个点上），第一个
 * `.editor-grid__cell` 才是指针真正悬停的那片。
 */
import { shallowRef } from 'vue'
import { allTabs, leaves, MAX_PANES, spanPaneShare } from './editorPanes.js'

/** 边缘带宽占内容区尺寸的比例 */
const EDGE_RATIO = 0.25
/** 边缘带宽的像素上限（大窗格里 25% 太宽，会吃掉大半个正文） */
const EDGE_MAX_PX = 120
/** 迟滞量：已经落在某条边上时，带宽外扩这么多像素才允许退回中心区 */
const EDGE_STICKY_PX = 12

/** 外沿落点改判为「跨越整块编辑区」所需的叶子数（三列落底部、三排落左右；两片见文件头） */
const SPAN_MIN_PANES = 3
/** 判「这片窗格的外沿就是网格边界」的容差（百分比定位有小数，不能直接相等） */
const OUTER_EDGE_EPS = 1.5

/**
 * 单个窗格的最小可用尺寸（px）。
 *
 * 这条阈值是对半分之后的**保守下界**：`splitPane` 在切完会把同一排/同一列重新等分
 * （见 editorPanes 的 equalizeAxisChain），于是「n 段 → n+1 段」时新窗格的宽度是
 * `整排宽 / (n+1)`，恒 ≥ 目标窗格的一半。按一半判，不会放过真正的窄条，最多在
 * 「本来就比一半宽」的边界场景上保守一点 —— 宁可少切一格，也不要切出一条 80px 的缝。
 *
 * 120px 是量出来的：Monaco 在这个宽度仍能显示 20 来列代码，再窄就只剩横向滚动了。
 */
export const MIN_PANE_WIDTH = 120
export const MIN_PANE_HEIGHT = 120

/** 四边集合（迟滞只记这一档；中心区 / 页签栏不参与） */
const EDGE_ZONES = new Set(['left', 'right', 'top', 'bottom'])

/**
 * 指针此刻的落点提示：`{ paneId, zone, band?, insertX?, span? }`。
 * zone ∈ 'center' | 'left' | 'right' | 'top' | 'bottom' | 'tabstrip'；null = 没有落点。
 *   · `band`（仅 tabstrip）= 页签栏在窗格里的纵向位置与高度，**相对窗格的百分比**；
 *   · `insertX`（仅 tabstrip）= 插入线在窗格里的横坐标，相对窗格宽度的百分比；
 *   · `span`（仅外沿跨越）= `{ axis, side, share }`，新窗格横跨整块编辑区：
 *     `axis` 是切的方向、`side` 是挂在哪一侧、`share` 是它占的比例（见 editorPanes 的
 *     `spanPaneShare`）。有它就说明「不是切这一片，是在整棵树外面接一条」。
 * 用百分比而不是像素：高亮层是按百分比定位的，换区时可以直接补间，不需要读 DOM 换算。
 * 只给渲染层画高亮用，不参与落盘（落盘时按松手坐标重新算一遍，见 resolvePaneDrop）。
 */
export const paneDropHint = shallowRef(null)

/** 上一次命中的边（`{ paneId, zone }`）；一次拖拽会话内有效，见文件头的「迟滞」 */
let stickyEdge = null

/** @param {{paneId: string, zone: string, band?: object|null, insertX?: number|null, span?: object|null}|null} next */
export function setPaneDropHint(next) {
  const value = next
    ? {
        paneId: next.paneId,
        zone: next.zone,
        band: next.band ? { top: next.band.top, height: next.band.height } : null,
        insertX: typeof next.insertX === 'number' ? next.insertX : null,
        span: next.span
          ? { axis: next.span.axis, side: next.span.side, share: next.span.share }
          : null,
      }
    : null
  const prev = paneDropHint.value
  if (
    prev?.paneId === value?.paneId &&
    prev?.zone === value?.zone &&
    (prev?.insertX ?? null) === (value?.insertX ?? null) &&
    (prev?.band?.top ?? null) === (value?.band?.top ?? null) &&
    (prev?.band?.height ?? null) === (value?.band?.height ?? null) &&
    prev?.span?.axis === value?.span?.axis &&
    prev?.span?.side === value?.span?.side &&
    prev?.span?.share === value?.span?.share
  ) {
    return
  }
  paneDropHint.value = value
  stickyEdge = value && EDGE_ZONES.has(value.zone) ? { paneId: value.paneId, zone: value.zone } : null
}

export function clearPaneDropHint() {
  stickyEdge = null
  if (paneDropHint.value) paneDropHint.value = null
}

/**
 * 五区几何判定（**纯函数**：只回答「这个点落在矩形的哪个区」，不读 DOM、不认拖拽源）。
 * 单独拆出来是为了能脱离浏览器验算边界：角部、带宽、迟滞都是纯算式。
 *
 * @param {{left: number, top: number, width: number, height: number}} rect 内容区矩形
 * @param {number} clientX
 * @param {number} clientY
 * @param {{canSplitX?: boolean, canSplitY?: boolean, sticky?: string|null}} [options]
 *   canSplitX = 能否左右切（false 时左右边缘带整体消失）；sticky = 上一帧命中的边
 * @returns {'center'|'left'|'right'|'top'|'bottom'|null} null = 点不在这个矩形里
 */
export function hitTestFiveZones(
  rect,
  clientX,
  clientY,
  { canSplitX = true, canSplitY = true, sticky = null } = {},
) {
  const x = clientX - rect.left
  const y = clientY - rect.top
  if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null

  const bandX = canSplitX ? Math.min(rect.width * EDGE_RATIO, EDGE_MAX_PX) : 0
  const bandY = canSplitY ? Math.min(rect.height * EDGE_RATIO, EDGE_MAX_PX) : 0
  if (!bandX && !bandY) return 'center'

  const zone = nearestEdge(x, y, rect.width, rect.height, bandX, bandY)
  if (zone !== 'center' || !sticky) return zone

  // 迟滞：上一帧就在某条边上，两条带宽都外扩 12px 再判一次 —— 于是「贴着 106px 进来、
  // 退到 118px 才出去」，中间 12px 是死区。判出来是哪条边就认哪条（可能横移到角上的另一条），
  // 只有真退回中心才返回 center。
  return nearestEdge(
    x,
    y,
    rect.width,
    rect.height,
    bandX ? bandX + EDGE_STICKY_PX : 0,
    bandY ? bandY + EDGE_STICKY_PX : 0,
  )
}

/**
 * 内部：取「归一化深度最小」的那条边；不在任何边缘带内返回 'center'。
 *
 * 用 `x / bandX`（而非 `x`）比大小是关键：左右带与上下带的宽度通常不等，像素口径会在
 * 角部产生一条 45° 的分界，归一化之后分界才连得上内框顶点。
 */
function nearestEdge(x, y, width, height, bandX, bandY) {
  let zone = 'center'
  let best = Infinity
  if (bandX > 0) {
    if (x < bandX && x / bandX < best) {
      best = x / bandX
      zone = 'left'
    }
    if (width - x < bandX && (width - x) / bandX < best) {
      best = (width - x) / bandX
      zone = 'right'
    }
  }
  if (bandY > 0) {
    if (y < bandY && y / bandY < best) {
      best = y / bandY
      zone = 'top'
    }
    if (height - y < bandY && (height - y) / bandY < best) {
      best = (height - y) / bandY
      zone = 'bottom'
    }
  }
  return zone
}

/**
 * 视口坐标落在哪片窗格的哪个区。指针不在任何窗格上（或压在分割条 / 状态栏外）→ null。
 *
 * 页签栏、工具栏等**非正文**元素一律不算边缘：页签栏单独成一个 zone（只决定插到第几张），
 * 其余非正文区域算中心区 —— 那些地方拖过来本来就是「放进这片窗格」。
 *
 * @param {{x: number, y: number}|null|undefined} point
 * @returns {{paneId: string, zone: string, band?: {top: number, height: number}, insertX?: number,
 *            span?: {axis: 'x'|'y', side: 'before'|'after', share: number}}|null}
 */
export function paneDropTargetAt(point) {
  if (!point) return null
  const stack = document.elementsFromPoint?.(point.x, point.y)
  if (!stack) return null

  let cell = null
  let stage = null
  let strip = null
  for (const el of stack) {
    if (!cell && el.classList?.contains('editor-grid__cell')) cell = el
    if (!stage && el.classList?.contains('editor-pane__stage')) stage = el
    if (!strip && el.classList?.contains('editor-tabs__strip')) strip = el
  }
  const paneId = cell?.dataset?.paneId
  if (!paneId) return null

  if (strip) return tabStripTarget(cell, strip, point)
  if (!stage) return { paneId, zone: 'center' }

  const rect = stage.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return { paneId, zone: 'center' }

  // 窗格数到顶就不再认边缘：上限见 editorPanes 的 MAX_PANES（宽窄屏一致）。
  const allowed = leaves().length < MAX_PANES
  // 最小尺寸保护：左右对半后每片都得站得住。宽窄屏同一套判据。
  const canSplitX = allowed && rect.width >= MIN_PANE_WIDTH * 2
  const canSplitY = allowed && rect.height >= MIN_PANE_HEIGHT * 2
  const sticky = stickyEdge?.paneId === paneId ? stickyEdge.zone : null
  const zone = hitTestFiveZones(rect, point.x, point.y, { canSplitX, canSplitY, sticky })
  // 边界上的取整误差可能让点落到矩形外：按中心区兜底，不要凭空返回 null 断掉整条链
  if (!zone) return { paneId, zone: 'center' }
  // 外沿落点改判为「跨越整块编辑区」（见文件头）：三列落底部 → 横跨三列的一整行
  const span = spanTargetOf(cell, zone, allowed)
  return span ? { paneId, zone, span } : { paneId, zone }
}

/**
 * 内部：这次边缘落点是不是**编辑区最外沿**，该不该跨越整块编辑区。
 *
 * 两条判据：
 *   1. 这片窗格的那条边正好压在网格边界上（容差 `OUTER_EDGE_EPS`）—— 夹在两片中间的
 *      边不算，那本来就是「切这一片」；
 *   2. 叶子数 ≥ `SPAN_MIN_PANES`：两片时切一片正好是一半，外沿判据不必介入（见文件头）。
 *
 * @param {Element} cell
 * @param {string} zone
 * @param {boolean} allowed 窗格数还没到上限
 * @returns {{axis: 'x'|'y', side: 'before'|'after', share: number}|null}
 */
function spanTargetOf(cell, zone, allowed) {
  const side = splitTargetOf(zone)
  if (!side || !allowed) return null
  if (leaves().length < SPAN_MIN_PANES) return null

  const gridRect = cell.closest('.editor-grid')?.getBoundingClientRect()
  const cellRect = cell.getBoundingClientRect()
  if (!gridRect || !cellRect.width || !cellRect.height) return null

  const onOuter =
    side.axis === 'y'
      ? side.side === 'after'
        ? gridRect.bottom - cellRect.bottom <= OUTER_EDGE_EPS
        : cellRect.top - gridRect.top <= OUTER_EDGE_EPS
      : side.side === 'after'
        ? gridRect.right - cellRect.right <= OUTER_EDGE_EPS
        : cellRect.left - gridRect.left <= OUTER_EDGE_EPS
  if (!onOuter) return null

  return { axis: side.axis, side: side.side, share: spanPaneShare(side.axis) }
}

/**
 * 内部：指针压在页签栏上 —— 只算「插到第几张」，并把页签栏在窗格里的位置/高度、
 * 插入线的横坐标一起换算成百分比（高亮层按百分比定位，见 paneDropHint）。
 * @param {Element} cell
 * @param {Element} strip
 * @param {{x: number, y: number}} point
 */
function tabStripTarget(cell, strip, point) {
  const paneId = cell.dataset.paneId
  const cellRect = cell.getBoundingClientRect()
  const stripRect = strip.getBoundingClientRect()
  if (!cellRect.width || !cellRect.height) return { paneId, zone: 'center' }
  return {
    paneId,
    zone: 'tabstrip',
    band: {
      top: ((stripRect.top - cellRect.top) / cellRect.height) * 100,
      height: (stripRect.height / cellRect.height) * 100,
    },
    insertX: insertPercent(strip, cellRect, point.x),
  }
}

/**
 * 内部：插入线该落在哪儿（相对窗格宽度的百分比）。按**可见**页签的中心线扫一遍：
 * 指针越过哪一张的中心，插入点就挪到它的右缘。折叠组的成员 `display: none`、不占位，
 * 用 `offsetWidth` 过滤掉正合适 —— 这也是 EditorTabs 的 insertIndexAt 的同一口径。
 */
function insertPercent(strip, cellRect, clientX) {
  const items = [...strip.querySelectorAll('.editor-tabs__item[data-strip-id]')]
    .filter((el) => el.offsetWidth > 0)
    .map((el) => el.getBoundingClientRect())
  if (!items.length) return 0
  let x = items[0].left
  for (const r of items) {
    if (clientX > r.left + r.width / 2) x = r.right
  }
  return ((Math.round(x) - cellRect.left) / cellRect.width) * 100
}

/**
 * 拖页签时的落点解析：在 `paneDropTargetAt` 之上补两条「这次拖拽特有的」规则。
 *
 * **同一片窗格的中心区 / 页签栏不算跨窗格落点** —— 交回条带自身的排序（返回 null）；
 * 同一片窗格的**边缘**照认（哪怕本窗格只有一张页签）。单页签那条落地时只切分、不搬页签，
 * 所以不会再出现「切完原窗格空掉 → 回收 → 原地闪一下」的空转。
 *
 * **全局只有一张页签时不切**（用户 2026-11-17 口径「刚开始只有单个标签页就不必分窗格」）：
 * 这时切出来的第二格必然是空的，只是多一页占位页；页签反正也搬不过去（搬走原格会空、
 * 立刻被回收，等于原地闪一下）。返回 null 会连高亮一起灭掉，手势看起来就是「这儿不能放」。
 * 判据放在这里而不是几何层：`paneDropTargetAt` 只认矩形与命中，看不到「整个编辑区有几张页签」。
 *
 * @param {{x: number, y: number}|null|undefined} point
 * @param {{ sourcePaneId?: string|null }} [options]
 * @returns {{paneId: string, zone: string, band?: object, insertX?: number,
 *            span?: {axis: 'x'|'y', side: 'before'|'after', share: number}}|null}
 */
export function resolvePaneDrop(point, { sourcePaneId = null } = {}) {
  const target = paneDropTargetAt(point)
  if (!target) return null
  if (target.paneId !== sourcePaneId) return target
  if (target.zone === 'center' || target.zone === 'tabstrip') return null
  // 只对「拖页签」成立：文件树拖进来时调用方不传 sourcePaneId，走的不是这条分支
  if (allTabs().length <= 1) return null
  return target
}

/**
 * 五区 → 切分参数。中心区、页签栏没有切分参数（返回 null）。
 * @param {string} zone
 * @returns {{axis: 'x'|'y', side: 'before'|'after'}|null}
 */
export function splitTargetOf(zone) {
  if (zone === 'left') return { axis: 'x', side: 'before' }
  if (zone === 'right') return { axis: 'x', side: 'after' }
  if (zone === 'top') return { axis: 'y', side: 'before' }
  if (zone === 'bottom') return { axis: 'y', side: 'after' }
  return null
}
