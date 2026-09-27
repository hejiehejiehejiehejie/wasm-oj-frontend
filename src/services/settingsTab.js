/**
 * settingsTab —— 「设置」这个合成页签的状态。
 *
 * 设置现在不是浮层，而是编辑器里与代码文件平级的一个页签，所以它的开关状态
 * 得有个地方放。刻意**不**塞进 workspaceStore / openTabIds：
 * 那边的 openTabIds、nodeIndex、会话恢复全都建立在「页签 = 一个真实 VFS 节点」之上，
 * 放一个没有节点的 id 进去，rebuildTree 会把它当成「文件已删除」顺手清掉，
 * modelManager 也会去 release 一个不存在的 model。
 *
 * 所以这里是纯 UI 状态：不进树、不建 model、不落 localStorage。
 * 刷新后回到代码文件是预期行为 —— 设置没有「未保存内容」，不值得跨会话恢复。
 */
import { reactive, watch } from 'vue'
import { workspace } from './vfs/workspaceStore.js'

export const settingsTab = reactive({
  /** 页签是否出现在页签栏里 */
  open: false,
  /** 设置视图是否正在编辑器里显示（open 为 false 时它必然也是 false） */
  active: false,
})

/** 点设置入口（顶栏齿轮 / 窄屏菜单项）：没开就开，被切走了就切回来。关只归页签上的 × 管 */
export function openSettingsTab() {
  settingsTab.open = true
  settingsTab.active = true
}

/** 关页签（× 或中键）：代码视图随即回到 workspace.activeId 指向的文件 */
export function closeSettingsTab() {
  settingsTab.open = false
  settingsTab.active = false
}

/** 点页签本体 */
export function activateSettingsTab() {
  settingsTab.open = true
  settingsTab.active = true
}

/** 切回代码视图 */
export function deactivateSettingsTab() {
  settingsTab.active = false
}

// 「活跃文件变了」就等于用户想看代码：点资源管理器、点文件页签、会话恢复都走 activeId，
// 在这里统一收口，省得每个入口各自记得把设置让开（漏一个就会出现「点了文件还在看设置」）。
watch(() => workspace.activeId, deactivateSettingsTab)
