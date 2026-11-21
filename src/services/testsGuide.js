/**
 * 评测岛新手引导（2026-11-21 用户需求）：首次启动自动播一次，之后从「帮助」里可重看。
 *
 * 教程必须是**定死的**：全程只由步骤号决定场景，不看用户当前开没开岛、岛停在哪一侧、
 * 侧栏收没收起。做法是开场先把岛收回侧栏（第一步要有侧栏拖出口），点过第一步再统一
 * 开出来；结束 / 跳过时把开场前的开合状态还回去。播放期间由 TestsGuide 的遮罩挡住
 * 自由操作，五步的目标因此始终存在。
 *
 * 只存一个「看过没有」的布尔值，不存进度 —— 中途跳过或关掉页面，下次重看都从第一步开始，
 * 不会停在一个半截步骤上。键名与 shellSettings 那几项同一体例（`cp.` 前缀、直接读写
 * localStorage），但这里不需要响应式落盘：`seen` 只在启动与关闭时各读 / 写一次。
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
  seen: readSeen(),
})

/** 步骤总数：分出岛 → 换边 → 改大小 → 折叠/展开 → 浮岛换边 */
export const TESTS_GUIDE_STEPS = 5

/** 开场快照：只关心「开没开 / 是不是浮岛」，关掉时按它还原 */
let restore = null

export function openTestsGuide() {
  restore = { open: Boolean(testsLeaf()), floating: testsRail.floating }
  // 固定开场：岛在侧栏里，第一步永远有侧栏页头（或活动栏图标）可亮
  if (restore.open || restore.floating) closeTestsPane()
  testsGuide.step = 0
  testsGuide.open = true
}

/**
 * 每步的开场场景只由步骤号决定：
 *   · 第 0 步（含从第 1 步退回来）：岛必须在侧栏，侧栏拖出口才在；
 *   · 第 1 步起：岛必须在编辑区，页头 / 分隔条 / 浮岛才有实物可亮。
 */
export function prepareTestsGuideScene(step) {
  if (step <= 0) {
    if (testsLeaf() || testsRail.floating) closeTestsPane()
    return
  }
  if (testsRail.floating) expandTestsPane()
  if (!testsLeaf()) openTestsPane()
}

/** 关闭并记为看过（跳过 / 完成都走这里），同时还原开场前的开合状态 */
export function closeTestsGuide() {
  testsGuide.open = false
  const snapshot = restore
  restore = null
  if (snapshot) {
    if (snapshot.floating) {
      if (!testsLeaf()) openTestsPane()
      collapseTestsPane()
    } else if (!snapshot.open) {
      if (testsLeaf() || testsRail.floating) closeTestsPane()
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
  testsGuide.step = Math.min(TESTS_GUIDE_STEPS - 1, Math.max(0, step))
}
