<template>
  <!-- 赛程：合成页签抬头的三个模式之一（见 CfCodeforcesPanel）。
       2026-10-28 改版：分组标签退成一行灰字，每场一行 40px，行间一条 5% 淡线，
       悬停铺一层极浅的底 —— 与题目 / 榜单 / 提交同一套列表语汇。 -->
  <section class="cf-schedule" :class="{ 'cf-schedule--blank': blankLoading }">
    <!-- 2026-10-29：「更新于」不再独占抬头那一行 —— 它挪到第一组标签的右端
         （页面第一行就是「即将开始」，上面不再空出一条只有时间的线）。
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
           「更新于」只挂在第一组那一行的右端，属于整份列表 -->
      <div class="cf-schedule__group">
        <span class="cf-schedule__group-label">
          {{ t(`cf.contest.schedule.group.${group.id}`) }}
        </span>
        <span v-if="index === 0" class="cf-schedule__meta">
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
              'cf-schedule__row--finished': statusOf(contest) === 'finished',
              'cf-schedule__row--virtual': isVirtual(contest),
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
            <!-- 窄容器的名字用短名（2026-11-02）：两个版本都渲染，容器查询只切显示。
                 title 仍是全名，鼠标悬停 / 读屏拿到的永远是原名 -->
            <span class="cf-schedule__name" :title="contest.virtual ? virtualHint(contest) : contest.name">
              <!-- 开过 VP 的场次：名字前一枚小徽标。开赛时刻就在右边那一列（已经是 VP 的时刻），
                   悬停徽标再把「是虚拟参赛」说全 -->
              <span v-if="isVirtual(contest)" class="cf-schedule__vp">{{ t('cf.contest.schedule.virtualBadge') }}</span>
              <span class="cf-schedule__name-full">{{ contest.name }}</span>
              <span class="cf-schedule__name-short">{{ compactContestName(contest.name) }}</span>
            </span>
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
    <AppDialog
      v-if="pendingEntry"
      role="alertdialog"
      icon="play"
      size="sm"
      describedby="contest-entry-desc"
      initial-focus=".js-primary"
      :title="
        t(`cf.contest.schedule.entryTitle.${pendingEntry.kind}`, {
          name: pendingEntry.contest.name,
        })
      "
      @close="cancelEntry"
    >
      <p id="contest-entry-desc" class="confirm-desc">
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
      <!-- 虚拟参赛的开始时刻（2026-11-03 加）：CF 的 VP 表单本来就有这一行，默认「现在」，
           站点把它摆到确认卡片上。旧扩展没有这条能力，整行不出现，行为与以前一样 -->
      <div v-if="showEntryStart" class="confirm__field">
        <label class="confirm__label" for="contest-vp-start">
          {{ t('cf.contest.schedule.entryStart.label') }}
        </label>
        <input
          id="contest-vp-start"
          v-model="entryStartAt"
          class="confirm__input"
          type="datetime-local"
        />
      </div>
      <p v-if="showEntryStart" class="confirm__hint">
        {{ t('cf.contest.schedule.entryStart.hint') }}
      </p>

      <template #footer>
        <button type="button" class="app-dialog__btn" @click="cancelEntry">
          {{ t('cf.contest.schedule.entryCancel') }}
        </button>
        <button type="button" class="app-dialog__btn app-dialog__btn--primary js-primary" @click="confirmEntry">
          {{ t('cf.contest.schedule.entryConfirm') }}
        </button>
      </template>
    </AppDialog>
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
import { computed, ref } from 'vue'

import { contestUrl } from '../cf/contest.js'
import AppDialog from './AppDialog.vue'
import AppIcon from './AppIcon.vue'
import LoadingSpinner from './LoadingSpinner.vue'
import { t } from '../i18n/index.js'
import { notify } from '../services/notifications.js'
import { recordRegisteredContest } from '../services/cfStartReminder.js'
import { useCfSchedule, compactContestName } from '../composables/useCfSchedule.js'
import {
  canReadContestStates,
  canRegisterContest,
  canRegisterUnrated,
  canStartVirtual,
  canStartVirtualAt,
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
  isVirtual,
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
  const base = contestUrl({ kind: 'contest', contestId: String(contest?.id ?? ''), groupId: '' })
  // VP 还没开始时，CF 那一页是倒计时页（/contest/{id}/countdown）；开赛后同一个地址会自动
  // 跳回 /contest/{id}。这与用户在 /contests 上点「Enter」看到的落点一致（2026-11-03）
  return isVirtual(contest) && statusOf(contest) === 'upcoming' ? `${base}/countdown` : base
}

