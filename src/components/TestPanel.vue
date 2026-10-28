<script setup>
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import LoadingSpinner from './LoadingSpinner.vue'
import TestCaseCard from './TestCaseCard.vue'
import { useOverlayScrollbar } from '../composables/useOverlayScrollbar.js'
import { formatCombo, useShortcutManager } from '../composables/useShortcutManager.js'
import { mountConfetti, unmountConfetti } from '../services/confetti.js'
import { t } from '../i18n/index.js'

// 页头右侧的 verdict + 耗时经 Teleport 投进 Sidebar 的共享页头（#sidebar-context），
// 只在本面板激活时投 —— 切换器单实例上提后（2026-10-11），页头只剩这一小条上下文
const { activeTab, compact } = inject('sidebarTabs')
const isActivePanel = computed(() => activeTab.value === 'tests')

// 用例列表是面板里唯一的长滚动区：原生滚动条会占掉 11px 宽度（卡片跟着变窄、出现 / 消失时
// 折行位置还会跳），改用覆盖式滑块（2026-10-13）。原生那条由下面 .cases 的
// scrollbar-width / ::-webkit-scrollbar 藏掉
const listEl = ref(null)
useOverlayScrollbar(listEl)

// 庆祝纸屑层（2026-10-23 加）：canvas 铺满这块面板，尺寸 / 颜色 / 摆法全在
// services/confetti.js 里，这里只负责「挂上 / 摘掉」这一对。
// 触发方是 App（整轮 ▶ 全过走 celebrateIfAllPassed，逐张 ▶ 刚好凑齐全过走 runOne），
// 不是这里 watch props.cases —— 用例回写会在运行途中整批换掉卡片对象，
// watch 拿到的「上一份 status」经常已经丢了。
const confettiEl = ref(null)
onMounted(() => mountConfetti(confettiEl.value))
onBeforeUnmount(unmountConfetti)

const props = defineProps({
  cases: { type: Array, required: true },
  running: Boolean,
  // 最慢的那张用例卡片耗时（毫秒，只计运行段，与卡片同口径）
  elapsed: { type: Number, default: 0 },
  /**
   * 不可运行的原因（由 App 按活跃文件算好）。空串＝可运行。
   * 它同时是三处地方：页脚那行说明、两个 ▶ 的 title、以及「置灰」这件事的判据。
   */
  runBlocked: { type: String, default: '' },
  /**
   * 提交请求在途：按钮置灰，防止连点（扩展那边一次只跑一趟）
   */
  submitting: Boolean,
  /**
   * 这一屏能不能交（由 App 算好：是不是题 + 扩展能力 + 语言都齐了才算）。
   * **交不了就整个不渲染**（2026-10-23 改，用户要求「不要占用视觉」）——
   * 所以这里没有「置灰的提交按钮」，也没有属于它的原因行；原因只走快捷键那条通知。
   */
  showSubmit: Boolean,
  /**
   * 空态里追加的一行提示，没有就是 null（非题目文件、或样例已经在了）。两种形状：
   *   { text, tone }                            —— 纯文本（正在抓 / 抓失败）
   *   { before, linkText, after, url, tone }    —— 中间带一个可点的题目链接（还没到手）
   * tone：'' 走常态的暗灰，'info' 是进行中，'warn' 是失败。
   */
  notice: { type: Object, default: null },
})

const emit = defineEmits(['add', 'remove', 'run-one', 'run-all', 'submit'])

