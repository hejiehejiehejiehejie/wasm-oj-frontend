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
import TestCaseBody from './TestCaseBody.vue'
import { useOverlayScrollbar } from '../composables/useOverlayScrollbar.js'
import { useScrollEdge } from '../composables/useScrollEdge.js'
import {
  caseBadgeLabelVerbose,
  caseDotStatus,
  caseInputPreview,
  caseTimingText,
} from '../services/caseSummary.js'
import { t } from '../i18n/index.js'

const props = defineProps({
  cases: { type: Array, required: true },
  running: Boolean,
  /** 不可运行的原因（活跃文件不是代码）。空串＝可运行。见 TestPanel 的同名 prop */
  runBlocked: { type: String, default: '' },
  /** 「添加测试样例」的完整说明（含快捷键），由 TestPanel 算好传下来 —— 绑定表只有那一处 */
  addTitle: { type: String, default: '' },
})

const emit = defineEmits(['add', 'remove', 'run-one', 'more-below'])

const rootEl = ref(null)
const railEl = ref(null)
/** 整条标签轨（`.case-tabs`：可滚的胶囊轨 + 那颗「+」）。只用来量菜单该落在哪条横线上 */
const tabsRowEl = ref(null)
const viewportEl = ref(null)
const contentEl = ref(null)

// 滚动容器两条：覆盖式滑块（不占宽度）+ 页脚那条「下面还有」的线
useOverlayScrollbar(viewportEl)
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
  // 切 Tab 时那次居中滚动用的是 scrollIntoView 自带的 behavior，不受这里影响。
  el.scrollLeft += event.deltaY
  event.preventDefault()
}

let railObserver = null
function bindRailObserver() {
  railObserver?.disconnect()
  const el = railEl.value
  if (!el) return
  // 面板宽度变化（拖分隔条 / 全局缩放）会改变「装不装得下」，但盒子高度恒为 36，
  // ResizeObserver 照样会在 inline-size 变化时报一次 —— 这就够了。
  railObserver = new ResizeObserver(syncRailFade)
  railObserver.observe(el)
  syncRailFade()
}

// 胶囊的增删 / 窄容器换短称都会改 scrollWidth（而轨自己的盒子没变），补一次
watch(
  () => [props.cases.length, props.cases.map((item) => item.id).join(',')],
  () => nextTick(syncRailFade),
)

/* ---------------------------------------------------------------- 当前 Tab */
// 存 id 不存下标：用例回写会在运行途中把对象整批换掉（见 App.vue 的 flushCasesWrite），
// 下标可能指向别的用例，id 才是身份。
const activeId = ref(props.cases[0]?.id ?? null)
const activeIndex = computed(() => props.cases.findIndex((item) => item.id === activeId.value))
const activeCase = computed(() => props.cases[activeIndex.value] ?? null)

// 分项视图用加长版（`AC · 通过`）：这一行左边没有「样例 N」做上下文，两个字母撑不住版面
const badgeLabel = computed(() => caseBadgeLabelVerbose(activeCase.value))
const timing = computed(() => caseTimingText(activeCase.value))

// 样例数 ≥ 4 才在窄侧栏里换短称：两三条时「样例 N」还塞得下，没必要提前缩写。
const dense = computed(() => props.cases.length >= 4)

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

/** 状态栏那颗垃圾桶：删的就是当前这条 */
function requestRemove() {
  if (activeCase.value) removeCaseById(activeCase.value.id)
}

/**
 * 删掉指定的一条 —— 状态栏垃圾桶与胶囊的右键菜单共用这一条路。
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
 * 用例表换了一份（切文件 / 增 / 删）时把 activeId 拉回一个存在的 id。
 *
 * 三种来路：① 用户点 + 添加（activateLast，落到新末尾）；② 删掉当前项（requestRemove
 * 已经先把 activeId 指到邻居上，这里看到它还在就什么都不做）；③ 整个文件换了 ——
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
 * 切 Tab 之后把胶囊滚进视野、正文回到顶部。
 *
 * 【为什么不用 scrollIntoView（2026-11-19 修）】原来写的是
 *   `tab.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })`
 * 两个毛病：
 *   ① `scrollIntoView` 会把它**所有**祖先的滚动都调整一遍 —— 包括 `overflow: hidden` 的
 *      `.pane--tests` 和文档根。那些盒子只要有一丁点可滚动溢出（亚像素宽度、缩放不是 100%、
 *      系统保留滚动条槽位），整块面板就会被推 1px，读起来就是「一切换整个侧栏就动一下」。
 *   ② `inline: 'center'` 是**无条件**居中：三颗胶囊都看得见的时候，切到第 1 颗要把轨推到
 *      scrollLeft = 0、切到第 3 颗又要推到最右 —— 明明不用滚，整排胶囊还是滑一下。
 *      这正是「样例 1 与样例 3 来回切，侧栏有微小移动」的来源。
 * 现在只动轨自己：**先判胶囊是否已完整可见**，可见就一个像素都不动；真的被挡住才居中，
 * 而且直接算 `scrollLeft`（clamp 在轨自己的范围内），祖先元素再没有任何被滚到的机会。
 *
 * `behavior: 'smooth'` 与侧栏其它滚动一致；系统开了「减少动态效果」时浏览器会自己降级。
 *
 * 正文回顶不是洁癖：上一条样例如果很长、用户滚到了中间，切过去会停在新样例的中间 ——
 * 第一眼看到的是「半截代码」，像是内容丢了。
 */
