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
 * - 「设置」「Codeforces 抽题」是与代码文件平级的合成页签：它们显示时只是把 Monaco 藏起来
 *   （v-show，实例和 model 都留着），视图铺在同一层、同一时刻只亮一个。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { t } from '../i18n/index.js'
import { monaco } from '../monaco-setup.js'
import { formatCombo, useShortcutManager } from '../composables/useShortcutManager.js'
import { isTouchPointer } from '../composables/useMobileKeyboard.js'
import { activeDropZone, registerDropZone } from '../composables/useTreeDrag.js'
import { useEditorMenu } from '../composables/useEditorMenu.js'
import { useSelectionHandles } from '../composables/useSelectionHandles.js'
import { langMeta, langMetaByMonaco } from '../services/templates.js'
import { languageForPath } from '../services/monaco/language.js'
import { editorModelOptions, editorOptions } from '../services/editorOptions.js'
import { modelManager } from '../services/monaco/modelManager.js'
import { releaseSyntaxDiagnostics, scheduleSyntaxCheck } from '../services/monaco/syntaxDiagnostics.js'
import {
  anyViewOpen,
  cfContestTab,
  cfPickerTab,
  deactivateViews,
  settingsTab,
  viewActive,
} from '../services/editorViews.js'
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
import CfContestPanel from './CfContestPanel.vue'
import CfPickerPanel from './CfPickerPanel.vue'
import ContextMenu from './ContextMenu.vue'
import EditorSettingsPanel from './EditorSettingsPanel.vue'
import EditorTabs from './EditorTabs.vue'
import MarkdownPreview from './MarkdownPreview.vue'
import { MD_SHORTCUTS, MD_TOOL_GROUPS, formatMarkdown, markdownStats } from '../services/mdFormat.js'

const props = defineProps({
  settings: { type: Object, required: true },
  panelPosition: { type: String, required: true },
  timeLimit: { type: Number, required: true },
  // 全局内存上限（字节）：设置视图「评测」分组用，透传（见 services/runner.js 的 MEMORY_LIMIT_*）
  memoryLimit: { type: Number, required: true },
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
  'update:memory-limit',
  'update:ui-scale',
  'toggle-layout',
  'select-engine',
  'update-base',
  'test-connection',
])

const host = ref(null)
/** 内容区（Monaco / 预览 / 设置 / 空态都在这层里）—— 落点矩形、右键菜单与选区手柄的定位层都挂它 */
const stage = ref(null)
const editor = shallowRef(null)
const preview = ref(null)
const cursor = ref({ lineNumber: 1, column: 1 })
const selectedChars = ref(0)

// 编辑区的上下文菜单：桌面鼠标右键与触屏长按共用一份（见 composables/useEditorMenu.js）。
// 它同时负责拦掉 Monaco 自己的英文内置菜单。
const {
  menu: editorMenu,
  closeMenu: closeEditorMenu,
  onMenuSelect: onEditorMenuSelect,
  exportSelectionImage,
  ask: imageAsk,
  answerImageAction,
} = useEditorMenu({ editor, host })

// 询问弹窗一出现就把焦点送进「复制」：Enter / Esc 都能纯键盘走完（与删除确认同款）
const askCopyBtn = ref(null)
watch(imageAsk, (open) => {
  if (open) nextTick(() => askCopyBtn.value?.focus())
})

/**
 * 弹窗的答复口。取消时把焦点还给编辑器 —— 弹窗一撤焦点就落到 <body> 上，
 * 紧接着再按 ⌘P / 右键都会像失灵。触屏上不抢（键盘一弹视口会缩，见 useMobileKeyboard）。
 * @param {'copy' | 'save' | null} action
 */
function answerImage(action) {
  answerImageAction(action)
  if (!action && !isTouchPointer()) editor.value?.focus()
}

