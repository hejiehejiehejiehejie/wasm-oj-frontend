<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import EditorPane from './components/EditorPane.vue'
import TestPanel from './components/TestPanel.vue'
import Sidebar from './components/Sidebar.vue'
import FileExplorer from './components/FileExplorer.vue'
import { t } from './i18n/index.js'
import { usePersistentRef } from './composables/usePersistentRef.js'
import { applyUiScale, DEFAULT_UI_SCALE, normalizeUiScale, uiScale } from './composables/useUiScale.js'
import { useCompanionImport } from './composables/useCompanionImport.js'
import { autoScrapeState, useCompanionBridge } from './composables/useCompanionBridge.js'
import { useMobileKeyboard } from './composables/useMobileKeyboard.js'
import { actionForCombo, comboFromEvent, recordingActive } from './composables/useShortcutManager.js'
import { flush, initAutoSave, setAutoSaveEnabled } from './services/autoSave.js'
import { DEFAULT_ENGINE_ID, defaultBases, getEngine } from './services/engines/index.js'
import { runCases, TIME_LIMIT_DEFAULT_MS } from './services/runner.js'
import { scheduleAutoPreload } from './services/runtimePreload.js'
import { requestPersistence } from './services/storageQuota.js'
import { initWorkspace } from './services/vfs/migrate.js'
import {
  activeLanguage,
  activeNode,
  getNodeById,
  initWorkspaceStore,
  peekActiveContent,
  saveAll,
  updateFileConfig,
} from './services/vfs/workspaceStore.js'
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
import {
  EDITOR_SETTINGS_DEFAULTS,
  normalizeEditorSetting,
} from './services/editorOptions.js'

// ---------------------------------------------------------------- 持久化状态
// panelPosition 是本项目的核心偏好：'left' | 'right'，默认在左侧。
const panelPosition = usePersistentRef('cp.panelPosition', 'left')
// 是否显示统一侧边栏（只影响显隐，文件树展开态与用例数据都不丢）
const panelVisible = usePersistentRef('cp.panelVisible', true)
// 语言不独立持久化：由活跃文件扩展名派生（activeLanguage），顶栏已无语言下拉
const editorShare = usePersistentRef('cp.editorShare', 60)
const engineId = usePersistentRef('cp.engine', DEFAULT_ENGINE_ID)
const judgeBases = usePersistentRef('cp.judgeBases', defaultBases())
// 全局时限（毫秒，只计运行段）：所有用例统一，超了判 TLE。
// 这是「没有题目时限时的默认值」；带 meta.timeLimit 的题目文件优先用题目时限。
const timeLimitMs = usePersistentRef('cp.timeLimitMs', TIME_LIMIT_DEFAULT_MS)
// 实际生效的时限：活跃文件自带题目时限就用它，否则退回全局默认
const effectiveTimeLimitMs = computed(() => {
  const fromMeta = activeNode.value?.meta?.timeLimit
  return fromMeta && fromMeta > 0 ? fromMeta : timeLimitMs.value
})

// 全局界面缩放（档位 100% / 110% / 125% / 150%，默认 100%）。CSS 的 px 已由 postcss-pxtorem
// 转成 rem，所以这里只需要写一次根字号；物理尺寸与拖拽数学都不受影响（见 useUiScale.js）。
const uiScalePref = usePersistentRef('cp.uiScale', DEFAULT_UI_SCALE, { revive: normalizeUiScale })
// setup 期就落地：早于首帧渲染，不会先按 100% 画一帧再跳到目标档位
applyUiScale(uiScalePref.value)
watch(uiScalePref, applyUiScale)

// ------------------------------------------------------------ 编辑器偏好
const EDITOR_SETTINGS_KEY = 'cp.editorSettings'
// 存档版本号只用于一次性迁移主题（见 readEditorSettings）
const EDITOR_SETTINGS_VERSION_KEY = 'cp.editorSettingsVersion'
const EDITOR_SETTINGS_VERSION = 4
// 默认值、可选项表、逐键校验、以及「偏好 → Monaco 选项」的映射都在 services/editorOptions.js
const EDITOR_SETTING_KEYS = Object.keys(EDITOR_SETTINGS_DEFAULTS)

