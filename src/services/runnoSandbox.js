/**
 * runno 的 C++ 沙箱流水线 —— 在浏览器里用 wasm 版 clang 8 + wasm-ld 编译并运行 C++。
 *
 * 为什么从 Wasmer 换成 runno（https://github.com/taybenlor/runno）：
 * @wasmer/sdk 的 clang 包（约 100MB）只要实例化到 libc++ 头（<vector> / <string>）就会在
 * cc1 的代码生成阶段永久卡死，而且 WASIX 实例没有 cancel API，只能 terminate 整个 Worker。
 * runno 走的是另一条路：binji 的 wasm-clang + 一份 sysroot tar.gz（裸文件约 52MB，
 * 自托管在 public/wasm/ 下，走 Vercel 的压缩传输），
 * 且它的 WASIWorkerHost 提供 kill()，卡死和死循环终于能真正中断。
 *
 * 这里只做流水线：准备工具链 → clang 编译 → wasm-ld 链接 → 跑产物。
 * 「编译 + 链接」的结果按源码原文缓存一份：判题是成批跑用例的，同一份代码
 * 本该只编译一次，否则 N 个用例就要付 N 次编译（老机器上这就是几十秒）。
 * 阶段播报、看门狗、取消时机由 services/wasmRuntime.js 统一负责。
 *
 * 实测踩过的坑（改这段代码前先看一眼）：
 * 1. WASI 的 argv[0] 必须是程序名。漏掉它会让第一个真实参数（比如 -cc1）被当成程序名吃掉，
 *    于是 clang 跑在 driver 模式，报出来的错全是误导性的。
 * 2. cc1 的写法用 runno / binji 的原版：-emit-obj + -internal-isystem <dir>（分开写两个参数）。
 * 3. 绕开 driver 直接调 wasm-ld，就得自己带上 compiler-rt，否则 libc++ 里只要用到
 *    sort / map 就会缺 __lttf2 之类的符号。
 * 4. 静态服务器会给 .gz 文件补 Content-Encoding: gzip，浏览器先替我们解掉一层，
 *    fetch 回来的是裸 tar，再 gunzip 直接失败（原因见 unpackSysroot）。
 */
import { WASIWorkerHost } from '@runno/wasi'
import { deletePch, readPch, writePch } from './pchStore.js'
// 文件记录的形状归 vfs/runnoFs.js 一处管：工具链的 sysroot 和用户 VFS 拍出来的表
// 必须长得一模一样，runno 才认。
import { fsEntry as wasiFile } from './vfs/runnoFs.js'

// 工具链自托管在 public/wasm/<版本>/（原来是 runno.dev 的 CDN）。
// 裸文件体积：clang.wasm 31.2MB、wasm-ld.wasm 19.5MB、clang-fs.tar.gz 1.8MB；
// 仓库里放裸文件即可（Vercel 边缘会压缩传输），不要自己塞 .br —— 会被二次压缩。
// 路径带版本号，升级工具链时换目录名，immutable 缓存自然失效。
//
// 必须是**绝对地址**：runno 把 worker 源码做成 blob: URL 再 new Worker，
// 而 blob: 是非层级 scheme，在它里面解析 '/wasm/…' 这种相对路径会抛 Invalid URL。
// 工具链目录版本号。它有两个用途：拼资源地址，以及当 PCH 存档 id 的一部分
//（升级工具链 = 换目录名 = 旧 PCH 自然作废），所以只能有一处定义。
const TOOLCHAIN_VERSION = '8.0.1'
const ASSETS = `${location.origin}${import.meta.env.BASE_URL}wasm/${TOOLCHAIN_VERSION}`
const CLANG_URL = `${ASSETS}/clang.wasm`
const LINKER_URL = `${ASSETS}/wasm-ld.wasm`
const SYSROOT_URL = `${ASSETS}/clang-fs.tar.gz`

const SOURCE_PATH = '/program.cpp'
const OBJECT_PATH = '/program.o'
const BINARY_PATH = '/program.wasm'
// 万能头就放在 sysroot 的 include 目录里，clang 的 -internal-isystem /sys/include 能直接搜到
const UNIVERSAL_HEADER_PATH = '/sys/include/bits/stdc++.h'

// PCH 的源码与产物都放根目录：根目录是 WASI 的初始工作目录（fd 3），
// 不要指望自己建目录 —— runno 的 path_create_directory 是残缺实现（只会塞一个 .runno 文件）
const PCH_SOURCE_PATH = '/stdc++.h'
const PCH_PATH = '/stdc++.h.pch'

