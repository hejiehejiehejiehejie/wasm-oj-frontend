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

/** `window.EditContext` 只换一次（模块是单例，热更新时也不会重复替换） */
let editContextHooked = false

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
   * @param {string} text
   */
  function shouldTakeOver(text) {
    if (!text) return false
    const multiline = text.length >= BULK_MIN_CHARS && text.includes('\n')
    if (multiline) {
      // 无论接不接管，都记下这是「多字符输入」——拆行灌入时行间那发换行靠它认
      lastBulkAt = now()
      return !typedRecently()
    }
    if (text === '\n') {
      // 兜底：真机若把整段拆成「一行 + 一次换行」逐发送，行间这发换行也要拦，否则照样缩进
      return !typedRecently() && now() - lastBulkAt < FRAGMENT_WINDOW_MS
    }
    if (text.length >= BULK_MIN_CHARS) lastBulkAt = now()
    return false
  }

  /** EditContext 通道：抢在 Monaco 之前把整段吞掉 */
  function onTextUpdate(event) {
    if (!editor.hasTextFocus()) return false
    if (!shouldTakeOver(event.text)) return false
    insertVerbatim(editor, event.text)
    return true
  }

  /** textarea 通道：`beforeinput` 可取消，拦下来自己插 */
  function onBeforeInput(event) {
    const data = typeof event.data === 'string' ? event.data : ''
    if (!shouldTakeOver(data)) return
    event.preventDefault()
    insertVerbatim(editor, data)
  }

  function onKeyDown() {
    lastKeydownAt = now()
  }

  handlers.add(onTextUpdate)
  host.addEventListener('keydown', onKeyDown, true)
  host.addEventListener('beforeinput', onBeforeInput, true)

  return () => {
    handlers.delete(onTextUpdate)
    host.removeEventListener('keydown', onKeyDown, true)
    host.removeEventListener('beforeinput', onBeforeInput, true)
  }
}
