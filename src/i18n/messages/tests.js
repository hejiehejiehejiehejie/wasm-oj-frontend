/**
 * 评测样例面板与用例卡片的文案。
 *
 * 【省略行】**没有文案**：框里那行截断标记就是一个光秃秃的 `……`（2026-09-29 从
 * `…… 以下省略 {n} 个字符` 缩短而来），具体省略了多少由框下面那行说明承担。
 * 它由 `TestCaseCard.vue` 的两个**语言无关**的常量定义 —— `MARKER_SEED`（`\n\n……`，
 * `commitEdit` 靠 `indexOf` 定位它）/ `MARKER_KEY`（`……`，`onLongCopy` 判定选区里有没有它）——
 * 所以**别把它挪进这张消息表**：定位与判据都依赖那两个固定字面量。
 */
export default {
  'zh-CN': {
    tests: {
      panel: {
        ariaLabel: 'unnamed 评测面板',
        addFirst: '添加第一个用例',
        addCase: '添加测试样例',
        runAll: '运行全部测试用例',
      },

      empty: {
        title: '暂无测试用例',
        text: '点击下方按钮新增一个用例，填写标准输入与期望输出。',
      },

      /** 页头判定语。AC 是「通过」的通用说法，两套语言都不译。 */
      verdict: {
        noCases: '还没有测试用例',
        running: '运行中',
        allPassed: '全部 AC',
        /** 有结论过期时给不出确切通过数，用 ? 占位 */
        stale: '?/{total} AC',
        partial: '{passed}/{total} AC',
      },

      /** 页头耗时的 title，{time} 形如 120ms */
      elapsedTitle: '最慢用例耗时 {time}（只计运行段，不含编译）',

      card: {
        /** 徽标文案：跑完的用例改用判定码（AC/WA/CE/TLE/RE/ERR），这里只有「还没跑」和「正在跑」 */
        idle: '待运行',
        running: '运行中',
        expand: '展开该用例',
        collapse: '折叠该用例',
        runOne: '仅运行该用例',
        staleTitle: '代码或输入已改动，下面的结论来自上一次运行',
        staleLabel: '结果待刷新',
        timingTitle: '程序运行耗时（不含编译）',
        remove: '删除该用例',
        copyOutput: '复制实际输出',
        notRun: '尚未运行',

        /**
         * ⚠️ **这张表里**没有**输入框 / 期望输出 / 实际输出的小标题与输入框的占位提示**。
         * 它们三个是 `TestCaseCard.vue` 模板里写死的英文：`input` / `Expected Output` /
         * `Actual Output`（用户 2026-09-29 定的：三个并排的小标签要长得一致，都是拉丁词、
         * 由 CSS `text-transform: uppercase` 变大字，中英界面都不变）。
         * 中途曾试着全接 i18n（zh 给 `输入` / `期望输出` / `实际输出`），用户要求**改回去**。
         *
         * 于是**只剩期望输出的占位提示跟着语言走**：前面两个框的首行就被上面的标签说明了，
         * 占位再重复一遍是噪音，而期望输出这个框在空态默认可见、需要它自己说清楚。
         */
        expectedPlaceholder: '期望输出',

        copyFull: '复制完整内容（全选后 Ctrl+C 同样有效）',
        copyFullShort: '复制全部',
        /** 说明行：{n} 已格式化（带千分位）。框里只剩一个 `……`，具体的数落在这里 */
        omitted: '已省略 {n} 个字符',
      },

      /** 评测结论的 detail 文案：编排层（services/runner.js）写进卡片的状态补丁 */
      outcome: {
        compileFailed: '编译未通过',
        timeout: '运行超时 (TLE)',
        runtimeError: '运行期出错',
        serviceUnreachable: '评测服务不可达',
        failed: '评测失败（{outcome}）',
        /** {engine} 是引擎显示名 */
        unsupportedLanguage: '{engine} 引擎当前不支持这个语言，换一个引擎或改用 C++ / Python',
      },
    },
  },
  en: {
    tests: {
      panel: {
        ariaLabel: 'unnamed judge panel',
        addFirst: 'Add first test case',
        addCase: 'Add test case',
        runAll: 'Run all test cases',
      },

      empty: {
        title: 'No test cases yet',
        text: 'Use the button below to add one, then fill in the standard input and expected output.',
      },

      verdict: {
        noCases: 'No test cases',
        running: 'Running',
        allPassed: 'All AC',
        stale: '?/{total} AC',
        partial: '{passed}/{total} AC',
      },

      elapsedTitle: 'Slowest case took {time} (run phase only, excludes compilation)',

      card: {
        idle: 'Not run',
        running: 'Running',
        expand: 'Expand this case',
        collapse: 'Collapse this case',
        runOne: 'Run this case only',
        staleTitle: 'Code or input changed; the result below is from the previous run',
        staleLabel: 'Result stale',
        timingTitle: 'Program run time (excludes compilation)',
        remove: 'Delete this case',
        copyOutput: 'Copy actual output',
        notRun: 'Not run yet',

        // 与 zh-CN 那栏严格对应：三个小标题都是写死的英文，见 zh-CN 那侧的注释。
        // 别担心大小写——占位提示的大写由 CSS `text-transform: uppercase` 负责，与这里的写法无关。
        expectedPlaceholder: 'Expected output',

        copyFull: 'Copy the full content (Ctrl+C after Select All works too)',
        copyFullShort: 'Copy all',
        omitted: '{n} characters omitted',
      },

      outcome: {
        compileFailed: 'Compilation failed',
        timeout: 'Time limit exceeded (TLE)',
        runtimeError: 'Runtime error',
        serviceUnreachable: 'Judge service unreachable',
        failed: 'Judging failed ({outcome})',
        unsupportedLanguage:
          'The {engine} engine does not support this language; switch to another engine or use C++ / Python',
      },
    },
  },
}
