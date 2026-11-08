/**
 * 输出比对器注册表 —— 「什么算答对」这件事的唯一出处。
 *
 * 与 engines/ 同款思路：界面只认识 id，具体怎么比在这里一份。
 * 默认（`lines`）就是项目原来的口径（`compare.js`），一行不动。
 *
 * 【谁能改这个默认值】**用户自己**，在 设置 › 评测 › 输出比对 里选（`cp.checker`，
 * 2026-11-09 加）。在此之前只有「按题覆盖」一条路，而那道门藏在资源管理器右键的
 * 「题目信息」里 —— 手写 .cpp 练习的人根本碰不到，只能被动接受逐行比对。
 * 现在两眼：全局设置是**默认档**，题目 meta 里的 `checker` 仍**优先**（按题覆盖 > 全局 > 内置）。
 *
 * 少了这一层「不许全局放宽」的约束（判定规范 §7.2 原写「不得全局放宽」），因为它
 * 拦的是「替用户悄悄放宽」；这里放宽与否由用户在设置里明示，且三种主流口径
 * （逐词 / 严格 / 逐行）本来就是各平台的默认值，没有哪一个是「偷偷宽松」。
 *
 * 各模式只回答「这两段输出是否等价」，不判 TLE / MLE / RE：
 * 那些由引擎的 outcome 决定，比对只在 exit 0 之后发生（见 services/runner.js）。
 */

import { normalizeLines, normalizeNewlines } from './compare.js'

/**
 * 五种比对方式。id 会写进 VFS 的 meta 与 `cp.checker` 存档，**不许随意改字面量**。
 * 显示名走 labelKey（数据表只存 key，消费处再 t()）。
 *
 * - lines     ：逐行完全相等（忽略行尾空白、末尾空行）—— 内置默认（原 compare.js 口径）
 * - tokens    ：按空白切成词元，忽略所有空白差异 —— Codeforces / AtCoder 的 wcmp 口径
 * - strict    ：逐字符完全相等（只统一换行符）—— ASCII art / 严格排版题
 * - float     ：词元一致，数字按容差比较
 * - unordered ：行内容相同即可，顺序不限
 *
 * ⚠️ 表里的**顺序就是设置页下拉的顺序**：默认档排第一，其余按「从宽松到严格」不成立，
 * 所以按使用频率排（逐词 > 严格 > 浮点 > 忽略行序）。
 */
export const CHECKERS = [
  { id: 'lines', labelKey: 'tests.checker.lines' },
  { id: 'tokens', labelKey: 'tests.checker.tokens' },
  { id: 'strict', labelKey: 'tests.checker.strict' },
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

  /**
   * 严格逐字符：**只统一换行符**（`\r\n` / `\r` → `\n`），此后每一个字符都必须对得上 ——
   * 行尾多一个空格、末尾多一个空行、把两行并成一行，全算 WA。
   *
   * 为什么换行符这一步不能省（用户 2026-11-09 定的口径，也是现代评测机的做法）：
   * 桌面端引擎（`native.rs`）在 Windows 上给回来的 stdout 是 `\r\n`，而期望输出是用户在
   * 面板里敲的 `\n`。不先抹平，这道题在 Windows 上永远 WA —— 而它跟用户的代码无关。
   */
  strict(actual, expected) {
    return normalizeNewlines(actual) === normalizeNewlines(expected)
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
