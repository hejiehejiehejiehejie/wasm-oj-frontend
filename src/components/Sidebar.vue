<script setup>
/**
 * Sidebar —— 统一侧边栏外壳：页头（面板切换 + 各面板的上下文动作）+ 内容区两个面板
 * （具名插槽由 App.vue 填入 FileExplorer / TestPanel）。
 *
 * 页头只有一份（2026-10-11 重构）：切换器曾经渲染在两个面板各自的页头里、靠 v-show
 * 藏一个来「看起来只有一份」，代价是滑动动画只能用 keyframes 假装、两份 DOM 要防
 * 首屏误播。现在切换器上提到这里、全站单实例，滑动是真实的 transform 过渡；
 * 右侧的上下文动作区（新建文件/文件夹、verdict + 耗时）仍归各面板所有 ——
 * 它们经 Teleport 投进 #sidebar-context，只投当前激活的那一份。
 *
 * 两个面板都用 v-show 切换（不是 v-if）：文件树的展开态、评测样例里用户手写的输入
 * 与卡片折叠态都挂在 DOM 上，不能因切换而销毁重建。
 *
 * 页签状态与持久化都留在这里，经 provide 下发给页头里的切换组件与两个面板。
 * 宽度与显隐不在这里管：外层 .pane--tests 作为一个整体参与与 Monaco 的分屏拖拽
 * （见 App.vue 的 .splitter 与 measureLimits）。
 */
import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import SidebarSwitcher from './SidebarSwitcher.vue'
import { t } from '../i18n/index.js'
import { usePersistentRef } from '../composables/usePersistentRef.js'
import { uiScale } from '../composables/useUiScale.js'
import { cfReady } from '../services/cfRuntime.js'
import {
  cfPickerTab,
  closeCfPickerTab,
  closeSettingsTab,
  openCfPickerTab,
  openSettingsTab,
  settingsTab,
} from '../services/editorViews.js'

// 侧边栏里的两个面板。数组顺序就是页头胶囊里两段的顺序。
// 只存 key：翻译必须发生在渲染那一刻（见 i18n 的调用纪律），下面的两个 computed 负责 t()。
// labelKey 是全称（title / aria-label 用），shortLabelKey 是胶囊段位上图标旁的短标签。
const PANEL_TABS = [
  {
    id: 'explorer',
    labelKey: 'app.sidebar.explorer',
    shortLabelKey: 'app.sidebar.explorerShort',
    icon: 'files',
  },
  {
    id: 'tests',
    labelKey: 'app.sidebar.tests',
    shortLabelKey: 'app.sidebar.testsShort',
    icon: 'cases',
  },
]

/** 给一个页签补上当前语言的显示名（全称 + 短标签） */
const withLabel = (tab) => ({
  ...tab,
  label: t(tab.labelKey),
  shortLabel: t(tab.shortLabelKey),
})

// 当前页签：默认落在资源管理器，与改动前的默认视觉一致
const activeTab = usePersistentRef('cp.sidebarTab', 'explorer')
// 存档里可能是旧值 / 脏值：认不出来就退回默认页签，免得两个面板被一起藏掉
if (!PANEL_TABS.some((tab) => tab.id === activeTab.value)) activeTab.value = 'explorer'

// 页头胶囊（定稿形态见 SidebarSwitcher 头注释）：两段并排、当前段填亮，
// 整枚是一颗 toggle 按钮 —— 点轨道上任意位置都翻到另一个面板。
// 设置那颗独立：它开关的是编辑区里的合成页签，与面板互不排斥（见第 5 节坑 7），
// 不进胶囊（进同一个胶囊就暗示它也是面板之一，且是同一个单选组）。
const panels = computed(() =>
  PANEL_TABS.map((tab) => ({ ...withLabel(tab), active: tab.id === activeTab.value })),
)

// 胶囊上要写的是「将要去的那一个」：整枚是一个动作按钮，文案得说清点下去会去哪
const targetPanel = computed(() =>
  withLabel(PANEL_TABS.find((tab) => tab.id !== activeTab.value) ?? PANEL_TABS[0]),
)

