<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import EditorPane from './components/EditorPane.vue'
import TestPanel from './components/TestPanel.vue'
import Sidebar from './components/Sidebar.vue'
import ActivityBar from './components/ActivityBar.vue'
import FileExplorer from './components/FileExplorer.vue'
import ToolchainGate from './components/ToolchainGate.vue'
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
// 存档里的引擎 id 可能是另一端写下的（云端同步带过来，或同一个 localhost 源在浏览器与桌面壳之间
// 来回切）：本端跑不了就当场归位到本端默认引擎，否则面板高亮的引擎与真正生效的那个会对不上
if (engineId.value !== getEngine(engineId.value).id) engineId.value = DEFAULT_ENGINE_ID
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
  // basis 常驻（含折叠态）：折叠时图标栏固定 48px、不参与增长，编辑器是唯一 grow 的那个，
  // 剩下的宽度自然全归它 —— 结果与「不给 basis」一致，但折叠动画里编辑器的 basis 保持不动，
  // 宽度只跟着侧栏收窄而平滑地涨，不会两条动画各自跑一遍。
  ...(mdFullscreen.value ? {} : { flexBasis: `${editorShare.value}%` }),
}))
const testsPaneStyle = computed(() => ({
  order: panelPosition.value === 'right' ? 3 : 1,
  // 折叠期间给 0%（动画的终点），折叠到底后元素被 display 摘掉，这个 0% 就不起作用了
  flexBasis: panelVisible.value ? `${100 - editorShare.value}%` : '0%',
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
const { active: keyboardMode, shortViewport, probe: focusProbe } = useMobileKeyboard()
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

// 折叠 / 展开。折叠期间 editorShare 不动，所以展开回到的就是折叠前的宽度。
// 三条入口共用它：键盘（toggle-panel）、程序内调用（revealTestsPanel / switchSidebarPanel）、
// 以及鼠标 / 触摸端单击分隔条（在 beginDrag 的 pointerup 里认，见下）。
//
// 整套动作分两段（2026-10-04 定稿，取代原先的「图标从一头飞到另一头」）：
//   ① 宽度伸缩  0 → 200ms   两条 flex-basis transition，见 .pane--tests.is-animating 与
//                          ActivityBar 的 .activity-bar
//   ② 浮现      180 → 300ms 图标 / 内容淡入，靠样式表里 animation 的 delay + backwards 挂上去
// 这两段全是 CSS：JS 只翻一次状态、守一个闸门。
//
// 为什么把飞行换成分两段：图标栏上那几格与侧栏页头那几颗控件的 x 本来就几乎重合
// （两端都挤在左上角，实测相差 0~1px），所以所谓「从这儿飞到那儿」其实只是原地放大 2px
// 再下沉几像素 —— 看不出「飞」，只剩一下抖，还额外欠下两笔债：飞行体得克隆到 body 浮层
// 才不被裁切，飞行期间两端真图标都得先隐身。分两段则把「入口换了个地方」直接讲清楚：
// 先看栏位收/放，再看该出现在哪一侧的图标浮现。
//
// `PANEL_LOCK_MS` 是闸门总长，取到第二段结束（180 + 120 = 300）。少一点都不行：
// 闸门一摘，挂着第二段的那些选择器就失效，图标会从半透明直接跳到全显。
// 它也顺带管着另外两件事：两条栏位留在排版里（display: none 不可动画，折叠时得先让它收到 0
// 再摘），以及内层定宽壳冻结（宽度不动 → 内容不重排，见 syncSidebarPin）。
//
// 两段之外还有两处收尾，都在样式表里、按「哪一侧在收」区分：运动中的接缝只留一条边
// （两张卡片贴在一起时是 2px 双线），以及宽度段走完后那 100ms 里把收成 2px 的残留隐掉
// （border-box 的边框盒收不到 0）。见 App.vue 样式表里的「接缝」「残留」两段。
const PANEL_LOCK_MS = 300
const panelAnimating = ref(false)
let panelAnimTimer = 0

// 系统开了「减弱动效」：CSS 里的过渡已被压到 0.01ms（见 base.css），再分行分段的编排
// 只会变成闪一下，所以这种情况下整段走直切（不挂 is-animating）。
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

// View Transitions 支持探测：侧栏折叠 / 展开与布局换边共用同一个判据
// （toggleLayout 里那道检查保持原样，这一轮只动侧栏这一条路径）
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
// 折叠 / 展开那 200ms 里外层的宽度一直在变，内层若跟着变，里面的文件树与用例卡片就会
// 逐帧重排（文字反复换行、@container 规则反复重算），看着是「内容被挤扁」而不是「被推出画面」。
// 钉住之后内层的排版一动不动，由外层自己的 overflow: hidden 负责裁掉多出来的部分。
// 冻结只发生在动画期间：平时这个观察器跟着外层的宽度走（与流式布局等价），
// 拖分隔条时更是整条规则让路（见样式表里 .is-dragging 那条），所以日常使用与以前没有区别。
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
  // width 为 0 的两处：折叠到底（display: none）与展开动画刚开始的那一帧。
  // 都不能把 0 写进去 —— 前者会抹掉下次展开要用的那个宽度，后者会让内容在动画里塌成一条缝。
  if (!width) return
  sidebarInner.value.style.width = `${width}px`
  sidebarPinned.value = true
}

function syncSidebarPin() {
  // 动画期间冻结：宽度不动 → 内容不重排，多出来的部分由外层裁掉
  if (panelAnimating.value) return
  // 折叠态不量：外层这时只有 1px（见样式表里 .pane--tests.is-collapsed），
  // 量了会把「展开要用的那个宽度」覆盖成 1px，下次展开的快照就是一条缝。
  if (!panelVisible.value) return
  pinSidebarWidth()
}

function togglePanel({ instant = false } = {}) {
  // 三处不播动画，直接切：
  // - 调用方点名（题解全屏退出那一下整块布局是跳变的，没有可补间的起点，见 SHORTCUT_HANDLERS）；
  // - 系统开了「减弱动效」；
  // - 题解全屏还盖在上面（例如全屏里点运行，自动亮出评测面板但侧栏整块是藏着的）。
  const animate = !instant && !mdFullscreen.value && !reduceMotion.matches

  // View Transitions 路径：只翻一次状态，宽度 / 位置全交给浏览器按快照补间。
  // 好处是动画期间 DOM 一动不动（不再逐帧改 flex-basis），Monaco 也就不会逐帧重排，
  // 下面那套定宽冻结 / 接缝 / 残留的补丁本就是为了伺候「逐帧改宽度」才存在的。
  //
  // 两栏的 view-transition-name 在这里被摘掉，故意不让它们各自成组：
  // 命名元素会成为独立过渡组，而组盒子在改尺寸时会把快照位图拉过去（文字横向变形）。
  // 摘掉之后两栏并进 root 快照，root 的盒子恒等于整个应用、尺寸不变，只剩透明度补间，
  // 拉伸在结构上不可能发生。代价是整屏交叉淡化——旧布局（带侧栏）与新布局会同时叠印。
  if (animate && canViewTransition()) {
    panelAnimating.value = false
    // 翻状态前先把定宽壳退回流体：VT 只翻一次 DOM，「防逐帧重排」那件事不存在，
    // 而旧钉子（折叠时可能已被写成 1px）会被原样带进快照，反而把内容压扁。
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

  // 直切：一步到位。不挂 is-animating，宽度第二段也就不存在，钉子交给 RO 那条路补。
  panelAnimating.value = animate
  if (!animate) {
    panelVisible.value = !panelVisible.value
    virtualShare = panelVisible.value ? editorShare.value : 100
    nextTick(() => {
      if (panelVisible.value) pinSidebarWidth()
    })
    return
  }

  nextTick(() => {
    // 展开的起点是「侧栏宽度 0、图标栏 48px」，这一帧才刚刚落到 DOM 上；不逼一次样式计算，
    // 浏览器会把起点与终点并成同一次样式变更，transition 没有起始值可比，直接就跳过去了
    void workspace.value?.offsetWidth
    panelVisible.value = !panelVisible.value
    // 折叠后分隔条停在边缘，虚拟比例从 100% 起步；展开则接着恢复出来的宽度继续走
    virtualShare = panelVisible.value ? editorShare.value : 100
    // 动画还没播完就又点了一下：这里不做拦截，让状态翻回去 —— 宽度过渡会从「当前那一格」
    // 自然掉头（CSS 过渡本来就按当前计算值重新起算），比无视这一下点击跟手。
    // 闸门重排，把 display 的摘除时刻与第二段的浮现在新这一趟里重新对齐。
    clearTimeout(panelAnimTimer)
    panelAnimTimer = window.setTimeout(() => {
      panelAnimating.value = false
      // 展开到底后把钉子校准到这一帧的实测宽度。折叠到底时外层已经收到 0，
      // 不能拿这个 0 去覆盖钉子 —— 下次展开还得用它。
      if (panelVisible.value) pinSidebarWidth()
    }, PANEL_LOCK_MS)
  })
}

// 轻点的位移上限（与触摸端「轻点 / 滑动」的判定口径一致）：超过它算拖拽，不算轻点
const TAP_SLOP = 10

function beginDrag(event) {
  if (running.value) return
  const surface = workspace.value
  if (!surface) return
  // 取消 pointerdown 会按规范抑制兼容的 mousedown/mouseup，用来阻断从分隔条起手的
  // 原生文字选中拖拽；配合 .workspace.is-dragging 的 user-select: none 双保险。
  // 注意别指望别的浏览器也像 Chrome 那样把 click 补回来——单击折叠 / 展开因此不依赖 click，
  // 而是在下面的 pointerup 上自己认（见 stop）。
  event.preventDefault()
  let moved = 0
  const startX = event.clientX
  const startY = event.clientY
  const limits = measureLimits()
  // 面板换到左侧后编辑器在右半边，拖拽方向要取反。
  const direction = panelPosition.value === 'right' ? 1 : -1
  // 可见时锚在分隔条当前宽度上（保证 1:1 跟手）；折叠后锚在虚拟比例 100% 上。
  // 折叠态不能用鼠标位置来锚（早先的写法）：现在分隔条停在图标栏左侧、不再贴窗口边缘，
  // 若把图标栏那 48px 算进「离边缘的距离」里，往外一拖就立刻越过 releaseShare 展开。
  // 锚在 100% 后，「往外拖 60px 才展开」仍是实打实的 60px 位移，与图标栏宽度无关。
  const startRaw = panelVisible.value ? editorShare.value : 100
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
    // 没怎么动的松手才算「单击」，拖过就不算 —— 拖到贴边那次折叠不能被松手这一下再翻回去。
    // 特意不看原生 click：pointerdown 里的 preventDefault 会抑制兼容鼠标事件，
    // 各浏览器补不补回 click 并不一致，所以在自己的 pointerup 上收口。
    if (upEvent.type !== 'pointerup' || moved > TAP_SLOP) return
    togglePanel()
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
  // Android 端先把随包编译器解到应用目录（首次几秒，之后瞬间返回）。**刻意不 await**：
  // 它只是把文件铺好，不参与下面任何一步；界面由 ToolchainGate 按状态铺遮罩。
  // 非 Android 上是空调用（见 nativeToolchain.js），桌面端与网页版都不受影响。
  void prepareNativeToolchain()
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
  window.removeEventListener('blur', onWindowBlur)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  disposeAutoSave?.()
  disposeAutoSave = null
  window.clearTimeout(staleTimer)
  window.clearTimeout(reclampTimer)
  window.clearTimeout(panelAnimTimer)
  abortController?.abort()
  layoutObserver?.disconnect()
  layoutObserver = null
  sidebarPinObserver?.disconnect()
  sidebarPinObserver = null
})
</script>

<template>
  <div class="app" :class="{ 'is-keyboard': keyboardMode, 'is-short': shortViewport }">
    <!-- 临时调试读数条：定位 Android 上「收键盘后点哪都回到输入框」，验完与本行一起删 -->
    <div v-if="IS_ANDROID" class="focus-probe">{{ focusProbe }}</div>
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
        @keydown.left.prevent="nudgeShare(-2)"
        @keydown.right.prevent="nudgeShare(2)"
      >
        <span class="splitter__line"></span>
        <span class="splitter__dots" aria-hidden="true"><i></i><i></i><i></i></span>
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
        :class="{
          'is-collapsed': !panelVisible,
          'is-animating': panelAnimating,
          'is-expanding': panelAnimating && panelVisible,
        }"
        :style="testsPaneStyle"
      >
        <!-- 定宽壳：宽度由 pinSidebarWidth 钉住，折叠动画期间内部的排版一动不动
             （is-fixed 只在量到过一次真实宽度后才上，见那里） -->
        <div ref="sidebarInner" class="pane__inner" :class="{ 'is-fixed': sidebarPinned }">
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
        </div>
      </section>

      <!-- 折叠后顶替侧栏的竖向图标栏（仿 VS Code 的 Activity Bar）：只在侧栏收起时出现，
           装在侧栏那一侧的最外侧（order 见 activityBarStyle）。展开时页头里仍是胶囊 + 齿轮那套，
           两者不会同时出现，所以入口没有重复。它与 .pane--tests 都参与分屏：固定 48px、
           不参与增长（编辑器是唯一 grow 的，剩下的宽度全归它）。
           折叠 / 展开那 200ms 里它也得留在排版里（宽度从 48px 收到 0，见 ActivityBar 的样式），
           所以 v-show 多带一个 panelAnimating。 -->
      <ActivityBar
        v-show="(!panelVisible || panelAnimating) && !mdFullscreen"
        :class="{ 'is-collapsed': !panelVisible, 'is-animating': panelAnimating }"
        :style="activityBarStyle"
        :panels="sidebarPanels"
        @select="selectSidebarPanel"
      />
    </main>

    <!-- Android 端首次准备随包编译器时的等待遮罩（固定定位，不参与上面的排版） -->
    <ToolchainGate />
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
  view-transition-name: pane-editor;
}

