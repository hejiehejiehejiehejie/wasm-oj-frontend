/**
 * installGuides —— 「怎么把本站装成应用 / 怎么装、更新浏览器插件」这两件事的**通知形态**。
 *
 * 【为什么单独一个文件】这两件引导原来只被动地躺在设置面板里（「应用」栏的说明行、
 * 「浏览器插件」栏的装包行），用户不点进去就永远看不到。2026-10-12 用户要求改用通知系统
 * 主动引导，于是同一份判据冒出了第三个消费者（面板 / 齿轮菜单 / 通知）—— 判据再抄一份
 * 必然走偏，所以**分岔逻辑收在这里**，面板那边改成 import（与 `extensionPackage.js`
 * 那次把版本比对挪出去是同一套做法）。
 *
 * 【两件事，四条引导】
 * - `app-install`  引擎有安装 API 且此刻真能一键装 → 通知带「安装」按钮，点了调浏览器弹窗
 * - `app-manual`   装不了 / 拿不到一键入口 → 只说明（按浏览器 / 系统挑一句，含 chrome://apps 那条出路）
 * - `ext-install`  没探到插件、且这台机器有路 → 通知带「下载 / Firefox 版」按钮
 * - `ext-update`   探到插件但版本旧 → 通知带「重新下载 / Firefox 版」按钮
 *
 * 【自动弹一次的记录】`cp.installGuides`（本文件唯一读写），存**已自动弹过的引导 id 数组**。
 * 四条各记各的：见过「可以装应用」不等于见过「插件有新版」，所以状态变了仍会再提示一次。
 * 手动触发（设置里那颗「安装引导」按钮）**不看这份记录** —— 那是用户点名要看。
 *
 * 【这个键刻意不进云同步白名单】它是「**这台设备**已经被告知过什么」，同步过去等于让另一台
 * 从没弹过的设备也永远不弹。
 *
 * 【文案】不在本文件里写字面量：标题 / 正文 / 按钮字一律取 i18n key，并在**点击那一刻**才
 * `t()`（locale 中途切换后发出来的那条才对）。能复用设置面板现成句子的就复用 ——
 * 插件那六条 `hint*` 与应用的六条 `noApi*` 本来就是自足整句（没有「右侧」这类位置指代），
 * 通知直接拿来当正文。
 */
import { computed } from 'vue'

import { t } from '../i18n/index.js'
import { BROWSER, BROWSER_PLATFORM, HOST_OS, IS_DESKTOP } from './platform.js'
import { appInstalled, canInstall, INSTALL_API_SUPPORTED, install } from '../composables/useInstallPrompt.js'
import { extensionInfo } from '../composables/useCompanionBridge.js'
import {
  EXTENSION_ROUTES,
  EXTENSION_VERSION,
  downloadExtensionPackage,
  isExtensionOutdated,
  openExtensionStore,
} from './extensionPackage.js'
import { dismissByTag, notify } from './notifications.js'

/** 「已自动弹过」的存档键。见文件头：不进云同步白名单。 */
const SHOWN_KEY = 'cp.installGuides'

/**
 * 浏览器管理「已安装的网页应用」的页面。**只能复制给用户自己去打开**：网页没有权限跳转
 * chrome://（与插件快捷键那个地址同一条规矩，见 `SHORTCUTS_URL`）。
 * 面板那颗「复制地址」与通知里的同名按钮读的是这一份。
 */
export const APPS_URL = 'chrome://apps'

/** 通知归属标识：同一件事的引导同时只留一条（新的一条替掉旧的） */
const TAG_APP = 'guide:app'
const TAG_EXTENSION = 'guide:extension'

/**
 * 没有操作按钮的引导（纯说明）停留多久。带按钮的一律常驻（duration 0）——
 * 那是要用户动手的，替他关掉没有道理。
 */
const INFO_MS = 12000

// ---------------------------------------------------------------- 分岔（唯一出处）

/**
 * 应用侧「引擎没有安装 API」时的出路变体。判据与设置面板**完全同源**，别再写第二份：
 * Firefox 按安卓 / Windows / 其它三分（桌面 Firefox 只有 Windows 143+ 有地址栏那个图标），
 * Safari 系按 iOS / 桌面两分，认不出的引擎给 `generic`。
 */
export function noApiVariant() {
  if (BROWSER === 'firefox') {
    if (BROWSER_PLATFORM === 'android') return 'firefox-android'
    return HOST_OS === 'windows' ? 'firefox-windows' : 'firefox-other'
  }
  if (BROWSER === 'safari') return BROWSER_PLATFORM === 'ios' ? 'ios' : 'safari-desktop'
  return 'generic'
}

