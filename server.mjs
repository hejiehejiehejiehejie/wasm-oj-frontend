/**
 * 网页版发布用的极薄服务器，替代 vercel.json 里的三件事：
 *   1) COOP / COEP —— 网页版 wasm 判题硬依赖跨域隔离（SharedArrayBuffer）
 *   2) .br 资源的 Content-Encoding —— 工具链靠浏览器透明解压，缺了头就加载不出来
 *   3) /api/* 反代 与 /:handle 回退到 index.html —— 与 Vercel 的 rewrites 保持一致
 *
 * 只依赖 Node.js 20 内置模块，静态文件从本文件所在目录读取（发布产物即为该目录）。
 */
import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('.', import.meta.url))
const PORT = Number(process.env.PORT) || 8000
const API_ORIGIN = 'https://api.998244353.best'
// 线上原站：插件历史版本包不随本站发布（平台限制），缺失时回源取
const SITE_ORIGIN = 'https://www.998244353.best'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
  '.tar': 'application/x-tar',
  '.pch': 'application/octet-stream',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.gz': 'application/gzip',
  '.br': 'application/octet-stream',
}

const NO_STORE = new Set([
  '/sw.js',
  '/manifest.webmanifest',
  '/precache-manifest.json',
  '/retain-manifest.json',
  '/robots.txt',
  '/sitemap.xml',
])

function isolationHeaders() {
  return {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'X-Content-Type-Options': 'nosniff',
  }
}

function resolveFile(pathname) {
  let decoded
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return null
  }
  if (decoded.includes('\0')) return null
  const relative = decoded.replace(/^\/+/, '')
  if (!relative) return null
  const absolute = join(ROOT, relative)
  if (absolute !== ROOT && !absolute.startsWith(ROOT)) return null
  return absolute
}

function cacheControl(pathname) {
  if (pathname.startsWith('/wasm/') || pathname.endsWith('.wasm')) {
    return 'public, max-age=31536000, immutable'
  }
  if (NO_STORE.has(pathname)) return 'public, max-age=0, must-revalidate'
  return 'public, max-age=3600'
}

async function sendFile(req, res, file, pathname) {
  let info
  try {
    info = await stat(file)
  } catch {
    return false
  }
  if (!info.isFile()) return false

  const brotli = file.endsWith('.br')
  const inner = brotli ? file.slice(0, -3) : file
  const headers = {
    ...isolationHeaders(),
    'Content-Type': MIME[extname(inner).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': cacheControl(pathname),
    'Last-Modified': info.mtime.toUTCString(),
    ETag: `W/"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`,
  }
  if (pathname === '/sw.js') headers['Service-Worker-Allowed'] = '/'
  if (brotli) headers['Content-Encoding'] = 'br'

  if (req.headers['if-none-match'] === headers.ETag) {
    res.writeHead(304, headers)
    res.end()
    return true
  }

  let start = 0
  let end = info.size - 1
  const range = req.headers.range
  if (range && !brotli) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range)
    if (match) {
      if (match[1] === '' && match[2] !== '') {
        start = Math.max(0, info.size - Number(match[2]))
      } else if (match[1] !== '') {
        start = Number(match[1])
        if (match[2] !== '') end = Math.min(Number(match[2]), info.size - 1)
      }
      if (start > end || start >= info.size) {
        res.writeHead(416, { ...headers, 'Content-Range': `bytes */${info.size}` })
        res.end()
        return true
      }
      headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`
      headers['Accept-Ranges'] = 'bytes'
      res.writeHead(206, headers)
      createReadStream(file, { start, end }).pipe(res)
      return true
    }
  }

  headers['Accept-Ranges'] = 'bytes'
  headers['Content-Length'] = String(info.size)
  res.writeHead(200, headers)
  if (req.method === 'HEAD') {
    res.end()
    return true
  }
  createReadStream(file).pipe(res)
  return true
}

async function proxy(req, res, origin, url) {
  const headers = {}
  for (const [key, value] of Object.entries(req.headers)) {
    if (['host', 'connection', 'content-length', 'accept-encoding'].includes(key)) continue
    if (value !== undefined) headers[key] = value
  }

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
  try {
    const upstream = await fetch(origin + url.pathname + url.search, {
      method: req.method,
      headers,
      body: hasBody ? req : undefined,
      duplex: hasBody ? 'half' : undefined,
      redirect: 'manual',
      signal: AbortSignal.timeout(30000),
    })

    const out = {}
    upstream.headers.forEach((value, key) => {
      if (['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(key)) return
      out[key] = value
    })
    res.writeHead(upstream.status, { ...isolationHeaders(), ...out })
    if (upstream.body) {
      for await (const chunk of upstream.body) res.write(chunk)
    }
    res.end()
  } catch {
    res.writeHead(502, { ...isolationHeaders(), 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Bad Gateway')
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost')

  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    return proxy(req, res, API_ORIGIN, url)
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, isolationHeaders())
    res.end()
    return
  }

  const file = resolveFile(url.pathname)
  if (file && (await sendFile(req, res, file, url.pathname))) return

  // 发布平台不允许上传内含压缩包的归档，插件安装包与工具链归档改由原站回源
  if (url.pathname.startsWith('/extension/') || /\.(zip|tar|tar\.gz|tar\.br)$/.test(url.pathname)) {
    return proxy(req, res, SITE_ORIGIN, url)
  }

  // 首页：静态目录查找不会命中目录本身，显式回落到 index.html
  if (url.pathname === '/' || url.pathname === '/index.html') {
    if (await sendFile(req, res, join(ROOT, 'index.html'), '/index.html')) return
  }

  // 与 vercel.json 的 `/:handle([A-Za-z0-9_-]+)` 回退一致：单段路径交给前端路由
  if (/^\/[A-Za-z0-9_-]+$/.test(url.pathname)) {
    if (await sendFile(req, res, join(ROOT, 'index.html'), '/index.html')) return
  }

  res.writeHead(404, { ...isolationHeaders(), 'Content-Type': 'text/plain; charset=utf-8' })
  res.end('Not Found')
})

server.listen(PORT, '0.0.0.0')
