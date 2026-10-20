<template>
  <!-- 与抽题面板同形态：编辑区里的一个合成页签（见 services/editorViews.js），
       版式沿用「工业引擎控制台」（共享样式见 src/styles/cf-console.css）。
       data-native-focus：与抽题面板同一口径，点输入框 / 按钮时键盘该收掉。 -->
  <div class="cf-view" data-native-focus>
    <div class="cf-shell">
      <!-- 抬头：标题 + 状态（倒计时挂在这一行，见 useCfContest 的 statusText） -->
      <header class="cf-cell cf-cell--span cf-bar">
        <span class="cf-bar__title">{{ t('cf.contest.title') }}</span>
        <span class="cf-status" :class="{ 'is-error': !!error }">{{ statusText }}</span>
      </header>

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
          {{ busy ? t('cf.contest.status.loading') : t('cf.contest.action.load') }}
        </button>
      </div>
    </div>

    <!-- 空态说明（还没开赛 / 这场没有题目列表）：只在这一块说，不占上面那行倒计时 -->
    <p v-if="problemsNote" class="cf-contest__note cf-contest__note--block">
      {{ t(problemsNote.key) }}
    </p>

    <!-- 本场题目：抬头左边是比赛名（链去 Codeforces）、右边是抓样例与全部导入 -->
    <section v-if="problems.length" class="cf-results">
      <div class="cf-results__head">
        <a :href="url" target="_blank" rel="noreferrer" class="cf-contest__name">{{ title }}</a>
        <span class="cf-results__actions">
          <span v-if="scrapeNote" class="cf-contest__note">{{ scrapeNote }}</span>
          <button
            v-if="scrapeAvailable"
            type="button"
            class="cf-head-btn"
            :disabled="scraping"
            @click="scrapeSamples"
          >
            {{ scraping ? t('cf.contest.action.scraping') : t('cf.contest.action.scrape') }}
          </button>
          <button
            type="button"
            class="cf-head-btn"
            :disabled="importingAll || allImported"
            @click="importAll"
          >
            {{ importingAll ? t('cf.picker.result.importing') : t('cf.picker.result.importAll') }}
          </button>
        </span>
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
            {{ t(`cf.picker.result.${importState(problem)}`) }}
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
  </div>
</template>

<script setup>
/**
 * CfContestPanel —— Codeforces 比赛（贴链接 → 倒计时 → 题目列表 → 导入 / 抓样例）。
 *
 * 【形态】与「设置」「抽题」同形态，是编辑区里的一个合成页签（services/editorViews.js
 * 的 cfContest 视图）。2026-10-19 起从抽题面板里拆出来单飞：入口在侧栏那颗 Codeforces
 * 按钮唤出的组件菜单（CfMenu）里，与「随机抽题」并列。
 *
 * 【状态在哪】数据与过程全在 useCfContest，**只在本组件的 setup 里调一次**（与
 * useCfPicker 只归 CfPickerPanel 同一条纪律）—— 本组件由 EditorPane 用 v-show 常挂，
 * 切走再切回来，输入框里那场与题目列表都还在；specText 另有 usePersistentRef 落盘。
 *
 * 【版式】控制台网格是两个面板共用的（src/styles/cf-console.css），本文件只放
 * 比赛自己特有的两条规则。
 */
import AppIcon from './AppIcon.vue'
import { t } from '../i18n/index.js'
import { useCfContest } from '../composables/useCfContest.js'

const {
  specText,
  load,
  busy,
  error,
  problems,
  problemsNote,
  url,
  title,
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

/* 抬头行里与空态共用的说明小字：它是句子不是标签，不吃控制台的大写与字距 */
.cf-contest__note {
  flex: none;
  color: var(--text-faint);
  font-size: 10px;
}

/* 空态那句单独占一行（抬头行的 note 是并列的小字，这里是整段说明） */
.cf-contest__note--block {
  max-width: 760px;
  margin: 12px 0 0;
  padding: 2px 6px;
  border-top: 1px solid var(--border);
  border-left: 1px solid var(--border);
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  line-height: 1.5;
}
</style>

<style scoped src="../styles/cf-console.css"></style>
