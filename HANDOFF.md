# CPH IDE · 交接文档

面向「接下来要改前端样式」的接手人。当前代码**已跑通并上线**：本地 WASM 沙箱能编译运行 C++、也能解释运行 Python（含多文件 import）、判题（含 TLE）、主题与布局都能用；前端已推到 GitHub 并由 Vercel 托管（见第 10 节）；也能作为 PWA 装到设备上独立窗口运行、断网可用（见第 9 节）。

## 0. 一分钟上手

- 目录：`/Users/hezixia/Code/wasm-oj-frontend-main`。
- **是 git 仓库**：远程 `origin` = https://github.com/hejiehejiehejiehejie/wasm-oj-frontend.git ，主分支 `main`（就是部署分支）。动大样式前先看一眼 `git status`。
- 启动：`npm run dev` → http://localhost:5199；想验生产构建用 `npm run build && npm run preview`（Service Worker 与安装入口**只在生产构建里存在**，dev 下测不到，见第 9 节）。
- 其他命令：`npm run verify` 跑无头回归（A–F 全绿，**本机要显式给 Node 与 Chrome 的路径**，见第 8 节开头）；`npm run wasm:opt` 是工具链体积优化，**当前结论是不用跑**（第 7 节）。
- 两个 HTML 入口：`index.html`（主应用）与 `guide.html`（使用指南，给搜索引擎抓取的静态长文）。改文案 / 样式时**两页连同 docs/使用手册.md、HelpPanel.vue 一共四处要一起看**（见第 12 节）。
- 响应式：**没有顶栏**（2026-09-28 整体删除）。所有入口都在工作区内——侧边栏页头的三颗切换图标（资源管理器 / 评测样例 / 设置）、编辑器页签栏右端的运行按钮、设置视图里的「应用」分组（安装到设备）。侧边栏最低宽度随视口收缩（见第 3 节两小节）；工作区两栏始终并排、不堆叠。各档宽度都是实测定出来的，改动后要重量（第 1、3 节）；触屏下分隔条已可拖动，且有「键盘模式」（第 3 节末）。
- 技术栈：Vue 3（Composition API + `<script setup>`）+ Vite 8 + **纯原生 CSS**（没有 Tailwind，也没有任何组件库 / UI 库）。
- 重量级第三方依赖只有 `monaco-editor` 和 `@runno/wasi`（浏览器里跑 clang）；`puppeteer-core` 只给无头回归脚本用；`binaryen` 是 devDependency，只服务 `npm run wasm:opt`（不进产物、不影响运行时，卸掉它会自动回退到系统级 wasm-opt）。新增 npm 包要先讨论。

## 1. 硬约束（改样式时最容易被打破的几条）

| 约束 | 说明 |
| --- | --- |
| 只有两套主题 | `cph-dark`（默认）/ `cph-light`，主题 id 同时用于 Monaco 自定义主题名 |
| 颜色只走 CSS 变量 | 组件里**不许**出现写死的十六进制颜色；所有色值定义在 `src/styles/base.css` |
| 新增变量必须定义两遍 | `:root` 和 `:root[data-theme='cph-light']` 都要给值，否则浅色主题下会串色 |
| 禁止第三方 UI 库 | 抽屉 / 弹层 / 下拉全部原生 CSS + Vue + `Teleport` |
| 侧边栏页头的切换图标不许溢出 | 三颗图标（30×26）渲染在**两个面板各自的页头**里，最窄的面板下限是 158px（320px 视口）；实测三颗占 90px + 右侧动作按钮 2 颗仍有 64px 余量。**别给图标加文字、别加大 `gap`、别加第四颗**——页头没有折行兜底（`FileExplorer` 的 `.explorer__head` 是固定 `height: 35px`），撑不下就直接溢出 |
| 运行按钮不在页签滚动容器里 | `.editor-tabs` 现在是「`.editor-tabs__strip`（`flex: 1 1 auto`，横向滚动）+ `.editor-tabs__run`（`flex: 0 0 auto`）」两个兄弟。**运行按钮必须在 strip 之外**——塞进去会跟着页签一起滚出视口，侧边栏收起时就没有运行入口了 |
| 面板下限只在 CSS 里定义一份 | 侧边栏最低宽度由 `.workspace` 上的 `--tests-min-cap / --tests-min-ratio / --tests-min-floor` 决定（即 `.pane--tests` 的 `clamp(160px, 50%, 320px)`；变量名里的 `tests` 是历史沿革，统一侧边栏沿用同一套），`measureLimits()` 读同一组变量复算；改数字只改 CSS 那三行，别在脚本或组件里再写一份 |
| 侧边栏内部只用 `v-show` | 整栏显隐、栏内两个面板（资源管理器 / 评测样例）的切换**都是 `v-show`**：文件树的展开状态、样例里手填的输入与卡片折叠态都挂在 DOM 上，改成 `v-if` 会在切换时被销毁重建，用户数据直接丢。**「设置」也在这一栏里，但它不是第三个面板**——它是编辑区里的合成页签，页头那颗图标只负责开关那个页签（见第 5 节坑 7） |
| flex 容器的子元素要显式拉伸 | 布局里 `.pane > *` 必须 `flex: 1 1 auto; min-width: 0`，否则子组件收缩到内容宽度 |
| Monaco 只能动态改 | 设置项变化走 `editor.updateOptions()` / `monaco.editor.setTheme()`，**不要重建实例** |
| 设置要持久化 | 统一用 `src/composables/usePersistentRef.js`（存的是 JSON 字符串，见第 5 节的坑） |
| SW 改了策略就升版本号 | `public/sw.js` 的 `VERSION` 决定缓存桶名（现为 `cph-shell-v2` / `cph-toolchain-v2`）；改缓存内容或策略时必须同步升它，否则老用户会一直吃旧桶 |
| 图标是构建产物之外的静态资源 | `public/icons/*.png` 直接进产物，**不在**构建清单里，改动它们要同步 `sw.js` 的 `STATIC_ASSETS`（见第 9 节） |

## 2. 与界面相关的文件

```
index.html                      # 主应用入口：挂载点 + PWA（manifest / apple-touch-icon / theme-color，见第 9 节）+ 一整套 SEO 头（canonical / og / ld+json）+ 服务无脚本抓取器的 noscript 兜底正文（见第 12 节；那块正文**是给搜索引擎看的文案**，改界面能力时别忘了它）
guide.html                      # 第二个 Vite 入口：使用指南长文（静态、无 Vue、无 JS），给搜索引擎直接抓取；样式在 src/styles/guide.css（见第 12 节）
vite.config.js                  # 两个 rollup 入口（index / guide）+ COOP/COEP 响应头（本地沙箱的硬前提，别动）+ 构建期产出 precache-manifest.json
vercel.json                     # 部署侧同一组响应头 + .wasm 的 MIME 与 immutable 缓存 + manifest/sw.js 的响应头 + sitemap.xml 的 MIME（见第 10 节）
public/manifest.webmanifest     # PWA 清单：display standalone、start_url /、scope /
public/sw.js                    # Service Worker：预缓存外壳（工具链不预缓存、改为按需落缓存），导航网络优先（见第 9 节）
public/icons/                   # PWA 图标：icon-192/512、icon-maskable-192/512、apple-touch-icon(180)
public/favicon.svg              # 站点图标（唯一进 STATIC_ASSETS 的 svg）
public/og-cover.png             # 社交分享大图 1200×630（被 index.html / guide.html 的 og:image 引用）
public/robots.txt               # 抓取规则 + 指向 sitemap
public/sitemap.xml              # 站点地图（两个入口：/ 与 /guide.html）
public/wasm/8.0.1/              # 自托管的 C++ 工具链：clang.wasm / wasm-ld.wasm / clang-fs.tar.gz（约 52MB，进仓库）
public/wasm/python-3.11.3/      # 自托管的 CPython（wasm32-wasi）：python.wasm + python-fs.tar.gz（约 24MB，进仓库）
scripts/verify-ui.mjs           # 无头回归脚本（A–F 已全绿，见第 8 节；B 步走的是「设置页签」）
scripts/optimize-wasm.mjs       # wasm-opt 体积优化（npm run wasm:opt）——**刻意未接进构建**，结论见第 7 节
docs/使用手册.md                # 面向新用户的说明：目前只回答「如何在本地运行 C++」「如何切换侧边栏面板 / 展开折叠侧边栏」，与 HelpPanel.vue 内容同源（**精简版**；完整版是 guide.html）
src/
  main.js                       # 挂载 + 生产构建里注册 Service Worker
  monaco-setup.js               # Monaco 的 cph-dark / cph-light 两套自定义主题
  styles/base.css               # ★ 所有 CSS 变量 + 全局元素样式，改配色只改这里
  styles/guide.css              # 使用指南页（guide.html）的样式：**`@import './base.css'` 后再加长文排版**，两套主题的配色 / 字体 / 滚动条仍来自 base.css，这里一律 `var(--…)` 引用、不写十六进制（见第 12 节）。唯一要小心的：base.css 是为「满屏 IDE」写的（`html/body` 高度 100%、body 锁死滚动），内容页必须把那两条放开，否则长页滚不动
  App.vue                       # 布局骨架（workspace / pane / splitter）+ 全局状态
  composables/usePersistentRef.js
  composables/useInstallPrompt.js  # 设置视图「应用」分组里「安装到设备」按钮的数据源：拦 beforeinstallprompt，用完即弃
  composables/useMobileKeyboard.js # 触摸屏「键盘模式」：视口收缩 + 不抢焦的保焦拦截（见第 3 节末）
  components/
    EditorPane.vue              # 编辑区容器：Monaco 画布 + 设置视图（两者 v-show 互斥）+ 底部状态栏；把 judge / connection / running / total 透传给页签栏与设置视图
    EditorTabs.vue              # 编辑器标签栏：`strip`（文件页签 + 「设置」合成页签，横向滚动）+ 右端常驻的「运行 / 停止」按钮（2026-09-28 从被删的顶栏搬来，见第 3 节）
    EditorSettingsPanel.vue     # 设置视图：铺满编辑区、与代码文件平级的合成页签（不再是抽屉 / Teleport）；「目录 + 内容」两栏，目录 = 编辑器 / 布局 / 评测 / 本地运行环境 / 应用 / 帮助。「编辑器」那组按 `EDITOR_GROUPS`（外观 / 编辑 / 光标与高亮 / 视图 / 代码辅助 5 小节，共 27 行）数据驱动渲染，每行只写「键 + 标签 + 控件类型 + 可选项」，可选项表全部来自 services/editorOptions.js
    EngineSettingsPanel.vue     # 「评测」分组里的引擎列表 + 服务地址 + 自检（原顶栏「评测引擎设置」弹层的正文）
    HelpPanel.vue               # 「帮助」分组里的问答列表 + 完整指南链接（原顶栏「?」抽屉的正文，现只读、无按钮 / Teleport，与 docs/使用手册.md 同源）
    Sidebar.vue                 # ★ 统一侧边栏外壳：用 v-show 切换两个面板（资源管理器 / 评测样例），面板本体由 App.vue 经具名插槽（#explorer / #tests）填入；页签状态（cph.sidebarTab）与持久化留在这里，经 provide 下发给页头里的切换组件。自己不管宽度与整栏显隐——那是外层 .pane--tests 的事。另 `defineExpose({ showPanel })` 供父组件从外部切面板（App.vue 跑测试时要把「评测样例」亮出来），状态仍只有这一份
    SidebarSwitcher.vue         # 「资源管理器 / 评测样例 / 设置」三个切换按钮（2026-09 加）：不再独占一行页签栏，而是渲染进两个面板各自的页头里（同一时刻只有一个面板可见，视觉上只有一份）；只画 logo 不写字（`files` / `cases` / `gear`），名字在 `title` / `aria-label`；状态从 Sidebar 的 provide 取，自己不存状态。前两颗切 `cph.sidebarTab`，第三颗开关编辑区里的设置页签（`settingsTab`，不落盘）
    FileExplorer.vue            # 资源管理器面板（Sidebar 的 #explorer 插槽）：页头左侧是 SidebarSwitcher、右侧是新建文件 / 文件夹两颗按钮 + FileTreeItem 树 + 右键菜单（`ContextMenu`，经 `provide('openContextMenu')` 下发给树节点）+ 删除确认弹窗（自绘，见第 5 节坑 11）；内联新建输入框自带默认名并把焦点送进去（见第 5 节坑 12）
    FileTreeItem.vue            # 文件树节点：展开态存在自己身上，靠 Sidebar 的 v-show 保住；右键 `@contextmenu.stop` 把事件交给 FileExplorer（**`.stop` 不能删**，见第 5 节坑 14）
    ContextMenu.vue             # 通用右键菜单：Teleport 到 body、fixed 定位、挂载后按视口四边收敛、点外部 / Esc / 失焦关闭。目前只有文件树在用（「重命名 / 删除」两项）
    TestPanel.vue               # 评测样例面板（Sidebar 的 #tests 插槽）：页头左侧是 SidebarSwitcher、右侧是 verdict（「全部 AC / n/m AC」）与耗时 + 用例列表 + 页脚运行按钮
    TestCaseCard.vue            # 单个用例卡片：徽标（AC/WA/CE/TLE/RE/ERR 判定码）/ 耗时 / 输入框 / 输出块
    AppIcon.vue                 # 内联 SVG 图标集（name 取图标名）。三张表：PATHS（24×24 描边线性图标，主力）/ SOLID_PATHS（整块实心品牌标，`fill: currentColor`）/ VIEWBOX（不在 24 网格上的图标的专用方框）。语言图标的两个坑见第 5 节坑 16
  services/                     # 判题逻辑，改样式基本不碰
    runner.js                   # 逐用例调度（并发 2）+ 进度回调；引擎 outcome 翻译成卡片 verdict（AC/WA/CE/TLE/RE/ERR）
    compare.js                  # 实际输出与期望输出比对，只返回布尔（不再产出「输出多 N 行」之类 hint）
    templates.js                # 各语言默认模板
    editorOptions.js            # 编辑器偏好的单一出处：默认值 27 项 + 可选项表 + 逐键校验 + 偏好 → Monaco 选项（编辑器级 editorOptions() / model 级 editorModelOptions()）
    engines/                    # 引擎注册表：piston（默认）/ judge0 / wasm / echo
    wasmRuntime.js              # 本地沙箱的唯一入口：语言路由 + 阶段播报 + 看门狗 + 串行队列 + PCH 后台预热
    runnoSandbox.js             # runno 双管线：C++ 编译（工具链地址、编译产物缓存、PCH 生成）+ Python 解释运行
    vfs/runnoFs.js              # VFS → runno fs 的转换层（fsEntry 记录形状的唯一出处，两个管线共用）
    pchStore.js                 # PCH 的 IndexedDB 存档（原生 API，任何失败都按「没有存档」处理）
    settingsTab.js              # 「设置」合成页签的 UI 状态（刻意不进 workspaceStore/openTabIds、不建模型、不落 localStorage；见第 5 节坑 7）
```

