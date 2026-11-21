/**
 * C++ 沙箱流水线 —— 在浏览器里用 wasm 版 clang 23.1.0 + wasm-ld 编译并运行 C++。
 *
 * **阶段 4（2026-10-25）起，C++ 的 compile / link / run / syntax 全部走自写 WASI 宿主**
 * （`services/wasi/host.js` + `wasi.worker.js` + `client.js`）：worker 里常驻 clang / wasm-ld
 * 模块与 1385 条 sysroot，只换 argv 与源码；不再每次 run 重新实例化 + 整份 clone。
 * 本文件保留 runno 的 `WASIWorkerHost` 只服务 Python（解释器那条线没有要修的问题），
 * 以及 C++ 的编译缓存、PCH、语法诊断和工具链资产清单。
 *
 * 历史：之前 C++ 也走 runno（binji 的 clang 8），它的 stdin 是 8 KiB SAB 槽 + setTimeout
 * 轮询（实测 1.6 MB/s），stdout 还要逐块跨线程 postMessage —— 阶段 4 把这两条拿回来。
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
import { t } from '../i18n/index.js'
import { deletePch, readPch, writePch } from './pchStore.js'
import { TOOLCHAIN_CACHE } from './storageNames.js'
import {
  TOOLCHAIN_ASSETS_BASE,
  TOOLCHAIN_ASSET_KEYS,
  TOOLCHAIN_ASSET_LABELS,
  TOOLCHAIN_ASSET_URLS,
  TOOLCHAIN_ERROR,
  TOOLCHAIN_MANIFEST_KEY,
  TOOLCHAIN_VERSION,
  clearLastInstalledAt,
  createToolchainError,
  downloadToolchain,
  hasLegacyToolchain,
  inspectToolchain,
  probeToolchain,
  readLastInstalledAt,
} from './toolchainStore.js'
import { HOST_PRIORITY_BACKGROUND, KILL_REASON, WasiWorkerHost } from './wasi/client.js'
import { detectWasmFeatures } from './wasmFeatures.js'
// 文件记录的形状归 vfs/runnoFs.js 一处管：工具链的 sysroot 和用户 VFS 拍出来的表
// 必须长得一模一样，runno 才认。
import { fsEntry as wasiFile } from './vfs/runnoFs.js'

// 工具链自托管在 public/wasm/<版本>/。2026-11-22 起运行态换成**预压 gzip** 的
// `*.gzbin`（构建期由 scripts/build-toolchain-gzbin.mjs 从旧 `.br` 转出）：
// 响应故意不带 Content-Encoding，页面把原始压缩字节直接写进 Cache Storage，
// 运行时用 DecompressionStream 流式解压（见 services/toolchainStore.js）。
// 旧 `.br` 只作为老用户的**缓存读取回退**，不再拿去请求网络。
//
// 必须是**绝对地址**：runno 把 worker 源码做成 blob: URL 再 new Worker，
// 而 blob: 是非层级 scheme，在它里面解析 '/wasm/…' 这种相对路径会抛 Invalid URL。
const ASSETS = TOOLCHAIN_ASSETS_BASE
const CLANG_URL = TOOLCHAIN_ASSET_URLS.clang
const LINKER_URL = TOOLCHAIN_ASSET_URLS.linker
const SYSROOT_URL = TOOLCHAIN_ASSET_URLS.sysroot

/**
 * 解压态字节数（下载进度与解压进度条的分母）。
 *
 * wire 上的 `Content-Length` 是压缩态（clang 22.6MB），而 worker 的解压流产出 77.3MB，
 * 两者不能混用。精确值由构建脚本写进服务端清单，这里只是给旧格式回退 / 语义悬停
 * 一个同步可读的常量（与 public/wasm/23.1.0/toolchain-assets.json 对齐）。
 */
export const TOOLCHAIN_ASSET_BYTES = {
  clang: 77_295_003,
  linker: 43_510_455,
  sysroot: 16_328_704,
}

/**
 * Assets the host reads during `init` (clang + sysroot). Cache probes for the semantic
 * wake path use this subset: a hover-only session never needs wasm-ld's bytes in memory,
 * even though the download itself always fetches all three (see toolchainStore).
 */
export const FRONTEND_ASSET_URLS = [CLANG_URL, SYSROOT_URL]

/** Listeners fed by the host worker while it reads asset bytes (see services/wasi/client.js). */
const assetProgressListeners = new Set()

/**
 * Subscribe to toolchain progress.
 *
 * Two phases share this channel:
 * - `phase: 'download'` — aggregate **compressed** bytes across the three assets
 *   (key is `'download'`, total is the wire size, ~38MB);
 * - no phase — the worker decoding one asset, counted in **uncompressed** bytes
 *   (key is `clang` / `linker` / `sysroot`, denominator from the cached manifest).
 *
 * The two denominators are not interchangeable: clang is 22.6MB compressed but
 * 77.3MB decoded. Subscribers must branch on `phase` before computing a percentage.
 * @param {(progress: { key: string, loaded: number, total?: number, phase?: string }) => void} listener
 * @returns {() => void} unsubscribe
 */
export function onToolchainProgress(listener) {
  assetProgressListeners.add(listener)
  return () => assetProgressListeners.delete(listener)
}

function forwardAssetProgress(progress) {
  for (const listener of assetProgressListeners) {
    try {
      listener(progress)
    } catch {
      /* one broken subscriber must not stop the rest */
    }
  }
}
// 客户端稳态只留当前档（规划 §5 第 6 项）。**不要在这里列举「要清哪一代」**：
// 换代只换目录名，而 `cp-toolchain*` 在 SW 的 keep 白名单里，没有任何人会替我们回收
// 桶里旧目录的条目 —— 写死一张旧 URL 表，就等于写了「只回收这特定的一代」。
// 「该留哪些」一律由当前资产地址推出来（见 pruneLegacyToolchainCache / purgeRuntimeCache）。
const WASM_PATH_SEGMENT = '/wasm/'

const SOURCE_PATH = '/program.cpp'
const OBJECT_PATH = '/program.o'
const BINARY_PATH = '/program.wasm'

/**
 * 把编译器诊断里的沙箱内路径换回用户的实际文件名（只改**显示文本**）。
 *
 * 用户代码永远写进 `/program.cpp` 再编，于是 clang 的每条诊断都长这样：
 * `/program.cpp:2:21: error: expected expression` —— 而用户的文件叫 `main.cpp`，
 * 行号对得上的那个路径在界面上根本不存在，看着像别人的报错（2026-10-25 用户问到这里）。
 *
 * 不动编译用的路径是有意的：真把源码写进 entryPath，遇到 `/a/b/c.cpp` 这类带目录的名字
 * 还得先建目录，而宿主那边 mkdir 是残缺实现（见上面 PCH 那段的说明）。
 *
 * @param {string} text 编译器 stderr / 失败原因
 * @param {string} [entryPath] 用户文件的 VFS 路径，如 `/main.cpp`
 */
export function withSourceName(text, entryPath) {
  const raw = String(text ?? '')
  const name = typeof entryPath === 'string' ? entryPath.trim() : ''
  if (!raw || !name || name === SOURCE_PATH) return raw
  return raw.split(SOURCE_PATH).join(name)
}
// 内存证据探针（见 OOM_PROBE_SOURCE）：每次链接都带上，用来把「分配真的失败过」
// 和「其它任何 134」分开。
const OOM_PROBE_PATH = '/oj_oom_probe.cpp'
const OOM_OBJECT_PATH = '/oj_oom_probe.o'
// 23.1.0 的头布局：顶层没有通用头层，万能头必须落到 target 目录里
const UNIVERSAL_HEADER_PATH = '/sys/include/wasm32-wasip1/bits/stdc++.h'

// PCH 的源码与产物都放根目录：根目录是 WASI 的初始工作目录（fd 3），
// 不要指望自己建目录 —— runno 的 path_create_directory 是残缺实现（只会塞一个 .runno 文件）
const PCH_SOURCE_PATH = '/stdc++.h'
const PCH_PATH = '/stdc++.h.pch'

/**
 * 主编译的优化级别。它写死在 FRONTEND_ARGS 里，而 FRONTEND_ARGS 同时是 **PCH 的编译级别** ——
 * 两者必须一致：clang 拿 `__OPTIMIZE__` 的预定义状态校验 PCH，-O0 加载 -O2 编的 PCH 直接
 * fatal（实测 `error: __OPTIMIZE__ predefined macro was enabled in precompiled file … but is
 * currently disabled`），而且这条错误会命中 compileAndLink 里「PCH 判废」的分支，把好 PCH
 * 一并删掉。想给 -O0 也用上 PCH 就得存两份（pchStore 明确「一辈子只该有一份」），而 §18.3
 * 实测 PCH 只省 230–265ms —— 换 8.61MiB 存档与一套多份存档语义，不值。
 */
const OPT_MAIN = '-O2'

/**
 * 对拍（crossCheck）那一遍的优化级别：关掉全部优化，让编译器的假设退回最少。
 * 与主编译差得越远，UB 越容易在两边显出不同的输出（实测 -O1 已经开了 TBAA，
 * 严格别名那类在 -O1 与 -O2 上结果相同，抓不到，所以对照端不能用 -O1 省时间）。
 * ⚠️ 这条路**不加载 PCH**，见 compileAndLink 里那句 pch 取值。
 */
const OPT_CROSS = '-O0'

/**
 * 前端（cc1）的公共参数，PCH 生成和用户代码编译必须**逐字共用**这一份。
 *
 * 为什么不能各写各的：PCH 会把语言选项（-std、异常 / RTTI 开关等）和目标选项
 * 一起写进文件签名，加载时逐项校验。给 PCH 单独加 -fno-exceptions、而用户代码
 * 照旧开异常，轻则 clang 直接拒绝这个 PCH，重则混进语义不一致的 libc++ 声明
 * （libc++ 头在 -fno-exceptions 下生成的 AST 是不一样的）。
 * -O0 同理不要动：-emit-pch 只做解析 + 序列化、不做代码生成，改成 -O0 省不下时间，
 * 却会改变 __OPTIMIZE__ 这类预定义宏（对拍那条线确实要 -O0，但它**不加载 PCH**，
 * 参数由 clangArgs(pch=null, OPT_CROSS) 单独拼出来）。
 *
 * 两处与 clang 8 不同、**别再改回去**：
 * 1) clang 23 的 cc1 不认 `-fmessage-length`，也不认驱动层 `-fwasm-exceptions`
 *    与 `-msimd128`；异常要写六项展开式，SIMD 要写 `-target-feature +simd128`。
 * 2) 2026-10-25 拍板：`-std=c++20`、SIMD 开、RTTI 关。三条都是语言 / 目标选项，
 *    全部进 PCH 签名 —— 改任一条都会让 `PCH_ARGS_HASH` 变化，旧存档与旧资源自动失效。
 */
const FRONTEND_ARGS = [
  // 新内核没有内置 host triple（wasm32-wasip1 交叉编出来的 cc1），不显式给会报
  // `error: unknown target triple 'unknown'`
  '-triple',
  'wasm32-unknown-wasip1',
  '-isysroot',
  '/sys',
  '-internal-isystem',
  '/sys/include/wasm32-wasip1/eh/c++/v1',
  '-internal-isystem',
  '/sys/include/wasm32-wasip1',
  '-internal-isystem',
  '/sys/lib/clang/23/include',
  '-resource-dir',
  '/sys/lib/clang/23',
  '-ferror-limit',
  '4',
  // 自写宿主的 fd 2 是 CHARACTER_DEVICE，clang 23 会把它当 tty、默认开彩色诊断；
  // 卡片是纯文本渲染，必须显式关掉（runno 宿主下默认没有颜色，所以之前没暴露）。
  '-fno-color-diagnostics',
  // 编译器警告整类关掉：卡片只该显示「为什么编译不过」。
  // 原来这里写的是 `-w`，2026-10-26 换成等价的 `-Wno-everything` —— 因为 `-w` 是
  // 「全抑制」位，后面**再写任何 `-Wxxx` 都压不动它**（实测 `-w -Wdivision-by-zero`
  // 一条都不报）。换成这个之后，用户代码那次编译（见 clangArgs）才能单独把
  // 除零那一条放开；PCH / 探针 / 语法检查仍然全静音。
  '-Wno-everything',
  '-std=c++20',
  OPT_MAIN,
  // 与 CF / AtCoder 对齐（判定规范 §6）：让用户代码里的 `#ifdef ONLINE_JUDGE` 生效。
  '-DONLINE_JUDGE',
  // wasm 异常：cc1 的展开式，缺一不可（缺 +exception-handling 会在后端崩）。
  // ⚠ 必须是**新标准（exnref）**，不能停在 legacy：wasi-sdk 34 的 `eh` libc++ 是用
  // `try_table` / `throw_ref` 编的（`llvm-objdump` 实测），两边混用会让 V8 在实例化时
  // 直接拒绝："module uses a mix of legacy and new exception handling instructions"。
  // `-wasm-use-legacy-eh` 在 LLVM 23 里默认 true，必须显式关掉；新标准还要求
  // multivalue + reference-types（driver 的 `-fwasm-exceptions` 就是展开成这一组）。
  '-fexceptions',
  '-fcxx-exceptions',
  '-exception-model=wasm',
  '-target-feature',
  '+exception-handling',
  '-target-feature',
  '+multivalue',
  '-target-feature',
  '+reference-types',
  '-mllvm',
  '-wasm-enable-eh',
  '-mllvm',
  '-wasm-use-legacy-eh=false',
  // 2026-10-25 拍板：SIMD 开、RTTI 关。`-fno-rtti` 会让 dynamic_cast / typeid 变 CE，
  // 这是用户可见差异（guide / 使用手册要写明），不是顺手加的优化。
  '-target-feature',
  '+simd128',
  '-fno-rtti',
]

