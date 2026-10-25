#!/usr/bin/env node
/**
 * 阶段 3 的载体：把新内核（LLVM 23.1.0 + wasi-sdk 34 的 `eh` sysroot）当成一套独立
 * 工具链，在 Node 的 WASI 宿主里逐条跑「能力组」与「判定组」，产出一张红绿表。
 *
 * 这个脚本**不碰站内运行时**：`runnoSandbox.js` 一行不动。它回答的是「换内核之后，
 * 站内将会得到什么」，为阶段 2 的接线提供依据（`docs/新内核规划.md` 阶段 3）。
 *
 * 为什么用 Node 宿主而不是浏览器：
 *   - 阶段 2 之前不能把地址换过去（规划 §1 的纪律），而站内那套 `WASIWorkerHost` 又
 *     绑死在 8.0.1 的资产路径上；
 *   - `node:wasi` 直接跑 WASI preview1，并且能读到实例导出 —— `__oj_sbrk_get()` 这个
 *     MLE 第一证据在站内要靠宿主补丁才拿得到，这里直接读；
 *   - 超时由 worker 终止实现（等价看门狗），不会把脚本挂死。
 *   代价：它不是站内那条 runno 宿主。判分码按 `docs/评测判定规范.md` §8 的**规则**推导，
 *   接完线仍要跑 `npm run verify:judge` 复核宿主侧。
 *
 * 编译 / 链接参数与阶段 2 的目标值逐字对齐；`/sys` 用 WASI preopen 挂到解包出来的
 * sysroot 上，所以参数里写的就是站内将来要用的那串路径：
 *   - `-cc1` 直调 + **新标准 exnref** 那组参数（`-triple wasm32-unknown-wasip1`、
 *     `-fexceptions -fcxx-exceptions -exception-model=wasm -target-feature +exception-handling
 *     -target-feature +multivalue -target-feature +reference-types -mllvm -wasm-enable-eh
 *     -mllvm -wasm-use-legacy-eh=false`，外加 `+simd128` / `-fno-rtti`）；
 *   - 链接 `wasm-ld.wasm -flavor wasm`、`crt1-command.o`、`eh/` 目录 + `-lunwind`、
 *     改名后的 builtins；
 *   - 栈按 `docs/评测判定规范.md` §5.3 的公式推导（与站内 `stackSizeBytes` 同式）；
 *   - 链接期塞 sbrk 探针（与站内 `OOM_PROBE_SOURCE` 同源），拿 `memory.grow` 失败次数。
 *
 * 不覆盖：wasm : native 倍率表 —— 那要站内 native 引擎与浏览器口径，另起一支量。
 *
 * 用法：
 *   npm run wasm:core:verify                  # 能力组 + 判定组
 *   npm run wasm:core:verify -- --group=judge
 *   npm run wasm:core:verify -- --case=7,9    # 只跑某几条判定用例
 *   npm run wasm:core:verify -- --case=cap2,cap13,22   # 两组混选
 *   --keep 保留临时目录（解包的 sysroot + 产物），便于手工复跑
 *   --verbose 打印每条用例的原始运行事实
 */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import { brotliDecompressSync } from 'node:zlib'
import { checkOutput } from '../../src/services/checkers.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../..')
const VERSIONS = JSON.parse(await readFile(join(HERE, 'versions.json'), 'utf8'))
const VERSION = VERSIONS.llvm.version
const MAJOR = VERSION.split('.')[0]
const OUT_DIR = join(ROOT, 'tools/wasm-core/out', VERSION)
const CLANG = join(OUT_DIR, 'clang.wasm')
const LLD = join(OUT_DIR, 'wasm-ld.wasm')
const SYSROOT_BR = join(OUT_DIR, 'sys23-fs.tar.br')

/** §9 的统一前提：1 s 时限、256 MiB 内存上限 */
const TIME_LIMIT_MS = 1000
const MEMORY_LIMIT_BYTES = 256 * 1024 * 1024
const COMPILE_TIMEOUT_MS = 60_000
const LINK_TIMEOUT_MS = 60_000
const PAGE_BYTES = 64 * 1024
const MIB = 1024 * 1024
const GRACE_MS = Math.max(100, Math.round(TIME_LIMIT_MS * 0.05))

// ---------------------------------------------------------------- 命令行
const argv = process.argv.slice(2)
let group = 'all'
let keepTemp = false
let verbose = false
let onlyCases = null
let onlyCap = null

for (const arg of argv) {
  if (arg === '--keep') keepTemp = true
  else if (arg === '--verbose') verbose = true
  else if (arg.startsWith('--group=')) group = arg.slice('--group='.length)
  else if (arg.startsWith('--case=')) {
    // 判定组写数字（7,9），能力组写 cap 前缀（cap2,cap12）
    const tokens = arg.slice('--case='.length).split(',').map((t) => t.trim()).filter(Boolean)
    const judge = tokens.filter((t) => /^\d+$/.test(t)).map(Number)
    const cap = tokens.filter((t) => /^cap\d+$/i.test(t)).map((t) => t.slice(3).padStart(2, '0'))
    if (judge.length) onlyCases = new Set(judge)
    if (cap.length) onlyCap = new Set(cap)
  } else if (arg === '--help' || arg === '-h') {
    console.log('用法：node scripts/wasm-core/verify.mjs [--group=capability|judge|all] [--case=7,9|cap2,cap12|cap13,22] [--keep] [--verbose]')
    process.exit(0)
  } else {
    console.error(`未知参数：${arg}`)
    process.exit(2)
  }
}
if (!['all', 'capability', 'judge'].includes(group)) {
  console.error(`--group 只能是 capability / judge / all，收到 ${group}`)
  process.exit(2)
}
// 只给了单组的用例就只跑那一组；两组都给（cap13,22,23,24）就两组都跑
if (onlyCap && onlyCases) group = 'all'
else if (onlyCap) group = 'capability'
else if (onlyCases) group = 'judge'

