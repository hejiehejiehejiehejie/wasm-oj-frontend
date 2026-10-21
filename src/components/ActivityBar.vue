<script setup>
/**
 * ActivityBar —— 侧边栏折叠后顶替它的竖向图标栏（仿 VS Code 的 Activity Bar）。
 *
 * 只在折叠时出现：展开时页头里仍是「胶囊 + 齿轮」那一套（见 SidebarSwitcher），
 * 折叠后侧栏整栏 display:none，改由这条 48px 的图标栏承接入口 ——
 * 否则用户只能靠分隔条那条隐形热区把侧栏捞回来。
 *
 * 顶部两枚＝侧边栏的两个面板：点一下＝展开侧栏并切到该面板（展开那段在 App.vue 的
 * selectSidebarPanel 里，本组件只负责派发 select）。
 * 底部贴底两枚＝编辑区里的合成页签（组件 / 设置）：与页头那两颗同源，
 * 同样不展开侧栏 —— 它们开的是编辑区里的页签，不是侧栏面板。
 * 「组件」那颗（2026-10-20 起由 Codeforces 那颗改名而来）点它弹组件菜单（ComponentsMenu），
 * 菜单里按类分组挑：Codeforces（随机抽题 / 比赛）与工具（倒计时）；它贴着屏幕边缘，
 * 所以 placement="beside"。按钮常驻 —— 工具类与 Codeforces 装没装无关。
 *
 * 面板数据由 App 从 Sidebar 的 defineExpose 透传进来（状态只有一份，仍是 cp.sidebarTab），
 * 本组件不自己存一份。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import ComponentsMenu from './ComponentsMenu.vue'
import SettingsMenu from './SettingsMenu.vue'
import { t } from '../i18n/index.js'
import { countdown } from '../services/countdown.js'
import { cfContestTab, cfPickerTab, settingsTab } from '../services/editorViews.js'

defineProps({
  /** Sidebar 透传的面板表：{ id, icon, label, active } */
  panels: { type: Array, default: () => [] },
  /**
   * 面板 id → 状态读数：{ tone, text? }。tone 走 ok / fail / err / warn / info 那一套，
   * 与 TestPanel 页头的 verdict tone 同源；没进表的面板不画点。text 有值时才进「数字形态」。
   * 数据由 App 算（testCases / running / dirtyIds 都在那边），本组件不碰评测状态。
   */
  badges: { type: Object, default: () => ({}) },
  /** 侧栏停在哪一侧（'left' | 'right'）：选中指示条要贴**屏幕外缘**那一侧 */
  panelPosition: { type: String, default: 'left' },
})
defineEmits(['select'])

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
</script>

<template>
  <!-- data-badge-style 只有 'dot' / 'count' 两态，本 demo 默认 dot；
       评审时把它在 devtools 里改成 count，就能看到「数字取代圆点」那一版（样式里两条分支都写了） -->
  <nav
    class="activity-bar"
    data-badge-style="dot"
    :data-side="panelPosition"
    :aria-label="t('app.sidebar.switcherLabel')"
  >
    <div class="activity-bar__group activity-bar__group--panels">
      <button
        v-for="panel in panels"
        :key="panel.id"
        type="button"
        class="activity-bar__item"
        :class="{ 'is-active': panel.active }"
        :data-panel="panel.id"
        :title="badges[panel.id]?.text ? `${panel.label} · ${badges[panel.id].text}` : panel.label"
        :aria-label="panel.label"
        :aria-pressed="panel.active"
        @click="$emit('select', panel.id)"
      >
        <AppIcon :name="panel.icon" size="24" />
        <!-- 状态点：圆点只报「什么结论」，鼠标移上去的那句话里有「几 / 几」。
             aria-hidden —— 结论已经并进按钮的 title，读屏不必再念一遍 -->
        <span
          v-if="badges[panel.id]"
          class="activity-bar__badge"
          :data-tone="badges[panel.id].tone"
          aria-hidden="true"
        >
          {{ badges[panel.id].text }}
        </span>
      </button>
    </div>

    <!-- 贴底：组件与齿轮都是常驻入口。组件那颗点开组件菜单（与页头同款），
         开着任一组件（两个 CF 页签或倒计时卡）时提亮。 -->
    <div class="activity-bar__group activity-bar__group--tools">
      <button
        ref="compMenuButton"
        type="button"
        class="activity-bar__item"
        :class="{ 'is-active': cfPickerTab.active || cfContestTab.active || countdown.open }"
        :title="t('components.menu.title')"
        :aria-label="t('components.menu.title')"
        aria-haspopup="menu"
        :aria-expanded="Boolean(compMenuAnchor)"
        @click="toggleCompMenu"
      >
        <AppIcon name="grid" size="24" />
      </button>

      <button
        ref="menuButton"
        type="button"
        class="activity-bar__item"
        :class="{ 'is-active': settingsTab.active }"
        :title="t('app.settings')"
        :aria-label="t('app.settings')"
        aria-haspopup="menu"
        :aria-expanded="Boolean(menuAnchor)"
        @click="toggleMenu"
      >
        <AppIcon name="gear" size="24" />
      </button>

      <SettingsMenu v-if="menuAnchor" :anchor="menuAnchor" placement="beside" @close="closeMenu" />
      <ComponentsMenu v-if="compMenuAnchor" :anchor="compMenuAnchor" placement="beside" @close="closeCompMenu" />
    </div>
  </nav>
