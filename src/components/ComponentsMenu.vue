<script setup>
/**
 * ComponentsMenu —— 侧栏那颗「组件」按钮唤出的组件菜单。
 *
 * 形态照应用抽屉（手机上的「九宫格」）那一路：深色圆角面板、网格，
 * 每格一枚圆角方块图标 + 图标下方的名字。抬头只有一行「组件」（2026-10-20 按类分组时
 * 这行是去掉的 —— 两组各自带小标题；2026-11-14 并成一组，反过来留一行抬头更省地方）。与
 * SettingsMenu / ContextMenu 共用三样东西（同它们同一套纪律）：
 * - 颜色走同一组 `--menu-*` 令牌（base.css 的 VS Code Dark+ / Light+ 配对）；
 * - 尺寸走同一个等比缩放系数 `--menu-scale`（HANDOFF 第 5 节坑 33：
 *   要调大小只动这一个数，别单独动某一项 px）；
 * - 定位收敛与关闭逻辑走同一个 `composables/usePopoverLayer.js`。
 *
 * 【菜单里有什么】一格一个组件，一屏并排两格（2026-11-14 用户要求：Codeforces 与倒计时
 * **并排**、抬头只留一个「组件」，所以原来的「Codeforces / 工具」两组并成一组）：
 * - Codeforces：抽题与比赛 2026-10-27 合并成一个页签（CfCodeforcesPanel），这里只有一格。
 * - 倒计时：悬浮卡（CountdownCard），原来单列的「工具」那一类。
 * 两格各按自己的安装态显隐（条目级的 `available()`）：Codeforces 看 `cfReady`（模块没下载
 * 时不该留一颗点了没反应的格子），倒计时看设置里装没装。两格都不在时，面板本身仍然
 * 弹出来并给一句「装哪儿」—— 侧栏那颗「组件」按钮常驻（2026-10-20 之前是 cfReady 为假
 * 就整颗不渲染），点了不能毫无反应。
 * 点哪项就把那个界面亮出来，然后收掉菜单。
 *
 * 【键盘】Esc 关（usePopoverLayer 捕获阶段）；Tab 在可见项之间自然走，
 * **鼠标设备上**打开时焦点送上第一项（触屏上不送，理由见下面 watch 那段）。方向键漫游不做：一屏只有两格，Tab 足够。
 */
