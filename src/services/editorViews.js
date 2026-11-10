/**
 * editorViews —— 编辑区里的「合成视图」页签状态（设置 / Codeforces）。
 *
 * 【什么是合成视图】它们长得跟代码文件页签一模一样、排在文件页签之后，但**不是**
 * 真实的 VFS 节点：没有 model、不在文件树里。刻意**不**塞进 workspaceStore / openTabIds：
 * 那边的 openTabIds、nodeIndex、会话恢复全都建立在「页签 = 一个真实 VFS 节点」之上，
 * 放一个没有节点的 id 进去，rebuildTree 会把它当成「文件已删除」顺手清掉，
 * modelManager 也会去 release 一个不存在的 model。
 *
 * 所以这里是纯 UI 状态：不进树、不建 model。
 *
 * 【2026-11-08 起落盘】原先这里刻意不持久化（刷新即回到代码文件）。用户报「刷新后
 * 设置 / Codeforces 页签凭空消失」，于是改记 `cp.editorViews`：**开着的视图与其先后次序**
 * 与**哪一个正盖着编辑器**，刷新后原样摆回来。没开的一个都不写，关光了存档就是空表 ——
 * 「不恢复」这件事仍然成立，只是不再由「一律不存」来实现。
 *
 * 为什么不塞进 workspaceStore 的会话键：视图不是节点，那份状态的所有判据都建立在
 * 「页签 = 真实 VFS 节点」之上（见上一段）；也正因为分在两处，「文件页签全没了但视图还开着」
 * 才能成立。
 *
 * 恢复的**时机**是硬约束：必须在 `initWorkspaceStore()` 之后（App.vue 的 onMounted 里调
 * `restoreEditorViews()`）。早一步的话，会话恢复把 `workspace.activeId` 设回上次那个文件，
 * 下面那条「活跃文件一变就让开」的 watch 会立刻把刚恢复的活跃视图让开。
 *
 * 【为什么合成一张表】视图铺在编辑器内容的同一层（见 EditorPane 的 stage），
 * 同一时刻只能有一个：切到设置就得把抽题收起来，反之亦然。用一张 EDITOR_VIEWS
 * 表统一收口「只让一个 active」，比每个视图各写一遍互斥逻辑安全得多。
 * 弹窗式的做法（Teleport 到 body）在 2026-10 被替换掉：与设置同形态更贴本项目的界面语言，
 * 也不会遮住工作区。
 *
 * 【加一种视图要动哪里】只有两处：下面 EDITOR_VIEWS 加一行（id / 图标 / 文案 key），
 * 以及 EditorPane 的 stage 里给它一格渲染（外加它自己的入口按钮）。
 * **流转一概不用改** —— 焦点、关闭交接、排序、拖动都是按「条带上的一个 id」办事的，
 * 见 services/tabFlow.js；本文件只回答「有哪些视图、各自开着没、谁盖着编辑器」。
 */
import { computed, reactive, ref, watch } from 'vue'
import { codeViewIntent, workspace } from './vfs/workspaceStore.js'

/**
 * 合成视图的**登记表** —— 这是「有哪些视图」的唯一出处（顺序见 tabStrip.stripOrder）。
 *
 * 每条只写界面需要的几样：id、图标名（AppIcon 的 name）、描边粗细（可省，省了用 AppIcon 的默认 2）、
 * 文案 key。**不写死译名**：数据表里存 key、由消费处（EditorTabs 的 viewMeta）现 `t()`，切语言才跟着变
 * （见 HANDOFF 第 5 节坑 28）。
 *
 * 刻意**不含**任何流转信息（怎么开、怎么关、焦点归谁）：那些对所有视图完全一致，
 * 收在 services/tabFlow.js。要加一种视图时，除了这里加一行，只需再给它一格渲染
 * （EditorPane 的 stage）与一个入口。
 */
export const EDITOR_VIEWS = [
  {
    id: 'settings',
    icon: 'gear',
    // 页签里这枚齿轮单独加粗一档（AppIcon 默认为 2）。页签图标只有 12px，同排的 cpp / python /
    // markdown 是实心字标、墨色本来就重，Lucide 标准的 2 号线在中间显得偏淡 —— 只在本页签
    // 提高描边，别动全站默认值。
    strokeWidth: 2.4,
    labelKey: 'app.settings',
    closeLabelKey: 'app.tabs.closeSettings',
  },
  {
    id: 'codeforces',
    icon: 'codeforces',
    labelKey: 'cf.view.title',
    closeLabelKey: 'cf.tab.close',
  },
]

/** 全部合成视图 id（由登记表派生，别另抄一份） */
export const EDITOR_VIEW_IDS = EDITOR_VIEWS.map((view) => view.id)

