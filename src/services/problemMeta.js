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

import { t } from '../i18n/index.js'
import { checkerLabelKey, isCheckerId } from './checkers.js'

/**
 * 全部支持的 OJ。**id 持久化进 VFS 节点，不许随意改字面量**。
 * 显示名走 labelKey（i18n 的调用纪律：数据表只存 key，消费处再 t()）。
 *
 * 【dirName 为什么另立一份且不翻译】题目导入会把它建成真实目录
 * （〈年月〉/〈dirName〉/未分类/，挂在工作区根下）。跟着界面语言变的话，同一道题在中文界面
 * 导入建出「洛谷/」、切到英文再导入又建出「Luogu/」，同一个逻辑位置出现两个目录。
 * 所以这一列**语言无关**，值刻意保持改造前的中文字面量，老用户的目录结构一个都不动。
 */
export const OJ_LIST = [
  { id: 'luogu', labelKey: 'oj.luogu', dirName: '洛谷' },
  { id: 'codeforces', labelKey: 'oj.codeforces', dirName: 'Codeforces' },
  { id: 'atcoder', labelKey: 'oj.atcoder', dirName: 'AtCoder' },
  { id: 'nowcoder', labelKey: 'oj.nowcoder', dirName: '牛客' },
  { id: 'leetcode', labelKey: 'oj.leetcode', dirName: 'LeetCode' },
  { id: 'other', labelKey: 'oj.other', dirName: '其它' },
]

/** 洛谷官方八级，按由易到难排列。英文名是意译，见 messages/explorer.js 的文件头 */
export const LUOGU_LEVELS = [
  { id: 'rumen', labelKey: 'oj.luoguLevels.rumen' },
  { id: 'puji-', labelKey: 'oj.luoguLevels.puji-' },
  { id: 'puji', labelKey: 'oj.luoguLevels.puji' },
  { id: 'tigao', labelKey: 'oj.luoguLevels.tigao' },
  { id: 'tigao+', labelKey: 'oj.luoguLevels.tigao+' },
  { id: 'shengxuan', labelKey: 'oj.luoguLevels.shengxuan' },
  { id: 'noi', labelKey: 'oj.luoguLevels.noi' },
  { id: 'ctsc', labelKey: 'oj.luoguLevels.ctsc' },
]

/** 表里的显示名：有 labelKey 就翻译，否则用字面量（分数段那种纯数字）。
 *  导出是因为组件模板里也要用它渲染 OJ / 难度下拉：数据表只存 key、消费处再 t() 这条纪律
 *  在这里的具体落点，两边共用同一份，免得各写一份迟早漂移。 */
export const labelOf = (item) => (item.labelKey ? t(item.labelKey) : (item.label ?? ''))

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
  const found = table.find((item) => item.id === difficulty)
  return found ? labelOf(found) : ''
}

/** 全空的初始值（对话框绑定用）。timeLimit 为 0 = 未设置，单位毫秒；
 *  checker 为空 = 用默认逐行比对（见 services/checkers.js） */
export function emptyMeta() {
  return { url: '', oj: '', difficulty: '', date: '', timeLimit: 0, checker: '' }
}

/** 本地时区的今天，形如 2026-09-28 */
export function todayISO() {
  const now = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/**
 * 题目链接归一化：`meta.url` 是不可信输入（一半来自扩展解析结果、一半来自用户手输），
 * `javascript:` 这类伪协议会被 window.open 当代码执行，所以只放行 http / https，
 * 且返回归一化后的 href；拿不到就给空串。
 *
 * **判据只有这一份**：资源管理器（右键菜单那一项 + 树行上的 ⌘ / Ctrl + 单击）与页签栏
 * （页签右键菜单 + ⌘ / Ctrl + 单击）都走它。菜单项也用它做 `v-if` —— 拿不到链接就不给
 * 这一项，免得出现点了没反应的菜单。
 * @param {{ url?: string } | null | undefined} meta
 * @returns {string}
 */
export function problemUrlOf(meta) {
  const raw = meta?.url
  if (!raw) return ''
  try {
    const target = new URL(raw)
    return target.protocol === 'http:' || target.protocol === 'https:' ? target.href : ''
  } catch {
    return ''
  }
}

/**
 * 在新标签页打开这道题。返回「到底开没开」—— 调用方（⌘ / Ctrl + 单击）要靠它决定
 * 要不要退化成普通单击，所以拿不到链接时**必须**回 false，不能只是静默。
 * @param {{ url?: string } | null | undefined} meta
 * @returns {boolean}
 */
export function openProblemUrl(meta) {
  const url = problemUrlOf(meta)
  if (!url) return false
  window.open(url, '_blank', 'noopener')
  return true
}

/** timeLimit 合法范围（毫秒）：低于 100ms 毫无意义，高于 60s 足以覆盖任何 OJ */
const TIME_LIMIT_MIN_MS = 100
const TIME_LIMIT_MAX_MS = 60000

/**
 * 逐键校验一份来路不明的元数据，丢弃越界 / 未知值。
 * 全空时返回 null —— 调用方据此把节点上的 meta 整个删掉，而不是留一个空壳。
 * @param {unknown} raw
 * @returns {{ url: string, oj: string, difficulty: string, date: string, timeLimit: number, checker: string } | null}
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
  // 比对方式：注册表里认得的 id 原样存，**包括 `lines`**。2026-11-09 起它不再是「内置默认值」
  // 的同义词 —— 全局设置（cp.checker）可能就是别的档，此时题目显式选了「逐行」必须能存下来，
  // 否则会被当成「没选」而跟着全局走。空串 / 未知 id 一律退空（= 跟随全局设置）。
  const checker = isCheckerId(source.checker) ? String(source.checker) : ''

  if (!url && !oj && !date && !difficulty && !timeLimit && !checker) return null
  return { url, oj, difficulty, date, timeLimit, checker }
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
 * 难度归一化：按该 OJ 的口径校验，非法 / 越界 / 空值一律退 `''`。
 *
 * 导出是因为「难度目录」那一步也要用同一把尺子：落盘目录名与写进 meta 的值
 * 必须是同一个（否则会出现「目录叫 1623、元数据里却没有难度」这种自相矛盾的状态）。
 * @param {string} oj
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeDifficulty(oj, value) {
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
 * @param {{ url?: string, oj?: string, difficulty?: string, date?: string, timeLimit?: number, checker?: string } | null | undefined} meta
 * @returns {string}
 */
export function formatMetaTooltip(meta) {
  if (!meta) return ''
  const lines = []
  const oj = OJ_LIST.find((item) => item.id === meta.oj)
  if (oj) lines.push(t('explorer.tooltip.oj', { value: labelOf(oj) }))
  const difficulty = difficultyLabel(meta.oj, meta.difficulty)
  if (difficulty) lines.push(t('explorer.tooltip.difficulty', { value: difficulty }))
  const checkerKey = checkerLabelKey(meta.checker)
  if (checkerKey) {
    lines.push(t('explorer.tooltip.checker', { value: t(checkerKey) }))
  }
  if (meta.timeLimit && meta.timeLimit > 0) {
    lines.push(t('explorer.tooltip.timeLimit', { value: meta.timeLimit / 1000 }))
  }
  if (meta.date) lines.push(t('explorer.tooltip.date', { value: meta.date }))
  if (meta.url) lines.push(meta.url)
  return lines.join('\n')
}