/**
 * prepare-android-toolchain —— 组装 Android 随包的 C++ 工具链，产出一个 tar.gz 塞进 APK 的 assets。
 *
 * 为什么 Android 需要「自己带一份编译器」：系统不自带 clang++，NDK 里那套是给**电脑**用来交叉
 * 编译的，跑不到手机上。这里取的是 Termux 的「Android 宿主」工具链（aarch64/bionic），
 * 按 pinned 版本从清华镜像站取 .deb 再重组。
 *
 * 为什么是构建期组装、而不是把 tarball 提交进仓库：产物 75 MB，进 Git 就是仓库永久变胖，
 * 每次 clone、以及 AMO 那套 git archive 源码包都得拖着它。这里只留配方（下面 PACKAGES 那张表），
 * 产物落在 gen/android 的 assets 里、由 .gitignore 挡在版本库外。
 *
 * 产物（都在 src-tauri/gen/android/app/src/main/assets/，Gradle 会自动打进 apk）：
 *   android-toolchain.tgz        解压到设备私有目录即得到 <files>/compiler/ 整棵树
 *   android-toolchain.version    内容是该 tgz 的 sha256；设备端拿它当「要不要重新解压」的判据
 *
 * 两个必须显式处理、否则设备上跑不起来的地方（都是真机上踩出来的）：
 *   1) **可执行位**：tar 会把 mode 原样还原，所以打包时必须带 755。丢了这个位，
 *      设备上直接 `can't execute: Permission denied`（而且报在子进程里，看着像运行错误）。
 *   2) **目录树照抄 Termux 的 $PREFIX 布局**（bin / include / lib / lib/clang/<ver>）：
 *      clang 靠 argv[0] 推自己的 resource dir，摆成这个形状它才自发现得了，
 *      就不用额外传 -resource-dir。同理 lib/ 下的库文件名必须按 DT_NEEDED 里的名字命名。
 *
 * 用法：node scripts/prepare-android-toolchain.mjs
 * 依赖：系统 tar 必须能读 ar 与 xz（macOS 自带的 bsdtar 可以；GNU tar 读不了 ar，
 *        Linux 上得另装 libarchive-tools）。Node 侧没有 xz 解压能力，这一层绕不开。
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, posix } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MIRROR = 'https://mirrors.tuna.tsinghua.edu.cn/termux/apt/termux-main'
// 下载与解包都缓在这里：node_modules 已被 .gitignore 挡住，npm ci 也顺手清掉
const CACHE = join(ROOT, 'node_modules/.cache/android-toolchain')
const ASSETS = join(ROOT, 'src-tauri/gen/android/app/src/main/assets')
const ARCHIVE = join(ASSETS, 'android-toolchain.tgz')
const VERSION_FILE = join(ASSETS, 'android-toolchain.version')

/**
 * 这套工具链的**配方**：包名 → [版本, 仓库内路径, 字节数]。
 *
 * 路径与字节数写死而不去解析 Packages 索引：索引里没有的东西才需要现算，而这里每一条
 * 都已在真机上验过。字节数顺带当下载完整性校验用。**改这里等于换一次工具链**
 * —— 产物的 sha256 会变，设备端下次启动就会重新解压。
 *
 * liblzma / ncurses / libandroid-glob 这些传递依赖刻意不在表里：它们在 Termux 的依赖闭包里，
 * 但不在 clang 的 DT_NEEDED 闭包里，装进来纯属白占体积。
 */