// 页脚主条的原生 title 里带上它的快捷键（2026-10-24 凌晨用户要求「鼠标在运行全部按钮上时，
// 显示它的快捷键」；口径明确是**原生描述**，不自绘气泡）。组合键走 formatCombo(bindings.run)
// —— 绑定表是唯一口径，设置里改键这里跟着变；解绑了退回纯动作名。
// 跑不了时仍填原因（与改前同义）：原生禁用按钮收不到鼠标事件、title 悬不出来，
// 那行原因由页脚 .run-blocked 那行看得见的字负责。
const { bindings } = useShortcutManager()
const runDisabled = computed(
  () => props.running || !props.cases.length || Boolean(props.runBlocked),
)
const runTitle = computed(() => {
  if (props.runBlocked) return props.runBlocked
  const combo = formatCombo(bindings.value.run)
  return combo ? t('tests.panel.runAllTip', { key: combo }) : t('tests.panel.runAll')
})
// 「添加测试样例」那颗的 title 同样带上它的快捷键（2026-10-24 凌晨，用户继运行全部之后点名）。
// 行动 id 是 `new-case`（App.vue 的绑定表）。置灰时原生禁用按钮悬不出 title，不用另写原因分支。
const addTitle = computed(() => {
  const combo = formatCombo(bindings.value['new-case'])
  return combo ? t('tests.panel.addCaseTip', { key: combo }) : t('tests.panel.addCase')
})
// 「提交到 Codeforces」那颗同上（2026-10-24 凌晨，用户逐颗点名到第三颗）。
// 行动 id 是 `submit-solution`；它是纯图标按钮，title 就是它唯一的可见说明，所以更要带全。
const submitTitle = computed(() => {
  const combo = formatCombo(bindings.value['submit-solution'])
  return combo ? t('tests.submit.buttonTip', { key: combo }) : t('tests.submit.button')
})

// 页脚上沿那条「还有下文」线（2026-10-23 加；判据同日按用户口径翻过一面）：
// 页脚底色已改成与面板同色（--bg-editor，即整页地面），不再靠色差与列表分开，
// 于是改由一条发丝线交代边界。
//
// ⚠️ **判据与页头（Sidebar.syncHeadScrolled）正好相反，别顺手抄那一条**：
//   页头在顶上：scrollTop > 0 才画（内容从页头底下穿过去了）。
//   页脚在底下：**没滚到底才画** —— 还有内容压在这条线后面，才需要把它描出来；
//   滚到最底 / 一屏装得下 / 空列表，都没有「下文」，线就不该出现（用户 2026-10-23 纠正）。
//   −1 是亚像素余量：缩放后 scrollHeight 常带小数，差 0.5px 时「已到底」会被读成
//   「还有下文」，那条线就永远擦不掉。
// ⚠️ 别改成「恒定描边」：列表装得下时，那条线会把一块空白切成两截。
// ⚠️ 这条 border 常时也在（透明），只是为了显示 / 隐藏时页脚高度不抖 1px。
const moreBelow = ref(false)
function syncFootEdge() {
  const el = listEl.value
  if (!el) {
    moreBelow.value = false
    return
  }
  moreBelow.value = el.scrollTop + el.clientHeight < el.scrollHeight - 1
}

let listObserver = null

onMounted(() => {
  const el = listEl.value
  if (!el) return
  el.addEventListener('scroll', syncFootEdge, { passive: true })
  // 面板在两个页签间用 v-show 切（不是 v-if）：藏起来时 clientHeight 是 0、判据算不出东西，
  // 切成「评测样例」那一刻盒子从 0 变高，ResizeObserver 会补发这次重算 ——
  // 光靠 scroll 事件的话，进面板后只要不动滚轮，线就一直缺着。
  listObserver = new ResizeObserver(syncFootEdge)
  listObserver.observe(el)
  syncFootEdge()
})

onBeforeUnmount(() => {
  listEl.value?.removeEventListener('scroll', syncFootEdge)
  listObserver?.disconnect()
  listObserver = null
})

// 增删用例（以及改动输入让卡片长高 / 变矮）改的是内容高度，没人滚 —— 补一次重算。
// 卡片自己的折叠态在子组件里，这里看不到：那种情形最多在「收起后刚好不再溢出」时
// 多留一条线，滚一下就自愈，不值得为它再挂一个 MutationObserver。
watch(() => props.cases, () => nextTick(syncFootEdge), { deep: true })

