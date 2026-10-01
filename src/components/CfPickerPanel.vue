<template>
  <!-- 与设置同形态：编辑区里的一个合成页签（不是弹窗，见 services/editorViews.js）。
       版式走「工业引擎控制台」：整块是一张网格，靠 1px 线分割行与列，直角、无阴影、
       无留白；标签是 10px 大写暗灰，数值一律等宽字体；布尔值用分段按钮而不是开关。
       颜色走设计令牌 —— 本项目有浅色主题，写死 rgba(255,255,255,x) 会翻不过去。 -->
  <!-- data-native-focus：整片不参与 useMobileKeyboard 的保焦，走浏览器原生焦点。
       保焦是给「点按钮、点输出区都不收键盘」用的，而这块面板要的正好相反：点「抽取」
       「常用区间」「ON/OFF」时键盘该收掉；键盘自己的开关键收掉之后轻点别处也不该再弹。 -->
  <div class="cf-view" data-native-focus>
    <div class="cf-shell">
      <!-- 抬头：标题 + 状态（状态放这里，底下就只剩一颗按钮） -->
      <header class="cf-cell cf-cell--span cf-bar">
        <span class="cf-bar__title">{{ t('cf.button.label') }}</span>
        <span class="cf-status" :class="{ 'is-error': !!error }">{{ statusText }}</span>
      </header>

      <label class="cf-cell cf-cell--label">{{ t('cf.picker.fields.rating') }}</label>
      <div class="cf-cell cf-cell--value">
        <input
          v-model="ratingMin"
          class="cf-input cf-input--num"
          type="number"
          step="100"
          inputmode="numeric"
          :placeholder="t('cf.picker.fields.unlimited')"
          :aria-label="t('cf.picker.fields.ratingMin')"
        />
        <span class="cf-dash" aria-hidden="true">–</span>
        <input
          v-model="ratingMax"
          class="cf-input cf-input--num"
          type="number"
          step="100"
          inputmode="numeric"
          :placeholder="t('cf.picker.fields.unlimited')"
          :aria-label="t('cf.picker.fields.ratingMax')"
        />
        <span class="cf-presets">
          <button
            v-for="preset in RATING_PRESETS"
            :key="`${preset.min}-${preset.max}`"
            type="button"
            class="cf-chip"
            :class="{ 'is-on': ratingMin === String(preset.min) && ratingMax === String(preset.max) }"
            @click="applyPreset(preset)"
          >
            {{ preset.min }}-{{ preset.max }}
          </button>
        </span>
      </div>

      <label class="cf-cell cf-cell--label">{{ t('cf.picker.fields.tags') }}</label>
      <div class="cf-cell cf-cell--value">
        <input
          v-model="tags"
          class="cf-input cf-input--text"
          type="text"
          spellcheck="false"
          :placeholder="t('cf.picker.fields.tagsPlaceholder')"
        />
      </div>

      <label class="cf-cell cf-cell--label">{{ t('cf.picker.fields.count') }}</label>
      <div class="cf-cell cf-cell--value">
        <input
          v-model.number="count"
          class="cf-input cf-input--num"
          type="number"
          :min="COUNT_MIN"
          :max="COUNT_MAX"
          inputmode="numeric"
          :aria-label="t('cf.picker.fields.count')"
          @change="clampCount"
        />
      </div>

      <span class="cf-cell cf-cell--label">{{ t('cf.picker.options.preferNew') }}</span>
      <div class="cf-cell cf-cell--value">
        <span class="cf-seg" role="group" :aria-label="t('cf.picker.options.preferNew')">
          <button
            type="button"
            class="cf-seg__item"
            :class="{ 'is-on': preferNew }"
            :aria-pressed="preferNew"
            @click="preferNew = true"
          >
            {{ t('cf.picker.toggle.on') }}
          </button>
          <button
            type="button"
            class="cf-seg__item"
            :class="{ 'is-on': !preferNew }"
            :aria-pressed="!preferNew"
            @click="preferNew = false"
          >
            {{ t('cf.picker.toggle.off') }}
          </button>
        </span>
      </div>

      <span class="cf-cell cf-cell--label">{{ t('cf.picker.options.excludeSolved') }}</span>
      <div class="cf-cell cf-cell--value">
        <span class="cf-seg" role="group" :aria-label="t('cf.picker.options.excludeSolved')">
          <button
            type="button"
            class="cf-seg__item"
            :class="{ 'is-on': excludeSolved }"
            :aria-pressed="excludeSolved"
            @click="excludeSolved = true"
          >
            {{ t('cf.picker.toggle.on') }}
          </button>
          <button
            type="button"
            class="cf-seg__item"
            :class="{ 'is-on': !excludeSolved }"
            :aria-pressed="!excludeSolved"
            @click="excludeSolved = false"
          >
            {{ t('cf.picker.toggle.off') }}
          </button>
        </span>
      </div>

      <!-- 账号：勾了「排除已通过的题」才出现 -->
      <template v-if="excludeSolved">
        <label class="cf-cell cf-cell--label">{{ t('cf.picker.handle.label') }}</label>
        <div class="cf-cell cf-cell--value">
          <input
            v-model="handle"
            class="cf-input cf-input--text"
            type="text"
            spellcheck="false"
            autocapitalize="off"
            :placeholder="t('cf.picker.handle.placeholder')"
            @input="onHandleInput"
            @blur="onHandleBlur"
          />
          <span v-if="handleText" class="cf-status" :class="`is-${handleState}`">{{ handleText }}</span>
        </div>
      </template>

      <div class="cf-cell cf-cell--span cf-foot">
        <button type="button" class="cf-exec" :disabled="picking" @click="run">
          {{
            picking
              ? t('cf.picker.picking')
              : results.length
                ? t('cf.picker.action.again')
                : t('cf.picker.action.pick')
          }}
        </button>
      </div>
    </div>

    <!-- 抽取结果：另一张网格，一条结果一行 -->
    <section v-if="results.length" class="cf-results">
      <div class="cf-results__head">
        <span class="cf-section">{{ t('cf.picker.result.count', { n: results.length }) }}</span>
        <button
          type="button"
          class="cf-head-btn"
          :disabled="importingAll || allImported"
          @click="importAll"
        >
          {{ importingAll ? t('cf.picker.result.importing') : t('cf.picker.result.importAll') }}
        </button>
      </div>
      <ul class="cf-results__list">
        <li
          v-for="problem in results"
          :key="`${problem.contestId}-${problem.index}`"
          class="cf-result"
        >
          <span class="cf-result__id">
            CF{{ problem.contestId }}{{ String(problem.index).toUpperCase() }}
          </span>
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
 * CfPickerPanel —— Codeforces 随机抽题（可选模块）的视图。
 *
 * 【形态】与「设置」一样，是编辑区里的一个合成页签（见 services/editorViews.js），
 * 整块铺在编辑区内容层上，靠 v-show 与 Monaco 互斥。刻意不做成弹窗：与设置同形态
 * 更贴本项目的界面语言，也不遮住工作区。
 *
 * 【版式】工业引擎控制台那一路：整块是一张 grid，行与列都用 1px 线分割；
 * 全部直角（0 圆角）、无阴影、无外发光；标签 10px 大写暗灰、数值一律等宽字体；
 * 两个布尔值是分段按钮（ON | OFF）而不是开关。所有间距压到最小，不留白。
 *
 * 【颜色一律走设计令牌】不用 rgba(255,255,255,x) 这类字面量：本项目有浅色主题
 * （base.css 的 :root[data-theme='light']），白色系硬编码在浅色下会整体失效。
 *
 * 【开关不在这里】侧栏那颗骰子按钮与页签栏负责开关/切换，这里只渲染内容。
 *
 * 【表单/结果为什么留在常驻实例里】它由 EditorPane 用 v-show 常挂，切走再切回来
 * 表单值与抽到的题目都还在；偏好另有 usePersistentRef 落盘，刷新也不丢。
 */
