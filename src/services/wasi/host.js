/**
 * WASI preview1 宿主 —— C++ 沙箱专用（`docs/新内核规划.md` 阶段 4 的 B 方案）。
 *
 * 为什么自己写：runno 的 stdin 是「8 KiB SAB 槽 + `setTimeout(0)` 轮询」，实测
 * 1.6 MB/s；stdout 还要逐块跨线程 postMessage。这两条都必须拿回宿主才能改。
 *
 * 这个模块**不碰 Worker、不碰 DOM**：输入是一颗已编译好的 `WebAssembly.Module`
 * 和一张 runno 形状的平表（`{ [绝对路径]: { content } }`），输出是退出码与
 * stdout / stderr。所以它能在 Node 里直接跑（验证见 `scripts/wasm-core` 之外的一次性
 * 探针），也能原样装进 worker。
 *
 * 语义边界（都对着实测的 import 表定，不是猜的）：
 * - 新内核两个编译器只认 `wasi_snapshot_preview1`，现役 8.0.1 认 `wasi_unstable`；
 *   同一张函数表注册到两个模块名下，换内核不用改这里。
 * - 未实现的调用返回 `ENOSYS` 而不是抛异常：一个用户程序没用过的调用不该把整个
 *   worker 炸掉；真用到了，程序拿到明确的 errno，比一句 "import object field is
 *   not a function" 好定位。
 * - 文件系统是内存态平表：不支持符号链接（现役 sysroot 的 416 个条目全是普通文件，
 *   已 `tar -tv` 核对），`/sys` 只读。
 * - stdin 只读一次进内存、`fd_read` 同步按 iov 拷 —— 这正是吞吐从 1.6 MB/s 起来的地方。
 * - `poll_oneoff` 的时钟订阅在当前线程同步等待（Atomics.wait）；主线程用
 *   `worker.terminate()` 仍能打断。Node 主线程不允许 Atomics.wait，那里退化为立即到期。
 */

const encoder = new TextEncoder()

const ERRNO = {
  SUCCESS: 0,
  EACCES: 2,
  EAGAIN: 6,
  EBADF: 8,
  EBUSY: 10,
  EEXIST: 20,
  EFAULT: 21,
  EINVAL: 28,
  EIO: 29,
  EISDIR: 31,
  ELOOP: 32,
  ENAMETOOLONG: 37,
  ENOMEM: 48,
  ENOENT: 44,
  ENOSPC: 51,
  ENOSYS: 52,
  ENOTDIR: 54,
  ENOTEMPTY: 55,
  ENOTSUP: 58,
  EOVERFLOW: 61,
  EPERM: 63,
  EPIPE: 64,
  EROFS: 69,
  ESPIPE: 70,
  ENOTCAPABLE: 76,
}

const FILETYPE = {
  UNKNOWN: 0,
  BLOCK_DEVICE: 1,
  CHARACTER_DEVICE: 2,
  DIRECTORY: 3,
  REGULAR_FILE: 4,
  SYMBOLIC_LINK: 7,
}

// rights 位（u64）。只需要区分「读」与「写」两组，其余给足，避免 libc 的
// fd_fdstat_get 自检把合法操作挡掉。
const RIGHTS = {
  FD_READ: 1n << 1n,
  FD_SEEK: 1n << 2n,
  FD_FDSTAT_SET_FLAGS: 1n << 3n,
  FD_SYNC: 1n << 4n,
  FD_TELL: 1n << 5n,
  FD_WRITE: 1n << 6n,
  FD_ADVISE: 1n << 7n,
  FD_ALLOCATE: 1n << 8n,
  PATH_CREATE_DIRECTORY: 1n << 9n,
  PATH_CREATE_FILE: 1n << 10n,
  PATH_LINK_SOURCE: 1n << 11n,
  PATH_LINK_TARGET: 1n << 12n,
  PATH_OPEN: 1n << 13n,
  FD_READDIR: 1n << 14n,
  PATH_READLINK: 1n << 15n,
  PATH_RENAME_SOURCE: 1n << 16n,
  PATH_RENAME_TARGET: 1n << 17n,
  PATH_FILESTAT_GET: 1n << 18n,
  PATH_FILESTAT_SET_SIZE: 1n << 19n,
  PATH_FILESTAT_SET_TIMES: 1n << 20n,
  FD_FILESTAT_GET: 1n << 21n,
  FD_FILESTAT_SET_SIZE: 1n << 22n,
  FD_FILESTAT_SET_TIMES: 1n << 23n,
  PATH_SYMLINK: 1n << 24n,
  PATH_REMOVE_DIRECTORY: 1n << 25n,
  PATH_UNLINK_FILE: 1n << 26n,
  POLL_FD_READWRITE: 1n << 27n,
}

const DIR_RIGHTS =
  RIGHTS.PATH_CREATE_DIRECTORY |
  RIGHTS.PATH_CREATE_FILE |
  RIGHTS.PATH_LINK_SOURCE |
  RIGHTS.PATH_LINK_TARGET |
  RIGHTS.PATH_OPEN |
  RIGHTS.FD_READDIR |
  RIGHTS.PATH_READLINK |
  RIGHTS.PATH_RENAME_SOURCE |
  RIGHTS.PATH_RENAME_TARGET |
  RIGHTS.PATH_FILESTAT_GET |
  RIGHTS.PATH_FILESTAT_SET_SIZE |
  RIGHTS.PATH_FILESTAT_SET_TIMES |
  RIGHTS.FD_FILESTAT_GET |
  RIGHTS.PATH_SYMLINK |
  RIGHTS.PATH_REMOVE_DIRECTORY |
  RIGHTS.PATH_UNLINK_FILE |
  RIGHTS.POLL_FD_READWRITE

const FILE_RIGHTS =
  RIGHTS.FD_READ |
  RIGHTS.FD_SEEK |
  RIGHTS.FD_FDSTAT_SET_FLAGS |
  RIGHTS.FD_SYNC |
  RIGHTS.FD_TELL |
  RIGHTS.FD_WRITE |
  RIGHTS.FD_ADVISE |
  RIGHTS.FD_ALLOCATE |
  RIGHTS.FD_FILESTAT_GET |
  RIGHTS.FD_FILESTAT_SET_SIZE |
  RIGHTS.FD_FILESTAT_SET_TIMES |
  RIGHTS.POLL_FD_READWRITE

