export function trimBase(base) {
  return String(base ?? '').replace(/\/+$/, '')
}

/**
 * 所有引擎共用的 JSON 请求入口：统一计时、统一把网络失败和 HTTP 失败分开，
 * 这样上层能区分"服务不可达"和"代码跑挂了"。
 */
export async function requestJson(url, { method = 'GET', body, signal, headers } = {}) {
  const startedAt = performance.now()
  const elapsed = () => Math.round(performance.now() - startedAt)

  try {
    const response = await fetch(url, {
      method,
      signal,
      headers: {
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await response.text().catch(() => '')
    let data = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = null
    }
    return { ok: response.ok, status: response.status, data, text, durationMs: elapsed() }
  } catch (error) {
    if (error?.name === 'AbortError') {
      return { ok: false, aborted: true, status: 0, data: null, text: '', durationMs: elapsed() }
    }
    return {
      ok: false,
      unreachable: true,
      status: 0,
      data: null,
      text: String(error?.message ?? error),
      durationMs: elapsed(),
    }
  }
}

/** 从错误响应里挑一句人话出来，避免把整段 JSON 甩到卡片上。 */
export function pickReason(text, status) {
  const raw = String(text ?? '').trim()
  if (!raw) return status ? `HTTP ${status}` : '服务无响应'
  let parsed = null
  try {
    parsed = JSON.parse(raw)
  } catch {
    /* 纯文本响应，直接用 */
  }
  const message = parsed?.message ?? parsed?.error ?? parsed?.detail ?? parsed?.description
  if (message) return `${status ? `${status} · ` : ''}${message}`
  return raw.length > 220 ? `${raw.slice(0, 220)}...` : raw
}
