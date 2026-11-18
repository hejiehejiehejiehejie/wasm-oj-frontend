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
 *   2. 同一片窗格 + 唯一一张页签拖到自己的边缘 → **认**，落地时照常搬家（见 EditorTabs
 *      的 moveAcrossPanes）：搬走后源窗格空掉，placeTab 自带的 `closeEmptyPane` 把它收掉、
 *      兄弟顶位 —— 三列并排、中间那格唯一的页签拖到外沿底部，结果就是中间格**消失**、
 *      底下多出一条横跨三列的新窗格（2026-11-18 用户口径，取代 2026-11-17 的
 *      「只切分、不搬页签」—— 那版会留下一个空窗格、页签原地不动，正是报的 bug）。
 *      「整个编辑区总共只有这一张页签」时仍不切：切出来的第二格必然是空的，那不算分屏，
 *      只是凭空多出一页占位页。判据在 `resolvePaneDrop` 末尾（要全局页签数，几何层
 *      看不到这一层；2026-11-17 口径不变）。
 *      **再收紧一格（2026-11-18 晚，评审第 3A 条）**：同一片窗格 + 唯一一张页签 +
 *      落点在**自己的边缘**且**不是跨越** → 也不认：切开自己 → 页签搬进新格 → 原格空掉
 *      被回收 → 新格顶满原位，净效果为零、白做一次 DOM 销毁重建。跨越不受此限 ——
 *      跨越建的新格挂在根上，回收源格后树层级真的变了（三列中格落底 = 真变化）。
 *   3. **最小尺寸保护**：目标内容区对半分之后两半都得站得住，太窄/太矮就只留另一条轴
 *      （宽窄屏同一套判据）；
 *   4. 同一片窗格的中心区 / 页签栏 → 交回条带自身的排序，不亮「跨窗格」高亮。
 *
 * 【外沿落点分两段（2026-11-18 晚二次定稿：对调 + 对齐 + 解禁）】外沿 = 这片窗格的那条边
 * 正好压在网格边界上（容差 `OUTER_EDGE_EPS`）且叶子数 ≥ `SPAN_MIN_PANES`。此时同一条
 * 边缘带分成两段：
 *   · **贴边最外 `SPLIT_SEGMENT_PX` = 跨越段**：新窗格横跨全部列（落左右时纵贯全部行），
 *     落地走 `splitSpanning`，高亮按整块网格的 1/(n+1) 画。「推到底 = 全局」——从窗格
 *     中心往外拖，先局部切分、推到底变全局跨越，轨迹单调（2026-11-18 晚用户采纳评审
 *     口径，取代同日早前「最外=小窗格」的版本）；
 *   · **越过 `SPLIT_SEGMENT_PX` 往里 = 小窗格段**：切开贴边这片窗格（`splitPane`）。
 *     没有这一段，「上两格 + 下一格」这类复合布局里「下方拆左右」「第一行左侧加小格」
 *     这些树完全表达得了的形状到不了手。
 * 三条配套（评审第 1/4/6 条）：
 *   · **外沿带宽按根网格算**：`min(网格尺寸 × 25%, 120px)`，与指针所在窗格无关 ——
 *     上下两片共享同一条外沿时，分段边界才能上下对齐（各窗格自己算会出现 90 vs 120 的
 *     断层，竖着移过去会从边缘落点掉进中心区）；非外沿的边仍按各窗格自身尺寸算。
 *   · **最小尺寸只连坐局部切分**：某片窗格自身切不动（对半 < 120px）时，它的外沿带
 *     **整条让给跨越**，不消失 —— 跨越切的是根网格，空间够就不该被这片窗格拖累；
 *     根网格塞不下 1/(n+1) 的新窗格时才真禁跨越。
 *   · **分段线有独立迟滞**（`SEGMENT_STICKY_PX`）：40px 线两侧「半格矩形 ↔ 全局长条」
 *     面积差太大，±6px 死区防抖。
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
import { allTabs, leaves, leafById, MAX_PANES, spanPaneShare } from './editorPanes.js'

/** 边缘带宽占内容区尺寸的比例 */
const EDGE_RATIO = 0.25
/** 边缘带宽的像素上限（大窗格里 25% 太宽，会吃掉大半个正文） */
const EDGE_MAX_PX = 120
/** 迟滞量：已经落在某条边上时，带宽外扩这么多像素才允许退回中心区 */
const EDGE_STICKY_PX = 12

