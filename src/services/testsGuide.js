/**
 * 评测岛新手引导（2026-11-21 第二版：交互式）。
 *
 * 第一版是「看卡片」，用户没有操作感；这一版每一步都是**真机任务**：
 * 固定场景 → 用户自己做手势 → 检测状态变化自动进入下一步。
 *
 * 场景仍然只由步骤决定，不看用户当前开没开岛、停在哪一侧、侧栏收没收起：
 *   · `detach`：岛收回侧栏（侧栏拖出口必须存在）；
 *   · `move` / `resize`：岛开在编辑区、停靠态；
 *   · `toggle`：同上（双击折叠要从停靠态起手）；
 *   · `float`：岛处于浮岛态（最后一步拖浮岛）。
 * 教程结束只还原「开 / 关」：原本关着就关回去，原本开着或浮岛则保持演练后的位置。
 *
 * 【宽屏五步 / 窄屏四步】窄屏的岛固定停底部（见 editorPanes 的 autoTestsPaneSide），
 * 「拖到另一侧」在手机上只会把 430px 竖屏再竖着切成两条 215px 的窄栏 —— 不教这一步。
 * 窄屏另有一套文案（`steps.<key>.narrow`）：图标栏在屏幕边上、分隔线是横的、页头形态也不同。
 *
 * 只存一个「看过没有」的布尔值（`cp.testsGuideSeen`），不存进度。
 */
import { reactive } from 'vue'
import {
  closeTestsPane,
  collapseTestsPane,
  expandTestsPane,
  openTestsPane,
  testsLeaf,
  testsRail,
} from './editorPanes.js'
import { isNarrowLayout } from './shellSettings.js'

const SEEN_KEY = 'cp.testsGuideSeen'

function readSeen() {
  try {
    return window.localStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return false
  }
}

export const testsGuide = reactive({
  open: false,
  step: 0,
  /** 第几次开：重看引导（帮助面板）时 +1，让 TestsGuide 重新初始化一轮（重新量、重新轮询） */
  runId: 0,
  seen: readSeen(),
})

/** 宽屏五步：分出岛 → 换边 → 改大小 → 折叠 → 浮岛换边 */
const STEPS_WIDE = ['detach', 'move', 'resize', 'toggle', 'float']
/** 窄屏四步：换边这一步不教（岛固定停底部，竖切两半对手机没有意义） */
const STEPS_NARROW = ['detach', 'resize', 'toggle', 'float']

/**
 * 本次会话的步骤表。**按屏宽分两套**，key 而不是下标才是步骤身份 ——
 * 组件里的完成判定 / 落点 / 文案全部按 key 走，两套表才不会各写一份分支。
 * 读 `isNarrowLayout()` 会登记依赖，放进 computed 里能跟着旋屏 / 拉窗口实时换。
 * @returns {string[]}
 */
export function guideSteps() {
  return isNarrowLayout() ? STEPS_NARROW : STEPS_WIDE
}

/**
 * 侧栏开合的注入点：`panelVisible` 住在 App.vue（`usePersistentRef` 绑在组件生命周期上，
 * 不能挪到模块顶层），而引导在窄屏必须先把抽屉收起来 —— 窄屏的侧栏是**盖在编辑区上的**
 * 抽屉，不收起来编辑区整个在它下面，第一步既没有可拖的落点、也没有可看的编辑区
 * （与 App 的 collapsePanelForTreeDrag 同一个理由）。
 * 与 `testsPaneDrag.settle` 同一个体例：服务只说「要什么」，App 负责落位。
 */
export const testsGuideLayout = {
  /** @returns {boolean} 侧栏（窄屏的抽屉）此刻是否展开 */
  sidebarOpen: () => false,
  /** @param {boolean} open */
  setSidebarOpen: () => {},
}

/** 开场快照：只记「开没开 / 是不是浮岛 / 抽屉开没开」，中途退出时按它还原 */
let restore = null

export function openTestsGuide() {
  restore = {
    open: Boolean(testsLeaf()),
    floating: testsRail.floating,
    // 宽屏不碰侧栏，记 null 表示「不用还原」
    sidebarOpen: isNarrowLayout() ? testsGuideLayout.sidebarOpen() : null,
  }
  // 固定开场：岛在侧栏里、抽屉收着，第一步才有拖出口。重看引导也走这里 ——
  // 之前只关不摆，岛停靠 / 浮岛着的时候重看，第一步的高亮落点根本不存在。
  prepareTestsGuideScene('detach')
  testsGuide.step = 0
  testsGuide.open = true
  testsGuide.runId += 1
}

/**
 * 把场景摆到某一步的「动作之前」：
 *   detach：岛在侧栏；move / resize / toggle：岛停靠在编辑区；float：岛是浮岛。
 * 窄屏每一次都先把抽屉收起来（理由见 `testsGuideLayout`）。
 * @param {string} key 步骤 key（见 guideSteps）
 */
export function prepareTestsGuideScene(key) {
  if (isNarrowLayout()) testsGuideLayout.setSidebarOpen(false)
  if (key === 'detach') {
    if (testsLeaf() || testsRail.floating) closeTestsPane()
    return
  }
  if (key === 'float') {
    if (!testsLeaf() && !testsRail.floating) openTestsPane()
    if (!testsRail.floating) collapseTestsPane()
    return
  }
  if (testsRail.floating) expandTestsPane()
  if (!testsLeaf()) openTestsPane()
}

/**
 * 关闭引导并记为看过。
 * @param {{ keepScene?: boolean }} [options] `keepScene`：不按开场快照还原（走完全程时用，
 *   让用户留在自己刚摆出的位置）；中途退出 / 跳过仍按快照还原。
 */
export function closeTestsGuide(options = {}) {
  const keepScene = options?.keepScene === true
  testsGuide.open = false
  const snapshot = restore
  restore = null
  if (snapshot && !keepScene) {
    const wasOpen = snapshot.open || snapshot.floating
    const isOpen = Boolean(testsLeaf()) || testsRail.floating
    if (wasOpen && !isOpen) {
      openTestsPane()
      if (snapshot.floating) collapseTestsPane()
    } else if (!wasOpen && isOpen) {
      closeTestsPane()
    }
    // 窄屏开场抽屉是开着的：中途退出要还回去。**但岛上还开着就不还** ——
    // 窄屏没法并排，抽屉一展开就把刚摆出来的岛整块盖住（走完全程也不还，见 keepScene）。
    const islandLeft = Boolean(testsLeaf()) || testsRail.floating
    if (snapshot.sidebarOpen !== null && !islandLeft) {
      testsGuideLayout.setSidebarOpen(snapshot.sidebarOpen)
    }
  }
  if (testsGuide.seen) return
  testsGuide.seen = true
  try {
    window.localStorage.setItem(SEEN_KEY, '1')
  } catch {
    /* 隐私模式：只在内存里记这次 */
  }
}

export function setTestsGuideStep(step) {
  testsGuide.step = Math.min(guideSteps().length - 1, Math.max(0, step))
}
