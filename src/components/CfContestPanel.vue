<template>
  <!-- 2026-10-27 起与抽题面板一起挂进合并后的 Codeforces 页签（CfCodeforcesPanel），
       自己不再占视图 id。2026-10-28 改版：赛程升到页头成为第三页，这里只剩
       这一场比赛的三个子页签（题目 / 排行榜 / 提交）；从赛程点一行 = 让页头切到「比赛」
       再调 openContest（见 defineExpose）。
       同日第二版：改「空状态 → 比赛名」两态。没载入时页面只剩一颗大输入框（像搜索引擎
       首页 —— 页签与列表此时全是无数据的空壳，收起来才干净）；载入成功后这颗盒子升到
       顶部变成比赛名（链去 CF）+ 铅笔，下方再展开页签与列表。
       版式与抽题页共用 src/styles/cf-console.css 的语汇（无框、留白、淡线、圆角控件）。
       data-native-focus：与抽题面板同一口径，点输入框 / 按钮时键盘该收掉。 -->
  <div class="cf-view" data-native-focus>
    <div
      class="cf-page"
      :class="{
        'cf-page--search': searching,
        'cf-page--fill': !searching && !!blankText,
        'cf-page--wide': !searching,
      }"
    >
      <!-- 抬头盒子：两种形态共用同一颗 DOM —— 移位靠 FLIP（见 morphHero），
           形态交替靠 Transition（旧的绝对定位淡出，不撑高）。 -->
      <div ref="heroEl" class="cf-hero" :class="{ 'cf-hero--search': searching }">
        <Transition name="cf-swap">
          <form
            v-if="searching"
            key="search"
            class="cf-search"
            @submit.prevent="submitSearch"
          >
            <input
              ref="searchInput"
              v-model="searchText"
              class="cf-input"
              type="text"
              spellcheck="false"
              autocapitalize="off"
              autocomplete="off"
              :placeholder="t('cf.contest.fields.linkPlaceholder')"
              :aria-label="t('cf.contest.fields.linkLabel')"
              :readonly="busy"
              @keydown.esc="cancelSearch"
            />
            <button type="submit" class="cf-search__go" :disabled="busy">
              <LoadingSpinner v-if="busy" :size="12" />
              <span>{{ t('cf.contest.action.load') }}</span>
            </button>
          </form>

          <!-- 比赛名 = 这一场在 CF 上的入口；铅笔把它换回输入框（再换一场 / 改 ID 重载） -->
          <div v-else key="title" ref="titlebarEl" class="cf-titlebar">
            <a
              ref="nameEl"
              :href="url"
              target="_blank"
              rel="noreferrer"
              class="cf-contest__name"
              :title="title"
            >
              {{ nameShown }}
              <!-- 度量片段（2026-11-13）：藏起来的全名，只用来问「这一句要占多宽」——
                   与名字条里还剩多少比一比，决定要不要换短名（见 syncNameFit）。
                   放进 <a> 里是为了跟着它继承字号 / 字重；绝对定位 + visibility: hidden，
                   不进版式、不进读屏、也选不中 -->
              <span ref="nameFullEl" class="cf-contest__name-probe" aria-hidden="true">{{ title }}</span>
            </a>
            <!-- VP 徽标带开始时刻（本机时区）：这一场的「开赛」是用户自己定的那一个，
                 与赛程里那一行右边的时间同一个来源 -->
            <span
              v-if="virtual"
              class="cf-contest__vp"
              :title="t('cf.contest.schedule.virtualHint', { time: vpStartText })"
            >
              {{ t('cf.contest.status.vpBadge', { time: vpStartText }) }}
            </span>
            <span v-if="kindLabel" class="cf-kind cf-mono">{{ kindLabel }}</span>
            <button
              type="button"
              class="cf-icon-btn"
              :title="t('cf.contest.action.edit')"
              :aria-label="t('cf.contest.action.edit')"
              @click="startSearch"
            >
              <AppIcon name="edit" :size="13" />
            </button>
            <span
              v-if="statusText && statusText !== blankText"
              class="cf-status cf-contest__status"
              :class="{
                'is-error': !!error,
                'is-countdown': !error && (status === 'upcoming' || status === 'running'),
              }"
            >
              <LoadingSpinner v-if="loadingContest || loadingProblems" :size="11" />
              <span class="cf-status__text">{{ statusText }}</span>
            </span>
          </div>
        </Transition>

        <!-- 空状态下没有第二个槽能说「为什么没载入」，错误就落在输入框下面一行 -->
        <p v-if="searching && error" class="cf-search__error">{{ statusText }}</p>
      </div>

      <!-- 页签与列表：只在载入之后出现。v-show 保住榜单 / 提交的取数进度与分页 ——
           铅笔里改个 ID 再回来，不必重取。 -->
      <div v-show="!searching" class="cf-contest__body">
        <!-- 子页签 + 本页动作。题目页只剩「全部导入」（抓样例那颗已封存，见下面那段说明） -->
        <nav class="cf-tabs">
          <div class="cf-tabs__list">
            <button
              v-for="item in TABS"
              :key="item"
              type="button"
              class="cf-tab"
              :class="{ 'is-on': tab === item }"
              :aria-pressed="tab === item"
              @click="selectTab(item)"
            >
              {{ tabLabel(item) }}
            </button>
          </div>
          <div class="cf-tabs__actions">
            <!-- VP 还没开始：题面不出现，全部导入也就没有可操作的题，整组动作收起 -->
            <template v-if="tab === 'problems' && !vpLocked">
              <!-- 「抓样例」那颗 2026-11-13 撤掉了（用户口径：整场抓样例先封存，要用时再加回来）。
                   撤它是为了让极窄宽度下这一格只放得下「全部导入」一颗 —— 两颗并排会溢出这条工具栏。
                   整场抓取的实现仍留在 useCfContest 里（见那边「封存」那一段），接回只需在这里补回一颗
                   `v-if="scrapeAvailable"` 的按钮 + 题目标签上方那行 `scrapeNote` 小字，
                   并从 useCfContest 一并取回 scrapeAvailable / scraping / scrapeSamples / scrapeNote。 -->
              <button
                type="button"
                class="cf-btn"
                :disabled="importingAll || !problems.length || allImported"
                @click="importAll"
              >
                <LoadingSpinner v-if="importingAll" :size="11" />
                <span>{{ importingAll ? t('cf.picker.result.importing') : t('cf.picker.result.importAll') }}</span>
              </button>
            </template>
            <!-- 刷新落在页签行右端：榜单与提交各自取数，动作统一收在这里。
                 2026-10-28 第二版：不再是「刷新」按钮 + 旁边一段刷新时间，而是一句
                 「刷新于 20 秒前」—— 只有「刷新」两个字可点，后面接着上次刷新的相对时刻。
                 题目是一次载入的结果，没有「刷新」可言，所以那一页不出现 -->
            <span v-if="refreshTarget" class="cf-tabs__refresh">
              <button
                type="button"
                class="cf-btn cf-btn--text"
                :disabled="refreshing"
                @click="refreshTarget.refresh()"
              >
                <LoadingSpinner v-if="refreshing" :size="11" />
                <span>
                  {{ refreshing ? t('cf.contest.action.refreshing') : t('cf.contest.action.refresh') }}
                </span>
              </button>
              <span v-if="!refreshing && refreshAge" class="cf-tabs__age">
                {{ t('cf.contest.action.refreshAt', { age: refreshAge }) }}
              </span>
            </span>
          </div>
        </nav>

        <template v-if="tab === 'problems'">
          <!-- 还没有题目、也没别的可看：这句话落在内容区居中偏上（黄金分割点），
               别让它在空页面上孤零零挂在右上角 -->
          <div v-if="blankText" class="cf-blank" role="status">
            <span class="cf-blank__hint">
              <LoadingSpinner :size="12" />
              <span>{{ blankText }}</span>
            </span>
          </div>

          <!-- 空态说明（还没开赛 / 这场没有题目列表）：只在这一块说，不占状态行 -->
          <p v-if="problemsNote" class="cf-note">{{ t(problemsNote.key) }}</p>

          <!-- 本场题目。比赛名已经升到页面顶部，这里不再重复一个链接；上面那条抓样例的进度
               小字随按钮一起撤了（2026-11-13 封存），恢复时连 `.cf-contest__scrape` 那条样式一起接 -->
          <section v-if="problems.length" class="cf-section">
            <ul class="cf-list">
              <li v-for="problem in problems" :key="`${problem.contestId}-${problem.index}`">
                <!-- 比赛页只要「题号 + 题名 + 导入」：知识点标签与难度是抽题时用来挑题的，
                     打比赛时用不上（2026-10-28 用户要求去掉）；「通过人数」那一列也撤了
                     （2026-11-13 用户口径：那格平时显示的就是一个破折号，白占宽度，
                     窄容器里还是从题名身上扣的），榜单看榜单页去，这里不重复一份快照 -->
                <!-- 导过之后整行空白处可点 = 打开这道题在工作区里的那份文件（2026-11-10 用户口径，
                     与抽题结果行同一套）。题名那颗 <a> 与导入按钮各自 .stop，落在行上的只有空白处 -->
                <div
                  class="cf-result cf-result--slim cf-list__row"
                  :class="{ 'is-openable': canOpen(problem) }"
                  :role="canOpen(problem) ? 'button' : null"
                  :tabindex="canOpen(problem) ? 0 : null"
                  :aria-label="canOpen(problem) ? t('cf.picker.result.openFile', { name: problem.name }) : null"
                  @click="openImported(problem)"
                  @keydown.enter.prevent="openImported(problem)"
                  @keydown.space.prevent="openImported(problem)"
                >
                  <span class="cf-result__title">
                    <span class="cf-result__id">{{ problem.contestId }}{{ problem.index }}</span>
                    <a
                      class="cf-result__name"
                      :href="problem.task.url"
                      target="_blank"
                      rel="noreferrer"
                      :title="problem.name"
                      @click.stop
                      @keydown.stop
                    >
                      {{ problem.name }}
                    </a>
                  </span>
                  <button
                    type="button"
                    class="cf-mini cf-result__import"
                    :class="{ 'is-done': importState(problem) === 'imported' }"
                    :disabled="importState(problem) !== 'import'"
                    @click.stop="importOne(problem)"
                    @keydown.stop
                  >
                    <LoadingSpinner v-if="importState(problem) === 'importing'" :size="10" />
                    <span>{{ t(`cf.picker.result.${importState(problem)}`) }}</span>
                  </button>
                </div>
              </li>
            </ul>
          </section>
        </template>

        <!-- 榜单与提交：各自带取数 / 轮询（见 useCfStandings / useCfSubmissions），
             不在这里重复管 loading。v-show 保状态，切回题目再回来不重取。 -->
        <CfStandingsTable
          ref="standingsEl"
          v-show="tab === 'standings'"
          :spec="spec"
          :active="props.active && !searching && tab === 'standings'"
          :live="live && !virtual"
          :vp="virtual"
          :locked="vpLocked"
        />
        <CfSubmissionList
          ref="submissionsEl"
          v-show="tab === 'submissions'"
          :spec="spec"
          :active="props.active && !searching && tab === 'submissions'"
          :live="live"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * CfContestPanel —— Codeforces 比赛面板。
 *
 * 【一条页签，三页】2026-10-28 起不再分「赛程 / 比赛」两层，赛程挪到合成页签的抬头
 * （见 CfCodeforcesPanel 的三个模式），这里只剩 题目 / 排行榜 / 提交。赛程里点一行 =
 * 由抬头转调这里的 openContest（expose 出去的）：填链接并载入这场，用户不必手工复制 ID。
 *
 * 【两态：空状态 → 比赛名】没载入时没有一栏是有数据的（题目 / 榜单 / 提交都空着），
 * 摆着页签只是干扰，所以整块收起来，只留一颗大输入框落在内容区黄金分割点。载入成功
 * 后这颗盒子升到顶部变成比赛名（链去 CF），下方再展开页签与列表。铅笔把名字换回输入框，
 * Esc 放弃改写、回到名字 —— 判据是 `loaded`（真的取到过一场），而不是「输入框还在不在」。
 *
 * 【input 为什么用本地 searchText 而不是直接绑 specText】spec 是子组件（榜单 / 提交）的
 * 取数依据，改到一半的 ID 不该去惊动它们；提交那一刻才写进 specText。
 *
 * 【状态在哪】题目 / 元数据 / 导入全在 useCfContest，**只在本组件的 setup 里调一次**
 * （与 useCfPicker 只归 CfPickerPanel 同一条纪律）。榜单与提交各自有组合式，归各自的
 * 子组件调 —— 它们只在被切到那一页时才取数（active 由这里给，空状态下也一律为 false）。
 *
 * 【版式】共享语汇在 src/styles/cf-console.css，这里只放比赛自己特有的规则（抬头两态、页签行）。
 *
 * 【2026-11-10：导入之后整行空白处可点】与抽题结果行同一套 —— 题名去 CF 网页、按钮管导入，
 * 空白处打开工作区里那份文件。判据同样是那颗按钮上的「已导入」（`canOpen`），所以刷新之后
 * `importedUrls` 空着时这些行点不开，与按钮重新写「导入」保持一致。
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

