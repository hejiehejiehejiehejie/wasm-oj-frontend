#!/usr/bin/env node
/**
 * 生成「预编译 PCH」这份静态资源：`public/wasm/<工具链版本>/pch-<存档版本>-<头文件指纹>.pch.br`。
 *
 * 为什么要有这个脚本
 * ------------------
 * 站内的 PCH 原先只在本机生成（clang `-emit-pch` 跑一遍整份万能头），M 系 Mac 约 1.3s，
 * 老手机要几十秒。18.4MB 的 PCH 压出来只有 8.3MB（序列化 AST 压不动，比例约 2.2×），
 * 直接下发能把这笔 CPU 从用户身上拿掉。2026-10-27 用户拍板「一律下发」。
 *
 * 为什么用**浏览器**生成而不是在 node 里拼一套
 * --------------------------------------------
 * PCH 的控制块里签着 clang 版本、语言 / 目标选项、以及每个输入头的路径 + 大小 + mtime。
 * 任何一项对不上，clang 会 fatal，而站内的「降级重试」会把它吃掉 —— 症状是「PCH 从来不
 * 生效、编译一直慢」，不报错、极难发现。所以这份字节必须由**站内那条真实路径**产出：
 * 同一份 clang.wasm、同一份 sysroot.tar、同一份 UNIVERSAL_HEADER、逐字共用的 FRONTEND_ARGS、
 * 以及 wasi.worker.js 里钉死的 mtime 常量。在 node 里重写一遍参数就等于复制一份会走偏的
 * 真值（runnoSandbox.js 开头就写着「必须逐字共用这一份」）。
 *
 * 流程：起 dev server → 拦掉对 .pch.br 的请求（强制走本机生成）→ ensurePch 的产物
 * 上传回 node → brotli q11 压 → 落盘 → **再开一个干净 profile 校验一遍**（真实加载、
 * 真编译一次，确认这份资源会被 clang 接受）。校验失败直接非零退出，不许把坏资源留在仓库里。
 *
 * 用法：
 *   npm run pch:build              # 生成（已存在同名资源也会重新生成）
 *   npm run pch:build -- --keep    # 保留临时 profile，便于看现场
 * 环境变量：
 *   CHROME_PATH  自定义 Chrome 可执行文件（同 verify-ui.mjs）
 *
 * 什么时候必须重跑：clang / sysroot 换代（`TOOLCHAIN_VERSION`）、万能头文本改了、
 * 或者 `PCH_CACHE_VERSION` / `FRONTEND_ARGS` 变了。文件名带后两者，所以「忘了重跑」
 * 的表现是 404 → 运行时静默退回本机生成（不自伤，只是白搭）；而「忘了升版本号又重跑」，
 * 表现是旧资源被新运行时判废 —— 两种都在下面第 3 步会被抓出来。
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { createServer as createNetServer } from 'node:net'
import { createHash } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { brotliCompressSync, constants } from 'node:zlib'
import puppeteer from 'puppeteer-core'

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
]
const CHROME = process.env.CHROME_PATH ?? CHROME_CANDIDATES[0]
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const keepProfile = process.argv.includes('--keep')

function freePort() {
  return new Promise((resolve_, reject) => {
    const probe = createNetServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address()
      probe.close(() => resolve_(port))
    })
  })
}

/** 起 dev server；页面能起来就说明所有 SFC 都编译过了（不需要另跑 build） */
async function startDevServer(port) {
  const child = spawn(
    process.execPath,
    [join(ROOT, 'node_modules/vite/bin/vite.js'), 'dev', '--port', String(port), '--strictPort'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  await new Promise((resolve_, reject) => {
    const timer = setTimeout(() => reject(new Error('dev server 启动超时')), 60_000)
    child.stdout.on('data', (chunk) => {
      if (String(chunk).includes('Local')) {
        clearTimeout(timer)
        resolve_()
      }
    })
    child.once('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`dev server 退出 code=${code}`))
    })
  })
  return child
}

/**
 * 一个「干净 profile + 已加载页面」的上下文。
 * 每个场景都要独立 context：IndexedDB / localStorage 是跨页共享的，混在一起会互相串。
 */
async function openPage(browser, url) {
  const context = await browser.createBrowserContext()
  const page = await context.newPage()
  page.setDefaultTimeout(900_000)
  await page.setViewport({ width: 1280, height: 900 })
  await page.evaluateOnNewDocument(() => {
    // 110% 缩放会让容器查询之类的判定跟着变；这里只要编译链路，固定成 1
    localStorage.setItem('cp.uiScale', JSON.stringify(1))
    // 自动预取会抢带宽（还可能在页面里先下一份 PCH），关掉让链路可复现
    localStorage.setItem('cp.autoPreload', JSON.stringify([]))
  })
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForSelector('.monaco-editor')
  return { context, page }
}

const port = await freePort()
const server = await startDevServer(port)
const url = `http://localhost:${port}/`

// 上传通道：18MB 的 base64 走 evaluate 的返回值太笨重，直接 POST 回 node
let resolveUpload
const uploader = createServer((req, res) => {
  const chunks = []
  req.on('data', (chunk) => chunks.push(chunk))
  req.on('end', () => {
    const body = Buffer.concat(chunks)
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*' })
    res.end()
    resolveUpload?.(body)
  })
})
const uploadPort = await freePort()
await new Promise((r) => uploader.listen(uploadPort, '127.0.0.1', r))

let assetFile = ''
let bytes = null
let exitCode = 0

/**
 * 起一个浏览器、跑一段、收工就关。
 *
 * 刻意一段一个浏览器：brotli q11 压 18MB 要 ~40s、峰值内存几 GB，而一颗装着 76MB
 * clang 模块 + 整份 sysroot 的 Chrome 常驻也是同样量级 —— 两件事叠在一起会被系统的
 * 内存守卫直接 SIGTERM 掉（2026-10-27 实测 exit 137、且 stdout 全丢）。
 */
async function withBrowser(task) {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
    // 冷启动要塞 76MB 的 clang 模块，默认 180s 的协议超时会先炸
    protocolTimeout: 900_000,
  })
  try {
    return await task(browser)
  } finally {
    if (!keepProfile) await browser.close().catch(() => {})
  }
}

