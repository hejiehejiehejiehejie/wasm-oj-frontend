/**
 * VFS Provider 工厂 —— 上层获取 provider 的唯一入口。
 * 进程内单例：应用生命周期内只存在一个 provider 实例。
 *
 * 未来扩展：在 REGISTRY 注册 'github' / 'cloud' 即可，调用方切换 kind，
 * 其余代码零修改。
 */
import { t } from '../../i18n/index.js'
import { LocalFolderVFSProvider } from './LocalFolderVFSProvider.js'
import { LocalVFSProvider } from './LocalVFSProvider.js'

/** @type {Record<string, () => import('./BaseVFSProvider.js').BaseVFSProvider>} */
const REGISTRY = {
  local: () => new LocalVFSProvider(),
  // 本机文件夹工作区（仅桌面端；由 migrate.js 按 cp.workspaceMode 选择）
  folder: () => new LocalFolderVFSProvider(),
}

/** @type {import('./BaseVFSProvider.js').BaseVFSProvider | null} */
let instance = null

/**
 * 创建（或返回已创建的）VFS provider。
 * @param {string} [kind] 默认 'local'
 */
export function createVFSProvider(kind = 'local') {
  if (instance) return instance
  const factory = REGISTRY[kind]
  if (!factory) throw new Error(t('error.unknownProvider', { kind }))
  instance = factory()
  return instance
}

/**
 * 取当前 provider；未初始化直接抛错（编程错误，不该被静默吞掉）。
 */
export function getVFS() {
  if (!instance) throw new Error(t('error.notInitialized'))
  return instance
}
