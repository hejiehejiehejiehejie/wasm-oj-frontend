<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import EditorPane from './components/EditorPane.vue'
import TestPanel from './components/TestPanel.vue'
import Sidebar from './components/Sidebar.vue'
import ActivityBar from './components/ActivityBar.vue'
import FileExplorer from './components/FileExplorer.vue'
import ToolchainGate from './components/ToolchainGate.vue'
import NotificationCenter from './components/NotificationCenter.vue'
import CountdownCard from './components/CountdownCard.vue'
import { t } from './i18n/index.js'
import { usePersistentRef } from './composables/usePersistentRef.js'
import { uiScale } from './composables/useUiScale.js'
import { useCompanionImport } from './composables/useCompanionImport.js'
import { autoScrapeState, useCompanionBridge } from './composables/useCompanionBridge.js'
import { useMobileKeyboard } from './composables/useMobileKeyboard.js'
import { usePageDrop } from './composables/usePageDrop.js'
import { useInstallGuides } from './composables/useInstallGuides.js'
import { actionForCombo, comboFromEvent, recordingActive } from './composables/useShortcutManager.js'
import { contentElementAt } from './composables/contentHit.js'
import { flush, initAutoSave } from './services/autoSave.js'
import { DEFAULT_ENGINE_ID, defaultBases, getEngine } from './services/engines/index.js'
import { MEMORY_LIMIT_DEFAULT_BYTES, TIME_LIMIT_DEFAULT_MS, runCases } from './services/runner.js'
import { scheduleAutoPreload } from './services/runtimePreload.js'
import { prepareNativeToolchain } from './services/nativeToolchain.js'
import { requestPersistence } from './services/storageQuota.js'
import { IS_ANDROID, IS_DESKTOP } from './services/platform.js'
import { initWorkspace } from './services/vfs/migrate.js'
import {
  activeLanguage,
  activeNode,
  getNodeById,
  initWorkspaceStore,
  peekActiveContent,
  saveAll,
  updateFileConfig,
  workspace as workspaceStore,
} from './services/vfs/workspaceStore.js'
import {
  fetchSubmissionDetail,
  isDuplicateSubmission,
  rememberSubmission,
  shouldShowSubmit,
  submitActiveSolution,
  submitBlockedReason,
  submitReasonText,
  submitVerdictText,
  submitVerdictType,
} from './services/ojSubmit.js'
import { clearRunNotify, notifyRunOutcome } from './services/runNotify.js'
import { modelManager } from './services/monaco/modelManager.js'
import {
  MD_VIEW_SHORTCUT,
  cycleMdView,
  exitFullscreen,
  mdActive,
  mdFullscreen,
} from './services/mdView.js'
import { MD_SHORTCUTS } from './services/mdFormat.js'
import { deactivateSettingsTab, openSettingsTab, settingsTab } from './services/editorViews.js'
import { confirmCloudEntry } from './services/cloudEntry.js'
import { celebrateAllPassed } from './services/confetti.js'
import {
  dismissByTag,
  flushFlashNotification,
  notify,
  updateNotification,
} from './services/notifications.js'
import { initSettingsUndo } from './services/settingsUndo.js'
import { editorSettings, updateEditorSettings } from './services/editorSettings.js'
import {
  flipPanelPosition,
  isNarrowLayout,
  narrowCollapseSide,
  panelPosition,
  uiScalePref,
} from './services/shellSettings.js'

// ---------------------------------------------------------------- 持久化状态
// 侧边栏位置（panelPosition）、窄屏折叠方向（narrowCollapseSide）与全局缩放（uiScalePref）
// 已下沉到 services/shellSettings.js：设置下拉菜单要直接改它们，不必再经一条通向 App 的 emit 链。
// 是否显示统一侧边栏（只影响显隐，文件树展开态与用例数据都不丢）
const panelVisible = usePersistentRef('cp.panelVisible', true)
// 语言不独立持久化：由活跃文件扩展名派生（activeLanguage），顶栏已无语言下拉
const editorShare = usePersistentRef('cp.editorShare', 60)
const engineId = usePersistentRef('cp.engine', DEFAULT_ENGINE_ID)
// 存档里的引擎 id 可能是另一端写下的（云端同步带过来，或同一个 localhost 源在浏览器与桌面壳之间
// 来回切）：本端跑不了就当场归位到本端默认引擎，否则面板高亮的引擎与真正生效的那个会对不上
if (engineId.value !== getEngine(engineId.value).id) engineId.value = DEFAULT_ENGINE_ID
const judgeBases = usePersistentRef('cp.judgeBases', defaultBases())
// 全局时限（毫秒，只计运行段）：所有用例统一，超了判 TLE。
// 这是「没有题目时限时的默认值」；带 meta.timeLimit 的题目文件优先用题目时限。
const timeLimitMs = usePersistentRef('cp.timeLimitMs', TIME_LIMIT_DEFAULT_MS)
// 全局内存上限（字节）：所有用例统一，超了判 MLE。只有能兑现的引擎会用（wasm 沙箱 / Judge0）。
const memoryLimitBytes = usePersistentRef('cp.memoryLimitBytes', MEMORY_LIMIT_DEFAULT_BYTES)
// 实际生效的时限：活跃文件自带题目时限就用它，否则退回全局默认
const effectiveTimeLimitMs = computed(() => {
  const fromMeta = activeNode.value?.meta?.timeLimit
  return fromMeta && fromMeta > 0 ? fromMeta : timeLimitMs.value
})
// 实际生效的内存上限，与 effectiveTimeLimitMs 同构：扩展抓来的题在 config 里带
// memoryLimit（单位 MB，cph-companion 的 Task 契约），换算成字节优先用；不是题目
// 文件（或抓取源没给）退回全局设置。个别 parser 硬编码的值（如 Beecrowd 1024）
// 是该 OJ 的真实限制，照用不纠。
const effectiveMemoryLimitBytes = computed(() => {
  const mb = activeNode.value?.config?.memoryLimit
  return typeof mb === 'number' && mb > 0 ? mb * 1024 * 1024 : memoryLimitBytes.value
})

// 全局界面缩放（档位 100% / 110% / 125% / 150%，默认 100%）连同「写一次根字号」
// 都搬到了 services/shellSettings.js（模块被 import 时就落地，早于首帧渲染）。
// 这里仍要在拖拽数学里读当前倍数（measureLimits 的 scale），所以保留 uiScale 这个 ref。

// 编辑器偏好已抽到 services/editorSettings.js（模块级单例）。这里只 import 用它：
// :settings 传 editorSettings、@update:settings 接 updateEditorSettings，行为与抽离前完全一致。

const engine = computed(() => getEngine(engineId.value))
const judgeBase = computed(() => judgeBases.value[engineId.value] ?? engine.value.defaultBase)

// 评测引擎描述，面板与设置浮层共用同一份
const judgeSettings = computed(() => ({
  id: engine.value.id,
  label: engine.value.label,
  hint: engine.value.hint,
  executesCode: engine.value.executesCode !== false,
  base: judgeBase.value,
}))

const connection = ref({ state: 'idle', message: '' })
let connectionProbe = null

function selectEngine(id) {
  engineId.value = id
  connection.value = { state: 'idle', message: '' }
}

function updateBase(value) {
  judgeBases.value = { ...judgeBases.value, [engineId.value]: value }
  connection.value = { state: 'idle', message: '' }
}

async function testConnection() {
  if (connection.value.state === 'checking') return
  if (typeof engine.value.health !== 'function') {
    connection.value = { state: 'idle', message: t('engine.selfTestUnsupported') }
    return
  }
  connectionProbe?.abort()
  connectionProbe = new AbortController()
  connection.value = { state: 'checking', message: t('engine.checking') }
  const result = await engine.value.health(judgeBase.value, connectionProbe.signal)
  connection.value = { state: result.ok ? 'ok' : 'bad', message: result.message }
}
// （旧的 cph.drafts「每语言草稿」已由 VFS 取代：启动时一次性迁移，见 services/vfs/migrate.js）

// ------------------------------------------------------------------ 测试用例
let caseSeq = 0

function createCase(seed = {}) {
  return {
    id: ++caseSeq,
    input: '',
    expectedOutput: '',
    actualOutput: '',
    status: 'idle',
    detail: '',
    verdict: '',
    durationMs: null,
    stale: false,
    collapsed: false,
    ...seed,
  }
}

/**
 * 样例的唯一出处是**当前文件**（node.config.tests，即扩展抓来的原文）：
 * 切到哪个文件就显示哪个文件的样例；用户自己建的 .cpp、或题目还没抓过样例，
 * 面板就是空的 —— 绝不把上一个文件留下的那份接着用。
 * 用户改了面板里的两栏，也会（防抖）回写进这个文件的 config，见下面「用例回写」。
 *
 * 这正好是「抽题导入（样例为空）→ 打开题目页 → 扩展补抓 → 样例落回同一个文件」
 * 这条链路在界面上的收尾：补抓会重写该文件的 config，紧接着的一次树重建就把它带进面板，
 * 所以这里不需要（也不该有）第二条写 testCases 的通路 —— 导入回调里直接灌一份的话，
 * 万一用户在导入落地前切换了文件，灌进来的就是别的题的样例。
 *
 * @param {unknown} raw node.config.tests
 * @returns {Array<{ input: string, expectedOutput: string }>}
 */
function normalizeTests(raw) {
  const tests = Array.isArray(raw) ? raw : []
  // 扩展送来的样例是 { input, output }，评测面板那一侧叫 expectedOutput，在这层翻一下。
  // 两栏一律收成字符串：面板里是 textarea，写回文件也要是字符串，否则「有没有变」比不出来。
  return tests
    .filter((test) => test && typeof test === 'object')
    .map((test) => ({ input: String(test.input ?? ''), expectedOutput: String(test.output ?? '') }))
}

/** 两组样例是不是一模一样（只比用户能改的两栏） */
function sameTests(a, b) {
  return (
    a.length === b.length &&
    a.every((item, i) => item.input === b[i].input && item.expectedOutput === b[i].expectedOutput)
  )
}

const testCases = ref([])

/** 面板里这批样例是从哪个文件读来的（回写靠它认路；null = 还没有文件） */
let casesNodeId = null

// ------------------------------------------------------------ 用例回写
// 用户手写的两栏跟着文件走：切走再切回来、刷新页面，都还在（原本是全局存 localStorage，
// 那正是「打开 B 题却看见 A 题样例」的来源）。只动 config.tests 这一个字段，
// 扩展抓来的其余字段（name / url / timeLimit…）原样保留。
const CASES_WRITE_DELAY = 500
let casesWriteTimer = 0
/** 欠着的那一笔：{ id, tests }。快照在**调度时**就取好 —— 之后 testCases 换成了别的文件也不影响它 */
let casesWritePending = null

// 只看用户手写的两栏：状态 / 耗时 / 运行结论的变化不该触发回写
const casesSignature = computed(() =>
  JSON.stringify(testCases.value.map(({ input, expectedOutput }) => [input, expectedOutput])),
)

function flushCasesWrite() {
  window.clearTimeout(casesWriteTimer)
  casesWriteTimer = 0
  const pending = casesWritePending
  casesWritePending = null
  if (!pending?.id) return

  const node = getNodeById(pending.id)
  if (!node || node.type !== 'file') return
  // 与文件里现存的一样就什么都不做 —— 否则「读回来 → 写回去 → 树重建 → 再读回来」会空转
  if (sameTests(normalizeTests(node.config?.tests), pending.tests)) return
  // 存回扩展那套字段名（{ input, output }），下次读回来才对得上
  void updateFileConfig(node.path, {
    ...node.config,
    tests: pending.tests.map(({ input, expectedOutput }) => ({ input, output: expectedOutput })),
  })
}

watch(casesSignature, () => {
  if (!casesNodeId) return
  casesWritePending = {
    id: casesNodeId,
    tests: testCases.value.map(({ input, expectedOutput }) => ({ input, expectedOutput })),
  }
  window.clearTimeout(casesWriteTimer)
  casesWriteTimer = window.setTimeout(flushCasesWrite, CASES_WRITE_DELAY)
})

// ------------------------------------------------------- 面板跟随当前文件
watch(
  activeNode,
  (node) => {
    // 上一份欠着的回写先发出去：改完用例立刻切文件，不该丢掉这一笔
    flushCasesWrite()
    const id = node ? node.id : null
    const seeds = normalizeTests(node?.config?.tests)
    // 内容没变就原样留着：一来保住每张卡上的运行结论（回写自己也会引发一次树重建），
    // 二来省掉「刚写进去又当成一次外部修改读回来」的空转
    if (id === casesNodeId && sameTests(testCases.value, seeds)) return
    casesNodeId = id
    testCases.value = seeds.map((seed) => createCase(seed))
  },
  { immediate: true },
)

const workspace = ref(null)
const editorPane = ref(null)
// 资源管理器：F2 / Delete 两条快捷键要落进它里面去执行（见 SHORTCUT_TREE_HANDLERS）。
// 它在 Sidebar 的具名插槽里，而那是 v-show 切换的，所以实例一直都在、这个 ref 稳定可用。
const fileExplorer = ref(null)
const sidebarRef = ref(null)
// 侧栏那一栏的外层 .pane--tests，与它里面那层负责定宽的壳（折叠动画的裁切对象，
// 见下面的 pinSidebarWidth）
const sidebarPane = ref(null)
const sidebarInner = ref(null)
const running = ref(false)

// order 换序：splitter 恒 2；统一侧边栏在右时 editor 1 / tests 3，反之对调。
// flexBasis 两栏之和恒为 100% —— 折叠态靠侧栏那一栏收到 0%（见下），
// 全屏编辑则是编辑器自己不给 basis（另一栏整个不参与排版）
const editorPaneStyle = computed(() => ({
  order: panelPosition.value === 'right' ? 1 : 3,
  // 像素直连拖拽期间：编辑器只负责填满剩余空间（面板宽由 tests 的像素 flex-basis 定死），
  // 其余时刻仍走百分比 basis（含折叠态，图标栏固定 48px 那套逻辑不变）。
  ...(mdFullscreen.value
    ? {}
    : dragPanelPx.value !== null
      ? { flexGrow: 1, flexShrink: 1, flexBasis: '0px' }
      : { flexBasis: `${editorShare.value}%` }),
}))
const testsPaneStyle = computed(() => ({
  order: panelPosition.value === 'right' ? 3 : 1,
  // 像素直连拖拽期间：面板宽直接定为像素值（1:1 跟手，绕开百分比/舍入），
  // 之外走百分比：折叠期间给 0%（动画的终点），折叠到底后元素被 display 摘掉。
  ...(dragPanelPx.value !== null
    ? { flexGrow: 0, flexShrink: 0, flexBasis: `${dragPanelPx.value}px` }
    : { flexBasis: panelVisible.value ? `${100 - editorShare.value}%` : '0%' }),
}))
// 折叠后顶替侧栏的那条图标栏：恒贴在侧栏那一侧的最外侧
// （侧栏在右 → 排在最后；在左 → 排在最前），所以 order 是 4 / 0 这一对端点值
const activityBarStyle = computed(() => ({
  order: panelPosition.value === 'right' ? 4 : 0,
}))
// 图标栏要画面板表与「当前停在哪个面板」。表本身归 Sidebar（cp.sidebarTab 只有那一份），
// 经 defineExpose 透传上来；首帧 ref 还没落地时先给空数组，下一 tick 即补齐（不会闪一下布局）
const sidebarPanels = computed(() => sidebarRef.value?.panels ?? [])

// 触摸屏默认开启的「键盘模式」：键盘弹起时整块应用收缩到键盘上方（见 .app.is-keyboard），
// 并保证滑动只滚动、轻点输入框才唤键盘。鼠标设备上它不生效，行为与之前完全一致。
// keyboardUp 是「键盘**真的**弹着」（visualViewport 实测收缩），窄屏贴底那条图标栏靠它
// 收起来（见 .app.is-typing 那条规则）——active 在整台触摸设备上恒真，分不出弹没弹。
const {
  active: keyboardMode,
  shortViewport,
  keyboardUp,
  probe: focusProbe,
} = useMobileKeyboard()
// 页头耗时 = 本轮最慢的那张卡片，口径与卡片完全一致（只计运行段）：
// 编译 / 链接 / 排队 / WASI 启动都不算，跑完一批后不会比最快的样例大出一个量级。
const elapsed = computed(() => {
  let max = 0
  for (const item of testCases.value) {
    if (typeof item.durationMs === 'number' && item.durationMs > max) max = item.durationMs
  }
  return max
})
const dragging = ref(false)
// 像素直连拖拽：非 null 表示「拖拽中直接按像素定位侧栏内容宽」，绕开 flex-basis 百分比
// + 分隔条占位 + 逐次舍入这三层，让蓝线严格 1:1 跟手（多轮折叠展开后也不漂移）。
// null 时走正常的百分比流（editorShare）。见 move / handoffDrag / finish。
const dragPanelPx = ref(null)

