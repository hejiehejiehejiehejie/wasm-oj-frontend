/**
 * EdgeOne Pages 中间件 —— 补齐 vercel.json 里那两条 rewrites。
 *
 * 【为什么不是 edgeone.json 的 rewrites】EdgeOne 的 rewrites 只对静态资源生效，
 * 官方明确「不支持 SPA 前端路由重写」，还建议 SPA 不要用 404.html 兜底。
 * 所以「/handle 打开首页」和「/api/* 反代到现有 Worker」都只能放在中间件里。
 *
 * 【/api】生产站点的接口一直挂在 api.998244353.best（Cloudflare Worker），
 * 网页版代码走的是相对路径 /api/*（见 src/services/cloudProfile.js 的 API_BASE）。
 * 换到 .cn 域名后必须原样转发过去，否则云端配置的读取 / 上传全 404。
 *
 * 【其余未命中路径】只兜「单段 handle」这一种（与 vercel.json 的
 * `/:handle([A-Za-z0-9_-]+)` 同一口径）。带扩展名的静态资源、
 * /assets、/wasm、各 .html 入口一律放行，避免把真文件也改写成首页。
 */
const API_ORIGIN = 'https://api.998244353.best'
const HANDLE_PATH = /^\/[A-Za-z0-9_-]+\/?$/

export function middleware(context) {
  const { request, next, rewrite } = context
  const url = new URL(request.url)

  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    return rewrite(`${API_ORIGIN}${url.pathname}${url.search}`)
  }

  if (HANDLE_PATH.test(url.pathname)) {
    return rewrite('/index.html')
  }

  return next()
}
