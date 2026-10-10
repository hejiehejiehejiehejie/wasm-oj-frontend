<script setup>
/**
 * EditorTabs —— 编辑器标签栏（单编辑器组）。
 * - 点击切换活跃标签；中键关闭；× 按钮关闭；双击钉住预览页签。
 * - **拖动页签改顺序**（2026-10-10 加）：按住文件页签横向拖，落在别处即交换位置，顺序
 *   存回 openTabIds（含持久化）。手势与落点判据全在 composables/useTabDrag.js，本文件
 *   只提供根元素、转交 pointerdown、渲染拖拽态与插入指示条。**只排文件页签** ——
 *   设置 / 抽题那两个合成视图页签恒定排在后面，理由见 useTabDrag 的文件头。
 * - 预览页签（单击文件树开出来的那个）标签用斜体，见 workspace.previewTabId。
 * - dirty 文件显示圆点替代图标；活跃标签顶边取主题强调色。开着自动保存时不显示圆点
 *   （dirty 只存在几百毫秒，圆点只会闪一下），见下面的 isDirtyTab。
 * - 横向溢出时可横向滚动，不换行。
 *
 * 这里不再有运行按钮（2026-09-28 删）：运行入口只剩全局快捷键（⌘/Ctrl + Enter）
 * 与评测样例面板页脚那颗 ▶，两处都直连 App.vue 的 runAll，跑起来会自己把侧栏
 * 展开并切到「评测样例」，所以删掉页签栏这颗不会出现「点了看不到结果」。
 */
