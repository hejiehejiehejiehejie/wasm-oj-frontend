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
       * 复制成功给 success；浏览器不支持图片剪贴板、退化成下载时给 info；
       * 整条链路出错给 error 且常驻 —— 那是需要人看一眼的情形。
       */
      image: {
        copiedTitle: '图片已复制',
        copiedBody: '选中的代码已生成 PNG，可以直接粘贴',
        downloadedTitle: '图片已下载',
        downloadedBody: '这个浏览器不支持写入图片剪贴板，已改为下载 PNG',
        failedTitle: '生成图片失败',
        failedBody: '没能导出这次选中的代码',
      },

      demo: {
        label: '通知',
        note: '通知系统尚未接入业务事件：下面几颗按钮各触发一种类型，用来检查样式、自动消失与排队行为（最多同显 4 条，超出的排队等候）。「带按钮」演示通知上的操作按钮：点按钮跑回调、这条随之退场。',
        info: '信息 · 3 秒',
        success: '成功 · 5 秒',
        warning: '警告 · 10 秒',
        error: '错误 · 常驻',
        action: '带按钮 · 常驻',
        clear: '清空全部',
        infoTitle: '系统提示',
        infoBody: '这条通知 3 秒后自动消失。',
        successTitle: '任务完成',
        successBody: '操作已成功结束。',
        warningTitle: '需要注意',
        warningBody: '这条通知会停留 10 秒。',
        errorTitle: '出了点问题',
        errorBody: '这条通知不会自动消失，需要手动关闭。',
        actionTitle: '文件已删除',
        actionBody: '「demo.txt」已移入回收站。',
        undo: '撤销',
        ignore: '忽略',
        undoneTitle: '已撤销',
        undoneBody: '「demo.txt」已恢复。',
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
        copiedBody: 'The selection was rendered to PNG — paste it anywhere',
        downloadedTitle: 'Image downloaded',
        downloadedBody: 'This browser cannot write images to the clipboard, so the PNG was downloaded instead',
        failedTitle: 'Export failed',
        failedBody: 'The selected code could not be exported',
      },

      demo: {
        label: 'Notifications',
        note: 'The notification system is not wired to app events yet: the buttons below fire one type each, for checking styling, auto-dismiss and queueing (max 4 visible at once, the rest wait in a queue). "With actions" shows action buttons on a notification: clicking one runs its callback and dismisses the toast.',
        info: 'Info · 3s',
        success: 'Success · 5s',
        warning: 'Warning · 10s',
        error: 'Error · sticky',
        action: 'With actions · sticky',
        clear: 'Clear all',
        infoTitle: 'Heads up',
        infoBody: 'This notification dismisses itself in 3 seconds.',
        successTitle: 'All done',
        successBody: 'The operation finished successfully.',
        warningTitle: 'Needs attention',
        warningBody: 'This notification stays for 10 seconds.',
        errorTitle: 'Something went wrong',
        errorBody: 'This notification will not dismiss itself — close it manually.',
        actionTitle: 'File deleted',
        actionBody: '"demo.txt" was moved to the trash.',
        undo: 'Undo',
        ignore: 'Ignore',
        undoneTitle: 'Undone',
        undoneBody: '"demo.txt" was restored.',
      },
    },
  },
}