function readEditorSettings() {
  try {
    const raw = window.localStorage.getItem(EDITOR_SETTINGS_KEY)
    if (!raw) return { ...EDITOR_SETTINGS_DEFAULTS }
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return { ...EDITOR_SETTINGS_DEFAULTS }
    // 主题 id 只做一次换算，之后按键走白名单：
    // v3 之前主题只作用于编辑器（选项有 vs-dark / vs / hc-black），原本选浅色 vs 的迁到浅色；
    // v4（2026-09-29）起主题 id 去掉了 `cph-` 前缀，旧存档的 cph-light 照样认。
    // 其余旧值（vs-dark / hc-black / cph-dark）交给 normalizeEditorSetting 丢掉，回落到默认深色。
    if (Number(window.localStorage.getItem(EDITOR_SETTINGS_VERSION_KEY)) < EDITOR_SETTINGS_VERSION) {
      if (parsed.theme === 'vs' || parsed.theme === 'cph-light') parsed.theme = 'light'
    }
    // 只采纳已知字段，并且逐键夹成合法值：历史遗留的过期配置（如已移除的 keybinding）
    // 会被 normalizeEditorSetting 丢掉，越界 / 认不出来的值一律退回默认。
    const merged = { ...EDITOR_SETTINGS_DEFAULTS }
    for (const key of EDITOR_SETTING_KEYS) {
      if (!(key in parsed)) continue
      const value = normalizeEditorSetting(key, parsed[key])
      if (value !== undefined) merged[key] = value
    }
    return merged
  } catch {
    return { ...EDITOR_SETTINGS_DEFAULTS }
  }
}

const editorSettings = ref(readEditorSettings())

// 主题决定的是整套界面的配色：挂在 <html data-theme> 上由 CSS 变量接管，
// Monaco 那边通过同一个 id 对应的自定义主题保持内芯同色。
// 安装成独立应用后，浏览器还会拿 theme-color 画窗口标题栏，所以从变量里读出来同步给它，
// 免得标题栏和界面串色（顺便守住「色值只定义在 base.css」这条约束）。
watch(
  () => editorSettings.value.theme,
  (theme) => {
    document.documentElement.dataset.theme = theme
    const chromeBar = document.querySelector('meta[name="theme-color"]')
    if (chromeBar) {
      const barColor = getComputedStyle(document.documentElement)
        .getPropertyValue('--bg-chrome')
        .trim()
      if (barColor) chromeBar.setAttribute('content', barColor)
    }
  },
  { immediate: true },
)

// 自动保存的开关跟着偏好走。另外两个离开时点（切页签 / 关页签）在 workspaceStore 里，
// 窗口失焦与页面切后台这两个只能挂在 DOM 上，见下面的 onMounted。
watch(() => editorSettings.value.autoSave, setAutoSaveEnabled, { immediate: true })

// 需求：深度持久化到 localStorage；immediate 让首次访问也落盘。
watch(
  editorSettings,
  (value) => {
    try {
      window.localStorage.setItem(EDITOR_SETTINGS_KEY, JSON.stringify(value))
      window.localStorage.setItem(EDITOR_SETTINGS_VERSION_KEY, String(EDITOR_SETTINGS_VERSION))
    } catch {
      /* 隐私模式或配额已满：只在内存里工作 */
    }
  },
  { deep: true, immediate: true },
)

function updateEditorSettings(value) {
  // 面板送来的值也过一遍校验：数字输入框可以手打，越界值不该进存档
  const merged = { ...EDITOR_SETTINGS_DEFAULTS }
  for (const key of EDITOR_SETTING_KEYS) {
    if (!(key in value)) continue
    const normalized = normalizeEditorSetting(key, value[key])
    if (normalized !== undefined) merged[key] = normalized
  }
  editorSettings.value = merged
}

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

const totals = computed(() => {
  const tally = { passed: 0, failed: 0, error: 0, running: 0 }
  for (const item of testCases.value) if (tally[item.status] !== undefined) tally[item.status] += 1
  return tally
})

const workspace = ref(null)
const editorPane = ref(null)
const sidebarRef = ref(null)
const running = ref(false)

// order 换序：splitter 恒 2；统一侧边栏在右时 editor 1 / tests 3，反之对调。
// flexBasis 两栏之和恒为 100%（折叠时编辑器不设 basis，撑满剩余空间）。
// 全屏编辑与「折叠侧栏」是同一种情形（另一栏整个不参与排版），处理方式也照抄：
// 编辑器不设 basis，由 flex-grow 撑满剩下的全部宽度
const editorPaneStyle = computed(() => ({
  order: panelPosition.value === 'right' ? 1 : 3,
  ...(panelVisible.value && !mdFullscreen.value ? { flexBasis: `${editorShare.value}%` } : {}),
}))
const testsPaneStyle = computed(() => ({
  order: panelPosition.value === 'right' ? 3 : 1,
  flexBasis: `${100 - editorShare.value}%`,
}))

