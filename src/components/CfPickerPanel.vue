<template>
  <!-- 与设置同形态：编辑区里的一个合成页签（不是弹窗，见 services/editorViews.js）。
       2026-10-28 改版：表单收进一张卡片（比地面亮一档的 --bg-panel + 10px 圆角），
       标签压到控件上方、所有控件共用同一条左缘；数量是步进器，两个布尔值是开关；
       主操作是沉稳的单色深蓝面。颜色一律走设计令牌（浅色主题见 base.css）。 -->
  <!-- data-native-focus：整片不参与 useMobileKeyboard 的保焦，走浏览器原生焦点。
       保焦是给「点按钮、点输出区都不收键盘」用的，而这块面板要的正好相反：点「抽取」
       「常用区间」时键盘该收掉；键盘自己的开关键收掉之后轻点别处也不该再弹。 -->
  <div class="cf-view" data-native-focus>
    <div class="cf-page cf-page--wide">
      <div class="pk-layout">
        <!-- 左参数舱：330px，桌面上粘在上缘；窄容器折到上面（见文件末尾容器查询） -->
        <form class="pk-form pk-rail" @submit.prevent="run">
        <!-- 表单整块收进一张卡片：比地面亮一档的面 + 10px 圆角。
             2026-10-29 第三版：卡片里**只剩一种行形态** —— 标签在左、控件在右。
             难度与标签原来把标签压在控件上方，而下方的数量 / 两个开关都是一左一右，
             同一张卡片里两种纵向节奏，怎么调参数看着都不齐（用户当面指出两次）。 -->
        <div class="pk-card">
          <div class="pk-field">
            <label class="pk-label" for="pk-rating-min">{{ t('cf.picker.fields.rating') }}</label>
            <div class="pk-field__body">
              <!-- 难度是一行字，不是一只盒子（2026-10-29 第四版，用户口径「太笨重」）：
                   两块输入并排、中间一条短横，**平时没有底也没有描边** —— 静止时它只是
                   `1500 – 2100` 这一行等宽数字，与左边字段名排在同一行；指针压上来或键盘
                   进来时才浮出一层几乎看不见的淡底，把它「显影」成可编辑控件。
                   常用区间与标签一样默认折叠：箭头钉在这一行的最右端，与标签行那颗同一个
                   位置、同一种亮度语言。 -->
              <div class="pk-row-head">
                <div class="pk-range" :class="{ 'is-empty': !ratingDirty }">
                  <input
                    id="pk-rating-min"
                    v-model="ratingMin"
                    class="pk-range__input"
                    type="number"
                    step="100"
                    inputmode="numeric"
                    :placeholder="t('cf.picker.fields.unlimited')"
                    :aria-label="t('cf.picker.fields.ratingMin')"
                  />
                  <span v-if="ratingDirty" class="pk-range__dash" aria-hidden="true">–</span>
                  <input
                    id="pk-rating-max"
                    v-model="ratingMax"
                    class="pk-range__input"
                    type="number"
                    step="100"
                    inputmode="numeric"
                    :placeholder="ratingDirty ? t('cf.picker.fields.unlimited') : ''"
                    :aria-label="t('cf.picker.fields.ratingMax')"
                  />
                </div>
                <button
                  type="button"
                  class="pk-fold"
                  :class="{ 'is-open': presetsOpen }"
                  :aria-expanded="presetsOpen"
                  :aria-label="presetsOpen ? t('cf.picker.fields.tagsCollapse') : t('cf.picker.fields.tagsExpand')"
                  :title="presetsOpen ? t('cf.picker.fields.tagsCollapse') : t('cf.picker.fields.tagsExpand')"
                  aria-controls="pk-rating-presets"
                  @click="presetsOpen = !presetsOpen"
                >
                  <AppIcon name="chevron" :size="14" class="pk-fold__icon" />
                </button>
              </div>
              <!-- 常用区间：等宽网格（2026-10-29）。五个区间在控件列里排成整齐的格子，
                   与范围框左右缘严丝合缝；列数由 minmax(74px, 1fr) 自己算（宽时 3 列、
                   窄时 2 列），不靠媒体查询硬折。 -->
              <span
                v-show="presetsOpen"
                id="pk-rating-presets"
                class="pk-presets"
                role="group"
                :aria-label="t('cf.picker.fields.presets')"
              >
                <button
                  v-for="preset in RATING_PRESETS"
                  :key="`${preset.min}-${preset.max}`"
                  type="button"
                  class="cf-chip pk-chip"
                  :class="{ 'is-on': ratingMin === String(preset.min) && ratingMax === String(preset.max) }"
                  @click="applyPreset(preset)"
                >
                  {{ preset.min }}–{{ preset.max }}
                </button>
              </span>
            </div>
          </div>

          <!-- 比赛类别（2026-11-08）：Div. 1 / 2 / 3 / 4、Edu、Div. 1+2、Global、Others。
               判据在 cf/pick.js 的 contestCategory（CF 接口没有这个字段，只能按比赛名判，
               与 cftracker 的 ContestCat 同一套）。
               形态与难度、标签一致（同日用户口径「做成和难度、标签一样可折叠的」）：
               右端一颗箭头，掀开才是八颗芯片；收起时这一行念已选的那几类，
               一个都没选就念「不限」—— 与标签行同一种读法。 -->
          <div class="pk-field">
            <span class="pk-label">{{ t('cf.picker.fields.contest') }}</span>
            <div class="pk-field__body">
              <div class="pk-row-head">
                <p
                  class="pk-selected"
                  :class="{ 'is-empty': !selectedDivisions.length }"
                  :title="divisionSummary"
                >
                  {{ divisionSummary || t('cf.picker.fields.unlimited') }}
                </p>
                <!-- 这两句就是通用的「展开 / 收起」（难度、标签、比赛、题号四处共用），
                     键名带 tags 是历史遗留 —— 不新开一份同文案的键，免得四处要同步改。 -->
                <button
                  type="button"
                  class="pk-fold"
                  :class="{ 'is-open': catsOpen }"
                  :aria-expanded="catsOpen"
                  :aria-label="catsOpen ? t('cf.picker.fields.tagsCollapse') : t('cf.picker.fields.tagsExpand')"
                  :title="catsOpen ? t('cf.picker.fields.tagsCollapse') : t('cf.picker.fields.tagsExpand')"
                  aria-controls="pk-contest-cats"
                  @click="catsOpen = !catsOpen"
                >
                  <AppIcon name="chevron" :size="14" class="pk-fold__icon" />
                </button>
              </div>
              <span
                v-show="catsOpen"
                id="pk-contest-cats"
                class="pk-cats"
                role="group"
                :aria-label="t('cf.picker.fields.contest')"
              >
                <button
                  v-for="cat in CONTEST_CATS"
                  :key="cat"
                  type="button"
                  class="cf-chip pk-chip"
                  :class="{ 'is-on': selectedDivisions.includes(cat) }"
                  :aria-pressed="selectedDivisions.includes(cat)"
                  @click="toggleDivision(cat)"
                >
                  {{ t(`cf.picker.cats.${cat}`) }}
                </button>
              </span>
            </div>
          </div>

          <!-- 题号（2026-11-08）：A–M 一格一个字母，13 格排成一条（列数写死 13，
               见 .pk-letters）—— 等距的一排才读得成「第几题」这条轴，换行会断。
               只取 index 的首字母，所以 `B1` / `B2` 也算 B 题。
               同样是折叠形态；摘要把连续的字母压成区间（`A–C · F`），见 letterSummary。 -->
          <div class="pk-field">
            <span class="pk-label">{{ t('cf.picker.fields.letter') }}</span>
            <div class="pk-field__body">
              <div class="pk-row-head">
                <p
                  class="pk-selected"
                  :class="{ 'is-empty': !selectedLetters.length }"
                  :title="letterSummary"
                >
                  {{ letterSummary || t('cf.picker.fields.unlimited') }}
                </p>
                <button
                  type="button"
                  class="pk-fold"
                  :class="{ 'is-open': lettersOpen }"
                  :aria-expanded="lettersOpen"
                  :aria-label="lettersOpen ? t('cf.picker.fields.tagsCollapse') : t('cf.picker.fields.tagsExpand')"
                  :title="lettersOpen ? t('cf.picker.fields.tagsCollapse') : t('cf.picker.fields.tagsExpand')"
                  aria-controls="pk-letter-options"
                  @click="lettersOpen = !lettersOpen"
                >
                  <AppIcon name="chevron" :size="14" class="pk-fold__icon" />
                </button>
              </div>
              <span
                v-show="lettersOpen"
                id="pk-letter-options"
                class="pk-letters"
                role="group"
                :aria-label="t('cf.picker.fields.letter')"
              >
                <button
                  v-for="letter in PROBLEM_LETTERS"
                  :key="letter"
                  type="button"
                  class="cf-chip pk-chip"
                  :class="{ 'is-on': selectedLetters.includes(letter) }"
                  :aria-pressed="selectedLetters.includes(letter)"
                  @click="toggleLetter(letter)"
                >
                  {{ letter }}
                </button>
              </span>
            </div>
          </div>

          <div class="pk-field">
            <span class="pk-label">{{ t('cf.picker.fields.tags') }}</span>
            <div class="pk-field__body">
              <!-- 这一行只交代「值」：左边已选、右边展开按钮。
                   已选标签与抽到的题目那一行同一种读法（灰字、` · ` 分隔），空的时候说「不限」；
                   手输过、但不在预设里的标签也在这里念出来（见 tagOptions）。 -->
              <div class="pk-row-head">
                <p
                  class="pk-selected"
                  :class="{ 'is-empty': !selectedTags.length }"
                  :title="selectedTags.join(' · ')"
                >
                  {{ selectedTags.length ? selectedTags.join(' · ') : t('cf.picker.fields.unlimited') }}
                </p>
                <!-- 常用标签默认折叠（2026-10-29 用户口径）：十二颗芯片铺开要占四五行，
                     而这一项大部分时候是「不限」。右端只留一枚箭头（同日去掉「展开 / 收起」
                     两个字），它贴在这一行的最右端，与下面各行的控件共用同一条右缘。 -->
                <button
                  type="button"
                  class="pk-fold"
                  :class="{ 'is-open': tagsOpen }"
                  :aria-expanded="tagsOpen"
                  :aria-label="tagsOpen ? t('cf.picker.fields.tagsCollapse') : t('cf.picker.fields.tagsExpand')"
                  :title="tagsOpen ? t('cf.picker.fields.tagsCollapse') : t('cf.picker.fields.tagsExpand')"
                  aria-controls="pk-tag-options"
                  @click="tagsOpen = !tagsOpen"
                >
                  <AppIcon name="chevron" :size="14" class="pk-fold__icon" />
                </button>
              </div>
              <!-- 常用标签：点选切换（2026-10-29 由手输逗号串改来）。芯片高度 / 圆角与
                   上面的常用区间一致，只是宽度跟着标签名走 —— 标签本身就是长短不一的词，
                   强行等宽会把 `two pointers` 挤成省略号。 -->
              <span
                v-show="tagsOpen"
                id="pk-tag-options"
                class="pk-tags"
                role="group"
                :aria-label="t('cf.picker.fields.tagPresets')"
              >
                <button
                  v-for="tag in tagOptions"
                  :key="tag"
                  type="button"
                  class="cf-chip pk-chip"
                  :class="{ 'is-on': selectedTags.includes(tag) }"
                  :aria-pressed="selectedTags.includes(tag)"
                  @click="toggleTag(tag)"
                >
                  {{ tag }}
                </button>
              </span>
            </div>
          </div>

          <!-- 数量与两个开关并成一列「行」（2026-10-29）：标签在左、控件在右，
               与设置面板的行同一种读法。原来「左边孤零零一个步进器、右边两行开关」
               的两列，标签一高一低、开关右缘参差，在 330px 里看着是散的 -->
          <div class="pk-rows">
            <div class="pk-row">
              <label class="pk-label pk-label--row" for="pk-count">{{ t('cf.picker.fields.count') }}</label>
              <!-- 1–10 的范围很小：步进器比手动输入直观，也不会有「输了个 37」这种越界 -->
              <div class="pk-stepper">
                <button
                  type="button"
                  class="pk-stepper__btn"
                  :disabled="Number(count) <= COUNT_MIN"
                  :aria-label="t('cf.picker.fields.decrease')"
                  @click="stepCount(-1)"
                >
                  −
                </button>
                <input
                  id="pk-count"
                  v-model.number="count"
                  class="pk-stepper__value"
                  type="number"
                  :min="COUNT_MIN"
                  :max="COUNT_MAX"
                  inputmode="numeric"
                  :aria-label="t('cf.picker.fields.count')"
                  @change="clampCount"
                />
                <button
                  type="button"
                  class="pk-stepper__btn"
                  :disabled="Number(count) >= COUNT_MAX"
                  :aria-label="t('cf.picker.fields.increase')"
                  @click="stepCount(1)"
                >
                  +
                </button>
              </div>
            </div>

            <!-- 布尔值是开关，不再用「带勾的芯片」：勾选态和可点态混在一起时，
                 用户读不出这到底是选项还是做过的动作 -->
            <button
              type="button"
              class="pk-row pk-switch"
              :class="{ 'is-on': preferNew }"
              role="switch"
              :aria-checked="preferNew"
              @click="preferNew = !preferNew"
            >
              <span>{{ t('cf.picker.options.preferNew') }}</span>
              <span class="pk-switch__track"><span class="pk-switch__thumb" /></span>
            </button>
            <button
              type="button"
              class="pk-row pk-switch"
              :class="{ 'is-on': excludeSolved }"
              role="switch"
              :aria-checked="excludeSolved"
              @click="excludeSolved = !excludeSolved"
            >
              <span>{{ t('cf.picker.options.excludeSolved') }}</span>
              <span class="pk-switch__track"><span class="pk-switch__thumb" /></span>
            </button>
          </div>

          <!-- 主操作：低饱和度微光面（与「运行全部」同一套，见样式表） -->
          <button type="submit" class="pk-cta" :disabled="picking">
            <LoadingSpinner v-if="picking" :size="13" />
            <AppIcon v-else name="dice" :size="15" />
            <span>
              {{
                picking
                  ? t('cf.picker.picking')
                  : results.length
                    ? t('cf.picker.action.again')
                    : t('cf.picker.action.pick')
              }}
            </span>
          </button>
          <p v-if="statusText" class="cf-status pk-status" :class="{ 'is-error': !!error }">
            <LoadingSpinner v-if="picking && !error" :size="11" />
            <span class="cf-status__text">{{ statusText }}</span>
          </p>
        </div>
      </form>

        <!-- 右结果流：窄容器下折到参数舱下方（见文件末尾容器查询） -->
        <section class="pk-results">
          <template v-if="results.length">
            <div class="cf-head">
              <span class="cf-head__title">
                {{ t('cf.picker.result.count', { n: results.length }) }}
                <span v-if="avgRating" class="cf-head__meta cf-mono">
                  {{ t('cf.picker.result.avg', { rating: avgRating }) }}
                </span>
              </span>
              <span class="cf-head__actions">
                <button
                  type="button"
                  class="cf-btn"
                  :disabled="importingAll || allImported"
                  @click="importAll"
                >
                  <LoadingSpinner v-if="importingAll" :size="11" />
                  <span>{{ importingAll ? t('cf.picker.result.importing') : t('cf.picker.result.importAll') }}</span>
                </button>
              </span>
            </div>
            <ul class="cf-list">
              <li v-for="problem in results" :key="`${problem.contestId}-${problem.index}`">
                <div class="cf-result cf-list__row">
                  <span class="cf-result__title">
                    <span class="cf-result__id">
                      CF{{ problem.contestId }}{{ String(problem.index).toUpperCase() }}
                    </span>
                    <a
                      class="cf-result__name"
                      :href="problem.task.url"
                      target="_blank"
                      rel="noreferrer"
                      :title="problem.name"
                    >
                      {{ problem.name }}
                    </a>
                  </span>
                  <span class="cf-result__tags" :title="problem.tags.join(', ')">
                    {{ problem.tags.join(' · ') }}
                  </span>
                  <span class="cf-result__rating">{{ problem.rating ?? '' }}</span>
                  <button
                    type="button"
                    class="cf-mini cf-result__import"
                    :class="{ 'is-done': importState(problem) === 'imported' }"
                    :disabled="importState(problem) !== 'import'"
                    @click="importOne(problem)"
                  >
                    <LoadingSpinner v-if="importState(problem) === 'importing'" :size="10" />
                    <span>{{ t(`cf.picker.result.${importState(problem)}`) }}</span>
                  </button>
                </div>
              </li>
            </ul>
          </template>
          <p v-else class="pk-empty">{{ t('cf.picker.result.empty') }}</p>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * CfPickerPanel —— Codeforces 随机抽题（可选模块）的视图。
 *
 * 【形态】编辑区里的一个合成视图（见 services/editorViews.js）。2026-10-27 起它挂进
 * 合并后的 Codeforces 页签 CfCodeforcesPanel，不再自己占视图 id；整块铺在编辑区内容层上，
 * 靠 v-show 与 Monaco 互斥。刻意不做成弹窗：与设置同形态更贴本项目的界面语言，也不遮住工作区。
 *
 * 【版式】一块不铺底、不描边的卡片（与编辑区地面同色，2026-10-29 去掉了 --bg-panel 与
 * 那圈发丝线），卡片里**只有一种行形态**：标签在左、控件在右
 * （2026-10-29 定型，此前是「标签压在控件上方」，与下方「数量 / 开关」的行不一致，
 * 用户指了两次）。标签 12.5px 的 --text-dim 小字，压在一个 30px 的行盒里，
 * 因此与控件的中线齐平；难度与数量两个「填值」控件 **静止不铺面**（面是 --bg-field：
 * 深色比地面亮 8 阶、浅色比白底暗 10 阶，只在悬停与获焦时浮现），芯片与主操作则一直带面
 * —— 前者是可填的值，后者是可点的选项 / 动作，这条分界就是 2026-10-29 第五轮定下的；
 * 全部控件统一 30px 高、6px 圆角；
 * 行距统一 10px：字段与行之间没有第二种节奏，靠形状而不是靠留白分块。
 * 难度是「一行字 + 一块浮现的淡底」：平时只是 `1500 – 2100` 六个等宽字符（2026-10-29 第四版，
 * 此前是一层实心圆角底横贯整列，用户口径「太笨重」），指针悬停 / 键盘进入才浮出 --bg-field，
 * 空着时整行只念一个「不限」；它靠右站，与上面标签行的已选摘要同一条右缘。
 * 常用区间是自动列数的等宽格子，
 * 标签是「一行已选（与结果行同一种读法）+ 右端的折叠箭头」，常用标签芯片默认收起
 * （2026-10-29 用户口径：预选项折叠起来，点展开才出现），
 * 数量是「− 3 +」步进器，两个筛选项是开关。
 * **难度与标签的预选项各自折叠，箭头钉在各自那一行的最右端、落在同一条竖线上**
 * （难度这一处 2026-10-29 后半按同一口径补上，用户：「将难度的预选项，也做这种处理」）。
 * 主操作（开始抽取）是低饱和度的 --accent 微光面 + 一颗骰子图标（2026-10-29 照「运行全部」）；
 * 2026-10-29 起账号不再在表单里填 —— 抬头右侧那颗胶囊是三个模式共用的同一份（cf/myHandle.js）。
 *
 * 【2026-11-08 多了两行】比赛类别（Div. 1 / 2 / 3 / 4、Edu、Div. 1+2、Global、Others）与
 * 题号（A–M）—— 照 cftracker 的「按比赛分类」那一层做的：题库接口只有 contestId，
 * 类别得靠比赛名判（见 cf/pick.js 的 contestCategory）。
 * 两片芯片与难度、标签同一种折叠形态（同日用户口径）：收起时这一行只念已选的值，
 * 右端一颗箭头摊开选项 —— 于是卡片里**四处可折叠、四颗箭头落在同一条竖线上**。
 * 判据全在 Worker：这里只记「选了哪几个 id」，把 id 原样发过去。
 *
 * 【颜色一律走设计令牌】不用 rgba(255,255,255,x) 这类字面量：本项目有浅色主题
 * （base.css 的 :root[data-scheme='light']），白色系硬编码在浅色下会整体失效。
 *
 * 【开关不在这里】侧栏那颗「组件」按钮唤出组件菜单（ComponentsMenu，Codeforces 类里的
 * 一项，与比赛并列），页签栏负责开关/切换，这里只渲染内容。
 *
 * 【表单/结果为什么留在常驻实例里】它由 EditorPane 用 v-show 常挂，切走再切回来
 * 表单值与抽到的题目都还在；偏好另有 usePersistentRef 落盘，刷新也不丢。
 */
