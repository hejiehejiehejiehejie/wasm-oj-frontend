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

/** 抽取数量的上下限，界面的数字框与这里的夹取要一致 */
export const COUNT_MIN = 1
export const COUNT_MAX = 10

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
  } = options

  const targetCount = Math.max(COUNT_MIN, Math.min(Number(count) || 1, COUNT_MAX))

  /** 这道题是否满足全部硬性条件；skipKeys 是要额外剔掉的一批（只在后一轮过滤里给 null） */
  const matches = (problem, skipKeys) => {
    const rating = typeof problem.rating === 'number' ? problem.rating : null
    if (requireRated && rating == null) return false
    if (ratingMin != null && rating != null && rating < ratingMin) return false
    if (ratingMax != null && rating != null && rating > ratingMax) return false
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
