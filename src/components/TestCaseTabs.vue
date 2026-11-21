<script setup>
/**
 * 评测样例的第二种面孔：分项标签视图（2026-11-19 加，用户提的方案）。
 *
 * 【与列表模式的分工】列表模式（TestCaseCard 流）适合「扫一眼几条样例都什么结果」，
 * 分项模式适合「盯住一条改」。两者共用 TestCaseBody 那一份正文，外壳各写各的：
 * 这里没有折叠箭头、没有 `grid 1fr ↔ 0fr`，同一时刻只有一份正文，纵向空间全让给它。
 * 滚动所有者是 `.case-viewport`（列表那边是 `.cases`），页脚那条发丝线的判据同源，
 * 见 composables/useScrollEdge.js。
 *
 * 【这一层不管什么】空态、页脚、页头 Teleport、庆祝纸屑都在 TestPanel 里 —— 那些与
 * 「卡片长什么样」无关，两种模式百分之百共用。用例为空时本组件根本不会被渲染
 * （TestPanel 直接退回列表模式的空态），所以这里不做 0 用例分支。
 */
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import AppTooltip from './AppTooltip.vue'
import ContextMenu from './ContextMenu.vue'
import TestCaseBody from './TestCaseBodyPane.vue'
import VerdictBadge from './VerdictBadge.vue'
import { useOverlayScrollbar } from '../composables/useOverlayScrollbar.js'
import { useScrollEdge } from '../composables/useScrollEdge.js'
import { useScrollReveal } from '../composables/useScrollReveal.js'
import {
  caseDotStatus,
  caseInputPreview,
  caseStampCode,
  caseStampTone,
  caseTimingText,
} from '../services/caseSummary.js'
import { isTestsPaneDragInteractive } from '../services/testsPaneDrag.js'
import { testsRail } from '../services/editorPanes.js'
import { locale, t } from '../i18n/index.js'

const props = defineProps({
  cases: { type: Array, required: true },
  running: Boolean,
  /** 不可运行的原因（活跃文件不是代码）。空串＝可运行。见 TestPanel 的同名 prop */
  runBlocked: { type: String, default: '' },
  /** 「添加测试样例」的完整说明（含快捷键），由 TestPanel 算好传下来 —— 绑定表只有那一处 */
  addTitle: { type: String, default: '' },
  /**
   * 把标签轨 Teleport 进评测岛页头（`TestsPane` 的 `#tests-pane-tabs`）。
   * 侧栏场景保持 false：轨还留在正文里，与改造前逐像素相同。
   */
  teleportRail: Boolean,
  /**
   * 工作台布局（2026-11-20 方案一）：底部横跨的评测岛里改走
   * 「左侧样例轨 + 右侧满高 I/O 面板」，不再有顶部标签轨 / 状态栏。
   * 侧栏与左右停靠保持 false，走下面原有那一套。
   */
  workbench: Boolean,
  /**
   * 只渲染标签轨（2026-11-21）：分项标签的空态没有页签可显示，但仍要那根
   * 「页签栏」在场，添加按钮也住在里面。视口与正文整块不渲染，根节点让出高度，
   * 由 TestPanel 的空态标题接管下面那片空白。
   */
  railOnly: Boolean,
  /**
   * 纵向停靠档（2026-11-20 方案二，左右停靠的评测岛）：
   * 标签轨变成平齐的 IDE 页签（去胶囊），删掉 36px 状态栏，
   * 单样例结论挂进 ACTUAL 列头，正文交给 TestCaseBody 的满高分栏。
   * 动作全部收进 TestPanel 的 紧凑底栏（本组件也要把「跑当前样例」暴露出去）。
   */
  vertical: Boolean,
  /**
   * 工作台需要的「面板级」读数与动作（从 TestPanel 透传）。工作台与页头是两棵互斥的
   * DOM，结论 / 动作不再靠 Teleport 投递（目标节点会换人，Teleport 不会重新解析），
   * 改由这里直接画：结论用 TestPanel 传来的 verdict 对象交给 VerdictBadge，动作 emit 回 TestPanel。
   */
  showSubmit: Boolean,
  submitting: Boolean,
  runTitle: { type: String, default: '' },
  submitTitle: { type: String, default: '' },
  verdict: { type: Object, default: null },
  verdictVisible: { type: Boolean, default: true },
  elapsedText: { type: String, default: '' },
})

const emit = defineEmits(['add', 'remove', 'run-one', 'more-below', 'drag-start', 'run-all', 'submit', 'head-context-menu'])

/** 工作台轨底那颗「运行全部」的置灰判据 —— 与 TestPanel 页脚同一条算式 */
const runAllDisabled = computed(
  () => props.running || !props.cases.length || Boolean(props.runBlocked),
)

const rootEl = ref(null)
const railEl = ref(null)
/** 整条标签轨（`.case-tabs`：可滚的胶囊轨 + 那颗「+」）。只用来量菜单该落在哪条横线上 */
const tabsRowEl = ref(null)
const viewportEl = ref(null)
const contentEl = ref(null)
/** 工作台的样例行列表（滚动所有者；覆盖式滑块与「切样例后滚进视野」都挂在它上面） */
const workbenchListEl = ref(null)
/** 隐藏的量尺：一颗与真实页签同款的 .tab，只用来量三种写法的宽度（见 measureFormat） */
const measureEl = ref(null)
const measureTextEl = ref(null)

// 滚动容器两条：覆盖式滑块（不占宽度）+ 页脚那条「下面还有」的线
useOverlayScrollbar(viewportEl)
// 工作台左侧轨的样例列表是另一条独立的滚动区，滑块同样用覆盖式
useOverlayScrollbar(workbenchListEl)
const { moreBelow, sync: syncEdge } = useScrollEdge(viewportEl, contentEl)
watch(moreBelow, (value) => emit('more-below', value), { immediate: true })
// 内容高度变化不一定改容器的盒子（它是 flex 定高的），ResizeObserver 只能接住宽度那半；
// 用例结论回来（ACTUAL 整块出现）时高度会跳一截，补一次重算。
watch(() => props.cases, () => nextTick(syncEdge), { deep: true })

/* ---------------------------------------------------------------- 标签轨溢出 */
/**
 * 两端的渐隐遮罩：只在**那个方向真的还有内容**时出现。
 *
 * 常显会变成两条灰边压在胶囊上（看着像没画完），而永远不显又等于没有溢出提示。
 * 1px 是亚像素余量：缩放后 scrollLeft 常带小数，差 0.5 时两头会各亮一块不该亮的遮罩。
 */
const railFade = ref({ left: false, right: false })

function syncRailFade() {
  const el = railEl.value
  if (!el) return
  railFade.value = {
    left: el.scrollLeft > 1,
    right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
  }
}

/**
 * 纵向滚轮 → 横向位移（用户方案里点名的一条）：标签轨只有一行，鼠标在它上面滚时
 * 期望的是「往后翻胶囊」，而不是整块面板上下跑（这会儿面板本来也没有可滚的东西）。
 * 只接管**纯纵向**滚轮：触控板横向滑动自带 deltaX，再叠一次就会走双倍。
 */
function onRailWheel(event) {
  if (event.deltaX || !event.deltaY) return
  const el = railEl.value
  if (!el || el.scrollWidth <= el.clientWidth) return
  // 直接写 scrollLeft（瞬间到位）。⚠️ 别给 .case-tabs 加 scroll-behavior: smooth：
  // 滚轮是连发的，每一格都排队做一次补间，手感会变成拖泥带水的一串动画。
  // 切 Tab 时那次自动适配由 revealElement 自己排程，不受这里影响。
  el.scrollLeft += event.deltaY
  event.preventDefault()
}

let railObserver = null
function bindRailObserver() {
  railObserver?.disconnect()
  railObserver = null
  const el = railEl.value
  // 工作台没有横向轨，滚动容器换成左侧样例行列表；两者只会存在一个
  const list = workbenchListEl.value
  if (!el && !list) return
  // 面板尺寸变化（拖分隔条 / 窗口缩放 / 全局缩放）会改变「装不装得下」：
  // 轨的高度恒为 36，但 inline-size 一变 ResizeObserver 照样会报；工作台列表看的是高与宽。
  railObserver = new ResizeObserver(() => {
    syncRailFade()
    scheduleMeasure()
    // 当前页签可能被新尺寸挤出可见框；拖拽中跟手，不做平滑动画
    scheduleReveal({ instant: true })
  })
  if (el) railObserver.observe(el)
  // 轨本身是 `flex: 0 1 auto`：样例少时它的宽度等于内容宽，拖分隔条也不会变。
  // 所以「可用空间」变化还得靠整行来触发 —— 行是撑满可用宽度的那一层。
  if (tabsRowEl.value && tabsRowEl.value !== el) railObserver.observe(tabsRowEl.value)
  if (list) railObserver.observe(list)
  syncRailFade()
  scheduleMeasure()
}

// 胶囊的增删 / 序号位数变化都会改「装不装得下」，补一次重算（含名称档位）
watch(
  () => [props.cases.length, props.cases.map((item) => item.id).join(',')],
  () =>
    nextTick(() => {
      syncRailFade()
      measureFormat()
    }),
)

/* ---------------------------------------------------------------- 当前 Tab */
// 存 id 不存下标：用例回写会在运行途中把对象整批换掉（见 App.vue 的 flushCasesWrite），
// 下标可能指向别的用例，id 才是身份。
const activeId = ref(props.cases[0]?.id ?? null)
const activeIndex = computed(() => props.cases.findIndex((item) => item.id === activeId.value))
const activeCase = computed(() => props.cases[activeIndex.value] ?? null)

/**
 * 切样例后的滚动适配（2026-11-21 方案）。
 *
 * 容器随布局切换：分项标签看横向轨，工作台看左侧样例行列表；目标按 `data-case-id`
 * 现取（DOM 在下一帧才换好）。`inset` 让目标避开轨两端的 16px 渐隐遮罩，
 * `axis` 明确只动该动的那一条 —— 横轨没有纵向滚动，列表也没有横向滚动。
 * 通用逻辑（nearest 落点、平滑 / 防抢滚、scrollend 复核、卸载清理）见
 * composables/useScrollReveal.js。
 */
const { schedule: scheduleReveal } = useScrollReveal({
  container: () => (props.workbench ? workbenchListEl.value : railEl.value),
  target: (container) => {
    const id = activeId.value
    if (id === null) return null
    return container.querySelector(`[data-case-id="${id}"]`)
  },
  inset: () => (props.workbench ? 8 : 20),
  axis: () => (props.workbench ? 'y' : 'x'),
})

/**
 * 评测岛窄条的「点样例 → 展开并选中」请求。窄条在 TestsPane 里，选中状态归本组件，
 * 所以走一次性请求位而不是把 activeId 提升出去：
 *   · 先展开、再写 pending（TestsPane 保证顺序），这里的 watcher 在可见布局上落选中；
 *   · 消费后立刻清空，避免切换文件 / 视图时被一条陈旧请求劫持。
 */
