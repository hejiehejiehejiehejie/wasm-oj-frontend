/**
 * 判定规范 §9 的自动验收 —— 在真实浏览器里跑真实 WASM 沙箱，逐条核对判定码。
 *
 * 与 verify-ui.mjs 的分工：
 *   - verify-ui 走界面（点按钮、读卡片），守「流程与渲染」；
 *   - 这里直接调 runner 的 evaluateCase（仍是真引擎、真工具链、真 watchdog），
 *     守「判定语义」。20 条用例里大半要在 1s 时限 / 256 MiB 上限下触发 TLE / MLE / RE，
 *     从界面驱动既慢又容易被卡片动画干扰。
 *
 * 已知偏差（docs/评测判定规范.md §10）在表里显式标成 `knownActual`：
 * 实际值与它一致算「已知」而不是「失败」；出现别的值才是回归。
 * 目前只剩 #6（-O2 把「分配后不用」整段删掉）一条。
 *
 * 用法：npm run verify:judge
 * 前置：本机有 Chrome；首次跑要下载 C++ 工具链（约 50MB）并生成 PCH，会比较慢。
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import puppeteer from 'puppeteer-core'

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
]
const CHROME = process.env.CHROME_PATH ?? CHROME_CANDIDATES[0]
const ROOT = new URL('../', import.meta.url).pathname

/** §9 的统一前提：WASM 引擎、1 s 时限、256 MiB 内存上限 */
const TIME_LIMIT_MS = 1000
const MEMORY_LIMIT_BYTES = 256 * 1024 * 1024