/** 外沿落点改判为「跨越整块编辑区」所需的叶子数（三列落底部、三排落左右；两片见文件头） */
const SPAN_MIN_PANES = 3
/**
 * 外沿边缘带里归「跨越段」的那段深度（px），从这条边量起：贴边最外这几十 px = 在整棵
 * 树外面接一条横贯/纵贯的大窗格；**越过它往里才是小窗格段**（切开贴边这片窗格）。
 * 2026-11-18 晚对调（用户采纳评审第 2 条）：「推到底 = 全局」，从中心往外拖先局部后
 * 全局、轨迹单调 —— 取代同日早前「最外=小窗格」的版本。
 *
 * 深度按 stage 矩形量起：外沿处 stage 边 ≈ 网格边（容差 `OUTER_EDGE_EPS`）；顶边情形
 * 页签栏单独成 tabstrip 区，能落到边缘带的点都在页签栏下方。
 */
const SPLIT_SEGMENT_PX = 40
/**
 * 分段线（`SPLIT_SEGMENT_PX`）的迟滞量：分段两侧「半格矩形 ↔ 全局长条」面积差太大，
 * 不加死区会在 39↔41px 之间高频互跳。比边缘↔中心的 12px 用得省 —— 40px 的跨越段
 * 经不起再吃掉一截。当前在跨越段要退到 46px 以外才切回小窗格段；在小窗格段要进到
 * 34px 以内才切入跨越段。
 */
const SEGMENT_STICKY_PX = 6
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

/**
 * 上一次命中的分段（`{ paneId, zone, seg }`，seg ∈ 'span'|'split'）；分段线迟滞用。
 * 同一片窗格的同一条边上，40px 分段线两侧各让 `SEGMENT_STICKY_PX` 的死区。
 */
let stickySegment = null

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
  stickySegment =
    value && EDGE_ZONES.has(value.zone)
      ? { paneId: value.paneId, zone: value.zone, seg: value.span ? 'span' : 'split' }
      : null
}

export function clearPaneDropHint() {
  stickyEdge = null
  stickySegment = null
  if (paneDropHint.value) paneDropHint.value = null
}

/**
 * 五区几何判定（**纯函数**：只回答「这个点落在矩形的哪个区」，不读 DOM、不认拖拽源）。
 * 单独拆出来是为了能脱离浏览器验算边界：角部、带宽、迟滞都是纯算式。
 *
 * 四条边**各有自己的带宽**（2026-11-18 起）：外沿边按根网格尺寸算、内沿边按窗格自身算，
 * 由调用方（`paneDropTargetAt`）算好传入 —— 本函数只管「点落在哪」。
 *
 * @param {{left: number, top: number, width: number, height: number}} rect 内容区矩形
 * @param {number} clientX
 * @param {number} clientY
 * @param {{bands?: {left?: number, right?: number, top?: number, bottom?: number},
 *          sticky?: string|null}} [options]
 *   bands = 四条边各自的带宽（px，0 = 那条边不可落）；sticky = 上一帧命中的边
 * @returns {'center'|'left'|'right'|'top'|'bottom'|null} null = 点不在这个矩形里
 */
export function hitTestFiveZones(
  rect,
  clientX,
  clientY,
  { bands = {}, sticky = null } = {},
) {
  const x = clientX - rect.left
  const y = clientY - rect.top
  if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null

  const b = {
    left: bands.left ?? 0,
    right: bands.right ?? 0,
    top: bands.top ?? 0,
    bottom: bands.bottom ?? 0,
  }
  if (!b.left && !b.right && !b.top && !b.bottom) return 'center'

  const zone = nearestEdge(x, y, rect.width, rect.height, b)
  if (zone !== 'center' || !sticky) return zone

  // 迟滞：上一帧就在某条边上，四条带宽都外扩 12px 再判一次 —— 于是「贴着 106px 进来、
  // 退到 118px 才出去」，中间 12px 是死区。判出来是哪条边就认哪条（可能横移到角上的另一条），
  // 只有真退回中心才返回 center。
  return nearestEdge(x, y, rect.width, rect.height, {
    left: b.left ? b.left + EDGE_STICKY_PX : 0,
    right: b.right ? b.right + EDGE_STICKY_PX : 0,
    top: b.top ? b.top + EDGE_STICKY_PX : 0,
    bottom: b.bottom ? b.bottom + EDGE_STICKY_PX : 0,
  })
}

