/**
 * VFS → Runno fs 转换层。
 *
 * 沙箱（runno / WASI）要的是一张「绝对路径 → 文件记录」的平表，而 VFS 存的是树
 * （IndexedDB 节点 + 内容分表，见 services/vfs）。这一层只做一件事：把树拍平成平表。
 *
 * 为什么必须整棵都进去，而不是只塞入口文件：
 * - Python 的 import 是运行时按 sys.path 逐个找文件的，`import helper` 要能在 fs 里
 *   看到 /helper.py；只给入口文件必然 ModuleNotFoundError。
 * - C++ 的 #include "helper.h" 同理，只不过那条线目前仍只编译活跃文件（见 HANDOFF）。
 *
 * 【本机文件夹为什么不整棵进】虚拟工作区的树是自己长出来的，规模有数；真实目录里可能是
 * 一个上万文件的仓库，整棵读进内存再克隆给 WASI worker 会把运行卡死。所以真文件夹模式下
 * 只收「活跃文件所在的那一级目录 + 根级文件」，并按上限封顶 —— 规则本身在 ignoreRules.js，
 * 这里只负责按那份清单读盘。
 *
 * 这一层不认识语言，也不认识编译：它只产出一张 fs 表，谁用谁决定。
 */

import { sandboxFiles } from './ignoreRules.js'
import { getVFS } from './vfsFactory.js'

// runno 只比对时间戳做「要不要写盘」的判断，给个固定值即可，不需要真实时钟
const TIME = new Date(0)

/**
 * 造一条 Runno WASI 的文件记录。
 * @param {string} path 绝对 POSIX 路径
 * @param {string|Uint8Array} content
 * @param {'string'|'binary'} [mode] 文本还是字节；不写编码的内容一律给 'binary'
 * @returns {{path: string, content: string|Uint8Array, mode: string, timestamps: {change: Date, access: Date, modification: Date}}}
 */
export function fsEntry(path, content, mode = 'string') {
  return { path, content, mode, timestamps: { change: TIME, access: TIME, modification: TIME } }
}

/**
 * 把 VFS 拍平成 Runno 的 fs 映射。
 *
 * @param {{ overrides?: Record<string, string>, entryPath?: string }} [options]
 *   overrides 用来把「编辑器里还没落盘」的内容盖回对应路径（运行前会自动保存，
 *   这里是兜底：保存失败或用户手快时，跑的仍然是屏幕上看到的那份代码）。
 *   entryPath 是入口文件的绝对路径，只有本机文件夹模式用得上：它决定沙箱收录哪一个目录
 *   （见 ignoreRules.js 的 sandboxFiles）。虚拟工作区照旧整棵收录。
 * @returns {Promise<Record<string, ReturnType<typeof fsEntry>>>}
 */
export async function vfsToRunnoFs({ overrides = {}, entryPath = '' } = {}) {
  const vfs = getVFS()
  const tree = await vfs.getTree()
  const fs = {}

  if (vfs.capabilities.realFolder) {
    for (const node of sandboxFiles(tree, entryPath)) {
      fs[node.path] = fsEntry(node.path, await vfs.readFile(node.path))
    }
  } else {
    await collect(vfs, tree, fs)
  }

  for (const [path, content] of Object.entries(overrides)) {
    fs[path] = fsEntry(path, String(content ?? ''))
  }
  return fs
}

/** 深度优先铺平一层层 children；getTree 只返回根的子节点，文档/目录都在里面 */
async function collect(vfs, nodes, fs) {
  for (const node of nodes) {
    if (node.type === 'file') {
      fs[node.path] = fsEntry(node.path, await vfs.readFile(node.path))
    } else if (node.children?.length) {
      await collect(vfs, node.children, fs)
    }
  }
}
