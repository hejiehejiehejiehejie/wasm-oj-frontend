<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import EngineSettingsPanel from './EngineSettingsPanel.vue'
import HelpPanel from './HelpPanel.vue'
import HotkeyRecorder from './HotkeyRecorder.vue'
import { usePersistentRef } from '../composables/usePersistentRef.js'
import { useInstallPrompt } from '../composables/useInstallPrompt.js'
import { useCompanionBridge } from '../composables/useCompanionBridge.js'
import { SHORTCUT_ACTIONS, useShortcutManager } from '../composables/useShortcutManager.js'
import { preload, probeRuntime, subscribeStatus, uninstallRuntime } from '../services/wasmRuntime.js'
import { TIME_LIMIT_OPTIONS } from '../services/runner.js'
import {
  CURSOR_BLINKINGS,
  CURSOR_STYLES,
  EDITOR_SETTING_RANGES,
  EDITOR_SETTINGS_DEFAULTS,
  FONT_FAMILIES,
  LINE_HEIGHT_RATIOS,
  LINE_HIGHLIGHTS,
  PADDINGS,
  SCROLLBAR_SIZES,
  THEMES,
  WHITESPACE_MODES,
  WRAP_MODES,
} from '../services/editorOptions.js'

const props = defineProps({
  settings: { type: Object, required: true },
  panelPosition: { type: String, required: true },
  // 全局运行时限（毫秒，只计运行段），与 App.vue 的 cph.timeLimitMs 同源
  timeLimit: { type: Number, required: true },
  // 评测引擎状态（引擎列表 / 服务地址 / 自检结果）从 App 一路传下来，
  // 与侧边栏「评测样例」面板读到的是同一份
  judge: { type: Object, required: true },
  connection: { type: Object, required: true },
  // 设置视图此刻是否真的显示在编辑器里（合成页签被切走时为 false）。
  // 组件本身用 v-show 常驻挂载，靠这个 prop 决定何时重新核对本地运行环境。
  active: Boolean,
})

const emit = defineEmits([
  'update:settings',
  'update:time-limit',
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
    title: '外观',
    rows: [
      {
        key: 'theme',
        label: '主题',
        hint: '切换深色与浅色两套配色（默认：深色）',
        control: 'select',
        options: THEMES,
      },
      {
        key: 'fontFamily',
        label: '字体',
        hint: '代码编辑器使用的等宽字体',
        control: 'select',
        options: FONT_FAMILIES,
      },
      {
        key: 'fontSize',
        label: '字体大小',
        hint: '代码主字体大小（默认：14px，范围 8–32）',
        control: 'number',
      },
      {
        key: 'lineHeightRatio',
        label: '行高',
        hint: '行间距相对字号的倍数',
        control: 'select',
        options: LINE_HEIGHT_RATIOS.map((ratio) => ({ id: ratio, label: `${ratio} 倍` })),
      },
      {
        key: 'fontLigatures',
        label: '字体连写',
        hint: '将 => 或 != 等符号渲染为连贯的数学符号（需当前字体支持，如 Fira Code）',
        control: 'switch',
      },
    ],
  },
  {
    title: '编辑',
    rows: [
      {
        key: 'tabSize',
        label: '缩进宽度',
        hint: '制表符的视觉宽度，也用于自动缩进的空格数（默认：4）',
        control: 'select',
        options: [2, 4, 8].map((size) => ({ id: size, label: `${size} 空格` })),
      },
      {
        key: 'insertSpaces',
        label: '空格代替 Tab',
        hint: '开启后按 Tab 插入空格、关闭则插入制表符（默认：关闭，按 Tab 出制表符）',
        control: 'switch',
      },
      {
        key: 'wordWrap',
        label: '自动换行',
        hint: '代码超长时自动折行显示，避免横向滚动',
        control: 'select',
        options: WRAP_MODES,
      },
      {
        key: 'wordWrapColumn',
        label: '换行列宽',
        hint: '仅在「按列宽换行」模式下生效，超过该列数即折行（默认：80）',
        control: 'number',
      },
      {
        key: 'bracketPairColorization',
        label: '括号配色',
        hint: '为嵌套的括号对分配不同颜色，便于区分层级',
        control: 'switch',
      },
      {
        key: 'indentGuides',
        label: '缩进参考线',
        hint: '在缩进层级的左侧绘制竖向引导线',
        control: 'switch',
      },
      {
        key: 'bracketGuides',
        label: '括号引导线',
        hint: '在光标所在的括号对之间绘制连接线，仅当前层级',
        control: 'switch',
      },
      {
        key: 'stickyScroll',
        label: '粘性滚动',
        hint: '滚动时把当前代码所在的外层函数 / 类钉在编辑器顶部',
        control: 'switch',
      },
      {
        key: 'scrollBeyondLastLine',
        label: '滚过最后一行',
        hint: '开启后可在最后一行下方继续滚动出空白区域（默认：关闭）',
        control: 'switch',
      },
      {
        key: 'smoothScrolling',
        label: '平滑滚动',
        hint: '滚动时启用过渡动画，避免内容瞬间跳变',
        control: 'switch',
      },
    ],
  },
  {
    title: '光标与高亮',
    rows: [
      {
        key: 'cursorStyle',
        label: '光标样式',
        hint: '文本插入点的形状',
        control: 'select',
        options: CURSOR_STYLES,
      },
      {
        key: 'cursorBlinking',
        label: '光标闪烁方式',
        hint: '文本插入点的闪烁动画样式',
        control: 'select',
        options: CURSOR_BLINKINGS,
      },
      {
        key: 'cursorSmoothCaretAnimation',
        label: '光标平滑移动',
        hint: '打字时启用光标移动的过渡动画',
        control: 'switch',
      },
      {
        key: 'renderLineHighlight',
        label: '当前行突出',
        hint: '高亮显示光标所在行',
        control: 'select',
        options: LINE_HIGHLIGHTS,
      },
      {
        key: 'renderWhitespace',
        label: '空白字符',
        hint: '显示空格与制表符等不可见字符',
        control: 'select',
        options: WHITESPACE_MODES,
      },
    ],
  },
  {
    title: '视图',
    rows: [
      {
        key: 'minimap',
        label: '代码缩略图',
        hint: '在编辑器右侧展示全局代码结构的微缩导航（默认：关闭）',
        control: 'switch',
      },
      { key: 'padding', label: '内边距', hint: '编辑器内容与边框之间的留白', control: 'select', options: PADDINGS },
      { key: 'scrollbarSize', label: '滚动条粗细', hint: '编辑器滚动条的宽度', control: 'select', options: SCROLLBAR_SIZES },
    ],
  },
]