## 3. 布局骨架（改布局 / 尺寸看这里）

`App.vue` 模板（`src/App.vue:551` 起）：

```
div.app（column，100% 高；padding 只有安全区，2026-09-28 起顶栏已删，工作区直接贴顶）
└─ main.workspace            flex: 1 1 auto; min-height: 0; padding: 6px; 背景 --bg-editor
   │                         类名状态：is-left / is-dragging / is-swapping / is-collapsed
   ├─ section.pane.pane--editor   内联 flexBasis = editorShare%
   │    └─ EditorPane
   │         ├─ EditorTabs            strip（页签，横向滚动）+ 右端「运行 / 停止」按钮
   │         ├─ 编辑器画布 或 EditorSettingsPanel（v-show 互斥）
   │         └─ footer.editor-pane__status
   ├─ div.splitter                role=separator，键盘左右微调，双击折叠
   │    ├─ span.splitter__line    悬停/拖拽才亮（2px）
   │    └─ span.splitter__dots    三点抓手，常驻可见
   └─ section.pane.pane--tests    内联 flexBasis = (100 - editorShare)%，v-show 控制整栏显隐
        └─ Sidebar               统一侧边栏外壳（一个整体参与拖拽）
             └─ div.sidebar__body        内容区（flex: 1 1 auto; min-height: 0）
                  ├─ div.sidebar__panel  v-show="activeTab === 'explorer'" → FileExplorer
                  │      └─ header.explorer__head   ← SidebarSwitcher（左，3 颗图标） + 新建文件 / 文件夹（右）
                  └─ div.sidebar__panel  v-show="activeTab === 'tests'"    → TestPanel
                         └─ header.panel__head      ← SidebarSwitcher（左，3 颗图标） + verdict / 耗时（右）
```

侧边栏页头里的**第三颗图标是「设置」**（2026-09-28 加，顶栏删除后从顶栏齿轮搬来）：它不切侧栏面板，而是开关编辑区里的设置页签（`settingsTab`，见第 5 节坑 7）。另外两颗切 `cph.sidebarTab`。因为设置页签是编辑区的东西，关掉它时侧栏那颗图标的高亮也跟着灭——高亮状态由 `settingsTab.active` 决定，不走 `cph.sidebarTab`。

**开跑必亮结果**（2026-09-28 加）：运行入口有三处——编辑器页签栏右端的运行按钮、`⌘/Ctrl + Enter`、评测面板页脚的运行按钮——全都并到 `App.vue` 的 `runAll()` 这一个出口。`runAll()` 在通过「正在跑 / 没有用例 / 没有活跃语言」三道前置判断之后、真正开跑之前，会调 `revealTestsPanel()`：侧栏收起了就用 `togglePanel()` 展开（它顺带把 `virtualShare` 接回 `editorShare`，与双击展开同一套收口），然后 `sidebarRef.value?.showPanel('tests')` 切到评测样例。已经在评测样例上就是空操作，不会破坏页签持久化。**别把这段放到 `runAll()` 的前置判断之前**——那样点「停止」（同一个按钮，跑到一半时发的是中止）也会把侧栏弹出来。

切换栏目的入口（`SidebarSwitcher.vue`，2026-09 加）**不再单独占一行页签栏**，而是渲染在两个面板各自的页头里：同一时刻只有一个面板可见，所以视觉上只有一份，且两个页头里它都贴左——切过去之后按钮位置不动，可以连点。按钮**只画 logo 不写字**（多文件 = 资源管理器，带勾的清单 = 评测样例，齿轮 = 设置，见 `AppIcon.vue` 的 `files` / `cases` / `gear`），名字放 `title` 与 `aria-label`。前两颗的状态仍是 `cph.sidebarTab`，只有 Sidebar 一份（经 `provide('sidebarTabs')` 下发），别让面板各存一份；第三颗读的是 `settingsTab.active`。

关键规则（`src/App.vue:513` 起）：

- `.workspace` 恒为 `row`，左右换边靠 `order`（编辑器 1 / 分隔条 2 / 侧边栏 3，左侧时对调），**DOM 不重建**（布局切换还有 View Transitions 动画）。**别改回 `row-reverse`**：那会把两栏一起甩到另一边，连侧边栏内部的滚动条方向都跟着反。
- 两栏 `flex-basis` 之和恒为 100%：编辑器栏拿 `editorShare%`，侧边栏拿 `100 - editorShare%`。若给两栏留出 basis 之外的剩余空间，会被 `flex-grow` 平分，分隔条就只以一半幅度跟手——**改这两条 basis 时要一起想**。
- `.pane` 是独立的圆角卡片（`border-radius: 8px; overflow: hidden`），让 Monaco 画布和面板头脚的方角被裁掉。
- `.splitter` 视觉 1px 细线、热区 12px（负外边距各压进卡片 3px，卡片净间距 6px）；折叠状态下热区加宽到 24px。触屏（`pointer: coarse`）下热区同样加宽到 24px，**但负外边距要同步从 -3px 改成 -9px**——两者一起改，分隔条在 flex 里才仍只占 6px，两侧卡片位置逐像素不变。
- `.splitter` 必须声明 `touch-action: none`。触屏手势的归属是浏览器在 `pointerdown` 那一刻定的：缺这行它就把这一拖当成滚动/缩放，随即发 `pointercancel`，而 `beginDrag` 的 `stop` 正挂在 `pointercancel` 上，于是手机上按下即被打断。`pointerdown` 里的 `preventDefault()` 挡不住（按规范它只抑制兼容的 `mousedown` / `mouseup`）。
- 折叠阈值在 `App.vue` 的拖拽逻辑里（贴边 32px 内折叠、离开边缘 60px 展开），改视觉宽度时注意别和阈值打架。
- `measureLimits()` 用面板的**最低宽度 + 分隔条实际渲染宽度**算拖拽上限，两项都随视口与触屏档变（见下面「侧边栏的最低宽度」）。

### 无顶栏后的两条宽度线（2026-09-28 顶栏删除后重测）

顶栏（`TopBar.vue`）整体删除后，原来那套「三档断点 + 省略号收纳」**不再存在**（历史见本节末）。现在需要守的只有两条，且都不靠 `@media` 断点，靠 flex 自己收缩；下表是 2026-09-28 用无头 CfT 在 1680 / 560 / 414 / 375 / 320 五档实测的（`documentElement` 无横向溢出，异常 0 条）。

| 视口宽 | 侧边栏宽 | 页头宽 | 三颗图标 | 图标是否溢出 | 页签 strip 宽 | strip 是否横向滚动 | 运行按钮 | 运行按钮是否被裁 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1680 | 663 | 663 | 3×30 = 90 | 否 | 919 | 否 | 64×25 @ x=932 | 否 |
| 560 | 238 | 238 | 3×30 = 90 | 否 | 224 | 否 | 64×25 @ x=237 | 否 |
| 414 | 199 | 199 | 3×30 = 90 | 否 | 117 | 否 | 64×25 @ x=130 | 否 |
| 375 | 180 | 180 | 3×30 = 90 | 否 | 98 | 是 | 64×25 @ x=111 | 否 |
| 320 | 158 | 158 | 3×30 = 90 | 否 | 64 | 是 | 64×25 @ x=77 | 否 |

- **侧边栏页头三颗图标**（`SidebarSwitcher`）：30×26 一颗、`gap` 0、`flex: 0 0 auto`，合计 90px。最窄档（320px 视口，面板 158px）页头右侧还有新建文件 / 文件夹两颗动作按钮，图标右缘到动作区仍留 64px。`.explorer__head` 是固定 `height: 35px`、**不折行**，所以加第四颗或给图标加文字就会直接溢出——要加先按下面口径重量（见第 1 节硬约束表）。
- **编辑器页签栏的运行按钮**（`.editor-tabs__run`，64×25）：`.editor-tabs` 拆成两个兄弟——`.editor-tabs__strip { flex: 1 1 auto; min-width: 0; overflow-x: auto }`（页签在这层滚）+ `.editor-tabs__run { flex: 0 0 auto }`。所以页签再多、视口再窄，运行按钮都**不跟着滚**，永远贴在页签栏右端（375 / 320 档实测：strip 已可滚，运行按钮仍完整可见）。它是侧边栏收起后唯一的运行入口（另一颗在评测面板页脚）。
- 怎么量「必需宽度」：把摊平后的每个可见 flex 项**逐个**注 `flex-shrink: 0`，再把吃剩余空间的项藏掉，量最后一个可见子项右缘到容器左缘的距离 + 右内边距。**不能直接量 `scrollWidth`**——容器不是滚动容器时，收缩后的子项不会让它溢出，量出来的恒等于容器宽。
- 量宽度时的两个口径坑：`display: none` 父元素内的子元素，`getComputedStyle(child).display` **仍返回它自己的值**（不是 `none`），判可见要量外层容器或用 `el.getClientRects().length > 0`；`display: contents` / `display: none` 的子元素不生成盒子、**不占 gap**，量必需宽度时要把它们排除，否则会虚高几十像素。
- **不要用 iframe 或注入 `display: revert` 的方式模拟视口**——量不到真实溢出，返回的数字是自洽的假象。触屏档要用 `page.setViewport({ hasTouch: true, isMobile: true })` 才会命中 `@media (pointer: coarse)`（`emulateMediaFeatures` 不支持 `pointer`）。
- **历史**：顶栏原有的三档响应式断点（820 / 520 / 349）与 `⋯` 省略号收纳，2026-09-28 连同 `.topbar` / `.brand*` / `.tool` / `.primary` / `.popover--menu` 一起删除。设置入口搬进侧边栏页头第三颗图标、运行按钮搬进编辑器页签栏、安装到设备并进设置视图的「应用」分组、侧边栏开关与品牌删除（侧栏显隐仍可由分隔条双击 / 键盘切换，见第 3 节关键规则）。`--bg-chrome` 变量保留——它现在只服务于 `theme-color`（独立应用窗口标题栏底色），不再是任何组件的背景。

