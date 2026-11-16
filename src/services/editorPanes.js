/**
 * editorPanes —— 编辑区**窗格布局树**与页签归属的唯一真源。
 *
 * 【数据结构】二叉分割树，不是 N×M 网格：
 *   · leaf  { kind: 'leaf',  id, tabs: string[], active: string|null, preview: string|null }
 *   · split { kind: 'split', id, axis: 'x'|'y', ratio: number, a: Node, b: Node }
 * `axis: 'x'` 是左右分（a 在左），`'y'` 是上下分（a 在上）。比例挂在 split 节点上，
 * 所以「左半整高 + 右半上下分」这类形态能表达，拖动也只影响所属的那条分割线。
 *
 * 【不变式】（改动本文件前先读完这五条）
 *   1. 一个文件（或一张合成视图页签）最多出现在一个叶子里 —— 禁止同一文件双开；
 *   2. 空叶子允许存在（⌘\ 建出来的空窗格靠它立住），但叶子总数 ≤ 4；
 *   3. `leaf.active` 要么是 null，要么必须是 `leaf.tabs` 的成员；
 *   4. 分割一个叶子时**复用原叶子的 id**（A → split(A, B)）：Vue 靠 key 复用组件实例，
 *      换了 key 就会卸载重建 Monaco。这条是渲染层不闪烁的前提；
 *   5. 页签顺序只由 `leaf.tabs` 决定。`tabStrip.stripOrder` 是它的派生投影，只读。
 *
 * 【渲染层怎么读这棵树】`components/EditorPaneGrid.vue` 用下面的 `computePaneRects()`
 * 把树换算成百分比矩形，绝对定位渲染每一片叶子（`:key` 用 leaf.id —— 见不变式 4），
 * 每个 split 节点渲染一条可拖的分割条，拖动调 `setRatio`。布局树本身仍在启动时由
 * `restorePanes()` 从 `cp.editorPanes` 恢复，之后每次改动由文件末尾的 watch 落盘。
 */
import { reactive, watch } from 'vue'
import { isNarrowLayout } from './shellSettings.js'
import { isViewId } from './editorViewIds.js'

/** 根叶子的固定 id：单窗格阶段 App / EditorPane 直接认它，P1 后仍作为初始叶子的 id */
export const PANE_ROOT_ID = 'pane-root'

/** 叶子数上限（用户口径：最多四格） */
export const MAX_PANES = 4

/**
 * 窄屏的叶子数上限（用户口径 2026-11-17：窄屏下只支持两个窗格）。
 *
 * 窄屏是**竖排投影**（见 computeNarrowPaneRects）：一屏最多叠两段，再分每段就只剩百来
 * 像素、连一行代码都摆不下。4 这个数是宽屏的口径，窄屏另算。
 *
 * 两条路都要卡住：
 *   · 新增一格 —— `splitPane` 用 `paneLimit()` 拦；
 *   · 存档里本来就是 3–4 格 —— `restorePanes` 照旧全收（否则页签会被当成超限节点丢掉），
 *     紧接着由 `adaptPanesToLayout()` 归并成两格，并把原布局存成「宽屏预设」等回宽屏还原。
 */
export const MAX_PANES_NARROW = 2

/** 此刻允许多少片叶子：宽屏 4、窄屏 2（判据只有 shellSettings 那一份） */
export function paneLimit() {
  return isNarrowLayout() ? MAX_PANES_NARROW : MAX_PANES
}

/** 分割比例的安全区间：两侧都至少留 20%，拖到头也不会把另一侧压没 */
export const MIN_RATIO = 0.2
export const MAX_RATIO = 0.8

let seq = 0
function newId(prefix) {
  seq += 1
  return `${prefix}-${Date.now().toString(36)}-${seq}`
}

/**
 * 「允许空着」的叶子集合（判据供 `reapEmptyPanes()` 用）。
 *
 * 每个叶子出生时都在这里；装进第一张页签后就**永久移出** —— 从此它变空就意味着这一格该
 * 收掉了。这条区分很重要（用户 2026-11-17 的口径是「页签空了就关掉窗格，别停在占位页」）：
 *   · 分屏（⌘\ / 拖页签到边缘）造出来的新格子天生是空的，等人往里放文件 —— 它从没装过
 *     页签，得留着，否则分屏一按就自己缩回去；
 *   · 装过页签的格子把最后一张关掉 / 拖走 / 文件被删光 —— 它存在已无意义，收掉，位置还给
 *     邻居（用户要的就是这个，而不是留一张写着「在资源管理器中打开或新建文件」的占位页）。
 */
const allowsEmpty = new Set()

function makeLeaf(id) {
  const leaf = { kind: 'leaf', id: id ?? newId('pane'), tabs: [], active: null, preview: null }
  allowsEmpty.add(leaf.id)
  return leaf
}

/** 布局树与焦点。整棵树的写入口都在本文件，组件与其它 service 只读。 */
export const editorPanes = reactive({
  /** @type {import('./editorPanes.js').PaneNode|null} */
  root: makeLeaf(PANE_ROOT_ID),
  /** 唯一真源：焦点停在哪个叶子。`workspace.activeId` 是它的镜像 */
  focusedPaneId: PANE_ROOT_ID,
})

// ------------------------------------------------------------ 只读查询

/** @param {any} node */
export function isLeaf(node) {
  return node?.kind === 'leaf'
}

/**
 * 按 DFS 次序展开全部叶子（a 在前、b 在后）。
 * 直接读响应式树，所以在 computed 里调用会正确收集依赖。
 * @returns {any[]}
 */
export function leaves(node = editorPanes.root, out = []) {
  if (!node) return out
  if (isLeaf(node)) {
    out.push(node)
    return out
  }
  leaves(node.a, out)
  leaves(node.b, out)
  return out
}

/** @param {string} paneId */
export function leafById(paneId) {
  if (!paneId) return null
  for (const leaf of leaves()) {
    if (leaf.id === paneId) return leaf
  }
  return null
}

/**
 * 页签所在叶子；不在任何叶子里返回 null。
 * @param {string} tabId
 */
export function paneOf(tabId) {
  if (!tabId) return null
  for (const leaf of leaves()) {
    if (leaf.tabs.includes(tabId)) return leaf
  }
  return null
}

/** 焦点叶子。focusedPaneId 失效（刚被合并掉）时回落到第一片叶子 */
export function focusedLeaf() {
  return leafById(editorPanes.focusedPaneId) ?? leaves()[0] ?? null
}

/** 全部页签（含合成视图），按树内顺序拼起来 —— tabStrip.stripOrder 的派生源 */
export function allTabs() {
  return leaves().flatMap((leaf) => leaf.tabs)
}