const PACKAGES = {
  clang: ['21.1.8-3', 'pool/main/c/clang/clang_21.1.8-3_aarch64.deb', 30740228],
  libllvm: ['21.1.8-3', 'pool/main/libl/libllvm/libllvm_21.1.8-3_aarch64.deb', 30733892],
  'libc++': ['30', 'pool/main/libc/libc++/libc++_30_aarch64.deb', 341604],
  'libcompiler-rt': ['21.1.8-3', 'pool/main/libc/libcompiler-rt/libcompiler-rt_21.1.8-3_aarch64.deb', 3024604],
  lld: ['21.1.8-3', 'pool/main/l/lld/lld_21.1.8-3_aarch64.deb', 2812212],
  'ndk-sysroot': ['30', 'pool/main/n/ndk-sysroot/ndk-sysroot_30_aarch64.deb', 1996888],
  libffi: ['3.8.0', 'pool/main/libf/libffi/libffi_3.8.0_aarch64.deb', 37592],
  libiconv: ['1.19', 'pool/main/libi/libiconv/libiconv_1.19_aarch64.deb', 562724],
  libxml2: ['2.15.4-1', 'pool/main/libx/libxml2/libxml2_2.15.4-1_aarch64.deb', 442652],
  zlib: ['1.3.2', 'pool/main/z/zlib/zlib_1.3.2_aarch64.deb', 62840],
  zstd: ['1.5.7-1', 'pool/main/z/zstd/zstd_1.5.7-1_aarch64.deb', 360488],
}

/** 动态库闭包里**允许**解析不到的名字：这几只由系统 linker 提供，Android 上一律自带 */
const SYSTEM_LIBS = new Set(['libc.so', 'libdl.so', 'libm.so'])

/** Termux 的 deb 一律把内容摊在 data/data/com.termux/files/usr 下，两条路径的公共前缀 */
const USR = 'data/data/com.termux/files/usr'

/** 解出来的某个包的 $PREFIX 等价目录 */
function usr(packageName) {
  const [version] = PACKAGES[packageName]
  return join(CACHE, 'unpacked', `${packageName}_${version}`, 'root', USR)
}

// ---------------------------------------------------------------- 取包与解包

/** 系统 tar 得能读 ar（.deb 是 ar 归档）和 xz。GNU tar 读不了 ar，所以这一条要早点报出来 */
function assertTarCanReadDeb() {
  try {
    execFileSync('tar', ['--version'], { stdio: 'pipe' })
  } catch {
    throw new Error('找不到 tar；这一步要它来解 .deb（ar 归档 + xz），Node 侧没有 xz 解压能力')
  }
}

function download(url, dest, expectedSize) {
  return fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
      return response.arrayBuffer()
    })
    .then((buffer) => {
      const bytes = Buffer.from(buffer)
      if (bytes.length !== expectedSize) {
        throw new Error(`字节数对不上：拿到 ${bytes.length}，配方里写的是 ${expectedSize}`)
      }
      mkdirSync(dirname(dest), { recursive: true })
      writeFileSync(dest, bytes)
      return bytes.length
    })
    .then((size) => {
      console.log(`  ${posix.basename(url)}  ${(size / 1048576).toFixed(1)} MB`)
    })
}

async function fetchDebs() {
  console.log(`取 ${Object.keys(PACKAGES).length} 个 Termux 包（缓存目录 ${CACHE}）`)
  for (const [name, [version, path, size]] of Object.entries(PACKAGES)) {
    const deb = join(CACHE, 'debs', posix.basename(path))
    if (existsSync(deb) && statSync(deb).size === size) continue
    await download(`${MIRROR}/${path}`, deb, size)
  }
}

/**
 * deb → 目录树：外层是 ar（控制信息 + data.tar.xz），内层才是真正的文件树。
 *
 * `data.tar.xz` **刻意留着不删**：大小写冲突的那几份还得回头从它里面按名取内容
 * （见 recoverCaseCollisions）。它也只有几 MB，留着不碍事。
 */
