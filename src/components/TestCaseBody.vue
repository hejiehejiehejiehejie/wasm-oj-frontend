<script setup>
/**
 * 一条样例的正文：input / Expected 两个框 + Actual 输出块。
 *
 * 【为什么单独成组件】样例栏有两种列表面孔（2026-11-19 起规划）：纵向卡片流里每张卡都有一份正文，
 * 分项标签视图里同一时刻只有一份、跟着当前 Tab 原地换内容。两种面孔的外壳（头栏高度、折叠、
 * 滚动所有者）完全不同，但**正文这一块一个字都不该有两份实现** —— 差异染色、超长截断、
 * 高度自适应这些东西任何一处写歪，两种布局就会给出两种「同一个样例的样子」。
 * 所以外壳各写各的（TestCaseCard / 后续的 TestCaseTabs），正文只此一份。
 *
 * 【它自己不知道的事】判定色（AC 绿 / WA 红）以前由卡片根节点的 `[data-status]` 兜下来，
 * 拆开之后卡片管不到里面了，于是把状态挂在本组件根节点上（`.card__body[data-status]`），
 * 让 `.out` 的那三条配色规则跟着正文走 —— 而不是在卡片里用 `:deep(.out)` 远程改别人的字色。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import ContextMenu from './ContextMenu.vue'
import { locale, t } from '../i18n/index.js'
import { px, uiScale } from '../composables/useUiScale.js'
import { DEFAULT_CHECKER_ID } from '../services/checkers.js'
import { editorSettings } from '../services/editorSettings.js'
import { caseBadgeLabel, caseTimingText } from '../services/caseSummary.js'
import { notify } from '../services/notifications.js'
import { diffOutput, markSegments } from '../services/outputDiff.js'

const props = defineProps({
  testCase: { type: Object, required: true },
  /**
   * 正在运行：整块正文锁定（两个框不可编辑、Actual 上那两颗动作钮按下不响）。
   * 名字与卡片头栏那个 locked 同源，由外壳透传。
   */
  locked: Boolean,
  /**
   * 宽松档（2026-11-19，分项视图用）：代码面的高度上限从 320 放宽到 480。
   *
   * 卡片流里每张卡都要给下一条留位置，320 是「一屏能扫过好几条」的取舍；分项视图同一时刻
   * 只有一份正文、纵向空间全归它，再卡 320 就白白浪费半屏、还要在框里滚。
   * 上限本身仍是必须的：样例动辄几万字符，不封顶会把「运行全部」挤出可视区。
   * 只放宽上限、**不改 min-height**：短样例在两种布局里仍然是同一个 76px 的起跳高度。
   */
  roomy: Boolean,
  /**
   * 工作台档（2026-11-20 方案一，底部横跨的评测岛）：三列并排、满高、贴边，
   * 不再有固定高度的小框。字号 / 标签语言 / ACTUAL 的显隐都跟着这一档走。
   */
  workbench: Boolean,
  /**
   * 纵向停靠档（2026-11-20 方案二，左右停靠的评测岛）：上「输入」全宽 45%、
   * 下「期望 | 实际」并排 55%，每个字段满铺剩余高度、自己滚动。
   * 它和工作台共用「无圆角、无固定高度、1px 细线分栏」这套语汇，但网格方向相反 ——
   * 一个横着切三列，一个竖着切两段。窄到 340px 以下回退三行叠放（见样式里的容器查询）。
   */
  vertical: Boolean,
  /**
   * Bento 内胆（2026-11-20 用户要求）：侧栏的分项标签视图沿用纵向岛的正文布局 ——
   * 输入全宽在上、「期望 | 实际」并排在下的三个圆角槽位，满高、各自滚动。
   * 与 `vertical` 的样式完全共用（同一个 is-vertical 类）；区别只在壳 ——
   * 侧栏不再有 36px 状态行，单条结论改由 ACTUAL 列头承担（见下面的 v-if）。
   */
  bento: Boolean,
})

// 正文直接改用例对象本身：用例记录活在 App 的 `testCases` 里，
// 每个字段一条双向绑定就够了，不需要 emit 回写。
function field(name) {
  return computed({
    get: () => props.testCase[name],
    set: (value) => {
      props.testCase[name] = value
      if (props.testCase.status !== 'idle' && props.testCase.status !== 'running') {
        props.testCase.stale = true
      }
    },
  })
}

const input = field('input')
const expectedOutput = field('expectedOutput')

// ---------- 超长样例：截断显示 ----------
// 超长样例有两重问题：① 用户根本看不过来；② 每敲一个字符都要让整段文本重新排版
// （实测 10 万 3.5ms / 100 万 37ms / 200 万 75ms）。
// 所以超过阈值就把**显示**切成「开头一段 + 省略行」，真值一个字节都不动。
// 框里仍然可以编辑，但只能改省略行之前的那一段；省略行本身是省略段的化身 ——
// 它在，省略段就原样拼回真值；它被删掉（含整段全选粘贴覆盖），省略段跟着一起走。
// 复制不受影响：选区里带上省略行（Ctrl+A 就会带上）就等于连省略段一起选中，直接给完整内容。
const IO_PREVIEW_TRIGGER = 6000
const IO_PREVIEW_CHARS = 4000
// 省略行的**全部内容就是一个省略号**（2026-09-29 改）：具体省略了多少由框下面那行说明，
// 框内再重复一遍数字是噪音，而且这行在框里本来就要滚动才看得见。
// 两个常量都依赖固定字面量，所以不能进消息表（见 messages/tests.js 的文件头）：
//   SEED —— commitEdit 靠 indexOf 定位省略行在哪；KEY —— onLongCopy 判定「选区里有没有它」。
// ⚠️ 代价要知道：形如「空行 + ……」的样例内容会被误判成省略行（旧文案 `…… 以下省略 ` 更长、更不易撞）。
// 竞程题目的输入里出现这种组合的概率极低，但**改这两个字面量前先把 commitEdit 的三个分支再读一遍**。
const MARKER_SEED = '\n\n……'
const MARKER_KEY = '……'

const inputId = computed(() => `case-${props.testCase.id}-input`)
const expectedId = computed(() => `case-${props.testCase.id}-expected`)

const isLong = (value) => typeof value === 'string' && value.length > IO_PREVIEW_TRIGGER

const fmt = (n) => n.toLocaleString(locale.value)

// 预览保留的那一段：在 IO_PREVIEW_CHARS 处退到最后一个换行 —— 否则样例里最后一个数会被
// 截成半截，看着像数据本身就是错的。整份样例只有一行时退无可退（lastIndexOf 为 -1），硬切。
function previewBody(value) {
  const head = value.slice(0, IO_PREVIEW_CHARS)
  const cut = head.lastIndexOf('\n')
  return cut > 0 ? head.slice(0, cut) : head
}

const inputLong = computed(() => isLong(props.testCase.input))
const expectedLong = computed(() => isLong(props.testCase.expectedOutput))

// 省略段的长度。**在「进入长文本」那一刻定下来就冻结**，不随后续编辑重算。
// 预览段是按「4000 字符内最后一个换行」收尾的，边界要是每敲一下都重算，收尾位置就跟着挪，
// 用户会看到文字随着自己打字凭空消失或冒出来。
// 但**掉出长文本时必须归零**：用户把可编辑段删光后真值只剩原来那截尾巴（4505 字符，不算长），
// 冻结值留着的话，界面会摆着一句「还有 4,505 个字符未显示」而其实一个字符都没少。
//
// ⚠️ 分项视图（同一份 DOM 换 :test-case）把「用例对象只造一次」这个前提打破了：
// 长 → 长地换成另一条用例时，下面那两个 watch 判据（inputLong / expectedLong）全程为 true、
// 一次都不会触发，冻结值就会是上一条用例的。所以换对象时由 syncCaseState 强制重算一遍。
const inputHidden = ref(0)
const expectedHidden = ref(0)

const hiddenOf = (value) => (isLong(value) ? value.length - previewBody(value).length : 0)

// 只在「长 ↔ 不长」的那一次跳变上重算；长文本内部的打字不触发，收尾位置因此不会漂。
watch(
  inputLong,
  (long) => {
    inputHidden.value = long ? hiddenOf(props.testCase.input) : 0
  },
  { immediate: true },
)
watch(
  expectedLong,
  (long) => {
    expectedHidden.value = long ? hiddenOf(props.testCase.expectedOutput) : 0
  },
  { immediate: true },
)

// 框里显示的那一份：长文本 = 可编辑段 + 省略行；否则就是完整内容。
function displayOf(fullRef, longRef, hiddenRef) {
  return computed(() => {
    const value = fullRef.value
    const hidden = hiddenRef.value
    // hidden 比真值还长只可能出现在「刚被整段换掉、冻结值还没跟上」的那一帧，此时宁可显示全文
    if (!longRef.value || hidden <= 0 || value.length < hidden) return value
    return value.slice(0, value.length - hidden) + MARKER_SEED
  })
}

const inputDisplay = displayOf(input, inputLong, inputHidden)
const expectedDisplay = displayOf(expectedOutput, expectedLong, expectedHidden)

