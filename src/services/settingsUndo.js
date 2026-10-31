/**
 * settingsUndo —— 「改了哪个设置」→ 一条带「撤回」的通知（2026-10-12 用户要求）。
 *
 * 【要什么】改任一设置都弹一条 info 通知（3 秒），带一颗「撤回」；**同一项只有一条** ——
 * 连着改同一项不新发，而是原地改那一条（`updateNotification`），把「撤回」的目标换成最近这一手。
 * 点「撤回」退回**上一手**的值（不是退到最初）。
 *
 * 【为什么在 ref 上收口，而不是往写入方插钩】设置写入有五条通路：
 * - 设置面板整份回写 → App.vue → `editorSettings.updateEditorSettings`
 * - 齿轮菜单单项     → `editorSettings.setEditorSetting`
 * - 侧边栏位置 → `shellSettings.setPanelPosition`；窄屏折叠方向 → `shellSettings.setNarrowCollapseSide`；
 *   界面缩放 → `uiScalePref`（面板与菜单**两处**直接写这个 ref）
 * - 界面语言         → `i18n.setLocale`；模板开关 → `fileTemplates.setTemplatesEnabled`
 * 逐条插钩要动五个文件（缩放那条还没有单一出口，得先给它造一个 setter），漏一条就漏一类设置。
 * 而它们最终都落回**模块级单例 ref**（就是「抽单例」这件事本身的收益），在这里挂 watch 一次全覆盖。
 *
 * 【代价：一条必须守住的契约】`editorSettings` 用的是**浅** watch（`{ deep: false }`，靠 `.value`
 * 换新引用触发）：deep 的 watch 回调里 newValue 与 oldValue 是同一个对象（Vue 不克隆），拿不到
 * 「改之前是什么」，撤销就无从谈起。所以**写入方必须整份替换**（`editorSettings.value = {...}`）——
 * 现在两个写入方都是这么写的（见 editorSettings.js 的 updateEditorSettings / setEditorSetting）。
 * 哪天有人图省事写 `editorSettings.value.fontSize = 20`，这一项就静默失联。
 *
 * 【撤回到哪一手】每项一份撤销栈（旧 → 新），点一次退一手；退干净了才收掉通知。栈只跟着
 * **那一条通知的命**走：通知 3 秒到期 / 被手动关掉之后，下一次修改就从头记 —— 否则用户看不见
 * 的那截栈会让他按一下「撤回」退到很早以前的值。
 *
 * 【为什么 watch 用 flush: 'sync'】撤回是自己写回去的，那一下也会触发 watch，必须当场跳过
 * （`applying` 守卫）。默认的 'pre' 会把回调推到微任务里跑，那时守卫早已复位 —— 于是撤回自己
 * 又弹一条通知，无限套娃。sync 让回调在 setter 里同步执行，正好落在守卫区间内。
 *
 * 【文案里的设置名与取值】标题是「{设置名}」已更新为「{取值名}」，两个名字都按约定取自现有表：
 * 设置名按 `settings.editor.<id>.label`（与 settingsMenu.js 里 `settings.section.${id}` 同一体例），
 * 不在编辑器域的那几个（主题 / 字号 / 缩放 / 语言 / 侧边栏位置 / 窄屏折叠方向 / 模板开关 ——
 * 它们在设置面板里就算「外观」「模板」栏）走下面的例外表。取值名复用面板下拉与菜单档位
 * 那一批选项表（见 VALUE_LABELERS），开关译成「开启 / 关闭」。
 * 改词条位置时两边一起改，探针会逐键校验每一条都译得出来。
 * 撤回之后标题要跟着换成刚还原的那一档 —— 否则通知上会停着一个已经不在生效的值。
 *
 * 【刻意不发通知的情形】
 * - **一次改一批**：云端导入 / 登录成功走 `applyProfile`，它只写 localStorage 再整页刷新，
 *   运行期的 ref 一个都不动（见 cloudProfile.js），所以这里天然不响 —— 而且那时页面马上要重载，
 *   弹出来也看不见（那两条有专门的跨刷新寄存，见 notifications.js 文件头）。
 * - **值没变**：选中的就是当前那一档（面板下拉反复点同一项、开关点了不生效）时写入方也照样会
 *   替换 ref，这里逐键比对后不记、不弹。
 */
import { watch } from 'vue'