/** 按 id 取登记项；认不出来的 id 返回 null（调用方据此判「这不是视图」） */
export function viewOf(id) {
  return EDITOR_VIEWS.find((view) => view.id === id) ?? null
}

/**
 * 存档键：`{ order: string[], active: string|null }`。
 * `order` 既是**开着的视图**（成员）也是它们**彼此的先后**（viewOrder 就是这份东西）；
 * `active` 是那个正盖着编辑器的视图 id，没有就 null（= 编辑器露着代码）。
 *
 * 与本机的界面状态同一档（同 `cp.activityBarPins`）：**不进云同步白名单** ——
 * 换台设备重开时把上一台的开着的面板一并摆出来没有意义。
 */
const STORAGE_KEY = 'cp.editorViews'

/**
 * 读存档。认不出来的一律当没存过：
 * - 表里没有的 id（视图改名 / 旧存档）丢掉 —— 恢复一个不存在的视图，界面上是一颗点了没反应的页签；
 * - 重复 id 只留第一个（viewOrder 的不变式之一是成员唯一）；
 * - `active` 不在 `order` 里就归 null（存档被手改过时不能凭空点亮一个没开的视图）。
 *
 * @returns {{ order: string[], active: string|null }}
 */
function readSaved() {
  const fallback = { order: [], active: null }
  let value
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === null) return fallback
    value = JSON.parse(raw)
  } catch {
    // 隐私模式 / 存档损坏：当作没存过
    return fallback
  }
  if (!value || typeof value !== 'object') return fallback

  const order = Array.isArray(value.order)
    ? value.order.filter((id, index, all) => EDITOR_VIEW_IDS.includes(id) && all.indexOf(id) === index)
    : []
  const active = typeof value.active === 'string' && order.includes(value.active) ? value.active : null
  return { order, active }
}

/**
 * 已打开视图页签的顺序（谁先开谁靠左）。与文件页签「新开的排最后」同一条规矩：
 * 没开着的视图在 show() 时追加到最右；关掉时摘掉，再开就重新排到最后。
 * ⚠️ 2026-10-11 起这条序列**不再直接决定条带上的位置**：条带是一条文件 / 视图混排的序列
 * （services/tabStrip.js 的 stripOrder），拖动后的新位置由那里写回到这里 —— 本数组于是
 * 只表示**视图彼此之间的相对次序**，混排后的绝对位置不在这里。
 * 只记顺序，开关状态仍在 state 上。
 * @type {string[]}
 */
export const viewOrder = reactive([])

/**
 * 每个视图两个开关：open=页签在不在页签栏里，active=视图有没有正盖在编辑器上。
 * 由登记表派生 —— 加一种视图时这里**不用动**；两开关的读写一律走下面的 viewState / isViewOpen。
 */
const state = reactive(
  Object.fromEntries(EDITOR_VIEW_IDS.map((id) => [id, { open: false, active: false }])),
)

/** 某个视图的两个开关（认不出来的 id 返回 null，调用方不必自己判存在） */
export function viewState(id) {
  return state[id] ?? null
}

/** 这张视图页签开着没（焦点结算要跳过已经关掉、但 stripOrder 还没跟上的那一格） */
export function isViewOpen(id) {
  return state[id]?.open === true
}

/** 点视图入口 / 点它的页签：亮出这一个，其余一律让开（它们铺在同一层）。
 *  本来没开着的，这一次才排进 viewOrder 的最右 —— 已经开着的只是切活跃，顺序不动。 */
function show(id) {
  if (!state[id].open) viewOrder.push(id)
  for (const view of EDITOR_VIEW_IDS) {
    const entry = state[view]
    if (view === id) {
      entry.open = true
      entry.active = true
    } else {
      entry.active = false
    }
  }
}

/**
 * 关页签（× / 中键 / tabFlow 的关闭交接）：只摘掉这一个视图自己的两开关与次序。
 *
 * **它不负责「关完之后焦点给谁」** —— 那是 services/tabFlow.js 的 closeTabItem 的事：
 * 那边会按条带上的次序把焦点交给邻居（可能是另一个视图，也可能是一份代码）。
 * 本函数只被 closeTabItem 与各视图的「收起面板」入口调用。
 */
export function closeView(id) {
  if (!state[id]) return
  state[id].open = false
  state[id].active = false
  const at = viewOrder.indexOf(id)
  if (at !== -1) viewOrder.splice(at, 1)
}

