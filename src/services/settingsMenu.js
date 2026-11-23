/**
 * settingsMenu —— 齿轮下拉菜单的结构表，以及每一行「改的是哪一份偏好」。
 *
 * 【为什么单独一个文件】`SettingsMenu.vue` 想只做一件事：把这张表画出来。
 * 哪个开关写哪个键、哪个子菜单有几档、点了要不要留在原地，全在这里 —— 加一项不必碰
 * 组件。与 `EditorSettingsPanel` 的 EDITOR_GROUPS 是同一体例（表描述界面，组件渲染表）。
 *
 * 【表里为什么全是函数】每一项都要读「此刻的值」，所以读过 staleness 的那一刻就过期了：
 * read / checked 必须是函数，由模板在渲染时调用（Vue 因此能追到依赖）。
 * 而 `labelKey` 一律存 key 不存字符串 —— 与别处同一条 i18n 纪律（见 i18n/index.js）。
 *
 * 【`when`：这一行此刻在不在】可选，缺省就是在。是个**函数**（同上：要读此刻的值），
 * 组件按它过滤整张表 —— 于是「有条件才出现的一行」也留在表里，不必让组件知道任何业务判据。
 * 用它的正是下面那几颗**一次性的安装行**（装成应用 / 拿浏览器插件）：它们的出现条件
 * 一头挂在浏览器的能力上、一头挂在「装没装」上，两者都会在会话中途变。
 *
 * 【写就一定经过原有单一出口】这里没有一个字面量 localStorage 键：
 * - 编辑器偏好 → `services/editorSettings.js` 的 setEditorSetting
 * - 侧边栏位置 / 窄屏折叠方向 / 缩放 → `services/shellSettings.js`
 * - 模板开关 → `services/fileTemplates.js`
 * 所以菜单改完，**设置面板里同一行立刻跟着变**（读的是同一份 ref），不需要同步代码。
 *
 * 【菜单里刻意没有「界面语言」】2026-10-14 按用户要求把这行删了：菜单只留「当场就想改」的
 * 那几项，而界面语言是个改一次基本不再动的选择。唯一入口留在设置面板的「外观」组
 * （`EditorSettingsPanel` 的 locale 下拉，与菜单原先读的是同一份 `i18n` 状态）。
 * 别以「菜单少了一行」为由加回来。
 *
 * 【四种控件】
 * - `switch`：二值，一级行末尾就是那只开关，点整行翻面。适合的正是「启用模板」这类
 *   本身就是「开或不开」语义的项。
 * - `toggle`：两档一键切换，行尾一颗钮显示当前档（如「‹ 左侧」），点一下翻到另一档
 *   —— 侧边栏位置与窄屏折叠方向用这个（2026-10-30 起，原先是 radio 二级：两档的切换
 *   是「当场就想改」的动作，多开一层子菜单反而绕）。
 * - `radio`：点开二级子菜单再选。主题（十档色卡）与「设置分类」仍用它 —— 档位多、
 *   一排放不下才需要一层二级；两档的项一律走上面的 `toggle`，别退回去。
 *   选完默认**菜单不关** ——
 *   调缩放 / 换主题这类动作常常要连着试几次，关掉反而碍事。要连菜单一起收的行
 *   （「设置分类」—— 它把人送到设置面板去）在表里标 `closes: true`。
 * - `stepper`：数值 ±1，缩放那样有档位的用 radio，只有字号这个连续量用它。
 * - `cloud`：二级不是档位列表而是**一个小表单**（填用户名 → 导入 / 登录 → 取码后原地变
 *   验证码那一步）。只有「同步设置」这一行用它（这一行在菜单里叫「同步设置」，进了设置
 *   面板那一栏仍叫「云端同步」，2026-10-11 用户定的，见 i18n 的 `menu.cloudSync`）：它是
 *   唯一一个「要点好几下、还要跟服务端来回」的设置项。表单的状态与动作在
 *   `services/cloudSession.js`，与设置面板共用同一份。
 */
import { EDITOR_SETTING_RANGES, THEMES } from './editorOptions.js'
import { editorSettings, setEditorSetting } from './editorSettings.js'
import { openSettingsTab } from './editorViews.js'
import { setTemplatesEnabled, templatesEnabled } from './fileTemplates.js'
import { UI_SCALE_OPTIONS } from '../composables/useUiScale.js'
import {
  CASE_VIEWS,
  caseView,
  isNarrowLayout,
  NARROW_COLLAPSE_SIDES,
  PANEL_POSITIONS,
  narrowCollapseSide,
  panelPosition,
  setCaseView,
  setNarrowCollapseSide,
  setPanelPosition,
  uiScalePref,
} from './shellSettings.js'
import { appInstalled, canInstall, install, MANUAL_INSTALL_BROWSER } from '../composables/useInstallPrompt.js'
import { extensionInfo } from '../composables/useCompanionBridge.js'
import { fireSectionGuide } from './installGuides.js'
import { openFeedback } from './feedback.js'
import {
  EXTENSION_ROUTES,
  downloadExtensionPackage,
  isExtensionOutdated,
  openExtensionStore,
} from './extensionPackage.js'

