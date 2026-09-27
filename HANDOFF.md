# CPH IDE · 交接文档

面向「接下来要改前端样式」的接手人。当前代码**已跑通并上线**：本地 WASM 沙箱能编译运行 C++、也能解释运行 Python（含多文件 import）、判题（含 TLE）、主题与布局都能用；前端已推到 GitHub 并由 Vercel 托管（见第 10 节）；也能作为 PWA 装到设备上独立窗口运行、断网可用（见第 9 节）；还能配合改造版浏览器插件**一键抓题**（题目直接落进工作区、样例自动填进评测面板，见第 13 节）。

## 0. 一分钟上手

- 目录：`/Users/hejie/Code/BISHE`（仓库名是 `wasm-oj-frontend`）。
- **是 git 仓库**：远程 `origin` = https://github.com/hejiehejiehejiehejie/wasm-oj-frontend.git ，主分支 `main`（就是部署分支）。动大样式前先看一眼 `git status`。
- 启动：`npm run dev` → http://localhost:5199；想验生产构建用 `npm run build && npm run preview`（Service Worker 与安装入口**只在生产构建里存在**，dev 下测不到，见第 9 节）。
- 其他命令：`npm run verify` 跑无头回归（A–F 全绿，**本机要显式给 Node 与 Chrome 的路径**，见第 8 节开头）；`npm run wasm:opt` 是工具链体积优化，**当前结论是不用跑**（第 7 节）。
- 两个 HTML 入口：`index.html`（主应用）与 `guide.html`（使用指南，给搜索引擎抓取的静态长文）。改文案 / 样式时**两页连同 docs/使用手册.md、HelpPanel.vue 一共四处要一起看**（见第 12 节）。
- 响应式：**没有顶栏**（2026-09-28 整体删除）。所有入口都在工作区内——侧边栏页头的两颗图标（面板切换 / 设置）、编辑器页签栏右端的运行按钮、设置视图里的「应用」分组（安装到设备）。侧边栏最低宽度随视口收缩（见第 3 节两小节）；工作区两栏始终并排、不堆叠。各档宽度都是实测定出来的，改动后要重量（第 1、3 节）；触屏下分隔条已可拖动，且有「键盘模式」（第 3 节末）。
- 浏览器插件抓题（2026-09 加）：改造版 Competitive Companion（已更名 **CC for Web**，主色与本站同蓝）解析完题目后，把 JSON 经内容脚本用 `window.postMessage` 投给本站，站点落盘到 `/Problems/<OJ>/<题名>.cpp`、元数据收在同级隐藏目录 `.cph/`，并把抓到的样例整体替换进评测面板。安装包就在站内分发——设置视图「浏览器插件」分组里有下载按钮（`public/extension/cc-for-web-<版本>.zip`）。详见第 13 节。
- 全局快捷键（2026-09 加）：设置视图「快捷键」分组里可录制 / 清除 / 复位，默认 `Mod+Enter` = 运行全部用例；实现要点与坑都在第 13 节。
- 技术栈：Vue 3（Composition API + `<script setup>`）+ Vite 8 + **纯原生 CSS**（没有 Tailwind，也没有任何组件库 / UI 库）。
- 重量级第三方依赖只有 `monaco-editor` 和 `@runno/wasi`（浏览器里跑 clang）；`puppeteer-core` 只给无头回归脚本用；`binaryen` 是 devDependency，只服务 `npm run wasm:opt`（不进产物、不影响运行时，卸掉它会自动回退到系统级 wasm-opt）。新增 npm 包要先讨论。
- **还没做、但已经想清楚怎么做的 9 项计划**（VFS 优化 / 题目时限接入 / 默认模板 / 文件归类设置 / 比赛模式 / 右键打开题目链接 / 换新建图标 / 登录与云同步 / 设置页 UI 精修）连同每条要避开的坑和落地顺序，都写在第 14 节。（原第 14.1 项「合并侧栏切换钮」已于 2026-09-28 落地。）

## 1. 硬约束（改样式时最容易被打破的几条）

