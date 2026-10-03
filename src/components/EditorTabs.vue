<script setup>
/**
 * EditorTabs —— 编辑器标签栏（单编辑器组）。
 * - 点击切换活跃标签；中键关闭；× 按钮关闭；双击钉住预览页签。
 * - 预览页签（单击文件树开出来的那个）标签用斜体，见 workspace.previewTabId。
 * - dirty 文件显示圆点替代图标；活跃标签顶边取主题强调色。开着自动保存时不显示圆点
 *   （dirty 只存在几百毫秒，圆点只会闪一下），见下面的 isDirtyTab。
 * - 横向溢出时可横向滚动，不换行。
 *
 * 这里不再有运行按钮（2026-09-28 删）：运行入口只剩全局快捷键（⌘/Ctrl + Enter）
 * 与评测样例面板页脚那颗 ▶，两处都直连 App.vue 的 runAll，跑起来会自己把侧栏
 * 展开并切到「评测样例」，所以删掉页签栏这颗不会出现「点了看不到结果」。
 */
import { nextTick, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
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
} from '../services/editorViews.js'
import {
  closeTab,
  getNodeById,
  pinTab,
  setActiveTab,
  workspace,
} from '../services/vfs/workspaceStore.js'

function activate(id) {
  // 点文件页签＝要看代码：先把合成视图（设置 / 抽题）让开。已经停在同一个文件上时
  // activeId 不变，editorViews 里那条 watch 不会触发，所以这里必须显式让一次。
  deactivateViews()
  setActiveTab(id)
}