### 侧边栏的最低宽度（`App.vue`，2026-09 加；原名「测试面板的最低宽度」）

`.pane--tests`（统一侧边栏那一栏）的 `min-width` 不再是固定 320px，而是 `clamp(160px, 50%, 320px)`。三个参数定义在 `.workspace` 上（`--tests-min-cap` / `--tests-min-ratio` / `--tests-min-floor`），**JS 不另存一份**：`measureLimits()` 从 `getComputedStyle(workspace)` 读这三个变量，再按 `max(floor, min(cap, 内容宽 × ratio))` 复算面板下限。改参数只改 CSS 那三行（JS 里的 160 / 0.5 / 320 只是取不到变量时的兜底）。

| 视口宽 | 320 | 360 | 375 | 414 | 480 | 520 | 560 | 640 | ≥652 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 面板最低宽 | 160（地板生效） | 174 | 182 | 201 | 234 | 254 | 274 | 314 | 320 |
| 默认 60/40 实测（编辑器 / 面板） | 142 / 160 | 168 / 174 | 176 / 182 | 195 / 201 | 228 / 234 | 248 / 254 | 268 / 274 | 308 / 314 | 与改版前逐像素一致 |

- 为什么要改：改版前 375px 下面板被 320px 下限顶住、编辑器只剩 **37px**；320px 下更糟，两栏合计超出工作区，面板被挤出视口（编辑器 2px）。
- 50% 的来历：面板与编辑器在窄屏各占一半，两边都还放得下；320px 要到工作区内容宽 ≈640px 才够，所以 **≥652px 的视口行为与改版前完全一致**，桌面端零影响。
- 160px 是实测硬底：面板固定到 160px 时面板与卡片都无横向溢出（到 150px 时 `.card__head` 才开始超 5px）。320px 视口正好卡在地板上。
- 拖拽路径也同步：`measureLimits()` 的 `maxShare` 读同一组值，所以「一直往右拖」停在面板下限上（375px 下编辑器 167 / 面板 190，触屏因热区 24px 再让 18px），再往外才是折叠。
- 面板头必须能**折行**（`TestPanel.vue` 的 `.panel__head` 加了 `flex-wrap: wrap` + `row-gap`，`.limit` 加 `margin-left: auto`）：标题 + 徽标 + 耗时 + 时限一行要约 250px，挤不下时若不换行，`.verdict`（`white-space: nowrap`）会溢出自己的盒子、直接压在时限选择器上（实测面板 160px 时压过去 82px，面板 320px 带上耗时时也会压过去 ~33px）。折行后时限整组落到第二行并仍贴右，一行放得下时与改版前逐像素一致。
- 已知窄极限（2026-09-18 收紧过一次，**改完未逐档复测**，动卡片头部后按第 8 节重量）：头部那句失败提示（「输出多 N 行」「编译失败」）已删除；跑完卡片的徽标改成两字母判定码 AC/WA/CE/TLE/RE/ERR（不再竖排，未跑的「待运行」在 320px 档仍可能竖排）；`.card__title` / `.badge` / `.metric` 都加了 `flex: 0 0 auto; white-space: nowrap`，耗时不再折成两行。面板 ≤174px 且**跑过一轮**时，耗时文字仍可能被卡片横向裁掉几个字符（旧实测约 32px）；想要更干净就上容器查询（`container-type: inline-size` + `@container`）按面板宽度摘掉耗时或标题。

### 触摸屏的键盘适配（2026-09-18 加）

手机上虚拟键盘会盖住大半个屏幕。这套适配**在触摸屏上默认开启、没有开关**，只做两件事：**把整块应用收缩到键盘上方**（内容照常滚动）+ **焦点不要被「滑动」改变**。

**唤出键盘的时机用浏览器默认的**（焦点落进可输入文字的框里就弹），界面上不要另设开关。用户口径是：**滑动只滚动，轻点才聚焦**——一条曾经的失败尝试记在下面。
1. 加界面开关（先是「底部输入停靠栏 + 按钮」，再是「键盘模式按钮」）：真机上点按钮本身就会把焦点从编辑器抢走，反而把已经弹着的键盘收起来。两版都因此撤掉，**不要再加**。

- **默认开启的判定**：`matchMedia('(pointer: coarse)')` 为真即启用（鼠标设备上不写变量、不挂任何监听，行为与加这个功能之前逐像素一致）。
- **可视高度**：`.app.is-keyboard` 是 `position: fixed; top: var(--vv-top); height: var(--vvh)`。这两个变量由 composable 从 `window.visualViewport` 的 `height` / `offsetTop` 写进 `documentElement.style`（`resize` / `scroll` / `orientationchange` 都跟）。用 `top` 一起对齐是因为 iOS 上可视区会被顶上去（`offsetTop > 0`），只改高度的话底部仍会被键盘盖住。**没有用 `interactive-widget=resizes-content`**（Chrome 专用）。工作区是 flex、Monaco 是 `automaticLayout`，都不需要额外写高度。
- **保焦 = 只拦默认行为，不抢焦点**：键盘收起是因为焦点被移走了，所以监听 `document` 的 **`mousedown`（capture）**，目标不是可编辑元素时 `preventDefault()`：焦点不再移给 body，键盘不落。
  - 可编辑元素**一律放行**（`input, textarea, select, [contenteditable]`）。Monaco 的输入面是它自己那个 `textarea.inputarea`（Chrome 里实际聚焦到 `.native-edit-context`），卡片输入框是 `.ta`——挡掉它们就等于「焦点进不去编辑器」。
  - **只挡 `mousedown`，别改成 `pointerdown`**：挡 `pointerdown` 会把兼容的 `click` 一起吞掉，「运行全部」「添加样例」这些按钮就点不动了；挡 `mousedown` 只阻止焦点转移，`click` 照常触发（已用 `page.touchscreen.tap()` 验过）。
  - **别再加 `focusout` 抢焦兜底**（旧版踩过）：那会在点 Monaco 编辑器时把焦点立刻抢回底部输入框，真机反馈「焦点无法集中在代码编辑框中」就是这么来的。
- **滑动不改变焦点（滑动只滚动、轻点才聚焦）**：`touchstart` 记起点与「滑动前的焦点」，`touchmove` 位移超过 `PAN_SLOP = 10px` 即判为滑动。之后：
  - **真凶是 Monaco 自己那套手势识别**，不是浏览器原生逻辑，光拦鼠标事件没用：
    - 触摸时它不走 `mousedown`（`pointerHandler.js` 的 `_onMouseDown` 对 `pointerType === 'touch'` 直接 `return`），`mousedown` 那条路只在鼠标/笔上生效；
    - 它在 `touchend` 里自己判 Tap（`vs/base/browser/touch.js` 的 `onTouchEnd`）：**按住 < 700ms 且「起始位置与最后一次 `rolling` 位置的差」< 30px** 就算 Tap，然后 `onTap` → `focusTextArea()`，键盘随之弹出；
    - 比较基准是**最后一次位置**，所以「划出去再划回来」——阅读代码时最常见的动作——只要落点回到起点 30px 内，也会被判成 Tap。
    - 修法：那个 Tap 是派发在 `.view-lines` 上的自定义事件（`'-monaco-gesturetap'`，`bubbles = false`、`cancelable = true`），**在捕获阶段**监听它，判定为滑动就 `stopPropagation()` + `preventDefault()`——Monaco 压根收不到，不会聚焦，也就没有「闪一下又收」。它自己也是挂在这个节点上监听的，冒泡阶段去拦就晚了。
    - 事件名是 Monaco 内部实现细节。若以后升级 monaco 后又要复发，先照上面 `onTouchEnd` 那段重新确认阈值与事件名；下面那道 `focusin` 兜底还能接住「焦点真的变了」的情况。
  - **键盘没弹着、焦点却还残留在编辑器里时，一落手（`touchstart`）就把焦点清掉**（`blur()`，这道是最后加上的，也是真机复发的关键）：Android Chrome 上，一个**已经聚焦**的输入框会在手势结束时被系统重新弹起键盘——这一步连 `focusin` 都不派发，所以上面拦 `mousedown`、拦手势 Tap 两道闸都看不见它。真机反馈正是「滑之前点过编辑器、有光标，抬手之后键盘才弹」（滑动）与「按返回键收了键盘，轻点任意位置键盘又被捞回来」（轻点）——同一个成因、两种触发方式。
    - **轻点那条拦 `mousedown` 来不及**：合成的 `mousedown` 在 `touchend` **之后**才来，那时系统已经决定重弹键盘了。所以两道都在 **`touchstart`** 断掉前提：`!keyboardUpAtTouchStart && isInEditor(current)` → `current.blur()` 并把 `focusBeforeTouch` 清成 `null`（滑动那条在判定为滑动时还有一次 `undoFocusChangeFromPan()`，见上）。
    - 只清**焦点在 `.monaco-editor` 里**的那种（`isInEditor`，认 `.native-edit-context` / `textarea.inputarea` 的祖先）；焦点在卡片 `.ta` 上时不动它（滑动/轻点不该把用户的输入焦点扔掉）。点编辑器文本时的重新聚焦不用管——那是 Monaco 自己的 Tap 干的，焦点本来就是这个入口给的。
    - **键盘弹着时一概不碰焦点**（`keyboardUpAtTouchStart` 那道闸）：这时正确行为是保焦（点按钮、点输出区都不该收键盘），也正是「滑一下就收键盘」的老 bug 的修法。
    - 代价（用户已知情、需要真机确认口感）：键盘收掉后焦点不再留在编辑器里，接着打字得先点一下编辑器。这样换来的是「点哪儿都不会莫名弹键盘」，按用户口径是对的。
  - `mousedown` 也照拦（滑动幅度很小时浏览器仍会合成一次点击）：捕获阶段 `preventDefault()` + `stopPropagation()`。
  - 再加一道 `focusin`（capture）兜底：滑动期间只要焦点跑到了可编辑元素上就还回去——编辑器里的直接 `blur()`（别还回去，否则又把键盘请回来）；其余情况还给「滑动前那个」（它是可编辑元素时 `focus()`，本来没焦点就 `blur()`）。两种时机都覆盖：判定为滑动的那一刻（**iOS 在 `touchstart` 就把焦点给了输入框，那时还没滑**，只在 focusin 里拦会漏），以及滑动过程中焦点又被移走。
  - **`PAN_SLOP = 10px` 是夹在两个阈值中间取的**：平台自己的点按 slop（约 8px，决定浏览器补不补那个 `mousedown`）与 Monaco 的 30px。比平台 slop 略大，手抖的轻点不会被误判成滑动（实测 4px 拖动照常聚焦）；又远小于 30px，才盖得住 Monaco 把小幅拖动当点击那一段。
  - `panning` 一直保留到下一次 `touchstart`（合成的点击是在 `touchend` 之后才来的，提前清掉就拦不住了）。轻点会在 `touchstart` 重置它，所以「滑动之后轻点」照常聚焦。
  - **判定「焦点落进可编辑元素」时必须认 Monaco 的输入面**：Chrome 里是 EditContext 的 `.native-edit-context`，它**不是** `contenteditable`（`node.isContentEditable` 为 false），上面那串 `input, textarea, ...` 选择器认不出来——漏掉它，那道 `focusin` 兜底对编辑器形同虚设。
