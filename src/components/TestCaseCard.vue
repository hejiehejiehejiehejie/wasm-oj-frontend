<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { locale, t } from '../i18n/index.js'
import { px, uiScale } from '../composables/useUiScale.js'

const props = defineProps({
  testCase: { type: Object, required: true },
  index: { type: Number, required: true },
  locked: Boolean,
})

const emit = defineEmits(['remove', 'run'])

// 徽标文案：跑完的用例用 runner 给的判定码（AC / WA / CE / TLE / RE / ERR），
// 没跑过或正在跑才用状态名。判定码比「通过 / 未通过」短一个量级，窄面板下不会被挤成竖排。
const STATUS = {
  idle: { labelKey: 'tests.card.idle', icon: '' },
  running: { labelKey: 'tests.card.running', icon: '' },
  passed: { label: 'AC', icon: 'check' },
  failed: { label: 'WA', icon: 'close' },
  error: { label: 'ERR', icon: 'alert' },
}

const status = computed(() => STATUS[props.testCase.status] ?? STATUS.idle)
// STATUS 里存 key（它是 <script setup> 顶层构造的，翻译只能发生在 computed 里）
const badgeLabel = computed(() => props.testCase.verdict || t(status.value.labelKey))

// 折叠状态与用例记录放在一起，卡片被复用（v-for key 为 id）时不会丢。
const isCollapsed = computed(() => props.testCase.collapsed === true)

function toggleCollapse() {
  props.testCase.collapsed = !isCollapsed.value
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
// 冻结值留着的话，界面会摆着一句「已省略 4,505 个字符」而其实一个字符都没省。
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

// 「框里装不下」有两种成因，提示行对两者都要给：
//   ① 被截断（> IO_PREVIEW_TRIGGER）—— 框里根本没有这部分字符，`xxxHidden > 0`；
//   ② 只是超出框高 —— 字符一个不少，全在框里，只是要滚动才看得见。
// 以前只有 ①，于是「十几行到 6000 字符」这一段是**静默**的：框被内容撑满、底边也还是实线，
// 用户看不出下面还有东西（实测 200 行 ≈ 3000 字符就是如此）。
// 这里把 ② 也测出来，交给模板去点亮虚线底边与那行小字。
const inputOverflow = ref(false)
const expectedOverflow = ref(false)
// 纯溢出态（没被截断、只是超出框高）下要报的那个数：框里**当前看不见**的字符数。
// 它是比例估算（可见高度 / 内容总高 × 总长），不参与显示文本的切分，所以打字时数字变一下无所谓 ——
// 变的是数字，框里那一段一个字都不会动。
const inputOverflowHidden = ref(0)
const expectedOverflowHidden = ref(0)

// 提示行要报的数：截断态用「真值里没进框的那截」，纯溢出态用「框里看不见的那截」。
// **两种成因共用一句「已省略 N 个字符」**（2026-09-29 定稿）。曾拆成两句 —— 纯溢出态
// 改说「还有 N 个字符未显示 · 可滚动查看」，理由是那里一个字符都没省、写「已省略」
// 会和「框底找不到 `……`」自相矛盾（用户当面撞过一次）；**但用户当天又要求改回统一
// 一句**，即接受「纯溢出态说已省略、框尾却没有省略号」这个不一致。**别再自动拆开**。
// 参数是**值**不是 ref —— 模板里 refs 会被自动解包，函数里再 `.value` 拿到的是 undefined，
// 一路传到 fmt() 就是 `Cannot read properties of undefined (reading 'toLocaleString')`，
// 而这次抛错发生在渲染期，整张卡片会一起渲染失败（连框里的省略号都出不来）。
function omittedCount(hidden, overflowHidden) {
  return hidden > 0 ? hidden : overflowHidden
}

function autoGrow(el, overflowingRef, overflowHiddenRef) {
  if (!el) return
  // v-show 折叠时元素不可见，scrollHeight 为 0，此时不动高度，展开后会重新计算。
  if (!el.scrollHeight) return
  const cs = getComputedStyle(el)
  const border = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth)
  const padding = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
  el.style.height = 'auto'
  const full = el.scrollHeight + border
  const cap = px(MAX_IO_HEIGHT)
  el.style.height = `${Math.min(full, cap)}px`
  const over = full > cap
  el.style.overflowY = over ? 'auto' : 'hidden'
  // 只在两侧之间翻转时写：赋同一个布尔值本来就不会触发重渲染，
  // 这行断言的是「虚线底边与那行小字不会把宽度改掉」，因此不会和 ResizeObserver 形成回调环。
  overflowingRef.value = over
  // 看不见的比例 = 1 − 可见内容高 / 内容总高（两个高都要先减掉内边距：scrollHeight 含内边距不含边框）。
  // el.value.length 是**框里**这份文本的长度 —— 纯溢出态下它就是真值，数字才对得上。
  const contentH = el.scrollHeight - padding
  const visibleH = el.clientHeight - padding
  overflowHiddenRef.value = over
    ? Math.max(1, Math.round(el.value.length * Math.max(0, 1 - visibleH / contentH)))
    : 0
}

