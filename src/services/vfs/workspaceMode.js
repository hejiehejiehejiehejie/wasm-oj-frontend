/**
 * 工作区模式 —— 「这次启动开的是虚拟工作区还是本机文件夹」的唯一读写处。
 *
 * 【为什么用「写盘 + 重新加载」这种笨办法】两种工作区是两套完全不同的存储后端，从 VFS 切到
 * 真文件夹要换 provider、换 id 空间、换页签会话。就地热切换等于给启动链再写一条平行的初始化
 * 路径，得逐个重置十来个模块级单例（VFS 单例、model 索引、页签、评测面板…）。直接把选择写进
 * localStorage 再 `location.reload()`，让下一次启动**原样重走现成的启动链**，是这里最稳的做法。
 *
 * 键名（`cp.workspaceMode` / `cp.workspaceRoot`）的唯一出处是 services/storageNames.js；
 * 两者**都不进云同步白名单**（见 cloudProfile.js 的 SYNC_KEYS 说明）。
 */
import { flush } from '../autoSave.js'
import { WORKSPACE_MODE_KEY, WORKSPACE_ROOT_KEY } from '../storageNames.js'
import { IS_ANDROID, IS_DESKTOP } from '../platform.js'
import { flushSidecar } from './workspaceSidecar.js'

/** 本机文件夹工作区只在 macOS / Windows 的 Tauri 壳里成立（Android 走 SAF，见方案文件） */
export const CAN_USE_LOCAL_FOLDER = IS_DESKTOP && !IS_ANDROID

/** 虚拟工作区（IndexedDB），默认模式，网页版与 Android 只有这一种 */
export const MODE_VIRTUAL = 'vfs'
/** 本机文件夹工作区，仅桌面端可选 */
export const MODE_FOLDER = 'folder'

/**
 * 当前工作区模式。存储不可用、或值不认识时一律回落到虚拟工作区。
 * @returns {'vfs'|'folder'}
 */
export function getWorkspaceMode() {
  // 网页版 / Android 上不存在本机文件夹这回事，即便 localStorage 里残留了 'folder' 也不认，
  // 免得脏值把这两个平台带进一条只有桌面端才有的初始化路径。
  if (!CAN_USE_LOCAL_FOLDER) return MODE_VIRTUAL
  try {
    return window.localStorage.getItem(WORKSPACE_MODE_KEY) === MODE_FOLDER ? MODE_FOLDER : MODE_VIRTUAL
  } catch {
    return MODE_VIRTUAL
  }
}

/**
 * 本机文件夹工作区的根（磁盘绝对路径）；没开过文件夹模式时是空串。
 * @returns {string}
 */
export function getWorkspaceRoot() {
  try {
    return window.localStorage.getItem(WORKSPACE_ROOT_KEY) ?? ''
  } catch {
    return ''
  }
}

/**
 * 切换工作区并重新加载页面。
 *
 * 先 `flush()` 把编辑器里还没落盘的正文写回**当前**工作区 —— 否则这次切换会丢掉用户正在改的内容。
 * 写盘失败不阻断切换（flush 自身已吞掉异常），重载后仍照新选的模式启动。
 *
 * @param {'vfs'|'folder'} mode
 * @param {string} [root] 仅 folder 模式需要：要打开的文件夹绝对路径
 * @returns {Promise<void>} 不 resolve（调用后页面即重载）
 */
export async function switchWorkspace(mode, root = '') {
  await flush()
  // 侧车写入是去抖排队的（见 workspaceSidecar.js）：这里等它落完，别让最后一批 id 随重载丢掉
  await flushSidecar()
  try {
    window.localStorage.setItem(WORKSPACE_MODE_KEY, mode === MODE_FOLDER ? MODE_FOLDER : MODE_VIRTUAL)
    if (mode === MODE_FOLDER && root) window.localStorage.setItem(WORKSPACE_ROOT_KEY, root)
  } catch {
    /* 写不进去：重载后仍回原模式，等于这次切换没发生（可接受，界面会照旧） */
  }
  window.location.reload()
}
