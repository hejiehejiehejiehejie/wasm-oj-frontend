<script setup>
/**
 * ContextMenu —— Teleport 到 body 的通用右键菜单。
 * fixed 定位，挂载后按视口四边收敛（避免溢出屏幕）；
 * 点击外部 / Esc / 窗口失焦关闭。
 */
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * @typedef {Object} MenuItem
 * @property {string} id
 * @property {string} [label]
 * @property {boolean} [disabled]
 * @property {boolean} [divider]
 */

const props = defineProps({
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  /** @type {MenuItem[]} */
  items: { type: Array, required: true },
})

const emit = defineEmits(['select', 'close'])

const root = ref(null)
const position = ref({ left: `${props.x}px`, top: `${props.y}px` })
const ready = ref(false)

function close() {
  emit('close')
}

function select(item) {
  if (!item || item.disabled || item.divider) return
  emit('select', item.id)
}

function onPointerDown(event) {
  if (root.value && !root.value.contains(event.target)) close()
}

function onKeyDown(event) {
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
  }
}

onMounted(async () => {
  await nextTick()
  const el = root.value
  if (el) {
    const rect = el.getBoundingClientRect()
    const gap = 8
    const left = Math.max(gap, Math.min(props.x, window.innerWidth - rect.width - gap))
    const top = Math.max(gap, Math.min(props.y, window.innerHeight - rect.height - gap))
    position.value = { left: `${left}px`, top: `${top}px` }
  }
  ready.value = true
  // 延迟注册：避免触发本次右键的同一事件立刻把菜单关掉
  window.setTimeout(() => {
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('blur', close)
    window.addEventListener('resize', close)
  }, 0)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onPointerDown, true)
  window.removeEventListener('keydown', onKeyDown, true)
  window.removeEventListener('blur', close)
  window.removeEventListener('resize', close)
})
</script>

<template>
  <Teleport to="body">
    <div
      ref="root"
      class="context-menu"
      :class="{ 'context-menu--ready': ready }"
      :style="position"
      role="menu"
    >
      <template v-for="(item, index) in items" :key="item.id ?? index">
        <div v-if="item.divider" class="context-menu__divider" role="separator"></div>
        <button
          v-else
          type="button"
          class="context-menu__item"
          :disabled="item.disabled"
          role="menuitem"
          @click="select(item)"
        >
          {{ item.label }}
        </button>
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
.context-menu {
  position: fixed;
  z-index: 120;
  min-width: 168px;
  padding: 4px;
  background: var(--bg-raised);
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
  visibility: hidden;
}

.context-menu--ready {
  visibility: visible;
}

.context-menu__item {
  display: block;
  width: 100%;
  padding: 7px 12px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--text);
  font: 400 13px/18px var(--font-sans, system-ui);
  text-align: left;
  cursor: pointer;
}

.context-menu__item:hover:not(:disabled) {
  background: var(--bg-hover);
}

.context-menu__item:disabled {
  opacity: 0.45;
  cursor: default;
}

.context-menu__divider {
  height: 1px;
  margin: 4px 8px;
  background: var(--border-soft);
}
</style>
