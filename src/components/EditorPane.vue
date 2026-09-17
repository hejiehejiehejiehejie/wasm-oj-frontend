<script setup>
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { monaco } from '../monaco-setup.js'
import { langMeta } from '../services/templates.js'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  language: { type: String, required: true },
  settings: { type: Object, required: true },
})

const emit = defineEmits(['update:modelValue', 'run-all'])

const host = ref(null)
const editor = shallowRef(null)
const cursor = ref({ lineNumber: 1, column: 1 })
const selectedChars = ref(0)
let echoing = false

const meta = computed(() => langMeta(props.language))
const fileName = computed(() => `Main.${meta.value.extension}`)

onMounted(() => {
  const instance = monaco.editor.create(host.value, {
    value: props.modelValue,
    language: meta.value.monaco,
    theme: props.settings.theme,
    minimap: { enabled: props.settings.minimap },
    fontSize: props.settings.fontSize,
    lineHeight: Math.round(props.settings.fontSize * 1.5),
    fontFamily: 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace',
    fontLigatures: false,
    smoothScrolling: true,
    cursorBlinking: 'smooth',
    cursorSmoothCaretAnimation: 'on',
    scrollBeyondLastLine: false,
    padding: { top: 14, bottom: 10 },
    renderLineHighlight: 'all',
    renderWhitespace: 'selection',
    tabSize: props.settings.tabSize,
    insertSpaces: true,
    wordWrap: props.settings.wordWrap,
    automaticLayout: true,
    bracketPairColorization: { enabled: true },
    guides: { bracketPairs: 'active', indentation: true },
    scrollbar: { verticalScrollbarSize: 11, horizontalScrollbarSize: 11, useShadows: false },
    overviewRulerBorder: false,
    fixedOverflowWidgets: true,
    stickyScroll: { enabled: false },
    quickSuggestions: { other: true, comments: false, strings: false },
    linkedEditing: true,
    inlineSuggest: { enabled: true },
  })
  editor.value = instance

  instance.onDidChangeModelContent(() => {
    if (echoing) return
    emit('update:modelValue', instance.getValue())
  })

  instance.onDidChangeCursorPosition((event) => {
    cursor.value = { lineNumber: event.position.lineNumber, column: event.position.column }
  })

  instance.onDidChangeCursorSelection((event) => {
    selectedChars.value = instance.getModel()?.getValueInRange(event.selection)?.length ?? 0
  })

  // Keep ⌘/Ctrl+Enter working while the editor itself has focus.
  instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => emit('run-all'))
  instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => emit('run-all'))

  monaco.editor.setTheme(props.settings.theme)
})

onBeforeUnmount(() => {
  editor.value?.dispose()
  editor.value = null
})

watch(
  () => props.modelValue,
  (value) => {
    const instance = editor.value
    if (!instance) return
    const next = value ?? ''
    if (instance.getValue() === next) return
    const viewState = instance.saveViewState()
    echoing = true
    instance.setValue(next)
    instance.restoreViewState(viewState)
    echoing = false
  },
)

watch(
  () => props.language,
  () => {
    const instance = editor.value
    if (!instance?.getModel()) return
    monaco.editor.setModelLanguage(instance.getModel(), meta.value.monaco)
  },
)

watch(
  () => props.settings,
  (next, prev) => {
    const instance = editor.value
    if (!instance) return
    instance.updateOptions({
      fontSize: next.fontSize,
      lineHeight: Math.round(next.fontSize * 1.5),
      tabSize: next.tabSize,
      wordWrap: next.wordWrap,
      minimap: { enabled: next.minimap },
    })
    if (prev?.theme !== next.theme) monaco.editor.setTheme(next.theme)
  },
  { deep: true },
)

defineExpose({ layout: () => editor.value?.layout() })
</script>

<template>
  <div class="editor-pane">
    <div class="editor-pane__tabbar">
      <span class="tab">
        <AppIcon name="code" :size="12" class="tab__icon" />
        {{ fileName }}
      </span>
    </div>

    <div ref="host" class="editor-pane__host"></div>

    <footer class="editor-pane__status">
      <span class="opt-file">{{ fileName }}</span>
      <span class="dot opt-file"></span>
      <span class="opt-utf8">UTF-8</span>
      <span class="dot opt-utf8"></span>
      <span>空格: {{ settings.tabSize }}</span>
      <span class="grow"></span>
      <span v-if="selectedChars" class="picked">已选中 {{ selectedChars }} 字符</span>
      <span>行 {{ cursor.lineNumber }}，列 {{ cursor.column }}</span>
      <span class="dot opt-lang"></span>
      <span class="opt-lang">{{ meta.label }}</span>
      <span class="dot"></span>
      <span title="运行全部测试用例">⌘⏎</span>
    </footer>
  </div>
</template>

<style scoped>
.editor-pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100%;
  /* 与两套 Monaco 主题的 editor.background 保持一致，卡片才是一块完整的圆角面 */
  background: var(--bg-panel);
}

.editor-pane__tabbar {
  flex: 0 0 35px;
  display: flex;
  align-items: center;
  background: var(--bg-panel-head);
  border-bottom: 1px solid var(--border-soft);
}

.tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 100%;
  padding: 0 14px;
  font-size: 12.5px;
  color: var(--text);
  /* 活动页签单独取一档底色，和页签栏拉开层次 */
  background: var(--bg-tab-active);
  border-right: 1px solid var(--border-soft);
  border-top: 1px solid var(--focus);
}

.tab__icon {
  color: var(--icon-code);
}

.editor-pane__host {
  flex: 1 1 auto;
  min-height: 0;
}

.editor-pane__status {
  flex: 0 0 22px;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 12px;
  font-size: 11.5px;
  color: var(--statusbar-text);
  background: var(--accent);
  /* 状态栏自身当容器：窄到放不下时由下面的 @container 逐项摘掉信息。
     不能挂在上层的 .editor-pane 上 —— container-type 带 layout 包含，
     会让它成为 position: fixed 后代的包含块，Monaco 的 fixedOverflowWidgets
     弹出的建议框就会错位。另外收住横向溢出，免得挤不下的部分画到面板外面 */
  container-type: inline-size;
  overflow: hidden;
}

/* 各项按内容宽度定死且不换行：默认的 flex-shrink: 1 会把「行 1，列 1」折成两行、
   把中文压成竖排，这就是「挤在一起」的成因。宽度不够时交给 @container 摘掉整项，
   留下来的项内部始终单行 */
.editor-pane__status > span {
  flex: 0 0 auto;
  white-space: nowrap;
}

.editor-pane__status .grow {
  flex: 1 1 auto;
}

.editor-pane__status .dot {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.5;
}

.editor-pane__status .picked {
  color: var(--text-on-accent);
  font-weight: 550;
}

/* 由窄到宽逐项隐藏：UTF-8 是常量、main.cpp 在页签栏已经有一份，先摘这两项，
   再窄才轮到语言。每一项都连着身后的分隔点一起隐藏，避免留下孤零零一个圆点
   （opt-lang 的那颗点在前，所以跟着自己走）。阈值按无选中文本时的实测宽度取整，
   改字号或增删状态栏项后要重新量 */
@container (max-width: 360px) {
  .editor-pane__status .opt-utf8 {
    display: none;
  }
}

@container (max-width: 310px) {
  .editor-pane__status .opt-file {
    display: none;
  }
}

@container (max-width: 250px) {
  .editor-pane__status .opt-lang {
    display: none;
  }
}
</style>
