/**
 * problemMeta —— 题目元数据的单一出处。
 *
 * 与 editorOptions.js 同款思路：枚举、合法值、展示文案都只放这里一份，
 * 下拉里能选的、读盘时认的、格式化时用的必须互相对得上，拆成两处迟早漂移。
 *
 * 【难度分级纪律】难度不是一张全局表，而是**跟着 OJ 走**：
 * - Codeforces / AtCoder → 分数段（800…3500，步长 100）；
 * - 洛谷 → 官方八级（入门 / 普及- / 普及 / 提高 / 提高+ / 省选 / NOI / CTSC）；
 * - 牛客 / LeetCode / 其它 → 自由文本（这些站点没有统一难度口径）。
 */

/** 全部支持的 OJ。id 持久化进 VFS 节点，不许随意改字面量 */
export const OJ_LIST = [
  { id: 'luogu', label: '洛谷' },
  { id: 'codeforces', label: 'Codeforces' },
  { id: 'atcoder', label: 'AtCoder' },
  { id: 'nowcoder', label: '牛客' },
  { id: 'leetcode', label: 'LeetCode' },
  { id: 'other', label: '其它' },
]

/** 洛谷官方八级，按由易到难排列 */
export const LUOGU_LEVELS = [
  { id: 'rumen', label: '入门' },
  { id: 'puji-', label: '普及-' },
  { id: 'puji', label: '普及' },
  { id: 'tigao', label: '提高' },
  { id: 'tigao+', label: '提高+' },
  { id: 'shengxuan', label: '省选' },
  { id: 'noi', label: 'NOI' },
  { id: 'ctsc', label: 'CTSC' },
]

/** Codeforces / AtCoder 分数段：800…3500，步长 100 */
export const RATING_VALUES = (() => {
  const list = []
  for (let rating = 800; rating <= 3500; rating += 100) {
    list.push({ id: String(rating), label: String(rating) })
  }
  return list
})()

const RATING_OJS = new Set(['codeforces', 'atcoder'])
const LUOGU_OJS = new Set(['luogu'])
const FREE_OJS = new Set(['nowcoder', 'leetcode', 'other'])
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * 该 OJ 采用哪种难度口径。
 * @param {string} oj
 * @returns {'rating'|'luogu'|'free'|null} 未知 / 空 OJ 返回 null
 */
export function difficultySystemFor(oj) {
  if (RATING_OJS.has(oj)) return 'rating'
  if (LUOGU_OJS.has(oj)) return 'luogu'
  if (FREE_OJS.has(oj)) return 'free'
  return null
}

/**
 * 该 OJ 的难度下拉选项；自由文本（或未选 OJ）返回 null —— 调用方据此改为文本框。
 * @param {string} oj
 * @returns {{ id: string, label: string }[] | null}
 */
export function difficultyOptionsFor(oj) {
  const system = difficultySystemFor(oj)
  if (system === 'rating') return RATING_VALUES
  if (system === 'luogu') return LUOGU_LEVELS
  return null
}

/**
 * 难度的展示文案（工具提示用）。自由文本原样返回。
 * @param {string} oj
 * @param {string} difficulty
 * @returns {string}
 */
export function difficultyLabel(oj, difficulty) {
  if (!difficulty) return ''
  const system = difficultySystemFor(oj)
  if (system === 'free') return difficulty
  const table = system === 'rating' ? RATING_VALUES : system === 'luogu' ? LUOGU_LEVELS : null
  if (!table) return ''
  return table.find((item) => item.id === difficulty)?.label ?? ''
}

/** 全空的初始值（对话框绑定用）。timeLimit 为 0 = 未设置，单位毫秒 */
export function emptyMeta() {
  return { url: '', oj: '', difficulty: '', date: '', timeLimit: 0 }
}

/** 本地时区的今天，形如 2026-09-28 */
export function todayISO() {
  const now = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** timeLimit 合法范围（毫秒）：低于 100ms 毫无意义，高于 60s 足以覆盖任何 OJ */
const TIME_LIMIT_MIN_MS = 100
const TIME_LIMIT_MAX_MS = 60000

/**
 * 逐键校验一份来路不明的元数据，丢弃越界 / 未知值。
 * 全空时返回 null —— 调用方据此把节点上的 meta 整个删掉，而不是留一个空壳。
 * @param {unknown} raw
 * @returns {{ url: string, oj: string, difficulty: string, date: string, timeLimit: number } | null}
 */
export function normalizeMeta(raw) {
  if (!raw || typeof raw !== 'object') return null
  const source = /** @type {Record<string, unknown>} */ (raw)

  const url = typeof source.url === 'string' ? source.url.trim().slice(0, 500) : ''
  const oj = OJ_LIST.some((item) => item.id === source.oj) ? String(source.oj) : ''
  const rawDate = typeof source.date === 'string' ? source.date.trim() : ''
  const date = DATE_PATTERN.test(rawDate) ? rawDate : ''
  const difficulty = normalizeDifficulty(oj, source.difficulty)
  const timeLimit = normalizeTimeLimit(source.timeLimit)

  if (!url && !oj && !date && !difficulty && !timeLimit) return null
  return { url, oj, difficulty, date, timeLimit }
}

/**
 * 时限校验：接受 number 或数字字符串，转整数毫秒并 clamp 到合法范围；
 * 非法 / 空值 / 越界一律退 0（= 未设置，调用方据此不写运行时限）。
 * @param {unknown} value
 * @returns {number}
 */
function normalizeTimeLimit(value) {
  const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(num) || num <= 0) return 0
  const ms = Math.round(num)
  if (ms < TIME_LIMIT_MIN_MS || ms > TIME_LIMIT_MAX_MS) return 0
  return ms
}

/**
 * @param {string} oj
 * @param {unknown} value
 * @returns {string}
 */
function normalizeDifficulty(oj, value) {
  if (typeof value !== 'string') return ''
  const text = value.trim()
  if (!text) return ''
  const system = difficultySystemFor(oj)
  if (system === 'free') return text.slice(0, 60)
  const table = system === 'rating' ? RATING_VALUES : system === 'luogu' ? LUOGU_LEVELS : null
  if (!table) return ''
  return table.some((item) => item.id === text) ? text : ''
}

/**
 * 元数据 → 文件树行的 title 文案（多行）。没有任何内容时返回 ''，
 * 调用方据此不设 title，避免弹出一个空提示。
 * @param {{ url?: string, oj?: string, difficulty?: string, date?: string, timeLimit?: number } | null | undefined} meta
 * @returns {string}
 */
export function formatMetaTooltip(meta) {
  if (!meta) return ''
  const lines = []
  const oj = OJ_LIST.find((item) => item.id === meta.oj)
  if (oj) lines.push(`OJ：${oj.label}`)
  const difficulty = difficultyLabel(meta.oj, meta.difficulty)
  if (difficulty) lines.push(`难度：${difficulty}`)
  if (meta.timeLimit && meta.timeLimit > 0) lines.push(`时限：${meta.timeLimit / 1000}s`)
  if (meta.date) lines.push(`日期：${meta.date}`)
  if (meta.url) lines.push(meta.url)
  return lines.join('\n')
}