/**
 * 工作区启动 + 旧数据一次性迁移。
 *
 * 流程：创建 provider → init → 首次（且根为空）时把 localStorage 里的旧
 * 「每语言草稿」cph.drafts 导入为 /main.cpp、/main.py → 写迁移标记。
 *
 * 幂等：标记 cph.vfsMigrated='1' 后永不再迁移；根非空也不重复种子。
 * 旧 key 保留不删，可回退；迁移后应用不再读 cph.drafts。
 *
 * 抓题的落盘结构（2026-09-30 起）直接在根下分层，见 problemImport.js，所以：
 *   ① 不再种子 /Problems 与 /Contest 两个外壳目录（骨架由用户自己长出来）；
 *   ② 老工作区里已有的 /Problems 内容一次性搬上根一层，搬空的壳与 /Contest 一起删掉。
 */
import { defaultCode } from '../templates.js'
import { createVFSProvider } from './vfsFactory.js'

const MIGRATION_KEY = 'cph.vfsMigrated'
/** 布局迁移标记：去掉抓题的外层 /Problems 后只跑一次，与上面的草稿迁移互不干涉 */
const LAYOUT_KEY = 'cph.workspaceLayoutV2'
/** 旧的外壳目录：一个装过题，一个给比赛模式预留（比赛模式至今没做） */
const LEGACY_SHELLS = ['/Problems', '/Contest']

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

/** 写迁移标记；存储被禁用时静默失败（下次启动再跑一次，两个迁移都幂等） */
function markDone(key) {
  try {
    window.localStorage.setItem(key, '1')
  } catch {
    /* 写不进去：重跑无副作用 */
  }
}

/**
 * 一次性布局迁移：把老 /Problems 下的条目逐个上移到根，再把两个空壳目录删掉。
 *
 * 只搬条目本身（rename 会一并改子树的 path），**不碰任何文件正文**。
 * 根下已有同名条目时跳过那一项、原样留在 /Problems 里 —— 宁可留个壳，也不覆盖用户数据；
 * 因此删壳前会重新看一眼树，确认真的空了才删（/Contest 同理，用户往里放过东西就不删）。
 */
async function migrateLegacyShells(vfs) {
  await vfs.batch(async () => {
    const before = await vfs.getTree()
    const legacyRoot = before.find((node) => node.path === '/Problems' && node.type === 'directory')
    if (legacyRoot) {
      const taken = new Set(before.map((node) => node.name))
      for (const child of legacyRoot.children ?? []) {
        if (taken.has(child.name)) continue
        await vfs.rename(child.path, `/${child.name}`)
      }
    }

    // 搬完重取一次（batch 内 rename 已即时改过内存索引，这里看到的就是新结构）
    const after = await vfs.getTree()
    for (const path of LEGACY_SHELLS) {
      const node = after.find((entry) => entry.path === path && entry.type === 'directory')
      if (node && (node.children ?? []).length === 0) await vfs.delete(path)
    }
  })
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
    markDone(MIGRATION_KEY)
  }

  // 老工作区把题目存在 /Problems 下；现在改挂根下，这里搬一次并清掉两个旧壳。
  // 新工作区没有这两个目录，跑下来就是空操作。
  if (window.localStorage.getItem(LAYOUT_KEY) !== '1') {
    await migrateLegacyShells(vfs)
    markDone(LAYOUT_KEY)
  }

  return vfs
}
