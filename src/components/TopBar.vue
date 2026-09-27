<script setup>
import { ref } from 'vue'
import AppIcon from './AppIcon.vue'
import { LANGUAGES } from '../services/templates.js'
import { openSettingsTab, settingsTab } from '../services/settingsTab.js'
import { useInstallPrompt } from '../composables/useInstallPrompt.js'

// 顶栏只剩「打开设置页签」这一个入口：评测引擎设置与使用帮助都在 2026-09 并进设置视图，
// 顶栏不再有自己的弹层 / 抽屉，因此这里也不再有 judge / connection 之类的 props。
const props = defineProps({
  language: { type: String, required: true },
  running: Boolean,
  total: { type: Number, default: 0 },
})

const emit = defineEmits([
  'update:language',
  'toggle-sidebar',
  'run-all',
])

const moreOpen = ref(false)

// 浏览器判定可安装后才会亮出这个按钮，装完（或已在独立窗口里）自动消失
const { canInstall, install } = useInstallPrompt()

/* 窄屏折进省略号的几项。动作复用栏里那几颗按钮的同一个开关，
   不复制组件，所以设置页签始终只有一份入口；点完顺手收起菜单。 */
function openSettings() {
  moreOpen.value = false
  openSettingsTab()
}

function runInstall() {
  moreOpen.value = false
  install()
}
</script>

<template>
  <header class="topbar">
    <button
      class="tool tool--sidebar"
      title="切换资源管理器"
      aria-label="切换资源管理器"
      @click="emit('toggle-sidebar')"
    >
      <AppIcon name="sidebar" :size="15" />
    </button>

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

    <!-- 设置入口：打开编辑器里那个与代码文件平级的「设置」页签（原来是个右侧抽屉）。
         沿用 .tool 的尺寸（与旧 .gear-button 逐项相同：28px 高、0 9px 内边距、gap 7），
         这样顶栏各档断点的宽度口径不用重新量 -->
    <button
      class="tool gear-button"
      :class="{ 'is-active': settingsTab.active }"
      title="设置"
      aria-label="设置"
      @click="openSettings"
    >
      <AppIcon name="gear" />
    </button>

    <button
      v-if="canInstall"
      class="tool tool--install"
      title="把 CPH IDE 安装到这台设备，之后可独立窗口打开"
      aria-label="安装到设备"
      @click="install"
    >
      <AppIcon name="install" :size="15" />
    </button>

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
        <button class="menu__item menu__item--editor" @click="openSettings">
          <AppIcon name="gear" :size="15" />
          <span>设置</span>
        </button>
        <button v-if="canInstall" class="menu__item menu__item--install" @click="runInstall">
          <AppIcon name="install" :size="15" />
          <span>安装到设备</span>
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
   各档阈值来自实测（把按钮的 flex-shrink 关掉量「自然宽度」，无头 Chrome 300–900px 逐像素
   跑过，触摸屏与鼠标两套均无溢出、无按钮被挤扁，见 HANDOFF 第 3 节）。

   2026-09：评测引擎设置齿轮 + 帮助按钮一起并进设置视图，顶栏少了 35 + 35 + 两个 gap
   （共 90px），断点从五档收到四档（第 3 档原先是「折帮助」，那颗按钮已不在 DOM 里）。
   现在只剩「安装」与「设置齿轮」两颗可折：安装折进省略号（自己占的那格正好抵掉，净值 0，
   主要是给它一个窄屏去处），设置齿轮按需求留到视口窄于 350px 才交出去。

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

/* 第 3 档：安装折进省略号。省略号自己占一格，折一颗净值是 0，这一档本身不为省宽度，
   只为给「安装」一个窄屏入口（它在桌面端本就是可选按钮） */
@media (max-width: 520px) {
  .tool--install {
    display: none;
  }

  .more {
    display: block;
  }

  .menu__item--install {
    display: flex;
  }
}

/* 第 4 档：设置齿轮（打开设置页签）留到最后，视口窄于 350px 才折走。
   写 349 而不是 350：口径是「宽度小于 350px 再消失」，max-width: 349px 正好等价
   （350px 那档它仍在栏里）。它也是「设一次」的偏好，窄屏入口在 .menu__item--editor */
@media (max-width: 349px) {
  .gear-button {
    display: none;
  }

  .menu__item--editor {
    display: flex;
  }
}
</style>
