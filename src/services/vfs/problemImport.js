/**
 * problemImport —— 把浏览器扩展（Competitive Companion）抓到的题目落进 VFS。
 *
 * 落盘约定：一道题 = 一个代码文件，题目元数据与抓取配置都挂在**这个文件节点**上
 *   /<年月>/<OJ 标签>/<难度>/<题目名>.cpp   用户写的题解。只在首次导入时创建，此后正文一个字都不改
 *   /<年月>/<OJ 标签>/<比赛名>/<题目名>.cpp 比赛导入（调用方给 options.contestName）
 *   同节点的 node.meta   —— 题目元数据（url / oj / difficulty / date / timeLimit）
 *   同节点的 node.config —— 抓取结果原文（含全部测试样例），每次抓取整体覆盖
 *
 * 没有外层 wrapper（2026-09-30 起去掉原先的 /Problems）：题目目录直接挂在根下，与用户自己建的
 * main.cpp 等平铺。老工作区里存在的 /Problems 由 migrate.js 一次性搬空。
 *
 * 为什么要分「年月 / OJ / 难度」三层：抓来的题攒多了，平铺在一个 OJ 目录下没法看。年月粒度取到月
 * （按天会长出大量只含一个文件的目录）。比赛导入的第三层换成**比赛名**（2026-10-26 用户口径）：
 * 一场比赛就是一个天然的批次，比难度更能说明「这批文件从哪来」；难度仍然写进 meta，不丢。
 *
 * 【难度从哪来】扩展抓来的题难度一律为空（来源站点口径不一，由用户手填），落「未分类」占位；
 * 但像 Codeforces 抽题这种**自带确定 rating** 的来源，调用方把难度作为 `options.difficulty`
 * 传进来，就按它分目录（`/<年月>/<OJ>/1600/…`）。两种情形下，文件一旦落盘就不再搬动
 * ——用户后来手改了难度也不会挪目录，搬动 = 丢题解（见下面的身份判据）。
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
import { templateForPath } from '../fileTemplates.js'
import { OJ_LIST, normalizeDifficulty, normalizeMeta, todayISO } from '../problemMeta.js'
import { deactivateViews } from '../editorViews.js'
import { dirname, join, normalize, stem } from './paths.js'
import { getVFS } from './vfsFactory.js'
import { findProblemByUrl, openFile, problemUrlKey } from './workspaceStore.js'

/** 难度为空时的占位目录名（扩展抓的题都属于这一类）；用户手填难度后也不搬动已有文件 */
const UNCATEGORIZED = '未分类'

/**
 * 难度目录名。直接用难度 id 本身（CF 的分数段就是 `1600` 这样的数字），与 OJ 目录同理：
 * 目录名走 language-invariant 的 id，不搬显示名，免得切一次语言目录就跟着改名。
 * @param {string} difficulty 已经过 normalizeDifficulty 校验，要么是合法 id、要么空串
 * @returns {string}
 */
const difficultyDir = (difficulty) => (difficulty ? sanitizeName(difficulty) : UNCATEGORIZED)

/**
 * 代码文件后缀写死 cpp：扩展送来的 languages 里只有 java（TaskBuilder 的固定默认值
 * mainClass: 'Main'），拿它判断语言等于把每道题都当 Java；cpp / python 这些键
 * 上游解析器根本不写。所以这里按「没有后缀信息」处理。
 */
