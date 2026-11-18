<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import AppIcon from './AppIcon.vue'

/**
 * 全站自绘对话框底座（2026-11-19）。
 *
 * 只负责「壳」：Teleport、遮罩、玻璃卡面、焦点圈定 / 归还、Esc、点遮罩关闭、
 * 窄屏底部抽屉与入场动效。标题 / 正文 / 动作分别走 title、默认、footer 插槽，
 * 确认卡与表单卡共用同一套外壳，不再各写一份 .confirm / .meta。
 *
 * 动作按钮的样式是全局的 `.app-dialog__btn`（见 styles/base.css）：
 * 插槽内容的作用域属于调用方，scoped 样式够不到。
 *
 * ⚠️ Esc 仍绑在卡片上而不是 window：App 的全局快捷键 / 返回键栈靠
 * `event.defaultPrevented` 判断是否已被站点接管，绑在卡片上才能让
 * `.stop.prevent` 生效。焦点由这里圈住，Esc 一定落得到卡片。
 */
const props = defineProps({
  /** 标题；也可以用 title 插槽覆盖（两者都留空时只显示图标，不推荐） */
  title: { type: String, default: '' },
  /** AppIcon 名；留空则不显示图标块 */
  icon: { type: String, default: '' },
  /** default | warn | danger —— 只影响图标块与标题的语义色 */
  tone: { type: String, default: 'default' },
  /** dialog | alertdialog：不可逆动作传 alertdialog */
  role: { type: String, default: 'dialog' },
  /** sm 380 / md 460 / lg 520 */
  size: { type: String, default: 'sm' },
  /** 正文里描述段的 id，供读屏播报 */
  describedby: { type: String, default: '' },
  /** 打开时优先聚焦的选择器；不传就落到第一个可聚焦元素 */
  initialFocus: { type: String, default: '' },
  /** 导出那种三个并列落点：动作区改竖排、按钮拉满 */
  stackActions: { type: Boolean, default: false },
  closeOnBackdrop: { type: Boolean, default: true },
  /** 取消后是否把焦点还给打开前的元素；调用方自己接管时关掉 */
  restoreFocus: { type: Boolean, default: true },
})

const emit = defineEmits(['close'])

let seed = 0
const titleId = `app-dialog-title-${(seed += 1)}-${Math.random().toString(36).slice(2, 7)}`

const cardRef = ref(null)
let previousFocus = null

const widthClass = computed(() => `app-dialog__card--${props.size}`)
// 危险动作只染图标块与主按钮，标题保持正常前景色 —— 整行红字太重，
// 也与站内其它危险态（图标红、文字中性）不一致。
const titleClass = computed(() => ({
  'app-dialog__title--warn': props.tone === 'warn',
}))

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** 只收「当前真的能看见、能聚焦」的元素：隐藏字段 / display:none 的控件不进 Tab 环 */
function focusableElements() {
  if (!cardRef.value) return []
  return Array.from(cardRef.value.querySelectorAll(FOCUSABLE)).filter(
    (el) => el.getClientRects().length > 0 && el.getAttribute('aria-hidden') !== 'true',
  )
}

function focusInitial() {
  const preferred = props.initialFocus ? cardRef.value?.querySelector(props.initialFocus) : null
  const target = preferred ?? focusableElements()[0] ?? cardRef.value
  target?.focus()
}

/** Tab / Shift+Tab 在卡片内循环；焦点若被脚本挪出去，下一次 Tab 会拉回来 */
function trapTab(event) {
  const list = focusableElements()
  if (!list.length) {
    event.preventDefault()
    cardRef.value?.focus()
    return
  }
  const first = list[0]
  const last = list[list.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  } else if (!cardRef.value?.contains(document.activeElement)) {
    event.preventDefault()
    first.focus()
  }
}

function onBackdrop(event) {
  if (props.closeOnBackdrop && event.target === event.currentTarget) emit('close')
}

// body 本身通常已经 overflow:hidden；这里做一层计数锁，任何入口进来都不会滚到底下的页面
let scrollLocks = 0
let savedOverflow = ''