// 把框里的文本还原成真值。
// **省略行是省略段的化身**：它在，省略段就原样接回；它不在了，省略段跟着一起走。
// 后者不是洁癖 —— 按「取省略行之前的部分 + 原尾部」写的话，用户全选粘一份新样例进来时
// （选区含省略行，被一起覆盖），旧的几千个字符会被悄悄缀在新内容后面（实测粘 12 个字符
// 得到 4517 个字符），而且框里看不出来。反过来，用户只删掉省略行里的一两个字时也会连
// 省略段一起丢，这是刻意选的：与「选中省略号就等于选中被省略的那段内容」是同一个心智模型。
function commitEdit(fullRef, hiddenRef, raw) {
  const hidden = hiddenRef.value
  if (hidden <= 0) {
    fullRef.value = raw
    return
  }
  const at = raw.indexOf(MARKER_SEED)
  if (at < 0) {
    fullRef.value = raw
    // 内容整段换了，省略量得按新内容重算：继续用旧数字切会切出一份新旧参半的显示文本。
    // （inputLong 由 true 到 true 不触发上面那个 watch，只能在这儿补一脚。）
    hiddenRef.value = hiddenOf(raw)
    return
  }
  fullRef.value = raw.slice(0, at) + fullRef.value.slice(fullRef.value.length - hidden)
}

const inputModel = computed({
  get: () => inputDisplay.value,
  set: (raw) => commitEdit(input, inputHidden, raw),
})
const expectedModel = computed({
  get: () => expectedDisplay.value,
  set: (raw) => commitEdit(expectedOutput, expectedHidden, raw),
})

// 输入 / 期望输出框的高度随内容自适应：最多长到 MAX_IO_HEIGHT，超出后框内滚动。
// MAX_IO_HEIGHT 是「设计 px」：scrollHeight 是真实 px（吃根字号），所以上限必须用 px()
// 乘上缩放比例，否则 125% 下会在内容还没占满时就提前出滚动条。
const MAX_IO_HEIGHT = 320
// 分项视图的上限（见 props.roomy）。三处共用这一个 computed：高度自适应、期望侧只读视图的
// 内联 max-height、以及下面那条 CSS 里 .out 的上限（走根节点的 data-roomy）。
const maxIOHeight = computed(() => (props.roomy ? 480 : MAX_IO_HEIGHT))
const inputEl = ref(null)
const expectedEl = ref(null)

// 「框里装不下」有两种成因，但**只有 ① 才算「真少了东西」、才配得上任何标记**：
//   ① 被截断（> IO_PREVIEW_TRIGGER）—— 框里根本没有这部分字符（`xxxHidden > 0`），
//      底边换虚线 + 一行「还有 N 个字符未显示 + 复制全部」，两样都是能操作的信息；
//   ② 只是超出框高 —— 字符一个不少、拖滚动条就能看到全部。这一步是浏览器本来的行为，
//      再画什么都是噪音：提示行 2026-09-29 第四次拍板删掉（原话「这不是废话吗？纯溢出态
//      就是没显示全，但是滚动就可以看到所有的」），底边虚线同日第五次拍板删掉。
// 所以 ② 现在**没有任何视觉标记**，只剩 `overflowY: auto` 自带的那根滚动条 —— 那根是浏览器的，
// 不是我们加的。下面这个函数因此不再向 Vue 报告溢出状态，纯粹摆盒子。
function autoGrow(el) {
  if (!el) return
  // 工作台档的高度由三列分栏接管（height: 100%），框内自己滚动。
  // 纵向停靠档同理：两块上半 / 下半分栏各自定高，内联高度必须清掉，
  // 否则切回卡片流时那个值会留在元素上，把自适应高度锁死。
  if (props.workbench || props.vertical || props.bento) {
    el.style.height = ''
    el.style.overflowY = ''
    return
  }
  // 面板所在页签没打开时（display: none）scrollHeight 为 0，此时不动高度，
  // 切到该页签时由下面的 ResizeObserver 重算。
  // （折叠不再是 display: none 了 —— 2026-10-06 起走 .card__fold 的行高动画，
  //   折叠态只是被裁到 0 高，元素仍在布局里，scrollHeight 照旧量得到。）
  if (!el.scrollHeight) return
  const cs = getComputedStyle(el)
  const border = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth)
  el.style.height = 'auto'
  const full = el.scrollHeight + border
  const cap = px(maxIOHeight.value)
  el.style.height = `${Math.min(full, cap)}px`
  el.style.overflowY = full > cap ? 'auto' : 'hidden'
}

/**
 * 把两个框的高度重新量一遍。**所有触发点都走这一条**（外壳通过 ref 调的也是它）。
 *
 * 2026-11-19：触发方式从「watch 里 nextTick(growAll)」统一改成 `{ flush: 'post' }`。
 * 分项视图切 Tab 时同一份 DOM 换 `testCase`，元素上留着的内联 height 还是上一条用例的 ——
 * 若等到下一个 tick 才量，浏览器已经拿旧高度画过一帧（短样例从 76px 起跳的那种闪），
 * post 队列在 patch 之后、绘制之前跑完，就不会有这一帧。
 */
function syncHeight() {
  autoGrow(inputEl.value)
  autoGrow(expectedEl.value)
}

// 监听的是「渲染出来的那一份」：内容越过阈值时显示文本会从完整内容整段换成截断预览
// （再退回来也一样），高度必须跟着重算 —— 光看 testCase 上的字段是接不到这次变化的。
watch([inputModel, expectedModel], syncHeight, { flush: 'post' })
// 全局缩放变化：字号与上限一起变，已经写死的高度要重算一遍
watch(uiScale, syncHeight, { flush: 'post' })

// 正文所在的面板（统一侧边栏的「评测样例」页签）默认是 display: none，
// onMounted 那一刻 scrollHeight 为 0，autoGrow 会直接跳过；之后切到该页签时
// 没有任何重算时机，输入框就会一直塌成一行。ResizeObserver 能接住「从不可见变为可见」
// （宽度 0 → 有值）以及面板宽度变化，只在宽度变大时重算 —— 宽度不受我们自己设的
// height 影响，不会形成回调环。
let growObserver = null
let lastGrownWidth = 0
onMounted(() => {
  syncHeight()
  growObserver = new ResizeObserver((entries) => {
    const width = entries[0]?.contentRect.width ?? 0
    if (width === lastGrownWidth) return
    lastGrownWidth = width
    if (width > 0) syncHeight()
  })
  if (inputEl.value) growObserver.observe(inputEl.value)
})
onBeforeUnmount(() => growObserver?.disconnect())

const outputText = computed(() => {
  const { actualOutput, detail } = props.testCase
  return [actualOutput, detail].filter((part) => part && part.trim()).join('\n')
})

// 「没跑过」与「跑了但没输出」必须是两种长相：前者整块 ACTUAL 不渲染（空框里写
// 「尚未运行」既像输出为空、又白占一块地方）；后者在框里明说「输出为空」。
// 运行中即使还没有本轮输出也留着框 —— 收掉会让卡片在点运行的一瞬间塌一截，
// 正是 App.vue 的 resetCase 里那条「不清上一轮输出」修掉的闪烁。
//
// 工作台档例外（2026-11-20 方案一）：三列必须**恒定**并排，否则没跑时只剩两列、
// 一开跑又变成三列，正文宽度会横跳。所以 idle 也渲染第三列，只是框里写一句
// 「运行后在此显示输出」。
const showActual = computed(() => props.workbench || props.testCase.status !== 'idle')
const actualPlaceholder = computed(() => {
  if (props.testCase.status === 'running') return t('tests.card.running')
  if (props.workbench && props.testCase.status === 'idle') return t('tests.card.outputIdle')
  return t('tests.card.emptyOutput')
})

/** 工作台 ACTUAL 列头右侧的结论（`AC · 0.4 ms` / `待运行`）—— 状态栏让位之后它才是结果归属 */
const statusText = computed(() => {
  const label = caseBadgeLabel(props.testCase)
  const time = caseTimingText(props.testCase)
  return time ? `${label} · ${time}` : label
})

// 实际输出也是同一套：超长就只显示开头一段 + 省略行。它天生只读（是个 <pre>），
// 所以不用像上面两个输入框那样维护「可编辑段」的边界，现算就行。
const outputView = computed(() => {
  const text = outputText.value
  if (!isLong(text)) return { long: false, text, hidden: '' }
  const body = previewBody(text)
  return { long: true, text: `${body}${MARKER_SEED}`, hidden: fmt(text.length - body.length) }
})

/* ---------- 迷你 Buffer（2026-11-20 方案一）：行号槽 + 行数元信息 ---------- */
// 行号只给 ACTUAL 那一条只读输出（2026-11-20 用户要求删掉输入 / 期望的行号：
// 它们的行数少，槽位只是白白占掉一列宽度）。行号用一段 <pre> 文本一口气画出来
// （不是 N 个节点）：几千行也只是一条文本，而且 line-height 与内容完全相同，天然逐行对齐。
// ⚠️ 行号只在**不折行**时成立：输出关掉了软换行（pre 的 white-space: pre），
//   长行走横向滚动，与编辑器缓冲区同一个心智模型。
const lineCount = (text) => (text ? text.split('\n').length : 0)
const gutterText = (text) => {
  const n = Math.max(1, lineCount(text))
  const out = []
  for (let i = 1; i <= n; i += 1) out.push(i)
  return out.join('\n')
}

