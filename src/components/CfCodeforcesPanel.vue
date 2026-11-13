<template>
  <!-- 合并后的 Codeforces 组件（2026-10-27）：抽题、赛程、比赛塞进同一个合成页签。
       三个子面板各自是 absolute 铺满的 .cf-view，所以这里给它们一个 position: relative
       的 stage。抬头只有一条：品牌 /「抽题 / 赛程 / 比赛」/ 账号胶囊
       （比赛内部的子页签归 CfContestPanel）。
       2026-10-29 改版：抬头从「左品牌 + 右分段」改成三栏 —— 左品牌、中模式、右账号胶囊，
       myHandle 在三个模式下都看得见，不用回到抽题页去确认。
       2026-10-29 第二版：去掉品牌旁的状态点与右端的能力指示点（用户要求），抬头不再挂指示灯。 -->
  <div class="cf-codeforces" data-native-focus>
    <header class="cf-codeforces__bar">
      <span class="cf-codeforces__lead">
        <span class="cf-codeforces__brand">
          <AppIcon name="codeforces" :size="14" />
          <span class="cf-codeforces__title">{{ t('cf.view.title') }}</span>
        </span>

        <span class="cf-nav">
          <button
            type="button"
            class="cf-nav__btn"
            :disabled="!canBack"
            :title="t('cf.view.nav.back')"
            :aria-label="t('cf.view.nav.back')"
            @click="goBack"
          >
            <AppIcon name="chevron-left" :size="18" />
          </button>
          <button
            type="button"
            class="cf-nav__btn"
            :disabled="!canForward"
            :title="t('cf.view.nav.forward')"
            :aria-label="t('cf.view.nav.forward')"
            @click="goForward"
          >
            <AppIcon name="chevron-right" :size="18" />
          </button>
        </span>
      </span>

      <span class="cf-codeforces__modes">
        <button
          v-for="item in MODES"
          :key="item"
          type="button"
          class="cf-tab"
          :class="{ 'is-on': mode === item }"
          :aria-pressed="mode === item"
          @click="selectMode(item)"
        >
          {{ t(`cf.view.mode.${item}`) }}
          <span v-if="item === 'schedule' && cfRunningCount" class="cf-live-badge">
            {{ t('cf.view.live') }}
          </span>
        </button>
      </span>

      <span class="cf-codeforces__aside">
        <div ref="handleWrap" class="cf-handle">
          <button
            type="button"
            class="cf-handle__btn"
            :aria-expanded="handleOpen"
            aria-haspopup="dialog"
            :title="t('cf.view.handle.label')"
            @click="toggleHandle"
          >
            <AppIcon name="user" :size="14" class="cf-handle__icon" />
            <span class="cf-handle__text">
              <template v-if="handleList.length">
                <span class="cf-handle__name" :class="rankClass">{{ handleList[0] }}</span>
                <span v-if="handleList.length > 1" class="cf-handle__extra">
                  +{{ handleList.length - 1 }}
                </span>
              </template>
              <template v-else>{{ t('cf.view.handle.empty') }}</template>
            </span>
            <AppIcon name="chevron" :size="11" class="cf-handle__chevron" />
          </button>

          <div
            v-if="handleOpen"
            class="cf-handle__panel"
            role="dialog"
            :aria-label="t('cf.view.handle.label')"
          >
            <span class="cf-handle__label">{{ t('cf.view.handle.label') }}</span>
            <input
              ref="handleInput"
              v-model="handleDraft"
              class="cf-input"
              type="text"
              autocomplete="off"
              spellcheck="false"
              :placeholder="t('cf.view.handle.placeholder')"
              @keydown.enter="submitHandleOnEnter"
              @keydown.esc.prevent="cancelHandle"
            />
            <p class="cf-handle__hint">{{ t('cf.view.handle.hint') }}</p>
          </div>
        </div>
      </span>
    </header>

    <!-- 取景框 + 单层轨道（2026-11-13）：三页并排，左右滑动切页（见 useSwipeTrack）。
         这里不再用 v-show 开关 —— 旁边的页必须**常驻渲染**，否则「从不可见变可见」那一帧
         没有过渡可跑，短促的快甩松手时会闪一下（设置页 2026-11-08 踩过）。不显示的那两页
         由 aria-hidden + inert 挡在读屏与键盘焦点之外，横向由取景框裁掉。 -->
    <div ref="stageEl" class="cf-codeforces__stage">
      <div ref="trackEl" class="cf-codeforces__track">
        <div class="cf-pane" v-bind="paneAttrs('picker')">
          <CfPickerPanel />
        </div>
        <div class="cf-pane" v-bind="paneAttrs('schedule')">
          <div class="cf-view">
            <!-- --fill：赛程在空列表时要把「获取中」放到内容区的黄金分割点（见 cf-console.css） -->
            <div class="cf-page cf-page--fill">
              <CfContestSchedule
                :active="props.active && mode === 'schedule'"
                @select="openContest"
              />
            </div>
          </div>
        </div>
        <div class="cf-pane" v-bind="paneAttrs('contest')">
          <CfContestPanel
            ref="contestPanel"
            :active="props.active && mode === 'contest'"
            @nav="onContestNav"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

