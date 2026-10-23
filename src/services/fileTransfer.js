/**
 * fileTransfer —— 把**本机的文件**与**工作区里的文件**互相搬运。
 *
 * 两个方向、三条通路，都在这里收口（组件只调本模块，不自己拼 File / Blob / invoke）：
 *
 * | 方向 | 通路 | 平台 |
 * |---|---|---|
 * | 导入 · 选文件 | 隐藏 `<input type="file">`（`multiple` / `webkitdirectory`） | 全部 |
 * | 导入 · 拖入 | `readDroppedItems()` 读系统拖放的 `DataTransfer`（目录靠 `FileSystemEntry` 递归） | 全部※ |
 * | 导出 · 落盘 | Rust 的 `export_*`（原生目录选择器 + 写盘） | 仅桌面壳 |
 * | 导出 · 下载 | `Blob` + `<a download>` | 全部 |
 *
 * ※ 桌面壳要在窗口配置里关掉 `dragDropEnabled`（见 `src-tauri/tauri.conf.json`），WebView
 * 才收得到 HTML5 拖放 —— 我们没用 Tauri 的原生 drop 事件，关掉不损失功能。
 *
 * 【为什么导出的「打包」与「落盘」分开】打包（zip）是纯前端的事、去哪都一样；落盘只有
 * 桌面壳做得到（Android 上 workspace.rs 根本不编译，网页版更不用说）。所以 `exportNodes()`
 * 只负责**把内容收集出来**，落点由调用方按平台决定 —— 组件据此在桌面端弹那张二选一的小卡片。
 *
 * 【二进制与超大文件一律跳过，不猜】口径与 Rust 侧 `workspace.rs` 完全一致：含 NUL 字节、
 * 或不是合法 UTF-8 就是二进制；超过 [`MAX_IMPORT_BYTES`] 就too large。VFS 存的是文本，
 * 塞二进制进去只会得到一堆乱码，跳过并如实报数是唯一诚实的选择（见 HANDOFF 第 7 节）。
 */
import { BROWSER_PLATFORM, IS_DESKTOP } from './platform.js'
import { dirname, join, normalize } from './vfs/paths.js'
import { uniqueNameIn, pruneNestedNodes } from './vfs/treeOps.js'
import { getVFS } from './vfs/vfsFactory.js'
import { buildZip } from './zip.js'

/** 与 Rust 的 `MAX_TEXT_BYTES` 同值：VFS 是文本工作区，再大就不搬了 */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024

/** 导入时单个目录最多建多少层（防一个畸形相对路径把树撑爆） */
const MAX_DEPTH = 32

// ------------------------------------------------------------ 小工具

/**
 * 触发一次下载。挂进 DOM 再点：部分浏览器只认「在文档里的」锚点，detached 的 click 会被忽略
 * （与 `codeImage.downloadImage` 同一条）。
 * @param {Blob} blob
 * @param {string} filename
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // 立刻 revoke 会让部分浏览器来不及取数据，等一帧之后再收
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

/**
 * 字节是不是二进制。与 Rust `looks_binary` 同口径：含 NUL、或不是合法 UTF-8。
 *
 * 差别只有一处：Rust 用 `error_len()` 把「结尾被切掉的半个字符」放行，JS 的 TextDecoder
 * 分不出这一种，一律按二进制跳过 —— 宁可少导入一个边角文件，也不要把乱码写进工作区。
 * @param {Uint8Array} bytes
 * @returns {boolean}
 */
export function isBinaryBytes(bytes) {
  if (bytes.includes(0)) return true
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return false
  } catch {
    return true
  }
}

/** @param {Date} date @returns {string} YYYY-MM-DD */
function isoDate(date) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * 一串路径的**公共父目录**。导出多个项时，zip 内的路径都相对它算 —— 于是
 * `/a/main.cpp` + `/b/x.cpp` 在包里是 `a/main.cpp` + `b/x.cpp`（跨目录不会撞名），
 * 单选 `/a/main.cpp` 在包里就是 `main.cpp`（不套多余的一层）。
 * @param {string[]} paths
 * @returns {string}
 */
export function commonParent(paths) {
  if (!paths.length) return '/'
  let shared = dirname(paths[0]).split('/').filter(Boolean)
  for (const path of paths.slice(1)) {
    const parts = dirname(path).split('/').filter(Boolean)
    let length = 0
    while (length < shared.length && length < parts.length && shared[length] === parts[length]) {
      length += 1
    }
    shared = shared.slice(0, length)
  }
  return '/' + shared.join('/')
}

// ------------------------------------------------------------ 导出：收集内容