const DEVICE_RIGHTS_READ = RIGHTS.FD_READ | RIGHTS.FD_FDSTAT_SET_FLAGS
const DEVICE_RIGHTS_WRITE = RIGHTS.FD_WRITE | RIGHTS.FD_FDSTAT_SET_FLAGS

const OFLAGS = { CREAT: 1, DIRECTORY: 2, EXCL: 4, TRUNC: 8 }
const FDFLAGS = { APPEND: 1, NONBLOCK: 4 }
const WHENCE = { SET: 0, CUR: 1, END: 2 }

/** 默认只读根：sysroot。用户文件（/program.cpp、/program.o …）都在根下，可写。 */
const DEFAULT_READ_ONLY = ['/sys']

const CLOCK_RES_NS = 1_000n

const PAGE_BYTES = 64 * 1024

/** `proc_exit` 用异常把控制权从 wasm 里带出来，和 trap 区分开。 */
export class WasiExit extends Error {
  constructor(code) {
    super(`wasi exit ${code}`)
    this.name = 'WasiExit'
    this.code = code
  }
}

/**
 * 归一化绝对路径：折叠 `.` / `..`，去掉重复斜杠与尾斜杠。
 * `..` 越过根时停在根（我们只有一棵树，没有越界这回事）。
 * @returns {string | null} 含 NUL 的路径返回 null
 */
export function normalizePath(input) {
  if (typeof input !== 'string' || input.includes('\0')) return null
  const parts = []
  for (const part of input.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      parts.pop()
      continue
    }
    parts.push(part)
  }
  return `/${parts.join('/')}`
}

function parentOf(path) {
  const slash = path.lastIndexOf('/')
  return slash <= 0 ? '/' : path.slice(0, slash)
}

function nameOf(path) {
  return path.slice(path.lastIndexOf('/') + 1)
}

function toBytes(entry) {
  const content = entry && typeof entry === 'object' && 'content' in entry ? entry.content : entry
  if (content instanceof Uint8Array) return content
  if (content instanceof ArrayBuffer) return new Uint8Array(content)
  if (ArrayBuffer.isView(content)) return new Uint8Array(content.buffer, content.byteOffset, content.byteLength)
  if (typeof content === 'string') return encoder.encode(content)
  return new Uint8Array(0)
}

/**
 * 内存态文件树。runno 的 fs 是平表，这里建树只是为了 `path_open` / `readdir`
 * 的语义正确；对外仍然可以拍回平表（`snapshot()`）。
 */
export class MemoryFs {
  /**
   * @param {Record<string, Uint8Array | string>} files 初始平表
   * @param {string[]} readOnly 只读根
   * @param {{ sourceMtime?: number }} [options]
   *   `sourceMtime` 给**初始平表里的条目**钉一个固定 mtime。sysroot 必须钉：
   *   PCH 里记着每个输入头的 mtime，从缓存取回的 PCH 会逐个核对；用 `Date.now()`
   *   就必然对不上（实测跨会话差几秒 → `has been modified since the precompiled
   *   header was built`，而那个错误会被「降级重试」吃掉，症状是「PCH 从来不生效」）。
   */
  constructor(files = {}, readOnly = DEFAULT_READ_ONLY, options = {}) {
    this.nodes = new Map()
    this.children = new Map()
    this.sourceMtime = typeof options?.sourceMtime === 'number' ? options.sourceMtime : null
    // ino 必须每个节点唯一：clang 拿 (dev, ino) 当 UniqueID 判「是不是同一个文件」，
    // 全给 1 会让所有头文件被当成同一个，头文件保护失效后 include 递归到爆（2026-10-25 实测）。
    this.nextIno = 1
    this.readOnlyRoots = readOnly.map((path) => normalizePath(path)).filter(Boolean)
    this.addDirectory('/')
    for (const [rawPath, entry] of Object.entries(files ?? {})) {
      const path = normalizePath(rawPath)
      if (!path || path === '/') continue
      const node = this.addFile(path, toBytes(entry))
      if (this.sourceMtime !== null) node.mtime = this.sourceMtime
    }
  }

  addDirectory(path) {
    const existing = this.nodes.get(path)
    if (existing) {
      if (existing.type !== 'dir') throw new Error(`wasi: ${path} 已是文件，不能当目录`)
      return existing
    }
    if (path !== '/') {
      const parent = parentOf(path)
      this.addDirectory(parent)
      this.children.get(parent).add(nameOf(path))
    }
    const node = { type: 'dir', path, ino: this.nextIno++, mtime: Date.now() }
    this.nodes.set(path, node)
    this.children.set(path, new Set())
    return node
  }

  addFile(path, data) {
    const parent = parentOf(path)
    const parentNode = this.addDirectory(parent)
    if (parentNode.type !== 'dir') throw new Error(`wasi: ${parent} 不是目录`)
    this.children.get(parent).add(nameOf(path))
    const node = { type: 'file', path, ino: this.nextIno++, data: toBytes(data), mtime: Date.now() }
    this.nodes.set(path, node)
    return node
  }

  isReadOnly(path) {
    return this.readOnlyRoots.some((root) => path === root || path.startsWith(`${root}/`))
  }

  createFile(path) {
    if (this.nodes.has(path)) return ERRNO.EEXIST
    const parent = this.nodes.get(parentOf(path))
    if (!parent) return ERRNO.ENOENT
    if (parent.type !== 'dir') return ERRNO.ENOTDIR
    if (this.isReadOnly(path)) return ERRNO.EROFS
    this.addFile(path, new Uint8Array(0))
    return ERRNO.SUCCESS
  }

  createDirectory(path) {
    if (this.nodes.has(path)) return ERRNO.EEXIST
    const parent = this.nodes.get(parentOf(path))
    if (!parent) return ERRNO.ENOENT
    if (parent.type !== 'dir') return ERRNO.ENOTDIR
    if (this.isReadOnly(path)) return ERRNO.EROFS
    this.addDirectory(path)
    return ERRNO.SUCCESS
  }