/**
 * 只有**用户代码那一次编译**才放开的编译期 UB 检查（2026-11-01 加，跟 `-Wdivision-by-zero`
 * 同一条路：诊断带回去，卡片补一行提示，判定一个字不动）。
 *
 * 为什么单挑这四条 —— 它们都能在**前端**给出结论，不需要第二遍编译、不需要第二颗宿主，
 * 实测单次编译 8–23ms，加与不加没有可测差别；而且它们正好补上 `-O0` 对拍最常漏的那一片。
 * 同一批 6 个 UB 样本里静态检查抓到 5 个（漏 `return` / 未初始化 / 越界读 / 越界写 / 悬垂栈地址），
 * 对拍只抓到 2 个。
 *
 * 报什么（clang 23.1.0 / wasm32-wasip1 实测，`-O2` 与 `-O0` 完全一致）：
 * - `-Wreturn-type`：`non-void function does not return a value in all control paths`；
 * - `-Wuninitialized`：`variable 'x' is uninitialized when used here`，分支里赋值那类走
 *   `-Wsometimes-uninitialized`，同属这一组；
 * - `-Warray-bounds`：`array index 5 is past the end of the array (that has type 'int[4]')`，
 *   读和写都报，但只有**常量下标**才报；
 * - `-Wreturn-stack-address`：`address of stack memory associated with local variable 'a' returned`。
 *
 * 为什么不放进 FRONTEND_ARGS：那是 PCH 生成、OOM 探针、编辑器语法检查共用的那份，PCH 会把
 * 一堆标准库头当用户代码编（1385 条 sysroot 进 AST），放开这些只会把警告洒在别人的文件上；
 * 而且编辑器那条路要的是「编译不过」，多出来的波浪线会盖住真错误。
 *
 * 噪声实测（这些**不会**报，也就是不会刷屏）：`int main(){...}` 不写 `return`（clang 对 main
 * 是特例）、以 `throw` 结尾的函数、`vector` / `new[]` 的下标越界、`&a[4]`（one-past-end 取址）、
 * 全局数组、循环里赋值后使用 —— 全部安静。已知抓不到的：有符号溢出（要 UBSan）、
 * 空指针解引用、容器越界。
 */
const UB_WARN_ARGS = [
  '-Wreturn-type',
  '-Wuninitialized',
  '-Warray-bounds',
  '-Wreturn-stack-address',
]

/**
 * clang 的 cc1 命令行。
 * @param {string | null} pchPath 非空时把 PCH 当作 TU 的前缀加载（阶段 4）；
 *   -include-pch 必须出现在输入文件之前，所以插在 -x 之前
 * @param {string} optimization 优化级别，只有对拍那一遍会传 OPT_CROSS
 */
