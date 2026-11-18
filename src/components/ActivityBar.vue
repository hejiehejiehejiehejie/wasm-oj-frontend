<script setup>
/**
 * ActivityBar —— 侧边栏折叠后顶替它的竖向图标栏（仿 VS Code 的 Activity Bar）。
 *
 * 只在折叠时出现：展开时页头里仍是「胶囊 + 齿轮」那一套（见 SidebarSwitcher），
 * 折叠后侧栏整栏 display:none，改由这条 44px 的图标栏承接入口 ——
 * 否则用户只能靠分隔条那条隐形热区把侧栏捞回来。
 *
 * 顶部一簇＝侧边栏的两个面板 + 若干「固定到图标栏」的组件格 + 簇尾一格「组件」菜单
 * （组件那颗 2026-10-22 先从底簇挪进上簇、同日再挪到簇尾，两次都是用户要求；
 * 固定格也是 2026-10-22 加的，见下面的右键菜单）：
 * 面板格点一下＝展开侧栏并切到该面板（展开那段在 App.vue 的 selectSidebarPanel 里，
 * 本组件只负责派发 select）。
 * 底部贴底一格＝设置：与页头那颗齿轮同源，不展开侧栏 —— 它开的是编辑区里的合成页签。
 * 「组件」那颗（2026-10-20 起由 Codeforces 那颗改名而来）点它弹组件菜单（ComponentsMenu），
 * 菜单里按类分组挑：Codeforces（随机抽题 / 比赛）与工具（倒计时）；它贴着屏幕边缘，
 * 所以 placement="beside"。按钮常驻 —— 工具类与 Codeforces 装没装无关。
 * ⚠️ 它虽然在上簇里，行为却属于「浮层」那类（不推侧栏、不开面板），所以样式上按
 * `.activity-bar__item--menu` 单独走一套：不画 chevron、开着时提亮图标。
 * 明暗与面板格一致（2026-10-22 起；原先那档 opacity: .7 已撤，理由见样式表里那段）。
 * **分类判据是 class 不是所在簇** —— 别再按 `.activity-bar__group--panels/_tools` 写行为规则。
 *
 * 【右键菜单】（2026-10-22 加）**只在非窄屏 + 鼠标**下弹（判据与理由见 onBarContextMenu）：
 * 可固定组件的勾选列表 + 分隔线 + 一条「侧边栏移到左 / 右侧」。勾上的组件会以图标形式
 * 排在两枚面板格之后（窄屏不摆），点它直接打开那个组件。目录与固定状态都在
 * `services/activityBarPins.js`（那张表同时喂给组件菜单，唯一出处）。
 *
 * 面板数据由 App 从 Sidebar 的 defineExpose 透传进来（状态只有一份，仍是 cp.sidebarTab），
 * 本组件不自己存一份。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import ComponentsMenu from './ComponentsMenu.vue'
import ContextMenu from './ContextMenu.vue'
import SettingsMenu from './SettingsMenu.vue'
import { isTouchPointer, onViewportChange } from '../composables/useMobileKeyboard.js'
import { useGearSpin } from '../composables/useGearSpin.js'
import { t } from '../i18n/index.js'
import {
  availableComponents,
  isComponentPinned,
  pinnedComponents,
  togglePinnedComponent,
} from '../services/activityBarPins.js'
import { countdown } from '../services/countdown.js'
import { codeforcesTab, settingsTab } from '../services/editorViews.js'
import { flipPanelPosition, isNarrowLayout } from '../services/shellSettings.js'

const props = defineProps({
  /** Sidebar 透传的面板表：{ id, icon, label, active } */
  panels: { type: Array, default: () => [] },
  /**
   * 侧栏停靠在哪一侧。本组件只用它判一件事：上簇 hover 时那枚小 chevron 指哪边
   * （箭头朝工作区 = 点下去会把侧栏往那边推开），以及它该贴在方块的内缘还是外缘。
   * 状态归 shellSettings.js，App 透传进来 —— 本组件不自己存一份。
   */
  panelPosition: { type: String, default: 'left' },
})
defineEmits(['select'])

