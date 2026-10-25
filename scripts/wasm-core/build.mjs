#!/usr/bin/env node
/**
 * 把 LLVM 23 交叉编译成两份 wasm 内核：clang.wasm（前端 cc1）与 wasm-ld.wasm（链接器）。
 *
 * 两段式构建，这是跨编 LLVM 的标准姿势：
 *
 *   1. 原生段：用宿主机编译器编出几个**在宿主机上运行**的 tblgen（llvm-tblgen /
 *      clang-tblgen / llvm-min-tblgen）。它们把 .td 描述生成 C++ 表，是构建期工具，
 *      不能是 wasm —— wasm 版本跑不了（我们还没有 wasm 运行时，而且也不需要）。
 *   2. wasm 段：用 wasi-sdk 的 clang 把 llvm/clang/lld 编成 wasm32-wasip1，
 *      通过 LLVM_NATIVE_TOOL_DIR 指回第 1 段产出的 tblgen。
 *
 * 产物落在 tools/wasm-core/out/<llvm 版本>/，同时打印 raw / gzip 体积
 *（线上经边缘压缩传输，gzip 才是有意义的传输量参照）。
 *
 * 收产物时默认 `llvm-strip --strip-all`：WASM 的 name 段（每个 C++ 符号的名字）占
 * 裸体积的四分之一以上，而浏览器里既不做栈回溯也不读符号名。实测 clang.wasm
 * 103.59 → 73.71 MiB、wasm-ld.wasm 62.58 → 41.49 MiB，gzip/brotli 也跟着掉
 * （见 HANDOFF §19.8）。要排查崩溃栈时用 `--no-strip` 保留 name 段。
 *
 * 用法：
 *   npm run wasm:core:build              # 两段都跑（增量：ninja 会跳过已完成的部分）
 *   npm run wasm:core:build -- --opt     # 额外用 wasm-opt -Oz 量一遍体积（不接运行时）
 *   npm run wasm:core:build -- --no-strip  # 保留 name / debug 段（只用于排查）
 */
import { spawnSync } from 'node:child_process'
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'
import { BUILD_DIR, OUT_DIR, ensureSources } from './fetch.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../..')
const NATIVE_DIR = join(BUILD_DIR, 'native')
const WASM_DIR = join(BUILD_DIR, 'wasm')
const TOOLCHAIN_FILE = join(HERE, 'toolchain-wasip1.cmake')

// 两个阶段共用的「不要的功能」。LLVM 默认会按探测结果打开一堆可选依赖
//（zlib / zstd / libxml2 / terminfo / libedit / curl），在 wasm 里要么没实现、
// 要么白白背一条依赖链；全部关掉，构建也更可复现。
const FEATURE_OFF = [
  '-DLLVM_ENABLE_ZLIB=OFF',
  '-DLLVM_ENABLE_ZSTD=OFF',
  '-DLLVM_ENABLE_LIBXML2=OFF',
  '-DLLVM_ENABLE_TERMINFO=OFF',
  '-DLLVM_ENABLE_LIBEDIT=OFF',
  '-DLLVM_ENABLE_CURL=OFF',
  '-DLLVM_ENABLE_HTTPLIB=OFF',
  '-DLLVM_ENABLE_LIBPFM=OFF',
  '-DLLVM_ENABLE_BINDINGS=OFF',
  '-DLLVM_INCLUDE_TESTS=OFF',
  '-DLLVM_INCLUDE_EXAMPLES=OFF',
  '-DLLVM_INCLUDE_BENCHMARKS=OFF',
  '-DLLVM_INCLUDE_DOCS=OFF',
  '-DLLVM_ENABLE_WERROR=OFF',
]

const optimize = process.argv.includes('--opt')
const keepSymbols = process.argv.includes('--no-strip')
const startedAt = Date.now()

function logStep(text) {
  console.log('')
  console.log(`▶ ${text}`)
}