const counts = computed(() => {
  // stale 是附加维度：卡片状态仍是 passed/failed/error，但代码或输入已改动、结论过期
  const tally = { idle: 0, running: 0, passed: 0, failed: 0, error: 0, stale: 0 }
  for (const item of props.cases) {
    tally[item.status] = (tally[item.status] ?? 0) + 1
    if (item.stale) tally.stale += 1
  }
  return tally
})

// 与卡片徽标同一套判定词：AC 就是通过。混合结果只报「几 / 几 AC」，
// 具体是 WA 还是 TLE 由各张卡片的徽标说明，页头不再堆第二个长句。
// 只要有一张卡片的结论已过期（stale），就不能再宣称「全部 AC」——
// 上一轮通过不代表改完代码后仍通过。
// 窄侧栏（compact 由 Sidebar 按 <360 逻辑 px 算好）去掉「 AC」后缀：
// 「0/4 AC」加耗时在侧栏最窄时会挤到折行，数字本身已经表意（2026-10-12）。
const verdict = computed(() => {
  const total = props.cases.length
  if (!total) return { text: t('tests.verdict.noCases'), tone: 'muted' }
  if (counts.value.running) return { text: t('tests.verdict.running'), tone: 'info' }
  // 有结论过期就报不出确切的通过数，用 ? 代替（卡片各自标明哪些待重测）
  if (counts.value.stale)
    return {
      text: t(compact.value ? 'tests.verdict.staleShort' : 'tests.verdict.stale', { total }),
      tone: 'warn',
    }
  if (counts.value.passed === total)
    return {
      text: t(compact.value ? 'tests.verdict.allPassedShort' : 'tests.verdict.allPassed'),
      tone: 'passed',
    }
  const tone = counts.value.error ? 'error' : counts.value.failed ? 'failed' : 'muted'
  return {
    text: t(compact.value ? 'tests.verdict.partialShort' : 'tests.verdict.partial', {
      passed: counts.value.passed,
      total,
    }),
    tone,
  }
})

// 有过期结论时，页头耗时同样来自上一轮，跟着藏掉，免得和「结果待重测」自相矛盾
const elapsedText = computed(() => {
  if (!props.elapsed || counts.value.stale) return ''
  return props.elapsed >= 1000 ? `${(props.elapsed / 1000).toFixed(2)}s` : `${props.elapsed}ms`
})
</script>

