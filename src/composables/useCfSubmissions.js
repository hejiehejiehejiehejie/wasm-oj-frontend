/**
 * useCfSubmissions —— 比赛面板的「提交」：最新提交流 + 默认只看我 + 题目 / handle / 判定筛选。
 *
 * 【默认只看我】2026-10-28 起 handle 输入框预填我的主账号，打开这一页看到的就是自己的
 * 提交。想看别人才去改这个 handle —— 服务端 `contest.status?handle=` 先筛，而不是拉 200 条
 * 再在本地筛（旧比赛整场 60 万条提交，最近 200 条里很可能一条都不是你的）。
 *
 * 【题目与判定在本地筛】CF 的 contest.status 只认 handle / from / count，不认题目与判定；
 * 这两项只能在这一段记录里过一遍。所以它们不改请求，只改显示。
 *
 * 【切 handle 要清空重取】两种口径的记录不能混在同一份缓存里（否则改回自己后还是只看得见
 * 别人的）。setHandle 会作废在途请求并清空列表，停手 400ms 后才真正发请求 —— 每敲一个
 * 字母打一次 CF 会烧配额，也会让列表一直闪。
 *
 * 【永远只取最新的一段】Worker 把 count 收敛到 1..1000。旧比赛整场 61.5 万条、16.9MB gzip，
 * 不能全量扫。P0 给「最近 200 条」，更早的记录去 Codeforces 看 —— 完整分页是 P1 的事。
 *
 * 【合并而不是替换】比赛中的提交流 5 秒一轮：替换会让刚翻到的位置闪一下，也会丢掉
 * 因新一轮提交被挤出前 200 的旧行。按 id 合并、新的覆盖旧的（判定会从 TESTING 变终态），
 * 倒序截断到 1000 条（见 cf/submissions.js 的 mergeSubmissions）。
 *
 * 【轮询的节奏】只在「比赛进行中 + 这一页可见 + 页面在前台」时跑，5 秒一次；
 * 与榜单的 10 秒合起来 3 次 / 10 秒，在 CF 全局 1 次 / 2 秒的限流内。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import { myHandles } from '../cf/myHandle.js'
import {
  filterMine,
  mergeSubmissions,
  normalizeSubmissions,
  summarizeMine,
} from '../cf/submissions.js'
import { t } from '../i18n/index.js'
import { cfSubmissions } from '../services/cfClient.js'

const LIVE_POLL_MS = 5000
/** 一次取多少：200 条足够看「这场最近在发生什么」，再大就只是在替 CF 做分页 */
const FETCH_COUNT = 200
/** handle 是打字改的：停手后再请求（见文件头） */
const HANDLE_DEBOUNCE_MS = 400

function errorText(failure) {
  const code = failure?.code
  if (code === 'RATE_LIMITED') return t('cf.contest.errors.rateLimited')
  if (code === 'WORKER_TIMEOUT') return t('cf.contest.errors.timeout')
  if (code === 'WORKER_ERROR' || code === 'DISPOSED') return t('cf.contest.errors.worker')
  return t('cf.contest.errors.fetch', { detail: failure?.message || '' })
}

function specKey(spec) {
  if (!spec?.contestId) return ''
  return `${spec.kind || 'contest'}:${spec.groupId || ''}:${spec.contestId}`
}

/**
 * @param {{
 *   spec: import('vue').Ref<object|null>,
 *   active: import('vue').Ref<boolean>,
 *   live: import('vue').Ref<boolean>,
 * }} options
 */