import AppIcon from './AppIcon.vue'
import CfContestPanel from './CfContestPanel.vue'
import CfContestSchedule from './CfContestSchedule.vue'
import CfPickerPanel from './CfPickerPanel.vue'
import { applyCanonicalHandles, cfHandle, myHandles } from '../cf/myHandle.js'
import { cfRankOf } from '../cf/rank.js'
import { cfRunningCount } from '../composables/useCfSchedule.js'
import { useSwipeTrack } from '../composables/useSwipeTrack.js'
import { t } from '../i18n/index.js'
import { addBackFallback } from '../services/backStack.js'
import { cfCheckHandles } from '../services/cfClient.js'
import { startRequest } from '../services/cfStartReminder.js'
import { openCodeforcesTab } from '../services/editorViews.js'

/**
 * 这一整页（合成页签）此刻露没露出来。子面板是常驻挂载的，只在模板里 v-show 它们
 * 看不见这件事 —— 没有这个 prop，赛程会在整页启动时就取数（报名状态还会让扩展开一个 CF 页）。
 */
const props = defineProps({
  active: { type: Boolean, default: true },
})

const MODES = ['picker', 'schedule', 'contest']

/** 打开时先落在抽题（赛程与比赛都从抬头进） */
const mode = ref('picker')

const contestPanel = ref(null)

/* ---------------- 触屏横滑切页 ---------------- */
/**
 * 取景框与轨道（2026-11-13）。三页是并排的三列，翻页 = 整排平移；手势本体在
 * `composables/useSwipeTrack.js`（阈值、阻尼、甩、接管、吞 click 都在那儿）。
 *
 * 只认触摸：桌面鼠标拖拽不翻页 —— 与设置页一致。起手落在输入框 / 横滚容器里就不接管
 * （榜单要横滚、文本框里横拉是选字）。
 */
const stageEl = ref(null)
const trackEl = ref(null)

const swipe = useSwipeTrack({
  viewport: stageEl,
  track: trackEl,
  index: () => MODES.indexOf(mode.value),
  count: () => MODES.length,
  // 抬手判出翻页：照常走 selectMode —— 历史记录那一步要一起记上，后退键才会亮
  onSwipe: (next) => selectMode(MODES[next]),
  // 整个 CF 页签被外层 v-show 收起时取景框宽度是 0，手势不该启动
  enabled: () => props.active,
  ignore: ['.cf-tabs'],
})

/** 上一屏的下标：非手势切页时靠它判「相邻」还是「跨页」 */
let shownIndex = MODES.indexOf(mode.value)

/**
 * 非当前页的挂载属性：读屏与焦点都要挡在门外 —— 它们是**真渲染**的节点，只是被推到
 * 取景框外裁掉了。当前页上这两个属性都得没有，所以给 `{}` 而不是 `false`
 * （`inert="false"` 照样是 inert）。
 */
function paneAttrs(item) {
  return mode.value === item ? {} : { 'aria-hidden': 'true', inert: '' }
}