function unpackDebs() {
  for (const [name, [version]] of Object.entries(PACKAGES)) {
    const root = join(CACHE, 'unpacked', `${name}_${version}`)
    const dir = join(root, 'root')
    // 拿 data.tar.xz 一起当「已解包」的判据：早期版本跑完会把它删掉，这里要让那些缓存重解一次
    if (existsSync(usr(name)) && existsSync(join(root, 'data.tar.xz'))) continue
    // 上一次跑到一半留下的残骸会让「已解包」的判断失真，先清干净
    rmSync(root, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    const deb = join(CACHE, 'debs', posix.basename(PACKAGES[name][1]))
    execFileSync('tar', ['-xf', deb, '-C', root], { stdio: 'pipe' })
    execFileSync('tar', ['-xf', join(root, 'data.tar.xz'), '-C', dir], { stdio: 'pipe' })
  }
}

// ---------------------------------------------------------------- 依赖闭包

/**
 * 读一个 ELF64 小端文件的 DT_NEEDED 与 DT_SONAME（只做这一件事，够用）。
 *
 * 为什么非要有这一步：上一轮只看了 clang 自己的 DT_NEEDED，漏掉 libLLVM.so 自己还要的
 * libffi.so 等，设备上直接报 `library "libffi.so" not found`。闭包必须递归算。
 */
function dynamicEntries(file) {
  let data
  try {
    data = readFileSync(file)
  } catch {
    return { needed: [], soname: null }
  }
  if (data.length < 64 || data.readUInt32LE(0) !== 0x464c457f || data[4] !== 2) {
    return { needed: [], soname: null }
  }
  const phoff = Number(data.readBigUInt64LE(0x20))
  const phentsize = data.readUInt16LE(0x36)
  const phnum = data.readUInt16LE(0x38)

  const loads = []
  let dynamic = null
  for (let i = 0; i < phnum; i += 1) {
    const at = phoff + i * phentsize
    const type = data.readUInt32LE(at)
    const offset = Number(data.readBigUInt64LE(at + 8))
    const vaddr = Number(data.readBigUInt64LE(at + 16))
    const filesz = Number(data.readBigUInt64LE(at + 32))
    if (type === 1) loads.push([vaddr, offset, filesz])
    else if (type === 2) dynamic = [offset, filesz]
  }
  if (!dynamic) return { needed: [], soname: null }

  const vaddrToOffset = (vaddr) => {
    for (const [segVaddr, segOffset, filesz] of loads) {
      if (vaddr >= segVaddr && vaddr < segVaddr + filesz) return vaddr - segVaddr + segOffset
    }
    return null
  }

  const entries = []
  for (let i = 0; i < dynamic[1] / 16; i += 1) {
    const at = dynamic[0] + i * 16
    entries.push([Number(data.readBigUInt64LE(at)), Number(data.readBigUInt64LE(at + 8))])
  }
  const strtab = entries.find(([tag]) => tag === 5)
  if (!strtab) return { needed: [], soname: null }
  const base = vaddrToOffset(strtab[1])
  if (base === null) return { needed: [], soname: null }

  const cstr = (offset) => {
    const end = data.indexOf(0, base + offset)
    return data.toString('utf8', base + offset, end)
  }
  const soname = entries.find(([tag]) => tag === 14)
  return {
    needed: entries.filter(([tag]) => tag === 1).map(([, value]) => cstr(value)),
    soname: soname ? cstr(soname[1]) : null,
  }
}

/**
 * 从 clang-21 出发做 BFS，把整个 DT_NEEDED 闭包算出来。
 *
 * 返回「库名 → 源文件绝对路径」，**库名用的是 DT_NEEDED 里的写法而非文件在盘上的名字**
 * —— 设备上 linker 是拿 DT_NEEDED 的名字去找文件的，名字必须对上。
 */
function resolveClosure(entry) {
  const index = new Map()
  for (const name of Object.keys(PACKAGES)) {
    const libDir = join(usr(name), 'lib')
    if (!existsSync(libDir)) continue
    for (const entryName of readdirSync(libDir)) {
      const file = join(libDir, entryName)
      if (!lstatSync(file).isFile() && !lstatSync(file).isSymbolicLink()) continue
      const { soname } = dynamicEntries(file)
      for (const key of [entryName, soname]) {
        if (key && !index.has(key)) index.set(key, file)
      }
    }
  }

  const resolved = new Map()
  const unresolved = new Set()
  const queue = [...dynamicEntries(entry).needed]
  while (queue.length > 0) {
    const name = queue.shift()
    if (resolved.has(name) || unresolved.has(name)) continue
    const source = index.get(name)
    if (!source) {
      unresolved.add(name)
      continue
    }
    resolved.set(name, source)
    for (const child of dynamicEntries(source).needed) {
      if (!resolved.has(child) && !unresolved.has(child)) queue.push(child)
    }
  }

  const unknown = [...unresolved].filter((name) => !SYSTEM_LIBS.has(name))
  if (unknown.length > 0) {
    // 不静默：多半是配方里少下载了一个包，或者 Termux 那边改了依赖
    throw new Error(`有库既不在随包闭包里、也不在系统白名单里：${unknown.join(' ')}`)
  }
  return { resolved, unresolved: [...unresolved].sort() }
}

// ---------------------------------------------------------------- 组装目录树

/** 把源文件复制过去，并**显式**把 mode 也带过去：copyFileSync 不保留权限位 */
function copyWithMode(source, target, mode) {
  mkdirSync(dirname(target), { recursive: true })
  copyFileSync(source, target)
  chmodSync(target, mode)
}

/**
 * 找回「只差大小写」的同名文件。
 *
 * ndk-sysroot 的 include 下确实存在 8 对只差大小写的头文件（xt_MARK.h / xt_mark.h、
 * ipt_ECN.h / ipt_ecn.h 这些）。macOS 的 APFS 默认大小写不敏感，解到盘上时后一个会把前一个
 * 顶掉 —— 而且**在盘上无解**，同一目录塞不下两个只差大小写的名字。
 *
 * 所以这一份内容不能走文件系统：直接从 deb 的 data.tar.xz 里按名读出来，作为内存里的
 * entry.content 塞进 tar（writeTar 认这个字段）。在大小写敏感的文件系统上（Linux CI）
 * 两份都在盘上，这段逻辑自然一份都不补，结果一致。
 *
 * 只扫「整目录照抄」的那两棵子树 —— lib/ 下的库是按 DT_NEEDED 的名字落的，不在此列。
 */
function recoverCaseCollisions() {
  const TREES = [
    { pkg: 'ndk-sysroot', from: 'include', to: 'include' },
    { pkg: 'clang', from: 'lib/clang/21', to: 'lib/clang/21' },
    { pkg: 'libcompiler-rt', from: 'lib/clang/21', to: 'lib/clang/21' },
  ]
  const recovered = []
  for (const { pkg, from, to } of TREES) {
    const root = join(CACHE, 'unpacked', `${pkg}_${PACKAGES[pkg][0]}`)
    const archive = join(root, 'data.tar.xz')
    const head = `./${USR}/${from}/`
    const listing = execFileSync('tar', ['-tf', archive], {
      encoding: 'utf8',
      maxBuffer: 128 * 1024 * 1024,
    })
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.endsWith('/') && line.startsWith(head))

    // 按小写归组；只有组里多于一条才谈得上冲突
    const groups = new Map()
    for (const line of listing) {
      const rel = line.slice(head.length)
      const key = rel.toLowerCase()
      const members = groups.get(key)
      if (members) members.push({ rel, line })
      else groups.set(key, [{ rel, line }])
    }

    const onDisk = join(root, 'root', USR, from)
    for (const members of groups.values()) {
      if (members.length < 2) continue
      for (const { rel, line } of members) {
        if (survivesOnDisk(onDisk, rel)) continue
        const content = execFileSync('tar', ['-xOf', archive, line], { maxBuffer: 64 * 1024 * 1024 })
        if (content.length === 0) {
          console.warn(`  警告：${pkg} 的 ${rel} 从归档里取出来是空的，跳过`)
          continue
        }
        recovered.push({ path: `${to}/${rel}`, type: '0', mode: 0o644, content })
      }
    }
  }
  if (recovered.length > 0) {
    console.log(`  补回 ${recovered.length} 份大小写冲突文件：${recovered.map((e) => posix.basename(e.path)).join(' ')}`)
  }
  return recovered
}