// ---------------------------------------------------------------- 用例表
// code 一律用 String.raw，让 C++ 里的 \n 保持字面量（普通模板字符串会把它变成换行）。
const CASES = [
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
    code: String.raw`#include <cstdio>
#include <cstdlib>
int main() {
  // 逐块 malloc + 真实写满，分配失败就 abort → trap 134；链接期探针（runnoSandbox 的
  // OOM_PROBE_SOURCE）记下 memory.grow 失败次数 > 0，这才是 MLE 的证据（判定规范 §5.2）。
  // ⚠️ 写必须落到 volatile 指针、并且逐页写：clang 23 在 -O2 下能看出「memset 之后只读回
  // 最后一个字节」，把整段 memset（乃至分配）删掉，循环退化成空转 → TLE（2026-10-25 实测，
  // 换内核前 clang 8 不会）。这和 scripts/wasm-core/verify.mjs 的 #5 是同一份写法。
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
    note: '分配大 vector 但只打印 size → 已知假阴性 AC',
    expect: 'AC',
    expected: '268435456',
    code: String.raw`#include <cstdio>
#include <vector>
int main() {
  std::vector<int> v(1 << 28);
  std::printf("%zu\n", v.size());
}`,
    knownActual: 'AC',
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
    note: '运行期除零 → RE（134 但分配没失败过）',
    expect: 'RE',
    expected: '',
    // ⚠️ 不能写 `1 / z`：被除数是常量时 clang 会把它改写成不陷阱的 select
    // （实测 z=0 直接得 0、exit 0），那测的就不是除零了。两个操作数都由 volatile 给出，
    // 才会落成真的 `i32.div_s` → trap。
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
    // ⚠️ 指针必须是 volatile：clang 把 `malloc` 当已知库函数、默认返回非空，
    // 非 volatile 时 `if (!p)` 会被整段删掉，连分配本身都消失（host clang 21 /
    // 站内 clang 8 都实测如此）。volatile 强制保留真实返回值与判空分支。
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
    n: 21,
    note: '先成功分配大内存，再越界写 → RE（越界不算 MLE）',
    expect: 'RE',
    expected: '',
    code: String.raw`#include <cstring>
int main() {
  // 分配成功（sbrk 没有失败过），随后写到远超 --max-memory 的地址：
  // 同样是 trap 134，但没有内存证据，按 §2.1「空指针 / 越界 → RE」。
  char* p = new char[64ul << 20];
  std::memset(p, 1, 64ul << 20);
  volatile char* far = (volatile char*)(p + (512ul << 20));
  *far = 1;
  return 0;
}`,
  },
]

/** 比对器的语义（不经过引擎，直接在页面里算） */
const CHECKER_CASES = [
  { id: 'lines', actual: '1\n2\n', expected: '1\n2\n', want: true },
  { id: 'lines', actual: '1   \n2\n\n', expected: '1\n2', want: true },
  { id: 'lines', actual: ' 1', expected: '1', want: false },
  // strict（2026-11-09 加）：只抹平换行符，其余一个字符都不放过
  { id: 'strict', actual: '1\n2\n', expected: '1\n2\n', want: true },
  { id: 'strict', actual: '1 2\r\n3\r\n', expected: '1 2\n3\n', want: true },
  { id: 'strict', actual: '1 2 \n3', expected: '1 2\n3', want: false },
  { id: 'strict', actual: '1\n2\n\n', expected: '1\n2', want: false },
  { id: 'strict', actual: '12', expected: '1 2', want: false },
  { id: 'tokens', actual: '1 2\n3', expected: '1\n2\n3', want: true },
  { id: 'tokens', actual: ' 1  2 ', expected: '1 2', want: true },
  { id: 'tokens', actual: '12', expected: '1 2', want: false },
  { id: 'float', actual: '3.1415926', expected: '3.14159265', want: true },
  { id: 'float', actual: '1e-7 0', expected: '0 0', want: true },
  { id: 'float', actual: '1.0 2', expected: '1.1 2', want: false },
  { id: 'unordered', actual: '3\n1\n2', expected: '1\n2\n3', want: true },
  { id: 'unordered', actual: '1\n1\n2', expected: '1\n2\n2', want: false },
  { id: 'not-a-checker', actual: '1', expected: '1', want: true },
]

/**
 * 差异块（services/outputDiff.js）：`want` 是第一条差异的类型，`null` 表示「等价、不该有差异块」。
 *
 * 这里守两条不变量，比单看某条文案重要：
 * ① 判定说 WA 的地方，差异必须说得出「差在哪」；
 * ② 判定说 AC 的地方，**绝不能**冒出差异（否则卡片会指着一模一样的两段文本说「不同」）。
 * 第 ② 条由上面那批 CHECKER_CASES 全量交叉验（见下面「比对器 ↔ 差异」那一段）。
 */
// `want` = 首条差异的类型（null = 这个口径下应当没有差异）；
// `markText` = 框内高亮应当覆盖的**原文**片段（空串 = 不该高亮）；
// `entryCount` = 条目数（不给就不查）。
//
// `markText` 专盯 `marks` 的偏移是否落在原文上：`lines` / `strict` / `unordered` 一旦拿
// 归一化之后的下标去切原文，实际输出里只要有一个 `\r`，高亮就会往前错一位。
// `entryCount` 盯的是对齐策略：行**只按行号配**（`positionalOps`），所以「期望 3 行、
// 实际只有 1 行 2」必须给 3 条（第 1 行不一致 + 缺第 2、3 行），而不是 LCS 的 2 条「缺 1、缺 3」。
const DIFF_CASES = [
  { id: 'lines', actual: '1 2\n4', expected: '1 2\n3', want: 'replace', markText: '4', entryCount: 1 },
  { id: 'lines', actual: '1 2', expected: '1 2\n3', want: 'missing', markText: '', entryCount: 1 },
  { id: 'lines', actual: '1 2\n3\n4', expected: '1 2\n3', want: 'extra', markText: '4', entryCount: 1 },
  { id: 'lines', actual: '1 2 ', expected: '1 2', want: null, markText: '', entryCount: 0 },
  { id: 'tokens', actual: '1 2', expected: '1 2 3', want: 'missing', markText: '', entryCount: 1 },
  { id: 'tokens', actual: '1  2', expected: '1 2', want: null, markText: '', entryCount: 0 },
  { id: 'strict', actual: '1 2 \n3', expected: '1 2\n3', want: 'extra', markText: ' ', entryCount: 1 },
  { id: 'strict', actual: '1 2\r\n3', expected: '1 2\n3', want: null, markText: '', entryCount: 0 },
  { id: 'unordered', actual: '3\n1\n2\n9', expected: '1\n2\n3', want: 'extra', markText: '9', entryCount: 1 },
  // CRLF 回归：判定时 `\r\n` 抹成 `\n`，但标记必须落在原文上
  { id: 'lines', actual: '1\r\n2', expected: '1\n3', want: 'replace', markText: '2', entryCount: 1 },
  { id: 'strict', actual: 'a\r\nb', expected: 'a\nc', want: 'replace', markText: 'b', entryCount: 1 },
  { id: 'lines', actual: '1\r\n2\r\n9', expected: '1\n2', want: 'extra', markText: '9', entryCount: 1 },
  { id: 'lines', actual: '1\r\n2', expected: '1\n2', want: null, markText: '', entryCount: 0 },
  { id: 'tokens', actual: '1\r\n2', expected: '1 2', want: null, markText: '', entryCount: 0 },
  // 单独出现的 `\r`（老式 Mac 换行）同样只算一个换行
  { id: 'lines', actual: 'x\ry', expected: 'x\nz', want: 'replace', markText: 'y', entryCount: 1 },
  // 行按行号配：孤立的 `2` 不许跳到第 2 行去对齐（用户 2026-11-09 口径）
  { id: 'lines', actual: '2', expected: '1\n2\n3', want: 'replace', markText: '2', entryCount: 3 },
  { id: 'lines', actual: '2\n3', expected: '1\n2\n3', want: 'replace', markText: '23', entryCount: 3 },
  // 代价：实际多插一行时，后面每一行都标成不一致（换 LCS 会说「第 2 行多出 X」）
  { id: 'lines', actual: '1\nX\n2\n3', expected: '1\n2\n3', want: 'replace', markText: 'X23', entryCount: 3 },
]

// ---------------------------------------------------------------- 启动骨架
async function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address()
      probe.close(() => resolve(port))
    })
  })
}

const PORT = Number(process.env.VERIFY_PORT ?? 0) || (await freePort())
const APP_URL = `http://localhost:${PORT}/`

const server = spawn(
  process.execPath,
  [`${ROOT}node_modules/vite/bin/vite.js`, 'dev', '--port', String(PORT), '--strictPort'],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
)

function waitForServer() {
  return new Promise((resolve, reject) => {
    const onData = (chunk) => {
      if (String(chunk).includes('Local')) {
        cleanup()
        resolve()
      }
    }
    const onExit = (code) => {
      cleanup()
      reject(new Error(`dev server 退出 code=${code}`))
    }
    function cleanup() {
      server.stdout.off('data', onData)
      server.off('exit', onExit)
    }
    server.stdout.on('data', onData)
    server.once('exit', onExit)
    setTimeout(() => {
      cleanup()
      reject(new Error('dev server 启动超时'))
    }, 30000).unref()
  })
}

const pad = (text, width) => String(text).padEnd(width)

await waitForServer()

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  // ⚠️ 只加这两个：`--no-proxy-server` 之类会让 headless 起不来；
  // 冷启动要塞 50MB 工具链，protocolTimeout 必须放大（默认 180s 不够）。
  args: ['--no-sandbox', '--disable-gpu'],
  protocolTimeout: 900000,
})