// 拖拽手势的状态位（都只在一次按下—松手之内有意义，见 beginDrag / handoffDrag）：
// - dragLive：手势还活着（window 上的 move / up 监听还挂着）。
//   注意它和 dragging 是两码事：越界翻转期间手势不结束，而 dragging 照旧为真 ——
//   两条路径都不再摘它（摘它是为了给已删的 CSS 补间让路，见 handoffDrag）。
// - handoffPending：一次越界翻转还没落到 panelVisible 上（VT 的更新回调是异步的），
//   这期间再来的重复触发要挡掉，否则同一帧翻两次等于没翻。
let dragLive = false
let handoffPending = false

let abortController = null

// -------------------------------------------------------------- 布局切换
// 「往另一侧翻」这套动作（View Transitions 一条路，无 VT 直切）在 services/shellSettings.js
// 的 flipPanelPosition() —— 设置下拉菜单里的「侧边栏位置」也走那一个出口，
// 所以这里不另写一份。关键约束不变：那里只改 order，DOM 结构与 Monaco 实例都不动，
// 因此切换布局不会触发编辑器销毁重建（不会闪屏）。

// ------------------------------------------------------------------ 折叠规则
// 编辑器最窄 24%（= 面板最宽 76%）。面板最低宽度是 .pane--tests 的 min-width 那组值
// （宽屏 240px、窄屏按内容宽 50%，读 .workspace 的三个 CSS 变量），不在这里再写一份。
// 拖拽上线就是「编辑器最窄 24%」对应的面板最宽 76%；面板能拖多窄由 CSS min-width 决定。
const MIN_SHARE = 24
// 「折叠之后侧栏真正占的宽度」= 那条图标栏（ActivityBar 的 .activity-bar，48px），
// 也就是**宽屏**折叠态下分隔条停的位置。它**不再直接当折叠判定边界**（2026-10-11 改）：
// 真正的边界取它与「展开到最窄时分隔条停的位置」的中点，见 measureLimits 的 hingePx。
// ⚠️ 窄屏例外：那里既不用这条 48px，也不用中点，改用固定的指针容差 NARROW_HINGE_PX（见下）。
// 48 会被 postcss-pxtorem 转成 rem、跟着全局缩放走（见 ActivityBar.vue 里那条注释），
// 所以这里只存设计值，实际像素在 measureLimits 里乘 uiScale。
const ACTIVITY_BAR_PX = 48

// 窄屏折叠折点：指针离侧栏那一侧的边缘 **30px** 以内就折叠（2026-10-13 用户第二次改口径）。
// 上一版窄屏取的是 `minPanelPx / 2`（「最窄宽度的一半」，因为窄屏折叠后图标栏是通栏横条、
// 折叠停位等价于 0）—— 390 档实测落在离边缘 94.5px 处，手指拖到一半稍一用力就越线，用户报
// 「感觉容易误触」。30 是**指针容差**，与 TAP_SLOP 同一性质：UI 缩放改的是界面元素的逻辑尺寸，
// 不改手指的物理活动范围，所以**不乘 uiScale**（不同于 ACTIVITY_BAR_PX —— 那是某个元素的实际宽度）。
// 坐标系与 hingePx 相同：`panelW` 就是指针到面板边缘的像素距离（见 move()），所以「离边缘 30px」
// 直接写成 `hingePx = 30`，不用换坐标。
const NARROW_HINGE_PX = 30

// 拖拽与方向键共用的虚拟比例：它可能超出面板能压缩的范围，用来表达「鼠标离边缘还有多远」。
// 面板可见时它就等于 editorShare；折叠后 editorShare 冻结在折叠前的宽度（展开时原样回来），
// 虚拟比例则继续跟着鼠标走，好判断什么时候拖离了边缘。
let virtualShare = editorShare.value

// 量一次工作区，推出拖拽界线
function measureLimits() {
  const surface = workspace.value
  if (!surface) return { width: 1, paneSpace: 1, left: 0, contentRight: 1, minPanelPx: 0, maxPanelPx: 1, collapsedPx: 48, hingePx: 24, maxShare: 24, edgeShare: 100 }
  // 百分比 flex-basis 是按「内容盒」算的，而 getBoundingClientRect 含外侧留白，
  // 用后者会把鼠标位移折算小了、分隔条跟不满 1:1，所以这里要扣掉 padding。
  const style = getComputedStyle(surface)
  const width =
    surface.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight) || 1
  // 面板最低宽度读的是 .workspace 上那三个 CSS 变量（和 .pane--tests 的 min-width 同源，
  // 免得同一个数字在样式与 JS 里各写一份）：内容宽 × ratio，再卡进 [floor, cap]。
  // floor / cap 是「逻辑尺寸」（100% 下的设计值），要随全局缩放一起变大，所以这里乘一次
  // scale；ratio 是相对工作区物理宽度的比例，不乘。CSS 侧同款乘法见 .pane--tests 的 calc。
  const cssNumber = (name, fallback) => {
    const value = Number.parseFloat(style.getPropertyValue(name))
    return Number.isFinite(value) ? value : fallback
  }
  const scale = uiScale.value
  const panelMin = Math.max(
    cssNumber('--tests-min-floor', 160) * scale,
    Math.min(cssNumber('--tests-min-cap', 240) * scale, width * cssNumber('--tests-min-ratio', 0.5)),
  )
  // 折叠之后侧栏占的宽度：那条图标栏，随全局缩放一起变大（见 ACTIVITY_BAR_PX）
  const collapsedPx = ACTIVITY_BAR_PX * scale
  // 折叠 / 展开的分界线：取「折叠后分隔条停的位置」与「展开到最窄时分隔条停的位置
  // （panelMin）」的中点（2026-10-11 用户定的口径）。于是这条线本身就是判据 ——
  // 面板比它窄就折叠、比它宽就展开，两侧各留一段对称的死区（面板已经被 min-width / 折叠宽度
  // 顶住、无法再变），越过中点才算改状态。两个端点都含 scale，中点自动跟着缩放走。
  // ⚠️ 窄屏（isNarrowLayout）不走这个中点，改用固定的指针容差 NARROW_HINGE_PX（2026-10-13
  // 用户第二次改口径，理由见那个常量）：窄屏折叠后图标栏是一条通栏横条、横向上什么都没拿走，
  // 中点会落在「最窄宽度的一半」——390 档离边缘 94.5px，太远、容易误触。宽屏照旧。
  const hingePx = isNarrowLayout() ? NARROW_HINGE_PX : (collapsedPx + panelMin) / 2
  // 分隔条的**净占宽**：热区盒 12px（触屏 24px）减去它那条负外边距，真正从两栏手里拿走的只有 4px
  //（样式表 .splitter 那段注释里有算式；缩放时三者同乘 --ui-scale，差值不变）。
  // 两个数都要读：宽度用 rect（缩放后的真实值），外边距用计算值（负的，抵消一部分宽度）。
  const splitterEl = surface.querySelector('.splitter')
  const splitterRect = splitterEl?.getBoundingClientRect().width ?? 0
  const splitterStyle = splitterEl ? getComputedStyle(splitterEl) : null
  const splitterOuter =
    splitterRect > 0 && splitterStyle
      ? splitterRect +
        (Number.parseFloat(splitterStyle.marginLeft) || 0) +
        (Number.parseFloat(splitterStyle.marginRight) || 0)
      : 0
  // 两栏真正能分到的宽度：百分比 flex-basis 是按**内容宽** width 算的，可这一行里还有个分隔条，
  // 于是每条 basis 都会被按比例缩掉一点（shrink 权重 = 各自 basis，所以面板那条少的正是
  // splitterOuter × 面板占比）。松手反算占比时除以它才是「这块地方真有多宽」（见 finish）。
  const paneSpace = Math.max(1, width - splitterOuter)
  // 再加分隔条自身宽度：百分比 flex-basis 下，面板内容盒能压到多窄还要看分隔条占掉的那几像素。
  const minTests = panelMin + splitterRect
  return {
    width,
    // 两栏可分的总宽（= 内容宽 − 分隔条净占宽），见上面那段
    paneSpace,
    // 内容盒左右边界：像素直连拖拽里，把鼠标位置直接换算成面板内容宽
    left: surface.getBoundingClientRect().x + Number.parseFloat(style.paddingLeft),
    contentRight: surface.getBoundingClientRect().x + Number.parseFloat(style.paddingLeft) + width,
    // 面板内容宽（像素）的合法区间：下限是 CSS min-width 那组值，上限是「编辑器最窄 24%」留给面板的余量
    minPanelPx: panelMin,
    maxPanelPx: (width * (100 - MIN_SHARE)) / 100,
    // 折叠态下侧栏真正占的宽度（面板宽的坐标系）；百分比路径的折叠线仍按它算
    collapsedPx,
    // 折叠 / 展开的分界（像素直连）：面板宽压到它以下折叠，撑到它以上展开
    hingePx,
    // 百分比路径（键盘方向键 / reclamp）的编辑器占比上限：面板顶到最窄时编辑器该占多少
    maxShare: ((width - minTests) / width) * 100,
    edgeShare: ((width - collapsedPx) / width) * 100,
  }
}

// 百分比收口规则，只服务方向键（nudgeShare）与窗口变化收敛（reclampShare）——
// 鼠标拖拽已改走 move() 的像素直连，不再经过这里。
// 面板可见时被 maxShare 卡在最窄、顶到 edgeShare（= 折叠之后的宽度）才折叠；
// 折叠后往回走到 maxShare（最窄宽度）就展开，编辑器占比落在与最窄宽度一致的位置。
function applyShare(raw, limits) {
  const share = Math.round(Math.min(limits.maxShare, Math.max(MIN_SHARE, raw)) * 10) / 10
  if (panelVisible.value) {
    editorShare.value = share
    if (raw >= limits.edgeShare) panelVisible.value = false
    return
  }
  if (raw <= limits.maxShare) {
    editorShare.value = share
    panelVisible.value = true
  }
}

// 像素直连越过阈值（折叠 / 展开）：交给与「单击分隔条」完全同一套折叠 / 展开。
// 手势不结束 —— 监听留着，好让光标反向再越过对面阈值时能接着触发（不然一次按住只能翻一下）。
// 摘 is-dragging 这件事已经不需要了：它本来是给 CSS 补间让路用的（那条
// `.workspace.is-dragging .pane { transition: none }` 会让过渡整段失效），而折叠现在
// 只有 View Transitions 一条路（走 ::view-transition 伪元素、跟这个类无关）、无 VT 直切，
// 没有什么要让它。反过来摘掉有害：pinSidebarWidth 会把内层壳钉成 flex: 0 0 auto，靠那条
// .is-dragging .pane__inner.is-fixed 覆盖规则才能恢复流体，摘了拖拽就跟手迟一帧
// （用户报的「几轮展开后不跟手」正是这一条）。所以两条路径一律不摘（2026-10-14 统一）。
//
// 落点按占比定：展开落到最窄宽度（minPanelPx 反算出的 editorShare），折叠则从当前拖到的
// 像素宽反算出的占比起算 —— 让 togglePanel 的动画起点/终点接得上，也与键盘 / reclamp 共用
// 同一套舍入口径。
function handoffDrag(expand, limits) {
  if (handoffPending) return
  handoffPending = true
  if (expand) {
    // 展开：**只**动占比，不提前把像素直连接管（dragPanelPx 保持 null）。
    // 折叠态那一帧的 flex-basis 必须是 0% —— 那是展开动画的起点。这里一旦钉成 minPanelPx，
    // 面板会在仍挂着 is-collapsed（图标栏还占着 48px、侧栏挤在它右边）时就整块撑到最窄，
    // 分隔条先跳到「折叠位 + 最窄宽」处，动画收尾图标栏让位时又往回收 48px —— 看着就是
    // 「展开那一下出现在别处，动画结束还再跳一次」（2026-10-11 用户报）。
    // 钉子交给翻转后的下一帧：那时 panelVisible 已为真，move 的展开分支会按指针位置把
    // dragPanelPx 夹进 [minPanelPx, maxPanelPx]，动画期间占比与像素都等于最窄宽，不会抖动。
    editorShare.value = Math.round(((limits.width - limits.minPanelPx) / limits.width) * 100 * 10) / 10
  } else {
    // 折叠：把当前拖到的像素宽反算回占比，作为折叠动画的起点（早于最窄时就松手也不跳）
    if (dragPanelPx.value !== null) {
      editorShare.value = Math.round(((limits.width - dragPanelPx.value) / limits.width) * 100 * 10) / 10
    }
    dragPanelPx.value = null
  }
  nextTick(() => togglePanel())
}

// 越界翻转真正落到 panelVisible 上时才解锁，重复的那一帧才有得挡。
watch(panelVisible, () => {
  handoffPending = false
})

function nudgeShare(delta) {
  virtualShare = Math.min(100, Math.max(MIN_SHARE, virtualShare + delta))
  applyShare(virtualShare, measureLimits())
}

// 面板最低宽度会随缩放变化（minTests 里的面板下限要乘 scale），窗口一窄 50% 那一项也会接手，
// 两者都让 maxShare 变小；而持久化里的比例不会自己跟着变回来。于是它一直是个「越界值」：
// 面板被 CSS 的 min-width 撑着，JS 眼里的合法区间却已经挪走了 —— 第一次拖拽时 applyShare
// 会一口气把它夹进新区间，表现就是「拖一下就猛地跳一段」。
// 这里只做收敛：越界才写回，本来就合法则原样不动。
function reclampShare() {
  if (!panelVisible.value) return
  applyShare(editorShare.value, measureLimits())
  virtualShare = editorShare.value
}

let layoutObserver = null
let reclampTimer = 0

// 缩放的收敛是确定性的（一次跳变由一个 nextTick 接住）；视口变化不能照搬：
// ResizeObserver 在拖窗口 / 切换视口的途中会喂进一串「过渡尺寸」，拿它们夹取会把用户的比例
// 永久改小 —— 夹取是单向的（Math.min 只压不放），尺寸涨回去也不会自己长回来。
// 所以等尺寸停稳 150ms 再收敛。
function scheduleReclamp() {
  window.clearTimeout(reclampTimer)
  reclampTimer = window.setTimeout(reclampShare, 150)
}

// 缩放一变，派生的面板最低宽度就变；nextTick 是为了让 --ui-scale 与新一轮排版都已生效
watch(uiScale, () => nextTick(reclampShare))

// 折叠 / 展开。折叠期间 editorShare 不动，所以展开回到的就是折叠前的宽度。
// 三条入口共用它：键盘（toggle-panel）、程序内调用（revealTestsPanel / switchSidebarPanel）、
// 以及鼠标 / 触摸端单击分隔条（在 beginDrag 的 pointerup 里认，见下）。
//
// 动画只有一条路径：**一次状态翻转 + View Transitions 补间**；闸门过不去就直切，
// 直切只翻状态，不做任何补偿动作（不挂 class、不守闸门、不等时长）。
//
// 这里原先还有一套纯 CSS 的两段式：宽度 200ms 伸缩（`.pane--tests.is-animating` 与
// ActivityBar 的 `flex-basis` transition）+ 180ms 后浮现（`panel-fade-in`），配一个
// `PANEL_LOCK_MS = 300` 的闸门与「接缝 / 残留」两处收尾；更早还试过「图标从一头飞到另一头」。
// 2026-10-14 连同无 VT 时的 CSS 兜底一起删干净了（见坑 46）：同一类动作留着两套降级形态，
// 只会让一部分设备上多出一种「半套」动画，而它在窄屏遮不住主轴翻转的跳变。
//
// 系统开了「减弱动效」：这时候整段走直切，不播 View Transitions。这道闸门必须在 JS 里守 ——
// base.css 那条 `* { animation-duration: 0.01ms }` 压不着 `::view-transition-*` 伪元素
// （通配选择器不匹配伪元素），光靠 CSS 拦不住。
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

// View Transitions 支持探测：侧栏折叠 / 展开与布局换边共用同一个判据
// （flipPanelPosition 里那道检查保持原样，这一轮只动侧栏这一条路径）
const canViewTransition = () => typeof document.startViewTransition === 'function'

// 过渡期间把两栏的 view-transition-name 临时摘掉（整屏交叉淡化，见 togglePanel 里的说明）。
// 必须在 startViewTransition **之前**同步改掉：旧快照那一刻就得是不带名字的状态，
// 所以直接操作 DOM 而不是走响应式（响应式要等 nextTick，晚一帧就来不及了）。
// 传 '' 恢复，让样式表里那两条 view-transition-name 重新生效（布局换边还要用）。
function setPaneTransitionNames(name) {
  workspace.value?.querySelectorAll('.pane').forEach((el) => {
    el.style.viewTransitionName = name
  })
}

// 内层定宽 + 外层裁切：把 .pane__inner 的宽度钉在外层 .pane--tests 的实测宽度上。
// 宽度一变，内层若跟着变，里面的文件树与用例卡片就会重排（文字反复换行、@container
// 规则反复重算），看着是「内容被挤扁」而不是「被推开」。钉住之后内层的排版一动不动，
// 由外层自己的 overflow: hidden 负责裁掉多出来的部分。
// 平时这个观察器跟着外层的实测宽度走（与流式布局等价），拖分隔条时整条规则让路
// （见样式表里 .is-dragging 那条），所以日常使用与流式没有区别。
const sidebarPinned = ref(false)
let sidebarPinObserver = null