import { computed, nextTick, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { usePopoverLayer } from '../composables/usePopoverLayer.js'
import { isTouchPointer } from '../composables/useMobileKeyboard.js'
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

const { root, position, ready, flipped } = usePopoverLayer({
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
 * 过滤规则没变（2026-10-21 定）：每一格都只在「装着」时出现 —— 没装的组件不该留一颗
 * 点了没反应的格子，与设置里卸载那一行是同一条判据（各自的 `available()`）。
 * 2026-11-14 起表里只有一节，所以「整节被过滤空」就等于「两格都不在」→ 走 empty 那句。
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

// 打开即把焦点送上第一项：Esc / Tab 立刻有着落，不用先点一下面板。
// **触屏上不送**（2026-10-31，用户报「没按它，Codeforces 那格却是按下状态」）：
// 脚本 focus 在 Chrome 里被判成键盘意图、`:focus-visible` 当场成立，而那一格
// 的选中高亮与悬停共用同一条规则（下面 `.components-menu__item:focus-visible`
// 那条），于是第一格被画成「选中」。触屏没有 Tab 要走，判断与
// EditorPane / FileExplorer 那几处「不许程序化抢焦点」同一条口径。
const itemRefs = {}

function setItemRef(id, el) {
  itemRefs[id] = el
}

watch(ready, (shown) => {
  if (!shown || isTouchPointer()) return
  nextTick(() => itemRefs[flatItems.value[0]?.id]?.focus())
})
</script>

<template>
  <Teleport to="body">
    <div
      ref="root"
      class="components-menu"
      :class="{ 'components-menu--ready': ready, 'components-menu--flip': flipped }"
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
              <!-- 24 而不是 22：AppIcon 的 viewBox 是 24 网格，渲染尺寸必须是它的整数倍，
                   否则路径坐标落到物理像素的非整数位置上，圆弧的抗锯齿被量化成台阶（锯齿）。
                   2026-11-01 实测（dpr 2，边缘硬边占比）：22px 28% → 24px 15%；
                   dpr 3 更明显（18% → 9%）。非整数 dpr（系统缩放 125% / 150%）下两者一样，
                   那是浏览器光栅化的固有限制。 -->
              <AppIcon :name="item.icon" :size="24" />
            </span>
            <span class="components-menu__label">{{ item.label }}</span>
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
/* 与 SettingsMenu 同一条纪律：尺寸单一来源 --menu-scale（2026-11-18 起挂在 base.css 的
   :root 上，四个菜单共用一份），颜色走 --menu-* 令牌 */
.components-menu {
  position: fixed;
  z-index: 125;
  /* 与 SettingsMenu 同一条：View Transition 里浮层要自己成组，否则会被两栏快照盖住，
     表现是「换边 / 折叠那一下菜单闪没了」 */
  view-transition-name: components-menu;
  min-width: calc(200px * var(--menu-scale));
  padding: calc(10px * var(--menu-scale));
  background: var(--menu-bg);
  /* 无 border（2026-11-18）：不画任何环，轮廓靠 --menu-shadow 首层那道虚化发丝影，
     不再向外占 1px、把这块菜单框成一个盒子 */
  border: none;
  /* 圆角 10px 是全系唯一**不乘** --menu-scale 的那档（2026-10-25 用户指定「量出来 10px」，
     乘 0.92 只有 9.2px）。2026-11-18 起收到令牌层 --menu-radius-lg，不再在本文件写死字面量；
     其余尺寸照旧跟着 --menu-scale 缩放。 */
  border-radius: var(--menu-radius-lg);
  box-shadow: var(--menu-shadow);
  /* 与另三个菜单同一层微毛玻璃 */
  backdrop-filter: var(--menu-backdrop);
  visibility: hidden;
  /* 匣比菜单矮时（矮窗口 / 键盘顶起来）usePopoverLayer 会压一个 max-height，这里负责滚 */
  overflow-y: auto;
  transform-origin: top right;
}

/* 被匣到锚点上方时（贴底打开）：origin 翻到右下角 —— 那一角才挨着按钮，
   起手位移同时翻成正的（从下浮上来）。见 base.css 的 --menu-enter-y */
.components-menu--flip {
  transform-origin: bottom right;
  --menu-enter-y: calc(4px * var(--menu-scale));
}

.components-menu--ready {
  visibility: visible;
  /* 0.15s + 自定义缓出，与右键菜单同一支曲线（2026-11-18） */
  animation: components-menu-in 0.15s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  /* 阴影 + 玻璃面的浮层提前提层，避免动画首帧掉帧（与另三个菜单同一条） */
  will-change: transform, opacity;
}

@keyframes components-menu-in {
  from {
    opacity: 0;
    transform: scale(0.92) translateY(var(--menu-enter-y));
  }
}

/* 节与节之间的分隔线：2026-11-14 起只有一节（两格并排），这条规则暂时没人用 ——
   留着是因为分组表本身还支持多节，将来再加一类时不至于忘了分隔线怎么画。 */
.components-menu__section + .components-menu__section {
  margin-top: calc(8px * var(--menu-scale));
  padding-top: calc(8px * var(--menu-scale));
  border-top: 1px solid var(--menu-separator);
}

/* 抬头（现在只有「组件」一行）：小一号、灰一档，别抢戏 */
.components-menu__section-label {
  margin: 0 0 calc(4px * var(--menu-scale)) calc(4px * var(--menu-scale));
  color: var(--menu-muted);
  font-family: var(--font-sans, system-ui);
  font-size: calc(11px * var(--menu-scale));
  font-weight: 600;
  line-height: 1.2;
}

/* 两格都不在（Codeforces 没下、倒计时也卸了）：面板本身还在，不然一颗常驻按钮点了毫无反应；
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
  border-radius: calc(6px * var(--menu-scale));
  cursor: pointer;
  transition: background-color 0.1s ease;
}

:where(html.is-hoverable) .components-menu__item:hover,
.components-menu__item:focus-visible {
  background: var(--menu-hover-bg);
  outline: none;
}

/* 圆角方块图标位：应用抽屉里放的是彩色 logo，站内是一色图标，
   所以给方块一层底色把它从背景里托出来 */
.components-menu__tile {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: calc(42px * var(--menu-scale));
  height: calc(42px * var(--menu-scale));
  border-radius: calc(10px * var(--menu-scale));
  background: var(--menu-tile-bg);
  color: var(--menu-text);
}

:where(html.is-hoverable) .components-menu__item:hover .components-menu__tile,
.components-menu__item:focus-visible .components-menu__tile {
  background: var(--menu-bg);
}

/* 悬停 / 键盘选中时整格变蓝，文字也要跟着转白，否则浅色主题下是深灰压亮蓝 */
:where(html.is-hoverable) .components-menu__item:hover .components-menu__label,
.components-menu__item:focus-visible .components-menu__label {
  color: var(--menu-hover-text);
}

.components-menu__label {
  color: var(--menu-text);
  font-family: var(--font-sans, system-ui);
  font-size: calc(12px * var(--menu-scale));
  line-height: 1.2;
  white-space: nowrap;
}
</style>