// ---------------------------------------------------------------- 工作目录
const WORK_ROOT = await mkdtemp(join(tmpdir(), 'wasm-core-verify-'))
const TOOLCHAIN_ROOT = join(WORK_ROOT, 'toolchain')
const WORK_DIR = join(WORK_ROOT, 'work')
const WORKER_PATH = join(WORK_ROOT, 'kernel-worker.mjs')
const SYSROOT = join(TOOLCHAIN_ROOT, 'sys')

await mkdir(TOOLCHAIN_ROOT, { recursive: true })
await mkdir(WORK_DIR, { recursive: true })

const PREOPENS_TOOLCHAIN = { '/sys': SYSROOT, '/work': WORK_DIR }
const PREOPENS_RUN = { '/sys': SYSROOT, '/work': WORK_DIR }

const mib = (bytes) => `${(bytes / MIB).toFixed(1)} MiB`
const pad = (value, width) => String(value).padEnd(width)
const oneLine = (text, max = 160) => {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}
const firstDiagnostic = (text) => oneLine(String(text ?? '').split('\n').find((line) => line.trim()) ?? '')

// ---------------------------------------------------------------- 编译参数
/**
 * cc1 的公共参数 —— 与阶段 2 接线后 `runnoSandbox.js` 的目标值一致。
 * 注意 clang 23 已经不认 `-fmessage-length`（旧 FRONTEND_ARGS 里有）。
 */
const CC1_ARGS = [
  '-cc1',
  '-emit-obj',
  '-disable-free',
  '-triple',
  'wasm32-unknown-wasip1',
  '-isysroot',
  '/sys',
  '-internal-isystem',
  `/sys/include/wasm32-wasip1/eh/c++/v1`,
  '-internal-isystem',
  `/sys/include/wasm32-wasip1`,
  '-internal-isystem',
  `/sys/lib/clang/${MAJOR}/include`,
  '-resource-dir',
  `/sys/lib/clang/${MAJOR}`,
  '-ferror-limit',
  '4',
  '-w',
  '-std=c++20',
  '-O2',
  '-DONLINE_JUDGE',
  // cc1 不认驱动层旗标 `-msimd128`，必须写成 target feature（实测：unknown argument）
  '-target-feature',
  '+simd128',
  '-fno-rtti',
  // `-fwasm-exceptions` 在 cc1 里的展开式：新标准（exnref）+ multivalue + reference-types。
  // 不能停在 legacy —— wasi-sdk 34 的 `eh` libc++ 是 `try_table`/`throw_ref` 编的，
  // 混用会被 V8 在实例化时拒绝（2026-10-25 阶段 2 实测）。
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
]

/** §5.3 的栈公式，与站内 `stackSizeBytes` 同式 */
function stackSizeBytes(memoryLimitBytes) {
  if (!(memoryLimitBytes > 0)) return 8 * MIB
  const cap = Math.min(64 * MIB, Math.max(8 * MIB, memoryLimitBytes / 4), memoryLimitBytes / 2)
  return Math.max(PAGE_BYTES, Math.floor(cap / PAGE_BYTES) * PAGE_BYTES)
}

function linkerArgs(name, memoryLimitBytes) {
  const args = [
    '-flavor',
    'wasm',
    '-L/sys/lib/wasm32-wasip1',
    '-L/sys/lib/wasm32-wasip1/eh',
    '/sys/lib/wasm32-wasip1/crt1-command.o',
    `/work/${name}.o`,
    // sbrk 探针必须排在 -lc 之前，先定义符号，libc.a 里的 sbrk.o 就不会被拉进来
    '/work/oom.o',
    '-lc-printscan-long-double',
    '-lc',
    '-lc++',
    '-lc++abi',
    '-lunwind',
    `/sys/lib/clang/${MAJOR}/lib/wasm32-unknown-wasip1/libclang_rt.builtins.a`,
    '--export=__oj_sbrk_get',
    '-z',
    `stack-size=${stackSizeBytes(memoryLimitBytes)}`,
    '-o',
    `/work/${name}.wasm`,
  ]
  if (memoryLimitBytes > 0) {
    const pages = Math.ceil(memoryLimitBytes / PAGE_BYTES)
    args.push(`--max-memory=${pages * PAGE_BYTES}`)
  }
  return args
}

