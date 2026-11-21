/**
 * 一条用例的「两行字」：判定徽标与运行耗时。
 *
 * 【为什么单独成模块】样例栏有两种外壳（TestCaseCard 的纵向卡片流、TestCaseTabs 的分项视图），
 * 它们在头栏 / 状态栏里要显示的是同一件事：AC / WA / ERR 那枚徽标，与 `12 ms` 那串耗时。
 * 这两套口径一旦各写一份，同一条用例在两种布局里会给出两种说法（最典型的是耗时那三档分界，
 * 10ms / 1s 的切点只要差一个，同一次运行就会一边写 `0.4 ms` 一边写 `0 ms`）。
 * 外壳各写各的，这两件小事只此一份 —— 与 TestCaseBody 那条「正文只此一份」同一条纪律。
 *
 * 这里只做**翻译与格式化**，不读全局状态、不碰 DOM：入参就是 App 里那份用例记录。
 */
import { t } from '../i18n/index.js'

/**
 * 状态 → 徽标文案。跑完的用例用 runner 给的判定码（写在 `verdict` 上，见 services/runner.js），
 * 这里兜的是「还没跑 / 正在跑 / 拿不到判定码」这三种。
 *
 * 只有文字、不带图标（2026-10-06）：判定码本身已经是最短的表达，再加一颗对勾 / 叉
 * 会把胶囊撑宽一倍，也抢掉了 11px 字号那点可读性。
 *
 * ⚠️ 存的是消息 key 而不是翻好的字：这张表在模块加载期就建好，那时 locale 还可能是另一套。
 */
const STATUS_LABELS = {
  idle: 'tests.card.idle',
  running: 'tests.card.running',
  passed: null,
  failed: null,
  error: null,
}
const STATUS_CODES = { passed: 'AC', failed: 'WA', error: 'ERR' }

/** 徽标上那串字：优先用这一轮的判定码，没有才退回状态名 */
export function caseBadgeLabel(record) {
  if (record?.verdict) return record.verdict
  const key = STATUS_LABELS[record?.status] ?? STATUS_LABELS.idle
  return key ? t(key) : STATUS_CODES[record?.status] ?? t(STATUS_LABELS.idle)
}

/**
 * 耗时文案。三档，分界点是 10ms 而不是 1ms：
 *
 *   `≥ 1s`   → `1.23 s`
 *   `< 10ms` → 一位小数（`0.4 ms`）。沙箱换代后只计 `_start()`，`cout` 一行这种程序
 *              常在半毫秒以内，取整会把它们全显示成 `0 ms`，看起来像根本没运行。
 *   `其余`   → 整数毫秒（`123 ms`）。这一段一位小数没有信息量，反而拉长卡片。
 *
 * 后端已经只保留到 0.1ms（`wasi/host.js` 的 `runMs`），这里只负责摘掉尾零。
 * 没跑过（null / undefined）返回空串，调用方据此整块不渲染。
 */
