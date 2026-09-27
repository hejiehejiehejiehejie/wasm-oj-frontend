/**
 * problemImport —— 把浏览器扩展（Competitive Companion）抓到的题目落进 VFS。
 *
 * 落盘约定：一道题 = 一个代码文件 + 一份隐藏元数据，两者**同名、只差后缀**、同在 OJ 目录下
 *   /Problems/<OJ 标签>/<题目名>.cpp        用户写的题解。只在首次导入时创建，此后正文一个字都不改
 *   /Problems/<OJ 标签>/.cph/<题目名>.json  抓取结果（题目元数据 + 全部测试样例），每次抓取整体覆盖
 *
 * 为什么不给每道题套一个目录：树里多一层「题目名/」纯是噪音，点开一道题还得再点一次才见得到代码。
 * 题名直接做文件名，一眼就是这道题。代价是代码与元数据成了同级的两个条目，所以元数据必须
 * 收进 `.cph`（workspaceStore 的 withoutHiddenDirs 会把它整棵从 UI 里摘掉），不能跟代码平铺在树里。
 *
 * 为什么样例放元数据 json 而不是成对的 .in / .out：评测面板吃的是有序的
 * { input, expectedOutput } 列表，读一个 JSON 就能原样还原；拆成文件还要自己配对与排序，
 * 而且「题目元数据」与「样例」分居两处，迟早各自漂移。
 *
 * 【身份判据是 url，不是文件名】题目在来源站点被改名后再次抓取，文件名就对不上了；
 * 只认文件名会另起一个新文件，用户旧文件里写好的题解就此变成孤儿。
 * batch.id 不能用：它是扩展每次抓取现生成的一个随机 uuid，抓两次就是两个值。
 */
import { OJ_LIST, normalizeMeta, todayISO } from '../problemMeta.js'
import { deactivateSettingsTab } from '../settingsTab.js'
import { join } from './paths.js'
import { getVFS } from './vfsFactory.js'
import { openFile } from './workspaceStore.js'

/** 所有导入的题目都收在这一层下，与用户自己建的 /main.cpp 等分开 */
const ROOT_DIR = '/Problems'
/** 抓取产物目录：里面的东西都是工具写的，可以放心整体覆盖；同时被树 UI 过滤掉 */
const META_DIR = '.cph'

/**
 * 代码文件后缀写死 cpp：扩展送来的 languages 里只有 java（TaskBuilder 的固定默认值
 * mainClass: 'Main'），拿它判断语言等于把每道题都当 Java；cpp / python 这些键
 * 上游解析器根本不写。所以这里按「没有后缀信息」处理，等真做了模板功能再改这里。
 */
const CODE_EXT = '.cpp'
/** 元数据后缀：与代码文件同名、只差这一截，方便一眼对应 */
const META_EXT = '.json'
/** 模板功能还没做：新文件只放一行占位注释，不套 templates.js 的默认代码 */
const NEW_FILE_CONTENT = '// your code here\n'

/** 题目名（不含后缀）的最大长度 */
const MAX_NAME_LEN = 80
const FALLBACK_NAME = '未命名题目'
/** 名字撞车时的重试上限，超出则退回带时间戳的保底名 */
const MAX_NAME_ATTEMPTS = 50