import { computed, ref } from 'vue'

import AppIcon from './AppIcon.vue'
import LoadingSpinner from './LoadingSpinner.vue'
import { t } from '../i18n/index.js'
import {
  CONTEST_CATS,
  COUNT_MAX,
  COUNT_MIN,
  PROBLEM_LETTERS,
  RATING_PRESETS,
  TAG_PRESETS,
} from '../cf/pick.js'
import { useCfPicker } from '../composables/useCfPicker.js'

const {
  ratingMin,
  ratingMax,
  count,
  preferNew,
  excludeSolved,
  stageText,
  selectedDivisions,
  selectedLetters,
  selectedTags,
  clampCount,
  applyPreset,
  toggleDivision,
  toggleLetter,
  toggleTag,
  run,
  importOne,
  importAll,
  importState,
  picking,
  importingAll,
  error,
  results,
} = useCfPicker()

/**
 * 芯片集合 = 常用标签 + 已选中但不在常用里的那些。
 *
 * 后半截是给旧值兜底的：`cp.cf.tags` 换版之前是手输的逗号串，可能存着 `constructive
 * algorithms` 这类不在这 12 个里的标签。丢掉它们会让筛选**静默失效**（条件还在生效、
 * 卡片上却看不见），所以照样画成一颗选中态的芯片，点一下就能取消。
 */