// ------------------------------------------------------------ 图标尺寸
// 2026-11-11 图标库整体换成 Lucide 之后，这一节从「三步换算」缩成了两行。
//
// 换库前这里有一张 ICON_INK 表（逐枚登记字形外框与 viewBox）+ 一套换算：长边归一到
// 21 CSS px、按 viewBox 反比补描边粗细、短边不够就单向 `scale()` 拉伸 —— 因为那套字形
// 是手绘的，各枚外框极差到 50%（codeforces 24 / gear 22 / files 20 / clock 18 / grid 16），
// 并排到一条 44px 栏上就读成「大小不一」。
//
// Lucide 的字形共用一套 24×24 网格（描边 2、安全边距一致、视觉重量已对齐），
// 同一个 `size` 下去掉所有补偿反而最齐 —— 所以换算表、拉伸、描边补偿**全部删除**，
// 栏上的图标不再带任何 transform。这也正是「恢复原样」的那一步。
//
// 只剩 Codeforces 一枚还要单独算：实心品牌字形，原始 24 网格铺满、viewBox 收过框到 28，
// 不在 Lucide 里。按 21px 墨迹目标反推 size = 21 × 28 / 24 ≈ 24.5。
const ICON_SIZE = 23 // 24 网格 + 描边 2 → 视觉墨迹 ≈ (20 + 2) / 24 × 23 ≈ 21px
const ICON_STROKE = 2 // Lucide 官方描边宽度（viewBox 单位）
const ICON_CODEFORCES_SIZE = 24.5

function iconOptics(name) {
  return {
    size: name === 'codeforces' ? ICON_CODEFORCES_SIZE : ICON_SIZE,
    strokeWidth: ICON_STROKE,
  }
}

// 贴底那颗齿轮点一下转 120°（2026-11-12 用户要求）：与侧栏页头那颗是同一个动作，
// 时长与曲线都从 useGearSpin 取，两边不会各写一份。绑在图标上、不绑按钮。
const { spin: spinGear, style: gearSpinStyle } = useGearSpin()

// ------------------------------------------------------------ 两个下拉菜单
// 齿轮弹 SettingsMenu、组件那颗弹 ComponentsMenu，机制与侧栏页头同款。
// 菜单在捕获阶段用 pointerdown 收自己，所以点按钮想关菜单时会先被那一层收掉、
// 按钮的 click 又进来，得记一笔「刚刚那一发是不是点在它身上」。
const menuAnchor = ref(null)
const menuButton = ref(null)
const compMenuAnchor = ref(null)
const compMenuButton = ref(null)

// 组件那颗的图标：菜单弹出来时换成「掀盖的箱子」（Lucide `package-open`），
// 收起时是封好的箱子（`package`）。判据就是 compMenuAnchor 本身 —— 与 aria-expanded
// 同源，不会出现「图标已经开着、菜单已经关了」。
const compIcon = computed(() => (compMenuAnchor.value ? 'grid-open' : 'grid'))

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
  // 与侧栏页头那颗同一个动作、同一套时长曲线（见 useGearSpin）
  spinGear()
  menuAnchor.value = menuAnchor.value ? null : menuButton.value?.getBoundingClientRect() ?? null
}

function closeMenu() {
  menuAnchor.value = null
}

function toggleCompMenu() {
  if (suppressCompOpen) {
    suppressCompOpen = false
    return
  }
  compMenuAnchor.value = compMenuAnchor.value ? null : compMenuButton.value?.getBoundingClientRect() ?? null
}

function closeCompMenu() {
  compMenuAnchor.value = null
}

onMounted(() => window.addEventListener('pointerdown', onGlobalPointerDown, true))
onBeforeUnmount(() => window.removeEventListener('pointerdown', onGlobalPointerDown, true))

