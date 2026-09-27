<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { usePersistentRef } from '../composables/usePersistentRef.js'
import { preload, probeRuntime, subscribeStatus } from '../services/wasmRuntime.js'
import { TIME_LIMIT_OPTIONS } from '../services/runner.js'

const props = defineProps({
  settings: { type: Object, required: true },
  panelPosition: { type: String, required: true },
  // 全局运行时限（毫秒，只计运行段），与 App.vue 的 cph.timeLimitMs 同源
  timeLimit: { type: Number, required: true },
  // 设置视图此刻是否真的显示在编辑器里（合成页签被切走时为 false）。
  // 组件本身用 v-show 常驻挂载，靠这个 prop 决定何时重新核对本地运行环境。
  active: Boolean,
})

const emit = defineEmits([
  'update:settings',
  'update:time-limit',
  'toggle-layout',
])

// 主题决定的是整套界面配色（见 styles/base.css 的变量），所以只有深 / 浅两套
const THEMES = [
  { id: 'cph-dark', label: '深色（默认）' },
  { id: 'cph-light', label: '浅色' },
]

const WRAP_MODES = [
  { id: 'off', label: '不换行' },
  { id: 'on', label: '按视口换行' },
  { id: 'wordWrapColumn', label: '按列宽换行' },
]

// 测试面板的位置偏好存在 App.vue 的 cph.panelPosition 里，这里只负责发起一次对调
const PANEL_POSITIONS = [
  { id: 'right', label: '右侧' },
  { id: 'left', label: '左侧' },
]

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

function setFontSize(event) {
  const value = Number.parseInt(event.target.value, 10)
  if (Number.isFinite(value)) set('fontSize', Math.min(32, Math.max(8, value)))
}

function setTabSize(event) {
  const value = Number.parseInt(event.target.value, 10)
  if (Number.isFinite(value)) set('tabSize', Math.min(8, Math.max(2, value)))
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
      <section class="setting-group">
        <p class="setting-group__title">编辑器</p>

        <label class="setting-row">
          <span class="setting-row__label">主题</span>
          <span class="select">
            <select :value="settings.theme" @change="set('theme', $event.target.value)">
              <option v-for="item in THEMES" :key="item.id" :value="item.id">{{ item.label }}</option>
            </select>
            <AppIcon name="chevron" :size="12" class="select__chevron" />
          </span>
        </label>

        <label class="setting-row">
          <span class="setting-row__label">字体大小</span>
          <input
            class="number-input"
            type="number"
            min="8"
            max="32"
            step="1"
            :value="settings.fontSize"
            @change="setFontSize"
          />
        </label>

        <label class="setting-row">
          <span class="setting-row__label">Tab 宽度</span>
          <span class="select">
            <select :value="settings.tabSize" @change="setTabSize">
              <option v-for="size in [2, 4, 8]" :key="size" :value="size">{{ size }} 空格</option>
            </select>
            <AppIcon name="chevron" :size="12" class="select__chevron" />
          </span>
        </label>

        <label class="setting-row">
          <span class="setting-row__label">自动换行</span>
          <span class="select">
            <select :value="settings.wordWrap" @change="set('wordWrap', $event.target.value)">
              <option v-for="item in WRAP_MODES" :key="item.id" :value="item.id">{{ item.label }}</option>
            </select>
            <AppIcon name="chevron" :size="12" class="select__chevron" />
          </span>
        </label>

        <label class="setting-row">
          <span class="setting-row__label">
            缩略图 (Minimap)
            <span class="setting-row__hint">在编辑器右侧显示代码地图</span>
          </span>
          <button
            class="switch"
            :class="{ 'is-on': settings.minimap }"
            role="switch"
            :aria-checked="settings.minimap"
            @click="set('minimap', !settings.minimap)"
          >
            <span class="switch__thumb"></span>
          </button>
        </label>
      </section>

      <section class="setting-group">
        <p class="setting-group__title">布局</p>

        <label class="setting-row">
          <span class="setting-row__label">
            测试面板位置
            <span class="setting-row__hint">样例面板放在编辑器左侧还是右侧</span>
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

      <section class="setting-group">
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
      </section>

      <section class="setting-group">
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
    </div>
  </div>
</template>

<style scoped>
/* 设置视图：铺满编辑区的那一块（Monaco 被 v-show 让开）。滚动交给最外层，
   内层只负责限宽 —— 设置项是「标签在左、控件在右」的两端对齐行，不限宽的话
   宽面板上控件会飘到很远的地方。原来那套抽屉定位（fixed + 遮罩 + 滑入过渡）
   连带 View Transition 的组名一起撤掉了：现在是编辑区里的一层，跟着面板走。 */
.settings-view {
  position: absolute;
  inset: 0;
  overflow-y: auto;
  padding: 4px 0 18px;
}

.settings-view__inner {
  max-width: 720px;
}

.setting-group {
  display: flex;
  flex-direction: column;
}

.setting-group + .setting-group {
  margin-top: 8px;
  border-top: 1px solid var(--border-soft);
}

.setting-group__title {
  margin: 0;
  padding: 12px 18px 6px;
  font-size: 11.5px;
  letter-spacing: 0.2px;
  color: var(--text-faint);
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