  unlink(path) {
    const node = this.nodes.get(path)
    if (!node) return ERRNO.ENOENT
    if (node.type === 'dir') return ERRNO.EISDIR
    if (this.isReadOnly(path)) return ERRNO.EROFS
    this.nodes.delete(path)
    this.children.get(parentOf(path))?.delete(nameOf(path))
    return ERRNO.SUCCESS
  }

  removeDirectory(path) {
    const node = this.nodes.get(path)
    if (!node) return ERRNO.ENOENT
    if (node.type !== 'dir') return ERRNO.ENOTDIR
    if (path === '/') return ERRNO.EBUSY
    if (this.children.get(path)?.size) return ERRNO.ENOTEMPTY
    if (this.isReadOnly(path)) return ERRNO.EROFS
    this.nodes.delete(path)
    this.children.delete(path)
    this.children.get(parentOf(path))?.delete(nameOf(path))
    return ERRNO.SUCCESS
  }

  rename(from, to) {
    const node = this.nodes.get(from)
    if (!node) return ERRNO.ENOENT
    if (from === to) return ERRNO.SUCCESS
    if (this.isReadOnly(from) || this.isReadOnly(to)) return ERRNO.EROFS
    const targetParent = this.nodes.get(parentOf(to))
    if (!targetParent) return ERRNO.ENOENT
    if (targetParent.type !== 'dir') return ERRNO.ENOTDIR
    const existing = this.nodes.get(to)
    if (existing) {
      if (existing.type === 'dir' && node.type === 'file') return ERRNO.EISDIR
      if (existing.type === 'file' && node.type === 'dir') return ERRNO.ENOTDIR
      if (existing.type === 'dir') {
        if (this.children.get(to)?.size) return ERRNO.ENOTEMPTY
        this.children.delete(to)
      }
      this.nodes.delete(to)
    }
    // 目录要连同整棵子树一起搬：平表里没有父指针，只能按前缀扫。
    if (node.type === 'dir') {
      for (const key of [...this.nodes.keys()]) {
        if (key === from || key.startsWith(`${from}/`)) {
          const moved = to + key.slice(from.length)
          const value = this.nodes.get(key)
          this.nodes.delete(key)
          if (value.type === 'dir') {
            const kids = this.children.get(key)
            this.children.delete(key)
            this.children.set(moved, kids)
          }
          value.path = moved
          this.nodes.set(moved, value)
        }
      }
    } else {
      this.nodes.delete(from)
      node.path = to
      this.nodes.set(to, node)
    }
    this.children.get(parentOf(from))?.delete(nameOf(from))
    this.children.get(parentOf(to))?.add(nameOf(to))
    return ERRNO.SUCCESS
  }

  truncate(node, size) {
    if (node.data.length === size) return
    const next = new Uint8Array(size)
    next.set(node.data.subarray(0, Math.min(node.data.length, size)))
    node.data = next
    node.mtime = Date.now()
  }

  write(node, offset, bytes) {
    const end = offset + bytes.length
    if (end > node.data.length) {
      const next = new Uint8Array(end)
      next.set(node.data)
      node.data = next
    }
    node.data.set(bytes, offset)
    node.mtime = Date.now()
  }

  /** 拍回 runno 形状的平表（只在需要把结果交给旧管线时用）。 */
  snapshot() {
    const files = {}
    for (const [path, node] of this.nodes) {
      if (node.type !== 'file') continue
      files[path] = {
        path,
        content: node.data,
        mode: 'binary',
        timestamps: { change: new Date(node.mtime), access: new Date(node.mtime), modification: new Date(node.mtime) },
      }
    }
    return files
  }
}

function createState(options) {
  const {
    args = [],
    env = {},
    files = {},
    fs,
    stdin = '',
    readOnly = DEFAULT_READ_ONLY,
    onStdout,
    onStderr,
  } = options

  const state = {
    fs: fs ?? new MemoryFs(files, readOnly),
    fds: new Map(),
    nextFd: 4,
    memory: null,
    argv: args.map((value) => encoder.encode(String(value))),
    envp: Object.entries(env ?? {}).map(([key, value]) => encoder.encode(`${key}=${value}`)),
    stdin: typeof stdin === 'string' ? encoder.encode(stdin) : toBytes(stdin),
    stdinOffset: 0,
    stdout: [],
    stderr: [],
    stdoutDecoder: new TextDecoder(),
    stderrDecoder: new TextDecoder(),
    onStdout,
    onStderr,
  }

  state.fds.set(0, { kind: 'stdin' })
  state.fds.set(1, { kind: 'stdout' })
  state.fds.set(2, { kind: 'stderr' })
  // fd 3 = 根预开目录（与 runno 一致）；动态打开的 fd 从 4 起。
  state.fds.set(3, { kind: 'dir', path: '/', node: state.fs.nodes.get('/'), flags: 0, preopen: true })
  return state
}

function memoryOf(state) {
  if (!state.memory) throw new Error('wasi: imports 在 memory 就绪前被调用')
  return state.memory
}

function viewOf(state) {
  return new DataView(memoryOf(state).buffer)
}

function bytesOf(state) {
  return new Uint8Array(memoryOf(state).buffer)
}

function inBounds(state, ptr, length) {
  return Number.isInteger(ptr) && Number.isInteger(length) && ptr >= 0 && length >= 0 && ptr + length <= memoryOf(state).buffer.byteLength
}

function readString(state, ptr, length) {
  if (!inBounds(state, ptr, length)) return null
  const bytes = bytesOf(state).subarray(ptr, ptr + length)
  // 路径都是 ASCII；用 TextDecoder 而不是 String.fromCharCode 是为了正确处理非 ASCII 文件名
  return new TextDecoder().decode(bytes)
}

