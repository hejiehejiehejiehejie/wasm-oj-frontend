/**
 * pasteIndentGuard —— 手机输入法把整段代码「粘贴」进来时，别让自动缩进把每一行越推越深。
 *
 * 【症状】手机上用键盘自带的「粘贴」贴一段带缩进的代码，贴完以后每一行都比上一行多一层缩进，
 * 整段呈阶梯状（首尾能差出七八个 tab）。桌面按 Ctrl+V、以及菜单里的「粘贴」都不会这样。
 *
 * 【为什么只有手机出】
 * 桌面的粘贴是一个「一次性替换」：Monaco 的 PasteOperation 拿整段文本建一条 ReplaceCommand
 * （见 `monaco-editor/esm/vs/editor/common/cursor/cursorTypeEditOperations.js` 的
 * `PasteOperation._simplePaste`），文本原样落进 model，与缩进毫无关系。
 * 安卓输入法的「粘贴」**不是**真的 paste 事件 —— 它是 IME 提交：Chrome 把含换行的文本按行拆开，
 * 逐行 textupdate + 一次 insertLineBreak（EditContext 那条路，见
 * `editor/browser/controller/editContext/native/nativeEditContext.js` 的 `beforeinput` / `textupdate`），
 * 于是每两行之间都真的走了一次「回车」。回车走 `EnterOperation._enter`，而 autoIndent 的口径是
 * 「把**当前行**的前导空白复制给新行」；紧接着 IME 又把下一行自带的缩进贴上去 —— 两级相加。
 * 下一行再照此复制，于是逐行 +1，阶梯就是这么来的。
 *
 * 【怎么拦】不改 Monaco，也不去猜「哪一发换行属于粘贴」，只认「这一发输入是整段灌进来的」：
 *   1) `beforeinput` 带着长度 ≥ 2 的文本（或 inputType 直接就是 insertFromPaste / insertFromDrop）；
 *   2) 它前面 `KEYDOWN_GRACE_MS` 之内**一次 keydown 都没有** —— 真人打字每一下都有 keydown，
 *      输入法灌文本一发都没有。
 * 两条同时成立就开一个 burst 窗口（`BURST_IDLE_MS` 内没有新的整段输入就自动关），窗口期间把
 * autoIndent 临时改成 'none'：中间那些回车不再复制缩进，各行自带的缩进就是最终缩进，阶梯消失。
 *
 * 【为什么是改选项，而不是把换行拦下来】换行有两条来路：`beforeinput` 的 insertParagraph /
 * insertLineBreak（拦得住），以及 EditContext 的 `textupdate`（拦不住 —— 它不是 cancelable 的
 * DOM 事件，Monaco 直接拿去走 `_onType`）。改 autoIndent 两条来路一起管。
 *
 * 【代价有多小】窗口只在「刚灌进来一整段文字」时打开，而**任何一次 keydown 都会立刻把窗口关掉**
 * （见 onKeyDown）—— 真人按回车之前手上总有 keydown，所以正常回车永远走 autoIndent 的老路。
 * 唯一会碰上的情形是「输入法灌完文本后 400ms 内、且一次 keydown 都没有就按了回车」，那时表现
 * 只是这一下回车回到行首，再按一次就正常。比阶梯式毁掉整段代码轻得多。
 *
 * 【探针怎么验】见 HANDOFF 第 3 节「触屏编辑区的编辑手势」最后那一条。
 */
import { monaco } from '../../monaco-setup.js'

/** 判定「这一发输入不是真人敲的」时，往前看多久内不能有 keydown */
const KEYDOWN_GRACE_MS = 150
/** burst 窗口的静默长度：这么久没有新的整段输入就恢复 autoIndent */
const BURST_IDLE_MS = 400
/** 「一段文字」的下限：单个字符按打字算，不可能是粘贴 */
const BULK_MIN_CHARS = 2

/**
 * Monaco 的 `autoIndent` 取值。`getOption` 给的是 `EditorAutoIndentStrategy` 的数字，
 * `updateOptions` 收的是名字 —— 两边的顺序见 monaco 的 `EditorAutoIndentStrategy`。
 */
const AUTO_INDENT_NAMES = ['none', 'keep', 'brackets', 'advanced', 'full']

/** @param {string|number} value @returns {string} */
function autoIndentName(value) {
  if (typeof value === 'string') return value
  return AUTO_INDENT_NAMES[value] ?? 'full'
}

/**
 * @param {import('monaco-editor').editor.IStandaloneCodeEditor} editor
 * @param {HTMLElement} host 编辑区容器（监听挂它的捕获阶段：Monaco 自己的输入面是它的后代）
 * @returns {() => void} 注销函数
 */
export function installPasteIndentGuard(editor, host) {
  /** 最近一次 keydown 的时刻 */
  let lastKeydownAt = 0
  /** burst 的静默计时器（0 = 没在跑） */
  let idleTimer = 0
  /** 是否正处在 burst 窗口里 */
  let bursting = false
  /** burst 之前那份 autoIndent，恢复时原样写回（不写死 'full'，将来加设置项也不必改这里） */
  let savedAutoIndent = 'full'

  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

  function endBurst() {
    if (idleTimer) {
      window.clearTimeout(idleTimer)
      idleTimer = 0
    }
    if (!bursting) return
    bursting = false
    editor.updateOptions({ autoIndent: savedAutoIndent })
  }

  function startBurst() {
    if (!bursting) {
      bursting = true
      savedAutoIndent = autoIndentName(editor.getOption(monaco.editor.EditorOption.autoIndent))
      editor.updateOptions({ autoIndent: 'none' })
    }
    if (idleTimer) window.clearTimeout(idleTimer)
    idleTimer = window.setTimeout(endBurst, BURST_IDLE_MS)
  }

  function onKeyDown() {
    lastKeydownAt = now()
    // 真人动手了：窗口立刻关掉，下一次回车照旧吃 autoIndent
    if (bursting) endBurst()
  }

  function onBeforeInput(event) {
    const inputType = event.inputType
    const data = typeof event.data === 'string' ? event.data : ''
    const bulk =
      inputType === 'insertFromPaste' ||
      inputType === 'insertFromDrop' ||
      data.length >= BULK_MIN_CHARS
    if (!bulk) return
    // 有 keydown 就是人在打字（含中文输入法逐键上屏），那不是粘贴，一律不接管
    if (now() - lastKeydownAt < KEYDOWN_GRACE_MS) return
    startBurst()
  }

  host.addEventListener('keydown', onKeyDown, true)
  host.addEventListener('beforeinput', onBeforeInput, true)

  return () => {
    endBurst()
    host.removeEventListener('keydown', onKeyDown, true)
    host.removeEventListener('beforeinput', onBeforeInput, true)
  }
}