import { computed, onBeforeUnmount, watch } from 'vue'

import AppIcon from './AppIcon.vue'
import { t } from '../i18n/index.js'
import { COUNT_MAX, COUNT_MIN, RATING_PRESETS } from '../cf/pick.js'
import { useCfPicker } from '../composables/useCfPicker.js'

const {
  ratingMin,
  ratingMax,
  tags,
  count,
  preferNew,
  excludeSolved,
  handle,
  stageText,
  handleText,
  handleState,
  clampCount,
  applyPreset,
  checkHandle,
  run,
  importOne,
  importAll,
  importState,
  picking,
  importingAll,
  error,
  results,
} = useCfPicker()

/** 这一批是不是全都导过了 —— 全导过就把「全部导入」停掉，免得点了没反应 */
const allImported = computed(
  () =>
    results.value.length > 0 &&
    results.value.every((problem) => importState(problem) === 'imported'),
)

/** 状态行：出错时给出错原因，否则报进度（空闲时是空串） */
const statusText = computed(() =>
  error.value ? t(error.value.key, error.value.params) : stageText.value,
)

// ------------------------------------------------------------ 账号校验的触发时机

/** 防抖计时器：边打字边发请求既费配额又容易乱序，停手 350ms 再问 */
let handleTimer = 0

