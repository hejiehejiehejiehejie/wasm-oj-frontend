/**
 * useShortcutManager —— 全局快捷键的唯一权威。
 *
 * 三件事：绑定表（动作 id → 组合键）、KeyboardEvent 的规范化、冲突检测。
 * 刻意不引第三方键位库：规范化只需要「读 event.code + 四个修饰键」，一个纯函数就够。
 *
 * 组合键的内部写法是 `Mod+Ctrl+Alt+Shift+<KeyboardEvent.code>`，顺序固定、必带键码，
 * 所以字符串相等就是「精确匹配」——Ctrl+B 与 Ctrl+Shift+B、Ctrl+Alt+B 天然不会互相误触。
 *   - Mod  = 平台主修饰键：macOS 是 ⌘，Windows / Linux 是 Ctrl（跟 VS Code 一致）
 *   - Ctrl = 字面 Ctrl，只在 macOS 上单独存在（mac 上 Mod 是 ⌘，两者必须分开）
 *
 * 用 `event.code`（物理键位）而不是 `event.key`：Alt 组合在 macOS 上会把 key 变成
 * 特殊字符（Alt+B 是 '∫'），Shift 会把 Digit1 变成 '!'，用 key 根本对不上。
 *
 * 持久化直接读写 localStorage，不走 usePersistentRef：那个 composable 靠 onMounted
 * 播种首次写入，必须挂在组件上；而这份状态要在任何组件挂载之前就能被读到
 * （App 的全局 keydown、EditorPane 的状态栏提示都要用）。
 *
 * 【为什么不需要给 Monaco 单独注册一遍】全局监听挂在 window 的捕获阶段，而 Monaco 的
 * KeybindingService 挂在编辑器内部的 DOM 上（无论它自己是否也用捕获，window 都在更外层，
 * 捕获是从外往内走的）。所以只要在这里拦下并 stopPropagation，Monaco 压根收不到这一发按键，
 * 也就不存在「编辑器里按新键不跑、按旧键反而跑」的问题 —— 早先那版用 addCommand 同步
 * Monaco 键位的做法反而踩了坑：Monaco 0.56 的 ICodeEditor 根本没有 removeCommand。
 */
import { ref, watch } from 'vue'
import { t } from '../i18n/index.js'

const STORAGE_KEY = 'cp.shortcuts'

/**
 * 当前是不是 macOS（含 iPad / iPhone：外接键盘上同样没有 F2，同样按 ⌘ 当主修饰键）。
 * 除了「Mod 映射成 ⌘ 还是 Ctrl」，它还决定**文件树重命名的默认键位**（见 SHORTCUT_ACTIONS 的
 * rename-node）：mac 是 Enter，其它平台是 F2。所以这份判定只做一次、全站共用。
 */
export const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)

/**
 * 可绑定的动作。id 是给 App.vue 的处理表当键用的，label/hint 只用于界面 ——
 * 所以这里存 key，界面（EditorSettingsPanel / HotkeyRecorder）再 t()。
 * 这里只登记「本应用真的做得到」的动作：格式化没有进来，因为 Monaco 内置的
 * Shift+Alt+F 在 C++ / Python 下没有注册 formatter，绑了也是空按。
 *
 * `bareCodes`（可选）= 这个动作额外允许的**裸键**（不带任何修饰键）。默认只有功能键与 Esc
 * 能裸按（见 SAFE_BARE_CODES），例外只有两处：「删除节点」的 Delete，与 macOS 上
 * 「重命名」的 Enter —— 它们敢裸按是因为有一道作用域闸门兜着：只有焦点在文件树上时才触发
 * （App.vue 的 treeScopeFrom）。**给别的动作加裸键之前先想清楚有没有同款闸门**，否则打字时
 * 会被全局吃掉。
 *
 * `aliases`（可选）= 额外认得、但不进绑定表、也不在界面上当当前键位显示的键（见 aliasesOf）。
 *
 * `fixed`（可选）= 键位**写死**：不参与录制 / 清除，读盘时一律以默认表为准。
 * 目前只有资源管理器那三条（重命名 / 删除 / 全选）。判据（2026-10-25 用户口径「这几个设置
 * 没有意义，应该固定死」）：它们不是本应用自造的命令，而是文件树的通用约定，而且前两条是
 * 裸键（F2·Enter / Delete），本来就只靠作用域闸门区分；改绑只会让 ⌘A / Delete / F2 这些肌肉
 * 记忆失效，也让 hint 里那句平台说明与界面上显示的键位互相打架。**别拿它去「锁」可配置的
 * 动作** —— 加这一条等于让用户永远失去改绑能力，要有跟上面同级的理由。
 *
 * `hideInSettings`（可选）= **不进设置面板的快捷键列表**（条目本身还在，绑定、执行、冲突检测
 * 一切照旧）。目前也只有那三条 `fixed` 的资源管理动作：写死之后面板上只剩一行不可点的只读
 * 徽标、hint 里还得解释「为什么改不了」，纯噪声（2026-10-25 用户口径「删去设置页面快捷键的
 * 这几项」）。判据是「这条动作在面板里有没有可操作的东西」—— 有录制框的照列，没有的不列。
 */
