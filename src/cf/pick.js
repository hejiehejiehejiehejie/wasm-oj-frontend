/**
 * pick.js —— Codeforces 随机抽题的**纯逻辑**：无框架、无存储、无网络。
 *
 * 刻意什么都不依赖：它被 cfWorker 引进 Worker 里跑，也能直接在 Node 里跑测试
 * （第 1 步就是这么验证的），换技术栈时这段可以原样搬走。
 *
 * 逻辑移植自用户既有的实现，只做两处适配：
 * 1) 结果转成本项目 importProblem 认的 task（name / url / timeLimit / tests）；
 * 2) 去掉原实现里「写入题目标签」的字段落点 —— 本项目节点 meta 没有 tags，
 *    标签只用于筛选与界面展示。
 */

/** Rating 预设区间（沿用原实现的分段）。纯数字、语言无关，界面直接渲染 `min–max`。 */
export const RATING_PRESETS = [
  { min: 1300, max: 1600 },
  { min: 1700, max: 1800 },
  { min: 1900, max: 2000 },
  { min: 2100, max: 2200 },
  { min: 2300, max: 2400 },
]

/**
 * 常用标签（2026-10-29，标签从「手输逗号串」改成点选）。
 *
 * **每一项必须逐字等于 Codeforces 标签原文**（全小写英文）：筛选拿它跟题目的 tags 数组
 * 逐项比对，`normalizeTags` 只做小写收敛，不做同义词映射 —— 写成 `binary-search`
 * 或 `Binary Search` 都会一个都匹配不上。
 *
 * 只收最常撞见的一批：CF 一共三十多个标签，全铺在 330px 的卡片里会占掉半屏。
 * 不在列表里的标签并不会失效 —— 旧的手输值照旧生效，并且会以选中态出现在同一片
 * 芯片里（见 CfPickerPanel 的 tagOptions），点一下就能取消。
 */
export const TAG_PRESETS = [
  'dp',
  'greedy',
  'math',
  'implementation',
  'brute force',
  'binary search',
  'constructive algorithms',
  'data structures',
  'graphs',
  'trees',
  'strings',
  'two pointers',
]

/** 抽取数量的上下限，界面的数字框与这里的夹取要一致 */
export const COUNT_MIN = 1
export const COUNT_MAX = 10

/**
 * 比赛类别（2026-11-08）。八个桶照 cftracker 的 ContestCat 原样搬来：
 * Div. 1 / Div. 2 / Div. 3 / Div. 4 / Edu / Div. 1+2 / Global / Others。
 *
 * **id 是进偏好与消息的那一份**，界面文案在 i18n（`cf.picker.cats.*`）——
 * 与 tags 同一条纪律：数据层只认机器码，切语言不必改存储。
 * 数组顺序即芯片顺序（Div. 1 → 4，再两种混合场，最后兜底）。
 * 注意 `div12` 排在 `div2` 之后、`global` 之前：它们是「这场算不算 Div. 1+2」的并列答案，
 * 判据只维护在 contestCategory 里，这里只是渲染顺序。
 */
export const CONTEST_CATS = ['div1', 'div2', 'div3', 'div4', 'edu', 'div12', 'global', 'others']

/**
 * 题号（A–M）。CF 的 index 绝大多数是单个字母，超过 M 的（N–R）历史上不到 20 道，
 * 不值得为它们在 330px 的卡片里多挤两格 —— 用户要的就是「第几题」这一层。
 */
export const PROBLEM_LETTERS = 'ABCDEFGHIJKLM'.split('')

/**
 * 按名字判不准的场次，照 cftracker 的硬编码清单（判定本身仍然优先于名字）：
 *  - 2010 `Testing Round 19 (Div. 3)`：名字里有 Div. 3，但它是测试场，不是真 Div. 3；
 *  - 1930 `think-cell Round 1`、2029 `Refact.ai Match 1 (Codeforces Round 985)`：
 *    赞助商冠名的合场，名字里没有 `Div`，实际是 Div. 1 + Div. 2。
 */
const CATEGORY_OVERRIDES = new Map([
  [2010, 'others'],
  [1930, 'div12'],
  [2029, 'div12'],
])