- **状态**：没有持久化。`cph.mobileKeyboard`、`cph.mobileInputDock` 两个旧键都已作废，残留在 localStorage 里无害。
- 验证口径（临时 puppeteer 脚本，跑完即删；触屏要用 `page.setViewport({ hasTouch: true, isMobile: true })` 才命中 `pointer: coarse`，`emulateMediaFeatures` 不支持 `pointer`）。触屏 390×844：`.app` 带 `is-keyboard`、`--vvh=844px`；**轻点**编辑器 / 卡片 `.ta` → 焦点分别进 Monaco 输入面与那个 textarea；**手抖 4px** 拖动 → 仍聚焦（不误伤轻点）；**拖动 20px** 与**划出去再划回来** → 焦点仍 body（这两条是真机问题的靶子，改前必红：探针会在页面里给 `-monaco-gesturetap` 挂个计数器，先确认 Monaco 那时**确实派了 Tap**，再看焦点没进去）；拖动 72px → 焦点仍 body（Monaco 本就不派）；滑动后手动派一个 `mousedown` 给编辑器 → `defaultPrevented` 且焦点不进去；滑动期间手动 `focus()` 编辑器输入面 → 焦点被还回 body（这是 `focusin` 兜底那道闸）；焦点在 `.ta` 时滑动编辑器 → 焦点仍在 `.ta`；滑动后再轻点 → 焦点能进；焦点在 `.ta` 时点面板标题、输出区 `.out`、页签栏空白处 → activeElement 一字不变；视口 844→420 → `--vvh` 与 `.app` 高度都变 420。鼠标视口：无 `is-keyboard`、`--vvh` 为空、点输入框与点编辑器都照常聚焦。
  - **先点编辑器、再滑动 → 焦点必须被清掉**（这条是最后一个真机 bug 的靶子，改前实测焦点仍留在 `.native-edit-context`）；滑动期间再强行 `focus()` 编辑器 → 又被清掉；焦点在 `.ta` 时滑动编辑器 → `.ta` 焦点不动；滑动后轻点 → 焦点能进；手抖 4px → 不算滑动、焦点保留。
  - **轻点那条（2026-09-28 加）**：模拟「键盘收起但焦点还残留在编辑器里」（`visualViewport` 复位使 `keyboardUp` 为假，焦点仍 `.native-edit-context`）→ 只 `touchstart` 一次、不滑 → 焦点必须被清成 body（**改前必红**）；反过来「键盘弹着时轻点非可编辑处」→ 焦点一字不动（证明没破坏保焦设计）；轻点编辑器文本本身仍能重新聚焦（靠 Monaco 自己的 Tap）；焦点在卡片 `.ta` 时轻点别处 → 不动它；鼠标视口下整层不生效（`--vvh` 为空）。
  - **本地探针验证不了「真滑动」**：`page.touchscreen` 的合成触摸在我们这个无头 Chrome 里**根本不会滚动**（实测拖动 200px 前后 `.monaco-scrollable-element` 的 `scrollTop` 都是 0）。所以凡是依赖「真的滚起来了」的用例（Safari 在 `touchstart` 就聚焦、系统的键盘重弹）本地一律复现不出，别把绿色当已验过——只能靠真机反馈。可验证的是「touchmove 位移判定」这一层，它不依赖滚动。
  - **选落点要避开本来就会改焦点的地方**，否则用例自己会测糊：卡片头左侧 30px 是折叠按钮（点了会把 `.card__body` 收起，输入框被 `v-show` 藏掉，焦点只能掉给 body）；面板头中部是时限的 `<label>`，点它会把 click 转给 `<select>`，焦点本来就会跟着走。

## 4. 主题与 CSS 变量

- 主题落在 `<html data-theme="...">` 上（`App.vue:79` 的 watch），由 `base.css` 的变量接管；不带 `data-theme` 时即深色。
- Monaco 侧用同一批 id 的自定义主题（`src/monaco-setup.js`），`cph-light` 的底色要和 `--bg-panel` 对齐，否则编辑区和面板会出现两块不同的白。
- 变量分组（`src/styles/base.css`）：

| 分组 | 变量 |
| --- | --- |
| 底色层次 | `--bg-editor` 页面留白 / `--bg-panel` 卡片面板 / `--bg-panel-head` 面板头脚 / `--bg-card`、`--bg-card-head` 用例卡片 / `--bg-chrome` 应用外壳（2026-09-28 顶栏删除后只服务于 `theme-color`） / `--bg-tab-active` |
| 浮层与控件 | `--bg-raised` 浮层底色（右键菜单 `ContextMenu` / 删除确认卡 `.confirm__card`，**已无抽屉**） / `--bg-control`、`--bg-control-hover` 按钮下拉 / `--bg-input` 输入框 / `--bg-hover` / `--bg-selection` |
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

组件样式入口（**下面括号里的行号是「该组件 `<style>` 块的起始行」，只作定位参考——它会随上方模板增删而漂移，真要照着找请搜索选择器名而不是行号**）：

| 组件 | 主要选择器 |
| --- | --- |
| `App.vue`（style@622） | `.app` `.workspace` `.pane` `.splitter` 及其状态类 |
| （原 `TopBar.vue`） | **已删除**（2026-09-28）：`.topbar` / `.brand*` / `.tool` / `.primary` / `.popover--menu` / `.menu__item--*` 和三档响应式断点整块没了。对应的三处去处见第 3 节「无顶栏后的两条宽度线」 |
| `Sidebar.vue`（style@72） | `.sidebar`（column）`.sidebar__body` `.sidebar__panel`（`flex: 1 1 auto; min-height: 0`）。**面板内部的滚动归各面板自己**，这里只保证「不限高、不撑破外层」。原 `.sidebar__tabs` / `.sidebar__tab`（独占一行的页签栏）已在 2026-09 删除，改成下面那套 |
| `SidebarSwitcher.vue`（style@37） | `.sidebar-switcher`（`inline-flex`，高 26px，`flex: 0 0 auto`）`.sidebar-switcher__tab`（30×26，**只画 logo 不写字**，名字放 `title` / `aria-label`；`.is-active` = 底部 `--focus` 高亮 + 底色换 `--bg-panel`，与内容区连成一体）。用 `aria-pressed` 而不是 `role="tab"`：它渲染在面板（页头）内部，不再是独立的 tablist。要断言/选中它时认 `aria-label`（`textContent` 是空的），并且先落到当前可见的那个 `.sidebar__panel` 里 |
| `TestPanel.vue`（style@93） | `.panel`（`flex: 1 1 auto; min-height: 0`，不再写 `height: 100%`）`.panel__head`（`min-height: 35px` + 上下 4px 内边距，左侧放 `SidebarSwitcher`，`flex-wrap: wrap`）`.panel__heading`（`margin-left: auto`，折行后仍贴右）`.verdict[data-tone]`（文案「全部 AC / n/m AC」）`.elapsed` `.select` `.panel__foot` `.run-inline` |
| `FileExplorer.vue`（style@330） | `.explorer`（column，`flex: 1 1 auto`）`.explorer__head`（`height: 35px`，左侧放 `SidebarSwitcher`、右上角两颗按钮；两边加起来离面板下限还远，所以**不折行**）`.explorer__actions`（`flex: 0 0 auto`）`.explorer__btn` `.explorer__tree` `.explorer__input` `.explorer__error`；删除确认弹窗（Teleport 到 body，`z-index: 130`）：`.confirm`（遮罩）`.confirm__card` `.confirm__title` `.confirm__desc` `.confirm__path` `.confirm__actions` `.confirm__btn`（`--danger` 用 `--danger-bg` / `--danger-bg-hover` / `--danger-text`） |
| `TestCaseCard.vue`（style@202） | `.card[data-status]` `.card__head` `.badge[data-status]`（文字是 `verdict` 判定码，见第 5 节坑 1）`.metric` `.icon-btn` `.card__body` `.ta`（输入，高度随内容自增）`.out`（输出）`.run-zone`（撑满徽标到删除按钮之间的运行判定区，`.run-zone__icon` 才是那个 22px 的 ▶）。旧的 `.hint` 已随 2026-09-18 改动删除 |
| `EditorTabs.vue`（style@123） | `.editor-tabs`（`flex: 0 0 35px`）`.editor-tabs__strip`（`flex: 1 1 auto; min-width: 0`，**横向滚动在这里**，运行按钮不跟着滚）`.editor-tabs__item[--active]` `.editor-tabs__dot` `.editor-tabs__label` `.editor-tabs__close`（「设置」合成页签与文件页签共用这套样式）`.editor-tabs__run`（`flex: 0 0 auto`，64×25，`--run-green` 底色；`.is-running` 换 `--danger-bg` / `--danger-text`，见第 3 节） |
| `EditorPane.vue`（style@231） | `.editor-pane` `.editor-pane__stage` `.editor-pane__host`（Monaco 容器）`.editor-pane__empty*` `.editor-pane__status*` |
| `EditorSettingsPanel.vue`（style@539） | `.settings-view`（滚动容器，`container-type: inline-size`）`.settings-view__inner`（目录 + 内容两栏）`.settings-nav*`（左栏分类目录，6 项，`--active` 是选中项）`.setting-group*` `.setting-subtitle`（组内小标题，把「运行时限」与「评测引擎」分开）`.setting-group__note`（分组说明文字，如「应用」组那句）`.setting-row*` `.select` `.number-input` `.switch*` `.runtime-list` `.runtime-row*` `.download-button*`（本地运行环境下载 / 「应用」组安装按钮共用）`.is-spinning`（铺满编辑区的设置视图；原 `.panel-drawer*` / `.icon-button*` / `.done-button*` 已随抽屉外壳一起删掉） |
| `EngineSettingsPanel.vue`（style@103） | `.engine-panel` `.engine-list` `.engine`（`--active` 是选中引擎，整块可点）`.engine__*` `.engine-field*`（服务地址）`.engine-button*`（自检 / 保存）`.engine-probe*`（自检结果文案，`--ok` / `--bad` 由 `is-*` 类控制） |
| `HelpPanel.vue`（style@95） | `.help-content` `.help-group*` `.help-item*`（`.is-bold` 是 `**…**` 加粗片段）`.guide-link`。原 `.help-button` / `.panel-backdrop` / `.panel-drawer*` / `.done-button` 与两段 Transition 已随抽屉外壳一起删掉 |
| `base.css` | **全局元素样式从 `*`（第 154 行）起**：`body`、`button`、`input/textarea/select`、滚动条、`:focus-visible`、`prefers-reduced-motion`。第 4–86 行是深色变量、第 87–153 行是浅色覆盖 |
| `ContextMenu.vue`（style@104） | `.context-menu`（fixed 浮层，`--bg-raised`；`--ready` 才显形——先量完尺寸再定位，避免看见它从屏幕角上跳一下）`.context-menu__item`（`:disabled` 置灰）`.context-menu__divider`。定位靠读 `getBoundingClientRect()` 后按视口四边收敛（`gap`），**别改成 absolute 锚在树节点上**（树一滚菜单就跟着跑） |
| `guide.css` | 指南页专用（`@import './base.css'` 打头）：`.page` `.page__top` `.page__foot` `.brand` `.brand__mark` `.brand__name` `.cta` `.doc` `.doc__lead` `.toc` `.toc__title` `.table-wrap` `.note` 与长文排版。**改它只需看指南页，不影响应用**（见第 12 节） |

## 5. 改样式时的几个坑