// 触屏选区手柄（见 composables/useSelectionHandles.js）：Monaco 没有这个能力，整层自己画。
// 只在触摸下出现，且编辑区真的露着时才出手柄 —— 被设置 / 抽题面板盖住时那一行是 v-show，
// 浮层若不收掉会浮在那些面板上面。
const handlesActive = computed(() => !viewActive.value && mdViewMode.value !== 'preview')
/** 放大镜那层的外壳：拖动时 v-if 出来，useSelectionHandles 往它里面搬编辑器的 DOM */
const magnifierEl = ref(null)
/**
 * 放大镜要**冒充一个 Monaco 编辑器**，搬过来的 DOM 才认得出那些样式：token 颜色是全局 `.mtk*` 规则，
 * 但选中 / 当前行 / 缩进参考线全是 `.monaco-editor .xxx` 前缀。所以跟着主编辑器的主题
 * 挂 `vs-dark` / `vs`（这是 Monaco `getThemeTypeSelector()` 的口径，不是站内的 dark / light）。
 */
const lensTheme = computed(() => (props.settings.theme === 'light' ? 'vs' : 'vs-dark'))
const {
  handles: selectionHandles,
  dragging: handlesDragging,
  probe: handleProbe,
  onHandleDown: onSelectionHandleDown,
} = useSelectionHandles({
  editor,
  host,
  stage,
  active: handlesActive,
  magnifier: magnifierEl,
})

// ------------------------------------------------------------ 拖文件到编辑区

/** 本组件登记给拖拽模块的落点；跟 activeDropZone 比同一个对象引用才知道该不该亮 */
const dropZone = shallowRef(null)
const isDropTarget = computed(() => dropZone.value !== null && activeDropZone.value === dropZone.value)

/**
 * 打开一个文件并把它固定成常开页签（已经开着就切过去，没开就新开一个）。
 *
 * 合成视图要主动让位 —— editorViews 只在 workspace.activeId **变化**时自动收回，
 * 而拖进来的文件如果本来就是当前活跃文件，activeId 压根不变（EditorTabs 的 activate 同理）。
 *
 * @param {string} id 节点 id
 */
async function openNodeById(id) {
  deactivateViews()
  try {
    await openFile(id, null)
  } catch {
    return // 拖到一半文件被删了之类：静默收场，没有行内位置可提示
  }
  // 它原本可能是预览页签：拖进来 / 刚导入的意思就是「固定住」
  pinTab(id)
}

/** 落点回调（站内拖拽，见 useTreeDrag 的 registerDropZone）：收的是节点 */
function openDroppedFile(node) {
  return openNodeById(node.id)
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

/** 编辑区空着的判据：没有活跃文件、也没有任何合成视图页签**开着**（anyViewOpen，
    不是 viewActive —— 页签开着但没盖着编辑器时（比如刚关掉最后一个代码页签），
    这条横栏必须留着，不然那两颗页签就凭空消失了（2026-10-10）。
    中间那块占位提示的条件在下面模板里另写，只看 viewActive：视图没盖上来时空态照旧露出。 */
const editorEmpty = computed(() => !activeNode.value && !anyViewOpen.value)

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
/** C++ 语法诊断的订阅（与题解预览互不相干，单独一条） */
let syntaxSub = null
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

  // C++ 语法诊断：内容一停手就跑一次 `-fsyntax-only`（防抖与「只让最新一枪落地」
  // 都在 services/monaco/syntaxDiagnostics.js 里）。工具链没加载时它自己会静默跳过。
  syntaxSub = instance.onDidChangeModelContent(() => scheduleSyntaxCheck(instance.getModel()))
  scheduleSyntaxCheck(instance.getModel(), { immediate: true })

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
  syntaxSub?.dispose()
  syntaxSub = null
  releaseSyntaxDiagnostics()
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
    // 切进一个 C++ 文件：内容没变就直接重放上次的标记，没查过就立刻查一次
    scheduleSyntaxCheck(model, { immediate: true })
    disposeInMemoryOrphans()
    const saved = viewStates.get(nextId)
    if (saved) instance.restoreViewState(saved)
    // 触屏上不抢焦点：点页签 / 点文件树只是「要看这个文件」，不该把软键盘唤起来。
    // 焦点本来就留在编辑器里（键盘弹着在改代码）的那种不受影响——这里只是不再主动 focus()，
    // 并没有 blur()，所以「键盘不许被自己收掉」那条口径照旧。
    if (!isTouchPointer()) instance.focus()
  },
)

