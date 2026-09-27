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

const STORAGE_KEY = 'cph.shortcuts'

/** macOS 上 Mod 是 ⌘、Ctrl 是字面的 Control；其他平台 Mod 就是 Ctrl */
export const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)

/**
 * 可绑定的动作。id 是给 App.vue 的处理表当键用的，label 只用于界面。
 * 这里只登记「本应用真的做得到」的动作：格式化没有进来，因为 Monaco 内置的
 * Shift+Alt+F 在 C++ / Python 下没有注册 formatter，绑了也是空按。
 */
export const SHORTCUT_ACTIONS = [
  { id: 'run', label: '运行全部用例', hint: '光标在编辑器里也生效', default: 'Mod+Enter' },
  { id: 'toggle-panel', label: '显示 / 隐藏侧边栏', default: 'Mod+KeyB' },
  { id: 'toggle-layout', label: '侧边栏左右对调', default: 'Mod+Shift+KeyB' },
  { id: 'new-case', label: '新增一条测试用例', default: 'Mod+Alt+Enter' },
  { id: 'open-settings', label: '打开 / 收起设置', default: 'Mod+Comma' },
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
  if (BROWSER_RESERVED.has(combo)) return '浏览器已经占用了这个组合，网页里拦不住它'
  if (!hasModifier(combo)) {
    return '至少要带一个 Ctrl / ⌘ / Alt，否则打字时会不停误触发'
  }
  const owner = SHORTCUT_ACTIONS.find((action) => action.id !== actionId && bindings.value[action.id] === combo)
  if (owner) return `已经绑给「${owner.label}」了`
  return null
}

function hasModifier(combo) {
  const parts = combo.split('+')
  if (parts.length > 1) return true
  return SAFE_BARE_CODES.test(parts[0])
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
