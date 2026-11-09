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
 * 「组件」那颗（2026-10-20 改名，原 Codeforces 那颗）排在设置齿轮**左边**，视觉语言与齿轮
 * 完全一致（同一颗圆形图标钮、开着任一组件时填亮）。点它弹出组件菜单（ComponentsMenu），
 * 里面按类分组：Codeforces（随机抽题 / 比赛）与工具（倒计时）。
 * 2026-10-20 之前它只在 Codeforces 模块就绪时渲染（「没下载就不该多一颗按不动的按钮」）；
 * 现在菜单里多了与模块无关的「工具」类，按钮因此改为常驻 —— 卸载 Codeforces 之后，
 * 倒计时的入口不能跟着消失。顺序仍刻意是「组件 → 设置」：齿轮是常驻的那个，排在右端。
 */
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import ComponentsMenu from './ComponentsMenu.vue'
import SettingsMenu from './SettingsMenu.vue'
import { t } from '../i18n/index.js'
import { onViewportChange } from '../composables/useMobileKeyboard.js'
import { panelPosition } from '../services/shellSettings.js'

const { panels, targetPanel, togglePanel, settings, components, collapse, compact } =
  inject('sidebarTabs')

// 指示块的位置信号：当前面板的 id 直接写在 pill 的 data-active 上，
// CSS 按它给指示块写 translateX（见样式表）。无头回归另读段上的 data-current。
const activePanelId = computed(() => panels.value.find((panel) => panel.active)?.id ?? '')

// ------------------------------------------------------------ 设置下拉菜单
// 点齿轮不再直接开设置页，而是在齿轮位置弹一个 Quick Settings 菜单（SettingsMenu）：
// 主题 / 缩放 / 字号这类常用项在菜单里当场改完（内联开关 / 步进器 / 二级子菜单），
// 末尾两项才打开编辑区里那个设置页签。
// 菜单悬着时不改变齿轮的 is-active（那只跟着设置页签走）。

// ------------------------------------------------------------ 两颗菜单按钮的公共机制
// 齿轮（SettingsMenu）与组件那颗（ComponentsMenu）各有一份 anchor，但「点按钮收菜单
 // 会被捕获阶段的 pointerdown 抢先」是同一个坑：那一层先收掉菜单、按钮的 click 又进来，
 // 只看 anchor 有没有值就会永远关不掉。所以在更早的一拍记下「这发 pointerdown 是不是
 // 点在某一颗按钮上」，各自的 toggle 拦掉这一次重开。
const menuAnchor = ref(null)
const menuButton = ref(null)
const compMenuAnchor = ref(null)
const compMenuButton = ref(null)

let suppressOpen = false
let suppressCompOpen = false

