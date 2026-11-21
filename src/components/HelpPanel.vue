<script setup>
import { computed } from 'vue'
import { locale, messages, t } from '../i18n/index.js'
import { openTestsGuide } from '../services/testsGuide.js'

/**
 * HelpPanel —— 「帮助」这一组设置的正文。
 *
 * 原先是顶栏「?」按钮打开的右侧抽屉（按钮 + Teleport + 遮罩 + 滑入动画 + 「完成」按钮），
 * 2026-09 并入设置视图后只留正文：内容是 i18n 里的问答列表 + 完整指南链接。
 * 没有 props / emits —— 开关归设置页签管，所以这里也不再有 Esc 关闭那套键盘逻辑。
 *
 * 【文案体例】正文本身在 messages/help.js，体例说明也搬到了那个文件的文件头。
 */

// 帮助的全部正文来自 i18n（messages/help.js），按当前语言取**整棵树**：
// 这份内容是「数据」而不是界面，逐条 t() 反而更绕。改文案去 messages/help.js，
// 它同时也是 guide.html / docs/使用手册.md 的同步义务方。
const GROUPS = computed(() => messages('help').groups)

/** 完整指南是中 / 英两份静态页，跟着界面语言跳（英文那份见 Task: guide.en.html） */
const guideHref = computed(() => (locale.value === 'en' ? '/guide.en.html' : '/guide.html'))

// 正文里用 **…** 标记加粗。不走 v-html：文案里会出现 <vector> 这类头文件名，
// 交给 HTML 解析会被当成标签吃掉。
function segments(text) {
  return String(text)
    .split(/\*\*(.+?)\*\*/g)
    .map((part, index) => ({ text: part, bold: index % 2 === 1 }))
    .filter((part) => part.text !== '')
}
</script>

<template>
  <div class="help-content">
    <!-- 站点提示：置顶一条。它不是帮助条目，讲的是站点自己的进度，所以不走卡片那套版式 -->
    <p class="help-notice">
      {{ t('settings.help.notice') }}
      <a
        class="help-notice__link"
        href="https://blog.998244353.best/comments/"
        target="_blank"
        rel="noopener noreferrer"
        >https://blog.998244353.best/comments/</a
      >
    </p>

    <section v-for="group in GROUPS" :key="group.title" class="help-group">
      <h3 class="help-group__title">{{ group.title }}</h3>

      <ul class="help-list">
        <li v-for="item in group.items" :key="item.name" class="help-item">
          <p class="help-item__name">{{ item.name }}</p>
          <p class="help-item__role">{{ item.role }}</p>

          <!-- 操作指南：数字列表（1. 2. 3.） -->
          <ol v-if="item.steps?.length" class="help-item__steps">
            <li v-for="(step, index) in item.steps" :key="index">
              <span
                v-for="(part, partIndex) in segments(step)"
                :key="partIndex"
                :class="{ 'is-bold': part.bold }"
              >{{ part.text }}</span>
            </li>
          </ol>

          <div v-if="item.table" class="help-table-wrap">
            <table class="help-table">
              <thead>
                <tr>
                  <th v-for="(cell, index) in item.table.head" :key="index">{{ cell }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, rowIndex) in item.table.rows" :key="rowIndex">
                  <td v-for="(cell, cellIndex) in row" :key="cellIndex">{{ cell }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- 要点 / 口径 / 限制：圆点列表 -->
          <ul v-if="item.notes?.length" class="help-item__points">
            <li v-for="(note, index) in item.notes" :key="index">
              <!-- 正文里用 **…** 标记加粗。不走 v-html：文案里会出现 <vector> 这类
                   头文件名，交给 HTML 解析会被当成标签吃掉 -->
              <span
                v-for="(part, partIndex) in segments(note)"
                :key="partIndex"
                :class="{ 'is-bold': part.bold }"
              >{{ part.text }}</span>
            </li>
          </ul>
        </li>
      </ul>
    </section>

    <div class="help-actions">
      <button type="button" class="guide-link guide-link--action" @click="openTestsGuide">
        {{ t('settings.help.replayTestsGuide') }}
      </button>
      <a class="guide-link" :href="guideHref">{{ t('settings.help.guideLink') }}</a>
    </div>
  </div>
</template>

<style scoped>
.help-content {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 2px 18px 18px;
}

/* 置顶的站点提示：左侧一道主色竖条 + 淡底，一眼能与下面的问答卡片区分开
   —— 它不是一条帮助内容，说的是站点本身。地址会很长，允许在任意处断行 */
.help-notice {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--border-hairline);
  border-left: 2px solid var(--accent);
  border-radius: 6px;
  background: var(--bg-panel);
  font-size: 12px;
  line-height: 1.65;
  color: var(--text-dim);
}

.help-notice__link {
  color: var(--accent);
  text-decoration: none;
  word-break: break-all;
}

:where(html.is-hoverable) .help-notice__link:hover {
  text-decoration: underline;
}

.help-group__title {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--text-dim);
}

.help-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

/* 每条功能一张卡：名称 / 作用 / 操作要点，三层信息靠字号与颜色拉开层次 */
.help-item {
  padding: 12px 14px;
  border: 1px solid var(--border-hairline);
  border-radius: 6px;
  background: var(--bg-panel);
}

/* 小标题一律是疑问句（见 GROUPS 的体例说明） */
.help-item__name {
  margin: 0 0 4px;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.4;
  color: var(--text);
}

.help-item__role {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text-dim);
}

/* 操作步骤：必须是有序列表（1. 2. 3.） */
.help-item__steps,
.help-item__points {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.65;
  color: var(--text-dim);
}

.help-item__steps {
  padding-left: 18px;
  list-style: decimal;
}

.help-item__points {
  padding-left: 15px;
  list-style: disc;
}

.help-item__steps li + li,
.help-item__points li + li {
  margin-top: 2px;
}

.help-item .is-bold {
  font-weight: 600;
  color: var(--text);
}

/* 口径表：判定码、性能实测这类「多列短值」。窄宽度下整张表自己横向滚，
   不挤压所在的设置分组（同 guide.html 的 .table-wrap 思路）。 */
.help-table-wrap {
  margin-top: 8px;
  overflow-x: auto;
  border: 1px solid var(--border-hairline);
  border-radius: 6px;
}

.help-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--text-dim);
}

.help-table th,
.help-table td {
  padding: 6px 8px;
  text-align: left;
  border-bottom: 1px solid var(--border-faint);
}

.help-table th {
  background: var(--bg-panel-head);
  color: var(--text-dim);
  font-weight: 600;
  white-space: nowrap;
}

.help-table tbody tr:last-child td {
  border-bottom: 0;
}

/* 第一列是名字，允许折行；后面几列都是短值，禁止折行 */
.help-table th:not(:first-child),
.help-table td:not(:first-child) {
  white-space: nowrap;
}

/* 底部两条出口：重看交互式评测岛引导 / 完整指南（静态页） */
.help-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
}

/* 指向根目录 guide.html：设置里只放精简版，完整版是那一页 */
.guide-link {
  font-size: 13px;
  color: var(--accent);
  text-decoration: none;
}

/* 重看引导是一颗真按钮：清掉按钮默认的边框 / 底色，只借 .guide-link 的字色 */
.guide-link--action {
  padding: 0;
  border: 0;
  background: transparent;
  font-family: inherit;
  cursor: pointer;
}

:where(html.is-hoverable) .guide-link:hover {
  color: var(--accent-hover);
  text-decoration: underline;
}
</style>
