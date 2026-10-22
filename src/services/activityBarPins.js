/**
 * 折叠图标栏（ActivityBar）的「组件目录」与「固定到图标栏」状态。2026-10-22 加。
 *
 * 【为什么单独一个 service】这份表同时被三处读：图标栏的右键菜单（列可固定的项）、
 * 图标栏上簇（渲染已固定的格）、组件菜单 ComponentsMenu（按类分的网格）。
 * 表原先进制在 ComponentsMenu 的 computed 里，再往图标栏抄一份的话，图标名 / 文案键 /
 * 可用判据三样迟早对不上 —— 所以把表收到这里，两处都从这里派生。
 *
 * 【`available()` 是「此刻装没装」，不是「能不能点」】Codeforces 看 `cfReady`
 * （模块下载完才亮），倒计时看 `countdown.installed`。没装的既不出现在组件菜单里、
 * 也不出现在右键菜单的可固定列表里；**已经固定过但后来被卸载**时，上簇那一格也不留 ——
 * 点了没反应的方块比少一格的代价更大（与组件菜单「不装就不留格子」同一条口径）。
 *
 * 【`active()` 只服务图标栏】折叠态下图标栏看不见页签栏，组件开没开只能靠那一格的
 * 提亮来说（与「组件」那一格原来的判据逐条一致）。
 *
 * 【落盘】`cp.activityBarPins`：字符串数组，元素是组件 id，**顺序即上簇里格子的顺序**。
 * 读盘时按本表过滤一遍：表里没有的 id（组件改名、旧存档）直接丢掉，
 * 别让它在竖条上占一格点了没反应的方块。云同步白名单不含它 —— 与本机的界面状态同一档。
 */
import { computed, ref, watch } from 'vue'
import { cfReady } from './cfRuntime.js'
import { countdown, openCountdown } from './countdown.js'
import { cfContestTab, cfPickerTab, openCfContestTab, openCfPickerTab } from './editorViews.js'

const STORAGE_KEY = 'cp.activityBarPins'

/**
 * 组件目录 —— **唯一出处**。分组结构照组件菜单的分组（Codeforces / 工具），
 * `labelKey` 一律是 i18n 键（组件里不许出现中文字面量）。
 */
export const COMPONENT_GROUPS = [
  {
    id: 'codeforces',
    labelKey: 'components.menu.codeforces',
    items: [
      {
        id: 'picker',
        icon: 'codeforces',
        labelKey: 'cf.menu.picker',
        run: openCfPickerTab,
        available: () => cfReady.value,
        active: () => cfPickerTab.active,
      },
      {
        id: 'contest',
        // 旗子（2026-10-22 由 clock 换过来）：clock 与倒计时的 timer 都是「圆表盘 + 指针」，
        // 缩到 20px 墨迹后分不出来。AppIcon 里 clock 保留（别的界面还在用）。
        icon: 'flag',
        labelKey: 'cf.menu.contest',
        run: openCfContestTab,
        available: () => cfReady.value,
        active: () => cfContestTab.active,
      },
    ],
  },
  {
    id: 'tools',
    labelKey: 'components.menu.tools',
    items: [
      {
        id: 'countdown',
        // 沙漏（2026-10-22 由 timer 换过来，理由同上：与 clock 太像）。
        // AppIcon 里 timer 保留 —— 设置里「运行时长」那一行还在用。
        icon: 'hourglass',
        labelKey: 'countdown.title',
        run: openCountdown,
        available: () => countdown.installed,
        active: () => countdown.open,
      },
    ],
  },
]

/** 扁平表（右键菜单与固定格都按 id 找） */
export const PINNABLE_COMPONENTS = COMPONENT_GROUPS.flatMap((group) => group.items)

const BY_ID = new Map(PINNABLE_COMPONENTS.map((item) => [item.id, item]))

/** 此刻装着的组件（组件菜单与右键菜单的可固定列表都按它过滤） */
export const availableComponents = computed(() => PINNABLE_COMPONENTS.filter((item) => item.available()))

/** 固定过的 id，顺序即上簇里的顺序 */
const pinnedIds = ref(load())
watch(pinnedIds, save, { deep: true })

/**
 * 上簇里真正要渲染的固定格：**已固定 且 仍装着**，顺序照 pinnedIds。
 * 窄屏的过滤不在这里做 —— 那是「布局形态」的事，由 ActivityBar 自己判
 * （本模块不 import shellSettings，免得 service 之间绕成环）。
 */
export const pinnedComponents = computed(() =>
  pinnedIds.value.map((id) => BY_ID.get(id)).filter((item) => item && item.available()),
)

export function isComponentPinned(id) {
  return pinnedIds.value.includes(id)
}

/** 勾 / 取消勾（右键菜单那一项走这里，别直接改 pinnedIds） */
export function togglePinnedComponent(id) {
  if (!BY_ID.has(id)) return
  pinnedIds.value = isComponentPinned(id)
    ? pinnedIds.value.filter((x) => x !== id)
    : [...pinnedIds.value, id]
}

function load() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // 去重 + 丢掉表里没有的 id（旧存档 / 组件改名）
    return [...new Set(parsed.filter((id) => BY_ID.has(id)))]
  } catch {
    return []
  }
}

function save() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pinnedIds.value))
  } catch {
    /* 隐私模式 / 配额满：只在内存里工作 */
  }
}