watch(
  () => testsRail.pendingCaseId,
  (id) => {
    if (!id) return
    if (props.cases.some((item) => item.id === id)) activeId.value = id
    testsRail.pendingCaseId = null
    // 目标恰好已经是当前样例时 activeId 不变，watch 不会响：展开后仍要把它滚进视野
    scheduleReveal()
  },
)

// 状态与动作已收进页签水印、ACTUAL 列头和紧凑底栏（2026-11-20 整岛方案），
// 原 36px 的 active-case-head 整块退场。

/* ---------- 页签的状态水印（2026-11-20） ---------- */
/* 口径已收进 services/caseSummary.js（评测岛窄条也画同一枚水印），这里只保留局部别名，
   模板与既有调用点一个字都不用改。 */
const tabStampCode = caseStampCode
const tabStampTone = caseStampTone

/* ---------- 页签名称档位（2026-11-20） ---------- */
/**
 * 名称格式不再由「样例数 ≥ 4」这种单变量决定，也不是单纯看岛宽：
 *   ① 用隐藏量尺量出当前**每一条**序号在「样例 N / N」下的真实宽度；
 *   ② 按当前样例数把整条轨所需总宽算出来（含轨内固定 gap）；
 *   ③ 三档依次判定：全称 + 24px 呼吸 → 全称 + 8px 紧凑 → 纯数字 + 8px 紧凑。
 * 只有三档的壳宽（24px / 8px）都按固定值量，不去读当前渲染出来的内边距，
 * 档位才只随行宽单调变化，不会在临界宽度附近回弹。
 * 样例数、序号位数、布局宽度三者因此同时参与判定；样例增删后序号会重排，
 * 下一次测量自然会把档位与新的序号对齐。
 */
const labelFormat = ref('long')

function measureFormat() {
  const row = tabsRowEl.value
  const measure = measureEl.value
  const textEl = measureTextEl.value
  const count = props.cases.length
  if (!row || !measure || !textEl || !count) return
  // 轨是 `flex: 0 1 auto`（装得下就贴着胶囊、装不下才收缩），所以它的 clientWidth
  // 在样例少时只是内容宽度，不能当可用空间。可用空间要按**整行**算：
  // 行宽 − 行内边距 − 「+」− 行 gap，剩下才是标签轨最多能占到的宽度。
  //
  // 全称档的排布间距固定按 6px 量，**不读**当前计算值：窄容器档会把行 / 轨的 gap
  // 收到 4px，若跟着变，全称总宽会在临界宽度附近又「装得下」，名称档位就会回弹。
  const LONG_GAP = 6
  const rowStyle = getComputedStyle(row)
  const addWidth = row.querySelector('.tab-add-wrap')?.getBoundingClientRect().width ?? 0
  const avail =
    row.clientWidth -
    (Number.parseFloat(rowStyle.paddingLeft) || 0) -
    (Number.parseFloat(rowStyle.paddingRight) || 0) -
    addWidth -
    LONG_GAP
  if (avail <= 0) return
  // 文字宽度只跟文本与字号有关，按文本缓存；壳宽则一次量出两档固定值：
  // 全称宽档（左右各 24px 内边距 + 边框）与紧凑档（左右各 8px + 边框）。
  // 量尺的内边距由 .case-tabs .tab--measure 固定，不跟当前名称档走，
  // 否则「收窄 → 全称又装得下 → 回弹」会再次出现。
  measure.classList.remove('is-measure-tight')
  textEl.textContent = 'M'
  const wideChrome =
    measure.getBoundingClientRect().width - textEl.getBoundingClientRect().width
  measure.classList.add('is-measure-tight')
  const tightChrome =
    measure.getBoundingClientRect().width - textEl.getBoundingClientRect().width
  measure.classList.remove('is-measure-tight')
  const textWidths = new Map()
  const textWidthOf = (text) => {
    let width = textWidths.get(text)
    if (width === undefined) {
      textEl.textContent = text
      width = textEl.getBoundingClientRect().width
      textWidths.set(text, width)
    }
    return width
  }
  // 逐条量而不是拿最大序号代表全部：序号的位数分布不同（1..9 与 10..12 宽度不一样），
  // 逐条求和才能既不过早降级、也不在刚好差几像素时溢出。
  const totalOf = (labelOf, chrome) => {
    let sum = 0
    for (let i = 1; i <= count; i += 1) sum += textWidthOf(labelOf(i)) + chrome
    return sum + (count - 1) * LONG_GAP
  }
  const labelOf = (i) => t('tests.card.title', { n: i })
  // 三档：全称宽档 → 全称紧凑档 → 纯序号。两次比较都用固定壳宽，行宽单调减，
  // 所以只会按这个顺序降级，不会跳回上一档。
  if (totalOf(labelOf, wideChrome) <= avail) {
    labelFormat.value = 'long'
  } else if (totalOf(labelOf, tightChrome) <= avail) {
    labelFormat.value = 'tight'
  } else {
    labelFormat.value = 'num'
  }
}

// 拖分隔条时 ResizeObserver 会按帧回调；一次测量要做几十次排版，统一收进 rAF 合并。
let measureRaf = 0
function scheduleMeasure() {
  cancelAnimationFrame(measureRaf)
  measureRaf = requestAnimationFrame(measureFormat)
}

watch(
  () => [props.vertical, props.teleportRail, props.workbench],
  () =>
    nextTick(() => {
      // 从工作台切回标签轨时轨是新建的，观察者要重新挂一次（bindRailObserver 自己会防重复）
      bindRailObserver()
      scheduleMeasure()
    }),
)
watch(locale, () => nextTick(scheduleMeasure))
// 档位一换，胶囊宽度就变；两端羽化与「还有没有下文」要按新宽度重算
watch(labelFormat, () => nextTick(syncRailFade))

/**
 * 每颗胶囊的气泡文案（悬停时显示这条样例的输入，2026-11-19 加）。
 *
 * 按 `id + input` 记住上一次算出来的结果：气泡文案在模板里读，会被每次重渲染读到 ——
 * 跑一轮回来 props.cases 整批换新（见 App.vue 的 flushCasesWrite），若每次重渲染都重新
 * 切一遍几十条输入的行，纯属白烧。输入没改就复用（id 是身份，input 才是内容）。
 * 缓存只增不减也安全：条目数 = 用例数，删掉的用例那次读不到就会覆盖掉自己那条。
 */
const previewCache = new Map()
function tabPreview(record) {
  const hit = previewCache.get(record.id)
  if (hit && hit.input === record.input) return hit.text
  const text = caseInputPreview(record.input)
  previewCache.set(record.id, { input: record.input, text })
  return text
}

let activateLast = false

function requestAdd() {
  if (props.running || props.runBlocked) return
  // 新样例追加在末尾：切过去，用户才能立刻开始打字（列表模式靠把列表滚到底达到同一目的）
  activateLast = true
  emit('add')
}

/**
 * 删掉指定的一条 —— 胶囊右键菜单走这一条路。
 *
 * 【为什么按 id 而不是按「当前」】菜单删的可能是**没被选中的**那条（用户右键别人，
 * 不想先切过去再删）。所以这里自己找下标，只有删的正好是当前这条时才挪焦点：
 * 下一颗，没有就上一颗。删别人的时候 activeId 一个像素都不动 —— 用户右键的是别人，
 * 没道理把视线从他正看着的那条上挪开。
 *
 * ⚠️ 挪 activeId 必须在 emit 之前：等 cases 真的少了一条时，下面那条 watch 看到
 * activeId 仍然存在就直接返回，不会把焦点甩回第 1 条。这里按 id 操作，不存在「先改
 * activeId 就删错人」那个旧坑（那是 activeCase 随 activeId 算出来的时代留下的）。
 */
function removeCaseById(id) {
  if (props.running) return
  const index = props.cases.findIndex((item) => item.id === id)
  if (index < 0) return
  const target = props.cases[index]
  if (id === activeId.value) {
    const next = props.cases[index + 1] ?? props.cases[index - 1] ?? null
    activeId.value = next ? next.id : null
  }
  previewCache.delete(id)
  emit('remove', target)
}

function requestRunOne() {
  if (props.running || props.runBlocked || !activeCase.value) return
  // 这一次是「单跑」：下面那条 running 的 watch 靠它区分「运行全部」，不做自动跳错
  singleRun = true
  emit('run-one', activeCase.value)
}

/**
 * 纵向停靠档的 紧凑底栏住在 TestPanel 里，而「当前是哪条样例」只有本组件知道
 * （activeId 是这一层的内部状态）。所以把「跑当前样例」原样暴露出去，
 * 底栏那颗「单测」按钮通过 ref 调它 —— 守卫、singleRun、emit 全都还是这一条路，
 * 不在外面另写一份判据。
 */
defineExpose({
  runActive: requestRunOne,
  /** 当前样例的序号（1 起，无选中为 0）：底栏按钮用它写「运行样例 N」 */
  activeNumber: computed(() => (activeIndex.value >= 0 ? activeIndex.value + 1 : 0)),
})

/** 右键菜单里的「运行该样例」：跑的是被右击的那条，不要求先切过去 */
function runCaseById(id) {
  if (props.running || props.runBlocked) return
  const target = props.cases.find((item) => item.id === id)
  if (!target) return
  // 与状态栏那颗 ▶ 同一条判据：这一次是单跑，不做「跑完自动跳第一处失败」
  singleRun = true
  emit('run-one', target)
}

/**
 * 用例表换了一份（切文件 / 增 / 删）时把 activeId 拉回一个存在的 id。
 *
 * 三种来路：① 用户点 + 添加（activateLast，落到新末尾）；② 删掉当前项（页签 × 走
 * removeCaseById，已经先把 activeId 指到邻居上，这里看到它还在就什么都不做）；③ 整个文件换了 ——
 * 那时 id 全不认识，回到第 1 条，与列表模式「切文件后从顶部开始」同构。
 */
watch(
  () => props.cases.map((item) => item.id),
  (ids) => {
    if (activateLast) {
      activateLast = false
      if (ids.length) activeId.value = ids[ids.length - 1]
      return
    }
    if (activeId.value !== null && ids.includes(activeId.value)) return
    activeId.value = ids[0] ?? null
  },
)

/**
 * 切 Tab 之后把目标页签滚进视野、正文回到顶部。
 *
 * 滚动适配交给 useScrollReveal：它按容器可见框做 nearest 落点，平滑滚完再复核一次；
 * 正文回顶不参与这套调度 —— 内容已经换了，第一眼就该从顶部开始。
 */
watch(activeId, (id) => {
  if (id === null) return
  if (viewportEl.value) viewportEl.value.scrollTop = 0
  scheduleReveal()
})

// 布局切换后滚动容器是新建的（横向轨 ↔ 工作台列表）：等 DOM 落定直接瞬时落位
watch(
  () => props.workbench,
  () => scheduleReveal({ instant: true }),
)

