<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import AppTooltip from './AppTooltip.vue'
import { locale, t } from '../i18n/index.js'
import { px, uiScale } from '../composables/useUiScale.js'

const props = defineProps({
  testCase: { type: Object, required: true },
  index: { type: Number, required: true },
  /** 正在运行：整张卡片锁定（运行、删除都按下不响） */
  locked: Boolean,
  /**
   * 不可运行的原因（活跃文件不是代码文件时由 App 给出）。空串＝可运行。
   * 与 locked 分开：locked 是「等一下就好」，这个是「这个文件跑不了」——
   * 两者都要置灰 ▶，但只有后者需要把原因说出来。
   */
  runBlocked: { type: String, default: '' },
})

const emit = defineEmits(['remove', 'run'])

// 徽标文案：跑完的用例用 runner 给的判定码（AC / WA / CE / TLE / RE / ERR），
// 没跑过或正在跑才用状态名。判定码比「通过 / 未通过」短一个量级，窄面板下不会被挤成竖排。
// 只有文字、不带图标（2026-10-06）：判定码本身已经是最短的表达，再加一颗对勾/叉
// 会把胶囊撑宽一倍，也抢掉了 11px 字号那点可读性。
const STATUS = {
  idle: { labelKey: 'tests.card.idle' },
  running: { labelKey: 'tests.card.running' },
  passed: { label: 'AC' },
  failed: { label: 'WA' },
  error: { label: 'ERR' },
}

const status = computed(() => STATUS[props.testCase.status] ?? STATUS.idle)
// STATUS 里存 key（它是 <script setup> 顶层构造的，翻译只能发生在 computed 里）
const badgeLabel = computed(() => props.testCase.verdict || t(status.value.labelKey))

// 折叠状态与用例记录放在一起，卡片被复用（v-for key 为 id）时不会丢。
const isCollapsed = computed(() => props.testCase.collapsed === true)

function toggleCollapse() {
  props.testCase.collapsed = !isCollapsed.value
}

// 运行按钮用 aria-disabled 而不是原生 disabled（2026-10-24 晚）：原生禁用会吞掉
// 按钮的鼠标事件，runBlocked 那句原因就永远弹不出来。禁用语义仍保留给读屏，
// 点击在这里拦掉。
function requestRun() {
  if (props.locked || props.runBlocked) return
  emit('run', props.testCase)
}

// The card edits its own record in place: the case objects live in App's
// reactive `testCases` array, so a two-way binding per field is enough.
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
// （用例对象只在 createCase 时造一次，此后没有任何外部写入路径 —— 见 App.vue 的 testCases ——
//  所以这个实例级的缓存不会被别处改脏；换题、重载走的是新对象、新组件。）
// 但**掉出长文本时必须归零**：用户把可编辑段删光后真值只剩原来那截尾巴（4505 字符，不算长），
// 冻结值留着的话，界面会摆着一句「还有 4,505 个字符未显示」而其实一个字符都没少。
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
  // 面板所在页签没打开时（display: none）scrollHeight 为 0，此时不动高度，
  // 切到该页签时由下面的 ResizeObserver 重算。
  // （折叠不再是 display: none 了 —— 2026-10-06 起走 .card__fold 的行高动画，
  //   折叠态只是被裁到 0 高，元素仍在布局里，scrollHeight 照旧量得到。）
  if (!el.scrollHeight) return
  const cs = getComputedStyle(el)
  const border = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth)
  el.style.height = 'auto'
  const full = el.scrollHeight + border
  const cap = px(MAX_IO_HEIGHT)
  el.style.height = `${Math.min(full, cap)}px`
  el.style.overflowY = full > cap ? 'auto' : 'hidden'
}

function growAll() {
  autoGrow(inputEl.value)
  autoGrow(expectedEl.value)
}

// 监听的是「渲染出来的那一份」：内容越过阈值时显示文本会从完整内容整段换成截断预览
// （再退回来也一样），高度必须跟着重算 —— 光看 testCase 上的字段是接不到这次变化的。
watch([inputModel, expectedModel], () => nextTick(growAll))
watch(isCollapsed, (collapsed) => {
  if (!collapsed) nextTick(growAll)
})
// 全局缩放变化：字号与上限一起变，已经写死的高度要重算一遍
watch(uiScale, () => nextTick(growAll))