function pinSidebarWidth() {
  const pane = sidebarPane.value
  if (!pane || !sidebarInner.value) return
  // 宽度取 rect 再四舍五入，不取 clientWidth：后者会把 663.99 截成 663，
  // 收尾那一帧就会把钉子钉在 663、下一帧再被 RO 改回 664 —— 白送一次 1px 的内容重排。
  // rect 是边框盒，.pane 恒为左右各 1px 边框，扣掉才是内容盒（= 内层该有的宽度）。
  const border = getComputedStyle(pane)
  const width = Math.round(
    pane.getBoundingClientRect().width -
      Number.parseFloat(border.borderLeftWidth) -
      Number.parseFloat(border.borderRightWidth),
  )
  // width 为 0 只会在整块被 v-show 收起时出现（题解全屏）。不能把 0 写进去：
  // 那会抹掉下次展开要用的那个宽度。
  if (!width) return
  sidebarInner.value.style.width = `${width}px`
  sidebarPinned.value = true
}

function syncSidebarPin() {
  // 折叠态不量：外层这时只有 1px（见样式表里 .pane--tests.is-collapsed），
  // 量了会把「展开要用的那个宽度」覆盖成 1px，下次展开就是一条缝。
  if (!panelVisible.value) return
  pinSidebarWidth()
}

function togglePanel({ instant = false } = {}) {
  // 四处不播动画，直接切：
  // - 调用方点名（题解全屏退出那一下整块布局是跳变的，没有可补间的起点，见 SHORTCUT_HANDLERS）；
  // - 系统开了「减弱动效」；
  // - 题解全屏还盖在上面（例如全屏里点运行，自动亮出评测面板但侧栏整块是藏着的）；
  // - 浏览器不支持 View Transitions（2026-10-14 拍板，见坑 46）：CSS 补间那条路在窄屏
  //   遮不住主轴翻转的跳变，与其留着一条「只在部分设备上好看」的动画，不如无 VT 就直切。
  const animate = !instant && !mdFullscreen.value && !reduceMotion.matches && canViewTransition()

  // View Transitions 路径：只翻一次状态，宽度 / 位置全交给浏览器按快照补间。
  // 好处是动画期间 DOM 一动不动（不逐帧改 flex-basis），Monaco 也就不会逐帧重排 ——
  // 原先那套「宽度伸缩 + 浮现」的 CSS 两段式、以及伺候「逐帧改宽度」的接缝 / 残留补丁，
  // 都随两段式一起删了。
  //
  // 两栏的 view-transition-name 在这里被摘掉，故意不让它们各自成组：
  // 命名元素会成为独立过渡组，而组盒子在改尺寸时会把快照位图拉过去（文字横向变形）。
  // 摘掉之后两栏并进 root 快照，root 的盒子恒等于整个应用、尺寸不变，只剩透明度补间，
  // 拉伸在结构上不可能发生。代价是整屏交叉淡化——旧布局（带侧栏）与新布局会同时叠印。
  if (animate) {
    // 翻状态前先把定宽壳退回流体：VT 只翻一次 DOM，而旧钉子（折叠时可能已被写成 1px）
    // 会被原样带进快照，反而把内容压扁。
    sidebarPinned.value = false
    if (sidebarInner.value) sidebarInner.value.style.width = ''
    // 摘名字必须发生在 startViewTransition 之前：旧快照就得不带名字，
    // 否则两栏仍各自成组、组盒子改尺寸那条拉伸路径照旧。
    setPaneTransitionNames('none')
    const transition = document.startViewTransition(() => {
      panelVisible.value = !panelVisible.value
      virtualShare = panelVisible.value ? editorShare.value : 100
      return nextTick()
    })
    // 收尾：先恢复名字（布局换边还要用），再把钉子校准回这一帧的实测宽度
    // （折叠到底时不钉，见 syncSidebarPin）。成功与失败两路都要走，否则名字会永久留在 none。
    const settled = () => {
      setPaneTransitionNames('')
      if (panelVisible.value) pinSidebarWidth()
    }
    transition.finished.then(settled, settled)
    return
  }

  // 直切：一步到位（闸门过不去的都是这一路）。只翻状态，不挂任何动画 class；
  // 钉子交给 RO 那条路补。
  panelVisible.value = !panelVisible.value
  virtualShare = panelVisible.value ? editorShare.value : 100
  nextTick(() => {
    // 拖拽态不用补：越界翻转期间 dragging 一直是真（见 handoffDrag）
    if (panelVisible.value) pinSidebarWidth()
  })
}

// 轻点的位移上限（与触摸端「轻点 / 滑动」的判定口径一致）：超过它算拖拽，不算轻点
const TAP_SLOP = 10

// 「单击分隔条 = 折叠 / 展开」的判定（2026-10-20 收紧，用户报「本是在拖动，却判定成点击」）。
// 手机端那条「按了没动就把占比原样退回」仍用上面的 TAP_SLOP；下面这三支只服务宽屏这条入口。
//
// 三条都过才算单击，任一条不过就按拖拽处理（拖拽不翻面）：
//   ① 横向位移 ≤ CLICK_SLOP —— **只量横向**：分隔条只做横向拖拽，纵向抖动不该被算成「动手了」。
//      鼠标 4px（点击抖动通常 ≤2px，仍有余量）；手指 / 笔沿用 10px —— 触屏点按的抖动本来就大，
//      压到 4 会让宽屏触控设备上「点一下收起」直接失灵。
//   ② 这一趟**真的改过面板宽**（> CLICK_WIDTH_EPS）—— 宽度跟手变过就是在拖。这条专治
//      「只挪了三四像素」：位移还在 slop 里，但面板已经被拖着变窄了，那就不是点击。
//   ③ 松手是 pointerup（pointercancel 一律不翻面，原样保留）。
//
// 为什么不用「按了多久」当判据：按住不动再松手仍然是点击意图，用时长卡它只会让「按一下想收起」
// 偶尔失灵；位移与宽度这两条已经把「在拖」这个意图分干净了。
const CLICK_SLOP_MOUSE = 4
const CLICK_SLOP_TOUCH = TAP_SLOP
// 宽度改动超过它才算「拖动过」：1px 是点击时按下点与松手点之间的常态抖动
const CLICK_WIDTH_EPS = 2