/**
 * 比赛名 → 类别 id。
 *
 * 【为什么按名字判】CF 的接口没有「这场比赛是 Div 几」这个字段，`contest.list` 只给名字；
 * 名字里的写法还不统一（`Div. 1` / `Div.1` / `Div 2` / `Rated for Div. 2` 都出现过），
 * 所以先收敛成一种再判。判据顺序与 cftracker 一致：
 * Educational → Global → 同时有 1 和 2（Div. 1 + Div. 2）→ 单个 1/2/3/4 → Good Bye / Hello（合场）→ 其余。
 *
 * 【为什么 Educational / Global 排最前】`Educational ... (Rated for Div. 2)` 与
 * `Global Round 31 (Div. 1 + Div. 2)` 都带着 Div 字样，先判 Div 会把它们拆进 Div. 2 / Div. 1+2，
 * 而它们各自是一类独立的比赛（题量、难度曲线都不一样）。
 *
 * @param {string} name 比赛名（`contest.list` 的那份）
 * @param {number} [contestId] 用于特例表
 * @returns {string} CONTEST_CATS 里的一个 id
 */
export function contestCategory(name, contestId) {
  const override = CATEGORY_OVERRIDES.get(Number(contestId))
  if (override) return override

  // `Div.1` / `Div 2` / `Div. 2` 一律收敛成 `Div. 1` 这种写法，下面只认这一种
  const text = String(name ?? '').replace(/Div\s*\.?\s*([1-4])/gi, 'Div. $1')

  if (/Educational/i.test(text)) return 'edu'
  if (/Global/i.test(text)) return 'global'

  const divisions = new Set()
  for (const match of text.matchAll(/Div\.\s*([1-4])/g)) divisions.add(match[1])
  if (divisions.has('1') && divisions.has('2')) return 'div12'
  if (divisions.has('1')) return 'div1'
  if (divisions.has('2')) return 'div2'
  if (divisions.has('3')) return 'div3'
  if (divisions.has('4')) return 'div4'

  // 「Good Bye 2025」「Hello 2026」这类年末 / 年初场是 Div. 1 + Div. 2，名字里却没有 Div
  if (/\b(Good Bye|Hello)\b/i.test(text)) return 'div12'
  return 'others'
}

/**
 * 题目的「第几题」：取 index 的首字母。
 * CF 的 index 可能是 `B`、`B1`、`B2`（同一题的两个子任务）—— 用户按题号筛「B」时，
 * 这三道都是 B 题，所以只取首字母，不要求整串相等。
 * 数字 index（`14`、`09`，题库里十几道远古 ACM 题）没有首字母，返回 `''`，任何题号筛选都不命中。
 * @param {unknown} index
 * @returns {string} 单个大写字母，或空串
 */
export function problemLetter(index) {
  const match = /^[A-Za-z]/.exec(String(index ?? '').trim())
  return match ? match[0].toUpperCase() : ''
}

/**
 * 比赛类别输入归一化：接受 `"div2, edu"` 字符串或数组，只留 CONTEST_CATS 里认识的 id。
 * 认不出的（拼错、旧版残留）直接丢掉 —— 留着会让筛选「条件在生效、界面上却看不见」，
 * 与 normalizeTags 里那条纪律同一个理由。
 * @param {unknown} raw
 * @returns {string[]}
 */
export function normalizeCats(raw) {
  const list = Array.isArray(raw) ? raw : String(raw ?? '').split(',')
  const cats = []
  for (const item of list) {
    const id = String(item ?? '').trim().toLowerCase()
    if (CONTEST_CATS.includes(id) && !cats.includes(id)) cats.push(id)
  }
  return cats
}

/**
 * 题号输入归一化：接受 `"A,B"` / `['A','b']`，收敛成大写的单个字母，且只认 A–M。
 * @param {unknown} raw
 * @returns {string[]}
 */