<template>
  <section class="panel" :aria-label="t('tests.panel.ariaLabel')">
    <!-- 页头动作区：verdict + 耗时投进 Sidebar 共享页头的 #sidebar-context。
         不激活时 disabled、内容原地渲染（面板 v-show 藏着，不可见）；defer 的来历
         见 FileExplorer 里那颗同款 Teleport 的注释。
         具体是 WA 还是 TLE 由各张卡片的徽标说明，这里不堆长句 -->
    <Teleport defer :disabled="!isActivePanel" to="#sidebar-context">
      <div class="panel__heading">
        <span class="verdict" :data-tone="verdict.tone">
          <LoadingSpinner v-if="counts.running" :size="9" />
          <span>{{ verdict.text }}</span>
        </span>
        <span
          v-if="elapsedText"
          class="elapsed"
          :title="t('tests.elapsedTitle', { time: elapsedText })"
        >
          <AppIcon name="clock" :size="11" />{{ elapsedText }}
        </span>
      </div>
    </Teleport>

    <ul ref="listEl" class="cases" :class="{ 'is-empty': !cases.length }">
      <li v-if="!cases.length" class="empty">
        <!-- 空态只有这一行（2026-10-06）：原先还有一句「点击下方按钮新增一个用例…」和一颗
             「添加第一个用例」大按钮，前者是废话、后者与列表末尾那颗「添加测试样例」重复
             （那颗当时在页脚，2026-10-23 挪进列表）。
             这句话**写死英文、两套界面语言都一样**（用户 2026-10-06 定，参照稿里就是这行
             居中的淡灰字）：与三个小标题 input / Expected / Actual 同一个理由 —— 它是一句
             格式固定的状态语，翻成中文反而与整块面板的英文标签混搭。所以它**不在消息表里**。
             抓样提示（notice）保留 —— 它是插件自动抓样例那一路唯一的反馈，且仍按语言翻。 -->
        <p class="empty__title">No test cases yet.</p>
        <!-- 空态就这一行：跑不了的原因不在这里解释（那行字在页脚），这一栏越干净越好。
             抓样那三条提示仍然照旧（它们说的是「样例为什么还没到手」，与能不能运行无关）。 -->
        <p v-if="notice" class="empty__notice" :data-tone="notice.tone">
          <!-- 抓取在途（tone = info）时把等待画在这一行里：空态期间没有别的东西可看，
               转起来才知道它还在动 -->
          <LoadingSpinner v-if="notice.tone === 'info'" :size="11" />
          <span>
            <!-- 带题目链接的形状：before + <a> + after 三段拼成一句（另两段是纯文本，见 props 说明） -->
            <template v-if="notice.url">
              {{ notice.before
              }}<a class="empty__link" :href="notice.url" target="_blank" rel="noopener noreferrer">{{
                notice.linkText
              }}</a
              >{{ notice.after }}
            </template>
            <template v-else>{{ notice.text }}</template>
          </span>
        </p>
      </li>

      <TestCaseCard
        v-for="(item, index) in cases"
        :key="item.id"
        :test-case="item"
        :index="index"
        :locked="running"
        :run-blocked="runBlocked"
        @remove="emit('remove', $event)"
        @run="emit('run-one', $event)"
      />

      <!-- 添加用例：从页脚挪到列表末尾（2026-10-23，用户：「移到样例栏中去，
           到所有样例的后面」）。它是这条列表的收尾项，仍然整宽。
           `flex: 0 0 auto` 不能省：卡片也靠同一条避免被压扁（见 .card 的头注），
           用例一多、列表开始滚动时它同样不该被压。
           空列表时它由 .cases.is-empty 推回列表底部（见样式里那条），
           与绝对定位在 38.2% 处的空态文案各安其位。
           ⚠️ `title` 不能省：窄屏下那个 `span` 被隐藏（规则在 Sidebar.vue 的窄屏块里），
           AppIcon 是 aria-hidden，没有它这颗按钮就成了一个没有名字的图标按钮。 -->
      <li class="cases__add">
        <button
          class="add"
          :title="addTitle"
          :disabled="running || Boolean(runBlocked)"
          @click="emit('add')"
        >
          <AppIcon name="plus" :size="14" />
          <span class="add__label">{{ t('tests.panel.addCase') }}</span>
        </button>
      </li>
    </ul>

    <footer class="panel__foot" :class="{ 'is-more-below': moreBelow }">
      <!-- 跑不了的原因写成一行看得见的字（置灰的按钮在浏览器里收不到鼠标事件，
           title 也就悬不出来）。**提交那条不在这里**：交不了的时候那颗按钮压根不渲染
           （见 showSubmit 与 App 里那段说明）。 -->
      <p v-if="runBlocked" class="run-blocked">{{ runBlocked }}</p>
      <div class="panel__foot-row">
        <!-- 一键提交（2026-10-23 加）：次要动作，保持纯图标、靠左，与主条同高。
             只在**真交得了**的时候出现（2026-10-23 改）：交不了的场合连按钮带原因
             一起收掉，页脚不留占位（原因走快捷键那条通知）。
             2026-10-24：与「运行全部」交换左右顺序，提交落在最左。
             2026-10-24 凌晨：原生 title 里也带上它的快捷键（见脚本 submitTitle）。
             2026-10-29：图标从 arrow-up 换成纸飞机 send —— 箭头与「把输出誊进期望」
             那颗同形，且只表达「朝上」；纸飞机的「发送出去」更贴提交。 -->
        <button
          v-if="showSubmit"
          class="submit-inline"
          :class="{ 'is-submitting': submitting }"
          :disabled="running || submitting"
          :title="submitTitle"
          :aria-label="submitting ? t('tests.submit.submitting') : t('tests.submit.button')"
          @click="emit('submit')"
        >
          <AppIcon name="send" :size="12" />
        </button>
        <!-- 主操作（2026-10-24 改）：原先是一颗 32px 的线框 ▶，用户嫌「太单薄、像个漂在角落的
             图标」。现在是通栏图文条：宽度由内容撑开、底色只用低透明度的 --ok 磨砂面，
             文字同时充当可访问名。窄到一个字都放不下之前都不收字 —— 侧栏下限 158px 时
             「▶ 运行全部」仍有富余（见样式里那条宽高账）。
             2026-10-24 凌晨：原生 title 里带上它的快捷键（用户要求「鼠标在运行全部按钮上时，
             显示它的快捷键」；口径是原生描述，不自绘气泡），组合键走绑定表，见脚本 runTitle。 -->
        <button
          class="run-inline"
          :disabled="runDisabled"
          :title="runTitle"
          @click="emit('run-all')"
        >
          <AppIcon name="play" :size="14" />
          <span class="run-inline__label">{{ t('tests.panel.runAllLabel') }}</span>
        </button>
      </div>
    </footer>

    <!-- 庆祝纸屑层（2026-10-23 加）：铺满整块样例面板、盖在列表与页脚之上，
         但不吃指针事件 —— 卡片、▶、覆盖式滑块照常能点。位图尺寸由
         services/confetti.js 每次放之前按 getBoundingClientRect 现设，这里只管「和面板一样大」。
         aria-hidden：纯装饰，不进无障碍树（同样理由，也不用 aria-live 念出来）。 -->
    <canvas ref="confettiEl" class="panel__confetti" aria-hidden="true"></canvas>
  </section>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  /* 作为统一侧边栏「评测样例」页签里的 flex 子项撑满内容区（与 FileExplorer 的 .explorer 同款） */
  flex: 1 1 auto;
  min-height: 0;
  /* 与统一侧边栏同色（--bg-editor，即整页底色）：这个面板盖在 .sidebar 上，
     两边不同值的话切页签就能看出「底板被换了一档」（2026-10-23）。 */
  background: var(--bg-editor);
  /* 纸屑层（.panel__confetti）的定位上下文。写成 relative 而不是给画布用 position: fixed ——
     画布必须跟着面板走，面板被 v-show 藏起来时它才一起消失（2026-10-23）。 */
  position: relative;
}