function onGlobalPointerDown(event) {
  suppressOpen = Boolean(menuAnchor.value && menuButton.value?.contains(event.target))
  suppressCompOpen = Boolean(compMenuAnchor.value && compMenuButton.value?.contains(event.target))
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

function toggleCompMenu() {
  if (suppressCompOpen) {
    suppressCompOpen = false
    return
  }
  if (compMenuAnchor.value) {
    closeCompMenu()
    return
  }
  // 菜单挂在按钮下方、右缘与按钮对齐（ComponentsMenu 内部做视口收敛）
  const rect = compMenuButton.value?.getBoundingClientRect()
  if (rect) compMenuAnchor.value = rect
}

function closeCompMenu() {
  compMenuAnchor.value = null
}

onMounted(() => window.addEventListener('pointerdown', onGlobalPointerDown, true))
onBeforeUnmount(() => window.removeEventListener('pointerdown', onGlobalPointerDown, true))

/**
 * 换边后齿轮 / 组件钮整颗挪到另一侧，菜单却还钉在打开时量下的那个 rect 上。
 * 这里把新位置写回锚点，`usePopoverLayer` 会跟着重新匣一次（菜单不关、跟着按钮走）。
 *
 * 必须是 post：量位置要等 `order` 换完、新一帧的布局落地之后。
 */
/**
 * 把两颗按钮的新位置写回锚点（菜单跟着按钮走，见下面两处调用点）。
 *
 * 两条纪律：
 * - **量不到尺寸就不写**：按钮此刻若正被收起来（`display: none`，`getBoundingClientRect()`
 *   全 0），写回去等于把菜单锚到视口左上角 —— 收键盘时窄屏贴底那一簇先是 `is-typing`
 *   收掉、再恢复，通知恰好落在「已收起」那一帧上（2026-11-09 与「点导入后菜单被收掉」
 *   一并暴露）。保留旧锚点，等下一帧恢复后重量。
 * - 因此由 `onViewportChange` 那一路**延后一帧**调用：那条通知是同步发出来的，而键盘态
 *   落到类名、再落到布局要等 Vue 渲染完。
 */
function reanchorMenus() {
  const write = (anchor, button) => {
    if (!anchor.value) return
    const rect = button.value?.getBoundingClientRect()
    if (!rect || (!rect.width && !rect.height)) return
    anchor.value = rect
  }
  write(menuAnchor, menuButton)
  write(compMenuAnchor, compMenuButton)
}

watch(panelPosition, reanchorMenus, { flush: 'post' })

/**
 * 同一个「跟着按钮走」，还差软键盘那一条：窄屏唤出 / 收起键盘时，`.app` 按 `--vvh` /
 * `--vv-top` 整块重排（见 useMobileKeyboard），齿轮跟着挪了几百像素，而菜单是 Teleport 到
 * body 的 fixed 浮层 —— 它只认打开那一刻量下的 rect。于是「收起键盘 → 齿轮回到顶上、菜单
 * 留在半屏」，用户看到的就是整屏错位（2026-11-07 报）。
 *
 * 与上面那条完全同源，只是触发源换成「实测的视口几何变了」：重新量一次按钮就好。
 */
onBeforeUnmount(
  onViewportChange(() => {
    // 延后一帧：此刻布局可能还没跟上键盘态（见 `reanchorMenus` 上面那两条纪律）
    requestAnimationFrame(reanchorMenus)
  }),
)

// ------------------------------------------------------------ 页头图标的墨迹口径
// 两颗独立钮（组件 / 设置）过去同画布 size=16，但两个字形在 24 网格里的外接框不同：
// gear 22/24、grid 只有 16/24（外框实测与 ActivityBar 的 ICON_INK 表同源，改字形两边一起改）。
// 画布一样大、墨迹差约 4px —— 组件那颗看着小一圈（2026-10-22 用户要求对齐到齿轮）。
// 换算：对齐的是「字形外框」（gear@16 的外框 22×16/24 ≈ 14.67px），按各自外框反解 size
// （grid → 22）。描边基准取**页头现状**而不是 1.9：两颗钮在 size=16 画布上的视觉描边
// 一直是 1.9×16/24 ≈ 1.27px（ActivityBar 那套「补偿到 1.9」是折叠栏 21px 墨迹的口径，
// 搬过来会把齿轮凭空描粗一圈 —— 2026-10-22 首版踩到，读数 2.85 当场露馅）。
// 所以补偿写成 HEAD_ICON_STROKE × HEAD_ICON_SIZE / size：gear 走恒等映射（16 / 1.9 原样），
// grid 拿到 1.38，两颗的视觉描边与墨迹（≈15.93px）都相等。
// 表里没有的图标保持 size=16 原样（与胶囊段位、收起箭头同档）；gear 走同一函数是恒等映射，
// 把「与设置相同」的基准显式写在同一处，防两边漂移。
const HEAD_ICON_SIZE = 16
const HEAD_ICON_STROKE = 1.9
const HEAD_ICON_INK = { grid: 16, gear: 22 }

function headIconOptics(name) {
  const ink = HEAD_ICON_INK[name]
  if (!ink) return { size: HEAD_ICON_SIZE }
  const size = (HEAD_ICON_INK.gear * HEAD_ICON_SIZE) / ink
  return {
    size: Number(size.toFixed(2)),
    strokeWidth: Number(((HEAD_ICON_STROKE * HEAD_ICON_SIZE) / size).toFixed(2)),
  }
}
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

    <!-- 组件菜单（常驻）：点它弹 ComponentsMenu，与齿轮弹 SettingsMenu 同一套机制。
         放在齿轮左边 —— 齿轮是独立于组件的设置入口，排在右端。
         按钮本身不再按 cfReady 显隐：菜单里的「工具」类与 Codeforces 装没装无关。 -->
    <button
      ref="compMenuButton"
      type="button"
      class="sidebar-switcher__tab"
      :class="{ 'is-active': components.active }"
      :title="components.label"
      :aria-label="components.label"
      aria-haspopup="menu"
      :aria-expanded="Boolean(compMenuAnchor)"
      @click="toggleCompMenu"
    >
      <AppIcon :name="components.icon" v-bind="headIconOptics(components.icon)" />
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
      <AppIcon :name="settings.icon" v-bind="headIconOptics(settings.icon)" />
    </button>

    <SettingsMenu v-if="menuAnchor" :anchor="menuAnchor" placement="below-end" @close="closeMenu" />
    <ComponentsMenu v-if="compMenuAnchor" :anchor="compMenuAnchor" placement="below-end" @close="closeCompMenu" />
  </nav>
</template>

<style scoped>
.sidebar-switcher {
  display: inline-flex;
  align-items: center;
  /* 带标签时轨道 148px + 间距 4px + 设置钮 26px = 178px；紧凑（纯图标）时轨道 64px，
     合计 94px（与重构前一致）。组件那颗是常驻的：再 +30px。
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
:where(html.is-hoverable) .sidebar-switcher__pill:hover {
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

/* 「文件」段的文件夹字形在 24 viewBox 里墨迹是 4.5~22（本来就偏下），16px 盒居中后
   视觉重心仍低 ~0.9px（4 倍截图逐像素量：22px 段内上留白 5.5、下 3.75）。
   这里补 -1px，让上下回到 ~4.5 / 4.75。只按 data-panel 打，别去改 AppIcon 里
   folder 的路径 —— 那条会牵连文件树等所有用 folder 的地方；transform 只改绘制，
   不动 16px 图标盒、3px 上下留白与点击区域。 */
.sidebar-switcher__seg[data-panel='explorer'] svg {
  transform: translateY(-1px);
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

:where(html.is-hoverable) .sidebar-switcher__tab:hover {
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
:where(html.is-hoverable) .sidebar-switcher__tab.is-active:hover {
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
