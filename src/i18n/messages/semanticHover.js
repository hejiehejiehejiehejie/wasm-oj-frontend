/**
 * Text for the semantic hover status strip (components/EditorSemanticStatus.vue).
 *
 * The strip is transient: it only appears while the toolchain is downloading,
 * the PCH is warming, the runtime is waking up, or a query is running long
 * enough to be worth showing. `percent` is interpolated as `{percent}`.
 */
export default {
  'zh-CN': {
    semanticHover: {
      statusDownloading: '正在下载语义工具链 ({percent}%)...',
      statusWarming: '正在预热语义头文件 (PCH)...',
      statusWaking: '正在唤醒语义分析引擎...',
      statusQuerying: '正在分析语义...',
      statusReady: '语义分析已就绪',
      downloadFailed: '语义分析工具链加载失败，已回退至基础悬停提示。',
      retry: '重试',
      metricsSummary: '命中率 {hitRate}% · p50 {p50}ms · p95 {p95}ms',
    },
  },
  en: {
    semanticHover: {
      statusDownloading: 'Downloading semantic toolchain ({percent}%)...',
      statusWarming: 'Warming up precompiled headers (PCH)...',
      statusWaking: 'Waking up semantic engine...',
      statusQuerying: 'Analyzing semantics...',
      statusReady: 'Semantic analysis ready',
      downloadFailed: 'Failed to load semantic toolchain. Fell back to basic hover.',
      retry: 'Retry',
      metricsSummary: 'Hit rate {hitRate}% · p50 {p50}ms · p95 {p95}ms',
    },
  },
}