const tagOptions = computed(() => {
  const extras = selectedTags.value.filter((tag) => !TAG_PRESETS.includes(tag))
  return [...TAG_PRESETS, ...extras]
})

/**
 * 常用标签是否展开。默认收起 —— 这一项多数时候是「不限」，没必要常年占四五行的芯片。
 * 只是界面状态（不落盘）：它回答的是「现在要不要挑」，不是「上次挑了什么」，
 * 后者已经由 cp.cf.tags 与那一行摘要交代。
 */
const tagsOpen = ref(false)

/**
 * 常用区间（难度那 5 颗）是否展开。默认收起，口径与常用标签一致（2026-10-29 用户：
 * 「将难度的预选项，也做这种处理」）。同样是纯界面状态，不落盘 —— 已经设置了哪个区间
 * 由上面那两块输入自己交代，这里只管「要不要掀开快捷项」。
 */
const presetsOpen = ref(false)

/**
 * 比赛类别 / 题号两片芯片是否展开。默认收起，口径与上面两处一致（2026-11-08 用户：
 * 「做成和难度、标签一样可折叠的」）。同样是纯界面状态，不落盘 —— 选了哪几类 / 哪几题
 * 已经由 cp.cf.divisions 与那一行摘要交代，这里只管「要不要掀开」。
 */
