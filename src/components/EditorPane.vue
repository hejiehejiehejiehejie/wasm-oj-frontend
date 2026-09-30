<script setup>
/**
 * EditorPane —— 编辑器面板（多标签、单编辑器组）。
 *
 * 重构要点：
 * - Monaco 实例只建一次，切文件只 editor.setModel()，绝不重建（HANDOFF 硬约束）；
 * - model 全部来自 ModelManager（按 fileId 单例，多分屏时可共享）；
 * - ViewState 按 fileId 在本面板内保存/恢复；
 * - ⌘S 保存当前文件；运行键不在这里注册 —— 全局快捷键挂在 window 捕获阶段，
 *   抢在 Monaco 之前就把按键拦走了（见 composables/useShortcutManager.js）。
 *   题解那 14 条格式键位是例外：它们只该在 .md 里生效，所以反过来注册在这里，
 *   靠 `editorLangId == markdown` 划作用域（见 registerMarkdownActions）；
 * - 「设置」是与代码文件平级的合成页签：它显示时只是把 Monaco 藏起来（v-show，
 *   实例和 model 都留着），设置视图铺在同一层。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { t } from '../i18n/index.js'
import { monaco } from '../monaco-setup.js'
import { formatCombo, useShortcutManager } from '../composables/useShortcutManager.js'
import { isTouchPointer } from '../composables/useMobileKeyboard.js'
import { activeDropZone, registerDropZone } from '../composables/useTreeDrag.js'
import { langMeta, langMetaByMonaco } from '../services/templates.js'
import { languageForPath } from '../services/monaco/language.js'
import { editorModelOptions, editorOptions } from '../services/editorOptions.js'
import { modelManager } from '../services/monaco/modelManager.js'
import { deactivateSettingsTab, settingsTab } from '../services/settingsTab.js'
import {
  MD_VIEW_MODES,
  MD_VIEW_SHORTCUT,
  exitFullscreen,
  mdActive,
  mdFileActive,
  mdFullscreen,
  mdViewMode,
  mdViewPreview,
  mdViewSplit,
  setMdView,
  toggleMdFullscreen,
} from '../services/mdView.js'
import {
  activeLanguage,
  activeNode,
  openFile,
  pinTab,
  saveActive,
  workspace,
} from '../services/vfs/workspaceStore.js'
import AppIcon from './AppIcon.vue'
import EditorSettingsPanel from './EditorSettingsPanel.vue'
import EditorTabs from './EditorTabs.vue'
import MarkdownPreview from './MarkdownPreview.vue'
import { MD_SHORTCUTS, MD_TOOL_GROUPS, formatMarkdown, markdownStats } from '../services/mdFormat.js'

const props = defineProps({
  settings: { type: Object, required: true },
  panelPosition: { type: String, required: true },
  timeLimit: { type: Number, required: true },
  // 评测引擎状态：只有设置视图里的「评测」分组用得到，这里只做透传
  judge: { type: Object, required: true },
  connection: { type: Object, required: true },
  // 全局界面缩放比例：Monaco 在 postcss 黑名单里，它的尺寸不吃 rem，
  // 必须由这里乘进 editorOptions（见 services/editorOptions.js）
  uiScale: { type: Number, required: true },
})

const emit = defineEmits([
  'update:settings',
  'update:time-limit',
  'update:ui-scale',
  'toggle-layout',
  'select-engine',
  'update-base',
  'test-connection',
])

const host = ref(null)
const editor = shallowRef(null)
const preview = ref(null)
const cursor = ref({ lineNumber: 1, column: 1 })
const selectedChars = ref(0)

// ------------------------------------------------------------ 拖文件到编辑区

/** 内容区（Monaco / 预览 / 设置 / 空态都在这层里）—— 落点矩形与高亮层都挂它 */
const stage = ref(null)
/** 本组件登记给拖拽模块的落点；跟 activeDropZone 比同一个对象引用才知道该不该亮 */
const dropZone = shallowRef(null)
const isDropTarget = computed(() => dropZone.value !== null && activeDropZone.value === dropZone.value)

/**
 * 拖进来的文件：已经开着就切到那个页签，没开就常开一个（固定，不是预览页签）。
 *
 * 设置视图要主动让位 —— settingsTab 只在 workspace.activeId **变化**时自动收回，
 * 而拖进来的文件如果本来就是当前活跃文件，activeId 压根不变（EditorTabs 的 activate 同理）。
 */
async function openDroppedFile(node) {
  deactivateSettingsTab()
  try {
    await openFile(node.id, null)
  } catch {
    return // 拖到一半文件被删了之类：静默收场，没有行内位置可提示
  }
  // 它原本可能是预览页签：落进来的意思就是「固定住」
  pinTab(node.id)
}

/** 注销函数，onBeforeUnmount 里调 */
let unregisterDropZone = null

// ------------------------------------------------------------ 题解（.md）
// 题解不判题、只编辑，于是多出一行工具栏（视图模式）与一块预览面板。
// 模式状态本身在 services/mdView.js —— App 也要读它（全屏时收掉侧栏与页签）。