import { computed, nextTick, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { useTabDrag } from '../composables/useTabDrag.js'
import { t } from '../i18n/index.js'
import { autoSaveEnabled } from '../services/autoSave.js'
import { fileIconName } from '../services/fileIcons.js'
import { modelManager } from '../services/monaco/modelManager.js'
import {
  activateCfPickerTab,
  activateSettingsTab,
  cfPickerTab,
  closeCfPickerTab,
  closeSettingsTab,
  deactivateViews,
  settingsTab,
  viewActive,
  viewOrder,
} from '../services/editorViews.js'
import {
  closeTab,
  getNodeById,
  moveTab,
  pinTab,
  setActiveTab,
  workspace,
} from '../services/vfs/workspaceStore.js'

function activate(id) {
  // 拖动收尾那一下会顺带来一个 click：吃掉它，否则拖完顺带把页签切过去
  if (consumeClickSuppression()) return
  // 点文件页签＝要看代码：先把合成视图（设置 / 抽题）让开。已经停在同一个文件上时
  // activeId 不变，editorViews 里那条 watch 不会触发，所以这里必须显式让一次。
  deactivateViews()
  setActiveTab(id)
}

/** 双击钉住预览页签；拖动收尾那一串点击同样要挡掉（否则拖完会顺带把它钉住） */
function onTabDblClick(id) {
  if (consumeClickSuppression()) return
  pinTab(id)
}

/** 页签上这个未保存标记要不要显示：开了自动保存就不显示（dirty 只存在几百毫秒） */
function isDirtyTab(id) {
  return !autoSaveEnabled.value && modelManager.isDirty(id)
}

/**
 * 页签上这个「磁盘已变更」标记要不要显示：外部编辑器改了这个文件，而这里还有没保存的
 * 内容（见 modelManager.staleIds）。保存一次就清除 —— 本地缓冲覆盖磁盘，冲突解除。
 * @param {string} id
 */
function isStaleTab(id) {
  return modelManager.isStale(id)
}

/**
 * 页签上的文件 logo。走 services/fileIcons.js —— 与资源管理器同一份映射，
 * 别在这儿另写一套（同名的图标同时是着色类后缀，见下面 .editor-tabs__icon.is-*）。
 * 节点还没索引出来时回落 'file'，与标签的 untitled 回退对齐。
 * @param {string} id
 */
function tabIcon(id) {
  return fileIconName(getNodeById(id)?.name ?? '')
}

/** 中键关掉合成视图页签（设置 / 抽题同一套） */
function onViewMouseDown(event, close) {
  if (event.button === 1) {
    event.preventDefault()
    close()
  }
}

/**
 * 合成视图页签（设置 / 抽题）的渲染描述。顺序读 editorViews.viewOrder ——
 * 谁先开谁靠左、后开的追加到最右，与文件页签「新开的排最后」同一条规矩，
 * 不再固定「抽题在设置左边」。图标 / 文案 / 开关都在这里现取，render 期间执行，
 * 所以语言切换、视图开关变化都会让它重算。
 */
function viewMeta(id) {
  return id === 'cfPicker'
    ? {
        key: 'view:cfPicker',
        icon: 'codeforces',
        label: t('cf.button.label'),
        closeLabel: t('cf.tab.close'),
        active: cfPickerTab.active,
        activate: activateCfPickerTab,
        close: closeCfPickerTab,
      }
    : {
        key: 'view:settings',
        icon: 'gear',
        label: t('app.settings'),
        closeLabel: t('app.tabs.closeSettings'),
        active: settingsTab.active,
        activate: activateSettingsTab,
        close: closeSettingsTab,
      }
}

const viewTabs = computed(() => viewOrder.map(viewMeta))

function onMouseDown(event, id) {
  // 中键关闭（auxclick 在部分时机不一致，统一在 mousedown 处理）
  if (event.button === 1) {
    event.preventDefault()
    closeTab(id)
  }
}

/* ------------------------------------------------------------ 页签进场 / 退场
   容器是 TransitionGroup（见模板）：进场只需 CSS 淡入。退场则**不占位**——下面这个
   钩子在退场前把页签盒子（left/top/width/height）钉成当前实测值，再由
   .tab-leave-active 把它转成 position:absolute，于是它当帧脱离文档流：后面的页签
   立刻走到最终位置（位移交给 .tab-move 补间），退场元素留在原地纯淡出。
   宽高必须显式写：absolute 之后它不再被 flex 拉伸，不写会塌成收缩宽度。
   offsetLeft / offsetTop 相对的是 .editor-tabs__strip（它已设为 position: relative）。
   预览页签被顶替是例外，走瞬时切换，见下面的 instantSwap。 */
function onTabBeforeLeave(el) {
  el.style.left = `${el.offsetLeft}px`
  el.style.top = `${el.offsetTop}px`
  el.style.width = `${el.offsetWidth}px`
  el.style.height = `${el.offsetHeight}px`
}

/* 预览页签被顶替：**进出场不做交叉淡化，但宽度做平滑过渡**。
   交叉淡化会让两个不同长度的文件名叠在同一槽位、条带底色透出来（亮度塌陷），看着就是闪，
   所以进出场是瞬时的；可页签宽度是按文件名自适应的，若让新页签直接以自然宽度出场，它自己
   当帧跳变、右边页签却平滑移动，两者不一致反而更别扭。于是让新页签先按被顶替那一格的宽度
   「起跑」，下一帧再过渡到自己的自然宽度 —— 整条 bar 的 flex 布局逐帧重排，右侧页签跟着
   同一次动作滑过去，全条栏是一个连贯的收放。见下面的 onTabEnter。
   store 的 openFile 把「删旧 + 在原位插新」压在同一个 tick 里完成，所以这里能靠数组 diff
   认出来：长度不变、只有一处 id 不同。固定标签的打开/关闭、中键关闭等仍走 name="tab"。 */
const rootEl = ref(null)
const instantSwap = ref(false)

// 拖动排序：只对文件页签起手（useTabDrag 认 data-tab-id），落盘走 store 的 moveTab。
// 放在 rootEl 之后 —— useTabDrag 拿的是这个 ref 对象，声明顺序上不能提前。
const { draggingId, indicatorX, onTabPointerDown, consumeClickSuppression } = useTabDrag({
  rootEl,
  onDrop: moveTab,
})

// 被顶替那一格在更新前的宽度，供新页签的宽度过渡当起点（见 onTabEnter）
let swapFromWidth = 0

watch(
  () => workspace.openTabIds.slice(),
  (next, prev) => {
    if (next.length !== prev.length) return
    let changedAt = -1
    for (let i = 0; i < next.length; i += 1) {
      if (next[i] === prev[i]) continue
      if (changedAt !== -1) return // 不止一处不同，不是预览顶替
      changedAt = i
    }
    if (changedAt === -1) return
    // 此刻 DOM 还是更新前的：strip 的子元素是「文件页签 + 视图页签」，前段与 openTabIds
    // 一一对应，所以能按索引量到即将被顶替的那个的宽度
    const strip = rootEl.value?.querySelector('.editor-tabs__strip')
    swapFromWidth = strip?.children[changedAt]?.offsetWidth ?? 0
    instantSwap.value = true
    nextTick(() => {
      instantSwap.value = false
    })
  },
)

/* 新页签先按被顶替那一格的宽度出场，下一帧再过渡到自己的自然宽度。起点宽度是在更新前
   量好的（见上面 watch），不依赖进出场钩子的先后顺序。
   **这个钩子必须挂在 @enter 上，绝不能挂 @before-enter**：Vue 是先调 before-enter、
   再把元素插进 DOM（renderer 里 hostInsert 在 transition.beforeEnter 之后），那一刻
   元素还脱离文档流，offsetWidth 读出来是 0 —— 于是「自然宽度」被当成 0，页签从旧宽
   一路缩到没有、220ms 后再弹回真实宽度，看着就是一次莫名的收缩。@enter 走的是
   queuePostRenderEffect，元素已经在 DOM 里了，这时量到的才是真宽度。
   刻意**不定义** -move 类（.tab-instant-move）：没有它 Vue 会跳过 move-FLIP，右侧页签
   就不会再单独做一次位移，而是跟着宽度过渡的逐帧重排自然滑动，与宽度变化是同一次动作。 */
function onTabEnter(el) {
  if (!instantSwap.value || !swapFromWidth) return
  const naturalWidth = el.offsetWidth
  if (!naturalWidth || naturalWidth === swapFromWidth) return
  el.style.overflow = 'hidden'
  el.style.width = `${swapFromWidth}px`
  // 先让「起始宽度」落定，下一帧再上 transition 并改成自然宽度，过渡才会发生
  void el.offsetWidth
  requestAnimationFrame(() => {
    el.style.transition = 'width 180ms cubic-bezier(0.22, 0.61, 0.36, 1)'
    void el.offsetWidth
    el.style.width = `${naturalWidth}px`
    window.setTimeout(() => {
      el.style.transition = ''
      el.style.overflow = ''
      el.style.width = ''
    }, 220)
  })
}
</script>

<template>
  <div ref="rootEl" class="editor-tabs" :class="{ 'is-dragging': draggingId }">
    <!-- TransitionGroup 直接反映 openTabIds / 视图 open 状态的变化，所以打开、关闭、
         切换、预览页签被顶替四种操作共用这一套进出场，workspaceStore 不用改。
         子项（文件页签的 v-for 与两个 v-if 视图页签）都已带 key。 -->
    <TransitionGroup
      tag="div"
      class="editor-tabs__strip"
      role="tablist"
      :aria-label="t('app.tabs.listLabel')"
      :name="instantSwap ? 'tab-instant' : 'tab'"
      @before-leave="onTabBeforeLeave"
      @enter="onTabEnter"
    >
      <button
        v-for="id in workspace.openTabIds"
        :key="id"
        type="button"
        class="editor-tabs__item"
        :class="{
          'editor-tabs__item--active': id === workspace.activeId && !viewActive,
          'editor-tabs__item--preview': id === workspace.previewTabId,
          'editor-tabs__item--dragging': id === draggingId,
        }"
        role="tab"
        :data-tab-id="id"
        :data-preview="id === workspace.previewTabId || undefined"
        :aria-selected="id === workspace.activeId && !viewActive"
        :title="getNodeById(id)?.path"
        @click="activate(id)"
        @dblclick="onTabDblClick(id)"
        @mousedown="onMouseDown($event, id)"
        @pointerdown="onTabPointerDown($event, id)"
      >
        <span
          v-if="isStaleTab(id)"
          class="editor-tabs__stale"
          :title="t('app.tabs.diskChanged')"
          :aria-label="t('app.tabs.diskChanged')"
        ></span>
        <span
          v-else-if="isDirtyTab(id)"
          class="editor-tabs__dot"
          :title="t('app.tabs.dirty')"
        ></span>
        <!-- 文件 logo 与资源管理器同一份映射（services/fileIcons.js），dirty 时让位给圆点 -->
        <AppIcon
          v-else
          :name="tabIcon(id)"
          :size="12"
          class="editor-tabs__icon"
          :class="`is-${tabIcon(id)}`"
        />
        <span class="editor-tabs__label">{{ getNodeById(id)?.name ?? t('app.tabs.untitled') }}</span>
        <span
          class="editor-tabs__close"
          role="button"
          :aria-label="t('app.tabs.closeTab')"
          @click.stop="closeTab(id)"
        >
          <AppIcon name="close" :size="12" />
        </span>
      </button>

      <!-- 合成视图页签（设置 / 抽题）：与代码文件同一个皮，排在文件页签之后。
           顺序读 editorViews.viewOrder —— 谁先开谁靠左、后开的追加到最右，
           与文件页签「新开的排最后」同一条规矩。图标 / 文案 / 开关由 viewMeta 现取，
           设置没有 dirty 圆点（即时生效，没有保存概念），所以图标固定是齿轮。 -->
      <button
        v-for="view in viewTabs"
        :key="view.key"
        type="button"
        class="editor-tabs__item"
        :class="{ 'editor-tabs__item--active': view.active }"
        role="tab"
        :aria-selected="view.active"
        :title="view.label"
        @click="view.activate"
        @mousedown="onViewMouseDown($event, view.close)"
      >
        <AppIcon :name="view.icon" :size="12" class="editor-tabs__icon" />
        <span class="editor-tabs__label">{{ view.label }}</span>
        <span
          class="editor-tabs__close"
          role="button"
          :aria-label="view.closeLabel"
          @click.stop="view.close"
        >
          <AppIcon name="close" :size="12" />
        </span>
      </button>
    </TransitionGroup>

    <!-- 拖动排序的插入指示条：位置由 useTabDrag 以**根容器左缘**为基准算好（inline left），
         所以这一条必须是 .editor-tabs 的直接子元素 —— 放进会横向滚动的 strip 里就得再补
         一个 scrollLeft，且自动滚动途中会与那次重算脱节。 -->
    <span
      v-if="indicatorX !== null"
      class="editor-tabs__indicator"
      :style="{ left: `${indicatorX}px` }"
      aria-hidden="true"
    ></span>
  </div>
