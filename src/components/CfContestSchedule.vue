<template>
  <!-- 赛程：合成页签抬头的三个模式之一（见 CfCodeforcesPanel）。
       2026-10-28 改版：分组标签退成一行灰字，每场一行 40px，行间一条 5% 淡线，
       悬停铺一层极浅的底 —— 与题目 / 榜单 / 提交同一套列表语汇。 -->
  <section class="cf-schedule" :class="{ 'cf-schedule--blank': blankLoading }">
    <!-- 2026-10-29：「更新于」不再独占抬头那一行 —— 它和「扩展在位能做什么」一起挪到
         第一组标签的右端（页面第一行就是「即将开始」，上面不再空出一条只有时间的线）。
         刷新没有按钮：每次打开这一页都静默取一次，列表真变了才换（见 useCfSchedule）。 -->

    <!-- 第一次取数、列表还是空的：这句话落在内容区居中偏上（黄金分割点），不挤在右上角 -->
    <div v-if="blankLoading" class="cf-blank" role="status">
      <span class="cf-blank__hint">
        <LoadingSpinner :size="12" />
        <span>{{ t('cf.contest.schedule.refreshing') }}</span>
      </span>
    </div>

    <p v-if="error" class="cf-note is-error">{{ error }}</p>
    <p v-else-if="!loading && !contests.length" class="cf-note">
      {{ t('cf.contest.schedule.empty') }}
    </p>

    <p v-if="statesNote" class="cf-note">{{ statesNote }}</p>

    <template v-for="(group, index) in groups" :key="group.id">
      <!-- 分组标签：一行灰字，靠上边距与上一段分开（不铺底、不画条）。
           元信息（能力提示 · 更新于）只挂在第一组那一行的右端，属于整份列表 -->
      <div class="cf-schedule__group">
        <span class="cf-schedule__group-label">
          {{ t(`cf.contest.schedule.group.${group.id}`) }}
        </span>
        <span v-if="index === 0" class="cf-schedule__meta">
          <span v-if="showEntryColumn" class="cf-schedule__meta-hint">
            {{ t('cf.contest.schedule.capabilities') }}
          </span>
          <span v-if="fetchedAt && !error">
            {{ t('cf.contest.schedule.updated', { time: updatedText }) }}
          </span>
        </span>
      </div>
      <ul class="cf-list">
        <li v-for="contest in group.items" :key="contest.id">
          <div
            class="cf-schedule__row cf-list__row"
            :class="{
              'cf-schedule__row--entry': showEntryColumn,
              'cf-schedule__row--running': statusOf(contest) === 'running',
            }"
            role="button"
            tabindex="0"
            :aria-label="t('cf.contest.schedule.open', { name: contest.name })"
            @click="$emit('select', contest)"
            @keydown.enter.prevent="$emit('select', contest)"
            @keydown.space.prevent="$emit('select', contest)"
          >
            <!-- 比赛名在最左，时间（开赛时刻 + 倒计时）整块靠右 -->
            <!-- 比赛名**不是**链接（2026-11-01）：整行只有一个行为「载入这场」，名字只是它最长的一段。
                 以前名字是去 CF 的 <a>、行是载入，同一根水平带里两种行为、还看不出谁是谁。 -->
            <span class="cf-schedule__name" :title="contest.name">{{ contest.name }}</span>
            <span class="cf-schedule__start">{{ startText(contest) }}</span>
            <!-- 时钟格：未开赛是距开赛，进行中是**距结束还剩**（见 useCfSchedule.countdownOf）；
                 已进行 / 本场共多长放进悬停提示，不占格宽 -->
            <span
              class="cf-schedule__clock"
              :class="`is-${statusOf(contest)}`"
              :title="runningHintOf(contest)"
            >
              {{ countdownOf(contest) || '—' }}
            </span>
            <span v-if="showEntryColumn" class="cf-schedule__entry">
              <button
                v-if="actionKind(contest)"
                type="button"
                class="cf-mini"
                :title="
                  t(`cf.contest.schedule.entryTitle.${actionKind(contest)}`, { name: contest.name })
                "
                :disabled="!!entryBusy"
                @click.stop="askEntry(contest, actionKind(contest))"
                @keydown.stop
              >
                <LoadingSpinner v-if="entryBusy === String(contest.id)" :size="10" />
                <span>{{ actionLabel(contest) }}</span>
              </button>
              <span v-else class="cf-schedule__state">{{ stateText(contest) }}</span>
            </span>
            <!-- 行尾这颗是**唯一**去 CF 网页的出口（2026-11-01）：行本身整行都是「载入这场」，
                 两个行为从此各归各位 —— 行 = 站内，↗ = 外站。一直在，不靠悬停才现身 -->
            <a
              class="cf-schedule__open cf-icon-btn"
              :href="pageUrl(contest)"
              target="_blank"
              rel="noreferrer"
              :title="t('cf.contest.schedule.cfPage')"
              :aria-label="t('cf.contest.schedule.cfPage')"
              @click.stop
              @keydown.stop
            >
              <AppIcon name="external" :size="13" />
            </a>
            <!-- 进行中的场次在行底压一条 1px 进度线：行高仍是 40px，不加第二行 -->
            <span
              v-if="statusOf(contest) === 'running'"
              class="cf-schedule__progress"
              :style="{ width: `${Math.round(progressOf(contest) * 100)}%` }"
              aria-hidden="true"
            />
          </div>
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
          <!-- 报名方式（2026-10-30 加）：CF 只对允许 unrated 的轮次给这颗控件，站点看不见
               那一页，所以先摆出来让用户自己选；扩展那边设不上就不提交，回一句
               「这场比赛没有不计分选项」。VP 本来就不计分，这一行不出现。 -->
          <div
            v-if="showEntryMode"
            class="confirm__choice"
            role="radiogroup"
            :aria-label="t('cf.contest.schedule.entryMode.label')"
          >
            <label
              v-for="mode in ENTRY_MODES"
              :key="mode"
              class="confirm__option"
              :class="{ 'is-on': entryMode === mode }"
            >
              <input v-model="entryMode" type="radio" :value="mode" />
              <span>{{ t(`cf.contest.schedule.entryMode.${mode}`) }}</span>
            </label>
          </div>
          <p v-if="showEntryMode" class="confirm__hint">
            {{ t(`cf.contest.schedule.entryMode.hint.${entryMode}`) }}
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
 * 【点一行 = 载入这场】这里只把选中的比赛抛出去，翻模式、填链接、取数都归合成页签
 * 与比赛面板管 —— 赛程不该知道「比赛」那一层的输入框长什么样。
 * 整行**只有一个行为**（2026-11-01）：名字不在行内单独当链接，去 CF 网页只能走行尾那颗 ↗。
 *
 * 【只有这一页可见时才跳秒】active 由合成页签给（mode === 'schedule'）。切去抽题 / 比赛时
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
import { recordRegisteredContest } from '../services/cfStartReminder.js'
import { useCfSchedule } from '../composables/useCfSchedule.js'
import {
  canReadContestStates,
  canRegisterContest,
  canRegisterUnrated,
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
  statusOf,
  progressOf,
  startText,
  countdownOf,
  runningHintOf,
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

/**
 * 列表还是空的、第一份数据还在路上。
 *
 * 【这个 spinner 只属于首屏】回访与之后的刷新都是静默的（loading 不翻），列表照常显示；
 * 所以空页面上把「获取中」落在内容区的黄金分割点（见 .cf-blank），不挤在抬头。
 */
const blankLoading = computed(
  () => loading.value && !contests.value.length && !error.value,
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

/**
 * 报名方式的两个取值（键名同时是 `cf.contest.schedule.entryMode.*` 与 `.hint.*` 的键）。
 * 默认「计分」—— 绝大多数人要的就是这个，改主意只需多按一下。
 */
const ENTRY_MODES = ['rated', 'unrated']
const entryMode = ref('rated')

/** 只有「报名 + 扩展会拨那颗控件」时才有这一行；VP 不计分，不给选 */
const showEntryMode = computed(
  () => pendingEntry.value?.kind === 'register' && canRegisterUnrated.value,
)

function askEntry(contest, kind) {
  if (entryBusy.value || !kind) return
  // 每次开卡片都回到「计分」：上一场选过不计分，不该悄悄留给下一场
  entryMode.value = 'rated'
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
    'unrated-unavailable': 'unratedUnavailable',
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
  // 不计分只在「报名」上带下去；VP 本来就不计分，扩展那边也不看这个字段
  const unrated = kind === 'register' && entryMode.value === 'unrated'
  const result = await submitEntry(contest, kind, { unrated })

  if (result.ok) {
    // 站内报名成功：记下开赛时刻，T-10 分钟由 cfStartReminder 弹提醒（VP 不记 ——
    // 它当场就开，没有「提前十分钟」可言；开赛时刻拿不到的场次服务里会静默跳过）
    if (kind === 'register') recordRegisteredContest(contest)
    notify({
      type: 'success',
      title: t(
        unrated ? 'cf.contest.schedule.entryDone.registerUnrated' : `cf.contest.schedule.entryDone.${kind}`,
        { name: contest.name },
      ),
      message: kind === 'register' ? t('cf.contest.schedule.remindNote') : '',
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
/* 在外层的 .cf-page--fill 里撑满余下的高度（见 cf-console.css 的「空白区提示」） */
.cf-schedule {
  flex: 1 1 auto;
  min-height: 0;
}

/* 列表还空着：这一页要吃到内容层底部，.cf-blank 才有「空白区」可量 */
.cf-schedule--blank {
  display: flex;
  flex-direction: column;
}

/* 分组标签：一行灰字，靠上边距与上一段分开（不铺底、不画条）。
   2026-10-29：字号 11 → 12.5（与行内正文同一档，三组一起长，只改两个会看着像漏了一个）；
   同时变成「左标签 / 右元信息」的一行 —— 「更新于」原来自己占着抬头一整行，太浪费。 */
.cf-schedule__group {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  margin: 18px 0 2px;
  color: var(--text-faint);
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.cf-schedule__group-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 元信息（扩展能力 · 更新于）：贴在分组标签右端，比标签小一号、常规字重 ——
   同一行里靠字重与字号分层，不靠再加一根竖线 */
.cf-schedule__meta {
  display: flex;
  flex: 0 0 auto;
  align-items: baseline;
  gap: 8px;
  color: var(--text-faint);
  font-size: 11.5px;
  font-weight: 400;
  letter-spacing: 0;
  white-space: nowrap;
}

/* 两段之间点一颗「·」：挂在**前一段**的尾巴上（窄容器里前一段会被 display:none，
   点跟着一起消失；写成 `span + span::before` 会在只剩「更新于」时留下一颗悬空的点） */
.cf-schedule__meta-hint::after {
  content: '·';
  margin-left: 8px;
}

/* 一场一行：比赛名在左（吃掉剩余宽度），开赛时刻与倒计时收在右端，
   最右一格是「去 CF 网页」的图标（2026-11-01）。
   列宽写死（理由同 .cf-result）：各行独立 grid，auto 会对不齐。
   末列 168（2026-11-01 由 144 加宽）：进行中的那格要装下「还剩 4 小时 59 分钟 59 秒」，
   12px 等宽下实测 163.5px —— 还按 144 会让格子向左溢出 19.5px、压到「开赛时刻」那列的尾巴上 */
.cf-schedule__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 92px 168px 20px;
  align-items: center;
  gap: 12px;
  height: 40px;
  color: var(--text);
  font-size: 12.5px;
  cursor: pointer;
}

/* 报名状态 / 动作列：只有在扩展支持时才多出这一格 */
.cf-schedule__row--entry {
  grid-template-columns: minmax(0, 1fr) 92px 168px 76px 20px;
}

/* 进行中：左侧一条 2px 呼吸条 + 极浅的绿雾（从左往右淡出），不铺整行色块。
   呼吸条用 ::after —— ::before 已经被行间分隔线占了 */
.cf-schedule__row--running {
  background-image: linear-gradient(90deg, var(--ok-face), transparent 46%);
}

.cf-schedule__row--running::after {
  content: '';
  position: absolute;
  top: 7px;
  bottom: 7px;
  left: 0;
  width: 2px;
  border-radius: 2px;
  background: var(--ok);
  animation: cf-running-pulse 2s ease-in-out infinite;
}

/* 进度线：贴在行底 1px，宽度 = 已进行 / 总时长；每秒平滑过去，行高不变 */
.cf-schedule__progress {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 1px;
  border-radius: 0 1px 1px 0;
  background: var(--ok);
  opacity: 0.5;
  transition: width 1s linear;
}

@keyframes cf-running-pulse {
  50% {
    opacity: 0.3;
  }
}

@media (prefers-reduced-motion: reduce) {
  .cf-schedule__row--running::after {
    animation: none;
  }

  .cf-schedule__progress {
    transition: none;
  }
}

.cf-schedule__row:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: -2px;
}

/* 距开赛 / 距结束：等宽数字、靠右贴齐 —— 单位串长短不一，右缘对齐才不乱；
   列宽写死 168px（最长的是进行中那句「还剩 4 小时 59 分钟 59 秒」，12px 等宽下实测 163.5px），
   各行才不会错位。进行中那格还带一份悬停提示（已进行 / 本场共多长），见 runningHintOf */
.cf-schedule__clock {
  overflow: hidden;
  justify-self: end;
  color: var(--text-dim);
  font-family: var(--mono-font);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cf-schedule__clock.is-running {
  color: var(--ok);
}

.cf-schedule__clock.is-upcoming {
  color: var(--accent-text);
}

.cf-schedule__start {
  overflow: hidden;
  justify-self: end;
  color: var(--text-faint);
  font-family: var(--mono-font);
  font-size: 11.5px;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 比赛名不再是一颗链接（2026-11-01）：它和整行同一个行为，所以强调也跟着**整行悬停**走
   —— 指针落在这一行的任何地方，名字都亮成主色，说明「你现在点的是一整行」 */
.cf-schedule__name {
  min-width: 0;
  overflow: hidden;
  color: var(--text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

:where(html.is-hoverable) .cf-schedule__row:hover .cf-schedule__name {
  color: var(--accent-text);
}

/* 行尾那颗「在 Codeforces 打开」：比通用的 .cf-icon-btn（26×26）更窄一档，
   只留 20×20 的热区、字形本身 13px —— 视觉上是一条淡淡的出口，不是第二个主按钮 */
.cf-schedule__row .cf-schedule__open {
  justify-self: center;
  width: 20px;
  height: 20px;
  border-radius: 5px;
}

/* 报名状态 / 动作列：这一格有时是文字（已报名 / 未开放）、有时是按钮（报名 / VP）。
   两种元素宽度不同，靠左对不齐视觉中心 —— 统一水平居中，各行的中心落在同一条竖线上 */
.cf-schedule__entry {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
}

/* 报名状态是「文字」，与行里其它元数据同一档；动作才是按钮 */
.cf-schedule__state {
  color: var(--text-faint);
  font-size: 11.5px;
  white-space: nowrap;
}

/* 窄容器：先撤开始时刻，只留比赛名 + 倒计时 + 行尾的外链图标（名字截断，悬停读全）。
   末列与宽容器同一档 168：进行中那句「还剩 …」最长 163.5px，收窄到 144 会截断成「还剩 4 小时 59 分…」 */
@container cf (max-width: 34rem) {
  .cf-schedule__row {
    grid-template-columns: minmax(0, 1fr) 168px 20px;
    gap: 10px;
  }

  .cf-schedule__row--entry {
    grid-template-columns: minmax(0, 1fr) 168px 72px 20px;
  }

  .cf-schedule__start {
    display: none;
  }

  /* 能力提示比「更新于」长得多，窄容器里先让它让位 —— 时间在不在新才是一眼要看的 */
  .cf-schedule__meta-hint {
    display: none;
  }
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

/* 报名方式：两颗并排的胶囊单选。自绘而非用原生 radio —— 原生圆点在深色主题下会露出系统蓝，
   与卡片其余部分不是一套。真 input 仍留在 label 里（可聚焦、可读屏），只是视觉上收起来 */
.confirm__choice {
  display: flex;
  gap: 6px;
  margin-top: 10px;
}

.confirm__option {
  display: inline-flex;
  flex: 1 1 0;
  align-items: center;
  justify-content: center;
  padding: 5px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-panel);
  color: var(--text-dim);
  font-size: 12px;
  cursor: pointer;
}

.confirm__option input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.confirm__option.is-on {
  border-color: transparent;
  background: var(--accent);
  color: var(--text-on-accent);
}

:where(html.is-hoverable) .confirm__option:not(.is-on):hover {
  background: var(--bg-hover);
}

.confirm__option:focus-within {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
}

/* 这一行解释选中的那一边到底意味着什么（计分 / 不计分），一行灰字 */
.confirm__hint {
  margin: 6px 0 0;
  color: var(--text-faint);
  font-size: 11.5px;
  line-height: 1.6;
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

:where(html.is-hoverable) .confirm__btn:hover {
  background: var(--bg-hover);
}

.confirm__btn--primary {
  border-color: transparent;
  background: var(--accent);
  color: var(--text-on-accent);
}

:where(html.is-hoverable) .confirm__btn--primary:hover {
  background: var(--accent-hover);
}

.confirm__btn:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
}
</style>

<style scoped src="../styles/cf-console.css"></style>
