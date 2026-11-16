/**
 * 资源管理器（文件树 / 页签 / 右键菜单 / 题目信息弹窗）与 OJ 元数据的文案。
 *
 * 【OJ 与洛谷等级】`Luogu` / `Codeforces` / `NowCoder` 这些按站点自称的写法保留；
 * 洛谷那八级是**意译**（不是洛谷官方英文名，官方站没有对外公布英文评级表），
 * 以后若拿到官方译法，只改下面 `oj.luogu.*` 这几条即可。
 */
export default {
  'zh-CN': {
    explorer: {
      /** 新建目录时的默认名 */
      defaultFolderName: '新建文件夹',
      createFailed: '创建失败',
      renameFailed: '重命名失败',
      moveFailed: '移动失败',
      saveFailed: '保存失败',
      /** 多选删除时有几条没删成（磁盘上被占住、权限不足之类） */
      deleteFailed: '{n} 项删除失败',

      /** 文件树全空时的占位语 */
      emptyTree: '还没有文件，点上方按钮新建',

      menu: {
        meta: '题目信息',
        openUrl: '打开题目',
        /** 「打开题目」右列的前半截：⌘ / Ctrl +，后面的「单击」是一枚指针图标（见 ContextMenu 的
         *  `shortcutIcon`），所以这里只留符号、不留单词。{mod} 由调用方按平台给 ⌘ 或 Ctrl */
        openUrlPointer: '{mod} +',
        newFile: '新建文件',
        newFolder: '新建文件夹',
        importFile: '导入文件',
        importFolder: '导入文件夹',
        export: '导出',
        /** 右键落在多选中的某一行上：这一项会导出整个选区，标签跟着报个数 */
        exportMany: '导出 {n} 项',
        rename: '重命名',
        delete: '删除',
        /** 右键落在多选中的某一行上：这一项会删掉整个选区，标签跟着报个数 */
        deleteMany: '删除 {n} 项',
      },

      /** 与外部文件系统之间搬文件（导入 / 导出） */
      transfer: {
        /** 桌面端点「导出」时的二选一卡片（只有桌面壳做得到写盘） */
        exportTitle: '导出到哪里？',
        exportToDisk: '保存到本机文件夹',
        exportToDiskHint: '保留目录结构；同名文件会被覆盖',
        exportZip: '下载为 zip',
        exportZipHint: '打包成一个文件下载',
        /** 结果提示。skipped 那句接在上面几句后面，所以自带前导标点 */
        exportAs: '已导出 {name}',
        exportToDiskDone: '已导出 {n} 个文件到 {dir}',
        exportToDiskOverwrite: '已导出 {n} 个文件到 {dir}（覆盖 {k} 个已有文件）',
        exportSkipped: '，跳过 {k} 个（二进制或过大）',
        exportFailed: '导出失败',
        exportEmpty: '没有可导出的文件',
        /** 导入结果提示 */
        importEmpty: '没有可导入的文件',
        importDone: '已导入 {n} 个文件',
        importSkipped: '已导入 {n} 个文件，跳过 {k} 个（二进制或过大）',
        importFailed: '导入失败',
        /** 搬运 / 删除进行中的行内提示（延迟 120ms 才出现，见 FileExplorer 的 beginTransferNotice） */
        importing: '正在导入 {n} 项…',
        exporting: '正在导出 {n} 项…',
        deleting: '正在删除 {n} 项…',
        /**
         * 从系统里把文件拖进页面后的**结果通知**（2026-10-13 起走全局通知，见 App.vue 的
         * reportDropImport）。重点是把「放到哪儿」说出来 —— 那条通知露面时侧栏已经还原，
         * 屏幕上不再有落点的痕迹。
         */
        dropDoneTitle: '导入完成',
        dropDone: '已导入 {n} 个文件到 {where}',
        dropDoneSkipped: '已导入 {n} 个文件到 {where}，跳过 {k} 个（二进制或过大）',
        /** `{where}` 取根目录时的写法 */
        whereRoot: '根目录',
      },

      /** 删除确认弹窗 */
      deleteConfirm: {
        title: '确定删除？',
        /** 一次删多项时的标题；下面会把路径逐条列出来 */
        titleMany: '确定删除这 {n} 项？',
        /** 路径列不完时折成这一句（接在列出的那几条之后） */
        more: '…另有 {n} 项',
        /** 名单里有目录时补的一句，单独一段 */
        directoryNote: '目录内所有内容会一并删除。',
      },

      meta: {
        title: '题目信息',
        url: '题目链接',
        oj: 'OJ',
        ojUnset: '未选择',
        difficulty: '难度',
        difficultyUnset: '未设置',
        difficultyCustom: '自定义难度',
        difficultyPickOj: '先选择 OJ',
        date: '日期',
        timeLimit: '时限（秒）',
        timeLimitPlaceholder: '留空用默认',
        /** 输出比对方式（2026-10-25 加；2026-11-09 改为「按题覆盖」）：空 = 跟随全局设置 */
        checker: '输出比对',
        checkerDefault: '跟随全局设置',
      },

      /** 文件树上那行 title 的多行提示，前缀 */
      tooltip: {
        oj: 'OJ：{value}',
        difficulty: '难度：{value}',
        timeLimit: '时限：{value}s',
        date: '日期：{value}',
        checker: '输出比对：{value}',
      },
    },

    oj: {
      luogu: '洛谷',
      codeforces: 'Codeforces',
      atcoder: 'AtCoder',
      nowcoder: '牛客',
      leetcode: 'LeetCode',
      other: '其它',

      /** 洛谷官方八级（意译） */
      luoguLevels: {
        rumen: '入门',
        'puji-': '普及-',
        puji: '普及',
        tigao: '提高',
        'tigao+': '提高+',
        shengxuan: '省选',
        noi: 'NOI',
        ctsc: 'CTSC',
      },
    },
  },

  en: {
    explorer: {
      defaultFolderName: 'New folder',
      createFailed: 'Could not create',
      renameFailed: 'Could not rename',
      moveFailed: 'Could not move',
      saveFailed: 'Could not save',
      deleteFailed: 'Could not delete {n} item(s)',

      emptyTree: 'No files yet — create one above',

      menu: {
        meta: 'Problem info',
        openUrl: 'Open problem',
        openUrlPointer: '{mod} +',
        newFile: 'New file',
        newFolder: 'New folder',
        importFile: 'Import files',
        importFolder: 'Import folder',
        export: 'Export',
        exportMany: 'Export {n} items',
        rename: 'Rename',
        delete: 'Delete',
        deleteMany: 'Delete {n} items',
      },

      transfer: {
        exportTitle: 'Export where?',
        exportToDisk: 'Save into a folder',
        exportToDiskHint: 'Keeps the folder structure; same-name files are overwritten',
        exportZip: 'Download as zip',
        exportZipHint: 'Packs everything into a single file',
        exportAs: 'Exported {name}',
        exportToDiskDone: 'Exported {n} file(s) to {dir}',
        exportToDiskOverwrite: 'Exported {n} file(s) to {dir} ({k} overwritten)',
        exportSkipped: ', skipped {k} (binary or too large)',
        exportFailed: 'Could not export',
        exportEmpty: 'Nothing to export',
        importEmpty: 'Nothing to import',
        importDone: 'Imported {n} file(s)',
        importSkipped: 'Imported {n} file(s), skipped {k} (binary or too large)',
        importFailed: 'Could not import',
        /** See the zh-CN side for the 120ms delay before these appear */
        importing: 'Importing {n} item(s)…',
        exporting: 'Exporting {n} item(s)…',
        deleting: 'Deleting {n} item(s)…',
        /** See the zh-CN side: the drop-result toast, which must name the destination folder */
        dropDoneTitle: 'Import finished',
        dropDone: 'Imported {n} file(s) into {where}',
        dropDoneSkipped: 'Imported {n} file(s) into {where}, skipped {k} (binary or too large)',
        whereRoot: 'the workspace root',
      },

      deleteConfirm: {
        title: 'Delete this?',
        titleMany: 'Delete these {n} items?',
        more: '…and {n} more',
        directoryNote: 'Everything inside will be deleted too.',
      },

      meta: {
        title: 'Problem info',
        url: 'Problem URL',
        oj: 'Judge',
        ojUnset: 'Not set',
        difficulty: 'Difficulty',
        difficultyUnset: 'Not set',
        difficultyCustom: 'Custom difficulty',
        difficultyPickOj: 'Pick a judge first',
        date: 'Date',
        timeLimit: 'Time limit (s)',
        timeLimitPlaceholder: 'Blank uses the default',
        /** 同 zh-CN：输出比对方式，空 = 跟随全局设置 */
        checker: 'Output check',
        checkerDefault: 'Use the judge setting',
      },

      tooltip: {
        oj: 'Judge: {value}',
        difficulty: 'Difficulty: {value}',
        timeLimit: 'Time limit: {value}s',
        date: 'Date: {value}',
        checker: 'Output check: {value}',
      },
    },

    oj: {
      luogu: 'Luogu',
      codeforces: 'Codeforces',
      atcoder: 'AtCoder',
      nowcoder: 'NowCoder',
      leetcode: 'LeetCode',
      other: 'Other',

      luoguLevels: {
        rumen: 'Beginner',
        'puji-': 'Novice−',
        puji: 'Novice',
        tigao: 'Intermediate',
        'tigao+': 'Intermediate+',
        shengxuan: 'Provincial',
        noi: 'NOI',
        ctsc: 'CTSC',
      },
    },
  },
}
