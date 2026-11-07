/**
 * pasteIndentGuard —— 手机输入法把整段代码「粘贴」进来时，别让每一行越缩越深。
 *
 * 【症状】手机上用键盘自带的「粘贴」贴一段带缩进的代码，贴完以后每一行都比上一行多一层缩进，
 * 整段呈阶梯状。桌面 Ctrl+V、以及站内菜单的「粘贴」都不会这样。
 *
 * 【根因（2026-11-07 实测：无头 Chrome + CDP `Input.insertText`，它走的正是 IME 提交通道）】
 * 1. 手机上的「粘贴」不是 `paste` 事件，是 IME 提交。Chrome 走 `NativeEditContext`（EditContext
 *    API），**一次 `textupdate` 带整段文本，而 DOM 上连一条 `beforeinput` / `input` 都收不到**
 *    （探针实测：document 上零事件）。不支持 EditContext 的浏览器退回隐藏 textarea，那时才有
 *    `beforeinput`（一次带整段，`cancelable: true`）。
 * 2. Monaco 收到这整段后自己按行拆开、**逐字符** type，行与行之间那一次仍走 `EnterOperation`。
 * 3. `EnterOperation._enter` 按 `config.autoIndent` 决定新行缩进 —— 但**运行时改 autoIndent 不生效**：
 *    `editor.updateOptions({ autoIndent: 'none' })` 之后 `getOption` 明明返回 0，阶梯照旧（实测）。
 *    只有**创建编辑器时**就传 `autoIndent: 'none'` 才真的关掉。所以第一版守卫「粘贴时临时把
 *    autoIndent 设成 none」从根上就是空转 —— 用户 2026-11-07 复测「仍然每行多一个缩进」即此。
 *
 * 【现在的做法】不跟 Monaco 的缩进逻辑掰扯，直接把这一发输入**截下来自己插**：
 * - **EditContext 通道**：模块加载时把 `window.EditContext` 换成子类，在构造函数里挂 `textupdate`
 *   （早于 Monaco 注册自己的监听）。命中就 `stopImmediatePropagation()` + 整段 `executeEdits` ——
 *   Monaco 根本收不到这一发，自然不拆行、不走 Enter。
 * - **textarea 通道**：host 捕获阶段拦 `beforeinput`，`cancelable` 时 `preventDefault()` 再自己插。
 *
 * 【什么算「整段粘贴」】只认 `text` 含换行**且长度 > 1**。真人敲键盘时 Enter 那一发就是单个
 * `'\n'`，永远进不来 —— 正常回车、自动缩进、括号补全、中文组词一律不受影响。另有一条窄兜底：
 * 紧跟一次「多字符输入」之后的单个 `'\n'`（真机若把整段拆行送，行间那一发就是它），且 150ms
 * 内没有 keydown。
 *
 * 【为什么敢抢在 Monaco 前面吞掉】吞掉之后两边状态仍一致：EditContext 里的文本是浏览器自己写
 * 进去的，model 里是我们用同一份文本 `executeEdits` 写的，下次 `_updateEditContext` 一 diff 就是
 * 零差异；textarea 通道那边 Monaco 会在 model 变更时自己回写 textarea。实测粘贴完再输入一个字符，
 * 落点与内容都对。
 */
import { monaco } from '../../monaco-setup.js'

/** 判定「这一发不是真人敲的」时，往前看多久内不能有 keydown */
const KEYDOWN_GRACE_MS = 150
/** 拆行灌入时，行间那发 '\n' 距上一次多字符输入超过这么久，就不再当粘贴 */
const FRAGMENT_WINDOW_MS = 300
/** 「一段文字」的下限：单个字符按打字算，不可能是粘贴 */
const BULK_MIN_CHARS = 2

/**
 * 每个已安装的守卫登记在这里；EditContext 的 textupdate 是全局派发的，命中谁由 `hasTextFocus()` 定。
 * @type {Set<(event: TextUpdateEvent) => boolean>}
 */
const handlers = new Set()

/**
 * 最后一个拿到文本焦点的编辑器。真机上 `editor.hasTextFocus()` 未必可靠（焦点可能在
 * EditContext 的挂载节点上、或者被输入法的浮层短暂接管），所以命中判定里还要认这一条。
 * @type {import('monaco-editor').editor.IStandaloneCodeEditor | null}
 */
let lastFocusedEditor = null