/**
 * 一条待导出的记录：zip 内的相对路径 + 内容（目录条目没有内容）。
 * @typedef {Object} ExportEntry
 * @property {string} path zip 内的路径（正斜杠分隔；目录以 `/` 结尾）
 * @property {Uint8Array} [data]
 */

/**
 * 递归收集一个节点的内容。
 *
 * 读不出来的（本机文件夹里的二进制 / 超大文件）**跳过并计数**，不让一个文件把整趟导出带崩。
 *
 * @param {import('./vfs/BaseVFSProvider.js').BaseVFSProvider} vfs
 * @param {object} node
 * @param {string} path 该节点在 zip 内的路径
 * @param {ExportEntry[]} out
 * @param {{ files: number, skipped: number }} stats
 */
async function collectNode(vfs, node, path, out, stats) {
  if (node.type === 'directory') {
    // 目录条目要显式写一条：否则空目录在解压后不存在
    out.push({ path: `${path}/` })
    for (const child of node.children ?? []) {
      await collectNode(vfs, child, `${path}/${child.name}`, out, stats)
    }
    return
  }
  try {
    const text = await vfs.readFile(node.path)
    out.push({ path, data: new TextEncoder().encode(text) })
    stats.files += 1
  } catch {
    stats.skipped += 1
  }
}

/**
 * 把一批节点拍平成待导出条目（含中间目录），以及一个建议的输出名。
 *
 * @param {object[]} nodes 选中的节点（含各自的 children）
 * @returns {Promise<{ entries: ExportEntry[], files: number, skipped: number, name: string }>}
 *          `name` 是单文件时的文件名、否则是 zip 的建议名
 */
export async function collectExport(nodes) {
  const vfs = getVFS()
  // 先去重：选了 a/ 又选了 a/b.cpp 时只留 a/ —— 否则同一个文件在包里出现两次
  // （外面 FileExplorer 的 selectionFor 已经过了一道，这里再兜一次，见 pruneNestedNodes）
  const roots = pruneNestedNodes(nodes.filter(Boolean))
  const base = commonParent(roots.map((node) => node.path))
  /** @type {ExportEntry[]} */
  const entries = []
  const stats = { files: 0, skipped: 0 }

  for (const node of roots) {
    const rel = normalize(node.path).slice(base === '/' ? 1 : base.length + 1)
    if (rel) await collectNode(vfs, node, rel, entries, stats)
  }

  const single = roots.length === 1 ? roots[0] : null
  const name =
    single && single.type === 'file'
      ? single.name
      : `${single ? single.name : 'export'}-${isoDate(new Date())}.zip`
  return { entries, ...stats, name }
}

// ------------------------------------------------------------ 导出：三条落点
/**
 * 打包成 zip 并交给浏览器下载。
 * @param {object[]} nodes
 * @returns {Promise<{ name: string, files: number, skipped: number }>}
 */
export async function exportAsZip(nodes) {
  const { entries, files, skipped, name } = await collectExport(nodes)
  downloadBlob(await buildZip(entries), name)
  return { name, files, skipped }
}

/**
 * 单个文件直接下载（不套 zip）——只有「恰好选中一个文件」才走这里。
 * @param {object} node
 * @returns {Promise<{ name: string }>}
 */
export async function exportSingleFile(node) {
  const vfs = getVFS()
  const text = await vfs.readFile(node.path)
  downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), node.name)
  return { name: node.name }
}

/** 桌面壳才做得到「写进我选的那个目录」 */
export const CAN_EXPORT_TO_DISK = IS_DESKTOP

// ------------------------------------------------------------ 导入：选文件

/**
 * 弹一次隐藏的 `<input type="file">`，取回用户选的文件。
 *
 * **必须由用户手势直接调用**（浏览器的规矩：click 不在手势栈里会被忽略），所以本函数
 * 不能包在 await 之后 —— 组件里要直接绑在按钮 / 菜单项的点击上。
 *
 * @param {{ directory?: boolean }} [options] `directory` = 选文件夹（递归进所有子目录）
 * @returns {Promise<File[]>} 取消时回空数组
 */
export function pickFromDisk({ directory = false } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    if (directory) input.webkitdirectory = true
    // 不进视口、不占布局；Firefox 只认 display:none 之外的写法，用 hidden 属性最省事
    input.hidden = true
    document.body.appendChild(input)

    const done = (files) => {
      input.remove()
      resolve(files)
    }
    input.addEventListener('change', () => done([...(input.files ?? [])]), { once: true })
    // 取消没有事件可听：现代浏览器在「对话框关掉、没选东西」时会派一次 cancel
    input.addEventListener('cancel', () => done([]), { once: true })
    input.click()
  })
}

