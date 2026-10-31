<script setup>
/**
 * Android 端首次准备随包工具链时的等待遮罩。
 *
 * 为什么要有「延迟显形」这一手：已准备过的设备上那条命令几毫秒就回来，遮罩跟着一闪
 * 反而像出了故障。所以只有**真的停住**（超过 REVEAL_DELAY_MS）才画；失败不延迟、
 * 立刻显形 —— 这时候用户需要看见原因和「重试」。
 *
 * 只管这一件事：启动整条链路在 App.vue 的 onMounted 里发起（见 prepareNativeToolchain），
 * 这里只读状态、不发起。
 */
import { onBeforeUnmount, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { t } from '../i18n/index.js'
import { IS_ANDROID } from '../services/platform.js'
import { prepareNativeToolchain, toolchainError, toolchainState } from '../services/nativeToolchain.js'

/** 停在 preparing 超过这么久才真的画遮罩，见文件头 */
const REVEAL_DELAY_MS = 300

const visible = ref(false)
let revealTimer = null

function clearRevealTimer() {
  if (revealTimer !== null) {
    window.clearTimeout(revealTimer)
    revealTimer = null
  }
}

watch(
  toolchainState,
  (state) => {
    clearRevealTimer()
    if (state !== 'preparing') {
      // ready 收遮罩；failed 立刻显形（所以这两态都不排定时器）
      visible.value = state === 'failed'
      return
    }
    revealTimer = window.setTimeout(() => {
      revealTimer = null
      // 定时器醒来时可能已经跑完了，再确认一次状态
      if (toolchainState.value === 'preparing') visible.value = true
    }, REVEAL_DELAY_MS)
  },
  { immediate: true },
)

/** 「先进入」：不准备也能用编辑器，只是点运行会报缺编译器 */
function dismiss() {
  visible.value = false
}

onBeforeUnmount(clearRevealTimer)
</script>

<template>
  <div v-if="IS_ANDROID && visible" class="gate">
    <div
      class="gate__box"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="toolchain-gate-title"
    >
      <AppIcon
        :name="toolchainState === 'failed' ? 'alert' : 'cpu'"
        :size="26"
        class="gate__icon"
        :class="{ 'is-busy': toolchainState === 'preparing' }"
      />
      <p id="toolchain-gate-title" class="gate__title">
        {{ t(toolchainState === 'failed' ? 'app.toolchain.failedTitle' : 'app.toolchain.title') }}
      </p>
      <p class="gate__note">
        {{ toolchainState === 'failed' ? toolchainError : t('app.toolchain.note') }}
      </p>
      <div v-if="toolchainState === 'failed'" class="gate__actions">
        <button type="button" class="gate__action" @click="prepareNativeToolchain()">
          <AppIcon name="reset" :size="13" />
          <span>{{ t('app.retry') }}</span>
        </button>
        <button type="button" class="gate__action is-quiet" @click="dismiss">
          <span>{{ t('app.toolchain.skip') }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 铺满且不透明：这一层画出来时界面还没准备好，透出后面的半成品反而更乱 */
.gate {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--bg-editor);
}

.gate__box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  max-width: 320px;
  text-align: center;
}

.gate__icon {
  color: var(--text-dim);
}

/* 没有转圈之类的动效就看不出在干活；一次呼吸 1.4s，幅度压到不刺眼 */
.gate__icon.is-busy {
  animation: gate-pulse 1.4s ease-in-out infinite;
}

@keyframes gate-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.45;
  }
}

.gate__title {
  margin: 0;
  color: var(--text);
  font-size: 13.5px;
}

.gate__note {
  margin: 0;
  color: var(--text-faint);
  font-size: 12.5px;
  line-height: 1.6;
  /* 失败原因是机器原文，可能很长，允许换行且不撑破盒子 */
  overflow-wrap: anywhere;
}

.gate__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}

.gate__action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 4px;
  background: var(--accent);
  color: var(--text-on-accent);
  font-size: 12.5px;
}

:where(html.is-hoverable) .gate__action:hover {
  background: var(--accent-hover);
}

/* 「先进入」是退路不是主路，压低一级 */
.gate__action.is-quiet {
  background: transparent;
  color: var(--text-dim);
}

:where(html.is-hoverable) .gate__action.is-quiet:hover {
  background: var(--bg-hover);
  color: var(--text);
}
</style>
