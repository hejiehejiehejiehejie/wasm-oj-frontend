<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import EngineSettingsPanel from './EngineSettingsPanel.vue'
import HelpPanel from './HelpPanel.vue'
import HotkeyRecorder from './HotkeyRecorder.vue'
import { usePersistentRef } from '../composables/usePersistentRef.js'
import { UI_SCALE_OPTIONS } from '../composables/useUiScale.js'
import { LOCALES, locale, setLocale, t } from '../i18n/index.js'
import { useInstallPrompt } from '../composables/useInstallPrompt.js'
import { useCompanionBridge } from '../composables/useCompanionBridge.js'
import {
  comboFromChromeShortcut,
  formatCombo,
  SHORTCUT_ACTIONS,
  useShortcutManager,
} from '../composables/useShortcutManager.js'
import { preload, probeRuntime, subscribeStatus, uninstallRuntime } from '../services/wasmRuntime.js'
import {
  CF_AUTO_INSTALL_KEY,
  cfReady,
  downloadCfPicker,
  reconcileCfRuntime,
  uninstallCfPicker,
} from '../services/cfRuntime.js'
import { AUTO_PRELOAD_KEY } from '../services/runtimePreload.js'
import { TIME_LIMIT_OPTIONS } from '../services/runner.js'
import { flush } from '../services/autoSave.js'
import { readStorageBreakdown, readStorageUsage } from '../services/storageQuota.js'
import {
  clearPendingCloudHandle,
  cloudEntryMissingHandle,
  markCloudEntryHandled,
  pendingCloudHandle,
} from '../services/cloudEntry.js'
import {
  applyProfile,
  collectProfile,
  fetchCloudProfile,
  requestCode,
  saveWithToken,
  verifyAndSave,
} from '../services/cloudProfile.js'
import {
  CURSOR_BLINKINGS,
  CURSOR_STYLES,
  EDITOR_SETTING_RANGES,
  EDITOR_SETTINGS_DEFAULTS,
  FONT_FAMILIES,
  LINE_HEIGHT_RATIOS,
  LINE_HIGHLIGHTS,
  LINE_NUMBER_MODES,
  PADDINGS,
  SCROLLBAR_SIZES,
  THEMES,
  WHITESPACE_MODES,
  WRAP_MODES,
} from '../services/editorOptions.js'
import {
  TEMPLATE_LANGUAGE_IDS,
  TEMPLATE_MAX_LENGTH,
  isTemplateModified,
  resetTemplate,
  setTemplate,
  setTemplatesEnabled,
  templateForLanguage,
  templatesEnabled,
} from '../services/fileTemplates.js'
import { LANGUAGES } from '../services/templates.js'