/**
 * 拖动排序的**分部写回**（tabStrip.moveStripItem 转交）：整体替换 viewOrder 的顺序。
 * 条带现在是混排的一条序列，一次拖动可能同时改变多个视图的相对位置，所以不是「把某一个
 * 挪过去」而是整段重排；进来的 id 先按 EDITOR_VIEW_IDS 过滤并去重，碎片值掉不进来。
 *
 * ⚠️ 这里只改**顺序**，不改成员（增删走 closeView() / show()），否则会与 tabStrip 的成员同步
 * 互相推来推去。
 * @param {string[]} ids
 */
export function setViewOrder(ids) {
  const next = ids.filter((id, index, all) => EDITOR_VIEW_IDS.includes(id) && all.indexOf(id) === index)
  viewOrder.splice(0, viewOrder.length, ...next)
}

/** 切回代码视图：只让开，不关页签 */
export function deactivateViews() {
  for (const view of EDITOR_VIEW_IDS) state[view].active = false
}

/**
 * 按 id 打开 / 切到某个合成视图（只走视图自己的激活轴）。
 * 给「手里只有一个 stripOrder id」的调用方用 —— 现在基本只有 services/tabFlow.js 的
 * focusTab 会调它（它替调用方判类型），调用方不必自己拼各视图 activate 的分支。
 * @param {string} id
 */
export function activateView(id) {
  if (EDITOR_VIEW_IDS.includes(id)) show(id)
}

/** 此刻有没有合成视图正盖着编辑器（Monaco / 空态 / 状态栏 / 题解工具栏都据此让位） */
export const viewActive = computed(() => EDITOR_VIEW_IDS.some((id) => state[id].active))

/** 有没有合成视图页签开着（不管有没有盖着编辑器）。页签栏的去留看它而不是 viewActive：
 *  没有活跃文件、但页签还开着时，条也得留着 —— 否则关掉最后一个代码页签，
 *  这两颗页签会跟着整条横栏一起凭空消失（2026-10-10 修的正是这个）。 */
export const anyViewOpen = computed(() => EDITOR_VIEW_IDS.some((id) => state[id].open))

/**
 * 此刻正盖着编辑器的视图 id（都没有就是 null，编辑器露着代码）。
 * 这是「焦点在哪」的**视图半边**：与 workspace.activeId 合起来才是完整答案，
 * 合成的地方是 services/tabFlow.js 的 focusedTabId（那个才是调用方该读的）。
 */
export function activeViewId() {
  return EDITOR_VIEW_IDS.find((id) => state[id].active) ?? null
}

// ------------------------------------------------------------ 跨刷新记着

/**
 * 存档闸门：`restoreEditorViews()` 跑之前**绝不写盘**。
 *
 * 少了它，启动那一刻的空状态（一条 viewOrder 都没恢复）会先把存档覆盖掉，用户下次刷新
 * 就再也恢复不出东西来 —— 与 workspaceStore 的 `workspace.ready` 同一个理由、同一道闸。
 */
let persistReady = false

function persist() {
  if (!persistReady) return
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ order: [...viewOrder], active: activeViewId() }),
    )
  } catch {
    /* 隐私模式 / 配额满：只在本次会话里生效 */
  }
}

/**
 * 任何一处改动都写一次盘：开 / 关（成员）、切活跃（哪个盖着编辑器）、拖动换位（先后）。
 * 一次动作可能同时改到其中两三项，watch 的回调是批量的，所以只会落一次。
 *
 * `open` 也一起盯：正常情况下它与 viewOrder 同进同退（show 先 push 再置 open、closeView 反之），
 * 但同一次事件里两者各自变过一次的话，只盯 viewOrder 会漏掉「只剩 open 变了」的那一帧 ——
 * 而存档要的正是「哪些开着」，宁可多盯一个数组。
 */
watch(
  () => ({
    order: [...viewOrder],
    open: EDITOR_VIEW_IDS.map((id) => state[id].open),
    active: activeViewId(),
  }),
  persist,
)

/**
 * 把上次会话的视图页签摆回来。**必须**在 `initWorkspaceStore()` 之后调用（App.vue 的
 * onMounted 里）：会话恢复会把 `workspace.activeId` 设回上次那个文件，而本文件末尾那条
 * 「活跃文件一变就让开」的 watch 会立刻把刚恢复的活跃视图按下去 —— 早一步恢复等于白恢复。
 *
 * 恢复的内容只有两样：**哪几个视图页签开着（连同它们的先后）**、**哪一个正盖着编辑器**。
 * 页签在条带上的**绝对位置**不恢复（stripOrder 不落盘）：文件页签按 openTabIds 先排好，
 * 视图按这里恢复出的先后追加到最右端，与「新开的视图页签一律排在最后」是同一条规矩。
 * 拖到两个文件中间去的视图，刷新后会回到最右 —— 那是这条降级的代价，不是遗漏。
 */