| 约束 | 说明 |
| --- | --- |
| 只有两套主题 | `cph-dark`（默认）/ `cph-light`，主题 id 同时用于 Monaco 自定义主题名 |
| 颜色只走 CSS 变量 | 组件里**不许**出现写死的十六进制颜色；所有色值定义在 `src/styles/base.css` |
| 新增变量必须定义两遍 | `:root` 和 `:root[data-theme='cph-light']` 都要给值，否则浅色主题下会串色 |
| 禁止第三方 UI 库 | 抽屉 / 弹层 / 下拉全部原生 CSS + Vue + `Teleport` |
| 侧边栏页头的图标不许溢出 | 两颗图标（30×26）渲染在**两个面板各自的页头**里，最窄的面板下限是 158px（320px 视口）；两面板入口已于 2026-09-28 合并成一颗切换钮（见 14.1），实测两颗占 60px + 右侧动作按钮 2 颗仍有 94px 余量。**别给图标加文字、别加大 `gap`、别加第三颗**——页头没有折行兜底（`FileExplorer` 的 `.explorer__head` 是固定 `height: 35px`），撑不下就直接溢出 |
| 运行按钮不在页签滚动容器里 | `.editor-tabs` 现在是「`.editor-tabs__strip`（`flex: 1 1 auto`，横向滚动）+ `.editor-tabs__run`（`flex: 0 0 auto`）」两个兄弟。**运行按钮必须在 strip 之外**——塞进去会跟着页签一起滚出视口，侧边栏收起时就没有运行入口了 |
| 面板下限只在 CSS 里定义一份 | 侧边栏最低宽度由 `.workspace` 上的 `--tests-min-cap / --tests-min-ratio / --tests-min-floor` 决定（即 `.pane--tests` 的 `clamp(160px, 50%, 320px)`；变量名里的 `tests` 是历史沿革，统一侧边栏沿用同一套），`measureLimits()` 读同一组变量复算；改数字只改 CSS 那三行，别在脚本或组件里再写一份 |
| 侧边栏内部只用 `v-show` | 整栏显隐、栏内两个面板（资源管理器 / 评测样例）的切换**都是 `v-show`**：文件树的展开状态、样例里手填的输入与卡片折叠态都挂在 DOM 上，改成 `v-if` 会在切换时被销毁重建，用户数据直接丢。**「设置」也在这一栏里，但它不是第三个面板**——它是编辑区里的合成页签，页头那颗图标只负责开关那个页签，不参与两个面板的 `v-show` 切换（见第 5 节坑 7） |
| flex 容器的子元素要显式拉伸 | 布局里 `.pane > *` 必须 `flex: 1 1 auto; min-width: 0`，否则子组件收缩到内容宽度 |
| Monaco 只能动态改 | 设置项变化走 `editor.updateOptions()` / `monaco.editor.setTheme()`，**不要重建实例** |
| 设置要持久化 | 统一用 `src/composables/usePersistentRef.js`（存的是 JSON 字符串，见第 5 节的坑） |
| SW 改了策略就升版本号 | `public/sw.js` 的 `VERSION` 决定缓存桶名（现为 `cph-shell-v2` / `cph-toolchain-v2`）；改缓存内容或策略时必须同步升它，否则老用户会一直吃旧桶 |
| 图标是构建产物之外的静态资源 | `public/icons/*.png` 直接进产物，**不在**构建清单里，改动它们要同步 `sw.js` 的 `STATIC_ASSETS`（见第 9 节） |
| 扩展安装包文件名必须带版本号 | `public/extension/cc-for-web-<版本>.zip`。它同理不在构建清单里，但**故意不进 `STATIC_ASSETS`**——发新版靠的是换个文件名（SW 对同源 GET 走 `cacheFirst` 且不重新校验，同名覆盖会让老用户一直下到旧包），见第 13 节 |
| 导入题目的落盘结构不许改 | `/Problems/<OJ>/<题名>.cpp` + `/Problems/<OJ>/.cph/<题名>.json`。代码文件只在首次导入时创建，**此后正文一个字都不动**（那是用户写的题解），样例与元数据整体覆盖；题目身份认 `url` 不认文件名。改这里等于动用户数据，见第 13 节 |
| `.cph` 只在渲染层过滤 | `workspaceStore.js` 的 `withoutHiddenDirs()` 只作用于交给 UI 的那棵树，provider 接口 / `nodeIndex` / 清死 tab 逻辑一概照旧——别把过滤下沉到存储层，否则元数据读写会一起断 |
| 全局快捷键监听必须在 `window` 捕获阶段 | `window.addEventListener('keydown', onKeydown, true)` + `preventDefault()` + `stopPropagation()`。Monaco 的键位服务挂在编辑器内部 DOM 上，只有捕获阶段抢得过它；**不要**再用 `editor.addCommand()` 同步键位（Monaco 0.56 没有 `removeCommand`，旧的撤不掉） |
| 录制快捷键时全局监听必须让路 | 开录时置 `recordingActive = true`（录制框自己的监听在按钮的目标阶段，捕获永远先跑），否则按下新组合键的瞬间功能会先被执行一遍 |
| 禁止引第三方快捷键库 | 规范化只需要「读 `event.code` + 四个修饰键」，`useShortcutManager.js` 里一个纯函数就够（Mousetrap 之类一律不引） |

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
public/extension/               # 站内分发的浏览器扩展安装包：cc-for-web-<版本>.zip（文件名带版本号是刻意的，见第 1 节与第 13 节）
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
  App.vue                       # 布局骨架（workspace / pane / splitter）+ 全局状态；另外挂两件全局事：window 捕获阶段的 keydown（快捷键，`SHORTCUT_HANDLERS` 把动作 id 接上真函数）与 `useCompanionImport()`（接扩展投来的题目）
  composables/usePersistentRef.js
  composables/useInstallPrompt.js  # 设置视图「应用」分组里「安装到设备」按钮的数据源：拦 beforeinstallprompt，用完即弃
  composables/useMobileKeyboard.js # 触摸屏「键盘模式」：视口收缩 + 不抢焦的保焦拦截（见第 3 节末）
  composables/useCompanionBridge.js # ★ 扩展消息接收端：window.postMessage 握手（cph-ping → cph-info）与题目投递（cph-task）。状态是**模块级单例**（扩展装没装是全局事实，各组件不该各探一次）；同站多开标签页时扩展会广播，按 taskId 去重
  composables/useCompanionImport.js # 订阅扩展题目 → 调 problemImport 落盘 → 把样例**整体替换**进评测面板 → nextTick 后抢焦点。它是 problemImport 返回值的唯一消费方
  composables/useShortcutManager.js # ★ 全局快捷键的唯一权威：动作表 SHORTCUT_ACTIONS + 绑定表 + comboFromEvent 规范化 + 冲突检测 + localStorage。**刻意不挂组件生命周期**（App 的全局 keydown 与 EditorPane 的状态栏提示都要在任何组件挂载前就可用）
  components/
    HotkeyRecorder.vue          # 单个动作的快捷键录制框：点一下开录、冲突红字且拒绝写入、Esc 放弃、Delete 清除绑定；开录时置 recordingActive 让全局监听让路（见第 13 节）
    EditorPane.vue              # 编辑区容器：Monaco 画布 + 设置视图（两者 v-show 互斥）+ 底部状态栏；把 judge / connection / running / total 透传给页签栏与设置视图
    EditorTabs.vue              # 编辑器标签栏：`strip`（文件页签 + 「设置」合成页签，横向滚动）+ 右端常驻的「运行 / 停止」按钮（2026-09-28 从被删的顶栏搬来，见第 3 节）
    EditorSettingsPanel.vue     # 设置视图：铺满编辑区、与代码文件平级的合成页签（不再是抽屉 / Teleport）；「目录 + 内容」两栏，目录 = 编辑器 / 布局 / **快捷键** / 评测 / 本地运行环境 / **浏览器插件** / 应用 / 帮助（共 8 项，`SECTIONS` 常量驱动，顺序即 `scripts/verify-ui.mjs` 里 `navItems === 8` 的断言口径）。「编辑器」那组按 `EDITOR_GROUPS`（外观 / 编辑 / 光标与高亮 / 视图 / 代码辅助 5 小节，共 27 行）数据驱动渲染，每行只写「键 + 标签 + 控件类型 + 可选项」，可选项表全部来自 services/editorOptions.js；「快捷键」那组按 `SHORTCUT_ACTIONS` 渲染 `HotkeyRecorder`；「浏览器插件」那组管扩展的安装包下载 / 状态探测 / 插件侧快捷键查看（两个常量 `EXTENSION_VERSION` / `EXTENSION_FILE` 决定下载地址，升版本只改这里 + 换 zip）
    EngineSettingsPanel.vue     # 「评测」分组里的引擎列表 + 服务地址 + 自检（原顶栏「评测引擎设置」弹层的正文）
    HelpPanel.vue               # 「帮助」分组里的问答列表 + 完整指南链接（原顶栏「?」抽屉的正文，现只读、无按钮 / Teleport，与 docs/使用手册.md 同源）
    Sidebar.vue                 # ★ 统一侧边栏外壳：用 v-show 切换两个面板（资源管理器 / 评测样例），面板本体由 App.vue 经具名插槽（#explorer / #tests）填入；页签状态（cph.sidebarTab）与持久化留在这里，经 provide 下发给页头里的切换组件。自己不管宽度与整栏显隐——那是外层 .pane--tests 的事。另 `defineExpose({ showPanel })` 供父组件从外部切面板（App.vue 跑测试时要把「评测样例」亮出来），状态仍只有这一份
    SidebarSwitcher.vue         # 侧栏页头里的两个入口（2026-09 加）：面板切换 + 设置。不再独占一行页签栏，而是渲染进两个面板各自的页头里（同一时刻只有一个面板可见，视觉上只有一份）；只画 logo 不写字，名字在 `title` / `aria-label`；状态从 Sidebar 的 provide 取，自己不存状态。**面板那颗是 2026-09-28 由「资源管理器 / 评测样例」两颗合并来的**：点一下在两个面板之间来回切，所以它画的是**将要去的那一个**（图标 `files` / `cases` 与文案都跟着翻），`title` 用「切换到…」祈使句——它不带 `is-active`（动作按钮，不是可按下状态）。第二颗（齿轮 `gear`）开关编辑区里的设置页签（`settingsTab`，不落盘），只有它有 `aria-pressed`
    FileExplorer.vue            # 资源管理器面板（Sidebar 的 #explorer 插槽）：页头左侧是 SidebarSwitcher、右侧是新建文件 / 文件夹两颗按钮 + FileTreeItem 树 + 右键菜单（`ContextMenu`，经 `provide('openContextMenu')` 下发给树节点）+ 删除确认弹窗（自绘，见第 5 节坑 11）+ 题目信息弹窗（自绘，同款，见第 5 节坑 17）；内联新建输入框自带默认名并把焦点送进去（见第 5 节坑 12）
    FileTreeItem.vue            # 文件树节点：展开态存在自己身上，靠 Sidebar 的 v-show 保住；右键 `@contextmenu.stop` 把事件交给 FileExplorer（**`.stop` 不能删**，见第 5 节坑 14）
    ContextMenu.vue             # 通用右键菜单：Teleport 到 body、fixed 定位、挂载后按视口四边收敛、点外部 / Esc / 失焦关闭。目前只有文件树在用（文件节点给「题目信息 / 重命名 / 删除」，目录节点不给「题目信息」）
    TestPanel.vue               # 评测样例面板（Sidebar 的 #tests 插槽）：页头左侧是 SidebarSwitcher、右侧是 verdict（「全部 AC / n/m AC」）与耗时 + 用例列表 + 页脚运行按钮
    TestCaseCard.vue            # 单个用例卡片：徽标（AC/WA/CE/TLE/RE/ERR 判定码）/ 耗时 / 输入框 / 输出块
    AppIcon.vue                 # 内联 SVG 图标集（name 取图标名）。三张表：PATHS（24×24 描边线性图标，主力）/ SOLID_PATHS（整块实心品牌标，`fill: currentColor`）/ VIEWBOX（不在 24 网格上的图标的专用方框）。语言图标的两个坑见第 5 节坑 16；设置目录用的 `keyboard`（快捷键）与 `plugin`（浏览器插件，拼图形状，刻意区别于「应用」组的 `install` 图标）也在 PATHS 里
  services/                     # 判题逻辑，改样式基本不碰
    runner.js                   # 逐用例调度（并发 2）+ 进度回调；引擎 outcome 翻译成卡片 verdict（AC/WA/CE/TLE/RE/ERR）
    compare.js                  # 实际输出与期望输出比对，只返回布尔（不再产出「输出多 N 行」之类 hint）
    templates.js                # 各语言默认模板
    editorOptions.js            # 编辑器偏好的单一出处：默认值 27 项 + 可选项表 + 逐键校验 + 偏好 → Monaco 选项（编辑器级 editorOptions() / model 级 editorModelOptions()）
    problemMeta.js              # 题目元数据的单一出处：OJ 表（洛谷/Codeforces/AtCoder/牛客/LeetCode/其它）+ 难度口径（CF·AtCoder 分数段 800…3500 / 洛谷八级 / 其余自由文本）+ 逐键校验 normalizeMeta() + 悬停文案 formatMetaTooltip()（见第 5 节坑 17）
    engines/                    # 引擎注册表：piston（默认）/ judge0 / wasm / echo
    wasmRuntime.js              # 本地沙箱的唯一入口：语言路由 + 阶段播报 + 看门狗 + 串行队列 + PCH 后台预热
    runnoSandbox.js             # runno 双管线：C++ 编译（工具链地址、编译产物缓存、PCH 生成）+ Python 解释运行
    vfs/runnoFs.js              # VFS → runno fs 的转换层（fsEntry 记录形状的唯一出处，两个管线共用）
    pchStore.js                 # PCH 的 IndexedDB 存档（原生 API，任何失败都按「没有存档」处理）
    settingsTab.js              # 「设置」合成页签的 UI 状态（刻意不进 workspaceStore/openTabIds、不建模型、不落 localStorage；见第 5 节坑 7）
    vfs/problemImport.js        # 扩展题目 → VFS 落盘（`/Problems/<OJ>/<题名>.cpp` + `.cph/<题名>.json`）：OJ 辨认、题名清洗、按 url 认题、名字去重、batch 落库、打开文件。改这里等于动用户数据，见第 13 节
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
                  │      └─ header.explorer__head   ← SidebarSwitcher（左，2 颗图标） + 新建文件 / 文件夹（右）
                  └─ div.sidebar__panel  v-show="activeTab === 'tests'"    → TestPanel
                         └─ header.panel__head      ← SidebarSwitcher（左，2 颗图标） + verdict / 耗时（右）