/** 页签上这个未保存标记要不要显示：开了自动保存就不显示（dirty 只存在几百毫秒） */
function isDirtyTab(id) {
  return !autoSaveEnabled.value && modelManager.isDirty(id)
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

/* 预览页签被顶替时走**瞬时切换**，不做过场：两个不同长度的文件名在同一个槽位交叉
   淡化会叠在一起、并让条带底色透出来（亮度塌陷），看着就是闪。store 的 openFile 把
   「删旧 + 在原位插新」压在同一个 tick 里完成，所以这里能靠数组 diff 认出来：长度不变、
   只有一处 id 不同。认出后把 TransitionGroup 的 name 换成 tab-instant —— 它只关掉
   这一格自己的进出场，其余页签因宽度差而换位的部分仍由 .tab-instant-move 补间。
   刻意**不给新页签做宽度动画**：页签宽度是按文件名自适应的，若让它从旧宽度逐帧收放，
   那颗正好被选中（有底色）的页签看起来就是「选中的标签在缩」，观感不对。
   固定标签的打开/关闭、中键关闭等仍然走 name="tab"，动画照旧。 */
const instantSwap = ref(false)

watch(
  () => workspace.openTabIds.slice(),
  (next, prev) => {
    if (next.length !== prev.length) return
    let diffCount = 0
    for (let i = 0; i < next.length; i += 1) {
      if (next[i] !== prev[i]) diffCount += 1
      if (diffCount > 1) return // 不止一处不同，不是预览顶替
    }
    if (diffCount !== 1) return
    instantSwap.value = true
    nextTick(() => {
      instantSwap.value = false
    })
  },
)
</script>

<template>
  <div class="editor-tabs">
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
    >
      <button
        v-for="id in workspace.openTabIds"
        :key="id"
        type="button"
        class="editor-tabs__item"
        :class="{
          'editor-tabs__item--active': id === workspace.activeId && !viewActive,
          'editor-tabs__item--preview': id === workspace.previewTabId,
        }"
        role="tab"
        :data-preview="id === workspace.previewTabId || undefined"
        :aria-selected="id === workspace.activeId && !viewActive"
        :title="getNodeById(id)?.path"
        @click="activate(id)"
        @dblclick="pinTab(id)"
        @mousedown="onMouseDown($event, id)"
      >
        <span
          v-if="isDirtyTab(id)"
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

      <!-- 抽题页签：默认安装的组件，题库就绪后才有侧栏入口（cfPickerTab.open 只由侧栏那颗 Codeforces 按钮点亮）。
           排在设置之前，与侧栏页头里「Codeforces 在齿轮左侧」的顺序一致 -->
      <button
        v-if="cfPickerTab.open"
        :key="'view:cfPicker'"
        type="button"
        class="editor-tabs__item"
        :class="{ 'editor-tabs__item--active': cfPickerTab.active }"
        role="tab"
        :aria-selected="cfPickerTab.active"
        :title="t('cf.button.label')"
        @click="activateCfPickerTab"
        @mousedown="onViewMouseDown($event, closeCfPickerTab)"
      >
        <AppIcon name="codeforces" :size="12" class="editor-tabs__icon" />
        <span class="editor-tabs__label">{{ t('cf.button.label') }}</span>
        <span
          class="editor-tabs__close"
          role="button"
          :aria-label="t('cf.tab.close')"
          @click.stop="closeCfPickerTab"
        >
          <AppIcon name="close" :size="12" />
        </span>
      </button>

      <!-- 设置页签：与代码文件同一个皮，排在文件之后（跟「新开的排最后」一致）。
           dirty 圆点不适用（设置是即时生效的，没有保存概念），所以图标固定是齿轮 -->
      <button
        v-if="settingsTab.open"
        :key="'view:settings'"
        type="button"
        class="editor-tabs__item"
        :class="{ 'editor-tabs__item--active': settingsTab.active }"
        role="tab"
        :aria-selected="settingsTab.active"
        :title="t('app.settings')"
        @click="activateSettingsTab"
        @mousedown="onViewMouseDown($event, closeSettingsTab)"
      >
        <AppIcon name="gear" :size="12" class="editor-tabs__icon" />
        <span class="editor-tabs__label">{{ t('app.settings') }}</span>
        <span
          class="editor-tabs__close"
          role="button"
          :aria-label="t('app.tabs.closeSettings')"
          @click.stop="closeSettingsTab"
        >
          <AppIcon name="close" :size="12" />
        </span>
      </button>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.editor-tabs {
  flex: 0 0 35px;
  display: flex;
  align-items: stretch;
  /* 横向滚动归内部的 .editor-tabs__strip */
  overflow: hidden;
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
  /* 切换页签：底色与文字色淡入淡出（高亮条见下面的 ::before）。
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
  border: none;
  border-right: 1px solid var(--border-soft);
  color: var(--text-dim);
  font-size: 12.5px;
  cursor: pointer;
}

.editor-tabs__item:hover {
  color: var(--text);
}

.editor-tabs__item--active {
  background: var(--bg-tab-active);
  color: var(--text);
  /* 让不透明的选中页签压在相邻页签之上：move-FLIP 补间时透明邻签会滑过它，
     抬一层就看不见那截重叠（见 .tab-instant-move 的说明）。 */
  z-index: 1;
}

/* 选中高亮条：所有页签都带这一枚（默认透明），切成选中态时靠 opacity 淡入 —— 
   比「只给选中项画、切换时凭空出现」更顺。position: relative 在基类上。 */
.editor-tabs__item::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--focus, var(--accent));
  opacity: 0;
  transition: opacity 150ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

.editor-tabs__item--active::before {
  opacity: 1;
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

/* 预览页签顶替：瞬时切换。不定义 -enter-from / -leave-to，新页签当帧就是全不透明的；
   退场那一帧仍脱离文档流并置透明，免得它还占着位、把新页签挤到旁边错一下位。 */
.tab-instant-enter-active,
.tab-instant-leave-active {
  transition: none;
}

.tab-instant-leave-active {
  position: absolute;
  opacity: 0;
}

/* 瞬时顶替时，两个文件名的宽度差会把右侧留存页签的落点顶开一截。新页签自己不做宽度
   动画（见脚本里 instantSwap 的说明），这一截位移就交给 move-FLIP 补间 —— 有这个 -move，
   Vue 才会给留存页签做位移，右邻页签平滑滑过去而不是当帧跳。
   页面里留存页签是透明的，滑动途中会与不透明的新页签叠在一起，靠 --active 的 z-index
   把新页签抬上来遮住它，看起来就是新页签把邻签「推」出去。 */
.tab-instant-move {
  transition: transform 180ms cubic-bezier(0.22, 0.61, 0.36, 1);
}
</style>
