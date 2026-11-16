/**
 * tabFlow —— 页签的**流转**：此刻谁有焦点、点一张切过去、关掉一张之后焦点归谁。
 *
 * 【为什么单独一层】页签有三类（代码文件 / 设置 / Codeforces），焦点却存在两个地方：
 *   · 文件走 `workspace.activeId`（装的是 VFS 节点 id）；
 *   · 合成视图走 `editorViews` 里各自的 `active` 标志。
 * 「关掉一张之后焦点给谁」原先在两边各写一遍，且都只看自己那半边：关掉最后一个文件页签时，
 * 旁边明明还站着一张 Codeforces 页签，`activeId` 却只能置 null（它装不进视图 id），界面上
 * 就是「焦点凭空没了」；反过来关掉视图也只管自己让开，从不去问邻居是谁。每多一类页签、
 * 每多一条换焦点的路径，都得在两个轴之间手工补一次桥 —— 补丁就是这么长出来的。
 *
 * 这一层把「条带上的一张页签」当成唯一对象：id 既可以是文件节点 id，也可以是视图 id。
 * 类型只在真正落笔的那一瞬分岔（focusTab 的那一行 if），别处一概 `isViewId` 都不用写。
 * **加一种视图不必回来改这里** —— 认它的是 editorViews.EDITOR_VIEWS，不是本文件。
 *
 * 【焦点怎么读】focusedTabId = 活跃视图 ?? 活跃文件。两者天然互斥：editorViews.show()
 * 切视图时不动 activeId，所以「从视图切回代码」永远有据可依（那份代码一直挂在那儿）。
 *
 * 【关掉之后焦点给谁】两级，先记忆后邻居（2026-11-09 加第一级）：
 *   ① **回到上一个有焦点的页签** —— 用户的实际心路是「看 A 时顺手开了 B，关掉 B 自然想回 A」，
 *      而 A 在条带上可能离得很远。这就是「记忆」那一级的全部作用（MRU 栈，见 focusHistory）；
 *   ② 上个页签**已经关掉了**（或被折叠藏起来）：退回**邻居** —— 先右后左落到最近的可见页签，
 *      与 Chrome 同一条规矩。记忆里更早的几格不用：它们离条带上此刻的位置太远，跳过去比
 *      邻居更难预期。
 *   ②这一级**不在这里重写**：它与「关文件页签」「把页签拖到别的窗格」共用同一个落点结算
 *   `tabGroups.settleLeafFocus()`（两轴一次落笔，邻居是设置 / Codeforces 时把视图点亮）。
 *   本函数只在**摘除的那一刻**调它（视图那条路），再补一次「切过去」的收尾。
 * 两级都只认「看得见」的页签（tabGroups.isTabVisible）；一张都不剩才置空：焦点必须落在
 * 一张看得见的页签上，否则就是「编辑区开着文件、条带里找不到它」。
 */
import { computed, watch } from 'vue'
import {
  activateView,
  activeViewIdIn,
  closeView,
  deactivateViewsIn,
  isViewOpen,
} from './editorViews.js'
import { focusedLeaf, paneOf } from './editorPanes.js'
import { isTabVisible, settleLeafFocus } from './tabGroups.js'
import { isViewId, stripOrder } from './tabStrip.js'
import { closeTab, setActiveTab, workspace } from './vfs/workspaceStore.js'

/**
 * 条带上此刻有焦点的页签 id（文件或视图），一个都没有时 null。
 * 渲染层判「哪一颗该亮」就认这一个 —— 别再各写一套 `activeId && !viewActive`。
 * 【分屏口径】只看**焦点窗格**：隔壁窗格盖着设置页，不该让本窗格的页签变暗。
 */
export const focusedTabId = computed(
  () => activeViewIdIn(focusedLeaf()?.id) ?? workspace.activeId,
)

// ------------------------------------------------------------ 焦点记忆（关掉它之后回哪去）

/** 最多记多少张。够覆盖「来回翻十几个文件再回头」的常见情形，又不至于攒成一张垃圾表 */
const HISTORY_LIMIT = 40

/**
 * 焦点记忆：最近获得过焦点的页签，**末尾是当前焦点**（MRU 栈，重复的挪到末尾）。
 * 关闭当前页签时先回这里挑「上一个看的东西」，挑不到才退回邻居（见文件头）。
 *
 * 纯内存、不落盘：刷新之后「上一个」是上一次会话的事，照着恢复反而会跳到用户没在看的页签上。
 * 也不必是响应式的 —— 没有任何界面读它。
 * @type {string[]}
 */
const focusHistory = []

/** 还开着没（不看折叠；记忆里「被藏起来」与「已关掉」要分开处理） */
function isStillOpen(id) {
  return isViewId(id) ? isViewOpen(id) : workspace.openTabIds.includes(id)
}

/** 记一笔焦点：已在记忆里的挪到末尾（MRU 语义），超长的从头上掐掉 */
function rememberFocus(id) {
  if (!id) return
  const at = focusHistory.indexOf(id)
  if (at !== -1) focusHistory.splice(at, 1)
  focusHistory.push(id)
  // 顺手把已经关掉的划掉（它们永远选不中了；不走 closeTabItem 的关闭路径 —— 整组关闭、
  // 预览页签被顶替、删文件 —— 都会在这里被清掉，记忆不至于越攒越脏）
  for (let i = focusHistory.length - 1; i >= 0; i -= 1) {
    if (!isStillOpen(focusHistory[i])) focusHistory.splice(i, 1)
  }
  if (focusHistory.length > HISTORY_LIMIT) {
    focusHistory.splice(0, focusHistory.length - HISTORY_LIMIT)
  }
}

