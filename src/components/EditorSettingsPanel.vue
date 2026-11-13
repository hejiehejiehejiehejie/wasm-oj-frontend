<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import EngineSettingsPanel from './EngineSettingsPanel.vue'
import HelpPanel from './HelpPanel.vue'
import HotkeyRecorder from './HotkeyRecorder.vue'
import LoadingSpinner from './LoadingSpinner.vue'
import { usePersistentRef } from '../composables/usePersistentRef.js'
import { UI_SCALE_OPTIONS } from '../composables/useUiScale.js'
import { LOCALES, locale, setLocale, t } from '../i18n/index.js'
import { useInstallPrompt } from '../composables/useInstallPrompt.js'
import { useCompanionBridge } from '../composables/useCompanionBridge.js'
import { BROWSER, BROWSER_PLATFORM, IS_DESKTOP } from '../services/platform.js'
// 安装包的版本 / 文件名 / 两个商店地址，以及「这台机器该走哪条路」—— 那份数据的唯一出处是
// `services/extensionPackage.js`（齿轮菜单里那两颗一次性动作也读它，所以不能再在本组件里存一份）
import {
  EDGE_EXTENSION_URL,
  EXTENSION_DOWNLOAD_URL,
  EXTENSION_FILE,
  EXTENSION_ROUTES,
  EXTENSION_VERSION,
  FIREFOX_EXTENSION_URL,
  isExtensionOutdated,
} from '../services/extensionPackage.js'
// 安装引导（现在只剩「应用」那一栏有这颗按钮）的通知内容，以及**按浏览器分岔的唯一出处**：
// 下面那几行说明的变体与 key 表都从这里 import —— 通知与面板说的是同一批句子，不再各写一份分岔
import {
  APPS_URL,
  EXTENSION_HINT_KEYS,
  NO_API_KEYS,
  extensionUpdateHintKey,
  extensionVariant,
  fireSectionGuide,
  installUnavailable,
  noApiVariant,
} from '../services/installGuides.js'
import { settingsSectionEntry } from '../services/editorViews.js'
import { watchBackLayer } from '../services/backStack.js'
import { invoke } from '@tauri-apps/api/core'
import {
  CAN_USE_LOCAL_FOLDER,
  getWorkspaceMode,
  getWorkspaceRoot,
  MODE_FOLDER,
  MODE_VIRTUAL,
  switchWorkspace,
} from '../services/vfs/workspaceMode.js'
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
// 悬浮倒计时卡也是「组件」组里的一行（2026-10-21）：它没有资产要下，装 / 卸只是
// 把入口收起来，判据与侧栏「组件 › 工具」读的是同一个 `countdown.installed`
import {
  COUNTDOWN_AUTO_INSTALL_KEY,
  countdown,
  installCountdown,
  uninstallCountdown,
} from '../services/countdown.js'
import { AUTO_PRELOAD_KEY } from '../services/runtimePreload.js'
import { MEMORY_LIMIT_OPTIONS, TIME_LIMIT_OPTIONS } from '../services/runner.js'
// 输出比对方式的选项表（id + i18n key）与判定逻辑同一份，见 services/checkers.js
import { CHECKERS } from '../services/checkers.js'
import {
  clearPendingCloudHandle,
  cloudEntryMissingHandle,
  markCloudEntryHandled,
  pendingCloudHandle,
} from '../services/cloudEntry.js'
import {
  adoptCloud,
  CF_SOCIAL_URL,
  cancelCloudCode,
  clearCloudFeedback,
  cloudAccount,
  cloudFailure,
  code as cloudCode,
  codeMode as cloudCodeMode,
  codeCountdown as cloudCodeCountdown,
  busy as cloudBusy,
  canFillCode,
  cloudCfHint,
  codeCopied,
  confirmCloudCode,
  copyCloudCode,
  downloadCloud,
  error as cloudError,
  fillCloudCode,
  fillCodeChained,
  filling as cloudFilling,
  handleInput as cloudHandleInput,
  loginCloud,
  notice as cloudNotice,
  refreshCloudCode,
  splitLinkText,
  syncAccountHandleCase,
  unbindCloud,
  uploadCloud,
} from '../services/cloudSession.js'
import { fetchCloudProfile } from '../services/cloudProfile.js'
import {
  isNarrowLayout,
  NARROW_COLLAPSE_SIDES,
  PANEL_POSITIONS,
  narrowCollapseSide,
  setNarrowCollapseSide,
} from '../services/shellSettings.js'
import {
  CURSOR_BLINKINGS,
  CODE_IMAGE_ACTIONS,
  CODE_IMAGE_QUALITIES,
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
  // 全局内存上限（字节），与 App.vue 的 cp.memoryLimitBytes 同源
  memoryLimit: { type: Number, required: true },
  // 全局输出比对方式（services/checkers.js 的 id），与 App.vue 的 cp.checker 同源
  checker: { type: String, required: true },
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
  'update:memory-limit',
  'update:checker',
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
  {
    // 悬停放在「视图」之后：它不改变编辑器长相，只决定停在符号上时弹什么。
    // 第一行是总开关；第二行是可选的语义方案 —— 代价写在 hint 里，打开即触发工具链下载。
    titleKey: 'settings.editor.groupHover',
    rows: [
      {
        key: 'hover',
        labelKey: 'settings.editor.hover.label',
        hintKey: 'settings.editor.hover.hint',
        control: 'switch',
      },
      {
        key: 'semanticHover',
        labelKey: 'settings.editor.semanticHover.label',
        hintKey: 'settings.editor.semanticHover.hint',
        control: 'switch',
      },
    ],
  },
  {
    // 「性能」这一组只有一行，单独成组是为了让老机器用户找得到 —— 它不改变编辑器长什么样，
    // 只管**后台语法检查**多久跑一次（见 services/monaco/syntaxDiagnostics.js）。
    titleKey: 'settings.editor.groupPerformance',
    rows: [
      {
        key: 'lowPower',
        labelKey: 'settings.editor.lowPower.label',
        hintKey: 'settings.editor.lowPower.hint',
        control: 'switch',
      },
    ],
  },
]

/**
 * 「代码图片」那三条：右键「生成图片」导出 PNG 的观感（质量 / 窗口栏圆点 / 行号）。
 *
 * 2026-10-12 从「编辑器」分类搬到「外观」：它们管的不是编辑行为，而是**导出去那张图长什么样**，
 * 与主题、缩放同属「看起来如何」一类。键与取值校验仍在 editorSettings（见 editorOptions.js），
 * 行渲染也与编辑器组同源（所以下面这个循环要有 switch 那一支）。
 * 首行自带 `groupTitleKey`：循环据此在它前面插一道小标题，两组共用一个循环。
 */
const CODE_IMAGE_ROWS = [
  {
    // 配色不在这组里：图片一律用编辑器当前主题的色（见 codeImage.js 的 currentThemeColors）
    groupTitleKey: 'settings.editor.groupImage',
    key: 'codeImageQuality',
    labelKey: 'settings.editor.codeImageQuality.label',
    hintKey: 'settings.editor.codeImageQuality.hint',
    control: 'select',
    options: CODE_IMAGE_QUALITIES,
  },
  {
    key: 'codeImageDots',
    labelKey: 'settings.editor.codeImageDots.label',
    hintKey: 'settings.editor.codeImageDots.hint',
    control: 'switch',
  },
  {
    key: 'codeImageLineNumbers',
    labelKey: 'settings.editor.codeImageLineNumbers.label',
    hintKey: 'settings.editor.codeImageLineNumbers.hint',
    control: 'switch',
  },
  // 出口两项：先「要不要问」，再「不问的时候按哪个来」。顺序不能倒 ——
  // 默认动作只在询问关掉时才起作用（editorSettings.codeImageAsk / codeImageAction）
  {
    key: 'codeImageAsk',
    labelKey: 'settings.editor.codeImageAsk.label',
    hintKey: 'settings.editor.codeImageAsk.hint',
    control: 'switch',
  },
  {
    key: 'codeImageAction',
    labelKey: 'settings.editor.codeImageAction.label',
    hintKey: 'settings.editor.codeImageAction.hint',
    control: 'select',
    options: CODE_IMAGE_ACTIONS,
  },
]

/**
 * 外观栏里那三条「外壳」偏好：值不在 editorSettings 里，各有自己的出口 ——
 * 缩放走 App 的 cp.uiScale、界面语言由 i18n 模块自己持久化、侧边栏位置只是发起一次对调。
 *
 * 2026-10-12 收进 APPEARANCE_ROWS、与主题和「代码图片」共用一个循环：「代码图片」那组要摆在
 * 这一栏**末尾**（外观栏原本就有的那几行在前），拆成两段循环就得把行模板抄两遍。
 * 差异（取值 / 落值 / 选项显示名）由 rowValue / rowSelect / rowOptionLabel 分流；
 * `external` 用来关掉「已改动」指示线与行尾键名——那两样只对 editorSettings 的键有意义。
 * 现有四条：界面缩放 / 界面语言 / 侧边栏位置 / 窄屏折叠方向。
 */
const SHELL_ROWS = [
  {
    key: 'uiScale',
    external: true,
    labelKey: 'settings.appearance.uiScale.label',
    hintKey: 'settings.appearance.uiScale.hint',
    control: 'select',
    options: UI_SCALE_OPTIONS.map((scale) => ({ id: scale })),
    readValue: () => props.uiScale,
    onSelect: (raw) => emit('update:ui-scale', Number(raw)),
    optionLabel: (item) => scaleLabel(item.id),
  },
  {
    // 界面语言与「判题语言」无关，后者由活跃文件的扩展名派生（见 HANDOFF 第 5 节坑 15）。
    // 状态在 src/i18n/index.js 里是模块级单例，自己读写 localStorage，所以不走 props / emits。
    // label 一律用该语言自己的写法（endonym），任何语言下都找得到自己，所以不翻译。
    key: 'locale',
    external: true,
    labelKey: 'settings.appearance.locale.label',
    hintKey: 'settings.appearance.locale.hint',
    control: 'select',
    options: LOCALES.map((item) => ({ id: item.id, label: item.label })),
    readValue: () => locale.value,
    onSelect: (raw) => setLocale(raw),
  },
  {
    // 统一侧边栏的位置偏好存在 services/shellSettings.js 的 cp.panelPosition 里，这里只负责
    // 发起一次对调；档位表也从那里 import（设置菜单行尾的两颗段钮用的是同一份，见 PANEL_POSITIONS）。
    // 两段式一键切换（2026-10-30 起，原先是下拉）：两档名字并排，点另一档就发起对调，
    // 点当前档是空操作（onSelect 里那道比较把它滤掉）。
    key: 'panelPosition',
    external: true,
    labelKey: 'settings.appearance.panelPosition.label',
    hintKey: 'settings.appearance.panelPosition.hint',
    control: 'toggle',
    options: PANEL_POSITIONS,
    readValue: () => props.panelPosition,
    onSelect: (raw) => {
      if (raw !== props.panelPosition) emit('toggle-layout')
    },
  },
  {
    // 窄屏（手机 / 平板竖屏）下折叠后图标栏贴上边还是下边。与「侧边栏位置」正交：
    // 那个管左右、这个管上下；宽屏改它看不出效果（折叠后是竖条，没有上下之分），
    // 所以整行只在窄屏出现（2026-10-13 用户要求，`when` 见下面的 appearanceRows；
    // 设置菜单那一行同一判据）。值本身照旧持久化 / 走云端同步，只是宽屏不给入口。
    // 这里不接 props / emits：状态是那个模块的单例，读写都走它自己。
    // 两段式一键切换（2026-10-30 起，原先是下拉），与「侧边栏位置」同一种控件。
    key: 'narrowCollapseSide',
    external: true,
    when: () => isNarrowLayout(),
    labelKey: 'settings.appearance.narrowCollapseSide.label',
    hintKey: 'settings.appearance.narrowCollapseSide.hint',
    control: 'toggle',
    options: NARROW_COLLAPSE_SIDES,
    readValue: () => narrowCollapseSide.value,
    onSelect: (raw) => setNarrowCollapseSide(raw),
  },
]

// 「外观」是独立的一级分类：顺序为 主题 → 界面缩放 · 界面语言 · 侧边栏位置 · 窄屏折叠方向
// → 「代码图片」三条。
// 字体大小本来就只对代码区有意义，已挪去「编辑器 › 字体」（见 EDITOR_GROUPS）。
// 除了三条外壳偏好，其余行仍是 editorSettings 的键，所以照搬编辑器那套行渲染
// （键 / 校验 / Monaco 都同源）。
const APPEARANCE_ROWS = [
  {
    key: 'theme',
    labelKey: 'settings.appearance.theme.label',
    control: 'themeGrid',
    options: THEMES,
  },
  ...SHELL_ROWS,
  ...CODE_IMAGE_ROWS,
]

/**
 * 此刻要画的那几行 = 表里通过 `when` 的那些（与设置菜单 `SETTINGS_MENU_ROWS` 同一套口径，
 * 只是那边由 SettingsMenu.vue 过滤、这里由本组件过滤）。
 * 目前只有「窄屏折叠方向」一行有条件：宽屏上它是空转的、整行不摆（见 SHELL_ROWS）。
 * ⚠️ 判据必须是**响应式**的读法：`isNarrowLayout()` 底层是一个 ref（旋屏当场变），
 * 写成模块级常量或每次现查 `matchMedia` 会让这一栏把首帧的答案缓存住。
 */
const appearanceRows = computed(() => APPEARANCE_ROWS.filter((row) => row.when?.() ?? true))

// 深色一行、浅色一行（用户要求的两行排法），不在模板里按 id 硬写
const themeGroups = computed(() => [
  { scheme: 'dark', items: THEMES.filter((item) => item.scheme === 'dark') },
  { scheme: 'light', items: THEMES.filter((item) => item.scheme === 'light') },
])

/**
 * 色卡预览的四格颜色**直接从样式表里读**，不在 JS 再抄一份。
 * 抄一份的结果就是：改了 base.css 的色值，色卡还停在旧颜色（用户实报过）。
 * 读法：把该主题实际会命中的选择器（:root → 明暗基础块 → 主题覆盖块）按文档顺序叠起来，
 * 后出现的声明优先，正好和浏览器级联的方向一致。读不到（跨源样式表 / 尚未加载）时
 * 退回 THEMES 上那份 fallback，绝不出现空白卡。
 */
const SWATCH_VARS = ['--bg-editor', '--bg-card', '--accent', '--text']
const swatchCache = new Map()

function selectorsFor(theme) {
  const names = [':root']
  if (theme.scheme === 'light') names.push(":root[data-scheme='light']")
  if (theme.id !== 'dark' && theme.id !== 'light') names.push(`:root[data-theme='${theme.id}']`)
  return names
}