// 统一侧边栏的位置偏好存在 App.vue 的 cph.panelPosition 里，这里只负责发起一次对调
const PANEL_POSITIONS = [
  { id: 'right', label: '右侧' },
  { id: 'left', label: '左侧' },
]

// 设置分类目录：左侧导航项与右侧内容一一对应，点哪一项就只渲染那一组设置。
// activeSection 只活在这个组件里（不落 localStorage）：设置视图本来就是常驻挂载的，
// 一次会话里切来切去能记住上次看的那一类，关掉页签再打开也不丢。
const SECTIONS = [
  { id: 'editor', title: '编辑器', icon: 'code' },
  { id: 'layout', title: '布局', icon: 'sidebar' },
  { id: 'shortcuts', title: '快捷键', icon: 'keyboard' },
  { id: 'judge', title: '评测', icon: 'check' },
  { id: 'runtime', title: '本地运行环境', icon: 'download' },
  { id: 'extension', title: '浏览器插件', icon: 'plugin' },
  { id: 'app', title: '应用', icon: 'install' },
  { id: 'help', title: '帮助', icon: 'help' },
]

const activeSection = ref('editor')

// 站点内快捷键：绑定表与冲突规则都在 useShortcutManager 里，这里只做界面。
// 录制、冲突红字、阻止绑定都收在 HotkeyRecorder 内部（它要一边录一边校验）。
const { resetAll } = useShortcutManager()

// 安装到设备（2026-09 顶栏删除后从顶栏那颗按钮搬进来的）：浏览器判定可安装时才亮出来
const { canInstall, install } = useInstallPrompt()

// ------------------------------------------------------------ 浏览器插件
// 安装包放在 public/extension/ 下。文件名带版本号是刻意的：Service Worker 对同源 GET 走
// cacheFirst 且从不重新校验，不带版本号的 URL 会把旧包一直喂给已经来过的用户。
// 发新版插件时只需改这两个常量，再把新 zip 拷进 public/extension/。
const EXTENSION_VERSION = '2.65.1'
const EXTENSION_FILE = `cc-for-web-${EXTENSION_VERSION}.zip`
const EXTENSION_DOWNLOAD_URL = `/extension/${EXTENSION_FILE}`