// 输出为空时框里显示的是系统提示（运行中 / 待运行 / 输出为空），不是数据行 —— 不给行号。
// 只要有真实输出（哪怕只有一个换行）就照常从 1 起。
const actualGutter = computed(() =>
  outputView.value.text ? gutterText(outputView.value.text) : '',
)

/**
 * 行号槽跟着内容滚。内容（textarea / pre）是滚动所有者，行号槽是绝对定位的
 * `overflow: hidden` 盒子 —— 写 scrollTop 即可同步，且完全不影响自动高度。
 */
function syncGutter(event) {
  const ta = event.currentTarget
  const gutter = ta.parentElement?.querySelector('.buffer__gutter')
  if (!gutter) return
  // 行号槽的视口必须与正文等高：textarea 的 clientHeight 已经扣掉横向滚动条，
  // 而行号槽是普通绝对定位盒子、不会被滚动条占位。若不等高，行号槽能滚的距离
  // 更短，滚到底部会提前停住 —— 表现就是「越往下偏得越多」。
  gutter.style.height = `${ta.clientHeight}px`
  gutter.scrollTop = ta.scrollTop
}

// ---------- 差异染色（2026-11-09 加；当晚改版：只改字色、两侧各标各的）----------
// 判定口径在 services/checkers.js，差异本身在 services/outputDiff.js，这里只负责显示。
// `checker` 跟着**这一轮结果**走（runner 的 evaluateCase 写在补丁里）：用户在跑完之后去设置里
// 换了档，不能把上一轮 WA 的差异改写成另一种口径 —— 那会让人以为「刚才其实是这里错了」。
const checkerId = computed(() => props.testCase.checker || DEFAULT_CHECKER_ID)

/**
 * WA 时算一次差异；AC / 运行中 / 没跑过都不算。
 * 返回 `{ got, want }`：`got` 落在 ACTUAL 原文上，`want` 落在 EXPECTED 原文上。
 * 两侧各有各的颜色，所以「实际少了内容」不再需要往实际侧硬塞一个标记 ——
 * 它落在期望侧那一段上，而那里本来就有字可染色。
 *
 * **总开关**（设置 › 评测 › 差异高亮，`cp.editorSettings.diffHighlights`，2026-11-09 加）：
 * 关掉就在第一行返回 null —— 不是算完再丢掉标记，`outputDiff` 根本不进，两个框里一个字都不染，
 * 期望那一格也照旧是可编辑的 `<textarea>`（它切成只读视图的前提就是「期望侧有要标的东西」）。
 * 它关的只是**显示**：判定口径与 verdict 都不受影响。
 */
const diffMarks = computed(() => {
  const record = props.testCase
  if (record.status !== 'failed') return null
  if (!editorSettings.value.diffHighlights) return null
  return diffOutput(record.actualOutput ?? '', record.expectedOutput ?? '', checkerId.value)
})

/**
 * 框里最多能染到第几个字符。
 *
 * 截断态（超长样例只显示开头一段 + 省略行）里，框里渲染的是「前缀 + 省略号」，
 * 而标记是按完整原文算的 —— 前缀部分的偏移仍然成立，越过前缀的那些必须丢掉，
 * 否则会标到省略号上。只截标记、不整段放弃：大输出的第一处差异常常就在开头。
 */
function shownLength(text, truncated) {
  return truncated ? Math.max(0, text.length - MARKER_SEED.length) : text.length
}

/** ACTUAL 框的片段；没有能画出来的标记时返回 null（`markSegments` 会这样答），模板退回纯文本 */
const actualSegments = computed(() => {
  const marks = diffMarks.value?.got
  if (!marks?.length) return null
  const view = outputView.value
  return markSegments(view.text, marks, shownLength(view.text, view.long))
})

/**
 * 期望输出的片段。只要**期望侧有标记**就存在 —— 包括 `replace` 那一份只在悬停时着色的
 * quiet 标记（见 outputDiff.js）：没有它，鼠标停到 ACTUAL 的红字上就没东西可以点亮。
 */
const expectedSegments = computed(() => {
  const marks = diffMarks.value?.want
  if (!marks?.length) return null
  const text = expectedDisplay.value
  return markSegments(text, marks, shownLength(text, expectedHidden.value > 0))
})

/**
 * 鼠标停在哪一处差异上（`pair` 编号，-1 = 没停在任何一处）。
 *
 * 一处差异在两侧各有一段标记（`replace`），或只在一侧（`extra` / `missing`），它们共用
 * 一个 `pair` —— 所以停到任意一段上，同号的那一段都会跟着亮，两个框之间的「对应位置」
 * 因此不用靠数行号去猜。`mouseover` / `mouseleave` 挂在外层 `<pre>` 上做事件委托：
 * 标记最多 120 段 × 两侧，逐个挂监听不值当。
 */
const hoverPair = ref(-1)

function onMarkOver(event) {
  const hit = event.target instanceof Element ? event.target.closest('[data-pair]') : null
  hoverPair.value = hit ? Number(hit.getAttribute('data-pair')) : -1
}

/** 段上的类：`mk` + kind 色，quiet 是「平时不着色、悬停才亮」，is-lit 是本轮悬停命中 */
function markClass(seg) {
  if (!seg.kind) return null
  return ['mk', `mk--${seg.kind}`, { 'mk--quiet': seg.quiet, 'is-lit': seg.pair === hoverPair.value }]
}

/**
 * 期望输出平时是可编辑的 `<textarea>`，而 textarea 由浏览器画字，没法只给其中几个字符染色。
 * 所以「期望侧有要标的内容」时切成只读的 `<pre>`（结构与 ACTUAL 那个一致），点一下换回输入框
 * —— 改期望输出仍然是一步，不是另一种模式。
 *
 * 2026-11-09 深夜起，WA 的 `replace` 也会让期望侧带一份 quiet 标记（悬停才着色），所以
 * **WA 卡片上这一格基本都是只读视图**：先看清差在哪、要改再点一下，比反过来顺手。
 */
const editingExpected = ref(false)

function openExpectedEditor() {
  if (props.locked) return
  editingExpected.value = true
  nextTick(() => {
    autoGrow(expectedEl.value)
    const el = expectedEl.value
    if (!el) return
    el.focus()
    // 光标放末尾：点开多半是为了补一段，放开头会让下一个字符插到最前面去
    el.setSelectionRange(el.value.length, el.value.length)
  })
}

/**
 * 期望侧当前渲染的是不是只读视图（`<pre>`）。
 *
 * 这只读视图与下面的 `<textarea>` 是 v-if / v-else 两个分支，**换边就是一次元素重建**：
 * `autoGrow` 把高度写在元素自己的 style 上，切到只读视图时那个高度跟着 textarea 一起销毁，
 * 切回来则是个新建的空壳 —— 只剩 CSS 的 `min-height`（三行出头），而 `.ta` 的 `overflow-y`
 * 是 hidden，后面几行既露不出来、也拖不出滚动条（用户 2026-11-10 报的就是这个）。
 *
 * 点进编辑那条路不用管（`openExpectedEditor` 里自带一次 autoGrow）；这里接的是
 * **没人碰过期望框**的那一路：WA 之后改代码重跑、判定转成 AC，差异标记归零，
 * 只读视图自动退回输入框 —— 高度没有任何人重算过。
 *
 * 盯「渲染成哪个分支」而不是盯 `expectedSegments`：编辑态下标记仍在，但渲染的已经是
 * textarea，那一次不需要也不该多算一遍。
 */
const expectedInView = computed(() => Boolean(expectedSegments.value) && !editingExpected.value)

watch(expectedInView, syncHeight, { flush: 'post' })

function editExpected(event) {
  // 单击（没选中任何文字）才进编辑：拖选是在挑要复制的片段，别把选择打断
  const picked = String(window.getSelection() ?? '').trim()
  if (picked) return
  // `<pre>` 自己带 tabindex，不拦掉默认动作的话，浏览器会在下一帧把焦点放回那个即将被
  // 换掉的角色上 —— 输入框明明挂上了，光标却不在里面（探针实测 focused=false）。
  // 这一步挡的是 mousedown 已经把焦点交给 `<pre>` 之后的那次回落，和下面 nextTick 里的
  // `focus()` 是两件事，缺一都不稳。
  event?.preventDefault()
  openExpectedEditor()
}

/**
 * 键盘入口（2026-11-09 深夜加）：`<pre tabindex="0">` 能被 Tab 聚焦，但原来只绑了 click，
 * 键盘用户停在这儿按什么都没反应 —— 一个能聚焦、却不能操作的控件比不可聚焦更糟。
 * 这里**不走拖选判断**：键盘上不存在「正在挑要复制的片段」这回事。
 */
function editExpectedByKey(event) {
  event?.preventDefault()
  openExpectedEditor()
}