function swatchFor(theme) {
  if (swatchCache.has(theme.id)) return swatchCache.get(theme.id)
  const wanted = selectorsFor(theme)
  const values = {}
  for (const sheet of Array.from(document.styleSheets)) {
    let rules = null
    try {
      rules = sheet.cssRules
    } catch {
      continue // 跨源样式表：读不到就跳过，由 fallback 兜底
    }
    for (const rule of Array.from(rules || [])) {
      // 浏览器把属性选择器的引号规整成正/双引号不定，统一成单引号再比
      const sel = rule.selectorText?.replace(/"/g, "'")
      if (!sel || !wanted.includes(sel)) continue
      for (const name of SWATCH_VARS) {
        const value = rule.style.getPropertyValue(name).trim()
        if (value) values[name] = value
      }
    }
  }
  const read = SWATCH_VARS.map((name) => values[name] || '')
  const swatch = read.every(Boolean) ? read : theme.swatch
  swatchCache.set(theme.id, swatch)
  return swatch
}

// 设置分类目录：左侧导航项与右侧内容一一对应，点哪一项就只渲染那一组设置。
// activeSection 只活在这个组件里（不落 localStorage）：设置视图本来就是常驻挂载的，
// 一次会话里切来切去能记住上次看的那一类，关掉页签再打开也不丢。
// 初值是「外观」（2026-10-11 起）：原先有个排在最前的「常用设置」分类，只是把外观 / 编辑器
// 里的高频项再摆一份、共用同一份偏好，现已删掉，默认落点顺势交给紧随其后的「外观」。
const SECTIONS = [
  // 工作区只在桌面端可见（打开本机文件夹是 Tauri 壳独有的能力），见下面 visibleSections
  { id: 'workspace', titleKey: 'settings.section.workspace', icon: 'folder' },
  { id: 'appearance', titleKey: 'settings.section.appearance', icon: 'sliders' },
  { id: 'editor', titleKey: 'settings.section.editor', icon: 'code' },
  { id: 'templates', titleKey: 'settings.section.templates', icon: 'file' },
  { id: 'shortcuts', titleKey: 'settings.section.shortcuts', icon: 'keyboard' },
  { id: 'judge', titleKey: 'settings.section.judge', icon: 'check' },
  { id: 'cloud', titleKey: 'settings.section.cloud', icon: 'cloud' },
  { id: 'app', titleKey: 'settings.section.app', icon: 'install' },
  { id: 'extension', titleKey: 'settings.section.extension', icon: 'plugin' },
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
 * 哪几行模板是展开的（2026-11-09）。
 *
 * 三份模板各是一个 220px 高的多行框，全展开时这一页光输入框就 660px —— 而绝大多数人
 * 一辈子不会改模板，却每次进设置都要滚过它们。所以默认全部收起，行里只剩「语言名 +
 * 恢复默认」，点一下才长出输入框。
 *
 * 状态放组件里、不落 localStorage：这是「我现在要看哪一份」的一次性意图，不是偏好。
 * 换个页签再回来重新收起是对的 —— 那时你也确实不需要它了。
 *
 * 用 `Set` 的副本替换而不是原地 `add` / `delete`：`ref` 追的是引用，原地改不触发重渲。
 * 三行、互不影响，不做手风琴（展开一份会把另一份收掉反而更意外）。
 */
const openTemplates = ref(new Set())
const isTemplateOpen = (id) => openTemplates.value.has(id)
function toggleTemplate(id) {
  const next = new Set(openTemplates.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  openTemplates.value = next
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

const activeSection = ref('appearance')

// 站点内快捷键：绑定表与冲突规则都在 useShortcutManager 里，这里只做界面。
// 录制、冲突红字、阻止绑定都收在 HotkeyRecorder 内部（它要一边录一边校验）。
// `bindings` 只给写死的动作（`fixed`）出只读徽标用 —— 三条 `fixed` 动作现在都带
// `hideInSettings`、不出现在这个列表里，所以眼下没有渲染点；留着这一支是为了将来
// 真有「写死但仍要露个键位」的动作时不用再回来改模板。
const { bindings, resetAll } = useShortcutManager()

// 面板只列「能改」的动作：资源管理器那三条（重命名 / 删除 / 全选）键位写死、面板里没有可点的
// 控件，只留一行只读徽标纯属噪声（2026-10-25 用户口径「删去设置页面快捷键的这几项」）。
// 它们**仍然在 SHORTCUT_ACTIONS 与 bindings 里** —— 执行、冲突检测、文件树右键菜单右列的键位
// 都读那份表，别顺手把它们从数据里删掉。
const settingsShortcutActions = computed(() =>
  SHORTCUT_ACTIONS.filter((action) => !action.hideInSettings),
)

// 桌面端（Tauri）关掉的那几块 —— PWA 安装入口、本地运行环境下载、浏览器扩展 ——
// 在这里一次性读出来给模板用（判定见 services/platform.js）。
const isDesktop = IS_DESKTOP

// 「浏览器跑在手机 / 平板上」：扩展与「装成应用」两条引导在移动端都与桌面端差得很远，
// 所以几处文案都要先过这一条。判据是 UA（见 platform.js 的 BROWSER_PLATFORM）。
const isMobileBrowser = BROWSER_PLATFORM !== 'desktop'

// 安装到设备（2026-09 顶栏删除后从顶栏那颗按钮搬进来的）
const { canInstall, installed: appInstalled, runningStandalone, installSupported, install } =
  useInstallPrompt()

/**
 * 「装成应用」这条路的**已知已装**状态：`appinstalled` 报过，或正跑在独立窗口里。
 * 两条都是精确信号，比任何推断都准，所以状态词先看它。
 */
const appIsInstalled = computed(() => appInstalled.value || runningStandalone.value)

/**
 * 那一行状态词。三态，判据只有 `installSupported` 一条 —— **这个引擎能不能由网页一键装**
 * （见 `useInstallPrompt.js` 的 `INSTALL_API_SUPPORTED`）。这一处不判浏览器型号、不碰 UA：
 * 唯一条例外（三星 Internet 的属性假阳性）收在 `useInstallPrompt.js` 里，在那一层就已经扣掉，
 * 所以这里仍只看这一个开关。
 *
 * - 已装 → 「已安装」
 * - 引擎有可用的一键安装 → 「当前浏览器支持」
 * - 没有 → 「当前浏览器不支持」
 *
 * ⚠️ 「已装」那一支 2026-11-10 起**没有机会上屏**了：装好之后整行都不渲染（见模板里
 * 「基础设置」那块的条件）。这里仍然按三态写，是因为它回答的是「此刻是什么状态」，
 * 而「要不要显示」是模板的事 —— 两件事分开放，别为了那一天把状态词改成两态。
 *
 * 原来这里是「看 `canInstall` 猜按钮为什么灰」，再按浏览器挂五句长解释。问题在于
 * `canInstall` 是**事件**判据：事件不来既可能是「不支持」、也可能是「这一刻条件不满足」，
 * 于是两种情况被塞进同一句「已安装或不支持」，还得靠猜浏览器去补救
 * —— 猜得越多越不准。现在状态词只说「支不支持」，按钮亮不亮另由 `canInstall` 决定。
 */
const installStatusKey = computed(() => {
  if (appIsInstalled.value) return 'settings.app.install.statusInstalled'
  return installSupported
    ? 'settings.app.install.statusAvailable'
    : 'settings.app.install.statusUnsupported'
})

/** 按钮上的字：只有真知道装过了才写「已安装」，其余一律「安装」（同上，那一格现在不渲染） */
const installButtonKey = computed(() =>
  appIsInstalled.value ? 'settings.app.installedAction' : 'settings.app.installAction',
)

/**
 * 「引擎有这套 API、此刻也没装，却拿不到一键安装的入口」—— 也就是**按钮灰着、状态词却写着
 * 「当前浏览器支持」**的那一格。判据与通知共用同一份（`installGuides.js` 的
 * `installUnavailable`），这里只是拿来当 `v-if`。它不是错误状态，是浏览器的正常状态：
 * 安装事件只由浏览器在自己认为「没装」时派发一次，站点既不能问也不能催 —— 从访达里删掉
 * 图标并不算卸载，记录还在浏览器里，于是它永远认为「已装」。所以这一格能做的只有如实解释
 * + 给出浏览器那一侧的出路（`APPS_URL`，与通知里那颗「复制地址」读同一份）。
 */
const appsCopied = ref(false)
let appsCopyTimer = 0

async function copyAppsUrl() {
  try {
    await navigator.clipboard.writeText(APPS_URL)
    appsCopied.value = true
    window.clearTimeout(appsCopyTimer)
    appsCopyTimer = window.setTimeout(() => {
      appsCopied.value = false
    }, 2000)
  } catch {
    /* 非安全上下文或用户未授权：保持原样，说明里已写明地址 */
  }
}

/**
 * 「引擎没有安装 API，但这个浏览器其实装得上」—— 这一格的出路说明（2026-10-12 加，用户点名）。
 *
 * 【为什么必须有】状态词只说「这套 API 有没有」，而**有 API 与装得上不是一回事**：Firefox
 * （含安卓版）与 iOS 上所有浏览器从来就没实现 `beforeinstallprompt`，判据于是落「当前浏览器
 * 不支持」、按钮也点不动；可它们自己的菜单里确实有「安装 / 添加到主屏幕 / 添加到程序坞」。
 * 只留一句「不支持」，用户就以为这台机器没有安装这条路（2026-10-12 用户报障原文：安卓版
 * Firefox 里「没有在设置中显示安装选项」）。
 *
 * 【⚠️ 这是「应用」栏唯一一处按浏览器 / 系统分岔的地方】2026-10-11 定过「这一栏只看引擎能力、
 * 不看 UA」，本轮（2026-10-12）用户明确改口：**三条真实的安装路都要给引导**（Firefox 安卓 /
 * 桌面 Firefox 的 Windows 版 / iOS Safari + 桌面 Safari）。所以纪律收紧成一条：**UA 只许决定
 * 「这行说明写哪句」，不许回头去改状态词与按钮**（那两处仍旧只看 `installSupported` /
 * `canInstall`）—— 两者混起来就又变回从前那套「猜浏览器来解释按钮为什么灰」。
 *
 * 【为什么文案是整句、不再拆成前后两半】这里没有要强调的地址 / 键名，只有操作步骤，整句更短；
 * 拆两半是插件栏那两条（`<code>` 夹在句子里）的写法，别照抄。
 *
 * 覆盖面：三星 Internet → 地址栏那个「＋」徽标（安装口径）或它自己的菜单 ›「添加页面到」
 * ›「主屏幕」（2026-10-14 加，见 `useInstallPrompt.js` 的 `MANUAL_INSTALL_BROWSER`）；
 * Firefox 安卓 → 它自己的 ⋮ 菜单；桌面 Firefox → **只有 Windows 143+** 有地址栏那个
 * 「网络应用」图标（macOS / Linux 上真没有这条路）；Safari 系（含 iOS 上所有浏览器，UA 都落
 * `safari`）→ iOS 走「分享 → 添加到主屏幕」、macOS 走「文件 → 添加到程序坞」；其余认不出的
 * 引擎给一句通用的「用浏览器自己的菜单装」。
 */
const installNoApiHint = computed(() => !installSupported && !appIsInstalled.value)

/** 变体 → 文案 key：分岔与通知共用 `installGuides.js` 那一份，别在这里再写一遍 if 链 */
const installNoApiHintKey = computed(() => NO_API_KEYS[noApiVariant()] ?? NO_API_KEYS.generic)

// 「工作区」这一栏只在能打开本机文件夹的平台上出现：网页版没有这回事，Android 走 SAF
// 也没有（见 workspaceMode.js 的 CAN_USE_LOCAL_FOLDER）。
// 两类平台独有的分类各自裁掉：工作区只在桌面端（壳里能打开本机文件夹），浏览器插件只在
// 网页版（桌面端的 webview 装不了扩展，抓题用的 postMessage 桥也不接）。其余分类两端一致。
const visibleSections = computed(() =>
  SECTIONS.filter(
    (section) =>
      (CAN_USE_LOCAL_FOLDER || section.id !== 'workspace') &&
      (!isDesktop || section.id !== 'extension'),
  ),
)

// ------------------------------------------------------- 触屏横滑换分类（窄屏）
/**
 * 窄屏左右滑动内容区，切换设置分类（2026-11-07 加，同日改成「两页一起走」）。
 *
 * **只在「目录折到内容上方」的那一档生效**：够宽时目录是左栏、内容在右栏，横滑没有「翻页」
 * 的语义（判据见 `isSingleColumn`）。窄屏上目录是顶上横滚的一行，翻一页要先去够那个不起眼的
 * 标签 —— 手势才是手机上该有的那一半。
 *
 * 【手势归属靠 touch-action，不靠 preventDefault】触摸的手势归属是浏览器在 touchstart /
 * pointerdown 那一刻按 `touch-action` 定下的，之后 `preventDefault()` 改不动它（第 1 节
 * 那条硬约束）。所以取景框 `.settings-panes` 声明的是 `touch-action: pan-y`：纵向仍归浏览器滚
 * 页面，横向没人管，`pointermove` 就一路送到这里来。
 *
 * 【一条轨道，只有整排在动】分类之间不是「同一块内容换文案」，所以每一页各自是一份 DOM
 * （模板里那些 `.settings-pane`）。2026-11-09 起改成**单层轨道**：第 at 页的 transform 永远
 * 是 `at × 一页宽`（绝对下标，切页时不变），整排 `.settings-content` 的位移是
 * `-当前页下标 × 一页宽 + 跟手偏移`。拖动、回弹、翻页、接管、目录点选全都只改这一层的
 * 内联 transform（见 `applyTrack`）—— 于是没有「父容器归零 + 子页从 100% 滑到 0」那种
 * 两层反向对冲（那两层只要起止帧差半毫秒，屏幕上就会看到一丝抖动），也不需要在换页那一帧
 * 把 `frozenOffsets` 量出来再补回去。
 *
 * 【旁边那两页**始终**在渲染树里，不靠 display 开关】这条是「松手闪一下」的根（2026-11-08）：
 * 元素从 `display: none` 变可见时没有变化前样式，那一帧的 `transform` 变化**不会起过渡**，
 * 新的一页于是当场落位 —— 短促的快甩最容易撞上（抬起时 `is-swiping` 可能一帧都没落过，
 * 两侧的页一直藏着）。现在它们常驻、被外层取景框的 `overflow: clip` 裁在内容盒外，
 * 每一页都有完整的过渡；代价是它们要参与布局，所以 DOM 里只留「当前页 ±1」。
 * 另外单层轨道还顺手解决了「现挂的那一页出生在哪」—— 挂上就落在自己的轨道格里，不用补偏移。
 */
const SWIPE_SLOP = 12 // 起手多少像素之后才判方向
const SWIPE_AXIS = 1.2 // 横向得比纵向大这么多才认；斜着划一律让给滚动
const SWIPE_RATIO = 0.18 // 不看速度时要划掉内容宽度的这么多
const SWIPE_MIN = 28 // 但位移本身至少这么远（甩一下也算数，见 SWIPE_FLING）
/** px/ms：抬手的**瞬时**速度到这个数就算甩（不是整手的平均速度，见 `onSwipePointerMove`） */
const SWIPE_FLING = 0.5
/**
 * 跟手最多挪内容宽度的这么多，再往外只剩橡皮筋（2026-11-09 由 0.34 放宽到 0.65）。
 *
 * 0.34 是一道离手太近的墙：手机上一页宽三百来像素，划到一百出头就突然变沉，手感像拖着
 * 铅块。而且「划掉 18% 就翻页」的判据远在那道墙之内 —— 墙根本不该参与决策。
 * 现在 65% 以内 1:1 跟手，越过之后才开始衰减，到头 / 尾那一侧照旧打三折。
 */
const SWIPE_LIMIT = 0.65
const SWIPE_SETTLE_MS = 600 // 兜底：过渡结束由 `transitionend` 说了算，这个只用防它不来
// 落位那趟的时长按「剩下的路 ÷ 手速」算（见 `settleDuration`），两个端点：
const SWIPE_DUR_MAX = 320 // 慢慢划、慢慢松手：路走完就该有这么久，别急着收
const SWIPE_DUR_MIN = 160 // 快甩：手越快剩下的路越短，动画不能比手慢
/**
 * 松手后那趟的曲线 —— **开头必须是满速**。
 *
 * 抬手那一刻内容已经有初速度了，用 `ease` / `ease-in-out` 会在开头重新「加速」，观感就是
 * 手指离开后先顿一下再窜出去。这条前段极陡、后段长尾，正好接住手指的速度（2026-11-08）。
 *
 * 2026-11-09 起整排是**一层**在动（见 `applyTrack`），曲线只有这一份、由内联 `transition`
 * 下发；样式表里 `.settings-content` 那条同曲线的声明只是首帧兜底。别再给 `.settings-pane`
 * 写过渡 —— 每一页的位置现在是它的**绝对下标**，切页时那一行根本不变。
 */
const SWIPE_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'
const SWIPE_GLIDE_MS = 220 // 收滚动的兜底时长；正常情况下跟着这一趟的落位时长走（见 `settleDur`）
/**
 * 「减弱动效」的媒体查询 —— 在模块里建一次，抬手那一帧只读 `.matches`。
 *
 * 每次 `matchMedia()` 都要新建一个 `MediaQueryList`，某些 WebView 上还会顺手做一次样式
 * 环境求值；而 `settleVertical` 跑在 `pointerup` 里，正是最不该多做事的那一帧。
 * `MediaQueryList` 是活对象：系统里中途改设置，`.matches` 自己会跟着变，缓存不吃亏。
 */
const REDUCED_MOTION =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null

const viewEl = ref(null)
const navEl = ref(null)
const contentEl = ref(null)
/**
 * 跟手位移（px，相对当前页基准），0 = 当前页正好贴住取景框 —— **故意不是 ref**（2026-11-08）。
 *
 * `pointermove` 在 120Hz 的手机上一秒来 120 次，每写一次 ref 就把这个组件重渲一遍（几千行
 * 模板、三整页设置行都在它的作用域里）。所以热路径直接写 `contentEl.style.transform`
 * （见 `applyTrack`），整趟手势一个响应式值都不碰，只在抬手那一下改一次状态。
 *
 * 需要读它的只有手势自己（跟手基准、现挂页要补的距离），模块变量就够。
 */
let shiftPx = 0
/**
 * 这一趟落位过渡的时长（ms），0 = 没有在落位。
 *
 * 快速连翻时两手间隔常常只有 120ms，固定 0.22s 的过渡每一趟都播不完，观感就是
 * 「上一个动画还没走完就翻到下一页」。松手时按「剩下的路 ÷ 瞬时手速」算成 160~320ms
 * （见 `settleDuration`），快甩那一趟能在一手之内走完。
 *
 * 2026-11-09 起它只服务**收滚动**（`settleVertical` 要与横向那一趟同长）：横向过渡的
 * 时长直接写进内联 `transition`，不走响应式 —— 写 ref 要等 Vue 的微任务，位移却已经同步
 * 落下去了，那一帧用的还是上一条时长（快甩按 0.22s 走，正好慢半拍）。
 */
let settleDur = 0
/** 换页那趟要撑住的高度（px）。0 = 不撑；见 `settleVertical` */
let holdHeightPx = 0
/**
 * 拖动中：手指正按在内容上（判定为横滑之后）。
 * 只管逻辑（收尾时机、`finishSettle` 里是否交回过渡），与样式无关 —— 每一页早就没有过渡了。
 */
const isSwiping = ref(false)
/**
 * 这一趟落位过渡还没走完。
 * 只用来**掐时机**：接管要在它期间做（`onSwipePointerDown`），放高度与补挂邻页要等它结束
 * （`finishSettle`）。
 */
const isSettling = ref(false)
let settleTimer = 0
/** 落位之后补挂邻页的那一下（见 `finishSettle`：不在落位那一帧挂） */
let mountTimer = 0
/** 换页时收滚动那趟 rAF */
let glideRaf = 0
/** 上一帧量到的一页宽：宽度变了（窗口缩放、界面缩放）就得把整排重新对到基准上 */
let trackWidth = 0
let trackObserver = null
/**
 * 已经在 DOM 里的分类。
 *
 * 平时只有「当前页 ±1」这三页（多一页就多一整页布局，而每一页现在都是常驻渲染的）；
 * 换页那一帧会临时把即将进来的那一页塞进来，`mountNeighbours()` 再在空闲时收回去。
 */
const renderedIds = ref(new Set([activeSection.value]))
/**
 * 这一次触摸的现场，横向锁上之后才开始动内容。
 *
 * `vx` 是**瞬时**速度（px/ms，正 = 往右），由每帧位移差做一阶低通得到 —— 抬手拿它判「甩」
 * 与判方向。用整手的 `dx / t` 会把起手那几帧的慢速一起摊进来，快速轻扫常常判不出甩。
 */
let swipe = null
/**
 * 起手落在这些地方就不算翻页。
 *
 * 判据是「横向拖动在这儿本来就有别的含义」：文本框 / 模板文本域 / contenteditable 里那是
 * 选字与移光标，目录（`.settings-nav`）自己会横滚。
 * **故意不含 `<select>` 与勾选框** —— 设置页大半行是「标签 + 右侧控件」，横滑从控件上起手
 * 是常态；下拉框横向拖不出任何事，把它们排除在外只会让手势「时灵时不灵」（2026-11-07
 * 实测：窄屏「编辑器」那一栏整页都点得到 `select`，按老判据一格都滑不动）。
 */
const SWIPE_IGNORE = [
  '.settings-nav',
  'textarea',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  'input[type="text"]',
  'input[type="search"]',
  'input[type="number"]',
  'input[type="url"]',
  'input[type="email"]',
  'input[type="password"]',
  'input[type="tel"]',
  'input:not([type])',
].join(', ')
/**
 * 抬手之后浏览器补的那发合成 click 要不要吃掉。
 *
 * 划过一手之后，那发 click 落在的已经是**刚换上的那一页**（比如正好压在某张主题卡上），
 * 不收就成了「切分类顺带把主题也改了」。只在自己确实划过（位移 ≥ SWIPE_MIN）时上膛。
 */
let swallowClick = false
let swallowTimer = 0

/** 内容区宽度：手势阈值都按它算，别写死像素 */
function contentWidth() {
  return contentEl.value?.clientWidth || 320
}

/** 目录此刻是单栏（折在内容上方）吗 —— 直接读布局结果，不在这里重算 35rem 那道断点 */
function isSingleColumn() {
  const inner = viewEl.value?.querySelector('.settings-view__inner')
  return inner ? getComputedStyle(inner).flexDirection !== 'row' : false
}

/** 分类在目录里排第几；不在目录里（平台把它裁掉了）→ -1 */
function sectionIndex(id) {
  return visibleSections.value.findIndex((section) => section.id === id)
}

/** 当前页是第几页 —— 换页那一帧它变，每一页的位置（内联 transform）就跟着挪一格 */
const activeIndex = computed(() => sectionIndex(activeSection.value))

/**
 * 这一页离当前页几格：`0` = 当前页，`-1` / `+1` = 左右各一页。
 * 位置就按它摆（`paneProps` 把它算成内联 transform），所以换页只要改这一个数。
 * **不在目录里的一页给 `null`** —— 这类平台裁掉的分类（网页版没有「工作区」、桌面端没有
 * 「插件」）`findIndex` 给的是 −1，若直接拿它减，当前页正好是第一类时它就冒充 −1 号页被挂出来，
 * 到头那一侧的橡皮筋里会露出版面的一角。
 */
function paneOffset(id) {
  const at = sectionIndex(id)
  return at < 0 ? null : at - activeIndex.value
}

/**
 * 这一页要不要在 DOM 里 —— 当前页永远要，其余**只认 `renderedIds`**。
 *
 * 不再写成「离当前页一格以内就渲染」：换页那一帧，新当前页的右侧邻居（原来隔两格的那页）
 * 会当场挂上来，而它出生就在 `+100%`、正好压在「正在滑进来的那一页」的起点上，两页的字
 * 叠一帧（探针实测 64px 宽的重影）。现在挂载只发生在空闲时（`mountNeighbours()`），
 * 过渡里不长出新节点。
 *
 * 当前页单独放行，是因为从目录点到一个没挂过的分类时（不经过横滑），它必须当场就在 ——
 * 等 `mountNeighbours()` 的 `nextTick` 再挂，中间会空一帧白底。
 */
function paneRendered(id) {
  if (paneOffset(id) === null) return false
  return id === activeSection.value || renderedIds.value.has(id)
}

/**
 * 一页的挂载属性，一次 `v-bind` 出去（模板里每页只多一行）。
 *
 * **位置只由它在目录里的绝对下标决定**（2026-11-09 的「单层轨道」）：第 `at` 页永远停在
 * `at × 一页宽`，与当前是哪一页无关。切页时整排由父容器的 transform 平移过去，每一页自己
 * 那一行 `style` 一个字节都不变 —— 于是没有「子页从 100% 滑到 0」这第二个动图层，也就没有
 * 两层反向对冲的帧差。挂载即正确位置：新页出生就在它的轨道格上，不必再补什么偏移。
 *
 * 不显示的那几页要一起遮住辅助技术与焦点：它们是真渲染出来的节点，只是被推到一页宽以外
 * 裁掉了；`aria-hidden` 管读屏，`inert` 管焦点与指针（当前页上这两个属性都得没有，
 * 所以给 `{}` 而不是给 `false` —— `inert="false"` 照样是 inert）。
 */
function paneProps(id) {
  const at = sectionIndex(id)
  const current = id === activeSection.value
  const offset = at - activeIndex.value
  return {
    class: {
      'settings-pane': true,
      'settings-pane--current': current,
      'settings-pane--peek': Math.abs(offset) === 1,
    },
    // 静态绝对坐标，不随 activeIndex 变（见上面的注释）
    style: { transform: `translate3d(${at * 100}%, 0, 0)` },
    'data-pane': id,
    ...(current ? {} : { 'aria-hidden': 'true', inert: '' }),
  }
}

/**
 * 把 DOM 里的页收到「当前页 ±1」—— 平时只在空闲时做，别让落位那一帧长出新节点。
 *
 * 两条理由：
 * 1. 每页现在都常驻渲染（不再靠 `display: none` 藏，理由见样式表里
 *    `.settings-pane:not(.settings-pane--current)` 那条注释），所以不能像以前那样「翻到过的
 *    都留着」：每多一页就多一整页设置行的布局，翻一遍设置就白攒 9 页；
 * 2. 一次挂一整页（几百个设置行）就是一次长任务，压在过渡里会掉帧。
 *
 * `force`：起手判出横向的那一刻要**立刻**把两侧补齐（这时 `isSwiping` 还没落，或刚落），
 * 等到抬手再挂就晚了 —— 单层轨道里挂载本身是安全的（每页位置由绝对下标决定，不会叠），
 * 只是别把它塞在落位那一帧。见 `onSwipePointerMove`。
 */
function mountNeighbours(force = false) {
  if (!force && (isSwiping.value || isSettling.value)) return
  const keep = new Set([activeSection.value])
  for (const delta of [-1, 1]) {
    const near = neighbourSection(delta)
    if (near) keep.add(near.id)
  }
  renderedIds.value = keep
}

// 首次进来就把两侧挂上：滑动的那一刻旁边那一页必须在，页面才能跟着手指一起走
mountNeighbours()

/** 当前分类往 delta（-1 / +1）挪一格；已经在头 / 尾时给 null */
function neighbourSection(delta) {
  return visibleSections.value[sectionIndex(activeSection.value) + delta] ?? null
}

/**
 * 跟手位移的阻尼：65% 以内 1:1 跟手，越过之后只剩 1/4 的余量（橡皮筋）；
 * 已经到头 / 尾的那一侧再打三折 —— 手指一推就顶住，比「纹丝不动」更能说明没有下一页。
 */
function dampShift(dx) {
  const limit = contentWidth() * SWIPE_LIMIT
  const atEdge = dx > 0 ? !neighbourSection(-1) : !neighbourSection(1)
  const raw = Math.abs(dx) * (atEdge ? 0.3 : 1)
  const damped = raw <= limit ? raw : limit + (raw - limit) * 0.25
  return Math.sign(dx) * damped
}

/** 第 index 页的轨道坐标（px）：这一页左缘贴住取景框左缘时，整排该有的 translateX */
function trackBase(index = activeIndex.value) {
  return -(index < 0 ? 0 : index) * contentWidth()
}

/**
 * 写整排的位置 —— **整排只有这一处在动**（2026-11-09 的「单层轨道」）。
 *
 * `px` 是相对「当前页基准」的跟手偏移（0 = 当前页正好贴住取景框），`dur > 0` 走过渡、否则
 * 当场生效。整趟拖动只有这一个属性在变，每一页自己的 transform 一动不动（见 `paneProps`）。
 *
 * transform 与 transition **在同一任务里一前一后写完**：浏览器到渲染前才重算样式，那一次
 * 看到的就是「过渡从无到有 + 位移变了」，这一趟于是动起来；既不用强刷 `offsetWidth`，
 * 也不会出现「先瞬移再过渡」。这也正是时长必须走内联字符串、不能走响应式的理由 —— 写 ref
 * 要等 Vue 的微任务，而位移已经同步落下去了，那一帧用的还是上一条时长（快甩按 0.22s 走，
 * 正好慢半拍，就是「松手先顿一下」）。
 *
 * 拖动、回弹、翻页、接管、目录点选全走这一个出口，不要再各自拼 style。
 */
function applyTrack(px, dur = 0) {
  shiftPx = px
  const el = contentEl.value
  if (!el) return
  el.style.transition = dur > 0 ? `transform ${dur}ms ${SWIPE_EASE}` : 'none'
  el.style.transform = `translate3d(${trackBase() + px}px, 0, 0)`
}

/**
 * 读整排此刻的视觉位移（相对当前页基准）并**就地冻结** —— 中途接管的入口。
 *
 * 上一趟还在飞时按下去，这一句让内容当场停在手指底下（指哪停哪），新手势从这个像素接着走。
 * 读 `getComputedStyle` 的过渡中间值（`m41`），不是内联值 —— 内联值已经是终点了。
 * 写法顺序要紧：先读（还在动）、后写（`transition: none` + 同一个位置，于是原地停住）。
 */
function freezeTrack() {
  const el = contentEl.value
  if (!el) return 0
  const tf = getComputedStyle(el).transform
  const x = tf && tf !== 'none' ? new DOMMatrixReadOnly(tf).m41 : trackBase()
  const shift = x - trackBase()
  applyTrack(shift, 0)
  return shift
}

/**
 * 一页宽变了（窗口缩放、外观里的界面缩放）就把整排重新对到基准上。
 *
 * 这是单层轨道必须付的一笔：基准是像素（`-index × 一页宽`），宽度一变旧值就错位。
 * 用 ResizeObserver 盯内容层自己 —— 手势中不动（等松手自然对齐），落位中就地换算、不打断。
 */
function syncTrack() {
  if (isSwiping.value) return
  const width = contentWidth()
  if (Math.abs(width - trackWidth) < 0.5) return
  trackWidth = width
  applyTrack(isSettling.value ? shiftPx : 0, 0)
}

/**
 * 手势按下 —— 上一趟还在飞就**在这一刻**把它停在手指底下（2026-11-09）。
 *
 * 原先要等划出 `SWIPE_SLOP`（12px）判出方向之后才接管：那 12px 期间内容还在自己飞，手指
 * 与内容完全脱节，快甩时这一段能差出几十像素。现在按下即冻结（`freezeTrack`），判出横向
 * 之后从这个像素接着跟手。
 *
 * 冻结**不锁轴**：用户也可能只是想纵向滚页面。判成纵向时把这一趟续上（`resumeSettle`），
 * 内容不会停在半页中间。
 */
function onSwipePointerDown(event) {
  // 上一场没收干净（抬手落在窗口外）：先把状态收掉，整排归到当前页
  if (swipe) {
    stopSwipe()
    isSettling.value = false
    applyTrack(0, 0)
  }
  window.clearTimeout(swallowTimer)
  swallowClick = false
  // 上一趟还在收滚动：手又按下来了，就让它停在这儿，别和手势抢
  window.cancelAnimationFrame(glideRaf)
  glideRaf = 0
  if (event.pointerType !== 'touch' || !event.isPrimary) return
  if (!isSingleColumn()) return
  const target = event.target
  if (!(target instanceof Element)) return
  // 目录自己会横滚，输入框 / 文本域里横拉是选字 —— 见 SWIPE_IGNORE
  if (target.closest(SWIPE_IGNORE)) return

  let base = 0
  let resumed = false
  if (isSettling.value) {
    // 过渡还有余路：就地停住。`transitionend` 不会再来，那个兜底定时器也没意义了
    window.clearTimeout(settleTimer)
    isSettling.value = false
    base = freezeTrack()
    resumed = true
  }

  swipe = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    dx: 0,
    t: performance.now(),
    axis: null,
    // 位移基准：接管时是那一趟剩下的偏移，静止时就是 0
    base,
    // 按下时冻结过吗 —— 判成纵向要把它续上（见 `resumeSettle`）
    resumed,
    // 瞬时速度（px/ms）与它的采样点
    vx: 0,
    lastDx: 0,
    lastT: performance.now(),
  }
  // 监听挂在 window 上：手指划出内容区（或划到视口边缘）时仍要收到 move / up
  window.addEventListener('pointermove', onSwipePointerMove, { passive: true })
  window.addEventListener('pointerup', onSwipePointerUp)
  window.addEventListener('pointercancel', onSwipePointerCancel)
}

function onSwipePointerMove(event) {
  if (!swipe || event.pointerId !== swipe.id) return
  const dx = event.clientX - swipe.x
  const dy = event.clientY - swipe.y
  if (!swipe.axis) {
    if (Math.abs(dx) < SWIPE_SLOP && Math.abs(dy) < SWIPE_SLOP) return
    // 主要是纵向：这一次触摸就是滚动，整场都不再当手势（纵向本来就归浏览器）
    if (Math.abs(dx) <= Math.abs(dy) * SWIPE_AXIS) {
      const resumed = swipe.resumed
      swipe = null
      cleanupPointerListeners()
      if (resumed) resumeSettle()
      return
    }
    swipe.axis = 'x'
    // 先把两侧挂上再进手势态（`mountNeighbours` 在手势中会让路）：真要翻页时它已经在，
    // 不必在抬手那一帧现挂一整页
    mountNeighbours(true)
    isSwiping.value = true
    swipe.lastDx = dx
    swipe.lastT = performance.now()
    swipe.vx = 0
    // 判方向已经用掉了 dx，基准要让出这一截，否则第一帧会从冻结位置再跳一个 dx
    swipe.base -= dampShift(dx)
  } else {
    // 瞬时速度：一阶低通（单帧抖动不至于把「甩」判错、也不至于把慢慢划判成甩）
    const now = performance.now()
    const dt = now - swipe.lastT
    if (dt > 0) {
      swipe.vx = swipe.vx * 0.35 + ((dx - swipe.lastDx) / dt) * 0.65
      swipe.lastT = now
      swipe.lastDx = dx
    }
  }
  swipe.dx = dx
  // 热路径：只写整排这一个 transform，一个响应式值都不碰（见 `applyTrack`）
  applyTrack(swipe.base + dampShift(dx), 0)
}

function onSwipePointerUp(event) {
  if (!swipe || event.pointerId !== swipe.id) return
  const { dx, axis, vx, t, lastT, resumed } = swipe
  swipe = null
  cleanupPointerListeners()

  if (axis !== 'x') {
    // 按下了、但整场都没判出横向（轻点一下、或者只是纵向滚）：**冻结在手指底下的那一趟
    // 要续上**。否则整排就停在两页中间 —— 按下即冻结换来的这个新出口，漏一个就是死位置。
    isSwiping.value = false
    if (resumed) resumeSettle()
    return
  }

  // 判翻页只看**这一手**划了多远。接管时 `base` 是上一趟剩下的偏移，把它算进来会让
  // 「按一下、没动、松手」也够翻页条件 —— 那是替用户做决定。
  const moved = Math.abs(dx)
  const held = Math.max(1, performance.now() - t)
  // 抬手前手停住了（最后一次 move 之后过了 60ms 以上）就不算甩：速度按 0 算
  const speed = performance.now() - lastT > 60 ? 0 : Math.abs(vx)
  const width = contentWidth()
  const far = moved >= Math.max(SWIPE_MIN, width * SWIPE_RATIO)
  // 甩一下也算：手机上一半的翻页都是这么来的，非要划满半屏反而别扭
  const fling = moved >= SWIPE_MIN && speed >= SWIPE_FLING
  // 方向听谁：甩的时候听**速度**（先往左划、收手时往右一甩，该往右翻），否则听总位移
  const toward = fling ? Math.sign(vx) : Math.sign(dx)
  const next = far || fling ? neighbourSection(toward < 0 ? 1 : -1) : null
  // 划过一手：抬手那发合成 click 不许落到刚换上的那一页上
  if (moved >= SWIPE_MIN) armClickSwallow()

  isSwiping.value = false

  if (!next) {
    // 回弹：滑回当前页的基准。**接管场景下这一句就是「把停住的动画走完」**—— 那时
    // `activeSection` 已经是新页、基准也已经是新页，归零正好落到它身上，所以「按一下没动」
    // 既不会白翻一页，也不会停在半路。
    const dur = settleDuration(speed || moved / held, Math.abs(shiftPx))
    settleDur = dur
    beginSettle()
    applyTrack(0, dur)
    return
  }

  // 剩下的路 = 一页宽减去已经露出来的部分；这一趟的时长要先定下来，收滚动跟它同长
  const remaining = Math.max(0, width - Math.abs(shiftPx))
  const dur = settleDuration(speed || moved / held, remaining)
  settleDur = dur
  // 撑高与收滚动都要在换页之前定下来：高度取的还是旧页的，滚动也从旧页这一刻开始收
  settleVertical(dur)
  // 目标页还没在 DOM 里就同步挂上。**不用分两帧**：单层轨道里每一页的位置是它的绝对下标，
  // 父容器一挪它就正好落在框里 —— 挂载即正确位置，不会叠在正在进来的那一页上。
  if (!renderedIds.value.has(next.id)) renderedIds.value.add(next.id)
  // 先换页码（`trackBase()` 随即变成新页的基准），再写位移：一条过渡走完剩下那一截
  activeSection.value = next.id
  beginSettle()
  applyTrack(0, dur)
}

/**
 * 系统把这一手收走了（来电、切后台、弹出原生选择器）：退回原位。
 *
 * 不走 `onSwipePointerUp` —— 那时 `dx` 可能是任意中途值，按它判翻页等于替用户做决定。
 * 只把整排滑回当前页的基准，页码不动。
 */
function onSwipePointerCancel() {
  if (!swipe) return
  const paged = isSwiping.value && swipe.axis === 'x'
  const resumed = swipe.resumed
  stopSwipe()
  if (paged) {
    settleDur = SWIPE_DUR_MAX
    beginSettle()
    applyTrack(0, SWIPE_DUR_MAX)
    return
  }
  // 只冻结过、还没判出横向就被系统收走：同样要把那一趟续上（同上，别留下半页）
  if (resumed) resumeSettle()
}

/** 摘掉三个 window 监听（每个出口都走这里，别只清状态） */
function cleanupPointerListeners() {
  window.removeEventListener('pointermove', onSwipePointerMove)
  window.removeEventListener('pointerup', onSwipePointerUp)
  window.removeEventListener('pointercancel', onSwipePointerCancel)
}

/** 收手势：状态与监听一起收掉。位移与过渡交给调用方（回弹 / 归位 / 原地不动） */
function stopSwipe() {
  swipe = null
  isSwiping.value = false
  cleanupPointerListeners()
}

/**
 * 按下时冻结过、但这一手其实是纵向滚动：把停住的那一趟续上。
 *
 * 时长按剩下的路给（速度取下限），短一点没关系 —— 用户已经在滚页面了，横向这趟只是收尾。
 */
function resumeSettle() {
  const dur = settleDuration(0.8, Math.abs(shiftPx))
  settleDur = dur
  beginSettle()
  applyTrack(0, dur)
}

/**
 * 这一趟什么时候算走完（`isSettling`）：**由 `transitionend` 说了算**，定时器只是兜底。
 *
 * 过渡是从**下一次样式重算**开始的，不是从 `pointerup` 开始；快甩那一下，抬手到首帧之间
 * 还可能压着别的工作。窗口要是先到期，收尾就会打断还在跑的过渡。听事件就没有这个「猜」。
 */
function onContentTransitionEnd(event) {
  if (event.target !== contentEl.value || event.propertyName !== 'transform') return
  if (!isSettling.value) return
  finishSettle()
}

function finishSettle() {
  window.clearTimeout(settleTimer)
  isSettling.value = false
  settleDur = 0
  const el = contentEl.value
  // 兜底收尾有可能落在下一手已经起手之后：那时不能把过渡写回去 —— 一写，跟手就变成
  // 「每帧都在追一个动画」，手感立刻发飘。内联 `transition: none` 留着反而正好。
  if (el && !isSwiping.value) el.style.transition = ''
  // 收滚动还在跑最后几帧就掐掉、钉死在 0。**必须在放开高度之前**：`releaseContentHeight`
  // 撤 `minHeight` 的那一刻要是 `scrollTop` 还没归零，浏览器会拿残留的位置再夹一次 ——
  // 落位帧上就凭空多一跳（`transitionend` 与 rAF 的时钟差几毫秒就够）。
  if (glideRaf) {
    window.cancelAnimationFrame(glideRaf)
    glideRaf = 0
    if (viewEl.value && viewEl.value.scrollTop > 0) viewEl.value.scrollTop = 0
  }
  // 撤高度是一次 3000px 级的重排，别压在落位这一帧上 —— 那一帧刚被合成器交出来，
  // 最容易变成掉帧的地方。挪到下一帧（这中间真起手了，高度留着，等下一次收尾再放）。
  window.requestAnimationFrame(() => {
    if (!isSwiping.value && !isSettling.value) releaseContentHeight()
  })
  // 补挂邻页别压在落位这一帧：一次挂一整页（几百个节点）会掉第一帧，而落位正是最该稳的
  // 那一帧。挪到空闲时补 —— 这中间真滑了，`onSwipePointerMove` 会自己补挂。
  window.clearTimeout(mountTimer)
  mountTimer = window.setTimeout(() => mountNeighbours(), 140)
}

/** 落位窗：这期间按下要接管（见 `onSwipePointerDown`），`transitionend` 来了才收尾 */
function beginSettle() {
  isSettling.value = true
  window.clearTimeout(settleTimer)
  // 兜底：`transitionend` 万一没来（过渡被打断、或位移本来就是 0），也不能一直挂在 settling 上
  settleTimer = window.setTimeout(finishSettle, SWIPE_SETTLE_MS)
}

/** 上膛：合成 click 紧跟 touchend，留 350ms 的窗口；过了就作废，免得吞掉下一步真正的轻点 */
function armClickSwallow() {
  swallowClick = true
  window.clearTimeout(swallowTimer)
  swallowTimer = window.setTimeout(() => {
    swallowClick = false
  }, 350)
}

/** 捕获阶段拦在根上：吞掉那一发就收工（`preventDefault` 也做，别让它冒到默认动作上） */
function onSwipeClickCapture(event) {
  if (!swallowClick) return
  swallowClick = false
  window.clearTimeout(swallowTimer)
  event.preventDefault()
  event.stopPropagation()
}

/**
 * 把目录里当前那一项滚进可视区。
 *
 * 窄屏上目录是横向可滚的一行，换过分类之后当前项可能正停在屏幕外 —— 顶上那排标签就失去了
 * 「现在在哪一类」的指示作用。只滚目录自己（`scrollBy`），不碰页面：`scrollIntoView` 会把
 * 外层滚动容器一起滚，往下翻过一屏再换分类时页面会被拉回顶端。
 */
function revealNavItem() {
  const nav = navEl.value
  if (!nav || nav.scrollWidth <= nav.clientWidth + 1) return
  const item = nav.querySelector('.settings-nav__item--active')
  if (!item) return
  const navBox = nav.getBoundingClientRect()
  const itemBox = item.getBoundingClientRect()
  const delta = itemBox.left - navBox.left - (nav.clientWidth - itemBox.width) / 2
  if (Math.abs(delta) < 2) return
  nav.scrollBy({ left: delta, behavior: 'smooth' })
}

/**
 * 整排的三样东西都不归 Vue 管了：transform 与过渡走 `applyTrack`（内联直写），撑高走
 * `settleVertical`（`el.style.minHeight`）。这一层于是**没有任何 `:style` 绑定**。
 *
 * 原先 minHeight 留在 `:style` 里，是因为手动写 DOM 时 Vue 的 `patchStyle` 会把它一并清掉；
 * 现在 `:style` 整个摘掉了，`patchStyle` 从头到尾碰不到这个元素 —— 也就不会出现「某次无关
 * 重渲把跟手刚写进去的位置打回上一个值」那类事故。
 *
 * ⚠️ **静止时也必须是 `translate3d(0, 0, 0)`，绝不能让这一层退回 `transform: none`**
 * （2026-11-08）。原来静止时整条属性消失，浏览器为过渡临时提升的合成层随之被丢弃，内容并回
 * 文档层重新栅格化，那一帧新位图还没好 —— 观感就是「落定的最后一下整块内容消失一瞬」。
 * 兜底那条现在写在样式表里（`.settings-content` 的 `transform` + `will-change` 与
 * `backface-visibility`），谁清内联样式都清不掉它。
 */

/**
 * 这一趟落位过渡走多久 —— **直接对着「动画来不及播完」这个问题**（2026-11-08）。
 *
 * 原来是固定 0.22s。可快速连翻时两手间隔常常只有 120ms（探针里实测每手 121~134ms），
 * 于是每一趟都在半路被下一手接走：即便接力接得连续，观感仍旧是「一直被催着、
 * 永远落不到位」。按「剩下的路 ÷ 手速」算之后，快甩那一趟 160ms 就能走完，
 * 下一手落下时它已经停了 —— 接力从常态退回到例外。
 *
 * 两个量都要：
 * - **速度**决定「该有多急」：同一个 300px，慢慢划和甩一下的观感差着两倍；
 * - **剩余距离**决定「还要走多久」：甩到一半时剩下的路只有一页宽的三分之一，
 *   再按固定时长走就成了慢镜头。`0.45` 是把「匀速走完」压成一条减速曲线的经验系数。
 *
 * 夹在 `SWIPE_DUR_MIN`~`SWIPE_DUR_MAX` 之间：太短看不出方向，太长就永远被下一手接走。
 */
function settleDuration(speed, remaining) {
  // 0.3 以下按 0.3 算：几乎没动过的「慢慢挪」，不该算出无穷长的时长
  const s = Math.min(Math.max(speed, 0.3), 2.5)
  const ms = Math.round((remaining / s) * 0.45)
  return Math.min(SWIPE_DUR_MAX, Math.max(SWIPE_DUR_MIN, ms))
}

/**
 * 换页那一下的纵向收尾：**撑住旧高度 + 把滚动收回顶上** —— 一次读完、再写。
 *
 * 内容比新页高时，浏览器会夹一次 `scrollTop`，而且是在「出去的那一页」退出 DOM
 * 的**那一帧**（2026-11-07 实测：滚动 382 → 松手 364 → 落位 274，一帧跳 90px）。看着就是
 * 新页面落下时整块内容往上闪一下；页与页高度差越大跳得越狠。所以：
 *
 * 1. 换页那一刻给 `.settings-content` 撑住旧高度（`minHeight`），中间那两处夹取就不会发生；
 * 2. 同时自己把 `scrollTop` 平滑收到 0（缓动与那趟过渡同一口径），落位时高度再放开 ——
 *    那时已经在顶上，缩高也不会再夹。新页从顶上开始，本来也是翻页该有的行为，不是副作用。
 *
 * 用 rAF 收而不是 `scrollTo({ behavior: 'smooth' })`：原生那趟时长由浏览器定（300~500ms），
 * 收不完就要卡着高度不放，或者提前放开再被夹一下 —— 自己收才知道哪一帧结束。
 *
 * **两件事合成一个函数，只为了少读一次 `scrollTop`**（2026-11-09）：原来
 * `holdContentHeight` 读一次、写完 `minHeight` 之后 `glideScrollToTop` 再读一次，第二次读
 * 落在「布局已经脏了」之后，浏览器必须先把整排重新排完才答得上来 —— 一次**强制同步布局**，
 * 而且正好压在松手那一帧上。现在先读、后写，中间不再插入任何读取。
 */
function settleVertical(dur) {
  const view = viewEl.value
  const el = contentEl.value
  if (!view || !el) return
  // ⚠️ 这一帧**只读这一次** `scrollTop`：下面就要写 `minHeight`，写完再读就是上面说的
  // 那次强制同步布局（3000px 级的内容，快甩最怕这一帧变重）。
  const from = view.scrollTop
  // 已经在顶上就没有可夹的（夹取只在「滚动位置比新页的高度还大」时发生），收滚动也无事可做：
  // 撑高纯属白干 —— 换页那一帧要重排一份 3000px 级的内容，落位时再缩回来又是第二次。
  if (from <= 0) return
  // 连划两手时第一趟还撑着，别用已经变了的高度覆盖它
  if (!holdHeightPx) {
    // 还在上面那一次布局里（这中间没有任何写），不额外再排一遍
    holdHeightPx = el.offsetHeight
    el.style.minHeight = `${holdHeightPx}px`
  }
  window.cancelAnimationFrame(glideRaf)
  // 减弱动效时直接到位：这一趟本来就是为了替代「硬夹一下」，不该反过来变成一段滑动。
  // 时长跟横向那趟对齐（`settleDur`），否则一边收完另一边还在滑，看着是两件事。
  const ms = REDUCED_MOTION?.matches ? 0 : dur || SWIPE_GLIDE_MS
  if (!ms) {
    view.scrollTop = 0
    glideRaf = 0
    return
  }
  const started = performance.now()
  const step = (now) => {
    const p = Math.min(1, (now - started) / ms)
    // 与 CSS 那条 ease-out 同向：先快后慢，最后稳稳停在 0（`p = 1` 时是精确的 0）
    view.scrollTop = from * (1 - p) ** 3
    glideRaf = p < 1 ? window.requestAnimationFrame(step) : 0
  }
  glideRaf = window.requestAnimationFrame(step)
}

function releaseContentHeight() {
  if (!holdHeightPx) return
  holdHeightPx = 0
  const el = contentEl.value
  if (el) el.style.minHeight = ''
}

// 一页宽变了就把整排重新对到基准上（见 `syncTrack`）：基准是像素，宽度一变旧值就错位。
// 面板可能是 v-show 藏着的，首帧宽度为 0 —— 显示时 ResizeObserver 会补这一次对齐。
onMounted(() => {
  syncTrack()
  if (!contentEl.value || typeof ResizeObserver === 'undefined') return
  trackObserver = new ResizeObserver(syncTrack)
  trackObserver.observe(contentEl.value)
})

/**
 * 非手势切页（目录点选、侧栏菜单传进来的分类）也要把整排对到新页上。
 *
 * 手势那一路由 `onSwipePointerUp` 自己写（那一刻 `isSettling` 已为真，这里直接让路）。
 * 相邻页给一段横移 —— 窄屏上那是「翻页」该有的样子；跨页点选与两栏布局直接到位，
 * 不然会看到整排拉着一道长滑掠过中间那些页（宽屏更是完全没有横滑的语义）。
 */
watch(activeSection, (id, oldId) => {
  renderedIds.value.add(id)
  if (isSwiping.value || isSettling.value) return
  const step = Math.abs(sectionIndex(id) - sectionIndex(oldId))
  const dur = step === 1 && isSingleColumn() ? SWIPE_GLIDE_MS : 0
  // 等这一帧的 DOM 落下来再写位移：新页可能刚挂上（`paneRendered`），早一帧就是空框
  nextTick(() => {
    if (!isSwiping.value && !isSettling.value) applyTrack(0, dur)
  })
})

onBeforeUnmount(() => {
  stopSwipe()
  trackObserver?.disconnect()
  trackObserver = null
  window.cancelAnimationFrame(glideRaf)
  window.clearTimeout(swallowTimer)
  window.clearTimeout(settleTimer)
  window.clearTimeout(mountTimer)
})

// ------------------------------------------------------------ 工作区（仅桌面端）
// 模式与根路径在页面加载时就定下来（切换会 reload，见 workspaceMode.js），所以这里读一次即可。
const workspaceMode = ref(getWorkspaceMode())
const workspaceRoot = ref(getWorkspaceRoot())
const workspaceBusy = ref(false)
/** 这次等待来自哪颗按钮：只让点下去的那颗转圈，同一排的另一颗保持静止 */
const workspaceAction = ref('')
const workspaceError = ref('')

const workspaceIsFolder = computed(() => workspaceMode.value === MODE_FOLDER)

/** 弹原生目录选择器；取消则什么都不做，选中就切过去（写盘 + reload） */
async function chooseWorkspaceFolder() {
  if (workspaceBusy.value) return
  workspaceBusy.value = true
  workspaceAction.value = 'choose'
  workspaceError.value = ''
  try {
    const picked = await invoke('workspace_choose')
    if (!picked) return
    await switchWorkspace(MODE_FOLDER, picked.root)
  } catch (error) {
    workspaceError.value = t('settings.workspace.chooseFailed', {
      message: error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error ?? ''),
    })
  } finally {
    // 成功分支会 reload，走不到这里；取消选择器与失败都得把按钮放开
    workspaceBusy.value = false
    workspaceAction.value = ''
  }
}

/** 切回虚拟工作区 */
async function useVirtualWorkspace() {
  if (workspaceBusy.value || !workspaceIsFolder.value) return
  workspaceBusy.value = true
  workspaceAction.value = 'virtual'
  workspaceError.value = ''
  try {
    await switchWorkspace(MODE_VIRTUAL)
  } finally {
    // 成功会 reload；走到这里说明没切成功，别把按钮永远留在「切换中」
    workspaceBusy.value = false
    workspaceAction.value = ''
  }
}

// ------------------------------------------------------------ 浏览器插件
// 安装包那几个常量（版本 / 文件名 / 下载地址 / AMO 与 Edge 商店地址）都在上面 import 的
// `services/extensionPackage.js` 里，**本组件不再存一份**：齿轮菜单里那两颗一次性动作
// （安装为应用 / 拿插件）也要用同一份数据，两处各存一份必然在发新版时漏改一处。
// 「这台机器该走哪条路」同理 —— `EXTENSION_ROUTES` 就是那份判据（见下面两颗按钮的注释）。

// 扩展对外只暴露 _execute_action 这类内部 id，显示名只能在这边维护
const EXTENSION_COMMAND_KEYS = {
  _execute_action: 'settings.extension.commandParsePage',
}

const { extensionInfo, checking: extensionChecking, refresh: refreshExtension, setExtensionConfig } =
  useCompanionBridge()

// 原来这里还有 `extensionDotClass` / `extensionStatusLabel` 两个给「安装状态」那一行用的
// computed（检测中 / 已安装并运行中 / 未检测到），2026-11-10 那一行删掉后它们没有消费者了，
// 一并撤掉；`settings.extension.status*` / `recheck` / `checking*` 那几条文案同日也从 i18n 删了
// （只剩 `recheckTitle` 给行尾那颗刷新按钮当 title / aria-label）。

// ------------------------------------------------------------ 按浏览器推荐安装路径
// 判据是 platform.js 的 BROWSER / BROWSER_PLATFORM，**只用来挑文案与摆哪颗按钮**（Safari 那一档
// 一条路都没有，iOS 上所有浏览器都归它；认不出时 fail-open，桌面端两条路都摆）。
// 变体与 key 表在 `installGuides.js` —— 通知与这一行说明共用同一批句子，别在这里再写一遍。
const extensionHintKey = computed(
  () => EXTENSION_HINT_KEYS[extensionVariant()] ?? EXTENSION_HINT_KEYS.chromium,
)

/**
 * 两颗按钮的显隐 —— 判据是 `EXTENSION_ROUTES`（`services/extensionPackage.js`），
 * 与齿轮菜单里那两颗一次性动作**同一份**。Firefox 版装不进 Chromium（反之亦然），所以正常
 * 情况下只会给出一颗；**认不出浏览器时两条都摆**（fail-open：猜错让人看不到入口最糟）。
 * 手动加载这条路对移动端与 Safari 都不成立：前者装的不是扩展，后者根本不吃这一套。
 */
const showFirefoxInstall = computed(() => EXTENSION_ROUTES.value.includes('firefox'))
const showManualInstall = computed(() => EXTENSION_ROUTES.value.includes('manual'))

const showEdgeInstall = computed(
  () => !isMobileBrowser && BROWSER === 'edge' && EDGE_EXTENSION_URL !== '',
)

/**
 * 装着的版本比本站发的旧时提示一行。
 *
 * 「装的是哪一版」不用猜 —— `cp-info` 回包里有 `info.version`（见 useCompanionBridge）。
 * **只拿版本号报「有新版本」，不用它判能力**：能力走 `capabilities` 协商（HANDOFF 13.1），
 * 那笔账按版本号比大小一记错方向就反了。
 */
const extensionVersion = computed(() => extensionInfo.value?.version ?? '')

const extensionOutdated = computed(() => isExtensionOutdated(extensionVersion.value))

/**
 * 「装包 / 换包」那一行的显隐与文案：**装旧版和没装共用同一行**，只是口径换成更新。
 *
 * 为什么要共用：这一行是拿包的**唯一入口**（另两颗按钮只是外链商店）。Chromium 没有商店
 * 可点，装了旧版的人如果看不到这颗下载按钮，就只剩下面一句「本站最新是 vX」可读 ——
 * 知道该更新、却没有任何途径拿到新包。
 *
 * 反过来，「装好了且是最新版」时这一行必须收起来：摆着安装说明只会让人以为哪里没配对。
 *
 * 这一行也是本栏**唯一**随插件状态伸缩的行 —— 原来那颗「安装引导」按钮 2026-11-10 删掉后，
 * 只剩它和它的右端那颗刷新（刷新跟着一起收，见模板里的说明）。
 */
const extensionActionVisible = computed(() => !extensionInfo.value || extensionOutdated.value)

const extensionActionLabelKey = computed(() =>
  extensionOutdated.value ? 'settings.extension.update.label' : 'settings.extension.download.label',
)

const extensionActionHintKey = computed(() =>
  extensionOutdated.value ? extensionUpdateHintKey() : extensionHintKey.value,
)

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

/**
 * 键位为空时的两句解释（模板里二选一）。
 *
 * **空键位不是故障**，是 Chrome 的常态：manifest 的 suggested_key 只在**安装插件那一刻**
 * 绑定一次，那一刻被别的扩展占着（或用户清掉过）就再也不自动绑，插件回给我们的是空串 ——
 * 此时正确做法是把「为什么没有 + 去哪儿绑」讲清楚，而不是让界面空着/只留一个「未设置」
 * 让人以为站点读不到。（2026-10-12 实测：用另一个扩展占住 Ctrl+Shift+U，
 * Chrome 会让两边都留空，chrome://extensions/shortcuts 上两行都摆着「输入快捷键」的空框。）
 */
const extensionShortcutsUnassigned = computed(
  () => extensionShortcuts.value.length > 0 && extensionShortcuts.value.every((c) => !c.keys),
)
const extensionShortcutsEmpty = computed(() => extensionShortcuts.value.length === 0)

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

/**
 * 快捷键在浏览器里的管理页地址。两家的页面不一样，得跟着 BROWSER 走：
 * - Chrome / Edge：`chrome://extensions/shortcuts`；
 * - Firefox 那个地址**不存在**，快捷键在「附加组件管理器」里管
 *   （about:addons → 右上角齿轮 → 管理扩展快捷键）。
 * 网页打不开这两种 about/chrome 页面，所以只能把地址复制给用户，让他自己去地址栏粘贴。
 */
const SHORTCUTS_URL = BROWSER === 'firefox' ? 'about:addons' : 'chrome://extensions/shortcuts'
const shortcutsSuffixKey = computed(() =>
  BROWSER === 'firefox'
    ? 'settings.extension.shortcutsManagedSuffixFx'
    : 'settings.extension.shortcutsManagedSuffix',
)
const shortcutsTitleKey = computed(() =>
  BROWSER === 'firefox'
    ? 'settings.extension.shortcutsTitleFx'
    : 'settings.extension.shortcutsTitle',
)

async function copyShortcutsUrl() {
  try {
    await navigator.clipboard.writeText(SHORTCUTS_URL)
    shortcutsCopied.value = true
    window.clearTimeout(copyTimer)
    copyTimer = window.setTimeout(() => {
      shortcutsCopied.value = false
    }, 2000)
  } catch {
    /* 非安全上下文或用户未授权：保持原样，提示里已写明地址 */
  }
}

// 插件可能在页面打开之后才装上或才被重载，所以每次切到「浏览器插件」那一栏都重探一次
// 另外每次换分类都把目录里那一项滚进可视区（窄屏上目录是横滚的一行，见 revealNavItem）
watch(activeSection, (section) => {
  if (section === 'extension') refreshExtension()
  nextTick(revealNavItem)
  // 到了新的一页再把它的左右两侧挂上（滑动途中挂整页会在过渡里卡一下，见 mountNeighbours）
  nextTick(mountNeighbours)
})

// 侧栏设置菜单选中某分类后，把设置视图定位到那一类。菜单在 SidebarSwitcher，落点经
// editorViews.settingsSectionEntry 传进来，这里只是消费方；读完即复位，别让旧选择滞留。
watch(settingsSectionEntry, (sectionId) => {
  if (!sectionId) return
  if (visibleSections.value.some((section) => section.id === sectionId)) {
    activeSection.value = sectionId
  }
  settingsSectionEntry.value = null
})

onBeforeUnmount(() => {
  window.clearTimeout(copyTimer)
  window.clearTimeout(appsCopyTimer)
})

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
const autoPreload = usePersistentRef(AUTO_PRELOAD_KEY, ['cpp'])

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
  // 就绪时只留一句状态词：状态由行首绿点表达，文字只补耗时或一句「已就绪」。
  // 没耗时（比如这次是上次会话就装好的）就落到 ready 那一句，避免行里只剩一颗孤零零的绿点。
  if (entry.state.value === 'ready') {
    return entry.elapsedMs.value
      ? t('runtime.readyWithTime', { seconds: (entry.elapsedMs.value / 1000).toFixed(1) })
      : t('runtime.ready')
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
/** 正在清缓存的目标 id：确认之后弹窗就收了，这一行得自己转圈，别让人对着
 *  一颗还能再点的「卸载」等（删 76MB 缓存不是一瞬间的事）。 */
const uninstallingId = ref('')

function requestUninstall(entry) {
  if (downloadingAny.value || uninstallingId.value || entry.state.value !== 'ready') return
  pendingUninstall.value = entry
}

function cancelUninstall() {
  pendingUninstall.value = null
}

/**
 * 装成 app 时的**系统返回** = 取消卸载（2026-10-30）：与点遮罩、Esc 同一个出口。
 * 它**绝不能等于确认** —— 删掉的是几十 MB 的运行时缓存，重新下要等。
 */
const stopBackUninstall = watchBackLayer(() => Boolean(pendingUninstall.value), cancelUninstall)
onBeforeUnmount(() => stopBackUninstall())

/**
 * 真卸载。先从服务层清缓存 / 内存（失败也不报错，见 uninstallRuntime），
 * 再把面板状态打回「未下载」——标记、用时、失败原因一并复位，
 * 之后 reconcile() 也会以探针为准（SW 控制时只看 Cache Storage，不会残留判回已就绪）。
 */
async function confirmUninstall() {
  const entry = pendingUninstall.value
  pendingUninstall.value = null
  if (!entry) return
  // 倒计时同样不是 RUNTIMES 那一套：没有资产可删，卸的是入口与计时现场
  if (entry.id === COUNTDOWN_UNINSTALL_TARGET.id) {
    uninstallCountdown()
    // 与抽题那一支同一个理由：「卸载」是在说「别留在这台设备」，「默认安装」是在说
    // 「每次启动装回来」，两个意图直接冲突。留着开关的话下次打开站点它又被装回去。
    if (countdownAutoInstall.value) countdownAutoInstall.value = false
    return
  }
  if (uninstallingId.value) return
  uninstallingId.value = entry.id
  try {
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
  } finally {
    uninstallingId.value = ''
  }
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
    // 同运行环境行：就绪由绿点表达，这里补一句耗时；没耗时就落一句「已就绪」，
    // 避免行里只剩一颗孤零零的绿点
    return cfElapsedMs.value
      ? t('runtime.readyWithTime', { seconds: (cfElapsedMs.value / 1000).toFixed(1) })
      : t('runtime.ready')
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
  if (cfBusy.value || uninstallingId.value || !cfReady.value) return
  pendingUninstall.value = CF_UNINSTALL_TARGET
}

// ------------------------------------------------------------ 倒计时（内置组件）
// 它没有下载过程、也没有缓存：「安装」就是让侧栏「组件 › 工具」里那一格重新出现。
// 卸载走同一颗确认弹窗 —— 卸载会连同正在进行的计时一起清掉，值得先说一句。
const COUNTDOWN_UNINSTALL_TARGET = {
  id: 'countdown',
  titleKey: 'countdown.title',
  uninstallTitleKey: 'countdown.module.uninstallTitle',
  uninstallHintKey: 'countdown.module.uninstallHint',
}

const countdownInstalled = computed(() => countdown.installed)

const countdownDotClass = computed(() => (countdownInstalled.value ? 'is-ok' : 'is-idle'))

// 已安装时落一句「已就绪」（状态点已表达状态，这里补一句，避免行里只剩一颗孤零零的绿点）
const countdownHint = computed(() =>
  countdownInstalled.value ? t('runtime.ready') : t('countdown.module.idleHint'),
)

function requestCountdownUninstall() {
  if (!countdownInstalled.value) return
  pendingUninstall.value = COUNTDOWN_UNINSTALL_TARGET
}

/**
 * 倒计时的「默认安装」开关（2026-10-25）。与 cfAutoInstall 同形：这里是**唯一的写入口**，
 * 启动时由 main.js 调 readCountdownAutoInstall() 读同一个键执行；两处共用
 * COUNTDOWN_AUTO_INSTALL_KEY，不各写一份字面量。
 * 缺省 true —— 这个组件本来就默认装着，新增这个开关不该改变任何人的现状。
 */
const countdownAutoInstall = usePersistentRef(COUNTDOWN_AUTO_INSTALL_KEY, true)

function toggleCountdownAutoInstall() {
  countdownAutoInstall.value = !countdownAutoInstall.value
  // 从关到开、而本机确实卸过：立刻装回来（入口就在下一秒的「组件 › 工具」里），
  // 不必等下次启动 —— 与抽题那颗「开了就补装」同形。
  if (countdownAutoInstall.value && !countdown.installed) installCountdown()
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
})

// 每次切到设置视图都重新核对缓存，别一直显示上次打开时的旧结论；
// 用户不点下载直接跑代码、运行时其实已落缓存的情况，也是在这一刻被补成「已就绪」。
watch(
  () => props.active,
  (active) => {
    if (!active) return
    // 老账号的存档可能还是随手填的大小写：这里正要显示账号名，顺手核对一次（一个会话只问一次）
    void syncAccountHandleCase()
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
  const next = { ...props.settings, [key]: value }
  // 语义分析依附于悬停：悬停关着时它没有任何出口，打开它时顺手把总开关也打开
  if (key === 'semanticHover' && value) next.hover = true
  emit('update:settings', next)
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
  // 外观栏那三行「外壳」偏好不是 editorSettings 的键（见 SHELL_ROWS），行尾那行键名没有意义
  if (row.external) return false
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

/**
 * 外观栏混着两类行：一类是 editorSettings 的键（主题、代码图片那三条），另一类是各有出口的
 * 「外壳」偏好（缩放走 App 的 cp.uiScale、语言由 i18n 自己持久化、侧边栏位置走 toggle-layout）。
 * 下面三个函数把这两类的差异收在一处，模板那个循环才不必为外壳行再抄一遍行模板。
 */
/** 行的当前值：外壳行读自己的出口，其余行读 editorSettings。
 *  ⚠️ 判据必须是 `typeof === 'function'`，字段名也不能叫 `valueOf` —— 那三个名字在
 *  Object.prototype 上都有同名方法，任何普通对象都会「看起来有」，于是外壳行的取值器会被
 *  当成「这行是外壳行、但它返回整个 row 对象」，下拉直接渲染成空（2026-10-12 实测踩到）。 */
function rowValue(row) {
  return typeof row.readValue === 'function' ? row.readValue() : props.settings[row.key]
}
/** 选中新值：外壳行走自己的出口，其余行回写 editorSettings */
function rowSelect(row, raw) {
  if (row.onSelect) row.onSelect(raw)
  else set(row.key, coerce(row, raw))
}
/** 选项的显示名：只有缩放档要现算（「110%」），其余行的 options 自带 label / labelKey */
function rowOptionLabel(row, item) {
  if (row.optionLabel) return row.optionLabel(item)
  return item.labelKey ? t(item.labelKey, item.labelParams) : item.label
}

/** 一键切换行的「当前档」：按 rowValue 在 options 里反查，找不到（值异常）退回第一档 */
function currentOption(row) {
  return row.options.find((item) => item.id === rowValue(row)) ?? row.options[0]
}

/** 一键切换要翻到的「另一档」id：不是当前档的那个；只有两档，取第一个不等即可 */
function otherOptionId(row) {
  const current = rowValue(row)
  return (row.options.find((item) => item.id !== current) ?? row.options[0]).id
}

/** 缩放档位的显示名：就是百分比本身，不标默认档 */
function scaleLabel(scale) {
  return `${Math.round(scale * 100)}%`
}

function limitLabel(ms) {
  return `${ms / 1000} s`
}

function setTimeLimit(event) {
  emit('update:time-limit', Number(event.target.value))
}

function memoryLimitLabel(bytes) {
  return `${bytes / 1024 / 1024} MB`
}

function setMemoryLimit(event) {
  emit('update:memory-limit', Number(event.target.value))
}

/** 输出比对方式：整份偏好只有一个键，直接发 id（校验在 App 落盘那一层 + checkers 注册表） */
function setChecker(event) {
  emit('update:checker', String(event.target.value))
}

// ------------------------------------------------------------ 云端同步
/**
 * 账号 / 令牌 / 验证码那一套**会话状态与动作都在 `services/cloudSession.js`**，这里只是把它们
 * 接到模板用的名字上 —— 逻辑一处都别在本文件重写。
 *
 * 搬出去的原因（2026-10-11）：齿轮菜单要在自己的二级菜单里直接填用户名、取码、验证，
 * 面板与菜单必须操作**同一份** ref —— 否则一边取了码另一边看不见、一边在忙另一边按钮还亮着。
 * 因此那边是单一真相，这边只剩渲染。
 */

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

/** 公开取回地址：`<站点根>/<handle>`。用 location.origin 拼（本地开发也显示 localhost，
   不硬编码线上域名），未绑定时为空串，模板据此不渲染地址栏。 */
const cloudPublicUrl = computed(() =>
  cloudAccount.value.handle ? `${window.location.origin}/${cloudAccount.value.handle}` : '',
)

/** 地址栏里「站点根」那半段（不带 handle 后缀），后缀单独高亮，所以拆开给模板 */
const cloudPublicOrigin = computed(() => window.location.origin)

const cloudUrlCopied = ref(false)
let cloudUrlCopyTimer = 0

async function copyCloudPublicUrl() {
  try {
    await navigator.clipboard.writeText(cloudPublicUrl.value)
    cloudUrlCopied.value = true
    window.clearTimeout(cloudUrlCopyTimer)
    cloudUrlCopyTimer = window.setTimeout(() => {
      cloudUrlCopied.value = false
    }, 2000)
  } catch {
    /* 非安全上下文或未授权：保持原样，地址本身可见可手选 */
  }
}

/**
 * 验证步骤第一步里「Codeforces 个人资料」那半句是个链接（指向 Social 设置页）。
 * 整句留在一个词条里、用 `{link}` 占位再在这里劈开，而不是拆成 before/link/after 三个键：
 * 拆开就看不见语序了 —— 英文里这个短句落在句子中间，三段式很容易对不上位。
 * （`t()` 不带 params 时原样返回，`{link}` 不会被插值吃掉。）
 */
const cloudCodeStep1 = computed(() => splitLinkText('settings.cloud.codeStep1'))

/**
 * 代填那颗按钮的文案与 title：链路版（扩展能把「保存完」报回来、且这一轮是登录）与
 * 老版本各一套，判据只有 `fillCodeChained` 一份（见 cloudSession）。
 * 面板与菜单都要用，所以不各自拼 `t()` 的三元 —— 那两处很容易改一处漏一处。
 */
const cloudFillLabel = computed(() =>
  t(
    cloudFilling.value
      ? fillCodeChained.value
        ? 'settings.cloud.fillCodeChainBusy'
        : 'settings.cloud.fillCodeBusy'
      : fillCodeChained.value
        ? 'settings.cloud.fillCodeChain'
        : 'settings.cloud.fillCode',
  ),
)
const cloudFillTitle = computed(() =>
  t(fillCodeChained.value ? 'settings.cloud.fillCodeChainTitle' : 'settings.cloud.fillCodeTitle'),
)

/**
 * 云端按钮各自的等待：只让点下去的那颗转圈。
 * 全局的 `cloudBusy` 只知道「有事在跑」，分不出是哪一件；等待指示要贴着被点的按钮，
 * 所以在这里记一份动作名（与齿轮菜单里那份同名同用，互不影响）。
 */
const cloudPending = ref('')

async function runCloud(action, fn) {
  if (cloudPending.value) return
  cloudPending.value = action
  try {
    await fn()
  } finally {
    cloudPending.value = ''
  }
}

/**
 * 用户名输入框的回车。中文输入法里「回车」常常是「确认候选词」而不是「提交」，
 * 组字期间敲下去会把半截拼音直接拿去登录 —— 和全局快捷键同一条规矩（见 App.vue 的 onKeydown）：
 * 组字中一律不当成提交。keyCode 229 是部分输入法在组字时不报 isComposing 的补漏。
 */
function onCloudHandleEnter(event) {
  if (event.isComposing || event.keyCode === 229) return
  event.preventDefault()
  runCloud('login', loginCloud)
}

// 「上传本机设置」「下载到本机」「解绑」三个动作都在 `services/cloudSession.js`
// （菜单里的云端同步表单要用同一份，见那里），这里只消费、不重写一遍。

/**
 * 把一份云端配置落到本机、然后刷新页面。返回是否真的应用了（写进去 0 条就是没有）。
 *
 * 刷新的理由见 downloadCloudProfile 上面那段；刷新前先 flush，把编辑器里还没落盘的
 * 正文写回 VFS —— 否则这一步会丢掉用户正在编辑的内容。
 *
 * 「登录成功」与「点下载」共用这里：两者的语义都是「这台设备改用云端那一套设置」。
 * 注意方向始终是**只下不传**：这个函数不碰云端一个字节。
 *
 * 真的落下去之后顺手办两件事，都必须落在那次 reload 之前（晚了就写不进去）：
 * - 把 /<handle> 写进地址栏（见 writeCloudEntryPath）：既然这台设备现在用的就是这位的配置，
 *   地址栏就该是这条可收藏、可分享的链接；
 * - 把「本机在跟谁 + 套用的是哪一版」记进 `cp.cloudActive`（见 cloudEntry.js 的
 *   writeActiveProfile）：下次打开站点直接对齐这一套，不必再点一次。
 */
async function adoptCloudProfile(data, handle, updatedAt = '') {
  const applied = await adoptCloud(data, handle, updatedAt)
  if (applied) cloudNotice.value = t('settings.cloud.downloaded')
  return applied
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
 * 只填用户名就把一份云端配置取回来（2026-10-06）：不发验证码、不认领用户名。
 *
 * 为什么要有它：`GET /api/config/<handle>` 本来就是公开接口（见 services/cloudProfile.js），
 * 读一份配置根本不需要证明身份 —— 可「下载到本机」那颗按钮挂在 cloudAccount 上，而
 * cloudAccount 只能由「登录」建立，于是「只想拿一份公开配置」被迫走完取码 → 改 Codeforces
 * 资料的 Last name → 验证那一圈。装成 Web App 之后更别扭：地址栏那条 `/<handle>` 的路
 * 恰恰是「只填用户名就取回」，但安装版窗口没有地址栏，走不了。
 *
 * 实现上直接复用地址栏那条路：把用户名交给 cloudApplyHandle，后面的拉取、确认、
 * 覆盖本机、刷新全由同一个弹窗与 confirmCloudApply 承担。因此也**不写**
 * cp.cloudAccount / cp.cloudToken —— 理由与那边一致（公开副本不代表身份，见
 * confirmCloudApply 上面的注释）。
 * （confirmCloudApply 里顺带调用的 clearPendingCloudHandle / markCloudEntryHandled 在这里
 *   是空转：这两个按钮路径上没有地址栏带来的 handle，而标记只对 `/<handle>` 那个历史条目
 *   有意义。）
 */
function importCloudByHandle() {
  if (cloudBusy.value) return
  const target = cloudHandleInput.value.trim()
  clearCloudFeedback()
  if (!target) {
    cloudError.value = t('settings.cloud.errorHandle')
    return
  }
  cloudApplyHandle.value = target
}

/**
 * 套用地址里带来的那份云端配置。
 *
 * 走的是「下载到本机」同一条路（fetchCloudProfile → adoptCloudProfile → 刷新），
 * 但**不写 cp.cloudAccount / cp.cloudToken**：链接是公开的，谁都能构造一条指向别人的，
 * 套用它不该把这台设备绑到那个用户名上 —— 那会凭空多出「上传本机设置」与「解绑」两个
 * 入口，而它们本来只该属于账号的主人。
 *
 * 「绑定」与「本机在跟谁」是两件事：这一步会记下 `cp.cloudActive`（见 adoptCloudProfile）——
 * 用户点了套用就等于认下了这套配置，下次打开站点接着用它；但那不等于绑定，仍然没有
 * 上传 / 解绑两个入口。想不再跟着它，解绑不行（那是账号的事），重新导入 / 登录另一位即可。
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
  if (!(await adoptCloudProfile(result.data, handle, result.updatedAt ?? ''))) {
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
 * 解绑 / 应用云端配置这两张确认卡同样接上返回键（2026-10-30）：一律落到各自的取消，
 * 而且走的是**弹窗自己的**取消函数 —— `cancelCloudApply` 里那两句 `clearPendingCloudHandle`
 * / `markCloudEntryHandled` 不能绕过，否则这条链接带来的询问会在下次刷新时又冒一遍。
 */
const stopBackUnbind = watchBackLayer(() => pendingUnbind.value, cancelUnbind)
const stopBackCloudApply = watchBackLayer(() => Boolean(cloudApplyHandle.value), cancelCloudApply)
onBeforeUnmount(() => {
  stopBackUnbind()
  stopBackCloudApply()
})

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
  unbindCloud()
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
  <div
    ref="viewEl"
    class="settings-view"
    role="region"
    :aria-label="t('settings.ariaLabel')"
    @pointerdown="onSwipePointerDown"
    @click.capture="onSwipeClickCapture"
  >
    <div class="settings-view__inner">
      <!-- 目录：点哪一项，右边就只渲染那一组设置（原来是四段纵向平铺） -->
      <nav ref="navEl" class="settings-nav" :aria-label="t('settings.navAriaLabel')">
        <button
          v-for="section in visibleSections"
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

      <!-- 设置正文：卡片都挂在这一层里。危险区域要能与主体卡片并排成两张卡，
           所以不能把卡片直接放在 inner 下。
           **外层 `.settings-panes` 是「取景框」**：它不动、只负责把外面裁掉（邻页常驻在
           两侧，不裁会漏到内容盒外面去），宽度、两栏时那一栏的身份也归它。里层
           `.settings-content` 才是横滑翻页的「整排」：**只有它这一层在动** —— 跟手、回弹、
           翻页全是它的内联 transform（`applyTrack` 直写，不经过 Vue）。每一页自己固定停在
           「绝对下标 × 一页宽」的轨道格上，切页时那一行不动。裁切必须挂在不动的取景框上，
           挂到会动的里层就等于把滑进来的那一页整片裁没了。
           这一层故意**没有 `:style`**：transform / 过渡 / 撑高全归 JS，Vue 碰不到。 -->
      <div class="settings-panes">
      <div
        ref="contentEl"
        class="settings-content"
        :class="{ 'is-swiping': isSwiping, 'is-settling': isSettling }"
        @transitionend="onContentTransitionEnd"
      >

      <!-- 每一类是一「页」：`paneProps` 给它位置与「是不是当前页」，
           窄屏横滑时左右两页跟着一起走（见脚本的「触屏横滑换分类」）。 -->
      <!-- 工作区（仅桌面端）：显示当前工作区，提供「打开本机文件夹」与「切回虚拟工作区」。
           切换会重新加载界面（见 services/vfs/workspaceMode.js），所以这里不做热切换。 -->
      <section
        v-if="paneRendered('workspace')"
        v-bind="paneProps('workspace')"
        class="setting-group"
      >
        <p class="setting-group__title">{{ t('settings.section.workspace') }}</p>
        <p class="setting-group__note">{{ t('settings.workspace.note') }}</p>

        <div class="setting-row setting-row--action">
          <span class="setting-row__main">
            <span class="setting-row__head">
              <span class="setting-row__label">{{ t('settings.workspace.current') }}</span>
            </span>
            <span class="setting-row__hint">
              {{ workspaceIsFolder ? t('settings.workspace.modeFolder') : t('settings.workspace.modeVirtual') }}
            </span>
          </span>
        </div>

        <div v-if="workspaceIsFolder" class="setting-row setting-row--action">
          <span class="setting-row__main">
            <span class="setting-row__head">
              <span class="setting-row__label">{{ t('settings.workspace.rootLabel') }}</span>
            </span>
            <span class="setting-row__hint">{{ workspaceRoot || '—' }}</span>
          </span>
        </div>

        <div class="setting-row setting-row--action">
          <span class="setting-row__main">
            <span class="setting-row__head">
              <span class="setting-row__label">{{ t('settings.workspace.flow') }}</span>
            </span>
            <span class="setting-row__hint">{{ t('settings.workspace.note2') }}</span>
          </span>
          <span class="setting-row__control">
            <button
              class="download-button"
              :disabled="workspaceBusy"
              :title="t('settings.workspace.chooseTitle')"
              @click="chooseWorkspaceFolder"
            >
              <LoadingSpinner v-if="workspaceAction === 'choose'" :size="12" />
              <AppIcon v-else name="folder" :size="13" />
              <span>{{ workspaceBusy ? t('settings.workspace.switching') : t('settings.workspace.choose') }}</span>
            </button>
          </span>
        </div>

        <div v-if="workspaceIsFolder" class="setting-row setting-row--action">
          <span class="setting-row__main">
            <span class="setting-row__head">
              <span class="setting-row__label">{{ t('settings.workspace.back') }}</span>
            </span>
            <span class="setting-row__hint">{{ t('settings.workspace.backHint') }}</span>
          </span>
          <span class="setting-row__control">
            <button
              class="download-button"
              :disabled="workspaceBusy"
              :title="t('settings.workspace.backTitle')"
              @click="useVirtualWorkspace"
            >
              <LoadingSpinner v-if="workspaceAction === 'virtual'" :size="12" />
              <AppIcon v-else name="reset" :size="13" />
              <span>{{ t('settings.workspace.back') }}</span>
            </button>
          </span>
        </div>

        <p v-if="workspaceError" class="setting-group__note setting-group__note--warn">
          {{ workspaceError }}
        </p>
      </section>

      <!-- 外观：主题、三条界面偏好（缩放 / 语言 / 侧边栏位置），末尾是「代码图片」那三条。
           除三条界面偏好各有出口外，其余行都是 editorSettings 的键，与编辑器组同源。
           字体大小已挪去编辑器组。 -->
      <section
        v-if="paneRendered('appearance')"
        v-bind="paneProps('appearance')"
        class="setting-group"
      >
        <p class="setting-group__title">{{ t('settings.section.appearance') }}</p>

        <!-- 行渲染与「编辑器」那一栏同源（都在 editorSettings 上），只是这里多了三条「外壳」
             偏好与末尾的「代码图片」组 —— 后者靠首行的 groupTitleKey 在前面插一道小标题，
             所有行共用一个循环（顺序见 APPEARANCE_ROWS；有条件隐藏的行见 appearanceRows） -->
        <template v-for="row in appearanceRows" :key="row.key">
          <p v-if="row.groupTitleKey" class="setting-subtitle">{{ t(row.groupTitleKey) }}</p>

          <!-- 主题色卡与两段切换这两行必须是 div 而不是 label：label 会把第一个可标记后代
               （第一张卡 / 第一颗段钮）认成自己的控件，点标题空白处等于点了它 -->
          <component
            :is="row.control === 'themeGrid' || row.control === 'toggle' ? 'div' : 'label'"
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
                :value="rowValue(row)"
                @change="setNumber(row, $event)"
              />

              <span v-else-if="row.control === 'themeGrid'" class="theme-groups">
                <span v-for="group in themeGroups" :key="group.scheme" class="theme-group">
                  <button
                    v-for="item in group.items"
                    :key="item.id"
                    type="button"
                    class="theme-card"
                    :class="{ 'is-on': rowValue(row) === item.id }"
                    :aria-pressed="rowValue(row) === item.id"
                    :title="t(item.labelKey)"
                    @click="rowSelect(row, item.id)"
                  >
                    <!-- 预览块的四格颜色从样式表读（见 swatchFor），改 CSS 就自动跟着变 -->
                    <span class="theme-card__preview" :style="{ background: swatchFor(item)[0] }">
                      <span class="theme-card__panel" :style="{ background: swatchFor(item)[1] }"></span>
                      <span class="theme-card__accent" :style="{ background: swatchFor(item)[2] }"></span>
                      <span class="theme-card__line" :style="{ background: swatchFor(item)[3] }"></span>
                    </span>
                    <span class="theme-card__name">{{ t(item.labelKey) }}</span>
                  </button>
                </span>
              </span>

              <span v-else-if="row.control === 'select'" class="select">
                <select :value="rowValue(row)" @change="rowSelect(row, $event.target.value)">
                  <option v-for="item in row.options" :key="item.id" :value="item.id">
                    {{ rowOptionLabel(row, item) }}
                  </option>
                </select>
                <AppIcon name="chevron" :size="12" class="select__chevron" />
              </span>

              <!-- 两档一键切换（侧边栏位置 / 窄屏折叠方向）：一颗钮显示当前档（如「左侧」），
                   点一下翻到另一档，没有下拉这一层。 -->
              <button
                v-else-if="row.control === 'toggle'"
                type="button"
                class="toggle-seg"
                :aria-label="`${t(row.labelKey)}：${rowOptionLabel(row, currentOption(row))}`"
                @click="rowSelect(row, otherOptionId(row))"
              >
                {{ rowOptionLabel(row, currentOption(row)) }}
              </button>

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
          </component>
        </template>
      </section>

      <section
        v-if="paneRendered('editor')"
        v-bind="paneProps('editor')"
        class="setting-group"
      >
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
      <section
        v-if="paneRendered('templates')"
        v-bind="paneProps('templates')"
        class="setting-group"
      >
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
          class="setting-row setting-row--template setting-row--template-field"
          :class="{ 'is-modified': isTemplateModified(id) }"
        >
          <span class="setting-row__head">
            <!-- 语言名 + 箭头是一颗按钮：整块都能点，热区比只点箭头大得多。
                 「恢复默认」留在外面 —— 收起时也该能一键还原；但它**只在这行改过时才画**
                 （2026-11-10 方案一：没改的几行右侧直接留白，左侧蓝条已替「已修改」说话）。 -->
            <button
              type="button"
              class="setting-row__fold-toggle"
              :aria-expanded="isTemplateOpen(id)"
              :aria-controls="`template-field-${id}`"
              @click="toggleTemplate(id)"
            >
              <span class="setting-row__chevron">
                <AppIcon name="chevron" :size="16" :stroke-width="2" />
              </span>
              <span class="setting-row__label">{{ t(TEMPLATE_LABEL_KEYS[id]) }}</span>
            </button>
            <button
              v-if="isTemplateModified(id)"
              type="button"
              class="ghost-button setting-row__restore"
              :title="t('settings.templates.restore.title')"
              @click="resetTemplate(id)"
            >
              <AppIcon name="reset" :size="12" />
              <span>{{ t('settings.templates.restore.label') }}</span>
            </button>
          </span>
          <!-- 折叠用 grid 行高 `1fr ↔ 0fr`（与 TestCaseCard 的 .card__fold 同一手）：
               这是纯 CSS 里唯一能「过渡到内容高度」的写法，不用猜一个 max-height 上限。
               收起后 `visibility: hidden` 把里面的输入框移出 Tab 序 —— 它仍在 DOM 里，
               只是被 0 高度的行裁掉，`display: none` 会让展开那一下没有过渡。 -->
          <div
            :id="`template-field-${id}`"
            class="setting-row__fold"
            :class="{ 'is-open': isTemplateOpen(id) }"
          >
            <div class="setting-row__fold-inner">
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
          </div>
        </div>
      </section>

      <section
        v-if="paneRendered('shortcuts')"
        v-bind="paneProps('shortcuts')"
        class="setting-group"
      >
        <p class="setting-group__title">{{ t('settings.section.shortcuts') }}</p>
        <p class="setting-group__note">
          {{ t('settings.shortcut.note') }}
        </p>

        <div
          v-for="action in settingsShortcutActions"
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
            <!-- 写死的键位（`fixed`）：只读徽标，不给录制框也不给清除钮。
                 目前没有走到这里的数据 —— 三条 `fixed` 都带 `hideInSettings`（整行不画），
                 留着这一支是为了「以后有写死但仍要露键位的动作」时不必回来改模板。 -->
            <kbd
              v-if="action.fixed"
              class="shortcut-key is-fixed"
              :title="t('settings.shortcut.fixedKey')"
            >
              {{ formatCombo(bindings[action.id]) }}
            </kbd>
            <HotkeyRecorder v-else :action-id="action.id" />
          </span>
        </div>

        <!-- 2026-11-10：原来这行是「恢复默认 + 把所有快捷键还原成初始设置」那一对标题与说明，
             用户要求只留按钮 —— 按钮上本来就写着「恢复默认」，左边再复述一遍标题、下面再解释
             一句「还原成初始设置」，等于同一件事说三遍。现在整行只剩一颗贴右的按钮。 -->
        <div class="setting-row setting-row--action setting-row--end">
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

      <section v-if="paneRendered('judge')" v-bind="paneProps('judge')" class="setting-group">
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

        <label class="setting-row setting-row--select">
          <span class="setting-row__main">
            <span class="setting-row__head">
              <span class="setting-row__label">{{ t('settings.judge.memoryLimit.label') }}</span>
            </span>
            <span class="setting-row__hint">{{ t('settings.judge.memoryLimit.hint') }}</span>
          </span>
          <span class="setting-row__control">
            <span class="select">
              <select :value="memoryLimit" @change="setMemoryLimit">
                <option v-for="bytes in MEMORY_LIMIT_OPTIONS" :key="bytes" :value="bytes">
                  {{ memoryLimitLabel(bytes) }}
                </option>
              </select>
              <AppIcon name="chevron" :size="12" class="select__chevron" />
            </span>
          </span>
        </label>

        <!-- 输出比对方式（2026-11-09 加）：AC / WA 的判定口径。摆在两条限制之后 ——
             时限 / 内存管「跑不跑得完」，这一条管「跑完了算不算对」，是同一件事的后半段。
             题目信息里显式指定过的（meta.checker）优先于这里，见 services/checkers.js。 -->
        <label class="setting-row setting-row--select">
          <span class="setting-row__main">
            <span class="setting-row__head">
              <span class="setting-row__label">{{ t('settings.judge.checker.label') }}</span>
            </span>
            <span class="setting-row__hint">{{ t('settings.judge.checker.hint') }}</span>
          </span>
          <span class="setting-row__control">
            <span class="select">
              <select :value="checker" @change="setChecker">
                <option v-for="item in CHECKERS" :key="item.id" :value="item.id">
                  {{ t(item.labelKey) }}
                </option>
              </select>
              <AppIcon name="chevron" :size="12" class="select__chevron" />
            </span>
          </span>
        </label>

        <!-- 差异染色开关（2026-11-09 加）：紧跟着上面那条「输出比对」—— 前者决定「怎么算对」，
             这一条决定「判错之后要不要把不同的字符染出来」。只关显示，不改判定：
             关掉时 TestCaseCard 的 diffMarks 直接返回 null，连 outputDiff 都不进。 -->
        <div class="setting-row setting-row--switch">
          <span class="setting-row__main">
            <span class="setting-row__head">
              <span class="setting-row__label">{{ t('settings.judge.diffHighlights.label') }}</span>
            </span>
            <span class="setting-row__hint">{{ t('settings.judge.diffHighlights.hint') }}</span>
          </span>
          <span class="setting-row__control">
            <button
              class="switch"
              :class="{ 'is-on': settings.diffHighlights }"
              role="switch"
              :aria-checked="settings.diffHighlights"
              :aria-label="t('settings.judge.diffHighlights.label')"
              @click="set('diffHighlights', !settings.diffHighlights)"
            >
              <span class="switch__thumb"></span>
            </button>
          </span>
        </div>

        <!-- 全部样例通过时的纸屑（2026-10-23 加，落点就在样例栏那块面板里）。摆在时限 / 内存 / 比对之后、
             引擎之前：它讲的是「评测结果怎么反馈」，与上面几条同属「这一次怎么判」。
             开关本体在 services/confetti.js，关掉后连那块 canvas 都不建。 -->
        <div class="setting-row setting-row--switch">
          <span class="setting-row__main">
            <span class="setting-row__head">
              <span class="setting-row__label">{{ t('settings.judge.celebration.label') }}</span>
            </span>
            <span class="setting-row__hint">{{ t('settings.judge.celebration.hint') }}</span>
          </span>
          <span class="setting-row__control">
            <button
              class="switch"
              :class="{ 'is-on': settings.celebration }"
              role="switch"
              :aria-checked="settings.celebration"
              :aria-label="t('settings.judge.celebration.label')"
              @click="set('celebration', !settings.celebration)"
            >
              <span class="switch__thumb"></span>
            </button>
          </span>
        </div>

        <!-- 关闭优化重跑比对（2026-11-01 加）。默认关：它要另开一颗宿主（+22 MiB）并对同一份
             代码多编一遍，而编译期那四条 UB 警告已经零成本地覆盖了它抓到的大半。
             关掉时 runner 的 crossCheckBest 第一行就返回，那颗宿主压根不会被建起来 ——
             所以这一行的代价是真的可省，不是「关了个显示」。 -->
        <div class="setting-row setting-row--switch">
          <span class="setting-row__main">
            <span class="setting-row__head">
              <span class="setting-row__label">{{ t('settings.judge.crossCheck.label') }}</span>
            </span>
            <span class="setting-row__hint">{{ t('settings.judge.crossCheck.hint') }}</span>
          </span>
          <span class="setting-row__control">
            <button
              class="switch"
              :class="{ 'is-on': settings.crossCheck }"
              role="switch"
              :aria-checked="settings.crossCheck"
              :aria-label="t('settings.judge.crossCheck.label')"
              @click="set('crossCheck', !settings.crossCheck)"
            >
              <span class="switch__thumb"></span>
            </button>
          </span>
        </div>

        <p class="setting-subtitle">{{ t('settings.judge.engines') }}</p>
        <EngineSettingsPanel
          :judge="judge"
          :connection="connection"
          @select-engine="emit('select-engine', $event)"
          @update-base="emit('update-base', $event)"
          @test-connection="emit('test-connection')"
        />
      </section>

      <!-- 应用：安装到设备，外加本地运行环境（工具链与题解渲染器的下载 / 卸载）。
           浏览器插件原本也挤在这一栏里，现已按内容独立成一个「浏览器插件」分类。 -->
      <section v-if="paneRendered('app')" v-bind="paneProps('app')" class="setting-group">
        <p class="setting-group__title">{{ t('settings.section.app') }}</p>
        <!-- 「基础设置」这一小节的内容**全部**是「装成应用」那几行（安装按钮 + 旁边的引导 /
             灰按钮的解释）。装好之后它们只剩「已安装」这一个事实可读，而那个事实别处已经说清了 ——
             齿轮菜单那两行直接消失（`canInstall` / `appInstalled`）、通知里也有一条 —— 再留两行
             点了没用的东西只是噪声，所以连小节标题一起收起（2026-11-10 用户要求）。
             判据用 `appIsInstalled`（`appinstalled` 事件与独立窗口写的是同一份模块级 ref，见
             `useInstallPrompt.js`）：装完那一刻界面自己就收起，卸掉后事件再来一次它自己又回来，
             不需要刷新。桌面端不受影响 —— 那台机器上 `appIsInstalled` 恒为假。 -->
        <p v-if="!appIsInstalled" class="setting-subtitle setting-subtitle--first">
          {{ t('settings.app.basics') }}
        </p>

        <div v-if="!appIsInstalled" class="setting-rows">
          <!-- 安装到设备是网页版独有的入口：桌面端本身就是个独立应用，没有「再装一次」
               这回事，也没有 beforeinstallprompt（见 HANDOFF 第 14 节第 5 条） -->
          <div v-if="!isDesktop" class="setting-row setting-row--action">
            <span class="setting-row__main">
              <span class="setting-row__head">
                <span class="setting-row__label">{{ t('settings.app.install.label') }}</span>
              </span>
              <!-- 状态词只说「这台浏览器支不支持把本站装成应用」；能不能一键装是按钮的事 -->
              <span class="app-status" :class="installSupported ? 'is-ok' : 'is-idle'">
                <span class="app-status__dot"></span>
                <span>{{ t(installStatusKey) }}</span>
              </span>
            </span>
            <span class="setting-row__control setting-row__control--pair">
              <!-- 引导：把这一栏的安装步骤改成通知再发一遍（`installGuides.js` 的 fireSectionGuide）。
                   与状态无关 —— 已经装好了也照样有话说，而且**不看「自动弹过」的记录**；
                   「有 API 却拿不到入口」那一格（见下面 installUnavailable）正是靠它才能变成通知，
                   那一格 2026-10-12 起已退出自动弹（见 installGuides.js 的 available），这里是它唯一的出口。
                   2026-11-10：原来它自成一行（左边一句「用通知再演示一遍安装步骤」），现在收回主按钮左边、
                   走幽灵样式 —— 一句话说明和一个次要动作不值得各占一行。 -->
              <button
                class="ghost-button"
                :title="t('settings.app.install.guide')"
                @click="fireSectionGuide('app')"
              >
                <span>{{ t('settings.app.install.guideButton') }}</span>
              </button>
              <button
                class="download-button is-primary"
                :disabled="!canInstall"
                :title="t('settings.app.install.title')"
                @click="install"
              >
                <AppIcon name="install" :size="15" />
                <span>{{ t(installButtonKey) }}</span>
              </button>
            </span>
          </div>

          <!-- 上面那颗按钮灰着、状态词却说「当前浏览器支持」时，补一句「为什么 + 去哪儿清」
               （见 installUnavailable）。正常能装、以及本来就不支持这两种情况下都不出现。 -->
          <div v-if="!isDesktop && installUnavailable" class="setting-row setting-row--action">
            <span class="setting-row__main">
              <span class="setting-row__hint">
                {{ t('settings.app.install.blockedPrefix') }}
                <code class="setting-code">{{ APPS_URL }}</code>
                {{ t('settings.app.install.blockedSuffix') }}
              </span>
            </span>
            <span class="setting-row__control">
              <button
                class="ghost-button"
                :class="{ 'is-copied': appsCopied }"
                :title="t('settings.app.install.copyAppsTitle')"
                @click="copyAppsUrl"
              >
                <AppIcon :name="appsCopied ? 'check' : 'copy'" :size="13" />
                <span>
                  {{ t(appsCopied ? 'settings.app.install.copied' : 'settings.app.install.copyApps') }}
                </span>
              </button>
            </span>
          </div>
        </div>

        <!-- 引擎没有可用的一键安装，但这个浏览器自己装得上（三星 / Firefox / Safari 系）：
             状态词只能说到「不支持一键安装」，剩下那半句「去哪儿装」在这里（见 installNoApiHintKey）。 -->
        <p v-if="!isDesktop && installNoApiHint" class="setting-group__note">
          {{ t(installNoApiHintKey) }}
        </p>

        <!-- 本地运行环境（C++ / Python / 题解渲染器）是网页版自托管的那套资产，全靠
             Cache Storage；桌面端的 webview 里没有 Cache Storage，改用系统 clang++ 直接跑，
             所以这一整块在桌面端收起（见 HANDOFF 第 14 节第 3、4 条）。
             装好之后上面「基础设置」整块收起（见那一块的条件），这一条就成了本栏第一小节，
             于是改用 `--first` 那档更小的上边距，免得分组标题下面空出一条大缝。
             2026-11-10：小节名从「本地运行环境」改成「编译器」，下面那句「在浏览器里直接编译
             运行，代码不出本机」删掉 —— 三行自己会说话（clang 23 / CPython 3.11 / 渲染器），
             不必再用一句话解释这一栏是干什么的。 -->
        <p
          v-if="!isDesktop"
          class="setting-subtitle"
          :class="{ 'setting-subtitle--first': appIsInstalled }"
        >
          {{ t('settings.section.runtime') }}
        </p>

        <div v-if="!isDesktop" class="runtime-list">
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
                class="download-button"
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
                :disabled="downloadingAny || !!uninstallingId"
                :title="t('runtime.uninstallActionTitle', { title: t(entry.titleKey) })"
                @click="requestUninstall(entry)"
              >
                <LoadingSpinner v-if="uninstallingId === entry.id" :size="12" />
                <AppIcon v-else name="trash" :size="13" />
                <span>{{ t('runtime.uninstall') }}</span>
              </button>
            </div>
          </div>
        </div>

        <p class="setting-subtitle">{{ t('cf.module.group') }}</p>

        <div class="runtime-list">
          <!-- Codeforces（2026-10-27 合并）：随机抽题与比赛在组件菜单里已是同一格，
               磁盘上也是**一份资产**（同一份题库、同一个 cfReady），设置这边同样只留一行 ——
               「下载」与「卸载」都挂在这一行。 -->
          <div class="runtime-row">
            <span class="runtime-row__icon is-codeforces">
              <AppIcon name="codeforces" :size="17" />
            </span>
            <span class="runtime-row__text">
              <span class="runtime-row__title">{{ t('cf.view.title') }}</span>
              <span class="runtime-row__hint">
                <span class="app-dot" :class="cfDotClass"></span>
                <span v-if="cfHint">{{ cfHint }}</span>
              </span>
            </span>
            <div class="runtime-row__actions">
              <!-- 与运行环境行同一套：未装 / 下载中是「下载（重试）」一颗，就绪后换成「卸载」一颗 -->
              <button
                v-if="!cfReady"
                class="download-button"
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
                :disabled="cfBusy || !!uninstallingId"
                :title="t('cf.module.uninstallActionTitle', { title: t('cf.module.title') })"
                @click="requestCfUninstall"
              >
                <LoadingSpinner v-if="uninstallingId === CF_UNINSTALL_TARGET.id" :size="12" />
                <AppIcon v-else name="trash" :size="13" />
                <span>{{ t('runtime.uninstall') }}</span>
              </button>
            </div>
          </div>

          <!-- 倒计时（2026-10-21 加）：内置组件，没有要下的资产 —— 装 / 卸只是让侧栏
               「组件 › 工具」里那一格出现或消失。判据与那边读同一个 countdown.installed。 -->
          <div class="runtime-row">
            <!-- 图标用 clock 而不是 timer（2026-10-25 用户指定）：栏上那一格、页签、
                 齿轮菜单一律是 clock，这一行是最后一处 timer；`timer` 那条图标本身仍留着，
                 别顺手删（它还在 AppIcon 的表里供别处使用）。
                 `is-countdown` 只做上色：本地运行环境那三行与上面抽题 / 比赛两行都是蓝色系，
                 这一行留在基础的 --text-dim 会读成「未安装」（2026-10-25 用户要求与上方几个一致）。 -->
            <span class="runtime-row__icon is-countdown"><AppIcon name="clock" :size="17" /></span>
            <span class="runtime-row__text">
              <span class="runtime-row__title">{{ t('countdown.title') }}</span>
              <span class="runtime-row__hint">
                <span class="app-dot" :class="countdownDotClass"></span>
                <span v-if="countdownHint">{{ countdownHint }}</span>
              </span>
            </span>
            <div class="runtime-row__actions">
              <button
                v-if="!countdownInstalled"
                class="download-button"
                :title="t('countdown.module.install')"
                @click="installCountdown"
              >
                <AppIcon name="download" :size="13" />
                <span>{{ t('countdown.module.install') }}</span>
              </button>
              <button
                v-else
                type="button"
                class="download-button is-uninstall"
                :title="t('countdown.module.uninstallActionTitle', { title: t('countdown.title') })"
                @click="requestCountdownUninstall"
              >
                <AppIcon name="trash" :size="13" />
                <span>{{ t('runtime.uninstall') }}</span>
              </button>
            </div>
          </div>
        </div>

      </section>

      <!-- 浏览器插件：网页版独有的抓题链路（桌面端的 webview 装不了扩展，抓题用的
           postMessage 桥也不接，见 HANDOFF 第 14 节第 6 条），所以整栏在桌面端的导航里
           就不出现 —— 见 visibleSections。
           原本挤在「应用」栏里，2026-10-11 按内容独立成一栏；2026-10-24 设置页统一成
           「一栏一张卡」，卡片外框由 .setting-group 给。 -->
      <section
        v-if="paneRendered('extension')"
        v-bind="paneProps('extension')"
        class="setting-group"
      >
        <p class="setting-group__title">{{ t('settings.section.extension') }}</p>
        <p class="setting-group__note">{{ t('settings.extension.groupNote') }}</p>

        <div class="setting-rows">
          <!-- 原来这里还有一行「安装状态 + 重新检测」，2026-11-10 用户要求去掉：装好之后它是
               整页唯一的一行，而「装没装」从下面几块的长相上已经看得出来（没装才出现「下载
               插件」，装了才有「投递目标 / 插件快捷键」）。
               手动重探**没有**跟着消失，只是换了形态：缩成下载 / 更新那一行右端一颗无边框的
               图标按钮（见下面那颗 `setting-refresh`）。自动探活照旧 —— 开机时
               `useCompanionBridge` 连探三轮，每次切到本栏又重探一次（见脚本里
               `watch(activeSection)`）。 -->

          <!-- 这一行管「把包拿到手」，两种状态都要在：一个都没探到 → 怎么装；
               探到旧版 → 怎么换新。**旧版这一档不能把这行收掉** —— Chromium 这边没有
               商店入口，按钮一收，装了旧版的人就再没有任何拿到新包的途径了（只能干看着
               下面那句「本站最新是 vX」）。只有「装了且是最新版」才收起来 -->
          <div v-if="extensionActionVisible" class="setting-row setting-row--action">
            <span class="setting-row__main">
              <span class="setting-row__head">
                <span class="setting-row__label">{{ t(extensionActionLabelKey) }}</span>
                <span class="setting-row__key">
                  {{ t('settings.extension.downloadVersion', { version: EXTENSION_VERSION }) }}
                </span>
              </span>
              <!-- 说明按浏览器分岔（装法见 extensionHintKey、换新法见 extensionUpdateHintKey）：
                   只留当前这台真走得通的那条 -->
              <span class="setting-row__hint">{{ t(extensionActionHintKey) }}</span>
            </span>
            <span class="setting-row__control setting-row__control--pair">
              <a
                v-if="showManualInstall"
                class="download-button"
                :href="EXTENSION_DOWNLOAD_URL"
                :download="EXTENSION_FILE"
              >
                <AppIcon name="download" :size="15" />
                <span>{{ t('app.download') }}</span>
              </a>
              <a
                v-if="showFirefoxInstall"
                class="download-button"
                :href="FIREFOX_EXTENSION_URL"
                target="_blank"
                rel="noopener noreferrer"
                :title="t('settings.extension.download.firefoxTitle')"
              >
                <AppIcon name="install" :size="15" />
                <span>{{ t('settings.extension.download.firefox') }}</span>
              </a>
              <!-- Edge 版：地址填上（EDGE_EXTENSION_URL 非空）才出现，现在还没上架 -->
              <a
                v-if="showEdgeInstall"
                class="download-button"
                :href="EDGE_EXTENSION_URL"
                target="_blank"
                rel="noopener noreferrer"
                :title="t('settings.extension.download.edgeTitle')"
              >
                <AppIcon name="install" :size="15" />
                <span>{{ t('settings.extension.download.edge') }}</span>
              </a>
              <!-- 无边框的刷新：手动重探一次（版本、快捷键都在这次快照里）。
                   探活本身不靠它 —— 开机连探三轮、每次切到本栏也重探；这颗只是给
                   「刚在扩展管理页点过刷新 / 刚改过快捷键」的人一个当场重读的入口，
                   所以做成图标按钮，不跟左边那几颗描边按钮争视觉重心 -->
              <button
                class="setting-refresh"
                :disabled="extensionChecking"
                :title="t('settings.extension.recheckTitle')"
                :aria-label="t('settings.extension.recheckTitle')"
                @click="refreshExtension"
              >
                <AppIcon name="reset" :size="15" :class="{ 'is-spinning': extensionChecking }" />
              </button>
            </span>
          </div>
          <!-- 原来这里还有一行「安装引导」（说明 + 一颗再发一次通知的按钮），2026-11-10 用户
               要求删掉，理由是这行**没有任何独家信息**：
               - 上面那一行的说明（`hint*` / `updateHint*`）就是通知正文的同一句话，同一批 key；
               - 通知本身会自动弹 —— 开机 2.5s 后 `runAutoGuides()` 跑一趟（没装过一次、旧版则每次
                 打开都弹），不需要人点；
               - 下载 / Firefox 版按钮上面那一行自带，通知里那几颗是重复的。
               于是它只剩下「不看已弹记录、把同样的话再发一遍」这层作用，删掉不丢信息。
               「应用」栏那颗「安装引导」保留着：那边通知正文与面板说明并不是同一段（通知多出
               按浏览器分岔的出路说明），不是纯复读。 -->
        </div>

        <!-- 装的是旧版时提示一行（版本号来自扩展自报的 cp-info）：放在 rows 外面，
             与下面 destinations 那行警告同一个体例。「怎么换新」只说一次 ——
             上面那一行带按钮，说在那里；这里只负责讲清版本对不上 -->
        <p v-if="extensionOutdated" class="setting-group__note setting-group__note--warn">
          {{ t('settings.extension.updateAvailable', { current: extensionVersion, latest: EXTENSION_VERSION }) }}
        </p>

        <template v-if="extensionInfo">
          <!-- 旧版扩展不上报 config，写也写不动，整组藏起来比亮出一排假开关好 -->
          <template v-if="extensionInfo.config">
            <p class="setting-subtitle">{{ t('settings.extension.destinations') }}</p>
            <p class="setting-group__note">{{ t('settings.extension.destinationsNote') }}</p>

            <div class="setting-rows">
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
            <code class="setting-code">{{ SHORTCUTS_URL }}</code>
            {{ t(shortcutsSuffixKey) }}
          </p>

          <div class="setting-rows">
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
                  class="ghost-button"
                  :class="{ 'is-copied': shortcutsCopied }"
                  :title="t(shortcutsTitleKey)"
                  @click="copyShortcutsUrl"
                >
                  <AppIcon :name="shortcutsCopied ? 'check' : 'copy'" :size="13" />
                  <span>{{ t(shortcutsCopied ? 'settings.extension.copied' : 'settings.extension.copyUrl') }}</span>
                </button>
              </span>
            </div>
          </div>

          <!-- 键位空着时补一句「为什么 + 去哪儿绑」：只留一个「未设置」会让人以为站点读不到插件
               的快捷键（2026-10-12 用户报障）。两条互斥，正常有键位时都不出现。 -->
          <p v-if="extensionShortcutsEmpty" class="setting-group__note">
            {{ t('settings.extension.shortcutEmptyNote') }}
          </p>
          <p v-else-if="extensionShortcutsUnassigned" class="setting-group__note">
            {{ t('settings.extension.shortcutUnassignedNote') }}
          </p>
        </template>
      </section>

      <!-- 云端同步：把偏好类设置存到 Cloudflare Worker 背后的 KV 里，身份用 Codeforces handle 证明。
           三态互斥：验证码面板开着（取过码、还没验证通过）→ 未绑定 → 已绑定。
           已绑定时的「解绑」另起一张危险区域卡（见页尾），所以这一栏是 template 包着两张卡。 -->
      <!-- 云端这一栏是两张卡（主卡 + 已绑定时的危险区域），包一层当作一页 -->
      <div v-if="paneRendered('cloud')" v-bind="paneProps('cloud')">
      <section class="setting-group">
        <p class="setting-group__title">{{ t('settings.section.cloud') }}</p>
        <p class="setting-group__note">{{ t('settings.cloud.groupNote') }}</p>

        <!-- 取过码：这一步要用户去 Codeforces 改 Last name，所以把码、步骤、代填收进同一张卡片
             （2026-10-19 重排：原先码卡 / 警告 / 按钮 / 步骤 / 页脚五块各占一段，读起来像流水账）。 -->
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

          <div class="cloud-flow">
            <div class="cloud-flow__head">
              <span class="cloud-flow__label">{{ t('settings.cloud.codeLabel') }}</span>
              <button
                type="button"
                class="download-button cloud-flow__copy"
                :class="{ 'is-copied': codeCopied }"
                :title="t('settings.cloud.copyCodeTitle')"
                @click="copyCloudCode"
              >
                <AppIcon :name="codeCopied ? 'check' : 'copy'" :size="13" />
                <span>{{ t(codeCopied ? 'settings.cloud.copied' : 'settings.cloud.copyCode') }}</span>
              </button>
            </div>
            <code class="cloud-flow__code">{{ cloudCode }}</code>
            <!-- 时效一行说完：剩多久（活倒计时）+ 取码的频率限制。原先「10 分钟内有效」与
                 倒计时各占一行、说的是同一件事，合成一行后不再重复。 -->
            <p class="cloud-flow__meta">
              <span class="cloud-flow__timer" :class="{ 'is-expired': cloudCodeCountdown.expired }">
                {{ t(cloudCodeCountdown.key, cloudCodeCountdown.params) }}
              </span>
              <span class="cloud-flow__dot" aria-hidden="true">·</span>
              <span class="cloud-flow__hint">{{ t('settings.cloud.codeHint') }}</span>
            </p>

            <div class="cloud-flow__block">
              <p class="cloud-flow__sub">{{ t('settings.cloud.codeSteps') }}</p>
              <ol class="cloud-flow__steps">
                <li>
                  <span class="cloud-flow__num" aria-hidden="true">1</span>
                  <span>
                    {{ cloudCodeStep1.before
                    }}<a
                      class="cloud-flow__link"
                      :href="CF_SOCIAL_URL"
                      target="_blank"
                      rel="noopener noreferrer"
                      >{{ t('settings.cloud.codeStep1Link') }}</a
                    >{{ cloudCodeStep1.after }}
                  </span>
                </li>
                <li>
                  <span class="cloud-flow__num" aria-hidden="true">2</span>
                  <span>
                    {{
                      cloudCodeMode === 'upload'
                        ? t('settings.cloud.codeStep2Upload')
                        : t('settings.cloud.codeStep2')
                    }}
                  </span>
                </li>
              </ol>
            </div>

            <!-- 代填只在装了扩展（且扩展自报 fill-code 能力）时出现；没装的用户看到的就是上面那两步。
                 它是**抄近道**，所以排成描边次按钮 —— 实心 accent 只留给最后那颗「验证」。
                 码过期后一并禁用：往 Codeforces 上写一枚已经作废的码只是白跑一趟。
                 扩展能回报「保存完了」时（fill-saved）这颗连验证一起做完，文案随之换成链路版，
                 但**仍然**是次按钮：那一轮里真正「落定」的仍是下面那颗验证（见 fillCodeChained）。 -->
            <div v-if="canFillCode" class="cloud-flow__block cloud-flow__block--fill">
              <span
                class="cloud-flow__status"
                :class="cloudCfHint.tone && `cloud-flow__status--${cloudCfHint.tone}`"
              >
                {{ t(cloudCfHint.key, cloudCfHint.params) }}
              </span>
              <button
                type="button"
                class="download-button cloud-flow__fill"
                :disabled="cloudBusy || cloudFilling || cloudCodeCountdown.expired"
                :title="cloudFillTitle"
                @click="fillCloudCode"
              >
                <LoadingSpinner v-if="cloudFilling" :size="12" />
                <AppIcon v-else name="codeforces" :size="13" />
                <span>{{ cloudFillLabel }}</span>
              </button>
            </div>
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
                class="download-button"
                :disabled="cloudBusy"
                :title="t('settings.cloud.importTitle')"
                @click="runCloud('import', importCloudByHandle)"
              >
                <LoadingSpinner v-if="cloudPending === 'import'" :size="12" />
                <span>{{ t('settings.cloud.import') }}</span>
              </button>
              <button
                type="button"
                class="download-button cloud-primary"
                :disabled="cloudBusy"
                :title="t('settings.cloud.loginTitle')"
                @click="runCloud('login', loginCloud)"
              >
                <LoadingSpinner v-if="cloudPending === 'login'" :size="12" />
                <span>{{ t('settings.cloud.login') }}</span>
              </button>
            </span>
          </div>
        </template>

        <!-- 已绑定：下载 / 重新上传。用户名与云端更新时间都在这一行里。
             「解绑」不在这张卡里 —— 它是这一栏唯一的不可逆操作，挪到页尾的危险区域。 -->
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
                @click="runCloud('download', downloadCloud)"
              >
                <LoadingSpinner v-if="cloudPending === 'download'" :size="12" />
                <AppIcon v-else name="download" :size="13" />
                <span>{{ t('settings.cloud.download') }}</span>
              </button>
              <!-- 「上传」本机有设备令牌就直接写；令牌失效或被服务端吊销才会退回取码验证（见 uploadCloud） -->
              <button
                type="button"
                class="download-button"
                :disabled="cloudBusy"
                :title="t('settings.cloud.uploadTitle')"
                @click="runCloud('upload', uploadCloud)"
              >
                <LoadingSpinner v-if="cloudPending === 'upload'" :size="12" />
                <AppIcon v-else name="cloud" :size="13" />
                <span>{{ t('settings.cloud.upload') }}</span>
              </button>
            </span>

            <!-- 公开取回地址栏：把散落在脚注里的「网址后接 cfid」那句彩蛋收进卡片底部，
                 做成终端风等宽地址框，后缀 /<handle> 高亮、可一键复制。
                 未绑定时 cloudPublicUrl 为空，这一段整体不渲染。 -->
            <div v-if="cloudPublicUrl" class="cloud-account__url">
              <span class="cloud-account__url-label">{{ t('settings.cloud.publicUrlLabel') }}</span>
              <code class="cloud-account__url-pill">
                <span class="cloud-account__url-base">{{ cloudPublicOrigin }}</span>/<strong>{{ cloudAccount.handle }}</strong>
              </code>
              <button
                type="button"
                class="ghost-button cloud-account__url-copy"
                :class="{ 'is-copied': cloudUrlCopied }"
                :title="t('settings.cloud.copyUrlTitle')"
                @click="copyCloudPublicUrl"
              >
                <AppIcon :name="cloudUrlCopied ? 'check' : 'copy'" :size="13" />
                <span>{{ t(cloudUrlCopied ? 'settings.cloud.copied' : 'settings.cloud.copyUrl') }}</span>
              </button>
            </div>
          </div>
        </template>

        <p v-if="cloudError" class="setting-group__note setting-group__note--warn">
          {{ cloudError }}
        </p>
        <p v-else-if="cloudNotice" class="setting-group__note setting-group__note--ok">
          {{ cloudNotice }}
        </p>

        <!-- 取码那一步的主按钮：排在状态行**下面** —— 「已填好…点下面的按钮完成验证」那句
             说的就是它，按钮得真的在它下面（2026-10-19 重排前按钮在上面，读着自相矛盾）。 -->
        <div v-if="cloudCode" class="cloud-footer">
          <button
            type="button"
            class="download-button"
            :disabled="cloudBusy"
            @click="cancelCloudCode"
          >
            {{ t('settings.cloud.cancel') }}
          </button>
          <!-- 过期了就不再给「验证」：那一步必然被服务端打回「已过期或未获取」，
               直接摆成下一步该做的事 —— 重新取一枚。 -->
          <button
            v-if="cloudCodeCountdown.expired"
            type="button"
            class="download-button cloud-primary"
            :disabled="cloudBusy"
            @click="runCloud('refresh', refreshCloudCode)"
          >
            <LoadingSpinner v-if="cloudPending === 'refresh'" :size="12" />
            <span>{{ t('settings.cloud.refreshCode') }}</span>
          </button>
          <button
            v-else
            type="button"
            class="download-button cloud-primary"
            :disabled="cloudBusy"
            @click="runCloud('verify', confirmCloudCode)"
          >
            <LoadingSpinner v-if="cloudPending === 'verify'" :size="12" />
            <AppIcon v-else name="check" :size="13" />
            <span>
              {{
                cloudCodeMode === 'upload'
                  ? t('settings.cloud.verifyUpload')
                  : t('settings.cloud.verifyLogin')
              }}
            </span>
          </button>
        </div>

        <!-- 公开性声明：必须放在「上传」之前能看到的位置（它就在三态 UI 正下方）。
             云端的读接口没有任何鉴权，所以「上传」这一个动作本身就等于同意公开 ——
             这句话不写清楚，用户会觉得上传只是「备份到自己账号下」。 -->
        <p class="setting-group__note">{{ t('settings.cloud.publicNotice') }}</p>

        <!-- 预下载：它是**偏好**而不是「这台设备下好了没有」，所以归在云同步这边，
             不跟「本地运行环境」那张事实清单混同 —— 那边的每一行都在回答「现在本机有没有」。
             排在登录之后：这一栏第一眼要看到的是「怎么把配置同步过来 / 传上去」。
             桌面端没有那套自托管运行时（同上），这一组偏好一并收起。 -->
        <template v-if="!isDesktop">
          <p class="setting-subtitle setting-subtitle--code">{{ t('runtime.autoPreload.label') }}</p>
          <!-- 只有标题 + 开关，没必要占满 640px 整行：收成紧凑多列小卡片，点整卡切换。
               开启态卡片带微弱 accent 亮边框，一眼看出哪些已勾。 -->
          <div class="bento-grid">
            <div
              v-for="item in RUNTIMES"
              :key="item.id"
              class="bento-item"
              :class="{ 'is-active': isAutoPreload(item.id) }"
              role="button"
              :tabindex="0"
              :aria-pressed="isAutoPreload(item.id)"
              :title="t('runtime.autoPreload.switchTitle', { title: t(item.titleKey) })"
              @click="toggleAutoPreload(item.id)"
              @keydown.enter="toggleAutoPreload(item.id)"
              @keydown.space.prevent="toggleAutoPreload(item.id)"
            >
              <span class="bento-item__icon"><AppIcon :name="item.icon" :size="16" /></span>
              <span class="bento-item__label">{{ t(item.titleKey) }}</span>
              <button
                type="button"
                class="switch"
                :class="{ 'is-on': isAutoPreload(item.id) }"
                role="switch"
                :aria-checked="isAutoPreload(item.id)"
                :aria-label="t('runtime.autoPreload.switchTitle', { title: t(item.titleKey) })"
                :title="t('runtime.autoPreload.switchTitle', { title: t(item.titleKey) })"
                @click.stop="toggleAutoPreload(item.id)"
              >
                <span class="switch__thumb"></span>
              </button>
            </div>
          </div>
          <p class="setting-group__note">{{ t('runtime.autoPreload.note') }}</p>
        </template>

        <!-- 「默认安装」开关：与上面那组预下载同为**偏好**，所以也归在云同步这边、
             跟着账号走；本机的安装状态在「应用」一栏的组件行里。
             2026-10-27 起与「应用 › 组件」一一对应成两行（Codeforces / 倒计时）——
             抽题与比赛在磁盘上是同一份题库，所以这里只有 Codeforces 这一个开关。
             **两行之间不留说明段落**：说明一旦插在行与行中间，`.setting-row + .setting-row`
             那条分割线就因为不再是相邻兄弟而消失，而且两行本来就是一个整齐的开关组，
             注释放进 tooltip 与分组末尾就够了。 -->
        <p class="setting-subtitle setting-subtitle--code">{{ t('cf.module.autoInstall.label') }}</p>
        <div class="bento-grid">
          <div
            class="bento-item"
            :class="{ 'is-active': cfAutoInstall }"
            role="button"
            :tabindex="0"
            :aria-pressed="cfAutoInstall"
            :title="t('cf.module.autoInstall.switchTitle')"
            @click="toggleCfAutoInstall"
            @keydown.enter="toggleCfAutoInstall"
            @keydown.space.prevent="toggleCfAutoInstall"
          >
            <span class="bento-item__icon is-codeforces"><AppIcon name="codeforces" :size="16" /></span>
            <span class="bento-item__label">{{ t('cf.view.title') }}</span>
            <button
              type="button"
              class="switch"
              :class="{ 'is-on': cfAutoInstall }"
              role="switch"
              :aria-checked="cfAutoInstall"
              :aria-label="t('cf.module.autoInstall.switchTitle')"
              :title="t('cf.module.autoInstall.switchTitle')"
              @click.stop="toggleCfAutoInstall"
            >
              <span class="switch__thumb"></span>
            </button>
          </div>
          <div
            class="bento-item"
            :class="{ 'is-active': countdownAutoInstall }"
            role="button"
            :tabindex="0"
            :aria-pressed="countdownAutoInstall"
            :title="t('countdown.module.autoInstall.switchTitle')"
            @click="toggleCountdownAutoInstall"
            @keydown.enter="toggleCountdownAutoInstall"
            @keydown.space.prevent="toggleCountdownAutoInstall"
          >
            <span class="bento-item__icon is-countdown"><AppIcon name="clock" :size="16" /></span>
            <span class="bento-item__label">{{ t('countdown.title') }}</span>
            <button
              type="button"
              class="switch"
              :class="{ 'is-on': countdownAutoInstall }"
              role="switch"
              :aria-checked="countdownAutoInstall"
              :aria-label="t('countdown.module.autoInstall.switchTitle')"
              :title="t('countdown.module.autoInstall.switchTitle')"
              @click.stop="toggleCountdownAutoInstall"
            >
              <span class="switch__thumb"></span>
            </button>
          </div>
        </div>
      </section>

      <!-- 危险区域（2026-10-24 按设置页规范加）：只收「一旦点了就得重新走一遍证明」的操作。
           解绑只断本机与这个用户名的关联、云端配置保留（见 confirmUnbind），但重新绑回来要再走
           取码 → 改 Last name，所以它够格待在这里；下载 / 上传这类可重复操作留在上面的主卡。 -->
      <section v-if="cloudAccount.handle" class="danger-zone" :aria-label="t('settings.cloud.unbindTitle')">
        <div class="setting-row setting-row--action">
          <span class="setting-row__main">
            <span class="setting-row__label">{{ t('settings.cloud.unbindTitle') }}</span>
            <span class="setting-row__hint">
              {{ t('settings.cloud.unbindConfirmDesc', { handle: cloudAccount.handle }) }}
            </span>
          </span>
          <span class="setting-row__control">
            <button
              type="button"
              class="download-button is-danger"
              :disabled="cloudBusy"
              :title="t('settings.cloud.unbindTitle')"
              @click="requestUnbind"
            >
              <AppIcon name="trash" :size="13" />
              <span>{{ t('settings.cloud.unbind') }}</span>
            </button>
          </span>
        </div>
      </section>
      </div>

      <section
        v-if="paneRendered('help')"
        v-bind="paneProps('help')"
        class="setting-group"
      >
        <p class="setting-group__title">{{ t('settings.section.help') }}</p>
        <HelpPanel />
      </section>
      </div>
      <!-- 取景框（`.settings-panes`）：上面那行收的是整排页，这行收的是不动的外框 -->
      </div>
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
         别人的链接刻意**不**自动套用也不自动登录 —— 链接谁都能构造，替换本机设置该由用户点头才发生。
         （地址里那位正是本机在跟的那位时不走弹窗：cloudEntry.js 已经直接对齐了，见那里的文件头。
           反过来，用户在这儿点了「套用」就等于认下这位，之后打开站点会继续用它那一套。）
         与上面两个确认同款自绘弹窗。 -->
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
              @click="runCloud('apply', confirmCloudApply)"
            >
              <LoadingSpinner v-if="cloudPending === 'apply'" :size="12" />
              <span>{{ t('settings.cloud.applyConfirm') }}</span>
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
  /* 横滑翻页时 `.settings-content` 会被 translate 到一侧，这一层的 overflow-x 本会跟着
     变成 auto（只有 y 不是 visible 时，x 的 visible 按规范算成 auto），于是拖动中可能冒出
     一条横向滚动条、内容也能被横向拖动。裁掉它，翻页的位移就只走 transform。 */
  overflow-x: hidden;
  /* 滚动条槽位常驻，且左右都留：内容居中（见 .settings-view__inner 的 margin-inline: auto）
     靠的是「内容盒宽度」，而原生滚动条一出现就从右边挖掉 11px（base.css 的 ::-webkit-scrollbar），
     内容盒于是变窄、居中的块跟着左移 5.5px。分类之间内容长短不同，滚动条时有时无 ——
     观感就是「切一栏、内容整体挪一下」。both-edges 让两边对称预留，居中不再受滚动条影响。
     覆盖式滚动条的环境里它不占位（gutter 为 0），照样是对称的。 */
  scrollbar-gutter: stable both-edges;
  padding: 4px 0 18px;
  /* 「目录 / 内容」默认单列，编辑区够宽时再升级成两栏。宽度判断交给容器查询：
     设置视图活在编辑区里，它的宽度只是编辑区宽度的一部分，拿视口 media query 当代理是错的。
     写成「默认单列 + min-width 升级」而不是「默认两栏 + max-width 降级」：不支持容器查询的
     浏览器（部分手机自带浏览器）会永远吃默认那套单列，窄屏上就不会被挤成两列。 */
  container-type: inline-size;
  container-name: settings;
}

/* 目录 + 内容：默认单列（目录在上、内容在下）。
   够宽时由文件末尾的 @container settings (min-width: 35rem) 升级成「左栏目录 + 右栏内容」。
   max-width 只是上限，还要 width: 100% + 横向 auto 边距才居中 ——
   少了后两条，编辑区比 880px 宽时整块会一直贴在左边（2026-10-27）。 */
.settings-view__inner {
  display: flex;
  flex-direction: column;
  gap: 0;
  width: 100%;
  max-width: 880px;
  margin-inline: auto;
}

/* 取景框：横滑的「整排」外面那层不动的框，横滑时看不见的邻页由它裁掉。
   它必须**不动** —— 裁切的矩形就是它自己的盒，挂到会动的 `.settings-content` 上，
   裁切框会跟着整排一起挪，从盒外滑进来的那一页就永远画不出来（2026-11-08 实测：
   拖动时右半边整片是背景色）。
   用 `clip` 不用 `hidden`：`hidden` 会让这一层变成滚动容器，换页那趟撑高时的纵向溢出
   会被它自己吃掉，页面就滚不动了；`clip` 只裁、不建滚动容器，也不会有滚动条槽位。
   宽度也在这里：单列时铺满，两栏时它才是目录右边那一栏（见文件末尾的 @container）。

   ⚠️ **两轴都要裁，纵向不是可选项**（2026-11-08 修）：邻页（绝对定位，`top: 0`）的高度
   是它自己的内容高度，跟当前页毫无关系。只裁横向的话，它纵向溢出的那部分会照常计入
   `.settings-view` 的可滚动区域 —— 当前页「浏览器插件」只有 446px 高，邻页「帮助」4557px，
   于是整页滚到 4603px，下面 4000px 全是空白（实测 `scrollH - 当前页底 = 4069px`）。
   裁掉之后滚动区域只由当前页决定。
   这些邻页内部只有几条装饰性的 `position: absolute`（指示线、缩略图、开关圆点），都在
   自己父盒之内；真正的浮层（卸载确认）Teleport 到 body，目录的 `sticky` 在这一层**外面**，
   所以纵向裁切不会误伤。 */
.settings-panes {
  position: relative;
  min-width: 0;
  overflow: clip;
  /* 横滑换分类（见脚本那一节）：
     `pan-y` 把纵向留给浏览器滚页面、横向留给手势 —— 触摸的手势归属在起手那一刻就按这条
     定下了，`preventDefault()` 改不动它（第 1 节硬约束）。代价是这一块里没有双指缩放，
     设置页本来就靠「外观 › 界面缩放」，不必两套。 */
  touch-action: pan-y;
}

/* 设置正文：一排「页」的轨道 —— **整排只有这一层在动**（2026-11-09 的「单层轨道」）。
   跟手、回弹、翻页、接管、目录点选全是它的内联 transform，由 `applyTrack` 直写 DOM；
   每一页自己固定停在「绝对下标 × 一页宽」上，切页时那一行一个字节都不变。
   宽度、横向裁切、两栏时「目录右边那一栏」的身份都归外层取景框，它只管「整排」这一件事。
   危险区域要能与主体卡片并排成两张卡，所以不能把卡片直接放在 inner 下。 */
.settings-content {
  display: flex;
  flex-direction: column;
  min-width: 0;
  /* 两侧那几页的定位基准（见 .settings-pane） */
  position: relative;

  /* ⚠️ 这一层**永远**带着一个零位移 transform，并预先声明会动 —— 这是「落定的最后一下
     整块内容消失一瞬」的修法（2026-11-08）。

     原来 transform 只在动的时候有，静止时整条属性消失（`transform: none`）。浏览器为这趟
     过渡临时提升一个合成层，**过渡一结束、transform 归到 none，层就被丢掉**，内容并回文档层
     重新栅格化；新位图还没好，那一帧就是空白 —— 位置正好是「落定的最后一下」。
     常驻一个 translate3d(0,0,0) 之后，插值只发生在 `transform → transform` 之间（连 `none`
     那个特例都不必走），层也不会在收尾时被销毁。`will-change` 进一步让浏览器**提前**把它
     提成层，而不是等第一帧位移才提。

     兜底必须有这一条：移交给 JS 直写之后（见 `applyTrack`），一旦某次内联样式被清掉
     （热更新、别处的 `removeAttribute('style')`），这一层就退回 `none` 了 ——
     把它写在样式表里，谁清都清不掉。代价是一张常驻的合成贴图（只栅格化视口那一带，
     不是整页），手机上可接受；见 HANDOFF §3。 */
  transform: translate3d(0, 0, 0);
  will-change: transform;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;

  /* 这条只是首帧兜底：实际用到的过渡都由 `applyTrack` 连同 transform 一起内联下发
     （时长按「剩下的路 ÷ 手速」算，见 `settleDuration`；曲线开头满速，抬手时已经有
     初速度了，用 ease / ease-in-out 会先顿一下再窜出去）。留一份同曲线的声明，是为了
     万一内联被清掉，元素仍按同一条曲线走完，而不是突然变成 ease。
     减弱动效的场景由 base.css 那条全局规则压成 0.01ms，这里不再写一遍。 */
  transition: transform 0.22s cubic-bezier(0.22, 1, 0.36, 1);
}

/* ---- 一页 = 一类设置（轨道上的一格） ---- */
.settings-pane {
  width: 100%;
  /* 上下留白从 .setting-group 挪到这一层：绝对定位的那几页没有可折叠的外边距，
     每页自己带一份，三页的正文才对得齐 */
  padding-top: 14px;
  padding-bottom: 32px;
  /* 位置由 `paneProps` 写成**内联** transform，且**只取决于绝对下标**（第 at 页永远在
     `at × 100%`）—— 切页时这一行不变。所以这里不需要、也**不许**有 transition：
     给一页加过渡，等于让它在换页那一帧从旧下标滑到新下标，与整排的位移对冲，
     那就又回到双层动画了（2026-11-09 改）。
     兜底那条零位移 transform 同理（内联永远带着，样式表这条防它被清掉）；
     `backface-visibility: hidden` 让它稳定占住一个合成层、并免掉背面判定带来的逐帧抖动。 */
  transform: translate3d(0, 0, 0);
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

/* 当前页留在流里（内容高度由它定），左右各一页绝对定位叠在同一处、靠 transform 推出去。
   换页那一帧这两条会互换角色（出去的那页 absolute、进来的那页 relative），听起来像
   「过渡结束时改定位」那个经典闪烁源，实际不是：
   1. 互换发生在 `pointerup`（过渡**开始**那一帧），不是 `transitionend`；
   2. 每一页本来就带 `transform`，早就自成层与层叠上下文，互换只改变「要不要参与流」，
      **盒子的位置、尺寸、层都不变** —— 不会有重新栅格化。
   真做成「三页全部 absolute、高度交给 JS 量」也行，但高度得靠 ResizeObserver 手动维持，
   一旦某帧量错就是滚动位置乱跳，比现在这条稳。 */
.settings-pane--current {
  position: relative;
}

.settings-pane:not(.settings-pane--current) {
  position: absolute;
  top: 0;
  left: 0;
  /* ⚠️ 这里**不许**再写 `display: none`（2026-11-08 删掉的那条）。
     旁边那几页必须一直在渲染树里：一个元素从 `display: none` 变成可见时**没有变化前样式**，
     那一帧的 `transform` 变化不会起过渡，于是新的一页会**当场落位**、旧的一页还在慢慢出去 ——
     短促的快甩最容易撞上（手指抬起时 `is-swiping` 可能还没落过一帧，两侧的页一直是隐藏的），
     观感就是「松手后闪一下」。常驻之后每一页都有完整的过渡。
     它们停在 ±100%、又被外层取景框（`.settings-panes`）的 `overflow: clip` 裁在内容盒外，看不见。
     纵向也一并裁掉：它们的高度是自己的内容高度，溢出那部分会撑长整个滚动区域（见取景框那条）。
     页数由 `mountNeighbours()` 控制在「当前页 ±1」，不会越积越多。 */
}

.settings-nav {
  display: flex;
  flex-direction: row;
  gap: 3px;
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
  height: 30px;
  padding: 0 10px;
  border-radius: 6px;
  color: var(--text-dim);
  font-size: 13px;
  text-align: left;
  transition: background-color 0.15s ease, color 0.15s ease;
}

:where(html.is-hoverable) .settings-nav__item:hover {
  background: var(--bg-hover);
  color: var(--text);
}

.settings-nav__item--active {
  background: var(--bg-control);
  color: var(--text);
  font-weight: 500;
}

.settings-nav__label {
  white-space: nowrap;
}

/* 一栏 = 一组设置，不再包一层大卡片（2026-10-24「沉浸式」布局）：
   设置行直接落在编辑区底色上，靠分类标题、上下留白和行间那条 5% 白细线分区。
   无边、无底、无圆角 —— 大面积亮色块在暗色主题里会压住内容，克制到只剩排版。
   上下留白在 `.settings-pane` 上（一页一份）：这里再留一份，云端那一页的包裹层就会叠成两层。 */
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
    gap: 16px;
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

  .settings-panes {
    flex: 1 1 auto;
    max-width: 640px;
    /* 两栏时没有横滑（手势只在单栏生效，见脚本的 isSingleColumn），
       把 touch-action 还回默认，别白白收掉这一块的双指缩放 */
    touch-action: auto;
  }

  /* 两栏时没有「翻页」这回事：内容就在右边那一栏**原地换掉**，不该有横向位移。
     2026-11-09 起这里不再需要关任何过渡 —— 每一页本来就没有 transition，整排的位移也只在
     三处发生：手势（两栏下不启动，见脚本的 isSingleColumn）、目录点选（`watch(activeSection)`
     在两栏下直接把时长给 0）、以及收尾。所以点一下目录是「内容换掉」，不是「从一页宽外滑进来」。
     窄屏相邻页那 220ms 的横移由同一个 watch 给，那里翻页是语义的一部分。 */
}

.setting-group__title {
  margin: 0;
  padding: 0 18px 4px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.01em;
  /* 分组标题升到与设置项标题同一档纯度（--text），靠「13px 小字号 + 上边距」建立层级，
     而不是靠更暗的灰色 —— 原来的 --text-dim 让它比下面的列表项标题还暗，层级倒挂。
     页头感再补一点：13px 压过 12.5px 的小节标题，保证「分组 > 小节 > 行」不塌。 */
  color: var(--text);
}

/* 组内的小标题：把「运行时限」与「评测引擎」在同一个「评测」分组里分开。
   规范 3 要求用留白而不是实线分割：这里撤掉原来那条 border-top，只留更宽的上边距。 */
.setting-subtitle {
  margin: 0;
  padding: 28px 18px 4px;
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: 0;
  color: var(--text-dim);
}

/* 编辑器分组里的第一小节紧跟在分组标题下面，不用再留一大段 */
.setting-subtitle--first {
  padding-top: 8px;
}

/* 「// 预下载本地运行环境」这类开关偏好的小节标题：前缀等宽斜杠 + 小方块，
   借一点代码编辑器里的注释符号，给纯文字标题压上「这是工具」的辨识度。
   只加在云同步页三处开关组标题上（class 显式标注），不污染其他页的小节标题。 */
.setting-subtitle--code::before {
  content: '//';
  margin-right: 7px;
  font-family: var(--mono-font);
  font-weight: 500;
  letter-spacing: 0.02em;
  color: var(--accent-strong);
}

.setting-group__note {
  margin: 0 18px 10px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-dim);
}

/* 写扩展配置失败的提示：排版与说明一致，只换警示色 */
.setting-group__note--warn {
  color: var(--warn);
}

/* 设置行：直接排在页面底色上，行与行之间只留一条 5% 白的分割线，
   悬浮时铺一层极浅的抬起色（相当于卡片底色），不抢控件本身。
   文字走三级灰度：标题 --text / 描述 --text-dim / 键名 --text-faint 等宽。 */
.setting-row {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 24px;
  padding: 14px 18px;
  border-radius: 0;
  transition: background-color 0.15s ease;
}

:where(html.is-hoverable) .setting-row:hover {
  background: var(--bg-panel);
}

/* 相邻行之间的分割线：只画在行与行直接相接的地方，标题 / 说明后面不画。
   画成行上的 border-top 时，线是跟着整行盒走的 —— 行左右各有 18px 内边距，
   于是线比文字左缘多出 18px、比右侧控件再多出一截，整排看着像没对齐的表格。
   改用伪元素，把线收回文字列里（内缩量与行的左右内边距相等）。
   用 `::after` 而不是 `border`：线不占布局、hover 底色铺满时也不会被框住。 */
.setting-row + .setting-row::after,
.setting-rows .setting-row + .setting-row::after,
.runtime-row + .runtime-row::after {
  content: '';
  position: absolute;
  top: 0;
  left: 18px;
  right: 18px;
  height: 1px;
  background: var(--border-divider);
  pointer-events: none;
}

/* 「已改动」指示线：只有当前值偏离默认值时才出现，小圆角贴在行左侧 */
.setting-row.is-modified::before {
  content: '';
  position: absolute;
  left: 0;
  top: 10px;
  bottom: 10px;
  width: 2px;
  border-radius: 0 2px 2px 0;
  background: var(--accent);
}

.setting-row__main {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1 1 auto;
  min-width: 0;
}

.setting-row__head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
  row-gap: 2px;
  min-width: 0;
}

/* 第一级：主标题 —— 这是什么。14px / Medium，与描述拉开一档纯度 */
.setting-row__label {
  font-size: 14px;
  font-weight: 500;
  line-height: 1.4;
  color: var(--text);
}

/* 「测试」小标签：与「应用」那张卡图标上的同一枚 —— 那一栏挂在图标角上，
   云同步这组行没有图标，就挂在标题旁边（2026-10-27）。 */
.setting-row__tag {
  flex: 0 0 auto;
  padding: 0 4px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-control);
  color: var(--text-dim);
  font-size: 9px;
  line-height: 1.5;
  font-weight: 600;
  letter-spacing: 0.02em;
  white-space: nowrap;
}

/* 第三级：底层键名 —— 极低频的参考信息，等宽 + 最弱灰度 */
.setting-row__key {
  font-family: var(--mono-font);
  font-size: 11px;
  color: var(--text-faint);
  /* 设置项的内部键名是不可断的长词（bracketPairColorization），窄面板下必须允许断 */
  overflow-wrap: anywhere;
}

/* 第二级：描述 —— 有什么用。比标题低一档字号与灰度 */
.setting-row__hint {
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--text-dim);
}