function run(cmd, args, cwd, env) {
  console.log(`$ ${[cmd, ...args].join(' ')}`)
  const res = spawnSync(cmd, args, { cwd, stdio: 'inherit', env: env ?? process.env })
  if (res.error) throw res.error
  if (res.status !== 0) throw new Error(`${cmd} 失败，退出码 ${res.status}`)
}

function configure(sourceDir, buildDir, extra, env) {
  run(
    'cmake',
    [
      '-G',
      'Ninja',
      '-S',
      sourceDir,
      '-B',
      buildDir,
      ...FEATURE_OFF,
      ...extra,
    ],
    undefined,
    env,
  )
}

/**
 * llvm/lib/Support/raw_socket_stream.cpp 依赖 UNIX 域套接字（socket / bind /
 * connect / listen + sockaddr_un.sun_path），wasi-libc 完全没有这套 API；而
 * clang cc1 与 wasm-ld 从不引用它（全仓 grep 只剩它自己）。与其为一块死代码
 * 伪造 socket 实现，不如直接把它从 LLVMSupport 的源列表里摘掉 —— 顺带省一点
 * 编译时间和产物体积。
 *
 * 摘掉源文件必须在目标上标 PARTIAL_SOURCES_INTENDED：LLVM 的构建系统会检查
 * 目录下每个 .cpp 都进了目标，而这是官方提供的豁免关键字。两处改动都幂等。
 */
async function patchLlvmSources(srcDir) {
  const cmakeFile = join(srcDir, 'llvm/lib/Support/CMakeLists.txt')
  const text = await readFile(cmakeFile, 'utf8')
  const line = '  raw_socket_stream.cpp\n'
  if (!text.includes(line)) return
  let patched = text.replace(
    line,
    '  # raw_socket_stream.cpp（WASI 无 socket API，且无人引用，构建时摘除）\n',
  )
  patched = patched.replace(
    'add_llvm_component_library(LLVMSupport\n',
    'add_llvm_component_library(LLVMSupport\n  PARTIAL_SOURCES_INTENDED\n',
  )
  await writeFile(cmakeFile, patched)
  console.log('  已从 LLVMSupport 摘除 raw_socket_stream.cpp')
}

/**
 * lib/Support 里少数「平台能力确实不存在、又没法用兼容头补」的地方。
 *
 * wasi-libc 的 compats 能补函数声明，但补不了**结构体字段**：它的
 * `struct rusage` 在 WASI 模式下只保留 ru_utime / ru_stime（
 * `__struct_rusage.h`，里面就一句 TODO），而 Unix/Program.inc 会读 ru_maxrss
 * 填 ProcessStatistics。这个统计只用于「等子进程结束时报告它用了多少内存」，
 * 而 WASI 根本派生不出子进程 —— 把这行按 __wasi__ 排除掉比伪造字段安全。
 *
 * 每条补丁都要求原文唯一命中；已经打过（或上游改了写法）就跳过并告警，
 * 免得某次 LLVM 升级后补丁静默失效。
 */
