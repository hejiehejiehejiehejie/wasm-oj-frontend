/**
 * 阶段 4 的 C++ 宿主 Worker。
 *
 * 这里只做三件事：
 *   1. 第一次 init 时把 sysroot 解成 MemoryFs、把 clang 编成 `WebAssembly.Module`，
 *      之后**常驻**（不再每次 run 重新实例化 + 整份 clone）；wasm-ld 是第二档资产，
 *      只在真正要 link 时才拉（见 ensureLinker）；
 *   2. 按消息跑 compile / link / run / syntax，输出只回传结果与产物字节；
 *   3. stdout / stderr 按 64 KiB 回传；**另有一份逐字节镜像**写进主线程开的
 *      SharedArrayBuffer（见 stdoutMirror.js），terminate 之后主线程靠它取回
 *      已经打印出来的部分 —— 消息那条路只够「通常够用」，TLE 必丢尾巴。
 *
 * 同步执行是刻意的：`runWasiModule` 是同步的，阻塞的只是这个 worker；
 * 主线程的看门狗用 `worker.terminate()` 就能打断死循环，代价是下次要重新 init。
 */

import { MemoryFs, runWasiModule } from './host.js'
import { untarFiles } from './tar.js'
import { wrapMirror } from './stdoutMirror.js'

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
/** 在途的链接器下载（单飞）：语义悬停 / 语法检查一辈子走不到这条 */
let lldPromise = null
let linkerURL = ''
let baseFs = null
let pchSource = ''
let oomProbeObject = null
/**
 * 已经装进 baseFs 的那份 PCH（按对象身份比较）。
 *
 * 主线程每条带 pch 的消息都会结构化克隆出一份 18.37MB 的字节；装进 FS 时再写一次
 * `/stdc++.h.pch` 就会把上一个 18MB 节点整个换掉。主线程那边已经改成「每代 worker
 * 只发一次」，这里按身份再拦一道，防止漏网的消息白抄一份。
 */
let installedPchRef = null

function post(message, transfer) {
  self.postMessage(message, transfer ?? [])
}

/**
 * Pass-through wrapper that reports decoded (uncompressed) byte progress.
 *
 * The caller's denominator is the uncompressed size, never `content-length`:
 * after br decoding the body is 77.30MB for clang while the wire header says
 * 14.24MB, and the service worker removes `content-length` entirely for
 * entries it re-encodes as gzip. Constructing a new Response keeps the
 * original headers, so `Content-Type: application/wasm` survives and
 * `WebAssembly.compileStreaming` still works.
 */
function trackProgress(response, key, total) {
  if (!key || !response.body || typeof TransformStream === 'undefined') return response
  let loaded = 0
  const stream = response.body.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        loaded += chunk.byteLength
        post({ type: 'asset-progress', key, loaded, total })
        controller.enqueue(chunk)
      },
    }),
  )
  return new Response(stream, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}

