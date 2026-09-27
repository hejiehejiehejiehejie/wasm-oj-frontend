/**
 * 工作区启动 + 旧数据一次性迁移。
 *
 * 流程：创建 provider → init → 首次（且根为空）时把 localStorage 里的旧
 * 「每语言草稿」cph.drafts 导入为 /main.cpp、/main.py → 写迁移标记。
 *
 * 幂等：标记 cph.vfsMigrated='1' 后永不再迁移；根非空也不重复种子。
 * 旧 key 保留不删，可回退；迁移后应用不再读 cph.drafts。
 */
import { defaultCode } from '../templates.js'
import { createVFSProvider } from './vfsFactory.js'

const MIGRATION_KEY = 'cph.vfsMigrated'

/** 读旧草稿；任何异常都回空对象，由默认模板兜底 */
function readLegacyDrafts() {
  try {
    const raw = window.localStorage.getItem('cph.drafts')
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * 初始化工作区 VFS。
 * @param {string} [kind] provider 类型，默认本地
 * @returns {Promise<import('./BaseVFSProvider.js').BaseVFSProvider>}
 */
export async function initWorkspace(kind = 'local') {
  const vfs = createVFSProvider(kind)
  await vfs.init()

  if (window.localStorage.getItem(MIGRATION_KEY) !== '1') {
    const tree = await vfs.getTree()
    if (tree.length === 0) {
      const drafts = readLegacyDrafts()
      await vfs.batch(async () => {
        await vfs.createFile(
          '/main.cpp',
          typeof drafts.cpp === 'string' ? drafts.cpp : defaultCode('cpp'),
        )
        await vfs.createFile(
          '/main.py',
          typeof drafts.python === 'string' ? drafts.python : defaultCode('python'),
        )
      })
    }
    try {
      window.localStorage.setItem(MIGRATION_KEY, '1')
    } catch {
      /* 标记写不进去（存储禁用）：下次启动会再跑一次种子，幂等无副作用 */
    }
  }

  return vfs
}