function readIovs(state, iovsPtr, iovsLen) {
  if (!Number.isInteger(iovsLen) || iovsLen < 0) return null
  if (!inBounds(state, iovsPtr, iovsLen * 8)) return null
  const view = viewOf(state)
  const iovs = []
  for (let index = 0; index < iovsLen; index += 1) {
    const base = view.getUint32(iovsPtr + index * 8, true)
    const length = view.getUint32(iovsPtr + index * 8 + 4, true)
    if (!inBounds(state, base, length)) return null
    iovs.push({ base, length })
  }
  return iovs
}

function writeStringTable(state, countPtr, sizePtr, list) {
  if (!inBounds(state, countPtr, 4) || !inBounds(state, sizePtr, 4)) return ERRNO.EFAULT
  const view = viewOf(state)
  view.setUint32(countPtr, list.length, true)
  view.setUint32(sizePtr, list.reduce((total, item) => total + item.length + 1, 0), true)
  return ERRNO.SUCCESS
}

function fillStringTable(state, pointersPtr, bufferPtr, list) {
  const total = list.reduce((sum, item) => sum + item.length + 1, 0)
  if (!inBounds(state, pointersPtr, list.length * 4) || !inBounds(state, bufferPtr, total)) return ERRNO.EFAULT
  const view = viewOf(state)
  const bytes = bytesOf(state)
  let cursor = bufferPtr
  list.forEach((item, index) => {
    view.setUint32(pointersPtr + index * 4, cursor, true)
    bytes.set(item, cursor)
    bytes[cursor + item.length] = 0
    cursor += item.length + 1
  })
  return ERRNO.SUCCESS
}

function writeFilestat(state, ptr, node) {
  if (!inBounds(state, ptr, 64)) return ERRNO.EFAULT
  const view = viewOf(state)
  const isDir = node.type === 'dir'
  const size = isDir ? 0 : node.data.length
  const stamp = BigInt(Math.round(node.mtime * 1e6))
  view.setBigUint64(ptr, 0n, true)
  view.setBigUint64(ptr + 8, BigInt(node.ino ?? 1), true)
  view.setUint8(ptr + 16, isDir ? FILETYPE.DIRECTORY : FILETYPE.REGULAR_FILE)
  view.setBigUint64(ptr + 24, 1n, true)
  view.setBigUint64(ptr + 32, BigInt(size), true)
  view.setBigUint64(ptr + 40, stamp, true)
  view.setBigUint64(ptr + 48, stamp, true)
  view.setBigUint64(ptr + 56, stamp, true)
  return ERRNO.SUCCESS
}

function writeDeviceStat(state, ptr) {
  if (!inBounds(state, ptr, 64)) return ERRNO.EFAULT
  const view = viewOf(state)
  for (let offset = 0; offset < 64; offset += 8) view.setBigUint64(ptr + offset, 0n, true)
  view.setUint8(ptr + 16, FILETYPE.CHARACTER_DEVICE)
  view.setBigUint64(ptr + 24, 1n, true)
  return ERRNO.SUCCESS
}

function resolvePath(state, dirfd, rawPath) {
  const entry = state.fds.get(dirfd)
  if (!entry) return { errno: ERRNO.EBADF }
  let base = '/'
  if (!rawPath.startsWith('/')) {
    if (entry.kind !== 'dir') return { errno: ERRNO.ENOTDIR }
    base = entry.path
  }
  const joined = base === '/' ? `/${rawPath}` : `${base}/${rawPath}`
  const path = normalizePath(joined)
  if (!path) return { errno: ERRNO.EINVAL }
  return { path }
}

function openFd(state, fdEntry, fdPtr) {
  if (!inBounds(state, fdPtr, 4)) return ERRNO.EFAULT
  const fd = state.nextFd
  state.nextFd += 1
  state.fds.set(fd, fdEntry)
  viewOf(state).setUint32(fdPtr, fd, true)
  return ERRNO.SUCCESS
}

function emit(state, kind, bytes) {
  if (bytes.length === 0) return
  const decode = kind === 'stdout' ? state.stdoutDecoder : state.stderrDecoder
  const text = decode.decode(bytes, { stream: true })
  if (!text) return
  ;(kind === 'stdout' ? state.stdout : state.stderr).push(text)
  const listener = kind === 'stdout' ? state.onStdout : state.onStderr
  if (typeof listener === 'function') listener(text)
}

function pollSleep(ms) {
  if (!(ms > 0)) return
  try {
    // 只有 worker 线程允许阻塞；Node 主线程会抛，退化为立即到期。
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.min(ms, 60_000))
  } catch {
    /* 主线程：不睡，立即返回 */
  }
}