.setting-row__control {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
}

/* 同一行并排两颗按钮（插件下载行：站内 zip + Firefox 商店外链）。
   可折行，窄面板下不让左边的标签被挤没（不折行时靠右对齐，与原单按钮摆法一致） */
.setting-row__control--pair {
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
  max-width: 100%;
}

/* 输入框 / 下拉：规范 1 的「左文右操作」——文字在左、控件贴行尾。
   控件本身不折行；描述再长也只撑左边那一栏。 */
.setting-row--select,
.setting-row--number {
  align-items: flex-start;
}

/* 30px 高的控件与 20px 的标题行视觉居中对齐（只挪控件，不挪描述） */
.setting-row--select .setting-row__control,
.setting-row--number .setting-row__control {
  margin-top: -4px;
}

/* 开关：标签在左、开关孤立地靠右上 */
.setting-row--switch {
  align-items: flex-start;
  justify-content: space-between;
}

.setting-row--switch .setting-row__control {
  margin-top: 0;
}

/* 主题色卡网格：整行改成纵向 —— 标题与说明在上，色卡在下面铺满整行。
   一张卡 = 一块预览（底色 + 右侧面板条 + 强调色条 + 正文线）+ 主题名。
   预览块里的颜色来自 THEMES 的 swatch（别的主题的色值，读不到当前主题的变量）。 */