// 触摸屏默认开启的「键盘模式」：键盘弹起时整块应用收缩到键盘上方（见 .app.is-keyboard），
// 并保证滑动只滚动、轻点输入框才唤键盘。鼠标设备上它不生效，行为与之前完全一致。
const { active: keyboardMode, shortViewport } = useMobileKeyboard()
// 页头耗时 = 本轮最慢的那张卡片，口径与卡片完全一致（只计运行段）：
// 编译 / 链接 / 排队 / WASI 启动都不算，跑完一批后不会比最快的样例大出一个量级。
const elapsed = computed(() => {
  let max = 0
  for (const item of testCases.value) {
    if (typeof item.durationMs === 'number' && item.durationMs > max) max = item.durationMs
  }
  return max
})
const swapping = ref(false)
const dragging = ref(false)

let abortController = null

// -------------------------------------------------------------- 布局切换
// 关键约束：这里只改 flex-direction，DOM 结构与 Monaco 实例都不动，
// 因此切换布局不会触发编辑器销毁重建（不会闪屏）。
function toggleLayout() {
  const next = panelPosition.value === 'right' ? 'left' : 'right'
  if (typeof document.startViewTransition !== 'function') {
    panelPosition.value = next
    swapping.value = true
    window.setTimeout(() => {
      swapping.value = false
    }, 280)
    return
  }
  document.startViewTransition(() => {
    panelPosition.value = next
    return nextTick()
  })
}

// ------------------------------------------------------------------ 折叠规则
// 编辑器最窄 24%；面板最低宽度是一组随视口收缩的值（宽屏 320px、窄屏按内容宽 50%，
// 参数写在 .workspace 的三个 CSS 变量上，与 .pane--tests 的 min-width 同源）；82% 只是兜底上限
const MIN_SHARE = 24
const MAX_SHARE = 82
// 「贴边」与「拖离边缘」的判定距离：鼠标进到最后 32px 算贴边 → 折叠；
// 折叠后往外拖出 60px 才算离开边缘 → 展开。两个值错开，避免停在临界点上反复闪。
const EDGE_PX = 32
const RELEASE_PX = 60

// 拖拽与方向键共用的虚拟比例：它可能超出面板能压缩的范围，用来表达「鼠标离边缘还有多远」。
// 面板可见时它就等于 editorShare；折叠后 editorShare 冻结在折叠前的宽度（展开时原样回来），
// 虚拟比例则继续跟着鼠标走，好判断什么时候拖离了边缘。
let virtualShare = editorShare.value

// 量一次工作区，推出拖拽界线
function measureLimits() {
  const surface = workspace.value
  if (!surface) return { width: 1, left: 0, maxShare: MAX_SHARE, edgeShare: 100, releaseShare: 96 }
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
  // 再加上分隔条自身宽度：越过这条线后浏览器会强行撑开面板，分隔条就脱离鼠标了。
  const minTests = panelMin + (surface.querySelector('.splitter')?.getBoundingClientRect().width ?? 0)
  return {
    width,
    // 内容盒左边界：折叠状态下要把鼠标位置换算成虚拟比例
    left: surface.getBoundingClientRect().x + Number.parseFloat(style.paddingLeft),
    maxShare: Math.min(MAX_SHARE, ((width - minTests) / width) * 100),
    edgeShare: ((width - EDGE_PX) / width) * 100,
    releaseShare: ((width - RELEASE_PX) / width) * 100,
  }
}

// 统一收口规则，拖拽与方向键共用：
// 面板可见时比例先跟着鼠标走，但压到最低宽度（见 measureLimits）就不再变窄（被 maxShare 卡住）；
// 只有一直顶到贴边（edgeShare）才折叠。
// 折叠后往外拖出 60px（releaseShare）就展开，面板先以最小宽度露出来，再继续跟手加宽。
function applyShare(raw, limits) {
  const share = Math.round(Math.min(limits.maxShare, Math.max(MIN_SHARE, raw)) * 10) / 10
  if (panelVisible.value) {
    editorShare.value = share
    if (raw >= limits.edgeShare) panelVisible.value = false
    return
  }
  if (raw <= limits.releaseShare) {
    editorShare.value = share
    panelVisible.value = true
  }
}

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

