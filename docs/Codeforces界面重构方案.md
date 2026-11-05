# Codeforces 界面重构方案

- 日期：2026-10-29
- 依据：`Notes_261029_030955(1).docx`（设计诊断 + 单页原型）、`Notes_261029_031415.docx`（按目录拆分的 CSS / Vue 草案）
- 基线备份：`backup/cf-ui-20261029-0317/`（含清单与回滚方式，见本文第 10 节）

---

## 0. 结论

**吸收两份文档的「信息架构与交互动线」，不吸收它的「视觉令牌体系」，也不照抄其中的代码。**

具体三句话：

1. 重构对象只有 6 个 Vue 组件 + 1 份共享样式（`src/styles/cf-console.css`）；`src/cf/*`、`services/cfClient.js`、5 个 `useCf*` 的取数与轮询逻辑一律不动。
2. 文档新建的一整套 `--cf-*` 颜色令牌与项目已有的 `--bg-*` / `--text-*` / `--accent-*` 是**两套并行体系**，照搬会让浅色主题（`:root[data-theme='light']`）对 Codeforces 页失效。所有颜色改写为项目令牌（映射表见第 7 节）。
3. 两份 docx 里的代码在 Word 转换中已被破坏（见 3.2），不能作为可运行原型直接迁入，只能按「意图」重写。

---

## 1. 目标与边界

### 1.1 要解决的三件事

| 痛点（文档诊断） | 本方案对应动作 |
| --- | --- |
| 三个子面板像拼凑的页面，缺少全局上下文 | 抬头的三模式切换保留，右侧补全局 `myHandle` 胶囊与 Companion 能力指示；赛程页签挂 Live 角标 |
| `myHandle` 与 Companion 状态散落 | `myHandle` 已经由 `src/cf/myHandle.js` 做成模块级单例（三处消费同一份），本轮只把它**显示**到抬头，不新建状态 |
| 跨页动线断裂 | 赛程行 → 比赛（已通）；补齐「比赛题目 → 提交页按题目过滤」这一条（组件内事件 + 共享过滤态） |

### 1.2 不改动（硬边界）

- `src/cf/cfWorker.js`、`src/cf/cfClient.js`、`src/cf/pick.js`、`src/cf/contest.js`、`src/cf/standings.js`、`src/cf/submissions.js`
- `src/composables/useCfPicker.js` / `useCfContest.js` / `useCfSchedule.js` / `useCfStandings.js` / `useCfSubmissions.js` 的取数、轮询、缓存逻辑（只允许新增**只读**导出，例如赛程 Live 计数）
- 例外（2026-10-29 确认）：为题目表的「通过人数」，允许在 `cfWorker.js` 的 `loadContestProblems` 内复用**同一次**已拉取的榜单顺手算出 `solved` 并随题目缓存 —— 纯增量，不改请求策略、缓存 TTL 与消息协议
- `src/composables/useCompanionBridge.js`（能力协商照旧使用，不改成单一 `companionOnline` 布尔）
- Tauri / 云端同步 / 设置页的任何结构

---

## 2. 现状基线（重构前的真实结构）

