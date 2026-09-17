<script setup>
import { computed, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import EditorSettingsPanel from './EditorSettingsPanel.vue'
import HelpPanel from './HelpPanel.vue'
import LocalRuntimePanel from './LocalRuntimePanel.vue'
import { LANGUAGES } from '../services/templates.js'
import { engineChoices } from '../services/engines/index.js'
import { useInstallPrompt } from '../composables/useInstallPrompt.js'

const props = defineProps({
  language: { type: String, required: true },
  panelPosition: { type: String, required: true },
  judge: { type: Object, required: true },
  connection: { type: Object, required: true },
  editorSettings: { type: Object, required: true },
  editorSettingsOpen: Boolean,
  running: Boolean,
  total: { type: Number, default: 0 },
})

const emit = defineEmits([
  'update:language',
  'select-engine',
  'update-base',
  'test-connection',
  'update:editor-settings',
  'update:editor-settings-open',
  'toggle-layout',
  'run-all',
])

const choices = engineChoices()

const settingsOpen = ref(false)
const localRuntimeOpen = ref(false)
const helpOpen = ref(false)
const moreOpen = ref(false)
const draftBase = ref(props.judge.base)

// 浏览器判定可安装后才会亮出这个按钮，装完（或已在独立窗口里）自动消失
const { canInstall, install } = useInstallPrompt()

// 切换引擎时 App 会把 judge.base 换成新引擎的地址，输入框要跟着走
watch(
  () => props.judge.base,
  (value) => {
    draftBase.value = value
  },
)

// 内置引擎（本地沙箱 / 自检）没有服务地址，按注册表约定 defaultBase 是 'local'
const localEngine = computed(() => props.judge.base === 'local')

const probeTone = computed(() => {
  if (props.connection.state === 'ok') return 'is-ok'
  if (props.connection.state === 'bad') return 'is-bad'
  return ''
})

// 三个抽屉都从右侧滑出，同时打开会叠在一起，所以开一个就关另外两个；
// 引擎设置那个弹层挂在顶栏里，抽屉的遮罩会把它盖住，也顺手收掉，
// 免得关掉抽屉之后它又冒出来。
function closeDrawers(except) {
  if (except !== 'editor') emit('update:editor-settings-open', false)
  if (except !== 'local') localRuntimeOpen.value = false
  if (except !== 'help') helpOpen.value = false
  settingsOpen.value = false
}

function setEditorSettingsOpen(value) {
  emit('update:editor-settings-open', value)
  if (value) closeDrawers('editor')
}

function setLocalRuntimeOpen(value) {
  localRuntimeOpen.value = value
  if (value) closeDrawers('local')
}

function setHelpOpen(value) {
  helpOpen.value = value
  if (value) closeDrawers('help')
}

/* 窄屏折进省略号的几项。动作都复用栏里那几颗按钮的同一个开关 / 同一个 emit，
   不复制组件，所以抽屉、弹层始终只有一份实例；点完顺手收起菜单。 */
function openLocalRuntime() {
  moreOpen.value = false
  setLocalRuntimeOpen(true)
}

function openHelp() {
  moreOpen.value = false
  setHelpOpen(true)
}

function openEngineSettings() {
  moreOpen.value = false
  settingsOpen.value = true
}

function swapPanes() {
  moreOpen.value = false
  emit('toggle-layout')
}

function runInstall() {
  moreOpen.value = false
  install()
}

const swapHint = computed(() =>
  props.panelPosition === 'right'
    ? '测试面板当前在右侧，点击换到左侧'
    : '测试面板当前在左侧，点击换到右侧',
)

function chooseEngine(id) {
  if (id === props.judge.id) return
  emit('select-engine', id)
}

function applyBase() {
  const value = draftBase.value.trim()
  if (!value) return
  emit('update-base', value)
}
</script>

<template>
  <header class="topbar">
    <div class="brand">
      <span class="brand__mark"><AppIcon name="code" :size="15" :stroke-width="2.2" /></span>
      <span class="brand__name">CPH IDE</span>
      <span class="brand__sep"></span>
    </div>

    <label class="field" title="切换语言，会保留各自独立的代码草稿">
      <span class="field__label">语言</span>
      <span class="select">
        <select
          :value="language"
          @change="emit('update:language', $event.target.value)"
        >
          <option v-for="item in LANGUAGES" :key="item.id" :value="item.id">
            {{ item.label }}
          </option>
        </select>
        <AppIcon name="chevron" :size="12" class="select__chevron" />
      </span>
    </label>

    <div class="spacer"></div>

    <EditorSettingsPanel
      :settings="editorSettings"
      :open="editorSettingsOpen"
      @update:settings="emit('update:editor-settings', $event)"
      @update:open="setEditorSettingsOpen"
    />

    <LocalRuntimePanel :open="localRuntimeOpen" @update:open="setLocalRuntimeOpen" />

    <button
      v-if="canInstall"
      class="tool tool--install"
      title="把 CPH IDE 安装到这台设备，之后可独立窗口打开"
      aria-label="安装到设备"
      @click="install"
    >
      <AppIcon name="install" :size="15" />
    </button>

    <div class="settings">
      <button
        class="tool"
        :class="{ 'is-active': settingsOpen }"
        title="评测引擎设置"
        aria-label="评测引擎设置"
        @click="settingsOpen = !settingsOpen"
      >
        <AppIcon name="sliders" />
      </button>
      <div v-if="settingsOpen" class="popover">
        <p class="popover__title">评测引擎</p>

        <div class="engines">
          <button
            v-for="item in choices"
            :key="item.id"
            class="engine"
            :class="{ 'is-active': item.id === judge.id }"
            :aria-pressed="item.id === judge.id"
            @click="chooseEngine(item.id)"
          >
            <span class="engine__head">
              <span class="engine__label">{{ item.label }}</span>
              <span v-if="!item.executesCode" class="engine__badge">不执行代码</span>
              <AppIcon v-if="item.id === judge.id" name="check" :size="13" />
            </span>
            <span class="engine__hint">{{ item.hint }}</span>
          </button>
        </div>

        <template v-if="!localEngine">
          <p class="popover__title popover__title--gap">服务地址</p>
          <input
            v-model="draftBase"
            class="popover__input"
            spellcheck="false"
            @keyup.enter="applyBase"
          />
        </template>
        <p v-else class="popover__hint">本地沙箱在浏览器里跑，不需要服务地址。</p>

        <div class="probe">
          <button
            class="tool"
            :disabled="connection.state === 'checking'"
            @click="emit('test-connection')"
          >
            <AppIcon name="reset" :size="13" />
            <span>{{ connection.state === 'checking' ? '探测中…' : '自检' }}</span>
          </button>
          <span v-if="connection.message" class="probe__message" :class="probeTone">
            {{ connection.message }}
          </span>
        </div>

        <div class="popover__actions">
          <button class="tool" @click="settingsOpen = false">关闭</button>
          <button v-if="!localEngine" class="tool tool--solid" @click="applyBase">保存</button>
        </div>
      </div>
    </div>

    <button
      class="tool tool--icon"
      :title="swapHint"
      :aria-label="swapHint"
      @click="emit('toggle-layout')"
    >
      <AppIcon name="swap" />
    </button>

    <!-- 图标区最右：窄屏时它最先折进「更多」，帮助属最不常用的一项 -->
    <HelpPanel :open="helpOpen" @update:open="setHelpOpen" />

    <!-- 窄屏收纳位：icon 装不下时从右到左折进这里。它自己占一格，
         所以要一次折掉两颗才算净赚，见样式的折叠档位 -->
    <div class="more">
      <button
        class="tool tool--more"
        :class="{ 'is-active': moreOpen }"
        title="更多"
        aria-label="更多"
        :aria-expanded="moreOpen"
        @click="moreOpen = !moreOpen"
      >
        <AppIcon name="more" />
      </button>

      <div v-if="moreOpen" class="popover popover--menu">
        <button class="menu__item menu__item--help" @click="openHelp">
          <AppIcon name="help" :size="15" />
          <span>使用帮助</span>
        </button>
        <button class="menu__item menu__item--panel" @click="openLocalRuntime">
          <AppIcon name="cpu" :size="15" />
          <span>本地运行环境</span>
        </button>
        <button v-if="canInstall" class="menu__item menu__item--install" @click="runInstall">
          <AppIcon name="install" :size="15" />
          <span>安装到设备</span>
        </button>
        <button class="menu__item menu__item--engine" @click="openEngineSettings">
          <AppIcon name="sliders" :size="15" />
          <span>评测引擎设置</span>
        </button>
        <button class="menu__item menu__item--swap" @click="swapPanes">
          <AppIcon name="swap" :size="15" />
          <span>{{ panelPosition === 'right' ? '面板换到左侧' : '面板换到右侧' }}</span>
        </button>
      </div>
    </div>

    <button
      class="primary"
      :class="{ 'is-running': running }"
      :aria-label="running ? '停止运行' : '运行全部测试'"
      :title="running ? '点击中断当前运行' : '运行全部测试用例 (⌘/Ctrl + Enter)'"
      :disabled="total === 0 && !running"
      @click="emit('run-all')"
    >
      <AppIcon :name="running ? 'stop' : 'play'" :size="14" />
      <span>{{
        running ? '停止运行' : total ? `运行全部测试  · ${total}` : '运行全部测试 (Run All)'
      }}</span>
    </button>
  </header>
</template>

<style scoped>
.topbar {
  height: 50px;
  flex: 0 0 50px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px 0 14px;
  background: var(--bg-chrome);
  border-bottom: 1px solid var(--border-soft);
  user-select: none;
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-right: 4px;
}

.brand__mark {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  color: var(--text-on-accent);
  background: linear-gradient(180deg, var(--accent-strong), var(--accent-deep));
}

.brand__name {
  font-size: 13.5px;
  font-weight: 600;
  letter-spacing: 0.1px;
}

.brand__sep {
  width: 1px;
  height: 16px;
  background: var(--border);
  margin: 0 2px;
}

.brand__sub {
  font-size: 12px;
  color: var(--text-faint);
}

.field {
  display: flex;
  align-items: center;
  gap: 7px;
}

.field__label {
  font-size: 11.5px;
  color: var(--text-faint);
}

.select {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.select select {
  appearance: none;
  padding: 5px 26px 5px 9px;
  border-radius: 5px;
  background: var(--bg-control);
  border: 1px solid var(--border);
  font-size: 12.5px;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.select select:hover {
  background: var(--bg-control-hover);
}

.select__chevron {
  position: absolute;
  right: 8px;
  pointer-events: none;
  color: var(--text-dim);
}

.spacer {
  flex: 1 1 auto;
}

.tool {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 28px;
  padding: 0 9px;
  border-radius: 5px;
  border: 1px solid transparent;
  color: var(--text);
  font-size: 12.5px;
  white-space: nowrap;
  transition: background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease;
}

.tool:hover {
  background: var(--bg-hover);
  border-color: var(--border);
}

.tool.is-active {
  background: var(--bg-hover);
  border-color: var(--border);
}

.tool:disabled {
  cursor: default;
  color: var(--text-faint);
}

.tool:disabled:hover {
  background: none;
  border-color: transparent;
}

/* 纯图标按钮：去掉文字后收成正方形，避免左右多出空白 */
.tool--icon {
  width: 28px;
  padding: 0;
  justify-content: center;
}

.tool--solid {
  background: var(--accent);
  border-color: transparent;
}

.tool--solid:hover {
  background: var(--accent-hover);
}

.primary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 30px;
  padding: 0 13px;
  border-radius: 5px;
  font-size: 12.5px;
  font-weight: 550;
  color: var(--text-on-accent);
  background: var(--run-green);
  border: 1px solid rgba(255, 255, 255, 0.08);
  white-space: nowrap;
  transition: background-color 0.16s ease, box-shadow 0.16s ease, transform 0.1s ease;
}

.primary:hover {
  background: var(--run-green-hover);
  box-shadow: 0 0 0 1px rgba(58, 167, 108, 0.5), 0 6px 18px -10px rgba(47, 143, 91, 0.9);
}

.primary:active {
  transform: translateY(1px);
}

.primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  box-shadow: none;
}

/* 运行中变成「危险」色：浅色主题下底色是浅红，靠 --danger-text 兜住可读性 */
.primary.is-running {
  color: var(--danger-text);
  background: var(--danger-bg);
}

.primary.is-running:hover {
  background: var(--danger-bg-hover);
  box-shadow: none;
}

.settings {
  position: relative;
}

.popover {
  position: absolute;
  top: 36px;
  right: 0;
  z-index: 40;
  width: 360px;
  padding: 12px;
  border-radius: 8px;
  background: var(--bg-raised);
  border: 1px solid var(--border);
  box-shadow: 0 18px 44px -18px rgba(0, 0, 0, 0.85);
}

.popover__title {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--text-dim);
}

