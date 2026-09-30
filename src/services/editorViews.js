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
import { computed, reactive, watch } from 'vue'
import { workspace } from './vfs/workspaceStore.js'

/** 全部合成视图 id。顺序无关紧要：页签栏里各自渲染，谁在前面由组件决定 */
export const EDITOR_VIEW_IDS = ['settings', 'cfPicker']

/** 每个视图两个开关：open=页签在不在页签栏里，active=视图有没有正盖在编辑器上 */
const state = reactive({
  settings: { open: false, active: false },
  cfPicker: { open: false, active: false },
})

/** 点视图入口 / 点它的页签：亮出这一个，其余一律让开（它们铺在同一层） */
function show(id) {
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
}

/** 切回代码视图：只让开，不关页签 */
export function deactivateViews() {
  for (const view of EDITOR_VIEW_IDS) state[view].active = false
}

/** 此刻有没有合成视图正盖着编辑器（Monaco / 空态 / 状态栏 / 题解工具栏都据此让位） */
export const viewActive = computed(() => EDITOR_VIEW_IDS.some((id) => state[id].active))

// ------------------------------------------------------------------ 设置

export const settingsTab = state.settings

/** 点设置入口（顶栏齿轮 / 窄屏菜单项）：没开就开，被切走了就切回来。关只归页签上的 × 管 */
export function openSettingsTab() {
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
watch(() => workspace.activeId, deactivateViews)
