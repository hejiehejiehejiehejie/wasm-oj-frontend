# WASM OJ 前端 · 交接文档

面向「接下来要改前端样式」的接手人。当前代码**已跑通**：本地 WASM 沙箱能编译运行 C++、判题（含 TLE）、主题与布局都能用。

## 0. 一分钟上手

- 目录：`/Users/hejie/Code/BISHE`
- **不是 git 仓库**：改动没有版本兜底，动大样式前建议先手动备份文件（或先 `git init`）。
- 启动：`cd /Users/hejie/Code/BISHE && npm run dev` → http://localhost:5199
- 技术栈：Vue 3（Composition API + `<script setup>`）+ Vite 8 + **纯原生 CSS**（没有 Tailwind，也没有任何组件库 / UI 库）。
- 唯一的重量级第三方依赖是 `monaco-editor` 和 `@runno/wasi`（浏览器里跑 clang）。新增 npm 包要先讨论。

## 1. 硬约束（改样式时最容易被打破的几条）

| 约束 | 说明 |
| --- | --- |
| 只有两套主题 | `cph-dark`（默认）/ `cph-light`，主题 id 同时用于 Monaco 自定义主题名 |
| 颜色只走 CSS 变量 | 组件里**不许**出现写死的十六进制颜色；所有色值定义在 `src/styles/base.css` |
| 新增变量必须定义两遍 | `:root` 和 `:root[data-theme='cph-light']` 都要给值，否则浅色主题下会串色 |
| 禁止第三方 UI 库 | 抽屉 / 弹层 / 下拉全部原生 CSS + Vue + `Teleport` |
| 顶栏按钮不能进 Teleport | 抽屉本体 Teleport 到 `body`，**触发按钮必须留在顶栏内**，否则脱离 flex 布局被挤出视口 |
| flex 容器的子元素要显式拉伸 | 布局里 `.pane > *` 必须 `flex: 1 1 auto; min-width: 0`，否则子组件收缩到内容宽度 |
| Monaco 只能动态改 | 设置项变化走 `editor.updateOptions()` / `monaco.editor.setTheme()`，**不要重建实例** |
| 设置要持久化 | 统一用 `src/composables/usePersistentRef.js`（存的是 JSON 字符串，见第 7 节的坑） |

## 2. 与界面相关的文件

```
index.html
vite.config.js                  # COOP/COEP 响应头（本地沙箱的硬前提，别动）
src/
  main.js
  monaco-setup.js               # Monaco 的 cph-dark / cph-light 两套自定义主题
  styles/base.css               # ★ 所有 CSS 变量 + 全局元素样式，改配色只改这里
  App.vue                       # 布局骨架（workspace / pane / splitter）+ 全局状态
  composables/usePersistentRef.js
  components/
    TopBar.vue                  # 顶栏：语言/引擎/连接/布局/设置/本地环境/运行（50px 高）
    EditorPane.vue              # Monaco 容器 + 文件页签
    EditorSettingsPanel.vue     # 右侧设置抽屉（Teleport，按钮在顶栏）
    LocalRuntimePanel.vue       # 右侧本地运行环境抽屉（Teleport，按钮在顶栏）
    TestPanel.vue               # 右侧评测面板：页头（verdict/耗时/时限）+ 用例列表 + 页脚运行按钮
    TestCaseCard.vue            # 单个用例卡片：徽标 / hint / 耗时 / 输入框 / 输出块
    AppIcon.vue                 # 内联 SVG 图标集（name 取图标名）
  services/                     # 判题逻辑，改样式基本不碰
```

## 3. 布局骨架（改布局 / 尺寸看这里）

`App.vue` 模板（`src/App.vue:434` 起）：

```
div.app（column，100% 高）
├─ TopBar                    高度 50px，flex: 0 0 50px（TopBar.vue:207）
└─ main.workspace            flex: 1 1 auto; min-height: 0; padding: 6px; 背景 --bg-editor
   │                         类名状态：is-left / is-dragging / is-swapping / is-collapsed
   ├─ section.pane.pane--editor   内联 flexBasis = editorShare%
   │    └─ EditorPane
   ├─ div.splitter                role=separator，键盘左右微调，双击折叠
   │    ├─ span.splitter__line    悬停/拖拽才亮（2px）
   │    └─ span.splitter__dots    三点抓手，常驻可见
   └─ section.pane.pane--tests    内联 flexBasis = (100 - editorShare)%，v-show 控制显隐
        └─ TestPanel
```

关键规则（`src/App.vue:506` 起）：