/** `window.EditContext` 只换一次（模块是单例，热更新时也不会重复替换） */
let editContextHooked = false

/**
 * 真机排障开关：地址栏加 `?paste-diag=1`，右下角出现一条只追加的窄浮层，实时列出每一发
 * 进来/漏掉的事件（通道、长度、有没有换行、焦点、有没有接管）。不带参数时零成本、零 DOM。
 * 文案一律 ASCII —— 它是给排障看的，不进 i18n。
 */
const DIAG = typeof location !== 'undefined' && /[?&]paste-diag(=|&|$)/.test(location.search)
/** @type {HTMLElement | null} */
let diagBox = null

/** @param {string} line */
function diag(line) {
  if (!DIAG || typeof document === 'undefined' || !document.body) return
  if (!diagBox) {
    diagBox = document.createElement('div')
    diagBox.style.cssText =
      'position:fixed;left:8px;right:8px;bottom:8px;max-height:46vh;overflow:auto;z-index:2147483647;' +
      'background:rgba(0,0,0,.86);color:#7dff7d;font:11px/1.5 ui-monospace,monospace;padding:6px 8px;' +
      'border-radius:8px;white-space:pre-wrap;word-break:break-all;pointer-events:none'
    document.body.appendChild(diagBox)
  }
  const row = document.createElement('div')
  row.textContent = line
  diagBox.appendChild(row)
  while (diagBox.childElementCount > 16) diagBox.firstElementChild.remove()
}

/**
 * 把 `window.EditContext` 换成子类，只为在构造时抢到第一条 `textupdate` 监听。
 * 必须是**模块加载**时做 —— 编辑器创建之后 EditContext 已经构造完，再换就晚了。
 */
function hookNativeEditContext() {
  if (editContextHooked) return
  if (typeof window === 'undefined' || typeof window.EditContext !== 'function') return
  editContextHooked = true
  const NativeEditContext = window.EditContext
  window.EditContext = class GuardedEditContext extends NativeEditContext {
    constructor(...args) {
      super(...args)
      this.addEventListener('textupdate', (event) => {
        for (const handler of handlers) {
          if (handler(event)) {
            // 吞掉这一发：Monaco 的监听注册在我们后面，stopImmediatePropagation 之后它就收不到了
            event.stopImmediatePropagation()
            return
          }
        }
      })
    }
  }
}

hookNativeEditContext()

/**
 * 插入点之后的光标位置（整段文本可能多行，按行拆开算）
 * @param {import('monaco-editor').Selection} selection
 * @param {string} text
 */
function endPositionOf(selection, text) {
  const start = selection.getStartPosition()
  const lines = text.split('\n')
  const column = lines.length === 1 ? start.column + text.length : lines[lines.length - 1].length + 1
  return { lineNumber: start.lineNumber + lines.length - 1, column }
}

/**
 * 把整段文本原样插到每个光标处（多光标口径与 Monaco 自己的粘贴一致：每处都插整段）。
 * 一次 `executeEdits` 不经过逐字符 type，也就没有行间回车、没有自动缩进。
 * @param {import('monaco-editor').editor.IStandaloneCodeEditor} editor
 * @param {string} raw
 */
function insertVerbatim(editor, raw) {
  const model = editor.getModel()
  const selections = editor.getSelections()
  if (!model || !selections?.length) return
  // 剪贴板里可能是 CRLF，先归一，免得 model 里混进 \r
  const text = raw.replace(/\r\n?/g, '\n')
  const ends = selections.map((selection) => endPositionOf(selection, text))
  const cursorState = ends.map((end) => new monaco.Selection(end.lineNumber, end.column, end.lineNumber, end.column))
  editor.pushUndoStop()
  editor.executeEdits(
    'paste-indent-guard',
    selections.map((selection) => ({ range: selection, text, forceMoveMarkers: true })),
    cursorState,
  )
  editor.pushUndoStop()
}

/**
 * @param {import('monaco-editor').editor.IStandaloneCodeEditor} editor
 * @param {HTMLElement} host 编辑区容器（textarea 通道监听挂它的捕获阶段）
 * @returns {() => void} 注销函数
 */
