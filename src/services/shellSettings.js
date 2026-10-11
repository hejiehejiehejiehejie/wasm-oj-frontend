/**
 * shellSettings —— 「外壳」那一层偏好的模块级单例：侧边栏位置与全局界面缩放。
 *
 * 【为什么单独抽出来】这两项原本写在 App.vue 里（`cp.panelPosition` / `cp.uiScale`），
 * App 是唯一持有方，别的入口要改它们就只能往上 emit、再经 prop 传回来。设置下拉菜单
 * （`SettingsMenu.vue`）挂在侧栏页头与折叠后的图标栏里，离 App 隔着两层，为了改一次
 * 侧边栏位置去拉一条 emit 链不值得 —— 编辑器偏好抽到 `services/editorSettings.js`
 * 是同一个理由，那边注释里有更详细的说法。
 *
 * 抽成单例之后，App.vue 与菜单读的是同一份 ref、写的是同一个入口，
 * 「菜单改完 App 立刻跟着变」不需要任何同步代码。
 *
 * 【「外壳」指什么】属于整个界面、而不是某个文件或某种语言的偏好：侧边栏在左还是右、
 * 整套界面放多大。判据是「它会在很多意料之外的入口里被想起来要去改」。
 * 分工是：
 * - `editorSettings.js`：编辑器那一组偏好（Monaco 那 24 项）
 * - 本文件：外壳偏好
 * - `i18n/index.js` / `fileTemplates.js` / `useShortcutManager.js` 等：各自领域的偏好，
 *   本来就是模块级单例（自带持久化），不搬进来
 */
import { nextTick, ref, watch } from 'vue'
import {
  applyUiScale,
  DEFAULT_UI_SCALE,
  normalizeUiScale,
  uiScale as uiScaleSingleton,
} from '../composables/useUiScale.js'

/**
 * 两个键自己读写 localStorage，**刻意不用 usePersistentRef**。
 *
 * 那份 composable 的「首次访问也落盘」靠 `onMounted` —— 而服务层模块是在组件之外
 * 被 import 的，那里没有组件实例，那条钩子根本不会执行（Vue 只会给一句警告）。
 * 后果是第一次打开站点时不留下存档，回归脚本读 `cp.panelPosition` 得到 null。
 * 所以这里照 `editorSettings.js` / `i18n/index.js` / `fileTemplates.js` 那一体例：
 * 模块自己读盘，再用 `immediate` 的 watch 写回去（首值也立刻落盘）。
 */
const PANEL_POSITION_KEY = 'cp.panelPosition'
const UI_SCALE_KEY = 'cp.uiScale'

function read(key, fallback, revive) {
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null || raw === undefined) return fallback
    const value = JSON.parse(raw)
    return revive ? revive(value) : value
  } catch {
    return fallback
  }
}

function persist(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 隐私模式或配额已满：只在内存里工作 */
  }
}

/**
 * 本项目的核心布局偏好：'left' | 'right'，默认在左侧。
 *
 * 注意它决定的是**两栏谁先谁后**（App.vue 里的 order），与「侧边栏有没有折叠」
 * （App 自己的 panelVisible）不是一回事。
 */
export const panelPosition = ref(read(PANEL_POSITION_KEY, 'left', (value) => (value === 'right' ? 'right' : 'left')))
watch(panelPosition, (value) => persist(PANEL_POSITION_KEY, value), { immediate: true })

/**
 * 两档的取值名。**档位表的唯一出处在这里**（i18n 只管文案）：设置面板那个下拉与菜单的
 * 二级子菜单都 import 这一份，加第三档只改这里。顺序是「左 → 右」，与两栏的实际排布一致。
 */
export const PANEL_POSITIONS = [
  { id: 'left', labelKey: 'settings.option.sideLeft' },
  { id: 'right', labelKey: 'settings.option.sideRight' },
]

/**
 * 全局界面缩放（档位 100% / 110% / 125% / 150%，默认 100%）。
 *
 * CSS 的 px 已被 postcss-pxtorem 转成 rem，所以这里只需要写一次根字号；物理尺寸
 * 与拖拽数学都不受影响（三条边界见 useUiScale.js 顶部）。
 */
export const uiScalePref = ref(read(UI_SCALE_KEY, DEFAULT_UI_SCALE, normalizeUiScale))
watch(uiScalePref, (value) => persist(UI_SCALE_KEY, value), { immediate: true })

// 模块被 import 的那一刻就把缩放落到根字号上：早于首帧渲染，不会先按 100% 画一帧
// 再跳到目标档位（这条语句连同它的注释是从 App.vue 原样搬来的）
applyUiScale(uiScalePref.value)
watch(uiScalePref, applyUiScale)

/** 当前真实倍数（Monaco 侧要乘它）：与上面那个 ref 同一个单例，各处直接读它 */
export { uiScaleSingleton as uiScale }

/**
 * 布局对调那 280ms 的 settling 动画是不是还在播（动画见 App.vue 样式表的 `pane-settle`）。
 *
 * 它必须是个导出的 ref：写它的是本文件的 `setPanelPosition`，读它的是 App.vue 模板上
 * 那个 `is-swapping` 类 —— 两边之间没有组件边界，.props / emit 都无从下手。
 */
export const swapping = ref(false)

const SETTLE_MS = 280

/**
 * 把侧边栏换到另一侧（快捷键 `toggle-layout` 与设置面板那个下拉走这里）。
 *
 * 它只是「目标 = 另一边」的简写，真正的动作在 `setPanelPosition` —— 两个入口共用
 * 同一份动画实现，免得哪天只改了一处。
 */
export function flipPanelPosition() {
  setPanelPosition(panelPosition.value === 'right' ? 'left' : 'right')
}

/**
 * 指定侧边栏在哪一侧（设置菜单二级里那两档走这里）。
 *
 * 关键约束：这里只改 flex-direction / order，DOM 结构与 Monaco 实例都不动，
 * 所以切换布局不会销毁重建编辑器（不会闪屏）。改这块时别引入 `v-if`。
 *
 * 选的与当前相同时什么都不做 —— 用户点的是已经生效的那一档，那不是「再翻一次」。
 */
export function setPanelPosition(next) {
  if (next !== 'left' && next !== 'right') return
  if (next === panelPosition.value) return
  const apply = () => {
    panelPosition.value = next
  }
  // 不支持 View Transitions 的浏览器：靠自己的 settle 动画补这一段
  if (typeof document.startViewTransition !== 'function') {
    apply()
    swapping.value = true
    window.setTimeout(() => {
      swapping.value = false
    }, SETTLE_MS)
    return
  }
  // View Transitions 路径：只翻一次状态，位置与宽度由浏览器按快照补间
  document.startViewTransition(() => {
    apply()
    return nextTick()
  })
}