function revealTab(tab) {
  const rail = railEl.value
  if (!rail || !tab) return
  const railBox = rail.getBoundingClientRect()
  const tabBox = tab.getBoundingClientRect()
  // 1px 亚像素余量：缩放后胶囊与轨的边界常差零点几像素，不该为这点差去滚
  const leftGap = tabBox.left - railBox.left
  const rightGap = railBox.right - tabBox.right
  if (leftGap >= -1 && rightGap >= -1) return
  const centered = rail.scrollLeft + leftGap - (rail.clientWidth - tabBox.width) / 2
  // 浏览器会把越界的值 clamp 回 [0, max]，这里不必自己夹
  rail.scrollTo({ left: centered, behavior: 'smooth' })
}

watch(activeId, (id) => {
  if (id === null) return
  nextTick(() => {
    revealTab(railEl.value?.querySelector(`[data-case-id="${id}"]`))
    if (viewportEl.value) viewportEl.value.scrollTop = 0
  })
})

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
 * 胶囊上的右键菜单（2026-11-19 加，用户要求）：就地删掉这一条，**不必先切过去**。
 *
 * 复用 `ContextMenu`（Teleport 到 body 的通用件，文件树 / 编辑页签同款）：
 * 形状、配色、遮罩、点外部 / Esc 关闭全部照旧，这里只负责「在哪儿弹、弹什么」。
 * 菜单只有一项「删除」——文案与状态栏那颗垃圾桶同一份（`tests.card.remove`），
 * 同一个动作不该有两种说法；运行中同样禁用（数据层按批回写，跑到一半删会撕裂用例表）。
 *
 * 【弹出来的锚点】**贴在被点那颗胶囊的下沿**，横向对齐它的左缘 —— 不再跟着光标走
 * （2026-11-19 用户报改成这样的）。跟着光标时的后果很具体：菜单第一项「删除该样例」正好落在
 * 光标底下一行，连按两下右键（第一下被菜单收掉、第二下落在刚弹出来的那一项上）就把样例删了。
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
 */
function openTabMenuAt(id, anchorEl) {
  if (!props.cases.some((item) => item.id === id)) return
  const tab = anchorEl?.getBoundingClientRect()
  const row = tabsRowEl.value?.getBoundingClientRect()
  // 胶囊滚出左缘时 rect 是负的（被裁剪了），先把横坐标拉回轨内，免得菜单贴到分隔条另一侧
  const baseX = row && tab ? Math.max(tab.left, row.left) : (tab?.left ?? 0)
  menu.value = {
    x: baseX + MENU_OFFSET_X,
    // 胶囊量不到时退回轨底（理论上不会发生：菜单只从胶囊身上开）
    y: ((tab ?? row)?.bottom ?? 0) + MENU_GAP,
    caseId: id,
    items: [{ id: 'remove', label: t('tests.card.remove'), disabled: props.running }],
  }
}

function onMenuSelect(id) {
  const m = menu.value
  // 选中即收：菜单盖住的那片区域会吞掉下一次按下（编辑页签那边踩过同一个坑）
  menu.value = null
  if (m && id === 'remove') removeCaseById(m.caseId)
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
  openTabMenuAt(p.id, p.el)
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
  openTabMenuAt(id, event.currentTarget)
}

function onTabClick(id) {
  if (swallowClick) {
    swallowClick = false
    return
  }
  activeId.value = id
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  bindRailObserver()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  railObserver?.disconnect()
  railObserver = null
  clearPress()
})
</script>