function togglePanel() {
  // 只有两个面板时就是「另一个」；写成 find 是为了数组真变长时也不会错得很离谱
  const next = PANEL_TABS.find((tab) => tab.id !== activeTab.value)
  if (!next) return
  activeTab.value = next.id
}

function toggleSettings() {
  // 再点一次＝收起设置，回到刚才那个代码文件（与顶栏那颗齿轮的旧行为一致）
  settingsTab.active ? closeSettingsTab() : openSettingsTab()
}

/** Codeforces 那颗：开着就收起抽题页签，与设置齿轮同一套肌肉记忆 */
function toggleCfPicker() {
  cfPickerTab.active ? closeCfPickerTab() : openCfPickerTab()
}

// 设置那颗整条做成一个 computed 对象：属性跟着 settingsTab 走，
// 下发给子组件后在模板里直接写 settings.active 就行（不用 .value）
const settingsEntry = computed(() => ({
  icon: 'gear',
  label: t('app.settings'),
  active: settingsTab.active,
}))

// 抽题组件那颗：它默认安装（启动时静默预取题库），但预取未完成前页头里根本不该有它 ——
// 所以是 ready 驱动的显示/隐藏，而不是禁用态。状态在 services/cfRuntime.js 里，侧栏与
// 设置页那一行读的是同一个 cfReady。
// 点它开的是编辑区里的合成页签（与设置同形态），所以与齿轮并排、不进胶囊。
const cfPickerEntry = computed(() => ({
  icon: 'codeforces',
  label: t('cf.button.label'),
  title: t(cfPickerTab.active ? 'cf.button.close' : 'cf.button.open'),
  active: cfPickerTab.active,
  ready: cfReady.value,
  toggle: toggleCfPicker,
}))

// ------------------------------------------------------------ 页头的两种自适应
const rootEl = ref(null)

// ① 紧凑模式：侧栏够宽时胶囊段位带文字标签（图标 + 短名），窄了退回纯图标
//   （与重构前的胶囊同形）。阈值 360 逻辑 px 的来历：带标签的胶囊 ~148px + 抽题 30 +
//   齿轮 26 + 间距 + 右侧动作区（评测面板的 verdict + 耗时最坏 ~170px；compact 态
//   verdict 去掉「 AC」后缀会更短，见 TestPanel），再窄文字就会把页头挤折行。用
//   ResizeObserver 而不用 @container：页头里有 fixed 定位的
//   浮层（SettingsMenu），container-type 附带的 layout containment 会把它的
//   定位基准从视口改到页头。
const compact = ref(false)
let compactObserver = null

// ② 滚动显影：列表没滚动时页头与正文一色（2026-10-04「透明页头」的定稿不变）；
//   一旦内容滚动，页头下沿浮出 1px 发丝线，交代「内容正从页头底下穿过」。
const headScrolled = ref(false)
const scrollCleanups = []

/** 读当前激活面板的滚动容器：scrollTop > 0 就给页头描边 */
function syncHeadScrolled() {
  const selector = activeTab.value === 'explorer' ? '.explorer__tree' : '.cases'
  const scroller = rootEl.value?.querySelector(selector)
  headScrolled.value = (scroller?.scrollTop ?? 0) > 0
}

// 切面板后按新面板的滚动位置重算（两个面板的 scrollTop 各自独立）
watch(activeTab, syncHeadScrolled)

onMounted(() => {
  // 两个面板都常驻 DOM（v-show），两个滚动容器这时都已存在
  for (const selector of ['.explorer__tree', '.cases']) {
    const scroller = rootEl.value?.querySelector(selector)
    if (!scroller) continue
    scroller.addEventListener('scroll', syncHeadScrolled, { passive: true })
    scrollCleanups.push(() => scroller.removeEventListener('scroll', syncHeadScrolled))
  }
  syncHeadScrolled()

  compactObserver = new ResizeObserver(() => {
    const width = rootEl.value?.getBoundingClientRect().width ?? 0
    // 阈值是逻辑尺寸，要随 uiScale 走（与 useUiScale 的 px() 同口径）
    compact.value = width > 0 && width < 360 * uiScale.value
  })
  if (rootEl.value) compactObserver.observe(rootEl.value)
})