/* ------------------------------------------------- 跑完自动跳到第一处失败 */
/**
 * 「运行全部」结束后把焦点送到第一条非 AC 的样例上（用户方案里的专属交互）。
 *
 * 【为什么需要】列表模式下跑完可以扫视整列卡片找红徽标；分项模式里非激活样例的正文是
 * 藏着的，一屏只有一条。等用户自己一个个点过去找错，等于把列表模式最大的优点丢了。
 *
 * 【守卫三条，缺一不可】
 *   ① **只认运行全部**：逐张 ▶（本组件的单跑钮）不跳。用户正盯着第 2 条改，跑一下看看，
 *      结果被甩到第 5 条，是很粗暴的打断。`singleRun` 在发起那一刻置位，running 翻起来时消费。
 *   ② **用户中途自己切过就不跳**：起点记 `tabAtStart`，结束时对不上就说明用户已经有主张了。
 *   ③ **切 Tab 但不抢焦点**：只改 activeId（走上面那条 watch 滚进视野），不 focus() ——
 *      焦点留在页脚的「运行全部」上，键盘用户接着按空格就能重跑。
 *
 * 【还有一条隐性守卫】只看 failed / error，不看 idle：中断（abort）之后剩下的样例会被复位成
 * idle，那是「没跑」不是「跑错」，跳过去毫无意义。
 */
let singleRun = false
let tabAtStart = null

watch(
  () => props.running,
  (now, before) => {
    if (now && !before) {
      if (singleRun) {
        singleRun = false
        tabAtStart = null
        return
      }
      tabAtStart = activeId.value
      return
    }
    if (now || !before) return

    const started = tabAtStart
    tabAtStart = null
    if (started === null) return
    if (activeId.value !== started) return
    const firstFail = props.cases.find(
      (item) => item.status === 'failed' || item.status === 'error',
    )
    if (!firstFail || firstFail.id === activeId.value) return
    activeId.value = firstFail.id
  },
)

/* ---------------------------------------------------------------- 键盘 */
/**
 * `Alt+↑/↓` 切样例、`Alt+1..9` 直跳第 N 条（2026-11-19）。
 *
 * 【为什么不进绑定表】绑定表里每一条都是可改键、可解绑、要进设置面板的动作；这三条是
 * 这一个视图内部的导航，且**只在它存在时才有意义** —— 写进全局表会让「当前没开分项视图」
 * 的用户在设置里看到两条按了没反应的键。它们的生命周期跟着本组件挂载 / 卸载走。
 *
 * 【为什么必须避开编辑器与输入框】`Alt+↑/↓` 在 Monaco 里是 Move Line Up/Down（默认键位，
 * 没被改绑过）。本监听挂在 window 上，一旦不设防，用户在主编辑器里按它就变成「切样例」，
 * 而且因为我们在 window 上拦，Monaco 根本收不到。所以焦点在 `.monaco-editor` 内、
 * 或在任何输入类元素里时一律放行。同理，输入框里 Option+↑ 在 macOS 上是「移到段首」，
 * 抢过来一样是捣乱。
 *
 * 【为什么还要判面板可见】侧栏折叠后这块面板仍在 DOM 里（宽度收到 1px），此时按
 * `Alt+2` 去切一个看不见的 Tab，用户只会觉得「键盘坏了」。40px 是折叠态 1px 与最窄
 * 展开态（约 158px）之间的安全分界。
 */
const sidebar = inject('sidebarTabs', null)
const panelActive = computed(() => !sidebar || sidebar.activeTab.value === 'tests')

function isTypingTarget(target) {
  if (!(target instanceof Element)) return false
  if (target.closest('.monaco-editor')) return true
  const editable = target.closest('input, textarea, select, [contenteditable]')
  // contenteditable="false" 不算输入：它是拿来当可聚焦容器的
  return Boolean(editable) && editable.getAttribute('contenteditable') !== 'false'
}

function onKeydown(event) {
  if (event.defaultPrevented || event.isComposing) return
  if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
  if (!panelActive.value) return
  if ((rootEl.value?.clientWidth ?? 0) < 40) return
  if (isTypingTarget(event.target)) return

  const count = props.cases.length
  if (!count) return

  if (event.code === 'ArrowUp' || event.code === 'ArrowDown') {
    const step = event.code === 'ArrowDown' ? 1 : -1
    const from = activeIndex.value
    const next = Math.min(count - 1, Math.max(0, (from < 0 ? 0 : from) + step))
    if (next === from) return
    event.preventDefault()
    activeId.value = props.cases[next].id
    return
  }

  // 物理键位（code）：macOS 上 Option+1 会把 key 变成 '¡'，只认 code 才对得上
  const hit = /^(?:Digit|Numpad)([1-9])$/.exec(event.code)
  if (!hit) return
  const index = Number(hit[1]) - 1
  if (index >= count || index === activeIndex.value) return
  event.preventDefault()
  activeId.value = props.cases[index].id
}

/* ------------------------------------------------- 胶囊右键 / 长按菜单 */
/**
 * 胶囊上的右键菜单（2026-11-19 加，用户要求）：就地运行 / 删掉这一条，**不必先切过去**。
 *
 * 复用 `ContextMenu`（Teleport 到 body 的通用件，文件树 / 编辑页签同款）：
 * 形状、配色、遮罩、点外部 / Esc 关闭全部照旧，这里只负责「在哪儿弹、弹什么」。
 * 两项：「运行该样例」（2026-11-20 用户要求，放第一项）与「删除该样例」。
 * 删除的文案与状态栏那颗垃圾桶同一份（`tests.card.remove`），同一个动作不该有两种说法；
 * 运行中两项都禁用（数据层按批回写，跑到一半删会撕裂用例表；跑的时候也不能再起一轮）。
 *
 * 【弹出来的锚点】**贴在被点那颗胶囊的下沿**，横向对齐它的左缘 —— 不再跟着光标走
 * （2026-11-19 用户报改成这样的）。跟着光标时的后果很具体：菜单第一项正好落在
 * 光标底下一行，连按两下右键（第一下被菜单收掉、第二下落在刚弹出来的那一项上）就把它执行了。
 * 锚定到胶囊下沿之后，菜单整块都在那排胶囊**下面**，光标怎么点都撞不到它。
 * 长按同理：手指压在胶囊上，菜单从胶囊底下冒出来，既没被指尖挡住，也不会被抬手那一下误触。
 *
 * 量的是**胶囊**的底边，不是轨盒（`.case-tabs` 36px）的底边：轨定高 36、胶囊只有 26，
 * 轨底那 5px 是纵向留白，拿它当锚点菜单会整体掉到下面状态栏那一行上（2026-11-19 用户：
 * 「这个位置有点太偏下了」）。
 */
const menu = ref(null)

/** 菜单与胶囊下沿的间距（px）。只留一口气，读起来仍是「这颗胶囊的菜单」 */
const MENU_GAP = 2

/**
 * 菜单左缘相对胶囊左缘再右移的量（px）。
 *
 * 贴着胶囊左缘时菜单离面板左边界只剩 12px（胶囊左缘本身就在轨的 12px 内边距上），
 * 读起来像被挤在边上；右移一格让它有独立的留白（2026-11-19 用户：「位置偏右一点」）。
 * 纵向不动 —— 那一条（胶囊下沿 +2）用户已经定了。
 */
const MENU_OFFSET_X = 8

/**
 * @param {string} id 被右击 / 长按的那条样例
 * @param {Element|null} anchorEl 那颗胶囊的 DOM（取它的左缘与下沿）
 * @param {{x:number,y:number}|null} origin 工作台样例行用光标位置起菜单（行是横贯轨的整条，贴行下沿会落到轨外）
 */
function openTabMenuAt(id, anchorEl, origin = null) {
  if (!props.cases.some((item) => item.id === id)) return
  const tab = anchorEl?.getBoundingClientRect()
  const row = tabsRowEl.value?.getBoundingClientRect()
  // 胶囊滚出左缘时 rect 是负的（被裁剪了），先把横坐标拉回轨内，免得菜单贴到分隔条另一侧
  const baseX = row && tab ? Math.max(tab.left, row.left) : (tab?.left ?? 0)
  menu.value = {
    x: origin ? origin.x : baseX + MENU_OFFSET_X,
    // 胶囊量不到时退回轨底（理论上不会发生：菜单只从胶囊身上开）
    y: origin ? origin.y : ((tab ?? row)?.bottom ?? 0) + MENU_GAP,
    caseId: id,
    items: [
      // 运行放在第一项（2026-11-20 用户要求）：右击一条样例最常见的诉求是「只跑它」
      {
        id: 'run',
        label: t('tests.tabs.runOne'),
        disabled: props.running || Boolean(props.runBlocked),
      },
      { id: 'remove', label: t('tests.card.remove'), disabled: props.running },
    ],
  }
}

function onMenuSelect(id) {
  const m = menu.value
  // 选中即收：菜单盖住的那片区域会吞掉下一次按下（编辑页签那边踩过同一个坑）
  menu.value = null
  if (!m) return
  if (id === 'run') runCaseById(m.caseId)
  if (id === 'remove') removeCaseById(m.caseId)
}

/**
 * 开跑 / 跑完时把菜单收掉：`items` 是打开那一刻的快照（`disabled` 就在里面），
 * 状态一变它就跟现实对不上了 —— 跑完之后菜单里那项还灰着，用户只会以为「坏了」。
 * 收掉让用户重开一次，拿到的就是当前状态。
 */
watch(
  () => props.running,
  () => {
    menu.value = null
  },
)

/**
 * 长按阈值与容差：450ms / 10px，与 `useTreeDrag` / `useEditorMenu` / `useSelectionHandles`
 * 里的 `LONG_PRESS_MS` 同口径 —— 手指在同一个应用里按任何东西，判定都该是同一个数。
 */
const LONG_PRESS_MS = 450
const LONG_PRESS_SLOP = 10

/** 正在计时的这一次按下（`{ id, el, x, y, timer }`）；没有按下就是 null */
let press = null
/**
 * 手势守卫两条：长按触发之后，浏览器补出的 `click` 与 `contextmenu` 各要吞一发。
 *   · `click` —— 抬手后会补一发，不挡的话「长按删样例」会先把这条切过去，页面在菜单底下
 *     悄悄换了一次正文（用户要的恰恰是「不进入样例」）。
 *   · `contextmenu` —— 真机长按往往还会派发系统菜单那一发，走到胶囊上会**再开一次**菜单；
 *     锚点虽是同一条轨下沿，重开仍要重播一遍入场动画，看起来像闪了一下。
 * 判据不用计时而用「下一发 pointerdown 就清」：补出来的那串兼容鼠标事件里没有 pointerdown，
 * 所以它正好覆盖「抬手 → 补发」这一段；用户再按任何东西时（哪怕是 100ms 后的另一颗胶囊）
 * 先落一次 pointerdown，守卫立刻失效，不会出现「点了没反应」的一段瞎区。
 */
let swallowClick = false
let swallowContextMenu = false

function clearPress() {
  if (!press) return
  window.clearTimeout(press.timer)
  window.removeEventListener('pointermove', onPressMove)
  window.removeEventListener('pointerup', clearPress)
  window.removeEventListener('pointercancel', clearPress)
  press = null
}