/** 这个相对路径在盘上是否**按原样**活着（大小写不敏感的文件系统上 existsSync 骗人，得看目录里真正的名字） */
function survivesOnDisk(root, rel) {
  const at = rel.lastIndexOf('/')
  const parent = at === -1 ? root : join(root, rel.slice(0, at))
  const name = at === -1 ? rel : rel.slice(at + 1)
  return existsSync(parent) && readdirSync(parent).includes(name)
}

/**
 * 判题链路（aarch64 上跑 `clang++ 一个 .cpp` 再执行一遍）永远用不到的东西，随包带上就是白占
 * 设备空间。两类，实测合计约 41 MiB（原始）/ 约 11 MiB（压进 tgz 后）：
 *
 * - `lib/linux/` 下 compiler-rt 的**运行库**：sanitizer（asan / tsan / ubsan / lsan / hwasan）、
 *   fuzzer、profile、stats、orc-jit。它们只有 `-fsanitize=` / `-fprofile-` 这类开关才会被链上，
 *   判题不带这些开关。**只留 `libclang_rt.builtins-*.a`** —— 它是每次普通链接都要的。
 * - `include/` 下按架构分的 intrinsic 头：aarch64 上够不到 x86 / ppc / s390 / mips / hexagon /
 *   loongarch 那一堆（`*intrin.h`、`altivec.h`、`vecintrin.h`、`hexagon*` 等），带了也是死重量。
 *   ARM 自己的 NEON / SVE / MVE / SME 与 OpenCL 一并去掉：手写 SIMD 本就在判题范围外，
 *   而单一个 arm_neon.h 就 3 MiB。
 *
 * libc++ 的 `c++/v1`、bionic 的 C 头、以及 stddef / stdint / float 这些基础头**都要留**。
 */
