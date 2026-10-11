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
        addCase: '添加测试样例',
        runAll: '运行全部测试用例',
        /**
         * 运行闸门：活跃文件不是能判题的代码时，两个 ▶ 置灰，这句话同时充当
         * 页脚那行说明与它们的 title。「没打开文件」与「打开的不是代码」分开写。
         */
        runBlocked: '非代码文件不参与评测，无法运行',
        runBlockedNoFile: '没有打开的文件，无法运行',
      },

      empty: {
        /**
         * ⚠️ 这张表里**没有空态那行标题**：它就是 `TestPanel.vue` 模板里写死的
         * `No test cases yet.`（用户 2026-10-06 定），中英界面都不翻，与三个小标题
         * input / Expected / Actual 同一个理由。曾经有过 `title` 这一条（`暂无测试用例`
         * / `No test cases yet`）与一句说明 `text`，两点都在 2026-10-06 删掉了 ——
         * 别再好心把它们翻回来。
         * 下面这几条抓样提示是**另一回事、保留**：只在当前文件是一道题、样例还没到手时出现，
         * 它们仍然跟着界面语言走。
         *
         * 这一行提示只在「当前文件是一道题、而它的样例还是空的」时出现
         * （判据与状态机都在 useCompanionBridge.js 的 autoScrapeState）。
         * 三种状态的文案与那三个值一一对应，别只改一边。
         *
         * 「样例还没到手」这句被拆成三段：中间的「题目链接」是个可点的 <a>
         * （href 是当前文件的 meta.url，由 TestPanel 拼），三段合起来才是一句完整的话。
         * 改任何一段都要看另外两段，别把句子改断了。
         */
        awaitingFetchBefore: '打开',
        awaitingFetchLink: '题目链接',
        awaitingFetchAfter: '，浏览器插件会自动抓取样例',
        /**
         * 没检测到插件时的替代句（2026-10-06 收紧）：原来那句从「这是一道题目，样例还没到手。」
         * 开头，是空态还有说明文字时留下的 —— 现在空态标题已经把「没有用例」说完了
         * （写死的 No test cases yet.），再铺垫一遍就是啰嗦。现在只留「没人抓」这个坏消息
         * 与两步做法：原因 → 后果 → 怎么办，两句读完。
         */
        awaitingNoExtension:
          '未检测到浏览器插件，打开题目页也不会自动抓取样例。安装或重新加载插件后再刷新本页。',
        fetching: '正在从题目页自动抓取样例…',
        fetchFailed: '自动抓取样例没成功，重新打开题目页可以再试一次',
      },

      /** 页头判定语。AC 是「通过」的通用说法，两套语言都不译。 */
      verdict: {
        noCases: '无测试用例',
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
        /** 实际输出标签行上的第二个按钮：把 stdout 誊进期望输出（结论已过期的标记由写入那条路带上） */
        useActual: '把实际输出写入期望输出',
        notRun: '尚未运行',

        /**
         * ⚠️ 这张表里没有**输入框 / 期望输出 / 实际输出的小标题**：它们是 `TestCaseCard.vue`
         * 模板里写死的英文 `input` / `Expected` / `Actual`（用户 2026-09-29 定：三个并排的
         * 小标签要长得一致，都是拉丁词、由 CSS `text-transform: uppercase` 变大字，中英界面
         * 都不变；末二词 2026-10-06 砍掉 `Output`，那一行窄，而每个框本来就是「标题 + 框」，
         * Output 二字没有增量信息）。中途曾试着全接 i18n（zh 给 `输入` / `期望输出` / `实际输出`），
         * 用户要求**改回去**——小标题别再翻。
         *
         * 两个**占位提示**（框里的灰字）则跟着语言走：期望输出那个框空态默认可见，需要它自己
         * 说清楚；输入框那条 2026-10-06 按用户要求从写死的 `input` 接回本表（中文「输入」、
         * 英文仍是 `input`）。翻的只是框里的灰字，与上面「小标题不翻」不冲突。
         */
        inputPlaceholder: '输入',
        expectedPlaceholder: '期望输出',

        copyFull: '复制完整内容（全选后 Ctrl+C 同样有效）',
        copyFullShort: '复制全部',
        /**
         * 说明行：{n} 已格式化（带千分位）。框里只剩一个 `……`，具体的数落在这里。
         * **只有截断态会显示这一行**（2026-09-29 第四次定）：纯溢出态（字符一个没少、只是超出
         * 框高要滚动）不再出提示行 —— 那一行是废话，用户原话「纯溢出态就是没显示全，但是滚动
         * 就可以看到所有的」。曾用「已省略 {n} 个字符」，在那个状态下与框尾找不到 `……` 对不上，
         * 用户三次撞到；现在那句话只在真截断时出现，「未显示」的措辞也就没有歧义了。
         */
        omitted: '还有 {n} 个字符未显示',
      },

      /** 评测结论的 detail 文案：编排层（services/runner.js）写进卡片的状态补丁 */
      outcome: {
        compileFailed: '编译未通过',
        timeout: '运行超时 (TLE)',
        memoryExceeded: '运行内存超过当前上限 (MLE)',
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
        addCase: 'Add test case',
        runAll: 'Run all test cases',
        /** 见 zh-CN 那侧的说明 */
        runBlocked: 'Non-code files aren’t judged, so they can’t be run',
        runBlockedNoFile: 'No file is open, so there is nothing to run',
      },

      empty: {
        /** 见 zh-CN 那侧的说明：空态那行标题写死在 TestPanel.vue 里，这张表不管它。
         *  下面这几条与 autoScrapeState 的三个值一一对应，中间一段是可点的题目链接（见 zh-CN） */
        awaitingFetchBefore: 'Open the ',
        awaitingFetchLink: 'problem link',
        awaitingFetchAfter: ' and the browser extension will fetch the samples',
        /** 同 zh-CN：没检测到插件时的替代句（2026-10-06 收紧，与中文同结构） */
        awaitingNoExtension:
          'No browser extension was detected, so opening the problem page will not fetch any samples. Install or reload the extension, then refresh this page.',
        fetching: 'Fetching samples from the problem page…',
        fetchFailed: 'Could not fetch the samples automatically. Open the problem page again to retry',
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
        /** 同中文：实际输出那一行左侧那颗按钮（写入期望输出） */
        useActual: 'Write the actual output into Expected',
        notRun: 'Not run yet',

        // 与 zh-CN 那栏严格对应：三个小标题都是写死的英文（`input` / `Expected` / `Actual`），
        // 见 zh-CN 那侧的注释；只有两个框的占位提示走这张表。
        inputPlaceholder: 'input',
        expectedPlaceholder: 'Expected output',

        copyFull: 'Copy the full content (Ctrl+C after Select All works too)',
        copyFullShort: 'Copy all',
        /** 同中文：只有真截断（框尾有 `……`）时才显示这一行，纯溢出态不显示 */
        omitted: '{n} characters not shown',
      },

      outcome: {
        compileFailed: 'Compilation failed',
        timeout: 'Time limit exceeded (TLE)',
        memoryExceeded: 'Memory limit exceeded (MLE)',
        runtimeError: 'Runtime error',
        serviceUnreachable: 'Judge service unreachable',
        failed: 'Judging failed ({outcome})',
        unsupportedLanguage:
          'The {engine} engine does not support this language; switch to another engine or use C++ / Python',
      },
    },
  },
}
