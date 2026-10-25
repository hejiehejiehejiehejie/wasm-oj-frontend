#!/usr/bin/env node
/**
 * 从 wasi-sdk 34 的全量 sysroot（约 416 MB）里取「浏览器里编 C++20 竞赛代码」
 * 真正用得到的子集，打成 `sys23-fs.tar.br`：条目以 `sys/` 开头，运行时挂到 `/sys`。
 * 同一趟还把 `build.mjs` 产出的两颗内核压成 `clang.wasm.br` / `wasm-ld.wasm.br` ——
 * 分发物料一次出齐。
 *
 * 传输编码是 **brotli**，不是 gzip：同一份 tar，gz9 2.23 MiB / br11 1.54 MiB；
 * 内核 gz 34.22 / br 21.69。解压由浏览器网络栈按 `Content-Encoding: br` 透明完成
 * （实测 Chrome 155 的 `DecompressionStream` **不认** brotli，只认 gzip/deflate，
 * 所以别指望在 JS 里解）。部署时这些文件要配 `Content-Encoding: br`，
 * 否则拿到的就是压缩字节。
 *
 * 裁剪口径（2026-10-25 用户拍板：语言只到 C++20）：
 *
 *   - 头：只要 `include/wasm32-wasip1` 这一支，且只要 `eh` 的 libc++。
 *     丢 `noeh`（异常版才是我们的编译口径）、`__cxx03`（libc++ 的 C++03 冻结副本，
 *     只在 `__cplusplus < 201103L` 时才会被 include）、`mach-o`（wasm 没有）、
 *     模块图（我们不跑 clang modules），以及另外三个 target 的头（wasip1-threads /
 *     wasip2 / wasip3）和 `experimental-coop-threads` 整棵树。
 *   - clang 内置头单独捞：SDK 的 `lib/clang/23/include` 有 8.3 MB，绝大多数是
 *     x86/arm/riscv/CUDA/HIP/OpenCL 的 intrinsic 头 —— 在 wasm-only 的编译器上永远
 *     不可能被用到。只保留 C/C++ 语言本身和 wasm SIMD 用得到的那二十几个。
 *   - 库：只留静态链接真正会碰的那几个归档；全部 `.so`（wasi-sdk 34 新加的动态链接
 *     产物）、`llvm-lto/`、`libc++experimental.a`、`libc-printscan-no-floating-point.a`
 *     都不进包。`libm/libpthread/...` 这些 8 字节空归档保留 —— 用户的 `-lm` 之类
 *     要能链过。
 *   - 归档一律 `llvm-strip --strip-debug`（不能 `--strip-all`：链接器还要符号表）。
 *     实测量级：`libc++.a` 9.0M→1.5M、`libc.a` 3.2M→1.2M。
 *   - `bits/stdc++.h` **不进包**：它由站点在运行时写到
 *     `/sys/include/wasm32-wasip1/bits/stdc++.h`，两个来源混一份会难查。
 *
 * 用法：
 *   npm run wasm:core:pack
 */
import { spawnSync } from 'node:child_process'
import { brotliCompressSync, constants as zlibConstants } from 'node:zlib'
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { OUT_DIR, ensureSources } from './fetch.mjs'

const { wasiSdk, llvmVersion } = await ensureSources()
const sysroot = join(wasiSdk, 'share/wasi-sysroot')
const resourceDir = join(wasiSdk, 'lib/clang', llvmVersion.split('.')[0])
const llvmStrip = join(wasiSdk, 'bin/llvm-strip')
const outDir = join(OUT_DIR, llvmVersion)
const stage = join(outDir, '.sysroot-stage')
const tarball = join(outDir, 'sys23-fs.tar')
const brotliFile = join(outDir, 'sys23-fs.tar.br')

function run(cmd, args, cwd) {
  const res = spawnSync(cmd, args, { cwd, stdio: 'inherit' })
  if (res.error) throw res.error
  if (res.status !== 0) throw new Error(`${cmd} 失败，退出码 ${res.status}`)
}

/** clang 内置头里按 wasm32-wasip1 口径必须留下的那些 */
const BUILTIN_HEADERS = [
  'stdarg.h', 'stddef.h', 'stdalign.h', 'stdbool.h', 'stdint.h', 'stdatomic.h',
  'stdnoreturn.h', 'stdckdint.h', 'stdcountof.h', 'stddefer.h',
  'inttypes.h', 'limits.h', 'float.h', 'tgmath.h', 'iso646.h',
  'varargs.h', 'vadefs.h', 'endian.h', 'unwind.h', 'wasm_simd128.h',
]
const BUILTIN_HEADER_PREFIXES = ['__stddef_', '__stdarg_', '__float_']

/** 静态链接真正会用到的 sysroot 库 */
const SYS_LIBS = [
  'crt1-command.o',
  'libc.a',
  'libc-printscan-long-double.a',
  'libsetjmp.a',
  'libdl.a', 'libm.a', 'libpthread.a', 'libresolv.a', 'librt.a', 'libutil.a',
  'libxnet.a', 'libcrypt.a',
  'libwasi-emulated-getpid.a', 'libwasi-emulated-mman.a',
  'libwasi-emulated-process-clocks.a', 'libwasi-emulated-signal.a',
]
const EH_LIBS = ['libc++.a', 'libc++abi.a', 'libunwind.a']

