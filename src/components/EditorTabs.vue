<script setup>
/**
 * EditorTabs —— 编辑器标签栏（单编辑器组）。
 * - 点击切换活跃标签；中键关闭；× 按钮关闭；双击钉住预览页签。
 * - **拖动页签改顺序**（2026-10-10 加；2026-10-20 十一改改「实时让位」）：按住页签横向拖，
 *   其余页签实时滑出空位（Chrome 原生手感），松手才提交顺序。文件页签与合成视图页签
 *   （设置 / 抽题）**混排在同一条序列里**、可以跨类换位（2026-10-11 起），
 *   顺序归 services/tabStrip.js 的 stripOrder —— 它只管顺序，写回时分发成 openTabIds
 *   （含持久化）与 viewOrder 两份，所以视图 id 仍然进不了 openTabIds（纪律见 tabStrip
 *   与 editorViews 的文件头）。手势与让位判据在 composables/useTabDrag.js，本文件只提供
 *   根元素、转交 pointerdown、渲染拖拽态，并在拖拽期间用 rAF 让分组包络线逐帧贴合。
 *   拖入 / 拖出分组（2026-10-20 十三改）也在拖拽中实时判定：归属翻转经 useTabDrag 的
 *   liveGroup 喂进包络线测量（线当场拉长 / 收缩），松手才随下标一起结算成员关系，
 *   被拖空的组到那时才摘除（拖拽期间芯片保留，反悔拖回还能吸进去）。
 * - **触屏**（同日补）：长按 450ms 起手，中间有「按住进度 → 就绪弹一下」两段反馈
 *   （`--pressing` / `--armed`，与文件树的同款逐条对应）；页签上还声明了
 *   `touch-action: pan-x` + `user-select: none` + `-webkit-touch-callout: none`。
 *   四条各自的理由写在样式表那两处注释里，**改拖拽时别忘了它们**。
 * - 预览页签（单击文件树开出来的那个）标签用斜体，见 workspace.previewTabId。
 * - dirty 文件显示圆点替代图标；活跃标签顶边取主题强调色。开着自动保存时不显示圆点
 *   （dirty 只存在几百毫秒，圆点只会闪一下），见下面的 isDirtyTab。
 * - 横向溢出时可横向滚动，不换行。
 *
 * 这里不再有运行按钮（2026-09-28 删）：运行入口只剩全局快捷键（⌘/Ctrl + Enter）
 * 与评测样例面板页脚那颗 ▶，两处都直连 App.vue 的 runAll，跑起来会自己把侧栏
 * 展开并切到「评测样例」，所以删掉页签栏这颗不会出现「点了看不到结果」。
 */
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue'
import AppIcon from './AppIcon.vue'
import ContextMenu from './ContextMenu.vue'
import TabGroupCard from './TabGroupCard.vue'
import { useTabDrag } from '../composables/useTabDrag.js'
import { t } from '../i18n/index.js'
import { autoSaveEnabled } from '../services/autoSave.js'
import * as tabGroups from '../services/tabGroups.js'
import { fileIconName } from '../services/fileIcons.js'
import { modelManager } from '../services/monaco/modelManager.js'
import {
  activateCfContestTab,
  activateCfPickerTab,
  activateSettingsTab,
  cfContestTab,
  cfPickerTab,
  closeCfContestTab,
  closeCfPickerTab,
  closeSettingsTab,
  deactivateViews,
  settingsTab,
  viewActive,
} from '../services/editorViews.js'
import { isViewId, moveStripItem, stripOrder } from '../services/tabStrip.js'
import { closeTab, getNodeById, pinTab, setActiveTab, workspace } from '../services/vfs/workspaceStore.js'

/** 激活一个文件页签（不挡拖动收尾的 click）—— pointerdown 抢焦与 click 共用 */
function activateNow(id) {
  // 点文件页签＝要看代码：先把合成视图（设置 / 抽题）让开。已经停在同一个文件上时
  // activeId 不变，editorViews 里那条 watch 不会触发，所以这里必须显式让一次。
  deactivateViews()
  setActiveTab(id)
}