/**
 * 与 `src/services/runnoSandbox.js` 的 `OOM_PROBE_SOURCE` 同源（那边是浏览器里的唯一出处）。
 * 改动必须两边一起，否则这里量到的 MLE 证据和站内不是一回事。
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

// ---------------------------------------------------------------- 能力组
// 期望 `expectedOutput: null` 表示「只要求编过、跑完」——运行输出记录在案，不作断言。
const CAPABILITY_CASES = [
  {
    id: '01',
    name: 'try-catch',
    note: 'wasm EH：throw int / class / std::exception',
    expectedOutput: 'caught=13',
    code: String.raw`#include <cstdio>
#include <stdexcept>
#include <vector>
struct MyErr { int code; };
int main() {
  int caught = 0;
  try { throw 7; } catch (int e) { caught += e; }
  try { throw MyErr{5}; } catch (const MyErr& e) { caught += e.code; }
  try { std::vector<int> v(5); throw std::out_of_range("boom"); }
  catch (const std::exception&) { caught += 1; }
  std::printf("caught=%d\n", caught);
}`,
  },
  {
    id: '02',
    name: 'regex',
    note: 'std::regex（clang 8 时代是 CE）',
    expectedOutput: '579',
    code: String.raw`#include <cstdio>
#include <regex>
#include <string>
int main() {
  std::string s = "abc 123 def 456";
  std::regex re("([0-9]+)");
  int sum = 0;
  for (auto it = std::sregex_iterator(s.begin(), s.end(), re); it != std::sregex_iterator(); ++it)
    sum += std::stoi(it->str());
  std::printf("%d\n", sum);
}`,
  },
  {
    id: '03',
    name: 'to_chars',
    note: 'to_chars / from_chars',
    expectedOutput: '12345 12345',
    code: String.raw`#include <charconv>
#include <cstdio>
int main() {
  char buf[32];
  auto r = std::to_chars(buf, buf + sizeof buf, 12345);
  *r.ptr = 0;
  int back = 0;
  std::from_chars(buf, r.ptr, back);
  std::printf("%s %d\n", buf, back);
}`,
  },
  {
    id: '04',
    name: 'complex',
    note: 'std::complex',
    expectedOutput: '5',
    code: String.raw`#include <complex>
#include <cstdio>
int main() {
  std::complex<double> z(3, 4);
  std::printf("%.0f\n", std::abs(z));
}`,
  },
  {
    id: '05',
    name: 'filesystem',
    note: 'std::filesystem::current_path（WASI 没有真正的 cwd，只要求编过并跑完）',
    expectedOutput: null,
    code: String.raw`#include <cstdio>
#include <filesystem>
#include <system_error>
int main() {
  std::error_code ec;
  auto p = std::filesystem::current_path(ec);
  if (ec) std::printf("error:%d\n", ec.value());
  else std::printf("%s\n", p.string().c_str());
  return 0;
}`,
  },
  {
    id: '06',
    name: 'random_device',
    note: 'std::random_device + mt19937',
    expectedOutput: '1',
    code: String.raw`#include <cstdio>
#include <random>
int main() {
  std::random_device rd;
  std::mt19937 g(rd());
  std::printf("%u\n", g() ? 1u : 0u);
}`,
  },
  {
    id: '07',
    name: 'long-double',
    note: 'cout << long double：libc++ 20 已正确（HANDOFF §7 里 clang 8 + libc++ 8 会打 0）',
    expectedOutput: '2.5\n2.50',
    code: String.raw`#include <cstdio>
#include <iostream>
int main() {
  long double x = 2.5L;
  std::cout << x << "\n";
  std::printf("%.2Lf\n", x);
}`,
  },
  {
    id: '08',
    name: 'int128',
    note: '__int128',
    expectedOutput: '68719476736',
    code: String.raw`#include <cstdio>
int main() {
  __int128 a = (__int128)1 << 100;
  std::printf("%llu\n", (unsigned long long)(a >> 64));
}`,
  },
  {
    id: '09',
    name: 'powl',
    note: 'powl + 长双精度 printf',
    expectedOutput: '1024',
    code: String.raw`#include <cmath>
#include <cstdio>
int main() { std::printf("%.0Lf\n", powl(2.0L, 10.0L)); }`,
  },
  {
    id: '10',
    name: 'hexfloat',
    note: 'printf("%a")',
    expectedOutput: '0x1.8p+0',
    code: String.raw`#include <cstdio>
int main() { std::printf("%a\n", 1.5); }`,
  },
  {
    id: '11',
    name: 'cxx20-libs',
    note: '<format> / <ranges> / <span> / <numbers>',
    expectedOutput: 'pi=3.14 sum=12',
    code: String.raw`#include <cstdio>
#include <format>
#include <numbers>
#include <ranges>
#include <span>
#include <vector>
int main() {
  std::vector<int> v{1, 2, 3};
  std::span<int> s(v);
  int sum = 0;
  for (int x : s | std::views::transform([](int y) { return y * 2; })) sum += x;
  std::printf("%s sum=%d\n", std::format("pi={:.2f}", std::numbers::pi).c_str(), sum);
}`,
  },
  {
    id: '12',
    name: 'universal-header',
    note: '站内注入的 bits/stdc++.h（新落点 /sys/include/wasm32-wasip1/bits/stdc++.h）',
    expectedOutput: '3',
    code: String.raw`#include <bits/stdc++.h>
int main() {
  std::priority_queue<int> q;
  q.push(1);
  q.push(3);
  std::cout << q.top() << "\n";
}`,
  },
  {
    id: '13',
    name: 'simd128',
    note: '-msimd128（cc1 走 -target-feature +simd128）：模块真带 SIMD 才能编译并跑通',
    expectedOutput: '11 22 33 44',
    code: String.raw`#include <cstdio>
#include <wasm_simd128.h>
int main() {
  v128_t a = wasm_i32x4_make(1, 2, 3, 4);
  v128_t b = wasm_i32x4_make(10, 20, 30, 40);
  v128_t c = wasm_i32x4_add(a, b);
  std::printf("%d %d %d %d\n", wasm_i32x4_extract_lane(c, 0), wasm_i32x4_extract_lane(c, 1),
              wasm_i32x4_extract_lane(c, 2), wasm_i32x4_extract_lane(c, 3));
}`,
  },
]

// ---------------------------------------------------------------- 判定组
// 1–21 与 scripts/verify-judge.mjs 的用例同源（§9）。那边跑的是站内 runno 宿主，
// 这里跑的是新内核 + Node 宿主；两边期望值应一致，不一致就是换内核带来的语义变化。
// 22–23 是开异常档（23.1.0）才成立的两条：`new` 失败会抛 bad_alloc，判据仍按
// 「内存上限直接导致终止」——未捕获 → 134 + sbrk>0 → MLE；catch 后正常退出 → 按结果判。
const JUDGE_CASES = [
  {
    n: 1,
    note: '基线 AC',
    expect: 'AC',
    expected: '1',
    code: String.raw`#include <cstdio>
int main() { std::printf("1\n"); }`,
  },
  {
    n: 2,
    note: '基线 WA',
    expect: 'WA',
    expected: '1',
    code: String.raw`#include <cstdio>
int main() { std::printf("2\n"); }`,
  },
  {
    n: 3,
    note: '少一个分号 → CE',
    expect: 'CE',
    expected: '',
    code: String.raw`#include <cstdio>
int main() { int x = 1 }`,
  },
  {
    n: 4,
    note: '死循环 → TLE',
    expect: 'TLE',
    expected: '',
    code: String.raw`int main() { while (true) {} }`,
  },
  {
    n: 5,
    note: '真实分配并写满 → 分配失败 → MLE',
    expect: 'MLE',
    expected: '',
    code: String.raw`#include <cstdlib>
int main() {
  // 逐块 malloc + 真实写满，分配失败就 abort；sbrk 探针记下 memory.grow 失败次数 > 0，
  // 这才是 MLE 的证据（判定规范 §5.2）。
  // 写必须是 volatile：clang 23 在 -O2 下能看出 memset 后只读回一个恒为 1 的字节，
  // 把 malloc + memset 整段删掉，循环退化成空转 → TLE（实测，LLVM 8 没这么狠）。
  const unsigned long chunk = 16ul << 20;
  for (;;) {
    char* p = (char*)std::malloc(chunk);
    if (!p) std::abort();
    volatile char* vp = (volatile char*)p;
    for (unsigned long i = 0; i < chunk; i += 4096) vp[i] = 1;
  }
}`,
  },
  {
    n: 6,
    note: '分配大 vector 但只打印 size',
    expect: 'AC',
    expected: '268435456',
    code: String.raw`#include <cstdio>
#include <vector>
int main() {
  std::vector<int> v(1 << 28);
  std::printf("%zu\n", v.size());
}`,
  },
  {
    n: 7,
    note: '空指针写入 → RE（134 但分配没失败过）',
    expect: 'RE',
    expected: '',
    code: String.raw`int main() {
  int* p = nullptr;
  *p = 1;
  return 0;
}`,
  },
  {
    n: 8,
    note: '运行期除零 → RE',
    expect: 'RE',
    expected: '',
    // ⚠️ 两个操作数都必须来自运行期：常量被除数会被 clang 改写成不陷阱的 select
    code: String.raw`#include <cstdio>
int main() {
  volatile int a = 1;
  volatile int b = 0;
  std::printf("%d\n", a / b);
  return 0;
}`,
  },
  {
    n: 9,
    note: 'abort() → RE（134 但分配没失败过）',
    expect: 'RE',
    expected: '',
    code: String.raw`#include <cstdlib>
int main() { std::abort(); }`,
  },
  {
    n: 10,
    note: 'assert(false) → RE',
    expect: 'RE',
    expected: '',
    code: String.raw`#include <cassert>
int main() { assert(false); }`,
  },
  {
    n: 11,
    note: '深递归耗尽栈 → RE（不是 MLE）',
    expect: 'RE',
    expected: '',
    code: String.raw`#include <cstdio>
int dive(int depth) {
  volatile char pad[4096];
  pad[0] = (char)depth;
  if (depth == 0) return pad[0];
  return dive(depth + 1) + pad[0];
}
int main() { std::printf("%d\n", dive(1)); }`,
  },
  {
    n: 12,
    note: '输出正确但 return 3 → RE',
    expect: 'RE',
    expected: '1',
    code: String.raw`#include <cstdio>
int main() {
  std::printf("1\n");
  return 3;
}`,
  },
  {
    n: 13,
    note: '末尾空行不重要 → AC',
    expect: 'AC',
    expected: '1',
    code: String.raw`#include <cstdio>
int main() { std::printf("1\n\n"); }`,
  },
  {
    n: 14,
    note: '行尾空白不重要 → AC',
    expect: 'AC',
    expected: '1\n',
    code: String.raw`#include <cstdio>
int main() { std::printf("1   \n\n"); }`,
  },
  {
    n: 15,
    note: '行首空白敏感 → WA',
    expect: 'WA',
    expected: '1',
    code: String.raw`#include <cstdio>
int main() { std::printf(" 1\n"); }`,
  },
  {
    n: 16,
    note: '空对空 → AC',
    expect: 'AC',
    expected: '',
    code: String.raw`int main() { return 0; }`,
  },
  {
    n: 17,
    note: '#ifdef ONLINE_JUDGE → AC',
    expect: 'AC',
    expected: '1',
    code: String.raw`#include <cstdio>
int main() {
#ifdef ONLINE_JUDGE
  std::printf("1\n");
#else
  std::printf("2\n");
#endif
}`,
  },
  {
    n: 18,
    note: 'malloc(1 GiB) 返回 NULL 后正常退出 → AC',
    expect: 'AC',
    expected: '1',
    // 指针必须 volatile：clang 默认 malloc 非空，非 volatile 时 if (!p) 连分配一起被删
    code: String.raw`#include <cstdio>
#include <cstdlib>
int main() {
  void* volatile p = std::malloc(1ull << 30);
  if (!p) {
    std::printf("1\n");
    return 0;
  }
  std::free(p);
  std::printf("2\n");
  return 0;
}`,
  },
  {
    n: 19,
    note: 'malloc(1 GiB) 返回 NULL 后 return 1 → RE',
    expect: 'RE',
    expected: '',
    code: String.raw`#include <cstdlib>
int main() {
  void* volatile p = std::malloc(1ull << 30);
  if (!p) return 1;
  std::free(p);
  return 0;
}`,
  },
  {
    n: 20,
    note: '无限打印（v1 无 OLE，不判）',
    expect: '',
    expected: '',
    skip: true,
    code: '',
  },
  {
    n: 21,
    note: '先成功分配大内存，再越界写 → RE（越界不算 MLE）',
    expect: 'RE',
    expected: '',
    code: String.raw`#include <cstring>
int main() {
  char* p = new char[64ul << 20];
  std::memset(p, 1, 64ul << 20);
  volatile char* far = (volatile char*)(p + (512ul << 20));
  *far = 1;
  return 0;
}`,
  },
  {
    n: 22,
    note: 'new 连到底、bad_alloc 未捕获 → MLE（仅开异常档；旧档这条会 TLE）',
    expect: 'MLE',
    expected: '',
    code: String.raw`#include <cstddef>
#include <new>
int main() {
  const unsigned long chunk = 16ul << 20;
  for (;;) {
    volatile char* p = (volatile char*)::operator new(chunk);
    for (unsigned long i = 0; i < chunk; i += 4096) p[i] = 1;
  }
}`,
  },
  {
    n: 23,
    note: 'catch bad_alloc 后正常退出 → AC（仅开异常档；内存上限没有直接终止进程）',
    expect: 'AC',
    expected: 'caught',
    code: String.raw`#include <cstdio>
#include <new>
int main() {
  try {
    const unsigned long chunk = 16ul << 20;
    for (;;) {
      volatile char* p = (volatile char*)::operator new(chunk);
      for (unsigned long i = 0; i < chunk; i += 4096) p[i] = 1;
    }
  } catch (const std::bad_alloc&) {
    std::printf("caught\n");
  }
  return 0;
}`,
  },
  {
    n: 24,
    note: 'dynamic_cast → CE（仅 23 档；-fno-rtti 的用户可见代价）',
    expect: 'CE',
    expected: '',
    code: String.raw`#include <cstdio>
struct B { virtual ~B() = default; };
struct D : B { int x = 1; };
int main() {
  B* b = new D();
  if (dynamic_cast<D*>(b)) std::printf("d\n");
}`,
  },
]

// ---------------------------------------------------------------- WASI worker
// 一个文件两种模式：
//   - 常驻（工具链）：缓存 WebAssembly.Module，逐条处理 cc1 / 链接；
//   - 一次性（用户程序）：跑完即弃，父进程超时就 terminate（等价看门狗）。
const WORKER_SOURCE = String.raw`
import { parentPort, workerData } from 'node:worker_threads'
import { readFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import { WASI } from 'node:wasi'

const modules = new Map()
// 常驻模式：挂载点在 workerData 里给一次；一次性模式：每个 job 自带
const defaultPreopens = (workerData && workerData.preopens) || {}

async function loadModule(file) {
  let mod = modules.get(file)
  if (!mod) {
    mod = await WebAssembly.compile(await readFile(file))
    modules.set(file, mod)
  }
  return mod
}

function invoke(mod, job) {
  const chunks = { 1: [], 2: [] }
  const cap = job.cap || 1048576
  let captured = 0
  let truncated = false
  let instance = null
  const stdinBuf = Buffer.from(job.stdin || '', 'utf8')
  let stdinOffset = 0

  const fdWrite = (fd, iovsPtr, iovsLen, nwrittenPtr) => {
    // 只截获 stdout / stderr；编译器的 -o 走别的 fd，必须原样交回宿主，
    // 否则对象文件会被「捕获」成 0 字节（踩过：wasm-ld 报 unknown file type）。
    if (fd !== 1 && fd !== 2) return wasi.wasiImport.fd_write(fd, iovsPtr, iovsLen, nwrittenPtr)
    const view = new DataView(instance.exports.memory.buffer)
    let total = 0
    for (let i = 0; i < iovsLen; i++) {
      const ptr = view.getUint32(iovsPtr + i * 8, true)
      const len = view.getUint32(iovsPtr + i * 8 + 4, true)
      if ((fd === 1 || fd === 2) && captured < cap) {
        const n = Math.min(len, cap - captured)
        chunks[fd].push(Buffer.from(new Uint8Array(instance.exports.memory.buffer, ptr, n)))
        captured += n
        if (n < len) truncated = true
      }
      total += len
    }
    view.setUint32(nwrittenPtr, total, true)
    return 0
  }

  const fdRead = (fd, iovsPtr, iovsLen, nreadPtr) => {
    // 同上：只有 stdin 由我们喂数据，其它 fd 交回宿主
    if (fd !== 0) return wasi.wasiImport.fd_read(fd, iovsPtr, iovsLen, nreadPtr)
    const view = new DataView(instance.exports.memory.buffer)
    let total = 0
    for (let i = 0; i < iovsLen; i++) {
      const ptr = view.getUint32(iovsPtr + i * 8, true)
      const len = view.getUint32(iovsPtr + i * 8 + 4, true)
      const n = Math.min(len, stdinBuf.length - stdinOffset)
      if (n > 0) {
        new Uint8Array(instance.exports.memory.buffer, ptr, n).set(stdinBuf.subarray(stdinOffset, stdinOffset + n))
        stdinOffset += n
      }
      total += n
      if (n < len) break
    }
    view.setUint32(nreadPtr, total, true)
    return 0
  }

  const wasi = new WASI({
    version: 'preview1',
    args: job.argv || [],
    env: {},
    preopens: job.preopens || defaultPreopens,
    returnOnExit: true,
  })
  const imports = {
    wasi_snapshot_preview1: { ...wasi.wasiImport, fd_write: fdWrite, fd_read: fdRead },
  }
  instance = new WebAssembly.Instance(mod, imports)
  const started = performance.now()
  let exitCode = null
  let trap = null
  try {
    exitCode = wasi.start(instance)
  } catch (error) {
    trap = String((error && error.message) || error)
  }
  const ms = performance.now() - started
  const sbrk = instance.exports.__oj_sbrk_get
  return {
    ok: true,
    exitCode: exitCode,
    trap: trap,
    ms: Math.round(ms * 1000) / 1000,
    stdout: Buffer.concat(chunks[1]).toString('utf8'),
    stderr: Buffer.concat(chunks[2]).toString('utf8'),
    truncated: truncated,
    memoryBytes: instance.exports.memory ? instance.exports.memory.buffer.byteLength : 0,
    sbrkFailures: typeof sbrk === 'function' ? sbrk() | 0 : null,
  }
}

async function handle(job) {
  try {
    const mod = await loadModule(job.tool)
    const result = invoke(mod, job)
    result.id = job.id
    return result
  } catch (error) {
    return { id: job.id, ok: false, error: String((error && error.stack) || error) }
  }
}

if (workerData && workerData.oneShot) {
  handle(workerData).then((result) => parentPort.postMessage(result))
} else {
  parentPort.on('message', (job) => {
    handle(job).then((result) => parentPort.postMessage(result))
  })
}
`

await writeFile(WORKER_PATH, WORKER_SOURCE)

// ---------------------------------------------------------------- worker 调度
let toolWorker = null
const pending = new Map()
let nextId = 0
let queue = Promise.resolve()

function spawnToolWorker() {
  const worker = new Worker(WORKER_PATH, {
    workerData: { preopens: PREOPENS_TOOLCHAIN },
    execArgv: ['--no-warnings'],
  })
  worker.on('message', (msg) => {
    const job = pending.get(msg.id)
    if (!job) return
    pending.delete(msg.id)
    clearTimeout(job.timer)
    job.resolve(msg)
  })
  const failAll = (reason) => {
    for (const [id, job] of pending) {
      pending.delete(id)
      clearTimeout(job.timer)
      job.resolve({ id, ok: false, error: reason })
    }
    if (toolWorker === worker) toolWorker = null
  }
  worker.on('error', (error) => {
    if (worker !== toolWorker) return
    failAll(String((error && error.stack) || error))
  })
  worker.on('exit', (code) => {
    // 主动退休的旧 worker 也会走到这里；它身上没有未完成的任务，别去牵连新 worker 的
    if (worker !== toolWorker) return
    failAll(`toolchain worker 退出 code=${code}`)
  })
  return worker
}

/** 串行调用常驻 worker（模块只编译一次）；超时就杀掉，下一次调用重新拉起 */
function callTool(job, timeoutMs) {
  const task = queue.then(
    () =>
      new Promise((resolveJob) => {
        if (!toolWorker) toolWorker = spawnToolWorker()
        const id = ++nextId
        const timer = setTimeout(() => {
          pending.delete(id)
          const worker = toolWorker
          toolWorker = null
          if (worker) worker.terminate()
          resolveJob({ id, ok: false, timedOut: true })
        }, timeoutMs)
        pending.set(id, { id, resolve: resolveJob, timer })
        toolWorker.postMessage({ id, ...job })
      }),
  )
  queue = task.then(
    () => undefined,
    () => undefined,
  )
  return task
}