const mib = (bytes) => `${(bytes / 1048576).toFixed(2)} MiB`

/** q11 + lgwin 24：比默认 lgwin 22 再省 3–4%，与 HANDOFF §19.8 的口径一致 */
const brotli = (buf) =>
  brotliCompressSync(buf, {
    params: {
      [zlibConstants.BROTLI_PARAM_QUALITY]: 11,
      [zlibConstants.BROTLI_PARAM_LGWIN]: 24,
      [zlibConstants.BROTLI_PARAM_SIZE_HINT]: buf.length,
    },
  })

async function fsSize(dir) {
  let bytes = 0
  let entries = 0
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, item.name)
    if (item.isDirectory()) {
      const sub = await fsSize(path)
      bytes += sub.bytes
      entries += sub.entries
    } else {
      bytes += (await stat(path)).size
      entries++
    }
  }
  return { bytes, entries }
}

console.log('▶ 准备裁剪目录')
await rm(stage, { recursive: true, force: true })
await mkdir(join(stage, 'sys/lib/wasm32-wasip1/eh'), { recursive: true })

// ── 头：整个 wasip1 树先抄过来，再删掉明确不要的 ─────────────────────────────
console.log('▶ 头文件')
const headerSrc = join(sysroot, 'include/wasm32-wasip1')
const headerDst = join(stage, 'sys/include/wasm32-wasip1')
await cp(headerSrc, headerDst, { recursive: true })
for (const gone of [
  'noeh',
  'eh/mach-o',
  'eh/c++/v1/__cxx03',
  'eh/c++/v1/module.modulemap',
  'eh/c++/v1/libcxx.imp',
  'eh/libunwind.modulemap',
]) {
  await rm(join(headerDst, gone), { recursive: true, force: true })
}

const builtinDst = join(stage, 'sys/lib/clang', llvmVersion.split('.')[0], 'include')
await mkdir(builtinDst, { recursive: true })
const builtinSrc = join(resourceDir, 'include')
for (const name of await readdir(builtinSrc)) {
  const keep =
    BUILTIN_HEADERS.includes(name) ||
    BUILTIN_HEADER_PREFIXES.some((p) => name.startsWith(p))
  if (keep) await cp(join(builtinSrc, name), join(builtinDst, name))
}
if (!existsSync(join(builtinDst, 'stddef.h'))) {
  throw new Error('内置头没抄到（stddef.h 缺失），检查 wasi-sdk 版本')
}

// ── 库 ──────────────────────────────────────────────────────────────────────
console.log('▶ 库')
const libSrc = join(sysroot, 'lib/wasm32-wasip1')
for (const name of SYS_LIBS) await cp(join(libSrc, name), join(stage, 'sys/lib/wasm32-wasip1', name))
for (const name of EH_LIBS) await cp(join(libSrc, 'eh', name), join(stage, 'sys/lib/wasm32-wasip1/eh', name))

const builtinsSrc = join(resourceDir, 'lib/wasm32-unknown-wasip1/libclang_rt.builtins.a')
const builtinsDst = join(stage, 'sys/lib/clang', llvmVersion.split('.')[0], 'lib/wasm32-unknown-wasip1')
await mkdir(builtinsDst, { recursive: true })
await cp(builtinsSrc, join(builtinsDst, 'libclang_rt.builtins.a'))

// ── 剥调试段 ────────────────────────────────────────────────────────────────
console.log('▶ llvm-strip --strip-debug')
for (const dir of [
  join(stage, 'sys/lib/wasm32-wasip1'),
  join(stage, 'sys/lib/wasm32-wasip1/eh'),
  builtinsDst,
]) {
  for (const name of await readdir(dir)) {
    if (name.endsWith('.a') || name.endsWith('.o')) run(llvmStrip, ['--strip-debug', join(dir, name)])
  }
}

// ── 打包 ────────────────────────────────────────────────────────────────────
console.log('▶ 打包（tar + brotli q11）')
const before = await fsSize(stage)
run('tar', ['-cf', tarball, 'sys'], stage)

const tar = await readFile(tarball)
const br = brotli(tar)
await writeFile(brotliFile, br)
await rm(tarball)

const packed = await stat(brotliFile)
console.log('')
console.log(`sys23-fs.tar.br  ${mib(packed.size)}（tar ${mib(tar.length)} / 解包 ${mib(before.bytes)} / ${before.entries} 条）`)

// ── 内核：同口径预压，省掉 Vercel 那一档（它的 br 比 q11 差 ~1.38×）────────────
for (const name of ['clang.wasm', 'wasm-ld.wasm']) {
  const src = join(outDir, name)
  if (!existsSync(src)) {
    console.log(`⚠ 缺 ${name}（先跑 npm run wasm:core:build），跳过`)
    continue
  }
  const buf = await readFile(src)
  const out = `${src}.br`
  await writeFile(out, brotli(buf))
  console.log(`${name}.br  ${mib((await stat(out)).size)}（raw ${mib(buf.length)}）`)
}
