/**
 * treeOps —— 文件树的结构性操作（重名排号 / 移动 / 复制 / 递归建目录）。
 *
 * 一律以 `vfs` 为入参、自身不持有状态，好让 store、组件与导入流程共用同一份口径。
 * 【纪律】这些函数只调 provider 的公开方法（rename / createFile / setMeta …），
 * 不直接改响应式的 tree —— 树的刷新照旧由 provider 的 reset 事件驱动（见 workspaceStore）。
 */
import { stem, isWithin, join } from './paths.js'

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
  // ⚠️ 拆主干必须用 `stem`（**收单级名称**），**不能**用 `extname` ——
  // 后者收的是路径，内部走 `basename` → `normalize`，拿到 `'a.cpp'` 会直接抛
  // 「VFS 只支持绝对路径」（两个函数的签名刻意不同，见 paths.js 的 stem 注释）。
  // 2026-10-12 发现：这一行原先写的正是 `extname(name)`，只在**撞名**时才走到，
  // 所以从「新建文件」（默认名自己排号）到「拖拽移动」都没碰上，直到导入功能开始
  // 频繁撞名才现形（症状：重名导入报「没有可导入的文件」，failed=1）。
  const base = type === 'file' ? stem(name) : name
  const ext = name.slice(base.length)
  for (let index = 2; index < MAX_NAME_ATTEMPTS; index += 1) {
    const candidate = `${base}-${index}${ext}`
    if (!(await vfs.stat(join(dirPath, candidate)))) return candidate
  }
  return `${base}-${Date.now().toString(36)}${ext}`
}

/**
 * 去掉「祖先也在名单里」的那些项：同时选了 `a/` 与 `a/b.cpp` 时只留 `a/`。
 *
 * 两个调用方都需要它，理由各自不同：
 * - **删除**：删目录是递归的，留着的子项第二次去删时路径已经不存在，平白报一次错；
 * - **导出**：同一个文件会被打两遍 —— 落进 zip 就是两条同名条目（解压时后者盖前者，
 *   看起来「没事」，但包是错的）。
 *
 * `collectExport` 内部**自己也会调一次**（外面 FileExplorer 的 `selectionFor` 已经过了一道）：
 * 它是导出的公开入口，谁调都得拿到不重不漏的一份，不能把去重寄在调用方的自觉上。
 *
 * @param {object[]} nodes 节点对象（只用到 `path`）
 * @returns {object[]}
 */
export function pruneNestedNodes(nodes) {
  const paths = nodes.map((node) => node.path)
  // isWithin(dirPath, maybeChild)：前一个是目录。这里问的是「名单里另一项是这一条的祖先目录吗」
  return nodes.filter(
    (node) => !paths.some((path) => path !== node.path && isWithin(path, node.path)),
  )
}