// 扩展对外只暴露 _execute_action 这类内部 id，中文名只能在这边维护
const EXTENSION_COMMAND_LABELS = {
  _execute_action: '解析当前页面题目',
}

const { extensionInfo, checking: extensionChecking, refresh: refreshExtension } = useCompanionBridge()

const extensionStatusHint = computed(() => {
  if (extensionChecking.value) return '检测中…'
  if (!extensionInfo.value) return '未检测到；装好后需要刷新本页才会被检测到'
  return `已安装 v${extensionInfo.value.version}`
})

const extensionShortcuts = computed(() =>
  (extensionInfo.value?.commands ?? []).map((command) => ({
    name: command.name,
    label: EXTENSION_COMMAND_LABELS[command.name] || command.description || command.name,
    shortcut: command.shortcut,
  })),
)

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

// 插件可能在页面打开之后才装上或才被重载，所以每次切到这一栏都重探一次
watch(activeSection, (section) => {
  if (section === 'extension') refreshExtension()
})

onBeforeUnmount(() => window.clearTimeout(copyTimer))

// ------------------------------------------------------------ 本地运行环境
// 「是否已下载」不再只看一个 localStorage 布尔标记（它会过期：浏览器随时可能清缓存，
// 而标记还留着）。真正的判据是 probeRuntime() 的只读缓存探针；localStorage 标记只用来
// 给首帧播种，避免面板先闪一下「下载」再跳成「已就绪」。
const RUNTIMES = [
  {
    id: 'cpp',
    title: 'C++',
    icon: 'cpp',
    readyFlag: 'cph.localRuntime.clangReady',
    idleHint: 'clang 8 + libc++，约 50MB，只下一次',
    downloadTitle: '下载 clang 工具链',
    uninstallHint: '将从本机删除已缓存的 clang 工具链（约 50MB，另含编译加速用的预编译头）。下次运行 C++ 代码时需要重新下载。',
  },
  {
    id: 'python',
    title: 'Python 3',
    icon: 'python',
    readyFlag: 'cph.localRuntime.pythonReady',
    idleHint: 'CPython 3.11 + 标准库，约 24MB，只下一次',
    downloadTitle: '下载 Python 运行时',
    uninstallHint: '将从本机删除已缓存的 Python 运行时（解释器 + 标准库，约 24MB）。下次运行 Python 代码时需要重新下载。',
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

// 沙箱实时阶段播报（download / compile / run），下载中的那一行靠它显示进度文案
const live = ref({ stage: 'idle', message: '' })

const downloadingAny = computed(() =>
  runtimeEntries.some((entry) => entry.state.value === 'downloading'),
)

function hintFor(entry) {
  if (entry.state.value === 'downloading') return live.value.message || '正在下载…'
  if (entry.state.value === 'ready') {
    return entry.elapsedMs.value
      ? `运行环境已就绪，用时 ${(entry.elapsedMs.value / 1000).toFixed(1)} s`
      : '运行环境已就绪'
  }
  if (entry.state.value === 'failed') return entry.failureReason.value || '下载失败'
  return entry.idleHint
}

function buttonLabel(entry) {
  if (entry.state.value === 'downloading') return '下载中…'
  if (entry.state.value === 'ready') return '已就绪'
  if (entry.state.value === 'failed') return '重试'
  return '下载'
}

function buttonIcon(entry) {
  if (entry.state.value === 'ready') return 'check'
  if (entry.state.value === 'failed') return 'reset'
  return 'download'
}

// 下载就是把该语言的资产拉进缓存，之后引擎评测和这里共用同一份，不需要常驻 Worker。
async function downloadRuntime(entry) {
  if (downloadingAny.value || entry.state.value === 'ready') return
  entry.state.value = 'downloading'
  entry.failureReason.value = ''
  const message = await preload(entry.id)
  if (message.type === 'ready') {
    entry.state.value = 'ready'
    entry.elapsedMs.value = message.durationMs ?? 0
    entry.readyFlagRef.value = true
    return
  }
  entry.state.value = 'failed'
  entry.failureReason.value = message.message || '下载失败'
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
  await uninstallRuntime(entry.id)
  entry.state.value = 'idle'
  entry.elapsedMs.value = 0
  entry.failureReason.value = ''
  entry.readyFlagRef.value = false
}

// 弹窗一出现就把焦点放到「卸载」上：Enter 确认、Esc 取消都能纯键盘走完
watch(pendingUninstall, (entry) => {
  if (entry) nextTick(() => uninstallBtn.value?.focus())
})

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
    if (active) void reconcile()
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

function limitLabel(ms) {
  return `${ms / 1000} s`
}

function setTimeLimit(event) {
  emit('update:time-limit', Number(event.target.value))
}
</script>

<template>
  <!-- 设置是个普通页签，内容就铺在编辑区里（Monaco 被 v-show 让开）。
       原来是 Teleport 到 body 的右侧抽屉，改成视图后不再有遮罩、头部和「完成」按钮：
       关它靠页签上的 ×，改动本来就即时生效，不需要一个「确认」动作。 -->
  <div class="settings-view" role="region" aria-label="设置">
    <div class="settings-view__inner">
      <!-- 目录：点哪一项，右边就只渲染那一组设置（原来是四段纵向平铺） -->
      <nav class="settings-nav" aria-label="设置分类">
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
          <span class="settings-nav__label">{{ section.title }}</span>
        </button>
      </nav>

      <section v-if="activeSection === 'editor'" class="setting-group">
        <p class="setting-group__title">编辑器</p>

        <template v-for="(group, index) in EDITOR_GROUPS" :key="group.title">
          <p class="setting-subtitle" :class="{ 'setting-subtitle--first': index === 0 }">
            {{ group.title }}
          </p>

          <label
            v-for="row in group.rows"
            :key="row.key"
            class="setting-row"
            :class="[`setting-row--${row.control}`, { 'is-modified': isModified(row) }]"
          >
            <span class="setting-row__main">
              <span class="setting-row__head">
                <span class="setting-row__label">{{ row.label }}</span>
                <span class="setting-row__key">{{ row.key }}</span>
              </span>
              <span v-if="row.hint" class="setting-row__hint">{{ row.hint }}</span>
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
                    {{ item.label }}
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
                :aria-label="row.label"
                @click="set(row.key, !settings[row.key])"
              >
                <span class="switch__thumb"></span>
              </button>
            </span>
          </label>
        </template>
      </section>

      <section v-else-if="activeSection === 'layout'" class="setting-group">
        <p class="setting-group__title">布局</p>

        <label class="setting-row setting-row--select">
          <span class="setting-row__main">
            <span class="setting-row__head">
              <span class="setting-row__label">侧边栏位置</span>
            </span>
            <span class="setting-row__hint">资源管理器与评测样例放在编辑区的左侧还是右侧</span>
          </span>
          <span class="setting-row__control">
            <span class="select">
              <select :value="panelPosition" @change="setPanelPosition">
                <option v-for="item in PANEL_POSITIONS" :key="item.id" :value="item.id">
                  {{ item.label }}
                </option>
              </select>
              <AppIcon name="chevron" :size="12" class="select__chevron" />
            </span>
          </span>
        </label>
      </section>

      <section v-else-if="activeSection === 'shortcuts'" class="setting-group">
        <p class="setting-group__title">快捷键</p>
        <p class="setting-group__note">
          点右侧输入框后按下组合键即可改绑；按 Delete 清除绑定，按 Esc 取消录制。
          与浏览器自带快捷键或其他功能冲突时会拒绝绑定并给出原因。
        </p>

        <div
          v-for="action in SHORTCUT_ACTIONS"
          :key="action.id"
          class="setting-row setting-row--action"
        >
          <span class="setting-row__main">
            <span class="setting-row__head">
              <span class="setting-row__label">{{ action.label }}</span>
            </span>
            <span v-if="action.hint" class="setting-row__hint">{{ action.hint }}</span>
          </span>
          <span class="setting-row__control">
            <HotkeyRecorder :action-id="action.id" />
          </span>
        </div>

        <div class="setting-row setting-row--action">
          <span class="setting-row__main">
            <span class="setting-row__head">
              <span class="setting-row__label">恢复默认</span>
            </span>
            <span class="setting-row__hint">把上面所有快捷键还原成初始设置</span>
          </span>
          <span class="setting-row__control">
            <button class="download-button" title="恢复默认快捷键" @click="resetAll">
              <AppIcon name="reset" :size="13" />
              <span>恢复默认</span>
            </button>
          </span>
        </div>
      </section>

      <section v-else-if="activeSection === 'judge'" class="setting-group">
        <p class="setting-group__title">评测</p>

        <label class="setting-row setting-row--select">
          <span class="setting-row__main">
            <span class="setting-row__head">
              <span class="setting-row__label">运行时限</span>
            </span>
            <span class="setting-row__hint">只计程序运行阶段，不含编译</span>
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

        <p class="setting-subtitle">评测引擎</p>
        <EngineSettingsPanel
          :judge="judge"
          :connection="connection"
          @select-engine="emit('select-engine', $event)"
          @update-base="emit('update-base', $event)"
          @test-connection="emit('test-connection')"
        />
      </section>

      <section v-else-if="activeSection === 'runtime'" class="setting-group">
        <p class="setting-group__title">本地运行环境</p>
        <p class="setting-group__note">在浏览器里直接编译运行，代码不出本机。</p>

        <div class="runtime-list">
          <div v-for="entry in runtimeEntries" :key="entry.id" class="runtime-row">
            <span class="runtime-row__icon" :class="`is-${entry.icon}`">
              <AppIcon :name="entry.icon" :size="15" />
            </span>
            <span class="runtime-row__text">
              <span class="runtime-row__title">{{ entry.title }}</span>
              <span class="runtime-row__hint">{{ hintFor(entry) }}</span>
            </span>
            <div class="runtime-row__actions">
              <button
                class="download-button"
                :class="{
                  'is-ready': entry.state.value === 'ready',
                  'is-failed': entry.state.value === 'failed',
                }"
                :disabled="downloadingAny || entry.state.value === 'ready'"
                :title="entry.state.value === 'ready' ? '本地运行环境已就绪' : entry.downloadTitle"
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
                :title="`卸载${entry.title}运行环境`"
                @click="requestUninstall(entry)"
              >
                <AppIcon name="trash" :size="13" />
                <span>卸载</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <section v-else-if="activeSection === 'app'" class="setting-group">
        <p class="setting-group__title">应用</p>
        <p class="setting-group__note">
          装到这台设备后，可以从主屏幕 / 桌面直接以独立窗口打开，离线也能用。
        </p>

        <div class="setting-row setting-row--action">
          <span class="setting-row__main">
            <span class="setting-row__head">
              <span class="setting-row__label">安装到设备</span>
            </span>
            <span class="setting-row__hint">
              {{
                canInstall
                  ? '当前浏览器支持安装，点右侧按钮即可'
                  : '当前浏览器不支持安装，或已经装好了'
              }}
            </span>
          </span>
          <span class="setting-row__control">
            <button class="download-button" :disabled="!canInstall" title="安装到设备" @click="install">
              <AppIcon name="install" :size="15" />
              <span>{{ canInstall ? '安装' : '已安装' }}</span>
            </button>
          </span>
        </div>
      </section>

      <section v-else-if="activeSection === 'extension'" class="setting-group">
        <p class="setting-group__title">浏览器插件</p>
        <p class="setting-group__note">
          装好插件后，在任意 OJ 题目页点插件图标，解析出来的题面、样例和限制会直接送进这个网站，不用手抄。
        </p>

        <div class="setting-row setting-row--action">
          <span class="setting-row__main">
            <span class="setting-row__head">
              <span class="setting-row__label">安装状态</span>
            </span>
            <span class="setting-row__hint">{{ extensionStatusHint }}</span>
          </span>
          <span class="setting-row__control">
            <button
              class="download-button"
              :disabled="extensionChecking"
              title="重新检测插件"
              @click="refreshExtension"
            >
              <AppIcon name="reset" :size="13" :class="{ 'is-spinning': extensionChecking }" />
              <span>{{ extensionChecking ? '检测中' : '重新检测' }}</span>
            </button>
          </span>
        </div>

        <div class="setting-row setting-row--action">
          <span class="setting-row__main">
            <span class="setting-row__head">
              <span class="setting-row__label">下载插件</span>
            </span>
            <span class="setting-row__hint">
              装上后需在 chrome://extensions 打开「开发者模式」，用「加载已解压的扩展程序」选中解压出来的目录。
              插件不在应用商店里，所以没法一键安装。
            </span>
          </span>
          <span class="setting-row__control">
            <a class="download-button" :href="EXTENSION_DOWNLOAD_URL" :download="EXTENSION_FILE">
              <AppIcon name="download" :size="15" />
              <span>下载</span>
            </a>
          </span>
        </div>

        <template v-if="extensionInfo">
          <p class="setting-subtitle">插件快捷键</p>

          <ul class="shortcut-list">
            <li v-for="command in extensionShortcuts" :key="command.name" class="shortcut-list__item">
              <span class="shortcut-list__label">{{ command.label }}</span>
              <kbd class="shortcut-list__keys">{{ command.shortcut || '未设置' }}</kbd>
            </li>
          </ul>

          <p class="setting-group__note">
            插件快捷键由浏览器管理，网页没有权限改写，也没有权限跳转到
            <code class="setting-code">chrome://extensions/shortcuts</code>
            （浏览器会拦掉指向 chrome:// 的跳转）。只能复制地址后自己到地址栏粘贴打开。
          </p>

          <div class="setting-row setting-row--action">
            <span class="setting-row__main">
              <span class="setting-row__head">
                <span class="setting-row__label">快捷键设置页</span>
              </span>
              <span class="setting-row__hint">
                {{ shortcutsCopied ? '已复制，粘贴到地址栏回车即可' : '复制后在地址栏粘贴打开' }}
              </span>
            </span>
            <span class="setting-row__control">
              <button class="download-button" title="复制 chrome://extensions/shortcuts" @click="copyShortcutsUrl">
                <AppIcon name="copy" :size="13" />
                <span>{{ shortcutsCopied ? '已复制' : '复制地址' }}</span>
              </button>
            </span>
          </div>
        </template>
      </section>

      <section v-else-if="activeSection === 'help'" class="setting-group">
        <p class="setting-group__title">帮助</p>
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
          <p id="uninstall-title" class="confirm__title">卸载 {{ pendingUninstall.title }} 运行环境？</p>
          <p id="uninstall-desc" class="confirm__desc">{{ pendingUninstall.uninstallHint }}</p>
          <div class="confirm__actions">
            <button type="button" class="confirm__btn" @click="cancelUninstall">取消</button>
            <button
              ref="uninstallBtn"
              type="button"
              class="confirm__btn confirm__btn--danger"
              @click="confirmUninstall"
            >
              卸载
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
  /* 「目录 / 内容」是两栏，窄宽度下要降级成顶部标签条。宽度判断交给容器查询：
     设置视图活在编辑区里，它的宽度只是编辑区宽度的一部分，拿视口 media query 当代理是错的。 */
  container-type: inline-size;
  container-name: settings;
}