/** 视图模式按钮的图标，键即模式名 */
const MD_VIEW_ICONS = { edit: 'edit', split: 'split', preview: 'eye' }

/** 工具栏与预览都只对题解有意义，且设置视图盖上来时整块让位（判据与 App 共用一份） */
const mdBarVisible = mdActive

/** 预览的正文来源：活跃 model 的当前内容 */
const mdSource = ref('')

/** 工具栏右端的「N 字 · M 行」：跟着 mdSource 走，不必再单独订阅一次 model */
const mdStats = computed(() => markdownStats(mdSource.value))

/** 链接 / 图片的填写行；null 即收起来 */
const insertForm = ref(null)
const insertFirst = ref(null)
const insertUrl = ref(null)

// 只用于状态栏那枚「运行」提示：键位可改，提示得跟着变
const { bindings } = useShortcutManager()

/** 本面板各文件的视图状态（滚动 / 光标 / 折叠） @type {Map<string, unknown>} */
const viewStates = new Map()

/**
 * 状态栏的语言标签。判题语言（cpp/python，.c 也归 cpp）走 activeLanguage；
 * .md 这类不参与判题的文件 activeLanguage 是 null，只能按扩展名反查标签；
 * 未登记的扩展（.txt 等）沿用旧行为——这一格留空。
 */
const langLabel = computed(() => {
  if (activeLanguage.value) return langMeta(activeLanguage.value).label
  const path = activeNode.value?.path
  if (!path) return ''
  const monacoId = languageForPath(path)
  return monacoId === 'plaintext' ? '' : (langMetaByMonaco(monacoId)?.label ?? '')
})

/**
 * Monaco 在 editor.create 且未指定 model 时会自动造一个 inmemory://model/1。
 * 挂上真正的 VFS model 后它就是孤儿（永远不会被 UI 使用），及时销毁。
 */
function disposeInMemoryOrphans() {
  const attached = editor.value?.getModel()
  for (const model of monaco.editor.getModels()) {
    if (model.uri.scheme === 'inmemory' && model !== attached) model.dispose()
  }
}

/**
 * tabSize / insertSpaces 是 model 级选项（EditorOption 里没有它们），
 * 给它俩走 editor.create() / updateOptions() 会被 Monaco 静默丢掉。
 * 所以每挂上一个 model 都要补一次，否则新 model 会退回 4 空格默认值。
 */
function applyModelOptions(model) {
  model?.updateOptions(editorModelOptions(props.settings))
}

// ------------------------------------------------------------ 题解：正文与滚动

/** 当前订阅着内容变化的 model（切文件时先退订旧的） */
let contentSub = null
/** 「编辑器 → 预览」那一侧的 rAF 句柄，用来把连续滚动合并成一帧一次 */
let scrollFrame = 0

/**
 * 把预览的正文接到刚挂上的 model 上。
 * 只在题解上订阅 onDidChangeContent：cpp / python 用不到预览，每敲一个字取一遍全文纯属白干。
 */
function trackMarkdown(model) {
  contentSub?.dispose()
  contentSub = null
  mdSource.value = model?.getValue() ?? ''
  if (model && mdFileActive.value) {
    contentSub = model.onDidChangeContent(() => {
      mdSource.value = model.getValue()
    })
  }
}

/* ------------------------------------------------------------ 题解工具栏 */

/**
 * 按下工具栏任一按钮。
 * 全部变换都交给 services/mdFormat.js 的纯函数算，这里只负责「取选区 → 落地 → 回位」。
 * 两条纪律：
 * 1) 走 executeEdits 而不是改 model 的全文（后者会把撤销栈连根拔掉，用户按一次 Ctrl+Z 直接回到解放前）；
 * 2) 按钮上挂了 @mousedown.prevent，焦点始终留在编辑器里，所以这里拿到的就是用户当下的选区，
 *    也不需要在末尾 focus() 抢一次焦点。
 */
function runTool(action) {
  if (action === 'link' || action === 'image') openInsert(action)
  else applyTool(action)
}

/** @returns {boolean} 是否真的改了文档 */
function applyTool(action, options) {
  const instance = editor.value
  const model = instance?.getModel()
  if (!instance || !model) return false

  const ranges = instance.getSelections().map((selection) => ({
    start: model.getOffsetAt(selection.getStartPosition()),
    end: model.getOffsetAt(selection.getEndPosition()),
  }))
  const result = formatMarkdown(action, model.getValue(), ranges, options)
  if (!result?.edits.length) return false

  // 前后各推一个撤销点：一次按键正好是一步 Ctrl+Z
  instance.pushUndoStop()
  instance.executeEdits(
    'md-toolbar',
    result.edits.map((edit) => ({
      range: monaco.Range.fromPositions(model.getPositionAt(edit.start), model.getPositionAt(edit.end)),
      text: edit.text,
    })),
  )
  instance.setSelections(
    result.selections.map((selection) => {
      const from = model.getPositionAt(selection.start)
      const to = model.getPositionAt(selection.end)
      return new monaco.Selection(from.lineNumber, from.column, to.lineNumber, to.column)
    }),
  )
  instance.pushUndoStop()
  return true
}