```

侧边栏页头里**第二颗图标是「设置」**（2026-09-28 加，顶栏删除后从顶栏齿轮搬来）：它不切侧栏面板，而是开关编辑区里的设置页签（`settingsTab`，见第 5 节坑 7）。第一颗切 `cph.sidebarTab`。因为设置页签是编辑区的东西，关掉它时侧栏那颗图标的高亮也跟着灭——高亮状态由 `settingsTab.active` 决定，不走 `cph.sidebarTab`。

**开跑必亮结果**（2026-09-28 加）：运行入口有三处——编辑器页签栏右端的运行按钮、`⌘/Ctrl + Enter`、评测面板页脚的运行按钮——全都并到 `App.vue` 的 `runAll()` 这一个出口。`runAll()` 在通过「正在跑 / 没有用例 / 没有活跃语言」三道前置判断之后、真正开跑之前，会调 `revealTestsPanel()`：侧栏收起了就用 `togglePanel()` 展开（它顺带把 `virtualShare` 接回 `editorShare`，与双击展开同一套收口），然后 `sidebarRef.value?.showPanel('tests')` 切到评测样例。已经在评测样例上就是空操作，不会破坏页签持久化。**别把这段放到 `runAll()` 的前置判断之前**——那样点「停止」（同一个按钮，跑到一半时发的是中止）也会把侧栏弹出来。

切换栏目的入口（`SidebarSwitcher.vue`，2026-09 加）**不再单独占一行页签栏**，而是渲染在两个面板各自的页头里：同一时刻只有一个面板可见，所以视觉上只有一份，且两个页头里它都贴左——切过去之后按钮位置不动，可以连点。按钮**只画 logo 不写字**（多文件 = 资源管理器，带勾的清单 = 评测样例，齿轮 = 设置，见 `AppIcon.vue` 的 `files` / `cases` / `gear`），名字放 `title` 与 `aria-label`。

**两个面板的入口已在 2026-09-28 合并成一颗切换钮**（第 14.1 项的落地结果，见该节）：它画的是**将要去的那一个**（图标与文案都跟着翻），`title` 是「切换到评测样例」这种祈使句，因此它**不带 `is-active`**——页头上不再有「我现在在哪个面板」的视觉信号，当前面板只能看 `.sidebar__panel[data-panel]`（`verify-ui.mjs` 的探针就认这个）。面板状态仍是 `cph.sidebarTab`，只有 `Sidebar` 一份（经 `provide('sidebarTabs')` 下发），别让面板各存一份；第二颗（设置）读的是 `settingsTab.active`。

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

| 视口宽 | 侧边栏宽 | 页头宽 | 图标 | 图标是否溢出 | 页签 strip 宽 | strip 是否横向滚动 | 运行按钮 | 运行按钮是否被裁 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1680 | 663 | 663 | 2×30 = 60 | 否 | 919 | 否 | 64×25 @ x=932 | 否 |
| 560 | 238 | 238 | 2×30 = 60 | 否 | 224 | 否 | 64×25 @ x=237 | 否 |
| 414 | 199 | 199 | 2×30 = 60 | 否 | 117 | 否 | 64×25 @ x=130 | 否 |
| 375 | 180 | 180 | 2×30 = 60 | 否 | 98 | 是 | 64×25 @ x=111 | 否 |
| 320 | 158 | 158 | 2×30 = 60 | 否 | 64 | 是 | 64×25 @ x=77 | 否 |

> 表里「图标」一列原是「三颗图标 / 3×30 = 90」，2026-09-28 两个面板入口合并成一颗切换钮后（第 14.1 项）改为 60px。其余各列（页签 strip、运行按钮、无横向溢出）**未重测**——图标变少只会让页头更宽松，不会让它们变紧；下次动页头时要么顺手重量，要么就照旧只信这几列。

- **侧边栏页头两颗图标**（`SidebarSwitcher`）：30×26 一颗、`gap` 0、`flex: 0 0 auto`，合计 60px（2026-09-28 前是 90px，两个面板入口各占一颗）。最窄档（320px 视口，面板 158px）页头右侧还有新建文件 / 文件夹两颗动作按钮，图标右缘到动作区仍留 94px。`.explorer__head` 是固定 `height: 35px`、**不折行**，所以加第三颗或给图标加文字就会直接溢出——要加先按下面口径重量（见第 1 节硬约束表）。
- **编辑器页签栏的运行按钮**（`.editor-tabs__run`，64×25）：`.editor-tabs` 拆成两个兄弟——`.editor-tabs__strip { flex: 1 1 auto; min-width: 0; overflow-x: auto }`（页签在这层滚）+ `.editor-tabs__run { flex: 0 0 auto }`。所以页签再多、视口再窄，运行按钮都**不跟着滚**，永远贴在页签栏右端（375 / 320 档实测：strip 已可滚，运行按钮仍完整可见）。它是侧边栏收起后唯一的运行入口（另一颗在评测面板页脚）。
- 怎么量「必需宽度」：把摊平后的每个可见 flex 项**逐个**注 `flex-shrink: 0`，再把吃剩余空间的项藏掉，量最后一个可见子项右缘到容器左缘的距离 + 右内边距。**不能直接量 `scrollWidth`**——容器不是滚动容器时，收缩后的子项不会让它溢出，量出来的恒等于容器宽。
- 量宽度时的两个口径坑：`display: none` 父元素内的子元素，`getComputedStyle(child).display` **仍返回它自己的值**（不是 `none`），判可见要量外层容器或用 `el.getClientRects().length > 0`；`display: contents` / `display: none` 的子元素不生成盒子、**不占 gap**，量必需宽度时要把它们排除，否则会虚高几十像素。
- **不要用 iframe 或注入 `display: revert` 的方式模拟视口**——量不到真实溢出，返回的数字是自洽的假象。触屏档要用 `page.setViewport({ hasTouch: true, isMobile: true })` 才会命中 `@media (pointer: coarse)`（`emulateMediaFeatures` 不支持 `pointer`）。
- **历史**：顶栏原有的三档响应式断点（820 / 520 / 349）与 `⋯` 省略号收纳，2026-09-28 连同 `.topbar` / `.brand*` / `.tool` / `.primary` / `.popover--menu` 一起删除。设置入口搬进侧边栏页头（当时是第三颗图标，两个面板入口合并后成了第二颗）、运行按钮搬进编辑器页签栏、安装到设备并进设置视图的「应用」分组、侧边栏开关与品牌删除（侧栏显隐仍可由分隔条双击 / 键盘切换，见第 3 节关键规则）。`--bg-chrome` 变量保留——它现在只服务于 `theme-color`（独立应用窗口标题栏底色），不再是任何组件的背景。

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
| `SidebarSwitcher.vue`（style@37） | `.sidebar-switcher`（`inline-flex`，高 26px，`flex: 0 0 auto`）`.sidebar-switcher__tab`（30×26，**只画 logo 不写字**，名字放 `title` / `aria-label`；`.is-active` = 底部 `--focus` 高亮 + 底色换 `--bg-panel`，与内容区连成一体）。用 `aria-pressed` 而不是 `role="tab"`：它渲染在面板（页头）内部，不再是独立的 tablist。要断言/选中它时认 `aria-label`（`textContent` 是空的），并且先落到当前可见的那个 `.sidebar__panel` 里。**2026-09-28 起第一颗是「切换面板」的动作钮（不带 `is-active` / `aria-pressed`，`aria-label` 形如「切换到评测样例」），只有第二颗「设置」用这两个属性**；当前面板改看 `.sidebar__panel[data-panel]` |
| `TestPanel.vue`（style@93） | `.panel`（`flex: 1 1 auto; min-height: 0`，不再写 `height: 100%`）`.panel__head`（`min-height: 35px` + 上下 4px 内边距，左侧放 `SidebarSwitcher`，`flex-wrap: wrap`）`.panel__heading`（`margin-left: auto`，折行后仍贴右）`.verdict[data-tone]`（文案「全部 AC / n/m AC」）`.elapsed` `.select` `.panel__foot` `.run-inline` |
| `FileExplorer.vue`（style@330） | `.explorer`（column，`flex: 1 1 auto`）`.explorer__head`（`height: 35px`，左侧放 `SidebarSwitcher`、右上角两颗按钮；两边加起来离面板下限还远，所以**不折行**）`.explorer__actions`（`flex: 0 0 auto`）`.explorer__btn` `.explorer__tree` `.explorer__input` `.explorer__error`；删除确认弹窗（Teleport 到 body，`z-index: 130`）：`.confirm`（遮罩）`.confirm__card` `.confirm__title` `.confirm__desc` `.confirm__path` `.confirm__actions` `.confirm__btn`（`--danger` 用 `--danger-bg` / `--danger-bg-hover` / `--danger-text`） |
| `TestCaseCard.vue`（style@202） | `.card[data-status]` `.card__head` `.badge[data-status]`（文字是 `verdict` 判定码，见第 5 节坑 1）`.metric` `.icon-btn` `.card__body` `.ta`（输入，高度随内容自增）`.out`（输出）`.run-zone`（撑满徽标到删除按钮之间的运行判定区，`.run-zone__icon` 才是那个 22px 的 ▶）。旧的 `.hint` 已随 2026-09-18 改动删除 |
| `EditorTabs.vue`（style@123） | `.editor-tabs`（`flex: 0 0 35px`）`.editor-tabs__strip`（`flex: 1 1 auto; min-width: 0`，**横向滚动在这里**，运行按钮不跟着滚）`.editor-tabs__item[--active]` `.editor-tabs__dot` `.editor-tabs__label` `.editor-tabs__close`（「设置」合成页签与文件页签共用这套样式）`.editor-tabs__run`（`flex: 0 0 auto`，64×25，`--run-green` 底色；`.is-running` 换 `--danger-bg` / `--danger-text`，见第 3 节） |
| `EditorPane.vue`（style@231） | `.editor-pane` `.editor-pane__stage` `.editor-pane__host`（Monaco 容器）`.editor-pane__empty*` `.editor-pane__status*` |
| `EditorSettingsPanel.vue`（style@539） | `.settings-view`（滚动容器，`container-type: inline-size`）`.settings-view__inner`（目录 + 内容两栏）`.settings-nav*`（左栏分类目录，8 项，`--active` 是选中项）`.setting-group*` `.setting-subtitle`（组内小标题，把「运行时限」与「评测引擎」分开）`.setting-group__note`（分组说明文字，如「应用」组那句）`.setting-row*` `.select` `.number-input` `.switch*` `.runtime-list` `.runtime-row*` `.download-button*`（本地运行环境下载 / 「应用」组安装按钮 / 扩展包下载共用）`.shortcut-list*`（插件快捷键只读清单）`.setting-code`（行内代码，如 `chrome://extensions/shortcuts`）`.is-spinning`（铺满编辑区的设置视图；原 `.panel-drawer*` / `.icon-button*` / `.done-button*` 已随抽屉外壳一起删掉） |
| `HotkeyRecorder.vue` | `.hotkey-field`（右对齐一列）`.hotkey`（录制框，`--is-recording` 描边点亮 / `--is-conflict` 红描边红字 / `--is-empty` 未绑定置灰）`.hotkey-clear`（清除按钮）`.hotkey-error`（冲突红字）`.hotkey-tip`（录制中的 Esc / Delete 提示） |
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
7. **「设置」是编辑区里的一个合成页签，不是抽屉**（`src/services/settingsTab.js`）：它刻意**不进** `workspaceStore.openTabIds`——那边的 `openTabIds` / `nodeIndex` / 会话恢复全建立在「一个页签 = 一个真实 VFS 节点」之上，塞一个没有节点的 id 进去，`rebuildTree` 会把它当「文件已删除」顺手清掉，`modelManager.release` 也会去找一个不存在的 model。所以它不建模型、不落 localStorage（刷新后回到代码文件是预期行为）。视图与 Monaco 用 **`v-show` 互斥**（不是 `v-if`）：Monaco 实例与设置组件的运行环境探针订阅因此只建立一次。让出激活态统一收口在 `settingsTab.js` 里 `watch(() => workspace.activeId)`；「点已经在活跃的那个文件页签」不改 activeId、不触发该 watch，所以 `EditorTabs.activate()` 里显式再让一次。（「本地运行环境」原先是独立抽屉 + `composables/useLocalRuntime.js`，现两者都不在仓库里了——运行时 UI 已并进设置视图。）设置视图自身是**「目录 + 内容」两栏**（2026-09 改）：左边 `.settings-nav` 是分类目录（编辑器 / 布局 / 快捷键 / 评测 / 本地运行环境 / 浏览器插件 / 应用 / 帮助，`SECTIONS` 常量驱动），右边同一时刻**只渲染一组设置**（`v-if` / `v-else-if`，不是 v-show 平铺），当前分类存在组件内的 `activeSection` 里（不落盘，关掉页签再打开仍记得）；切到「浏览器插件」那一组会顺带 `refreshExtension()` 重探一次扩展状态（`watch(activeSection)`）。原顶栏的「评测引擎设置」弹层与「帮助」抽屉（`HelpPanel.vue`）在 2026-09-28 都并进了这里：引擎列表 / 服务地址 / 自检成为 `EngineSettingsPanel.vue`，挂在「评测」组的「运行时限」下面（`.setting-subtitle` 分开两块）；帮助的问答列表成为「帮助」组，`HelpPanel.vue` 已瘦身成纯内容组件（无按钮 / 无 Teleport / 无 Esc 逻辑）；「应用」组装 `useInstallPrompt()` 的安装按钮（原顶栏那颗）；「快捷键」与「浏览器插件」两组是 2026-09 新加的（见第 13 节）。窄宽度降级不靠 `@media`（设置视图活在编辑区里，视口宽是错的代理），而是在 `.settings-view` 上挂 `container-type: inline-size` + `@container settings (max-width: 560px)` 把目录翻成顶部横向标签条。
8. **用例输入框的高度是 JS 撑的**（`TestCaseCard.vue` 的 `autoGrow`，上限 320px）：改 `.ta` 的内边距 / 字号后高度会自己重算，不用手改。但卡片折叠、以及整个「评测样例」页签被切走时元素都是 `display: none`，此刻 `scrollHeight` 为 0，代码会跳过重算——别把这个空值保护删了，否则折叠一次输入框就被压成 0 高。重算的触发有两处：`watch`（输入变化 / 卡片展开）+ 一个挂在输入框上的 **`ResizeObserver`**（只认宽度从 0 变有值、或面板被拖宽，宽度变大才算，避免回调环）。页签是 `v-show` 切换的，没有重新挂载的时刻，**没有这个 observer 就会一直塌成一行**（旧版只在 `onMounted` 跑一次，切到「评测样例」时必然塌）。
9. **`.run-zone` 是撑满中段的 `<button>`**：里面的 `padding: 0` 不是装饰，是在抵消浏览器给按钮的默认内边距（不抵消的话 ▶ 图标位置会跑偏）；`.run-zone__icon` 才是那个 22px 的 ▶ 本体，悬停点亮的是它。
10. **`theme-color` 是 JS 写的，不是静态 meta**：`App.vue` 切主题时会把 `--bg-chrome` 读出来写进 `<meta name="theme-color">`（装成独立应用后浏览器拿它画窗口标题栏）。`index.html` 里那个 `content` 只是首帧兜底，别在那里维护第二份色值。
11. **删除确认弹窗是自绘的，不要换回 `window.confirm`**：`FileExplorer.vue` 的 `requestDelete()` 只把待删节点记进 `pendingDelete`，真正调用 `deleteNode()` 的是弹窗上「删除」按钮的 `confirmDelete()`。原生 `confirm()` 的返回值在 webview / 装成独立应用窗口打开时不由页面掌控（被浏览器抑制时它自己直接返回一个值），出现过「点取消文件还是没了」。自绘弹窗的取消路径有三条且都只清 `pendingDelete`：取消按钮、点遮罩（`@pointerdown.self`）、Esc；`watch(pendingDelete)` 会在弹窗出现时把焦点送到「删除」上（Enter 即确认）。键盘 `Delete` 键走的是同一个 `requestDelete`，不需要另写一份确认。
12. **新建输入框自带默认名，且要挡住一种「程序性失焦」**（`FileExplorer.vue`）：新建**只从页头两颗按钮发起、固定建在根目录**，输入框由 `FileExplorer` 自己渲染（不再 `provide` 给递归树项，树项里那套「在子目录内联新建」已随右键菜单一起删掉）；`startCreate(type)` 预填默认名字——文件按 `activeLanguage` 给 `new.cpp` / `new.py`、目录给「新建文件夹」，与根目录下已有名字相撞就自动排到 `new-2`、`new-3`；焦点靠 `nextTick(focusCreateInput)`（聚焦 + 全选）送进去，`autofocus` 属性对动态插入的节点不生效、指望不上。真正阴的地方是失焦提交：创建成功后会自动**打开**新文件，`EditorPane` 在 `activeId` 变化时会 `instance.focus()`（打开文件抢焦点本身是正常行为，别删它），这一抢就落在内联输入框头上 → 输入框 `blur` → 失焦提交 → **凭空多出一个默认名的文件**（连点两次「新建文件」时必现：第二轮输入框刚聚焦就被提交掉）。所以绑的是 `onCreateBlur()` 而不是直接 `commitCreate()`，用 `createFlights`（在途创建轮次的 state 集合）分两种：屏幕上这个输入框自己正在提交（失焦正来自「打开刚建好的文件」）→ 跳过重复提交、也不抢焦点，让焦点留在 Monaco；在途的是上一轮、屏幕上这个是新一轮被误伤的 → `nextTick` 把焦点抢回来（Monaco 的 focus 在 pre-flush watcher 里，抢得赢）并放弃提交。
13. **`tabSize` / `insertSpaces` 是 model 级选项，不是编辑器选项**（`services/editorOptions.js` 的 `editorModelOptions` + `EditorPane.vue` 的 `applyModelOptions`）：monaco 0.56 的 `EditorOption` 枚举里**根本没有这两项**（整个 `esm/vs/editor/common/editorOptions.js` 里搜不到 `tabSize`），真实定义在 `ITextModelCreationOptions` / `ITextModelUpdateOptions`。把 `tabSize: 2` 塞进 `editor.create()` 或 `editor.updateOptions()`，`EditorOptionsUtil.validateOptions()` 会当成未知键**静默丢掉**——面板看起来改了、localStorage 也存了，编辑器却一直按 4 空格渲染，而且 `getOption(EditorOption.tabSize)` 返回 `undefined`，不细看根本发现不了。正确姿势是 `model.updateOptions({ tabSize, insertSpaces })`，并且**每挂一个 model 都要补一次**（`setModel()` 之后、切文件 / 新建文件都算），否则新 model 立刻退回默认值。校验这类「改了没生效」的选项时，要读 `editor.getModel().getOptions()`，不是 `editor.getOption()`。顺带记一句默认值：`tabSize` 沿用改造前的 4，`insertSpaces` 刻意是 **`false`（关闭，按 Tab 出制表符）**——Monaco 自己的默认是 `true`，这是全表唯一一处刻意偏离 Monaco 默认的项（`editorOptions.js` 文件头也写了）。
14. **文件树的右键事件必须 `.stop`**（`FileTreeItem.vue` 的 `@contextmenu.stop="onContextMenu"`）：树根 `.explorer__tree` 上也挂了一个 `@contextmenu`（`onTreeContextMenu`，负责屏蔽空白处右键的原生菜单），而节点的右键**会冒泡到树根**——不 `.stop` 的话节点菜单会被树根那一次覆盖掉，症状是「右键文件/文件夹没反应、右键空白处反而正常」。菜单项现在是「题目信息（仅文件）」「重命名」「删除」，**不要**把「新建文件 / 新建文件夹」放回去（那是页头两颗按钮的活）。
15. **判题语言没有独立状态，由活跃文件的扩展名派生**（`App.vue` 的 `activeLanguage`）：2026-09-28 顶栏整体删除时那颗语言下拉也一并删了，`cph.language` 随之成为死键（见第 6 节）。现在 `runAll()` / `runOne()` 直接拿 `activeLanguage` + `activeNode.path` 调 `wasmRuntime.runCase()`（`.py` 走解释分支、其余走 C++ 分支），`workspaceStore.initWorkspaceStore()` 里那句 `openLanguage()` 只剩「首次启动给 `/main.cpp` 兜底」这一个作用。**别把语言选择器加回来**——它与「一个页签 = 一个真实文件」这套模型天然冗余，加回来就得再造一份语言状态去和活跃文件抢口径。想加「新建 Python 文件」入口也不用碰状态层，改 `FileExplorer` 的默认名规则即可（见坑 12）。
16. **语言图标有两处不能随手改的地方**（`AppIcon.vue`）：图标分两张表——`PATHS`（24×24 描边线性图标，主力）与 `SOLID_PATHS`（整块实心路径，`fill: currentColor` 且不描边，`solid` 由 `name in SOLID_PATHS` 判定）；另有 `VIEWBOX` 表存放「不在 24 网格上」的图标的专用方框（模板是 `:viewBox="VIEWBOX[name] ?? '0 0 24 24'"`，目前只有 `cpp` 一项）。C++ 用的是 seti-ui 的 `icons/cpp.svg`（MIT）——**VS Code 默认的 Seti 文件图标主题**（字形 `\E01A`，Seti 配色 `#519aba`）用的就是它，2026-09 从 simple-icons 那枚实心六边形字标换过来（那个在 15px 下糊成一团）。两个坑：
    - **它原始网格是 32×32**，直接套 `0 0 24 24` 会明显偏小，所以方框取边长 22（15px 下墨迹约 12.1×11.0px，与 `folder` 的 12.5×11.25 齐平）。
    - **方框的 `min-x` 被刻意右移到 `4.733`**（= 6.2 − 22/15，正好让 15px 尺寸下右移 1px）：这枚字形左边是大块实心的「C」、右边是两个细「+」，外框虽然几何居中（实测 cpp 与 python 的墨迹中点重合在同一条竖线上），但墨迹重心比中点偏左约 0.7px，排到 python 旁边看着不齐。**别改回 6.2**，也别想着去动 python 的 viewBox——python / folder / file / header 都是几何居中的，动它们会让整列图标一起偏。
    图标本身不带颜色，一律 `currentColor` 跟主题走（没照搬 Seti 蓝）。
