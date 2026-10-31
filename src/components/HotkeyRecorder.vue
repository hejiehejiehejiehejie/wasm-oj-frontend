<script setup>
/**
 * HotkeyRecorder —— 一个动作的按键录制框。
 *
 * 点一下进入录制态，随后按下的第一个完整组合键就会被记下；只有通过冲突检测才写入，
 * 不通过就停在录制态并给出红字原因（这就是「阻止绑定」）。
 * Esc 放弃、Delete 清除绑定、单按修饰键会被忽略（还在等真正的键）。
 * 例外见 onKeydown：若某个动作的正式键位就是 Delete（bareAllowedFor），那它收下这个键。
 *
 * 录制期间必须让全局监听让路：全局那条挂在 window 的捕获阶段（为了抢在 Monaco 前面），
 * 而这个监听在按钮上（目标阶段），捕获永远先跑。不喊停的话，录入 Ctrl+B 的瞬间功能就会
 * 先被执行一遍。所以开录时置 recordingActive，结束时清掉。
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import { t } from '../i18n/index.js'
import {
  bareAllowedFor,
  comboFromEvent,
  formatCombo,
  recordingActive,
  useShortcutManager,
} from '../composables/useShortcutManager.js'

const props = defineProps({
  actionId: { type: String, required: true },
})

const { bindings, setBinding, clearBinding, conflictOf } = useShortcutManager()

const recording = ref(false)
const draft = ref('')
const error = ref('')

const combo = computed(() => bindings.value[props.actionId] ?? '')
const label = computed(() => {
  if (recording.value) {
    return draft.value ? formatCombo(draft.value) : t('settings.shortcut.recorder.placeholder')
  }
  return combo.value ? formatCombo(combo.value) : t('settings.shortcut.recorder.unbound')
})

function start() {
  recording.value = true
  recordingActive.value = true
  draft.value = ''
  error.value = ''
}

function stop() {
  recording.value = false
  recordingActive.value = false
  draft.value = ''
  error.value = ''
}

// 面板被切走 / 页签关掉时组件还在，但录制态不该跨过去留着
onBeforeUnmount(() => {
  recordingActive.value = false
})

function onKeydown(event) {
  if (!recording.value) return

  // 录制态下把按键全吃掉：既不让浏览器 / 全局快捷键抢走，也不让它触发别的东西
  event.preventDefault()
  event.stopPropagation()
  if (event.isComposing) return

  if (event.code === 'Escape') {
    stop()
    return
  }

  const next = comboFromEvent(event)
  // 只按了修饰键：还没到真正的键，继续等
  if (!next) return

  // Delete / Backspace 在录制态是「清除绑定」。但「删除文件 / 文件夹」这条的正式键位就是
  // Delete —— 一律当清除的话，它被清掉之后就再也录不回来（只能整组复位）。所以先问一句
  // 「这个动作允许裸按它吗」：允许就往下走、当成键位收下；想清除这一行改用左侧的 × 或 Backspace。
  if ((next === 'Delete' || next === 'Backspace') && !bareAllowedFor(props.actionId, next)) {
    clearBinding(props.actionId)
    stop()
    return
  }
  // 裸回车当作放弃；带修饰键的回车（Mod+Enter 那种）走下面的正常流程
  if (next === 'Enter') {
    stop()
    return
  }

  draft.value = next
  const reason = conflictOf(props.actionId, next)
  if (reason) {
    // 冲突就停在这里显示红字，不写入绑定，用户可以接着按别的组合
    error.value = reason
    return
  }
  setBinding(props.actionId, next)
  stop()
}
</script>

<template>
  <div class="hotkey-field">
    <div class="hotkey-field__row">
      <button
        v-if="combo && !recording"
        type="button"
        class="hotkey-clear"
        :title="t('settings.shortcut.recorder.clear')"
        @click="clearBinding(actionId)"
      >
        <AppIcon name="close" :size="11" />
      </button>

      <button
        type="button"
        class="hotkey"
        :class="{ 'is-recording': recording, 'is-conflict': !!error, 'is-empty': !combo && !recording }"
        :title="
          t(recording ? 'settings.shortcut.recorder.hint' : 'settings.shortcut.recorder.idle')
        "
        @click="start"
        @keydown="onKeydown"
        @blur="stop"
      >
        {{ label }}
      </button>
    </div>

    <p v-if="error" class="hotkey-error">
      <AppIcon name="alert" :size="12" />
      <span>{{ error }}</span>
    </p>
    <p v-else-if="recording && !draft" class="hotkey-tip">
      {{ t('settings.shortcut.recorder.tip') }}
    </p>
  </div>
</template>

<style scoped>
.hotkey-field {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex: 0 0 auto;
}

.hotkey-field__row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.hotkey {
  min-width: 124px;
  height: 28px;
  padding: 0 11px;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: var(--bg-input);
  color: var(--text);
  /* 用 --ui-font 而不是 --mono-font：等宽字体没有 ⌘ ⇧ ⌥ 这几个字形，浏览器会逐个回退到
     别的字体，符号和字母的大小/粗细就对不齐了（一枚徽标里看着参差不齐） */
  font-family: var(--ui-font);
  font-size: 12px;
  white-space: nowrap;
  transition: background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease;
}

:where(html.is-hoverable) .hotkey:hover {
  background: var(--bg-control-hover);
}

.hotkey.is-empty {
  color: var(--text-faint);
}

/* 录制中：描边点亮，和普通状态一眼能分开 */
.hotkey.is-recording {
  border-color: var(--accent);
  background: var(--bg-control-hover);
  color: var(--text);
}

.hotkey.is-conflict {
  border-color: var(--fail);
  color: var(--fail);
}

.hotkey-clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-faint);
}

:where(html.is-hoverable) .hotkey-clear:hover {
  background: var(--bg-control-hover);
  color: var(--text);
}

.hotkey-error {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 0;
  max-width: 240px;
  color: var(--fail);
  font-size: 11px;
  line-height: 1.4;
  text-align: right;
}

.hotkey-tip {
  margin: 0;
  color: var(--text-faint);
  font-size: 11px;
}

/* 设置面板窄到两栏放不下时，124px 的录制框下限会把整行顶出卡片。
   让录制框跟着控制列收窄；组合键本身仍不折行，放不下就省略。 */
@container settings (max-width: 26rem) {
  .hotkey-field {
    align-items: stretch;
    width: 100%;
  }

  .hotkey-field__row {
    width: 100%;
  }

  .hotkey {
    flex: 1 1 auto;
    min-width: 0;
    padding: 0 8px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .hotkey-error {
    max-width: 100%;
    text-align: left;
  }
}
</style>
