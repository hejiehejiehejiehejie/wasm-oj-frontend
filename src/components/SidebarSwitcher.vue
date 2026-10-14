<script setup>
/**
 * SidebarSwitcher —— 侧栏页头里的两组入口：面板胶囊开关 + 设置。
 *
 * 渲染在 Sidebar 的页头里、全站只有一份（2026-10-11 上提；此前两个面板各渲染一份、
 * 靠 v-show 藏一个）。状态与持久化都在外层 Sidebar，经 provide 下发，
 * 本组件只负责渲染与派发。
 *
 * 面板那枚胶囊的形态（交互模型 2026-09-28 定稿、别再走回头路；指示块 2026-10-11 重做）：
 * - **整枚胶囊是一颗 toggle 按钮**：点轨道上任意位置（含 2px 内边距、圆角、以及当前
 *   所在的那一段本身）都翻到另一个面板。所以它是 `<button>`，两段是纯视觉的 `<span>`。
 * - 两段的作用是**把「有两个面板可选」和「我正停在哪一个」同时画出来**：并排住在一个
 *   圆角轨道里，当前段底下压着实心蓝的指示块。只画「将要去的那一个」看不出可切换
 *   （第一轮被否），两段各自接点击又会在胶囊内留 2px 死区、点边缘没反应（第二轮被否）。
 * - 文案写**将要去的那一个**（`title` / `aria-label` 都是「切换到评测样例」这种祈使句）：
 *   整枚是一个动作按钮，得让人预判点下去会去哪。
 * - 段位是「图标 + 短标签」；侧栏不够宽时（Sidebar 的 compact）收起文字、退回纯图标，
 *   与重构前的胶囊同形。
 * - 单实例之后滑动是**真的**：指示块是 pill 里一个绝对定位元素，active 变化只改它的
 *   transform，transition 自己补间。不再需要旧版那套「两份胶囊互换 + keyframes 假装
 *   滑动 + data-switched 防首屏误播 + nth-child 猜方向」的 Hack。
 *
 * 设置那颗在胶囊之外、自带点击：它弹出 Quick Settings 下拉菜单（SettingsMenu），
 * 常见项在菜单里当场改完，末尾两项才打开编辑区里的设置页签。
 * 菜单悬着时不改变齿轮的 is-active（那只跟着设置页签走）。
 *
 * 抽题那颗（2026-10 新增，可选模块）排在设置齿轮**左边**，视觉语言与齿轮完全一致
 * （同一颗圆形图标钮、开着时填亮）。它在 `ready` 为假时整个不渲染：没下载过这个模块的
 * 用户页头里就不该多一颗按不动的按钮 —— 那是「可选」两个字在界面上的落实。
 * 顺序刻意是「抽题 → 设置」：齿轮是常驻的那个，位置不该被一个可选模块挤走。
 */
import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import SettingsMenu from './SettingsMenu.vue'
import { t } from '../i18n/index.js'

const { panels, targetPanel, togglePanel, settings, cfPicker, collapse, compact } =
  inject('sidebarTabs')

// 指示块的位置信号：当前面板的 id 直接写在 pill 的 data-active 上，
// CSS 按它给指示块写 translateX（见样式表）。无头回归另读段上的 data-current。
const activePanelId = computed(() => panels.value.find((panel) => panel.active)?.id ?? '')

// ------------------------------------------------------------ 设置下拉菜单
// 点齿轮不再直接开设置页，而是在齿轮位置弹一个 Quick Settings 菜单（SettingsMenu）：
// 主题 / 缩放 / 字号这类常用项在菜单里当场改完（内联开关 / 步进器 / 二级子菜单），
// 末尾两项才打开编辑区里那个设置页签 —— 「打开设置面板…」落在默认的「外观」，
// 「设置分类」的子菜单按分类直达（落点由 openSettingsTab(sectionId) 交下去）。
const menuAnchor = ref(null)
const menuButton = ref(null)

/**
 * SettingsMenu 经 usePopoverLayer 在 window **捕获阶段**用 pointerdown 收菜单（早于按钮的
 * click），所以「点同一颗齿轮想把它关掉」会先被它关掉、随后这颗按钮的 click 又进来 ——
 * 只看 menuAnchor 有没有值就会永远关不掉。这里在更早的一拍记下「这发 pointerdown 是不是
 * 点在齿轮上」，交给 toggleMenu 拦掉这一次重开。
 */
let suppressOpen = false

function onGlobalPointerDown(event) {
  suppressOpen = Boolean(menuAnchor.value && menuButton.value?.contains(event.target))
}

function toggleMenu() {
  if (suppressOpen) {
    suppressOpen = false
    return
  }
  if (menuAnchor.value) {
    closeMenu()
    return
  }
  // 菜单挂在齿轮下方、右缘与齿轮对齐（SettingsMenu 内部还会做视口收敛，贴边会自己缩回来）
  const rect = menuButton.value?.getBoundingClientRect()
  if (rect) menuAnchor.value = rect
}