function onPressMove(event) {
  if (!press) return
  if (
    Math.abs(event.clientX - press.x) > LONG_PRESS_SLOP ||
    Math.abs(event.clientY - press.y) > LONG_PRESS_SLOP
  ) {
    // 动了就是在滚轨 / 滑走，不是长按
    clearPress()
  }
}

function firePress() {
  const p = press
  if (!p) return
  clearPress()
  swallowClick = true
  swallowContextMenu = true
  // 工作台的样例行横贯整条轨：贴行下沿会把菜单弹到轨外，改贴指尖位置
  openTabMenuAt(p.id, p.el, props.workbench ? { x: p.x, y: p.y } : null)
}

/**
 * 只认手指与笔：鼠标走右键那条。给鼠标也开长按会把「按住读提示」误伤成弹菜单，
 * 而鼠标本来就有更明确的入口。
 */
function onTabPointerDown(event, id) {
  // 新手势一落就先撤掉上一次长按留下的守卫（放在鼠标那一支之前 —— 右键也是 pointerdown）
  swallowClick = false
  swallowContextMenu = false
  if (event.pointerType === 'mouse') return
  if (event.button !== 0) return
  clearPress()
  press = {
    id,
    // 存元素本体而不是坐标：菜单的锚点是「这一行胶囊的下沿」，量的是盒子，不是手指落点
    el: event.currentTarget,
    x: event.clientX,
    y: event.clientY,
    timer: window.setTimeout(firePress, LONG_PRESS_MS),
  }
  // 挂在 window 上：手指可能滑出胶囊（触屏的隐式指针捕获也照样冒泡到 window），
  // 但 touchmove 之后被浏览器接管成滚动时只会来一发 pointercancel —— 一并收掉。
  window.addEventListener('pointermove', onPressMove)
  window.addEventListener('pointerup', clearPress)
  window.addEventListener('pointercancel', clearPress)
}

function onTabContextMenu(event, id) {
  event.preventDefault()
  if (swallowContextMenu) {
    swallowContextMenu = false
    return
  }
  openTabMenuAt(
    id,
    event.currentTarget,
    props.workbench ? { x: event.clientX, y: event.clientY } : null,
  )
}

function onTabClick(id) {
  if (swallowClick) {
    swallowClick = false
    return
  }
  activeId.value = id
  // 点的就是当前样例时 activeId 不变，watch 不会响；点按本身仍要保证它完整可见
  scheduleReveal()
}

/**
 * 工作台样例轨页头的按下：整条页头就是拖动把手（换边拖动由 TestsPane → EditorPaneGrid 处理）。
 * 从「+」或页头里的按钮起手时放行 —— 那是点击，不是换边。
 */
function onRailHeadPointerDown(event) {
  if (event.button !== 0) return
  if (isTestsPaneDragInteractive(event.target)) return
  emit('drag-start', event)
  event.preventDefault()
}

/**
 * 工作台没有独立页头（方案一），左侧轨的标题行就是它的页头（2026-11-21 用户反馈）：
 * 右键这里应该和横跨岛的页头一样出停靠菜单。菜单本体在 TestsPane，这里只把事件
 * 冒上去；是否真的弹由 TestsPane 的 getTestsPaneDragStartKind 判定 ——「+」是
 * button，会被放行成原生菜单，空白 / 拖拽把手 / 结论才弹停靠项。
 */
function onRailHeadContextMenu(event) {
  if (event.defaultPrevented) return
  emit('head-context-menu', event)
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  bindRailObserver()
  // 请求可能在组件挂载前就已写入（折叠窄条 → 展开途中切回分项视图）：挂载时补消费一次
  const pending = testsRail.pendingCaseId
  if (pending) {
    if (props.cases.some((item) => item.id === pending)) activeId.value = pending
    testsRail.pendingCaseId = null
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  railObserver?.disconnect()
  railObserver = null
  cancelAnimationFrame(measureRaf)
  // useScrollReveal 通过 onScopeDispose 自己清理 rAF / 监听器 / 定时器
  clearPress()
})
</script>

