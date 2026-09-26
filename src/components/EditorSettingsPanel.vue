<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { usePersistentRef } from '../composables/usePersistentRef.js'
import { preload, subscribeStatus } from '../services/wasmRuntime.js'
import { TIME_LIMIT_OPTIONS } from '../services/runner.js'

const props = defineProps({
  settings: { type: Object, required: true },
  panelPosition: { type: String, required: true },
  // 全局运行时限（毫秒，只计运行段），与 App.vue 的 cph.timeLimitMs 同源
  timeLimit: { type: Number, required: true },
  open: Boolean,
})

const emit = defineEmits([
  'update:settings',
  'update:open',
  'close',
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
// 工具链缓存在浏览器 HTTP 缓存 + wasmRuntime 这一层的内存里，刷新页面后标记还在，
// 但内存里的 sysroot 要重新解包。这个标记只表示「这台浏览器成功下载过一次」，
// 用来少让用户点一次「下载」；标记过期也无妨，下一次评测自己会把它拉回来。
const clangReady = usePersistentRef('cph.localRuntime.clangReady', false)

// idle（未下载）→ downloading（下载中）→ ready（已就绪）/ failed（失败）
const runtimeState = ref(clangReady.value ? 'ready' : 'idle')
// 只有失败要留文案；下载中的进度文案交给 live 实时播报
const failureReason = ref('')
const elapsedMs = ref(0)

// 沙箱的实时阶段播报（boot / download / compile / run），由 wasmRuntime 统一发出。
// 面板不自己拉工具链 —— 引擎评测用的是同一份内存缓存，两边共享。
const live = ref({ stage: 'idle', message: '' })

const downloading = computed(() => runtimeState.value === 'downloading')

const downloadLabel = computed(() => {
  if (runtimeState.value === 'downloading') return '下载中…'
  if (runtimeState.value === 'ready') return '已就绪'
  if (runtimeState.value === 'failed') return '重试'
  return '下载'
})

const downloadIcon = computed(() => {
  if (runtimeState.value === 'ready') return 'check'
  if (runtimeState.value === 'failed') return 'reset'
  return 'download'
})

const cppHint = computed(() => {
  if (runtimeState.value === 'downloading') return live.value.message || '正在下载本地工具链…'
  if (runtimeState.value === 'ready') {
    return elapsedMs.value ? `本地工具链已就绪，用时 ${(elapsedMs.value / 1000).toFixed(1)} s` : '本地工具链已就绪'
  }
  if (runtimeState.value === 'failed') return failureReason.value || '下载失败'
  return 'clang 8 + libc++，约 50MB，只下一次'
})

// 下载就是把工具链（clang / wasm-ld / 系统头文件）拉进 HTTP 缓存与内存，
// 之后引擎评测和这里共用同一份，不需要常驻 Worker。
async function downloadClang() {
  if (downloading.value || runtimeState.value === 'ready') return
  runtimeState.value = 'downloading'
  failureReason.value = ''
  const message = await preload()
  if (message.type === 'ready') {
    runtimeState.value = 'ready'
    elapsedMs.value = message.durationMs ?? 0
    clangReady.value = true
    return
  }
  runtimeState.value = 'failed'
  failureReason.value = message.message || '下载失败'
}

let unsubscribe = null

onMounted(() => {
  unsubscribe = subscribeStatus((status) => {
    live.value = status
  })
})

watch(
  () => props.open,
  (open) => {
    if (open) {
      window.addEventListener('keydown', onKeydown)
      return
    }
    window.removeEventListener('keydown', onKeydown)
  },
)

function onKeydown(event) {
  if (event.key === 'Escape') close()
}

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  unsubscribe?.()
})

function toggle() {
  emit('update:open', !props.open)
  if (props.open) emit('close')
}

