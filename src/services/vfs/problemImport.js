/**
 * problemImport —— 把浏览器扩展（Competitive Companion）抓到的题目落进 VFS。
 *
 * 落盘约定：一道题 = 一个代码文件，题目元数据与抓取配置都挂在**这个文件节点**上
 *   /<年月>/<OJ 标签>/<难度>/<题目名>.cpp   用户写的题解。只在首次导入时创建，此后正文一个字都不改
 *   同节点的 node.meta   —— 题目元数据（url / oj / difficulty / date / timeLimit）
 *   同节点的 node.config —— 抓取结果原文（含全部测试样例），每次抓取整体覆盖
 *
 * 没有外层 wrapper（2026-09-30 起去掉原先的 /Problems）：题目目录直接挂在根下，与用户自己建的
 * main.cpp 等平铺。老工作区里存在的 /Problems 由 migrate.js 一次性搬空。
 *
 * 为什么要分「年月 / OJ / 难度」三层：抓来的题攒多了，平铺在一个 OJ 目录下没法看。年月粒度取到月
 * （按天会长出大量只含一个文件的目录）；难度导入时一律为空（来源站点口径不一，由用户手填），
 * 先落「未分类」占位，用户填了不会自动搬动（见下面的身份判据）。
 *
 * 为什么不给每道题套一个目录：树里多一层「题目名/」纯是噪音，点开一道题还得再点一次才见得到代码。
 * 题名直接做文件名，一眼就是这道题。元数据不另立文件（早期做法是在同级藏一份同名 json），
 * 而是挂在文件节点上：树里不会多出用户既不该编辑也不该删的条目，也就省掉了一整层 UI 隐藏过滤。
 *
 * 为什么 meta 与 config 拆成两个字段：题目信息弹窗改难度走 updateFileMeta → setMeta，
 * 而 setMeta 是**整体替换** meta 的。样例若也存在 meta 里，用户一改难度就会把样例抹掉。
 *
 * 为什么样例整合成一坨 JSON 而不是成对的 .in / .out：评测面板吃的是有序的
 * { input, expectedOutput } 列表，读一个 config 就能原样还原；拆成文件还要自己配对与排序，
 * 而且「题目元数据」与「样例」分居两处，迟早各自漂移。
 *
 * 【身份判据是 url，不是文件名】题目在来源站点被改名后再次抓取，文件名就对不上了；
 * 只认文件名会另起一个新文件，用户旧文件里写好的题解就此变成孤儿。
 * batch.id 不能用：它是扩展每次抓取现生成的一个随机 uuid，抓两次就是两个值。
 *
 * 路径分层以后，同一道题再抓一次可能算出**不同的**日期 / 难度目录，所以认题时先按「算出来的
 * 新路径」走快路径，不中就必须**全库按 url** 找回原来那个目录并复用 —— 只扫某一个 OJ 目录
 * 会让老题在新结构下永远找不到，旧题解变孤儿。这也意味着目录结构一旦定下就跟着题走：
 * 用户后来填了难度、或跨月再抓，都不会把已有文件搬走（搬动 = 丢题解）。
 */
import { t } from '../../i18n/index.js'
import { OJ_LIST, normalizeMeta, todayISO } from '../problemMeta.js'
import { deactivateSettingsTab } from '../settingsTab.js'
import { dirname, join, normalize, stem } from './paths.js'
import { getVFS } from './vfsFactory.js'
import { openFile } from './workspaceStore.js'

/** 难度为空时的占位目录名：导入时难度一律为空，用户手填后也不搬动已有文件 */
const UNCATEGORIZED = '未分类'

/**
 * 代码文件后缀写死 cpp：扩展送来的 languages 里只有 java（TaskBuilder 的固定默认值
 * mainClass: 'Main'），拿它判断语言等于把每道题都当 Java；cpp / python 这些键
 * 上游解析器根本不写。所以这里按「没有后缀信息」处理，等真做了模板功能再改这里。
 */
const CODE_EXT = '.cpp'
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

const codePathOf = (dir, name) => join(dir, `${name}${CODE_EXT}`)

/** 落盘用的年月，形如 2026-09（日期粒度按月，避免长出大量只含一个文件的目录） */
const todayMonth = () => todayISO().slice(0, 7)

// ------------------------------------------------------------ 存储辅助

/**
 * 逐级确保目录存在（createDirectory 要求父目录已存在，所以从根往下走）。
 * 某一级已存在同名 **文件** 时交给 createDirectory 抛错，不静默造怪结构。
 */
async function ensureDirectory(vfs, dirPath) {
  let current = ''
  for (const part of normalize(dirPath).split('/').filter(Boolean)) {
    current += `/${part}`
    const existing = await vfs.stat(current)
    if (existing?.type === 'directory') continue
    await vfs.createDirectory(current)
  }
}

/**
 * 全库按 url 找回已有题目（题目改名、或落盘目录随日期 / 难度变化时靠它认出来）。
 * 返回题目所在目录、名字与**实际代码路径**，调用方复用该目录，不搬文件。
 *
 * 接口里没有 readDirectory，所以仍旧走 getTree 自己往下找；元数据就在节点上，
 * 顺手比对 `node.meta.url` 即可，不必再逐个读文件。
 * 扫全库比原先只扫一个 OJ 目录更贵，等 VFS 补上 readDirectory / 全局 url 索引后再优化。
 * @param {import('./BaseVFSProvider.js').BaseVFSProvider} vfs
 * @param {string} url
 * @returns {Promise<{ dir: string, name: string, codePath: string }|null>}
 */