/** 把两颗按钮的新位置写回锚点；量不到尺寸（按钮正被收起）时就保留旧值 —— 理由同
 *  SidebarSwitcher 里那份 `reanchorMenus()`：收键盘那一刻通知落在「已收起」那一帧上，
 *  写回 0 尺寸的 rect 会把菜单锚到视口左上角。 */
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

// 换边后整条图标栏搬到另一侧，开着的菜单要跟着自己的按钮走（理由同 SidebarSwitcher 那份）
watch(() => props.panelPosition, reanchorMenus, { flush: 'post' })

// 同上，只是触发源换成软键盘：窄屏收起键盘时 `.app` 按 `--vvh` / `--vv-top` 重排，
// 贴底那一簇按钮整块上下挪，而菜单是 body 上的 fixed 浮层 —— 重量一遍按钮，它才跟得上。
// （理由展开见 SidebarSwitcher 同名那条与 useMobileKeyboard 头部。）
onBeforeUnmount(
  onViewportChange(() => {
    // 延后一帧再量：这条通知是同步发出来的，键盘态落到类名、再落到布局还要一帧
    requestAnimationFrame(reanchorMenus)
  }),
)

// ------------------------------------------------------------ 右键菜单（2026-10-22 加）
/**
 * 只在「非窄屏 + 鼠标」这一路接管。三条各自的理由：
 * - **窄屏**：图标栏横过来贴着屏幕边，是一条 40px 高的通栏，右键在那儿没有惯常心锚；
 *   而且窄屏的菜单本来就走底部/弹层那一套，不往这里加第二种。
 * - **触屏**：长按同样派发 `contextmenu`，但触屏用户根本没有「右键」这个概念 ——
 *   真放行的话，长按图标会冒出一份桌面菜单。所以这里**不 preventDefault**，
 *   交给系统（图标栏也没有自己的长按手势要抢，不像文件树）。
 * - 其余情况：接管并弹我们自己的那份（站内弹层全部自绘，不用系统菜单）。
 */
const menuAt = ref(null)

function onBarContextMenu(event) {
  if (isNarrowLayout() || isTouchPointer()) return
  event.preventDefault()
  menuAt.value = { x: event.clientX, y: event.clientY }
}

/**
 * 菜单条目：**可固定组件的勾选列表** + 分隔线 + **切换停靠侧**。
 *
 * 顺序 2026-10-22 按用户要求对调过一次：原先是「切停靠侧」独占最上、勾选项在下面。
 * 现在勾选项在上、动作项贴底 —— 读法是「先选组件、最后才是这个动作」，
 * 与组件菜单里「挑完东西再执行」的顺序一致。
 *
 * 动作项写「移到另一侧」而不是「当前在哪侧」—— 说的是点下去会发生什么；
 * 写成「侧边栏在左侧」会让用户以为点它是「保持不动」。
 *
 * 可固定列表按 `available()` 过滤（没装的组件不该出现一颗勾上也没东西可开的项）；
 * 一项都没有时连分隔线也不给，别留一条悬空的横杠（那种情况下菜单只剩动作项一条）。
 */
const barMenuItems = computed(() => {
  const items = []
  const pinnable = availableComponents.value
  for (const comp of pinnable) {
    items.push({
      id: `pin:${comp.id}`,
      label: t(comp.labelKey),
      checked: isComponentPinned(comp.id),
    })
  }
  // 分隔线存在的唯一理由是「上面有勾选项」，否则它是一条悬空横杠
  if (pinnable.length) items.push({ id: 'pin-divider', divider: true })
  items.push({
    id: 'flip-side',
    label: t(props.panelPosition === 'right' ? 'components.bar.moveLeft' : 'components.bar.moveRight'),
  })
  return items
})

function onBarMenuSelect(id) {
  menuAt.value = null
  if (id === 'flip-side') {
    flipPanelPosition()
    return
  }
  if (typeof id === 'string' && id.startsWith('pin:')) togglePinnedComponent(id.slice(4))
}