<template>
  <div ref="rootEl" class="tabs-view" :class="{ 'is-dense': dense }">
    <!-- 标签轨（36px，不随下方正文滚动）：可滚的胶囊轨道 + 轨外固定的虚线「+」。
         ⚠️ `+` 必须留在 `.case-tabs__track` **外面**（2026-11-19 用户审查后改）：
           ① 它在滚动流里时，样例一多就被滚出视野，而它是这一栏唯一的新建入口；
           ② 它停在右缘时正好落在 `.is-fade-right` 的 16px 羽化带里，会被遮罩浸成半透明，
              看起来像禁用 / 坏掉。挪出来之后它既不会滚走，也不会被遮罩碰到。 -->
    <div ref="tabsRowEl" class="case-tabs" role="group" :aria-label="t('tests.tabs.railLabel')">
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
            :data-status="caseDotStatus(item)"
            :aria-current="item.id === activeId ? 'true' : undefined"
            @click="onTabClick(item.id)"
            @contextmenu="onTabContextMenu($event, item.id)"
            @pointerdown="onTabPointerDown($event, item.id)"
          >
            <!-- 圆点**常驻**（未运行画空心圈），不写 v-if：它一出现就占掉 7+5=12px，
                 跑完那一刻整条轨会横向重排一遍。留个空位让宽度恒定（见样式里的注释）。 -->
            <span class="tab__dot" :data-status="caseDotStatus(item)"></span>
            <span class="tab__long">{{ t('tests.card.title', { n: index + 1 }) }}</span>
            <span class="tab__short">{{ t('tests.tabs.shortTitle', { n: index + 1 }) }}</span>
            <span class="tab__num">{{ index + 1 }}</span>
          </button>
        </AppTooltip>
      </div>
      <!-- placement="bottom"（2026-11-19 用户要求）：这颗「+」上方就是侧栏页头（面板切换器 + 判定簇），
           气泡从上方冒出来会盖住页头，看着像页头自己弹出来的。往下弹则落在标签轨下方的正文区上，
           而那一片本来就是临时浮层该占的地方。 -->
      <AppTooltip class="tab-add-wrap" :text="addTitle" placement="bottom">
        <button
          type="button"
          class="tab-add"
          :aria-label="t('tests.panel.addCase')"
          :disabled="running || Boolean(runBlocked)"
          @click="requestAdd"
        >
          <AppIcon name="plus" :size="12" />
        </button>
      </AppTooltip>
    </div>

    <!-- 当前样例的状态与动作（36px，与卡片头栏同高：两种布局来回切时纵向零位移）。
         左端只有判定与「待重测」；耗时与两颗图标钮一起靠右
         —— 2026-11-19 用户要求把每个样例的运行时间挪到删除钮左边。数值与按钮同属一簇，
         读作「结果 + 动作」，左端读作「这是什么状态」。 -->
    <div v-if="activeCase" class="active-case-head">
      <span class="badge" :data-status="activeCase.status">{{ badgeLabel }}</span>
      <span v-if="activeCase.stale" class="stale" :title="t('tests.card.staleTitle')">
        <span class="stale__full">{{ t('tests.card.staleLabel') }}</span>
        <span class="stale__short">{{ t('tests.card.staleLabelShort') }}</span>
      </span>
      <span class="grow"></span>
      <!-- 只有跑过才渲染：没跑过这一格整块不出现（2026-11-19 用户：「10 行 · 26 B」没必要）。
           曾经在这里用输入规模填空，读起来像噪音 —— 尺寸这类信息真要知道时去正文里看更准。 -->
      <span v-if="timing" class="metric" :title="t('tests.card.timingTitle')">{{ timing }}</span>
      <AppTooltip class="trash-wrap" :text="t('tests.card.remove')">
        <button
          type="button"
          class="icon-btn icon-btn--danger"
          :aria-label="t('tests.card.remove')"
          :disabled="running"
          @click="requestRemove"
        >
          <AppIcon name="trash" :size="15" />
        </button>
      </AppTooltip>
      <AppTooltip class="run-wrap" :text="runBlocked || t('tests.card.runOne')">
        <button
          type="button"
          class="icon-btn icon-btn--run"
          :aria-label="runBlocked || t('tests.card.runOne')"
          :aria-disabled="running || Boolean(runBlocked)"
          @click="requestRunOne"
        >
          <AppIcon name="play" :size="15" />
        </button>
      </AppTooltip>
    </div>

    <!-- 正文（唯一纵向滚动区）。⚠️ 不要给 TestCaseBody 绑 :key：切 Tab 时原地换 :case，
         元素不重挂，textarea 的 undo 栈与滚动位置都留着，高度由组件内那条 flush:'post'
         的 watch 在绘制前重算 —— 绑 key 就会退回到「先按 min-height 排一帧」的闪烁。 -->
    <div
      ref="viewportEl"
      class="case-viewport"
      role="region"
      :aria-label="t('tests.tabs.panelLabel', { n: activeIndex + 1 })"
    >
      <div ref="contentEl" class="case-scroll">
        <TestCaseBody v-if="activeCase" :test-case="activeCase" :locked="running" roomy />
      </div>
    </div>

    <!-- 胶囊的右键 / 长按菜单（通用件，文件树与编辑页签同款）：只有「删除」一项，
         删的是被点的那条，**不会**先把正文切过去。锚点固定贴在这排胶囊的下沿（不跟光标），
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
  padding: 8px 8px 0;
  /* 这一层同时是**唯一的容器查询源**：轨与状态栏的窄容器让步挂在这里，
     正文那半（TestCaseBody 的 @container 35rem）也往上命中它 —— `.case-viewport` 与它
     左右内边距抵消、inline-size 逐像素相同，所以 2026-11-19 把那层的 container-type 删了，
     不必套两层 containment。 */
  container-type: inline-size;
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

