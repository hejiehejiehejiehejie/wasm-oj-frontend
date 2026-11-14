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
 * - 段位是「图标 + 短标签」；收不收标签有两个口径（见 `iconOnly`）：
 *   宽屏听 Sidebar 的 `compact`（侧栏 < 350px，那一档页头里还有上下文动作抢位置），
 *   窄屏听实测的 80% —— 底栏那一排独占整个抽屉宽，整排塞进 80% 就带标签
 *   （2026-11-14 用户要求：窄屏下尽量留大按钮，别一窄就退成小图标）。
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
import { useGearSpin } from '../composables/useGearSpin.js'
import { panelPosition } from '../services/shellSettings.js'

const { panels, targetPanel, togglePanel, settings, components, collapse, compact } =
  inject('sidebarTabs')

// 齿轮点一下转 120°（2026-11-12 用户要求，时长与曲线见 useGearSpin 头注释）。
// 绑在图标上而不是按钮上：按钮还有「填亮＝设置页签开着」的蓝底，别跟着转。
const { spin: spinGear, style: gearSpinStyle } = useGearSpin()

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
  // 转一格：开、关都转。拦掉的那一发不算（什么都没变，见 useGearSpin 头注释）
  spinGear()
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

// 组件那颗的图标：菜单弹出时换成「掀盖的箱子」（Lucide `package-open`），收起时是
// 封好的箱子（`package`，见 Sidebar 的 componentsEntry）。判据就是 compMenuAnchor ——
// 与 aria-expanded 同源，不会出现「图标开着、菜单已关」。
// 注意 `components` 是从 inject 拿到的 computed ref，在 script 里要写 `.value`
// （模板里才自动解包）。
const compIcon = computed(() => (compMenuAnchor.value ? 'grid-open' : components.value.icon))

onMounted(() => {
  window.addEventListener('pointerdown', onGlobalPointerDown, true)
  measureRow()
  // 侧栏宽度变了（抽屉改宽、旋屏、折叠 / 展开）要重判一次；再盯一眼整排自身，
  // 覆盖「侧栏宽度没变、但按钮随全局缩放变宽了」那一档（见 measureRow 的注释）
  rowObserver = new ResizeObserver(measureRow)
  const host = navEl.value?.parentElement
  if (host) rowObserver.observe(host)
  if (navEl.value) rowObserver.observe(navEl.value)
  // 宽窄屏是 <html> 上的类，切形态时宽度不一定变（如插上鼠标），另听一次 resize 兜住
  window.addEventListener('resize', measureRow)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onGlobalPointerDown, true)
  window.removeEventListener('resize', measureRow)
  rowObserver?.disconnect()
  rowObserver = null
})

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

// ------------------------------------------------------------ 窄屏底栏要不要文字标签
/**
 * 宽屏用 Sidebar 下发的 `compact`（侧栏 < 350px 收标签，那一档算的是页头里还有上下文动作
 * 抢位置）。**窄屏不再用它**：底栏那一排沉到侧栏底部、独占整个抽屉宽（`min(86%, 420px)`），
 * 能放下的东西与页头无关，拿页头的阈值决定它就偏保守 —— 实测 430 宽、全局缩放 110% 时
 * 抽屉有 370px，带标签那排只要 261px，本来完全放得下，却因为页头那条 385 的阈值退成了
 * 纯图标（2026-11-14 用户报「窄屏下文件和评测收缩得太小」）。
 *
 * 用户口径（2026-11-14）：**整排按钮的宽度不超过侧栏宽的 80%，就带「文件 / 评测」标签**；
 * 超过则退回纯图标。80% 是「一排控件别贴边撑满」的余量，剩下两成留给手指与视觉呼吸。
 * （先按 70% 做过一轮：临界点落在视口 396px，390 这种常见宽度差 1% 落空；按用户口径放宽到 80%，
 * 临界点前移到 ~346px —— 也就是 360 起的手机都能带标签，见同日实测。）
 *
 * 判据用**实测**而不是拿几个常量相加：那一排的宽度受译名、字号、全局缩放共同影响，
 * 写死的算式迟早对不上。量法是在 `is-compact` 下临时摘掉这个类量一次再放回去 ——
 * 同步完成，浏览器不会画出中间那一帧，所以量到的永远是「带标签」的那一份。
 * ⚠️ 因此标签必须**常驻 DOM**（样式里用 `display: none` 收起来，不能写成 v-if）：
 * v-if 一收，摘类也长不出标签，量到的是纯图标那一份，判据就永远成立不了。
 * ⚠️ 别把 80% 换成「页面里还剩多少空隙」那种算式：抽屉是浮层，它旁边压着编辑器，
 * 那部分宽度与底栏无关。
 */
const BOTTOM_LABEL_RATIO = 0.8
const navEl = ref(null)
/** 当前是不是窄屏形态（读 `<html>` 上那个类，判据仍只有 shellSettings 一份） */
const narrowRow = ref(false)
/** 窄屏下，带标签那一排塞进 80% 了吗 */
const rowRoomy = ref(false)
let rowObserver = null