// 双击折叠 / 展开。折叠期间 editorShare 不动，所以展开回到的就是折叠前的宽度。
function togglePanel() {
  panelVisible.value = !panelVisible.value
  // 折叠后分隔条停在边缘，虚拟比例从 100% 起步；展开则接着恢复出来的宽度继续走
  virtualShare = panelVisible.value ? editorShare.value : 100
}

// 双击的位移上限（与触摸端「轻点 / 滑动」的判定口径一致）：超过它算拖拽，不算轻点
const TAP_SLOP = 10
// 两次轻点的最大间隔。取浏览器自己的双击判定常用的 300ms
const DOUBLE_TAP_MS = 300
// 最近一次由我们自己认出来的触摸双击。有些设备在它之后还会补一发原生 dblclick，
// 挨着就丢掉，否则一次双击被折两次、看上去像没动
let touchDblTapAt = 0
let lastTapAt = 0
let lastTapX = 0

// 鼠标 / 触控板走浏览器的原生双击；触摸端的双击在 beginDrag 的 pointerup 里自己认
function onSplitterDblClick() {
  if (Date.now() - touchDblTapAt < 400) return
  togglePanel()
}

function beginDrag(event) {
  if (running.value) return
  const surface = workspace.value
  if (!surface) return
  // 取消 pointerdown 会按规范抑制兼容的 mousedown/mouseup，用来阻断从分隔条起手的
  // 原生文字选中拖拽；配合 .workspace.is-dragging 的 user-select: none 双保险。
  // 注意别指望别的浏览器也像 Chrome 那样把 click / dblclick 补回来——触摸端的双击
  // 因此不依赖 dblclick，而是在下面的 pointerup 上自己认（见 stop）。
  event.preventDefault()
  const isTouch = event.pointerType !== 'mouse'
  let moved = 0
  const startX = event.clientX
  const startY = event.clientY
  const limits = measureLimits()
  // 面板换到左侧后编辑器在右半边，拖拽方向要取反。
  const direction = panelPosition.value === 'right' ? 1 : -1
  // 可见时锚在分隔条当前宽度上（保证 1:1 跟手）；折叠后分隔条贴在窗口边缘，
  // 此时锚住鼠标位置，「拖离边缘 60px」才是实打实的 60px。
  const offsetShare = ((event.clientX - limits.left) / limits.width) * 100
  const startRaw = panelVisible.value ? editorShare.value : direction === 1 ? offsetShare : 100 - offsetShare
  virtualShare = startRaw
  dragging.value = true

  // 抓住指针。折叠阈值（EDGE_PX = 32）要求把鼠标一直拖到窗口边缘，松手时指针往往已经压在
  // 窗口边框上、甚至跑到窗口外，这一发 pointerup 可能根本到不了页面。捕获之后事件始终投给
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
    // 虚拟比例始终从按下那一刻起算，来回拖动才连续
    const raw = startRaw + ((moveEvent.clientX - startX) * direction * 100) / limits.width
    virtualShare = Math.min(100, Math.max(MIN_SHARE, raw))
    applyShare(virtualShare, limits)
    editorPane.value?.layout()
  }
  const stop = (upEvent) => {
    dragging.value = false
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', stop)
    window.removeEventListener('pointercancel', stop)
    editorPane.value?.layout()
    // 触摸端的双击：两次都没怎么动的轻点，间隔够近就算。特意不看 dblclick——
    // 部分触屏浏览器根本不为双指轻点合成它（真机反馈「有些触屏设备双击没反应」）。
    if (!isTouch || upEvent.type !== 'pointerup' || moved > TAP_SLOP) return
    const now = Date.now()
    if (now - lastTapAt <= DOUBLE_TAP_MS && Math.abs(upEvent.clientX - lastTapX) <= TAP_SLOP) {
      lastTapAt = 0
      touchDblTapAt = now
      togglePanel()
    } else {
      lastTapAt = now
      lastTapX = upEvent.clientX
    }
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', stop)
  window.addEventListener('pointercancel', stop)
}

// ------------------------------------------------------------------ 运行逻辑
function resetCase(item) {
  item.status = 'running'
  item.actualOutput = ''
  item.detail = ''
  item.verdict = ''
  item.durationMs = null
  item.stale = false
}

