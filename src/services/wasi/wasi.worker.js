/**
 * 阶段 4 的 C++ 宿主 Worker。
 *
 * 这里只做三件事：
 *   1. 第一次 init 时把 sysroot 解成 MemoryFs、把 clang 编成 `WebAssembly.Module`，
 *      之后**常驻**（不再每次 run 重新实例化 + 整份 clone）；wasm-ld 是第二档资产，
 *      只在真正要 link 时才拉（见 ensureLinker）；
 *   2. 按消息跑 compile / link / run / syntax，只回传结果与产物字节；
 *   3. stdout / stderr 按 64 KiB 回传（带消息 id，见 `streamer`）；**另有一份逐字节镜像**
 *      写进主线程开的 SharedArrayBuffer（见 stdoutMirror.js），terminate 之后主线程靠它
 *      取回已经打印出来的部分 —— 消息那条路只够「通常够用」，TLE 必丢尾巴。
 *
 *   ⚠️ 输出**只走增量这一条路**，`result` 里不再带整份 stdout/stderr（`captureOutput: false`）。
 *   同一条输出传两遍会让峰值内存翻倍，结构化克隆那一整串时还要把它再读一次 ——
 *   「一个 while(1) 打印把标签页卡死」就是从这里来的。两个上限都由宿主侧兜（见 emit）。
 *
 * 同步执行是刻意的：`runWasiModule` 是同步的，阻塞的只是这个 worker；
 * 主线程的看门狗用 `worker.terminate()` 就能打断死循环，代价是下次要重新 init。
 */

import { MemoryFs, runWasiModule } from './host.js'
import {
  TOOLCHAIN_ASSET_KEYS,
  TOOLCHAIN_ASSET_LABELS,
  TOOLCHAIN_ERROR,
  createToolchainError,
  decodeNetworkAsset,
  inspectToolchain,
  openToolchainAsset,
} from '../toolchainStore.js'
import { untarFiles } from './tar.js'
import { wrapMirror } from './stdoutMirror.js'

// BOOTED 握手（2026-11-22）：脚本**成功求值**的第一时间报一声，主线程拿它把
// 「脚本没加载出来（离线缺 chunk）」与「脚本在、只是 init 慢 / 崩了」分开。
// 这行必须在任何 await / 异步初始化之前 —— onerror 往往在模块求值失败时就触发。
self.postMessage({ type: 'booted' })

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
/** 链接器解压态字节数（进度条分母，来自桶里的 manifest） */
let linkerBytes = 0
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
 * 攒批回传一路输出（stdout 或 stderr）。
 *
 * **带消息 id**：主线程靠它把「terminate 之后才送到的那几条」认出来扔掉 —— 否则上一次
 * 运行的尾巴会混进下一次的 ACTUAL（这条曾经只能靠 `result.stdout` 覆盖掉才不出事）。
 *
 * **result 里不再带第二份整串**（见各分支的 `captureOutput: false`）：同一条输出传两遍，
 * 峰值内存翻倍；而结构化克隆那一整串时要把几 MB 再读一次，正是「输出爆炸就卡死」的直接来源。
 */
function streamer(id, kind) {
  let buffer = ''
  return {
    onChunk(chunk) {
      buffer += chunk
      if (buffer.length >= 64 * 1024) {
        post({ type: kind, id, text: buffer })
        buffer = ''
      }
    },
    flush() {
      if (!buffer) return
      post({ type: kind, id, text: buffer })
      buffer = ''
    },
  }
}

/**
 * Pass-through wrapper that reports **decoded (uncompressed) byte** progress.
 *
 * The caller's denominator comes from the cached manifest's `uncompressedSize`,
 * never from a response header: `.gzbin` is gzip bytes on disk (clang 22.6MB),
 * while this stream yields 77.3MB after `DecompressionStream`. Constructing a
 * new Response keeps the headers, so `Content-Type: application/wasm` survives
 * and `WebAssembly.compileStreaming` still works.
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

/** manifest 里的解压态字节数 → `{ clang, linker, sysroot }`；没有 manifest 时返回 null */
function sizesFromManifest(manifest) {
  if (!manifest?.assets) return null
  const sizes = {}
  for (const asset of manifest.assets) sizes[asset.key] = asset.uncompressedSize
  return sizes
}