/**
 * 每条用例跑完就丢掉常驻 worker。
 * 每次 cc1 / 链接都是一颗新的 wasm 实例，堆峰值可到 GB 级，而 worker 里没法主动 GC
 * （Worker 不接受 --expose-gc）。十几次重编译叠起来会吃穿物理内存，下一次内存增长
 * 直接 SIGSEGV 而不是干净的 trap（实测：cap11 + cap12 连跑必崩，单独跑都过）。
 * 重开一颗的代价只有重新编译模块（clang.wasm 实测 64 ms）。
 */
function retireToolWorker() {
  if (!toolWorker) return
  const worker = toolWorker
  toolWorker = null
  worker.terminate()
}

/** 一次性的用户程序 worker：超时直接 terminate */function runProgram(job, timeoutMs) {
  return new Promise((resolveJob) => {
    const worker = new Worker(WORKER_PATH, {
      workerData: { oneShot: true, id: 0, ...job },
      execArgv: ['--no-warnings'],
    })
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      worker.terminate()
      resolveJob(value)
    }
    const timer = setTimeout(() => finish({ ok: false, timedOut: true }), timeoutMs)
    worker.once('message', (msg) => finish(msg))
    worker.once('error', (error) => finish({ ok: false, error: String((error && error.stack) || error) }))
    worker.once('exit', (code) => finish({ ok: false, error: `run worker 退出 code=${code}` }))
  })
}