export const SHORTCUT_ACTIONS = [
  { id: 'run', labelKey: 'settings.shortcut.run.label', hintKey: 'settings.shortcut.run.hint', default: 'Mod+Enter' },
  /**
   * 一键提交到 Codeforces（2026-10-23 加）：执行落在 App.vue 的
   * requestSubmitConfirmation（先弹确认，确认后才走 submitActiveFile），
   * 与样例面板页脚那颗提交按钮同源。没有关联题目 / 没装插件 / 正在运行时它会弹一条
   * 说明而不是静默 —— 快捷键不像按钮那样有置灰态，没反应会被读成「键位没生效」。
   */
  {
    id: 'submit-solution',
    labelKey: 'settings.shortcut.submitSolution.label',
    hintKey: 'settings.shortcut.submitSolution.hint',
    default: 'Mod+Shift+Enter',
  },
  { id: 'toggle-panel', labelKey: 'settings.shortcut.togglePanel.label', default: 'Mod+KeyB' },
  {
    id: 'switch-panel',
    labelKey: 'settings.shortcut.switchPanel.label',
    hintKey: 'settings.shortcut.switchPanel.hint',
    default: 'Mod+Shift+KeyE',
  },
  { id: 'toggle-layout', labelKey: 'settings.shortcut.toggleLayout.label', default: 'Mod+Shift+KeyB' },
  /**
   * 分屏（2026-11-16 加）：焦点窗格一分为二；焦点窗格是空的时候同一个键把它收掉。
   * 默认键位避开 ⌘\ —— 那一发在 Markdown 文件里是「切换编辑 / 预览 / 分栏」（见 mdView
   * 的 MD_VIEW_SHORTCUT），全局动作抢过去会让题解的视图键失灵。
   */
  {
    id: 'split-editor',
    labelKey: 'settings.shortcut.splitEditor.label',
    hintKey: 'settings.shortcut.splitEditor.hint',
    default: 'Mod+Alt+Backslash',
  },
  { id: 'new-case', labelKey: 'settings.shortcut.newCase.label', default: 'Mod+Alt+Enter' },
  { id: 'open-settings', labelKey: 'settings.shortcut.openSettings.label', default: 'Mod+Comma' },
  /**
   * 生成图片：把编辑器里的选区（没有选区就整篇）导成 PNG（实现在 composables/useEditorMenu.js，
   * 由 EditorPane 经 defineExpose 递给 App.vue 的 SHORTCUT_HANDLERS）。
   * 与上面几条一样「在哪儿按都算」；没有打开文件时静默什么都不做。
   */
  {
    id: 'export-image',
    labelKey: 'settings.shortcut.exportImage.label',
    hintKey: 'settings.shortcut.exportImage.hint',
    default: 'Mod+KeyP',
  },
  // 下面三条（2026-10-10 加前两条、2026-10-12 加全选）与上面那些不是一回事：它们
  // **不跟着焦点走遍全站**，只作用于「资源管理器里当前有焦点的那些行」。执行入口不在
  // SHORTCUT_HANDLERS 里，而是在 App.vue 的 SHORTCUT_TREE_HANDLERS —— 那边先过一道作用域闸门再动手。
  // 另外（2026-10-25）三条全是 `fixed`：键位写死、不再展示在设置面板里（`hideInSettings`），
  // 理由分别见文件头的 `fixed` / `hideInSettings` 两段。
  {
    /**
     * 重命名（2026-10-20 起按平台分岔）：**Windows / Linux 仍是 F2，macOS 是 Enter**。
     * mac 上 F2 被系统占成「调屏幕亮度」、按下去要配 Fn，而且 Finder / VS Code 都是
     * 单按回车改名 —— mac 用户的肌肉记忆里 Enter 才是重命名。
     *
     * mac 上 F2 变成**别名键**（aliases）保留：外接机械键盘、或按 Fn+F2 的人照样能改。
     * Enter 是裸键，按规矩得在 `bareCodes` 里点名放行才录得回来 —— 敢裸按的理由和 Delete
     * 同款：App.vue 的 treeScopeFrom 有一道闸门，只有焦点在资源管理器里（且不在输入框 /
     * 按钮上）时才认这一发。
     */
    id: 'rename-node',
    labelKey: 'settings.shortcut.renameNode.label',
    hintKey: 'settings.shortcut.renameNode.hint',
    default: IS_MAC ? 'Enter' : 'F2',
    aliases: IS_MAC ? ['F2'] : [],
    bareCodes: IS_MAC ? ['Enter'] : [],
    fixed: true,
    hideInSettings: true,
  },
  {
    id: 'delete-node',
    labelKey: 'settings.shortcut.deleteNode.label',
    hintKey: 'settings.shortcut.deleteNode.hint',
    default: 'Delete',
    // Delete 不是功能键，SAFE_BARE_CODES 不放行；这里是它唯一的开口。范围越窄越好：
    // 只点名这一个键，别写成「所有非字母键」。
    bareCodes: ['Delete'],
    fixed: true,
    hideInSettings: true,
  },
  {
    /**
     * 全选资源管理器里当前可见的行（折叠着看不见的不算）。默认 ⌘/Ctrl + A ——
     * 这个键在编辑器里是「全选文本」，在这里靠作用域闸门分开：只有焦点在树行上时才拦，
     * 焦点在 Monaco / 输入框里一律原样放行（见 App.vue 的 treeRowFrom）。
     */
    id: 'select-all-nodes',
    labelKey: 'settings.shortcut.selectAllNodes.label',
    hintKey: 'settings.shortcut.selectAllNodes.hint',
    default: 'Mod+KeyA',
    fixed: true,
    hideInSettings: true,
  },
]

