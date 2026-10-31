<script setup>
/**
 * MarkdownPreview —— 题解预览面板。
 *
 * 职责只有两件事：把正文渲染出来（管线在 services/mdRenderer.js），以及和编辑器对好滚动位置。
 * 它不认识 Monaco：滚动同步是单向的「你告诉我比例 / 我告诉你比例」，具体谁是谁由 EditorPane 牵线。
 *
 * 渲染器（marked + katex）是按需下载的，没下载时这里给一块「去下载」的入口，
 * 而不是显示一张空白页 —— 这正是题解功能与判题功能共用同一套「本地运行环境」说法的原因。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { t } from '../i18n/index.js'
import { renderMarkdown } from '../services/mdRenderer.js'
import { preload } from '../services/wasmRuntime.js'
import AppIcon from './AppIcon.vue'
import LoadingSpinner from './LoadingSpinner.vue'

const props = defineProps({
  source: { type: String, default: '' },
  /**
   * 面板是否露在外面。没露出来时不渲染：非 .md 文件、「仅编辑」与「全屏编辑」三种情况下
   * 这份组件都还挂在 DOM 里（v-show 保住滚动位置），没必要跟着正文变化空转。
   */
  visible: { type: Boolean, default: false },
})

const emit = defineEmits(['scroll'])

const body = ref(null)
/** pending（还没渲染出第一版）→ ready / missing（渲染器未下载）/ downloading / failed */
const status = ref('pending')
const progress = ref('')
const failure = ref('')

const ready = computed(() => status.value === 'ready')

let timer = 0
/** 渲染序号：延迟渲染与「点了下载立刻渲染」可能撞在一起，只认最后一次的结果 */
let token = 0

async function render() {
  const container = body.value
  if (!container) return
  const mine = ++token
  try {
    await renderMarkdown(props.source, container)
    if (mine !== token) return
    status.value = 'ready'
    restoreScroll()
  } catch (error) {
    if (mine !== token) return
    if (error?.code === 'MD_RUNTIME_MISSING') {
      status.value = 'missing'
      return
    }
    status.value = 'failed'
    failure.value = error?.message || String(error)
  }
}

/**
 * 停手再渲染。打字时正文逐字在变，每个字符都重排整篇 markdown 与全部公式会明显拖手；
 * 这点延迟也顺手把「切文件」带起的一串变更合成一次。
 */
function schedule(delay = 160) {
  window.clearTimeout(timer)
  timer = window.setTimeout(() => void render(), delay)
}

watch(
  () => [props.source, props.visible],
  () => {
    if (!props.visible) return
    // 缺渲染器 / 正在下载时不再自动重试：每次重渲染都要翻一遍 Cache Storage，
    // 而结论不会变 —— 等用户点了「下载渲染器」再渲染
    if (status.value === 'missing' || status.value === 'downloading') return
    schedule(status.value === 'pending' ? 0 : 160)
  },
)

onMounted(() => {
  // watch 不带 immediate：挂载那一帧 ref 还没绑上容器，第一次渲染放在这里最稳
  if (props.visible) schedule(0)
})

onBeforeUnmount(() => window.clearTimeout(timer))

/** 下载渲染器。与设置面板那颗按钮走同一个服务，下完这里直接就能渲染 */
async function download() {
  if (status.value === 'downloading') return
  status.value = 'downloading'
  failure.value = ''
  progress.value = t('app.md.preview.downloading')
  const result = await preload('markdown', undefined, (update) => {
    progress.value = update.message
  })
  if (result.type === 'ready') {
    await render()
    return
  }
  if (result.type === 'failure') {
    status.value = 'failed'
    failure.value = result.message || t('runtime.failed')
    return
  }
  status.value = 'missing'
}

// ---------------------------------------------------------------- 滚动同步

/**
 * 上一次是「我自己设的 scrollTop」，用来吃掉由它引发的那一发 scroll 事件 ——
 * 否则编辑器滚 → 预览滚 → 预览又回话 → 编辑器再滚，来回弹。
 *
 * 判据是**比数值**而不是挂个布尔标志：标志得靠「事件什么时候到」来清，
 * 而 Monaco 与浏览器派发滚动事件的时机并不一致，比数值则与时机无关
 * （回音的比例必然几乎相等，1% 的容差足够盖住 scrollTop 的整数取整）。
 */
