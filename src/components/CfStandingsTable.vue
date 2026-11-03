<template>
  <!-- 排行榜：官方榜（API 不含 VP / 非正式参赛者）。
       2026-10-28 改版：拆掉表格的竖线与外框 —— 只剩行间淡线 + 悬停面；
       表头 / 表尾贴边，题格按计分制只换文字色（见 cf/standings.js）。 -->
  <section class="cf-standings">
    <!-- 抬头只剩右侧的非正式名次入口：比赛名在面板抬头已经有了，
         「排行榜」是页签本身，人数 / 官方榜口径 / 类型这些重复信息不再写一遍。
         刷新时间已经并进页签行那句「刷新于 20 秒前」（见 CfContestPanel），这里不再重复。
         扩展不支持 / 没有 handle 时整行不出现 —— 空的 32px 抬头只会白占一段留白 -->
    <div v-if="!locked && canLookupUnofficial" class="cf-head">
      <span class="cf-head__actions">
        <button
          type="button"
          class="cf-btn"
          :title="t('cf.contest.standings.unofficialHint')"
          :disabled="unofficialLoading"
          @click="lookupUnofficial"
        >
          <LoadingSpinner v-if="unofficialLoading" :size="11" />
          <span>
            {{
              unofficialLoading
                ? t('cf.contest.standings.unofficialLoading')
                : t('cf.contest.standings.unofficial')
            }}
          </span>
        </button>
      </span>
    </div>

    <!-- 口径行：冻结 / 实时 / 非正式名次这几句状态提示。没有提示时整行不出现 -->
    <div v-if="!locked && (frozen || live || showUnofficialLine)" class="cf-standings__meta">
      <span v-if="frozen" class="cf-standings__warn">{{ t('cf.contest.standings.frozen') }}</span>
      <span v-if="live" class="cf-standings__live">{{ t('cf.contest.standings.live') }}</span>
      <span
        v-if="showUnofficialLine"
        class="cf-standings__unofficial"
        :class="`is-${unofficialLine.tone}`"
      >
        {{ unofficialLine.text }}
      </span>
    </div>

    <!-- VP 还没开始：整页锁住。这与「这场还没开赛」是两种境况 —— 官方榜其实早就有了，
         但不能在用户自己定的开赛时刻之前摆出来 -->
    <p v-if="locked" class="cf-note">{{ t('cf.contest.standings.vpLocked') }}</p>
    <p v-else-if="error" class="cf-note is-error">{{ error }}</p>
    <p v-else-if="pending" class="cf-note">{{ t('cf.contest.standings.notStarted') }}</p>
    <p v-else-if="!rows.length && loading" class="cf-note">
      {{ t('cf.contest.standings.loading') }}
    </p>
    <p v-else-if="!rows.length" class="cf-note">{{ t('cf.contest.standings.empty') }}</p>

    <template v-if="rows.length">
      <!-- 我的位置置顶：翻到第几页、往下滚多远都看得见（粘在 .cf-view 的滚动区顶边）。
           名次是官方榜里的名次；非正式名次仍由抬头那颗按钮单独查 -->
      <div v-if="myRow" class="cf-standings__pin">
        <span class="cf-standings__pin-rank">
          {{ t('cf.contest.standings.myRank', { rank: myRow.row.rank ?? '—' }) }}
        </span>
        <span class="cf-standings__pin-name" :title="myRow.row.name">{{ myRow.row.name }}</span>
        <span class="cf-standings__pin-score">{{ myScoreLine }}</span>
        <button
          type="button"
          class="cf-standings__pin-jump"
          :title="t('cf.contest.standings.jumpHint')"
          @click="gotoMyRank"
        >
          {{ t('cf.contest.standings.jump') }}
        </button>
      </div>

      <div class="cf-standings__scroll">
        <table class="cf-table">
          <thead>
            <tr>
              <th class="cf-table__rank">{{ t('cf.contest.standings.rank') }}</th>
              <th class="cf-table__who">{{ t('cf.contest.standings.who') }}</th>
              <th class="cf-table__score" :title="scoreHeaderHint">{{ scoreHeader }}</th>
              <th
                v-for="problem in problems"
                :key="problem.index"
                class="cf-table__problem"
                :title="problemTitle(problem)"
              >
                {{ problem.index }}
              </th>
            </tr>
          </thead>
          <tbody>
            <!-- 虚拟参赛自己那一行（2026-11-03）：官方榜的 API 里没有非正式参赛者，
                 这一行是扩展从 CF 的榜单页读回来的。名次是**含非正式的合并名次**，
                 不能插进官方榜的序号之间 —— 所以摆在表头下的第一行，用 VP 标记说明口径 -->
            <tr v-if="vpRow" class="is-vp">
              <td class="cf-table__num" :title="t('cf.contest.standings.unofficialMine', { rank: vpRow.rank })">
                {{ vpRow.rank }}
              </td>
              <td class="cf-table__who">
                <span class="cf-table__vp-tag">{{ t('cf.contest.standings.vpRow') }}</span>
                <span class="cf-table__name" :title="vpRow.handle">{{ vpRow.handle }}</span>
              </td>
              <td class="cf-table__num">{{ vpRow.score || '—' }}</td>
              <td
                v-for="problem in problems"
                :key="problem.index"
                class="cf-table__cell"
                :class="`is-${vpCellTone(vpRow.cells[problem.index] || '')}`"
                :title="problemTitle(problem)"
              >
                <span class="cf-table__main">{{ vpRow.cells[problem.index] || '·' }}</span>
              </td>
            </tr>
            <tr
              v-for="row in displayRows"
              :key="row.partyId ?? row.rank"
              :class="{ 'is-mine': row.mine, 'is-ghost': row.ghost }"
            >
              <td class="cf-table__num">{{ row.rank ?? '—' }}</td>
              <td class="cf-table__who">
                <span
                  v-if="row.unofficial"
                  class="cf-table__star"
                  :title="t('cf.contest.standings.unofficialMarkHint')"
                >*</span>
                <span class="cf-table__name" :title="row.name">{{ row.name }}</span>
                <span v-if="row.ghost" class="cf-table__sub">
                  {{ t('cf.contest.standings.ghost') }}
                </span>
              </td>
              <td class="cf-table__num" :title="row.scoreTitle">
                {{ row.score }}
                <span v-if="row.scoreSub" class="cf-table__sub">{{ row.scoreSub }}</span>
              </td>
              <td
                v-for="(cell, index) in row.cells"
                :key="index"
                class="cf-table__cell"
                :class="`is-${cell.tone}`"
                :title="cell.title"
              >
                <span class="cf-table__main">{{ cell.main }}</span>
                <span v-if="cell.sub" class="cf-table__sub">{{ cell.sub }}</span>
              </td>
            </tr>
          </tbody>
          <!-- 表尾：每题多少人通过 / 尝试（CF 榜单表尾那行 Accepted / Tried）。
               整场口径（不是当前页），由手里这份榜单现算，不额外取数 —— 见 problemStatistics。
               贴着滚动区底边：翻到第 20 页也看得见。 -->
          <tfoot class="cf-table__foot">
            <tr>
              <td class="cf-table__num"></td>
              <td class="cf-table__who">
                <span class="cf-table__foot-label">{{ t('cf.contest.standings.statsAccepted') }}</span>
                <span class="cf-table__foot-tried">{{ t('cf.contest.standings.statsTried') }}</span>
              </td>
              <td class="cf-table__num"></td>
              <td
                v-for="(stat, index) in problemStats"
                :key="`stat-${problems[index]?.index ?? index}`"
                class="cf-table__cell cf-table__foot-cell"
                :title="statTitle(stat, index)"
              >
                <span class="cf-table__foot-label">{{ stat.solved }}</span>
                <span class="cf-table__foot-tried">{{ stat.tried }}</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div v-if="pageCount > 1" class="cf-pager">
        <button type="button" class="cf-btn" :disabled="page <= 1" @click="gotoPage(page - 1)">
          {{ t('cf.contest.standings.prev') }}
        </button>
        <span class="cf-pager__label">
          {{ t('cf.contest.standings.page', { page, count: pageCount }) }}
        </span>
        <button
          type="button"
          class="cf-btn"
          :disabled="page >= pageCount"
          @click="gotoPage(page + 1)"
        >
          {{ t('cf.contest.standings.next') }}
        </button>
      </div>
    </template>
  </section>
