<template>
  <!-- 2026-10-27 起与抽题面板一起挂进合并后的 Codeforces 页签（CfCodeforcesPanel），
       自己不再占视图 id。版式沿用「工业引擎控制台」（共享样式见 src/styles/cf-console.css）。
       data-native-focus：与抽题面板同一口径，点输入框 / 按钮时键盘该收掉。 -->
  <div class="cf-view" data-native-focus>
    <!-- 抬头：标题 + 模式（赛程 / 比赛）。状态与页签跟在下面，只在比赛模式出现 -->
    <div class="cf-shell">
      <header class="cf-cell cf-cell--span cf-bar">
        <span class="cf-bar__title">{{ t('cf.contest.title') }}</span>
        <span class="cf-contest__modes">
          <button
            v-for="item in MODES"
            :key="item"
            type="button"
            class="cf-seg"
            :class="{ 'is-on': mode === item }"
            @click="mode = item"
          >
            {{ t(`cf.contest.mode.${item}`) }}
          </button>
        </span>
      </header>

      <template v-if="mode === 'contest'">
        <label class="cf-cell cf-cell--label">{{ t('cf.contest.fields.link') }}</label>
        <div class="cf-cell cf-cell--value">
          <input
            v-model="specText"
            class="cf-input cf-input--text"
            type="text"
            spellcheck="false"
            autocapitalize="off"
            :placeholder="t('cf.contest.fields.linkPlaceholder')"
            :aria-label="t('cf.contest.fields.link')"
            @keydown.enter="load"
          />
          <button
            type="button"
            class="cf-exec cf-exec--inline"
            :disabled="busy"
            @click="load"
          >
            <LoadingSpinner v-if="busy" :size="11" />
            <span>{{ busy ? t('cf.contest.status.loading') : t('cf.contest.action.load') }}</span>
          </button>
        </div>

        <!-- 子页签 + 本页动作。题目页放抓样例 / 全部导入，提交入口只在这一场有可交的文件时出现 -->
        <div class="cf-cell cf-cell--span cf-contest__toolbar">
          <nav class="cf-contest__tabs">
            <button
              v-for="item in TABS"
              :key="item"
              type="button"
              class="cf-contest__tab"
              :class="{ 'is-on': tab === item }"
              @click="tab = item"
            >
              {{ t(`cf.contest.tabs.${item}`) }}
            </button>
          </nav>
          <span class="cf-results__actions">
            <template v-if="tab === 'problems'">
              <button
                v-if="scrapeAvailable"
                type="button"
                class="cf-head-btn"
                :class="{ 'cf-head-btn--busy': scraping }"
                :disabled="scraping"
                @click="scrapeSamples"
              >
                <LoadingSpinner v-if="scraping" :size="10" />
                <span>{{ scraping ? t('cf.contest.action.scraping') : t('cf.contest.action.scrape') }}</span>
              </button>
              <button
                type="button"
                class="cf-head-btn"
                :class="{ 'cf-head-btn--busy': importingAll }"
                :disabled="importingAll || !problems.length || allImported"
                @click="importAll"
              >
                <LoadingSpinner v-if="importingAll" :size="10" />
                <span>{{ importingAll ? t('cf.picker.result.importing') : t('cf.picker.result.importAll') }}</span>
              </button>
            </template>
            <button
              v-if="canSubmitActive"
              type="button"
              class="cf-head-btn cf-head-btn--accent"
              @click="emit('submit-active')"
            >
              {{ t('cf.contest.action.submitActive') }}
            </button>
          </span>
        </div>

        <div
          v-if="statusText || loadingContest || loadingProblems"
          class="cf-cell cf-cell--span cf-contest__statusrow"
        >
          <span class="cf-status" :class="{ 'is-error': !!error }">
            <LoadingSpinner v-if="loadingContest || loadingProblems" :size="10" />
            <span class="cf-status__text">{{ statusText }}</span>
          </span>
        </div>
      </template>
    </div>

    <!-- 赛程：打开面板的默认一页。v-show 保状态：切去比赛再回来，列表不重取 -->
    <CfContestSchedule
      v-show="mode === 'schedule'"
      :active="props.active && mode === 'schedule'"
      @select="openContest"
    />

    <!-- 空态说明（还没开赛 / 这场没有题目列表）：只在这一块说，不占状态行 -->
    <p
      v-if="mode === 'contest' && tab === 'problems' && problemsNote"
      class="cf-contest__note cf-contest__note--block"
    >
      {{ t(problemsNote.key) }}
    </p>

    <!-- 本场题目：抬头左边是比赛名（链去 Codeforces）、右边是抓样例的进度 -->
    <section
      v-if="mode === 'contest' && tab === 'problems' && problems.length"
      class="cf-results"
    >
      <div class="cf-results__head">
        <a :href="url" target="_blank" rel="noreferrer" class="cf-contest__name">{{ title }}</a>
        <span v-if="scrapeNote" class="cf-contest__note">{{ scrapeNote }}</span>
      </div>
      <ul class="cf-results__list">
        <li
          v-for="problem in problems"
          :key="`${problem.contestId}-${problem.index}`"
          class="cf-result"
        >
          <span class="cf-result__id">{{ problem.contestId }}{{ problem.index }}</span>
          <span class="cf-result__name" :title="problem.name">{{ problem.name }}</span>
          <span class="cf-result__tags" :title="problem.tags.join(', ')">
            {{ problem.tags.join(' · ') }}
          </span>
          <span class="cf-result__rating">{{ problem.rating ?? '' }}</span>
          <button
            type="button"
            class="cf-result__import"
            :class="`is-${importState(problem)}`"
            :disabled="importState(problem) !== 'import'"
            @click="importOne(problem)"
          >
            <LoadingSpinner v-if="importState(problem) === 'importing'" :size="9" />
            <span>{{ t(`cf.picker.result.${importState(problem)}`) }}</span>
          </button>
          <a
            class="cf-result__link"
            :href="problem.task.url"
            target="_blank"
            rel="noreferrer"
            :title="t('cf.picker.result.open')"
            :aria-label="t('cf.picker.result.open')"
          >
            <AppIcon name="link" :size="12" />
          </a>
        </li>
      </ul>
    </section>

    <!-- 榜单与提交：各自带取数 / 轮询（见 useCfStandings / useCfSubmissions），
         不在这里重复管 loading。v-show 保状态，切回题目再回来不重取。 -->
    <CfStandingsTable
      v-show="mode === 'contest' && tab === 'standings'"
      :spec="spec"
      :active="props.active && mode === 'contest' && tab === 'standings'"
      :live="live"
    />
    <CfSubmissionList
      v-show="mode === 'contest' && tab === 'submissions'"
      :spec="spec"
      :active="props.active && mode === 'contest' && tab === 'submissions'"
      :live="live"
    />
  </div>
