/**
 * build-toolchain-gzbin —— 把现有的 `.br` 工具链资产在**构建期**转成 `.gzbin`。
 *
 * 为什么要有这一步（方案 A，2026-11-22）：
 * 之前工具链靠 `Content-Encoding: br` 让浏览器透明解压，Cache Storage 里落下的是**解压态**
 * （clang 77.3MB + wasm-ld 43.5MB + sysroot 16.3MB），SW 只好在手机上用
 * `CompressionStream` 再压一遍 —— 77MB 的实时重压缩就是 OOM 与 CPU 峰值的来源。
 * 现在改成：服务端直接给**已 gzip 压缩、但不带 Content-Encoding** 的字节流，页面原样落桶，
 * 运行时用 `DecompressionStream` 流式解压。客户端压缩开销归零，桶里只占 ~38MB。
 *
 * 为什么不在仓库里多提交 38MB 二进制：`.gzbin` 完全由现有 `.br` 决定，属于构建产物。
 * 这里用 brotli 解压 → gzip -9 重新压（Node 的 zlib，流式，不整块进内存），
 * 顺手把**压缩态 / 解压态**两个精确字节数写进静态清单 `toolchain-assets.json`：
 * - 下载进度条的分母用 compressedSize（wire 上的真实大小）；
 * - 写后复验用它判断「真实落盘字节数是否等于预期」；
 * - 运行时解压进度条的分母用 uncompressedSize。
 *
 * 输出（都在 public/wasm/23.1.0/ 下，均不进仓库）：
 * - clang.wasm.gzbin / wasm-ld.wasm.gzbin / sys23-fs.tar.gzbin
 * - toolchain-assets.json
 *
 * 幂等：`.gzbin` 比 `.br` 新、且清单存在时直接跳过；改过 `.br` 或传 `--force` 才重做。
 *
 * 用法：node scripts/build-toolchain-gzbin.mjs [--force]
 * 它挂在 package.json 的 predev / prebuild 上，正常不需要手动跑。
 */

import {
  createReadStream,
  createWriteStream,
  existsSync,
  statSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createBrotliDecompress, createGzip } from 'node:zlib'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const VERSION = '23.1.0'
const DIR = join(ROOT, 'public/wasm', VERSION)
const MANIFEST_PATH = join(DIR, 'toolchain-assets.json')
const FORMAT = 'gzip-v1'
const force = process.argv.includes('--force')

/**
 * 三件资产：key 是运行时的名字（与 runnoSandbox / wasi.worker 的字段一一对应），
 * 源 `.br` 是仓库里已有的那份，目标 `.gzbin` 是构建产物。
 */
const SOURCES = [
  { key: 'clang', from: 'clang.wasm.br', to: 'clang.wasm.gzbin' },
  { key: 'linker', from: 'wasm-ld.wasm.br', to: 'wasm-ld.wasm.gzbin' },
  { key: 'sysroot', from: 'sys23-fs.tar.br', to: 'sys23-fs.tar.gzbin' },
]

function mb(bytes) {
  return `${(bytes / 1048576).toFixed(1)} MiB`
}

/** `.gzbin` 与清单都比源 `.br` 新 = 上次已经转好，不必再花十几秒重压 */
function isUpToDate() {
  if (!existsSync(MANIFEST_PATH)) return false
  return SOURCES.every(({ from, to }) => {
    const source = join(DIR, from)
    const target = join(DIR, to)
    if (!existsSync(source) || !existsSync(target)) return false
    return statSync(target).mtimeMs >= statSync(source).mtimeMs
  })
}

/**
 * 一个只数字节、不改内容的 Transform。
 * 边读边报进度；`flush` 再报一次，保证最后一个 chunk 不会漏。
 */
function byteCounter(sink) {
  let total = 0
  return new Transform({
    transform(chunk, _encoding, callback) {
      total += chunk.length
      sink(total)
      callback(null, chunk)
    },
    flush(callback) {
      sink(total)
      callback()
    },
  })
}

async function convert({ from, to }) {
  const sourcePath = join(DIR, from)
  const targetPath = join(DIR, to)
  // 先写 .tmp 再改名：中途失败（磁盘满 / Ctrl-C）不会留下一个「看起来存在」的半截资产
  const tmpPath = `${targetPath}.tmp`

  let compressedSize = 0
  let uncompressedSize = 0
  try {
    await pipeline(
      createReadStream(sourcePath),
      createBrotliDecompress(),
      byteCounter((total) => {
        uncompressedSize = total
      }),
      createGzip({ level: 9 }),
      byteCounter((total) => {
        compressedSize = total
      }),
      createWriteStream(tmpPath),
    )
    renameSync(tmpPath, targetPath)
  } catch (error) {
    try {
      if (existsSync(tmpPath)) unlinkSync(tmpPath)
    } catch {
      /* 清理失败不该盖住真正的错误 */
    }
    throw error
  }
  return { compressedSize, uncompressedSize }
}

async function main() {
  if (!force && isUpToDate()) {
    console.log('build-toolchain-gzbin: 已是最新，跳过')
    return
  }
  for (const asset of SOURCES) {
    if (!existsSync(join(DIR, asset.from))) {
      console.error(
        `build-toolchain-gzbin: 缺少源文件 public/wasm/${VERSION}/${asset.from}；` +
          '它由 tools/wasm-core 的构建流程产出，先把它放回去再跑',
      )
      process.exit(1)
    }
  }

  const assets = []
  for (const asset of SOURCES) {
    const startedAt = Date.now()
    const { compressedSize, uncompressedSize } = await convert(asset)
    assets.push({
      key: asset.key,
      file: asset.to,
      compressedSize,
      uncompressedSize,
    })
    console.log(
      `build-toolchain-gzbin: ${asset.to}  ${mb(compressedSize)}` +
        `（解压态 ${mb(uncompressedSize)}，${Date.now() - startedAt}ms）`,
    )
  }

  const manifest = {
    version: VERSION,
    format: FORMAT,
    assets,
  }
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`)
  const totalCompressed = assets.reduce((sum, asset) => sum + asset.compressedSize, 0)
  console.log(
    `build-toolchain-gzbin: 三件合计 ${mb(totalCompressed)}，清单已写入 toolchain-assets.json`,
  )
}

await main()