import AppIcon from './AppIcon.vue'
import CfStandingsTable from './CfStandingsTable.vue'
import CfSubmissionList from './CfSubmissionList.vue'
import LoadingSpinner from './LoadingSpinner.vue'
import { t } from '../i18n/index.js'
import { useCfContest } from '../composables/useCfContest.js'
import { compactContestName } from '../composables/useCfSchedule.js'

const emit = defineEmits(['nav'])

/**
 * 这一页露没露出来（来自合成页签的可见性，见 CfCodeforcesPanel）。本组件与它的子页都
 * 是常驻挂载的，只有 tab 这条不够 —— 整个页签没露出来时，赛程不该取列表、
 * 更不该让扩展去读报名状态。
 */
const props = defineProps({
  active: { type: Boolean, default: true },
})

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
  virtual,
  vpLocked,
  vpStartText,
  importOne,
  importAll,
  importAllAndOpenFirst,
  importState,
  openImported,
  importingAll,
  allImported,
} = useCfContest()

/** 赛程在本页之外（合成页签的抬头那一层），进来的第一页就是题目 */
const tab = ref('problems')

// ------------------------------------------------------------ 比赛名的长短两版

/**
 * 名字条放不下全名时换短名（2026-11-13 用户口径：区域不够时用压缩过的名字）。
 *
 * 短名就是赛程窄容器那一份 `compactContestName`（`Edu 196(Div. 2)` / `CF 1131(Div. 2)`），
 * 页签组名也在用它 —— 同一场比赛在三个地方缩写出来是同一句话。
 *
 * 【为什么不能照抄赛程的容器查询】赛程那一行是定宽网格，档位一换整行都跟着换，判据是
 * 「容器多宽」。名字条里还有状态胶囊、VP 徽标、铅笔、赛事类型徽标，它们都按**内容**定宽：
 * 同一条宽 600px 的条里，「Codeforces Round 1131 (Div. 2)」放得下，
 * 「Educational Codeforces Round 196 (Rated for Div. 2)」放不下 —— 档位判不出这一句放不放得下。
 *
 * 【怎么判】全名的自然宽度由那颗藏起来的度量片段（`.cf-contest__name-probe`）给出；
 * 名字能用的宽度 = 条宽 − 右侧那几颗的宽度 − gap。两个数都在同一个坐标系里量，
 * 比一比就知道要不要换。名字自己换成短名之后**不改变**这两个数（右侧那几颗不动），
 * 所以不会来回抖。
 */