const catsOpen = ref(false)
const lettersOpen = ref(false)

/**
 * 已选类别念成一行摘要。按**芯片那一行的顺序**排（CONTEST_CATS 的下标），不按点选顺序 ——
 * 收起时读摘要，掀开后能在八颗里对着位置找到它。
 */
const divisionSummary = computed(() =>
  [...selectedDivisions.value]
    .sort((a, b) => CONTEST_CATS.indexOf(a) - CONTEST_CATS.indexOf(b))
    .map((cat) => t(`cf.picker.cats.${cat}`))
    .join(' · '),
)

/**
 * 已选题号念成一行摘要：连续的字母压成区间（勾了 A、B、C、F → `A–C · F`）。
 * 题号是一条 A–M 的轴，全勾上时逐个念是 51 个字，在 250px 的控件列里被省略号切成
 * 「A · B · C · D …」—— 恰好是最该一眼认出「没筛」的情形。区间外的仍按 ` · ` 分隔，
 * 与标签行的读法一致。排序用下标而不是字符序，`B1` 这类多字符 index 已在 normalize 里剔掉。
 */
const letterSummary = computed(() => {
  const picked = selectedLetters.value
    .map((letter) => PROBLEM_LETTERS.indexOf(letter))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)

  const parts = []
  let cursor = 0
  while (cursor < picked.length) {
    let end = cursor
    while (end + 1 < picked.length && picked[end + 1] === picked[end] + 1) end += 1
    parts.push(
      end > cursor
        ? `${PROBLEM_LETTERS[picked[cursor]]}–${PROBLEM_LETTERS[picked[end]]}`
        : PROBLEM_LETTERS[picked[cursor]],
    )
    cursor = end + 1
  }
  return parts.join(' · ')
})

/**
 * 难度里有没有填过东西。空着的时候整行只该念一个「不限」（与标签行同一种读法）；
 * 两颗输入各有自己的 placeholder，空着时会并排印成「不限 – 不限」，短横把同一个词
 * 重复了两次，读起来像出错（2026-10-29 去掉实底后才发现：以前有框兜着，两个「不限」
 * 落在两个格子里还算讲得通，成了裸字就露馅）。所以短横与右格那句「不限」都等
 * 至少填了一侧再出现 —— 空着就是「不限」，填了才是一个范围。
 */
const ratingDirty = computed(
  () => String(ratingMin.value ?? '') !== '' || String(ratingMax.value ?? '') !== '',
)