/** 变体 → 文案 key（「应用」栏那行说明与通知正文共用同一批句子） */
export const NO_API_KEYS = {
  'firefox-android': 'settings.app.install.noApiFirefoxAndroid',
  'firefox-windows': 'settings.app.install.noApiFirefoxWindows',
  'firefox-other': 'settings.app.install.noApiFirefoxOther',
  ios: 'settings.app.install.noApiIos',
  'safari-desktop': 'settings.app.install.noApiSafariDesktop',
  generic: 'settings.app.install.noApiGeneric',
}

/**
 * 插件安装说明的变体。顺序即优先级（Safari 先摘出去），与设置面板那行 `hint*` 一字不差：
 * - `unsupported`：Safari（含 iOS 上全部浏览器），一条路都没有的一档
 * - `mobile-unsupported`：移动端非 Firefox（安卓 Chrome 完全不支持扩展）
 * - 其余按浏览器族
 */
export function extensionVariant() {
  if (BROWSER === 'safari') return 'unsupported'
  if (BROWSER_PLATFORM !== 'desktop') {
    return BROWSER === 'firefox' ? 'firefox' : 'mobile-unsupported'
  }
  if (BROWSER === 'firefox') return 'firefox'
  if (BROWSER === 'edge') return 'edge'
  if (BROWSER === 'chrome') return 'chrome'
  return 'chromium'
}

export const EXTENSION_HINT_KEYS = {
  firefox: 'settings.extension.hintFirefox',
  edge: 'settings.extension.hintEdge',
  chrome: 'settings.extension.hintChrome',
  chromium: 'settings.extension.hintChromium',
  'mobile-unsupported': 'settings.extension.hintMobileUnsupported',
  unsupported: 'settings.extension.hintUnsupported',
}

/** 换新版的方式两侧不同：Firefox 自己会更新，Chromium 要手动换目录再刷新 */
export function extensionUpdateHintKey() {
  return BROWSER === 'firefox'
    ? 'settings.extension.updateHintFirefox'
    : 'settings.extension.updateHintManual'
}

/**
 * 「引擎有这套 API、此刻也没装，却拿不到一键安装的入口」—— 也就是**按钮灰着、状态词却写着
 * 「当前浏览器支持」**的那一格（判据与设置面板同一份，面板那个 `v-if` 读的就是这儿）。
 * 灰按钮本身修不了（没有任何 API 能问「到底装没装」），能做的只有如实解释 + 给出路。
 */
export const installUnavailable = computed(
  () => INSTALL_API_SUPPORTED && !canInstall.value && !appInstalled.value,
)

// ---------------------------------------------------------------- 状态

/** 已自动弹过的引导 id（内存镜像 + 落 `cp.installGuides`） */
const shown = new Set(readShown())

function readShown() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(SHOWN_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []
  } catch {
    return []
  }
}

function rememberShown(id) {
  if (shown.has(id)) return
  shown.add(id)
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SHOWN_KEY, JSON.stringify([...shown]))
  } catch {
    /* 隐私模式 / 配额满：只在内存里记，本次会话仍然只弹一次 */
  }
}

// ---------------------------------------------------------------- 四条引导的内容

/** 应用侧：按此刻的状态挑一条（手动触发时永远有东西可看，所以不会返回 null） */
function appGuide() {
  if (canInstall.value) {
    return {
      type: 'info',
      title: t('settings.menu.installApp'),
      message: t('notifications.guide.appReady'),
      actions: [
        { label: t('settings.app.installAction'), run: () => install() },
        { label: t('notifications.guide.later') },
      ],
    }
  }
  if (appInstalled.value) {
    return {
      type: 'success',
      title: t('settings.menu.installApp'),
      message: t('notifications.guide.appInstalled'),
    }
  }
  if (!INSTALL_API_SUPPORTED) {
    return {
      type: 'info',
      title: t('settings.menu.installApp'),
      message: t(NO_API_KEYS[noApiVariant()] ?? NO_API_KEYS.generic),
    }
  }
  // 有 API、也没装，却拿不到入口：那句说明拆成了前后两半（中间夹着地址），这里拼成整句
  return {
    type: 'warning',
    title: t('settings.menu.installApp'),
    message: `${t('settings.app.install.blockedPrefix')} ${APPS_URL} ${t('settings.app.install.blockedSuffix')}`,
    actions: [{ label: t('settings.app.install.copyApps'), run: copyAppsUrl }],
  }
}

