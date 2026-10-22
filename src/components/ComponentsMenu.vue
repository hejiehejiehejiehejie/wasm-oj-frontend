<script setup>
/**
 * ComponentsMenu —— 侧栏那颗「组件」按钮唤出的组件菜单。
 *
 * 形态照应用抽屉（手机上的「九宫格」）那一路：深色圆角面板、按类分组的网格，
 * 每格一枚圆角方块图标 + 图标下方的名字。不写抬头（2026-10-20 用户要求去掉
 * 「组件」字样）：按钮本身已经表达了这是哪一类菜单，直接进分组更省一行）。与 SettingsMenu /
 * ContextMenu 共用三样东西（同它们同一套纪律）：
 * - 颜色走同一组 `--menu-*` 令牌（base.css 的 VS Code Dark+ / Light+ 配对）；
 * - 尺寸走同一个等比缩放系数 `--menu-scale`（HANDOFF 第 5 节坑 33：
 *   要调大小只动这一个数，别单独动某一项 px）；
 * - 定位收敛与关闭逻辑走同一个 `composables/usePopoverLayer.js`。
 *
 * 【菜单里有什么】按「类」分组（2026-10-20 用户定的结构）：
 * - Codeforces：随机抽题（CfPickerPanel）与比赛（CfContestPanel）两块合成页签。
 *   整组跟着 `cfReady` 显隐 —— 模块没下载时不该留两颗点了没反应的格子。
 * - 工具：倒计时（悬浮卡）。它与 Codeforces 的安装态互不相干，所以侧栏那颗「组件」
 *   按钮本身常驻（2026-10-20 之前是 cfReady 为假就整颗不渲染）；而**组内**的格子
 *   跟着各自的安装态走 —— 倒计时在设置里被卸载后，这一组就整组消失（2026-10-21）。
 * 点哪项就把那个界面亮出来，然后收掉菜单。
 *
 * 【键盘】Esc 关（usePopoverLayer 捕获阶段）；Tab 在可见项之间自然走，
 * 打开时焦点送上第一项。方向键漫游不做了：一屏最多三项，Tab 足够。
 */
import { computed, nextTick, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { usePopoverLayer } from '../composables/usePopoverLayer.js'
import { t } from '../i18n/index.js'
import { COMPONENT_GROUPS } from '../services/activityBarPins.js'

const props = defineProps({
  /** 锚点（那颗「组件」按钮）的 rect；菜单按它的位置展开 */
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

/**
 * 分组表从 `services/activityBarPins.js` 的 COMPONENT_GROUPS 派生（2026-10-22）——
 * 那张表同时喂给折叠图标栏的右键菜单与固定格，**不要再在这里另抄一份**：
 * 图标名 / 文案键 / 可用判据三样一旦分叉，同一个组件会在两处长得不一样。
 *
 * 过滤规则没变（2026-10-21 定）：两组都只在「装着」时出现 —— 没装的组件不该留一颗
 * 点了没反应的格子，与设置里卸载那一行是同一条判据（各自的 `available()`）。
 * 动作直接用目录里的 `run`（open*Tab / openCountdown）：
 * 重复点亮同一个页签、重复开同一张卡都没有副作用。
 */
const groups = computed(() =>
  COMPONENT_GROUPS.map((group) => ({
    id: group.id,
    label: t(group.labelKey),
    items: group.items
      .filter((item) => item.available())
      .map((item) => ({ ...item, label: t(item.labelKey) })),
  })).filter((group) => group.items.length),
)

/** 扁平表只用于「第一项是谁」：焦点落点与 ref 回收都按 id 走 */
const flatItems = computed(() => groups.value.flatMap((group) => group.items))

function choose(item) {
  item.run()
  emit('close')
}

// 打开即把焦点送上第一项：Esc / Tab 立刻有着落，不用先点一下面板
const itemRefs = {}

function setItemRef(id, el) {
  itemRefs[id] = el
}

watch(ready, (shown) => {
  if (shown) nextTick(() => itemRefs[flatItems.value[0]?.id]?.focus())
})
</script>

<template>
  <Teleport to="body">
    <div
      ref="root"
      class="components-menu"
      :class="{ 'components-menu--ready': ready }"
      :style="position"
      role="menu"
      :aria-label="t('components.menu.title')"
    >
      <p v-if="!groups.length" class="components-menu__empty">{{ t('components.menu.empty') }}</p>
      <section v-for="group in groups" :key="group.id" class="components-menu__section">
        <h3 class="components-menu__section-label">{{ group.label }}</h3>
        <div class="components-menu__grid">
          <button
            v-for="item in group.items"
            :key="item.id"
            :ref="(el) => setItemRef(item.id, el)"
            type="button"
            class="components-menu__item"
            role="menuitem"
            @click="choose(item)"
          >
            <span class="components-menu__tile" aria-hidden="true">
              <AppIcon :name="item.icon" :size="22" />
            </span>
            <span class="components-menu__label">{{ item.label }}</span>
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
/* 与 SettingsMenu 同一条纪律：尺寸单一来源 --menu-scale，颜色走 --menu-* 令牌 */
.components-menu {
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

.components-menu--ready {
  visibility: visible;
  animation: components-menu-in 0.1s ease;
}

@keyframes components-menu-in {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
}

.components-menu__section + .components-menu__section {
  margin-top: calc(8px * var(--menu-scale));
  padding-top: calc(8px * var(--menu-scale));
  border-top: 1px solid var(--menu-separator);
}

/* 类名（Codeforces / 工具）：小一号、灰一档，别抢戏 */
.components-menu__section-label {
  margin: 0 0 calc(4px * var(--menu-scale)) calc(4px * var(--menu-scale));
  color: var(--menu-muted);
  font-family: var(--font-sans, system-ui);
  font-size: calc(11px * var(--menu-scale));
  font-weight: 600;
  line-height: 1.2;
}

/* 两组都空（Codeforces 没下、倒计时也卸了）：面板本身还在，不然一颗常驻按钮点了毫无反应；
   这里给一句话说明「装哪儿」。文案走 i18n，与别处同一纪律 */
.components-menu__empty {
  margin: 0;
  padding: calc(4px * var(--menu-scale)) calc(6px * var(--menu-scale)) calc(6px * var(--menu-scale));
  color: var(--menu-muted);
  font-family: var(--font-sans, system-ui);
  font-size: calc(12px * var(--menu-scale));
  line-height: 1.4;
}

.components-menu__grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: calc(4px * var(--menu-scale));
}

/* 一格：图标方块在上、名字在下，整格可点。hover 通栏提亮（圆角），与两个菜单同语言 */
.components-menu__item {
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

.components-menu__item:hover,
.components-menu__item:focus-visible {
  background: var(--menu-hover-bg);
  outline: none;
}

/* 圆角方块图标位：应用抽屉里放的是彩色 logo，站内是一色图标，
   所以给方块一层底色把它从背景里托出来 */
.components-menu__tile {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: calc(42px * var(--menu-scale));
  height: calc(42px * var(--menu-scale));
  border-radius: calc(12px * var(--menu-scale));
  background: var(--menu-hover-bg);
  color: var(--menu-text);
}

.components-menu__item:hover .components-menu__tile,
.components-menu__item:focus-visible .components-menu__tile {
  background: var(--menu-bg);
}

.components-menu__label {
  color: var(--menu-text);
  font-family: var(--font-sans, system-ui);
  font-size: calc(12px * var(--menu-scale));
  line-height: 1.2;
  white-space: nowrap;
}
</style>
