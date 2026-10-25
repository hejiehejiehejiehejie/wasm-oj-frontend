/**
 * 阶段 4 的 C++ 宿主 Worker。
 *
 * 这里只做三件事：
 *   1. 第一次 init 时把 sysroot 解成 MemoryFs、把 clang / wasm-ld 编成
 *      `WebAssembly.Module`，之后**常驻**（不再每次 run 重新实例化 + 整份 clone）；
 *   2. 按消息跑 compile / link / run / syntax，输出只回传结果与产物字节；
 *   3. stdout / stderr 按 64 KiB 回传，主线程被 terminate 时至少保留已经吐出来的部分。
 *
 * 同步执行是刻意的：`runWasiModule` 是同步的，阻塞的只是这个 worker；
 * 主线程的看门狗用 `worker.terminate()` 就能打断死循环，代价是下次要重新 init。
 */

import { MemoryFs, runWasiModule } from './host.js'
import { untarFiles } from './tar.js'

const encoder = new TextEncoder()
const decoder = new TextDecoder()
// PCH 会校验原始头的 mtime；这个值必须在「生成」和「加载」两次都稳定，
// 否则刷新后从 IndexedDB 取回 PCH 会报 `/stdc++.h has been modified`。
const PCH_SOURCE_MTIME = 1_700_000_000_000
// sysroot 里的头也一并在校验范围内（实测报的是 `__memory/allocator.h`、`ios` 这些），
// 所以整份 sysroot 也要钉同一个常量 —— 用 Date.now() 每次 init 都不一样。
const SYSROOT_MTIME = 1_700_000_000_000

let ready = null
let clangModule = null
let lldModule = null
let baseFs = null
let pchSource = ''
let oomProbeObject = null

function post(message, transfer) {
  self.postMessage(message, transfer ?? [])
}