/**
 * 复制一段文本。两层，缺一不可（2026-10-14 补第 ② 层）：
 *
 *   ① `navigator.clipboard.writeText` —— 只在**安全上下文**存在（https / localhost）。
 *      走这条时不碰 DOM、不动焦点。
 *   ② 临时 textarea + `document.execCommand('copy')` —— 它走的是浏览器原生的 copy 事件，
 *      与页面是不是安全上下文无关。
 *
 * 【为什么必须补 ②】`http`（非 localhost，比如内网直接开 IP）下 `navigator.clipboard`
 * 整个是 `undefined`，① 那行抛的是 `TypeError: Cannot read properties of undefined`；
 * 安全上下文里没授权 / 文档失焦则抛 `NotAllowedError`。原先只有一个空 `catch {}`，
 * 两种都被吞掉，而这几颗按钮**本来就没有成功反馈**（@click 直调，没有「已复制」态、
 * 也没有 toast）—— 于是点下去成功与失败在界面上长得一模一样，用户只觉得「点了没反应」。
 *
 * 两条容易漏的细节，别省：
 *   - `readOnly`：不写的话 `focus()` 会在真机上把软键盘弹起来再收回去（`useMobileKeyboard`
 *     的 `.app.is-typing` 会跟着闪，贴底的图标栏也收一下）；只读框照样能选中、能复制。
 *   - `setSelectionRange` 而不是 `select()`：iOS Safari 上 `select()` 对文本长的框选不全。
 *
 * 摘掉临时框之后要把焦点还回去（`previous`）。临时框是聚焦着的，直接摘会让焦点掉到 `body`：
 * 触摸设备上「点按钮、点输出区都不收键盘」这条口径（`useMobileKeyboard` 的保焦）靠的正是
 * 焦点别跑，丢给 `body` 会连带把键盘收掉 —— 与「别加顶栏开关，点按钮自己会抢焦点、反而把
 * 已经弹着的键盘弄收」（那处已撤过一版）是同一个坑。
 * 而「用户已按返回键收掉键盘、焦点还残留在框里」那一种不必在这里兜：同一次手势的
 * `touchstart` 已经把那个残留焦点清掉了（见 `onTouchStart` 里那道 `!keyboardUpAtTouchStart` 闸），
 * 所以这里读到的 `previous` 要么是那颗按钮、要么本来就是 `body`，还回去不会把键盘重新捞起来。
 */
async function copyText(text) {
  if (!text) return
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      /* 没授权 / 文档失焦：落到下面那条老路再试一次 */
    }
  }
  const previous = document.activeElement
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.readOnly = true
  // fixed + 透明 + 不吃指针：不在屏幕上闪一下，也不把页面挤动
  textarea.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;'
  document.body.appendChild(textarea)
  try {
    textarea.focus()
    textarea.setSelectionRange(0, text.length)
    document.execCommand('copy')
  } catch {
    /* 到这一步已经没有别的路可走了 */
  } finally {
    textarea.remove()
    // preventScroll：别为了还焦点把页面挪一下（站内其它还焦点处同款）
    if (previous instanceof HTMLElement && previous.isConnected && previous !== document.body) {
      previous.focus({ preventScroll: true })
    }
  }
}

const copyOutput = () => copyText(outputText.value)

// ------------------------------------------------------------ 输入 / 期望框的右键菜单（2026-11-19 加）
/**
 * 右键菜单里的「复制 / 粘贴」（用户口径：没选中任何内容时，两个动作都默认作用于**全部内容**）。
 *
 * 选区在**打开菜单那一刻**就取下来存进 `boxMenu`：菜单按钮在 body 上，按下时会把 `<pre>` 的
 * 文档选区清掉（textarea 的 selectionStart/End 倒是不丢），事后再读会一律变成「没选中」。
 * 存的是**显示文本里的偏移** —— 截断态下框里渲染的是「前缀 + 省略行」，看不清这一点就会把
 * 省略段算丢。复制时选区里带上省略行（全选就会带上）仍按框上 `copy` 事件那条老口径给全文。
 *
 * 粘贴**不能直接写 `el.value`**：脚本赋值会把 textarea 的原生撤销栈整条清掉，之后 ⌘Z / Ctrl+Z
 * 什么也撤不回来（2026-11-19 用户报的「input 里 ⌘Z 没反应」）。所以先选好要替换的范围，
 * 再走 `document.execCommand('insertText')` —— 它是浏览器眼里的「一次真实输入」，撤销栈照常
 * 记一步，`input` 事件也由浏览器自己派发，`commitEdit` 收到的仍是与手敲 / 原生粘贴一致的原始文本。
 * 只有 execCommand 不被支持时，才退回脚本赋值 + 手动派发 `input`（这一步会丢撤销栈，但至少能粘进去）。
 */
const boxMenu = ref(null)

/** textarea 里选中的一段；没选中返回 null（= 全选口径） */
function textareaSelection(el) {
  if (!el || el.selectionStart === el.selectionEnd) return null
  return { start: el.selectionStart, end: el.selectionEnd }
}

/** `<pre>` 只读视图里选中的一段（换算成相对根节点的文本偏移，与 textarea 的坐标同一套） */
function preSelection(el) {
  const sel = window.getSelection()
  if (!el || !sel || !sel.rangeCount || sel.isCollapsed) return null
  const range = sel.getRangeAt(0)
  if (!el.contains(range.startContainer) || !el.contains(range.endContainer)) return null
  const head = document.createRange()
  head.selectNodeContents(el)
  head.setEnd(range.startContainer, range.startOffset)
  const start = head.toString().length
  return { start, end: start + range.toString().length }
}

function onBoxContextMenu(event, target) {
  event.preventDefault()
  const el = event.currentTarget
  boxMenu.value = {
    x: event.clientX,
    y: event.clientY,
    target,
    // 期望侧吃差异染色时渲染的是 `<pre>`，选区得从文档选区换算
    selection:
      target === 'expected' && expectedInView.value ? preSelection(el) : textareaSelection(el),
    display: target === 'input' ? inputDisplay.value : expectedDisplay.value,
    full: (target === 'input' ? props.testCase.input : props.testCase.expectedOutput) ?? '',
  }
}

const boxMenuItems = computed(() => {
  const m = boxMenu.value
  if (!m) return []
  const picked = m.selection ? m.display.slice(m.selection.start, m.selection.end) : ''
  return [
    { id: 'copy', label: t('tests.card.copy'), disabled: !picked && !m.full },
    { id: 'paste', label: t('tests.card.paste'), disabled: props.locked },
  ]
})

function copyFromBox(m) {
  const picked = m.selection ? m.display.slice(m.selection.start, m.selection.end) : ''
  // 与框上的 copy 事件同一口径：选区带上了省略行 = 连被省略的整段一起给
  copyText(!picked || picked.includes(MARKER_KEY) ? m.full : picked)
}

/** 读剪贴板：权限被拒 / 非安全上下文一律返回空串，由调用方给提示（与编辑区右键菜单同一口径） */
async function readClipboardText() {
  try {
    const text = await navigator.clipboard?.readText?.()
    return typeof text === 'string' ? text : ''
  } catch {
    return ''
  }
}