async function fetchModule(url, key, total) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} 下载失败（HTTP ${response.status}）`)
  // 先走 streaming（能吃到浏览器的 wasm 代码缓存）；不行再退回整包编译。
  try {
    return await WebAssembly.compileStreaming(trackProgress(response.clone(), key, total))
  } catch {
    return WebAssembly.compile(await response.arrayBuffer())
  }
}

async function init(message) {
  const sizes = message.assetSizes ?? {}
  const [sysrootResponse, clang] = await Promise.all([
    fetch(message.sysrootURL),
    fetchModule(message.clangURL, 'clang', sizes.clang),
  ])
  if (!sysrootResponse.ok) throw new Error(`sysroot 下载失败（HTTP ${sysrootResponse.status}）`)
  const tar = new Uint8Array(
    await trackProgress(sysrootResponse, 'sysroot', sizes.sysroot).arrayBuffer(),
  )
  const { files, count } = untarFiles(tar)
  if (!files[message.universalHeaderPath]) {
    files[message.universalHeaderPath] = encoder.encode(message.universalHeader)
  }
  clangModule = clang
  // 链接器不在 init 里下：`-fsyntax-only` / `-code-completion-at` 只跑到 clang 前端，
  // 永远用不到它。8.1MB br 与一次 compileStreaming 留给真正点「运行」的那一刻。
  linkerURL = message.linkerURL
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

/**
 * 按需把 wasm-ld 拉进来（第二档资产）。
 *
 * 只有走 link 的那条路才需要它：编译（cc1 -emit-obj）、语法检查、语义悬停都停在前端。
 * 所以 init 不再无条件付这 8.1MB 的下载与编译；第一次点「运行」时才付。
 *
 * **用完整份丢掉**（见 releaseLinker）：`WebAssembly.Module` 不是「几页机器码」——
 * V8 会保留 43.5MB 解压后的 wire bytes 供惰性编译 / tier-up，再加上编出来的代码页，
 * 常驻是百 MB 级。判题里一份代码只链接一次，留着的收益远小于它占的 RSS。
 *
 * 失败时清掉在途 promise，下一次点运行还能重试 —— 一次断网不该让这个会话永远不能链接。
 */
async function ensureLinker() {
  if (lldModule) return lldModule
  if (!linkerURL) throw new Error('宿主还没 init')
  if (!lldPromise) {
    lldPromise = fetchModule(linkerURL)
      .then((module) => {
        lldModule = module
        return module
      })
      .catch((error) => {
        lldPromise = null
        throw error
      })
  }
  return lldPromise
}

/**
 * 放开对 wasm-ld 模块的引用，让 V8 回收它的 wire bytes 与 JIT 代码页。
 *
 * 下次 link 会重新从 Cache Storage 取同一份 `.br` 并重编：本地、无网络，代价是一次
 * compileStreaming（实测远小于常驻那百来 MB）。正在跑的那条消息手里有自己的局部引用，
 * 这里清模块级变量不会把在飞的链接器抽走。
 */
function releaseLinker() {
  lldModule = null
  lldPromise = null
}

async function ensureReady() {
  if (!baseFs || !clangModule) throw new Error('宿主还没 init')
}

function readFile(path) {
  const node = baseFs?.nodes.get(path)
  return node && node.type === 'file' ? node.data : null
}

function writeFile(path, data, mtime = null) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  if (baseFs.nodes.has(path)) {
    const node = baseFs.nodes.get(path)
    // capacity 必须跟着换：MemoryFs 的写入是「后备缓冲 + 逻辑长度」两本账，
    // 只换 data 会留下一个比真实缓冲大的陈旧容量。
    node.data = bytes
    node.capacity = bytes.length
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
 *
 * ⚠️ 但它带来一个副作用：**这份 Module 的第一遍执行跑在 V8 的 Liftoff 基线代码上**
 * （wasm 是分层编译，热函数要等 TurboFan 编译完才切过去），实测同一份程序首遍比稳态慢
 * **25–40%**（2026-10-26：1M 循环 2.5 → 1.6 ms、100M 197.6 → 150.9 ms、300M 602.9 → 427.6 ms）。
 * 于是「命中的那个第一个用例」总是偏高、甚至会误判 TLE。判据交给上层：这里如实回报
 * `cold`（这一遍是不是刚 `compile` 出来的 Module），由 wasmRuntime 决定预热，别在这儿偷偷跑两遍。
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
  // 同一份字节不重装：主线程已经改成「每代 worker 只发一次」，这里按对象身份再拦一道。
  // 少了这道，每条漏网的带 pch 消息都会把 `/stdc++.h.pch` 那个 18MB 节点整个换掉。
  if (installedPchRef === bytes) return
  writeFile('/stdc++.h', encoder.encode(pchSource), PCH_SOURCE_MTIME)
  writeFile('/stdc++.h.pch', bytes)
  installedPchRef = bytes
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
    lldPromise = null
    linkerURL = ''
    installedPchRef = null
    moduleCache = null
    ready = null
    return {}
  }
  await ensureReady()
  if (type === 'preload') return { oomProbe: oomProbeObject }

  const tool = message.tool === 'ld' ? await ensureLinker() : clangModule
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
    // 这条分支只有历史调用方会带 tool: 'ld'；同样不要让它把链接器留在常驻里
    if (message.tool === 'ld') releaseLinker()
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
    // 链接器是第二档资产：第一次走到这里才下载 + 编译（见 ensureLinker）。
    // 下载耗时算在这条 link 消息的 60s 编译看门狗里；它通常已经在缓存里了。
    const lld = await ensureLinker()
    try {
      const result = runWasiModule(lld, {
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
    } finally {
      // 链接成功、失败、trap 都要放开：它常驻的 wire bytes + JIT 页是百 MB 级，
      // 而这份代码的链接结果已经被上层缓存，下一次 link 只会发生在换代码之后。
      releaseLinker()
    }
  }
  if (type === 'run') {
    const binary = message.binary instanceof Uint8Array ? message.binary : new Uint8Array(message.binary)
    let module
    // 这一遍是不是这份产物在本 worker 里的**第一次**执行（= Module 刚编出来）：
    // 首遍跑在 Liftoff 上，比后面几遍慢 25–40%（见上面 moduleCache 那段），
    // 上层据此决定「不计时地先预热一遍」。
    let cold = false
    try {
      const key = fingerprint(binary)
      if (moduleCache?.key !== key) {
        moduleCache = { key, module: await WebAssembly.compile(binary) }
        cold = true
      }
      module = moduleCache.module
    } catch (error) {
      return { exitCode: 134, stdout: '', stderr: '', trap: `compile: ${String(error)}`, runMs: 0, memoryBytes: 0, sbrkFailures: null, cold: false }
    }
    const stdin = message.stdin instanceof Uint8Array ? message.stdin : encoder.encode(message.stdin ?? '')
    // 主线程开的镜像：它在 terminate 之后仍可读，是本条路径上「TLE 不丢输出」的唯一保证。
    const outMirror = message.stdoutSAB ? wrapMirror(message.stdoutSAB) : null
    let out = ''
    let err = ''
    const result = runWasiModule(module, {
      args: ['program', ...(message.args ?? [])],
      fs: new MemoryFs({}, []),
      stdin,
      outMirror,
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
      cold,
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