<template>
  <div
    v-if="!workbench"
    ref="rootEl"
    class="tabs-view"
    :class="[
      `is-label-${labelFormat}`,
      { 'is-embedded': teleportRail, 'is-vertical': vertical, 'is-rail-only': railOnly },
    ]"
  >
    <!-- 标签轨（36px，不随下方正文滚动）：可滚的胶囊轨道 + 轨外固定的虚线「+」。
         ⚠️ `+` 必须留在 `.case-tabs__track` **外面**（2026-11-19 用户审查后改）：
           ① 它在滚动流里时，样例一多就被滚出视野，而它是这一栏唯一的新建入口；
           ② 它停在右缘时正好落在 `.is-fade-right` 的 16px 羽化带里，会被遮罩浸成半透明，
              看起来像禁用 / 坏掉。挪出来之后它既不会滚走，也不会被遮罩碰到。

         2026-11-20（方案一）：评测岛里这条轨 Teleport 进 35px 页头，与代码岛的 EditorTabs
         连成同一条水平线；侧栏场景（`teleportRail=false`）原地渲染，一个字都不变。
         ⚠️ 必须 `defer`：换边（`moveTestsPane`）是「关掉再按新侧重开」，同一帧里新旧两座
         岛的 `#tests-pane-tabs` 会同时在文档里；立即解析会命中即将被摘掉的旧落点，
         标签轨跟着旧 DOM 一起消失（实测：换到底部后页头只剩静态标题）。`defer` 等整轮
         patch 结束后再解析，拿到的必定是留下那一座。 -->
    <Teleport defer to="#tests-pane-tabs" :disabled="!teleportRail">
      <div
        ref="tabsRowEl"
        class="case-tabs"
        :class="[`is-label-${labelFormat}`, { 'is-embedded': teleportRail, 'is-vertical': vertical, 'is-inline': !teleportRail }]"
        role="group"
        :aria-label="t('tests.tabs.railLabel')"
      >
        <div
          ref="railEl"
          class="case-tabs__track"
          :class="{ 'is-fade-left': railFade.left, 'is-fade-right': railFade.right }"
          @scroll="syncRailFade"
          @wheel="onRailWheel"
        >
          <!-- 悬停胶囊显示这条样例的输入（2026-11-19 用户要求，与「+」同一条通路）。
               ⚠️ 因此**不能**再给按钮挂原生 `title`：两个气泡会先后冒出来，一个在浏览器角落、
               一个在正下方，读的人只会觉得提示重了。胶囊自己的名字由内部那几段文字给。
               placement 用 bottom：理由同下面那颗「+」—— 上方就是侧栏页头。 -->
          <AppTooltip
            v-for="(item, index) in cases"
            :key="item.id"
            class="tab-tip"
            :text="tabPreview(item)"
            code
            placement="bottom"
          >
            <button
              type="button"
              class="tab"
              :class="{ 'is-active': item.id === activeId }"
              :data-case-id="item.id"
              :data-tone="tabStampTone(item) || null"
              :aria-current="item.id === activeId ? 'true' : undefined"
              data-pane-drag-proxy
              @click="onTabClick(item.id)"
              @contextmenu="onTabContextMenu($event, item.id)"
              @pointerdown="onTabPointerDown($event, item.id)"
            >
              <span class="tab__long">{{ t('tests.card.title', { n: index + 1 }) }}</span>
              <span class="tab__num">{{ index + 1 }}</span>
              <!-- 浅色判定码叠印在页签右下角（不占横向宽度，窄轨里也能一眼扫出哪条挂了）。
                   2 字母 AC/WA/RE 用大号，3 字母 TLE/MLE/RUN 收一档，见 .tab__stamp.is-long。 -->
              <span
                v-if="tabStampCode(item)"
                class="tab__stamp"
                :class="{ 'is-long': tabStampCode(item).length >= 3 }"
                aria-hidden="true"
                >{{ tabStampCode(item) }}</span
              >
            </button>
            <!-- 删除收进页签的悬停 ×（侧栏分项视图与两种评测岛共用）：
                 它是**页签的兄弟**而不是子元素 —— 按钮里不能嵌套按钮（HTML 不允许，
                 点 × 也会冒泡成「切到这条样例」）。位置由下面 CSS 绝对定位到页签右端，
                 页签的右内边距为它留好了固定宽度（悬停时宽度不跳）。 -->
            <button
              type="button"
              class="tab__close"
              :aria-label="t('tests.card.remove')"
              :disabled="running"
              @click.stop="removeCaseById(item.id)"
            >
              <AppIcon name="close" :size="9" />
            </button>
          </AppTooltip>
        </div>
        <!-- placement="bottom"（2026-11-19 用户要求）：这颗「+」上方就是侧栏页头（面板切换器 + 判定簇），
             气泡从上方冒出来会盖住页头，看着像页头自己弹出来的。往下弹则落在标签轨下方的正文区上，
             而那一片本来就是临时浮层该占的地方。 -->
        <AppTooltip v-if="!runBlocked" class="tab-add-wrap" :text="addTitle" placement="bottom">
          <button
            type="button"
            class="tab-add"
            :class="{ 'is-empty': !cases.length }"
            :aria-label="t('tests.panel.addCase')"
            :disabled="running || Boolean(runBlocked)"
            @click="requestAdd"
          >
            <AppIcon name="plus" :size="14" />
            <span v-if="!cases.length" class="tab-add__label">{{
              t('tests.panel.addCase')
            }}</span>
          </button>
        </AppTooltip>

        <!-- 隐藏量尺（2026-11-20）：与真实页签同款同字号，只用来量「样例 N / N」的
             文字宽度，以及 24px / 8px 两套固定壳宽。绝对定位 + visibility:hidden，
             不占位也不可交互。 -->
        <span ref="measureEl" class="tab tab--measure" aria-hidden="true">
          <span ref="measureTextEl">{{ t('tests.card.title', { n: cases.length }) }}</span>
        </span>
      </div>
    </Teleport>

    <!-- 正文（Bento 内胆）：与评测岛同一套满高分栏，纵向滚动下放给每个字段；
         侧栏分项视图走 is-bento，壳不同、正文完全一致。
         ⚠️ 不要给 TestCaseBody 绑 :key：切 Tab 时原地换 :case，
         元素不重挂，textarea 的 undo 栈与滚动位置都留着，高度由组件内那条 flush:'post'
         的 watch 在绘制前重算 —— 绑 key 就会退回到「先按 min-height 排一帧」的闪烁。 -->
    <div
      v-if="!railOnly"
      ref="viewportEl"
      class="case-viewport"
      :class="{ 'is-vertical': vertical, 'is-bento': !vertical }"
      role="region"
      :aria-label="t('tests.tabs.panelLabel', { n: activeIndex + 1 })"
    >
      <div ref="contentEl" class="case-scroll" :class="{ 'is-vertical': vertical, 'is-bento': !vertical }">
        <TestCaseBody
          v-if="activeCase"
          :test-case="activeCase"
          :locked="running"
          roomy
          :vertical="vertical"
          :bento="!vertical"
        />
      </div>
    </div>

    <!-- 胶囊的右键 / 长按菜单（通用件，文件树与编辑页签同款）：「运行该样例」＋「删除该样例」，
         动作都作用于被点的那条，**不会**先把正文切过去。锚点固定贴在这排胶囊的下沿（不跟光标），
         理由见 openTabMenuAt 上面那段。 -->
    <ContextMenu
      v-if="menu"
      :x="menu.x"
      :y="menu.y"
      :items="menu.items"
      @select="onMenuSelect"
      @close="menu = null"
    />
  </div>

  <!-- ------------------------------------------------------------ 工作台（方案一） -->
  <!-- 底部横跨的评测岛里，整块面板换成「左侧样例轨 + 右侧满高分栏」：
       轨头 = 拖动把手 + 全局结论 + 「+」，轨底 = 运行全部，右侧三列从顶到底都是数据。
       这一支与上面那套标签轨**互斥**（v-if / v-else），所以状态栏、第二行、
       以及胶囊选中态都不会在同一屏里出现。 -->
  <div
    v-else
    ref="rootEl"
    class="workbench"
    role="group"
    :aria-label="t('tests.tabs.railLabel')"
  >
    <aside class="workbench__rail">
      <div
        class="workbench__rail-head"
        @pointerdown="onRailHeadPointerDown"
        @contextmenu="onRailHeadContextMenu"
      >
        <!-- 2026-11-21 用户要求：去掉六点拖动图标。整条轨页头仍是拖动面
             （onRailHeadPointerDown），视觉上不再单独放把手。 -->
        <!-- 全局结论（verdict + 耗时）：与 TestPanel 页头同一套判据 / 文案，由 props 传下来。
             顺序（2026-11-20 用户要求）：通过个数在前、耗时在后，与紧凑底栏同一口径。 -->
        <div class="workbench__context">
          <template v-if="verdictVisible && verdict">
            <VerdictBadge
              class="workbench__verdict"
              :tone="verdict.tone"
              :passed="verdict.passed"
              :total="verdict.total"
              :label="verdict.label"
              :spinner-size="9"
            />
            <span
              v-if="elapsedText"
              class="workbench__elapsed"
              :title="t('tests.elapsedTitle', { time: elapsedText })"
            >
              <AppIcon class="workbench__clock" name="clock" :size="11" />{{ elapsedText }}
            </span>
          </template>
        </div>
        <AppTooltip
          v-if="!runBlocked"
          class="workbench__add-wrap"
          :text="addTitle"
          placement="bottom"
        >
          <button
            type="button"
            class="workbench__add"
            :aria-label="t('tests.panel.addCase')"
            :disabled="running || Boolean(runBlocked)"
            @click="requestAdd"
          >
            <AppIcon name="plus" :size="14" />
          </button>
        </AppTooltip>
      </div>

      <!-- 样例列表：状态点 / 名称 / 耗时同屏可扫；单跑与删除只在悬停（或触屏常显）时浮出 -->
      <div
        ref="workbenchListEl"
        class="workbench__cases"
        role="listbox"
        :aria-label="t('tests.tabs.railLabel')"
      >
        <div
          v-for="(item, index) in cases"
          :key="item.id"
          class="case-row"
          :class="{ 'is-active': item.id === activeId }"
          :data-case-id="item.id"
          :data-tone="tabStampTone(item) || null"
          role="option"
          :aria-label="t('tests.card.title', { n: index + 1 })"
          :aria-selected="item.id === activeId ? 'true' : 'false'"
          tabindex="0"
          :title="caseTimingText(item) || null"
          @click="onTabClick(item.id)"
          @keydown.enter.prevent="onTabClick(item.id)"
          @keydown.space.prevent="onTabClick(item.id)"
          @contextmenu="onTabContextMenu($event, item.id)"
          @pointerdown="onTabPointerDown($event, item.id)"
        >
          <!-- 固定宽状态槽（2026-11-21 方案一）：有结果显判定码，未跑 / 运行中显圆点。
               26px 定宽让所有样例名落在同一条竖线上，右端整段让给 ▶ ×，
               悬停时状态码纹丝不动、零遮挡。 -->
          <span class="case-row__status" aria-hidden="true">
            <span
              v-if="tabStampCode(item) && caseDotStatus(item) !== 'running'"
              class="case-row__stamp"
              :class="{ 'is-long': tabStampCode(item).length >= 3 }"
            >
              {{ tabStampCode(item) }}
            </span>
            <span v-else class="case-row__dot" :data-status="caseDotStatus(item)"></span>
          </span>
          <span class="case-row__label">
            <span class="case-row__name">{{ t('tests.card.title', { n: index + 1 }) }}</span>
            <span class="case-row__num">{{ index + 1 }}</span>
          </span>
          <!-- mousedown.prevent：鼠标按下时不给按钮上焦点。否则点完 ▶ 焦点留在按钮上，
               个别内核仍匹配 :focus-visible，鼠标移走后 [▶ ×] 会一直亮着（2026-11-21）。
               键盘 Tab 不经过 mousedown，聚焦按钮时照常浮现。 -->
          <span class="case-row__actions" @pointerdown.stop @mousedown.prevent>
            <AppTooltip
              v-if="!runBlocked"
              :text="t('tests.card.runOne')"
              placement="top"
            >
              <button
                type="button"
                class="case-row__btn"
                :aria-label="t('tests.card.runOne')"
                :aria-disabled="running"
                @click.stop="runCaseById(item.id)"
              >
                <AppIcon name="play-solid" :size="10" />
              </button>
            </AppTooltip>
            <AppTooltip :text="t('tests.card.remove')" placement="top">
              <button
                type="button"
                class="case-row__btn case-row__btn--danger"
                :aria-label="t('tests.card.remove')"
                :disabled="running"
                @click.stop="removeCaseById(item.id)"
              >
                <AppIcon name="close" :size="10" />
              </button>
            </AppTooltip>
          </span>
        </div>
      </div>

      <!-- 轨底动作区：实心「运行全部」+ 低调的提交图标（方案一：去掉荧光绿描边按钮） -->
      <div class="workbench__rail-foot">
        <AppTooltip
          v-if="showSubmit"
          class="workbench__submit-wrap"
          :text="submitTitle"
          placement="top"
        >
          <button
            type="button"
            class="workbench__submit"
            :class="{ 'is-submitting': submitting }"
            :disabled="running || submitting"
            :aria-label="submitting ? t('tests.submit.submitting') : t('tests.submit.button')"
            @click="emit('submit')"
          >
            <AppIcon name="upload" :size="13" />
          </button>
        </AppTooltip>
        <AppTooltip v-if="!runBlocked" class="workbench__run-wrap" :text="runTitle" placement="top">
          <button
            type="button"
            class="workbench__run"
            :disabled="runAllDisabled"
            @click="emit('run-all')"
          >
            <AppIcon name="play" :size="14" />
            <span>{{ t('tests.panel.runAllLabel') }}</span>
          </button>
        </AppTooltip>
      </div>
    </aside>

    <div class="workbench__panes">
      <!-- 同一份正文，满高版：三段分栏由 TestCaseBody 的 workbench 样式接管 -->
      <TestCaseBody v-if="activeCase" :test-case="activeCase" :locked="running" roomy workbench />
    </div>

    <ContextMenu
      v-if="menu"
      :x="menu.x"
      :y="menu.y"
      :items="menu.items"
      @select="onMenuSelect"
      @close="menu = null"
    />
  </div>
</template>

<style scoped>
/* 这一层是三个固定高度的竖排：轨 36 + 状态栏 36 + 正文（吃掉剩余）。
   横向 8px 与列表模式的 .cases 同值 —— 两种布局里正文代码面的左沿必须落在同一条竖线上。
   顶部那 8px 是 2026-11-19 补的（用户：「内容部分太靠上了」）：页头那排面板胶囊与标签轨
   是两排**带底色的圆角块**，此前轨顶直接顶着页头下沿 —— 36 的轨装 26 的胶囊，上下各剩 5，
   于是胶囊框离页头只有 5px，两块圆角几乎摞在一起。补 8 之后胶囊上沿距页头 13px，
   与左右那条 8px 的边距同一把尺。**写成这一层的 padding 而不是给 .case-tabs 一个
   margin-top**：这是 flex 列且高度已被定死（flex: 1 1 auto），padding 会直接从内容区里
   让出这 8px，正文视口跟着矮 8 —— 滚动高度与覆盖式滑块的右缘定位都按 `.case-viewport`
   自己算，不需要额外改动。 */
.tabs-view {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  /* 左右留白下放给页签轨 / 正文 / 底栏各自承担（统一 10px，与纵向评测岛一致），
     这里只留顶部的 8px 呼吸。 */
  padding: 8px 0 0;
  /* 这一层同时是**唯一的容器查询源**：轨与状态栏的窄容器让步挂在这里，
     正文那半（TestCaseBody 的 @container 35rem）也往上命中它 —— `.case-viewport` 不再
     自带横向内边距，两者 inline-size 逐像素相同，所以 2026-11-19 把那层的 container-type 删了，
     不必套两层 containment。 */
  container-type: inline-size;
}

/* 评测岛里标签轨被 Teleport 到 35px 页头，正文这一层不再有「轨」这一行：
   顶部 8px 与横向 8px 一并归零 —— 横向留白交给 `.card__body` 的 --pane-px，
   这样页头内容、正文第一列盒面、页脚按钮落在同一条竖直基准线上。 */
.tabs-view.is-embedded {
  padding: 0;
}

/* 空态只借这根轨（2026-11-21）：别把 flex:1 的正文壳撑起来，下面那片
   空白留给 TestPanel 的 `.empty` 标题。 */
.tabs-view.is-rail-only {
  flex: 0 0 auto;
}

/* ---------------------------------------------------------- 一、标签轨 36px */
.case-tabs {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  /* 左 12 = 正文的 .card__body 左内边距：胶囊**框**与下方代码面的框落在同一条轨上。
     右边 8 与 .cases 的横向内边距同值，最后一颗胶囊（或那颗 +）不会顶到分隔条。 */
  padding: 0 8px 0 12px;
}

/* 岛页头里这一版（`TestsPane` 的 #tests-pane-tabs，方案一）：
   铺满 35px 页头、左右内边距归零（间距交给页头的 gap / padding），
   宽度由页头那一格给出；横向滚动与两端渐隐仍归轨自己。 */
.case-tabs.is-embedded {
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
  padding: 0;
}

/* 只有这条轨参与滚动。「装得下就贴着最后一颗胶囊、装不下就收缩到可用宽度」
   是 flex 0 1 auto 给的：basis 取内容宽，不够时靠 shrink 压到 available，
   于是 few 的时候 `+` 紧跟其后，多的时候 `+` 自然被顶到右缘 —— 两种情形都不用改 DOM。 */
/* 侧栏分项视图：轨与正文、底栏共用同一条 10px 内容边（与纵向评测岛的 --pane-px 一致） */
.case-tabs.is-inline {
  padding: 0 10px;
}