async function patchLlvmWasi(srcDir) {
  const patches = [
    {
      file: 'llvm/lib/Support/Unix/Program.inc',
      find: `#if !defined(__HAIKU__) && !defined(__MVS__)
    PeakMemory = static_cast<uint64_t>(Info.ru_maxrss);
#endif`,
      replace: `#if !defined(__HAIKU__) && !defined(__MVS__) && !defined(__wasi__)
    PeakMemory = static_cast<uint64_t>(Info.ru_maxrss);
#endif`,
      note: 'WASI 的 struct rusage 没有 ru_maxrss',
    },
    {
      // 上游这里写的是大写的 __WASM__（Emscripten 的宏），而 clang/wasi-sdk
      // 定义的是小写 __wasm__。于是 wasm32-wasip1 落不进这个分支，
      // clang 侧又没有 LLVM 那边的 `#if !defined(CLANG_ABI)` 兜底，
      // 生成的 Attrs.inc 里 `class CLANG_ABI X` 就变成了「未知类型 CLANG_ABI」。
      // 两处都是同一个「可见性默认」语义，补上小写宏即可。
      // 不图省事用 -D__WASM__ 全局定义：那会把「是不是 Emscripten」混进来，
      // 上游以后真按 __WASM__ 分支加代码时会踩坑。
      file: 'llvm/include/llvm/Support/Compiler.h',
      find: '#elif defined(__MACH__) || defined(__WASM__) || defined(__EMSCRIPTEN__)',
      replace: '#elif defined(__MACH__) || defined(__WASM__) || defined(__wasm__) || defined(__EMSCRIPTEN__)',
      note: 'LLVM_ABI 的 wasm 分支用小写 __wasm__',
    },
    {
      file: 'clang/include/clang/Support/Compiler.h',
      find: '#elif defined(__MACH__) || defined(__WASM__) || defined(__EMSCRIPTEN__)',
      replace: '#elif defined(__MACH__) || defined(__WASM__) || defined(__wasm__) || defined(__EMSCRIPTEN__)',
      note: 'CLANG_ABI 的 wasm 分支用小写 __wasm__',
    },
  ]

  for (const patch of patches) {
    const path = join(srcDir, patch.file)
    const text = await readFile(path, 'utf8')
    if (text.includes(patch.replace)) continue
    const at = text.indexOf(patch.find)
    if (at === -1) {
      console.warn(`  ⚠ 补丁未命中（上游写法变了？）：${patch.file} —— ${patch.note}`)
      continue
    }
    await writeFile(path, text.slice(0, at) + patch.replace + text.slice(at + patch.find.length))
    console.log(`  已打补丁：${patch.file}（${patch.note}）`)
  }
}

/**
 * wasi-libc 里「有声明、没有实现、而 LLVM 会真的调用」的少数符号。
 *
 * 目前只有 posix_madvise：头文件里有原型，libwasi-emulated-mman.a 里却查不到，
 * 直到链接 clang.wasm 才炸成 undefined symbol。Unix/Path.inc 用它给 mmap 出来的
 * 文件区域提访问模式建议（DONTNEED / WILLNEED / RANDOM），POSIX 允许忽略建议。
 *
 * 写成 LLVMSupport 里的一个源文件而不是兼容头宏：调用点是 `::posix_madvise(...)`，
 * 宏会把整个表达式换成 `::0`，编不过；而 static inline 又与 libc 的 extern
 * 声明冲突。真符号最省事。
 */
async function addWasiStubs(srcDir) {
  const stubPath = join(srcDir, 'llvm/lib/Support/WASIPortStubs.cpp')
  const stub = `// 由 scripts/wasm-core/build.mjs 生成，勿手改。
//
// WASI 移植桩：wasi-libc 声明了但从未实现的接口。
#include <sys/mman.h>

// Unix/Path.inc 对已映射的文件区域提访问模式建议；POSIX 允许忽略建议。
extern "C" int posix_madvise(void *addr, size_t len, int advice) {
  (void)addr;
  (void)len;
  (void)advice;
  return 0;
}
`
  const existing = existsSync(stubPath) ? await readFile(stubPath, 'utf8') : ''
  if (existing !== stub) {
    await writeFile(stubPath, stub)
    console.log('  已写入 LLVMSupport 的 WASI 桩源文件')
  }

  const cmakeFile = join(srcDir, 'llvm/lib/Support/CMakeLists.txt')
  const text = await readFile(cmakeFile, 'utf8')
  if (!text.includes('  WASIPortStubs.cpp\n')) {
    const anchor = 'add_llvm_component_library(LLVMSupport\n  PARTIAL_SOURCES_INTENDED\n'
    if (!text.includes(anchor)) throw new Error('LLVMSupport 的源列表锚点没找到，补丁失效')
    await writeFile(cmakeFile, text.replace(anchor, `${anchor}  WASIPortStubs.cpp\n`))
    console.log('  已把 WASIPortStubs.cpp 加进 LLVMSupport')
  }
}