let exitCode = 0
const rows = []

try {
  const page = await browser.newPage()
  await page.setDefaultTimeout(900000)
  await page.setViewport({ width: 1400, height: 980 })
  page.on('pageerror', (error) => console.error('[pageerror]', String(error.message).slice(0, 300)))

  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('.monaco-editor', { visible: true, timeout: 60000 })

  const env = await page.evaluate(async () => {
    const { getEngine } = await import('/src/services/engines/index.js')
    const health = await getEngine('wasm').health()
    return { isolated: globalThis.crossOriginIsolated === true, health }
  })
  console.log(`环境：crossOriginIsolated=${env.isolated}，自检=${env.health.ok ? 'ok' : 'failed'}`)
  if (!env.isolated || !env.health.ok) {
    console.error(`沙箱不可用：${env.health.message}`)
    exitCode = 1
  }

  // ---- 比对器语义
  const checkerResults = await page.evaluate(async (cases) => {
    const { checkOutput } = await import('/src/services/checkers.js')
    return cases.map((item) => ({
      ...item,
      got: checkOutput(item.actual, item.expected, item.id),
    }))
  }, CHECKER_CASES)

  console.log('\n输出比对器')
  for (const item of checkerResults) {
    const ok = item.got === item.want
    if (!ok) exitCode = 1
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${pad(item.id, 14)} ${ok ? '' : `got ${item.got}, want ${item.want}`}`)
  }

  // ---- 差异块：语义 + 「判定 ↔ 差异」两条不变量
  const diffResults = await page.evaluate(async (cases) => {
    const { diffOutput, markSegments } = await import('/src/services/outputDiff.js')
    return cases.map((item) => {
      const diff = diffOutput(item.actual, item.expected, item.id)
      // 框内高亮实际覆盖的原文片段（空串 = 不该高亮）：走的就是界面的那一次切片
      const marked = diff
        ? markSegments(item.actual, diff.marks)
            .filter((seg) => seg.mark)
            .map((seg) => seg.text)
            .join('')
        : ''
      return {
        ...item,
        kind: diff?.entries?.[0]?.kind ?? null,
        entries: diff?.entries?.length ?? 0,
        marks: diff?.marks?.length ?? 0,
        marked,
      }
    })
  }, DIFF_CASES)

  console.log('\n输出差异')
  for (const item of diffResults) {
    const okKind = item.kind === item.want
    const okMark = item.marked === item.markText
    const okCount = item.entryCount === item.entries
    const ok = okKind && okMark && okCount
    if (!ok) exitCode = 1
    const note = ok
      ? `entries=${item.entries} marks=${item.marks}`
      : `${okKind ? '' : `kind got ${item.kind}, want ${item.want}; `}${okMark ? '' : `marked ${JSON.stringify(item.marked)}, want ${JSON.stringify(item.markText)}; `}${okCount ? '' : `entries ${item.entries}, want ${item.entryCount}`}`
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${pad(item.id, 14)} ${note}`)
  }

  // 交叉验：判定 WA ⇒ 差异必须说得出话；判定 AC ⇒ 差异必须为空。
  // 两条模块的前处理（换行 / 行尾空白 / 末尾空行）只要有一处写歪，这一组就会红。
  const crosses = await page.evaluate(async (cases) => {
    const { checkOutput } = await import('/src/services/checkers.js')
    const { diffOutput } = await import('/src/services/outputDiff.js')
    return cases.map((item) => {
      const match = checkOutput(item.actual, item.expected, item.id)
      const diff = diffOutput(item.actual, item.expected, item.id)
      return { id: item.id, match, hasDiff: Boolean(diff?.entries?.length) }
    })
  }, CHECKER_CASES)

  console.log('\n比对器 ↔ 差异（WA 必须有差异，AC 必须没有）')
  for (const item of crosses) {
    const ok = item.match ? !item.hasDiff : item.hasDiff
    if (!ok) exitCode = 1
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${pad(item.id, 14)} 判定=${item.match ? 'AC' : 'WA'} 差异=${item.hasDiff}`)
  }

  // ---- 判定矩阵
  console.log('\n判定矩阵（WASM / 1 s / 256 MiB）')
  for (const item of CASES) {
    const started = Date.now()
    let result
    try {
      result = await page.evaluate(
        async ({ code, expected, timeLimitMs, memoryLimitBytes }) => {
          const { evaluateCase } = await import('/src/services/runner.js')
          const { getEngine } = await import('/src/services/engines/index.js')
          const patch = await evaluateCase({
            engine: getEngine('wasm'),
            languageId: 'cpp',
            entryPath: '/main.cpp',
            code,
            testCase: { input: '', expectedOutput: expected },
            timeLimitMs,
            memoryLimitBytes,
          })
          return {
            verdict: patch.verdict,
            status: patch.status,
            durationMs: patch.durationMs,
            detail: String(patch.detail ?? '').slice(0, 160),
          }
        },
        { code: item.code, expected: item.expected, timeLimitMs: TIME_LIMIT_MS, memoryLimitBytes: MEMORY_LIMIT_BYTES },
      )
    } catch (error) {
      result = { verdict: 'THREW', status: 'error', detail: String(error?.message ?? error).slice(0, 200) }
    }

    const elapsed = Date.now() - started
    let tag = 'FAIL'
    if (result.verdict === item.expect) tag = 'PASS'
    else if (item.knownActual && result.verdict === item.knownActual) tag = 'KNOWN'
    else exitCode = 1

    const timing = result.durationMs === null || result.durationMs === undefined ? '—' : `${result.durationMs}ms`
    console.log(
      `  ${tag.padEnd(5)} #${pad(item.n, 3)} ${pad(item.expect, 4)} → ${pad(result.verdict, 4)} ${pad(timing, 8)} ${item.note}` +
        (result.detail ? `\n         ${result.detail.replace(/\s+/g, ' ')}` : ''),
    )
    rows.push({ ...item, actual: result.verdict, tag, elapsed, detail: result.detail })
  }

  // 第 20 条不判：v1 没有 OLE，无限打印可能 TLE / MLE / ERR，没有可断言的期望。
  console.log('  SKIP  #20  无限打印不属于 v1 的判定面（无 OLE）')

  const failed = rows.filter((row) => row.tag === 'FAIL')
  const known = rows.filter((row) => row.tag === 'KNOWN')
  console.log(`\n合计 ${rows.length} 条：PASS ${rows.length - failed.length - known.length} / KNOWN ${known.length} / FAIL ${failed.length}`)
  if (failed.length) console.log(`失败：${failed.map((row) => `#${row.n}`).join('、')}`)
} finally {
  await browser.close()
  server.kill()
}

process.exit(exitCode)
