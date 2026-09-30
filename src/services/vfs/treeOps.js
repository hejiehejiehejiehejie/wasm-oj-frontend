/**
 * treeOps —— 文件树的结构性操作（重名排号 / 移动 / 复制 / 递归建目录）。
 *
 * 一律以 `vfs` 为入参、自身不持有状态，好让 store、组件与导入流程共用同一份口径。
 * 【纪律】这些函数只调 provider 的公开方法（rename / createFile / setMeta …），
 * 不直接改响应式的 tree —— 树的刷新照旧由 provider 的 reset 事件驱动（见 workspaceStore）。
 */
import { extname, join } from './paths.js'

/** 重名往后排多少次还不空就退回带时间戳的保底名（与 problemImport 同一口径） */
const MAX_NAME_ATTEMPTS = 50

/**
 * 在目标目录里取一个没被占用的名字：撞名就依次排 name-2、name-3……
 *
 * 与 FileExplorer「新建」时的默认名是同一个口径，区别是这里问的是**真实 VFS**（逐次 stat），
 * 而不是组件手上那棵树（它可能还没跟上最近一次变更）。
 *
 * 后缀对**文件**插在扩展名之前（`a.cpp` → `a-2.cpp`）；目录名里的点不算扩展名
 * （`v1.2` 该变 `v1.2-2`），所以目录一律整个名字后面接。
 *
 * @param {import('./BaseVFSProvider.js').BaseVFSProvider} vfs
 * @param {string} dirPath 目标目录的绝对路径
 * @param {string} name 想要的名字（单级名）
 * @param {'file'|'directory'} [type] 默认按文件处理（扩展名分段）
 * @returns {Promise<string>}
 */
export async function uniqueNameIn(vfs, dirPath, name, type = 'file') {
  if (!(await vfs.stat(join(dirPath, name)))) return name
  const ext = type === 'file' ? extname(name) : ''
  const base = ext ? name.slice(0, -ext.length) : name
  for (let index = 2; index < MAX_NAME_ATTEMPTS; index += 1) {
    const candidate = `${base}-${index}${ext}`
    if (!(await vfs.stat(join(dirPath, candidate)))) return candidate
  }
  return `${base}-${Date.now().toString(36)}${ext}`
}