1. **状态色是三元组，但徽标文字是判定码**：卡片/徽标颜色用 `data-status="passed|failed|error|running"`（`TestCaseCard.vue`），面板小结用 `data-tone="passed|failed|error|info"`（`TestPanel.vue`），加新状态要同时补 CSS 分支。徽标里显示的文字不是状态名，而是用例记录上的 `verdict` 字段（`AC / WA / CE / TLE / RE / ERR`，没跑时回退「待运行/运行中」）；颜色归 `status`、文案归 `verdict`，两者在 `runner.js` 的补丁里成对产出，别合并成一个字段。
2. **Monaco 文字用 NBSP 渲染**：用脚本读 `.view-lines` 的文本时，空格是 `\u00a0`（charCode 160），`includes('def solve')` 这类断言永远匹配不上。
3. **Monaco 的 `.minimap` DOM 节点始终存在**，关闭时宽度为 0；判断"有没有小地图"要看 `getBoundingClientRect().width`，不是 `querySelector`。
4. **localStorage 里存的是 JSON 字符串**：`cph.panelPosition` 的值是 `"left"`（带引号）。直接比较原始字符串会误判。
5. **统一侧边栏里全是 `v-show`**：整栏折叠（分隔条要能用鼠标/键盘把它拖回来）、栏内两个面板的切换，都不能改成 `v-if`——文件树的展开状态与样例里手填的输入都挂在 DOM 上，切换一次就被销毁重建，用户数据直接丢。副作用有两个：（a）「页签内容在 `display: none` 期间量不到尺寸」，凡是靠 `scrollHeight` / 宽高做自适应的组件（如 `TestCaseCard` 的输入框自增）都得自己接住「从不可见变为可见」那一刻，见坑 8；（b）切换按钮（`SidebarSwitcher`）在两个面板的页头里各有一份实例，**按选择器取它时必须先落到「当前可见的那个 `.sidebar__panel`」里**（用 `getClientRects().length > 0` 判可见），否则会同时拿到隐藏那份，脚本/断言会凭空多出一倍。
6. `@media (prefers-reduced-motion: reduce)` 会全局压掉动画，新增动画不用额外处理。
7. **「设置」是编辑区里的一个合成页签，不是抽屉**（`src/services/settingsTab.js`）：它刻意**不进** `workspaceStore.openTabIds`——那边的 `openTabIds` / `nodeIndex` / 会话恢复全建立在「一个页签 = 一个真实 VFS 节点」之上，塞一个没有节点的 id 进去，`rebuildTree` 会把它当「文件已删除」顺手清掉，`modelManager.release` 也会去找一个不存在的 model。所以它不建模型、不落 localStorage（刷新后回到代码文件是预期行为）。视图与 Monaco 用 **`v-show` 互斥**（不是 `v-if`）：Monaco 实例与设置组件的运行环境探针订阅因此只建立一次。让出激活态统一收口在 `settingsTab.js` 里 `watch(() => workspace.activeId)`；「点已经在活跃的那个文件页签」不改 activeId、不触发该 watch，所以 `EditorTabs.activate()` 里显式再让一次。（「本地运行环境」原先是独立抽屉 + `composables/useLocalRuntime.js`，现两者都不在仓库里了——运行时 UI 已并进设置视图。）设置视图自身是**「目录 + 内容」两栏**（2026-09 改）：左边 `.settings-nav` 是分类目录（编辑器 / 布局 / 评测 / 本地运行环境 / 应用 / 帮助，`SECTIONS` 常量驱动），右边同一时刻**只渲染一组设置**（`v-if` / `v-else-if`，不是 v-show 平铺），当前分类存在组件内的 `activeSection` 里（不落盘，关掉页签再打开仍记得）。原顶栏的「评测引擎设置」弹层与「帮助」抽屉（`HelpPanel.vue`）在 2026-09-28 都并进了这里：引擎列表 / 服务地址 / 自检成为 `EngineSettingsPanel.vue`，挂在「评测」组的「运行时限」下面（`.setting-subtitle` 分开两块）；帮助的问答列表成为「帮助」组，`HelpPanel.vue` 已瘦身成纯内容组件（无按钮 / 无 Teleport / 无 Esc 逻辑）；「应用」组装 `useInstallPrompt()` 的安装按钮（原顶栏那颗）。窄宽度降级不靠 `@media`（设置视图活在编辑区里，视口宽是错的代理），而是在 `.settings-view` 上挂 `container-type: inline-size` + `@container settings (max-width: 560px)` 把目录翻成顶部横向标签条。
8. **用例输入框的高度是 JS 撑的**（`TestCaseCard.vue` 的 `autoGrow`，上限 320px）：改 `.ta` 的内边距 / 字号后高度会自己重算，不用手改。但卡片折叠、以及整个「评测样例」页签被切走时元素都是 `display: none`，此刻 `scrollHeight` 为 0，代码会跳过重算——别把这个空值保护删了，否则折叠一次输入框就被压成 0 高。重算的触发有两处：`watch`（输入变化 / 卡片展开）+ 一个挂在输入框上的 **`ResizeObserver`**（只认宽度从 0 变有值、或面板被拖宽，宽度变大才算，避免回调环）。页签是 `v-show` 切换的，没有重新挂载的时刻，**没有这个 observer 就会一直塌成一行**（旧版只在 `onMounted` 跑一次，切到「评测样例」时必然塌）。
9. **`.run-zone` 是撑满中段的 `<button>`**：里面的 `padding: 0` 不是装饰，是在抵消浏览器给按钮的默认内边距（不抵消的话 ▶ 图标位置会跑偏）；`.run-zone__icon` 才是那个 22px 的 ▶ 本体，悬停点亮的是它。
10. **`theme-color` 是 JS 写的，不是静态 meta**：`App.vue` 切主题时会把 `--bg-chrome` 读出来写进 `<meta name="theme-color">`（装成独立应用后浏览器拿它画窗口标题栏）。`index.html` 里那个 `content` 只是首帧兜底，别在那里维护第二份色值。
11. **删除确认弹窗是自绘的，不要换回 `window.confirm`**：`FileExplorer.vue` 的 `requestDelete()` 只把待删节点记进 `pendingDelete`，真正调用 `deleteNode()` 的是弹窗上「删除」按钮的 `confirmDelete()`。原生 `confirm()` 的返回值在 webview / 装成独立应用窗口打开时不由页面掌控（被浏览器抑制时它自己直接返回一个值），出现过「点取消文件还是没了」。自绘弹窗的取消路径有三条且都只清 `pendingDelete`：取消按钮、点遮罩（`@pointerdown.self`）、Esc；`watch(pendingDelete)` 会在弹窗出现时把焦点送到「删除」上（Enter 即确认）。键盘 `Delete` 键走的是同一个 `requestDelete`，不需要另写一份确认。
12. **新建输入框自带默认名，且要挡住一种「程序性失焦」**（`FileExplorer.vue`）：新建**只从页头两颗按钮发起、固定建在根目录**，输入框由 `FileExplorer` 自己渲染（不再 `provide` 给递归树项，树项里那套「在子目录内联新建」已随右键菜单一起删掉）；`startCreate(type)` 预填默认名字——文件按 `activeLanguage` 给 `new.cpp` / `new.py`、目录给「新建文件夹」，与根目录下已有名字相撞就自动排到 `new-2`、`new-3`；焦点靠 `nextTick(focusCreateInput)`（聚焦 + 全选）送进去，`autofocus` 属性对动态插入的节点不生效、指望不上。真正阴的地方是失焦提交：创建成功后会自动**打开**新文件，`EditorPane` 在 `activeId` 变化时会 `instance.focus()`（打开文件抢焦点本身是正常行为，别删它），这一抢就落在内联输入框头上 → 输入框 `blur` → 失焦提交 → **凭空多出一个默认名的文件**（连点两次「新建文件」时必现：第二轮输入框刚聚焦就被提交掉）。所以绑的是 `onCreateBlur()` 而不是直接 `commitCreate()`，用 `createFlights`（在途创建轮次的 state 集合）分两种：屏幕上这个输入框自己正在提交（失焦正来自「打开刚建好的文件」）→ 跳过重复提交、也不抢焦点，让焦点留在 Monaco；在途的是上一轮、屏幕上这个是新一轮被误伤的 → `nextTick` 把焦点抢回来（Monaco 的 focus 在 pre-flush watcher 里，抢得赢）并放弃提交。
13. **`tabSize` / `insertSpaces` 是 model 级选项，不是编辑器选项**（`services/editorOptions.js` 的 `editorModelOptions` + `EditorPane.vue` 的 `applyModelOptions`）：monaco 0.56 的 `EditorOption` 枚举里**根本没有这两项**（整个 `esm/vs/editor/common/editorOptions.js` 里搜不到 `tabSize`），真实定义在 `ITextModelCreationOptions` / `ITextModelUpdateOptions`。把 `tabSize: 2` 塞进 `editor.create()` 或 `editor.updateOptions()`，`EditorOptionsUtil.validateOptions()` 会当成未知键**静默丢掉**——面板看起来改了、localStorage 也存了，编辑器却一直按 4 空格渲染，而且 `getOption(EditorOption.tabSize)` 返回 `undefined`，不细看根本发现不了。正确姿势是 `model.updateOptions({ tabSize, insertSpaces })`，并且**每挂一个 model 都要补一次**（`setModel()` 之后、切文件 / 新建文件都算），否则新 model 立刻退回默认值。校验这类「改了没生效」的选项时，要读 `editor.getModel().getOptions()`，不是 `editor.getOption()`。顺带记一句默认值：`tabSize` 沿用改造前的 4，`insertSpaces` 刻意是 **`false`（关闭，按 Tab 出制表符）**——Monaco 自己的默认是 `true`，这是全表唯一一处刻意偏离 Monaco 默认的项（`editorOptions.js` 文件头也写了）。
14. **文件树的右键事件必须 `.stop`**（`FileTreeItem.vue` 的 `@contextmenu.stop="onContextMenu"`）：树根 `.explorer__tree` 上也挂了一个 `@contextmenu`（`onTreeContextMenu`，负责屏蔽空白处右键的原生菜单），而节点的右键**会冒泡到树根**——不 `.stop` 的话节点菜单会被树根那一次覆盖掉，症状是「右键文件/文件夹没反应、右键空白处反而正常」。另外菜单项只保留「重命名」「删除」两项，**不要**把「新建文件 / 新建文件夹」放回去（那是页头两颗按钮的活）。
15. **判题语言没有独立状态，由活跃文件的扩展名派生**（`App.vue` 的 `activeLanguage`）：2026-09-28 顶栏整体删除时那颗语言下拉也一并删了，`cph.language` 随之成为死键（见第 6 节）。现在 `runAll()` / `runOne()` 直接拿 `activeLanguage` + `activeNode.path` 调 `wasmRuntime.runCase()`（`.py` 走解释分支、其余走 C++ 分支），`workspaceStore.initWorkspaceStore()` 里那句 `openLanguage()` 只剩「首次启动给 `/main.cpp` 兜底」这一个作用。**别把语言选择器加回来**——它与「一个页签 = 一个真实文件」这套模型天然冗余，加回来就得再造一份语言状态去和活跃文件抢口径。想加「新建 Python 文件」入口也不用碰状态层，改 `FileExplorer` 的默认名规则即可（见坑 12）。
16. **语言图标有两处不能随手改的地方**（`AppIcon.vue`）：图标分两张表——`PATHS`（24×24 描边线性图标，主力）与 `SOLID_PATHS`（整块实心路径，`fill: currentColor` 且不描边，`solid` 由 `name in SOLID_PATHS` 判定）；另有 `VIEWBOX` 表存放「不在 24 网格上」的图标的专用方框（模板是 `:viewBox="VIEWBOX[name] ?? '0 0 24 24'"`，目前只有 `cpp` 一项）。C++ 用的是 seti-ui 的 `icons/cpp.svg`（MIT）——**VS Code 默认的 Seti 文件图标主题**（字形 `\E01A`，Seti 配色 `#519aba`）用的就是它，2026-09 从 simple-icons 那枚实心六边形字标换过来（那个在 15px 下糊成一团）。两个坑：
    - **它原始网格是 32×32**，直接套 `0 0 24 24` 会明显偏小，所以方框取边长 22（15px 下墨迹约 12.1×11.0px，与 `folder` 的 12.5×11.25 齐平）。
    - **方框的 `min-x` 被刻意右移到 `4.733`**（= 6.2 − 22/15，正好让 15px 尺寸下右移 1px）：这枚字形左边是大块实心的「C」、右边是两个细「+」，外框虽然几何居中（实测 cpp 与 python 的墨迹中点重合在同一条竖线上），但墨迹重心比中点偏左约 0.7px，排到 python 旁边看着不齐。**别改回 6.2**，也别想着去动 python 的 viewBox——python / folder / file / header 都是几何居中的，动它们会让整列图标一起偏。
    图标本身不带颜色，一律 `currentColor` 跟主题走（没照搬 Seti 蓝）。

## 6. 已持久化的状态（加设置项时照抄这套）