// 运行中照样能拖 / 能单击折叠（2026-10-18 去掉开头的 `if (running.value) return`）：
// 那条守卫是建仓时留下的，键盘方向键（nudgeShare）从来没有对应限制，于是同一段时间里
// 「按方向键能调宽、抓分隔条没反应」——编译一久（大数组带 vector 的用例可达 40s+）就只剩
// 干等。拖拽本身只写 dragPanelPx / editorShare，与 runCases 不共用任何状态；唯一要留意的
// 是运行中把侧栏收起来会看不见进度，但结果有 runNotify 那条常驻通知兜底。
function beginDrag(event) {
  const surface = workspace.value
  if (!surface) return
  // 取消 pointerdown 会按规范抑制兼容的 mousedown/mouseup，用来阻断从分隔条起手的
  // 原生文字选中拖拽；配合 .workspace.is-dragging 的 user-select: none 双保险。
  // 注意别指望别的浏览器也像 Chrome 那样把 click 补回来——宽屏的单击折叠 / 展开因此不依赖 click，
  // 而是在下面的 pointerup 上自己认（见 stop；**窄屏没有这个入口**，2026-10-13 起去掉）。
  event.preventDefault()
  let moved = 0
  // 横向位移单独记一份：宽屏的单击判定只看它（见 CLICK_SLOP_*），纵向抖动不算「动手了」。
  // `moved` 仍按两轴取大值 —— 窄屏那条「原样退回占比」沿用的是触摸端「轻点 / 滑动」口径。
  let dragDx = 0
  const startX = event.clientX
  const startY = event.clientY
  // 按下那一刻的占比：窄屏的「轻点」要原样退回去（见 finish），否则按在热区里会把面板顶宽十几像素
  const startShare = editorShare.value
  const limits = measureLimits()
  // 面板在右时，面板内容宽 = 容器右边界到鼠标的距离；在左则 = 鼠标到容器左边界。
  // 像素直连按下图换算，跟手不打折、不累计误差（多轮折叠展开后也不漂移）。
  const panelOnRight = panelPosition.value === 'right'
  // 按下那一刻「按同一套像素直连算出来的面板宽」，只用来判断这一趟有没有真的改过宽度（判据 ②）。
  // 它的绝对值偏不偏不重要：热区是整块铺在细线一侧的 24px 盒子，按下点未必落在线上，
  // 但那个偏移在首尾两端同时出现、相减即消 —— 比的是差值。
  const pressPanelW = Math.max(
    limits.minPanelPx,
    Math.min(limits.maxPanelPx, panelOnRight ? limits.contentRight - startX : startX - limits.left),
  )
  dragging.value = true
  // 新手势：可能上一次的越界翻转还卡在 pending 上（例如中途被别的入口翻了状态），一并清掉。
  dragLive = true
  handoffPending = false

  // 抓住指针。折叠边界（= 折叠宽度与最窄宽度的中点）落在图标栏那一带，
  // 松手时指针可能已压在窗口边框上、甚至跑到窗口外，这一发 pointerup 就可能到不了页面。捕获之后事件始终投给
  // 分隔条，松手才算数 —— 这是「松开左键还在拖」的正解，下面 move 里那条是它失灵时的兜底。
  const captureTarget = event.currentTarget
  if (captureTarget instanceof Element && captureTarget.setPointerCapture) {
    try {
      captureTarget.setPointerCapture(event.pointerId)
    } catch {
      /* 指针已经失效（例如按下瞬间就抬起），忽略即可 */
    }
  }

  const move = (moveEvent) => {
    // 兜底：只要收到一个「没按任何键」的移动，就当场收尾。buttons 对鼠标是按键位、
    // 对触摸是按住期间恒为 1，所以松手后的第一下晃动就会结束拖拽，
    // 不会再出现「已经松手，面板还跟着鼠标走」。
    if (moveEvent.buttons === 0) {
      stop(moveEvent)
      return
    }
    moved = Math.max(moved, Math.abs(moveEvent.clientX - startX), Math.abs(moveEvent.clientY - startY))
    dragDx = Math.max(dragDx, Math.abs(moveEvent.clientX - startX))
    // 面板目标内容宽（像素），由鼠标位置一次算到位
    const panelW = panelOnRight ? limits.contentRight - moveEvent.clientX : moveEvent.clientX - limits.left
    if (panelVisible.value) {
      // 展开态：[minPanelPx, maxPanelPx] 内是「可变宽」区间，面板严格 1:1 跟手；
      // 压到 minPanelPx 以下就是死区（钉在最窄不动），一直拖过 hingePx 才折叠 ——
      // hingePx 宽屏是「折叠后的分隔条位置」与「最窄时的分隔条位置」的中点，窄屏则是固定的
      // 30px 指针容差（见 NARROW_HINGE_PX），所以它是这条线上唯一的判据：比它窄就折叠
      //（侧栏在左时 = 指针往左越过它，在右时对称）。
      if (panelW <= limits.hingePx) {
        handoffDrag(false, limits)
        editorPane.value?.layout()
        return
      }
      dragPanelPx.value = Math.max(limits.minPanelPx, Math.min(limits.maxPanelPx, panelW))
    } else {
      // 折叠态：蓝线钉在折叠位置（死区），直到鼠标越过 hingePx 才展开 ——
      // 与上面同一条线、同一个方向判据，不会「折叠要拖到底、展开只要抬一点」。
      if (panelW >= limits.hingePx) handoffDrag(true, limits)
    }
    editorPane.value?.layout()
  }
  // 收尾：摘监听 + 手势态归位。越界翻转中途（handoffDrag）**不走这里** —— 那时监听还留着，
  // 好让光标反向再越回来时能接着翻（不然一次按住只能翻一下）。
  const finish = () => {
    // 松手：把最终像素宽反算回 editorShare%（一次舍入），再退出像素直连回到百分比流
    if (panelVisible.value && dragPanelPx.value !== null) {
      // 窄屏的「轻点」什么都该不做，所以这里原样退回按下时的占比：像素直连的落点是「指针到边缘
      // 的距离」（绝对量），而热区是一只 24px 的盒子、整个铺在细线**一侧**（侧栏在左时铺在右侧
      // `margin: 0 -20px 0 0`，在右时镜像到左侧，见样式表 .splitter），按在热区中间就等于把面板
      // 边缘当成指针 → 面板凭空宽十几像素并落盘。宽屏不必这么兜 ——
      // 那边轻点会整块翻面，这点宽度变化看不出来（且翻回来时落点由 togglePanel 决定）。
      // 分母是 **paneSpace**（内容宽 − 分隔条净占宽的 4px），不是 width：百分比 flex-basis 是按
      // 内容宽算的，而这一行里还要放下分隔条，于是每条 basis 都按自己的占比缩掉一点，
      // 面板那条少的正是 4 × 面板占比。老式子拿 width 当分母，等于把这段收缩算漏了 ——
      // 松手瞬间面板会当场窄 1~2px（实测 1400 宽：拖到 470.531 → 松手 469.172，差 1.36），
      // 就是用户报的「松手时有 1px 抖动」。
      // 舍入也一并收紧到 0.01%：0.1% 在 1400 宽上还有 ≤0.7px 的余量，松手照样看得见半像素位移。
      editorShare.value =
        isNarrowLayout() && moved <= TAP_SLOP
          ? startShare
          : Math.round((1 - dragPanelPx.value / limits.paneSpace) * 10000) / 100
      virtualShare = editorShare.value
    }
    dragPanelPx.value = null
    dragging.value = false
    dragLive = false
    handoffPending = false
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', stop)
    window.removeEventListener('pointercancel', stop)
  }
  const stop = (upEvent) => {
    // 判据 ② 必须在这里先算：下面 finish() 会把 dragPanelPx 清成 null
    const resized =
      dragPanelPx.value !== null && Math.abs(dragPanelPx.value - pressPanelW) > CLICK_WIDTH_EPS
    finish()
    editorPane.value?.layout()
    // 窄屏不给「单击分隔条 = 折叠 / 展开」这个入口（2026-10-13 用户要求「去掉窄屏模式里的
    // 点击拖拽线来折叠」）：窄屏的折点已经贴到离边缘 30px（见 NARROW_HINGE_PX），而分隔条停在
    // 最窄落点上，手指按住它稍一抖动就会被当成轻点、面板整块翻面。窄屏要收起请拖到底，
    // 或用底栏那枚箭头 / 图标栏那颗按钮 —— 那两条入口一直都有，与这里无关。
    if (isNarrowLayout()) return
    // 「单击」判定（2026-10-20 收紧，三条判据见 CLICK_SLOP_* 那段）：横向位移在 slop 内
    // **且**这一趟没真的改过面板宽，才算单击。拖到贴边那次折叠因此不会被松手这一下再翻回去。
    // 特意不看原生 click：pointerdown 里的 preventDefault 会抑制兼容鼠标事件，
    // 各浏览器补不补回 click 并不一致，所以在自己的 pointerup 上收口。
    if (upEvent.type !== 'pointerup') return
    const slop = upEvent.pointerType === 'mouse' ? CLICK_SLOP_MOUSE : CLICK_SLOP_TOUCH
    if (dragDx > slop || resized) return
    togglePanel()
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', stop)
  window.addEventListener('pointercancel', stop)
}

// ------------------------------------------------------------------ 运行逻辑
/**
 * 运行开始时的清场。**actualOutput / detail 刻意不清**（2026-10-23 改）：
 * 清掉的话 ACTUAL 会先跳回占位语「尚未运行」，上一轮输出高于框的最小高度时整张卡片
 * 先塌一截、新结果回来再长回去 —— 用户报的「点运行，侧边栏卡片闪一下」就是这个。
 * 上一轮的输出留着，等新补丁（applyPatch）落下来整份替换；运行中的身份由徽标
 * 「运行中」与圆点的涟漪交代，旧输出不会被误读成这一轮的结果。
 * verdict / durationMs 仍然要清：它们没有「留旧值」这个选项，留着就是假判定。
 */
function resetCase(item) {
  item.status = 'running'
  item.verdict = ''
  item.durationMs = null
  item.stale = false
}

// 引擎送回的补丁直接落到对应卡片上，界面不需要知道用的是哪个引擎
function applyPatch(target, patch, index) {
  Object.assign(target, patch, { stale: false })
}

/**
 * 这一组用例是不是「全过且结论新鲜」。
 *
 * status 之外还看 stale：改过代码之后，上一轮的 AC 已经不作数了（见下面那条
 * dirty → stale 的 watch），拿它凑「全过」会庆祝一份并没有真正验证过的代码。
 */
function isAllAccepted(list) {
  return Boolean(list?.length) && list.every((item) => item.status === 'passed' && !item.stale)
}

/**
 * 「全部样例都通过」才放的庆祝纸屑（services/confetti.js，2026-10-23 加；同日从
 * 「每张 AC 放一次」改成「整份提交全过才放一次」）。纸屑落在**样例面板整块**里
 * （`.panel__confetti`，见 TestPanel.vue），不是整页：这一栏就是「评测页」，庆祝落在这里。
 *
 * 判据只有一条：**手上这一组用例全部 `passed` 且不 stale**。所以它必须等整轮跑完再判，
 * 不能挂在 applyPatch 里逐张看 —— 逐张看只会得到「这一张过了」，那正是要改掉的旧行为。
 *
 * `runAll`（页脚 ▶ / ⌘·Ctrl+Enter）在这里调；逐张的 ▶ 走 `runOne` 里的
 * 「这一跑刚好凑齐全过」判断（2026-10-24 补：用户用逐张 ▶ 跑齐全过时也期望庆祝）。
 *
 * 中断（abort）的那次不庆祝：那种「全过」只是没跑完的假象。
 * 开关在 设置 › 评测（`cp.editorSettings.celebration`，默认开）。
 */
function celebrateIfAllPassed(list) {
  if (!editorSettings.value.celebration) return
  if (!isAllAccepted(list)) return
  celebrateAllPassed()
}

// 切到某个侧栏面板，并保证它看得见：折叠着就先展开（折叠时侧栏整栏不显示）。
// 折叠态那条图标栏与运行入口共用这一条路径，不写两套「展开 + 切面板」。
function selectSidebarPanel(id) {
  if (!panelVisible.value) togglePanel()
  sidebarRef.value?.showPanel(id)
}

// 运行入口有两处（⌘/Ctrl + Enter、评测面板页脚那颗 ▶），都并到 runAll 这一个出口。
// 跑之前先保证「看得到结果」：侧栏若收起了就展开，
// 若停在资源管理器就切到评测样例（已经在评测样例上则什么都不做，不影响页签持久化）
function revealTestsPanel() {
  selectSidebarPanel('tests')
}

// 快捷键版的「翻到另一个面板」。侧栏收起着就先把它捞回来 —— 否则按下去什么也看不见，
// 会被当成快捷键没生效。真正的翻面还是交给 Sidebar.vue 的 togglePanel（它负责动画与落盘）。
// instant 由调用方传（题解全屏退出那一下布局是跳变的，见 SHORTCUT_HANDLERS）。
function switchSidebarPanel({ instant = false } = {}) {
  if (!panelVisible.value) togglePanel({ instant })
  sidebarRef.value?.switchPanel()
}

/**
 * 运行闸门：只有认得出来的判题语言（C++ / Python）才跑得动。
 * 题解（.md）这类非代码文件 activeLanguage 是 null，引擎根本没有对应语言可编，
 * 于是把它变成**入口上的禁用态**而不是「点了没反应」——
 * 非空字符串即「不可运行」，这句话同时充当提示行文案与两个 ▶ 的 title。
 * 「一个文件都没打开」与「打开的不是代码」是两回事，别混成一句话说。
 */
const runBlockedReason = computed(() => {
  if (activeLanguage.value) return ''
  return activeNode.value ? t('tests.panel.runBlocked') : t('tests.panel.runBlockedNoFile')
})

/**
 * 一键提交到 Codeforces（2026-10-23 加）。
 *
 * 提交这件事本站自己做不了：提交页要 CSRF token、跨源也拿不到登录 cookie，
 * 所以动作整个交给浏览器扩展（见 services/ojSubmit.js 与 useCompanionBridge 的 requestSubmit）。
 * 这里只管三件事：判断按钮在不在 / 能不能按、发通知、把扩展回来的判定码翻成人话。
 *
 * 按钮只在**这一屏真的交得了**的时候出现（2026-10-23 改，用户要求：「如果无法提交，
 * 干脆就不要显示这个按钮，不要占用视觉」）。以前是「是题就显示、交不了置灰 + 页脚
 * 一行原因」—— 一颗永远灰着的按钮加一句「没装插件 / 不是 CF 题」，占着页脚，而那两样
 * 对绝大多数文件都用不上。现在交不了就整个不出现（连同那行原因一起收掉）。
 * ⚠️ 快捷键（Mod+Shift+Enter）没有「不出现」这个选项，按下去仍要能解释为什么没动静 ——
 * 所以 `submitBlocked` 保留，只给 requestSubmitConfirmation 那条路用，不再往面板里传。
 * ⚠️ 它**不能**先按 `shouldShowSubmit` 短路成空串：快捷键那条路要靠它拿到「没有文件 /
 * 不是题目 / 桌面端」这几句原因。短路之后 `requestSubmitConfirmation` 会把「交不了」
 * 当成「可交」，给普通文件弹出确认卡；`activeNode` 为 null 时还会在取 `node.id` 时抛错。
 * 按钮出不出现由下面的 `showSubmit` 单独判。
 *
 * 点按钮 / 按快捷键都**不直接提交**：先把目标记进 `pendingSubmit`、弹一张确认卡，
 * 点「确认提交」才真的发（2026-10-23 用户要求加确认；提交会在 Codeforces 上留一条
 * 删不掉的记录，误触的代价比多一次点击大）。确认前再核一次身份：弹窗开着时切了文件，
 * 宁可一条都不发，也不要把 A 的代码交到 B 的题上。
 *
 * 同一份源码重交时，确认卡换成「这份代码已经提交过」（2026-10-23 加）：CF 不生成提交
 * 记录，只把提交页刷回来并提示「You have submitted exactly the same code before」，
 * 扩展那头看到的只是「没跳到 /my」。指纹表在 services/ojSubmit.js（跨刷新保留），
 * 这里只负责把那一趟的结论带进确认卡、并在拒收时换一句具体的话。
 */
const submitting = ref(false)
const pendingSubmit = ref(null)
const confirmSubmitBtn = ref(null)
const cancelSubmitBtn = ref(null)

const submitBlocked = computed(() =>
  submitBlockedReason({
    node: activeNode.value,
    language: activeLanguage.value,
    capability: canSubmitCode.value,
    checking: extensionChecking.value,
  }),
)
const showSubmit = computed(() => shouldShowSubmit(activeNode.value) && !submitBlocked.value)

// 弹窗一出现就把焦点送到默认动作上：普通情形是「确认提交」（Enter 确认、Esc 取消）；
// 重复代码那一版默认落在「取消」—— 重交注定被拒，别让多按一下 Enter 就送出去
watch(
  () => pendingSubmit.value,
  (pending) => {
    if (!pending) return
    nextTick(() => (pending.duplicate ? cancelSubmitBtn.value : confirmSubmitBtn.value)?.focus())
  },
)

/** 门卫：能交才弹确认；交不了的那一屏没有按钮可点，按快捷键也得听一句解释 */
function requestSubmitConfirmation() {
  // 弹窗已经开着：再按一次不用叠第二张，也不用解释
  if (pendingSubmit.value) return

  // 运行 / 提交在途：按钮是灰的，但快捷键没有置灰态 —— 静默会被读成键位失灵
  if (submitting.value || running.value) {
    notify({
      type: 'warning',
      title: t('tests.submit.failedTitle'),
      message: t('tests.submit.busy'),
      duration: 5000,
    })
    return
  }

  if (submitBlocked.value) {
    notify({
      type: 'warning',
      title: t('tests.submit.failedTitle'),
      message: submitBlocked.value,
      duration: 5000,
    })
    return
  }

  const node = activeNode.value
  pendingSubmit.value = {
    id: node.id,
    name: node.name,
    duplicate: isDuplicateSubmission({ node, source: peekActiveContent() }),
  }
}

function cancelSubmit() {
  pendingSubmit.value = null
  // 键盘取消后焦点别掉到 <body>：回到那颗提交按钮（弹窗只会在它存在时打开）
  nextTick(() => document.querySelector('.panel .submit-inline')?.focus())
}

async function confirmSubmit() {
  const pending = pendingSubmit.value
  pendingSubmit.value = null
  if (!pending) return

  if (activeNode.value?.id !== pending.id) {
    notify({
      type: 'warning',
      title: t('tests.submit.failedTitle'),
      message: t('tests.submit.targetChanged'),
      duration: 5000,
    })
    return
  }

  await submitActiveFile({ duplicate: pending.duplicate })
}

/** 同一道题连着交两次时，只让最后那一条通知留下（旧提交的判定回来不许盖掉新的） */
let submitSeq = 0

/** 这些失败连 CF 的提交按钮都没点到，下一趟同样的代码不算重复 */
const NOT_DELIVERED_REASONS = new Set([
  'unsupported',
  'unsupported-url',
  'empty',
  'not-logged-in',
  'challenge',
  'problem-missing',
  'language-missing',
  'page',
  'no-tab',
  'rejected',
])

async function submitActiveFile({ duplicate = false } = {}) {
  // 确认卡可能开了一小会儿：这期间若已有运行 / 提交在跑，说清楚再收场 ——
  // 弹窗关掉却没有下文，用户会把它当成「已提交」
  if (submitting.value || running.value) {
    notify({
      type: 'warning',
      title: t('tests.submit.failedTitle'),
      message: t('tests.submit.busy'),
      duration: 5000,
    })
    return
  }

  // 弹窗可能开了一小会儿：这期间扩展被关掉 / 语言变了，末尾这道闸门还要再拦一次
  if (submitBlocked.value) {
    notify({
      type: 'warning',
      title: t('tests.submit.failedTitle'),
      message: submitBlocked.value,
      duration: 5000,
    })
    return
  }

  const node = activeNode.value
  const url = node.meta?.url
  // 指纹要取「这一趟真正发出去的那份」：往返期间用户可能继续改代码，
  // 回头再 peek 一次会把没交过的内容记成已提交
  const source = peekActiveContent()
  const tag = `submit:${node.path}`
  const seq = ++submitSeq

  // 提交号一到就查细节，和评测并行 —— contest.status 对老题目要 8 秒上下，
  // 等判定回来才查的话，通知多半已经到期了（耗时见 ojSubmit 的说明）
  const detail = { promise: null, value: null }
  const loadDetail = (submissionId) => {
    if (detail.value || detail.promise) return detail.promise ?? Promise.resolve(detail.value)
    if (!/^\d+$/.test(String(submissionId ?? ''))) return Promise.resolve(null)
    detail.promise = fetchSubmissionDetail({ url, submissionId }).then((value) => {
      detail.value = value
      detail.promise = null
      return value
    })
    return detail.promise
  }

  dismissByTag(tag)
  submitting.value = true
  notify({
    type: 'info',
    title: t('tests.submit.submitting'),
    message: node.name,
    duration: 0,
    tag,
  })

  const result = await submitActiveSolution({
    // 判定由扩展在 Codeforces 页内轮询推送（见 useCompanionBridge 的 cp-submit-status），
    // 常驻「提交中」到这一步才收；中间那条 testing 不算结果，继续等。
    onVerdict: (status) => {
      // testing 只是「评测机接单了」的中转，不是结果 —— 常驻那条「提交中」刚刚换成
      // 「已提交」，这里再弹一条「其他结果」只会是噪音
      if (status.verdict === 'testing') return
      void reportSubmitVerdict({ seq, tag, node, status, url, loadDetail })
    },
  })

  if (result.ok && result.submissionId) void loadDetail(result.submissionId)

  // 记指纹不看「这一趟还是不是最新的」：代码确实递到了 CF，只是被后来的提交抢了通知位
  if (result.ok || !NOT_DELIVERED_REASONS.has(result.reason)) rememberSubmission({ node, source })

  if (seq !== submitSeq) return
  submitting.value = false
  dismissByTag(tag)

  if (!result.ok) {
    notify({
      type: 'error',
      title: t('tests.submit.failedTitle'),
      // 用户是看过「这份代码提交过」的警告后坚持要交的：再回一句笼统的「被拒收」
      // 等于没回答他 —— 这里把重复这件事说死
      message:
        duplicate && result.reason === 'rejected'
          ? t('tests.submit.duplicateRejected')
          : submitReasonText(result.reason),
      duration: 6000,
      tag,
    })
    return
  }

  notify({
    type: 'success',
    title: t('tests.submit.submittedTitle'),
    message: result.submissionId
      ? t('tests.submit.submittedMessage', { id: result.submissionId })
      : t('tests.submit.submittedUnknown'),
    duration: 6000,
    tag,
  })
}

/** 内存按 Codeforces 界面的口径：1 MB 以上给一位小数，否则给 KB */
function formatMemory(bytes) {
  if (!(bytes > 0)) return ''
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`
}

/**
 * 判定通知的第二行：文件名 · 挂点 · 耗时 · 内存。
 *
 * 挂点 = passedTestCount + 1：CF 只告诉「过了几个」，失败的正是下一个。AC 时这个数
 * 就是总测试点数。CE 没有测试点，只报耗时（内存那栏 CF 自己也是空的）。
 */
function verdictDetailMessage(name, detail) {
  const notes = []
  const passed = detail.passedTestCount
  if (passed != null && detail.verdict === 'ac') {
    notes.push(t('tests.submit.detailPassed', { n: passed }))
  } else if (passed != null && detail.verdict !== 'ce') {
    notes.push(t('tests.submit.detailFailedOn', { n: passed + 1 }))
  }
  if (detail.timeConsumedMillis > 0) notes.push(`${detail.timeConsumedMillis} ms`)
  const memory = formatMemory(detail.memoryConsumedBytes)
  if (memory) notes.push(memory)
  return [name, ...notes].join(' · ')
}

/**
 * 判定到了：先把结论弹出来，再用官方 API 补「挂点 / 耗时 / 内存」，原地替换正文。
 *
 * 预取通常已经跑了有一会儿（提交号一到就发，见 submitActiveFile）。它若赶上评测还在跑，
 * API 里是 TESTING，映射不成判定码 → 这里是 null，判定既已终就再查一次。
 * 仍拿不到（群组 / 可见性 / 限流 / 网络）就维持扩展给的判定码那版。
 */
async function reportSubmitVerdict({ seq, tag, node, status, url, loadDetail }) {
  if (seq !== submitSeq) return
  dismissByTag(tag)

  const verdict = submitVerdictText(status.verdict)
  const id = notify({
    type: submitVerdictType(status.verdict),
    title: status.submissionId ? `#${status.submissionId} ${verdict}` : verdict,
    message: node.name,
    // 有提交号就有细节在路上（老题目要 10 秒上下，见 ojSubmit）：给足它在路上这段时间，
    // 细节一到再把时限重置回 8 秒 —— 否则通知会在补细节之前自己消失
    duration: status.submissionId ? 12000 : 8000,
    tag,
  })

  let detail = await loadDetail(status.submissionId)
  if (!detail && seq === submitSeq && status.submissionId) {
    detail = await fetchSubmissionDetail({ url, submissionId: status.submissionId })
  }
  // 等 API 这几秒里用户可能又交了一次，或者自己把这条关掉了 —— 两种都不该再动界面
  if (!detail || seq !== submitSeq) return
  updateNotification(id, {
    message: verdictDetailMessage(node.name, detail),
    duration: 8000,
  })
}

/**
 * 空态里那行「样例还没到」的提示。
 *
 * 判据是**当前文件是一道题**（meta.url 有值，说明它是抓下来的、不是用户自己建的）
 * 且样例还是空的 —— 用户自己写的新文件不该被塞一句「打开题目页会自动抓」。
 * 题目从哪来、抓得到抓不到，由 useCompanionBridge 那台状态机说了算。
 */
const emptyNotice = computed(() => {
  const node = activeNode.value
  if (!node?.meta?.url || testCases.value.length) return null

  // 桌面端没有浏览器扩展，也没有别的自动抓题通路（见 HANDOFF 第 14 节第 6 条）：
  // 那几句「打开题目页会自动抓」「没检测到插件」在那边全是假话，一句都不说。
  if (IS_DESKTOP) return null

  const state = autoScrapeState(node.meta.url)
  if (state === 'fetching') return { text: t('tests.empty.fetching'), tone: 'info' }
  if (state === 'failed') return { text: t('tests.empty.fetchFailed'), tone: 'warn' }
  // 握手已确认「没装插件」时给另一句实话：此时点题目链接也不会有人抓。
  // 握手还在路上（checking）时不急着下结论，先按正常文案显示，免得闪一下错话
  if (!extensionInfo.value && !extensionChecking.value) {
    return { text: t('tests.empty.awaitingNoExtension'), tone: 'warn' }
  }
  // 「还没到手」这句中间的「题目链接」是可点的：给 TestPanel 一个 url，让它拼出 <a>
  return {
    tone: '',
    url: node.meta.url,
    before: t('tests.empty.awaitingFetchBefore'),
    linkText: t('tests.empty.awaitingFetchLink'),
    after: t('tests.empty.awaitingFetchAfter'),
  }
})

