/**
 * tabGroups —— 页签分组（2026-10-19 加，模仿 Chrome 的标签页组）。
 *
 * 【成员与顺序是两回事】顺序的唯一权威仍是 tabStrip.stripOrder（纪律见它的文件头）；
 * 这里只记「哪个页签属于哪个组」与组自己的元数据（颜色 / 名字）。
 * 一条不变式：**同一组的成员在 stripOrder 里必须连续** —— 组在条带上是一段连续的
 * 「药丸」，不连续就没法画。两个动作共同维持它：
 *   · 往组里加页签：顺手把那张页签挪到组旁（moveTabInPane，见 relocateIntoRun）；
 *   · 拖动落点：EditorTabs 收尾时调 syncAfterDrop，把「拖出组 = 退组」「拖进某组 = 入组」
 *     两件事归拢回来（Chrome 同款行为）。
 *
 * 【只分文件页签】合成视图页签（设置 / 抽题）不参与分组 —— 组是「一批文件」的语义，
 * 视图进组会让 stripOrder 的连续性与关闭批次都变复杂，需求也没出现。
 *
 * 【折叠】（2026-10-19 加，用户口径：「左键点芯片 = 展开 / 折叠，右键才是菜单」）
 * 折叠只影响**渲染**：成员页签仍然在 stripOrder 里、也仍然留在 DOM 里（靠 `is-group-hidden`
 * 加 display: none），只是不占位置。为什么不一并摘出序列：拖动排序的下标就是在
 * 「DOM 顺序 == stripOrder」这条等式上算的（见 composables/useTabDrag.js），一摘就错位。
 * 折叠组的成员**不参与**「拖到旁边即入组」—— Chrome 同款（拖到折叠组边上只是排在它旁边）；
 * 反过来，往折叠组里加页签会把组展开（否则页签凭空消失，看不出发生了什么）。
 * **焦点落进折叠组也展开**（2026-11-16 补，见 expandGroupOfActiveTab）：文件树点一个「已开着、
 * 但在折叠组里」的文件时，openFile 只改 activeId —— 不展开就是「编辑区开着它、条带上找不到」。
 *
 * 【落盘】`cp.tabGroups`：`{ groups: [{id,color,name,collapsed}], memberOf: {tabId: groupId} }`。
 * 不带 folder 后缀（成员是节点 id，换工作区后对不上号的部分由 prune 清掉）；
 * 成员键是 VFS 节点 id（改名 / 移动不变，见 workspaceStore.moveNode），分组跟着文件走。
 * 云同步白名单刻意不含它：分组是本机的界面状态，与 cp.openTabs 同一档。
 *
 * 【给其它功能的创建入口】（2026-10-19 加）要「按一批页签建组」的功能（抽题按题目归组、
 * 批量导入把同一批文件圈在一起…）**只走下面这几个入口，别直接 push tabGroups.groups
 * 或写 memberOf** —— 连续性、色板校验、空组清理都收口在这里：
 *   · `groupTabs(tabIds, { name, color })` —— 建组并收编一批页签（最常用）
 *   · `createGroupWithTab(tabId, { name, color })` —— 单张建组（页签右键菜单走的就是它）
 *   · `addTabsToGroup(tabIds, gid)` —— 把一批页签收进**已有**的组
 *   · `findGroupByName(name)` —— 按名字取组（同一批文件重复导入时先找再补，别建重复组）
 * 三条调用约定：① 成员必须**已经开成页签**（先 await createFile / openFile，再建组 ——
 * 没开的文件在条带上不存在，会被静默丢掉）；② 合成视图 id 与重复 id 会被静默过滤；
 * ③ 一个有效页签都没有时返回 null / 0，不抛错、不留半成品组。
 *
 * 例（导入一道题的文件并归成一组；同一道题再导入时补进同一组，不建重复组）：
 *   const ids = []
 *   for (const f of files) ids.push((await createFile(f.path, f.content)).id)
 *   const found = findGroupByName(title)
 *   if (found) addTabsToGroup(ids, found.id)
 *   else groupTabs(ids, { name: title, color: 'blue' })
 */
import { reactive, watch } from 'vue'
import { activateView, activeViewIdIn, deactivateViewsIn, isViewOpen } from './editorViews.js'
import { isViewId } from './editorViewIds.js'
import { stripOrder } from './tabStrip.js'
import { moveTabInPane, paneOf, placeTab } from './editorPanes.js'
import { closeFocus, closeTab, createFile, focusTabIntent, workspace } from './vfs/workspaceStore.js'
import { templateForPath } from './fileTemplates.js'

