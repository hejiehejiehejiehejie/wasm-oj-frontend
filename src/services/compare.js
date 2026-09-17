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
 * @returns {{match: boolean, hint: string}} `hint` points at the first line that
 * differs so the card can explain a failure in one short sentence.
 */
export function compareOutput(actual, expected) {
  const got = normalizeLines(actual)
  const want = normalizeLines(expected)

  if (want.length === 0 && got.length === 0) {
    return { match: true, hint: '' }
  }

  const shared = Math.min(got.length, want.length)
  for (let i = 0; i < shared; i += 1) {
    if (got[i] !== want[i]) {
      return { match: false, hint: `第 ${i + 1} 行不匹配` }
    }
  }

  if (got.length < want.length) {
    return { match: false, hint: `输出少 ${want.length - got.length} 行` }
  }
  if (got.length > want.length) {
    return { match: false, hint: `输出多 ${got.length - want.length} 行` }
  }

  return { match: true, hint: '' }
}
