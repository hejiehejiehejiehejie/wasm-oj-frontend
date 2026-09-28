<script setup>
/**
 * InlineCreateRow —— 内联新建的输入行。
 *
 * 由 FileExplorer 在根目录渲染，或由 FileTreeItem 在目标目录的 role="group" 里渲染，
 * 两处共用同一份实现（状态与提交逻辑都在 FileExplorer，这里只负责画和收焦点）。
 *
 * 刻意不放进 .tree-item__row 内：那一行挂着 @keydown="onKeyDown"（方向键导航）和
 * 由 onTreeFocus 的 closest('[data-tree-id]') 驱动的 roving tabindex，输入框落在里面
 * 会让编辑文字的方向键被树抢走。
 */
import { inject, onBeforeUnmount, onMounted, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import { stem } from '../services/vfs/paths.js'

defineOptions({ name: 'InlineCreateRow' })

const props = defineProps({
  /** FileExplorer 的 creating 状态对象：{ type, targetId, targetPath, value, error } */
  state: { type: Object, required: true },
  /** 树的缩进层级；与 FileTreeItem 的行用同一套 depth（0 = 根目录下的行） */
  depth: { type: Number, default: 0 },
})

const commitCreate = inject('commitCreate')
const cancelCreate = inject('cancelCreate')
const onCreateBlur = inject('onCreateBlur')
/** FileExplorer 的句柄 ref：注册进去，供「程序性失焦后把焦点抢回来」使用 */
const creatingRow = inject('creatingRow')

const input = ref(null)

/**
 * autofocus 对动态插入的节点不生效，得自己把焦点送进去。
 * 选中范围按类型分流：文件（默认名 new.cpp / new.py）只选中主干、「.cpp」留着不动，
 * 免得用户改个名字就把后缀一起打没了；目录名整段选中。默认名都能直接回车接受。
 */
function focus() {
  const el = input.value
  if (!el) return
  el.focus()
  const end = props.state.type === 'file' ? stem(props.state.value).length : el.value.length
  el.setSelectionRange(0, end)
}

// 父组件的 nextTick(focusCreateInput) 排在 mounted 之后，所以这里注册完就能被调到
onMounted(() => {
  creatingRow.value = { focus }
})
onBeforeUnmount(() => {
  if (creatingRow.value?.focus === focus) creatingRow.value = null
})
</script>

<template>
  <div class="create-row" :style="{ paddingLeft: `${depth * 10 + 8}px` }">
    <span class="create-row__arrow"></span>
    <AppIcon class="create-row__icon" :name="state.type === 'file' ? 'file' : 'folder'" :size="15" />
    <input
      ref="input"
      v-model="state.value"
      class="create-row__input"
      :placeholder="state.type === 'file' ? 'new.cpp' : '新建文件夹'"
      @keydown.enter.prevent="commitCreate"
      @keydown.esc.prevent="cancelCreate"
      @blur="onCreateBlur"
    />
  </div>
  <p v-if="state.error" class="create-row__error" :style="{ paddingLeft: `${depth * 10 + 30}px` }">
    {{ state.error }}
  </p>
</template>

<style scoped>
.create-row {
  display: flex;
  align-items: center;
  height: 24px;
}

.create-row__arrow {
  flex: 0 0 16px;
}

.create-row__icon {
  flex: 0 0 auto;
  margin-right: 6px;
}

.create-row__input {
  flex: 1 1 auto;
  min-width: 0;
  height: 22px;
  margin-right: 8px;
  padding: 0 6px;
  background: var(--bg-input);
  border: 1px solid var(--accent);
  border-radius: 4px;
  color: var(--text);
  font: 400 13px/20px var(--font-mono, ui-monospace, monospace);
}

.create-row__error {
  margin: 2px 8px 2px 0;
  color: var(--danger-text);
  font-size: 11px;
  line-height: 16px;
}
</style>