const STORAGE_KEY = 'cp.tabGroups'

/**
 * 色板（顺序照 Chrome 选色行）；实际色值在 base.css 的 `--group-*` 里，两套主题同值。
 * 组里只存色名，渲染处拼成 `var(--group-<色名>)` —— 组件里不许写死色值。
 */
export const GROUP_COLORS = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange']

export const tabGroups = reactive({
  /**
   * `lastActiveTabId` 是折叠时记下的「折叠前最后停着的那个文件」（2026-10-20 十七改）：
   * 折叠把焦点转走或清空，展开时若全局 activeId 仍为 null 就靠它把焦点还回去。
   * 只在 EditorTabs.transferFocusOutOfGroup 的全折叠兜底里写。
   * @type {{id: string, color: string, name: string, collapsed: boolean, lastActiveTabId?: string}[]}
   */
  groups: [],
  /** @type {Record<string, string>} tabId → groupId */
  memberOf: {},
})

let seq = 0
function newId() {
  seq += 1
  return `g${Date.now().toString(36)}-${seq}`
}

/** @param {string} tabId @returns {{id:string,color:string,name:string,collapsed:boolean}|null} */
export function groupOf(tabId) {
  const gid = tabGroups.memberOf[tabId]
  if (!gid) return null
  return tabGroups.groups.find((g) => g.id === gid) ?? null
}

/** @param {string} gid */
export function groupOfId(gid) {
  return tabGroups.groups.find((g) => g.id === gid) ?? null
}

/** 组的成员（按 stripOrder 的当前次序；成员天然连续 —— 见文件头的不变式） */
export function membersOf(gid) {
  return stripOrder.value.filter((id) => tabGroups.memberOf[id] === gid)
}

/** 取一个用得最少的颜色（都用过就按色板顺序回落） */
function pickColor() {
  const counts = new Map(GROUP_COLORS.map((c) => [c, 0]))
  for (const g of tabGroups.groups) counts.set(g.color, (counts.get(g.color) ?? 0) + 1)
  let best = GROUP_COLORS[0]
  for (const c of GROUP_COLORS) if ((counts.get(c) ?? 0) < (counts.get(best) ?? 0)) best = c
  return best
}

// ------------------------------------------------------------ 创建（给其它功能的公开入口）

/**
 * 过滤一批待入组的页签 id：非字符串、合成视图、条带上还没有的（没开成页签）、重复的，
 * 一律静默丢掉；`excludeGroupId` 用于「收进已有组」时跳过已经在里面的。
 * @param {string[]} tabIds
 * @param {{excludeGroupId?: string|null}} [opts]
 * @returns {string[]}
 */
function validTabIds(tabIds, { excludeGroupId = null } = {}) {
  const out = []
  for (const id of tabIds ?? []) {
    if (typeof id !== 'string' || !id) continue
    if (isViewId(id) || !stripOrder.value.includes(id)) continue
    if (out.includes(id)) continue
    if (excludeGroupId && tabGroups.memberOf[id] === excludeGroupId) continue
    out.push(id)
  }
  return out
}

/**
 * 把 id 挪到 prevId 的右边。**只在同一个叶子内**成立（组不跨窗格的不变式）。
 * 顺序计算必须用叶子的 `tabs`（不是全局 stripOrder）：全局下标里含前面窗格的页签，
 * 直接喂给叶子内重排会多挪几格 —— 分屏后除第一片叶子外全会错位。
 */
function moveAfter(id, prevId) {
  const leaf = paneOf(id)
  if (!leaf || paneOf(prevId) !== leaf) return
  const at = leaf.tabs.indexOf(id)
  const prevAt = leaf.tabs.indexOf(prevId)
  if (at === -1 || prevAt === -1 || at === prevAt) return
  moveTabInPane(leaf.id, id, at < prevAt ? prevAt : prevAt + 1)
}

/**
 * 组的宿主叶子：组内第一名成员所在的窗格。空组 / 组不存在返回 null。
 * @param {string} gid
 */
function groupLeaf(gid) {
  const first = membersOf(gid)[0]
  return first ? paneOf(first) : null
}