</template>

<style scoped>
.editor-tabs {
  flex: 0 0 35px;
  display: flex;
  align-items: stretch;
  /* 横向滚动归内部的 .editor-tabs__strip */
  overflow: hidden;
  /* 拖动排序的插入指示条是这里的直接子元素（absolute 定位，left 由 useTabDrag 算） */
  position: relative;
  background: var(--bg-panel-head);
  border-bottom: 1px solid var(--border-soft);
}

.editor-tabs__strip {
  flex: 1 1 auto;
  display: flex;
  align-items: stretch;
  min-width: 0;
  /* 退场页签要相对条带定位（onTabBeforeLeave 写 left/top），所以条带得是定位祖先。
     它同时是横向滚动容器，absolute 子元素会跟着内容一起滚，符合预期。 */
  position: relative;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}

.editor-tabs__strip::-webkit-scrollbar {
  height: 0;
}

.editor-tabs__item {
  display: inline-flex;
  align-items: center;
  position: relative;
  /* 底色与文字色淡入淡出 —— **这段过渡同时服务两处底色变化**：
     ① 悬停时整块底色换一档（见下面的 :hover，2026-10-10 由「下沿一条 1px 细线」改来）；
     ② 选中时底色淡入到 --bg-tab-active（原先那条会「上浮 + 变蓝」的高亮线已去掉，
     选中只由底色表示，见 .editor-tabs__item--active）。
     与场次动画（.tab-*）用同一支缓动，观感是一次动作。 */
  transition:
    background-color 150ms cubic-bezier(0.22, 0.61, 0.36, 1),
    color 150ms cubic-bezier(0.22, 0.61, 0.36, 1);
  /* 5px（原 6px，2026-10-01 收紧）：真机反馈页签里的空白偏大。这一条同时管
     「图标 ↔ 标签」与「标签 ↔ 关闭按钮」两处 —— 图标/× 的墨迹在各自的 12px 方框里
     本来就留了余量，视觉上的间距比 5px 还多一点点。 */
  gap: 5px;
  flex: 0 0 auto;
  /* 左 10px、右 7px（2026-10-01 收窄，真机反馈「页签右侧空白比较大」）。
     不对称是有原因的：右端那颗 × 的墨迹只占 15px 框里的 7px（图标是 24 viewBox 里
     6→18 的线段，四周本来就留了 25% 空），左端那颗代码图标的墨迹要满得多，
     所以左右各给 10px 时右边看着空出去一大截。右内边距收到 7px 后，
     「× 墨迹 → 页签右缘」与「代码图标墨迹 → 页签左缘」的留白基本齐平。 */
  padding: 0 7px 0 10px;
  background: transparent;
  /* 页签之间那条 1px 竖线（原 border-right: 1px solid var(--border-soft)）2026-10-10 去掉：
     相邻页签不再互相描边，三种态全靠底色与文字色区分 —— 静止「透明底 + --text-dim 文字」、
     悬停 --bg-tab-hover、选中 --bg-tab-active。
     注意 border: none 必须留着 —— 全局 button 样式带着边框，去掉会露出系统描边。 */
  border: none;
  color: var(--text-dim);
  font-size: 12.5px;
  cursor: pointer;
}