/**
 * 上簇里那些固定格的来源：**已固定 且 仍装着**（后者由 pinnedComponents 过滤），
 * 再按布局形态筛一遍 —— 窄屏横排不摆（用户 2026-10-22 口径：固定格只在非窄屏出现）。
 * 那条通栏一共 40px 高、四枚并排刚好，再挂几枚会把两个面板入口挤到边上。
 */
const visiblePins = computed(() => (isNarrowLayout() ? [] : pinnedComponents.value))
</script>

<template>
  <nav
    class="activity-bar"
    :data-side="panelPosition === 'right' ? 'right' : 'left'"
    :aria-label="t('app.sidebar.switcherLabel')"
    @contextmenu="onBarContextMenu"
  >
    <!-- 上簇＝两枚面板入口 + 若干「固定到图标栏」的组件格 + 末尾一格「组件」菜单。
         顺序 2026-10-22 调过两次（都是用户要求）：组件那颗先从底簇挪进上簇（当时排第三），
         随后又挪到**上簇最末** —— 现在它固定在固定格之后，是新位置才有它、不会插队。
         各格同形，语义却是两类：面板格点下去**推开侧栏并切面板**，浮层格只开界面、
         不动布局 —— 差别由样式表那几条 `.activity-bar__item--menu` 规则表达
         （不画 chevron、开着时提亮图标；明暗与面板格一致）。
         图标大小由 iconOptics 统一给一个 size（Lucide 共用 24 网格，本来就一样大），
         只有实心的 Codeforces 那枚单独换算。
         菜单本身是 position: fixed 的浮层（ComponentsMenu），挂在按钮旁边只为就近读，
         不受 .activity-bar 的 overflow: hidden 影响。 -->
    <div class="activity-bar__group activity-bar__group--panels">
      <button
        v-for="panel in panels"
        :key="panel.id"
        type="button"
        class="activity-bar__item"
        :class="{ 'is-active': panel.active }"
        :data-panel="panel.id"
        :title="panel.label"
        :aria-label="panel.label"
        :aria-pressed="panel.active"
        @click="$emit('select', panel.id)"
      >
        <AppIcon :name="panel.icon" v-bind="iconOptics(panel.icon)" />
      </button>

      <!-- 固定格（右键菜单里勾上的组件）：点一下＝打开那个组件，与组件菜单里点它是同一件事。
           窄屏横排不渲染（见 visiblePins）。`--menu` 那一挂让它们不长 chevron、
           开着时提亮 —— 它们和末尾那格「组件」一样是浮层工具，不推侧栏。 -->
      <button
        v-for="comp in visiblePins"
        :key="comp.id"
        type="button"
        class="activity-bar__item activity-bar__item--menu"
        :class="{ 'is-active': comp.active() }"
        :data-component="comp.id"
        :title="t(comp.labelKey)"
        :aria-label="t(comp.labelKey)"
        :aria-pressed="Boolean(comp.active())"
        @click="comp.run()"
      >
        <AppIcon :name="comp.icon" v-bind="iconOptics(comp.icon)" />
      </button>

      <!-- 上簇最后一格：「组件」菜单入口（2026-10-22 从上簇第三格挪到这里）。
           它永远压在簇尾 —— 固定格再多也是排在它前面。 -->
      <button
        ref="compMenuButton"
        type="button"
        class="activity-bar__item activity-bar__item--menu"
        :class="{ 'is-active': codeforcesTab.active || countdown.open }"
        :title="t('components.menu.title')"
        :aria-label="t('components.menu.title')"
        aria-haspopup="menu"
        :aria-expanded="Boolean(compMenuAnchor)"
        @click="toggleCompMenu"
      >
        <AppIcon :name="compIcon" v-bind="iconOptics(compIcon)" />
      </button>

      <ComponentsMenu v-if="compMenuAnchor" :anchor="compMenuAnchor" placement="beside" @close="closeCompMenu" />
    </div>

    <!-- 贴底：只剩设置那颗常驻入口（组件那颗已挪到上簇第三格） -->
    <div class="activity-bar__group activity-bar__group--tools">
      <button
        ref="menuButton"
        type="button"
        class="activity-bar__item activity-bar__item--menu"
        :class="{ 'is-active': settingsTab.active }"
        :title="t('app.settings')"
        :aria-label="t('app.settings')"
        aria-haspopup="menu"
        :aria-expanded="Boolean(menuAnchor)"
        @click="toggleMenu"
      >
        <AppIcon name="gear" v-bind="iconOptics('gear')" :style="gearSpinStyle" />
      </button>

      <SettingsMenu v-if="menuAnchor" :anchor="menuAnchor" placement="beside" @close="closeMenu" />
    </div>

    <!-- 右键菜单（自己 Teleport 到 body，挂在这里只为就近读状态） -->
    <ContextMenu
      v-if="menuAt"
      :x="menuAt.x"
      :y="menuAt.y"
      :items="barMenuItems"
      @select="onBarMenuSelect"
      @close="menuAt = null"
    />
  </nav>