/**
 * 「先搬页签，再入组」：把 `ids` 里不在 `leaf` 的页签先搬进目标叶子（追加到末尾，
 * 位置随后由 moveAfter / relocateIntoRun 摆好）。组是**窗格内**的概念 —— 成员分散在
 * 两片窗格里时条带上根本画不出一段连续的药丸，所以入口处必须先把人收拢。
 *
 * @param {string[]} ids
 * @param {any|null} leaf
 */
function pullIntoLeaf(ids, leaf) {
  if (!leaf) return
  for (const id of ids) {
    const owner = paneOf(id)
    if (owner && owner !== leaf) placeTab(id, { paneId: leaf.id, makeActive: false })
  }
}

/**
 * 建一个组，把这一批页签**一次**收进去。给「一次进来好几个文件」的功能用
 * （抽题按题目归组、批量导入把同一批文件圈在一起…）—— 也是本模块唯一的建组实现，
 * 单张那条 `createGroupWithTab` 只是它的一元情形。
 *
 * 行为：成员在条带上**连续**，且按传入顺序排在「第一个有效页签」原来的位置（不会整段飞到末尾）；
 * 已经在别的组里的会被**移过来**（旧组空了随即摘掉）；组默认展开、名字 trim、颜色不在色板里
 * 就自动挑一个用得最少的。
 *
 * @param {string[]} tabIds 顺序即组内顺序
 * @param {{name?: string, color?: string}} [options]
 * @returns {string|null} 新组 id；没有一个有效页签时 null（不建空组 —— 空组在条带上无处渲染，
 *   下一次 prune 也会把它摘掉，所以干脆不允许）
 */
export function groupTabs(tabIds, options = {}) {
  const ids = validTabIds(tabIds)
  if (!ids.length) return null
  // 分屏后这一批可能来自两片窗格：先把人收拢到第一张所在的叶子（组不跨窗格）
  pullIntoLeaf(ids, paneOf(ids[0]))
  const gid = newId()
  tabGroups.groups.push({
    id: gid,
    color: GROUP_COLORS.includes(options.color) ? options.color : pickColor(),
    name: typeof options.name === 'string' ? options.name.trim() : '',
    collapsed: false,
  })
  for (const id of ids) tabGroups.memberOf[id] = gid
  // 排成一段：第一张留在原地当锚，其余按传入顺序依次贴到前一张右边
  for (let i = 1; i < ids.length; i += 1) moveAfter(ids[i], ids[i - 1])
  // 被搬空的旧组要当场摘掉（prune 平时只在 openTabIds 变化时跑）
  prune()
  return gid
}

/**
 * 单张页签建组（编辑器右键菜单「添加到新标签页组」走这里）。
 * 页签已在别的组里时会被移到新组（Chrome 的「移到新分组」同义）；菜单那边只对未分组的
 * 页签给这一项，所以正常路径不会触发。
 * @param {string} tabId
 * @param {{name?: string, color?: string}} [options]
 * @returns {string|null}
 */
export function createGroupWithTab(tabId, options = {}) {
  return groupTabs([tabId], options)
}

/**
 * 把一批页签收进**已有**的组（按传入顺序接在组尾，顺带展开）。
 * @param {string[]} tabIds
 * @param {string} gid
 * @returns {number} 真正放进去了几张（0 = 组不存在 / 全都已经在里面 / 全被过滤掉）
 */
export function addTabsToGroup(tabIds, gid) {
  const g = groupOfId(gid)
  if (!g) return 0
  const ids = validTabIds(tabIds, { excludeGroupId: gid })
  if (!ids.length) return 0
  // 组是窗格内的概念：外来页签先搬进组的宿主窗格，再谈「接在组尾」
  pullIntoLeaf(ids, groupLeaf(gid) ?? paneOf(ids[0]))
  // 组尾要在**改 memberOf 之前**取：改完 membersOf 按 stripOrder 排，不一定是想要的次序
  let prev = membersOf(gid).at(-1) ?? null
  for (const id of ids) tabGroups.memberOf[id] = gid
  if (prev) {
    for (const id of ids) {
      moveAfter(id, prev)
      prev = id
    }
  }
  // 往折叠着的组里加页签要展开（否则新页签凭空消失）
  g.collapsed = false
  prune()
  return ids.length
}

/**
 * 按名字取组 —— 给「同一批文件会被重复导入」的功能用：先 findGroupByName，找到就
 * addTabsToGroup 补齐，没有才 groupTabs 新建。空名字返回 null（无名组不参与匹配）。
 * @param {string} name
 * @returns {{id:string,color:string,name:string,collapsed:boolean}|null}
 */