// ---------------------------------------------------------------- 构建与判定
async function buildCase(name, code, memoryLimitBytes) {
  const source = `/work/${name}.cpp`
  await writeFile(join(WORK_DIR, `${name}.cpp`), code)

  const compile = await callTool(
    {
      tool: CLANG,
      argv: ['clang', ...CC1_ARGS, '-o', `/work/${name}.o`, '-x', 'c++', source],
      stdin: '',
      cap: 256 * 1024,
    },
    COMPILE_TIMEOUT_MS,
  )
  if (!compile.ok) {
    return { stage: 'ce', detail: compile.timedOut ? '编译超时（60 s）' : oneLine(compile.error) }
  }
  if (compile.exitCode !== 0) {
    return { stage: 'ce', detail: firstDiagnostic(compile.stderr || compile.stdout) || `编译器返回 ${compile.exitCode}` }
  }

  const link = await callTool(
    {
      tool: LLD,
      argv: ['wasm-ld', ...linkerArgs(name, memoryLimitBytes)],
      stdin: '',
      cap: 256 * 1024,
    },
    LINK_TIMEOUT_MS,
  )
  if (!link.ok) {
    return { stage: 'ce', compileMs: compile.ms, detail: link.timedOut ? '链接超时（60 s）' : oneLine(link.error) }
  }
  if (link.exitCode !== 0) {
    return {
      stage: 'ce',
      compileMs: compile.ms,
      detail: firstDiagnostic(link.stderr || link.stdout) || `链接器返回 ${link.exitCode}`,
    }
  }
  return { stage: 'ok', compileMs: compile.ms, linkMs: link.ms }
}