function clangArgs(pchPath, optimization = OPT_MAIN) {
  return [
    '-cc1',
    '-emit-obj',
    '-disable-free',
    // 优化级别是**唯一**可变的一处：对拍那一遍把 OPT_MAIN 换成 OPT_CROSS，其余参数逐字相同。
    // 只有「除优化之外全部一致」，两边输出的差异才只能归因于优化本身 —— 顺手改个别的
    // flag（比如换个 -D）就会让差异变成噪声。
    ...FRONTEND_ARGS.map((arg) => (arg === OPT_MAIN ? optimization : arg)),
    // 唯一放开的警告：**编译期就能确定的除以零**（`a / 0`、`10 / 0`）。
    //
    // 为什么单独挑它（2026-10-26 用户问「别的 OJ 里 a/0 会 RE，我们这里输出了 0」）：
    // -O2 会把常量除法直接折成一个常量，wasm 里连除法指令都不剩，于是运行期输出 0、
    // 退出码 0 —— 判 AC。而 -O0 的 OJ 真发一条 `idiv`、收到 SIGFPE，判 RE。两边都不是
    // 「实现定义」之外的什么，只是 UB 的两种后果。**这里不做判定干预**（判死会把
    // 「走不到的分支里写了 10/0」这种程序也一起打死，而它在 -O0 的 OJ 上是正常的），
    // 只把这条诊断带回去，由卡片在 ACTUAL 框下面补一行「结果不可预期」。
    '-Wdivision-by-zero',
    ...UB_WARN_ARGS,
    // 新常量解释器（`clang/lib/AST/Interp` 的字节码求值器）：替换旧的 ExprConstant 递归树遍历，
    // 只影响**编译期常量求值**这一段，不改代码生成（2026-11-12 实测后加的）。
    //
    // 为什么值得加：本站最贵的用户代码是「几十 MB 的零初始化全局结构体数组」
    // （`Node tr[N << 3]`，N=3e5 → 240 万个元素 / 96MB）。这类声明的前端开销全在初始化器的
    // 逐元素求值上，实测同一份线段树代码 -O2 3306ms → 2197ms（−33%，front end 1.83s → 0.53s），
    // 裸 `struct N5 tr[2400008];` 2975ms → 1333ms（−55%）。后端（写 96MB 的 .o）一点没动。
    //
    // 顺带修掉一个真 bug：旧解释器遇到 `constexpr` 递归 ≥300 层会直接把 clang.wasm 打崩
    // （exit=134，trap `RangeError: Maximum call stack size exceeded`，200 层还正常），
    // 而 runCpp 走到「没有 .o 且 stderr 为空」的分支，界面只会显示「编译未通过」、一个字的原因都没有。
    // 换成新解释器后 300 / 400 层都正常编过，600 层给出干净的 CE。
    //
    // 为什么落在这里、**不**进 FRONTEND_ARGS：那一份是 PCH 的编译参数，会顺着 PCH_ARGS_HASH
    // 进 PCH_ASSET_ID（见下方注释），改它等于让线上那份 8.3MiB 预编译 PCH 直接 404、退回本机
    // 生成（就是老机器会 OOM 的那条路）。而 `-emit-pch` 只解析头文件、不跑用户代码的常量求值，
    // 加进去一秒也省不下来。兼容性实测过：用**不带**本 flag 编出来的 PCH 配本 flag 编译，
    // exit 0、34–41ms（与不带时逐毫秒一致）—— clang 不校验这个开关，PCH 照常命中，不会被判废。
    //
    // ⚠️ 这是 experimental 开关，换 LLVM 版本必须复验。对拍记录（旧 vs 新，11 例）：尾后指针
    // 取址 / 解引用、越界、union 活跃成员、无限递归、超长循环、嵌套聚合初始化、结构化绑定、
    // constexpr 里用 vector、`new` 不 `delete`、引用成员 —— 10 例 exit 与首条诊断逐字相同，
    // 唯一差异就是上面那条崩溃（新解释器更安全）。
    '-fexperimental-new-constant-interpreter',
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

/**
 * PCH 编译参数的指纹，进存档 id 与资源名（2026-11-03 加）。
 *
 * 这组参数会被 clang 逐项写进 PCH 控制块（语言 / 目标选项、包含路径、预定义宏），
 * 加载时对不上就 fatal。以前靠「改 FRONTEND_ARGS 记得 +1 PCH_CACHE_VERSION」，
 * 而那一步**会漏**：漏了的症状是 clang 拒载 → 降级重试把失败吃掉 → 表现为
 * 「参数明明改了，PCH 却一直是旧行为」，没有报错。直接哈希参数，就没有可漏的地方了。
 *
 * `hashString` 是函数声明（会提升），所以这里放在 PCH_ARGS 后面也能用。
 */
const PCH_ARGS_HASH = hashString(PCH_ARGS.join('\0'))

const LINKER_ARGS = [
  // runno 传进来的 argv[0] 是 wasm-ld，但还是显式写 flavor：新 wasm-ld 的两段式
  // 与旧 lld 不同，少这条会按 argv[0] 猜。
  '-flavor',
  'wasm',
  '--export-dynamic',
  '-L/sys/lib/wasm32-wasip1',
  '-L/sys/lib/wasm32-wasip1/eh',
  // 名字不是 crt1.o；少了它 _start 未定义
  '/sys/lib/wasm32-wasip1/crt1-command.o',
  OBJECT_PATH,
  // 自定义 sbrk + 导出 __oj_sbrk_get()：让宿主能读到 memory.grow 失败次数（判定规范 §5.2）。
  // 它必须排在 -lc **之前**，而且得是普通 .o（不是归档）：先定义 sbrk 的符号，
  // libc.a 里的 sbrk.o 就不会被拉进来 —— wasm-ld 不支持 --wrap，这是唯一可行的替换方式。
  OOM_OBJECT_PATH,
  // musl 的 stdio 把 long double 的格式化 / 扫描编成了 abort，真实现装在
  // libc-printscan-long-double.a 里；它必须排在 `-lc` 之前才不会被 stub 抢走。
  // （libc++ 20 已经修好 `cout << long double`，这条现在主要保 printf/scanf 的 %Lf。）
  '-lc-printscan-long-double',
  '-lc',
  '-lc++',
  '-lc++abi',
  // 开异常后 libc++abi 依赖 unwinder；必须排在 ++abi 之后
  '-lunwind',
  // 名字少了 -wasm32，别再写回 libclang_rt.builtins-wasm32.a
  '/sys/lib/clang/23/lib/wasm32-unknown-wasip1/libclang_rt.builtins.a',
  // 显式导出（--export-dynamic 也会带上它，但这条保证「宿主补丁找不到就退回旧判据」不会
  // 因为链接口默认值变化而悄悄发生）
  '--export=__oj_sbrk_get',
  '-o',
  BINARY_PATH,
]

// 栈大小公式的版本号。栈尺寸由内存上限推导（stackSizeBytes），并直接烙进链接产物，
// 所以编译缓存键必须带上它：改公式而不改版本，就会复用按旧栈编出来的二进制。
const STACK_POLICY_VERSION = 1
const PAGE_BYTES = 64 * 1024
const MIB = 1024 * 1024

/**
 * 栈大小（字节），判定规范 §5.3：
 *
 *   stack = min(64 MiB, max(8 MiB, memoryLimitBytes / 4), memoryLimitBytes / 2)
 *
 * 向下取整到 64 KiB 页。WASM 的栈在线性内存内部、也计入 `--max-memory`，所以不能
 * 把 CF 的 256 MiB 直接抄过来：上限 256 MiB 时给 64 MiB 栈，堆还剩约 192 MiB。
 * 没给上限（0）时退回 Linux 的默认 8 MiB —— 此时没有 --max-memory，栈再大也只是
 * 挤占堆的起始地址。
 */
function stackSizeBytes(memoryLimitBytes) {
  if (!(memoryLimitBytes > 0)) return 8 * MIB
  const cap = Math.min(64 * MIB, Math.max(8 * MIB, memoryLimitBytes / 4), memoryLimitBytes / 2)
  return Math.max(PAGE_BYTES, Math.floor(cap / PAGE_BYTES) * PAGE_BYTES)
}

/**
 * 链接参数：栈按内存上限推导（§5.3），再把线性内存封顶（--max-memory）。
 *
 * 一处改动同时做到两件事：保护宿主（以前一个吃 1.9GB 的程序能真吃掉浏览器 1.9GB，
 * 天花板是 wasm-ld 默认的 ~2GB）+ 给 MLE 一个确定的天花板。
 * MLE 的第一证据不是这里的极限值，而是探针记下的 memory.grow 失败次数（见 OOM_PROBE_SOURCE）。
 * @param {number} memoryLimitBytes 界面的内存上限；不给就不加旗标，行为退回从前
 */
function linkerArgs(memoryLimitBytes) {
  const args = [...LINKER_ARGS, '-z', `stack-size=${stackSizeBytes(memoryLimitBytes)}`]
  if (!memoryLimitBytes || memoryLimitBytes <= 0) return args
  // wasm 线性内存按 64KiB 页对齐，上限必须是页大小的整数倍。
  // 必须写成单 token `--max-memory=<值>`：lld 系不接受空格分隔（verify 抓过：拆成两个
  // 参数直接 wasm-ld: error: unknown argument: --max-memory）
  const pages = Math.ceil(memoryLimitBytes / PAGE_BYTES)
  return [...args, `--max-memory=${pages * PAGE_BYTES}`]
}

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
#include <random>
#include <chrono>
#include <bit>
#include <type_traits>

// 站内内核是 clang + libc++，CF 题解里常见的两个 GNU 名字（__lg / __gcd）
// 属于 libstdc++ 的私有实现，这里按同样语义补一份。实现走 __builtin，
// 编译后与 GCC 版本同档（一条 clz / 一个欧几里得循环，全部内联）。
template <class T>
  requires std::is_integral_v<T> && (!std::is_same_v<T, bool>)
constexpr T __lg(T __n)
{
  using U = std::make_unsigned_t<T>;
  U __u = static_cast<U>(__n);
  if constexpr (sizeof(U) <= sizeof(unsigned int))
    {
      U __w = __u == 0 ? U(0) : U(32u - __builtin_clz(static_cast<unsigned int>(__u)));
      return static_cast<T>(static_cast<U>(__w - U(1)));
    }
  else if constexpr (sizeof(U) <= sizeof(unsigned long long))
    {
      U __w = __u == 0 ? U(0) : U(64u - __builtin_clzll(static_cast<unsigned long long>(__u)));
      return static_cast<T>(static_cast<U>(__w - U(1)));
    }
  else
    {
      unsigned __int128 __v = static_cast<unsigned __int128>(__u);
      unsigned long long __hi = static_cast<unsigned long long>(__v >> 64);
      unsigned long long __lo = static_cast<unsigned long long>(__v);
      U __w = __hi != 0 ? U(128u - __builtin_clzll(__hi))
              : __lo != 0 ? U(64u - __builtin_clzll(__lo))
              : U(0);
      return static_cast<T>(static_cast<U>(__w - U(1)));
    }
}

template <class T>
constexpr T __gcd(T __m, T __n)
{
  while (__n != 0)
    {
      T __t = __m % __n;
      __m = __n;
      __n = __t;
    }
  return __m;
}

namespace std
{
using ::__lg;
using ::__gcd;
}
#endif
`

/**
 * 预编译头的源码 —— **就是上面那份完整的 bits/stdc++.h**，连 include guard 也一样。
 *
 * 早先这里是「微型版」：只放 iostream / vector / string / algorithm / map 五个头，
 * 担心 30 个头生成的 .pch 太大（怕老机器扛不住序列化）。实测这个担心不成立
 * （2026-10-19，站内同一份 clang 8 + sysroot，85 行线段树题解）：
 *
 *   5 个头  → .pch 6.9MB，`-fsyntax-only` 104–127ms
 *   30 个头 → .pch 8.6MB，`-fsyntax-only` 42–44ms
 *
 * 只多 1.7MB，却把每次检查砍掉约 60ms：剩下的 25 个头（尤其是 <sstream> / <deque> /
 * <unordered_map>）解析起来比前 5 个还贵。所以 PCH 覆盖整份万能头，用户代码里那句
 * `#include <bits/stdc++.h>` 命中同名 guard 直接整段跳过 —— 这才是「解析开销」的正解。
 *
 * guard 必须与 UNIVERSAL_HEADER 一字不差：两者不同名时（早先的 MICRO_）用户那句 include
 * 仍会被重新展开一遍（虽然只是 30 行 #include，每行都被各自头文件的 guard 挡掉，
 * 实测多花 5ms 左右）。同守卫版本实测 42–44ms，是三者里最快的。
 */
const PCH_SOURCE_TEXT = UNIVERSAL_HEADER

/**
 * 内存证据探针（判定规范 §5.2）。
 *
 * 要解决的问题：worker 把**任何** WebAssembly.RuntimeError 都折成退出码 134、且不保留
 * trap 原因，于是「分配真的顶到 --max-memory」和空指针写入 / 运行期除零 / abort()
 * 在宿主看来长得一模一样。这里在链接期塞一个普通 .o，用它自己的 sbrk 顶掉 libc.a 里
 * 那份（先定义符号，归档成员就不会被拉进来），每次 `memory.grow` 失败就记一笔；
 * 宿主补丁（scripts/patch-wasi-clock.mjs）在 trap/resume 之后调 `__oj_sbrk_get()`
 * 把计数带回来 —— 它大于 0 才是 MLE。
 *
 * 语义必须与 wasi-libc 保持一致（探针反汇编核对过 sbrk.o）：
 *   - 增量不是 64 KiB 页的整数倍、或为负 → abort；
 *   - 成功返回**旧**页号 << 16（旧 brk），失败返回 (void*)-1。
 * 唯一差异是不写 errno：clang 8 的 wasm 后端在这套 sysroot 上给 TLS 变量 errno 选不出
 * 指令（Cannot select: i32 = GlobalTLSAddress<i32* @errno>），而 dlmalloc 只认
 * MORECORE 的 -1 返回值、并不读 errno，所以这一条不影响分配语义。
 *
 * 探针只编一次（几毫秒级），产物常驻内存；用户程序看到的仍然是完整 libc。
 */
const OOM_PROBE_SOURCE = `#include <stddef.h>
extern "C" void abort(void);
static int __oj_sbrk_failures = 0;
extern "C" int __oj_sbrk_get(void) { return __oj_sbrk_failures; }
extern "C" void* sbrk(long inc) {
  if (inc < 0 || (inc & 65535) != 0) abort();
  size_t pages = (size_t)inc >> 16;
  size_t got = __builtin_wasm_memory_grow(0, pages);
  if (got == (size_t)-1) {
    __oj_sbrk_failures += 1;
    return (void*)-1;
  }
  return (void*)(got << 16);
}
`

/** 探针的 cc1 参数：与用户代码同一套语言 / 目标选项，但不加载 PCH（它用不到 STL） */
const OOM_PROBE_ARGS = [
  '-cc1',
  '-emit-obj',
  '-disable-free',
  ...FRONTEND_ARGS,
  '-o',
  OOM_OBJECT_PATH,
  '-x',
  'c++',
  OOM_PROBE_PATH,
]

/** 浏览器原生 gzip 解压，省掉 pako 依赖 */
async function gunzip(bytes) {
  if (typeof DecompressionStream !== 'function') {
    throw new Error(t('error.noDecompressionStream'))
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
 * 解 sysroot。
 *
 * 23.1.0 的包是 `.tar.br`：浏览器按响应的 `Content-Encoding: br` 透明解压，fetch 拿到的
 * 应该已经是裸 tar。这里做一次防御 —— ustar 头在 offset 257，不是 tar 就说明响应头丢了
 * （浏览器拿到的是 brotli 字节），报一句能定位的错；否则 untar 会静默返回空文件系统，
 * 症状是「所有头文件都找不到」，很难往响应头想。
 *
 * 旧 8.0.1 的 `.tar.gz` 分支保留：双档并存期间它仍是回退档，且静态服务器看到 `.gz`
 * 扩展名会补 `Content-Encoding: gzip`，fetch 回来也已经是裸 tar（所以先看魔数再 gunzip）。
 */
async function unpackSysroot(bytes) {
  const gzipped = bytes[0] === 0x1f && bytes[1] === 0x8b
  const tar = gzipped ? await gunzip(bytes) : bytes
  if (tar.length < 512 || readField(tar, 257, 5) !== 'ustar') {
    throw new Error(t('error.sysrootNotTar'))
  }
  return untar(tar)
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
 * C++ 工具链 = 一颗常驻的 `WasiWorkerHost`（阶段 4，2026-10-25）。
 *
 * 它第一次 init 时在 worker 里把 sysroot 解成 MemoryFs、把 clang / wasm-ld 编成
 * `WebAssembly.Module`，之后 compile / link / run / syntax 都复用这一份。阶段 2 那
 * 13–17 s 的根因（每次 run 重新实例化 73 MB + clone 1385 条 sysroot）就消在这里。
 *
 * Python 仍走 runno 的 `WASIWorkerHost`（`pythonRuntime`），两边互不影响。
 */
let toolchain = null
let toolchainPromise = null

/**
 * 「某个语言的运行时首次进内存」的监听器。
 *
 * 唯一的用途是编辑器内的语法诊断（monaco/syntaxDiagnostics）：诊断只认
 * 「改内容 / 切文件」这两个时机，而运行时可能在文件**已经打开之后**才被第一次
 * 运行拉进内存 —— 不发通知的话，加载完成那一刻屏幕上不会补出红线，
 * 要等下一次击键才有。卸载再重装会再次触发（promise 被清掉后重新加载）。
 */
const runtimeReadyListeners = new Set()

/**
 * @param {(language: 'cpp' | 'python') => void} listener
 * @returns {() => void} 退订函数
 */
export function onRuntimeReady(listener) {
  runtimeReadyListeners.add(listener)
  return () => runtimeReadyListeners.delete(listener)
}

/** @param {'cpp' | 'python'} language */
function notifyRuntimeReady(language) {
  for (const listener of runtimeReadyListeners) {
    try {
      listener(language)
    } catch {
      /* 一个监听器坏了不能连坐其他的 */
    }
  }
}

/**
 * 把编译器二进制的字节读进 HTTP 缓存，但**不**转成 blob: URL。
 *
 * 为什么不能转 blob：runno 内部是 WebAssembly.instantiateStreaming(fetch(url))，
 * 只有传同源 HTTP 地址、响应又是 application/wasm，浏览器才可能把已编译的模块
 * 放进代码缓存；blob: URL 不参与 HTTP 缓存，每次都是全量重编译。
 *
 * 为什么要先读一遍：不读的话，73MB 的下载会发生在 runno 的 worker 里，
 * 也就是挤进 compile 阶段那 60 秒的看门狗预算（慢网首次编译必然误判超时）；
 * 读一遍把下载留在本阶段的 3 分钟预算里。必须整份读完，否则响应不会入缓存。
 */
async function warmCache(url, label) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(t('error.downloadFailed', { label, status: response.status }))
  await response.arrayBuffer()
}

/**
 * 造一颗宿主。参数对主运行与对拍完全一样，差别只在 `oomProbe`：
 * 探针 .o 是 init 里顺手编的（省得首次编译多付 ~300ms），而第二颗宿主能走到时
 * 主宿主早编好了，它再编一遍纯属白花（见 loadCrossToolchain）。
 */
function createToolHost({ oomProbe = true } = {}) {
  return new WasiWorkerHost({
    clangURL: CLANG_URL,
    linkerURL: LINKER_URL,
    sysrootURL: SYSROOT_URL,
    assetSizes: TOOLCHAIN_ASSET_BYTES,
    // Worker 里没有 localStorage：把安装痕迹传进去，preflight 才能把 EVICTED 与
    // NOT_INSTALLED 分开（见 toolchainStore.inspectToolchain / LAST_INSTALLED_KEY）
    lastInstalledAt: readLastInstalledAt(),
    onAssetProgress: forwardAssetProgress,
    universalHeaderPath: UNIVERSAL_HEADER_PATH,
    universalHeader: UNIVERSAL_HEADER,
    pchSource: PCH_SOURCE_TEXT,
    oomProbe: oomProbe
      ? {
          args: OOM_PROBE_ARGS,
          source: OOM_PROBE_SOURCE,
          sourcePath: OOM_PROBE_PATH,
          outputPath: OOM_OBJECT_PATH,
        }
      : null,
  })
}

/**
 * 主宿主的生命周期订阅（见 wasi/client.js 的 onEvent）。
 *
 * 只转发**主**宿主：对拍那颗是另一条独立生命线，它的死不该让编辑器重新武装诊断。
 * 带 DISPOSED 的终止（用户卸载）不转发 —— 卸载之后再探缓存只是白忙；TLE / 看门狗 /
 * 抢占 / 崩溃才值得通知，语法侧据此把「每会话只试一次」的闸门放开。
 *
 * @type {Set<(event: { type: 'terminated' | 'idle', reason?: string | null, message?: string }) => void>}
 */
const hostEventListeners = new Set()

export function onHostEvent(listener) {
  hostEventListeners.add(listener)
  return () => hostEventListeners.delete(listener)
}

function forwardHostEvent(event) {
  if (event.type === 'terminated' && event.reason === KILL_REASON.DISPOSED) return
  for (const listener of hostEventListeners) {
    try {
      listener(event)
    } catch {
      /* 一个订阅者坏了不连坐 */
    }
  }
}

/**
 * 「准备阶段」的硬上限（2026-11-22 加）。
 *
 * 为什么必须有：`host.preload()` 里那张 5 分钟表只覆盖「init 消息已经派发出去」之后，
 * 而断网 / 弱网时 fetch 可以长时间不返回；这段时间里宿主的把手还没交到上层
 * （`onHost` 要等 loadToolchain 成功之后才回调），wasmRuntime 的 boot 看门狗与用户取消
 * 全都只能空转 —— 表现就是「一直显示运行中、只能退出重启」。
 * 超时按「准备环境失败」让本次任务收尾，并 dispose 掉半初始化的宿主；下一次运行会重新
 * 走 loadToolchain（失败时 toolchainPromise 已经被清掉）。
 */
const PREPARE_TIMEOUT_MS = 3 * 60 * 1000

/**
 * 给准备期的 promise 套上限。超时文案复用 `error.prepareTimeout`，错误由调用方的
 * catch 接住并 dispose 宿主（terminate 会顺手掐断 worker 里在飞的 fetch）。
 * `Promise.race` 会给落败的那条挂上处理器，超时之后它再 reject 也不会变成未处理异常。
 */
async function withPrepareTimeout(promise, timeoutMs) {
  let timer = 0
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(t('error.prepareTimeout', { seconds: Math.round(timeoutMs / 1000) })))
    }, timeoutMs)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 在途的工具链下载（单飞）。
 *
 * 为什么必须单飞：下载的每一步都在写同一个桶、最后写 manifest；两个并发下载会变成
 * 同键双写（存储锁冲突、双倍内存），而「首访 + 用户又点了一次下载」恰好很容易撞上。
 * 失败时清空，下一次点击可以重试；超时也不会掐断它 —— 下载继续在后台跑完，
 * 下一次点击要么等到它、要么直接命中已提交的 manifest。
 */
let toolchainDownloadPromise = null

function ensureToolchainDownloaded(onStatus = () => {}, onProgress) {
  if (!toolchainDownloadPromise) {
    toolchainDownloadPromise = downloadToolchain({
      onProgress: (progress) => {
        // 下载阶段的进度用压缩态字节（wire 上的真实大小）；解压阶段由 worker 用
        // manifest 里的 uncompressedSize 另行播报。两条事件的 `phase` 不同，订阅者
        // 各自选分母，别把 38MB 和 137MB 混在一起算百分比。
        forwardAssetProgress({
          key: 'download',
          loaded: progress.loaded,
          total: progress.total,
          phase: 'download',
        })
        onProgress?.(progress)
        const percent = Math.min(99, Math.round((progress.loaded / progress.total) * 100))
        onStatus('download', t('stage.toolchainDownload', { percent }))
      },
    }).finally(() => {
      toolchainDownloadPromise = null
    })
  }
  return toolchainDownloadPromise
}

/**
 * 「三件套已经在本机」的判据：新格式 manifest 优先，旧 `.br` 回退。
 *
 * 旧格式回退是给老用户的：他们已经有一份完整的解压态 / 旧 SW 重压过的资产，
 * 断网时照样能跑，不该因为新格式的 manifest 不存在就被判成「没下载」。
 */
async function isToolchainCached() {
  if (await probeToolchain()) return true
  return hasLegacyToolchain()
}

/**
 * 下载失败之后，把「本机当前状态」翻译成结构化错误码。
 *
 * 为什么不能直接抛 fetch 的 `TypeError: Failed to fetch`：断网时这句话既没说是哪一件、
 * 也没告诉用户该做什么。这里复用 preflight 的同一份判定（manifest / 缺件 / 安装痕迹），
 * 给出 NOT_INSTALLED / EVICTED / PARTIAL 三档与人话；三档的恢复动作都一样（联网重下），
 * UI 不需要为它们各写一套按钮。
 *
 * `status === 'ready'` 时原样返回：下载失败发生在「本机其实完整」的情况下（典型是
 * 用户点了下载、但本次网络抖动），那是普通网络错误，不该被误报成工具链缺失。
 */
async function explainToolchainFailure(cause) {
  let inspection
  try {
    inspection = await inspectToolchain()
  } catch {
    return cause
  }
  if (inspection.status === 'partial') {
    const missing = inspection.missing.map((key) => TOOLCHAIN_ASSET_LABELS[key] ?? key)
    return createToolchainError(
      TOOLCHAIN_ERROR.PARTIAL,
      t('error.toolchainPartial', { missing: missing.join(', ') }),
      { status: inspection.status, missing, cause: String(cause?.message ?? cause) },
    )
  }
  if (inspection.status === 'evicted') {
    return createToolchainError(TOOLCHAIN_ERROR.EVICTED, t('error.toolchainEvicted'), {
      status: inspection.status,
      missing: inspection.missing.map((key) => TOOLCHAIN_ASSET_LABELS[key] ?? key),
      cause: String(cause?.message ?? cause),
    })
  }
  if (inspection.status === 'not-installed') {
    return createToolchainError(TOOLCHAIN_ERROR.NOT_INSTALLED, t('error.toolchainNotInstalled'), {
      status: inspection.status,
      cause: String(cause?.message ?? cause),
    })
  }
  return cause
}

/**
 * 把三件套下载并写进 Cache Storage（含写后逐字节复验与 manifest 提交）。
 *
 * 给设置页的下载按钮 / 后台预取用：**不建宿主、不 untar**。运行路径由 loadToolchain
 * 在 init 之前调同一份逻辑，保证「下载」和「首次运行」看到的是同一条经过校验的资产。
 *
 * @param {{ onStatus?: (stage: string, message: string) => void, onProgress?: Function }} [options]
 */
export async function downloadToolchainAssets({ onStatus, onProgress } = {}) {
  try {
    await ensureToolchainDownloaded(onStatus, onProgress)
  } catch (error) {
    throw await explainToolchainFailure(error)
  }
}

/**
 * 轻量缓存探针（不触网、不读 body）。给 wasmRuntime.probeRuntime / 语义悬停唤醒用。
 * @param {string[]} [keys] 默认三件套
 */
export async function probeCachedToolchain(keys = TOOLCHAIN_ASSET_KEYS) {
  if (await probeToolchain(keys)) return true
  return hasLegacyToolchain(keys)
}

function loadToolchain(onStatus, { timeoutMs = PREPARE_TIMEOUT_MS } = {}) {
  if (toolchain?.host?.alive) return Promise.resolve(toolchain)
  if (toolchain && !toolchain.host?.alive) {
    toolchain = null
    toolchainPromise = null
  }
  if (!toolchainPromise) {
    toolchainPromise = (async () => {
      // 先判浏览器能力，再谈下载。缺 wasm 异常的引擎能编能链，只在**跑产物**那一步
      // 实例化失败，报的是引擎内部措辞 —— 用户会以为是自己代码写错了。这里提前拦住，
      // 说清差哪一项（探测口径见 services/wasmFeatures.js）。
      const features = detectWasmFeatures()
      if (!features.ok) {
        throw new Error(t('error.wasmUnsupported', { missing: features.missing.join(', ') }))
      }
      onStatus('download', t('stage.toolchain'))
      const host = createToolHost()
      // 转发宿主生命周期：语法诊断把一次性闸门挂在它上面（见 onHostEvent）。
      // 监听器随宿主对象一起消失，重建时会重新挂上。
      host.onEvent(forwardHostEvent)
      try {
        // 下载在 init 之前、由页面直接写桶（不再依赖 SW 拦截）：这样首访、SW 未接管、
        // 或 SW 正在更新时，下载都不会落空。下载 + init 一起受准备阶段上限约束。
        const preloaded = await withPrepareTimeout(
          (async () => {
            if (!(await isToolchainCached())) {
              try {
                await ensureToolchainDownloaded(onStatus)
              } catch (error) {
                throw await explainToolchainFailure(error)
              }
            }
            return host.preload()
          })(),
          timeoutMs,
        )
        if (preloaded?.oomProbe) oomProbeObject = preloaded.oomProbe
      } catch (error) {
        host.dispose()
        throw error
      }
      toolchain = { host }
      notifyRuntimeReady('cpp')
      void pruneLegacyToolchainCache()
      return toolchain
    })()
    // 失败时把缓存的 promise 清掉，下次点「下载」能重试
    toolchainPromise.catch(() => {
      toolchainPromise = null
    })
  }
  return toolchainPromise
}

/**
 * 对拍专用的**第二颗**宿主（2026-11-01）。
 *
 * 为什么要有它：对拍和用户运行共用一颗宿主时，两条线只能靠「掐断对方」让路 —— wasm 里
 * 没有中断点，掐断就是 terminate 整颗 worker，下一次运行要先重建（实测 405ms，还要重新
 * 取三件资产）。开了第二颗之后两边各占一条 worker 线程：用户点运行既不排队也不掐断对拍，
 * 对拍也不再是「用户运行前面的一堵墙」。
 *
 * 代价是**内存翻倍**：第二颗 worker 自带一份 clang / wasm-ld 的 Module 和 sysroot
 * （复测数字见 HANDOFF §18.2）。所以它**懒建** —— 只有真的跑出结论、要开始对拍了才建，
 * 从不为了对拍提前拉起那 23MB；收工后闲置 2 分钟自动回收（见 scheduleCrossIdleDispose），
 * 卸载运行时也跟着 `unloadRuntime` 一起收掉。
 *
 * 与主宿主的关系只有一条：编译产物（.o / .wasm 的字节）在应用层缓存里，与谁编的无关，
 * 所以两边共用 `compileCaches` 不会串味 —— 各自只写自己那个优化级别的槽位。
 */
let crossToolchain = null
let crossToolchainPromise = null

/**
 * 第二颗宿主的闲置回收（2026-11-01，用户定的 2 分钟）。
 *
 * 它懒建，但建起来就一直常驻 ~22MiB（其中 14MB 是另一份 clang 的 Module，数字见
 * HANDOFF §18.2）。对拍是个「想起来才跑一次」的功能：一整天只对拍过一两次的会话，
 * 这 22MiB 等于白占一下午。所以每趟对拍收工就挂一个 2 分钟倒计时，期间再来对拍
 * 就取消，真闲置到点整颗 terminate。
 *
 * 代价是重建：实测 839–1107ms（含一次 -O0 编译与运行）。这些全在后台发生（对拍本身
 * 是 silent 的，不刷状态栏），用户感知只有「那一次的提示晚到 1s 左右」，比常驻 22MiB 划算。
 */
const CROSS_IDLE_DISPOSE_MS = 2 * 60 * 1000
/** @type {ReturnType<typeof setTimeout> | null} */
let crossIdleTimer = null

function cancelCrossIdleDispose() {
  if (crossIdleTimer === null) return
  clearTimeout(crossIdleTimer)
  crossIdleTimer = null
}

/** 对拍收工后上弦：从现在起闲置 2 分钟就回收 */
function scheduleCrossIdleDispose() {
  cancelCrossIdleDispose()
  crossIdleTimer = setTimeout(() => {
    crossIdleTimer = null
    disposeCrossToolchain()
  }, CROSS_IDLE_DISPOSE_MS)
}

function disposeCrossToolchain() {
  cancelCrossIdleDispose()
  const host = crossToolchain?.host
  // 没有宿主：要么从没建过，要么正建到一半（promise 未决时 crossToolchain 还是 null）。
  // 后者不能连 promise 一起清 —— 那一趟迟早会收工，收工时自己会重新上弦。
  if (!host) return
  // 正被占着（对拍还在跑）：terminate 只会把这一趟变成一次白跑，推到下次收工再说
  if (host.busy) {
    scheduleCrossIdleDispose()
    return
  }
  crossToolchain = null
  crossToolchainPromise = null
  host.dispose()
}

function loadCrossToolchain(onStatus) {
  // 有人要用宿主了：先停掉闲置倒计时，免得建到一半被回收
  cancelCrossIdleDispose()
  if (crossToolchain?.host?.alive) return Promise.resolve(crossToolchain)
  if (crossToolchain && !crossToolchain.host?.alive) {
    crossToolchain = null
    crossToolchainPromise = null
  }
  if (!crossToolchainPromise) {
    crossToolchainPromise = (async () => {
      onStatus('download', t('stage.toolchain'))
      // 探针不重编：能走到这里说明主宿主已经编过一份，那包字节链接时直接当 extraFiles 用
      const host = createToolHost({ oomProbe: false })
      try {
        const preloaded = await host.preload()
        if (!oomProbeObject && preloaded?.oomProbe) oomProbeObject = preloaded.oomProbe
      } catch (error) {
        host.dispose()
        throw error
      }
      crossToolchain = { host }
      return crossToolchain
    })()
    crossToolchainPromise.catch(() => {
      crossToolchainPromise = null
    })
  }
  return crossToolchainPromise
}

/** 只把工具链拉到本地（不发编译任务），用于「本地运行环境」面板的下载按钮。 */
export async function preloadToolchain(onStatus = () => {}) {
  const startedAt = performance.now()
  // 设置页 / 预下载是用户明确在等的那一次：沿用宿主 init 那张 5 分钟表，让慢网下完；
  // 运行路径的 3 分钟上限只约束「点 ▶ 之后卡住」的那种场景。
  await loadToolchain(onStatus, { timeoutMs: 5 * 60 * 1000 })
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
 * stdin 槽位的容量：runno 那边是 `new SharedArrayBuffer(8 * 1024)`，前 4 字节存长度，
 * 所以真正能装下的载荷只有 8188 字节。
 *
 * 为什么必须分块：`host.pushStdin` 是一次性把整串编码后塞进去的，超过 8188 字节
 * 会在 `Uint8Array.set` 上抛 RangeError。而它是被 `void` 掉的，异常变成一条
 * unhandled rejection —— 界面上什么都不显示，程序却立刻读到 EOF，算出一个
 * 错误的答案并以退出码 0 结束。也就是说：输入一大，用户拿到的是**静默错答**，
 * 而不是报错。（实测 8188 字节正常，8189 字节起复现。）
 *
 * 为什么分块是安全的：worker 侧的读取是滑动窗口 —— 它按程序这次请求的长度取走一段、
 * 把剩余部分写回槽位并更新长度，所以宿主可以「等槽位被抽干 → 再补一块」地循环推进。
 * 两侧语义正好对上，不需要改动 runno。
 *
 * @param {() => boolean} isDone 本次运行是否已经结束。程序提前退出、不再读 stdin 时
 *   必须靠它跳出循环，否则剩下的块会一直等一个永远不来的消费者。
 */
const STDIN_CHUNK_BYTES = 8 * 1024 - 4

async function pushStdinInChunks(host, text, isDone) {
  const bytes = new TextEncoder().encode(text)
  if (bytes.length === 0) {
    // 空输入也推一次：保持原有行为（把槽位置 0 并通知），免得依赖「什么都不做」的等价性
    await host.pushStdin('')
    return
  }
  const decoder = new TextDecoder()
  for (let at = 0; at < bytes.length; ) {
    if (isDone()) return
    let end = Math.min(at + STDIN_CHUNK_BYTES, bytes.length)
    // UTF-8 续字节以 10 开头：退到本字符的首字节，别把一个多字节字符切成两半
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end -= 1
    await host.pushStdin(decoder.decode(bytes.subarray(at, end)))
    at = end
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
  let done = false
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
    //
    // EOF 必须**接在最后一块之后**，不能与推块并行：两者都是在空转等同一个「槽位被抽干」
    // 信号，谁先轮询到谁先写。EOF 先写进去的话，程序在 8188 字节处就读到了文件末尾，
    // 剩下的块全被丢掉 —— 而且不报错。（踩过：并行调用的写法实测每次都只进 8188 字节。）
    void pushStdinInChunks(host, stdin ?? '', () => done).then(() => host.pushEOF())
    const result = await host.start()
    return {
      exitCode: result.exitCode,
      fs: result.fs ?? {},
      stdout,
      stderr,
      // 以下四项来自宿主补丁（scripts/patch-wasi-clock.mjs）。补丁不在时全是 undefined，
      // 上层据此退回旧判据 —— 不能把「拿不到证据」当成「没有失败」。
      trap: result.trap ?? '',
      runMs: typeof result.runMs === 'number' ? result.runMs : null,
      memoryBytes: typeof result.memoryBytes === 'number' ? result.memoryBytes : null,
      sbrkFailures: typeof result.sbrkFailures === 'number' ? result.sbrkFailures : null,
    }
  } catch (error) {
    // 被 kill()（超时 / 取消）时 start() 会抛，而此刻已经收到的输出只活在这两个闭包变量里，
    // 挂到错误上带出去：TLE 的卡片靠它显示程序跑到哪一步。
    if (error && typeof error === 'object') {
      error.partialStdout = stdout
      error.partialStderr = stderr
    }
    throw error
  } finally {
    // 先立旗再解锁：分块循环可能正卡在 pushStdin 的空转里，写回槽位把它放出来后，
    // 它会看到 done 并就此收手，不会再补下一块
    done = true
    releaseStdinWaiter(host)
    onHost(null)
  }
}

/**
 * 编译产物缓存 —— 按优化级别各留**一个**槽位：主编译（-O2）与对拍（-O0）。
 *
 * 为什么要它：一次「全部运行」会把同一份代码喂给每个用例，而每个用例都会重新走
 * clang + wasm-ld。缓存命中时连工具链都不用碰，第 2..N 个用例只付运行开销。
 * 为什么只有两个槽位：用例总是成批跑的，而代码一改缓存必然失效，多留几个槽位没有收益；
 * 对拍是同一份代码的第二轮编译，它的产物同样只对「这份代码 + 这个上限」有效，
 * 分开存才不会把主编译那份挤掉（对拍跟着主流程之后发生，挤掉就等于下一轮白编一次）。
 * 为什么键里要有内存上限：上限编在 --max-memory 里、直接烙进产物，改上限必须重链接。
 * 为什么键里还要有 STACK_POLICY_VERSION：栈大小由内存上限推导（§5.3），同样烙进产物。
 * @type {Map<string, { code: string, memoryLimitBytes: number, stackPolicy: number, toolchain: string, outcome: { ok: true, binary: object, diagnostics: string } | { ok: false, exitCode: number, stdout: string, stderr: string } }>}
 */
const compileCaches = new Map()

/**
 * 某个槽位里的产物是不是还对得上这份代码 / 这套上限。
 * 优化级别不进这里：它由 Map 的键分槽，一个槽位只会被同一个级别写。
 */
function cacheFresh(entry, code, memoryLimitBytes) {
  return (
    Boolean(entry) &&
    entry.code === code &&
    entry.memoryLimitBytes === (memoryLimitBytes || 0) &&
    entry.stackPolicy === STACK_POLICY_VERSION &&
    entry.toolchain === TOOLCHAIN_VERSION
  )
}

/** 取某个优化级别下的产物；槽位里没有就现编一份落进去。编译抛异常时不落缓存（重试得重编） */
async function compileCached(code, memoryLimitBytes, onStatus, optimization, tool = null) {
  const cached = compileCaches.get(optimization)
  if (cacheFresh(cached, code, memoryLimitBytes)) return cached.outcome
  const outcome = await compileAndLink(code, memoryLimitBytes, onStatus, optimization, tool)
  compileCaches.set(optimization, {
    code,
    memoryLimitBytes: memoryLimitBytes || 0,
    stackPolicy: STACK_POLICY_VERSION,
    toolchain: TOOLCHAIN_VERSION,
    outcome,
  })
  return outcome
}

/** 探针 .o 的字节：编译一次后常驻内存，后续所有链接直接复用 */
let oomProbeObject = null

async function loadOomProbe(tool, onDispatch) {
  if (oomProbeObject) return oomProbeObject
  const compiled = await tool.host.compile(
    {
      args: OOM_PROBE_ARGS,
      source: OOM_PROBE_SOURCE,
      sourcePath: OOM_PROBE_PATH,
      outputPath: OOM_OBJECT_PATH,
    },
    { onDispatch },
  )
  if (!compiled.object) {
    throw new Error(compiled.stderr || t('error.oomProbeFailed', { code: compiled.exitCode }))
  }
  oomProbeObject = compiled.object
  return oomProbeObject
}

/**
 * clang 编译 + wasm-ld 链接，产出可执行的 wasm 二进制。
 * 结果分成「拿到二进制」和「编译/链接失败」两种，两种都可缓存（同一份代码结论必然相同）。
 *
 * @param {object|null} [toolOverride] 指定用哪颗宿主；缺省走主宿主（对拍传自己那颗，见
 *   loadCrossToolchain）。产物字节与宿主无关，所以缓存照旧共用。
 */
async function compileAndLink(code, memoryLimitBytes, onStatus, optimization = OPT_MAIN, toolOverride = null) {
  const tool = toolOverride ?? (await loadToolchain(onStatus))
  // PCH 只有 -O2 那一份（见 OPT_MAIN 处的说明）：对拍那一遍不加载它。
  // 硬塞进去的后果不是「慢一点」，而是 clang fatal + 命中下面那段 PCH 判废、把好 PCH 删掉。

  // 「编译阶段」的播报（同时是上层按阶段上弦的看门狗）跟着**消息派发**走，不跟着进入这个
  // 函数走：从进来到第一条消息真发出去之间，可能还在排队等前面那条任务（运行 / PCH 生成），
  // 那段时间算进 60 秒的编译预算里就会误判超时 —— 2026-10-27 那次误杀同一类。
  // 实测口径见 wasi/client.js 文件头：看门狗一律「派发时刻起算」。
  let compileAnnounced = false
  const announceCompile = () => {
    if (compileAnnounced) return
    compileAnnounced = true
    onStatus('compile', t('stage.compile'))
  }

  // 探针只编一次；放在 compile 阶段里做，第一次点的用户会多等几十毫秒
  const oomProbe = await loadOomProbe(tool, announceCompile)

  // 尽量贴着消息构造点再取（中间的 await 期间可能有一次语法诊断也在取 PCH）
  const pch =
    optimization === OPT_MAIN
      ? await pchPlan(tool.host)
      : { installed: false, bytes: null, confirm: null }

  let compiled = await tool.host.compile(
    {
      args: clangArgs(pch.installed ? PCH_PATH : null, optimization),
      source: code,
      sourcePath: SOURCE_PATH,
      outputPath: OBJECT_PATH,
      pch: pch.bytes,
    },
    {
      onDispatch: () => {
        announceCompile()
        pch.confirm?.()
      },
    },
  )
  if (pch.installed && !compiled.object && PCH_ERROR_RE.test(compiled.stderr)) {
    // 是 PCH 本身加载不了（clang 会在加载时校验语言选项和头文件搜索路径，对不上就 fatal），
    // 不是用户代码写错了。绝不能因为一个缓存文件让用户的代码编不过 ——
    // 判废、退回普通编译重试一次，这一次的结果才是用户看到的。
    await discardPch()
    compiled = await tool.host.compile(
      {
        args: clangArgs(null),
        source: code,
        sourcePath: SOURCE_PATH,
        outputPath: OBJECT_PATH,
        pch: null,
      },
      { onDispatch: announceCompile },
    )
  }

  if (!compiled.object) {
    return {
      ok: false,
      exitCode: compiled.exitCode,
      stdout: compiled.stdout,
      stderr: compiled.stderr || t('error.compileFailed'),
    }
  }

  // 探针不进用户那次编译（省一趟），只在链接时补进来；baseFs 是 worker 里常驻的，
  // 这里不复制整棵 sysroot。
  const linked = await tool.host.link({
    args: linkerArgs(memoryLimitBytes),
    object: compiled.object,
    objectPath: OBJECT_PATH,
    outputPath: BINARY_PATH,
    extraFiles: { [OOM_OBJECT_PATH]: oomProbe },
  })

  if (!linked.binary) {
    // 链接失败在语义上还是「这段代码编译不过」，跟原来的 clang driver 表现一致
    return {
      ok: false,
      exitCode: linked.exitCode,
      stdout: linked.stdout,
      stderr: linked.stderr || t('error.linkFailed'),
    }
  }

  return {
    ok: true,
    binary: { content: linked.binary },
    // 编译成功时 clang 的 stderr 就是警告（`-Wdivision-by-zero` 那一条，别的都关着）。
    // 以前这里直接丢掉 —— 现在带回去给卡片当提示，判定不受它影响。
    diagnostics: compiled.stderr || '',
  }
}

/**
 * 编译并运行一段 C++。
 * @param {string} code
 * @param {string} stdin
 * @param {number} memoryLimitBytes
 * @param {(status: { stage: string, message: string }) => void} onStatus
 * @param {(host: object | null) => void} onHost
 * @returns {Promise<{ stage: 'compile' | 'run', ok: boolean, exitCode: number, stdout: string, stderr: string, diagnostics: string, durationMs: number | null, runMs: number | null, memoryBytes: number | null, sbrkFailures: number | null, trap: string, cold?: boolean }>}
 * 工具链本身出问题（下载失败、浏览器不支持等）会抛异常，由上层翻译成 failure。
 *
 * durationMs 只计**运行段**，与用例时限同口径。编译刻意不算进去：它是整批用例
 * 共享的一次性开销（见上面的单槽缓存），摊到每张卡片上会让第一个用例的数字凭空
 * 高出一截，卡片之间也就没法互相比较了。程序压根没跑起来（编译失败）时给 null，
 * 由卡片显示为空 —— 那种情况下的「耗时」是编译耗时，不是这个数字要表达的东西。
 *
 * `cold`：这一遍是不是这份产物第一次执行（`wasi.worker.js` 的 Module 缓存未命中）。
 * 首遍跑在 V8 的 Liftoff 上、比稳态慢 25–40%，**这个数字本身也是 contaminated 的**
 * —— 上层（wasmRuntime）据此先不计时地跑一遍再取数，这里只如实回报事实。
 */
export async function runCpp({ code, stdin, memoryLimitBytes = 0, onStatus = () => {}, onHost = () => {} }) {
  const source = String(code ?? '')
  const tool = await loadToolchain(onStatus)
  // 看门狗拿的是常驻宿主：超时 kill() 会 terminate worker，下一次 loadToolchain 重建
  onHost(tool.host)
  // 从这里到本次运行收尾，这颗宿主归运行独占。语法诊断看到 busy 就让路，不会拿它自己的
  // 看门狗把运行正在用的 worker 杀掉（症状见 client.js 的 busy）。用户真点运行去抢
  // 正在跑的后台活，则由宿主自己的抢占负责（见 wasi/client.js 的 send）。
  // 用 hold() 而不是布尔：PCH 生成可能同时在收尾，布尔会被先到的那一方抹掉。
  const releaseHost = tool.host.hold()
  try {
    const outcome = await compileCached(source, memoryLimitBytes, onStatus, OPT_MAIN)

    if (!outcome.ok) {
      return {
        stage: 'compile',
        ok: false,
        exitCode: outcome.exitCode,
        stdout: outcome.stdout,
        stderr: outcome.stderr,
        diagnostics: '',
        durationMs: null,
      }
    }

    // run 段的播报与 TLE 看门狗同样跟着**消息派发**走（同 compileAndLink 里那段说明）：
    // 排队等前面那条任务的时间不是程序跑的，不该吃掉时限。
    let runStartedAt = performance.now()
    const ran = await tool.host.run(
      { binary: outcome.binary.content, stdin },
      {
        onDispatch: () => {
          runStartedAt = performance.now()
          onStatus('run', t('stage.run'))
        },
      },
    )
    return {
      stage: 'run',
      ok: ran.exitCode === 0 && !ran.trap,
      exitCode: ran.exitCode,
      stdout: ran.stdout,
      stderr: ran.stderr,
      // 编译期警告（当前只有 `-Wdivision-by-zero` 一条）。判定不看它，卡片拿它当提示；
      // 无论本次运行是 AC 还是 RE 都照样带回去 —— 源码里有除零，这条信息对两种结果都成立。
      diagnostics: outcome.diagnostics ?? '',
      // 宿主自己记的 _start 起止；缺了才退回宿主侧粗计时
      durationMs: ran.runMs ?? Math.round(performance.now() - runStartedAt),
      runMs: ran.runMs,
      memoryBytes: ran.memoryBytes,
      sbrkFailures: ran.sbrkFailures,
      trap: ran.trap,
      // 这份产物在本 worker 里的第一次执行（Module 刚 compile 出来）→ 这一遍跑在
      // Liftoff 上，耗时偏高。上层据此决定预热，见文件头那段注释与 wasmRuntime.runCase。
      cold: ran.cold === true,
    }
  } finally {
    releaseHost()
    onHost(null)
  }
}

/**
 * 对拍的那一趟：用 -O0 重编一份同一份源码、跑一次，把 stdout 原样交回去由调用方比对。
 *
 * 为什么值得存在：源码里的未定义行为在 -O2 下可能被优化「修好」（漏 return 直接错位到下
 * 一条指令、越界读被折成常量、严格别名下两次写被合并），于是同一个错误在别处 OJ 上炸、
 * 在这里 AC。把优化关掉再跑一遍，两边输出不同就是最直接的证据。
 *
 * 三个边界：
 * - **不改判定**，调用方拿它只写一行提示（见 engines/wasm.js 的 crossCheck）；
 * - **不加载 PCH**（见 OPT_MAIN 处的说明），所以这一遍比主编译慢 230–265ms；
 * - **跑在自己的宿主上**（见 loadCrossToolchain）：不与用户运行排队，也不占它的 worker。
 *   编译段沿用同一套看门狗（60s），运行段的时限由调用方给（见 wasmRuntime 的
 *   CROSS_CHECK_RUN_MS）——这里不自己设阈值，避免两套口径。
 *
 * @returns {Promise<{ stage: 'compile' | 'run', ok: boolean, exitCode: number, stdout: string, stderr: string, durationMs: number | null, runMs: number | null, trap: string }>}
 */
export async function crossCheckRun({ code, stdin, memoryLimitBytes = 0, onStatus = () => {}, onHost = () => {} }) {
  const source = String(code ?? '')
  // 第二颗宿主（见 loadCrossToolchain）：对拍不再和用户运行抢同一颗 worker，
  // 于是「用户点运行」既不用等它，也不必把它掐断
  const tool = await loadCrossToolchain(onStatus)
  onHost(tool.host)
  const releaseHost = tool.host.hold()
  try {
    const outcome = await compileCached(source, memoryLimitBytes, onStatus, OPT_CROSS, tool)
    if (!outcome.ok) {
      // 同一份源码 -O2 编得过、-O0 却编不过，正常只可能是工具链层面的问题
      // （这条路不用 PCH，排除了 PCH 不匹配）。如实回报，由上层静默收场。
      return {
        stage: 'compile',
        ok: false,
        exitCode: outcome.exitCode,
        stdout: '',
        stderr: outcome.stderr,
        durationMs: null,
        runMs: null,
        trap: '',
      }
    }

    let runStartedAt = performance.now()
    const ran = await tool.host.run(
      { binary: outcome.binary.content, stdin },
      {
        onDispatch: () => {
          runStartedAt = performance.now()
          onStatus('run', t('stage.run'))
        },
      },
    )
    return {
      stage: 'run',
      ok: ran.exitCode === 0 && !ran.trap,
      exitCode: ran.exitCode,
      stdout: ran.stdout,
      stderr: ran.stderr,
      durationMs: ran.runMs ?? Math.round(performance.now() - runStartedAt),
      runMs: ran.runMs,
      trap: ran.trap,
    }
  } finally {
    releaseHost()
    onHost(null)
    // 这一趟收工：开始计闲置时间（期间再来对拍会在 loadCrossToolchain 里把它取消）
    scheduleCrossIdleDispose()
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
      onStatus('download', t('stage.pythonRuntime'))
      const [stdlib] = await Promise.all([
        (async () => {
          const response = await fetch(PYTHON_FS_URL)
          if (!response.ok) throw new Error(t('error.pythonLibFailed', { status: response.status }))
          return unpackSysroot(new Uint8Array(await response.arrayBuffer()))
        })(),
        warmCache(PYTHON_BINARY_URL, 'python'),
      ])
      pythonRuntime = { binaryURL: PYTHON_BINARY_URL, stdlib: stdlib.fs }
      notifyRuntimeReady('python')
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
 * 后台预取：只把资产写进 Cache Storage，**不** init 宿主、不 untar。
 *
 * C++ 走与设置页下载按钮完全相同的 `downloadToolchainAssets`：一次性拉齐三件套
 * （含 wasm-ld）、逐件写后复验、最后提交 manifest。这条路径不再依赖 SW 拦截，
 * 所以首访（SW 还没接管）也能真正下好。
 */
export async function prefetchRuntimeAssets(language = 'cpp') {
  if (language === 'cpp') {
    if (!(await isToolchainCached())) await downloadToolchainAssets()
    void pruneLegacyToolchainCache()
    return true
  }
  const urls = runtimeAssetURLs(language)
  if (!urls.length) return false
  for (const url of urls) {
    const response = await fetch(url)
    if (!response.ok) throw new Error(t('error.downloadFailed', { label: url, status: response.status }))
    await response.arrayBuffer()
  }
  return true
}

/** 当前各语言资产的目录前缀（带尾斜杠）。换工具链目录名 / 换 CPython 版本时自动跟着变。 */
function currentAssetPrefixes() {
  return [`${ASSETS}/`, `${PYTHON_ASSETS}/`]
}

/**
 * 按判据清 `cp-toolchain*` 桶里的条目。
 *
 * 判据拿的是**条目自己的 URL**（`cache.keys()`），不是一张预先写死的 URL 清单 ——
 * 这样才删得到「仓库里早已没有的上一代目录」。桶名按前缀全扫、不只认当前那一个：
 * 这名字改过好几代（`cph-toolchain-v3` → `cp-toolchain-v3` → `cp-toolchain`），
 * 而 SW 的搬运要等 activate 才跑，页面先动手时旧桶还在。
 * @param {(url: string) => boolean} isStale
 */
async function deleteToolchainEntries(isStale) {
  if (typeof caches === 'undefined') return
  try {
    const names = (await caches.keys()).filter((name) => name.startsWith(TOOLCHAIN_CACHE))
    await Promise.all(
      names.map(async (name) => {
        const cache = await caches.open(name)
        const requests = await cache.keys()
        const stale = requests.filter((request) => isStale(request.url))
        await Promise.all(stale.map((request) => cache.delete(request)))
      }),
    )
  } catch {
    /* 隐私模式 / 配额：清不掉不阻断调用方 */
  }
}

/**
 * 清掉**不属于当前版本**的 `/wasm/` 条目（上一代 clang、被换掉的 CPython、8.0.1 那三件……）。
 *
 * 换代只改目录名、`cp-toolchain*` 又是永久保留的桶，除这里之外没有任何代码会回收旧目录。
 * 判据安全的前提有两条：当前版本的条目必然以当前前缀开头；没下完的条目根本不在桶里。
 * 只承诺 Cache Storage —— HTTP 缓存浏览器不给 JS 清除接口。
 */
export async function pruneLegacyToolchainCache() {
  const keep = currentAssetPrefixes()
  await deleteToolchainEntries(
    (url) =>
      url.includes(WASM_PATH_SEGMENT) &&
      // manifest 是「已就绪」的唯一事实源，任何情况下都不能被回收（它本身就在当前前缀里，
      // 这里显式放行是为了将来改 key 命名时不会再踩一次）。
      url !== TOOLCHAIN_MANIFEST_KEY &&
      // PCH 归 IndexedDB 独占（SW 也不再缓存，见 sw.js 边界 6），桶里留着的一律清掉。
      // 不能只靠下面那条版本前缀判据：PCH 的文件名会在**同目录**里换（改参数 / 改头），
      // 旧条目永远落在「当前版本前缀」里，那条判据认不出来（2026-11-03 改名后实测）。
      (/\.pch\.br$/.test(url) || !keep.some((prefix) => url.startsWith(prefix))),
  )
}

/**
 * 卸载某个本地运行时：清掉持久层里的资产，并丢掉内存里已加载的那份，
 * 让下一次运行 / 下载都退回「从零开始」。设置页的「本地运行环境」卸载按钮走这里。
 *
 * 持久层分两块，只有第一块删得掉：
 * - Cache Storage（SW 的 `cp-toolchain-*`，名字见 services/storageNames.js）：
 *   SW 控制页面时资产的实际落点，逐个删条目；
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
  toolchain?.host?.dispose()
  toolchain = null
  toolchainPromise = null
  // 用户主动卸载：诊断痕迹一起清掉，下次离线运行应报「未安装」而不是「被浏览器清理」
  clearLastInstalledAt()
  // 对拍那颗宿主是第二份内存（自带一份 clang / wasm-ld 与 sysroot），卸载得一起收；
  // 闲置倒计时也要停，否则它到点会对一颗已经释放的宿主再 dispose 一次
  cancelCrossIdleDispose()
  crossToolchain?.host?.dispose()
  crossToolchain = null
  crossToolchainPromise = null
  // 编译产物是纯内存缓存，依附工具链存在，一起丢
  compileCaches.clear()
  oomProbeObject = null
  // PCH 有两处落点：IndexedDB 里的存档（十几 MB，不在 /wasm/ 缓存清单内）和
  // `cp-toolchain` 桶里的预编译资源（`*.pch.br`，由 purgeRuntimeCache 按 /wasm/ 前缀一并带走）。
  pchBytes = null
  pchOrigin = null
  pchPromise = null
  pchHandedTo = new WeakMap()
  await deletePch(pchCacheId())
}

/**
 * 休眠：把工具链从内存里放掉，**但不碰任何持久层**。
 *
 * 与 {@link unloadRuntime} 的区别只有一句话：那条是用户明确点「卸载」，所以要连
 * Cache Storage 里 23MB 资产和 IndexedDB 里 18MB 存档一起删；这里是「一时用不着了」，
 * 下次还要能原样恢复 —— 资产留在缓存里，热恢复只是读本地缓存 + 解包（实测约 400ms，
 * 不需要重新走网络）。
 *
 * 放掉的四份内存：clang Module + sysroot 解包后的 1385 个文件节点（baseFs）、
 * 第二颗对拍宿主、编译产物缓存、以及主线程那份 18MB PCH（存档里还有，读回很快）。
 *
 * @param {'cpp'} [language] 目前只有 C++ 有常驻宿主；Python 是 runno 的单次实例，不用这条
 * @returns {boolean} 真的放掉了东西（false = 本来就没加载，调用方不必改状态）
 */
export function suspendRuntime(language = 'cpp') {
  if (language !== 'cpp') return false
  const hadHost = Boolean(toolchain?.host?.alive)
  cancelCrossIdleDispose()
  toolchain?.host?.dispose()
  toolchain = null
  toolchainPromise = null
  crossToolchain?.host?.dispose()
  crossToolchain = null
  crossToolchainPromise = null
  compileCaches.clear()
  oomProbeObject = null
  pchBytes = null
  pchOrigin = null
  pchPromise = null
  pchHandedTo = new WeakMap()
  if (!hadHost) return false
  return true
}

/**
 * 从所有工具链缓存里删掉该语言的资产条目。
 *
 * 删的是这一语言的**所有代**，不只是当前那三个 URL：换代只换目录名，旧目录的条目
 * 一直留在桶里，只按当前 URL 删的话「卸载」之后那几十 MB 仍然谁也回收不了
 * （`cp-toolchain*` 在 SW 的 keep 白名单里）。所以判据是「属于 /wasm/ 但不属于
 * **另一个语言**的当前前缀」—— 卸 C++ 不误伤 Python，反之亦然。
 *
 * 桶名按前缀全扫、不只认当前那一个：这名字改过好几代
 * （`cph-toolchain-v3` → `cp-toolchain-v3` → `cp-toolchain`），而 SW 的搬运要等
 * activate 才跑；页面先动手的话旧桶还在，只删新桶会留下那份残留 ——
 * 后果正是坑 23 那条「卸了像没卸」（探针一扫到残留就把资产判回已就绪）。
 */
async function purgeRuntimeCache(language) {
  // 未知语言不碰桶（沿用原判据：没有资产清单就没有卸载目标）
  if (!runtimeAssetURLs(language).length) return
  // 留的是**另一个语言**：卸载只该带走自己这一边的所有代
  const keepOther = [language === 'python' ? `${ASSETS}/` : `${PYTHON_ASSETS}/`]
  await deleteToolchainEntries(
    (url) => url.includes(WASM_PATH_SEGMENT) && !keepOther.some((prefix) => url.startsWith(prefix)),
  )
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

  onStatus('run', t('stage.run'))
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
    durationMs: ran.runMs ?? Math.round(performance.now() - startedAt),
    runMs: ran.runMs,
    memoryBytes: ran.memoryBytes,
    sbrkFailures: ran.sbrkFailures,
    trap: ran.trap,
  }
}

// ---------------------------------------------------------------- 预编译头（PCH）
//
// 目的：老机器上编译一次竞赛代码，CPU 和内存的大头都花在反复解析 STL 头上。
// 整份万能头的 AST 每次编译都一模一样，做成 PCH 后每次编译只需反序列化
// （覆盖范围与收益见 PCH_SOURCE_TEXT 上方那段实测）。
//
// 这条路和用户编译的差别只有一个：产物不是 .o 而是 .pch。
// 文件系统照旧走 runno 那一套 —— clang 用 path_open(O_CREAT) 建文件、写完
// 由 WASIDrive.sync() 落到 result.fs，我们从 result.fs[PCH_PATH].content 取二进制。

/**
 * PCH 在本机不可用（生成时 OOM / cc1 卡死，或加载时被判不匹配）后写下的标记。
 *
 * **值里带存档版本**（`PCH_CACHE_VERSION`）：这台机器在旧内核下扛不住，不代表新内核下也
 * 扛不住 —— 而工具链换代换的正是生成 PCH 的那套 clang 与头文件。裸 `'true'`（v5 及更早）
 * 与旧版本号一律**认作过期**，于是换代后自动再试一次，不需要写任何迁移代码。
 */
const PCH_UNSUPPORTED_KEY = 'cp.pchUnsupported'

/**
 * 「这份**预编译好的** PCH 在本机加载不了」的标记，值是资源 id（`pch-6-<头文件指纹>-<参数指纹>`）。
 *
 * 与上面那个标记刻意分开，因为后果不一样：`cp.pchUnsupported` 关掉的是**本机生成**，
 * 而这条只是「别再下这份资源了」—— 本地生成那条路必须继续可用。混成一个键的话，
 * 一次资源事故就会把本来能靠本地生成拿到加速的机器一起报废。
 * 按资源 id 记，所以换了 PCH（版本号、头文件内容或编译参数变了 → 文件名变了）自动重试。
 */
const PCH_ASSET_BAD_KEY = 'cp.pchAssetBad'

// 给足预算：老机器解析整份万能头（30 个头）+ 序列化 AST 可能要几十秒，但超过这个时间
// 基本可以断定是 cc1 卡死（本项目踩过），杀掉并标记不支持。
// 这张表是**从消息派发出去那一刻**起算的（见 wasi/client.js 的 send），排队时间不算。
const PCH_TIMEOUT_MS = 3 * 60 * 1000

/**
 * 「本机生成 PCH 这条编译本身失败了」的错误码。
 *
 * 只有这个码才意味着「这台机器生成不了」，才会写 `cp.pchUnsupported`。别把
 * 宿主被看门狗 / 用户取消 / 前台任务抢占而掐断也算进来 —— 那几类错误带着
 * `reason`（见 wasi/client.js 的 KILL_REASON），是外力打断，不是这台机器不行。
 * 误记一次的后果是这一代内核永远没有 PCH，每次编译都慢一截。
 */
const PCH_COMPILE_FAILED = 'pch-compile-failed'

// 存档格式版本：改动存档结构（或 PCH 的生成方式）时手动 +1
// v2：编译参数加了 `-w`（语言选项变了，v1 的存档加载会被 clang 拒掉 —— 2026-10-18）
// v3：PCH 从「5 个头的微型版」换成整份 bits/stdc++.h（体积 6.9→8.6MB，检查快 2.4 倍 —— 2026-10-19）
//     内容指纹本来也会变，版本号只是让「旧存档作废」这件事一眼可见
// v4：编译参数加了 `-DONLINE_JUDGE`（2026-10-25，与 CF / AtCoder 对齐，判定规范 §6）
// v5：换 23.1.0 内核 —— `-std=c++20` / wasm 异常六项 / `+simd128` / `-fno-rtti`，
//     头布局也从 `/sys/include` 换到 `/sys/include/wasm32-wasip1`（2026-10-25，阶段 2）
// v6：阶段 4 自写宿主把 PCH 源头的 mtime 固定成常量（否则刷新后从 IndexedDB
//     取回的 PCH 会报 `/stdc++.h has been modified`）—— 2026-10-25
const PCH_CACHE_VERSION = 6

/**
 * 「这次编译失败是 PCH 的锅」的识别特征。
 *
 * 必须写得足够窄：用户代码写错同样会「没有 .o」，把那种情况误判成 PCH 故障
 * 会让每次编译错误都白编译一遍、还把加速永久关掉 —— 判题环境里写错代码才是常态。
 * 所以只认两样：我们自己的文件名，以及 clang 报 PCH 问题时的固定措辞。
 */
const PCH_ERROR_RE = /stdc\+\+\.h\.pch|precompiled header/i

/** 标记值：`v6` 这种形态，跟 PCH_CACHE_VERSION 一起变（改存档版本 = 允许重试一次） */
function pchUnsupportedToken() {
  return `v${PCH_CACHE_VERSION}`
}

function isPchUnsupported() {
  try {
    return window.localStorage.getItem(PCH_UNSUPPORTED_KEY) === pchUnsupportedToken()
  } catch {
    // 隐私模式下读不到 localStorage：当作没标记，让这一次去试
    return false
  }
}

function markPchUnsupported() {
  try {
    window.localStorage.setItem(PCH_UNSUPPORTED_KEY, pchUnsupportedToken())
  } catch {
    /* 写不进去也无害，最坏结果是下次刷新再试一遍 */
  }
}

/**
 * 撤销「本机扛不住」的标记。
 *
 * 什么时候该撤：拿到的是一份**预编译好的** PCH 并且它加载成功。那个标记的两条来源
 * 都是「本机自己生成 / 自己存档失败」，与「别人生成好的能不能装下」不是一回事
 * —— 老机器常常生成时 OOM、却完全装得下一份现成的（序列化比反序列化贵得多）。
 * 不撤的话，这份能用的 PCH 只在本会话的内存里有效，一刷新就被标记挡回去。
 */
function clearPchUnsupported() {
  try {
    window.localStorage.removeItem(PCH_UNSUPPORTED_KEY)
  } catch {
    /* 读不到 localStorage 时本来也没标记 */
  }
}

function isPchAssetBad() {
  try {
    return window.localStorage.getItem(PCH_ASSET_BAD_KEY) === PCH_ASSET_ID
  } catch {
    return false
  }
}

function markPchAssetBad() {
  try {
    window.localStorage.setItem(PCH_ASSET_BAD_KEY, PCH_ASSET_ID)
  } catch {
    /* 同 markPchUnsupported：写不进去最坏是多下一次 */
  }
}

/** 工具链是否已在内存里（PCH 不该为了自己把那 23MiB 拉起来） */
export function isToolchainReady() {
  return Boolean(toolchain?.host?.alive)
}

/**
 * 主宿主此刻有没有活（运行 / 编译 / PCH 生成 / 语法诊断 / 悬停查询都算）。
 *
 * 给闲置休眠用：`unloadRuntime` 式的释放会 terminate 整颗 worker，一条正在跑的
 * 15s 语法诊断会随之变成 ABORTED、编辑器里留着旧红线。所以「没人在用」这件事
 * 只有宿主自己知道得最准（busy / queued / activeLabel，见 wasi/client.js）。
 */
export function isToolchainHostIdle() {
  const host = toolchain?.host
  if (!host?.alive) return true
  return !host.busy && !host.activeLabel && host.queued === 0
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
 * 所以工具链版本、PCH 源码内容、**编译参数**、存档格式任一变化，id 都不一样，旧存档自然取不到。
 * 参数用指纹而不是让 `PCH_CACHE_VERSION` 手工跟着 +1：手工那步漏过（见 PCH_ARGS_HASH）。
 */
function pchCacheId() {
  return `${PCH_CACHE_VERSION}:${TOOLCHAIN_VERSION}:${hashString(PCH_SOURCE_TEXT)}:${PCH_ARGS_HASH}`
}

/**
 * 预编译 PCH 的资源 id / 地址（2026-10-27）。
 *
 * 文件名里带**存档格式版本**、**万能头内容指纹**与**编译参数指纹**，把它做成内容寻址：
 * 凡是会改变 PCH 字节的东西（clang 版本、sysroot、头文件内容、语言 / 目标选项）一变，
 * 网址就变，SW 的 `cp-toolchain` 桶里那份 immutable 缓存自然失效。少任何一项都会留下
 * 「资源永远是旧的那份、而运行时不认」的静默降级（见坑表里 SW 外壳桶那一条）。
 * 构建侧按同一个名字落盘，见 scripts/build-pch.mjs；运行时导出它就是为了两边对得上。
 */
const PCH_ASSET_ID = `pch-${PCH_CACHE_VERSION}-${hashString(PCH_SOURCE_TEXT)}-${PCH_ARGS_HASH}`
const PCH_URL = `${ASSETS}/${PCH_ASSET_ID}.pch.br`

/** `public/` 下的相对路径（构建脚本用，别在别处硬编码这个文件名） */
export function pchAssetFile() {
  return `wasm/${TOOLCHAIN_VERSION}/${PCH_ASSET_ID}.pch.br`
}

/**
 * 拉取预编译好的 PCH 字节（单飞去重）。
 *
 * 启动预取（runtimePreload 的 prefetchPch）与运行后的 warmupPch 可能同时看中这一份；
 * 不去重的话会把同一个 8.3MB 响应解两遍（br → 18MB），在慢机器上白烧一份内存。
 * 只去重**在途**请求：settle 之后立刻清空，别让这份 18MB 常驻在一条已完成的 promise 上。
 * @returns {Promise<Uint8Array | null>} null = 没拿到（404 / 断网 / 已被标记为坏资源）
 */
function downloadShippedPch() {
  if (pchFetchPromise) return pchFetchPromise
  const run = (async () => {
    if (isPchAssetBad()) return null
    try {
      const response = await fetch(PCH_URL)
      if (!response.ok) return null
      const bytes = new Uint8Array(await response.arrayBuffer())
      return bytes.byteLength ? bytes : null
    } catch {
      return null
    }
  })()
  pchFetchPromise = run
  const clear = () => {
    if (pchFetchPromise === run) pchFetchPromise = null
  }
  run.then(clear, clear)
  return run
}

/**
 * 下载预编译好的 PCH。没占到便宜就返回 null（断网 / 404 / 配额 / 已被标记为坏资源）。
 *
 * 为什么敢直接用**别的机器**生成的那份：PCH 的控制块里签着 clang 版本、语言 / 目标选项、
 * 每个输入头的路径 + 大小 + mtime。这四样两端都一样 —— 同一份 clang.wasm、同一份
 * sysroot.tar、同一份 UNIVERSAL_HEADER、逐字共用的 FRONTEND_ARGS，而 sysroot 与
 * `/stdc++.h` 的 mtime 从 2026-10-25 起就钉成了常量（`SYSROOT_MTIME`，见
 * wasi.worker.js）。也就是说这份字节与「本机生成后写进 IndexedDB 再读回来」逐字节同源，
 * 那条路本来就在跨会话使用。
 */
async function fetchShippedPch() {
  const bytes = await downloadShippedPch()
  if (!bytes) return null
  pchBytes = bytes
  pchOrigin = 'shipped'
  // 落存档：编译路径只认 IndexedDB（见 loadPchBytes），不存的话刷新后又要下一次。
  // **不 await**：内存里已经有这份了，编译不依赖存档；18MB 的 put 可能慢到几百毫秒
  // （老机器 / 慢盘），让它挡住「运行后的预热」这条链不值得。存不上只是下次还要再下。
  void writePch(pchCacheId(), bytes).catch(() => {})
  return bytes
}

/**
 * 后台把预编译 PCH 备好，**走和编译路径同一条落库路**（见 fetchShippedPch）：
 * 内存一份 + IndexedDB 一份。缓存只当传输层，不再当唯一的落脚点。
 *
 * 2026-11-03 修：以前这里只把响应留在 SW 缓存里、把解出来的字节丢掉，而
 * `loadPchBytes` 只读内存 / IndexedDB —— 于是「预取完成」与「首编用上 PCH」是两件
 * 互不相干的事（实测首编 616ms vs 带 PCH 270ms，白等约 350ms）。
 *
 * 内存里那份只在「还没交给 worker」之前有意义（pchPlan 交付之后就丢掉，见那里的说明）：
 * 它同时消掉了「首编赶在 IndexedDB 的 18MB put 提交之前读库」的竞态，代价是同一份字节
 * 会在 worker 的 baseFs 里再落一份 —— 两份只在这几秒里同时存在，之后只剩 worker 那份。
 *
 * 与 `prefetchRuntimeAssets` 分开两个函数：那个同时是「工具链是否已下载」的判据
 * （`runtimeAssetURLs`），把 PCH 塞进去会让所有老用户被判成「没下过」。
 *
 * 2026-11-03 修：先查内存 / 存档，命中就**不再发 fetch**。以前这里无条件走
 * `fetchShippedPch`，于是老用户每次刷新都会白跑一次缓存读取 + Brotli 解压 + 18MB 的
 * IDB 覆写（实测二次访问 36–112ms、每次都 put 18,372,468 B），是个隐蔽的启动期伪命中。
 * 坏档不在这里兜：编译会走 `PCH_ERROR_RE → discardPch`，下一次预热重新取。
 */
export async function prefetchPch() {
  if (await loadPchBytes()) return
  await fetchShippedPch()
}

/** @type {Promise<Uint8Array | null> | null} 在途的下载（单飞，见 downloadShippedPch） */
let pchFetchPromise = null

/** @type {Promise<Uint8Array | null> | null} */
let pchPromise = null
/** @type {Uint8Array | null} 本会话已备好的 PCH，避免每次编译都回 IndexedDB 取 */
let pchBytes = null
/**
 * 内存里这份是打哪来的：`'shipped'`（下载的）或 `'local'`（本机生成的）。
 * 只用于「加载失败该怪谁」—— 见 discardPch。跨会话读回存档时无从得知，按 `null` 处理。
 * @type {'shipped' | 'local' | null}
 */
let pchOrigin = null

/**
 * 宿主 → 已经把 PCH 交付给它的 worker 世代号（`host.generation` 每次重建 +1）。
 *
 * 为什么要这张表：`client.js` 的 `postMessage` 没有 transfer list，消息体里的
 * `Uint8Array` 会被**结构化克隆**一份 —— 这 18.37MB 每敲一次键（语法诊断）、
 * 每悬停一次（completion）都要复制一次，是这套架构里最贵的一笔内存开销。
 * PCH 是「装进 worker 的 baseFs 里就一直有效」的东西：同一代 worker 只该交一次，
 * 之后的消息只带 `-include-pch` 参数、不带字节。
 *
 * 记在**世代号**而不是宿主对象上：`client.js` 在 terminate 之后会在同一个宿主对象里
 * 重建 worker，对象身份不变、FS 却已经是空的 —— 拿对象当判据就会漏装。
 */
let pchHandedTo = new WeakMap()

/**
 * 这条消息该怎么带 PCH。
 *
 * 三条规矩，缺一条就会回到「每敲一次键克隆一份 18MB」：
 * 1. **同一代 worker 只交付一次**：装进 baseFs 之后就一直在（`-include-pch` 只是路径参数，
 *    不需要字节），所以这一代后续的消息一律 `bytes: null`；
 * 2. **只在真正要交付时才去读存档**：这一代已经装过就直接短路，别为了一条用不上字节的消息
 *    白读 18MB IndexedDB；
 * 3. **交付确认必须是「消息真的派发了」**（`confirm` 由客户端 onDispatch 触发），
 *    否则一条被 `cancelQueued` 撤掉的消息会让这一代误以为已经装好，之后每条消息都带着
 *    `-include-pch` 去打一个不存在的文件。
 *
 * @param {object} host 目标宿主（见 wasi/client.js 的 WasiWorkerHost）
 * @returns {Promise<{ installed: boolean, bytes: Uint8Array | null, confirm: (() => void) | null }>}
 *   `installed` 表示「这条消息跑起来时 worker FS 里一定有 PCH」，参数据此决定要不要带
 *   `-include-pch`。
 */
async function pchPlan(host) {
  const generation = host.generation
  if (pchHandedTo.get(host) === generation) return { installed: true, bytes: null, confirm: null }
  // 这一代还没装过：现在才值得读那份存档（内存 → IndexedDB，见 loadPchBytes）
  const bytes = await loadPchBytes()
  if (!bytes) return { installed: false, bytes: null, confirm: null }
  return {
    installed: true,
    bytes,
    confirm: () => {
      pchHandedTo.set(host, generation)
      // 交出去之后主线程不再留这份 18MB：worker 的 baseFs 里已经有一份，再留就是双份常驻。
      // 换一代 worker 要重装时从 IndexedDB 读回来 —— 那份迟早都写过
      // （见 fetchShippedPch / ensurePch 的 writePch）。
      if (pchBytes === bytes) pchBytes = null
      // `pchPromise` 的 resolved value 就是同一份 18MB：只清 pchBytes 清不掉它。
      // 清空之后 ensurePch 会走一次存档读（不是重编，见那里的注释）。
      pchPromise = null
    },
  }
}

/**
 * 编译前取 PCH：先看本会话内存，再问 IndexedDB。
 *
 * 这里**不会**触发生成、也不会发起下载 —— 那两条只走 warmupPch() 那条后台路径。
 * 编译路径不能为了它多等几百毫秒；没备好就照常普通编译，用户只是没享受到加速而已。
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
 *
 * 两种来源后果不同（`pchOrigin`）：
 * - 本机生成的：就是 `cp.pchUnsupported` 的老语义 —— 这台机器生成 / 存档走不通，别再试；
 * - 下载来的：只把这个**资源 id** 记成坏的，别再下它，但本地生成那条路留着。
 *   混成一个标记的话，一次资源事故（比如换了参数忘了升版本）会把本来靠本地生成
 *   还能拿到加速的机器一起永久报废。
 * 跨会话读回存档时 origin 是 null（那份是谁写的已经无从得知），按「本机生成」处理。
 */
async function discardPch() {
  const origin = pchOrigin
  pchBytes = null
  pchOrigin = null
  // 交付表也要一起清：worker FS 里那份已经被判废，下一代不该再假装「已经装过」
  pchHandedTo = new WeakMap()
  await deletePch(pchCacheId())
  if (origin === 'shipped') {
    markPchAssetBad()
    // 让下一次预热可以直接退回本地生成（预热本会话只跑一次，所以实际生效在下一会话）
    pchPromise = null
    return
  }
  markPchUnsupported()
}

/**
 * 后台备好 PCH：**先取预编译好的那份，取不到再本机生成**。
 * 不要在首屏或用户操作路径上直接调，统一走 wasmRuntime 的 warmupPch()。
 *
 * 返回值：PCH 字节（存档 / 资源 / 生成三选一）；已标记不支持时返回 null；失败则抛出。
 * 本机生成失败一律按「这台机器扛不住」处理，写 cp.pchUnsupported 且不再重试 ——
 * 在会 OOM 的机器上重试只是再崩一次。所以这里成功失败都只算一次，pchPromise 也就没必要清
 * （唯一例外：坏资源那条路会把它清掉，好让下一会话退回生成）。
 */
export function ensurePch() {
  if (pchPromise) return pchPromise

  pchPromise = (async () => {
    // 存档里已经有就直接用，绝不重编 —— 阶段 3（持久化）的意义全在这一行：
    // 刷新页面后 pchBytes 是空的，但 IndexedDB 里的那份还在，不该再花 400ms 重跑一遍。
    // loadPchBytes() 顺带覆盖了内存缓存和「本机不可用」标记两种情况。
    const cached = await loadPchBytes()
    if (cached) return cached
    // 存档没有（或是被标记挡回去了）→ 先试预编译好的那份。
    // **放在 isPchUnsupported() 之前**是有意的：那个标记说的是「这台机器生成 / 存档走不通」，
    // 而下载一份现成的只需要装得下 —— 序列化比反序列化贵得多，老机器常常正好卡在这一步。
    // 这条顺序就是它们的救兵；反过来先看标记，等于把它们永远留在没有 PCH 的世界里。
    const shipped = await fetchShippedPch()
    if (shipped) {
      clearPchUnsupported()
      return shipped
    }
    // 资源也拿不到：本机已被判定扛不住就必须就此打住 ——「失败一次以后不再重试」这条要求
    // 落在这一行，否则每次刷新都会在一台已知会 OOM 的机器上再试一次，正好是要避免的事。
    if (isPchUnsupported()) return null

    // 后台活只在工具链已经在内存里时才做本机生成：这条路上一个 await 就可能把 23MB
    // 的下载拽起来，那是用户点▶时该付的钱，不是预热该付的。
    if (!isToolchainReady()) return deferPch()

    const tool = await loadToolchain(() => {})
    const host = tool.host
    // 本机生成是**后台活**，不该让用户排它后面：宿主正被运行占着，或队里已经有人等，
    // 这轮就先算了（下一次运行结尾还会调 warmupPch，那时再开工）。只是 queued 里有活
    // 也算 —— 那种情况下这条 compile 会排在用户任务后面，白占一次 hold 没意义。
    if (host.busy || host.activeLabel || host.queued > 0) return deferPch()
    // 到收尾为止这颗宿主归 PCH 独占。少了这一行，生成期间用户随手改一个字符就能招来
    // 一次语法检查：它见 busy 是 false 就照常上表，消息排在这次编译后面等 —— 一旦先到点
    // 就 kill() 掉宿主。现在语法诊断不会再主动 kill（见 syntaxDiagnostics），这层标记
    // 仍是「PCH 正在写、别来插队」的声明；用户真点运行则由宿主的抢占机制兜住
    // （前台消息会把这个后台活连 worker 一起换掉，见 wasi/client.js 的 send）。
    const releaseHost = host.hold()
    try {
      const compiled = await host.compile(
        {
          args: PCH_ARGS,
          source: PCH_SOURCE_TEXT,
          sourcePath: PCH_SOURCE_PATH,
          outputPath: PCH_PATH,
        },
        {
          // 3 分钟是「这台机器生成不完」的上限，从**消息派发**起算：排在用户那次编译后面
          // 等多久都不作数（见 wasi/client.js 文件头）。后台优先级：用户一动手就让它插队
          // —— 已派发的那条由宿主自己收掉（抢占），FS 里写了一半的 PCH 随 worker 一起消失。
          timeoutMs: PCH_TIMEOUT_MS,
          priority: HOST_PRIORITY_BACKGROUND,
          label: 'pch',
        },
      )
      if (!compiled.object) {
        // 只有这一条是「这台机器生成不了」：给错误贴上专属码，catch 只认它。
        throw Object.assign(
          new Error(compiled.stderr || t('error.pchFailed', { code: compiled.exitCode })),
          { code: PCH_COMPILE_FAILED },
        )
      }
      const bytes = compiled.object
      // 先落内存再落库：存档失败（配额不足 / 隐私模式）不该影响本会话，
      // 内存里这份照样能用，只是下次刷新要重新生成。18MB 的 put 可能几百毫秒，
      // 不 await —— 编译只认内存里这份。
      pchBytes = bytes
      pchOrigin = 'local'
      void writePch(pchCacheId(), bytes).catch(() => {})
      return bytes
    } finally {
      releaseHost()
    }
  })()

  // 只有真·生成失败才写永久标记。被看门狗掐断 / 用户取消 / 用户点运行抢占，都不该让
  // 这台机器在本代内核里永远失去 PCH（见 PCH_COMPILE_FAILED 的说明）。
  pchPromise.catch((error) => {
    if (error?.code === PCH_COMPILE_FAILED) {
      markPchUnsupported()
      return
    }
    // 外力打断：清掉这颗已经 reject 的 promise，让下一次 warmupPch 还能从头再来一次
    if (error?.reason) pchPromise = null
  })
  return pchPromise
}

/**
 * 「这一轮没轮到」：把缓存的 promise 清掉，返回 null。
 *
 * 不清的话 `ensurePch` 会把这次的 null 缓存到本会话结束，下一次 warmupPch 直接拿到
 * 同一个 null —— 「等空闲了再从头生成」就永远等不到。
 */
function deferPch() {
  pchPromise = null
  return null
}

/**
 * 语法检查的四种结论。
 *
 * 用枚举而不是 `null`：null 把「为什么没有结论」丢掉了，调用方只能一律当成「等一下再补」——
 * 于是宿主已被看门狗收掉时还会空跑四次重试。区分开之后，「等一下就有」（busy）与
 * 「别等了」（unavailable / aborted）各走各的路。
 */
export const SYNTAX_STATUS = {
  /** 有结论，`exitCode` / `stderr` 是诊断原文 */
  SUCCESS: 'success',
  /** 宿主正被运行 / PCH 生成占着：过一会儿再试就可能有结论 */
  BUSY: 'busy',
  /** 运行时不在（没下载 / 宿主已死）：在 runtimeReady 之前别等了 */
  UNAVAILABLE: 'unavailable',
  /** 这一枪被外力打断（看门狗 / 抢占 / 取消）：保留旧标记，等下一枪 */
  ABORTED: 'aborted',
}

/**
 * 语法检查的命令行：只做前端（解析 + 语义），不产生 .o、不链接。
 *
 * 和编译**共用 FRONTEND_ARGS** 是硬要求：诊断必须按用户真正编译时那套
 * `-std=c++20` / `-isysroot /sys` / libc++ 头路径去判，否则会出现
 * 「编辑器说没问题、运行却编译不过」这种最招人烦的分歧。
 * -w 也在里面，所以这里只出 error —— 与判题卡片上看到的完全一致。
 */
function syntaxArgs(pchPath) {
  return [
    '-cc1',
    '-fsyntax-only',
    ...FRONTEND_ARGS,
    ...(pchPath ? ['-include-pch', pchPath] : []),
    '-x',
    'c++',
    SOURCE_PATH,
  ]
}

/** 单次语法检查的看门狗：正常 0.2–0.5s，15s 还没完就是卡死了（老机器 / 死循环模板） */
const SYNTAX_TIMEOUT_MS = 15000

/**
 * 对一段 C++ 源码跑一次语法检查，返回 clang 的 stderr（诊断原文）。
 *
 * 与判题的区别只有一个：`-fsyntax-only` 到前端就停，不生成机器码。
 * 实测同一份 85 行题解：带 PCH 时 `-fsyntax-only` 155–268ms，
 * 而 `-emit-obj` 要 690–782ms —— 代码生成才是大头，编辑器里不值得付。
 *
 * 三条使用前提：
 * 1. **工具链必须已经加载**（`isToolchainReady()`）。这里刻意不主动
 *    `preloadToolchain()`：那等于用户一打开 .cpp 就偷偷下 30MB。谁调谁决定；
 * 2. 用的是**和运行 / PCH 生成共用的那颗常驻宿主**，不是每次新起一个 worker。那两位正占着
 *    它时（`host.busy`）本函数直接返回 BUSY 让路 —— 那条路上 kill() 杀掉的是别人；
 * 3. 没有结论时返回带 `status` 的对象（不是 null）：BUSY 可以过一会儿补，UNAVAILABLE /
 *    ABORTED 就别等了。调用方一律保留上一次的标记 —— 把用户已经看到的红波浪线擦掉更糟。
 *
 * 15 秒表交给宿主、**从消息真正派发出去那一刻起算**：这一枪可能排在用户那次编译后面等
 * （虽然 busy 已经挡掉了大部分），排队时间绝不能算进「这一枪跑了多久」（2026-10-27）。
 *
 * @param {string} code
 * @param {{ onHost?: (host: object | null) => void }} [options]
 * @returns {Promise<{ status: string, exitCode?: number, stderr?: string }>}
 */
export async function checkCppSyntax(code, { onHost } = {}) {
  if (!toolchain?.host?.alive) return { status: SYNTAX_STATUS.UNAVAILABLE }
  const host = toolchain.host
  // 运行或 PCH 生成正占着这颗宿主：让路。**不能**只是「照常排队」—— 那张 15s 表虽然已经从
  // 派发时刻起算，但排在这一枪前面的如果是几十秒的 PCH 生成，用户的红线就要迟到几十秒。
  if (host.busy) return { status: SYNTAX_STATUS.BUSY }
  // 这一代 worker 还没装过 PCH 时才会读那份 18MB 存档；装过就直接短路，不带字节
  const pch = await pchPlan(host)
  // pchPlan 可能 await 了存档读取：期间用户可能刚好点了运行，回来再确认一次
  if (!host.alive) return { status: SYNTAX_STATUS.UNAVAILABLE }
  if (host.busy) return { status: SYNTAX_STATUS.BUSY }
  onHost?.(host)
  try {
    const result = await host.syntax(
      {
        args: syntaxArgs(pch.installed ? PCH_PATH : null),
        source: code,
        sourcePath: SOURCE_PATH,
        pch: pch.bytes,
      },
      {
        // 后台优先级：用户点运行 / PCH 生成要插队时，这一枪可以让到前面去。
        // label 是给 cancelQueued 与超时措辞用的（诊断侧撤旧枪只撤自己这一类）。
        timeoutMs: SYNTAX_TIMEOUT_MS,
        priority: HOST_PRIORITY_BACKGROUND,
        label: 'syntax',
        onDispatch: () => pch.confirm?.(),
      },
    )
    return { status: SYNTAX_STATUS.SUCCESS, exitCode: result.exitCode, stderr: result.stderr }
  } catch (error) {
    // 带 reason 的都是「被外力掐断」（看门狗 / 前台抢占 / 取消），不是诊断本身出错
    if (error?.reason) return { status: SYNTAX_STATUS.ABORTED }
    throw error
  } finally {
    onHost?.(null)
  }
}

/**
 * 语义悬停的命令行：在 `-fsyntax-only` 之上再加一次「代码补全」查询。
 *
 * `-code-completion-at=` 是 cc1 的前端开关，clang 会把该位置能看到的符号按
 * `COMPLETION: 名字 : [#类型#]签名` 打到 **stdout**（与诊断走 stderr 互不干扰）。
 * 参数与语法检查同源（同一份 FRONTEND_ARGS / PCH），所以结论和真正编译时一致。
 */
function completionArgs(pchPath, line, column) {
  return [
    '-cc1',
    '-fsyntax-only',
    ...FRONTEND_ARGS,
    ...(pchPath ? ['-include-pch', pchPath] : []),
    `-code-completion-at=${SOURCE_PATH}:${line}:${column}`,
    '-x',
    'c++',
    SOURCE_PATH,
  ]
}

/**
 * 对一段 C++ 源码的指定位置跑一次代码补全查询（语义悬停用，见 monaco/semanticHover.js）。
 *
 * 使用前提与 {@link checkCppSyntax} 完全一致：工具链必须已加载（这里同样**不主动下载**，
 * 下载时机由设置页那个开关决定）；沿用同一颗常驻宿主，`busy` 时直接让路。
 *
 * @param {string} code
 * @param {number} line 1 起的行号
 * @param {number} column 1 起的**字节列**（UTF-8 列，不是 UTF-16 光标列）
 * @param {{ onHost?: (host: object | null) => void }} [options]
 * @returns {Promise<{ status: string, exitCode?: number, stdout?: string, stderr?: string }>}
 */
export async function checkCppCompletion(code, line, column, { onHost } = {}) {
  if (!toolchain?.host?.alive) return { status: SYNTAX_STATUS.UNAVAILABLE }
  const host = toolchain.host
  if (host.busy) return { status: SYNTAX_STATUS.BUSY }
  // 同 checkCppSyntax：这一代装过就短路，只有第一次交付才读存档
  const pch = await pchPlan(host)
  if (!host.alive) return { status: SYNTAX_STATUS.UNAVAILABLE }
  if (host.busy) return { status: SYNTAX_STATUS.BUSY }
  onHost?.(host)
  try {
    const result = await host.syntax(
      {
        args: completionArgs(pch.installed ? PCH_PATH : null, line, column),
        source: code,
        sourcePath: SOURCE_PATH,
        pch: pch.bytes,
      },
      {
        // 与语法检查同一档后台优先级：用户点运行时这一枪先让路
        timeoutMs: SYNTAX_TIMEOUT_MS,
        priority: HOST_PRIORITY_BACKGROUND,
        label: 'completion',
        onDispatch: () => pch.confirm?.(),
      },
    )
    return {
      status: SYNTAX_STATUS.SUCCESS,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    }
  } catch (error) {
    if (error?.reason) return { status: SYNTAX_STATUS.ABORTED }
    throw error
  } finally {
    onHost?.(null)
  }
}

/**
 * python 语法检查的 `-c` 脚本：对入口文件做 `compile()`，把 SyntaxError 译成
 * **clang 同款格式**（`路径:行:列: error: 消息`）打到 stderr —— 上层的解析器
 * （monaco/syntaxDiagnostics 的 parseDiagnostics）就一份，两种语言共用。
 *
 * ⚠️ 两条刻意的边界：
 * - **只解析、绝不执行**。诊断要是把用户代码跑起来，`while True:` 就变成烧 CPU 的
 *   死循环、副作用也会污染工作区。`compile()` 编到字节码就停，一个字节都不执行。
 * - 错误只报第一条。Python 的异常模型决定了 `compile()` 一次只抛一个 SyntaxError，
 *   不像 clang 有 `-ferror-limit` 连环报 —— 这是语言本身的口径，不是缺陷。
 */
const PY_SYNTAX_CHECK_SCRIPT = [
  'import sys',
  "try:",
  "    compile(open('/main.py', encoding='utf-8').read(), 'main.py', 'exec')",
  'except SyntaxError as e:',
  "    print('%s:%d:%d: error: %s' % ('main.py', e.lineno or 1, e.offset or 1, e.msg or 'invalid syntax'), file=sys.stderr)",
  'except (ValueError, TypeError) as e:',
  "    print('main.py:1:1: error: %s' % e, file=sys.stderr)",
].join('\n')

/**
 * 对一段 Python 源码跑一次语法检查，返回解释器的 stderr（诊断原文，已是 clang 格式）。
 *
 * 用已在场的 python.wasm 跑 `-c` 小脚本：解释器启动 + 解析小文件实测 100–250ms，
 * 不需要 C++ 那套 PCH 预处理。fs 直接叠 stdlib（`import sys` 是内建模块，
 * 挂 stdlib 只是让解释器像 runPython 一样正常开机）。
 *
 * 使用前提与 checkCppSyntax 完全一致：运行时必须已加载（`isPythonRuntimeReady()`，
 * 刻意不主动下载 —— 用户没用过 Python 就不该为诊断下 24MB）；每次调用起独立
 * worker，取消由调用方经 onHost 自己管；返回带 `status` 的对象而不是 null，
 * 调用方据 status 决定是补一枪还是收手。
 *
 * @param {string} code
 * @param {{ onHost?: (host: object | null) => void }} [options]
 * @returns {Promise<{ status: string, exitCode?: number, stderr?: string }>}
 */
export async function checkPythonSyntax(code, { onHost } = {}) {
  if (!pythonRuntime) return { status: SYNTAX_STATUS.UNAVAILABLE }
  const fs = {
    ...pythonRuntime.stdlib,
    '/main.py': wasiFile('/main.py', code),
  }

  let timer = 0
  try {
    const result = await runWasi(pythonRuntime.binaryURL, {
      name: 'python',
      args: ['-c', PY_SYNTAX_CHECK_SCRIPT],
      fs,
      onHost: (host) => {
        clearTimeout(timer)
        if (host) {
          timer = setTimeout(() => {
            try {
              host.kill()
            } catch {
              /* 已经跑完或被杀过 */
            }
          }, SYNTAX_TIMEOUT_MS)
        }
        onHost?.(host)
      },
    })
    return { status: SYNTAX_STATUS.SUCCESS, exitCode: result.exitCode, stderr: result.stderr }
  } catch {
    // 解释器被 15s 表掐断 / 压根没起来：这一枪没有结论，但不是「运行时不可用」——
    // 下一枪还能照跑，所以保留旧标记、按 aborted 处理。
    return { status: SYNTAX_STATUS.ABORTED }
  } finally {
    clearTimeout(timer)
  }
}