export function findGroupByName(name) {
  const target = String(name ?? '').trim()
  if (!target) return null
  return tabGroups.groups.find((g) => g.name === target) ?? null
}

/**
 * 展开 / 折叠（芯片左键点它）。**只翻一个标志位**：成员页签照样在 stripOrder 里，
 * 渲染层据 `collapsed` 给它们加 `is-group-hidden`（display: none），见文件头的说明。
 * @param {string} gid
 */
export function toggleCollapsed(gid) {
  const g = groupOfId(gid)
  if (g) g.collapsed = !g.collapsed
}

/** 这张页签此刻是不是被折叠藏起来了（渲染层与拖动落点数学共用这一条判据） */
export function isHiddenTab(tabId) {
  const g = groupOf(tabId)
  return !!g && !!g.collapsed
}

/**
 * 焦点落进被折叠的组 → 立刻展开那一组（2026-11-16 补，「焦点必可见」的反向那一条）。
 *
 * 折叠只影响**渲染**（成员仍在 stripOrder 里，被 `is-group-hidden` 藏起来），所以「打开一个
 * 藏在折叠组里的页签」这条路上原来没人拦：点一个**已开着、但在折叠组里**的文件，`openFile`
 * 只把 activeId 指过去，组还是折叠的 —— 编辑区开着它、条带上只有一枚芯片，页签在栏里根本
 * 找不到（用户 2026-11-16 报「打开了标签页组中的一个标签的时候，标签页组没有展开」，
 * 入口是 **Codeforces 抽题 / 比赛页导入题目**：那道题的文件早就开着、也在组里，再点一次
 * 只是把焦点指回去）。
 * 以前只有折叠 / 展开这两个动作各自结算焦点（EditorTabs 的 transferFocusOutOfGroup /
 * restoreFocusIntoGroup），缺的正是反向那条：焦点**从外面**落进折叠组时由谁来展开它。
 *
 * 【两个触发口，缺一不可】
 *   · `watch(activeId)`（模块底部注册）：管「焦点真的换了」的所有路 —— 启动恢复、closeTab
 *     的焦点回退、组件外的直接赋值；
 *   · `focusTabIntent.show`（workspaceStore 的注入点，下面一行就是注册）：管「重复打开同一张
 *     页签」—— 那时 activeId 赋值前后同值，watch 不响，而 CF 抽题 / 比赛页重复导同一道题
 *     走的正是这条路（`problemImport` 明写「已经打开过这道题时 activeId 不变」）。
 * 为什么收口在状态层而不是逐个入口：能改焦点的路不止一处（文件树、setActiveTab、页签菜单、
 * 快捷键、启动恢复），写在入口上必漏。这是状态层的不变式，与 isVisible 同源。
 * **不做展开动画**：与 addToGroup / addTabsToGroup 里「往折叠组加页签顺手展开」同档 ——
 * 此刻用户的注意力在编辑区，不需要一段 220ms 的滑动来交代页签去了哪。
 * @param {string|null} id 新的焦点页签
 */
function expandGroupOfActiveTab(id) {
  if (!id) return
  const g = groupOf(id)
  if (g && g.collapsed) g.collapsed = false
}

// 「用户要打开 / 切到这张页签」的意图：值没变也算数（见上面那段的两条触发口）
focusTabIntent.show = expandGroupOfActiveTab

/**
 * 这张页签此刻**看得见**吗：在条带上、还开着、不属于已折叠的分组。
 *
 * 「焦点必可见」那条铁律的就地实现（2026-11-09 从 findNextVisibleTab 里抽出来，供
 * 焦点记忆回溯复用 —— 记忆里可能有早就关掉 / 被折叠藏起来的 id，落点前得逐个筛）。
 * **不判类型**：合成视图 id 只要开着就算可见，装不装得下是调用方的事（见 includeViews）。
 * @param {string} id
 * @returns {boolean}
 */
export function isTabVisible(id) {
  if (!id || stripOrder.value.indexOf(id) === -1) return false
  if (isViewId(id)) return isViewOpen(id)
  return workspace.openTabIds.includes(id) && !isHiddenTab(id)
}