const PRUNE_INCLUDE = [
  /^(arm_neon|arm_sve|arm_mve|arm_sme)\.h$/,
  /^opencl-c(-base)?\.h$/,
  /^altivec\.h$/,
  /^vecintrin\.h$/,
  /^hexagon.*\.h$/,
  /^hvx_.*\.h$/,
  /^lasxintrin\.h$/,
  /^lsxintrin\.h$/,
  /^msa\.h$/,
  /intrin\.h$/, // x86 的 avx* / sse* / emmintrin… 以及 MSVC 兼容的那份 intrin.h
]

function pruneUnusedAssets(resourceDir) {
  const dropped = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const child = join(dir, name)
      const stat = lstatSync(child)
      if (stat.isDirectory()) {
        walk(child)
        continue
      }
      if (!stat.isFile()) continue
      const rel = posix.relative(resourceDir, child)
      const isRuntime = rel.startsWith('lib/linux/') && !/libclang_rt\.builtins/.test(name)
      const isArchHeader = rel.startsWith('include/') && PRUNE_INCLUDE.some((re) => re.test(name))
      if (!isRuntime && !isArchHeader) continue
      dropped.push(stat.size)
      rmSync(child)
    }
  }
  walk(resourceDir)
  const bytes = dropped.reduce((sum, size) => sum + size, 0)
  console.log(
    `  瘦身：去掉 ${dropped.length} 个判题用不到的资产，共 ${(bytes / 1048576).toFixed(1)} MiB`,
  )
}

