<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import EditorPane from './components/EditorPane.vue'
import TestPanel from './components/TestPanel.vue'
import Sidebar from './components/Sidebar.vue'
import FileExplorer from './components/FileExplorer.vue'
import { usePersistentRef } from './composables/usePersistentRef.js'
import { useCompanionImport } from './composables/useCompanionImport.js'
import { useMobileKeyboard } from './composables/useMobileKeyboard.js'
import { actionForCombo, comboFromEvent, recordingActive } from './composables/useShortcutManager.js'
import { DEFAULT_ENGINE_ID, defaultBases, getEngine } from './services/engines/index.js'
import { runCases, TIME_LIMIT_DEFAULT_MS } from './services/runner.js'
import { initWorkspace } from './services/vfs/migrate.js'
import {
  activeLanguage,
  activeNode,
  initWorkspaceStore,
  peekActiveContent,
  saveAll,
} from './services/vfs/workspaceStore.js'
import { modelManager } from './services/monaco/modelManager.js'
import { deactivateSettingsTab, openSettingsTab, settingsTab } from './services/settingsTab.js'
import {
  EDITOR_SETTINGS_DEFAULTS,
  normalizeEditorSetting,
} from './services/editorOptions.js'

// ---------------------------------------------------------------- 持久化状态
// panelPosition 是本项目的核心偏好：'right' | 'left'，默认在右侧。
const panelPosition = usePersistentRef('cph.panelPosition', 'right')
// 是否显示统一侧边栏（只影响显隐，文件树展开态与用例数据都不丢）
const panelVisible = usePersistentRef('cph.panelVisible', true)
// 语言不独立持久化：由活跃文件扩展名派生（activeLanguage），顶栏已无语言下拉
const editorShare = usePersistentRef('cph.editorShare', 60)
const engineId = usePersistentRef('cph.engine', DEFAULT_ENGINE_ID)
const judgeBases = usePersistentRef('cph.judgeBases', defaultBases())
// 全局时限（毫秒，只计运行段）：所有用例统一，超了判 TLE
const timeLimitMs = usePersistentRef('cph.timeLimitMs', TIME_LIMIT_DEFAULT_MS)

// ------------------------------------------------------------ 编辑器偏好
const EDITOR_SETTINGS_KEY = 'cph.editorSettings'
// 存档版本号只用于一次性迁移主题（见 readEditorSettings）
const EDITOR_SETTINGS_VERSION_KEY = 'cph.editorSettingsVersion'
const EDITOR_SETTINGS_VERSION = 3
// 默认值、可选项表、逐键校验、以及「偏好 → Monaco 选项」的映射都在 services/editorOptions.js
const EDITOR_SETTING_KEYS = Object.keys(EDITOR_SETTINGS_DEFAULTS)