/* 庆祝纸屑层：铺满整块面板，纯装饰。
   ⚠️ 别给它 `overflow` / `border-radius` 之类：画布不裁剪，粒子「落出」面板下沿就自然消失
   （超出画布的部分浏览器本来就不画）。`pointer-events: none` 是硬要求 ——
   没有它，整块面板上就再也点不到卡片与页脚那两颗按钮。 */
.panel__confetti {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

/* 页头本身已上提到 Sidebar 的共享页头（.sidebar__head，2026-10-11）：折行、
   滚动描边、35px 同高都在那里；这里只剩 Teleport 上去的 verdict + 耗时样式 */

.panel__heading {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  /* 换行后单独占一行时仍然贴右（不写会在换行那一行落到左边） */
  margin-left: auto;
}

.verdict {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 1px 8px;
  /* 圆角矩形 6px，与卡片上那颗判定码徽标（TestCaseCard 的 .badge）同一形状语言；
     2026-10-23 由胶囊（999px）改过来（用户：「所有显示评测结果的胶囊都改成圆角矩形」）。
     6px 是全站最多的圆角值，也是本面板两颗按钮 .add / .run-inline 的圆角。
     ⚠️ 别改成 10px：这枚才 ~17px 高，10 + 10 超过高度，浏览器会按比例把四个角夹小，
     又回到半圆胶囊的样子。 */
  border-radius: 6px;
  font-size: 11px;
  color: var(--text-dim);
  background: var(--case-chip-bg);
  border: 1px solid transparent;
  white-space: nowrap;
  transition: color 0.18s ease, background-color 0.18s ease;
}

.verdict[data-tone='passed'] {
  color: var(--ok);
  background: rgba(137, 209, 133, 0.13);
}

.verdict[data-tone='failed'] {
  color: var(--fail);
  background: rgba(244, 135, 113, 0.13);
}

.verdict[data-tone='error'] {
  color: var(--err);
  background: rgba(224, 163, 78, 0.13);
}

.verdict[data-tone='info'] {
  color: var(--info);
  background: rgba(79, 193, 255, 0.12);
}

/* 有结论过期（代码/输入改后未重跑）：琥珀色提示，不再给绿色「全部 AC」 */
.verdict[data-tone='warn'] {
  color: var(--warn);
  background: rgba(201, 164, 92, 0.14);
}

.elapsed {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: var(--mono-font);
  font-size: 11px;
  color: var(--text-faint);
}

.cases {
  flex: 1 1 auto;
  min-height: 0;
  margin: 0;
  /* 横向 8px：列表与面板分隔条之间的留白。卡片自身已无外框（2026-10-24 晚），
     这 8px 现在只剩一件事：不让代码面贴上分隔条。
     顶部单独给 0（2026-10-13，用户要求「首个样例与首个文件离页头一样远」）：
     卡片头行自带 7px 上内边距 + 头行内容（22px 的折叠箭头盒）居中，所以卡片盒顶留 8px
     时首行墨迹比文件树低 10px。去掉这 8px 后——卡片头行盒顶 7px、内容中心 18px——
     与文件树（.explorer__tree 顶 6px、行文字中心 18px）两个口径同时对上（各差 1px）。
     ⚠️ 别把顶部补回 8px 去「和左右对齐」：左右那 8px 是给列表的横向余量，
     纵向没有对应的东西，补回来首行就又低 8px。 */
  padding: 0 8px 8px;
  list-style: none;
  display: flex;
  flex-direction: column;
  /* 留白即边界，且留白要匀（2026-10-24 晚）：卡片底色、外框、头部分隔线全部撤掉后，
     样例与样例之间只靠空白分开。2026-10-24 深夜底部那条单线也去掉，间距保持原样。
     账目：上侧 = .card__body 的下内边距 10 + .card 自身的下内边距 10 = 20；
     下侧 = 这里的 gap 10 + 下一张头栏的上内边距 2 + 标题在 32px 行内的居中余量约 8 = 20。
     改 gap 就要同步改那两处内边距，否则上下两半会一胖一瘦。 */
  gap: 10px;
  overflow-y: auto;
  overflow-x: hidden;
  /* 原生滚动条藏掉，由 useOverlayScrollbar 那条滑块接手（2026-10-13）：原生那条占掉 11px，
     卡片宽度会随它出现 / 消失变一下、折行位置跟着跳。标准属性 + 旧内核伪元素各写一条 */
  scrollbar-width: none;
  container-type: inline-size;
  /* 空态那行字是绝对定位的（见 .empty），这里给它一个基准盒 */
  position: relative;
}

.cases::-webkit-scrollbar {
  width: 0;
  height: 0;
}

/* 空态（2026-10-06 照参照稿改；2026-10-11 改定位）：一行居中的淡灰字。
   原来是个虚线框 + 底色 + 左对齐的一堆东西 —— 参照稿里根本没有框，那层虚线只是把
   一行字围起来，删掉之后空态才真的「空」。
   位置原来靠 `padding: 40px 0` 顶在列表最上面，现在整块摆到黄金分割靠上的那个分点上：
   绝对定位到「列表可视区高度的 38.2%」，再用 translateY(-50%) 让**这一块的中心**落在
   那个点上（不是顶边）。38.2% = 1 / 1.618²，与 61.8% 互为黄金分割的两个分点，
   略在可视区中心之上、构图更稳。
   分母是 .cases 的 padding box 高度：.cases 是滚动的列表容器，空态时里面没有任何
   内容、它的高度就是页头与页脚之间那整片可视区 —— 所以页头 / 页脚怎么改，这里都不用跟。
   left / right 给 0（吃不到 .cases 的 8px 横向内边距）不影响观感：这块是 text-align:
   center，两边多出的 8px 是对称的；它没有底色、不画框，视觉上仍在同一条中线上。 */
.empty {
  position: absolute;
  left: 0;
  right: 0;
  /* 38.2% 是「黄金分割点」，不是随手取的近似值 —— 改它等于改这条设计决定 */
  top: 38.2%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 6px;
  text-align: center;
}

.empty__title {
  margin: 0;
  font-size: 14px;
  /* 参照稿用的 text-muted，落到本项目的变量上就是最淡的那一档 */
  color: var(--text-faint);
}

/* 自动抓取样例那一路的提示：见模板里的说明 */
.empty__notice {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-dim);
}