export function useCfSubmissions({ spec, active, live }) {
  const rows = ref([])
  const fetchedAt = ref(0)
  const loading = ref(false)
  const error = ref('')

  const handles = computed(() => myHandles())
  const canFilterMine = computed(() => handles.value.length > 0)

  /** 筛选的 handle：默认 = 我的主账号（打开即「只看我」）；空串 = 所有人 */
  const handle = ref(handles.value[0] || '')
  const handleKey = computed(() => handle.value.trim().toLowerCase())
  const isMine = computed(
    () =>
      !!handleKey.value &&
      handles.value.some((item) => item.toLowerCase() === handleKey.value),
  )

  /** 题目：空串 = 全部。判定：all | ok | fail | pending（口径见 cf/submissions.js 的 tone） */
  const problemIndex = ref('')
  const verdict = ref('all')

  /** 我的提交（不管当前看的是谁 / 筛了什么），给「过题 / 尝试」那行小结用 */
  const mineRows = computed(() => filterMine(rows.value, handles.value))
  const summary = computed(() => summarizeMine(mineRows.value))

  /** 题目筛选的候选：从已取到的记录里现算（API 不提供题目维度的查询） */
  const problemOptions = computed(() => {
    const names = new Map()
    for (const row of rows.value) {
      if (!row.problemIndex || names.has(row.problemIndex)) continue
      names.set(row.problemIndex, row.problemName || '')
    }
    return [...names]
      .map(([index, name]) => ({ index, name }))
      .sort((a, b) => a.index.localeCompare(b.index, 'en', { numeric: true }))
  })

  const visibleRows = computed(() => {
    let list = rows.value
    if (handleKey.value) {
      // 自己的账号可能不止一个：服务端只按主账号取，其余账号在本地补齐
      list = isMine.value
        ? filterMine(list, handles.value)
        : list.filter((row) =>
            (row.members || []).some(
              (member) => String(member).toLowerCase() === handleKey.value,
            ),
          )
    }
    if (problemIndex.value) {
      list = list.filter((row) => row.problemIndex === problemIndex.value)
    }
    if (verdict.value !== 'all') {
      list = list.filter((row) => row.tone === verdict.value)
    }
    return list
  })

  // ------------------------------------------------------------ 取数

  let seq = 0
  let inFlight = null

  /** @param {{silent?: boolean, replace?: boolean}} [options] */
  async function load({ silent = false, replace = false } = {}) {
    const current = spec.value
    if (!current?.contestId) return
    if (inFlight) return inFlight

    const mine = ++seq
    const who = handle.value.trim()

    if (!silent) loading.value = true
    error.value = ''

    inFlight = cfSubmissions(current, { handle: who, count: FETCH_COUNT })
      .then((response) => {
        if (mine !== seq) return
        const page = normalizeSubmissions(response)
        rows.value = mergeSubmissions(replace ? [] : rows.value, page.rows)
        fetchedAt.value = page.fetchedAt
      })
      .catch((failure) => {
        if (mine !== seq) return
        // 轮询失败不打扰：手里有记录就继续看，下一轮再试
        if (!silent || !rows.value.length) error.value = errorText(failure)
      })
      .finally(() => {
        if (mine === seq) {
          loading.value = false
          planPoll()
          inFlight = null
        }
      })

    return inFlight
  }

  /** 换口径（换 handle）：在途那一发作废，列表清空重取 —— 两种口径不能混 */
  function reload() {
    seq += 1
    inFlight = null
    rows.value = []
    fetchedAt.value = 0
    error.value = ''
    loading.value = false
    if (active.value) void load({ replace: true })
  }

  // ------------------------------------------------------------ 筛选

  let handleTimer = 0

  function setHandle(value) {
    const next = typeof value === 'string' ? value : ''
    if (next === handle.value) return
    handle.value = next
    window.clearTimeout(handleTimer)
    handleTimer = window.setTimeout(() => {
      handleTimer = 0
      reload()
    }, HANDLE_DEBOUNCE_MS)
  }

  /** 把 handle 换回我的主账号（「只看我」） */
  function useMine() {
    window.clearTimeout(handleTimer)
    handleTimer = 0
    const next = handles.value[0] || ''
    if (next === handle.value) return
    handle.value = next
    reload()
  }

  /** 已经是我的 → 放开到所有人；否则切回只看我 */
  function toggleMine() {
    if (isMine.value) {
      window.clearTimeout(handleTimer)
      handleTimer = 0
      handle.value = ''
      reload()
      return
    }
    useMine()
  }

  /** 题目与判定只在本地过一遍，不重新请求 */
  function setProblem(index) {
    problemIndex.value = typeof index === 'string' ? index : ''
  }

  function setVerdict(next) {
    verdict.value = next === 'ok' || next === 'fail' || next === 'pending' ? next : 'all'
  }

  // ------------------------------------------------------------ 轮询与回访

  let pollTimer = 0

  function stopPoll() {
    window.clearTimeout(pollTimer)
    pollTimer = 0
  }

  function planPoll() {
    stopPoll()
    if (!active.value || document.visibilityState !== 'visible') return
    if (!live.value) return

    pollTimer = window.setTimeout(async () => {
      pollTimer = 0
      await load({ silent: true })
    }, LIVE_POLL_MS)
  }

  function onVisibilityChange() {
    if (document.visibilityState !== 'visible') {
      stopPoll()
      return
    }
    if (!active.value) return
    if (live.value) void load({ silent: true })
    else planPoll()
  }

  document.addEventListener('visibilitychange', onVisibilityChange)

  // 换了一场：记录、筛选、handle 一起归零（handle 回到我的主账号 = 默认只看我）
  watch(
    () => specKey(spec.value),
    () => {
      seq += 1
      inFlight = null
      stopPoll()
      window.clearTimeout(handleTimer)
      handleTimer = 0
      rows.value = []
      fetchedAt.value = 0
      error.value = ''
      handle.value = handles.value[0] || ''
      problemIndex.value = ''
      verdict.value = 'all'
      loading.value = false
      if (active.value) void load()
    },
  )

  // 切进这一子页 / 开赛：取一次，然后交给轮询。
  //
  // 【重新打开也要刷新（2026-10-28）】切回提交、或从别的页签切回 Codeforces 页签，active 都会
  // false → true，这里补一次。手里已经有记录时走静默：不亮 loading、不清列表，只把新记录合并
  // 进来、把「刷新于 X 前」的时刻更新 —— 这就是「再次打开就自己刷一下」。
  // 第一次进来（手里什么都没有）才亮 loading，那时候本来就该说「正在获取提交…」。
  watch(
    [active, live],
    ([visible, running], previous) => {
      const wasVisible = previous?.[0] === true
      const wasRunning = previous?.[1] === true
      if (!visible) {
        stopPoll()
        return
      }
      if (!wasVisible || (running && !wasRunning)) {
        void load({ silent: rows.value.length > 0 })
        return
      }
      planPoll()
    },
    { immediate: true },
  )

  // 账号改了：当前看的是我（或是还没填过的空 handle）时跟着换；正在看别人就不打扰
  watch(handles, (next, previous) => {
    const primary = next[0] || ''
    const previousPrimary = previous?.[0] || ''
    const following =
      !handle.value || handle.value.toLowerCase() === previousPrimary.toLowerCase()
    if (!following || handle.value === primary) return
    window.clearTimeout(handleTimer)
    handleTimer = 0
    handle.value = primary
    reload()
  })

  onBeforeUnmount(() => {
    stopPoll()
    window.clearTimeout(handleTimer)
    seq += 1
    document.removeEventListener('visibilitychange', onVisibilityChange)
  })

  const refresh = () => load()

  return {
    rows,
    visibleRows,
    fetchedAt,
    loading,
    error,
    handle,
    isMine,
    canFilterMine,
    setHandle,
    toggleMine,
    problemIndex,
    verdict,
    problemOptions,
    setProblem,
    setVerdict,
    mineRows,
    summary,
    handles,
    load,
    refresh,
  }
}
