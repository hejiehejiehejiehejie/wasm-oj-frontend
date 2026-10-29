/**
 * CF 段位：rating → 段位键（只给界面配色用）。
 *
 * 七档就够：CF 的十个段位里 master / international master 同色，三个 grandmaster
 * 同色，其余各占一档。颜色本身写在 CfCodeforcesPanel 的 `.cf-rank--*` 里，
 * 这里只负责「多少分算哪一档」—— 分界线取 CF 官方那几条（1600 / 1900 / 2100 / 2400
 * 是跨段位的大格）。
 */

/** @typedef {'newbie'|'pupil'|'specialist'|'expert'|'candidate-master'|'master'|'grandmaster'} CfRank */

/**
 * @param {unknown} rating
 * @returns {CfRank | null} 不是数字（未打过 rated 比赛 / 字段缺失）返回 null ——
 *   怎么显示由调用方决定（CF 站上未定级账号画成 newbie 灰，胶囊照这个口径）
 */
export function cfRankOf(rating) {
  if (typeof rating !== 'number' || !Number.isFinite(rating)) return null
  if (rating < 1200) return 'newbie'
  if (rating < 1400) return 'pupil'
  if (rating < 1600) return 'specialist'
  if (rating < 1900) return 'expert'
  if (rating < 2100) return 'candidate-master'
  if (rating < 2400) return 'master'
  return 'grandmaster'
}