</template>

<script setup>
/**
 * CfStandingsTable —— 比赛面板的「排行榜」。
 *
 * 【为什么分页在客户端】API 没有分页参数，一次给全（2–6MB）。DOM 画不下 15,000 行，
 * 所以每页 100 行、页码只在本地切（见 useCfStandings）。
 *
 * 【题格不在这里重算分】`row.points` 已经是 CF 算好的总分（含逐题衰减与 hack 增减），
 * 题格只按 cf/standings.js 的 `problemCell` 画「得分 / 通过时刻」。没通过的题格主行是
 * 红字 `-N`（交了几次没过，CF 的 ICPC 榜单也是这么画）；通过的题把被拒次数只放悬停
 * 说明里（CF 同款）。表尾另有一行「通过 / 尝试」，由整场榜单现算，不额外取数。
 *
 * 【我在榜单里的位置置顶】`myRow` 存在时，表格上方粘一条「我：第 N 名 · 选手 · 计分摘要」，
 * 往下滚、翻到第 20 页都看得见；条尾那颗「跳到我」翻到我的名次所在页。名次是**官方榜**
 * 里的名次，含非正式的总名次仍由抬头那颗按钮单独查（另一个口径，别混）。
 *
 * 【只有官方榜】API 的 standings 只含 CONTESTANT。这句口径不再重复写在页面上（人数 / 类型
 * 在页签与面板抬头已经说得够清楚），只在数据里真出现非正式行时给名字前一枚 `*`（CF 的标法）；
 * 接口本身不会带 —— 原因与代价见 cf/standings.js 顶部那段。
 *
 * 【非正式名次是另一条路（扩展）】官方榜看不见 VP，所以另给一颗按钮，由扩展去读 CF 的好友榜
 * （拿不到时退到合并榜第一页）数出含非正式参赛者的名次。它只在用户点按时才开 CF 标签页，
 * 能力协商不过在时按钮不出现 —— 官方榜那一页的行为一字不变。
 *
 * 【虚拟参赛（2026-11-03）】开赛前整页锁住（locked，见 useCfStandings）；开赛之后自动把
 * 自己那一行读回来摆在表头下第一行（名次 + 逐题成绩，扩展读 CF 的合并榜）。那一行的名次
 * 含非正式参赛者，与官方榜的序号不同尺，所以带一枚 VP 标记单独成行，不冒充官方名次。
 */
