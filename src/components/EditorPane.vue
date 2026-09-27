<script setup>
/**
 * EditorPane —— 编辑器面板（多标签、单编辑器组）。
 *
 * 重构要点：
 * - Monaco 实例只建一次，切文件只 editor.setModel()，绝不重建（HANDOFF 硬约束）；
 * - model 全部来自 ModelManager（按 fileId 单例，多分屏时可共享）；
 * - ViewState 按 fileId 在本面板内保存/恢复；
 * - ⌘S 保存当前文件，⌘⏎ 运行全部；
 * - 「设置」是与代码文件平级的合成页签：它显示时只是把 Monaco 藏起来（v-show，
 *   实例和 model 都留着），设置视图铺在同一层。
 */
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { monaco } from '../monaco-setup.js'
import { langMeta } from '../services/templates.js'
import { editorModelOptions, editorOptions } from '../services/editorOptions.js'
import { modelManager } from '../services/monaco/modelManager.js'
import { settingsTab } from '../services/settingsTab.js'
import {
  activeLanguage,
  activeNode,
  saveActive,
  workspace,
} from '../services/vfs/workspaceStore.js'
import AppIcon from './AppIcon.vue'
import EditorSettingsPanel from './EditorSettingsPanel.vue'
import EditorTabs from './EditorTabs.vue'

const props = defineProps({
  settings: { type: Object, required: true },
  panelPosition: { type: String, required: true },
  timeLimit: { type: Number, required: true },
  // 评测引擎状态：只有设置视图里的「评测」分组用得到，这里只做透传
  judge: { type: Object, required: true },
  connection: { type: Object, required: true },
  // 运行状态：页签栏最右那颗运行 / 停止按钮用
  running: Boolean,
  total: { type: Number, default: 0 },
})

const emit = defineEmits([
  'run-all',
  'update:settings',
  'update:time-limit',
  'toggle-layout',
  'select-engine',
  'update-base',
  'test-connection',
])

const host = ref(null)
const editor = shallowRef(null)
const cursor = ref({ lineNumber: 1, column: 1 })
const selectedChars = ref(0)

/** 本面板各文件的视图状态（滚动 / 光标 / 折叠） @type {Map<string, unknown>} */
const viewStates = new Map()

const meta = () => (activeLanguage.value ? langMeta(activeLanguage.value) : null)

/**
 * Monaco 在 editor.create 且未指定 model 时会自动造一个 inmemory://model/1。
 * 挂上真正的 VFS model 后它就是孤儿（永远不会被 UI 使用），及时销毁。
 */
function disposeInMemoryOrphans() {
  const attached = editor.value?.getModel()
  for (const model of monaco.editor.getModels()) {
    if (model.uri.scheme === 'inmemory' && model !== attached) model.dispose()
  }
}

/**
 * tabSize / insertSpaces 是 model 级选项（EditorOption 里没有它们），
 * 给它俩走 editor.create() / updateOptions() 会被 Monaco 静默丢掉。
 * 所以每挂上一个 model 都要补一次，否则新 model 会退回 4 空格默认值。
 */
function applyModelOptions(model) {
  model?.updateOptions(editorModelOptions(props.settings))
}

onMounted(() => {
  const instance = monaco.editor.create(host.value, {
    // 用户可调的选项全部来自 services/editorOptions.js（构造与 updateOptions 共用同一份映射）
    ...editorOptions(props.settings),
    theme: props.settings.theme,
    // 布局必须跟着容器走（面板拖宽 / 换边 / 折叠侧边栏）：交给 Monaco 自己的 ResizeObserver
    automaticLayout: true,
    overviewRulerBorder: false,
    fixedOverflowWidgets: true,
  })
  editor.value = instance

  // 启动时安静挂上当前 model（不抢焦点；会话恢复已建好 model）
  if (workspace.activeId) {
    const model = modelManager.getExistingModel(workspace.activeId)
    if (model) {
      instance.setModel(model)
      applyModelOptions(model)
    }
  }
  disposeInMemoryOrphans()

  instance.onDidChangeCursorPosition((event) => {
    cursor.value = { lineNumber: event.position.lineNumber, column: event.position.column }
  })

  instance.onDidChangeCursorSelection((event) => {
    selectedChars.value = instance.getModel()?.getValueInRange(event.selection)?.length ?? 0
  })

  instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => emit('run-all'))
  instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
    saveActive().catch(() => {})
  })

  monaco.editor.setTheme(props.settings.theme)
})

onBeforeUnmount(() => {
  editor.value?.dispose()
  editor.value = null
})

// ------------------------------------------------------------ 切文件（只换 model）

