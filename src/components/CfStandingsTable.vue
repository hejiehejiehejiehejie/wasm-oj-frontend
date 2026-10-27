<template>
  <!-- 排行榜：官方榜（API 不含 VP / 非正式参赛者）。
       表头与行都用控制台那套 1px 边框；题格按计分制分色（见 cf/standings.js）。 -->
  <section class="cf-results cf-standings">
    <div class="cf-results__head">
      <span class="cf-section">
        {{ t('cf.contest.standings.title') }}
        <span v-if="contest?.name" class="cf-standings__contest"> · {{ contest.name }}</span>
      </span>
      <span class="cf-results__actions">
        <button
          v-if="canLookupUnofficial"
          type="button"
          class="cf-head-btn"
          :class="{ 'cf-head-btn--busy': unofficialLoading }"
          :title="t('cf.contest.standings.unofficialHint')"
          :disabled="unofficialLoading"
          @click="lookupUnofficial"
        >
          <LoadingSpinner v-if="unofficialLoading" :size="10" />
          <span>
            {{
              unofficialLoading
                ? t('cf.contest.standings.unofficialLoading')
                : t('cf.contest.standings.unofficial')
            }}
          </span>
        </button>
        <button
          type="button"
          class="cf-head-btn"
          :class="{ 'cf-head-btn--busy': loading }"
          :disabled="loading"
          @click="refresh"
        >
          <LoadingSpinner v-if="loading" :size="10" />
          <span>{{ loading ? t('cf.contest.standings.refreshing') : t('cf.contest.standings.refresh') }}</span>
        </button>
      </span>
    </div>

    <!-- 口径行：人数 / 官方榜口径 / 冻结 / 非正式名次 / 实时更新。空榜不出这一行。
         「我的名次」不在这里 —— 它单独置顶在表上方（见下面 .cf-standings__pin） -->
    <div v-if="rows.length" class="cf-standings__meta">
      <span>{{ t('cf.contest.standings.count', { n: rows.length }) }}</span>
      <span>{{ t('cf.contest.standings.official') }}</span>
      <span v-if="contest?.type" class="cf-standings__type">{{ contest.type }}</span>
      <span v-if="frozen" class="cf-standings__warn">{{ t('cf.contest.standings.frozen') }}</span>
      <span v-if="live" class="cf-standings__live">{{ t('cf.contest.standings.live') }}</span>
      <span
        v-if="unofficialLine"
        class="cf-standings__unofficial"
        :class="`is-${unofficialLine.tone}`"
      >
        {{ unofficialLine.text }}
      </span>
      <span v-if="fetchedAt" class="cf-standings__updated">
        {{ t('cf.contest.standings.updated', { time: updatedText }) }}
      </span>
    </div>

    <p v-if="error" class="cf-contest__note cf-contest__note--block is-error">{{ error }}</p>
    <p
      v-else-if="pending"
      class="cf-contest__note cf-contest__note--block"
    >
      {{ t('cf.contest.standings.notStarted') }}
    </p>
    <p
      v-else-if="!rows.length && loading"
      class="cf-contest__note cf-contest__note--block"
    >
      {{ t('cf.contest.standings.loading') }}
    </p>
    <p
      v-else-if="!rows.length"
      class="cf-contest__note cf-contest__note--block"
    >
      {{ t('cf.contest.standings.empty') }}
    </p>

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
        <button
          type="button"
          class="cf-head-btn"
          :disabled="page <= 1"
          @click="gotoPage(page - 1)"
        >
          {{ t('cf.contest.standings.prev') }}
        </button>
        <span class="cf-pager__label">
          {{ t('cf.contest.standings.page', { page, count: pageCount }) }}
        </span>
        <button
          type="button"
          class="cf-head-btn"
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
 * 【只有官方榜】API 的 standings 只含 CONTESTANT。界面把这句口径写在人数那一行，
 * 不发「你不在榜上 = 你没参赛」这种错误信号。数据里真出现非正式行时，名字前会有一枚
 * `*`（CF 的标法）；接口本身不会带 —— 原因与代价见 cf/standings.js 顶部那段。
 *
 * 【非正式名次是另一条路（扩展）】官方榜看不见 VP，所以另给一颗按钮，由扩展去读 CF 的好友榜
 * （拿不到时退到合并榜第一页）数出含非正式参赛者的名次。它只在用户点按时才开 CF 标签页，
 * 能力协商不过在时按钮不出现 —— 官方榜那一页的行为一字不变。
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
})

const {
  loading,
  error,
  pending,
  frozen,
  rows,
  problems,
  problemStats,
  contest,
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
})

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

const updatedText = computed(() => {
  if (!fetchedAt.value) return ''
  const date = new Date(fetchedAt.value)
  const pad = (value) => String(value).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
})

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