async function runAll() {
  if (running.value) {
    abortController?.abort()
    return
  }
  if (!testCases.value.length) return
  // 兜底：入口已经按 runBlockedReason 置灰（含快捷键那条），这里再挡一次，
  // 保证「没有判题语言就绝不进编译」这条不依赖 UI 是否画对
  if (!activeLanguage.value) return

  revealTestsPanel()
  running.value = true
  abortController = new AbortController()
  const signal = abortController.signal
  // 评测结果通知（services/runNotify.js）挂在本文件名下：重跑即收掉上一条常驻
  // CE —— 结果好坏另说，反正待会会有新的一条来接替
  const entryPath = activeNode.value?.path
  if (entryPath) clearRunNotify(entryPath)
  // 运行前自动保存全部 dirty model，再取活跃文件快照
  await saveAll()
  const snapshot = peekActiveContent() ?? ''
  const queue = [...testCases.value]
  queue.forEach(resetCase)

  const left = await runCases({
    engine: engine.value,
    base: judgeBase.value,
    languageId: activeLanguage.value,
    entryPath,
    cases: queue,
    code: snapshot,
    timeLimitMs: effectiveTimeLimitMs.value,
    memoryLimitBytes: effectiveMemoryLimitBytes.value,
    signal: abortController.signal,
    onCase: applyPatch,
  })

  // 中途中断时，未跑到的卡片回到待运行，不留假的“运行中”。
  // 它们这一轮根本没有产出，上一轮的输出也不再是「这次的结果」——
  // 复位时留下的那一份在这里一并清掉，退回占位语（与引擎给的 cancelled 补丁同口径：
  // 那种卡片已经被补丁清过了，不会走到这个分支）。
  for (const item of testCases.value) {
    if (item.status !== 'running') continue
    item.status = 'idle'
    item.actualOutput = ''
    item.detail = ''
  }

  // 结果通知在状态归位后发。**必须用 queue 而不是 testCases.value**：用例回写
  // （flushCasesWrite → updateFileConfig → rebuildTree）会在运行途中把卡片对象
  // 整批换成新的一批，patch 落在 queue 持有的旧引用上 —— 读 testCases.value 会
  // 读到没跑过的新对象（实测 verdict 全空）。queue 与 patch 的落点是同一批引用。
  // 被中断（abort）的那次不弹 —— 中断几乎总紧跟着一次新的运行，弹一条半截的结果只会误导
  if (!signal.aborted) notifyRunOutcome({ path: entryPath, cases: queue })
  // 庆祝纸屑同理，且用 queue 而不是 testCases.value（理由同上一条）
  if (!signal.aborted) celebrateIfAllPassed(queue)

  running.value = false
  abortController = null
}

async function runOne(target) {
  if (running.value || !target) return
  if (!activeLanguage.value) return // 同 runAll：UI 已置灰，这里是兜底
  running.value = true
  const controller = new AbortController()
  // 与 runAll 同一套通知纪律：单跑也是「一次运行」，先收旧的常驻 CE，跑完发新的一条
  const entryPath = activeNode.value?.path
  if (entryPath) clearRunNotify(entryPath)
  // 逐张 ▶ 也可能把整组凑成全过（用户的实际用法）：先记下跑之前的样子。
  // 多样例时只有「这一跑刚好凑齐」才庆祝 —— 已经全过时重跑任意一张不再放，避免重复庆祝；
  // 单样例时不再拦：那一次运行本身就是整份提交，与页脚 runAll 的行为对齐（用户 2026-10-24 要求）。
  const queue = [...testCases.value]
  const wasAccepted = isAllAccepted(queue)
  const isSingleCase = queue.length === 1
  // 与 runAll 同一套清场口径（含「不清上一轮输出」那条），见 resetCase
  resetCase(target)
  try {
    await saveAll()
    await runCases({
      engine: engine.value,
      base: judgeBase.value,
      languageId: activeLanguage.value,
      entryPath,
      cases: [target],
      code: peekActiveContent() ?? '',
      timeLimitMs: effectiveTimeLimitMs.value,
      memoryLimitBytes: effectiveMemoryLimitBytes.value,
      signal: controller.signal,
      onCase: applyPatch,
    })
    if (target.status === 'running') target.status = 'idle'
    if (!controller.signal.aborted) {
      notifyRunOutcome({ path: entryPath, cases: [target] })
      // 中途切了文件就不放：庆祝的落点是「此刻这份文件的样例栏」。
      if ((!wasAccepted || isSingleCase) && activeNode.value?.path === entryPath && isAllAccepted(queue)) {
        if (editorSettings.value.celebration) celebrateAllPassed()
      }
    }
  } finally {
    running.value = false
  }
}

function addCase() {
  // 兜底：跑不了的活跃文件（题解这类非代码文件、或一个文件都没打开）页脚那颗「添加测试样例」
  // 已经置灰，快捷键 `new-case` 那条也一并挡在这里 —— 用例是写进活跃文件的 config.tests 的，
  // 加在一个根本跑不起来的文件上，只会凭空多出一份永远用不到的样例
  if (runBlockedReason.value) return
  testCases.value = [...testCases.value, createCase()]
  nextTick(() => {
    const list = workspace.value?.querySelector('.cases')
    if (list) list.scrollTop = list.scrollHeight
  })
}

function removeCase(target) {
  testCases.value = testCases.value.filter((item) => item.id !== target.id)
}

// ------------------------------------------------- 常驻评测通知的页签生命周期
// CE 通知常驻（tag = run:<路径>），「切换 / 关闭对应页签就收」在这里实现：
// - 切走：activeNode 变了，收掉**前一个**文件的；
// - 关页签 / 删文件：开着页签的路径集合里消失的那些，一并收。
// 两处都调 clearRunNotify（幂等），关活跃页签时两个 watch 会重复收一次，无害。
watch(
  () => activeNode.value?.path,
  (next, prev) => {
    if (prev && prev !== next) clearRunNotify(prev)
  },
)

// openTabIds 是原地 splice 的（workspaceStore.closeTab），watch 数组引用不会触发，
// 所以盯着拼接后的 id 串：内容变了才算变。路径在节点还在索引里时就要取走 ——
// 删文件走的 rebuildTree 会把节点一并清掉，那时就无从对号了。
let lastOpenPaths = []
watch(
  () => workspaceStore.openTabIds.join('\n'),
  () => {
    const paths = workspaceStore.openTabIds
      .map((id) => getNodeById(id)?.path)
      .filter(Boolean)
    for (const prev of lastOpenPaths) {
      if (!paths.includes(prev)) clearRunNotify(prev)
    }
    lastOpenPaths = paths
  },
  { immediate: true },
)

// 用户输入（dirty 集合变化）后，之前的判定不再可信，标成「待刷新」。
let staleTimer = 0
watch(
  () => modelManager.dirtyIds.size,
  () => {
    window.clearTimeout(staleTimer)
    staleTimer = window.setTimeout(() => {
      for (const item of testCases.value) {
        if (item.status !== 'idle' && item.status !== 'running') item.stale = true
      }
    }, 400)
  },
)

// ------------------------------------------------------------ 全局快捷键
// 键位表在 useShortcutManager 里（含持久化与冲突检测），这里只把动作 id 接上真正的函数。
// 下面这张 SHORTCUT_HANDLERS 是「在哪儿按都算」的那 7 条；另有两条**作用域受限**的
// （F2 重命名 / Delete 删除资源树节点）在它下面单独一张表里，理由见那里的注释。
// 监听挂在 window 的**捕获**阶段：Monaco 的键位服务挂在编辑器内部的 DOM 上，捕获是从外
// 往内走的，所以在 window 上就能先一步拦下按键并 stopPropagation，编辑器里也归这套表管。
const SHORTCUT_HANDLERS = {
  run: () => runAll(),
  // 与样例面板页脚那颗提交按钮同源（见 requestSubmitConfirmation）：先弹确认，
  // 交不了时它弹一条说明，不像按钮那样有置灰态可看
  'submit-solution': () => requestSubmitConfirmation(),
  // 全屏编辑时侧栏整块让位，这两条按下去什么也看不见 —— 先退出全屏再执行，
  // 免得看起来像快捷键失灵（与 runAll 里 revealTestsPanel 的思路一致）。
  // instant 取的是 exitFullscreen **之前**那个值：退出全屏是「编辑器从铺满跳回两栏」，
  // 那一下没有可补间的起点，再叠一层宽度动画只会是闪一下，所以这一趟走直切。
  'toggle-panel': () => {
    const instant = mdFullscreen.value
    exitFullscreen()
    togglePanel({ instant })
  },
  'switch-panel': () => {
    const instant = mdFullscreen.value
    exitFullscreen()
    switchSidebarPanel({ instant })
  },
  'toggle-layout': () => flipPanelPosition(),
  'new-case': () => addCase(),
  'open-settings': () => (settingsTab.active ? deactivateSettingsTab() : openSettingsTab()),
  // 生成图片：落在 EditorPane 里（那边持有 Monaco 实例与选区）。没有选区时导出整个文件，
  // 没开文件（或文件为空）时静默返回 —— 与右键菜单那一项同源
  'export-image': () => editorPane.value?.exportImage?.(),
}

/** 题解在编辑器里生效的那 14 条键位（注册在 Monaco，见 EditorPane 的 registerMarkdownActions） */
const MD_EDITOR_COMBOS = new Set(Object.values(MD_SHORTCUTS))

/**
 * 作用域受限的三条动作（重命名 / 删除 / ⌘·Ctrl+A 全选 资源树里的节点；重命名的键位按平台分岔，
 * macOS 是 Enter、其它平台 F2，见 useShortcutManager）：只有焦点在
 * **资源管理器那块面板**里时才生效（行上、或树的空白处都算 —— 见下面的 treeScopeFrom）。
 *
 * 为什么不放进 SHORTCUT_HANDLERS：上面那些都是「在哪儿按都算」，而这三条得先过一道闸门 ——
 * 尤其 Delete 不带修饰键、⌘/Ctrl+A 在编辑器里是「全选文本」，不设闸门的话在编辑器里按一下
 * 删字符 / 全选文本，就会顺手弹出删除确认框、或把整棵树选起来。
 * 闸门**必须拦在 preventDefault 之前**：不在资源管理器里时就整条放行，原生行为（删字符、退格、全选）照旧。
 *
 * 执行落在资源管理器里（`FileExplorer` 经 defineExpose 给出 startRename / requestDelete /
 * selectAllNodes），与右键菜单那两条**同源**。三条的作用对象都是**行 id**：落在某一行上就是那一行，
 * 落在树的空白处是 null —— 前两条那时由 FileExplorer 自己拿主选中那一行顶上（见 keyboardRowId），
 * 全选把「空白处」读成「焦点在根上」（见 folderContentIds）。
 * 树里的焦点与主选中的同步由 FileTreeItem 的点击 / 键盘各自完成（见 FileExplorer.onTreeFocus 的注释）。
 *
 * ⌘ / Ctrl + A 另有一条**指针优先**的判据（F2 / Delete 不看指针）：桌面端点开文件时焦点会被
 * EditorPane 抢进 Monaco，只看 DOM 焦点的话「点文件 → 马上 ⌘A」全选的是代码 —— 所以指针还在
 * 资源管理器里时按「焦点在文件上」算。细节见 treeScopeFrom / regionUnderPointer。
 */
const SHORTCUT_TREE_HANDLERS = {
  /** @param {string|null} rowId 见上：null = 焦点在树的空白处，交给 FileExplorer 定夺 */
  'rename-node': (rowId) => fileExplorer.value?.startRename(rowId),
  'delete-node': (rowId) => fileExplorer.value?.requestDelete(rowId),
  // 全选要的是「哪一行算焦点」：给到行 id，FileExplorer 拿它算**父文件夹里的内容**
  // （给 null = 焦点在树的空白处，那边读成「焦点在根上」，选根的内容）
  'select-all-nodes': (rowId) => fileExplorer.value?.selectAllNodes(rowId),
}

// ------------------------------------------------- 指针在哪一块（⌘/Ctrl+A 的区域判据）

/**
 * 指针当下停在哪一块，是 ⌘ / Ctrl + A 的**区域判据**（下面 regionUnderPointer）。
 *
 * 为什么 ⌘A 不能只看 DOM 焦点：桌面端点开一个还没打开过的文件时，EditorPane 会把焦点主动
 * 送进 Monaco（`if (!isTouchPointer()) instance.focus()` —— 为的是「点开就能直接打字」），
 * 于是「点文件 → 马上按 ⌘A」按 DOM 焦点判就成了「在编辑器里按的」，全选的是代码。
 * 用户 2026-10-12 报的正是这个；触屏不受影响（那边本来就不抢焦点，走 DOM 焦点那条老路）。
 *
 * 记账方式：只在鼠标移动时存两个数（`pointerType` 不是 mouse 的一律不记，触摸 / 笔不参与），
 * 按键那一刻用 `elementFromPoint` 现算 —— 不存「上一次点了哪」，因为用户要的就是
 * 「看鼠标现在在哪里」。
 */
let pointerX = Number.NaN
let pointerY = Number.NaN

/** @param {PointerEvent} event */
function onPointerMove(event) {
  if (event.pointerType !== 'mouse') return
  pointerX = event.clientX
  pointerY = event.clientY
}

/** 指针底下那个元素；没记过位置（纯键盘操作、触摸）或已经移出窗口时给 null。
 *  穿透浮层（覆盖式滚动条滑块 / 分隔条热区）取真正的内容元素 —— 不穿透的话，
 *  鼠标停在树右缘那一条上会被判成「不在任何一区」，⌘A 就退回 DOM 焦点判据了
 *  （判据与另两处同款，见 composables/contentHit.js）。 */
function pointerTarget() {
  if (!Number.isFinite(pointerX)) return null
  return contentElementAt(pointerX, pointerY)
}

/**
 * 指针停在哪个区：'explorer'（资源管理器面板）/ 'editor'（编辑区）/ null（别处、或没有指针）。
 *
 * 编辑区取 `.pane--editor` 而不是 `.monaco-editor`：设置 / 抽题也铺在这一栏里，指针停在
 * 它们上面同样算「不在文件树里」，⌘A 该原样放行（那边自己的输入框有自己的全选）。
 * 指针在两者之外（活动栏、页签栏、logo、浮层…）时返回 null —— 那是「不插嘴」，退回 DOM 焦点判据。
 */
function regionUnderPointer() {
  const el = pointerTarget()
  if (!el) return null
  if (el.closest('[data-panel="explorer"]')) return 'explorer'
  if (el.closest('.pane--editor')) return 'editor'
  return null
}

/**
 * 这一发按键算不算「在资源管理器里按的」？在就返回该动作作用于哪一行
 * （`{ rowId }`，落在空白处时为 null），不在就返回 undefined。
 *
 * 两类都要排掉：**可编辑元素**（内联新建那个输入框、以及内联重命名的输入框 —— 后者就在行
 * **内部**，不排掉的话改名时按 Delete 会删不掉字符、反倒弹出删除确认框），以及资源管理器之外
 * 的一切（编辑器、设置页…）。
 *
 * 作用域取 `[data-panel="explorer"]`（Sidebar 给两个面板标的那个属性），**不是**「落点必须在某一行上」：
 * 树的空白处也是资源管理器的一部分（点空白时容器自己拿到焦点，见 FileExplorer 的 onTreePointerDown），
 * 只认行的话「在空白处停一下再按 ⌘A」就整条失灵 —— 用户 2026-10-12 报的正是这个。
 * 隐藏的那个面板（v-show）里收不到事件，所以不必再判面板可不可见。
 *
 * **⌘ / Ctrl + A 例外**：它先看指针停在哪一块，指针说了算（桌面端）。
 * - 指针还在资源管理器里 → 按「焦点在文件上」算，且作用于**指针底下那一行**（点过哪一行
 *   指针就压在哪一行上；压在树的空白处 / 面板其他部位时给 null，由 FileExplorer 退回主选中，
 *   都没有就是「焦点在根上」）。这一条压过 DOM 焦点，因为 DOM 焦点可能已经被 EditorPane
 *   抢进了 Monaco。
 * - 指针在编辑区里 → 一律 `undefined`（放行）：这时 ⌘A 就是编辑器自己的「全选代码」。
 * - 指针在别处（或根本没有指针：纯键盘、触摸）→ 落回下面的 DOM 焦点判据。
 *
 * 为什么只给 ⌘A 开这个口子，重命名 / Delete 不看指针：Delete 不带修饰键，光标在代码里、
 * 指针恰巧搭在侧栏上时按一下 Delete 就成了「弹删除文件确认框」—— 那个方向的风险比收益大得多。
 * @param {KeyboardEvent} event
 * @param {string} actionId
 * @returns {{ rowId: string|null }|undefined}
 */
function treeScopeFrom(event, actionId) {
  if (actionId === 'select-all-nodes') {
    const region = regionUnderPointer()
    if (region === 'editor') return undefined
    if (region === 'explorer') {
      return { rowId: pointerTarget()?.closest('[data-tree-id]')?.dataset.treeId ?? null }
    }
  }

  const target = event.target
  if (!(target instanceof Element)) return undefined
  if (target.closest('input, textarea, select, [contenteditable]')) return undefined
  if (!target.closest('[data-panel="explorer"]')) return undefined

  // 重命名另加两道（2026-10-20）：它在 macOS 上的键位是**裸 Enter**，误触的代价是
  // 「在编辑器里按一下回车，树上的文件被改了名」。所以除了事件落点，还要求：
  //   ① `document.activeElement` 真的在树里 —— 焦点在编辑器 / 页签栏 / 顶栏时一律不认；
  //      不能只信 `event.target`：合成事件、或窗口刚被激活那一瞬，两者会对不上。
  //   ② 落点不是在按钮 / 链接上 —— 那类元素自己的 Enter 是「按一下」，不该被抢走。
  // Delete / ⌘A 不加这两道：它们的既有判据（焦点在树里、不在可编辑元素上）已经够用，
  // 擅自收紧会改变用户已经用顺手的行为。
  if (actionId === 'rename-node') {
    const active = document.activeElement
    if (!(active instanceof Element) || !active.closest('[data-panel="explorer"]')) return undefined
    if (target.closest('button, a, [role="button"]')) return undefined
  }

  return { rowId: target.closest('[data-tree-id]')?.dataset.treeId ?? null }
}