const titlebarEl = ref(null)
const nameEl = ref(null)
const nameFullEl = ref(null)
/** 此刻是不是在用短名 */
const shortName = ref(false)

const compactTitle = computed(() => compactContestName(title.value))
const nameShown = computed(() => (shortName.value ? compactTitle.value : title.value))

let nameFitObserver = null

/**
 * 重算一次：全名要占多宽 vs 名字还剩多宽。
 *
 * 【读不到就跳过】面板被 v-show 藏着、或在两态之间换 DOM 的那一帧，`clientWidth` 是 0；
 * 这时候下的判断是「全都放不下」，会把名字误换成短名 —— 等 ResizeObserver 补这一次。
 */
function syncNameFit() {
  const bar = titlebarEl.value
  const name = nameEl.value
  const full = nameFullEl.value
  if (!bar || !name || !full) return
  const width = bar.clientWidth
  if (!width) return
  let rest = 0
  for (const child of bar.children) {
    if (child !== name) rest += child.getBoundingClientRect().width
  }
  // 条里每两颗之间 4px（.cf-titlebar 的 gap）；VP 徽标与类型徽标各有 2px margin-left，
  // 一起从名字的余地里扣掉 —— 宁可早一格换短名，也不要把全名挤成省略号
  const gaps = 4 * Math.max(0, bar.children.length - 1) + 4
  shortName.value = full.getBoundingClientRect().width > width - rest - gaps
}