.empty__notice[data-tone='info'] {
  color: var(--accent-strong);
}

.empty__notice[data-tone='warn'] {
  color: var(--warn);
}

/* 提示里的题目链接：与整行同字号同色系，只靠下划线表明「可点」，不抢戏 */
.empty__link {
  color: var(--accent-hover);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.empty__link:hover {
  color: var(--accent-strong);
}

/* 列表末尾那条「添加测试样例」（2026-10-23 从页脚搬进来）。
   `flex: 0 0 auto` 与卡片同一条纪律：列表溢出时不许被压矮。
   上下留白：gap 10 + 这里的 margin-top 10 = 20，与样例之间的「线到下一块」同距；
   底部 padding 8 由 .cases 出 —— 它不再是页脚里那颗需要自己撑间距的按钮。 */
.cases__add {
  flex: 0 0 auto;
  margin-top: 10px;
}

/* 空列表：按钮落回列表底部（也就是它原先在页脚正上方的位置）。
   空态文案是绝对定位在 38.2% 的，不占布局；这里靠 auto 外边距把这一项推到底，
   没有它按钮会紧贴列表顶端，看起来像是「空列表里孤零零一颗按钮」。 */
.cases.is-empty .cases__add {
  margin-top: auto;
}

.add {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  width: 100%;
  height: 32px;
  border-radius: 6px;
  font-size: 12.5px;
  /* 参考稿那种「Add New」框（2026-10-23，用户要求）：整宽、无底色、一圈极细虚线，
     「+ 添加测试样例」居中 —— 它读起来是列表末尾预留的一行空位，而不是又一颗彩色按钮。
     文字退到 --text-dim：虚线已经交代了「这里能加东西」，不必再靠颜色喊。 */
  color: var(--text-dim);
  background: transparent;
  border: 1px dashed var(--border-hairline);
  transition: border-color 0.16s ease, color 0.16s ease;
}

.add:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--border);
}