/** 这一批是不是全都导过了 —— 全导过就把「全部导入」停掉，免得点了没反应 */
const allImported = computed(
  () =>
    results.value.length > 0 &&
    results.value.every((problem) => importState(problem) === 'imported'),
)

/** 这批题的平均难度（只算有 rating 的题；一道都没有时不占位） */
const avgRating = computed(() => {
  const rated = results.value.filter((problem) => typeof problem.rating === 'number')
  if (!rated.length) return null
  const sum = rated.reduce((total, problem) => total + problem.rating, 0)
  return Math.round(sum / rated.length)
})

/** 状态行：出错时给出错原因，否则报进度（空闲时是空串） */
const statusText = computed(() =>
  error.value ? t(error.value.key, error.value.params) : stageText.value,
)

/**
 * 步进器上下一格。输入框可能被清空（Number('') = 0）：此时先把数量落回下限，
 * 不拿 0 去加减 —— 「清空 → 点 +」得到 2 会像是按坏了。
 */
function stepCount(delta) {
  const base = Number(count.value)
  if (!Number.isFinite(base) || base < COUNT_MIN) {
    count.value = COUNT_MIN
    return
  }
  count.value = Math.max(COUNT_MIN, Math.min(COUNT_MAX, base + delta))
}
</script>

<style scoped>
/* 输入框 / 芯片 / 状态行这些两个面板共用的版式在 src/styles/cf-console.css
   （本组件用下面的 <style src> 挂同一份，改一处两边生效）；
   这里只放随机抽题特有的卡片与控件。颜色一律走设计令牌（本项目有浅色主题）。 */

/* 双栏：左参数舱 330px（桌面上粘在上缘），右结果流自适应余量。
   2026-10-29 改版：表单与结果从「上下叠」改成「左控右果」—— 换一批 / 改条件时
   结果始终在视线右侧，不用在长页面里来回滚。 */
.pk-layout {
  display: grid;
  grid-template-columns: 330px minmax(0, 1fr);
  align-items: start;
  gap: 28px;
}

/* 表单与结果列表同轨：窄容器折成单列时，两块的左右缘自动对齐 */
.pk-form {
  width: 100%;
}

.pk-rail {
  position: sticky;
  top: 0;
}

.pk-results {
  min-width: 0;
}

/* 「平均 1857」是挂在标题后面的附注，不是标题的后半句 —— 比标题再小两档，
   读起来才不跟「抽到 5 道题」抢同一行。共用样式 `.cf-head__meta` 是 11.5px，比赛程页的
   抓取提示也在用，所以只在这里压到 10.5px（2026-10-29 用户两轮口径「字号改小一点 / 再改小一点」）；
   选择器多一层祖先，压过后面那份 <style src> 里的同名片。
   左边留 6px：模板里那一个空白字符在标题字号（13px）下只有 ~4px，两段字几乎贴在一起，
   补到 6px 才读得出「另起一段附注」。
   下压 1px（2026-10-29 用户口径「两者的字下缘对齐」）：默认按基线对齐，而汉字的墨迹会下探
   到基线以下约 1.3px、阿拉伯数字几乎不探（实测 PingFang 600 13px 的「题」探 1.31px、
   mono 10.5px 的「1857」只探 0.15px），于是同一基线下「1857」的下缘会比「题」高出一整像素。
   压 1px 后数字的下缘正好落到标题汉字的下缘那条线上，「平均」两个字略低一点点 —— 它字数少、
   又更淡，看得出是附注，比让数字悬空好。 */
.pk-results .cf-head__meta {
  margin-left: 6px;
  font-size: 10.5px;
  vertical-align: -1px;
}

/* 空态：一句灰字，不画空列表（右侧不是「坏了」，是还没抽）。
   2026-10-29：左右居中 + 距顶 18px（原来贴着顶边走、靠左，看着像漏了一块）。
   18px 与左边卡片的 padding-top 同值，两栏的第一行落在同一条水平线上；
   只在有结果的 `cf-head` 缺席时它才是唯一内容，所以居中不会跟列表打架。 */
.pk-empty {
  margin: 18px 0 0;
  color: var(--text-faint);
  font-size: 12px;
  line-height: 1.6;
  text-align: center;
}

/* ---------------- 卡片 ---------------- */
/* 卡片不再是「一块浮起来的面」（2026-10-29 用户口径：底色要贴近页面，那圈白线也去掉）。
   原来铺 --bg-panel（比编辑区地面亮一档）+ 一圈 --border-faint 描边，读起来像一张贴着
   发丝线的浮层；现在直接同色于编辑区地面（transparent 即页面底色），不描边、不圆角，
   只剩一圈内边距 —— 与 CF 页「不铺卡片、靠留白分区」的语汇对齐。
   宽度交给 .pk-layout 的 330px 左舱，卡片自己不再封顶。 */
.pk-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  padding: 18px 20px 16px;
  background: transparent;
}

/* 字段 = 一行：标签在左、控件在右（2026-10-29）。与下方 .pk-row 同一套读法，
   卡片里只剩一种行形态；标签列宽由文字自身决定（两字），控件吃掉剩下的宽度。 */
.pk-field {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
}

/* 控件列：范围 + 常用区间「叠成一列」，标签则是「已选一行 + 芯片」—— 两种都是列向堆叠，
   共用同一条左右缘（芯片从这一列的左缘开始排） */
.pk-field__body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1 1 auto;
  min-width: 0;
}

/* 标签是字段名，不是正文：12.5px、--text-dim、一点点字距 ——
   小字压在中性面上，靠字距而不是亮度立住。
   2026-10-29：11.5 → 12.5px，与「数量」「两个开关」那几行同号（用户口径：字段名一样大）；
   同一天标签也从「压在控件上方」改成「并排在控件左侧」，所以四行现在只靠位置区分。 */
.pk-label {
  color: var(--text-dim);
  font-size: 12.5px;
  line-height: 1;
  letter-spacing: 0.02em;
}

/* 字段行的标签：压在一个 30px 的行盒里（= 控件高度），文字因此与右边控件的中线齐平；
   难度下方还有一片芯片时，它也只与第一行对齐（.pk-field 是 flex-start）。
   ⚠️ 必须写成 `.pk-field > .pk-label`：与上面那条 `.pk-label` 同特异性时，谁在后谁赢 ——
   一开始写成 `.pk-label--field` 且放在它前面，`line-height: 30px` 被 `line-height: 1` 吃掉了，
   标签就顶在控件上缘（2026-10-29 实测标签盒高 13px 才发现）。 */
