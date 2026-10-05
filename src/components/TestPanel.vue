<script setup>
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import SidebarSwitcher from './SidebarSwitcher.vue'
import TestCaseCard from './TestCaseCard.vue'
import { t } from '../i18n/index.js'

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
   * 空态里追加的一行提示，没有就是 null（非题目文件、或样例已经在了）。两种形状：
   *   { text, tone }                            —— 纯文本（正在抓 / 抓失败）
   *   { before, linkText, after, url, tone }    —— 中间带一个可点的题目链接（还没到手）
   * tone：'' 走常态的暗灰，'info' 是进行中，'warn' 是失败。
   */
  notice: { type: Object, default: null },
})

const emit = defineEmits(['add', 'remove', 'run-one', 'run-all'])

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
const verdict = computed(() => {
  const total = props.cases.length
  if (!total) return { text: t('tests.verdict.noCases'), tone: 'muted' }
  if (counts.value.running) return { text: t('tests.verdict.running'), tone: 'info' }
  // 有结论过期就报不出确切的通过数，用 ? 代替（卡片各自标明哪些待刷新）
  if (counts.value.stale) return { text: t('tests.verdict.stale', { total }), tone: 'warn' }
  if (counts.value.passed === total) return { text: t('tests.verdict.allPassed'), tone: 'passed' }
  const tone = counts.value.error ? 'error' : counts.value.failed ? 'failed' : 'muted'
  return { text: t('tests.verdict.partial', { passed: counts.value.passed, total }), tone }
})

// 有过期结论时，页头耗时同样来自上一轮，跟着藏掉，免得和「结果待刷新」自相矛盾
const elapsedText = computed(() => {
  if (!props.elapsed || counts.value.stale) return ''
  return props.elapsed >= 1000 ? `${(props.elapsed / 1000).toFixed(2)}s` : `${props.elapsed}ms`
})
</script>

<template>
  <section class="panel" :aria-label="t('tests.panel.ariaLabel')">
    <header class="panel__head">
      <SidebarSwitcher />
      <div class="panel__heading">
        <span class="verdict" :data-tone="verdict.tone">{{ verdict.text }}</span>
        <span
          v-if="elapsedText"
          class="elapsed"
          :title="t('tests.elapsedTitle', { time: elapsedText })"
        >
          <AppIcon name="clock" :size="11" />{{ elapsedText }}
        </span>
      </div>
    </header>

    <ul class="cases">
      <li v-if="!cases.length" class="empty">
        <!-- 空态只有这一行（2026-10-06）：原先还有一句「点击下方按钮新增一个用例…」和一颗
             「添加第一个用例」大按钮，前者是废话、后者与页脚那颗「添加测试样例」重复。
             这句话**写死英文、两套界面语言都一样**（用户 2026-10-06 定，参照稿里就是这行
             居中的淡灰字）：与三个小标题 input / Expected / Actual 同一个理由 —— 它是一句
             格式固定的状态语，翻成中文反而与整块面板的英文标签混搭。所以它**不在消息表里**。
             抓样提示（notice）保留 —— 它是插件自动抓样例那一路唯一的反馈，且仍按语言翻。 -->
        <p class="empty__title">No test cases yet.</p>
        <!-- 空态就这一行：跑不了的原因不在这里解释（那行字在页脚），这一栏越干净越好。
             抓样那三条提示仍然照旧（它们说的是「样例为什么还没到手」，与能不能运行无关）。 -->
        <p v-if="notice" class="empty__notice" :data-tone="notice.tone">
          <!-- 带题目链接的形状：before + <a> + after 三段拼成一句（另两段是纯文本，见 props 说明） -->
          <template v-if="notice.url">
            {{ notice.before
            }}<a class="empty__link" :href="notice.url" target="_blank" rel="noopener noreferrer">{{
              notice.linkText
            }}</a
            >{{ notice.after }}
          </template>
          <template v-else>{{ notice.text }}</template>
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
    </ul>

    <footer class="panel__foot">
      <!-- 置灰的按钮在浏览器里收不到鼠标事件，title 也就悬不出来 ——
           所以「为什么不能运行」必须写成一行看得见的字，不能只塞进 title -->
      <p v-if="runBlocked" class="run-blocked">{{ runBlocked }}</p>
      <div class="panel__foot-row">
        <!-- 跑不了的活跃文件也加不出用例：用例是挂在活跃文件上的（写进它的 config.tests），
             题解这类文件根本没有能跑它们的地方 —— 与两个 ▶ 一起置灰，别让这一颗还亮着 -->
        <button class="add" @click="emit('add')" :disabled="running || Boolean(runBlocked)">
          <AppIcon name="plus" :size="14" />
          <span>{{ t('tests.panel.addCase') }}</span>
        </button>
        <button
          class="run-inline"
          :disabled="running || !cases.length || Boolean(runBlocked)"
          :title="runBlocked || t('tests.panel.runAll')"
          @click="emit('run-all')"
        >
          <AppIcon name="play" :size="13" />
        </button>
      </div>
    </footer>
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
  background: var(--bg-panel);
}

