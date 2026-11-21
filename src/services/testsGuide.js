/**
 * 评测岛新手引导（2026-11-21 第二版：交互式）。
 *
 * 第一版是「看卡片」，用户没有操作感；这一版每一步都是**真机任务**：
 * 固定场景 → 用户自己做手势 → 检测状态变化自动进入下一步。
 *
 * 场景仍然只由步骤号决定，不看用户当前开没开岛、停在哪一侧、侧栏收没收起：
 *   · 第 0 步：岛收回侧栏（侧栏拖出口必须存在）；
 *   · 第 1~3 步：岛开在编辑区、停靠态；
 *   · 第 4 步：岛处于浮岛态（第五步拖浮岛）。
 * 教程结束只还原「开 / 关」：原本关着就关回去，原本开着或浮岛则保持演练后的位置。
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

/** 五步：分出岛 → 换边 → 改大小 → 折叠 → 浮岛换边 */
export const TESTS_GUIDE_STEPS = 5

/** 开场快照：只记「开没开 / 是不是浮岛」，结束时按它还原开合状态 */
let restore = null

export function openTestsGuide() {
  restore = { open: Boolean(testsLeaf()), floating: testsRail.floating }
  // 固定开场：岛在侧栏里，第一步才有拖出口
  if (restore.open || restore.floating) closeTestsPane()
  testsGuide.step = 0
  testsGuide.open = true
}

/**
 * 把场景摆到某一步的「动作之前」：
 *   0：岛在侧栏；1~3：岛停靠在编辑区；4：岛是浮岛。
 */
export function prepareTestsGuideScene(step) {
  if (step <= 0) {
    if (testsLeaf() || testsRail.floating) closeTestsPane()
    return
  }
  if (step >= 4) {
    if (!testsLeaf() && !testsRail.floating) openTestsPane()
    if (!testsRail.floating) collapseTestsPane()
    return
  }
  if (testsRail.floating) expandTestsPane()
  if (!testsLeaf()) openTestsPane()
}

/** 关闭并记为看过；只还原开合：原本关着就关回去，原本开着就保持演练后的位置 */
export function closeTestsGuide() {
  testsGuide.open = false
  const snapshot = restore
  restore = null
  if (snapshot) {
    const wasOpen = snapshot.open || snapshot.floating
    const isOpen = Boolean(testsLeaf()) || testsRail.floating
    if (wasOpen && !isOpen) {
      openTestsPane()
      if (snapshot.floating) collapseTestsPane()
    } else if (!wasOpen && isOpen) {
      closeTestsPane()
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