/* ---------------- 后退 / 前进 ---------------- */
/**
 * 历史只记**本页内部**的界面切换（2026-10-29 用户口径）：切模式、切比赛子页签、
 * 换一场比赛各算一步；退出到代码 / 设置页不在其中。
 *
 * 页内能变的只有两样：抬头的 mode，与比赛面板的「哪一场 + 哪个子页签」。
 * 后者归 CfContestPanel 自己管，所以由它 expose 出 navState（读）与 restoreNav（写回）。
 *
 * 指针前的条目是走过的，指针后的在**下一次切换时丢弃** —— 与浏览器一致。
 * 抽题 / 赛程没有可回退的内部页面，它们只记 mode 本身。
 */
const EMPTY_CONTEST = { text: '', tab: 'problems' }

const navHistory = ref([{ mode: 'picker', contest: EMPTY_CONTEST }])
const pointer = ref(0)

const canBack = computed(() => pointer.value > 0)
const canForward = computed(() => pointer.value < navHistory.value.length - 1)

function snapshot() {
  return { mode: mode.value, contest: contestPanel.value?.navState() ?? EMPTY_CONTEST }
}

/** 两屏是不是同一屏：抽题 / 赛程只比 mode；比赛还要比是哪一场、哪个子页签 */
function sameScreen(a, b) {
  if (!a || a.mode !== b.mode) return false
  if (a.mode !== 'contest') return true
  return a.contest.text === b.contest.text && a.contest.tab === b.contest.tab
}

function record() {
  const entry = snapshot()
  if (sameScreen(navHistory.value[pointer.value], entry)) return
  navHistory.value.splice(pointer.value + 1)
  navHistory.value.push(entry)
  pointer.value = navHistory.value.length - 1
}

function selectMode(item) {
  if (mode.value === item) return
  mode.value = item
  record()
}

/**
 * 切屏之后把整排对过去（2026-11-13）。三种入口都走这里：点页头页签、赛程里点一行
 * （`openContest` 直接改 mode）、前进后退（`applyEntry`）。
 *
 * 手势那一路由 `onTouchEnd` 自己写位移，这里看到 `isBusy()` 就让路 —— 不然同一趟会收到
 * 两条不同的时长。跨页（抽题 ↔ 比赛）给瞬切：中间那页一闪而过反而像卡了一下，
 * 这条与设置页「跨页点选时长给 0」同一个口径。
 */
watch(mode, (value) => {
  const next = MODES.indexOf(value)
  const step = Math.abs(next - shownIndex)
  shownIndex = next
  if (swipe.isBusy()) return
  swipe.followIndex(step <= 1)
})

/** 赛程里点一行（或 T-10 提醒的「开始比赛」，见下面 startRequest 的 watch）：把这场交给
 *  比赛面板（它自己填链接、切到题目页、取数），再翻到比赛。options 原样透传（autoStart）。
 *  这里**不**立刻记历史：载入成功后比赛面板会发 nav，那一下才是一步 —— 失败或中途
 *  退走都不该留下一个「比赛」空壳条目。 */
function openContest(contest, options = {}) {
  if (!contest?.id) return
  mode.value = 'contest'
  contestPanel.value?.openContest(contest, options)
}

/**
 * T-10 提醒通知的「开始比赛」（2026-10-30）：用户可能在任何页签上点它 —— 先把
 * Codeforces 页签亮出来（openCodeforcesTab 内部与设置互斥），再走与点赛程行同一条
 * openContest 路，autoStart 让比赛面板接着整场导入、打开第一题（见 CfContestPanel）。
 *
 * startRequest 是服务层的中转站（cfStartReminder）：通知的按钮回调活得比组件的
 * 局部作用域久，只能经它转交。消费完立刻置回空串 —— 这是「一次点击只开一场」的闸门，
 * 不是双向同步，所以不等价于 watch 的什么 flush 口径，id 为空串时直接让过。
 */
watch(startRequest, (id) => {
  if (!id) return
  startRequest.value = ''
  openCodeforcesTab()
  openContest({ id }, { autoStart: true })
}, { immediate: true })

/** 比赛面板里用户真的换了一屏（换一场 / 切子页签）。不在比赛模式（比如载入中途
 *  已经退到赛程）就不记 —— 那一屏已经不在眼前了。 */
