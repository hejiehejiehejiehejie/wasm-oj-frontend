<script setup>
/**
 * Transient status for the semantic hover runtime (FR10 / FR11).
 *
 * It lives in the editor status bar: download progress, PCH warm-up, wake-up
 * after hibernation, long-running queries, and the bounded auto-retry after a
 * load failure (外加预算耗尽后那颗手动「重试」，见 semanticHover 的 scheduleAutoRetry).
 * The module is imported lazily and only while the setting is on, so
 * users who never enable semantic hover pay neither the chunk nor the runtime.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import LoadingSpinner from './LoadingSpinner.vue'
import { t } from '../i18n/index.js'
import { editorSettings } from '../services/editorSettings.js'

const phase = ref('idle')
const percent = ref(0)
const attempt = ref(0)
const attemptMax = ref(0)
let unsubscribe = null
let retry = null
let binding = null

async function bind() {
  if (unsubscribe || binding) return
  binding = import('../services/monaco/semanticHover.js')
    .then((module) => {
      retry = module.retrySemanticHover
      unsubscribe = module.onSemanticStateChange((state) => {
        phase.value = state.phase
        percent.value = state.percent
        attempt.value = state.attempt
        attemptMax.value = state.attemptMax
      })
    })
    .catch(() => {
      /* chunk load failure: hover still falls back to the static table */
    })
    .finally(() => {
      binding = null
    })
}

function release() {
  unsubscribe?.()
  unsubscribe = null
  retry = null
  phase.value = 'idle'
}

watch(
  () => editorSettings.value.semanticHover,
  (enabled) => {
    if (enabled) void bind()
    else release()
  },
)
onMounted(() => {
  if (editorSettings.value.semanticHover) void bind()
})
onBeforeUnmount(release)

const text = computed(() => {
  switch (phase.value) {
    case 'downloading':
      return t('semanticHover.statusDownloading', { percent: percent.value })
    case 'warming':
      return t('semanticHover.statusWarming')
    case 'waking':
      return t('semanticHover.statusWaking')
    case 'querying':
      return t('semanticHover.statusQuerying')
    case 'retrying':
      return t('semanticHover.statusRetrying', { attempt: attempt.value, max: attemptMax.value })
    case 'error':
      return t('semanticHover.downloadFailed')
    default:
      return ''
  }
})

function handleRetry() {
  void retry?.()
}
</script>

<template>
  <span v-if="text" class="semantic-status" :class="{ 'is-error': phase === 'error' }" role="status">
    <LoadingSpinner v-if="phase !== 'error'" :size="10" />
    <span class="semantic-status__text">{{ text }}</span>
    <button
      v-if="phase === 'error'"
      type="button"
      class="semantic-status__retry"
      @click="handleRetry"
    >
      {{ t('semanticHover.retry') }}
    </button>
  </span>
</template>

<style scoped>
.semantic-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  max-width: 40%;
  overflow: hidden;
}

.semantic-status__text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.semantic-status.is-error {
  color: var(--danger-text);
}

/* Text button: the status bar is only 22px tall, so no padding or border box
   that would push the row taller. */
.semantic-status__retry {
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  color: inherit;
  text-decoration: underline;
  cursor: pointer;
}
</style>