.pane--tests {
  flex: 1 1 auto;
  /* 侧边栏不再画自己那一圈 1px 边框（2026-10-10 试改）：`.pane` 统一给的 `border`
     在这里收掉，只保留圆角与面板底色。编辑器那半张卡仍带边框，所以「卡片」
     的语言只落在编辑器一侧；侧边栏靠底色与 4px 留白与编辑器分开。
     `border: none` 与 box-sizing: border-box 并存，外框尺寸不变，折叠态那条
     `border-width: 0` 与动画里那两条「让出朝向对方那条边」的规则随之变成空操作。 */
  border: none;
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
   收窄途中（is-animating）**刻意不隐藏**：那 200ms 里侧栏是被「推拉门」推出去的，内容
   得一路可见才推得动；动画收尾那一下另有 panel-ghost 兜着（见下）。

   两条属性是有分工的，别删掉任何一条：
   - visibility 让整块退出 Tab 序与无障碍树（折叠着还能 Tab 进那些看不见的行与输入框，
     本来就是个说不通的状态）；**但它是继承的、后代写 `visible` 就能顶掉** ——
     `TestCaseCard` 的 `.card__fold > .card__body` 正是这么写的（给折叠动画拆两端值用），
     所以只留它并不保险。
   - opacity 负责「一定不画」：它不继承、后代也顶不掉（整棵子树并进同一个合成组再按 0
     输出），将来谁往这层里加一个「自带满铺底色」的容器，也不会再从这 1px 里漏出来。
     它同样不进布局，getClientRects / offsetParent / ResizeObserver 的判据全部照旧
     （回归脚本与 syncSidebarPin 都读这些）。
   两条都不是 display：折叠态那张卡必须留在排版里（见上一条），摘掉内层也一样会
   打歪 syncSidebarPin 与 View Transitions 的快照。 */
.pane--tests.is-collapsed:not(.is-animating) .pane__inner {
  visibility: hidden;
  opacity: 0;
}

/* 收起 / 展开的这 200ms（曲线与布局切换同一支）。过渡只写在这个状态里，
   不常驻 —— 它在别处没有用武之地，挂着反而会拖慢两件本该瞬时的事：拖分隔条，
   以及窗口缩放时 reclampShare 重算宽度（那种场合编辑器是瞬时的，这里的滞后会让两栏
   的宽度之和短暂不等于 100%，看着像抖一下）。
   同时还有两件东西要让路，否则收缩会卡在半路：
   - min-width：上面那个 clamp() 的下限（宽屏 240px）会把宽度钉在那儿，收不下去；
   - flex-grow：basis 归零后它仍会从剩余空间里再分走一半（.pane--tests 是 flex: 1 1 auto），
     编辑器就涨不满。 */
.pane--tests.is-animating {
  transition: flex-basis 200ms cubic-bezier(0.22, 0.61, 0.36, 1);
  min-width: 0;
  flex-grow: 0;
}

/* 第二段：浮现。展开时侧栏页头那几颗控件与内容一起，等宽度那一段收得差不多了再淡入。
   延迟期间靠 backwards 停在 opacity 0 —— 所以宽度段整段里它们都是不存在的，
   不会出现「边被裁切擦出来、边淡入」两下打架。
   折叠方向刻意不挂这一下：那边侧栏是「被门遮掉」的，再叠一层淡出就成了
   「一边变淡一边收窄」，与推拉门的观感冲突（内层那层定宽壳的意思正在于此）；
   折叠侧的浮现落在图标栏那一边，见 ActivityBar.vue。
   只动 opacity / transform，不碰宽度 —— 不触发重排。 */
.pane--tests.is-animating.is-expanding :deep(.sidebar-switcher__pill svg),
.pane--tests.is-animating.is-expanding :deep(.sidebar-switcher__tab svg),
.pane--tests.is-animating.is-expanding :deep(.sidebar__body) {
  animation: panel-fade-in 120ms cubic-bezier(0.22, 0.61, 0.36, 1) 180ms backwards;
}

@keyframes panel-fade-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

/* 接缝。图标栏与侧栏在动画里是直接贴着的（两栏之间没有外边距），各自带一条 1px 边框，
   挨在一起就成了一条 2px 的「双线」，两端的 8px 圆角还背靠背 —— 运动中的接缝因此看着
   比静止时粗一倍。所以让**即将消失的那一侧**把朝着对方的那条边让出来：
   折叠时侧栏在收，让出朝着图标栏的那条；展开时图标栏在收，让出朝着侧栏的那条。
   只改颜色，不动 border-width —— 边框照旧占位，布局零影响。
   朝哪边由 .workspace 的 is-left / is-right 决定（模板上的 `is-${panelPosition}`）。 */
.workspace.is-left .pane--tests.is-animating:not(.is-expanding),
.workspace.is-right :deep(.activity-bar.is-animating:not(.is-collapsed)) {
  border-left-color: transparent;
}

.workspace.is-right .pane--tests.is-animating:not(.is-expanding),
.workspace.is-left :deep(.activity-bar.is-animating:not(.is-collapsed)) {
  border-right-color: transparent;
}

/* 残留。宽度段（200ms）走完后「要消失的那一侧」已经收到 0，但全局 border-box 加上
   左右各 1px 边框，边框盒最小就是 2px，收不到真正的 0；而闸门还要再压 100ms 才把元素
   摘掉（见 PANEL_LOCK_MS），那 100ms 里一条 2px 竖线是静止显形的（运动已经停了，
   所以反而比运动中的接缝更扎眼）。到点直接把它隐掉即可：visibility 不进布局、
   不触发重排，写法与上面那段浮现同源 —— 那边是 backwards 等入场，这边是 forwards 等收尾。
   「减弱动效」下 App 不给 is-animating，这些规则整段不存在（也没有 delay 空等的问题）。 */
.pane--tests.is-animating:not(.is-expanding),
.workspace :deep(.activity-bar.is-animating:not(.is-collapsed)) {
  animation: panel-ghost 1ms linear 200ms forwards;
}

@keyframes panel-ghost {
  to {
    visibility: hidden;
  }
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
   负外边距把热区左右各压进两侧卡片 4px，于是两块卡片实际只离 4px——
   热区宽度没缩水，中间的细线也仍在空隙正中。
   净空隙 = 12 − 4 − 4，改这里要连带改触屏那条负外边距与 .splitter__dots 的宽度 */
.splitter {
  flex: 0 0 12px;
  margin: 0 -4px;
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
   于是两块卡片的位置和间距与鼠标下逐像素一致（净空隙同为 4px）—— 只有可抓区域变宽，视觉一点没动。
   折叠态也走这一条（不再另写一条），所以触屏下折叠前后仍是同一个 24px 热区。 */
@media (pointer: coarse) {
  .splitter {
    flex: 0 0 24px;
    margin: 0 -10px;
  }
}

/* 折叠态的分隔条不再单独加宽。它以前贴窗口边缘（加宽到 24px 才抓得住），现在两侧是
   编辑器卡片和折叠图标栏、不是边缘；若在这里只加宽 flex-basis 而不同步负外边距，
   净空隙会从 4px 变成 16px —— 折叠前后两块卡片的间距就不一样了。
   折叠态因此直接用上面那条 12px 热区（触屏按媒体查询走 24px / −10px，净空隙同为 4px）。 */

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
   容器宽度正好等于两卡片之间的 4px 空隙（padding 0.5px × 2 + 点宽 3px），
   用底色把身后的细线遮掉，三个点才数得清，不会和线糊成一条；
   空隙改宽窄时这里要同步，宽了会溢到卡片上、窄了遮不住线 */
.splitter__dots {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 3px 0.5px;
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
   粘在元素上直到点了别处，于是点按折叠/展开后那条蓝线留在原处不灭；键盘焦点（上面的
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