.panel__head {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  /* 左侧是「资源管理器 / 评测样例」切换入口，右侧只剩徽标与耗时；
     与资源管理器页头同高（min-height 35px）；挤不下时整体换行而不是让徽标溢出自己的盒子 */
  flex-wrap: wrap;
  gap: 10px;
  row-gap: 4px;
  min-height: 35px;
  padding: 4px 10px 4px 4px;
  /* 同资源管理器页头：不铺底纹、不画分隔线（2026-10-04）——
     展开的侧栏最上一条本来就该和正文同色，见 FileExplorer 的 .explorer__head */
  background: transparent;
}

.panel__heading {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  /* 换行后单独占一行时仍然贴右（不写会在换行那一行落到左边） */
  margin-left: auto;
}

.verdict {
  padding: 1px 8px;
  border-radius: 999px;
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
  /* 12px → 8px：卡片改成无边框之后，两边这 12px 纯粹是把用例往里挤，
     收到 8px 就换回来 8px 实际宽度（再多贴边就顶到面板与分隔条上了） */
  padding: 8px;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  overflow-x: hidden;
  container-type: inline-size;
}

/* 空态（2026-10-06 照参照稿改）：一行居中的淡灰字，上下各 40px 留白。
   原来是个虚线框 + 底色 + 左对齐的一堆东西 —— 参照稿里根本没有框，那层虚线只是把
   一行字围起来，删掉之后空态才真的「空」。 */
.empty {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 40px 0;
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

.add {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  width: 100%;
  height: 32px;
  border-radius: 6px;
  font-size: 12.5px;
  color: var(--info-soft-text);
  background: var(--info-soft-bg);
  border: 1px solid var(--info-soft-border);
  transition: background-color 0.16s ease, border-color 0.16s ease;
}

.add:hover:not(:disabled) {
  background: var(--info-soft-bg-hover);
  border-color: var(--info-soft-border-hover);
}

/* 页脚两颗按钮的禁用态必须是同一档（2026-10-06）：原先 .add 是 0.5、.run-inline 是 0.45，
   两档差不出所以然，却会让「题解这类文件下三颗按钮全灰」的那一屏看起来像两个不同的系统。 */
.add:disabled {
  opacity: 0.45;
  cursor: default;
}

.panel__foot {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  /* 不再画上边那条发丝线（2026-10-06）：页脚底色本来就是 --bg-panel-head，与正文的
     --bg-panel 不同，这层色差已经把「这里是页脚」说清楚了，再描一条线是重复的分隔。 */
  background: var(--bg-panel-head);
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
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 32px;
  padding: 0 14px;
  border-radius: 6px;
  font-size: 12.5px;
  color: var(--text-on-accent);
  background: var(--run-green);
  transition: background-color 0.16s ease;
}

.run-inline:hover:not(:disabled) {
  background: var(--run-green-hover);
}

.run-inline:disabled {
  opacity: 0.45;
  cursor: default;
}
</style>
