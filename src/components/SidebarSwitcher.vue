<script setup>
/**
 * SidebarSwitcher —— 侧栏页头里的两组入口：面板胶囊开关 + 设置。
 *
 * 它被渲染在两个面板各自的页头里（同一时刻只有一个面板可见，视觉上只有一份），
 * 不再单独占一行页签栏。状态与持久化都在外层 Sidebar，经 provide 下发，
 * 本组件只负责渲染与派发。
 *
 * 面板那枚胶囊的定稿形态（2026-09-28 改了两轮，别再走回头路）：
 * - **整枚胶囊是一颗 toggle 按钮**：点轨道上任意位置（含 2px 内边距、圆角、以及当前
 *   所在的那一段本身）都翻到另一个面板。所以它是 `<button>`，两段是纯视觉的 `<span>`。
 * - 两段的作用是**把「有两个面板可选」和「我正停在哪一个」同时画出来**：并排住在一个
 *   圆角轨道里，当前段填实心蓝。只画「将要去的那一个」看不出可切换（第一轮被否），
 *   两段各自接点击又会在胶囊内留 2px 死区、点边缘没反应（第二轮被否）。
 * - 文案写**将要去的那一个**（`title` / `aria-label` 都是「切换到评测样例」这种祈使句）：
 *   整枚是一个动作按钮，得让人预判点下去会去哪。
 *
 * 设置那颗在胶囊之外、自带点击：它开关的是编辑区里的设置页签，与面板互不排斥，
 * 塞进同一枚胶囊会暗示它也是面板、也在同一个 toggle 里。
 *
 * 抽题那颗（2026-10 新增，可选模块）排在设置齿轮**左边**，视觉语言与齿轮完全一致
 * （同一颗圆形图标钮、开着时填亮）。它在 `ready` 为假时整个不渲染：没下载过这个模块的
 * 用户页头里就不该多一颗按不动的按钮 —— 那是「可选」两个字在界面上的落实。
 * 顺序刻意是「抽题 → 设置」：齿轮是常驻的那个，位置不该被一个可选模块挤走。
 *
 * 都只画图标不写字：页头空间本来就紧张，名字靠 title / aria-label 交代。
 */
import { inject } from 'vue'
import AppIcon from './AppIcon.vue'
import { t } from '../i18n/index.js'

const { panels, targetPanel, togglePanel, hasSwitched, settings, toggleSettings, cfPicker } =
  inject('sidebarTabs')
</script>

<template>
  <nav class="sidebar-switcher" :aria-label="t('app.sidebar.switcherLabel')">
    <!-- 整枚胶囊＝一颗按钮。两段是 span（纯指示），不接点击，
         也不带 tabindex —— 键盘用户按一次空格/回车就翻过去，不需要在胶囊里再 Tab 一轮 -->
    <button
      type="button"
      class="sidebar-switcher__pill"
      :data-switched="hasSwitched ? '' : null"
      :title="t('app.sidebar.switchTo', { panel: targetPanel.label })"
      :aria-label="t('app.sidebar.switchTo', { panel: targetPanel.label })"
      @click="togglePanel"
    >
      <span
        v-for="panel in panels"
        :key="panel.id"
        class="sidebar-switcher__seg"
        :class="{ 'is-active': panel.active }"
        :data-panel="panel.id"
        :data-current="panel.active ? 'true' : null"
      >
        <AppIcon :name="panel.icon" size="18" />
      </span>
    </button>

    <!-- 抽题组件（可选模块）：没下载过就整颗不渲染。放在齿轮左边 —— 齿轮是常驻入口，
         位置不该被一个可卸载的模块推动；而这一颗在卸载后会消失，留下的空位不该在齿轮右侧。 -->
    <button
      v-if="cfPicker.ready"
      type="button"
      class="sidebar-switcher__tab"
      :class="{ 'is-active': cfPicker.active }"
      :title="cfPicker.title"
      :aria-label="cfPicker.label"
      :aria-pressed="cfPicker.active"
      @click="cfPicker.toggle"
    >
      <AppIcon :name="cfPicker.icon" size="16" />
    </button>

    <button
      type="button"
      class="sidebar-switcher__tab"
      :class="{ 'is-active': settings.active }"
      :title="settings.label"
      :aria-label="settings.label"
      :aria-pressed="settings.active"
      @click="toggleSettings"
    >
      <AppIcon :name="settings.icon" size="16" />
    </button>
  </nav>