/** 真实文件页签（去掉合成视图）—— workspace.openTabIds 的派生源 */
export function fileTabs() {
  return allTabs().filter((id) => !isViewId(id))
}

/** @param {string} tabId */
export function hasTab(tabId) {
  return paneOf(tabId) !== null
}

// ------------------------------------------------------------ 焦点

/** @param {string} paneId */
export function focusPane(paneId) {
  if (leafById(paneId)) editorPanes.focusedPaneId = paneId
}

// ------------------------------------------------------------ 页签增删改

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

/**
 * 「一张页签离开这个叶子之后，焦点该落到谁身上」的注入点。
 *
 * 本模块只管树，**不判**「该看哪一张」：判据要同时看折叠组藏了谁（tabGroups）与
 * 邻居是不是设置 / Codeforces 这类合成视图（editorViews 的两轴状态），本文件都看不见
 * （反过来 import 会成环）。所以做成注入：workspaceStore 在模块加载时把自己那个薄薄一层
 * 转发挂上来，真正的结算在 `tabGroups.settleLeafFocus()` —— **与关页签同一个函数**。
 *
 * 于是「关掉这张页签」与「把它拖到别的窗格」结论完全一致 —— 后者本质上是「从源窗格摘掉
 * 一张页签」，源窗格没理由停在没有任何东西露出来的空态上（邻居是视图时视图要被点亮）。
 *
 * @type {{ settle: ((leaf: any, removedId: string, index: number) => void)|null}}
 */
export const paneFocus = { settle: null }

/**
 * 把页签放进某个叶子。已在别的叶子时先摘走（源叶子空了就合并掉）。
 *
 * 跨叶子搬家时源窗格的焦点按**关页签**的规则回退：被搬走的若是源窗格的 active，源窗格
 * 自动落到 `handoffFocus` 选出的邻居上，而不是留一个空洞（编辑器一片空白、条带里明明还有
 * 页签）。目标窗格照旧由下面 `setActiveIn` 选中搬进来的那张。
 *
 * @param {string} tabId
 * @param {{ paneId?: string, index?: number, makeActive?: boolean }} [options]
 * @returns {any|null} 落点叶子
 */
export function placeTab(tabId, { paneId, index, makeActive = true } = {}) {
  if (!tabId) return null
  const target = leafById(paneId) ?? focusedLeaf()
  if (!target) return null
  const existing = paneOf(tabId)

  if (existing === target) {
    const from = target.tabs.indexOf(tabId)
    if (typeof index === 'number') moveIndex(target, from, index)
    if (makeActive) setActiveIn(target, tabId)
    return target
  }

  if (existing) {
    // wasActive 必须在 removeTab 之前取：它会把 leaf.active 清成 null，之后就分不清
    // 「原来就没选中任何页签」和「选中那张正好被搬走了」。
    const wasActive = existing.active === tabId
    const removed = removeTab(tabId)
    if (removed && wasActive) handoffFocus(removed.leaf, tabId, removed.index)
    if (removed?.leaf && removed.leaf.tabs.length === 0 && leaves().length > 1) {
      closeEmptyPane(removed.leaf.id)
    }
  }

  const at = typeof index === 'number' ? clamp(index, 0, target.tabs.length) : target.tabs.length
  target.tabs.splice(at, 0, tabId)
  if (makeActive) setActiveIn(target, tabId)
  return target
}

/**
 * 内部：页签离开这个叶子后，把焦点交给「关页签会落到的那张」。
 * 与 workspaceStore.closeTab 共用同一份判定（注入见 `paneFocus`，默认见 `neighborFileTab`）。
 * 合成视图不能当 active（activeId 装不下它），所以默认口径只挑文件页签；注入版带分组
 * 可见性判据，本窗格一张可见页签都没有时会给出 null —— 焦点宁可空着，也不能指向折叠组
 * 里藏着的页签（「焦点必可见」铁律）。
 * @param {any} leaf 摘除**之后**的叶子
 * @param {string} removedId 被摘走的那张
 * @param {number} index 它在摘除前的位置
 */
function handoffFocus(leaf, removedId, index) {
  if (leaf.active) return
  if (paneFocus.settle) paneFocus.settle(leaf, removedId, index)
  else leaf.active = neighborFileTab(leaf.tabs, index)
}

/**
 * 预览页签的**原位换人**：同一个叶子里把 oldId 换成 newId，长度与位置都不动。
 * 归 ownerFile 不存在时退化成普通 placeTab。
 * @param {string} oldId
 * @param {string} newId
 */
export function replaceTab(oldId, newId) {
  const leaf = paneOf(oldId)
  if (!leaf) return placeTab(newId)
  const at = leaf.tabs.indexOf(oldId)
  leaf.tabs.splice(at, 1, newId)
  if (leaf.active === oldId) leaf.active = newId
  if (leaf.preview === oldId) leaf.preview = newId
  return leaf
}

/**
 * 摘掉一张页签（不动焦点结算，调用方自己决定 active 给谁）。
 * @param {string} tabId
 * @returns {{ leaf: any, index: number }|null}
 */
export function removeTab(tabId) {
  const leaf = paneOf(tabId)
  if (!leaf) return null
  const index = leaf.tabs.indexOf(tabId)
  leaf.tabs.splice(index, 1)
  if (leaf.active === tabId) leaf.active = null
  if (leaf.preview === tabId) leaf.preview = null
  return { leaf, index }
}

/**
 * 叶子内换位。`insertIndex` 与 workspaceStore.moveTab 同一契约：
 * **去掉被拖项之后**的插入下标（0..rest.length）。
 * @param {string} paneId
 * @param {string} tabId
 * @param {number} insertIndex
 */
export function moveTabInPane(paneId, tabId, insertIndex) {
  const leaf = leafById(paneId)
  if (!leaf) return
  const from = leaf.tabs.indexOf(tabId)
  if (from === -1) return
  moveIndex(leaf, from, insertIndex)
}

/**
 * 叶子内整段搬移（拖页签组）。段必须连续，且同属这个叶子。
 * @param {string} paneId
 * @param {string[]} ids
 * @param {number} insertIndex
 */
export function moveRunInPane(paneId, ids, insertIndex) {
  const leaf = leafById(paneId)
  if (!leaf || !Array.isArray(ids) || ids.length === 0) return
  const at = ids.map((id) => leaf.tabs.indexOf(id))
  if (at.some((i) => i === -1)) return
  for (let k = 1; k < at.length; k += 1) {
    if (at[k] !== at[k - 1] + 1) return
  }
  const rest = leaf.tabs.filter((id) => !ids.includes(id))
  const target = clamp(insertIndex, 0, rest.length)
  leaf.tabs.splice(0, leaf.tabs.length, ...rest.slice(0, target), ...ids, ...rest.slice(target))
}