// 改名换掉扩展名（如 main.cpp → notes.md）时 activeId 不变，上面那条 watch 不会响：
// 于是「仅 Markdown 隐藏」这一档行号仍停在上一个扩展名的状态上 —— 文件已成 .md，行号却还在。
// 这里专门盯「当前文件算不算题解」，一变就把选项重下发一次，并重挂预览的正文订阅
// （订阅只挂在题解上，见 trackMarkdown；.cpp 改名成 .md 后不重挂的话，预览不会跟着输入更新）。
watch(mdFileActive, () => {
  const instance = editor.value
  if (!instance) return
  const model = instance.getModel()
  instance.updateOptions(editorOptions(props.settings, props.uiScale, { markdown: mdFileActive.value }))
  trackMarkdown(model)
})

// ------------------------------------------------------------ 合成视图页签

// Monaco 在 display: none 的容器里量到的是 0 尺寸。automaticLayout 的 ResizeObserver
// 通常能在重新显示时自愈，但刚切回来那一帧仍可能用的是旧尺寸（滚动位置、概览标尺错位），
// 显式补一次 layout 最稳。
watch(viewActive, (active) => {
  if (active) return
  nextTick(() => editor.value?.layout())
})

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
  // ⌘ / Ctrl+P（快捷键 export-image）走这条：与右键菜单那一项是同一份实现，
  // 没有选区时它自己会静默返回
  exportImage: () => exportSelectionImage(),
  focus: () => {
    if (isTouchPointer()) return
    editor.value?.focus()
  },
  // 从外面把一个文件打开成常开页签（目前只有「从系统拖进来的单个文件」用，
  // 见 App.vue 的 importDroppedItems）：与拖到编辑区那条同源，都走 openNodeById
  openNode: (id) => openNodeById(id),
})
</script>