</template>

<style scoped>
/* 收起侧栏之后在场的那一条：圆角 44px 竖条，**底色与整页底色相同**。
   2026-11-18 06:08 定稿：铺 --bg-ground（地面色），折叠后这条栏融进背景 ——
   读起来就是地面本身让出了一列图标，而不是一块浮着的卡。口径沿革：
   2026-10-23 用户要求「折叠 / 展开都与页面底色一致」（当时地面 = --bg-editor）→
   05:54 便当盒曾随展开态侧栏同铺 --bg-panel（岛面）→ 同日用户再次要求改回地面色。
   ⚠️ 展开态侧栏（Sidebar 的 .sidebar / 外层 .pane--tests）铺的仍是 --bg-panel ——
   展开是一座岛、折叠贴回地面，两处是**有意**不同值，别再「对齐」。
   **不描边**（2026-10-22 用户要求去掉外面那一圈细线）：折叠态下它与编辑器卡片之间
   还隔着一条 8px 空隙；贴地之后再描一圈 1px 更没有着落。
   ⚠️ 边框一去掉，内容盒就是栏宽，下面 .activity-bar__item 的左边距就是
   (栏宽 − 方块 40) / 2（`box-sizing: border-box` 是全局的）。2026-10-26 按用户
   「收窄一点」把栏从 48 收到 44，左边距随之 4 → 2。
   宽度写 px 即可随全局缩放：postcss-pxtorem 会把它转成 rem（JS 不读这个值）。 */
.activity-bar {
  flex: 0 0 44px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: stretch;
  /* 上簇与栏顶、下簇与栏底的留白。2026-10-22 试过加到 10px，同日按用户要求改回 4px ——
     4px 与 .activity-bar__group 的 gap 同值，竖排上下和格子之间是同一档呼吸。
     横排（窄屏）另有自己的 padding，见 App.vue 的 is-narrow 那组规则。 */
  padding: 4px 0;
  overflow: hidden;
  border-radius: 10px;
  /* 地面色（--bg-ground，2026-11-18 06:08 定稿，沿革见上）：折叠态贴回背景底色。
     十套主题各自路由到自己的地面色（oled / contrast 为纯黑），不用另配。 */
  background: var(--bg-ground);
}

/* 展开态不写规则：这一栏的在场与否由 App 的 v-show 决定（判据与 is-collapsed 同源），
   展开那一刻整条就是 display: none，不进布局、也不需要先把宽度让出去。
   2026-10-14 之前这里有一条 `.activity-bar:not(.is-collapsed) { flex-basis: 0 }`，
   那是给 CSS 补间路径当「宽度让位」用的 —— 补间路径已删，这条再也没有可能命中。 */

