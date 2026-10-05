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

      /** 左侧目录，同时也是右侧每一组的标题 */
      section: {
        common: '常用设置',
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

      /** 常用设置：只是把高频项再摆一份，与「外观 / 编辑器」里的同一偏好共用一份数据 */
      common: {
        note: '集中了最常改的几项',
      },

      appearance: {
        theme: { label: '主题', hint: '切换深色与浅色两套配色（默认：深色）' },
        fontSize: { label: '字体大小', hint: '代码主字体大小（默认：14px，范围 8–32）' },
        uiScale: {
          label: '界面缩放',
          hint: '整体放大或缩小界面，适合高分屏或投屏演示；编辑器也会一起缩放',
        },
        panelPosition: {
          label: '侧边栏位置',
          hint: '资源管理器与评测样例放在编辑区的左侧还是右侧',
        },
        locale: {
          label: '界面语言',
          hint: '界面与帮助文档的显示语言；与代码的判题语言（由文件扩展名决定）无关',
        },
      },

      /** 数值型选项的文案模板 */
      value: {
        times: '{n} 倍',
        spaces: '{n} 空格',
      },

      editor: {
        groupFont: '字体',
        groupEdit: '编辑',
        groupCursor: '光标与高亮',
        groupView: '视图',

        fontFamily: { label: '字体', hint: '代码编辑器使用的等宽字体' },
        lineHeightRatio: { label: '行高', hint: '行间距相对字号的倍数' },
        fontLigatures: {
          label: '字体连写',
          hint: '将 => 或 != 等符号渲染为连贯的数学符号（需字体本身支持连字；三款「内置」字体都支持）',
        },
        autoSave: {
          label: '自动保存',
          hint: '编辑停顿约 1 秒后自动写入；切换文件、关闭文件、窗口失焦时也会保存。关闭后只能用 ⌘/Ctrl + S 手动保存',
        },
        tabSize: { label: '缩进宽度', hint: '制表符的视觉宽度，也用于自动缩进的空格数（默认：4）' },
        insertSpaces: {
          label: '空格代替 Tab',
          hint: '开启后按 Tab 插入空格、关闭则插入制表符（默认：关闭，按 Tab 出制表符）',
        },
        wordWrap: { label: '自动换行', hint: '代码超长时自动折行显示，避免横向滚动' },
        wordWrapColumn: {
          label: '换行列宽',
          hint: '仅在「按列宽换行」模式下生效，超过该列数即折行（默认：80）',
        },
        bracketPairColorization: { label: '括号配色', hint: '为嵌套的括号对分配不同颜色，便于区分层级' },
        indentGuides: { label: '缩进参考线', hint: '在缩进层级的左侧绘制竖向引导线' },
        bracketGuides: { label: '括号引导线', hint: '在光标所在的括号对之间绘制连接线，仅当前层级' },
        stickyScroll: {
          label: '粘性滚动',
          hint: '滚动时把当前代码所在的外层函数 / 类钉在编辑器顶部',
        },
        scrollBeyondLastLine: {
          label: '滚过最后一行',
          hint: '开启后可在最后一行下方继续滚动出空白区域（默认：关闭）',
        },
        smoothScrolling: { label: '平滑滚动', hint: '滚动时启用过渡动画，避免内容瞬间跳变' },
        cursorStyle: { label: '光标样式', hint: '文本插入点的形状' },
        cursorBlinking: { label: '光标闪烁方式', hint: '文本插入点的闪烁动画样式' },
        cursorSmoothCaretAnimation: { label: '光标平滑移动', hint: '打字时启用光标移动的过渡动画' },
        renderLineHighlight: { label: '当前行突出', hint: '高亮显示光标所在行' },
        renderWhitespace: { label: '空白字符', hint: '显示空格与制表符等不可见字符' },
        lineNumbers: {
          label: '行号',
          hint: '是否在编辑器左侧的装订区显示行号；选「仅 Markdown 隐藏」时只在题解（.md）里收掉，代码文件照常',
        },
        minimap: { label: '代码缩略图', hint: '在编辑器右侧展示全局代码结构的微缩导航（默认：关闭）' },
        padding: { label: '内边距', hint: '编辑器内容与边框之间的留白' },
        scrollbarSize: { label: '滚动条粗细', hint: '编辑器滚动条的宽度' },
        statusBar: {
          label: '底部状态栏',
          hint: '显示编辑器底部的状态栏（文件名、光标位置、判题语言等）。题解（.md）下始终不显示',
        },
      },

      /** 偏好选项的取值名（下拉里的那一项） */
      option: {
        themeDark: '深色',
        themeLight: '浅色',
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
      },

      shortcut: {
        /** 动作名（用 in SHORTCUT_ACTIONS） */
        run: { label: '运行全部用例', hint: '光标在编辑器里也生效' },
        togglePanel: { label: '显示 / 隐藏侧边栏' },
        switchPanel: { label: '切换侧栏面板', hint: '资源管理器 ↔ 评测样例' },
        toggleLayout: { label: '侧边栏左右对调' },
        newCase: { label: '新增一条测试用例' },
        openSettings: { label: '打开 / 收起设置' },

        restore: { label: '恢复默认', hint: '把上面所有快捷键还原成初始设置', title: '恢复默认快捷键' },

        /** 整组的说明 */
        note: '点右侧输入框后按下组合键即可改绑；按 Delete 清除绑定，按 Esc 取消录制。与浏览器自带快捷键或其他功能冲突时会拒绝绑定并给出原因。',

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
        reserved: '浏览器已经占用了这个组合，网页里拦不住它',
        needModifier: '至少要带一个 Ctrl / ⌘ / Alt，否则打字时会不停误触发',
        alreadyBound: '已经绑给「{name}」了',
      },

      judge: {
        timeLimit: { label: '运行时限', hint: '只计程序运行阶段，不含编译' },
        engines: '评测引擎',
      },

      app: {
        basics: '基础设置',
        install: {
          label: '安装到设备',
          title: '安装到设备',
          statusAvailable: '当前浏览器支持',
          statusUnavailable: '已安装或不支持',
        },
        installAction: '安装',
        installedAction: '已安装',
        /**
         * 存储占用。只报数，不报持久化状态 —— 申请是隐性的（见 services/storageQuota.js）。
         * 折叠时只报总量（整个源的占用，含工具链与外壳缓存，不只是用户代码），展开才列明细；
         * 分类体积是按缓存条目与本地数据库估的，总量取浏览器给的权威值，差额并进 other
         * —— 口径说明见 readStorageBreakdown() 上面的注释。
         *
         * 这里只放存储独有的那三条分类名。C++ / Python 3 / Markdown / LaTeX 直接复用
         * 「本地运行环境」的词条（runtime.*.title），免得同一批资产两处各叫一个名
         * —— 映射见 EditorSettingsPanel 的 STORAGE_CATEGORY_LABEL。
         */
        storage: {
          label: '存储',
          used: '已用 {used}',
          expand: '展开存储明细',
          collapse: '收起存储明细',
          measuring: '正在统计各分类占用…',
          categories: {
            cf: 'CF 抽题',
            code: '我的代码',
            other: '外壳与其它',
          },
        },
      },

      extension: {
        groupNote:
          '装好插件后，在任意 OJ 题目页点插件图标，解析出来的题面、样例和限制会直接送进这个网站。',
        downloadHint:
          '装上后需在 chrome://extensions 打开「开发者模式」，用「加载已解压的扩展程序」选中解压出来的目录。插件不在应用商店里，所以没法一键安装。',
        /** 上面那句里夹着一个 <code>chrome://extensions/shortcuts</code>，拆成前后两半 */
        shortcutsManagedPrefix: '插件快捷键由浏览器管理，网页没有权限改写，也没有权限跳转到',
        shortcutsManagedSuffix: '（浏览器会拦掉指向 chrome:// 的跳转）。只能复制地址后自己到地址栏粘贴打开。',
        status: '安装状态',
        statusRunning: '已安装并运行中',
        statusMissing: '未检测到',
        recheck: '重新检测',
        recheckTitle: '重新检测插件',
        checking: '检测中',
        checkingHint: '检测中…',
        download: { label: '下载插件' },
        /** 下载那一行标题后面的版本号：标的是这个网站提供的安装包版本 */
        downloadVersion: '最新版本 v{version}',
        destinations: '投递目标',
        destinationsNote:
          '插件解析出的题目要送到哪里。两项可以同时打开；关掉后插件仍会正常解析，只是不再往那一侧发送。',
        destinationWebPage: '发送到本网站',
        destinationWebPageHint: '推到这个网站的标签页，直接存成题目文件',
        destinationLocalTools: '发送到本地工具',
        destinationLocalToolsHint: '推给 VS Code 的 CPH、CP Editor 等本地接收工具',
        configSaveFailed: '保存失败：没收到插件的回执，请确认插件已启用后重试',
        commandShortcuts: '插件快捷键',
        shortcutUnset: '未设置',
        shortcutsPage: '快捷键设置页',
        shortcutsHint: '复制后在地址栏粘贴打开',
        shortcutsCopiedHint: '已复制，粘贴到地址栏回车即可',
        shortcutsTitle: '复制 chrome://extensions/shortcuts',
        copyUrl: '复制地址',
        copied: '已复制',
        /** 插件内部命令 id → 中文名（扩展只暴露 _execute_action 这类内部 id） */
        commandParsePage: '解析当前页面题目',
      },

      cloud: {
        groupNote:
          '把本机的偏好设置（编辑器、快捷键、界面、评测引擎等）存到云端。题目文件、测试样例与判题服务器地址不会上传。',
        handle: {
          label: 'Codeforces 用户名',
        },
        handlePlaceholder: '例如 he-jie',
        login: '登录',
        loginTitle: '在这台设备上登录这个用户名；登录不会改动云端已存的配置',
        loginNoCloud: '已登录。云端还没有这个用户名的配置 —— 点「上传本机设置」把当前设置存上去',
        loggedIn: '已登录。点「下载到本机」把云端配置取回本机',
        codeIntro: '云端已有你的配置。这一步只确认「这是你的」，不会改动云端内容。',
        codeIntroUpload:
          '写云端必须先证明是本人。这一枚码验证成功后，本机会记下服务端签发的设备令牌，之后的写入就不用再取码了。',
        codeLabel: '验证码',
        codeHint: '10 分钟内有效；同一个用户名 10 分钟最多申请 5 次',
        codeWarn: '只认屏幕上这一枚：重新取码会让上一枚立刻作废，取到新码后记得把 Codeforces 上的值也换成新的',
        codeSteps: '接下来：',
        codeStep1: '把上面的验证码填进 {link}的 Last name 字段（设置里的 Social 一页）并保存',
        codeStep1Link: 'Codeforces 个人资料',
        codeStep2: '回到这里点「验证并登录」，云端会去读 Codeforces 上的 Last name 来确认是你',
        codeStep2Upload: '回到这里点「验证并上传」，云端会去读 Codeforces 上的 Last name 来确认是你',
        verifyLogin: '验证并登录',
        verifyUpload: '验证并上传',
        cancel: '取消',
        boundTag: '已绑定',
        updatedAt: '云端最近更新：{time}',
        neverUpdated: '这台设备还没往云端存过',
        download: '下载到本机',
        downloadTitle: '用云端配置覆盖本机设置，之后页面会重新加载',
        upload: '上传本机设置',
        uploadTitle:
          '用本机设置覆盖云端。本机已记有设备令牌时直接写入，只有令牌失效了才会再让你取一次码',
        unbind: '解绑',
        unbindTitle: '解绑这台设备',
        unbindConfirmTitle: '解绑这台设备？',
        unbindConfirmDesc:
          '解绑后本机不再与「{handle}」关联，可以随时用同一个用户名重新绑定。云端已存的那份配置会保留。',
        applyConfirmTitle: '套用云端配置？',
        applyConfirmDesc:
          '要用「{handle}」的云端配置覆盖本机设置吗？本机当前的偏好会被替换，之后页面会重新加载。',
        applyConfirm: '套用',
        applyNoCloud: '云端还没有「{handle}」的配置',
        applyMissingTitle: '这个用户名还没有保存过配置',
        applyMissingDesc: '云端没有「{handle}」的配置，没有可以套用的内容。地址已回到首页。',
        applyMissingOk: '知道了',
        saved: '已保存到云端',
        downloaded: '已应用云端配置，正在重新加载…',
        emptyProfile: '云端配置里没有可用的设置',
        noCloudConfig: '云端还没有这个用户名的配置，先在本机「验证并上传」一次',
        errorHandle: '请先填写 Codeforces 用户名',
        errorNetwork: '请求没有发出去，请检查网络后重试',
        errorBadBody: '接口返回了 HTTP {status}，但内容不是预期的格式（这次请求可能没走到本站的 /api）',
        tokenExpired: '设备令牌已失效，请重新取一枚码验证',
        publicNotice:
          '上传后这份配置就是公开的：不需要登录，把 cfid 接在网址后面（如 www.998244353.best/he-jie）即可取回。点「上传本机设置」就等于同意公开它 —— 参与同步的只有主题、快捷键、界面缩放这类偏好项。',
      },

      help: {
        guideLink: '完整使用指南',
        /** 帮助栏置顶的站点提示。末尾那句后面紧跟留言板地址 ——
            地址本身不翻译，直接写在 HelpPanel 的模板里 */
        notice:
          '此网站仍在测试中，功能有待完善，名字都没有起好。如有 bug 反馈 / 功能建议 / 取名建议 / 闲聊，欢迎在此留言：',
      },
    },
  },

  en: {
    settings: {
      ariaLabel: 'Settings',
      navAriaLabel: 'Settings categories',

      section: {
        common: 'Common',
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

      /** 模板：新建文件时按语言填入的初始正文（状态在 services/fileTemplates.js） */
      templates: {
        note: 'A new file is filled with the template for its language (resolved from the extension). Imported problem code uses it too. Broke one? Hit “Restore default”. Templates and the switch travel with cloud sync.',
        enable: {
          label: 'Enable templates',
          hint: 'When off, new files and imported problem code start empty; the templates below are kept as-is and reused once you turn it back on',
        },
        hint: 'Initial text for a new .{ext} file (written verbatim, no variable substitution)',
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

      /** 常用设置：只是把高频项再摆一份，与「外观 / 编辑器」里的同一偏好共用一份数据 */
      common: {
        note: 'The settings changed most often, gathered in one place. Each is the same preference as in Appearance / Editor — editing either side syncs both.',
      },

      appearance: {
        theme: { label: 'Theme', hint: 'Switch between the dark and light colour schemes (default: dark)' },
        fontSize: { label: 'Font size', hint: 'Main code font size (default: 14px, range 8–32)' },
        uiScale: {
          label: 'Interface scale',
          hint: 'Scale the whole interface up or down — handy on high-DPI screens and when presenting. The editor scales too.',
        },
        panelPosition: {
          label: 'Sidebar position',
          hint: 'Whether the Explorer and test cases sit left or right of the editor',
        },
        locale: {
          label: 'Interface language',
          hint: 'Language of the interface and help pages. Unrelated to the judge language, which follows the file extension.',
        },
      },

      value: {
        times: '{n}×',
        spaces: '{n} spaces',
      },

      editor: {
        groupFont: 'Font',
        groupEdit: 'Editing',
        groupCursor: 'Cursor & highlighting',
        groupView: 'View',

        fontFamily: { label: 'Font family', hint: 'The monospace font used by the code editor' },
        lineHeightRatio: { label: 'Line height', hint: 'Line spacing as a multiple of the font size' },
        fontLigatures: {
          label: 'Font ligatures',
          hint: 'Render symbols such as => or != as single joined glyphs (needs a font with ligatures; all three bundled fonts have them)',
        },
        autoSave: {
          label: 'Auto save',
          hint: 'Writes about a second after you stop typing, and also when you switch or close a file, or when the window loses focus. With this off, only ⌘/Ctrl + S saves.',
        },
        tabSize: {
          label: 'Indent width',
          hint: 'Visual width of a tab, also the number of spaces used for auto-indent (default: 4)',
        },
        insertSpaces: {
          label: 'Spaces instead of Tab',
          hint: 'On inserts spaces when you press Tab; off inserts a real tab character (default: off)',
        },
        wordWrap: { label: 'Word wrap', hint: 'Wrap long lines instead of scrolling horizontally' },
        wordWrapColumn: {
          label: 'Wrap column',
          hint: 'Only applies in “Wrap at column” mode: lines wrap past this column (default: 80)',
        },
        bracketPairColorization: {
          label: 'Bracket pair colouring',
          hint: 'Give nested bracket pairs different colours so nesting levels are easy to tell apart',
        },
        indentGuides: { label: 'Indent guides', hint: 'Draw vertical guide lines at each indentation level' },
        bracketGuides: {
          label: 'Bracket guides',
          hint: 'Draw a connecting line between the bracket pair at the cursor — current level only',
        },
        stickyScroll: {
          label: 'Sticky scroll',
          hint: 'Pin the enclosing function / class to the top while you scroll',
        },
        scrollBeyondLastLine: {
          label: 'Scroll past last line',
          hint: 'Allow scrolling into empty space below the last line (default: off)',
        },
        smoothScrolling: { label: 'Smooth scrolling', hint: 'Animate scrolling so the view does not jump' },
        cursorStyle: { label: 'Cursor style', hint: 'Shape of the text insertion point' },
        cursorBlinking: { label: 'Cursor blinking', hint: 'Blinking animation of the text insertion point' },
        cursorSmoothCaretAnimation: {
          label: 'Smooth caret animation',
          hint: 'Animate the cursor as it moves while you type',
        },
        renderLineHighlight: { label: 'Current line highlight', hint: 'Highlight the line the cursor is on' },
        renderWhitespace: { label: 'Whitespace characters', hint: 'Show invisible characters such as spaces and tabs' },
        lineNumbers: {
          label: 'Line numbers',
          hint: 'Whether to show line numbers in the editor gutter; "Hidden in Markdown" hides them only for editorials (.md), code files keep them',
        },
        minimap: {
          label: 'Minimap',
          hint: 'Show a scaled-down overview of the file on the right edge (default: off)',
        },
        padding: { label: 'Padding', hint: 'Space between the editor content and its border' },
        scrollbarSize: { label: 'Scrollbar width', hint: 'Width of the editor scrollbars' },
        statusBar: {
          label: 'Bottom status bar',
          hint: 'Show the status bar at the bottom of the editor (file name, cursor position, judge language…). Never shown for editorials (.md)',
        },
      },

      option: {
        themeDark: 'Dark',
        themeLight: 'Light',
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
      },

      shortcut: {
        run: { label: 'Run all test cases', hint: 'Works while the focus is in the editor' },
        togglePanel: { label: 'Show / hide the sidebar' },
        switchPanel: { label: 'Switch sidebar panel', hint: 'Explorer ↔ Test cases' },
        toggleLayout: { label: 'Swap sidebar side' },
        newCase: { label: 'Add a test case' },
        openSettings: { label: 'Open / close settings' },

        restore: {
          label: 'Restore defaults',
          hint: 'Reset every shortcut above to its initial binding',
          title: 'Restore default shortcuts',
        },

        note: 'Click the field on the right, then press the key combination to rebind. Press Delete to clear a binding, Esc to cancel recording. Combinations that clash with the browser or another action are rejected with an explanation.',

        recorder: {
          placeholder: 'Press a key combination…',
          unbound: 'Not bound',
          clear: 'Clear the binding',
          hint: 'Press Esc to cancel, Delete to clear the binding',
          idle: 'Click to start recording',
          tip: 'Esc to cancel, Delete to clear',
        },

        reserved: 'The browser already uses this combination and the page cannot intercept it',
        needModifier: 'Include at least one of Ctrl / ⌘ / Alt, otherwise it will fire constantly while typing',
        alreadyBound: 'Already bound to “{name}”',
      },

      judge: {
        timeLimit: { label: 'Time limit', hint: 'Counts the run phase only, excluding compilation' },
        engines: 'Judge engine',
      },

      app: {
        basics: 'Basics',
        install: {
          label: 'Install on this device',
          title: 'Install on this device',
          statusAvailable: 'Supported by this browser',
          statusUnavailable: 'Installed or unsupported',
        },
        installAction: 'Install',
        installedAction: 'Installed',
        /** Storage usage only — persistence is requested silently, so no state is shown.
         *  Collapsed it reports the total only (the whole origin, toolchain caches included);
         *  the breakdown appears on expand. Per-category sizes are estimated, the total comes
         *  from the browser, and the difference is folded into "other".
         *
         *  Only the three storage-only category names live here. C++ / Python 3 / Markdown / LaTeX
         *  reuse the "Local runtime" entries (runtime.*.title) — see STORAGE_CATEGORY_LABEL. */
        storage: {
          label: 'Storage',
          used: '{used} used',
          expand: 'Show storage breakdown',
          collapse: 'Hide storage breakdown',
          measuring: 'Measuring each category…',
          categories: {
            cf: 'CF problem picker',
            code: 'My code',
            other: 'Shell & other',
          },
        },
      },

      extension: {
        groupNote:
          'With the extension installed, click its icon on any problem page and the statement, samples and limits are pushed straight into this site.',
        downloadHint:
          'After downloading, open chrome://extensions, turn on Developer mode, and use “Load unpacked” to select the folder you extracted. The extension is not on the store, so there is no one-click install.',
        shortcutsManagedPrefix:
          'Extension shortcuts are managed by the browser: a web page cannot rebind them, nor navigate to',
        shortcutsManagedSuffix:
          '(the browser blocks navigation to chrome:// URLs). Copy the address and paste it into the address bar yourself.',
        status: 'Installation status',
        statusRunning: 'Installed and running',
        statusMissing: 'Not detected',
        recheck: 'Check again',
        recheckTitle: 'Check for the extension again',
        checking: 'Checking',
        checkingHint: 'Checking…',
        download: { label: 'Download the extension' },
        /** Version of the package this site ships */
        downloadVersion: 'Latest v{version}',
        destinations: 'Delivery targets',
        destinationsNote:
          'Where the extension sends the problems it parses. Both can be on at once; turning one off still parses normally, it just stops sending to that side.',
        destinationWebPage: 'Send to this website',
        destinationWebPageHint: 'Push to a tab of this site and save it as a problem file',
        destinationLocalTools: 'Send to local tools',
        destinationLocalToolsHint: 'Push to local receivers such as CPH for VS Code or CP Editor',
        configSaveFailed: 'Could not save: no reply from the extension. Make sure it is enabled and try again.',
        commandShortcuts: 'Extension shortcuts',
        shortcutUnset: 'Not set',
        shortcutsPage: 'Shortcut settings page',
        shortcutsHint: 'Copy it, then paste it into the address bar',
        shortcutsCopiedHint: 'Copied — paste it into the address bar and press Enter',
        shortcutsTitle: 'Copy chrome://extensions/shortcuts',
        copyUrl: 'Copy URL',
        copied: 'Copied',
        commandParsePage: 'Parse the problem on this page',
      },

      cloud: {
        groupNote:
          'Store your preferences (editor, shortcuts, interface, judge engine…) in the cloud, then pull them back on another device by entering the same handle. Problem files, test cases and judge server addresses are never uploaded.',
        handle: {
          label: 'Codeforces handle',
        },
        handlePlaceholder: 'e.g. he-jie',
        login: 'Sign in',
        loginTitle:
          'Sign in with this handle on this device; signing in never changes the copy already in the cloud',
        loginNoCloud:
          'Signed in. The cloud has no copy for this handle yet — use “Upload local settings” to store the current setup',
        loggedIn: 'Signed in. Use “Download to this device” to pull the cloud copy back',
        codeIntro:
          'The cloud already has your settings. This step only proves they are yours — the cloud copy is left untouched.',
        codeIntroUpload:
          'Writing to the cloud always requires proving it is you. Once this code checks out, this device stores the token the server issues — later writes reuse it and need no new code.',
        codeLabel: 'Verification code',
        codeHint: 'Valid for 10 minutes; at most 5 codes per handle every 10 minutes',
        codeWarn:
          'Only the code shown here counts — asking for a new one invalidates the previous immediately, so update the value on Codeforces too',
        codeSteps: 'What to do next:',
        codeStep1:
          'Put the code above into the Last name field of your {link} (Settings → Social) and save it',
        codeStep1Link: 'Codeforces profile',
        codeStep2:
          'Come back here and press “Verify and sign in” — the cloud reads your Codeforces Last name to confirm it is you',
        codeStep2Upload:
          'Come back here and press “Verify and upload” — the cloud reads your Codeforces Last name to confirm it is you',
        verifyLogin: 'Verify and sign in',
        verifyUpload: 'Verify and upload',
        cancel: 'Cancel',
        boundTag: 'Bound',
        updatedAt: 'Last updated in the cloud: {time}',
        neverUpdated: 'This device has not saved to the cloud yet',
        download: 'Download to this device',
        downloadTitle: 'Overwrite local settings with the cloud copy, then reload the page',
        upload: 'Upload local settings',
        uploadTitle:
          'Overwrite the cloud copy with local settings. With a device token stored here it writes straight away — only a rejected token makes you fetch a code again',
        unbind: 'Unbind',
        unbindTitle: 'Unbind this device',
        unbindConfirmTitle: 'Unbind this device?',
        unbindConfirmDesc:
          'This device will no longer be linked to “{handle}”. You can bind it again with the same handle at any time. The copy already stored in the cloud is kept.',
        applyConfirmTitle: 'Apply cloud settings?',
        applyConfirmDesc:
          'Replace this device’s settings with the cloud copy for “{handle}”? Your current preferences will be overwritten and the page will reload afterwards.',
        applyConfirm: 'Apply',
        applyNoCloud: 'The cloud has no copy for “{handle}”',
        applyMissingTitle: 'This handle has not saved any settings',
        applyMissingDesc:
          'The cloud has no copy for “{handle}”, so there is nothing to apply. The address has been reset to the home page.',
        applyMissingOk: 'Got it',
        saved: 'Saved to the cloud',
        downloaded: 'Cloud settings applied — reloading…',
        emptyProfile: 'The cloud copy contains no usable settings',
        noCloudConfig: 'No cloud copy for this handle yet — use “Verify and upload” on this device first',
        errorHandle: 'Enter your Codeforces handle first',
        errorNetwork: 'The request did not go through. Check your network and try again.',
        errorBadBody:
          'The endpoint answered HTTP {status}, but the body was not the expected JSON (this request may not have reached this site’s /api)',
        tokenExpired: 'The device token is no longer valid — request a new code to verify again',
        publicNotice:
          'Once uploaded, this copy is public: no sign-in is needed — append the cfid to the site URL (e.g. www.998244353.best/he-jie) to fetch it. Clicking “Upload local settings” means you agree to make it public; only preference keys such as theme, shortcuts and UI scale are synced.',
      },

      help: {
        guideLink: 'Full user guide',
        /** 同 zh-CN：末尾紧跟留言板地址，那条链接在 HelpPanel 的模板里 */
        notice:
          'This site is still under test: features are incomplete, and it has not even been named yet. Bug reports, feature requests, naming ideas or just chatting are all welcome here:',
      },
    },
  },
}