/**
 * 读一件资产：Cache Storage 优先（新 `.gzbin` → 旧 `.br`），未命中才回退网络。
 *
 * 正常情况下永远不会走到网络：页面在 init 之前已经把三件套写进桶并提交了 manifest
 * （runnoSandbox 的 ensureToolchainDownloaded）。网络分支只是兜底 —— 例如用户手动
 * 清了 Cache Storage、或者用旧客户端跑了新 worker。解压口径与页面侧共用
 * toolchainStore.decodeNetworkAsset，避免两处对 content-encoding 的判断分叉。
 *
 * 返回值带 `source`：后面解压 / 编译失败时，只有缓存来源才映射成 TOOLCHAIN_CORRUPTED
 * （网络来源更可能是中间层改了字节，诊断里要能分开）。
 */
async function openAsset(key, url, contentType) {
  const cached = await openToolchainAsset(key)
  if (cached) return { response: cached, source: 'cache' }
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} 下载失败（HTTP ${response.status}）`)
  return { response: decodeNetworkAsset(response, contentType), source: 'network' }
}

/**
 * 流式读取 / 解压 / 编译失败 → 统一映射成 TOOLCHAIN_CORRUPTED。
 *
 * 两个入口都要收：`DecompressionStream` 在读到坏字节时会抛（半截文件、双层 gzip），
 * `WebAssembly.compileStreaming` 则在 magic word / 段结构不对时抛。它们的原生措辞
 * 对用户没有信息量，而恢复动作完全一样：删掉重下。
 */
function corruptedError(key, source, error, firstError = null) {
  if (error?.code) return error
  const file = TOOLCHAIN_ASSET_LABELS[key] ?? key
  return createToolchainError(
    TOOLCHAIN_ERROR.CORRUPTED,
    `toolchain asset ${file} failed to decode (${source})`,
    {
      asset: key,
      file,
      source,
      cause: String(error?.message ?? error),
      ...(firstError ? { firstCause: String(firstError?.message ?? firstError) } : {}),
    },
  )
}

async function compileAsset(key, url, total) {
  const opened = await openAsset(key, url, 'application/wasm')
  // 先走 streaming（能吃到浏览器的 wasm 代码缓存）；不行再退回整包编译。
  try {
    return await WebAssembly.compileStreaming(trackProgress(opened.response, key, total))
  } catch (firstError) {
    // 流已经被 compileStreaming 消费掉一半，不能复用；重新从缓存开一份
    const retry = await openAsset(key, url, 'application/wasm')
    try {
      return await WebAssembly.compile(await retry.response.arrayBuffer())
    } catch (error) {
      throw corruptedError(key, retry.source, error, firstError)
    }
  }
}

/**
 * 运行前轻量 preflight（<5ms）：manifest 存在、三件命中、每件的 `x-cp-size`
 * 与 manifest 的 compressedSize 一致。**不读 body** —— 真实字节的兜底在写后复验
 * （页面侧 putAsset）与下面的流式读取（corruptedError）。
 *
 * 缺件时把 `missing` 放进 detail，界面文案直接可用（如 ['wasm-ld']）。
 * `lastInstalledAt` 由页面通过 init 消息传进来：Worker 里没有 localStorage，
 * 但 EVICTED / NOT_INSTALLED 的分流必须在出错现场做。
 */
async function preflight(message) {
  const inspection = await inspectToolchain(TOOLCHAIN_ASSET_KEYS, {
    lastInstalledAt: message.lastInstalledAt ?? 0,
  })
  if (inspection.status === 'ready') return inspection

  const code =
    inspection.status === 'evicted'
      ? TOOLCHAIN_ERROR.EVICTED
      : inspection.status === 'partial'
        ? TOOLCHAIN_ERROR.PARTIAL
        : TOOLCHAIN_ERROR.NOT_INSTALLED
  throw createToolchainError(code, `toolchain preflight: ${inspection.status}`, {
    status: inspection.status,
    missing: inspection.missing.map((key) => TOOLCHAIN_ASSET_LABELS[key] ?? key),
    missingKeys: inspection.missing,
    hasManifest: Boolean(inspection.manifest),
  })
}

async function init(message) {
  const inspection = await preflight(message)
  const sizes = sizesFromManifest(inspection.manifest) ?? message.assetSizes ?? {}
  const sysrootTask = openAsset('sysroot', message.sysrootURL, 'application/x-tar').then(
    async (opened) => {
      try {
        const buffer = await trackProgress(opened.response, 'sysroot', sizes.sysroot).arrayBuffer()
        return { tar: new Uint8Array(buffer), source: opened.source }
      } catch (error) {
        throw corruptedError('sysroot', opened.source, error)
      }
    },
  )
  const [clang, sysroot] = await Promise.all([
    compileAsset('clang', message.clangURL, sizes.clang),
    sysrootTask,
  ])
  const tar = sysroot.tar
  let untarred
  try {
    untarred = untarFiles(tar)
  } catch (error) {
    throw corruptedError('sysroot', sysroot.source, error)
  }
  const { files, count } = untarred
  if (!files[message.universalHeaderPath]) {
    files[message.universalHeaderPath] = encoder.encode(message.universalHeader)
  }
  clangModule = clang
  // 链接器不在 init 里编：`-fsyntax-only` / `-code-completion-at` 只跑到 clang 前端，
  // 永远用不到它。**但字节已经随三件套一起下好了**（见 toolchainStore），
  // 所以真正点「运行」时只是从桶里读 + 解压 + compileStreaming，没有网络等待。
  linkerURL = message.linkerURL
  linkerBytes = sizes.linker ?? 0
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
    lldPromise = compileAsset('linker', linkerURL, linkerBytes)
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
 * 下次 link 会重新从 Cache Storage 取同一份 `.gzbin`、解压并重编：本地、无网络，
 * 代价是一次 compileStreaming（实测远小于常驻那百来 MB）。正在跑的那条消息手里
 * 有自己的局部引用，这里清模块级变量不会把在飞的链接器抽走。
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
    linkerBytes = 0
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
    const outStream = streamer(message.id, 'stdout')
    const errStream = streamer(message.id, 'stderr')
    const result = runWasiModule(tool, {
      args: message.tool === 'ld' ? ['wasm-ld', ...message.args] : ['clang', ...message.args],
      fs: baseFs,
      // 输出只走增量回传，worker 里不留整串（见 streamer 的注释）
      captureOutput: false,
      onStdout: outStream.onChunk,
      onStderr: errStream.onChunk,
    })
    outStream.flush()
    errStream.flush()
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
      stdoutTruncated: result.stdoutTruncated,
      stderrTruncated: result.stderrTruncated,
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
    // 链接器是第二档资产：第一次走到这里才下载 + 编译（见 ensureLinker）。
    // 下载耗时算在这条 link 消息的 60s 编译看门狗里；它通常已经在缓存里了。
    const lld = await ensureLinker()
    const outStream = streamer(message.id, 'stdout')
    const errStream = streamer(message.id, 'stderr')
    try {
      const result = runWasiModule(lld, {
        args: ['wasm-ld', ...message.args],
        fs: baseFs,
        captureOutput: false,
        onStdout: outStream.onChunk,
        onStderr: errStream.onChunk,
      })
      outStream.flush()
      errStream.flush()
      const binary = readFile(message.outputPath)
      return {
        exitCode: result.exitCode,
        stdoutTruncated: result.stdoutTruncated,
        stderrTruncated: result.stderrTruncated,
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
      return { exitCode: 134, stdoutTruncated: false, stderrTruncated: false, trap: `compile: ${String(error)}`, runMs: 0, memoryBytes: 0, sbrkFailures: null, cold: false }
    }
    const stdin = message.stdin instanceof Uint8Array ? message.stdin : encoder.encode(message.stdin ?? '')
    // 主线程开的镜像：它在 terminate 之后仍可读，是本条路径上「TLE 不丢输出」的唯一保证。
    const outMirror = message.stdoutSAB ? wrapMirror(message.stdoutSAB) : null
    const outStream = streamer(message.id, 'stdout')
    const errStream = streamer(message.id, 'stderr')
    const result = runWasiModule(module, {
      args: ['program', ...(message.args ?? [])],
      fs: new MemoryFs({}, []),
      stdin,
      outMirror,
      // 判题只用得到增量回传出来的那份；worker 里不再留整串，
      // 一次几 MiB 的输出因此只剩 64 KiB 的攒批缓冲 + 8 MiB 镜像。
      captureOutput: false,
      onStdout: outStream.onChunk,
      onStderr: errStream.onChunk,
    })
    outStream.flush()
    errStream.flush()
    return {
      exitCode: result.exitCode,
      stdoutTruncated: result.stdoutTruncated,
      stderrTruncated: result.stderrTruncated,
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
    post({
      type: 'error',
      id: message.id,
      stage: message.type,
      error: String(error?.message ?? error),
      // 结构化错误码 + 可诊断的 detail（page 侧据此翻译文案、诊断面板原样展示）
      ...(error?.code ? { code: error.code } : {}),
      ...(error?.detail ? { detail: error.detail } : {}),
    })
  }
}
