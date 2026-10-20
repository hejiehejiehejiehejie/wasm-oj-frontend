<script setup>
/**
 * TabGroupCard —— 页签分组的编辑卡片（2026-10-19 加，模仿 Chrome 点分组芯片弹出的那张）：
 * 上面是命名框与一排色点，下面是批量操作（在组内添加新标签页 / 关闭标签页组 /
 * 取消分组 / 删除标签页组）。Chrome 的「将分组移至新窗口」这里没有对应物（没有窗口概念），不做。
 *
 * 定位与「什么时候关」复用 usePopoverLayer —— 与右键菜单 / 设置下拉同一套行为
 * （点外、Esc、失焦、视口变化；焦点在卡内时软键盘顶视口只重匣不收）。
 * 颜色走 base.css 的 --group-* 色板 + --menu-* 令牌，这里不写死色值。
 *
 * props.group 是 tabGroups 里那份 reactive 对象本体：改名 / 换色当场反映到芯片上，
 * 不需要额外的事件往返。
 */
import { ref, watch } from 'vue'
import { usePopoverLayer } from '../composables/usePopoverLayer.js'
import { t } from '../i18n/index.js'
import {
  GROUP_COLORS,
  appendNewTabToGroup,
  closeGroup,
  renameGroup,
  setGroupColor,
  ungroup,
} from '../services/tabGroups.js'

const props = defineProps({
  /** tabGroups.groups 里那一项（reactive 本体） */
  group: { type: Object, required: true },
  x: { type: Number, required: true },
  y: { type: Number, required: true },
})

const emit = defineEmits(['close'])

const { root, position, ready } = usePopoverLayer({
  x: () => props.x,
  y: () => props.y,
  onDismiss: () => emit('close'),
})

/** 输入框的草稿；change / Enter 才提交（敲每个字都落盘太吵） */
const name = ref(props.group.name ?? '')
watch(
  () => props.group.id,
  () => {
    name.value = props.group.name ?? ''
  },
)

function commitName() {
  renameGroup(props.group.id, name.value.trim())
}

async function action(id) {
  if (id === 'add-tab') await appendNewTabToGroup(props.group.id)
  else if (id === 'close-group' || id === 'delete-group') closeGroup(props.group.id)
  else if (id === 'ungroup') ungroup(props.group.id)
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div
      ref="root"
      class="tab-group-card"
      :class="{ 'tab-group-card--ready': ready }"
      :style="position"
      role="dialog"
      :aria-label="t('app.tabs.groupChip')"
    >
      <input
        v-model="name"
        class="tab-group-card__name"
        :placeholder="t('app.tabs.groupNamePh')"
        :aria-label="t('app.tabs.groupNamePh')"
        @change="commitName"
        @keydown.enter.prevent="commitName"
      />
      <div class="tab-group-card__colors" role="radiogroup" :aria-label="t('app.tabs.groupColors')">
        <button
          v-for="c in GROUP_COLORS"
          :key="c"
          type="button"
          class="tab-group-card__color"
          :class="{ 'is-active': c === group.color }"
          :style="{ '--group-c': `var(--group-${c})` }"
          role="radio"
          :aria-checked="c === group.color"
          :aria-label="t('app.tabs.groupColors')"
          @click="setGroupColor(group.id, c)"
        ></button>
      </div>
      <div class="tab-group-card__items">
        <button type="button" class="tab-group-card__item" @click="action('add-tab')">
          {{ t('app.tabs.groupAddTab') }}
        </button>
        <button type="button" class="tab-group-card__item" @click="action('close-group')">
          {{ t('app.tabs.groupClose') }}
        </button>
        <div class="tab-group-card__divider" role="separator"></div>
        <button type="button" class="tab-group-card__item" @click="action('ungroup')">
          {{ t('app.tabs.groupUngroup') }}
        </button>
        <button type="button" class="tab-group-card__item" @click="action('delete-group')">
          {{ t('app.tabs.groupDelete') }}
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* 与右键菜单同一族观感：颜色走 --menu-* 令牌，圆角 / 阴影 / 展开动画同款；
   宽度比菜单宽一档（要装下色点一排）。 */
.tab-group-card {
  position: fixed;
  z-index: 120;
  width: 264px;
  padding: 12px 12px 6px;
  background: var(--menu-bg);
  border: 1px solid var(--menu-border);
  border-radius: 10px;
  box-shadow: var(--menu-shadow);
  visibility: hidden;
  transform-origin: top left;
}

.tab-group-card--ready {
  visibility: visible;
  /* 复用右键菜单那支 0.1s 弹开（keyframes 在 scoped 下会改名，这里本地另写一份同名动作） */
  animation: tab-group-card-in 0.1s ease;
}

@keyframes tab-group-card-in {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
}

.tab-group-card__name {
  width: 100%;
  box-sizing: border-box;
  padding: 7px 10px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  font-family: var(--font-sans, system-ui);
  font-size: 13px;
  outline: none;
}

.tab-group-card__name:focus {
  border-color: var(--focus);
}

.tab-group-card__colors {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 2px;
}

/* 色点：18px 圆。选中的那枚外圈一个环（outline，不占布局） */
.tab-group-card__color {
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--group-c);
  cursor: pointer;
  transition: transform 0.1s ease;
}

.tab-group-card__color:hover {
  transform: scale(1.12);
}

.tab-group-card__color.is-active {
  outline: 2px solid var(--menu-hover-text, var(--text));
  outline-offset: 2px;
}

.tab-group-card__items {
  margin: 0 -12px -6px;
  padding: 6px 0;
  border-top: 1px solid var(--menu-separator);
}

.tab-group-card__item {
  display: block;
  width: 100%;
  padding: 7px 20px;
  background: transparent;
  border: none;
  border-radius: 0;
  color: var(--menu-text);
  font-family: var(--font-sans, system-ui);
  font-size: calc(13px * var(--menu-scale, 1));
  line-height: normal;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.1s ease, color 0.1s ease;
}

.tab-group-card__item:hover {
  background: var(--menu-hover-bg);
  color: var(--menu-hover-text);
}

.tab-group-card__divider {
  height: 1px;
  margin: 6px 10px;
  background: var(--menu-separator);
}
</style>