/** 把文本粘进框里：有选区就替换选区，没选区就替换全部（用户口径） */
function applyPaste(el, text, selection) {
  if (!el) return
  const value = el.value
  const start = selection ? selection.start : 0
  const end = selection ? selection.end : value.length
  const caret = start + text.length
  el.focus({ preventScroll: true })
  el.setSelectionRange(start, end)
  // 走浏览器自己的插入通道：撤销栈记一步、input 事件由浏览器派发，
  // v-model 的 setter（commitEdit）依旧拿得到原始文本，截断态的省略段照原规则接回 / 丢弃。
  let inserted = false
  try {
    inserted = document.execCommand('insertText', false, text)
  } catch {
    inserted = false
  }
  if (!inserted) {
    el.value = value.slice(0, start) + text + value.slice(end)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
  nextTick(() => {
    el.focus({ preventScroll: true })
    el.setSelectionRange(caret, caret)
  })
}

async function pasteIntoBox(m) {
  if (props.locked) return
  const text = await readClipboardText()
  if (!text) {
    notify({
      type: 'warning',
      title: t('app.editorMenu.pasteBlockedTitle'),
      message: t('app.editorMenu.pasteBlockedBody'),
      duration: 4000,
    })
    return
  }
  if (m.target === 'input') {
    applyPaste(inputEl.value, text, m.selection)
    return
  }
  // 期望侧是只读视图时先切回输入框（openExpectedEditor 自己会 nextTick 聚焦，这里排在它后面）
  if (expectedInView.value) {
    openExpectedEditor()
    await nextTick()
  }
  applyPaste(expectedEl.value, text, m.selection)
}

function onBoxMenuSelect(id) {
  const m = boxMenu.value
  boxMenu.value = null
  if (id === 'copy') copyFromBox(m)
  else if (id === 'paste') void pasteIntoBox(m)
}

/**
 * 把这一次跑出来的 stdout 原样写成期望输出 —— 手调样例时最常用的一步「就按它算对」。
 *
 * 取的是 `actualOutput`（纯 stdout），**不是**卡片上显示的那份「实际输出」
 * （= actualOutput + detail）：期望输出只跟 stdout 比对，编译错误 / 运行诊断
 * 一起誊进去就不是样例了。
 *
 * 写入走 `expectedOutput` 那个 field setter，与用户手敲进框里是同一条路 ——
 * 「结论已过期」的 stale 标记也因此自动带上，不需要在这里另写一遍。
 * 跑动中不给点（locked）：这一轮的判定还在路上，此刻改写期望输出没有意义。
 */
function useActualAsExpected() {
  const text = props.testCase.actualOutput ?? ''
  if (!text) return
  expectedOutput.value = text
  // 整段替换（可能一下从短变长），省略量得按新内容重算 —— 手敲那条路是 commitEdit 补的
  // 这一脚，这里绕过了它，不补的话框里会按旧边界显示、凭空少一截。
  expectedHidden.value = hiddenOf(text)
  nextTick(syncHeight)
}

// 省略行是「被省略内容的把手」：选区里带上它，就等于把省略段也圈进来了，直接给完整内容。
// 三个框共用这一条 —— textarea 走 selectionStart/End，<pre> 走 window.getSelection()。
// 只选了一段、没碰到省略行时一律不接管：那时浏览器给的本来就是准确的那一段，
// 替换成全文会让「复制我选的这几个字」变成复制 100 万字符。
function onLongCopy(event, full) {
  const el = event.currentTarget
  const picked =
    typeof el?.selectionStart === 'number' && el.selectionStart !== el.selectionEnd
      ? el.value.slice(el.selectionStart, el.selectionEnd)
      : String(window.getSelection() ?? '')
  if (!picked.includes(MARKER_KEY)) return
  if (!event.clipboardData) return
  event.clipboardData.setData('text/plain', full)
  event.preventDefault()
}

/**
 * 换了一条用例（分项视图切 Tab）：同一份 DOM 原地复用，`testCase` 换人。
 *
 * 两件事必须分开跑，且**不能合成一个 watch**：
 *   ① 省略量的重算要赶在渲染之前（默认的 pre 队列）—— 它决定框里渲染哪段文本，
 *      晚一步就会先拿上一条用例的边界画一帧；
 *   ② 高度的重算要赶在绘制之前、patch 之后（post 队列）—— 见 syncHeight 的注释。
 *
 * 另外两件小事顺手在这里归位：`editingExpected`（上一条用例里点开过的期望框）与
 * `hoverPair`（上一条用例里悬停的差异）。不归位的话，切过去会是一格「还没点就已经在编辑」
 * 的期望框，以及一处没被鼠标指着却亮着下划线的差异。
 */
function syncCaseState() {
  inputHidden.value = hiddenOf(props.testCase.input)
  expectedHidden.value = hiddenOf(props.testCase.expectedOutput)
  editingExpected.value = false
  hoverPair.value = -1
}
watch(() => props.testCase, syncCaseState)
watch(() => props.testCase, syncHeight, { flush: 'post' })

// 外壳（卡片）展开时需要重算：折叠态那一行被压到 0fr，元素自己的内联高度没人动过，
// 但 ResizeObserver 盯的是宽度，接不住这次变化 —— 由外壳在展开后调一下这里。
defineExpose({ syncHeight })
</script>

<template>
  <div
    class="card__body"
    :class="{ 'is-workbench': workbench, 'is-vertical': vertical || bento }"
    :data-status="testCase.status"
    :data-roomy="roomy ? '' : null"
  >
    <!-- 三个字段的小标题统一走消息表（2026-11-20 用户要求）：工作台与卡片流都写
         「输入 / 期望输出 / 实际输出」，不再出现 input / Expected / Actual 的英文标识。
         框内的占位提示同日全部移除 —— 加载完成后应当是空白框，标题已经说明了这里是什么。 -->
    <div class="io">
      <div class="field field--input">
        <label class="field__label" :for="inputId">
          <span class="field__name">{{ t('tests.card.field.input') }}</span>
        </label>
        <div class="buffer">
          <textarea
            :id="inputId"
            ref="inputEl"
            v-model="inputModel"
            class="ta"
            :class="{ 'ta--truncated': inputHidden > 0 }"
            spellcheck="false"
            wrap="off"
            :disabled="locked"
            @copy="onLongCopy($event, testCase.input)"
            @contextmenu="onBoxContextMenu($event, 'input')"
          ></textarea>
        </div>
        <div v-if="inputHidden > 0" class="ionote">
          <span class="ionote__text">
            {{ t('tests.card.omitted', { n: fmt(inputHidden) }) }}
          </span>
          <button
            type="button"
            class="ionote__btn"
            :title="t('tests.card.copyFull')"
            @click="copyText(testCase.input)"
          >
            {{ t('tests.card.copyFullShort') }}
          </button>
        </div>
      </div>
      <div class="field field--expected">
        <label class="field__label" :for="expectedId">
          <span class="field__name">{{ t('tests.card.field.expected') }}</span>
        </label>
        <!-- 期望侧「有内容没被打出来」时，这一格换成只读视图：textarea 由浏览器画字，
             没法只给其中几个字符染色。点一下换回输入框（见脚本里的 editExpected）。
             ⚠️ 这一整段必须写在**同一行**里：`<pre>` 内的空白是内容，缩进会变成输出里的空格。 -->
        <div class="buffer">
          <pre
            v-if="expectedSegments && !editingExpected"
            :id="expectedId"
            class="ta ta--view"
            :class="{ 'ta--truncated': expectedHidden > 0 }"
            :style="workbench || vertical || bento ? null : { maxHeight: `${px(maxIOHeight)}px` }"
            tabindex="0"
            @click="editExpected"
            @keydown.enter="editExpectedByKey"
            @copy="onLongCopy($event, testCase.expectedOutput)"
            @contextmenu="onBoxContextMenu($event, 'expected')"
            @mouseover="onMarkOver"
            @mouseleave="hoverPair = -1"
            ><span v-for="(seg, i) in expectedSegments" :key="i" :class="markClass(seg)" :data-pair="seg.pair">{{ seg.text }}</span></pre
          >
          <textarea
            v-else
            :id="expectedId"
            ref="expectedEl"
            v-model="expectedModel"
            class="ta"
            :class="{ 'ta--truncated': expectedHidden > 0 }"
            spellcheck="false"
            wrap="off"
            :disabled="locked"
            @copy="onLongCopy($event, testCase.expectedOutput)"
            @contextmenu="onBoxContextMenu($event, 'expected')"
            @blur="editingExpected = false"
          ></textarea>
        </div>
        <div v-if="expectedHidden > 0" class="ionote">
          <span class="ionote__text">
            {{ t('tests.card.omitted', { n: fmt(expectedHidden) }) }}
          </span>
          <button
            type="button"
            class="ionote__btn"
            :title="t('tests.card.copyFull')"
            @click="copyText(testCase.expectedOutput)"
          >
            {{ t('tests.card.copyFullShort') }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="showActual" class="field field--actual">
      <span class="field__label field__label--row">
        <span
          v-if="workbench || vertical || bento"
          class="field__status"
          :data-status="testCase.status"
          >{{ statusText }}</span
        >
        <span class="field__name">{{ t('tests.card.field.actual') }}</span>
        <span class="field__head-right">
          <!-- 两个动作包一层：这一行是三段网格，动作固定落在右端 -->
          <span class="field__actions">
            <!-- 把这次跑出来的实际输出誊进期望输出框（WA 之后最常用的一步）。
                 图标是朝上的箭头（2026-10-06 由 swap 换过来）：目标框就在上面。
                 尺寸给 14：arrow-up 的墨迹只占 14×14 个网格单位，邻居 copy 占 16.5×18，
                 同样的 12 号下箭头会明显小一圈（7px 对 8.25×9px）。 -->
            <button
              class="icon-btn"
              :title="t('tests.card.useActual')"
              :disabled="locked || !testCase.actualOutput"
              @click="useActualAsExpected"
            >
              <AppIcon name="arrow-up" :size="14" />
            </button>
            <button
              class="icon-btn"
              :title="t('tests.card.copyOutput')"
              :disabled="locked || !outputText"
              @click="copyOutput"
            >
              <AppIcon name="copy" :size="12" />
            </button>
          </span>
        </span>
      </span>
      <!-- 外框（2026-10-26 晚）：系统提示要压在框内第一行，所以背景 / 描边 / 圆角 /
           截断虚线统一交给这一层，<pre> 退成「只剩内边距与滚动」的内容区。 -->
      <div class="out-box" :class="{ 'is-truncated': outputView.long }">
        <!-- 编译期诊断（2026-10-26 加，目前只有「编译期确定的除以零」）。**不参与判定**：
             -O2 把 `a / 0` 折成常量，程序照样退出 0，那个 0 本身没有意义，只是看起来像 AC。
             它不进 outputText（否则「复制输出」会把提示一起递出去），只占框内顶部一行。 -->
        <p v-if="testCase.note" class="out-box__note">{{ testCase.note }}</p>
        <!-- WA 时把「不一样的字符」直接染色（2026-11-09 加；当晚由底色高亮改成字色）。
             ⚠️ 这一整段必须写在**同一行**里：`<pre>` 内的空白是内容（Vue 的 condense
             在 pre 里不生效），换行 / 缩进会原样变成输出里的空行与空格。
             三种 kind 见 services/outputDiff.js：replace 红 / extra 黄 / missing 黄（落在期望侧）。
             复制不受影响：走的是选区与全文，与这里怎么切片无关。
             `is-diffed` 只在**这一框真画出标记**时才撤掉 --fail-soft（2026-11-09 深夜收紧）：
             旧写法 `Boolean(diffMarks)` 让「纯 missing」「差异全在 4000 字符截断区外」这两种
             ACTUAL 一个字都不染的情况也改成常规字色 —— 判了 WA，实际框却和 AC 长得一样。 -->
        <div class="buffer">
          <pre class="buffer__gutter" aria-hidden="true">{{ actualGutter }}</pre>
          <pre
            class="out"
            :class="{
              'is-empty': !outputView.text && !actualSegments,
              'is-hint': !outputView.text && !actualSegments && testCase.status !== 'running',
              'is-diffed': Boolean(actualSegments),
            }"
            tabindex="0"
            @scroll="syncGutter"
            @copy="onLongCopy($event, outputText)"
            @mouseover="onMarkOver"
            @mouseleave="hoverPair = -1"
            ><template v-if="actualSegments"><span v-for="(seg, i) in actualSegments" :key="i" :class="markClass(seg)" :data-pair="seg.pair">{{ seg.text }}</span></template><template v-else>{{ outputView.text || actualPlaceholder }}</template></pre
          >
        </div>
      </div>
      <div v-if="outputView.long" class="ionote">
        <span class="ionote__text">
          {{ t('tests.card.omitted', { n: outputView.hidden }) }}
        </span>
      </div>
    </div>

    <!-- 输入 / 期望框的右键菜单：只有复制、粘贴两项（通用件，Teleport 到 body） -->
    <ContextMenu
      v-if="boxMenu"
      :x="boxMenu.x"
      :y="boxMenu.y"
      :items="boxMenuItems"
      @select="onBoxMenuSelect"
      @close="boxMenu = null"
    />
  </div>
</template>

<style scoped>
.card__body {
  /* 缓冲区专用行高（2026-11-20）：**必须是整数 px**。
     小数行高在 textarea 里可能被浏览器按整数取整，而行号只是普通 <pre> 文本，
     两者按不同精度落行，就会出现「越往下偏得越多」的累积错位。
     18px ≈ 14.5px × 1.24，与原先的 17.4px 在视觉密度上几乎无差。 */
  --case-line-h: 18px;
  /* 2026-11-20 质感升级：左右内边距统一为 --pane-px（原右侧 6px 的 fallback 不对称），
     上 2px / 下 12px 让标签与卡片头之间不再顶死。 */
  padding: 2px var(--pane-px, 12px) 12px;
  display: grid;
  gap: 10px;
}

.io {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
}

/* 断点一律写成 rem：全局缩放时卡片内容会一起变大，阈值必须同步上移。
   postcss-pxtorem 不处理 at-rule 参数（见 vite.config.js），写成 px 就会脱节。 */
@container (min-width: 35rem) {
  .io {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* 宽容器（底部横跨的评测岛约 980px）：input / Expected / Actual 三块并排。
   判据只看容器宽度，不看停靠侧 —— 右侧岛被拖到同样宽时同样成立，与方案里
   「用 @container 而不是 JS 判 testsPaneSide()」的口径一致。
   做法：`.io` 退成 display: contents，它的两块字段直接成为 `.card__body` 网格项，
   与 Actual 那一块同处一行；窄容器完全不受影响（这条规则只在 ≥56rem 生效）。
   两列 / 三列由「实际输出有没有渲染」决定：没跑过时 Actual 不存在
   （`v-if="showActual"`），剩两块各占一半，不把输入框无谓压窄。 */
@container (min-width: 56rem) {
  .card__body {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px 12px;
  }

  .card__body:has(.field--actual) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .io {
    display: contents;
  }
}

.field {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/* Buffer 列头（2026-11-20 方案一）：26px、下沿一条 1px 细线，右边挂行数元信息。
   去掉了 10px uppercase / 字距 / 各种上下 margin —— 标题不再像网页表单，而是代码面板的栏头。 */
.field__label,
.field__label--row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex: 0 0 26px;
  height: 26px;
  min-height: 26px;
  margin: 0;
  padding: 0 10px;
  border-bottom: 1px solid var(--border-soft);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0;
  color: var(--text-dim);
}

/* 列名不参与收缩（2026-11-20）：窄岛里先让右侧结论走省略号，绝不把「实际输出」
   折成两行撑破 26px 列头。 */
.field__name {
  flex: 0 0 auto;
  white-space: nowrap;
}

/* 实际输出列头（2026-11-20 用户要求）：状态在左、标题居中、动作在右。
   两侧各一条 1fr 对称列，标题才落在列宽的正中，而不是被右侧动作挤偏。 */
.field__label--row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  justify-content: normal;
}

.field__label--row > .field__status {
  grid-column: 1;
  justify-self: start;
  max-width: 100%;
}

.field__label--row > .field__name {
  grid-column: 2;
  justify-self: center;
}

.field__label--row > .field__head-right {
  grid-column: 3;
  justify-self: end;
}

/* 焦点只提亮栏头文字（2026-11-20 方案一）：不画框、不发光、不做背景变化 */
.card__body .field:focus-within > .field__label,
.card__body .field:focus-within > .field__label--row {
  color: var(--text);
}

.field__actions {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 2px;
  margin-right: -2px;
}

/* ---------- 迷你 Buffer：左侧行号槽 + 无壳内容区 ---------- */
.buffer {
  position: relative;
  min-height: 0;
  background: var(--bg-panel);
}

/* 行号槽是绝对定位的滚动镜像：不参与布局高度，所以 textarea 的自动高度完全不受影响。
   行高必须与正文共用同一个整数变量，否则 textarea 取整、pre 不取整时，
   从第二行起就会累积错位（2026-11-20 用户反馈「越往下偏得越多」）。
   顶部比正文多 1px（7 vs 6）：行号字号 11.5px 比正文小，在同样的行盒里
   半行距更大、基线会高出正文 1px；补这 1px 后第一行基线才对得上。
   底部 10px：让 scrollHeight 不小于正文（正文 6 上 + 10 下，行号 7 上 + 10 下），
   滚动到底时行号槽不会被提前夹住。 */
.buffer__gutter {
  position: absolute;
  inset: 0 auto 0 0;
  box-sizing: border-box;
  width: 28px;
  margin: 0;
  padding: 7px 6px 10px 0;
  overflow: hidden;
  text-align: right;
  font-family: var(--mono-font);
  font-size: 11.5px;
  line-height: var(--case-line-h);
  color: var(--text-faint);
  opacity: 0.45;
  user-select: none;
  pointer-events: none;
}

/* 正文里这两颗是 22×22 的小格（头栏那两颗是 24×24）——
   组件拆开后 .icon-btn 的底座仍留在 TestCaseCard 上，这里必须自带一份，
   否则正文里的按钮会退回 <button> 的 UA 默认样式（渐变底 + 边框）。
   2026-11-20：字段级工具默认收轻（0.42），悬停所在字段抬到 0.72、悬停按钮本身才到 1 ——
   它们不该和上方「删除 / 运行」抢右上角的注意力。 */
.icon-btn {
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border-radius: 4px;
  color: var(--text-dim);
  opacity: 0.42;
  transition: background-color 0.15s ease, color 0.15s ease, opacity 0.15s ease;
}

/* 字段级工具在悬停整块字段时先醒一半，指针落到图标上才全亮 */
:where(html.is-hoverable) .field:hover .icon-btn:not(:disabled) {
  opacity: 0.72;
}

:where(html.is-hoverable) .icon-btn:hover:not(:disabled) {
  opacity: 1;
  background: var(--bg-hover);
  color: var(--text);
}

/* 触屏没有悬停：0.42 会一直停在那儿，等于弱化了唯一的两个动作入口 */
:where(html:not(.is-hoverable)) .icon-btn:not(:disabled) {
  opacity: 0.8;
}

.icon-btn:disabled {
  opacity: 0.28;
  cursor: default;
}

/* 输入 / 期望缓冲（2026-11-20 方案一）：
   无边框、无圆角、无阴影、无焦点光晕、无 hover —— 与旁边的 Monaco 一样，只是一块写字的平面。
   2026-11-20 按用户要求删掉输入 / 期望的行号槽之后，正文直接从 10px 起（左内边距 = 列头内边距，
   两者落在同一条竖线上）；行高仍与 ACTUAL 共用 --case-line-h。 */
.ta {
  display: block;
  box-sizing: border-box;
  width: 100%;
  min-height: 76px;
  padding: 6px 10px;
  border: 0;
  border-radius: 0;
  background: transparent;
  font-family: var(--mono-font);
  font-size: 14.5px;
  line-height: var(--case-line-h);
  font-variant-ligatures: none;
  tab-size: 2;
  white-space: pre; /* 与 wrap="off" 同步：软换行会破坏行号对齐 */
  color: var(--text);
  caret-color: var(--focus);
  resize: none;
  overflow-y: hidden;
}

.ta:focus {
  outline: none;
}

/* 「框里装不下」的标记（见脚本里的 IO_PREVIEW_TRIGGER 与 overflow 那段）。
   **只给真被截断的情形**（`xxxHidden > 0`）：那种状态下框里确实少了一截正文，底边这条虚线
   是「下面还有东西不在这个框里」的分隔提示；只是超出框高要滚动的那种（字符一个没少）不给
   —— 拖滚动条就能看到全部，浏览器那根滚动条已经把话说完了，再画虚线是噪音（见脚本里的注释）。
   框本身仍然可以打字，所以不能再整框画虚线 —— 那会被读成「这里不能编辑」。
   改成只把底边换成虚线，边框色必须从 --border-soft 提到 --border：前者在浅色主题下几乎看不见，
   1px 的虚线一旦没有对比度就完全白做。
   Actual 那块的虚线画在 `.out-box` 上：描边是外框的属性，`<pre>` 只是内容区。 */
/* 超长截断指示（2026-11-20）：不再用会沿圆角拐弯的 dashed 底边，
   改成框内底部一条极细的渐变虚线 —— 圆角与无边框的纵向模式都能干净呈现。 */
.ta--truncated,
.out-box.is-truncated {
  background-image: repeating-linear-gradient(
    to right,
    color-mix(in srgb, var(--text-faint) 42%, transparent) 0 4px,
    transparent 4px 8px
  );
  background-size: calc(100% - 20px) 1px;
  background-position: center bottom 2px;
  background-repeat: no-repeat;
}

/* 提示行：左边一句说明，右边「复制全部」。**只有截断态才有这一行** —— 那一行既是说明、
   也带着唯一的补救动作；纯溢出态既没有这一行、也没有虚线底边（见脚本里 overflow 那段的注释）。
   用 --text-dim 而不是 --text-faint：这一行说的是「上面那段在框里显示不完」，属于必须看见的信息。 */
.ionote {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  font-size: 10.5px;
  color: var(--text-dim);
}

.ionote__text {
  /* 与卡片头部的 .stale 同款：唯一能缩的一格，窄下来自己截断 */
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* 输出外框只负责把「诊断提示 + 缓冲区」放在一起：没有底色 / 描边 / 圆角 */
.out-box {
  position: relative;
  min-height: 0;
}

/* 框内顶部的系统提示（目前只有编译期诊断：「源码含除以零…输出结果不可预期」）。
   - 颜色是**专用的一支鹅黄**（`--hint-goose`），不是 `--warn`：2026-10-26 晚用户指定「鹅黄，
     不要绿」，而 `--warn` 深色是偏褐的金、浅色是偏橄榄的黄褐，压在这里会被读成灰绿。
     它只服务这一处，也就不跟页签未保存点、通知那批警告色联动。
   - 字号比正文（14.5px）小一号，且用正文字体而不是等宽：它是「关于这次输出的一句话」，
     不是输出本身，等宽会读成「这也是程序打印的」。
   - 必须读完，所以不截断，窄面板下折行。 */
.out-box__note {
  margin: 0;
  padding: 7px 9px 0;
  color: var(--hint-goose);
  font-size: 12px;
  line-height: 1.5;
}

.ionote__btn {
  flex: 0 0 auto;
  padding: 2px 7px;
  border-radius: 4px;
  /* 同 .ta--truncated：浅色主题下 --border-soft 淡到只剩文字，按钮会读不出是按钮 */
  border: 1px solid var(--border);
  background: var(--bg-control);
  color: var(--text-dim);
  font-size: 10.5px;
  white-space: nowrap;
  transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

:where(html.is-hoverable) .ionote__btn:hover {
  background: var(--bg-control-hover);
  border-color: var(--border);
  color: var(--text);
}

/* 分项视图（props.roomy）的 ACTUAL：**放开上限**，高度交给内容（2026-11-19 审查后改）。
   原来三面一律 480，是因为「同一屏里两块字要对齐」；但 .case-viewport 本身已经是唯一
   纵向滚动区，480 的封顶等于在里面又套一层小滚动条 —— 长输出时滚轮要么卡在内层，
   要么一路串到底，手感是飘的。
   ⚠️ 只放开只读的 ACTUAL：input / Expected 是可编辑框，无限长会把另一块挤出屏幕
   （脚本里的 maxIOHeight 仍是 480），这一条不对称是刻意的。 */
.card__body[data-roomy] .out {
  max-height: none;
}

.out {
  margin: 0;
  min-height: 76px;
  max-height: 360px;
  overflow: auto;
  padding: 6px 10px 6px 24px;
  font-family: var(--mono-font);
  font-size: 14.5px;
  line-height: var(--case-line-h);
  font-variant-ligatures: none;
  tab-size: 2;
  white-space: pre;
  color: var(--text);
  cursor: text;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--text-faint) 30%, transparent) transparent;
}

/* 外框的 `overflow: hidden` 会把浏览器画在 `<pre>` 外面的默认 outline 裁掉，
   于是 Tab 到这里就看不出焦点（改动前 `.out` 自己就是框，outline 还在外面看得见）。
   焦点态改为给外框描边上色，判据与 `.ta:focus` 同一条：用户看到的都是「这块框亮了」。 */
.out:focus {
  outline: none;
}

/* ---------- 判定态（2026-11-20）：轻语义底色 + 轻边框，文字克制不刺眼 ---------- */
/* 判定色只落在文字上（2026-11-20 方案一）：绝不把整块缓冲区铺成淡绿 / 淡红 */
.card__body[data-status='passed'] .out {
  color: var(--ok-soft);
}

.card__body[data-status='failed'] .out,
.card__body[data-status='error'] .out {
  color: var(--fail-soft);
}

.card__body[data-status='failed'] .out.is-diffed {
  color: var(--text);
}

/* 空输出提示：用 UI 字体，与真实等宽数据划清界线 */
.out.is-empty {
  font-family: var(--ui-font);
  font-size: 12px;
  color: var(--text-faint);
  opacity: 0.72;
}

.out.is-empty.is-hint {
  color: var(--hint-goose);
  opacity: 0.9;
}

/* ---------- 差异染色（2026-11-09 加；当晚由「铺底色」改成「只换字色」）----------
   `.mk` 只出现在 ACTUAL / EXPECTED 两个框的行内片段上，三种 kind 一一对应：

     replace  与期望不同的那一段               → WA 红（--fail）
     extra    实际输出多出来的那一段            → RE 黄（--err）
     missing  期望里有、实际没打出来的那一段     → RE 黄（--err）

   不铺底、不加描边、不改字重：一段 60 列的输出里，几个字换色比刷一片底色更容易一眼找到，
   也不会在折行时被切成两截色块。⚠️ 纯空白的差异段在 outputDiff.js 里已经换成
   `·` / `⇥` / `↵` —— 空格染红了还是空格，只能靠字形把它显出来。 */
.mk--replace {
  color: var(--fail);
}

.mk--extra,
.mk--missing {
  color: var(--err);
}

/* 悬停某一处差异时，两侧同一个 pair 的标记一起亮（2026-11-09 深夜）。
   不能用底色、也不能改字重：底色就是刚撤掉的那种「高亮框」，字重会改变字符宽度 ——
   在 <pre> 里那就是整行跟着错位。所以只留下划线，它只参与绘制、不参与排版。 */
.mk.is-lit {
  text-decoration: underline;
  text-decoration-thickness: 2px;
  text-underline-offset: 2px;
}

/* 期望侧「对应着不同」的那一段（quiet）：平时完全不着色，只在悬停实际侧那一处时亮起来。
   必须排在 .mk--replace 之后 —— 同为单类选择器，靠顺序才盖得掉那份红色。 */
.mk--quiet {
  color: inherit;
}

.mk--quiet.is-lit {
  color: var(--fail);
}

/* 期望输出在「有内容没打出来」时换成只读视图（textarea 由浏览器画字，没法只染几个字符）。
   除了 pre 必须自己声明的空白处理，尺寸全部沿用 .ta —— 两个形态要看得出是同一个框。 */
.ta--view {
  margin: 0;
  overflow: auto;
  white-space: pre;
  cursor: text;
}

/* ---------- 窄容器下的降级 ----------
   容器是 TestPanel 里 .cases 的 inline-size（约等于面板宽度 − 16px 内边距 − 滚动条）。
   正文这一侧只在两档上让步，头栏那两档（gap / 「结果待重测」）留在 TestCaseCard 里。 */
@container (max-width: 22.5rem) {
  /* 正文：左内边距跟 --pane-px 走（侧栏回落 12px）—— 左轨不能因为面板变窄就断掉；
     省宽度从右侧出。纵向与基础值一致（上 0 / 下 10），标题与 INPUT 的间隔不因窄屏变大。
     gap 4px 配 .io 的 8px：Actual 那行标签行高定死在 1.4em = 14px、文字白留 1px，
     另有 margin-top 4px（见 .field__label--row 的注释），
     所以 4 + 4 + 1 = 9px，与 input → Expected 那处的 8 + 1 = 9px 齐平。 */
  .card__body {
    padding: 0 var(--pane-px, 6px) 10px var(--pane-px, 12px);
    gap: 4px;
  }

  .io {
    gap: 8px;
  }

  /* 横向 9px 不能跟着收：代码文字要停在 12 + 1 + 9 = 22px 的左轨上 */
  .ta,
  .out {
    padding: 7px 9px;
  }
}

/* 再挤一档：提示行把说明文字让位给「复制全部」那颗按钮 —— 它才是能点的东西。
   只对**带按钮的那种提示行**（两个输入框底下的截断态）让位；输出块底下那行没有按钮，
   藏掉就剩一条空行，所以用 :has 把它们区分开。 */
@container (max-width: 15.625rem) {
  .ionote:has(.ionote__btn) .ionote__text {
    display: none;
  }
}

/* ------------------------------------------------------------ 工作台档（方案一） */
/* 三列并排、满高、贴边：不再有圆角小黑框，也不再按内容自适应高度。
   整块正文就是三块编辑器面板，列与列之间只用 1px 发丝线分开
   （与 VS Code 的 Diff View / Zed 的面板同一套结构语汇）。 */
.card__body.is-workbench {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0;
  height: 100%;
  min-height: 0;
  padding: 0;
}

/* `.io` 原来只是两列输入框的容器；工作台里它退成透明，让三块字段直接成为网格项 */
.card__body.is-workbench .io {
  display: contents;
}

.card__body.is-workbench .field {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

/* 1px 竖分割线：Expected 与 Actual 各画一条在左沿；Input 是首列，不画 */
.card__body.is-workbench .io .field + .field,
.card__body.is-workbench .field--actual {
  border-left: 1px solid var(--border-soft);
}

/* 列头：12px 常规字重、一句话一种语言（不再叠英文大写标签）。
   高度走 --workbench-head-h，与左侧轨页头严格同高 —— 两排文字落在一条水平线上。 */
.card__body.is-workbench .field__label,
.card__body.is-workbench .field__label--row {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  height: var(--workbench-head-h, 34px);
  margin: 0;
  /* 默认左右各 12px；只有「输入 / 期望输出」再右移 10px（见下一条）。
     实际输出列头保持原位（2026-11-20 用户修正）。 */
  padding: 0 12px;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
  color: var(--text-dim);
}

/* 输入 / 期望的标题与正文现在起在同一条 12px 竖线上（2026-11-20 删掉行号槽后不再需要偏移） */

.card__body.is-workbench .field__head-right {
  display: inline-flex;
  flex: 0 1 auto;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-width: 0;
}

/* ACTUAL 列头的运行结论：状态由 TestCaseTabs 的 36px 状态栏搬到这里 */
.card__body.is-workbench .field__status {
  min-width: 0;
  overflow: hidden;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--text-faint);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.card__body.is-workbench .field__status[data-status='passed'] {
  color: var(--ok);
}

.card__body.is-workbench .field__status[data-status='failed'] {
  color: var(--fail);
}

.card__body.is-workbench .field__status[data-status='error'] {
  color: var(--err);
}

.card__body.is-workbench .field__status[data-status='running'] {
  color: var(--info);
}

/* 散工具贴着列头右沿（12px 内边距）对齐，不再为旧状态栏的 8px 右缘做补偿 */
.card__body.is-workbench .field__actions {
  margin-right: 0;
  clip-path: none;
}

/* 三个数据面：撑满字段剩余高度，横向节奏与列头同一条竖线（列头 12px → 缓冲区 8 + 4）。
   行号槽计在缓冲区内部，所以内边距的 24px 由 .ta / .out 自己让出（槽 28 宽、数字右端到正文 2px）。 */
.card__body.is-workbench .buffer {
  flex: 1 1 auto;
  display: flex;
  min-height: 0;
  /* 左边不再缩进：输入区的可见底边与上方列头左端对齐（2026-11-20 用户要求往左推） */
  margin: 0 8px 8px 0;
}

.card__body.is-workbench .buffer > .ta,
.card__body.is-workbench .buffer > .out {
  flex: 1 1 auto;
  width: 100%;
  min-height: 0;
}

.card__body.is-workbench .ta {
  height: auto;
  padding: 6px 8px 8px 12px;
  overflow: auto;
}

.card__body.is-workbench .out-box {
  display: flex;
  flex: 1 1 auto; /* 与纵向同理：撑满列高，buffer 才有可用的高度 */
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.card__body.is-workbench .out {
  flex: 1 1 auto;
  height: auto;
  min-height: 0;
  max-height: none;
  padding: 6px 8px 8px 24px;
  overflow: auto;
}

/* 「运行后在此显示输出」是引导语，不是系统结论 —— 不用鹅黄，退到最淡一档 */
.card__body.is-workbench[data-status='idle'] .out.is-empty.is-hint {
  color: var(--text-faint);
}

.card__body.is-workbench .ionote {
  margin: 0 8px 8px;
  padding: 0 4px;
}

/* ---------------------------------------------------------- 纵向停靠档（方案二） */
/* 左右停靠的评测岛（约 450~550px 宽）：上「输入」全宽、下「期望 | 实际」并排。
   2026-11-20 Bento：不再用通栏 1px 十字线（那条线会顶穿大圆角外壳，把悬浮岛切成表格），
   三块字段改成独立的圆角槽位 —— gap 6px 分开、各自一圈极淡描边 + 微底色。
   岛外壳可见圆角 10px、槽位 6px、底栏按钮 6px、页签关闭键 4px，从外到内递减。
   极窄（<340px）兜底：三行平分满高，见下面容器查询之前的默认值。 */
.card__body.is-vertical {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: repeat(3, minmax(70px, 1fr));
  gap: 6px;
  height: 100%;
  min-height: 0;
  padding: 0;
}

/* `.io` 退成透明，两个输入字段直接成为网格项（与工作台同一手） */
.card__body.is-vertical .io {
  display: contents;
}

/* 独立圆角槽位：描边比 --border-soft 再淡一档，底色只压 ~6% 的代码面，
   静息时像一块「嵌进岛里的凹槽」，不靠通栏线划界。 */
.card__body.is-vertical .field {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  border: 1px solid color-mix(in srgb, var(--border-soft) 65%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--code-block-bg) 60%, transparent);
  overflow: hidden;
  transition: border-color 0.14s ease, background-color 0.14s ease;
}

/* 聚焦反馈落在槽位描边上：不改几何、不发光，只把边界提一档 */
.card__body.is-vertical .field:focus-within {
  border-color: var(--border);
}

/* Buffer 原本铺 --bg-panel（与岛面同色），会把槽位底色完全盖掉 —— 在纵向档里让位 */
.card__body.is-vertical .buffer {
  background: transparent;
}

/* 列头 26px：与基础 Buffer 栏头同高，右端挂单样例结论（AC · 0.1ms）与两颗字段级工具。
   2026-11-20 用户要求：纵向满铺里列头不再画下边线 —— 字段之间已有槽位间隙，列头只做标题。 */
.card__body.is-vertical .field__label,
.card__body.is-vertical .field__label--row {
  flex: 0 0 26px;
  height: 26px;
  min-height: 26px;
  margin: 0;
  padding: 0 10px;
  border-bottom: 0;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--text-dim);
}

.card__body.is-vertical .field__head-right {
  display: inline-flex;
  flex: 0 1 auto;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-width: 0;
}

/* 单样例结论：挂在「实际输出」列头右侧，语义最贴切、零额外占高（状态行已让位给满高分栏） */
.card__body.is-vertical .field__status {
  min-width: 0;
  overflow: hidden;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--text-faint);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.card__body.is-vertical .field__status[data-status='passed'] {
  color: var(--ok);
}

.card__body.is-vertical .field__status[data-status='failed'] {
  color: var(--fail);
}

.card__body.is-vertical .field__status[data-status='error'] {
  color: var(--err);
}

.card__body.is-vertical .field__status[data-status='running'] {
  color: var(--info);
}

.card__body.is-vertical .field__actions {
  margin-right: -4px;
}

/* 满铺态：缓冲区直接铺满分栏，没有壳子装饰 */
.card__body.is-vertical .buffer {
  flex: 1 1 0;
  display: flex;
  min-height: 0;
}

.card__body.is-vertical .buffer > .ta,
.card__body.is-vertical .buffer > .out {
  flex: 1 1 0;
  width: 100%;
  min-height: 0;
}

.card__body.is-vertical .ta {
  height: auto;
  padding: 6px 12px 10px 10px;
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--text-faint) 30%, transparent) transparent;
}

