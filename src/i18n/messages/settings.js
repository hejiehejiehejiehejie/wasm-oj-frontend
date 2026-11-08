/**
 * 设置视图（含编辑器偏好、快捷键、应用与插件）与各偏好选项名的文案。
 *
 * 这些 key 大多被 `EditorSettingsPanel.vue` 的数据表（EDITOR_GROUPS / APPEARANCE_ROWS /
 * SECTIONS）引用。**表里存的是 key，不是算好的字符串** —— 那几张表在 `<script setup>`
 * 顶层构造，只求值一次，写死字符串就会在切语言时不跟着变（见 i18n/index.js 的调用纪律）。
 */
export default {
  'zh-CN': {
    settings: {
      ariaLabel: '设置',
      navAriaLabel: '设置分类',

      /** 菜单（下拉）里的分类，同时也是右侧每一组的标题 */
      section: {
        workspace: '工作区',
        appearance: '外观',
        editor: '编辑器',
        templates: '模板',
        shortcuts: '快捷键',
        judge: '评测',
        runtime: '本地运行环境',
        extension: '浏览器插件',
        cloud: '云端同步',
        app: '应用',
        help: '帮助',
      },

      /** 齿轮下拉菜单（一级行 / 二级子菜单）自己要的那几条。
       *  各项标签尽量复用上面各处现成的 label —— 主题、字号、自动保存这些与设置面板里
       *  是同一句话，改一处两边都跟着变，不维护第二份。 */
      menu: {
        openSettings: '打开设置面板…',
        sections: '设置分类',
        /* 菜单里那一行**不复用** section.cloud（2026-10-11 用户定的）：同一个功能在下拉里
           读作「同步设置」，进了设置面板那一栏仍叫「云端同步」——两处刻意不同名，别顺手统一 */
        cloudSync: '同步设置',
        /* 同理：下拉里那个用户名框的占位文字也不复用 cloud.handlePlaceholder
           （2026-10-11 用户定的，只改下拉里那一个） */
        cloudHandlePlaceholder: '如：he-jie（CFID）',
        decrease: '减小',
        increase: '增大',
        /* 下面四条是**条件行**（见 services/settingsMenu.js 的 `when`）：
           「安装为应用」的判据就是 canInstall；插件那四条按**两种状态 × 这台机器的路**二选一 ——
           没探到扩展叫「安装 / 下载」，探到旧版两颗统一叫「更新」（2026-10-12 用户要求把安装与
           更新分开；2026-10-20 再要求旧版那对与「下载」也分得开，Firefox 走 AMO、Chromium 走 zip
           的区别只在动作，不落在词上）。 */
        installApp: '安装为应用',
        installExtension: '安装浏览器插件',
        updateExtension: '更新浏览器插件',
        downloadExtension: '下载浏览器插件',
      },

      /** 模板：新建文件时按语言填入的初始正文（状态在 services/fileTemplates.js） */
      templates: {
        note: '新建文件时填入对应模板',
        enable: {
          label: '启用模板',
          hint: '关闭后代码文件为空',
        },
        hint: '新建 .{ext} 文件时的初始文本',
        lang: {
          cpp: 'C++',
          python: 'Python 3',
          markdown: 'Markdown',
        },
        restore: {
          label: '恢复默认',
          title: '恢复该语言的内置模板',
        },
      },

      /** 工作区（仅桌面端）：在当前文件里打开/切换「本机文件夹」 */
      workspace: {
        note: '代码存放位置：虚拟工作区存在浏览器里，本机文件夹直接读写磁盘；切换后界面重载。',
        current: '当前工作区',
        modeVirtual: '虚拟工作区',
        modeFolder: '本机文件夹',
        rootLabel: '文件夹路径',
        flow: '打开文件夹',
        note2: '用本机目录替换当前虚拟工作区；隐藏项与 node_modules 不会出现在文件树里。',
        choose: '选择文件夹',
        chooseTitle: '选择本机目录作为工作区，之后界面会重载',
        switching: '正在切换…',
        chooseFailed: '打开文件夹失败：{message}',
        back: '切回虚拟工作区',
        backTitle: '回到浏览器里的虚拟工作区，之后界面会重载',
        backHint: '本机文件夹里的文件不会被删除，随时可以再切回去。',
      },

      appearance: {
        theme: { label: '主题' },
        fontSize: { label: '字体大小', hint: '代码字号（默认 14px，范围 8–32）' },
        uiScale: {
          label: '界面缩放',
          hint: '整体缩放界面，编辑器同步缩放',
        },
        panelPosition: {
          label: '侧边栏位置',
          hint: '侧栏放在编辑区左侧或右侧',
        },
        narrowCollapseSide: {
          label: '窄屏折叠方向',
          hint: '窄屏收起侧栏后，图标栏贴屏幕上方或下方',
        },
        locale: {
          label: '界面语言',
          hint: '界面与帮助的语言，不影响判题语言',
        },
      },

      /** 数值型（与开关型）选项的文案模板 */
      value: {
        times: '{n} 倍',
        spaces: '{n} 空格',
        on: '开启',
        off: '关闭',
      },

      editor: {
        groupFont: '字体',
        groupEdit: '编辑',
        groupCursor: '光标与高亮',
        groupView: '视图',
        groupImage: '代码图片',
        groupHover: '悬停提示',
        groupPerformance: '性能',

        fontFamily: { label: '字体', hint: '代码编辑器使用的等宽字体' },
        lineHeightRatio: { label: '行高', hint: '行间距相对字号的倍数' },
        fontLigatures: {
          label: '字体连写',
          hint: '把 =>、!= 等符号渲染成连字，需字体支持（内置字体均支持）',
        },
        autoSave: {
          label: '自动保存',
          hint: '停顿约 1 秒后自动保存；切换文件与窗口失焦时也会保存。关闭后需手动保存',
        },
        tabSize: { label: '缩进宽度', hint: '制表符的显示宽度，也是自动缩进的空格数（默认 4）' },
        insertSpaces: {
          label: '空格代替 Tab',
          hint: '开启后按 Tab 插入空格，关闭则插入制表符（默认关闭）',
        },
        wordWrap: { label: '自动换行', hint: '超长代码自动折行，避免横向滚动' },
        wordWrapColumn: {
          label: '换行列宽',
          hint: '仅「按列宽换行」时生效，超过该列数即折行（默认 80）',
        },
        bracketPairColorization: { label: '括号配色', hint: '为嵌套的括号对分配不同颜色' },
        indentGuides: { label: '缩进参考线', hint: '在缩进层级左侧绘制竖线' },
        bracketGuides: { label: '括号引导线', hint: '在光标所在的括号对之间绘制连线' },
        stickyScroll: {
          label: '粘性滚动',
          hint: '滚动时把当前函数或类固定在编辑器顶部',
        },
        scrollBeyondLastLine: {
          label: '滚过最后一行',
          hint: '可在最后一行下方继续滚动出空白区域（默认关闭）',
        },
        smoothScrolling: { label: '平滑滚动', hint: '滚动带过渡动画' },
        cursorStyle: { label: '光标样式', hint: '文本插入点的形状' },
        cursorBlinking: { label: '光标闪烁方式', hint: '插入点的闪烁动画' },
        cursorSmoothCaretAnimation: { label: '光标平滑移动', hint: '打字时光标移动带过渡动画' },
        renderLineHighlight: { label: '当前行突出', hint: '高亮光标所在行' },
        renderWhitespace: { label: '空白字符', hint: '显示空格与制表符' },
        lineNumbers: {
          label: '行号',
          hint: '编辑器左侧是否显示行号；「仅 Markdown 隐藏」只在题解（.md）中收掉',
        },
        minimap: { label: '代码缩略图', hint: '编辑器右侧的代码微缩导航（默认关闭）' },
        padding: { label: '内边距', hint: '内容与边框之间的留白' },
        scrollbarSize: { label: '滚动条粗细', hint: '编辑器滚动条的宽度' },
        statusBar: {
          label: '底部状态栏',
          hint: '编辑器底部状态栏（文件名、光标位置、语言等）；题解（.md）下始终隐藏',
        },
        lowPower: {
          label: '低配模式',
          hint: '把后台语法检查延后到停手 1.2 秒后（默认 0.3 秒），老机器更省 CPU；判题不受影响',
        },
        hover: {
          label: '函数悬停提示',
          hint: '鼠标停在函数名上时显示签名与源码注释；触屏不会触发',
        },
        semanticHover: {
          label: '语义分析（实验）',
          hint: '用站内 clang 推导真实类型，可提示容器成员、结构体字段与重载。代价：每次悬停跑一遍编译器前端（约 0.2–1 秒），首次使用下载约 30MB 工具链并常驻约 23MiB 内存（闲置 5 分钟自动释放）；关闭时完全走零成本的静态表。编译器被运行时占用时自动退回基础提示',
        },
        codeImageQuality: {
          label: '导出质量',
          hint: '只决定渲染倍率：越高越清晰，文件也越大',
        },
        codeImageDots: {
          label: '窗口栏圆点',
          hint: '在卡片左上角画出三个 macOS 风格圆点',
        },
        codeImageLineNumbers: {
          label: '显示行号',
          hint: '在卡片正文左侧画出行号栏（默认开启）',
        },
        codeImageAsk: {
          label: '每次询问复制还是保存',
          hint: '生成图片后弹窗选择；关闭后按「默认动作」执行（默认开启）',
        },
        codeImageAction: {
          label: '默认动作',
          hint: '关闭「每次询问」后生效（默认复制）',
        },
      },

      /** 偏好选项的取值名（下拉里的那一项） */
      option: {
        themeDark: '深色',
        themeLight: '浅色',
        themeMidnight: '午夜蓝',
        themeOled: '纯黑',
        themePaper: '暖白纸张',
        themeLeaf: '护眼豆绿',
        themeDusk: '紫夜',
        themeForest: '深林墨绿',
        themeContrast: '高对比',
        themeMist: '雾蓝',
        fontDefault: '默认',
        fontJetBrains: 'JetBrains Mono（内置）',
        fontFiraCode: 'Fira Code（内置）',
        fontCascadia: 'Cascadia Code（内置）',
        wrapOff: '不换行',
        wrapOn: '按视口换行',
        wrapColumn: '按列宽换行',
        lnOn: '显示',
        lnOff: '隐藏',
        lnMarkdown: '仅 Markdown 隐藏（默认）',
        cursorLine: '竖线',
        cursorBlock: '方块',
        cursorUnderline: '下划线',
        blinkSmooth: '平滑',
        blinkBlink: '闪烁',
        blinkPhase: '呼吸',
        blinkExpand: '展开',
        blinkSolid: '常亮',
        wsNone: '不显示',
        wsSelection: '仅选中行（默认）',
        wsTrailing: '行尾空白',
        wsBoundary: '词边界',
        wsAll: '全部',
        lhAll: '行与行号（默认）',
        lhLine: '仅行背景',
        lhGutter: '仅行号',
        lhNone: '不突出',
        padCompact: '紧凑',
        padNormal: '标准（默认）',
        sbThin: '细',
        sbNormal: '标准（默认）',
        sbThick: '粗',
        sideLeft: '左侧',
        sideRight: '右侧',
        sideTop: '上方',
        sideBottom: '下方',
        qualityMedium: '中',
        qualityHigh: '高',
        qualityUltra: '极致',
        imageCopy: '复制',
        imageSave: '保存',
      },

      shortcut: {
        /** 动作名（用 in SHORTCUT_ACTIONS） */
        run: { label: '运行全部用例', hint: '光标在编辑器里也生效' },
        submitSolution: {
          label: '提交到 Codeforces',
          hint: '把当前文件提交到题目所属比赛；需要浏览器插件，未关联题目时无效',
        },
        togglePanel: { label: '显示 / 隐藏侧边栏' },
        switchPanel: { label: '切换侧栏面板', hint: '资源管理器 ↔ 评测样例' },
        toggleLayout: { label: '侧边栏左右对调' },
        newCase: { label: '新增一条测试用例' },
        openSettings: { label: '打开 / 收起设置' },
        exportImage: {
          label: '生成图片',
          hint: '把选中内容导成 PNG，无选区时导出整个文件；.md 按题解排版',
        },
        renameNode: {
          label: '重命名（文件 / 文件夹）',
          hint: '焦点需在资源管理器；macOS 上 F2 同样可用',
        },
        deleteNode: {
          label: '删除（文件 / 文件夹）',
          hint: '焦点需在资源管理器；有选区时删整个选区',
        },
        selectAllNodes: {
          label: '全选（资源管理器）',
          hint: '焦点需在资源管理器 · 选中焦点所在文件夹的全部内容（含子目录；空白处 = 根目录）',
        },

        restore: { label: '恢复默认', hint: '把所有快捷键还原成初始设置', title: '恢复默认快捷键' },

        /** 整组的说明 */
        note: '点右侧输入框后按下组合键即可改绑；Delete 清除绑定，Esc 取消录制。与浏览器或其它功能冲突时会拒绝并说明原因。',

        /** 固定键位徽标的悬浮提示（那三条固定动作已不在本列表展示，徽标分支保留待用） */
        fixedKey: '固定键位，不可改绑',

        /** 录制框自身的状态文案 */
        recorder: {
          placeholder: '按下组合键…',
          unbound: '未绑定',
          clear: '清除绑定',
          hint: '按 Esc 取消，按 Delete 清除绑定',
          idle: '点一下开始录制',
          tip: 'Esc 取消，Delete 清除绑定',
        },

        /** 录制时的冲突提示 */
        reserved: '浏览器占用了这个组合，网页无法拦截',
        needModifier: '至少带一个 Ctrl / ⌘ / Alt，否则打字时会误触发',
        alreadyBound: '已绑定到「{name}」',
      },

      judge: {
        timeLimit: { label: '运行时限', hint: '只计运行阶段，不含编译' },
        memoryLimit: { label: '内存上限', hint: '超出判 MLE' },
        /**
         * 输出比对方式（2026-11-09 加）。hint 把三档口径一句话讲完 —— 下拉里的名字
         * （逐行比对 / 忽略空白 / 严格逐字符）只够分辨，说不清「到底放过什么」。
         * 题目信息里显式指定过的优先，这一点也要写出来，否则用户改不动某个题目时会当成 bug。
         */
        checker: {
          label: '输出比对',
          hint: '逐行忽略行尾空格；忽略空白按词比；严格逐字符要求完全一致。题目信息里指定过则优先',
        },
        celebration: { label: '通过动画', hint: '所有样例都通过时，在样例栏飘落彩色纸屑' },
        crossCheck: {
          label: '关闭优化重跑比对',
          hint: '用 -O0 重编一遍跑同一条用例，两次输出不同就提示（查未定义行为，多占一份内存）',
        },
        engines: '评测引擎',
      },

      app: {
        basics: '基础设置',
        install: {
          label: '安装到设备',
          title: '安装到设备',
          /**
           * 三个状态词就是这一栏的**引擎判据**那部分文案 —— 只看一条：**网页侧能不能靠这个引擎
           * 一键装**（`useInstallPrompt.js` 的 `INSTALL_API_SUPPORTED` —— 属性检测
           * `'onbeforeinstallprompt' in window`，**再扣掉三星 Internet 那一档假阳性**，
           * 2026-10-14 加，见 HANDOFF 坑 55）。**状态词本身不按浏览器型号分岔**（三星那条例外
           * 收在 `useInstallPrompt.js` 里，不在这一层）。
           *
           * 按钮亮不亮是另一回事（看 `canInstall`），状态词不替它解释 ——
           * 原来那样解释会同时错两处：既把「不支持」和「此刻还不能装」混成一句，
           * 又得靠猜浏览器来补救。
           *
           * ⚠️ 但**「没有 API」不等于「这台机器装不了」**，下面 `noApi*` 那几条就是给它补的
           * 出路说明（2026-10-12 用户改口：三条真实的安装路都要给引导）。分岔只决定
           * 「说明写哪句」，**不许回头去改状态词与按钮**。
           */
          statusAvailable: '当前浏览器支持',
          statusUnsupported: '当前浏览器不支持',
          statusInstalled: '已安装',
          /**
           * 灰按钮的唯一解释（面板那边叫 `installUnavailable`）：引擎有这套 API、此刻也没装，
           * 却拿不到一键安装的入口。**不是错误，是浏览器的正常状态** —— 安装事件只由浏览器
           * 在自己认为「没装」时派发一次，站点既不能问也不能催。中间夹着 `<code>chrome://apps</code>`，
           * 所以拆成前后两半（与插件快捷键那条同一套写法）。2026-10-12 用户报障：装过一次、
           * 把应用删了，按钮就一直是灰的 —— 因为从 Finder 删图标不算卸载。
           */
          blockedPrefix:
            '一键安装入口当前不可用。常见原因：装过又删掉（删图标不算卸载），或取消过安装弹窗。打开',
          blockedSuffix: '，右键移除该应用，再刷新本页。',
          copyApps: '复制地址',
          copied: '已复制',
          copyAppsTitle:
            '复制 chrome://apps —— 网页无法跳转，需粘贴到地址栏打开',
          /**
           * 「引擎没有安装 API，但这个浏览器自己装得上」的出路说明（面板那边叫
           * `installNoApiHint`）。**整句写**：这里没有要强调的地址或键名，拆两半只会更长。
           *
           * 事实来源是 MDN 的兼容表：`beforeinstallprompt` 在 **Firefox（桌面 + 安卓）与
           * Safari（桌面 + iOS）全部不支持** —— 所以这几家都落「当前浏览器不支持」，可它们
           * 自己的菜单里确实有安装入口。桌面 Firefox 那句只提 **Windows 143+**（地址栏那个
           * 「网络应用」图标由 Firefox 自己提供，与 manifest 无关），macOS / Linux 上真没有
           * 这条路，别写成「Firefox 都能装」。
           */
          noApiFirefoxAndroid:
            'Firefox 没有一键安装接口，可用右上角 ⋮ →「安装」；只有「添加到主屏幕」时，那是普通快捷方式，也能用。',
          noApiFirefoxWindows:
            '桌面版 Firefox 无法按清单装成应用；Windows 上 Firefox 143+ 可点地址栏的「网络应用」图标。',
          noApiFirefoxOther:
            '桌面版 Firefox 无法按清单装成应用，也没有其它安装入口（macOS / Linux）。',
          noApiIos:
            'iOS 上的浏览器都没有一键安装接口：用「分享」→「添加到主屏幕」。',
          noApiSafariDesktop:
            '桌面版 Safari 无法按清单安装：用「文件」→「添加到程序坞」。',
          /**
           * 三星 Internet（2026-10-14 加）。它**不是**「引擎没实现这个事件」那一类 —— 属性检测
           * 在它是假阳性（`onbeforeinstallprompt` 在、事件却不派发，见 `useInstallPrompt.js` 的
           * `MANUAL_INSTALL_BROWSER`）。两条路都写上：地址栏那个「＋」徽标是安装口径（manifest
           * 请求独立窗口时才有），菜单那条永远在、是退路。
           */
          noApiSamsung:
            '三星浏览器没有一键安装接口：点地址栏的「＋」→「主屏幕」（需站点请求独立窗口），或用菜单 ›「添加页面到」›「主屏幕」。',
          noApiGeneric:
            '这个浏览器没有一键安装接口，请用浏览器菜单安装。',
          /** 「应用」栏末尾那颗手动引导按钮（通知内容见 services/installGuides.js） */
          guide: '安装引导',
          guideHint: '用通知再演示一遍安装步骤',
        },
        installAction: '安装',
        installedAction: '已安装',
      },

      extension: {
        groupNote:
          '装好插件后，在题目页点插件图标，题面、样例和限制会直接送进本站。',
        /**
         * 安装引导按浏览器只给一条；认不出时给 `hintChromium` 那条通用步骤 ——
         * **fail-open 是刻意的**：猜错的代价是用户看不到入口，比多给一条路糟得多。
         * 移动端单独两句：那边能装的东西与桌面完全不是一回事。
         */
        hintFirefox: '点「Firefox 版」从附加组件商店安装；装完回来点「重新检测」。',
        hintEdge:
          'Edge 加载项暂未上架，先按通用步骤：下载 zip 并解压 → 打开 edge://extensions → 开「开发人员模式」→「加载解压缩的扩展」并选中解压目录。',
        hintChrome:
          '下载 zip 并解压 → 打开 chrome://extensions → 开「开发者模式」→「加载已解压的扩展程序」并选中解压目录。',
        hintChromium:
          '无法识别具体浏览器，按通用步骤：下载 zip 并解压 → 打开扩展管理页 → 开「开发者模式」→「加载已解压的扩展程序」并选中解压目录。',
        hintMobileUnsupported:
          '手机 / 平板只有安卓 Firefox 能安装此插件，请改用 Firefox。',
        /** Safari（含 iOS 上所有浏览器）：唯一「一条路都没有」的一档，别给按钮 */
        hintUnsupported:
          '此浏览器无法安装插件。桌面端请用 Chrome、Edge 或 Firefox；移动端只有安卓 Firefox 能装。',
        /** 上面那句里夹着一个 <code>chrome://extensions/shortcuts</code>，拆成前后两半 */
        shortcutsManagedPrefix: '插件快捷键由浏览器管理，网页无法改写或跳转到',
        shortcutsManagedSuffix: '（浏览器会拦截 chrome:// 跳转）。请复制地址后粘贴到地址栏打开。',
        /** Firefox 的快捷键不在 chrome://extensions/shortcuts（那个地址在 Firefox 上不存在） */
        shortcutsManagedSuffixFx:
          '（about: 页面网页同样打不开）。打开后点右上角齿轮 ›「管理扩展快捷键」即可查看与修改。',
        status: '安装状态',
        statusRunning: '已安装并运行中',
        statusMissing: '未检测到',
        recheck: '重新检测',
        recheckTitle: '重新检测插件',
        checking: '检测中',
        checkingHint: '检测中…',
        download: {
          label: '下载插件',
          firefox: 'Firefox 版',
          firefoxTitle: '前往 Firefox 附加组件商店安装',
          edge: 'Edge 版',
          edgeTitle: '前往 Edge 加载项商店安装',
        },
        /** 装了旧版时，这一行的标题换成它（说明同时换成 updateHint*，按钮照旧） */
        update: {
          label: '更新插件',
        },
        /** 下载那一行标题后面的版本号：标的是这个网站提供的安装包版本 */
        downloadVersion: '最新版本 v{version}',
        /** 装上的是旧版时那一行警告：只说版本对不上，怎么换新由上面那一行（带按钮）负责 */
        updateAvailable: '你装的是 v{current}，本站最新是 v{latest}。',
        updateHintManual: '重新下载安装包、替换旧目录，再在扩展管理页点刷新。',
        updateHintFirefox: 'Firefox 会自动更新，也可在附加组件管理器里手动检查。',
        /** 这一栏末尾那颗手动引导按钮（通知内容见 services/installGuides.js） */
        guide: '安装引导',
        guideHint: '用通知再演示一遍安装或更新步骤',
        destinations: '投递目标',
        destinationsNote:
          '插件解析的题目送往何处。两项可同时开启；关闭后仍会解析，只是不再向该侧发送。',
        destinationWebPage: '发送到本网站',
        destinationWebPageHint: '推到这个网站的标签页，直接存成题目文件',
        destinationLocalTools: '发送到本地工具',
        destinationLocalToolsHint: '推给 VS Code 的 CPH、CP Editor 等本地接收工具',
        configSaveFailed: '保存失败：未收到插件回执，请确认插件已启用后重试',
        commandShortcuts: '插件快捷键',
        shortcutUnset: '未设置',
        /**
         * 键位为空**不是故障**，是 Chrome 的常态：它只在**安装插件那一刻**按 manifest 的
         * suggested_key 绑一次，那一刻键位被别的扩展占着（或用户清掉过）就再也不自动绑，
         * 插件读回来就是空串。光摆一个「未设置」会让人以为站点读不到 ——
         * 必须说清「为什么没有」和「去哪儿绑」。（2026-10-12）
         */
        shortcutUnassignedNote:
          '浏览器未给此命令分配键位：Chrome 只在安装时绑定一次建议键位，被占用或清除后不再自动绑。复制上方地址，在设置页给「激活该扩展程序」绑一个空闲键，再点「重新检测」。',
        /** 插件一条命令都没报上来（重探没救回来时，多半是插件版本过旧） */
        shortcutEmptyNote:
          '没读到插件上报的快捷键。先点「重新检测」；仍为空多半是插件版本过旧，请按上方那一行更新。',
        shortcutsPage: '快捷键设置页',
        shortcutsHint: '复制后在地址栏粘贴打开',
        shortcutsCopiedHint: '已复制，粘贴到地址栏回车即可',
        shortcutsTitle: '复制 chrome://extensions/shortcuts',
        shortcutsTitleFx: '复制 about:addons',
        copyUrl: '复制地址',
        copied: '已复制',
        /** 插件内部命令 id → 中文名（扩展只暴露 _execute_action 这类内部 id） */
        commandParsePage: '解析当前页面题目',
      },

      cloud: {
        groupNote:
          '把本机偏好（编辑器、快捷键、界面、评测引擎等）存到云端；题目文件、测试样例与判题服务器地址不会上传。',
        handle: {
          label: 'Codeforces 用户名',
        },
        handlePlaceholder: '例如 he-jie',
        login: '登录',
        loginTitle:
          '在这台设备上登录该用户名；不会改动云端配置',
        /**
         * 「导入」与「登录」并排在同一行，但两件事完全不同：导入是**取一份公开的云端配置**
         * （GET /api/config/<handle> 本来就不需要鉴权），取完也不把这台设备绑到那个用户名上；
         * 登录则要证明你是主人、且会建立绑定。标题里必须把「不需要验证」说出来，
         * 否则没人会知道还有这么一条不用取码的路。
         */
        import: '导入',
        importTitle: '只取回云端配置，无需验证；本机设置会被覆盖并重新加载',
        loginNoCloud: '已登录。云端暂无该用户名的配置 —— 点「上传本机设置」保存当前设置',
        loggedIn: '已登录。点「下载到本机」取回云端配置',
        codeIntro: '云端已有你的配置。此步只确认身份，不会改动云端内容。',
        codeIntroUpload:
          '写入云端需先验证身份。验证成功后，本机会记住设备令牌，之后的写入无需再取码。',
        codeLabel: '验证码',
        /* 时效那半句（「10 分钟内有效」）交给倒计时那一行说，这里只留频率限制 —— 两处都在说
           「10 分钟」，排在同一行会读成重复（2026-10-19 排版收口） */
        codeHint: '同一用户名 10 分钟最多申请 5 次',
        /**
         * 倒计时与过期提示（2026-10-19 加）。`{time}` 是客户端的 mm:ss，不是服务端给的 ——
         * 起点是「收到码的那一刻」，见 cloudSession 的 codeDeadline。
         */
        codeCountdown: '剩余 {time}',
        codeExpired: '已过期，请重新取码',
        refreshCode: '重新取码',
        copyCode: '复制',
        copyCodeTitle: '把这枚验证码复制到剪贴板',
        copied: '已复制',
        /**
         * 「代填」只在装了扩展、且扩展能力清单里有 fill-code 时出现（见 useCompanionBridge
         * 的 canFillCode）。文案里必须点明它**不碰凭据** —— 用户装的是一个抓题插件，
         * 忽然被它代填个人资料，得有一句话说清它凭什么能做、又不拿走什么。
         */
        fillCode: '在 Codeforces 上自动填写',
        fillCodeTitle:
          '由已装扩展打开 Codeforces 的 Social 页，把验证码填入 Last name 并保存。扩展不会读取或上传你的 Codeforces 凭据。',
        fillCodeBusy: '正在填写…',
        fillCodeNote: '没装扩展也能用：按下面两步手动填写',
        fillCodeDone: '已填好，回到这里点下面的按钮完成验证',
        /**
         * 链路那两版（2026-10-20 加）：只在扩展具备 `fill-saved` 能力、且这一轮是登录时用
         * （见 cloudSession 的 fillCodeChained）。按钮确实多做了一件事，就得在字面上说出来 ——
         * 否则「点一下自动填写，结果顺手把我登录了」会像个意外。
         */
        fillCodeChain: '在 Codeforces 上自动填写并登录',
        fillCodeChainTitle:
          '由已装扩展打开 Codeforces 的 Social 页，把验证码填入 Last name 并保存，然后关闭该页并在本页完成验证与登录。扩展不会读取或上传你的 Codeforces 凭据。',
        fillCodeChainBusy: '正在填写并验证…',
        /**
         * 取码相里那行提示的另外三种形态（第四种是默认的 fillCodeNote，即「不知道」）。
         * 只在**装了带 cf-check 能力的扩展**、且它报回了明确结论时才出现。
         * 措辞别写成断言：扩展报的是它在浏览器里看到的事实，不是服务端确认过的身份
         * （见 cloudSession 的 cfStatus）——所以这里说的是「这个浏览器」，不是「你」。
         */
        cfHintMatch: '已确认此浏览器登录的是 {handle}，可直接填写',
        cfHintMismatch: '此浏览器登录的不是「{handle}」，请切换账号后再点',
        cfHintNotLoggedIn: '此浏览器未登录 Codeforces，请先登录',
        fillNotLoggedIn: '此浏览器未登录 Codeforces，请先登录再试',
        fillMismatch: '此浏览器登录的不是「{handle}」，请切换账号后重试',
        fillNoTab: '无法打开 Codeforces 设置页，请手动打开一次后重试',
        fillPage: '无法识别 Codeforces 页面（可能已改版），请手动填写',
        fillTimeout: '扩展无响应，请确认已启用后重试',
        fillUnsupported: '扩展版本过旧，不支持自动填写，请手动填写',
        fillFailed: '自动填写失败，请手动填写',
        codeSteps: '下一步：',
        codeStep1: '把验证码填入 {link}的 Last name 字段（Settings › Social）并保存',
        codeStep1Link: 'Codeforces 个人资料',
        codeStep2: '回到这里点「验证并登录」，云端会读取 Codeforces 上的 Last name 确认身份',
        codeStep2Upload: '回到这里点「验证并上传」，云端会读取 Codeforces 上的 Last name 确认身份',
        verifyLogin: '验证并登录',
        verifyUpload: '验证并上传',
        cancel: '取消',
        boundTag: '已绑定',
        updatedAt: '云端最近更新：{time}',
        neverUpdated: '这台设备还没往云端存过',
        download: '下载到本机',
        downloadTitle: '用云端配置覆盖本机设置并重新加载',
        upload: '上传本机设置',
        uploadTitle:
          '用本机设置覆盖云端。已有设备令牌时直接写入，令牌失效才需重新取码',
        unbind: '解绑',
        unbindTitle: '解绑这台设备',
        unbindConfirmTitle: '解绑这台设备？',
        unbindConfirmDesc:
          '解绑后本机不再关联「{handle}」，可随时重新绑定；云端配置保留。',
        applyConfirmTitle: '套用云端配置？',
        applyConfirmDesc:
          '本机设置将被「{handle}」的云端配置替换，随后页面重新加载。',
        applyConfirm: '套用',
        applyNoCloud: '云端还没有「{handle}」的配置',
        applyMissingTitle: '这个用户名还没有保存过配置',
        applyMissingDesc: '云端没有「{handle}」的配置，已返回首页。',
        applyMissingOk: '知道了',
        saved: '已保存到云端',
        downloaded: '已应用云端配置，正在重新加载…',
        emptyProfile: '云端配置里没有可用的设置',
        noCloudConfig: '云端暂无该用户名的配置，请先在本机「验证并上传」一次',
        errorHandle: '请先填写 Codeforces 用户名',
        errorNetwork: '请求没有发出去，请检查网络后重试',
        errorBadBody: '接口返回 HTTP {status}，但内容格式不对（请求可能未到达本站 /api）',
        tokenExpired: '设备令牌已失效，请重新取码验证',
        publicNotice:
          '上传后这份配置是公开的：无需登录，在网址后接 cfid（如 www.998244353.best/he-jie）即可取回。上传即表示同意公开，同步内容仅限主题、快捷键、界面缩放等偏好。',
      },

      help: {
        guideLink: '完整使用指南',
        /** 帮助栏置顶的站点提示。末尾那句后面紧跟留言板地址 ——
            地址本身不翻译，直接写在 HelpPanel 的模板里 */
        notice:
          '网站仍在测试中，名字也还没起好。bug 反馈、功能建议、取名或闲聊，欢迎留言：',
      },
    },
  },

  en: {
    settings: {
      ariaLabel: 'Settings',
      navAriaLabel: 'Settings categories',

      section: {
        workspace: 'Workspace',
        appearance: 'Appearance',
        editor: 'Editor',
        templates: 'Templates',
        shortcuts: 'Shortcuts',
        judge: 'Judge',
        runtime: 'Local runtime',
        extension: 'Browser extension',
        cloud: 'Cloud sync',
        app: 'App',
        help: 'Help',
      },

      /** Gear dropdown menu (top level + submenus). Labels reuse the existing rows
       *  above wherever possible — theme, font size and auto save are the same sentence
       *  as in the settings panel, so there is no second copy to keep in sync. */
      menu: {
        openSettings: 'Open settings…',
        sections: 'Settings sections',
        /* Deliberately NOT reusing section.cloud (decided 2026-10-11): in the dropdown the row
           reads "Sync settings", while the panel section stays "Cloud sync" — do not unify. */
        cloudSync: 'Sync settings',
        /* Same story for the handle box's placeholder: the dropdown has its own copy
           (decided 2026-10-11 — only the one in the dropdown was changed). */
        cloudHandlePlaceholder: 'he-jie (CF ID)',
        decrease: 'Decrease',
        increase: 'Increase',
        /* Four conditional rows (see `when` in services/settingsMenu.js): the install-as-app one is
           gated on canInstall, while the extension ones cover two states on this machine's route —
           nothing detected reads "install / download", an outdated install reads "update" on both
           routes (2026-10-12: keep install and update apart; 2026-10-20: keep update and download
           apart too — AMO vs zip differs only in the action, not in the wording). */
        installApp: 'Install as an app',
        installExtension: 'Install the extension',
        updateExtension: 'Update the extension',
        downloadExtension: 'Download the extension',
      },

      /** 模板：新建文件时按语言填入的初始正文（状态在 services/fileTemplates.js） */
      templates: {
        note: 'Fills new files with the matching template',
        enable: {
          label: 'Enable templates',
          hint: 'When off, new code files start empty',
        },
        hint: 'Initial text for a new .{ext} file',
        lang: {
          cpp: 'C++',
          python: 'Python 3',
          markdown: 'Markdown',
        },
        restore: {
          label: 'Restore default',
          title: 'Restore the built-in template for this language',
        },
      },

      /** Workspace (desktop only): open / switch a local folder as the current workspace */
      workspace: {
        note: 'Where your code lives: the virtual workspace stores files in the browser; a local folder reads and writes your disk. Switching reloads the interface.',
        current: 'Current workspace',
        modeVirtual: 'Virtual workspace',
        modeFolder: 'Local folder',
        rootLabel: 'Folder path',
        flow: 'Open a folder',
        note2: 'Use a local folder instead of the virtual workspace. Hidden entries and node_modules stay out of the tree.',
        choose: 'Choose folder',
        chooseTitle: 'Pick a local folder as the workspace; the interface reloads afterwards',
        switching: 'Switching…',
        chooseFailed: 'Could not open the folder: {message}',
        back: 'Back to virtual workspace',
        backTitle: 'Return to the virtual workspace in the browser; the interface reloads afterwards',
        backHint: 'Files in the local folder are never deleted — you can switch back at any time.',
      },

      appearance: {
        theme: { label: 'Theme' },
        fontSize: { label: 'Font size', hint: 'Code font size (default 14px, range 8–32)' },
        uiScale: {
          label: 'Interface scale',
          hint: 'Scale the whole interface, including the editor',
        },
        panelPosition: {
          label: 'Sidebar position',
          hint: 'Put the sidebar left or right of the editor',
        },
        narrowCollapseSide: {
          label: 'Narrow-screen collapse edge',
          hint: 'On narrow screens, dock the collapsed icon bar at the top or bottom',
        },
        locale: {
          label: 'Interface language',
          hint: 'Language of the interface and help; not the judge language',
        },
      },

      value: {
        times: '{n}×',
        spaces: '{n} spaces',
        on: 'On',
        off: 'Off',
      },

      editor: {
        groupFont: 'Font',
        groupEdit: 'Editing',
        groupCursor: 'Cursor & highlighting',
        groupView: 'View',
        groupImage: 'Code image',
        groupHover: 'Hover',
        groupPerformance: 'Performance',

        fontFamily: { label: 'Font family', hint: 'The monospace font used by the code editor' },
        lineHeightRatio: { label: 'Line height', hint: 'Line spacing as a multiple of the font size' },
        fontLigatures: {
          label: 'Font ligatures',
          hint: 'Render =>, != and similar as joined glyphs (needs font support; bundled fonts have it)',
        },
        autoSave: {
          label: 'Auto save',
          hint: 'Saves about a second after you stop typing, and when switching files or losing focus. Off means manual save only.',
        },
        tabSize: {
          label: 'Indent width',
          hint: 'Visual width of a tab, also used for auto-indent (default: 4)',
        },
        insertSpaces: {
          label: 'Spaces instead of Tab',
          hint: 'On inserts spaces for Tab; off inserts a real tab (default: off)',
        },
        wordWrap: { label: 'Word wrap', hint: 'Wrap long lines instead of scrolling sideways' },
        wordWrapColumn: {
          label: 'Wrap column',
          hint: 'Only for “Wrap at column”: lines wrap past this column (default: 80)',
        },
        bracketPairColorization: {
          label: 'Bracket pair colouring',
          hint: 'Give nested bracket pairs different colours',
        },
        indentGuides: { label: 'Indent guides', hint: 'Draw vertical lines at each indent level' },
        bracketGuides: {
          label: 'Bracket guides',
          hint: 'Draw a line between the bracket pair at the cursor',
        },
        stickyScroll: {
          label: 'Sticky scroll',
          hint: 'Pin the enclosing function or class to the top while scrolling',
        },
        scrollBeyondLastLine: {
          label: 'Scroll past last line',
          hint: 'Allow scrolling into empty space below the last line (default: off)',
        },
        smoothScrolling: { label: 'Smooth scrolling', hint: 'Animate scrolling' },
        cursorStyle: { label: 'Cursor style', hint: 'Shape of the text insertion point' },
        cursorBlinking: { label: 'Cursor blinking', hint: 'Blink animation of the insertion point' },
        cursorSmoothCaretAnimation: {
          label: 'Smooth caret animation',
          hint: 'Animate cursor movement while typing',
        },
        renderLineHighlight: { label: 'Current line highlight', hint: 'Highlight the cursor line' },
        renderWhitespace: { label: 'Whitespace characters', hint: 'Show spaces and tabs' },
        lineNumbers: {
          label: 'Line numbers',
          hint: 'Show line numbers in the gutter; “Hidden in Markdown” hides them only for editorials (.md)',
        },
        minimap: {
          label: 'Minimap',
          hint: 'Scaled-down code overview on the right edge (default: off)',
        },
        padding: { label: 'Padding', hint: 'Space between content and border' },
        scrollbarSize: { label: 'Scrollbar width', hint: 'Width of the editor scrollbars' },
        statusBar: {
          label: 'Bottom status bar',
          hint: 'Status bar at the editor bottom (file name, cursor position, language…); never shown for editorials (.md)',
        },
        lowPower: {
          label: 'Low-spec mode',
          hint: 'Delays the background syntax check to 1.2s after you stop typing (0.3s by default), saving CPU on older machines; judging is unaffected',
        },
        hover: {
          label: 'Function hover',
          hint: 'Shows the signature and source comment when you hover a function name; touch screens do not trigger it',
        },
        semanticHover: {
          label: 'Semantic analysis (experimental)',
          hint: 'Uses the built-in clang to derive real types, so container members, struct fields and overloads work too. Cost: one compiler frontend run per hover (about 0.2–1s), plus a one-time ~30MB toolchain download on first use and ~23MiB resident memory (released after 5 idle minutes); with it off, hovering stays on the zero-cost static table. Falls back to basic hints while the compiler is busy',
        },
        codeImageQuality: {
          label: 'Export quality',
          hint: 'Sets the render scale only: higher is sharper and larger',
        },
        codeImageDots: {
          label: 'Window dots',
          hint: 'Draw three macOS-style dots in the card’s top-left corner',
        },
        codeImageLineNumbers: {
          label: 'Line numbers',
          hint: 'Draw a line-number gutter left of the code (default: on)',
        },
        codeImageAsk: {
          label: 'Ask copy or save every time',
          hint: 'Prompt after the image is built; off runs “Default action” directly (default: on)',
        },
        codeImageAction: {
          label: 'Default action',
          hint: 'Used when “Ask copy or save every time” is off (default: copy)',
        },
      },

      option: {
        themeDark: 'Dark',
        themeLight: 'Light',
        themeMidnight: 'Midnight Blue',
        themeOled: 'Pure Black',
        themePaper: 'Warm Paper',
        themeLeaf: 'Eye-care Green',
        themeDusk: 'Violet Night',
        themeForest: 'Forest Green',
        themeContrast: 'High Contrast',
        themeMist: 'Mist Blue',
        fontDefault: 'Default',
        fontJetBrains: 'JetBrains Mono (bundled)',
        fontFiraCode: 'Fira Code (bundled)',
        fontCascadia: 'Cascadia Code (bundled)',
        wrapOff: 'Off',
        wrapOn: 'Wrap at viewport',
        wrapColumn: 'Wrap at column',
        lnOn: 'Shown',
        lnOff: 'Hidden',
        lnMarkdown: 'Hidden in Markdown (default)',
        cursorLine: 'Line',
        cursorBlock: 'Block',
        cursorUnderline: 'Underline',
        blinkSmooth: 'Smooth',
        blinkBlink: 'Blink',
        blinkPhase: 'Phase',
        blinkExpand: 'Expand',
        blinkSolid: 'Solid',
        wsNone: 'None',
        wsSelection: 'Selection only (default)',
        wsTrailing: 'Trailing',
        wsBoundary: 'Boundary',
        wsAll: 'All',
        lhAll: 'Line and gutter (default)',
        lhLine: 'Line only',
        lhGutter: 'Gutter only',
        lhNone: 'None',
        padCompact: 'Compact',
        padNormal: 'Normal (default)',
        sbThin: 'Thin',
        sbNormal: 'Normal (default)',
        sbThick: 'Thick',
        sideLeft: 'Left',
        sideRight: 'Right',
        sideTop: 'Top',
        sideBottom: 'Bottom',
        qualityMedium: 'Medium',
        qualityHigh: 'High',
        qualityUltra: 'Ultra',
        imageCopy: 'Copy',
        imageSave: 'Save',
      },

      shortcut: {
        run: { label: 'Run all test cases', hint: 'Works while the focus is in the editor' },
        submitSolution: {
          label: 'Submit to Codeforces',
          hint: 'Submits the current file to its contest; needs the browser extension and has no effect without a linked problem',
        },
        togglePanel: { label: 'Show / hide the sidebar' },
        switchPanel: { label: 'Switch sidebar panel', hint: 'Explorer ↔ Test cases' },
        toggleLayout: { label: 'Swap sidebar side' },
        newCase: { label: 'Add a test case' },
        openSettings: { label: 'Open / close settings' },
        exportImage: {
          label: 'Export image',
          hint: 'Exports the selection as PNG, or the whole file when nothing is selected; .md uses the editorial layout',
        },
        renameNode: {
          label: 'Rename (file / folder)',
          hint: 'Focus must be in the explorer; F2 works on macOS too',
        },
        deleteNode: {
          label: 'Delete (file / folder)',
          hint: 'Focus must be in the explorer; deletes the whole selection when there is one',
        },
        selectAllNodes: {
          label: 'Select all (explorer)',
          hint: 'Focus must be in the explorer · selects the whole focused folder, subfolders included (root when on empty space)',
        },

        restore: {
          label: 'Restore defaults',
          hint: 'Reset all shortcuts above',
          title: 'Restore default shortcuts',
        },

        note: 'Click the field on the right, then press a key combination to rebind. Delete clears a binding, Esc cancels recording. Conflicting combinations are rejected with an explanation.',

        /** 固定键位徽标的悬浮提示（那三条固定动作已不在本列表展示，徽标分支保留待用） */
        fixedKey: 'Fixed shortcut — cannot be rebound',

        recorder: {
          placeholder: 'Press a key combination…',
          unbound: 'Not bound',
          clear: 'Clear the binding',
          hint: 'Press Esc to cancel, Delete to clear the binding',
          idle: 'Click to start recording',
          tip: 'Esc to cancel, Delete to clear',
        },

        reserved: 'The browser uses this combination; the page cannot intercept it',
        needModifier: 'Include at least one of Ctrl / ⌘ / Alt, or it will fire while typing',
        alreadyBound: 'Already bound to “{name}”',
      },

      judge: {
        timeLimit: { label: 'Time limit', hint: 'Run phase only, excluding compilation' },
        memoryLimit: { label: 'Memory limit', hint: 'Exceeding it reports MLE' },
        /** 同 zh-CN：输出比对方式，三档口径写在 hint 里，并说明按题覆盖优先 */
        checker: {
          label: 'Output check',
          hint:
            'Line by line ignores trailing spaces; ignore whitespace compares tokens; strict compares every character. A problem’s own setting wins',
        },
        celebration: { label: 'Pass animation', hint: 'Confetti falls over the sample panel when every test case passes' },
        crossCheck: {
          label: 'Re-run without optimisation',
          hint: 'Recompiles at -O0 and reruns one case; a differing output is reported (catches undefined behaviour, costs an extra host)',
        },
        engines: 'Judge engine',
      },

      app: {
        basics: 'Basics',
        install: {
          label: 'Install on this device',
          title: 'Install on this device',
          /**
           * These three status words are the **engine criterion** half of this row. One
           * criterion only: can the web side use this engine to install in one click
           * (`INSTALL_API_SUPPORTED` in `useInstallPrompt.js` — the
           * `'onbeforeinstallprompt' in window` property probe, **minus the Samsung Internet
           * false positive**, added 2026-10-14; see HANDOFF pitfall 55). The status words
           * themselves are not keyed off the browser model — that one exception lives inside
           * `useInstallPrompt.js`, not at this layer.
           *
           * Whether the button lights up is a separate question (`canInstall`); the
           * status word does not try to explain it — that used to be wrong twice over,
           * conflating “unsupported” with “not installable right now”, and needing a
           * browser guess to patch it up.
           *
           * ⚠️ But “no API” does not mean “cannot be installed on this machine”: the
           * `noApi*` strings below carry that other half (user decision, 2026-10-12).
           * The branch only picks which sentence to show — it must never feed back into
           * the status word or the button.
           */
          statusAvailable: 'Supported by this browser',
          statusUnsupported: 'Not supported by this browser',
          statusInstalled: 'Installed',
          /**
           * The only explanation for the greyed-out button (`installUnavailable` in the panel):
           * the engine has the API, nothing is installed, yet there is no one-click entry.
           * Not an error — a normal browser state: the install event is dispatched once, by the
           * browser, only while it believes the app is not installed. A `<code>chrome://apps</code>`
           * sits in the middle, hence the two halves.
           */
          blockedPrefix:
            'One-click install is unavailable. Common causes: the app was installed and then deleted (removing the icon is not an uninstall), or the install prompt was dismissed. Open',
          blockedSuffix:
            ', remove that app (right-click → Remove), then reload this page.',
          copyApps: 'Copy address',
          copied: 'Copied',
          copyAppsTitle:
            'Copy chrome://apps — pages cannot navigate there, so paste it into the address bar',
          /**
           * Where to go when the engine has no install API but the browser can still install
           * (`installNoApiHint` in the panel). Written as one sentence: no address or key name
           * needs emphasis here, so splitting it would only make it longer.
           *
           * Per MDN's compatibility tables `beforeinstallprompt` is unsupported in **Firefox
           * (desktop and Android) and Safari (desktop and iOS)** — all of them land on “not
           * supported by this browser”, yet each has its own install entry in the browser menu.
           * Desktop Firefox only gets the **Windows 143+** mention: that address-bar “web app”
           * icon is Firefox's own feature and is unrelated to the manifest; macOS and Linux
           * genuinely have no such route, so do not write “Firefox can install it”.
           */
          noApiFirefoxAndroid:
            'Firefox has no one-click install API, but its ⋮ → “Install” works; “Add to Home screen” is a plain shortcut and works too.',
          noApiFirefoxWindows:
            'Desktop Firefox cannot install from a manifest; on Windows, Firefox 143+ offers the “web app” icon in the address bar.',
          noApiFirefoxOther:
            'Desktop Firefox cannot install from a manifest and offers no other entry (macOS / Linux).',
          noApiIos: 'No iOS browser has a one-click install API: use Share → “Add to Home Screen”.',
          noApiSafariDesktop: 'Desktop Safari cannot install from a manifest: use File → “Add to Dock”.',
          /**
           * Samsung Internet (added 2026-10-14). It is *not* the “engine never implemented the
           * event” case — the property probe is a false positive there (the event handler exists,
           * the event is not dispatched; see `MANUAL_INSTALL_BROWSER` in `useInstallPrompt.js`).
           * Both routes are named: the “+” badge is the install-flavoured one (shown while the
           * manifest asks for a standalone window), the menu entry always exists and is the fallback.
           */
          noApiSamsung:
            'Samsung Internet has no one-click install API: tap “+” by the address bar → “Home screen” (shown when the site asks for a standalone window), or use menu › “Add page to” › “Home screen”.',
          noApiGeneric:
            'This browser has no one-click install API — use its own menu to install.',
          /** Manual guide button at the end of the App section (notification copy: services/installGuides.js) */
          guide: 'Install guide',
          guideHint: 'Replay the install steps in a notification',
        },
        installAction: 'Install',
        installedAction: 'Installed',
      },

      extension: {
        groupNote:
          'With the extension installed, click its icon on a problem page to push the statement, samples and limits into this site.',
        /**
         * One path per browser; `hintChromium` is the fail-open fallback when the
         * browser cannot be told apart. Mobile gets its own two lines, because what
         * can be installed there is a completely different story.
         */
        hintFirefox: 'Click “Firefox version” to install from the add-ons store, then hit “Check again”.',
        hintEdge:
          'Edge Add-ons is not available yet — use the generic steps: download and unzip → open edge://extensions → enable “Developer mode” → “Load unpacked” and pick the extracted folder.',
        hintChrome:
          'Download and unzip → open chrome://extensions → enable “Developer mode” → “Load unpacked” and pick the extracted folder.',
        hintChromium:
          'Browser not recognised — use the generic steps: download and unzip → open the extension manager → enable “Developer mode” → “Load unpacked” and pick the extracted folder.',
        hintMobileUnsupported:
          'On phones and tablets, only Firefox for Android can install this extension — switch to Firefox.',
        /** Safari (and every browser on iOS): the one bucket with no path at all — no buttons */
        hintUnsupported:
          'This browser can’t install the extension. On desktop use Chrome, Edge or Firefox; on mobile only Firefox for Android can install it.',
        shortcutsManagedPrefix:
          'Extension shortcuts are managed by the browser: pages cannot rebind them or navigate to',
        shortcutsManagedSuffix:
          '(the browser blocks chrome:// navigation). Copy the address and paste it into the address bar.',
        /** Firefox has no chrome://extensions/shortcuts — its shortcuts live in the Add-ons Manager */
        shortcutsManagedSuffixFx:
          '(pages cannot open about: either). Open it, then use the gear menu › “Manage Extension Shortcuts”.',
        status: 'Installation status',
        statusRunning: 'Installed and running',
        statusMissing: 'Not detected',
        recheck: 'Check again',
        recheckTitle: 'Check for the extension again',
        checking: 'Checking',
        checkingHint: 'Checking…',
        download: {
          label: 'Download the extension',
          firefox: 'Firefox version',
          firefoxTitle: 'Install from Firefox Add-ons',
          edge: 'Edge version',
          edgeTitle: 'Install from Edge Add-ons',
        },
        /** Title of that row when the installed build is older (paired with updateHint*) */
        update: {
          label: 'Update the extension',
        },
        /** Version of the package this site ships */
        downloadVersion: 'Latest v{version}',
        /** Shown when the installed version is older: the version pair only — how to swap it lives in the row above, which carries the button */
        updateAvailable: 'You have v{current}; this site ships v{latest}.',
        updateHintManual: 'Download the archive again, replace the old folder, then refresh the extension manager page.',
        updateHintFirefox: 'Firefox updates it automatically; you can also check in the add-ons manager.',
        /** Manual guide button at the end of this section (notification copy: services/installGuides.js) */
        guide: 'Install guide',
        guideHint: 'Replay the install or update steps in a notification',
        destinations: 'Delivery targets',
        destinationsNote:
          'Where parsed problems go. Both can be on; turning one off still parses, it just stops sending there.',
        destinationWebPage: 'Send to this website',
        destinationWebPageHint: 'Push to a tab of this site and save it as a problem file',
        destinationLocalTools: 'Send to local tools',
        destinationLocalToolsHint: 'Push to local receivers such as CPH for VS Code or CP Editor',
        configSaveFailed: 'Could not save: no reply from the extension. Check that it is enabled and retry.',
        commandShortcuts: 'Extension shortcuts',
        shortcutUnset: 'Not set',
        /** An empty key is not a bug: Chrome only binds suggested_key at install time and skips it on conflict */
        shortcutUnassignedNote:
          'The browser assigned no key: Chrome binds the suggested shortcut once at install time and skips it on conflict. Copy the address above, bind a free key to “Activate the extension”, then hit “Check again”.',
        /** The extension reported no commands at all (usually an outdated build) */
        shortcutEmptyNote:
          'No shortcuts came back from the extension. Hit “Check again”; if still empty, update it with the row above.',
        shortcutsPage: 'Shortcut settings page',
        shortcutsHint: 'Copy it, then paste it into the address bar',
        shortcutsCopiedHint: 'Copied — paste it into the address bar and press Enter',
        shortcutsTitle: 'Copy chrome://extensions/shortcuts',
        shortcutsTitleFx: 'Copy about:addons',
        copyUrl: 'Copy URL',
        copied: 'Copied',
        commandParsePage: 'Parse the problem on this page',
      },

      cloud: {
        groupNote:
          'Store preferences (editor, shortcuts, interface, judge engine…) in the cloud; problem files, test cases and judge server addresses are never uploaded.',
        handle: {
          label: 'Codeforces handle',
        },
        handlePlaceholder: 'e.g. he-jie',
        login: 'Sign in',
        loginTitle:
          'Sign in with this handle on this device; the cloud copy is left untouched',
        /** 见 zh-CN 那侧的说明：与「登录」并排，但只取一份公开配置、不建立绑定 */
        import: 'Import',
        importTitle:
          'Pulls the cloud settings onto this device — no verification; local settings are overwritten and the page reloads',
        loginNoCloud:
          'Signed in. No cloud copy for this handle yet — use “Upload local settings” to store the current setup',
        loggedIn: 'Signed in. Use “Download to this device” to pull the cloud copy',
        codeIntro:
          'The cloud already has your settings. This step only confirms identity; the cloud copy is untouched.',
        codeIntroUpload:
          'Writing to the cloud requires verification. Once confirmed, this device stores a token, so later writes need no new code.',
        codeLabel: 'Verification code',
        /* See the zh-CN side: the validity clause now lives in the countdown line */
        codeHint: 'At most 5 codes per handle every 10 minutes',
        /** 见 zh-CN 那侧的说明：`{time}` 是客户端 mm:ss 倒计时 */
        codeCountdown: '{time} left',
        codeExpired: 'Expired — get a new code',
        refreshCode: 'Get a new code',
        copyCode: 'Copy',
        copyCodeTitle: 'Copy this verification code to the clipboard',
        copied: 'Copied',
        /** 见 zh-CN 那侧的说明：只在扩展具备 fill-code 能力时出现 */
        fillCode: 'Fill it in on Codeforces',
        fillCodeTitle:
          'The extension opens your Codeforces Social page, fills this code into Last name and saves it. It never reads or uploads your Codeforces credentials.',
        fillCodeBusy: 'Filling…',
        fillCodeNote: 'No extension? Follow the two steps below and fill it in by hand',
        fillCodeDone: 'Filled in — come back and press the button below to finish',
        /** 见 zh-CN 那侧的说明：只有扩展具备 fill-saved 能力、且这一轮是登录时用 */
        fillCodeChain: 'Fill it in on Codeforces and sign in',
        fillCodeChainTitle:
          'The extension opens your Codeforces Social page, fills this code into Last name and saves it, then closes that tab; verification and sign-in finish here. It never reads or uploads your Codeforces credentials.',
        fillCodeChainBusy: 'Filling in and verifying…',
        /** 见 zh-CN 那侧的说明：措辞指着「这个浏览器」，不指人 */
        cfHintMatch: 'Confirmed — this browser is signed in as {handle}; one click fills it in',
        cfHintMismatch:
          'This browser is signed in as someone other than “{handle}” — switch accounts, then click',
        cfHintNotLoggedIn: 'This browser is not signed in to Codeforces — sign in first',
        fillNotLoggedIn: 'This browser is not signed in to Codeforces — sign in and retry',
        fillMismatch:
          'This browser is signed in as someone other than “{handle}” — switch accounts and retry',
        fillNoTab: 'Could not open the Codeforces settings page — open it once by hand and retry',
        fillPage: 'Could not recognise the Codeforces page (it may have changed) — fill it in by hand',
        fillTimeout: 'The extension did not respond — check that it is enabled and retry',
        fillUnsupported: 'The extension is too old for auto-fill — fill it in by hand',
        fillFailed: 'Auto-fill failed — fill it in by hand',
        codeSteps: 'Next:',
        codeStep1:
          'Put the code into the Last name field of your {link} (Settings › Social) and save',
        codeStep1Link: 'Codeforces profile',
        codeStep2:
          'Come back and press “Verify and sign in” — the cloud reads your Last name to confirm identity',
        codeStep2Upload:
          'Come back and press “Verify and upload” — the cloud reads your Last name to confirm identity',
        verifyLogin: 'Verify and sign in',
        verifyUpload: 'Verify and upload',
        cancel: 'Cancel',
        boundTag: 'Bound',
        updatedAt: 'Last updated in the cloud: {time}',
        neverUpdated: 'This device has not saved to the cloud yet',
        download: 'Download to this device',
        downloadTitle: 'Overwrite local settings with the cloud copy and reload',
        upload: 'Upload local settings',
        uploadTitle:
          'Overwrite the cloud copy with local settings. A stored device token writes directly; an expired one asks for a new code',
        unbind: 'Unbind',
        unbindTitle: 'Unbind this device',
        unbindConfirmTitle: 'Unbind this device?',
        unbindConfirmDesc:
          'This device will no longer be linked to “{handle}”; you can rebind anytime. The cloud copy is kept.',
        applyConfirmTitle: 'Apply cloud settings?',
        applyConfirmDesc:
          'Local settings will be replaced by the cloud copy for “{handle}”, then the page reloads.',
        applyConfirm: 'Apply',
        applyNoCloud: 'The cloud has no copy for “{handle}”',
        applyMissingTitle: 'This handle has not saved any settings',
        applyMissingDesc:
          'The cloud has no copy for “{handle}”. Returned to the home page.',
        applyMissingOk: 'Got it',
        saved: 'Saved to the cloud',
        downloaded: 'Cloud settings applied — reloading…',
        emptyProfile: 'The cloud copy contains no usable settings',
        noCloudConfig: 'No cloud copy for this handle yet — use “Verify and upload” on this device first',
        errorHandle: 'Enter your Codeforces handle first',
        errorNetwork: 'The request did not go through. Check your network and retry.',
        errorBadBody:
          'The endpoint answered HTTP {status} but the body was not the expected JSON (the request may not have reached this site’s /api)',
        tokenExpired: 'The device token is no longer valid — request a new code',
        publicNotice:
          'Once uploaded, this copy is public: no sign-in needed — append the cfid to the site URL (e.g. www.998244353.best/he-jie) to fetch it. Uploading means agreeing to make it public; only preferences such as theme, shortcuts and UI scale are synced.',
      },

      help: {
        guideLink: 'Full user guide',
        /** 同 zh-CN：末尾紧跟留言板地址，那条链接在 HelpPanel 的模板里 */
        notice:
          'Still in testing, and not even named yet. Bug reports, feature requests, naming ideas or chat are all welcome here:',
      },
    },
  },
}
