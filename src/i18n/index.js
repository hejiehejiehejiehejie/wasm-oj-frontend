/**
 * i18n —— 界面语言的单一出处。
 *
 * 只有两套语言、消息全是静态的，所以刻意不引 vue-i18n：一个查表函数 + `{n}` 插值 +
 * 极简复数（{ one, other }）就够了，省掉约 30KB 的运行时依赖。
 *
 * 【消息表怎么放】按域拆在 `messages/` 下，**每个文件里中英两栏写在一起**。
 * 这样改一句文案时中英就在隔壁，不容易只改一边造成漂移；而 `t('tests.addCase')`
 * 这种点分 key 的命名空间就是文件名。
 *
 * 【为什么不走 usePersistentRef】同 `cp.shortcuts`（见 HANDOFF 第 6 节）：
 * 界面语言必须在**任何组件挂载之前**就定下来（首帧渲染的语言要是对的，不能先闪一下中文），
 * 而 usePersistentRef 靠 `onMounted` 播种。所以这里自己读写 localStorage，
 * 初值同步算出来。
 *
 * 【命名纪律】界面上叫「**界面语言**」，键名是 `cp.uiLocale`。
 * 不要用 `cph.language` —— 那是「编辑器判题语言」留下的死键，语义完全不同
 * （见 HANDOFF 第 5 节坑 15，那里还明确写着「别把语言选择器加回来」，
 * 指的是判题语言，不是界面语言）。
 *
 * 【调用纪律】`t()` 读的是 `locale` 这个 ref，所以：
 * - 在**模板里**或 **computed 里**调用会正确跟随切换；
 * - 在 `<script setup>` 顶层或普通模块顶层调用只会取到「那一刻」的语言，
 *   数据驱动的表因此要存 **key**（如 `labelKey`）而不是算好的字符串，
 *   由消费处（模板 / computed）再 `t()` 一次。
 */
import { ref, watch } from 'vue'

import app from './messages/app.js'
import cf from './messages/cf.js'
import engines from './messages/engines.js'
import explorer from './messages/explorer.js'
import help from './messages/help.js'
import notifications from './messages/notifications.js'
import settings from './messages/settings.js'
import tests from './messages/tests.js'

/** 支持的界面语言。label 一律用**该语言自己的写法**（endonym），任何语言下都找得到自己，所以不翻译。 */
export const LOCALES = [
  { id: 'zh-CN', label: '简体中文' },
  { id: 'en', label: 'English' },
]

export const DEFAULT_LOCALE = 'zh-CN'

/** localStorage 键。刻意不复用已作废的 `cph.language`，见文件头说明。 */
export const LOCALE_STORAGE_KEY = 'cp.uiLocale'

const PARTS = [app, cf, engines, explorer, help, notifications, settings, tests]

/** locale → 扁平消息表。各域文件导出的是 `{ 'zh-CN': {...}, en: {...} }`，在这里按语言合并。 */
const TABLES = LOCALES.reduce((tables, { id }) => {
  tables[id] = Object.assign({}, ...PARTS.map((part) => part[id] ?? {}))
  return tables
}, {})

/** 判断一个来路不明的值是不是支持的 locale */
export function isLocale(value) {
  return typeof value === 'string' && Object.hasOwn(TABLES, value)
}

/**
 * 系统语言探测：`navigator.languages`（按偏好排序）里只要有中文就中文，否则英文。
 * 只看语言主标签（`zh-Hans-CN` / `zh-TW` 都算中文），不做简繁区分。
 */
function detectLocale() {
  if (typeof navigator === 'undefined') return DEFAULT_LOCALE
  const tags = [navigator.language, ...(navigator.languages ?? [])]
  const prefersChinese = tags.some((tag) => typeof tag === 'string' && /^zh\b/i.test(tag))
  return prefersChinese ? 'zh-CN' : 'en'
}

/** 读存档；没有存档或值认不出来都返回 null（交给 detectLocale 兜底） */
function readStoredLocale() {
  try {
    const raw = window.localStorage.getItem(LOCALE_STORAGE_KEY)
    if (raw === null || raw === undefined) return null
    const value = JSON.parse(raw)
    return isLocale(value) ? value : null
  } catch {
    return null
  }
}

/** 当前界面语言。模块级单例：任何组件、任何服务都能读，不用一路 prop 传下去。 */
export const locale = ref(readStoredLocale() ?? detectLocale())

/**
 * `<html lang>` 必须跟着界面语言走：它是无障碍与翻译工具的唯一依据，
 * 写死在 index.html 的 `zh-CN` 上会让英文界面被读屏按中文念。
 * 首帧之前设意义不大（爬虫不执行 JS、看到的仍是 index.html 里那个值），
 * 所以不额外加内联脚本 —— 只在这里设一次、之后跟随变化，**维持单一出处**。
 */
function applyLocale(value) {
  if (typeof document !== 'undefined') document.documentElement.lang = value
}

applyLocale(locale.value)
watch(locale, applyLocale)

/**
 * 切换界面语言。落盘失败（隐私模式 / 配额）不影响本次会话 —— 与
 * usePersistentRef 的取舍一致：先让界面用起来，存档是尽力而为。
 */
export function setLocale(next) {
  if (!isLocale(next)) return
  locale.value = next
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* 只在内存里生效 */
  }
}

/** 取词条：按 `a.b.c` 逐层下钻 */
function lookup(table, key) {
  let node = table
  for (const part of key.split('.')) {
    if (node === null || typeof node !== 'object') return undefined
    node = node[part]
  }
  return node
}

/** 插值：把 `{name}` 换成 params.name，缺参数时原样留着（开发期一眼看得见） */
function interpolate(message, params) {
  if (!params) return message
  return message.replace(/\{(\w+)\}/g, (whole, name) =>
    Object.hasOwn(params, name) ? String(params[name]) : whole,
  )
}

/**
 * 翻译一条文案。
 *
 * @param {string} key 点分 key，命名空间即 `messages/` 下的文件名
 * @param {Record<string, string | number>} [params] 插值参数；带 `n` 时还会用它选复数形式
 * @returns {string}
 */
export function t(key, params) {
  const active = TABLES[locale.value] ?? TABLES[DEFAULT_LOCALE]
  let message = lookup(active, key)

  if (message === undefined) {
    // 漏翻：退回中文，再不行就把 key 原样露出来。开发期一眼能看到，生产环境也不至于空一块。
    message = lookup(TABLES[DEFAULT_LOCALE], key)
    if (message === undefined) return key
  }

  // 复数：词条写成 { one, other }，按 params.n 选。英文用得上，中文两栏写一样的。
  if (message !== null && typeof message === 'object') {
    const n = Number(params?.n ?? 0)
    message = n === 1 ? message.one : message.other
  }

  return interpolate(message, params)
}

/** 组件里的惯用入口；不想解构时也可以直接 import { t } */
export function useI18n() {
  return { t, locale, setLocale, LOCALES }
}

/**
 * 取**整棵子树**而不是一条文案。
 *
 * 只给「内容是数据不是界面」的那种域用（目前只有 `help`：整组问答直接交给
 * HelpPanel 渲染，逐条 t() 反而绕）。返回值随 locale 变，所以调用方要包在
 * computed 里 —— 与 t() 的纪律一致。
 *
 * @param {string} domain `messages/` 下的文件名
 */
export function messages(domain) {
  const active = TABLES[locale.value] ?? TABLES[DEFAULT_LOCALE]
  return active[domain]
}