/**
 * 名字条一出现 / 换一场 / 状态胶囊来去，就挂上新的观察者。
 *
 * 【为什么盯着条里的每一颗，而不只盯整条】条宽不变、但状态胶囊变宽（「59 分钟」跳到
 * 「1 小时 0 分钟」）时，名字是被挤窄的那一方，整条却一动不动 —— 只盯整条会漏掉这一次。
 * 名字自己也在被观察之列：它被挤窄 / 放松时同样会触发一次重算。
 * 【为什么状态胶囊的「在不在」也算依赖】v-if 后挂上是布局级的变化，条宽不变，
 * 不重挂观察者就会漏掉它。
 */
watch(
  () => [titlebarEl.value, title.value, !!statusText.value],
  () => {
    nameFitObserver?.disconnect()
    nameFitObserver = null
    const bar = titlebarEl.value
    if (!bar) return
    syncNameFit()
    if (typeof ResizeObserver === 'undefined') return
    nameFitObserver = new ResizeObserver(() => syncNameFit())
    nameFitObserver.observe(bar)
    for (const child of bar.children) nameFitObserver.observe(child)
  },
  { flush: 'post' },
)

onBeforeUnmount(() => {
  nameFitObserver?.disconnect()
  nameFitObserver = null
})

/** 赛事类型徽标：只有 gym / group 会挂（从链接解析出来；普通比赛与空态都不显示） */
const kindLabel = computed(() =>
  // 普通比赛不挂这枚徽标（2026-11-01 用户口径「去掉比赛界面里的 CONTEST 字样」）：
  // 能走到这一页的绝大多数就是 /contest/，「CONTEST」既没信息量又占着比赛名的位置。
  // GYM / GROUP 留着 —— 那两个才是在说「这不是一场普通比赛」
  spec.value?.kind && spec.value.kind !== 'contest' ? spec.value.kind.toUpperCase() : '',
)