.case-tabs__track {
  flex: 0 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  overflow-x: auto;
  overflow-y: hidden;
  /* 原生横向条藏掉，改用两端的渐隐遮罩交代「还有」。
   ⚠️ 遮罩的色标只吃 alpha，`black` 在这里**不是配色**（它不会画到屏幕上，深色浅色一样跑），
   lint-css 的「写死十六进制颜色」也不适用于它 —— 别换成主题变量，那会被主题的透明度带跑。 */
  scrollbar-width: none;
}

.case-tabs__track::-webkit-scrollbar {
  width: 0;
  height: 0;
}

.case-tabs__track.is-fade-left {
  -webkit-mask-image: linear-gradient(to right, transparent 0, black 16px);
  mask-image: linear-gradient(to right, transparent 0, black 16px);
}

.case-tabs__track.is-fade-right {
  -webkit-mask-image: linear-gradient(to left, transparent 0, black 16px);
  mask-image: linear-gradient(to left, transparent 0, black 16px);
}

.case-tabs__track.is-fade-left.is-fade-right {
  -webkit-mask-image: linear-gradient(
    to right,
    transparent 0,
    black 16px,
    black calc(100% - 16px),
    transparent 100%
  );
  mask-image: linear-gradient(
    to right,
    transparent 0,
    black 16px,
    black calc(100% - 16px),
    transparent 100%
  );
}

/* 胶囊 26px / 6px 圆角 / 12px 600。未选中是幽灵态，选中才浮出底色
   （与文件树「悬停浅、选中深」同一套语汇；底色取 --case-chip-bg）。
   左右各 24px 内边距：右端那条槽位给判定码水印与悬停 ×，左端留等宽留白，
   让「样例 N」落在胶囊正中（1px 透明边框两侧对称，不参与居中）。 */
.tab {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  height: 26px;
  padding: 0 24px;
  border-radius: 6px;
  /* 各态都透明，只为把尺寸钉死：选中前后胶囊宽高逐像素相同，来回切时整条轨不重排。
     也别给它上色（2026-11-19 用户：「去掉分项标签的标签外一圈线」）。 */
  border: 1px solid transparent;
  background: transparent;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-dim);
  white-space: nowrap;
  transition: background-color 0.15s ease, color 0.15s ease;
}

:where(html.is-hoverable) .tab:hover:not(.is-active) {
  background: var(--icon-hover-bg);
  color: var(--text);
}

/* 选中态只有底色 + 字色，没有描边（2026-11-19 用户要求去掉那圈线）。
   判定色由右下角的判定码水印交代 —— 曾经给选中胶囊的边框
   也染过一档判定色（color-mix 兑 --ok / --fail / --err），但那圈线正是这次被点名去掉的东西；
   别再补回来，也别改成 `outline` / `box-shadow` 的环，那是同一根线换了个画法。 */
.tab.is-active {
  background: var(--case-chip-bg);
  color: var(--text);
}

/* 三档写法：全称宽档 / 全称紧凑档 / 纯数字。默认只显示全称，数字档由下面的规则按需换上。 */
.tab__num {
  display: none;
}

/* 名称档位（2026-11-20）：由脚本按「样例数 × 序号位数 × 轨宽」量出来，不再由容器宽度单独猜。
   三档依次是：全称 + 24px 呼吸 → 全称 + 8px 紧凑 → 纯数字。 */
.is-label-num .tab__long {
  display: none;
}

.is-label-num .tab__num {
  display: inline;
}

/* 紧凑档：全称紧凑档与序号档都收掉全称宽档为居中留的左右 24px 呼吸。
   ⚠️ 档位判定用的量尺固定按两套壳宽（24px / 8px）分别量（见 .case-tabs .tab--measure），
   不跟当前渲染的内边距走，否则内边距一收会让全称「又装得下」、把档位弹回上一档。 */
.is-label-tight .tab,
.is-label-num .tab {
  padding: 0 8px;
}

/* 隐藏量尺：沿用 .tab 的全部尺寸，只测宽不显示。
   内边距**始终按两套固定档位**算：默认 24px，临时加 .is-measure-tight 时量 8px。
   量尺若跟着当前名称档收缩，会出现「变窄 → 全称又装得下 → 弹回」的往返。 */
.tab--measure {
  position: absolute;
  left: -9999px;
  top: 0;
  visibility: hidden;
  pointer-events: none;
}

.case-tabs .tab--measure {
  padding: 0 24px;
}

.case-tabs .tab--measure.is-measure-tight {
  padding: 0 8px;
}

/* 胶囊外面那层是 AppTooltip 的触发体（气泡挂 body，触发器只是个 inline-flex 的壳）。
   它现在是轨里的 flex item，所以原来看在 .tab 上的 `flex: 0 0 auto` 得挪一份到这一层 ——
   不然胶囊会被压缩：轨一旦装不下，浏览器优先压的就是这些默认 flex-shrink: 1 的壳。 */
.tab-tip {
  flex: 0 0 auto;
}

/* 末尾那颗「+」：虚线幽灵按钮，跟胶囊同高同圆角。
   它取代了列表模式底部那条通栏虚线框 —— 分项模式里没有「列表末尾」这个概念。
   位置：**滚动轨之外**（见模板注释），所以既不会被滚走，也不会被右端遮罩羽化。 */
.tab-add-wrap {
  flex: 0 0 auto;
}

.tab-add {
  display: inline-grid;
  place-items: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border-radius: 6px;
  border: 1px dashed var(--border-hairline);
  background: transparent;
  color: var(--text-dim);
  transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

:where(html.is-hoverable) .tab-add:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--border);
}

.tab-add:disabled {
  opacity: 0.45;
  cursor: default;
}

/* ------------------------------------------------------ 二、状态与动作栏 36px */
/* 2026-11-20：左簇 = 判定胶囊 + 耗时 + 待重测，同属「运行结果状态」；右侧保持原来的
   两颗无底色图标按钮（删除 / 运行），不加分隔线、不加栏底线。
   高度 36（两颗 32×32 按钮撑起）—— 与卡片头栏同高，两种布局来回切纵向零位移。
   左 22 对齐字轨（--pane-px + 10），与下方三列的标签同一竖线；右 8 与卡片头栏一致。 */
.active-case-head {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 8px 0 calc(var(--pane-px, 12px) + 10px);
}

/* 左侧状态簇：判定、耗时、待重测都在这口锅里，彼此 8px，不跨整行 */
.case-status {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.grow {
  flex: 1 1 auto;
}

/* 判定徽标 / 耗时 / 待重测 / 两颗图标钮：与 TestCaseCard 里那几颗同一套值。
   ⚠️ 两份是刻意的（scoped 样式不跨组件），改任何一处都要同步另一处 ——
   尤其是 .badge 的胶囊底色与 .icon-btn--danger 的 0.45 透明度。 */
.badge {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  white-space: nowrap;
  /* 纯文字判定（2026-11-19，2026-11-20 按用户要求复原）：底色、圆角、左右内边距全删。
     体量由 12px / 600 承担（2026-11-20 从 12.5 / 700 收一档）：判定现在是中文
     「待运行 / 运行中」，三个汉字在这个字号下再叠 700 会明显压过 11px 的耗时和列头，
     收成 600 后与标题同一档粗细，颜色仍只走语义前景色：--ok / --fail / --err / --info。
     ⚠️ TestCaseCard 里有一份同名样式，改这里必须同步那边。 */
  padding: 0;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--text-dim);
  transition: color 0.18s ease;
}

.badge[data-status='passed'] {
  color: var(--ok);
}

.badge[data-status='failed'] {
  color: var(--fail);
}

.badge[data-status='error'] {
  color: var(--err);
}

/* 运行中保持静态（卡片那边同一条纪律）：同步明灭的动画会被读成整栏在闪 */
.badge[data-status='running'] {
  color: var(--info);
}

/* 耗时紧跟在判定胶囊右侧：同属运行结果，等宽数字让它不随读数跳格子 */
.metric {
  flex: 0 0 auto;
  font-family: var(--mono-font);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--text-dim);
  white-space: nowrap;
}

