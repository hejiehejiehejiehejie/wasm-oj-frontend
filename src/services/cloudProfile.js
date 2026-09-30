/**
 * 云端同步 —— 把「偏好类」设置存到 Cloudflare Worker（cf-config-api）背后的 KV 里，
 * 换一台设备输入同一个 Codeforces handle 就能取回来。
 *
 * 身份是用 **Codeforces handle** 证明的：服务端生成验证码存进 KV，用户把验证码填到
 * 自己 Codeforces 个人资料的 Last name 上，服务端再去读回来比对。
 * 所以「用户名」指的始终是 Codeforces，Cloudflare 只是这个 Worker 的托管平台。
 *
 * 接口一律走相对路径 `/api/*`：那条路由挂在站点自己的域名上（Worker Route），
 * 所以浏览器看来全是同源请求，既不需要 CORS，也不会和 COEP: require-corp 冲突。
 * 本地开发由 vite 的 server.proxy 把 /api 转发到线上域名（见 vite.config.js），
 * 别在这里写死 Worker 域名 —— workers.dev 子域在国内网络不通。
 */

/**
 * 参与云同步的键（12 个）。**只有这里列出来的键会离开这台设备。**
 *
 * 刻意不同步的键，以及理由：
 * - `cp.judgeBases`：可能是自建判题服务器的地址，而云端的配置是公开可读的
 *   （GET /api/config/<handle> 不需要任何鉴权），不该把内网地址送上去；
 * - `cp.testCases`：用户手写的测试用例，属于内容而不是偏好，而且体积大；
 * - `cp.localRuntime.clangReady` / `pythonReady` / `markdownReady`：这三个是
 *   「**这台设备**有没有下载过」的事实，由缓存探针判断，换台设备根本不成立，
 *   同步过去只会让新设备显示一个假的「已就绪」。
 */
export const SYNC_KEYS = [
  'cp.editorSettings', // 编辑器偏好（含主题）
  'cp.editorSettingsVersion', // 存档版本号，一起带过去，免得新设备又跑一次主题迁移
  'cp.shortcuts', // 站点内快捷键绑定
  'cp.uiScale', // 界面缩放
  'cp.uiLocale', // 界面语言
  'cp.panelPosition', // 侧边栏在左还是在右
  'cp.editorShare', // 编辑器与评测面板的宽度比例
  'cp.sidebarTab', // 侧边栏停在「资源管理器」还是「评测样例」
  'cp.mdView', // 题解视图模式（仅编辑 / 双栏 / 仅预览）
  'cp.timeLimitMs', // 全局运行时限
  'cp.engine', // 评测引擎
  'cp.autoPreload', // 「启动时预下载」勾选的运行时 id（见 runtimePreload.js）
]

const API_BASE = '/api'

/**
 * 统一的 POST。网络层失败（离线 / 本地代理没起）在这里折成 `{ success: false }`，
 * 不往外抛 —— 界面只需要一个「失败 + 一句人话」，不想接 fetch 的英文异常。
 */
async function postJson(path, body) {
  let response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    // 压根没连上：离线，或者本地 dev 的 /api 代理没生效
    return { success: false, msg: '', transport: 'unreachable' }
  }

  const payload = await response.json().catch(() => null)
  if (payload && typeof payload === 'object') {
    // 失败时把状态码一并带出去：调用方要区分「服务端不认这枚设备令牌（401）」
    // 与「请求内容本身不合法（400）」—— 两者都带 msg，只看 msg 会误判，
    // 前者该清掉令牌退回取码流程，后者该原样把话传给用户。
    return response.ok ? payload : { ...payload, status: response.status }
  }
  // 连上了、也有状态码，但内容不是 JSON —— 多半是这次请求没走到 /api
  // （被别的中间层当成页面请求，回了 index.html）。把状态码带出去，界面才能说清楚。
  return { success: false, msg: '', transport: 'badBody', status: response.status }
}

/** 取一次性验证码。服务端把它存进 KV（TTL 600s），同一 handle 10 分钟最多 5 次 */
export function requestCode(handle) {
  return postJson('/get-code', { handle })
}

/**
 * 验证并保存：服务端去读该 handle 在 Codeforces 个人资料里的 Last name，
 * 与验证码对得上才把 data 写进 KV。所以「证明是我的」与「保存」是同一个动作。
 * 验证码 10 分钟过期，且**验证成功时服务端会把它删掉** —— 所以成功响应里的 `token`
 * 才是可复用的凭据，之后的写入走 saveWithToken，不必再取码。
 */
export function verifyAndSave(handle, data) {
  return postJson('/verify-save', { handle, data })
}

/**
 * 用**设备令牌**写入，跳过验证码 —— 「验证一次、之后长期免取码」的写入路径。
 *
 * 令牌由 verifyAndSave 成功时签发（响应里的 `token`），存在本机、**不进同步白名单**：
 * 它是「这台设备」的写入权，同步到别的设备等于把凭据搬过去。
 * 服务端不认时回 401（结果里 `status === 401`），调用方应清掉令牌并退回取码流程。
 */
export function saveWithToken(handle, token, data) {
  return postJson('/save', { handle, token, data })
}

/**
 * 读云端配置。这个接口是公开的（没有鉴权），所以「读」不需要先验证。
 * 404 表示该 handle 还没存过配置 —— 那是一种正常状态，用 notFound 单独标出来，
 * 不当成错误传给界面。
 */
export async function fetchCloudProfile(handle) {
  try {
    const response = await fetch(`${API_BASE}/config/${encodeURIComponent(handle)}`)
    if (response.status === 404) return { success: false, notFound: true, msg: '' }
    const payload = await response.json().catch(() => null)
    if (!payload || typeof payload !== 'object') {
      return { success: false, notFound: false, msg: '', transport: 'badBody', status: response.status }
    }
    if (!response.ok) return { success: false, notFound: false, msg: '' }
    return { success: true, notFound: false, data: payload.data, updatedAt: payload.updatedAt }
  } catch {
    return { success: false, notFound: false, msg: '', transport: 'unreachable' }
  }
}

/**
 * 读本机这 12 个键，原样打包。
 * 没有的键直接跳过 —— 不拿一个 undefined 去把别处的真实值覆盖成空。
 * 某个键的值不是合法 JSON（手改过 localStorage）也只跳过那一个，不毁掉整次上传。
 */
export function collectProfile() {
  const data = {}
  for (const key of SYNC_KEYS) {
    try {
      const raw = window.localStorage.getItem(key)
      if (raw === null) continue
      data[key] = JSON.parse(raw)
    } catch {
      /* 坏键跳过 */
    }
  }
  return data
}

/**
 * 把云端配置写回本机，返回真正写进去的条数。
 *
 * 这里再按白名单过滤一遍：服务端存的是**别的设备**上传的内容，即便它已经被
 * 本文件写过一次，也不该假定它只有白名单里的键 —— 不然将来白名单改错了，
 * 就会把任意键写进 localStorage。
 */
export function applyProfile(data) {
  if (!data || typeof data !== 'object') return 0
  let applied = 0
  for (const key of SYNC_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(data, key)) continue
    try {
      window.localStorage.setItem(key, JSON.stringify(data[key]))
      applied += 1
    } catch {
      /* 配额满 / 隐私模式：这一个没写进去，不计数 */
    }
  }
  return applied
}
