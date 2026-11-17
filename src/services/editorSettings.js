/**
 * editorSettings —— 编辑器偏好的模块级单例。
 *
 * 原本这些状态（readEditorSettings / editorSettings ref / 主题套用 / 自动保存 / 持久化 /
 * updateEditorSettings）都写在 App.vue 里，App 是唯一持有方，面板只能靠 props 往下传、
 * 靠 emit('update:settings') 写回。抽成单例后，App.vue、EditorSettingsPanel 与快捷设置
 * 菜单（SettingsMenu）三方读的是同一份 ref、写的是同一个 updateEditorSettings，彼此不再
 * 需要「把这份数据经 prop / emit」来回搬运。
 *
 * 默认值、可选项表、逐键校验、以及「偏好 → Monaco 选项」的映射仍在 services/editorOptions.js，
 * 这里只负责「读盘 → 校验 → 运行期状态 → 落盘」这一层。迁移注释照搬自 App.vue，未改动逻辑。
 */
import { ref, watch } from 'vue'
import { EDITOR_SETTINGS_DEFAULTS, normalizeEditorSetting, themeScheme } from './editorOptions.js'
import { setAutoSaveEnabled } from './autoSave.js'
import { syncSystemBars } from './systemBars.js'

const EDITOR_SETTINGS_KEY = 'cp.editorSettings'
// 存档版本号用于「一次性迁移」，见 readEditorSettings：v4 及以前只有主题 id 换算，
// v5（2026-10-11）/ v6（同一天补）把「当前行突出」的旧默认 'all' 改写为 'line'。
// v5 与 v6 是同一条改写：v5 当天把「抬版本号」和「加改写分支」分成了两次编辑落地，
// 中间那段窗口里 HMR 重载过的页面会写进「版本号 = 5、值还是 'all'」的存档 —— 版本号
// 既然已经追上，< 的判定就永远不成立，那条改写对这份存档失效。抬到 6 把它捞回来。
// v7（2026-11-05）：语义级悬停改为默认开，把老存档里由默认值自动写入的那份 false
// 改成 true（原因见下面那条分支）。
// v8（2026-11-14）：光标平滑移动改为默认关，同理把老存档里那份自动写入的 true 改成 false。
// v9（2026-11-17）：底部状态栏改为默认关（分屏后只有焦点窗格挂，导致窗格间高度不一致），
// 同样把老存档里由默认值自动写入的 true 改成 false。
// **教训：动这个常量时必须和它对应的迁移分支在同一次编辑里落地，别分两步。**
const EDITOR_SETTINGS_VERSION_KEY = 'cp.editorSettingsVersion'
const EDITOR_SETTINGS_VERSION = 9
// 默认值、可选项表、逐键校验、以及「偏好 → Monaco 选项」的映射都在 services/editorOptions.js
const EDITOR_SETTING_KEYS = Object.keys(EDITOR_SETTINGS_DEFAULTS)

function readEditorSettings() {
  try {
    const raw = window.localStorage.getItem(EDITOR_SETTINGS_KEY)
    if (!raw) return { ...EDITOR_SETTINGS_DEFAULTS }
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return { ...EDITOR_SETTINGS_DEFAULTS }
    // 主题 id 只做一次换算，之后按键走白名单：
    // v3 之前主题只作用于编辑器（选项有 vs-dark / vs / hc-black），原本选浅色 vs 的迁到浅色；
    // v4（2026-09-29）起主题 id 去掉了 `cph-` 前缀，旧存档的 cph-light 照样认。
    // 其余旧值（vs-dark / hc-black / cph-dark）交给 normalizeEditorSetting 丢掉，回落到默认深色。
    // v5 / v6（2026-10-11）：'当前行突出' 的旧默认 'all' 会把行号栏一起铺上底色，新默认是 'line'。
    // 这条立刻读得到——存档里存的是旧默认 'all'，而存档值优先于 EDITOR_SETTINGS_DEFAULTS，
    // 不改写的话新默认对老用户等于不存在（写入方见下面 immediate 的那条 watch）。
    // v6 只是把这条改写再跑一遍（v5 的版本号先落地、改写分支后落地，中间被 HMR 重载写进过
    // 「版本号 5 + 值 'all'」的存档，见上面常量的注释）。改写本身是幂等的。
    // 换过之后版本号就是 6，之后再手动选 'all' 不会被这条覆盖。
    if (Number(window.localStorage.getItem(EDITOR_SETTINGS_VERSION_KEY)) < EDITOR_SETTINGS_VERSION) {
      if (parsed.theme === 'vs' || parsed.theme === 'cph-light') parsed.theme = 'light'
      if (parsed.renderLineHighlight === 'all') parsed.renderLineHighlight = 'line'
      // v7（2026-11-05，用户定「语义级悬停默认打开」）：存档里那份 false 是**默认值被
      // 深度 watch 自动写进去的**，不是用户的选择 —— 只改 EDITOR_SETTINGS_DEFAULTS 对
      // 老用户等于没改，所以在这里一次性改写。改写之后版本号就是 7，用户再手动关掉
      // 不会被这条覆盖（同 renderLineHighlight 那条的口径）。
      parsed.semanticHover = true
      // v8（2026-11-14，用户定「光标平滑移动默认关闭」）：与上一条同一个道理 —— 存档里的
      // true 是默认值被深度 watch 写进去的，只改 EDITOR_SETTINGS_DEFAULTS 对老用户无效。
      // 改写之后版本号就是 8，用户再手动打开不会被覆盖。
      parsed.cursorSmoothCaretAnimation = false
      // v9（2026-11-17，用户定「状态栏默认关闭」）：同 v7/v8 的口径 —— 存档里的 true 是
      // 默认值被深度 watch 写进去的。改写之后版本号就是 9，用户再手动打开不会被覆盖。
      parsed.statusBar = false
    }
    // 只采纳已知字段，并且逐键夹成合法值：历史遗留的过期配置（如已移除的 keybinding）
    // 会被 normalizeEditorSetting 丢掉，越界 / 认不出来的值一律退回默认。
    const merged = { ...EDITOR_SETTINGS_DEFAULTS }
    for (const key of EDITOR_SETTING_KEYS) {
      if (!(key in parsed)) continue
      const value = normalizeEditorSetting(key, parsed[key])
      if (value !== undefined) merged[key] = value
    }
    return merged
  } catch {
    return { ...EDITOR_SETTINGS_DEFAULTS }
  }
}