/** 插件侧：装好了且是最新版 → null（没有可引导的事） */
function extensionGuide() {
  const outdated = Boolean(extensionInfo.value) && isExtensionOutdated(extensionInfo.value.version)
  if (extensionInfo.value && !outdated) return null

  const actions = []
  for (const route of EXTENSION_ROUTES.value) {
    if (route === 'firefox') {
      actions.push({
        label: t('settings.extension.download.firefox'),
        run: () => openExtensionStore(),
      })
    }
    if (route === 'manual') {
      actions.push({
        label: t(outdated ? 'notifications.guide.redownload' : 'app.download'),
        run: () => downloadExtensionPackage(),
      })
    }
  }

  const variant = extensionVariant()
  // 那六条 `hint*` 里只有 Firefox 那条自带「装完回来点重新检测」，其余的得在通知里补一句 ——
  // 通知上没有「重新检测」那颗按钮，不说的话用户装完不知道下一步在哪儿
  const hint = t(EXTENSION_HINT_KEYS[variant] ?? EXTENSION_HINT_KEYS.chromium)
  const recheck = !outdated && variant !== 'firefox' ? ` ${t('notifications.guide.extRecheck')}` : ''

  return {
    type: 'info',
    title: t(outdated ? 'settings.menu.updateExtension' : 'settings.menu.installExtension'),
    message: `${outdated ? t(extensionUpdateHintKey()) : hint}${recheck}`,
    actions,
  }
}

/** 复制 chrome://apps 到剪贴板，再回一条短通知（复制本身就是全部结果，不需要正文） */
async function copyAppsUrl() {
  try {
    await navigator.clipboard.writeText(APPS_URL)
    notify({
      type: 'success',
      title: t('settings.app.install.copied'),
      message: APPS_URL,
      duration: 3000,
    })
  } catch {
    // 非安全上下文或用户没授权：把地址放进正文，手动复制也够用
    notify({
      type: 'warning',
      title: t('notifications.guide.copyFailed'),
      message: APPS_URL,
      duration: 5000,
    })
  }
}

// ---------------------------------------------------------------- 出口

/** 上屏一条引导：同 tag 的先收掉（同一件事不留两条），有按钮就常驻、纯说明 12 秒 */
function show(tag, options) {
  if (!options) return null
  dismissByTag(tag)
  return notify({
    ...options,
    tag,
    duration: options.actions?.length ? 0 : INFO_MS,
  })
}

/**
 * 这一条此刻该不该自动弹（`app-manual` 那格涵盖「装不了」与「拿不到入口」两种）。
 *
 * `phase` 只影响 `app-manual` 里**有 API 但拿不到入口**那一格 —— 见 `runAutoGuides` 的说明。
 */
function available(id, phase) {
  if (IS_DESKTOP) return false
  if (id === 'app-install') return canInstall.value
  if (id === 'app-manual') {
    if (appInstalled.value) return false
    // 引擎压根没有这套 API（Firefox / Safari）：没有事件可等，早说晚说一样，不拖
    if (!INSTALL_API_SUPPORTED) return true
    return phase === 'late' && installUnavailable.value
  }
  // 插件两条都要求「这台机器有路」：一条路都没有（Safari / 桌面壳）时不打扰
  if (!EXTENSION_ROUTES.value.length) return false
  if (id === 'ext-install') return !extensionInfo.value
  if (id === 'ext-update') return Boolean(extensionInfo.value) && isExtensionOutdated(extensionInfo.value.version)
  return false
}

/**
 * 开机自动引导：把**还没弹过、且此刻成立**的那几条各弹一次，弹过就落进 `cp.installGuides`。
 * 幂等 —— 重复调用只会补上「上次不成立、这次成立了」的那些（例如安装事件晚到）。
 *
 * 【为什么分两趟】`app-manual` 里「有 API 却拿不到入口」这一格**不能早弹**：Chrome 的
 * `beforeinstallprompt` 什么时候来不由我们定（首次访问时 SW 还没接管，它可能压根不来、
 * 也可能几秒后才来），早弹会把「这台其实装得上，只是还没轮到它派发事件」写成一屏
 * 「入口不可用」的警告。所以趟一是 `early`（只出应用能装、插件两条），趟二 `late` 再补那一格。
 * 两趟共用一个 tag —— 万一真的事件晚到，`app-install` 那条会把误报顶掉。
 *
 * @param {'early'|'late'} [phase='early']
 */
export function runAutoGuides(phase = 'early') {
  for (const id of ['app-install', 'app-manual', 'ext-install', 'ext-update']) {
    if (shown.has(id) || !available(id, phase)) continue
    if (id.startsWith('app')) show(TAG_APP, appGuide())
    else show(TAG_EXTENSION, extensionGuide())
    rememberShown(id)
  }
}

/**
 * 手动触发（设置面板里那颗「安装引导」）：**不看已弹记录**，用户点名要看。
 * 已经装好 / 已是最新版时也有话说，不会点了没反应。
 *
 * @param {'app'|'extension'} section
 */
export function fireSectionGuide(section) {
  if (section === 'app') return show(TAG_APP, appGuide())
  if (section === 'extension') {
    return show(
      TAG_EXTENSION,
      extensionGuide() ?? {
        type: 'success',
        title: t('settings.menu.updateExtension'),
        message: t('notifications.guide.extUpToDate', { version: EXTENSION_VERSION }),
      },
    )
  }
  return null
}