// 卡片所在的面板（统一侧边栏的「评测样例」页签）默认是 display: none，
// onMounted 那一刻 scrollHeight 为 0，autoGrow 会直接跳过；之后切到该页签时
// 没有任何重算时机，输入框就会一直塌成一行。ResizeObserver 能接住「从不可见变为可见」
// （宽度 0 → 有值）以及面板宽度变化，只在宽度变大时重算 —— 宽度不受我们自己设的
// height 影响，不会形成回调环。
let growObserver = null
let lastGrownWidth = 0
onMounted(() => {
  growAll()
  growObserver = new ResizeObserver((entries) => {
    const width = entries[0]?.contentRect.width ?? 0
    if (width === lastGrownWidth) return
    lastGrownWidth = width
    if (width > 0) growAll()
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
const showActual = computed(() => props.testCase.status !== 'idle')
const actualPlaceholder = computed(() =>
  props.testCase.status === 'running' ? t('tests.card.running') : t('tests.card.emptyOutput'),
)

// 实际输出也是同一套：超长就只显示开头一段 + 省略行。它天生只读（是个 <pre>），
// 所以不用像上面两个输入框那样维护「可编辑段」的边界，现算就行。
const outputView = computed(() => {
  const text = outputText.value
  if (!isLong(text)) return { long: false, text, hidden: '' }
  const body = previewBody(text)
  return { long: true, text: `${body}${MARKER_SEED}`, hidden: fmt(text.length - body.length) }
})

const timing = computed(() => {
  const { durationMs } = props.testCase
  if (durationMs === null || durationMs === undefined) return ''
  return durationMs >= 1000 ? `${(durationMs / 1000).toFixed(2)} s` : `${durationMs} ms`
})

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
  nextTick(growAll)
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
</script>

<template>
  <li
    class="card"
    :data-status="testCase.status"
    :class="{ 'is-stale': testCase.stale, 'is-collapsed': isCollapsed }"
  >
    <header class="card__head">
      <button
        class="icon-btn icon-btn--toggle"
        :class="{ 'is-collapsed': isCollapsed }"
        :title="t(isCollapsed ? 'tests.card.expand' : 'tests.card.collapse')"
        :aria-expanded="!isCollapsed"
        :aria-label="t(isCollapsed ? 'tests.card.expand' : 'tests.card.collapse')"
        @click="toggleCollapse"
      >
        <!-- chevron 的字形（m6 9 6 6 6-6）只占 24 网格里的 12×6 单位，是 sibling 图标里
             最扁的一枚：13px 下墨迹实测只有 6.5×3.3px，而同一行的 trash（13px）有 8.7px 宽。
             所以它要 17px 才和别的图标一样宽（墨迹 8.5×4.2）。stroke-width 同步 2.6 → 2：
             描边绝对值 = 2.6/24×13 = 2/24×17 ≈ 1.4px，字形放大而笔画不跟着变粗。 -->
        <AppIcon name="chevron" :size="17" :stroke-width="2" />
      </button>
      <!-- 标题：2026-10-24 由单独的数字改成「样例 N」。原来的状态圆点已删 ——
           它和右侧徽标（AC / CE / 运行中）说的是同一件事，两个色块并排纯属噪音。
           现在头栏从左到右只有：折叠箭头 → 样例 N → 状态徽标 → 删除 → 运行。 -->
      <span class="card__title">{{ t('tests.card.title', { n: index + 1 }) }}</span>
      <span class="badge" :data-status="testCase.status">{{ badgeLabel }}</span>
      <!-- 右侧两颗图标共用一套语言（2026-10-24 晚第三次改，用户要求）：都是 32×32 热区、
           默认无底色，删除在左、运行在右。「结果待重测」仍贴在徽标右侧，运行耗时紧挨着两颗图标。
           ▶ 用 aria-disabled 而不是原生 disabled：原生禁用会吞掉按钮的鼠标事件，
           runBlocked 那句原因就永远弹不出来。 -->
      <span
        v-if="testCase.stale"
        class="stale"
        :title="t('tests.card.staleTitle')"
      >
        <!-- 窄容器下换短称（见 @container 22.5rem 那条）：全称五个字会把标题挤成「样…」，
             短称把宽度还给标题；完整解释留在 title 里，最窄一档整条隐藏。 -->
        <span class="stale__full">{{ t('tests.card.staleLabel') }}</span>
        <span class="stale__short">{{ t('tests.card.staleLabelShort') }}</span>
      </span>
      <span class="grow"></span>
      <span v-if="timing" class="metric" :title="t('tests.card.timingTitle')">{{ timing }}</span>
      <AppTooltip class="trash-wrap" :text="t('tests.card.remove')">
        <button
          class="icon-btn icon-btn--danger"
          :aria-label="t('tests.card.remove')"
          :disabled="locked"
          @click="emit('remove', testCase)"
        >
          <AppIcon name="trash" :size="15" />
        </button>
      </AppTooltip>
      <AppTooltip class="run-wrap" :text="runBlocked || t('tests.card.runOne')">
        <button
          class="icon-btn icon-btn--run"
          :aria-label="runBlocked || t('tests.card.runOne')"
          :aria-disabled="locked || Boolean(runBlocked)"
          @click="requestRun"
        >
          <AppIcon name="play" :size="15" />
        </button>
      </AppTooltip>
    </header>

    <!-- 外壳只为展开 / 折叠那一下动画而存在（2026-10-06）：原来这里是 v-show，
         盒子的显示与隐藏是瞬间的。改成「grid 行高 1fr ↔ 0fr」的过渡，见 .card__fold。 -->
    <div class="card__fold" :class="{ 'is-collapsed': isCollapsed }">
      <div class="card__body">
        <!-- 三个字段的小标题（`.field__label`，10px、由 CSS text-transform 变大字）**刻意写死成英文**，
             中英界面都一样：input / Expected / Actual（用户 2026-09-29 定，理由是并排的三个标签要长得
             一致）。曾接过 i18n，同日要求**改回去**——别再顺手翻。末二词 2026-10-06 由
             `Expected Output` / `Actual Output` 砍短：这一行本来就窄，而三个框各自都已经是
             「标题 + 框」的结构，Output 二字没有增量信息。
             两个占位提示（框内的灰字）则跟着语言走，见 messages/tests.js。 -->
        <div class="io">
          <div class="field">
            <label class="field__label" :for="inputId">input</label>
            <textarea
              :id="inputId"
              ref="inputEl"
              v-model="inputModel"
              class="ta"
              :class="{ 'ta--truncated': inputHidden > 0 }"
              spellcheck="false"
              :placeholder="t('tests.card.inputPlaceholder')"
              :disabled="locked"
              @copy="onLongCopy($event, testCase.input)"
            ></textarea>
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
          <div class="field">
            <label class="field__label" :for="expectedId">Expected</label>
            <textarea
              :id="expectedId"
              ref="expectedEl"
              v-model="expectedModel"
              class="ta"
              :class="{ 'ta--truncated': expectedHidden > 0 }"
              spellcheck="false"
              :placeholder="t('tests.card.expectedPlaceholder')"
              :disabled="locked"
              @copy="onLongCopy($event, testCase.expectedOutput)"
            ></textarea>
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

        <div v-if="showActual" class="field">
          <span class="field__label field__label--row">
            <span>Actual</span>
            <!-- 两个动作包一层：这一行是 space-between，三个孩子会有一个被摊到正中间 -->
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
          <pre
            class="out"
            :class="{ 'is-empty': !outputView.text, 'is-truncated': outputView.long }"
            tabindex="0"
            @copy="onLongCopy($event, outputText)"
            >{{ outputView.text || actualPlaceholder }}</pre
          >
          <div v-if="outputView.long" class="ionote">
            <span class="ionote__text">
              {{ t('tests.card.omitted', { n: outputView.hidden }) }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </li>
</template>

<style scoped>
.card {
  /* 关键：允许收缩的话用例一多就会被 flex 压扁，
     列表 scrollHeight 永远等于 clientHeight，滚不动。 */
  flex: 0 0 auto;
  /* 无卡片化（2026-10-24 晚，用户要求「留白即边界」）：底色、外框、头部分隔线全部撤掉，
     样例直接落在面板底上；样例之间只靠留白分开。
     2026-10-24 深夜再去掉底部那条单线（用户要求），间距一个像素没动：
     下内边距 10px 与 .card__body 的 10px 合成 20px 的下半段留白。 */
  padding-bottom: 10px;
  /* 只剩透明度还在过渡（.is-stale 的降透明度） */
  transition: opacity 0.18s ease;
}

/* 样例悬停不加整块底色：这一行本身不可点，可点的是头栏按钮，
   它们各自有反馈；整块提亮会在无框的面上凭空铺出一块亮斑。 */
.card.is-stale {
  opacity: 0.86;
}

.card__head {
  display: flex;
  align-items: center;
  gap: 8px;
  /* 左内边距 0（2026-10-24 晚）：卡片不再有外框，头栏要跟下方正文共用同一条左轨。
     折叠箭头占满 0..22px 这一格，标题从 22px 起；正文的标签与代码文字也落在 22px
     （见 .card__body 与 .field__label 的取值），三者在左侧是一条直线。
     右侧仍是 8px，最右那颗运行钮不贴边。
     纵向 2px（原 7px）：运行 / 删除两颗图标按钮都高 32px，整个头栏因此高 32 + 4 = 36px，
     与它之前「22px 按钮 + 7px 上下内边距」的 36px 完全一致 —— 标题的垂直位置、
     卡片底到下一张标题的距离都不动，只把多出来的 10px 让给了那颗按钮。 */
  padding: 2px 8px 2px 0;
  /* 头栏与正文之间不再画线（2026-10-24 晚）：卡片已经拆掉，一条线会在无框的面上
     凭空划出一道横纹；分隔改由「头栏下内边距 + 正文上内边距」的留白承担。 */
}

.card__title {
  /* 标题现在是文字（样例 N），比原来的单个数字宽：窄面板下允许它省略，
     别把右侧的运行耗时与状态徽标顶出卡片（更窄的一档见文件末尾的容器查询）。
     2026-10-24 晚：字号 13 → 13.5、字重 650 → 700，作为整块样例唯一的强锚点。 */
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  font-size: 13.5px;
  font-weight: 700;
  letter-spacing: 0.1px;
  /* 数字必须等宽（2026-10-24）：状态徽标紧跟在标题后面，默认比例数字下「1」比「2 / 3」
     窄 1.8–2.1px，几张卡的徽标列就会逐张右移（实测 81.58 / 83.34 / 83.69）。
     tabular-nums 让 1..9 同宽，徽标落在同一条竖线上。 */
  font-variant-numeric: tabular-nums;
  color: var(--text);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.grow {
  flex: 1 1 auto;
}

.badge {
  display: inline-flex;
  align-items: center;
  /* 徽标不参与压缩、也不换行：窄面板下宁可让标题与「结果待重测」先让位，否则中文会被挤成竖排单字 */
  flex: 0 0 auto;
  white-space: nowrap;
  /* 参考稿那颗胶囊：实心淡底 + 同色字，**不描边** —— 形状完全靠底色撑起来。
     少了原来那条 0.4 的描边，底色就得自己重一档（0.13 → 0.18），否则会显得没边没沿。
     字重与字距也是照抄参考稿：600 + 0.05em，判定码那种两个大写字母最吃这一套。
     左右 padding 从 7 加到 8：里面只剩文字了，得靠自己把胶囊撑出形状。
     2026-10-23 由胶囊（999px）改成**圆角矩形 6px**（用户要求「形状改为圆角矩形，
     R 角用项目里常用的那个」）：6px 是全站出现最多的圆角值，也是同一块面板里
     `.add` / `.run-inline` 两颗按钮的圆角，判定码与按钮因此同属一套形状语言。
     ⚠️ 别改回 10px（编辑器卡那档）：这枚徽标连内边距才 ~17px 高，10 + 10 > 高度，
     浏览器会按比例把四个角一起夹小（CSS 规定相邻两角之和不得超边），又变回半圆胶囊。 */
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  color: var(--text-dim);
  background: var(--case-chip-bg);
  transition: color 0.18s ease, background-color 0.18s ease;
}

.badge[data-status='passed'] {
  color: var(--ok);
  background: rgba(137, 209, 133, 0.18);
}

.badge[data-status='failed'] {
  color: var(--fail);
  background: rgba(244, 135, 113, 0.18);
}

.badge[data-status='error'] {
  color: var(--err);
  background: rgba(224, 163, 78, 0.18);
}

/* 运行中的徽标**静态**（2026-10-23 改；此前是 `breathe` 呼吸：opacity 1 ↔ 0.55、1.15s 无限循环）。
   用户报「点运行，侧边栏的评测样例卡片发生闪烁」。实测（12 条用例、echo 引擎）：运行一开始
   **所有**卡片同时进 `running`（`runAll` 的 `queue.forEach(resetCase)`），于是 12 枚徽标的
   文字在 725ms 里同步淡到 0.55、再同步淡回来 —— 一片同步明灭的字，观感就是整栏在闪。
   而卡片高度全程恒为 349px、`.card` 节点零增删（探针记录），所以闪烁**只来自这条动画**，
   与布局、重渲染都无关。
   别再加回任何 opacity / 闪烁类的 infinite 动画：运行状态由徽标文案「运行中」与面板页头
   那颗转圈交代（2026-10-24 起状态圆点已删），一行 11px 的字明灭不是。 */
.badge[data-status='running'] {
  color: var(--info);
  background: rgba(79, 193, 255, 0.16);
}

.stale {
  font-size: 11px;
  color: var(--warn);
  white-space: nowrap;
  /* 头栏里除标题外唯一能缩的一格（耗时与两颗图标按钮都是 flex: 0 0 auto）。给它省略号，
     窄到放不下时它自己截断，而不是让文字溢出、压住右边的耗时和运行图标。 */
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 短称默认不渲染；窄容器那一档用它替掉全称（见 @container 22.5rem）。 */
.stale__short {
  display: none;
}

.metric {
  flex: 0 0 auto;
  font-family: var(--mono-font);
  font-size: 11px;
  color: var(--text-dim);
  white-space: nowrap;
}

/* 头栏右侧两颗图标（删除 / 运行）共用一套 32×32 的幽灵按钮语汇，规则见下方
   .icon-btn--danger 与 .icon-btn--run；中间的空余由 .grow 撑开。 */

.icon-btn {
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  color: var(--text-dim);
  transition: background-color 0.15s ease, color 0.15s ease;
}

.icon-btn:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--text);
}

.icon-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.icon-btn--danger:hover:not(:disabled) {
  color: var(--fail);
  background: rgba(244, 135, 113, 0.14);
}

/* 垃圾桶是休眠的幽灵（2026-10-24 晚第二次改，用户要求）：默认常驻，但只剩 0.18 的
   透明度、用次要文字色 —— 它替运行图标撑住右侧这一格，不至于留白，也不跟主操作抢注意力；
   鼠标进入卡片（或键盘进入头栏）时醒到 1，并转成柔和的危险色。
   点按面一直有效（不再 pointer-events: none）：它看得见，就该点得到；
   0.18 的幽灵图标也不至于被误触。触屏没有 hover，走 hover:none 那条常亮兜底。 */
.icon-btn.icon-btn--danger {
  /* 与运行图标同尺寸（2026-10-24 晚第三次改，用户要求）：32×32 热区、6px 圆角，
     两颗按钮的点击范围与形状完全一致。 */
  width: 32px;
  height: 32px;
  border-radius: 6px;
  /* 垃圾桶是纯图标按钮，必须清掉 UA 的 1px 6px 内边距（2026-10-24）：内容区只剩
     10px 宽时，15px 的 svg 把 grid 的 auto 列撑到 15px 并贴着内容区左缘排，
     墨迹因此比按钮中心右偏 2.5px（纵向内容区有 20px，装得下，不受影响）。
     置 0 后列宽回到 22px，墨迹与盒中心实测完全重合。 */
  padding: 0;
  color: var(--text-dim);
  opacity: 0.18;
  transition: background-color 0.15s ease, color 0.15s ease, opacity 0.15s ease;
}

/* 提示框的触发器就是图标自己那一格：宽度不参与挤压，头栏留白不会因为多包一层而变 */
.trash-wrap,
.run-wrap {
  flex: 0 0 auto;
}

/* 亮起条件按**键盘意图**判，不用 :focus-within（2026-10-24 修）：鼠标点一下旁边的运行按钮，
   焦点也会落进头栏，:focus-within 随即把垃圾桶点亮，指针移出卡片后它仍一直亮着 ——
   看着像垃圾桶自己被聚焦了。:has(:focus-visible) 只认键盘意图，鼠标点击不匹配。 */
.card:hover .icon-btn--danger:not(:disabled),
.card__head:has(:focus-visible) .icon-btn--danger:not(:disabled) {
  opacity: 1;
}

/* 鼠标进入卡片即按用户要求转危险色；键盘进入头栏只显形、不染红 —— 那时焦点还在
   别的按钮上，一枚红垃圾桶会跟正在聚焦的主操作抢眼神。等 Tab 真正落到垃圾桶
   （focus-visible）再变红，见下一条。 */
.card:hover .icon-btn--danger:not(:disabled),
.icon-btn--danger:focus-visible {
  color: var(--fail);
}

@media (hover: none) {
  .icon-btn--danger:not(:disabled) {
    opacity: 1;
    color: var(--fail);
  }
}

/* 运行图标（2026-10-24 晚第三次改）：与垃圾桶互换位置后独立成一颗 32×32 按钮，
   默认无底色、无描边，悬停才浮出 --icon-hover-bg。 */
.icon-btn.icon-btn--run {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  padding: 0;
  color: var(--text-dim);
}

.icon-btn--run:hover:not([aria-disabled='true']) {
  background: var(--icon-hover-bg);
  color: var(--text);
}

.icon-btn--run[aria-disabled='true'] {
  opacity: 0.35;
  cursor: default;
}

/* 禁用时仍允许悬停弹提示（runBlocked 的原因就靠它说），但不给悬停底色 ——
   亮起来的反馈会让人以为按下去有用。 */
.icon-btn--run[aria-disabled='true']:hover {
  background: transparent;
  color: var(--text-dim);
}

/* 焦点环画在按钮内部：它贴着卡片右缘，外扩的环会被头栏的内边距裁掉。 */
.icon-btn--run:focus-visible {
  outline: none;
  background: var(--icon-hover-bg);
  box-shadow: inset 0 0 0 1px var(--focus);
  color: var(--text);
}

.icon-btn--toggle {
  /* 箭头自己占住左侧 0..22px 那一格，标题、标签、代码文字统一从 22px 起
     （见 .card__head / .card__body）。-8px 的右外边距把「按钮宽度 + 头栏 gap」
     这笔账压回 22px；少了它标题会被 gap 推到 30px，左侧四行字的起点就散了。
     内边距仍要归零（2026-10-06）：<button> 默认的 1px 6px 会把 17px 的 svg 顶到
     内容区左侧，墨迹从 6.75px 偏到 10.25px，箭头看着像掉出了自己的格子。
     另外两颗图标按钮（arrow-up / copy）不跟着改：它们并排在输出区右上角、右侧没有
     可对齐的边，2.5px 的偏移看不出来。删除 / 运行那两颗 32px 按钮贴着卡片右缘，偏移会直接显成
     「图标贴着右边」—— 2026-10-24 已在 --danger / --run 规则里单独补了 padding: 0。 */
  margin: 0 -8px 0 0;
  padding: 0;
  transition: color 0.15s ease;
}

/* 折叠箭头不要悬停底色（2026-10-06）：它只有 8.5px 宽的一点墨迹，鼠标停上去时
   那颗 22×22 的灰方块（--bg-hover）比字形本身还抢眼，点完鼠标还停在那里，看着
   像「选中了还亮着」。反馈留给文字由灰变亮（--text-faint → --text）。
   必须写在这里：与 .icon-btn:hover:not(:disabled) 同权重，靠后面这条覆盖掉。 */
.icon-btn--toggle:hover:not(:disabled) {
  background: transparent;
}

/* 折叠箭头的旋转挂在 svg 上，**不挂在按钮上**（2026-10-06）：
   起因是这颗按钮当时并不水平居中 —— `.icon-btn` 没重置 <button> 默认的 1px 6px 内边距，
   22px 的盒子里内容区只剩 10px，17px 的 svg 溢出后靠在内容区左侧（左内缩 6px，
   居中该是 2.5px），墨迹中心因此落在按钮盒中心右边 3.5px。旋转若由按钮承担，默认
   transform-origin 取按钮盒中心，视觉上就成了「绕字形左边缘转」，折叠一瞬间箭头
   先往右跳 3.5px 再转。
   后来那颗按钮补上了 padding: 0（见上），svg 已归位到盒子正中，转按钮与转 svg
   在数学上就等价了；但**这条仍要挂在 svg 上**：① svg 的 viewBox 中心正是字形中心
   （chevron 占 x6..18、y9..15，中心 12,12），旋转轴天然落在墨迹中心，与按钮盒的
   内边距设置彻底解耦；② 哪天想再调这颗按钮的 padding / margin 把箭头往左挪，
   也不会再把旋转轴带偏。实测展开态、动画半程、折叠态三处墨迹中心完全重合。
   transition 也随之挂在 svg 上，否则这里会变成瞬变、动画消失。 */
.icon-btn--toggle svg {
  transition: transform 0.18s ease;
}

.icon-btn--toggle.is-collapsed svg {
  transform: rotate(-90deg);
}

/* 展开 / 折叠动画（2026-10-06）：grid 行高 1fr ↔ 0fr。
   这是纯 CSS 里唯一能「过渡到内容高度」的写法 —— max-height 得先猜一个上限，猜大了
   折叠后半程在空转、猜小了直接把正文截断，而这里的正文高度是活的（两个输入框按内容
   自适应、实际输出最多能到 320px）。行高走 fr 就没有上限问题，中途掉头也接得住。
   子项必须 min-height: 0 + overflow: hidden：否则 0fr 那一行仍被内容的最小高度撑着，
   收不下去。 */
.card__fold {
  display: grid;
  grid-template-rows: 1fr;
  transition: grid-template-rows 0.2s ease;
}

.card__fold.is-collapsed {
  grid-template-rows: 0fr;
}

/* 折叠后把正文移出 Tab 序：原来靠 v-show 的 display: none 顺手做到这件事，现在为了
   动画不能再用 display（display 不可过渡），改成 visibility。延迟 0.2s 与行高动画同步
   —— 折叠过程中文字还看得见，收完才隐藏；展开时没有延迟，立刻可见。
   （「减少动态效果」下 transition-duration 被全局压成 0.01ms，但 delay 不跟着改，
   于是收完那一下内容还会多留 0.2s —— 看不见，因为那时行高已经是 0、被 overflow 裁掉了。）

   上下内边距要跟着收到 0：**padding 是不可压缩的**，min-height: 0 只能把内容盒收到 0，
   0 + 10 那 10px 仍然撑着行 —— 不补这一脚，折叠后卡在头栏下面留一条 10px 的空档。
   左右不动：收横向内边距会让正文宽度变化、里面的输入框重排（ResizeObserver 还会跟着
   重算高度），白添抖动。 */
.card__fold > .card__body {
  min-height: 0;
  overflow: hidden;
  visibility: visible;
  transition: visibility 0s linear, padding 0.2s ease;
}

.card__fold.is-collapsed > .card__body {
  padding-top: 0;
  padding-bottom: 0;
  visibility: hidden;
  transition: visibility 0s linear 0.2s, padding 0.2s ease;
}

.card__body {
  /* 无卡片之后（2026-10-24 晚），左内边距必须凑出那条 22px 的左轨：
     12（这里）+ 1（代码面的隐性描边）+ 9（.ta 的左内边距）= 22，
     标签靠 .field__label 的 10px 同样落到 22。标题也在 22 —— 四行字一条线。
     右 6px：三块代码面不必顶到面板分隔条上。
     上 0（2026-10-24 深夜再收一次，原 4px，更早是 8px）：用户又要求把标题与 INPUT 的间隔
     再缩小一档。头栏自身的 32px 图标按钮已经比 13.5px 的标题文字高出不少，
     标题文字底到头栏盒底本来就有约 10px 的天然留白，再叠 4px 会显得空；
     收到 0 之后，标题到 INPUT 之间只剩头栏自身 2px 下内边距 + 标签行高自带的一点上白边。
     下 10px：与卡片自身的 10px 下内边距合成 20px 的下半段样例间留白。 */
  padding: 0 6px 10px 12px;
  display: grid;
  gap: 6px;
}

.io {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

/* 断点一律写成 rem：全局缩放时卡片内容会一起变大，阈值必须同步上移。
   postcss-pxtorem 不处理 at-rule 参数（见 vite.config.js），写成 px 就会脱节。 */
@container (min-width: 35rem) {
  .io {
    grid-template-columns: 1fr 1fr;
  }
}

.field {
  display: block;
  min-width: 0;
}

.field__label {
  display: block;
  /* 左 10px（2026-10-24 晚，原为 4px）：标签文字与下方代码文字落在同一条 22px 左轨上
     （正文 12 + 10 = 22；代码面 12 + 1 + 9 = 22）。无卡片底色之后，对齐就是骨架，
     这一处不能再让标签自行外飘。
     写 px 让它跟着全局缩放一起走（.ta 的 9px 内边距同理，两者是同一套坐标）。
     .field__label--row 那份（ACTUAL）同样吃到这条左内边距：它是 space-between 行，
     左内边距只推文字、右侧动作组仍贴右缘，不会跟着左移。 */
  padding-left: 10px;
  margin-bottom: 4px;
  font-size: 10px;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: var(--text-faint);
}

.field__label--row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  /* 行高按文字行盒定死（2026-10-06）：右侧动作组是两颗 22px 的图标按钮，不干预的话
     行高被它们撑到 22px，而 10px 标签文字的行盒只有 12px、垂直居中 → 文字底下白留 5px，
     再叠 .field__label 的 4px 外边距，实测「文字底 → 框顶」9px，而 input / Expected
     那两处都只有 4px，看着就是这一栏离框格外远。
     1.4em = 14px（比 12px 行盒多 2px）：文字在行内只白留 1px。
     margin-bottom 收到 3px（2026-10-20）：叠上那 1px，「文字底 → 框顶」与 input /
     Expected 的 4px 完全对齐。代价：22px 按钮的底边从「正好落在框顶」变成压进框 1px
     （下溢 4px − 外边距 3px），压住的这一条由 .field__actions 的 clip-path 剪掉，
     否则输入框顶部那 1px 点不到（见下）。
     margin-top 4px 是补回行高缩掉的那 4px，让上一块到 ACTUAL 文字的视觉距离仍是 11px
     （配 .card__body 的 gap 6px，与 input → Expected 那处对齐）。 */
  height: 1.4em;
  margin-top: 4px;
  margin-bottom: 3px;
}

/* 标签行右侧的动作组（写入期望输出 + 复制）。两个图标按钮挨着放、间距 2px ——
   它们各自的 22px 方格里已经有留白，再拉开就显得跟标签不是一行了。
   clip-path（2026-10-20）：行高 14px 装不下 22px 的按钮，上下各溢出 4px；行外边距
   收到 3px 后（见 .field__label--row 的注释），按钮底边压进下方输入框 1px。inset
   底边内收 1px 把这一条剪掉 —— clip-path 裁的不只是视觉、也裁命中测试，被剪的 1px
   点击会落到框上；按钮本体与悬停灰块只少了贴着框的那 1px 弧线，肉眼难辨。 */
.field__actions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  clip-path: inset(0 0 1px 0);
}

.ta {
  display: block;
  width: 100%;
  /* 高度由脚本按内容自适应（上限 MAX_IO_HEIGHT），不再需要手动拖拽调整 */
  min-height: 76px;
  padding: 8px 9px;
  border-radius: 6px;
  /* 只填底、不描边（2026-10-24 晚）：无框卡片之后，代码区域靠一块极弱的深色面
     交代「这里能写 / 这里是读数」，而不是再围一圈线。描边保留 1px 透明：
     它既撑着那条 22px 左轨的坐标（12 + 1 + 9），也是聚焦环与截断虚线的落点。 */
  background: var(--code-block-bg);
  border: 1px solid transparent;
  font-family: var(--mono-font);
  font-size: 13.5px;
  line-height: 1.55;
  resize: none;
  overflow-y: hidden;
  transition: border-color 0.15s ease;
}

.ta:focus {
  outline: none;
  border-color: var(--focus);
}

/* 「框里装不下」的标记（见脚本里的 IO_PREVIEW_TRIGGER 与 overflow 那段）。
   **只给真被截断的情形**（`xxxHidden > 0`）：那种状态下框里确实少了一截正文，底边这条虚线
   是「下面还有东西不在这个框里」的分隔提示；只是超出框高要滚动的那种（字符一个没少）不给
   —— 拖滚动条就能看到全部，浏览器那根滚动条已经把话说完了，再画虚线是噪音（见脚本里的注释）。
   框本身仍然可以打字，所以不能再整框画虚线 —— 那会被读成「这里不能编辑」。
   改成只把底边换成虚线，边框色必须从 --border-soft 提到 --border：前者在浅色主题下几乎看不见，
   1px 的虚线一旦没有对比度就完全白做。 */
.ta--truncated,
.out.is-truncated {
  border-bottom-style: dashed;
  border-bottom-color: var(--border);
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

.ionote__btn:hover {
  background: var(--bg-control-hover);
  border-color: var(--border);
  color: var(--text);
}

.out {
  margin: 0;
  min-height: 76px;
  max-height: 360px;
  overflow: auto;
  padding: 8px 9px;
  border-radius: 6px;
  /* 同 .ta：一块弱底、没有可见描边，Actual 与上面两个输入面才像同一组读数窗 */
  background: var(--code-block-bg);
  border: 1px solid transparent;
  font-family: var(--mono-font);
  font-size: 13.5px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text);
  cursor: text;
}

.card[data-status='passed'] .out {
  color: var(--ok-soft);
}

.card[data-status='failed'] .out,
.card[data-status='error'] .out {
  color: var(--fail-soft);
}

.out.is-empty {
  color: var(--text-faint);
}

/* ---------- 窄容器下的降级 ----------
   容器是 TestPanel 里 .cases 的 inline-size（约等于面板宽度 − 16px 内边距 − 滚动条）。
   面板下限放宽到 240px 后（见 App.vue 的 --tests-min-cap），头部一行放不下全部内容：
   折叠箭头、徽标、运行 / 删除按钮都是 flex: 0 0 auto，标题与「结果待重测」可以压缩。
   所以按重要性逐级让步，而不是让它们挤在一起。

   注意优先级：**每例的运行耗时（.metric）与徽标在任何宽度下都不隐藏** ——
   前者是这一行里唯一「看完会想改代码」的信息；后者是 AC / WA 唯一的判定结论。
   唯一还能让位的是「结果待重测」
   （它还有面板头部的 ?/N AC 徽标与卡片降透明度在提示）。 */
@container (max-width: 22.5rem) {
  .card__head {
    gap: 6px;
    /* 左内边距与基础值同为 0：省宽度的活交给右边（8 → 6），左边一让，
       折叠箭头和整列文字的左轨就会跟着横跳，而它才是这一行的起点。
       纵向 2px 同基础值：头栏高度由 32px 的幽灵按钮撑住。 */
    padding: 2px 6px 2px 0;
  }

  /* gap 收到 6 之后，箭头右侧的负外边距也要同步收 2px，
     标题才仍从 22px 起（22 + gap + margin-right = 22）。 */
  .card__head .icon-btn--toggle {
    margin-right: -6px;
  }

  /* 「结果待重测」换短称：全称五个字在这一档会和标题一起截断（实测 110% 缩放、
     300px 容器下标题只剩「样…」），短称把省下的宽度还给标题；再窄一档整条隐藏。 */
  .stale__full {
    display: none;
  }

  .stale__short {
    display: inline;
  }

  /* 短称也放不下时（带运行耗时的最窄一段）先挤它、别挤标题：标题是这张卡的身份，
     待重测只是提醒，还有面板页头的 ?/N 与卡片降透明度兜着（2026-10-24 实测 270px 容器）。 */
  .stale {
    flex-shrink: 4;
  }

  /* 正文：左内边距与基础值同为 12px —— 22px 的左轨不能因为面板变窄就断掉；
     省宽度从右侧出。纵向与基础值一致（上 0 / 下 10），标题与 INPUT 的间隔不因窄屏变大。
     gap 4px 配 .io 的 8px：Actual 那行标签行高定死在 1.4em = 14px、文字白留 1px，
     另有 margin-top 4px（见 .field__label--row 的注释），
     所以 4 + 4 + 1 = 9px，与 input → Expected 那处的 8 + 1 = 9px 齐平。 */
  .card__body {
    padding: 0 6px 10px 12px;
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

/* 短称也装不下的一档：整条让掉，把宽度还给标题。「结论已过期」仍有面板页头的 ?/N
   与卡片降透明度在说。阈值按容器**内容盒**算（.cases 有 8px 横向内边距，比外宽小 16px），
   界线取在实测折点上：276px 内容宽短称还装得下、272px 标题与短称就开始一起折，
   故 17rem = 272px 起隐藏。 */
@container (max-width: 17rem) {
  .stale {
    display: none;
  }
}

/* 再挤一档：间距收到最小，把宽度省给运行耗时与徽标。
   徽标不藏：AC / WA 是这一行唯一的判定结论。「结果待重测」已在 17rem 那档整条让掉。 */
@container (max-width: 15.625rem) {
  .card__head {
    gap: 4px;
    padding: 2px 5px 2px 0;
  }

  /* 同上：负外边距跟住 gap，左轨仍是 22px */
  .card__head .icon-btn--toggle {
    margin-right: -4px;
  }

  /* 提示行同理：说明文字让位给「复制全部」那颗按钮 —— 它才是能点的东西。
     只对**带按钮的那种提示行**（两个输入框底下的截断态）让位；输出块底下那行没有按钮，
     藏掉就剩一条空行，所以用 :has 把它们区分开。 */
  .ionote:has(.ionote__btn) .ionote__text {
    display: none;
  }
}
</style>