const CODE_EXT = '.cpp'

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
 * 【比的是 `problemUrlKey` 归一化之后的键，不是字面量】同一道 Codeforces 题有两个都合法
 * 的写法 —— `/contest/2276/problem/A`（比赛页 / 比赛列表拼出来的）与
 * `/problemset/problem/2276/A`（题库页、以及扩展在比赛页上顺着链接抓回来时给的）。
 * 早先这里比字面量，于是同一道题从两条路进来会各落一个文件：老文件里的题解成了孤儿，
 * 而「比赛抓样例」这种「先按比赛链接落题、再等扩展把样例并回来」的链路更是永远并不上
 * （样例落在另一个文件上，被当成一道新题）。归一化之后两种写法认成同一道。
 *
 * 归一化键为空（url 解析不了）时**不参与匹配**：两个空串相等会把不相干的题并到一起。
 *
 * 接口里没有 readDirectory，所以仍旧走 getTree 自己往下找；元数据就在节点上，
 * 顺手比对 `node.meta.url` 即可，不必再逐个读文件。
 * 扫全库比原先只扫一个 OJ 目录更贵，等 VFS 补上 readDirectory / 全局 url 索引后再优化。
 * @param {import('./BaseVFSProvider.js').BaseVFSProvider} vfs
 * @param {string} url
 * @returns {Promise<{ dir: string, name: string, codePath: string }|null>}
 */
