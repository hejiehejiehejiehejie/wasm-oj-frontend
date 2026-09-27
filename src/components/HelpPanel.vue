<script setup>
/**
 * HelpPanel —— 「帮助」这一组设置的正文。
 *
 * 原先是顶栏「?」按钮打开的右侧抽屉（按钮 + Teleport + 遮罩 + 滑入动画 + 「完成」按钮），
 * 2026-09 并入设置视图后只留正文：内容是 GROUPS 里的问答列表 + 完整指南链接。
 * 没有 props / emits —— 开关归设置页签管，所以这里也不再有 Esc 关闭那套键盘逻辑。
 */

// 帮助的全部内容。每条 = 问题名称 / 核心答案 / 操作要点。
// 文案与界面上的措辞保持一致（设置目录的分类名、按钮 title 都按实际 UI 抄），
// 改动 UI 文案时这里要跟着改；同一份内容也写在仓库 docs/使用手册.md 里。
// 另外根目录的 guide.html 是它的「完整版」，改这里要检查那一页是否还说得通。
const GROUPS = [
  {
    title: '常见操作',
    items: [
      {
        name: '如何在本地运行 C++',
        role: '把编译与运行搬到本机浏览器里：代码不出本机，断网也能跑。',
        points: [
          '点侧边栏页头的齿轮图标打开「设置」页签，在「本地运行环境」里给 C++ 点「下载」，等按钮变成「已就绪」（约 50MB，只下一次）',
          '在设置的「评测」里把评测引擎选成「本地 WASM 沙箱」——它不需要填服务地址',
          '按 ⌘/Ctrl + Enter，或点「评测样例」面板页脚那颗 ▶',
          'C++ 与 Python 3 都走本地运行时；Python 直接解释执行，不需要编译',
        ],
      },
      {
        name: '如何切换侧边栏面板 / 折叠侧边栏',
        role: '侧边栏把「资源管理器」与「评测样例」收在同一栏里，页头左侧的图标按钮切换（第三颗齿轮打开编辑器里的设置页签）；整栏可以收起，把空间让给编辑器。',
        points: [
          '点侧边栏页头左侧的「资源管理器」/「评测样例」图标按钮切换内容，文件树的展开状态与样例输入都不会丢',
          '点页头左侧的齿轮图标打开 / 关闭编辑器里的「设置」页签',
          '双击两栏中间的分隔条：收起 / 展开整栏',
          '按住分隔条往边缘拖，拖到贴边即自动收起；收起后往外拖出展开',
          '用 Tab 聚焦分隔条后按 ← / → 微调宽度',
          '点运行（⌘/Ctrl + Enter，或「评测样例」面板页脚那颗 ▶）时，侧边栏会自己展开并切到「评测样例」，确保看得到结果',
          '想把侧边栏换到左侧，在设置的「布局」里把「侧边栏位置」换成「左侧」',
        ],
      },
      {
        name: '本地运行代码性能的说明',
        role: '首次最慢，之后只付运行开销；耗时只计「程序运行」那一段，不含编译与排队，页头取当轮最慢用例。',
        points: [
          '首次运行先下载约 50MB 工具链，只下一次；之后常驻本机，断网也能编译运行',
          '同一份代码跑多个用例只编译一次，第 2 个起只付运行开销；改完代码的第一枪会明显慢些，属正常。**这部分受本机性能影响，不承诺固定倍率**',
          '预编译头（PCH）开销：后台把最常用的 5 个 STL 头预先编译好，省掉每次编译重复解析它们的时间。生成排在首次运行之后的空闲时间，且等当前编译跑完才开工，会额外占用十几 MB 内存和一份约 9MB 的系统头文件副本',
          'PCH 生成预算 3 分钟；机器扛不住（内存不足 / cc1 卡死）会在本机记为不支持、此后不再尝试，用例照常走普通编译',
          'PCH 存在本机（约 10–20MB）；与当前编译选项对不上时自动退回普通编译、不会报错；换工具链版本后旧存档自动作废并重新生成',
          '以上只发生在本地沙箱；切到 Piston / Judge0 时速度取决于所连服务与网络',
        ],
      },
    ],
  },
]

// 正文里用 **…** 标记加粗。不走 v-html：文案里会出现 <vector> 这类头文件名，
// 交给 HTML 解析会被当成标签吃掉。
function segments(point) {
  return String(point)
    .split(/\*\*(.+?)\*\*/g)
    .map((text, index) => ({ text, bold: index % 2 === 1 }))
    .filter((part) => part.text !== '')
}
</script>

<template>
  <div class="help-content">
    <section v-for="group in GROUPS" :key="group.title" class="help-group">
      <h3 class="help-group__title">{{ group.title }}</h3>

      <ul class="help-list">
        <li v-for="item in group.items" :key="item.name" class="help-item">
          <p class="help-item__name">{{ item.name }}</p>
          <p class="help-item__role">{{ item.role }}</p>
          <ul class="help-item__points">
            <li v-for="point in item.points" :key="point">
              <!-- 正文里用 **…** 标记加粗。不走 v-html：文案里会出现 <vector> 这类
                   头文件名，交给 HTML 解析会被当成标签吃掉 -->
              <span
                v-for="(part, index) in segments(point)"
                :key="index"
                :class="{ 'is-bold': part.bold }"
              >{{ part.text }}</span>
            </li>
          </ul>
        </li>
      </ul>
    </section>

    <a class="guide-link" href="/guide.html">完整使用指南</a>
  </div>
</template>

<style scoped>
.help-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 2px 18px 16px;
}

.help-group__title {
  margin: 0 0 8px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--text-dim);
}

.help-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

/* 每条功能一张卡：名称 / 作用 / 操作要点，三层信息靠字号与颜色拉开层次 */
.help-item {
  padding: 9px 11px;
  border: 1px solid var(--border-soft);
  border-radius: 7px;
  background: var(--bg-panel);
}

.help-item__name {
  margin: 0 0 3px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text);
}

.help-item__role {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.55;
  color: var(--text-dim);
}

.help-item__points {
  margin: 6px 0 0;
  padding-left: 15px;
  list-style: disc;
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-faint);
}

.help-item__points li + li {
  margin-top: 2px;
}

.help-item__points .is-bold {
  font-weight: 700;
  color: var(--text-dim);
}

/* 指向根目录 guide.html：设置里只放精简版，完整版是那一页 */
.guide-link {
  align-self: flex-start;
  font-size: 12.5px;
  color: var(--accent);
  text-decoration: none;
}

.guide-link:hover {
  color: var(--accent-hover);
  text-decoration: underline;
}
</style>
