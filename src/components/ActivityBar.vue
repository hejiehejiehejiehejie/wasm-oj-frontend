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
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import ComponentsMenu from './ComponentsMenu.vue'
import ContextMenu from './ContextMenu.vue'
import SettingsMenu from './SettingsMenu.vue'
import { isTouchPointer } from '../composables/useMobileKeyboard.js'
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

// ------------------------------------------------------------ 图标大小统一
// 同一套 `size="24"` 下，各枚图标的**字形外接框**差得很远（实测，不含描边）：
//   codeforces 24 / gear 22 / files 20 / clock 18 / cases 18 / flag 17.5 / grid 16 ——
// 极差 50%。各拿各的图形画在同一个 24 网格里，并排到一条 44px 栏上就读成「大小不一」
// （2026-10-22 用户提出）。
//
// 做法分两步（同一天加的）：
// ① **长边**统一到 **21 CSS px**。描边按 vb/size 反比补偿 —— `stroke-width` 是 viewBox 单位，
//    size 一变描边就跟着变粗细：不补的话 gear（缩到 20.93）描边会到 2.18px、grid（放大到 28.78）
//    只剩 1.58px，刚统一了尺寸又冒出一粗一细。补偿后各枚的**视觉**描边都还是 1.9px。
// ② **短边也顶到 21**（用户要求「等宽等高」）：三轮方案才定 —— 单向 scale 拉伸（files
//    拉宽 22%、cases 拉高 25%，嫌变形）→ 重画字形（files 页签 20 宽 / cases 行距拉开成
//    18×18，嫌影响观感）→ **换文件夹 + 单独画高**：资源管理器用 20×20 的方形文件夹
//    （零拉伸），cases 标 `keep` 豁免、保持扁宽原样。拉伸机制对没标 `keep` 的字形仍然
//    生效（兜住以后新增的不方字形）—— 但正解永远是改字形。
//
// ⚠️ 目标值试过四档，全在同一天（统一只能挑一档，挑错就是整栏缩水或胀大）：
//   20 → 整条栏比改之前小了一圈（原来那套 `size="24"` 的墨迹是 17.9~23.9），用户报「比原来小了」；
//   24 → 对齐到原来最大的那枚（设置 gear 23.9），比原来还胀一点；
//   22 → 落在原来那几枚的**中上区间**；
//   21 → 用户回头再收一档，定稿。比 22 每枚小 1px，四项读数仍齐平，chevron 余量还更宽。
//
// ⚠️ 三件事分开算：
// 1. 视觉墨迹 = 字形外框 × size/vb + 1.9（描边在 CSS 里恒为 1.9）。
//    所以要对齐的不是 21 本身，是 `21 − 1.9 = 19.1` 这个「字形外框」——
//    直接拿 (字形 + 描边) 的比例去缩放会差 1~2%（首版就是这么写的，实测 20.3 vs 19.77）。
// 2. `vb` 不是恒等于 24：AppIcon 给 cpp / markdown / codeforces 三枚收过框
//    （codeforces 是 `-2 -2 28 28`），缩放系数按各自的 viewBox 宽算。
// 3. 实心字形（`solid`: cpp / markdown / codeforces，用 fill 上色不描边）没有描边外扩，
//    它的外框就是视觉边缘 —— 目标直接取 21，不用减 1.9。
//
// 只在本组件里换算、不动 AppIcon 的 VIEWBOX：那里是全局映射，收框会一并改掉
// 组件菜单 / 设置页等别处的排法。表里没有的图标按原样 24 / 1.9 走（新增面板时不至于错位）。
const ICON_BASE = 24
const ICON_STROKE = 1.9
const ICON_INK_BOX = 21 // 目标墨迹长边（含描边）—— 2026-10-22 用户定的口径，别再随手改
// 短边下限：短边墨迹不足这个值就单向 scale 拉齐（见上面 ②）。**2026-10-22 结局**：
// 「全栏见方」试了拉伸、重画各一轮都被否，最后 folders 单独画高成方形、零拉伸在用；
// cases 标 `keep` 豁免、保持扁宽原样。机制保留作兜底，别再顺手扩大适用面。
const ICON_MIN_SIDE = ICON_INK_BOX
// w / h = 字形外框（viewBox 单位，不含描边）。**长边 = max(w, h)**，size 由它算出来。
// `keep: true` = 天然长条形、**不参与短边拉伸**（见 iconOptics）——files / cases 在
// AppIcon 里注释写明了：方形化（重画或拉伸）都试过、都被否，形状自然优先于墨迹见方。
const ICON_INK = {
  // 资源管理器 = 文件夹（2026-10-22 从文档折角换过来）。三版演进都记在 AppIcon 注释里：
  // 照抄 folder（20×17）拉伸补高 → 画高 20×20 → 最终用户从对照图里挑了**自画矮盖方**
  // （外框 20×17.5，盖沿压低、tab 更矮的 mac 风）。h 写 17.5 是字形实情；`keep` 豁免
  // 短边拉伸 —— 用户嫌拉伸丑，这枚就按近方原样上栏（墨迹 21×18.6，与候选图里看到的一致）。
  files: { w: 20, h: 17.5, vb: 24, keep: true },
  cases: { w: 18, h: 14, vb: 24, keep: true },
  grid: { w: 16, h: 16, vb: 24 },
  gear: { w: 22, h: 22, vb: 24 },
  // 以下是可固定到上簇的三颗组件图标（见 services/activityBarPins.js）。
  // 比赛 = flag、倒计时 = clock（2026-10-25 用户要求把倒计时的 logo 换成圆表盘时钟；
  // 2026-10-22 那轮换沙漏是为了和 timer 区分形，而比赛改用旗子之后栏上已经没有第二枚圆表盘）。
  // clock 的字形是 r9 的正圆（3..21），墨迹 18×18、中心正好落在 viewBox 中心，
  // 所以既不用拉伸（inkW = 21 恰达下限）也不用补视觉重心；算出来
  // size 25.47 / strokeWidth 1.79，视觉描边仍是 1.9px。
  // 另两枚 2026-10-22 重画成了方形外框，写多少就是多少。
  codeforces: { w: 24, h: 24, vb: 28, solid: true },
  flag: { w: 17.5, h: 17.5, vb: 24 },
  // clock / timer / hourglass 目前的分工：clock 在栏上（倒计时），另两枚不在栏上但
  // AppIcon 里还留着 —— timer 给设置里「运行时长」、hourglass 目前没有消费方（留作备选）。
  // 三行的外框照样是对的，以后有面板拿它们当图标时直接可用。
  clock: { w: 18, h: 18, vb: 24 },
  timer: { w: 19, h: 19, vb: 24 },
  hourglass: { w: 17, h: 17, vb: 24 },
}

