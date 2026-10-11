/**
 * editorViews —— 编辑区里的「合成视图」页签状态（设置 / Codeforces 抽题）。
 *
 * 【什么是合成视图】它们长得跟代码文件页签一模一样、排在文件页签之后，但**不是**
 * 真实的 VFS 节点：没有 model、不在文件树里。刻意**不**塞进 workspaceStore / openTabIds：
 * 那边的 openTabIds、nodeIndex、会话恢复全都建立在「页签 = 一个真实 VFS 节点」之上，
 * 放一个没有节点的 id 进去，rebuildTree 会把它当成「文件已删除」顺手清掉，
 * modelManager 也会去 release 一个不存在的 model。
 *
 * 所以这里是纯 UI 状态：不进树、不建 model、不落 localStorage。
 * 刷新后回到代码文件是预期行为 —— 这些视图没有「未保存内容」，不值得跨会话恢复。
 *
 * 【为什么合成一张表】视图铺在编辑器内容的同一层（见 EditorPane 的 stage），
 * 同一时刻只能有一个：切到设置就得把抽题收起来，反之亦然。用一张 EDITOR_VIEW_IDS
 * 表统一收口「只让一个 active」，比每个视图各写一遍互斥逻辑安全得多。
 * 弹窗式的做法（Teleport 到 body）在 2026-10 被替换掉：与设置同形态更贴本项目的界面语言，
 * 也不会遮住工作区。
 */
import { computed, reactive, ref, watch } from 'vue'
import { workspace } from './vfs/workspaceStore.js'

/** 全部合成视图 id。这里只回答「有哪些视图」，**不决定页签顺序**（顺序见 tabStrip.stripOrder） */
export const EDITOR_VIEW_IDS = ['settings', 'cfPicker']

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

/** 每个视图两个开关：open=页签在不在页签栏里，active=视图有没有正盖在编辑器上 */
const state = reactive({
  settings: { open: false, active: false },
  cfPicker: { open: false, active: false },
})

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

/** 关页签（× 或中键）：代码视图随即回到 workspace.activeId 指向的文件 */
function close(id) {
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
 * ⚠️ 这里只改**顺序**，不改成员（增删走 close() / show()），否则会与 tabStrip 的成员同步
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

/** 此刻有没有合成视图正盖着编辑器（Monaco / 空态 / 状态栏 / 题解工具栏都据此让位） */
export const viewActive = computed(() => EDITOR_VIEW_IDS.some((id) => state[id].active))

/** 有没有合成视图页签开着（不管有没有盖着编辑器）。页签栏的去留看它而不是 viewActive：
 *  没有活跃文件、但页签还开着时，条也得留着 —— 否则关掉最后一个代码页签，
 *  这两颗页签会跟着整条横栏一起凭空消失（2026-10-10 修的正是这个）。 */
export const anyViewOpen = computed(() => EDITOR_VIEW_IDS.some((id) => state[id].open))

// ------------------------------------------------------------------ 设置

export const settingsTab = state.settings

/**
 * 侧栏设置菜单选中某分类后要落到的位置。菜单（SidebarSwitcher）在 openSettingsTab(sectionId)
 * 时把 id 写进来，EditorSettingsPanel 用 watch 消费它并把 activeSection 定位到对应分类；
 * 消费完复位为 null，保证「下次从别处打开设置页签」不被上一次的菜单选择牵着走。
 * 只存 id、不落 localStorage：这是纯 UI 跳转状态，与页签本身一样不值得跨会话恢复。
 */
export const settingsSectionEntry = ref(null)

/**
 * 点设置入口（顶栏齿轮 / 窄屏菜单项 / 侧栏设置菜单）：没开就开，被切走了就切回来。关只归页签上的 × 管。
 * 侧栏菜单点某项时带上 sectionId：先把落点记进 settingsSectionEntry，再打开设置页签让它落到那一类。
 */
export function openSettingsTab(sectionId) {
  if (sectionId) settingsSectionEntry.value = sectionId
  show('settings')
}

export function closeSettingsTab() {
  close('settings')
}

/** 点页签本体 */
export function activateSettingsTab() {
  show('settings')
}

/** 让设置视图让开（切文件、拖文件进来、抽中题目要跳过去时用） */
export function deactivateSettingsTab() {
  state.settings.active = false
}

// ------------------------------------------------- Codeforces 抽题（可选模块）

export const cfPickerTab = state.cfPicker

export function openCfPickerTab() {
  show('cfPicker')
}

export function closeCfPickerTab() {
  close('cfPicker')
}

export function activateCfPickerTab() {
  show('cfPicker')
}

export function deactivateCfPickerTab() {
  state.cfPicker.active = false
}

// 「活跃文件变了」就等于用户想看代码：点资源管理器、点文件页签、会话恢复都走 activeId，
// 在这里统一收口，省得每个入口各自记得把视图让开（漏一个就会出现「点了文件还在看设置」）。
// activeId 变成 null 只发生在「最后一个代码页签被关掉 / 活跃文件被删」：没有代码可看，
// 开着的视图就留在原地 —— 收掉只会让页签栏跟着塌掉（见 EditorPane.editorEmpty）。
watch(
  () => workspace.activeId,
  (id) => {
    if (id) deactivateViews()
  },
)