function activate(id) {
  // 拖动收尾那一下会顺带来一个 click：吃掉它，否则拖完顺带把页签切过去
  if (consumeClickSuppression()) return
  activateNow(id)
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

/** 点视图页签本体：拖动收尾那一下会顺带来一个 click，先吃掉（与 activate 同一条路），
 *  否则拖完换位会顺带把视图切过去。 */
function onViewClick(view) {
  if (consumeClickSuppression()) return
  view.activate()
}

/**
 * 合成视图页签（设置 / 抽题 / 比赛）的渲染描述。图标 / 文案 / 开关都在这里现取，render 期间执行，
 * 所以语言切换、视图开关变化都会让它重算。
 * 「谁先开谁靠左」这条规矩已经不是这里的事了 —— 2026-10-11 起条带是一条**混排**序列，
 * 顺序归 services/tabStrip.js 的 stripOrder（文件页签与视图页签可以互相穿插）。
 */
function viewMeta(id) {
  if (id === 'cfPicker') {
    return {
      id,
      key: 'view:cfPicker',
      icon: 'codeforces',
      label: t('cf.button.label'),
      closeLabel: t('cf.tab.close'),
      active: cfPickerTab.active,
      activate: activateCfPickerTab,
      close: closeCfPickerTab,
    }
  }
  if (id === 'cfContest') {
    return {
      id,
      key: 'view:cfContest',
      icon: 'clock',
      label: t('cf.contest.title'),
      closeLabel: t('cf.tab.closeContest'),
      active: cfContestTab.active,
      activate: activateCfContestTab,
      close: closeCfContestTab,
    }
  }
  return {
    id,
    key: 'view:settings',
    icon: 'gear',
    label: t('app.settings'),
    closeLabel: t('app.tabs.closeSettings'),
    active: settingsTab.active,
    activate: activateSettingsTab,
    close: closeSettingsTab,
  }
}

/**
 * 条带的渲染单元：**一条混排序列**（tabStrip.stripOrder），文件页签与合成视图页签穿插排列，
 * 拖动因此能跨类换位。每一项打平成一个描述对象：文件那栏带上 `id` 与分组信息（组对象 /
 * 是否组首组尾 / 是否被折叠藏起来），视图那栏带上 viewMeta 的字段；组首前面还会插一枚
 * 「芯片」渲染单元（kind: 'chip'，不是页签 —— 不带 data-strip-id，拖拽的落点数学看不见它）。
 * `key` 三类各自用自己的（文件 = 节点 id，视图 = `view:<id>`，芯片 = `group:<id>`）。
 *
 * **折叠组的成员照样在这份列表里**（只是多一个 `hidden` 标志，渲染时 display: none）：
 * 拖拽的下标数学建立在「DOM 顺序 == stripOrder」这条等式上，把它们摘掉，按 DOM 数出来的
 * 下标就会与 stripOrder 错位（详见 useTabDrag 的 collectUnits 与 tabGroups 的文件头）。
 */
const stripItems = computed(() => {
  const out = []
  for (let i = 0; i < stripOrder.length; i += 1) {
    const id = stripOrder[i]
    if (isViewId(id)) {
      out.push({ kind: 'view', ...viewMeta(id) })
      continue
    }
    const group = tabGroups.groupOf(id)
    // 组首：自己是组员而左邻不是同组（芯片插在整段组的左缘）
    const runStart = !!group && tabGroups.groupOf(stripOrder[i - 1])?.id !== group.id
    if (runStart) {
      out.push({
        kind: 'chip',
        key: `group:${group.id}`,
        group,
        // 折叠着、而被它藏起来的正是当前打开的那个文件 → 芯片上给一圈环（样式里叫 holds-active）。
        // 十四改起折叠会把焦点转给相邻可见页签（transferFocusOutOfGroup），环只在
        // 「全折叠、无处可转」的极端情况出现；没有这圈环，用户会看到「编辑区还开着
        // 这个文件，页签栏里却找不到它」。
        holdsActive: !!group.collapsed && !viewActive.value && tabGroups.groupOf(workspace.activeId)?.id === group.id,
      })
    }
    out.push({
      kind: 'file',
      key: id,
      id,
      group,
      groupFirst: runStart,
      groupLast: !!group && tabGroups.groupOf(stripOrder[i + 1])?.id !== group.id,
      hidden: !!group?.collapsed,
    })
  }
  return out
})

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

// 拖动排序：条带上的页签都从这里起手（useTabDrag 认 data-strip-id，两类页签都带它），
// 条带是一条混排序列，所以文件页签与视图页签可以互相穿插换位。
// 放在 rootEl 之后 —— useTabDrag 拿的是这个 ref 对象，声明顺序上不能提前。
const { draggingId, pressingId, armedId, liveGroup, onTabPointerDown: dragPointerDown, consumeClickSuppression } =
  useTabDrag({
    rootEl,
    // 落盘走 tabStrip：由它改 stripOrder，再分部写回 openTabIds / viewOrder。
    // 第三参是被拖页签的**实时归属**（拖拽中包络线一直按它画的那份）：拖出组 = null、
    // 拖进组 = 组 id，在此结算成员关系（比松手后按落点猜的 syncAfterDrop 准 —— 用户
    // 特意拖出脱离阈值又拖回来的意图，只有拖拽过程知道）。
    onDrop: onStripDrop,
  })

/**
 * 页签 pointerdown（2026-10-20 十四改，需求 1「按下即获焦」）：pointerdown 瞬间就把
 * activeId 切过去，不等 click、也不等拖动阈值 —— 被拖页签当即穿上激活态样式，包络线
 * 经 MutationObserver 立即重绘成包裹它的形态，后续 pointermove 全程跟着走。两条豁免：
 * 中键（关页签，Chrome 同款不抢焦）与落点在关闭按钮上（`.editor-tabs__close` 的
 * click.stop 关闭，按下那一下不能顺带切走别的焦点）。走 activateNow 而不是 activate：
 * 这里的时机在拖拽开始前，绝不能吃掉拖拽收尾那 300ms 的 click 抑制窗口。
 */
function onTabPointerDown(event, id) {
  const hitClose = event.target.closest?.('.editor-tabs__close')
  if (event.button !== 1 && !hitClose) activateNow(id)
  // × 上按下连拖拽起手都不给：关按钮不是拖把柄，按住 × 横移不该拖走页签
  if (!hitClose) dragPointerDown(event, id)
}

/**
 * 视图页签（设置 / 抽题 / 比赛）pointerdown：同样按下即获焦（与文件页签同一套
 * 豁免判据），激活走 viewMeta 的 activate —— 视图是另一条激活轴，不能碰 setActiveTab。
 */
function onViewPointerDown(event, viewItem) {
  const hitClose = event.target.closest?.('.editor-tabs__close')
  if (event.button !== 1 && !hitClose) viewItem.activate()
  if (!hitClose) dragPointerDown(event, viewItem.id)
}

/** 拖动落盘：先照旧改顺序，再按实时归属结算被拖那张的成员关系，最后摘掉被拖空的组
 *  （拖拽期间空组的芯片故意保留 —— 反悔往回拖还能吸进去，松手才真正销毁）。
 *  instantSwap 顶起一拍：提交重排的那一帧 TransitionGroup 不发 FLIP —— 各页签从
 *  拖拽 / 让位位置到新车位的补间由 useTabDrag 的 settle() 统一做，两套动画叠着会打架。 */
function onStripDrop(id, index, liveGid) {
  instantSwap.value = true
  moveStripItem(id, index)
  if (liveGid === undefined) {
    // 没带实时归属（防御分支，正常提交路径都会带）：兜底走落点启发式
    tabGroups.syncAfterDrop(id)
  } else {
    const before = tabGroups.groupOf(id)?.id ?? null
    if (liveGid && liveGid !== before) tabGroups.addToGroup(id, liveGid)
    else if (!liveGid && before) tabGroups.removeFromGroup(id)
    tabGroups.removeEmptyGroups()
  }
  nextTick(() => {
    instantSwap.value = false
  })
}

// ------------------------------------------------------------ 右键菜单与分组卡片

/** 页签上的右键菜单（ContextMenu 是 Teleport 到 body 的通用件，文件树同款） */
const menu = ref(null)

/**
 * 页签右键：文件页签给分组两项 + 关闭；合成视图页签只有关闭。
 * @param {MouseEvent} event
 * @param {{kind: string, id: string, close?: Function}} item stripItems 里那一项
 */
function openTabMenu(event, item) {
  event.preventDefault()
  const items =
    item.kind === 'file'
      ? [
          tabGroups.groupOf(item.id)
            ? { id: 'remove-from-group', label: t('app.tabs.removeFromGroup') }
            : { id: 'add-to-new-group', label: t('app.tabs.addToNewGroup') },
          { id: 'div-close', divider: true },
          { id: 'close', label: t('app.tabs.closeTab') },
        ]
      : [{ id: 'close-view', label: t('app.tabs.closeTab') }]
  menu.value = { x: event.clientX, y: event.clientY, tabId: item.id, viewItem: item, items }
}

function onMenuSelect(id) {
  const m = menu.value
  // 选中即收：菜单留着手感很怪，而且它盖住的那片区域会吞掉下一次按下（实测踩过：
  // 开着菜单直接去拖页签，第一下 pointerdown 落在菜单上被dismiss，拖拽没起手）
  menu.value = null
  if (!m) return
  if (id === 'add-to-new-group') tabGroups.createGroupWithTab(m.tabId)
  else if (id === 'remove-from-group') tabGroups.removeFromGroup(m.tabId)
  else if (id === 'close') closeTab(m.tabId)
  else if (id === 'close-view') m.viewItem?.close?.()
}

/* ------------------------------------------------------------ 展开 / 折叠的动画
   （2026-10-20 加）折叠后的成员是 `display: none`，可它们在 TransitionGroup 眼里始终是
   「同一批 key 没进没出」—— 展开时 Vue 逐个记位置，隐藏元素量出来的 rect 全是 0，于是给
   每一张算出一段「从条带左端飞回来」的 move 补间，再叠上当场出现的最终宽度，看着就是乱飞。
   所以折叠 / 展开这一段**不走 TransitionGroup**：自己量宽度，用 Web Animations 逐帧改
   width + padding + opacity，兄弟页签跟着 flex 逐帧重排滑过去 —— 与 Chrome 收放标签组同款。
   三件配套，少一件就出问题：
   · 动画期间把组 id 记进 `animatingGroups`：模板据此**暂缓** is-group-hidden，否则
     display: none 在动画开始前就把元素整个拿掉，什么都看不见；
   · 同一个标志同时把 `:name` 切成 `tab-instant`（无 `-move` 类）：Vue 于是整段跳过
     move-FLIP，位移只由宽度动画驱动，不会两层叠加；
   · 展开时元素还藏着、量不到宽度 —— 先在同一个任务里临时放出来量自然宽度、随即压回 0
     （浏览器不会在任务中间绘制，看不到闪一下）。
   收尾统一走 finishGroupAnim：**先清内联 → 再让 animatingGroups 触发重渲染（折叠的
   display: none 落下去）→ 最后 cancel 动画**。顺序反了会在中间露一帧全宽（折叠）或
   宽度 0（展开）—— 清内联时动画的 fill: both 还托着终态，所以那时不会跳。 */
const animatingGroups = reactive(new Set())
const groupAnims = new Map()
const GROUP_ANIM_MS = 180

function memberElsOf(gid) {
  return rootEl.value
    ? [...rootEl.value.querySelectorAll(`.editor-tabs__item[data-group-id="${gid}"]`)]
    : []
}

function resetGroupAnimInline(el) {
  el.style.width = ''
  el.style.paddingLeft = ''
  el.style.paddingRight = ''
  el.style.overflow = ''
  el.style.opacity = ''
  el.style.display = ''
  el.style.pointerEvents = ''
}

/** 打断进行中的折叠 / 展开（连点芯片时）：取消动画、清内联、解锁重渲染 */
function cancelGroupAnim(gid) {
  const rec = groupAnims.get(gid)
  if (!rec) return
  for (const a of rec.animations) a.cancel()
  for (const el of rec.els) resetGroupAnimInline(el)
  groupAnims.delete(gid)
  animatingGroups.delete(gid)
}

function finishGroupAnim(gid, rec) {
  if (groupAnims.get(gid) !== rec) return
  for (const el of rec.els) resetGroupAnimInline(el)
  groupAnims.delete(gid)
  animatingGroups.delete(gid)
  nextTick(() => {
    for (const a of rec.animations) a.cancel()
  })
}

/**
 * 折叠组的焦点转移（2026-10-20 十四改，需求 2 的状态机）：焦点（activeId）在被折叠的
 * 组里 → 立即交给相邻**可见**页签（先右后左，寻址见 tabGroups.findNextVisibleTab，
 * anchor 传组内第一名成员的下标 —— 组内其余成员已被折叠隐藏，右扫天然越过整段组）；
 * 焦点不在组内则不动。全折叠（整条条带一张可见页签都没有）时不转移：activeId 留在被
 * 折叠的那张上，芯片的 holds-active 环就是这个状态的既有提示；置 null 会让「编辑区还
 * 开着文件、页签栏却没有激活态」，比现状更糟，Chrome 全折叠时同样保留。
 * @param {string} gid 刚被折叠的组
 */
function transferFocusOutOfGroup(gid) {
  if (tabGroups.groupOf(workspace.activeId)?.id !== gid) return
  const members = tabGroups.membersOf(gid)
  if (!members.length) return
  const first = Math.min(...members.map((m) => stripOrder.indexOf(m)))
  const next = tabGroups.findNextVisibleTab(first, workspace.activeId)
  if (next) setActiveTab(next)
}

/**
 * 芯片左键：展开 / 折叠这一组（Chrome 的手感 —— 芯片就是这一组的把柄）。
 * **菜单挪到右键**（2026-10-19 用户口径）：左键点芯片弹卡片会被读成「我想折叠，结果弹了个框」。
 * 芯片不是页签、不参与拖动，所以这里不用挡 click 抑制。
 * @param {{id: string, collapsed: boolean}} group
 */
function toggleGroup(group) {
  const gid = group.id
  cancelGroupAnim(gid)
  const els = memberElsOf(gid)
  if (!els.length) {
    tabGroups.toggleCollapsed(gid)
    transferFocusOutOfGroup(gid)
    return
  }

  const collapsing = !group.collapsed
  const widths = new Map()
  if (collapsing) {
    // 此刻还看得见，直接量（offsetWidth 不受 FLIP 的 transform 影响，量的就是布局宽度）
    for (const el of els) widths.set(el, el.offsetWidth)
  } else {
    // 还藏着：临时放出来量自然宽度，随即压回 0
    for (const el of els) {
      el.style.display = 'inline-flex'
      widths.set(el, el.offsetWidth)
    }
    for (const el of els) {
      el.style.width = '0px'
      el.style.paddingLeft = '0px'
      el.style.paddingRight = '0px'
      el.style.opacity = '0'
    }
  }
  for (const el of els) {
    el.style.overflow = 'hidden'
    el.style.pointerEvents = 'none'
  }

  animatingGroups.add(gid)
  tabGroups.toggleCollapsed(gid)
  // 焦点在被折叠的组里 → 立即转移给相邻可见页签（需求 2 的状态机）。必须在
  // toggleCollapsed 之后调：isHiddenTab 的判据吃的就是刚翻面的 collapsed 标志
  if (collapsing) transferFocusOutOfGroup(gid)

  nextTick(() => {
    const rec = { els, animations: [] }
    groupAnims.set(gid, rec)
    for (const el of els) {
      const natural = widths.get(el) ?? 0
      if (!natural) continue
      // 首尾两帧的 padding 与 .editor-tabs__item 的 `0 7px 0 10px` 对齐 ——
      // 宽度收到 0 时内边距也得跟着收，否则盒子的下限还留在 17px。
      const open = {
        width: `${natural}px`,
        paddingLeft: '10px',
        paddingRight: '7px',
        opacity: '1',
      }
      const shut = { width: '0px', paddingLeft: '0px', paddingRight: '0px', opacity: '0' }
      rec.animations.push(
        el.animate(collapsing ? [open, shut] : [shut, open], {
          duration: GROUP_ANIM_MS,
          easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
          fill: 'both',
        }),
      )
    }
    if (!rec.animations.length) {
      finishGroupAnim(gid, rec)
      return
    }
    Promise.all(rec.animations.map((a) => a.finished.catch(() => null))).then(() =>
      finishGroupAnim(gid, rec),
    )
  })
}

/* ------------------------------------------------ 分组包络线（SVG 统一绘制，2026-10-20 十改）
   Chrome 原生 Tab Group 的连续包络线：整条线（无激活 = 底部一条水平线；有激活 = 从线面
   经左下外扩脚、竖边、左上圆角、顶边、右上圆角、竖边、右下外扩脚回到线面的**一条连续
   path**）由一个盖在条带内容上的 SVG 图层统一画，几何全部现场量 DOM —— 此前「成员各画
   一段 inset 下划线 + 选中成员背景渐变描边 + 两只圆环脚伪元素 + 挖缺」的零散 CSS 已整段
   删除（用户口径：那样画左下 / 右下角会出现断裂和向内弯曲）。 */
const GROUP_LINE_R = 8
const groupLines = ref([])
const glineWidth = ref(0)
/** 上一次测量结果的签名。**必须比对后再写 ref**：groupLines 每次赋新数组都会触发组件
 *  重渲染，而 TransitionGroup 的 onUpdated 又会往条带上 append/remove 一个探测用克隆
 *  （hasCSSTransform），那是一次新的 DOM 变动 → MutationObserver → 再测量 → 再渲染
 *  —— 不设防的话，建组 / 拖拽之后的任何一次测量都会变成**每帧一次的永久重渲染循环**
 *  （2026-10-20 实测 1.2s 内 761 次 childList 变更，页签的 FLIP 过渡被它冻死在第一帧，
 *  currentTime 永远停在 0）。签名不变就不写 ref，循环在一轮后自然断掉。 */
let glineSig = ''

function measureGroupLines() {
  const strip = rootEl.value?.querySelector('.editor-tabs__strip')
  if (!strip) return
  const h = strip.clientHeight
  // 视觉几何：getBoundingClientRect 换算回条带**内容坐标**（含 scrollLeft）。用 rect 而不是
  // offsetLeft，是因为 rect 带着 transform —— 拖拽的实时让位、让位滑动的中途、WAAPI 展开
  // 动画改的宽度全都反映在 rect 上，包络线才能逐帧贴合页签的**视觉**位置（见拖拽的 rAF 循环）。
  const originX = strip.getBoundingClientRect().left - strip.scrollLeft
  const vLeft = (el) => el.getBoundingClientRect().left - originX
  const vWidth = (el) => el.getBoundingClientRect().width
  // 拖拽中的**实时归属预览**：被拖页签的 data-group-id 还是旧值（真实归属松手才提交），
  // 包络线必须按 useTabDrag 维护的实时归属画 —— 从旧组的成员里剔掉它、往实时归属的那组
  // 并入它（拖进哪组、线就当场拉长包到哪；拖出组，线当场收缩）。
  const dragEl = draggingId.value
    ? strip.querySelector(`.editor-tabs__item[data-strip-id="${draggingId.value}"]`)
    : null
  const rows = []
  // ⚠️ maxX 只能从**元素几何**取，绝不能拿 strip.scrollWidth 当初值：SVG 是条带的子元素，
  // scrollWidth 会把 SVG 自己的宽度算进去 —— 以 scrollWidth 为底就变成「glineWidth =
  // scrollWidth + 1 → SVG 变宽 1px → scrollWidth 跟着大 1 → 再测再 +1」的自增长反馈，
  // 每次测量都写 ref → 每帧重渲染 → TransitionGroup 的 onUpdated 克隆探测又喂 MutationObserver
  // → 死循环（2026-10-20 实测每帧 +1、1.2s 内 754 次 childList 变更，页签 FLIP 被 churn
  // 冻死在第一帧）。没有组时宽 0 即可 —— SVG 里没有任何路径，宽度无意义。
  let maxX = 0
  for (const chip of strip.querySelectorAll('.editor-tabs__chip[data-group-id]')) {
    // 折叠组不画（用户口径「展开之后才有下划线」；成员都 display:none，也量不到）
    if (chip.classList.contains('editor-tabs__chip--collapsed')) continue
    const gid = chip.dataset.groupId
    let members = [
      ...strip.querySelectorAll(`.editor-tabs__item[data-group-id="${gid}"]`),
    ].filter((el) => !el.classList.contains('is-group-hidden'))
    if (dragEl) {
      members = members.filter((el) => el !== dragEl)
      if (liveGroup.value === gid) members.push(dragEl)
    }
    if (!members.length) continue
    // 被拖页签并进来后视觉位置未必在 DOM 序末尾（可能还在滑），按视觉左缘排序再取两端
    members.sort((a, b) => vLeft(a) - vLeft(b))
    // 两端都向成员的视觉极值取：被拖页签从左 / 从右吸进来时，线的两端跟着它的视觉
    // 位置当场拉长，把它整个包进包络线（x0 取 min 是给「从左吸入、页签还压着芯片」
    // 那一段用的 —— 此时页签左缘在芯片左边）
    const x0 = Math.min(vLeft(chip), vLeft(members[0]))
    const x1 = Math.max(...members.map((el) => vLeft(el) + vWidth(el)))
    const active = members.find((el) => el.classList.contains('editor-tabs__item--active'))
    let d
    const fills = []
    if (!active) {
      d = `M ${x0} ${h - 1} L ${x1} ${h - 1}`
    } else {
      // r 预留：两只外扩脚各要向左右多占 r px，路径弧指令见样式表那段的总说明
      const left = vLeft(active)
      const right = left + vWidth(active)
      const r = GROUP_LINE_R
      d =
        `M ${x0} ${h - 1} L ${left - r} ${h - 1}` +
        ` A ${r} ${r} 0 0 0 ${left} ${h - 1 - r}` +
        ` L ${left} ${1 + r}` +
        ` A ${r} ${r} 0 0 1 ${left + r} 1` +
        ` L ${right - r} 1` +
        ` A ${r} ${r} 0 0 1 ${right} ${1 + r}` +
        ` L ${right} ${h - 1 - r}` +
        ` A ${r} ${r} 0 0 0 ${right + r} ${h - 1}`
      // 激活成员就是组尾时右脚落地即终点，别再往回画一段线
      if (x1 > right + r) d += ` L ${x1} ${h - 1}`
      // 两只脚的楔形另用一条 path 填激活底色 —— 页签元素的底色盖不到外扩圆角内部
      fills.push(
        `M ${left - r} ${h - 1} A ${r} ${r} 0 0 0 ${left} ${h - 1 - r} L ${left} ${h - 1} Z`,
      )
      fills.push(
        `M ${right + r} ${h - 1} A ${r} ${r} 0 0 1 ${right} ${h - 1 - r} L ${right} ${h - 1} Z`,
      )
      maxX = Math.max(maxX, right + r)
    }
    maxX = Math.max(maxX, x1)
    rows.push({ id: gid, colorVar: chip.style.getPropertyValue('--group-c'), d, fills })
  }
  const sig = rows.map((r) => `${r.id}|${r.colorVar}|${r.d}|${r.fills.join(';')}`).join('::')
  if (sig !== glineSig) {
    glineSig = sig
    groupLines.value = rows
  }
  const width = maxX + 1
  if (width !== glineWidth.value) glineWidth.value = width
}

// 量几何的调度口：DOM 任何相关变动（增删 / 换位 / 类名 / 文案宽度 / 改名）都汇到这里，
// rAF 合帧 —— MutationObserver 一帧内报 N 次也只量一次
let glineScheduled = false
function scheduleGroupLineMeasure() {
  if (glineScheduled) return
  glineScheduled = true
  requestAnimationFrame(() => {
    glineScheduled = false
    // **FLIP 挪位进行中不量**：此刻几何每一帧都在变，量了就会写 ref → 重渲染 →
    // TransitionGroup 的 onUpdated 又搅动这轮 FLIP（callPendingCbs / 重设 transform）→
    // 几何继续变 → 再量……实测能把 180ms 的挪位拖成永不收敛的亚像素蠕动，重渲染循环
    // 跟着永动。FLIP 结束摘 `tab-move` 类本身就是一次 DOM 变动，会再调度一次测量，
    // 终态几何在那时落定。拖拽 / 展开折叠走 glineTick 直连，不经过这里，不受影响。
    if (rootEl.value?.querySelector('.editor-tabs__strip .tab-move')) return
    measureGroupLines()
  })
}

// 展开动画是 WAAPI 逐帧改宽度（不走内联样式、MutationObserver 看不见）；拖拽的实时让位
// 虽然改的是内联 transform（会触发观察者），但包络线要**每帧**贴着页签走，不能靠观察者
// 合帧节流 —— 动画 / 拖拽期间一律挂 rAF 循环逐帧量。
let glineRafId = 0
/** 松手后的兜底跟随窗口（ms）：让位（200ms）与 settle 回弹（150ms）两段补间都在
 *  draggingId 归零**之后**才跑，循环不能跟着归零一起停 —— 否则包络线冻在动画起点的
 *  几何上，页签滑完了它才被下一次无关的 DOM 变动拽过去（2026-10-20 自查单第 3 项）。
 *  窗口盖住两段动画；结束时终态几何已被窗口内最后一次测量写进 ref，自然收敛。 */
const GLINE_SETTLE_MS = 350
let glineSettleUntil = 0
function glineTick() {
  measureGroupLines()
  glineRafId =
    animatingGroups.size || draggingId.value || performance.now() < glineSettleUntil
      ? requestAnimationFrame(glineTick)
      : 0
}
watch(animatingGroups, () => {
  if (animatingGroups.size && !glineRafId) glineRafId = requestAnimationFrame(glineTick)
})
// 拖拽起手就把包络线切到逐帧跟随：被拖页签（含它是激活组员时那只外扩脚）与让位滑动
// 的中途位置全部实时反映进 SVG 路径。松手 / 取消后循环**不**立刻停 —— 让位与 settle
// 两段补间还在跑，撑 GLINE_SETTLE_MS 的窗口继续逐帧贴，跑完自然收敛归零。
watch(draggingId, (v) => {
  if (v) {
    if (!glineRafId) glineRafId = requestAnimationFrame(glineTick)
    return
  }
  glineSettleUntil = performance.now() + GLINE_SETTLE_MS
  if (!glineRafId) glineRafId = requestAnimationFrame(glineTick)
})

let glineObserver = null
onMounted(() => {
  nextTick(measureGroupLines)
  // 页签宽度的变化源太多（改名、i18n、图标、关闭按钮显隐……），与其逐个 watch，
  // 不如直接监听条带子树的 DOM 变动统一调度
  const strip = rootEl.value?.querySelector('.editor-tabs__strip')
  if (strip) {
    glineObserver = new MutationObserver(scheduleGroupLineMeasure)
    glineObserver.observe(strip, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    })
  }
  window.addEventListener('resize', scheduleGroupLineMeasure)
})