onBeforeUnmount(() => {
  scrollCleanups.forEach((cleanup) => cleanup())
  compactObserver?.disconnect()
})

provide('sidebarTabs', {
  panels,
  targetPanel,
  togglePanel,
  settings: settingsEntry,
  toggleSettings,
  cfPicker: cfPickerEntry,
  // 两个面板拿它判「是不是该我把上下文动作投进页头」；切换器拿它判要不要收起文字标签
  activeTab,
  compact,
})

// 供父组件从外部切到指定面板（如 App.vue 在开跑时要把「评测样例」亮出来）。
// 状态与持久化仍只在这一处，这里只是多一个入口，不让父组件自己存一份
function showPanel(id) {
  if (PANEL_TABS.some((tab) => tab.id === id)) activeTab.value = id
}
defineExpose({
  showPanel,
  // 供快捷键用（App.vue 的 switch-panel）：与点胶囊走的是同一个 togglePanel，
  // 所以动画与持久化都一致，不会出现「键盘切过去没动画」这种两套行为
  switchPanel: togglePanel,
  // 供折叠态那条图标栏用（ActivityBar）：它要画「有哪两个面板、我停在哪一个」，
  // 但它不是本组件的子组件（是工作区的兄弟节点），inject 够不到这里的 provide，
  // 所以由 App 把这份（已翻译、带 active 的）表透传过去，状态仍只有这里一份
  panels,
})
</script>

<template>
  <div ref="rootEl" class="sidebar">
    <!-- 全站唯一的一份侧栏页头：左边是面板切换 + 抽题 + 设置（SidebarSwitcher），
         右边 #sidebar-context 是当前面板 Teleport 上来的上下文动作
         （资源管理器 = 新建文件/文件夹；评测样例 = verdict + 耗时）。 -->
    <header class="sidebar__head" :class="{ 'is-scrolled': headScrolled }">
      <div class="sidebar__switcher"><SidebarSwitcher /></div>
      <span id="sidebar-context" class="sidebar__context"></span>
    </header>

    <div class="sidebar__body">
      <!-- data-panel：「现在停在哪个面板」的机器可读出处（无头回归按它判）。
           页头胶囊虽然也画了当前段，但从 DOM 反推「哪一段算选中」要连着读 class，
           不如在这里直接标一个数据集属性稳。 -->
      <div v-show="activeTab === 'explorer'" class="sidebar__panel" data-panel="explorer">
        <slot name="explorer" />
      </div>
      <div v-show="activeTab === 'tests'" class="sidebar__panel" data-panel="tests">
        <slot name="tests" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--bg-panel);
}

/* ---------------------------------------------------------------- 页头
   不铺底纹（2026-10-04 定稿不变）：侧栏展开后它是整栏最上一条，整块侧栏从头到尾
   一个色，胶囊自己浮在上面。底边那 1px 留给滚动显影 —— 常时透明、不占视觉，
   列表一滚动才描成发丝线（.is-scrolled），所以常态高度仍是 35px 不抖动。
   折行只会在窄面板 + 评测样例的 verdict 挤不下时发生（同重构前的评测页头）。 */
.sidebar__head {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  row-gap: 4px;
  box-sizing: border-box;
  min-height: 35px;
  padding: 4px 8px 4px 4px;
  background: transparent;
  border-bottom: 1px solid transparent;
  transition: border-color 0.15s ease;
}

.sidebar__head.is-scrolled {
  border-bottom-color: var(--border-soft);
}

/* 页头左侧那一块（面板胶囊 + 抽题 + 齿轮）的壳。宽屏下它只是页头里一个普通 flex 项；
   窄屏下这一整块要沉到侧栏底部（见下面的窄屏段），所以单独包一层 —— 直接把规则盖在
   SidebarSwitcher 的根上会和它自己的 scoped 规则撞特异性（两边都是 (0,2,0)，
   谁在样式表里靠后谁赢，跨组件不可控），包一层就没有这个不确定性。 */
