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

      /** 编辑器底部状态栏（{count} / {line} / {column} 都是数字） */
      status: {
        spaces: '空格: {count}',
        selected: '已选中 {count} 字符',
        cursor: '行 {line}，列 {column}',
      },

      tabs: {
        listLabel: '打开的文件',
        dirty: '未保存',
        untitled: '未命名',
        closeTab: '关闭标签',
        closeSettings: '关闭设置',
      },

      sidebar: {
        explorer: '资源管理器',
        tests: '评测样例',
        switcherLabel: '侧边栏面板与设置',
        /** 胶囊开关的 title / aria-label，{panel} 是目标面板名 */
        switchTo: '切换到{panel}',
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

      status: {
        spaces: 'Spaces: {count}',
        selected: '{count} characters selected',
        cursor: 'Ln {line}, Col {column}',
      },

      tabs: {
        listLabel: 'Open files',
        dirty: 'Unsaved',
        untitled: 'Untitled',
        closeTab: 'Close tab',
        closeSettings: 'Close settings',
      },

      sidebar: {
        explorer: 'Explorer',
        tests: 'Test cases',
        switcherLabel: 'Sidebar panels and settings',
        switchTo: 'Switch to {panel}',
      },
    },
  },
}
