/**
 * testsPaneDrag —— 「评测样例」拖出手势的唯一真源（2026-11-19 用户要求）。
 *
 * 两个来源共用同一套手势与落点高亮：
 *   · `'island'`：编辑区里那座评测岛的页头（TestsPane 抛 `drag-start`）。
 *   · `'sidebar'`：侧栏胶囊里的「评测」段、折叠态活动栏的评测图标 —— 拖进编辑区
 *     就把它变成岛（原来的「在编辑区打开」按钮已按用户要求删掉）。
 *
 * 落点：编辑区左侧 0%↔38% 带 → `'left'`；右侧 62%↔100% 带 → `'right'`；底部 62%↔100% 带 → `'bottom'`；
 * 侧栏 / 活动栏上方 → `'sidebar'`；从侧栏拖进编辑区其它位置 → `'editor'`（按记忆 / 自动侧打开）。
 *
 * 【结算为什么要注入】真正落位要动布局树、还要让 App 收尾（从侧栏拖出后把侧栏翻回
 * 资源管理器；把岛拖回侧栏后把侧栏翻到评测页），只有 EditorPaneGrid / App 知道这些。
 * 本文件只负责手势、命中与高亮，落位交给 `testsPaneDrag.settle`（EditorPaneGrid 挂载时写入），
 * 与 `paneFocus.settle` 同一个体例。
 */
import { computed, ref } from 'vue'
import { t } from '../i18n/index.js'
import { testsPaneSide } from './editorPanes.js'

/** 这次手势从哪里起手：'island' | 'sidebar' | null */
const testsPaneDragSource = ref(null)
/** 当前落点：'right' | 'bottom' | 'sidebar' | 'editor' | null */
export const testsDrop = ref(null)
/** 落点是否就是「现在已经在的那一侧」（松手＝保持原位，不换边） */
export const testsDropCurrent = ref(false)

/** 落点结算注入点（见文件头） */
export const testsPaneDrag = { settle: null }

/** 落点提示文案（overlay 里那枚小胶囊） */
export const testsDropLabel = computed(() => {
  if (testsDropCurrent.value) return t('tests.pane.dropKeep')
  if (testsDrop.value === 'left') return t('tests.pane.dropLeft')
  if (testsDrop.value === 'right') return t('tests.pane.dropRight')
  if (testsDrop.value === 'bottom') return t('tests.pane.dropBottom')
  if (testsDrop.value === 'sidebar') return t('tests.pane.dropSidebar')
  if (testsDrop.value === 'editor') return t('tests.pane.dropEditor')
  return ''
})

let origin = null
let moved = false
let suppressClick = false
/** 本次手势的起手档位与阈值（见 getTestsPaneDragStartKind） */
let startKind = 'head'
let startThreshold = 5
let startPointerType = 'mouse'
/** 起手时岛停在哪一侧 —— 用来判定「保持当前位置」 */
let startSide = null

const DRAG_SLOP = 5
/** 页签代理的阈值略宽：页签本身还要承担「点一下切样例」，防手抖误拖 */
const TAB_PROXY_SLOP = 7

/**
 * 必须**优先于**代理判定的硬排除：这些是页签内部真正的动作控件，
 * 从它们身上按下只能是删除、新增或输入，绝不能变成换边拖动。
 */
const STRICT_EXCLUDE =
  'input, textarea, select, [contenteditable], [data-no-pane-drag], .tab__close, .tab-add'

/** 普通按钮 / 链接：页头里没有代理标记时，仍然按「操作」放行 */
const GENERIC_EXCLUDE = 'button, a'

/**
 * 页头里这个按下点属于哪一档起手（2026-11-20 方案四：「零抓手」模型）：
 *   · `null` —— 严格动作控件（删除 ×、新增 +、输入框…）或普通按钮，不进入拖拽；
 *   · `tab-proxy` —— 样例页签，7px 起拖；触屏还要纵向拉出页头（见 onMove）；
 *   · `head` —— 页头空白 / 标题，5px 起拖。
 * 页签优先于普通 `button` 判定 —— 它虽然是个 `<button>`，但语义上是「按住拖走整座岛」。
 * @param {EventTarget|null} target
 * @returns {{kind: 'tab-proxy'|'head', threshold: number}|null}
 */