- `.workspace` 只靠 `flex-direction` 在 `row` / `row-reverse` 之间对调，**DOM 不重建**（布局切换还有 View Transitions 动画）。
- 两栏 `flex-basis` 之和恒为 100%：编辑器栏拿 `editorShare%`，测试栏拿 `100 - editorShare%`。若给两栏留出 basis 之外的剩余空间，会被 `flex-grow` 平分，分隔条就只以一半幅度跟手——**改这两条 basis 时要一起想**。
- `.pane` 是独立的圆角卡片（`border-radius: 8px; overflow: hidden`），让 Monaco 画布和面板头脚的方角被裁掉。
- `.splitter` 视觉 1px 细线、热区 12px（负外边距各压进卡片 3px，卡片净间距 6px）；折叠状态下热区加宽到 24px。
- 折叠阈值在 `App.vue` 的拖拽逻辑里（贴边 32px 内折叠、离开边缘 60px 展开），改视觉宽度时注意别和阈值打架。

## 4. 主题与 CSS 变量

- 主题落在 `<html data-theme="...">` 上（`App.vue:71` 的 watch），由 `base.css` 的变量接管；不带 `data-theme` 时即深色。
- Monaco 侧用同一批 id 的自定义主题（`src/monaco-setup.js`），`cph-light` 的底色要和 `--bg-panel` 对齐，否则编辑区和面板会出现两块不同的白。
- 变量分组（`src/styles/base.css`）：

| 分组 | 变量 |
| --- | --- |
| 底色层次 | `--bg-editor` 页面留白 / `--bg-panel` 卡片面板 / `--bg-panel-head` 面板头脚 / `--bg-card`、`--bg-card-head` 用例卡片 / `--bg-chrome` 顶栏 / `--bg-tab-active` |
| 浮层与控件 | `--bg-raised` 抽屉弹层 / `--bg-control`、`--bg-control-hover` 按钮下拉 / `--bg-input` 输入框 / `--bg-hover` / `--bg-selection` |
| 描边 | `--border`、`--border-soft` |
| 文字 | `--text`、`--text-dim`、`--text-faint`、`--text-on-accent`、`--statusbar-text` |
| 强调 | `--accent`、`--accent-hover`、`--accent-strong`、`--accent-deep`、`--focus`（焦点框与分隔条高亮） |
| 运行按钮 | `--run-green`、`--run-green-hover` |
| 状态色 | `--ok`、`--fail`、`--err`、`--info`、`--warn` + 浅底变体 `--ok-soft`、`--fail-soft`、`--danger-bg`、`--danger-bg-hover`、`--danger-text` |
| 提示块 | `--info-soft-bg`、`--info-soft-border`、`--info-soft-bg-hover`、`--info-soft-border-hover`、`--info-soft-text` |
| 用例卡片 | `--case-border`、`--case-chip-bg` |
| 分隔条 | `--splitter-dot`（三点抓手颜色） |
| 滚动条 | `--scrollbar-thumb`、`--scrollbar-thumb-hover` |
| 字体 | `--ui-font`、`--mono-font` |

组件样式入口：

| 组件 | 主要选择器 |
| --- | --- |
| `App.vue:506` | `.app` `.workspace` `.pane` `.splitter` 及其状态类 |
| `TopBar.vue:205` | `.topbar` `.select` `.popover` 及引擎/连接 chip（`height: 50px` 在这里） |
| `TestPanel.vue:99` | `.panel` `.panel__head` `.panel__heading` `.panel__title` `.verdict[data-tone]` `.elapsed` `.limit` `.select` `.panel__foot` `.run-inline` |
| `TestCaseCard.vue:148` | `.card[data-status]` `.card__head` `.badge[data-status]` `.hint` `.metric` `.icon-btn` `.card__body` `.ta`（输入）`.out`（输出） |
| `EditorPane.vue:158` | `.tab` `.tab__icon` |
| `EditorSettingsPanel.vue:162` | `.icon-button` `.panel-drawer*` `.select` |
| `LocalRuntimePanel.vue:181` | `.panel-button` `.panel-drawer*` `.runtime-row*` `.panel-note` |
| `base.css:141` 起 | `body`、`button`、`input/textarea/select`、滚动条、`:focus-visible`、`prefers-reduced-motion` |

## 5. 改样式时的几个坑