/**
 * 系统头里判题同样用不到的部分，实测合计约 8.2 MiB（原始）/ 约 3 MiB（压进 tgz 后）：
 *
 * - `c++/v1/__cxx03/`：libc++ 的 C++03 模式副本，一家就 6.0 MiB。v1 下 134 个引用它的头
 *   **全部**落在 `#if __cplusplus < 201103L && defined(_LIBCPP_USE_FROZEN_CXX03_HEADERS)`
 *   之下，而判题固定 `-std=c++17`，`__cplusplus` 远大于 201103L —— 那半边永远不展开，等于死代码。
 * - `camera/`、`drm/`：Android 相机与图形驱动的头，纯算法题够不到。
 * - `x86_64-linux-android/`、`i686-linux-android/`、`arm-linux-androideabi/`、`riscv64-linux-android/`：
 *   非本架构，aarch64 的 clang 永远搜不到它们。
 *
 * 两个**必须留**的：`aarch64-linux-android/` 装着 asm/ 那类本架构专属头；`android/` 是
 * bionic 的正经 API 头（`api-level.h` 那批），C 头会 include 过去，删了会炸。
 */
const PRUNE_SYSROOT_INCLUDE = [
  'c++/v1/__cxx03',
  'camera',
  'drm',
  'x86_64-linux-android',
  'i686-linux-android',
  'arm-linux-androideabi',
  'riscv64-linux-android',
]

/** 递归量一个目录的字节数，只为把瘦身账打进日志 */
function sizeOfDir(dir) {
  let total = 0
  for (const name of readdirSync(dir)) {
    const child = join(dir, name)
    const stat = lstatSync(child)
    total += stat.isDirectory() ? sizeOfDir(child) : stat.size
  }
  return total
}

function pruneSysrootIncludes(includeDir) {
  let bytes = 0
  let count = 0
  for (const rel of PRUNE_SYSROOT_INCLUDE) {
    const at = join(includeDir, rel)
    if (!existsSync(at)) continue
    bytes += sizeOfDir(at)
    rmSync(at, { recursive: true, force: true })
    count += 1
  }
  console.log(
    `  瘦身：去掉 ${count} 处判题用不到的系统头，共 ${(bytes / 1048576).toFixed(1)} MiB`,
  )
}

/**
 * 按 Termux 的 $PREFIX 布局拼出整棵树。
 *
 * 返回条目清单（而不是直接把树丢给 tar），因为打包那一步需要每条自己的 mode ——
 * `bin/` 下的可执行位就是靠它带进去的。
 */
