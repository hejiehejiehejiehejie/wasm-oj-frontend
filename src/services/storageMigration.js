/**
 * localStorage 键名前缀迁移：cph.* -> cp.*
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

migrateStorageKeys()