/** 内部：把一个下标挪到「去掉它之后」的插入下标上 */
function moveIndex(leaf, from, insertIndex) {
  if (from === -1) return
  const [item] = leaf.tabs.splice(from, 1)
  const target = clamp(insertIndex, 0, leaf.tabs.length)
  leaf.tabs.splice(target, 0, item)
}

function setActiveIn(leaf, tabId) {
  leaf.active = tabId
  editorPanes.focusedPaneId = leaf.id
}

/**
 * 按存活判据清理所有叶子里的页签（删文件 / 换工作区后重建树时用）。
 * 合成视图不是 VFS 节点，永远算存活。
 *
 * @param {(id: string) => boolean} isAlive
 * @returns {string[]} 被摘掉的文件 id（调用方据此 release model）
 */
export function pruneTabs(isAlive) {
  const removed = []
  for (const leaf of leaves()) {
    const keep = []
    for (const id of leaf.tabs) {
      if (isViewId(id) || isAlive(id)) keep.push(id)
      else removed.push(id)
    }
    if (keep.length === leaf.tabs.length) continue
    leaf.tabs.splice(0, leaf.tabs.length, ...keep)
    if (leaf.preview && !keep.includes(leaf.preview)) leaf.preview = null
    if (leaf.active && !keep.includes(leaf.active)) {
      // 与改造前保持一致：活跃文件被删后落到**最后一张**存活的文件页签
      leaf.active = lastFileTab(keep)
    }
  }
  return removed
}

/**
 * 会话恢复：把上次的文件页签灌进根叶子。只应在启动阶段调用一次。
 * @param {string[]} tabIds
 */
export function hydrate(tabIds) {
  const tabs = Array.isArray(tabIds) ? [...tabIds] : []
  editorPanes.root = makeLeaf(PANE_ROOT_ID)
  editorPanes.root.tabs.push(...tabs)
  editorPanes.focusedPaneId = PANE_ROOT_ID
}

// ------------------------------------------------------------ 布局树

/**
 * 把某个叶子一分为二，新叶子在 `side` 一侧。**原叶子保留自己的 id 与全部页签**（不变式 4）。
 *
 * 【同轴链一律等分】分出来的新窗格如果落进一条已经存在的同轴链（横排/竖排里的下一格），
 * 整条链重排成等分 —— 三列各 1/3、四列各 1/4，而不是「老的那几格保持原样、新的那块只有
 * 半格宽」（分成两列后再分一次，按 0.5 直接切会得到 50 / 25 / 25）。
 * 只管**连续同轴**的祖先：中间夹着一根别的轴，说明这是一列里的一行，那时新窗格只该吃掉
 * 所在格的一半，不该去动整列的宽度（`equalizeAxisChain`）。
 *
 * 落到**编辑区最外沿**的拖放不走这里，走 `splitSpanning`（新窗格横跨全部窗格）。
 *
 * @param {string} paneId
 * @param {'x'|'y'} axis
 * @param {'before'|'after'} [side]
 * @returns {string|null} 新叶子的 id；已到上限或找不到目标时 null
 */
export function splitPane(paneId, axis = 'x', side = 'after') {
  if (leaves().length >= paneLimit()) return null
  const slot = findSlot(editorPanes.root, paneId)
  if (!slot || !isLeaf(slot.node)) return null

  const fresh = makeLeaf()
  const split = {
    kind: 'split',
    id: newId('split'),
    axis: axis === 'y' ? 'y' : 'x',
    ratio: 0.5,
    a: side === 'before' ? fresh : slot.node,
    b: side === 'before' ? slot.node : fresh,
    // 窄屏切出来的那一刀记个记号（见 adaptPanesToLayout）：窄屏只允许上下分，回到宽屏时
    // 这一刀要翻成左右（上 → 左、下 → 右），而宽屏本来就这么叠着的 y-split 不能被一起翻掉。
    ...(isNarrowLayout() ? { narrowBorn: true } : {}),
  }
  if (slot.parent) slot.parent[slot.key] = split
  else editorPanes.root = split

  equalizeAxisChain(split)

  editorPanes.focusedPaneId = fresh.id
  return fresh.id
}

/**
 * 跨越式分屏：把新窗格挂在**整棵树的外面**，于是它横跨（或纵贯）现有的每一片窗格。
 *
 * 【为什么需要它】`splitPane` 只能切**一片叶子**：并排三列时把页签拖到底部，切出来的是
 * 「第三列再分上下」—— 那半格只有一列宽（约 1/3），装不下代码。用户 2026-11-17 的口径是
 * 「拖到编辑区最外沿 = 在外面接一条，横跨三列」（并列三排同理，落左右时纵贯三排）。
 * 这与 IDE 停靠面板的行为一致：外沿属于整块编辑区，不属于某一片窗格。
 *
 * 【只包根节点】外沿分割在几何上就是「旧整棵树 | 新叶子」，所以直接把根换成一个 split，
 * 旧根整体做 a 或 b。**不动旧树内部的任何 ratio** —— 三列各 1/3 的关系原样保留。
 *
 * 【新窗格占多少】`spanPaneShare()`：轴向上还没有切过（根是另一条轴）就给一半；
 * 根已经沿这条轴切成 n 段时给 1/(n+1) —— 与「四列四等分」同一个口径，不会出现
 * 「三排上面挤成一半、下面凭空多出一条高的」。
 *
 * @param {'x'|'y'} axis
 * @param {'before'|'after'} [side] 新窗格在旧整棵树的哪一侧
 * @returns {string|null} 新叶子 id；已到上限时 null
 */
export function splitSpanning(axis, side = 'after') {
  if (leaves().length >= paneLimit()) return null
  const dir = axis === 'y' ? 'y' : 'x'
  const share = spanPaneShare(dir)
  const old = editorPanes.root
  const fresh = makeLeaf()
  const split = {
    kind: 'split',
    id: newId('split'),
    axis: dir,
    // share 是**新窗格**那一份；ratio 记的是 a 那一份（见 computePaneRects）
    ratio: side === 'before' ? share : 1 - share,
    a: side === 'before' ? fresh : old,
    b: side === 'before' ? old : fresh,
    // 窄屏最多两格、根本进不到这里；记号只是让 serializeNode 的形状自洽（见 adaptPanesToLayout）
    ...(isNarrowLayout() ? { narrowBorn: true } : {}),
  }
  editorPanes.root = split
  editorPanes.focusedPaneId = fresh.id
  return fresh.id
}

