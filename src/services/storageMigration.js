/**
 * 启动期的 localStorage 迁移。两件事：
 *
 * ① 键名前缀迁移：cph.* -> cp.*
 * ② 一次性默认值升级：`cp.timeLimitMs` 从 1000 → 2000（见 `bumpTimeLimitDefault`）
 *
 * 【为什么必须是 main.js 的第一个 import】
 * i18n/index.js、composables/useShortcutManager.js、services/mdView.js 在**模块求值阶段**
 * 就把各自的键读走了。ES 模块按 import 声明顺序求值，所以本模块必须排在 App.vue 之前，
 * 否则迁移晚一步，「界面语言 / 快捷键 / 预览模式」会先按默认值初始化。
 *
 * 【幂等】标记 cp.migratedFromCph 写过就跳过。
 * 【不删旧键】万一回滚到旧版本，旧配置还在（体积只有几 KB）。
 */

const FLAG = 'cp.migratedFromCph'

/** 需要迁移的键名（不含化石键：cph.drafts 只读；cph-light / cph-dark 是存档里的值，不是键） */
const NAMES = [
  'editorSettings',
  'editorSettingsVersion',
  'shortcuts',
  'uiScale',
  'uiLocale',
  'panelPosition',
  'panelVisible',
  'editorShare',
  'sidebarTab',
  'mdView',
  'timeLimitMs',
  'memoryLimitBytes',
  'engine',
  'judgeBases',
  'testCases',
  'pchUnsupported',
  'vfsExpanded',
  'openTabs',
  'activeFile',
  'vfsMigrated',
  'workspaceLayoutV2',
  'localRuntime.clangReady',
  'localRuntime.pythonReady',
  'localRuntime.markdownReady',
]

export function migrateStorageKeys(storage = window.localStorage) {
  try {
    if (storage.getItem(FLAG)) return false
    for (const name of NAMES) {
      const oldKey = `cph.${name}`
      const newKey = `cp.${name}`
      const value = storage.getItem(oldKey)
      // 新键已有值就不覆盖：那是新版本自己写的，旧键只是残留
      if (value !== null && storage.getItem(newKey) === null) {
        storage.setItem(newKey, value)
      }
    }
    storage.setItem(FLAG, '1')
    return true
  } catch {
    // 隐私模式下 localStorage 可能不可写；迁移失败不该挡住应用启动
    return false
  }
}

/**
 * `cp.timeLimitMs` 的默认值从 1 s 改成 2 s（2026-10-25）。标记写过就不再动它。
 *
 * 为什么要这一步：`usePersistentRef` 在**挂载时就写一次**，所以凡是打开过本站的浏览器，
 * localStorage 里都躺着一条显式的 `1000` —— 只改 `runner.js` 的常量，老用户（包括开发者
 * 自己）看到的仍然是 1 s，等于没改。这里只认「恰好等于老默认 1000」的那一种，
 * 手选过 2 / 5 / 10 s 的一律不动；标记落地后再手动调回 1 s 也不会被反复顶回去。
 *
 * 数字**刻意写死**，不 import `runner.js`：那条链会拉起 i18n，而 i18n 在模块求值阶段
 * 就要读键（见文件头），本模块必须排在它前面。
 */
const TIME_LIMIT_FLAG = 'cp.timeLimitDefault2s'
const TIME_LIMIT_KEY = 'cp.timeLimitMs'
const TIME_LIMIT_OLD_DEFAULT_MS = 1000
const TIME_LIMIT_NEW_DEFAULT_MS = 2000

export function bumpTimeLimitDefault(storage = window.localStorage) {
  try {
    if (storage.getItem(TIME_LIMIT_FLAG)) return false
    const raw = storage.getItem(TIME_LIMIT_KEY)
    if (raw !== null && Number(JSON.parse(raw)) === TIME_LIMIT_OLD_DEFAULT_MS) {
      storage.setItem(TIME_LIMIT_KEY, JSON.stringify(TIME_LIMIT_NEW_DEFAULT_MS))
    }
    storage.setItem(TIME_LIMIT_FLAG, '1')
    return true
  } catch {
    // 隐私模式 / 值不是 JSON：跳过，别挡住启动
    return false
  }
}

migrateStorageKeys()
bumpTimeLimitDefault()