/** 单按修饰键时 keydown 也会来，这时还没到真正的键码，先不处理 */
const MODIFIER_CODES = new Set([
  'ControlLeft',
  'ControlRight',
  'MetaLeft',
  'MetaRight',
  'AltLeft',
  'AltRight',
  'ShiftLeft',
  'ShiftRight',
])

/**
 * 浏览器 / 系统已经占用的组合。判断标准是「拦不住」或「拦下来会出事」：
 * Ctrl+W / Ctrl+T / Ctrl+Tab 这类由浏览器 UI 层直接吃掉，preventDefault 无效，
 * 绑上去只会得到一个永远不触发的快捷键，所以要挡在录制阶段。
 * （Ctrl+S 不在此列：它虽然也是浏览器功能，但可被页面拦下，本项目的编辑器已经在用。）
 */
const BROWSER_RESERVED = new Set([
  'Mod+KeyW', // 关标签页
  'Mod+Shift+KeyW', // 关窗口
  'Mod+KeyT', // 新标签页
  'Mod+Shift+KeyN', // 隐身窗口
  'Mod+KeyN', // 新窗口
  'Mod+KeyQ', // 退出
  'Mod+KeyR', // 刷新
  'Mod+Shift+KeyR',
  'F5',
  'Mod+KeyL', // 跳到地址栏
  'Mod+Shift+Delete', // 清除浏览数据
  'Mod+Tab', // 切换标签页
  'Mod+Shift+Tab',
  'Mod+Digit0',
  'Mod+Digit1',
  'Mod+Digit2',
  'Mod+Digit3',
  'Mod+Digit4',
  'Mod+Digit5',
  'Mod+Digit6',
  'Mod+Digit7',
  'Mod+Digit8',
  'Mod+Digit9',
  'F11', // 全屏
  'F12', // 开发者工具
  'Mod+Shift+KeyI',
  'Mod+Shift+KeyJ',
  'Mod+Shift+KeyC',
  'Alt+F4',
  'Alt+ArrowLeft', // 后退
  'Alt+ArrowRight', // 前进
])