/**
 * 跨越式分屏里新窗格该占的比例（0–1）。拖拽高亮按它画、落地按它切 —— 两处必须同一个数，
 * 否则「高亮画了半屏、落下来只有四分之一」。
 *
 * 轴向上根已经是 n 段（`axisSegments`）就给 1/(n+1)：三排上再落一条 → 四条各 1/4；
 * 根是另一条轴（并排三列落底部）时 `axisSegments` 得 1 → 一半。`MIN_RATIO` 0.2 的下界
 * 在 n ≤ 4（叶子数上限）时都不会被碰到（4 段 → 0.2，正好压线）。
 *
 * @param {'x'|'y'} axis
 * @returns {number}
 */
export function spanPaneShare(axis) {
  return 1 / (axisSegments(editorPanes.root, axis === 'y' ? 'y' : 'x') + 1)
}

/**
 * 内部：`node` 在 `axis` 这方向上被切成几段（几列 / 几行）。
 * 叶子算 1；同轴 split 相加；**不同轴的子树整块算 1** —— 它们上下叠着，共享同一段宽度。
 * @param {any} node
 * @param {'x'|'y'} axis
 * @returns {number}
 */
function axisSegments(node, axis) {
  if (!node) return 0
  if (isLeaf(node)) return 1
  if (node.axis === axis) return axisSegments(node.a, axis) + axisSegments(node.b, axis)
  return 1
}

/**
 * 内部：从根到 `id` 的祖先链（自根往下，不含自己）。找不到返回 null。
 * @param {any} node
 * @param {string} id
 * @returns {any[]|null}
 */
function ancestorChain(node, id) {
  if (!node) return null
  if (node.id === id) return []
  if (isLeaf(node)) return null
  const sub = ancestorChain(node.a, id) ?? ancestorChain(node.b, id)
  return sub ? [node, ...sub] : null
}

/**
 * 内部：把新分出来的 `split` 以及它**连续同轴**的祖先重排成等分。
 * 每层的 ratio = 左支的段数 / 本级段数，段数由 `axisSegments` 现算 —— 所以「三列各 1/3」
 * 与「四列各 1/4」是同一套算法，不用按窗格数写分支。夹着别的轴就停：那说明这是一列里的
 * 一行，动上层会把整列宽度改掉。
 * @param {any} split 刚插进树里的那个分割节点
 */
function equalizeAxisChain(split) {
  const axis = split.axis
  const chain = ancestorChain(editorPanes.root, split.id)
  if (!chain) return
  const members = [split]
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    if (chain[i].axis !== axis) break
    members.push(chain[i])
  }
  for (const node of members) {
    const total = axisSegments(node, axis)
    if (total < 2) continue
    node.ratio = clamp(axisSegments(node.a, axis) / total, MIN_RATIO, MAX_RATIO)
  }
}

/**
 * 关掉一个**空**叶子，把兄弟子树顶替父节点。根叶子不可关（单窗格要能空着）。
 * 有页签的叶子拒绝关闭 —— 先搬走或关掉页签，避免静默丢内容。
 *
 * 【腾出来的那一段按原比例摊给同轴的其余窗格】收掉一格时兄弟子树会顶到父节点的位置 ——
 * 如果只做这一步，父节点那条 ratio 还是老值，结果就是「一个窗格像素不动、另一个被整段
 * 拉大」（横排 30/35/35 收掉最右一格会变成 30/70，而按原比例应当是 46.2/53.8）。
 *
 * 做法：摘除前先量出被摘叶子在**它父节点那条轴**上占多长（路径上同轴 ratio 连乘），
 * 摘完再沿祖先链把同轴的 ratio 重算一遍 —— 相当于把轴上腾出来的那一段夹掉，再把剩下的
 * 按比例放大回去（`shrinkAxis`）。不同轴的祖先一律不动：那根轴上的区间并没有空出来
 * （被兄弟占着），跟着改只会让本不该变的窗格缩水 —— 2×2 收掉右下角时，左列的宽度、
 * 左列两格的高都要原地不动，右下角那格顶满右列才是要的结果。
 *
 * @param {string} paneId
 * @returns {boolean} 是否真的关掉了
 */
export function closeEmptyPane(paneId) {
  const slot = findSlot(editorPanes.root, paneId)
  if (!slot || !isLeaf(slot.node)) return false
  if (!slot.parent) return false
  if (slot.node.tabs.length > 0) return false

  const parentSlot = findSlot(editorPanes.root, slot.parent.id)
  if (!parentSlot) return false
  const sibling = slot.parent.a === slot.node ? slot.parent.b : slot.parent.a
  const axis = slot.parent.axis === 'y' ? 'y' : 'x'
  const before = traceAxis(editorPanes.root, paneId, axis)

  if (parentSlot.parent) parentSlot.parent[parentSlot.key] = sibling
  else editorPanes.root = sibling

  if (before) shrinkAxis(before)

  if (editorPanes.focusedPaneId === paneId) {
    // 焦点交给**顶位的那棵子树**的第一片叶子，而不是 leaves()[0]：收掉的格子腾出来的空间
    // 正好给了它，视线也该落在那里（横排三列收掉最右一格，leaves()[0] 是最左那格）。
    editorPanes.focusedPaneId = leaves(sibling)[0]?.id ?? leaves()[0]?.id ?? null
  }
  return true
}

/**
 * 回收「空着且不该空着」的叶子 —— 页签空了就顺手把这一格关掉，不留占位页。
 *
 * 【判据只有页签】`active` / `preview` 都是从 `tabs` 派生的（不变式 3），页签空了两者必然
 * 也空，不必再看。真正要问的是「它本来就该是空的吗」—— 见 `allowsEmpty`：分屏造出来、
 * 还没装过页签的格子留着，装过页签又变空的收掉。
 *
 * 【一次收完再算】先收集再逐格 `closeEmptyPane`：那个函数会改父节点引用，边遍历边摘会
 * 漏节点（三列同时空掉时尤其明显）。收到只剩一片叶子为止 —— 根叶子没有父节点，
 * `closeEmptyPane` 自己会拒绝，所以「全空」时最后那格会留下（单窗格该显示占位页）。
 *
 * @returns {boolean} 是否收掉了至少一格
 */
export function reapEmptyPanes() {
  const doomed = leaves()
    .filter((leaf) => leaf.tabs.length === 0 && !allowsEmpty.has(leaf.id))
    .map((leaf) => leaf.id)
  let reaped = false
  for (const id of doomed) {
    if (closeEmptyPane(id)) reaped = true
  }
  return reaped
}