17. **题目元数据挂在 VFS 节点上（`node.meta`），不是单独一张表**（2026-09 加）：四项——题目链接 / OJ / 难度 / 日期。入口是文件树右键的「题目信息」，弹窗与删除确认同款自绘（不要 `window.confirm`、不要引 UI 库），目录节点不给这一项（`buildMenuItems(node)` 里按 `node.type === 'file'` 判断）。三条纪律：
    - **不动 `DB_VERSION`**：`LocalVFSProvider` 本来就整条记录持久化（`_commit` / `#persistPuts` 只剥掉 `children`），`writeFile` / `rename` 又是 `{...node}` 展开，所以 `meta` 天然跟着走。新增的 `setMeta(path, meta)` 用 `#schedulePut(node, null)` 落库（`content === null` = 只写 nodes store、不碰正文）。
    - **难度跟着 OJ 走**，口径表、合法值、悬停文案全在 `services/problemMeta.js` 一处：Codeforces / AtCoder → 分数段 `800…3500`（步长 100），洛谷 → 官方八级，牛客 / LeetCode / 其它 → 自由文本。换 OJ 时**必须清空当前难度**（`onOjChange`）——两套口径的 id 互不相通，留着会存下一个对不上的值（比如 `1200` 混进洛谷）。
    - **全空存 `null`**：`normalizeMeta()` 逐键校验后四项全空就返回 `null`，`setMeta` 据此把 `meta` 字段整个摘掉，不在节点上留空壳；`formatMetaTooltip()` 对空 meta 返回空串，`FileTreeItem` 此时不设 `title`（避免弹出空提示）。
18. **导入的题目是「一个代码文件 + 一份隐藏元数据」，不给每道题套目录**（`services/vfs/problemImport.js`，2026-09 定稿，**别再改回目录结构**）：树里多一层「题目名/」纯是噪音——点开一道题还得再点一次才见得到代码。所以题名直接做文件名：`/Problems/<OJ>/<题名>.cpp`，元数据收进同级隐藏目录 `.cph/`（同名，只差后缀）。三条纪律：
    - **代码文件只在首次导入时创建，此后一个字都不动**：那里面是用户写的题解。重抓同一道题只刷新样例与元数据（`.cph/<题名>.json` 每次整体覆盖），难度这种用户手填的字段还得从 `existingCode.meta` 里保留下来、日期只在首次播种。
    - **题目身份认 `url`，不认文件名**：题目在来源站点被改名后再次抓取，文件名就对不上了，只认文件名会另起一个文件、把用户旧文件里的题解变成孤儿。所以先走「文件名 + `url` 都对上」的快路径，不中再扫该 OJ 的 `.cph/` 目录按 `url` 找回旧名字。**`batch.id` 不能用**——它是扩展每次抓取现生成的随机 uuid，抓两次就是两个值。
    - **同名但 `url` 对不上 = 用户自己的文件**，这时候不能覆盖，要 `baseName-2`、`baseName-3` 依次找空位（代码文件与元数据文件两边都得是空的）；整趟塞进一个 `vfs.batch()`，界面只重建一次树。