/* 悬停（2026-10-10 改）：从「页签下沿一条 1px 细线从中心展开」换成**整块底色换一档**。
   取 --bg-tab-hover（深色比页签栏底 --bg-panel-head 提亮 6 阶、浅色压深 6 阶 —— 两套主题方向
   相反，原因写在 base.css 那两条注释里），过渡走上面基类那两行，
   于是鼠标划过去是底色的淡入淡出，页签上不再有任何会移动的东西。
   两条注意：
   - **刻意不放进 @media (hover: hover)**：与下面 .editor-tabs__close 那条不同 —— 触屏上
     这层底色不会误伤，因为手指点页签必定把它切成选中态，选中规则的背景会盖住这里
     （见下面两条注释）。
   - 必须写在 .editor-tabs__item--active 那组**之前**，靠顺序让选中色胜出。 */
.editor-tabs__item:hover {
  background: var(--bg-tab-hover);
  color: var(--text);
}

/* 选中：**只有底色**（2026-10-10 起不再有顶部高亮条）。点选页签看见的动画就是
   底色从页签栏底色淡入到 --bg-tab-active（顺带文字转亮），过渡写在上面基类那两行。
   `--active:hover` 那一条**不是冗余**：`.editor-tabs__item:hover` 的特异性是 (0,2,0)，
   高过单写 `.editor-tabs__item--active` 的 (0,1,0) —— 少了它，鼠标停在当前页签上时
   底色会被换成 --bg-tab-hover（选中色一闪一闪）。两条同为 (0,2,0)，靠这里的顺序取胜。 */