function onContestNav() {
  if (mode.value !== 'contest') return
  record()
}

/** 把某一屏摆回来。比赛屏由子面板异步取数，这里不等它 —— 指针已经落位，
 *  连点靠子面板自己的代次作废旧的那一趟。 */
function applyEntry(entry) {
  mode.value = entry.mode
  if (entry.mode === 'contest') void contestPanel.value?.restoreNav(entry.contest)
}

function goBack() {
  if (!canBack.value) return
  pointer.value -= 1
  applyEntry(navHistory.value[pointer.value])
}

function goForward() {
  if (!canForward.value) return
  pointer.value += 1
  applyEntry(navHistory.value[pointer.value])
}

/**
 * 装成 app 时的**系统返回** = 页内后退（2026-10-30）。
 *
 * 走**兜底层**而不是栈层：`pointer` 退一格之后往往还能再退，这不是「开 / 关型状态」，
 * 塞进栈里一次就没了（见 `services/backStack.js` 文件头）。它只在栈空时轮到、可反复消费。
 *
 * 判据必须带 `props.active`：本组件是**常驻挂载**的（`v-show` 保状态），没露出来时
 * 不能抢返回 —— 否则在代码页按返回会莫名其妙地翻 CF 的内部页面。
 */
const stopBackNav = addBackFallback(() => {
  if (!props.active || !canBack.value) return false
  goBack()
  return true
})

onBeforeUnmount(() => {
  stopBackNav()
  document.removeEventListener('mousedown', onDocPointer)
})

/* ---------------- 右侧账号胶囊 ---------------- */
const handleWrap = ref(null)
const handleInput = ref(null)
const handleOpen = ref(false)
const handleDraft = ref('')

const handleList = computed(() => myHandles())

/**
 * 名字的 CF 段位色（2026-10-29 用户口径：按分数上色 + 加粗）。
 *
 * rating 走 Worker 的 user.info —— 与抽题前「校验账号」**同一个请求、同一份 1h 缓存**
 * （见 cfWorker 的 verifyHandle），不必为配色再开一条接口。只问第一个账号：胶囊本来
 * 也只显示第一个，其余收在 +N 里。
 *
 * 只在整页可见时才问（props.active）：页签挂在后台时不白花一次配额。换账号的瞬间
 * 先把旧结论清掉，别让新名字挂着上一位的段位色；同一位账号切走再切回来则直接复用。
 */
const handleInfo = ref(null)
let rankSeq = 0

/** 有效账号才有段位色；未定级（没有 rating）按 CF 站上的口径画成 newbie 灰 */
const rankClass = computed(() => {
  const info = handleInfo.value
  if (!info?.valid) return ''
  return `is-ranked cf-rank--${cfRankOf(info.rating) ?? 'newbie'}`
})

watch(
  [() => handleList.value[0] || '', () => props.active],
  async ([handle, active]) => {
    const seq = ++rankSeq
    const key = handle.toLowerCase()

    if (!key) {
      handleInfo.value = null
      return
    }
    if (handleInfo.value?.handle === key) return

    handleInfo.value = null
    if (!active) return

    try {
      const { results } = await cfCheckHandles([handle])
      if (seq !== rankSeq) return
      const found = (results || []).find(
        (item) => String(item.handle || '').toLowerCase() === key,
      )
      // 「连不上」不落结论：Worker 不缓存网络失败，留着 null 让下次露出来时再问一次
      handleInfo.value =
        found && found.reason !== 'network'
          ? { handle: key, valid: found.valid === true, rating: found.rating ?? null }
          : null
      // 校验确认存在就顺手把存下来的写法改成 CF 的官方那份（老值 / 随手填的大小写都能纠正）
      if (found?.valid) applyCanonicalHandles(results)
    } catch {
      // 连不上 / Worker 出错就保持普通样式：段位色是锦上添花，不该把这件事报成故障
      if (seq === rankSeq) handleInfo.value = null
    }
  },
  { immediate: true },
)

function toggleHandle() {
  if (handleOpen.value) closeHandle()
  else handleOpen.value = true
}