function buildImports(state) {
  const fs = state.fs

  const finishFdStat = (entry, ptr) => {
    if (!inBounds(state, ptr, 24)) return ERRNO.EFAULT
    const view = viewOf(state)
    if (entry.kind === 'stdin' || entry.kind === 'stdout' || entry.kind === 'stderr') {
      view.setUint8(ptr, FILETYPE.CHARACTER_DEVICE)
      view.setUint16(ptr + 2, 0, true)
      view.setBigUint64(ptr + 8, entry.kind === 'stdin' ? DEVICE_RIGHTS_READ : DEVICE_RIGHTS_WRITE, true)
      view.setBigUint64(ptr + 16, 0n, true)
      return ERRNO.SUCCESS
    }
    const isDir = entry.kind === 'dir'
    view.setUint8(ptr, isDir ? FILETYPE.DIRECTORY : FILETYPE.REGULAR_FILE)
    view.setUint16(ptr + 2, entry.flags ?? 0, true)
    // 目录的 rights_inheriting 必须把**文件**权限也带上：wasi-libc 的 open() 是拿
    // 目录的 inheriting 去拼 path_open 的 rights_base 的，只给 DIR_RIGHTS 会让 clang
    // 写 .o 时 path_open 不带 FD_WRITE，随后 fd_write 直接 EBADF（2026-10-25 实测：
    // "unable to open output file '/program.o': 'Bad file descriptor'"）。
    view.setBigUint64(ptr + 8, isDir ? DIR_RIGHTS : FILE_RIGHTS, true)
    view.setBigUint64(ptr + 16, isDir ? DIR_RIGHTS | FILE_RIGHTS : FILE_RIGHTS, true)
    return ERRNO.SUCCESS
  }

  const readIntoFile = (entry, iovs, startOffset) => {
    let offset = startOffset
    let total = 0
    for (const iov of iovs) {
      const take = Math.min(iov.length, Math.max(entry.node.data.length - offset, 0))
      if (take <= 0) break
      bytesOf(state).set(entry.node.data.subarray(offset, offset + take), iov.base)
      offset += take
      total += take
      if (take < iov.length) break
    }
    return { total, offset }
  }

  const fdRead = (fd, iovsPtr, iovsLen, nreadPtr) => {
    const entry = state.fds.get(fd)
    if (!entry) return ERRNO.EBADF
    if (!inBounds(state, nreadPtr, 4)) return ERRNO.EFAULT
    const iovs = readIovs(state, iovsPtr, iovsLen)
    if (!iovs) return ERRNO.EFAULT

    if (entry.kind === 'file') {
      const { total, offset } = readIntoFile(entry, iovs, entry.offset)
      entry.offset = offset
      viewOf(state).setUint32(nreadPtr, total, true)
      return ERRNO.SUCCESS
    }
    if (entry.kind !== 'stdin') return ERRNO.EBADF

    // 同步按 iov 拷：没有槽位、没有 tick。这就是 1.6 MB/s 那条的解法。
    let total = 0
    for (const iov of iovs) {
      if (state.stdinOffset >= state.stdin.length) break
      const take = Math.min(iov.length, state.stdin.length - state.stdinOffset)
      bytesOf(state).set(state.stdin.subarray(state.stdinOffset, state.stdinOffset + take), iov.base)
      state.stdinOffset += take
      total += take
      if (take < iov.length) break
    }
    viewOf(state).setUint32(nreadPtr, total, true)
    return ERRNO.SUCCESS
  }

  const writableFile = (entry) => entry.kind === 'file' && entry.canWrite && !fs.isReadOnly(entry.path)

  return {
    // ---------------------------------------------------------------- 进程环境
    args_sizes_get(argcPtr, argvBufSizePtr) {
      return writeStringTable(state, argcPtr, argvBufSizePtr, state.argv)
    },
    args_get(argvPtr, argvBufPtr) {
      return fillStringTable(state, argvPtr, argvBufPtr, state.argv)
    },
    environ_sizes_get(countPtr, bufSizePtr) {
      return writeStringTable(state, countPtr, bufSizePtr, state.envp)
    },
    environ_get(environPtr, bufPtr) {
      return fillStringTable(state, environPtr, bufPtr, state.envp)
    },
    proc_exit(code) {
      throw new WasiExit(code >>> 0)
    },

    // ---------------------------------------------------------------- 时钟 / 随机
    clock_res_get(_clockId, resPtr) {
      if (!inBounds(state, resPtr, 8)) return ERRNO.EFAULT
      viewOf(state).setBigUint64(resPtr, CLOCK_RES_NS, true)
      return ERRNO.SUCCESS
    },
    clock_time_get(clockId, _precision, timePtr) {
      if (!inBounds(state, timePtr, 8)) return ERRNO.EFAULT
      // realtime 与 monotonic 分开取：runno 那条补丁存在的唯一原因就是它把两者
      // 都回成「墙上毫秒」，steady_clock 于是不单调（HANDOFF §7 坑 3）。
      const now = clockId === 0 ? performance.timeOrigin + performance.now() : performance.now()
      viewOf(state).setBigUint64(timePtr, BigInt(Math.round(now * 1e6)), true)
      return ERRNO.SUCCESS
    },
    random_get(bufPtr, bufLen) {
      if (!inBounds(state, bufPtr, bufLen)) return ERRNO.EFAULT
      const target = bytesOf(state).subarray(bufPtr, bufPtr + bufLen)
      if (typeof globalThis.crypto?.getRandomValues === 'function') {
        for (let offset = 0; offset < target.length; offset += 65536) {
          globalThis.crypto.getRandomValues(target.subarray(offset, Math.min(target.length, offset + 65536)))
        }
      } else {
        for (let index = 0; index < target.length; index += 1) target[index] = (Math.random() * 256) | 0
      }
      return ERRNO.SUCCESS
    },

    // ---------------------------------------------------------------- fd 基础
    fd_close(fd) {
      if (!state.fds.has(fd)) return ERRNO.EBADF
      state.fds.delete(fd)
      return ERRNO.SUCCESS
    },
    fd_fdstat_get(fd, statPtr) {
      const entry = state.fds.get(fd)
      if (!entry) return ERRNO.EBADF
      return finishFdStat(entry, statPtr)
    },
    fd_fdstat_set_flags(fd, flags) {
      const entry = state.fds.get(fd)
      if (!entry || entry.kind === 'stdin') return ERRNO.EBADF
      entry.flags = flags >>> 0
      return ERRNO.SUCCESS
    },
    fd_fdstat_set_rights() {
      return ERRNO.SUCCESS
    },
    fd_prestat_get(fd, bufPtr) {
      // 只有一个预开目录：fd 3 → "/"。wasi-libc 用它决定 cwd 与相对路径的根。
      if (fd !== 3) return ERRNO.EBADF
      if (!inBounds(state, bufPtr, 8)) return ERRNO.EFAULT
      const view = viewOf(state)
      view.setUint8(bufPtr, 0) // preopentype::dir
      view.setUint32(bufPtr + 4, 1, true)
      return ERRNO.SUCCESS
    },
    fd_prestat_dir_name(fd, pathPtr, pathLen) {
      if (fd !== 3) return ERRNO.EBADF
      if (pathLen < 1 || !inBounds(state, pathPtr, pathLen)) return ERRNO.EFAULT
      bytesOf(state)[pathPtr] = 0x2f // '/'
      return ERRNO.SUCCESS
    },
    fd_filestat_get(fd, statPtr) {
      const entry = state.fds.get(fd)
      if (!entry) return ERRNO.EBADF
      if (entry.kind === 'stdin' || entry.kind === 'stdout' || entry.kind === 'stderr') return writeDeviceStat(state, statPtr)
      return writeFilestat(state, statPtr, entry.node)
    },
    fd_filestat_set_size(fd, size) {
      const entry = state.fds.get(fd)
      if (!entry) return ERRNO.EBADF
      if (entry.kind !== 'file') return ERRNO.ENOTSUP
      if (!writableFile(entry)) return fs.isReadOnly(entry.path) ? ERRNO.EROFS : ERRNO.EPERM
      const next = Number(size)
      if (!Number.isSafeInteger(next) || next < 0) return ERRNO.EINVAL
      fs.truncate(entry.node, next)
      return ERRNO.SUCCESS
    },
    fd_filestat_set_times() {
      return ERRNO.SUCCESS
    },

    // ---------------------------------------------------------------- 读
    fd_read: fdRead,
    fd_pread(fd, iovsPtr, iovsLen, offset, nreadPtr) {
      const entry = state.fds.get(fd)
      if (!entry) return ERRNO.EBADF
      if (fd === 0) return fdRead(fd, iovsPtr, iovsLen, nreadPtr)
      if (entry.kind !== 'file') return ERRNO.ENOTSUP
      if (!inBounds(state, nreadPtr, 4)) return ERRNO.EFAULT
      const iovs = readIovs(state, iovsPtr, iovsLen)
      if (!iovs) return ERRNO.EFAULT
      const { total } = readIntoFile(entry, iovs, Number(offset))
      viewOf(state).setUint32(nreadPtr, total, true)
      return ERRNO.SUCCESS
    },
    fd_seek(fd, offset, whence, newOffsetPtr) {
      const entry = state.fds.get(fd)
      if (!entry) return ERRNO.EBADF
      if (entry.kind !== 'file') return ERRNO.ESPIPE
      if (!inBounds(state, newOffsetPtr, 8)) return ERRNO.EFAULT
      const delta = Number(offset)
      const base = whence === WHENCE.SET ? 0 : whence === WHENCE.CUR ? entry.offset : entry.node.data.length
      const next = base + delta
      if (!Number.isSafeInteger(next) || next < 0) return ERRNO.EINVAL
      entry.offset = next
      viewOf(state).setBigUint64(newOffsetPtr, BigInt(next), true)
      return ERRNO.SUCCESS
    },
    fd_readdir(fd, bufPtr, bufLen, cookie, usedPtr) {
      const entry = state.fds.get(fd)
      if (!entry) return ERRNO.EBADF
      if (entry.kind !== 'dir') return ERRNO.ENOTDIR
      if (!inBounds(state, bufPtr, bufLen) || !inBounds(state, usedPtr, 4)) return ERRNO.EFAULT

      const names = ['.', '..', ...(fs.children.get(entry.path) ?? [])]
      const start = Number(cookie)
      const view = viewOf(state)
      const bytes = bytesOf(state)
      let written = 0
      for (let index = start; index < names.length; index += 1) {
        const nameBytes = encoder.encode(names[index])
        if (written + 24 > bufLen) break
        const room = bufLen - written - 24
        const nameLength = Math.min(nameBytes.length, room)
        const at = bufPtr + written
        const name = names[index]
        const childPath = entry.path === '/' ? `/${name}` : `${entry.path}/${name}`
        const node = name === '.' ? entry.node : name === '..' ? fs.nodes.get(parentOf(entry.path)) : fs.nodes.get(childPath)
        view.setBigUint64(at, BigInt(index + 1), true)
        view.setBigUint64(at + 8, 1n, true)
        view.setUint32(at + 16, nameBytes.length, true)
        view.setUint8(at + 20, node?.type === 'dir' ? FILETYPE.DIRECTORY : FILETYPE.REGULAR_FILE)
        bytes.set(nameBytes.subarray(0, nameLength), at + 24)
        written += 24 + nameLength
        if (nameLength < nameBytes.length) break
      }
      view.setUint32(usedPtr, written, true)
      return ERRNO.SUCCESS
    },

    // ---------------------------------------------------------------- 写
    fd_write(fd, iovsPtr, iovsLen, nwrittenPtr) {
      const entry = state.fds.get(fd)
      if (!entry) return ERRNO.EBADF
      if (!inBounds(state, nwrittenPtr, 4)) return ERRNO.EFAULT
      const iovs = readIovs(state, iovsPtr, iovsLen)
      if (!iovs) return ERRNO.EFAULT
      if (entry.kind === 'stdin') return ERRNO.EBADF
      if (entry.kind === 'dir') return ERRNO.EISDIR

      let total = 0
      for (const iov of iovs) {
        if (iov.length === 0) continue
        const chunk = bytesOf(state).subarray(iov.base, iov.base + iov.length)
        if (entry.kind === 'file') {
          if (!writableFile(entry)) return fs.isReadOnly(entry.path) ? ERRNO.EROFS : ERRNO.EBADF
          const offset = entry.flags & FDFLAGS.APPEND ? entry.node.data.length : entry.offset
          fs.write(entry.node, offset, chunk)
          entry.offset = offset + chunk.length
        } else {
          emit(state, entry.kind, chunk)
        }
        total += chunk.length
      }
      viewOf(state).setUint32(nwrittenPtr, total, true)
      return ERRNO.SUCCESS
    },

    // ---------------------------------------------------------------- 路径
    path_open(dirfd, _dirflags, pathPtr, pathLen, oflags, rightsBase, _rightsInheriting, fdflags, fdPtr) {
      const rawPath = readString(state, pathPtr, pathLen)
      if (rawPath == null) return ERRNO.EFAULT
      const resolved = resolvePath(state, dirfd, rawPath)
      if (resolved.errno != null) return resolved.errno
      const path = resolved.path
      const wantWrite = (rightsBase & (RIGHTS.FD_WRITE | RIGHTS.FD_ALLOCATE | RIGHTS.FD_FILESTAT_SET_SIZE)) !== 0n

      const node = fs.nodes.get(path)
      if (node) {
        if ((oflags & OFLAGS.DIRECTORY) && node.type !== 'dir') return ERRNO.ENOTDIR
        if (node.type === 'dir') {
          if ((oflags & OFLAGS.CREAT) && (oflags & OFLAGS.EXCL)) return ERRNO.EEXIST
          return openFd(state, { kind: 'dir', path, node, flags: Number(fdflags) }, fdPtr)
        }
        if ((oflags & OFLAGS.CREAT) && (oflags & OFLAGS.EXCL)) return ERRNO.EEXIST
        if (wantWrite && fs.isReadOnly(path)) return ERRNO.EROFS
        if ((oflags & OFLAGS.TRUNC) && wantWrite) fs.truncate(node, 0)
        return openFd(state, { kind: 'file', path, node, offset: 0, flags: Number(fdflags), canWrite: wantWrite && !fs.isReadOnly(path) }, fdPtr)
      }

      if (!(oflags & OFLAGS.CREAT)) return ERRNO.ENOENT
      if (oflags & OFLAGS.DIRECTORY) return ERRNO.ENOENT
      const created = fs.createFile(path)
      if (created !== ERRNO.SUCCESS) return created
      const fresh = fs.nodes.get(path)
      return openFd(state, { kind: 'file', path, node: fresh, offset: 0, flags: Number(fdflags), canWrite: wantWrite }, fdPtr)
    },
    path_filestat_get(dirfd, _flags, pathPtr, pathLen, statPtr) {
      const rawPath = readString(state, pathPtr, pathLen)
      if (rawPath == null) return ERRNO.EFAULT
      const resolved = resolvePath(state, dirfd, rawPath)
      if (resolved.errno != null) return resolved.errno
      const node = fs.nodes.get(resolved.path)
      if (!node) return ERRNO.ENOENT
      return writeFilestat(state, statPtr, node)
    },
    path_create_directory(dirfd, pathPtr, pathLen) {
      const rawPath = readString(state, pathPtr, pathLen)
      if (rawPath == null) return ERRNO.EFAULT
      const resolved = resolvePath(state, dirfd, rawPath)
      if (resolved.errno != null) return resolved.errno
      return fs.createDirectory(resolved.path)
    },
    path_remove_directory(dirfd, pathPtr, pathLen) {
      const rawPath = readString(state, pathPtr, pathLen)
      if (rawPath == null) return ERRNO.EFAULT
      const resolved = resolvePath(state, dirfd, rawPath)
      if (resolved.errno != null) return resolved.errno
      return fs.removeDirectory(resolved.path)
    },
    path_unlink_file(dirfd, pathPtr, pathLen) {
      const rawPath = readString(state, pathPtr, pathLen)
      if (rawPath == null) return ERRNO.EFAULT
      const resolved = resolvePath(state, dirfd, rawPath)
      if (resolved.errno != null) return resolved.errno
      return fs.unlink(resolved.path)
    },
    path_rename(oldDirfd, oldPathPtr, oldPathLen, newDirfd, newPathPtr, newPathLen) {
      const from = readString(state, oldPathPtr, oldPathLen)
      const to = readString(state, newPathPtr, newPathLen)
      if (from == null || to == null) return ERRNO.EFAULT
      const oldResolved = resolvePath(state, oldDirfd, from)
      if (oldResolved.errno != null) return oldResolved.errno
      const newResolved = resolvePath(state, newDirfd, to)
      if (newResolved.errno != null) return newResolved.errno
      return fs.rename(oldResolved.path, newResolved.path)
    },
    path_link() {
      return ERRNO.ENOTSUP
    },
    path_symlink() {
      return ERRNO.ENOTSUP
    },
    path_readlink() {
      return ERRNO.ENOTSUP
    },
    path_filestat_set_times() {
      return ERRNO.SUCCESS
    },
    path_filestat_set_size() {
      return ERRNO.ENOTSUP
    },

    // ---------------------------------------------------------------- 轮询 / 其他
    poll_oneoff(inPtr, outPtr, count, neventsPtr) {
      const subscriptions = Number(count)
      if (!Number.isInteger(subscriptions) || subscriptions < 0) return ERRNO.EINVAL
      if (!inBounds(state, inPtr, subscriptions * 48) || !inBounds(state, outPtr, subscriptions * 32) || !inBounds(state, neventsPtr, 4)) {
        return ERRNO.EFAULT
      }
      const view = viewOf(state)
      const now = performance.now()
      const events = []
      let waitMs = 0
      let hasImmediate = false

      for (let index = 0; index < subscriptions; index += 1) {
        const at = inPtr + index * 48
        const userdata = view.getBigUint64(at, true)
        const type = view.getUint8(at + 8)
        if (type === 0) {
          const absolute = view.getUint16(at + 40, true) & 1
          const timeout = Number(view.getBigUint64(at + 24, true)) / 1e6
          const due = absolute ? timeout - now : timeout
          waitMs = Math.max(waitMs, Math.min(Math.max(due, 0), 60_000))
          events.push({ userdata, type: 0, nbytes: 0n, flags: 0 })
        } else if (type === 1 || type === 2) {
          const fd = view.getUint32(at + 16, true)
          const entry = state.fds.get(fd)
          let ready = false
          let nbytes = 0n
          let flags = 0
          if (entry) {
            if (type === 1) {
              const available = entry.kind === 'stdin'
                ? state.stdin.length - state.stdinOffset
                : entry.kind === 'file'
                  ? entry.node.data.length - entry.offset
                  : 0
              ready = available > 0 || entry.kind === 'stdin'
              nbytes = BigInt(Math.max(available, 0))
              flags = available > 0 ? 0 : 1
            } else {
              ready = true
            }
          }
          if (ready) {
            events.push({ userdata, type, nbytes, flags })
            hasImmediate = true
          }
        }
      }

      // 有就绪事件就不睡；只有时钟订阅时才阻塞到最早那一个到期。
      if (waitMs > 0 && !hasImmediate) pollSleep(waitMs)
      if (events.length === 0) {
        // 没有时钟、也没有就绪 fd：真实语义是永久阻塞。宿主不能假装有事件，
        // 返回 EINVAL 让调用方看得见（编译器与运行期都不会走到这里）。
        return ERRNO.EINVAL
      }
      events.forEach((event, index) => {
        const at = outPtr + index * 32
        view.setBigUint64(at, event.userdata, true)
        view.setUint16(at + 8, 0, true)
        view.setUint8(at + 10, event.type)
        view.setBigUint64(at + 16, event.nbytes, true)
        view.setUint16(at + 24, event.flags, true)
      })
      view.setUint32(neventsPtr, events.length, true)
      return ERRNO.SUCCESS
    },
    sched_yield() {
      return ERRNO.SUCCESS
    },
    fd_advise() {
      return ERRNO.SUCCESS
    },
    fd_allocate() {
      return ERRNO.ENOTSUP
    },
    fd_datasync() {
      return ERRNO.SUCCESS
    },
    fd_sync() {
      return ERRNO.SUCCESS
    },
    fd_tell(fd, offsetPtr) {
      const entry = state.fds.get(fd)
      if (!entry || entry.kind !== 'file') return ERRNO.ESPIPE
      if (!inBounds(state, offsetPtr, 8)) return ERRNO.EFAULT
      viewOf(state).setBigUint64(offsetPtr, BigInt(entry.offset), true)
      return ERRNO.SUCCESS
    },
    sock_accept() {
      return ERRNO.ENOTSUP
    },
    sock_recv() {
      return ERRNO.ENOTSUP
    },
    sock_send() {
      return ERRNO.ENOTSUP
    },
    sock_shutdown() {
      return ERRNO.ENOTSUP
    },
  }
}