/**
 * 前端（cc1）的公共参数，PCH 生成和用户代码编译必须**逐字共用**这一份。
 *
 * 为什么不能各写各的：PCH 会把语言选项（-std、异常 / RTTI 开关等）和目标选项
 * 一起写进文件签名，加载时逐项校验。给 PCH 单独加 -fno-exceptions、而用户代码
 * 照旧开异常，轻则 clang 直接拒绝这个 PCH，重则混进语义不一致的 libc++ 声明
 * （libc++ 头在 -fno-exceptions 下生成的 AST 是不一样的）。
 * -O0 同理不要动：-emit-pch 只做解析 + 序列化、不做代码生成，改成 -O0 省不下时间，
 * 却会改变 __OPTIMIZE__ 这类预定义宏。
 */
const FRONTEND_ARGS = [
  '-isysroot',
  '/sys',
  '-internal-isystem',
  '/sys/include/c++/v1',
  '-internal-isystem',
  '/sys/include',
  '-internal-isystem',
  '/sys/lib/clang/8.0.1/include',
  '-ferror-limit',
  '4',
  '-fmessage-length',
  '80',
  // 不要开 -fcolor-diagnostics：诊断信息会带上 ANSI 颜色码，而测试卡片是纯文本渲染
  // clang 8 的 cc1 默认只到 gnu++14，竞赛代码要 c++17（结构化绑定、if 初始化等）
  '-std=c++17',
  '-O2',
]

/**
 * clang 的 cc1 命令行。
 * @param {string | null} pchPath 非空时把 PCH 当作 TU 的前缀加载（阶段 4）；
 *   -include-pch 必须出现在输入文件之前，所以插在 -x 之前
 */
function clangArgs(pchPath) {
  return [
    '-cc1',
    '-emit-obj',
    '-disable-free',
    ...FRONTEND_ARGS,
    ...(pchPath ? ['-include-pch', pchPath] : []),
    '-o',
    OBJECT_PATH,
    '-x',
    'c++',
    SOURCE_PATH,
  ]
}

/**
 * 生成 PCH 用的 cc1 命令行。
 *
 * 注意这里走的还是 cc1 直连，不是 `clang -x c++-header ... -emit-pch` 那条 driver 语法：
 * 我们从来没有 driver（见文件头「坑 1」，argv[0] 一错就退化成 driver 模式报一堆误导错误），
 * 只能把 driver 会展开的东西手写出来 —— 即 -emit-pch 配 -x c++-header。
 */
const PCH_ARGS = [
  '-cc1',
  '-emit-pch',
  ...FRONTEND_ARGS,
  '-o',
  PCH_PATH,
  '-x',
  'c++-header',
  PCH_SOURCE_PATH,
]

const LINKER_ARGS = [
  '--no-threads',
  '--export-dynamic',
  '-z',
  'stack-size=1048576',
  '-L/sys/lib/wasm32-wasi',
  '-L/sys/lib/clang/8.0.1/lib/wasi',
  '/sys/lib/wasm32-wasi/crt1.o',
  OBJECT_PATH,
  '-lc',
  '-lc++',
  '-lc++abi',
  '/sys/lib/clang/8.0.1/lib/wasi/libclang_rt.builtins-wasm32.a',
  '-o',
  BINARY_PATH,
]

// clang 带的是 libc++，没有 GCC 的 <bits/stdc++.h>，自己补一个同名头进去。
// 顶着这个名字就得对得起它：把竞赛里会用到、且这套 sysroot 确实有的头都列上
// （逐个核对过存在性）。线程 / 文件系统 / 正则这些在 wasm 里没意义的就没放。
const UNIVERSAL_HEADER = `#ifndef OJ_SANDBOX_BITS_STDCXX_H
#define OJ_SANDBOX_BITS_STDCXX_H
#include <iostream>
#include <iomanip>
#include <sstream>
#include <string>
#include <vector>
#include <deque>
#include <list>
#include <queue>
#include <stack>
#include <set>
#include <map>
#include <unordered_map>
#include <unordered_set>
#include <bitset>
#include <algorithm>
#include <numeric>
#include <functional>
#include <iterator>
#include <utility>
#include <tuple>
#include <array>
#include <limits>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <cstdlib>
#include <cctype>
#include <cassert>
#include <cstdint>
#endif
`

/**
 * 「微型」预编译头的源码 —— 刻意只放最重、最常用的 5 个 STL 头。
 *
 * 为什么不用上面那份完整的 bits/stdc++.h：它会把 30 个头全拉进来，
 * 生成的 .pch 体积直接翻几倍，而老机器连「序列化 + 把文件搬回主线程」这一步都过不去。
 * 这 5 个是竞赛代码里覆盖率最高的组合（<iostream> 本身就吃掉了大半解析开销），
 * .pch 实测落在 10-20MB 区间。
 *
 * 单独加 include guard 不是为了防重复引入，而是为了让 PCH 里的宏状态和后面
 * 真正 #include <bits/stdc++.h> 的那份不打架。
 */