| key | 内容 | 位置 |
| --- | --- | --- |
| `App.vue`（`EDITOR_SETTINGS_KEY` / `readEditorSettings()` / `updateEditorSettings()`，约 38–112 行；定义在 `services/editorOptions.js`） | `cph.editorSettings` + `cph.editorSettingsVersion` | 编辑器偏好共 27 项（主题、字体族 / 字号 / 行高 / 连字、Tab 宽度 / 空格代替 Tab / 自动换行 / 换行列宽、光标样式 / 闪烁 / 平滑移动、当前行突出、空白字符、缩略图、括号对着色 / 缩进参考线 / 括号参考线、粘性滚动 / 滚过最后一行 / 平滑滚动、内边距、滚动条粗细、补全 / 参数提示 / 标签联动 / 行内建议）。**默认值、可选项表、逐键校验、偏好 → Monaco 选项的映射全部在 `src/services/editorOptions.js` 一处**，面板下拉、读盘校验、Monaco 吃到的选项三者共用，加新项只改这一个文件（面板加一行描述即可，见 `EditorSettingsPanel.vue` 的 `EDITOR_GROUPS`）。`Version` 只用于一次性把 v3 之前的 `vs` 主题迁成 `cph-light`，不参与其余键 |
| `cph.panelVisible` / `cph.panelPosition`（`App.vue:27-29`） | 统一侧边栏是否展开 / 侧边栏在左还是右（键名是历史沿革，语义已从「测试面板」扩到整栏） |
| `cph.sidebarTab` | 侧边栏当前面板（`explorer` / `tests`），认不出来的值一律退回 `explorer`。**没有 `settings`**——设置页签刻意不落盘（见第 5 节坑 7） | `Sidebar.vue`（页头里的 `SidebarSwitcher` 只是消费方，经 provide 拿状态） |
| `cph.editorShare`（`App.vue:31`） | 两栏比例（%） |
| `cph.timeLimitMs`（`App.vue:35`） | 全局时限（毫秒，只计运行段） |
| `cph.drafts` / `cph.testCases` / `cph.engine` / `cph.judgeBases`（`App.vue:32-33` 与用例段） | 各语言草稿、用例、引擎、服务地址 |
| ~~`cph.language`~~ | **已作废**（2026-09 顶栏语言下拉移除后成为死键，全仓不再读写）；残留在 localStorage 里无害。判题语言现在一律由活跃文件的扩展名派生，见第 5 节坑 15 | — |
| `cph.mobileKeyboard` / `cph.mobileInputDock` | 都已作废（两个版本的键盘适配都不再持久化）；残留在 localStorage 里无害 | `composables/useMobileKeyboard.js` |
| `cph.localRuntime.clangReady` / `cph.localRuntime.pythonReady` | C++ / Python 本地运行时是否已拉取。**只作首帧播种，不是权威判据**：权威判据是 `wasmRuntime.probeRuntime()`（内存已加载 → SW Cache Storage → HTTP 缓存 `only-if-cached` 探针，全程不触网）；**探的时机只有一个**——`EditorSettingsPanel` 的 `watch(() => props.active)` 在切到设置视图时调一次 `reconcile()`（页面加载、任务状态推进时都**不**探：`only-if-cached` 未命中会在控制台记一条 `ERR_CACHE_MISS`，页面一加载就探等于白刷一屏红字）。标记过期（缓存被清）或缺失（直接跑代码落了缓存）都会在那一刻被正回来 | `EditorSettingsPanel.vue`（本地运行环境分组；下载走 `wasmRuntime.preload(language)`） |
| `cph.pchUnsupported` | 本机被判定扛不住 PCH（生成时 OOM / cc1 卡死，或 PCH 加载校验失败）后写下的永久开关；有它就不再生成、编译也不再挂 PCH | `runnoSandbox.js` |

另外 PCH 二进制（约 6.9MB）存 IndexedDB 而不是 localStorage：库名 `cph-pch`、store 名 `pch`，记录形状 `{ id, bytes: Uint8Array, size, createdAt }`；`id = 存档版本:工具链版本:微缩头内容的 FNV-1a 哈希`（当前是 `1:8.0.1:69dc7cd9`），三者任一变化旧存档自然失效，取存档只按这个 id。

写值统一走 `usePersistentRef(key, defaultValue)`；`editorSettings` 因为要版本迁移，单独用 deep watch 存。加编辑器设置项时**必须**两道校验都过：读盘（`readEditorSettings()`）与面板回写（`updateEditorSettings()`）都逐键走 `editorOptions.js` 的 `normalizeEditorSetting()`，不在默认值表里的键直接丢弃、越界数字退回默认——所以 localStorage 里手改出来的 `fontSize: 999`、认不出的 `cursorStyle`、乃至早已移除的旧键都不会漏进编辑器。

## 7. 现在的功能边界（写文案时别夸大）

- 引擎：Piston（默认，需自建服务）/ Judge0 / **本地 WASM 沙箱**。本地沙箱支持 **C++ 与 Python**，首次运行要下载工具链（`public/wasm/8.0.1/` 自托管的 clang + wasm-ld + sysroot，裸文件约 52MB、由 Vercel 边缘压缩传输，之后工具链常驻 HTTP 缓存）。下载**只有一个入口**：设置视图目录里的「本地运行环境」（C++ / Python 两行同一套数据驱动渲染，下载中另一行按钮自动禁用；状态在 `EditorSettingsPanel.vue` 里，直接调 `wasmRuntime.preload(language)`）。编译产物按源码原文缓存一份，所以成批跑用例时只有第一个用例付编译开销。
- **本地沙箱的 Python（2026-09 加）**：走 CPython 3.11.3 的 wasm32-wasi 构建（`public/wasm/python-3.11.3/`，约 24MB，来源与 C++ 工具链一致，都取自 `taybenlor/runno` 的 `langs/`）。没有编译段：`runPython()` 直接把整棵 VFS 拍成 fs、以 `args: ['python', 入口文件]` 拉起解释器，多文件 `import` 靠 `sys.path[0] = '/'` 找到同目录的模块。标准库打包在 `/usr/local/lib/python311.zip`（zipimport），`sys.prefix` 编译期写死为 `/usr/local`，所以 **env 必须留空**（不要自作聪明加 `PYTHONHOME`）。语言路由在 `wasmRuntime.runCase()`：`language === 'python'` 走解释分支，其余原样走 C++ 分支；`entryPath` 由 App 从当前激活文件传下来。Python 与 C++ 互不影响，改一边不用管另一边。
- Vim 键位已移除（与 Monaco 0.56 不兼容），别再被试着重加。
- TLE：面板页头的「时限」（1/2/5/10 s，默认 1 s）只计**程序运行段**，不含编译；超时靠 `kill()` 当前 WASI 实例实现。卡片上的耗时**同样是运行段**（与时限同口径），程序没跑起来时（编译失败 / 编译错误）卡片不显示耗时。Python 没有编译段，它的「运行段」包含解释器冷启动（实测约 190ms），因此 `wasmRuntime.js` 给 Python 的 run 时限额外加 `PYTHON_STARTUP_ALLOWANCE_MS = 500` 余量——不加的话 1s 时限会被启动开销吃掉一大截，跑得再快的程序也可能被判 TLE。代价是 TLE 最多晚 0.5s 报出来。
- **耗时口径（2026-09 改过，别改回去）**：卡片数字 = `runCpp` 里只包住 `runWasi` 的那一段（Python 同理，是 `runPython` 里只包住 `runWasi` 的那一段），编译时间不计入。原先取的是 `runCase()` 入口到结束的墙钟，于是第一个用例含编译、命中编译缓存的后续用例只含运行，**同一份代码下第一个卡片能比其余大好几倍**（修前 3 个用例是「数百 ms + 9ms + 12ms」，修后 10/11/7ms），很容易被误读成「程序在第一个用例上特别慢」。面板页头那个 `elapsed` 现在也是同一口径：取当轮所有卡片耗时的**最大值**（`App.vue` 里是 computed，单独跑一个用例也会跟着更新），标题写明「最慢用例耗时」。TLE 消息里的 `durationMs` 与卡片同口径（`wasmRuntime.js` 在进入 `run` 段时重置 `stageStartedAt`）。
- 判定词表：引擎 outcome 是 `ok / compile-error / runtime-error / timeout / unreachable / cancelled`（见 `src/services/runner.js`、`src/services/engines/index.js`）；`runner.js` 再把它翻译成卡片徽标上的 **verdict 判定码**：`ok` + 比对一致 → `AC`，`ok` + 不一致 → `WA`，`compile-error` → `CE`，`timeout` → `TLE`，`runtime-error` → `RE`，`unreachable` 等基础设施失败 → `ERR`。徽标颜色仍按 `status`（passed 绿 / failed 红 / error 琥珀）。`compare.js` 只返回布尔，**不再**产出「输出多 N 行 / 第 N 行不匹配」这类 hint 文案（2026-09-18 起，卡片头部不再显示它）。
- 判题流程：先编译运行出实际输出，再与期望输出比对（`src/services/compare.js`）。
- 工具链是静态自托管的（`public/wasm/8.0.1/`），但 `clang-fs.tar.gz` 这个扩展名会让静态服务器补上 `Content-Encoding: gzip`，浏览器已替我们解过一层，所以 `runnoSandbox.js` 里用**魔数判断**要不要 gunzip。换托管方时别把 `unpackSysroot` 改回无条件 `gunzip`（失败时 Chrome 只会报一句 "Failed to fetch"，很难查）。
- 工具链地址里的 `8.0.1` 是**目录版本号**：升级工具链就换目录名，旧的 immutable 缓存自然失效；别在原地覆盖同名文件（浏览器会继续用缓存里的旧版本）。
- 编译产物缓存只留**最近一份源码**（`runnoSandbox.js` 的 `compileCache`）：命中时连工具链都不碰，第 2..N 个用例只付运行开销；编译失败的结论同样会被缓存，改代码即失效。别把它改成常驻多份——用例总是成批跑的，代码一改全都作废。
- **STL 预编译头（PCH）**：为老机器省掉每次编译反复解析 STL 头的开销，全流程都在 `runnoSandbox.js` / `pchStore.js` / `wasmRuntime.js`，没有独立 worker。改这一块时几条不能破的约定：
  - 微缩头 `MICRO_STDCXX_H` 刻意只含 `<iostream> <vector> <string> <algorithm> <map>` 5 个，`.pch` 实测 6.91MB（在 10–20MB 目标内）；**不要**换成几万行的完整 `bits/stdc++.h`（UNIVERSAL_HEADER 那份是挂给用户代码 `#include <bits/stdc++.h>` 用的，两回事）。
  - PCH 生成与用户编译必须**逐字共用** `FRONTEND_ARGS`（`-std=c++17 -O2`、三个 `-internal-isystem` 路径等）：PCH 文件签名里含语言/目标选项和头文件搜索路径，参数对不上 clang 加载时直接 fatal，还可能混进语义不一致的 libc++ AST。生成走 cc1 直连：`-cc1 -emit-pch -x c++-header`（我们从来没有 driver，别写成 `clang -x c++-header ... -emit-pch`）。
  - 生成只走后台：`wasmRuntime.warmupPch()` 在「首次编译成功」或「手点下载成功」后，经 `requestIdleCallback` 排进**同一条串行队列**（不能并行——sysroot + PCH 克隆会让内存翻倍，老机器正是要避开这个）。生成带 3 分钟看门狗，失败（OOM / 卡死）写 `cph.pchUnsupported=true` 且**以后任何路径都不再重试**。
  - `generatePch()` 先查 IndexedDB 存档，命中是毫秒级返回且**不会**拉起工具链；编译路径的 `loadPchBytes()` 只读存档、**绝不触发生成**——没备好就平滑走普通编译。带 PCH 时把 `/stdc++.h`（源码）和 `/stdc++.h.pch`（二进制）一起挂进 MemFS，参数追加 `-include-pch`，链接前把 `.pch` 从 fs 摘掉（免得 7MB 白克隆给 wasm-ld）。
  - 判废条件必须窄：只有「带了 PCH、没产出 `.o`、且 stderr 命中 `/stdc\+\+\.h\.pch|precompiled header/i`」才判废（删存档 + 置标记 + 普通编译重试一次）。用户自己代码写错同样没有 `.o`，放宽条件会让每次编译错误都白编一遍并永久关掉加速。
  - 实测（2026-09，本机 headless Chrome）：生成约 510–580ms；公平 A/B 下编译+运行 937ms → 730ms，真实 UI 每题 601ms → 354ms，输出逐字一致。数字含 WASI 启动 + sysroot 克隆 + 链接固定开销，老机器上 STL 解析占比更高，绝对收益更大，别在文案里承诺固定倍率。