/**
 * 可见页签寻址（2026-10-20 十四改抽出的公共方法；2026-10-26 加 includeViews）：
 * 折叠组转移焦点与「关闭激活页签」共用同一套「先向右、兜底向左」的优先级。从 anchorIndex
 * 起（**含**）向右找第一个可见页签，右侧没有再从 anchorIndex-1 起向左逆序找。
 *
 * 「可见」= 在 stripOrder 里、还开着（文件看 openTabIds —— 关闭场景 stripOrder 可能要等
 * watch 才清掉旧 id；视图看它自己的 open 标志，同理）、不属于任何已折叠分组。
 * `includeViews` 说的是**这个调用方装不装得下视图 id**，不是「视图算不算页签」：
 *   · settleLeafFocus（关页签 / 关视图 / 拖页签三路共用的落点）传 true —— 那一层认的是
 *     「条带上的一张页签」，视图与文件一视同仁，这正是「源窗格只剩设置页签时把它点亮」
 *     能成立的地方；
 *   · 它内部还有一处传 false：本窗格**已经被一张视图盖着**时只收拾文件那一轴
 *     （`leaf.active` 是「关掉视图后回哪份代码」的备忘，装不下视图 id，也不该把视图按下去）。
 * 折叠组转移焦点也传 true（视图页签就排在组旁边时，它才是「离得最近的那一格」）。
 * anchor 的两个调用口径：
 *   · 折叠组：传**组内第一名成员**的下标 —— 向右从它起扫，组内其余成员因已折叠被
 *     跳过，天然等效「从组末之后开始」；向左也从组首左边开始，两向都正确。
 *   · 关闭页签：传**被关页签**的下标 —— 先右后左，右邻就是「原来站在它右边那张」。
 * @param {number} anchorIndex stripOrder 里的参照下标
 * @param {string} [excludeId] 额外排除的页签 id（关闭场景传被关的那张，双保险）
 * @param {boolean} [includeViews] 视图页签算不算候选（调用方装不装得下视图 id，见上）
 * @param {string[]} [ids] 寻址范围。关闭交接传**本叶子的** tabs，焦点就不会跳到别的窗格；
 *   不传则退回全局 stripOrder（折叠组转移等单窗格语义）。
 * @returns {string|null} 可见页签 id；一个都没有（全部折叠）时 null
 */
export function findNextVisibleTab(anchorIndex, excludeId, includeViews = false, ids = stripOrder.value) {
  const visibleAt = (i) => {
    const id = ids[i]
    if (!id || id === excludeId) return null
    if (!isTabVisible(id)) return null
    if (isViewId(id) && !includeViews) return null
    return id
  }
  for (let i = Math.max(0, anchorIndex); i < ids.length; i += 1) {
    const hit = visibleAt(i)
    if (hit) return hit
  }
  for (let i = Math.min(anchorIndex, ids.length) - 1; i >= 0; i -= 1) {
    const hit = visibleAt(i)
    if (hit) return hit
  }
  return null
}

/**
 * 「这个叶子里刚走掉一张页签，剩下的该露出谁」—— **关页签、关视图页签、跨窗格拖页签
 * 三条路共用的唯一落点**。
 *
 * 【为什么必须两轴一起结算】焦点存在两处：文件走 `leaf.active`（`activeId` 的口径），
 * 合成视图走 editorViews 里各自的 `active` 标志。早先这里只写文件那一轴，于是
 * 「源窗格只剩一张设置 / Codeforces 页签」时只能写 null：文件轴说「什么都别显示」，
 * 视图轴没被点名就保持「没盖着」，结果是窗格露出「在资源管理器中打开或新建文件」的空态、
 * 条带上却明明还站着一张设置页签（用户 2026-11-17 报的正是这个 —— 拖走最后一份代码时
 * 源窗格不亮视图）。邻居是视图时**把它点亮**才是完整答案。
 *
 * 【三级判据】
 *   ① 先右后左找**可见**页签（含视图，`includeViews = true`）：与 Chrome 同一条规矩，
 *      跳过折叠组里藏着的、已经关掉的（`isTabVisible`）；
 *   ② 找到的是视图 → 文件那一轴留空（视图盖着窗格，见 editorViews.show 的口径），视图轴点亮它。
 *      这里必须写 null：留一个刚搬走 / 刚关掉的 id 就是「编辑区开着文件、条带找不到它」的幽灵态；
 *   ③ 一张可见页签都不剩 → 两轴都归零（「焦点必可见」铁律，见 findNextVisibleTab 的说明）。
 *
 * 只写状态、不碰焦点记忆：`tabFlow.closeTabItem` 的「回到上一个有焦点的页签」是**上一级**
 * 的事，它跑完记忆那一级再落到这里 —— 记忆优先、这里兜邻居，两级不会打架。
 *
 * @param {any} leaf 摘除**之后**的叶子
 * @param {string} removedId 刚离开的那张（双保险排除）
 * @param {number} index 它在摘除前的下标；摘除后正好指向原来的右邻
 * @returns {string|null} 最终落到的页签 id
 */