const { wasiSdk, llvmSrc, llvmVersion } = await ensureSources()
await patchLlvmSources(llvmSrc)
await patchLlvmWasi(llvmSrc)
await addWasiStubs(llvmSrc)
await mkdir(OUT_DIR, { recursive: true })

// ── 第 1 段：宿主机上的 tblgen ───────────────────────────────────────────────
logStep('原生段：构建宿主机 tblgen')
configure(join(llvmSrc, 'llvm'), NATIVE_DIR, [
  '-DCMAKE_BUILD_TYPE=Release',
  '-DLLVM_TARGETS_TO_BUILD=WebAssembly',
  '-DLLVM_ENABLE_PROJECTS=clang',
])
run('ninja', ['llvm-tblgen', 'clang-tblgen', 'llvm-min-tblgen'], NATIVE_DIR)

// ── 第 2 段：wasm 内核 ──────────────────────────────────────────────────────
logStep(`wasm 段：交叉编译 clang + wasm-ld（wasi-sdk ${wasiSdk.split('/').pop()}）`)
configure(join(llvmSrc, 'llvm'), WASM_DIR, [
  `-DCMAKE_TOOLCHAIN_FILE=${TOOLCHAIN_FILE}`,
  '-DCMAKE_BUILD_TYPE=Release',
  // -O2 而不是 Release 默认的 -O3：浏览器里编译器自己也会跑，代码体积和编译速度
  // 两头都不能太难看；最终产物体积还可以再交给 wasm-opt -Oz 收一遍。
  '-DCMAKE_C_FLAGS_RELEASE=-O2 -DNDEBUG',
  '-DCMAKE_CXX_FLAGS_RELEASE=-O2 -DNDEBUG',
  '-DLLVM_TARGETS_TO_BUILD=WebAssembly',
  '-DLLVM_ENABLE_PROJECTS=clang;lld',
  `-DLLVM_NATIVE_TOOL_DIR=${join(NATIVE_DIR, 'bin')}`,
  // WASI 没有线程；LLVM 的并发初始化、`llvm::parallelFor` 都会退化成串行
  '-DLLVM_ENABLE_THREADS=OFF',
  // toolchain 文件里设了 CMAKE_TRY_COMPILE_TARGET_TYPE=STATIC_LIBRARY（见那里的注释），
  // 副作用是 check_library_exists 的链接探测全部「成功」—— LLVM 因此认定
  // 有 libpthread，把 `-lpthreads`（注意带 s）写进每个目标的链接行，
  // 而 wasi-sdk 只有 libpthread.a。这里直接把探测结果钉成「没有」。
  '-DHAVE_LIBPTHREAD=OFF',
  '-DLLVM_ENABLE_ASSERTIONS=OFF',
  '-DLLVM_ENABLE_EH=OFF',
  '-DLLVM_ENABLE_RTTI=OFF',
  '-DLLVM_ENABLE_LTO=OFF',
  '-DLLVM_ENABLE_PLUGINS=OFF',
  // 链接 clang.wasm 要吃掉数 GB 内存，和并行编译抢内存会直接 OOM
  '-DLLVM_PARALLEL_LINK_JOBS=1',
  // 只有解析 / 编译 / 链接用户代码用得到的东西：静态分析器、ObjC 重写器都不进产物
  '-DCLANG_ENABLE_STATIC_ANALYZER=OFF',
  '-DCLANG_ENABLE_OBJC_REWRITER=OFF',
  // tools/lto 要产出 SHARED 版 libLTO，clang/tools/libclang 要产出 SHARED 版 libclang；
  // wasm 目标没有动态链接，配置期就报错。这两样在浏览器里都用不到（我们用 cc1 + wasm-ld）。
  '-DLLVM_TOOL_LTO_BUILD=OFF',
  '-DLLVM_TOOL_REMARKS_SHLIB_BUILD=OFF',
  '-DCLANG_TOOL_LIBCLANG_BUILD=OFF',
  '-DCLANG_TOOL_CLANG_SHLIB_BUILD=OFF',
], { ...process.env, WASI_SDK_DIR: wasiSdk })
run('ninja', ['clang', 'lld'], WASM_DIR)