function onHandleInput() {
  clearTimeout(handleTimer)
  handleTimer = setTimeout(() => {
    handleTimer = 0
    void checkHandle()
  }, 350)
}

/** 失焦立刻校验：用户准备去点「抽取」了，不该还在等防抖 */
function onHandleBlur() {
  clearTimeout(handleTimer)
  handleTimer = 0
  void checkHandle()
}

// 勾上「排除已通过的题」时，如果账号已经填过就直接校验一次，不用等用户再碰输入框
watch(excludeSolved, (on) => {
  if (on && handle.value.trim()) void checkHandle()
})

onBeforeUnmount(() => clearTimeout(handleTimer))
</script>

<style scoped>
/* 铺满编辑区内容层、自己滚动（与设置视图同款）。控制台不讲留白，边距压到最小 */
.cf-view {
  position: absolute;
  inset: 0;
  overflow-y: auto;
  padding: 12px;
}



/* ---------------- 网格 ---------------- */
/* 线只在「上 + 左」由容器给、其余每格自带上 + 左之外的两条边，
   于是网格线既不缺也不重（若每格都画四条，相邻两格会叠出 2px） */
.cf-shell {
  display: grid;
  grid-template-columns: 104px minmax(0, 1fr);
  max-width: 760px;
  border-top: 1px solid var(--border);
  border-left: 1px solid var(--border);
}

.cf-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 2px 8px;
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}

.cf-cell--span {
  grid-column: 1 / -1;
}

.cf-cell--label {
  color: var(--text-faint);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.cf-cell--value {
  flex-wrap: wrap;
  justify-content: flex-start;
  gap: 6px;
  padding: 2px 6px;
}

/* ---------------- 抬头 / 分区 / 底栏 ---------------- */
.cf-bar {
  justify-content: space-between;
  gap: 12px;
  background: var(--bg-panel-head);
}

.cf-bar__title {
  color: var(--text-dim);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.cf-section {
  color: var(--text-faint);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

/* 结果区：与上面的表单同宽（760px）并共用同一条左边线，两块才对得齐。
   边框照 .cf-shell 的规矩给：容器只负责「上 + 左」，每格自己带「右 + 下」，
   于是线既不缺也不重。抬头也算一格（它是一行的表头，不是浮在框外的标题）。 */
.cf-results {
  max-width: 760px;
  margin-top: 12px;
  border-top: 1px solid var(--border);
  border-left: 1px solid var(--border);
}

/* 结果区抬头：左边「抽中 N 道题」、右边「全部导入」 */
.cf-results__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 24px;
  padding: 2px 6px;
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  background: var(--bg-panel-head);
}

.cf-head-btn {
  height: 20px;
  padding: 0 8px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-dim);
  font-family: var(--ui-font);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
}

.cf-head-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--text);
}

.cf-head-btn:disabled {
  color: var(--text-faint);
  cursor: default;
}

.cf-foot {
  padding: 0;
}