/** 内部：子树里有没有这张叶子（`traceAxis` 判左右用，摘除**之前**问才算数） */
function subtreeHas(node, id) {
  if (!node) return false
  if (node.id === id) return true
  return !isLeaf(node) && (subtreeHas(node.a, id) || subtreeHas(node.b, id))
}

/**
 * 内部：从根走到 `targetId`，沿途记下那条轴上的区间长度。
 * 同轴的 split 把区间按 ratio 切成两段，不同轴的不改变这条轴上的长度（只是这一层不切）。
 * 返回 `freed`（被摘叶子在这条轴上占的长度）与自底向上的 `stops`。
 *
 * @param {any} node
 * @param {string} targetId
 * @param {'x'|'y'} axis
 * @param {number} [extent]
 * @returns {{ freed: number, axis: 'x'|'y',
 *            stops: Array<{node:any, inA:boolean, extent:number, extentA:number}> }|null}
 */
function traceAxis(node, targetId, axis, extent = 1) {
  if (!node) return null
  if (isLeaf(node)) return node.id === targetId ? { freed: extent, axis, stops: [] } : null
  const ratio = clamp(Number(node.ratio) || 0.5, MIN_RATIO, MAX_RATIO)
  const along = node.axis === axis
  const extentA = along ? extent * ratio : extent
  const extentB = along ? extent * (1 - ratio) : extent
  const inA = subtreeHas(node.a, targetId)
  const sub = inA
    ? traceAxis(node.a, targetId, axis, extentA)
    : traceAxis(node.b, targetId, axis, extentB)
  if (!sub) return null
  sub.stops.push({ node, inA, extent, extentA })
  return sub
}

/**
 * 内部：把轴上腾出来的 `freed` 从每个**同轴**祖先的区间里夹掉 —— 剩下的自然按原比例
 * 放大回去（这一趟只改 ratio，几何由下一次 `computePaneRects` 反映）。
 * 已经被摘掉的那个 split 也在 stops 里，改它的 ratio 无副作用。
 * @param {{ freed: number, axis: 'x'|'y', stops: Array<{node:any, inA:boolean, extent:number, extentA:number}> }} before
 */
function shrinkAxis(before) {
  const { freed, stops } = before
  if (!(freed > 0) || freed >= 1) return
  for (const stop of stops) {
    const axis = stop.node.axis === 'y' ? 'y' : 'x'
    // 不同轴的祖先：那根轴上没有空出区间，动它会把没参与收格的窗格一起缩掉
    if (axis !== before.axis) continue
    const rest = stop.extent - freed
    if (!(rest > 0)) continue
    const a = stop.inA ? stop.extentA - freed : stop.extentA
    stop.node.ratio = clamp(a / rest, MIN_RATIO, MAX_RATIO)
  }
}

/**
 * 设置分割比例（夹在 [MIN_RATIO, MAX_RATIO]）。
 * @param {string} splitId
 * @param {number} ratio
 */
export function setRatio(splitId, ratio) {
  const slot = findSlot(editorPanes.root, splitId)
  if (!slot || isLeaf(slot.node)) return
  if (!Number.isFinite(ratio)) return
  slot.node.ratio = clamp(ratio, MIN_RATIO, MAX_RATIO)
}

/** 内部：找到节点本身与它挂在父节点的哪一格上（渲染层算矩形也用它） */
export function findSlot(node, id, parent = null, key = null) {
  if (!node) return null
  if (node.id === id) return { node, parent, key }
  if (isLeaf(node)) return null
  return findSlot(node.a, id, node, 'a') ?? findSlot(node.b, id, node, 'b')
}

/**
 * 关闭页签后的默认邻居：从**摘除后的原下标**起先右后左找最近的一张文件页签。
 * 合成视图不能当 active（activeId 装不下它）。
 */
export function neighborFileTab(tabs, from) {
  const start = from === -1 ? 0 : from
  for (let i = start; i < tabs.length; i += 1) {
    if (!isViewId(tabs[i])) return tabs[i]
  }
  for (let i = Math.min(start, tabs.length) - 1; i >= 0; i -= 1) {
    if (!isViewId(tabs[i])) return tabs[i]
  }
  return null
}

/** 最后一张文件页签（delete / prune 的兜底口径，与改造前一致） */
function lastFileTab(tabs) {
  for (let i = tabs.length - 1; i >= 0; i -= 1) {
    if (!isViewId(tabs[i])) return tabs[i]
  }
  return null
}

// ------------------------------------------------------------ 渲染几何

/**
 * 把布局树换算成一组**百分比矩形**（0–100，相对编辑区容器）。纯函数、不碰 DOM，
 * 渲染层只负责把数字塞进 style —— 这样几何可以在测试 / 验算里独立跑。
 *
 * 结构：
 *   · `leaves`:   `{ id, x, y, w, h }`，绝对定位的每一片叶子；
 *   · `splitters`: `{ id, axis, at, x, y, w, h, region }`
 *       - `at` 是分割线在对应轴上的百分比位置（axis:'x' 时是 left，'y' 时是 top）；
 *       - `x/y/w/h` 是**这条分割条**的画布（整条跨满所属 split 的另一轴）；
 *       - `region` 是所属 split 节点所占的矩形 —— 拖拽时按它把指针位置换算成 ratio，
 *         它在一次拖动期间不变（父级比例没动），所以可以放心在 pointerdown 时缓存。
 *
 * @param {any} [root]
 * @returns {{ leaves: Array<{id:string,x:number,y:number,w:number,h:number}>,
 *            splitters: Array<{id:string,axis:'x'|'y',at:number,x:number,y:number,w:number,h:number,
 *                              region:{x:number,y:number,w:number,h:number}}> }}
 */
export function computePaneRects(root = editorPanes.root) {
  const leavesOut = []
  const splitters = []
  const walk = (node, x, y, w, h) => {
    if (!node) return
    if (isLeaf(node)) {
      leavesOut.push({ id: node.id, x, y, w, h })
      return
    }
    const ratio = clamp(Number(node.ratio) || 0.5, MIN_RATIO, MAX_RATIO)
    if (node.axis === 'y') {
      const hA = h * ratio
      walk(node.a, x, y, w, hA)
      walk(node.b, x, y + hA, w, h - hA)
      splitters.push({
        id: node.id,
        axis: 'y',
        at: y + hA,
        x,
        y,
        w,
        h,
        region: { x, y, w, h },
      })
    } else {
      const wA = w * ratio
      walk(node.a, x, y, wA, h)
      walk(node.b, x + wA, y, w - wA, h)
      splitters.push({
        id: node.id,
        axis: 'x',
        at: x + wA,
        x,
        y,
        w,
        h,
        region: { x, y, w, h },
      })
    }
  }
  walk(root, 0, 0, 100, 100)
  return { leaves: leavesOut, splitters }
}