/* 目录 + 内容：左栏是分类导航（sticky 跟着滚动），右栏只放当前选中的那一组设置。
   max-width 只用来防止宽面板上控件飘到很远（设置行是「标签靠左、控件靠右」的两端对齐）。 */
.settings-view__inner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  max-width: 880px;
}

.settings-nav {
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 0 0 auto;
  width: 168px;
  padding: 12px 12px 12px 18px;
}

.settings-nav__item {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
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

/* 同一时刻只渲染一组设置（v-if / v-else-if），所以它自己就是右栏那一格：
   吃掉剩余宽度，但不超过 max-width，免得控件被推到很远。 */
.setting-group {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-width: 0;
  max-width: 640px;
}

/* 编辑区被挤窄时（比如手机上两栏并排），目录从左侧竖排换成顶部横向标签条 */
@container settings (max-width: 560px) {
  .settings-view__inner {
    flex-direction: column;
    gap: 0;
  }

  .settings-nav {
    position: static;
    flex-direction: row;
    gap: 4px;
    width: auto;
    max-width: 100%;
    overflow-x: auto;
    padding: 10px 18px 2px;
  }

  .settings-nav__item {
    flex: 0 0 auto;
    height: 28px;
  }

  .setting-group {
    max-width: none;
    width: 100%;
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

/* 已就绪时右侧是「已就绪 + 卸载」两颗，窄面板下文字先让位、按钮不折行 */
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

.download-button.is-ready {
  border-color: transparent;
  color: var(--ok);
  background: transparent;
}

.download-button.is-failed {
  border-color: transparent;
  color: var(--fail);
  background: transparent;
}

/* 卸载：中性描边，悬停才转成危险色，免得和旁边的「已就绪」抢注意力 */
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

.shortcut-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.shortcut-list__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 28px;
  padding: 0 11px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--bg-control);
}

.shortcut-list__label {
  min-width: 0;
  overflow: hidden;
  color: var(--text);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shortcut-list__keys {
  flex: 0 0 auto;
  padding: 1px 6px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-control-hover);
  color: var(--text-faint);
  font-family: inherit;
  font-size: 11px;
}

.setting-code {
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--bg-control);
  font-family: inherit;
  font-size: 11px;
}

@keyframes settings-spin {
  to {
    transform: rotate(360deg);
  }
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