export function settleLeafFocus(leaf, removedId, index) {
  if (!leaf) return null

  // 本窗格此刻正盖着一张视图（设置 / Codeforces）：屏幕上已经有东西，**不要换**。
  // 关掉 / 拖走一张背景页签不该把用户正在看的设置页顶掉 —— 此时 `leaf.active` 只是
  // 「关掉视图后回哪份代码」的备忘，收拾它时只认文件（includeViews = false，与改造前
  // closeFocus.pick 的口径一致），且绝不能留一个已经走掉的 id（不变式 3）。
  const covered = activeViewIdIn(leaf.id)
  if (covered) {
    leaf.active = findNextVisibleTab(index, removedId, false, leaf.tabs)
    return covered
  }

  const next = findNextVisibleTab(index, removedId, true, leaf.tabs)
  if (!next) {
    // 折叠组把剩下的全藏起来了（或本来就没有）：两轴都归零 —— 焦点宁可空着，也不能指向
    // 条带里找不到的那一格（与 EditorTabs 的折叠兜底同一条规矩）。视图轴不必再收：
    // 上面那个 `covered` 分支已经把「本窗格盖着视图」的情况排除了。
    leaf.active = null
    return null
  }
  if (isViewId(next)) {
    leaf.active = null
    activateView(next)
    return next
  }
  deactivateViewsIn(leaf.id)
  leaf.active = next
  return next
}

// 关闭激活页签的焦点回退注入（见 workspaceStore.closeFocus 的说明）。原先这里注入的只是
// 「可见页签寻址」（findNextVisibleTab），落点由 workspaceStore 自己写 —— 那样只能写文件那一轴：
// `activeId` 装不下视图 id，于是「源窗格只剩一张设置页签」时焦点被置成 null，窗格空着、
// 条带上却明明还站着一张设置。现在改成注入**整个落点结算**（settleLeafFocus，含视图），
// 关页签 / 跨窗格拖页签 / 关视图页签三条路都走它，结论不会再分叉。
closeFocus.settle = settleLeafFocus

/**
 * 把页签挪到组的旁边（保持连续性）。已在组旁（与任一成员相邻）就不动 ——
 * 右键加组时那张页签多半在别处，Chrome 的做法是把它挪过来。
 */
function relocateIntoRun(tabId, gid) {
  const leaf = paneOf(tabId)
  if (!leaf) return
  const members = membersOf(gid).filter((x) => x !== tabId && paneOf(x) === leaf)
  if (!members.length) return
  const at = leaf.tabs.indexOf(tabId)
  if (members.some((m) => Math.abs(leaf.tabs.indexOf(m) - at) === 1)) return
  // moveTabInPane 的 insertIndex 契约是「去掉被挪项」的列表：找到最后一个成员在那份
  // 列表里的位置，插到它右边（即整段组的末尾）。下标必须是**叶内**的 —— 跨窗格成员
  // 已由调用方 pullIntoLeaf 收拢，这里再 filter 一道防御。
  const rest = leaf.tabs.filter((x) => x !== tabId)
  const lastAt = Math.max(...members.map((m) => rest.indexOf(m)))
  moveTabInPane(leaf.id, tabId, lastAt + 1)
}

/** 把页签加进已有的组（会挪到组旁）；已是本组成员则什么都不做 */
export function addToGroup(tabId, gid) {
  const g = groupOfId(gid)
  if (!g || isViewId(tabId)) return
  if (tabGroups.memberOf[tabId] === gid) return
  // 「先搬页签，再入组」：目标组在别的窗格时先把这张页签搬过去，否则组会跨叶
  pullIntoLeaf([tabId], groupLeaf(gid))
  tabGroups.memberOf[tabId] = gid
  // 往折叠着的组里加页签 → 顺手展开：否则新页签当场被藏起来，用户看到的只是「点了没反应」
  g.collapsed = false
  relocateIntoRun(tabId, gid)
  // 与 groupTabs 同一口径：这张页签可能是旧组的最后一名成员，搬走要把旧空组摘掉
  prune()
}

