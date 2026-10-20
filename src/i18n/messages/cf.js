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
        groupNote:
          '随机抽题与比赛随站点默认安装（题库约 2MB），此处显示安装状态，下载失败可重试。「默认安装」开关在「云同步」一栏，会随账号同步到其他设备。',
        title: 'Codeforces',
        idleHint: '按难度与标签随机抽题、贴比赛链接看倒计时与题目（题库缓存约 2MB），只下一次',
        downloadTitle: '下载 / 重试 Codeforces 题库',
        /** 卸载：与运行环境那三行共用同一颗确认弹窗，所以要的也是这两个 key
            （action 那版不带问号，是行内按钮的 tooltip） */
        uninstallActionTitle: '卸载「{title}」',
        uninstallTitle: '卸载「{title}」？',
        uninstallHint:
          '将从本机删除已缓存的 Codeforces 题库（约 2MB），「随机抽题」与「比赛」两个页签随之关掉，并关掉「默认安装」—— 不关的话下次打开站点它会自己装回来。想重新装上，点这一行的「下载」即可。',
        /** 设置 › 云同步 里的「默认安装」开关（跟在「预下载」一组，同为云同步的偏好） */
        autoInstall: {
          label: '默认安装',
          switchTitle: '打开站点时自动安装 Codeforces 组件',
          note: '开启后，每次打开站点都会检查题库是否在本机，不在就自动下载（约 2MB）。关掉则只保留上面那一行的手动下载。',
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

      /** 组件菜单里「Codeforces」那一类的条目标签；抬头与类名在 components.js
          （那个菜单不只装 Codeforces，抬头不能挂在可卸载模块的域里） */
      menu: {
        picker: '随机抽题',
        contest: '比赛',
      },

      /** 编辑区里那两个抽题 / 比赛页签 */
      tab: {
        close: '关闭抽题页签',
        closeContest: '关闭比赛页签',
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
          tags: '标签',
          tagsPlaceholder: '英文逗号分隔，如 dp, math',
          count: '数量',
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
        handle: {
          label: '账号',
          placeholder: 'tourist, hejie',
          checking: '正在校验…',
          ok: '账号有效',
          notFound: '账号不存在：{handles}',
          network: '连不上 Codeforces，先跳过校验',
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
        },
        /** 抽到题时那条全局通知的标题（正文复用上面 `result.count`，不另写一句） */
        notif: {
          title: '抽取成功',
        },
        errors: {
          ratingOrder: '难度下限不能大于上限',
          handleRequired: '要排除已通过的题，得先填 Codeforces 账号',
          noMatch: '没有符合条件的题目，放宽一点条件再试试',
          worker: '抽题组件没起来，去设置里重新下载一次',
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
        fields: {
          link: '比赛',
          linkPlaceholder: '比赛链接或 ID，如 2276 / codeforces.com/contest/2276',
        },
        action: {
          load: '载入',
          scrape: '抓样例',
          scraping: '抓取中…',
        },
        status: {
          loading: '正在获取比赛信息…',
          problems: '正在获取题目列表…',
          upcoming: '距开始 {time}',
          running: '已开赛 {time}',
          finished: '已结束',
          scraping: '正在抓取样例，这一趟要读完整个题目页…',
          scraped: '已抓取 {n} 道题的样例',
        },
        errors: {
          badLink: '认不出这是哪一场比赛，贴完整链接或 ID 试试',
          notFound: 'Codeforces 上没有这场比赛',
          notStarted: '还没开赛，题目开赛后才会出现',
          noProblems: '这场比赛没有题目列表（可能是 gym 或 group 的场次）',
          needsLogin: 'gym / group 的题目要登录 Codeforces 才能取，网页这条路过不去',
          worker: '抽题组件没起来，去设置里重新下载一次',
          fetch: '拉取 Codeforces 数据失败：{detail}',
          importFailed: '导入工作区失败：{detail}',
          scrapeUnsupported: '抓样例要新版浏览器扩展（当前这版没有这功能）',
          scrapeBusy: '扩展正在抓另一场，稍后再试',
          scrapeTimeout: '抓取样例超时了，可以重试一次',
          scrapeFailed: '抓取样例失败：{detail}',
        },
      },
    },
  },

  en: {
    cf: {
      module: {
        group: 'Components',
        groupNote:
          'Random problems and contests are installed by default (about 2MB of problemset); this row shows the install status and offers a retry on failure. The "install by default" switch lives in the "Cloud sync" section and follows your account across devices.',
        title: 'Codeforces',
        idleHint:
          'Picks random problems by difficulty and tags, and tracks contests by link (about 2MB of problemset cache), downloaded once',
        downloadTitle: 'Download / retry the Codeforces problemset',
        /** 同 zh-CN：卸载走运行环境那颗共用弹窗，要的也是这两个 key */
        uninstallActionTitle: 'Uninstall "{title}"',
        uninstallTitle: 'Uninstall "{title}"?',
        uninstallHint:
          'Deletes the cached Codeforces problemset from this device (about 2MB), closes both the "Random problem" and "Contest" tabs, and turns off "install by default" — otherwise it would install itself again the next time the site opens. Use "Download" on this row to bring it back.',
        /** 同 zh-CN：云同步栏里的「默认安装」开关 */
        autoInstall: {
          label: 'Install by default',
          switchTitle: 'Automatically install the Codeforces component when the site opens',
          note: 'When on, every visit checks whether the problemset is on this device and downloads it (about 2MB) if not. When off, only the manual download above remains.',
        },
        downloading: 'Fetching the Codeforces problemset…',
        stage: {
          problemset: 'Fetching the Codeforces problemset (about 2MB)…',
          solved: 'Fetching the problems already solved by this account…',
          handle: 'Verifying the Codeforces account…',
          contestList: 'Fetching the contest list…',
          standings: 'Fetching this contest’s problems…',
        },
      },

      button: {
        label: 'Codeforces problem picker',
      },

      /** 同 zh-CN：抬头与类名在 components.js */
      menu: {
        picker: 'Random problem',
        contest: 'Contest',
      },

      tab: {
        close: 'Close the picker tab',
        closeContest: 'Close the contest tab',
      },

      picker: {
        picking: 'Picking…',
        fields: {
          rating: 'Difficulty',
          ratingMin: 'Min',
          ratingMax: 'Max',
          unlimited: 'Any',
          presets: 'Presets',
          tags: 'Tags',
          tagsPlaceholder: 'Comma separated, e.g. dp, math',
          count: 'Count',
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
          label: 'Handles',
          placeholder: 'tourist, hejie',
          checking: 'Checking…',
          ok: 'Handles are valid',
          notFound: 'No such handle: {handles}',
          network: 'Cannot reach Codeforces; skipping the check',
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
        },
        /** 同 zh-CN：正文复用上面 `result.count` */
        notif: {
          title: 'Pick finished',
        },
        errors: {
          ratingOrder: 'The minimum difficulty cannot exceed the maximum',
          handleRequired: 'Skipping solved problems needs a Codeforces handle',
          noMatch: 'Nothing matched — try loosening the filters',
          worker: 'The picker worker is not running; download the module again in Settings',
          fetch: 'Could not fetch data from Codeforces: {detail}',
          importFailed: 'Could not import into the workspace: {detail}',
        },
      },

      /** 同 zh-CN：导入按钮那三种状态复用 `picker.result.*` */
      contest: {
        title: 'Contest',
        fields: {
          link: 'Contest',
          linkPlaceholder: 'Contest link or ID, e.g. 2276 / codeforces.com/contest/2276',
        },
        action: {
          load: 'Load',
          scrape: 'Fetch samples',
          scraping: 'Fetching…',
        },
        status: {
          loading: 'Fetching contest…',
          problems: 'Fetching the problem list…',
          upcoming: 'Starts in {time}',
          running: 'Running for {time}',
          finished: 'Finished',
          scraping: 'Fetching samples — the whole problems page has to load first…',
          scraped: 'Samples fetched for {n} problems',
        },
        errors: {
          badLink: 'Could not tell which contest this is — paste a full link or an ID',
          notFound: 'No such contest on Codeforces',
          notStarted: 'Not started yet — problems appear once it begins',
          noProblems: 'No problem list for this contest (it may be a gym or group round)',
          needsLogin: 'Gym and group problems need a Codeforces login, which this page cannot do',
          worker: 'The picker worker is not running; download the module again in Settings',
          fetch: 'Could not fetch data from Codeforces: {detail}',
          importFailed: 'Could not import into the workspace: {detail}',
          scrapeUnsupported: 'Fetching samples needs a newer browser extension than the one installed',
          scrapeBusy: 'The extension is already fetching another contest — try again shortly',
          scrapeTimeout: 'Fetching samples timed out — you can retry',
          scrapeFailed: 'Could not fetch samples: {detail}',
        },
      },
    },
  },
}
