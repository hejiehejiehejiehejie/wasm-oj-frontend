#!/usr/bin/env node
/**
 * 拉取构建 wasm 内核（clang.wasm / wasm-ld.wasm）所需的两份上游物料：
 *
 *   1. wasi-sdk 34 便携包 —— 只当**交叉编译器**用：它的 clang 在宿主机上跑，
 *      把 LLVM 源码编成 wasm32-wasip1 目标。它自带的 sysroot 同时也是我们最终
 *      随站点分发的 sysroot 来源（34 起预编译包内已含 `lib/wasm32-wasip1/eh/`，
 *      即开了 wasm 异常的 libc++ / libc++abi / libunwind，不必自行重建 sysroot）。
 *   2. LLVM 23.1.0 源码包 —— 被编译成 wasm 的那一份，产出 clang 与 wasm-ld。
 *      注意与 wasi-sdk 的关系：wasi-sdk 34 内部用的是 release/23.x 上的某个提交，
 *      与 23.1.0 标签只差几个 bugfix；这里用标签版是为了可复现地拿到 sha256。
 *
 * 物料一律落在 tools/wasm-core/.cache/（`tools/` 已被 .gitignore 排除），
 * 下载后按 versions.json 里的 sha256 校验；没写 sha256 的平台会打印实测值，方便回填。
 *
 * 网络：GitHub 的 release-assets 在国内经常连不上（实测本机 300s 超时），
 * 所以按「直连 → 镜像前缀」的顺序重试。镜像只加在 URL 前，不改变路径。
 * 也可用环境变量 WASM_CORE_MIRROR 指定自己的前缀（空字符串表示只用直连）。
 *
 * 用法：npm run wasm:core:fetch
 */
import { createHash } from 'node:crypto'
import { createWriteStream, existsSync, mkdirSync } from 'node:fs'
import { mkdir, readFile, rename, rm, stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../..')
export const CACHE_DIR = join(ROOT, 'tools/wasm-core/.cache')
export const BUILD_DIR = join(ROOT, 'tools/wasm-core/build')
export const OUT_DIR = join(ROOT, 'tools/wasm-core/out')

const MIRRORS = (process.env.WASM_CORE_MIRROR ?? 'https://ghfast.top/,https://gh-proxy.com/')
  .split(',')
  .map((s) => s.trim())

const VERSIONS = JSON.parse(await readFile(join(HERE, 'versions.json'), 'utf8'))

/** 当前宿主机对应的 wasi-sdk 物料键，例如 darwin-arm64 */
export function hostKey(platform = process.platform, arch = process.arch) {
  const p = platform === 'win32' ? 'win' : platform
  return `${p}-${arch === 'x64' ? 'x64' : arch}`
}

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

function fmt(bytes) {
  return `${(bytes / 1048576).toFixed(1)} MiB`
}

async function sha256(path) {
  const hash = createHash('sha256')
  hash.update(await readFile(path))
  return hash.digest('hex')
}

/** 下载单个 URL 到 dest（先写 .part，校验通过才改名，避免半截文件被当成成品） */
async function downloadOne(url, dest, expectedSize) {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)

  const total = Number(res.headers.get('content-length')) || expectedSize || 0
  const part = `${dest}.part`
  await rm(part, { force: true })

  let received = 0
  let lastTick = Date.now()
  const body = Readable.fromWeb(res.body)
  body.on('data', (chunk) => {
    received += chunk.length
    if (Date.now() - lastTick < 3000) return
    lastTick = Date.now()
    const pct = total ? ` ${((received / total) * 100).toFixed(1)}%` : ''
    process.stdout.write(`\r    ${fmt(received)} / ${total ? fmt(total) : '?'}${pct}`)
  })

  await pipeline(body, createWriteStream(part))
  process.stdout.write('\n')
  await rename(part, dest)
  return received
}

async function download(url, dest, sha256Pin) {
  if (await exists(dest)) {
    if (!sha256Pin || (await sha256(dest)) === sha256Pin) {
      console.log(`  已存在并可复用：${dest}`)
      return
    }
    console.log('  已存在但校验不符，重新下载')
    await rm(dest, { force: true })
  }

  const candidates = [url, ...MIRRORS.filter(Boolean).map((prefix) => `${prefix}${url}`)]
  const failures = []
  for (const candidate of candidates) {
    const label = candidate === url ? '直连' : `镜像 ${candidate.slice(0, candidate.length - url.length)}`
    console.log(`  下载（${label}）：${url}`)
    try {
      const size = await downloadOne(candidate, dest, 0)
      const digest = await sha256(dest)
      if (sha256Pin && digest !== sha256Pin) {
        throw new Error(`sha256 不符：期望 ${sha256Pin}，实际 ${digest}`)
      }
      if (!sha256Pin) {
        console.log(`  ⚠ versions.json 未钉该平台的 sha256，实测 ${digest}（${fmt(size)}），请回填`)
      }
      return
    } catch (error) {
      failures.push(`${label}: ${error.message}`)
      await rm(dest, { force: true })
    }
  }
  throw new Error(`下载失败：\n  ${failures.join('\n  ')}`)
}

function untar(tarball, dest, rootName) {
  mkdirSync(dest, { recursive: true })
  const dir = join(dest, rootName)
  if (existsSync(dir)) {
    console.log(`  已解压：${dir}`)
    return dir
  }
  console.log(`  解压 → ${dest}`)
  const run = spawnSync('tar', ['-xf', tarball, '-C', dest], { stdio: 'inherit' })
  if (run.status !== 0) throw new Error(`tar 解压失败：${tarball}`)
  return dir
}

/**
 * 确保两份物料就位，返回它们的绝对路径。build.mjs 直接复用，不重复拼路径。
 * @returns {Promise<{wasiSdk: string, llvmSrc: string, llvmVersion: string}>}
 */
export async function ensureSources() {
  await mkdir(CACHE_DIR, { recursive: true })
  const key = hostKey()
  const sdkAsset = VERSIONS.wasiSdk.assets[key]
  if (!sdkAsset) {
    throw new Error(`versions.json 里没有 ${key} 的 wasi-sdk 物料（已有：${Object.keys(VERSIONS.wasiSdk.assets).join(', ')}）`)
  }

  console.log('wasi-sdk（交叉编译器 + sysroot）')
  const sdkTar = join(CACHE_DIR, `wasi-sdk-${VERSIONS.wasiSdk.version}-${key}.tar.gz`)
  await download(sdkAsset.url, sdkTar, sdkAsset.sha256)
  const wasiSdk = untar(sdkTar, CACHE_DIR, sdkAsset.dir)

  console.log('LLVM 源码')
  const llvmTar = join(CACHE_DIR, `llvm-project-${VERSIONS.llvm.version}.src.tar.xz`)
  await download(VERSIONS.llvm.source.url, llvmTar, VERSIONS.llvm.source.sha256)
  const llvmSrc = untar(llvmTar, CACHE_DIR, VERSIONS.llvm.source.dir)

  return { wasiSdk, llvmSrc, llvmVersion: VERSIONS.llvm.version }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { wasiSdk, llvmSrc, llvmVersion } = await ensureSources()
  console.log('')
  console.log(`wasi-sdk : ${wasiSdk}`)
  console.log(`LLVM     : ${llvmSrc}（${llvmVersion}）`)
}