</template>

<style scoped>
/* 与两块 .pane 同一种卡片外观（圆角 / 细边 / 面板底色），只是收窄成 48px 一竖条。
   边框用 --border-faint 而不是 .pane 那条 --border-soft：折叠态下它是全界面唯一在场
   的卡片边界（侧栏收起、编辑器那半张卡离得远），同一支笔在这里会偏亮、抢戏。
   宽度写 px 即可随全局缩放：postcss-pxtorem 会把它转成 rem（JS 不读这个值）。 */
.activity-bar {
  flex: 0 0 48px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: stretch;
  padding: 4px 0;
  overflow: hidden;
  border-radius: 10px;
  border: 1px solid var(--border-faint);
  background: var(--bg-panel);
}

/* 展开态不写规则：这一栏的在场与否由 App 的 v-show 决定（判据与 is-collapsed 同源），
   展开那一刻整条就是 display: none，不进布局、也不需要先把宽度让出去。
   2026-10-14 之前这里有一条 `.activity-bar:not(.is-collapsed) { flex-basis: 0 }`，
   那是给 CSS 补间路径当「宽度让位」用的 —— 补间路径已删，这条再也没有可能命中。 */

.activity-bar__group {
  display: flex;
  flex-direction: column;
  /* 方块定宽 40px + 固定左边距 3px，靠 flex-start 钉在同一列（别改成 center / stretch：
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  /* 2026-10-11：可点区从「整宽 48×40 长条」改成 40×40 的圆角正方形（用户要求），
     格子四周的留白因此不再进可点范围。左边距 3px = (栏 48 − 左右 1px 边框 − 方块 40) / 2，
     方块在栏内水平居中（用户反馈：4px 时右边只剩 2px，看得出来偏左）；
     仍用固定边距而不是居中对齐：这一栏伸缩时宽度从右边变，固定的左边距让方块
     一直钉在同一列上，不会随容器变窄而横移。半径 10px 与这条栏自己的圆角同值。 */
  width: 40px;
  height: 40px;
  margin-left: 3px;
  padding: 0;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  /* 状态点与选中指示条都相对方块定位（demo · 方向三） */
  position: relative;
  transition: color 0.16s ease, background-color 0.16s ease;
}

/* 选中态只提亮图标，**不画那道左缘 2px 主题色指示条**（2026-10-04 用户反馈去掉了）：
   图标栏只有一列、不分段，提亮已经说得清「这一个开着」，再加一条线就是多余的噪音。
   hover 另有自己的一套反馈 —— 那是「这一格能点」的信号，不是选中态。
   ⚠️ 2026-10-21（demo · 方向三）加回来的那条 2×8 短条与当年被去掉的不是同一样东西：
   那条是**整格高**、主题色（--accent），等于第二个选中态；这条是 8px 短条、暗灰
   （--text-faint），只在折叠态的「上簇」出现，表达「上次停在这儿」，见下面那组规则。 */
.activity-bar__item:hover {
  color: var(--text);
  background: var(--bg-hover);
}

/* 上下两组在选中态上刻意不对称（2026-10-04）：
   上面两格是侧栏面板的入口，而折叠态下**总有一个面板是 active** —— 给它提亮就等于常驻高亮；
   何况点一下本来就会把侧栏展开，真实状态在那时看得见，这里不必先报一遍。
   下面两格是编辑区里的合成页签（抽题 / 设置），它们不会展开侧栏，
   开着时得在这条栏上直接看出来，所以保留提亮。 */
.activity-bar__group--tools .activity-bar__item.is-active {
  color: var(--text);
}

/* ---------------------------------------------------------------- demo · 方向三

   一、选中指示条（「上次停留在此」）
   折叠态没有页头胶囊可看，用户重开侧栏前不知道会回到哪个面板。这里给上簇的 active
   一格画一条 2×8 的短条，**不提亮图标**（提亮就是常驻高亮，见上一条注释）。
   贴**屏幕外缘**那一侧（左停靠贴左、右停靠贴右），因为方块内侧要留给「会推开侧栏」的
   那一面；颜色用 --text-faint（暗），hover 时抬到 --text-dim —— 存在感靠位置和静止/悬停
   两级来分，不靠颜色抢戏。
   窄屏横排里短条要躺下（8×2）并贴「折叠栏所贴的那一边」（上/下），见文件末尾那组规则。 */
