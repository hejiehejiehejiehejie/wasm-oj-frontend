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
 * 差异染色（services/outputDiff.js，2026-11-09 晚改成「两侧各标各的 + 只改字色」）。
 *
 * `got` / `want` = 两侧**被染色的那几段原文**拼起来的样子（空串 = 那一侧不该有标记）。
 * 它是 `markSegments` 走完之后的可见文本 —— 纯空白的差异段会被换成 `·` / `⇥` / `↵`，
 * 所以「多了一个空格」在这里是可断言的 `·`，不是看不见的空字符串。
 * `same: true` = 这个口径下两段等价，`diffOutput` 必须返回 null。
 *
 * 这里守两条不变量，比单看某条文案重要：
 * ① 判定说 WA 的地方，差异必须落在**某一侧**（否则卡片会一片白，用户只知道错了、不知道哪错）；
 * ② 判定说 AC 的地方，**绝不能**冒出标记（否则卡片会指着一模一样的两段文本说「不同」）。
 * 第 ② 条由上面那批 CHECKER_CASES 全量交叉验（见下面「比对器 ↔ 差异」那一段）。
 */
// `got` / `want` 盯的是偏移是否落在原文上：`lines` / `strict` / `unordered` 一旦拿归一化
// 之后的下标去切原文，实际输出里只要出现一个回车，标记就会往前错一位。
// 标哪一侧盯的是对齐策略：元素（行 / 行内的词）**只按位置配**，配不上的一律挂尾巴，所以
// 「期望 3 行、实际只有 1 行 2」要在实际侧标第 1 行、期望侧标第 2、3 行；`1 2 3` 对 `2 3`
// 要把第 1、2 个词都标成不一致，而不是拿公共后缀把 `2 3` 对上、只报「多了个 1」。
// 「缺内容标在期望侧」是这一版的核心：实际侧那个区间长度是 0，画不出来。
// 唯一的反例是「实际是期望的前缀」（`10` / `100`）：边界吸附会把切点推回词首，两侧整词 replace。
// 一旦这条短路写成单边的，多一位数字标 replace、少一位实际框全白 —— 2026-11-09 修掉的就是它。
const DIFF_CASES = [
  { id: 'lines', actual: '1 2\n4', expected: '1 2\n3', got: '4', want: '3', pairs: 1 },
  { id: 'lines', actual: '1 2', expected: '1 2\n3', got: '', want: '3', pairs: 0 },
  { id: 'lines', actual: '1 2\n3\n4', expected: '1 2\n3', got: '4', want: '', pairs: 0 },
  { id: 'lines', actual: '1 2 ', expected: '1 2', same: true },
  { id: 'tokens', actual: '1 2', expected: '1 2 3', got: '', want: '3', pairs: 0 },
  { id: 'tokens', actual: '1  2', expected: '1 2', same: true },
  { id: 'strict', actual: '1 2 \n3', expected: '1 2\n3', got: '·', want: '', pairs: 0 },
  { id: 'strict', actual: '1 2\r\n3', expected: '1 2\n3', same: true },
  { id: 'unordered', actual: '3\n1\n2\n9', expected: '1\n2\n3', got: '9', want: '', pairs: 0 },
  // CRLF 回归：判定时 `\r\n` 抹成 `\n`，但标记必须落在原文上
  { id: 'lines', actual: '1\r\n2', expected: '1\n3', got: '2', want: '3', pairs: 1 },
  { id: 'strict', actual: 'a\r\nb', expected: 'a\nc', got: 'b', want: 'c', pairs: 1 },
  { id: 'lines', actual: '1\r\n2\r\n9', expected: '1\n2', got: '9', want: '', pairs: 0 },
  { id: 'lines', actual: '1\r\n2', expected: '1\n2', same: true },
  { id: 'tokens', actual: '1\r\n2', expected: '1 2', same: true },
  // 单独出现的 `\r`（老式 Mac 换行）同样只算一个换行
  { id: 'lines', actual: 'x\ry', expected: 'x\nz', got: 'y', want: 'z', pairs: 1 },
  // 行按行号配：孤立的 `2` 不许跳到第 2 行去对齐（用户 2026-11-09 口径）
  { id: 'lines', actual: '2', expected: '1\n2\n3', got: '2', want: '123', pairs: 1 },
  { id: 'lines', actual: '2\n3', expected: '1\n2\n3', got: '23', want: '123', pairs: 2 },
  // 代价：实际多插一行时，后面每一行都标成不同（换 LCS 会说「第 2 行多出 X」）
  { id: 'lines', actual: '1\nX\n2\n3', expected: '1\n2\n3', got: 'X23', want: '23', pairs: 2 },
  // 缺内容落在期望侧：实际侧那一段长度为 0，染不出来
  { id: 'lines', actual: '1 3', expected: '1 2 3', got: '3', want: '23', pairs: 1 },
  { id: 'lines', actual: '10', expected: '100', got: '10', want: '100', pairs: 1 },
  // 反方向（实际多一位）本来就是整词 replace；两边必须对称，否则同一个错误一侧有红一侧全白
  { id: 'lines', actual: '100', expected: '10', got: '100', want: '10', pairs: 1 },
  // float：数值算错不是「漏打了 0001」，整词标出
  { id: 'float', actual: '1.5', expected: '1.50001', got: '1.5', want: '1.50001', pairs: 1 },
  { id: 'lines', actual: '1 2', expected: '1 2\n3\n4', got: '', want: '34', pairs: 0 },
  { id: 'strict', actual: '13', expected: '123', got: '', want: '2', pairs: 0 },
  { id: 'lines', actual: '', expected: '1\n2\n3', got: '', want: '123', pairs: 0 },
  { id: 'unordered', actual: '1\n2', expected: '1\n2\n3', got: '', want: '3', pairs: 0 },
  // 元素对元素（2026-11-09 第四轮）：行内 / 全局都按位置配，不跨位置找配对。
  // `1 2 3` 对 `2 3`：旧的公共后缀会整段对上、只报「多了个 1」；现在第 1 个词 1↔2、
  // 第 2 个词 2↔3 各算一处不一致，第 3 个词只有期望侧有 → 标「少了 3」。
  { id: 'lines', actual: '1 2 3', expected: '2 3', got: '123', want: '23', pairs: 2 },
  { id: 'lines', actual: '1\n3', expected: '1\n2 3', got: '3', want: '23', pairs: 1 },
  { id: 'tokens', actual: '1 2 3', expected: '2 3', got: '123', want: '23', pairs: 2 },
  // LCS 把 `1 2` 救回来之后只剩「3 换了 3」—— 位置全错。按位置配就是三处都不一致。
  { id: 'tokens', actual: '3 1 2', expected: '1 2 3', got: '312', want: '123', pairs: 3 },
  // float 同一支：容差内不算差异，超了按位置标
  { id: 'float', actual: '1.0000001 2', expected: '1.0 2', same: true },
  { id: 'float', actual: '1.0 2.0', expected: '1.0 3.0', got: '2.0', want: '3.0', pairs: 1 },
  // 纯空白差异：只染色看不见，换行 / 空格 / 制表要换成可见符号
  { id: 'strict', actual: '1 2\n\n3', expected: '1 2\n3', got: '↵\n', want: '', pairs: 0 },
  { id: 'lines', actual: '1  2', expected: '1 2', got: '·', want: '', pairs: 0 },
  { id: 'lines', actual: '1 2', expected: '1  2', got: '', want: '·', pairs: 0 },
  // 空白换成符号后两侧都看得到：制表 vs 空格属于「两边都有、但不一样」。
  // 期望侧那一份是 quiet（平时不着色），所以**不换字形** —— 这里断言的就是一个真空格，
  // 悬停时才靠下划线与光晕露出来（换成 `·` 就等于提前把差异画在静默态上）。
  { id: 'lines', actual: '1\t2', expected: '1 2', got: '⇥', want: ' ', pairs: 1 },
  // 空行也算一行：多出来的那个空行只能标在它后面那个换行上
  { id: 'unordered', actual: '\r\n100800', expected: '100800', got: '↵\n', want: '', pairs: 0 },
  // 前 `shared` 行里一侧是空行：词元切出来是空数组，按词配会让空行那一侧一个标记都没有
  // （真正的罪魁祸首毫无高亮，反而是后面正确的行被标成多出）→ 整行落标，空行退到它的换行上
  { id: 'lines', actual: '1\n\n3', expected: '1\n2\n3', got: '↵\n', want: '2', pairs: 1 },
  { id: 'lines', actual: '\n10 20', expected: '10 20', got: '↵\n10 20', want: '10 20', pairs: 1 },
  // 纯空格行：裁掉行尾空白后是空行，换行在下标 3 而不是 0 —— 标错位置就会去染第一个空格
  { id: 'lines', actual: '   \n1', expected: '1', got: '···↵\n1', want: '1', pairs: 1 },
  // 同词异距：只比词间缝隙，不许把头尾两处多余空格之间的正确内容一起吞进去
  { id: 'lines', actual: '1  2 3 4 5  6', expected: '1 2 3 4 5 6', got: '··', want: '', pairs: 0 },
  { id: 'lines', actual: ' 1 2', expected: '1 2', got: '·', want: '', pairs: 0 },
  // 词元边界吸附：数字 / 单词被切开时整段染色（只标中间一个字符读不出改了什么）
  { id: 'lines', actual: '1 100800 3', expected: '1 100000 3', got: '100800', want: '100000', pairs: 1 },
  { id: 'lines', actual: 'Impossible', expected: 'Possible', got: 'Impossible', want: 'Possible', pairs: 1 },
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

  // ---- 差异染色：两侧各标各的 + 「判定 ↔ 差异」两条不变量
  const diffResults = await page.evaluate(async (cases) => {
    const { diffOutput, markSegments } = await import('/src/services/outputDiff.js')
    // 一侧「被染色的那几段」拼起来 —— 走的就是界面那次切片，所以纯空白差异在这里是 `·` / `↵`
    // （`markSegments` 在没有可染段时回 null：那是「这一侧不用染色」，不是「染了 0 段」）
    const marked = (text, marks) =>
      (markSegments(text, marks ?? []) ?? [])
        .filter((seg) => seg.kind)
        .map((seg) => seg.text)
        .join('')
    return cases.map((item) => {
      const diff = diffOutput(item.actual, item.expected, item.id)
      const got = diff?.got ?? []
      const want = diff?.want ?? []
      // 两侧共用的 pair 数：这就是「鼠标停到一处，对侧能跟着亮」的那条线。
      // 数字不对 = 某处差异只有单侧标记，或两侧编号错开（悬停会亮错地方）。
      const shared = got.filter((mark) => want.some((peer) => peer.pair === mark.pair)).length
      // 偏移必须落在原文里、同一侧不许互相压盖：`lineRange` 要把空行推到它的换行上，
      // 换行位置一旦从 `start + brk` 算（而不是抹空白之前的位置），纯空格行就会压到前一格上。
      const sound = (marks, text) => {
        let at = 0
        for (const mark of marks) {
          if (mark.from < at || mark.to > text.length || mark.to <= mark.from) return false
          at = mark.to
        }
        return true
      }
      return {
        ...item,
        none: diff === null,
        gotText: marked(item.actual, got),
        wantText: marked(item.expected, want),
        total: got.length + want.length,
        shared,
        quiet: want.filter((mark) => mark.quiet).length,
        sound: sound([...got].sort((x, y) => x.from - y.from), item.actual) &&
          sound([...want].sort((x, y) => x.from - y.from), item.expected),
      }
    })
  }, DIFF_CASES)

  console.log('\n输出差异（不一致标在实际侧，多出 / 缺少标在期望侧）')
  for (const item of diffResults) {
    const ok =
      item.same === true
        ? item.none
        : !item.none &&
          item.gotText === item.got &&
          item.wantText === item.want &&
          item.shared === item.pairs
    if (!ok) exitCode = 1
    const note = ok
      ? item.same
        ? '无差异'
        : `ACTUAL ${JSON.stringify(item.gotText)} / EXPECTED ${JSON.stringify(item.wantText)} 配对 ${item.shared}`
      : item.same
        ? `判定等价，却给了 ${item.total} 段标记`
        : `ACTUAL ${JSON.stringify(item.gotText)} 期望 ${JSON.stringify(item.got)}; EXPECTED ${JSON.stringify(item.wantText)} 期望 ${JSON.stringify(item.want)}; 配对 ${item.shared} 期望 ${item.pairs}`
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${pad(item.id, 14)} ${note}`)
  }

  // quiet 只该出现在期望侧：它是「对侧那一处换掉了我」，本身不该常驻着色。
  // 反过来（实际侧出现 quiet）会让 ACTUAL 里冒出一段没有颜色的标记 —— 点了没反应、还挡选区。
  const quietOk =
    diffResults.every((item) => item.quiet === 0 || item.quiet <= (item.pairs ?? 0)) &&
    diffResults.every((item) => item.quiet === 0 || item.wantText.length > 0)
  if (!quietOk) exitCode = 1
  console.log(`  ${quietOk ? 'PASS' : 'FAIL'}  ${pad('quiet', 14)} 期望侧静默标记数 = 配对数`)

  // 偏移的自洽性：不越界、不零宽、同一侧不互相压盖（重叠了 `markSegments` 会跳段，标记就丢了）
  const soundOk = diffResults.every((item) => item.sound)
  if (!soundOk) exitCode = 1
  console.log(`  ${soundOk ? 'PASS' : 'FAIL'}  ${pad('bounds', 14)} 同一侧标记有序、不越界、不重叠`)
  if (!soundOk) {
    for (const item of diffResults.filter((one) => !one.sound)) {
      console.log(`        越界/重叠：${item.id} ${JSON.stringify([item.actual, item.expected])}`)
    }
  }

  // 切片层的渲染契约（2026-11-09 深夜，用户评审后加）。这四条都不是「颜色对不对」，
  // 而是「调用方能不能靠返回值判断有没有东西可染」，错了会表现为「判了 WA 却长得像 AC」：
  //   ① 一段都画不出来 → null。旧版会返回 `[{text: 全文, kind: null}]`，是真值数组，
  //      于是 EXPECTED 被拴进只读 <pre>、ACTUAL 又被撤掉 --fail-soft 兜底红字。
  //   ② quiet 段不换字形 —— 换了就等于在未悬停时先露出 `·` / `↵`，静默失效。
  //   ③ 有可见字符的标记段只换首尾空白：整行 `10 20` 不该变成 `10·20`。
  //   ④ 纯空白段照旧全换：一道多余缝隙、一个空行、一整行空格，只有字形能指出来。
  const renderCases = await page.evaluate(async () => {
    const { markSegments } = await import('/src/services/outputDiff.js')
    const kindText = (segs) => segs?.filter((seg) => seg.kind).map((seg) => seg.text).join('') ?? null
    const long = 'x'.repeat(6000)
    return [
      // 差异全在截断点（4000）之后：框里一个字都染不到
      { name: 'clipped', actual: kindText(markSegments(long, [{ from: 5000, to: 5001, kind: 'extra', pair: 1 }], 4000)), want: null },
      { name: 'no-marks', actual: markSegments('abc', []), want: null },
      { name: 'quiet-blank', actual: kindText(markSegments('a b', [{ from: 1, to: 2, kind: 'replace', pair: 1, quiet: true }])), want: ' ' },
      { name: 'row-blank', actual: kindText(markSegments('10 20', [{ from: 0, to: 5, kind: 'extra', pair: 1 }])), want: '10 20' },
      { name: 'tail-blank', actual: kindText(markSegments('10 ', [{ from: 0, to: 3, kind: 'extra', pair: 1 }])), want: '10·' },
      { name: 'gap-blank', actual: kindText(markSegments('1  2', [{ from: 1, to: 3, kind: 'extra', pair: 1 }])), want: '··' },
    ]
  })
  const renderOk = renderCases.every((one) => one.actual === one.want)
  if (!renderOk) exitCode = 1
  console.log(
    `  ${renderOk ? 'PASS' : 'FAIL'}  ${pad('render', 14)} 切片：无可染回 null / quiet 静默 / 只换边界空白`,
  )
  for (const one of renderCases.filter((row) => row.actual !== row.want)) {
    console.log(`        ${one.name}: 实得 ${JSON.stringify(one.actual)} 期望 ${JSON.stringify(one.want)}`)
  }

  // 交叉验：判定 WA ⇒ 两侧至少有一处标记；判定 AC ⇒ 一处都没有。
  // 两条模块的前处理（换行 / 行尾空白 / 末尾空行）只要有一处写歪，这一组就会红。
  const crosses = await page.evaluate(async (cases) => {
    const { checkOutput } = await import('/src/services/checkers.js')
    const { diffOutput } = await import('/src/services/outputDiff.js')
    return cases.map((item) => {
      const match = checkOutput(item.actual, item.expected, item.id)
      const diff = diffOutput(item.actual, item.expected, item.id)
      return { id: item.id, match, hasDiff: diff !== null }
    })
  }, CHECKER_CASES)

  console.log('\n比对器 ↔ 差异（WA 必须有标记，AC 必须没有）')
  for (const item of crosses) {
    const ok = item.match ? !item.hasDiff : item.hasDiff
    if (!ok) exitCode = 1
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${pad(item.id, 14)} 判定=${item.match ? 'AC' : 'WA'} 标记=${item.hasDiff}`)
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