import { computed, ref, toRef, watch } from 'vue'

import { cellTitle, problemCell } from '../cf/standings.js'
import LoadingSpinner from './LoadingSpinner.vue'
import { t } from '../i18n/index.js'
import { useCfStandings } from '../composables/useCfStandings.js'
import {
  canReadUnofficialRank,
  requestUnofficialRank,
} from '../composables/useCompanionBridge.js'

const props = defineProps({
  /** `parseContestSpec` 的产物；没有它这一页什么都不做 */
  spec: { type: Object, default: null },
  /** 这一子页此刻看不看得见（面板的 tab === 'standings'） */
  active: { type: Boolean, default: false },
  /** 比赛此刻是否进行中（轮询开关，由 useCfContest 的 status 推出来） */
  live: { type: Boolean, default: false },
  /** 这一场在这台设备上开了虚拟参赛（VP） */
  vp: { type: Boolean, default: false },
  /** VP 还没到点：整页锁住（见 useCfStandings 与 cfVirtualContest） */
  locked: { type: Boolean, default: false },
})

const {
  loading,
  error,
  pending,
  frozen,
  rows,
  problems,
  problemStats,
  kind,
  fetchedAt,
  page,
  pageCount,
  pageRows,
  myRow,
  handles,
  isMine,
  gotoPage,
  gotoMyRank,
  refresh,
} = useCfStandings({
  spec: toRef(props, 'spec'),
  active: toRef(props, 'active'),
  live: toRef(props, 'live'),
  locked: toRef(props, 'locked'),
})

/** 「刷新」在页签行右侧（见 CfContestPanel）：动作、loading 与上次刷新时刻都从这一层露出去 */
defineExpose({ refresh: refreshAll, loading, fetchedAt })