/** 这一发按键是不是发生在 Monaco 编辑器内部 */
function inMonacoEditor(event) {
  const target = event.target
  return target instanceof Element && target.closest('.monaco-editor') !== null
}

function onKeydown(event) {
  // 输入法组字期间的按键不算快捷键（否则拼音选词会被当成命令）
  if (event.isComposing) return
  // 提交确认弹窗打开时，键盘只归它自己：全局快捷键不执行，而且**带修饰键的站点组合要拦下来** ——
  // 否则 Enter 会落到当前聚焦的「确认提交」按钮上，Mod+Enter 反而把确认点掉。
  // 纯 Enter / Space（按钮激活）与 Esc / Tab（弹窗自己的键盘路径）必须放行；
  // ⚠️ 不能用「命中 actionForCombo 就拦」当判据：macOS 上裸 Enter 是「重命名」的别名，
  // 那样连确认按钮的回车都会一起吞掉（实测）。
  if (pendingSubmit.value) {
    const plainActivation =
      (event.key === 'Enter' || event.key === ' ') && !event.metaKey && !event.ctrlKey && !event.altKey
    if (!plainActivation && actionForCombo(comboFromEvent(event))) {
      event.preventDefault()
      event.stopPropagation()
    }
    return
  }
  // 正在录制快捷键：全局这条在捕获阶段，永远早于录制框自己的监听，得主动让路
  if (recordingActive.value) return

  const combo = comboFromEvent(event)
  const actionId = actionForCombo(combo)

  // 编辑器优先。题解里 ⌘B（加粗）与 ⌘⇧E（行内代码）和全局的「收侧栏」「翻侧栏面板」
  // 撞了同一个组合，而这条监听在捕获阶段，拦下来 Monaco 就永远收不到 ——
  // 所以焦点在编辑器的题解里时那 14 条一律不拦，原样放行给 Monaco 按 precondition 处理。
  // 让路的判据取「焦点在编辑器里」而不是「活跃文件是 .md」：在题解旁边摸着测试面板按 ⌘B，
  // 该收的还是侧栏；只有真在写字的时候，⌘B 才是加粗（VS Code 也是这个口径）。
  if (mdActive.value && inMonacoEditor(event) && MD_EDITOR_COMBOS.has(combo)) return

  // ⌘\ 轮换视图模式。它改的是「编辑区怎么摆」，与光标在哪无关，所以没跟着上面那 14 条
  // 进 Monaco：切到「仅预览」时编辑器整块被藏起来、焦点已经不在里面，Monaco 就再也收不到
  // 那一发了（走出去回不来）。作用域照样钉在题解上，只是判断从「焦点在编辑器里」换成
  // 「活跃文件是 .md」。用户要是把这个组合显式绑给了别的动作，以那条为准。
  if (mdActive.value && combo === MD_VIEW_SHORTCUT && !actionId) {
    event.preventDefault()
    event.stopPropagation()
    cycleMdView()
    return
  }

  // 作用域受限的三条（重命名 / Delete / ⌘·Ctrl+A）：不在资源管理器里就整条放行，不拦原生行为
  if (actionId && SHORTCUT_TREE_HANDLERS[actionId]) {
    const scope = treeScopeFrom(event, actionId)
    if (!scope) return
    event.preventDefault()
    event.stopPropagation()
    SHORTCUT_TREE_HANDLERS[actionId](scope.rowId)
    return
  }

  const handler = actionId ? SHORTCUT_HANDLERS[actionId] : null
  if (!handler) return
  event.preventDefault()
  // 拦住后续传播：既不让 Monaco 再按自己的内置键位处理一遍（如 Ctrl+Enter 会在下方插入一行），
  // 也不让页面里其它监听重复响应
  event.stopPropagation()
  handler()
}

// ------------------------------------------------------- 浏览器扩展导入题目
// 扩展推来的题目由 problemImport 落进 VFS，并顺手把编辑器切过去；评测面板里的样例
// 由上面那条跟随 activeNode 的重载负责 —— 抓来的 tests 就在这个文件的 config 里。
// 这里只补一脚：若这道题本就开着、activeId 没变，EditorPane 的 watch 不响，
// 得自己把焦点抢回编辑区。
useCompanionImport({
  onImported: () => editorPane.value?.focus(),
})

// ------------------------------------------------------- 从系统里拖文件进来
/**
 * 外部文件拖在页面上的那段时间，把侧栏临时撑开（2026-10-13 用户定）。
 *
 * 【为什么要它】「拖进来」这件事本身没有落点可言 —— 落点是**指针此刻压在哪个目录上**，
 * 而那只在资源管理器里看得见（树上的落点高亮就是它）。所以拖入期间把侧栏整个亮出来、撑到
 * 最宽，让「要落到哪儿」有个明白的语境；一松手（或是拖出窗口）就原样还回去 ——
 * 不接管用户原本的折叠状态、面板、宽度。
 *
 * 【只做三件事】亮出侧栏、切到资源管理器、把占比压到 `MIN_SHARE`（= 面板最宽 76%）。
 * 三件都复用现成的出口（`togglePanel` 的直切路径 / Sidebar 的 `showPanel`），
 * 不另开一套「临时布局」——临时态就只活在下面这个闭包变量里，不进持久化。
 *
 * `dropRestore` 非空即「已经记过原样」：拖出去再拖回来不该把临时态当成原样记下来
 * （那样一松手就再也回不到用户自己那一版了）。
 */
let dropRestore = null

function previewDropTargetLayout(on) {
  const sidebar = sidebarRef.value
  if (on) {
    if (dropRestore) return
    dropRestore = {
      visible: panelVisible.value,
      share: editorShare.value,
      // 当前停在哪一块：Sidebar 经 defineExpose 透上来的那张表，取不到就给默认值
      panel: sidebar?.panels?.find((item) => item.active)?.id ?? 'explorer',
    }
    if (!panelVisible.value) togglePanel({ instant: true })
    sidebar?.showPanel('explorer')
    editorShare.value = MIN_SHARE
    // virtualShare 是方向键 / reclamp 的「虚拟比例」，不跟 editorShare 自动走；
    // 不在这里同步的话，还原前按一下方向键会从旧值起算、猛跳一段
    virtualShare = MIN_SHARE
    return
  }
  if (!dropRestore) return
  const saved = dropRestore
  dropRestore = null
  editorShare.value = saved.share
  virtualShare = saved.share
  if (saved.visible !== panelVisible.value) togglePanel({ instant: true })
  sidebar?.showPanel(saved.panel)
}

/**
 * 拖入导入的结果播报：走**全局通知**，不走资源管理器里那条行内横幅。
 *
 * 换掉横幅有两个理由：① 这一趟的收尾就是把侧栏还回原样（可能整块收起、也可能切回评测面板），
 * 横幅挂在资源管理器里，那时压根看不见；② 「放在什么位置」是这条通知的重点 ——
 * 侧栏还原之后屏幕上不再有落点的痕迹，只剩这句话交代文件去了哪儿。
 *
 * @param {{ kind: 'done'|'empty'|'failed', path: string, imported?: number, skipped?: number, message?: string }} result
 */
function reportDropImport({ kind, path, imported = 0, skipped = 0, message = '' }) {
  if (kind === 'empty') {
    notify({ type: 'warning', title: t('explorer.transfer.importEmpty'), duration: 5000 })
    return
  }
  if (kind === 'failed') {
    notify({ type: 'error', title: t('explorer.transfer.importFailed'), message, duration: 5000 })
    return
  }
  notify({
    type: 'success',
    title: t('explorer.transfer.dropDoneTitle'),
    message: t(skipped ? 'explorer.transfer.dropDoneSkipped' : 'explorer.transfer.dropDone', {
      n: imported,
      where: path === '/' ? t('explorer.transfer.whereRoot') : path,
      k: skipped,
    }),
    duration: 5000,
  })
}

/**
 * 外部文件拖进页面后的落地：写进工作区，再按规矩决定要不要顺手打开它。
 *
 * 落点由 usePageDrop 算好（第一个参数就是**目标目录的绝对路径**）：压在资源管理器里的某一行上
 * 就是那个目录，别处一律根目录 —— 整页都是落点。导入本身落在资源管理器里
 * （`importDroppedItems`，与页头那两颗「导入」按钮**同源**），这条只管
 * 「拖进来的是谁、要不要接着开、结果怎么报」。
 *
 * 「恰好一个文件就打开它」（2026-10-12 用户拍板）：拖文件夹、或一次拖多个文件，只导入不开页签，
 * 免得一下冒出几十个。拖进来的若是文件夹，`items` 里每一项都至少带一层路径
 * （`chapter1/a.cpp`），所以用「不带斜杠」认出「这就是单独一个文件」。
 *
 * @param {string} targetPath 目标目录的绝对路径（'/' = 根目录）
 * @param {import('./services/fileTransfer.js').ImportItem[]} items
 */
async function importDroppedFiles(targetPath, items) {
  const stats = await fileExplorer.value?.importDroppedItems(targetPath, items, {
    announce: reportDropImport,
  })
  if (!stats?.firstId) return
  if (items.length === 1 && !items[0].rel.includes('/')) editorPane.value?.openNode(stats.firstId)
}

/** 全应用只挂一次：窗口级的 dragenter / dragover / drop（判定与落点见 composables/usePageDrop.js） */
const { active: dropActive } = usePageDrop({ onFiles: importDroppedFiles })

// 拖入期间撑开侧栏看落点、离开（或落定）还原：见 previewDropTargetLayout
watch(dropActive, previewDropTargetLayout)

// 空态提示要按「插件装没装」分岔：attach 是幂等的，这里只为读全局状态
const { extensionInfo, checking: extensionChecking, canSubmitCode } = useCompanionBridge()

// 安装引导（装成应用 / 装插件）的开机自动弹一次：不画东西，只在这里挂上计时与监听。
// 放在这一行下面是有意的 —— 它要读的就是上面那份插件状态，早于 attach 评估会读到「没装」。
useInstallGuides()

// 「改了某个设置 → 带撤回的通知」的监听（全站唯一，也不画东西）：挂在模块级设置单例上，
// 面板、齿轮菜单、快捷键改的都在内。见 services/settingsUndo.js。
initSettingsUndo()

// ------------------------------------------------------------ 自动保存
// 只剩两个离开时点要挂在这里：窗口失焦、页面切到后台。
// 不用 beforeunload —— 卸载时异步写 IndexedDB 大概率来不及，visibilitychange 才可靠。
let disposeAutoSave = null
function onWindowBlur() {
  void flush()
  // 面板里刚敲下去的用例也一并算清：点刷新按钮会先触发 window blur，
  // 那 500ms 的防抖窗口里不该丢掉最后一笔
  flushCasesWrite()
}
function onVisibilityChange() {
  if (document.hidden) void flush()
}

onMounted(async () => {
  // 上一次动作寄下的那条通知（云端导入 / 登录成功会整页刷新，通知只能先寄存 —— 见
  // services/notifications.js 文件头那条例外）。放在第一行：它说的是「你刚做完的那件事」，
  // 越早露面越像是紧接着上一步发生的。
  flushFlashNotification()
  // Android 端先把随包编译器解到应用目录（首次几秒，之后瞬间返回）。**刻意不 await**：
  // 它只是把文件铺好，不参与下面任何一步；界面由 ToolchainGate 按状态铺遮罩。
  // 非 Android 上是空调用（见 nativeToolchain.js），桌面端与网页版都不受影响。
  void prepareNativeToolchain()
  // 捕获阶段：见上面 onKeydown 的说明（要抢在 Monaco 之前）
  window.addEventListener('keydown', onKeydown, true)
  // 只为了记下指针位置（⌘/Ctrl+A 的区域判据），被动监听、每次只写两个数
  window.addEventListener('pointermove', onPointerMove, { passive: true })
  // 订阅编辑事件（回调是运行时读集合，所以早于 / 晚于 model 创建都不影响）
  disposeAutoSave = initAutoSave()
  window.addEventListener('blur', onWindowBlur)
  document.addEventListener('visibilitychange', onVisibilityChange)
  // 初始化 VFS（含旧草稿迁移）→ 恢复上次会话的 tab 与 model
  try {
    await initWorkspace()
    await initWorkspaceStore()
  } catch {
    /* 存储不可用时静默；界面仍可使用 */
  }
  // 云配置的两条入口都在 confirmCloudEntry 里，这一次调用同时照顾它们：
  // - 地址里带了 /<handle> → 先确认云端有没有这份配置，再决定要不要打开设置页；
  //   云端没有配置时会把地址抹回根路径、只弹一句提示，这里就不开设置页。
  // - 地址里没有 handle → 本机记着「上次跟的是谁」就用谁，静默对齐（可能刷新页面），
  //   不会打开设置页，也不需要用户点头。
  // 必须等上面两步跑完：会话恢复会把 workspace.activeId 设回上次那个文件，而 editorViews 的
  // 规矩是「活跃文件一变就让开」（见 editorViews.js 末尾那个 watch），早开一步会被紧接着的
  // 这次变更立刻关掉。识别在 main.js 里做了（地址保持原样不抹，见 cloudEntry.js）。
  // **刻意不 await**：这一步要发一个网络请求，卡在这里会把下面三件事一并推迟到它回来之后
  // （网络一直不回来就永远轮不到）。它只要求排在会话恢复之后，排在下面那几行前还是后无所谓
  // —— 下面几行都不改两个面板的宽度。
  void confirmCloudEntry().then((open) => {
    if (open) openSettingsTab()
  })
  // 首帧排版稳定后先收敛一次（视口很窄时连默认的 60 都可能越界），之后交给 ResizeObserver
  // 盯住视口尺寸变化（它自己也会立刻回调一次，走 debounce 那条路）。
  nextTick(reclampShare)
  layoutObserver = new ResizeObserver(scheduleReclamp)
  if (workspace.value) layoutObserver.observe(workspace.value)
  // 侧栏那层定宽壳跟着外层宽度走（见 pinSidebarWidth）；observe 会立刻回调一次，
  // 紧接着的这次调用是为了首帧就有钉子（回调要等下一帧）
  sidebarPinObserver = new ResizeObserver(syncSidebarPin)
  if (sidebarPane.value) sidebarPinObserver.observe(sidebarPane.value)
  // 走 syncSidebarPin 而不是直接 pin：首帧就是折叠态时（外层只有 1px）不能把钉子钉上去
  syncSidebarPin()
  // 「本地运行环境」里勾了预下载的，等浏览器空闲再悄悄补齐（见 runtimePreload.js）
  scheduleAutoPreload()
  // 趁早申请存储持久化：IndexedDB 默认是 best-effort，存储吃紧时浏览器能静默清掉
  // 整个源（也就是用户的全部代码）。**刻意不 await** —— 它要等浏览器回话，而 Chrome 之外
  // 多半还要用户手势才批，卡在这里没意义。这是隐性申请：拿不到就算了，界面上不展示状态
  // 也不给按钮（设置 › 应用 只报占用）。
  void requestPersistence()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown, true)
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('blur', onWindowBlur)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  disposeAutoSave?.()
  disposeAutoSave = null
  window.clearTimeout(staleTimer)
  window.clearTimeout(reclampTimer)
  abortController?.abort()
  layoutObserver?.disconnect()
  layoutObserver = null
  sidebarPinObserver?.disconnect()
  sidebarPinObserver = null
})
</script>