| 文件 | 行数 | 当前职责 |
| --- | --- | --- |
| [CfCodeforcesPanel.vue](file:///Users/hejie/Code/998244353/unnamed/src/components/CfCodeforcesPanel.vue) | 145 | 壳层：46px 透明抬头（品牌 + 抽题/赛程/比赛）+ `position: relative` 的 stage |
| [CfPickerPanel.vue](file:///Users/hejie/Code/998244353/unnamed/src/components/CfPickerPanel.vue) | 639 | 单列 840px：一张表单卡片 + 结果列表 |
| [CfContestSchedule.vue](file:///Users/hejie/Code/998244353/unnamed/src/components/CfContestSchedule.vue) | 527 | 按 `running / upcoming / finished` 三段渲染行，行内倒计时、报名 / VP 列 |
| [CfContestPanel.vue](file:///Users/hejie/Code/998244353/unnamed/src/components/CfContestPanel.vue) | 780 | hero 两态（大输入框 ⇄ 比赛名 + 铅笔）+ 题目/排行榜/提交三子页签 |
| [CfStandingsTable.vue](file:///Users/hejie/Code/998244353/unnamed/src/components/CfStandingsTable.vue) | 711 | 分页 100 行、封榜标、粘性「我」条、跳到我、非正式名次（扩展） |
| [CfSubmissionList.vue](file:///Users/hejie/Code/998244353/unnamed/src/components/CfSubmissionList.vue) | 406 | 最新 200 条、只看我、题目 / 判定本地筛选、5s 增量轮询 |
| [cf-console.css](file:///Users/hejie/Code/998244353/unnamed/src/styles/cf-console.css) | 14 KB | 六个组件共用的版式语汇（无框、留白、淡线、10px 圆角） |
| [base.css](file:///Users/hejie/Code/998244353/unnamed/src/styles/base.css) | 36 KB | 全局令牌，深色默认 + `:root[data-theme='light']` 翻转 |

**现有设计语汇**：不铺卡片、不画网格；靠留白与 `--border-divider` 淡线分区；正文 `--text` / 标签 `--text-dim` / 元数据 `--text-faint` 三级灰；主操作是低透明度 `--accent-face` 面，颜色只落在文字与图标上；控件 10px 圆角，小徽标 6px。

**已经具备、不要重造的能力**（文档把它们当成新功能）：

- 榜单：100 行分页、封榜标、跳到我、非正式选手名次（扩展）
- 提交：只看我、题目 / 判定筛选、5s 增量轮询
- 赛程：首屏静默拉取、报名 / VP 能力列、二次确认卡片
- 比赛：空态大输入框 ⇄ 载入态比赛名（FLIP 动画）、铅笔切回、子页签
- 抽题：难度区间 + 常用区间芯片 + 步进器 + 两个开关 + 微光面 CTA（`--accent-face` / `--accent-face-hover` + `--accent-text`，2026-10-29 起照「运行全部」）

---

## 3. 对两份文档的评估

### 3.1 可直接吸收（骨架与动线）

1. 抬头三栏：品牌 / 三模式胶囊 / 全局 `myHandle` + Companion 指示
2. 抽题「左控右果」：参数舱固定宽 + 结果流自适应
3. 赛程三段看板：进行中（呼吸灯 + 进度）、即将开始（倒计时 + 报名）、最近结束（VP / 载入）
4. 比赛两态：空态中央大输入框 ⇄ 载入态顶部比赛横幅（铅笔切回）
5. 跨页动线：赛程行一键进比赛；比赛题目的通过人数联动提交过滤
6. 数字统一等宽 + `tabular-nums`（题号、Rating、倒计时、耗时、名次）
7. 语义色克制：判定短码用柔光胶囊，不铺整行红绿
8. 空态 / 加载态的「黄金分割点」定位（项目已有 `.cf-blank`，继续沿用）

### 3.2 不能照搬（硬伤，有据）

| 问题 | 证据 | 处理 |
| --- | --- | --- |
| **docx 里的代码已损坏** | `word/document.xml` 里大量 `]]>`、`<` 被转义/剥离，Vue 模板只剩文本节点（如 doc1 第 62、106–172 行） | 不复制粘贴；按意图重写模板 |
| **令牌双轨** | 文档新建 `--cf-bg-canvas / --cf-text-primary / --rank-*`，且只在 `:root` 与 `[data-theme="dark"]` 定义一次，没有浅色支；项目靠 `:root[data-theme='light']` 翻转 `--bg-*` | 全部改写为项目令牌，见第 7 节 |
| **Companion 能力被压成布尔** | 文档用 `companionOnline`；现有 `useCompanionBridge` 有 `canReadContestStates / canRegisterContest / canStartVirtual / canScrapeContest` 四个独立能力，赛程「整列出现 / 消失」依赖最后三者 | 保留四个能力位，抬头只显示一个聚合指示灯 |
| **原型残留** | `alert()`、`console.log('Import problem:')`、写死的 4,200 行榜单 / 假提交数据 | 一律不进生产代码 |
| **抬头高度与设置页不一致** | 文档 54px 实心条 + 底边线；项目当前 46px 透明底、不画线，与设置页页头同档 | 维持 46px 透明抬头 |

### 3.3 与既往决策冲突（已按 2026-10-29 决策处理）

| 文档主张 | 现状 / 既往决定 | 建议 |
| --- | --- | --- |
| 比赛题目表加「时限 / 分值 / 通过人数」列 | CF 接口不直接给这三个字段；但 `loadContestProblems` 为了拿题目本来就会拉一次榜单，`src/cf/standings.js` 的 `problemStatistics()` 可顺手算出每题通过人数。10-28 曾要求去掉标签与难度，题号/题名两列不变 | **只加「通过人数」一列**（2026-10-29 确认），时限/分值不加；数字由同一次榜单请求算出并随题目缓存，不额外发请求 |
| 提交行点开「代码详情侧边抽屉」 | `CfSubmissionList.vue` 注释写明 P0 不做站内详情页，行是链去 CF；`cfSubmissionDetail` 不存在 | 本轮不做；留作后续扩展 |
| 抬头加「深浅主题切换」 | 主题入口在设置页（`EditorSettingsPanel.vue`），全局只有一处 | 不新增第二入口，除非你要求快捷开关 |
| 抽题用「标签芯片池」点选 | 现为自由文本 + `pick.js` 归一化匹配，没有现成标签字典 | 保留自由输入；标签芯片属新增功能，可另立需求 |

---

## 4. 设计决策

| 编号 | 决策 |
| --- | --- |
| D1 | **单一令牌源**：所有颜色/字体只引用 `base.css`，不新增 `--cf-*` 前缀；只允许新增 7 个 CF 段位色令牌，深浅各一套 |
| D2 | **版式沿用项目语汇**：无框、留白、1px 淡线（`--border-divider`）、10px 圆角；不做文档里的「卡片 + 大阴影 + 粗边框」 |
| D3 | **主 CTA 用与「运行全部」同一种透明微光面**（2026-10-29 用户要求）：`--accent-face` / `--accent-face-hover` + `--accent-text`；原先的实心 `--picker-cta-*` 已随改动删除 |
| D4 | **语义色映射**：AC → `--ok` / `--ok-face`；WA → `--fail` / `--fail-face`；TLE → `--warn` / `--warn-face`；运行中 → `--info` / `--info-face` |
| D5 | **数字等宽**：题号、Rating、倒计时、名次、分数、提交号、耗时/内存统一 `var(--mono-font)` + `font-variant-numeric: tabular-nums` |
| D6 | **内容列宽分级**：表单类仍 840px；榜单/比赛列表/抽题双栏放宽到 1120px（新增 `.cf-page--wide`） |
| D7 | **i18n 不绕开**：所有新文案进 `src/i18n/messages/cf.js` 的 `zh-CN` 与 `en` 两支，禁止硬编码中文 |
| D8 | **响应式**：沿用 `@container cf` 断点（34rem 收窄、22.5rem 极窄）；抽题双栏在 34rem 以下折为单列 |
| D9 | **动效克制**：只保留呼吸灯（2s）、FLIP 形态切换、行悬停 0.14s；不做滚动入场/大位移 |
| D10 | **题目表只加一列「通过人数」**：由 `loadContestProblems` 复用同一次榜单请求算出并随题目缓存；进行中比赛标注「截至载入时」 |

---

## 5. 目标信息架构

```
┌────────────────────────────────────────────────────────────────────────────┐
│  ▮▮▮ Codeforces   ● cfReady · 9,842 题     抽题 | 赛程 •LIVE | 比赛 #2028    │
│                                              [ handle ⌄ ] [ 扩展 ● ]        │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  ── 模式一 抽题 ────────────────   ── 模式二 赛程 ───────────────────────    │
│  │ 参数舱 330px │ 结果流 1fr  │   │ 更新于 刚刚 · 扩展能力提示          │   │
│  │ 难度区间     │ 平均难度 1700│   │ 进行中 (1)                          │   │
│  │ 常用区间 ×5  │ 匹配池 418   │   │ ▎Round 983  02:30 01:18:42 进入 →   │   │
│  │ 标签         │ ↻ 换一批     │   │ 即将开始 (2)                        │   │
│  │ 数量 1–10    │ 全部导入     │   │ Round 172  02:00 2天 02:31  报名    │   │
│  │ 两个开关     │ ┌ 1999F 1900│   │ 最近结束 (5)                        │   │
│  │ [ 抽取 ]     │ └ + 导入    │   │ Round 982  ⚡ VP  查看赛况 →         │   │
│                                                                            │
│  ── 模式三 比赛 ── 空态                      载入态                          │
│        ┌──────────────────────┐      Round 983 (Div.1+2) ✎  ● 01:18:42     │
│        │ CF:// 粘贴链接或 ID ↵ │      题目(5) | 排行榜 | 提交记录   刷新于…  │
│        └──────────────────────┘      ┌──────────────────────────────────┐  │
│        快捷：#2028 · #105321          │ 题目列表 / 榜单 / 提交            │  │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. 视觉与交互规范（落到 `cf-console.css`）

### 6.1 表面与线条

- 页面底色 = `--bg-editor`（地面），不额外铺一层「画布色」
- 分区只靠 `--border-divider` 1px 淡线 + 24–32px 留白；不做表头整条底色
- 仅两种「面」允许出现：`--bg-panel`（参数舱 / hero 卡）、`--bg-card`（结果行悬停）
- 阴影只给空态 hero（`--card-shadow`），列表与表格一律无阴影

### 6.2 语义与数字

- 判定：`AC` 绿、`WA` 红、`TLE` 黄、`Running` 蓝，统一「12% 面 + 主色文字 + 6px 圆角」
- 段位：12% 柔光底 + 段位文字色 + 6px 圆点；新增令牌：
  `--rank-newbie / pupil / specialist / expert / cm / master / gm`（深浅各一套）
- 所有数字列右对齐或定宽居中，`tabular-nums`，轮询刷新零抖动

### 6.3 交互

- 行悬停：`--icon-hover-bg`，0.14s；不做位移
- 焦点：`inset 0 0 0 1px var(--focus)` + `0 0 0 3px var(--focus-ring)`（沿用 `.cf-input:focus`）
- 列表行可点：`role="button"` + `Enter` / `Space`（赛程已这样做，其余沿用）
- 窄容器：34rem 以下抽题双栏折单列；22.5rem 以下隐藏次要列（类型 / 时长）

---

## 7. 令牌映射表（文档 → 项目）

| 文档令牌 | 项目令牌 | 说明 |
| --- | --- | --- |
| `--cf-bg-canvas` | `--bg-editor` | 页面地面 |
| `--cf-bg-surface` | `--bg-panel` | 参数舱 / hero |
| `--cf-bg-elevated` | `--bg-card` | 行悬停 / 次级面 |
| `--cf-bg-hover` | `--icon-hover-bg` | 行悬停 |
| `--cf-bg-active` | `--bg-hover-soft` | 选中底 |
| `--cf-border` | `--border-divider` | 1px 淡线 |
| `--cf-border-strong` | `--border` | 输入框 / hero 描边 |
| `--cf-border-focus` | `--focus` | 焦点 |
| `--cf-text-primary/secondary/muted` | `--text` / `--text-dim` / `--text-faint` | 三级文字 |
| `--cf-ac-bg/-text` | `--ok-face` / `--ok` | AC |
| `--cf-wa-bg/-text` | `--fail-face` / `--fail` | WA |
| `--cf-warn-bg/-text` | `--warn-face` / `--warn` | TLE / 封榜 |
| `--cf-info-bg/-text` | `--info-face` / `--info` | 运行中 / 链接 |
| `--picker-cta-*` | 改用 `--accent-face` / `-hover` + `--accent-text` | 主 CTA（与「运行全部」同一套微光面） |
| `--cf-font-mono` | `--mono-font` | 等宽 |
| `--cf-font-sans` | `--ui-font` | 正文 |
| `--cf-shadow-sm` | 不引入 | 项目用淡线不用小阴影 |
| `--cf-shadow-lg` | `--card-shadow` | 仅 hero |
| `--rank-*`（7 支） | **新增** | 深浅两套都要写 |

---

## 8. 改造清单（按可独立验收的阶段）

> 状态（2026-10-29 03:50）：P0–P6 全部完成。各省略 / 调整见本节末尾「实施结果与偏差」。

### P0 备份（已完成）

- 产物：`backup/cf-ui-20261029-0317/`（6 个组件 + 2 份 CSS + i18n + 6 个 composable + 完整 patch + `MANIFEST.md`）
- 记录：HEAD `ffc3e2c`，工作区相对 HEAD 有 17 个文件未提交（备份的是 10-28 改版，不是 HEAD）
- 验收：`cp -R backup/cf-ui-20261029-0317/src/. src/` 能完整还原

### P1 壳层与共享语汇

**文件**：`CfCodeforcesPanel.vue`、`src/styles/cf-console.css`、`src/i18n/messages/cf.js`

- 抬头保持 46px 透明：左「品牌 + 状态胶囊」、中三模式、右「handle 胶囊 + 扩展指示」
- 状态胶囊：读 `services/cfRuntime.js` 的 `cfReady`，经 `onCfProgress` 显示阶段文案（下载/已就绪）
- `myHandle`：直接复用 `src/cf/myHandle.js` 的 `cfHandle`，抬头显示为胶囊，点开小面板编辑、失焦落盘；不新增 props
- 扩展指示：聚合 `canCheckCf` / `canRegisterContest` / `canScrapeContest` 为「在位 / 离线」两点色 + tooltip 列出能力
- 赛程页签 Live 角标：`useCfSchedule.js` 新增**只读**导出 `liveCount`（模块级 `computed`），不新增请求
- `cf-console.css` 新增原子类：`.cf-mono`、`.cf-status-dot`、`.cf-live-badge`、`.cf-page--wide`、`.cf-toolbar`
- **验收**：三模式切换正常；容器 ≤34rem 时标题与 handle 文本收起为图标；不出现任何硬编码色值

### P2 抽题双栏

**文件**：`CfPickerPanel.vue`

- 桌面：`grid-template-columns: 330px 1fr`；参数舱独立滚动，CTA 底部吸附；结果区独立滚动（页面本身不再滚）
- 右舱：结果工具条（平均难度 / 匹配池 / 换一批 / 全部导入）+ 结果行（题号、题名、标签、Rating、单题导入）
- 34rem 以下：单列，参数在上、结果在下；CTA 变通栏（不吸附）
- 不动 `useCfPicker` 与表单字段语义
- **验收**：抽屉式双向滚动不与编辑区滚动打架；结果为空 / 抽取中 / 失败的三种态都在右舱原位，不跳位

### P3 赛程三段看板

**文件**：`CfContestSchedule.vue`

- 顶部 meta 条：`更新于 X` + 能力提示（按 `canReadContestStates / canRegisterContest / canStartVirtual` 组合文案，不用布尔）
- 三段标题：`进行中 / 即将开始 / 最近结束`（沿用现有 `running / upcoming / finished`）
- 进行中行：左侧 2px 呼吸条 + 行底 `--ok-face` 渐变 + 进度条（开赛→结束）+ 剩余时间等宽
- 即将开始：等宽倒计时 + 报名（`cf-mini`，能力不在时整列不出现）
- 最近结束：`⚡ 开启 VP` + 点击行载入比赛
- 保持现有二次确认卡片（报名 / VP 不可逆）
- **验收**：无扩展时版式与改动前一致；倒计时每秒更新不引起行高变化；窄容器隐藏「类型 / 时长」

### P4 比赛舱

**文件**：`CfContestPanel.vue`

- 空态：hero 卡（`--bg-panel` + `--border` + `--card-shadow`），输入框 14px、主按钮 `--accent-face` + `--accent-text`；下方快捷胶囊=赛程里正在进行的场次（来自 P1 的 `liveCount` 同源数据）
- 载入态：比赛名 + 铅笔（已有）+ 赛事类型徽标（`contest / gym / group`，来自 `spec.kind`）+ 倒计时（等宽）
- 子页签保持 `.cf-tab`；刷新动作与「刷新于 X」仍在右端（已有）
- 题目列表：题号 + 题名 + **通过人数** + 导入。时限 / 分值不加（见 3.3）
- 通过人数实现：`loadContestProblems` 内复用已拉取的榜单行，用 `problemStatistics()` 算出 `solved` 后写进题目对象一起缓存；**不新增网络请求**，已缓存过的比赛也能直接显示
- 通过人数口径：正式参赛者、按载入时的榜单快照；进行中比赛在列头标「截至载入时」，榜单页仍是实时值
- 新增联动：点击通过人数 → 切到提交页并带 `problemIndex`（提交组件已支持 `setProblem`，通过父组件事件调用）
- **验收**：FLIP 形态切换不闪；铅笔切回输入框时原比赛数据不丢；联动后提交页筛到该题且「只看我」仍生效；通过人数列右对齐、等宽、翻页不抖

### P5 榜单 / 提交视觉统一

**文件**：`CfStandingsTable.vue`、`CfSubmissionList.vue`

- 榜单：表头去底色、改 11px `--text-faint`；题格 `AC/首杀/封榜` 三态用 D4 语义色；「我」行用 `--accent-face-soft`；粘性「我」条与分页器沿用
- 提交：判定码统一 6px 圆角胶囊；耗时/内存等宽右对齐；筛选条与列表同一条左轨
- 不重写分页、轮询、筛选逻辑
- **验收**：翻页/轮询时列宽不抖；封榜态与普通态只有颜色差异

### P6 回归与快照

- 跑 `npm run verify`（布局/持久化回归）
- 手动清单：深浅主题 × 三种模式 × 空态/载入态 × 有无扩展 × 34rem/22.5rem 窄容器
- 每个阶段结束打一次目录快照 `backup/cf-ui-P<n>-<时间>/`

### 实施结果与偏差（2026-10-29 03:50）

| 阶段 | 状态 | 实际情况 / 与计划的偏差 |
| --- | --- | --- |
| P0 | 完成 | 基线快照 `backup/cf-ui-20261029-0317/`（整目录 + patch + MANIFEST） |
| P1 | 完成 | 抬头三栏落地；状态做成 5px 状态点（`ready / busy / idle`）而非写字的胶囊，阶段文案进 `title`；扩展指示为一点 + 能力列表 tooltip；Live 计数导出名为 `cfRunningCount`（计划里叫 `liveCount`） |
| P2 | 完成 | 双栏 330px + 结果流；**未**做「两舱各自滚动」，改为整页单滚动 + 桌面左舱 `sticky`、48rem 以下解除 —— 避免双层滚动条 |
| P3 | 完成 | 进行中行：渐变底 + 2px 呼吸条 + 1px 进度线（`progressOf`），`prefers-reduced-motion` 降级 |
| P4 | 完成（部分） | 通过人数由 `loadContestProblems` 复用同一次榜单快照算出并随题目缓存，零额外请求；**未做**计划里的「空态快捷胶囊（进行中场次）」与「点通过人数跳提交页筛选」—— 前者超出「只加通过人数」的范围，后者与 2026-10-28 用户「其他都不用加」的决定冲突，留待后续 |
| P5 | 完成（无源码改动） | 榜单 / 提交的目标形态在 10-28 版已具备，核对通过：表头 11px `--text-faint`、题格四态语义色、「我」行 `--accent-face-soft`、判定 6px 圆角胶囊、列宽在 1120px 与窄容器下不抖 |
| P6 | 完成（含既有失败） | `npx vite build` 通过；真实数据核对（比赛 2276）排行榜 / 提交列对齐、520px 级无页面级横向溢出、console 无 error；`npm run verify` 的 A / E / G / H 为编辑器与评测面板的既有环境性失败（B / C / D / F 通过），与本次改动无关 |

阶段快照：`backup/cf-ui-P1-P2-20261029-0350/`、`backup/cf-ui-P3-P4-20261029-0420/`、`backup/cf-ui-P5-P6-20261029-0350/`（末者仅记录 P5 核对时点，P5 未改源码）。

---

## 9. 跨页动线与状态归属

| 动线 | 机制 | 归属 |
| --- | --- | --- |
| 赛程行 → 比赛面板 | `@select` → `CfCodeforcesPanel.openContest()` → `contestPanel.openContest()`（已通） | 壳层 |
| 抬头 `myHandle` → 抽题排除 / 榜单跳到我 / 提交只看我 | `src/cf/myHandle.js` 模块级 `cfHandle`（已通，无需提升 props） | 共享模块 |
| 扩展能力 → 赛程报名列 / 题目抓样例 | `useCompanionBridge` 四个 capability computed（已通） | 共享模块 |
| 比赛题目 → 提交页按题目过滤 | 父组件持 `filterProblem` ref，`CfSubmissionList` 暴露 `setProblem()` | 比赛面板内部 |
| 抬头 Live 角标 → 赛程数据 | `useCfSchedule` 新增只读 `liveCount` | 赛程 composable |

---

## 10. 风险与回滚

| 风险 | 触发点 | 缓解 |
| --- | --- | --- |
| 双栏后出现「页面 + 结果」双滚动条 | P2 | 父容器 `height:100%`、`overflow:hidden`，只有两舱各自滚动 |
| 抬头塞入 handle 后窄宽度挤压三模式 | P1 | 34rem 断点收起文本、保留图标；handle 改弹出编辑 |
| 新增段位色破坏浅色对比度 | P1/D4 | 深浅两套分别取值，按 12% 面 + 文字色校验对比度 |
| 赛程 Live 角标引入跨组件请求 | P1 | 只读 `computed`，不新增 `cfContests()` 调用 |
| 文档代码被误当成品粘贴 | 全程 | 本方案只按意图重写；任何 `--cf-*` 变量进代码即视为错误 |

**回滚**：`backup/cf-ui-20261029-0317/` 提供整目录还原、单文件还原、patch 还原三种方式（见 `MANIFEST.md`）。后续每个阶段再打独立快照，保证任意一步可退。

---

## 11. 已确认决策（2026-10-29）

1. **内容宽度**：分级 —— 榜单 / 比赛 / 提交放宽到 1120px，抽题与表单保持 840px
2. **抬头 `myHandle`**：显示为胶囊，点开小面板编辑，不做常驻输入框
3. **Rating / 段位**：本轮不做（需改 Worker 账号缓存结构，单独一轮再加）
4. **提交详情抽屉**：本轮跳过，提交行继续链去 CF
5. **抽题标签**：保持自由文本输入，不做标签芯片池
6. **题目表**：只加「通过人数」一列，时限 / 分值不加