/** 空状态：打开面板永远从这里开始（比赛不自动载入，从赛程点进来的那一条会立刻载入） */
const searching = ref(true)
/** 输入框自己的那一份：改到一半不会打扰已载入的那场（见文件头） */
const searchText = ref(specText.value)
/** 真的取到过一场 —— 铅笔换回来的输入框要能用 Esc 退回名字，靠的就是这一条 */
const loaded = ref(false)
/** 上一次载入成功写下的那一串：Esc 退回名字时把 specText 还原成它，url / 榜单都跟着它走 */
const loadedText = ref('')
/**
 * 上一次提交失败留下的现场（Esc 退回名字时按它收拾干净）：错误要清掉；
 * 若解析得出的 ID 已经把面板里这场清空了，specText 还原之后还得重新取一次。
 */
let failedSearch = null

/**
 * 「现在这一屏是谁要的」代次。载入中的 submitSearch 与历史恢复（restoreNav）共用它：
 * 恢复一旦开始，早先那次点「载入」回来的收尾就作废（别再翻成比赛名），反之亦然 ——
 * 连点后退 / 前进时屏幕上留下的必须是最后那一下。
 */
let viewSeq = 0

const heroEl = ref(null)
const searchInput = ref(null)

/**
 * 页面还空着时，「正在获取题目列表…」落在内容区的黄金分割点（见 .cf-blank）：
 * 此时页面本身没有别的东西可看，那句话挂在右上角会像页面坏了。
 * 空状态由大输入框自己说话，页面上没有这段空白，所以直接返回空串。
 */
const blankText = computed(() => {
  if (searching.value || tab.value !== 'problems') return ''
  if (error.value || problems.value.length || problemsNote.value) return ''
  if (loadingProblems.value) return t('cf.contest.status.problems')
  return ''
})

const live = computed(() => status.value === 'running')

/** 榜单 / 提交把刷新动作与 loading 露出来（defineExpose），按钮统一在页签行右端 */
const standingsEl = ref(null)
const submissionsEl = ref(null)

/**
 * 这一页此刻能刷新的那个子组件（null = 按钮不出现）。
 * 题目是一次载入的结果，重取等于换一场，所以那一页没有「刷新」。
 */
const refreshTarget = computed(() => {
  if (searching.value) return null
  if (tab.value === 'standings') return standingsEl.value
  if (tab.value === 'submissions') return submissionsEl.value
  return null
})

const refreshing = computed(() => !!refreshTarget.value?.loading)

/**
 * 「刷新于 20 秒前」的后半句。
 *
 * 【为什么在面板这层算】刷新动作与时间现在合成一句话，挂在页签行右端；两个子页各自
 * 只把 `fetchedAt` 露出来（defineExpose），时间怎么读由这里统一算 —— 两边口径一致，
 * 也只有一个每秒的定时器。
 *
 * 【一分钟以上不带秒】1 分 20 秒读作「1 分钟」；一小时以上带上零头分钟，
 * 让人知道是刚过一小时还是快两小时了（与赛程 / 榜单此前的口径一致）。
 */
