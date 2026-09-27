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
 * 这一层不认识语言，也不认识编译：它只产出一张 fs 表，谁用谁决定。
 */

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
 * 把整棵 VFS 拍平成 Runno 的 fs 映射。
 *
 * @param {{ overrides?: Record<string, string> }} [options]
 *   overrides 用来把「编辑器里还没落盘」的内容盖回对应路径（运行前会自动保存，
 *   这里是兜底：保存失败或用户手快时，跑的仍然是屏幕上看到的那份代码）。
 * @returns {Promise<Record<string, ReturnType<typeof fsEntry>>>}
 */
export async function vfsToRunnoFs({ overrides = {} } = {}) {
  const vfs = getVFS()
  const fs = {}
  await collect(vfs, await vfs.getTree(), fs)

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