/** 失焦 / 点空白处 / Enter 都落盘：三个页面共用这份值，不适合「不点保存就丢」 */
function closeHandle() {
  if (!handleOpen.value) return
  const handle = String(handleDraft.value || '').trim()
  cfHandle.value = handle
  handleOpen.value = false
  // 落盘之后回头校验一次：填的时候不必管大小写，确认存在的账号换成 CF 的官方写法
  // （见 applyCanonicalHandles）。空串 = 用户清空了账号，没什么可校验的。
  if (handle) void canonicalizeHandles()
}

/**
 * 绑定后的回写：校验整组账号，把存在的那几个改成 CF 的官方大小写。
 * 连不上 / 不存在就保持用户写的 —— 没有官方名字可换，下次校验成功再改。
 */
async function canonicalizeHandles() {
  const handles = myHandles()
  if (!handles.length) return
  try {
    const { results } = await cfCheckHandles(handles)
    applyCanonicalHandles(results)
  } catch {
    /* Worker 不可用：校验都做不了，当然也就没有「官方写法」可写 */
  }
}

/** Esc 只收起，不写回 */
function cancelHandle() {
  handleOpen.value = false
}

/**
 * 输入框里的回车 = 收起并落盘。中文输入法里「回车」常常是「确认候选词」而不是「确认」，
 * 组字期间敲下去会把弹层当场收起、草稿落进 cfHandle —— 和全局快捷键同一条规矩
 * （见 App.vue 的 onKeydown）：组字中一律不当成提交。
 * keyCode 229 是部分输入法在组字时不报 isComposing 的补漏。
 * ⚠️ 因此这里不能写 @keydown.enter.prevent：`.prevent` 先于本函数执行，会把组字那一下的
 * 默认行为（上屏候选词）一起吃掉。
 */
function submitHandleOnEnter(event) {
  if (event.isComposing || event.keyCode === 229) return
  event.preventDefault()
  closeHandle()
}

function onDocPointer(event) {
  if (!handleWrap.value?.contains(event.target)) closeHandle()
}

watch(handleOpen, (open) => {
  if (open) {
    handleDraft.value = cfHandle.value
    document.addEventListener('mousedown', onDocPointer)
    nextTick(() => handleInput.value?.focus())
  } else {
    document.removeEventListener('mousedown', onDocPointer)
  }
})
</script>

<style scoped src="../styles/cf-console.css"></style>

<style scoped>
.cf-codeforces {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  /* 抬头在 .cf-view 之外，容器查询得挂在它自己的祖先上（子面板另有 cf 容器） */
  container-type: inline-size;
  container-name: cfpage;
}

/* 抬头：透明底、不画线，三栏 —— 左状态 / 中模式 / 右全局上下文 */
.cf-codeforces__bar {
  display: grid;
  flex: 0 0 auto;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  height: 46px;
  padding: 0 20px;
}