.activity-bar__group {
  display: flex;
  flex-direction: column;
  /* 方块定宽 40px + 固定左边距 4px，靠 flex-start 钉在同一列（别改成 center / stretch：
     这一栏伸缩时容器在变窄，居中会让方块跟着横移） */
  align-items: flex-start;
  /* 相邻两格的间隔：格里是 24px 图标、方块 40×40，不留间隔时两枚图标是「紧挨着的两个方块」，
     加 4px 后图标之间的呼吸感与 VS Code 接近（间距只加在这里，方块本身的可点面积不变） */
  gap: 4px;
}

/* 40×40 的圆角方块：hover 时整块提亮（而不是只提亮图标），可点范围一眼可见。
   尺寸写死（原来给的是 100%）：伸缩时这一栏的宽度会变，方块若跟着变窄，
   图标就会在方块里居中位移、看着像在飘；定宽 + 固定左边距之后方块钉在原地，
   由 .activity-bar 的 overflow: hidden 把它裁出去。 */
.activity-bar__item {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  /* 2026-10-11：可点区从「整宽长条」改成 40×40 的圆角正方形（用户要求），
     格子四周的留白因此不再进可点范围。左边距 2px = (栏 44 − 方块 40) / 2
     （2026-10-26 栏从 48 收到 44，这条跟着 4 → 2；再改栏宽必须同时改它，
     否则方块不再水平居中）。
     仍用固定边距而不是居中对齐：这一栏伸缩时宽度从右边变，固定的左边距让方块
     一直钉在同一列上，不会随容器变窄而横移。半径 10px 与这条栏自己的圆角同值。 */
  width: 40px;
  height: 40px;
  margin-left: 2px;
  padding: 0;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  /* opacity 不在过渡清单里：四格现在没有明暗变化（四格同亮，见下面那段），
     留着只会挂一条永不触发的过渡 */
  transition: color 0.16s ease, background-color 0.16s ease;
}

/* 选中态只提亮图标，**不画那道左缘 2px 主题色指示条**（2026-10-04 用户反馈去掉了）：
   图标栏只有一列、不分段，提亮已经说得清「这一个开着」，再加一条线就是多余的噪音。
   hover 另有自己的一套反馈 —— 那是「这一格能点」的信号，不是选中态。 */
:where(html.is-hoverable) .activity-bar__item:hover {
  color: var(--text);
  background: var(--bg-hover);
}

/* 选中态**按格分、不按簇分**（2026-10-04 定「上下不对称」，2026-10-22 把判据从簇改成格 ——
   因为两类的成员现在混在同一簇里：上簇两枚面板 + 第三格「组件」）：
   - 面板格不提亮：折叠态下**总有一个面板是 active**，提亮就等于常驻高亮；何况点一下
     本来就会把侧栏展开，真实状态在那时看得见，这里不必先报一遍。
   - 浮层格（组件 / 设置）提亮：它们不开侧栏，开着时得在这条栏上直接看出来。
     但**只提一档**（`--text-active`，夹在 dim 与 text 之间，2026-10-22 用户要求减弱）——
     原来直接跳到 `--text` 与 hover 同亮度，而浮层一开就是常驻状态，等于常亮一档最亮；
     hover 仍是 `--text`，是更强的临时反馈，两者差得开。 */
.activity-bar__item--menu.is-active {
  color: var(--text-active);
}