function growAll() {
  autoGrow(inputEl.value, inputOverflow, inputOverflowHidden)
  autoGrow(expectedEl.value, expectedOverflow, expectedOverflowHidden)
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

async function copyText(text) {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    /* clipboard blocked: nothing else to try */
  }
}

const copyOutput = () => copyText(outputText.value)

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
        <AppIcon name="chevron" :size="13" />
      </button>
      <span class="card__title">#{{ index + 1 }}</span>
      <span class="badge" :data-status="testCase.status">
        <AppIcon v-if="status.icon" :name="status.icon" :size="11" :stroke-width="2.6" />
        <span>{{ badgeLabel }}</span>
      </span>
      <!-- 判定区从状态徽标右侧一直延伸到删除按钮左侧：视觉不变，只把整条空白变成点得到的运行按钮 -->
      <button
        class="run-zone"
        :title="t('tests.card.runOne')"
        :aria-label="t('tests.card.runOne')"
        :disabled="locked"
        @click="emit('run', testCase)"
      >
        <span
          v-if="testCase.stale"
          class="stale"
          :title="t('tests.card.staleTitle')"
        >
          {{ t('tests.card.staleLabel') }}
        </span>
        <span class="grow"></span>
        <span v-if="timing" class="metric" :title="t('tests.card.timingTitle')">{{ timing }}</span>
        <span class="run-zone__icon">
          <AppIcon name="play" :size="12" />
        </span>
      </button>
      <button
        class="icon-btn icon-btn--danger"
        :title="t('tests.card.remove')"
        :disabled="locked"
        @click="emit('remove', testCase)"
      >
        <AppIcon name="trash" :size="13" />
      </button>
    </header>

    <div v-show="!isCollapsed" class="card__body">
      <!-- 三个字段的小标题（`.field__label`，10px、由 CSS text-transform 变大字）**刻意写死成英文**，
           中英界面都一样：input / Expected Output / Actual Output（用户 2026-09-29 定，理由是
           并排的三个标签要长得一致）。曾接过 i18n，同日要求**改回去**——别再顺手翻。
           输入框的占位提示同为 `input`；只有期望输出那条占位跟着语言走（见 messages/tests.js）。 -->
      <div class="io">
        <div class="field">
          <label class="field__label" :for="inputId">input</label>
          <textarea
            :id="inputId"
            ref="inputEl"
            v-model="inputModel"
            class="ta"
            :class="{ 'ta--truncated': inputHidden > 0 || inputOverflow }"
            spellcheck="false"
            placeholder="input"
            :disabled="locked"
            @copy="onLongCopy($event, testCase.input)"
          ></textarea>
          <div
            v-if="inputHidden > 0 || inputOverflow"
            class="ionote"
            :class="{ 'ionote--truncated': inputHidden > 0 }"
          >
            <span class="ionote__text">
              {{ t('tests.card.omitted', { n: fmt(omittedCount(inputHidden, inputOverflowHidden)) }) }}
            </span>
            <button
              v-if="inputHidden > 0"
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
          <label class="field__label" :for="expectedId">Expected Output</label>
          <textarea
            :id="expectedId"
            ref="expectedEl"
            v-model="expectedModel"
            class="ta"
            :class="{ 'ta--truncated': expectedHidden > 0 || expectedOverflow }"
            spellcheck="false"
            :placeholder="t('tests.card.expectedPlaceholder')"
            :disabled="locked"
            @copy="onLongCopy($event, testCase.expectedOutput)"
          ></textarea>
          <div
            v-if="expectedHidden > 0 || expectedOverflow"
            class="ionote"
            :class="{ 'ionote--truncated': expectedHidden > 0 }"
          >
            <span class="ionote__text">
              {{ t('tests.card.omitted', { n: fmt(omittedCount(expectedHidden, expectedOverflowHidden)) }) }}
            </span>
            <button
              v-if="expectedHidden > 0"
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

      <div class="field">
        <span class="field__label field__label--row">
          <span>Actual Output</span>
          <button
            class="icon-btn"
            :title="t('tests.card.copyOutput')"
            :disabled="!outputText"
            @click="copyOutput"
          >
            <AppIcon name="copy" :size="12" />
          </button>
        </span>
        <pre
          class="out"
          :class="{ 'is-empty': !outputView.text, 'is-truncated': outputView.long }"
          tabindex="0"
          @copy="onLongCopy($event, outputText)"
          >{{ outputView.text || t('tests.card.notRun') }}</pre
        >
        <div v-if="outputView.long" class="ionote">
          <span class="ionote__text">
            {{ t('tests.card.omitted', { n: outputView.hidden }) }}
          </span>
        </div>
      </div>
    </div>
  </li>
