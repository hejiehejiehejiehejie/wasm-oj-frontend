/**
 * fileTemplates —— 新建文件时按语言填入的初始文本（内置默认 + 用户覆盖）。
 *
 * 【为什么单独一个模块，不并进 templates.js】
 * 1) templates.js 是被 vfs/migrate.js 在**启动路径**上 import 的，目前是纯模块
 *    （无 vue、无 localStorage、无副作用）。往那里塞响应式与持久化，等于把 vue 依赖
 *    和启动期 I/O 拖进纯模块；
 * 2) templates.js 的 defaultCode() 服务于「旧草稿迁移」与「首启兜底文件」，
 *    那两处必须永远拿内置默认。它一旦跟着用户覆盖漂移，行为就被静默改掉了。
 *
 * 【为什么不走 usePersistentRef】同 mdView.js / i18n/index.js：那份 composable 靠
 * onMounted 才播种，而本模块要在**服务层**（FileExplorer.commitCreate、problemImport）
 * 任意时刻读，不挂在任何组件的生命周期上。所以自己读写 localStorage，初值同步算出来。
 *
 * 【只存覆盖】键形状 `{ [langId]: string }`，内置模板不落盘 —— 内置将来改版，
 * 没自定义过的用户自动跟着升级；「恢复默认」= 删掉那个键。
 * 注意 `''` 是**合法覆盖**（表示新建该语言文件时留空），所以取值一律 `??`、
 * 判型一律 `typeof === 'string'`，绝不能用 `||` 或真值判断 —— 那会把空模板吃掉。
 *
 * 【持久化时机】模块加载时先写回一次，让 `cp.fileTemplates` **总是存在**（空表就是
 * `{}`）。云同步的 applyProfile() 只写云端存在的键，键若缺席，「下载一份干净配置」
 * 就清不掉另一台设备上残留的自定义。之后每次 setTemplate / resetTemplate 同步落盘，
 * 与 i18n.setLocale、mdView.persist 同一体例（人工打字频率，不需要 debounce）。
 */
import { reactive } from 'vue'
import { BUILTIN_TEMPLATES, LANGUAGE_IDS, langMetaByMonaco } from './templates.js'
import { languageForPath } from './monaco/language.js'

/** 云同步白名单里的成员（见 services/cloudProfile.js），改名要一起改 */
export const FILE_TEMPLATES_KEY = 'cp.fileTemplates'

/** 单份模板的字符上限：给云同步那份 64KB 的整包上限留余量（3 × 8000 ≈ 24K 码元） */
export const TEMPLATE_MAX_LENGTH = 8000

/** 设置面板 v-for 用；顺序即展示顺序（LANGUAGE_IDS = cpp / python / markdown） */
export const TEMPLATE_LANGUAGE_IDS = LANGUAGE_IDS

/**
 * 读盘：只认对象、只认已知语言、只认字符串。
 * 值等于内置的当没存过（避免存一份「看起来已改、其实一样」的覆盖）。
 * @returns {Record<string, string>}
 */
function readOverrides() {
  const clean = {}
  try {
    const raw = window.localStorage.getItem(FILE_TEMPLATES_KEY)
    if (raw === null) return clean
    const value = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return clean
    for (const id of LANGUAGE_IDS) {
      const text = value[id]
      // 刻意判 typeof：空串是合法覆盖（= 新建时留空），真值判断会把它丢掉
      if (typeof text === 'string' && text !== BUILTIN_TEMPLATES[id]) clean[id] = text
    }
  } catch {
    /* 隐私模式 / 存档损坏：当作没存过 */
  }
  return clean
}

/** 落盘。写不进去（隐私模式 / 配额满）就只在本次会话里生效 */
function persist() {
  try {
    window.localStorage.setItem(FILE_TEMPLATES_KEY, JSON.stringify(templateOverrides))
  } catch {
    /* 忽略 */
  }
}

/**
 * 模块级单例：设置面板直接 import 它当响应式源（与 i18n 的 locale 同一体例）。
 * 只可**原地增删键**（overrides[id] = x / delete overrides[id]），整体换引用会丢响应式。
 */
export const templateOverrides = reactive(readOverrides())

// 让键恒存：见文件头「持久化时机」
persist()

/**
 * 某语言的内置默认。未知名给空串，**刻意不做 cpp 回退** ——
 * 那个宽容回退是 defaultCode() 的语义，新的模板查找不继承它。
 * @param {string} id
 */
export function builtinTemplate(id) {
  return BUILTIN_TEMPLATES[id] ?? ''
}

/**
 * 某语言当前生效的模板（用户改过用用户的，否则用内置）。
 * @param {string} id
 */
export function templateForLanguage(id) {
  return templateOverrides[id] ?? builtinTemplate(id)
}

/**
 * 路径 → 模板。先归一到语言（复用 monaco/language.js 那张唯一的扩展名表，不另抄一份），
 * 再由 langMetaByMonaco 反查 LANGUAGES 里的语言 id。
 *
 * 认不出的扩展名（`.c` 的 Monaco 语言是 'c'、`.txt` 是 'plaintext'、无扩展名文件）
 * 一律返回空串，即「没有模板 → 内容为空」，与不传 initialContent 完全等价。
 * @param {string} path
 */
export function templateForPath(path) {
  // 空路径不能喂给 languageForPath：它内部的 normalize() 对非绝对路径会抛
  if (!path) return ''
  const meta = langMetaByMonaco(languageForPath(path))
  return meta ? templateForLanguage(meta.id) : ''
}

/** @param {string} id 这一语言的模板是否被用户改过（面板据此显示左侧指示线与「恢复默认」可用态） */
export function isTemplateModified(id) {
  return templateOverrides[id] !== undefined
}

/**
 * 写入某语言的模板。文本等于内置时直接删键（等价于恢复默认），
 * 超长按 TEMPLATE_MAX_LENGTH 截断（面板的 maxlength 只是顺手挡一道，这里才是硬边界）。
 * @param {string} id
 * @param {string} text
 */
export function setTemplate(id, text) {
  if (!LANGUAGE_IDS.includes(id)) return
  const next = typeof text === 'string' ? text.slice(0, TEMPLATE_MAX_LENGTH) : ''
  if (next === builtinTemplate(id)) {
    if (templateOverrides[id] === undefined) return
    delete templateOverrides[id]
  } else {
    if (templateOverrides[id] === next) return
    templateOverrides[id] = next
  }
  persist()
}

/** 恢复某语言的内置默认（= 删掉覆盖）@param {string} id */
export function resetTemplate(id) {
  if (templateOverrides[id] === undefined) return
  delete templateOverrides[id]
  persist()
}