/** 「带标签」时整排按钮的宽度（px，已是缩放后的真实值） */
function labeledRowWidth() {
  const nav = navEl.value
  if (!nav) return 0
  if (!nav.classList.contains('is-compact')) return nav.offsetWidth
  nav.classList.remove('is-compact')
  const width = nav.offsetWidth
  nav.classList.add('is-compact')
  return width
}

/**
 * 重判一次「底栏带不带标签」。由三处触发：挂载、`ResizeObserver`（侧栏宽 / 整排自身宽）、
 * `resize`（宽窄屏形态切换）。
 *
 * 宽屏下 `rowRoomy` 恒为 false —— 那一档仍旧只听 `compact`（见 `iconOnly`）。
 * 侧栏收成 1px（窄屏折叠态）时量到的宽度是 0，判据自己落到「不放」，
 * 重新展开会由 ResizeObserver 再量一次，不需要额外状态。
 */
function measureRow() {
  const nav = navEl.value
  const shell = nav?.closest('.sidebar')
  if (!nav || !shell) return
  narrowRow.value = document.documentElement.classList.contains('is-narrow')
  if (!narrowRow.value) {
    rowRoomy.value = false
    return
  }
  const sidebarWidth = shell.getBoundingClientRect().width
  const labeled = labeledRowWidth()
  rowRoomy.value = sidebarWidth > 0 && labeled > 0 && labeled <= sidebarWidth * BOTTOM_LABEL_RATIO
}

/**
 * 到底收不收标签。窄屏看实测的那条 80%，宽屏照旧看页头的 `compact` ——
 * 两个口径不能合并：页头那一排旁边还有上下文动作，底栏这一排旁边什么都没有。
 */
const iconOnly = computed(() => (narrowRow.value ? !rowRoomy.value : compact.value))

// ------------------------------------------------------------ 页头图标尺寸
// 两颗独立钮（组件 / 设置）**同一个 size** 就好。
//
// 换库前这里有一段「墨迹补偿」：那套手绘字形里 gear 的外框是 22/24、grid 只有 16/24，
// 同一画布下组件那颗看着小一圈，于是把 grid 的 size 从 16 反解到 22、描边再按比例回补。
// 换成 Lucide 之后 `layout-grid` 与 `settings` 的外框都是 18 上下（实测 18.00 / 18.49），
// 天生齐平 —— 补偿整段删掉，两颗钮回到同一个 size。
//
// 19 而不是段位用的 16：Lucide 的墨迹约占 20/24，19px 下是 15px 左右，与旧字形 16px 时的
// 14.7px 同档（旧字形外框更满，gear 就到 22/24）。页头这两颗独立钮本来就比段位里的图标
// 大一号，别按段位的 16 对齐。
const HEAD_ICON_SIZE = 19
</script>

<template>
  <nav
    ref="navEl"
    class="sidebar-switcher"
    :class="{ 'is-compact': iconOnly }"
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
        <!-- 图标跟着「这一段是不是当前面板」走：资源管理器开着时是掀盖的文件夹
             （`folder-open`），收起时是合着的 `folder`（2026-11-12 用户要求）。
             折叠态那条图标栏不这样切，理由见 Sidebar 的 PANEL_TABS 注释 -->
        <AppIcon :name="panel.active ? panel.iconActive : panel.icon" size="16" />
        <!-- 标签常驻 DOM、由 `is-compact` 用样式收起来（不是 v-if）：窄屏那条 80% 判据
             要量「带标签时整排多宽」，见 measureRow 上面那段说明 -->
        <span class="sidebar-switcher__label">{{ panel.shortLabel }}</span>
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
      <AppIcon :name="compIcon" :size="HEAD_ICON_SIZE" />
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
      <AppIcon :name="settings.icon" :size="HEAD_ICON_SIZE" :style="gearSpinStyle" />
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

/* 「文件」段的文件夹：Lucide 的 folder 墨迹在 24 viewBox 里是 y 3→20，重心只比网格中心
   高 0.5 个单位（16px 下 0.3px），居中即可。旧字形自己画到 4.5~22 才需要补 -1px，
   换库后那条 transform 已删 —— 图标不做任何移位。
   打开态那枚 `folder-open` 的墨迹是 x 2→21.94、y 3→19.5（重心 y 11.25，比 folder 低
   0.25 个单位）：与合着的 folder 同一档大小，切换时不会忽大忽小，同样不需要补偿。 */

.sidebar-switcher__label {
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
}

/* 纯图标档：标签收起（**用样式收，不用 v-if** —— 窄屏那条 80% 判据靠它量宽度，
   见 measureRow 的注释；v-if 一收就量不出带标签的那一份了）。
   段位宽度本来就由 `--seg-w` 钉住，标签退出流不影响排布。 */
.sidebar-switcher.is-compact .sidebar-switcher__label {
  display: none;
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