.pk-field > .pk-label {
  flex: 0 0 auto;
  line-height: 30px;
}

/* ---------------- 难度：一行字，不是一只盒子 ---------------- */
/* 2026-10-29 第四版（用户口径「这个输入框太笨重」）：把面拿掉。
   上一版是一层 30px 的实心圆角底横贯整个控件列，两个数字格各吃一半宽度、中间悬着
   一条短横、右边再挂一颗箭头 —— 内容只有「1300 – 1600」六个字符，外壳却是一整条
   控件带，读起来比下面任何一行都重。
   现在：无底、无描边、无圆角，宽度跟着内容走（`flex: 0 1 auto` + 每格定宽），
   排出来就是一行等宽数字；底只在**指针悬停 / 键盘进入**时才浮出来「显影」一下 ——
   静止时它是排版，动手时它才是控件。
   **靠右站**（当日第五轮用户口径「还是要靠右」）：`margin-left: auto` 把它连同右端
   那颗折叠箭头一起推到行尾，读数与上面标签行的「已选摘要」落在同一条右缘上 —— 卡片
   里所有「值」都在右边，左边只留字段名。`margin-right: -6px` 抵掉内边距：浮底向右
   铺到箭头跟前，数字右缘因此与标签行摘要的右缘一样，只隔行距那 6px。 */
.pk-range {
  display: flex;
  flex: 0 1 auto;
  align-items: center;
  gap: 2px;
  min-width: 0;
  height: 30px;
  margin: 0 -6px 0 auto;
  padding: 0 6px;
  overflow: hidden;
  border-radius: 6px;
  background: transparent;
  transition: background-color 0.15s ease, box-shadow 0.15s ease;
}

/* 悬停才浮现一层淡底（--bg-field：深色比地面亮一档，2026-10-29 用户口径「都改为比底色浅」）。
   这一步不是为了「告诉你能点」——placeholder「不限」与光标已经说了 ——
   而是让指针压上去时有个落点，不至于在裸字上凭空出框。 */
:where(html.is-hoverable) .pk-range:hover {
  background: var(--bg-field);
}

/* 焦点仍画在整块上，不画在某一格上：两个格子属于同一个控件。
   没有实底时改用内描边 + 一圈淡光晕，形状与焦点态在别的输入框上一致。 */
.pk-range:focus-within {
  background: var(--bg-field);
  box-shadow: inset 0 0 0 1px var(--focus), 0 0 0 3px var(--focus-ring);
}

/* 空态：整行只念一个「不限」，并且贴着右缘 —— 与上面标签行的「不限」落在同一列。
   两颗格子固定 5ch 时，那个「不限」会停在整段范围的左半格（离标签行的「不限」差 80 多
   像素），一行读下来是歪的。所以空着、且没有焦点时，把两个格子临时合成一个：
   下界格吃满并右对齐，上界格收成 0 宽（仍在 DOM 里，只是点不到 —— 点哪儿都会落进
   下界，正是「从这里开始填」的意思），间距也一起归零。
   只在**没有焦点**时这样收：一点进来就恢复成「两格 + 短横」的编辑形态，
   免得第一颗数字敲进去时才跳位置。 */
.pk-range.is-empty:not(:focus-within) {
  gap: 0;
}

.pk-range.is-empty:not(:focus-within) .pk-range__input:first-of-type {
  flex: 1 1 auto;
  text-align: right;
}

.pk-range.is-empty:not(:focus-within) .pk-range__input:last-of-type {
  flex: 0 0 0;
  width: 0;
  padding: 0;
}

/* 格子本身没有面、没有描边：悬停与焦点都由外面那一层交代。
   宽度用 ch（等宽体下一个数字的宽度）：范围是 800–3500，4 位数字 + 居中留白，
   5ch 刚好；不再用 `flex: 1 1 0` 各吃一半 —— 那样中间的短横被推得离数字很远，
   一行字被拉成了三段。允许收缩（`0 1 5ch`）是给极窄的编辑区兜底：编辑区被拖到
   一两百像素时宁可数字被裁，也别让文字压到右端的折叠箭头上。

   ⚠️ **`width: 5ch` 是单独的、必须留着的一条**（2026-10-31，用户报「难度的这两个分数
   没有靠右」）：整块 `.pk-range` 的宽度是 `flex: 0 1 auto`，也就是**内容撑出来的**，
   而内容里这两颗 `input[type=number]` 的**固有宽度是 ~164px**（`size` 默认 20 个字符），
   只有 `flex-basis` 这一个来源时，各引擎对「固有宽度要不要算进容器的 max-content」
   取值不一致 —— 实测（同一份产物、只把 flex 改成 none 模拟老引擎）：整块从 102px
   被撑到 355px，`margin-left: auto` 仍把它的右缘推到箭头上，于是 5ch 的两颗数字停在
   整块的**左端**，离右缘差 250px，看着就是「没有靠右」。给了显式宽度之后，输入框对
   容器 max-content 的贡献变成确定的 5ch，两种引擎下整块都是 102px。 */
.pk-range__input {
  flex: 0 1 5ch;
  width: 5ch;
  min-width: 0;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text);
  font-family: var(--mono-font);
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.pk-range__input:focus {
  outline: none;
}

.pk-range__input::placeholder {
  color: var(--text-dim);
}

/* 原生上下箭头撤掉：范围靠两个常用区间与手动输入，不靠微调 */
.pk-range__input::-webkit-outer-spin-button,
.pk-range__input::-webkit-inner-spin-button {
  appearance: none;
  margin: 0;
}

/* 短横：一行字里的连接号，不是分隔两个框的零件 —— 只给一点点空气（gap 之外再加 2px），
   让 `1300 – 1600` 读成一个整体，而不是「框、横、框」三件东西。 */
.pk-range__dash {
  flex: 0 0 auto;
  margin: 0 2px;
  color: var(--text-faint);
  font-family: var(--mono-font);
  font-size: 12px;
}

/* ---------------- 常用区间：等宽网格 ---------------- */
/* 2026-10-29：从「按内容宽度换行的芯片云」改成网格 —— 每个格一样宽、整列吃满，
   与上面的范围框共用同一条左右缘。列数交给 minmax(74px, 1fr)：宽时 3 列、
   窄时自动落到 2 列，不会把「1300–1600」挤成省略号，也不用再写容器查询。 */
.pk-presets {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(74px, 1fr));
  gap: 6px;
}