.activity-bar__group--panels .activity-bar__item.is-active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  width: 2px;
  height: 8px;
  margin-top: -4px;
  border-radius: 1px;
  background: var(--text-faint);
  transition: background-color 0.16s ease;
}

.activity-bar[data-side='right'] .activity-bar__group--panels .activity-bar__item.is-active::before {
  left: auto;
  right: 0;
}

.activity-bar__group--panels .activity-bar__item.is-active:hover::before {
  background: var(--text-dim);
}

/* 二、状态点
   6px 圆点压在方块右上角：图标 24px 居中后角上还剩 8px 空隙，点落在空隙里不碰图标。
   外面再套一圈 2px 的 panel 底色（box-shadow），保证点与图标、与 hover 底纹都能分开。
   颜色读 tone，与 TestPanel 页头那枚 verdict 胶囊同一套语义色。 */
.activity-bar__badge {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: currentColor;
  box-shadow: 0 0 0 2px var(--bg-panel);
  color: var(--text-faint);
  /* 圆点形态里这枚 span 的文字必须**不显示**（它是给数字形态准备的那份内容）：
     直接给 font-size: 0，而不是 overflow: hidden —— 6px 的窗口会把第一个字形切一半，
     看着像一块脏点。数字形态再把字号还原，见下面那组。 */
  font-size: 0;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  transition: color 0.16s ease, background-color 0.16s ease;
}

.activity-bar__badge[data-tone='passed'] {
  color: var(--ok);
}

.activity-bar__badge[data-tone='failed'] {
  color: var(--fail);
}

.activity-bar__badge[data-tone='error'] {
  color: var(--err);
}

/* 结论过期 / 未保存都走 --warn：都是「眼前这个数不是最终答案」 */
.activity-bar__badge[data-tone='stale'],
.activity-bar__badge[data-tone='dirty'] {
  color: var(--warn);
}

.activity-bar__badge[data-tone='running'] {
  color: var(--info);
  /* 呼吸：跑着的时候点自己在动，比换一个颜色更能说明「还没完」。
     时长归全局管（base.css 的 prefers-reduced-motion 会把动画压到 0.01ms） */
  animation: activity-bar-badge-pulse 1.4s ease-in-out infinite;
}

@keyframes activity-bar-badge-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}

/* 全局那条 0.01ms 会把呼吸定格在某一帧，可能是 0.3 的淡影 —— 减弱动效下直接给实色 */
@media (prefers-reduced-motion: reduce) {
  .activity-bar__badge[data-tone='running'] {
    animation: none !important;
  }
}

/* 三、数字形态（`data-badge-style="count"`，评审时用 devtools 切换，默认不启用）
   点只能报「什么结论」，报不出「几 / 几」。这一形态把 `2/3` 压到方块下缘居中，
   9px、等宽数字，颜色沿用上面 tone 那一组，只还给它字号。
   两件事要配套：方块补一段下内边距（图标抬上去，下缘让给数字，否则笔画会和图标描边
   黏成一片），字外加一圈 panel 底色的描边（它紧贴图标下缘，不加读不清）。 */
.activity-bar[data-badge-style='count'] .activity-bar__item {
  /* 方块仍是 40×40、可点区不变，只是内容盒从 40 变成 31 */
  padding-bottom: 9px;
}

.activity-bar[data-badge-style='count'] .activity-bar__badge {
  top: auto;
  right: 0;
  bottom: 0;
  left: 0;
  width: auto;
  height: 10px;
  background: transparent;
  box-shadow: none;
  font-size: 9px;
  line-height: 10px;
  text-align: center;
  text-shadow:
    0 0 3px var(--bg-panel),
    0 0 3px var(--bg-panel);
}

/* 四、窄屏横排：短条躺下，贴折叠栏所在的那一边。
   判据用 .workspace 上的 is-fold-top / is-fold-bottom（模板里一直带着，不是窄屏才加），
   外面包 :where(html.is-narrow) —— 同 App.vue 那几组窄屏规则，:where() 不贡献特异性。 */
:where(html.is-narrow) .activity-bar__group--panels .activity-bar__item.is-active::before {
  left: 50%;
  right: auto;
  top: auto;
  bottom: 0;
  width: 8px;
  height: 2px;
  margin: 0 0 0 -4px;
}

/* 折叠栏贴上边时，短条也翻到方块上缘（同一条 8×2，只是贴的是另一头） */
:where(html.is-narrow) .workspace.is-fold-top .activity-bar__group--panels .activity-bar__item.is-active::before {
  top: 0;
  bottom: auto;
}
</style>