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
      <span class="cf-codeforces__brand">
        <AppIcon name="codeforces" :size="14" />
        <span class="cf-codeforces__title">{{ t('cf.view.title') }}</span>
      </span>

      <span class="cf-codeforces__modes">
        <button
          v-for="item in MODES"
          :key="item"
          type="button"
          class="cf-tab"
          :class="{ 'is-on': mode === item }"
          :aria-pressed="mode === item"
          @click="mode = item"
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
            <span class="cf-handle__dot" :class="{ 'is-set': handleList.length }" />
            <span class="cf-handle__text">{{ handleText }}</span>
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

    <div class="cf-codeforces__stage">
      <CfPickerPanel v-show="mode === 'picker'" />
      <div v-show="mode === 'schedule'" class="cf-view">
        <!-- --fill：赛程在空列表时要把「获取中」放到内容区的黄金分割点（见 cf-console.css） -->
        <div class="cf-page cf-page--fill">
          <CfContestSchedule
            :active="props.active && mode === 'schedule'"
            @select="openContest"
          />
        </div>
      </div>
      <CfContestPanel
        ref="contestPanel"
        v-show="mode === 'contest'"
        :active="props.active && mode === 'contest'"
        @submit-active="emit('submit-active')"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

import AppIcon from './AppIcon.vue'
import CfContestPanel from './CfContestPanel.vue'
import CfContestSchedule from './CfContestSchedule.vue'
import CfPickerPanel from './CfPickerPanel.vue'
import { cfHandle, myHandles } from '../cf/myHandle.js'
import { cfRunningCount } from '../composables/useCfSchedule.js'
import { t } from '../i18n/index.js'

const emit = defineEmits(['submit-active'])

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

/** 赛程里点一行：把这场交给比赛面板（它自己填链接、切到题目页、取数），再翻到比赛 */
function openContest(contest) {
  if (!contest?.id) return
  mode.value = 'contest'
  contestPanel.value?.openContest(contest)
}

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocPointer)
})

/* ---------------- 右侧账号胶囊 ---------------- */
const handleWrap = ref(null)
const handleInput = ref(null)
const handleOpen = ref(false)
const handleDraft = ref('')

const handleList = computed(() => myHandles())

const handleText = computed(() => {
  const list = handleList.value
  if (!list.length) return t('cf.view.handle.empty')
  return list.length > 1 ? `${list[0]} +${list.length - 1}` : list[0]
})

function toggleHandle() {
  if (handleOpen.value) closeHandle()
  else handleOpen.value = true
}

/** 失焦 / 点空白处 / Enter 都落盘：三个页面共用这份值，不适合「不点保存就丢」 */
function closeHandle() {
  if (!handleOpen.value) return
  cfHandle.value = String(handleDraft.value || '').trim()
  handleOpen.value = false
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
  border-radius: 8px;
  background: transparent;
  color: var(--text-dim);
  font-family: var(--ui-font);
  font-size: 11.5px;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.cf-handle__btn:hover {
  background: var(--icon-hover-bg);
  color: var(--text);
}

.cf-handle__dot {
  flex: 0 0 auto;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--text-faint);
}

.cf-handle__dot.is-set {
  background: var(--ok);
}

.cf-handle__text {
  min-width: 0;
  overflow: hidden;
  font-family: var(--mono-font);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cf-handle__chevron {
  flex: 0 0 auto;
  color: var(--text-faint);
}

/* 小面板：锚在胶囊下方，靠右对齐；不铺大卡，一块浅面 + 一条淡边 */
.cf-handle__panel {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 280px;
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
  .cf-handle__text,
  .cf-handle__chevron {
    display: none;
  }

  .cf-handle__btn {
    padding: 0 6px;
  }
}

/* 子面板的 .cf-view 是 absolute inset: 0，容器必须是定位上下文，
   同时要让出抬头那一行 —— min-height: 0 让内容自己滚动而不是把整列撑高 */
.cf-codeforces__stage {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
}
</style>
