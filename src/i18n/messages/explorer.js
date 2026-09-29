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

      /** 文件树全空时的占位语 */
      emptyTree: '还没有文件，点上方按钮新建',

      menu: {
        meta: '题目信息',
        openUrl: '打开题目链接',
        newFile: '新建文件',
        newFolder: '新建文件夹',
        rename: '重命名',
        delete: '删除',
      },

      /** 删除确认弹窗 */
      deleteConfirm: {
        title: '确定删除？',
        /** 接在路径后面，构成一句话；只在目标是目录时显示 */
        directoryNote: '，目录内的全部内容将一并删除。',
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

      emptyTree: 'No files yet — use the buttons above to create one',

      menu: {
        meta: 'Problem info',
        openUrl: 'Open problem link',
        newFile: 'New file',
        newFolder: 'New folder',
        rename: 'Rename',
        delete: 'Delete',
      },

      deleteConfirm: {
        title: 'Delete this?',
        directoryNote: ' Everything inside the folder will be deleted as well.',
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