<template>
  <!-- is-md / is-status-off 只作用于状态栏的显隐，以及页签栏那条分隔线要不要留
       （见样式表末尾那组闸门 / EditorTabs 的「选中页签与编辑区连成一片」）。
       这里用 mdActive 而不是 mdFileActive：设成 mdFileActive 时，从 .md 切到设置 / 抽题
       这类合成视图，viewActive 变 true 但 activeId 没换（合成视图不占 activeId），
       mdFileActive 仍为 true，is-md 类不掉，刚去掉的分隔线就又会冒出来 -->
  <div
    class="editor-pane"
    :class="{ 'is-md': mdActive, 'is-status-off': !settings.statusBar }"
  >
    <!-- 全屏编辑时页签栏整条让位（Esc 或再点一次那颗按钮退出）；
         编辑区空着（没开任何文件、也没在看设置 / 抽题）时同样收掉那条空横条 -->
    <EditorTabs v-show="!mdFullscreen && !editorEmpty" />

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
        v-show="!viewActive"
        ref="host"
        class="editor-pane__host"
        :class="{ 'is-split': mdViewSplit, 'is-hidden': mdViewMode === 'preview' }"
      ></div>

      <!-- 触屏选区手柄：Monaco 没有「拖两端圆点改选区」的能力，这一层整块自己画
           （见 composables/useSelectionHandles.js）。坐标是相对 stage 的**盒子左上角**，
           由那边算好夹在编辑器可视区内；两颗手柄只在触摸下、有选区、且编辑区没被
           合成视图盖住时出现。z-index 取 4：压在编辑器正文之上、Monaco 自己的浮层
           （提示 / 补全）与站点菜单之下 -->
      <div
        v-if="selectionHandles"
        class="selection-handles"
        :class="{ 'is-dragging': handlesDragging }"
        aria-hidden="true"
      >
        <span
          v-if="selectionHandles.start"
          class="selection-handle selection-handle--start"
          :class="{
            'is-knob-down': selectionHandles.start.down,
            'is-knob-up': !selectionHandles.start.down,
          }"
          :style="{ left: `${selectionHandles.start.left}px`, top: `${selectionHandles.start.top}px` }"
          @pointerdown="onSelectionHandleDown('start', $event)"
          @contextmenu.prevent
        ></span>
        <span
          v-if="selectionHandles.end"
          class="selection-handle selection-handle--end"
          :class="{
            'is-knob-down': selectionHandles.end.down,
            'is-knob-up': !selectionHandles.end.down,
          }"
          :style="{ left: `${selectionHandles.end.left}px`, top: `${selectionHandles.end.top}px` }"
          @pointerdown="onSelectionHandleDown('end', $event)"
          @contextmenu.prevent
        ></span>
      </div>

      <MarkdownPreview
        v-show="mdViewPreview"
        ref="preview"
        class="editor-pane__preview"
        :class="{ 'is-split': mdViewSplit }"
        :source="mdSource"
        :visible="mdViewPreview"
        @scroll="onPreviewScroll"
      />

      <!-- Codeforces 抽题：可选模块的视图，与设置同形态（都是编辑区里的一个合成页签）。
           v-show 保状态：切走再切回来，表单值与抽到的题目都还在（偏好另有 usePersistentRef 落盘） -->
      <CfPickerPanel v-show="cfPickerTab.active" />

      <!-- Codeforces 比赛：同一形态的第三个合成页签（入口在侧栏那颗按钮唤出的
           组件菜单里）。同样 v-show 常挂，切走再切回来那场与题目列表都还在 -->
      <CfContestPanel v-show="cfContestTab.active" />

      <!-- 设置视图与 Monaco 同一层，靠 v-show 互斥：切来切去不重建编辑器，
           也不重挂设置组件（它的运行环境探针订阅只建立一次） -->
      <EditorSettingsPanel
        v-show="settingsTab.active"
        :settings="settings"
        :panel-position="panelPosition"
        :time-limit="timeLimit"
        :memory-limit="memoryLimit"
        :judge="judge"
        :connection="connection"
        :active="settingsTab.active"
        :ui-scale="uiScale"
        @update:settings="emit('update:settings', $event)"
        @update:time-limit="emit('update:time-limit', $event)"
        @update:memory-limit="emit('update:memory-limit', $event)"
        @update:ui-scale="emit('update:ui-scale', $event)"
        @toggle-layout="emit('toggle-layout')"
        @select-engine="emit('select-engine', $event)"
        @update-base="emit('update-base', $event)"
        @test-connection="emit('test-connection')"
      />

      <div v-if="!activeNode && !viewActive" class="editor-pane__empty">
        <AppIcon name="code" :size="26" class="editor-pane__empty-icon" />
        <p>{{ t('app.emptyEditor') }}</p>
      </div>

      <!-- 从资源管理器把文件拖到编辑区时的落点提示：与「拖到根文件区域」同款颜色。
           必须排在 stage 最后 —— 里面几层都是 inset: 0 的绝对定位、没有 z-index，
           谁在后面谁在上面。pointer-events: none，否则会把命中和 Monaco 一起挡住 -->
      <div v-if="isDropTarget" class="editor-pane__drop" aria-hidden="true"></div>
    </div>

    <!-- 状态栏说的都是活跃文件的事（行列、语言、空格数），看着合成视图时它没有意义；
         题解下要不要收掉见样式表末尾那组闸门 -->
    <footer v-if="activeNode && !viewActive" class="editor-pane__status">
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

    <!-- 编辑区的右键 / 长按菜单。组件自己 Teleport 到 body，所以挂在哪一层都行 -->
    <ContextMenu
      v-if="editorMenu"
      :x="editorMenu.x"
      :y="editorMenu.y"
      :items="editorMenu.items"
      @select="onEditorMenuSelect"
      @close="closeEditorMenu"
    />

    <!-- 「生成图片」之后那一次询问：复制还是保存（设置项 codeImageAsk 关掉时不会走到这里）。
         自绘弹窗，Teleport 到 body —— 与资源管理器那份删除确认同款（不用 window.confirm，
         原生弹窗在装成应用窗口打开时返回值不由我们掌控）。 -->
    <Teleport to="body">
      <div v-if="imageAsk" class="image-ask" @pointerdown.self="answerImage(null)">
        <div
          class="image-ask__card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="image-ask-title"
          @keydown.esc.stop.prevent="answerImage(null)"
        >
          <p id="image-ask-title" class="image-ask__title">{{ t('app.imageAsk.title') }}</p>
          <p class="image-ask__desc">{{ t('app.imageAsk.desc') }}</p>
          <div class="image-ask__actions">
            <button type="button" class="image-ask__btn" @click="answerImage(null)">
              {{ t('app.cancel') }}
            </button>
            <button
              type="button"
              class="image-ask__btn"
              @click="answerImage('save')"
            >
              {{ t('app.imageAsk.save') }}
            </button>
            <button
              ref="askCopyBtn"
              type="button"
              class="image-ask__btn image-ask__btn--primary"
              @click="answerImage('copy')"
            >
              {{ t('app.imageAsk.copy') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 拖手柄时的放大镜：手指本身把落点附近的代码挡住了，就把那一片**原尺寸**搬到手指上方
         （iOS 的放大镜是同一个动机，只是那边会放大；这边要的是「看得见手指底下是什么」，
         1:1 反而更好读，所以 LENS_ZOOM 是 1，见 useSelectionHandles.js）。
         位置与镜片尺寸由 useSelectionHandles.js 算好送过来，
         内容（三层 DOM 的克隆）也由那边搬，这里只管画壳子。
         Teleport 到 body + fixed：**不能挂在 .selection-handles 里** —— 那层有 overflow: hidden
         （裁手柄盒子伸出去的部分），手指贴着编辑器上沿时镜片会被整颗裁掉。
         `monaco-editor` + 主题类名是关键：搬进来的 `.view-lines` / `.view-overlays` /
         `.cursors-layer` 靠它继承 token 与选中样式（不能开第二个 Monaco 实例，主题是全局单例）。
         ⚠️ 整条链路必须 pointer-events: none：它是编辑器 DOM 之外的元素，一旦压在手指落点上，
         Monaco 的 getTargetAtClientPoint 会命中它而返回 position: null，拖动当场卡死
         （详见 useSelectionHandles.js 文件头那条 ⚠️）。 -->
    <Teleport to="body">
      <div
        v-if="handleProbe"
        ref="magnifierEl"
        class="magnifier monaco-editor"
        :class="[lensTheme, { 'is-below': handleProbe.below }]"
        :style="{
          left: `${handleProbe.left}px`,
          top: `${handleProbe.top}px`,
          '--probe-lens-w': `${handleProbe.lensW}px`,
          '--probe-lens-h': `${handleProbe.lensH}px`,
          '--probe-gap': `${handleProbe.gap}px`,
        }"
        aria-hidden="true"
      >
        <div class="magnifier__lens">
          <div class="magnifier__snapshot lines-content">
            <div class="magnifier__overlays view-overlays"></div>
            <div class="magnifier__lines view-lines"></div>
            <div class="magnifier__cursors cursors-layer"></div>
            <!-- 正在拖的那两颗手柄也搬进来（否则镜片里看不出手指抓着哪一端）。
                 放在最后 = 画在最上层，与真实里 .selection-handles 压在正文之上一致。 -->
            <div class="magnifier__handles"></div>
          </div>
        </div>
        <span class="magnifier__beam"></span>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.editor-pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100%;
  /* 与两套 Monaco 主题的 editor.background 保持一致，卡片才是一块完整的圆角面。
     用 --bg-editor-pane 而不是 --bg-panel：编辑区要比侧栏/输出/设置那些面板再暗一档 */
  background: var(--bg-editor-pane);
}