.setting-row--themeGrid {
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
}

.setting-row--themeGrid .setting-row__control {
  width: 100%;
}

/* 深色一组、浅色一组；组内列数按可用宽度弹性铺（auto-fill + 最小卡宽），
   宽度不够就换行，不再为了「一行塞满」把卡片压扁 */
.theme-groups {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.theme-group {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
  gap: 10px;
}

.theme-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-card);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

:where(html.is-hoverable) .theme-card:hover {
  border-color: var(--text-faint);
  background: var(--bg-control);
}

.theme-card.is-on {
  border-color: var(--accent);
  background: var(--bg-card);
}

.theme-card__preview {
  position: relative;
  display: block;
  height: 46px;
  border-radius: 4px;
  overflow: hidden;
}

.theme-card__panel {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 30%;
}

.theme-card__accent {
  position: absolute;
  left: 8px;
  bottom: 8px;
  width: 26px;
  height: 4px;
  border-radius: 2px;
}

.theme-card__line {
  position: absolute;
  left: 8px;
  top: 10px;
  width: 36px;
  height: 3px;
  border-radius: 2px;
  opacity: 0.85;
}

.theme-card__name {
  font-size: 11.5px;
  line-height: 1.3;
  color: var(--text-dim);
}

.theme-card.is-on .theme-card__name {
  color: var(--text);
}

