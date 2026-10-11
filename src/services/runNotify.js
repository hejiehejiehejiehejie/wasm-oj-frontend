/**
 * runNotify —— 评测结果 → 通知（toast）的桥。
 *
 * 【为什么单独一个文件】`notifications.js` 是通用通知系统，不该认识「判定码」；
 * `runner.js` 是评测编排层，不该认识 toast。App.vue 的 runAll / runOne 跑完把
 * 卡片状态交给这里的两个入口，判定码 → 通知的映射全部收在本文件。
 *
 * 【一次运行只弹一条】标题取本批**最严重**的判定码（严重度序见 SEVERITY），
 * 正文是各判定码的计数枚举（零项省略）。特例两条：
 * - 有 CE → 整批没跑成，标题 CE、正文是编译器 stderr 原文、**常驻**，
 *   挂 tag = `run:<文件路径>`。退场三口：手动 ×、再次运行对应代码
 *   （clearRunNotify / notifyRunOutcome 开头的 dismissByTag）、切换或关闭对应
 *   页签（App.vue 的两个 watch）。
 * - 有 ERR → 评测服务层挂了，正文透传 runner 给的原因。
 *
 * 【文案纪律】判定码本身就是标题（AC/WA/TLE/RE/MLE/CE/ERR），不走 i18n；
 * 正文里的量词走 `notifications.run.*`。正文里的动态文本（stderr、ERR detail）
 * 是运行期原文，直接透传。
 */
import { t } from '../i18n/index.js'
import { dismissByTag, notify } from './notifications.js'

/** 计数枚举的顺序与用词（zh / en 各在 messages/notifications.js 的 run 组里） */
const COUNT_KEYS = [
  ['AC', 'notifications.run.passed'],
  ['WA', 'notifications.run.wrongAnswer'],
  ['TLE', 'notifications.run.timeout'],
  ['RE', 'notifications.run.runtimeError'],
  ['MLE', 'notifications.run.memoryLimit'],
]

/** 最严重判定码的取序（ERR/CE 在下面单独走特例，这里管「跑出了结果」的那批） */
const SEVERITY = ['RE', 'MLE', 'TLE', 'WA', 'AC']

/** 常驻正文（编译报错）的截断长度：再多看不清，完整报错在用例卡片的 detail 区 */
const MAX_DETAIL_CHARS = 300

/** 常驻通知的 tag 前缀 + 拼装。唯一出处，App.vue 的两个 watch 也用 clearRunNotify */
function tagFor(path) {
  return path ? `run:${path}` : null
}

function truncate(text) {
  const s = (text ?? '').trim()
  return s.length > MAX_DETAIL_CHARS ? `${s.slice(0, MAX_DETAIL_CHARS)}…` : s
}

/**
 * 收掉某个文件的常驻评测通知（目前只有 CE 会常驻）。
 * 「再次运行」在 runAll / runOne 开头调，「切换 / 关闭页签」在 App.vue 的 watch 里调。
 *
 * @param {string|null} path 文件路径（runCases 的 entryPath）
 */
export function clearRunNotify(path) {
  if (path) dismissByTag(tagFor(path))
}

/**
 * 一批评测跑完后发结果通知。
 *
 * @param {object} payload
 * @param {string|null} payload.path 文件路径（entryPath），作 CE 常驻通知的 tag
 * @param {Array<{verdict: string, detail: string}>} payload.cases 跑完的用例卡片
 *   （App.vue 的 testCases 项就行：只读 verdict 与 detail 两个字段）
 */
export function notifyRunOutcome({ path, cases }) {
  const tag = tagFor(path)
  // 先收旧的常驻通知：再次运行对应代码，上一条 CE 就该走 —— 无论这次结果如何
  if (tag) dismissByTag(tag)

  const total = cases.length
  if (!total) return

  /** @type {Record<string, number>} 判定码 → 张数（'' 与 'idle' 不算） */
  const counts = {}
  for (const item of cases) {
    if (item.verdict) counts[item.verdict] = (counts[item.verdict] ?? 0) + 1
  }
  const ranCodes = Object.keys(counts)
  if (!ranCodes.length) return

  // 特例一：编译失败 —— 整批没跑成，正文给编译器报错原文，常驻
  const compileError = cases.find((item) => item.verdict === 'CE')
  if (compileError) {
    notify({
      type: 'error',
      title: 'CE',
      message: truncate(compileError.detail) || t('notifications.run.compileFallback'),
      duration: 0,
      tag,
    })
    return
  }

  // 特例二：评测服务层挂了 —— 正文透传 runner 给的原因
  const serviceError = cases.find((item) => item.verdict === 'ERR')
  if (serviceError) {
    notify({
      type: 'error',
      title: 'ERR',
      message: serviceError.detail ? truncate(serviceError.detail) : '',
      duration: 3000,
    })
    return
  }

  // 全过：绿 AC，一句话
  if ((counts.AC ?? 0) === total) {
    notify({
      type: 'success',
      title: 'AC',
      message: t('notifications.run.allPassed', { n: total }),
      duration: 3000,
    })
    return
  }

  // 混合：标题取最严重的判定码，正文枚举非零计数。类型只按通过率定
  //（全过 success 已在上面返回）：有过有挂 warning、挂零 error
  const worst = SEVERITY.find((code) => counts[code])
  const summary = COUNT_KEYS
    .filter(([code]) => counts[code])
    .map(([code, key]) => `${t(key)} ${counts[code]}`)
    .join(' · ')
  notify({
    type: (counts.AC ?? 0) > 0 ? 'warning' : 'error',
    title: worst,
    message: summary,
    duration: 3000,
  })
}