.cf-exec {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 30px;
  background: var(--accent);
  color: var(--text-on-accent);
  font-family: var(--ui-font);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.cf-exec:hover:not(:disabled) {
  background: var(--accent-hover);
}

.cf-exec:disabled {
  background: var(--bg-control);
  color: var(--text-faint);
  cursor: default;
}

/* ---------------- 输入框：直角、等宽、无痕 ---------------- */
.cf-input {
  height: 22px;
  padding: 0 5px;
  border: 1px solid var(--border);
  background: var(--bg-input);
  color: var(--text);
  font-family: var(--mono-font);
  font-size: 11px;
}

.cf-input::placeholder {
  color: var(--text-faint);
}

.cf-input:focus {
  border-color: var(--focus);
  outline: none;
}

.cf-input--num {
  width: 58px;
  text-align: center;
}

.cf-input--text {
  width: 190px;
}

/* 数字框去掉原生上下箭头：step=100 的步进不好用，「常用区间」才是主要入口 */
.cf-input[type='number']::-webkit-outer-spin-button,
.cf-input[type='number']::-webkit-inner-spin-button {
  appearance: none;
  margin: 0;
}

.cf-dash {
  color: var(--text-faint);
  font-family: var(--mono-font);
  font-size: 11px;
}

/* ---------------- 常用区间 ---------------- */
.cf-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
}

.cf-chip {
  height: 18px;
  padding: 0 5px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-faint);
  font-family: var(--mono-font);
  font-size: 10px;
  line-height: 1;
  cursor: pointer;
}

.cf-chip:hover {
  border-color: var(--text-faint);
  color: var(--text-dim);
}

.cf-chip.is-on {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--text-on-accent);
}

/* ---------------- 分段按钮（替代开关） ---------------- */
.cf-seg {
  display: inline-flex;
  border: 1px solid var(--border);
}

.cf-seg__item {
  height: 20px;
  padding: 0 10px;
  background: transparent;
  color: var(--text-faint);
  font-family: var(--ui-font);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
}

.cf-seg__item + .cf-seg__item {
  border-left: 1px solid var(--border);
}

.cf-seg__item:hover:not(.is-on) {
  color: var(--text-dim);
}

.cf-seg__item.is-on {
  background: var(--accent);
  color: var(--text-on-accent);
}

/* ---------------- 状态 ---------------- */
.cf-status {
  min-width: 0;
  overflow: hidden;
  color: var(--text-faint);
  font-family: var(--mono-font);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cf-status.is-ok {
  color: var(--ok);
}

.cf-status.is-bad,
.cf-status.is-error {
  color: var(--fail);
}

/* ---------------- 抽取结果 ---------------- */
/* <ul> 的浏览器默认样式必须显式清掉：本项目没有全局 reset，默认的
   padding-inline-start: 40px 会把每一行右推 40px（左边一片空白、左边框与行错位断开），
   margin-block: 1em 会在抬头与框之间撑出一道缝 */
.cf-results__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

/* 列宽写死（而不是 auto）：每行各是一个独立的 grid，auto 会让各行的列宽互不相同、
   整列对不齐。所以低分题（没有 rating）与无标签题的格子也照常占位，只是内容为空。
   tags 列给 minmax(0, 180px) 而不是死 180px：窗口变窄时它得先让步，
   否则所有固定列加起来约 400px，比它窄就顶破边框 */
.cf-result {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr) minmax(0, 180px) 44px 68px 16px;
  align-items: center;
  gap: 8px;
  height: 26px;
  padding: 0 6px;
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  overflow: hidden;
  font-family: var(--mono-font);
  font-size: 11px;
}

.cf-result__id {
  color: var(--text-dim);
}

.cf-result__name {
  min-width: 0;
  overflow: hidden;
  color: var(--text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cf-result__tags {
  /* grid 项默认 min-width:auto，不减到 0 就会撑住列不肯变窄，窄窗口下顶破边框 */
  min-width: 0;
  overflow: hidden;
  color: var(--text-faint);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cf-result__rating {
  color: var(--text-dim);
  font-size: 10px;
}

/* 导入工作区：这一条结果的唯一动作，导过之后停用并转成「已导入」 */
.cf-result__import {
  height: 18px;
  padding: 0 6px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-dim);
  font-family: var(--ui-font);
  font-size: 10px;
  line-height: 1;
  cursor: pointer;
  /* 列宽是固定的，按钮又是 grid 项：文案超出时若不截断会折成两行，把 26px 的行撑高 */
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.cf-result__import:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--text);
}

/* 导入完成：边框收掉（不再是可点的样子），转成完成的绿色 */
.cf-result__import.is-imported {
  border-color: transparent;
  color: var(--ok);
  cursor: default;
}

.cf-result__link {
  display: inline-flex;
  color: var(--text-faint);
}

.cf-result__link:hover {
  color: var(--accent);
}
</style>