.stale {
  font-size: 11px;
  color: var(--warn);
  white-space: nowrap;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stale__short {
  display: none;
}

/* 32×32 的动作格（2026-11-20 恢复原样）：头栏高度由它撑起 */
.icon-btn {
  display: inline-grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border-radius: 6px;
  color: var(--text-dim);
  transition: background-color 0.15s ease, color 0.15s ease, opacity 0.15s ease;
}

/* 删除钮：分项模式同屏只有一个状态栏，常态 0.6 够看清，悬停到**按钮本身**才转红加底。
   三档守卫：is-hoverable（触屏无悬停走常亮）、:not(:disabled)、focus-visible。 */
.icon-btn--danger {
  opacity: 0.6;
}

:where(html.is-hoverable) .icon-btn--danger:hover:not(:disabled) {
  opacity: 1;
  color: var(--fail);
  background: color-mix(in srgb, var(--fail) 12%, transparent);
}

.icon-btn--danger:focus-visible {
  outline: none;
  opacity: 1;
  color: var(--fail);
  box-shadow: inset 0 0 0 1px var(--focus);
}

:where(html:not(.is-hoverable)) .icon-btn--danger:not(:disabled) {
  opacity: 1;
  color: var(--fail);
}

.icon-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

/* 运行钮：恢复无底色、无描边的幽灵样式，悬停才浮出 --icon-hover-bg */
:where(html.is-hoverable) .icon-btn--run:hover:not([aria-disabled='true']) {
  background: var(--icon-hover-bg);
  color: var(--text);
}

.icon-btn--run[aria-disabled='true'] {
  opacity: 0.35;
  cursor: default;
}

:where(html.is-hoverable) .icon-btn--run[aria-disabled='true']:hover {
  background: transparent;
  color: var(--text-dim);
}

/* 焦点环画在按钮内部：它贴着面板右缘，外扩的环会被裁掉 */
.icon-btn--run:focus-visible {
  outline: none;
  background: var(--icon-hover-bg);
  box-shadow: inset 0 0 0 1px var(--focus);
  color: var(--text);
}

/* 提示框的触发体：宽度不参与挤压 */
.trash-wrap,
.run-wrap {
  flex: 0 0 auto;
}

/* ------------------------------------------------ 三、单用例正文（唯一滚动区） */
.case-viewport {
  flex: 1 1 auto;
  min-height: 0;
  /* 下 8 与 .cases 的下内边距同值，叠上 .card__body 自己的 10 = 18，与列表模式的
     「卡片 10 + 列表 8」完全一致 */
  padding: 0 0 8px;
  overflow-y: auto;
  overflow-x: hidden;
  /* 原生纵向条藏掉，交给覆盖式滑块（与 .cases 同一条纪律：条一出现一消失，
     代码面就会变宽变窄、折行位置跟着跳） */
  scrollbar-width: none;
  /* ⚠️ 这里**不写** container-type（2026-11-19 审查后删）：它是 .tabs-view 的直接子元素，
     左右 padding 为 0，两层 inline-size 逐像素相同（.tabs-view 左右各 8 一减，
     到这一层正好抵消；顶部那 8 只动纵向，不参与 inline-size）。TestCaseBody 里那条
     @container 35rem 往上会命中 .tabs-view，尺寸一模一样，白多一层 layout containment。 */
}

.case-viewport::-webkit-scrollbar {
  width: 0;
  height: 0;
}

.case-scroll {
  /* 只为了让 ResizeObserver 有个「内容盒」可盯（见脚本里 useScrollEdge 那一行） */
  display: block;
}

/* ---------------------------------------------------- Bento 内胆（纵向岛 / 侧栏分项视图） */
/* 正文不再整体滚动：满高分栏由 TestCaseBody 的 is-vertical 接管，
   每个字段自己滚。这里只把视口让成一块定高的透明容器。
   左右留白与底栏 / 页头共用 --pane-px（2026-11-20 Bento）：正文槽位的圆角边
   与上方的页签轨、下方的 紧凑底栏落在同一条竖线上，不再贴着岛外壳内壁。
   侧栏分项视图走 .is-bento：壳不同（保留 36px 状态行），正文布局与纵向岛完全一致。 */
.case-viewport.is-vertical,
.case-viewport.is-bento {
  box-sizing: border-box;
  padding: 4px var(--pane-px, 10px) 2px;
  overflow: hidden;
}

/* 侧栏分项视图：与纵向岛同为 10px 内容边 */
.case-viewport.is-bento {
  padding: 4px 10px 2px;
}

.case-scroll.is-vertical,
.case-scroll.is-bento {
  height: 100%;
  min-height: 0;
}

/* 「+」的位置与外观保持原样：轨与 + 之间仍是 2px；页签之间则回到侧栏的 6px。 */
.case-tabs.is-vertical {
  gap: 2px;
}

/* × 的定位基准：绝对定位到页签右端（见下方 .tab__close）。侧栏分项视图与两种岛共用 */
.case-tabs .tab-tip {
  position: relative;
}

/* 水印的定位上下文与裁切边界。量尺（.tab--measure）必须留在绝对定位里，不能吃这条 */
.case-tabs .tab:not(.tab--measure) {
  position: relative;
  overflow: hidden;
  isolation: isolate;
}

/* 水印的语义色：RUN 蓝、AC 绿、WA 红、TLE / MLE 琥珀、CE / RE 橙红。
   与状态点共用既有语义变量，不另造色。 */
.case-tabs .tab[data-tone='info'] {
  --tab-tone: var(--info);
}

.case-tabs .tab[data-tone='ok'] {
  --tab-tone: var(--ok);
}

.case-tabs .tab[data-tone='err'] {
  --tab-tone: var(--fail);
}

.case-tabs .tab[data-tone='warn'] {
  --tab-tone: var(--warn);
}

.case-tabs .tab[data-tone='re'] {
  --tab-tone: var(--err);
}

/* 结论过期（2026-11-21 用户要求）：判定码水印不撤，整枚压成中性灰 ——
   分项视图是改完代码后唯一还看得到运行结果的地方，留一个空态等于把结果读数也丢了。
   灰章既保住读数，又与「这一轮真的跑过」的语义色区分开。 */
.case-tabs .tab[data-tone='stale'] {
  --tab-tone: var(--text-dim);
}

/* 有结论的页签顺带铺一层极淡同色底，让水印不是干巴巴浮在灰底上 */
.case-tabs .tab[data-tone] {
  background: color-mix(in srgb, var(--tab-tone) 6%, transparent);
}

/* 选中态：语义色只是最薄的一层偏色，重音交给前景文字与右端水印（2026-11-20 再调淡） */
.case-tabs .tab.is-active[data-tone] {
  background: color-mix(in srgb, var(--tab-tone) 5%, var(--case-chip-bg));
}

/* 横跨岛左侧的 case-row 复用同一套 --tab-tone 语义（2026-11-20 用户要求） */
.case-row[data-tone='info'] {
  --tab-tone: var(--info);
}

.case-row[data-tone='ok'] {
  --tab-tone: var(--ok);
}

.case-row[data-tone='err'] {
  --tab-tone: var(--fail);
}

.case-row[data-tone='warn'] {
  --tab-tone: var(--warn);
}

.case-row[data-tone='re'] {
  --tab-tone: var(--err);
}

/* 横向工作台左轨同理：过期判定码留在状态槽里，只是褪成灰色（2026-11-21） */
.case-row[data-tone='stale'] {
  --tab-tone: var(--text-dim);
}

/* 前景文字压在水印之上 */
.case-tabs .tab__long,
.case-tabs .tab__num {
  position: relative;
  z-index: 1;
}

/* 叠印水印：字号接近页签高度，往右下错位并裁掉底部几像素 —— 读作底纹，而不是第二行正文。
   2 字母用 16px，3 字母（TLE / MLE / RUN）收到 13px 并再贴右，避免撞上左侧标题。 */
.case-tabs .tab__stamp {
  position: absolute;
  right: 8px;
  bottom: -1px;
  z-index: 0;
  font-family: var(--mono-font);
  font-size: 16px;
  font-weight: 800;
  font-style: italic;
  line-height: 0.85;
  letter-spacing: -0.04em;
  color: color-mix(in srgb, var(--tab-tone, var(--text-dim)) 22%, transparent);
  pointer-events: none;
  user-select: none;
  transition: opacity 0.12s ease, transform 0.12s ease;
}

.case-tabs .tab__stamp.is-long {
  right: 7px;
  bottom: 0;
  font-size: 13px;
  letter-spacing: -0.06em;
}

/* 未通过的状态比 AC 更醒目：一排扫过去绿色安静、红黄跳脱 */
.case-tabs .tab[data-tone='ok'] .tab__stamp {
  color: color-mix(in srgb, var(--tab-tone) 18%, transparent);
}

.case-tabs .tab[data-tone='err'] .tab__stamp,
.case-tabs .tab[data-tone='warn'] .tab__stamp,
.case-tabs .tab[data-tone='re'] .tab__stamp,
.case-tabs .tab[data-tone='info'] .tab__stamp {
  color: color-mix(in srgb, var(--tab-tone) 28%, transparent);
}

/* 过期水印（2026-11-21）：灰章保留上一轮判定码，后缀一个「?」读作「结果待重测」。
   问号完全继承水印的字形（等宽 / 斜体 / 同色，只略收字号），读作同一枚章的一部分，
   而不是贴上去的第二枚符号。 */
.case-tabs .tab[data-tone='stale'] .tab__stamp {
  color: color-mix(in srgb, var(--text-dim) 30%, transparent);
}

.case-tabs .tab[data-tone='stale'] .tab__stamp::after,
.case-row[data-tone='stale'] .case-row__stamp::after {
  content: '?';
  margin-left: 1px;
  font-size: 0.78em;
  letter-spacing: 0;
  vertical-align: 0.08em;
}

/* 选中页签的水印提亮一档 */
.case-tabs .tab.is-active .tab__stamp {
  color: color-mix(in srgb, var(--tab-tone, var(--text-dim)) 32%, transparent);
}

/* 带语义底的页签悬停：在极淡同色底上再叠一档，而不是被基础 hover 整块盖掉 */
:where(html.is-hoverable) .case-tabs .tab:hover:not(.is-active) {
  background: color-mix(in srgb, var(--tab-tone, transparent) 10%, var(--icon-hover-bg));
  color: var(--text);
}

/* 「+」：整套方案里统一成无边框幽灵图标（悬停才浮一层底），侧栏与岛同一副样子 */
.case-tabs .tab-add {
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 4px;
  background: transparent;
}

:where(html.is-hoverable) .case-tabs .tab-add:hover:not(:disabled) {
  border-color: transparent;
  background: var(--bg-hover);
  color: var(--text);
}

/* 空轨（2026-11-21 用户要求把添加按钮挪进页签栏）：没有页签时这颗「+」就是轨道里
   唯一的一枚「空页签」，带上文案并按内容撑宽。放在 `.case-tabs .tab-add` 后面并用同名
   提升一级特异度 —— 那套无边框 24×24 幽灵钮的规则在上面，会把它按回图标尺寸。
   虚线 / 26px 高 / 6px 圆角仍与页签、列表末尾那颗 Add New 同一把尺。 */
.case-tabs .tab-add.is-empty {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: auto;
  height: 26px;
  padding: 0 11px;
  border: 1px dashed var(--border-hairline);
  border-radius: 6px;
  background: transparent;
  color: var(--text-dim);
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
}

:where(html.is-hoverable) .case-tabs .tab-add.is-empty:hover:not(:disabled) {
  border-color: var(--border);
  background: var(--bg-hover-soft);
  color: var(--text);
}

/* 页签悬停浮现的 ×：绝对定位在预留槽里，不改变页签宽度。
   只在真能悬停的设备上「悬停才露」；触屏没有悬停，常显半透明一档（与全站口径一致）。
   钉在右上角，给右下角的水印让出位置。 */
.case-tabs .tab__close {
  position: absolute;
  right: 1px;
  top: 0;
  display: inline-grid;
  place-items: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text-faint);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s ease, background-color 0.12s ease, color 0.12s ease;
}

:where(html.is-hoverable) .case-tabs .tab-tip:hover .tab__close {
  opacity: 0.8;
  pointer-events: auto;
}

:where(html.is-hoverable) .case-tabs .tab__close:hover:not(:disabled) {
  opacity: 1;
  color: var(--text);
  background: var(--bg-hover);
}

:where(html:not(.is-hoverable)) .case-tabs .tab__close {
  opacity: 0.55;
  pointer-events: auto;
}

.case-tabs .tab__close:disabled {
  opacity: 0;
  pointer-events: none;
}

/* -------------------------------------------------------------- 窄容器让步 */
/* 阈值与卡片那半边同一套：22.5rem 换短称、17rem 让掉待重测、15.625rem 极致紧凑。
   容器是 .tabs-view（宽 = 面板宽 − 16），与 .cases 的口径一致。 */
@container (max-width: 22.5rem) {
  .active-case-head {
    gap: 6px;
    /* 右内边距保持 8：正文里 ACTUAL 那组字段级图标按这条右缘对齐（见 TestCaseBody），
       这里省 2px 会让上下两排图标的右缘错开。省宽度交给 .stale 压缩。 */
  }

  .stale__full {
    display: none;
  }

  .stale__short {
    display: inline;
  }
}

@container (max-width: 17rem) {
  .stale {
    display: none;
  }
}

/* 最窄一档：轨与页签间距再收一档。
   页签内边距的收缩交给名称档（`.is-label-tight` / `.is-label-num`），不按容器宽度切 ——
   否则全称档会在临界宽度附近又「装得下」、回弹成「样例 N」（见 measureFormat 的固定间距口径）。 */
@container (max-width: 15.625rem) {
  .active-case-head {
    gap: 4px;
  }

  .case-tabs,
  .case-tabs__track {
    gap: 4px;
  }
}