/** 允许单独按（不带修饰键）的键：功能键与 Esc 不会和打字冲突 */
const SAFE_BARE_CODES = /^(F([1-9]|1[0-2])|Escape)$/

/**
 * 某个动作能不能裸按这个键（不带任何修饰键）。
 *
 * 默认只有功能键 / Esc —— 它们在任何输入场合都不会和打字撞上。个别动作还能在自己的
 * `bareCodes` 里额外点名（目前只有「删除节点」的 Delete）。**这个口子要开得尽可能窄**：
 * 多放行一个字母键，就等于在全局吃掉用户的一次正常打字。
 *
 * 录制框也用它：Delete / Backspace 在录制态是「清除绑定」，可「删除节点」的正式键位
 * 就是 Delete —— 不对着 bareCodes 判一下，它一旦被清掉就再也录不回来了。
 *
 * @param {string} actionId
 * @param {string} combo
 * @returns {boolean}
 */
export function bareAllowedFor(actionId, combo) {
  if (!combo || combo.includes('+')) return false
  if (SAFE_BARE_CODES.test(combo)) return true
  const action = SHORTCUT_ACTIONS.find((item) => item.id === actionId)
  return Boolean(action?.bareCodes?.includes(combo))
}

/** 键码 → 界面上的写法 */
const KEY_LABELS = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Enter: 'Enter',
  Escape: 'Esc',
  Space: 'Space',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Home: 'Home',
  End: 'End',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
}

function defaultBindings() {
  const map = {}
  for (const action of SHORTCUT_ACTIONS) map[action.id] = action.default
  return map
}

/**
 * macOS 上「重命名」那次迁移（2026-10-20）用过的标记键。
 *
 * 迁移本身已经**没有必要**了：2026-10-25 起 `rename-node` 是 `fixed`，读盘时一律用默认值，
 * 老盘里躺着 `F2` 也影响不到 mac 的回车改名（F2 仍是这个动作的别名键）。这个常量现在只
 * 剩下「把它从 localStorage 里清掉」一个用途 —— 无主的键不该在用户盘里留着。
 */
const LEGACY_RENAME_MIGRATION_KEY = 'cp.shortcuts.mac-enter'

/** 键位写死的动作：读盘跳过它，写盘也谢绝 */
function isFixedAction(actionId) {
  return Boolean(SHORTCUT_ACTIONS.find((item) => item.id === actionId)?.fixed)
}

/**
 * 读盘。以默认值打底再套已存的键，这样以后新增动作时老用户也能拿到它的默认键，
 * 同时把已经不存在的动作（或手改坏的值）自然丢掉。
 */
function readBindings() {
  const map = defaultBindings()
  try {
    localStorage.removeItem(LEGACY_RENAME_MIGRATION_KEY)
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (!stored || typeof stored !== 'object') return map
    for (const action of SHORTCUT_ACTIONS) {
      // 写死的键位不认盘里的值（老用户存过 F2 也不算数），见文件头的 `fixed`
      if (action.fixed) continue
      if (typeof stored[action.id] === 'string') map[action.id] = stored[action.id]
    }
  } catch {
    /* 存的东西坏了就退回默认，不让一条坏记录把界面卡死 */
  }
  return map
}

const bindings = ref(readBindings())

/**
 * 是否有录制框正在录制。
 *
 * 全局监听挂在 window 的**捕获**阶段（Monaco 会在编辑器内部先吃掉按键，只有捕获阶段
 * 才抢得过它），而录制框的 keydown 在自己的按钮上（目标阶段）——捕获永远先跑，
 * 所以录制期间必须由这里喊停，否则「按下即生效」，功能会先被执行一遍。
 */
export const recordingActive = ref(false)

watch(
  bindings,
  (value) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    } catch {
      /* 隐私模式下写不进去，本次会话内仍然可用 */
    }
  },
  { deep: true },
)

// ------------------------------------------------------------ 规范化

/**
 * KeyboardEvent → 内部组合键串；只按了修饰键（还没到真正的键）返回 ''。
 * 录制与匹配共用这一个函数，所以两边永远对得上。
 * @param {KeyboardEvent} event
 * @returns {string}
 */