/** 百分比显示：放在一起是为了「菜单与设置面板两处口径一致」（面板那边叫 scaleLabel） */
const scaleLabel = (scale) => `${Math.round(scale * 100)}%`

/**
 * 「设置分类」二级里每一档的图标 —— 与设置面板左侧导航 `EditorSettingsPanel` 的 `SECTIONS`
 * 一一对应（同一套 id、同一颗图）。表在这里而不是组件里，理由同整张菜单：加一档只改表。
 * 分类 id 与面板那张表本来就各存一份（顺序也一样），图标跟着 id 走，别只给其中一处加。
 */
const SECTION_ICONS = {
  appearance: 'sliders',
  editor: 'code',
  templates: 'file',
  shortcuts: 'keyboard',
  judge: 'check',
  cloud: 'cloud',
  app: 'install',
  extension: 'plugin',
  help: 'help',
}

/**
 * 「装着的插件比本站发的旧」—— 版本号来自扩展自报（`cp-info` 的 `info.version`），比对逻辑
 * 与设置面板共用 `extensionPackage.js` 的 `isExtensionOutdated`（唯一出处，别在这里再抄一份）。
 * 没探到扩展时返回 false，那种情况归上面那两颗「安装 / 下载」的行管。
 */
const extensionOutdated = () => isExtensionOutdated(extensionInfo.value?.version ?? '')

/** 字号夹在合法区间里：与设置面板那个数字框共用 editorOptions.js 的同一份区间 */
function stepFontSize(delta) {
  const [min, max] = EDITOR_SETTING_RANGES.fontSize ?? [8, 40]
  const next = editorSettings.value.fontSize + delta
  setEditorSetting('fontSize', Math.min(max, Math.max(min, next)))
}

/** 界面缩放没有连续区间：± 只在档位表里挪一格（1 → 110% → 125% → 150%），两端停住 */
function stepUiScale(delta) {
  const index = UI_SCALE_OPTIONS.indexOf(uiScalePref.value)
  if (index < 0) return // 读盘已做 normalize，这里只是兜底
  const next = UI_SCALE_OPTIONS[index + delta]
  if (next !== undefined) uiScalePref.value = next
}


/**
 * 一级菜单的每一行。
 *
 * `divider` 那两项没有 id，因此组件里一律用 `row.id ?? index` 当 key（与 ContextMenu 同款）。
 *
 * @type {Array<Record<string, any>>}
 */
