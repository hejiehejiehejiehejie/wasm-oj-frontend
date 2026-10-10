/**
 * useEditorMenu —— 编辑区的上下文菜单（桌面鼠标右键 / 触屏长按）。
 *
 * 两端共用同一份菜单（2026-10-10 加），取代 Monaco 内置那份英文菜单：
 * - **桌面**：鼠标右键弹它。内置菜单的文案是英文的，与站点的双语界面不一致；
 * - **触屏**：长按 `LONG_PRESS_MS` 弹它，并且**先选中手指下的词** —— 这是 iOS / Android
 *   原生文本控件与 VS Code 移动版的通行分工：轻点 = 光标、双击 = 选词、长按 = 选词 + 菜单。
 *   若长按处本来就在选区里，则保持原选区不动（同 iOS：长按已选中的内容 = 直接弹菜单）。
 *
 * 【为什么自己判长按，而不是用 Monaco 的】
 * Monaco 的手势识别（`vs/base/browser/touch.js`）在按住 `HOLD_DELAY`（**700ms**）时派发
 * `-monaco-gesturecontextmenu`，随即弹它自己的菜单。那个 700ms 比系统长按（约 500ms）长，
 * 而且它**只弹菜单、不选词**。这里自己按 450ms 判定（与文件树的 `LONG_PRESS_MS` 同口径，
 * 改一处记得对另一处），再把 Monaco 那一发拦掉。
 *
 * 【拦 Monaco 内置菜单的两条路】
 * 1. 触屏：捕获阶段监听 `-monaco-gesturecontextmenu`。Monaco 把它派发在 `.view-lines` 上
 *    且 `bubbles: false` —— **只有捕获阶段抄得到**（`useMobileKeyboard` 拦 Tap 用的是同一招）。
 * 2. 桌面：捕获阶段监听 `contextmenu`。Monaco 的监听挂在自己的根元素上，在祖先的捕获阶段
 *    `stopPropagation` 之后它就收不到了。
 * 两条都要 `preventDefault`，否则浏览器还会再弹一次原生菜单。
 *
 * 【右列的键位】每条都取自下面的 `SHORTCUT`（`formatCombo`）——显示的就是 Monaco 自己的默认键位，
 * 按了真的会跑，不是占位提示。写法与设置页的快捷键列表同源，所以平台符号（⌘ / Ctrl）也对得上。
 *
 * 【触屏那条为什么不按「先选词再弹菜单」的顺序拆分】
 * `getTargetAtClientPoint` 要的是按下那一刻的坐标，手指按住不动时一直有效；先选词再开菜单
 * 还有一个好处：菜单里的「剪切 / 复制」能立刻按新选区算出可用性（见 `buildItems`）。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { monaco } from '../monaco-setup.js'
import { t } from '../i18n/index.js'
import { formatCombo } from './useShortcutManager.js'

/** 触屏长按多久算「按住 = 选词 + 菜单」。与 useTreeDrag.js 的 LONG_PRESS_MS 同口径 */
const LONG_PRESS_MS = 450
/** 判定前手指移动超过这个距离就当滚动，撤掉长按（与平台点按 slop 同量级） */
const MOVE_SLOP = 10

/**
 * 菜单项 → Monaco 的 action id。
 * 走 action 而不是自己做剪贴板：选区、撤销栈、只读判断都由 Monaco 自己兜，
 * 也能拿到系统剪贴板（触屏上这是唯一能拿到「系统里刚复制的东西」的路）。
 */
const ACTIONS = {
  cut: 'editor.action.clipboardCutAction',
  copy: 'editor.action.clipboardCopyAction',
  paste: 'editor.action.clipboardPasteAction',
  selectAll: 'editor.action.selectAll',
  changeAll: 'editor.action.changeAll',
  commandPalette: 'editor.action.quickCommand',
}

/**
 * 菜单右列显示的键位。**每一条都是 Monaco 的内置默认键位，真的能按**，不是占位提示。
 * 写法一律交给 `formatCombo`（站内唯一那一份）：macOS 出 `⌘ + X`、Win / Linux 出 `Ctrl + X`，
 * 与设置页的快捷键列表永远是同一套符号与平台差异。
 * 用 `Mod`（平台主修饰键）而不是字面 `Ctrl` —— macOS 上 Mod = ⌘，写 Ctrl 就错了。
 */
const SHORTCUT = {
  cut: formatCombo('Mod+KeyX'),
  copy: formatCombo('Mod+KeyC'),
  paste: formatCombo('Mod+KeyV'),
  selectAll: formatCombo('Mod+KeyA'),
  changeAll: formatCombo('Mod+F2'),
  commandPalette: formatCombo('F1'),
}

/**
 * @param {{ editor: import('vue').Ref, host: import('vue').Ref }} options
 *   `editor` = Monaco 实例（创建前为 null，事件回调触发时才读，所以时序没问题）
 *   `host` = 编辑器容器元素，手势与原生菜单都挂它
 */