/** VFS 只禁 '/' 与空字符，其余是 Windows 的保留字符，先挡掉免得日后换存储后端炸 */
const ILLEGAL_NAME_CHARS = /[\\/:*?"<>|\u0000-\u001f]/g

/** 域名后缀 → OJ id（problemMeta.js 的 OJ_LIST）。带子域名的用 endsWith 匹配 */
const OJ_HOSTS = [
  ['luogu', ['luogu.com.cn', 'luogu.org']],
  ['codeforces', ['codeforces.com']],
  ['atcoder', ['atcoder.jp']],
  ['nowcoder', ['nowcoder.com', 'nowcoder.net']],
  ['leetcode', ['leetcode.cn', 'leetcode.com']],
]

// ------------------------------------------------------------ 纯函数

/**
 * 从题目链接认出 OJ；认不出来返回 null（再退回 'other'）。
 * @param {string} url
 * @returns {string|null}
 */
function detectOj(url) {
  let host
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
  for (const [oj, suffixes] of OJ_HOSTS) {
    if (suffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) return oj
  }
  return null
}

/**
 * 题目名 → 合法文件名（不含后缀）。空白收成一个空格，超长截断。
 * @param {unknown} raw
 * @returns {string}
 */
function sanitizeName(raw) {
  const text = String(raw ?? '')
    .replace(ILLEGAL_NAME_CHARS, '-')
    .replace(/\s+/g, ' ')
    .trim()
    // 连续短横收成一个（'A / B' 这种被换出 'A - B' 就好，不必留双份）
    .replace(/-{2,}/g, '-')
    .slice(0, MAX_NAME_LEN)
    // 结尾的点、空格、短横会被某些文件系统悄悄吃掉，先自己收干净
    // （问号在题名里极常见：'Is It a Tree?' 替换完就留个尾巴）
    .replace(/[.\s-]+$/, '')
    .trim()
  return text || FALLBACK_NAME
}

/**
 * 落盘用的配置内容。原样保留扩展送来的字段（tests / timeLimit / memoryLimit /
 * testType / input / output / group / interactive / name …），只补上我们自己认得出的 oj
 * 与导入时间戳 —— 少存一份字段，将来要加模板或按批次分组时就得回头重抓。
 * @param {Record<string, any>} task
 * @param {string} ojId
 * @returns {Record<string, unknown>}
 */
function buildConfig(task, ojId) {
  return {
    ...task,
    oj: ojId,
    importedAt: new Date().toISOString(),
  }
}

// ------------------------------------------------------------ 路径

const codePathOf = (ojDir, name) => join(ojDir, `${name}${CODE_EXT}`)
const metaDirOf = (ojDir) => join(ojDir, META_DIR)
const configPathOf = (ojDir, name) => join(metaDirOf(ojDir), `${name}${META_EXT}`)

// ------------------------------------------------------------ 存储辅助

/**
 * 读某道题的配置；没有 / 坏了都返回 null（判据不存在，当作没匹配上）。
 * @param {import('./BaseVFSProvider.js').BaseVFSProvider} vfs
 * @param {string} ojDir
 * @param {string} name 题目名（不含后缀）
 * @returns {Promise<Record<string, any>|null>}
 */
async function readConfig(vfs, ojDir, name) {
  try {
    const parsed = JSON.parse(await vfs.readFile(configPathOf(ojDir, name)))
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

/** 目录不存在才建；已存在的同名 **文件** 交给 createDirectory 抛错，不静默造怪结构 */
async function ensureDirectory(vfs, dirPath) {
  const existing = await vfs.stat(dirPath)
  if (existing?.type === 'directory') return
  await vfs.createDirectory(dirPath)
}

/**
 * 在同一个 OJ 的元数据目录里按 url 找回题目名（题目被改过名时靠它认出来）。
 * 只在文件名那条快路径没命中时才扫，扫描成本是「该 OJ 下的题目数」次内存读。
 *
 * 接口里没有 readDirectory，所以仍旧走 getTree 自己往下找一层。
 * @param {import('./BaseVFSProvider.js').BaseVFSProvider} vfs
 * @param {string} ojDir
 * @param {string} url
 * @returns {Promise<string|null>} 题目名（不含后缀）
 */
async function findNameByUrl(vfs, ojDir, url) {
  if (!url) return null

  /** 找到指定路径的节点（getTree 只给根的子节点，要自己往下走） */
  const findNode = (nodes, path) => {
    for (const node of nodes) {
      if (node.path === path) return node
      const hit = findNode(node.children ?? [], path)
      if (hit) return hit
    }
    return null
  }

  const metaNode = findNode(await vfs.getTree(), metaDirOf(ojDir))
  for (const child of metaNode?.children ?? []) {
    if (child.type !== 'file' || !child.name.endsWith(META_EXT)) continue
    const name = child.name.slice(0, -META_EXT.length)
    if ((await readConfig(vfs, ojDir, name))?.url === url) return name
  }
  return null
}

/**
 * 取一个没被占用的题目名：原名被别的题占了就依次试 name-2、name-3…
 * 代码文件与元数据文件共用这个名字，所以两边都得是空的。
 * @param {import('./BaseVFSProvider.js').BaseVFSProvider} vfs
 * @param {string} ojDir
 * @param {string} baseName
 * @returns {Promise<string>}
 */
async function resolveFreeName(vfs, ojDir, baseName) {
  for (let index = 1; index < MAX_NAME_ATTEMPTS; index += 1) {
    const name = index === 1 ? baseName : `${baseName}-${index}`
    const codeTaken = await vfs.stat(codePathOf(ojDir, name))
    const metaTaken = await vfs.stat(configPathOf(ojDir, name))
    if (!codeTaken && !metaTaken) return name
  }
  return `${baseName}-${Date.now().toString(36)}`
}

// ------------------------------------------------------------ 主流程

/**
 * 把一份扩展解析结果导入工作区，并把编辑器切到这个代码文件上。
 * 重复抓取同一道题：正文保留，样例与元数据刷新。
 * @param {Record<string, any>} task 扩展推来的题目 JSON
 * @returns {Promise<{ name: string, ojDir: string, codePath: string, created: boolean, config: Record<string, any>, node: import('./BaseVFSProvider.js').VFSNode }>}
 */
export async function importProblem(task) {
  if (!task || typeof task !== 'object') throw new Error('题目数据为空')

  const vfs = getVFS()
  const url = typeof task.url === 'string' ? task.url.trim() : ''
  const ojId = detectOj(url) ?? 'other'
  const ojLabel = OJ_LIST.find((item) => item.id === ojId)?.label ?? '其它'
  const ojDir = join(ROOT_DIR, ojLabel)
  const baseName = sanitizeName(task.name)
  // 落盘与回传给调用方的是同一份（调用方要拿它里面的 tests 灌评测面板）
  const config = buildConfig(task, ojId)
  const candidateCode = codePathOf(ojDir, baseName)

  // 1) 文件名撞上就一定是同一道题吗？不一定。快路径先看名字，名字对上了还要 url 也对上
  let name = null
  if ((await vfs.stat(candidateCode)) && (await readConfig(vfs, ojDir, baseName))?.url === url) {
    name = baseName
  }
  // 2) 名字没对上：可能是这道题在来源站点改过名，按 url 找回旧名字
  if (!name) name = await findNameByUrl(vfs, ojDir, url)
  // 3) 确实是新题：名字没被占就直接用，否则起一个不重名的
  //    （同名文件在、但元数据里的 url 对不上，说明那是用户自己的另一个文件，不能覆盖）
  if (!name) name = (await vfs.stat(candidateCode)) ? await resolveFreeName(vfs, ojDir, baseName) : baseName

  const codePath = codePathOf(ojDir, name)
  const existingCode = await vfs.stat(codePath)

  // 整趟放进一个 batch：一次落库、一个 reset 事件，界面只重建一次树
  const node = await vfs.batch(async () => {
    await ensureDirectory(vfs, ROOT_DIR)
    await ensureDirectory(vfs, ojDir)
    await ensureDirectory(vfs, metaDirOf(ojDir))

    // 【硬要求】已存在的代码文件一个字都不动 —— 那里面是用户写的题解
    if (!existingCode) await vfs.createFile(codePath, NEW_FILE_CONTENT)

    // 抓取器管得着的字段（url / oj）每次刷新；难度是用户自己填的，保留；
    // 日期只在首次导入时播种，之后不再覆盖
    const previousMeta = existingCode?.meta
    const nextNode = await vfs.setMeta(
      codePath,
      normalizeMeta({
        url,
        oj: ojId,
        difficulty: previousMeta?.difficulty ?? '',
        date: previousMeta?.date || todayISO(),
      }),
    )

    // 样例与限制整体覆盖：用户重抓，图的就是拿到最新的
    await vfs.writeFile(configPathOf(ojDir, name), `${JSON.stringify(config, null, 2)}\n`)

    return nextNode
  })

  // 焦点跳转：设置视图可能正占着编辑器（那时 activeId 没变，settingsTab 的
  // 自动让位 watch 不会触发），先显式让开；openFile 负责建 model、开页签、展开祖先目录。
  // 已经打开过这道题时 activeId 不变，EditorPane 的 watch 不响，由调用方补一次 focus。
  deactivateSettingsTab()
  await openFile(node.id, node)

  return { name, ojDir, codePath, created: !existingCode, config, node }
}