function openInsert(kind) {
  const instance = editor.value
  const model = instance?.getModel()
  const selection = instance?.getSelection()
  const picked = selection && !selection.isEmpty() ? model.getValueInRange(selection) : ''
  // 显示文字直接用选中的那段（链接最常见的就是「把这句话变成链接」）；
  // 图片的描述是给读屏用的，不该拿正文里碰巧选中的话来充数，所以留空
  insertForm.value = { kind, label: kind === 'image' ? '' : picked, url: '', error: '' }
  nextTick(() => {
    const target = kind === 'image' || !picked ? insertFirst.value : insertUrl.value
    target?.focus()
  })
}

function commitInsert() {
  const form = insertForm.value
  if (!form) return
  const url = form.url.trim()
  if (!isHttpUrl(url)) {
    form.error = t('app.md.insert.invalidUrl')
    return
  }
  applyTool(form.kind, { label: form.label.trim(), url })
  insertForm.value = null
}

function cancelInsert() {
  insertForm.value = null
}

/** 只认 http / https：题解里的地址会被预览渲染成可点链接，别的协议不该混进来 */
function isHttpUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/* -------------------------------------------------------- 题解快捷键（Monaco） */

/** 题解快捷键的作用域：只在 .md 里算数（键位表见 services/mdFormat.js 的 MD_SHORTCUTS） */
const MD_SCOPE = 'editorLangId == markdown'

/** 组合键里的修饰键 → Monaco 的位标志 */
const MONACO_MODS = {
  Mod: monaco.KeyMod.CtrlCmd,
  Ctrl: monaco.KeyMod.WinCtrl,
  Alt: monaco.KeyMod.Alt,
  Shift: monaco.KeyMod.Shift,
}

/**
 * `Mod+Shift+KeyE` → Monaco 的键位整数。
 *
 * 键码部分直接取 monaco.KeyCode 的同名成员：内部写法用的就是 KeyboardEvent.code
 * （KeyB / Backslash / Digit1…），而 Monaco 的 KeyCode 恰好是同一套命名，不必再维护一张对照表。
 * 认不出的写法返回 0，调用方跳过 —— 宁可少一条，也别绑成一个按下去静默不响的键。
 */
function monacoKeybinding(combo) {
  let keys = 0
  for (const part of combo.split('+')) {
    const bits = MONACO_MODS[part] ?? monaco.KeyCode[part]
    if (!bits) return 0
    keys |= bits
  }
  return keys
}

/**
 * 把题解快捷键一次性注册到 Monaco。
 *
 * 【为什么只注册这一次】Monaco 0.56 的 ICodeEditor 只有 addCommand、没有 removeCommand，
 * 每换一次文件或语言就重注册一遍，旧键位会永远留在键位表里（这正是全局快捷键当初从
 * addCommand 搬到 window 捕获阶段的原因，见 useShortcutManager 的文件头）。
 * 所以这里注册一次就不再动，作用域全部交给 precondition 在按键那一刻判定。
 *
 * 【与全局快捷键的关系】⌘B、⌘⇧E 与全局的「收侧栏」「翻侧栏面板」同键，焦点在编辑器里时
 * 由 App.vue 的 onKeydown 主动让路，按键才会走到这里（那边有详细说明）。
 *
 * 【⌘\ 不在这里】轮换视图模式改的是「编辑区怎么摆」，与光标在哪无关 —— 切到「仅预览」时
 * 编辑器整块被藏起来、焦点已经不在里面，Monaco 的 addAction 就再也收不到那一发了。
 * 所以那一条走 App.vue 的全局监听（按活跃文件是不是 .md 划作用域）。
 */
function registerMarkdownActions(instance) {
  const add = (id, labelKey, combo, run) => {
    const keys = monacoKeybinding(combo)
    if (!keys) return
    instance.addAction({
      id: `cp.md.${id}`,
      // 这一格只在 Monaco 自己的命令列表里露脸（本应用没有把它挂进右键菜单），
      // 取不到 translate 后的实时语言也无妨，就地取一次当前语言
      label: t(labelKey),
      keybindings: [keys],
      precondition: MD_SCOPE,
      run,
    })
  }

  for (const [action, combo] of Object.entries(MD_SHORTCUTS)) {
    add(action, `app.md.tool.${action}`, combo, () => runTool(action))
  }
}

/** 工具栏的悬浮提示：动作名 + 键位。键位是这条动作唯一的「说明书」，只能挂在这儿 */
function toolTitle(action) {
  return t('app.md.toolHint', {
    name: t(`app.md.tool.${action}`),
    key: formatCombo(MD_SHORTCUTS[action]),
  })
}

/**
 * 「预览 → 编辑器」那一次 setScrollTop 的回音判据（与 MarkdownPreview 里同一套做法）：
 * 比数值而不是挂布尔标志 —— Monaco 派发滚动事件的时机与浏览器并不一致，标志会漏掉。
 */