/** 页签关掉就从记忆里划掉 —— 否则「上一个」会指向一张已经不存在的页签 */
function forgetFocus(id) {
  const at = focusHistory.indexOf(id)
  if (at !== -1) focusHistory.splice(at, 1)
}

// 焦点一变就记一笔。**不能记在 focusTab 里**：点文件树、走 open-settings 快捷键、会话恢复
// 都绕开 focusTab 直接改 activeId / 视图的 active 标志，那样会漏记一大半真正发生过的事。
//
// `flush: 'post'` 是为了**批量**：一次切换内部可能是两拍（focusTab 的 deactivateViews →
// setActiveTab 会先把焦点落到那个「旧文件」上再落到目标），sync 会把中间那格也记成历史。
watch(focusedTabId, rememberFocus, { flush: 'post', immediate: true })

/**
 * 上一个有焦点的页签 = 记忆的末尾（正在关的那张已由 closeTabItem 先划掉）。
 *
 * 只认这**一格**、不往前翻：用户口径是「上个已经被关掉了就返回邻居」—— 记忆里更早的那几张
 * 与条带上的位置毫无关系，翻它们等于把焦点扔回很久以前看过的某个文件，比邻居更难预期。
 * 不可用（已关掉 / 被折叠藏起来）就返回 null，交回 closeTabItem 走邻居那一级。
 * @returns {string|null}
 */
function previousFocusedTab() {
  const id = focusHistory.at(-1)
  if (!id) return null
  if (!isStillOpen(id)) {
    forgetFocus(id)
    return null
  }
  return isTabVisible(id) ? id : null
}

/**
 * 把焦点交给 id（任意类型的页签）。
 *
 * 文件这一支要先 `deactivateViews()`：点文件等于「要看代码」，正盖着编辑器的视图得让开。
 * 这一步**不能只靠 editorViews 里那条 `watch(activeId)`** —— 同一个文件再点一次时
 * activeId 前后相同、watch 不触发，屏幕上却还是设置页（2026-10-25 用户报的）。
 *
 * 认不出来的 id（已关掉的文件 / 不存在的视图）是空操作：宁可不动，也不能把一个装不进
 * 任何一轴的 id 当成焦点留在 state 里。
 * @param {string|null|undefined} id
 */
export function focusTab(id) {
  if (!id) return
  if (isViewId(id)) {
    activateView(id)
    rememberFocus(id)
    return
  }
  if (!workspace.openTabIds.includes(id)) return
  // 只让开**这张页签所在窗格**的视图：隔壁窗格的设置页与本次点击无关
  deactivateViewsIn(paneOf(id)?.id)
  setActiveTab(id)
  // 同步记一笔：下面那条 watch 是 post 冲刷的（要批量去抖），同一拍里紧接着关页签时它还没跑，
  // 「上一个」就会缺这一格。这里记的是**落笔之后**的焦点，与 watch 记的是同一件事，
  // rememberFocus 自带去重，重复调用只会把它再挪到末尾。
  rememberFocus(id)
}

/**
 * 关掉一张页签（任意类型），并结算焦点。
 *
 * 只有「关的正是焦点那一张」才搬焦点 —— 关背景页签不该把用户正看着的东西换掉。
 * 搬的顺序：**先回记忆里的上一个，再退回邻居**（两级，见文件头）。
 *
 * 顺序有讲究：**先记下标、先把这张从记忆里划掉，再关**。两类页签的成员摘除都有一段异步
 * （stripOrder 由 watch 同步，下一拍才落），关完再数下标就会数在已经挪过的位置上；记忆里
 * 留着它则会被 pickFromHistory 当成「上一个」挑出来。
 *
 * @param {string} id 文件节点 id 或视图 id
 */
export function closeTabItem(id) {
  if (!id) return
  // 先锁定**本窗格**的序列、下标与叶子：closeTab / closeView 会同步把页签从 leaf.tabs 摘掉，
  // 关完再数就会数在右移后的位置上；而用全局 stripOrder 数，焦点可能被交到隔壁窗格。
  const paneTabs = paneOf(id)?.tabs ?? stripOrder.value
  const at = paneTabs.indexOf(id)
  // 叶子留个引用：关完 `paneOf(id)` 就是 null 了，而邻居结算还得知道「剩哪几张」
  const leaf = paneOf(id)
  const wasFocused = focusedTabId.value === id

  forgetFocus(id)
  if (isViewId(id)) {
    // 关的这张正盖着窗格吗？盖着才需要结算 —— 关一张**背景**视图页签（条带上的 × / 中键，
    // 屏幕上露着的是代码）不该把显示切换走，与「关背景文件页签不搬焦点」同一条规矩。
    const shown = activeViewIdIn(leaf?.id) === id
    closeView(id)
    // 视图页签的成员是 editorViews 自己摘的（不经 closeTab），文件页签那条链上的结算
    // 不会跑到 —— 这里补一次，与「关文件页签」「拖到别的窗格」共用同一个落点函数。
    if (shown) settleLeafFocus(leaf, id, at)
  } else {
    // 文件页签的移除本身就会结算一遍（closeTab → 同一个 settleLeafFocus），这里不必重来
    closeTab(id)
  }

  if (!wasFocused) return

  // ① 记忆：上一个有焦点的页签（已关掉 / 藏起来就返回 null，交给下一级）
  const previous = previousFocusedTab()
  if (previous) {
    focusTab(previous)
    return
  }

  // ② 没有可用的记忆：邻居那一级已经在摘除时结算过了（settleLeafFocus，两轴一次落笔）。
  // 这里只补一次「切过去」的公共收尾：视图要被点亮 / 文件要发一次切页签意图。
  // 焦点此刻若还空着（本窗格一张可见页签都不剩）就什么都不做 —— 空态是正确结果。
  const fallback = focusedTabId.value
  if (fallback && fallback !== id) focusTab(fallback)
}