/**
 * 窄屏用的**竖排投影**：把整棵布局树压成一列，每片叶子占满宽度、按树内顺序上下排开。
 *
 * 【为什么窄屏也要渲染全部叶子】窄屏（手机 / 视口 ≤ 600px）以前只画焦点叶子 —— 那时
 * 分屏在窄屏上是关掉的（拖放直接退化为中心区、⌘⌥\ 弹一句「窄屏不支持分屏」），画不画
 * 其它的都无所谓。现在窄屏允许**上下分屏**（并排两片在 390px 宽上各剩不到 200px，实在
 * 没法读代码），如果仍只画焦点叶子，切出来的新窗格当场看不见，等于白切。所以这里改成
 * 竖排渲染：分屏看得见、分割条拖得动、拖页签时的高亮也落在真实的那一段上。
 *
 * 【两条投影规则】
 *   · `axis: 'y'`（上下分）→ 按 ratio 切这一段高度，并**保留可拖的分割条**（ratio 就是
 *     它原本的语义，拖拽回写 `setRatio` 即可，不用换算）；
 *   · `axis: 'x'`（左右分）→ 两半边**各占这段高度的一半**，顺序照旧（a 在上、b 在下）。
 *     x 轴的 ratio 说的是宽度，竖排里没有对应物，平均分配是最中性的答案；这一刀也没有
 *     分割条 —— 树里没有「这两片谁高谁矮」的比例可改，硬给一条能拖的线只会拖出幻觉。
 *
 * 【不改树】投影是纯派生：树里仍可能是左右分的，只是窄屏这么显示。回到宽屏后几何恢复
 * 原样（x 的 ratio 一个都没被动过）—— 这也是它不写进树、只在渲染层调用的原因。
 *
 * @param {any} [root]
 * @returns {{ leaves: Array<{id:string,x:number,y:number,w:number,h:number}>,
 *            splitters: Array<{id:string,axis:'y',at:number,x:number,y:number,w:number,h:number,
 *                              region:{x:number,y:number,w:number,h:number}}> }}
 */
export function computeNarrowPaneRects(root = editorPanes.root) {
  const leavesOut = []
  const splitters = []
  let cursor = 0
  const walk = (node, h) => {
    if (!node || h <= 0) return
    if (isLeaf(node)) {
      leavesOut.push({ id: node.id, x: 0, y: cursor, w: 100, h })
      cursor += h
      return
    }
    const ratio = clamp(Number(node.ratio) || 0.5, MIN_RATIO, MAX_RATIO)
    if (node.axis === 'y') {
      const top = cursor
      const hA = h * ratio
      walk(node.a, hA)
      splitters.push({
        id: node.id,
        axis: 'y',
        at: cursor,
        x: 0,
        y: top,
        w: 100,
        h,
        region: { x: 0, y: top, w: 100, h },
      })
      walk(node.b, h - hA)
      return
    }
    const half = h / 2
    walk(node.a, half)
    walk(node.b, half)
  }
  walk(root, 100)
  return { leaves: leavesOut, splitters }
}

// ------------------------------------------------------------ 跨刷新记着

/** 布局树的存档键。与 `cp.editorViews` 同一档（本机界面状态，不进云同步）。 */
export const PANES_STORAGE_KEY = 'cp.editorPanes'

function serializeNode(node) {
  if (!node) return null
  if (isLeaf(node)) {
    return {
      kind: 'leaf',
      id: node.id,
      tabs: [...node.tabs],
      active: node.active,
      preview: node.preview,
    }
  }
  return {
    kind: 'split',
    id: node.id,
    axis: node.axis,
    ratio: node.ratio,
    a: serializeNode(node.a),
    b: serializeNode(node.b),
    // 只在窄屏切出来的那一刀上留记号，宽屏的存档形态与以前完全一致
    ...(node.narrowBorn ? { narrowBorn: true } : {}),
  }
}

/** 当前布局树的存档形态（`{ root, focusedPaneId }`）。只读快照，可直接 JSON 化。 */
export function serializePanes() {
  return { root: serializeNode(editorPanes.root), focusedPaneId: editorPanes.focusedPaneId }
}

/**
 * 内部：把存档形态的树重建成可用的布局树，**不碰** `editorPanes`（恢复与「还原宽屏预设」
 * 共用同一套校验：认不出来的节点、超限叶子、失效页签一律丢弃，同一张页签只留在第一次
 * 出现的那片叶子里 —— 不变式 1）。
 *
 * @param {any} savedRoot `serializeNode()` 的产物
 * @param {(id: string) => boolean} isAlive 文件页签的存活判据（合成视图永远存活）
 * @returns {any|null} 新树根；整棵树都认不出来时 null
 */
function buildTree(savedRoot, isAlive) {
  const seen = new Set()
  let leafCount = 0

  const norm = (node) => {
    if (!node || typeof node !== 'object') return null
    if (node.kind === 'leaf' || Array.isArray(node.tabs)) {
      if (leafCount >= MAX_PANES) return null
      leafCount += 1
      const tabs = []
      for (const id of Array.isArray(node.tabs) ? node.tabs : []) {
        if (typeof id !== 'string' || seen.has(id)) continue
        if (!isViewId(id) && !isAlive(id)) continue
        seen.add(id)
        tabs.push(id)
      }
      const active =
        typeof node.active === 'string' && tabs.includes(node.active)
          ? node.active
          : lastFileTab(tabs)
      const preview =
        typeof node.preview === 'string' && tabs.includes(node.preview) ? node.preview : null
      return {
        kind: 'leaf',
        id: typeof node.id === 'string' && node.id ? node.id : newId('pane'),
        tabs,
        active,
        preview,
      }
    }
    if (node.kind === 'split' || (node.a && node.b)) {
      const a = norm(node.a)
      const b = norm(node.b)
      if (!a) return b
      if (!b) return a
      return {
        kind: 'split',
        id: typeof node.id === 'string' && node.id ? node.id : newId('split'),
        axis: node.axis === 'y' ? 'y' : 'x',
        ratio: clamp(Number(node.ratio) || 0.5, MIN_RATIO, MAX_RATIO),
        a,
        b,
        ...(node.narrowBorn ? { narrowBorn: true } : {}),
      }
    }
    return null
  }

  return norm(savedRoot)
}

