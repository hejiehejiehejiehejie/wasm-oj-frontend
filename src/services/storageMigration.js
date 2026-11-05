/**
 * 启动期的 localStorage 迁移与化石清理。三件事：
 *
 * ① 键名前缀迁移：cph.* -> cp.*
 * ② 一次性默认值升级：`cp.timeLimitMs` 从 1000 → 2000（见 `bumpTimeLimitDefault`）
 * ③ 清掉迁完之后`cph.*` 的全部化石键（旧版残留，见 `sweepLegacyKeys`）
 *
 * 【为什么必须是 main.js 的第一个 import】
 * i18n/index.js、composables/useShortcutManager.js、services/mdView.js 在**模块求值阶段**
 * 就把各自的键读走了。ES 模块按 import 声明顺序求值，所以本模块必须排在 App.vue 之前，
 * 否则迁移晚一步，「界面语言 / 快捷键 / 预览模式」会先按默认值初始化。
 *
 * 【幂等】复制那一步靠标记 cp.migratedFromCph 跳过；化石清理每次启动都扫一遍
 * （2026-11-06 起：旧版用户升上来时只复制不删，残留会一直躺到用户自己清站点数据）。
 * 【唯一的例外】`cph.drafts` 要等 vfs/migrate 把它导进工作区之后才删，见 sweepLegacyKeys。
 */
import { LEGACY_BUCKETS } from './storageNames.js'

const FLAG = 'cp.migratedFromCph'
const LEGACY_PREFIX = 'cph.'
const LEGACY_DRAFTS_KEY = 'cph.drafts'
/** vfs/migrate 把 cph.drafts 导进工作区后写的标记（见 services/vfs/migrate.js） */
const DRAFTS_IMPORTED_KEY = 'cp.vfsMigrated'

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
    const first = storage.getItem(FLAG) === null
    if (first) {
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
    }
    // 复制完之后才扫：先把值搬走，再删键
    sweepLegacyKeys(storage)
    return first
  } catch {
    // 隐私模式下 localStorage 可能不可写；迁移失败不该挡住应用启动
    return false
  }
}

/**
 * 删掉旧版本留下的 `cph.*` 键。
 *
 * 2026-11-06 之前这里刻意「不删旧键」（留作回滚兜底），结果是老用户升级后这些键一直躺在
 * localStorage 里：`cph.language` / `cph.mobileKeyboard` / `cph.mobileInputDock` 早已没有
 * 代码读，连同 25 个已迁移的键一并在开发者工具里显形。现在每次启动都扫一遍 ——
 * 迁移可能发生在很久以前（标记早就写过），只在迁移那一次删是不够的。
 *
 * `cph.drafts` 是唯一要等的：它由 vfs/migrate 在**启动更晚**的阶段导进工作区，
 * 只要 `cp.vfsMigrated` 还没写就必须留着（迁移失败时下次启动还要用它兜底）。
 */
function sweepLegacyKeys(storage) {
  const keys = []
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i)
    if (key && key.startsWith(LEGACY_PREFIX)) keys.push(key)
  }
  for (const key of keys) {
    if (key === LEGACY_DRAFTS_KEY && storage.getItem(DRAFTS_IMPORTED_KEY) === null) continue
    storage.removeItem(key)
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

/**
 * 清掉改名前的缓存桶（`cph-toolchain-v3` / `cp-toolchain-v3` / `cph-md-runtime-v1` …）。
 *
 * SW 的 activate 里已有一趟同样的搬运 + 删除（见 sw.js 的 migrateLegacyBuckets），但
 * activate 只在**新 SW 安装**时跑：升级那一刻没搬走的桶（迁移中途抛错、或者之后又被
 * 旧版页面写回来）会一直留着 —— 白名单清理同样只在 activate 跑，没有第二遍。
 * 2026-11-06 实测：8.0.1 那代编译器资产就在 `cph-toolchain-v3` 里躺到用户报上来。
 *
 * 这里只删不搬：能搬的 activate 早就搬完，剩下的要么是上一代编译器的死资产，要么是
 * 改名之后没人再按那个 URL 取的副本（HTTP 缓存里通常还在，重新 fetch 不必重下）。
 */
async function sweepLegacyCaches() {
  if (typeof caches === 'undefined') return
  try {
    const names = await caches.keys()
    const legacy = new Set(LEGACY_BUCKETS.map(([from]) => from))
    await Promise.all(
      names
        .filter((name) => legacy.has(name) || name.startsWith('cph-'))
        .map((name) => caches.delete(name)),
    )
  } catch {
    /* 隐私模式 / 配额：删不掉不阻断启动 */
  }
}

// 放到空闲时段：启动首帧不该等一趟 Cache Storage 扫描（旧桶可能装着几十 MB）
if (typeof window !== 'undefined') {
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => void sweepLegacyCaches(), { timeout: 5000 })
  } else {
    window.setTimeout(() => void sweepLegacyCaches(), 2000)
  }
}
