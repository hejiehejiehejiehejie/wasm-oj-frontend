<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import EngineSettingsPanel from './EngineSettingsPanel.vue'
import HelpPanel from './HelpPanel.vue'
import { usePersistentRef } from '../composables/usePersistentRef.js'
import { useInstallPrompt } from '../composables/useInstallPrompt.js'
import { preload, probeRuntime, subscribeStatus } from '../services/wasmRuntime.js'
import { TIME_LIMIT_OPTIONS } from '../services/runner.js'
import {
  CURSOR_BLINKINGS,
  CURSOR_STYLES,
  EDITOR_SETTING_RANGES,
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
      { key: 'theme', label: '主题', control: 'select', options: THEMES },
      { key: 'fontFamily', label: '字体', control: 'select', options: FONT_FAMILIES },
      { key: 'fontSize', label: '字体大小', control: 'number' },
      {
        key: 'lineHeightRatio',
        label: '行高',
        control: 'select',
        options: LINE_HEIGHT_RATIOS.map((ratio) => ({ id: ratio, label: `${ratio} 倍` })),
      },
      {
        key: 'fontLigatures',
        label: '连字',
        hint: '要选带连字功能的字体（如 Fira Code）才看得出来',
        control: 'switch',
      },
    ],
  },
  {
    title: '编辑',
    rows: [
      {
        key: 'tabSize',
        label: 'Tab 宽度',
        control: 'select',
        options: [2, 4, 8].map((size) => ({ id: size, label: `${size} 空格` })),
      },
      { key: 'insertSpaces', label: '用空格代替 Tab', hint: '关掉后按 Tab 键输入制表符', control: 'switch' },
      { key: 'wordWrap', label: '自动换行', control: 'select', options: WRAP_MODES },
      { key: 'wordWrapColumn', label: '换行列宽', hint: '只在「按列宽换行」下生效', control: 'number' },
      { key: 'bracketPairColorization', label: '括号对着色', control: 'switch' },
      { key: 'indentGuides', label: '缩进参考线', control: 'switch' },
      { key: 'bracketGuides', label: '括号对参考线', hint: '只画光标所在的那一层', control: 'switch' },
      {
        key: 'stickyScroll',
        label: '粘性滚动',
        hint: '滚动时把外层作用域钉在顶部',
        control: 'switch',
      },
      {
        key: 'scrollBeyondLastLine',
        label: '允许滚过最后一行',
        hint: '关掉后到底即停',
        control: 'switch',
      },
      { key: 'smoothScrolling', label: '平滑滚动', control: 'switch' },
    ],
  },
  {
    title: '光标与高亮',
    rows: [
      { key: 'cursorStyle', label: '光标样式', control: 'select', options: CURSOR_STYLES },
      { key: 'cursorBlinking', label: '光标闪烁', control: 'select', options: CURSOR_BLINKINGS },
      { key: 'cursorSmoothCaretAnimation', label: '光标平滑移动', control: 'switch' },
      { key: 'renderLineHighlight', label: '当前行突出', control: 'select', options: LINE_HIGHLIGHTS },
      { key: 'renderWhitespace', label: '空白字符', control: 'select', options: WHITESPACE_MODES },
    ],
  },
  {
    title: '视图',
    rows: [
      {
        key: 'minimap',
        label: '缩略图 (Minimap)',
        hint: '在编辑器右侧显示代码地图',
        control: 'switch',
      },
      { key: 'padding', label: '内边距', control: 'select', options: PADDINGS },
      { key: 'scrollbarSize', label: '滚动条粗细', control: 'select', options: SCROLLBAR_SIZES },
    ],
  },
  {
    title: '代码辅助',
    rows: [
      { key: 'quickSuggestions', label: '输入时补全', control: 'switch' },
      { key: 'parameterHints', label: '参数提示', control: 'switch' },
      { key: 'linkedEditing', label: '标签联动编辑', hint: '改开标签时同步改闭合标签', control: 'switch' },
      { key: 'inlineSuggest', label: '行内建议', control: 'switch' },
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
  { id: 'judge', title: '评测', icon: 'check' },
  { id: 'runtime', title: '本地运行环境', icon: 'download' },
  { id: 'app', title: '应用', icon: 'install' },
  { id: 'help', title: '帮助', icon: 'help' },
]

const activeSection = ref('editor')

// 安装到设备（2026-09 顶栏删除后从顶栏那颗按钮搬进来的）：浏览器判定可安装时才亮出来
const { canInstall, install } = useInstallPrompt()

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
  },
  {
    id: 'python',
    title: 'Python 3',
    icon: 'python',
    readyFlag: 'cph.localRuntime.pythonReady',
    idleHint: 'CPython 3.11 + 标准库，约 24MB，只下一次',
    downloadTitle: '下载 Python 运行时',
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

          <label v-for="row in group.rows" :key="row.key" class="setting-row">
            <span class="setting-row__label">
              {{ row.label }}
              <span v-if="row.hint" class="setting-row__hint">{{ row.hint }}</span>
            </span>

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
          </label>
        </template>
      </section>

      <section v-else-if="activeSection === 'layout'" class="setting-group">
        <p class="setting-group__title">布局</p>

        <label class="setting-row">
          <span class="setting-row__label">
            侧边栏位置
            <span class="setting-row__hint">资源管理器与评测样例放在编辑区的左侧还是右侧</span>
          </span>
          <span class="select">
            <select :value="panelPosition" @change="setPanelPosition">
              <option v-for="item in PANEL_POSITIONS" :key="item.id" :value="item.id">
                {{ item.label }}
              </option>
            </select>
            <AppIcon name="chevron" :size="12" class="select__chevron" />
          </span>
        </label>
      </section>

      <section v-else-if="activeSection === 'judge'" class="setting-group">
        <p class="setting-group__title">评测</p>

        <label class="setting-row">
          <span class="setting-row__label">
            运行时限
            <span class="setting-row__hint">只计程序运行阶段，不含编译</span>
          </span>
          <span class="select">
            <select :value="timeLimit" @change="setTimeLimit">
              <option v-for="ms in TIME_LIMIT_OPTIONS" :key="ms" :value="ms">
                {{ limitLabel(ms) }}
              </option>
            </select>
            <AppIcon name="chevron" :size="12" class="select__chevron" />
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
          </div>
        </div>
      </section>

      <section v-else-if="activeSection === 'app'" class="setting-group">
        <p class="setting-group__title">应用</p>
        <p class="setting-group__note">
          装到这台设备后，可以从主屏幕 / 桌面直接以独立窗口打开，离线也能用。
        </p>

        <div class="setting-row">
          <span class="setting-row__label">
            安装到设备
            <span class="setting-row__hint">
              {{
                canInstall
                  ? '当前浏览器支持安装，点右侧按钮即可'
                  : '当前浏览器不支持安装，或已经装好了'
              }}
            </span>
          </span>
          <button class="download-button" :disabled="!canInstall" title="安装到设备" @click="install">
            <AppIcon name="install" :size="15" />
            <span>{{ canInstall ? '安装' : '已安装' }}</span>
          </button>
        </div>
      </section>

      <section v-else-if="activeSection === 'help'" class="setting-group">
        <p class="setting-group__title">帮助</p>
        <HelpPanel />
      </section>
    </div>
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

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 46px;
  padding: 0 18px;
}

.setting-row + .setting-row {
  border-top: 1px solid var(--border-soft);
}

.setting-row__label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
}

.setting-row__hint {
  font-size: 11px;
  color: var(--text-faint);
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

.is-spinning {
  animation: settings-spin 0.9s linear infinite;
}

@keyframes settings-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>