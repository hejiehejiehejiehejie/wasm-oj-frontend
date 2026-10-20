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
 * 【开关不在这里】侧栏那颗 Codeforces 按钮唤出组件菜单（CfMenu，菜单项与比赛并列），
 * 页签栏负责开关/切换，这里只渲染内容。
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
/* 控制台网格、输入框、状态行、结果列表这些两个面板共用的版式在
   src/styles/cf-console.css（本组件用下面的 <style src> 挂同一份，改一处两边生效）；
   这里只放随机抽题特有的控件。颜色一律走设计令牌（本项目有浅色主题）。 */
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
</style>

<style scoped src="../styles/cf-console.css"></style>