/* ============================================================ 工作台（方案一） */
/* 左侧样例轨（188px）+ 右侧满高 I/O 面板。这一层只负责两栏的横向切分与轨的纵向
   三段（页头 / 列表 / 页脚）；三列数据面归 TestCaseBody 的 workbench 样式。 */
.workbench {
  /* 轨页头与右侧三个列头同高（TestCaseBody 也读这个变量）—— 两排文字落在一条水平线上 */
  --workbench-head-h: 34px;

  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  /* 右半边的三列缩写以此为准（容器查询源在本层，而不是 .tabs-view） */
  container-type: inline-size;
}

.workbench__rail {
  /* 2026-11-21 用户要求：横跨岛的页签轨宽度动态 —— 随岛宽在 112–188px 之间伸缩，
     宽的时候维持原来的「状态点 + 样例 N」，窄到 152px 以下只留序号（见文件末尾
     以它为容器的 @container）。 */
  flex: 0 0 clamp(112px, 22%, 188px);
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  container-type: inline-size;
}

/* 轨页头 = 拖动面：整条可抓；「+」与结论文字上的按下交给各自的控件 */
.workbench__rail-head {
  position: relative;
  flex: 0 0 var(--workbench-head-h);
  display: flex;
  align-items: center;
  /* 4px 只防「耗时贴死 +」；耗时仍由 margin-left: auto 推到右端 */
  gap: 4px;
  min-width: 0;
  /* 左 16 对齐行内容左缘；右 10 让「+」的 14px 图标墨迹落在行内容右缘附近 */
  padding: 0 10px 0 16px;
  cursor: grab;
  user-select: none;
  touch-action: none;
}

/* 全局结论（verdict + 耗时）的落点：吃掉页头里「+」左侧的整段 */
.workbench__context {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
}

/* 判定徽标由 VerdictBadge 统一渲染；这里只负责它在轨头里可收缩、可省略 */
.workbench__verdict {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
}

/* 窄轨判定语只留计数（x / n），去掉「 AC」后缀；耗时也去掉钟表图标只留数字
   （2026-11-21 用户要求）。页签轨随岛宽在 112–188px 间伸缩，最窄时
   「0/10 AC」+ 钟表 + 耗时会被 ellipsis 吃掉；152px 与轨道自己的窄态断点一致
   （见文件末尾的「样例 N」→ 序号切换）。 */
@container (max-width: 152px) {
  .workbench__rail-head {
    padding: 0 8px 0 14px;
  }

  .workbench__context :deep(.verdict__label) {
    display: none;
  }

  .workbench__clock {
    display: none;
  }
}

.workbench__elapsed {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex: 0 0 auto;
  /* 左结论 / 右耗时：耗时贴住「+」，空出来的位置落在判定与耗时之间 */
  margin-left: auto;
  font-family: var(--mono-font);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--text-faint);
}

.workbench__add-wrap {
  flex: 0 0 auto;
}

/* 「+」：无边框幽灵图标（去掉虚线框那套模板感），悬停只浮一层极淡底 */
.workbench__add {
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border-radius: 5px;
  border: 0;
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  transition: background-color 0.12s ease, color 0.12s ease;
}

:where(html.is-hoverable) .workbench__add:hover:not(:disabled) {
  background: var(--icon-hover-bg);
  color: var(--text);
}

.workbench__add:disabled { opacity: 0.4; cursor: default; }

/* 样例行列表：覆盖式滑块接管滚动，原生条藏掉 */
.workbench__cases {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 2px 6px 6px;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-width: none;
}

.workbench__cases::-webkit-scrollbar {
  width: 0;
  height: 0;
}

/* 页签轨（2026-11-21 审查后重构）：左侧 6px 微点 + 名称 + 右端端正等宽判定码。
   背景只服务「选中 / 悬停」，一律纯中性哑光灰、不混语义色 —— 状态只由圆点与判定码交代。
   高度 30、行距 2px，同屏多显一条；长名先省略。 */
.case-row {
  position: relative;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 30px;
  padding: 0 10px;
  border-radius: 6px;
  background: transparent;
  color: var(--text-dim);
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  user-select: none;
  transition: background-color 0.12s ease, color 0.12s ease;
}

:where(html.is-hoverable) .case-row:hover {
  background: var(--icon-hover-bg);
  color: var(--text);
}

.case-row.is-active {
  background: var(--case-chip-bg);
  color: var(--text);
}

:root[data-scheme='dark']:where(html.is-hoverable) .case-row:hover {
  background: color-mix(in srgb, var(--text) 5%, transparent);
}

:root[data-scheme='dark'] .case-row.is-active {
  background: color-mix(in srgb, var(--text) 10%, transparent);
}

.case-row:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 1px var(--focus);
}

/* 左侧 6px 微点：未跑是极淡空心细环，有结果直接亮成语义色实心点 */
.case-row__dot {
  flex: 0 0 auto;
  width: 6px;
  height: 6px;
  box-sizing: border-box;
  border-radius: 999px;
  border: 1.5px solid color-mix(in srgb, var(--text-dim) 45%, transparent);
  background: transparent;
  transition: background-color 0.12s ease, border-color 0.12s ease;
}

.case-row__dot[data-status='passed'] {
  border-color: transparent;
  background: var(--ok);
}

.case-row__dot[data-status='failed'] {
  border-color: transparent;
  background: var(--fail);
}

.case-row__dot[data-status='error'] {
  border-color: transparent;
  background: var(--err);
}

.case-row__dot[data-status='running'] {
  border-color: transparent;
  background: var(--info);
}

.case-row__dot[data-status='stale'] {
  border-color: transparent;
  background: var(--warn);
}

/* 判定码的语义色优先于 runner 的粗粒度 status：TLE / MLE 的 status 也是 failed，
   但行右端写的是琥珀色 TLE，左侧微点必须跟着黄。data-tone 已把档位映射到 --tab-tone，
   一条规则收口（特异性高于上面的 data-status）。 */
.case-row[data-tone] .case-row__dot {
  border-color: transparent;
  background: var(--tab-tone);
}

/* 固定宽状态槽（2026-11-21 方案一）：有结果显判定码，未跑 / 运行中显圆点。
   定宽让所有样例名从同一条竖线开始；右端整段让给 ▶ ×，悬停时状态码零位移。 */
.case-row__status {
  flex: 0 0 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.case-row__label {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
}

.case-row__name {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* 轨收窄时替代名称的纯序号（默认不渲染，见末尾 @container 152px） */
.case-row__num {
  display: none;
  font-family: var(--mono-font);
  font-variant-numeric: tabular-nums;
}

/* 状态槽里的判定码：端正等宽，按判定档取色；AC 退淡，让异常一眼跳出来。 */
.case-row__stamp {
  font-family: var(--mono-font);
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: -0.02em;
  color: var(--tab-tone, var(--text-dim));
  user-select: none;
}

/* 3 字母（TLE / MLE）略收，26px 槽里也留得下 */
.case-row__stamp.is-long {
  font-size: 10px;
  letter-spacing: -0.04em;
}

.case-row[data-tone='ok'] .case-row__stamp {
  color: color-mix(in srgb, var(--ok) 76%, var(--text-dim));
  font-weight: 500;
}

/* 单跑 / 删除：常规 Flex 收在行尾，默认宽度 0 + 隐身；悬停 / 聚焦时展开。
   状态码住在左槽，这里展开不会盖住任何东西。 */
.case-row__actions {
  flex: 0 0 auto;
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  max-width: 0;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s ease;
}

:where(html.is-hoverable) .case-row:hover .case-row__actions,
.case-row:has(.case-row__btn:focus-visible) .case-row__actions {
  max-width: 48px;
  opacity: 1;
  pointer-events: auto;
}

/* 触屏端（2026-11-21）：没有悬停，未选中行照常显示判定码；
   只有当前选中行切出 ▶ × —— 状态与操作都不丢。 */
:where(html:not(.is-hoverable)) .case-row.is-active .case-row__actions {
  max-width: 48px;
  opacity: 1;
  pointer-events: auto;
}

.case-row__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  transition: background-color 0.12s ease, color 0.12s ease;
}

:where(html.is-hoverable) .case-row__btn:hover:not(:disabled):not([aria-disabled='true']) {
  background: var(--icon-hover-bg);
  color: var(--text);
}

.case-row__btn--danger {
  color: var(--text-faint);
}

:where(html.is-hoverable) .case-row__btn--danger:hover:not(:disabled) {
  color: var(--fail);
  background: color-mix(in srgb, var(--fail) 14%, transparent);
}

.case-row__btn:disabled,
.case-row__btn[aria-disabled='true'] {
  opacity: 0.35;
  cursor: default;
}

/* 轨底：动作区的家。两颗按钮与「评测样例在侧边栏」时的页脚同色同语汇
   （运行 = --ok 微光面，提交 = --accent 微光面；6px 圆角、同档禁用透明度），
   只有高度压到 32px —— 横跨态本来就矮，36 的条会把列表压掉一行。 */
.workbench__rail-foot {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px 10px;
}

.workbench__submit-wrap {
  flex: 0 0 auto;
}

.workbench__submit {
  display: inline-grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border-radius: 6px;
  border: 1px solid transparent;
  background: var(--accent-face);
  color: var(--accent-text);
  transition: background-color 0.16s ease, border-color 0.16s ease;
}

:where(html.is-hoverable) .workbench__submit:hover:not(:disabled) {
  background: var(--accent-face-hover);
}

.workbench__submit:disabled {
  opacity: 0.45;
  cursor: default;
}

.workbench__submit.is-submitting {
  animation: workbench-submit-pulse 1.2s ease-in-out infinite;
}

@keyframes workbench-submit-pulse {
  0%,
  100% {
    opacity: 0.45;
  }
  50% {
    opacity: 0.85;
  }
}

.workbench__run-wrap {
  flex: 1 1 auto;
  min-width: 0;
}

.workbench__run {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  width: 100%;
  height: 32px;
  padding: 0 12px;
  border-radius: 6px;
  border: 1px solid transparent;
  font-size: 12.5px;
  color: var(--ok);
  background: var(--ok-face);
  white-space: nowrap;
  transition: background-color 0.16s ease;
}

:where(html.is-hoverable) .workbench__run:hover:not(:disabled) {
  background: var(--ok-face-hover);
}

.workbench__run:disabled {
  opacity: 0.45;
  cursor: default;
}

/* 右半边：细竖线切出编辑器式的分栏面（不是两块圆角卡片并排） */
.workbench__panes {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  border-left: 1px solid var(--border-soft);
}

.workbench__panes > .card__body {
  flex: 1 1 auto;
}

/* 轨窄到放不下「样例 N」时换成纯序号，行距、状态槽与按钮同时收紧。 */
@container (max-width: 152px) {
  .case-row {
    gap: 5px;
    padding: 0 6px;
  }

  .case-row__status {
    flex-basis: 22px;
  }

  .case-row__name {
    display: none;
  }

  .case-row__num {
    display: inline;
  }

  .case-row__btn {
    width: 20px;
    height: 20px;
  }
}
</style>
