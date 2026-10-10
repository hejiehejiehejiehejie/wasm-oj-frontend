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

/** macOS 上 Mod 是 ⌘、Ctrl 是字面的 Control；其他平台 Mod 就是 Ctrl */
export const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)

/**
 * 可绑定的动作。id 是给 App.vue 的处理表当键用的，label/hint 只用于界面 ——
 * 所以这里存 key，界面（EditorSettingsPanel / HotkeyRecorder）再 t()。
 * 这里只登记「本应用真的做得到」的动作：格式化没有进来，因为 Monaco 内置的
 * Shift+Alt+F 在 C++ / Python 下没有注册 formatter，绑了也是空按。
 *
 * `bareCodes`（可选）= 这个动作额外允许的**裸键**（不带任何修饰键）。默认只有功能键与 Esc
 * 能裸按（见 SAFE_BARE_CODES），目前唯一的例外是「删除节点」的 Delete —— 它敢裸按是因为
 * 有一道作用域闸门兜着：只有焦点在文件树上时才触发（App.vue 的 treeRowFrom）。
 * **给别的动作加裸键之前先想清楚有没有同款闸门**，否则打字时会被全局吃掉。
 */
export const SHORTCUT_ACTIONS = [
  { id: 'run', labelKey: 'settings.shortcut.run.label', hintKey: 'settings.shortcut.run.hint', default: 'Mod+Enter' },
  { id: 'toggle-panel', labelKey: 'settings.shortcut.togglePanel.label', default: 'Mod+KeyB' },
  {
    id: 'switch-panel',
    labelKey: 'settings.shortcut.switchPanel.label',
    hintKey: 'settings.shortcut.switchPanel.hint',
    default: 'Mod+Shift+KeyE',
  },
  { id: 'toggle-layout', labelKey: 'settings.shortcut.toggleLayout.label', default: 'Mod+Shift+KeyB' },
  { id: 'new-case', labelKey: 'settings.shortcut.newCase.label', default: 'Mod+Alt+Enter' },
  { id: 'open-settings', labelKey: 'settings.shortcut.openSettings.label', default: 'Mod+Comma' },
  // 下面两条（2026-10-10 加）与上面六条不是一回事：它们**不跟着焦点走遍全站**，
  // 只作用于「资源管理器里当前有焦点的那一行」。执行入口不在 SHORTCUT_HANDLERS 里，
  // 而是在 App.vue 的 SHORTCUT_TREE_HANDLERS —— 那边先过一道作用域闸门再动手。
  {
    id: 'rename-node',
    labelKey: 'settings.shortcut.renameNode.label',
    hintKey: 'settings.shortcut.renameNode.hint',
    default: 'F2',
  },
  {
    id: 'delete-node',
    labelKey: 'settings.shortcut.deleteNode.label',
    hintKey: 'settings.shortcut.deleteNode.hint',
    default: 'Delete',
    // Delete 不是功能键，SAFE_BARE_CODES 不放行；这里是它唯一的开口。范围越窄越好：
    // 只点名这一个键，别写成「所有非字母键」。
    bareCodes: ['Delete'],
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
 * 读盘。以默认值打底再套已存的键，这样以后新增动作时老用户也能拿到它的默认键，
 * 同时把已经不存在的动作（或手改坏的值）自然丢掉。
 */
function readBindings() {
  const map = defaultBindings()
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (!stored || typeof stored !== 'object') return map
    for (const action of SHORTCUT_ACTIONS) {
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
 * `chrome.commands.getAll()` 给的是浏览器自己那套写法（macOS 上是 `⇧⌘U`），
 * 和站点自己的 `Mod+Shift+KeyE` 对不上，直接显示会让同一个界面出现两种键位格式。
 * 所以按浏览器写法拆开，再按本模块固定的修饰键顺序拼回去，最后交给 formatCombo 出字符串：
 * 这样两处快捷键的写法、符号、平台差异永远是同一套。
 * 认不出的键返回 ''，调用方原样显示就行。
 *
 * @param {string} raw
 * @returns {string} 组合键串，或 ''
 */
export function comboFromChromeShortcut(raw) {
  if (!raw) return ''

  const mods = new Set()
  let key = ''

  if (IS_MAC) {
    // macOS：修饰键是连续的前缀符号，剥完剩下的就是键名
    let rest = raw
    while (rest && CHROME_MODS_MAC[rest[0]]) {
      mods.add(CHROME_MODS_MAC[rest[0]])
      rest = rest.slice(1)
    }
    key = rest
  } else {
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
  for (const action of SHORTCUT_ACTIONS) {
    if (bindings.value[action.id] === combo) return action.id
  }
  return null
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
  const owner = SHORTCUT_ACTIONS.find((action) => action.id !== actionId && bindings.value[action.id] === combo)
  if (owner) return t('settings.shortcut.alreadyBound', { name: t(owner.labelKey) })
  return null
}

function hasModifier(combo) {
  return combo.split('+').length > 1
}

/** @param {string} actionId @param {string} combo */
export function setBinding(actionId, combo) {
  if (shortcutConflict(actionId, combo)) return false
  bindings.value = { ...bindings.value, [actionId]: combo }
  return true
}

/** @param {string} actionId */
export function clearBinding(actionId) {
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