.popover__title--gap {
  margin-top: 12px;
}

/* 引擎列表：整块可点，选中态靠左侧色条 + 描边区分 */
.engines {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.engine {
  display: block;
  width: 100%;
  padding: 7px 9px;
  border-radius: 6px;
  border: 1px solid transparent;
  border-left: 3px solid transparent;
  text-align: left;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.engine:hover {
  background: var(--bg-hover);
}

.engine.is-active {
  background: var(--bg-control);
  border-color: var(--border);
  border-left-color: var(--focus);
}

.engine__head {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text);
}

.engine__label {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 12.5px;
}

.engine__badge {
  flex: 0 0 auto;
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 10.5px;
  color: var(--text-dim);
  background: var(--case-chip-bg);
}

.engine__hint {
  display: block;
  margin-top: 3px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-faint);
}

.probe {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 10px;
}

.probe__message {
  flex: 1 1 auto;
  min-width: 0;
  padding-top: 5px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-dim);
  overflow-wrap: anywhere;
}

.probe__message.is-ok {
  color: var(--ok);
}

.probe__message.is-bad {
  color: var(--fail);
}

.popover__input {
  width: 100%;
  padding: 6px 8px;
  border-radius: 5px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  font-family: var(--mono-font);
  font-size: 12px;
}

