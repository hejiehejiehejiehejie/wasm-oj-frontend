/**
 * cfVirtualContest —— 站内开过的虚拟参赛（VP）账本（2026-11-03）。
 *
 * 【为什么要记】VP 一开，这场在用户眼里就换了一个开赛时刻：Codeforces 的 `contest.list`
 * 仍把它算作「已结束」，而站内赛程要像正式参赛那样，把它摆到 VP 开始的那一刻，并且在
 * 开赛前锁住题面与榜单。这份「这一场 VP 什么时候开始」只有开 VP 的那一方知道：
 * ① 站内开成功时当场记一笔（recordVirtualContest）；② 用户在别处开的，由扩展从 CF 的
 * 「Recent virt. contests」侧栏读回来（adoptVirtualContests，见 CC-for-Web 的 contestActions.ts）。
 *
 * 【为什么不用 contest.list 推】那个接口里没有 VP 这回事 —— 它给的是比赛的官方时刻，
 * 不会因为某个人开了 VP 而改变。VP 是账号级事实，只能从 CF 页面上读。
 *
 * 【设备事实】与 cfStartReminder 的记录同一性质：在**这台设备**上开的 VP，
 * **绝不进云同步白名单**。读写都在本模块，键见 storageNames.js。
 */
import { ref } from 'vue'

import { CF_VIRTUAL_CONTESTS_KEY } from './storageNames.js'

/** 一场 VP 结束多久之后从账本里清掉：足够跨过一次复盘，又不让存档越攒越多 */
const KEEP_AFTER_END_MS = 7 * 24 * 60 * 60 * 1000

/** 拿不到时长时，按「开始后这么久」当作结束（只为清理存档，不参与任何界面判断） */
const KEEP_UNKNOWN_MS = 7 * 24 * 60 * 60 * 1000

/**
 * 刚在站内开成功的那一场，CF 的「Recent virt. contests」可能还没渲染出来。
 * 采纳时给这段宽限，避免「刚开完就被自己读回来的空列表冲掉」。
 */
const RECENT_GRACE_MS = 5 * 60 * 1000

function toEntry(raw) {
  const id = String(raw?.id ?? '')
  const startMs = Number(raw?.startMs)

  if (!/^\d+$/.test(id) || !Number.isFinite(startMs) || startMs <= 0) return null

  return {
    id,
    name: String(raw?.name || ''),
    startMs,
    durationMs: Math.max(0, Number(raw?.durationMs) || 0),
    recordedAt: Number(raw?.recordedAt) || Date.now(),
  }
}

function readEntries() {
  try {
    const raw = window.localStorage.getItem(CF_VIRTUAL_CONTESTS_KEY)
    const parsed = raw === null ? [] : JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(toEntry).filter(Boolean) : []
  } catch {
    return []
  }
}

function endOf(entry) {
  const durationMs = Math.max(0, Number(entry?.durationMs) || 0)
  return Number(entry?.startMs) + (durationMs > 0 ? durationMs : KEEP_UNKNOWN_MS)
}

function pruneEntries(entries, now = Date.now()) {
  const line = now - KEEP_AFTER_END_MS
  return entries.filter((entry) => endOf(entry) > line)
}

function writeEntries(entries) {
  try {
    window.localStorage.setItem(CF_VIRTUAL_CONTESTS_KEY, JSON.stringify(entries))
  } catch {
    /* 隐私模式 / 配额满：这一次的 VP 不会被记住，比赛本身不受影响 */
  }
}

/** 账本本体（按开始时刻从早到晚）。模块级单例：赛程、比赛页、榜单读的都是这一份 */
export const virtualContests = ref(pruneEntries(readEntries()))

function commit(entries) {
  const next = pruneEntries(entries)
  const before = JSON.stringify(virtualContests.value)
  const after = JSON.stringify(next)
  if (before === after) return
  virtualContests.value = next
  writeEntries(next)
}

/** 这一场有没有 VP；没有返回 null */
export function virtualContestOf(contestId) {
  const id = String(contestId ?? '')
  if (!id) return null
  return virtualContests.value.find((entry) => entry.id === id) || null
}

/**
 * 站内开 VP 成功那一刻记一笔。
 *
 * `startMs` 是用户在确认卡片上选的时刻（毫秒）；没选 / 解析不出时调用方传 0，
 * 这里退回「此刻」—— CF 那边提交时不带时刻就是按现在开始。
 *
 * 同一场重复记录按 id 覆盖：以最后一次为准（用户在 CF 上改过开始时间也不会两头打架，
 * 下次采纳时 CF 的列表还会再校正一次）。
 */
export function recordVirtualContest({ id, name = '', startMs = 0, durationMs = 0 } = {}) {
  const entry = toEntry({ id, name, startMs: Number(startMs) || Date.now(), durationMs, recordedAt: Date.now() })
  if (!entry) return null

  commit([...virtualContests.value.filter((item) => item.id !== entry.id), entry])
  return entry
}

/**
 * 采纳扩展从 CF「Recent virt. contests」读回来的列表。
 *
 * 【为什么是覆盖而不是只增】那一页就是账号当前真正的 VP 集合：用户在 CF 上删掉一场 VP，
 * 站内也不该继续把它当成「待开赛」。所以成功读到列表时以它为准，只给刚在站内开成功的
 * 那几分钟留宽限（见 RECENT_GRACE_MS），避免提交与下一次读列表抢跑。
 *
 * @param {Array<{id: string, name?: string, startMs: number}>} entries
 */
export function adoptVirtualContests(entries) {
  if (!Array.isArray(entries)) return

  const now = Date.now()
  const adopted = new Map()

  for (const raw of entries) {
    const entry = toEntry({ ...raw, recordedAt: raw?.recordedAt || now })
    if (!entry) continue
    // 列表本身不带时长：手里已有同 id 的时长就接着用，缺了由赛程的元数据补
    const previous = virtualContestOf(entry.id)
    adopted.set(entry.id, {
      ...entry,
      name: entry.name || previous?.name || '',
      durationMs: entry.durationMs || previous?.durationMs || 0,
    })
  }

  for (const entry of virtualContests.value) {
    if (adopted.has(entry.id)) continue
    if (entry.recordedAt > now - RECENT_GRACE_MS) adopted.set(entry.id, entry)
  }

  commit([...adopted.values()].sort((a, b) => a.startMs - b.startMs))
}
