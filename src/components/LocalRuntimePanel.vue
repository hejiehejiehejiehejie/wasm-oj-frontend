<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { usePersistentRef } from '../composables/usePersistentRef.js'
import { preload, subscribeStatus } from '../services/wasmRuntime.js'

const props = defineProps({
  open: Boolean,
})

const emit = defineEmits(['update:open'])

// 工具链缓存在浏览器 HTTP 缓存 + wasmRuntime 这一层的内存里，刷新页面后标记还在，
// 但内存里的 sysroot 要重新解包。这个标记只表示「这台浏览器成功下载过一次」，
// 用来少让用户点一次「下载」；标记过期也无妨，下一次评测自己会把它拉回来。
const clangReady = usePersistentRef('cph.localRuntime.clangReady', false)

// idle（未下载）→ downloading（下载中）→ ready（已就绪）/ failed（失败）
const state = ref(clangReady.value ? 'ready' : 'idle')
// 只有失败要留文案；下载中的进度文案交给 live 实时播报
const failureReason = ref('')
const elapsedMs = ref(0)

// 沙箱的实时阶段播报（boot / download / compile / run），由 wasmRuntime 统一发出。
// 面板不再自己拉工具链 —— 引擎评测用的是同一份内存缓存，两边共享。
const live = ref({ stage: 'idle', message: '' })

const downloading = computed(() => state.value === 'downloading')

const buttonLabel = computed(() => {
  if (state.value === 'downloading') return '下载中…'
  if (state.value === 'ready') return '已就绪'
  if (state.value === 'failed') return '重试'
  return '下载'
})

const buttonIcon = computed(() => {
  if (state.value === 'ready') return 'check'
  if (state.value === 'failed') return 'reset'
  return 'download'
})

const cppHint = computed(() => {
  if (state.value === 'downloading') return live.value.message || '正在下载本地工具链…'
  if (state.value === 'ready') {
    return elapsedMs.value ? `本地工具链已就绪，用时 ${(elapsedMs.value / 1000).toFixed(1)} s` : '本地工具链已就绪'
  }
  if (state.value === 'failed') return failureReason.value || '下载失败'
  return 'clang 8 + libc++，约 50MB，只下一次'
})

// 下载就是把工具链（clang / wasm-ld / 系统头文件）拉进 HTTP 缓存与内存，
// 之后引擎评测和面板共用同一份，不需要常驻 Worker。
async function downloadClang() {
  if (downloading.value || state.value === 'ready') return
  state.value = 'downloading'
  failureReason.value = ''
  const message = await preload()
  if (message.type === 'ready') {
    state.value = 'ready'
    elapsedMs.value = message.durationMs ?? 0
    clangReady.value = true
    return
  }
  state.value = 'failed'
  failureReason.value = message.message || '下载失败'
}

let unsubscribe = null

onMounted(() => {
  unsubscribe = subscribeStatus((status) => {
    live.value = status
  })
})

function onKeydown(event) {
  if (event.key === 'Escape') close()
}

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

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  unsubscribe?.()
})

function toggle() {
  emit('update:open', !props.open)
}

function close() {
  emit('update:open', false)
}
</script>

<template>
  <button
    class="panel-button"
    :class="{ 'is-active': open }"
    title="本地运行环境"
    aria-label="本地运行环境"
    aria-expanded="open"
    @click="toggle"
  >
    <AppIcon name="cpu" />
  </button>

  <!-- 只有抽屉需要 Teleport；按钮必须留在顶栏内，否则会脱离 flex 布局被挤出视口 -->
  <Teleport to="body">
    <Transition name="panel-fade">
      <div v-if="open" class="panel-backdrop" @click.self="close"></div>
    </Transition>

    <Transition name="panel-slide">
      <aside v-if="open" class="panel-drawer" role="dialog" aria-modal="true" aria-label="本地运行环境">
        <header class="panel-drawer__header">
          <h2>本地运行环境</h2>
          <button class="icon-button" title="关闭" aria-label="关闭本地运行环境" @click="close">
            <AppIcon name="close" :size="16" />
          </button>
        </header>

        <div class="panel-drawer__body">
          <p class="panel-note">在浏览器里直接编译运行，代码不出本机。</p>

          <section class="panel-group">
            <div class="runtime-row">
              <span class="runtime-row__icon is-cpp"><AppIcon name="cpp" :size="15" /></span>
              <span class="runtime-row__text">
                <span class="runtime-row__title">C++</span>
                <span class="runtime-row__hint">{{ cppHint }}</span>
              </span>
              <button
                class="download-button"
                :class="{ 'is-ready': state === 'ready', 'is-failed': state === 'failed' }"
                :disabled="downloading || state === 'ready'"
                :title="state === 'ready' ? '本地运行环境已就绪' : '下载 clang 工具链'"
                @click="downloadClang"
              >
                <AppIcon
                  :name="buttonIcon"
                  :size="13"
                  :class="{ 'is-spinning': downloading }"
                />
                <span>{{ buttonLabel }}</span>
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
          </section>
        </div>

        <footer class="panel-drawer__footer">
          <button class="done-button" @click="close">完成</button>
        </footer>
      </aside>
    </Transition>
  </Teleport>
</template>

<style scoped>
.panel-button {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 9px;
  border-radius: 5px;
  border: 1px solid transparent;
  color: var(--text);
  font-size: 12.5px;
  transition: background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease;
}

.panel-button:hover,
.panel-button.is-active {
  background: var(--bg-hover);
  border-color: var(--border);
}

.panel-backdrop {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(0, 0, 0, 0.48);
}

.panel-drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 61;
  display: flex;
  flex-direction: column;
  width: min(360px, 92vw);
  background: var(--bg-raised);
  border-left: 1px solid var(--border);
  box-shadow: -18px 0 46px -22px rgba(0, 0, 0, 0.8);
}

.panel-drawer__header {
  flex: 0 0 50px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px 0 18px;
  border-bottom: 1px solid var(--border-soft);
}

.panel-drawer__header h2 {
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

.panel-drawer__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 18px;
}

.panel-note {
  margin: 0 0 12px;
  font-size: 11.5px;
  line-height: 1.55;
  color: var(--text-faint);
}

.panel-group {
  display: flex;
  flex-direction: column;
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
  animation: panel-spin 0.9s linear infinite;
}

@keyframes panel-spin {
  to {
    transform: rotate(360deg);
  }
}

.panel-drawer__footer {
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

.panel-fade-enter-active,
.panel-fade-leave-active {
  transition: opacity 0.2s ease;
}

.panel-fade-enter-from,
.panel-fade-leave-to {
  opacity: 0;
}

.panel-slide-enter-active,
.panel-slide-leave-active {
  transition: transform 0.24s cubic-bezier(0.22, 0.61, 0.36, 1);
}

.panel-slide-enter-from,
.panel-slide-leave-to {
  transform: translateX(100%);
}
</style>