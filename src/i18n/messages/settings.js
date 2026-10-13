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
           没探到扩展叫「安装 / 下载」，探到旧版叫「更新 / 重新下载」（2026-10-12 用户要求把
           安装与更新分开。Firefox 走 AMO、Chromium 走 zip，两组词的区别只在路怎么走）。 */
        installApp: '安装为应用',
        installExtension: '安装浏览器插件',
        updateExtension: '更新浏览器插件',
        downloadExtension: '下载浏览器插件',
        updateExtensionManual: '重新下载浏览器插件',
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
        note: '工作区是这套 IDE 存放代码的地方。虚拟工作区把文件存在浏览器本地存储里；本机文件夹则直接读写磁盘上的一个目录，外部编辑器改动能被自动感知。切换会让界面重新加载。',
        current: '当前工作区',
        modeVirtual: '虚拟工作区',
        modeFolder: '本机文件夹',
        rootLabel: '文件夹路径',
        flow: '打开文件夹',
        note2: '选择一个本机目录作为工作区，用它替换当前的虚拟工作区。隐藏项（点开头的条目）与 node_modules 不会出现在文件树里。',
        choose: '选择文件夹',
        chooseTitle: '选择一个本机目录作为工作区，之后界面会重新加载',
        switching: '正在切换…',
        chooseFailed: '打开文件夹失败：{message}',
        back: '切回虚拟工作区',
        backTitle: '回到存在浏览器里的虚拟工作区，之后界面会重新加载',
        backHint: '本机文件夹里的文件不会被删除，随时可以再切回去。',
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
        narrowCollapseSide: {
          label: '窄屏折叠方向',
          hint: '手机与平板竖屏下，收起侧栏后那条图标栏贴屏幕的上边还是下边；宽屏是竖条，没有上下之分',
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
        groupImage: '代码图片',

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
        codeImageQuality: {
          label: '导出质量',
          hint: '画布尺寸固定（图里的字号不随编辑器字号或屏幕变化），质量只决定渲染倍率：越高越清晰，文件也越大',
        },
        codeImageDots: {
          label: '窗口栏圆点',
          hint: '在卡片左上角画出 macOS 风格的红、黄、绿三个圆点',
        },
        codeImageLineNumbers: {
          label: '显示行号',
          hint: '在卡片正文左侧画出行号栏，从选区所在的行开始编号（默认：开启）',
        },
        codeImageAsk: {
          label: '每次询问复制还是保存',
          hint: '生成图片后弹一次窗让你挑；关掉之后按「默认动作」直接执行（默认：开启）',
        },
        codeImageAction: {
          label: '默认动作',
          hint: '只在关掉上面那条「每次询问」后才用得上（默认：复制）',
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
        togglePanel: { label: '显示 / 隐藏侧边栏' },
        switchPanel: { label: '切换侧栏面板', hint: '资源管理器 ↔ 评测样例' },
        toggleLayout: { label: '侧边栏左右对调' },
        newCase: { label: '新增一条测试用例' },
        openSettings: { label: '打开 / 收起设置' },
        exportImage: { label: '生成图片', hint: '把选中的代码导成 PNG；没有选区时不响应' },
        renameNode: { label: '重命名（文件 / 文件夹）', hint: '焦点在资源管理器里才生效' },
        deleteNode: {
          label: '删除（文件 / 文件夹）',
          hint: '焦点在资源管理器里才生效 · Delete 就是它自己的键位，清除这行请用 × 或 Backspace',
        },
        selectAllNodes: {
          label: '全选（资源管理器）',
          hint: '焦点在资源管理器里才生效 · 选中的是焦点所在文件夹里的全部内容（含子目录；焦点在空白处时 = 根目录）',
        },

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
        memoryLimit: { label: '内存上限', hint: '超出判 MLE；抓来的题优先用题目限制，这里只是默认值。wasm 沙箱与 Judge0 支持，其余引擎忽略' },
        engines: '评测引擎',
      },

      app: {
        basics: '基础设置',
        install: {
          label: '安装到设备',
          title: '安装到设备',
          /**
           * 三个状态词就是这一栏的**引擎判据**那部分文案 —— 只看一条：**引擎有没有
           * 「把网站装成应用」这套 API**（`useInstallPrompt.js` 的 `INSTALL_API_SUPPORTED`，
           * 属性检测 `'onbeforeinstallprompt' in window`）。**状态词本身不按浏览器型号分岔**。
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
            '一键安装入口此刻不可用。常见两种原因：装过又删掉（从 Finder 删图标不算卸载，浏览器里还留着记录）、或之前取消过安装对话框。到',
          blockedSuffix: '里右键移除那个应用，再刷新本页，入口就会回来。',
          copyApps: '复制地址',
          copied: '已复制',
          copyAppsTitle:
            '复制 chrome://apps —— 网页没有权限跳转过去，只能复制后自己到地址栏粘贴打开',
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
            'Firefox 没有一键安装的接口，但可以用它自己的菜单装：右上角 ⋮ →「安装」。若只看到「添加到主屏幕」，那是普通快捷方式，一样能用。',
          noApiFirefoxWindows:
            '桌面版 Firefox 不能用清单把网站装成应用；Windows 上只有 Firefox 143+ 另有一条路 —— 点地址栏那个「网络应用」图标。',
          noApiFirefoxOther:
            '桌面版 Firefox 不能用清单把网站装成应用，也没提供别的安装入口（macOS / Linux 上是这样）。',
          noApiIos:
            'iOS 上的浏览器都没有一键安装的接口：点「分享」→「添加到主屏幕」。',
          noApiSafariDesktop:
            '桌面版 Safari 不能用清单安装：走「文件」→「添加到程序坞」。',
          noApiGeneric:
            '这个浏览器没有一键安装的接口，用浏览器自己的菜单安装即可。',
          /** 「应用」栏末尾那颗手动引导按钮（通知内容见 services/installGuides.js） */
          guide: '安装引导',
          guideHint: '用一条通知再讲一遍怎么装（各浏览器的装法不一样）',
        },
        installAction: '安装',
        installedAction: '已安装',
      },

      extension: {
        groupNote:
          '装好插件后，在任意 OJ 题目页点插件图标，解析出来的题面、样例和限制会直接送进这个网站。',
        /**
         * 安装引导按浏览器只给一条；认不出时给 `hintChromium` 那条通用步骤 ——
         * **fail-open 是刻意的**：猜错的代价是用户看不到入口，比多给一条路糟得多。
         * 移动端单独两句：那边能装的东西与桌面完全不是一回事。
         */
        hintFirefox: '点「Firefox 版」去附加组件商店一键安装；装完回设置里点「重新检测」。',
        hintEdge:
          'Edge 加载项商店版还没上架，先按 Chromium 通用步骤装：下载 zip 并解压 → 地址栏打开 edge://extensions → 开「开发人员模式」→「加载解压缩的扩展」选中解压出来的目录。',
        hintChrome:
          '下载 zip 并解压 → 地址栏打开 chrome://extensions → 打开「开发者模式」→「加载已解压的扩展程序」选中解压出来的目录。',
        hintChromium:
          '这个内核的浏览器认不出具体是哪一款，按 Chromium 通用步骤装：下载 zip 并解压 → 打开浏览器的扩展管理页 → 打开「开发者模式」→「加载已解压的扩展程序」选中解压出来的目录。',
        hintMobileUnsupported:
          '手机 / 平板上目前只有安卓的 Firefox 能装这个插件（安卓的 Edge 已支持扩展，但这个插件还没上架 Edge 加载项），Chrome 手机版完全不支持扩展 —— 建议改用 Firefox。',
        /** Safari（含 iOS 上所有浏览器）：唯一「一条路都没有」的一档，别给按钮 */
        hintUnsupported:
          '这个浏览器装不了本插件 —— Safari 的扩展要走 App Store 分发，与 Chrome / Edge / Firefox 那套不通用（iOS 上所有浏览器都是同一套内核，同样装不了）。桌面端请换 Chrome、Edge 或 Firefox；手机 / 平板上目前只有安卓的 Firefox 能装。',
        /** 上面那句里夹着一个 <code>chrome://extensions/shortcuts</code>，拆成前后两半 */
        shortcutsManagedPrefix: '插件快捷键由浏览器管理，网页没有权限改写，也没有权限跳转到',
        shortcutsManagedSuffix: '（浏览器会拦掉指向 chrome:// 的跳转）。只能复制地址后自己到地址栏粘贴打开。',
        /** Firefox 的快捷键不在 chrome://extensions/shortcuts（那个地址在 Firefox 上不存在） */
        shortcutsManagedSuffixFx:
          '（about: 页面网页同样打不开）。打开后点右上角的齿轮，选「管理扩展快捷键」即可查看与修改。',
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
        updateHintManual: '重新下载安装包、替换掉旧目录后，在扩展管理页点一次刷新。',
        updateHintFirefox: 'Firefox 会自动更新；也可以在附加组件管理器里手动检查一次。',
        /** 这一栏末尾那颗手动引导按钮（通知内容见 services/installGuides.js） */
        guide: '安装引导',
        guideHint: '用一条通知再讲一遍怎么装或换新版（按当前浏览器给步骤）',
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
        /**
         * 键位为空**不是故障**，是 Chrome 的常态：它只在**安装插件那一刻**按 manifest 的
         * suggested_key 绑一次，那一刻键位被别的扩展占着（或用户清掉过）就再也不自动绑，
         * 插件读回来就是空串。光摆一个「未设置」会让人以为站点读不到 ——
         * 必须说清「为什么没有」和「去哪儿绑」。（2026-10-12）
         */
        shortcutUnassignedNote:
          '浏览器没给这个命令分配键位：Chrome 只在安装插件那一刻按建议键位绑一次，被别的扩展占了或清掉过就不会再绑。复制上面的地址，去设置页给「激活该扩展程序」绑一个空闲键，回来点「重新检测」。',
        /** 插件一条命令都没报上来（重探没救回来时，多半是插件版本过旧） */
        shortcutEmptyNote:
          '没读到插件上报的快捷键。先点上面的「重新检测」；仍为空的话多半是插件版本过旧，按上面那一行更新到最新版再看。',
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
          '把本机的偏好设置（编辑器、快捷键、界面、评测引擎等）存到云端。题目文件、测试样例与判题服务器地址不会上传。',
        handle: {
          label: 'Codeforces 用户名',
        },
        handlePlaceholder: '例如 he-jie',
        login: '登录',
        loginTitle:
          '在这台设备上登录这个用户名；登录不会改动云端已存的配置',
        /**
         * 「导入」与「登录」并排在同一行，但两件事完全不同：导入是**取一份公开的云端配置**
         * （GET /api/config/<handle> 本来就不需要鉴权），取完也不把这台设备绑到那个用户名上；
         * 登录则要证明你是主人、且会建立绑定。标题里必须把「不需要验证」说出来，
         * 否则没人会知道还有这么一条不用取码的路。
         */
        import: '导入',
        importTitle: '只把云端的配置取回本机，不需要验证；本机设置会被覆盖，之后页面重新加载',
        loginNoCloud: '已登录。云端还没有这个用户名的配置 —— 点「上传本机设置」把当前设置存上去',
        loggedIn: '已登录。点「下载到本机」把云端配置取回本机',
        codeIntro: '云端已有你的配置。这一步只确认「这是你的」，不会改动云端内容。',
        codeIntroUpload:
          '写云端必须先证明是本人。这一枚码验证成功后，本机会记下服务端签发的设备令牌，之后的写入就不用再取码了。',
        codeLabel: '验证码',
        codeHint: '10 分钟内有效；同一个用户名 10 分钟最多申请 5 次',
        copyCode: '复制',
        copyCodeTitle: '把这枚验证码复制到剪贴板',
        copied: '已复制',
        codeWarn: '只认屏幕上这一枚：重新取码会让上一枚立刻作废，取到新码后记得把 Codeforces 上的值也换成新的',
        /**
         * 「代填」只在装了扩展、且扩展能力清单里有 fill-code 时出现（见 useCompanionBridge
         * 的 canFillCode）。文案里必须点明它**不碰凭据** —— 用户装的是一个抓题插件，
         * 忽然被它代填个人资料，得有一句话说清它凭什么能做、又不拿走什么。
         */
        fillCode: '在 Codeforces 上自动填写',
        fillCodeTitle:
          '由已装的扩展打开 Codeforces 的 Social 一页，把上面这枚验证码填进 Last name 并保存。扩展不会读取、也不会把你的 Codeforces 登录凭据上传到任何地方',
        fillCodeBusy: '正在填写…',
        fillCodeNote: '没装扩展也不影响：照下面两步手动填一样可以',
        fillCodeDone: '已在 Codeforces 上填好，回到这里点下面的按钮完成验证',
        /**
         * 取码相里那行提示的另外三种形态（第四种是默认的 fillCodeNote，即「不知道」）。
         * 只在**装了带 cf-check 能力的扩展**、且它报回了明确结论时才出现。
         * 措辞别写成断言：扩展报的是它在浏览器里看到的事实，不是服务端确认过的身份
         * （见 cloudSession 的 cfStatus）——所以这里说的是「这个浏览器」，不是「你」。
         */
        cfHintMatch: '已确认这个浏览器登录的是 {handle}，点一下就能填好',
        cfHintMismatch: '这个浏览器登录的不是「{handle}」，切到正确的账号再点',
        cfHintNotLoggedIn: '这个浏览器里没有登录 Codeforces，先登录再点',
        fillNotLoggedIn: '这个浏览器里没有登录 Codeforces，先登录再试',
        fillMismatch: '浏览器里登录的不是「{handle}」，先切到正确的账号再试',
        fillNoTab: '没能打开 Codeforces 的设置页，手动打开一次后重试',
        fillPage: 'Codeforces 的页面没能认出来（可能改版了），请手动填写',
        fillTimeout: '扩展没有回应，确认它已启用后再试',
        fillUnsupported: '扩展版本过旧，不支持自动填写，请手动填写',
        fillFailed: '没能自动填写，请手动填写',
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
           nothing detected reads "install / download", an outdated install reads
           "update / download again" (asked for on 2026-10-12: keep the two states apart).
           AMO on Firefox, the zip on Chromium; the wording differs only in how the route works. */
        installApp: 'Install as an app',
        installExtension: 'Install the extension',
        updateExtension: 'Update the extension',
        downloadExtension: 'Download the extension',
        updateExtensionManual: 'Download the extension again',
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

      /** Workspace (desktop only): open / switch a local folder as the current workspace */
      workspace: {
        note: 'A workspace is where this IDE keeps your code. The virtual workspace stores files in the browser; a local folder reads and writes a directory on your disk, and changes made in other editors are picked up automatically. Switching reloads the interface.',
        current: 'Current workspace',
        modeVirtual: 'Virtual workspace',
        modeFolder: 'Local folder',
        rootLabel: 'Folder path',
        flow: 'Open a folder',
        note2: 'Pick a folder on this machine to use as the workspace, replacing the current virtual one. Hidden entries (names starting with a dot) and node_modules are left out of the file tree.',
        choose: 'Choose folder',
        chooseTitle: 'Pick a folder on this machine as the workspace; the interface reloads afterwards',
        switching: 'Switching…',
        chooseFailed: 'Could not open the folder: {message}',
        back: 'Back to virtual workspace',
        backTitle: 'Return to the workspace stored in the browser; the interface reloads afterwards',
        backHint: 'Files in the local folder are never deleted — you can switch back at any time.',
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
        narrowCollapseSide: {
          label: 'Narrow-screen collapse edge',
          hint: 'On phones and portrait tablets, whether the collapsed icon bar sits at the top or the bottom edge. On wide screens it is a vertical bar, so this has no effect.',
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
        groupImage: 'Code image',

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
        codeImageQuality: {
          label: 'Export quality',
          hint: 'The canvas size is fixed (the font size in the image follows neither the editor font size nor the screen), so quality only sets the render scale: higher is sharper and larger',
        },
        codeImageDots: {
          label: 'Window dots',
          hint: 'Draw the three macOS-style dots (red, yellow, green) in the card’s top-left corner',
        },
        codeImageLineNumbers: {
          label: 'Line numbers',
          hint: 'Draw a line-number gutter left of the code, numbered from the first line of the selection (default: on)',
        },
        codeImageAsk: {
          label: 'Ask copy or save every time',
          hint: 'Pop up once after the image is built to let you choose; off means the “Default action” below runs straight away (default: on)',
        },
        codeImageAction: {
          label: 'Default action',
          hint: 'Only used when “Ask copy or save every time” above is off (default: copy)',
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
        togglePanel: { label: 'Show / hide the sidebar' },
        switchPanel: { label: 'Switch sidebar panel', hint: 'Explorer ↔ Test cases' },
        toggleLayout: { label: 'Swap sidebar side' },
        newCase: { label: 'Add a test case' },
        openSettings: { label: 'Open / close settings' },
        exportImage: {
          label: 'Export image',
          hint: 'Turns the selected code into a PNG; does nothing when nothing is selected',
        },
        renameNode: { label: 'Rename (file / folder)', hint: 'Applies while the focus is in the explorer' },
        deleteNode: {
          label: 'Delete (file / folder)',
          hint: 'Applies while the focus is in the explorer · Delete is its own binding, clear this row with × or Backspace',
        },
        selectAllNodes: {
          label: 'Select all (explorer)',
          hint: 'Applies while the focus is in the explorer · selects the whole focused folder, subfolders included (the root when the focus is on empty space)',
        },

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
        memoryLimit: { label: 'Memory limit', hint: 'Exceeding it reports MLE; imported problems use their own limit first, this is only the default. Supported by the wasm sandbox and Judge0, ignored by other engines' },
        engines: 'Judge engine',
      },

      app: {
        basics: 'Basics',
        install: {
          label: 'Install on this device',
          title: 'Install on this device',
          /**
           * These three status words are the **engine criterion** half of this row. One
           * criterion only: does the engine have the install-as-app API
           * (`INSTALL_API_SUPPORTED` in `useInstallPrompt.js`, probed as
           * `'onbeforeinstallprompt' in window`). The status words themselves are not keyed
           * off the browser model.
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
            'The one-click install entry is unavailable right now. Two common causes: you installed it before and deleted the app (deleting the icon in Finder is not an uninstall — the browser keeps the record), or you dismissed the install dialog earlier. Open',
          blockedSuffix:
            'and remove that app (right-click → Remove from Chrome), then reload this page and the entry returns.',
          copyApps: 'Copy address',
          copied: 'Copied',
          copyAppsTitle:
            'Copy chrome://apps — a web page cannot navigate there, so paste it into the address bar yourself',
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
            'Firefox exposes no one-click install API, but its own menu can install it: ⋮ → “Install”. If you only see “Add to Home screen”, that is a plain shortcut — it works just as well.',
          noApiFirefoxWindows:
            'Desktop Firefox cannot install a site as an app from its manifest; on Windows only Firefox 143+ has another route — the “web app” icon in the address bar.',
          noApiFirefoxOther:
            'Desktop Firefox cannot install a site as an app from its manifest, and offers no other install entry (that is the case on macOS and Linux).',
          noApiIos: 'No browser on iOS has a one-click install API: use Share → “Add to Home Screen”.',
          noApiSafariDesktop: 'Desktop Safari cannot install from a manifest: use File → “Add to Dock”.',
          noApiGeneric:
            'This browser has no one-click install API — install the site from the browser’s own menu.',
          /** Manual guide button at the end of the App section (notification copy: services/installGuides.js) */
          guide: 'Install guide',
          guideHint: 'Explain the install steps again in a notification (each browser differs)',
        },
        installAction: 'Install',
        installedAction: 'Installed',
      },

      extension: {
        groupNote:
          'With the extension installed, click its icon on any problem page and the statement, samples and limits are pushed straight into this site.',
        /**
         * One path per browser; `hintChromium` is the fail-open fallback when the
         * browser cannot be told apart. Mobile gets its own two lines, because what
         * can be installed there is a completely different story.
         */
        hintFirefox: 'Click “Firefox version” to install straight from the add-ons store, then hit “Check again” in Settings.',
        hintEdge:
          'The Edge Add-ons listing is not up yet, so use the generic Chromium steps: download and unzip the archive → open edge://extensions → turn on Developer mode → “Load unpacked” and pick the extracted folder.',
        hintChrome:
          'Download and unzip the archive → open chrome://extensions → turn on “Developer mode” → “Load unpacked” and pick the extracted folder.',
        hintChromium:
          'This browser cannot be told apart by engine alone, so use the generic Chromium steps: download and unzip the archive → open your browser’s extension manager → turn on “Developer mode” → “Load unpacked” and pick the extracted folder.',
        hintMobileUnsupported:
          'On phones and tablets only Firefox for Android can install this extension today (Edge for Android does support extensions, but this extension is not on Edge Add-ons yet), and Chrome for mobile has no extension support at all — so switch to Firefox.',
        /** Safari (and every browser on iOS): the one bucket with no path at all — no buttons */
        hintUnsupported:
          'This browser cannot install the extension: Safari extensions are distributed through the App Store and share nothing with the Chrome / Edge / Firefox route (and on iOS every browser uses that same engine, so none of them can install it). On desktop, use Chrome, Edge or Firefox; on phones and tablets only Firefox for Android can install it today.',
        shortcutsManagedPrefix:
          'Extension shortcuts are managed by the browser: a web page cannot rebind them, nor navigate to',
        shortcutsManagedSuffix:
          '(the browser blocks navigation to chrome:// URLs). Copy the address and paste it into the address bar yourself.',
        /** Firefox has no chrome://extensions/shortcuts — its shortcuts live in the Add-ons Manager */
        shortcutsManagedSuffixFx:
          '(about: pages cannot be opened by a web page either). Open it, then use the gear menu in the top right — “Manage Extension Shortcuts” — to view or change them.',
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
        updateHintManual: 'Download the archive again, replace the old folder, then hit refresh on the extension manager page.',
        updateHintFirefox: 'Firefox updates it automatically; you can also check for updates in the add-ons manager.',
        /** Manual guide button at the end of this section (notification copy: services/installGuides.js) */
        guide: 'Install guide',
        guideHint: 'Explain the install or update steps again in a notification (per browser)',
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
        /** An empty key is not a bug: Chrome only binds suggested_key at install time and skips it on conflict */
        shortcutUnassignedNote:
          'The browser has not assigned a key to this command: Chrome binds the suggested shortcut once, at install time, and skips it if another extension already holds that combo (or if it was cleared). Copy the address above, bind “Activate the extension” there, then hit “Recheck”.',
        /** The extension reported no commands at all (usually an outdated build) */
        shortcutEmptyNote:
          'No shortcuts came back from the extension. Hit “Recheck” above first; if it stays empty, the extension is probably outdated — update it with the row above.',
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
          'Store your preferences (editor, shortcuts, interface, judge engine…) in the cloud, then pull them back on another device by entering the same handle. Problem files, test cases and judge server addresses are never uploaded.',
        handle: {
          label: 'Codeforces handle',
        },
        handlePlaceholder: 'e.g. he-jie',
        login: 'Sign in',
        loginTitle:
          'Sign in with this handle on this device; signing in never changes the copy already in the cloud',
        /** 见 zh-CN 那侧的说明：与「登录」并排，但只取一份公开配置、不建立绑定 */
        import: 'Import',
        importTitle:
          'Just pull the cloud settings onto this device — no verification needed; local settings are overwritten and the page reloads',
        loginNoCloud:
          'Signed in. The cloud has no copy for this handle yet — use “Upload local settings” to store the current setup',
        loggedIn: 'Signed in. Use “Download to this device” to pull the cloud copy back',
        codeIntro:
          'The cloud already has your settings. This step only proves they are yours — the cloud copy is left untouched.',
        codeIntroUpload:
          'Writing to the cloud always requires proving it is you. Once this code checks out, this device stores the token the server issues — later writes reuse it and need no new code.',
        codeLabel: 'Verification code',
        codeHint: 'Valid for 10 minutes; at most 5 codes per handle every 10 minutes',
        copyCode: 'Copy',
        copyCodeTitle: 'Copy this verification code to the clipboard',
        copied: 'Copied',
        codeWarn:
          'Only the code shown here counts — asking for a new one invalidates the previous immediately, so update the value on Codeforces too',
        /** 见 zh-CN 那侧的说明：只在扩展具备 fill-code 能力时出现 */
        fillCode: 'Fill it in on Codeforces',
        fillCodeTitle:
          'The installed extension opens your Codeforces Social page, puts this code into Last name and saves it. It never reads your Codeforces credentials, and never uploads them anywhere.',
        fillCodeBusy: 'Filling…',
        fillCodeNote: 'No extension? No problem — follow the two steps below and do it by hand',
        fillCodeDone: 'Filled in on Codeforces — come back here and press the button below to finish',
        /** 见 zh-CN 那侧的说明：措辞指着「这个浏览器」，不指人 */
        cfHintMatch: 'Confirmed — this browser is signed in as {handle}; one click will fill it in',
        cfHintMismatch:
          'This browser is signed in as someone other than “{handle}” — switch accounts, then click',
        cfHintNotLoggedIn: 'This browser is not signed in to Codeforces — sign in, then click',
        fillNotLoggedIn: 'This browser is not signed in to Codeforces — sign in and try again',
        fillMismatch:
          'This browser is signed in as someone other than “{handle}” — switch to the right account and try again',
        fillNoTab: 'Could not open the Codeforces settings page — open it once by hand and retry',
        fillPage: 'Could not recognise the Codeforces page (it may have changed) — please fill it in by hand',
        fillTimeout: 'The extension did not answer — make sure it is enabled and try again',
        fillUnsupported: 'Your extension is too old for automatic filling — please fill it in by hand',
        fillFailed: 'Could not fill it in automatically — please do it by hand',
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