.editor-pane__stage {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
}

.editor-pane__host {
  position: absolute;
  inset: 0;
  /* iOS 长按会在我们自己的菜单之外再弹一份系统菜单（拷贝 / 查询 + 放大镜），两套叠在一起。
     关掉系统那份（Monaco 自己管选区，不受影响）。见 composables/useEditorMenu.js。 */
  -webkit-touch-callout: none;
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

/* ------------------------------------------------------------ 触屏选区手柄 */

/* 浮层本身不吃事件，只有两颗手柄吃（否则整块编辑区都被这一层盖住）。
   overflow 同时干两件事：裁掉盒子里那点为了凑满 44px 触摸目标而伸到编辑器外的透明部分，
   以及让被裁掉的那部分**不参与命中测试**（否则它会盖住页签栏 / 状态栏上的一条）。
   圆点由 useSelectionHandles.js 夹在可视区内，不会被裁到。 */
.selection-handles {
  position: absolute;
  inset: 0;
  /* 压在编辑器正文之上；Monaco 自己的浮层（提示 / 补全，z-index 40+）与站点菜单（120）仍在上 */
  z-index: 4;
  overflow: hidden;
  pointer-events: none;
}

/* 盒子 44×44 是触摸目标的最小尺寸；**尺寸必须与 useSelectionHandles.js 的 HANDLE_BOX 一致**
   （那边读 --ui-scale 再乘上去做夹取，两边对不上手柄就会偏离选区端点）。
   圆点与杆都是伪元素画的，盒子本身透明 —— 起点那盒往文字上方伸、终点那盒往下方伸，
   两块都不会盖住被选中的那一行。 */
.selection-handle {
  position: absolute;
  width: 44px;
  height: 44px;
  pointer-events: auto;
  /* 「按住再拖」三件套之一：这一层自己处理手势，别交给浏览器去滚页面 */
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}

/* 拖动中把两颗手柄都设成对命中测试隐身（pointer-events: none 的元素会被
   `document.elementFromPoint` 跳过）。不这么做的话，手指移进手柄自己那 44px 的盒子时，
   Monaco 的 `getTargetAtClientPoint` 会命中手柄这个「编辑器之外的元素」而返回 position: null，
   拖动当场卡死 —— 详见 composables/useSelectionHandles.js 文件头那条 ⚠️。
   拖动本身不受影响：pointermove / pointerup 挂在 window 上，触摸另有隐式指针捕获。 */
.selection-handles.is-dragging .selection-handle {
  pointer-events: none;
}

/* 圆点：两个手柄共用，位置由下面的 --start / --end 各自摆 */
.selection-handle::before {
  content: '';
  position: absolute;
  left: 50%;
  width: 16px;
  height: 16px;
  margin-left: -8px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.45);
}