async function execute(name, timeLimitMs) {
  return runProgram(
    {
      tool: join(WORK_DIR, `${name}.wasm`),
      argv: [`/work/${name}.wasm`],
      stdin: '',
      preopens: PREOPENS_RUN,
      cap: 1024 * 1024,
    },
    timeLimitMs + GRACE_MS + 1000,
  )
}

/**
 * outcome → verdict，按 `docs/评测判定规范.md` §8：
 * - 看门狗 kill 或运行段 > 时限 → TLE；
 * - exit 0 且无 trap → 进入比对；
 * - 134 / trap 时，sbrk 失败次数 > 0 才是 MLE，否则 RE（拿不到计数就退回 134 + stderr 空）。
 */
function verdictOf(run, expected) {
  if (run.timedOut) return 'TLE'
  if (!run.ok) return 'ERR'
  if (run.ms > TIME_LIMIT_MS) return 'TLE'
  if (run.trap === null && run.exitCode === 0) {
    return checkOutput(run.stdout, expected, 'lines') ? 'AC' : 'WA'
  }
  const code = run.exitCode
  if (code === 134 || run.trap !== null) {
    if (typeof run.sbrkFailures === 'number') return run.sbrkFailures > 0 ? 'MLE' : 'RE'
    return (run.stderr || '').trim() ? 'RE' : 'MLE'
  }
  return 'RE'
}