<template>
  <div
    class="app"
    :class="{ 'is-keyboard': keyboardMode, 'is-short': shortViewport, 'is-typing': keyboardUp }"
  >
    <!-- 临时调试读数条：定位 Android 上「收键盘后点哪都回到输入框」，验完与本行一起删 -->
    <div v-if="IS_ANDROID" class="focus-probe">{{ focusProbe }}</div>
    <main
      ref="workspace"
      class="workspace"
      :class="[
        `is-${panelPosition}`,
        `is-fold-${narrowCollapseSide}`,
        { 'is-dragging': dragging, 'is-collapsed': !panelVisible },
      ]"
    >
      <section class="pane pane--editor" :style="editorPaneStyle">
        <EditorPane
          ref="editorPane"
          :settings="editorSettings"
          :panel-position="panelPosition"
          :time-limit="timeLimitMs"
          :memory-limit="memoryLimitBytes"
          :judge="judgeSettings"
          :connection="connection"
          :ui-scale="uiScalePref"
          @update:settings="updateEditorSettings"
          @update:time-limit="timeLimitMs = $event"
          @update:memory-limit="memoryLimitBytes = $event"
          @update:ui-scale="uiScalePref = $event"
          @toggle-layout="flipPanelPosition"
          @select-engine="selectEngine"
          @update-base="updateBase"
          @test-connection="testConnection"
        />
        <!-- 全站通知（toast）：锚在编辑区右下角（容器 absolute，含块 = 本栏）。
             不用视口右下角：侧边栏可停靠右侧，浮层会盖在侧栏上。
             入口只有 services/notifications.js 的 notify()，谁都能发 -->
        <NotificationCenter />
      </section>

      <!-- 折叠态的分隔条上不再画那三点抓手（2026-10-22 用户要求去掉，见样式表里
           .splitter__line 上面那段说明）：这里只剩热区与一条悬停才显影的线。 -->
      <div
        v-show="!mdFullscreen"
        class="splitter"
        role="separator"
        aria-orientation="vertical"
        :aria-valuenow="Math.round(editorShare)"
        :style="{ order: 2 }"
        tabindex="0"
        @pointerdown="beginDrag"
        @keydown.left.prevent="nudgeShare(-2)"
        @keydown.right.prevent="nudgeShare(2)"
      >
        <span class="splitter__line"></span>
      </div>

      <!-- 统一侧边栏：资源管理器与评测样例合并成一个页签容器，
           整体仍按原来的 .pane--tests 参与分屏拖拽与折叠（宽度 / 阈值逻辑不变） -->
      <!-- 折叠态留在排版里、宽度收到 1px（见样式表里 .pane--tests.is-collapsed）。
           View Transitions 靠「旧快照 vs 新快照」做补间，display:none 的元素没有旧快照，
           展开会退化成凭空出现，所以折叠态必须有个（哪怕很小的）盒子。 -->
      <section
        ref="sidebarPane"
        v-show="!mdFullscreen"
        class="pane pane--tests"
        :class="{ 'is-collapsed': !panelVisible }"
        :style="testsPaneStyle"
      >
        <!-- 定宽壳：宽度由 pinSidebarWidth 钉住，宽度变化时内部的排版一动不动
             （is-fixed 只在量到过一次真实宽度后才上，见那里） -->
        <div ref="sidebarInner" class="pane__inner" :class="{ 'is-fixed': sidebarPinned }">
          <!-- panel-position 只给窄屏底部那颗「收起侧栏」用：它据此决定箭头朝哪边、贴哪一端。
               collapse 走 togglePanel() 而不是 togglePanel —— 后者会吃到事件对象、
               把它当成 { instant }（truthy）而不播动画。 -->
          <Sidebar ref="sidebarRef" :panel-position="panelPosition" @collapse="togglePanel()">
            <template #explorer>
              <FileExplorer ref="fileExplorer" />
            </template>
            <template #tests>
              <TestPanel
                :cases="testCases"
                :running="running"
                :elapsed="elapsed"
                :run-blocked="runBlockedReason"
                :notice="emptyNotice"
                :show-submit="showSubmit"
                :submitting="submitting"
                @add="addCase"
                @remove="removeCase"
                @run-one="runOne"
                @run-all="runAll"
                @submit="requestSubmitConfirmation"
              />
            </template>
          </Sidebar>
        </div>
      </section>

      <!-- 折叠后顶替侧栏的竖向图标栏（仿 VS Code 的 Activity Bar）：只在侧栏收起时出现，
           装在侧栏那一侧的最外侧（order 见 activityBarStyle）。展开时页头里仍是胶囊 + 齿轮那套，
           两者不会同时出现，所以入口没有重复。它与 .pane--tests 都参与分屏：固定 48px、
           不参与增长（编辑器是唯一 grow 的，剩下的宽度全归它）。
           显隐只认状态：动画交给 View Transitions，它出现在不在都由快照自己比。 -->
      <ActivityBar
        v-show="!panelVisible && !mdFullscreen"
        :class="{ 'is-collapsed': !panelVisible }"
        :style="activityBarStyle"
        :panels="sidebarPanels"
        :panel-position="panelPosition"
        @select="selectSidebarPanel"
      />
    </main>

    <!-- Android 端首次准备随包编译器时的等待遮罩（固定定位，不参与上面的排版） -->
    <ToolchainGate />

    <!-- 悬浮倒计时卡：常驻挂载，显隐只看 services/countdown.js 里的 open；
         位置/计时跨刷新保留，入口在齿轮菜单的「倒计时」 -->
    <CountdownCard />

    <!-- 提交确认：点页脚那颗提交 / 按 Mod+Shift+Enter 都先停在这里，点「确认提交」
         才真的发。与删除确认同款自绘卡片（不用 window.confirm，理由见 FileExplorer
         的 requestDelete），Teleport 到 body 只依赖主题变量。
         点遮罩 / Esc = 取消。同一份代码重交时换一版文案（CF 必然拒收），默认焦点
         落在「取消」上；普通情形落在「确认提交」上。纯键盘两种都能走完。 -->
    <Teleport to="body">
      <div v-if="pendingSubmit" class="confirm" @pointerdown.self="cancelSubmit">
        <div
          class="confirm__card"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="submit-confirm-title"
          :aria-describedby="pendingSubmit.duplicate ? 'submit-confirm-desc' : undefined"
          @keydown.esc.stop.prevent="cancelSubmit"
        >
          <p
            id="submit-confirm-title"
            class="confirm__title"
            :class="{ 'confirm__title--warn': pendingSubmit.duplicate }"
          >
            {{
              pendingSubmit.duplicate
                ? t('tests.submit.duplicateTitle')
                : t('tests.submit.confirmTitle', { name: pendingSubmit.name })
            }}
          </p>
          <p v-if="pendingSubmit.duplicate" id="submit-confirm-desc" class="confirm__desc">
            {{ t('tests.submit.duplicateDesc', { name: pendingSubmit.name }) }}
          </p>
          <div class="confirm__actions">
            <button ref="cancelSubmitBtn" type="button" class="confirm__btn" @click="cancelSubmit">
              {{ t('app.cancel') }}
            </button>
            <button
              ref="confirmSubmitBtn"
              type="button"
              class="confirm__btn confirm__btn--primary"
              @click="confirmSubmit"
            >
              {{ pendingSubmit.duplicate ? t('tests.submit.duplicateAction') : t('tests.submit.confirmAction') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  /* 独立应用里页面铺满整屏（viewport-fit=cover），用安全区内边距把内容让开圆角与
     Home 指示条；浏览器里这几个值都是 0，桌面端布局不受影响 */
  padding: env(safe-area-inset-top) env(safe-area-inset-right) 0 env(safe-area-inset-left);
}

/* 键盘弹起时贴着底边的是键盘，Home 指示条被盖住，底部安全区不用再让出来 */
.app:not(.is-keyboard) {
  padding-bottom: env(safe-area-inset-bottom);
}

/* 触摸屏（默认开启，鼠标设备上 .app 不带这个类）：键盘弹起来之后，看得见的只剩
   「可视视口」那一截，而 100% 量的是布局视口（iOS 上它不跟着键盘缩），所以整块应用
   改挂到 visualViewport 实测出来的范围上（--vvh / --vv-top 由 useMobileKeyboard 写）。
   用 fixed + top 是为了连「可视区被顶上去」的那段偏移一起对上，
   否则底部会被键盘盖住。left/right 归零让宽度仍跟视口走，两栏是 flex 会自己重排。 */
.app.is-keyboard {
  position: fixed;
  top: var(--vv-top, 0px);
  left: 0;
  right: 0;
  height: var(--vvh, 100%);
}

/* 临时调试读数条（只在 Android 显示）：定位「收键盘后点哪都回到输入框」，验完即删 */
.focus-probe {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 9999;
  padding: 2px 4px;
  background: var(--bg-input);
  border-bottom: 1px solid var(--border);
  color: var(--ok);
  font-family: ui-monospace, monospace;
  font-size: 11px;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
}

.workspace {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  /* 布局对调只发生在这里 */
  flex-direction: row;
  /* 四周留白 6px + 两栏之间 4px 空隙（分隔条负外边距后剩下的部分，见 .splitter）：
     两块卡片浮在底色上 */
  padding: 6px;
  background: var(--bg-editor);
  /* 统一侧边栏（原评测面板所在的「测试栏」）最低宽度的三个参数。JS 的拖拽上限
     （measureLimits）读的就是这三个变量，同一个数字不在样式和脚本里各写一份。
     变量名保留 --tests-* 是历史沿革，现在约束的就是这个统一侧边栏。
     宽屏封顶 240px（原来 320px，为了让侧边栏能拖得更窄）；
     窄屏按内容宽的 50% 收缩 —— 侧边栏与编辑器各占一半，两边都还能用；
     地板 160px 是实测硬底：再窄卡片头部就开始横向溢出。
     240px 能成立的前提是卡片头部在窄容器下会让步：间距收紧，徽标图标与「结果待刷新」
     按容器宽度逐级让位（每例的运行耗时始终保留，见 TestCaseCard.vue 的 @container 规则），
     所以头部不会是「谁都不肯缩、最后叠在一起」。

     三个值都是「100% 下的设计值」，刻意留在 px（见 vite.config.js 的 propList 排除名单）：
     JS 要 parseFloat 它们做拖拽数学，转成 rem 会读成 15 而不是 240。代价是 rem 自动缩放
     带不动它们，所以使用处（下面的 .pane--tests 与 App.vue 的 measureLimits）各乘一次
     --ui-scale / scale 来补偿。ratio 是比例、不乘。 */
  --tests-min-cap: 240px;
  --tests-min-ratio: 0.5;
  --tests-min-floor: 160px;
}

/* 换边始终用 row，靠 order 换序（不用 row-reverse：那会把两栏一起甩到另一边） */

/* 两块独立的圆角卡片容器：overflow:hidden 让内部方角（Monaco 画布、
   面板页头页脚）被圆角裁掉，卡片边界才干净。
   圆角与活动图标栏（ActivityBar 的 .activity-bar）必须同值：侧栏收起时
   那张卡会顶到编辑器左边，不同值会在折叠/展开之间露出两种圆角。 */
.pane {
  min-width: 0;
  display: flex;
  overflow: hidden;
  border-radius: 10px;
  border: 1px solid var(--border-soft);
  background: var(--bg-panel);
}

/* 子组件默认 flex: 0 1 auto 会收缩到内容宽度，必须拉伸才能撑满所属栏位 */
.pane > * {
  flex: 1 1 auto;
  min-width: 0;
}

/* 侧栏那层定宽壳（见上面的 pinSidebarWidth）。默认是流式的，与直接放 Sidebar 时没有区别；
   量到过真实宽度之后换成定宽（is-fixed），宽度由 JS 逐帧或冻结地写着 ——
   外面的 .pane 自带 overflow: hidden，多出来的部分会被裁掉，内部排版不动。
   拖分隔条时退回流式：那种场合内容就该逐帧跟着宽度重排，否则会落后一帧、看着发粘。 */
.pane__inner {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.pane__inner > * {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
}

.pane__inner.is-fixed {
  flex: 0 0 auto;
}

.workspace.is-dragging .pane__inner.is-fixed {
  flex: 1 1 auto;
}

/* 两栏 flex-basis 之和恒为 100%（右栏 basis 由 App 内联写为 100 - editorShare）：
   basis 之外若还留出剩余空间，会被两栏的 flex-grow 平分，
   于是分隔条只以一半幅度跟手。 */
.pane--editor {
  flex: 1 1 60%;
  /* 通知 toast（NotificationCenter）的含块：absolute 锚在本栏右下角，
     侧边栏无论停靠左 / 右都不会被浮层盖到 */
  position: relative;
  view-transition-name: pane-editor;
}

.pane--tests {
  flex: 1 1 auto;
  /* 侧边栏不再画自己那一圈 1px 边框（2026-10-10 试改）：`.pane` 统一给的 `border`
     在这里收掉，只保留圆角。底色也不跟 `.pane` 走 --bg-panel，而是**与整页底色同一个
     变量**（2026-10-23 用户要求「侧栏折叠 / 展开都跟页面底色一样」）——
     编辑器那半张卡仍是 --bg-panel + 边框，所以「卡片」的语言只落在编辑器一侧，
     侧边栏读起来就是地面让出来的一块，靠 4px 留白与编辑器分开。
     `border: none` 与 box-sizing: border-box 并存，外框尺寸不变，折叠态那条
     `border-width: 0` 与动画里那两条「让出朝向对方那条边」的规则随之变成空操作。 */
  border: none;
  background: var(--bg-editor);
  /* 统一侧边栏的最低宽度随视口收缩（参数见 .workspace）：宽屏恒为 240px；
     窄屏不再是硬邦邦的 240px，否则 375px 的屏上编辑器会被压成一条缝。
     floor / cap 要乘 --ui-scale 才会跟全局缩放一起变大（它们留在 px、吃不到 rem，
     理由见 .workspace 上那段注释）；ratio 是比例，不乘。JS 侧的 measureLimits 同款处理，
     两边必须保持一致，否则分隔条会与浏览器强行撑开的那条线错位。 */
  min-width: clamp(
    calc(var(--tests-min-floor) * var(--ui-scale, 1)),
    calc(var(--tests-min-ratio) * 100%),
    calc(var(--tests-min-cap) * var(--ui-scale, 1))
  );
  view-transition-name: pane-tests;
}

/* 折叠态留在排版里、宽度收到 1px（不再 display: none）。
   View Transitions 靠「旧快照 vs 新快照」补间，display:none 的元素没有旧快照，
   展开会退化成凭空出现，所以折叠态必须有个（哪怕很小的）盒子。
   取 1px 而不是 0：零面积的盒子各家浏览器可能干脆不给快照；1px 又在视觉上不可见。
   三件事必须一起改，否则收不干净：
   - flex-grow 归 0：.pane--tests 是 flex: 1 1 auto，basis 归零后它仍会从剩余空间里
     分走一半，编辑器就涨不满；
   - min-width：上面那个 clamp()（宽屏 240px）会把宽度钉在那儿，收不下去；
   - border-width 归 0：border-box 的边框盒最小就是 2px，不收掉会留一条常驻竖线。 */
.pane--tests.is-collapsed {
  flex-grow: 0;
  min-width: 1px;
  border-width: 0;
}

/* 收到底之后，侧栏里那层内容整块退出绘制。
   原因：折叠态那张卡只剩 1px，可里面的内容（定宽壳 / 文件树 / 用例卡片）照旧排版，
   而它们的内容盒左缘**就压在卡的左缘上** —— 于是凡是自带底色或外框的东西，都会从这
   1px 里透出一条竖线：最典型的是文件树里选中那一行的 `--bg-hover` 底色，以及它被键盘
   聚焦时 `:focus-visible` 那道 1px `--focus` 蓝圈（2026-10-10 用户报的「选中底色从侧边
   漏出来一点」）。整块子树的绘制都归这一层管，关掉它就一次关干净。
   收窄 / 展开的交叉淡化由 View Transitions 按快照做，不经过这一层：旧快照拍的是折叠前的
   样子，新快照拍的是折叠后的样子，中途没人看得见这层内容。

   两条属性是有分工的，别删掉任何一条：
   - visibility 让整块退出 Tab 序与无障碍树（折叠着还能 Tab 进那些看不见的行与输入框，
     本来就是个说不通的状态）；**但它是继承的、后代写 `visible` 就能顶掉** ——
     `TestCaseCard` 的 `.card__fold > .card__body` 正是这么写的（它自己那套卡片折叠动画要用），
     所以只留它并不保险。
   - opacity 负责「一定不画」：它不继承、后代也顶不掉（整棵子树并进同一个合成组再按 0
     输出），将来谁往这层里加一个「自带满铺底色」的容器，也不会再从这 1px 里漏出来。
     它同样不进布局，getClientRects / offsetParent / ResizeObserver 的判据全部照旧
     （回归脚本与 syncSidebarPin 都读这些）。
   两条都不是 display：折叠态那张卡必须留在排版里（见上一条），摘掉内层也一样会
   打歪 syncSidebarPin 与 View Transitions 的快照。 */
.pane--tests.is-collapsed .pane__inner {
  visibility: hidden;
  opacity: 0;
}

/* ------------------------------------------------- 窄屏折叠态：图标栏横过来贴边（2026-10-13）

   窄屏展开态的左簇已经沉到侧栏底部（同一个 `is-narrow` 判据，见 Sidebar.vue），折叠态却还留着一竖条
   48px 的图标栏贴在屏幕左边 —— 两个形态对不上；而且折叠之后唯一剩下的入口是那条「边界线」，
   它在触屏上根本指望不上（线平时 opacity: 0、触屏又没有 hover；那阵子热区正中还有一列
   2px 的三点抓手，而 2px 远小于指尖 —— 三点后来在 2026-10-22 也撤掉了），
   热区左半又正好压在图标栏中部那片没有按钮的空白上（点下去什么都不会发生）——
   手指基本指不准，用户反馈的「触屏点边界线展不开」就是这个。
   所以折叠态也统一成横排：**图标栏横过来、通栏贴在工作区的一条边上**，展开 / 选面板由它的
   两枚面板按钮承担（指尖大小、看得见）。

   贴哪条边由设置 `cp.narrowCollapseSide` 决定（上 / 下，默认下）：模板上落成 `.is-fold-top` /
   `.is-fold-bottom`，下面那**四条 flex-direction** 就是它的全部实现。默认「下」＝ 2026-10-13
   定这条形态时的样子，所以不设这一项时的观感与本条上线时完全一致。

   竖排怎么排出来的：**不碰 JS 写在内联 style 上的 order**（那边是布局换边的唯一出处），
   改用 flex-direction 把主轴翻过来 —— 图标栏在两个停靠侧上 order 的位置不同，正好各用一条：
     · 侧栏在左 → order 是「图标栏 0 / 侧栏 1 / 分隔条 2 / 编辑器 3」；
       贴底要 column-reverse（**最小**的 order 落到最下），贴顶要正排 column；
     · 侧栏在右 → order 是「编辑器 1 / 分隔条 2 / 侧栏 3 / 图标栏 4」；
       正好相反：正排 column 落在最下、column-reverse 落到最上。
   于是四条规则都不需要 !important 去压内联 order（两档各两条，互不重叠）。

   ⚠️ 分隔条在这一形态下整条不参与排版：竖排里它 12/24px 的 flex-basis 会变成一条 12px 高的
   横带，而它想表达的那条竖缝已经不存在了。折叠态本来也无从拖宽（侧栏已经收没），要改宽先展开。
   ⚠️ 侧栏那一栏（.pane--tests）仍留在排版里、高度收成 0 —— View Transitions 要靠它的旧快照
   补间，摘掉 display 会让展开退化成「凭空出现」（同上面折叠态那段的理由）。
   ⚠️ 判据是一个**类**（`shellSettings.js` 的 `isNarrowLayout()` 给 <html> 挂 `is-narrow`，
   2026-10-13 从 @media 挪进 JS：键盘会把布局视口削矮、`orientation: portrait` 随之翻面）。
   上面那块与下面这一整块都用 `:where(html.is-narrow)` 包着它 —— `:where()` 不贡献特异性，
   所以下面注释里那些 (0,x,0) 算式、「压得住 ActivityBar.vue 里那条 (0,2,0)」逐条照旧。 */
/* 贴底（默认）：左停靠要反排、右停靠正排 */
:where(html.is-narrow) .workspace.is-collapsed.is-fold-bottom.is-left {
  flex-direction: column-reverse;
}

:where(html.is-narrow) .workspace.is-collapsed.is-fold-bottom.is-right {
  flex-direction: column;
}

/* 贴顶：两条与上面正好互换（只翻主轴，order 还是 JS 写的那一份） */
:where(html.is-narrow) .workspace.is-collapsed.is-fold-top.is-left {
  flex-direction: column;
}

:where(html.is-narrow) .workspace.is-collapsed.is-fold-top.is-right {
  flex-direction: column-reverse;
}

:where(html.is-narrow) .workspace.is-collapsed .splitter {
  display: none;
}

/* 横过来：两组并排落在同一条通栏卡片里 —— 左簇是面板入口（资源管理器 / 评测样例）、
   右簇是抽题与设置，语义仍是两组；但整排**居中**而不是顶到两端（2026-10-13 用户要求）：
   这条通栏和屏幕一样宽，两端各摆一簇、中间留一大片空档，看着像散了。
   基础规则那条 space-between 是给竖排用的（两组一上一下），横排里要显式压掉 ——
   压得住是因为这条带了 .workspace.is-collapsed 祖先，特异性 (0,3,0) 高过 ActivityBar.vue 里
   那条 (0,2,0) 的基础规则（与顺序无关，同一层写法见上面 flex-direction 那几条）。
   两簇之间的空档要自己补：那 4px 是 .activity-bar__group 内部的 gap，**两条栏之间没有**
   （竖排里靠 space-between 拉开，横排改成居中后就贴着，中间那两枚方块会紧挨着、比别处少 4px）。
   所以这里给整条补一个 gap: 4px，与组内格间距同值 ⇒ 一排等距按钮。
   ⚠️ 这个 4px 与 ActivityBar.vue 里 `.activity-bar__group { gap: 4px }` 是同一个数，改一处要一起改。
   两簇的语义分界因此只剩图标与选中态差异；要拉开簇间距，把这里的 gap 调大即可。
   外观与它竖着时同一套（同圆角 / 同底色，都**不描边** —— 那圈 1px 边框 2026-10-22 去掉了）。 */
:where(html.is-narrow) .workspace.is-collapsed :deep(.activity-bar) {
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 4px;
  /* 高度改由内容定：竖排里 flex-basis 是宽度（48px），横排里它成了高度。
     内容高度 = 「40px 方块 + 上下各 4px 内边距」= 48，靠 auto 撑开；写死 48 也刚好，
     但没有余量，字号 / 缩放一变就会被裁掉一像素 */
  flex: 0 0 auto;
  /* 横排的取值与竖排那套是两回事，别按「竖着的上下变成左右的」去推：
     - 上下 4px：方块 40 撑满这条横栏的高度，这 4px 只是别让圆角 / 缩放把它裁掉一像素；
     - 左右 8px：两侧的呼吸位。横排是 justify-content: center，内容居中且远没到溢出，
       所以这两个值只在极窄时起作用 —— 竖排那条（上簇距栏顶 / 下簇距栏底）在横排里
       没有对应物（上簇在最左、下簇在最右，谈不上"离边多远"），因此不跟着放大。 */
  padding: 4px 8px;
}

/* 与编辑器卡片之间那条 4px 空隙：分隔条已经不排版了，改由这里补。
   写在两档里而不是合并成一条 —— 栏在下补上边距、栏在上补下边距；
   用物理的 margin-top / margin-bottom，column-reverse 也不会把它翻到另一边去。 */
:where(html.is-narrow) .workspace.is-collapsed.is-fold-bottom :deep(.activity-bar) {
  margin-top: 4px;
}

:where(html.is-narrow) .workspace.is-collapsed.is-fold-top :deep(.activity-bar) {
  margin-bottom: 4px;
}

/* 软键盘弹起 + 图标栏贴底：这时候整块应用挂到 visualViewport 实测出来的范围上
   （见 .app.is-keyboard），底栏就正好停在键盘正上方 —— 那几十像素是打字时最缺的地方，
   直接收掉。贴顶那档不用管（键盘在下边，够不到它），所以判据里带着 is-fold-bottom。
   ⚠️ is-typing 是 useMobileKeyboard 实测的「键盘真的弹着」，与 .app.is-keyboard
   （那个只表示「这是台触摸设备」）不是一回事，别拿后者当判据。 */
:where(html.is-narrow) .app.is-typing .workspace.is-collapsed.is-fold-bottom :deep(.activity-bar) {
  display: none;
}

:where(html.is-narrow) .workspace.is-collapsed :deep(.activity-bar__group) {
  flex-direction: row;
  align-items: center;
}

/* 竖排里每格靠这条 3px 左边距钉在同一列；横排里它只会把每组的第一格推出去 */
:where(html.is-narrow) .workspace.is-collapsed :deep(.activity-bar__item) {
  margin-left: 0;
}

.workspace.is-dragging {
  cursor: col-resize;
  user-select: none;
}

/* 简洁版分隔条：12px 透明热区（视觉上只有中缝里一条线，且只在悬停/聚焦/拖拽时出现 ——
   平时连这条线也不画，见 .splitter__line 的 opacity: 0）。
   热区做宽是为了好抓：线的视觉不变，但左右各多出几像素可以被按住。
   负外边距（只往右扩 −8）把热区整体推进空隙右侧，占宽 = 12 − 8 = 4px，于是两块卡片
   实际只离 4px —— 热区宽度没缩水，编辑器卡片的位置也一点没动。
   ⚠️ 热区**只向一侧外扩**，不左右对称（2026-10-13 改）：原先是 margin: 0 -4px，热区
   左缘要伸进树里 4px，正好压住资源树那条覆盖式滚动条（滑块右缘只在侧栏右缘里 1px），
   于是瞄准线左侧想抓分隔条时会抓到滚动条、光标还不一样。现在左缘正好落在侧栏右缘上，
   两者只隔 1px，谁也不压谁。
   代价：热区的 50% 不再等于空隙中心（偏右整 4px），线得在 .splitter__line 里单独减掉。
   净空隙 = 12 − 8，改这里要连带改触屏那条负外边距和线的偏移。
   ⚠️ 上面那套只描述「侧栏在左」。侧栏停到右边时同一个方向就变成**往侧栏里长**，
   必须整体镜像 —— 见下面 .workspace.is-right 那两条。 */
.splitter {
  flex: 0 0 12px;
  margin: 0 -8px 0 0;
  /* 不加这行，热区会被 flex 的自动最小尺寸（内容宽度）影响 */
  min-width: 0;
  position: relative;
  z-index: 5;
  cursor: col-resize;
  /* 触屏的关键：pointerdown 里的 preventDefault() 只挡得住兼容鼠标事件，挡不住浏览器把这一拖
     当成滚动/缩放手势 —— 那样触屏按下后会立刻收到 pointercancel，拖拽刚起手就被 stop() 结束，
     表现就是手机上完全拖不动。touch-action 要在元素上声明，才算把这条手势交给我们。 */
  touch-action: none;
}

/* 触屏：指尖比鼠标粗得多，12px 热区太窄。热区翻倍到 24px，负外边距按同样幅度加大
   （仍是只往右扩：24 − 20 = 4），于是两块卡片的位置和间距与鼠标下逐像素一致
   （净空隙同为 4px）—— 只有可抓区域变宽，视觉一点没动。
   热区加宽后它的 50% 又往外挪了，线要跟着挪回来 —— 那条偏移写在 .splitter__line 后面的
   同名媒体查询里（⚠️ 不能写在这个块里：同特异性下会被后面那条基础规则压掉，实测踩过，
   线停在默认的 4px 偏移上，跑到空隙外 6px）。
   折叠态也用这一条宽度（不再另写一条），所以触屏下折叠前后仍是同一个 24px 热区。 */
@media (pointer: coarse) {
  .splitter {
    flex: 0 0 24px;
    margin: 0 -20px 0 0;
  }
}

/* 侧栏停在**右边**时，热区整体镜像：多出来的宽度改从**编辑器**那一侧借，热区永远
   「一侧贴住侧栏、其余铺在编辑器上」（2026-10-13 加，用户报「侧栏在右、窄屏下热区有问题」）。
   不镜像的后果：那条「只往右扩」的负外边距本是冲着侧栏在左时那只覆盖式滚动条去的
   （左缘必须正好落在侧栏右缘上才不压它），侧栏一到右边，同一个方向就整段长进侧栏里 ——
   触屏 24px 里有 20px 压在侧栏左缘上，树行最左边那一段（含文件夹的展开箭头）点不动，
   而且在上面拖**滑不动树**（热区带 touch-action: none）；宽屏那 12px 里同样压进 8px，
   还会被当成「单击分隔条」直接把侧栏折了（宽屏的轻点入口）。镜像后与在左时逐像素对称：
   净空隙同为 4px，热区盒只是翻转了朝哪边长的方向 —— 线那条偏移跟着取反号
   （见 .splitter__line 的 is-right 规则）。 */
.workspace.is-right .splitter {
  margin: 0 0 0 -8px;
}

@media (pointer: coarse) {
  .workspace.is-right .splitter {
    margin: 0 0 0 -20px;
  }
}

/* 折叠态的分隔条不再单独加宽。它以前贴窗口边缘（加宽到 24px 才抓得住），现在两侧是
   编辑器卡片和折叠图标栏、不是边缘；若在这里只加宽 flex-basis 而不同步负外边距，
   净空隙会从 4px 变成 16px —— 折叠前后两块卡片的间距就不一样了。
   折叠态因此直接用上面那条 12px 热区（触屏按媒体查询走 24px / −20px，净空隙同为 4px）。 */

/* 两栏各有自己的边，空隙里默认不再画线；指针移上来时才显出一条蓝线
   （2026-10-11 当天在「--focus 亮蓝 → 中性灰 → 比 --focus 暗一档的干净蓝」之间落定，
   取值见 base.css 的 --splitter-line：同色相压亮度、饱和度拉满，不掺灰），
   提示「这里可以拖，一直拖到侧边栏那侧就会折叠」。悬停、键盘聚焦、拖拽三态同色，
   改这一处即可 */
.splitter__line {
  position: absolute;
  /* 不顶到两栏的上下边，上下各让出 4px（全长比通栏短 8px）。写 px 而不是百分比：
     要的是一小截固定退让，与窗口/面板高度无关（4px ≥ 3 会跟着界面缩放走，与线上同口径） */
  top: 4px;
  bottom: 4px;
  /* 不从热区中心起算：热区只向右侧外扩，它的 50% 落在空隙里偏右 4px（见 .splitter 的
     margin）。减掉这 4px 把线钉回空隙正中（12px 热区：50% = 6 − 4 = 2，即热区左缘起第 2px）。
     两个数都经 postcss-pxtorem 转 rem，界面缩放时比例不变；触屏那条 24px 热区另有偏移。 */
  left: calc(50% - 4px);
  /* 用 translate 居中，不写 margin-left: -1px：这样居中与线的宽度无关，将来宽度
     若涨到 3px 以上（会被 postcss-pxtorem 转成 rem 跟着界面缩放走），也不会偏 */
  transform: translateX(-50%);
  width: 2px;
  background: var(--splitter-line);
  opacity: 0;
  transition: opacity 0.16s ease;
  pointer-events: none;
}

/* 触屏那条 24px 热区的线偏移（热区加宽后 50% = 12，空隙中心在左缘起第 2px，故减 10）。
   ⚠️ 必须写在这里，不能并进上面那个 `@media (pointer: coarse)`：同特异性下，位置更靠后的
   基础规则 `left: calc(50% - 4px)` 会把它压掉（实测：线停在 4px 偏移上、跑到空隙外 6px）。 */
@media (pointer: coarse) {
  .splitter__line {
    left: calc(50% - 10px);
  }
}

/* 侧栏在右时热区镜像（见 .splitter 的 is-right 那两条），线要改成从热区**右缘**往左数：
   偏移量与上面两条同源、号取反（12px 热区：50% = 6，要落到热区左缘起第 10px ⇒ 6 + 4）。
   ⚠️ 粗指针那条必须写在这个基础规则之后（同特异性 (0,3,0)，靠顺序分胜负）。 */
.workspace.is-right .splitter__line {
  left: calc(50% + 4px);
}

@media (pointer: coarse) {
  .workspace.is-right .splitter__line {
    left: calc(50% + 10px);
  }
}

/* 折叠态的分隔条上曾有一列三点抓手（2026-10-11 加，2026-10-22 用户要求去掉）。
   那时它是折叠后「往这边拖能拉出来」的常驻视觉提示；去掉的理由是它太吵 ——
   折叠态本来就只剩一条图标栏，中缝上再挂三个小点，像多出一串挂件。
   去掉之后把侧栏拉回来仍有几条路，都不依赖它：拖这条热区（悬停 / 聚焦 / 拖拽时
   线才显影）、宽屏轻点分隔条走 togglePanel、窄屏点图标栏上那两枚面板按钮。
   ⚠️ 因此别顺手把 .splitter 的热区收窄：点没了之后，那 12px（触屏 24px）就是
   折叠态唯一的抓取面。颜色变量 --splitter-dot 随三点一起从 base.css 删掉了。 */
.splitter:focus-visible .splitter__line,
.workspace.is-dragging .splitter__line {
  opacity: 1;
}

/* 「悬停显影」只在真有悬停能力的指针上生效。触屏没有 hover，浏览器会把点按瞬间的 :hover
   粘在元素上直到点了别处，于是点按折叠/展开后那条蓝线留在原处不灭；键盘焦点（上面的
   :focus-visible）和拖拽态不受影响，触屏下这两条路仍然可用 */
@media (hover: hover) {
  .splitter:hover .splitter__line {
    opacity: 1;
  }
}

/* ---------------------------------------------------------------- 提交确认
   Teleport 到 body，所以这里的定位与色值都只依赖主题变量，不依赖应用容器。
   与 FileExplorer 的删除确认同一套尺寸与色值（两处各自 scoped，改动要成对看一眼）。 */
.confirm {
  position: fixed;
  inset: 0;
  /* 高于右键菜单（120），与删除确认同一档 */
  z-index: 130;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.32);
}

.confirm__card {
  width: min(340px, 100%);
  padding: 14px;
  border: 1px solid var(--border-soft);
  border-radius: 10px;
  background: var(--bg-raised);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.34);
}

