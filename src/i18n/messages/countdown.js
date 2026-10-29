/**
 * 悬浮倒计时卡（components/CountdownCard.vue）的文案。
 *
 * 状态点、按钮的 title / aria-label 与设置区里的单位都走这里；预设时长的数字通过
 * `{n}` 插值，中英各写一份。入口只有组件菜单 › 工具这一处（齿轮菜单那一行
 * 2026-10-21 按用户要求删掉了）。
 */
export default {
  'zh-CN': {
    countdown: {
      title: '倒计时',
      pause: '暂停',
      resume: '继续',
      cancel: '停止倒计时',
      reset: '重新设置',
      lock: '锁定（隐藏外框）',
      unlock: '解锁（恢复外框与操作）',
      unlockShort: '解锁',
      close: '关闭窗口',
      hours: '时',
      minutes: '分',
      seconds: '秒',
      start: '开始倒计时',
      done: '已结束',
      preset: {
        minutes: '{n} 分钟',
        hour: '1 小时',
      },
      status: {
        setup: '待开始',
        running: '进行中',
        paused: '已暂停',
        done: '已结束',
      },
      /** 设置 › 应用 › 组件 里那一行（与 cf.module.* 同形：标题复用 countdown.title）。
          已安装时不写字（2026-10-25 删掉 installedHint：状态点已经说了「已安装」） */
      module: {
        idleHint: '悬浮计时卡；装好后入口在「组件 › 工具」。',
        install: '安装',
        uninstallActionTitle: '卸载「{title}」',
        uninstallTitle: '卸载「{title}」？',
        uninstallHint:
          '关闭悬浮卡并清除计时，入口从「组件 › 工具」移除；位置与尺寸保留，可随时重新安装。',
        /** 设置 › 云同步 › 默认安装 里那一枚（2026-10-25 加，与抽题那两枚并列）。
            2026-10-30 起这组不再挂组级说明（cf.module.autoInstall.note 已删）。 */
        autoInstall: {
          switchTitle: '打开站点时自动启用「倒计时」组件',
        },
      },
    },
  },
  en: {
    countdown: {
      title: 'Countdown',
      pause: 'Pause',
      resume: 'Resume',
      cancel: 'Stop countdown',
      reset: 'Set up again',
      lock: 'Lock (hide frame)',
      unlock: 'Unlock (restore frame and controls)',
      unlockShort: 'Unlock',
      close: 'Close window',
      hours: 'h',
      minutes: 'm',
      seconds: 's',
      start: 'Start countdown',
      done: 'Finished',
      preset: {
        minutes: '{n} min',
        hour: '1 hour',
      },
      status: {
        setup: 'Not started',
        running: 'Running',
        paused: 'Paused',
        done: 'Finished',
      },
      module: {
        idleHint: 'A floating timer card; once installed, open it from Components › Tools.',
        install: 'Install',
        uninstallActionTitle: 'Uninstall "{title}"',
        uninstallTitle: 'Uninstall "{title}"?',
        uninstallHint:
          'Closes the card, discards the timer and removes it from Components › Tools; position and size are kept.',
        autoInstall: {
          switchTitle: 'Enable the Countdown component when the site opens',
        },
      },
    },
  },
}