/** 分数列的表头随计分制变：ICPC 是「过题数」，CF / IOI 是分数 */
const scoreHeader = computed(() =>
  kind.value === 'icpc'
    ? t('cf.contest.standings.solved')
    : t('cf.contest.standings.score'),
)

const scoreHeaderHint = computed(() =>
  kind.value === 'icpc'
    ? t('cf.contest.standings.solvedHint')
    : t('cf.contest.standings.scoreHint'),
)

function formatPoints(points) {
  if (typeof points !== 'number' || !Number.isFinite(points)) return '—'
  return Number.isInteger(points) ? String(points) : points.toFixed(1)
}

function scoreOf(row) {
  return formatPoints(row.points)
}

/** 分数下面那行小字：CF 挂 hack 次数与罚时，ICPC 挂罚时，IOI 不挂 */
function scoreSubOf(row) {
  const notes = []
  if (kind.value === 'cf') {
    if (row.successfulHacks > 0) notes.push(`+${row.successfulHacks}`)
    if (row.unsuccessfulHacks > 0) notes.push(`-${row.unsuccessfulHacks}`)
  }
  if (kind.value !== 'ioi' && typeof row.penalty === 'number' && row.penalty > 0) {
    notes.push(String(row.penalty))
  }
  return notes.join(' ')
}

function scoreTitleOf(row) {
  const notes = []
  if (typeof row.points === 'number') notes.push(`${t('cf.contest.standings.score')} ${formatPoints(row.points)}`)
  if (typeof row.penalty === 'number') notes.push(`${t('cf.contest.standings.penalty')} ${row.penalty}`)
  if (row.successfulHacks > 0) notes.push(`+${row.successfulHacks}`)
  if (row.unsuccessfulHacks > 0) notes.push(`-${row.unsuccessfulHacks}`)
  return notes.join(' · ')
}

/** 置顶行右侧的计分摘要：ICPC 是「过 N 题 · 罚时 P」，CF / IOI 是分数（CF 另挂 hack 增减） */
const myScoreLine = computed(() => {
  const row = myRow.value?.row
  if (!row) return ''

  if (kind.value === 'icpc') {
    return [
      t('cf.contest.standings.pinSolved', { n: row.points ?? '—' }),
      typeof row.penalty === 'number'
        ? t('cf.contest.standings.pinPenalty', { n: row.penalty })
        : '',
    ]
      .filter(Boolean)
      .join(' · ')
  }

  const notes = [t('cf.contest.standings.pinPoints', { n: formatPoints(row.points) })]
  if (row.successfulHacks > 0) notes.push(`+${row.successfulHacks}`)
  if (row.unsuccessfulHacks > 0) notes.push(`-${row.unsuccessfulHacks}`)
  return notes.join(' · ')
})

/**
 * 一页行 → 可直接画的形状。
 *
 * 【为什么要预计算】每格都要调 problemCell / cellTitle。放在模板里，任何一次重渲染
 * （翻页、切主题、轮询把 standings 换掉）都会把 100×题数 次函数调用重跑一遍；
 * 这里算一次，模板只读结果。
 */
const displayRows = computed(() =>
  pageRows.value.map((row) => ({
    ...row,
    mine: isMine(row),
    score: scoreOf(row),
    scoreSub: scoreSubOf(row),
    scoreTitle: scoreTitleOf(row),
    cells: (row.results || []).map((cell, index) => ({
      ...problemCell(kind.value, cell, problems.value[index]),
      title: cellTitle(cell, kind.value),
    })),
  })),
)

function problemTitle(problem) {
  const notes = [problem.name].filter(Boolean)
  if (problem.maxPoints != null) notes.push(String(problem.maxPoints))
  else if (problem.rating != null) notes.push(String(problem.rating))
  return `${problem.index}. ${notes.join(' · ')}`
}

/** 表尾统计格的说明：题号 + 通过 / 尝试。数字小、列窄，悬停才给完整口径 */
function statTitle(stat, index) {
  return `${problems.value[index]?.index ?? ''} · ${t('cf.contest.standings.statsHint', {
    solved: stat.solved,
    tried: stat.tried,
  })}`
}