import {
  CODE_IMAGE_ACTIONS,
  CODE_IMAGE_QUALITIES,
  CURSOR_BLINKINGS,
  CURSOR_STYLES,
  EDITOR_SETTINGS_DEFAULTS,
  FONT_FAMILIES,
  LINE_HIGHLIGHTS,
  LINE_NUMBER_MODES,
  PADDINGS,
  SCROLLBAR_SIZES,
  THEMES,
  WHITESPACE_MODES,
  WRAP_MODES,
} from './editorOptions.js'
import { editorSettings, setEditorSetting } from './editorSettings.js'
import {
  NARROW_COLLAPSE_SIDES,
  PANEL_POSITIONS,
  narrowCollapseSide,
  panelPosition,
  setNarrowCollapseSide,
  setPanelPosition,
  uiScalePref,
} from './shellSettings.js'
import { setTemplatesEnabled, templatesEnabled } from './fileTemplates.js'
import { LOCALES, locale, setLocale, t } from '../i18n/index.js'
import { dismissNotification, notifications, notify, updateNotification } from './notifications.js'

/** 停留时长：与设置面板「应用」栏那颗演示用的 info 通知同档（3 秒） */
const STAY_MS = 3000

/** tag 前缀：`setting:<键>`。同 tag 只留一条，连着改就靠它对上一条 */
const TAG_PREFIX = 'setting:'

// 参与撤销的编辑器键：与 editorSettings.js 用的是同一份来源（默认值表的键集）
const EDITOR_SETTING_KEYS = Object.keys(EDITOR_SETTINGS_DEFAULTS)

/**
 * 名字不在 `settings.editor.*` 域里的几项 —— 面板把它们摆在「外观」「模板」栏，
 * 词条也就跟着在那边（见 EditorSettingsPanel.vue 的 APPEARANCE_ROWS / SHELL_ROWS）。
 */
const EXTRA_LABEL_KEYS = {
  theme: 'settings.appearance.theme.label',
  fontSize: 'settings.appearance.fontSize.label',
  uiScale: 'settings.appearance.uiScale.label',
  locale: 'settings.appearance.locale.label',
  panelPosition: 'settings.appearance.panelPosition.label',
  narrowCollapseSide: 'settings.appearance.narrowCollapseSide.label',
  templatesEnabled: 'settings.templates.enable.label',
}

const labelKeyFor = (id) => EXTRA_LABEL_KEYS[id] ?? `settings.editor.${id}.label`

/** 选项表里按 id 找到那一档的显示名（系统字体那几档只有写死的 label，没有 labelKey） */
function optionLabel(options, id) {
  const item = options.find((option) => option.id === id)
  if (!item) return String(id)
  return item.labelKey ? t(item.labelKey, item.labelParams) : String(item.label ?? item.id)
}

/**
 * 每项的「取值名」：复用面板下拉与菜单档位那一批选项表，不在这里另抄一份名字。
 * 没列到的只剩两种 —— 开关（true / false → 开启 / 关闭）与直接露数字的（字号 / 换行列宽）。
 */
const VALUE_LABELERS = {
  theme: (value) => optionLabel(THEMES, value),
  fontFamily: (value) => optionLabel(FONT_FAMILIES, value),
  fontSize: (value) => String(value),
  lineHeightRatio: (value) => t('settings.value.times', { n: value }),
  tabSize: (value) => t('settings.value.spaces', { n: value }),
  wordWrap: (value) => optionLabel(WRAP_MODES, value),
  wordWrapColumn: (value) => String(value),
  cursorStyle: (value) => optionLabel(CURSOR_STYLES, value),
  cursorBlinking: (value) => optionLabel(CURSOR_BLINKINGS, value),
  lineNumbers: (value) => optionLabel(LINE_NUMBER_MODES, value),
  renderWhitespace: (value) => optionLabel(WHITESPACE_MODES, value),
  renderLineHighlight: (value) => optionLabel(LINE_HIGHLIGHTS, value),
  padding: (value) => optionLabel(PADDINGS, value),
  scrollbarSize: (value) => optionLabel(SCROLLBAR_SIZES, value),
  codeImageQuality: (value) => optionLabel(CODE_IMAGE_QUALITIES, value),
  codeImageAction: (value) => optionLabel(CODE_IMAGE_ACTIONS, value),
  uiScale: (value) => `${Math.round(value * 100)}%`,
  panelPosition: (value) => optionLabel(PANEL_POSITIONS, value),
  narrowCollapseSide: (value) => optionLabel(NARROW_COLLAPSE_SIDES, value),
  locale: (value) => optionLabel(LOCALES, value),
}

function valueLabelFor(id, value) {
  const resolve = VALUE_LABELERS[id]
  if (resolve) return resolve(value)
  if (typeof value === 'boolean') return t(value ? 'settings.value.on' : 'settings.value.off')
  return String(value)
}