19. **`.cph` 的过滤不能只看「本层摘掉了没」**（`workspaceStore.js` 的 `withoutHiddenDirs()`）：过滤发生在**渲染层**——`rebuildTree()` 拿 `rawTree` 走索引 / 清死 tab，只有赋给 `workspace.tree` 的那棵树摘掉隐藏目录，`provider` 的读写完全不受影响（这是「树里看不见、元数据照常读写」的关键，别把过滤下沉到存储层）。函数返回值的引用约定容易写错：子树一点没动就原样返回入参，父层靠 `children === node.children` 判断要不要换新对象——判据 `changed` 必须**同时**涵盖「本层直接摘掉了节点」与「某个子节点被换成了新对象」两种情况。只认第一种（或改比 `children.length`）都会漏：`.cph` 通常在两层之下，中间层自己一个节点没摘、长度也没变，于是父层拿到「没变」的错误结论继续挂着未过滤的旧子树，`.cph` 就照旧显示出来。
20. **扩展安装包靠文件名换版，不靠 `sw.js` 的 `VERSION`**（`EditorSettingsPanel.vue` 的 `EXTENSION_VERSION` / `EXTENSION_FILE`）：`public/extension/` 下的 zip 不在构建清单里，而 SW 对同源 GET 走 `cacheFirst` 且**不重新校验**——原地覆盖同名文件，老用户会一直下到缓存里的旧包。所以发新版必须换文件名（`cc-for-web-2.65.1.zip` → `...-2.65.2.zip`），同步改这两个常量 + `cph-companion` 的 `package.json` 版本号。也**不要**把它塞进 `STATIC_ASSETS`（那会每次 install 都预缓存一份几百 KB 的包，而它只在用户点「下载」时才需要）。
21. **全局快捷键挂在 `window` 的捕获阶段，且录制期间必须让路**（`useShortcutManager.js` + `App.vue` 的 `onKeydown` + `HotkeyRecorder.vue`）：`window.addEventListener('keydown', onKeydown, true)` 里 `preventDefault()` + `stopPropagation()`——Monaco 的键位服务挂在编辑器内部 DOM 上，捕获是从外往内走，只有这样才能抢在它前面，编辑器里也归这套表管（顺带把 `Ctrl/⌘+Enter` 原本「在下方插入一行」的内置行为一并挡掉）。反过来，`HotkeyRecorder` 的 keydown 在按钮的目标阶段，而捕获永远先跑，所以**开录时必须置 `recordingActive = true`**、`onKeydown` 见到它就 return，否则录入组合键的瞬间功能会先被执行一遍。同理，`event.isComposing` 期间一律不处理（拼音选词不能被当成命令）。**不要**改回 `editor.addCommand()` 同步键位：Monaco 0.56 的 `ICodeEditor` 只有 `addCommand`、没有 `removeCommand`，改过键之后旧的撤不掉，会出现「新键不跑、旧键反而跑」。
22. **组合键内部串用 `event.code`，且必须挡住浏览器原生键**（同上）：用 `event.key` 对不上——Alt 组合在 macOS 上会把 key 变成特殊字符（Alt+B 是 `∫`）、Shift 会把 `Digit1` 变成 `!`。内部写法固定为 `Mod+Ctrl+Alt+Shift+<code>`（顺序固定、必带键码），所以字符串相等就是精确匹配，`Ctrl+B` 与 `Ctrl+Shift+B` 天然不会互相误触；`Mod` = 平台主修饰键（macOS 是 ⌘，其它平台是 Ctrl），macOS 上还要单独有 `Ctrl`。另外 `BROWSER_RESERVED` 那张表（`⌘W` / `⌘T` / `⌘R` / `F12` 等）要在**录制阶段**就拒绝并给红字原因：这些组合由浏览器 UI 层直接吃掉，`preventDefault()` 无效，绑上去只会得到一个永远不触发的快捷键。裸键只放行功能键与 `Esc`（`SAFE_BARE_CODES`），其余一律要求带修饰键，否则打字时会不停误触发。

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
| `cph.shortcuts` | 全局快捷键：动作 id → 组合键串（`{"run":"Mod+Enter", …}`，内部写法见第 5 节坑 22）。**刻意不走 `usePersistentRef`**——那个 composable 靠 `onMounted` 播种首次写入、必须挂在组件上，而这份状态要在任何组件挂载之前就能被读到（App 的全局 keydown 与 EditorPane 的状态栏提示都要用），所以 `useShortcutManager.js` 里直接读写 localStorage。读盘以默认值打底再套已存键：以后新增动作时老用户自动拿到它的默认键，已删动作与手改坏的值自然丢掉 | `composables/useShortcutManager.js` |

另外 PCH 二进制（约 6.9MB）存 IndexedDB 而不是 localStorage：库名 `cph-pch`、store 名 `pch`，记录形状 `{ id, bytes: Uint8Array, size, createdAt }`；`id = 存档版本:工具链版本:微缩头内容的 FNV-1a 哈希`（当前是 `1:8.0.1:69dc7cd9`），三者任一变化旧存档自然失效，取存档只按这个 id。

工作区文件树也存在 IndexedDB（不是 localStorage）：库名 `cph-vfs`、两个 store `nodes` / `contents`（`LocalVFSProvider`），`nodes` 里就是整条 `VFSNode` 记录（`id / name / type / path / parentId / createdAt / updatedAt`），2026-09 给文件节点加了可选的 `meta`（题目链接 / OJ / 难度 / 日期，见第 5 节坑 17）。**它是记录里的一个可选字段，不是新 store、也不动 `DB_VERSION`**——旧记录没有 `meta` 就按「没有元数据」处理，纯向后兼容。

导入的题目与用户自己建的文件**共用同一套存储**：`.cph/` 就是一个普通的 VFS 目录（只是一开始在 UI 里被摘掉，见第 5 节坑 19），代码文件也只是一条普通记录，没有「题目专用表」这种东西。所以整棵 `/Problems` 的搬移 / 重命名 / 删除走的都是既有路径，不需要为扩展另写存储。

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
- **浏览器插件抓题（2026-09 加，全流程见第 13 节）**：配合**改造版 Competitive Companion**（已更名 **CC for Web**、主色换成与本站一致的蓝）。原版是把题目 POST 到本机 `localhost` 端口，改造后改为在目标网站注入内容脚本、用 `window.postMessage` 推给已打开的站点标签页；站点侧落盘到 `/Problems/<OJ>/<题名>.cpp`（元数据在同级隐藏目录 `.cph/`，UI 里看不见），并把抓到的样例**整体替换**进评测面板。安装包在站内分发（设置视图「浏览器插件」分组）：下载 → 解压 → `chrome://extensions` 开开发者模式 → 「加载已解压的扩展程序」。**能力边界：只在站点已打开时投递**（没开就给一条系统通知提示先打开网站）；难度不会自动填（来源站点口径不一，由用户自己在题目信息弹窗里填），日期在首次导入时自动播种。
- **全局快捷键（2026-09 加）**：可绑定的只有 5 个动作——运行全部用例 / 显示隐藏侧边栏 / 侧边栏左右对调 / 新增测试用例 / 打开收起设置（表在 `SHORTCUT_ACTIONS`）。**没登记的动作就是做不到的**：格式化没进来，因为 Monaco 内置的 `Shift+Alt+F` 在 C++ / Python 下没有注册 formatter，绑了也是空按。绑定的键在编辑器里同样生效（监听在 window 捕获阶段，见第 5 节坑 21）；侧边栏折叠时点运行按钮会先把结果亮出来（见第 3 节「开跑必亮结果」），快捷键走的是同一个出口。**插件的快捷键改不了**：浏览器不允许网页改写扩展键位，也没法跳转到 `chrome://extensions/shortcuts`，所以设置视图里那一块只做「查看 + 复制该地址」。

## 8. 验证方式

- **跑 `npm run verify` 前的两个前置**（只影响无头回归，`npm run dev` 不需要）：
  - **Node / npm 不在 PATH 里**就先补上，例如 `export PATH="/Users/hejie/.local/node-v22.23.3-darwin-arm64/bin:$PATH"`（按自己机器改路径）。
  - 脚本用 `puppeteer-core` 驱动 Chrome，默认候选是 `/Applications` 下那几个；本机没装就设 `CHROME_PATH` 指到 Chrome for Testing，例如 `CHROME_PATH="/Users/hejie/.cache/cft/chrome/mac_arm-154.0.8037.57/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"`。
- 手工：`npm run dev`，浏览器 http://localhost:5199，重点看**两套主题各一遍**、面板折叠/展开、分隔条拖拽与双击。
- 本地沙箱端到端（动过 `runnoSandbox.js` / `wasmRuntime.js` / 工具链目录后必做）：手工路径是打开设置页签（侧栏页头的齿轮图标）→「评测」组里选「本地 WASM 沙箱」→ 跑一段带 `vector` / `sort` 的 A+B，看输出对不对、同一份代码第二次跑是否秒回（编译缓存）。想自动化就临时写个 puppeteer 脚本，在页面上下文 `import('/src/services/runnoSandbox.js')` 后直接调 `preloadToolchain()` 和 `runCpp({ code, stdin })`——**用完删掉脚本**，仓库里不留临时探针（这条纪律之前踩过：残留探针把 `scripts/` 弄得很乱）。
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
- 布局宽度专项（动过 `SidebarSwitcher.vue` / `EditorTabs.vue` / 侧栏各面板页头 / `.pane--tests` 下限后必做），临时探针、用完即删：在 1680 / 560 / 414 / 375 / 320 五档量四件事——（a）侧栏页头两颗图标（`aria-label` 认「切换到…」与「设置」；2026-09-28 前是「资源管理器 / 评测样例 / 设置」三颗）都可见、宽 30、且右缘不超页头右缘，（b）`.editor-tabs__run` 存在、宽 ≥ 40、左右缘都落在视口内（没被裁），（c）`documentElement.scrollWidth === innerWidth`（无横向溢出），（d）`.workspace` 的 `getBoundingClientRect().top === 0`（顶栏确实没了、工作区贴顶）。**只看有没有横向滚动条不够**：`.editor-tabs__strip` 自己会滚，真溢出反而被它吸收；要按第 3 节那个「必需宽度」公式自己算。2026-09-28 的实测表与结论记在第 3 节「无顶栏后的两条宽度线」。
- 插件抓题专项（动过 `problemImport.js` / `useCompanionBridge.js` / `useCompanionImport.js` / 落盘结构后必做），临时探针、用完即删。**不必真装扩展**——在页面上下文直接 `window.postMessage({ source: 'competitive-companion', type: 'cph-task', taskId: 't1', payload: JSON.stringify(task) }, location.origin)` 就能走完整条链路（`event.source` 与 `event.origin` 两道校验都能过）。要覆盖的六件事：
  1. 首次导入后树里出现 `<题名>.cpp`、**不出现** `.cph` 与任何 `.json`，UI 树里也没有「题名」这一层目录；
  2. 底层元数据在（`vfs.readFile('/Problems/<OJ>/.cph/<题名>.json')` 能读到，含 `tests` 与 `oj`）；
  3. 往代码文件里写入 `// my solution` 再重抓同一道题 → 正文**原样保留**、样例换成新的；
  4. 评测面板的用例是**整体替换**而不是追加（第 3 条之后卡片数应等于新题目的样例数）；
  5. 同一个 `url` 换个题目名重抓 → 仍落在**同一个文件**上（按 url 认题）；`url` 不同但题名相同 → 另起 `<题名>-2.cpp`；
  6. 抓完后编辑器打开的是这道题的代码文件（`.editor-tabs__item--active` 与 `workspace.activeId` 对得上）。
  写这个探针时踩过两个坑，别再踩：**（a）** 点树上的箭头展开目录时，只点 `.tree-item__row[aria-expanded="false"]`——`.tree-item__arrow` 这个 span 在**每一行**都有（文件行的箭头是空的），而点击处理挂在父级 `.tree-item__row` 上，所以「点所有箭头」实际会把每个文件都 `openFile` 一遍，最后点到的文件抢走 `activeId`，断言就会误报「打开的标题不对」；**（b）** 动态 `import('/src/services/…')` 拿到的可能是**另一个空实例**——Vite dev 给源码模块 URL 加了 `?t=<时间戳>`，裸路径 import 与 app 真正加载的那份不是同一个模块（症状是 `workspace.tree.length === 0` 但界面明明渲染出来了）。正确姿势是用 `performance.getEntriesByType('resource')` 找到 app 真实加载过的那条 URL 再 import。