/* 动作行（按钮 / 录制框 / 链接）：标签在左、控件在右并垂直居中 */
.setting-row--action {
  align-items: center;
  justify-content: space-between;
  min-height: 52px;
}

/* 行里只剩右侧控件（没有 `.setting-row__main`）时用它：那个「靠左文字 flex:1 把控件挤到行尾」
   的排列方式没了载体，`space-between` 会把孤零零的控件顶到最左，所以显式改成贴右 */
.setting-row--end {
  justify-content: flex-end;
}

.select {
  position: relative;
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  max-width: 100%;
}

.select select {
  appearance: none;
  min-width: 150px;
  padding: 6px 30px 6px 11px;
  border-radius: 6px;
  /* 表单面统一走 --bg-field：深色比底色亮一档、比 --bg-control 暗一档，正好浮起一点点。
     用过 --bg-input（比底色还深，像黑洞）和 --bg-control（#343434，又亮过头），两头都不对
     —— 2026-11-09 用户两轮反馈后收敛到这个中间调 */
  background: var(--bg-field);
  border: 1px solid var(--border);
  font-size: 12.5px;
  color: var(--text);
  transition: background-color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}

:where(html.is-hoverable) .select select:hover {
  background: var(--bg-control);
}

.select__chevron {
  position: absolute;
  right: 9px;
  pointer-events: none;
  color: var(--text-dim);
}

