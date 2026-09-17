#!/usr/bin/env node
/**
 * 用 Binaryen 的 wasm-opt 以 -Oz 压缩自托管的 clang.wasm。
 *
 * 为什么只压 clang.wasm：老机器上的瓶颈是网络传输 + V8 对 31MB wasm 的解析 / JIT，
 * clang 是编译路径上最重的一块（wasm-ld 19MB 暂不在范围内，需要时改 INPUT 即可）。
 * -Oz 是 Binaryen 的极致体积档：允许牺牲运行速度换字节，编译器偶尔变慢可接受，
 * 用户代码的运行性能不受影响（产物 program.wasm 由 wasm-ld 链接，不经过本脚本）。
 *
 * 产出 clang_opt.wasm 与原文件同目录，但**它是候选产物，不接任何运行时路径**。
 * 当前 clang 8.0.1（runno / binji 上游发行版）实测不适合再压，故未采用，理由留档：
 *   - 体积：raw 31,214,472 → 30,625,310 B（-1.89%），而 gzip -9 反而 10,620,308 → 10,724,607 B（+0.98%）。
 *     线上经 Vercel 边缘压缩传输，真机要传的是压缩流，等于净亏。
 *   - 结构：code 段占 80.7%、data 段 18.7%，没有任何 name section，仅 6KB 的 .debug_* 空壳
 *     —— 上游已深度裁剪过，「抹除调试符号」在这份文件上几乎没有可优化对象。
 *   - 后面若换用未优化的上游产物（如 clang 18），先重跑本脚本量一遍再决定是否接线。
 *
 * 本脚本保留为架构资产：定位是「量体积的尺子」，不是流水线的一环。
 *
 * wasm-opt 的解析顺序：
 *   1. 环境变量 WASM_OPT_BIN（CI 显式指定）
 *   2. tools/binaryen/bin/wasm-opt（仓库内本机原生构建，已 gitignore，跑 31MB 输入最快）
 *   3. devDependency binaryen（npm 包是跨平台的 wasm 版，慢但零系统依赖）
 *   4. PATH 上的 wasm-opt
 *
 * 用法：npm run wasm:opt
 */
import { spawnSync } from 'node:child_process'
import { existsSync, statSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import zlib from 'node:zlib'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TOOLCHAIN_DIR = join(ROOT, 'public/wasm/8.0.1')
const INPUT = join(TOOLCHAIN_DIR, 'clang.wasm')
const OUTPUT = join(TOOLCHAIN_DIR, 'clang_opt.wasm')

function resolveWasmOpt() {
  if (process.env.WASM_OPT_BIN) {
    if (!existsSync(process.env.WASM_OPT_BIN)) {
      throw new Error(`WASM_OPT_BIN 指向的文件不存在：${process.env.WASM_OPT_BIN}`)
    }
    return process.env.WASM_OPT_BIN
  }
  const localNative = join(ROOT, 'tools/binaryen/bin/wasm-opt')
  if (existsSync(localNative)) return localNative
  try {
    const require = createRequire(import.meta.url)
    const fromNpm = join(dirname(require.resolve('binaryen/package.json')), 'bin/wasm-opt')
    if (existsSync(fromNpm)) return fromNpm
  } catch {
    /* 没装 devDependency 时继续往下找 PATH */
  }
  return 'wasm-opt'
}

const fmt = new Intl.NumberFormat('en-US')
const mib = (bytes) => `${(bytes / 1048576).toFixed(2)} MiB (${fmt.format(bytes)} B)`

function sizeOf(path) {
  return existsSync(path) ? statSync(path).size : 0
}

if (!existsSync(INPUT)) {
  console.error(`找不到输入文件：${INPUT}`)
  process.exit(1)
}

const wasmOpt = resolveWasmOpt()
// Binaryen 写出前默认做合法性校验（132 只能用 -n 关掉，我们不关），防止优化破坏模块
const args = ['-Oz', INPUT, '-o', OUTPUT]
console.log(`$ ${wasmOpt} ${args.join(' ')}`)
const startedAt = Date.now()
const run = spawnSync(wasmOpt, args, { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'] })
const elapsedMs = Date.now() - startedAt
if (run.error) {
  console.error(`无法启动 wasm-opt：${run.error.message}`)
  console.error('可安装 devDependency：npm install --save-dev binaryen')
  process.exit(1)
}
if (run.status !== 0) {
  console.error(`wasm-opt 失败，退出码 ${run.status}`)
  process.exit(run.status ?? 1)
}

const before = sizeOf(INPUT)
const after = sizeOf(OUTPUT)
if (!after) {
  console.error('wasm-opt 退出码为 0 但没有产出文件，按失败处理（不要用空文件覆盖线上资源）')
  process.exit(1)
}
const deltaPct = (((before - after) / before) * 100).toFixed(2)
// 线上由 Vercel 边缘做压缩传输，顺手给出 gzip -9 参照（Vary 协商后通常是 br，gzip 只作保守下界）
const gzipIn = zlib.gzipSync(readFileSync(INPUT), { level: 9 }).length
const gzipOut = zlib.gzipSync(readFileSync(OUTPUT), { level: 9 }).length

const gzipDeltaPct = ((gzipIn - gzipOut) / gzipIn) * 100
// 线上传的是压缩流：gzip 变差时即使 raw 变小也是净亏，这里把符号算对，别只印「-」
const signed = (pct) => `${pct >= 0 ? '-' : '+'}${Math.abs(pct).toFixed(2)}%`

console.log('')
console.log('体积对比（-Oz）')
console.log(`  优化前 raw : ${mib(before)}`)
console.log(`  优化后 raw : ${mib(after)}`)
console.log(`  raw 减少   : ${fmt.format(before - after)} B（${signed(Number(deltaPct))}），耗时 ${(elapsedMs / 1000).toFixed(1)} s`)
console.log(`  优化前 gzip: ${mib(gzipIn)}`)
console.log(`  优化后 gzip: ${mib(gzipOut)}（${signed(gzipDeltaPct)}）`)
console.log('')
if (gzipDeltaPct < 0) {
  console.log('注意：gzip 反而变大 —— 线上经边缘压缩传输，这种情况即使 raw 变小也是净亏。')
  console.log('      别把这个产物接进运行时路径，先把上面「体积对比」当决策依据。')
} else {
  console.log('下一步：确认收益成立后再把它接进资源加载路径，并跑一次含 libc++ 头的回归。')
}