try {
  // ---------------------------------------------------------------- 1. 本机生成
  bytes = await withBrowser(async (browser) => {
    const { page } = await openPage(browser, url)
    // 拦掉对 .pch.br 的请求 = 强制走本机生成（否则会把仓库里那份下回来，什么都没生成）
    await page.setRequestInterception(true)
    page.on('request', (request) => {
      if (request.url().includes('.pch.br')) void request.abort()
      else void request.continue()
    })

    assetFile = await page.evaluate(async () => {
      const sb = await import('/src/services/runnoSandbox.js')
      return sb.pchAssetFile()
    })
    console.log(`目标资源：public/${assetFile}`)

    const loaded = await page.evaluate(async () => {
      const sb = await import('/src/services/runnoSandbox.js')
      window.__sb = sb
      const startedAt = performance.now()
      await sb.preloadToolchain()
      return Math.round(performance.now() - startedAt)
    })

    const gen = await page.evaluate(async () => {
      const startedAt = performance.now()
      const out = await window.__sb.ensurePch()
      window.__pch = out
      return { ms: Math.round(performance.now() - startedAt), size: out.byteLength }
    })
    console.log(`工具链就绪 ${loaded} ms；生成 PCH ${gen.ms} ms（${gen.size} B）`)

    const uploaded = new Promise((r) => {
      resolveUpload = r
    })
    await page.evaluate(async (target) => {
      await fetch(`http://127.0.0.1:${target}/`, { method: 'POST', body: window.__pch })
    }, uploadPort)
    const received = await uploaded
    if (received.length !== gen.size) throw new Error(`回传字节数不对：${received.length} ≠ ${gen.size}`)
    return received
  })

  // ---------------------------------------------------------------- 2. 压缩 + 落盘
  const compressed = brotliCompressSync(bytes, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 11,
      [constants.BROTLI_PARAM_LGWIN]: 24,
    },
  })
  const target = join(ROOT, 'public', assetFile)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, compressed)
  const sha = createHash('sha256').update(bytes).digest('hex').slice(0, 16)
  console.log(
    `落盘 ${assetFile}\n  原始 ${(bytes.length / 1048576).toFixed(2)} MiB → ` +
      `brotli q11 ${(compressed.length / 1048576).toFixed(2)} MiB（${(bytes.length / compressed.length).toFixed(2)}×）` +
      `  sha256:${sha}`,
  )

  // ---------------------------------------------------------------- 3. 干净 profile 校验
  // 只从资源取 PCH，然后真编译一次：clang 接不接受，全看这一枪。
  // 判据用「两个标记都没被打上」而不是耗时 —— 耗时随机器漂，标记是确定的：
  // 加载失败会走 discardPch，来源是 shipped → 打 cp.pchAssetBad。
  const check = await withBrowser(async (browser) => {
    const fresh = await openPage(browser, url)
    // 「本机扛不住」那种标记长这样：`v<存档版本>`。从资源名里取出来 —— 写死 'v6' 的话，
    // 以后升了版本这行就变成「种了一个过期标记」，校验会在不知不觉中失效。
    const unsupportedToken = `v${assetFile.match(/pch-(\d+)-/)?.[1] ?? ''}`
    await fresh.page.evaluateOnNewDocument((token) => {
      // 造一台「本机生成走不通」的机器：现成的 PCH 必须照样能救回来（也顺带证明
      // 下载那条路不被 cp.pchUnsupported 挡住）
      localStorage.setItem('cp.pchUnsupported', token)
    }, unsupportedToken)
    await fresh.page.reload({ waitUntil: 'load' })
    await fresh.page.waitForSelector('.monaco-editor')

    const result = await fresh.page.evaluate(async () => {
      const sb = await import('/src/services/runnoSandbox.js')
      await sb.preloadToolchain()
      const pch = await sb.ensurePch()
      const run = await sb.runCpp({
        code: '#include <bits/stdc++.h>\nint main(){ std::vector<int> v{3,1,2}; std::sort(v.begin(), v.end()); printf("%d\\n", v[0]); }\n',
        stdin: '',
      })
      return {
        pchBytes: pch ? pch.byteLength : 0,
        ok: run.ok,
        exitCode: run.exitCode,
        stdout: (run.stdout ?? '').trim(),
        unsupported: window.localStorage.getItem('cp.pchUnsupported'),
        assetBad: window.localStorage.getItem('cp.pchAssetBad'),
      }
    })
    await fresh.context.close()
    return result
  })

  const ok = check.pchBytes > 0 && check.ok && check.stdout === '1' && !check.assetBad
  console.log(
    `干净 profile 校验：PCH ${check.pchBytes} B、编译运行 ok=${check.ok}（exit ${check.exitCode}）、` +
      `stdout ${JSON.stringify(check.stdout)}、cp.pchUnsupported=${check.unsupported}、` +
      `cp.pchAssetBad=${check.assetBad} → ${ok ? '通过' : '失败'}`,
  )
  if (!ok) {
    exitCode = 1
    await rm(target, { force: true })
    console.error('校验没过：已删掉刚生成的资源（宁可没有，也不要一份 clang 不认的 PCH）')
  }
} catch (error) {
  exitCode = 1
  console.error(`失败：${String(error?.message ?? error)}`)
} finally {
  server.kill()
  uploader.close()
}

process.exit(exitCode)