.editor-tabs__item--active,
.editor-tabs__item--active:hover {
  background: var(--bg-tab-active);
  color: var(--text);
}

/* 被拖动的页签（2026-10-10 加）：**留在原位**，只压暗表示「它正跟着指针走」。
   真正换位发生在松手那一刻（见 useTabDrag 文件头）：中途改 openTabIds 会让被拖的那一个
   也被 TransitionGroup 的 .tab-move 补间一次，与指针底下的拖拽视觉打架。
   压暗而不是隐藏 —— 留着才看得出少的是哪一张，条带总宽也没变、后面的页签不会跳。 */
.editor-tabs__item--dragging {
  opacity: 0.4;
  cursor: grabbing;
}

/* 拖动中：整条栏换成抓取光标；指针划过沿途页签时不再给悬停反馈（注意力留给插入指示条）；
   顺手屏蔽文字选中 —— 横向拖久了浏览器容易把标签文字拖出一片选区。 */
.editor-tabs.is-dragging {
  cursor: grabbing;
  user-select: none;
}

/* 拖动中压掉沿途页签的悬停底色（注意力留给插入指示条）。**必须排除当前选中那颗**：
   这一条的特异性是 (0,5,0)，高过 .editor-tabs__item--active:hover 的 (0,2,0)，
   不排除的话拖动期间当前页签会连选中底色一起被抹成透明。
   （2026-10-10 从同形态的 `:hover::after { scaleX(0) }` 版本改来 —— 那时它压的是悬停细线，
   而选中线画在另一个伪元素上，所以不排除也不会露馅；改成底色之后必须补这个 :not。） */