/**
 * 「20 秒前刷新 / 1 分钟前刷新 / 1 小时 20 分钟前刷新」的相对时刻已经并进页签行那句
 * 「刷新于 …」（见 CfContestPanel）：这边只把 fetchedAt 露出去，不再自己算、也不再多挂
 * 一个每秒的定时器。
 */

// ------------------------------------------------------------ 非正式名次（扩展）

/** 扩展最近一次的回答；null = 还没查过（或刚换了一场） */
const unofficial = ref(null)
const unofficialLoading = ref(false)

/** 有榜、有 handle、扩展支持：缺任何一个这颗按钮都没有意义 */
const canLookupUnofficial = computed(
  () =>
    canReadUnofficialRank.value &&
    handles.value.length > 0 &&
    rows.value.length > 0 &&
    !!props.spec?.contestId,
)

/** 多个 handle 时取最好的那个名次（自己哪号参赛都算「我」） */
const unofficialBest = computed(() => {
  const ranks = unofficial.value?.ranks || []
  return ranks.reduce((best, item) => (best === null || item.rank < best.rank ? item : best), null)
})

/**
 * VP 自己那一行：只有开赛之后、而且扩展真读回了名次才出现。
 *
 * 名次来自 CF 的合并榜（含非正式参赛者），与官方榜的序号不是同一个尺子 —— 所以它是单独
 * 一行（带 VP 标记），不插进官方榜的行里冒充某个名次。
 */
const vpRow = computed(() => {
  if (!props.vp || props.locked) return null
  const best = unofficialBest.value
  if (!best) return null
  return {
    rank: best.rank,
    handle: best.handle,
    score: best.score || '',
    cells: best.cells || {},
  }
})

/** VP 行已经把那句「含非正式：第 N 名」说全了，口径行不再重复；失败 / 查询中的提示照旧 */
const showUnofficialLine = computed(() => !!unofficialLine.value && !vpRow.value)

/** 题格按 CF 的写法上色：`+1 00:23` 是通过（含被拒次数），`-2` 是还没过 */
function vpCellTone(text) {
  if (text.startsWith('+')) return 'ok'
  if (text.startsWith('-')) return 'fail'
  return 'empty'
}

/**
 * 口径行里那一句。三种失败分开说：
 *   - 没登录 / 要过人机校验 → 用户能自己解决，提示去登录
 *   - 其余（超时、读不到页面）→ 只说查不到，别推销「登录」
 * 「第一页里没有你」只在确实拿到榜单但没有自己时出现（page1 兜底的名次上限就在第一页）。
 */
const unofficialLine = computed(() => {
  if (unofficialLoading.value) {
    return { text: t('cf.contest.standings.unofficialLoading'), tone: 'dim' }
  }

  const result = unofficial.value
  if (!result) return null

  if (result.ok) {
    if (unofficialBest.value) {
      return {
        text: t('cf.contest.standings.unofficialMine', { rank: unofficialBest.value.rank }),
        tone: 'mine',
      }
    }
    return { text: t('cf.contest.standings.unofficialMissing'), tone: 'dim' }
  }

  if (result.reason === 'not-logged-in' || result.reason === 'challenge') {
    return { text: t('cf.contest.standings.unofficialNeedLogin'), tone: 'warn' }
  }
  return { text: t('cf.contest.standings.unofficialFailed'), tone: 'dim' }
})

async function lookupUnofficial() {
  if (!canLookupUnofficial.value || unofficialLoading.value) return

  unofficialLoading.value = true
  try {
    unofficial.value = await requestUnofficialRank(props.spec.contestId, handles.value)
  } finally {
    unofficialLoading.value = false
  }
}

/**
 * 「刷新」：官方榜 + 自己那一行一起刷新。
 *
 * VP 进行中时，官方榜其实已经冻结（比赛官方早就结束了），真正会变的是自己那一行；
 * 所以这一下必须把非正式名次也带上 —— 否则用户点了刷新，看到的仍是旧名次。
 */
async function refreshAll() {
  if (props.locked) return
  const tasks = [refresh()]
  if (props.vp && canLookupUnofficial.value) tasks.push(lookupUnofficial())
  await Promise.all(tasks)
}