function closeMenu() {
  menuAnchor.value = null
}

onMounted(() => window.addEventListener('pointerdown', onGlobalPointerDown, true))
onBeforeUnmount(() => window.removeEventListener('pointerdown', onGlobalPointerDown, true))
</script>

<template>
  <nav
    class="sidebar-switcher"
    :class="{ 'is-compact': compact }"
    :data-side="collapse.side"
    :aria-label="t('app.sidebar.switcherLabel')"
  >
    <!-- 收起侧栏：**只在窄屏出现**（基础 display: none，由 Sidebar 的窄屏块打开），
         箭头指向侧栏收走的方向，位置也贴那一侧的外端（order 见样式表）——
         箭头指哪、按钮就在哪、点下去就往哪收。折叠是 App 的 togglePanel，
         这里只派发，与拖分隔条到边界是同一条路。 -->
    <button
      type="button"
      class="sidebar-switcher__tab sidebar-switcher__collapse"
      :title="collapse.label"
      :aria-label="collapse.label"
      @click="collapse.toggle"
    >
      <AppIcon :name="collapse.icon" size="16" />
    </button>

    <!-- 整枚胶囊＝一颗按钮。两段是 span（纯指示），不接点击，
         也不带 tabindex —— 键盘用户按一次空格/回车就翻过去，不需要在胶囊里再 Tab 一轮 -->
    <button
      type="button"
      class="sidebar-switcher__pill"
      :data-active="activePanelId"
      :title="t('app.sidebar.switchTo', { panel: targetPanel.label })"
      :aria-label="t('app.sidebar.switchTo', { panel: targetPanel.label })"
      @click="togglePanel"
    >
      <!-- 蓝色指示块：一枚铺满当前段的小胶囊，active 变化时 transform 滑过去。
           它是「我在哪一个面板」唯一的主信号，别退成只换图标色的弱提示 -->
      <span class="sidebar-switcher__indicator" aria-hidden="true"></span>
      <span
        v-for="panel in panels"
        :key="panel.id"
        class="sidebar-switcher__seg"
        :class="{ 'is-active': panel.active }"
        :data-panel="panel.id"
        :data-current="panel.active ? 'true' : null"
      >
        <AppIcon :name="panel.icon" size="16" />
        <span v-if="!compact" class="sidebar-switcher__label">{{ panel.shortLabel }}</span>
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
      ref="menuButton"
      type="button"
      class="sidebar-switcher__tab"
      :class="{ 'is-active': settings.active }"
      :title="settings.label"
      :aria-label="settings.label"
      aria-haspopup="menu"
      :aria-expanded="Boolean(menuAnchor)"
      @click="toggleMenu"
    >
      <AppIcon :name="settings.icon" size="16" />
    </button>

    <SettingsMenu v-if="menuAnchor" :anchor="menuAnchor" placement="below-end" @close="closeMenu" />
  </nav>
</template>

<style scoped>
.sidebar-switcher {
  display: inline-flex;
  align-items: center;
  /* 带标签时轨道 148px + 间距 4px + 设置钮 26px = 178px；紧凑（纯图标）时轨道 64px，
     合计 94px（与重构前一致）。抽题那颗是可选的：下载过这个模块时再 +30px。
     页头得容得下这个浮动宽度 —— 它只影响侧栏页头，不会挤到编辑器。 */
  gap: 4px;
  /* 26px 高 + 页头上下各 4px 内边距 + 1px 下边框 = 35px，与面板头同高。
     高度不能再长：面板头就是 35px，长一寸「与面板头同高」这条就破了 */
  height: 26px;
  flex: 0 0 auto;
  /* 一段的尺寸：段的宽高与指示块的位移（= 一段宽，段间隔为 0）都只在这一处写。
     带标签 72px 的来历：图标 16 + 间距 5 + 文字（英文 Files/Tests 约 32px）+
     左右各 8px 内边距，中文（2 字）更宽松。紧凑模式回到重构前的 30px 纯图标格 */
  --seg-w: 72px;
  --seg-h: 22px;
}

.sidebar-switcher.is-compact {
  --seg-w: 30px;
}

/* 胶囊轨道，同时也是那颗 toggle 按钮本体：圆角 10px，与编辑区那张卡（App.vue 的 .pane，
   同样 10px）同值 —— 2026-10-14 由 13px（= 高度的一半，两端收成半圆）改过来，
   用户口径是「和编辑区的圆角一样」。高度仍是 26px，所以现在是圆角矩形、不是胶囊形；
   内部两处（指示块 / 段位）的圆角按「外圆角 − 内边距 2px」跟着写成 8px，保持同心，
   别只改这一处 —— 内层留 11px 会比外圈更圆，两端圆弧对不上。
   带标签时内边距 2px + 两段各 72px = 148px（紧凑时 64px）。
   整块都要可点，所以别把点击处理下放到某一段 */
