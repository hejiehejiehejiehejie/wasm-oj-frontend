/**
 * useEditorMenu —— 编辑区的上下文菜单（桌面鼠标右键 / 触屏长按）与触屏的多击手势。
 *
 * 两端共用同一份菜单（2026-10-10 加），取代 Monaco 内置那份英文菜单：
 * - **桌面**：鼠标右键弹它。内置菜单的文案是英文的，与站点的双语界面不一致；
 * - **触屏**：长按 `LONG_PRESS_MS` 弹它，并且**先选中手指下的词** —— 这是 iOS / Android
 *   原生文本控件与 VS Code 移动版的通行分工：轻点 = 光标、双击 = 选词、长按 = 选词 + 菜单。
 *   若长按处本来就在选区里，则保持原选区不动（同 iOS：长按已选中的内容 = 直接弹菜单）。
 *
 * 多击手势（2026-10-11 加）：**三击 = 选中整行、四击 = 全选**，对齐 Monaco 自己在鼠标下的
 * 口径；触屏上 Monaco 数不到 3，只能由这里接着数（见 `onMonacoGestureTap`）。
 *
 * 键盘的防抖（2026-10-11 加）：编辑器没有焦点时，这一轮轻点**先不聚焦** —— Monaco 的 Tap 会
 * 顺带 `focusTextArea()`，键盘一弹 App 就收矮（`--vvh`），后面几击的落点全跟着偏。
 * 补聚焦推迟到 `TAP_SETTLE_MS`（与 Monaco 的双击窗口同口径）：单击 = 光标立刻落下、键盘晚约
 * 0.4s；双击及以上 = 选完才弹。焦点已经在编辑器里时不做这套（视口不会动，交给 Monaco 更快）。
 *
 * 【为什么自己判长按，而不是用 Monaco 的】
 * Monaco 的手势识别（`vs/base/browser/touch.js`）在按住 `HOLD_DELAY`（**700ms**）时派发
 * `-monaco-gesturecontextmenu`，随即弹它自己的菜单。那个 700ms 比系统长按（约 500ms）长，
 * 而且它**只弹菜单、不选词**。这里自己按 450ms 判定（与文件树的 `LONG_PRESS_MS` 同口径，
 * 改一处记得对另一处），再把 Monaco 那一发拦掉。
 *
 * 【拦 Monaco 内置菜单：一层开关 + 两条拦截】
 * 0. **底牌（2026-10-14 加）**：`services/editorOptions.js` 里给编辑器下了 `contextmenu: false`
 *    —— Monaco 自己那个开关，一开就把那份菜单关死（`ContextMenuController` 的三个入口全早退）。
 *    下面两条只是让 Monaco **连算都不必算**；真正保证「任何入口都弹不出来」的是这一条。
 * 1. 触屏：捕获阶段监听 `-monaco-gesturecontextmenu`，**一律拦掉**（见 `onMonacoMenu`）。
 *    Monaco 把它派发在触摸落点上且 `bubbles: false` —— **只有捕获阶段抄得到**
 *    （`useMobileKeyboard` 拦 Tap 用的是同一招）。
 * 2. 桌面：捕获阶段监听 `contextmenu`。Monaco 的监听挂在自己的根元素上，在祖先的捕获阶段
 *    `stopPropagation` 之后它就收不到了。
 * 两条都要 `preventDefault`，否则浏览器还会再弹一次原生菜单。
 *
 * 第 1 条**为什么必须无条件拦**：我们的长按撤销阈值是 10px（`MOVE_SLOP`），Monaco 判「按住」
 * 的位移窗是 30px（`touch.js`）。手指动过 10px 又不到 30px 时我们撤了长按、Monaco 到点照发，
 * 以前那句 `if (!handledTouch) return` 就把这一发放过去了 —— 于是它那份英文菜单冒出来
 * （用户 2026-10-14 报的就是这个）。放行还附带一次 Monaco 自己的 `editor.focus()`，
 * 在触屏上等于把键盘弹起来，更不该留。
 *
 * 【右列的键位】剪切 / 复制 / 粘贴 / 全选 / 更改所有匹配项 / 命令面板取自下面的 `SHORTCUT`
 * （`formatCombo`）——显示的就是 Monaco 自己的默认键位，按了真的会跑，不是占位提示。
 * **「生成图片」是唯一例外**：它不是 Monaco action，键位归站内的绑定表管（设置 › 快捷键里
 * 可改绑），所以那一列在 `buildItems()` 里现读 `bindings.value['export-image']`，不写死 ——
 * 改绑之后菜单上那一列会跟着变；用户把它清掉了就什么都不显示。
 * 写法与设置页的快捷键列表同源，所以平台符号（⌘ / Ctrl）也对得上。
 *
 * 【触屏那条为什么不按「先选词再弹菜单」的顺序拆分】
 * `getTargetAtClientPoint` 要的是按下那一刻的坐标，手指按住不动时一直有效；先选词再开菜单
 * 还有一个好处：菜单里的「剪切 / 复制」能立刻按新选区算出可用性（见 `buildItems`）。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { monaco } from '../monaco-setup.js'
import { t } from '../i18n/index.js'
import { editorSettings } from '../services/editorSettings.js'
import {
  copyCanvasToClipboard,
  downloadImage,
  renderCodeCanvas,
} from '../services/codeImage.js'
import { renderMarkdownCanvas } from '../services/mdImage.js'
import { notify } from '../services/notifications.js'
import { formatCombo, useShortcutManager } from './useShortcutManager.js'

/** 触屏长按多久算「按住 = 选词 + 菜单」。与 useTreeDrag.js 的 LONG_PRESS_MS 同口径 */
const LONG_PRESS_MS = 450
/** 判定前手指移动超过这个距离就当滚动，撤掉长按（与平台点按 slop 同量级） */
const MOVE_SLOP = 10
/**
 * Monaco 手势识别里的 Tap 事件名（`vs/base/browser/touch.js` 的 `EventType.Tap`）。
 * 与 `useMobileKeyboard.js` 里那个同名常量指向同一份实现 —— 改一处记得对另一处。
 */
