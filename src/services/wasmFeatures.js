/**
 * 浏览器的 wasm 能力探测 —— 决定 23 档 C++ 工具链能不能在这台机器上跑。
 *
 * 为什么必须探测：23.1.0 的 clang 是带 `+exception-handling`（**新标准 exnref**：
 * `try_table` / `throw_ref`）、`+simd128`、`+multivalue`、`+reference-types` 编出来的。
 * 缺任一项时，用户的代码能编译、能链接，却在**跑产物的那一步**实例化失败，
 * 报出来的是引擎内部措辞（`invalid value type` / `unknown opcode`），卡片上看起来
 * 像「你的代码写错了」。探一次、说清楚差哪一项，比让人猜便宜得多。
 *
 * 探测物是**手写的三段字节码**（每段十几个字节），不是恒真的占位模块：每段只声明
 * 一个能代表该提案的类型或指令，`WebAssembly.validate` 就是全部判据。这样不新增
 * 资产、不过 SW 缓存、首屏零网络 —— 代价是这里的字节码必须写对，所以每条都注了
 * 段结构，改之前先对照 wasm 规范读一遍。
 *
 * 浏览器下限：**Safari 16.4+ / Chrome 123+ / Firefox 121+**。特例：Chrome 108–122
 * 有 SIMD、没有 exnref，会如实判成「缺 wasm 异常」。
 */

/** wasm 头：魔数 `\0asm` + 版本 1 */
const MAGIC = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]

/**
 * `(module (type (func (param v128))))`
 *
 * type 段（id 0x01）：payload `01 60 01 7b 00` = 1 个类型、functype(0x60)、
 * 1 个参数、参数类型 v128(0x7b)、0 个返回值。
 * v128 这个值类型本身由 SIMD 提案引入 —— 老引擎在**读类型段**时就报 invalid value type。
 */
const SIMD_MODULE = Uint8Array.from([...MAGIC, 0x01, 0x05, 0x01, 0x60, 0x01, 0x7b, 0x00])

/**
 * `(module (type (func (result i32 i32))))`
 *
 * payload `01 60 00 02 7f 7f` = 1 个类型、无参数、**2 个返回值**。
 * 多返回值就是 multivalue 提案；`+multivalue` 是新标准异常那一组要求的配套特性。
 */
const MULTIVALUE_MODULE = Uint8Array.from([...MAGIC, 0x01, 0x06, 0x01, 0x60, 0x00, 0x02, 0x7f, 0x7f])

/**
 * `(module (type (func (param externref))))`
 *
 * payload `01 60 01 6f 00` = 1 个类型、参数类型 externref(0x6f)、无返回值。
 * externref 由 reference-types 提案引入（同样是异常那组的配套特性）。
 */
const REFERENCE_TYPES_MODULE = Uint8Array.from([...MAGIC, 0x01, 0x05, 0x01, 0x60, 0x01, 0x6f, 0x00])

/**
 * `(module (type (func)) (func (try_table (catch_all 0))))`
 *
 * 三段拼起来：
 *   `01 04 01 60 00 00`  type 段：1 个类型，() -> ()
 *   `03 02 01 00`        func 段：1 个函数，用类型 0
 *   `0a 0a 01 08 00 1f 40 01 02 00 0b 0b`
 *                        code 段：1 个 body、body 长 8 字节 ——
 *                        `00` 局部变量声明数为 0；
 *                        `1f` **try_table**（新标准异常的核心指令，老引擎直接 unknown opcode）；
 *                        `40` blocktype 空；
 *                        `01` 1 条 catch 子句；
 *                        `02 00` 子句种类 catch_all，跳转目标 label 0（= 这个 try_table 自己的末尾）；
 *                        `0b` 块结束；`0b` 函数结束。
 *
 * 注意这里是 `try_table`(0x1f) 而**不是** legacy 的 `try`(0x06)：clang 23 编出来的
 * `eh` libc++ 用的是新标准，两代混用会让 V8 在实例化时拒绝整个模块。
 */
const EXCEPTIONS_MODULE = Uint8Array.from([
  ...MAGIC,
  0x01, 0x04, 0x01, 0x60, 0x00, 0x00,
  0x03, 0x02, 0x01, 0x00,
  0x0a, 0x0a, 0x01, 0x08, 0x00, 0x1f, 0x40, 0x01, 0x02, 0x00, 0x0b, 0x0b,
])

/**
 * 探测表。`id` 会被拼进给用户看的错误信息里，保持成 wasm 提案里的技术名
 * （与 i18n 无关的固定标识，不翻译）。
 */
const PROBES = [
  { id: 'wasm-exceptions', module: EXCEPTIONS_MODULE },
  { id: 'simd128', module: SIMD_MODULE },
  { id: 'multivalue', module: MULTIVALUE_MODULE },
  { id: 'reference-types', module: REFERENCE_TYPES_MODULE },
]

/** @type {{ ok: boolean, missing: string[] } | null} */
let cached = null

/**
 * 探测一次，全程同步、无网络、几微秒量级。结果在页面生命周期内不会变，所以缓存。
 *
 * @returns {{ ok: boolean, missing: string[] }}
 *   `missing` 是缺失特性的 id 列表（按 PROBES 顺序），`ok` 为 true 时是空数组。
 */
export function detectWasmFeatures() {
  if (cached) return cached
  const missing = []
  for (const probe of PROBES) {
    let supported = false
    try {
      supported = typeof WebAssembly?.validate === 'function' && WebAssembly.validate(probe.module)
    } catch {
      // 连 validate 都没有（或者被内容策略挡了）：当作不支持，交给上层给一句人话
      supported = false
    }
    if (!supported) missing.push(probe.id)
  }
  cached = { ok: missing.length === 0, missing }
  return cached
}

/** 23 档工具链能不能跑（探测结果的布尔短路） */
export function supportsCppToolchain() {
  return detectWasmFeatures().ok
}