let expectedRatio = null
const ECHO_EPSILON = 0.01

function editorScrollRatio() {
  const instance = editor.value
  if (!instance) return 0
  const range = instance.getScrollHeight() - instance.getLayoutInfo().height
  return range > 0 ? instance.getScrollTop() / range : 0
}

/** 编辑器滚了：把预览带到同一比例 */
function onEditorScroll() {
  if (!mdViewSplit.value) return
  const ratio = editorScrollRatio()
  if (expectedRatio !== null && Math.abs(ratio - expectedRatio) < ECHO_EPSILON) {
    expectedRatio = null
    return
  }
  expectedRatio = null
  window.cancelAnimationFrame(scrollFrame)
  scrollFrame = window.requestAnimationFrame(() => preview.value?.syncScroll(ratio))
}

/** 预览滚了：同一比例落到编辑器上 */
function onPreviewScroll(ratio) {
  const instance = editor.value
  if (!instance || !mdViewSplit.value) return
  const range = instance.getScrollHeight() - instance.getLayoutInfo().height
  if (range <= 0) return
  const next = ratio * range
  // 位置没变就不会有回音。不先挡一下的话 expectedRatio 会一直挂着，
  // 把「碰巧滚到同一比例」的那一次真实滚动当成回音吞掉
  if (Math.abs(instance.getScrollTop() - next) < 1) return
  expectedRatio = ratio
  instance.setScrollTop(next)
}

/**
 * 全屏编辑的退出键。挂在 window 的**捕获**阶段：Monaco 自己的 Esc（关查找框、关补全）
 * 挂在编辑器内部的 DOM 上，而捕获是由外往内走的 —— 这样才轮得到我们判断这次 Esc 归谁。
 * 那些浮层开着时不抢：用户按 Esc 显然是想关浮层，不是想退出全屏。
 */
function onWindowKeydown(event) {
  if (event.key !== 'Escape' || !mdFullscreen.value) return
  const overlayOpen = document.querySelector(
    '.monaco-editor .find-widget.visible, .monaco-editor .suggest-widget.visible',
  )
  if (overlayOpen) return
  event.preventDefault()
  event.stopPropagation()
  exitFullscreen()
}

onMounted(() => {
  const instance = monaco.editor.create(host.value, {
    // 用户可调的选项全部来自 services/editorOptions.js（构造与 updateOptions 共用同一份映射）
    ...editorOptions(props.settings, props.uiScale, { markdown: mdFileActive.value }),
    theme: props.settings.theme,
    // 布局必须跟着容器走（面板拖宽 / 换边 / 折叠侧边栏）：交给 Monaco 自己的 ResizeObserver
    automaticLayout: true,
    overviewRulerBorder: false,
    fixedOverflowWidgets: true,
  })
  editor.value = instance

  // 启动时安静挂上当前 model（不抢焦点；会话恢复已建好 model）
  if (workspace.activeId) {
    const model = modelManager.getExistingModel(workspace.activeId)
    if (model) {
      instance.setModel(model)
      applyModelOptions(model)
      trackMarkdown(model)
    }
  }
  disposeInMemoryOrphans()

  instance.onDidScrollChange(onEditorScroll)
  window.addEventListener('keydown', onWindowKeydown, true)

  instance.onDidChangeCursorPosition((event) => {
    cursor.value = { lineNumber: event.position.lineNumber, column: event.position.column }
  })

  instance.onDidChangeCursorSelection((event) => {
    selectedChars.value = instance.getModel()?.getValueInRange(event.selection)?.length ?? 0
  })

  instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
    saveActive().catch(() => {})
  })

  // 题解那 14 条格式键位是唯一的例外：它们按语言划作用域，只能走 Monaco 自己的 addAction
  registerMarkdownActions(instance)

  monaco.editor.setTheme(props.settings.theme)

  // 登记成拖拽落点：文件从资源管理器拖到编辑区 = 打开 / 跳转页签（目录不接，那是移动语义）
  dropZone.value = {
    el: stage.value,
    canDrop: (node) => node.type === 'file',
    onDrop: openDroppedFile,
  }
  unregisterDropZone = registerDropZone(dropZone.value)
})

onBeforeUnmount(() => {
  unregisterDropZone?.()
  unregisterDropZone = null
  window.removeEventListener('keydown', onWindowKeydown, true)
  window.cancelAnimationFrame(scrollFrame)
  contentSub?.dispose()
  contentSub = null
  editor.value?.dispose()
  editor.value = null
})

// ------------------------------------------------------------ 切文件（只换 model）