function readEditorSettings() {
  try {
    const raw = window.localStorage.getItem(EDITOR_SETTINGS_KEY)
    if (!raw) return { ...EDITOR_SETTINGS_DEFAULTS }
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return { ...EDITOR_SETTINGS_DEFAULTS }
    // v3 之前主题只作用于编辑器（选项有 vs-dark / vs / hc-black），这里换算成新的两套：
    // 原本选浅色 vs 的迁到浅色，其余一律回默认深色。只做一次，之后按键是白名单。
    if (
      Number(window.localStorage.getItem(EDITOR_SETTINGS_VERSION_KEY)) < EDITOR_SETTINGS_VERSION &&
      parsed.theme === 'vs'
    ) {
      parsed.theme = 'cph-light'
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
    connection.value = { state: 'idle', message: '该引擎未提供自检接口' }
    return
  }
  connectionProbe?.abort()
  connectionProbe = new AbortController()
  connection.value = { state: 'checking', message: '探测中' }
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

const testCases = usePersistentRef('cph.testCases', [
  createCase({ input: '1 2', expectedOutput: '3' }),
  createCase({ input: '-8 15', expectedOutput: '7' }),
], {
  // 只持久化用户手写的内容，运行结论每次打开都重新来。
  serialize: (list) => list.map(({ input, expectedOutput }) => ({ input, expectedOutput })),
  revive: (list) =>
    Array.isArray(list) ? list.map((item) => createCase({ input: item?.input ?? '', expectedOutput: item?.expectedOutput ?? '' })) : [],
})

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
const editorPaneStyle = computed(() => ({
  order: panelPosition.value === 'right' ? 1 : 3,
  ...(panelVisible.value ? { flexBasis: `${editorShare.value}%` } : {}),
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
  // 宽屏下它恒等于 cap，也就是改版前那个固定 320px。
  const cssNumber = (name, fallback) => {
    const value = Number.parseFloat(style.getPropertyValue(name))
    return Number.isFinite(value) ? value : fallback
  }
  const panelMin = Math.max(
    cssNumber('--tests-min-floor', 160),
    Math.min(cssNumber('--tests-min-cap', 320), width * cssNumber('--tests-min-ratio', 0.5)),
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

async function runAll() {
  if (running.value) {
    abortController?.abort()
    return
  }
  if (!testCases.value.length) return
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
    timeLimitMs: timeLimitMs.value,
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
  if (!activeLanguage.value) return
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
      timeLimitMs: timeLimitMs.value,
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
  'toggle-panel': () => togglePanel(),
  'switch-panel': () => switchSidebarPanel(),
  'toggle-layout': () => toggleLayout(),
  'new-case': () => addCase(),
  'open-settings': () => (settingsTab.active ? deactivateSettingsTab() : openSettingsTab()),
}

function onKeydown(event) {
  // 输入法组字期间的按键不算快捷键（否则拼音选词会被当成命令）
  if (event.isComposing) return
  // 正在录制快捷键：全局这条在捕获阶段，永远早于录制框自己的监听，得主动让路
  if (recordingActive.value) return

  const actionId = actionForCombo(comboFromEvent(event))
  const handler = actionId ? SHORTCUT_HANDLERS[actionId] : null
  if (!handler) return
  event.preventDefault()
  // 拦住后续传播：既不让 Monaco 再按自己的内置键位处理一遍（如 Ctrl+Enter 会在下方插入一行），
  // 也不让页面里其它监听重复响应
  event.stopPropagation()
  handler()
}

// ------------------------------------------------------- 浏览器扩展导入题目
// 扩展推来的题目由 problemImport 落进 VFS，并顺手把编辑器切过去；这里补两脚：
// 1) 抓到的样例整体替换评测面板（新题来了，旧题目的样例已经作废）；
// 2) 若这道题本就开着、activeId 没变，EditorPane 的 watch 不响，得自己把焦点抢回编辑区。
useCompanionImport({
  setTestCases: (tests) => {
    testCases.value = tests.map((test) => createCase(test))
  },
  onImported: () => editorPane.value?.focus(),
})

onMounted(async () => {
  // 捕获阶段：见上面 onKeydown 的说明（要抢在 Monaco 之前）
  window.addEventListener('keydown', onKeydown, true)
  // 初始化 VFS（含旧草稿迁移）→ 恢复上次会话的 tab 与 model
  try {
    await initWorkspace()
    await initWorkspaceStore()
  } catch {
    /* 存储不可用时静默；界面仍可使用 */
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown, true)
  window.clearTimeout(staleTimer)
  abortController?.abort()
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
          @update:settings="updateEditorSettings"
          @update:time-limit="timeLimitMs = $event"
          @toggle-layout="toggleLayout"
          @select-engine="selectEngine"
          @update-base="updateBase"
          @test-connection="testConnection"
        />
      </section>

      <div
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
        v-show="panelVisible"
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
     所以头部不会是「谁都不肯缩、最后叠在一起」。 */
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
     窄屏不再是硬邦邦的 240px，否则 375px 的屏上编辑器会被压成一条缝 */
  min-width: clamp(var(--tests-min-floor), calc(var(--tests-min-ratio) * 100%), var(--tests-min-cap));
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
