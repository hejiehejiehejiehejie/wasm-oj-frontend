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
 * 【写就一定经过原有单一出口】这里没有一个字面量 localStorage 键：
 * - 编辑器偏好 → `services/editorSettings.js` 的 setEditorSetting
 * - 侧边栏位置 / 缩放 → `services/shellSettings.js`
 * - 模板开关 → `services/fileTemplates.js`
 * - 界面语言 → `i18n/index.js`
 * 所以菜单改完，**设置面板里同一行立刻跟着变**（读的是同一份 ref），不需要同步代码。
 *
 * 【三种控件】
 * - `switch`：二值，一级行末尾就是那只开关，点整行翻面。适合的正是「启用模板」这类
 *   本身就是「开或不开」语义的项。
 * - `radio`：点开二级子菜单再选，**两档也照样用它** —— 主题（深 / 浅）与侧边栏位置
 *   （左 / 右）这两项的两档各有名字，开关只能说「开 / 关」、说不出档位叫什么，
 *   而二级里既看得到当前停在哪一档、也能直接认出另一档叫什麼。选完默认**菜单不关** ——
 *   调缩放 / 切语言这类动作常常要连着试几次，关掉反而碍事。要连菜单一起收的行
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
import { LOCALES, locale, setLocale } from '../i18n/index.js'
import { UI_SCALE_OPTIONS } from '../composables/useUiScale.js'
import { PANEL_POSITIONS, panelPosition, setPanelPosition, uiScalePref } from './shellSettings.js'

/** 百分比显示：放在一起是为了「菜单与设置面板两处口径一致」（面板那边叫 scaleLabel） */
const scaleLabel = (scale) => `${Math.round(scale * 100)}%`

/** 字号夹在合法区间里：与设置面板那个数字框共用 editorOptions.js 的同一份区间 */
function stepFontSize(delta) {
  const [min, max] = EDITOR_SETTING_RANGES.fontSize ?? [8, 40]
  const next = editorSettings.value.fontSize + delta
  setEditorSetting('fontSize', Math.min(max, Math.max(min, next)))
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
    id: 'uiScale',
    kind: 'radio',
    labelKey: 'settings.appearance.uiScale.label',
    options: () => UI_SCALE_OPTIONS.map((scale) => ({ id: scale, label: scaleLabel(scale) })),
    current: () => uiScalePref.value,
    select: (value) => {
      uiScalePref.value = value
    },
  },
  {
    id: 'fontSize',
    kind: 'stepper',
    labelKey: 'settings.appearance.fontSize.label',
    value: () => editorSettings.value.fontSize,
    step: stepFontSize,
  },
  {
    id: 'locale',
    kind: 'radio',
    labelKey: 'settings.appearance.locale.label',
    // endonym（各语言自己的写法）不翻译：见 i18n/index.js 的 LOCALES
    options: () => LOCALES.map(({ id, label }) => ({ id, label })),
    current: () => locale.value,
    select: (id) => setLocale(id),
  },
  {
    id: 'panelPosition',
    kind: 'radio',
    labelKey: 'settings.appearance.panelPosition.label',
    options: () => PANEL_POSITIONS,
    current: () => panelPosition.value,
    select: (id) => setPanelPosition(id),
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
    id: 'autoSave',
    kind: 'switch',
    labelKey: 'settings.editor.autoSave.label',
    checked: () => editorSettings.value.autoSave,
    toggle: () => setEditorSetting('autoSave', !editorSettings.value.autoSave),
  },
  { kind: 'divider' },

  {
    id: 'cloud',
    kind: 'cloud',
    // 菜单里叫「同步设置」；`settings.section.cloud`（「云端同步」）是给设置面板那一栏与
    // 「设置分类」二级用的，两处刻意不同名（2026-10-11）
    labelKey: 'settings.menu.cloudSync',
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
        (id) => ({ id, labelKey: `settings.section.${id}` }),
      ),
    // 分类不是「当前值」，所以没有 current —— 组件据此不画选中圆点
    select: (id) => openSettingsTab(id),
    /**
     * 这一行选完要连菜单一起收掉：它把用户送到设置面板去了，菜单留在原地会挡住刚打开的
     * 那一页。上面那几档（缩放 / 语言）反过来 —— 选完留在原地才好连着试（见文件头）。
     */
    closes: true,
  },
]