async function findByUrl(vfs, url) {
  const key = problemUrlKey(url)
  if (!key) return null

  let found = null
  const walk = (nodes) => {
    for (const node of nodes) {
      if (found) return
      if (node.type === 'file' && problemUrlKey(node.meta?.url) === key) {
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
 * @param {object} [options]
 * @param {string} [options.difficulty] 已知难度（如 CF 的 rating `'1600'`）。作为元数据的初值；
 *   没有 contestName 时也决定目录（`/<年月>/<OJ>/<难度>/`）；不给（扩展抓题）则落「未分类」。
 *   用户已手填过难度时以用户填的为准
 * @param {string} [options.contestName] 比赛名。给了就让第三层目录变成它
 *   （`/<年月>/<OJ>/<比赛名>/`），难度只写进 meta、不再参与分层 —— 比赛导入的同一性判据
 * @param {boolean} [options.quiet] 不抢焦点：只落库，不切页签、不展开目录。
 *   整场抓样例（一场七八道连续投递）走这条 —— 否则页签会连着翻七八次，
 *   而且会把用户正看着的抽题面板关掉（`deactivateViews`）
 * @returns {Promise<{ name: string, ojDir: string, codePath: string, created: boolean, config: Record<string, any>, node: import('./BaseVFSProvider.js').VFSNode }>}
 */
export async function importProblem(task, options = {}) {
  if (!task || typeof task !== 'object') throw new Error(t('error.importEmpty'))

  const vfs = getVFS()
  const url = typeof task.url === 'string' ? task.url.trim() : ''
  const ojId = detectOj(url) ?? 'other'
  // 目录名刻意用 language-invariant 的 dirName，不是显示名（见 problemMeta 里那段说明）
  const ojLabel = OJ_LIST.find((item) => item.id === ojId)?.dirName ?? '其它'
  const baseName = sanitizeName(task.name)
  // 落盘与回传给调用方的是同一份（调用方要拿它里面的 tests 灌评测面板）
  const config = buildConfig(task, ojId)

  // 已知难度先过一遍该 OJ 的尺子：目录名与写进 meta 的值必须是同一个，
  // 否则会出现「目录叫 1623、元数据里却没有难度」这种自相矛盾的状态
  const difficulty = normalizeDifficulty(ojId, options.difficulty)

  // 新题的落点：/<年月>/<OJ>/<难度>（无外层 wrapper，直接与用户自己的文件平铺在根下）。
  // 没有已知难度时落「未分类」。比赛导入把第三层换成比赛名（见 options.contestName）。
  // 这个目录只用于**新题** —— 已存在的题按 url 找回原目录复用，不搬动
  const contestFolder =
    typeof options.contestName === 'string' && options.contestName.trim()
      ? sanitizeName(options.contestName)
      : ''
  const defaultDir = join(todayMonth(), ojLabel, contestFolder || difficultyDir(difficulty))
  const candidateCode = codePathOf(defaultDir, baseName)

  // 1) 快路径：算出来的新路径上文件名与 url 都对上，就是这道题
  //    url 比的是归一化键（见 findByUrl 那段）：`/problemset/problem/2276/A` 与
  //    `/contest/2276/problem/A` 是同一道题，字面量比对会把后者判成新题、另起一个文件
  let target = null
  const candidateNode = await vfs.stat(candidateCode)
  const urlKey = problemUrlKey(url)
  if (
    candidateNode?.type === 'file' &&
    (candidateNode.meta?.url === url ||
      (urlKey !== '' && problemUrlKey(candidateNode.meta?.url) === urlKey))
  ) {
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
    if (!existingCode) await vfs.createFile(codePath, templateForPath(codePath))

    // 抓取器管得着的字段（url / oj / timeLimit）每次刷新；难度以**用户手填的**为准，
    // 没填过才用本次带来的建议值（CF 的 rating）；日期只在首次导入时播种，之后不再覆盖
    const previousMeta = existingCode?.meta
    const nextNode = await vfs.setMeta(
      codePath,
      normalizeMeta({
        url,
        oj: ojId,
        difficulty: previousMeta?.difficulty || difficulty,
        date: previousMeta?.date || todayISO(),
        timeLimit: typeof task.timeLimit === 'number' && task.timeLimit > 0 ? task.timeLimit : 0,
      }),
    )

    // 样例与限制整体覆盖：用户重抓，图的就是拿到最新的。
    // 唯一的例外是**本次一个样例都没带**：抽题面板 / 比赛导入的是元数据（CF 的接口
    // 不返回样例），样例随后由扩展补进来；此时若照旧覆盖，用户再点一次「导入」就会把
    // 刚抓到的样例冲成空数组 —— 那不是「刷新」，是白抓一趟
    const incomingTests = Array.isArray(config.tests) ? config.tests : []
    const previousTests = Array.isArray(existingCode?.config?.tests) ? existingCode.config.tests : []
    const nextConfig =
      incomingTests.length === 0 && previousTests.length > 0
        ? { ...config, tests: previousTests }
        : config

    // 挂在 config 字段上而不是 meta 里 —— 上面刚整体替换过 meta，混在一起会被抹掉
    await vfs.setConfig(codePath, nextConfig)

    return nextNode
  })

  // 焦点跳转：合成视图（设置 / 抽题）可能正占着编辑器（那时 activeId 没变，editorViews 的
  // 自动让位 watch 不会触发），先显式让开；openFile 负责建 model、开页签、展开祖先目录。
  // 已经打开过这道题时 activeId 不变，EditorPane 的 watch 不响，由调用方补一次 focus。
  // quiet 时整段跳过：整场抓样例会连着投递七八道，抢焦点等于把用户的页签翻七八次
  if (!options.quiet) {
    deactivateViews()
    await openFile(node.id, node)
  }

  return { name, ojDir: dir, codePath, created: !existingCode, config, node }
}

/**
 * 打开一道**已经在工作区里**的题：按 url 找回那个文件，再把编辑器切过去。
 *
 * 【为什么要单独一个出口】2026-11-10 用户口径：抽题 / 比赛的题目行，导入之后点「除了题名
 * 与那颗勾之外的空白处」就该打开这道题的文件 —— 题名那颗链接去的是 Codeforces 网页，
 * 两个落点各归各位，同一行里不必再为「站内那份文件」找一个按钮。
 * 认题走 `findProblemByUrl`（`problemUrlKey` 归一化），所以 `/contest/…` 与
 * `/problemset/problem/…` 两种写法都能对上同一个文件。
 *
 * 【找不到就静默返回 false】没导过、或导过又被删掉，这一行本质上只是列表里的一行字，
 * 点它的空白不该冒出错误框 —— 判据（导没导过）本来就在按钮上写着。
 *
 * @param {string} url 题目地址
 * @returns {Promise<boolean>} 真的打开了文件才是 true
 */
export async function openProblemByUrl(url) {
  const node = findProblemByUrl(url)
  if (!node) return false
  // 与上面 importProblem 非 quiet 的收尾同一写法：合成视图（抽题 / 比赛页）此刻可能正盖着
  // 编辑器，先显式让开；openFile 负责建 model、开页签、展开祖先目录
  deactivateViews()
  await openFile(node.id, node)
  return true
}
