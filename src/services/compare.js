/**
 * Judge-style output comparison: trailing spaces on each line are ignored and
 * trailing blank lines do not matter.
 */
export function normalizeLines(text) {
  const lines = String(text ?? '')
    .replace(/\r\n?/g, '\n')
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