function runFacts(run) {
  if (!run) return ''
  if (!run.ok) return run.timedOut ? 'watchdog kill' : `宿主错误：${oneLine(run.error)}`
  const bits = [run.exitCode === null ? 'trap' : `exit ${run.exitCode}`]
  if (run.trap) bits.push(`trap=${oneLine(run.trap, 48)}`)
  bits.push(`sbrk=${run.sbrkFailures === null ? '—' : run.sbrkFailures}`)
  bits.push(`mem=${mib(run.memoryBytes)}`)
  bits.push(`运 ${run.ms.toFixed(0)}ms`)
  if (run.truncated) bits.push('输出截断')
  return bits.join(' · ')
}

// ---------------------------------------------------------------- 准备
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

async function extractSysroot() {
  const tarPath = join(TOOLCHAIN_ROOT, 'sysroot.tar')
  await writeFile(tarPath, brotliDecompressSync(await readFile(SYSROOT_BR)))
  const res = spawnSync('tar', ['-xf', tarPath, '-C', TOOLCHAIN_ROOT], { stdio: ['ignore', 'inherit', 'inherit'] })
  if (res.status !== 0) throw new Error(`解包 sysroot 失败（tar 退出 ${res.status}）`)
  await rm(tarPath, { force: true })
  if (!existsSync(join(SYSROOT, 'lib/wasm32-wasip1/crt1-command.o'))) {
    throw new Error('解包结果里缺 crt1-command.o —— sys23-fs.tar.br 不是预期的布局')
  }
}

/**
 * 站内的万能头由运行时注入，不进 sysroot 包。这里从 `runnoSandbox.js` 里取同一份
 * （避免两处维护），写到新落点，顺便验证阶段 2 要用的路径。
 */
async function installUniversalHeader() {
  const source = await readFile(join(ROOT, 'src/services/runnoSandbox.js'), 'utf8')
  const match = source.match(/const UNIVERSAL_HEADER = `([\s\S]*?)`\r?\n/)
  if (!match || match[1].includes('${')) {
    console.log('⚠ 没能从 runnoSandbox.js 取出 UNIVERSAL_HEADER（模板里可能有插值），跳过万能头用例')
    return false
  }
  const dir = join(SYSROOT, 'include/wasm32-wasip1/bits')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'stdc++.h'), match[1])
  return true
}

// ---------------------------------------------------------------- 主流程
let exitCode = 0

