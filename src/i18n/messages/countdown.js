/**
 * 悬浮倒计时卡（components/CountdownCard.vue）的文案。
 *
 * 状态点、按钮的 title / aria-label 与设置区里的单位都走这里；预设时长的数字通过
 * `{n}` 插值，中英各写一份。菜单入口 `settings.menu.openCountdown` 在 settings 域里，
 * 与其它菜单行放在一起。
 */
export default {
  'zh-CN': {
    countdown: {
      title: '倒计时',
      pause: '暂停',
      resume: '继续',
      cancel: '中止倒计时',
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
    },
  },
}