</template>

<style scoped>
.card {
  /* 关键：卡片自身 overflow:hidden 会让 flex 自动最小高度变成 0，
     若再允许收缩（默认 flex-shrink:1），用例一多就会被压扁，
     列表 scrollHeight 永远等于 clientHeight，滚不动。 */
  flex: 0 0 auto;
  border: 1px solid var(--border-soft);
  border-left: 3px solid var(--case-border);
  border-radius: 8px;
  background: var(--bg-card);
  overflow: hidden;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease;
}

.card:hover {
  border-color: var(--border);
  border-left-color: currentColor;
}

.card[data-status='passed'] {
  border-left-color: var(--ok);
}

.card[data-status='failed'] {
  border-left-color: var(--fail);
}

.card[data-status='error'] {
  border-left-color: var(--err);
}

.card[data-status='running'] {
  border-left-color: var(--info);
  box-shadow: 0 0 0 1px rgba(79, 193, 255, 0.25);
}

.card.is-stale {
  opacity: 0.86;
}

/* 折叠后只剩标题栏，去掉那条悬空的分隔线 */
.card.is-collapsed .card__head {
  border-bottom-color: transparent;
}

.card__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px 7px 10px;
  background: var(--bg-card-head);
  border-bottom: 1px solid var(--border-soft);
}

.card__title {
  flex: 0 0 auto;
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: 0.2px;
  white-space: nowrap;
}

.grow {
  flex: 1 1 auto;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  /* 徽标不参与压缩、也不换行：窄面板下宁可让判定区先让位，否则中文会被挤成竖排单字 */
  flex: 0 0 auto;
  white-space: nowrap;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 11px;
  border: 1px solid transparent;
  color: var(--text-dim);
  background: var(--case-chip-bg);
  transition: color 0.18s ease, background-color 0.18s ease, border-color 0.18s ease;
}

.badge[data-status='passed'] {
  color: var(--ok);
  background: rgba(137, 209, 133, 0.13);
  border-color: rgba(137, 209, 133, 0.4);
}

.badge[data-status='failed'] {
  color: var(--fail);
  background: rgba(244, 135, 113, 0.13);
  border-color: rgba(244, 135, 113, 0.4);
}

.badge[data-status='error'] {
  color: var(--err);
  background: rgba(224, 163, 78, 0.13);
  border-color: rgba(224, 163, 78, 0.4);
}

.badge[data-status='running'] {
  color: var(--info);
  background: rgba(79, 193, 255, 0.12);
  border-color: rgba(79, 193, 255, 0.4);
  animation: breathe 1.15s ease-in-out infinite;
}

@keyframes breathe {
  50% {
    opacity: 0.55;
  }
}