/* 杆：把圆点接到选区端点那一条文字边上，不然圆点看着像凭空飘着 */
.selection-handle::after {
  content: '';
  position: absolute;
  left: 50%;
  width: 2px;
  height: 10px;
  margin-left: -1px;
  background: var(--accent);
}

/* 圆点与杆摆在哪一端，**只由每颗手柄自己的朝向类**决定（`place()` 每次都给出 `down`，见
   useSelectionHandles.js 的 `knobDirection()`）。**不能**再挂在 `.selection-handles` 上：
   拖动期间两颗可能朝不同方向 —— 手指抓着的那颗保持在「抓它时」的那一侧（按下去不跳开手指），
   另一颗背离镜片（免得被 z-index 118 的镜片整颗盖住）。
   is-knob-down：圆点贴盒子**顶边**（＝盒子挂在端点下方）；is-knob-up：贴**底边**（＝挂在上方）。
   ⚠️ 镜片里那颗是 `innerHTML` 克隆的，`data-v-*` 跟着过来，同一组选择器对克隆副本照样命中。 */
.selection-handle.is-knob-down::before {
  top: 6px;
  bottom: auto;
}

.selection-handle.is-knob-down::after {
  top: 0;
  bottom: auto;
}

.selection-handle.is-knob-up::before {
  bottom: 6px;
  top: auto;
}

.selection-handle.is-knob-up::after {
  bottom: 0;
  top: auto;
}