const MICRO_STDCXX_H = `#ifndef OJ_SANDBOX_MICRO_STDCXX_H
#define OJ_SANDBOX_MICRO_STDCXX_H
#include <iostream>
#include <vector>
#include <string>
#include <algorithm>
#include <map>
#endif
`

/** 浏览器原生 gzip 解压，省掉 pako 依赖 */
async function gunzip(bytes) {
  if (typeof DecompressionStream !== 'function') {
    throw new Error('当前浏览器不支持 DecompressionStream，无法解包本地工具链')
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

function readField(buffer, start, length) {
  const slice = buffer.subarray(start, start + length)
  const end = slice.indexOf(0)
  return new TextDecoder().decode(end === -1 ? slice : slice.subarray(0, end))
}

/**
 * 解 sysroot：必须先看魔数，不能无条件 gunzip。
 *
 * 因为静态服务器看到 .gz 扩展名会给响应补上 Content-Encoding: gzip（Vite dev / preview 都这样），
 * 浏览器于是透明解压掉一层，fetch 拿回来的已经是裸 tar。这时再 gunzip 会解不动，
 * 且 Chrome 只把 DecompressionStream 的失败报成一句 "Failed to fetch"，极难定位。
 * 所以按魔数判断：1f 8b 是真 gzip 流，否则当作已解压好的 tar。
 */
async function unpackSysroot(bytes) {
  const gzipped = bytes[0] === 0x1f && bytes[1] === 0x8b
  return untar(gzipped ? await gunzip(bytes) : bytes)
}

/** 极简 ustar 解析：只取普通文件（目录条目跳过），足够解 runno 的 sysroot */
function untar(buffer) {
  const fs = {}
  let files = 0
  let offset = 0
  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512)
    let empty = true
    for (let i = 0; i < 512; i++) {
      if (header[i] !== 0) {
        empty = false
        break
      }
    }
    if (empty) break

    const name = readField(header, 0, 100)
    const size = parseInt(readField(header, 124, 12).trim() || '0', 8)
    const type = String.fromCharCode(header[156])
    const prefix = readField(header, 345, 155)
    const dataStart = offset + 512

    if (type === '0' || type === '\0' || type === '') {
      const raw = prefix ? `${prefix}/${name}` : name
      const path = raw.startsWith('/') ? raw : `/${raw}`
      fs[path] = wasiFile(path, buffer.slice(dataStart, dataStart + size), 'binary')
      files++
    }
    offset = dataStart + Math.ceil(size / 512) * 512
  }
  return { fs, files }
}

/**
 * 工具链只取一次：两个 wasm 二进制的字节写进 HTTP 缓存（响应带 immutable，
 * 之后编译阶段的 fetch 直接命中缓存），sysroot 解包成 WASI 文件系统
 * （416 个文件，约 8.7MB）常驻内存。重复评测既不用重下这 50MB，
 * 也不用像以前那样在内存里常驻两份 blob。
 */
let toolchain = null
let toolchainPromise = null

/**
 * 把编译器二进制的字节读进 HTTP 缓存，但**不**转成 blob: URL。
 *
 * 为什么不能转 blob：runno 内部是 WebAssembly.instantiateStreaming(fetch(url))，
 * 只有传同源 HTTP 地址、响应又是 application/wasm，浏览器才可能把已编译的模块
 * 放进代码缓存；blob: URL 不参与 HTTP 缓存，每次都是全量重编译。
 *
 * 为什么要先读一遍：不读的话，31MB 的下载会发生在 runno 的 worker 里，
 * 也就是挤进 compile 阶段那 60 秒的看门狗预算（慢网首次编译必然误判超时）；
 * 读一遍把下载留在本阶段的 3 分钟预算里。必须整份读完，否则响应不会入缓存。
 */
