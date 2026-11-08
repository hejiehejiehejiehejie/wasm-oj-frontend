/**
 * Codeforces 抽题组件（可选模块）的文案。
 *
 * 【为什么单独开一个域】这一整个功能是可下载 / 可卸载的独立模块，文案集中在
 * 一个文件里，将来整块拿掉时就是「删一个文件 + 从 PARTS 里去掉一行」，不用在
 * settings.js 里翻找哪几句是它的。
 *
 * 状态行（下载中 / 已就绪 / 失败）与按钮文案沿用 `runtime.*` 那套通用的，
 * 这里只放这个组件自己的说法（标题、空态说明、阶段播报、卸载提示）。
 */
export default {
  'zh-CN': {
    cf: {
      module: {
        /** 设置 › 应用 里的分区标题 */
        group: '组件',
        title: 'Codeforces',
        /** 图标右上角那枚小标签：这个组件仍在测试中 */
        testing: '测试',
        idleHint: '按难度与标签抽题；题库约 2MB，仅下载一次',
        downloadTitle: '下载 / 重试 Codeforces 题库',
        /** 卸载：与运行环境那三行共用同一颗确认弹窗，所以要的也是这两个 key
            （action 那版不带问号，是行内按钮的 tooltip） */
        uninstallActionTitle: '卸载「{title}」',
        uninstallTitle: '卸载「{title}」？',
        uninstallHint:
          '删除本机题库（约 2MB）并关闭 Codeforces 页签，同时关掉「默认安装」；可随时重新下载。',
        /** 设置 › 云同步 里的「默认安装」开关（跟在「预下载」一组，同为云同步的偏好）。
            2026-10-27 起抽题与比赛合并成一个组件，只剩 Codeforces 与倒计时两枚开关。 */
        autoInstall: {
          label: '默认安装',
          switchTitle: '打开站点时自动安装 Codeforces 的题库',
        },
        downloading: '正在获取 Codeforces 题库…',
        /** Worker 推的阶段码 → 文案 */
        stage: {
          problemset: '正在获取 Codeforces 题库（约 2MB）…',
          solved: '正在获取账号已通过的题目…',
          handle: '正在校验 Codeforces 账号…',
          contestList: '正在获取比赛列表…',
          standings: '正在获取这场比赛的题目…',
        },
      },

      /** 侧栏页头那颗按钮（常驻）：点它唤出组件菜单（ComponentsMenu）。
          文案不含「设置」二字，免得与旁边那颗齿轮在无障碍检索里混起来。 */
      button: {
        label: 'Codeforces 抽题',
      },

      /** 组件菜单里「Codeforces」那一类的抬头与类名在 components.js
          （那个菜单不只装 Codeforces，抬头不能挂在可卸载模块的域里） */

      /** 合并后的 Codeforces 页签（抽题 + 赛程 + 比赛，2026-10-28）：页签标题与内部模式轴 */
      view: {
        title: 'Codeforces',
        mode: {
          picker: '抽题',
          schedule: '赛程',
          contest: '比赛',
        },
        /** 抬头左上角的后退 / 前进（只在本页内部走，见 CfCodeforcesPanel 的 navHistory） */
        nav: {
          back: '后退',
          forward: '前进',
        },
        /** 抬头右侧的账号胶囊（点开才编辑，三个页面共用这一份） */
        handle: {
          label: 'Codeforces 账号',
          empty: '未设置账号',
          placeholder: '如 tourist',
          hint: '抽题排除已通过、榜单「跳到我」、提交「只看我」共用这个账号',
        },
        live: 'LIVE',
      },

      /** 编辑区里那个 Codeforces 页签 */
      tab: {
        close: '关闭 Codeforces 页签',
      },

      /** 抽题页签的内容。版式＝一张网格表，一行一项（左名字、右控件） */
      picker: {
        picking: '正在抽取…',
        fields: {
          rating: '难度',
          ratingMin: '下限',
          ratingMax: '上限',
          unlimited: '不限',
          presets: '常用区间',
          contest: '比赛',
          letter: '题号',
          tags: '标签',
          tagPresets: '常用标签',
          tagsExpand: '展开',
          tagsCollapse: '收起',
          count: '数量',
          decrease: '减少数量',
          increase: '增加数量',
        },
        /**
         * 比赛类别（2026-11-08）。这八个名字是 CF 官方的分组写法（比赛名里就长这样），
         * 中英两栏刻意一致 —— 译成「第一赛区」反而跟题库里那行比赛名对不上号。
         * key 与 cf/pick.js 的 CONTEST_CATS 一一对应，改名要两边一起改。
         */
        cats: {
          div1: 'Div. 1',
          div2: 'Div. 2',
          div3: 'Div. 3',
          div4: 'Div. 4',
          edu: 'Edu',
          div12: 'Div. 1+2',
          global: 'Global',
          others: 'Others',
        },
        options: {
          preferNew: '优先近期新题',
          excludeSolved: '排除已通过的题',
        },
        /** 分段按钮（替代开关）的两种状态 */
        toggle: {
          on: '开',
          off: '关',
        },
        /** 只剩「不存在」这一条：账号本身在抬头右侧的胶囊里填（三个模式共用），
            这条文案由抽取前的静默校验点出来，不在表单里常驻显示 */
        handle: {
          notFound: '账号不存在：{handles}',
        },
        action: {
          pick: '开始抽取',
          again: '换一批',
        },
        result: {
          count: { one: '抽中 {n} 道题', other: '抽中 {n} 道题' },
          open: '在 Codeforces 打开',
          import: '导入',
          importing: '导入中…',
          imported: '已导入',
          importAll: '全部导入',
          avg: '平均 {rating}',
          empty: '抽到的题会列在这里',
        },
        /** 抽到题时那条全局通知的标题（正文复用上面 `result.count`，不另写一句） */
        notif: {
          title: '抽取成功',
        },
        errors: {
          ratingOrder: '难度下限不能大于上限',
          handleRequired: '排除已通过需要账号：先在右上角设置',
          noMatch: '没有符合条件的题目，请放宽条件',
          worker: '抽题组件未启动，请在设置中重新下载',
          fetch: '拉取 Codeforces 数据失败：{detail}',
          importFailed: '导入工作区失败：{detail}',
        },
      },

      /**
       * 比赛（P1）。导入按钮那三种状态复用 `picker.result.*`
       * —— 「导入 / 导入中 / 已导入」是同一件事，写两遍必然漂移。
       */
      contest: {
        title: '比赛',
        tabs: {
          problems: '题目',
          standings: '排行榜',
          submissions: '提交',
        },
        fields: {
          linkLabel: '比赛链接或 ID',
          linkPlaceholder: '比赛链接或 ID（如 2276）',
        },
        problems: {
          solvedTitle: '通过人数（截至载入时的榜单快照）',
        },
        action: {
          load: '载入',
          edit: '换一场',
          scrape: '抓样例',
          scraping: '抓取中…',
          refresh: '刷新',
          refreshing: '获取中…',
          /** 「刷新于 20 秒前」：刷新两个字是可点的按钮，这里只给后面那半句 */
          refreshAt: '于 {age}',
          /** 距上次刷新的时长（一分钟以上不带秒，一小时以上带零头分钟） */
          refreshAge: {
            seconds: '{n} 秒前',
            minutes: '{n} 分钟前',
            hours: '{n} 小时前',
            hoursMinutes: '{h} 小时 {m} 分钟前',
          },
        },
        status: {
          loading: '正在获取比赛信息…',
          problems: '正在获取题目列表…',
          upcoming: '距开始 {time}',
          running: '已开赛 {time}',
          finished: '已结束',
          /** 虚拟参赛（2026-11-03）：开赛时刻是用户自己定的那一个，不是比赛的官方时刻 */
          vpUpcoming: '虚拟参赛 {time} 后开始',
          vpRunning: '虚拟参赛已进行 {time}',
          vpBadge: 'VP · {time}',
          scraping: '正在抓取样例，需载入整个题目页…',
          scraped: '已抓取 {n} 道题的样例',
        },
        /** 赛程：近期比赛 + 倒计时。分组按「此刻」算，不跟 contest.list 的 phase 走 */
        schedule: {
          refreshing: '获取中…',
          updated: '更新于 {time}',
          /** 倒计时档位：界面只取最大的几档拼起来（见 useCfSchedule.spanText） */
          units: {
            weeks: '{n} 周',
            days: '{n} 天',
            hours: '{n} 小时',
            minutes: '{n} 分钟',
            seconds: '{n} 秒',
          },
          /** 进行中那一格：距结束还剩多久（2026-11-01 起，原来这一格显示「已开赛多久」） */
          remaining: '还剩 {time}',
          /** 进行中那一格的悬停提示：把「已进行 / 本场共多长」补回来 */
          elapsedHint: '已进行 {time} · 本场共 {total}',
          empty: '没有取到比赛列表，稍后再试',
          /** 整行点击 = 载入这场比赛（含比赛名那一段） */
          open: '载入 {name}',
          /** 行尾那颗外链图标：这一行唯一「去 CF 网页」的出口 */
          cfPage: '在 Codeforces 打开',
          /** 报名 / 开 VP 那一列（2026-10-26 起由扩展读 CF 的报名状态，见 useCfSchedule） */
          register: '报名',
          registering: '报名中…',
          vp: 'VP',
          vpStarting: '准备中…',
          /** 已开 VP 的场次：名字前一枚徽标，动作列说一句「已开 VP」（不再有第二个入口） */
          virtualBadge: 'VP',
          virtualState: '已开 VP',
          virtualHint: '虚拟参赛，{time} 开始',
          registered: '已报名',
          before: '未开放',
          closed: '已截止',
          stateUnknown: '—',
          needLogin: '登录后可报名',
          entryTitle: {
            register: '报名 {name}？',
            virtual: '开始 {name} 的虚拟参赛？',
          },
          entryDesc: {
            register: '将用这个浏览器登录的 Codeforces 账号报名这场比赛。',
            virtual: '将开一场虚拟参赛，题量与时长同正式比赛，成绩不计入 rating。',
          },
          entryConfirm: '确认',
          entryCancel: '取消',
          /** 报名方式（2026-10-30 加）：CF 只对标明 Unrated allowed 的轮次给这颗控件，
               站点看不见那一页，所以让用户自己选；扩展设不上就不提交（见 entryErrors 那条） */
          entryMode: {
            label: '报名方式',
            rated: '计分',
            unrated: '不计分',
            hint: {
              rated: '成绩计入 rating。',
              unrated: '成绩不计入 rating。',
            },
          },
          /** 虚拟参赛的开始时刻（2026-11-03 加）：CF 的 VP 表单本来就有这一行，
               默认现在，站点把它摆到确认卡片上 */
          entryStart: {
            label: '开始时间',
            hint: '虚拟参赛从这一刻开始计时，默认现在。',
          },
          entryDone: {
            register: '已报名 {name}',
            registerUnrated: '已按不计分报名 {name}',
            virtual: '已开始 {name} 的虚拟参赛',
          },
          /** T-10 开赛提醒（2026-10-30，见 services/cfStartReminder.js）：报名成功那一刻
               记下开赛时刻，到点弹常驻通知；「开始比赛」接去比赛页 → 整场导入 → 开第一题 */
          remindNote: '开赛前十分钟会提醒你',
          remindTitle: '{name} 十分钟后开赛',
          remindLiveTitle: '{name} 正在进行',
          remindCountdown: '距开赛 {time}',
          remindStarted: '已开赛',
          startAction: '开始比赛',
          entryErrors: {
            notLoggedIn: '要先去 Codeforces 登录',
            challenge: 'Codeforces 要求先完成人机校验',
            notEligible: '这场比赛现在不能报名',
            alreadyRegistered: '已经报过名了',
            vpAlready: '已经开过虚拟参赛了',
            unratedUnavailable: '这场比赛的表单里没有不计分选项，去报名页确认一下',
            rejected: 'Codeforces 没有接受这次操作，去那一页看看原因',
            timeout: '操作超时，去 Codeforces 确认一下结果',
            busy: '上一个操作还没结束',
            unsupported: '浏览器扩展版本太旧，请重新下载',
            fallback: '操作没有成功，去 Codeforces 看看',
          },
          group: {
            running: '正在进行',
            upcoming: '即将开始',
            finished: '最近结束',
          },
        },
        /** 排行榜：API 只有正式参赛者，VP 不在榜上（精确的 VP 排名是 P1） */
        standings: {
          loading: '正在获取排行榜…',
          notStarted: '开赛后才有排行榜',
          empty: '这场还没有可显示的榜单',
          rank: '名次',
          who: '选手',
          score: '分数',
          solved: '过题',
          scoreHint: '总分已含逐题衰减与 hack 增减',
          solvedHint: '过题数 / 罚时',
          penalty: '罚时',
          ghost: '幽灵',
          live: '实时更新',
          frozen: '已冻结',
          jump: '跳到我',
          jumpHint: '翻到我的名次所在页',
          myRank: '我：{rank} 名',
          /** 置顶的「我」那一行（2026-10-27 加）：名次 + 选手 + 计分摘要 */
          pinSolved: '过 {n} 题',
          pinPenalty: '罚时 {n}',
          pinPoints: '{n} 分',
          /** 表尾统计（每题多少人通过 / 尝试），由整场榜单现算 */
          statsAccepted: '通过',
          statsTried: '尝试',
          statsHint: '通过 {solved} · 尝试 {tried}',
          unofficialMarkHint: '非正式参赛（VP / unrated）',
          /** 非正式名次（2026-10-26 起由扩展读 CF 好友榜 / 合并榜第一页） */
          unofficial: '非正式名次',
          unofficialHint: '含 VP 等非正式参赛者的总榜名次',
          unofficialLoading: '查询中…',
          unofficialMine: '含非正式：第 {rank} 名',
          /** 虚拟参赛（2026-11-03）：开赛前锁榜；开赛后的 VP 行并进正式榜一起看 */
          vpLocked: '虚拟参赛还没开始，开赛后才有排行榜',
          vpRow: '虚拟参赛',
          unofficialMissing: '榜单第一页里没有你',
          unofficialNeedLogin: '查非正式名次需登录 Codeforces',
          unofficialFailed: '查不到非正式名次',
          page: '{page} / {count} 页',
          prev: '上一页',
          next: '下一页',
        },
        /** 提交：只取最新一段；更早的提交去 Codeforces 看（完整分页是 P1） */
        submissions: {
          loading: '正在获取提交…',
          empty: '这场还没有提交',
          mineEmpty: '我在这场还没有提交',
          handleEmpty: '{handle} 在这场还没有提交',
          filteredEmpty: '没有符合筛选条件的提交',
          onlyMine: '只看我',
          onlyMineHint: '只看我自己账号的提交',
          needHandle: '先在 Codeforces 页右上角设置账号，才能只看我',
          allHandles: '全部选手',
          handleLabel: '按 handle 筛选',
          problem: '题目',
          status: '状态',
          verdict: {
            all: '全部',
            ok: 'AC',
            fail: '未过',
            pending: '待判',
          },
          count: '{n} 条',
          summary: '过 {solved} 题 · AC {accepted} · 未过 {rejected}',
          latest: '只显示最近一段',
          live: '实时更新',
          tests: '第 {n} 点',
          open: '在 Codeforces 打开提交 {id}',
        },
        errors: {
          badLink: '无法识别比赛，请贴完整链接或 ID',
          notFound: 'Codeforces 上没有这场比赛',
          notStarted: '尚未开赛，开赛后才有题目',
          vpNotStarted: '虚拟参赛还没开始，开赛后题目才会出现',
          noProblems: '这场比赛没有题目列表（可能是 gym / group）',
          needsLogin: 'gym / group 题目需登录 Codeforces',
          rateLimited: 'Codeforces 请求太频繁，请稍后再试',
          worker: '抽题组件未启动，请在设置中重新下载',
          fetch: '拉取 Codeforces 数据失败：{detail}',
          importFailed: '导入工作区失败：{detail}',
          scrapeUnsupported: '抓样例需要新版浏览器扩展',
          scrapeBusy: '扩展正在抓另一场，稍后再试',
          scrapeTimeout: '抓取样例超时，可重试',
          scrapeFailed: '抓取样例失败：{detail}',
          scrapeEmpty: '没抓到样例：请确认插件是新版、且浏览器已登录 Codeforces',
        },
      },
    },
  },

  en: {
    cf: {
      module: {
        group: 'Components',
        title: 'Codeforces',
        /** 同 zh-CN：图标右上角那枚小标签 */
        testing: 'Beta',
        idleHint: 'Random problems by difficulty and tags; the problem bank (~2MB) is downloaded once',
        downloadTitle: 'Download / retry the Codeforces problemset',
        /** 同 zh-CN：卸载走运行环境那颗共用弹窗，要的也是这两个 key */
        uninstallActionTitle: 'Uninstall "{title}"',
        uninstallTitle: 'Uninstall "{title}"?',
        uninstallHint:
          'Deletes the cached problemset (~2MB), closes the Codeforces tab, and turns off “Install by default”. You can download it again at any time.',
        /** 同 zh-CN：云同步栏里的「默认安装」开关，2026-10-27 合并后只剩两枚 */
        autoInstall: {
          label: 'Install by default',
          switchTitle: 'Install the Codeforces problem bank when the site opens',
        },
        downloading: 'Fetching the Codeforces problemset…',
        stage: {
          problemset: 'Fetching the problemset (~2MB)…',
          solved: 'Fetching solved problems…',
          handle: 'Verifying the Codeforces account…',
          contestList: 'Fetching the contest list…',
          standings: 'Fetching this contest’s problems…',
        },
      },

      button: {
        label: 'Codeforces problem picker',
      },

      /** 同 zh-CN：抬头与类名在 components.js */

      /** 同 zh-CN：合并后的 Codeforces 页签 */
      view: {
        title: 'Codeforces',
        mode: {
          picker: 'Pick',
          schedule: 'Schedule',
          contest: 'Contest',
        },
        nav: {
          back: 'Back',
          forward: 'Forward',
        },
        handle: {
          label: 'Codeforces handle',
          empty: 'No handle set',
          placeholder: 'e.g. tourist',
          hint: 'Shared by “exclude solved” in Pick, “jump to me” in standings and “only me” in submissions',
        },
        live: 'LIVE',
      },

      tab: {
        close: 'Close the Codeforces tab',
      },

      picker: {
        picking: 'Picking…',
        fields: {
          rating: 'Difficulty',
          ratingMin: 'Min',
          ratingMax: 'Max',
          unlimited: 'Any',
          presets: 'Presets',
          contest: 'Contest',
          letter: 'Problem',
          tags: 'Tags',
          tagPresets: 'Common tags',
          tagsExpand: 'Expand',
          tagsCollapse: 'Collapse',
          count: 'Count',
          decrease: 'Decrease count',
          increase: 'Increase count',
        },
        /** 同 zh-CN：CF 官方分组名，两栏一致 */
        cats: {
          div1: 'Div. 1',
          div2: 'Div. 2',
          div3: 'Div. 3',
          div4: 'Div. 4',
          edu: 'Edu',
          div12: 'Div. 1+2',
          global: 'Global',
          others: 'Others',
        },
        options: {
          preferNew: 'Prefer recent problems',
          excludeSolved: 'Skip problems I already solved',
        },
        toggle: {
          on: 'ON',
          off: 'OFF',
        },
        handle: {
          notFound: 'No such handle: {handles}',
        },
        action: {
          pick: 'Start picking',
          again: 'Pick again',
        },
        result: {
          count: { one: 'Picked {n} problem', other: 'Picked {n} problems' },
          open: 'Open on Codeforces',
          import: 'Import',
          importing: 'Importing…',
          imported: 'Imported',
          importAll: 'Import all',
          avg: 'Avg {rating}',
          empty: 'Picked problems will appear here',
        },
        /** 同 zh-CN：正文复用上面 `result.count` */
        notif: {
          title: 'Pick finished',
        },
        errors: {
          ratingOrder: 'The minimum difficulty cannot exceed the maximum',
          handleRequired: 'Skipping solved problems needs a handle — set it in the top-right',
          noMatch: 'Nothing matched — loosen the filters',
          worker: 'The picker worker isn’t running; download the module again',
          fetch: 'Could not fetch Codeforces data: {detail}',
          importFailed: 'Import into the workspace failed: {detail}',
        },
      },

      /** 同 zh-CN：导入按钮那三种状态复用 `picker.result.*` */
      contest: {
        title: 'Contest',
        tabs: {
          problems: 'Problems',
          standings: 'Standings',
          submissions: 'Submissions',
        },
        fields: {
          linkLabel: 'Contest link or ID',
          linkPlaceholder: 'Contest link or ID (e.g. 2276)',
        },
        problems: {
          solvedTitle: 'Accepted count (standings snapshot at load time)',
        },
        action: {
          load: 'Load',
          edit: 'Change contest',
          scrape: 'Fetch samples',
          scraping: 'Fetching…',
          refresh: 'Refresh',
          refreshing: 'Fetching…',
          /** 「Refresh 20s ago」：刷新是可点的按钮，这里只给后面那半句 */
          refreshAt: '{age} ago',
          refreshAge: {
            seconds: '{n}s',
            minutes: '{n}m',
            hours: '{n}h',
            hoursMinutes: '{h}h {m}m',
          },
        },
        status: {
          loading: 'Fetching contest…',
          problems: 'Fetching the problem list…',
          upcoming: 'Starts in {time}',
          running: 'Running for {time}',
          finished: 'Finished',
          /** Virtual participation (2026-11-03) */
          vpUpcoming: 'Virtual participation starts in {time}',
          vpRunning: 'Virtual participation running for {time}',
          vpBadge: 'VP · {time}',
          scraping: 'Fetching samples — the whole problems page must load…',
          scraped: 'Samples fetched for {n} problems',
        },
        schedule: {
          refreshing: 'Fetching…',
          updated: 'Updated {time}',
          units: {
            weeks: '{n}w',
            days: '{n}d',
            hours: '{n}h',
            minutes: '{n}m',
            seconds: '{n}s',
          },
          /** 见 zh-CN 那侧的说明 */
          remaining: '{time} left',
          /** 见 zh-CN 那侧的说明 */
          elapsedHint: '{time} elapsed · {total} total',
          empty: 'Could not load the contest list — try again later',
          open: 'Load {name}',
          cfPage: 'Open on Codeforces',
          register: 'Register',
          registering: 'Registering…',
          vp: 'VP',
          vpStarting: 'Starting…',
          virtualBadge: 'VP',
          virtualState: 'VP started',
          virtualHint: 'Virtual participation starts at {time}',
          registered: 'Registered',
          before: 'Not open',
          closed: 'Closed',
          stateUnknown: '—',
          needLogin: 'Sign in to register',
          entryTitle: {
            register: 'Register for {name}?',
            virtual: 'Start virtual participation in {name}?',
          },
          entryDesc: {
            register: 'Registers this contest with the Codeforces account signed in to this browser.',
            virtual: 'Starts a virtual participation with the same problems and duration; it does not affect rating.',
          },
          entryConfirm: 'Confirm',
          entryCancel: 'Cancel',
          /** Registration type (2026-10-30): CF only offers the control for rounds marked
               "Unrated allowed"; the site cannot see that page, so the choice is explicit
               here — and the extension refuses to submit when it finds no such control */
          entryMode: {
            label: 'Registration type',
            rated: 'Rated',
            unrated: 'Unrated',
            hint: {
              rated: 'Affects your rating.',
              unrated: 'Does not affect your rating.',
            },
          },
          /** Virtual start time (2026-11-03): CF's VP form already has this row, defaulting
               to now; the site surfaces it on the confirm card */
          entryStart: {
            label: 'Start time',
            hint: 'The virtual contest starts counting from this time. Defaults to now.',
          },
          entryDone: {
            register: 'Registered for {name}',
            registerUnrated: 'Registered for {name} as unrated',
            virtual: 'Virtual participation started in {name}',
          },
          /** T-10 start reminder (2026-10-30, see services/cfStartReminder.js): the start time
               is recorded on successful registration; a persistent notification fires at T-10,
               and its "Start" action goes to the contest page, imports everything, opens A */
          remindNote: "You'll get a reminder 10 minutes before it starts",
          remindTitle: '{name} starts in 10 minutes',
          remindLiveTitle: '{name} is running',
          remindCountdown: 'Starts in {time}',
          remindStarted: 'Started',
          startAction: 'Start',
          entryErrors: {
            notLoggedIn: 'Sign in to Codeforces first',
            challenge: 'Codeforces wants you to pass its human check first',
            notEligible: 'This contest cannot be registered right now',
            alreadyRegistered: 'You are already registered',
            vpAlready: 'Virtual participation was already started',
            unratedUnavailable: 'This contest has no unrated option in its form — check the registration page',
            rejected: 'Codeforces did not accept the request — check that page for the reason',
            timeout: 'The request timed out — check the result on Codeforces',
            busy: 'The previous action is still running',
            unsupported: 'The browser extension is too old — download it again',
            fallback: 'The action did not go through — check Codeforces',
          },
          group: {
            running: 'Running',
            upcoming: 'Upcoming',
            finished: 'Recently finished',
          },
        },
        standings: {
          loading: 'Fetching standings…',
          notStarted: 'Standings appear once the contest starts',
          empty: 'No standings to show',
          rank: 'Rank',
          who: 'Contestant',
          score: 'Score',
          solved: 'Solved',
          scoreHint: 'Total includes per-problem decay and hacks',
          solvedHint: 'Solved / penalty',
          penalty: 'Penalty',
          ghost: 'ghost',
          live: 'Live',
          frozen: 'Frozen',
          jump: 'Find me',
          jumpHint: 'Jump to the page with my rank',
          myRank: 'Me: rank {rank}',
          pinSolved: '{n} solved',
          pinPenalty: 'penalty {n}',
          pinPoints: '{n} pts',
          statsAccepted: 'Accepted',
          statsTried: 'Tried',
          statsHint: '{solved} accepted · {tried} tried',
          unofficialMarkHint: 'Unofficial participant (VP / unrated)',
          unofficial: 'Unofficial rank',
          unofficialHint: 'Overall rank including VP and other unofficial participants',
          unofficialLoading: 'Looking up…',
          unofficialMine: 'With unofficial: rank {rank}',
          vpLocked: 'Standings appear once the virtual participation starts',
          vpRow: 'Virtual',
          unofficialMissing: 'Not on the first page',
          unofficialNeedLogin: 'Sign in to Codeforces to look this up',
          unofficialFailed: 'Could not look up the unofficial rank',
          page: 'Page {page} / {count}',
          prev: 'Previous',
          next: 'Next',
        },
        submissions: {
          loading: 'Fetching submissions…',
          empty: 'No submissions yet',
          mineEmpty: 'You have no submissions in this contest',
          handleEmpty: '{handle} has no submissions in this contest',
          filteredEmpty: 'No submissions match the filters',
          onlyMine: 'Only mine',
          onlyMineHint: 'Only submissions from my handle',
          needHandle: 'Set your handle in the top-right of the Codeforces page to filter',
          allHandles: 'All handles',
          handleLabel: 'Filter by handle',
          problem: 'Problem',
          status: 'Verdict',
          verdict: {
            all: 'All',
            ok: 'AC',
            fail: 'Failed',
            pending: 'Pending',
          },
          count: '{n} entries',
          summary: '{solved} solved · {accepted} AC · {rejected} failed',
          latest: 'Latest entries only',
          live: 'Live',
          tests: 'test {n}',
          open: 'Open submission {id} on Codeforces',
        },
        errors: {
          badLink: 'Unknown contest — paste a full link or ID',
          notFound: 'No such contest on Codeforces',
          notStarted: 'Not started yet — problems appear when it begins',
          vpNotStarted: 'Virtual participation has not started yet; problems appear when it starts',
          noProblems: 'No problem list (maybe a gym or group round)',
          needsLogin: 'Gym / group problems need a Codeforces login',
          rateLimited: 'Codeforces is rate limiting requests — try again shortly',
          worker: 'The picker worker isn’t running; download the module again',
          fetch: 'Could not fetch Codeforces data: {detail}',
          importFailed: 'Import into the workspace failed: {detail}',
          scrapeUnsupported: 'Fetching samples needs a newer extension',
          scrapeBusy: 'The extension is already fetching another contest',
          scrapeTimeout: 'Fetching samples timed out — try again',
          scrapeFailed: 'Could not fetch samples: {detail}',
          scrapeEmpty:
            'No samples came back: check that the extension is up to date and that you are signed in to Codeforces',
        },
      },
    },
  },
}