watch(
  () => workspace.activeId,
  (nextId, previousId) => {
    const instance = editor.value
    if (!instance) return
    if (previousId) viewStates.set(previousId, instance.saveViewState())

    if (!nextId) {
      instance.setModel(null)
      trackMarkdown(null)
      return
    }
    const model = modelManager.getExistingModel(nextId)
    if (!model) return
    instance.setModel(model)
    applyModelOptions(model)
    // 行号「仅 Markdown 隐藏」这一档取决于当前文件：切进 .md / 切回代码文件都要把选项重下发一次，
    // 否则行号会跟着上一个文件的状态留在屏幕上
    instance.updateOptions(editorOptions(props.settings, props.uiScale, { markdown: mdFileActive.value }))
    trackMarkdown(model)
    disposeInMemoryOrphans()
    const saved = viewStates.get(nextId)
    if (saved) instance.restoreViewState(saved)
    // 触屏上不抢焦点：点页签 / 点文件树只是「要看这个文件」，不该把软键盘唤起来。
    // 焦点本来就留在编辑器里（键盘弹着在改代码）的那种不受影响——这里只是不再主动 focus()，
    // 并没有 blur()，所以「键盘不许被自己收掉」那条口径照旧。
    if (!isTouchPointer()) instance.focus()
  },
)

// ------------------------------------------------------------ 设置页签

// Monaco 在 display: none 的容器里量到的是 0 尺寸。automaticLayout 的 ResizeObserver
// 通常能在重新显示时自愈，但刚切回来那一帧仍可能用的是旧尺寸（滚动位置、概览标尺错位），
// 显式补一次 layout 最稳。
watch(
  () => settingsTab.active,
  (active) => {
    if (active) return
    nextTick(() => editor.value?.layout())
  },
)

// 摆法变了就把编辑器重量一遍：全屏与视图模式是两个独立开关，任一变化都会改到它的宽度，
// 补一次 layout 最稳（automaticLayout 的反应没那么及时）
watch([mdViewMode, mdFullscreen], () => nextTick(() => editor.value?.layout()))

// 离开题解（切走文件、打开设置）就把没填完的填写行收掉：它的 v-if 虽然跟着工具栏一起消失，
// 但状态还在，下次进题解会平白冒出来一条上次的残留
watch(mdActive, (active) => {
  if (!active) insertForm.value = null
})

// ------------------------------------------------------------ 编辑器设置

// 所有可调项一次性交给 updateOptions（映射见 editorOptions.js）：逐项写 watch 的写法
// 每加一项设置都要在两处同步，漏一处就是「面板里有、编辑器不认」。主题是唯一的例外，
// 它必须走 setTheme；tabSize / insertSpaces 也要单独落到 model 上（model.updateOptions
// 只在值真的变了时才发事件，所以这里无条件补一次是安全的）。
watch(
  () => props.settings,
  (next, prev) => {
    const instance = editor.value
    if (!instance) return
    instance.updateOptions(editorOptions(next, props.uiScale, { markdown: mdFileActive.value }))
    applyModelOptions(instance.getModel())
    if (prev?.theme !== next.theme) monaco.editor.setTheme(next.theme)
  },
  { deep: true },
)

// 全局缩放变化：Monaco 的 DOM 在 postcss 黑名单里，根本感知不到根字号变了，
// 必须把乘过 scale 的选项重新下发一次；容器尺寸同步也变了，再补一次 layout 最稳。
watch(
  () => props.uiScale,
  (scale) => {
    const instance = editor.value
    if (!instance) return
    instance.updateOptions(editorOptions(props.settings, scale, { markdown: mdFileActive.value }))
    nextTick(() => instance.layout())
  },
)

// focus 给「从外部把焦点送回编辑区」用（扩展导入题目后 activeId 可能没变，
// 上面那个 watch 不会响，只能由调用方补一次）。触屏上同样不抢焦点，理由见上。
defineExpose({
  layout: () => editor.value?.layout(),
  focus: () => {
    if (isTouchPointer()) return
    editor.value?.focus()
  },
})
</script>