export function installPasteIndentGuard(editor, host) {
  /** 最近一次 keydown 的时刻 */
  let lastKeydownAt = 0
  /** 最近一次「多字符输入」的时刻（拆行灌入时用来认行间那发换行） */
  let lastBulkAt = 0

  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
  /** 刚按过键 = 这一发是真人敲的 */
  const typedRecently = () => now() - lastKeydownAt < KEYDOWN_GRACE_MS

  /**
   * 这一发输入该不该由我们接手。
   *
   * ⚠️ **多行整段这一条不看 keydown**（2026-11-07 第三版）：真机上点输入法的「粘贴」很可能
   * 顺带派发一次 keydown（KEYCODE_PASTE / 修饰键 / 输入法自己的浮层），第一版把 keydown 当门禁，
   * 于是整段粘贴被当成「真人打字」放过去了 —— 用户手机上复测仍是阶梯，这是最可能的那条。
   * 而「真人一次提交含换行的多行文本」在物理上不存在：Enter 永远是单独一发 `'\n'`。
   * @param {string} text
   */
  function shouldTakeOver(text) {
    if (!text) return false
    if (text.length >= BULK_MIN_CHARS && text.includes('\n')) {
      // 记下「多字符输入」——拆行灌入时，行间那发换行要靠它认
      lastBulkAt = now()
      return true
    }
    if (text === '\n') {
      // 兜底：真机若把整段拆成「一行 + 一次换行」逐发送，行间这发换行也要拦，否则照样缩进。
      // 这一条必须留着 keydown 判据 —— 真人按 Enter 就是这一发。
      return !typedRecently() && now() - lastBulkAt < FRAGMENT_WINDOW_MS
    }
    if (text.length >= BULK_MIN_CHARS) lastBulkAt = now()
    return false
  }

  /** EditContext 通道：抢在 Monaco 之前把整段吞掉 */
  function onTextUpdate(event) {
    const text = event.text ?? ''
    const hasFocus = editor.hasTextFocus()
    // 焦点门禁放宽：只有一个守卫时直接认；多个编辑器时认「最后聚焦的那个」
    if (!hasFocus && lastFocusedEditor !== editor && handlers.size > 1) {
      diag(`tu skip-focus len=${text.length}`)
      return false
    }
    const take = shouldTakeOver(text)
    diag(`tu len=${text.length} nl=${text.includes('\n') ? 1 : 0} foc=${hasFocus ? 1 : 0} take=${take ? 1 : 0}`)
    if (!take) return false
    insertVerbatim(editor, text)
    return true
  }

  /** textarea 通道：`beforeinput` 可取消，拦下来自己插 */
  function onBeforeInput(event) {
    const data = typeof event.data === 'string' ? event.data : ''
    const take = shouldTakeOver(data)
    diag(
      `bi type=${event.inputType} len=${data.length} nl=${data.includes('\n') ? 1 : 0} can=${
        event.cancelable ? 1 : 0
      } take=${take ? 1 : 0}`,
    )
    if (!take) return
    event.preventDefault()
    insertVerbatim(editor, data)
  }

  /** 只诊断，不接管：用来判断「beforeinput 压根没派发、只有 input」这种真机情形 */
  function onInputForDiag(event) {
    const data = typeof event.data === 'string' ? event.data : ''
    diag(`in type=${event.inputType} len=${data.length} nl=${data.includes('\n') ? 1 : 0}`)
  }

  function onKeyDown() {
    lastKeydownAt = now()
  }

  handlers.add(onTextUpdate)
  host.addEventListener('keydown', onKeyDown, true)
  host.addEventListener('beforeinput', onBeforeInput, true)
  if (DIAG) host.addEventListener('input', onInputForDiag, true)

  // 记录「最后聚焦的编辑器」：真机上 hasTextFocus() 不一定可信
  const focusSub = editor.onDidFocusEditorText(() => {
    lastFocusedEditor = editor
  })

  // 装上之后延时探一次输入面，把这个最容易出岔子的前提写进浮层
  if (DIAG) {
    window.setTimeout(() => {
      const surface = host.querySelector('.native-edit-context')
        ? 'native-edit-context'
        : host.querySelector('textarea.inputarea')
          ? 'textarea'
          : 'none'
      diag(`ready surface=${surface} hook=${editContextHooked ? 1 : 0} guards=${handlers.size}`)
    }, 600)
  }

  return () => {
    handlers.delete(onTextUpdate)
    focusSub.dispose()
    host.removeEventListener('keydown', onKeyDown, true)
    host.removeEventListener('beforeinput', onBeforeInput, true)
    if (DIAG) host.removeEventListener('input', onInputForDiag, true)
  }
}