const refreshedAt = computed(() => refreshTarget.value?.fetchedAt || 0)

const now = ref(Date.now())
let ageTimer = 0

function stopAgeTick() {
  window.clearInterval(ageTimer)
  ageTimer = 0
}

/** 只有「刷新」这一页露出来时才有必要每秒重算相对时刻 */
const refreshLineVisible = computed(
  () =>
    props.active &&
    !searching.value &&
    (tab.value === 'standings' || tab.value === 'submissions'),
)

watch(
  refreshLineVisible,
  (visible) => {
    stopAgeTick()
    if (!visible) return
    now.value = Date.now()
    ageTimer = window.setInterval(() => {
      now.value = Date.now()
    }, 1000)
  },
  { immediate: true },
)

onBeforeUnmount(stopAgeTick)

const refreshAge = computed(() => {
  const at = refreshedAt.value
  if (!at) return ''
  const seconds = Math.max(0, Math.floor((now.value - at) / 1000))

  if (seconds < 60) {
    return t('cf.contest.action.refreshAge.seconds', { n: seconds })
  }

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    return t('cf.contest.action.refreshAge.minutes', { n: minutes })
  }

  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest
    ? t('cf.contest.action.refreshAge.hoursMinutes', { h: hours, m: rest })
    : t('cf.contest.action.refreshAge.hours', { n: hours })
})

function tabLabel(item) {
  return t(`cf.contest.tabs.${item}`)
}

/**
 * 这一行此刻能不能点开（导过才有文件可开）。判据与那颗导入按钮上写着的「已导入」同源
 * （`importState`），模板里问四处（class / role / tabindex / aria-label），所以收成一个函数。
 *
 * 【已知的边界】`importedUrls` 是**这一场、这一次**的记账：刷新之后它空着，按钮会重新
 * 写「导入」（与改版前一致），于是这些行的空白处也点不开 —— 宁可少给一个入口，
 * 也不要让一行写着「导入」的字点出别的反应。
 */
function canOpen(problem) {
  return importState(problem) === 'imported'
}

/** 点子页签 = 换一屏（记进后退 / 前进的历史）。空状态下页签是藏着的，碰不到。 */
function selectTab(item) {
  if (tab.value === item) return
  tab.value = item
  if (!searching.value) emit('nav')
}

// ------------------------------------------------------------ 两态之间

let morphTimer = 0

/**
 * 抬头盒子从旧位置滑到新位置（FLIP）：换 DOM 之前量一次，换完再量一次，
 * 先用一段反向 transform 把它按回原处，再在下一帧抹平 —— 输入框「升到顶部」就是这一段。
 * 位置没变（已经有名字、只是换了一场）时什么都不做。
 */
async function morphHero(swap) {
  const el = heroEl.value
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const from = el && !reduce ? el.getBoundingClientRect().top : null
  swap()
  await nextTick()
  if (!el || from === null) return

  const dy = from - el.getBoundingClientRect().top
  if (Math.abs(dy) < 1) return

  el.style.transition = 'none'
  el.style.transform = `translateY(${dy}px)`
  void el.offsetHeight
  el.style.transition = 'transform 0.28s cubic-bezier(0.22, 0.72, 0.2, 1)'
  el.style.transform = 'translateY(0)'

  const clear = () => {
    window.clearTimeout(morphTimer)
    el.removeEventListener('transitionend', onEnd)
    el.style.transition = ''
    el.style.transform = ''
  }
  const onEnd = (event) => {
    if (event.target === el && event.propertyName === 'transform') clear()
  }
  el.addEventListener('transitionend', onEnd)
  morphTimer = window.setTimeout(clear, 420)
}

/** 空状态那颗「载入」：取到这一场才升到顶部换名字，失败了就留在输入框下面说原因 */
async function submitSearch() {
  if (busy.value) return

  const text = searchText.value.trim()
  if (!text) {
    error.value = { key: 'cf.contest.errors.badLink' }
    return
  }

  const seq = ++viewSeq
  searchText.value = text
  specText.value = text
  await load()
  if (seq !== viewSeq) return
  if (error.value) {
    // 解析得出的 ID 在 load() 里已经把面板清空了，退回时得重新取；解析不出的则什么都没动
    failedSearch = { cleared: Boolean(spec.value) }
    return
  }

  loadedText.value = text
  loaded.value = true
  failedSearch = null
  await morphHero(() => {
    searching.value = false
  })
  emit('nav')
}