/**
 * VP 进行中、这一页被打开：自动去 CF 读一次自己那一行（名次 + 逐题成绩）。
 *
 * 读一次要开一页 CF，所以只在「第一次可以读」时自动触发：已经读到过、或正在读，就不动；
 * 之后要更新交给「刷新」。开赛前 locked 挡着，一次都不发。
 */
watch(
  [() => props.vp, () => props.locked, () => props.active, canLookupUnofficial],
  ([vp, locked, activeNow, capable]) => {
    if (!vp || locked || !activeNow || !capable) return
    if (unofficial.value || unofficialLoading.value) return
    void lookupUnofficial()
  },
  { immediate: true },
)

// 换了一场 / 锁榜：上一场的名次不能留在这一场的口径行里
watch(
  [() => props.spec?.contestId, () => props.locked],
  () => {
    unofficial.value = null
    unofficialLoading.value = false
  },
)
</script>

<style scoped>
/* 抬头没有标题了，把非正式名次那颗按钮靠到右端 */
.cf-standings .cf-head {
  justify-content: flex-end;
}

/* 口径行：一行小字的元数据，落在页面上（不铺底、不画条） */
.cf-standings__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  padding: 2px 0 6px;
  color: var(--text-faint);
  font-size: 11.5px;
}

.cf-standings__live {
  color: var(--ok);
}

.cf-standings__warn {
  color: var(--warn);
}

/* 我的位置置顶条：低透明度主色面 + 圆角，粘在滚动区顶边 ——
   翻页、往下滚都不丢自己的人。底色先铺一层页面地面再叠 10% 主色，
   这样它压在表格行上时是实心的（纯半透明会透出底下的行）。 */
.cf-standings__pin {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 34px;
  margin-bottom: 8px;
  padding: 0 12px;
  border-radius: 10px;
  background: linear-gradient(var(--accent-face-soft), var(--accent-face-soft)), var(--bg-editor);
  font-size: 12px;
}

.cf-standings__pin-rank {
  flex: 0 0 auto;
  color: var(--accent-text);
  font-weight: 600;
}

