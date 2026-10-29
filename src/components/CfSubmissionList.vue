<template>
  <!-- 提交：最新 200 条（或「我的」最新 200 条），比赛中 5 秒一轮增量合并。
       每行链去 Codeforces 的提交页 —— P0 不做站内详情页（那是 P1 的扩展 / HTML 路线）。
       2026-10-28 改版：无框 40px 行 + 行间淡线，判定码收成一枚 6px 圆角的浅色徽标。 -->
  <section class="cf-submissions">
    <!-- 筛选：handle 预填我的主账号（打开即「只看我」），改它才看别人；
         题目与判定是本地过一遍 —— CF 的 contest.status 不认这两个维度。 -->
    <div class="cf-filters">
      <input
        class="cf-input cf-filters__handle"
        type="text"
        spellcheck="false"
        autocapitalize="off"
        autocomplete="off"
        :value="handle"
        :placeholder="t('cf.contest.submissions.allHandles')"
        :aria-label="t('cf.contest.submissions.handleLabel')"
        @input="setHandle($event.target.value)"
      />
      <button
        type="button"
        class="cf-btn cf-btn--text cf-filters__mine"
        :class="{ 'is-on': isMine }"
        :disabled="!canFilterMine"
        :title="canFilterMine ? t('cf.contest.submissions.onlyMineHint') : t('cf.contest.submissions.needHandle')"
        @click="toggleMine"
      >
        {{ t('cf.contest.submissions.onlyMine') }}
      </button>

      <template v-if="problemOptions.length > 1">
        <span class="cf-filters__label">{{ t('cf.contest.submissions.problem') }}</span>
        <span class="cf-filters__group">
          <button
            v-for="option in problemOptions"
            :key="option.index"
            type="button"
            class="cf-chip"
            :class="{ 'is-on': problemIndex === option.index }"
            :title="option.name"
            @click="setProblem(problemIndex === option.index ? '' : option.index)"
          >
            {{ option.index }}
          </button>
        </span>
      </template>

      <span class="cf-filters__label">{{ t('cf.contest.submissions.status') }}</span>
      <span class="cf-filters__group">
        <button
          v-for="option in VERDICT_FILTERS"
          :key="option"
          type="button"
          class="cf-chip"
          :class="{ 'is-on': verdict === option }"
          @click="setVerdict(option)"
        >
          {{ t(`cf.contest.submissions.verdict.${option}`) }}
        </button>
      </span>
    </div>

    <div v-if="visibleRows.length" class="cf-submissions__meta">
      <span>{{ t('cf.contest.submissions.count', { n: visibleRows.length }) }}</span>
      <span v-if="isMine && canFilterMine">
        {{ t('cf.contest.submissions.summary', {
          solved: summary.solved.length,
          accepted: summary.accepted,
          rejected: summary.rejected,
        }) }}
      </span>
      <span v-if="live" class="cf-submissions__live">{{ t('cf.contest.submissions.live') }}</span>
      <span class="cf-submissions__latest">{{ t('cf.contest.submissions.latest') }}</span>
    </div>

    <p v-if="error" class="cf-note is-error">{{ error }}</p>
    <p v-else-if="!visibleRows.length && loading" class="cf-note">
      {{ t('cf.contest.submissions.loading') }}
    </p>
    <p v-else-if="!visibleRows.length" class="cf-note">
      {{ emptyText }}
    </p>

    <ul v-if="visibleRows.length" class="cf-list">
      <li v-for="row in visibleRows" :key="row.id">
        <a
          class="cf-sub cf-list__row"
          :href="urlOf(row)"
          target="_blank"
          rel="noreferrer"
          :title="t('cf.contest.submissions.open', { id: row.id })"
        >
          <span class="cf-sub__time" :title="localTimeOf(row)">{{ timeOf(row) }}</span>
          <span class="cf-sub__problem">
            <span class="cf-sub__index">{{ row.problemIndex || '—' }}</span>
            <span v-if="row.problemName" class="cf-sub__pname">{{ row.problemName }}</span>
          </span>
          <span class="cf-sub__author" :title="row.authorName">{{ row.authorName }}</span>
          <span class="cf-sub__verdict" :class="`is-${row.tone}`" :title="row.verdictName">
            {{ row.verdictCode || '—' }}
          </span>
          <span class="cf-sub__detail">{{ detailOf(row) }}</span>
          <span class="cf-sub__lang" :title="row.language">{{ row.language || '—' }}</span>
          <AppIcon name="link" :size="13" class="cf-sub__link" />
        </a>
      </li>
    </ul>
  </section>