export function useEditorMenu({ editor, host }) {
  /** 打开中的菜单：`{ x, y, items }`；null = 没开 */
  const menu = ref(null)

  /** 本次触摸的现场；`timer` 归零表示已撤销或已触发 */
  let press = null
  /** 本次触摸是否已被我们接管成长按 —— 用来拦掉 Monaco 700ms 时那一发 */
  let handledTouch = false

  /**
   * 菜单项随选区实时算：没有选区时「剪切 / 复制」置灰。
   * 文案在这里 t()，不是在模块顶层 —— 顶层取会把这个 key 的语言冻结成那一刻的值。
   *
   * 【条目对齐 Monaco 的默认编辑区菜单（2026-10-10 补）】
   * Monaco `MenuId.EditorContext` 里凡带 `hasXxxProvider` 前置条件的条目（Go to Definition /
   * Declaration / Type Definition / Implementations / References / Peek ▸ / Rename Symbol /
   * Format Document / Format Selection / Refactor / Go to Symbol…）在本应用**根本不会显示**：
   * 这里只注册了补全 provider（services/monaco/completion.js），一个 language provider 都没有。
   * 去掉那些后，Monaco 在本应用真正会显示的只剩「更改所有匹配项」与「命令面板」两项，即下面补的
   * 两条 —— 所以补这两条就已是完整对齐，而不是挑了三四个「看着像 VS Code」的条目。
   * 分组照 Monaco 的 group 走（`1_modification` / `9_cutcopypaste` / `z_commands`），组间一条分隔线。
   * 「全选」并不属于全功能编辑器的默认菜单（它来自 Monaco 的 `SimpleEditorContext`）：是我们额外
   * 保留的一项，并进剪贴板那一簇，不再单起一组。键位全部取自上面的 SHORTCUT，不写死字符串。
   */
  function buildItems() {
    const selection = editor.value?.getSelection()
    const hasSelection = Boolean(selection && !selection.isEmpty())
    return [
      { id: 'changeAll', label: t('app.editorMenu.changeAll'), shortcut: SHORTCUT.changeAll },
      { id: 'sep-mod', divider: true },
      { id: 'cut', label: t('app.editorMenu.cut'), shortcut: SHORTCUT.cut, disabled: !hasSelection },
      { id: 'copy', label: t('app.editorMenu.copy'), shortcut: SHORTCUT.copy, disabled: !hasSelection },
      { id: 'paste', label: t('app.editorMenu.paste'), shortcut: SHORTCUT.paste },
      { id: 'selectAll', label: t('app.editorMenu.selectAll'), shortcut: SHORTCUT.selectAll },
      { id: 'sep-cmd', divider: true },
      {
        id: 'commandPalette',
        label: t('app.editorMenu.commandPalette'),
        shortcut: SHORTCUT.commandPalette,
      },
    ]
  }

  function openAt(clientX, clientY) {
    menu.value = { x: clientX, y: clientY, items: buildItems() }
  }

  function closeMenu() {
    menu.value = null
  }

  function onMenuSelect(id) {
    const instance = editor.value
    closeMenu()
    if (instance && ACTIONS[id]) instance.trigger('editor-menu', ACTIONS[id], null)
  }

  // ------------------------------------------------------------ 触屏：长按

  function clearPress() {
    if (press?.timer) window.clearTimeout(press.timer)
    press = null
  }

  function onPointerDown(event) {
    // 鼠标路径不走这里（右键另有一条，见 onContextMenu）
    handledTouch = false
    if (event.pointerType === 'mouse') return
    clearPress()
    press = { x: event.clientX, y: event.clientY, timer: 0 }
    press.timer = window.setTimeout(fireLongPress, LONG_PRESS_MS)
  }

  function onPointerMove(event) {
    if (!press) return
    if (
      Math.abs(event.clientX - press.x) > MOVE_SLOP ||
      Math.abs(event.clientY - press.y) > MOVE_SLOP
    ) {
      clearPress() // 是滚动，不是长按
    }
  }

  function fireLongPress() {
    if (!press || !editor.value) return
    const { x, y } = press
    clearPress()
    handledTouch = true
    selectWordUnder(x, y)
    openAt(x, y)
  }

  /** 长按处已在选区里就保持不动，否则选中词（词都没有就只把光标挪过去） */
  function selectWordUnder(clientX, clientY) {
    const instance = editor.value
    const model = instance?.getModel()
    if (!instance || !model) return
    const position = instance.getTargetAtClientPoint(clientX, clientY)?.position
    if (!position) return
    const selection = instance.getSelection()
    if (selection && !selection.isEmpty() && selection.containsPosition(position)) return
    const word = model.getWordAtPosition(position)
    if (word) {
      instance.setSelection(
        new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
      )
    } else {
      instance.setPosition(position)
    }
  }

  // ------------------------------------------------------------ 两端的原生菜单

  function onContextMenu(event) {
    event.preventDefault()
    event.stopPropagation()
    // 触屏那一发已经由上面的长按手势弹过了（handledTouch），这里只管鼠标右键
    if (handledTouch) return
    openAt(event.clientX, event.clientY)
  }

  /** Monaco 自己的长按菜单：只在本次触摸已被我们接管时拦，别顺手挡掉别的入口 */
  function onMonacoMenu(event) {
    if (!handledTouch) return
    event.preventDefault()
    event.stopPropagation()
  }

  // ------------------------------------------------------------ 挂 / 摘

  onMounted(() => {
    const el = host.value
    if (!el) return
    el.addEventListener('pointerdown', onPointerDown, true)
    el.addEventListener('pointermove', onPointerMove, true)
    el.addEventListener('pointerup', clearPress, true)
    el.addEventListener('pointercancel', clearPress, true)
    el.addEventListener('contextmenu', onContextMenu, true)
    el.addEventListener('-monaco-gesturecontextmenu', onMonacoMenu, true)
  })

  onBeforeUnmount(() => {
    const el = host.value
    clearPress()
    if (!el) return
    el.removeEventListener('pointerdown', onPointerDown, true)
    el.removeEventListener('pointermove', onPointerMove, true)
    el.removeEventListener('pointerup', clearPress, true)
    el.removeEventListener('pointercancel', clearPress, true)
    el.removeEventListener('contextmenu', onContextMenu, true)
    el.removeEventListener('-monaco-gesturecontextmenu', onMonacoMenu, true)
  })

  return { menu, closeMenu, onMenuSelect }
}
