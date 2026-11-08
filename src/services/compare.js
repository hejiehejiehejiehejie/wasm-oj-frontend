/**
 * 换行统一成 `\n`：Windows（`\r\n`）与老式 Mac（`\r`）都抹平。
 *
 * 这一支是**所有比对方式的共同前处理**（见 services/checkers.js）：
 * 严格逐字符也不例外 —— 现代评测机先统一换行符格式，再逐字节比。
 */
export function normalizeNewlines(text) {
  return String(text ?? '').replace(/\r\n?/g, '\n')
}

/**
 * Judge-style output comparison: trailing spaces on each line are ignored and
 * trailing blank lines do not matter.
 */
export function normalizeLines(text) {
  const lines = normalizeNewlines(text)
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
  while (lines.length && lines[lines.length - 1] === '') lines.pop()
  return lines
}

/**
 * @returns {boolean} 实际输出与期望输出是否等价
 */
export function compareOutput(actual, expected) {
  const got = normalizeLines(actual)
  const want = normalizeLines(expected)

  if (got.length !== want.length) return false
  return got.every((line, index) => line === want[index])
}
