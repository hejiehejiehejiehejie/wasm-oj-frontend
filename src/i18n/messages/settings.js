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
        appearance: '外观',
        editor: '编辑器',
        shortcuts: '快捷键',
        judge: '评测',
        runtime: '本地运行环境',
        extension: '浏览器插件',
        app: '应用',
        help: '帮助',
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

      uiScale: {
        /** 默认档位后面那个后缀，{value} 形如 110% */
        default: '{value}（默认）',
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
          hint: '将 => 或 != 等符号渲染为连贯的数学符号（需当前字体支持，如 Fira Code）',
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
        minimap: { label: '代码缩略图', hint: '在编辑器右侧展示全局代码结构的微缩导航（默认：关闭）' },
        padding: { label: '内边距', hint: '编辑器内容与边框之间的留白' },
        scrollbarSize: { label: '滚动条粗细', hint: '编辑器滚动条的宽度' },
      },

      /** 偏好选项的取值名（下拉里的那一项） */
      option: {
        themeDark: '深色',
        themeLight: '浅色',
        fontDefault: '默认等宽栈',
        wrapOff: '不换行',
        wrapOn: '按视口换行',
        wrapColumn: '按列宽换行',
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
        groupNote: '装到这台设备后，可以从主屏幕 / 桌面直接以独立窗口打开，离线也能用。',
        install: { label: '安装到设备', title: '安装到设备' },
        installHint: '当前浏览器支持安装，点右侧按钮即可',
        installedHint: '当前浏览器不支持安装，或已经装好了',
        installAction: '安装',
        installedAction: '已安装',
      },

      extension: {
        groupNote:
          '装好插件后，在任意 OJ 题目页点插件图标，解析出来的题面、样例和限制会直接送进这个网站，不用手抄。',
        downloadHint:
          '装上后需在 chrome://extensions 打开「开发者模式」，用「加载已解压的扩展程序」选中解压出来的目录。插件不在应用商店里，所以没法一键安装。',
        /** 上面那句里夹着一个 <code>chrome://extensions/shortcuts</code>，拆成前后两半 */
        shortcutsManagedPrefix: '插件快捷键由浏览器管理，网页没有权限改写，也没有权限跳转到',
        shortcutsManagedSuffix: '（浏览器会拦掉指向 chrome:// 的跳转）。只能复制地址后自己到地址栏粘贴打开。',
        status: '安装状态',
        recheck: '重新检测',
        recheckTitle: '重新检测插件',
        checking: '检测中',
        checkingHint: '检测中…',
        missingHint: '未检测到；装好后需要刷新本页才会被检测到',
        installedHint: '已安装 v{version}',
        download: { label: '下载插件' },
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

      help: {
        guideLink: '完整使用指南',
      },
    },
  },

  en: {
    settings: {
      ariaLabel: 'Settings',
      navAriaLabel: 'Settings categories',

      section: {
        appearance: 'Appearance',
        editor: 'Editor',
        shortcuts: 'Shortcuts',
        judge: 'Judge',
        runtime: 'Local runtime',
        extension: 'Browser extension',
        app: 'App',
        help: 'Help',
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

      uiScale: {
        default: '{value} (default)',
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
          hint: 'Render symbols such as => or != as single joined glyphs (needs a font that supports them, e.g. Fira Code)',
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
        minimap: {
          label: 'Minimap',
          hint: 'Show a scaled-down overview of the file on the right edge (default: off)',
        },
        padding: { label: 'Padding', hint: 'Space between the editor content and its border' },
        scrollbarSize: { label: 'Scrollbar width', hint: 'Width of the editor scrollbars' },
      },

      option: {
        themeDark: 'Dark',
        themeLight: 'Light',
        fontDefault: 'Default monospace stack',
        wrapOff: 'Off',
        wrapOn: 'Wrap at viewport',
        wrapColumn: 'Wrap at column',
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
        groupNote:
          'Once installed, the site opens in its own window straight from your home screen or desktop, and works offline.',
        install: { label: 'Install on this device', title: 'Install on this device' },
        installHint: 'This browser supports installation — use the button on the right',
        installedHint: 'This browser does not support installation, or the app is already installed',
        installAction: 'Install',
        installedAction: 'Installed',
      },

      extension: {
        groupNote:
          'With the extension installed, click its icon on any problem page and the statement, samples and limits are pushed straight into this site — no copy-pasting.',
        downloadHint:
          'After downloading, open chrome://extensions, turn on Developer mode, and use “Load unpacked” to select the folder you extracted. The extension is not on the store, so there is no one-click install.',
        shortcutsManagedPrefix:
          'Extension shortcuts are managed by the browser: a web page cannot rebind them, nor navigate to',
        shortcutsManagedSuffix:
          '(the browser blocks navigation to chrome:// URLs). Copy the address and paste it into the address bar yourself.',
        status: 'Installation status',
        recheck: 'Check again',
        recheckTitle: 'Check for the extension again',
        checking: 'Checking',
        checkingHint: 'Checking…',
        missingHint: 'Not detected. Reload this page after installing it.',
        installedHint: 'Installed v{version}',
        download: { label: 'Download the extension' },
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

      help: {
        guideLink: 'Full user guide',
      },
    },
  },
}