</template>

<script setup>
/**
 * CfSubmissionList —— 比赛面板的「提交」。
 *
 * 【固定取最新 200 条】旧比赛整场 61.5 万条（16.9MB gzip），永远不全量拉。要看更早的
 * 去 Codeforces 的提交页；站内完整分页 / 详情是 P1。
 *
 * 【默认只看我】handle 输入框预填我的主账号，所以打开这一页就是自己的提交；
 * 想看别人才去改 handle（服务端 `contest.status?handle=`）。题目与判定只在本地筛。
 *
 * 【行链去 CF】每行包在 <a> 里而不是只挂一颗小图标：原生提交列表也是整行可点。
 * Cloudflare 偶尔会拦未登录的提交页，此时退化成 CF 自己的验证页，不会更糟。
 */
import { computed, toRef } from 'vue'

import { submissionUrl } from '../cf/contest.js'
import { formatClock } from '../cf/standings.js'
import AppIcon from './AppIcon.vue'
import { t } from '../i18n/index.js'
import { useCfSubmissions } from '../composables/useCfSubmissions.js'

const props = defineProps({
  spec: { type: Object, default: null },
  active: { type: Boolean, default: false },
  live: { type: Boolean, default: false },
})

/** 判定筛选的几档：与 cf/submissions.js 的 tone 一一对应 */
const VERDICT_FILTERS = ['all', 'ok', 'fail', 'pending']

const {
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
  summary,
  refresh,
} = useCfSubmissions({
  spec: toRef(props, 'spec'),
  active: toRef(props, 'active'),
  live: toRef(props, 'live'),
})

/** 「刷新」在页签行右侧（见 CfContestPanel）：动作、loading 与上次刷新时刻都从这一层露出去 */
defineExpose({ refresh, loading, fetchedAt })

/** 比赛内时刻（相对开赛）。CF 的提交列表就是这个口径，负值/缺失时退回「—」 */
function timeOf(row) {
  if (typeof row.relativeTime === 'number') return formatClock(Math.max(0, row.relativeTime)) || '—'
  if (row.submittedAt) return localClock(row.submittedAt * 1000)
  return '—'
}