<template>
  <!-- is-md / is-status-off 只作用于状态栏的显隐，见样式表末尾那组闸门 -->
  <div
    class="editor-pane"
    :class="{ 'is-md': mdFileActive, 'is-status-off': !settings.statusBar }"
  >
    <!-- 全屏编辑时页签栏整条让位（Esc 或再点一次那颗按钮退出） -->
    <EditorTabs v-show="!mdFullscreen" />

    <!-- 题解工具栏：左边文本格式与插入，右边字数与视图模式 -->
    <div v-if="mdBarVisible" class="editor-pane__bar">
      <!-- 一组按钮一条竖线分隔。窄面板下这一组横向滚动（min-width: 0 + overflow），
           字数与视图按钮钉在右边不跟着滚 -->
      <div class="md-tools" role="toolbar" :aria-label="t('app.md.toolGroup')">
        <template v-for="(group, index) in MD_TOOL_GROUPS" :key="index">
          <span v-if="index" class="md-tools__split"></span>
          <button
            v-for="action in group"
            :key="action"
            type="button"
            class="md-tool"
            :title="toolTitle(action)"
            :aria-label="t(`app.md.tool.${action}`)"
            @mousedown.prevent
            @click="runTool(action)"
          >
            <AppIcon :name="action" :size="16" />
          </button>
        </template>
      </div>

      <span class="grow"></span>

      <span class="md-stats">{{ t('app.md.stats.chars', { count: mdStats.chars }) }} · {{ t('app.md.stats.lines', { count: mdStats.lines }) }}</span>

      <!-- 三段是「选一个」，键位却是「挨个轮换」，所以键位挂在整组身上而不是某一段上 -->
      <div
        class="view-switch"
        role="group"
        :aria-label="t('app.md.view.label')"
        :title="t('app.md.view.cycleHint', { key: formatCombo(MD_VIEW_SHORTCUT) })"
      >
        <button
          v-for="mode in MD_VIEW_MODES"
          :key="mode"
          type="button"
          class="view-switch__item"
          :class="{ 'is-active': mdViewMode === mode }"
          :title="t(`app.md.view.${mode}`)"
          :aria-pressed="mdViewMode === mode"
          @click="setMdView(mode)"
        >
          <AppIcon :name="MD_VIEW_ICONS[mode]" :size="15" />
        </button>
      </div>

      <!-- 全屏是独立开关（不是第四种模式）：勾上之后「仅预览」「双栏」照样选得动，
           只是整块占满窗口而已 -->
      <button
        type="button"
        class="view-toggle"
        :class="{ 'is-active': mdFullscreen }"
        :title="t(mdFullscreen ? 'app.md.view.exitFullscreen' : 'app.md.view.fullscreen')"
        :aria-pressed="mdFullscreen"
        @click="toggleMdFullscreen"
      >
        <AppIcon :name="mdFullscreen ? 'collapse' : 'expand'" :size="15" />
      </button>
    </div>

    <!-- 链接 / 图片的填写行：贴在工具栏下面另起一行，不做浮层 ——
         省掉了点外部关闭与层级打架两件事，而且它就在按钮正下方，不容易找不着 -->
    <form
      v-if="mdBarVisible && insertForm"
      class="md-insert"
      @submit.prevent="commitInsert"
      @keydown.esc.prevent="cancelInsert"
    >
      <div class="md-insert__row">
        <span class="md-insert__title">
          {{ t(insertForm.kind === 'image' ? 'app.md.insert.image' : 'app.md.insert.link') }}
        </span>
        <input
          ref="insertFirst"
          v-model="insertForm.label"
          class="md-insert__input"
          :placeholder="insertForm.kind === 'image' ? t('app.md.insert.alt') : t('app.md.insert.label')"
        />
        <input
          ref="insertUrl"
          v-model="insertForm.url"
          class="md-insert__input is-url"
          type="text"
          inputmode="url"
          :placeholder="t('app.md.insert.url')"
        />
        <button type="submit" class="md-insert__btn is-primary">{{ t('app.md.insert.confirm') }}</button>
        <button type="button" class="md-insert__btn" @click="cancelInsert">{{ t('app.cancel') }}</button>
      </div>
      <p v-if="insertForm.error" class="md-insert__error">{{ insertForm.error }}</p>
    </form>

    <div class="editor-pane__stage" ref="stage">
      <!-- Monaco 的挂载点永远不重建：分栏只是让它把右半边让出来（改 inset），
           仅预览则整块藏起来（visibility，不是 display:none —— 编辑器保持原尺寸，
           切回来不必重新排版，也就不会闪一下） -->
      <div
        v-show="!settingsTab.active"
        ref="host"
        class="editor-pane__host"
        :class="{ 'is-split': mdViewSplit, 'is-hidden': mdViewMode === 'preview' }"
      ></div>

      <MarkdownPreview
        v-show="mdViewPreview"
        ref="preview"
        class="editor-pane__preview"
        :class="{ 'is-split': mdViewSplit }"
        :source="mdSource"
        :visible="mdViewPreview"
        @scroll="onPreviewScroll"
      />

      <!-- 设置视图与 Monaco 同一层，靠 v-show 互斥：切来切去不重建编辑器，
           也不重挂设置组件（它的运行环境探针订阅只建立一次） -->
      <EditorSettingsPanel
        v-show="settingsTab.active"
        :settings="settings"
        :panel-position="panelPosition"
        :time-limit="timeLimit"
        :judge="judge"
        :connection="connection"
        :active="settingsTab.active"
        :ui-scale="uiScale"
        @update:settings="emit('update:settings', $event)"
        @update:time-limit="emit('update:time-limit', $event)"
        @update:ui-scale="emit('update:ui-scale', $event)"
        @toggle-layout="emit('toggle-layout')"
        @select-engine="emit('select-engine', $event)"
        @update-base="emit('update-base', $event)"
        @test-connection="emit('test-connection')"
      />

      <div v-if="!activeNode && !settingsTab.active" class="editor-pane__empty">
        <AppIcon name="code" :size="26" class="editor-pane__empty-icon" />
        <p>{{ t('app.emptyEditor') }}</p>
      </div>

      <!-- 从资源管理器把文件拖到编辑区时的落点提示：与「拖到根文件区域」同款颜色。
           必须排在 stage 最后 —— 里面几层都是 inset: 0 的绝对定位、没有 z-index，
           谁在后面谁在上面。pointer-events: none，否则会把命中和 Monaco 一起挡住 -->
      <div v-if="isDropTarget" class="editor-pane__drop" aria-hidden="true"></div>
    </div>

    <!-- 状态栏说的都是活跃文件的事（行列、语言、空格数），看设置时它没有意义；
         题解下要不要收掉见样式表末尾那组闸门 -->
    <footer v-if="activeNode && !settingsTab.active" class="editor-pane__status">
      <span class="opt-file">{{ activeNode.name }}</span>
      <span class="dot opt-file"></span>
      <span class="opt-utf8">UTF-8</span>
      <span class="dot opt-utf8"></span>
      <span>{{ t('app.status.spaces', { count: settings.tabSize }) }}</span>
      <span class="grow"></span>
      <span v-if="selectedChars" class="picked">
        {{ t('app.status.selected', { count: selectedChars }) }}
      </span>
      <span>{{ t('app.status.cursor', { line: cursor.lineNumber, column: cursor.column }) }}</span>
      <span class="dot opt-lang"></span>
      <span class="opt-lang">{{ langLabel }}</span>
      <span class="dot"></span>
      <span :title="t('app.runAllTests')">{{ formatCombo(bindings.run) }}</span>
    </footer>
  </div>
