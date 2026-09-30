/**
 * mdView —— 题解（.md）编辑区的视图状态。
 *
 * 【两个互不相干的维度】
 * - mode：仅编辑 / 双栏 / 仅预览 —— 说的是「编辑区里摆什么」；
 * - fullscreen：是否让编辑区独占整个窗口（收掉侧栏、分隔条、页签）。
 * 刻意不做成第四个 mode：「全屏的仅预览」「全屏的双栏」都是正当诉求，
 * 把它们塞进同一个枚举就得再翻一倍（预览+全屏、双栏+全屏、编辑+全屏…）。
 *
 * 【为什么单独一个模块】
 * 1) 「全屏」要真的占满窗口：侧边栏、分隔条、编辑器页签都得让位。那些 DOM 长在
 *    App.vue 里、不在编辑器组件里，状态必须放在两边都读得到的地方；
 * 2) 「此刻到底算不算数」还要看两件事——活跃文件是不是 .md、设置视图有没有盖在上面。
 *    这条判断 App（藏不藏侧栏）与 EditorPane（分不分栏）都要用，各写一份迟早漂移，
 *    于是统一在这里算成 mdActive。
 *
 * 与 settingsTab.js 同一体例：纯 UI 状态的模块级单例。区别是这份要跨会话记住
 * （视图是使用习惯，不该每次打开都掉回默认），所以自带 localStorage 读写 ——
 * 不能走 usePersistentRef：它要等组件 onMounted 才播种，而 App 在 setup 期
 * （首帧之前）就得知道该不该把侧栏收起来。
 */
import { computed, reactive } from 'vue'
import { languageForPath } from './monaco/language.js'
import { settingsTab } from './settingsTab.js'
import { activeNode } from './vfs/workspaceStore.js'

const STORAGE_KEY = 'cp.mdView'
const DEFAULT_MODE = 'edit'

/** 摆什么。fullscreen 不在其中，见文件头 */
export const MD_VIEW_MODES = ['edit', 'split', 'preview']

/**
 * 轮换这三种摆法的键位（与 services/mdFormat.js 的 MD_SHORTCUTS 同一套写法）。
 * 跟着视图逻辑放在这里，是因为它切的就是这个模块的状态。
 */
export const MD_VIEW_SHORTCUT = 'Mod+Backslash'

/**
 * 读存档。
 *
 * 2026-09 的存档是一个字符串（'edit' | 'split' | 'preview' | 'fullscreen'），现在改存
 * `{ mode, fullscreen }`。旧值的换算：'fullscreen' 当时就是「全屏的仅编辑」，拆成
 * `edit + fullscreen`；其余三个原样。认得出来就认，认不出来一律回默认。
 */
function readView() {
  const fallback = { mode: DEFAULT_MODE, fullscreen: false }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === null) return fallback
    const value = JSON.parse(raw)
    if (value === 'fullscreen') return { mode: DEFAULT_MODE, fullscreen: true }
    if (typeof value === 'string') {
      return { mode: MD_VIEW_MODES.includes(value) ? value : DEFAULT_MODE, fullscreen: false }
    }
    if (value && typeof value === 'object') {
      return {
        mode: MD_VIEW_MODES.includes(value.mode) ? value.mode : DEFAULT_MODE,
        fullscreen: value.fullscreen === true,
      }
    }
    return fallback
  } catch {
    // 隐私模式 / 存档损坏：当作没存过
    return fallback
  }
}

export const mdView = reactive(readView())

function persist() {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ mode: mdView.mode, fullscreen: mdView.fullscreen }),
    )
  } catch {
    /* 存不进去就只在本次会话里生效 */
  }
}

/** @param {'edit' | 'split' | 'preview'} mode */
export function setMdView(mode) {
  if (!MD_VIEW_MODES.includes(mode) || mode === mdView.mode) return
  mdView.mode = mode
  persist()
}

/**
 * 挨个轮换：仅编辑 → 双栏 → 仅预览 → 仅编辑（⌘\）。
 * 只动 mode —— 与全屏那个开关互不干扰，「全屏的双栏」照样转得动。
 */
export function cycleMdView() {
  const next = (MD_VIEW_MODES.indexOf(mdViewMode.value) + 1) % MD_VIEW_MODES.length
  setMdView(MD_VIEW_MODES[next])
}

/** 全屏与视图模式是两个独立开关，切换全屏不会动 mode */
export function setMdFullscreen(value) {
  if (mdView.fullscreen === value) return
  mdView.fullscreen = value
  persist()
}

export function toggleMdFullscreen() {
  setMdFullscreen(!mdView.fullscreen)
}

/** Esc / 再次点那颗按钮：退出全屏。模式原样留着，回到进来之前那种摆法 */
export function exitFullscreen() {
  setMdFullscreen(false)
}

/** 活跃文件是不是题解（决定题解那一行工具栏在不在）。空路径不能喂给 languageForPath
 *  ——它内部会抛「非绝对路径」 */
export const mdFileActive = computed(() => {
  const path = activeNode.value?.path
  return path ? languageForPath(path) === 'markdown' : false
})

/**
 * 题解视图此刻算不算数。
 *
 * 两个回落条件都属于「这次不算数、但存档别动」：
 * - 设置视图盖在编辑器上时，编辑器整块是藏起来的，分栏/全屏都无从谈起；
 * - 活跃文件不是 .md（用户点了旁边的 .cpp）——选的视图照旧留着，切回题解就原样恢复，
 *   否则会出现「在全屏里点开一个 .cpp，侧栏和测试面板一起消失」这种事。
 */
export const mdActive = computed(() => !settingsTab.active && mdFileActive.value)

/** 真正生效的视图模式 */
export const mdViewMode = computed(() => (mdActive.value ? mdView.mode : DEFAULT_MODE))

/** 分栏：编辑器让出右半边 */
export const mdViewSplit = computed(() => mdViewMode.value === 'split')

/** 预览面板要不要在场（分栏与仅预览都要） */
export const mdViewPreview = computed(
  () => mdViewMode.value === 'split' || mdViewMode.value === 'preview',
)

/** 全屏编辑：App 据此收掉测试面板与分隔条，EditorPane 据此收掉页签栏 */
export const mdFullscreen = computed(() => mdActive.value && mdView.fullscreen)