export function comboFromEvent(event) {
  if (!event.code || MODIFIER_CODES.has(event.code)) return ''

  const mod = IS_MAC ? event.metaKey : event.ctrlKey
  const ctrl = IS_MAC ? event.ctrlKey : false

  const parts = []
  if (mod) parts.push('Mod')
  if (ctrl) parts.push('Ctrl')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  parts.push(event.code)
  return parts.join('+')
}

/**
 * 组合键串 → 界面上给人看的写法。
 * @param {string} combo
 * @returns {string}
 */
export function formatCombo(combo) {
  if (!combo) return ''
  return combo
    .split('+')
    .map((part) => {
      if (part === 'Mod') return IS_MAC ? '⌘' : 'Ctrl'
      if (part === 'Ctrl') return IS_MAC ? '⌃' : 'Ctrl'
      if (part === 'Alt') return IS_MAC ? '⌥' : 'Alt'
      if (part === 'Shift') return IS_MAC ? '⇧' : 'Shift'
      if (KEY_LABELS[part]) return KEY_LABELS[part]
      if (/^Key[A-Z]$/.test(part)) return part.slice(3)
      if (/^Digit\d$/.test(part)) return part.slice(5)
      if (/^Numpad/.test(part)) return `Num ${part.slice(6)}`
      return part
    })
    .join(' + ')
}

/** Chrome 在 macOS 上回的键串是符号前缀（`⇧⌘U`），其它平台是 `Ctrl+Shift+U` 这种词 */
const CHROME_MODS_MAC = { '⌘': 'Mod', '⇧': 'Shift', '⌥': 'Alt', '⌃': 'Ctrl' }
const CHROME_MODS_OTHER = {
  Ctrl: 'Mod',
  Control: 'Mod',
  Command: 'Mod',
  Cmd: 'Mod',
  Shift: 'Shift',
  Alt: 'Alt',
  Option: 'Alt',
  MacCtrl: 'Ctrl',
}

/** Chrome 的键名 → KeyboardEvent.code。没登记的一律当「认不出」 */
const CHROME_KEY_CODES = {
  Up: 'ArrowUp',
  Down: 'ArrowDown',
  Left: 'ArrowLeft',
  Right: 'ArrowRight',
  // macOS 上方向键回的是符号，不是 Up / Down 这些名字
  '↑': 'ArrowUp',
  '↓': 'ArrowDown',
  '←': 'ArrowLeft',
  '→': 'ArrowRight',
  Comma: 'Comma',
  Period: 'Period',
  Slash: 'Slash',
  Semicolon: 'Semicolon',
  Quote: 'Quote',
  Backquote: 'Backquote',
  Minus: 'Minus',
  Equal: 'Equal',
  BracketLeft: 'BracketLeft',
  BracketRight: 'BracketRight',
  Backslash: 'Backslash',
  Space: 'Space',
  Enter: 'Enter',
  Escape: 'Escape',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
}

/**
 * 浏览器扩展报回来的快捷键串 → 本模块的组合键写法。
 *
 * `chrome.commands.getAll()` 给的是浏览器自己那套写法，和站点自己的 `Mod+Shift+KeyE`
 * 对不上，直接显示会让同一个界面出现两种键位格式。所以按浏览器写法拆开，再按本模块
 * 固定的修饰键顺序拼回去，最后交给 formatCombo 出字符串：
 * 这样两处快捷键的写法、符号、平台差异永远是同一套。
 * 认不出的键返回 ''，调用方原样显示就行。
 *
 * 浏览器回串有**两种形态**，按「串长什么样」分岔，不按运行平台分岔：
 * - **符号前缀**（`⌘⇧E` / `⇧⌘E`）：Chrome 系在 macOS 上的写法；
 * - **加号词形式**（`Ctrl+Shift+E`，macOS 上是 `Command+Shift+E` / `MacCtrl+Shift+E`）：
 *   Firefox 全平台、以及 Chrome 在 Windows / Linux 上的写法。
 * 同一个页面可能装在任一浏览器里（Firefox 的 API 在 macOS 上也回词形式），
 * 只看平台分岔会漏 —— 实测 macOS + Firefox 会把 `Command+Shift+E` 原样亮进面板。
 *
 * @param {string} raw
 * @returns {string} 组合键串，或 ''
 */
