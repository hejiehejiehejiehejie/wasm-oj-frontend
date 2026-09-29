import { pickReason, requestJson, trimBase } from './http.js'
import { t } from '../../i18n/index.js'

// Judge0 的语言 id 会随部署漂移，所以先问一次 /languages，取不到再退回这组常量。
const FALLBACK_IDS = { cpp: 105, python: 100 }
const NAME_PATTERNS = {
  cpp: /^C\+\+ \(GCC/,
  python: /^Python \(3/,
}

const resolvedIds = new Map()

function toBase64(text) {
  const bytes = new TextEncoder().encode(String(text ?? ''))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(text) {
  if (!text) return ''
  try {
    const binary = atob(text)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    return ''
  }
}

function versionOf(name) {
  const match = name.match(/(\d+(?:\.\d+)*)\)?$/)
  return match ? match[1].split('.').map(Number) : [0]
}

function isNewer(candidate, best) {
  if (!best) return true
  const a = versionOf(candidate.name)
  const b = versionOf(best.name)
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff !== 0) return diff > 0
  }
  return false
}

/** 语言 id 解析结果按 引擎+语言 缓存，一次会话最多问一次 /languages。 */
async function languageIdFor({ base, languageId, signal }) {
  const cacheKey = `${trimBase(base)}|${languageId}`
  if (resolvedIds.has(cacheKey)) return resolvedIds.get(cacheKey)

  const response = await requestJson(`${trimBase(base)}/languages`, { signal })
  let picked = null
  if (response.ok && Array.isArray(response.data)) {
    const pattern = NAME_PATTERNS[languageId]
    let best = null
    for (const item of response.data) {
      if (pattern?.test(item.name ?? '')) best = isNewer(item, best) ? item : best
    }
    picked = best?.id ?? null
  }

  const id = picked ?? FALLBACK_IDS[languageId]
  resolvedIds.set(cacheKey, id)
  return id
}

// 用返回字段而不是 status.id 判读，跨版本更稳。
function classify({ stdout, stderr, compileOutput, statusId, description, durationMs }) {
  if (statusId === 5 || /timeout/i.test(description ?? '')) {
    return { outcome: 'timeout', stdout, stderr, durationMs }
  }
  if (compileOutput) {
    return { outcome: 'compile-error', stdout, stderr: compileOutput, durationMs }
  }
  if (statusId === 4) {
    return {
      outcome: 'rejected',
      stdout,
      stderr: '',
      detail: description || t('engine.judge0.internal'),
      durationMs,
    }
  }
  if (stderr || (statusId !== null && statusId !== 3)) {
    return {
      outcome: 'runtime-error',
      stdout,
      stderr: stderr || description || t('engine.judge0.statusCode', { code: statusId }),
      durationMs,
    }
  }
  return { outcome: 'ok', stdout, stderr: '', durationMs }
}

export const judge0Engine = {
  id: 'judge0',
  labelKey: 'engine.judge0.label',
  hintKey: 'engine.judge0.hint',
  executesCode: true,
  defaultBase: 'https://ce.judge0.com',

  supports(languageId) {
    return languageId in FALLBACK_IDS
  },

  async health(base, signal) {
    const result = await judge0Engine.execute({
      base,
      languageId: 'python',
      code: 'print(1)\n',
      stdin: '',
      signal,
    })
    if (result.outcome === 'ok' && result.stdout.trim() === '1') {
      return { ok: true, message: t('engine.judge0.available', { ms: result.durationMs }) }
    }
    if (result.outcome === 'unreachable') {
      return { ok: false, message: t('engine.judge0.unreachable', { base: trimBase(base) }) }
    }
    return {
      ok: false,
      message: result.detail || result.stderr || t('engine.judge0.returned', { outcome: result.outcome }),
    }
  },

  async execute({ base, languageId, code, stdin, signal, timeLimitMs = 5000 }) {
    const id = await languageIdFor({ base, languageId, signal })
    const query = 'base64_encoded=true&wait=true&fields=stdout,stderr,compile_output,message,status,time,memory'
    const response = await requestJson(`${trimBase(base)}/submissions?${query}`, {
      method: 'POST',
      signal,
      body: {
        language_id: id,
        source_code: toBase64(code),
        input: toBase64(stdin),
        // 全局时限（毫秒）换成 Judge0 的 CPU 时限（秒）。它的默认值是 5 s，
        // 也就是上面那个默认参数，自检路径（health）走的就是它。
        cpu_time_limit: timeLimitMs / 1000,
      },
    })

    if (response.aborted) return { outcome: 'cancelled', stdout: '', stderr: '', durationMs: null }
    if (response.unreachable) {
      return {
        outcome: 'unreachable',
        stdout: '',
        stderr: '',
        detail: t('error.judge0Connect', { base: trimBase(base), hint: t('engine.judge0.hint') }),
        durationMs: response.durationMs,
      }
    }
    if (!response.ok) {
      return {
        outcome: 'rejected',
        stdout: '',
        stderr: '',
        detail: pickReason(response.text, response.status),
        durationMs: response.durationMs,
      }
    }

    const data = response.data ?? {}
    const status = data.status ?? {}
    return classify({
      stdout: fromBase64(data.stdout),
      stderr: fromBase64(data.stderr),
      compileOutput: fromBase64(data.compile_output).trim(),
      statusId: typeof status.id === 'number' ? status.id : null,
      description: status.description ?? data.message ?? '',
      durationMs: response.durationMs,
    })
  },
}