/* 两档一键切换（侧边栏位置 / 窄屏折叠方向）：一颗小钮显示当前档（如「左侧」），
   点一下翻到另一档。底色与 select / 输入框同走 --bg-field，描边走 --border，
   颜色全部走变量、两套主题各取各的。 */
.toggle-seg {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  padding: 5px 12px;
  border-radius: 6px;
  background: var(--bg-field);
  border: 1px solid var(--border);
  font-size: 12.5px;
  line-height: 1.4;
  color: var(--text);
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}

:where(html.is-hoverable) .toggle-seg:hover {
  background: var(--bg-control);
}

.toggle-seg:focus-visible {
  outline: none;
  border-color: var(--focus);
  box-shadow: 0 0 0 3px var(--focus-ring);
}

.number-input {
  width: 84px;
  padding: 6px 9px;
  border-radius: 6px;
  background: var(--bg-field);
  border: 1px solid var(--border);
  font-size: 12.5px;
  color: var(--text);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

/* 规范 5：输入 / 下拉获焦时只提亮边框 + 一圈淡光晕，不要浏览器默认的粗蓝圈 */
.select select:focus-visible,
.number-input:focus-visible,
.text-input:focus-visible,
.setting-textarea:focus-visible {
  outline: none;
  border-color: var(--focus);
  box-shadow: 0 0 0 3px var(--focus-ring);
}

.switch {
  flex: 0 0 auto;
  position: relative;
  width: 34px;
  height: 19px;
  border-radius: 999px;
  background: var(--bg-control);
  border: 1px solid var(--border);
  transition: background-color 0.18s ease, border-color 0.18s ease;
}

.switch__thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: var(--text-dim);
  transition: transform 0.18s ease, background-color 0.18s ease;
}