const MONACO_GESTURE_TAP = '-monaco-gesturetap'
/**
 * 一轮连续轻点「到头了」的等待时长，也等于**把键盘推迟多久弹出来**。
 * 与 Monaco 判定双击的窗口同口径（`touch.js` 的 `Gesture.CLEAR_TAP_COUNT_TIME = 400`）——
 * 取一样的值，「这一轮还有没有下一击」两边才是同一个答案（口径对不上就会出现
 * 「Monaco 认为还在双击、我们已经把键盘弹了」）。
 */
const TAP_SETTLE_MS = 400

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
  /**
   * 站内的快捷键绑定表（模块级单例，这里只是取引用）。「生成图片」的键位归它管 ——
   * 用户在设置 › 快捷键里改绑之后，菜单右列那一栏要跟着变，所以每次开菜单现读。
   */
  const { bindings } = useShortcutManager()
  /** 「复制还是保存」那一次询问是否开着（codeImageAsk 开着时才可能为真） */
  const ask = ref(false)
  /** 询问的兑现口：弹窗一答就 resolve，见 askImageAction */
  let askResolve = null

  /** 本次触摸的现场；`timer` 归零表示已撤销或已触发 */
  let press = null
  /** 本次触摸是否已被我们接管成长按 —— 用来拦掉 Monaco 700ms 时那一发 */
  let handledTouch = false
  /**
   * 这一轮连续轻点已经点到第几下（1 = 单击、2 = 双击、3 = 三击…）。
   * 由 Monaco 的 `tapCount` 驱动：它报 1 就说明这一轮断了（间隔超 400ms），报 2 就往下数。
   */
  let tapSequence = 0
  /**
   * 这一轮轻点是不是由我们接管（编辑器没有焦点时才置真）。置真期间 Monaco 的每一击都被拦掉，
   * 光标 / 选词 / 选行 / 全选全由这里做 —— 因为 Monaco 的 Tap 里带着 `focusTextArea()`，
   * 而我们要的正是「这一轮先别聚焦」。
   */
  let deferFocus = false
  /** 补聚焦的定时器（0 = 没有待补的）。每来一击就重新计，到点了才真的聚焦 */
  let settleTimer = 0

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
   * 保留的一项，并进剪贴板那一簇，不再单起一组。键位取自上面的 SHORTCUT，不写死字符串；
   * 「生成图片」是例外 —— 键位在绑定表里，见文件头【右列的键位】那段。
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
      { id: 'sep-image', divider: true },
      // 生成图片：无选区时置灰（与剪切 / 复制同口径 —— 没有选中的代码就没有可导出的东西）。
      // 走自己的实现，不是 Monaco action：Monaco 没有这条命令。
      // 键位不在 SHORTCUT 里 —— 它是站内动作，从绑定表现读（用户可改绑，绑空了就显示空）。
      {
        id: 'exportImage',
        label: t('app.editorMenu.exportImage'),
        shortcut: formatCombo(bindings.value['export-image']),
        disabled: !hasSelection,
      },
      { id: 'sep-cmd', divider: true },
      {
        id: 'commandPalette',
        label: t('app.editorMenu.commandPalette'),
        shortcut: SHORTCUT.commandPalette,
      },
    ]
  }

  /**
   * 打开菜单。**编辑器没有 model 就整份不开**（2026-10-12 用户点名的 bug：没开任何文件、
   * 编辑区只剩中间那个占位提示时，右键照样弹出「剪切 / 复制 / 粘贴 / 全选 / 命令面板」）。
   *
   * 判据取 `getModel()` 而不是「活跃文件 id 空不空」：`EditorPane.vue` 那条 watch 在
   * `activeId` 为空时正是 `setModel(null)`，所以这一条既等价、又不必把面板那边的状态搬进来。
   * 那几条菜单项没有一条离得开 model —— 「粘贴」「命令面板」还都要求有聚焦的编辑器，
   * 空编辑区弹出来只会误导。
   *
   * ⚠️ **是拦住、不是放行**：调用方（右键 / 长按）该 `preventDefault` 的照旧做，所以空编辑区
   * 右键**什么都不弹**，连浏览器原生菜单也不露 —— 用户当场定的口径，别「顺手」改成放行。
   * 鼠标右键与触屏长按都从这里过，拦在这一处就够。
   */
  function openAt(clientX, clientY) {
    if (!editor.value?.getModel()) return
    menu.value = { x: clientX, y: clientY, items: buildItems() }
  }

  function closeMenu() {
    menu.value = null
  }

  /**
   * 「生成图片」：选区 → PNG → **复制还是保存由用户当场定**（设置项 codeImageAsk，默认问）。
   *
   * 顺序是「**先渲染、再问**」：图已经画好了，弹窗上点哪一边都是立刻兑现，不用再等一次渲染；
   * 取消则是真的什么都没发生（图丢掉，不发通知）。
   * 关掉询问（codeImageAsk = false）时按设置里的 `codeImageAction` 直接走，一次弹窗也不弹。
   *
   * 「复制」这条路上还留着原来的兜底：浏览器不给写图片剪贴板时退化成下载 ——
   * 那是**用户选了复制却做不到**的情形，下载下来总比什么都不给好。
   * 两条结果各发一条通知 —— 这条链路没有别的可见反馈，用户看不到图，只能靠通知知道成了没有。
   * 失败发常驻 error 通知：那是需要人来看一眼的情形。
   */
  async function exportSelectionImage() {
    const instance = editor.value
    const model = instance?.getModel()
    const selection = instance?.getSelection()
    if (!model || !selection || selection.isEmpty()) return
    const code = model.getValueInRange(selection)
    if (!code.trim()) return
    try {
      // .md 文件按「题解预览」的排版出图（Markdown 结构 + KaTeX 公式），其余文件照旧画代码图。
      // 渲染器没下载时**回落**到代码图，入口不因此失败（用户 2026-10-21 定的口径）。
      let canvas = null
      if (model.getLanguageId() === 'markdown') {
        try {
          canvas = await renderMarkdownCanvas({
            source: code,
            quality: editorSettings.value.codeImageQuality,
          })
        } catch (error) {
          // 少一套画法而已：继续走下面的代码图，不打扰用户。
          // 渲染器没下载（MD_RUNTIME_MISSING）、预览样式不可用（MD_IMAGE_UNAVAILABLE）、
          // Safari 那边超时 / 空白 / canvas 不可读（MD_IMAGE_TIMEOUT / _BLANK / _UNREADABLE）
          // 都算「这套画法走不通」，一律回落；不是 MD_ 前缀的才算真 bug，照旧抛。
          if (!String(error?.code ?? '').startsWith('MD_')) throw error
        }
      }
      if (!canvas) {
        // 字体取 Monaco 当前真实生效的那一份（getOption(fontInfo)），排版才和编辑器里一致；
        // 字号不取 —— 导出图固定字号，见 codeImage.js 的 EXPORT_FONT_SIZE
        const fontInfo = instance.getOption(monaco.editor.EditorOption.fontInfo)
        canvas = await renderCodeCanvas({
          code,
          languageId: model.getLanguageId(),
          showDots: editorSettings.value.codeImageDots,
          showLineNumbers: editorSettings.value.codeImageLineNumbers,
          quality: editorSettings.value.codeImageQuality,
          // 彩色括号跟编辑器同一个开关（编辑器在 .md 下也会自己关掉，这里同口径）
          bracketColorize:
            editorSettings.value.bracketPairColorization && model.getLanguageId() !== 'markdown',
          // 行号从选区所在的那一行起算（选区在文件中间时编号才对得上）
          startLine: selection.startLineNumber,
          // 制表符的宽度取当前文件真正生效的那一份（model 级选项，可能被「按内容猜缩进」改过），
          // 图里的缩进才和编辑器里看到的一致
          tabSize: model.getOptions().tabSize,
          fontFamily: fontInfo?.fontFamily,
        })
      }
      const action = editorSettings.value.codeImageAsk
        ? await askImageAction()
        : editorSettings.value.codeImageAction
      // 取消（Esc / 点遮罩 / 「取消」）：图丢掉，什么都不做
      if (!action) return
      if (action !== 'save') {
        const copied = await copyCanvasToClipboard(canvas)
        if (copied.ok) {
          notify({
            type: 'success',
            title: t('notifications.image.copiedTitle'),
            message: t('notifications.image.copiedBody'),
            duration: 3000,
          })
          return
        }
        // 复制没成 → 改成下载，说法按失败原因分两种：
        // «不支持» 只给能力上真的没有的浏览器；正常设备上被权限 / 手势卡住的那次
        // 不能也说成不支持（用户 2026-10-21 指出）。
        // 下载只认 data URL（<a download> 不收 Blob），所以这一路才现编一次
        downloadImage(canvas.toDataURL('image/png'), imageFileName(model))
        const unsupported = copied.reason === 'unsupported'
        notify({
          type: unsupported ? 'info' : 'warning',
          title: t(
            unsupported
              ? 'notifications.image.copyUnsupportedTitle'
              : 'notifications.image.copyFailedTitle',
          ),
          message: t(
            unsupported
              ? 'notifications.image.copyUnsupportedBody'
              : 'notifications.image.copyFailedBody',
          ),
          duration: 3000,
        })
        return
      }
      // 用户自己点的「保存」：就是一次下载，不该夹带任何剪贴板的话
      downloadImage(canvas.toDataURL('image/png'), imageFileName(model))
      notify({
        type: 'info',
        title: t('notifications.image.savedTitle'),
        message: t('notifications.image.savedBody'),
        duration: 3000,
      })
    } catch {
      notify({
        type: 'error',
        title: t('notifications.image.failedTitle'),
        message: t('notifications.image.failedBody'),
      })
    }
  }

  /**
   * 「复制还是保存」这一次询问：Promise 包着弹窗，UI 由调用方（EditorPane）画。
   *
   * 与右键菜单同一套分工：composable 只管状态与结果，模板交给组件 —— 这里没有模板，
   * 而弹窗必须 Teleport 到 body（编辑区内有 transform / overflow，就地定位会被裁）。
   * @returns {Promise<'copy' | 'save' | null>} 取消 = null
   */
  function askImageAction() {
    // 上一问还没答就又来一问（理论上够不着：弹窗是模态的）→ 先把旧的按取消结掉，
    // 免得那个 Promise 永远悬着、调用方卡在 await 上
    if (askResolve) answerImageAction(null)
    return new Promise((resolve) => {
      askResolve = resolve
      ask.value = true
    })
  }

  /**
   * 弹窗上点了哪一边。'copy' / 'save' 兑现，其余（取消 / Esc / 点遮罩）一律按 null ——
   * 调用方据此整段收手。
   * @param {'copy' | 'save' | null} action
   */
  function answerImageAction(action) {
    if (!ask.value) return
    ask.value = null
    const resolve = askResolve
    askResolve = null
    resolve?.(action ?? null)
  }

  /** 下载用的文件名：取当前文件的基名换 .png；没有路径信息时兜底 code.png */
  function imageFileName(model) {
    const path = String(model.uri?.path ?? '')
    const base = path.split('/').pop() ?? ''
    const stem = base.replace(/\.[^.]*$/, '')
    return `${stem || 'code'}.png`
  }

  function onMenuSelect(id) {
    const instance = editor.value
    closeMenu()
    if (id === 'exportImage') {
      exportSelectionImage()
      return
    }
    if (!instance || !ACTIONS[id]) return
    // 先把焦点还给 Monaco 再触发。菜单是 Teleport 到 body 的按钮，点它会把 DOM 焦点从
    // Monaco 的 textarea 上抢走；而「命令面板」（editor.action.quickCommand）这类 action
    // 明确要求当前有聚焦的编辑器，否则直接抛 "Quick input service needs a focused editor
    // to work."。剪贴板那几条不挑焦点，但也一并没有坏处。
    instance.focus()
    instance.trigger('editor-menu', ACTIONS[id], null)
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
      // 也在告诉上一轮轻点：这次不是轻点，别把那笔「补聚焦」补上 ——
      // 否则键盘会在滚动途中弹出来，把用户正在看的位置顶走（口径：滑动只滚动，轻点才聚焦）。
      cancelSettleFocus()
    }
  }

  function fireLongPress() {
    if (!press || !editor.value) return
    const { x, y } = press
    clearPress()
    handledTouch = true
    // 长按接管的这一轮不再补聚焦：用户要的是菜单，不是键盘（400ms 的防抖若照常到点，
    // 键盘会在菜单已经弹出来之后把视口收矮，菜单看着就像跳了一下）。
    cancelSettleFocus()
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

  // -------------------------------------------- 触屏：轻点的多击手势 + 键盘防抖

  /**
   * 触屏轻点的总入口：单击 = 落光标、双击 = 选词、三击 = 选行、四击 = 全选。
   * 后三个的口径与 Monaco 自己在鼠标下的那一套对齐
   * （`viewController.dispatchMouse` 的 `mouseDownCount`：2 = 选词 / 3 = 选行 / ≥4 = 全选），
   * 而 3 和 4 在触屏上 Monaco 根本喂不到（见 `tapCount` 那段注释）。
   *
   * 【为什么要自己数】Monaco 的手势识别把 `tapCount` 封顶在 2（`touch.js` 的
   * `CLEAR_TAP_COUNT_TIME`）：第 3、4 次轻点仍旧报 2，它自己那边三次轻点的结果是
   * 「选词、选词、选词」。这里借它的 `tapCount` 接着往下数 —— 顺带把「一轮到头了」也
   * 交给它：它报 1 就说明距上一次轻点已超过那 400ms，新的一轮从这里重新数。
   *
   * 【数到 3 就得把 Monaco 那一发拦掉】第 3 次轻点若原样放过去，Monaco 会按「双击」再选一次
   * 词，刚选好的整行又被缩回一个词。事件派发在 `.view-lines` 上（`bubbles: false`），
   * 所以挂在祖先的**捕获阶段**拦（与 `useMobileKeyboard.js` 拦 Tap 是同一招）。
   *
   * 【键盘的防抖 —— 编辑器没焦点时整轮都由我们接管】
   * Monaco 的 Tap 里除了落光标还带着 `focusTextArea()`：第一击就把键盘弹起来，而键盘一弹，
   * App 就按 `--vvh` 把自己收矮（见 useMobileKeyboard / App.vue 的 `.app.is-keyboard`），
   * 编辑区跟着重新排版 —— **后面几击的落点因此全部偏掉**（双击选到别的词、三击选到别的行），
   * 因为 Monaco 给我们的 `pageX / pageY` 是手指抬起那一刻的、按下时早就不是那个坐标了。
   * 所以只要编辑器本来没有焦点，这一轮就**先不聚焦**：每一击都由这里自己落地（光标 / 选词 /
   * 选行 / 全选），并把「补聚焦」推迟到 `TAP_SETTLE_MS` 之后 —— 期间任何一击都会把它重新计时，
   * 于是单击是「键盘晚约 0.4s 弹」（光标立刻落下），双击及以上则是「选完才弹」。
   * 焦点本来就在编辑器里（键盘弹着打字）时不做这套：那时视口不会动，原样交给 Monaco 更快。
   */
  function onMonacoGestureTap(event) {
    // 这一发是长按松手带出来的（450ms 时已经被我们接管）：整轮早结束了，别拿它当下一轮的第一击。
    // 也不拦 —— 只把计数让开，行为与加这段逻辑之前完全一致。
    if (handledTouch) return
    tapSequence = event.tapCount === 2 ? tapSequence + 1 : 1
    // 手势事件带的是 page 坐标。本站没有文档级滚动，两者本来就是同一个数，
    // 减一下只是不让「哪天真能滚页面」时悄悄错位。
    const clientX = event.pageX - window.scrollX
    const clientY = event.pageY - window.scrollY

    if (tapSequence === 1) deferFocus = !editor.value?.hasTextFocus()
    if (deferFocus) {
      event.stopPropagation()
      event.preventDefault()
      if (tapSequence === 1) placeCursor(clientX, clientY)
      else if (tapSequence === 2) selectWordUnder(clientX, clientY)
      else if (tapSequence === 3) selectLine(clientX, clientY)
      else selectAll()
      armSettleFocus()
      return
    }

    if (tapSequence < 3) return // 焦点在编辑器里：单击、双击照旧交给 Monaco（光标、选词）
    event.stopPropagation()
    event.preventDefault()
    if (tapSequence === 3) selectLine(clientX, clientY)
    else selectAll()
  }

  /**
   * 轻点落光标。Monaco 的 Tap 在 `dispatchMouse` 里对 `mouseDownCount === 1` 走的就是 `moveTo`，
   * 这里用 `setPosition` 是同一件事（只是不聚焦）。
   */
  function placeCursor(clientX, clientY) {
    const instance = editor.value
    const position = instance?.getTargetAtClientPoint(clientX, clientY)?.position
    if (position) instance.setPosition(position)
  }

  /**
   * 把「补聚焦」推到 `TAP_SETTLE_MS` 之后；这一轮里每来一击都重新计时。
   * 到点才真的聚焦 —— 键盘与它带来的视口收缩都挪到手指停下之后，多击的落点就不会被带偏。
   */
  function armSettleFocus() {
    if (settleTimer) window.clearTimeout(settleTimer)
    settleTimer = window.setTimeout(() => {
      settleTimer = 0
      deferFocus = false
      editor.value?.focus()
    }, TAP_SETTLE_MS)
  }

  /** 撤销待补的聚焦：长按接管（用户要的是菜单，不是键盘）与卸载时都要用 */
  function cancelSettleFocus() {
    if (settleTimer) window.clearTimeout(settleTimer)
    settleTimer = 0
    deferFocus = false
  }

  /**
   * 三击：选中轻点处那一整行。连**行尾的换行一起**选（末行没有换行可选到行尾）——
   * 与 Monaco 自己的三击同一个口径（`CursorMoveCommands.expandLineSelection`，也就是 Ctrl+L），
   * 于是退格一下正好删掉一整行，而不是删掉一行文字、留下一个空行。
   */
  function selectLine(clientX, clientY) {
    const instance = editor.value
    const model = instance?.getModel()
    if (!instance || !model) return
    const hit = instance.getTargetAtClientPoint(clientX, clientY)?.position
    // 命中测试被自己画的浮层吃掉时（HANDOFF 第 5 节坑 32）退回「双击刚选好的那个词」所在的行
    const line = (hit || instance.getSelection()?.getStartPosition())?.lineNumber
    if (!line) return
    const lastLine = model.getLineCount()
    instance.setSelection(
      line < lastLine
        ? new monaco.Range(line, 1, line + 1, 1)
        : new monaco.Range(line, 1, line, model.getLineMaxColumn(line)),
    )
  }

  /** 四击及以上：全选。走 Monaco 的 action —— 与菜单里那一项是同一条路，选区与撤销栈都交给它 */
  function selectAll() {
    editor.value?.trigger('touch-gesture', ACTIONS.selectAll, null)
  }

  // ------------------------------------------------------------ 两端的原生菜单

  function onContextMenu(event) {
    event.preventDefault()
    event.stopPropagation()
    // 触屏那一发已经由上面的长按手势弹过了（handledTouch），这里只管鼠标右键
    if (handledTouch) return
    openAt(event.clientX, event.clientY)
  }

  /**
   * Monaco 自己的长按菜单：**一律拦掉**（2026-10-14 从「有条件」改成无条件）。
   * 以前只拦「本次触摸已被我们接管」的那一发，是为了「别顺手挡掉别的入口」；可那个入口
   * 恰恰是漏的：手指动过 10px（我们的撤销阈值）又不到 30px（Monaco 的位移窗）时，
   * 我们撤了长按、Monaco 到点照发，菜单就冒出来了。触屏上不该再有第二个菜单。
   * 桌面右键不经过这里（`-monaco-gesturecontextmenu` 只在触摸下派发），走 `onContextMenu`。
   */
  function onMonacoMenu(event) {
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
    // 必须在捕获阶段：Monaco 的 Tap 监听挂在 .view-lines 自己身上，冒泡阶段就晚了
    el.addEventListener(MONACO_GESTURE_TAP, onMonacoGestureTap, true)
  })

  onBeforeUnmount(() => {
    const el = host.value
    clearPress()
    cancelSettleFocus()
    answerImageAction(null) // 弹窗还开着就卸载：把那次 await 结掉，别让它永远悬着
    if (!el) return
    el.removeEventListener('pointerdown', onPointerDown, true)
    el.removeEventListener('pointermove', onPointerMove, true)
    el.removeEventListener('pointerup', clearPress, true)
    el.removeEventListener('pointercancel', clearPress, true)
    el.removeEventListener('contextmenu', onContextMenu, true)
    el.removeEventListener('-monaco-gesturecontextmenu', onMonacoMenu, true)
    el.removeEventListener(MONACO_GESTURE_TAP, onMonacoGestureTap, true)
  })

  // exportSelectionImage 也出栈：给 EditorPane 的 defineExpose 用，让 ⌘ / Ctrl+P 那条
  // 全局快捷键能落到同一份实现上（App.vue 的 SHORTCUT_HANDLERS 里调它）。
  // ask / answerImageAction 是那一次「复制还是保存」的状态与兑现口，弹窗画在 EditorPane 里。
  return { menu, closeMenu, onMenuSelect, exportSelectionImage, ask, answerImageAction }
}
