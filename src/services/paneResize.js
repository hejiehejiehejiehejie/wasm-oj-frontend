/**
 * paneResize —— 「分割条正在被拖」这一瞬时的界面状态（唯一真源）。
 *
 * 【为什么需要它】窗格的分割比一变，两片窗格**连同它们里面的整条页签栏**都要在
 * viewport 里整体挪位。而页签栏内的列表是 `<TransitionGroup>`：它每次 update 都拿
 * 「缓存的旧 rect」对比「当前 rect」，只要差出哪怕 1px 就当列表重排，倒放 180ms 的
 * `.tab-move` 把页签**拉回旧位置**。于是拖分割条时页签条自己跟手、里面的页签却慢半拍
 * （用户 2026-11-16 报「标签页栏中标签移动比较慢」，实测一帧最多差 39px，松手才归位）。
 *
 * 根因是 FLIP 用的是**视口坐标**：它分不清「页签在条带里换了位置」与「整条条带被祖先
 * 挪了」。真正的重排只发生在横轴上（让位 / 换位 / 关页签），所以**拖分割条期间**把
 * TransitionGroup 切到没有 `-move` 规则的 `tab-instant`（与拖页签时同一个开关，见
 * EditorTabs 模板里那段注释），FLIP 便不再抢位移；松手后自动切回去。
 *
 * 【谁在用它】
 *   · `components/EditorPaneGrid.vue`：`beginResize` / `endResize` 进出置位；
 *   · `components/EditorTabs.vue`：读它决定 TransitionGroup 的 `name`。
 * 只影响动画，不参与布局 —— 比例本身仍由 `editorPanes.setRatio()` 写。
 *
 * ⚠️ 侧栏那条分隔条（App.vue 的 `.splitter`）也在横轴上挪编辑区，但它只改 CSS 宽度、
 * 不惊动任何响应式状态，页签栏不会重渲染，也就不会 FLIP。真要给它也置位，得先确认
 * 页签栏在那条链路上确实会 update，否则只是白挂一个类。
 */
import { ref } from 'vue'

/** 分割条是否正在被拖动（true 期间页签栏切瞬时过渡，不发 FLIP） */
export const paneResizing = ref(false)

export function beginPaneResize() {
  paneResizing.value = true
}

export function endPaneResize() {
  paneResizing.value = false
}
