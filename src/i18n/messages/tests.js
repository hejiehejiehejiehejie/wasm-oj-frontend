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
        /** 页脚「添加测试样例」的原生 title（2026-10-24 凌晨加快捷键）：动作名 + 绑定表里的组合键，
            口径与 `runAllTip` 同一套 */
        addCaseTip: '添加测试样例（{key}）',
        runAll: '运行全部测试用例',
        /** 页脚主按钮的原生 title（2026-10-24 凌晨加快捷键）：动作名 + 绑定表里的组合键，
            括号写法中英各一套（全角 / 半角），别在代码里拼字符串 */
        runAllTip: '运行全部测试用例（{key}）',
        /** 页脚主按钮上的可见文字（2026-10-24 加）：title 走 `runAllTip`（解绑快捷键时退回 `runAll`），
            这条要短到窄侧栏也放得下 */
        runAllLabel: '运行全部',
        /** 紧凑底栏那颗「只跑当前样例」的可见文字（2026-11-20 方案二）：与右钮「运行全部」成对 */
        runOneLabel: '运行',
        /** 左钮的悬停说明：明确「只跑这一条」，不让人误解成单元测试 */
        runOneTip: '仅运行当前样例（样例 {n}）',
        /**
         * 运行闸门：活跃文件不是能判题的代码时，两个 ▶ 置灰，这句话同时充当
         * 空态标题 / 页脚说明与它们的 title。「没打开文件」与「打开的不是代码」分开写。
         *
         * 2026-11-18 起这两条**都兼职空态那行标题**（跑不了时顶掉写死的
         * `No test cases yet.`，见 TestPanel 的 `emptyTitle`；2026-11-17 那版只有
         * `runBlockedNoFile` 兼职，2026-11-18 放宽到两条都是）—— 列表非空时页脚那行
         * 兜底再说一次，列表空着时只说标题这一处。所以两条的两种语言都必须能独立成句，
         * 别写成「同上」「见上」这类依赖上下文的短语。
         */
        runBlocked: '非代码文件无法运行',
        runBlockedNoFile: '没有打开的文件',
      },

      empty: {
        /**
         * ⚠️ 这张表里**没有空态那行标题**：它就是 `TestPanel.vue` 模板里写死的
         * `No test cases yet.`（用户 2026-10-06 定），中英界面都不翻，与三个小标题
         * input / Expected / Actual 同一个理由。曾经有过 `title` 这一条（`暂无测试用例`
         * / `No test cases yet`）与一句说明 `text`，两点都在 2026-10-06 删掉了 ——
         * 别再好心把它们翻回来。
         *
         * **唯一的例外（2026-11-17 加，2026-11-18 放宽）**：跑不了（`runBlocked` 非空）
         * 时，那行标题改用闸门原因 —— 打开的不是代码用 `panel.runBlocked`
         * （「非代码文件无法运行」/ `Non-code files cannot run`），什么都没打开用
         * `panel.runBlockedNoFile`（「没有打开的文件」/ `No file is open`）——
         * 空列表上写「没有用例」在这些场景里是废话，「为什么跑不了」才是用户要知道的。
         * 它不是这张表新增的 `title` 条目，仍然按语言走；这句原先在页脚重复出现，
         * 现在列表空着时只在空态里说一次（列表非空时页脚兜底，见 TestPanel 的
         * `footBlocked`）。其余情形（有能跑的代码、只是没用例）照旧写死英文。
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
         *
         * 2026-11-12 起这句同样拆成三段，与上面 `awaitingFetch*` 一个体例：中间的
         * 「安装或重载插件」是本页内部的一个跳转（打开设置 › 浏览器插件那一栏，
         * 由 App.vue 的 emptyNotice 给 action），不是一个外链 —— 所以三段之间没有空格，
         * 改任何一段都要看另外两段。
         */
        awaitingNoExtensionBefore:
          '未检测到浏览器插件，打开题目页不会自动抓取样例。',
        awaitingNoExtensionLink: '安装或重载插件',
        awaitingNoExtensionAfter: '后刷新本页。',
        fetching: '正在从题目页自动抓取样例…',
        fetchFailed: '抓取样例失败，重新打开题目页可重试',
      },

      /**
       * 页头判定语。AC 是「通过」的通用说法，两套语言都不译。
       * *Short 三条是窄侧栏用的（侧栏 <400 逻辑 px 时 Sidebar 给出 verdictCompact，
       * TestPanel 换用这组，2026-10-12；2026-11-01 起这条阈值比胶囊标签的 350 更宽，
       * 判定文案先收、胶囊标签后收）：计数那两条去掉「 AC」后缀（数字本身已表意），
       * 「全部 AC」那条只留 `AC` —— 不能写成「全部」，那样读不出判定结论。
       */
      verdict: {
        noCases: '无测试用例',
        running: '运行中',
        allPassed: '全部 AC',
        allPassedShort: 'AC',
        /** 有结论过期时给不出确切通过数，用 ? 占位 */
        stale: '?/{total} AC',
        staleShort: '?/{total}',
        partial: '{passed}/{total} AC',
        partialShort: '{passed}/{total}',
      },

      /** 页头耗时的 title，{time} 形如 120ms */
      elapsedTitle: '最慢用例 {time}（不含编译）',

      /**
       * 输出比对方式（2026-10-25 加；2026-11-09 加 strict、全局设置）。
       * 内置默认是逐行，其余几档在 设置 › 评测 › 输出比对 里选，或按题开启
       * （题目信息弹窗的「输出比对」，优先级高于全局设置）。
       * 名字要短 —— 它同时出现在设置页的下拉、题目信息的下拉和卡片差异块的角上。
       */
      checker: {
        lines: '逐行比对',
        tokens: '忽略空白',
        strict: '严格逐字符',
        float: '浮点容差',
        unordered: '忽略行序',
      },

      /**
       * 「一键提交到 Codeforces」（2026-10-23 加）。
       * 按钮文案与三条闸门说的是同一件事：能不能交、为什么不能交。
       * verdict 里翻的是判定码的含义，判定码本身（AC / WA …）当标题用，不翻。
       */
      submit: {
        button: '提交到 Codeforces',
        /** 那颗纯图标按钮的原生 title（2026-10-24 凌晨）：`button` 加上它的快捷键，
            口径与 `panel.runAllTip` / `panel.addCaseTip` 同一套；解绑时退回 `button` */
        buttonTip: '提交到 Codeforces（{key}）',
        submitting: '提交中…',
        submittedTitle: '已提交到 Codeforces',
        submittedMessage: '提交 #{id}',
        submittedUnknown: '已提交，结果请到 Codeforces 查看',
        failedTitle: '提交失败',

        /* 判定通知的细节行（2026-10-23 加）：数字来自官方 API 的 Submission。
           AC 报一共过了几个测试点；挂掉的报是第几个测试点（passedTestCount + 1） */
        detailPassed: '通过 {n} 个测试点',
        detailFailedOn: '测试点 {n}',

        /* 确认弹窗（2026-10-23 加）：提交会在 Codeforces 上留一条真实记录、删不掉，
           所以点按钮 / 按快捷键都先停在这里，点「确认提交」才发。
           标题直接问「是否提交 <文件名>」（2026-10-24 改，原先那句「生成真实记录、无法撤回」
           换成了这句问句；文件名太长会折行） */
        confirmTitle: '是否提交 {name} 到 Codeforces？',
        confirmAction: '确认提交',
        targetChanged: '当前文件已切换，这次提交没有发出',

        /* 同一份源码重复提交（2026-10-23 加）：CF 会原样刷回提交页并提示
           「You have submitted exactly the same code before」，不生成提交记录 */
        duplicateTitle: '这份代码已经提交过',
        duplicateDesc:
          '「{name}」与上次提交的代码相同，Codeforces 会拒收。修改后再交，或仍然提交。',
        duplicateAction: '仍然提交',
        duplicateRejected: '与上次提交相同，Codeforces 拒收',
        busy: '正在运行或提交，请稍后再试',

        blockedDesktop: '桌面端不支持一键提交',
        blockedNoFile: '没有打开的文件',
        blockedNoProblem: '文件未关联题目',
        blockedOj: '只支持提交到 Codeforces',
        blockedLanguage: '仅支持 C++ / Python 文件',
        blockedChecking: '正在检测插件…',
        blockedExtension: '需要含提交能力的 CC for Web 插件',

        reason: {
          unsupported: '插件版本过旧，不支持提交',
          unsupportedUrl: '无法识别题目地址',
          timeout: 'Codeforces 回应超时',
          notLoggedIn: '浏览器未登录 Codeforces',
          challenge: 'Codeforces 需要人机验证，请完成后再重试',
          problemMissing: '提交页找不到这道题（可能未开放提交）',
          languageMissing: '提交页找不到对应编译器',
          rejected: 'Codeforces 拒收（重复提交或比赛未开放）',
          noTab: '打不开 Codeforces 提交页',
          page: '提交页无法识别（站点可能已改版）',
          empty: '文件为空',
          unknown: '提交未成功',
        },

        verdict: {
          ac: '通过',
          wa: '答案错误',
          tle: '运行超时',
          mle: '内存超限',
          re: '运行出错',
          ce: '编译错误',
          other: '其它结果',
        },
      },

      card: {
        /** 卡片标题：原先只显示一个序号，认不出这是「第几个样例」（2026-10-24 改） */
        title: '样例 {n}',
        /** 徽标文案：跑完的用例改用判定码（AC/WA/CE/TLE/RE/ERR），这里只有「还没跑」和「正在跑」 */
        idle: '待运行',
        running: '运行中',
        expand: '展开该用例',
        collapse: '折叠该用例',
        runOne: '仅运行该用例',
        staleTitle: '代码或输入已改动，结论来自上次运行',
        staleLabel: '结果待重测',
        /** 窄容器下的短称（卡片头栏 @container 22.5rem 那一档换用它） */
        staleLabelShort: '待重测',
        timingTitle: '程序运行耗时（不含编译）',
        remove: '删除该样例',
        copyOutput: '复制实际输出',
        /** 实际输出标签行上的第二个按钮：把 stdout 誊进期望输出（结论已过期的标记由写入那条路带上） */
        useActual: '实际输出写入期望',
        /** 跑过但 stdout 与诊断都为空时框里的字；「没跑过」不显示整个 ACTUAL 块 */
        emptyOutput: '输出为空',

        /**
         * 输入 / 期望输出 / 实际输出的小标题（2026-11-20 用户要求统一语言）：
         * 卡片流与底部工作台都走这张表，不再写死 `input / Expected / Actual`；
         * 两个框内的占位提示同日移除 —— 初始状态保持空白，不再显示「输入」「期望输出」。
         */
        field: {
          input: '输入',
          expected: '期望输出',
          actual: '实际输出',
        },
        /** 卡片流两个框内的占位提示（2026-11-20 卡片流恢复原版后重新启用；分项视图不用） */
        inputPlaceholder: '输入',
        expectedPlaceholder: '期望输出',
        /** 工作台里 ACTUAL 还没跑过时框内的引导语（跑过但为空仍用 emptyOutput） */
        outputIdle: '运行后在此显示输出',

        /** 输入 / 期望框右键菜单（2026-11-19 加）：没选中任何内容时两个动作都作用于全部内容 */
        copy: '复制',
        paste: '粘贴',

        copyFull: '复制完整内容（也可全选后 Ctrl+C）',
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

      /** 评测结论的 detail 文案：编排层（services/runner.js）写进卡片的状态补丁。
       *  TLE / MLE 两条带上限数字（2026-10-25 加）：上限是可改的全局设置、还能被单题覆盖，
       *  不写数字用户分不清「程序真慢」与「时限被调低了」。`*Plain` 是拿不到值时退回的老文案。 */
      outcome: {
        compileFailed: '编译未通过',
        timeout: '运行超时 (TLE)：时限 {limit}',
        timeoutPlain: '运行超时 (TLE)',
        memoryExceeded: '内存超限 (MLE)：上限 {limit}',
        memoryExceededPlain: '内存超限 (MLE)',
        runtimeError: '运行期出错',
        /**
         * 编译期就能确定的除以零（`a / 0`）。**不改判定**，只在 ACTUAL 框下面多一行提示：
         * -O2 把它折成常量，程序照样退出 0，那个输出本身没有意义（UB）。
         */
        divideByZero: '源码含除以零（编译期已确定），输出结果不可预期',
        /**
         * 编译期就能确定的其它未定义行为（2026-11-01 起）。这四条检查只在**用户代码那次
         * 编译**里打开（见 runnoSandbox 的 UB_WARN_ARGS），同样只提示、不改判定。
         *
         * 为什么把种类列出来：卡片上没有别的地方能看到它们（编辑器红线没有接这条），
         * 只说「有 UB」而不说是哪一类，用户没法照着改。`{kinds}` 是下面那几条中文标签
         * 用 ' / ' 拼起来的（同一时刻可能命中多条，比如既漏 `return` 又越界）。
         */
        ubWarning: '源码有编译期警告：{kinds}，输出结果不可预期',
        ubWarnKind: {
          /** clang：non-void function does not return a value in all control paths */
          returnType: '函数未在所有分支返回值',
          /** clang：variable 'x' is uninitialized when used here / -Wsometimes-uninitialized */
          uninitialized: '变量未初始化就使用',
          /** clang：array index 5 is past the end of the array（仅常量下标） */
          arrayBounds: '数组下标越界',
          /** clang：address of stack memory associated with local variable returned */
          stackAddress: '返回了局部变量的地址',
        },
        /**
         * 对拍：关掉优化（-O0）重编一遍、把同一条样例再跑一次，输出与 -O2 那次不同。
         * 只提示、不改判定（见 services/runner.js 的 crossCheckBest）。文案刻意留「可能」：
         * 程序自己不确定（rand / 时间 / 打印地址）也会走到这条路上。
         */
        crossCheckDiffered: '同一条样例在关闭优化（-O0）后输出不同：源码可能含未定义行为',
        /**
         * 对拍：-O0 那一遍直接非 0 退出（崩溃），而 -O2 那次是 AC 的。与上面那条分开写，
         * 因为对用户来说完全是两类现象：那个是「算出了别的东西」，这个是「连跑都跑不完」。
         * 典型来源是漏 `return` —— clang 在函数尾补一条 `unreachable`，-O2 顺着错位到下一段
         * 代码、-O0 老老实实撞上去（2026-10-31 实测 exit 134 / RuntimeError: unreachable）。
         * 爆栈已在数据层挡掉（见 wasmRuntime 的 CROSS_CHECK_STACK_TRAP），所以这里敢说「可能含」。
         */
        crossCheckCrashed: '同一条样例在关闭优化（-O0）后程序直接崩溃：源码可能含未定义行为',
        serviceUnreachable: '评测服务不可达',
        failed: '评测失败（{outcome}）',
        /** {engine} 是引擎显示名 */
        unsupportedLanguage: '{engine} 引擎不支持该语言，请换引擎或改用 C++ / Python',
      },

      /**
       * 分项标签视图（2026-11-19 加）。与 card 那组的分工：卡片有头栏（样例 N 是标题 + 折叠开关），
       * 分项视图的 Tab 胶囊只承担导航，所以它的短称另开一组，别把 card.title 直接拿来当
       * 「窄屏缩写」用 —— 两者的取舍不同（标题可以省略号，Tab 只允许换一种更短的写法）。
       */
      tabs: {
        /** 标签轨的无障碍名（它本身是一排可点的胶囊，没有可见标题） */
        railLabel: '测试样例',
        /** 切到分项视图后，正文区承接 Tab 的语义（读屏念的是「第 N 条样例的输入与输出」） */
        panelLabel: '样例 {n} 的输入与输出',
        /** 分项状态栏运行中的徽标：省略号表示还在等结果（卡片那侧仍是「运行中」） */
        badgeRunning: '评测中…',
        /**
         * 悬停 Tab 胶囊时的输入预览（2026-11-19 加，截断规则见 caseSummary 的 caseInputPreview）。
         * 只有一句「输入为空」：截断本身不写「还有 N 行」，末行一个 `…` 就够（用户同日要求去掉）。
         */
        previewEmpty: '输入为空',
        /** 胶囊右键菜单第一项（2026-11-20 加）：跑被右击的那条，不要求先切过去 */
        runOne: '运行该样例',
      },

      /**
       * 评测岛（2026-11-19）：把侧栏的评测页移出成编辑区里的一等窗格。
       * `pane` 是岛自己页头上的文案；`docked` 是岛在编辑区时侧栏那页的占位态
       * （全站单活，侧栏不再挂第二份 TestPanel）。
       */
      pane: {
        ariaLabel: '评测样例窗格',
        title: '评测样例',
        dockMenuLabel: '停靠位置',
        dropLeft: '停靠到左侧',
        dropRight: '停靠到右侧',
        dropBottom: '停靠到底部',
        dropSidebar: '松开以停靠回侧边栏',
        dockSidebar: '收回到侧边栏',
        dropKeep: '保持当前位置',
        dropEditor: '松开以在编辑区打开',
        /** 折叠窄条（2026-11-20）：岛被拖到极窄时只留一条，这几条是它的可读说明 */
        railLabel: '评测折叠栏',
        expandTooltip: '展开评测',
        passedTooltip: '{passed}/{total} 通过',
        caseTab: '样例 {n}',
        clickAgainExpand: '再次点击展开',
        clickAgainCollapse: '再次点击折叠',
      },

      /** 评测岛新手引导（2026-11-21）：首次打开岛时自动播，帮助页可重看 */
      guide: {
        aria: '评测岛新手引导',
        skip: '跳过',
        prev: '上一步',
        next: '下一步',
        done: '完成',
        steps: {
          detach: {
            title: '从侧边栏分出评测岛',
            text: '侧栏展开时，按住页头的「评测」这一半拖进编辑区；侧栏收起时，先点活动栏的「评测」图标把它展开，再拖出去。',
          },
          move: {
            title: '拖动页头，换一边停靠',
            text: '按住评测岛的页头拖到编辑区左、右或底边，松手就会吸附到那一侧。',
          },
          resize: {
            title: '拖动分隔条，调整岛的大小',
            text: '拖动评测岛与代码区之间的分隔条改变它占的比例；双击分隔条恢复默认。',
          },
          toggle: {
            title: '双击页头，收起或展开',
            text: '双击页头把岛收成悬浮迷你岛；再次双击浮岛即可展开回原来的位置和大小。',
          },
          float: {
            title: '拖动浮岛，贴边换位',
            text: '收起后的浮岛可以按住任意位置拖动，贴到左、右、底边松手就会吸过去。',
          },
        },
      },
    },
  },
  en: {
    tests: {
      panel: {
        ariaLabel: 'unnamed judge panel',
        addCase: 'Add test case',
        addCaseTip: 'Add test case ({key})',
        runAll: 'Run all test cases',
        runAllTip: 'Run all test cases ({key})',
        /** visible label on the footer's primary button (2026-10-24); the title is `runAllTip`
            (or `runAll` when the shortcut is unbound) */
        runAllLabel: 'Run all',
        /** see zh-CN: visible label of the vertical dock footer's single-case button */
        runOneLabel: 'Run',
        runOneTip: 'Run only this case (case {n})',
        /** 见 zh-CN 那侧的说明 */
        runBlocked: 'Non-code files can’t be run',
        runBlockedNoFile: 'No file is open',
      },

      empty: {
        /** 见 zh-CN 那侧的说明：空态那行标题写死在 TestPanel.vue 里，这张表不管它 ——
         *  例外是跑不了（`runBlocked` 非空）时改用这两条闸门文案（2026-11-17 加、
         *  2026-11-18 放宽到两条都算）。
         *  下面这几条与 autoScrapeState 的三个值一一对应，中间一段是可点的题目链接（见 zh-CN） */
        awaitingFetchBefore: 'Open the ',
        awaitingFetchLink: 'problem link',
        awaitingFetchAfter: ' and the browser extension will fetch the samples',
        /** 同 zh-CN：没检测到插件时的替代句（2026-10-06 收紧，与中文同结构；
         *  2026-11-12 起同样拆三段，中间那段是站内跳转，见 zh-CN 那侧说明） */
        awaitingNoExtensionBefore: 'No browser extension detected, so samples won’t be fetched. ',
        awaitingNoExtensionLink: 'Install or reload it',
        awaitingNoExtensionAfter: ', then refresh.',
        fetching: 'Fetching samples from the problem page…',
        fetchFailed: 'Could not fetch samples — reopen the problem page to retry',
      },

      /** 同 zh-CN：*Short 三条是窄侧栏用的（见 zh-CN 那侧说明） */
      verdict: {
        noCases: 'No test cases',
        running: 'Running',
        allPassed: 'All AC',
        allPassedShort: 'AC',
        stale: '?/{total} AC',
        staleShort: '?/{total}',
        partial: '{passed}/{total} AC',
        partialShort: '{passed}/{total}',
      },

      elapsedTitle: 'Slowest case: {time} (run phase only)',

      /** 同 zh-CN：输出比对方式（2026-11-09 加 strict，并改为全局设置 + 按题覆盖） */
      checker: {
        lines: 'Line by line',
        tokens: 'Ignore whitespace',
        strict: 'Strict, exact',
        float: 'Numeric tolerance',
        unordered: 'Ignore line order',
      },

      /** 同 zh-CN：一键提交的按钮 / 闸门 / 失败原因 / 判定码说明（2026-10-23 加） */
      submit: {
        button: 'Submit to Codeforces',
        /** same as zh-CN: the icon button's native title = `button` + its shortcut */
        buttonTip: 'Submit to Codeforces ({key})',
        submitting: 'Submitting…',
        submittedTitle: 'Submitted to Codeforces',
        submittedMessage: 'Submission #{id}',
        submittedUnknown: 'Submitted — check Codeforces for the result',
        failedTitle: 'Submission failed',

        /* 同 zh-CN：判定通知的细节行（数字来自官方 API） */
        detailPassed: { one: '{n} test passed', other: '{n} tests passed' },
        detailFailedOn: 'test {n}',

        /* 同 zh-CN：提交前的确认弹窗（2026-10-23 加） */
        confirmTitle: 'Submit {name} to Codeforces?',
        confirmAction: 'Submit',
        targetChanged: 'The active file changed — nothing was submitted',

        /* 同 zh-CN：同一份源码重复提交 */
        duplicateTitle: 'This code was already submitted',
        duplicateDesc:
          '“{name}” is identical to the last submission, so Codeforces will reject it. Edit it, or submit anyway.',
        duplicateAction: 'Submit anyway',
        duplicateRejected: 'Identical to the previous submission — rejected by Codeforces',
        busy: 'A run or submission is in progress — try again shortly',

        blockedDesktop: 'One-click submit is unavailable in the desktop app',
        blockedNoFile: 'No file is open',
        blockedNoProblem: 'This file isn’t linked to a problem',
        blockedOj: 'Only Codeforces is supported',
        blockedLanguage: 'Only C++ / Python files can be submitted',
        blockedChecking: 'Detecting the extension…',
        blockedExtension: 'Requires the CC for Web extension with submit support',

        reason: {
          unsupported: 'The extension is too old to submit',
          unsupportedUrl: 'Problem URL not recognised',
          timeout: 'Codeforces did not answer in time',
          notLoggedIn: 'Not signed in to Codeforces',
          challenge: 'Codeforces needs a browser check — finish it in the opened page, then retry',
          problemMissing: 'Problem not found on the submit page (submission may be closed)',
          languageMissing: 'Compiler not found on the submit page',
          rejected: 'Rejected by Codeforces (duplicate code or submission not open yet)',
          noTab: 'Could not open the Codeforces submit page',
          page: 'Submit page not recognised — the site may have changed',
          empty: 'The file is empty',
          unknown: 'Submission failed',
        },

        verdict: {
          ac: 'Accepted',
          wa: 'Wrong answer',
          tle: 'Time limit exceeded',
          mle: 'Memory limit exceeded',
          re: 'Runtime error',
          ce: 'Compilation error',
          other: 'Other result',
        },
      },

      card: {
        /** 同 zh-CN：卡片标题由序号改成「Testcase N」 */
        title: 'Testcase {n}',
        idle: 'Not run',
        running: 'Running',
        expand: 'Expand this case',
        collapse: 'Collapse this case',
        runOne: 'Run this case only',
        staleTitle: 'Code or input changed; result is from the previous run',
        staleLabel: 'Result stale',
        staleLabelShort: 'Stale',
        timingTitle: 'Program run time (excludes compilation)',
        remove: 'Delete this case',
        copyOutput: 'Copy actual output',
        /** 同中文：实际输出写入期望（跑完但输出为空时显示 emptyOutput） */
        useActual: 'Write actual output to Expected',
        emptyOutput: 'No output',

        // 与 zh-CN 那栏严格对应：三个小标题走本表，占位提示只给卡片流用。
        field: {
          input: 'Input',
          expected: 'Expected',
          actual: 'Actual',
        },
        inputPlaceholder: 'input',
        expectedPlaceholder: 'Expected output',
        outputIdle: 'Run to see the output here',

        /** Same as zh-CN: right-click menu on the input / expected boxes */
        copy: 'Copy',
        paste: 'Paste',

        copyFull: 'Copy full content (or Select All + Ctrl+C)',
        copyFullShort: 'Copy all',
        /** 同中文：只有真截断（框尾有 `……`）时才显示这一行，纯溢出态不显示 */
        omitted: '{n} characters not shown',
      },

      outcome: {
        compileFailed: 'Compilation failed',
        timeout: 'Time limit exceeded (TLE): {limit}',
        timeoutPlain: 'Time limit exceeded (TLE)',
        memoryExceeded: 'Memory limit exceeded (MLE): {limit}',
        memoryExceededPlain: 'Memory limit exceeded (MLE)',
        runtimeError: 'Runtime error',
        divideByZero: 'Source divides by zero at compile time; the output is undefined',
        /** 见 zh-CN 那侧的说明 */
        ubWarning: 'Compile-time warning: {kinds}; the output is undefined',
        ubWarnKind: {
          returnType: 'a function does not return on every path',
          uninitialized: 'a variable is used uninitialized',
          arrayBounds: 'an array index is out of bounds',
          stackAddress: 'the address of a local variable is returned',
        },
        /** 见 zh-CN 那侧的说明 */
        crossCheckDiffered: 'This case prints something different without optimisation (-O0): the source may contain undefined behaviour',
        /** 见 zh-CN 那侧的说明 */
        crossCheckCrashed: 'This case crashes without optimisation (-O0): the source may contain undefined behaviour',
        serviceUnreachable: 'Judge service unreachable',
        failed: 'Judging failed ({outcome})',
        unsupportedLanguage:
          'The {engine} engine doesn’t support this language; use another engine or C++ / Python',
      },

      /** 见 zh-CN 那侧的说明 */
      tabs: {
        railLabel: 'Test cases',
        panelLabel: 'Input and output of test case {n}',
        badgeRunning: 'Judging…',
        /** 见 zh-CN 那侧的说明（悬停 Tab 时的输入预览） */
        previewEmpty: 'No input',
        /** 见 zh-CN 那侧的说明（胶囊右键菜单第一项） */
        runOne: 'Run this case',
      },

      /** 见 zh-CN 那侧的说明（评测岛与侧栏占位态） */
      pane: {
        ariaLabel: 'Test cases pane',
        title: 'Test cases',
        dockMenuLabel: 'Dock position',
        dropLeft: 'Dock to the left',
        dropRight: 'Dock to the right',
        dropBottom: 'Dock to the bottom',
        dropSidebar: 'Release to dock back to the sidebar',
        dockSidebar: 'Dock back to sidebar',
        dropKeep: 'Keep current position',
        dropEditor: 'Release to open in the editor',
        /** see zh-CN: the collapsed 32px rail */
        railLabel: 'Collapsed tests rail',
        expandTooltip: 'Expand tests',
        passedTooltip: '{passed} of {total} passed',
        caseTab: 'Test case {n}',
        clickAgainExpand: 'Click again to expand',
        clickAgainCollapse: 'Click again to collapse',
      },

      /** see zh-CN: tests island onboarding tour */
      guide: {
        aria: 'Tests island tour',
        skip: 'Skip',
        prev: 'Back',
        next: 'Next',
        done: 'Done',
        steps: {
          detach: {
            title: 'Detach the island from the sidebar',
            text: 'With the sidebar open, press the “Tests” half of its header and drag it into the editor. If the sidebar is collapsed, click the “Tests” icon in the activity bar first, then drag it out.',
          },
          move: {
            title: 'Drag the header to dock it elsewhere',
            text: 'Press the island header and drag it to the left, right or bottom edge of the editor; release to dock it there.',
          },
          resize: {
            title: 'Drag the splitter to resize',
            text: 'Drag the splitter between the island and the code area to change the share; double-click it to reset.',
          },
          toggle: {
            title: 'Double-click the header to collapse',
            text: 'Double-click the header to fold the island into a floating mini island; double-click the float to expand it back.',
          },
          float: {
            title: 'Drag the float to snap to another edge',
            text: 'Once collapsed, press anywhere on the floating island and drag it; release near the left, right or bottom edge to snap there.',
          },
        },
      },
    },
  },
}