export function normalizeLetters(raw) {
  const list = Array.isArray(raw) ? raw : String(raw ?? '').split(',')
  const letters = []
  for (const item of list) {
    const letter = String(item ?? '').trim().toUpperCase()
    if (PROBLEM_LETTERS.includes(letter) && !letters.includes(letter)) letters.push(letter)
  }
  return letters
}

/** 「优先近期新题」时的远古题软过滤阈值：contestId 小于它的算旧题 */
const RECENT_CUTOFF = 1000

/** 题目的稳定标识，形如 `1234:A`。用于排除已 AC 与跨次去重（index 统一大写，可能是 `B1`） */
export function problemKey(problem) {
  return `${problem.contestId}:${String(problem.index).toUpperCase()}`
}

/** 题目链接 */
export function problemUrl(problem) {
  return `https://codeforces.com/contest/${problem.contestId}/problem/${problem.index}`
}

/**
 * 标签输入归一化：接受 `"dp, math"` 字符串或数组，统一成小写去重数组。
 * CF 的标签本身是英文小写（dp / greedy / math…），这里做大小写不敏感的收敛，
 * 免得用户输 `DP` 就一个都匹配不上。
 * @param {unknown} raw
 * @returns {string[]}
 */
export function normalizeTags(raw) {
  const list = Array.isArray(raw) ? raw : String(raw ?? '').split(',')
  const tags = []
  for (const item of list) {
    const tag = String(item ?? '').trim().toLowerCase()
    if (tag && !tags.includes(tag)) tags.push(tag)
  }
  return tags
}

/**
 * 账号输入归一化：接受 `"tourist, hejie"` 字符串或数组，拆成去重后的账号列表。
 *
 * CF 的 handle 只由字母、数字、`_`、`-`、`.` 组成，不含逗号与空白，所以逗号、顿号、
 * 分号、空白都能安全地当分隔符（中英文标点都认，用户从别处粘过来不必手改）。
 * 去重按小写：CF 的 handle 大小写不敏感，同一个账号的两种写法不该查两遍。
 * @param {unknown} raw
 * @returns {string[]}
 */
export function normalizeHandles(raw) {
  const list = Array.isArray(raw) ? raw : String(raw ?? '').split(/[,，、;；\s]+/)
  const handles = []
  const seen = new Set()
  for (const item of list) {
    const handle = String(item ?? '').trim()
    const key = handle.toLowerCase()
    if (handle && !seen.has(key)) {
      seen.add(key)
      handles.push(handle)
    }
  }
  return handles
}

/**
 * 转成 importProblem 认的 task。名字带上题号（`CF2024A Watermelon`）：
 * 同一道题名在不同场次里重名很常见，光用题名做文件名会失去辨识度。
 *
 * timeLimit 一律 0：problemset 接口不返回时限（那是每道题页面上才有的），
 * 由用户之后在题目信息里手填。tests 为空：CF 官方接口不给样例。
 * @param {Record<string, any>} problem
 * @returns {{ name: string, url: string, timeLimit: number, tests: Array<never> }}
 */
export function cfProblemToTask(problem) {
  const letter = String(problem.index).toUpperCase()
  return {
    name: `CF${problem.contestId}${letter} ${problem.name}`.trim(),
    url: problemUrl(problem),
    timeLimit: 0,
    tests: [],
  }
}

/**
 * 随机抽题核心。
 *
 * @param {Array<Record<string, any>>} problems CF 原始题目数组（problemset.problems）
 * @param {object} [options]
 * @param {number|null} [options.ratingMin] 难度下限（含）；未给则不限
 * @param {number|null} [options.ratingMax] 难度上限（含）
 * @param {string[]} [options.tags] 标签，**AND 语义**（必须全部命中）
 * @param {number} [options.count] 抽取数量（会夹取到 COUNT_MIN..COUNT_MAX）
 * @param {boolean} [options.requireRated] 是否要求题目有 rating
 * @param {boolean} [options.excludeSolved] 是否排除已 AC
 * @param {Set<string>|null} [options.solvedSet] 已 AC 的题目键集合（problemKey 的产物）
 * @param {boolean} [options.preferNew] 优先近期新题（加权算法）
 * @param {Set<string>|null} [options.excludeKeys] 要额外剔掉的一批题目键（「换一批」传上一批）
 * @param {Set<number>|null} [options.contestIds] 允许的比赛 id 集合（按比赛类别筛出来的），null/空 = 不限
 * @param {string[]} [options.letters] 题号（A–M），只留首字母命中的；空 = 不限
 * @returns {Array<Record<string, any>>} 抽中的原始 problem（可能为空数组 = 无匹配）
 */