.cf-standings__pin-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  color: var(--text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cf-standings__pin-score {
  flex: 0 0 auto;
  color: var(--text-dim);
  font-family: var(--mono-font);
  font-size: 11.5px;
  white-space: nowrap;
}

.cf-standings__pin-jump {
  flex: 0 0 auto;
  height: 24px;
  padding: 0 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--accent-text);
  font-family: var(--ui-font);
  font-size: 11.5px;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

:where(html.is-hoverable) .cf-standings__pin-jump:hover {
  background: var(--accent-face);
}

/* 非正式名次：与「我：N 名」并排，它是另一套口径，所以单独一色 */
.cf-standings__unofficial {
  color: var(--text-faint);
}

.cf-standings__unofficial.is-mine {
  color: var(--accent-text);
}

.cf-standings__unofficial.is-warn {
  color: var(--warn);
}

/* 榜单可能几十列：横向滚动关在本区里，别把整页拉宽 */
.cf-standings__scroll {
  max-height: min(62vh, 640px);
  overflow: auto;
}

/* 表：无外框、无竖线，只剩行间一条 5% 的淡线；表头 / 表尾贴边（背景用页面地面，
   滚动时盖住下面的行）。 */
.cf-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.cf-table th,
.cf-table td {
  height: 34px;
  padding: 0 8px;
  border-bottom: 1px solid var(--border-divider);
  text-align: right;
  white-space: nowrap;
}

.cf-table thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  height: 32px;
  background: var(--bg-editor);
  color: var(--text-faint);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.cf-table tbody tr {
  transition: background-color 0.12s ease;
}

:where(html.is-hoverable) .cf-table tbody tr:hover {
  background: var(--bg-hover-soft);
}

.cf-table__rank {
  width: 48px;
}

/* 左对齐要带 .cf-table 前缀：基础规则是 `.cf-table td`（类 + 元素），
   只写 `.cf-table__who` 会被它压回右对齐 */
.cf-table th.cf-table__who,
.cf-table td.cf-table__who {
  width: 34%;
  min-width: 140px;
  text-align: left;
}

.cf-table__score {
  width: 76px;
}

.cf-table__problem {
  width: 46px;
}

/* 表头里的分数列与题号列居中。这两列是定宽小格，底下的数按右缘对齐（便于纵向比大小），
   表头若也跟着贴右，短标题会偏到格子一角，看上去和列对不上 —— 表头只当「列名」读，
   居中才落在格子的正上方。正文（tbody / tfoot）保持右对齐。 */
.cf-table thead th.cf-table__score,
.cf-table thead th.cf-table__problem {
  text-align: center;
}

.cf-table__name {
  display: inline-block;
  max-width: 26ch;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: bottom;
}

/* 非正式参赛（VP / unrated）的名字前一枚星号：与 CF 的标法一致，不另加底色 */
.cf-table__star {
  margin-right: 3px;
  color: var(--warn);
}

/* 我这一行：低透明度主色面 + 主色名字（不描边，与置顶条同一套） */
.cf-table tbody tr.is-mine {
  background: var(--accent-face-soft);
}

:where(html.is-hoverable) .cf-table tbody tr.is-mine:hover {
  background: var(--accent-face);
}

.cf-table tbody tr.is-mine .cf-table__name {
  color: var(--accent-text);
}

/* 虚拟参赛自己那一行：与「我这一行」同一个低透明度主色面 —— 名字前那枚 VP 标记说明
   它的名次是含非正式的合并名次，不是官方榜里的某个序号 */
.cf-table tbody tr.is-vp {
  background: var(--accent-face-soft);
}

.cf-table tbody tr.is-vp .cf-table__name {
  color: var(--accent-text);
}

.cf-table__vp-tag {
  display: inline-block;
  margin-right: 4px;
  padding: 0 4px;
  border-radius: 4px;
  background: var(--accent-face);
  color: var(--accent-text);
  font-family: var(--ui-font);
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  line-height: 15px;
  vertical-align: 1px;
}

/* 幽灵（ghost）是官方榜里的历史成绩行，压淡一档 */
.cf-table tbody tr.is-ghost .cf-table__name {
  color: var(--text-dim);
}

.cf-table__num {
  color: var(--text-dim);
  font-family: var(--mono-font);
  font-size: 11.5px;
}

.cf-table__sub {
  margin-left: 4px;
  color: var(--text-faint);
  font-family: var(--ui-font);
  font-size: 10px;
}

/* 题格：主数字与副文字同一行，窄列也放得下；颜色只落在主数字上 */
.cf-table__cell {
  color: var(--text-faint);
  font-family: var(--mono-font);
  font-size: 11.5px;
}

.cf-table__cell.is-ok .cf-table__main {
  color: var(--ok);
}

.cf-table__cell.is-partial .cf-table__main {
  color: var(--warn);
}

.cf-table__cell.is-fail .cf-table__main {
  color: var(--fail);
}

.cf-table__cell.is-empty .cf-table__main {
  color: var(--text-faint);
}

/* 表尾统计：贴在滚动区下沿，数字在上 / 尝试在下，与题格同一套两行版式。
   CF 的表尾也在表底（`tr.standingsStatisticsRow`），翻页时它不该跟着消失。 */
.cf-table__foot td {
  position: sticky;
  bottom: 0;
  z-index: 1;
  height: 36px;
  border-top: 1px solid var(--border-divider);
  border-bottom: none;
  background: var(--bg-editor);
}

.cf-table__foot-cell {
  text-align: right;
}

.cf-table__foot-label,
.cf-table__foot-tried {
  display: block;
  font-size: 10px;
  line-height: 1.35;
}

.cf-table__foot-label {
  color: var(--text-dim);
}

.cf-table__foot-tried {
  color: var(--text-faint);
}

/* 翻页条：居中，不再有框 */
.cf-pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 12px 0 0;
}

.cf-pager__label {
  color: var(--text-faint);
  font-family: var(--mono-font);
  font-size: 11.5px;
}

/* 窄容器：榜单本来就能横向滚动，只把左右内边距收一档 */
@container cf (max-width: 34rem) {
  .cf-table th,
  .cf-table td {
    padding: 0 6px;
  }
}
</style>

<style scoped src="../styles/cf-console.css"></style>