</template>

<script setup>
/**
 * CfContestPanel —— Codeforces 比赛面板。
 *
 * 【三种页面，两个轴】模式轴是「赛程 / 比赛」：赛程打开即取比赛列表（P0 的默认页），
 * 比赛模式才需要贴链接。比赛模式里再分三个子页：题目 / 排行榜 / 提交。
 * 赛程与比赛的另一层关系是**点一行赛程 = 载入这场**（openContest），用户不必手工复制 ID。
 *
 * 【状态在哪】题目 / 元数据 / 导入全在 useCfContest，**只在本组件的 setup 里调一次**
 * （与 useCfPicker 只归 CfPickerPanel 同一条纪律）。榜单与提交各自有组合式，归各自的
 * 子组件调 —— 它们只在被切到那一页时才取数（active 由这里给）。
 *
 * 【提交当前文件为什么只在这一场有可交文件时出现】沿用 2026-10-23 的口径：交不了就不显示，
 * 别摆一颗永远灰着的按钮。判据与 App 的提交按钮同源（shouldShowSubmit + submitBlockedReason），
 * 再加一条「活动文件的比赛就是当前这场」—— 在 A 场的面板里把 B 题的代码交出去是没法解释的。
 * 真正的确认与发送仍归 App（emit submit-active → requestSubmitConfirmation），
 * 不在这里复制一份提交逻辑。
 *
 * 【版式】控制台网格是两个面板共用的（src/styles/cf-console.css），这里只放比赛自己
 * 特有的规则（模式开关、子页签、工具栏）。
 */
import { computed, ref } from 'vue'

import AppIcon from './AppIcon.vue'
import CfContestSchedule from './CfContestSchedule.vue'
import CfStandingsTable from './CfStandingsTable.vue'
import CfSubmissionList from './CfSubmissionList.vue'
import LoadingSpinner from './LoadingSpinner.vue'
import { t } from '../i18n/index.js'
import { useCfContest } from '../composables/useCfContest.js'
import { useCompanionBridge } from '../composables/useCompanionBridge.js'
import { parseCodeforcesProblem, shouldShowSubmit, submitBlockedReason } from '../services/ojSubmit.js'
import { activeLanguage, activeNode } from '../services/vfs/workspaceStore.js'