export function removeFromGroup(tabId) {
  delete tabGroups.memberOf[tabId]
  // 「无幽灵空组」不变式：被摘空的组当场销毁（原先只删成员关系，唯一的成员被摘走后
  // 组对象连同颜色 / 名字永久残留在状态与 localStorage 里 —— 芯片虽不渲染，数据是脏的）。
  // 与拖拽期的「空组暂留」不冲突：那是 useTabDrag 拖拽期间的实时归属，DOM 上的 memberOf
  // 在拖拽期间一概不动，松手结算才走到这里（onStripDrop 随后还会再调一次 removeEmptyGroups，
  // 幂等）。
  prune()
}

export function renameGroup(gid, name) {
  const g = groupOfId(gid)
  if (g) g.name = name
}

export function setGroupColor(gid, color) {
  const g = groupOfId(gid)
  if (g && GROUP_COLORS.includes(color)) g.color = color
}

/** 取消分组：页签全留着，只拆组 */
export function ungroup(gid) {
  for (const [id, owner] of Object.entries(tabGroups.memberOf)) {
    if (owner === gid) delete tabGroups.memberOf[id]
  }
  const at = tabGroups.groups.findIndex((g) => g.id === gid)
  if (at !== -1) tabGroups.groups.splice(at, 1)
}

/** 关闭整组页签（组随之消失）。逐张 closeTab —— 活跃页签的切换归 workspaceStore 管 */
export function closeGroup(gid) {
  for (const id of membersOf(gid)) closeTab(id)
  ungroup(gid)
}

/** 在组内新建一个文件页签（Chrome 的「在组内添加新标签页」）。返回新页签 id（失败为 null） */
export async function appendNewTabToGroup(gid) {
  const g = groupOfId(gid)
  if (!g) return null
  let path = '/new.cpp'
  for (let i = 2; i < 100; i += 1) {
    try {
      const node = await createFile(path, templateForPath(path))
      addToGroup(node.id, gid)
      return node.id
    } catch {
      // 撞名：换个名字再试（new-2.cpp / new-3.cpp …）
      path = `/new-${i}.cpp`
    }
  }
  return null
}

/**
 * 拖动落盘后的归拢（EditorTabs 的 onDrop 收尾调）。只看被拖的那一张：
 *   · 它有组：与同组其余成员失去相邻 → 退组（Chrome：把页签拖出组就是摘出来）；
 *   · 它没组：落进了某组旁（左邻或右邻是组员，且两侧不会同时指到两个不同的组）→ 入组。
 * 其余成员的连续性不受单张拖动影响，不用全表扫。
 *
 * **折叠着的组不算「可加入」**：它的成员在条带上不占位，落在它旁边的那张页签看起来是排在
 * 芯片外侧的，顺手塞进组里就等于当场消失（Chrome 同款：拖到折叠组边上只是排在它旁边）。
 */
export function syncAfterDrop(draggedId) {
  const leaf = paneOf(draggedId)
  if (!leaf) return
  const at = leaf.tabs.indexOf(draggedId)
  if (at === -1) return
  const prevG = joinableGroupAt(leaf.tabs[at - 1])
  const nextG = joinableGroupAt(leaf.tabs[at + 1])
  const mine = groupOf(draggedId)

  if (mine) {
    const others = membersOf(mine.id).filter((x) => x !== draggedId)
    if (
      others.length &&
      !others.some((m) => Math.abs(leaf.tabs.indexOf(m) - at) === 1)
    ) {
      removeFromGroup(draggedId)
    }
    return
  }
  if (prevG && (!nextG || nextG.id === prevG.id)) {
    tabGroups.memberOf[draggedId] = prevG.id
  } else if (!prevG && nextG) {
    tabGroups.memberOf[draggedId] = nextG.id
  }
}

/** 条带上那一格所属的「可以把页签吸进去」的组；折叠着的组返回 null（理由见 syncAfterDrop） */
function joinableGroupAt(id) {
  const g = groupOf(id)
  return g && !g.collapsed ? g : null
}

/**
 * 摘掉成员已空的组（2026-10-20 加，拖拽落点结算用）。拖拽期间被拖空的组**故意不摘** ——
 * 芯片留在条带上，用户反悔往回拖还能重新吸进组（useTabDrag 的实时归属照常翻转）；
 * 松手结算（EditorTabs 的 onStripDrop）时成员仍为 0 的组在这里就地销毁。
 */
