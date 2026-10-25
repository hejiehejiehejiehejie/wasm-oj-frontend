/**
 * 输出比对器注册表 —— 「什么算答对」这件事的唯一出处。
 *
 * 与 engines/ 同款思路：界面只认识 id，具体怎么比在这里一份。
 * 默认（`lines`）就是项目原来的口径（`compare.js`），一行不动；其余几种都必须
 * **按题开启**（写在题目 meta 的 checker 里），不许全局放宽 —— 判定规范 §7.2 的约定。
 *
 * 各模式只回答「这两段输出是否等价」，不判 TLE / MLE / RE：
 * 那些由引擎的 outcome 决定，比对只在 exit 0 之后发生（见 services/runner.js）。
 */

import { normalizeLines } from './compare.js'

/**
 * 四种比对方式。id 会写进 VFS 的 meta，**不许随意改字面量**。
 * 显示名走 labelKey（数据表只存 key，消费处再 t()）。
 *
 * - lines     ：逐行完全相等（忽略行尾空白、末尾空行）—— 现行默认
 * - tokens    ：按空白切成词元，忽略所有空白差异
 * - float     ：词元一致，数字按容差比较
 * - unordered ：行内容相同即可，顺序不限
 */
export const CHECKERS = [
  { id: 'lines', labelKey: 'tests.checker.lines' },
  { id: 'tokens', labelKey: 'tests.checker.tokens' },
  { id: 'float', labelKey: 'tests.checker.float' },
  { id: 'unordered', labelKey: 'tests.checker.unordered' },
]

/** 未配置（或配置非法）时用的比对方式 */
export const DEFAULT_CHECKER_ID = 'lines'

/**
 * 浮点容差（绝对 + 相对混合）：`|a - b| <= FLOAT_TOLERANCE * max(1, |a|, |b|)`。
 * 1e-6 是主流 OJ 浮点题最常见的档位；按题开启，不全局生效。
 */
export const FLOAT_TOLERANCE = 1e-6

const BY_ID = new Map(CHECKERS.map((checker) => [checker.id, checker]))

export function isCheckerId(id) {
  return typeof id === 'string' && BY_ID.has(id)
}

/** 展示名的 i18n key；未知 id 给空串，调用方据此整行不显示（消费处自己 t()） */
export function checkerLabelKey(id) {
  return BY_ID.get(id)?.labelKey ?? ''
}

/** 按空白切词；空串 / 纯空白给空数组（不是 ['']） */
function tokenize(text) {
  const trimmed = String(text ?? '').trim()
  return trimmed ? trimmed.split(/\s+/) : []
}

/** 词元能当作有限数字时返回数值，否则 null（`NaN` / `inf` 这类按字符串比） */
function finiteNumber(token) {
  const value = Number(token)
  return Number.isFinite(value) ? value : null
}

function sameTokens(actual, expected, compareToken) {
  const got = tokenize(actual)
  const want = tokenize(expected)
  if (got.length !== want.length) return false
  return got.every((token, index) => compareToken(token, want[index]))
}

const CHECK_FUNCTIONS = {
  lines(actual, expected) {
    const got = normalizeLines(actual)
    const want = normalizeLines(expected)
    if (got.length !== want.length) return false
    return got.every((line, index) => line === want[index])
  },

  tokens(actual, expected) {
    return sameTokens(actual, expected, (a, b) => a === b)
  },

  float(actual, expected) {
    return sameTokens(actual, expected, (a, b) => {
      if (a === b) return true
      const left = finiteNumber(a)
      const right = finiteNumber(b)
      if (left === null || right === null) return false
      const scale = Math.max(1, Math.abs(left), Math.abs(right))
      return Math.abs(left - right) <= FLOAT_TOLERANCE * scale
    })
  },

  unordered(actual, expected) {
    const got = normalizeLines(actual).slice().sort()
    const want = normalizeLines(expected).slice().sort()
    if (got.length !== want.length) return false
    return got.every((line, index) => line === want[index])
  },
}

/**
 * 比对一次 stdout 与期望输出。
 *
 * @param {string} actual 程序标准输出
 * @param {string} expected 期望输出
 * @param {string} [checkerId] meta.checker；空 / 未知一律退回默认逐行
 * @returns {boolean}
 */
export function checkOutput(actual, expected, checkerId = DEFAULT_CHECKER_ID) {
  const check = CHECK_FUNCTIONS[isCheckerId(checkerId) ? checkerId : DEFAULT_CHECKER_ID]
  return check(actual, expected)
}
