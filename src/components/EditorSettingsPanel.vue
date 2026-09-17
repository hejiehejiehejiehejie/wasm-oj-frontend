<script setup>
import { computed, watch } from 'vue'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  settings: { type: Object, required: true },
  open: Boolean,
})

const emit = defineEmits(['update:settings', 'update:open', 'close'])

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
</script>

<template>
  <button
    class="gear-button"
    :class="{ 'is-active': open }"
    title="编辑器偏好设置"
    aria-label="编辑器偏好设置"
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
      <aside v-if="open" class="settings-drawer" role="dialog" aria-modal="true" aria-label="编辑器偏好设置">
        <header class="settings-drawer__header">
          <h2>编辑器偏好设置</h2>
          <button class="icon-button" title="关闭" aria-label="关闭设置" @click="close">
            <AppIcon name="close" :size="16" />
          </button>
        </header>

        <div class="settings-drawer__body">
          <section class="setting-group">
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
.settings-backdrop {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(0, 0, 0, 0.48);
}

.settings-drawer {
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
  padding: 10px 0;
}

.setting-group {
  display: flex;
  flex-direction: column;
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