</template>

<style scoped>
.editor-pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100%;
  /* 与两套 Monaco 主题的 editor.background 保持一致，卡片才是一块完整的圆角面 */
  background: var(--bg-panel);
}

.editor-pane__stage {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
}

.editor-pane__host {
  position: absolute;
  inset: 0;
}

/* 双栏：编辑器让出右半边，预览占另一半。两边各占 50% 是刻意的 ——
   这一版不做中间那条可拖的分隔线（整块工作区的分屏已经能拖了，编辑器内部再套一层
   会让人分不清拖的是哪一条） */
.editor-pane__host.is-split {
  right: 50%;
}

/* 仅预览：编辑器让位但仍按原尺寸待着，切回来即用 */
.editor-pane__host.is-hidden {
  visibility: hidden;
}

.editor-pane__preview {
  position: absolute;
  inset: 0;
}

.editor-pane__preview.is-split {
  left: 50%;
  border-left: 1px solid var(--border-soft);
}

/* 拖文件到编辑区的落点提示：与资源管理器「拖到根区域」用同一个变量，两套主题自动跟随 */
.editor-pane__drop {
  position: absolute;
  inset: 0;
  background: var(--bg-drop-root);
  pointer-events: none;
}

/* ------------------------------------------------------------ 题解工具栏 */

.editor-pane__bar {
  flex: 0 0 34px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  background: var(--bg-panel-head);
  border-bottom: 1px solid var(--border-soft);
}

.editor-pane__bar .grow {
  flex: 1 1 auto;
}

/* 14 颗按钮在双栏、窄屏下摆不下：这一组自己横向滚动（min-width: 0 是关键，
   否则 flex 子项的最小内容宽度会把整条工具栏撑破），右侧的字数与视图按钮不跟着滚 */
.md-tools {
  flex: 0 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 2px;
  overflow-x: auto;
  scrollbar-width: none;
}

.md-tools::-webkit-scrollbar {
  display: none;
}

.md-tools__split {
  flex: 0 0 auto;
  width: 1px;
  height: 17px;
  margin: 0 6px;
  background: var(--border-soft);
}

/* 悬停只提亮图标与底色，不给按钮本身加边框：14 个框排一排会显得很吵 */
.md-tool {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 26px;
  border-radius: 5px;
  color: var(--text-dim);
}

.md-tool:hover {
  color: var(--text);
  background: var(--bg-control-hover);
}

/* 字数用等宽字：数字跳动时宽度不会来回抖 */
.md-stats {
  flex: 0 0 auto;
  color: var(--text-dim);
  font: 400 12px/1 var(--font-mono, ui-monospace, monospace);
  white-space: nowrap;
}

/* 三颗视图按钮 + 一颗全屏开关：与侧栏那颗胶囊同一套视觉语言（选中段是实心蓝），
   但它们都是可点的，所以老老实实用 <button>，不做「纯视觉元素」那套 */
.view-switch {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border-radius: 6px;
  background: var(--bg-control);
}

.view-switch__item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 24px;
  border-radius: 5px;
  color: var(--text-dim);
}

.view-switch__item:hover {
  color: var(--text);
  background: var(--bg-control-hover);
}

.view-switch__item.is-active {
  color: var(--text-on-accent);
  background: var(--accent);
}

/* 全屏开关：单独一颗，和那条三段的胶囊留出 8px（就是工具栏的 gap）区分开
   —— 它不是「第四种模式」，是叠在模式之上的一层；尺寸对齐胶囊整体高度 28px */
.view-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  color: var(--text-dim);
  background: var(--bg-control);
}

.view-toggle:hover {
  color: var(--text);
  background: var(--bg-control-hover);
}

.view-toggle.is-active {
  color: var(--text-on-accent);
  background: var(--accent);
}