export function pickRandomCF(problems, options = {}) {
  const {
    ratingMin = null,
    ratingMax = null,
    tags = [],
    count = 1,
    requireRated = false,
    excludeSolved = false,
    solvedSet = null,
    preferNew = false,
    excludeKeys = null,
    contestIds = null,
    letters = [],
  } = options

  const targetCount = Math.max(COUNT_MIN, Math.min(Number(count) || 1, COUNT_MAX))
  // 题号是逐题比对的，先用 Set 收一遍：一场比赛抽 10 道题时这是最内层的那条判断
  const letterSet = new Set(letters)

  /** 这道题是否满足全部硬性条件；skipKeys 是要额外剔掉的一批（只在后一轮过滤里给 null） */
  const matches = (problem, skipKeys) => {
    const rating = typeof problem.rating === 'number' ? problem.rating : null
    if (requireRated && rating == null) return false
    if (ratingMin != null && rating != null && rating < ratingMin) return false
    if (ratingMax != null && rating != null && rating > ratingMax) return false
    // 比赛类别：主线程只把「选中的那几类」翻成一个 contestId 集合送进来，
    // 类别怎么判（名字 → Div 几）是 Worker 的事，这里只认集合。
    // ⚠️ 判据是 `contestIds != null` 而不是 `size`：勾了类别却一道题都不沾（集合是空的）
    // 必须**抽不到**并照实报 NO_MATCH；若按 size 判，空集合会被当成「不限」，
    // 于是用户勾着一个什么都没有的类别，抽出来的却是全题库的题。
    if (contestIds && !contestIds.has(problem.contestId)) return false
    if (letterSet.size && !letterSet.has(problemLetter(problem.index))) return false
    // 交互 / special 题（`*special`）不适合当练习，直接剔掉
    if ((problem.tags || []).some((tag) => tag === '*special')) return false
    if (tags.length) {
      const own = new Set((problem.tags || []).map((tag) => String(tag).toLowerCase()))
      for (const tag of tags) if (!own.has(tag)) return false
    }
    if (excludeSolved && solvedSet?.size && solvedSet.has(problemKey(problem))) return false
    if (skipKeys?.size && skipKeys.has(problemKey(problem))) return false
    return true
  }

  // 1) 过滤
  let pool = problems.filter((problem) => matches(problem, excludeKeys))
  // 「换一批」：上一批照例要剔掉（否则加权随机会把同一批题反复端上来），
  // 但剔完不够抽就得把上一批放回来 —— 宁可重复，也不能让「换一批」变成「无匹配」
  if (excludeKeys?.size && pool.length < targetCount) {
    pool = problems.filter((problem) => matches(problem, null))
  }

  if (!pool.length) return []

  if (preferNew) {
    // 2a) 软过滤远古题：题目足够（≥ 目标数 ×3）才剔，否则宁可保留也不给「无匹配」
    const recentPool = pool.filter((problem) => (problem.contestId || 0) >= RECENT_CUTOFF)
    if (recentPool.length >= targetCount * 3) pool = recentPool

    // contestId 越大越新，排到前面
    pool.sort((a, b) => (b.contestId || 0) - (a.contestId || 0))

    const result = []
    for (let i = 0; i < targetCount; i += 1) {
      if (!pool.length) break
      // random()^4 让约 68% 概率落在最靠前的那 20%，尾部被大幅压缩
      const skewedIndex = Math.floor(Math.pow(Math.random(), 4) * pool.length)
      result.push(pool[skewedIndex])
      pool.splice(skewedIndex, 1) // 抽走，避免同一批里重复
    }
    return result
  }

  // 2b) 均匀模式：Fisher-Yates 洗牌后取前 N
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, targetCount)
}
