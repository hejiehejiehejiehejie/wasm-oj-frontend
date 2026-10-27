<template>
  <!-- 赛程：比赛面板的默认一页（见 CfContestPanel 的 mode）。
       版式沿用控制台：抬头一行、分组一行、每场一行，与题目列表同一套边框规矩。 -->
  <section class="cf-results cf-schedule">
    <div class="cf-results__head">
      <span class="cf-section">{{ t('cf.contest.schedule.title') }}</span>
      <span class="cf-results__actions">
        <span v-if="error" class="cf-contest__note is-error">{{ error }}</span>
        <span v-else-if="fetchedAt" class="cf-contest__note">
          {{ t('cf.contest.schedule.updated', { time: updatedText }) }}
        </span>
        <button
          type="button"
          class="cf-head-btn"
          :class="{ 'cf-head-btn--busy': loading }"
          :disabled="loading"
          @click="refresh"
        >
          <LoadingSpinner v-if="loading" :size="10" />
          <span>{{ loading ? t('cf.contest.schedule.refreshing') : t('cf.contest.schedule.refresh') }}</span>
        </button>
      </span>
    </div>

    <p v-if="!loading && !contests.length && !error" class="cf-contest__note cf-contest__note--block">
      {{ t('cf.contest.schedule.empty') }}
    </p>

    <p v-if="statesNote" class="cf-contest__note cf-contest__note--block">{{ statesNote }}</p>

    <template v-for="group in groups" :key="group.id">
      <div class="cf-schedule__group">{{ t(`cf.contest.schedule.group.${group.id}`) }}</div>
      <ul class="cf-results__list">
        <li
          v-for="contest in group.items"
          :key="contest.id"
          class="cf-schedule__row"
          :class="{ 'cf-schedule__row--entry': showEntryColumn }"
          role="button"
          tabindex="0"
          :aria-label="t('cf.contest.schedule.open', { name: contest.name })"
          @click="$emit('select', contest)"
          @keydown.enter.prevent="$emit('select', contest)"
          @keydown.space.prevent="$emit('select', contest)"
        >
          <span class="cf-schedule__clock" :class="`is-${statusOf(contest)}`">
            {{ clockOf(contest) || '—' }}
          </span>
          <span class="cf-schedule__start">{{ startText(contest) }}</span>
          <span class="cf-schedule__name" :title="contest.name">{{ contest.name }}</span>
          <span class="cf-schedule__type">{{ contest.type || '—' }}</span>
          <span v-if="showEntryColumn" class="cf-schedule__entry">
            <button
              v-if="actionKind(contest)"
              type="button"
              class="cf-schedule__action"
              :title="
                t(`cf.contest.schedule.entryTitle.${actionKind(contest)}`, { name: contest.name })
              "
              :disabled="!!entryBusy"
              @click.stop="askEntry(contest, actionKind(contest))"
              @keydown.stop
            >
              <LoadingSpinner v-if="entryBusy === String(contest.id)" :size="9" />
              <span>{{ actionLabel(contest) }}</span>
            </button>
            <span v-else class="cf-schedule__state">{{ stateText(contest) }}</span>
          </span>
          <a
            class="cf-result__link"
            :href="pageUrl(contest)"
            target="_blank"
            rel="noreferrer"
            :title="t('cf.picker.result.open')"
            :aria-label="t('cf.picker.result.open')"
            @click.stop
          >
            <AppIcon name="link" :size="12" />
          </a>
        </li>
      </ul>
    </template>

    <!-- 报名 / 开 VP 是**不可逆**的：点一次 = 扩展在带着登录态的 CF 页面上提交一次表单，
         没有撤销。所以不直接发，先问一句；遮罩、Esc、「取消」都能退出来。 -->
    <Teleport to="body">
      <div v-if="pendingEntry" class="confirm" @pointerdown.self="cancelEntry">
        <div
          class="confirm__card"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="contest-entry-title"
          aria-describedby="contest-entry-desc"
          @keydown.esc.stop.prevent="cancelEntry"
        >
          <p id="contest-entry-title" class="confirm__title">
            {{
              t(`cf.contest.schedule.entryTitle.${pendingEntry.kind}`, {
                name: pendingEntry.contest.name,
              })
            }}
          </p>
          <p id="contest-entry-desc" class="confirm__desc">
            {{ t(`cf.contest.schedule.entryDesc.${pendingEntry.kind}`) }}
          </p>
          <div class="confirm__actions">
            <button type="button" class="confirm__btn" @click="cancelEntry">
              {{ t('cf.contest.schedule.entryCancel') }}
            </button>
            <button
              ref="entryConfirmBtn"
              type="button"
              class="confirm__btn confirm__btn--primary"
              @click="confirmEntry"
            >
              {{ t('cf.contest.schedule.entryConfirm') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<script setup>
/**
 * CfContestSchedule —— 赛程列表（近期比赛 + 倒计时 + 报名 / VP + 点进比赛）。
 *
 * 【点一行 = 载入这场】赛程与比赛是同一页的两个模式（见 CfContestPanel），
 * 这里只把选中的比赛抛出去，切模式、填链接、取数都归面板管 —— 赛程不该知道
 * 「比赛」那一页的输入框长什么样。
 *
 * 【只有这一页可见时才跳秒】active 由面板给（mode === 'schedule'）。切去题目 / 榜单时
 * 倒计时没人看，白养一只每秒的 interval 没意义；切回来会立刻把 now 校正到当前时刻。
 *
 * 【报名 / VP 那一列不是赛程数据】报名状态来自扩展读 CF 的 /contests 页面，能力协商
 * 不过在时**整列都不出现**（老扩展下版式与改动前一模一样）。两个动作不可逆，所以走
 * 确认卡片；确认之后才交给 useCfSchedule 发出去，结果用一条通知收尾。
 */
import { computed, nextTick, ref, watch } from 'vue'

import { contestUrl } from '../cf/contest.js'
import AppIcon from './AppIcon.vue'
import LoadingSpinner from './LoadingSpinner.vue'
import { t } from '../i18n/index.js'
import { notify } from '../services/notifications.js'
import { useCfSchedule } from '../composables/useCfSchedule.js'
import {
  canReadContestStates,
  canRegisterContest,
  canStartVirtual,
} from '../composables/useCompanionBridge.js'

const props = defineProps({
  active: { type: Boolean, default: false },
})

defineEmits(['select'])

const {
  contests,
  fetchedAt,
  loading,
  error,
  upcoming,
  running,
  finished,
  refresh,
  statusOf,
  startText,
  clockOf,
  statesError,
  entryBusy,
  stateOf,
  submitEntry,
} = useCfSchedule({ active: computed(() => props.active) })

/** 三组：正在进行的在最上（用户最关心能不能现在打），空组不占一行 */
const groups = computed(() =>
  [
    { id: 'running', items: running.value },
    { id: 'upcoming', items: upcoming.value },
    { id: 'finished', items: finished.value },
  ].filter((group) => group.items.length > 0),
)

/** 「更新于」只到分钟：列表本身不会一秒一变 */
const updatedText = computed(() => {
  if (!fetchedAt.value) return ''
  const date = new Date(fetchedAt.value)
  const pad = (value) => String(value).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
})

function pageUrl(contest) {
  return contestUrl({ kind: 'contest', contestId: String(contest?.id ?? ''), groupId: '' })
}

// ------------------------------------------------------------ 报名 / VP

/** 报名状态与两个动作任一可用，这一列就出现；全不可用（老扩展）时版式回到改动前 */
const showEntryColumn = computed(
  () => canReadContestStates.value || canRegisterContest.value || canStartVirtual.value,
)

/**
 * 这一行现在能做什么：
 *   - 未开赛 + 已开放报名 → 报名（扩展支持才行）
 *   - 已结束 → 开 VP（CF 的报名页对已结束比赛只提供虚拟参赛）
 * 其余情况没有动作，那一格显示报名状态。
 */
function actionKind(contest) {
  const state = statusOf(contest)
  if (state === 'upcoming') {
    return canRegisterContest.value && stateOf(contest) === 'open' ? 'register' : ''
  }
  if (state === 'finished') return canStartVirtual.value ? 'virtual' : ''
  return ''
}

function actionLabel(contest) {
  const virtual = actionKind(contest) === 'virtual'
  const busy = entryBusy.value === String(contest.id)
  if (virtual) {
    return t(busy ? 'cf.contest.schedule.vpStarting' : 'cf.contest.schedule.vp')
  }
  return t(busy ? 'cf.contest.schedule.registering' : 'cf.contest.schedule.register')
}

/** 能报名却没读状态（扩展读失败）时留白，不猜「可报名」 */
function stateText(contest) {
  const state = stateOf(contest)
  if (state === 'registered') return t('cf.contest.schedule.registered')
  if (state === 'before') return t('cf.contest.schedule.before')
  if (state === 'closed') return t('cf.contest.schedule.closed')
  return t('cf.contest.schedule.stateUnknown')
}

/** 读状态失败里两种用户能自己处理的：没登录、要过人机校验。其余（超时 / 读不到）静默 */
const statesNote = computed(() => {
  if (!canReadContestStates.value) return ''
  if (statesError.value === 'not-logged-in') return t('cf.contest.schedule.needLogin')
  if (statesError.value === 'challenge') {
    return t('cf.contest.schedule.entryErrors.challenge')
  }
  return ''
})

/** 待确认的动作（null = 没有卡片）；确认卡片一出现就把焦点放到「确认」上 */
const pendingEntry = ref(null)
const entryConfirmBtn = ref(null)

function askEntry(contest, kind) {
  if (entryBusy.value || !kind) return
  pendingEntry.value = { contest, kind }
}

function cancelEntry() {
  pendingEntry.value = null
}

function entryErrorText(reason, kind) {
  const keys = {
    'not-logged-in': 'notLoggedIn',
    challenge: 'challenge',
    'not-eligible': 'notEligible',
    'already-registered': kind === 'virtual' ? 'vpAlready' : 'alreadyRegistered',
    rejected: 'rejected',
    timeout: 'timeout',
    busy: 'busy',
    unsupported: 'unsupported',
  }
  return t(`cf.contest.schedule.entryErrors.${keys[reason] || 'fallback'}`)
}

watch(pendingEntry, (entry) => {
  if (entry) nextTick(() => entryConfirmBtn.value?.focus())
})

async function confirmEntry() {
  const entry = pendingEntry.value
  if (!entry) return
  pendingEntry.value = null

  const { contest, kind } = entry
  const result = await submitEntry(contest, kind)

  if (result.ok) {
    notify({
      type: 'success',
      title: t(`cf.contest.schedule.entryDone.${kind}`, { name: contest.name }),
      duration: 5000,
    })
    return
  }

  // 失败时扩展通常已经把 CF 那一页切到前台（见扩展的 submitContestEntry），
  // 所以这里只需要说清「没成」和原因，不再给一个「去 CF」的按钮
  notify({
    type: 'error',
    title: entryErrorText(result.reason, kind),
    message: contest.name,
    duration: 8000,
  })
}
</script>

<style scoped>
/* 分组标签：一整行，底色比行头浅一档，像控制台的分区条 */
.cf-schedule__group {
  padding: 3px 6px;
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  background: var(--bg-panel-head);
  color: var(--text-faint);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

/* 一场一行。列宽写死（理由同 .cf-result）：各行独立 grid，auto 会对不齐 */
.cf-schedule__row {
  display: grid;
  grid-template-columns: 62px 84px minmax(0, 1fr) 40px 16px;
  align-items: center;
  gap: 8px;
  height: 26px;
  padding: 0 6px;
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  font-family: var(--mono-font);
  font-size: 11px;
  cursor: pointer;
}

/* 报名状态 / 动作列：只有在扩展支持时才多出这一格 */
.cf-schedule__row--entry {
  grid-template-columns: 62px 84px minmax(0, 1fr) 40px 76px 16px;
}

.cf-schedule__row:hover {
  background: var(--bg-hover);
}

.cf-schedule__row:focus-visible {
  outline: 1px solid var(--focus);
  outline-offset: -1px;
}

/* 倒计时 / 已进行时长：等宽数字，避免每秒跳动时整列左右晃 */
.cf-schedule__clock {
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
}

.cf-schedule__clock.is-running {
  color: var(--ok);
}

.cf-schedule__clock.is-upcoming {
  color: var(--accent);
}

.cf-schedule__start {
  color: var(--text-faint);
  font-size: 10px;
}

.cf-schedule__name {
  min-width: 0;
  overflow: hidden;
  color: var(--text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cf-schedule__type {
  color: var(--text-faint);
  font-size: 10px;
  letter-spacing: 0.04em;
}

.cf-schedule__entry {
  display: flex;
  align-items: center;
  min-width: 0;
}

/* 报名状态是「文字」，与行里其它元数据同一档；动作才是按钮 */
.cf-schedule__state {
  color: var(--text-faint);
  font-size: 10px;
  white-space: nowrap;
}

/* 与结果行那颗「导入」同款：18px、直角、透明底，悬停才亮边框 */
.cf-schedule__action {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 18px;
  padding: 0 7px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-dim);
  font-family: var(--ui-font);
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.04em;
  white-space: nowrap;
  cursor: pointer;
}

.cf-schedule__action:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--text);
}

.cf-schedule__action:disabled {
  color: var(--text-faint);
  cursor: default;
}

.cf-schedule__action:focus-visible {
  outline: 1px solid var(--focus);
  outline-offset: 1px;
}

.is-error {
  color: var(--fail);
}

/* ---------------- 确认卡片 ---------------- */
/* 与提交确认 / 卸载确认同一套视觉：Teleport 到 body，只依赖主题变量 */
.confirm {
  position: fixed;
  inset: 0;
  /* 高于右键菜单（120），低于顶栏下拉之类的系统级浮层 */
  z-index: 130;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.32);
}

.confirm__card {
  width: min(340px, 100%);
  padding: 14px;
  border: 1px solid var(--border-soft);
  border-radius: 10px;
  background: var(--bg-raised);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.34);
}

.confirm__title {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 650;
  color: var(--text);
}

.confirm__desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-dim);
  overflow-wrap: anywhere;
}

.confirm__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}

.confirm__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 5px 14px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-panel);
  color: var(--text);
  font: 500 12.5px/1.5 var(--font-sans, system-ui);
  cursor: pointer;
}

.confirm__btn:hover {
  background: var(--bg-hover);
}

.confirm__btn--primary {
  border-color: transparent;
  background: var(--accent);
  color: var(--text-on-accent);
}

.confirm__btn--primary:hover {
  background: var(--accent-hover);
}

.confirm__btn:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
}
</style>

<style scoped src="../styles/cf-console.css"></style>