/**
 * 内部：取「归一化深度最小」的那条边；不在任何边缘带内返回 'center'。
 *
 * 用 `x / band`（而非 `x`）比大小是关键：左右带与上下带的宽度通常不等，像素口径会在
 * 角部产生一条 45° 的分界，归一化之后分界才连得上内框顶点。
 */
function nearestEdge(x, y, width, height, bands) {
  let zone = 'center'
  let best = Infinity
  if (bands.left > 0 && x < bands.left && x / bands.left < best) {
    best = x / bands.left
    zone = 'left'
  }
  if (bands.right > 0 && width - x < bands.right && (width - x) / bands.right < best) {
    best = (width - x) / bands.right
    zone = 'right'
  }
  if (bands.top > 0 && y < bands.top && y / bands.top < best) {
    best = y / bands.top
    zone = 'top'
  }
  if (bands.bottom > 0 && height - y < bands.bottom && (height - y) / bands.bottom < best) {
    best = (height - y) / bands.bottom
    zone = 'bottom'
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
  const gridRect = cell.closest('.editor-grid')?.getBoundingClientRect() ?? rect

  // 窗格数到顶就不再认边缘：上限见 editorPanes 的 MAX_PANES（宽窄屏一致）。
  const allowed = leaves().length < MAX_PANES
  // 局部切分的最小尺寸保护：这片窗格自身对半后每片都得站得住。宽窄屏同一套判据。
  // 2026-11-18 起**只连坐局部切分**（评审第 4 条）：切不动时这片窗格的外沿带整条让给
  // 跨越（跨越切的是根网格，空间够就不该被这片窗格拖累）；非外沿的边才真的消失。
  const localSplitX = allowed && rect.width >= MIN_PANE_WIDTH * 2
  const localSplitY = allowed && rect.height >= MIN_PANE_HEIGHT * 2
  // 跨越的可行性：叶子数够 + 根网格在该轴上再塞一条 1/(n+1) 的新窗格还站得住。
  const spanOkX =
    allowed &&
    leaves().length >= SPAN_MIN_PANES &&
    gridRect.width * spanPaneShare('x') >= MIN_PANE_WIDTH
  const spanOkY =
    allowed &&
    leaves().length >= SPAN_MIN_PANES &&
    gridRect.height * spanPaneShare('y') >= MIN_PANE_HEIGHT

  // 四条边各自算带宽：**外沿边按根网格**（同一条外沿上的各片窗格共用一个分段边界，
  // 否则 360px 的上左 90px 带、800px 的下方 120px 带，竖着移过去会从边缘掉进中心区，
  // 评审第 1 条）；内沿边按窗格自身（切的就是这一片，带多宽随它）。
  const cellRect = cell.getBoundingClientRect()
  const outerL = cellRect.left - gridRect.left <= OUTER_EDGE_EPS
  const outerR = gridRect.right - cellRect.right <= OUTER_EDGE_EPS
  const outerT = cellRect.top - gridRect.top <= OUTER_EDGE_EPS
  const outerB = gridRect.bottom - cellRect.bottom <= OUTER_EDGE_EPS
  const localBandX = localSplitX ? Math.min(rect.width * EDGE_RATIO, EDGE_MAX_PX) : 0
  const localBandY = localSplitY ? Math.min(rect.height * EDGE_RATIO, EDGE_MAX_PX) : 0
  const gridBandX = Math.min(gridRect.width * EDGE_RATIO, EDGE_MAX_PX)
  const gridBandY = Math.min(gridRect.height * EDGE_RATIO, EDGE_MAX_PX)
  const bands = {
    left: outerL && spanOkX ? gridBandX : localBandX,
    right: outerR && spanOkX ? gridBandX : localBandX,
    top: outerT && spanOkY ? gridBandY : localBandY,
    bottom: outerB && spanOkY ? gridBandY : localBandY,
  }

  const sticky = stickyEdge?.paneId === paneId ? stickyEdge.zone : null
  const zone = hitTestFiveZones(rect, point.x, point.y, { bands, sticky })
  // 边界上的取整误差可能让点落到矩形外：按中心区兜底，不要凭空返回 null 断掉整条链
  if (!zone) return { paneId, zone: 'center' }
  // 外沿落点分两段：贴边最外 SPLIT_SEGMENT_PX = 跨越段，越过它往里 = 小窗格段
  // （切开这片，走局部切分）—— 判据见 spanTargetOf。localOk 告诉它「局部切分到底可不可
  // 用」：不可用时整条外沿带都归跨越。
  const localOk = zone === 'left' || zone === 'right' ? localSplitX : localSplitY
  const span = spanTargetOf(cell, zone, allowed, rect, point, localOk)
  return span ? { paneId, zone, span } : { paneId, zone }
}

/**
 * 内部：这次边缘落点该不该判成**跨越**（外沿 + 贴边最外的跨越段）。
 *
 * 判据：
 *   1. `allowed`：窗格数没到上限；
 *   2. 叶子数 ≥ `SPAN_MIN_PANES`：两片时切一片正好是一半，外沿判据不必介入（见文件头）；
 *   3. 这片窗格的那条边正好压在网格边界上（容差 `OUTER_EDGE_EPS`）—— 夹在两片中间的
 *      边不算，那本来就是「切这一片」；
 *   4. 分段：贴边最外 `SPLIT_SEGMENT_PX` = 跨越段，越过它往里 = 小窗格段（2026-11-18
 *      晚对调，见文件头）。**局部切分不可用（`localOk` = false，这片窗格自身切不动）时
 *      整条外沿带都归跨越** —— 最小尺寸只连坐局部，不连坐全局（评审第 4 条）；
 *   5. 分段线迟滞（`SEGMENT_STICKY_PX`）：记着上一帧这条边判成了哪段（`stickySegment`），
 *      在 40px 线两侧各让 6px 死区，防止「半格矩形 ↔ 全局长条」高频互跳（评审第 6 条）。
 *
 * @param {Element} cell
 * @param {string} zone
 * @param {boolean} allowed 窗格数还没到上限
 * @param {DOMRect} stageRect 指针所在窗格的正文矩形（分段深度从这里量起）
 * @param {{x: number, y: number}} point
 * @param {boolean} localOk 这条边对应的轴上，这片窗格自身可不可以局部切分
 * @returns {{axis: 'x'|'y', side: 'before'|'after', share: number}|null} null = 小窗格段（走局部切分）
 */
function spanTargetOf(cell, zone, allowed, stageRect, point, localOk) {
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

  // 局部切分本身切不动（这片窗格太窄/太矮）：整条外沿带都归跨越，不分小窗格段。
  if (!localOk) return { axis: side.axis, side: side.side, share: spanPaneShare(side.axis) }

  // 分段深度：从 stage 的这条边量起（外沿处 stage 边 ≈ 网格边）。
  const depth =
    side.axis === 'y'
      ? side.side === 'after'
        ? stageRect.bottom - point.y
        : point.y - stageRect.top
      : side.side === 'after'
        ? stageRect.right - point.x
        : point.x - stageRect.left

  // 分段线迟滞：上一帧在同一片同一条边上判过的段，往它那边多让 6px —— 在跨越段要退到
  // 46px 以外才切回小窗格段，在小窗格段要进到 34px 以内才切入跨越段。
  const prev =
    stickySegment?.paneId === cell.dataset.paneId && stickySegment?.zone === zone
      ? stickySegment.seg
      : null
  const threshold =
    SPLIT_SEGMENT_PX + (prev === 'span' ? SEGMENT_STICKY_PX : prev === 'split' ? -SEGMENT_STICKY_PX : 0)
  // 贴边最外 = 跨越段；depth 越过阈值往里 = 小窗格段（返回 null，走局部切分）。
  if (depth > threshold) return null

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
 * 同一片窗格的**边缘**照认，但带两条豁免（都返回 null，手势看起来就是「这儿不能放」）：
 *   · **整个编辑区只有一张页签**（用户 2026-11-17 口径「刚开始只有单个标签页就不必
 *     分窗格」）：切出来的第二格必然是空的，只是多一页占位页；页签反正也搬不过去
 *     （搬走原格会空、立刻被回收，等于原地闪一下）；
 *   · **本窗格只有这一张页签、且不是跨越**（评审第 3A 条）：切开自己 → 页签搬进新格 →
 *     原格空掉被 `closeEmptyPane` 回收 → 新格顶满原位，净效果为零、白做一次 DOM
 *     销毁重建。跨越不受此限：新格挂在根上，回收源格后树层级真的变了。
 * 判据放在这里而不是几何层：`paneDropTargetAt` 只认矩形与命中，看不到「页签有几张、
 * 源窗格是谁」。
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
  // 同窗格 + 唯一一张页签 + 自己的边缘（非跨越）：落地是「切开自己再回收自己」的空转
  if (!target.span && (leafById(sourcePaneId)?.tabs.length ?? 0) === 1) return null
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