export function comboFromChromeShortcut(raw) {
  if (!raw) return ''

  const mods = new Set()
  let key = ''

  if (CHROME_MODS_MAC[raw[0]]) {
    // 符号形态：修饰键是连续的前缀符号，剥完剩下的就是键名
    let rest = raw
    while (rest && CHROME_MODS_MAC[rest[0]]) {
      mods.add(CHROME_MODS_MAC[rest[0]])
      rest = rest.slice(1)
    }
    key = rest
  } else {
    // 词形态：`Ctrl+Shift+E` 这样以 + 相连，末段是键名
    const parts = raw.split('+')
    key = (parts.pop() ?? '').trim()
    for (const part of parts) {
      const mod = CHROME_MODS_OTHER[part.trim()]
      if (mod) mods.add(mod)
    }
  }

  const code = /^[A-Z]$/.test(key)
    ? `Key${key}`
    : /^\d$/.test(key)
      ? `Digit${key}`
      : /^F\d{1,2}$/.test(key)
        ? key
        : CHROME_KEY_CODES[key]

  if (!code) return ''

  const ordered = ['Mod', 'Ctrl', 'Alt', 'Shift'].filter((mod) => mods.has(mod))
  return [...ordered, code].join('+')
}

// ------------------------------------------------------------ 读写绑定

/** @param {string} combo @returns {string|null} 命中的动作 id */
export function actionForCombo(combo) {
  if (!combo) return null
  // 主绑定优先：用户显式绑定过的那一颗永远比别人的别名键更算数（细则见 aliasesOf）
  for (const action of SHORTCUT_ACTIONS) {
    if (bindings.value[action.id] === combo) return action.id
  }
  for (const action of SHORTCUT_ACTIONS) {
    if (aliasesOf(action).includes(combo)) return action.id
  }
  return null
}

/**
 * 别名键（动作上的 `aliases`）是「额外认得、但不进绑定表、也不在界面上当当前键位显示」的键。
 *
 * 只给「平台默认键必须留个后门」的动作用（目前只有重命名：mac 默认 Enter、F2 作别名）。
 * 它不参与 `bindings` 的读写 —— 设置页显示、右键菜单右列都只认主绑定，免得同一个动作
 * 在界面上挂着两个键位。但匹配（actionForCombo）与冲突检测（shortcutConflict）都得认，
 * 否则把 F2 绑给别的动作时，mac 上会变成两颗一起响。
 */
function aliasesOf(action) {
  return action.aliases ?? []
}

/**
 * 这条绑定能不能用。返回 null 表示可用，否则是给用户看的原因。
 * @param {string} actionId 正在录制的动作（它自己的旧绑定不算冲突）
 * @param {string} combo
 * @returns {string|null}
 */
export function shortcutConflict(actionId, combo) {
  if (!combo) return null
  if (BROWSER_RESERVED.has(combo)) return t('settings.shortcut.reserved')
  if (!hasModifier(combo) && !bareAllowedFor(actionId, combo)) {
    return t('settings.shortcut.needModifier')
  }
  const owner = SHORTCUT_ACTIONS.find(
    (action) =>
      action.id !== actionId &&
      (bindings.value[action.id] === combo || aliasesOf(action).includes(combo)),
  )
  if (owner) return t('settings.shortcut.alreadyBound', { name: t(owner.labelKey) })
  return null
}

function hasModifier(combo) {
  return combo.split('+').length > 1
}

/** @param {string} actionId @param {string} combo */
export function setBinding(actionId, combo) {
  if (isFixedAction(actionId)) return false
  if (shortcutConflict(actionId, combo)) return false
  bindings.value = { ...bindings.value, [actionId]: combo }
  return true
}

/** @param {string} actionId */
export function clearBinding(actionId) {
  if (isFixedAction(actionId)) return
  bindings.value = { ...bindings.value, [actionId]: '' }
}

export function resetAll() {
  bindings.value = defaultBindings()
}

// ------------------------------------------------------------ 对外门面

/**
 * 组合式入口：拿到的都是模块级单例，反复调用只是拿同一份引用。
 * 刻意不持有生命周期钩子 —— 这份状态必须在任何组件挂载之前就能被读到
 * （App 的全局 keydown、EditorPane 的状态栏提示都要用）。
 */
export function useShortcutManager() {
  return { bindings, setBinding, clearBinding, resetAll, conflictOf: shortcutConflict }
}