/* 三颗按钮的禁用态必须是同一档（2026-10-06）：原先 .add 是 0.5、.run-inline 是 0.45，
   两档差不出所以然，却会让「题解这类文件下按钮全灰」的那一屏看起来像两个不同的系统。
   .add 已在 2026-10-23 挪进列表，但它与页脚两颗仍是同一套语汇，这条注释仍然管三颗。 */
.add:disabled {
  opacity: 0.45;
  cursor: default;
}

.panel__foot {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  /* 左右 8px = .cases 的横向内边距：主操作条与列表里的卡片 / 「添加测试样例」同宽，
     页脚不再比上面窄 4px（2026-10-24） */
  padding: 10px 8px;
  /* 底色与面板同色（--bg-editor，即整页地面），照侧边栏页头那套「透明条」的做法（2026-10-23）：
     页脚不再是一块比正文亮一档的色斑，而是同一条地面的末段，剩下的按钮直接浮在上面。
     与正文的分界改由一条发丝线承担 —— 但它只在**还有内容压在下面**时才描出来
     （.is-more-below，判据在 script 的 syncFootEdge，与页头同一套显影语汇）。
     那条 border 常时也在、只是透明：显示 / 隐藏时不改盒高，页脚才不抖 1px。 */
  background: transparent;
  border-top: 1px solid transparent;
  transition: border-color 0.15s ease;
}