/* 链接 / 图片的填写行：贴在工具栏下面，底色比工具栏深一档，像一张摊开的小卡片 */
.md-insert {
  flex: 0 0 auto;
  padding: 7px 10px;
  background: var(--bg-panel);
  border-bottom: 1px solid var(--border-soft);
}

.md-insert__row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.md-insert__title {
  flex: 0 0 auto;
  color: var(--text-dim);
  font-size: 12px;
  white-space: nowrap;
}

.md-insert__input {
  flex: 1 1 auto;
  min-width: 0;
  height: 28px;
  padding: 0 9px;
  background: var(--bg-input);
  border: 1px solid var(--border-soft);
  border-radius: 4px;
  color: var(--text);
  font-size: 12.5px;
}

.md-insert__input:focus {
  border-color: var(--accent);
  outline: none;
}

/* 地址那一格给到两倍宽：显示文字通常很短，地址往往很长 */
.md-insert__input.is-url {
  flex: 2 1 auto;
}

.md-insert__btn {
  flex: 0 0 auto;
  height: 28px;
  padding: 0 12px;
  border-radius: 4px;
  color: var(--text);
  background: var(--bg-control);
  font-size: 12.5px;
}

.md-insert__btn:hover {
  background: var(--bg-control-hover);
}

.md-insert__btn.is-primary {
  color: var(--text-on-accent);
  background: var(--accent);
}

.md-insert__error {
  margin-top: 5px;
  color: var(--danger-text);
  font-size: 11px;
  line-height: 1.4;
}

.editor-pane__empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-faint);
  pointer-events: none;
}

.editor-pane__empty p {
  margin: 0;
  font-size: 13px;
}

.editor-pane__empty-icon {
  opacity: 0.5;
}

.editor-pane__status {
  flex: 0 0 22px;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 12px;
  font-size: 11.5px;
  color: var(--statusbar-text);
  background: var(--accent);
  /* 状态栏自身当容器：窄到放不下时由下面的 @container 逐项摘掉信息。
     不能挂在上层的 .editor-pane 上 —— container-type 带 layout 包含，
     会让它成为 position: fixed 后代的包含块，Monaco 的 fixedOverflowWidgets
     弹出的建议框就会错位。另外收住横向溢出，免得挤不下的部分画到面板外面 */
  container-type: inline-size;
  overflow: hidden;
}

/* 各项按内容宽度定死且不换行：默认的 flex-shrink: 1 会把「行 1，列 1」折成两行、
   把中文压成竖排，这就是「挤在一起」的成因。宽度不够时交给 @container 摘掉整项，
   留下来的项内部始终单行 */
.editor-pane__status > span {
  flex: 0 0 auto;
  white-space: nowrap;
}

.editor-pane__status .grow {
  flex: 1 1 auto;
}

.editor-pane__status .dot {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.5;
}

.editor-pane__status .picked {
  color: var(--text-on-accent);
  font-weight: 550;
}

/* 由窄到宽逐项隐藏：UTF-8 是常量、文件名在页签栏已经有一份，先摘这两项，
   再窄才轮到语言。每一项都连着身后的分隔点一起隐藏，避免留下孤零零一个圆点
   （opt-lang 的那颗点在前，所以跟着自己走）。阈值按无选中文本时的实测宽度取整，
   改字号或增删状态栏项后要重新量。
   阈值写成 rem 是为了全局缩放：postcss-pxtorem 不处理 at-rule 参数（见 vite.config.js），
   写成 px 的话界面放大后状态栏会提前挤爆，断点却还停在原地。 */
@container (max-width: 22.5rem) {
  .editor-pane__status .opt-utf8 {
    display: none;
  }
}

@container (max-width: 19.375rem) {
  .editor-pane__status .opt-file {
    display: none;
  }
}

@container (max-width: 15.625rem) {
  .editor-pane__status .opt-lang {
    display: none;
  }
}

/* 状态栏的四道闸门，统一放在这里 —— 都是「这 22px 此刻不值得占」，就不必分两种写法 */

/* 1) 题解（.md）下恒收掉：这条栏说的全是代码的事（判题语言 / 缩进宽度 / 行列），
   写题解时纯属噪音，而且它是一整条实心蓝，压在一屏散文底下太抢眼 */
.editor-pane.is-md .editor-pane__status {
  display: none;
}

/* 2) 设置里关掉了（默认开）。这一项不进 Monaco，只是面板自己的偏好 */
.editor-pane.is-status-off .editor-pane__status {
  display: none;
}

/* 3) / 4) 视口矮下去也收掉：矮视口下编辑区高度更值钱。这两道各管一半，不冲突：
   @media 看的是布局视口，桌面拖窗、Android 键盘都会缩它；
   .app.is-short 由 useMobileKeyboard 按 visualViewport 写，专管 iOS 键盘那种
   只缩可视视口、布局视口一动不动的情况。
   写 479 而不是 480：口径是「高度**小于** 480」，与 JS 那边的 `< 480` 等价 */
@media (max-height: 479px) {
  .editor-pane__status {
    display: none;
  }
}

.app.is-short .editor-pane__status {
  display: none;
}
</style>