.stale {
  font-size: 11px;
  color: var(--warn);
  white-space: nowrap;
  /* 判定区里唯一能缩的一格（耗时与运行图标都是 flex: 0 0 auto）。给它省略号，
     窄到放不下时它自己截断，而不是让文字溢出、压住右边的耗时和运行图标。 */
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.metric {
  flex: 0 0 auto;
  font-family: var(--mono-font);
  font-size: 11px;
  color: var(--text-dim);
  white-space: nowrap;
}

/* 运行判定区：撑满徽标与删除按钮之间的空白，内部排版与原来的头栏完全一致 */
.run-zone {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  /* 去掉 UA 默认的按钮内边距，否则整条判定区的内容会整体偏移 */
  padding: 0;
  color: inherit;
  /* 兜底：判定区是头部唯一可压缩的一格，内容宁可被裁也不许压到相邻格上 */
  overflow: hidden;
}

.run-zone:disabled {
  cursor: default;
}

.run-zone__icon {
  display: inline-grid;
  place-items: center;
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  color: var(--text-dim);
  transition: background-color 0.15s ease, color 0.15s ease;
}

.run-zone:hover:not(:disabled) .run-zone__icon {
  background: var(--bg-hover);
  color: var(--text);
}

.run-zone:disabled .run-zone__icon {
  opacity: 0.35;
}

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

.icon-btn--toggle {
  margin-left: -3px;
  transition: transform 0.18s ease, background-color 0.15s ease, color 0.15s ease;
}

.icon-btn--toggle.is-collapsed {
  transform: rotate(-90deg);
}

.card__body {
  padding: 10px;
  display: grid;
  gap: 10px;
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
}

.ta {
  display: block;
  width: 100%;
  /* 高度由脚本按内容自适应（上限 MAX_IO_HEIGHT），不再需要手动拖拽调整 */
  min-height: 76px;
  padding: 8px 9px;
  border-radius: 5px;
  background: var(--bg-input);
  border: 1px solid var(--border-soft);
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
   两种成因共用它：真被截断的、以及只是超出框高要滚动的 —— 对用户都是「下面还有」。
   框本身仍然可以打字，所以不能再整框画虚线 —— 那会被读成「这里不能编辑」。
   改成只把底边换成虚线：一条「下面还有，只是没显示」的分隔提示。
   边框色必须从 --border-soft 提到 --border：前者在浅色主题下几乎看不见，
   1px 的虚线一旦没有对比度就完全白做。 */
.ta--truncated,
.out.is-truncated {
  border-bottom-style: dashed;
  border-bottom-color: var(--border);
}

/* 提示行：左边一句说明，右边「复制全部」（只有截断态才有那颗按钮，纯溢出态没东西可「全部」复制）。
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
  border-radius: 5px;
  background: var(--bg-input);
  border: 1px solid var(--border-soft);
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
   容器是 TestPanel 里 .cases 的 inline-size（约等于面板宽度 − 24px 内边距 − 滚动条）。
   面板下限放宽到 240px 后（见 App.vue 的 --tests-min-cap），头部一行放不下全部内容：
   折叠箭头、#N、徽标、删除按钮都是 flex: 0 0 auto，不参与压缩，只剩判定区能缩。
   所以按重要性逐级让步，而不是让它们挤在一起。

   注意优先级：**每例的运行耗时（.metric）与徽标图标（✓/✕）任何宽度下都不隐藏** ——
   前者是这一行里唯一「看完会想改代码」的信息；后者与 AC / WA 文字是一体的判定图示，
   单独把图标藏掉会让徽标看起来缺了一角。唯一还能让位的是「结果待刷新」
   （它还有面板头部的 ?/N AC 徽标与卡片降透明度在提示）。 */
@container (max-width: 22.5rem) {
  .card__head {
    gap: 6px;
    padding: 7px 6px 7px 8px;
  }

  /* 正文同步收一点内边距，把省下的宽度留给输入框与输出框 */
  .card__body {
    padding: 8px;
    gap: 8px;
  }

  .io {
    gap: 8px;
  }

  .ta,
  .out {
    padding: 7px 8px;
  }
}

/* 再挤一档：间距收到最小，只让掉「结果待刷新」，把宽度省给运行耗时与徽标图标。
   徽标图标（✓/✕）不藏：它与 AC / WA 文字是一体的，藏了徽标就缺一角。 */
@container (max-width: 15.625rem) {
  .card__head {
    gap: 4px;
    padding: 7px 5px 7px 6px;
  }

  .stale {
    display: none;
  }

  /* 提示行同理：说明文字让位给「复制全部」那颗按钮 —— 它才是能点的东西。
     但只对**截断态**让位：那一行里至少还有按钮撑着。纯溢出态那一行只有这一句话，
     藏掉就剩一条空行，用户彻底看不出框里装不下（见脚本里 overflow 那段的注释）。 */
  .ionote--truncated .ionote__text {
    display: none;
  }
}
</style>