export function caseTimingText(record) {
  const { durationMs } = record ?? {}
  if (durationMs === null || durationMs === undefined) return ''
  const ms = Math.round(durationMs * 10) / 10
  if (ms < 10) return `${ms.toFixed(1)} ms`
  // 进位到 1000 的边界（999.6）也要切秒，否则会显示成 `1000 ms`
  const whole = Math.round(ms)
  return whole >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${whole} ms`
}

/**
 * 一条用例的输入预览（分项视图里悬停 Tab 胶囊时那枚气泡，2026-11-19 加）。
 *
 * 【为什么要截】样例的 input 动辄几十上百行，原样塞进气泡会把整块面板挡住；而按住 Shift 去翻
 * 正文又得先切过去。这里只给「够认出是哪条样例」的前几行，剩下的用一个 `…` 交代。
 *
 * 【两条上限，缺一不可】
 *   - 行数 5：再多气泡就盖住下方正文了（`.app-tip--code` 的行高 1.5、11px）。
 *   - 每行 40 个**显示列**：中日韩字符按 2 列算（见 charColumns）—— 否则一行 40 个汉字
 *     在等宽字体里是 40 个英文字符的两倍宽，气泡会被撑到 600px 上下。
 *   行被切就补 `…`；行数被切则末尾单独占一行 `…`（2026-11-19 用户要求去掉「还有 N 行」那句：
 *   气泡是拿来认内容的，不是拿来报数字的）。
 */
export function caseInputPreview(text, options = {}) {
  const maxLines = options.maxLines ?? 5
  const maxCols = options.maxCols ?? 40
  const raw = typeof text === 'string' ? text : ''
  // 只有空白也算空：那和「没填」在读的人眼里是同一件事，没必要画一个空白的代码块
  if (!raw.trim()) return t('tests.tabs.previewEmpty')
  // 结尾那个换行不算一行：粘贴普遍带一个，否则行数会多算一行
  const body = raw.endsWith('\n') ? raw.slice(0, -1) : raw
  const lines = body.split('\n')
  const shown = lines.slice(0, maxLines).map((line) => clipLine(line, maxCols))
  // 行数被切：最后单独占一行省略号，不再写「还有 N 行」
  if (lines.length > maxLines) shown.push('…')
  return shown.join('\n')
}

/**
 * 把一行按**显示列**截到 maxCols，切过就补一个 `…`（占最后一列）。
 * 逐码点遍历而不是 `slice`：emoji 与带变音符号的字符都是代理对，按 UTF-16 下标切会切出半个字。
 */
function clipLine(line, maxCols) {
  if (!line) return ''
  if (displayColumns(line) <= maxCols) return line
  // 超宽才逐字累加，给末尾那颗省略号留 1 列
  let used = 0
  let out = ''
  for (const ch of line) {
    const width = charColumns(ch)
    if (used + width > maxCols - 1) break
    out += ch
    used += width
  }
  return `${out}…`
}

function displayColumns(text) {
  let columns = 0
  for (const ch of text) columns += charColumns(ch)
  return columns
}

/** 全角 / 宽字符（CJK、假名、谚文、全角标点、常见 emoji）在等宽字体里占两列 */
const WIDE_CHAR = /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]|[\u{1F300}-\u{1FAFF}]/u

function charColumns(ch) {
  return WIDE_CHAR.test(ch) ? 2 : 1
}

/**
 * 工作台左轨样例行上那颗状态点该是什么色（`data-status` 的取值）。
 * 返回空串 = 还没跑过 —— 行上仍然画点，只是画成**空心环**（见 TestCaseTabs 的 `.case-row__dot`）。
 * 分项页签（`.tab`）自 2026-11-21 起不再画圆点，判定码只靠右下角的水印交代。
 *
 * 「结果待重测」压过判定色：那时旧结论已经不作数，画一颗绿点会让人以为它还是 AC
 * （卡片那边靠整张降透明度表达同一件事；一个小小的胶囊没有那层地方，只能换色）。
 */
export function caseDotStatus(record) {
  if (!record) return ''
  if (record.stale) return 'stale'
  if (record.status === 'passed' || record.status === 'failed' || record.status === 'error') {
    return record.status
  }
  return record.status === 'running' ? 'running' : ''
}

/**
 * 页签 / 折叠窄条上的判定码水印（2026-11-20；2026-11-21 结论过期也保留）。
 *
 * 用判定码本身代替状态圆点，窄轨里也能一眼扫出哪条挂了。运行中给蓝色的 `RUN`；
 * 没跑过（verdict 为空）才不画。
 *
 * 结论过期（stale）**照样保留上一轮的判定码**，只是整枚压成中性灰（见 caseStampTone）：
 * 分项视图是改完代码后唯一还看得到运行结果的地方，抹成空态等于把这份读数也一起丢了；
 * 灰色既保住读数，又明确表示「这不是当前代码的结论」。
 */
export function caseStampCode(record) {
  if (!record) return ''
  if (record.status === 'running') return 'RUN'
  if (!record.verdict) return ''
  return record.verdict
}

/**
 * 水印语义档：RUN 蓝、AC 绿、WA 红、TLE / MLE 琥珀、CE / RE / ERR 橙红；
 * 结论过期（stale）一律 `stale`（中性灰）。
 */
export function caseStampTone(record) {
  const code = caseStampCode(record)
  if (!code) return ''
  if (record.stale) return 'stale'
  if (code === 'RUN') return 'info'
  if (code === 'AC') return 'ok'
  if (code === 'WA') return 'err'
  if (code === 'TLE' || code === 'MLE') return 'warn'
  if (code === 'CE' || code === 'RE' || code === 'ERR') return 're'
  return ''
}