.popover__hint {
  margin: 8px 0 0;
  font-size: 11.5px;
  line-height: 1.55;
  color: var(--text-faint);
}

.popover__hint code {
  font-family: var(--mono-font);
  color: var(--text-dim);
}

.popover__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
}

/* 省略号收纳位与菜单项：默认都不出现，只在对应图标被折叠的那一档才露出来 */
.more {
  position: relative;
  display: none;
}

.menu__item {
  display: none;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 8px;
  border-radius: 5px;
  color: var(--text);
  font-size: 12.5px;
  text-align: left;
}

.menu__item:hover {
  background: var(--bg-hover);
}

/* ---------- 窄屏：按优先级从低到高逐级舍弃 ----------
   顶栏没有 flex-wrap，而 .tool / .primary 都是 white-space: nowrap，所以宽度不够时既不换行
   也不省略，只是整体向右溢出、把运行按钮挤出视口。这里用断点主动丢掉低优先级内容。
   各档阈值不是经验值，是按元素实测宽度反推出来的（见 HANDOFF 第 8 节）。加进「?」按钮后重测：
   全展开必需 730px、折叠第 1 档后 499、第 2 档后 469、第 3 档后 431、第 4 档后 341、第 5 档后 296
   （实测含安装按钮，无头 Chrome 320–900px 逐档跑过均无溢出）。阈值都取比对应档位略大的一档：
   第 4 档必需 431 就把阈值从 420 抬到 460，341 > 320 所以补了第 5 档折本地运行环境。
   语言下拉是定宽的（选项里最长的「Python 3」决定宽度，切换语言不会变），会变的只有运行按钮文案在
   用例数变化时的那点宽度，而它在 ≤820 档已藏，余量留给这些波动。
   全部用 display: none（而非 visibility / opacity），顺带从无障碍树里摘掉。 */

