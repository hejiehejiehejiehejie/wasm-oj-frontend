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
        /** 「打开题目」右列的提示：⌘ / Ctrl + 单击。{mod} 由调用方按平台给 ⌘ 或 Ctrl */
        openUrlClick: '{mod} + 单击',
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
        exportToDiskHint: '按原目录结构写进你选的文件夹，同名文件会被覆盖',
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
      },

      /** 删除确认弹窗 */
      deleteConfirm: {
        title: '确定删除？',
        /** 一次删多项时的标题；下面会把路径逐条列出来 */
        titleMany: '确定删除这 {n} 项？',
        /** 路径列不完时折成这一句（接在列出的那几条之后） */
        more: '…另有 {n} 项',
        /** 名单里有目录时补的一句，单独一段 */
        directoryNote: '目录内的全部内容将一并删除。',
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
      },

      /** 文件树上那行 title 的多行提示，前缀 */
      tooltip: {
        oj: 'OJ：{value}',
        difficulty: '难度：{value}',
        timeLimit: '时限：{value}s',
        date: '日期：{value}',
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

      emptyTree: 'No files yet — use the buttons above to create one',

      menu: {
        meta: 'Problem info',
        openUrl: 'Open problem',
        openUrlClick: '{mod} + Click',
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
        exportToDiskHint: 'Writes into the folder you pick, keeping the tree; same-name files are overwritten',
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
      },

      deleteConfirm: {
        title: 'Delete this?',
        titleMany: 'Delete these {n} items?',
        more: '…and {n} more',
        directoryNote: 'Everything inside the folder will be deleted as well.',
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
      },

      tooltip: {
        oj: 'Judge: {value}',
        difficulty: 'Difficulty: {value}',
        timeLimit: 'Time limit: {value}s',
        date: 'Date: {value}',
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