export const editorSettings = ref(readEditorSettings())

// 主题决定的是整套界面的配色：挂在 <html data-theme>（具体配色）与 <html data-scheme>
// （只声明明暗）两个属性上，由 CSS 变量接管；Monaco 那边通过同一个 id 对应的自定义主题
// 保持内芯同色。两个属性都要写 —— 前者选调色板，后者供「只关心明暗」的样式与逻辑读。
// `--bg-chrome` 这一支（窗口装饰色）另有两个去处 —— 都是「宿主画的那条栏」，
// 网页自己画不到，只能各走各的通道：
//   · 浏览器（装成应用后画窗口标题栏 / 系统栏）：写进 `<meta name="theme-color">`；
//   · 安卓壳的**系统状态栏**：`<meta>` 在 WebView 里没人读，得经原生送过去
//     （见 services/systemBars.js 与 src-tauri/src/system_bars.rs）。
// 色值仍然只定义在 base.css —— 这里一律现读现取，不在这条链上再抄一份常量。
watch(
  () => editorSettings.value.theme,
  (theme) => {
    const scheme = themeScheme(theme)
    document.documentElement.dataset.theme = theme
    document.documentElement.dataset.scheme = scheme
    const chrome = getComputedStyle(document.documentElement)
      .getPropertyValue('--bg-chrome')
      .trim()
    const chromeBar = document.querySelector('meta[name="theme-color"]')
    if (chromeBar && chrome) chromeBar.setAttribute('content', chrome)
    // 状态栏图标的明暗跟着**站内主题**走（不是系统深色模式），底色用同一支 --bg-chrome
    syncSystemBars(scheme === 'dark', chrome)
  },
  { immediate: true },
)

// 自动保存的开关跟着偏好走。另外两个离开时点（切页签 / 关页签）在 workspaceStore 里，
// 窗口失焦与页面切后台这两个只能挂在 DOM 上，见 App.vue 的 onMounted。
watch(() => editorSettings.value.autoSave, setAutoSaveEnabled, { immediate: true })

// 深度持久化到 localStorage；immediate 让首次访问也落盘。
watch(
  editorSettings,
  (value) => {
    try {
      window.localStorage.setItem(EDITOR_SETTINGS_KEY, JSON.stringify(value))
      window.localStorage.setItem(EDITOR_SETTINGS_VERSION_KEY, String(EDITOR_SETTINGS_VERSION))
    } catch {
      /* 隐私模式或配额已满：只在内存里工作 */
    }
  },
  { deep: true, immediate: true },
)

export function updateEditorSettings(value) {
  // 面板送的整份值也过一遍校验：数字输入框可以手打，越界值不该进存档。
  // 快捷菜单里改单项（主题 / 缩放）走的是单独 setter，但这里仍保持「逐键夹合法值」的同源口径。
  const merged = { ...EDITOR_SETTINGS_DEFAULTS }
  for (const key of EDITOR_SETTING_KEYS) {
    if (!(key in value)) continue
    const normalized = normalizeEditorSetting(key, value[key])
    if (normalized !== undefined) merged[key] = normalized
  }
  editorSettings.value = merged
}

/**
 * 快捷菜单用：单改一个键。与 updateEditorSettings 相比省得拼一份整对象，
 * 但要靠调用方保证 key 合法、值已夹过边界（主题用 THEMES 的 id，缩放走 uiScale 的档位）。
 */
export function setEditorSetting(key, value) {
  editorSettings.value = { ...editorSettings.value, [key]: value }
}