.sidebar-switcher__pill {
  position: relative;
  display: inline-flex;
  align-items: center;
  /* 两段紧挨（间隔 0），胶囊内部不留缝：段之间那道缝即便为零也不构成分隔，
     指示块滑过去就是「同一枚高亮换了位置」 */
  gap: 0;
  box-sizing: border-box;
  height: 26px;
  padding: 2px;
  border: none;
  border-radius: 10px;
  background: var(--bg-control);
  cursor: pointer;
  transition: background-color 0.16s ease;
}

/* hover 提亮整条轨道（而不是只提亮某一段）：这是「整枚都可以按」的反馈。
   指示块压在轨道上面，所以轨道 hover 变亮时当前段仍是实心蓝 */
.sidebar-switcher__pill:hover {
  background: var(--bg-control-hover);
}

/* 蓝色指示块：单实例后它是 pill 里的一个真实元素，active 变化只改 transform，
   由 transition 补间 —— 位移量就是一段宽（段间隔 0）。首屏没有「上一次位置」，
   transition 不会触发，天然没有旧版要防的「加载时白播一次」。
   width 也挂过渡：切紧凑模式时它与段一起收，不会先跳变再滑 */
.sidebar-switcher__indicator {
  position: absolute;
  left: 2px;
  top: 2px;
  width: var(--seg-w);
  height: var(--seg-h);
  /* 与轨道同心：外圆角 10 − 内边距 2（改轨道圆角时这里要跟着算） */
  border-radius: 8px;
  background: var(--accent);
  pointer-events: none;
  transition:
    transform 0.26s cubic-bezier(0.22, 0.61, 0.36, 1),
    width 0.18s ease;
}

.sidebar-switcher__pill[data-active='tests'] .sidebar-switcher__indicator {
  transform: translateX(var(--seg-w));
}

/* 胶囊里的一段：纯视觉指示，没有自己的点击处理与 tabindex。
   z-index 把图标与文字抬到指示块之上；颜色切换压一点延迟 ——
   指示块先滑到位，图标与文字随后点亮，就是 iOS 分段控件那个观感 */
.sidebar-switcher__seg {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  width: var(--seg-w);
  height: var(--seg-h);
  /* 段位没有自己的背景，这圈圆角与指示块（8px）同值只为语义一致 */
  border-radius: 8px;
  color: var(--text-dim);
  transition: color 0.12s ease;
}

.sidebar-switcher__seg.is-active {
  color: var(--text-on-accent);
  transition: color 0.16s ease 0.06s;
}

.sidebar-switcher__label {
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
}

/* 胶囊外的独立图标钮（抽题 / 设置，窄屏另有「收起侧栏」复用同一套）：
   与轨道同高，圆角 10px —— 2026-10-14 由 50%（正圆）改成圆角方形，
   与胶囊轨道同值，一排控件形状统一。两处要一起改，别只动一个。 */
.sidebar-switcher__tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  transition:
    color 0.16s ease,
    background-color 0.16s ease;
}

.sidebar-switcher__tab:hover {
  color: var(--text);
  background: var(--bg-hover);
}

/* 设置页签开着时填亮，与胶囊里选中段同一套「填亮＝开着」的语言。
   别退回 --bg-hover：那色（#3a3d41）和隔壁胶囊轨道（--bg-control #343434）几乎同色，
   实测两个控件会糊成一块，看不出齿轮是开着的。
   2026-10-14 起它与胶囊段位同为圆角方形（原先靠「圆形」区分），所以「不被误读成第三个
   分段」的判据换成另外两条：它在轨道**之外**（没有轨道底色，只有自己填的那块），
   且与胶囊之间有 4px 间隙 —— 这两条别顺手去掉（比如给整排套一个共同底色）。 */
.sidebar-switcher__tab.is-active,
.sidebar-switcher__tab.is-active:hover {
  color: var(--text-on-accent);
  background: var(--accent);
}

/* 「收起侧栏」那颗（2026-10-13 加）：**只在窄屏出现** —— 这里写死 display: none，
   由 Sidebar.vue 的窄屏块带着 .sidebar__switcher 祖先把它打开（那边特异性 (0,3,0)）。
   宽屏不给它位置：那边有分隔条可拖、也有快捷键，多一颗入口是重复。
   外观整套复用 __tab（同一颗圆角方形图标钮、同尺寸同 hover），不另抄一份。
   它在 DOM 里排在最前，靠 order 挪到末尾 —— 侧栏停在**右**时箭头朝右，位置也贴右端；
   停在左时它本来就在最前、箭头朝左，于是「箭头指哪、按钮在哪、点下去往哪收」三者一致。 */
.sidebar-switcher__collapse {
  display: none;
}

.sidebar-switcher[data-side='right'] .sidebar-switcher__collapse {
  order: 1;
}
</style>
