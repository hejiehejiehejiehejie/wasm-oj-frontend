<script setup>
import { computed, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import EditorSettingsPanel from './EditorSettingsPanel.vue'
import LocalRuntimePanel from './LocalRuntimePanel.vue'
import { LANGUAGES } from '../services/templates.js'
import { engineChoices } from '../services/engines/index.js'

const props = defineProps({
  language: { type: String, required: true },
  panelPosition: { type: String, required: true },
  judge: { type: Object, required: true },
  connection: { type: Object, required: true },
  editorSettings: { type: Object, required: true },
  editorSettingsOpen: Boolean,
  running: Boolean,
  total: { type: Number, default: 0 },
})

const emit = defineEmits([
  'update:language',
  'select-engine',
  'update-base',
  'test-connection',
  'update:editor-settings',
  'update:editor-settings-open',
  'toggle-layout',
  'run-all',
])

const choices = engineChoices()

const settingsOpen = ref(false)
const localRuntimeOpen = ref(false)
const draftBase = ref(props.judge.base)

// 切换引擎时 App 会把 judge.base 换成新引擎的地址，输入框要跟着走
watch(
  () => props.judge.base,
  (value) => {
    draftBase.value = value
  },
)

// 内置引擎（本地沙箱 / 自检）没有服务地址，按注册表约定 defaultBase 是 'local'
const localEngine = computed(() => props.judge.base === 'local')

const probeTone = computed(() => {
  if (props.connection.state === 'ok') return 'is-ok'
  if (props.connection.state === 'bad') return 'is-bad'
  return ''
})

// 两个抽屉都从右侧滑出，同时打开会叠在一起，所以开一个就关另一个
function setEditorSettingsOpen(value) {
  emit('update:editor-settings-open', value)
  if (value) localRuntimeOpen.value = false
}

function setLocalRuntimeOpen(value) {
  localRuntimeOpen.value = value
  if (value) emit('update:editor-settings-open', false)
}

const swapHint = computed(() =>
  props.panelPosition === 'right'
    ? '测试面板当前在右侧，点击换到左侧'
    : '测试面板当前在左侧，点击换到右侧',
)

function chooseEngine(id) {
  if (id === props.judge.id) return
  emit('select-engine', id)
}

function applyBase() {
  const value = draftBase.value.trim()
  if (!value) return
  emit('update-base', value)
}
</script>

<template>
  <header class="topbar">
    <div class="brand">
      <span class="brand__mark"><AppIcon name="code" :size="15" :stroke-width="2.2" /></span>
      <span class="brand__name">CPH Workbench</span>
      <span class="brand__sep"></span>
      <span class="brand__sub">算法竞赛刷题工作台</span>
    </div>

    <label class="field" title="切换语言，会保留各自独立的代码草稿">
      <span class="field__label">语言</span>
      <span class="select">
        <select
          :value="language"
          @change="emit('update:language', $event.target.value)"
        >
          <option v-for="item in LANGUAGES" :key="item.id" :value="item.id">
            {{ item.label }}
          </option>
        </select>
        <AppIcon name="chevron" :size="12" class="select__chevron" />
      </span>
    </label>

    <div class="spacer"></div>

    <EditorSettingsPanel
      :settings="editorSettings"
      :open="editorSettingsOpen"
      @update:settings="emit('update:editor-settings', $event)"
      @update:open="setEditorSettingsOpen"
    />

    <LocalRuntimePanel :open="localRuntimeOpen" @update:open="setLocalRuntimeOpen" />

    <div class="settings">
      <button
        class="tool"
        :class="{ 'is-active': settingsOpen }"
        title="评测引擎设置"
        aria-label="评测引擎设置"
        @click="settingsOpen = !settingsOpen"
      >
        <AppIcon name="sliders" />
      </button>
      <div v-if="settingsOpen" class="popover">
        <p class="popover__title">评测引擎</p>

        <div class="engines">
          <button
            v-for="item in choices"
            :key="item.id"
            class="engine"
            :class="{ 'is-active': item.id === judge.id }"
            :aria-pressed="item.id === judge.id"
            @click="chooseEngine(item.id)"
          >
            <span class="engine__head">
              <span class="engine__label">{{ item.label }}</span>
              <span v-if="!item.executesCode" class="engine__badge">不执行代码</span>
              <AppIcon v-if="item.id === judge.id" name="check" :size="13" />
            </span>
            <span class="engine__hint">{{ item.hint }}</span>
          </button>
        </div>

        <template v-if="!localEngine">
          <p class="popover__title popover__title--gap">服务地址</p>
          <input
            v-model="draftBase"
            class="popover__input"
            spellcheck="false"
            @keyup.enter="applyBase"
          />
        </template>
        <p v-else class="popover__hint">本地沙箱在浏览器里跑，不需要服务地址。</p>

        <div class="probe">
          <button
            class="tool"
            :disabled="connection.state === 'checking'"
            @click="emit('test-connection')"
          >
            <AppIcon name="reset" :size="13" />
            <span>{{ connection.state === 'checking' ? '探测中…' : '自检' }}</span>
          </button>
          <span v-if="connection.message" class="probe__message" :class="probeTone">
            {{ connection.message }}
          </span>
        </div>

        <div class="popover__actions">
          <button class="tool" @click="settingsOpen = false">关闭</button>
          <button v-if="!localEngine" class="tool tool--solid" @click="applyBase">保存</button>
        </div>
      </div>
    </div>

    <button
      class="tool tool--icon"
      :title="swapHint"
      :aria-label="swapHint"
      @click="emit('toggle-layout')"
    >
      <AppIcon name="swap" />
    </button>

    <button
      class="primary"
      :class="{ 'is-running': running }"
      :title="running ? '点击中断当前运行' : '运行全部测试用例 (⌘/Ctrl + Enter)'"
      :disabled="total === 0 && !running"
      @click="emit('run-all')"
    >
      <AppIcon :name="running ? 'stop' : 'play'" :size="14" />
      <span>{{
        running ? '停止运行' : total ? `运行全部测试  · ${total}` : '运行全部测试 (Run All)'
      }}</span>
    </button>
  </header>
</template>

<style scoped>
.topbar {
  height: 50px;
  flex: 0 0 50px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px 0 14px;
  background: var(--bg-chrome);
  border-bottom: 1px solid var(--border-soft);
  user-select: none;
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-right: 4px;
}

.brand__mark {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  color: var(--text-on-accent);
  background: linear-gradient(180deg, var(--accent-strong), var(--accent-deep));
}

.brand__name {
  font-size: 13.5px;
  font-weight: 600;
  letter-spacing: 0.1px;
}

.brand__sep {
  width: 1px;
  height: 16px;
  background: var(--border);
  margin: 0 2px;
}

.brand__sub {
  font-size: 12px;
  color: var(--text-faint);
}

.field {
  display: flex;
  align-items: center;
  gap: 7px;
}

.field__label {
  font-size: 11.5px;
  color: var(--text-faint);
}

.select {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.select select {
  appearance: none;
  padding: 5px 26px 5px 9px;
  border-radius: 5px;
  background: var(--bg-control);
  border: 1px solid var(--border);
  font-size: 12.5px;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.select select:hover {
  background: var(--bg-control-hover);
}

.select__chevron {
  position: absolute;
  right: 8px;
  pointer-events: none;
  color: var(--text-dim);
}

.spacer {
  flex: 1 1 auto;
}

.tool {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 28px;
  padding: 0 9px;
  border-radius: 5px;
  border: 1px solid transparent;
  color: var(--text);
  font-size: 12.5px;
  white-space: nowrap;
  transition: background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease;
}

.tool:hover {
  background: var(--bg-hover);
  border-color: var(--border);
}

.tool.is-active {
  background: var(--bg-hover);
  border-color: var(--border);
}

.tool:disabled {
  cursor: default;
  color: var(--text-faint);
}

.tool:disabled:hover {
  background: none;
  border-color: transparent;
}

/* 纯图标按钮：去掉文字后收成正方形，避免左右多出空白 */
.tool--icon {
  width: 28px;
  padding: 0;
  justify-content: center;
}

.tool--solid {
  background: var(--accent);
  border-color: transparent;
}

.tool--solid:hover {
  background: var(--accent-hover);
}

.primary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 30px;
  padding: 0 13px;
  border-radius: 5px;
  font-size: 12.5px;
  font-weight: 550;
  color: var(--text-on-accent);
  background: var(--run-green);
  border: 1px solid rgba(255, 255, 255, 0.08);
  white-space: nowrap;
  transition: background-color 0.16s ease, box-shadow 0.16s ease, transform 0.1s ease;
}

.primary:hover {
  background: var(--run-green-hover);
  box-shadow: 0 0 0 1px rgba(58, 167, 108, 0.5), 0 6px 18px -10px rgba(47, 143, 91, 0.9);
}

.primary:active {
  transform: translateY(1px);
}

.primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  box-shadow: none;
}

/* 运行中变成「危险」色：浅色主题下底色是浅红，靠 --danger-text 兜住可读性 */
.primary.is-running {
  color: var(--danger-text);
  background: var(--danger-bg);
}

.primary.is-running:hover {
  background: var(--danger-bg-hover);
  box-shadow: none;
}

.settings {
  position: relative;
}

.popover {
  position: absolute;
  top: 36px;
  right: 0;
  z-index: 40;
  width: 360px;
  padding: 12px;
  border-radius: 8px;
  background: var(--bg-raised);
  border: 1px solid var(--border);
  box-shadow: 0 18px 44px -18px rgba(0, 0, 0, 0.85);
}

.popover__title {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--text-dim);
}