onBeforeUnmount(() => {
  glineObserver?.disconnect()
  glineObserver = null
  window.removeEventListener('resize', scheduleGroupLineMeasure)
  if (glineRafId) cancelAnimationFrame(glineRafId)
})

/** 分组卡片（右键芯片弹出）；锚点是芯片自己的矩形下缘 */
const groupCard = ref(null)

function openGroupCard(group, event) {
  const rect = event.currentTarget.getBoundingClientRect()
  groupCard.value = { group, x: rect.left, y: rect.bottom + 6 }
}

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
    // 此刻 DOM 还是更新前的：按 id 找到即将被顶替的那一张 —— 混排之后不能再用 openTabIds
    // 的下标去 strip.children 上取（视图页签插在中间时两个下标不再对齐），改认 data-strip-id。
    const outdated = rootEl.value?.querySelector(
      `.editor-tabs__item[data-strip-id="${prev[changedAt]}"]`,
    )
    swapFromWidth = outdated?.offsetWidth ?? 0
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
           子项都带 key（文件 = 节点 id，视图 = `view:<id>`）。
           **拖拽期间（draggingId）也切 tab-instant**：实时让位是 JS 直接写 transform，
           而 TransitionGroup 每次 update 都会拿「缓存的旧位置」对比「当前 rect」——
           被我们挪开的页签会被它当成列表重排、倒放一段 .tab-move 把跟手位移整个抢走
           （实测 bbb 被拉回 8.9px、包络线跟着错位）。tab-instant 没有 -move 规则，
           Vue 检测不到过渡就直接跳过 FLIP。提交落盘那一拍另有 instantSwap 顶着。 -->
    <TransitionGroup
      tag="div"
      class="editor-tabs__strip"
      role="tablist"
      :aria-label="t('app.tabs.listLabel')"
      :name="instantSwap || animatingGroups.size || draggingId ? 'tab-instant' : 'tab'"
      @before-leave="onTabBeforeLeave"
      @enter="onTabEnter"
    >
      <!-- 一条混排序列（stripOrder）：每一格要么是文件页签、要么是合成视图页签，
           两类混着排、拖动能跨类换位。组首前面还会插一枚「分组芯片」（见 stripItems）。
           key 打在 template 上。 -->
      <template v-for="item in stripItems" :key="item.key">
        <!-- 分组芯片：Chrome 把它渲染成组前的一枚独立小圆（不是页签本体的一部分）。
             **左键 = 展开 / 折叠，右键 = 分组卡片**（2026-10-19 用户口径）。
             它不能被拖（没有 data-strip-id、不进 onTabPointerDown），但**让位序列算它**：
             页签拖过组边界时芯片要跟着滑，否则组包络线断开；折叠组的成员在
             useTabDrag.collectUnits 里反过来记在它名下，提交时由它展开换算下标。 -->
        <button
          v-if="item.kind === 'chip'"
          type="button"
          class="editor-tabs__chip"
          :class="{
            'editor-tabs__chip--named': item.group.name,
            'editor-tabs__chip--holds-active': item.holdsActive,
            'editor-tabs__chip--collapsed': item.group.collapsed,
          }"
          :style="{ '--group-c': `var(--group-${item.group.color})` }"
          :data-group-id="item.group.id"
          :title="item.group.name || t('app.tabs.groupChip')"
          :aria-label="item.group.name || t('app.tabs.groupChip')"
          :aria-expanded="!item.group.collapsed"
          @click.stop="toggleGroup(item.group)"
          @contextmenu.prevent="openGroupCard(item.group, $event)"
        >
          <span v-if="item.group.name" class="editor-tabs__chip-name">{{ item.group.name }}</span>
        </button>

        <button
          v-if="item.kind === 'file'"
          type="button"
          class="editor-tabs__item"
          :class="{
            'editor-tabs__item--active': item.id === workspace.activeId && !viewActive,
            'editor-tabs__item--preview': item.id === workspace.previewTabId,
            'editor-tabs__item--dragging': item.id === draggingId,
            'editor-tabs__item--pressing': item.id === pressingId,
            'editor-tabs__item--armed': item.id === armedId,
            'is-grouped': !!item.group,
            'is-group-first': item.groupFirst,
            'is-group-last': item.groupLast,
            'is-group-hidden': item.hidden && !animatingGroups.has(item.group?.id),
          }"
          :style="item.group ? { '--group-c': `var(--group-${item.group.color})` } : undefined"
          role="tab"
          :data-strip-id="item.id"
          :data-tab-id="item.id"
          :data-group-id="item.group?.id"
          :data-preview="item.id === workspace.previewTabId || undefined"
          :aria-selected="item.id === workspace.activeId && !viewActive"
          :title="getNodeById(item.id)?.path"
          @click="activate(item.id)"
          @dblclick="onTabDblClick(item.id)"
          @mousedown="onMouseDown($event, item.id)"
          @pointerdown="onTabPointerDown($event, item.id)"
          @contextmenu="openTabMenu($event, item)"
        >
          <span
            v-if="isStaleTab(item.id)"
            class="editor-tabs__stale"
            :title="t('app.tabs.diskChanged')"
            :aria-label="t('app.tabs.diskChanged')"
          ></span>
          <span
            v-else-if="isDirtyTab(item.id)"
            class="editor-tabs__dot"
            :title="t('app.tabs.dirty')"
          ></span>
          <!-- 文件 logo 与资源管理器同一份映射（services/fileIcons.js），dirty 时让位给圆点 -->
          <AppIcon
            v-else
            :name="tabIcon(item.id)"
            :size="12"
            class="editor-tabs__icon"
            :class="`is-${tabIcon(item.id)}`"
          />
          <span class="editor-tabs__label">{{
            getNodeById(item.id)?.name ?? t('app.tabs.untitled')
          }}</span>
          <span
            class="editor-tabs__close"
            role="button"
            :aria-label="t('app.tabs.closeTab')"
            @click.stop="closeTab(item.id)"
          >
            <AppIcon name="close" :size="12" />
          </span>
        </button>

        <!-- 合成视图页签（设置 / 抽题）：与代码文件同一个皮，位置由 stripOrder 决定，
             拖动可在整条序列里挪（含排到文件页签左边 / 中间）。
             图标 / 文案 / 开关由 viewMeta 现取，设置没有 dirty 圆点（即时生效，
             没有保存概念），所以图标固定是齿轮。 -->
        <!-- ⚠️ 必须是 v-else-if 而不是 v-else：前面还有「芯片」那一支 v-if，
             写成 v-else 的话芯片项会把视图按钮也渲染一份（空文案的幽灵页签，实测踩过） -->
        <button
          v-else-if="item.kind === 'view'"
          type="button"
          class="editor-tabs__item"
          :class="{
            'editor-tabs__item--active': item.active,
            'editor-tabs__item--dragging': item.id === draggingId,
            'editor-tabs__item--pressing': item.id === pressingId,
            'editor-tabs__item--armed': item.id === armedId,
          }"
          role="tab"
          :data-strip-id="item.id"
          :data-view-id="item.id"
          :aria-selected="item.active"
          :title="item.label"
          @click="onViewClick(item)"
          @mousedown="onViewMouseDown($event, item.close)"
          @pointerdown="onViewPointerDown($event, item)"
          @contextmenu="openTabMenu($event, item)"
        >
          <AppIcon :name="item.icon" :size="12" class="editor-tabs__icon" />
          <span class="editor-tabs__label">{{ item.label }}</span>
          <span
            class="editor-tabs__close"
            role="button"
            :aria-label="item.closeLabel"
            @click.stop="item.close"
          >
            <AppIcon name="close" :size="12" />
          </span>
        </button>
      </template>

      <!-- 分组包络线图层（2026-10-20 十改）：盖在条带内容上统一画各组的线与激活脚的楔形
           填充，几何由 measureGroupLines 现场量 DOM 生成（getBoundingClientRect 换算回
           条带内容坐标 —— 带着 transform，拖拽 / 让位的实时位置才能跟得上）。
           absolute 定位所以不占 flex 位；pointer-events:none 不挡命中。静态子元素给个固定
           key，TransitionGroup 不对它做进出场。 -->
      <svg
        key="group-lines"
        class="editor-tabs__gline"
        :style="{ width: `${glineWidth}px` }"
        aria-hidden="true"
      >
        <g v-for="line in groupLines" :key="line.id" :style="{ '--group-c': line.colorVar }">
          <path v-for="(fd, i) in line.fills" :key="i" class="editor-tabs__gline-fill" :d="fd" />
          <path class="editor-tabs__gline-stroke" :d="line.d" />
        </g>
      </svg>
    </TransitionGroup>

    <!-- 页签右键菜单（通用件，文件树同款）：分组两项 + 关闭 -->
    <ContextMenu
      v-if="menu"
      :x="menu.x"
      :y="menu.y"
      :items="menu.items"
      @select="onMenuSelect"
      @close="menu = null"
    />

    <!-- 分组卡片（点芯片弹出）：命名 / 换色 / 在组内新建 / 关闭组 / 取消分组 -->
    <TabGroupCard
      v-if="groupCard"
      :group="groupCard.group"
      :x="groupCard.x"
      :y="groupCard.y"
      @close="groupCard = null"
    />
  </div>