async function findByUrl(vfs, url) {
  if (!url) return null

  let found = null
  const walk = (nodes) => {
    for (const node of nodes) {
      if (found) return
      if (node.type === 'file' && node.meta?.url === url) {
        // name 只用于日志 / 返回值展示，认路径靠 codePath（用户可能把后缀改成了别的）
        found = { dir: dirname(node.path), name: stem(node.name), codePath: node.path }
        return
      }
      if (node.children) walk(node.children)
    }
  }
  walk(await vfs.getTree())
  return found
}

/**
 * 取一个没被占用的题目名：原名被别的题占了就依次试 name-2、name-3…
 * 元数据挂在代码文件自己的节点上，所以只看这个路径空不空就够了。
 * @param {import('./BaseVFSProvider.js').BaseVFSProvider} vfs
 * @param {string} dir
 * @param {string} baseName
 * @returns {Promise<string>}
 */
async function resolveFreeName(vfs, dir, baseName) {
  for (let index = 1; index < MAX_NAME_ATTEMPTS; index += 1) {
    const name = index === 1 ? baseName : `${baseName}-${index}`
    if (!(await vfs.stat(codePathOf(dir, name)))) return name
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
  if (!task || typeof task !== 'object') throw new Error(t('error.importEmpty'))

  const vfs = getVFS()
  const url = typeof task.url === 'string' ? task.url.trim() : ''
  const ojId = detectOj(url) ?? 'other'
  // 目录名刻意用 language-invariant 的 dirName，不是显示名（见 problemMeta 里那段说明）
  const ojLabel = OJ_LIST.find((item) => item.id === ojId)?.dirName ?? '其它'
  const baseName = sanitizeName(task.name)
  // 落盘与回传给调用方的是同一份（调用方要拿它里面的 tests 灌评测面板）
  const config = buildConfig(task, ojId)

  // 新题的落点：/<年月>/<OJ>/<难度>（无外层 wrapper，直接与用户自己的文件平铺在根下）。
  // 难度导入时一律为空（来源站点口径不一），先落「未分类」
  const defaultDir = join(todayMonth(), ojLabel, UNCATEGORIZED)
  const candidateCode = codePathOf(defaultDir, baseName)

  // 1) 快路径：算出来的新路径上文件名与 url 都对上，就是这道题
  let target = null
  const candidateNode = await vfs.stat(candidateCode)
  if (candidateNode?.type === 'file' && candidateNode.meta?.url === url) {
    target = { dir: defaultDir, name: baseName, codePath: candidateCode }
  }
  // 2) 没对上：可能改了名，也可能落在别的年月 / 难度目录里，全库按 url 找回并复用那个目录
  if (!target) target = await findByUrl(vfs, url)
  // 3) 确实是新题：名字没被占就直接用，否则起一个不重名的
  //    （同名文件在、但节点上的 url 对不上，说明那是用户自己的另一个文件，不能覆盖）
  if (!target) {
    const name = candidateNode ? await resolveFreeName(vfs, defaultDir, baseName) : baseName
    target = { dir: defaultDir, name, codePath: codePathOf(defaultDir, name) }
  }

  const { dir, name, codePath } = target
  const existingCode = await vfs.stat(codePath)

  // 整趟放进一个 batch：一次落库、一个 reset 事件，界面只重建一次树
  const node = await vfs.batch(async () => {
    await ensureDirectory(vfs, dir)

    // 【硬要求】已存在的代码文件一个字都不动 —— 那里面是用户写的题解
    if (!existingCode) await vfs.createFile(codePath, NEW_FILE_CONTENT)

    // 抓取器管得着的字段（url / oj / timeLimit）每次刷新；难度是用户自己填的，保留；
    // 日期只在首次导入时播种，之后不再覆盖
    const previousMeta = existingCode?.meta
    const nextNode = await vfs.setMeta(
      codePath,
      normalizeMeta({
        url,
        oj: ojId,
        difficulty: previousMeta?.difficulty ?? '',
        date: previousMeta?.date || todayISO(),
        timeLimit: typeof task.timeLimit === 'number' && task.timeLimit > 0 ? task.timeLimit : 0,
      }),
    )

    // 样例与限制整体覆盖：用户重抓，图的就是拿到最新的。
    // 挂在 config 字段上而不是 meta 里 —— 上面刚整体替换过 meta，混在一起会被抹掉
    await vfs.setConfig(codePath, config)

    return nextNode
  })

  // 焦点跳转：设置视图可能正占着编辑器（那时 activeId 没变，settingsTab 的
  // 自动让位 watch 不会触发），先显式让开；openFile 负责建 model、开页签、展开祖先目录。
  // 已经打开过这道题时 activeId 不变，EditorPane 的 watch 不响，由调用方补一次 focus。
  deactivateSettingsTab()
  await openFile(node.id, node)

  return { name, ojDir: dir, codePath, created: !existingCode, config, node }
}