/* ------------------------------------------- 拖动时的放大镜胶囊 */

/* 外层只管定位：left / top 是手指的视口坐标（由 useSelectionHandles.js 算好），
   translate 把「镜片 + 光束」整条的底边抬到手指上方 —— 光束撑开的那段就是 LENS_GAP。
   **不加 transition**：位置每帧都在变，加了会拖出残影。
   ⚠️ pointer-events: none 必须一路继承到镜片：它是编辑器 DOM 之外的元素，压在落点上会让
   Monaco 的 getTargetAtClientPoint 返回 position: null，拖动当场卡死（同上面那两颗手柄）。
   z-index 118：压在手柄之上，但仍低于菜单（120）/ 确认框（130）/ 通知（150）——
   它是拖动期间的附属指示，不该盖住任何一层可交互的东西。 */
.magnifier {
  position: fixed;
  z-index: 118;
  display: flex;
  flex-direction: column;
  align-items: center;
  transform: translate(-50%, -100%);
  pointer-events: none;
  /* ⚠️ 必须显式抹掉底色。挂 `monaco-editor` 这个类是给搬进来的 DOM 认样式用的，
     但 Monaco 自己也有一条 `.monaco-editor { background-color: var(--vscode-editor-background) }`
     —— 那会给这层「定位壳」糊上一整块「镜片 + 光束」那么大的不透明底，把光束两侧的真实代码盖掉
     （实测：不加这句，手指那一行会被这块底压暗）。底色只属于镜片。 */
  background: none;
}

/* 上方放不下就翻到手指下方：整条上下镜像（光束旋 180°，梯形与渐变跟着一起翻）。
   两种朝向都是「整条的远端贴着手指定点，光束（= LENS_GAP 那么长）从那里连到镜片」 */
.magnifier.is-below {
  flex-direction: column-reverse;
  transform: translate(-50%, 0);
}

/* 镜片。尺寸由 JS 送来的三个变量撑开（常量只留 useSelectionHandles.js 那一份，
   这边不重复写死，见那边的 LENS_* 注释）。
   **胶囊形**：`border-radius: 999px` 在大值上恒被夹成「高的一半」，于是两端各是半个圆、
   上下两条边笔直 —— 半径不跟着宽高走，改尺寸不用同步改这个数。
   注意胶囊两端是圆的：正中间那一条（也就是手指所在那一行）才是满宽，
   越往上下，两侧收得越多，所以纵向别指望看到整行的开头和结尾。
   overflow: hidden 是必须的：搬进来的是**整屏宽**的内容，全靠这一层裁成一块。 */
.magnifier__lens {
  position: relative;
  width: var(--probe-lens-w);
  height: var(--probe-lens-h);
  overflow: hidden;
  border-radius: 999px;
  background: var(--probe-bg);
  border: 1px solid var(--probe-border);
  box-shadow: var(--probe-shadow);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  /* 按下即弹出来的一下；松手是直接撤（不做退场）—— 拖完立刻清干净比留个淡出更利索 */
  animation: magnifier-in 120ms ease-out;
}

/* 搬进来的内容层。三块克隆都是「整屏宽」的绝对定位层（`.view-line` 的内联 top / left
   就是内容坐标，见 useSelectionHandles.js 文件头），位移每帧由 JS 写在 transform 上。
   transform-origin **必须是 0 0**：反向位移的算式就是 `translate + 倍数 × 内容坐标`。
   lines-content / view-overlays / view-lines / cursors-layer 那几个类名是给 Monaco 的
   样式选择器用的，别删 —— `.view-line` 的绝对定位、`.cslr`、缩进参考线全靠它们命中。 */
.magnifier__snapshot {
  position: absolute;
  left: 0;
  top: 0;
  width: 100vw;
  height: 0;
  transform-origin: 0 0;
  will-change: transform;
}

.magnifier__overlays,
.magnifier__lines,
.magnifier__cursors,
.magnifier__handles {
  position: absolute;
  left: 0;
  top: 0;
  width: 100vw;
  height: 0;
}

