/**
 * 「组件」菜单（ComponentsMenu）的文案。
 *
 * 【为什么单独一个域】这个菜单过去叫 CfMenu、只装 Codeforces 的两块界面，2026-10-20
 * 起改成按类分组的组件抽屉：Codeforces 只是其中一类，另一类是常驻的「工具」。
 * 抬头与类名因此不再属于 cf.js —— 卸载 Codeforces 之后这个菜单还在，
 * 文案不能跟着那个域一起被删。
 *
 * 各类里的条目名仍留在自己的域里：抽题 / 比赛在 `cf.menu.*`，倒计时在 `countdown.title`。
 */
export default {
  'zh-CN': {
    components: {
      menu: {
        title: '组件',
        codeforces: 'Codeforces',
        tools: '工具',
        empty: '还没有已安装的组件，可在「设置 › 应用 › 组件」里安装。',
      },
    },
  },
  en: {
    components: {
      menu: {
        title: 'Components',
        codeforces: 'Codeforces',
        tools: 'Tools',
        empty: 'No components installed yet — install them in Settings › App › Components.',
      },
    },
  },
}