/* 芯片与输入框统一 30px 高、6px 圆角、同一种字段面（.cf-chip 原本是 26px / 10px /
   --bg-input，那是列表筛选行的口径）。选中态仍由 .cf-chip.is-on 的 --accent-face 交代 ——
   它在本文件之后加载且同特异性，正好压住这条。
   ⚠️ 必须带 .pk-presets 前缀：cf-console.css 那份 scoped 样式与本文件同特异性，
   谁在后谁赢 —— 只写 .pk-chip 时高度会被 .cf-chip 的 26px 吃回去（2026-10-29 实测）。 */
.pk-presets .pk-chip {
  height: 30px;
  min-width: 0;
  padding: 0 4px;
  border-radius: 6px;
  background: var(--bg-field);
  font-size: 11.5px;
  white-space: nowrap;
}

:where(html.is-hoverable) .pk-presets .pk-chip:hover:not(.is-on) {
  background: var(--bg-control);
  color: var(--text);
}

/* ---------------- 标签：已选那一行 + 常用标签芯片 ---------------- */
/* 已选：与抽到的题目那一行的标签同一个面孔（11.5px、--text-faint、` · ` 分隔、
   一行到底、放不下就省略 —— 结果行就是这么交代标签的，这里照抄，不另创一种写法）。
   行高 30px 与左侧字段名的行盒同值 —— 字段名因此仍与右边第一行齐平。
   整行不会因为多选而长高：选了什么，下面那片芯片里也一样看得见。 */
/* 摘要靠右：贴着右端那颗折叠箭头，与左侧的字段名之间留白（2026-10-29 用户口径
   「标签中显示选中了什么标签的那一行字靠右，在折叠小箭头的左侧」）。
   `flex: 0 1 auto` + `margin-left: auto` —— 盒子宽度跟着内容走、整体推到右边；
   内容超过一行时仍会被压缩并右端省略（min-width: 0 是省略生效的前提）。 */
.pk-selected {
  flex: 0 1 auto;
  min-width: 0;
  margin: 0 0 0 auto;
  overflow: hidden;
  color: var(--text-faint);
  font-size: 11.5px;
  line-height: 30px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 「值 + 折叠箭头」那一行（两处共用：难度 = 范围框 + 箭头，标签 = 摘要 + 箭头）：
   值吃满剩下的宽度或跟着内容靠右，箭头钉在这一行的最右端 —— 两行的箭头因此落在
   同一条竖线上，与下面各行控件的右缘也是同一条。 */
.pk-row-head {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* 折叠箭头：只剩一枚（2026-10-29 用户口径「去掉展开和收起这两个字」）。
   按钮仍是 24 × 24 的方形点击区（够手指），但**不铺面**：悬停只把箭头提亮一档，
   不留热区高亮 —— 这一行只有「值 + 一个箭头」，铺底会像多出一个按钮控件。
   文案只留在 aria-label / title 上，读屏和长按提示仍能读出来。 */
.pk-fold {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  transition: color 0.15s ease;
}

/* 箭头的翻转跟按钮状态走（按钮自己带 is-open），不依赖子元素 */
.pk-fold.is-open .pk-fold__icon {
  transform: rotate(180deg);
}

/* 悬停 / 展开时箭头亮一档：不加底色，靠亮度交代「可点」与「已展开」 */
:where(html.is-hoverable) .pk-fold:hover,
.pk-fold.is-open {
  color: var(--text);
}

.pk-fold:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
}

/* 箭头跟着状态翻：收起时朝下（点下去会摊开），展开时朝上 */
.pk-fold__icon {
  transition: transform 0.16s ease;
}

/* 一个都没选时是占位的「不限」：颜色再退一档，读起来像「这里现在是空的」 */
.pk-selected.is-empty {
  color: var(--text-dim);
}

/* 芯片云：宽度跟着标签名走（`two pointers` 与 `dp` 本来就不等长），
   高度 / 圆角 / 面仍与上面的常用区间完全一致，所以两片芯片读起来是一套东西。
   不与上面共用 .pk-presets —— 那边是等宽网格（`1300–1600` 都是定长数字），
   等宽会把长标签压成省略号。 */
.pk-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.pk-tags .pk-chip {
  height: 30px;
  padding: 0 7px;
  border-radius: 6px;
  background: var(--bg-field);
  /* 标签是英文词，不用等宽体：`implementation` 在等宽体里比比例体宽出近三成，
     一行立刻只剩两颗粒，整片芯片因此多出两行。 */
  font-family: var(--ui-font);
  font-size: 11px;
  white-space: nowrap;
}

:where(html.is-hoverable) .pk-tags .pk-chip:hover:not(.is-on) {
  background: var(--bg-control);
  color: var(--text);
}

/* ---------------- 比赛类别 / 题号 ---------------- */
/* 两片都是「可点的选项」，与常用标签那一片同一套面孔（30px 高、6px 圆角、--bg-field 面），
   所以卡片里三处芯片读起来是一套东西。区别只在排法：

   比赛类别按**内容宽度换行**（.pk-cats 照 .pk-tags 抄）—— `Edu` 与 `Div. 1+2` 本来就
   不等长，等宽会把长的挤成省略号；
   题号则**等距排成一条**（.pk-letters 写死 13 列）—— 它是一条「第几题」的轴，
   等距才读得出顺序，换行或宽度参差都会把这条轴打断。 */
.pk-cats {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.pk-cats .pk-chip {
  height: 30px;
  padding: 0 7px;
  border-radius: 6px;
  background: var(--bg-field);
  /* 与常用标签一样用比例体：`Div. 1+2` 在等宽体里宽出近三成，一行立刻只剩三颗 */
  font-family: var(--ui-font);
  font-size: 11px;
  white-space: nowrap;
}

:where(html.is-hoverable) .pk-cats .pk-chip:hover:not(.is-on) {
  background: var(--bg-control);
  color: var(--text);
}

/* 13 列均分：minmax(0, 1fr) 允许在极窄的编辑区里压缩，而不是把最后一个字母挤到第二行。
   单字符不需要左右内边距（padding: 0），宽度全给格子，所以字母永远居中。 */
.pk-letters {
  display: grid;
  grid-template-columns: repeat(13, minmax(0, 1fr));
  gap: 4px;
}

.pk-letters .pk-chip {
  height: 30px;
  min-width: 0;
  padding: 0;
  border-radius: 6px;
  background: var(--bg-field);
  /* 字母是单字符，等宽体读起来像一排刻度 */
  font-family: var(--mono-font);
  font-size: 11.5px;
  white-space: nowrap;
}

:where(html.is-hoverable) .pk-letters .pk-chip:hover:not(.is-on) {
  background: var(--bg-control);
  color: var(--text);
}

/* ---------------- 数量 + 两个开关：一列「行」 ---------------- */
/* 2026-10-29 从「左右两列」改成一列：每行都是「标签在左、控件在右」，
   与设置面板同一种读法。行高三处一致（30px），左缘与上面的字段对齐。
   行距与卡片统一成 10px（同一天第二版）：原来这里 4px、卡片 16px，
   四行里前两行松、后三行挤，仍然读成两种节奏。 */
.pk-rows {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pk-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  min-height: 30px;
}

/* 行内标签只改行高：字号已与字段名同档（12.5px），
   压在 12.5px 的开关文案旁边时不能再靠加大字号来抢眼。 */
.pk-label--row {
  line-height: 1.2;
}

/* 步进器：一块输入面里塞 − / 数值 / +。三个部分共用同一条底，
   比「一个带边框的输入框 + 旁边写 1-10」更直观，也省掉那行范围提示。
   圆角与范围框对齐成 6px（容器）/ 4px（格子），卡片里只有这两档圆角。
   2026-10-29 第五轮（用户口径「数量输入框的底色改为与难度输入框相同的」）：
   静止不铺面 —— 与上面那行难度同一条规矩，**面只在指针压上来 / 键盘进来时浮现**
   （--bg-field，深色比地面亮一档）。于是卡片里所有控件静止时都只是排版，
   只有芯片与主操作还带面（它们是「可点的选项 / 动作」，得一直看得见）。
   焦点整块画（内描边 + 3px 光晕）：三个格子属于同一个控件，焦点不再落在数值那
   一小格上。 */
.pk-stepper {
  display: inline-flex;
  align-items: center;
  height: 30px;
  padding: 2px;
  border-radius: 6px;
  background: transparent;
  transition: background-color 0.15s ease, box-shadow 0.15s ease;
}

:where(html.is-hoverable) .pk-stepper:hover {
  background: var(--bg-field);
}

.pk-stepper:focus-within {
  background: var(--bg-field);
  box-shadow: inset 0 0 0 1px var(--focus), 0 0 0 3px var(--focus-ring);
}

.pk-stepper__btn {
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-dim);
  font-family: var(--mono-font);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

:where(html.is-hoverable) .pk-stepper__btn:hover:not(:disabled) {
  background: var(--bg-control);
  color: var(--text);
}

.pk-stepper__btn:disabled {
  color: var(--text-faint);
  cursor: default;
}

.pk-stepper__value {
  width: 34px;
  height: 26px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text);
  font-family: var(--mono-font);
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
  text-align: center;
  transition: background-color 0.15s ease, box-shadow 0.15s ease;
}

/* 数值格自己不画面、不画环：焦点由外面的步进器整块交代（同难度的两颗格子） */
.pk-stepper__value:focus {
  outline: none;
}

/* 原生上下箭头撤掉：这颗框由两边的按钮负责步进 */
.pk-stepper__value::-webkit-outer-spin-button,
.pk-stepper__value::-webkit-inner-spin-button {
  appearance: none;
  margin: 0;
}

/* 开关：IOS 那种「轨 + 圆点」。这里刻意是胶囊形 —— 开关的形态语义就长这样，
   而站内那条「不用胶囊」针对的是按钮 / 芯片。
   2026-10-29 起它整行可点（布局由 .pk-row 交代）：文案贴左、轨道贴右缘，
   与上面的「数量」行共用同一条左缘和同一条右缘。 */
.pk-switch {
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-dim);
  font-family: var(--ui-font);
  font-size: 12.5px;
  white-space: nowrap;
  cursor: pointer;
  transition: color 0.15s ease;
}