/**
 * 这一台设备能不能「选整个文件夹」。
 *
 * `webkitdirectory` 属性在 Android WebView 里**也存在**（属性探测探不出区别），但点下去
 * 只会弹普通文件选择器，拿不到目录结构 —— 所以这里按设备类型判，不按属性判。
 * 事实依据见 `platform.js` 的 `BROWSER_PLATFORM`。
 * @returns {boolean}
 */
export function canPickFolder() {
  return BROWSER_PLATFORM === 'desktop'
}

/**
 * 一个待导入的条目：相对路径（不含顶层，见下）+ File。
 * @typedef {Object} ImportItem
 * @property {string} rel 相对目标目录的路径，如 `chapter1/a.cpp` 或 `main.cpp`
 * @property {File} file
 */

/**
 * 把 File 列表按相对路径排好序。
 *
 * `webkitRelativePath` 里带着用户选的那个顶层文件夹名（`chapter1/sub/a.cpp`），
 * **原样保留** —— 用户选了一个文件夹，就期望工作区里出现同名的一个目录，而不是把
 * 里面的东西撒进当前目录。手机上拿不到这个字段（退回逐个选文件），此时用 `file.name`。
 *
 * @param {File[]} files
 * @returns {ImportItem[]}
 */
export function planImport(files) {
  return files
    .map((file) => {
      const raw = file.webkitRelativePath || file.name
      const parts = raw.split('/').filter((part) => part && part !== '.' && part !== '..')
      if (!parts.length || parts.length > MAX_DEPTH) return null
      return { rel: parts.join('/'), file }
    })
    .filter(Boolean)
}

// ------------------------------------------------------------ 导入：从系统拖进来

/**
 * `entry.file()` 的回调版包一层 Promise。读不出来（权限没了 / 文件已被移走）给 null，
 * 由调用方跳过 —— 与上面「二进制 / 超大一律跳过并计数」是同一条纪律。
 * @param {FileSystemFileEntry} entry
 * @returns {Promise<File|null>}
 */
function entryFile(entry) {
  return new Promise((resolve) => {
    entry.file(
      (file) => resolve(file),
      () => resolve(null),
    )
  })
}

/**
 * 一次 `readEntries()` 只回**一批**（Chrome 上限 100 条），要反复读到空数组为止。
 * 只读一遍的表现是「目录里超过 100 个条目时，后面的凭空不见了」—— 静默少东西最难查。
 * @param {FileSystemDirectoryEntry} directory
 * @returns {Promise<FileSystemEntry[]>}
 */
function readAllEntries(directory) {
  return new Promise((resolve) => {
    const reader = directory.createReader()
    const all = []
    const step = () => {
      reader.readEntries(
        (batch) => {
          if (!batch.length) {
            resolve(all)
            return
          }
          all.push(...batch)
          step()
        },
        () => resolve(all),
      )
    }
    step()
  })
}

/**
 * 深度优先把一个 entry 摊成 `{ rel, file }`，顶层那一级的名字**保留**
 * （拖 `chapter1/` 就得到工作区里的 `chapter1/`，与 `planImport` 对 `webkitRelativePath`
 * 的做法一致）。超过 [`MAX_DEPTH`] 层就停 —— 与 `planImport` 同一道闸，防畸形结构把树撑爆。
 * @param {FileSystemEntry} entry
 * @param {string} prefix 父级相对路径（顶层给空串）
 * @param {ImportItem[]} out
 * @param {number} depth
 */
async function walkEntry(entry, prefix, out, depth) {
  const rel = prefix ? `${prefix}/${entry.name}` : entry.name
  if (entry.isFile) {
    const file = await entryFile(entry)
    if (file) out.push({ rel, file })
    return
  }
  if (!entry.isDirectory || depth >= MAX_DEPTH) return
  for (const child of await readAllEntries(entry)) await walkEntry(child, rel, out, depth + 1)
}

/**
 * 从一次拖放的 `DataTransfer` 里读出待导入的条目（目录递归展开）。
 *
 * 【同步段不能挪】`DataTransfer` 只在**这一次事件派发期间**有效：派发一结束 `items` 就空了。
 * 所以下面第一段（把 entry / File 引用抓到手）必须在事件里同步跑完 —— 本函数是 async，但
 * `await` 之前的代码就是同步执行的，调用方只要**在 drop 回调里直接调它**（前面别先 await
 * 别的东西）这一段就落在那次派发里。之后的递归读目录可以慢慢来：`FileSystemEntry` 与
 * `File` 对象在事件结束后照样能用（这一条是拖放最容易踩空的地方，见 HANDOFF 第 13 节）。
 *
 * 【为什么非要 webkitGetAsEntry】`dataTransfer.files` 是**平的**：拖一个文件夹进来只会得到
 * 那个目录本身（Chrome 给一个 size 为 0 的伪 File），里面的东西一个都没有。目录结构只有
 * `FileSystemEntry` 拿得到。浏览器不给 entry（老 Firefox / 非标准环境）时退回 files，
 * 至少把顶层那几个文件导进来。
 *
 * @param {DataTransfer|null} dataTransfer
 * @returns {Promise<ImportItem[]>}
 */