const props = defineProps({
  settings: { type: Object, required: true },
  panelPosition: { type: String, required: true },
  // 全局运行时限（毫秒，只计运行段），与 App.vue 的 cp.timeLimitMs 同源
  timeLimit: { type: Number, required: true },
  // 评测引擎状态（引擎列表 / 服务地址 / 自检结果）从 App 一路传下来，
  // 与侧边栏「评测样例」面板读到的是同一份
  judge: { type: Object, required: true },
  connection: { type: Object, required: true },
  // 设置视图此刻是否真的显示在编辑器里（合成页签被切走时为 false）。
  // 组件本身用 v-show 常驻挂载，靠这个 prop 决定何时重新核对本地运行环境。
  active: Boolean,
  // 全局界面缩放比例（1 / 1.1 / 1.25 / 1.5），与 App.vue 的 cp.uiScale 同源
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

// ------------------------------------------------------------ 编辑器设置的行描述
// 编辑器这块项最多，按小节铺开。每一行只描述「键 / 标签 / 控件类型 / 可选项」，
// 模板按 control 挑控件；可选项表全部来自 services/editorOptions.js，与 localStorage 校验、
// Monaco 真正吃到的选项共用同一份，免得面板里能选、编辑器却不认。
const EDITOR_GROUPS = [
  {
    titleKey: 'settings.editor.groupFont',
    rows: [
      {
        key: 'fontFamily',
        labelKey: 'settings.editor.fontFamily.label',
        hintKey: 'settings.editor.fontFamily.hint',
        control: 'select',
        options: FONT_FAMILIES,
      },
      {
        // 字号原挂在「外观」组里，但它就是编辑器的代码字号，挪到字体小节紧跟着字体族。
        // 文案沿用 appearance 那套（键没变，换的只是它显示在哪一组）。
        key: 'fontSize',
        labelKey: 'settings.appearance.fontSize.label',
        hintKey: 'settings.appearance.fontSize.hint',
        control: 'number',
      },
      {
        key: 'lineHeightRatio',
        labelKey: 'settings.editor.lineHeightRatio.label',
        hintKey: 'settings.editor.lineHeightRatio.hint',
        control: 'select',
        options: LINE_HEIGHT_RATIOS.map((ratio) => ({
          id: ratio,
          labelKey: 'settings.value.times',
          labelParams: { n: ratio },
        })),
      },
      {
        key: 'fontLigatures',
        labelKey: 'settings.editor.fontLigatures.label',
        hintKey: 'settings.editor.fontLigatures.hint',
        control: 'switch',
      },
    ],
  },
  {
    titleKey: 'settings.editor.groupEdit',
    rows: [
      {
        // 不是 Monaco 选项，是「什么时候把正文写回 VFS」的行为开关（见 services/autoSave.js）。
        // 摆在组首：它是这一组里唯一防丢数据的项。
        key: 'autoSave',
        labelKey: 'settings.editor.autoSave.label',
        hintKey: 'settings.editor.autoSave.hint',
        control: 'switch',
      },
      {
        key: 'tabSize',
        labelKey: 'settings.editor.tabSize.label',
        hintKey: 'settings.editor.tabSize.hint',
        control: 'select',
        options: [2, 4, 8].map((size) => ({
          id: size,
          labelKey: 'settings.value.spaces',
          labelParams: { n: size },
        })),
      },
      {
        key: 'insertSpaces',
        labelKey: 'settings.editor.insertSpaces.label',
        hintKey: 'settings.editor.insertSpaces.hint',
        control: 'switch',
      },
      {
        key: 'wordWrap',
        labelKey: 'settings.editor.wordWrap.label',
        hintKey: 'settings.editor.wordWrap.hint',
        control: 'select',
        options: WRAP_MODES,
      },
      {
        key: 'wordWrapColumn',
        labelKey: 'settings.editor.wordWrapColumn.label',
        hintKey: 'settings.editor.wordWrapColumn.hint',
        control: 'number',
      },
      {
        key: 'bracketPairColorization',
        labelKey: 'settings.editor.bracketPairColorization.label',
        hintKey: 'settings.editor.bracketPairColorization.hint',
        control: 'switch',
      },
      {
        key: 'indentGuides',
        labelKey: 'settings.editor.indentGuides.label',
        hintKey: 'settings.editor.indentGuides.hint',
        control: 'switch',
      },
      {
        key: 'bracketGuides',
        labelKey: 'settings.editor.bracketGuides.label',
        hintKey: 'settings.editor.bracketGuides.hint',
        control: 'switch',
      },
      {
        key: 'stickyScroll',
        labelKey: 'settings.editor.stickyScroll.label',
        hintKey: 'settings.editor.stickyScroll.hint',
        control: 'switch',
      },
      {
        key: 'scrollBeyondLastLine',
        labelKey: 'settings.editor.scrollBeyondLastLine.label',
        hintKey: 'settings.editor.scrollBeyondLastLine.hint',
        control: 'switch',
      },
      {
        key: 'smoothScrolling',
        labelKey: 'settings.editor.smoothScrolling.label',
        hintKey: 'settings.editor.smoothScrolling.hint',
        control: 'switch',
      },
    ],
  },
  {
    titleKey: 'settings.editor.groupCursor',
    rows: [
      {
        key: 'cursorStyle',
        labelKey: 'settings.editor.cursorStyle.label',
        hintKey: 'settings.editor.cursorStyle.hint',
        control: 'select',
        options: CURSOR_STYLES,
      },
      {
        key: 'cursorBlinking',
        labelKey: 'settings.editor.cursorBlinking.label',
        hintKey: 'settings.editor.cursorBlinking.hint',
        control: 'select',
        options: CURSOR_BLINKINGS,
      },
      {
        key: 'cursorSmoothCaretAnimation',
        labelKey: 'settings.editor.cursorSmoothCaretAnimation.label',
        hintKey: 'settings.editor.cursorSmoothCaretAnimation.hint',
        control: 'switch',
      },
      {
        key: 'renderLineHighlight',
        labelKey: 'settings.editor.renderLineHighlight.label',
        hintKey: 'settings.editor.renderLineHighlight.hint',
        control: 'select',
        options: LINE_HIGHLIGHTS,
      },
      {
        key: 'renderWhitespace',
        labelKey: 'settings.editor.renderWhitespace.label',
        hintKey: 'settings.editor.renderWhitespace.hint',
        control: 'select',
        options: WHITESPACE_MODES,
      },
    ],
  },
  {
    titleKey: 'settings.editor.groupView',
    rows: [
      {
        key: 'lineNumbers',
        labelKey: 'settings.editor.lineNumbers.label',
        hintKey: 'settings.editor.lineNumbers.hint',
        control: 'select',
        options: LINE_NUMBER_MODES,
      },
      {
        key: 'minimap',
        labelKey: 'settings.editor.minimap.label',
        hintKey: 'settings.editor.minimap.hint',
        control: 'switch',
      },
      {
        key: 'padding',
        labelKey: 'settings.editor.padding.label',
        hintKey: 'settings.editor.padding.hint',
        control: 'select',
        options: PADDINGS,
      },
      {
        key: 'scrollbarSize',
        labelKey: 'settings.editor.scrollbarSize.label',
        hintKey: 'settings.editor.scrollbarSize.hint',
        control: 'select',
        options: SCROLLBAR_SIZES,
      },
      {
        key: 'statusBar',
        labelKey: 'settings.editor.statusBar.label',
        hintKey: 'settings.editor.statusBar.hint',
        control: 'switch',
      },
    ],
  },
]

// 「外观」是独立的一级分类：主题与布局偏好（侧边栏位置 / 界面缩放 / 界面语言）收在这里。
// 字体大小本来就只对代码区有意义，已挪去「编辑器 › 字体」（见 EDITOR_GROUPS）。
// 剩下这一行仍是 editorSettings 的键，所以照搬编辑器那套行渲染（键 / 校验 / Monaco 都同源）。
const APPEARANCE_ROWS = [
  {
    key: 'theme',
    labelKey: 'settings.appearance.theme.label',
    hintKey: 'settings.appearance.theme.hint',
    control: 'select',
    options: THEMES,
  },
]

// 统一侧边栏的位置偏好存在 App.vue 的 cp.panelPosition 里，这里只负责发起一次对调
const PANEL_POSITIONS = [
  { id: 'right', labelKey: 'settings.option.sideRight' },
  { id: 'left', labelKey: 'settings.option.sideLeft' },
]

// 界面语言：与「判题语言」无关，后者由活跃文件的扩展名派生（见 HANDOFF 第 5 节坑 15）。
// 状态在 src/i18n/index.js 里是模块级单例，自己读写 localStorage，所以不走 props / emits。
const LOCALE_OPTIONS = LOCALES.map((item) => ({ id: item.id, label: item.label }))

// 设置分类目录：左侧导航项与右侧内容一一对应，点哪一项就只渲染那一组设置。
// activeSection 只活在这个组件里（不落 localStorage）：设置视图本来就是常驻挂载的，
// 一次会话里切来切去能记住上次看的那一类，关掉页签再打开也不丢。
// 初值是目录里的第一项「常用设置」——第一次打开（或刷新后）就落在这里。
const SECTIONS = [
  { id: 'common', titleKey: 'settings.section.common', icon: 'star' },
  { id: 'appearance', titleKey: 'settings.section.appearance', icon: 'sliders' },
  { id: 'editor', titleKey: 'settings.section.editor', icon: 'code' },
  { id: 'templates', titleKey: 'settings.section.templates', icon: 'file' },
  { id: 'shortcuts', titleKey: 'settings.section.shortcuts', icon: 'keyboard' },
  { id: 'judge', titleKey: 'settings.section.judge', icon: 'check' },
  { id: 'cloud', titleKey: 'settings.section.cloud', icon: 'cloud' },
  { id: 'app', titleKey: 'settings.section.app', icon: 'install' },
  { id: 'help', titleKey: 'settings.section.help', icon: 'help' },
]

// 模板的两张查表：语言 id → 文案 key / 扩展名。
// 表里存 key、模板里再 t() 一次，切界面语言才会跟着变；
// 扩展名从 templates.js 的 LANGUAGES 取，不在面板里另写一份 'cpp' / 'py' / 'md'。
const TEMPLATE_LABEL_KEYS = {
  cpp: 'settings.templates.lang.cpp',
  python: 'settings.templates.lang.python',
  markdown: 'settings.templates.lang.markdown',
}
const TEMPLATE_EXTENSIONS = {
  cpp: LANGUAGES.cpp.extension,
  python: LANGUAGES.python.extension,
  markdown: LANGUAGES.markdown.extension,
}

/**
 * 模板文本框里按 Tab 插入制表符，而不是跳到下一个控件。
 *
 * 这里装的是代码，编辑器默认也是「按 Tab 出制表符」（设置 › 编辑器 › 空格代替 Tab 默认关），
 * 让焦点跳走等于「想缩进却跳到了别处」—— 空档感来自 tab-size（CSS）而光标又不真插入。
 * 代价是没法靠 Tab 离开本框，Shift+Tab 照常放行（那个分支不拦）。
 *
 * 直接写 DOM 再 setTemplate()：`el.value` 先落到目标值，Vue 回来 patch `:value` 时
 * 新值与之相等、不会重新赋值，光标因此留得住（被 TEMPLATE_MAX_LENGTH 截断时才会归位到末尾）。
 * @param {KeyboardEvent} event
 * @param {string} id 语言 id
 */
function onTemplateKeydown(event, id) {
  if (event.key !== 'Tab' || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return
  event.preventDefault()
  const el = event.target
  const start = el.selectionStart ?? el.value.length
  const end = el.selectionEnd ?? start
  const next = `${el.value.slice(0, start)}\t${el.value.slice(end)}`
  el.value = next
  setTemplate(id, next)
  const caret = start + 1
  el.setSelectionRange(caret, caret)
}

const activeSection = ref('common')

// 站点内快捷键：绑定表与冲突规则都在 useShortcutManager 里，这里只做界面。
// 录制、冲突红字、阻止绑定都收在 HotkeyRecorder 内部（它要一边录一边校验）。
const { resetAll } = useShortcutManager()

// 安装到设备（2026-09 顶栏删除后从顶栏那颗按钮搬进来的）：浏览器判定可安装时才亮出来
const { canInstall, install } = useInstallPrompt()

// ------------------------------------------------------------ 存储占用
// 申请持久化是隐性的：App.vue 启动时静默做过一次，这里不展示状态、也不给按钮。
// 只说一件事 —— 这个源现在占了多少、上限多少。usage 含工具链与外壳缓存，不只是用户代码。
const storageUsage = ref({ usage: null, quota: null })

// 明细默认收起：上面那个总量只问一次 StorageManager，而 readStorageBreakdown() 要
// 遍历每个缓存桶的每一条响应、还要开库遍历记录 —— 展开才值得付这份代价。
const storageOpen = ref(false)
const storageBreakdown = ref(null)

/**
 * 分类 → 显示名词条。前三条直接复用「本地运行环境」的词条：C++ / Python 3 / Markdown / LaTeX
 * 说的就是同一批资产，各写一份迟早会漂（改了运行时的名字，存储这里得跟着改，不然两处对不上）。
 * 后三条是存储这边独有的（组件那行按你的要求用简称，我的代码 / 外壳与其它别处不出现）。
 */
const STORAGE_CATEGORY_LABEL = {
  cpp: 'runtime.cpp.title',
  python: 'runtime.python.title',
  markdown: 'runtime.markdown.title',
  cf: 'settings.app.storage.categories.cf',
  code: 'settings.app.storage.categories.code',
  other: 'settings.app.storage.categories.other',
}

// 收起时把明细扔掉（下次展开重新量），但总量留着：那一行还得继续显示。
function closeStorageBreakdown() {
  storageOpen.value = false
  storageBreakdown.value = null
}

async function toggleStorage() {
  if (storageOpen.value) {
    closeStorageBreakdown()
    return
  }
  storageOpen.value = true
  storageBreakdown.value = await readStorageBreakdown()
}

// 只报个大概：配额常是几十 GB，精确到小数没有意义
function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${unit === 0 ? value : value.toFixed(1)} ${units[unit]}`
}

// 明细里那列百分比。分母用明细自己的 total（各段之和），不是 storageUsage ——
// 两者相等，但只有前者的和真的等于 100%，不会因为两次读数差几十字节就凑不满
function formatPercent(bytes) {
  const total = storageBreakdown.value?.total ?? 0
  if (!total) return '—'
  const percent = (bytes / total) * 100
  // 占了一点点的分类显示成 0.0% 会被读成「什么都没有」，不如说清楚是「不到 0.1」
  if (percent > 0 && percent < 0.1) return '<0.1%'
  return `${percent.toFixed(1)}%`
}

async function refreshStorageUsage() {
  storageUsage.value = await readStorageUsage()
}

// estimate() 要问浏览器，常驻定时刷新没有意义：挂载时读一次打底（见 onMounted），
// 之后每次切到这一栏再读一次 —— 下载完工具链、写完文件，占用都会变。
// 刻意不跟着 props.active 走：第一次打开面板前也得先有数。
watch(activeSection, (section) => {
  // 离开这一栏就把明细收起：它默认是折叠的，回来时也该是折叠的
  if (section !== 'app') {
    closeStorageBreakdown()
    return
  }
  void refreshStorageUsage()
})

// ------------------------------------------------------------ 浏览器插件
// 安装包放在 public/extension/ 下。文件名带版本号是刻意的：Service Worker 对同源 GET 走
// cacheFirst 且从不重新校验，不带版本号的 URL 会把旧包一直喂给已经来过的用户。
// 发新版插件时只需改这两个常量，再把新 zip 拷进 public/extension/。
const EXTENSION_VERSION = '2.66.2'
const EXTENSION_FILE = `cc-for-web-${EXTENSION_VERSION}.zip`
const EXTENSION_DOWNLOAD_URL = `/extension/${EXTENSION_FILE}`

// 扩展对外只暴露 _execute_action 这类内部 id，显示名只能在这边维护
const EXTENSION_COMMAND_KEYS = {
  _execute_action: 'settings.extension.commandParsePage',
}

const {
  extensionInfo,
  checking: extensionChecking,
  refresh: refreshExtension,
  setExtensionConfig,
} = useCompanionBridge()

// 状态点：检测中偏「等待」，装好了绿，没探到红（与下面那个短标签同一套语义）
const extensionDotClass = computed(() => {
  if (extensionChecking.value) return 'is-busy'
  return extensionInfo.value ? 'is-ok' : 'is-fail'
})

// 标签就放在原来那行说明的位置：说明和它说的是同一件事，留一句就够
const extensionStatusLabel = computed(() => {
  if (extensionChecking.value) return t('settings.extension.checkingHint')
  return t(extensionInfo.value ? 'settings.extension.statusRunning' : 'settings.extension.statusMissing')
})

const extensionShortcuts = computed(() =>
  (extensionInfo.value?.commands ?? []).map((command) => {
    // 扩展回的是浏览器自己那套写法（macOS 上是 `⇧⌘U`），转成站点这套再交给 formatCombo，
    // 免得同一个界面里两种键位格式并存；认不出的键就原样显示，不做二次加工
    const combo = comboFromChromeShortcut(command.shortcut)

    return {
      name: command.name,
      label: EXTENSION_COMMAND_KEYS[command.name]
        ? t(EXTENSION_COMMAND_KEYS[command.name])
        : command.description || command.name,
      // 空串 = 浏览器没给它分配键，模板据此显示「未设置」
      keys: combo ? formatCombo(combo) : command.shortcut,
    }
  }),
)

// 投递目标：这两个开关的真值存在扩展的 chrome.storage 里，网页只读写镜像。
// 键名与扩展 background.ts 的白名单一一对应，改了那边也得同步改这里。
const EXTENSION_DESTINATIONS = [
  {
    key: 'sendToWebPage',
    labelKey: 'settings.extension.destinationWebPage',
    hintKey: 'settings.extension.destinationWebPageHint',
  },
  {
    key: 'sendToLocalTools',
    labelKey: 'settings.extension.destinationLocalTools',
    hintKey: 'settings.extension.destinationLocalToolsHint',
  },
]

/** 正在写的那一行（键名），写盘期间禁用它避免连点 */
const destinationSaving = ref('')
const destinationFailed = ref(false)

/** 扩展没上报 config（旧版）或该项缺失时按默认开处理，与扩展侧默认值一致 */
function destinationOn(key) {
  return extensionInfo.value?.config?.[key] !== false
}

async function toggleDestination(key) {
  if (destinationSaving.value) return

  destinationSaving.value = key
  destinationFailed.value = false
  // 回执成功后 useCompanionBridge 会把新值并进 extensionInfo.config，开关自己就翻转了
  const ok = await setExtensionConfig(key, !destinationOn(key))
  if (!ok) destinationFailed.value = true
  destinationSaving.value = ''
}

const shortcutsCopied = ref(false)
let copyTimer = 0

// 浏览器的安全策略不允许网页改插件快捷键，也拦掉了指向 chrome:// 的跳转，
// 所以这里只能把地址复制给用户，让他自己去地址栏粘贴。
async function copyShortcutsUrl() {
  try {
    await navigator.clipboard.writeText('chrome://extensions/shortcuts')
    shortcutsCopied.value = true
    window.clearTimeout(copyTimer)
    copyTimer = window.setTimeout(() => {
      shortcutsCopied.value = false
    }, 2000)
  } catch {
    /* 非安全上下文或用户未授权：保持原样，提示里已写明地址 */
  }
}

// 插件可能在页面打开之后才装上或才被重载，所以每次切到「应用」这一栏都重探一次
watch(activeSection, (section) => {
  if (section === 'app') refreshExtension()
})

onBeforeUnmount(() => window.clearTimeout(copyTimer))

// ------------------------------------------------------------ 本地运行环境
// 「是否已下载」不再只看一个 localStorage 布尔标记（它会过期：浏览器随时可能清缓存，
// 而标记还留着）。真正的判据是 probeRuntime() 的只读缓存探针；localStorage 标记只用来
// 给首帧播种，避免面板先闪一下「下载」再跳成「已就绪」。
const RUNTIMES = [
  {
    id: 'cpp',
    titleKey: 'runtime.cpp.title',
    icon: 'cpp',
    readyFlag: 'cp.localRuntime.clangReady',
    idleHintKey: 'runtime.cpp.idleHint',
    downloadTitleKey: 'runtime.cpp.downloadTitle',
    uninstallHintKey: 'runtime.cpp.uninstallHint',
    uninstallTitleKey: 'runtime.uninstallTitle',
  },
  {
    id: 'python',
    titleKey: 'runtime.python.title',
    icon: 'python',
    readyFlag: 'cp.localRuntime.pythonReady',
    idleHintKey: 'runtime.python.idleHint',
    downloadTitleKey: 'runtime.python.downloadTitle',
    uninstallHintKey: 'runtime.python.uninstallHint',
    uninstallTitleKey: 'runtime.uninstallTitle',
  },
  // 题解渲染器不是 WASM 运行时（不解压、不入 IndexedDB），但在用户眼里就是「同一张清单里
  // 的一个可下载项」，所以挂在这里共用同一套状态机与增删按钮，下载逻辑走 services/mdRuntime.js
  {
    id: 'markdown',
    titleKey: 'runtime.markdown.title',
    icon: 'markdown',
    readyFlag: 'cp.localRuntime.markdownReady',
    idleHintKey: 'runtime.markdown.idleHint',
    downloadTitleKey: 'runtime.markdown.downloadTitle',
    uninstallHintKey: 'runtime.markdown.uninstallHint',
    uninstallTitleKey: 'runtime.uninstallTitle',
  },
]

/**
 * 每个语言一份独立状态机：idle（未下载）→ downloading → ready / failed。
 * 两份互不影响，串行队列又保证同一时刻只有一个真的在下载。
 */
function createRuntimeState(runtime) {
  const readyFlagRef = usePersistentRef(runtime.readyFlag, false)
  return {
    ...runtime,
    readyFlagRef,
    state: ref(readyFlagRef.value ? 'ready' : 'idle'),
    failureReason: ref(''),
    elapsedMs: ref(0),
  }
}

const runtimeEntries = RUNTIMES.map(createRuntimeState)

/**
 * 预下载勾选：这里是**唯一的写入口**，启动时空闲自动下载由 services/runtimePreload.js
 * 读同一个键执行；两处的键名共用 AUTO_PRELOAD_KEY 常量，不各写一份字面量。
 *
 * 存的是运行时 id 的数组而不是三个布尔：加一个语言只要进 RUNTIMES 与白名单即可，
 * 而且 array 本身就是云同步里 cp.autoPreload 的形状。
 */
const autoPreload = usePersistentRef(AUTO_PRELOAD_KEY, [])

function isAutoPreload(id) {
  return autoPreload.value.includes(id)
}

function toggleAutoPreload(id) {
  const next = new Set(autoPreload.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  // 按 RUNTIMES 的顺序归一化：勾选先后顺序不该污染落盘的内容，云同步后比对也更干净
  autoPreload.value = RUNTIMES.map((item) => item.id).filter((itemId) => next.has(itemId))
}

// 沙箱实时阶段播报（download / compile / run），下载中的那一行靠它显示进度文案
const live = ref({ stage: 'idle', message: '' })

const downloadingAny = computed(() =>
  runtimeEntries.some((entry) => entry.state.value === 'downloading'),
)

function hintFor(entry) {
  if (entry.state.value === 'downloading') return live.value.message || t('runtime.downloading')
  // 就绪时只留耗时：状态本身交给行首那颗绿点，再说一遍「运行环境已就绪」是重复。
  // 没耗时（比如这次是上次会话就装好的）就什么都不说，只留绿点。
  if (entry.state.value === 'ready') {
    return entry.elapsedMs.value
      ? t('runtime.readyWithTime', { seconds: (entry.elapsedMs.value / 1000).toFixed(1) })
      : ''
  }
  if (entry.state.value === 'failed') return entry.failureReason.value || t('runtime.failed')
  return t(entry.idleHintKey)
}

// 就绪态整颗按钮都收起了，所以这里没有「已就绪」这一支
function buttonLabel(entry) {
  if (entry.state.value === 'downloading') return t('runtime.button.downloading')
  if (entry.state.value === 'failed') return t('runtime.button.failed')
  return t('runtime.button.idle')
}

function buttonIcon(entry) {
  if (entry.state.value === 'failed') return 'reset'
  return 'download'
}

// 行内状态点的语义色：就绪绿 / 失败红 / 下载中橙 / 未装灰
function runtimeDotClass(entry) {
  if (entry.state.value === 'ready') return 'is-ok'
  if (entry.state.value === 'failed') return 'is-fail'
  if (entry.state.value === 'downloading') return 'is-busy'
  return 'is-idle'
}

// 下载就是把该语言的资产拉进缓存，之后引擎评测和这里共用同一份，不需要常驻 Worker。
async function downloadRuntime(entry) {
  if (downloadingAny.value || entry.state.value === 'ready') return
  entry.state.value = 'downloading'
  entry.failureReason.value = ''
  // 第三个参数是进度回调：工具链的进度走 subscribeStatus 总线，题解渲染器没有总线，
  // 由这里把播报塞进同一个 live，下载中那一行才能显示「已下载 n/m」而不是干等
  const message = await preload(entry.id, undefined, (status) => {
    live.value = status
  })
  if (message.type === 'ready') {
    entry.state.value = 'ready'
    entry.elapsedMs.value = message.durationMs ?? 0
    entry.readyFlagRef.value = true
    return
  }
  entry.state.value = 'failed'
  entry.failureReason.value = message.message || t('runtime.failed')
}

// ------------------------------------------------------------ 卸载

/** 待确认卸载的运行时；null = 没有待确认的卸载。
 *  必须用 shallowRef：运行时项自己带着 state / elapsedMs 这些 ref，放进 ref() 会被深度
 *  转成 reactive 并**自动拆包**（`entry.state` 直接变成字符串），后面 `entry.state.value = 'idle'`
 *  就会抛「Cannot create property 'value' on string」——卸载看起来毫无反应。 */
const pendingUninstall = shallowRef(null)
/** 卸载确认弹窗里的「卸载」按钮：弹窗打开时把焦点送进去 */
const uninstallBtn = ref(null)

function requestUninstall(entry) {
  if (downloadingAny.value || entry.state.value !== 'ready') return
  pendingUninstall.value = entry
}

function cancelUninstall() {
  pendingUninstall.value = null
}

/**
 * 真卸载。先从服务层清缓存 / 内存（失败也不报错，见 uninstallRuntime），
 * 再把面板状态打回「未下载」——标记、用时、失败原因一并复位，
 * 之后 reconcile() 也会以探针为准（SW 控制时只看 Cache Storage，不会残留判回已就绪）。
 */
async function confirmUninstall() {
  const entry = pendingUninstall.value
  pendingUninstall.value = null
  if (!entry) return
  // 抽题组件不是 RUNTIMES 里那一套：资产在 IndexedDB 里、状态机在 cfRuntime，
  // 所以只有「清本机」交给服务层，界面状态与那两个开关各自归位
  if (entry.id === CF_UNINSTALL_TARGET.id) {
    await uninstallCfPicker()
    cfElapsedMs.value = 0
    cfFailureReason.value = ''
    // 同下面的预下载：「卸载」是在说「这东西别留在本机」，而「默认安装」是在说
    // 「自动把它下回来」，两个意图直接冲突。留着开关的话，下次打开站点
    // ensureCfPickerInstalled() 又把它装回来，这次卸载等于没卸。
    if (cfAutoInstall.value) cfAutoInstall.value = false
    return
  }
  await uninstallRuntime(entry.id)
  entry.state.value = 'idle'
  entry.elapsedMs.value = 0
  entry.failureReason.value = ''
  entry.readyFlagRef.value = false
  // 顺手取消预下载：「卸载」是在说「这东西别留在本机」，而预下载是在说「自动把它下回来」，
  // 两个意图直接冲突。留着勾选的话，用户下次打开页面就会发现刚删掉的 50MB 又回来了。
  if (isAutoPreload(entry.id)) toggleAutoPreload(entry.id)
}

// 弹窗一出现就把焦点放到「卸载」上：Enter 确认、Esc 取消都能纯键盘走完
watch(pendingUninstall, (entry) => {
  if (entry) nextTick(() => uninstallBtn.value?.focus())
})

// ------------------------------------------------------------ 抽题组件（默认安装的组件）
// 它不在 RUNTIMES 里：那一套的状态机绑死了 toolsRuntime 的 preload / probeRuntime / uninstallRuntime，
// 而抽题组件的「资产」是 Codeforces 题库（存在 IndexedDB 里），下载即预取。
// 界面状态在这里，「是否已下载」的真值来自 services/cfRuntime.js 的 cfReady ——
// 侧栏那颗按钮读的是同一个 ref，两边永远一致。
//
// 卸载复用同一颗确认弹窗：给这个目标一份与 RUNTIMES 项同形的
// { titleKey, uninstallTitleKey, uninstallHintKey }，弹窗那边就不必管它是不是运行时。
// 它没有 state / readyFlagRef —— 那两样由 cfReady 与下面的 cfBusy 各自表达，
// 所以 confirmUninstall 里对它单独一支，不复用运行时那套复位。
const CF_UNINSTALL_TARGET = {
  id: 'cf',
  titleKey: 'cf.module.title',
  uninstallTitleKey: 'cf.module.uninstallTitle',
  uninstallHintKey: 'cf.module.uninstallHint',
}

const cfBusy = ref(false)
const cfFailureReason = ref('')
const cfElapsedMs = ref(0)
/** 下载中的阶段播报（Worker 推的机器码翻成文案） */
const cfStage = ref('')

/**
 * 「默认安装」开关。与 autoPreload 同理：它是**偏好**（要不要自动装），
 * 所以开关放在「云同步」一栏、键进云同步白名单；「本机装没装」（cfReady）是设备事实，不进。
 * usePersistentRef 是这个键唯一的写入口，启动时的读取走 cfRuntime 的 readCfAutoInstall()，
 * 两处共用 CF_AUTO_INSTALL_KEY 常量，不各写一份字面量。
 */
const cfAutoInstall = usePersistentRef(CF_AUTO_INSTALL_KEY, true)

function toggleCfAutoInstall() {
  cfAutoInstall.value = !cfAutoInstall.value
  // 从关到开、而题库还没在本机：立刻补装（进度直接显示在上面那一行），不必等下次启动
  if (cfAutoInstall.value && !cfReady.value && !cfBusy.value) void downloadCf()
}

const CF_STAGE_KEYS = {
  problemset: 'cf.module.stage.problemset',
  solved: 'cf.module.stage.solved',
  handle: 'cf.module.stage.handle',
}

const cfHint = computed(() => {
  if (cfBusy.value) {
    return (cfStage.value && t(CF_STAGE_KEYS[cfStage.value])) || t('cf.module.downloading')
  }
  if (cfReady.value) {
    // 同运行环境行：就绪由绿点表达，这里只补耗时
    return cfElapsedMs.value
      ? t('runtime.readyWithTime', { seconds: (cfElapsedMs.value / 1000).toFixed(1) })
      : ''
  }
  if (cfFailureReason.value) return cfFailureReason.value
  return t('cf.module.idleHint')
})

// 同 buttonLabel：就绪态按钮不画
const cfButtonLabel = computed(() => {
  if (cfBusy.value) return t('runtime.button.downloading')
  if (cfFailureReason.value) return t('runtime.button.failed')
  return t('runtime.button.idle')
})

const cfButtonIcon = computed(() => {
  if (cfFailureReason.value) return 'reset'
  return 'download'
})

const cfDotClass = computed(() => {
  if (cfReady.value) return 'is-ok'
  if (cfFailureReason.value) return 'is-fail'
  if (cfBusy.value) return 'is-busy'
  return 'is-idle'
})

async function downloadCf() {
  if (cfBusy.value || cfReady.value) return
  cfBusy.value = true
  cfFailureReason.value = ''
  cfStage.value = ''
  const result = await downloadCfPicker((stage) => {
    cfStage.value = stage
  })
  cfBusy.value = false
  if (result.type === 'ready') {
    cfElapsedMs.value = result.durationMs ?? 0
    return
  }
  cfFailureReason.value = result.message || t('runtime.failed')
}

// 卸载入口：与运行时的 requestUninstall 同形 —— 下载中不给点（会和在途的写入打架），
// 没装就没有可卸的。真卸载见 confirmUninstall。
function requestCfUninstall() {
  if (cfBusy.value || !cfReady.value) return
  pendingUninstall.value = CF_UNINSTALL_TARGET
}

/**
 * 用真实缓存情况校正两个语言的状态（探针只读本地缓存，不触网）：
 * - 标记说没下、但资产其实已在缓存（比如用户没点下载、直接跑了一次代码）→ 补成已就绪；
 * - 标记说下过、缓存却已被清掉 → 退回未下载，而不是继续显示一个假的「已就绪」。
 * 下载中的那一行不碰，免得跳状态。
 */
let reconcileToken = 0
async function reconcile() {
  const token = ++reconcileToken
  const results = await Promise.all(
    runtimeEntries.map(async (entry) => ({
      entry,
      cached: await probeRuntime(entry.id),
    })),
  )
  if (token !== reconcileToken) return
  for (const { entry, cached } of results) {
    if (entry.state.value === 'downloading') continue
    const next = cached ? 'ready' : 'idle'
    if (entry.state.value !== next) entry.state.value = next
    // 跟磁盘上的原始值比（而不是跟内存 ref 比）：可能有别的路径直接写了 localStorage，
    // 原始值与探针结论不一致时，以探针为准把标记正回来。
    if (readRawFlag(entry.readyFlag) !== cached) {
      writeRawFlag(entry.readyFlag, cached)
      // 内存 ref 若恰好已经是同一个值（外部改了磁盘、ref 没动），赋值不会触发
      // watch 写盘，所以上面直接写磁盘；ref 不一致时再同步内存。
      if (entry.readyFlagRef.value !== cached) entry.readyFlagRef.value = cached
    }
  }
}

function readRawFlag(key) {
  try {
    return JSON.parse(window.localStorage.getItem(key))
  } catch {
    return null
  }
}

function writeRawFlag(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 写不进去就算了，下次探针还会再试 */
  }
}

let unsubscribe = null

onMounted(() => {
  // 订阅阶段播报只为了「下载中」那一行的进度文案。
  // 注意不在这里 reconcile：探针用的是 only-if-cached，缓存未命中时浏览器会往控制台
  // 记一条 ERR_CACHE_MISS，页面一加载就探等于白刷一屏红字。改成切到设置视图时探一次。
  unsubscribe = subscribeStatus((status) => {
    live.value = status
  })
  // 存储占用打底。它只问浏览器的 StorageManager，不发请求、不碰缓存，
  // 所以和上面那条「别在挂载时探缓存」的顾虑无关。
  void refreshStorageUsage()
})

// 每次切到设置视图都重新核对缓存，别一直显示上次打开时的旧结论；
// 用户不点下载直接跑代码、运行时其实已落缓存的情况，也是在这一刻被补成「已就绪」。
watch(
  () => props.active,
  (active) => {
    if (!active) return
    void reconcile()
    // 抽题组件的资产在 IndexedDB 里，探针（cfStatus）要走 Worker，所以它自己那一套：
    // 标记说没装就一个线程都不起，标记说装过才去库里核实（见 services/cfRuntime.js）。
    void reconcileCfRuntime()
  },
)

onBeforeUnmount(() => {
  unsubscribe?.()
})

function set(key, value) {
  emit('update:settings', { ...props.settings, [key]: value })
}

/** 数字行的取值区间（min/max 与读盘校验共用 editorOptions.js 里的同一份） */
function rangeOf(row) {
  return EDITOR_SETTING_RANGES[row.key] ?? [0, 1000]
}

/** 该行是否偏离默认值——决定行左侧那条「已改动」指示线亮不亮 */
function isModified(row) {
  return props.settings[row.key] !== EDITOR_SETTINGS_DEFAULTS[row.key]
}

/** 归一化：只留字母数字、转小写，用来比较「标签」与「键名」是不是同一句话 */
const normalizeForCompare = (text) => text.replace(/[^a-z0-9]/gi, '').toLowerCase()

/**
 * 这一行还要不要显示紧跟标签的那个内部键名。
 *
 * 英文界面里不少行的标签就是键名的「Title Case + 空格」写法（`Theme` / `theme`、
 * `Minimap` / `minimap`、`Font size` / `fontSize`），那一小行等宽字纯属重复，收掉；
 * 键名真的与标签不同时才留着——它是给「想直接查 Monaco 选项名」的人看的极低频参考信息
 * （`Current line highlight` / `renderLineHighlight`、`Indent width` / `tabSize`）。
 *
 * 判据刻意做成**与语言无关**的归一化比较（相等即视为重复）：中文标签（`主题` / `缩略图` /
 * `内边距`）永远不可能等于 ASCII 键名，所以中文界面一行都不会被收掉；英文界面里也只有那批
 * 真正重复的行命中。好处是不用再维护一张「哪几行不显示键名」的名单——往编辑器组加新行时，
 * 标签起得和键名重了它自然就藏起来。
 *
 * 注意这里是**函数**而不是预计算的 Set：模板里每次渲染都重算，但它读的是 `t()`（即 `locale`
 * 这个 ref），放在函数里才能跟着切语言变——写成模块级常量会把语言冻结在那一刻。
 */
function showKey(row) {
  return normalizeForCompare(t(row.labelKey)) !== normalizeForCompare(row.key)
}

function setNumber(row, event) {
  const value = Number.parseInt(event.target.value, 10)
  if (!Number.isFinite(value)) return
  const [min, max] = rangeOf(row)
  set(row.key, Math.min(max, Math.max(min, value)))
}

/** 下拉的 value 永远是字符串，而「Tab 宽度 / 行高」这类选项 id 是数字，要转回来 */
function coerce(row, raw) {
  return typeof row.options[0].id === 'number' ? Number(raw) : raw
}

// 下拉里选中的始终是「当前值」，选中另一侧就等于发起一次对调（App 那边会翻转偏好）
function setPanelPosition(event) {
  if (event.target.value !== props.panelPosition) emit('toggle-layout')
}

/** 缩放档位选中即生效（App 那边写进 cp.uiScale，再落到根字号） */
function setUiScale(event) {
  emit('update:ui-scale', Number(event.target.value))
}

/** 缩放档位的显示名：就是百分比本身，不标默认档 */
function scaleLabel(scale) {
  return `${Math.round(scale * 100)}%`
}

/** 界面语言选中即生效。状态由 i18n 模块自己持久化（cp.uiLocale），不经 App 中转。 */
function setUiLocale(event) {
  setLocale(event.target.value)
}

function limitLabel(ms) {
  return `${ms / 1000} s`
}

function setTimeLimit(event) {
  emit('update:time-limit', Number(event.target.value))
}

// ------------------------------------------------------------ 云端同步
// 账号记录（绑定的用户名 + 云端最近更新时间）只留在本机：它是「**这台设备**绑的是谁」的事实，
// 跟着账号走没有意义（换台设备要重新验证），所以不进 cloudProfile 的同步白名单。
// handle 为空串 = 未绑定。
const cloudAccount = usePersistentRef('cp.cloudAccount', { handle: '', updatedAt: '' })

/**
 * 设备令牌：/verify-save 验证成功时由服务端签发（响应里的 token），之后写入走 /api/save，
 * 不必再让用户去改一遍 Codeforces 的 Last name —— 这就是它存在的唯一理由。
 * 与 cloudAccount 一样只留在本机，且**绝不进 cloudProfile 的同步白名单**：
 * 令牌与 handle 一对一绑定，同步过去等于把别的设备的写入权也搬过来。
 */
const cloudToken = usePersistentRef('cp.cloudToken', '')

// 取过码、还没验证通过的那一次「待办」：pendingHandle 是取码用的用户名（已绑定时就是绑定的那个），
// code 非空就表示验证码面板正开着。
const cloudPendingHandle = ref('')
const cloudCode = ref('')
const cloudHandleInput = ref('')
const cloudBusy = ref(false)
const cloudError = ref('')
const cloudNotice = ref('')

// 验证码面板有两种用途，面板上的按钮名与步骤文案跟着它变：
// - 'login'：登录。云端已经有这个用户名的配置，只证明身份，**不碰云端内容**；
// - 'upload'：上传。用本机设置覆盖云端，这是唯一会写云端的入口。
const cloudCodeMode = ref('login')
// 登录验证时回写的「云端原文」，以及它的更新时间。
// 回写会把服务端的 updatedAt 顶成此刻，可那不是「用户改了配置」，显示它只会误导，
// 所以绑定时记的是这份读到的旧时间。
const cloudRemoteProfile = ref(null)
const cloudRemoteUpdatedAt = ref('')

/** 待确认的解绑；与下面卸载确认同款自绘弹窗 */
const pendingUnbind = ref(false)
const unbindBtn = ref(null)

/** 地址里带来的 handle（`/<handle>`），等用户点头才套用；空串 = 没有这次询问 */
const cloudApplyHandle = ref('')
const cloudApplyBtn = ref(null)

/** 地址里带来的 handle，但云端根本没有这份配置：只弹一句提示。空串 = 没有 */
const cloudMissingBtn = ref(null)

const cloudTimeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

const cloudUpdatedHint = computed(() => {
  const ms = Date.parse(cloudAccount.value.updatedAt)
  // 服务端给的是 ISO 串；认不出来（旧数据 / 空串）就退回「还没存过」，不显示一串乱码
  return Number.isFinite(ms)
    ? t('settings.cloud.updatedAt', { time: cloudTimeFormat.format(ms) })
    : t('settings.cloud.neverUpdated')
})

/**
 * 验证步骤第一步里「Codeforces 个人资料」那半句是个链接（指向 Social 设置页）。
 * 整句留在一个词条里、用 `{link}` 占位再在这里劈开，而不是拆成 before/link/after 三个键：
 * 拆开就看不见语序了 —— 英文里这个短句落在句子中间，三段式很容易对不上位。
 * （`t()` 不带 params 时原样返回，`{link}` 不会被插值吃掉。）
 */
const cloudCodeStep1 = computed(() => {
  const [before, after = ''] = t('settings.cloud.codeStep1').split('{link}')
  return { before, after }
})

function clearCloudFeedback() {
  cloudError.value = ''
  cloudNotice.value = ''
}

/**
 * 服务端返回的中文 msg（验证码错了 / 太频繁）原样显示。
 * 没有 msg 就说明请求压根没走到服务端，用本地文案兜底 —— 这里要区分两种情形，
 * 否则用户只能看到一句「网络有问题」，既不知道是断网还是请求被谁拦下了。
 */
function cloudFailure(result) {
  if (result.msg) return result.msg
  if (result.transport === 'badBody') {
    return t('settings.cloud.errorBadBody', { status: result.status })
  }
  return t('settings.cloud.errorNetwork')
}

/** 取码。同一个函数服务两处入口：未绑定时传输入框的值，已绑定时传已绑定的用户名 */
async function requestCloudCode(handle) {
  if (cloudBusy.value) return
  const target = handle.trim()
  clearCloudFeedback()
  if (!target) {
    cloudError.value = t('settings.cloud.errorHandle')
    return
  }
  cloudBusy.value = true
  // 注意别名：导入的函数叫 requestCode，本函数叫 requestCloudCode，别混
  const result = await requestCode(target)
  cloudBusy.value = false
  if (!result.success) {
    cloudError.value = cloudFailure(result)
    return
  }
  cloudPendingHandle.value = target
  cloudCode.value = result.code
}

function cancelCloudCode() {
  cloudCode.value = ''
  cloudPendingHandle.value = ''
  clearCloudFeedback()
}

/**
 * 用户名输入框的回车。中文输入法里「回车」常常是「确认候选词」而不是「提交」，
 * 组字期间敲下去会把半截拼音直接拿去登录 —— 和全局快捷键同一条规矩（见 App.vue 的 onKeydown）：
 * 组字中一律不当成提交。keyCode 229 是部分输入法在组字时不报 isComposing 的补漏。
 */
function onCloudHandleEnter(event) {
  if (event.isComposing || event.keyCode === 229) return
  event.preventDefault()
  loginCloud()
}

/**
 * 登录。先读一眼云端，再决定要不要验证：
 *
 * - 云端已经有这个用户名的配置 → 必须证明你是主人，但**不能改动它**，
 *   所以走取码 → 填 Codeforces → verify-save 回写「云端原文」那条路（见 verifyAndLogin）。
 * - 云端还没有配置 → 没有任何会被覆盖的东西，也就不必验证，直接在本机认领这个用户名。
 *   真正写入要等用户点「上传本机设置」。
 *
 * 这条设计是刻意的：登录永远不写云端。换台设备第一次登录时，本机往往还是一套默认设置，
 * 顺手推上去就把云端那份好的冲掉了。
 */
async function loginCloud() {
  if (cloudBusy.value) return
  const target = cloudHandleInput.value.trim()
  clearCloudFeedback()
  if (!target) {
    cloudError.value = t('settings.cloud.errorHandle')
    return
  }

  cloudBusy.value = true
  const probe = await fetchCloudProfile(target)
  cloudBusy.value = false

  if (probe.success) {
    cloudRemoteProfile.value = probe.data
    cloudRemoteUpdatedAt.value = probe.updatedAt ?? ''
    cloudCodeMode.value = 'login'
    await requestCloudCode(target)
    return
  }
  if (!probe.notFound) {
    cloudError.value = cloudFailure(probe)
    return
  }

  cloudAccount.value = { handle: target, updatedAt: '' }
  cloudHandleInput.value = ''
  cloudNotice.value = t('settings.cloud.loginNoCloud')
}

/** 验证码面板上那颗按钮：按当前用途分发到登录 / 上传 */
function confirmCloudCode() {
  return cloudCodeMode.value === 'upload' ? verifyAndUpload() : verifyAndLogin()
}

/**
 * 登录的验证。服务端是去读这个 handle 在 Codeforces 个人资料里的 Last name 跟验证码比对，
 * 对得上才写 KV —— 没有「只验证不写」的接口，所以这里把**刚读到的云端原文**原样传回去：
 * 服务端由此确认「你是主人」，而云端那份内容一个字段都不会变。
 *
 * 验证通过后顺手把那份原文拉到本机（adoptCloudProfile）并刷新：登录的语义就是
 * 「这台设备改用云端这一套设置」。方向仍然是只下不传 —— 落地的只有 SOURCE 里刚读到的东西。
 */
async function verifyAndLogin() {
  if (cloudBusy.value) return
  const handle = cloudPendingHandle.value
  clearCloudFeedback()
  cloudBusy.value = true
  const result = await verifyAndSave(handle, cloudRemoteProfile.value ?? {})
  cloudBusy.value = false
  if (!result.success) {
    cloudError.value = cloudFailure(result)
    return
  }
  // 先把绑定关系与设备令牌落下（会写 localStorage；下面那步会刷新页面，晚了就写不进去了），
  // 再做会刷新页面的那一步
  const profile = cloudRemoteProfile.value
  cloudAccount.value = { handle, updatedAt: cloudRemoteUpdatedAt.value }
  cloudToken.value = result.token ?? ''
  cloudHandleInput.value = ''
  cloudCode.value = ''
  cloudPendingHandle.value = ''
  cloudRemoteProfile.value = null
  cloudRemoteUpdatedAt.value = ''
  // 刷新成功的话后面就不用走了；只有云端那份一个白名单键都没有时才会走到这里
  if (!(await adoptCloudProfile(profile))) {
    cloudNotice.value = t('settings.cloud.loggedIn')
  }
}

/**
 * 已绑定态点「上传本机设置」。这条才是真的会覆盖云端。
 *
 * 有设备令牌就直接写 —— 「一次验证换长期免取码」换来的就是这个；本机没有令牌
 * （从没验证成功过）才退回取码验证那条路。
 */
function startCloudUpload() {
  const handle = cloudAccount.value.handle
  if (cloudToken.value) {
    uploadWithToken(handle)
    return
  }
  cloudCodeMode.value = 'upload'
  requestCloudCode(handle)
}

/**
 * 用设备令牌写入：不取码，也不要求用户再去碰 Codeforces。
 *
 * 服务端回 401 表示这枚令牌不认了（过期 / 被服务端吊销 / 属于别的 handle）：
 * 清掉它、退回取码流程，并用一行提示说明「为什么突然又要验证码」——
 * 不讲清楚的话，用户只会觉得同一颗按钮忽然变麻烦了。
 */
async function uploadWithToken(handle) {
  if (cloudBusy.value) return
  clearCloudFeedback()
  cloudBusy.value = true
  const result = await saveWithToken(handle, cloudToken.value, collectProfile())
  cloudBusy.value = false

  if (result.success) {
    cloudAccount.value = { handle, updatedAt: result.updatedAt ?? '' }
    cloudNotice.value = t('settings.cloud.saved')
    return
  }
  if (result.status !== 401) {
    cloudError.value = cloudFailure(result)
    return
  }

  cloudToken.value = ''
  cloudCodeMode.value = 'upload'
  // requestCloudCode 一进来就会清反馈，所以提示只能压在它之后；只有真的把码取回来、
  // 验证码面板开出来了才提示，否则屏幕上已经有一句取码失败的报错了。
  await requestCloudCode(handle)
  if (cloudCode.value) cloudNotice.value = t('settings.cloud.tokenExpired')
}

/**
 * 验证并上传。服务端是去读这个 handle 在 Codeforces 个人资料里的 Last name 跟验证码比对，
 * 对得上才写 KV —— 所以「证明是我的」与「保存」本来就是同一个动作，没有单独的验证接口。
 * 验证码 10 分钟过期，过期后再保存会失败，那时重新取一次码即可（已绑定态下就是这个流程）。
 */
async function verifyAndUpload() {
  if (cloudBusy.value) return
  const handle = cloudPendingHandle.value
  clearCloudFeedback()
  cloudBusy.value = true
  const result = await verifyAndSave(handle, collectProfile())
  cloudBusy.value = false
  if (!result.success) {
    cloudError.value = cloudFailure(result)
    return
  }
  cloudAccount.value = { handle, updatedAt: result.updatedAt ?? '' }
  // 记下这枚令牌：之后点「上传本机设置」就直接写，不用再取码、不用再去改 Codeforces
  cloudToken.value = result.token ?? ''
  cloudHandleInput.value = ''
  cloudCode.value = ''
  cloudPendingHandle.value = ''
  cloudNotice.value = t('settings.cloud.saved')
}

/**
 * 下载到本机：把云端那份写进 localStorage，然后刷新页面。
 *
 * 必须刷新：App.vue 的偏好只在启动时读一次盘，内存里的 ref 不会跟着 localStorage 变。
 * 就地回灌要逐个改十几个偏好，还得顺带处理 i18n / 快捷键这些模块级单例，不划算。
 * 刷新前先 flush 一次，把编辑器里还没落盘的正文写回 VFS —— 否则下载这个动作会丢掉
 * 用户正在编辑的内容。
 */
async function downloadCloudProfile() {
  if (cloudBusy.value) return
  clearCloudFeedback()
  cloudBusy.value = true
  const result = await fetchCloudProfile(cloudAccount.value.handle)
  cloudBusy.value = false
  if (!result.success) {
    cloudError.value = result.notFound
      ? t('settings.cloud.noCloudConfig')
      : cloudFailure(result)
    return
  }
  if (!(await adoptCloudProfile(result.data))) {
    cloudError.value = t('settings.cloud.emptyProfile')
  }
}

/**
 * 把一份云端配置落到本机、然后刷新页面。返回是否真的应用了（写进去 0 条就是没有）。
 *
 * 刷新的理由见 downloadCloudProfile 上面那段；刷新前先 flush，把编辑器里还没落盘的
 * 正文写回 VFS —— 否则这一步会丢掉用户正在编辑的内容。
 *
 * 「登录成功」与「点下载」共用这里：两者的语义都是「这台设备改用云端那一套设置」。
 * 注意方向始终是**只下不传**：这个函数不碰云端一个字节。
 */
async function adoptCloudProfile(data) {
  if (!applyProfile(data)) return false
  cloudNotice.value = t('settings.cloud.downloaded')
  await flush()
  window.location.reload()
  return true
}

/**
 * 地址里带来的 handle（`/<handle>`，见 services/cloudEntry.js）：把询问直接摆到用户面前 ——
 * 切到「云端同步」那一栏并弹出确认。
 *
 * 这里**只登记状态，不打开设置页签**：打开页签由 App.vue 在做完会话恢复之后做。
 * 顺序反了的话，会话恢复把 workspace.activeId 设回上次那个文件，editorViews 那个
 * 「活跃文件一变就让开」的 watch 会把刚打开的页签立刻关掉（见 App.vue 的 onMounted）。
 */
watch(
  pendingCloudHandle,
  (handle) => {
    if (!handle) return
    cloudApplyHandle.value = handle
    activeSection.value = 'cloud'
  },
  { immediate: true },
)

// 弹窗一出现就把焦点送到「套用」上，Enter / Esc 都能纯键盘走完（与解绑弹窗同款）
watch(cloudApplyHandle, (handle) => {
  if (handle) nextTick(() => cloudApplyBtn.value?.focus())
})

// 「云端没有这份配置」的提示：同样一出现就把焦点送进去，Esc 也能关掉（与上面同款）
watch(cloudEntryMissingHandle, (handle) => {
  if (handle) nextTick(() => cloudMissingBtn.value?.focus())
})

// 关掉设置页签就等于「这次不套用」：这条链接带来的询问只该当面提一次，
// 用户下次自己打开设置页时不该再冒出来。
watch(
  () => props.active,
  (active) => {
    if (!active) cancelCloudApply()
  },
)

/**
 * 套用地址里带来的那份云端配置。
 *
 * 走的是「下载到本机」同一条路（fetchCloudProfile → adoptCloudProfile → 刷新），
 * 但**不写 cp.cloudAccount / cp.cloudToken**：链接是公开的，谁都能构造一条指向别人的，
 * 套用它不该把这台设备绑到那个用户名上 —— 那会凭空多出「上传本机设置」与「解绑」两个
 * 入口，而它们本来只该属于账号的主人。
 */
async function confirmCloudApply() {
  const handle = cloudApplyHandle.value
  if (cloudBusy.value || !handle) return
  clearCloudFeedback()
  cloudBusy.value = true
  const result = await fetchCloudProfile(handle)
  cloudBusy.value = false
  // 先把询问收掉（含「已读」标记），再决定是套用还是报错 —— 报错要落在
  // 已经打开的「云端同步」那一栏里，而不是继续顶着一个弹窗。
  // 标记必须落在 adoptCloudProfile 的那次 reload 之前，否则刷新后地址还在，会再问一遍。
  cloudApplyHandle.value = ''
  clearPendingCloudHandle()
  markCloudEntryHandled()

  if (!result.success) {
    cloudError.value = result.notFound
      ? t('settings.cloud.applyNoCloud', { handle })
      : cloudFailure(result)
    return
  }
  if (!(await adoptCloudProfile(result.data))) {
    cloudError.value = t('settings.cloud.emptyProfile')
  }
}

function cancelCloudApply() {
  if (!cloudApplyHandle.value) return
  cloudApplyHandle.value = ''
  clearPendingCloudHandle()
  // 拒绝了也算答过：这条链接带来的询问只该当面提一次，刷新不该再问（地址栏还留着 /<handle>）
  markCloudEntryHandled()
}

/**
 * 关掉「这个用户名还没有保存过配置」的提示。
 * 只收弹窗：地址在探测那一步就已经抹回根路径了（见 cloudEntry.js 的 confirmCloudEntry），
 * 所以关掉之后刷新不会再看到它。
 */
function dismissCloudMissing() {
  cloudEntryMissingHandle.value = ''
}

function requestUnbind() {
  if (cloudBusy.value) return
  pendingUnbind.value = true
}

function cancelUnbind() {
  pendingUnbind.value = false
}

/**
 * 解绑：只断开**本机**与这个用户名的关联，不碰云端。
 *
 * 刻意不发 unbind 请求。服务端那个接口要求先取码验证（没有码就回「验证码已过期或未获取，
 * 请重新取码」），可解绑在用户心里就是一次本机操作，弹窗里那句文案也一直是这么写的；
 * 硬要走「取码 → 改 Codeforces → 解绑」三步，只会让人以为按钮坏了。
 * 云端那份配置本来就在拿 handle 就能读的位置，留着它并不会多泄露什么 —— 想换账号，
 * 重新登录别的 handle 即可；想重新绑回来，同一个 handle 登录一次就行（要证明是本人）。
 */
function confirmUnbind() {
  pendingUnbind.value = false
  clearCloudFeedback()
  cloudAccount.value = { handle: '', updatedAt: '' }
  // 令牌是跟着 handle 走的：解绑就该一起丢掉，否则换登录别的 handle 时会带过去
  // （服务端也会因为 owner !== handle 而回 401，但那是兜底，不该靠它）
  cloudToken.value = ''
  cloudHandleInput.value = ''
}

// 弹窗一出现就把焦点送到「解绑」上，Enter / Esc 都能纯键盘走完
watch(pendingUnbind, (open) => {
  if (open) nextTick(() => unbindBtn.value?.focus())
})
</script>

<template>
  <!-- 设置是个普通页签，内容就铺在编辑区里（Monaco 被 v-show 让开）。
       原来是 Teleport 到 body 的右侧抽屉，改成视图后不再有遮罩、头部和「完成」按钮：
       关它靠页签上的 ×，改动本来就即时生效，不需要一个「确认」动作。 -->
  <div class="settings-view" role="region" :aria-label="t('settings.ariaLabel')">
    <div class="settings-view__inner">
      <!-- 目录：点哪一项，右边就只渲染那一组设置（原来是四段纵向平铺） -->
      <nav class="settings-nav" :aria-label="t('settings.navAriaLabel')">
        <button
          v-for="section in SECTIONS"
          :key="section.id"
          type="button"
          class="settings-nav__item"
          :class="{ 'settings-nav__item--active': section.id === activeSection }"
          :aria-current="section.id === activeSection ? 'true' : undefined"
          @click="activeSection = section.id"
        >
          <AppIcon :name="section.icon" :size="14" />
          <span class="settings-nav__label">{{ t(section.titleKey) }}</span>
        </button>
      </nav>

      <!-- 常用设置：一级分类里排在最前，打开设置默认落在这里。
           这几项在别处也有（主题 / 界面缩放 / 侧边栏位置在「外观」、字体大小在「编辑器」），
           它们读写的是同一份偏好，改哪一处另一处立刻跟着变，不存第二份数据。
           所以这里直接照搬各处的控件写法（内联），不另外造一套数据表。 -->
      <section v-if="activeSection === 'common'" class="setting-group">
        <p class="setting-group__title">{{ t('settings.section.common') }}</p>
        <p class="setting-group__note">{{ t('settings.common.note') }}</p>

        <label
          class="setting-row setting-row--select"
          :class="{ 'is-modified': isModified({ key: 'theme' }) }"
        >
          <span class="setting-row__main">
            <span class="setting-row__head">
              <span class="setting-row__label">{{ t('settings.appearance.theme.label') }}</span>
            </span>
            <span class="setting-row__hint">{{ t('settings.appearance.theme.hint') }}</span>
          </span>
          <span class="setting-row__control">
            <span class="select">
              <select :value="settings.theme" @change="set('theme', $event.target.value)">
                <option v-for="item in THEMES" :key="item.id" :value="item.id">
                  {{ t(item.labelKey) }}
                </option>
              </select>
              <AppIcon name="chevron" :size="12" class="select__chevron" />
            </span>
          </span>
        </label>

        <label class="setting-row setting-row--select">
          <span class="setting-row__main">
            <span class="setting-row__head">
              <span class="setting-row__label">{{ t('settings.appearance.uiScale.label') }}</span>
            </span>
            <span class="setting-row__hint">{{ t('settings.appearance.uiScale.hint') }}</span>
          </span>
          <span class="setting-row__control">
            <span class="select">
              <select :value="uiScale" @change="setUiScale">
                <option v-for="scale in UI_SCALE_OPTIONS" :key="scale" :value="scale">
                  {{ scaleLabel(scale) }}
                </option>
              </select>
              <AppIcon name="chevron" :size="12" class="select__chevron" />
            </span>
          </span>
        </label>

        <label
          class="setting-row setting-row--number"
          :class="{ 'is-modified': isModified({ key: 'fontSize' }) }"
        >
          <span class="setting-row__main">
            <span class="setting-row__head">
              <span class="setting-row__label">{{ t('settings.appearance.fontSize.label') }}</span>
            </span>
            <span class="setting-row__hint">{{ t('settings.appearance.fontSize.hint') }}</span>
          </span>
          <span class="setting-row__control">
            <input
              class="number-input"
              type="number"
              step="1"
              :min="rangeOf({ key: 'fontSize' })[0]"
              :max="rangeOf({ key: 'fontSize' })[1]"
              :value="settings.fontSize"
              @change="setNumber({ key: 'fontSize' }, $event)"
            />
          </span>
        </label>

        <label class="setting-row setting-row--select">
          <span class="setting-row__main">
            <span class="setting-row__head">
              <span class="setting-row__label">{{ t('settings.appearance.panelPosition.label') }}</span>
            </span>
            <span class="setting-row__hint">{{ t('settings.appearance.panelPosition.hint') }}</span>
          </span>
          <span class="setting-row__control">
            <span class="select">
              <select :value="panelPosition" @change="setPanelPosition">
                <option v-for="item in PANEL_POSITIONS" :key="item.id" :value="item.id">
                  {{ t(item.labelKey) }}
                </option>
              </select>
              <AppIcon name="chevron" :size="12" class="select__chevron" />
            </span>
          </span>
        </label>
      </section>

      <!-- 外观：主题（editorSettings 的键，与编辑器组同源）与界面偏好。
           下面三行各有自己的出口（App 那边的 cp.panelPosition / cp.uiScale，
           以及 i18n 模块自己管着的 cp.uiLocale）。字体大小已挪去编辑器组。 -->
      <section v-else-if="activeSection === 'appearance'" class="setting-group">
        <p class="setting-group__title">{{ t('settings.section.appearance') }}</p>

        <label
          v-for="row in APPEARANCE_ROWS"
          :key="row.key"
          class="setting-row"
          :class="[`setting-row--${row.control}`, { 'is-modified': isModified(row) }]"
        >
          <span class="setting-row__main">
            <span class="setting-row__head">
              <span class="setting-row__label">{{ t(row.labelKey) }}</span>
              <span v-if="showKey(row)" class="setting-row__key">{{ row.key }}</span>
            </span>
            <span v-if="row.hintKey" class="setting-row__hint">{{ t(row.hintKey) }}</span>
          </span>

          <span class="setting-row__control">
            <input
              v-if="row.control === 'number'"
              class="number-input"
              type="number"
              step="1"
              :min="rangeOf(row)[0]"
              :max="rangeOf(row)[1]"
              :value="settings[row.key]"
              @change="setNumber(row, $event)"
            />

            <span v-else class="select">
              <select
                :value="settings[row.key]"
                @change="set(row.key, coerce(row, $event.target.value))"
              >
                <option v-for="item in row.options" :key="item.id" :value="item.id">
                  {{ item.labelKey ? t(item.labelKey, item.labelParams) : item.label }}
                </option>
              </select>
              <AppIcon name="chevron" :size="12" class="select__chevron" />
            </span>
          </span>
        </label>

        <label class="setting-row setting-row--select">
          <span class="setting-row__main">
            <span class="setting-row__head">
              <span class="setting-row__label">{{ t('settings.appearance.uiScale.label') }}</span>
            </span>
            <span class="setting-row__hint">{{ t('settings.appearance.uiScale.hint') }}</span>
          </span>
          <span class="setting-row__control">
            <span class="select">
              <select :value="uiScale" @change="setUiScale">
                <option v-for="scale in UI_SCALE_OPTIONS" :key="scale" :value="scale">
                  {{ scaleLabel(scale) }}
                </option>
              </select>
              <AppIcon name="chevron" :size="12" class="select__chevron" />
            </span>
          </span>
        </label>

        <label class="setting-row setting-row--select">
          <span class="setting-row__main">
            <span class="setting-row__head">
              <span class="setting-row__label">{{ t('settings.appearance.locale.label') }}</span>
            </span>
            <span class="setting-row__hint">{{ t('settings.appearance.locale.hint') }}</span>
          </span>
          <span class="setting-row__control">
            <span class="select">
              <select :value="locale" @change="setUiLocale">
                <option v-for="item in LOCALE_OPTIONS" :key="item.id" :value="item.id">
                  {{ item.label }}
                </option>
              </select>
              <AppIcon name="chevron" :size="12" class="select__chevron" />
            </span>
          </span>
        </label>

        <label class="setting-row setting-row--select">
          <span class="setting-row__main">
            <span class="setting-row__head">
              <span class="setting-row__label">{{ t('settings.appearance.panelPosition.label') }}</span>
            </span>
            <span class="setting-row__hint">{{ t('settings.appearance.panelPosition.hint') }}</span>
          </span>
          <span class="setting-row__control">
            <span class="select">
              <select :value="panelPosition" @change="setPanelPosition">
                <option v-for="item in PANEL_POSITIONS" :key="item.id" :value="item.id">
                  {{ t(item.labelKey) }}
                </option>
              </select>
              <AppIcon name="chevron" :size="12" class="select__chevron" />
            </span>
          </span>
        </label>
      </section>

      <section v-else-if="activeSection === 'editor'" class="setting-group">
        <p class="setting-group__title">{{ t('settings.section.editor') }}</p>

        <template v-for="(group, index) in EDITOR_GROUPS" :key="group.titleKey">
          <p class="setting-subtitle" :class="{ 'setting-subtitle--first': index === 0 }">
            {{ t(group.titleKey) }}
          </p>

          <label
            v-for="row in group.rows"
            :key="row.key"
            class="setting-row"
            :class="[`setting-row--${row.control}`, { 'is-modified': isModified(row) }]"
          >
            <span class="setting-row__main">
              <span class="setting-row__head">
                <span class="setting-row__label">{{ t(row.labelKey) }}</span>
                <span v-if="showKey(row)" class="setting-row__key">{{ row.key }}</span>
              </span>
              <span v-if="row.hintKey" class="setting-row__hint">{{ t(row.hintKey) }}</span>
            </span>

            <span class="setting-row__control">
              <input
                v-if="row.control === 'number'"
                class="number-input"
                type="number"
                step="1"
                :min="rangeOf(row)[0]"
                :max="rangeOf(row)[1]"
                :value="settings[row.key]"
                @change="setNumber(row, $event)"
              />

              <span v-else-if="row.control === 'select'" class="select">
                <select
                  :value="settings[row.key]"
                  @change="set(row.key, coerce(row, $event.target.value))"
                >
                  <option v-for="item in row.options" :key="item.id" :value="item.id">
                    {{ item.labelKey ? t(item.labelKey, item.labelParams) : item.label }}
                  </option>
                </select>
                <AppIcon name="chevron" :size="12" class="select__chevron" />
              </span>

              <button
                v-else
                class="switch"
                :class="{ 'is-on': settings[row.key] }"
                role="switch"
                :aria-checked="settings[row.key]"
                :aria-label="t(row.labelKey)"
                @click="set(row.key, !settings[row.key])"
              >
                <span class="switch__thumb"></span>
              </button>
            </span>
          </label>
        </template>
      </section>

      <!-- 模板：新建文件时按扩展名归一到语言、填入对应模板。
           总开关与三条模板都不落 cp.editorSettings，走 services/fileTemplates.js 自己的模块单例
           （与「界面语言」同一体例：模块自己读写 localStorage，不经 props / emits 中转）。 -->
      <section v-else-if="activeSection === 'templates'" class="setting-group">
        <p class="setting-group__title">{{ t('settings.section.templates') }}</p>
        <p class="setting-group__note">{{ t('settings.templates.note') }}</p>

        <div class="setting-row setting-row--template">
          <span class="setting-row__head">
            <span class="setting-row__label">{{ t('settings.templates.enable.label') }}</span>
            <button
              type="button"
              class="switch setting-row__switch"
              :class="{ 'is-on': templatesEnabled }"
              role="switch"
              :aria-checked="templatesEnabled"
              :aria-label="t('settings.templates.enable.label')"
              @click="setTemplatesEnabled(!templatesEnabled)"
            >
              <span class="switch__thumb"></span>
            </button>
          </span>
          <span class="setting-row__hint">{{ t('settings.templates.enable.hint') }}</span>
        </div>

        <div
          v-for="id in TEMPLATE_LANGUAGE_IDS"
          :key="id"
          class="setting-row setting-row--template"
          :class="{ 'is-modified': isTemplateModified(id) }"
        >
          <span class="setting-row__head">
            <span class="setting-row__label">{{ t(TEMPLATE_LABEL_KEYS[id]) }}</span>
            <button
              type="button"
              class="download-button setting-row__restore"
              :disabled="!isTemplateModified(id)"
              :title="t('settings.templates.restore.title')"
              @click="resetTemplate(id)"
            >
              <AppIcon name="reset" :size="13" />
              <span>{{ t('settings.templates.restore.label') }}</span>
            </button>
          </span>
          <span class="setting-row__hint">
            {{ t('settings.templates.hint', { ext: TEMPLATE_EXTENSIONS[id] }) }}
          </span>
          <textarea
            class="setting-textarea"
            :value="templateForLanguage(id)"
            :maxlength="TEMPLATE_MAX_LENGTH"
            :spellcheck="false"
            :aria-label="t(TEMPLATE_LABEL_KEYS[id])"
            rows="10"
            @input="setTemplate(id, $event.target.value)"
            @keydown="onTemplateKeydown($event, id)"
          ></textarea>
        </div>
      </section>

      <section v-else-if="activeSection === 'shortcuts'" class="setting-group">
        <p class="setting-group__title">{{ t('settings.section.shortcuts') }}</p>
        <p class="setting-group__note">
          {{ t('settings.shortcut.note') }}
        </p>

        <div
          v-for="action in SHORTCUT_ACTIONS"
          :key="action.id"
          class="setting-row setting-row--action"
        >
          <span class="setting-row__main">
            <span class="setting-row__head">
              <span class="setting-row__label">{{ t(action.labelKey) }}</span>
            </span>
            <span v-if="action.hintKey" class="setting-row__hint">{{ t(action.hintKey) }}</span>
          </span>
          <span class="setting-row__control">
            <HotkeyRecorder :action-id="action.id" />
          </span>
        </div>

        <div class="setting-row setting-row--action">
          <span class="setting-row__main">
            <span class="setting-row__head">
              <span class="setting-row__label">{{ t('settings.shortcut.restore.label') }}</span>
            </span>
            <span class="setting-row__hint">{{ t('settings.shortcut.restore.hint') }}</span>
          </span>
          <span class="setting-row__control">
            <button
              class="download-button"
              :title="t('settings.shortcut.restore.title')"
              @click="resetAll"
            >
              <AppIcon name="reset" :size="13" />
              <span>{{ t('settings.shortcut.restore.label') }}</span>
            </button>
          </span>
        </div>
      </section>

      <section v-else-if="activeSection === 'judge'" class="setting-group">
        <p class="setting-group__title">{{ t('settings.section.judge') }}</p>

        <label class="setting-row setting-row--select">
          <span class="setting-row__main">
            <span class="setting-row__head">
              <span class="setting-row__label">{{ t('settings.judge.timeLimit.label') }}</span>
            </span>
            <span class="setting-row__hint">{{ t('settings.judge.timeLimit.hint') }}</span>
          </span>
          <span class="setting-row__control">
            <span class="select">
              <select :value="timeLimit" @change="setTimeLimit">
                <option v-for="ms in TIME_LIMIT_OPTIONS" :key="ms" :value="ms">
                  {{ limitLabel(ms) }}
                </option>
              </select>
              <AppIcon name="chevron" :size="12" class="select__chevron" />
            </span>
          </span>
        </label>

        <p class="setting-subtitle">{{ t('settings.judge.engines') }}</p>
        <EngineSettingsPanel
          :judge="judge"
          :connection="connection"
          @select-engine="emit('select-engine', $event)"
          @update-base="emit('update-base', $event)"
          @test-connection="emit('test-connection')"
        />
      </section>

      <!-- 应用：安装到设备、存储占用，外加两项「供应用取用」的外部资源 ——
           本地运行环境（工具链与题解渲染器的下载 / 卸载）与浏览器插件（安装、投递目标、快捷键）。
           三者共用这一栏，块与块之间用 setting-subtitle 分区。 -->
      <section v-else-if="activeSection === 'app'" class="setting-group setting-group--app">
        <p class="setting-subtitle">{{ t('settings.app.basics') }}</p>

        <div class="app-card">
          <div class="setting-row setting-row--action">
            <span class="setting-row__main">
              <span class="setting-row__head">
                <span class="setting-row__label">{{ t('settings.app.install.label') }}</span>
              </span>
              <!-- 状态框顶替原来那行说明：两者说的是同一件事，绿点已经把状态说清楚了 -->
              <span class="app-status" :class="canInstall ? 'is-ok' : 'is-idle'">
                <span class="app-status__dot"></span>
                <span>
                  {{
                    t(
                      canInstall
                        ? 'settings.app.install.statusAvailable'
                        : 'settings.app.install.statusUnavailable',
                    )
                  }}
                </span>
              </span>
            </span>
            <span class="setting-row__control">
              <button
                class="download-button is-primary"
                :disabled="!canInstall"
                :title="t('settings.app.install.title')"
                @click="install"
              >
                <AppIcon name="install" :size="15" />
                <span>{{ t(canInstall ? 'settings.app.installAction' : 'settings.app.installedAction') }}</span>
              </button>
            </span>
          </div>

          <!-- 存储：默认收起，只报一个总数；展开才列明细 —— 那一列数字要遍历每个缓存桶
               的每一条响应、还要开库遍历记录，收起状态下没必要每次都付这份代价
               （见 readStorageBreakdown）。数是整个源的（含工具链与外壳缓存），
               不只是用户代码；查不到占用时整行收起。 -->
          <button
            v-if="storageUsage.usage !== null"
            type="button"
            class="setting-row setting-row--action storage-row"
            :class="{ 'is-open': storageOpen }"
            :aria-expanded="storageOpen"
            :title="
              t(storageOpen ? 'settings.app.storage.collapse' : 'settings.app.storage.expand')
            "
            @click="toggleStorage"
          >
            <span class="setting-row__main">
              <span class="setting-row__label">{{ t('settings.app.storage.label') }}</span>
            </span>
            <span class="setting-row__control storage-row__summary">
              <span class="storage-row__value">
                {{ t('settings.app.storage.used', { used: formatBytes(storageUsage.usage) }) }}
              </span>
              <AppIcon
                name="chevron"
                :size="14"
                class="storage-row__chevron"
                :class="{ 'is-open': storageOpen }"
              />
            </span>
          </button>

          <div v-if="storageOpen" class="storage-detail">
            <p v-if="!storageBreakdown" class="storage-detail__hint">
              {{ t('settings.app.storage.measuring') }}
            </p>
            <template v-else>
              <!-- 条状图：100% 就是 estimate() 报的总量，各段按分类占比切开 -->
              <div class="storage-bar">
                <span
                  v-for="(entry, index) in storageBreakdown.entries"
                  :key="entry.id"
                  class="storage-bar__seg"
                  :class="`is-${entry.id}`"
                  :style="{
                    width: `${(entry.bytes / storageBreakdown.total) * 100}%`,
                    animationDelay: `${index * 60}ms`,
                  }"
                ></span>
              </div>
              <ul class="storage-legend">
                <li
                  v-for="entry in storageBreakdown.entries"
                  :key="entry.id"
                  class="storage-legend__item"
                >
                  <span class="storage-legend__dot" :class="`is-${entry.id}`"></span>
                  <!-- 窄面板里名称会被省略号截断，title 留一条看全名的路 -->
                  <span
                    class="storage-legend__name"
                    :title="t(STORAGE_CATEGORY_LABEL[entry.id])"
                  >
                    {{ t(STORAGE_CATEGORY_LABEL[entry.id]) }}
                  </span>
                  <span class="storage-legend__size">{{ formatBytes(entry.bytes) }}</span>
                  <span class="storage-legend__pct">{{ formatPercent(entry.bytes) }}</span>
                </li>
              </ul>
            </template>
          </div>
        </div>

        <p class="setting-subtitle">{{ t('settings.section.runtime') }}</p>
        <p class="setting-group__note">{{ t('runtime.groupNote') }}</p>

        <div class="runtime-list">
          <div v-for="entry in runtimeEntries" :key="entry.id" class="runtime-row">
            <span class="runtime-row__icon" :class="`is-${entry.icon}`">
              <AppIcon :name="entry.icon" :size="17" />
            </span>
            <span class="runtime-row__text">
              <span class="runtime-row__title">{{ t(entry.titleKey) }}</span>
              <span class="runtime-row__hint">
                <span class="app-dot" :class="runtimeDotClass(entry)"></span>
                <span v-if="hintFor(entry)">{{ hintFor(entry) }}</span>
              </span>
            </span>
            <div class="runtime-row__actions">
              <!-- 就绪后这颗按钮整颗收起：状态交给行首那颗绿点，再挂一颗禁用的「已就绪」等于把同一件事说两遍
                   （要卸的话右边那颗还在），也免得下载/重试的入口和状态徽标混作一谈 -->
              <button
                v-if="entry.state.value !== 'ready'"
                class="download-button is-primary"
                :class="{ 'is-failed': entry.state.value === 'failed' }"
                :disabled="downloadingAny"
                :title="t(entry.downloadTitleKey)"
                @click="downloadRuntime(entry)"
              >
                <AppIcon
                  :name="buttonIcon(entry)"
                  :size="13"
                  :class="{ 'is-spinning': entry.state.value === 'downloading' }"
                />
                <span>{{ buttonLabel(entry) }}</span>
              </button>
              <!-- 卸载只在已就绪时出现：没装就没有可卸的（下载中也不能卸，会和在途的写入打架） -->
              <button
                v-if="entry.state.value === 'ready'"
                type="button"
                class="download-button is-uninstall"
                :disabled="downloadingAny"
                :title="t('runtime.uninstallActionTitle', { title: t(entry.titleKey) })"
                @click="requestUninstall(entry)"
              >
                <AppIcon name="trash" :size="13" />
                <span>{{ t('runtime.uninstall') }}</span>
              </button>
            </div>
          </div>
        </div>

        <p class="setting-subtitle">{{ t('cf.module.group') }}</p>
        <p class="setting-group__note">{{ t('cf.module.groupNote') }}</p>

        <div class="runtime-list">
          <!-- 抽题组件：默认安装的组件（下载 = 预取 Codeforces 题库，启动时自动进行）。
               与上面三个共用 .runtime-list / .runtime-row 的外观，但状态机在 services/cfRuntime.js 里 ——
               下载完侧栏才亮出那颗按钮，所以「已下载」这件事必须与侧栏同源。 -->
          <div class="runtime-row">
            <span class="runtime-row__icon is-codeforces"><AppIcon name="codeforces" :size="17" /></span>
            <span class="runtime-row__text">
              <span class="runtime-row__title">{{ t('cf.module.title') }}</span>
              <span class="runtime-row__hint">
                <span class="app-dot" :class="cfDotClass"></span>
                <span v-if="cfHint">{{ cfHint }}</span>
              </span>
            </span>
            <div class="runtime-row__actions">
              <!-- 与运行环境行同一套：未装 / 下载中是「下载（重试）」一颗，就绪后换成「卸载」一颗 -->
              <button
                v-if="!cfReady"
                class="download-button is-primary"
                :class="{ 'is-failed': !!cfFailureReason }"
                :disabled="cfBusy"
                :title="t('cf.module.downloadTitle')"
                @click="downloadCf"
              >
                <AppIcon
                  :name="cfButtonIcon"
                  :size="13"
                  :class="{ 'is-spinning': cfBusy }"
                />
                <span>{{ cfButtonLabel }}</span>
              </button>
              <!-- 卸载只在已就绪时出现。它会顺手关掉「默认安装」（见 confirmUninstall），
                   否则下次启动 ensureCfPickerInstalled() 又把它装回来 -->
              <button
                v-if="cfReady"
                type="button"
                class="download-button is-uninstall"
                :disabled="cfBusy"
                :title="t('cf.module.uninstallActionTitle', { title: t('cf.module.title') })"
                @click="requestCfUninstall"
              >
                <AppIcon name="trash" :size="13" />
                <span>{{ t('runtime.uninstall') }}</span>
              </button>
            </div>
          </div>
        </div>

        <p class="setting-subtitle">{{ t('settings.section.extension') }}</p>
        <p class="setting-group__note">{{ t('settings.extension.groupNote') }}</p>

        <div class="app-card">
          <div class="setting-row setting-row--action">
            <span class="setting-row__main">
              <span class="setting-row__head">
                <span class="setting-row__label">{{ t('settings.extension.status') }}</span>
              </span>
              <!-- 状态框挪到原来那行说明的位置（说明删了，它和框说的是同一件事） -->
              <span class="app-status" :class="extensionDotClass">
                <span class="app-status__dot"></span>
                <span>{{ extensionStatusLabel }}</span>
              </span>
            </span>
            <span class="setting-row__control">
              <button
                class="download-button"
                :disabled="extensionChecking"
                :title="t('settings.extension.recheckTitle')"
                @click="refreshExtension"
              >
                <AppIcon name="reset" :size="13" :class="{ 'is-spinning': extensionChecking }" />
                <span>{{ t(extensionChecking ? 'settings.extension.checking' : 'settings.extension.recheck') }}</span>
              </button>
            </span>
          </div>

          <div class="setting-row setting-row--action">
            <span class="setting-row__main">
              <span class="setting-row__head">
                <span class="setting-row__label">{{ t('settings.extension.download.label') }}</span>
                <span class="setting-row__key">
                  {{ t('settings.extension.downloadVersion', { version: EXTENSION_VERSION }) }}
                </span>
              </span>
              <span class="setting-row__hint">{{ t('settings.extension.downloadHint') }}</span>
            </span>
            <span class="setting-row__control">
              <a class="download-button" :href="EXTENSION_DOWNLOAD_URL" :download="EXTENSION_FILE">
                <AppIcon name="download" :size="15" />
                <span>{{ t('app.download') }}</span>
              </a>
            </span>
          </div>
        </div>

        <template v-if="extensionInfo">
          <!-- 旧版扩展不上报 config，写也写不动，整组藏起来比亮出一排假开关好 -->
          <template v-if="extensionInfo.config">
            <p class="setting-subtitle">{{ t('settings.extension.destinations') }}</p>
            <p class="setting-group__note">{{ t('settings.extension.destinationsNote') }}</p>

            <div class="app-card">
              <div
                v-for="destination in EXTENSION_DESTINATIONS"
                :key="destination.key"
                class="setting-row setting-row--switch"
              >
                <span class="setting-row__main">
                  <span class="setting-row__head">
                    <span class="setting-row__label">{{ t(destination.labelKey) }}</span>
                  </span>
                  <span class="setting-row__hint">{{ t(destination.hintKey) }}</span>
                </span>
                <span class="setting-row__control">
                  <button
                    class="switch"
                    :class="{ 'is-on': destinationOn(destination.key) }"
                    role="switch"
                    :aria-checked="destinationOn(destination.key)"
                    :aria-label="t(destination.labelKey)"
                    :disabled="destinationSaving === destination.key"
                    @click="toggleDestination(destination.key)"
                  >
                    <span class="switch__thumb"></span>
                  </button>
                </span>
              </div>
            </div>

            <p v-if="destinationFailed" class="setting-group__note setting-group__note--warn">
              {{ t('settings.extension.configSaveFailed') }}
            </p>
          </template>

          <p class="setting-subtitle">{{ t('settings.extension.commandShortcuts') }}</p>
          <p class="setting-group__note">
            {{ t('settings.extension.shortcutsManagedPrefix') }}
            <code class="setting-code">chrome://extensions/shortcuts</code>
            {{ t('settings.extension.shortcutsManagedSuffix') }}
          </p>

          <div class="app-card">
            <div
              v-for="command in extensionShortcuts"
              :key="command.name"
              class="setting-row setting-row--action"
            >
              <span class="setting-row__main">
                <span class="setting-row__head">
                  <span class="setting-row__label">{{ command.label }}</span>
                </span>
              </span>
              <span class="setting-row__control">
                <kbd class="shortcut-key" :class="{ 'is-empty': !command.keys }">
                  {{ command.keys || t('settings.extension.shortcutUnset') }}
                </kbd>
              </span>
            </div>

            <div class="setting-row setting-row--action">
              <span class="setting-row__main">
                <span class="setting-row__head">
                  <span class="setting-row__label">{{ t('settings.extension.shortcutsPage') }}</span>
                </span>
                <span class="setting-row__hint">
                  {{
                    t(
                      shortcutsCopied
                        ? 'settings.extension.shortcutsCopiedHint'
                        : 'settings.extension.shortcutsHint',
                    )
                  }}
                </span>
              </span>
              <span class="setting-row__control">
                <button
                  class="download-button"
                  :class="{ 'is-copied': shortcutsCopied }"
                  :title="t('settings.extension.shortcutsTitle')"
                  @click="copyShortcutsUrl"
                >
                  <AppIcon :name="shortcutsCopied ? 'check' : 'copy'" :size="13" />
                  <span>{{ t(shortcutsCopied ? 'settings.extension.copied' : 'settings.extension.copyUrl') }}</span>
                </button>
              </span>
            </div>
          </div>
        </template>
      </section>

      <!-- 云端同步：把偏好类设置存到 Cloudflare Worker 背后的 KV 里，身份用 Codeforces handle 证明。
           三态互斥：验证码面板开着（取过码、还没验证通过）→ 未绑定 → 已绑定。 -->
      <section v-else-if="activeSection === 'cloud'" class="setting-group">
        <p class="setting-group__title">{{ t('settings.section.cloud') }}</p>
        <p class="setting-group__note">{{ t('settings.cloud.groupNote') }}</p>

        <!-- 取过码：这一步要用户去 Codeforces 改 Last name，所以把验证码和操作步骤一起摆出来 -->
        <template v-if="cloudCode">
          <!-- 登录那条路要额外说一句：这一步只是证明身份，云端内容不会被改。 -->
          <p v-if="cloudCodeMode === 'login'" class="setting-group__note">
            {{ t('settings.cloud.codeIntro') }}
          </p>
          <!-- 上传这条同理要说清「为什么刚登录过还要再验一次」：服务端把验证与保存做成
               同一个接口，登录时那枚码在写回云端原文时就已经用掉了，没有会话可续。 -->
          <p v-else class="setting-group__note">
            {{ t('settings.cloud.codeIntroUpload') }}
          </p>

          <div class="cloud-code">
            <span class="cloud-code__label">{{ t('settings.cloud.codeLabel') }}</span>
            <code class="cloud-code__value">{{ cloudCode }}</code>
            <span class="cloud-code__hint">{{ t('settings.cloud.codeHint') }}</span>
          </div>

          <!-- 取新码会让上一枚作废。不讲清楚，用户很容易两边看着「一样」却怎么都验不过 -->
          <p class="setting-group__note setting-group__note--warn">
            {{ t('settings.cloud.codeWarn') }}
          </p>

          <p class="setting-subtitle">{{ t('settings.cloud.codeSteps') }}</p>
          <ol class="cloud-steps">
            <li>
              {{ cloudCodeStep1.before
              }}<a
                class="cloud-steps__link"
                href="https://codeforces.com/settings/social"
                target="_blank"
                rel="noopener noreferrer"
                >{{ t('settings.cloud.codeStep1Link') }}</a
              >{{ cloudCodeStep1.after }}
            </li>
            <li>
              {{
                cloudCodeMode === 'upload'
                  ? t('settings.cloud.codeStep2Upload')
                  : t('settings.cloud.codeStep2')
              }}
            </li>
          </ol>

          <div class="cloud-footer">
            <button
              type="button"
              class="download-button"
              :disabled="cloudBusy"
              @click="cancelCloudCode"
            >
              {{ t('settings.cloud.cancel') }}
            </button>
            <button
              type="button"
              class="download-button cloud-primary"
              :disabled="cloudBusy"
              @click="confirmCloudCode"
            >
              <AppIcon name="check" :size="13" />
              <span>
                {{
                  cloudCodeMode === 'upload'
                    ? t('settings.cloud.verifyUpload')
                    : t('settings.cloud.verifyLogin')
                }}
              </span>
            </button>
          </div>
        </template>

        <!-- 未绑定：填用户名 → 登录。登录只认领这个用户名，不会往云端写任何东西：
             云端已有那份配置时走取码验证（验证完内容原样不动），云端为空时直接认领。 -->
        <template v-else-if="!cloudAccount.handle">
          <div class="setting-row setting-row--select cloud-account">
            <span class="setting-row__main">
              <span class="setting-row__head">
                <span class="setting-row__label">{{ t('settings.cloud.handle.label') }}</span>
              </span>
            </span>
            <span class="setting-row__control cloud-field">
              <input
                v-model.trim="cloudHandleInput"
                class="text-input"
                type="text"
                spellcheck="false"
                autocomplete="off"
                autocapitalize="off"
                :aria-label="t('settings.cloud.handle.label')"
                :placeholder="t('settings.cloud.handlePlaceholder')"
                @keydown.enter="onCloudHandleEnter"
              />
              <button
                type="button"
                class="download-button cloud-primary"
                :disabled="cloudBusy"
                :title="t('settings.cloud.loginTitle')"
                @click="loginCloud"
              >
                <AppIcon name="cloud" :size="14" />
                <span>{{ t('settings.cloud.login') }}</span>
              </button>
            </span>
          </div>
        </template>

        <!-- 已绑定：下载 / 重新上传 / 解绑。用户名与云端更新时间都在这一行里 -->
        <template v-else>
          <div class="setting-row setting-row--action cloud-account">
            <span class="setting-row__main">
              <span class="setting-row__head">
                <span class="setting-row__label">{{ cloudAccount.handle }}</span>
                <span class="setting-row__key">{{ t('settings.cloud.boundTag') }}</span>
              </span>
              <span class="setting-row__hint">{{ cloudUpdatedHint }}</span>
            </span>
            <span class="setting-row__control cloud-field">
              <button
                type="button"
                class="download-button"
                :disabled="cloudBusy"
                :title="t('settings.cloud.downloadTitle')"
                @click="downloadCloudProfile"
              >
                <AppIcon name="download" :size="13" />
                <span>{{ t('settings.cloud.download') }}</span>
              </button>
              <!-- 「上传」本机有设备令牌就直接写；令牌失效或被服务端吊销才会退回取码验证（见 startCloudUpload） -->
              <button
                type="button"
                class="download-button"
                :disabled="cloudBusy"
                :title="t('settings.cloud.uploadTitle')"
                @click="startCloudUpload"
              >
                <AppIcon name="cloud" :size="13" />
                <span>{{ t('settings.cloud.upload') }}</span>
              </button>
              <button
                type="button"
                class="download-button is-uninstall"
                :disabled="cloudBusy"
                :title="t('settings.cloud.unbindTitle')"
                @click="requestUnbind"
              >
                <AppIcon name="trash" :size="13" />
                <span>{{ t('settings.cloud.unbind') }}</span>
              </button>
            </span>
          </div>
        </template>

        <p v-if="cloudError" class="setting-group__note setting-group__note--warn">
          {{ cloudError }}
        </p>
        <p v-else-if="cloudNotice" class="setting-group__note setting-group__note--ok">
          {{ cloudNotice }}
        </p>

        <!-- 公开性声明：必须放在「上传」之前能看到的位置（它就在三态 UI 正下方）。
             云端的读接口没有任何鉴权，所以「上传」这一个动作本身就等于同意公开 ——
             这句话不写清楚，用户会觉得上传只是「备份到自己账号下」。 -->
        <p class="setting-group__note">{{ t('settings.cloud.publicNotice') }}</p>

        <!-- 预下载：它是**偏好**而不是「这台设备下好了没有」，所以归在云同步这边，
             不跟「本地运行环境」那张事实清单混同 —— 那边的每一行都在回答「现在本机有没有」。
             排在登录之后：这一栏第一眼要看到的是「怎么把配置同步过来 / 传上去」。 -->
        <p class="setting-subtitle">{{ t('runtime.autoPreload.label') }}</p>
        <div v-for="item in RUNTIMES" :key="item.id" class="setting-row setting-row--switch">
          <span class="setting-row__main">
            <span class="setting-row__head">
              <span class="setting-row__label">{{ t(item.titleKey) }}</span>
            </span>
          </span>
          <span class="setting-row__control">
            <button
              type="button"
              class="switch"
              :class="{ 'is-on': isAutoPreload(item.id) }"
              role="switch"
              :aria-checked="isAutoPreload(item.id)"
              :aria-label="t('runtime.autoPreload.switchTitle', { title: t(item.titleKey) })"
              :title="t('runtime.autoPreload.switchTitle', { title: t(item.titleKey) })"
              @click="toggleAutoPreload(item.id)"
            >
              <span class="switch__thumb"></span>
            </button>
          </span>
        </div>
        <p class="setting-group__note">{{ t('runtime.autoPreload.note') }}</p>

        <!-- 「默认安装」开关：与上面那组预下载同为**偏好**，所以也归在云同步这边、
             跟着账号走；抽题组件本机的安装状态在「应用」一栏的组件行里。 -->
        <p class="setting-subtitle">{{ t('cf.module.autoInstall.label') }}</p>
        <div class="setting-row setting-row--switch">
          <span class="setting-row__main">
            <span class="setting-row__head">
              <span class="setting-row__label">{{ t('cf.module.title') }}</span>
            </span>
          </span>
          <span class="setting-row__control">
            <button
              type="button"
              class="switch"
              :class="{ 'is-on': cfAutoInstall }"
              role="switch"
              :aria-checked="cfAutoInstall"
              :aria-label="t('cf.module.autoInstall.switchTitle')"
              :title="t('cf.module.autoInstall.switchTitle')"
              @click="toggleCfAutoInstall"
            >
              <span class="switch__thumb"></span>
            </button>
          </span>
        </div>
        <p class="setting-group__note">{{ t('cf.module.autoInstall.note') }}</p>
      </section>

      <section v-else-if="activeSection === 'help'" class="setting-group">
        <p class="setting-group__title">{{ t('settings.section.help') }}</p>
        <HelpPanel />
      </section>
    </div>

    <!-- 卸载确认：自绘弹窗，与文件树删除确认同款（不用 window.confirm，见 FileExplorer.requestDelete）。
         点遮罩 / Esc = 取消，只有点「卸载」才会真的清缓存。 -->
    <Teleport to="body">
      <div v-if="pendingUninstall" class="confirm" @pointerdown.self="cancelUninstall">
        <div
          class="confirm__card"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="uninstall-title"
          aria-describedby="uninstall-desc"
          @keydown.esc.stop.prevent="cancelUninstall"
        >
          <p id="uninstall-title" class="confirm__title">
            {{ t(pendingUninstall.uninstallTitleKey, { title: t(pendingUninstall.titleKey) }) }}
          </p>
          <p id="uninstall-desc" class="confirm__desc">
            {{ t(pendingUninstall.uninstallHintKey) }}
          </p>
          <div class="confirm__actions">
            <button type="button" class="confirm__btn" @click="cancelUninstall">
              {{ t('app.cancel') }}
            </button>
            <button
              ref="uninstallBtn"
              type="button"
              class="confirm__btn confirm__btn--danger"
              @click="confirmUninstall"
            >
              {{ t('runtime.uninstall') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 解绑确认：与上面卸载确认同款。解绑只是断开这台设备与账号的关联，
         云端已存的那份配置不由这里决定，所以文案只说本机这一侧。 -->
    <Teleport to="body">
      <div v-if="pendingUnbind" class="confirm" @pointerdown.self="cancelUnbind">
        <div
          class="confirm__card"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="unbind-title"
          aria-describedby="unbind-desc"
          @keydown.esc.stop.prevent="cancelUnbind"
        >
          <p id="unbind-title" class="confirm__title">
            {{ t('settings.cloud.unbindConfirmTitle') }}
          </p>
          <p id="unbind-desc" class="confirm__desc">
            {{ t('settings.cloud.unbindConfirmDesc', { handle: cloudAccount.handle }) }}
          </p>
          <div class="confirm__actions">
            <button type="button" class="confirm__btn" @click="cancelUnbind">
              {{ t('app.cancel') }}
            </button>
            <button
              ref="unbindBtn"
              type="button"
              class="confirm__btn confirm__btn--danger"
              @click="confirmUnbind"
            >
              {{ t('settings.cloud.unbind') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 地址里带来的 /<handle>：问一次要不要套用这份云端配置。
         刻意**不**自动套用也不自动登录 —— 链接谁都能构造，替换本机设置该由用户点头才发生
         （见 services/cloudEntry.js）。与上面两个确认同款自绘弹窗。 -->
    <Teleport to="body">
      <div v-if="cloudApplyHandle" class="confirm" @pointerdown.self="cancelCloudApply">
        <div
          class="confirm__card"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="cloud-apply-title"
          aria-describedby="cloud-apply-desc"
          @keydown.esc.stop.prevent="cancelCloudApply"
        >
          <p id="cloud-apply-title" class="confirm__title">
            {{ t('settings.cloud.applyConfirmTitle') }}
          </p>
          <p id="cloud-apply-desc" class="confirm__desc">
            {{ t('settings.cloud.applyConfirmDesc', { handle: cloudApplyHandle }) }}
          </p>
          <div class="confirm__actions">
            <button type="button" class="confirm__btn" @click="cancelCloudApply">
              {{ t('settings.cloud.cancel') }}
            </button>
            <button
              ref="cloudApplyBtn"
              type="button"
              class="confirm__btn confirm__btn--danger"
              :disabled="cloudBusy"
              @click="confirmCloudApply"
            >
              {{ t('settings.cloud.applyConfirm') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 地址里带来的 /<handle>，但云端根本没有这份配置：套不了，只把「为什么地址回去了」讲清楚。
         地址已经在探测那一步抹回根路径（见 cloudEntry.js 的 confirmCloudEntry），这里不再动它。 -->
    <Teleport to="body">
      <div v-if="cloudEntryMissingHandle" class="confirm" @pointerdown.self="dismissCloudMissing">
        <div
          class="confirm__card"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="cloud-missing-title"
          aria-describedby="cloud-missing-desc"
          @keydown.esc.stop.prevent="dismissCloudMissing"
        >
          <p id="cloud-missing-title" class="confirm__title">
            {{ t('settings.cloud.applyMissingTitle') }}
          </p>
          <p id="cloud-missing-desc" class="confirm__desc">
            {{ t('settings.cloud.applyMissingDesc', { handle: cloudEntryMissingHandle }) }}
          </p>
          <div class="confirm__actions">
            <button
              ref="cloudMissingBtn"
              type="button"
              class="confirm__btn"
              @click="dismissCloudMissing"
            >
              {{ t('settings.cloud.applyMissingOk') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* 设置视图：铺满编辑区的那一块（Monaco 被 v-show 让开），本身是滚动容器。
   内容是「目录 + 具体设置」两栏。原来那套抽屉定位（fixed + 遮罩 + 滑入过渡）
   连带 View Transition 的组名一起撤掉了：现在是编辑区里的一层，跟着面板走。 */
.settings-view {
  position: absolute;
  inset: 0;
  overflow-y: auto;
  padding: 4px 0 18px;
  /* 「目录 / 内容」默认单列，编辑区够宽时再升级成两栏。宽度判断交给容器查询：
     设置视图活在编辑区里，它的宽度只是编辑区宽度的一部分，拿视口 media query 当代理是错的。
     写成「默认单列 + min-width 升级」而不是「默认两栏 + max-width 降级」：不支持容器查询的
     浏览器（部分手机自带浏览器）会永远吃默认那套单列，窄屏上就不会被挤成两列。 */
  container-type: inline-size;
  container-name: settings;
}

/* 目录 + 内容：默认单列（目录在上、内容在下）。
   够宽时由文件末尾的 @container settings (min-width: 35rem) 升级成「左栏目录 + 右栏内容」。 */
.settings-view__inner {
  display: flex;
  flex-direction: column;
  gap: 0;
  max-width: 880px;
}

.settings-nav {
  display: flex;
  flex-direction: row;
  gap: 4px;
  flex: 0 0 auto;
  max-width: 100%;
  overflow-x: auto;
  padding: 10px 18px 2px;
}

.settings-nav__item {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
  height: 28px;
  padding: 0 10px;
  border-radius: 6px;
  color: var(--text-dim);
  font-size: 12.5px;
  text-align: left;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.settings-nav__item:hover {
  background: var(--bg-control-hover);
  color: var(--text);
}

.settings-nav__item--active {
  background: var(--bg-control);
  color: var(--text);
}

.settings-nav__label {
  white-space: nowrap;
}

/* 同一时刻只渲染一组设置（v-if / v-else-if），所以两栏时它自己就是右栏那一格。 */
.setting-group {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/* 编辑区够宽时升级成「左栏目录 + 右栏内容」两栏：目录 sticky 跟着滚动，
   右栏吃掉剩余宽度但不超过 max-width（免得控件飘到很远，设置行是「标签靠左、控件靠右」的两端对齐）。
   阈值写成 rem：全局缩放后目录与内容都会变大，需要更早翻回竖排。
   用 min-width 做升级而非 max-width 降级——不支持容器查询的浏览器会一直用上面那套单列，见 .settings-view 的注释。 */
@container settings (min-width: 35rem) {
  .settings-view__inner {
    flex-direction: row;
    align-items: flex-start;
    gap: 10px;
  }

  .settings-nav {
    position: sticky;
    top: 0;
    flex-direction: column;
    gap: 2px;
    width: 168px;
    max-width: none;
    overflow: visible;
    padding: 12px 12px 12px 18px;
  }

  .settings-nav__item {
    flex: 0 1 auto;
    height: 32px;
  }

  .setting-group {
    flex: 1 1 auto;
    max-width: 640px;
  }
}

.setting-group__title {
  margin: 0;
  padding: 12px 18px 6px;
  font-size: 11.5px;
  letter-spacing: 0.2px;
  color: var(--text-faint);
}

/* 组内的小标题：把「运行时限」与「评测引擎」在同一个「评测」分组里分开 */
.setting-subtitle {
  margin: 6px 0 0;
  padding: 16px 18px 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--text-dim);
  border-top: 1px solid var(--border-soft);
}

/* 编辑器分组里的第一小节紧跟在分组标题下面，不用再画一条分隔线 */
.setting-subtitle--first {
  margin-top: 0;
  padding-top: 6px;
  border-top: none;
}

.setting-group__note {
  margin: 0 18px 8px;
  font-size: 11.5px;
  line-height: 1.55;
  color: var(--text-faint);
}

/* 写扩展配置失败的提示：排版与说明一致，只换警示色 */
.setting-group__note--warn {
  color: var(--warn);
}

/* 设置行：不画边框，靠内边距与悬浮底色划分边界（几十行都描边会像 Excel 表格）。
   文字走三级灰度：标题 --text / 描述 --text-dim / 键名 --text-faint 等宽。
   行的版式由控件类型决定（见下面三个修饰类）。 */
.setting-row {
  position: relative;
  display: flex;
  gap: 16px;
  padding: 10px 18px 12px;
  border-radius: 4px;
  transition: background-color 0.15s ease;
}

.setting-row:hover {
  background: var(--bg-hover);
}

/* 「已改动」指示线：只有当前值偏离默认值时才出现，小圆角贴在行左侧 */
.setting-row.is-modified::before {
  content: '';
  position: absolute;
  left: 4px;
  top: 12px;
  bottom: 14px;
  width: 3px;
  border-radius: 2px;
  background: var(--accent);
}

.setting-row__main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1 1 auto;
  min-width: 0;
}

.setting-row__head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

/* 第一级：主标题 —— 这是什么 */
.setting-row__label {
  font-size: 13px;
  color: var(--text);
}

/* 第三级：底层键名 —— 极低频的参考信息，等宽 + 最弱灰度 */
.setting-row__key {
  font-family: var(--mono-font);
  font-size: 11px;
  color: var(--text-faint);
}

/* 第二级：描述 —— 有什么用 */
.setting-row__hint {
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-dim);
}

.setting-row__control {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
}

/* 输入框 / 下拉：文本在上、控件独立成行落在左下，避免控件把标签挤窄。
   不写 align-items，让文本块默认 stretch 撑满，长描述才能在窄面板里换行。 */
.setting-row--select,
.setting-row--number {
  flex-direction: column;
  gap: 8px;
}

/* 开关：标签在左、开关孤立地靠右上 */
.setting-row--switch {
  align-items: flex-start;
  justify-content: space-between;
}

.setting-row--switch .setting-row__control {
  margin-top: 1px;
}

/* 动作行（按钮 / 录制框 / 链接）：标签在左、控件在右并垂直居中 */
.setting-row--action {
  align-items: center;
  justify-content: space-between;
  min-height: 46px;
}

.select {
  position: relative;
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
}

.select select {
  appearance: none;
  min-width: 128px;
  padding: 6px 28px 6px 10px;
  border-radius: 5px;
  background: var(--bg-control);
  border: 1px solid var(--border);
  font-size: 12.5px;
  color: var(--text);
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.select select:hover {
  background: var(--bg-control-hover);
}

.select__chevron {
  position: absolute;
  right: 9px;
  pointer-events: none;
  color: var(--text-dim);
}

.number-input {
  width: 76px;
  padding: 6px 8px;
  border-radius: 5px;
  background: var(--bg-control);
  border: 1px solid var(--border);
  font-size: 12.5px;
  color: var(--text);
}

.switch {
  flex: 0 0 auto;
  position: relative;
  width: 36px;
  height: 20px;
  border-radius: 999px;
  background: var(--bg-control);
  border: 1px solid var(--border);
  transition: background-color 0.18s ease, border-color 0.18s ease;
}

.switch__thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--text-dim);
  transition: transform 0.18s ease, background-color 0.18s ease;
}

.switch.is-on {
  background: var(--run-green);
  border-color: transparent;
}

.switch.is-on .switch__thumb {
  transform: translateX(16px);
  background: var(--text-on-accent);
}

/* ---------- 本地运行环境 ---------- */
.runtime-list {
  display: flex;
  flex-direction: column;
  margin: 0 18px;
  border: 1px solid var(--border-soft);
  border-radius: 7px;
  overflow: hidden;
}

.runtime-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 56px;
  padding: 8px 12px;
  background: var(--bg-panel);
}

.runtime-row + .runtime-row {
  border-top: 1px solid var(--border-soft);
}

.runtime-row__icon {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  color: var(--text-dim);
  background: var(--bg-control);
}

/* 语言标志用各自的官方色，其它图标仍跟随主题文字色 */
.runtime-row__icon.is-cpp {
  color: var(--icon-cpp);
}

.runtime-row__icon.is-python {
  color: var(--icon-python);
}

.runtime-row__icon.is-markdown {
  color: var(--icon-markdown);
}

/* 抽题组件那一行：它是品牌标志（不是语言），页头与页签里仍走 currentColor，
   所以这个类只加在设置页这一行上 */
.runtime-row__icon.is-codeforces {
  color: var(--icon-codeforces);
}

.runtime-row__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1 1 auto;
  min-width: 0;
}

.runtime-row__title {
  font-size: 13px;
}

.runtime-row__hint {
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-faint);
}

/* 行尾的操作区：未装/下载中/失败时是「下载（重试）」一颗，就绪后换成「卸载」一颗，
   窄面板下文字先让位、按钮不折行 */
.runtime-row__actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
}

.download-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  flex: 0 0 auto;
  height: 28px;
  padding: 0 11px;
  border-radius: 5px;
  border: 1px solid var(--border);
  background: var(--bg-control);
  color: var(--text);
  font-size: 12px;
  white-space: nowrap;
  transition: background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease;
}

.download-button:hover:not(:disabled) {
  background: var(--bg-control-hover);
}

.download-button:disabled {
  cursor: default;
  color: var(--text-faint);
}

/* -------------------------------------------------------- 模板
   一行 = 语言名 + 「恢复默认」+ 提示 + 一个多行文本框。整行竖排（.setting-row 默认是横排），
   故覆写 flex-direction；「恢复默认」靠 margin-left: auto 推到行右端。 */
.setting-row--template {
  flex-direction: column;
  gap: 8px;
}

/* head 默认 align-items: baseline，和 28px 高的按钮对不齐，这里改成居中对齐 */
.setting-row--template .setting-row__head {
  align-items: center;
}

.setting-row__restore {
  margin-left: auto;
}

/* 总开关那颗：与「恢复默认」同一摆法（推到行尾）。别照抄 .setting-row__control，
   那套是「文本块 + 控件」两栏，而模板行是 flex-direction: column 的单栏。 */
.setting-row__switch {
  margin-left: auto;
}

/* 模板正文的多行输入。配色与边框抄 TestCaseCard 的 .ta（同一套输入控件语言），
   等宽字体是因为这里装的是代码。base.css 有全局 `textarea { resize: none }`，
   想给用户留一条「拉高」的路就得在这里显式写回 vertical。 */
.setting-textarea {
  display: block;
  width: 100%;
  height: 200px;
  padding: 8px 9px;
  border-radius: 5px;
  border: 1px solid var(--border-soft);
  background: var(--bg-input);
  color: var(--text);
  font-family: var(--mono-font);
  font-size: 12.5px;
  line-height: 1.55;
  /* 软换行：设置视图自己就是滚动容器，别再套一层横向滚动 */
  white-space: pre-wrap;
  overflow: auto;
  resize: vertical;
  tab-size: 4;
}

.setting-textarea:focus {
  outline: none;
  border-color: var(--focus);
}

.download-button.is-failed {
  border-color: transparent;
  color: var(--fail);
  background: transparent;
}

/* 卸载：中性描边，悬停才转成危险色（就绪那一行现在只剩它一颗，不必再和谁抢注意力） */
.download-button.is-uninstall {
  color: var(--text-dim);
  background: transparent;
}

.download-button.is-uninstall:hover:not(:disabled) {
  color: var(--danger-text);
  border-color: var(--danger-text);
  background: var(--danger-bg);
}

.is-spinning {
  animation: settings-spin 0.9s linear infinite;
}

/* 下载按钮同时用在 <button>（复制地址）和 <a>（下载安装包）上，链接要去掉下划线 */
a.download-button {
  text-decoration: none;
}

/* 插件快捷键的键位徽标：与 HotkeyRecorder 的录制框同观感（描边、同高、同圆角），
   区别只在只读展示，所以不带悬浮态。未分配时用最弱灰度，与录制框的 is-empty 一致。
   字体用 --ui-font 而不是 --mono-font：等宽字体没有 ⌘ ⇧ ⌥ 这几个字形，浏览器会逐个
   回退到别的字体，符号和字母的大小/粗细就对不齐了（徽标里看着参差不齐） */
.shortcut-key {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 11px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--bg-input);
  color: var(--text);
  font-family: var(--ui-font);
  font-size: 12px;
  white-space: nowrap;
}

.shortcut-key.is-empty {
  color: var(--text-faint);
}

.setting-code {
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--bg-control);
  font-family: inherit;
  font-size: 11px;
}

/* ---------- 云端同步 ---------- */
/* 用户名输入框：与 .number-input 同观感，只是宽度按「he-jie」这种短 handle 给，
   并允许在窄面板里收缩（min-width: 0），免得把旁边的按钮顶出去 */
.text-input {
  min-width: 0;
  width: 168px;
  padding: 6px 10px;
  border-radius: 5px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  font-size: 12.5px;
  color: var(--text);
}

.text-input::placeholder {
  color: var(--text-faint);
}

.text-input:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: -1px;
}

/* 一行里并排放两个以上控件（输入框 + 按钮、三颗按钮）：可折行，窄面板下不让标签被挤没 */
.cloud-field {
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
  /* .setting-row__control 是 flex: 0 0 auto，不加这条就永远不会触发上面的折行 */
  max-width: 100%;
}

/* 登录 / 绑定那一行是这一栏的主操作，但默认的 setting-row 与下面的「预下载」各项长得一模一样，
   排在第一个也照样被读成一串平级选项。所以给它一个卡片：浅色底 + 边框 + 左侧 accent 竖条，
   拉开与平铺行的层次。深浅两套主题都只用既有变量，不新增颜色。 */
.cloud-account {
  margin: 4px 12px 2px;
  padding: 12px 14px;
  /* 用 --bg-card 而不是 --bg-raised：浅色主题下 --bg-raised 与面板底色同为纯白，
     卡片会整块消失。描边用 --border（比 --border-soft 明显），两套主题都框得住 */
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-card);
}

/* 左侧强调条：用伪元素而不是 border-left，免得把上面那条 border 挤得左右不均 */
.cloud-account::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  border-radius: 6px 0 0 6px;
  background: var(--accent);
}

/* 卡片自己就是被强调的那一块，再叠 hover 底色只会显得脏 */
.cloud-account:hover {
  background: var(--bg-card);
}

/* 卡片里的输入框吃满剩余宽度：168px 的固定宽度在宽面板下会在卡片中间留一大片空白，
   反而把「这台设备认哪个用户名」衬得很轻。窄到放不下时靠 min-width 把「登录」挤到下一行 */
.cloud-account .text-input {
  flex: 1 1 auto;
  width: auto;
  min-width: 120px;
}

/* 主按钮：实心 accent，与旁边描边的次要按钮（下载 / 解绑）一眼分开 */
.cloud-primary {
  border-color: transparent;
  background: var(--accent);
  color: var(--text-on-accent);
}

.cloud-primary:hover:not(:disabled) {
  border-color: transparent;
  background: var(--accent-hover);
}

.cloud-primary:disabled {
  background: var(--accent-deep);
  color: var(--text-on-accent);
  opacity: 0.6;
}

/* 验证码：唯一一处需要用户原样抄走的内容，所以给卡片底、等宽字、放大字号，
   并允许整段选中（点一下就把 CF-XXXXXX 全选上，省得手动拖） */
.cloud-code {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin: 4px 18px 0;
  padding: 10px 12px;
  border: 1px solid var(--border-soft);
  border-radius: 7px;
  background: var(--bg-panel);
}

.cloud-code__label {
  font-size: 11.5px;
  color: var(--text-faint);
}

.cloud-code__value {
  font-family: var(--mono-font);
  font-size: 20px;
  letter-spacing: 0.08em;
  color: var(--text);
  user-select: all;
}

.cloud-code__hint {
  font-size: 11px;
  color: var(--text-faint);
}

/* 操作步骤：验证码那一步要用户离开本页去改 Cloudflare 资料，步骤得写清楚 */
.cloud-steps {
  margin: 0 18px;
  padding-left: 18px;
  font-size: 11.5px;
  line-height: 1.65;
  color: var(--text-dim);
}

/* 步骤第一步里指向 Codeforces Social 设置页的那半句。跟正文同字号，只换颜色 + 悬停下划线 */
.cloud-steps__link {
  color: var(--accent-strong);
  text-decoration: none;
}

.cloud-steps__link:hover {
  text-decoration: underline;
}

/* 验证码面板下面那一排按钮（不属于任何设置行，所以自己给左右内边距） */
.cloud-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin: 12px 18px 0;
}

/* 保存成功：与警告同一行位置，只换颜色 */
.setting-group__note--ok {
  color: var(--ok);
}

@keyframes settings-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ---------------------------------------------------------------- 应用（卡片化）
   参考稿的结构：每块是「小标题 + 一张卡片」，卡片内每行一条分隔线，状态用圆点 + 短标签，
   下载类是实心主按钮、卸载/重检测/复制是描边次按钮。作用域只落在 .setting-group--app ——
   .runtime-list / .download-button / .switch 这几个类评测栏与云端栏也在用，不能全局改。
   色值一律走主题变量，所以深浅两套主题都成立（浅色下卡片浮白底，深色下靠描边分层）。
   这一栏不画顶部的分组大标题（导航里已经写了「应用」），直接从小标题起步。 */

/* 小标题升级成卡片的抬头：不再画顶部细线，分隔交给卡片的间距 */
.setting-group--app .setting-subtitle {
  margin: 2px 0 0;
  padding: 18px 18px 8px;
  border-top: none;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0;
  color: var(--text);
}

/* 一张卡片：圆角 + 描边，浅色主题下再叠一层淡影；行与行由最淡的分隔线划界 */
.app-card,
.setting-group--app .runtime-list {
  margin: 0 18px 4px;
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  background: var(--bg-panel);
  box-shadow: var(--card-shadow);
  overflow: hidden;
}

/* 卡片里的行：圆角交给卡片裁，悬浮只是「摸到了」的反馈（比选中底色淡一档），
   最后一行不画分隔线（它下面就是卡片的下边框） */
.app-card > .setting-row {
  padding: 12px 14px;
  border-radius: 0;
  border-bottom: 1px solid var(--border-soft);
}

.app-card > .setting-row:last-child {
  border-bottom: none;
}

.app-card > .setting-row:hover {
  background: var(--bg-hover-soft);
}

/* 状态短标签：圆点 + 一句话。比旁边那颗按钮弱一档，只说明状态、不承担点击 */
.app-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  padding: 2px 8px;
  border: 1px solid var(--border-soft);
  border-radius: 6px;
  background: var(--bg-input);
  font-size: 11.5px;
  color: var(--text-dim);
  white-space: nowrap;
}

/* 状态框就放在标签底下（原来那行说明的位置）：列向 flex 默认会把它拉满整行宽，
   得自己收成内容宽；上面再留一点缝，别贴着标题 */
.setting-group--app .setting-row__main > .app-status {
  align-self: flex-start;
  margin-top: 4px;
}

/* 行内状态点：卡片列表里每行一颗，说明这项现在处于什么状态 */
.app-status__dot,
.app-dot {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--text-faint);
}

/* 标签里的圆点跟着容器走（is-* 挂在 .app-status 上），行内圆点自己带修饰类。
   灰（未装/不支持）就是上面的兜底色，不单独写 */
.app-status.is-ok .app-status__dot,
.app-dot.is-ok {
  background: var(--ok);
}

.app-status.is-fail .app-status__dot,
.app-dot.is-fail {
  background: var(--fail);
}

.app-status.is-busy .app-status__dot,
.app-dot.is-busy {
  background: var(--warn);
}

/* 运行环境行：图标盒子放大成方块（参考稿的 40×40，按本站 13px 基准折到 34） */
.setting-group--app .runtime-row {
  min-height: 60px;
  padding: 10px 12px;
}

.setting-group--app .runtime-row__icon {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  border: 1px solid var(--border-soft);
}

/* 状态点并到说明文字前面：说明可能很长会换行，所以点不能参与收缩 */
.setting-group--app .runtime-row__hint {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* ---------------------------------------------------------------- 存储明细
   这一行整行是按钮：点哪儿都能展开 / 收起。button 的默认外观得抹掉，
   否则内凹边框 + 居中文字会把它从「设置行」变成一颗大按钮（下边框留给
   .app-card 那条分隔线，它选择器更具体，不会被这里的 border: 0 覆盖掉） */
.storage-row {
  width: 100%;
  border: 0;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.storage-row__summary {
  gap: 8px;
  min-width: 0;
}

.storage-row__value {
  font-size: 13px;
  color: var(--text);
  white-space: nowrap;
}

.storage-row__chevron {
  flex: 0 0 auto;
  color: var(--text-dim);
  transition: transform 0.18s ease;
}

.storage-row__chevron.is-open {
  transform: rotate(180deg);
}

/* 展开时明细紧跟在下一行，这一行的下边框就成了夹在「行」与「明细」之间的杂线：
   收起状态下它是卡片最后一行（.app-card > .setting-row:last-child 本就不画），
   展开后失去 last-child 身份，那条线会无端冒出来，所以要显式收掉 */
.app-card > .storage-row.is-open {
  border-bottom: none;
}

/* 展开出来的那一块：条 + 图例，紧跟在那行下面 */
.storage-detail {
  padding: 0 14px 12px;
}

.storage-bar {
  display: flex;
  width: 100%;
  height: 8px;
  border-radius: 999px;
  background: var(--bg-control);
  overflow: hidden;
}

/* 分段靠 scaleX 长大：宽度是按百分比给的，但「从 0 长出来」没法动画到 width: auto。
   逐段的延迟由模板给，视觉上是从左往右铺开 —— 元素本身按最终宽度占位，
   所以变换不会把后面的段挤来挤去 */
.storage-bar__seg {
  height: 100%;
  transform-origin: left;
  animation: storage-seg-grow 0.4s cubic-bezier(0.4, 0, 0.2, 1) both;
}

@keyframes storage-seg-grow {
  from {
    transform: scaleX(0);
  }
  to {
    transform: scaleX(1);
  }
}

/* 全局那条 prefers-reduced-motion 只压时长，不碰延迟；不补这一句的话，
   弱动画偏好下各段仍会一段一段地冒出来 */
@media (prefers-reduced-motion: reduce) {
  .storage-bar__seg {
    animation-delay: 0s !important;
  }
}

/* 分类色：条上的段与图例上的点共用，深浅两套主题各一份（见 base.css） */
.storage-bar__seg.is-cpp,
.storage-legend__dot.is-cpp {
  background: var(--storage-cpp);
}

.storage-bar__seg.is-python,
.storage-legend__dot.is-python {
  background: var(--storage-python);
}

.storage-bar__seg.is-markdown,
.storage-legend__dot.is-markdown {
  background: var(--storage-markdown);
}

.storage-bar__seg.is-cf,
.storage-legend__dot.is-cf {
  background: var(--storage-cf);
}

.storage-bar__seg.is-code,
.storage-legend__dot.is-code {
  background: var(--storage-code);
}

.storage-bar__seg.is-other,
.storage-legend__dot.is-other {
  background: var(--storage-other);
}

/* 图例：宽面板两列、窄面板一列，不用写媒体查询 */
.storage-legend {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(158px, 1fr));
  gap: 5px 18px;
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
}

.storage-legend__item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 12px;
}

.storage-legend__dot {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

/* 名称让位给右边的两个数字：窄面板里宁可省略号，也不把体积挤断行 */
.storage-legend__name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-dim);
}

.storage-legend__size {
  flex: 0 0 auto;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.storage-legend__pct {
  flex: 0 0 auto;
  width: 42px;
  text-align: right;
  color: var(--text-faint);
  font-variant-numeric: tabular-nums;
}

.storage-detail__hint {
  margin: 10px 0 0;
  font-size: 11px;
  line-height: 1.55;
  color: var(--text-faint);
}

/* 主按钮：参考稿里下载这类「往前走」的动作是实心深色；这里用主题主色。
   写在 .setting-group--app 下，避免动到评测栏、云端栏的 .download-button */
.setting-group--app .download-button.is-primary {
  border-color: transparent;
  background: var(--accent);
  color: var(--text-on-accent);
}

.setting-group--app .download-button.is-primary:hover:not(:disabled) {
  background: var(--accent-hover);
}

.setting-group--app .download-button.is-primary:disabled {
  background: var(--bg-control);
  color: var(--text-faint);
}

/* 失败态要盖过上面的实心态（同样是三四个类，靠写在后面取胜）：这时不是「往前走」
   而是「重来一次」，只留一个警示色 */
.setting-group--app .download-button.is-primary.is-failed {
  background: transparent;
  border-color: transparent;
  color: var(--fail);
}

/* 复制成功：按钮转绿 + 对勾，和参考稿一致（两秒后 shortcutsCopied 自己复位） */
.setting-group--app .download-button.is-copied {
  border-color: var(--ok);
  background: transparent;
  color: var(--ok);
}

/* 开关：参考稿的尺寸（40×22 轨道 + 16 圆点），开启色沿用本站的绿 */
.setting-group--app .switch {
  width: 40px;
  height: 22px;
}

.setting-group--app .switch__thumb {
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
}

.setting-group--app .switch.is-on .switch__thumb {
  transform: translateX(18px);
}

/* ---------------------------------------------------------------- 卸载确认
   与 FileExplorer 的删除确认同款（那份是自绘弹窗的样板）：Teleport 到 body，
   所以这里的定位与色值只依赖主题变量，跟设置视图自己的容器查询互不相干。 */
.confirm {
  position: fixed;
  inset: 0;
  /* 高于右键菜单（120），低于顶栏下拉之类的系统级浮层 */
  z-index: 130;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.32);
}

.confirm__card {
  width: min(340px, 100%);
  padding: 14px;
  border: 1px solid var(--border-soft);
  border-radius: 10px;
  background: var(--bg-raised);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.34);
}

.confirm__title {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 650;
  color: var(--text);
}

.confirm__desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-dim);
  overflow-wrap: anywhere;
}

.confirm__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}

.confirm__btn {
  padding: 5px 14px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-panel);
  color: var(--text);
  font: 500 12.5px/1.5 var(--font-sans, system-ui);
  cursor: pointer;
}

.confirm__btn:hover {
  background: var(--bg-hover);
}

.confirm__btn--danger {
  border-color: transparent;
  background: var(--danger-bg);
  color: var(--danger-text);
}

.confirm__btn--danger:hover {
  background: var(--danger-bg-hover);
}

.confirm__btn:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
}
</style>