- 快捷键专项（动过 `useShortcutManager.js` / `HotkeyRecorder.vue` / `App.vue` 的 `onKeydown` 后必做），临时探针、用完即删：设置视图 →「快捷键」→ 点某个动作的录制框 → 按 `Mod+Shift+KeyB` 这类组合应写入并回显；再录一个**已被占用**的组合应停在录制态、出现红字且**不写入**（这就是「阻止绑定」）；录 `Mod+KeyW` 这类浏览器原生键应被红字拒绝；刷新页面绑定仍在（`localStorage['cph.shortcuts']`）。最后验真正触发：光标放进 Monaco，按 `Mod+Enter` 应跑全部用例（说明捕获阶段确实抢在 Monaco 前面）；开录状态下按同一个键**不应**触发功能。
- 无头回归：`scripts/verify-ui.mjs`（`npm run verify`）。**A–F 都应当是绿的**，跑之前先知道这几条：
  - **B 步（切布局）走的是「设置页签」这条路**（2026-09 改）：点侧栏页头那颗 `aria-label === '设置'` 的 `.sidebar-switcher__tab`（它落在**当前可见的那个 `.sidebar__panel`** 里；`textContent` 是空的，认 `aria-label`）→ 断言编辑区里 `.settings-view` 真显示、`.editor-tabs__item--active` 落在含「设置」的那个页签上、`!document.querySelector('.topbar')` 且 `.workspace` 贴顶、目录里正好 **8** 个 `.settings-nav__item`（编辑器 / 布局 / 快捷键 / 评测 / 本地运行环境 / 浏览器插件 / 应用 / 帮助；2026-09 加了「快捷键」与「浏览器插件」两项，**加分类时这个数字要跟着改**） → **点目录里的「布局」**（设置是「目录 + 内容」两栏，默认停在「编辑器」，右侧只渲染当前那一组，不点就找不到换边入口）→ 在页签里选「左侧」→ 点 `.editor-tabs__close[aria-label="关闭设置"]` 关掉 → 断言设置视图与设置页签一起消失。设置仍是 `v-show` 的视图、不是抽屉，所以「Monaco 实例不重建」的老断言（`data-marker`）照样成立。
  - **F 步（Python 模板与判题语言）走的是「资源管理器 → 点 main.py」这条路**（2026-09 改）：顶栏语言下拉已移除，语言只跟活跃文件的扩展名走。所以步骤是——先把面板切回「资源管理器」（2026-09-28 起用脚本里的 `showPanel(page, 'explorer')`：面板入口合并成了一颗切换钮，**不能再按名字点它**——它画的是「将要去的那一个」；且该 helper 必须把 `page` 当参数传进来，`const page` 在 `try {}` 块里，模块级函数直接引用会 `page is not defined`）→ DOM click 标签为 `main.py` 的 `.tree-item__row` → 断言 `.view-lines` 文本（NBSP 已归一）含 `def solve`、`.editor-tabs__item--active` 是 `main.py`、动态 `import('/src/services/vfs/workspaceStore.js')` 后 `activeLanguage === 'python'` 且 `activeNode.path === '/main.py'`、`[...document.querySelectorAll('select')].every((el) => !!el.closest('.settings-view'))`（钉住「顶栏语言下拉不会复活」——现在全站只剩设置视图里那几个原生下拉）。
  - F 步曾长期误报：断言切到 Python 后 `.view-lines` 文本含 `def solve`，而 Monaco 把空格渲染成 NBSP（第 5 节坑 2），`includes('def solve')` **永远匹配不上**——已修（断言前把 `\u00a0` 归一成空格），现在过。这条 NBSP 归一化仍在用，别退回直接 `includes`。对照 A 步的 `includes('include')` 因为不含空格，从来没被这条绊到。
  - 它自己起 dev server，和常驻的 5199 冲突（`--strictPort`，撞上就直接退出），跑的时候用 `VERIFY_PORT=<任意空闲端口>` 覆盖（端口占用很随机，别写死某一个）。
  - 它跑的是默认 Piston 引擎（需要本地有 `localhost:2000` 服务），所以**E 步是「空过」**：断言只看徽标数量，引擎连不上、三个卡片全报错也照样 PASS，验不到本地沙箱。
  - **E 步同时守「开跑必亮结果」**（见第 3 节）：跑之前先把侧栏切回「资源管理器」再双击分隔条折叠，然后点编辑器那颗运行按钮，收尾断言 `.pane--tests` 又可见、且当前面板是「评测样例」（`collapsedBeforeRun` / `revealedAfterRun` 两个字段；后者看的是 `.sidebar__panel[data-panel] === 'tests'`，不再是 `is-active` 高亮）。顺序不能反——折叠后整栏 `display: none`，页头那几颗切换图标就点不到了。这一改让 E 收尾时侧栏停在「评测样例」，F 步本来就会自己切回「资源管理器」，两边不冲突。
  - 2026-09 修掉的三处**恒假断言**（探针自己写错，别再踩）：偏好存的是 JSON 字符串（`"left"`）必须 `JSON.parse` 才能比；`.minimap` 节点常驻 DOM（宽度 0），可见性只能看渲染宽度；D 步拖拽方向要按当前 `flexDirection` 推导——前序 B/C 已把面板切到左侧，写死向右会让测试栏反向变宽。
  - 临时探针的第三个坑：**边改源码边跑着 dev server** 时，探针会服务到旧的 transform（改完文件、刷新了页面，行为却还是旧的，断言照旧失败）。停掉 server → `rm -rf node_modules/.vite` → 重启，再跑一遍。
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

**为什么文件名清单要构建期生成**：产物名带内容哈希，没法在 `sw.js` 里硬编码。`vite.config.js` 里那个 `cph-precache-manifest` 插件在 `generateBundle` 时把 `bundle` 的键写成 `precache-manifest.json`，正好绕开引依赖这件事。加产物类型（比如新图）时它会自动跟上，**不用改 `sw.js`**；但 `public/` 下的东西不过 `bundle`，加文件必须手动补进 `STATIC_ASSETS`（第 1 节表里那两条约束就是这么来的）。反过来，**`public/` 下不是每个文件都该进去**：`public/extension/*.zip` 就刻意不进——它只在用户点「下载」时才需要，而且靠**文件名带版本号**来换代（第 5 节坑 20），塞进 install 预缓存等于每次装 SW 都白拉几百 KB 的旧包。

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

功能性的后续计划不在这里，见第 14 节（14.1 就是一条会碰页头尺寸的样式改动，动手前先看那一节）。

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

## 13. 浏览器插件抓题（CC for Web）与全局快捷键

两块都是 2026-09 加的，彼此独立，只是同一批做的。

### 13.1 两端怎么接上

改造的插件在**另一个仓库**：`/Users/hejie/Code/cph-companion`（上游 jmerle/competitive-companion 的 fork，`package.json` 的 `productName` 已改成 **CC for Web**、版本 `2.65.x`，图标与宣传图的主色换成了与本站一致的蓝 `#0e639c`）。原版是把题目 POST 到用户本机的 `localhost` 端口（CP Editor / CPH 那套），改造后改成——

**扩展侧**（`cph-companion`，改动集中在 5 个文件）：

| 文件 | 职责 |
| --- | --- |
| `src/hosts/targetSites.ts` | 目标网站白名单 `TARGET_SITE_PATTERNS`：`localhost:5199` / `127.0.0.1:5199`（**必须与 `vite.config.js` 的开发端口一致**，见第 0 节）+ `www.998244353.best` / `998244353.best`。少了哪条就等于「网站没打开」 |
| `src/hosts/WebPageHost.ts` | 查已打开的标签页、把任务投过去（替代原版往端口 POST 的 host） |
| `src/hosts/hosts.ts` | 原版返回各种 host 的 `getHosts()` 改为只返回网页 host |
| `src/background.ts` | `sendTask()` 投递 + 失败时发系统通知（`notifyNoTargetTab()`，标题 `CC for Web`）；**消息处理必须用 `sendResponse` 回调式**，不要返回 Promise（Chrome 原生 API 不认） |
| `src/bridge.ts` | **注入目标网站的内容脚本**：扩展拿不到网页的 JS 作用域，只能靠它做 `window.postMessage` 中转 |

**站点侧**两个 composable + 一个服务：`useCompanionBridge.js`（收消息）→ `useCompanionImport.js`（订阅 + 兜异常）→ `services/vfs/problemImport.js`（落盘）。`App.vue` 里只有一句 `useCompanionImport({ setTestCases, onImported })`。

**消息协议**（两侧的 `source` 常量是约定的握手暗号）：

| 消息 | 方向 | 载荷 |
| --- | --- | --- |
| `cph-task` | 扩展 → 页面 | `taskId`（每次抓取现生成的 uuid，**只用来去重**）+ `payload`（题目 JSON 字符串） |
| `cph-ping` | 页面 → 扩展 | `requestId`（站点自增，用来认领回包） |
| `cph-info` | 扩展 → 页面 | 同一个 `requestId` + `info`（`{ version, commands }`，`commands` 是插件自己的快捷键） |

站点侧的纪律：**只认本窗口、同源**的消息（`event.source === window && event.origin === location.origin`，挡掉 iframe 与外部页面伪造）；回包只认自己那一轮的 `requestId`；`taskId` 进 `seenTaskIds` 去重（同站多开标签页时扩展会广播）。握手会按 `PING_DELAYS = [0, 400, 1500]` 连探三次——内容脚本只在页面加载时注入一次，扩展被重载过而页面一直没刷新时会失联，多探几次能救回来；最后一次仍无回音才判定「未安装」（`PING_TIMEOUT = 500`）。

### 13.2 落盘结构（**动之前先想清楚**）

```
/Problems/<OJ 标签>/<题名>.cpp        用户写的题解 —— 只在首次导入时创建，此后一个字都不动
/Problems/<OJ 标签>/.cph/<题名>.json  抓取结果（题目元数据 + 全部测试样例）—— 每次抓取整体覆盖
```

- `<OJ 标签>` 取自 `services/problemMeta.js` 的 `OJ_LIST` 中文标签（洛谷 / Codeforces / …），认不出来落 `其它`。OJ 由题目 `url` 的域名判断（`problemImport.js` 的 `OJ_HOSTS`，带子域名的按 `endsWith` 匹配）。
- 为什么不留目录层、为什么元数据要收进 `.cph`、为什么认 `url` 不认文件名：全在第 5 节坑 18。
- 元数据 json 里**原样保留**扩展送来的所有字段（`tests` / `timeLimit` / `memoryLimit` / `testType` / `input` / `output` / `group` / `interactive` / `name` …），只额外补 `oj` 与 `importedAt`：少存一份，将来要加模板或按批次分组就得回头重抓。
- 代码文件后缀**暂时写死 `.cpp`**：扩展送来的 `languages` 里只有 `java`（TaskBuilder 的固定默认值），拿它判语言等于把每道题都当 Java，`cpp` / `python` 这些键上游解析器根本不写。等真做了模板功能再改这里（`CODE_EXT`）。
- 题名清洗（`sanitizeName()`）：非法字符换 `-`、空白收成一个、连续短横收成一个、**结尾的点 / 空格 / 短横剪掉**（题名里问号极常见，`Is It a Tree?` 替换完会留个尾巴），超长截到 80 字。全空退回「未命名题目」。
- 用户手填的**难度保留**、日期只在首次播种，其余（`url` / `oj`）每次刷新——见坑 18。