export async function readDroppedItems(dataTransfer) {
  // —— 同步段：趁事件还在派发，把引用抓到手 ——
  /** @type {FileSystemEntry[]} */
  const entries = []
  /** @type {File[]} */
  const files = []
  try {
    for (const item of Array.from(dataTransfer?.items ?? [])) {
      if (item.kind !== 'file') continue
      let entry = null
      try {
        entry = item.webkitGetAsEntry?.() ?? null
      } catch {
        entry = null
      }
      if (entry) entries.push(entry)
    }
  } catch {
    /* items 读不出来：退回下面的 files */
  }
  if (!entries.length) {
    try {
      files.push(...Array.from(dataTransfer?.files ?? []))
    } catch {
      /* 一样取不到：当作空，调用方会走「没有可导入的文件」那条提示 */
    }
  }

  // —— 异步段：入口引用已经安全，慢慢递归 ——
  /** @type {ImportItem[]} */
  const out = []
  if (entries.length) {
    for (const entry of entries) await walkEntry(entry, '', out, 0)
  } else {
    for (const file of files) {
      if (file?.name) out.push({ rel: file.name, file })
    }
  }
  return out
}

/**
 * 把一批文件写进工作区的某个目录。
 *
 * 三条纪律：
 * - **整趟塞进一个 `vfs.batch()`**：provider 会把一串 create 合并成一次 reset，树只重建一回
 *   （几百个文件时不这么做，界面会卡死在重建上）。
 * - **同名一律排号，绝不覆盖**：与「导入题目时用户的题解一个字都不动」是同一条纪律
 *   （见 HANDOFF 第 7 节）。文件用 `a.cpp → a-2.cpp`。
 * - **二进制 / 超大 / 读失败 逐个跳过并计数**，最后如实回报（见文件头）。
 *
 * @param {string} targetDirPath 目标目录的绝对路径
 * @param {ImportItem[]} items
 * @returns {Promise<{ imported: number, skipped: number, failed: number, firstId: string|null }>}
 *          `firstId` 是第一个成功写进去的节点 id —— 调用方据此把界面定位过去
 */
export async function importInto(targetDirPath, items) {
  const vfs = getVFS()
  const stats = { imported: 0, skipped: 0, failed: 0, firstId: null }
  if (!items.length) return stats

  await vfs.batch(async () => {
    /** 已建好的目录（含目标目录）→ 免得同一个目录被 stat / mkdir 几百次 */
    const ensured = new Set([normalize(targetDirPath)])
    /** 老路径 → 真正落地的路径。重名排号之后，子文件得跟着改到新目录下 */
    const mapped = new Map([[normalize(targetDirPath), normalize(targetDirPath)]])

    /** 逐级建目录，返回最后一级真正落地的路径 */
    const ensureDir = async (parts) => {
      let current = normalize(targetDirPath)
      for (const part of parts) {
        const wanted = join(current, part)
        if (!ensured.has(wanted)) {
          const existing = await vfs.stat(wanted)
          if (existing?.type === 'directory') {
            ensured.add(wanted)
          } else {
            // 撞上一个同名文件（或同名目录已被别处排过号）：一样走排号
            const name = await uniqueNameIn(vfs, current, part, 'directory')
            await vfs.createDirectory(join(current, name))
            ensured.add(join(current, name))
            mapped.set(wanted, join(current, name))
            current = join(current, name)
            continue
          }
        }
        current = mapped.get(wanted) ?? wanted
      }
      return current
    }

    for (const { rel, file } of items) {
      const parts = rel.split('/')
      const name = parts.pop()
      let dir
      try {
        dir = await ensureDir(parts)
      } catch {
        stats.failed += 1
        continue
      }

      if (file.size > MAX_IMPORT_BYTES) {
        stats.skipped += 1
        continue
      }
      let bytes
      try {
        bytes = new Uint8Array(await file.arrayBuffer())
      } catch {
        stats.failed += 1
        continue
      }
      if (isBinaryBytes(bytes)) {
        stats.skipped += 1
        continue
      }

      try {
        const target = await uniqueNameIn(vfs, dir, name, 'file')
        const created = await vfs.createFile(join(dir, target), new TextDecoder().decode(bytes))
        stats.imported += 1
        if (!stats.firstId) stats.firstId = created.id
      } catch {
        stats.failed += 1
      }
    }
  })

  return stats
}