</template>

<style scoped>
.sidebar-switcher {
  display: inline-flex;
  align-items: center;
  /* 轨道 64px + 间距 4px + 设置钮 26px = 94px（原先两段各 28px 时为 90px）。
     抽题那颗是可选的：下载过这个模块时再 +30px（26px 钮 + 4px 间距），
     页头得容得下这个浮动宽度 —— 它只影响侧栏页头，不会挤到编辑器。 */
  gap: 4px;
  /* 26px 高 + 页头上下各 4px 内边距 + 1px 下边框 = 35px，与面板头同高。
     高度不能再长：面板头就是 35px，长一寸「与面板头同高」这条就破了 */
  height: 26px;
  flex: 0 0 auto;
  /* 一段的尺寸与两段之间的间隔：下面 .sidebar-switcher__seg 用它定宽高，
     滑动动画用它算位移（位移 = 一段宽 + 一个间隔），所以只在这一处写死数字。
     间隔 0：两段紧挨着，胶囊内部不留缝，高亮滑过去就是「同一颗胶囊换了位置」
     （2026-10-04 从 2px 试到 4px，最后定为 0） */
  --seg-w: 30px;
  --seg-h: 22px;
  --seg-gap: 0px;
}

/* 胶囊轨道，同时也是那颗 toggle 按钮本体：13px 圆角 = 高度的一半。
   内边距 2px + 两段各 30px = 64px（段间隔为 0）。整块都要可点，所以别把点击处理下放到某一段 */
.sidebar-switcher__pill {
  display: inline-flex;
  align-items: center;
  /* 两枚 logo 之间的呼吸感：由 --seg-gap 定，现在是 0 —— 两段紧挨。
     它不影响可点性 —— 整枚轨道是一颗按钮，段之间那道缝即便为零也不构成分隔 */
  gap: var(--seg-gap);
  box-sizing: border-box;
  height: 26px;
  padding: 2px;
  border: none;
  border-radius: 13px;
  background: var(--bg-control);
  cursor: pointer;
  transition: background-color 0.16s ease;
}

/* hover 提亮整条轨道（而不是只提亮某一段）：这是「整枚都可以按」的反馈 */
.sidebar-switcher__pill:hover {
  background: var(--bg-control-hover);
}

/* 胶囊里的一段：纯视觉指示，没有自己的点击处理与 tabindex。
   段只管「图标 + 它占哪一格」，蓝色高亮交给它的 ::before —— 拆成两层是为了动画，见下面。
   `isolation` 让 ::before 那个 z-index:-1 只在段内生效，不会钻到轨道背景后面去。 */
.sidebar-switcher__seg {
  position: relative;
  isolation: isolate;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--seg-w);
  height: var(--seg-h);
  border-radius: 11px;
  color: var(--text-dim);
  transition: color 0.16s ease;
}

/* 蓝色高亮：一枚铺满当前段的小胶囊。默认隐身，选中才现身 —— 它是「我在哪一个面板」
   唯一的主信号，别退成只换图标色的弱提示。它压在轨道上面，所以轨道 hover 变亮时
   这一段仍是实心蓝 */
.sidebar-switcher__seg::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: 11px;
  background: var(--accent);
  opacity: 0;
  pointer-events: none;
}

.sidebar-switcher__seg.is-active {
  color: var(--text-on-accent);
}