function close() {
  emit('update:open', false)
  emit('close')
}

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
  <button
    class="gear-button"
    :class="{ 'is-active': open }"
    title="设置"
    aria-label="设置"
    aria-expanded="open"
    @click="toggle"
  >
    <AppIcon name="gear" />
  </button>

  <!-- 只有抽屉需要 Teleport（逃出顶栏的层叠上下文）；按钮必须留在顶栏内，否则会脱离 flex 布局被挤出视口 -->
  <Teleport to="body">
    <Transition name="settings-fade">
      <div v-if="open" class="settings-backdrop" @click.self="close"></div>
    </Transition>

    <Transition name="settings-slide">
      <aside v-if="open" class="settings-drawer" role="dialog" aria-modal="true" aria-label="设置">
        <header class="settings-drawer__header">
          <h2>设置</h2>
          <button class="icon-button" title="关闭" aria-label="关闭设置" @click="close">
            <AppIcon name="close" :size="16" />
          </button>
        </header>

        <div class="settings-drawer__body">
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
              <div class="runtime-row">
                <span class="runtime-row__icon is-cpp"><AppIcon name="cpp" :size="15" /></span>
                <span class="runtime-row__text">
                  <span class="runtime-row__title">C++</span>
                  <span class="runtime-row__hint">{{ cppHint }}</span>
                </span>
                <button
                  class="download-button"
                  :class="{ 'is-ready': runtimeState === 'ready', 'is-failed': runtimeState === 'failed' }"
                  :disabled="downloading || runtimeState === 'ready'"
                  :title="runtimeState === 'ready' ? '本地运行环境已就绪' : '下载 clang 工具链'"
                  @click="downloadClang"
                >
                  <AppIcon
                    :name="downloadIcon"
                    :size="13"
                    :class="{ 'is-spinning': downloading }"
                  />
                  <span>{{ downloadLabel }}</span>
                </button>
              </div>

              <div class="runtime-row is-muted">
                <span class="runtime-row__icon is-python"><AppIcon name="python" :size="15" /></span>
                <span class="runtime-row__text">
                  <span class="runtime-row__title">Python 3</span>
                  <span class="runtime-row__hint">暂未接入本地运行时</span>
                </span>
                <button class="download-button" disabled title="暂未接入，本步不做改动">
                  <AppIcon name="download" :size="13" />
                  <span>下载</span>
                </button>
              </div>
            </div>
          </section>
        </div>

        <footer class="settings-drawer__footer">
          <button class="done-button" @click="close">完成</button>
        </footer>
      </aside>
    </Transition>
  </Teleport>
</template>

<style scoped>
.gear-button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 28px;
  padding: 0 9px;
  border-radius: 5px;
  border: 1px solid transparent;
  color: var(--text);
  font-size: 12.5px;
  transition: background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease;
}

.gear-button:hover,
.gear-button.is-active {
  background: var(--bg-hover);
  border-color: var(--border);
}
/* 遮罩与抽屉各自起一个过渡组名。抽屉里能改「测试面板位置」，也就是能在抽屉开着时触发
   换边的 View Transition —— 不给它们起名的话，两者只会留在 root 快照里，而两栏快照画在
   root 之上，动画期间两张卡片会浮到抽屉上面来。配套的 z-index 在 App.vue 的全局块里。 */
.settings-backdrop {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(0, 0, 0, 0.48);
  view-transition-name: settings-backdrop;
}

.settings-drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 61;
  view-transition-name: settings-drawer;
  display: flex;
  flex-direction: column;
  width: min(360px, 92vw);
  background: var(--bg-raised);
  border-left: 1px solid var(--border);
  box-shadow: -18px 0 46px -22px rgba(0, 0, 0, 0.8);
}

.settings-drawer__header {
  flex: 0 0 50px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px 0 18px;
  border-bottom: 1px solid var(--border-soft);
}

.settings-drawer__header h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.icon-button {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 5px;
  color: var(--text-dim);
  transition: background-color 0.15s ease, color 0.15s ease;
}

.icon-button:hover {
  background: var(--bg-hover);
  color: var(--text);
}

.settings-drawer__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 0 0 10px;
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

.runtime-row.is-muted {
  background: transparent;
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

.is-muted .runtime-row__title {
  color: var(--text-dim);
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

.settings-drawer__footer {
  flex: 0 0 auto;
  display: flex;
  justify-content: flex-end;
  padding: 12px 16px;
  border-top: 1px solid var(--border-soft);
}

.done-button {
  height: 30px;
  padding: 0 16px;
  border-radius: 5px;
  font-size: 12.5px;
  font-weight: 550;
  color: var(--text-on-accent);
  background: var(--run-green);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.done-button:hover {
  background: var(--run-green-hover);
}

.settings-fade-enter-active,
.settings-fade-leave-active {
  transition: opacity 0.2s ease;
}

.settings-fade-enter-from,
.settings-fade-leave-to {
  opacity: 0;
}

.settings-slide-enter-active,
.settings-slide-leave-active {
  transition: transform 0.24s cubic-bezier(0.22, 0.61, 0.36, 1);
}

.settings-slide-enter-from,
.settings-slide-leave-to {
  transform: translateX(100%);
}
</style>