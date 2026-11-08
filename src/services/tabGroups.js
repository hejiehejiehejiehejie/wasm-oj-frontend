/**
 * tabGroups —— 页签分组（2026-10-19 加，模仿 Chrome 的标签页组）。
 *
 * 【成员与顺序是两回事】顺序的唯一权威仍是 tabStrip.stripOrder（纪律见它的文件头）；
 * 这里只记「哪个页签属于哪个组」与组自己的元数据（颜色 / 名字）。
 * 一条不变式：**同一组的成员在 stripOrder 里必须连续** —— 组在条带上是一段连续的
 * 「药丸」，不连续就没法画。两个动作共同维持它：
 *   · 往组里加页签：顺手把那张页签挪到组旁（moveStripItem，见 relocateIntoRun）；
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
import { isViewOpen } from './editorViews.js'
import { isViewId, moveStripItem, stripOrder } from './tabStrip.js'
import { closeFocus, closeTab, createFile, workspace } from './vfs/workspaceStore.js'
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
  return stripOrder.filter((id) => tabGroups.memberOf[id] === gid)
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
    if (isViewId(id) || !stripOrder.includes(id)) continue
    if (out.includes(id)) continue
    if (excludeGroupId && tabGroups.memberOf[id] === excludeGroupId) continue
    out.push(id)
  }
  return out
}

/**
 * 把 id 挪到 prevId 的右边。
 * 不能直接传「prev 的下标 + 1」：moveStripItem 的 insertIndex 是**去掉被挪项之后**的下标，
 * 被挪项原本在 prev 左边时，它一走 prev 的下标就前移一位，照原值传会多挪一格。
 */