let programmatic = null
const ECHO_EPSILON = 0.01

/**
 * 两侧最近一次对上的比例。
 *
 * 【为什么必须有它】重渲染是 `innerHTML = …`，会把预览的 scrollTop 归零。而编辑器的滚动
 * 只在自己位置**变化**时才发事件 —— 典型场景是「一边打字一边被自动带到文末」：那些滚动
 * 事件发生在正文还没重排完的时候（预览此刻还不够高，同步过来也是空转），等正文终于渲染好，
 * 编辑器已经不滚了，于是预览孤零零地停在顶部。渲染完按这个比例把位置放回去，就补上了这一跳。
 */
let lastRatio = 0

function ratioOf(element) {
  const range = element.scrollHeight - element.clientHeight
  return range > 0 ? element.scrollTop / range : 0
}

/**
 * 重渲染后把滚动位置放回去（见 lastRatio 的说明）。
 * 设 programmatic 是为了让它自己引发的那一发 scroll 被当成回音吞掉 ——
 * 否则这一跳会顺着「emit → 编辑器 setScrollTop → 编辑器回事件」再绕一圈。
 */
function restoreScroll() {
  const element = body.value
  if (!element || !lastRatio) return
  const range = element.scrollHeight - element.clientHeight
  if (range <= 0) return
  programmatic = lastRatio
  element.scrollTop = lastRatio * range
}

function onScroll() {
  const element = body.value
  if (!element) return
  const ratio = ratioOf(element)
  if (programmatic !== null && Math.abs(ratio - programmatic) < ECHO_EPSILON) {
    programmatic = null
    return
  }
  programmatic = null
  lastRatio = ratio
  emit('scroll', ratio)
}

/** 编辑器滚了：按同一比例把预览滚过去（由 EditorPane 调用） */
function syncScroll(ratio) {
  // 先记下来：此刻预览可能还没重排完（内容比编辑器短、根本滚不动），
  // 但等这一版正文渲染完，render() 会照这个比例把位置放回去
  lastRatio = ratio
  const element = body.value
  if (!element) return
  const range = element.scrollHeight - element.clientHeight
  if (range <= 0) return
  programmatic = ratio
  element.scrollTop = ratio * range
}

defineExpose({ syncScroll })
</script>

<template>
  <div class="md-preview">
    <div v-if="!ready" class="md-preview__gate">
      <AppIcon name="markdown" :size="26" class="md-preview__gate-icon" />
      <p class="md-preview__gate-title">
        <LoadingSpinner v-if="status === 'pending'" :size="12" />
        <span>{{ t(`app.md.preview.state.${status}`) }}</span>
      </p>
      <p v-if="status === 'missing'" class="md-preview__gate-hint">
        {{ t('app.md.preview.missingHint') }}
      </p>
      <p v-else-if="status === 'failed'" class="md-preview__gate-hint">{{ failure }}</p>
      <button
        v-if="status === 'missing' || status === 'downloading' || status === 'failed'"
        type="button"
        class="md-preview__action"
        :disabled="status === 'downloading'"
        @click="download"
      >
        <LoadingSpinner v-if="status === 'downloading'" :size="12" />
        <AppIcon v-else :name="status === 'failed' ? 'reset' : 'download'" :size="13" />
        <span>{{ status === 'downloading' ? progress : status === 'failed' ? t('app.retry') : t('app.md.preview.download') }}</span>
      </button>
    </div>

    <div v-show="ready" ref="body" class="md-preview__body" @scroll="onScroll"></div>
  </div>
</template>

<style scoped>
.md-preview {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  /* 预览就长在编辑区那块面上（双栏时占右半边），底色跟 Monaco 内芯走同一个变量，
     切「仅编辑器 / 双栏 / 仅预览」时不会有一半深一半浅的接缝 */
  background: var(--bg-editor-pane);
}

.md-preview__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  /* 底部留白按段落间距给就够：编辑器那边 scrollBeyondLastLine 是关的（见 editorOptions.js），
     两边都滚不过正文末尾，比例同步在末尾自然对齐 */
  padding: 14px 18px 32px;
  color: var(--text);
  font-size: 13.5px;
  line-height: 1.75;
  /* 长公式与长链接不换行，允许自己横向滚 */
  overflow-wrap: break-word;
}