/* 只有这条轨参与滚动。「装得下就贴着最后一颗胶囊、装不下就收缩到可用宽度」
   是 flex 0 1 auto 给的：basis 取内容宽，不够时靠 shrink 压到 available，
   于是 few 的时候 `+` 紧跟其后，多的时候 `+` 自然被顶到右缘 —— 两种情形都不用改 DOM。 */
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

/* 胶囊 26px / 6px 圆角 / 12.5px 600。未选中是幽灵态，选中才浮出底色
   （与文件树「悬停浅、选中深」同一套语汇；底色取 --case-chip-bg）。
   内边距 9 而不是 10：这枚胶囊自带 1px 边框（各态一律透明，见下面 .tab 那条），
   9 + 1 才等于正文的「框 12 + 字 10」那笔账 —— 胶囊的**内容起点**（那颗状态圆点）
   落在 22px 字轨上，与 input / Expected 的标签同一竖线。状态栏那颗判定文字也压这条轨
   （见 .active-case-head 的 padding-left，2026-11-19 徽标改纯文字后从 12 挪到 22）。
   ⚠️ 「样例 N」这几个字因此被圆点推到 34px（22 + 7 + 5），这是有意的：胶囊读作
   「圆点 + 标题」的一行条目，左沿该对齐的是圆点。2026-11-19 审查时试过把 padding 收到 7
   去把文字压回 22，但那样圆点会掉出字轨、右内边距还是 9，反而左右不匀。 */
.tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: 0 0 auto;
  height: 26px;
  padding: 0 9px;
  border-radius: 6px;
  /* 各态都透明，只为把尺寸钉死：选中前后胶囊宽高逐像素相同，来回切时整条轨不重排。
     ⚠️ 别顺手删成 `border: 0` —— 那样要同时把 padding 补成 10，字轨才对得上（见上一条注释）；
     也别给它上色（2026-11-19 用户：「去掉分项标签的标签外一圈线」）。 */
  border: 1px solid transparent;
  background: transparent;
  font-size: 12.5px;
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
   判定色仍由胶囊里那颗 7px 圆点与下方状态栏的徽标交代 —— 曾经给选中胶囊的边框
   也染过一档判定色（color-mix 兑 --ok / --fail / --err），但那圈线正是这次被点名去掉的东西；
   别再补回来，也别改成 `outline` / `box-shadow` 的环，那是同一根线换了个画法。 */
.tab.is-active {
  background: var(--case-chip-bg);
  color: var(--text);
}

/* 状态点（7px）。**常驻**，未运行时是一圈空心 —— 见模板里那段注释：
   宽度恒定，跑完加色时胶囊不会横向重排（原来 6px 且 v-if，一跑完整条轨往右跳 12px/颗）。
   7px 是审查后从 6 调上来的：余光里分辨红绿，6px 太吃力。 */
.tab__dot {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  /* 未运行：空心环，靠 inset 阴影画线，不占额外尺寸 */
  box-shadow: inset 0 0 0 1px var(--text-faint);
}

.tab__dot[data-status='passed'] {
  background: var(--ok);
  box-shadow: none;
}

/* 失败 / 出错多给一层同色微光：一排点里红点要能被一眼拎出来（橙同理）。
   同样兑 var(--fail) / var(--err)，理由见上面选中态那条 —— 浅色主题的判定色与深色不同。 */
