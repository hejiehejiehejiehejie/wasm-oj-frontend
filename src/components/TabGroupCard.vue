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

/**
 * 回车提交组名。中文输入法里「回车」常常是「确认候选词」而不是「提交」，
 * 组字期间敲下去会把半截拼音当成组名落盘（组芯片上就顶着「zhong」）——
 * 与仓库同一条规矩（见 FileExplorer 的 onSearchKeydown / InlineCreateRow 的 submitCreateOnEnter）：
 * 组字中一律不当成提交。
 *
 * 模板里**不能**写成 `@keydown.enter.prevent`：`.prevent` 先于本函数执行，会把组字那一下
 * 的默认行为（候选词上屏）一起吃掉。keyCode 229 是部分输入法组字时不报 isComposing 的补漏。
 */
function commitNameOnEnter(event) {
  if (event.isComposing || event.keyCode === 229) return
  event.preventDefault()
  commitName()
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
        @keydown.enter="commitNameOnEnter"
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
/* 与右键菜单同一族观感，且**同尺寸**（2026-10-23 用户要求）：
   尺寸与 ContextMenu 共用同一个 --menu-scale（2026-11-18 起统一挂在 base.css 的 :root 上，
   本文件不再自己声明），宽度直接取菜单那 220px 模板宽 × 同一系数，
   字号 / 内边距 / 条目行高 / 圆角全跟着 0.92 走，并排看不出两套尺子。
   色点行是这里独有的内容：8 个点 × 16.56 + 7 个间距，按 8px×0.92 排会超出 202.4 的版心
   （178.3），所以间距单独收到 6px×0.92，其余一律不手调。
   2026-11-18 与右键菜单同步：玻璃面 + 内侧高光边（无 border）+ 三层影 + 胶囊式条目悬停
   + 0.15s 阻尼动效。 */
.tab-group-card {
  position: fixed;
  z-index: 120;
  width: calc(220px * var(--menu-scale));
  padding: calc(12px * var(--menu-scale)) calc(12px * var(--menu-scale)) calc(6px * var(--menu-scale));
  background: var(--menu-bg);
  /* 不画 border，边缘靠 --menu-shadow 的 inset 高光（见 base.css 那段说明） */
  border: none;
  border-radius: calc(6px * var(--menu-scale));
  box-shadow: var(--menu-shadow);
  /* 与右键菜单同一层微毛玻璃；卡里那颗命名框自己是实底的，读字不受影响 */
  backdrop-filter: var(--menu-backdrop);
  visibility: hidden;
  /* 匣比卡片矮时（矮窗口 / 键盘顶起来）usePopoverLayer 会压一个 max-height，这里负责滚 */
  overflow-y: auto;
  transform-origin: top left;
}

.tab-group-card--ready {
  visibility: visible;
  /* 复用右键菜单那支动效的曲线与时长（keyframes 在 scoped 下会改名，这里本地另写一份同名动作） */
  animation: tab-group-card-in 0.15s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes tab-group-card-in {
  from {
    opacity: 0;
    transform: scale(0.92) translateY(-4px);
  }
}

.tab-group-card__name {
  width: 100%;
  box-sizing: border-box;
  padding: calc(7px * var(--menu-scale)) calc(10px * var(--menu-scale));
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: calc(4px * var(--menu-scale));
  color: var(--text);
  font-family: var(--font-sans, system-ui);
  font-size: calc(13px * var(--menu-scale));
  outline: none;
}

.tab-group-card__name:focus {
  border-color: var(--focus);
}

.tab-group-card__colors {
  display: flex;
  align-items: center;
  gap: calc(6px * var(--menu-scale));
  padding: calc(10px * var(--menu-scale)) calc(2px * var(--menu-scale));
}

/* 色点：18px 圆（随 --menu-scale 缩）。选中的那枚外圈一个环（outline，不占布局） */
.tab-group-card__color {
  width: calc(18px * var(--menu-scale));
  height: calc(18px * var(--menu-scale));
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--group-c);
  cursor: pointer;
  transition: transform 0.1s ease;
}

:where(html.is-hoverable) .tab-group-card__color:hover {
  transform: scale(1.12);
}

.tab-group-card__color.is-active {
  outline: 2px solid var(--menu-hover-text, var(--text));
  outline-offset: 2px;
}

.tab-group-card__items {
  /* 负边距让它横向铺满卡片（上面那块命名区的 12px 内边距在这里被抵掉），
     再靠自己的 --menu-pad-x 给条目留出与边框之间的呼吸位 —— 与右键菜单的容器内距同一档 */
  margin: 0 calc(-12px * var(--menu-scale)) calc(-6px * var(--menu-scale));
  padding: calc(6px * var(--menu-scale)) calc(var(--menu-pad-x) * var(--menu-scale));
  border-top: 1px solid var(--menu-separator);
}

/* 条目与右键菜单的条目同一套尺子：6px 12px × 0.92、字号 13px × 0.92，
   行高交给字体天然行盒（菜单那边也是），所以条目高度正好都是 28px。
   圆角 4px × 系数也是同一档（胶囊式悬停，2026-11-18）。 */
.tab-group-card__item {
  display: block;
  width: 100%;
  padding: calc(6px * var(--menu-scale)) calc(var(--menu-item-pad-x) * var(--menu-scale));
  background: transparent;
  border: none;
  border-radius: calc(4px * var(--menu-scale));
  color: var(--menu-text);
  font-family: var(--font-sans, system-ui);
  font-size: calc(13px * var(--menu-scale));
  line-height: normal;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.1s ease, color 0.1s ease;
}

:where(html.is-hoverable) .tab-group-card__item:hover {
  background: var(--menu-hover-bg);
  color: var(--menu-hover-text);
}

.tab-group-card__divider {
  height: 1px;
  /* 条目区已有 --menu-pad-x（4px）内距，这里收到 6px —— 与右键菜单的分隔线同一条视觉内缩 */
  margin: calc(6px * var(--menu-scale)) calc(6px * var(--menu-scale));
  background: var(--menu-separator);
}
</style>
