<script setup>
/**
 * CfMenu —— 侧栏那颗 Codeforces 按钮唤出的组件菜单。
 *
 * 形态照应用抽屉（手机上的「九宫格」）那一路：深色圆角面板、抬头一行、
 * 下面是两列网格，每格一枚圆角方块图标 + 图标下方的名字。与 SettingsMenu /
 * ContextMenu 共用三样东西（同它们同一套纪律）：
 * - 颜色走同一组 `--menu-*` 令牌（base.css 的 VS Code Dark+ / Light+ 配对）；
 * - 尺寸走同一个等比缩放系数 `--menu-scale`（HANDOFF 第 5 节坑 33：
 *   要调大小只动这一个数，别单独动某一项 px）；
 * - 定位收敛与关闭逻辑走同一个 `composables/usePopoverLayer.js`。
 *
 * 【菜单里有什么】Codeforces 模块自己的两块界面：随机抽题（CfPickerPanel）与
 * 比赛（CfContestPanel）。点哪项就把那个合成页签亮出来（editorViews 的
 * open*Tab，本来就负责互斥），然后收掉菜单。模块没下载（cfReady 为假）时
 * 按钮根本不渲染，菜单也就无从谈起 —— 判据在挂它的两个宿主（SidebarSwitcher /
 * ActivityBar）里。
 *
 * 【键盘】Esc 关（usePopoverLayer 捕获阶段）；Tab 在两项之间自然走，
 * 打开时焦点送上第一项。方向键漫游不做了：两项一屏，Tab 足够。
 */
import { computed, nextTick, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { usePopoverLayer } from '../composables/usePopoverLayer.js'
import { t } from '../i18n/index.js'
import { openCfContestTab, openCfPickerTab } from '../services/editorViews.js'

const props = defineProps({
  /** 锚点（那颗 Codeforces 按钮）的 rect；菜单按它的位置展开 */
  anchor: { type: Object, required: true },
  /**
   * 展开方式，与 SettingsMenu 同一套：
   * - `below-end`：挂在锚点下方、右缘对齐（侧栏页头那颗）
   * - `beside`：贴在锚点旁边往屏幕内侧展开（折叠图标栏那颗 —— 它贴着屏幕边缘）
   */
  placement: { type: String, default: 'below-end' },
})

const emit = defineEmits(['close'])

const GAP = 4

/** 期望的那个点（算法与 SettingsMenu 一致，见那边注释） */
const desired = computed(() => {
  const rect = props.anchor
  if (props.placement === 'beside') {
    const onLeftHalf = rect.left + rect.width / 2 < window.innerWidth / 2
    return onLeftHalf
      ? { x: rect.right + GAP, y: rect.top, align: 'left' }
      : { x: rect.left - GAP, y: rect.top, align: 'right' }
  }
  return { x: rect.right, y: rect.bottom + GAP, align: 'right' }
})

const { root, position, ready } = usePopoverLayer({
  x: () => desired.value.x,
  y: () => desired.value.y,
  align: () => desired.value.align,
  onDismiss: () => emit('close'),
})

/** 菜单项。动作直接用 editorViews 的 open*Tab：重复点亮同一个页签无副作用 */
const items = computed(() => [
  { id: 'picker', icon: 'codeforces', label: t('cf.menu.picker'), run: openCfPickerTab },
  { id: 'contest', icon: 'clock', label: t('cf.menu.contest'), run: openCfContestTab },
])

function choose(item) {
  item.run()
  emit('close')
}

// 打开即把焦点送上第一项：Esc / Tab 立刻有着落，不用先点一下面板
const itemRefs = ref([])

watch(ready, (shown) => {
  if (shown) nextTick(() => itemRefs.value[0]?.focus())
})
</script>

<template>
  <Teleport to="body">
    <div
      ref="root"
      class="cf-menu"
      :class="{ 'cf-menu--ready': ready }"
      :style="position"
      role="menu"
      :aria-label="t('cf.menu.title')"
    >
      <header class="cf-menu__head">{{ t('cf.menu.title') }}</header>
      <div class="cf-menu__grid">
        <button
          v-for="(item, index) in items"
          :key="item.id"
          :ref="(el) => (itemRefs[index] = el)"
          type="button"
          class="cf-menu__item"
          role="menuitem"
          @click="choose(item)"
        >
          <span class="cf-menu__tile" aria-hidden="true">
            <AppIcon :name="item.icon" :size="22" />
          </span>
          <span class="cf-menu__label">{{ item.label }}</span>
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* 与 SettingsMenu 同一条纪律：尺寸单一来源 --menu-scale，颜色走 --menu-* 令牌 */
.cf-menu {
  --menu-scale: 0.92;
  position: fixed;
  z-index: 125;
  min-width: calc(200px * var(--menu-scale));
  padding: calc(10px * var(--menu-scale));
  background: var(--menu-bg);
  border: 1px solid var(--menu-border);
  border-radius: calc(14px * var(--menu-scale));
  box-shadow: var(--menu-shadow);
  visibility: hidden;
  transform-origin: top right;
}

.cf-menu--ready {
  visibility: visible;
  animation: cf-menu-in 0.1s ease;
}

@keyframes cf-menu-in {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
}

.cf-menu__head {
  margin: 0 0 calc(8px * var(--menu-scale)) calc(4px * var(--menu-scale));
  color: var(--menu-text);
  font-family: var(--font-sans, system-ui);
  font-size: calc(14px * var(--menu-scale));
  font-weight: 600;
}

.cf-menu__grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: calc(4px * var(--menu-scale));
}

/* 一格：图标方块在上、名字在下，整格可点。hover 通栏提亮（圆角），与两个菜单同语言 */
.cf-menu__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: calc(6px * var(--menu-scale));
  padding: calc(10px * var(--menu-scale)) calc(6px * var(--menu-scale)) calc(8px * var(--menu-scale));
  background: transparent;
  border: none;
  border-radius: calc(8px * var(--menu-scale));
  cursor: pointer;
  transition: background-color 0.1s ease;
}

.cf-menu__item:hover,
.cf-menu__item:focus-visible {
  background: var(--menu-hover-bg);
  outline: none;
}

/* 圆角方块图标位：应用抽屉里放的是彩色 logo，站内是一色图标，
   所以给方块一层底色把它从背景里托出来 */
.cf-menu__tile {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: calc(42px * var(--menu-scale));
  height: calc(42px * var(--menu-scale));
  border-radius: calc(12px * var(--menu-scale));
  background: var(--menu-hover-bg);
  color: var(--menu-text);
}

.cf-menu__item:hover .cf-menu__tile,
.cf-menu__item:focus-visible .cf-menu__tile {
  background: var(--menu-bg);
}

.cf-menu__label {
  color: var(--menu-text);
  font-family: var(--font-sans, system-ui);
  font-size: calc(12px * var(--menu-scale));
  line-height: 1.2;
  white-space: nowrap;
}
</style>