.sidebar__switcher {
  display: flex;
  flex: 0 0 auto;
  min-width: 0;
}

/* 页头右侧的上下文动作位：当前面板经 Teleport 把动作投进来。
   折到第二行时仍然贴右（margin-left: auto） */
.sidebar__context {
  display: flex;
  align-items: center;
  min-width: 0;
  margin-left: auto;
}

/* 换面板时右侧动作区整体换了一份：淡入一下，不要硬跳。
   挂 > * 上：投进来的那份根节点一挂载就播，与是哪块内容无关 */
.sidebar__context > * {
  animation: sidebar-context-in 0.16s ease;
}

@keyframes sidebar-context-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* ---------------------------------------------------------------- 内容区
   占满剩余高度；面板过长时由面板自己滚动，不撑破外层卡片 */
.sidebar__body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.sidebar__panel {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* ---------------------------------------------------------------- 窄屏：左簇沉底（2026-10-13）
   侧栏宽度跟着视口收（.pane--tests 的 min-width = clamp(160px, 50%, 240px)，
   实测 320px 视口下只剩 181px），而页头那一排「胶囊 + 抽题 + 齿轮 + 当前面板动作」
   最窄要 ~200px（装了抽题模块 ~221px，uiScale 110% 再涨一成）—— 挤不下就 flex-wrap
   折到第二行，看着就是「一排图标挤在一起又错位」。用户定的路子不是加宽侧栏，
   而是**窄屏把左簇整块搬到侧栏底部**：那里空间宽裕，又落在拇指区。

   做法是 display: contents 把页头**整条解散**，让它的两个子元素升成 .sidebar 的
   直接 flex 项，再用 order 把左簇排到最后一行 —— 底部那条因此是**真的一条**
   （占位、不压内容），不是浮在树上的抽屉。

   ⚠️ 不用 position: absolute 钉底：展开动画会给 .sidebar__head 加 transform
   （App.vue 的 panel-fade-in），而带 transform 的元素会成为绝对定位后代的包含块 ——
   那 300ms 里底部条会先画在页头位置、动画结束再往下跳。display: contents 没有盒子，
   祖先的 transform / opacity 都够不到它，所以那份淡入得按元素单独补
   （见 App.vue 里断点相同的那个 media query）。

   断点 600px 的来历：侧栏宽 ≈ 0.53 × 视口，按最坏 ~221px（uiScale 110% 时 ~243px）
   反推，会折行的范围到 ~450px 视口为止；取 600 是留余量的整数，桌面正常窗口
   （≥ 900px）一概不受影响。 */
@media (max-width: 600px) {
  .sidebar__head {
    display: contents;
  }

  /* 顶层那一条：只剩当前面板的动作（资源管理器 = 新建文件/文件夹，
     评测样例 = verdict + 耗时）。页头没了盒子，它得自己兜住原来那 35px 高度，
     以及滚动显影的发丝线（is-scrolled 仍然挂在页头上，只是它不再画东西）。
     margin-left: 0 是必须的：交叉轴上的 auto 外边距优先于 stretch，
     留着那一条它会缩成内容宽并被推到右边，发丝线就只剩按钮那一小段。 */
  .sidebar__context {
    order: 0;
    flex: 0 0 auto;
    box-sizing: border-box;
    min-height: 35px;
    padding: 4px 8px 4px 4px;
    margin-left: 0;
    justify-content: flex-end;
    border-bottom: 1px solid transparent;
    transition: border-color 0.15s ease;
  }

  .sidebar__head.is-scrolled .sidebar__context {
    border-bottom-color: var(--border-soft);
  }

  .sidebar__body {
    order: 1;
  }

  /* 底部那一条：整行铺满、内容居中，上沿一条发丝线与树分开
     （语汇沿用页头那条滚动显影线，不另造颜色） */
  .sidebar__switcher {
    order: 2;
    justify-content: center;
    padding: 6px 8px;
    border-top: 1px solid var(--border-soft);
  }
}
</style>