/** 铅笔：名字换回输入框，盒子落回页面中央，焦点直接交给输入框（全选，便于整个换掉） */
async function startSearch() {
  searchText.value = specText.value
  await morphHero(() => {
    searching.value = true
  })
  searchInput.value?.focus()
  searchInput.value?.select()
}

/** Esc：放弃这次改写，退回刚才那场的名字（从没载入过就无处可退） */
async function cancelSearch() {
  if (!loaded.value || busy.value) return
  searchText.value = loadedText.value
  specText.value = loadedText.value
  if (failedSearch) {
    error.value = null
    if (failedSearch.cleared) void load()
    failedSearch = null
  }
  await morphHero(() => {
    searching.value = false
  })
}

/**
 * 点赛程里的一行（或 T-10 通知的「开始比赛」）：填链接、切到题目页、载入这场。
 * 赛程在合成页签那一层，所以由 CfCodeforcesPanel 转调（见那边 defineExpose）。
 * 已经有一场的名字挂在页头时不再闪回输入框 —— 载入成功那条路本来就不换布局。
 *
 * 【autoStart（2026-10-30）】通知点「开始」的那一趟除了载入还要整场导入并打开第一题。
 * 题目列表是 load() 里 `void loadProblems()` 的**异步后手**，所以这里等它落定再动：
 * 列表空着（开赛前 / 这场没有题）就停在比赛页 —— 空态说明就在屏幕上，不是故障。
 * 载入失败同样只停在比赛页：错误行本来就在那里，不另发通知。
 */
async function openContest(contest, options = {}) {
  if (!contest?.id) return
  searchText.value = String(contest.id)
  tab.value = 'problems'
  if (!options.autoStart) {
    void submitSearch()
    return
  }

  await submitSearch()
  if (error.value) return

  // 题目列表落定（在途就等它回来；早收工就立刻过）
  if (loadingProblems.value) {
    await new Promise((resolve) => {
      const stop = watch(loadingProblems, (busy) => {
        if (!busy) {
          stop()
          resolve()
        }
      })
    })
  }
  if (error.value || !problems.value.length) return
  await importAllAndOpenFirst()
}

// ------------------------------------------------------------ 后退 / 前进
/**
 * 这一屏的导航快照（历史归 CfCodeforcesPanel，见那边的 navHistory）：text 为空 =
 * 还停在空状态的大输入框；非空 = 已载入的那一场。子页签随快照一起走。
 */
function navState() {
  return {
    text: searching.value ? '' : loadedText.value,
    tab: tab.value,
  }
}

/**
 * 把面板摆回某个快照。与 submitSearch 分开写：恢复不该带回「点载入」的焦点与失败处理，
 * 也不能走 submitSearch 的 busy 早退 —— 连点后退时后一次必须能立刻接管。
 * 两次恢复叠在一起时，前一次的收尾按 viewSeq 作废；数据侧另有 useCfContest 的代次兜底。
 */
async function restoreNav(state) {
  const seq = ++viewSeq
  const text = String(state?.text || '')
  const nextTab = TABS.includes(state?.tab) ? state.tab : 'problems'

  if (!text) {
    tab.value = nextTab
    error.value = null
    failedSearch = null
    if (searching.value) return
    searchText.value = loadedText.value
    await morphHero(() => {
      searching.value = true
    })
    return
  }

  // 已经挂着这一场：只换子页签（必要时把输入框收回去），不重取
  if (loaded.value && text === loadedText.value) {
    tab.value = nextTab
    if (!searching.value) return
    searchText.value = text
    await morphHero(() => {
      searching.value = false
    })
    return
  }

  // 换一场：先落到输入框态再取数（载入中途看起来与点「载入」一样是取数中）
  searchText.value = text
  specText.value = text
  tab.value = nextTab
  searching.value = true
  error.value = null
  failedSearch = null
  await load()
  if (seq !== viewSeq || error.value) return

  loadedText.value = text
  loaded.value = true
  await morphHero(() => {
    searching.value = false
  })
}

defineExpose({ openContest, navState, restoreNav })
</script>