/** 名字前的 VP 徽标悬停时说全：开赛时刻就是右边那一列（VP 自己的时刻） */
function virtualHint(contest) {
  return t('cf.contest.schedule.virtualHint', { time: startText(contest) })
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
  // 已经开过 VP 的场次不再给动作：报名对已结束的比赛不成立，VP 也不能开第二次
  if (isVirtual(contest)) return ''
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
  if (isVirtual(contest)) return t('cf.contest.schedule.virtualState')
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

/** 待确认的动作（null = 没有卡片）；默认焦点由 AppDialog 的 initial-focus 决定 */
const pendingEntry = ref(null)

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

/** 虚拟参赛的开始时刻（datetime-local 的本地时间串）；空串 = 交给 CF 用「现在」 */
const entryStartAt = ref('')

/** 只有「开 VP + 扩展认得 startAt」时才有这一行 */
const showEntryStart = computed(
  () => pendingEntry.value?.kind === 'virtual' && canStartVirtualAt.value,
)

/** 本地时间串：`datetime-local` 要的是 yyyy-MM-ddTHH:mm，不带时区 */
function localDateTimeText(date) {
  const pad = (value) => String(value).padStart(2, '0')
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  return `${day}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function askEntry(contest, kind) {
  if (entryBusy.value || !kind) return
  // 每次开卡片都回到「计分」：上一场选过不计分，不该悄悄留给下一场
  entryMode.value = 'rated'
  // 开始时间同理：每次都从此刻起算，不记上一场选过的时刻
  entryStartAt.value = kind === 'virtual' ? localDateTimeText(new Date()) : ''
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

// 默认焦点由 AppDialog 接管（见模板里的 initial-focus）。

async function confirmEntry() {
  const entry = pendingEntry.value
  if (!entry) return
  pendingEntry.value = null

  const { contest, kind } = entry
  // 不计分只在「报名」上带下去；VP 本来就不计分，扩展那边也不看这个字段
  const unrated = kind === 'register' && entryMode.value === 'unrated'
  // 开始时刻只在「开 VP」上带下去；空串 / 解析不出来 = 0，扩展按「现在开始」提交
  const startAt = kind === 'virtual' && entryStartAt.value
    ? new Date(entryStartAt.value).getTime()
    : 0
  const result = await submitEntry(contest, kind, { unrated, startAt })

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

/* 元信息（更新于）：贴在分组标签右端，比标签小一号、常规字重 ——
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

/* 一场一行：比赛名在左（吃掉剩余宽度），开赛时刻与倒计时收在右端，
   最右一格是「去 CF 网页」的图标（2026-11-01）。
   前两列写死（理由同 .cf-result）：各行独立 grid，auto 会对不齐。
   末列 2026-11-01 是定宽 168，按最长的那句「还剩 4 小时 59 分钟 59 秒」（163.5px）定的；
   可 168 只在进行中那几行才用满，未开赛的倒计时实测 88~139.5（周/天两档 105.8、
   天/时/分 125、两位小时 132.3、一天以内 139.5），右对齐后左边空出 29~50px 死白
   —— 开赛时刻和倒计时之间实测 62.2px，太大（2026-11-02 用户报障）。
   改成 minmax(140px, max-content)：140 正好是未开赛那一档的天花板（139.5），
   未开赛各行都落在同一个定宽上，开赛时刻仍严格对齐；倒计时与开赛时刻的间距收到 12~46px。
   只有进行中那句 163.5 会把这一列撑开 —— 它单独一组，左边让出 23px 不影响别的行。
   宽度足够时保持这套版式；窄容器换成下面那两档（2026-11-02 用户口径）。 */
.cf-schedule__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 92px minmax(140px, max-content) 20px;
  align-items: center;
  gap: 12px;
  height: 40px;
  color: var(--text);
  font-size: 12.5px;
  cursor: pointer;
}

/* 报名状态 / 动作列：只有在扩展支持时才多出这一格 */
.cf-schedule__row--entry {
  grid-template-columns: minmax(0, 1fr) 92px minmax(140px, max-content) 76px 20px;
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
   列宽至少 140px（未开赛最长的一档 139.5），内容更长才把这一列撑开
   （只有进行中那句 163.5 会，见 .cf-schedule__row），所以右缘是稳的、左缘只在长句上才往左扩。
   进行中那格还带一份悬停提示（已进行 / 本场共多长），见 runningHintOf */
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

/* 短名只在窄容器切出来（规则见下面两档 container query）：宽屏仍是完整比赛名 */
.cf-schedule__name-short {
  display: none;
}

/* 已开 VP 的场次：名字前一枚纯文字徽标（不铺底、不描边）。开赛时刻在右边那一列，
   这里只负责让人一眼看出「这一行的时间不是官方的」 */
.cf-schedule__vp {
  margin-right: 5px;
  color: var(--accent-text);
  font-family: var(--ui-font);
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.06em;
  vertical-align: 1px;
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

/* 带「报名 / VP」那一列的窄容器（2026-11-02）：40rem 以下这一行从定宽版式换成窄档 ——
   列间距 8、倒计时 fit-content、动作格 56。开始时刻仍留在这一档：名字换短名
   （Edu 196(Div. 2) / CF 1131(Div. 2)）后只要 60~150px（全列表 p50 = 88.6px），到 32rem（容器 512px）
   还有约 165px 给名字，最长的「Kotlin Heroes: Practice 15」约 151px，正好放得下。
   宽度在 40rem 以上时不受影响，仍是上面的定宽版式。 */
@container cf (max-width: 40rem) {
  .cf-schedule__row--entry {
    grid-template-columns: minmax(0, 1fr) 92px fit-content(168px) 56px 20px;
    gap: 8px;
  }

  /* 动作格从 72 收到 56（2026-11-02）：72 是按最宽的忙碌态「报名中…」定的，常态的「报名」
     只有 49px、「未开放」37px —— 内容居中时两侧各空十几 px，外链图标像是被甩在一边；
     但也不能改成贴右对齐（用户报障）：按钮有 10px 内边距、状态文字没有，右缘一对齐，
     两种内容的视觉中心就错开了。56px 同时保住「居中」与「靠得近」：常态按钮离外链
     15px、状态文字 21px（原来是 23 / 29）。忙碌态约 80px，比这一格宽出的部分居中分摊到
     两侧，8px 列间距之外只多出几 px，且只出现在提交那一两秒。 */

  /* 窄容器里名字换成短名（Edu 196(Div. 2) / CF 1131(Div. 2)）：40rem 以下名字列只剩二三百 px，
     长的场次会只露半个系列名；短名能把编号、Div. 和「Based on …」这些区分信息露出来。
     宽屏不受影响，仍是原名（2026-11-02） */
  .cf-schedule__name-full {
    display: none;
  }

  .cf-schedule__name-short {
    display: inline;
  }
}

/* 容器再窄，这一行也留不住开始时刻了：512px 时名字列约 165px（按未开赛 117.8px
   的倒计时算），再往下「Kotlin Heroes…」就要截断。撤掉时刻后只留
   名字 + 倒计时 + 动作 + 外链（名字截断，悬停读全）。 */
@container cf (max-width: 32rem) {
  .cf-schedule__row--entry {
    grid-template-columns: minmax(0, 1fr) fit-content(168px) 56px 20px;
  }

  .cf-schedule__row--entry .cf-schedule__start {
    display: none;
  }
}

/* 没有扩展时这一行没有动作列（少 56px + 一道 gap），同样的宽度能多撑一档：
   34rem 以下换成窄档（列间距 8、倒计时 fit-content），开始时刻仍在；
   到 28rem 才撤 —— 那一档的名字列同样约 165px（448 的容器 − 行内距 − 92 − 118 − 20 − 24）。
   末列上限仍是 168：进行中那句「还剩 …」最长 163.5px，再收会截断成「还剩 4 小时 59 分…」，
   窄档把它改成 fit-content(168px)：未开赛 125px、「—」7px，省下的宽度归名字，
   右缘仍与上面各档对齐（右对齐的格子，收窄只吃掉左侧空白）。 */
@container cf (max-width: 34rem) {
  .cf-schedule__row:not(.cf-schedule__row--entry) {
    grid-template-columns: minmax(0, 1fr) 92px fit-content(168px) 20px;
    gap: 8px;
  }
}

/* 没有动作列的这一行也留不住开始时刻了：只留名字 + 倒计时 + 外链
   （名字截断，悬停读全；末列上限的口径同上一档） */
@container cf (max-width: 28rem) {
  .cf-schedule__row:not(.cf-schedule__row--entry) {
    grid-template-columns: minmax(0, 1fr) fit-content(168px) 20px;
  }

  .cf-schedule__start {
    display: none;
  }
}

/* 最窄档（2026-11-09 用户口径）：把倒计时里「数字 ↔ 单位」之间那道空格收紧。
   这一格是 12px 等宽字，一个空格就占 7.2px —— 「3 天 17 小时 19 分钟」五个空格共 36px，
   占整格 132px 的 27%；而同一行的比赛名只剩几十 px，界面上读到的是「CF 1134 (D…」。
   收 -0.3em（≈ 3.6px/格）之后每个间隔仍留 3.6px，数与单位一眼还分得开，整格掉到 114px，
   省下的 18px 全部归名字（这一格是 fit-content + 右对齐，收窄只吃掉左侧空白，
   右缘与开赛时刻／「—」那一列的对齐不变）。
   只在窄档生效：宽容器里空格本就是分隔手段，字距收得太紧反而难读。 */
@container cf (max-width: 28rem) {
  .cf-schedule__clock {
    word-spacing: -0.3em;
  }
}

/* 已结束的场次没有倒计时，最后一格只是「—」占位：窄容器里把这一格整格撤掉，
   开赛时刻留下（2026-11-02 用户口径）—— 否则窄屏上会剩下一行「没有时间、只有一个破折号」。
   撤掉一列要同时换模板，开赛时刻在 32rem / 28rem 档本来会被上面撤掉，这里对已结束的行改回显示。
   两个档分别挂在各自的断点上：40rem 只覆盖带动作列的行，34rem 才覆盖没有动作列的行 ——
   后者在 40~34rem 之间仍是宽版式，不能提前换成窄模板。

   时刻轨道 92 → 108、并给自己补 16px 右内边距（2026-11-02 用户报障）：撤掉倒计时后，
   时刻的右缘只隔一道 8px 列距就贴住「VP / 外链图标」，看着像被推到最右边。轨道加宽的 16px
   正好被内边距吃掉，日期可用宽度仍是原来的 92px（跨年的长日期不会更容易截断），
   与右侧那一簇的间距从 8px 变成 24px。 */
@container cf (max-width: 40rem) {
  .cf-schedule__row--entry.cf-schedule__row--finished {
    grid-template-columns: minmax(0, 1fr) 108px 56px 20px;
  }

  .cf-schedule__row--entry.cf-schedule__row--finished .cf-schedule__clock {
    display: none;
  }

  .cf-schedule__row--entry.cf-schedule__row--finished .cf-schedule__start {
    display: inline;
    padding-right: 16px;
  }
}

@container cf (max-width: 34rem) {
  .cf-schedule__row:not(.cf-schedule__row--entry).cf-schedule__row--finished {
    grid-template-columns: minmax(0, 1fr) 108px 20px;
  }

  .cf-schedule__row:not(.cf-schedule__row--entry).cf-schedule__row--finished .cf-schedule__clock {
    display: none;
  }

  .cf-schedule__row:not(.cf-schedule__row--entry).cf-schedule__row--finished .cf-schedule__start {
    display: inline;
    padding-right: 16px;
  }
}

/* 极窄档：上面那道「轨道 108 + 右内边距 16」的宽松版到此为止（2026-11-13 用户报障）。
   那 16px 内边距是**从比赛名身上抠出来的**：容器 286（视口 300）时名字列只剩 92px，
   「CF 1130 (Div. 2)」在被截断——而时刻那一格只用到 76px（`10-26 22:35`，11.5px 等宽），
   轨道里另有 16px 完全是死白。这一档把轨道收回到 92、内边距归零：
   时刻整体右移 16px（右缘从「离图标 24px」收到 8px，仍隔着一道列距与外链图标的字形留白），
   省下的 16px 全部归名字；那句日期可用的宽度仍是 92px，跨年的长日期不会更容易截断。
   两档分别挂在各自最后一级断点上（带动作列到 32rem 就没有更窄的模板了）。 */
@container cf (max-width: 32rem) {
  .cf-schedule__row--entry.cf-schedule__row--finished {
    grid-template-columns: minmax(0, 1fr) 92px 56px 20px;
  }

  .cf-schedule__row--entry.cf-schedule__row--finished .cf-schedule__start {
    padding-right: 0;
  }
}

@container cf (max-width: 28rem) {
  .cf-schedule__row:not(.cf-schedule__row--entry).cf-schedule__row--finished {
    grid-template-columns: minmax(0, 1fr) 92px 20px;
  }

  .cf-schedule__row:not(.cf-schedule__row--entry).cf-schedule__row--finished .cf-schedule__start {
    padding-right: 0;
  }
}

/* ---------------- 确认卡片 ---------------- */
/* 与提交确认 / 卸载确认同一套视觉：Teleport 到 body，只依赖主题变量 */
/* 外壳 / 标题 / 动作按钮都在 AppDialog（含 base.css 的 .app-dialog__btn）；
   这里只剩报名卡特有的单选、提示与时间输入。 */
.confirm-desc {
  margin: 0;
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

/* 虚拟参赛的开始时间（2026-11-03）：一行标签 + 本地时间输入框。
   输入框用原生 datetime-local —— 时区就是本机时区，与扩展那边填给 CF 的口径一致 */
.confirm__field {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}

.confirm__label {
  flex: none;
  font-size: 12px;
  color: var(--text-dim);
}

.confirm__input {
  flex: 1 1 auto;
  min-width: 0;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-panel);
  color: var(--text);
  font: 500 12.5px/1.5 var(--font-sans, system-ui);
}

.confirm__input:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
}


</style>

<style scoped src="../styles/cf-console.css"></style>