function iconOptics(name) {
  const ink = ICON_INK[name]
  if (!ink) return { size: ICON_BASE, strokeWidth: ICON_STROKE }
  const pad = ink.solid ? 0 : ICON_STROKE
  const target = ICON_INK_BOX - pad
  const long = Math.max(ink.w, ink.h)
  const size = (ink.vb * target) / long
  const k = size / ink.vb // viewBox 单位 → CSS px
  const inkW = ink.w * k + pad
  const inkH = ink.h * k + pad
  const sx = inkW < ICON_MIN_SIDE && !ink.keep ? ICON_MIN_SIDE / inkW : 1
  const sy = inkH < ICON_MIN_SIDE && !ink.keep ? ICON_MIN_SIDE / inkH : 1
  const optics = {
    size: Number(size.toFixed(2)),
    strokeWidth: Number(((ICON_STROKE * ink.vb) / size).toFixed(2)),
  }
  // 单向拉伸不补描边：两向的视觉描边会差 0.2~0.3px（横向被拉的一侧略粗），
  // 21px 墨迹上肉眼无感；真要补也只能补平均，反而让两个方向都不准。
  if (sx !== 1 || sy !== 1) {
    optics.style = {
      transform: `scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`,
      transformOrigin: 'center',
    }
  }
  return optics
}

// ------------------------------------------------------------ 两个下拉菜单
// 齿轮弹 SettingsMenu、组件那颗弹 ComponentsMenu，机制与侧栏页头同款。
// 菜单在捕获阶段用 pointerdown 收自己，所以点按钮想关菜单时会先被那一层收掉、
// 按钮的 click 又进来，得记一笔「刚刚那一发是不是点在它身上」。
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
         图标本身的大小另有一套换算（见上面 iconOptics）—— 各枚字形在各自的 viewBox 里
         外框差 50%，不换算就一大一小。
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
        <AppIcon name="grid" v-bind="iconOptics('grid')" />
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
        <AppIcon name="gear" v-bind="iconOptics('gear')" />
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
   底色本是与 .pane 同值的 --bg-panel（29 档），2026-10-23 用户要求「折叠 / 展开都与
   页面底色一致」—— 改成 --bg-editor 之后它不再是一块比地面亮一档的「卡」，
   读起来就是地面本身让出了一列图标（展开态的 .sidebar 同一支变量，见 Sidebar.vue）。
   **不描边**（2026-10-22 用户要求去掉外面那一圈细线）：折叠态下它与编辑器卡片之间
   还隔着一条 4px 空隙；再描一圈 1px 反而像第三块卡片。
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
  background: var(--bg-editor);
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