function formatTrap(error) {
  const name = error?.constructor?.name ?? 'Error'
  return `${name}: ${error?.message ?? String(error)}`
}

/**
 * 跑一颗 WASI 模块。
 *
 * @param {WebAssembly.Module} module 已编译的模块（调用方负责缓存，别每次重编）
 * @param {{
 *   args?: string[], env?: Record<string, string>,
 *   files?: Record<string, { content?: string | Uint8Array } | string | Uint8Array>,
 *   fs?: MemoryFs, stdin?: string | Uint8Array, readOnly?: string[],
 *   onStdout?: (chunk: string) => void, onStderr?: (chunk: string) => void,
 * }} options
 * @returns {{
 *   ok: boolean, exitCode: number, stdout: string, stderr: string,
 *   runMs: number, memoryBytes: number, sbrkFailures: number | null,
 *   trap: string, fs: MemoryFs, state: object,
 * }}
 */
export function runWasiModule(module, options = {}) {
  const state = createState(options)
  const functions = buildImports(state)
  if (typeof options.trace === 'function') {
    const decodeAt = (ptr, length) => {
      try {
        return new TextDecoder().decode(new Uint8Array(state.memory.buffer, ptr, length))
      } catch {
        return '?'
      }
    }
    const pathArgs = {
      path_open: [2, 3],
      path_filestat_get: [2, 3],
      path_create_directory: [1, 2],
      path_remove_directory: [1, 2],
      path_unlink_file: [1, 2],
      path_readlink: [1, 2],
      path_rename: [1, 2, 4, 5],
      path_link: [1, 2, 4, 5],
      path_symlink: [0, 1, 3, 4],
    }
    for (const [name, fn] of Object.entries(functions)) {
      functions[name] = (...args) => {
        const result = fn(...args)
        const positions = pathArgs[name]
        const detail = positions
          ? positions.map((index, offset) => (offset % 2 === 0 ? `"${decodeAt(args[index], args[index + 1])}"` : '')).filter(Boolean).join(' -> ')
          : ''
        options.trace(name, args, result, detail)
        return result
      }
    }
  }
  const imports = { wasi_snapshot_preview1: functions, wasi_unstable: functions }
  let instance

  try {
    instance = new WebAssembly.Instance(module, imports)
  } catch (error) {
    return {
      ok: false,
      exitCode: 134,
      stdout: '',
      stderr: '',
      runMs: 0,
      memoryBytes: 0,
      sbrkFailures: null,
      trap: `instantiate: ${formatTrap(error)}`,
      fs: state.fs,
      state,
    }
  }

  state.memory = instance.exports.memory
  if (!state.memory) {
    return {
      ok: false,
      exitCode: 134,
      stdout: '',
      stderr: '',
      runMs: 0,
      memoryBytes: 0,
      sbrkFailures: null,
      trap: 'module 没有导出 memory',
      fs: state.fs,
      state,
    }
  }

  const startedAt = performance.now()
  let exitCode = 0
  let trap = ''
  try {
    if (typeof instance.exports._start !== 'function') throw new Error('模块没有导出 _start')
    instance.exports._start()
  } catch (error) {
    if (error instanceof WasiExit) {
      exitCode = error.code
    } else {
      trap = formatTrap(error)
      exitCode = 134
    }
  }
  const runMs = performance.now() - startedAt

  // 探针是链接期塞进用户产物的（`--export=__oj_sbrk_get`）。拿不到就返回 null，
  // 上层据此退回旧判据，绝不能把「没有证据」当成「没有失败」。
  let sbrkFailures = null
  try {
    if (typeof instance.exports.__oj_sbrk_get === 'function') {
      const value = instance.exports.__oj_sbrk_get()
      if (Number.isInteger(value)) sbrkFailures = value
    }
  } catch {
    /* 探针自己炸了就当没有；不影响本次运行结论 */
  }

  const stdout = state.stdout.join('') + state.stdoutDecoder.decode()
  const stderr = state.stderr.join('') + state.stderrDecoder.decode()

  return {
    ok: exitCode === 0 && !trap,
    exitCode,
    stdout,
    stderr,
    // 保留到 0.1ms，**不取整**：这一代只计 `_start()`，`cout` 一行这种程序真的跑不到
    // 1ms，取整会把它们全显示成 `0 ms`，看起来像没运行。TLE 判定吃的是同一个值
    // （wasmRuntime 拿它与用例时限比），保留小数只会更准，不会更松。
    runMs: Math.round(runMs * 10) / 10,
    memoryBytes: state.memory.buffer.byteLength,
    sbrkFailures,
    trap,
    fs: state.fs,
    state,
  }
}

/** 给 worker 用：先建一棵常驻文件树，多次调用只换模块与 argv。 */
export function createWasiState(options) {
  return createState(options)
}