### 13.3 安装包的分发

- 包放在 `public/extension/cc-for-web-<版本>.zip`，站内直接给下载（`<a download>`），**不做自动更新机制**：装完要升级就重新下载解压、再在 `chrome://extensions` 里点一次刷新。
- 发新版的三步：`cph-companion` 里 `pnpm build:chrome` 构建 → 把 `build-chrome/` 打包成 `cc-for-web-<新版本>.zip` → 拷进本站 `public/extension/`，**同时**改 `EditorSettingsPanel.vue` 里的 `EXTENSION_VERSION` / `EXTENSION_FILE`。文件名必须换（第 5 节坑 20），「原地覆盖同名文件」能坑掉所有已下载过的用户。
- 卸载 / 重装提示写在设置视图那一组里：下载 → 解压 → `chrome://extensions` 打开「开发者模式」→「加载已解压的扩展程序」选中解压出来的目录。这是**未上架**插件的唯一安装方式，别改文案说成「一键安装」。

### 13.4 全局快捷键

- 动作表 `SHORTCUT_ACTIONS`（5 项）就是全部能力边界，**没登记的动作就是做不到的**（理由见第 7 节）。加动作 = 改这张表 + 在 `App.vue` 的 `SHORTCUT_HANDLERS` 里补一条同 id 的处理函数，两处 id 必须对上。
- 展示：编辑器底部状态栏那枚运行提示读的是 `formatCombo(bindings.run)`，键改了提示跟着变（`EditorPane.vue`）——**别把它写成写死的 `⌘↵`**。
- 冲突检测分三类，都在 `shortcutConflict()` 一处：浏览器原生键（`BROWSER_RESERVED`）、没带修饰键又不是功能键 / `Esc`、已经绑给别的动作。冲突时录制框**停在录制态显示红字、不写入**，用户可以接着按别的组合，不用重新点一次。
- `resetAll()` 复位成默认表；单条可用 Delete / Backspace 清除（清成空串 = 未绑定，不是删键）。
- 原理、坑与「为什么不能改回 `editor.addCommand()`」全在第 5 节坑 21、22。

### 13.5 改这块时最容易连带踩到的

- 改落盘结构 → 老用户已导入的题目不会迁移（当初的决策就是「不迁移，只对新抓取生效」），别顺手写个迁移把人家的题解搬丢了。
- 改设置视图的分类 → `scripts/verify-ui.mjs` 里 `navItems` 那个数字要跟着改（第 8 节 B 步），否则无头回归直接红。
- 改扩展的 `TARGET_SITE_PATTERNS` / 开发端口 → 插件与网站是对着 `5199` 写死的，**两边必须一起改**（改了端口插件就再也找不到网站了）。

## 14. 后续计划与待解决问题

这一节是**还没做、但已经想清楚怎么做**的清单（2026-09-28 记），按「动手前要先定的事」写，不是需求描述。**14.1 已落地**（保留在下面只作记录），剩下 9 项里靠前的都是站点侧小改动，越往后越重：14.3 / 14.5 / 14.6 会动用户数据，14.2 是 14.5 的前置，**14.9 是一次架构变更（要引后端，不是普通功能）**。**整节的建议落地顺序见本节末尾。**

### 14.1 把「资源管理器 / 评测样例」两颗按钮合并成一个切换钮 —— ✅ 已落地（2026-09-28）

**原现状**：`Sidebar.vue` 的 `PANEL_TABS` 两项（`explorer` / `tests`）+ 一项 `settings`，三颗按钮并排渲染在面板页头（`SidebarSwitcher.vue`）；当前面板存在 `cph.sidebarTab`，两个面板用 `v-show` 切；`Sidebar.vue` 用 `defineExpose` 暴露 `showPanel(id)`，供 `App.vue` 开跑时把「评测样例」亮出来。

**做成了**：面板入口合并成一颗按钮，点一下在两个面板之间来回切；设置那颗原地不动。改动落在三处：

- `Sidebar.vue`：`PANEL_TABS` 保留两项（仍是状态与持久化的唯一出处），新增 `targetPanel` 计算属性；`provide('sidebarTabs')` 下发的 `entries` 变成「面板切换 + 设置」两条，`selectEntry` 里面板那条执行 `activeTab.value = targetPanel.value.id`。两个 `.sidebar__panel` 加了 `data-panel="explorer" / "tests"`。
- `SidebarSwitcher.vue`：按 `entries` 渲染（原来按 `tabs` + `isActive`）；面板那颗**不传 `pressed`**，所以既没有 `is-active` 也没有 `aria-pressed`。
- `scripts/verify-ui.mjs`：探针新增 `visiblePanel()`，用 `sidebarPanel`（读 `data-panel`）取代 `sidebarActiveTab`；新增模块级 `showPanel(page, id)`（**必须传 `page`**，块级作用域坑见第 8 节 F 步那条）；A / E / F 三处断言同步。

**落地时定的四条**（与动手前预判一致）：

- **图标与文案画「将要去的那一个」**，`title` 用「切换到评测样例」祈使句。代价是页头不再有「我现在在哪个面板」的视觉信号——所以 `data-panel` 这个机器可读出处是必需的（无头回归按它判），不是可选项。
- **页头宽度从 30px × 3 = 90px 改成 30px × 2 = 60px**。第 1 节硬约束表与第 3 节实测表已同步；**其余各列（页签 strip 宽、运行按钮位置）没有重测**，只把图标那一列改掉了（图标变少只会更宽松），表下有注明。
- **`showPanel('tests')` 的语义保住了**：它仍是直接赋值、不是 toggle，`App.vue` 的「开跑必亮结果」不受影响。
- **沿用 `cph.sidebarTab`**，没开新 key；老存档里的 `explorer` / `tests` 继续有效。

**还没做（留给后续）**：页头宽度只在 1680 视口下跑过 `npm run verify`，320px 窄档没重量（本次是**减**一颗按钮，窄屏只会更宽松，风险低）。

### 14.2 VFS 需要优化（14.5 的前置）

**现状与痛点**（都能在代码里指认，不是猜的）：

- **接口缺 `readDirectory` / `list`**：`BaseVFSProvider` 只给 `getTree()`（整树）。所以 `problemImport.findNameByUrl()` 为了按 url 找一道旧题，得把整棵树取回来再自己递归找节点——题目一多，这一步就是 O(全库)。
- **启动时把所有正文读进内存**：`LocalVFSProvider` 初始化走 `contentsStore.getAll()`，把**每个文件的正文**都塞进 `#contents`。文件少时无所谓，题解多了以后这是启动耗时和常驻内存的主要来源；正文完全可以惰性读。
- **`rebuildTree()` 是全量重建**：`workspaceStore` 里任何一次改动都重取整树 → `withoutHiddenDirs` 每层递归 copy（过滤 `.cph`）→ 重新 walk 建索引 → 清理死 tab。`rebuildChain` 只是把它串行化，并没有减少工作量。
- **rename / delete 一律聚合成一次 `reset`**（见 `workspaceStore.js` 头部注释），UI 侧永远吃一次全量 diff。
- **`getTree()` 每次调用现组装 `children`**（存储层不维护），整树越大这项成本越高。

**建议方向（按收益 / 风险排序）**：

1. 给 provider 补 `readDirectory(path)`，把「按目录找题」从 O(n) 降到 O(该目录)。
2. 正文惰性加载：`#contents` 只缓存打开中的文件（或做 LRU），其余按需读 IDB。
3. `rebuildTree` 改成按变更子树局部刷新，或给 `getTree()` 加缓存 + 失效标记；`.cph` 过滤下沉一层，别每次全树 copy。
4. 常驻一份 `path → node` 索引，替掉 `findNameByUrl` 那种自己 walk 的写法。

**不能破的约定**：`.cph` 在 UI 里必须仍然不可见（第 5 节坑 19 的 `changed` 标志别搞丢）、代码文件正文永不覆盖、题目身份认 `url`。

### 14.3 把 CC for Web 的时限接到评测时限上

**现状**：扩展送来的 `timeLimit`（毫秒）被 `problemImport.buildConfig()` 原样存进 `.cph/<题名>.json`，**但从来没被用过**——面板跑的始终是全局 `cph.timeLimitMs`（设置里 1/2/5/10 s 的下拉，见 `EditorSettingsPanel.vue`）。

**要做的**：导入题目时把这道题的时限应用到面板上。

**坑**：

- **枚举 vs 任意值**：面板时限是四档枚举，题目时限是任意毫秒（1000 / 2000 / 4000 都常见）。要么把下拉改成「档位 + 自定义数值」，要么做「取最接近但不小于」的映射（1000→1s、2000→2s、4000→5s）。
- **口径本来就不一样**：面板的时限**只计运行段**、不含编译（第 7 节「耗时口径」），而 OJ 给的是整段 wall-clock。直接照搬 1s 对本地沙箱偏紧，Python 还额外背着 `PYTHON_STARTUP_ALLOWANCE_MS = 500`。
- **要不要覆盖用户的选择**：若沿用 `cph.timeLimitMs` 这个全局键，就必须区分「用户自己设过」与「导入时播种的」，否则每抓一道题都会把用户手调的档位顶掉。
- **这是全局量，不是每道题一份**。真要做成「每道题各自一个时限」，值得把值挪进节点 `meta` 或题目 config——那是更大的改动，得先想清楚 UI 放哪（现在面板页头只有一处时限）。

### 14.4 默认模板功能

**现状**：**没有模板系统**。新建文件的初值只在两处出现：`problemImport.js` 的 `NEW_FILE_CONTENT = '// your code here\n'`（注释里写着「等真做了模板功能再改这里」）和 `workspaceStore.createFile(path, initialContent = '')` 的默认空串；文件树新建走 `FileExplorer.vue` 的内联输入框。

**要做的**：按语言给默认代码骨架，新建文件与导入题目共用同一份。

**坑**：

- **按扩展名选模板，不要按「当前激活语言」**：在 `.cpp` 上新建 `main.py` 时，当前激活的还是 cpp。
- **顺带把 `CODE_EXT` 做活**：导入题目的后缀现在写死 `.cpp`（见 13.2），做模板正好是把它变成可配置的时机，两件事应当一起做。
- **模板存哪要先想清楚**：只内置几套骨架的话，写死在源码里就够；要让用户**可编辑**，就得先决定它的家——放 `.cph/` 里会被 UI 过滤掉（用户看不见也就改不了），放 localStorage 又不适合多行代码。这是「先定产品形态再写代码」的问题。

### 14.5 文件归类设置（可视化编排 时间 / OJ / 难度 三层目录）

**需求**（2026-09-28 澄清）：在**设置面板里新增一个「文件管理」分类**，用来规划导入的题目落盘时怎么分层。