export function restoreEditorViews() {
  const saved = readSaved()
  const order = [...saved.order]

  viewOrder.splice(0, viewOrder.length, ...order)
  for (const id of EDITOR_VIEW_IDS) {
    state[id].open = order.includes(id)
    // 同一时刻只亮一个：存档里的 active 就是上一次盖着编辑器的那个（没有则都不亮）
    state[id].active = id === saved.active
  }

  // 恢复完才开闸 —— 上面这几行改动自己也会触发 persist，写回去的正是刚读出来的那一份，无害
  persistReady = true
}


// ------------------------------------------------------------------ 设置

export const settingsTab = state.settings

/**
 * 侧栏设置菜单选中某分类后要落到的位置。菜单（SidebarSwitcher）在 openSettingsTab(sectionId)
 * 时把 id 写进来，EditorSettingsPanel 用 watch 消费它并把 activeSection 定位到对应分类；
 * 消费完复位为 null，保证「下次从别处打开设置页签」不被上一次的菜单选择牵着走。
 * 只存 id、不落 localStorage：这是纯 UI 跳转状态，一次性消费完就复位（页签本身要不要跨会话，
 * 见上面的 `cp.editorViews`，那是两件事：落盘的是「开着哪几个」，不是「菜单刚点了哪一类」）。
 */
export const settingsSectionEntry = ref(null)

/**
 * 点设置入口（齿轮菜单 / 窄屏菜单项 / 侧栏设置菜单）：没开就开，被切走了就切回来。
 * 侧栏菜单点某项时带上 sectionId：先把落点记进 settingsSectionEntry，再打开设置页签让它落到那一类。
 *
 * 【这个入口 = 「把设置亮出来」，不是「关」】页签上的 × 与中键走 services/tabFlow.js 的
 * closeTabItem（关掉之后焦点交给邻居）；而「收起面板」类入口（侧栏那颗齿轮再点一次、
 * 设置快捷键再按一次）走下面的 closeSettingsTab / deactivateSettingsTab —— 那是
 * 「离开设置、回到代码」，与「关一张页签」是两种意图，别混。
 */
export function openSettingsTab(sectionId) {
  if (sectionId) settingsSectionEntry.value = sectionId
  show('settings')
}

/** 收起设置（回到代码）。与页签上的 × 不同：这里不搬焦点，只让开 —— 语义是「关掉这个面板」 */
export function closeSettingsTab() {
  closeView('settings')
}

/** 让设置视图让开（切文件、拖文件进来、抽中题目要跳过去时用） */
export function deactivateSettingsTab() {
  state.settings.active = false
}

// ------------------------------------------------- Codeforces（可选模块）
// 抽题与比赛 2026-10-27 合并成同一个合成视图：一个页签、一个入口，模式切换在组件内部
// （先塞到一起，UI 之后再设计）。show() 仍负责与设置互斥。

export const codeforcesTab = state.codeforces

export function openCodeforcesTab() {
  show('codeforces')
}

/** 收起 Codeforces（模块没装好 / 抽完题要跳去看代码时用）。焦点结算归 tabFlow，见上 */
export function closeCodeforcesTab() {
  closeView('codeforces')
}

// 「活跃文件变了」就等于用户想看代码：点资源管理器、点文件页签、会话恢复都走 activeId，
// 在这里统一收口，省得每个入口各自记得把视图让开（漏一个就会出现「点了文件还在看设置」）。
// activeId 变成 null 只发生在「最后一个代码页签被关掉 / 活跃文件被删 / 折叠组的全折叠兜底」：
// 没有代码可看，开着的视图就留在原地（页签栏的收放看条带里还有没有东西，不看 activeId ——
// 见 EditorPane.stripEmpty）。
watch(
  () => workspace.activeId,
  (id) => {
    if (id) deactivateViews()
  },
)

// 上面那条 watch 有个够不着的角：**同一个文件再点一次**时 activeId 前后相同、watch 不触发，
// 而屏幕上完全可能是设置 / 抽题页（文件树焦点停在那文件上、编辑器却是视图）。所以真正的收口
// 点是 `workspaceStore.openFile()` ——「打开某个文件」这个意图本身，与 activeId 变不变无关。
// 那边不能反向 import 本模块（成环），于是在这里把 deactivateViews 注册进去。
// 两条路都留着：这条管「点开文件」的所有入口（树行单击 / 拖入 / 以后新加的），
// watch 管「不经 openFile 也要切回代码」的那些（会话恢复、关掉最后一个代码页签后的回退）。
codeViewIntent.show = deactivateViews