onMounted(() => {
  previousFocus = document.activeElement
  if (scrollLocks === 0) {
    savedOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  scrollLocks += 1
  nextTick(focusInitial)
})

onBeforeUnmount(() => {
  scrollLocks = Math.max(0, scrollLocks - 1)
  if (scrollLocks === 0) document.body.style.overflow = savedOverflow
  if (props.restoreFocus && previousFocus?.isConnected) previousFocus.focus()
})
</script>

<template>
  <Teleport to="body">
    <div class="app-dialog" @pointerdown.self="onBackdrop" @contextmenu.prevent>
      <div
        ref="cardRef"
        class="app-dialog__card"
        :class="widthClass"
        :role="role"
        aria-modal="true"
        :aria-labelledby="titleId"
        :aria-describedby="describedby || undefined"
        tabindex="-1"
        @keydown.tab="trapTab"
        @keydown.esc.stop.prevent="emit('close')"
      >
        <header class="app-dialog__head">
          <span
            v-if="icon"
            class="app-dialog__icon"
            :class="`app-dialog__icon--${tone}`"
            aria-hidden="true"
          >
            <AppIcon :name="icon" :size="16" />
          </span>
          <div class="app-dialog__heading">
            <h2 :id="titleId" class="app-dialog__title" :class="titleClass">
              <slot name="title">{{ title }}</slot>
            </h2>
            <div v-if="$slots.subtitle" class="app-dialog__subtitle">
              <slot name="subtitle" />
            </div>
          </div>
          <slot name="head-extra" />
        </header>

        <div class="app-dialog__body">
          <slot />
        </div>

        <footer
          v-if="$slots.footer"
          class="app-dialog__foot"
          :class="{ 'app-dialog__foot--stack': stackActions }"
        >
          <slot name="footer" />
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.app-dialog {
  position: fixed;
  inset: 0;
  z-index: 130;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: var(--dialog-scrim);
  backdrop-filter: blur(3px);
  animation: app-dialog-fade 120ms ease-out;
}

.app-dialog__card {
  display: flex;
  flex-direction: column;
  width: min(380px, 100%);
  max-height: calc(100dvh - 32px);
  padding: var(--dialog-pad);
  border: none;
  border-radius: var(--dialog-radius);
  background: var(--dialog-bg);
  box-shadow: var(--dialog-shadow);
  backdrop-filter: var(--dialog-backdrop);
  color: var(--text);
  outline: none;
  animation: app-dialog-pop 160ms cubic-bezier(0.16, 1, 0.3, 1);
}

.app-dialog__card--md {
  width: min(460px, 100%);
}

.app-dialog__card--lg {
  width: min(520px, 100%);
}

.app-dialog__head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  flex: none;
}

.app-dialog__icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 28px;
  height: 28px;
  margin-top: -2px;
  border-radius: 8px;
  background: var(--accent-face);
  color: var(--accent);
}

.app-dialog__icon--warn {
  background: var(--warn-face);
  color: var(--warn);
}

.app-dialog__icon--danger {
  background: var(--fail-face);
  color: var(--danger-text);
}

.app-dialog__heading {
  flex: 1 1 auto;
  min-width: 0;
}

.app-dialog__title {
  margin: 0;
  font-size: 14.5px;
  font-weight: 650;
  line-height: 1.35;
  letter-spacing: -0.01em;
  color: var(--text);
  overflow-wrap: anywhere;
}

.app-dialog__title--warn {
  color: var(--warn);
}

.app-dialog__subtitle {
  margin-top: 3px;
  font-size: 11.5px;
  line-height: 16px;
  color: var(--text-faint);
  overflow-wrap: anywhere;
}

.app-dialog__body {
  flex: 1 1 auto;
  min-height: 0;
  margin-top: 14px;
  overflow-y: auto;
  overscroll-behavior: contain;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text-dim);
}

.app-dialog__foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex: none;
  margin-top: 18px;
}

.app-dialog__foot--stack {
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
}

/* 窄屏（含触屏竖屏）：底部抽屉。上圆角 + safe-area，水平方向最宽 520px，
   平板竖屏不会拉成一整条。 */
:where(html.is-narrow) .app-dialog {
  align-items: flex-end;
  padding: 0;
}

:where(html.is-narrow) .app-dialog__card {
  width: min(520px, 100%);
  max-height: min(88dvh, 760px);
  border-radius: 12px 12px 0 0;
  padding-bottom: calc(var(--dialog-pad) + env(safe-area-inset-bottom, 0px));
  animation-name: app-dialog-sheet;
}

@keyframes app-dialog-fade {
  from {
    opacity: 0;
  }
}

@keyframes app-dialog-pop {
  from {
    opacity: 0;
    transform: translateY(6px) scale(0.96);
  }
}

@keyframes app-dialog-sheet {
  from {
    opacity: 0;
    transform: translateY(100%);
  }
}
</style>