</template>

<style scoped>
.editor-tabs {
  flex: 0 0 35px;
  display: flex;
  align-items: stretch;
  /* 横向滚动归内部的 .editor-tabs__strip */
  overflow: hidden;
  position: relative;
  background: var(--bg-panel-head);
  /* 页签栏底下那条 1px（--border-soft）2026-10-19 删掉：Chrome 的页签条下面没有分隔线，
     而那根线压在浅色主题里正好读成一道「页签栏投下来的阴影」。现在靠底色差断句 ——
     栏底 --bg-panel-head、编辑区 --bg-editor-pane，选中页签与后者同色，直接连成一片
     （原先「把线挪进条带再让选中页签盖住」那套机制因此整套删了）。 */
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
  /* 左右各留 9px（外扩脚 r=8 + 描边各 1px）：组芯片可能顶到条带最左 / 最右，包络线的
     两只外扩脚要向组外伸 r，没这段预留会被 SVG 视口（x<0 直接裁）与滚动容器一起裁成
     平角（2026-10-20 自查单第 1 项）。条内的所有坐标数学 —— SVG 绝对定位、
     measureGroupLines 的 rect 换算、useTabDrag 的 offsetLeft 槽位 —— 全都以 padding 盒
     为原点，加 padding 不动它们的相对关系。 */
  padding: 0 9px;
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
  /* ---------------------------------------------------------- Chrome 风格的页签外形
     （2026-10-19 改）上圆角 8px、下沿齐平：选中的那张与下面的编辑区连成一片（底色的来由见
     「选中页签与编辑区连成一片」那块），底角再向外摊出一段凹弧 —— 就是浏览器里那张
     「从工具栏长出来」的标签，两只脚由下面 ::before / ::after 补（md 模式也画 —— 那边工具栏
     的底色同日改成了 --bg-editor-pane，与页签同色）。
     ⚠️ 不要改成四角全圆：页签是贴着编辑区上沿的，下圆角会在它与内容之间露出一条缝。 */
  border-radius: 8px 8px 0 0;
  /* 页签之间那条 1px 竖线（原 border-right: 1px solid var(--border-soft)）2026-10-10 去掉：
     相邻页签不再互相描边，三种态全靠底色与文字色区分 —— 静止「透明底 + --text-dim 文字」、
     悬停 --bg-tab-hover、选中 --bg-tab-active（2026-10-19 改圆角时一并保留这条口径，**没有**
     再加回分隔线）。
     注意 border: none 必须留着 —— 全局 button 样式带着边框，去掉会露出系统描边。 */
  border: none;
  color: var(--text-dim);
  font-size: 12.5px;
  cursor: pointer;
  /* --------------------------------------------------------- 触屏（2026-10-10 补）
     拖动排序在鼠标下能用、到真机上「长按半天没反应」，差的就是这三条 ——
     它们与文件树行 `.tree-item__row` 的 `touch-action: pan-y` 是同一套判据、方向相反。
     ⚠️ 无头探针里的合成触摸事件**不跑浏览器的手势识别器**，所以这三条在探针里全测不出来，
     只有真机能暴露；改页签拖拽时别把它们删了。
     · touch-action: pan-x —— 把「横向滑动」明确留给浏览器去滚页签条（**不能写 none**：
       条带是横向滚动容器，写 none 之后手指在页签上再也滚不动了）。顺带关掉这一块上的
       双指缩放 / 双击缩放：拖动中途若有第二根手指落下来，会立刻触发 pointercancel 把那一帧打断。
       触屏「长按起手后不让它滚」靠的是 useTabDrag 的非被动 touchmove 拦，不是靠这一条。
     · user-select / -webkit-user-select: none —— 长按起手那 450ms 里不许选中标签文字。
       iOS 一旦进入选词就会连 callout（放大镜 + 菜单）一起弹出来，拖拽当场变成选词；
       `-webkit-` 那条是给老 WebKit 的，只写标准属性在 iOS 上不生效。
     · -webkit-touch-callout: none —— 同上，iOS 专属：长按不许弹那个 callout。
       系统长按菜单（contextmenu）另外由 useTabDrag 从按下那一刻 preventDefault 掉。 */
  touch-action: pan-x;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
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

/* ------------------------------------------------------ 选中页签底下那两只「脚」
   （2026-10-19 加，Chrome 风格）选中页签与编辑区同色，若底角是直角，看着就是一块贴在
   页签条上的方片；Chrome 的做法是让底角先向外摊开、再拐下去接住工具栏，于是那张标签像
   「从内容区里长出来的」。做法：8×8 的方块里抠掉一个半径 8px 的四分之一圆 —— 剩下的正是
   凹弧**外面**那块面（左脚的填充靠近方块的右下角，右脚的靠近左下角），拼上去就是那道弧。
   - 位置在页签盒子**外面**（left/right: -8px），所以只能是伪元素；条带的横向溢出只在它自己的
     边缘处裁，相邻页签之间照样露得出来。
   - 指针穿透：它压在邻签的底角上，不关掉会白白吃掉邻签 8px 的点击区。
   - md 模式同样适用（2026-10-19 晚：`.editor-pane__bar` 改成与编辑区同色，脚接得住；
     原先那条 `.is-md` 下 `display: none` 的例外已删除）。 */
.editor-tabs__item--active::before,
.editor-tabs__item--active::after {
  content: '';
  position: absolute;
  bottom: 0;
  width: 8px;
  height: 8px;
  pointer-events: none;
}

.editor-tabs__item--active::before {
  left: -8px;
  background: radial-gradient(circle at 0 0, transparent 8px, var(--bg-tab-active) 8px);
}

.editor-tabs__item--active::after {
  right: -8px;
  background: radial-gradient(circle at 100% 0, transparent 8px, var(--bg-tab-active) 8px);
}

/* -------------------------------------------------------- 页签分组（SVG 连续包络线）
   （2026-10-19 加下划线版；2026-10-20 深夜十改按用户口径整体重写：「不要零散的 CSS
   border——那会让左下 / 右下角断裂、向内弯曲；用一个绝对定位、pointer-events:none 的
   SVG 图层统一绘制分组线条与激活标签背景」，Chrome 原生 Tab Group 的连续包络线效果。）
   七改 / 八改那套「成员各画一段 inset 下划线 + 选中成员背景渐变描边 + 两只 radial-gradient
   圆环脚伪元素 + 挖缺」已整段删除 —— 成员页签回到与普通页签完全相同的规则。
   画法（路径由 script 的 measureGroupLines 生成，模板见 .editor-tabs__gline）：
   · **无激活成员**：一条 path 只画底部水平线 `M 0 H-1 L W H-1`（x0 = 胶囊左缘，
     x1 = 组尾成员右缘，H = 条带高 35）。
   · **有激活成员**：一条连续 path —— 从 (x0, H-1) 水平画到 (left-r, H-1)，`A r r 0 0 0`
     上挑成左下外扩脚（圆心在 (left-r, H-1-r)，弧腹朝向页签），竖边到 (left, 1+r)，
     `A r r 0 0 1` 拐右上成左上圆角（圆心 (left+r, 1+r)，与页签自己的 8px border-radius
     同心同径，描边正好贴住页签顶角），顶边到 (right-r, 1)，`A r r 0 0 1` 拐右下圆角，
     竖边到 (right, H-1-r)，`A r r 0 0 0` 落成右下外扩脚，再水平画到 (x1, H-1)
     （激活成员就是组尾时右脚落地即终点，不再回画）。r = 8，线宽 2px，色 = 组色。
   · **激活背景**：两只脚的楔形区域（外扩圆角内部，页签盒子外面那 8px）另用一条 path
     填 --bg-tab-active；页签矩形自己的底色仍由页签元素的 background-color 画。
   · 几何现场量：成员 offsetLeft / offsetWidth 以条带（定位祖先）为基准，正好是 SVG 的
     内容坐标；SVG 随条带滚动，滚动中不必重算。重算时机见 script 的调度口
     （MutationObserver 汇总 DOM 变动 + 动画期间 rAF 逐帧 + resize）。
   · **只在展开时才画**：折叠组在 measure 里直接跳过（用户口径「展开之后才有下划线」）。
   · is-group-first / is-group-last 两个类仍打在模板上（组首组尾的结构信息，折叠替身
     矩形与拖拽判据都建立在「成员仍在 DOM 里」上，别顺手删；包络线本身不再消费它们，
     组尾的右下脚照画、包络自然收在组尾右缘）。 */
.editor-tabs__gline {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  /* 宽度由测量给（要盖到最右那只外扩脚；取的是元素几何的右缘，见 measureGroupLines
     —— 千万不能拿 scrollWidth 当底，SVG 自己就会把自己垫宽，见那边的注释） */
  pointer-events: none;
  /* 盖在成员之上：线要压住悬停底色、脚的楔形要盖住邻签的底 —— SVG 排在模板最后，
     DOM 序天然在成员之上。但 DOM 序只压得过**不抬层**的成员：被拖页签 z-index: 100
     （见 --dragging）、长按就绪页签 z-index: 2（见 --armed），都会把画在自己身上的
     线段盖掉 —— 拖着组内激活页签时，顶边与两段竖边正画在它身上，不抬层就成了
     「一拖起来包络线消失」（2026-10-20 用户报）。这里抬到 101，连被拖页签也盖住；
     图层本身 pointer-events: none，盖住谁都不挡命中。 */
  z-index: 101;
}

.editor-tabs__gline-fill {
  fill: var(--bg-tab-active);
}

.editor-tabs__gline-stroke {
  fill: none;
  stroke: var(--group-c);
  stroke-width: 2;
}

/* 折叠组的成员：留在 DOM 里、不占位置（摘出去会让拖动排序的下标与 stripOrder 错位，
   理由见 services/tabGroups.js 与 composables/useTabDrag.js 的文件头）。
   display: none 也让它们天然不参与命中测试 —— 藏起来的页签点不到、拖不到。 */
.editor-tabs__item.is-group-hidden {
  display: none;
}

/* ---------------------------------------------------------------- 触屏长按的两段反馈
   （2026-10-10 加，与文件树那套 FileTreeItem 的 --pressing / --armed 逐条对应）
   触屏借不到 hover，而从按住到「能拖」中间隔着 450ms 的等待 —— 这一段不给反馈，手感就是
   「按了没反应」。所以拆成两段（两个 id 只在 pointerType !== 'mouse' 时置位，鼠标路径不受影响）：
   - `--pressing`「还在等」：整块底色当进度条，从当前底色线性走到 --bg-hover，到点那一刻刚好走完
     （时长必须与 useTabDrag.js 的 LONG_PRESS_MS 一致，改一边就得改另一边）。
   - `--armed`「已经就绪」：弹一下，底色停在 --bg-hover 上，一直留到松手或真的开始拖。
     弹一下本身就是「长按成功了」的信号，不再叠一层别的色 —— 换成选中色（--bg-tab-active）
     会被读成「这个页签被选中了」，而此刻它其实只是「可以被拖」。
   为什么用 `--bg-hover` 而不是页签自己的 `--bg-tab-hover`（2026-10-10 实拍量出来的）：
   那一档只比栏底亮 / 深 6 阶（深色 #222225 → #28282b），进度走到一半实测只有 **3 阶**差别，
   等于没有反馈；而 `--bg-hover`（#323539 / #e8e8e8）与文件树那套按压进度是同一档，隔着 16 阶。
   另外它也必须**不等于** `--bg-tab-hover`：触屏浏览器在按下那一刻会补一个 :hover 把页签先染成
   悬停色，如果进度终点就是悬停色，那 450ms 里底色一点不动 —— 这正是下面双类选择器要防的同一件事。
   也不能用 `--bg-tab-active`：深色下它比栏底更暗（方向相反、看着像「凹进去」），还会被读成选中。
   两条都写成「元素 + 类」的双类 (0,2,0)：单类是 (0,1,0)，压不过上面 :hover / --active:hover；
   而触屏浏览器常常在按下那一刻就补一个 :hover，写成单类的话进度条一上来就被悬停色顶掉、根本
   出不来。还要**排在上面 --active 之后**：同为 (0,2,0) 靠源序取胜 —— 长按「当前选中那一张」时
   也得有反馈（少了它，`--active:hover` 会把进度色整个顶掉，选中的页签按下去一点动静都没有）。
   进度的起点就是它当时的底色，所以从 --bg-tab-active 走到 --bg-tab-hover 也是一条看得见的进度。
   刻意**不加投影**（文件树那一行有）：页签在 35px 的条里与左右邻签紧贴，往下打的投影会被
   `.editor-tabs` 的 overflow: hidden 从下沿切掉，只剩一圈脏边。 */
.editor-tabs__item.editor-tabs__item--pressing {
  background: var(--bg-hover);
  /* 线性（不加缓动）：进度条要走得均匀，到头才是「正好可以松手」的那一瞬。
     减弱动效时会被 base.css 的 prefers-reduced-motion 压成 0.01ms —— 那就只剩到点时的弹一下。 */
  transition: background-color 450ms linear;
}

.editor-tabs__item.editor-tabs__item--armed {
  /* 弹起来的页签要盖住左右邻签：它是 position: relative，靠 z-index 提到同层兄弟之上 */
  z-index: 2;
  background: var(--bg-hover);
  /* 只动 transform，页签盒子的宽度不变、邻签一个像素都不动，播完自己回到原样。
     放 animation 而不是 transition，是为了让它**只播这一次** —— 留在就绪态里等松手时
     不会再被任何属性变化重新触发。 */
  animation: tab-press-pop 220ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

/* 长按的两段反馈期间（触屏）把那两只脚藏起来：此刻整块底色已经换成 --bg-hover，
   脚还留着选中色，就成了两块挂在页签下面的补丁。 */
.editor-tabs__item--pressing::before,
.editor-tabs__item--pressing::after,
.editor-tabs__item--armed::before,
.editor-tabs__item--armed::after {
  display: none;
}

@keyframes tab-press-pop {
  0% {
    transform: scale(1);
  }
  40% {
    transform: scale(1.04);
  }
  100% {
    transform: scale(1);
  }
}

/* 被拖动的页签（2026-10-10 加；2026-10-20 十一改改实时让位）：不再是「留在原位压暗」，
   而是浮起来跟手 —— transform 由 useTabDrag 逐帧写（translate3d 锁 X 轴、钳在条带内容
   范围内），这里只负责抬层（盖过让位滑动的邻居）并**关掉一切过渡**：跟手优先级最高，
   任何 transform 过渡都会变成拖拽的手感延迟；底色过渡一并关（拖拽中悬停反馈本来就被
   下面的规则压掉）。z-index 100 只盖同层页签 —— 包络线图层比它更高（gline 的 101），
   画在被拖页签身上的顶边 / 竖边始终可见。 */
.editor-tabs__item--dragging {
  z-index: 100;
  cursor: grabbing;
  transition: none;
  will-change: transform;
}

/* 拖动中：整条栏换成抓取光标；指针划过沿途页签时不再给悬停反馈（注意力留给实时让位）。
   这里的 user-select 现在是**兜底**了 —— 每条页签自己已经常开 `user-select: none`（见基类里
   那组触屏声明），留着是防「拖拽时把标签文字拖出一片选区」在别的子元素上再冒出来。 */
.editor-tabs.is-dragging {
  cursor: grabbing;
  user-select: none;
}

/* 拖动中压掉沿途页签的悬停底色（注意力留给实时让位）。**必须排除当前选中那颗**：
   这一条的特异性是 (0,5,0)，高过 .editor-tabs__item--active:hover 的 (0,2,0)，
   不排除的话拖动期间当前页签会连选中底色一起被抹成透明。
   （2026-10-10 从同形态的 `:hover::after { scaleX(0) }` 版本改来 —— 那时它压的是悬停细线，
   而选中线画在另一个伪元素上，所以不排除也不会露馅；改成底色之后必须补这个 :not。） */
.editor-tabs.is-dragging .editor-tabs__item:not(.editor-tabs__item--active):hover {
  background: transparent;
}

/* 让位滑动（2026-10-20 十一改）：拖拽期间其余页签 / 芯片滑向自己在新虚拟序列里的槽位，
   过渡只挂 transform —— 时长与缓动是用户给的口径（200ms cubic-bezier(0.2, 0, 0, 1)），
   与 useTabDrag 文件头的描述互为镜像，改一边记得改另一边。被拖那一张用 :not 排除
   （它 transition: none，跟手优先），芯片没有拖拽态、不用排。 */
.editor-tabs.is-dragging .editor-tabs__item:not(.editor-tabs__item--dragging),
.editor-tabs.is-dragging .editor-tabs__chip {
  transition: transform 200ms cubic-bezier(0.2, 0, 0, 1);
}

/* -------------------------------------------------------- 分组芯片
   （2026-10-19 加，模仿 Chrome；2026-10-20 按用户截图改形）组前那枚独立小胶囊：高 20px
   （约条高的六成，与截图里那枚「123」胶囊在页签条里的占比一致）、**两端全圆的圆角矩形**，
   文字在胶囊里水平 + 垂直都居中（inline-flex 双向 center + 名字 span 的 text-align），
   不是页签 —— 不参与拖拽与激活。**左键 = 展开 / 折叠，右键 = 分组卡片**（同日按用户口径改）。
   没名字时 min-width 撑成正圆；九改起有无名字都吃组色底（用户口径「线和胶囊的颜色没有
   遵循选中的颜色」），深字 --tab-group-text 不变。 */
.editor-tabs__chip {
  flex: 0 0 auto;
  align-self: center;
  box-sizing: border-box;
  height: 20px;
  min-width: 20px;
  /* 左右各 6px **对称**：芯片要居中于左右两格之间的空隙（2026-10-20 用户口径
     「与左边标签和右边标签的间距不同」—— 原先是左 8 / 右 4，看着整体偏左）。 */
  margin: 0 6px;
  padding: 0;
  border: none;
  border-radius: 999px;
  /* 九改（2026-10-20 用户口径「线和胶囊的颜色没有遵循选中的颜色」）：底色改回组色
     --group-c —— 五改时按参考图给命名胶囊配的中性浅底 --group-chip-bg 作废。 */
  background: var(--group-c);
  color: var(--tab-group-text);
  font-family: var(--font-sans, system-ui);
  font-size: 12px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  /* 不能写 overflow: hidden —— 底下那条「把下划线接到胶囊左缘」的 ::before 画在盒子外面，
     会被裁掉。文字截断由 .editor-tabs__chip-name 自己管（它带着 overflow + ellipsis）。 */
  position: relative;
  cursor: pointer;
  transition: filter 120ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

/* 线不再由胶囊补（2026-10-20 十改）：五改时那道「跨过 6px 缝、把下划线接到胶囊左缘」
   的 ::before 已删 —— 包络线改由条带上的 SVG 图层统一画（x0 就取胶囊左缘），
   胶囊左缘到组尾右缘整条线一次画完，不再有成员 / 胶囊各画一段的接缝。
   折叠时 SVG 的 measure 直接跳过折叠组，「展开之后才有下划线」照旧成立。 */

.editor-tabs__chip:hover {
  filter: brightness(1.12);
}

/* 未命名的组没有文字，颜色就是它唯一的身份 —— 保留组色小圆（Chrome 同款）。
   有名字的胶囊九改起同样吃组色底（基础规则已改 --group-c，这里的覆盖只剩深字，
   过渡期中性底的说明已删）。 */
.editor-tabs__chip:not(.editor-tabs__chip--named) {
  color: var(--tab-group-text);
}

.editor-tabs__chip--named {
  padding: 0 9px;
  max-width: 140px;
  /* 圆角矩形 6px（2026-10-20 用户口径「--named 改为圆角矩形，r 角用项目里常见那个」）：
     6px 是项目里出现最多的小圆角（base.css 与各组件按钮 / 弹层同值）；全圆 999px
     只留给上面那颗无名字色点。 */
  border-radius: 6px;
}

/* 折叠着、而它藏起来的那批页签里有当前打开的文件：芯片外面套一圈组色环。
   没有这圈环，点完折叠会出现「编辑区还开着这个文件，条带上却找不到它」的错觉。
   环与芯片之间垫一层条带底色（两道 box-shadow 叠出来），不是描边 —— 芯片是纯色块，
   直接压一圈描边看着像尺寸缩水的洞。 */
.editor-tabs__chip--holds-active {
  box-shadow:
    0 0 0 2px var(--bg-panel-head),
    0 0 0 3px var(--group-c);
}

.editor-tabs__chip-name {
  max-width: 122px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  /* 胶囊里的文字水平居中（flex 的 justify-content 管整颗芯片，这条管截断后的文字块） */
  text-align: center;
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

/* --------------------------------------------- 选中页签与编辑区连成一片（不再需要额外处理）
   2026-10-19：页签栏底下那根 1px 的 --border-soft 已整条删掉（Chrome 的页签条没有分隔线），
   原先「把线从容器挪到条带自身、让不透明的选中页签盖住它」那套（含 .editor-pane:not(.is-md)
   上的两条规则）随之作废。现在选中页签的底色与编辑区内芯同值，底下又没有线，天然接得上。

   **md 模式也不再是例外**（同日稍晚）：`.editor-pane__bar` 的底色已改成 --bg-editor-pane，
   与选中页签同色，那两只「脚」在 md 页签上同样接得住，原先那条
   `.editor-pane.is-md .editor-tabs__item--active::before/::after { display: none }` 已删除。 */

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