async function main() {
  for (const [label, file] of [
    ['clang.wasm', CLANG],
    ['wasm-ld.wasm', LLD],
    ['sys23-fs.tar.br', SYSROOT_BR],
  ]) {
    if (!existsSync(file)) {
      throw new Error(`缺 ${label}（${file}），先跑 npm run wasm:core:build && npm run wasm:core:pack`)
    }
  }

  console.log(`新内核验收 · LLVM ${VERSION} + wasi-sdk ${VERSIONS.wasiSdk.version} · node ${process.version}`)
  console.log(
    `物料  ${mib((await stat(CLANG)).size)} clang.wasm · ${mib((await stat(LLD)).size)} wasm-ld.wasm · ` +
      `${mib((await stat(SYSROOT_BR)).size)} sys23-fs.tar.br`,
  )

  console.log('▶ 解包 sys23-fs.tar.br')
  await extractSysroot()
  const sysSize = await fsSize(SYSROOT)
  console.log(`  sysroot ${mib(sysSize.bytes)} / ${sysSize.entries} 条（挂到 /sys）`)
  const hasUniversalHeader = await installUniversalHeader()

  const smoke = await callTool({ tool: CLANG, argv: ['clang', '--version'], stdin: '', cap: 8192 }, COMPILE_TIMEOUT_MS)
  if (!smoke.ok || smoke.exitCode !== 0) {
    throw new Error(`clang.wasm 冒烟失败：${oneLine(smoke.error || smoke.stderr || '无输出')}`)
  }
  console.log(`▶ 内核冒烟：${oneLine(smoke.stdout)}`)

  const probeSource = '/work/oom.cpp'
  await writeFile(join(WORK_DIR, 'oom.cpp'), OOM_PROBE_SOURCE)
  const probe = await callTool(
    {
      tool: CLANG,
      argv: ['clang', ...CC1_ARGS, '-o', '/work/oom.o', '-x', 'c++', probeSource],
      stdin: '',
      cap: 64 * 1024,
    },
    COMPILE_TIMEOUT_MS,
  )
  if (!probe.ok || probe.exitCode !== 0) {
    throw new Error(`sbrk 探针编译失败：${oneLine(probe.error || probe.stderr || probe.stdout || '无输出')}`)
  }
  console.log('▶ sbrk 探针就绪（__oj_sbrk_get）')

  if (verbose) {
    console.log('\ncc1 参数：')
    console.log('  ' + CC1_ARGS.join(' '))
    console.log('链接参数（1 s / 256 MiB 口径）：')
    console.log('  ' + ['wasm-ld', ...linkerArgs('caseN', MEMORY_LIMIT_BYTES)].join(' '))
  }

  // ---- 能力组
  if (group !== 'judge') {
    console.log('\n能力组（C++20 + wasm EH）')
    const capCases = onlyCap ? CAPABILITY_CASES.filter((tc) => onlyCap.has(tc.id)) : CAPABILITY_CASES
    if (!capCases.length) throw new Error(`--case 没匹配到任何能力用例：${[...(onlyCap ?? [])].join(',')}`)
    let pass = 0
    let fail = 0
    for (const tc of capCases) {
      if (tc.id === '12' && !hasUniversalHeader) {
        console.log('  SKIP  12 universal-header   未注入万能头')
        continue
      }
      const build = await buildCase(`cap${tc.id}`, tc.code, 0)
      let tag = 'FAIL'
      let detail = ''

      if (build.stage === 'ce') {
        detail = `CE：${build.detail}`
      } else {
        const run = await execute(`cap${tc.id}`, COMPILE_TIMEOUT_MS)
        if (!run.ok) {
          detail = run.timedOut ? '运行超时' : `宿主错误：${oneLine(run.error)}`
        } else if (run.trap !== null || run.exitCode !== 0) {
          detail = `${runFacts(run)}${run.stderr ? `　${oneLine(run.stderr, 80)}` : ''}`
        } else {
          const out = run.stdout.trim()
          const matched = tc.expectedOutput === null || checkOutput(run.stdout, tc.expectedOutput, 'lines')
          if (matched) {
            tag = 'PASS'
            detail = run.stdout.trim() ? `→ ${oneLine(out, 60)}` : '→（无输出）'
          } else {
            detail = `got ${oneLine(out, 60) || '（空）'}，want ${oneLine(tc.expectedOutput, 60)}`
          }
        }
      }

      if (tag === 'PASS') pass++
      else {
        fail++
        exitCode = 1
      }
      const timing = build.stage === 'ce' ? '' : `编 ${build.compileMs.toFixed(0)}ms · 链 ${build.linkMs.toFixed(0)}ms · `
      console.log(`  ${tag.padEnd(5)} ${tc.id} ${pad(tc.name, 17)} ${timing}${detail}${verbose ? `　[${tc.note}]` : ''}`)
      retireToolWorker()
    }
    console.log(`  小结：PASS ${pass} / FAIL ${fail}`)
  }

  // ---- 判定组
  if (group !== 'capability') {
    const cases = onlyCases ? JUDGE_CASES.filter((tc) => onlyCases.has(tc.n)) : JUDGE_CASES
    if (!cases.length) throw new Error(`--case 没匹配到任何用例：${[...(onlyCases ?? [])].join(',')}`)

    console.log(`\n判定组（§9 / ${MEMORY_LIMIT_BYTES / MIB} MiB / ${TIME_LIMIT_MS} ms，栈 ${stackSizeBytes(MEMORY_LIMIT_BYTES) / MIB} MiB）`)
    console.log('  宿主 = node:wasi（不是站内 runno）；判分码按规范 §8 的规则推导')

    let pass = 0
    let known = 0
    let fail = 0
    let skipped = 0

    for (const tc of cases) {
      if (tc.skip) {
        skipped++
        console.log(`  SKIP  #${pad(tc.n, 3)} ${tc.note}`)
        continue
      }

      const name = `case${tc.n}`
      const build = await buildCase(name, tc.code, MEMORY_LIMIT_BYTES)
      let actual
      let run = null

      if (build.stage === 'ce') {
        actual = 'CE'
      } else {
        run = await execute(name, TIME_LIMIT_MS)
        actual = verdictOf(run, tc.expected)
      }

      let tag = 'FAIL'
      if (actual === tc.expect) tag = 'PASS'
      else if (tc.knownActual && actual === tc.knownActual) tag = 'KNOWN'
      else exitCode = 1

      if (tag === 'PASS') pass++
      else if (tag === 'KNOWN') known++
      else fail++

      const timing =
        build.stage === 'ce'
          ? ''
          : `编 ${build.compileMs.toFixed(0)}ms · 链 ${build.linkMs.toFixed(0)}ms · `
      const facts = build.stage === 'ce' ? `CE：${build.detail}` : runFacts(run)
      console.log(
        `  ${tag.padEnd(5)} #${pad(tc.n, 3)} ${pad(tc.expect, 4)} → ${pad(actual, 4)} ${timing}${facts}　${tc.note}`,
      )
      if (verbose && run?.ok) {
        const out = oneLine(run.stdout, 120)
        const err = oneLine(run.stderr, 120)
        if (out) console.log(`         stdout: ${out}`)
        if (err) console.log(`         stderr: ${err}`)
      }
      retireToolWorker()
    }

    const total = pass + known + fail
    console.log(`\n合计 ${total} 条：PASS ${pass} / KNOWN ${known} / FAIL ${fail}` + (skipped ? `（另 SKIP ${skipped}）` : ''))
  }
}

try {
  await main()
} catch (error) {
  console.error(`\n✗ ${(error && error.message) || error}`)
  if (verbose && error?.stack) console.error(error.stack)
  exitCode = 1
} finally {
  if (toolWorker) await toolWorker.terminate()
  if (keepTemp) console.log(`\n临时目录保留：${WORK_ROOT}`)
  else await rm(WORK_ROOT, { recursive: true, force: true })
}

process.exit(exitCode)
