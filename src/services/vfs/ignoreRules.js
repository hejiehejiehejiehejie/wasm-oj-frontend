/**
 * 本机文件夹工作区里「哪些条目不该进树、也不该进沙箱」的**唯一出处**。
 *
 * Rust 侧 `fs_scan` 只收参数（`{ dotFiles, dirNames }`）、不写死策略 —— 免得同一套
 * 过滤规则在 JS 与 Rust 两边各维护一份。所以这里的常量与 [`isIgnoredEntry`] 才是权威：
 * `LocalFolderVFSProvider` 组装 `fs_scan` 参数用它，`runnoFs` 决定沙箱收录范围时也用它。
 */

import { dirname } from './paths.js'
import { SIDECAR_DIR } from './workspaceSidecar.js'

/**
 * 额外拒绝的目录名（按单级名字比，不看层级）。
 *
 * 里面其实都点开头，也都会被下面「点开头一律跳过」那条规则挡住 —— 但**显式列出来**是有意的：
 * 这三样是「一定不能进功能性名单」的硬约束（`.git` 是版本库、`node_modules` 是依赖、
 * `.unnamed/` 是本方案自己的 sidecar），写死在这里，日后调过滤宽窄时不会顺手把它们放进来。
 */
export const DIR_DENY = ['.git', 'node_modules', SIDECAR_DIR]

/**
 * 该条目是否不进树 / 不进沙箱。
 *
 * 规则：点开头的一律跳过（`.git`、`.unnamed`、`.env`、`.DS_Store` …），
 * 或命中 {@link DIR_DENY}。参数是**单级名字**，不是路径。
 *
 * @param {string} name
 * @returns {boolean}
 */
export function isIgnoredEntry(name) {
  const text = String(name ?? '')
  if (text.startsWith('.')) return true
  return DIR_DENY.includes(text)
}

/**
 * `fs_scan` 命令的过滤参数形态（见 src-tauri/src/workspace.rs 的 `IgnoreRules`）。
 * @returns {{ dotFiles: boolean, dirNames: string[] }}
 */
export function scanIgnore() {
  return { dotFiles: true, dirNames: [...DIR_DENY] }
}

// ------------------------------------------------------------------ 沙箱收录限流

/**
 * 本机文件夹模式下，一次运行最多往沙箱里塞多少个文件 / 多少字节。
 *
 * 虚拟工作区的树是自己长出来的，规模有数；真实目录里可能是一个上万文件的仓库 ——
 * 整棵树读进内存、再结构化克隆给 WASI worker，会把「点一下运行」变成一次卡死。
 * 这是**安全网**而不是主规则，主规则是下面的 {@link sandboxFiles}。
 */
export const SANDBOX_MAX_FILES = 512
export const SANDBOX_MAX_BYTES = 16 * 1024 * 1024

/**
 * 本机文件夹模式下，哪些文件该进沙箱。
 *
 * 规则（方案已锁定）：**活跃文件所在的那一级目录里的文件 + 根级文件**。
 * 这一条刚好覆盖两种最常见的多文件用法 —— Python 的 `import helper`（同目录的 helper.py）
 * 与 C++ 的 `#include "helper.h"`（同目录头文件），同时把仓库里其余部分挡在外面。
 *
 * 顺序即优先级：活跃文件所在目录里的文件在前，随后是根级文件，同级按路径排序。
 * 于是「撞上限时谁被挡掉」是确定且可复现的，不会随目录遍历次序抖动。
 * 目录本身不进表（runno 的 fs 是「路径 → 文件」平表，父目录由路径隐含）。
 *
 * @param {import('./BaseVFSProvider.js').VFSNode[]} tree 根的子节点（getTree 的返回）
 * @param {string} activePath 活跃文件的绝对路径；拿不到时按根目录算
 * @returns {import('./BaseVFSProvider.js').VFSNode[]}
 */
export function sandboxFiles(tree, activePath) {
  const activeDir = activePath ? dirname(activePath) : '/'
  const files = []
  const walk = (nodes) => {
    for (const node of nodes) {
      if (node.type === 'file') files.push(node)
      else if (node.children?.length) walk(node.children)
    }
  }
  walk(tree)

  const rank = (node) => (dirname(node.path) === activeDir ? 0 : 1)
  const picked = files
    .filter((node) => rank(node) === 0 || dirname(node.path) === '/')
    .sort((a, b) => rank(a) - rank(b) || a.path.localeCompare(b.path))

  const capped = []
  let bytes = 0
  for (const node of picked) {
    const size = Number(node.size ?? 0)
    if (capped.length >= SANDBOX_MAX_FILES || bytes + size > SANDBOX_MAX_BYTES) break
    bytes += size
    capped.push(node)
  }
  if (capped.length < picked.length) {
    console.warn(
      `[workspace] 沙箱只收录了 ${capped.length}/${picked.length} 个文件` +
        `（上限 ${SANDBOX_MAX_FILES} 个 / ${SANDBOX_MAX_BYTES} 字节）`,
    )
  }
  return capped
}
