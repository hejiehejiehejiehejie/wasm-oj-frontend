<script setup>
import { computed, ref } from 'vue'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  // 停靠的那个用例记录（就是 App 里 testCases 数组中的同一份对象）
  target: { type: Object, required: true },
  field: { type: String, required: true },
  label: { type: String, default: '' },
  disabled: Boolean,
})

const emit = defineEmits(['done'])

const textareaEl = ref(null)
defineExpose({ textareaEl })

// 与 TestCaseCard 的 field() 同一套写法：直接改用例记录本身，并把过期结论重新标成 stale，
// 否则在底部改了输入、卡片上还挂着上一轮的 AC。
const value = computed({
  get: () => props.target[props.field] ?? '',
  set: (next) => {
    props.target[props.field] = next
    if (props.target.status !== 'idle' && props.target.status !== 'running') props.target.stale = true
  },
})

const placeholder = computed(() => (props.field === 'expectedOutput' ? '期望输出' : '标准输入 (stdin)'))
</script>

<template>
  <!-- data-dock-surface 给保焦拦截器认：这一整条内部的事件一律放行 -->
  <section class="dock" data-dock-surface aria-label="底部输入">
    <header class="dock__head">
      <span class="dock__label">{{ label }}</span>
      <span class="dock__hint">点上方任意输入框可切换到这里编辑</span>
      <button class="dock__done" title="收起键盘并退出底部输入" @click="emit('done')">
        <AppIcon name="check" :size="13" />
        <span>完成</span>
      </button>
    </header>

    <textarea
      v-model="value"
      ref="textareaEl"
      class="dock__input"
      spellcheck="false"
      :placeholder="placeholder"
      :disabled="disabled"
    ></textarea>
  </section>
</template>

<style scoped>
/* 参与 .app 的 column flex，不做浮层：工作区自动收缩，键盘上方永远能看见这一条 */
.dock {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 7px 10px 9px;
  border-top: 1px solid var(--border);
  background: var(--bg-panel-head);
}

.dock__head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dock__label {
  flex: 0 0 auto;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.dock__hint {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  font-size: 11px;
  color: var(--text-faint);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.dock__done {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 10px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-on-accent);
  background: var(--run-green);
  transition: background-color 0.16s ease;
}

.dock__done:hover {
  background: var(--run-green-hover);
}

/* 高度固定、框内滚动：不做 autoGrow，免得键盘弹起时又变一次高度 */
.dock__input {
  display: block;
  width: 100%;
  min-height: 62px;
  max-height: min(96px, 28vh);
  padding: 7px 9px;
  border-radius: 5px;
  background: var(--bg-input);
  border: 1px solid var(--border-soft);
  font-family: var(--mono-font);
  font-size: 13.5px;
  line-height: 1.55;
  resize: none;
  overflow-y: auto;
  transition: border-color 0.15s ease;
}

.dock__input:focus {
  outline: none;
  border-color: var(--focus);
}

.dock__input:disabled {
  opacity: 0.55;
  cursor: default;
}
</style>