export function removeEmptyGroups() {
  const used = new Set(Object.values(tabGroups.memberOf))
  if (used.size !== tabGroups.groups.length) {
    tabGroups.groups = tabGroups.groups.filter((g) => used.has(g.id))
  }
}

/**
 * 把每组的成员在 stripOrder 上重新贴成**一段**（二十四改，「同组连续」的自愈口）。
 * 以组内第一名成员为锚（相对次序不动），其余依次贴到前一名右边。
 *
 * 正常路径不该出现断裂 —— useTabDrag 的换位判据会把非成员挡在 run 外面（见 updateDrag
 * 的「跨组越界」）。这里兜两种残留：① 旧版本留下的脏 stripOrder（用户当场的状态靠下一次
 * 落盘 / 下次开机自愈）；② 以后新增的、绕过拖拽判据直接改 stripOrder 的入口。
 *
 * 断裂的代价不只是「组员排得散」：stripItems 按「组首」插芯片，一段组会渲染出**两枚
 * 芯片 + 两条包络线**（2026-10-20 用户报「拖动一个标签页到标签页组中，出现了两个胶囊」）。
 */
export function normalizeRuns() {
  for (const g of tabGroups.groups) {
    const members = membersOf(g.id)
    if (members.length < 2) continue
    let prev = members[0]
    for (let i = 1; i < members.length; i += 1) {
      const id = members[i]
      // 不在 stripOrder 里（刚开出来还没排进去）就跳过，别把它挪到别处
      if (stripOrder.value.indexOf(id) === -1 || stripOrder.value.indexOf(prev) === -1) continue
      if (stripOrder.value.indexOf(id) !== stripOrder.value.indexOf(prev) + 1) moveAfter(id, prev)
      prev = id
    }
  }
}

/** 清掉指向已关闭页签的成员关系，再摘掉空组、把每组的成员重新贴成一段 */
function prune() {
  const open = new Set(workspace.openTabIds)
  for (const id of Object.keys(tabGroups.memberOf)) {
    if (!open.has(id)) delete tabGroups.memberOf[id]
  }
  removeEmptyGroups()
  normalizeRuns()
}

watch(() => [...workspace.openTabIds], prune, { immediate: true })

// ------------------------------------------------------------ 落盘

function load() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return
    const groups = Array.isArray(parsed.groups)
      ? parsed.groups.filter(
          (g) => g && typeof g.id === 'string' && GROUP_COLORS.includes(g.color),
        )
      : []
    for (const g of groups) {
      if (typeof g.name !== 'string') g.name = ''
      // 旧档没有这一栏（折叠是 2026-10-19 晚加的），缺省当展开
      g.collapsed = !!g.collapsed
      // 十七改加的「折叠前的焦点」，非字符串就当没有
      if (typeof g.lastActiveTabId !== 'string') delete g.lastActiveTabId
    }
    tabGroups.groups = groups
    const memberOf = {}
    if (parsed.memberOf && typeof parsed.memberOf === 'object') {
      const ids = new Set(groups.map((g) => g.id))
      for (const [tabId, gid] of Object.entries(parsed.memberOf)) {
        if (typeof tabId === 'string' && ids.has(gid)) memberOf[tabId] = gid
      }
    }
    tabGroups.memberOf = memberOf
  } catch {
    /* 坏档就当没有：分组不是要紧数据，不值得为它报错 */
  }
}

function save() {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ groups: tabGroups.groups, memberOf: tabGroups.memberOf }),
    )
  } catch {
    /* 隐私模式 / 配额满：只在内存里工作 */
  }
}

load()
watch(tabGroups, save)

// 焦点一旦落在折叠组里就把那组展开（见 expandGroupOfActiveTab）。
// **必须在 load() 之后注册**：`immediate` 那一下要读到已经从 localStorage 恢复的
// groups / memberOf，否则开机的第一帧照旧是「编辑区开着文件、条带上只有芯片」。
// immediate 还兼着「启动恢复 activeId」这个时序不确定的场景：恢复是异步的（要逐个建 model），
// 它可能早于也可能晚于本模块求值 —— 早了靠 immediate 补、晚了靠回调接。
watch(() => workspace.activeId, expandGroupOfActiveTab, { immediate: true })