.cf-codeforces__lead {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

/* 后退 / 前进（2026-10-29）：跟在品牌后面（用户口径：放到品牌图标右边）。
   无框无底，指针压上来才浮一层淡底；到头了只把字色压暗。 */
.cf-nav {
  display: inline-flex;
  flex: 0 0 auto;
  gap: 2px;
}

.cf-nav__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

:where(html.is-hoverable) .cf-nav__btn:hover:not(:disabled) {
  background: var(--icon-hover-bg);
  color: var(--text);
}

.cf-nav__btn:disabled {
  color: var(--text-faint);
  cursor: default;
}

.cf-codeforces__brand {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: var(--text-faint);
}

.cf-codeforces__title {
  overflow: hidden;
  color: var(--text);
  font-size: 13px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 分段：几枚圆角矩形并排、无外框（与比赛子页签同一套 .cf-tab） */
.cf-codeforces__modes {
  display: inline-flex;
  flex: 0 0 auto;
  gap: 2px;
}

.cf-codeforces__aside {
  display: inline-flex;
  align-items: center;
  justify-self: end;
  gap: 8px;
  min-width: 0;
}

/* ---------------- 账号胶囊 ---------------- */
.cf-handle {
  position: relative;
  min-width: 0;
}

.cf-handle__btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 190px;
  height: 26px;
  padding: 0 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-dim);
  font-family: var(--ui-font);
  font-size: 11.5px;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

:where(html.is-hoverable) .cf-handle__btn:hover {
  background: var(--icon-hover-bg);
  color: var(--text);
}

.cf-handle__text {
  min-width: 0;
  overflow: hidden;
  font-family: var(--mono-font);
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 窄容器的替身（2026-11-09）：胶囊里的文字与箭头都被挤掉时，靠这枚人形图标撑住
   入口 —— 之前窄容器把它整块隐成了 12px 的透明按钮，抽题页的「先在右上角设置」
   就成了指路指到一个看不见的地方。宽容器下它不出现（文字比图标清楚）。 */
.cf-handle__icon {
  flex: 0 0 auto;
  display: none;
}

/* 名字按 CF 段位色上色 + 加粗（2026-10-29 用户口径） */
.cf-handle__name.is-ranked {
  font-weight: 600;
}

/* 多账号收起来的那截（+N）：不再跟名字抢眼，压到最淡 */
.cf-handle__extra {
  margin-left: 3px;
  color: var(--text-faint);
}

/* 段位色。这几支是 **CF 自己的配色**，刻意不抽象成主题变量（它们表达的是段位，
   不是界面层次）：
   - 深色（默认）那组把太暗的四支提亮了 —— 官方 #008000 / #0000ff / #aa00aa / #ff0000
     落在 #1c1c1c 上几乎读不出来；色相不动，仍认得出是哪一档。
   - 浅色那组回到官方原文（下面那条覆盖）—— CF 站本身就是白底，这套颜色在那里最正。
   master 与 international master 同色、三个 grandmaster 同色，所以七档够用（见 cf/rank.js）。 */
.cf-handle__name.cf-rank--newbie { color: #9e9e9e; }
.cf-handle__name.cf-rank--pupil { color: #1fae1f; }
.cf-handle__name.cf-rank--specialist { color: #03a89e; }
.cf-handle__name.cf-rank--expert { color: #5b8cff; }
.cf-handle__name.cf-rank--candidate-master { color: #d96cd9; }
.cf-handle__name.cf-rank--master { color: #ff8c00; }
.cf-handle__name.cf-rank--grandmaster { color: #ff5252; }

:root[data-scheme='light'] .cf-handle__name.cf-rank--newbie { color: #808080; }
:root[data-scheme='light'] .cf-handle__name.cf-rank--pupil { color: #008000; }
:root[data-scheme='light'] .cf-handle__name.cf-rank--specialist { color: #03a89e; }
:root[data-scheme='light'] .cf-handle__name.cf-rank--expert { color: #0000ff; }
:root[data-scheme='light'] .cf-handle__name.cf-rank--candidate-master { color: #aa00aa; }
:root[data-scheme='light'] .cf-handle__name.cf-rank--master { color: #ff8c00; }
:root[data-scheme='light'] .cf-handle__name.cf-rank--grandmaster { color: #ff0000; }

.cf-handle__chevron {
  flex: 0 0 auto;
  color: var(--text-faint);
}

/* 小面板：锚在胶囊下方，靠右对齐；不铺大卡，一块浅面 + 一条淡边。
   宽度要跟着面板收（2026-11-05）：它是 absolute、右对齐、没有 Teleport，会被
   `.pane` 的 overflow 裁掉左半边 —— 侧栏能拖到宽屏最小 240px，固定 280px 就露不下了。
   100cqw 是最近的容器（`.cf-codeforces` 的 container-name: cfpage）；
   -28 让左右各留 14px，不会贴到面板边缘。 */
.cf-handle__panel {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(280px, calc(100cqw - 28px));
  padding: 12px;
  border-radius: 10px;
  background: var(--bg-panel);
  box-shadow: 0 0 0 1px var(--border-divider), 0 12px 28px rgba(0, 0, 0, 0.28);
}

.cf-handle__label {
  color: var(--text-dim);
  font-size: 11.5px;
  font-weight: 500;
}

.cf-handle__panel .cf-input {
  width: 100%;
}

.cf-handle__hint {
  margin: 0;
  color: var(--text-faint);
  font-size: 11px;
  line-height: 1.5;
}

@container cfpage (max-width: 34rem) {
  .cf-codeforces__bar {
    padding: 0 14px;
  }

  /* 窄容器先让标题让位，再让 handle 文本让位（图标与分段始终在） */
  .cf-codeforces__title {
    display: none;
  }

  .cf-handle__btn {
    max-width: 96px;
  }
}

@container cfpage (max-width: 22.5rem) {
  /* 左端最窄时只留后退 / 前进：品牌图标再留着会被挤成 0 宽（2026-10-29 实测），
     与其让它半隐半现，不如整块让位给导航与分段 */
  .cf-codeforces__brand {
    display: none;
  }

  /* 品牌让位后，这一簇只剩两个箭头，于是把它往左压近抬头的内边距、并把两枚贴紧
     （2026-11-10 用户口径：中间三枚页签必须**几何居中**，只在这一档动左端这一簇）。
     抬头仍是 `minmax(0,1fr) auto minmax(0,1fr)`，页签组中心与抬头中心偏差恒为 0；
     但左右两栏等宽、内容不等宽（左 59 / 右 29），页签两侧留白才会一窄一宽。
     收窄这一簇能把差额补回来一部分，实测 375px：页签左侧留白 22.5 → 37.7
     （右侧 52.3 未变，因为账号胶囊的位置由 1fr 列决定，这里不碰）。
     顺带解决 320px 时回退键压到页签上 5px 的老问题（改后留 10px 空隙）。
     宽度用 px 写即可：postcss-pxtorem 会转 rem，随界面缩放等比走。 */
  .cf-nav {
    gap: 0;
    margin-left: -8px;
  }

  /* 两枚图标之间原本隔着按钮内衬（26px 盒装 18px 图标 = 每侧 4px 空白），
     只把 gap 归零看不出差别，所以盒宽再收 2px（内衬 3px），视觉上才真的贴成一对 */
  .cf-nav__btn {
    width: 24px;
  }

  /* 账号胶囊退成图标。文字与箭头一律让位，**但按钮本身必须留着东西可看**：
     全隐之后它仍占着托盘、仍能点，只是肉眼看不见 —— 窄屏用户既找不到入口，
     也读不懂「先在右上角设置」（2026-11-09）。 */
  .cf-handle__text,
  .cf-handle__chevron {
    display: none;
  }

  .cf-handle__icon {
    display: block;
  }

  .cf-handle__btn {
    padding: 0 7px;
  }
}

/* ---------------- 取景框 / 轨道 / 页（2026-11-13） ---------------- */
/* 取景框：横向把左右两页裁掉，纵向不裁 —— 每一页的 `.cf-view` 自己就是滚动容器
   （子面板仍是 `absolute; inset: 0`，所以它必须是一个定位上下文）。
   用 `clip` 不用 `hidden`：`hidden` 会让这一层变成滚动容器，把页内的浮层一起吃掉。
   两轴都裁也不会误伤：页内真正的浮层（账号面板、右键菜单）都 Teleport 到 body。 */
.cf-codeforces__stage {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  overflow: clip;
}

/* 单层轨道：三页并排，只有这一层在动（见 useSwipeTrack）。
   ⚠️ 静止时也必须是 `translate3d(0, 0, 0)`，绝不能退回 `transform: none`：
   浏览器为过渡临时提升的合成层会随之被丢掉，落定的最后一下内容会空白一瞬
   （设置页 2026-11-08 那条，本机复现不了，按机制修）。 */
.cf-codeforces__track {
  display: flex;
  height: 100%;
  will-change: transform;
  transform: translate3d(0, 0, 0);
  backface-visibility: hidden;
}

/* 一页：占满取景框宽、高度撑满取景框 —— 里层 `.cf-view` 的 `inset: 0` 就以它为准，
   三个子面板一行 CSS 都不用改（容器查询也照旧按每页自己的宽度算）。 */
.cf-pane {
  position: relative;
  flex: 0 0 100%;
  min-width: 0;
  height: 100%;
}
</style>