/* ⚠️ 搬进来的手柄必须把 pointer-events 重新钉死。
   `.selection-handle` 自己写了 `pointer-events: auto`（不写就抓不住拖动），而
   `pointer-events: none` 是**允许后代改回来**的：镜片整条链要求对命中测试隐身
   （见 useSelectionHandles.js 文件头那条 ⚠️），漏一颗手柄出来，手指落点就变成被镜片命中，
   Monaco 的 getTargetAtClientPoint 返回 position: null，拖动当场卡死。
   拖动期间真实那两颗本来就是 none（`.selection-handles.is-dragging`），这里只是照着钉一遍。 */
.magnifier__handles .selection-handle {
  pointer-events: none;
}

/* 搬过来的选中层在胶囊里没有焦点，Monaco 会按「窗口失焦」用 inactiveSelectionBackground
   （灰的）画 —— 覆盖成常亮那支，看着才和编辑器里拖选时一致。
   只能这样覆盖：Monaco 的主题是全局单例，`defineTheme` + `setTheme` 会把主编辑器一起改掉。 */
.magnifier.monaco-editor {
  --vscode-editor-inactiveSelectionBackground: var(--vscode-editor-selectionBackground);
}

/* 光束：把镜片和手指连起来，长度就是 LENS_GAP（改这里也要同步那边）。
   **上宽下窄**的梯形 —— 镜片那头宽、指头那头窄（多边形下边收成 38%–62%）；
   渐变同向：`0deg` = 零度指向上，第一档落在**下边**，也就是指头那头最实、往镜片那头化开。
   两条都朝镜片「张」、朝指头「收」，看着像是从指尖射向镜片的一道光。 */
.magnifier__beam {
  width: 18px;
  height: var(--probe-gap);
  background: linear-gradient(0deg, var(--probe-beam), transparent);
  clip-path: polygon(0 0, 100% 0, 62% 100%, 38% 100%);
}

.magnifier.is-below .magnifier__beam {
  transform: rotate(180deg);
}

@keyframes magnifier-in {
  from {
    opacity: 0;
    transform: scale(0.94);
  }

  to {
    opacity: 1;
    transform: scale(1);
  }
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

/* 空编辑区正中的图标：宽度取面板的一半（正方形，随面板缩放），
   高度上限再收一道 —— 面板很矮时不让它把下面那行提示顶出画面。
   stroke-width 是 viewBox 单位、跟着一起放大，所以不需要另调线宽 */
.editor-pane__empty-icon {
  width: 50%;
  height: auto;
  max-height: 50%;
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
  background: var(--statusbar-bg);
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

/* ---------------------------------------------------------------- 生成图片：复制还是保存
   与资源管理器那份删除确认同款（Teleport 到 body，色值只吃主题变量）。
   样式不共用是因为那份写在 FileExplorer 的 scoped 里 —— 抽出来会动到资源管理器，
   这里只有一处消费，先各留一份。 */
.image-ask {
  position: fixed;
  inset: 0;
  /* 与删除确认同一层（高于右键菜单 120，低于系统级浮层） */
  z-index: 130;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.32);
}

.image-ask__card {
  width: min(340px, 100%);
  padding: 14px;
  border: 1px solid var(--border-soft);
  border-radius: 10px;
  background: var(--bg-raised);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.34);
}

.image-ask__title {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 650;
  color: var(--text);
}

.image-ask__desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-dim);
}

.image-ask__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}

.image-ask__btn {
  padding: 5px 14px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-panel);
  color: var(--text);
  font: 500 12.5px/1.5 var(--font-sans, system-ui);
  cursor: pointer;
}

.image-ask__btn:hover {
  background: var(--bg-hover);
}

/* 主按钮 = 「复制」：与「题目信息」弹窗那颗保存同款强调色 */
.image-ask__btn--primary {
  border-color: transparent;
  background: var(--accent);
  color: var(--text-on-accent);
}

.image-ask__btn--primary:hover {
  background: var(--accent-hover);
}

.image-ask__btn:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
}
</style>