export function getTestsPaneDragStartKind(target) {
  if (!(target instanceof Element)) return null
  if (target.closest(STRICT_EXCLUDE)) return null
  if (target.closest('[data-pane-drag-proxy], [role="tab"]')) {
    return { kind: 'tab-proxy', threshold: TAB_PROXY_SLOP }
  }
  if (target.closest(GENERIC_EXCLUDE)) return null
  return { kind: 'head', threshold: DRAG_SLOP }
}

/**
 * 旧判据（工作台样例轨等仍在用）：只回答「是不是动作控件」。
 * 与上面同源，但**不认页签代理** —— 工作台左侧轨的样例行是点击选择，不参与换边拖动。
 */
export function isTestsPaneDragInteractive(target) {
  return target instanceof Element && Boolean(target.closest(INTERACTIVE_SELECTOR))
}

const INTERACTIVE_SELECTOR =
  'button, a, input, textarea, select, [role="tab"], [contenteditable], [data-no-pane-drag]'

function endDrag() {
  origin = null
  moved = false
  testsPaneDragSource.value = null
  testsDrop.value = null
  testsDropCurrent.value = false
  window.removeEventListener('pointermove', onMove, true)
  window.removeEventListener('pointerup', onUp, true)
  window.removeEventListener('pointercancel', onCancel, true)
  window.removeEventListener('keydown', onKeydown, true)
  document.body.classList.remove('is-tests-pane-dragging')
  document.body.classList.remove('is-tests-drop-sidebar')
}

/**
 * 拖拽真正激活并松手后，在**捕获阶段**吞掉紧随其后的一次 click。
 * 2026-11-20 方案三：页签也能作为起手点之后，松手会补一发 click，
 * 不拦就会顺手把样例切掉。用全局拦截而不是让每个组件自己调
 * `consumeTestsPaneDragClick` —— 页签、`+`、外部按钮都不用各自适配。
 */
function suppressNextClick() {
  const swallow = (event) => {
    event.preventDefault()
    event.stopPropagation()
  }
  window.addEventListener('click', swallow, true)
  // click 紧跟在 pointerup 之后、定时器之前派发，清掉这一发就够；
  // 万一某次没有补发 click，下一轮宏任务也会把监听摘掉，不留后患。
  setTimeout(() => window.removeEventListener('click', swallow, true), 0)
}

/**
 * 起手。`source` 决定落点语义（岛可以拖回侧栏；侧栏入口只能拖进编辑区）。
 * 捕获阶段收 move / up：指针路过 Monaco 或侧栏分隔条时，即使那一层 stopPropagation
 * 也挡不住收尾 —— 否则会留下「松手了还亮着」的僵局。
 * @param {PointerEvent} event
 * @param {'island'|'sidebar'} source
 */
export function beginTestsPaneDrag(event, source) {
  if (event.button !== 0) return
  const kind =
    source === 'island' ? getTestsPaneDragStartKind(event.target) : { kind: 'head', threshold: DRAG_SLOP }
  if (!kind) return
  endDrag()
  suppressClick = false
  origin = { x: event.clientX, y: event.clientY }
  startKind = kind.kind
  startThreshold = kind.threshold
  startPointerType = event.pointerType || 'mouse'
  startSide = source === 'island' ? testsPaneSide() : null
  testsPaneDragSource.value = source
  window.addEventListener('pointermove', onMove, true)
  window.addEventListener('pointerup', onUp, true)
  window.addEventListener('pointercancel', onCancel, true)
  window.addEventListener('keydown', onKeydown, true)
  // 2026-11-20 方案四：`is-tests-pane-dragging` 只在**跨过阈值、真正开始拖**时才挂
  // （见 onMove）。按下就挂会让整座岛在普通点击页签时闪一下半透明。
}

/** Esc 随时中止：不落地、不吞 click，直接清干净 */
function onKeydown(event) {
  if (event.key !== 'Escape') return
  event.preventDefault()
  endDrag()
}