/**
 * 用存档恢复布局树。
 *
 * @param {any} saved `serializePanes()` 的产物，坏值当作没存过
 * @param {(id: string) => boolean} [isAlive] 文件页签的存活判据（合成视图永远存活）
 * @returns {string[]} 因为不在存档树里而被丢弃的**文件** id（调用方据此 release model）
 */
export function restorePanes(saved, isAlive = () => true) {
  const before = fileTabs()
  const root = buildTree(saved?.root, isAlive)
  if (!root) return []
  editorPanes.root = root
  const focused = saved?.focusedPaneId
  editorPanes.focusedPaneId = leafById(focused) ? focused : leaves()[0]?.id ?? null
  return before.filter((id) => !hasTab(id))
}

/**
 * 存档闸门：`restorePanes()` 跑之前绝不写盘 —— 与 editorViews 的 persistReady 同一个理由，
 * 启动那一刻的默认单叶树不能把用户的布局覆盖掉。
 */
let persistReady = false

/** 立刻把当前布局写盘（闸门没开时什么都不做）。 */
function persistPanes() {
  if (!persistReady) return
  try {
    window.localStorage.setItem(PANES_STORAGE_KEY, JSON.stringify(serializePanes()))
  } catch {
    /* 隐私模式 / 配额满：只在本次会话里生效 */
  }
}

// ------------------------------------------------------------ 宽窄屏流转

/**
 * 宽屏预设的落盘键。与 `cp.editorPanes` 分开存：
 *
 * 窄屏最多两格（`MAX_PANES_NARROW`），宽屏的 3–4 格进窄屏时必须归并成两格，否则每段只剩
 * 百来像素。归并会把多余的叶子从树上摘掉，原布局就只活在这一份「预设」里 —— 存到
 * localStorage 是为了**窄屏下刷新**也不丢：下次回到宽屏仍能把原来的几格摆回来。
 */
export const PANES_WIDE_STORAGE_KEY = 'cp.editorPanesWide'

/** 已加载 / 已更新的预设：`{ saved, mirror }`，`mirror` 是归并出来的那棵树的结构签名 */
let widePresetCache = null
let widePresetLoaded = false