.editor-tabs.is-dragging .editor-tabs__item:not(.editor-tabs__item--active):hover {
  background: transparent;
}

/* ------------------------------------------------------ 拖动排序的插入指示条
   一条竖线，画在「松手后这个页签会去的位置」。left 由 useTabDrag 算好（相对本容器左缘、
   已含条带的横向滚动偏移），这里只管外观。
   - **不放进 strip**：strip 是横向滚动容器，放进去就得再补一个 scrollLeft，且自动滚动
     滚一帧重算一次，两个偏移量很容易对不齐。所以它是 .editor-tabs 的直接子元素
     （也是上面那条 position: relative 的来由）。
   - **宽度 2px 且不转 rem**：1px 在深色栏底上几乎看不出是一条「线」，2px 才够一眼认出是
     「落点」（它原先还兼着「与页签下沿那条 1px 悬停线分开」的差事，那条线 2026-10-10
     已改成悬停底色）；低于 pxtorem 的 minPixelValue(3) 所以两端都不缩放 —— 与 margin-left
     的 -1px 同源，必须一起保持物理 px 才对得齐中心。
   - **上下各留 4px**：顶满 35px 的条高会看着像页签间的分隔线，短一截才像「插在这儿」。 */
.editor-tabs__indicator {
  position: absolute;
  top: 4px;
  bottom: 4px;
  width: 2px;
  margin-left: -1px;
  border-radius: 1px;
  background: var(--focus, var(--accent));
  pointer-events: none;
  z-index: 2;
  /* 相邻两个落点之间滑过去，而不是瞬移。缓动与 .tab-move 同源。 */
  transition: left 100ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

.editor-tabs__icon {
  color: var(--icon-code, currentColor);
}

/* 语言标志沿用 VS Code（Seti）配色，与文件树行、设置里的「本地运行环境」同一套变量。
   头文件与通用文件不着色（跟文件树一致：它们不参与「这是哪种语言」的表达），
   于是落在上面那条 --icon-code 上。 */
.editor-tabs__icon.is-cpp {
  color: var(--icon-cpp);
}

.editor-tabs__icon.is-python {
  color: var(--icon-python);
}

.editor-tabs__icon.is-markdown {
  color: var(--icon-markdown);
}

.editor-tabs__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--text-dim);
}

/* 「磁盘已变更」：与未保存圆点同一个槽（stale 必然也是 dirty，所以它优先显示），
   靠琥珀色与灰色圆点区分。悬停 title 说明缘由，保存一次即消失。 */
.editor-tabs__stale {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--warn);
}

.editor-tabs__label {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 预览页签：斜体是唯一的视觉信号（VS Code 同款）。只动标签文字，
   不动图标/宽度 —— 页签栏那套宽度实测（HANDOFF 第 3 节）里的「strip 宽」是容器宽，
   与单张页签差几像素无关，照旧成立。 */
.editor-tabs__item--preview .editor-tabs__label {
  font-style: italic;
  /* 斜体末字的墨迹会往右悬垂一点点，而标签盒正好等于文字宽度、外面还盖着 overflow: hidden，
     不补出这点余量就会被裁掉一丝（真机反馈「斜体时被右边的 × 遮挡了一点」）。
     1–2px 不会被 pxtorem 转换（minPixelValue: 3），这里要的就是不随 UI 缩放的物理细余量。 */
  padding-right: 2px;
}

.editor-tabs__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  /* 15px：原来是 18px，真机反馈「关闭按钮比较大」——× 只有 12px（墨迹约 7px），
     18px 的框空得太多、hover 底色也显笨。图标尺寸不动（全应用的 AppIcon 尺寸都是
     不随 UI 缩放的裸 px，只改这一处会跟旁边的代码图标对不齐）。 */
  width: 15px;
  height: 15px;
  border-radius: 3px;
  opacity: 0;
  /* 藏着的时候也必须不许点：opacity: 0 的元素照样参与命中测试，而 × 正好长在页签
     最右端（15px 框 + 7px 右内边距），触屏上指腹一压就落在这里 —— 页签看着没变、
     却直接关掉了。露出来时才把指针收回来（见下面两条）。 */
  pointer-events: none;
}