watch(
  () => workspace.activeId,
  (nextId, previousId) => {
    const instance = editor.value
    if (!instance) return
    if (previousId) viewStates.set(previousId, instance.saveViewState())

    if (!nextId) {
      instance.setModel(null)
      return
    }
    const model = modelManager.getExistingModel(nextId)
    if (!model) return
    instance.setModel(model)
    applyModelOptions(model)
    disposeInMemoryOrphans()
    const saved = viewStates.get(nextId)
    if (saved) instance.restoreViewState(saved)
    instance.focus()
  },
)

// ------------------------------------------------------------ 设置页签

// Monaco 在 display: none 的容器里量到的是 0 尺寸。automaticLayout 的 ResizeObserver
// 通常能在重新显示时自愈，但刚切回来那一帧仍可能用的是旧尺寸（滚动位置、概览标尺错位），
// 显式补一次 layout 最稳。
watch(
  () => settingsTab.active,
  (active) => {
    if (active) return
    nextTick(() => editor.value?.layout())
  },
)

// ------------------------------------------------------------ 编辑器设置

// 所有可调项一次性交给 updateOptions（映射见 editorOptions.js）：逐项写 watch 的写法
// 每加一项设置都要在两处同步，漏一处就是「面板里有、编辑器不认」。主题是唯一的例外，
// 它必须走 setTheme；tabSize / insertSpaces 也要单独落到 model 上（model.updateOptions
// 只在值真的变了时才发事件，所以这里无条件补一次是安全的）。
watch(
  () => props.settings,
  (next, prev) => {
    const instance = editor.value
    if (!instance) return
    instance.updateOptions(editorOptions(next))
    applyModelOptions(instance.getModel())
    if (prev?.theme !== next.theme) monaco.editor.setTheme(next.theme)
  },
  { deep: true },
)

defineExpose({ layout: () => editor.value?.layout() })
</script>

<template>
  <div class="editor-pane">
    <EditorTabs :running="running" :total="total" @run-all="emit('run-all')" />

    <div class="editor-pane__stage">
      <div v-show="!settingsTab.active" ref="host" class="editor-pane__host"></div>

      <!-- 设置视图与 Monaco 同一层，靠 v-show 互斥：切来切去不重建编辑器，
           也不重挂设置组件（它的运行环境探针订阅只建立一次） -->
      <EditorSettingsPanel
        v-show="settingsTab.active"
        :settings="settings"
        :panel-position="panelPosition"
        :time-limit="timeLimit"
        :judge="judge"
        :connection="connection"
        :active="settingsTab.active"
        @update:settings="emit('update:settings', $event)"
        @update:time-limit="emit('update:time-limit', $event)"
        @toggle-layout="emit('toggle-layout')"
        @select-engine="emit('select-engine', $event)"
        @update-base="emit('update-base', $event)"
        @test-connection="emit('test-connection')"
      />

      <div v-if="!activeNode && !settingsTab.active" class="editor-pane__empty">
        <AppIcon name="code" :size="26" class="editor-pane__empty-icon" />
        <p>在侧边栏的「资源管理器」里打开或新建文件</p>
      </div>
    </div>

    <!-- 状态栏说的都是活跃文件的事（行列、语言、空格数），看设置时它没有意义 -->
    <footer v-if="activeNode && !settingsTab.active" class="editor-pane__status">
      <span class="opt-file">{{ activeNode.name }}</span>
      <span class="dot opt-file"></span>
      <span class="opt-utf8">UTF-8</span>
      <span class="dot opt-utf8"></span>
      <span>空格: {{ settings.tabSize }}</span>
      <span class="grow"></span>
      <span v-if="selectedChars" class="picked">已选中 {{ selectedChars }} 字符</span>
      <span>行 {{ cursor.lineNumber }}，列 {{ cursor.column }}</span>
      <span class="dot opt-lang"></span>
      <span class="opt-lang">{{ meta()?.label }}</span>
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

.editor-pane__stage {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
}

.editor-pane__host {
  position: absolute;
  inset: 0;
}

.editor-pane__empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-faint);
  pointer-events: none;
}

.editor-pane__empty p {
  margin: 0;
  font-size: 13px;
}

.editor-pane__empty-icon {
  opacity: 0.5;
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

/* 由窄到宽逐项隐藏：UTF-8 是常量、文件名在页签栏已经有一份，先摘这两项，
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

/* 视口矮下去就整条收掉：这 22px 里放的都是常量信息（文件名 / UTF-8 / 空格数 / 行列），
   矮视口下编辑区高度更值钱。两道闸各管一半，不冲突：
   @media 看的是布局视口，桌面拖窗、Android 键盘都会缩它；
   .app.is-short 由 useMobileKeyboard 按 visualViewport 写，专管 iOS 键盘那种
   只缩可视视口、布局视口一动不动的情况。
   写 479 而不是 480：口径是「高度**小于** 480」，与 JS 那边的 `< 480` 等价 */
@media (max-height: 479px) {
  .editor-pane__status {
    display: none;
  }
}

.app.is-short .editor-pane__status {
  display: none;
}
</style>