async function warmCache(url, label) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${label} 下载失败（HTTP ${response.status}）`)
  await response.arrayBuffer()
}

function loadToolchain(onStatus) {
  if (!toolchainPromise) {
    toolchainPromise = (async () => {
      onStatus('download', '正在获取本地工具链（编译器 + 系统头文件，约 50MB，只下一次）…')
      const [sysroot] = await Promise.all([
        (async () => {
          const response = await fetch(SYSROOT_URL)
          if (!response.ok) throw new Error(`系统头文件下载失败（HTTP ${response.status}）`)
          return unpackSysroot(new Uint8Array(await response.arrayBuffer()))
        })(),
        warmCache(CLANG_URL, 'clang'),
        warmCache(LINKER_URL, 'wasm-ld'),
      ])
      toolchain = { clangURL: CLANG_URL, linkerURL: LINKER_URL, sysroot: sysroot.fs }
      return toolchain
    })()
    // 失败时把缓存的 promise 清掉，下次点「下载」能重试
    toolchainPromise.catch(() => {
      toolchainPromise = null
    })
  }
  return toolchainPromise
}

/** 只把工具链拉到本地（不发编译任务），用于「本地运行环境」面板的下载按钮。 */
export async function preloadToolchain(onStatus = () => {}) {
  const startedAt = performance.now()
  await loadToolchain(onStatus)
  return Math.round(performance.now() - startedAt)
}

/**
 * 释放还在等 stdin 的推送循环。
 *
 * pushStdin / pushEOF 是用 0ms 定时器空转等「stdin 槽位被消费者读回 0」的。
 * 程序从头到尾不读 stdin（或者被 kill 掉）时，消费者永远不会再来，这两个循环
 * 就会一直转到页面关掉为止——每跑一个这样的用例就多一份空转。把槽位写回 0
 * 它们就立刻退出；退出后写进去的内容没有人在读，无害。
 */
function releaseStdinWaiter(host) {
  try {
    new DataView(host.stdinBuffer).setInt32(0, 0)
  } catch {
    /* 拿不到内部缓冲区就算了，最坏结果只是多两个空转定时器 */
  }
}

/**
 * 跑一个 WASI 模块，收回 stdout / stderr / 退出码，以及跑完之后的文件系统。
 * onHost 用来把当前 WASIWorkerHost 交给上层，卡死或被取消时靠它 kill()。
 *
 * env 是给解释器这类「不带编译器、运行时自己找配置」的模块用的；
 * C++ 那条线不需要，留空即可。
 */
async function runWasi(binaryURL, { name, args, env, fs, stdin, onHost }) {
  let stdout = ''
  let stderr = ''
  const host = new WASIWorkerHost(binaryURL, {
    // argv[0] 是程序名，不能省（见文件头的坑 1）
    args: [name, ...args],
    env: env ?? {},
    fs,
    stdout: (chunk) => {
      stdout += chunk
    },
    stderr: (chunk) => {
      stderr += chunk
    },
  })
  onHost(host)
  try {
    // 必须推 stdin 再推 EOF，否则读 stdin 的程序会一直等。
    // pushEOF 要等程序真去读 stdin 才会返回，所以这里不能 await。
    void host.pushStdin(stdin ?? '')
    void host.pushEOF()
    const result = await host.start()
    return { exitCode: result.exitCode, fs: result.fs ?? {}, stdout, stderr }
  } catch (error) {
    // 被 kill()（超时 / 取消）时 start() 会抛，而此刻已经收到的输出只活在这两个闭包变量里，
    // 挂到错误上带出去：TLE 的卡片靠它显示程序跑到哪一步。
    if (error && typeof error === 'object') {
      error.partialStdout = stdout
      error.partialStderr = stderr
    }
    throw error
  } finally {
    releaseStdinWaiter(host)
    onHost(null)
  }
}

/**
 * 编译产物缓存 —— 按源码原文只留最近一份。
 *
 * 为什么要它：一次「全部运行」会把同一份代码喂给每个用例，而每个用例都会重新走
 * clang + wasm-ld。缓存命中时连工具链都不用碰，第 2..N 个用例只付运行开销。
 * 为什么只留一份：用例总是成批跑的，而代码一改缓存必然失效，多留几个槽位没有收益。
 * @type {{ code: string, outcome: { ok: true, binary: object } | { ok: false, exitCode: number, stdout: string, stderr: string } } | null}
 */
let compileCache = null

/**
 * clang 编译 + wasm-ld 链接，产出可执行的 wasm 二进制。
 * 结果分成「拿到二进制」和「编译/链接失败」两种，两种都可缓存（同一份代码结论必然相同）。
 */
async function compileAndLink(code, onStatus, onHost) {
  const tool = await loadToolchain(onStatus)
  const pch = await loadPchBytes()

  onStatus('compile', '正在编译…')
  const baseFs = {
    ...tool.sysroot,
    [UNIVERSAL_HEADER_PATH]: wasiFile(UNIVERSAL_HEADER_PATH, UNIVERSAL_HEADER),
    [SOURCE_PATH]: wasiFile(SOURCE_PATH, code),
  }

  let compiled = await runClang(tool, baseFs, pch, onHost)
  if (pch && !compiled.fs[OBJECT_PATH] && PCH_ERROR_RE.test(compiled.stderr)) {
    // 是 PCH 本身加载不了（clang 会在加载时校验语言选项和头文件搜索路径，对不上就 fatal），
    // 不是用户代码写错了。绝不能因为一个缓存文件让用户的代码编不过 ——
    // 判废、退回普通编译重试一次，这一次的结果才是用户看到的。
    await discardPch()
    compiled = await runClang(tool, baseFs, null, onHost)
  }

  if (!compiled.fs[OBJECT_PATH]) {
    return { ok: false, exitCode: compiled.exitCode, stdout: compiled.stdout, stderr: compiled.stderr || '编译未通过' }
  }

  // 链接只需要 .o 和运行库。PCH 是给 clang 用的，留着它就会被整体克隆进 wasm-ld
  // （7MB 白搬一趟），先摘掉
  delete compiled.fs[PCH_PATH]

  const linked = await runWasi(tool.linkerURL, {
    name: 'wasm-ld',
    args: LINKER_ARGS,
    fs: compiled.fs,
    onHost,
  })

  const binary = linked.fs[BINARY_PATH]
  if (!binary) {
    // 链接失败在语义上还是「这段代码编译不过」，跟原来的 clang driver 表现一致
    return { ok: false, exitCode: linked.exitCode, stdout: linked.stdout, stderr: linked.stderr || '链接失败' }
  }

  return { ok: true, binary }
}

/** 跑一次 clang；带 PCH 时把 PCH 和它的原始头一起挂进 MemFS */
function runClang(tool, baseFs, pch, onHost) {
  const fs = pch
    ? {
        ...baseFs,
        // PCH 里记着自己的原始来源是 /stdc++.h，把它一并挂上：
        // 让 clang 在加载 PCH 时既能看到原始头、也免得因缺文件报错
        [PCH_SOURCE_PATH]: wasiFile(PCH_SOURCE_PATH, MICRO_STDCXX_H),
        [PCH_PATH]: wasiFile(PCH_PATH, pch, 'binary'),
      }
    : baseFs
  return runWasi(tool.clangURL, {
    name: 'clang',
    args: clangArgs(pch ? PCH_PATH : null),
    fs,
    onHost,
  })
}

/**
 * 编译并运行一段 C++。
 * @returns {Promise<{ stage: 'compile' | 'run', ok: boolean, exitCode: number, stdout: string, stderr: string, durationMs: number | null }>}
 * 工具链本身出问题（下载失败、浏览器不支持等）会抛异常，由上层翻译成 failure。
 *
 * durationMs 只计**运行段**，与用例时限同口径。编译刻意不算进去：它是整批用例
 * 共享的一次性开销（见上面的单槽缓存），摊到每张卡片上会让第一个用例的数字凭空
 * 高出一截，卡片之间也就没法互相比较了。程序压根没跑起来（编译失败）时给 null，
 * 由卡片显示为空 —— 那种情况下的「耗时」是编译耗时，不是这个数字要表达的东西。
 */
export async function runCpp({ code, stdin, onStatus = () => {}, onHost = () => {} }) {
  const source = String(code ?? '')

  if (compileCache?.code !== source) {
    compileCache = { code: source, outcome: await compileAndLink(source, onStatus, onHost) }
  }
  const outcome = compileCache.outcome

  if (!outcome.ok) {
    return {
      stage: 'compile',
      ok: false,
      exitCode: outcome.exitCode,
      stdout: outcome.stdout,
      stderr: outcome.stderr,
      durationMs: null,
    }
  }

  onStatus('run', '正在运行…')
  const binaryURL = URL.createObjectURL(new Blob([outcome.binary.content], { type: 'application/wasm' }))
  const runStartedAt = performance.now()
  try {
    const ran = await runWasi(binaryURL, { name: 'program', args: [], fs: {}, stdin, onHost })
    return {
      stage: 'run',
      ok: ran.exitCode === 0,
      exitCode: ran.exitCode,
      stdout: ran.stdout,
      stderr: ran.stderr,
      durationMs: Math.round(performance.now() - runStartedAt),
    }
  } finally {
    URL.revokeObjectURL(binaryURL)
  }
}

// ---------------------------------------------------------------- Python
//
// 和 C++ 那条线并列的第二条管线：同一条 WASI 宿主（runno 的 WASIWorkerHost），
// 同一个 fs 形状，同一套 stdout / stderr 拦截与 kill() 中断，区别只在于
// 「没有编译」——解释器启动、导入、执行都发生在同一次 WASI run 里。
//
// 运行时用的是 runno 自带的那一份（taybenlor/runno 的 langs/），和工具链同源：
//   python.wasm               CPython 3.11.3，wasm32-wasi，约 20.5MB
//   python-fs.tar.gz          标准库，解包后只有 3 个文件，约 4MB
// 标准库不是散落的 500 个 .py，而是打包成 /usr/local/lib/python311.zip 走 zipimport，
// 只有 os.py 必须是真文件（zipimport 加载它有循环依赖问题），所以体积才压得住。
//
// 关键点：env 必须留空。这份构建把 prefix 编译死成 /usr/local，解释器自己会去
// /usr/local/lib/python311.zip 找标准库，塞 PYTHONHOME 反而会把查找路径带偏。

const PYTHON_VERSION = '3.11.3'
const PYTHON_ASSETS = `${location.origin}${import.meta.env.BASE_URL}wasm/python-${PYTHON_VERSION}`
const PYTHON_BINARY_URL = `${PYTHON_ASSETS}/python.wasm`
const PYTHON_FS_URL = `${PYTHON_ASSETS}/python-fs.tar.gz`

/** @type {{ binaryURL: string, stdlib: Record<string, object> } | null} */
let pythonRuntime = null
let pythonRuntimePromise = null

/** 与 loadToolchain 同构：解包一次常驻内存，二进制先读一遍进 HTTP 缓存 */
function loadPythonRuntime(onStatus) {
  if (!pythonRuntimePromise) {
    pythonRuntimePromise = (async () => {
      onStatus('download', '正在获取 Python 运行时（解释器 + 标准库，约 24MB，只下一次）…')
      const [stdlib] = await Promise.all([
        (async () => {
          const response = await fetch(PYTHON_FS_URL)
          if (!response.ok) throw new Error(`Python 标准库下载失败（HTTP ${response.status}）`)
          return unpackSysroot(new Uint8Array(await response.arrayBuffer()))
        })(),
        warmCache(PYTHON_BINARY_URL, 'python'),
      ])
      pythonRuntime = { binaryURL: PYTHON_BINARY_URL, stdlib: stdlib.fs }
      return pythonRuntime
    })()
    // 失败时清掉缓存的 promise，下次点运行还能重试
    pythonRuntimePromise.catch(() => {
      pythonRuntimePromise = null
    })
  }
  return pythonRuntimePromise
}

/** Python 运行时是否已在内存里（与 isToolchainReady 对称） */
export function isPythonRuntimeReady() {
  return pythonRuntime !== null
}

/** 只把 Python 运行时拉到本地（不跑代码），用于「本地运行环境」面板的下载按钮。 */
export async function preloadPythonRuntime(onStatus = () => {}) {
  const startedAt = performance.now()
  await loadPythonRuntime(onStatus)
  return Math.round(performance.now() - startedAt)
}

/**
 * 各语言下载时要落缓存的资产清单。
 * 「这些 URL 是否都在本地缓存」就是运行时「是否已下载」的判据；版本号编在目录路径里，
 * 升级版本自然指向新文件，不需要额外的版本标记。
 * 未知语言返回空表（调用方据此判定不可用）。
 * @param {string} language
 * @returns {string[]}
 */
export function runtimeAssetURLs(language) {
  if (language === 'python') return [PYTHON_BINARY_URL, PYTHON_FS_URL]
  if (language === 'cpp') return [CLANG_URL, LINKER_URL, SYSROOT_URL]
  return []
}

/**
 * 卸载某个本地运行时：清掉持久层里的资产，并丢掉内存里已加载的那份，
 * 让下一次运行 / 下载都退回「从零开始」。设置页的「本地运行环境」卸载按钮走这里。
 *
 * 持久层分两块，只有第一块删得掉：
 * - Cache Storage（SW 的 `cph-toolchain-*`）：SW 控制页面时资产的实际落点，逐个删条目；
 * - HTTP 缓存：浏览器没给 JS 任何清除接口（`fetch` 的 cache 选项只能改变取值策略），
 *   删不掉。所以 probeRuntime 在 SW 控制时改以 Cache Storage 为准 —— 否则前脚卸载、
 *   后脚就被 HTTP 缓存里那份残留判回「已就绪」（见 wasmRuntime 的 isAssetCached）。
 *
 * 内存里那份必须一起丢：留着的话本次会话照样能编译，用户会以为卸载没生效。
 * @param {string} language 'cpp' | 'python'
 */
export async function unloadRuntime(language) {
  if (language !== 'cpp' && language !== 'python') return
  await purgeRuntimeCache(language)
  if (language === 'python') {
    pythonRuntime = null
    pythonRuntimePromise = null
    return
  }
  toolchain = null
  toolchainPromise = null
  // 编译产物是纯内存缓存，依附工具链存在，一起丢
  compileCache = null
  // PCH（十几 MB）存在 IndexedDB 里，不在 /wasm/ 缓存清单内，单独清
  pchBytes = null
  pchPromise = null
  await deletePch(pchCacheId())
}

/**
 * 从所有 `cph-toolchain-*` 缓存里删掉该语言的资产条目。
 * 缓存名带 VERSION，迭代中可能同时存在多代，所以按前缀全扫，不只认当前那一个。
 */
async function purgeRuntimeCache(language) {
  const urls = runtimeAssetURLs(language)
  if (!urls.length || typeof caches === 'undefined') return
  try {
    const names = (await caches.keys()).filter((name) => name.startsWith('cph-toolchain'))
    await Promise.all(
      names.map(async (name) => {
        const cache = await caches.open(name)
        await Promise.all(urls.map((url) => cache.delete(url)))
      }),
    )
  } catch {
    /* 删不掉（隐私模式等）不阻断卸载：内存那份已经丢了，探针也不会再把它判成已装 */
  }
}

/**
 * 直接解释执行一段 Python（不编译）。
 *
 * fs 的叠放顺序就是优先级：标准库垫底 → 用户 VFS 整棵树 → 入口文件用入参内容覆盖。
 * 入口必须放最后：编辑器里可能刚敲完还没落盘，跑的一定得是屏幕上那份。
 * 入口所在目录（一般是 /）会成为解释器的 sys.path[0]，兄弟模块才 import 得到。
 *
 * 返回值刻意和 runCpp 同构，上层（wasmRuntime / engines）就不用分两份处理：
 * stage 恒为 'run'（Python 没有编译段），durationMs 是解释器启动 + 程序执行的实测墙钟。
 *
 * @param {{ code: string, entryPath?: string, fs?: Record<string, object>, stdin?: string, onStatus?: Function, onHost?: Function }} options
 */
export async function runPython({
  code,
  entryPath = '/main.py',
  fs: userFs,
  stdin,
  onStatus = () => {},
  onHost = () => {},
}) {
  const runtime = await loadPythonRuntime(onStatus)
  const path = String(entryPath || '/main.py')
  const fs = {
    ...runtime.stdlib,
    ...(userFs ?? {}),
    [path]: wasiFile(path, String(code ?? '')),
  }

  onStatus('run', '正在运行…')
  const startedAt = performance.now()
  const ran = await runWasi(runtime.binaryURL, {
    // argv = ['python', '<入口文件>']：解释器把 sys.argv[1] 当脚本路径执行
    name: 'python',
    args: [path],
    fs,
    stdin,
    onHost,
  })
  return {
    stage: 'run',
    ok: ran.exitCode === 0,
    exitCode: ran.exitCode,
    stdout: ran.stdout,
    stderr: ran.stderr,
    durationMs: Math.round(performance.now() - startedAt),
  }
}

// ---------------------------------------------------------------- 预编译头（PCH）
//
// 目的：老机器上编译一次竞赛代码，CPU 和内存的大头都花在反复解析 STL 头上。
// 这 5 个头的 AST 每次编译都一模一样，做成 PCH 后每次编译只需反序列化。
//
// 这条路和用户编译的差别只有一个：产物不是 .o 而是 .pch。
// 文件系统照旧走 runno 那一套 —— clang 用 path_open(O_CREAT) 建文件、写完
// 由 WASIDrive.sync() 落到 result.fs，我们从 result.fs[PCH_PATH].content 取二进制。

/** PCH 在本机不可用（生成时 OOM / cc1 卡死，或加载时被判不匹配）后写下的永久标记 */
const PCH_UNSUPPORTED_KEY = 'cph.pchUnsupported'

// 给足预算：老机器解析这 5 个头 + 序列化 AST 可能要几十秒，但超过这个时间
// 基本可以断定是 cc1 卡死（本项目踩过），杀掉并标记不支持。
const PCH_TIMEOUT_MS = 3 * 60 * 1000

// 存档格式版本：改动存档结构（或 PCH 的生成方式）时手动 +1
const PCH_CACHE_VERSION = 1

/**
 * 「这次编译失败是 PCH 的锅」的识别特征。
 *
 * 必须写得足够窄：用户代码写错同样会「没有 .o」，把那种情况误判成 PCH 故障
 * 会让每次编译错误都白编译一遍、还把加速永久关掉 —— 判题环境里写错代码才是常态。
 * 所以只认两样：我们自己的文件名，以及 clang 报 PCH 问题时的固定措辞。
 */
const PCH_ERROR_RE = /stdc\+\+\.h\.pch|precompiled header/i

function isPchUnsupported() {
  try {
    return window.localStorage.getItem(PCH_UNSUPPORTED_KEY) === 'true'
  } catch {
    // 隐私模式下读不到 localStorage：当作没标记，让这一次去试
    return false
  }
}

function markPchUnsupported() {
  try {
    window.localStorage.setItem(PCH_UNSUPPORTED_KEY, 'true')
  } catch {
    /* 写不进去也无害，最坏结果是下次刷新再试一遍 */
  }
}

/** 工具链是否已在内存里（PCH 不该为了自己把那 50MB 拉起来） */
export function isToolchainReady() {
  return toolchain !== null
}

/** FNV-1a：只给头文件内容取个指纹用，不是安全哈希 */
function hashString(text) {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16)
}

/**
 * PCH 存档 id。
 *
 * 判废**必须**靠这个 id，不能指望 clang 报错：PCH 的控制块里签着 clang 版本和
 * -internal-isystem 路径（实测 '/sys/include/c++/v1' 在控制块里出现 150 次），
 * 参数一变加载就会失败 —— 而那个失败会被「降级重试」吃掉，退化成不报错但静默变慢。
 * 所以工具链版本、微缩头内容、存档格式三者任一变化，id 都不一样，旧存档自然取不到。
 */
function pchCacheId() {
  return `${PCH_CACHE_VERSION}:${TOOLCHAIN_VERSION}:${hashString(MICRO_STDCXX_H)}`
}

/** @type {Promise<Uint8Array | null> | null} */
let pchPromise = null
/** @type {Uint8Array | null} 本会话已备好的 PCH，避免每次编译都回 IndexedDB 取 */
let pchBytes = null

/**
 * 编译前取 PCH：先看本会话内存，再问 IndexedDB。
 *
 * 这里**不会**触发生成 —— 生成只走 warmupPch() 那条后台路径。编译路径不能为了它
 * 多等几百毫秒；没备好就照常普通编译，用户只是没享受到加速而已。
 * @returns {Promise<Uint8Array | null>}
 */
async function loadPchBytes() {
  if (pchBytes) return pchBytes
  if (isPchUnsupported()) return null
  pchBytes = await readPch(pchCacheId())
  return pchBytes
}

/**
 * 判废：带 PCH 却编译不通过时调用。
 * 顺手把 localStorage 标记也打上 —— 免得下一批用例再白跑一次「带 PCH 失败 + 重试」。
 */
async function discardPch() {
  pchBytes = null
  markPchUnsupported()
  await deletePch(pchCacheId())
}

/**
 * 后台静默生成 PCH。**不要**在首屏或用户操作路径上直接调，统一走 wasmRuntime 的 warmupPch()。
 *
 * 返回值：PCH 字节（存档命中时直接给存档，不会重新编译）；已标记不支持时返回 null；失败则抛出。
 * 失败一律按「这台机器扛不住」处理，写 cph.pchUnsupported 且不再重试 —— 在会 OOM 的机器上
 * 重试只是再崩一次。所以这里成功失败都只算一次，pchPromise 也就没必要清。
 */
export function generatePch() {
  if (pchPromise) return pchPromise

  pchPromise = (async () => {
    // 存档里已经有就直接用，绝不重编 —— 阶段 3（持久化）的意义全在这一行：
    // 刷新页面后 pchBytes 是空的，但 IndexedDB 里的那份还在，不该再花 400ms 重跑一遍。
    // loadPchBytes() 顺带覆盖了内存缓存和「本机不可用」标记两种情况。
    const cached = await loadPchBytes()
    if (cached) return cached
    // loadPchBytes() 返回 null 有两种含义：还没存档，或者本机已被判定扛不住。
    // 后者必须就此打住 ——「失败一次以后不再重试」这条要求落在这一行，
    // 否则每次刷新都会在一台已知会 OOM 的机器上再试一次，正好是我们要避免的事。
    if (isPchUnsupported()) return null

    const tool = await loadToolchain(() => {})
    let timer = 0
    try {
      const compiled = await runWasi(tool.clangURL, {
        name: 'clang',
        args: PCH_ARGS,
        // 只多塞一个 /stdc++.h；sysroot 原样复用，头文件搜索路径由 FRONTEND_ARGS 保证一致
        fs: {
          ...tool.sysroot,
          [PCH_SOURCE_PATH]: wasiFile(PCH_SOURCE_PATH, MICRO_STDCXX_H),
        },
        // 这条流水线不在 wasmRuntime 的任务体系里，没人替它收尸：
        // 自己挂一个看门狗，卡死就 kill() 掉这个 WASI 实例（工具链缓存不受影响）
        onHost: (host) => {
          clearTimeout(timer)
          if (!host) return
          timer = setTimeout(() => {
            try {
              host.kill()
            } catch {
              /* 已经跑完或被杀过 */
            }
          }, PCH_TIMEOUT_MS)
        },
      })

      const file = compiled.fs[PCH_PATH]
      if (!file) {
        throw new Error(compiled.stderr || `预编译头生成失败（clang 退出码 ${compiled.exitCode}）`)
      }
      const bytes = new Uint8Array(file.content)
      // 先落内存再落库：存档失败（配额不足 / 隐私模式）不该影响本会话，
      // 内存里这份照样能用，只是下次刷新要重新生成
      pchBytes = bytes
      await writePch(pchCacheId(), bytes)
      return bytes
    } finally {
      clearTimeout(timer)
    }
  })()

  pchPromise.catch(markPchUnsupported)
  return pchPromise
}