// ── 收产物 ─────────────────────────────────────────────────────────────────
logStep('收集产物')
const outDir = join(OUT_DIR, llvmVersion)
await mkdir(outDir, { recursive: true })

/** CMake 加了 CMAKE_EXECUTABLE_SUFFIX=.wasm，但旧版本 CMake 可能不认，两个名字都试 */
async function pickBin(dir, name) {
  for (const candidate of [`${name}.wasm`, name]) {
    const path = join(dir, candidate)
    if (existsSync(path)) return path
  }
  throw new Error(`构建产物里找不到 ${name}（找过 ${dir}）`)
}

const clangBin = await pickBin(join(WASM_DIR, 'bin'), 'clang')
const lldBin = await pickBin(join(WASM_DIR, 'bin'), 'lld')
await copyFile(clangBin, join(outDir, 'clang.wasm'))
await copyFile(lldBin, join(outDir, 'wasm-ld.wasm'))

const mib = (bytes) => `${(bytes / 1048576).toFixed(2)} MiB`

// name 段是 C++ 模板符号的全名表，占了裸体积的 25%（HANDOFF §19.8）；
// 浏览器里不读符号名，剥掉是零运行时代价的体积收益。
if (!keepSymbols) {
  logStep('剥符号（llvm-strip --strip-all）')
  const llvmStrip = join(wasiSdk, 'bin', 'llvm-strip')
  for (const name of ['clang.wasm', 'wasm-ld.wasm']) {
    const path = join(outDir, name)
    const before = (await stat(path)).size
    run(llvmStrip, ['--strip-all', path], undefined)
    console.log(`  ${name.padEnd(12)} ${mib(before)} → ${mib((await stat(path)).size)}`)
  }
}
async function report(name) {
  const path = join(outDir, name)
  const raw = (await stat(path)).size
  const gz = zlib.gzipSync(await readFile(path), { level: 9 }).length
  console.log(`  ${name.padEnd(12)} raw ${mib(raw).padStart(10)}   gzip ${mib(gz).padStart(9)}`)
}

console.log('')
console.log('产物（浏览器实际要传的是 gzip 列）')
await report('clang.wasm')
await report('wasm-ld.wasm')

if (optimize) {
  logStep('可选：wasm-opt -Oz 体积探针（产物只作参考，不接运行时）')
  // 实测（HANDOFF §19.1）：裸体积 −41%、br11 只 −13%，代价是编译慢 1.69×，
  // 所以绝不要把 _opt.wasm 当成默认产物。要压只能在用户拍板体积预算之后。
  console.log('  注意：-Oz 会让编译慢约 1.7×，默认产物不要用 _opt.wasm')
  const wasmOpt = join(ROOT, 'tools/binaryen/bin/wasm-opt')
  if (!existsSync(wasmOpt)) {
    console.log(`  跳过：找不到 ${wasmOpt}`)
  } else {
    for (const name of ['clang.wasm', 'wasm-ld.wasm']) {
      const optName = name.replace('.wasm', '_opt.wasm')
      run(wasmOpt, ['-Oz', join(outDir, name), '-o', join(outDir, optName)], undefined)
    }
    await report('clang_opt.wasm')
    await report('wasm-ld_opt.wasm')
  }
}

console.log('')
console.log(`完成，用时 ${Math.round((Date.now() - startedAt) / 1000)} s，产物在 ${outDir}`)