// 换了一场：上一场的名次不能留在这一场的口径行里
watch(
  () => props.spec?.contestId,
  () => {
    unofficial.value = null
    unofficialLoading.value = false
  },
)
</script>

<style scoped>
/* 抬头里的比赛名：长了截断，不让它把右侧按钮挤走 */
.cf-standings__contest {
  display: inline-block;
  max-width: 34ch;
  overflow: hidden;
  color: var(--text-dim);
  text-overflow: ellipsis;
  text-transform: none;
  vertical-align: bottom;
  white-space: nowrap;
}

/* 口径行：一行小字，和抬头同底色，像控制台的元数据条 */
.cf-standings__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 3px 6px;
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  background: var(--bg-panel-head);
  color: var(--text-faint);
  font-family: var(--mono-font);
  font-size: 9px;
}

.cf-standings__type {
  letter-spacing: 0.08em;
}

.cf-standings__live {
  color: var(--ok);
}

.cf-standings__warn {
  color: var(--warn);
}

/* 我的位置置顶条：左侧一道主色竖条 + 淡底（与帮助页那条置顶提示同一套语言），
   粘在滚动区顶边 —— 翻页、往下滚都不丢自己的人 */
.cf-standings__pin {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 3px 8px;
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  border-left: 2px solid var(--accent);
  background: var(--bg-panel-head);
  font-family: var(--mono-font);
  font-size: 10px;
  line-height: 18px;
}

.cf-standings__pin-rank {
  flex: 0 0 auto;
  color: var(--accent);
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
  white-space: nowrap;
}

.cf-standings__pin-jump {
  flex: 0 0 auto;
  padding: 0;
  border: none;
  background: none;
  color: var(--accent);
  font-family: inherit;
  font-size: 10px;
  cursor: pointer;
}

.cf-standings__pin-jump:hover {
  text-decoration: underline;
}

/* 非正式名次：与「我：N 名」并排，它是另一套口径，所以单独一色 */
.cf-standings__unofficial {
  color: var(--text-faint);
}

.cf-standings__unofficial.is-mine {
  color: var(--accent);
}

.cf-standings__unofficial.is-warn {
  color: var(--warn);
}

/* 榜单可能几十列：横向滚动关在本区里，别把整页拉宽 */
.cf-standings__scroll {
  max-height: min(62vh, 640px);
  overflow: auto;
}

.cf-table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--mono-font);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.cf-table th,
.cf-table td {
  height: 24px;
  padding: 0 6px;
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  text-align: right;
  white-space: nowrap;
}

.cf-table thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--bg-panel-head);
  color: var(--text-faint);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.cf-table__rank {
  width: 48px;
}

.cf-table__who {
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

.cf-table tbody tr.is-mine {
  background: var(--bg-hover);
}

.cf-table tbody tr.is-mine .cf-table__name {
  color: var(--accent);
}

/* 幽灵（ghost）是官方榜里的历史成绩行，压淡一档 */
.cf-table tbody tr.is-ghost .cf-table__name {
  color: var(--text-dim);
}

.cf-table__num {
  color: var(--text-dim);
}

.cf-table__sub {
  margin-left: 4px;
  color: var(--text-faint);
  font-size: 9px;
}

/* 题格：主数字与副文字同一行，窄列也放得下 */
.cf-table__cell {
  color: var(--text-faint);
}

.cf-table__cell.is-ok .cf-table__main {
  color: var(--ok);
}

.cf-table__cell.is-partial .cf-table__main {
  color: var(--warn);
}

.cf-table__cell.is-fail {
  color: var(--fail);
}

.cf-table__cell.is-fail .cf-table__main {
  color: var(--fail);
}

.cf-table__cell.is-empty {
  color: var(--text-faint);
}

/* 表尾统计：贴在滚动区下沿，数字在上 / 尝试在下，与题格同一套两行版式。
   CF 的表尾也在表底（`tr.standingsStatisticsRow`），翻页时它不该跟着消失。 */
.cf-table__foot td {
  position: sticky;
  bottom: 0;
  z-index: 1;
  height: 28px;
  border-top: 1px solid var(--border);
  background: var(--bg-panel-head);
}

.cf-table__foot-cell {
  text-align: right;
}

.cf-table__foot-label,
.cf-table__foot-tried {
  display: block;
  font-size: 9px;
  line-height: 1.35;
}

.cf-table__foot-label {
  color: var(--text-dim);
}

.cf-table__foot-tried {
  color: var(--text-faint);
}

/* 翻页条：与表同宽，贴在表的边框里 */
.cf-pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 4px 6px;
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  background: var(--bg-panel-head);
}

.cf-pager__label {
  color: var(--text-faint);
  font-family: var(--mono-font);
  font-size: 10px;
}

.is-error {
  color: var(--fail);
}
</style>

<style scoped src="../styles/cf-console.css"></style>