function onMove(event) {
  if (!origin) return
  const dx = event.clientX - origin.x
  const dy = event.clientY - origin.y
  const distance = Math.hypot(dx, dy)
  if (!moved && distance < startThreshold) {
    testsDrop.value = null
    testsDropCurrent.value = false
    return
  }
  // 触屏从页签起手：横向滑动属于标签轨自己的 pan-x，不抢；
  // 只有纵向拉出 ≥10px 且明显压过横向（|dy| > |dx| × 1.25）才接管成岛拖拽。
  if (!moved && startKind === 'tab-proxy' && startPointerType !== 'mouse') {
    if (Math.abs(dy) < 10 || Math.abs(dy) <= Math.abs(dx) * 1.25) {
      testsDrop.value = null
      testsDropCurrent.value = false
      return
    }
  }
  if (!moved) document.body.classList.add('is-tests-pane-dragging')
  moved = true
  const previous = testsDrop.value
  testsDrop.value = resolveDrop(event.clientX, event.clientY, previous)
  // 「落在当前已停靠的那一侧」＝保持原位：不画落点带，只给一句「保持当前位置」。
  testsDropCurrent.value = Boolean(testsDrop.value && testsDrop.value === startSide)
  // 悬在侧栏（展开的整座 / 折叠态活动栏）上方时给侧栏挂高亮类：
  // 光靠编辑区里那枚「松开以停靠回侧边栏」不够 —— 指针已经在侧栏上了，
  // 高亮得落在用户正在看的那一块上。
  document.body.classList.toggle('is-tests-drop-sidebar', testsDrop.value === 'sidebar')
}

function onUp() {
  const target = testsDrop.value
  const source = testsPaneDragSource.value
  const didMove = moved
  // 有位移就吃掉紧随其后的 click：否则从页签起拖、松手时会顺手切一次样例
  // （用户看到的是「刚拖完，面板又跳了」）。侧栏入口沿用同一个标记。
  suppressClick = didMove
  if (didMove) suppressNextClick()
  endDrag()
  if (didMove && target) testsPaneDrag.settle?.(target, source)
  if (didMove) setTimeout(() => { suppressClick = false }, 0)
}

function onCancel() {
  suppressClick = false
  endDrag()
}

/** 这一次手势是否已经变成拖动（供组件在 click 里吞掉那一下） */
export function consumeTestsPaneDragClick() {
  const value = suppressClick
  suppressClick = false
  return value
}

/**
 * 指针是否落在侧栏上方（展开的整座 / 折叠态活动栏 / 侧栏外沿那几像素）。
 * 浮岛自己的拖动也复用这一条 —— 落点判据只能有一份，不能两处各写一套选择器。
 */
export function isSidebarDropPoint(x, y) {
  return Boolean(document.elementFromPoint(x, y)?.closest?.('.sidebar, .activity-bar, .pane--tests'))
}

/**
 * 指针在哪儿算哪个落点。侧栏判定必须走 `elementFromPoint`：拖动期间没有 pointer capture，
 * 指针移到侧栏上方时命中的就是侧栏里的元素。除了展开态的 `.sidebar` 与折叠态的活动栏，
 * 还认整个 `.pane--tests` —— 用户可能落在侧栏外沿 / 分隔条那一侧，那几像素不在 `.sidebar`
 * 里，但对人来说「就是侧栏」。
 * @param {number} x
 * @param {number} y
 * @param {string|null} prevTarget 上一次算出的落点（6% 中线迟滞带里沿用它，防抖动）
 * @returns {'left'|'right'|'bottom'|'sidebar'|'editor'|null}
 */
function resolveDrop(x, y, prevTarget) {
  const source = testsPaneDragSource.value
  if (isSidebarDropPoint(x, y)) return source === 'island' ? 'sidebar' : null
  const el = document.querySelector('.editor-grid')
  if (!el) return null
  const rect = el.getBoundingClientRect()
  if (!rect.width || !rect.height) return null
  if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null
  const rx = (x - rect.left) / rect.width
  const ry = (y - rect.top) / rect.height
  // 2026-11-20 方案三：取消 38%~62% 的中部死区。
  //   · 底部优先：越过 56% 就是「停靠到底部」，不必再和左右带比超出量；
  //   · 左右以中线为界（47% / 53%），48% 的横移就能看到落点，拖距缩短约三分之一；
  //   · 中线两侧留 6% 迟滞带：沿用上一次的左右目标，指针轻微抖动不至于闪烁。
  // 「松手＝取消」由「落回当前已停靠的那一侧」承担（见 testsDropCurrent），
  // 不再需要一大片空白区当取消区。
  if (ry > 0.56) return 'bottom'
  if (rx < 0.47) return 'left'
  if (rx > 0.53) return 'right'
  // 侧栏入口落在编辑区中部仍算数：按记忆 / 自动侧打开（岛自己再拖即可换边）
  if (source === 'sidebar') return 'editor'
  return prevTarget === 'left' || prevTarget === 'right' ? prevTarget : null
}