/* 规范 4：关闭态是一块融进卡片的暗灰轨道。
   打开态不走纯实心 accent（满屏高饱和色块抢注意力），改成「低饱和半透明 accent 底 + 1px
   高亮描边」，圆点提亮。半透明底色随主题走，深色下是克制的微光、浅色下同样不刺眼。 */
.switch.is-on {
  background: color-mix(in srgb, var(--accent) 30%, transparent);
  border-color: color-mix(in srgb, var(--accent) 60%, var(--border));
}

.switch.is-on .switch__thumb {
  transform: translateX(15px);
  background: var(--accent);
}

/* ---------- 本地运行环境 ---------- */
/* 运行环境那一组行：容器只是一列，外框已经由整栏那张卡给过了 */
.runtime-list {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/* 一行：图标方块 + 标题 / 状态 + 行尾按钮。左右内边距与 .setting-row 对齐，
   好让图标方块和同栏其他行的文字落在同一条左边线上 */
.runtime-row {
  /* 相邻行的分割线是 `::after`（见 .setting-row 那条），没有定位就没有可锚的盒，
     线会跑到外层取景框上去 */
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 62px;
  padding: 12px 18px;
  border-radius: 0;
  transition: background-color 0.15s ease;
}

/* 行 hover：整行变色太重，改成 60% 透明的抬升 —— 微变色而非色块铺满，
   与下载按钮的 transition-colors 节奏一致（2026-11-09 视觉精炼） */
:where(html.is-hoverable) .runtime-row:hover {
  background: color-mix(in srgb, var(--bg-hover) 60%, transparent);
}

/* 图标方块：比行内文字大一号，好认。
   去背景填充、只留 1px 极细描边 —— 实心色块会让这一组图标看起来像「功能按钮」，
   纯描边更接近线性图标的克制质感（2026-11-09 视觉精炼：配合整体的微质感方向）。 */
.runtime-row__icon {
  position: relative;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  border-radius: 6px;
  border: 1px solid var(--border-hairline);
  color: var(--text-dim);
  background: transparent;
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

/* 抽题与比赛两行：它们是同一个品牌（不是语言），页头与页签里仍走 currentColor，
   所以这个类只加在设置页这两行上 */
.runtime-row__icon.is-codeforces {
  color: var(--icon-codeforces);
}

/* 倒计时那一行（2026-10-25）：它没有品牌色，但这一组图标都在同一条蓝色线上 ——
   留着基础类的 --text-dim 会显得像「未安装 / 禁用」。取与相邻那枚同一支蓝（见 base.css） */
.runtime-row__icon.is-countdown {
  color: var(--icon-countdown);
}

.runtime-row__text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1 1 auto;
  min-width: 0;
}

.runtime-row__title {
  font-size: 14px;
  font-weight: 500;
  line-height: 1.4;
  /* 标题收紧字距（tracking-tight 的克制版）：拉开与正文（--text-dim）的明度对比 */
  letter-spacing: -0.01em;
  color: var(--text);
}

/* 状态点并到说明文字前面：说明可能很长会换行，所以点不参与收缩 */
.runtime-row__hint {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-dim);
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
  height: 30px;
  padding: 0 12px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg-control);
  color: var(--text);
  font-size: 12.5px;
  white-space: nowrap;
  transition: background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease,
    box-shadow 0.16s ease;
}

:where(html.is-hoverable) .download-button:hover:not(:disabled) {
  background: var(--bg-control-hover);
}

.download-button:disabled {
  cursor: default;
  color: var(--text-faint);
}

/* 无边框的图标按钮 —— 目前只有「浏览器插件」那一行右端的刷新。
   与 .download-button 同高（30px），和左边几颗描边按钮在同一条基线上；区别是不出描边、
   不占文字宽度，静止时看着就是一个图标，只在 hover 时铺一层底色。
   摘掉描边是刻意的：它做的是「重读一次快照」这种次要动作，不该跟「下载 / 更新」争注意力 */
.setting-refresh {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-dim);
  transition: background-color 0.16s ease, color 0.16s ease;
}

:where(html.is-hoverable) .setting-refresh:hover:not(:disabled) {
  background: var(--bg-control-hover);
  color: var(--text);
}

.setting-refresh:disabled {
  cursor: default;
  color: var(--text-faint);
}

/* -------------------------------------------------------- 模板
   一行 = 语言名 + 「恢复默认」+ 提示 + 一个多行文本框。整行竖排（.setting-row 默认是横排），
   故覆写 flex-direction；「恢复默认」靠 margin-left: auto 推到行右端。 */
.setting-row--template {
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
}

/* head 默认 align-items: baseline，和 28px 高的按钮对不齐，这里改成居中对齐 */
.setting-row--template .setting-row__head {
  align-items: center;
  row-gap: 6px;
}

/* 可折叠的那三行（2026-11-09）：行内只剩「语言名 + 箭头 + 恢复默认」，输入框在折叠体里。
   间距归折叠体自己管（见 `.setting-row__fold-inner` 的 padding-top）—— 留在这里的
   gap 在收起时不会跟着消失，会在头栏下面留一条空档。
   选择器写成两节是为了压过下面 `@container settings (max-width: 26rem)` 里那条
   `.setting-row { gap: 8px }`：同为单类、它排在更后面，窄屏上会把这条盖掉（实测
   收起态多出 8px 空白）。 */
.setting-row.setting-row--template-field {
  gap: 0;
}

/* 折叠头：语言名 + 箭头整块一颗按钮，热区比只点箭头大得多。
   外观全交给里面的 `.setting-row__label`，这颗按钮只负责布局与指针。 */
.setting-row__fold-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

/* 箭头：16px 下 chevron 的墨迹只有 4px 高（字形占 24 网格里的 12×6），配 14px 的标签
   正合适。展开朝下、收起转 -90° 朝右 —— 与 TestCaseCard 那颗折叠箭头同一手。 */
.setting-row__chevron {
  display: inline-flex;
  flex: 0 0 auto;
  color: var(--text-faint);
  transition: transform 0.18s ease, color 0.15s ease;
}

.setting-row__fold-toggle[aria-expanded='false'] .setting-row__chevron {
  transform: rotate(-90deg);
}

:where(html.is-hoverable) .setting-row__fold-toggle:hover .setting-row__chevron {
  color: var(--text-dim);
}

:where(html.is-hoverable) .setting-row__fold-toggle:hover .setting-row__label {
  color: var(--text);
}

