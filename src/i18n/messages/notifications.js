/**
 * 通知系统（services/notifications.js + components/NotificationCenter.vue）的文案。
 *
 * 【不落业务文案】通知的正文大多由将来的业务事件给（编译报错原文、同步结果…），
 * 那些调用方自带；这里只收两块：关闭键的无障碍标签，以及设置面板「应用」节里
 * 那组**演示入口**（四类型各一颗触发按钮 + 清空全部）的说明与按钮字。
 * 演示的触发时长与原型一致：info 3s / success 5s / warning 10s / error 常驻。
 */
export default {
  'zh-CN': {
    notifications: {
      close: '关闭通知',

      /**
       * 评测结果通知（services/runNotify.js）。标题就是判定码本身
       * （AC / WA / TLE / RE / MLE / CE / ERR，两套语言都不译，与卡片徽标同一口径），
       * 这里只收正文：全过那句话、计数枚举的五个量词、CE 常驻正文的兜底词。
       * 动态文本（编译报错原文、ERR 的原因）由调用方透传，不进词条。
       */
      run: {
        allPassed: '全部 {n} 个用例通过',
        passed: '通过',
        wrongAnswer: '答案错误',
        timeout: '超时',
        runtimeError: '运行出错',
        memoryLimit: '内存超限',
        compileFallback: '编译未通过',
      },

      /**
       * 「生成图片」（services/codeImage.js + 编辑区右键菜单）。
       * 四条出口各一套话（2026-10-21 按用户要求拆开）：
       * · 复制成功 → success；
       * · 用户自己点了「保存」→ saved，纯下载，不夹带剪贴板的话；
       * · 复制没成、退化成下载 → 按**失败原因**分两条：能力上没有（copyUnsupported）
       *   才说「不支持」；有能力却这次没写成（copyFailed）只说「这次没写成」——
       *   正常桌面浏览器权限被拒 / 手势过期都走这条，不能说成不支持；
       * · 整条链路出错 → error 且常驻 —— 那是需要人看一眼的情形。
       */
      image: {
        copiedTitle: '图片已复制',
        copiedBody: '已生成 PNG，可以直接粘贴',
        savedTitle: '图片已保存',
        savedBody: 'PNG 已下载到本机',
        copyUnsupportedTitle: '图片已下载',
        copyUnsupportedBody: '浏览器不支持写入剪贴板',
        copyFailedTitle: '图片已下载',
        copyFailedBody: '写入剪贴板失败',
        failedTitle: '生成图片失败',
        failedBody: '内容没能导出',
      },

      /**
       * 安装引导（services/installGuides.js）：开机自动弹一次 + 设置面板里那颗
       * 「安装引导」按钮手动再发一次。标题复用 `settings.menu.*` 那三条（齿轮菜单里同名同义），
       * 正文大多**复用设置面板现成的句子**（插件的 `hint*` / 换新 `updateHint*`、应用的 `noApi*`、
       * 以及那条 `blocked` 的前后半拼起来）—— 这里只收通知特有、面板里没有的几句。
       * ⚠️ 自动弹只覆盖三条（能装了 / 插件没装 / 插件旧了）；`blocked` 那条 2026-10-12 起
       * 只有手动按钮与设置面板才发得出，见 installGuides.js 的 available。
       */
      guide: {
        appReady: '装好后可从程序坞 / 开始菜单直接打开。',
        appInstalled: '本站已装成应用。',
        /** 插件那几条安装步骤里只有 Firefox 那条自带「装完回来点重新检测」，其余的在通知里补这一句 */
        extRecheck: '装完回设置 →「浏览器插件」点一次「重新检测」。',
        extUpToDate: '插件已是最新版（v{version}）。',
        later: '以后再说',
        /** Chromium 那条更新的按钮字：动作就是重下一份 zip。叫「更新」与没装那条的「下载」分开
            （2026-10-20 用户要求；标题已经是「更新浏览器插件」，按钮不重复全称） */
        update: '更新',
        copyFailed: '复制失败，请手动复制',
      },

      /**
       * 云端同步（services/cloudSession.js）的三类事件。
       *
       * - 导入 / 登录成功：两者办完都会整页刷新，通知跟着页面一起没，所以走
       *   notifyAfterReload 寄存、下次启动补发（见 services/notifications.js
       *   文件头那条例外）。`loggedInNoCloud` 那条是「云端还没有这份配置、直接认领
       *   用户名」的分支 —— 它不刷新，所以是当场发的；不带「已登录」三个字，
       *   标题已经说过了。
       * - 等待验证：取到码就发一条 10 分钟的通知（与码的有效期同长，见 cloudSession
       *   的 CODE_TTL_MS），正文下面还有一行**活倒计时**（2026-10-19 加）。按钮的用词收在这里：
       *   验证 / 一键填写（仅装了扩展；扩展还能回报保存结果时叫「填写并登录」，
       *   见 codeFillChain）/ 复制验证码 / 跳转到网页 / 取消，最后一颗在「上传」流程里
       *   叫「取消上传」，与面板 verifyLogin / verifyUpload 同一套分岔。
       */
      cloud: {
        importedTitle: '已导入云端配置',
        importedBody: '已套用「{handle}」的云端配置',
        loggedInTitle: '登录成功',
        loggedInBody: '已套用「{handle}」的云端配置',
        loggedInNoCloud: '云端暂无该用户名的配置，点「上传本机设置」保存',
        codeTitle: '等待验证',
        /* 时效那句（原先写在这里的「10 分钟内有效」）改成下面那行活的倒计时 —— 同一件事，
           说一遍就够了；届时的「已过期，请重新取码」也由它接着显示。 */
        codeBody: '把验证码 {code} 填进 Codeforces 的 Last name',
        codeCountdown: '剩余 {time}',
        codeExpired: '已过期，请重新取码',
        /* 「验证」那颗（2026-10-19 加）：在通知里就能把最后一步办完，不必回设置面板。
           用两个字的短词 —— 320px 卡片里五颗按钮，长一句会折成三行。 */
        codeVerify: '验证',
        codeRefresh: '重新取码',
        codeFill: '一键填写',
        /* 链路版（2026-10-20 加）：扩展能回报「保存完了」时，这一颗点下去会连验证与登录
           一起做完（见 cloudSession 的 fillCodeChained）。字面得说清它多做了什么。 */
        codeFillChain: '填写并登录',
        codeCopy: '复制验证码',
        codeOpen: '跳转到网页',
        codeCancelLogin: '取消登录',
        codeCancelUpload: '取消上传',
      },

      /**
       * 设置撤销（services/settingsUndo.js）：改任一设置发一条带「撤回」的通知。
       * `{name}` 是设置项自己的名字 —— 由那个设置自己的 labelKey 取（见 settingsUndo 的
       * labelKeyFor），所以这里只有句式，没有第二份设置名。
       */
      setting: {
        changed: '「{name}」已更新',
        undo: '撤回',
      },
    },
  },

  en: {
    notifications: {
      close: 'Dismiss notification',

      /** 见 zh-CN 那侧的说明：标题是判定码本身，这里只收正文 */
      run: {
        allPassed: 'All {n} test cases passed',
        passed: 'Passed',
        wrongAnswer: 'Wrong answer',
        timeout: 'Time limit',
        runtimeError: 'Runtime error',
        memoryLimit: 'Memory limit',
        compileFallback: 'Compilation failed',
      },

      image: {
        copiedTitle: 'Image copied',
        copiedBody: 'The PNG is ready — paste it anywhere',
        savedTitle: 'Image saved',
        savedBody: 'PNG downloaded',
        copyUnsupportedTitle: 'Image downloaded',
        copyUnsupportedBody: 'This browser can’t write images to the clipboard',
        copyFailedTitle: 'Image downloaded',
        copyFailedBody: 'Couldn’t write to the clipboard',
        failedTitle: 'Export failed',
        failedBody: 'The content could not be exported',
      },

      /** See the zh-CN side: titles come from `settings.menu.*`, body text mostly reuses panel strings */
      guide: {
        appReady: 'It then opens from the Dock / Start menu.',
        appInstalled: 'This site is already installed as an app.',
        extRecheck: 'Then go to Settings → “Browser extension” and hit “Check again”.',
        extUpToDate: 'The extension is up to date (v{version}).',
        later: 'Not now',
        update: 'Update',
        copyFailed: 'Copy failed — copy it manually',
      },

      /** See the zh-CN side: import / sign-in success survive a full page reload via notifyAfterReload */
      cloud: {
        importedTitle: 'Cloud settings imported',
        importedBody: 'Applied the cloud settings stored by “{handle}”',
        loggedInTitle: 'Signed in',
        loggedInBody: 'Applied the cloud settings stored by “{handle}”',
        loggedInNoCloud: 'No cloud settings for this handle yet — use “Upload local settings”',
        codeTitle: 'Waiting for verification',
        /* See the zh-CN side: the “valid for 10 minutes” tail moved into the live countdown line */
        codeBody: 'Put the code {code} into your Codeforces Last name',
        codeCountdown: '{time} left',
        codeExpired: 'Expired — get a new code',
        codeVerify: 'Verify',
        codeRefresh: 'Get a new code',
        codeFill: 'Auto-fill',
        /** See the zh-CN side: the chained variant also verifies and signs in */
        codeFillChain: 'Fill in + sign in',
        codeCopy: 'Copy code',
        codeOpen: 'Open page',
        codeCancelLogin: 'Cancel sign-in',
        codeCancelUpload: 'Cancel upload',
      },

      /** See the zh-CN side: {name} comes from the changed setting's own labelKey */
      setting: {
        changed: '“{name}” updated',
        undo: 'Undo',
      },
    },
  },
}