- **wasm-opt 二次优化：实测无收益，刻意不接进构建**（2026-09 测过并决策放弃）。`npm run wasm:opt`（`scripts/optimize-wasm.mjs`）能对 `clang.wasm` 跑 `-Oz`，但上游这份已经是裁剪过的终态：code 段占 80.7%，抠不动；文件里**没有 name section**，「抹掉调试符号」几乎无对象；而且 `-Oz` 重排指令会让 **gzip 反而变大 0.98%**（老机器真正传输的是压缩流）。实测：`-Oz` → raw −1.89% / gzip **+0.98%**，`-Oz --strip` → raw −2.78% / gzip −0.15%，且函数数量不变、JIT 编译单元不变。**结论：不要做 dev/prod 资源分流去引第二个 30MB 文件**，脚本留着当资产（将来换未优化的工具链、比如 clang 18，可以重测）。脚本优先用 `tools/binaryen/` 下 gitignore 掉的原生二进制（比 npm 的 wasm 版快一个量级），没有才回退到 npm 包 / `WASM_OPT_BIN` / PATH。
- **PWA：装到设备后可独立窗口运行，离线也能编译**（2026-09 加，见第 9 节）。语言工具链**不在 install 预缓存**：用户用哪个语言，才在第一次真正请求时把哪个拉下来并落进 `cph-toolchain-*`（`cacheFirst` 按 `/wasm/` 前缀分流），拉过一次之后一样能离线用。所以「断网也能编译」的前提是该语言此前已经用过一次；离线状态下本地沙箱、判题、主题、布局照常，只有 Piston / Judge0 这两种远端引擎、以及尚未拉取过的语言会失效。装完之后设置视图「应用」分组里的安装按钮自动消失，也不会再重复提示。

## 8. 验证方式

- **跑 `npm run verify` 前的两个前置**（只影响无头回归，`npm run dev` 不需要）：
  - **Node / npm 不在 PATH 里**就先补上，例如 `export PATH="/Users/hezixia/.local/node-v22.23.3-darwin-arm64/bin:$PATH"`（按自己机器改路径）。
  - 脚本用 `puppeteer-core` 驱动 Chrome，默认候选是 `/Applications` 下那几个；本机没装就设 `CHROME_PATH` 指到 Chrome for Testing，例如 `CHROME_PATH="/Users/hezixia/.cache/cft/chrome/mac_arm-154.0.8037.57/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"`。
- 手工：`npm run dev`，浏览器 http://localhost:5199，重点看**两套主题各一遍**、面板折叠/展开、分隔条拖拽与双击。
- 本地沙箱端到端（动过 `runnoSandbox.js` / `wasmRuntime.js` / 工具链目录后必做）：手工路径是打开设置页签（侧栏页头第三颗齿轮图标）→「评测」组里选「本地 WASM 沙箱」→ 跑一段带 `vector` / `sort` 的 A+B，看输出对不对、同一份代码第二次跑是否秒回（编译缓存）。想自动化就临时写个 puppeteer 脚本，在页面上下文 `import('/src/services/runnoSandbox.js')` 后直接调 `preloadToolchain()` 和 `runCpp({ code, stdin })`——**用完删掉脚本**，仓库里不留临时探针（这条纪律之前踩过：残留探针把 `scripts/` 弄得很乱）。
- Python 专项（动过 `runPython` / 语言路由 / `python-3.11.3/` 目录后必做），同样临时探针、用完即删：手工路径是新建/打开一个 `.py` 文件（面板会自动切到 Python）→ 在设置里切「本地 WASM 沙箱」→ 运行，应看到 AC 且耗时在 100–200ms 量级；再补一条用例验证 `import` 同目录的另一个 `.py`（多文件路径）。自动化时在页面上下文 `import('/src/services/runnoSandbox.js')` 后直接调 `runPython({ code, entryPath, fs })`，注意 `fs` 是「路径 → `{ path, content, mode, timestamps }`」的映射，别直接塞裸字符串。
- PCH 专项（动过 PCH 段落 / `FRONTEND_ARGS` / 微缩头后必做），同样临时探针、用完即删：
  1. DevTools → Application → IndexedDB 删 `cph-pch` 库、localStorage 删 `cph.pchUnsupported`，从零开始；
  2. 在设置里切「本地 WASM 沙箱」，点一次「运行全部」（默认模板是合法 A+B，输出应判定通过），随后 IndexedDB 的 `pch` store 应在约 1 秒内自己出现一条 7,249,912 字节、id 前缀 `1:8.0.1:` 的记录（证明后台 `warmupPch()` 真的跑了）；
  3. 刷新页面再跑一次：编译应吃到存档（UI 每题耗时约从 600ms 降到 350ms 量级），输出与首次逐字一致；
  4. 降级：把那条记录的 `bytes` 改成任意垃圾字节再刷新运行，用户代码仍应正常通过，同时 `cph.pchUnsupported` 被置成 `true`、坏记录被删。
  注意：直接 `import` 模块做 A/B 时，无 PCH 基线要用「先置 `cph.pchUnsupported=true`」走真实降级分支，不要只是改参数——对比的必须是两条产品代码路径。
- PWA / 离线专项（动过 `sw.js` / manifest / 图标 / 预缓存清单后必做），仍然临时探针、用完即删：
  1. `npm run build && npm run preview`（**必须是生产构建**，dev 下不注册 SW），DevTools → Application 应看到 manifest 无报错、Service Worker 已是 `activated`；
  2. Application → Cache Storage 应只有 `cph-shell-v2`（约 100 条：外壳 + 全部 Monaco 分块 + 静态资源）；`cph-toolchain-v2` **install 之后不该存在**——要等真的跑过一次本地沙箱（该语言工具链被请求）才出现，且里面只会有用过的那个语言的文件；
  3. 在设置里切「本地 WASM 沙箱」跑一次「运行全部」，确认判定通过；
  4. DevTools → Network 勾 Offline（或直接拔网线），刷新页面：界面应正常渲染，再跑一次「运行全部」仍应通过——这一步才是真的在验工具链入了缓存，只看第 2 步的条数不够；
  5. 自动化同上一节：临时 puppeteer 脚本里用 `Page.getAppManifest` 拿 manifest 解析错误、用 `page.setOfflineMode(true)` 断网后跑一遍，跑完删脚本。
- 布局宽度专项（动过 `SidebarSwitcher.vue` / `EditorTabs.vue` / 侧栏各面板页头 / `.pane--tests` 下限后必做），临时探针、用完即删：在 1680 / 560 / 414 / 375 / 320 五档量四件事——（a）侧栏页头三颗图标（`aria-label` 认「资源管理器 / 评测样例 / 设置」）都可见、宽 30、且右缘不超页头右缘，（b）`.editor-tabs__run` 存在、宽 ≥ 40、左右缘都落在视口内（没被裁），（c）`documentElement.scrollWidth === innerWidth`（无横向溢出），（d）`.workspace` 的 `getBoundingClientRect().top === 0`（顶栏确实没了、工作区贴顶）。**只看有没有横向滚动条不够**：`.editor-tabs__strip` 自己会滚，真溢出反而被它吸收；要按第 3 节那个「必需宽度」公式自己算。2026-09-28 的实测表与结论记在第 3 节「无顶栏后的两条宽度线」。
- 无头回归：`scripts/verify-ui.mjs`（`npm run verify`）。**A–F 都应当是绿的**，跑之前先知道这几条：
  - **B 步（切布局）走的是「设置页签」这条路**（2026-09 改）：点侧栏页头那颗 `aria-label === '设置'` 的 `.sidebar-switcher__tab`（它落在**当前可见的那个 `.sidebar__panel`** 里；`textContent` 是空的，认 `aria-label`）→ 断言编辑区里 `.settings-view` 真显示、`.editor-tabs__item--active` 落在含「设置」的那个页签上、`!document.querySelector('.topbar')` 且 `.workspace` 贴顶、目录里正好 6 个 `.settings-nav__item`（编辑器 / 布局 / 评测 / 本地运行环境 / 应用 / 帮助） → **点目录里的「布局」**（设置是「目录 + 内容」两栏，默认停在「编辑器」，右侧只渲染当前那一组，不点就找不到换边入口）→ 在页签里选「左侧」→ 点 `.editor-tabs__close[aria-label="关闭设置"]` 关掉 → 断言设置视图与设置页签一起消失。设置仍是 `v-show` 的视图、不是抽屉，所以「Monaco 实例不重建」的老断言（`data-marker`）照样成立。
  - **F 步（Python 模板与判题语言）走的是「资源管理器 → 点 main.py」这条路**（2026-09 改）：顶栏语言下拉已移除，语言只跟活跃文件的扩展名走。所以步骤是——先按 `aria-label` 点可见面板里的「资源管理器」（`SidebarSwitcher` **只画 logo，`textContent` 是空的**，用 `textContent` 找不到它）→ DOM click 标签为 `main.py` 的 `.tree-item__row` → 断言 `.view-lines` 文本（NBSP 已归一）含 `def solve`、`.editor-tabs__item--active` 是 `main.py`、动态 `import('/src/services/vfs/workspaceStore.js')` 后 `activeLanguage === 'python'` 且 `activeNode.path === '/main.py'`、`[...document.querySelectorAll('select')].every((el) => !!el.closest('.settings-view'))`（钉住「顶栏语言下拉不会复活」——现在全站只剩设置视图里那几个原生下拉）。
  - F 步曾长期误报：断言切到 Python 后 `.view-lines` 文本含 `def solve`，而 Monaco 把空格渲染成 NBSP（第 5 节坑 2），`includes('def solve')` **永远匹配不上**——已修（断言前把 `\u00a0` 归一成空格），现在过。这条 NBSP 归一化仍在用，别退回直接 `includes`。对照 A 步的 `includes('include')` 因为不含空格，从来没被这条绊到。
  - 它自己起 dev server，和常驻的 5199 冲突（`--strictPort`，撞上就直接退出），跑的时候用 `VERIFY_PORT=<任意空闲端口>` 覆盖（端口占用很随机，别写死某一个）。
  - 它跑的是默认 Piston 引擎（需要本地有 `localhost:2000` 服务），所以**E 步是「空过」**：断言只看徽标数量，引擎连不上、三个卡片全报错也照样 PASS，验不到本地沙箱。
  - **E 步同时守「开跑必亮结果」**（见第 3 节）：跑之前先把侧栏切回「资源管理器」再双击分隔条折叠，然后点编辑器那颗运行按钮，收尾断言 `.pane--tests` 又可见、且激活页签是「评测样例」（`collapsedBeforeRun` / `revealedAfterRun` 两个字段）。顺序不能反——折叠后整栏 `display: none`，页头那几颗切换图标就点不到了。这一改让 E 收尾时侧栏停在「评测样例」，F 步本来就会自己切回「资源管理器」，两边不冲突。
  - 2026-09 修掉的三处**恒假断言**（探针自己写错，别再踩）：偏好存的是 JSON 字符串（`"left"`）必须 `JSON.parse` 才能比；`.minimap` 节点常驻 DOM（宽度 0），可见性只能看渲染宽度；D 步拖拽方向要按当前 `flexDirection` 推导——前序 B/C 已把面板切到左侧，写死向右会让测试栏反向变宽。
  - 各步之间有状态耦合（B/C 切布局会影响 D 的期望方向），改断言时顺着看一遍。
- 回归脚本会把截图写到仓库根目录的 `cph-*.png`（可用 `SHOT_DIR` 改路径），`.gitignore` 已忽略它们，不用管。

## 9. PWA（可安装 / 独立窗口 / 离线）

2026-09 加，全程**零新增依赖**（没用 `vite-plugin-pwa`，也没用 Workbox）。四块拼图：

