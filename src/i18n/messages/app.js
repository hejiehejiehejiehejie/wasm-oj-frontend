/**
 * 应用外壳的文案：页签栏、侧边栏、空状态，以及各域共用的通用词。
 *
 * 体例见 `../index.js` 的文件头说明：这个文件里同一个 key 的中英两栏写在一起。
 */
export default {
  'zh-CN': {
    app: {
      settings: '设置',
      cancel: '取消',
      save: '保存',
      retry: '重试',
      download: '下载',

      /** 编辑区没有任何打开文件时的空状态 */
      emptyEditor: '在侧边栏的「资源管理器」里打开或新建文件',
      /** 评测面板页脚那颗 ▶ 的 title */
      runAllTests: '运行全部测试用例',

      /** Android 端首次准备随包编译器时的等待遮罩（ToolchainGate） */
      toolchain: {
        title: '正在准备编译环境',
        note: '首次启动要把随包的 clang 工具链解到应用目录，需要几秒钟；只做这一次，之后启动直接跳过。',
        failedTitle: '编译环境准备失败',
        /** 失败时的退路：不准备也能用编辑器，只是点运行会报缺编译器 */
        skip: '先进入',
      },

      /** 编辑器底部状态栏（{count} / {line} / {column} 都是数字） */
      status: {
        spaces: '空格: {count}',
        selected: '已选中 {count} 字符',
        cursor: '行 {line}，列 {column}',
      },

      /** 编辑区的上下文菜单（桌面鼠标右键 / 触屏长按，2026-10-10 加） */
      editorMenu: {
        cut: '剪切',
        copy: '复制',
        paste: '粘贴',
        selectAll: '全选',
        exportImage: '生成图片',
        changeAll: '更改所有匹配项',
        commandPalette: '命令面板',
      },

      /** 「生成图片」之后那一次询问：要复制还是保存（设置里可关掉，见 codeImageAsk） */
      imageAsk: {
        title: '图片已生成',
        desc: '要复制这张图，还是保存成 PNG 文件？',
        copy: '复制',
        save: '保存',
      },

      tabs: {
        listLabel: '打开的文件',
        dirty: '未保存',
        diskChanged: '磁盘上的这个文件已被外部修改；保存会以编辑器里的内容覆盖它',
        untitled: '未命名',
        closeTab: '关闭标签',
        closeSettings: '关闭设置',
        /** 页签分组（2026-10-19 加，模仿 Chrome 的标签页组） */
        addToNewGroup: '添加到新标签页组',
        removeFromGroup: '从标签页组中移除',
        groupChip: '标签页组',
        groupNamePh: '为此分组命名',
        groupColors: '分组颜色',
        groupAddTab: '在组内添加新标签页',
        groupClose: '关闭标签页组',
        groupUngroup: '取消分组',
        groupDelete: '删除标签页组',
      },

      sidebar: {
        explorer: '资源管理器',
        tests: '评测样例',
        /** 胶囊段位上的短标签（图标旁，空间够才显示；全称照旧走 explorer/tests） */
        explorerShort: '文件',
        testsShort: '评测',
        switcherLabel: '侧边栏面板与设置',
        /** 胶囊开关的 title / aria-label，{panel} 是目标面板名 */
        switchTo: '切换到{panel}',
        /** 窄屏底部那颗箭头按钮（2026-10-13 加）：把侧栏收成一条图标栏 */
        collapse: '收起侧边栏',
      },

      /** 题解（.md）编辑区：视图模式与预览面板 */
      md: {
        view: {
          label: '视图模式',
          edit: '仅编辑',
          split: '双栏（编辑 + 预览）',
          preview: '仅预览',
          fullscreen: '全屏',
          exitFullscreen: '退出全屏（Esc）',
          /** ⌘\ 那条轮换键的说明，挂在三段胶囊整组上（见 EditorPane） */
          cycleHint: '轮换视图模式（{key}）',
        },
        preview: {
          /** 预览面板当前状态的标题，key 即状态名 */
          state: {
            pending: '正在渲染…',
            missing: '题解渲染器还没下载',
            downloading: '正在下载渲染器',
            failed: '渲染失败',
          },
          missingHint: '预览与公式渲染需要 katex + marked（约 0.6MB），只下一次，之后离线也能用。',
          download: '下载渲染器',
          downloading: '正在下载…',
        },
        toolGroup: '题解工具栏',
        /** 工具栏按钮的悬浮提示：动作名 + 键位（键位不可改，只能靠提示说明） */
        toolHint: '{name}（{key}）',
        /** 各动作的名字，键即动作名（见 services/mdFormat.js 的 MD_TOOL_GROUPS） */
        tool: {
          bold: '加粗',
          italic: '斜体',
          strike: '删除线',
          code: '行内代码',
          heading: '标题',
          quote: '引用',
          list: '无序列表',
          orderedList: '有序列表',
          codeBlock: '代码块',
          link: '链接',
          image: '图片',
          math: '公式',
          table: '表格',
          hr: '分割线',
          /** 无选区时插进正文的占位文案，插完会选中它，接着打字正好替换 */
          ph: {
            bold: '加粗文字',
            italic: '斜体文字',
            strike: '删除线文字',
            code: '代码',
            math: '公式',
          },
          tableHead: '表头',
          tableCell: '内容',
        },
        /** 链接 / 图片那颗按钮点开后的填写行 */
        insert: {
          link: '插入链接',
          image: '插入图片',
          label: '显示文字',
          alt: '图片描述',
          url: '链接地址',
          confirm: '插入',
          invalidUrl: '请填 http 或 https 开头的地址',
        },
        stats: {
          chars: '{count} 字',
          lines: '{count} 行',
        },
      },
    },
  },

  en: {
    app: {
      settings: 'Settings',
      cancel: 'Cancel',
      save: 'Save',
      retry: 'Retry',
      download: 'Download',

      emptyEditor: 'Open or create a file from the Explorer in the sidebar',
      runAllTests: 'Run all test cases',

      toolchain: {
        title: 'Preparing the compiler environment',
        note: 'The first launch extracts the bundled clang toolchain into the app directory. It takes a few seconds and happens only once — later launches skip it.',
        failedTitle: 'Could not prepare the compiler environment',
        skip: 'Continue anyway',
      },

      status: {
        spaces: 'Spaces: {count}',
        selected: '{count} characters selected',
        cursor: 'Ln {line}, Col {column}',
      },

      editorMenu: {
        cut: 'Cut',
        copy: 'Copy',
        paste: 'Paste',
        selectAll: 'Select All',
        exportImage: 'Export image',
        changeAll: 'Change All Occurrences',
        commandPalette: 'Command Palette',
      },

      imageAsk: {
        title: 'Image ready',
        desc: 'Copy it, or save it as a PNG file?',
        copy: 'Copy',
        save: 'Save',
      },

      tabs: {
        listLabel: 'Open files',
        dirty: 'Unsaved',
        diskChanged: 'This file changed on disk; saving will overwrite it with the editor content',
        untitled: 'Untitled',
        closeTab: 'Close tab',
        closeSettings: 'Close settings',
        /** Tab groups (2026-10-19, Chrome-style tab groups) */
        addToNewGroup: 'Add to new tab group',
        removeFromGroup: 'Remove from tab group',
        groupChip: 'Tab group',
        groupNamePh: 'Name this tab group',
        groupColors: 'Group color',
        groupAddTab: 'Add a new tab to the group',
        groupClose: 'Close group',
        groupUngroup: 'Ungroup',
        groupDelete: 'Delete group',
      },

      sidebar: {
        explorer: 'Explorer',
        tests: 'Test cases',
        /** Short segment labels next to the icon (shown only when the header is wide enough) */
        explorerShort: 'Files',
        testsShort: 'Tests',
        switcherLabel: 'Sidebar panels and settings',
        switchTo: 'Switch to {panel}',
        collapse: 'Collapse sidebar',
      },

      md: {
        view: {
          label: 'View mode',
          edit: 'Editor only',
          split: 'Split (editor + preview)',
          preview: 'Preview only',
          fullscreen: 'Full screen',
          exitFullscreen: 'Exit full screen (Esc)',
          cycleHint: 'Cycle view mode ({key})',
        },
        preview: {
          state: {
            pending: 'Rendering…',
            missing: 'The editorial renderer is not downloaded yet',
            downloading: 'Downloading the renderer',
            failed: 'Rendering failed',
          },
          missingHint:
            'Preview and math rendering need katex + marked (about 0.6MB). Downloaded once, then it works offline.',
          download: 'Download renderer',
          downloading: 'Downloading…',
        },
        toolGroup: 'Editorial toolbar',
        toolHint: '{name} ({key})',
        tool: {
          bold: 'Bold',
          italic: 'Italic',
          strike: 'Strikethrough',
          code: 'Inline code',
          heading: 'Heading',
          quote: 'Blockquote',
          list: 'Bulleted list',
          orderedList: 'Numbered list',
          codeBlock: 'Code block',
          link: 'Link',
          image: 'Image',
          math: 'Math',
          table: 'Table',
          hr: 'Divider',
          ph: {
            bold: 'bold text',
            italic: 'italic text',
            strike: 'struck text',
            code: 'code',
            math: 'formula',
          },
          tableHead: 'Header',
          tableCell: 'Cell',
        },
        insert: {
          link: 'Insert link',
          image: 'Insert image',
          label: 'Text',
          alt: 'Alt text',
          url: 'URL',
          confirm: 'Insert',
          invalidUrl: 'Use an http or https address',
        },
        stats: {
          chars: '{count} chars',
          lines: '{count} lines',
        },
      },
    },
  },
}