.popover__title--gap {
  margin-top: 12px;
}

/* 引擎列表：整块可点，选中态靠左侧色条 + 描边区分 */
.engines {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.engine {
  display: block;
  width: 100%;
  padding: 7px 9px;
  border-radius: 6px;
  border: 1px solid transparent;
  border-left: 3px solid transparent;
  text-align: left;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.engine:hover {
  background: var(--bg-hover);
}

.engine.is-active {
  background: var(--bg-control);
  border-color: var(--border);
  border-left-color: var(--focus);
}

.engine__head {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text);
}

.engine__label {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 12.5px;
}

.engine__badge {
  flex: 0 0 auto;
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 10.5px;
  color: var(--text-dim);
  background: var(--case-chip-bg);
}

.engine__hint {
  display: block;
  margin-top: 3px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-faint);
}

.probe {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 10px;
}

.probe__message {
  flex: 1 1 auto;
  min-width: 0;
  padding-top: 5px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-dim);
  overflow-wrap: anywhere;
}

.probe__message.is-ok {
  color: var(--ok);
}

.probe__message.is-bad {
  color: var(--fail);
}

.popover__input {
  width: 100%;
  padding: 6px 8px;
  border-radius: 5px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  font-family: var(--mono-font);
  font-size: 12px;
}

.popover__hint {
  margin: 8px 0 0;
  font-size: 11.5px;
  line-height: 1.55;
  color: var(--text-faint);
}

.popover__hint code {
  font-family: var(--mono-font);
  color: var(--text-dim);
}

.popover__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
}
</style>