// 引擎送回的补丁直接落到对应卡片上，界面不需要知道用的是哪个引擎
function applyPatch(target, patch, index) {
  Object.assign(target, patch, { stale: false })
}

// 运行入口有两处（⌘/Ctrl + Enter、评测面板页脚那颗 ▶），都并到 runAll 这一个出口。
// 跑之前先保证「看得到结果」：侧栏若收起了就展开，
// 若停在资源管理器就切到评测样例（已经在评测样例上则什么都不做，不影响页签持久化）
function revealTestsPanel() {
  if (!panelVisible.value) togglePanel()
  sidebarRef.value?.showPanel('tests')
}

// 快捷键版的「翻到另一个面板」。侧栏收起着就先把它捞回来 —— 否则按下去什么也看不见，
// 会被当成快捷键没生效。真正的翻面还是交给 Sidebar.vue 的 togglePanel（它负责动画与落盘）。
function switchSidebarPanel() {
  if (!panelVisible.value) togglePanel()
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
 * 空态里那行「样例还没到」的提示。
 *
 * 判据是**当前文件是一道题**（meta.url 有值，说明它是抓下来的、不是用户自己建的）
 * 且样例还是空的 —— 用户自己写的新文件不该被塞一句「打开题目页会自动抓」。
 * 题目从哪来、抓得到抓不到，由 useCompanionBridge 那台状态机说了算。
 */
const emptyNotice = computed(() => {
  const node = activeNode.value
  if (!node?.meta?.url || testCases.value.length) return null

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
  // 运行前自动保存全部 dirty model，再取活跃文件快照
  await saveAll()
  const snapshot = peekActiveContent() ?? ''
  const queue = [...testCases.value]
  queue.forEach(resetCase)

  const left = await runCases({
    engine: engine.value,
    base: judgeBase.value,
    languageId: activeLanguage.value,
    entryPath: activeNode.value?.path,
    cases: queue,
    code: snapshot,
    timeLimitMs: effectiveTimeLimitMs.value,
    signal: abortController.signal,
    onCase: applyPatch,
  })

  // 中途中断时，未跑到的卡片回到待运行，不留假的“运行中”
  for (const item of testCases.value) if (item.status === 'running') item.status = 'idle'

  running.value = false
  abortController = null
}

async function runOne(target) {
  if (running.value || !target) return
  if (!activeLanguage.value) return // 同 runAll：UI 已置灰，这里是兜底
  running.value = true
  const controller = new AbortController()
  target.status = 'running'
  target.actualOutput = ''
  target.detail = ''
  target.verdict = ''
  target.durationMs = null
  try {
    await saveAll()
    await runCases({
      engine: engine.value,
      base: judgeBase.value,
      languageId: activeLanguage.value,
      entryPath: activeNode.value?.path,
      cases: [target],
      code: peekActiveContent() ?? '',
      timeLimitMs: effectiveTimeLimitMs.value,
      signal: controller.signal,
      onCase: applyPatch,
    })
    if (target.status === 'running') target.status = 'idle'
  } finally {
    running.value = false
  }
}

function addCase() {
  testCases.value = [...testCases.value, createCase()]
  nextTick(() => {
    const list = workspace.value?.querySelector('.cases')
    if (list) list.scrollTop = list.scrollHeight
  })
}

function removeCase(target) {
  testCases.value = testCases.value.filter((item) => item.id !== target.id)
}

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
// 监听挂在 window 的**捕获**阶段：Monaco 的键位服务挂在编辑器内部的 DOM 上，捕获是从外
// 往内走的，所以在 window 上就能先一步拦下按键并 stopPropagation，编辑器里也归这套表管。
const SHORTCUT_HANDLERS = {
  run: () => runAll(),
  // 全屏编辑时侧栏整块让位，这两条按下去什么也看不见 —— 先退出全屏再执行，
  // 免得看起来像快捷键失灵（与 runAll 里 revealTestsPanel 的思路一致）
  'toggle-panel': () => {
    exitFullscreen()
    togglePanel()
  },
  'switch-panel': () => {
    exitFullscreen()
    switchSidebarPanel()
  },
  'toggle-layout': () => toggleLayout(),
  'new-case': () => addCase(),
  'open-settings': () => (settingsTab.active ? deactivateSettingsTab() : openSettingsTab()),
}

/** 题解在编辑器里生效的那 14 条键位（注册在 Monaco，见 EditorPane 的 registerMarkdownActions） */
const MD_EDITOR_COMBOS = new Set(Object.values(MD_SHORTCUTS))

/** 这一发按键是不是发生在 Monaco 编辑器内部 */
function inMonacoEditor(event) {
  const target = event.target
  return target instanceof Element && target.closest('.monaco-editor') !== null
}

function onKeydown(event) {
  // 输入法组字期间的按键不算快捷键（否则拼音选词会被当成命令）
  if (event.isComposing) return
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

// 空态提示要按「插件装没装」分岔：attach 是幂等的，这里只为读全局状态
const { extensionInfo, checking: extensionChecking } = useCompanionBridge()

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
  // 捕获阶段：见上面 onKeydown 的说明（要抢在 Monaco 之前）
  window.addEventListener('keydown', onKeydown, true)
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
  // 地址里带来的 /<handle>：先确认云端有没有这份配置，再决定要不要打开设置页。
  // 必须等上面两步跑完：会话恢复会把 workspace.activeId 设回上次那个文件，而 editorViews 的
  // 规矩是「活跃文件一变就让开」（见 editorViews.js 末尾那个 watch），早开一步会被紧接着的
  // 这次变更立刻关掉。识别在 main.js 里做了（地址保持原样不抹，见 cloudEntry.js）；
  // 云端没有配置时 confirmCloudEntry 会把地址抹回根路径、只弹一句提示，这里就不开设置页。
  // **刻意不 await**：这次探测要发一个网络请求，卡在这里会把下面三件事一并推迟到它回来之后
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
  window.removeEventListener('blur', onWindowBlur)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  disposeAutoSave?.()
  disposeAutoSave = null
  window.clearTimeout(staleTimer)
  window.clearTimeout(reclampTimer)
  abortController?.abort()
  layoutObserver?.disconnect()
  layoutObserver = null
})
</script>

<template>
  <div class="app" :class="{ 'is-keyboard': keyboardMode, 'is-short': shortViewport }">
    <main
      ref="workspace"
      class="workspace"
      :class="[`is-${panelPosition}`, { 'is-dragging': dragging, 'is-swapping': swapping, 'is-collapsed': !panelVisible }]"
    >
      <section class="pane pane--editor" :style="editorPaneStyle">
        <EditorPane
          ref="editorPane"
          :settings="editorSettings"
          :panel-position="panelPosition"
          :time-limit="timeLimitMs"
          :judge="judgeSettings"
          :connection="connection"
          :ui-scale="uiScalePref"
          @update:settings="updateEditorSettings"
          @update:time-limit="timeLimitMs = $event"
          @update:ui-scale="uiScalePref = $event"
          @toggle-layout="toggleLayout"
          @select-engine="selectEngine"
          @update-base="updateBase"
          @test-connection="testConnection"
        />
      </section>

      <div
        v-show="!mdFullscreen"
        class="splitter"
        role="separator"
        aria-orientation="vertical"
        :aria-valuenow="Math.round(editorShare)"
        :style="{ order: 2 }"
        tabindex="0"
        @pointerdown="beginDrag"
        @dblclick="onSplitterDblClick"
        @keydown.left.prevent="nudgeShare(-2)"
        @keydown.right.prevent="nudgeShare(2)"
      >
        <span class="splitter__line"></span>
        <span class="splitter__dots" aria-hidden="true"><i></i><i></i><i></i></span>
      </div>

      <!-- 统一侧边栏：资源管理器与评测样例合并成一个页签容器，
           整体仍按原来的 .pane--tests 参与分屏拖拽与折叠（宽度 / 阈值逻辑不变） -->
      <section
        v-show="panelVisible && !mdFullscreen"
        class="pane pane--tests"
        :style="testsPaneStyle"
      >
        <Sidebar ref="sidebarRef">
          <template #explorer>
            <FileExplorer />
          </template>
          <template #tests>
            <TestPanel
              :cases="testCases"
              :running="running"
              :elapsed="elapsed"
              :run-blocked="runBlockedReason"
              :notice="emptyNotice"
              @add="addCase"
              @remove="removeCase"
              @run-one="runOne"
              @run-all="runAll"
            />
          </template>
        </Sidebar>
      </section>
    </main>
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

.workspace {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  /* 布局对调只发生在这里 */
  flex-direction: row;
  /* 四周留白 6px + 两栏之间 6px 空隙（分隔条负外边距后剩下的部分）：两块卡片浮在底色上 */
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
   面板页头页脚）被圆角裁掉，卡片边界才干净 */
.pane {
  min-width: 0;
  display: flex;
  overflow: hidden;
  border-radius: 8px;
  border: 1px solid var(--border-soft);
  background: var(--bg-panel);
}

/* 子组件默认 flex: 0 1 auto 会收缩到内容宽度，必须拉伸才能撑满所属栏位 */
.pane > * {
  flex: 1 1 auto;
  min-width: 0;
}

/* 两栏 flex-basis 之和恒为 100%（右栏 basis 由 App 内联写为 100 - editorShare）：
   basis 之外若还留出剩余空间，会被两栏的 flex-grow 平分，
   于是分隔条只以一半幅度跟手。 */
.pane--editor {
  flex: 1 1 60%;
  view-transition-name: pane-editor;
}

.pane--tests {
  flex: 1 1 auto;
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

.workspace.is-dragging {
  cursor: col-resize;
  user-select: none;
}

.workspace.is-dragging .pane {
  transition: none;
}

.workspace.is-swapping .pane {
  animation: pane-settle 280ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

@keyframes pane-settle {
  from {
    opacity: 0.55;
    transform: translateX(var(--settle, -10px));
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.workspace.is-swapping .pane--editor {
  --settle: 10px;
}

.workspace.is-swapping .pane--tests {
  --settle: -10px;
}

/* 简洁版分隔条：12px 透明热区（视觉上仍只有一条发丝线）。
   热区做宽是为了好抓：细线的视觉不变，但左右各多出几像素可以被按住。
   负外边距把热区左右各压进两侧卡片 3px，于是两块卡片实际只离 6px——
   热区宽度没缩水，中间的细线也仍在空隙正中 */
.splitter {
  flex: 0 0 12px;
  margin: 0 -3px;
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

/* 触屏：指尖比鼠标粗得多，12px 热区太窄。热区翻倍到 24px，负外边距按同样幅度加大，
   于是两块卡片的位置和间距与鼠标下逐像素一致 —— 只有可抓区域变宽，视觉一点没动。
   （折叠态那条 `.workspace.is-collapsed .splitter` 特异性更高，仍然是 24px，不受这里影响） */
@media (pointer: coarse) {
  .splitter {
    flex: 0 0 24px;
    margin: 0 -9px;
  }
}

/* 面板折叠后分隔条贴在窗口边缘：热区加宽到 24px，否则一根隐形热区贴在边缘很难抓 */
.workspace.is-collapsed .splitter {
  flex: 0 0 24px;
}

/* 两栏各有自己的边，空隙里默认不再画线；指针移上来时才亮出一条主题色细线，
   提示「这里可以拖，一直拖到侧边栏那侧就会折叠」 */
.splitter__line {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 2px;
  margin-left: -1px;
  background: var(--focus);
  opacity: 0;
  transition: opacity 0.16s ease;
  pointer-events: none;
}

/* 正中间的三点抓手：常驻可见，好让人一眼看出这里能拖。
   容器宽度正好等于两卡片之间的 6px 空隙，用底色把身后的细线遮掉，
   三个点才数得清，不会和线糊成一条 */
.splitter__dots {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 3px 1.5px;
  background: var(--bg-editor);
  pointer-events: none;
}

.splitter__dots i {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--splitter-dot);
  transition: background-color 0.16s ease;
}

.splitter:focus-visible .splitter__line,
.workspace.is-dragging .splitter__line {
  opacity: 1;
}

/* 细线亮起来时，三点同时切成主题强调色 */
.splitter:focus-visible .splitter__dots i,
.workspace.is-dragging .splitter__dots i {
  background: var(--focus);
}

/* 「悬停显影」只在真有悬停能力的指针上生效。触屏没有 hover，浏览器会把点按瞬间的 :hover
   粘在元素上直到点了别处，于是双击折叠/展开后那条蓝线留在原处不灭；键盘焦点（上面的
   :focus-visible）和拖拽态不受影响，触屏下这两条路仍然可用 */
@media (hover: hover) {
  .splitter:hover .splitter__line {
    opacity: 1;
  }

  .splitter:hover .splitter__dots i {
    background: var(--focus);
  }
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