.card__body.is-vertical .out-box {
  display: flex;
  flex: 1 1 0; /* 关键：满高分栏里它必须吃掉字段剩余高度，否则 buffer 高度为 0、输出被裁空 */
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.card__body.is-vertical .out {
  flex: 1 1 0;
  height: auto;
  min-height: 0;
  max-height: none;
  padding: 6px 12px 10px 24px;
  overflow: auto;
}

.card__body.is-vertical .ionote {
  margin: 0 10px 8px;
  padding: 0;
}

/* 纵向岛常规宽度（≥340px）：上 45% / 下 55%，下半区「期望 | 实际」并排。
   ⚠️ 340px 是竖长条下还能并排读两列的下限；再窄就回退到上面的三行叠放。
   容器是 TestCaseTabs 的 .tabs-view（inline-size = 面板宽），与正文逐像素相同。 */
@container (min-width: 21.25rem) {
  .card__body.is-vertical {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-rows: minmax(90px, 0.9fr) minmax(110px, 1.1fr);
    gap: 6px;
  }

  .card__body.is-vertical .field--input {
    grid-column: 1 / -1;
  }

  /* 尚未运行时没有实际输出，期望输独占下半区（同样饱满，不留空列） */
  .card__body.is-vertical .field--expected {
    grid-column: 1 / -1;
  }

  /* 有实际输出时，下半区左右 50/50 劈开，靠槽位间隙分栏（不再画竖线） */
  .card__body.is-vertical:has(.field--actual) .field--expected {
    grid-column: 1 / 2;
  }

  .card__body.is-vertical .field--actual {
    grid-column: 2 / 3;
  }
}
</style>