/* ------------------------------------------- 「行为差异」暗示（2026-10-22 采纳方向四）

   动机：有的格子点下去**改变布局**（推开侧栏）、有的只弹一个浮层，两者长得一模一样，
   用户点之前没有预期。这是 `docs/折叠侧栏设计备案.md` 方向四「行为视觉解耦」的正式版，
   只动视觉。判据按格不按簇（同上面选中态）：**上簇前两枚面板格**与**浮层格**分开处理。

   - 面板格（上簇前两枚）：hover（或键盘聚焦）时，方块**朝工作区那一侧**浮出一枚 4px 的
     小 chevron，从外侧滑进来 2px。箭头指哪、侧栏就从哪边推出来 —— 与侧栏停靠侧成镜像
     （`panelPosition` 由 App 透传，落成根上的 data-side）。
     它画在方块内缘（面板格两枚图标墨迹都是 21×21 —— 2026-10-22 等宽等高之后，居中后左右各剩
     9.5px，chevron 贴在距右缘 3px 处、占掉其中 4px —— 与图标之间还剩 2.5px，贴着但不叠），
     **不进布局、不改可点区**
     （absolute + pointer-events: none），方块仍是 40×40 ——
     靠上面基础类新加的 `position: relative` 做定位基准。
   - 浮层格（`--menu`：组件 · 设置）：**不画 chevron**（见下）；明暗与面板格一致 ——
     原先那档「默认降到 0.7、开着时回 1」已于 2026-10-22 撤掉（用户要求四格同亮，
     理由见下面那段）。

   ⚠️ 窄屏（横排、触屏）chevron 那条暗示不成立：横排里没有「横向推开」这回事，
   触屏也没有 hover，留着只会让一排方块更挤。见文件末尾那条 :where(html.is-narrow) 规则。 */
.activity-bar__group--panels .activity-bar__item::after {
  content: '';
  position: absolute;
  top: 50%;
  right: 3px;
  width: 4px;
  height: 4px;
  box-sizing: border-box;
  border-top: 1.5px solid currentColor;
  border-right: 1.5px solid currentColor;
  opacity: 0;
  /* 先旋转（45° 得到一个 `>`），再按未旋转的坐标系水平外移 2px、垂直居中 */
  transform: translate(-2px, -50%) rotate(45deg);
  transition: opacity 0.16s ease, transform 0.16s ease;
  pointer-events: none;
}

/* 「组件」那一格虽然也在上簇里，点下去却只弹浮层、不推侧栏 —— 不能长 chevron
   （那是「会推开侧栏」的暗示）。整枚取消：下面 hover / focus 那两条只改 opacity 与
   transform，伪元素不存在就什么也画不出来。同特异性 (0,2,0)、靠源码顺序压过基础规则。 */
.activity-bar__group--panels .activity-bar__item--menu::after {
  content: none;
}

:where(html.is-hoverable) .activity-bar__group--panels .activity-bar__item:hover::after,
.activity-bar__group--panels .activity-bar__item:focus-visible::after {
  opacity: 1;
  transform: translate(0, -50%) rotate(45deg);
}

/* 侧栏停靠在右：工作区在图标栏左边 ⇒ 箭头指左、贴在方块左缘、从左边滑进来 */
.activity-bar[data-side='right'] .activity-bar__group--panels .activity-bar__item::after {
  right: auto;
  left: 3px;
  border-right: none;
  border-left: 1.5px solid currentColor;
  transform: translate(2px, -50%) rotate(-45deg);
}

:where(html.is-hoverable) .activity-bar[data-side='right'] .activity-bar__group--panels .activity-bar__item:hover::after,
.activity-bar[data-side='right'] .activity-bar__group--panels .activity-bar__item:focus-visible::after {
  transform: translate(0, -50%) rotate(-45deg);
}

/* 四格同亮（2026-10-22 用户要求）：这里**没有** opacity 规则。
   原先有一条 `.activity-bar__item--menu { opacity: 0.7 }`（「浮层格弱一档」），
   那是给「上簇亮 / 下簇弱」这个**簇**差异写的；组件那颗挪进上簇之后，它成了上簇里
   唯一暗一格，同一竖列上 1 / 1 / 0.7 比下来更扎眼 —— 语义参照系已经随位置变了。
   现在浮层格只保留两件事：不画 chevron（见上）、开着时提亮图标（见上面的 is-active）。 */

/* 窄屏：横排里 chevron 那条暗示不成立（见上面动机那段的 ⚠️）。
   浮层格原本还有一条「opacity 拉回 1」，随 0.7 一起撤了（现在本来就是 1）。 */
:where(html.is-narrow) .activity-bar__group--panels .activity-bar__item::after {
  display: none;
}
</style>