1. **状态色是三元组**：卡片/徽标用 `data-status="passed|failed|error|running"`（`TestCaseCard.vue`），面板小结用 `data-tone="passed|failed|error|info"`（`TestPanel.vue`）。加新状态要同时补 CSS 分支。
2. **Monaco 文字用 NBSP 渲染**：用脚本读 `.view-lines` 的文本时，空格是 `\u00a0`（charCode 160），`includes('def solve')` 这类断言永远匹配不上。
3. **Monaco 的 `.minimap` DOM 节点始终存在**，关闭时宽度为 0；判断"有没有小地图"要看 `getBoundingClientRect().width`，不是 `querySelector`。
4. **localStorage 里存的是 JSON 字符串**：`cph.panelPosition` 的值是 `"left"`（带引号）。直接比较原始字符串会误判。
5. **面板折叠是 `v-show`**，测试栏 DOM 一直在（分隔条要能用鼠标/键盘把面板拖回来）。
6. `@media (prefers-reduced-motion: reduce)` 会全局压掉动画，新增动画不用额外处理。
7. 抽屉有两个（设置 / 本地运行环境）**互斥**，开一个会关另一个；改抽屉宽高/动画时别破坏这个联动。

## 6. 已持久化的状态（加设置项时照抄这套）

| key | 内容 | 位置 |
| --- | --- | --- |
| `cph.editorSettings` + `cph.editorSettingsVersion` | 字体、tab、换行、小地图、**主题**（`theme`） | `App.vue:24-35` |
| `cph.panelVisible` / `cph.panelPosition` | 测试面板是否展开 / 面板在左还是右 | `App.vue:13-15` |
| `cph.editorShare` | 两栏比例（%） | `App.vue:17` |
| `cph.timeLimitMs` | 全局时限（毫秒，只计运行段） | `App.vue:20` |
| `cph.language` / `cph.drafts` / `cph.testCases` / `cph.engine` / `cph.judgeBases` | 语言、各语言草稿、用例、引擎、服务地址 | `App.vue` |
| `cph.localRuntime.clangReady` | C++ 本地工具链是否已拉取 | `LocalRuntimePanel.vue` |

写值统一走 `usePersistentRef(key, defaultValue)`；`editorSettings` 因为要版本迁移，单独用 deep watch 存。

## 7. 现在的功能边界（写文案时别夸大）

- 引擎：Piston（默认，需自建服务）/ Judge0 / **本地 WASM 沙箱**。本地沙箱只支持 C++，首次运行要下载约 14MB 工具链（clang + wasm-ld + sysroot，之后常驻内存）。
- 本地沙箱**没有 Python**（面板上 Python 是禁用态）。Vim 键位已移除（与 Monaco 0.56 不兼容），别再被试着重加。
- TLE：面板页头的「时限」（1/2/5/10 s，默认 1 s）只计**程序运行段**，不含编译；超时靠 `kill()` 当前 WASI 实例实现。卡片上的耗时是「编译 + 运行」，所以可能大于时限。
- 判定词表：`ok / compile-error / runtime-error / timeout / unreachable / cancelled`（见 `src/services/runner.js`、`src/services/engines/index.js`）。
- 判题流程：先编译运行出实际输出，再与期望输出比对（`src/services/compare.js`）。

## 8. 验证方式

- 手工：`npm run dev`，浏览器 http://localhost:5199，重点看**两套主题各一遍**、面板折叠/展开、分隔条拖拽与双击。
- 无头回归：`scripts/verify-ui.mjs`（`npm run verify`）。**注意它已经陈旧**，运行前请先知道这几条断言当前必定失败，不是页面坏了：
  - `localStorage.getItem('cph.panelPosition') === 'left'`：实际值是 JSON 字符串 `"left"`；
  - 断言 `.minimap` 不存在：Monaco 节点仍在（宽度 0）；
  - 左布局下断言「拖动后测试栏变窄」：当前语义是编辑器栏持有 basis，拖窄编辑器则测试栏变宽；
  - 断言 Python 模板文本含 `def solve`：Monaco 用 NBSP 渲染空格。
  - 它还会自己起 dev server，和常驻的 5199 冲突，跑的时候用 `VERIFY_PORT=5299` 覆盖。
- 仓库根目录有几张上一轮遗留的 `cph-*.png` 截图，可以随时删。

## 9. 建议的样式工作顺序

1. 先只改 `src/styles/base.css` 的变量值（最小风险，两套主题一起看）。
2. 再动单个组件的 scoped 样式，每次只改一个组件，改完立刻两套主题 + 折叠/拖拽回归。
3. 需要新颜色时，先在 `base.css` 里按分组命名（两套主题都写），再到组件里引用；不要把色值写在组件里"临时代替"。