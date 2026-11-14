/**
 * 「组件」菜单（ComponentsMenu）的文案。
 *
 * 【为什么单独一个域】这个菜单过去叫 CfMenu、只装 Codeforces 的两块界面，2026-10-20
 * 起改成按类分组的组件抽屉：Codeforces 只是其中一类，另一类是常驻的「工具」。
 * 2026-11-14 两组并成一组、抬头只留「组件」，原来的类名 `codeforces` / `tools` 随之删掉。
 * 抬头因此不再属于 cf.js —— 卸载 Codeforces 之后这个菜单还在，
 * 文案不能跟着那个域一起被删。
 *
 * 条目名仍留在自己的域里：Codeforces 在 `cf.view.title`，倒计时在 `countdown.title`。
 */
export default {
  'zh-CN': {
    components: {
      menu: {
        title: '组件',
        empty: '尚无组件，可在「设置 › 应用 › 组件」中安装。',
      },
      /**
       * 折叠图标栏（ActivityBar）的右键菜单。只在「非窄屏 + 鼠标」下弹（触屏没有右键）。
       * 第一项随当前停靠侧换词：现在在左就写「移到右侧」，说的永远是**点下去会发生什么**，
       * 而不是「现在在哪」—— 后者点一下什么都没变，读起来像坏了。
       * 下面列的是可固定到上簇的组件，条目名直接复用各组件自己的文案键
       * （`cf.view.title` / `countdown.title`），这里不重复一份。
       */
      bar: {
        menuLabel: '图标栏菜单',
        moveLeft: '侧边栏移到左侧',
        moveRight: '侧边栏移到右侧',
      },
    },
  },
  en: {
    components: {
      menu: {
        title: 'Components',
        empty: 'No components installed — add them in Settings › App › Components.',
      },
      bar: {
        menuLabel: 'Activity bar menu',
        moveLeft: 'Move Sidebar to Left',
        moveRight: 'Move Sidebar to Right',
      },
    },
  },
}