.sidebar-switcher__seg.is-active::before {
  opacity: 1;
}

/* -------------------------------------------------------- 切换时的滑动动画
   难点：页头里的胶囊是**两个面板各渲染一份**（v-show 藏一个），点一下就把你刚点的那一份
   藏了、另一份亮出来，所以高亮不是同一个元素在移动 —— 过渡（transition）永远看不到。

   解法：让**新亮出来的那一份**里的蓝色高亮，从「原来那一段的位置」滑过来。
   两份胶囊在屏幕上的位置完全相同，于是看起来就是同一枚高亮在横移。
   用 `animation` 而不是 `transition`：元素从 display:none 变成可见时，动画会从头播。

   **只让高亮动、不让图标动**（2026-09-28 用户反馈：图标跟着高亮一起横移不符合直觉）：
   位移只挂在 `::before` 上，段自己不参与 transform，图标就钉在原格里；段的 `color`
   另走一条淡入动画并压 90ms 延迟（`backwards` 让延迟期间保持暗态）——
   高亮先滑到位，图标随后在原地点亮，就是 iOS 分段控件那个观感。
   两层动画写在不同选择器上（段 / 段的 ::before），互不干扰。

   `:nth-child` 判方向：第一段亮 = 从右边滑来，第二段亮 = 从左边滑来
   （只有两段，位移正好是「一段宽 + 一个段间隔」—— 高亮要跨过中间那道缝才是另一格，
   这也是它和上面 --seg-w / --seg-gap 的唯一耦合）。

   挂 `[data-switched]` 才放：首屏那次渲染同样是「从隐藏变可见」，不加这个条件就会在
   页面加载时平白播一次滑动 —— 可那时候并没有发生任何切换。 */
@keyframes sidebar-indicator-from-right {
  from {
    transform: translateX(calc(var(--seg-w) + var(--seg-gap)));
  }
  to {
    transform: none;
  }
}

@keyframes sidebar-indicator-from-left {
  from {
    transform: translateX(calc((var(--seg-w) + var(--seg-gap)) * -1));
  }
  to {
    transform: none;
  }
}

/* 图标点亮：只碰 color，不碰位移 */
@keyframes sidebar-icon-light-up {
  from {
    color: var(--text-dim);
  }
  to {
    color: var(--text-on-accent);
  }
}

.sidebar-switcher__pill[data-switched] .sidebar-switcher__seg.is-active:nth-child(1) {
  animation: sidebar-icon-light-up 200ms ease-out 90ms backwards;
}

.sidebar-switcher__pill[data-switched] .sidebar-switcher__seg.is-active:nth-child(1)::before {
  animation: sidebar-indicator-from-right 260ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

.sidebar-switcher__pill[data-switched] .sidebar-switcher__seg.is-active:nth-child(2) {
  animation: sidebar-icon-light-up 200ms ease-out 90ms backwards;
}

.sidebar-switcher__pill[data-switched] .sidebar-switcher__seg.is-active:nth-child(2)::before {
  animation: sidebar-indicator-from-left 260ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

/* 设置那颗：胶囊外的独立圆形图标钮，与轨道同高 */
.sidebar-switcher__tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  transition: color 0.16s ease, background-color 0.16s ease;
}

.sidebar-switcher__tab:hover {
  color: var(--text);
  background: var(--bg-hover);
}

/* 设置页签开着时填亮，与胶囊里选中段同一套「填亮＝开着」的语言。
   别退回 --bg-hover：那色（#3a3d41）和隔壁胶囊轨道（--bg-control #3c3c3c）几乎同色，
   实测两个控件会糊成一块，看不出齿轮是开着的。它在轨道之外、且是个圆形，
   不会被误读成「第三个面板被选中」 */
.sidebar-switcher__tab.is-active,
.sidebar-switcher__tab.is-active:hover {
  color: var(--text-on-accent);
  background: var(--accent);
}
</style>