/* 展开 / 收起：grid 行高 1fr ↔ 0fr。
   这是纯 CSS 里唯一能「过渡到内容高度」的写法 —— max-height 得先猜一个上限，猜大了
   折叠后半程在空转、猜小了直接把输入框截断，而这里的正文高度是活的（textarea 还能被
   用户拉高）。子项必须 min-height: 0 + overflow: hidden，否则 0fr 那一行仍被内容的最小
   高度撑着，收不下去。 */
.setting-row__fold {
  display: grid;
  grid-template-rows: 1fr;
  transition: grid-template-rows 0.2s ease;
}

.setting-row__fold:not(.is-open) {
  grid-template-rows: 0fr;
}

/* 收起后把输入框移出 Tab 序。不能用 `display: none`（不可过渡，展开那一下会硬跳），
   改成 visibility：延迟 0.2s 与行高动画同步 —— 收起过程中内容还看得见，收完才隐藏；
   展开时没有延迟，立刻可见。
   上下内边距要跟着收到 0：**padding 不可压缩**，min-height: 0 只把内容盒收到 0，
   0 + 10 那 10px 仍然撑着行 —— 不补这一脚，收起后会卡在头栏下面留一条空档。 */
.setting-row__fold-inner {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  overflow: hidden;
  padding-top: 10px;
  visibility: visible;
  transition: visibility 0s linear, padding 0.2s ease;
}

.setting-row__fold:not(.is-open) .setting-row__fold-inner {
  padding-top: 0;
  visibility: hidden;
  transition: visibility 0s linear 0.2s, padding 0.2s ease;
}

/* 「恢复默认」＝幽灵按钮：位置推到最后（语言名 + 箭头那一颗占左边），高度比正文按钮矮一档 */
.setting-row__restore {
  margin-left: auto;
  height: 24px;
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
  height: 220px;
  padding: 10px 11px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg-field);
  color: var(--text);
  font-family: var(--mono-font);
  font-size: 12.5px;
  line-height: 1.55;
  /* 软换行：设置视图自己就是滚动容器，别再套一层横向滚动 */
  white-space: pre-wrap;
  overflow: auto;
  resize: vertical;
  tab-size: 4;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.download-button.is-failed {
  border-color: transparent;
  color: var(--fail);
  background: transparent;
}

/* 卸载 / 解绑：危险动作直接用「红字 + 透明底 + 淡红描边」（规范 6），
   不再等悬停才变色 —— 用户在点之前就该看出这是不可逆的那一类。
   is-danger 只是语义别名，解绑按钮用它，样式与卸载完全同源。 */
.download-button.is-uninstall,
.download-button.is-danger {
  color: var(--danger-text);
  border-color: var(--danger-border);
  background: transparent;
}

:where(html.is-hoverable) .download-button.is-uninstall:hover:not(:disabled),
:where(html.is-hoverable) .download-button.is-danger:hover:not(:disabled) {
  color: var(--danger-text);
  border-color: var(--danger-text);
  background: var(--danger-bg);
}

.download-button.is-uninstall:disabled,
.download-button.is-danger:disabled {
  color: var(--text-faint);
  border-color: var(--border);
  background: transparent;
}

.is-spinning {
  animation: settings-spin 0.9s linear infinite;
}

/* 幽灵按钮：无描边、无底色，12px 次级灰的图标 + 文字，只在 hover 时浮一层浅底并提亮。
   给「恢复默认 / 复制地址」这类次要动作用 —— 同一行里已经有主按钮或说明文字，
   再摆一颗灰框按钮就会跟主操作抢注意力（2026-11-10 与「恢复默认」一并降权）。
   复制成功沿用 .is-copied 的绿字，但不画边框色：本来就没有边框。 */
.ghost-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  flex: 0 0 auto;
  height: 26px;
  padding: 0 8px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text-dim);
  font-size: 12px;
  white-space: nowrap;
  transition: background-color 0.16s ease, color 0.16s ease;
}

:where(html.is-hoverable) .ghost-button:hover:not(:disabled) {
  background: var(--bg-control-hover);
  color: var(--text);
}

.ghost-button:disabled {
  cursor: default;
  color: var(--text-faint);
}

.ghost-button.is-copied {
  background: transparent;
  color: var(--ok);
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
  height: 30px;
  padding: 0 11px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-field);
  color: var(--text);
  font-family: var(--ui-font);
  font-size: 12px;
  white-space: nowrap;
}

.shortcut-key.is-empty {
  color: var(--text-faint);
}

/* 快捷键分组里的只读键位徽标（`fixed`）：跟同一列的录制框对齐（.hotkey 是 28px /
   圆角 4 / 最小 124px）；.shortcut-key 本身的 30px 是配「组件」分组那些 30px 按钮的。
   当前没有渲染对象（三条 `fixed` 都 `hideInSettings`），规则连同那一支模板一起留着待用 */
.shortcut-key.is-fixed {
  justify-content: center;
  min-width: 124px;
  height: 28px;
  border-radius: 4px;
}

.setting-code {
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--bg-control);
  /* 等宽：`-O0`、URL、docker 命令这类技术文本，原本 font-family: inherit 会跟着正文
     走无衬线，和中文混排时看不出是「代码」。等宽之后一眼就能区分 */
  font-family: var(--mono-font);
  font-size: 11px;
}

/* ---------- 云端同步 ---------- */
/* 用户名输入框：与 .number-input 同观感，只是宽度按「he-jie」这种短 handle 给，
   并允许在窄面板里收缩（min-width: 0），免得把旁边的按钮顶出去 */
.text-input {
  min-width: 0;
  width: 168px;
  padding: 6px 10px;
  border-radius: 6px;
  background: var(--bg-field);
  border: 1px solid var(--border);
  font-size: 12.5px;
  color: var(--text);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.text-input::placeholder {
  color: var(--text-faint);
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
   排在第一个也照样被读成一串平级选项。所以给它一块内嵌的小卡片：只比页面亮一档，
   细描边，不再用左侧 accent 竖条那种装饰。深浅两套主题都只用既有变量，不新增颜色。

   版式是**纵向两段**（2026-10-23 重排）：上面「用户名 + 已绑定 + 云端最近更新」吃满整宽，
   下面一排按钮自己占一行。原先已绑定那张卡沿用 .setting-row--action 的「标签在左、控件在右」，
   而三颗按钮（下载到本机 / 上传本机设置 / 解绑）自身就要 294px —— 编辑器窄到 300px 上下时
   （用户 2026-10-23 的截图），flex 先把 __main 压成 0px，于是用户名断成 he- / jie、
   「已绑定」竖排三行、「云端最近更新：…」竖着排了十几行。改成纵向后信息块不再与按钮抢宽度，
   窄了只往下长，宽了也不会在中间空出一大片。
   ⚠️ 别退回 --action 的两端对齐：卡片是竖着长的，按钮要跟着文字靠左才落在同一条轴线上
   （`justify-content` 也得显式写 flex-start —— --action 给的 space-between 在纵向会把两段推开）。 */
.cloud-account {
  margin: 4px 18px 14px;
  padding: 14px;
  border: 1px solid var(--border-hairline);
  border-radius: 6px;
  background: var(--bg-panel);
  /* 顶部 1px 高光 + 极淡的斜向微光，让这张主卡从平面的页面底色里「浮」出来。
     只用半透明白，深浅两套主题都不需要新颜色 */
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 1px 3px rgba(0, 0, 0, 0.12);
  flex-direction: column;
  justify-content: flex-start;
  align-items: stretch;
  gap: 10px;
}

/* 卡片里的按钮组：右对齐是「标签在左」那套的产物，纵向排下来跟着文字靠左；
   宽度不够时照旧折行（flex-wrap 来自 .cloud-field），不再回头挤上面的文字 */
.cloud-account .cloud-field {
  justify-content: flex-start;
}

/* 内嵌卡片自己负责层次，别再叠行悬停的底色 */
:where(html.is-hoverable) .cloud-account:hover {
  background: var(--bg-panel);
}

/* 「he-jie 已绑定」这一行：允许的是**整块**掉到下一行，不是逐字换行。
   掐掉两者内部的换行（否则 he-jie 会断在连字符上、已绑定会被拆成三行），
   用户名过长时用省略号收尾，别把卡片撑破。 */
.cloud-account .setting-row__head {
  flex-wrap: wrap;
  row-gap: 2px;
}

.cloud-account .setting-row__label,
.cloud-account .setting-row__key {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* .setting-row--select 给控件留的负上边距在这里不适用：卡片已经改成纵向，
   输入框与按钮同属第二段，跟着正常文档流走 */
.cloud-account .setting-row__control {
  margin-top: 0;
}

/* 卡片里的输入框吃满剩余宽度：168px 的固定宽度在宽面板下会在卡片中间留一大片空白，
   反而把「这台设备认哪个用户名」衬得很轻。窄到放不下时靠 min-width 把「登录」挤到下一行 */
.cloud-account .text-input {
  flex: 1 1 auto;
  width: auto;
  min-width: 120px;
}

/* 公开取回地址栏：卡片底部的一段终端风地址框，把「网址后接 cfid」那句彩蛋从脚注里
   提到主卡内、做成可复制的一等公民。上沿一条极细虚线，与上面的账号信息区隔开。 */
.cloud-account__url {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px dashed var(--border-hairline);
}

.cloud-account__url-label {
  font-size: 11.5px;
  color: var(--text-faint);
}

/* 地址框：等宽 + 弱底，后缀 /<handle> 用 accent 高亮 */
.cloud-account__url-pill {
  display: inline-flex;
  align-items: center;
  gap: 0;
  flex: 1 1 auto;
  min-width: 0;
  padding: 3px 8px;
  border-radius: 4px;
  background: var(--bg-control);
  border: 1px solid var(--border);
  font-family: var(--mono-font);
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--text-dim);
  white-space: nowrap;
  overflow: hidden;
}

.cloud-account__url-base {
  overflow: hidden;
  text-overflow: ellipsis;
}

.cloud-account__url-pill strong {
  color: var(--accent-strong);
  font-weight: 600;
  flex: 0 0 auto;
}

.cloud-account__url-copy {
  height: 26px;
  padding: 0 9px;
  font-size: 12px;
  flex: 0 0 auto;
}

/* ---------- 开关偏好 Bento 网格 ----------
   预下载 / 默认安装这两组只有「标题 + 开关」，单列占满 640px 会在左右留一大片真空。
   收成紧凑多列小卡片：图标 + 名称在左、开关在右，点整卡切换；开启态带微弱 accent 亮边框。
   窄屏自动折成单列（minmax 下限），不与容器查询里的降级规则打架。 */
.bento-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 8px;
  margin: 2px 18px 12px;
}

.bento-item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--bg-panel);
  border: 1px solid var(--border-hairline);
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

:where(html.is-hoverable) .bento-item:hover {
  border-color: var(--border);
  background: var(--bg-control);
}

.bento-item:focus-visible {
  outline: 1px solid var(--accent-strong);
  outline-offset: 1px;
}

/* 开启态：微弱 accent 底色 + 亮边框，关态保持静默灰 */
.bento-item.is-active {
  background: color-mix(in srgb, var(--accent) 6%, transparent);
  border-color: color-mix(in srgb, var(--accent) 35%, var(--border-hairline));
}

.bento-item__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  color: var(--text-dim);
}

.bento-item__label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
}

/* 主按钮：实心 accent，与旁边描边的次要按钮（下载 / 解绑）一眼分开 */
.cloud-primary {
  border-color: transparent;
  background: var(--accent);
  color: var(--text-on-accent);
}

:where(html.is-hoverable) .cloud-primary:hover:not(:disabled) {
  border-color: transparent;
  background: var(--accent-hover);
}

.cloud-primary:disabled {
  background: var(--accent-deep);
  color: var(--text-on-accent);
  opacity: 0.6;
}

/* 取码那一步：把「码 / 步骤 / 代填」收进**一张**卡片（2026-10-19 重排）。
   原先码卡、警告句、代填按钮、步骤列表各占一段，同一列里五六块文字没有主次；
   收到一起之后，读者第一眼看到的是码，第二眼才是「拿它去干什么」。
   **外框照抄原 `.cloud-code`**（--border-soft / 7px / --bg-panel / 4px 18px 0 / 10px 12px）：
   这是这一栏原本就有的「验证码盒子」，不另立一套观感 —— 用户 2026-10-19 明确要求。
   深浅两套主题都用既有变量，不新增颜色。 */
.cloud-flow {
  display: flex;
  flex-direction: column;
  /* 下边 14：卡片与下面那排按钮之间留一口气（按钮行自己 margin-top 是 0，见 .cloud-footer） */
  margin: 4px 18px 14px;
  padding: 14px;
  border: 1px solid var(--border-hairline);
  border-radius: 6px;
  background: var(--bg-panel);
}

/* 标签与「复制」同一行：把唯一要抄走的东西顶到最上面 */
.cloud-flow__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.cloud-flow__label {
  font-size: 11.5px;
  color: var(--text-faint);
}

/* 码是本栏最大的一处字：等宽 + 放大 + 允许整段选中（点一下就把 CF-XXXXXX 全选上） */
.cloud-flow__code {
  display: block;
  margin-top: 2px;
  font-family: var(--mono-font);
  font-size: 22px;
  line-height: 1.25;
  letter-spacing: 0.1em;
  color: var(--text);
  user-select: all;
}

/* 时效一行：倒计时 + 频率限制，中间一个间隔点。11px 灰，不跟码抢注意力 */
.cloud-flow__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  margin: 6px 0 0;
  font-size: 11.5px;
  color: var(--text-faint);
}

/* 倒计时：等宽 + 定宽数字，免得 9:59 → 9:58 时整行抖一下。到点转 --warn 并换回正文字体
   —— 那时它显示的是「已过期，请重新取码」一句中文，不是时间了 */
.cloud-flow__timer {
  font-family: var(--mono-font);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  color: var(--text-dim);
}

.cloud-flow__timer.is-expired {
  font-family: inherit;
  font-variant-numeric: normal;
  color: var(--warn);
}

.cloud-flow__dot {
  color: var(--text-faint);
}

/* 卡片内部的两段（步骤 / 代填）各用一条极细的线分开，代替原先的两段大间距 */
.cloud-flow__block {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border-faint);
}

/* 「接下来」—— 只是一个引导词，压到最小 */
.cloud-flow__sub {
  margin: 0 0 6px;
  font-size: 11.5px;
  color: var(--text-faint);
}

/* 步骤：自绘编号圆点，不用 <ol> 的默认序数（那个缩进会让两行都挂在第一行下面），
   编号与文字用 grid 对齐，换行后第二行仍与文字左缘齐平 */
.cloud-flow__steps {
  display: grid;
  gap: 7px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-dim);
}

.cloud-flow__steps li {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
}

.cloud-flow__num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  margin-top: 1px;
  border-radius: 50%;
  background: var(--bg-control);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  color: var(--text-dim);
}

/* 步骤第一步里指向 Codeforces Social 设置页的那半句：同字号，只换颜色 + 悬停下划线 */
.cloud-flow__link {
  color: var(--accent-strong);
  text-decoration: none;
}

:where(html.is-hoverable) .cloud-flow__link:hover {
  text-decoration: underline;
}

/* 代填那一行：状态在左、按钮在右。按钮是**描边**次按钮 —— 实心 accent 只留给「验证」，
   否则卡片里两条实心蓝按钮互相抢主次（重排前就是这样） */
.cloud-flow__block--fill {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
}

.cloud-flow__status {
  flex: 1 1 160px;
  min-width: 0;
  font-size: 12px;
  color: var(--text-dim);
}

/* 取码预检那一行的结论色（见 cloudSession 的 cloudCfHint）：绿 = 已确认是这个账号；
   琥珀 = 点之前就知道会失败，与云端报错同一支 --warn。刻意没有红色 —— 这是事前提醒，
   不是已经发生的错误。两条 modifier 必须排在本体之后：同名权重，靠顺序覆盖 */
.cloud-flow__status--ok {
  color: var(--ok);
}

.cloud-flow__status--warn {
  color: var(--warn);
}

/* 卡片里空间有限：复制按钮比行内主按钮矮一档，免得把码压小；
   代填按钮多一个字、给 28px 与稍宽的内边距 */
.cloud-flow__copy {
  height: 26px;
  padding: 0 9px;
  font-size: 12px;
}

.cloud-flow__fill {
  height: 28px;
  padding: 0 10px;
  font-size: 12px;
}

/* 复制成功：转绿 + 对勾，两秒后 codeCopied 自己复位（与「应用」栏那颗同一套手感） */
.cloud-flow__copy.is-copied {
  border-color: var(--ok);
  background: transparent;
  color: var(--ok);
}

/* 验证码面板下面那一排按钮（不属于任何设置行，所以自己给左右内边距）。
   上下留白刻意不对称（2026-10-19 调）：**上 0、下 16** —— 上面那 8px 由卡片自己的下边距
   与状态行（`.setting-group__note`）的下边距给，所以到按钮是 8；而下面那句「上传后这份配置
   就是公开的」是脚注、另一个话题，得离远一点，不然会被读成按钮的说明（改前它是
   margin-bottom: 0，按钮直接压在脚注上）。注意 `.setting-group` 是 flex 列，
   **外边距不会塌陷**，这里的数就是实际像素。 */
.cloud-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin: 0 18px 16px;
}

/* 保存成功：与警告同一行位置，只换颜色 */
.setting-group__note--ok {
  color: var(--ok);
}

/* ---------- 危险区域（规范 6） ----------
   不可逆操作单独成卡：红描边（--danger-border）、透明底、标题走危险色；
   按钮本体复用 .download-button.is-danger 的「红字 + 透明底」。 */
.danger-zone {
  display: flex;
  flex-direction: column;
  min-width: 0;
  /* 左右 18 与云端账号卡对齐：红框不贴内容列（=面板）边缘，边框内再留 14 呼吸 */
  margin: 28px 18px 0;
  border: 1px solid var(--danger-border);
  border-radius: 6px;
  background: transparent;
  overflow: hidden;
}

/* 危险区里只有一条动作，行不再画分割线，也不吃悬浮底色（整张卡已经够醒目） */
.danger-zone .setting-row {
  padding: 14px;
}

:where(html.is-hoverable) .danger-zone .setting-row:hover {
  background: transparent;
}

/* 窄面板（手机、或桌面端侧栏展开后的编辑区）：两栏并排放不下，整行退回上下排。
   规范 1 的「左文右操作」只在有横向余量时成立 —— 硬撑两栏会让中文标题一字一行。
   但**退回上下排不等于放弃右对齐**：控件仍然贴行尾（`flex-end`），否则按钮掉到第二行最左边，
   手指要横跨整行才够得到，读起来也跟上面的标题断开（2026-10-30 改，原来靠左）。
   阈值用 rem：跟着界面缩放一起变。 */
@container settings (max-width: 26rem) {
  .setting-row,
  .setting-row--switch,
  .setting-row--select,
  .setting-row--number,
  .setting-row--action {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    min-height: 0;
  }

  .setting-row__control,
  .setting-row--select .setting-row__control,
  .setting-row--number .setting-row__control,
  .setting-row--switch .setting-row__control {
    margin-top: 0;
    align-self: stretch;
    justify-content: flex-end;
    flex-wrap: wrap;
  }

  .select,
  .select select,
  .number-input {
    width: 100%;
  }

  /* 150px 的下限在 130px 级的正文宽度里会把控件顶出卡片 */
  .select select {
    min-width: 0;
  }

  /* 运行环境行：图标 + 文字排一行，下载 / 卸载按钮落到第二行（同样贴行尾，见本节开头） */
  .runtime-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    grid-template-areas:
      'icon text'
      'actions actions';
    align-items: start;
    row-gap: 10px;
  }

  .runtime-row__icon {
    grid-area: icon;
  }

  .runtime-row__text {
    grid-area: text;
  }

  /* 撑满整行 + 内容靠右：`justify-self: end` 只会把它缩到内容宽，两颗按钮挤不下时会顶出卡片 */
  .runtime-row__actions {
    grid-area: actions;
    justify-self: stretch;
    justify-content: flex-end;
    flex-wrap: wrap;
  }
}

/* 极窄（约 360px 以下）：卡片自己也把左右留白收一档，
   否则「卡片外边距 + 行内边距」两层 18px 会把正文压到一百像素出头。 */
@container settings (max-width: 22.5rem) {
  .danger-zone {
    margin-left: 10px;
    margin-right: 10px;
  }

  .danger-zone .setting-row {
    padding-left: 10px;
    padding-right: 10px;
  }

  .setting-group__title,
  .setting-subtitle {
    padding-left: 12px;
    padding-right: 12px;
  }

  .setting-group__note {
    margin-left: 12px;
    margin-right: 12px;
  }

  .setting-row,
  .runtime-row {
    padding-left: 12px;
    padding-right: 12px;
  }

  /* 极窄时行内边距收到 12px，分割线的内缩要跟着一起收，否则又比文字短一截 */
  .setting-row + .setting-row::after,
  .setting-rows .setting-row + .setting-row::after,
  .runtime-row + .runtime-row::after {
    left: 12px;
    right: 12px;
  }

  .cloud-account,
  .cloud-flow {
    margin-left: 10px;
    margin-right: 10px;
    padding-left: 10px;
    padding-right: 10px;
  }

  .cloud-flow__code {
    font-size: 18px;
    letter-spacing: 0.05em;
  }
}

@keyframes settings-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ---------------------------------------------------------------- 应用 / 浏览器插件两栏的行容器
   这两栏原是一套单独的「卡片化」版式，2026-10-11 曾与其他栏一起压平成无框行；
   2026-10-24 设置页统一按新规范重做后，外框已经由整栏那张卡负责，行容器本身仍然只负责竖排。
   留下来的三样是这两栏自己的信息特征：状态胶囊、运行环境行的图标方块、
   「下载 / 卸载」按钮的实心与警示态。

   作用域提醒：.download-button / .switch 评测栏与云端栏也在用，所以这里只加 is-* 修饰类，
   不碰基类。 */

/* 一组成组的行：把行竖着摞起来，组与组之间靠 setting-subtitle 的留白分开；
   行与行之间的淡分割线见上面 .setting-row + .setting-row */
.setting-rows {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/* 状态短标签：圆点 + 一句话。比旁边那颗按钮弱一档，只说明状态、不承担点击 */
.app-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  padding: 2px 8px;
  border: 1px solid var(--border-faint);
  border-radius: 6px;
  /* 去背景填充、只留极细描边：状态徽章是辅助信息，实心底色会抢标题（2026-11-09 视觉精炼） */
  background: transparent;
  font-size: 12px;
  color: var(--text-dim);
  white-space: nowrap;
}

/* 状态框就放在标签底下（原来那行说明的位置）：列向 flex 默认会把它拉满整行宽，
   得自己收成内容宽；上面再留一点缝，别贴着标题 */
.setting-row__main > .app-status {
  align-self: flex-start;
  margin-top: 4px;
}

/* 行内状态点 / 标签里的圆点：is-* 挂在 .app-status 上，行内那颗自己带修饰类。
   灰（未装 / 不支持）就是下面的兜底色，不单独写 */
.app-status__dot,
.app-dot {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--text-faint);
}

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

/* 主按钮：下载这类「往前走」的动作是实心主题色。只写在 is-primary 这个修饰类上，
   不碰 .download-button 基类 —— 评测栏、云端栏的描边按钮不受影响 */
.download-button.is-primary {
  border-color: transparent;
  background: var(--accent);
  color: var(--text-on-accent);
}

:where(html.is-hoverable) .download-button.is-primary:hover:not(:disabled) {
  background: var(--accent-hover);
}

.download-button.is-primary:disabled {
  background: var(--bg-control);
  color: var(--text-faint);
}

/* 失败态要盖过上面的实心态（同样是三四个类，靠写在后面取胜）：这时不是「往前走」
   而是「重来一次」，只留一个警示色 */
.download-button.is-primary.is-failed {
  background: transparent;
  border-color: transparent;
  color: var(--fail);
}

/* 复制成功：按钮转绿 + 对勾（两秒后 shortcutsCopied 自己复位） */
.download-button.is-copied {
  border-color: var(--ok);
  background: transparent;
  color: var(--ok);
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 5px 14px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-panel);
  color: var(--text);
  font: 500 12.5px/1.5 var(--font-sans, system-ui);
  cursor: pointer;
}

:where(html.is-hoverable) .confirm__btn:hover {
  background: var(--bg-hover);
}

.confirm__btn--danger {
  border-color: transparent;
  background: var(--danger-bg);
  color: var(--danger-text);
}

:where(html.is-hoverable) .confirm__btn--danger:hover {
  background: var(--danger-bg-hover);
}

.confirm__btn:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
}
</style>