.confirm__title {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 650;
  color: var(--text);
  /* 提交确认的标题里带文件名（可能很长），到边界就折，别把卡片撑破 */
  overflow-wrap: anywhere;
}

/* 重复提交那版标题染成警示色：两张卡长得一模一样时，用户很容易当成普通确认一路回车 */
.confirm__title--warn {
  color: var(--warn);
}

.confirm__desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-dim);
  overflow-wrap: anywhere;
}

.confirm__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}

.confirm__btn {
  padding: 5px 14px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-panel);
  color: var(--text);
  font: 500 12.5px/1.5 var(--font-sans, system-ui);
  cursor: pointer;
}

.confirm__btn:hover {
  background: var(--bg-hover);
}

/* 主操作沿用 accent：与站内其它主要按钮同色 */
.confirm__btn--primary {
  border-color: transparent;
  background: var(--accent);
  color: var(--text-on-accent);
}

.confirm__btn--primary:hover {
  background: var(--accent-hover);
}

.confirm__btn:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
}
</style>

<style>
/* View Transitions 需要全局选择器：两栏各自成为独立的过渡组。 */
.pane--editor {
  view-transition-name: pane-editor;
}

.pane--tests {
  view-transition-name: pane-tests;
}

::view-transition-group(pane-editor),
::view-transition-group(pane-tests) {
  animation-duration: 280ms;
  animation-timing-function: cubic-bezier(0.22, 0.61, 0.36, 1);
}
</style>