const emit = defineEmits(['submit-active'])

/**
 * 这一页露没露出来（来自合成页签的可见性，见 CfCodeforcesPanel）。本组件与它的子页都
 * 是常驻挂载的，只有 mode/tab 这两条不够 —— 整个页签没露出来时，赛程不该取列表、
 * 更不该让扩展去读报名状态。
 */
const props = defineProps({
  active: { type: Boolean, default: true },
})

const MODES = ['schedule', 'contest']
const TABS = ['problems', 'standings', 'submissions']

const {
  specText,
  spec,
  load,
  busy,
  loadingContest,
  loadingProblems,
  error,
  problems,
  problemsNote,
  url,
  title,
  status,
  statusText,
  importOne,
  importAll,
  importState,
  importingAll,
  allImported,
  scrapeAvailable,
  scraping,
  scrapeNote,
  scrapeSamples,
} = useCfContest()

/** 回来时上一场还在 → 直接开在比赛模式；第一次用 → 先看赛程（这是 P0 的入口页） */
const mode = ref(specText.value.trim() ? 'contest' : 'schedule')
const tab = ref('problems')

const live = computed(() => status.value === 'running')

/** 点赛程里的一行：填链接、切到比赛模式、载入这场 */
function openContest(contest) {
  if (!contest?.id) return
  specText.value = String(contest.id)
  mode.value = 'contest'
  tab.value = 'problems'
  void load()
}

// ------------------------------------------------------------ 提交当前文件

const { checking: extensionChecking, canSubmitCode } = useCompanionBridge()

const activeProblem = computed(() => parseCodeforcesProblem(activeNode.value?.meta?.url))

/** 当前这场在 CF 上的路径前缀；与解析出来的 contestPath 逐字比对 */
const activeContestPath = computed(() => {
  const current = spec.value
  if (!current) return ''
  if (current.kind === 'group') {
    return `/group/${current.groupId}/contest/${current.contestId}`
  }
  return `/${current.kind}/${current.contestId}`
})

const canSubmitActive = computed(() => {
  if (mode.value !== 'contest') return false
  if (!activeProblem.value || activeProblem.value.contestPath !== activeContestPath.value) return false
  if (!shouldShowSubmit(activeNode.value)) return false
  return !submitBlockedReason({
    node: activeNode.value,
    language: activeLanguage.value,
    capability: canSubmitCode.value,
    checking: extensionChecking.value,
  })
})
</script>

<style scoped>
/* 比赛名：抬头左侧那颗链接，长了截断 */
.cf-contest__name {
  overflow: hidden;
  color: var(--text);
  font-size: 12px;
  text-decoration: none;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cf-contest__name:hover {
  color: var(--accent);
}

/* ---------------- 模式开关（赛程 / 比赛） ---------------- */
/* 直角分段：两枚共用一条外框，中间只留一道竖线 —— 不是胶囊 */
.cf-contest__modes {
  display: inline-flex;
}

.cf-seg {
  height: 20px;
  padding: 0 10px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-faint);
  font-family: var(--ui-font);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  cursor: pointer;
}

.cf-seg + .cf-seg {
  border-left: none;
}

.cf-seg:hover {
  color: var(--text);
}

.cf-seg.is-on {
  background: var(--bg-control);
  color: var(--text);
}

/* ---------------- 子页签 + 动作 ---------------- */
.cf-contest__toolbar {
  justify-content: space-between;
  gap: 8px;
  padding: 0 6px;
}

.cf-contest__tabs {
  display: flex;
  gap: 2px;
}

.cf-contest__tab {
  height: 22px;
  padding: 0 8px;
  border: none;
  background: transparent;
  color: var(--text-faint);
  font-family: var(--ui-font);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  cursor: pointer;
}

.cf-contest__tab:hover {
  color: var(--text);
}

/* 选中态只加一条内阴影下划线：不占高度，切页签时整行不跳 */
.cf-contest__tab.is-on {
  box-shadow: inset 0 -2px 0 var(--accent);
  color: var(--text);
}

/* 提交：唯一一颗带强调色的动作，但保持直角按钮的形制 */
.cf-head-btn--accent {
  border-color: var(--accent);
  color: var(--accent);
}

.cf-contest__statusrow {
  min-height: 24px;
  padding: 0 6px;
}
</style>

<style scoped src="../styles/cf-console.css"></style>
