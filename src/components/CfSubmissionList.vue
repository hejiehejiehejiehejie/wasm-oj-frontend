<template>
  <!-- 提交：最新 200 条（或「我的」最新 200 条），比赛中 5 秒一轮增量合并。
       每行链去 Codeforces 的提交页 —— P0 不做站内详情页（那是 P1 的扩展 / HTML 路线）。 -->
  <section class="cf-results cf-submissions">
    <div class="cf-results__head">
      <span class="cf-section">{{ t('cf.contest.submissions.title') }}</span>
      <span class="cf-results__actions">
        <button
          type="button"
          class="cf-head-btn"
          :class="{ 'is-on': onlyMine }"
          :disabled="!canFilterMine"
          :title="canFilterMine ? t('cf.contest.submissions.onlyMineHint') : t('cf.contest.submissions.needHandle')"
          @click="toggleMine"
        >
          {{ t('cf.contest.submissions.onlyMine') }}
        </button>
        <button
          type="button"
          class="cf-head-btn"
          :class="{ 'cf-head-btn--busy': loading }"
          :disabled="loading"
          @click="refresh"
        >
          <LoadingSpinner v-if="loading" :size="10" />
          <span>{{ loading ? t('cf.contest.submissions.refreshing') : t('cf.contest.submissions.refresh') }}</span>
        </button>
      </span>
    </div>

    <div v-if="visibleRows.length" class="cf-submissions__meta">
      <span>{{ t('cf.contest.submissions.count', { n: visibleRows.length }) }}</span>
      <span v-if="onlyMine && canFilterMine">
        {{ t('cf.contest.submissions.summary', {
          solved: summary.solved.length,
          accepted: summary.accepted,
          rejected: summary.rejected,
        }) }}
      </span>
      <span v-if="live" class="cf-submissions__live">{{ t('cf.contest.submissions.live') }}</span>
      <span class="cf-submissions__latest">{{ t('cf.contest.submissions.latest') }}</span>
      <span v-if="fetchedAt" class="cf-submissions__updated">
        {{ t('cf.contest.submissions.updated', { time: updatedText }) }}
      </span>
    </div>

    <p v-if="error" class="cf-contest__note cf-contest__note--block is-error">{{ error }}</p>
    <p
      v-else-if="!visibleRows.length && loading"
      class="cf-contest__note cf-contest__note--block"
    >
      {{ t('cf.contest.submissions.loading') }}
    </p>
    <p
      v-else-if="!visibleRows.length"
      class="cf-contest__note cf-contest__note--block"
    >
      {{ onlyMine ? t('cf.contest.submissions.mineEmpty') : t('cf.contest.submissions.empty') }}
    </p>

    <ul v-if="visibleRows.length" class="cf-results__list">
      <li v-for="row in visibleRows" :key="row.id">
        <a
          class="cf-sub"
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
          <AppIcon name="link" :size="11" class="cf-sub__link" />
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
 * 【「只看我」走服务端】切过去会清空重取（`contest.status?handle=`），关掉再清空取全量 ——
 * 两种口径不能混在同一份列表里（见 useCfSubmissions）。
 *
 * 【行链去 CF】每行包在 <a> 里而不是只挂一颗小图标：原生提交列表也是整行可点。
 * Cloudflare 偶尔会拦未登录的提交页，此时退化成 CF 自己的验证页，不会更糟。
 */
import { computed, toRef } from 'vue'

import { submissionUrl } from '../cf/contest.js'
import { formatClock } from '../cf/standings.js'
import AppIcon from './AppIcon.vue'
import LoadingSpinner from './LoadingSpinner.vue'
import { t } from '../i18n/index.js'
import { useCfSubmissions } from '../composables/useCfSubmissions.js'

const props = defineProps({
  spec: { type: Object, default: null },
  active: { type: Boolean, default: false },
  live: { type: Boolean, default: false },
})

const {
  visibleRows,
  fetchedAt,
  loading,
  error,
  onlyMine,
  canFilterMine,
  toggleMine,
  summary,
  refresh,
} = useCfSubmissions({
  spec: toRef(props, 'spec'),
  active: toRef(props, 'active'),
  live: toRef(props, 'live'),
})

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

const updatedText = computed(() => {
  if (!fetchedAt.value) return ''
  const date = new Date(fetchedAt.value)
  const pad = (value) => String(value).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
})
</script>

<style scoped>
.cf-submissions__meta {
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

.cf-submissions__live {
  color: var(--ok);
}

.cf-submissions__latest {
  margin-left: auto;
}

/* 一条提交：列宽写死（各行独立 grid，auto 会对不齐） */
.cf-sub {
  display: grid;
  grid-template-columns: 46px minmax(0, 150px) minmax(0, 120px) 66px minmax(0, 1fr) minmax(0, 120px) 11px;
  align-items: center;
  gap: 8px;
  height: 24px;
  padding: 0 6px;
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  color: inherit;
  font-family: var(--mono-font);
  font-size: 11px;
  text-decoration: none;
}

.cf-sub:hover {
  background: var(--bg-hover);
}

.cf-sub__time {
  color: var(--text-faint);
  font-variant-numeric: tabular-nums;
}

.cf-sub__problem {
  display: flex;
  gap: 6px;
  min-width: 0;
}

.cf-sub__index {
  color: var(--text-dim);
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

.cf-sub__verdict {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.cf-sub__verdict.is-ok {
  color: var(--ok);
}

.cf-sub__verdict.is-warn {
  color: var(--warn);
}

.cf-sub__verdict.is-fail {
  color: var(--fail);
}

.cf-sub__verdict.is-pending {
  color: var(--accent);
}

.cf-sub__verdict.is-muted {
  color: var(--text-faint);
}

.cf-sub__detail {
  min-width: 0;
  overflow: hidden;
  color: var(--text-faint);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cf-sub__lang {
  min-width: 0;
  overflow: hidden;
  color: var(--text-faint);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cf-sub__link {
  color: var(--text-faint);
}

.cf-sub:hover .cf-sub__link {
  color: var(--accent);
}

/* 开关按下态：与页面上的其它「选中」同一个蓝，不要胶囊 */
.cf-head-btn.is-on {
  border-color: var(--accent);
  color: var(--accent);
}

.is-error {
  color: var(--fail);
}
</style>

<style scoped src="../styles/cf-console.css"></style>
