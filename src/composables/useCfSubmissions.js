/**
 * useCfSubmissions —— 比赛面板的「提交」：最新提交流 + 只看我 + 比赛中的轮询。
 *
 * 【只看我走服务端过滤】`contest.status?handle=` 让 CF 先筛，而不是拉 200 条再在本地筛 ——
 * 旧比赛整场 60 万条提交，最近 200 条里很可能一条都不是你的。切「只看我」会清空列表
 * 重新取一份，两种口径的记录不混在同一份缓存里（否则关掉筛选后还是只看得见自己的）。
 *
 * 【永远只取最新的一段】Worker 把 count 收敛到 1..1000。比赛越大越不能全量扫：
 * 2266 那种老场次整场 61.5 万条、16.9MB gzip。P0 给「最近 200 条（或我的最近 200 条）」，
 * 更早的记录去 Codeforces 看 —— 完整历史分页是 P1 的事。
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

function errorText(failure) {
  const code = failure?.code
  if (code === 'RATE_LIMITED') return t('cf.contest.errors.rateLimited')
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
  /** 只看我：界面上的开关，只在本会话有效（换一场自动关掉） */
  const onlyMine = ref(false)

  const handles = computed(() => myHandles())
  const canFilterMine = computed(() => handles.value.length > 0)

  /** 我的提交（不管当前筛选），给「过题 / 尝试」那行小结用 */
  const mineRows = computed(() => filterMine(rows.value, handles.value))
  const summary = computed(() => summarizeMine(mineRows.value))

  const visibleRows = computed(() =>
    onlyMine.value ? filterMine(rows.value, handles.value) : rows.value,
  )

  // ------------------------------------------------------------ 取数

  let seq = 0
  let inFlight = null

  /** @param {{silent?: boolean, replace?: boolean}} [options] */
  async function load({ silent = false, replace = false } = {}) {
    const current = spec.value
    if (!current?.contestId) return

    if (onlyMine.value && !canFilterMine.value) return
    if (inFlight) return inFlight

    const mine = ++seq
    // 服务端只认一个 handle：多个账号时用第一个筛，本地 visibleRows 再按整组过一遍
    const handle = onlyMine.value ? handles.value[0] || '' : ''

    if (!silent) loading.value = true
    error.value = ''

    inFlight = cfSubmissions(current, { handle, count: FETCH_COUNT })
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

  /**
   * 切「只看我」：清空后重取。两个口径的记录不能混 —— 关掉筛选时若还留着服务端筛出来的
   * 那一份，看到的仍然是「只有我」。
   */
  function setOnlyMine(value) {
    const next = value === true && canFilterMine.value
    if (next === onlyMine.value) return
    onlyMine.value = next
    // 在途那一发是按旧口径取的：作废它，否则它回来会把这半份旧列表填进新口径里
    seq += 1
    inFlight = null
    rows.value = []
    fetchedAt.value = 0
    error.value = ''
    if (active.value) void load({ replace: true })
  }

  function toggleMine() {
    setOnlyMine(!onlyMine.value)
  }

  // 换了一场：记录与筛选一起归零
  watch(
    () => specKey(spec.value),
    () => {
      seq += 1
      inFlight = null
      stopPoll()
      rows.value = []
      fetchedAt.value = 0
      error.value = ''
      onlyMine.value = false
      loading.value = false
      if (active.value) void load()
    },
  )

  // 切进这一子页 / 开赛：取一次，然后交给轮询
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
        void load({ silent: wasVisible })
        return
      }
      planPoll()
    },
    { immediate: true },
  )

  // 「只看我」开着时换了账号：按新账号重取（在途那一发同理作废）
  watch(handles, () => {
    if (!onlyMine.value) return
    seq += 1
    inFlight = null
    if (!canFilterMine.value) {
      onlyMine.value = false
      rows.value = []
      if (active.value) void load({ replace: true })
      return
    }
    if (active.value) void load({ replace: true })
  })

  onBeforeUnmount(() => {
    stopPoll()
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
    onlyMine,
    canFilterMine,
    toggleMine,
    mineRows,
    summary,
    handles,
    load,
    refresh,
  }
}