function moveAfter(id, prevId) {
  const at = stripOrder.indexOf(id)
  const prevAt = stripOrder.indexOf(prevId)
  if (at === -1 || prevAt === -1 || at === prevAt) return
  moveStripItem(id, at < prevAt ? prevAt : prevAt + 1)
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
 * 这张页签此刻**看得见**吗：在条带上、还开着、不属于已折叠的分组。
 *
 * 「焦点必可见」那条铁律的就地实现（2026-11-09 从 findNextVisibleTab 里抽出来，供
 * 焦点记忆回溯复用 —— 记忆里可能有早就关掉 / 被折叠藏起来的 id，落点前得逐个筛）。
 * **不判类型**：合成视图 id 只要开着就算可见，装不装得下是调用方的事（见 includeViews）。
 * @param {string} id
 * @returns {boolean}
 */
export function isTabVisible(id) {
  if (!id || stripOrder.indexOf(id) === -1) return false
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
 *   · services/tabFlow.js 的关闭交接传 true —— 那一层认的是「条带上的一张页签」，
 *     视图与文件一视同仁，这正是「关掉文件后焦点跳到旁边的 Codeforces」能成立的地方；
 *   · tabGroups 自己的 closeFocus.pick（注入给 workspaceStore.closeTab）**不能**传 true：
 *     那条路上焦点要写进 `activeId`，而 activeId 装不下视图 id。它返回 null 时由
 *     closeTabItem 接手把焦点交给视图（两条路分工，不是互相兜底）。
 * 折叠组转移焦点也传 true（视图页签就排在组旁边时，它才是「离得最近的那一格」）。
 * anchor 的两个调用口径：
 *   · 折叠组：传**组内第一名成员**的下标 —— 向右从它起扫，组内其余成员因已折叠被
 *     跳过，天然等效「从组末之后开始」；向左也从组首左边开始，两向都正确。
 *   · 关闭页签：传**被关页签**的下标 —— 先右后左，右邻就是「原来站在它右边那张」。
 * @param {number} anchorIndex stripOrder 里的参照下标
 * @param {string} [excludeId] 额外排除的页签 id（关闭场景传被关的那张，双保险）
 * @param {boolean} [includeViews] 视图页签算不算候选（调用方装不装得下视图 id，见上）
 * @returns {string|null} 可见页签 id；一个都没有（全部折叠）时 null
 */
export function findNextVisibleTab(anchorIndex, excludeId, includeViews = false) {
  const visibleAt = (i) => {
    const id = stripOrder[i]
    if (!id || id === excludeId) return null
    if (!isTabVisible(id)) return null
    if (isViewId(id) && !includeViews) return null
    return id
  }
  for (let i = Math.max(0, anchorIndex); i < stripOrder.length; i += 1) {
    const hit = visibleAt(i)
    if (hit) return hit
  }
  for (let i = Math.min(anchorIndex, stripOrder.length) - 1; i >= 0; i -= 1) {
    const hit = visibleAt(i)
    if (hit) return hit
  }
  return null
}

// 关闭激活页签的焦点回退注入（见 workspaceStore.closeFocus 的说明）：可见性判据
// 活在本模块，workspaceStore 不能反向 import 这里（会成环），所以是注入不是直调。
// 全折叠等「一张可见页签都没有」的极端情况返回 null —— closeTab 据此把焦点置 null
//（2026-10-20 审计改，「焦点必可见」铁律；原先退回「原下标顶上来」，可能指到折叠组里
// 藏着的页签，与十七改的折叠路径自相矛盾）。
//
// 这里**不传 includeViews**：这条路的结论要写进 activeId，装不下视图 id。邻居是视图页签时
// 它照旧只认文件（找不到就给 null），而「焦点其实该交给那张视图」由 tabFlow.closeTabItem
// 在更上一层结算 —— 它拿 includeViews=true 重算一次，两队结论不会打架：closeTabItem 只在
// 「关的正是焦点」时接手，而它选出的邻居只可能比这里更近，不会更远。
closeFocus.pick = (closedId, index) => findNextVisibleTab(index, closedId)

/**
 * 把页签挪到组的旁边（保持连续性）。已在组旁（与任一成员相邻）就不动 ——
 * 右键加组时那张页签多半在别处，Chrome 的做法是把它挪过来。
 */
function relocateIntoRun(tabId, gid) {
  const members = membersOf(gid).filter((x) => x !== tabId)
  if (!members.length) return
  const at = stripOrder.indexOf(tabId)
  if (members.some((m) => Math.abs(stripOrder.indexOf(m) - at) === 1)) return
  // moveStripItem 的 insertIndex 契约是「去掉被挪项」的列表：找到最后一个成员在那份
  // 列表里的位置，插到它右边（即整段组的末尾）。
  const rest = stripOrder.filter((x) => x !== tabId)
  const lastAt = Math.max(...members.map((m) => rest.indexOf(m)))
  moveStripItem(tabId, lastAt + 1)
}

/** 把页签加进已有的组（会挪到组旁）；已是本组成员则什么都不做 */
export function addToGroup(tabId, gid) {
  const g = groupOfId(gid)
  if (!g || isViewId(tabId)) return
  if (tabGroups.memberOf[tabId] === gid) return
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
  const at = stripOrder.indexOf(draggedId)
  if (at === -1) return
  const prevG = joinableGroupAt(at - 1)
  const nextG = joinableGroupAt(at + 1)
  const mine = groupOf(draggedId)

  if (mine) {
    const others = membersOf(mine.id).filter((x) => x !== draggedId)
    if (others.length && !others.some((m) => Math.abs(stripOrder.indexOf(m) - at) === 1)) {
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

/** 条带第 i 格上那个「可以把页签吸进去」的组；折叠着的组返回 null（理由见 syncAfterDrop） */
function joinableGroupAt(i) {
  const g = groupOf(stripOrder[i])
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
      if (stripOrder.indexOf(id) === -1 || stripOrder.indexOf(prev) === -1) continue
      if (stripOrder.indexOf(id) !== stripOrder.indexOf(prev) + 1) moveAfter(id, prev)
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