| 文件 | 职责 |
| --- | --- |
| `public/manifest.webmanifest` | `display: standalone`、`start_url: /`、`scope: /`、`id: /`；`theme_color` 只有首帧兜底作用，真正生效的是 `App.vue` 写进去的值 |
| `public/icons/*.png` | `icon-192/512`（圆角、透明角）、`icon-maskable-192/512`（满幅方块 + 图形收在安全区内）、`apple-touch-icon`（180，满幅） |
| `public/sw.js` | Service Worker，缓存策略见下 |
| `src/composables/useInstallPrompt.js` | 拦 `beforeinstallprompt` 交给设置视图「应用」分组里的安装按钮，跟踪 `appinstalled` 与 `display-mode: standalone` |

**Service Worker 的三段策略**：

- `install`：读构建期产出的 `/precache-manifest.json` 拿全部带哈希的产物名，与 `sw.js` 里手写的 `STATIC_ASSETS`（`public/` 下那些不过构建的静态资源：favicon、manifest、图标）合并后一起预缓存进 `cph-shell-v2`。**语言工具链不预缓存**——install 阶段不拉任何 `/wasm/` 资产，用户用哪个语言、哪个语言才在第一次请求时被 `cacheFirst` 写进 `cph-toolchain-v2`。**逐条 `catch` 容错**：任何一条失败都不能让整次 install 作废（install 失败等于永远装不上），漏掉的之后由 fetch 处理器补。
- `activate`：删掉名字不在保留名单里的缓存桶，再 `clients.claim()`。
- `fetch`：只碰同源 GET。**导航网络优先**（重新部署后刷新一次就拿到新外壳，断网才退回缓存的 `index.html`），其余缓存优先。跨域一律放行——判题服务地址是用户填的，SW 插手就会变成 CORS 事故；带 `range` 头的请求也放行，206 塞进 Cache Storage 会抛错。

**为什么文件名清单要构建期生成**：产物名带内容哈希，没法在 `sw.js` 里硬编码。`vite.config.js` 里那个 `cph-precache-manifest` 插件在 `generateBundle` 时把 `bundle` 的键写成 `precache-manifest.json`，正好绕开引依赖这件事。加产物类型（比如新图）时它会自动跟上，**不用改 `sw.js`**；但 `public/` 下的东西不过 `bundle`，加文件必须手动补进 `STATIC_ASSETS`（第 1 节表里那两条约束就是这么来的）。

**两个版本号，别混**：

- `sw.js` 的 `VERSION = 'v2'` —— 常量前缀，决定缓存桶名。改缓存策略或 `STATIC_ASSETS` 就升它，`activate` 会把旧桶整个删掉。**只在缓存桶名上生效，和工具链版本无关。**
- 工具链目录 `public/wasm/8.0.1/`（C++）与 `public/wasm/python-3.11.3/`（Python）—— 目录名就是版本号，换名字即自然失效（URL 变了，浏览器与 SW 都当新资源重新取）。**不用再改 `sw.js`**：工具链已改成按需缓存的，`cacheFirst` 只按 `/wasm/` 前缀分流、不认具体版本目录。

**注册时机**：`src/main.js` 里 `import.meta.env.PROD && 'serviceWorker' in navigator` 才注册，且挂在 `window.load` 上。**dev 下刻意不注册**——Vite 的模块是即时编译的，缓存它只会让改完代码看到旧页面；所以 `npm run dev` 里既没有安装入口也测不到离线，要验就走 `npm run build && npm run preview`。

**安装入口**：设置视图「应用」分组里那个「安装」按钮只在 `beforeinstallprompt` 真的触发后才可点（说明浏览器已判定可安装；不可安装时它 `disabled`），点它调 `prompt()`，`userChoice` 返回后事件即失效、按钮跟着置灰；已经装在独立窗口里跑或已被 `appinstalled` 标记过，也不再提示（文案变「已安装」）。iOS Safari 没有 `beforeinstallprompt`，只能手动「分享 → 添加到主屏幕」，未做提示引导（要加就在这里加）。

## 10. 部署（GitHub + Vercel）

- 仓库：https://github.com/hejiehejiehejiehejie/wasm-oj-frontend.git （私有），`main` 分支就是部署分支，推上去 Vercel 自动构建。
- Vercel 面板导入时的配置：Framework Preset 选 `Vite`，Build Command `npm run build`，Output Directory `dist`，Install Command 用默认。
  - **环境变量留空**：前端没有任何密钥；判题服务地址是用户在设置视图「评测」组里填的，存在 `cph.judgeBases` 里。
  - Node 版本不用在面板上设，`package.json` 的 `engines.node = 22.x` 已经钉死，`build` 就是一句 `vite build`。
- `vercel.json` 负责六件事，**别删**：
  1. 全站注入 COOP `same-origin` / COEP `require-corp` —— 少任何一个，本地沙箱连 `SharedArrayBuffer` 都拿不到；
  2. `.wasm` 声明 `Content-Type: application/wasm` —— MIME 不对时 `WebAssembly.instantiateStreaming` 会直接拒绝加载；
  3. `.wasm` 与 `/wasm/(.*)` 一年 immutable 缓存；
  4. `/manifest.webmanifest` 补 `Content-Type: application/manifest+json` 并禁缓存 —— Vercel 对这个扩展名的 MIME 不保证，错了 Chrome 会直接判定「manifest 无效」从而不给出安装入口；
  5. `/sw.js` 与 `/precache-manifest.json` 禁缓存（`max-age=0, must-revalidate`）—— Service Worker 脚本被长缓存的话，发了新版用户也永远拿不到。
  6. `/robots.txt` 补 `text/plain; charset=utf-8`、`/sitemap.xml` 补 `application/xml; charset=utf-8`，两者都禁缓存（见第 12 节）。
  本地 `vite.config.js` 的 `server.headers` / `preview.headers` 是同一组头的开发侧对应物，两边要一起改。
- 工具链裸文件（约 52MB）直接进仓库：Vercel 边缘会做压缩传输，**不要自己塞 `.br` / `.gz` 预压缩文件**——那会被二次压缩成 `Content-Encoding: br, br`，Safari 直接崩。
- 最大的单文件 31.2MB，远低于 GitHub 的 100MB 单文件上限，可以直接 `git push`（但会明显变慢，属正常）。
- `public/` 下另有被 gitignore 的 `clang_opt.wasm` 之类产物不要提交（见第 7 节的 wasm-opt 结论）。
- 部署后的冒烟检查：

  ```bash
  curl -sI https://<域名>/wasm/8.0.1/clang.wasm | grep -iE "content-type|cache-control"
  curl -sI https://<域名>/wasm/8.0.1/clang-fs.tar.gz | grep -iE "content-encoding|content-length"
  curl -sI https://<域名>/manifest.webmanifest | grep -iE "content-type|cache-control"
  curl -sI https://<域名>/sw.js | grep -iE "cache-control"
  ```

  第一条要看到 `application/wasm`；第二条的 `content-encoding` 有没有 `gzip` 都能跑（代码按魔数兼容两种），只要别出现 `br, br` 这类双重编码；第三条要是 `application/manifest+json`；第四条要是 `max-age=0`。（注意这里 curl 拿到的是 Vercel 边缘**传输态**的表头，和浏览器 Cache Storage 里存的东西是两回事，别拿它去推 SW 的行为。）

## 11. 建议的样式工作顺序

1. 先只改 `src/styles/base.css` 的变量值（最小风险，两套主题一起看）。
2. 再动单个组件的 scoped 样式，每次只改一个组件，改完立刻两套主题 + 折叠/拖拽回归。
3. 需要新颜色时，先在 `base.css` 里按分组命名（两套主题都写），再到组件里引用；不要把色值写在组件里"临时代替"。

## 12. SEO 与第二个入口 guide.html

2026-09 加。主应用是纯前端 SPA，抓取器拿到空壳壳；为此补了**一个真正的静态 HTML 入口** `guide.html`（使用指南长文，不带 Vue、不带任何 JS 逻辑），并在 `index.html` 里给不执行 JS 的抓取器留了一段正文。全程零新增依赖。

**两个 Vite 入口**（`vite.config.js` 的 `build.rollupOptions.input`）：`main` → `index.html`、`guide` → `guide.html`。加第三个静态页时照抄 `guide` 那一行即可。

**`guide.css`（`src/styles/guide.css`）的两条硬约束**：

- 必须 `@import './base.css'` 打头——两套主题的配色、字体、滚动条都只在 `base.css` 里定义（第 1 节「颜色只走 CSS 变量」），指南页只准 `var(--…)` 引用、不写十六进制。底色 / 前景色靠 `base.css` 的 `:root` 变量直接落在 `html/body` 上，所以指南页天然跟随主题，不用自己写一套。
- `base.css` 是为「满屏 IDE」写的：`html/body` 高度 100%、`body` 锁死滚动（第 3 节）。内容页要在 `guide.css` 里把这两条**放开**（`height: auto; overflow: visible` 之类），否则长页滚不动。

**主题不闪**：`guide.html` 第 47–56 行有一段内联脚本，读同一份 `localStorage` 契约（`cph.editorSettings.theme`），只有存的是 `cph-light` 时才给 `<html data-theme="cph-light">`（不写即默认深色）。它**故意不加 `type="module"`**——普通内联脚本不会被打包器挪走或包起来，才能在首帧前同步执行、避免暗→亮闪一下。

**四处文案要一起看**（能力 / 口径变了先搜这四处）：

| 位置 | 形态 |
| --- | --- |
| `guide.html` | **完整版**（长文、表格、FAQ、目录） |
| `src/components/HelpPanel.vue` 的 `GROUPS` | 应用内「设置 → 帮助」的简版（条目式） |
| `docs/使用手册.md` | 仓库内的简版，只回答最常问的两三个问题 |
| `index.html` 的 `<noscript>` | 给不跑 JS 的抓取器的摘要，内容与上面几处对齐 |

**`index.html` 的 `<noscript>` 正文有硬约束**（注释里也写了）：构建期的 HTML 解析按「脚本未启用」遍历 `<noscript>`，`<style>` / `<link>` / `<script>` 与**相对路径的 `<img>`** 会被特殊处理而在浏览器里失效，所以这块只放纯语义标签（`h1/h2/h3/ul/li/p/a`），**链接一律写绝对地址**（如导向 `https://www.998244353.best/guide.html`）。用户端零影响（JS 开启时不渲染、不进无障碍树），Vue 挂载时 `#app` 内容也会被清空。

**其余 SEO 落点**（都在 `public/`，直接进产物）：

- `public/robots.txt`：`Allow: /`，`Disallow: /wasm/`（52MB 工具链只在用户点下载时才请求，别占抓取预算）与 `/precache-manifest.json`；**不要** Disallow `/assets/`（Google 需要抓 JS/CSS 才能渲染页面）；末尾指 `Sitemap:` 绝对地址。
- `public/sitemap.xml`：只有两条 URL（`/` 与 `/guide.html`），**故意不写 `lastmod`**（写死的日期会变成假信息；`changefreq` / `priority` 已被 Google 忽略）。
- `public/og-cover.png`：1200×630 的分享大图，被 `index.html` / `guide.html` 的 `og:image` 引用（`og:image` 必须是绝对地址）。
- canonical / `og:*` / `twitter:*` / `ld+json` 都写在各自的 HTML `<head>` 里；站点主地址是**带 `www`** 的 `https://www.998244353.best`（apex 会 308 跳过来，canonical 用来收掉 Vercel 预览域等重复地址）。

**部署侧的 MIME**（`vercel.json`，见第 10 节）：`/robots.txt` 补 `text/plain; charset=utf-8`、`/sitemap.xml` 补 `application/xml; charset=utf-8`，两者都禁缓存（`max-age=0, must-revalidate`）。

**已知取舍**：`guide.html` **不进 Service Worker 预缓存**（`vite.config.js` 的 `precacheManifest` 在 `generateBundle` 阶段从 `bundle` 生成，而 `.html` 是 `vite:build-html` 之后才产出的，清单里只有 guide 的 js/css）。所以断网访问 `/guide.html` 时，导航的兜底（`sw.js` 里 `caches.match('/index.html')`）会把**主应用外壳**顶上来——指南页离线不可用，但至少不会白屏。要改就在 `sw.js` 里单独缓存它。