/* 「悬停即露出」只给真能悬停的设备（鼠标 / 触控板）。触屏的 :hover 是在 touchstart
   那一刻就套上的：手指刚碰到页签、× 就现身并抢走这次点击，于是「点页签切换」变成
   「点 × 关页签」。触屏改走下面那条 —— 先点亮页签（选中态）再露出 ×，即
   「第一次只打开标签并显示关闭按钮，再点关闭才关闭」。 */
@media (hover: hover) {
  .editor-tabs__item:hover .editor-tabs__close {
    opacity: 0.75;
    pointer-events: auto;
  }
}

.editor-tabs__item--active .editor-tabs__close {
  opacity: 0.75;
  pointer-events: auto;
}

.editor-tabs__close:hover {
  opacity: 1;
  background: var(--bg-control-hover);
}

/* --------------------------------------------------- 选中页签与编辑区连成一片
   选中页签的底色（--bg-tab-active）与编辑区内芯（--bg-editor-pane）本来就是同一个值，
   两者之间却横着这根 1px 的 --border-soft —— 它画在 .editor-tabs 的 border 上，
   属于页签盒子的**外面**，页签铺再多底色也盖不住它。
   办法是把线从容器挪到条带自身：铺成底部 1px 的背景（background-attachment 默认 scroll，
   横向滚动时它不跟着跑），于是线落进页签盒子**里面** —— 不透明的选中页签正好盖住它，
   未选中的页签底色是透明的，线照旧露出来。
   设置与抽题同样适用（.settings-view 是透明的，底下就是编辑区那层底色），
   只有 md 例外（.is-md）：那边的页签底下压着 md 工具栏，连过去会串色。 */
.editor-pane:not(.is-md) .editor-tabs {
  border-bottom: none;
}

.editor-pane:not(.is-md) .editor-tabs__strip {
  background-image: linear-gradient(var(--border-soft), var(--border-soft));
  background-size: 100% 1px;
  background-position: 0 100%;
  background-repeat: no-repeat;
}

/* ------------------------------------------------------------ 页签进出场
   进场只淡入；退场脱离文档流后原地淡出（见 .tab-leave-active 与脚本钩子）。
   .tab-move 管「列表重排」时其余页签的位移——关闭页签后的补位、抽题页签插到
   设置前面，都靠它。缓动与侧栏折叠 / 胶囊指示器同源。 */
.tab-enter-active {
  transition: opacity 120ms ease-out;
}

.tab-leave-active {
  /* 脱离文档流：后面的页签当帧补位（由 .tab-move 补间），本元素留在原地淡出。
     left/top/width/height 由 onTabBeforeLeave 写成退场前的实测值，所以过渡期间
     盒子形状与原位一致，不会跳。 */
  position: absolute;
  transition: opacity 120ms ease-out;
}

.tab-enter-from,
.tab-leave-to {
  opacity: 0;
}

.tab-move {
  transition: transform 180ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

/* 预览页签顶替：进出场瞬时，宽度单独过渡（见脚本 onTabBeforeEnter）。
   不定义 -enter-from / -leave-to，新页签当帧就是全不透明的；退场那一帧仍脱离文档流
   并置透明，免得它还占着位、把新页签挤到旁边错一下位。
   刻意**不写** -move：不定义它 Vue 就跳过 move-FLIP，右侧页签不会再单独做一次位移补间，
   而是跟着新页签宽度过渡的逐帧 flex 重排一起滑 —— 全条栏是同一次收放，不会出现
   「新页签瞬变、邻签平滑」的割裂感。 */
.tab-instant-enter-active,
.tab-instant-leave-active {
  transition: none;
}

.tab-instant-leave-active {
  position: absolute;
  opacity: 0;
}
</style>