.md-preview__gate {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  text-align: center;
}

.md-preview__gate-icon {
  color: var(--icon-markdown);
  opacity: 0.9;
}

.md-preview__gate-title {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin: 4px 0 0;
  font-size: 13.5px;
  color: var(--text);
}

.md-preview__gate-hint {
  max-width: 30em;
  margin: 0;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text-dim);
}

.md-preview__action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  padding: 5px 12px;
  border-radius: 4px;
  background: var(--accent);
  color: var(--text-on-accent);
  font-size: 12.5px;
}

:where(html.is-hoverable) .md-preview__action:hover:not(:disabled) {
  background: var(--accent-hover);
}

.md-preview__action:disabled {
  opacity: 0.7;
  cursor: default;
}

/* ------------------------------------------------------------ 正文排版
   内容来自 v-html，样式只能靠 :deep 透进去；颜色一律取 base.css 的变量，
   两套主题（dark / light）自动跟着走 */

.md-preview__body :deep(> :first-child) {
  margin-top: 0;
}

.md-preview__body :deep(h1),
.md-preview__body :deep(h2),
.md-preview__body :deep(h3),
.md-preview__body :deep(h4),
.md-preview__body :deep(h5),
.md-preview__body :deep(h6) {
  margin: 20px 0 10px;
  font-weight: 600;
  line-height: 1.4;
}

.md-preview__body :deep(h1) {
  font-size: 1.5em;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border-soft);
}

.md-preview__body :deep(h2) {
  font-size: 1.25em;
  padding-bottom: 5px;
  border-bottom: 1px solid var(--border-soft);
}

.md-preview__body :deep(h3) {
  font-size: 1.1em;
}

.md-preview__body :deep(h4),
.md-preview__body :deep(h5),
.md-preview__body :deep(h6) {
  font-size: 1em;
}

.md-preview__body :deep(p) {
  margin: 0 0 12px;
}

.md-preview__body :deep(ul),
.md-preview__body :deep(ol) {
  margin: 0 0 12px;
  padding-left: 22px;
}

.md-preview__body :deep(li) {
  margin: 3px 0;
}

.md-preview__body :deep(li > ul),
.md-preview__body :deep(li > ol) {
  margin: 3px 0;
}

.md-preview__body :deep(blockquote) {
  margin: 0 0 12px;
  padding: 2px 0 2px 12px;
  border-left: 3px solid var(--border);
  color: var(--text-dim);
}

.md-preview__body :deep(a) {
  color: var(--info);
  text-decoration: none;
}

:where(html.is-hoverable) .md-preview__body :deep(a:hover) {
  text-decoration: underline;
}

.md-preview__body :deep(strong) {
  font-weight: 600;
}

.md-preview__body :deep(hr) {
  height: 0;
  margin: 18px 0;
  border: 0;
  border-top: 1px solid var(--border-soft);
}

.md-preview__body :deep(img) {
  max-width: 100%;
}

.md-preview__body :deep(code) {
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--bg-control);
  font-family: var(--mono-font);
  font-size: 0.92em;
}

.md-preview__body :deep(pre) {
  margin: 0 0 12px;
  padding: 10px 12px;
  border: 1px solid var(--border-soft);
  border-radius: 6px;
  background: var(--bg-card);
  overflow-x: auto;
}

.md-preview__body :deep(pre code) {
  padding: 0;
  background: none;
  font-size: 0.92em;
  line-height: 1.6;
}

.md-preview__body :deep(table) {
  margin: 0 0 12px;
  border-collapse: collapse;
  font-size: 0.96em;
}

.md-preview__body :deep(th),
.md-preview__body :deep(td) {
  padding: 4px 10px;
  border: 1px solid var(--border-soft);
}

.md-preview__body :deep(th) {
  background: var(--bg-card-head);
  font-weight: 600;
}

/* 公式空壳：行内那枚由 KaTeX 自己对齐基线，块级那枚要自己撑满一行并允许横向滚
   （katex-display 会再套一层自己的居中与滚动） */
.md-preview__body :deep(.md-math[data-display='1']) {
  display: block;
  margin: 12px 0;
  overflow-x: auto;
  overflow-y: hidden;
}
</style>