/* 第 1 档：文字先让位 —— 品牌名与分隔线（装饰）、运行按钮文案（只留 ▶）
   文字进 display: none 后就不在无障碍树里了，按钮的可访名由模板上的 aria-label 承担 */
@media (max-width: 820px) {
  .brand__name,
  .brand__sep {
    display: none;
  }

  .primary > span {
    display: none;
  }
}

/* 第 2 档：语言下拉本身必须保留（切换语言会切各自的代码草稿），只拿掉“语言”两个字 */
@media (max-width: 560px) {
  .field__label {
    display: none;
  }
}

/* 第 3 档：图标开始从右到左折进省略号，先轮到最右的帮助和它左边的 swap。
   省略号自己占一格（约 44px 含 gap），所以每档都折走两颗，净值才是 -44px */
@media (max-width: 520px) {
  :deep(.help-button),
  .tool--icon {
    display: none;
  }

  .more {
    display: block;
  }

  .menu__item--help,
  .menu__item--swap {
    display: flex;
  }
}

/* 第 4 档：再往左轮两个 —— 评测引擎设置齿轮、安装按钮。
   阈值由 420 抬到 460：折叠三格后顶栏仍需约 431px（加装安装按钮），420 会溢出 */
@media (max-width: 460px) {
  .settings > .tool,
  .tool--install {
    display: none;
  }

  /* 齿轮按钮藏了，但它的弹层还挂在 .settings 里。display: contents 让 .settings 不再生成盒子：
     既腾出它自己那格，也让弹层脱离这个零宽锚点、改由下方 .popover 的 fixed 规则定位 */
  .settings {
    display: contents;
  }

  .menu__item--engine,
  .menu__item--install {
    display: flex;
  }
}

/* 第 5 档：最后轮到「本地运行环境」。折叠四格后仍需约 341px，320px 的窄机上还是会溢出，
   所以这一档补上；它的抽屉入口本来就在「更多」菜单里（.menu__item--panel 平时隐藏） */
@media (max-width: 380px) {
  :deep(.panel-button) {
    display: none;
  }

  .menu__item--panel {
    display: flex;
  }
}

/* 窄屏弹层改贴边整幅。弹层原是 right: 0 锚在栏中部的按钮上，375px 下实测 left = -28
   （左边被切掉）；单纯收窄 width 救不了，因为锚点本身就不在栏右端。阈值保持 520 —— 比齿轮
   折叠的第 4 档更早一档，齿轮还可见的那段宽度里弹层也走视口定位，比贴着栏中部更稳 */
@media (max-width: 520px) {
  .popover {
    position: fixed;
    top: 56px;
    right: 12px;
    left: 12px;
    width: auto;
  }
}
</style>