function assemble(tree) {
  const entries = []

  const addFile = (rel, source) => {
    // 权限统一在这儿定死，不抄源文件的：Termux 的 deb 里连头文件都是 0600、二进制是 0700，
    // 照抄出来的树到处是「别人读不了」。可执行位只给 bin/ 下的东西 —— 4b 那次
    // `can't execute: Permission denied` 就是丢了这个位，所以这里显式写 755。
    const mode = rel.startsWith('bin/') ? 0o755 : 0o644
    copyWithMode(source, join(tree, rel), mode)
    entries.push({ path: rel, type: '0', mode, source: join(tree, rel) })
  }
  const addDir = (rel) => entries.push({ path: `${rel}/`, type: '5', mode: 0o755 })
  const addLink = (rel, target) => {
    mkdirSync(dirname(join(tree, rel)), { recursive: true })
    symlinkSync(target, join(tree, rel))
    entries.push({ path: rel, type: '2', mode: 0o777, link: target })
  }

  // 1) 编译器本体。clang 与 clang++ 都是软链 —— 它靠 argv[0] 决定按 C 还是 C++ 驱动
  addFile('bin/clang-21', join(usr('clang'), 'bin/clang-21'))
  addLink('bin/clang', 'clang-21')
  addLink('bin/clang++', 'clang-21')

  // 2) 链接器。lld 是单文件多入口，靠 argv[0] 分派；clang 默认找的是 ld.lld 这个名字
  addFile('bin/lld', join(usr('lld'), 'bin/lld'))
  addLink('bin/ld.lld', 'lld')

  // 3) 系统头（含 C++ 的 c++/v1 与按架构分的 aarch64-linux-android，两处都要 -isystem 指过去）
  cpSync(join(usr('ndk-sysroot'), 'include'), join(tree, 'include'), { recursive: true })
  // 3.5) 瘦身：C++03 副本、Android 相机/图形头、非本架构头，就地删掉再登记，
  //      这样它们连 tar 条目都不会有
  pruneSysrootIncludes(join(tree, 'include'))
  addDir('include')
  walkInto(join(tree, 'include'), 'include', entries)

  // 4) 依赖闭包。名字按 DT_NEEDED 落，不用源文件名
  for (const [name, source] of resolveClosure(join(tree, 'bin/clang-21')).resolved) {
    addFile(`lib/${name}`, source)
  }

  // 5) ndk-sysroot 的链接期材料（crt*.o / lib*.a / libpthread.so 这类 stub）。
  //    同名不覆盖：闭包里那几个才是运行时真正要加载的
  const sysrootLib = join(usr('ndk-sysroot'), 'lib')
  for (const name of readdirSync(sysrootLib)) {
    if (existsSync(join(tree, 'lib', name))) continue
    addFile(`lib/${name}`, join(sysrootLib, name))
  }

  // 6) resource dir：clang 的内置头 + compiler-rt 的 builtins。两个包往同一处叠
  cpSync(join(usr('clang'), 'lib/clang/21'), join(tree, 'lib/clang/21'), { recursive: true })
  cpSync(join(usr('libcompiler-rt'), 'lib/clang/21'), join(tree, 'lib/clang/21'), {
    recursive: true,
    force: true,
  })
  // 6.5) 瘦身：判题用不到的资产（sanitizer/fuzzer 运行库、非本架构的 intrinsic 头）就地删掉，
  //      后面 walkInto 读的是盘上的树，删了就不会进清单
  pruneUnusedAssets(join(tree, 'lib/clang/21'))
  walkInto(join(tree, 'lib/clang'), 'lib/clang', entries, { skipLink: 'latest' })
  addLink('lib/clang/latest', '21')

  // 7) 补回大小写冲突里在盘上活不下来的那几份。它们的父目录条目上面已经登记过
  entries.push(...recoverCaseCollisions())

  // 顶层目录自己也要有 tar 条目：Gradle 那边不关心，但少了它 tar 的结构不完整
  for (const dir of ['bin', 'include', 'lib', 'lib/clang']) addDir(dir)
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  return dedupe(entries)
}

/** `cpSync` 拷完目录后，把里面每个条目登记进清单（目录也要，tar 里得有目录项） */
function walkInto(dir, rel, entries, { skipLink } = {}) {
  for (const name of readdirSync(dir).sort()) {
    if (name === skipLink) continue
    const child = join(dir, name)
    const childRel = posix.join(rel, name)
    const stat = lstatSync(child)
    if (stat.isDirectory()) {
      entries.push({ path: `${childRel}/`, type: '5', mode: 0o755 })
      walkInto(child, childRel, entries, { skipLink })
    } else if (stat.isSymbolicLink()) {
      entries.push({ path: childRel, type: '2', mode: 0o777, link: readlinkSync(child) })
    } else {
      // 权限跟 addFile 一个口径：不抄源文件的（deb 里头文件是 0600，抄出来别人读不了）
      entries.push({ path: childRel, type: '0', mode: 0o644, source: child })
    }
  }
}