:where(html.is-hoverable) .pk-switch:hover {
  color: var(--text);
}

.pk-switch.is-on {
  color: var(--text);
}

.pk-switch__track {
  position: relative;
  flex: 0 0 auto;
  width: 30px;
  height: 18px;
  border-radius: 999px;
  background: var(--bg-control);
  transition: background-color 0.18s ease, box-shadow 0.18s ease;
}

.pk-switch__thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--text-dim);
  transition: transform 0.18s ease, background-color 0.18s ease;
}

.pk-switch.is-on .pk-switch__track {
  background: var(--accent);
}

.pk-switch.is-on .pk-switch__thumb {
  background: var(--text-on-accent);
  transform: translateX(12px);
}

/* 键盘焦点可见：轨道外一圈淡光晕（与输入框获焦同一支） */
.pk-switch:focus-visible {
  outline: none;
}

.pk-switch:focus-visible .pk-switch__track {
  box-shadow: 0 0 0 3px var(--focus-ring);
}

/* ---------------- 主操作 ---------------- */
/* 低饱和主操作（2026-10-29 用户要求，版式照 TestPanel 的「运行全部」）：
   不描边、不做实底，只铺一层 --accent 的微光面 —— 权重靠整块面与位置交代，
   颜色只负责「抽取」这个动作的身份；悬停把同一块面加深一档，不换色。
   补齐：--accent 本身压在深色地面上读不清，文字与图标改用 --accent-text。
   2026-10-29：圆角 10 → 6px、字号 13 → 12.5px，与 TestPanel 的 .run-inline 对齐
   （用户点名只动这两项，底色 / 悬停 / 高度都不改）。 */
.pk-cta {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 38px;
  margin-top: 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: var(--accent-face);
  color: var(--accent-text);
  font-family: var(--ui-font);
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.16s ease;
}

:where(html.is-hoverable) .pk-cta:hover:not(:disabled) {
  background: var(--accent-face-hover);
}

.pk-cta:active:not(:disabled) {
  background: var(--accent-face-hover);
}

.pk-cta:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.pk-cta:disabled {
  opacity: 0.45;
  cursor: default;
}

/* 状态行（下载中 / 进度 / 出错）落在主操作下面，与卡片内缘对齐 */
.pk-status {
  padding-left: 2px;
}

/* 编辑区被拖窄：双栏折成单列（参数在上、结果在下），并解除吸顶 ——
   单列里再吸顶会把结果区一直压在下面 */
@container cf (max-width: 48rem) {
  .pk-layout {
    grid-template-columns: minmax(0, 1fr);
    gap: 22px;
  }

  .pk-rail {
    position: static;
  }
}

/* 窄容器：卡片收一圈内边距。行式布局（.pk-rows / .pk-presets）自己会折，
   这里不需要再改结构 */
@container cf (max-width: 34rem) {
  .pk-card {
    padding: 14px 14px 12px;
    gap: 14px;
  }
}
</style>

<style scoped src="../styles/cf-console.css"></style>
