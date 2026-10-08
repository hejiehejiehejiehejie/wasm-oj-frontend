/**
 * 工作区启动 + 旧数据一次性迁移。
 *
 * 流程：创建 provider → init → 首次（且根为空）时把 localStorage 里的旧
 * 「每语言草稿」cph.drafts 导入为 /main.cpp、/main.py → 写迁移标记。
 *
 * 幂等：每个迁移各有一个标记，置 '1' 后永不再跑；根非空也不重复种子。
 * 旧 key 保留不删，可回退；迁移后应用不再读 cph.drafts。
 *
 * 抓题的落盘结构（2026-09-30 起）直接在根下分层，见 problemImport.js，所以：
 *   ① 不再种子 /Problems 与 /Contest 两个外壳目录（骨架由用户自己长出来）；
 *   ② 老工作区里已有的 /Problems 内容一次性搬上根一层，搬空的壳与 /Contest 一起删掉。
 *
 * 抓题元数据的形态（本次）也从「同级隐藏的 .cph/<题目名>.json」改成挂在代码文件节点上，
 * 所以还有第三个一次性迁移：把 json 内容并进节点的 config 字段，再把 .cph 目录删掉。
 */
import { defaultCode } from '../templates.js'
import { createVFSProvider } from './vfsFactory.js'
import { getWorkspaceMode } from './workspaceMode.js'
import { stem } from './paths.js'

const MIGRATION_KEY = 'cp.vfsMigrated'
/** 布局迁移标记：去掉抓题的外层 /Problems 后只跑一次，与上面的草稿迁移互不干涉 */
const LAYOUT_KEY = 'cp.workspaceLayoutV2'
/** 元数据内联迁移标记：老 .cph/*.json 只往节点上搬一次 */
const META_INLINE_KEY = 'cp.problemMetaInline'
/** 旧的外壳目录：一个装过题，一个给比赛模式预留（比赛模式至今没做） */
const LEGACY_SHELLS = ['/Problems', '/Contest']
/** 老版抓题产物目录名（见 problemImport.js）：这次迁移要连它一起清掉 */
const LEGACY_META_DIR = '.cph'
/** 老版抓题产物后缀：与同级代码文件同名、只差这一截 */
const LEGACY_META_EXT = '.json'

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
 * 一次性迁移：把老版「同级隐藏的 `.cph/<题目名>.json`」搬进同级代码文件的 `config` 字段。
 *
 * 老结构（本次改造前）里，一道题的抓取结果与代码是两个条目：
 *   <题目录>/<题目名>.cpp        题解（正文一个字都不动）
 *   <题目录>/.cph/<题目名>.json  抓取结果（题目元数据 + 全部测试样例）
 * 新结构把 `.cph` 整个取消，json 的内容并进代码文件节点；题目身份（url）本来就在节点的
 * `meta` 上（导入时就写过），所以这里只搬 config，不碰 meta，也不碰任何正文。
 *
 * 配对规则**只看名字**：json 的「主干」与同目录某个文件的主干相同即为那一对的代码文件。
 * 配对不上或 json 坏掉时，那一项原样留着 —— 连 `.cph` 目录一起保留。宁可留个看得见的残留，
 * 也不猜一个文件去挂：挂错了等于把样例塞进别的题，比残留难发现得多。
 *
 * 另外清掉「只有 .cph 一个子项的题目录」：老结构里这层目录是「代码 + 元数据」的壳，
 * 代码若早被用户搬走，删完 .cph 就只剩个空壳挂在树里。
 */
async function migrateProblemMetaInline(vfs) {
  const tree = await vfs.getTree()

  /** 待处理：题目录（父）与其中的 .cph 目录（子） */
  const jobs = []
  const walk = (nodes) => {
    for (const node of nodes) {
      if (node.type !== 'directory') continue
      const siblings = node.children ?? []
      const metaDir = siblings.find(
        (child) => child.type === 'directory' && child.name === LEGACY_META_DIR,
      )
      if (metaDir) jobs.push({ dir: node.path, siblings, metaDir })
      walk(siblings)
    }
  }
  walk(tree)
  if (!jobs.length) return

  await vfs.batch(async () => {
    for (const job of jobs) {
      let unmatched = 0
      for (const entry of job.metaDir.children ?? []) {
        if (entry.type !== 'file' || !entry.name.endsWith(LEGACY_META_EXT)) continue
        const name = stem(entry.name)
        const code = job.siblings.find((child) => child.type === 'file' && stem(child.name) === name)
        let config = null
        if (code) {
          try {
            const parsed = JSON.parse(await vfs.readFile(entry.path))
            if (parsed && typeof parsed === 'object') config = parsed
          } catch {
            /* 坏 json 当配对失败处理 */
          }
        }
        if (!config) {
          unmatched += 1
          continue
        }
        await vfs.setConfig(code.path, config)
      }
      if (unmatched) continue
      await vfs.delete(job.metaDir.path)
      if (job.dir !== '/' && job.siblings.length === 1) await vfs.delete(job.dir)
    }
  })
}

/**
 * 解析启动时要用的 provider 类型：`'folder'` = 本机文件夹，其余（含缺省）= 本地虚拟工作区。
 *
 * 兼容三种入参：`undefined`（读持久化的模式，App.vue 走这条）、字符串 `'folder'` / `'local'`、
 * 以及 `{ kind }` 对象。**folder 与 vfs 是两套后端**，这里只认这一个二值判定。
 * @param {string|{kind?: string}|undefined} mode
 * @returns {'local'|'folder'}
 */
function resolveKind(mode) {
  const raw = typeof mode === 'string' ? mode : mode?.kind
  return (raw ?? getWorkspaceMode()) === 'folder' ? 'folder' : 'local'
}

/**
 * 初始化工作区 VFS。
 * @param {string|{kind?: string}} [mode] 工作区类型；缺省时读 cp.workspaceMode
 * @returns {Promise<import('./BaseVFSProvider.js').BaseVFSProvider>}
 */
export async function initWorkspace(mode) {
  const kind = resolveKind(mode)
  const vfs = createVFSProvider(kind)
  await vfs.init()

  // 本机文件夹：磁盘上已有的东西就是工作区全部内容。**不播种、不跑三个一次性迁移、
  // 也不写迁移标记** —— 那三个标记是全局的（属于虚拟工作区那份数据），写了会让切回
  // 虚拟工作区时迁移本体丢失、永远不再执行。
  if (kind === 'folder') return vfs

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

  // 老版把抓题结果放在同级隐藏的 .cph/*.json 里；现在并进代码文件的 config 字段，这里搬一次。
  // 排在布局迁移之后：题目录可能刚从 /Problems 搬到根下，先归位再就地配对。
  if (window.localStorage.getItem(META_INLINE_KEY) !== '1') {
    await migrateProblemMetaInline(vfs)
    markDone(META_INLINE_KEY)
  }

  return vfs
}