export const SETTINGS_MENU_ROWS = [
  {
    id: 'theme',
    kind: 'radio',
    labelKey: 'settings.appearance.theme.label',
    // 档位表复用的就是设置面板那个下拉的两档（editorOptions.js 的 THEMES）
    options: () => THEMES.map(({ id, labelKey }) => ({ id, labelKey })),
    current: () => editorSettings.value.theme,
    select: (id) => setEditorSetting('theme', id),
  },
  {
    // 缩放走离散档位（UI_SCALE_OPTIONS），所以 ± 是在档位表里挪一格，到两端就停住；
    // 与字号那行同一种交互（两颗按钮 + 中间读数），不再是展开二级选档
    id: 'uiScale',
    kind: 'stepper',
    labelKey: 'settings.appearance.uiScale.label',
    value: () => scaleLabel(uiScalePref.value),
    step: stepUiScale,
  },
  {
    id: 'fontSize',
    kind: 'stepper',
    labelKey: 'settings.appearance.fontSize.label',
    value: () => editorSettings.value.fontSize,
    step: stepFontSize,
  },
  {
    // 两档一键切换：行尾一颗钮显示当前档，点一下翻到另一档（SettingsMenu 的 trigger
    // 与这颗钮走同一动作）。档位表与设置面板的单颗钮共用 PANEL_POSITIONS。
    id: 'panelPosition',
    kind: 'toggle',
    labelKey: 'settings.appearance.panelPosition.label',
    options: () => PANEL_POSITIONS,
    current: () => panelPosition.value,
    select: (id) => setPanelPosition(id),
  },
  {
    // 只在窄屏（手机 / 平板竖屏）出现：折叠后的图标栏贴工作区下沿还是上沿。
    // 宽屏上这一项是**空转**的（折叠后是竖条，没有上下之分），所以整行跟着窄屏判据显隐
    // （2026-10-13 用户要求；判据见 shellSettings.js 的 isNarrowLayout，设置面板那一栏同一口径）。
    // 注意别把它当成「hide 掉一个动作」：值本身照旧持久化 / 走云端同步，只是宽屏不给入口。
    // 两档一键切换，与「侧边栏位置」同一种控件（2026-10-30 起，原先是 radio 二级）。
    id: 'narrowCollapseSide',
    kind: 'toggle',
    when: () => isNarrowLayout(),
    labelKey: 'settings.appearance.narrowCollapseSide.label',
    options: () => NARROW_COLLAPSE_SIDES,
    current: () => narrowCollapseSide.value,
    select: (id) => setNarrowCollapseSide(id),
  },
  {
    // 评测样例视图（2026-11-19 用户要求加进设置菜单）：卡片流 / 分项标签两档一键切换。
    // 档位表与设置面板「外观」那颗段钮共用 CASE_VIEWS，改完 TestPanel 当场换壳。
    id: 'caseView',
    kind: 'toggle',
    labelKey: 'settings.appearance.caseView.label',
    options: () => CASE_VIEWS,
    current: () => caseView.value,
    select: (id) => setCaseView(id),
  },
  { kind: 'divider' },

  {
    id: 'templatesEnabled',
    kind: 'switch',
    labelKey: 'settings.templates.enable.label',
    checked: () => templatesEnabled.value,
    toggle: () => setTemplatesEnabled(!templatesEnabled.value),
  },
  {
    // 2026-11-16 用户要求：把「自动保存」换成「底部状态栏」。两者同属「当场就想改」的开关，
    // 换的是这一格摆谁；`autoSave` 本身没删，入口仍在设置面板「编辑器」组（键与设置面板
    // 那一行完全同一份，`settings.editor.statusBar.label` 两处共用，不必新写文案）。
    id: 'statusBar',
    kind: 'switch',
    labelKey: 'settings.editor.statusBar.label',
    checked: () => editorSettings.value.statusBar,
    toggle: () => setEditorSetting('statusBar', !editorSettings.value.statusBar),
  },
  { kind: 'divider' },

  {
    id: 'cloud',
    kind: 'cloud',
    // 菜单里叫「同步设置」；`settings.section.cloud`（「云端同步」）是给设置面板那一栏与
    // 「设置分类」二级用的，两处刻意不同名（2026-10-11）
    labelKey: 'settings.menu.cloudSync',
  },

  /**
   * 下面五颗是**一次性的动作**，不是偏好：把本站装成应用、把浏览器插件拿到手 / 换成新版。
   * 出现条件全在 `when` 里，一句话概括：**能装、而且还没装** —— 装好了就整行消失，菜单里不留
   * 一颗点了没用的按钮（同一时刻最多看到其中两颗，因为插件的两颗按机器二选一）。
   * 这两件事都在「设置面板里能找到」的基础上再往前一步：菜单是顺手的地方，不必为此专门切到设置页。
   *
   * 【插件的四颗为什么分成「安装 / 下载」与「更新」两对（2026-10-12 用户要求）】它们各是
   * **两种状态**的同一件事：没探到扩展 → 装（AMO 一键装 / 下 zip 手动加载），探到旧版 → 换新版。
   * 更新那一对**不能收起来** —— Chromium 没有商店可点，菜单这颗下载就是拿新包的唯一入口，
   * 装了旧版的人若看不到它，只剩「有新版」这个事实可读、没有任何途径拿到新包（与设置面板
   * 「装包行不能收」是同一条判据）。反过来「装好了且是最新版」四颗全不出现。
   *
   * 【词上只分「没装 / 旧版」两种（2026-10-20 用户要求）】更新那一对统一叫「更新浏览器插件」
   * （原来 Chromium 那颗叫「重新下载浏览器插件」，用户指出这与没装时的「下载浏览器插件」
   * 分不开）；Firefox 去 AMO、Chromium 重下 zip 的区别只在**动作**，不再落在词上。
   */
  {
    id: 'installApp',
    kind: 'action',
    /**
     * 「装成应用」：判据直接用 `canInstall` —— 它同时要求「引擎有可用的一键安装」「此刻真的
     * 可一键装」「还没装」，正好就是这一行要的语义，而且与设置面板那颗按钮**同一份状态**
     * （模块级单例，见 useInstallPrompt.js）。Firefox / Safari 上这个事件永远不会来，
     * 所以那两台不会出现这一行；装过之后它自己消失。
     */
    when: () => canInstall.value,
    labelKey: 'settings.menu.installApp',
    run: () => install(),
  },
  {
    id: 'installGuide',
    kind: 'action',
    /**
     * 三星 Internet 专用的一行（2026-10-14 加，用户报「三星浏览器里设置菜单中没有安装为应用
     * 的按钮」）：那台引擎的一键入口拿不到（属性在、事件不来，见 `MANUAL_INSTALL_BROWSER`），
     * 上面那颗按设计不会出现 —— 给不了按钮就至少给一条**走在正确的路上**的引导。文案与设置
     * 面板「应用」栏那颗「安装引导」读同一份（`installGuides.js` 的 `fireSectionGuide`），
     * 只是把入口挪到顺手的地方。装好之后整行消失（与上面那颗同一条规矩：不留点了没用的东西）。
     */
    when: () => MANUAL_INSTALL_BROWSER && !appInstalled.value,
    labelKey: 'settings.app.install.guide',
    run: () => fireSectionGuide('app'),
  },
  {
    id: 'installExtension',
    kind: 'action',
    /** 还没探到扩展、且这台机器**确实有** AMO 这条路（Firefox，含安卓 Firefox） */
    when: () => !extensionInfo.value && EXTENSION_ROUTES.value.includes('firefox'),
    labelKey: 'settings.menu.installExtension',
    run: () => openExtensionStore(),
  },
  {
    id: 'updateExtension',
    kind: 'action',
    /** 装着但比本站发的旧 → 去 AMO 拿最新版（那个页面永远是「最新版」，不必带版本号） */
    when: () => extensionOutdated() && EXTENSION_ROUTES.value.includes('firefox'),
    labelKey: 'settings.menu.updateExtension',
    run: () => openExtensionStore(),
  },
  {
    id: 'downloadExtension',
    kind: 'action',
    /** 同上，但这台机器走的是「下载 zip → 手动加载」那条（Chromium 系桌面版） */
    when: () => !extensionInfo.value && EXTENSION_ROUTES.value.includes('manual'),
    labelKey: 'settings.menu.downloadExtension',
    run: () => downloadExtensionPackage(),
  },
  {
    id: 'updateExtensionManual',
    kind: 'action',
    /** 装着旧版 + 走手动加载那条：重新下一份新包，用户换掉解压目录后刷新即可（路还是这一条）。
     *  词与 Firefox 那颗同为「更新浏览器插件」（2026-10-20 起，理由见上面块注释） */
    when: () => extensionOutdated() && EXTENSION_ROUTES.value.includes('manual'),
    labelKey: 'settings.menu.updateExtension',
    run: () => downloadExtensionPackage(),
  },

  {
    id: 'openSettings',
    kind: 'action',
    labelKey: 'settings.menu.openSettings',
    // 键位显示走绑定表（面板那边改绑这里跟着变），action id 见 SHORTCUT_ACTIONS
    actionId: 'open-settings',
    run: () => openSettingsTab(),
  },
  {
    id: 'sections',
    kind: 'radio',
    labelKey: 'settings.menu.sections',
    /**
     * 九个一级分类：面板 `SECTIONS` 去掉桌面端独有的「工作区」之后的那一份，顺序一致。
     * 上面那颗「打开设置面板…」不在表里 —— 它打开就落在默认的「外观」，不必再列一次。
     * （2026-10-11：原先排在最前的「常用设置」分类已删，这里与面板同步少了一项；
     * 同日新增「浏览器插件」，它只在网页版的面板里出现 —— 桌面端选它会被面板忽略
     * （落点有 visibleSections 守卫，不切栏），与本表照列并不冲突。）
     */
    options: () =>
      ['appearance', 'editor', 'templates', 'shortcuts', 'judge', 'cloud', 'app', 'extension', 'help'].map(
        (id) => ({ id, labelKey: `settings.section.${id}`, icon: SECTION_ICONS[id] }),
      ),
    // 分类不是「当前值」，所以没有 current —— 组件据此不画选中圆点
    select: (id) => openSettingsTab(id),
    /**
     * 这一行选完要连菜单一起收掉：它把用户送到设置面板去了，菜单留在原地会挡住刚打开的
     * 那一页。上面那几档（缩放 / 语言）反过来 —— 选完留在原地才好连着试（见文件头）。
     */
    closes: true,
  },

  { kind: 'divider' },

  {
    // 反馈（2026-11-23 从组件菜单挪进设置菜单）：动作行，点完菜单收起，
    // 卡片本体挂在 App.vue（开关见 services/feedback.js）。
    id: 'feedback',
    kind: 'action',
    labelKey: 'settings.menu.feedback',
    run: () => openFeedback(),
  },
]