/* 列表没滚到底：页脚上沿浮出发丝线，交代「下面还有用例」。
   颜色与 Sidebar 页头那条滚动线同值（--border-soft），全站只有一种「滚动边界」的语汇。
   ⚠️ 判据与页头**相反**（页头是离了顶才画，页脚是没到底才画）—— 见 script 里那段说明 */
.panel__foot.is-more-below {
  border-top-color: var(--border-soft);
}

.panel__foot-row {
  display: flex;
  gap: 8px;
}

/* 不可运行的原因：说清楚就行，别用告警色 —— 编辑题解本来就不该有什么「出错」感 */
.run-blocked {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--text-faint);
}

.run-inline {
  /* 主操作条（2026-10-24 改）：从 32px 的线框图标改成整条图文按钮。
     `flex: 1 1 auto` 让它吃掉这一排的剩余宽度 —— 提交按钮不出现时就是通栏；
     出现时它也让出 36 + 8px 给提交那颗（提交在最左），主条仍占满其余宽度。
     宽高账：侧栏下限 158px 时页脚内容宽 142，主条 = 142 - 36 - 8 = 98px，
     内容「14(图标) + 7(间距) + 50(四个 12.5px 汉字)」= 71px，再加左右 24px 内边距 = 95px，
     刚好放得下（英文 Run all 更短）。所以这颗字不用藏；完整动作名与快捷键走原生 title
     （见脚本里的 runTitle，2026-10-24 凌晨加快捷键）。 */
  flex: 1 1 auto;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  height: 36px;
  padding: 0 12px;
  border-radius: 6px;
  font-size: 12.5px;
  /* 低饱和度主操作（2026-10-24 选定）：不描边、不做实底，只铺一层 --ok 的 12% 微光面
     （浅色主题见 base.css 的 8%）。面积与位置承担「这是这一栏的主按钮」，
     颜色只负责「跑」这个动作的身份；悬停把同一块面加深一档，不换色。 */
  color: var(--ok);
  background: var(--ok-face);
  border: 1px solid transparent;
  white-space: nowrap;
  transition: background-color 0.16s ease;
}

.run-inline:hover:not(:disabled) {
  background: var(--ok-face-hover);
}

.run-inline:disabled {
  opacity: 0.45;
  cursor: default;
}

/* 一键提交：与主条同高同圆角（36px / 6px），仍然是纯图标 + 发丝线 ——
   它是这一排的次要动作，不能和「运行全部」抢视觉权重。
   用 --accent 而不是运行那颗绿：「跑」和「交」是两件事，颜色分开才不用读 title 就知道点的是哪颗。
   禁用态与另外两颗同一档 0.45（见 .add 那条注释）。 */
.submit-inline {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border-radius: 6px;
  /* 与 .run-inline 同一种低对比语汇（2026-10-23 起；2026-10-29 用户要求把它也改成
     透明微光面并去掉描边，彻底对齐「运行全部」）：蓝色只留在图标上，底色是一层
     --accent 的低透明度面；「跑」与「交」仍靠色相区分，但这一排没有实心色块抢视线。 */
  color: var(--accent-text);
  background: var(--accent-face);
  border: 1px solid transparent;
  transition: background-color 0.16s ease, border-color 0.16s ease;
}

.submit-inline:hover:not(:disabled) {
  background: var(--accent-face-hover);
}

.submit-inline:disabled {
  opacity: 0.45;
  cursor: default;
}

/* 在途时轻微呼吸，表明「还在等 Codeforces」—— 没有这一步，慢的时候按钮看起来像坏了 */
.submit-inline.is-submitting {
  animation: submit-pulse 1.2s ease-in-out infinite;
}

@keyframes submit-pulse {
  0%,
  100% {
    opacity: 0.45;
  }
  50% {
    opacity: 0.85;
  }
}
</style>