function loadWidePreset() {
  if (widePresetLoaded) return widePresetCache
  widePresetLoaded = true
  try {
    const raw = window.localStorage.getItem(PANES_WIDE_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    if (parsed?.saved?.root && typeof parsed.mirror === 'string') widePresetCache = parsed
  } catch {
    /* 存档坏了就当没有预设 */
  }
  return widePresetCache
}

function setWidePreset(preset) {
  widePresetCache = preset
  widePresetLoaded = true
  try {
    if (preset) window.localStorage.setItem(PANES_WIDE_STORAGE_KEY, JSON.stringify(preset))
    else window.localStorage.removeItem(PANES_WIDE_STORAGE_KEY)
  } catch {
    /* 隐私模式 / 配额满：预设只在本次会话里有效 */
  }
}

/**
 * 布局树的**结构签名**（不看比例、不看页签）：叶子按 id 标记，split 带上轴。
 *
 * 用来判「窄屏里这棵树还是不是当初归并出来的那一棵」。用户拖分割条、搬页签都不改签名
 * （回到宽屏仍还原预设）；一旦关了窗格又重新分屏，签名就变了 —— 那时说明用户确实在窄屏
 * 里重排过，预设作废，改走「上下翻成左右」那条路。
 *
 * @param {any} node
 * @returns {string}
 */
function structureSignature(node) {
  if (!node) return '-'
  if (isLeaf(node)) return `L(${node.id})`
  return `S(${node.id}:${node.axis},${structureSignature(node.a)},${structureSignature(node.b)})`
}

/**
 * 内部：把 >2 片叶子归并成两片 —— 按 DFS 顺序切一半，前一半的页签并进上面一格、
 * 后一半并进下面一格（页签一张不丢，顺序照旧）。
 *
 * 为什么按叶子数对分而不是按页签数：窄屏的竖排投影就是 DFS 顺序，前一半叶子正是宽屏里
 * 「上半部分」。按叶子数切，用户心里的「上半 / 下半」能对上；按页签数切会把视觉相邻的
 * 两格拆到不同的段里。
 *
 * 两格都复用各自组内**第一片叶子**的 id（渲染层按 id 复用 Monaco 实例，见不变式 4）。
 *
 * @returns {boolean} 是否真的归并了
 */
function collapseForNarrow() {
  const list = leaves()
  if (list.length <= MAX_PANES_NARROW) return false

  const cut = Math.ceil(list.length / 2)
  const groups = [list.slice(0, cut), list.slice(cut)]
  const focusedId = editorPanes.focusedPaneId

  const paneFrom = (group) => {
    const host = group[0]
    const tabs = []
    let active = null
    let preview = null
    for (const leaf of group) {
      for (const tab of leaf.tabs) if (!tabs.includes(tab)) tabs.push(tab)
      // 焦点原来在哪一片，就优先把它正在看的那张带过来（别把用户眼前的文件换掉）
      if (leaf.id === focusedId && leaf.active) active = leaf.active
      else if (!active && leaf.active) active = leaf.active
      if (!preview && leaf.preview) preview = leaf.preview
    }
    return {
      kind: 'leaf',
      id: host.id,
      tabs,
      active: active && tabs.includes(active) ? active : lastFileTab(tabs) ?? tabs[0] ?? null,
      preview: preview && tabs.includes(preview) ? preview : null,
    }
  }

  const first = paneFrom(groups[0])
  const second = paneFrom(groups[1])
  if (!first || !second) return false

  editorPanes.root = {
    kind: 'split',
    id: newId('split'),
    axis: 'y',
    ratio: 0.5,
    a: first,
    b: second,
    // 这一刀是窄屏口径的产物：预设万一丢了，回到宽屏时也该翻成左右，而不是竖着叠
    narrowBorn: true,
  }
  editorPanes.focusedPaneId = groups[1].some((leaf) => leaf.id === focusedId)
    ? second.id
    : first.id
  return true
}

/**
 * 内部：把宽屏预设摆回来，同时**不丢窄屏里任何页签**。
 *
 * 三件事：
 *   1. 预设树里的页签只保留「此刻还活着」的那些 —— 在窄屏里关掉的页签不该借尸还魂；
 *   2. 窄屏里新开的页签不在预设里，按所在窗格的 id 补回同 id 的那片叶子（找不到就补进
 *      第一片），顺序接在末尾；
 *   3. 焦点送回「用户此刻正在看的那张」所在的窗格。
 *
 * @param {any} saved `serializePanes()` 的产物
 * @returns {boolean} 是否还原成功
 */
function applyWidePreset(saved) {
  const live = new Set(allTabs())
  const root = buildTree(saved?.root, (id) => live.has(id))
  if (!root) return false

  const presetLeaves = leaves(root)
  const byId = new Map(presetLeaves.map((leaf) => [leaf.id, leaf]))
  const placed = new Set(presetLeaves.flatMap((leaf) => leaf.tabs))
  // 先记下「此刻眼前的页签」—— 下一行就要换树了
  const watching = focusedLeaf()?.active ?? null

  for (const leaf of leaves()) {
    for (const tab of leaf.tabs) {
      if (placed.has(tab)) continue
      const host = byId.get(leaf.id) ?? presetLeaves[0]
      if (!host) continue
      host.tabs.push(tab)
      if (leaf.active === tab) host.active = tab
      placed.add(tab)
    }
  }

  for (const leaf of presetLeaves) {
    if (leaf.preview && !leaf.tabs.includes(leaf.preview)) leaf.preview = null
    if (!leaf.active || !leaf.tabs.includes(leaf.active)) {
      leaf.active = lastFileTab(leaf.tabs) ?? leaf.tabs[0] ?? null
    }
  }

  editorPanes.root = root
  const owner = watching
    ? presetLeaves.find((leaf) => leaf.tabs.includes(watching)) ?? null
    : null
  if (owner) {
    owner.active = watching
    editorPanes.focusedPaneId = owner.id
  } else {
    const wanted = typeof saved?.focusedPaneId === 'string' ? saved.focusedPaneId : null
    editorPanes.focusedPaneId = wanted && byId.has(wanted) ? wanted : presetLeaves[0]?.id ?? null
  }
  return true
}

/**
 * 内部：把**在窄屏切出来**的分割翻成宽屏方向（`y` → `x`：上边变左边、下边变右边），
 * 顺手摘掉记号（它们已经是宽屏的普通分割了）。宽屏原本就有的 `y`-split 没有记号，不动。
 *
 * @param {any} node
 * @returns {boolean} 是否改动过（调用方据此决定要不要落盘）
 */
function transposeNarrowSplits(node) {
  if (!node || isLeaf(node)) return false
  let changed = transposeNarrowSplits(node.a)
  changed = transposeNarrowSplits(node.b) || changed
  if (node.narrowBorn) {
    delete node.narrowBorn
    changed = true
    if (node.axis === 'y') node.axis = 'x'
  }
  return changed
}

/**
 * 宽窄屏切换时把布局树搬到当前口径上。由 `shellSettings` 的 `isNarrowLayout` 变化触发
 * （模块底部那条 watch），启动恢复之后也显式跑一次（见 `enablePanesPersistence`）。
 *
 * 【窄屏】3 片及以上归并成两片：先把当前树快照成「宽屏预设」，再 `collapseForNarrow()`。
 * 页签一张不丢，只是攒进两个窗格。
 *
 * 【宽屏】两条路：
 *   · 有预设且当前树还是当初归并出来的那一棵（结构签名对得上）→ 原样还原宽屏布局，
 *     窄屏里新开的页签补进去；
 *   · 否则说明窄屏里确实重排过 → 把窄屏切出来的上下分割翻成左右（上 → 左、下 → 右）。
 *
 * @param {boolean} [narrow]
 * @returns {boolean} 树是否变了
 */
export function adaptPanesToLayout(narrow = isNarrowLayout()) {
  if (narrow) {
    if (leaves().length <= MAX_PANES_NARROW) return false
    const saved = serializePanes()
    if (!collapseForNarrow()) return false
    setWidePreset({ saved, mirror: structureSignature(editorPanes.root) })
    persistPanes()
    return true
  }

  const preset = loadWidePreset()
  if (preset && preset.mirror === structureSignature(editorPanes.root)) {
    const restored = applyWidePreset(preset.saved)
    setWidePreset(null)
    if (restored) persistPanes()
    return restored
  }

  // 结构已经变了（或压根没有预设）：旧预设作废，免得下次窄屏又把它翻出来
  setWidePreset(null)
  const changed = transposeNarrowSplits(editorPanes.root)
  if (changed) persistPanes()
  return changed
}

/** 恢复完成（或确认没有存档）之后调用一次，打开落盘开关。 */
export function enablePanesPersistence() {
  persistReady = true
  // 恢复出来的可能是宽屏存档，而此刻已经是窄屏（手机竖屏打开）—— 先归并成两格再把
  // 归并结果写回去；反过来「上次退出在窄屏、这次在宽屏」也在这里把预设还原回来。
  adaptPanesToLayout()
  persistPanes()
}

/* ------------------------------------------------------------ 空窗格自动回收

   用户 2026-11-17：「一个窗格的页签为空就直接关掉这一格，不要停在那张占位页上问」。
   规则放在真源这一层：关页签 / 拖走页签 / 删文件 / 切换工作区 prune 之后，都只是
   `leaf.tabs` 变了 —— 不必给每条路径各挂一次收尾（漏掉一条就是一片挂着占位页的僵尸窗格，
   `EditorPane` 里那颗「关闭窗格」按钮就成了唯一的出口）。

   签名只取「哪些叶子有页签」，拖分割线（ratio 变化）不会惊动它。
   先登记「装过页签的叶子」再收 —— 顺序反了会把刚装上页签的格子当成「从没装过」，包庇它一轮。

   单窗格时根叶子永远不算「装过页签」：它没有父节点，`closeEmptyPane` 本来就关不掉它，
   可一旦用户从这片空编辑区分屏出去，它就有了父节点 —— 不在这里把它留在 `allowsEmpty` 里，
   分屏刚造出来的两片空格会当场被收掉一片，观感是「⌘\ 什么都不做」。
*/
watch(
  () => leaves().map((leaf) => (leaf.tabs.length ? leaf.id : '')).join('|'),
  () => {
    for (const leaf of leaves()) {
      if (leaf.tabs.length) allowsEmpty.delete(leaf.id)
    }
    if (isLeaf(editorPanes.root)) allowsEmpty.add(editorPanes.root.id)
    reapEmptyPanes()
  },
)

watch(
  () => serializePanes(),
  () => persistPanes(),
  { deep: true },
)

// 宽窄屏切换（旋屏 / 拖窗口跨过 600px / 平板插拔键盘）：把布局树搬到新口径上。
// 底层是一个 ref，所以这条 watcher 只回答「变没变」，不需要轮询。
watch(isNarrowLayout, (narrow) => adaptPanesToLayout(narrow))