/** 本机时区的完整时间，放在悬停里（列表里只放相对开赛的时刻） */
function localTimeOf(row) {
  if (!row.submittedAt) return ''
  const date = new Date(row.submittedAt * 1000)
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function localClock(ms) {
  const date = new Date(ms)
  const pad = (value) => String(value).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatMemory(bytes) {
  if (!Number.isInteger(bytes) || bytes <= 0) return ''
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function detailOf(row) {
  const notes = []
  if (row.timeMs != null) notes.push(`${row.timeMs} ms`)
  const memory = formatMemory(row.memoryBytes)
  if (memory) notes.push(memory)
  // 挂在第几个点：只对没通过的提交有意义（AC 的 passedTestCount 是总点数，没用）
  if (row.tone !== 'ok' && row.passedTestCount != null) {
    notes.push(t('cf.contest.submissions.tests', { n: row.passedTestCount }))
  }
  return notes.join(' · ')
}

function urlOf(row) {
  return submissionUrl(props.spec, row.id)
}

/** 空态：说清楚是「我还没交」「这个人没交」还是「筛没了」—— 默认只看我，那句「这场还没有提交」已经不成立 */
const emptyText = computed(() => {
  if (problemIndex.value || verdict.value !== 'all') {
    return t('cf.contest.submissions.filteredEmpty')
  }
  if (isMine.value) return t('cf.contest.submissions.mineEmpty')
  const who = handle.value.trim()
  if (who) return t('cf.contest.submissions.handleEmpty', { handle: who })
  return t('cf.contest.submissions.empty')
})
</script>

<style scoped>
/* 筛选行：一行控件落在页面上，不留框（与共享语汇的「留白即边界」同一口径） */
.cf-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  padding: 2px 0 8px;
}

/* 与 26px 的芯片同高：一行里三种控件不该参差 */
.cf-filters__handle {
  width: 132px;
  height: 26px;
  padding: 0 8px;
  font-family: var(--mono-font);
  font-size: 11.5px;
}

.cf-filters__mine {
  flex: 0 0 auto;
  height: 26px;
  padding: 0 8px;
  font-size: 11.5px;
}

.cf-filters__label {
  color: var(--text-faint);
  font-size: 11px;
}

.cf-filters__group {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

/* 口径行：一行小字的元数据，落在页面上（不铺底、不画条） */
.cf-submissions__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  padding: 2px 0 6px;
  color: var(--text-faint);
  font-size: 11.5px;
}

.cf-submissions__live {
  color: var(--ok);
}

.cf-submissions__latest {
  margin-left: auto;
}

/* 一条提交：列宽写死（各行独立 grid，auto 会对不齐） */
.cf-sub {
  display: grid;
  grid-template-columns:
    52px minmax(0, 170px) minmax(0, 120px) 70px minmax(0, 1fr) minmax(0, 110px) 26px;
  align-items: center;
  gap: 12px;
  height: 40px;
  color: inherit;
  font-size: 12.5px;
  text-decoration: none;
}

.cf-sub__time {
  color: var(--text-faint);
  font-family: var(--mono-font);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
}

/* 题号 + 题名挤在同一格：两段字号不同（题号 11.5 等宽、题名 12.5），
   靠基线对齐才不会一高一低。与题目页的 .cf-result__title 同一套写法 */
.cf-sub__problem {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}

.cf-sub__index {
  flex: 0 0 auto;
  color: var(--text-dim);
  font-family: var(--mono-font);
  font-size: 11.5px;
}

.cf-sub__pname {
  min-width: 0;
  overflow: hidden;
  color: var(--text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cf-sub__author {
  min-width: 0;
  overflow: hidden;
  color: var(--text-dim);
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 判定码：20px 小徽标、6px 圆角，底色是同色系的低透明度面 ——
   一眼扫过去能分出 AC / WA / 待判，但不会在整屏提交里烧成一片色块。 */
.cf-sub__verdict {
  justify-self: start;
  padding: 1px 7px;
  border-radius: 6px;
  background: var(--bg-control);
  color: var(--text-faint);
  font-family: var(--mono-font);
  font-size: 10.5px;
  font-weight: 600;
  line-height: 1.6;
  white-space: nowrap;
}

.cf-sub__verdict.is-ok {
  background: var(--ok-face);
  color: var(--ok);
}

.cf-sub__verdict.is-warn {
  background: var(--warn-face);
  color: var(--warn);
}

.cf-sub__verdict.is-fail {
  background: var(--fail-face);
  color: var(--fail);
}

.cf-sub__verdict.is-pending {
  background: var(--info-face);
  color: var(--info);
}

.cf-sub__detail {
  min-width: 0;
  overflow: hidden;
  color: var(--text-faint);
  font-family: var(--mono-font);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cf-sub__lang {
  min-width: 0;
  overflow: hidden;
  color: var(--text-faint);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cf-sub__link {
  color: var(--text-faint);
}

:where(html.is-hoverable) .cf-sub:hover .cf-sub__link {
  color: var(--accent-text);
}

/* 窄容器：先撤作者 / 耗时内存 / 语言，保住「哪题 + 什么判定」 */
@container cf (max-width: 34rem) {
  .cf-sub {
    grid-template-columns: 48px minmax(0, 1fr) 64px 26px;
    gap: 10px;
  }

  .cf-sub__author,
  .cf-sub__detail,
  .cf-sub__lang {
    display: none;
  }
}
</style>

<style scoped src="../styles/cf-console.css"></style>
