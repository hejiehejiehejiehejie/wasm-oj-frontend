import { ref } from 'vue'

/**
 * 全局 UI 缩放（档位 100% / 110% / 125% / 150%，默认 110%）。
 *
 * 做法：CSS 里的 px 已经被 postcss-pxtorem 转成 rem（配置见 vite.config.js），
 * 缩放时只改根字号，整块界面跟着 rem 一起走。三条边界必须记住，它们决定了
 * 「什么时候该用 px()，什么时候什么都不用做」：
 *
 * 1. 物理尺寸永不缩放：鼠标坐标（clientX / clientY）、DOM 原生测量
 *    （getBoundingClientRect / offsetWidth / scrollHeight）、以及手指手势阈值
 *    （TAP_SLOP / DOUBLE_TAP_MS）——它们量的是屏幕与手指，与 UI 大小无关。
 * 2. 逻辑尺寸要手动补偿：Monaco 的 DOM 在 postcss 黑名单里（不吃 rem），
 *    喂给它的 fontSize / lineHeight / scrollbarSize / padding 都是真实 px，
 *    必须自己乘 scale（见 services/editorOptions.js）；JS 里写死的容器上限
 *    （如 TestCaseCard 的 MAX_IO_HEIGHT）同理。
 * 3. 被 JS 用 parseFloat 读的 CSS 变量（--tests-min-* ）留在 px 坐标系
 *    （见 vite.config.js 的 propList 排除名单），拖拽数学因此**不做 rem 反向换算**；
 *    但它们本身是「逻辑尺寸」（100% 下的设计值），要在使用处乘一次 scale —— JS 侧见
 *    App.vue 的 measureLimits()，CSS 侧靠 --ui-scale（见 applyUiScale 与本文件顶部说明）。
 */
export const BASE_FONT_SIZE = 16

/** 默认档位：localStorage 里还没有这条偏好（新用户 / 清过站点数据）时按它起步 */
export const DEFAULT_UI_SCALE = 1.1

/** 当前缩放比例。模块级单例：任何组件都能读，App.vue 负责把它同步成持久化偏好。 */
export const uiScale = ref(DEFAULT_UI_SCALE)

/** 可选档位（id 就是比例本身，便于直接落进 localStorage） */
export const UI_SCALE_OPTIONS = [
  { id: 1, label: '100%' },
  { id: 1.1, label: '110%（默认）' },
  { id: 1.25, label: '125%' },
  { id: 1.5, label: '150%' },
]

/**
 * 设计 px → 真实 px。只有「逻辑尺寸」才需要过这一层：喂给 Monaco API 的尺寸、
 * 以及 JS 里写死的容器上限。物理尺寸与 CSS 里的 rem 都不要调它。
 * @param {number} value 按 100% 设计的值
 */
export function px(value) {
  return value * uiScale.value
}

/** 落地一次缩放：改根字号（rem 的基准），并更新单例让 Monaco 那边跟着重排 */
export function applyUiScale(scale) {
  const next = Number.isFinite(scale) && scale > 0 ? scale : DEFAULT_UI_SCALE
  uiScale.value = next
  const root = document.documentElement
  root.style.fontSize = `${BASE_FONT_SIZE * next}px`
  // 同一份倍数再落一个无单位变量：给那些「参数是物理 px、但本身是逻辑尺寸」的地方用
  // （目前只有 .pane--tests 的最低宽度，见 App.vue 与 styles/base.css）
  root.style.setProperty('--ui-scale', String(next))
}

/** 读盘时把来路不明的值夹回合法档位（认不出来的退回默认档 110%） */
export function normalizeUiScale(value) {
  const number = Number(value)
  return UI_SCALE_OPTIONS.some((item) => item.id === number) ? number : DEFAULT_UI_SCALE
}