<script setup>
/**
 * 样例列表里的一张卡：头栏 + 可折叠的正文外壳。正文本身在 TestCaseBody（2026-11-19 抽出），
 * 与后续的分项标签视图共用同一份实现；这里只管「卡片」这层外壳该管的事：
 * 折叠、头栏那排信息与两颗图标、以及卡片之间的留白。
 */
import { computed, nextTick, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import AppTooltip from './AppTooltip.vue'
import TestCaseBody from './TestCaseBody.vue'
import { caseBadgeLabel, caseTimingText } from '../services/caseSummary.js'
import { t } from '../i18n/index.js'

const props = defineProps({
  testCase: { type: Object, required: true },
  index: { type: Number, required: true },
  /** 正在运行：整张卡片锁定（运行、删除都按下不响） */
  locked: Boolean,
  /**
   * 不可运行的原因（活跃文件不是代码文件时由 App 给出）。空串＝可运行。
   * 与 locked 分开：locked 是「等一下就好」，这个是「这个文件跑不了」——
   * 两者都要置灰 ▶，但只有后者需要把原因说出来。
   */
  runBlocked: { type: String, default: '' },
})

const emit = defineEmits(['remove', 'run'])

// 徽标文案与耗时文案都在 services/caseSummary.js（2026-11-19 抽出）：
// 分项标签视图要显示同一件事，两套口径不能各写一份 —— 判定码的兜底规则与耗时那三档
// 分界（10ms / 1s）只要差一处，同一次运行在两种布局里就会给出两种说法。
const badgeLabel = computed(() => caseBadgeLabel(props.testCase))

// 折叠状态与用例记录放在一起，卡片被复用（v-for key 为 id）时不会丢。
const isCollapsed = computed(() => props.testCase.collapsed === true)

const bodyEl = ref(null)

function toggleCollapse() {
  props.testCase.collapsed = !isCollapsed.value
}

// 展开时补一次高度重算：折叠态那一行被压到 0fr，正文元素自己的内联高度没人动过，
// 但正文里那个 ResizeObserver 盯的是宽度，接不住这次变化（判据与旧版同一手，
// 只是重算的实现搬进了 TestCaseBody，由它 expose 出来）。
watch(isCollapsed, (collapsed) => {
  if (!collapsed) nextTick(() => bodyEl.value?.syncHeight())
})

// 运行按钮用 aria-disabled 而不是原生 disabled（2026-10-24 晚）：原生禁用会吞掉
// 按钮的鼠标事件，runBlocked 那句原因就永远弹不出来。禁用语义仍保留给读屏，
// 点击在这里拦掉。
function requestRun() {
  if (props.locked || props.runBlocked) return
  emit('run', props.testCase)
}

/**
 * 耗时文案：三档分界与格式化在 services/caseSummary.js（与分项视图同一份）。
 */
const timing = computed(() => caseTimingText(props.testCase))
</script>

<template>
  <li
    class="card"
    :data-status="testCase.status"
    :class="{ 'is-stale': testCase.stale, 'is-collapsed': isCollapsed }"
  >
    <header class="card__head">
      <button
        class="icon-btn icon-btn--toggle"
        :class="{ 'is-collapsed': isCollapsed }"
        :title="t(isCollapsed ? 'tests.card.expand' : 'tests.card.collapse')"
        :aria-expanded="!isCollapsed"
        :aria-label="t(isCollapsed ? 'tests.card.expand' : 'tests.card.collapse')"
        @click="toggleCollapse"
      >
        <!-- chevron 的字形（m6 9 6 6 6-6）只占 24 网格里的 12×6 单位，是 sibling 图标里
             最扁的一枚：13px 下墨迹实测只有 6.5×3.3px，而同一行的 trash（13px）有 8.7px 宽。
             所以它要 17px 才和别的图标一样宽（墨迹 8.5×4.2）。stroke-width 同步 2.6 → 2：
             描边绝对值 = 2.6/24×13 = 2/24×17 ≈ 1.4px，字形放大而笔画不跟着变粗。 -->
        <AppIcon name="chevron" :size="17" :stroke-width="2" />
      </button>
      <!-- 标题：2026-10-24 由单独的数字改成「样例 N」。原来的状态圆点已删 ——
           它和右侧徽标（AC / CE / 运行中）说的是同一件事，两个色块并排纯属噪音。
           现在头栏从左到右只有：折叠箭头 → 样例 N → 状态徽标 → 删除 → 运行。
           2026-10-25：标题本身就是第二颗折叠开关（用户要求「点击标题部分也可以折叠」
           —— 箭头的墨迹只有 8.5px 宽，热区太小）。外观保持纯文字，只加了 pointer 光标。 -->
      <button
        type="button"
        class="card__title"
        :title="t(isCollapsed ? 'tests.card.expand' : 'tests.card.collapse')"
        @click="toggleCollapse"
      >{{ t('tests.card.title', { n: index + 1 }) }}</button>
      <span class="badge" :data-status="testCase.status">{{ badgeLabel }}</span>
      <!-- 右侧两颗图标共用一套语言（2026-10-24 晚第三次改，用户要求）：都是 32×32 热区、
           默认无底色，删除在左、运行在右。「结果待重测」仍贴在徽标右侧，运行耗时紧挨着两颗图标。
           ▶ 用 aria-disabled 而不是原生 disabled：原生禁用会吞掉按钮的鼠标事件，
           runBlocked 那句原因就永远弹不出来。 -->
      <span
        v-if="testCase.stale"
        class="stale"
        :title="t('tests.card.staleTitle')"
      >
        <!-- 窄容器下换短称（见 @container 22.5rem 那条）：全称五个字会把标题挤成「样…」，
             短称把宽度还给标题；完整解释留在 title 里，最窄一档整条隐藏。 -->
        <span class="stale__full">{{ t('tests.card.staleLabel') }}</span>
        <span class="stale__short">{{ t('tests.card.staleLabelShort') }}</span>
      </span>
      <span class="grow"></span>
      <span v-if="timing" class="metric" :title="t('tests.card.timingTitle')">{{ timing }}</span>
      <AppTooltip class="trash-wrap" :text="t('tests.card.remove')">
        <button
          class="icon-btn icon-btn--danger"
          :aria-label="t('tests.card.remove')"
          :disabled="locked"
          @click="emit('remove', testCase)"
        >
          <AppIcon name="trash" :size="15" />
        </button>
      </AppTooltip>
      <AppTooltip class="run-wrap" :text="runBlocked || t('tests.card.runOne')">
        <button
          class="icon-btn icon-btn--run"
          :aria-label="runBlocked || t('tests.card.runOne')"
          :aria-disabled="locked || Boolean(runBlocked)"
          @click="requestRun"
        >
          <AppIcon name="play" :size="15" />
        </button>
      </AppTooltip>
    </header>

    <!-- 外壳只为展开 / 折叠那一下动画而存在（2026-10-06）：原来这里是 v-show，
         盒子的显示与隐藏是瞬间的。改成「grid 行高 1fr ↔ 0fr」的过渡，见 .card__fold。 -->
    <div class="card__fold" :class="{ 'is-collapsed': isCollapsed }">
      <!-- 正文（2026-11-19 抽出）：input / Expected / Actual 三块 + 差异染色 + 高度自适应。
           卡片只透传用例与锁定态，自己不再碰里面任何一个字段。 -->
      <TestCaseBody ref="bodyEl" :test-case="testCase" :locked="locked" />
    </div>
  </li>
</template>

<style scoped>
.card {
  /* 关键：允许收缩的话用例一多就会被 flex 压扁，
     列表 scrollHeight 永远等于 clientHeight，滚不动。 */
  flex: 0 0 auto;
  /* 无卡片化（2026-10-24 晚，用户要求「留白即边界」）：底色、外框、头部分隔线全部撤掉，
     样例直接落在面板底上；样例之间只靠留白分开。
     2026-10-24 深夜再去掉底部那条单线（用户要求），间距一个像素没动：
     下内边距 10px 与 .card__body 的 10px 合成 20px 的下半段留白。 */
  padding-bottom: 10px;
  /* 只剩透明度还在过渡（.is-stale 的降透明度） */
  transition: opacity 0.18s ease;
}

/* 样例悬停不加整块底色：这一行本身不可点，可点的是头栏按钮，
   它们各自有反馈；整块提亮会在无框的面上凭空铺出一块亮斑。 */
.card.is-stale {
  opacity: 0.86;
}

.card__head {
  display: flex;
  align-items: center;
  gap: 8px;
  /* 左内边距 0（2026-10-24 晚）：卡片不再有外框，头栏要跟下方正文共用同一条左轨。
     折叠箭头占满 0..22px 这一格，标题从 22px 起；正文的标签与代码文字也落在 22px
     （见 TestCaseBody 的 .card__body 与 .field__label 的取值），三者在左侧是一条直线。
     右侧仍是 8px，最右那颗运行钮不贴边。
     纵向 2px（原 7px）：运行 / 删除两颗图标按钮都高 32px，整个头栏因此高 32 + 4 = 36px，
     与它之前「22px 按钮 + 7px 上下内边距」的 36px 完全一致 —— 标题的垂直位置、
     卡片底到下一张标题的距离都不动，只把多出来的 10px 让给了那颗按钮。 */
  padding: 2px 8px 2px 0;
  /* 头栏与正文之间不再画线（2026-10-24 晚）：卡片已经拆掉，一条线会在无框的面上
     凭空划出一道横纹；分隔改由「头栏下内边距 + 正文上内边距」的留白承担。 */
}

.card__title {
  /* 标题现在是文字（样例 N），比原来的单个数字宽：窄面板下允许它省略，
     别把右侧的运行耗时与状态徽标顶出卡片（更窄的一档见文件末尾的容器查询）。
     2026-10-24 晚：字号 13 → 13.5、字重 650 → 700，作为整块样例唯一的强锚点。
     2026-10-25：span → button（点击标题也能折叠）。button 不继承字体、自带边框
     底色与居中排版，四样都要清掉，样式才和原来的 span 一致 —— font: inherit
     写在最前，下面的显式字号字重照旧生效。不加悬停底色：与折叠箭头同一条口径
     （见 .icon-btn--toggle 那条注释），头栏上不出现第二块随鼠标亮起的区域。 */
  appearance: none;
  background: none;
  border: 0;
  padding: 0;
  font: inherit;
  text-align: left;
  cursor: pointer;
  /* 热区与折叠箭头的那颗 22×22 按钮对齐（2026-10-25）：高度同 22px、同一行里都由
     align-items: center 居中，两块热区上下齐平；水平方向上箭头的 -8px 右外边距
     （见 .icon-btn--toggle）把它的盒子右缘压到 22px，标题恰好从 22px 起 ——
     两块热区肩并肩、中间没有缝。line-height 22 让文字在盒内垂直居中，
     视觉位置与原来「文字块被行居中」完全一致；文本布局不变，省略号照旧工作。 */
  height: 22px;
  line-height: 22px;
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  font-size: 13.5px;
  font-weight: 700;
  letter-spacing: 0.1px;
  /* 数字必须等宽（2026-10-24）：状态徽标紧跟在标题后面，默认比例数字下「1」比「2 / 3」
     窄 1.8–2.1px，几张卡的徽标列就会逐张右移（实测 81.58 / 83.34 / 83.69）。
     tabular-nums 让 1..9 同宽，徽标落在同一条竖线上。 */
  font-variant-numeric: tabular-nums;
  color: var(--text);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.grow {
  flex: 1 1 auto;
}

.badge {
  display: inline-flex;
  align-items: center;
  /* 徽标不参与压缩、也不换行：窄面板下宁可让标题与「结果待重测」先让位，否则中文会被挤成竖排单字 */
  flex: 0 0 auto;
  white-space: nowrap;
  /* 纯文字判定（2026-11-19，Typographic Status）：实心淡底、6px 圆角、左右 8px 内边距全部删掉。
     有底色那版靠 ~17px 高的色块撑体量，底色一抽只剩 11px 的裸字就散架；体量改由字号字重承担 ——
     12.5px 压在 11px 的耗时之上、又不抢 13.5px/700「样例 N」的位置，700 的笔画才让 AC / WA
     在亮暗两种底子上都显出纯正的判定色。
     ⚠️ 别再补 background / border-radius / padding：旧底色是硬编码的暗色系亮色相
     （rgba(137,209,133,.18) 那一批），在 paper / leaf / mist 这些浅底主题上会糊出一层脏荧光，
     而 --err 压根没有对应的 --err-face。颜色只有一处来源：--ok / --fail / --err / --info。
     ⚠️ TestCaseTabs 里有一份逐字副本（scoped 样式不跨组件），改这里必须同步那边。 */
  padding: 0;
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: 0.03em;
  color: var(--text-dim);
  transition: color 0.18s ease;
}

.badge[data-status='passed'] {
  color: var(--ok);
}

.badge[data-status='failed'] {
  color: var(--fail);
}

.badge[data-status='error'] {
  color: var(--err);
}

/* 运行中的徽标**静态**（2026-10-23 改；此前是 `breathe` 呼吸：opacity 1 ↔ 0.55、1.15s 无限循环）。
   用户报「点运行，侧边栏的评测样例卡片发生闪烁」。实测（12 条用例、echo 引擎）：运行一开始
   **所有**卡片同时进 `running`（`runAll` 的 `queue.forEach(resetCase)`），于是 12 枚徽标的
   文字在 725ms 里同步淡到 0.55、再同步淡回来 —— 一片同步明灭的字，观感就是整栏在闪。
   而卡片高度全程恒为 349px、`.card` 节点零增删（探针记录），所以闪烁**只来自这条动画**，
   与布局、重渲染都无关。
   别再加回任何 opacity / 闪烁类的 infinite 动画：运行状态由徽标文案「运行中」与面板页头
   那颗转圈交代（2026-10-24 起状态圆点已删），一行 12.5px 的字整栏同步明灭不是。 */
.badge[data-status='running'] {
  color: var(--info);
}

.stale {
  font-size: 11px;
  color: var(--warn);
  white-space: nowrap;
  /* 头栏里除标题外唯一能缩的一格（耗时与两颗图标按钮都是 flex: 0 0 auto）。给它省略号，
     窄到放不下时它自己截断，而不是让文字溢出、压住右边的耗时和运行图标。 */
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 短称默认不渲染；窄容器那一档用它替掉全称（见 @container 22.5rem）。 */
.stale__short {
  display: none;
}

.metric {
  flex: 0 0 auto;
  font-family: var(--mono-font);
  font-size: 11px;
  color: var(--text-dim);
  white-space: nowrap;
}

/* 头栏右侧两颗图标（删除 / 运行）共用一套 32×32 的幽灵按钮语汇，规则见下方
   .icon-btn--danger 与 .icon-btn--run；中间的空余由 .grow 撑开。
   （2026-11-19：TestCaseBody 里那两颗 22×22 的动作钮自带一份同款底座 ——
     组件拆分后这条规则不再跨组件生效，别以为删了这里也没事。） */

.icon-btn {
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  /* 必须清掉 <button> 默认的 1px 6px 内边距（2026-10-26，用户报「logo 没有在热区中居中」）：
     它把 22×22 的内容区压成 10×20，而里面的 svg 是 12–14px、比 10px 宽 —— grid 的 auto
     轨道溢出内容区，默认 justify-content: normal 让轨道从内容区**左缘**起排，墨迹因而相对
     按钮盒中心右偏（实测 arrow-up 偏 2px、copy 偏 1px）。归零后内容区回到 22×22，轨道居中，
     墨迹与盒中心重合（实测 dx / dy 全 0）。垂直方向原本就没问题：内容区高 20 装得下 14px。
     删除 / 运行 / 折叠那三颗原先各自补过 padding: 0，是同一个坑逐个打的补丁；底座收干净后
     它们那几条保持原样（不删，那里的注释各记着自己的判据）。 */
  padding: 0;
  border-radius: 4px;
  color: var(--text-dim);
  transition: background-color 0.15s ease, color 0.15s ease;
}

:where(html.is-hoverable) .icon-btn:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--text);
}

.icon-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

/* 垃圾桶是休眠的幽灵（2026-10-24 晚第二次改，用户要求）：默认常驻，但只剩 0.18 的
   透明度、用次要文字色 —— 它替运行图标撑住右侧这一格，不至于留白，也不跟主操作抢注意力；
   鼠标进入卡片（或键盘进入头栏）时醒到 1，并转成柔和的危险色。
   点按面一直有效（不再 pointer-events: none）：它看得见，就该点得到；
   0.18 的幽灵图标也不至于被误触。手指 / 无悬停指针上走下面那条「常亮」兜底。 */
.icon-btn.icon-btn--danger {
  /* 与运行图标同尺寸（2026-10-24 晚第三次改，用户要求）：32×32 热区、6px 圆角，
     两颗按钮的点击范围与形状完全一致。 */
  width: 32px;
  height: 32px;
  border-radius: 6px;
  /* 垃圾桶是纯图标按钮，必须清掉 UA 的 1px 6px 内边距（2026-10-24）：内容区只剩
     10px 宽时，15px 的 svg 把 grid 的 auto 列撑到 15px 并贴着内容区左缘排，
     墨迹因此比按钮中心右偏 2.5px（纵向内容区有 20px，装得下，不受影响）。
     置 0 后列宽回到 22px，墨迹与盒中心实测完全重合。 */
  padding: 0;
  color: var(--text-dim);
  opacity: 0.18;
  transition: background-color 0.15s ease, color 0.15s ease, opacity 0.15s ease;
}

/* 提示框的触发器就是图标自己那一格：宽度不参与挤压，头栏留白不会因为多包一层而变 */
.trash-wrap,
.run-wrap {
  flex: 0 0 auto;
}

/* 亮起条件按**键盘意图**判，不用 :focus-within（2026-10-24 修）：鼠标点一下旁边的运行按钮，
   焦点也会落进头栏，:focus-within 随即把垃圾桶点亮，指针移出卡片后它仍一直亮着 ——
   看着像垃圾桶自己被聚焦了。:has(:focus-visible) 只认键盘意图，鼠标点击不匹配。 */
:where(html.is-hoverable) .card:hover .icon-btn--danger:not(:disabled),
.card__head:has(:focus-visible) .icon-btn--danger:not(:disabled) {
  opacity: 1;
}

/* 鼠标进入卡片即按用户要求转危险色；键盘进入头栏只显形、不染红 —— 那时焦点还在
   别的按钮上，一枚红垃圾桶会跟正在聚焦的主操作抢眼神。等 Tab 真正落到垃圾桶
   （focus-visible）再变红，见下一条。 */
:where(html.is-hoverable) .card:hover .icon-btn--danger:not(:disabled),
.icon-btn--danger:focus-visible {
  color: var(--fail);
}

/* 没有悬停能力时（手指 / 触控笔落下的那一瞬起）垃圾桶常亮：那种指针上「等悬停才现身」
   等于永远不现身。判据用 html.is-hoverable 而不是 `@media (hover: none)`（2026-10-30 换）：
   后者判的是**设备**，手指点在一台「也插着鼠标」的机器上时它不成立，于是上面两条
   被 is-hoverable 挡住、这条又不接管 —— 垃圾桶就一直停在 0.18 的幽灵态。 */
:where(html:not(.is-hoverable)) .icon-btn--danger:not(:disabled) {
  opacity: 1;
  color: var(--fail);
}

/* 运行图标（2026-10-24 晚第三次改）：与垃圾桶互换位置后独立成一颗 32×32 按钮，
   默认无底色、无描边，悬停才浮出 --icon-hover-bg。 */
.icon-btn.icon-btn--run {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  padding: 0;
  color: var(--text-dim);
}

:where(html.is-hoverable) .icon-btn--run:hover:not([aria-disabled='true']) {
  background: var(--icon-hover-bg);
  color: var(--text);
}

.icon-btn--run[aria-disabled='true'] {
  opacity: 0.35;
  cursor: default;
}

/* 禁用时仍允许悬停弹提示（runBlocked 的原因就靠它说），但不给悬停底色 ——
   亮起来的反馈会让人以为按下去有用。 */
:where(html.is-hoverable) .icon-btn--run[aria-disabled='true']:hover {
  background: transparent;
  color: var(--text-dim);
}

/* 焦点环画在按钮内部：它贴着卡片右缘，外扩的环会被头栏的内边距裁掉。 */
.icon-btn--run:focus-visible {
  outline: none;
  background: var(--icon-hover-bg);
  box-shadow: inset 0 0 0 1px var(--focus);
  color: var(--text);
}

.icon-btn--toggle {
  /* 箭头自己占住左侧 0..22px 那一格，标题、标签、代码文字统一从 22px 起
     （见 .card__head / TestCaseBody 的 .card__body）。-8px 的右外边距把「按钮宽度 + 头栏 gap」
     这笔账压回 22px；少了它标题会被 gap 推到 30px，左侧四行字的起点就散了。
     内边距归零（2026-10-06 先在这一颗上补，2026-10-26 收进 .icon-btn 底座）：<button>
     默认的 1px 6px 会把 17px 的 svg 顶到内容区左侧，墨迹从 6.75px 偏到 10.25px，箭头
     看着像掉出了自己的格子。这里保留这条显式声明 —— 它与上面的 margin 一起构成「箭头
     占住左侧 0..22px 那一格」的完整定位，别因为底座已经有了就删掉。 */
  margin: 0 -8px 0 0;
  padding: 0;
  transition: color 0.15s ease;
}

/* 折叠箭头不要悬停底色（2026-10-06）：它只有 8.5px 宽的一点墨迹，鼠标停上去时
   那颗 22×22 的灰方块（--bg-hover）比字形本身还抢眼，点完鼠标还停在那里，看着
   像「选中了还亮着」。反馈留给文字由灰变亮（--text-faint → --text）。
   必须写在这里：与 .icon-btn:hover:not(:disabled) 同权重，靠后面这条覆盖掉。 */
:where(html.is-hoverable) .icon-btn--toggle:hover:not(:disabled) {
  background: transparent;
}

/* 悬停标题时箭头同样高亮（2026-10-25）：标题已是第二颗折叠开关（见 .card__title），
   指针落在两块热区的任意一处，箭头都要给出同一份反馈 —— 颜色 --text-dim → --text，
   与直接悬停按钮完全一致；底色两处都保持透明。:has() 在这文件里已有先例
   （.card__head:has(:focus-visible)）。箭头自己的 color transition（.icon-btn 上那条）
   照常生效，所以高亮是渐变不是瞬跳。 */
:where(html.is-hoverable) .card__head:has(.card__title:hover) .icon-btn--toggle {
  color: var(--text);
}

/* 折叠箭头的旋转挂在 svg 上，**不挂在按钮上**（2026-10-06）：
   起因是这颗按钮当时并不水平居中 —— `.icon-btn` 没重置 <button> 默认的 1px 6px 内边距，
   22px 的盒子里内容区只剩 10px，17px 的 svg 溢出后靠在内容区左侧（左内缩 6px，
   居中该是 2.5px），墨迹中心因此落在按钮盒中心右边 3.5px。旋转若由按钮承担，默认
   transform-origin 取按钮盒中心，视觉上就成了「绕字形左边缘转」，折叠一瞬间箭头
   先往右跳 3.5px 再转。
   后来那颗按钮补上了 padding: 0（见上），svg 已归位到盒子正中，转按钮与转 svg
   在数学上就等价了；但**这条仍要挂在 svg 上**：① svg 的 viewBox 中心正是字形中心
   （chevron 占 x6..18、y9..15，中心 12,12），旋转轴天然落在墨迹中心，与按钮盒的
   内边距设置彻底解耦；② 哪天想再调这颗按钮的 padding / margin 把箭头往左挪，
   也不会再把旋转轴带偏。实测展开态、动画半程、折叠态三处墨迹中心完全重合。
   transition 也随之挂在 svg 上，否则这里会变成瞬变、动画消失。 */
.icon-btn--toggle svg {
  transition: transform 0.18s ease;
}

.icon-btn--toggle.is-collapsed svg {
  transform: rotate(-90deg);
}

/* 展开 / 折叠动画（2026-10-06）：grid 行高 1fr ↔ 0fr。
   这是纯 CSS 里唯一能「过渡到内容高度」的写法 —— max-height 得先猜一个上限，猜大了
   折叠后半程在空转、猜小了直接把正文截断，而这里的正文高度是活的（两个输入框按内容
   自适应、实际输出最多能到 320px）。行高走 fr 就没有上限问题，中途掉头也接得住。
   子项必须 min-height: 0 + overflow: hidden：否则 0fr 那一行仍被内容的最小高度撑着，
   收不下去。 */
.card__fold {
  display: grid;
  grid-template-rows: 1fr;
  transition: grid-template-rows 0.2s ease;
}

.card__fold.is-collapsed {
  grid-template-rows: 0fr;
}

/* 折叠后把正文移出 Tab 序：原来靠 v-show 的 display: none 顺手做到这件事，现在为了
   动画不能再用 display（display 不可过渡），改成 visibility。延迟 0.2s 与行高动画同步
   —— 折叠过程中文字还看得见，收完才隐藏；展开时没有延迟，立刻可见。
   （「减少动态效果」下 transition-duration 被全局压成 0.01ms，但 delay 不跟着改，
   于是收完那一下内容还会多留 0.2s —— 看不见，因为那时行高已经是 0、被 overflow 裁掉了。）

   上下内边距要跟着收到 0：**padding 是不可压缩的**，min-height: 0 只能把内容盒收到 0，
   0 + 10 那 10px 仍然撑着行 —— 不补这一脚，折叠后卡在头栏下面留一条 10px 的空档。
   左右不动：收横向内边距会让正文宽度变化、里面的输入框重排（ResizeObserver 还会跟着
   重算高度），白添抖动。

   ⚠️ 2026-11-19 正文抽成 TestCaseBody 之后，`.card__body` 是**子组件的根节点** ——
   父组件的 scoped 规则对子组件根节点照样生效（根节点同时带两边的 data-v），所以这两条
   不用 `:deep()`、也不能删。真正失效的是「跨层往里够」的写法，别照着这条去改。 */
.card__fold > .card__body {
  min-height: 0;
  overflow: hidden;
  visibility: visible;
  transition: visibility 0s linear, padding 0.2s ease;
}

.card__fold.is-collapsed > .card__body {
  padding-top: 0;
  padding-bottom: 0;
  visibility: hidden;
  transition: visibility 0s linear 0.2s, padding 0.2s ease;
}

/* ---------- 窄容器下的降级（头栏这一半）----------
   容器是 TestPanel 里 .cases 的 inline-size（约等于面板宽度 − 16px 内边距 − 滚动条）。
   面板下限放宽到 240px 后（见 App.vue 的 --tests-min-cap），头部一行放不下全部内容：
   折叠箭头、徽标、运行 / 删除按钮都是 flex: 0 0 auto，标题与「结果待重测」可以压缩。
   所以按重要性逐级让步，而不是让它们挤在一起。

   注意优先级：**每例的运行耗时（.metric）与徽标在任何宽度下都不隐藏** ——
   前者是这一行里唯一「看完会想改代码」的信息；后者是 AC / WA 唯一的判定结论。
   唯一还能让位的是「结果待重测」
   （它还有面板头部的 ?/N AC 徽标与卡片降透明度在提示）。
   正文那一侧的让步（.card__body / .io / .ta / .out / .ionote）在 TestCaseBody 里。 */
@container (max-width: 22.5rem) {
  .card__head {
    gap: 6px;
    /* 左内边距与基础值同为 0：省宽度的活交给右边（8 → 6），左边一让，
       折叠箭头和整列文字的左轨就会跟着横跳，而它才是这一行的起点。
       纵向 2px 同基础值：头栏高度由 32px 的幽灵按钮撑住。 */
    padding: 2px 6px 2px 0;
  }

  /* gap 收到 6 之后，箭头右侧的负外边距也要同步收 2px，
     标题才仍从 22px 起（22 + gap + margin-right = 22）。 */
  .card__head .icon-btn--toggle {
    margin-right: -6px;
  }

  /* 「结果待重测」换短称：全称五个字在这一档会和标题一起截断（实测 110% 缩放、
     300px 容器下标题只剩「样…」），短称把省下的宽度还给标题；再窄一档整条隐藏。 */
  .stale__full {
    display: none;
  }

  .stale__short {
    display: inline;
  }

  /* 短称也放不下时（带运行耗时的最窄一段）先挤它、别挤标题：标题是这张卡的身份，
     待重测只是提醒，还有面板页头的 ?/N 与卡片降透明度兜着（2026-10-24 实测 270px 容器）。 */
  .stale {
    flex-shrink: 4;
  }
}

/* 短称也装不下的一档：整条让掉，把宽度还给标题。「结论已过期」仍有面板页头的 ?/N
   与卡片降透明度在说。阈值按容器**内容盒**算（.cases 有 8px 横向内边距，比外宽小 16px），
   界线取在实测折点上：276px 内容宽短称还装得下、272px 标题与短称就开始一起折，
   故 17rem = 272px 起隐藏。 */
@container (max-width: 17rem) {
  .stale {
    display: none;
  }
}

/* 再挤一档：间距收到最小，把宽度省给运行耗时与徽标。
   徽标不藏：AC / WA 是这一行唯一的判定结论。「结果待重测」已在 17rem 那档整条让掉。 */
@container (max-width: 15.625rem) {
  .card__head {
    gap: 4px;
    padding: 2px 5px 2px 0;
  }

  /* 同上：负外边距跟住 gap，左轨仍是 22px */
  .card__head .icon-btn--toggle {
    margin-right: -4px;
  }
}
</style>