- **默认是 `时间 / OJ / 难度 / 题目名.cpp`**（时间在最外层）。
- 三个维度（时间 / OJ / 难度）**顺序可以互换**，**每个都可以选或不选**——关掉的那个维度直接从路径里跳过，不是落一个「无」目录。
- 编排要**图形化**：三个维度做成可拖拽的卡片 / 标签，横向排列即层级顺序，各自带一个开关，旁边实时预览最终路径。
- 在图形编排之外，**仍然允许自定义文件夹结构**（手写层级模板串，作为高级入口）。

**现状**：`problemImport.js` 里路径是写死的 `/Problems/<OJ 标签>/<题名>.cpp`，只有一层，没有任何设置项与之对应（`EditorSettingsPanel.vue` 的 `SECTIONS` 现在是 8 项）。难度在节点 `meta.difficulty`（**用户自己填**，导入时保留不覆盖），日期在 `meta.date`（只在首次导入时播种）。

**要做的三块**：

1. **新增设置分类**：`SECTIONS` 加一项（**8 → 9**），内容按现有设置面板「分组 + 行」的写法组织（`EDITOR_GROUPS` 那套）。
2. **图形编排 UI**：三个可拖拽的维度卡片 + 每张卡上的开关 + 旁边的路径预览。拖拽必须**原生实现**（第 1 节硬约束：不引第三方 UI 库），且要键盘可操作（左右箭头换序）+ `aria-label` 交代「第几层」，否则触屏 / 无鼠标用户用不了。
3. **路径装配**：把「维度顺序 + 各维度开关」编译成一个路径分段数组交给导入流程；自定义模板串那条高级入口复用同一套装配逻辑，别写两份。

**坑（这条风险最高，直接动用户数据）**：

- **新增设置分类会让无头回归直接红**：`scripts/verify-ui.mjs` 里 `navItems` 断言的是设置分类数（第 8 节 B 步），8 → 9 必须同步改；第 4 节 CSS 类名表里那句「8 项」也要跟着改。
- **先确认一件事：根目录 `/Problems` 还留不留**。需求写的是 `/时间/oj/难度/题目名.cpp`，没有 `/Problems` 这一层；但去掉它，题目目录就和用户自己建的 `main.cpp` 平铺在同一层了。建议保留 `/Problems` 作根、三个维度只放在它下面——改之前先定。
- **默认把「时间」放最外层会不断长出新顶层目录**：每月/每天都冒一个新目录。日期粒度建议 `YYYY-MM`（按天会产生大量只含一个文件的目录）。
- **难度维度首次导入时是空的**：来源站点难度口径不一，导入时 `difficulty` 一律为空串（第 7 节明说难度不自动填）。这里要区分两种「空」——用户**关掉**了这个维度（整层跳过），与这一维度**开着但当前题无值**（落「未分类」还是整层跳过？得定死并写进文档）。
- **`findNameByUrl` 会失效，这是能不能做的前提**：它现在只扫「同一 OJ 目录下的 `.cph/`」找旧题名。路径变成可配置以后，用户一改结构，老题目就在新路径下找不到 → 被当成新题再抓一份，旧题解变孤儿。所以**身份索引必须提级**：全库按 url 查，或维护一张全局 `url → path` 表。
- **对老数据零影响**：与 13.2 的纪律一致——新规则只对之后抓的题生效；若要做「重新归位」，必须是一次独立的、要用户确认的操作，绝不能隐式迁移（题解会跟着代码文件挪窝，一动就丢）。
- **持久化放哪**：维度顺序与开关是全局偏好，适合进 localStorage 的一个新 key（如 `cph.problemLayout`）；**不能放 `.cph/`**——那里会被 UI 过滤掉，用户也就改不了。
- **强依赖 14.2**：路径多两层之后全树规模明显变大，`rebuildTree` 的整树重建会先扛不住。

### 14.6 比赛模式（赛时功能）

**需求**：加一个「比赛模式」开关，开启后**新建一个以比赛名字命名的文件夹**，并把这场比赛**所有题目的样例**一次性准备好。

**好消息：扩展侧不用改**。比赛解析走 `Contest`（`cph-companion/src/models/Contest.ts`），它的 `send()` 是**逐道题顺序发**，并且在构造时把每道题的 `batch.id` 统一成第一道题的那个、`batch.size` 设成题数。所以站点收到的每道题目 JSON 里本来就带着这些：

- `group`：比赛名（`TaskBuilder.setGroup()`）
- `batch: { id, size }`：`id` 同一场比赛共用，`size` 是题目总数；**单题解析时 `size === 1`**（`TaskBuilder` 默认 `{ id: uuidv4(), size: 1 }`）
- `tests`：样例已经在载荷里，不需要额外去抓

而 `problemImport.buildConfig()` 是 `...task` 展开落盘的，**这三样现在就已经存进 `.cph/<题名>.json` 了**。

**要做的**：一个开关（放哪待定：设置面板 or 面板页头）→ 收到 `batch.size > 1` 的一批任务时，落进以 `group` 命名的目录，而不是按 OJ 分目录；并给出「第 3 / 8 题」这类进度。

**坑**：

- **`batch.id` 不能当题目身份**：它是每次解析现生成的随机 uuid（`problemImport.js` 顶部注释就是这么说的）。但用来把「同一场的一批题」归到一起**正好合适**——别把它的用途搞混。
- **是逐条顺序到达，不是一次数组**：`Contest.send()` 是 `for ... await`。所以站点侧要在**第一条到达时**就把比赛目录建好，并知道后面还有 `size - 1` 条。中途用户关页面 / 某题解析失败会只落一部分 → 要有「本场还差 N 题」之类的提示，否则用户以为抓全了。
- **比赛名是外部输入**：落盘前必须过 `sanitizeName()`，重名还要走 `resolveFreeName()`。
- **与 14.5 的目录规则冲突**：比赛模式要的「用比赛名新建一层」和 14.5 的「时间/OJ/难度」是两套规则，得明确比赛模式是否**绕过**归类设置（建议绕过：比赛场景下比赛名就是最自然的顶层）。
- **同一场比赛再抓一次要复用已有目录**，不能新建出「比赛名-2」（与 13.2「身份认 url」一致）。

### 14.7 右键菜单加「打开题目链接」

**现状**：`FileExplorer.vue` 的 `buildMenuItems(node)` 现在只有三项——`题目信息`（仅文件）、`重命名`、`删除`；`onMenuSelect(id)` 按 id 分发。题目链接存在节点 `meta.url`（题目信息弹窗里可编辑，`beginEditMeta` 读的就是它）。

**要做的**：给**有 `meta.url` 的节点**加一项「打开题目链接」。

**坑**：

- **只对带 `url` 的节点出现**：导入的题目才有；用户自建文件、所有目录都没有。别无条件下发一项，否则点了没反应。
- **`url` 是不可信输入**（一半来自扩展解析结果，一半来自用户手输），`window.open` 之前**必须校验协议是 `http:` / `https:`**，否则 `javascript:` 这类伪协议会被当链接执行。
- 用 `window.open(url, '_blank', 'noopener')`，别让新页面拿到 `window.opener`。
- 位置建议挨着「题目信息」（两者都是题目相关的），别塞在「删除」后面。

### 14.8 换掉「新建文件 / 新建文件夹」的图标

**现状**：`FileExplorer.vue` 页头那两颗按钮用的是 `AppIcon name="file"` 和 `name="folder"`——**和树里文件 / 目录节点是同一套图标**，页头看不出「这是新建动作」。

**要做的**：在 `AppIcon.vue` 里加 `file-plus` / `folder-plus`（或等价的新图标），页头按钮改用它俩。

**坑**：

- 图标必须画在 **24×24 网格**上（`AppIcon.vue` 现有路径都是这个网格），否则和旁边的 `SidebarSwitcher` 图标对不齐；`.explorer__btn` 是 26×26、图标 `:size="14"`，只要不改尺寸就不会动页头宽度（窄屏余量见第 3 节）。
- 加完确认树里节点**仍然**用旧的 `file` / `folder`。两处一起改就等于没区分。

### 14.9 登录 + 云同步（最大的一条，要先选型）

**需求**：加账号体系与跨设备云同步。

**现状（也是最大的障碍）**：

- 现在是**纯静态前端**：没有后端、没有账号，Vite 构建直接上 Vercel，数据全在浏览器本地（VFS 落在 IndexedDB 的 `cph-vfs`）。
- 第 0 节写着「**新增 npm 包要先讨论**」，而这件事必然要引后端 / 第三方 SDK——所以它**不该被排进功能队列，它是一次架构变更**。
- 站点为了 WASM 多线程带了 `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`（第 1 节硬约束），跨源脚本 / 资源都要带 CORP 头，第三方 SDK 的接入方式要按这个约束先验一遍。
- VFS **没有版本号、也没有变更日志**：rename / delete 一律聚合成一次 `reset`（见 `workspaceStore.js` 头部注释），同步需要的「增量」现在拿不到。

**动手前必须先定四件事**：

1. **同步什么**：只同步 `/Problems`（题目 + 题解 + `.cph` 元数据），还是连编辑器偏好 / 快捷键一起？样例与题解是最重的用户数据。
2. **谁是权威**：本地优先（离线可用，云端只做备份与合并），还是云端权威（多端一致但离线就废了）？现有 PWA + `sw.js` 的离线设计倾向本地优先。
3. **冲突策略**：last-write-wins、保留双份、还是按文件粒度做三方合并？「同一道题两台设备都在写」必须有确定行为。
4. **鉴权与后端用谁的**：自建（要服务器与运维）还是托管服务（会引第三方依赖，按第 0 节约定要先讨论）。

**另外**：题解与做题记录相当私人，`.cph/*.json` 里的 `url` 等于完整刷题历史——上传范围必须在 UI 上说清楚（第 12 节那四处文案也要跟着改）。

### 14.10 优化设置页 UI、精改各条文案

**现状**：`EditorSettingsPanel.vue` 是设置面板的全部（左栏分类目录 + 右栏分组行），样式类名表在第 4 节；它挂在**编辑区里的一个合成页签**上（`services/settingsTab.js`），高度受编辑器区域限制（`.editor-pane__status` 在窗口 <480px 或 `is-short` 时隐藏）。14.5 做完后分类从 8 变 9。

**要做的**：排版精修 + 逐条过文案。

**坑**：

- **`scripts/verify-ui.mjs` 里对设置分类数的断言**要同步改（第 8 节 B 步已经踩过一次）。
- **文案不只在这一个文件**：第 12 节列了「能力 / 口径变了先搜这四处」——`guide.html`、`HelpPanel.vue` 的 `GROUPS`、`docs/使用手册.md`、`index.html` 的 `<noscript>`。设置页里的词如果和它们叫得不一样，用户会以为说的是两个功能。
- **两套主题都要过一遍**（`cph-dark` / `cph-light`），色值只能来自 `base.css` 变量。
- **窄面板靠容器查询隐藏元素**，改布局时要连着容器查询一起看，否则窄屏会挤成一团。

**建议的落地顺序**：~~14.1（纯 UI，最小）~~（✅ 已落地，2026-09-28）→ 14.3（小而收益直接）→ 14.8 → 14.7 → 14.10 → 14.4 → 14.6（扩展侧已就绪，只做站点侧）→ 14.2（基础设施）→ 14.5（依赖 14.2 与提级后的身份索引）→ 14.9（要先选型，且是唯一需要后端的）。