/**
 * 写回一个值：每一项都走它**自己的**原有出口（见文件头的通路表），不碰 localStorage。
 * 编辑器那 31 项没有单列，统一走 `setEditorSetting`。
 */
const RESTORE = {
  uiScale: (value) => {
    uiScalePref.value = value
  },
  panelPosition: (value) => setPanelPosition(value),
  narrowCollapseSide: (value) => setNarrowCollapseSide(value),
  templatesEnabled: (value) => setTemplatesEnabled(value),
  locale: (value) => setLocale(value),
}

/** 每项的撤销栈（旧值在栈底）。键是设置 id，值是值数组 */
const stacks = new Map()
/** 每项当前那条通知的 id */
const notices = new Map()

/** 正在执行「撤回」：这一轮 watch 回调一律跳过，见文件头 flush: 'sync' 那条 */
let applying = false

/** 这条设置的通知还在场吗（退场动画中的不算 —— 它已经不可点了） */
function isLive(id) {
  const noticeId = notices.get(id)
  if (noticeId === undefined) return false
  return notifications.value.some((item) => item.id === noticeId && !item.leaving)
}

function forget(id) {
  stacks.delete(id)
  notices.delete(id)
}

function titleFor(id, value) {
  return t('notifications.setting.changed', {
    name: t(labelKeyFor(id)),
    value: valueLabelFor(id, value),
  })
}

/** 撤回按钮的动作：退上一手；栈空了就把通知收掉（`keep: true`，收不收由这里定） */
function undo(id) {
  const stack = stacks.get(id)
  if (!stack || !stack.length) {
    const noticeId = notices.get(id)
    forget(id)
    if (noticeId !== undefined) dismissNotification(noticeId)
    return
  }
  const value = stack.pop()
  applying = true
  try {
    if (RESTORE[id]) RESTORE[id](value)
    else setEditorSetting(id, value)
  } finally {
    applying = false
  }
  const noticeId = notices.get(id)
  if (stack.length) {
    // 还能再往前退一手：通知留着，标题换成刚还原的这一档，时限顺带重新起算（用户正连着撤，别在这时候消失）
    if (noticeId !== undefined) {
      updateNotification(noticeId, { title: titleFor(id, value), duration: STAY_MS })
    }
    return
  }
  forget(id)
  if (noticeId !== undefined) dismissNotification(noticeId)
}

/** 一项设置变了（值确实不同）：记一笔撤销栈，并把那条通知发出来 / 换成最新的 */
function handleChange(id, before, after) {
  if (applying || before === after) return
  // 上一条已经退场（自动消失 / 被关掉）→ 那一串撤销到此为止，别把看不见的旧值留着
  if (!isLive(id)) forget(id)

  const stack = stacks.get(id) ?? []
  stack.push(before)
  stacks.set(id, stack)

  const actions = [{ label: t('notifications.setting.undo'), run: () => undo(id), keep: true }]
  const title = titleFor(id, after)
  const noticeId = notices.get(id)
  if (noticeId !== undefined && updateNotification(noticeId, { title, actions, duration: STAY_MS })) {
    return
  }
  notices.set(
    id,
    notify({ type: 'info', title, duration: STAY_MS, actions, tag: TAG_PREFIX + id }),
  )
}

/**
 * 挂上监听。App.vue 调一次（与 useInstallGuides() 同一处，它也不画东西）。
 * 幂等：重复调用不会挂第二遍（Vue 的 watch 一旦注册就只能靠返回的 stop 收，这里自己记一笔）。
 */
let started = false

export function initSettingsUndo() {
  if (started) return
  started = true

  // 逐键比对：一次改多项（整份回写）时每一项各走各的通知与 tag
  watch(
    editorSettings,
    (next, prev) => {
      for (const key of EDITOR_SETTING_KEYS) {
        if (next[key] !== prev[key]) handleChange(key, prev[key], next[key])
      }
    },
    { flush: 'sync' },
  )

  watch(uiScalePref, (next, prev) => handleChange('uiScale', prev, next), { flush: 'sync' })
  watch(panelPosition, (next, prev) => handleChange('panelPosition', prev, next), { flush: 'sync' })
  watch(narrowCollapseSide, (next, prev) => handleChange('narrowCollapseSide', prev, next), {
    flush: 'sync',
  })
  watch(templatesEnabled, (next, prev) => handleChange('templatesEnabled', prev, next), { flush: 'sync' })
  watch(locale, (next, prev) => handleChange('locale', prev, next), { flush: 'sync' })
}