async function fetchModule(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} 下载失败（HTTP ${response.status}）`)
  // 先走 streaming（能吃到浏览器的 wasm 代码缓存）；不行再退回整包编译。
  try {
    return await WebAssembly.compileStreaming(response.clone())
  } catch {
    return WebAssembly.compile(await response.arrayBuffer())
  }
}

async function init(message) {
  const [sysrootResponse, clang, lld] = await Promise.all([
    fetch(message.sysrootURL),
    fetchModule(message.clangURL),
    fetchModule(message.linkerURL),
  ])
  if (!sysrootResponse.ok) throw new Error(`sysroot 下载失败（HTTP ${sysrootResponse.status}）`)
  const tar = new Uint8Array(await sysrootResponse.arrayBuffer())
  const { files, count } = untarFiles(tar)
  if (!files[message.universalHeaderPath]) {
    files[message.universalHeaderPath] = encoder.encode(message.universalHeader)
  }
  clangModule = clang
  lldModule = lld
  baseFs = new MemoryFs(files, ['/sys'], { sourceMtime: SYSROOT_MTIME })
  pchSource = message.pchSource
  // 内存证据探针在 init 里就编好：它是每次链接都要用的 .o，放在第一次 compile 里
  // 会让「首编」无故多 ~300ms。失败不致命，第一次 compile 时还会再试。
  if (message.oomProbe) {
    try {
      const probe = message.oomProbe
      writeFile(probe.sourcePath, encoder.encode(probe.source))
      runWasiModule(clangModule, { args: ['clang', ...probe.args], fs: baseFs })
      const bytes = readFile(probe.outputPath)
      if (bytes) oomProbeObject = new Uint8Array(bytes)
    } catch {
      oomProbeObject = null
    }
  }
  return { files: count, sysrootBytes: tar.length, oomProbe: oomProbeObject }
}

async function ensureReady() {
  if (!baseFs || !clangModule || !lldModule) throw new Error('宿主还没 init')
}

function readFile(path) {
  const node = baseFs?.nodes.get(path)
  return node && node.type === 'file' ? node.data : null
}

function writeFile(path, data, mtime = null) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  if (baseFs.nodes.has(path)) {
    const node = baseFs.nodes.get(path)
    node.data = bytes
    node.mtime = mtime ?? Date.now()
    return
  }
  const node = baseFs.addFile(path, bytes)
  node.mtime = mtime ?? Date.now()
}

function removeFile(path) {
  const node = baseFs.nodes.get(path)
  if (!node || node.type === 'dir') return
  baseFs.nodes.delete(path)
  const slash = path.lastIndexOf('/')
  const parent = slash <= 0 ? '/' : path.slice(0, slash)
  baseFs.children.get(parent)?.delete(path.slice(slash + 1))
}

/**
 * 产物字节 → `WebAssembly.Module` 的缓存（单槽）。
 *
 * 一批用例跑的是**同一个**二进制，编译一次就够。53 KB 的产物一次 `compile` 只要 1–3 ms，
 * 所以这里省下的是「每个用例几毫秒」，不是大头（「命中编译缓存」实测 95–123 ms 里，
 * 大头是程序自己 2M 次 scanf 的 83–90 ms）。保留是因为成本为零，别把它当成性能解药。
 */
let moduleCache = null

/** FNV-1a 32 位：只用来判断「是不是同一份产物」，不是安全哈希 */
function fingerprint(bytes) {
  let hash = 0x811c9dc5
  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= bytes[i]
    hash = Math.imul(hash, 0x01000193)
  }
  return `${bytes.length}:${hash >>> 0}`
}

function installPch(bytes) {
  if (!bytes) return
  writeFile('/stdc++.h', encoder.encode(pchSource), PCH_SOURCE_MTIME)
  writeFile('/stdc++.h.pch', bytes)
}

async function main(message) {
  const type = message.type
  if (type === 'init') {
    if (!ready) ready = init(message)
    return ready
  }
  if (type === 'dispose') {
    baseFs = null
    clangModule = null
    lldModule = null
    moduleCache = null
    ready = null
    return {}
  }
  await ensureReady()
  if (type === 'preload') return { oomProbe: oomProbeObject }

  const tool = message.tool === 'ld' ? lldModule : clangModule
  if (type === 'compile' || type === 'syntax') {
    if (type === 'compile') removeFile(message.outputPath)
    writeFile(
      message.sourcePath,
      encoder.encode(message.source),
      message.sourcePath === '/stdc++.h' ? PCH_SOURCE_MTIME : null,
    )
    // `compile` 与 `syntax` 都可能带着从 IndexedDB 取回的 PCH：不装进去，刷新之后
    // 每次编译都会退回「无 PCH」（慢 3 倍），而且是静默的 —— clang 只是找不到
    // /stdc++.h.pch，参数里的 -include-pch 变成普通头处理，不报错。
    if (message.pch) installPch(message.pch)
    let out = ''
    let err = ''
    const result = runWasiModule(tool, {
      args: message.tool === 'ld' ? ['wasm-ld', ...message.args] : ['clang', ...message.args],
      fs: baseFs,
      onStdout: (chunk) => {
        out += chunk
        if (out.length >= 64 * 1024) {
          post({ type: 'stdout', text: out })
          out = ''
        }
      },
      onStderr: (chunk) => {
        err += chunk
        if (err.length >= 64 * 1024) {
          post({ type: 'stderr', text: err })
          err = ''
        }
      },
    })
    if (out) post({ type: 'stdout', text: out })
    if (err) post({ type: 'stderr', text: err })
    let object = null
    let binary = null
    if (type === 'compile') {
      object = readFile(message.outputPath)
    } else if (type === 'link') {
      binary = readFile(message.outputPath)
    }
    return {
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      trap: result.trap,
      runMs: result.runMs,
      memoryBytes: result.memoryBytes,
      sbrkFailures: result.sbrkFailures,
      object: object ? new Uint8Array(object) : null,
      binary: binary ? new Uint8Array(binary) : null,
    }
  }
  if (type === 'link') {
    removeFile(message.outputPath)
    writeFile(message.objectPath, message.object)
    if (message.extraFiles) {
      for (const [path, bytes] of Object.entries(message.extraFiles)) writeFile(path, bytes)
    }
    let out = ''
    let err = ''
    const result = runWasiModule(lldModule, {
      args: ['wasm-ld', ...message.args],
      fs: baseFs,
      onStdout: (chunk) => { out += chunk },
      onStderr: (chunk) => { err += chunk },
    })
    if (out) post({ type: 'stdout', text: out })
    if (err) post({ type: 'stderr', text: err })
    const binary = readFile(message.outputPath)
    return {
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      trap: result.trap,
      runMs: result.runMs,
      binary: binary ? new Uint8Array(binary) : null,
    }
  }
  if (type === 'run') {
    const binary = message.binary instanceof Uint8Array ? message.binary : new Uint8Array(message.binary)
    let module
    try {
      const key = fingerprint(binary)
      if (moduleCache?.key !== key) moduleCache = { key, module: await WebAssembly.compile(binary) }
      module = moduleCache.module
    } catch (error) {
      return { exitCode: 134, stdout: '', stderr: '', trap: `compile: ${String(error)}`, runMs: 0, memoryBytes: 0, sbrkFailures: null }
    }
    const stdin = message.stdin instanceof Uint8Array ? message.stdin : encoder.encode(message.stdin ?? '')
    let out = ''
    let err = ''
    const result = runWasiModule(module, {
      args: ['program', ...(message.args ?? [])],
      fs: new MemoryFs({}, []),
      stdin,
      onStdout: (chunk) => {
        out += chunk
        if (out.length >= 64 * 1024) { post({ type: 'stdout', text: out }); out = '' }
      },
      onStderr: (chunk) => {
        err += chunk
        if (err.length >= 64 * 1024) { post({ type: 'stderr', text: err }); err = '' }
      },
    })
    if (out) post({ type: 'stdout', text: out })
    if (err) post({ type: 'stderr', text: err })
    return {
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      trap: result.trap,
      runMs: result.runMs,
      memoryBytes: result.memoryBytes,
      sbrkFailures: result.sbrkFailures,
    }
  }
  throw new Error(`未知消息：${type}`)
}

self.onmessage = async (event) => {
  const message = event.data
  try {
    const result = await main(message)
    const transfer = []
    if (result?.object) transfer.push(result.object.buffer)
    if (result?.binary) transfer.push(result.binary.buffer)
    post({ type: 'result', id: message.id, result }, transfer)
  } catch (error) {
    post({ type: 'error', id: message.id, stage: message.type, error: String(error?.message ?? error) })
  }
}