<style scoped>
/* ---------------- 抬头：比赛名 ---------------- */
/* 空状态那颗「输入比赛 ID / 链接」的盒子（落位、两态过渡、卡片 / 输入框 / 载入按钮 / 错误行）
   单独放在 styles/cf-contest-search.css —— 那部分独立成块，改样式只动那一个文件。 */

/* 名字条：比赛名（链去 CF）+ 铅笔 + 这一场的状态 */
.cf-titlebar {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 32px;
  margin-bottom: 6px;
}

/* 赛事类型徽标：只剩 GYM / GROUP（CONTEST 2026-11-01 起不显示，见 kindLabel）——
   纯等宽小字，不铺底，别抢比赛名的视线 */
.cf-kind {
  flex: 0 0 auto;
  margin-left: 2px;
  color: var(--text-faint);
  font-size: 9.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
}

.cf-contest__name {
  position: relative;
  min-width: 0;
  overflow: hidden;
  color: var(--text);
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 度量片段：藏起来的全名，只给 syncNameFit 量自然宽度（见那边关于「为什么不用容器查询」）。
   绝对定位让它不参与这条的版式，visibility: hidden 让它不可见、不可选中、也不进读屏；
   它在 <a> 里，字号字重跟着名字走 —— 量出来的正是名字写全时要占的地方 */
.cf-contest__name-probe {
  position: absolute;
  top: 0;
  left: 0;
  visibility: hidden;
  white-space: nowrap;
  pointer-events: none;
}

/* VP 徽标：名字后面一小串「VP · 11-03 01:55」。等宽 + 主色，紧贴名字 ——
   它与状态胶囊都在说时间，一个说「几点开始」，一个说「还有多久」 */
.cf-contest__vp {
  flex: 0 0 auto;
  margin-left: 2px;
  color: var(--accent-text);
  font-family: var(--mono-font);
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

:where(html.is-hoverable) .cf-contest__name:hover {
  color: var(--accent-text);
}

/* 状态胶囊不许被长标题挤扁（挤出来会只剩「已…」）；要收就收名字，它有省略号 */
.cf-contest__status {
  flex: 0 0 auto;
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}

/* 倒计时（距开始 / 已开赛）的整句走等宽：秒数每跳一次，句子宽度不跟着抖。
   只在计时态挂上 —— 错误与「已结束」仍是正文字体，那颗等宽的字面不该用来读中文。
   与赛程右端的倒计时列（.cf-schedule__clock）同一套口径。 */
.cf-contest__status.is-countdown {
  font-family: var(--mono-font);
}

/* 页签与列表整块：名字条出来之后淡入并轻轻上浮，接住抬头那段移位 */
.cf-contest__body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  animation: cf-body-in 0.22s ease-out 0.04s both;
}

@keyframes cf-body-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
}

/* ---------------- 页签行 ---------------- */
/* 页签行：放到极窄时换行，别把三颗页签压成一团叠字（按钮本身不许被压） */
.cf-tabs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 28px;
  margin-bottom: 6px;
}

.cf-tabs__list {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  min-width: 0;
}

.cf-tabs__list .cf-tab {
  flex: 0 0 auto;
}

.cf-tabs__actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
}

/* 「刷新于 20 秒前」是一句话：按钮只占「刷新」两个字，后面紧跟相对时刻。
   按钮的内边距收掉，字距由 gap 给 —— 中英文都不会粘成一块。 */
.cf-tabs__refresh {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  min-width: 0;
}

.cf-tabs__refresh .cf-btn {
  height: 28px;
  padding: 0 2px;
}

.cf-tabs__age {
  color: var(--text-faint);
  /* 这个数每秒都在长：等宽 + 定宽字位，20 秒 → 19 秒时字串宽度不抖 */
  font-family: var(--mono-font);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* 提交：唯一带主色文字的动作，但仍是无面的次级按钮（低透明度面只在悬停时出现） */
.cf-btn--accent {
  color: var(--accent-text);
}

:where(html.is-hoverable) .cf-btn--accent:hover:not(:disabled) {
  background: var(--accent-face);
  color: var(--accent-text);
}
</style>

<style scoped src="../styles/cf-console.css"></style>

<!-- 空状态那颗「输入比赛 ID / 链接」的盒子：独立成块，样式全在 styles/cf-contest-search.css。
     放在最后一块 = 同特异性时以它为准（见该文件头部说明）。 -->
<style scoped src="../styles/cf-contest-search.css"></style>