/** 同名条目只留一条：第 6 步叠了两个包，目录项会重复登记 */
function dedupe(entries) {
  const seen = new Map()
  for (const entry of entries) {
    const previous = seen.get(entry.path)
    // 文件优先于目录：同一路径既是目录又是文件是不可能的，但软链与目录可能同名前缀
    if (!previous || (previous.type === '5' && entry.type !== '5')) seen.set(entry.path, entry)
  }
  return [...seen.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}

// ---------------------------------------------------------------- 写成 tar.gz

/** USTAR 的八进制字段：宽度减一填 0，末位补 NUL */
function octal(value, width) {
  return `${value.toString(8).padStart(width - 1, '0')}\0`
}

/**
 * 自己写 tar，而不是调系统的。
 *
 * 因为 bsdtar 在 macOS 上**不支持 --mtime**，拿它打包每次的时间戳都不一样，sha256 跟着变，
 * 设备端就会每次都重新解压一遍 219 MB。自己写就能把 mtime / uid / gid 全钉成 0，
 * 顺带条目顺序也稳定 —— 换台机器、换个时间打包，字节完全一致。
 *
 * 只需 USTAR 一种格式：这棵树的路径最长 80 字符，塞得进 100 字节的 name 字段，用不着
 * prefix 拆分，更用不着 PAX 扩展头。
 */
function writeTar(entries) {
  const blocks = []
  for (const entry of entries) {
    if (Buffer.byteLength(entry.path) > 100) {
      throw new Error(`路径超过 USTAR 的 100 字节上限：${entry.path}`)
    }
    const header = Buffer.alloc(512)
    // 内容要么在内存里（大小写冲突补回的那几份），要么在盘上
    const content = entry.type === '0' ? (entry.content ?? readFileSync(entry.source)) : null
    const size = content ? content.length : 0
    header.write(entry.path, 0, 100, 'utf8')
    header.write(octal(entry.mode, 8), 100, 8, 'ascii')
    header.write(octal(0, 8), 108, 8, 'ascii') // uid
    header.write(octal(0, 8), 116, 8, 'ascii') // gid
    header.write(octal(size, 12), 124, 12, 'ascii')
    header.write(octal(0, 12), 136, 12, 'ascii') // mtime 钉成 0，打包才可复现
    header.write('        ', 148, 8, 'ascii') // 校验和先占位，取完和再回填
    header.write(entry.type, 156, 1, 'ascii')
    header.write(entry.link || '', 157, 100, 'utf8')
    header.write('ustar\0', 257, 6, 'ascii')
    header.write('00', 263, 2, 'ascii')

    const sum = header.reduce((acc, byte) => acc + byte, 0)
    header.write(`${octal(sum, 7)} `, 148, 8, 'ascii')

    blocks.push(header)
    if (size > 0) {
      blocks.push(content)
      const padding = (512 - (size % 512)) % 512
      if (padding > 0) blocks.push(Buffer.alloc(padding))
    }
  }
  // tar 的收尾：两个全零块
  blocks.push(Buffer.alloc(1024))
  return Buffer.concat(blocks)
}

// ---------------------------------------------------------------- 主流程

async function main() {
  assertTarCanReadDeb()
  await fetchDebs()
  unpackDebs()

  const tree = join(tmpdir(), `cp-android-toolchain-${process.pid}`)
  rmSync(tree, { recursive: true, force: true })
  mkdirSync(join(tree, 'bin'), { recursive: true })
  mkdirSync(join(tree, 'lib'), { recursive: true })

  const entries = assemble(tree)
  const tar = writeTar(entries)
  const tgz = gzipSync(tar, { level: 9 })

  mkdirSync(ASSETS, { recursive: true })
  writeFileSync(ARCHIVE, tgz)
  const sha256 = createHash('sha256').update(tgz).digest('hex')
  writeFileSync(VERSION_FILE, `${sha256}\n`)

  const files = entries.filter((entry) => entry.type === '0').length
  const unpacked = entries.reduce(
    (sum, entry) =>
      sum + (entry.type === '0' ? (entry.content?.length ?? statSync(entry.source).size) : 0),
    0,
  )
  console.log(
    `prepare-android-toolchain: ${entries.length} 个条目（${files} 个文件），` +
      `解压后 ${(unpacked / 1048576).toFixed(0)} MB → 打包 ${(tgz.length / 1048576).toFixed(1)} MB`,
  )
  console.log(`  ${ARCHIVE}`)
  console.log(`  sha256 ${sha256}`)

  rmSync(tree, { recursive: true, force: true })
}

await main()