.tab__dot[data-status='failed'] {
  background: var(--fail);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--fail) 18%, transparent);
}

.tab__dot[data-status='error'] {
  background: var(--err);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--err) 18%, transparent);
}

.tab__dot[data-status='running'] {
  background: var(--info);
  box-shadow: none;
}

/* 「结果待重测」用琥珀色压过判定色：旧结论已经不作数，画绿点会让人以为它还是 AC */
.tab__dot[data-status='stale'] {
  background: var(--warn);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--warn) 16%, transparent);
}

/* 三档写法：全称 / 短称 / 纯数字。默认只显示全称，另两档由下面的容器查询按需换上。 */
.tab__short,
.tab__num {
  display: none;
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
/* 高度 36（不是方案里的 32）：两颗 32×32 的幽灵钮要装得下，而且卡片头栏也是 2 + 32 + 2
   —— 两种布局来回切时这一行纹丝不动。
   左 22 对齐**字轨**（不是 12 的框轨）：首元素 .badge 自 2026-11-19 起是纯文字、没有底色框，
   12px 会把状态字顶到 Tab 胶囊与下方 input / Expected 小标题的左边 10px 处 —— 那三列的字
   都落在 22px。右 8 与 .cases 同值。 */
.active-case-head {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 8px 0 22px;
}

.grow {
  flex: 1 1 auto;
}

/* 判定徽标 / 耗时 / 待重测 / 两颗图标钮：与 TestCaseCard 里那几颗同一套值。
   ⚠️ 两份是刻意的（scoped 样式不跨组件），改任何一处都要同步另一处 —— 尤其是 .badge 的
   12.5px / 700（纯文字靠字号与字重撑体量）与 .icon-btn--danger 的 0.18 幽灵透明度。 */
.badge {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  white-space: nowrap;
  /* 纯文字判定（2026-11-19，Typographic Status）：底色、圆角、左右内边距全删。
     11px 的裸字在两个字母的宽度上立不住，体量改由 12.5px / 700 承担 —— 压得住 11px 的耗时，
     又压不过标题。颜色只走语义前景色：--ok / --fail / --err / --info。 */
  padding: 0;
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: 0.03em;
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

.metric {
  flex: 0 0 auto;
  font-family: var(--mono-font);
  font-size: 11px;
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

/* 删除钮的可见度（2026-11-19 审查后从 0.18 提到 0.6）：
   0.18 是**列表模式**的口径 —— 那里同屏 N 张卡，满屏垃圾桶要压下去，靠悬停整张卡唤醒。
   分项模式同屏只有一个状态栏，同一套透明度把唯一的删除钮压得比禁用态（0.35）还淡，
   读起来就是个死按钮。这里常态 0.6 够看清，悬停到**按钮本身**才转红加底。
   ⚠️ 仍保留三档守卫：is-hoverable（触屏没有悬停，走下面那条常显）、:not(:disabled)、
   以及键盘 focus —— 去掉任一条都会让「禁用态看起来可点」或「触屏上永远看不见」。 */
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

/* -------------------------------------------------------------- 窄容器让步 */
/* 阈值与卡片那半边同一套：22.5rem 换短称、17rem 让掉待重测、15.625rem 极致紧凑。
   容器是 .tabs-view（宽 = 面板宽 − 16），与 .cases 的口径一致。 */
@container (max-width: 22.5rem) {
  .active-case-head {
    gap: 6px;
    padding-right: 6px;
  }

  .stale__full {
    display: none;
  }

  .stale__short {
    display: inline;
  }

  /* 样例数 ≥ 4 才缩写：两三条时「样例 N」还放得下，没必要提前把话说短 */
  .tabs-view.is-dense .tab__long {
    display: none;
  }

  .tabs-view.is-dense .tab__short {
    display: inline;
  }
}

@container (max-width: 17rem) {
  .stale {
    display: none;
  }
}

/* 最窄一档：胶囊只剩「状态点 + 数字」，间距再收一档。
   判定徽标、单卡耗时、页头的全局结论在任何宽度下都不隐藏（同卡片那条优先级）。 */
@container (max-width: 15.625rem) {
  .active-case-head {
    gap: 4px;
    padding-right: 5px;
  }

  .case-tabs,
  .case-tabs__track {
    gap: 4px;
  }

  .tab {
    gap: 5px;
    padding: 0 8px;
  }

  .tabs-view .tab__long {
    display: none;
  }

  .tabs-view.is-dense .tab__short {
    display: none;
  }

  .tabs-view .tab__num {
    display: inline;
  }
}
</style>
