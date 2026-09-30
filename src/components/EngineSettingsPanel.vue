<script setup>
/**
 * EngineSettingsPanel —— 「评测引擎」这一组设置的正文。
 *
 * 内容原先是顶栏「评测引擎设置」那颗齿轮弹出的 .popover（见 TopBar.vue 的旧版），
 * 2026-09 并入设置视图后只保留正文：没有弹层定位、没有遮罩、也没有「关闭」按钮
 * （设置是编辑区里的页签，关它归页签上的 ×；引擎选择与地址改动即时生效）。
 */
import { computed, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { t } from '../i18n/index.js'
import { engineChoices } from '../services/engines/index.js'

const props = defineProps({
  judge: { type: Object, required: true },
  connection: { type: Object, required: true },
})

const emit = defineEmits(['select-engine', 'update-base', 'test-connection'])

const choices = engineChoices()

// 输入的只是草稿，点「保存」（或回车）才提交给 App
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

function chooseEngine(id) {
  if (id === props.judge.id) return
  emit('select-engine', id)
}

/**
 * 回车保存判题服务地址。中文输入法里「回车」常常是「确认候选词」而不是「提交」，
 * 组字期间敲下去会把半截拼音当成地址存掉 —— 和全局快捷键同一条规矩（见 App.vue 的 onKeydown）。
 *
 * 这里刻意从 keyup 改成 keydown：确认候选词的那一发 keyup 是在 compositionend **之后**才发的，
 * isComposing 已经回到 false，挂在 keyup 上根本守不住。keyCode 229 是部分输入法组字时
 * 不报 isComposing 的补漏。
 */
function submitBaseOnEnter(event) {
  if (event.isComposing || event.keyCode === 229) return
  applyBase()
}

function applyBase() {
  const value = draftBase.value.trim()
  if (!value) return
  emit('update-base', value)
}
</script>

<template>
  <div class="engine-panel">
    <!-- 引擎列表：整块可点，选中态靠左侧色条 + 描边区分 -->
    <div class="engine-list">
      <button
        v-for="item in choices"
        :key="item.id"
        class="engine"
        :class="{ 'is-active': item.id === judge.id }"
        :aria-pressed="item.id === judge.id"
        @click="chooseEngine(item.id)"
      >
        <span class="engine__head">
          <span class="engine__label">{{ t(item.labelKey) }}</span>
          <span v-if="!item.executesCode" class="engine__badge">{{ t('engine.notExecutes') }}</span>
          <AppIcon v-if="item.id === judge.id" name="check" :size="13" />
        </span>
        <span class="engine__hint">{{ t(item.hintKey) }}</span>
      </button>
    </div>

    <div v-if="!localEngine" class="engine-field">
      <span class="engine-field__label">{{ t('engine.baseLabel') }}</span>
      <input
        v-model="draftBase"
        class="engine-field__input"
        spellcheck="false"
        @keydown.enter="submitBaseOnEnter"
      />
      <button class="engine-button engine-button--solid" @click="applyBase">
        {{ t('app.save') }}
      </button>
    </div>
    <p v-else class="engine-note">{{ t('engine.localNoBase') }}</p>

    <div class="engine-probe">
      <button
        class="engine-button"
        :disabled="connection.state === 'checking'"
        @click="emit('test-connection')"
      >
        <AppIcon name="reset" :size="13" />
        <span>{{ t(connection.state === 'checking' ? 'engine.checking' : 'engine.selfTest') }}</span>
      </button>
      <span v-if="connection.message" class="engine-probe__message" :class="probeTone">
        {{ connection.message }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.engine-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 2px 18px 14px;
}

.engine-list {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-soft);
  border-radius: 7px;
  overflow: hidden;
}

.engine {
  display: block;
  width: 100%;
  padding: 9px 12px;
  text-align: left;
  border-left: 3px solid transparent;
  transition: background-color 0.15s ease;
}

.engine + .engine {
  border-top: 1px solid var(--border-soft);
}

.engine:hover {
  background: var(--bg-hover);
}

.engine.is-active {
  background: var(--bg-control);
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
  font-size: 13px;
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

.engine-field {
  display: flex;
  align-items: center;
  gap: 8px;
}

.engine-field__label {
  flex: 0 0 auto;
  font-size: 13px;
}

.engine-field__input {
  flex: 1 1 auto;
  min-width: 0;
  padding: 6px 8px;
  border-radius: 5px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  color: var(--text);
  font-family: var(--mono-font);
  font-size: 12px;
}

.engine-note {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.55;
  color: var(--text-faint);
}

.engine-probe {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.engine-probe__message {
  flex: 1 1 auto;
  min-width: 0;
  padding-top: 5px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-dim);
  overflow-wrap: anywhere;
}

.engine-probe__message.is-ok {
  color: var(--ok);
}

.engine-probe__message.is-bad {
  color: var(--fail);
}

.engine-button {
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

.engine-button:hover:not(:disabled) {
  background: var(--bg-control-hover);
}

.engine-button:disabled {
  cursor: default;
  color: var(--text-faint);
}

.engine-button--solid {
  background: var(--accent);
  border-color: transparent;
  color: var(--text-on-accent);
}

.engine-button--solid:hover:not(:disabled) {
  background: var(--accent-hover);
}
</style>
