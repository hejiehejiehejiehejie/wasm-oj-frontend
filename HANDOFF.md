# unnamed · 交接文档

面向「接下来要改前端样式」的接手人。当前代码**已跑通并上线**：本地 WASM 沙箱能编译运行 C++、也能解释运行 Python（含多文件 import）、判题（含 TLE）、主题与布局都能用；前端已推到 GitHub 并由 Vercel 托管（见第 10 节）；也能作为 PWA 装到设备上独立窗口运行、断网可用（见第 9 节）；还能配合改造版浏览器插件**一键抓题**（题目直接落进工作区、样例自动填进评测面板，见第 13 节）。

## 0. 一分钟上手

- 目录：`/Users/hejie/Code/BISHE`（仓库名是 `wasm-oj-frontend`）。
- **是 git 仓库**：远程 `origin` = https://github.com/hejiehejiehejiehejie/wasm-oj-frontend.git ，主分支 `main`（就是部署分支）。动大样式前先看一眼 `git status`。
- 启动：`npm run dev` → http://localhost:5199；想验生产构建用 `npm run build && npm run preview`（Service Worker 与安装入口**只在生产构建里存在**，dev 下测不到，见第 9 节）。
- 其他命令：`npm run verify` 跑无头回归（**基线是 A/B/C/D/F 绿，E/G/H 红且是既有失败、别顺手去修**，签名见第 8 节；**本机要显式给 Node 与 Chrome 的路径**，见第 8 节开头）；`npm run wasm:opt` 是工具链体积优化，**当前结论是不用跑**（第 7 节）；`npm run md:runtime` 把题解渲染器（katex + marked）从 `node_modules` 抄进 `public/md/`，**已挂在 `predev` / `prebuild` 上，平时不用手动跑**。
- HTML 入口：`index.html`（主应用）与四个内容页——`guide.html` / `guide.en.html`（使用指南的**中文版与英文版**，给搜索引擎抓取的静态长文）、`notice.html` / `notice.en.html`（第三方组件清单的中英文版，**生成物**，见第 12 节），各语言两页共用 `src/styles/guide.css`。改文案 / 样式时，`guide.html` 与 `guide.en.html` **两版必须同时改**，再加 `src/i18n/messages/help.js`（应用内「设置 → 帮助」那份内容）、`docs/使用手册.md`、`index.html` 的 `<noscript>`，一共五处要一起看（见第 12 节）。
- 响应式：**没有顶栏**（2026-09-28 整体删除）。所有入口都在工作区内——侧边栏页头的胶囊开关与设置钮（面板切换 / 设置，可选的还有抽题钮）、设置视图里的「应用」分组（安装到设备）。**运行只剩两个入口**：全局快捷键 `Mod+Enter`、评测样例面板页脚那颗 ▶（曾有的编辑器页签栏运行按钮已于 2026-09-28 删除，见第 3 节）。侧边栏最低宽度随视口收缩（见第 3 节两小节）；工作区两栏始终并排、不堆叠。各档宽度都是实测定出来的，改动后要重量（第 1、3 节）；触屏下分隔条已可拖动，且有「键盘模式」（第 3 节末）。
- 浏览器插件抓题（2026-09 加）：改造版 Competitive Companion（已更名 **CC for Web**，主色与本站同蓝）解析完题目后，把 JSON 经内容脚本用 `window.postMessage` 投给本站，站点落盘到 `/<年月>/<OJ 标签>/<难度>/<题名>.cpp`（直接挂在工作区根下，无外层 wrapper），题目信息与抓到的样例都挂在代码文件**自己的节点**上（`node.meta` / `node.config`，2026-10-01 起；旧版是同级隐藏的 `.cph/<题名>.json` 文件，已由 `migrate.js` 一次性搬进节点；难度导入时为空，先落「未分类」），树里不另有条目，并把抓到的样例整体替换进评测面板。安装包就在站内分发——设置视图「应用 › 浏览器插件」里有下载按钮（`public/extension/cc-for-web-<版本>.zip`），同一组里还有「投递目标」两个开关，可以直接把「发到本网站 / 发到本地工具」任一关掉（2026-09-30 加，真值写在扩展的 `chrome.storage`，见 13.1）。详见第 13 节。
- 全局快捷键（2026-09 加）：设置视图「快捷键」分组里可录制 / 清除 / 复位（**例外**：资源管理器里的重命名 / 删除 / 全选 2026-10-25 起键位写死，**且不再出现在这个分组里**，见 13.4），默认 `Mod+Enter` = 运行全部用例、`Mod+Shift+KeyE` = 切换侧栏面板（等价于点页头那枚胶囊）；实现要点与坑都在第 13 节。
- **题解（Markdown / LaTeX，2026-09-30 加）**：`.md` / `.markdown` 走 Monaco 内置的 markdown 分词器，只用于**写题解、不参与判题**（两个运行入口都会给禁用态）。编辑区为此多了一行工具栏（14 项：加粗 / 标题 / 列表 / 链接 / 图片 / 公式 / 表格 / 分割线…）、双层统计块（字数 / 行数，数字在上、单位在下且相对数字居中，两块之间一个小圆点，见第 25 节）、三态视图胶囊（仅编辑 / 双栏 / 仅预览）与一颗全屏按钮，另有 15 条题解专用快捷键（`Mod+\` 轮换视图、`Esc` 退全屏）。预览用的 marked + KaTeX **按需下载**（设置视图「应用 › 本地运行环境」的第三行，缓存桶 `cp-md-runtime`，约 578KB），与 C++ / Python 工具链同一套路数。
- **界面双语（2026-09-29 加）**：界面文案分**中文 / 英文**两套，语言存在 `cp.uiLocale`，默认**跟随浏览器**（`navigator.languages` 任一命中 `/^zh\b/i` → `zh-CN`，否则 `en`；存档优先于探测）。切换入口在设置视图「外观」组的「界面语言」下拉，**切了当场生效、不重载**。实现是自写的轻量模块（`src/i18n/`，**没有引 vue-i18n**），词条按域拆成六个文件、同一文件里中英两栏并排。翻译范围是「UI + 应用内帮助 + guide.html 整页」三块（**致谢页的双语是 2026-09-30 另外补的**，不走 i18n 机制，而是中英各一份源文件 + 一次生成两页，见第 12 节）；`guide.en.html` 是 `guide.html` 的逐条对照版（见第 12 节）。**最容易踩的一条**：数据表里只能存 key、由模板 / computed 再 `t()`，详见第 5 节坑 28。
- 技术栈：Vue 3（Composition API + `<script setup>`）+ Vite 8 + **纯原生 CSS**（没有 Tailwind，也没有任何组件库 / UI 库）。
- 重量级第三方依赖只有 `monaco-editor` 和 `@runno/wasi`（浏览器里跑 clang）；`puppeteer-core` 只给无头回归脚本用；`binaryen` 是 devDependency，只服务 `npm run wasm:opt`（不进产物、不影响运行时，卸掉它会自动回退到系统级 wasm-opt）。新增 npm 包要先讨论。
- **站点显示名当前是占位符 `unnamed`**（2026-09-29 由原「CPH IDE」整体改来，等定好新名再替换一轮）。出现处固定这几处，改名时照这份清单搜：`index.html`（title / apple-mobile-web-app-title / og / twitter / ld+json / noscript 正文）、`guide.html` 与 `guide.en.html`（**两版都要搜**；同样一组 + 页头 `.brand__name` + 各处正文）、致谢页（**页头品牌名与标题里的 `unnamed` 在 `scripts/render-notice.mjs` 的 PAGES 表 / `NOTICE*.md` 里，不是在生成物里改**——`notice.html` / `notice.en.html` 是生成物，改完跑 `npm run notice`）、`src/i18n/messages/*.js` 里正文出现的品牌名、`public/manifest.webmanifest`、`public/robots.txt` 与 `src/sw.js` 的注释、`src/components/TestPanel.vue` 的 `aria-label`、`docs/使用手册.md`、本文件。**持久化名都是契约**（localStorage 的 `cp.*`、IndexedDB 的 `cp-vfs` / `cp-pch`、Cache Storage 的 `cp-shell-*` / `cp-toolchain` / `cp-md-runtime`）：**这些名字的唯一出处是 `src/services/storageNames.js`**（SW 那份由构建期注入，见第 9 节），想改名必须**同时写一次性迁移**，见 `services/storageMigration.js` 与 `LocalVFSProvider.js` 的 `migrateLegacyDb()`、`sw.js` 的 `migrateLegacyBuckets()`。带 `cph-` 的旧名只作为**迁移源**存在——不认识它们就搬不动老用户的数据，等于把用户的偏好与题解全丢掉（题目元数据的 `.cph/` 目录已于 2026-10-01 取消，如今只剩 `migrate.js` 里认老数据用的那个常量）。**能改的只有主题 id**（`dark` / `light`，2026-09-29 已去掉 `cph-` 前缀，改动清单与迁移见第 1 节首行与第 6 节）。`package.json` 的 `name: cp-ide` 是 npm 标识、与展示无关。

## 1. 硬约束（改样式时最容易被打破的几条）

| 约束 | 说明 |
| --- | --- |
| 只有两套主题 | 主题 id 是 `dark`（默认）/ `light`（2026-09-29 去掉 `cph-` 前缀）。这一个串**有四处身份**：Monaco 自定义主题名（`src/monaco-setup.js`）、`<html data-theme>` 的值（`base.css` 的选择器）、`services/editorOptions.js` 里 `THEMES` 的 id 与默认值、以及**存档里 `theme` 字段的取值**（`guide.html` 的首帧内联脚本也读它）。改它必须四处同步 + 抬一次 `EDITOR_SETTINGS_VERSION` 做迁移，见第 6 节 |
| 颜色只走 CSS 变量 | 组件里**不许**出现写死的十六进制颜色；所有色值定义在 `src/styles/base.css` |
| 新增变量必须定义两遍 | `:root` 和 `:root[data-theme='light']` 都要给值，否则浅色主题下会串色 |
| 禁止第三方 UI 库 | 抽屉 / 弹层 / 下拉全部原生 CSS + Vue + `Teleport` |
| 右键菜单只有一份实现（齿轮菜单是另一份） | 文件树的节点菜单与编辑区的剪贴板菜单都是 `ContextMenu.vue`（Monaco 自己那份英文菜单已由 `useEditorMenu.js` 拦掉）。**别再手搓第二份列表** —— 全站统一样式就靠这一个文件 + `base.css` 的 `--menu-*` 令牌（2026-10-10 起以一份 vanilla IDE 右键菜单模板为准，**悬停是蓝色**、不是站内的灰，见第 5 节坑 33）。**齿轮弹出的设置菜单是另一份**（`SettingsMenu.vue`，2026-10-11 加）：它要二级子菜单 + 内联控件 + 键盘导航，塞进 `ContextMenu` 会把右键菜单拖成两件套；但它与这里**共用** `--menu-*` 令牌、`--menu-scale` 缩放系数与 `composables/usePopoverLayer.js` 的定位 / 关闭逻辑，改视觉两处一起看 |
| 侧边栏页头的图标不许溢出 | 页头（`.sidebar__head`，全站一份，2026-10-11 起）左侧是一枚**面板胶囊开关**（带短标签时两段共 148px、紧凑纯图标 64px）+ 4px 间距 + 一颗独立的设置钮（26px）= 178 / 94px；紧凑与否由 Sidebar 的 ResizeObserver 按侧栏宽 < 360 逻辑 px 切换。最窄的面板下限是 158px（320px 视口，紧凑态），实测右侧动作区仍不溢出。**别把文字标签改成常驻、别加大 `gap`、别加第三段/第三颗**——紧凑阈值是按「带标签胶囊 + 抽题 + 齿轮 + 右侧最坏情况（verdict + 耗时）」算的，要加先按第 3 节口径重量五档。整枚胶囊是一颗 toggle 按钮（点它任意位置都翻到另一个面板），里面的两段是纯视觉指示——**别把点击下放回某一段**，那会在胶囊里留出点不动的边 |
| 运行入口只剩两处 | 编辑器页签栏右端那颗「运行 / 停止」按钮已于 **2026-09-28 删除**（它当时是侧栏收起后唯一的点击入口）。现在只剩：全局快捷键 `Mod+Enter`（捕获阶段监听，见坑 21）、评测样例面板页脚那颗 ▶。两个入口都并到 `App.vue` 的 `runAll()`，跑之前都会 `revealTestsPanel()` 把侧栏亮出来（见第 3 节「开跑必亮结果」）。**别再往页签栏加运行按钮**：`.editor-tabs` 现在只有 `.editor-tabs__strip` 一个子元素、`flex: 1 1 auto` 铺满整行 |
| 面板下限只在 CSS 里定义一份 | 侧边栏最低宽度由 `.workspace` 上的 `--tests-min-cap / --tests-min-ratio / --tests-min-floor` 决定（即 `.pane--tests` 的 `clamp(160px, 50%, 320px)`；变量名里的 `tests` 是历史沿革，统一侧边栏沿用同一套），`measureLimits()` 读同一组变量复算；改数字只改 CSS 那三行，别在脚本或组件里再写一份 |
| 侧边栏内部只用 `v-show` | 整栏显隐、栏内两个面板（资源管理器 / 评测样例）的切换**都是 `v-show`**：文件树的展开状态、样例里手填的输入与卡片折叠态都挂在 DOM 上，改成 `v-if` 会在切换时被销毁重建，用户数据直接丢。**「设置」也在这一栏里，但它不是第三个面板**——它是编辑区里的合成页签，页头那颗图标只负责开关那个页签，不参与两个面板的 `v-show` 切换（见第 5 节坑 7） |
| flex 容器的子元素要显式拉伸 | 布局里 `.pane > *` 必须 `flex: 1 1 auto; min-width: 0`，否则子组件收缩到内容宽度 |
| 触屏上的可拖目标必须声明 `touch-action` | 各自保住本容器的滚动方向：页签栏的页签 `pan-x`、文件树的行 `pan-y`、分隔条 `none`（它不需要滚动）。**绝不能图省事写 `none`** —— 手指按在它上面就再也滚不动那个容器了。`pointerdown` 里的 `preventDefault()` 挡不住这件事（按规范它只抑制兼容的 `mousedown` / `mouseup`）：手势归属是浏览器在 `touchstart` / `pointerdown` 那一刻定下的，之后改 `touch-action` 无效。配套的还有 `user-select: none` 一族与「`contextmenu` 从 `pointerdown` 就接管」—— 这三件套缺一件都**只在真机上现形**，无头探针全绿什么也说明不了（见坑 30） |
| Monaco 只能动态改 | 设置项变化走 `editor.updateOptions()` / `monaco.editor.setTheme()`，**不要重建实例** |
| 设置要持久化 | 统一用 `src/composables/usePersistentRef.js`（存的是 JSON 字符串，见第 5 节的坑）。**例外**：服务层的模块级单例（如 `services/shellSettings.js`）**不能**用它 —— 那份靠 `onMounted` 落首值，组件之外不执行（见第 5 节坑 36） |
| SW 改了**外壳**策略就升 `SHELL_VERSION` | `src/services/storageNames.js` 的 `SHELL_VERSION` 只决定外壳桶名（现为 `cp-shell-v6`）；改外壳缓存内容或策略时必须同步升它，否则老用户会一直吃旧桶。**2026-10-25 起有个例外**：同桶内「URL 带版本」的条目已由 `sw.js` 的 `pruneStaleShellArtifacts()` 按 `/retain-manifest.json` 自动回收，所以只是扩回收范围、不改「桶里该留什么」时不必升；升版本留给「vN 桶里已有新判据够不着的残骸、要一次清空」那种情况（v5 → v6 就是）。**工具链桶名是硬编码的 `cp-toolchain`，刻意不跟版本号走**——工具链是随 URL 固定的二进制（clang 24MB + CPython 25MB），跟外壳改不改无关，绑在一起会让每次升外壳都逼老用户重下几十 MB。要换代工具链时才手动改那一行 |
| **禁止胶囊形控件** | 按钮 / 芯片 / 徽标 / 提示条一律**圆角矩形**，`border-radius` 必须**小于高度的一半**（2026-10-24 用户口径：「不要出现胶囊形的东西，都改为圆角矩形，并且保持圆角一致」）。同一排 / 同一组的控件取同一档：**全站只有三档圆角 —— 10px / 6px / 4px**（分工、嵌套规则与存量偏离见 §1.A）：面与常规控件 **10px**；卡内 / 行内的中等控件（高约 24–36px）**6px**；≤26px 高的小控件（行内小输入框、键帽、小图标钮）**4px**；**同一排里不许混用两档**（2026-10-29 加回 4px：小输入框配 6px 会和旁边的树行一样圆，看不出是一格输入）。**别把 10px 套到 17–20px 高的元素上**——相邻两角之和超过边长时浏览器会按比例夹小，又变回半圆。存量 `999px` 还剩四处，逐组件迁完为止：滚动条滑块（`base.css` 的 `.oscroll-thumb`）、设置页开关轨道（`EditorSettingsPanel.vue`）、抽题面板开关轨道（`CfPickerPanel.vue` 的 `.pk-switch__track`）、拖拽放大镜（`EditorPane.vue`）；倒计时卡已于 2026-10-24 迁完（预设 / 解锁按钮 10px）。状态点、环形进度这类**纯几何元素**不在此列 |
| 图标是构建产物之外的静态资源 | `public/icons/*.png` 直接进产物、**不在**构建清单里，也**不能进** `sw.js` 的 `STATIC_ASSETS`——图标内容会变（白底改透明圆角那次就变过）而路径里没有内容哈希，进了那个列表就等于拿装机那一刻的图永久盖住新图（2026-10-15 踩过，见第 9 节）。改图标要连带递增 `index.html` 里两条 `rel="icon"` 的 `?v=` |
| 扩展安装包文件名必须带版本号 | `public/extension/cc-for-web-<版本>.zip`。它同理不在构建清单里，但**故意不进 `STATIC_ASSETS`**——发新版靠的是换个文件名（SW 对同源 GET 走 `cacheFirst` 且不重新校验，同名覆盖会让老用户一直下到旧包），见第 13 节 |
| 内置字体文件名必须带版本号 | `public/fonts/<族>-latin-<字重>-<字体内部版本>.woff2`，`@font-face` 只写在 `src/styles/fonts.css`（由 `base.css` 的**首行** `@import` 引入，`@import` 只能出现在其它规则之前）。与扩展包同理**不进 `STATIC_ASSETS`**，靠首次使用落进外壳桶，同名覆盖会让老用户永远吃旧文件。版本号必须取**字体内部**的真实版本，别抄上游 release 号（@fontsource 的包会滞后） |
| 导入题目挂在 VFS 节点上，不许另立存储 | 一道题 = 一个代码文件 `/<年月>/<OJ 标签>/<难度>/<题名>.cpp`（直接挂根下，无外层 wrapper；年月粒度 `YYYY-MM`；难度导入时一律为空，先落「未分类」；**比赛导入的第三层是比赛名**，见第 7 节比赛那条）。题目信息（`node.meta`）与抓到的样例（`node.config`）都挂在这个文件节点上，树里不另有条目（2026-10-01 起；旧版是同级隐藏的 `.cph/<题名>.json`，由 `migrate.js` 一次性搬进节点）。代码文件只在首次导入时创建，**此后正文一个字都不动**（那是用户写的题解），样例整体覆盖而难度由用户手填、重抓要保留；题目身份认 `url` 不认文件名，且**必须全库按 `node.meta.url` 找回原文件**（分层后同一道题会算出新路径，只扫一个 OJ 目录会让老题解变孤儿）。改这里等于动用户数据，见第 13 节 |
| 全局快捷键监听必须在 `window` 捕获阶段 | `window.addEventListener('keydown', onKeydown, true)` + `preventDefault()` + `stopPropagation()`。Monaco 的键位服务挂在编辑器内部 DOM 上，只有捕获阶段抢得过它；**不要**再用 `editor.addCommand()` 同步键位（Monaco 0.56 没有 `removeCommand`，旧的撤不掉） |
| 录制快捷键时全局监听必须让路 | 开录时置 `recordingActive = true`（录制框自己的监听在按钮的目标阶段，捕获永远先跑），否则按下新组合键的瞬间功能会先被执行一遍 |
| 禁止引第三方快捷键库 | 规范化只需要「读 `event.code` + 四个修饰键」，`useShortcutManager.js` 里一个纯函数就够（Mousetrap 之类一律不引） |
| 作用域受限的快捷键必须先过闸门、再 `preventDefault` | 「重命名」（macOS 是 Enter、其它平台 F2，2026-10-20 起按平台分岔）/ Delete「删除」/ ⌘·Ctrl+A「全选」这三条只作用于**焦点在资源管理器那块面板里**的时候（`App.vue` 的 `SHORTCUT_TREE_HANDLERS` + `treeScopeFrom()`，执行落在 `FileExplorer` 经 `defineExpose` 给出的三个入口）—— 判据 2026-10-12 由「必须落在带 `data-tree-id` 的那一行上」放宽成「落在 `[data-panel="explorer"]` 里」，行上、树的空白处都算（用户报的「资源管理器区域不支持 ⌘A 之类的快捷键」正是前者）；⌘·Ctrl+A 另有一条「指针在哪一块」的判据（桌面端），见第 13.4 节。它们**不放进 `SHORTCUT_HANDLERS`** —— 那张表是「在哪儿按都算」的。闸门**必须拦在 `preventDefault()` 之前**：不在树里就整条放行，否则在编辑器里按 Delete 会删不掉字符、反倒弹出一个删除确认框。Delete 与 macOS 上重命名的 Enter 都是**裸键**，放行范围写在动作自己的 `bareCodes` 里（`SAFE_BARE_CODES` 之外仅有的两个开口），**给别的动作加裸键之前先想清楚它有没有同款闸门**（见第 13.4 节、第 5 节坑 34） |
| px / rem 的边界纪律 | CSS 里写 `px`，构建时由 `postcss-pxtorem` 统一转 `rem`（配置在 `vite.config.js` 的 `css.postcss`），全局缩放只改根字号。但**转换只发生在 CSS 声明值上**：JS 内联样式、JS 常量、`@media` / `@container` 断点参数都不受影响（见第 5 节坑 24）。三条判据：① 物理尺寸（鼠标坐标 / DOM 原生测量 / 手势阈值）永远保持 `px`；② 逻辑尺寸里，喂给 Monaco 的 `fontSize / lineHeight / scrollbarSize / padding`、以及 JS 写死的容器上限必须自己乘 `scale`（见 `composables/useUiScale.js` 的 `px()`）；③ 被 JS `parseFloat` 读的 CSS 变量（`--tests-min-*`）必须在 `propList` 排除名单里留在 px 坐标系，**不要**在 JS 里对 parseFloat 结果做 rem 反向换算——代价是它们吃不到 rem 的自动缩放，所以这类「以物理 px 存放、但语义上是逻辑尺寸」的值要在**使用处**乘一次缩放倍数（JS 用 `uiScale.value`，CSS 用 `--ui-scale`），见第 5 节坑 24 |
| 界面文案不许写死 | 组件、composable、service 里**一律不许出现中文字面量**（现在只剩注释里有中文）。模板与 computed 里写 `t('域.组.键')`，整棵内容树（应用内帮助）走 `messages('help')`。加新文案 = 在 `src/i18n/messages/<域>.js` 里**中英两栏同时补**（同一文件里并排），缺哪一栏会静默退到中文。唯一例外是**写进文件系统的名字**（见下一条）与 `[unnamed]` 这类控制台前缀（见第 5 节坑 28 第 5 条） |
| 数据表只存 key，不存译文 | `EDITOR_GROUPS` / `SECTIONS` / `RUNTIMES` / `THEMES` / `SHORTCUT_ACTIONS` / `OJ_LIST` / `LUOGU_LEVELS` / 各引擎的 `labelKey` 都只存 `labelKey` / `hintKey` / `titleKey`（可带 `labelParams`），由消费处再 `t()`。**在模块顶层或 `<script setup>` 顶层调 `t()` 会冻结成那一刻的语言**——切语言不跟着变，是最容易漏的一类（第 5 节坑 28 第 1 条） |
| 写进文件系统的名字不翻译 | `vfs/problemImport.js` 的 `未分类` / `未命名题目`、`problemMeta.js` 里 `OJ_LIST[].dirName`（洛谷 / Codeforces / 牛客…）都会变成**真实目录名 / 文件名**。跟着界面语言变会让同一个逻辑位置出现两个目录（老用户切换语言后找不到自己的题）。所以显示名走 `labelKey`、落盘名走 `dirName`，**两个字段刻意分开**，主应用与两份 guide 的正文里也照写 `未分类` 不译。同理 `cp.*` 键名、IndexedDB 库名、主题 id 都不随语言变 |
| **悬停一律过 `html.is-hoverable` 闸门** | 任何 `:hover` 规则（含「悬停才显形」的隐形容器）都写成 `:where(html.is-hoverable) <选择器>:hover`；判定本身只在 `services/hoverCapability.js`（`main.js` import 即执行，首帧前落定）。**别再写 `@media (hover: hover)`** —— 它判的是设备而不是「这一次输入」，安卓长按模拟悬停 / 手机开「桌面版网站」/ 插着鼠标的触屏本三种情况全漏（2026-10-30，见第 5 节坑 65）。`@media (hover: none)` 的同款兜底也要反向改写成 `:where(html:not(.is-hoverable))`。`:where()` 是为了**不贡献特异性**，别删 |

### 1.A 圆角只有三档：10px / 6px / 4px（2026-10-29 定，改样式先看这里）

**别再自创第四个值。** 按控件「多大」挑档：

| 档 | 用在哪 | 现成例子 |
| --- | --- | --- |
| **10px** | **面**与常规控件：卡片 / 面板、按钮、芯片、分段、主操作 | `.confirm__card`（`EditorSettingsPanel.vue`）、`.cf-btn` / `.cf-chip` / `.cf-tab`（`cf-console.css`）、`App.vue` 的浮层与面板 |
| **6px** | 卡内 / 行内的**中等尺寸**控件（高约 24–36px）：输入框（含 textarea / select / 数字框）、行内按钮、徽标、图标钮 | `.cf-input` / `.cf-mini` / `.cf-icon-btn`（`cf-console.css`）、`.number-input` / `.select select` / `.setting-textarea`（设置页）、样例卡的 `.ta` / `.out-box` / `.badge` |
| **4px** | **小尺寸**控件（高约 ≤26px）：树里 / 行内的小输入框、键帽、22px 图标钮、小徽标 | `.create-row__input` / `.tree-item__input`（22px）、`.ionote__btn`（约 19px）、`.pk-range__input` / `.pk-stepper__*`（26px）、`.hotkey` / `.setting-code`、`.icon-btn`、`.engine__badge`、`.explorer__btn` |

**为什么不全用 6px**（2026-10-29 用户口径：「输入框都用 6px 圆角并不是好事」）：6px 是卡内控件的通用档，但 22px 高的小输入框配 6px，会跟旁边 22px 的树行一样圆、读不出「这里是一格输入」——那一层就该用 4px。所以 6 / 4 之间**按控件高度挑**，10px 仍专属「面」（别拿 10px 套 28px 以下的东西）。

三条配套规则：

1. **嵌套时「外 10 内 6 / 4」**：一张 10px 的卡里放输入框 / 按钮，里面那几颗按高度取 6 或 4 —— 既有几处都照这个来：`.confirm__card` + `.confirm__btn`（10 / 6）、比赛页那颗「输入比赛 ID / 链接」的盒子（`styles/cf-contest-search.css`：卡 10 / 框 6 / 载入钮 6）、样例卡里的 `.ta`（无框卡内 6）。反过来「外 6 内 10」会看着卡片比里面的控件还圆，别这么写。
2. **同一排里同尺寸的控件必须同档**：一行里既有输入框又有按钮时两者取同一档（`.md-insert__input` + `.md-insert__btn` 都是 4，`.pk-stepper__btn` + `.pk-stepper__value` 都是 4）。一排里尺寸本来就不同时（如样例卡头：22px 折叠箭头 4px 与 32px 垃圾桶 / 运行 6px），各按自身高度定档，但**不许同高度的两颗取两档**。
3. **改尺寸时连半径一起看**：`.icon-btn` 基底 4px、`--danger` / `--run` 变体 6px，差别只因为变体把盒子放大到 32×32；给控件改高、改宽时要重挑档。

已知存量偏离（**别再新增**，碰到就顺手迁到 10 / 6 / 4）：

- `cf-console.css`：`.cf-list__row` 行悬停面 **8px**、`.cf-live-badge` **5px**；
- **5px** 共 8 处：`.md-tool` / `.view-switch__item`（`EditorPane`）、`.explorer__btn`（`FileExplorer`）、`.hotkey`（`HotkeyRecorder`）、`.md-preview__action`、`.gate__action`、`.shortcut-key.is-fixed`、`.cf-live-badge`；
- **8px** 多在设置页的面与清单：`.cloud-account` / `.cloud-flow` / `.danger-zone` / `.runtime-row__icon`（`EditorSettingsPanel`）、`.engine-list`、`.help-item`、`.cf-handle__btn`（账号按钮，26px 高）、`.editor-tabs__item` 的悬停面；
- **菜单缩放值**（`calc(... * var(--menu-scale))`）：`ComponentsMenu` 的 `__item` 8 / `__tile` 12、`TabGroupCard` 的 `__name` 8、`SettingsMenu` 的 `__step` 3 —— 迁的时候一起乘；
- `CountdownCard` 的 `.cd-icon` **7px**、`.cd-dms input` **10px**（与「输入框按高度取 6 / 4」不一致），都还没动；
- `guide.html` / `guide.en.html` 共用 `guide.css`（营销长文，4 / 7 / 8px 自成一套）—— **别把它的值往应用里搬**。

**刻意不迁的形状**（不算偏离）：页签的 `8px 8px 0 0`（下沿要接页签栏直线）、侧栏指示器的 8px（= 轨道 10 − 2×1px 内距，同心）、通知卡 `.notif` 的 2px（原型定的「便签」形态，与 10px 卡片语言故意不同档）、开关轨道 / 滚动条滑块 / 放大镜的 `999px`（几何件）、`50%`（状态点、环形进度、头像）。

`calc(... * var(--menu-scale))` 那类菜单里的值按 `--menu-scale` 等比缩放，选档规则同上。

## 2. 与界面相关的文件

```
index.html                      # 主应用入口：挂载点 + PWA（manifest / apple-touch-icon / theme-color，见第 9 节）+ 一整套 SEO 头（canonical / og / ld+json）+ 服务无脚本抓取器的 noscript 兜底正文（见第 12 节；那块正文**是给搜索引擎看的文案**，改界面能力时别忘了它）
guide.html                      # 第二个 Vite 入口：使用指南长文（静态、无 Vue、无 JS），给搜索引擎直接抓取；样式在 src/styles/guide.css（见第 12 节）
guide.en.html                   # 第三个 Vite 入口：上面那页的**英文版**，逐条对应（同为 12 节、同序、同数字），共用同一份 guide.css；两页用 hreflang 互链 + 页头各有一颗语言切换链接。**内容改了必须两版一起改**（见第 12 节）
privacy.html / privacy.en.html  # 隐私政策的中英两版（2026-10-06 加，**手写**，复用 guide.css 与同一套页头/主题脚本）。存在的直接原因：Edge Add-ons 与 Firefox AMO 上架都要求填一个可访问的隐私政策 URL（见第 13 节）。**内容必须与站点实际行为一致**，重点两处：云端同步上传的是公开可读的偏好项、切到 Piston/Judge0 时代码发往你自己填的地址
vite.config.js                  # 七个 rollup 入口（index / guide / guideEn / notice / noticeEn / privacy / privacyEn）+ COOP/COEP 响应头（本地沙箱的硬前提，别动）+ 构建期产出 precache-manifest.json + `css.postcss` 里的 postcss-pxtorem（全局缩放的 px→rem 转换，四项防御与判据见第 5 节坑 24）
vercel.json                     # 部署侧同一组响应头 + .wasm 的 MIME 与 immutable 缓存 + manifest/sw.js 的响应头 + sitemap.xml 的 MIME（见第 10 节）
public/manifest.webmanifest     # PWA 清单：display standalone、start_url /、scope /
public/icons/                   # PWA 图标：icon-192/512、icon-maskable-192/512、apple-touch-icon(180)（同样**不进** STATIC_ASSETS）
public/favicon.svg              # 站点图标（**不进** STATIC_ASSETS：图会随设计变，见第 9 节）
public/og-cover.png             # 社交分享大图 1200×630（被 index.html / guide.html / guide.en.html 的 og:image 引用）
public/extension/               # 站内分发的浏览器扩展安装包：cc-for-web-<版本>.zip（文件名带版本号是刻意的，见第 1 节与第 13 节）
public/robots.txt               # 抓取规则 + 指向 sitemap
public/sitemap.xml              # 站点地图（五条 URL：/ 、guide 的中英两版、privacy 的中英两版；双语对之间用 xhtml:link hreflang 互指。notice 两页刻意不进）
public/wasm/8.0.1/              # 自托管的 C++ 工具链：clang.wasm / wasm-ld.wasm / clang-fs.tar.gz（约 52MB，进仓库）
public/wasm/python-3.11.3/      # 自托管的 CPython（wasm32-wasi）：python.wasm + python-fs.tar.gz（约 24MB，进仓库）
public/md/                      # 自托管的题解渲染器：katex.min.js / katex.min.css / marked.min.js / fonts/*.woff2（20 个字重）/ assets.json（清单，约 578KB）。**不进仓库**（.gitignore 已忽略）——它是构建输入而不是源码，由 `npm run md:runtime` 从 node_modules 生成，跟着 katex 版本走；同样不在 SW 预缓存清单里，用户点了「下载」才进 `cp-md-runtime`
scripts/verify-ui.mjs           # 无头回归脚本（基线 A/B/C/D/F 绿 + E/G/H 红为既有失败，见第 8 节；B 步走的是「齿轮菜单 → 打开设置面板」两步 + 逐项点开 8 个分类；H 步是 2026-09-30 加的题解回归）
scripts/generate-store-screenshots.mjs # 出浏览器扩展商店的截图（npm run screenshots:store）：自己挑空闲端口起 dev server → 用 postMessage 投一条真的 cp-task（Codeforces 158A 的题目 JSON）走 importProblem 落盘 → 截 1280×800。产出在 screenshots/（.gitignore 已忽略，是本地物料）。**只产「站点工作区」这一张**：工具栏图标画在浏览器 UI 上、系统通知画在操作系统层，自动化够不着，那两张只能真机手拍（操作单在 CC-for-Web/SUBMISSION-EDGE.md 第 5.1 节）
scripts/optimize-wasm.mjs       # wasm-opt 体积优化（npm run wasm:opt）——**刻意未接进构建**，结论见第 7 节
scripts/prepare-md-runtime.mjs  # 把 node_modules 里的 katex / marked 抄进 public/md/（裁掉 CSS 里的 woff / ttf 回退、写 assets.json），挂在 predev / prebuild 上
scripts/render-notice.mjs       # NOTICE.md / NOTICE.en.md → notice.html / notice.en.html（`npm run notice`，已挂在 prebuild 上；`--check` 校验两页是否最新）。语言相关的外壳文案（lang / canonical / 标题 / 描述 / 页头语言链 / 页脚）在文件内的 PAGES 表里，**不写进 markdown**；自写的极简 markdown 子集渲染，不引第三方解析器
NOTICE.md                       # 第三方开源组件清单（致谢 + 许可声明）：一、随产物分发的 npm 运行时依赖（Vue / Monaco / @runno/wasi + 直接依赖的 marked 与 DOMPurify，KaTeX 不在主包里、列在第二节）；二、`public/` 下自托管的上游产物（**2.1** 本地沙箱工具链：LLVM clang + lld 8.0.1 / wasi-libc / libc++ / compiler-rt / CPython 3.11.3；**2.2** 题解渲染运行时 public/md/ 的 KaTeX 0.18.9 + marked 14.0.0）；三、图标与字体（字体全是系统字体）；四、扩展 CC for Web 及其打包的库；五、构建期工具；六、外部评测服务（Piston / Judge0，本仓不含其代码）。**四件事任一发生都要回来同步**：改 package.json / 换 `public/wasm/` 的目录 / **换 `public/md/` 下的渲染运行时** / 换 `public/extension/` 的包；版本号要实机核（文件末尾附了核对命令，第 6 条就是查 `public/md/assets.json`）；面向用户的精简版是两版 guide 的「致谢与开源许可」一节（见第 12 节）。**英文对照版是 `NOTICE.en.md`**（2026-09-30 加，人工逐条对应，没有自动同步）
notice.html / notice.en.html    # **生成物，别手改**：上面两份源文件各自生成的静态页（中 / 英各一页），页头互链 + 三行 hreflang（x-default 指中文页），与两版 guide 同一套类名与主题脚本；两页都不进 SW 预缓存（见第 12 节）
docs/使用手册.md                # 面向新用户的说明：回答三个问题——「如何在本地运行 C++」「如何切换侧边栏面板 / 展开折叠侧边栏」「如何写题解（Markdown / LaTeX）」，与 src/i18n/messages/help.js 内容同源（**精简版**，且只有中文；完整版是 guide.html / guide.en.html）
docs/云端同步服务.md            # ★ 云端同步的后端（Cloudflare Worker `cf-config-api`）的**唯一在仓库记录**：拓扑 / Worker Route、身份验证模型（Codeforces handle 的 Last name）、五个接口的实测契约与错误原文、KV 键与 TTL、实测确认的行为（验证成功即删码 / 取新码作废旧码）、前端 `SYNC_KEYS` 白名单与登录语义，以及方案 A（设备令牌）的四处服务端补丁 + 前端令牌接线（`cp.cloudToken`、「上传本机设置」有令牌时直打 `/api/save`、401 自动退回取码）+ 部署自测命令。**Worker 源码不在本仓库**（也没有 wrangler 工程），所以改它之前先读这份文件、改完回来更新它
docs/新内核规划.md                # **只在「换内核」这件事上**的施工规划（2026-10-24 立）：`scripts/wasm-core/` 的实况进度、外部建议的逐项裁决（已实现 / 已过时 / 与 §18 实测冲突）、阶段 0–6 与每阶段的出口判据、换内核必须一起动的 9 条下游、待拍板 8 条。**不放基准数字**（第 18 节）、**不定判定语义**（`docs/评测判定规范.md`）。做完一个阶段就把那一节从这份里删掉、结论进本文件
docs/评测判定规范.md              # 评测判定的**规范性**口径：什么算 AC / WA / CE / TLE / MLE / RE / ERR、判定优先级（TLE > MLE > RE）、时间与内存口径（对齐 DOMjudge / Isolate / AtCoder / CF / USACO 的一手依据）、编译参数基线、输出比对规则、各引擎兑现矩阵、20 行验收矩阵、与现行实现的差距（§10，含「栈只有 1 MiB」与「`abort()` 误判 MLE」两条 P0）。换内核后哪些条目要重量，见 `docs/新内核规划.md` 阶段 3
src/
  main.js                       # 挂载 + 生产构建里注册 Service Worker + 装成 app 时武装返回栈（`armBackStack()`，**必须在 `mount()` 之前**，理由见第 23 节）
  sw.js                         # Service Worker 的**源码模板**（不是产物）：预缓存外壳（工具链与题解渲染器都不预缓存、改为按需落缓存），导航网络优先（见第 9 节）。桶名常量不在本文件里——SW 是 classic worker、没法 import，所以由 vite.config.js 的 `cp-service-worker` 插件把 services/storageNames.js 的 `SERVICE_WORKER_CONSTANTS` 生成一段 `const …` 前置进来，产物落 `dist/sw.js`（URL 与原来的 `public/sw.js` 完全一致）。**`public/` 下已经没有这个文件**，dev 下由同一个插件的中间件现场拼出来
  monaco-setup.js               # Monaco 的 dark / light 两套自定义主题（它仍是全站唯一的 Monaco 出口，但**引入清单已挪进 services/monaco/editorBundle.js**，见下）
  services/monaco/editorBundle.js # ★ **Monaco 的按需引入清单**（2026-10-13）：74 条 contribution 逐条抄自 monaco-editor@0.56.0 的 editor.main.js，**只删了 languages/definitions/*（83 种语言只剩 cpp/python/markdown 三个注册桩，monarch 定义仍是懒加载 chunk）与 languages/features/*（js/ts/css/html/json 四个语言服务连同各自 worker）**；语法之外全保留（查找框 / 右键 / 折叠 / 多光标 / 快捷键一条没少）。全量入口 `import * as monaco from 'monaco-editor'` 曾把 ts.worker（单文件 6.6MB）等 9.1MB 用不到的资产拖进首访预缓存。三件事：① 全仓只许这一处 import Monaco（经 `export *` + `export { monaco }` 双出口，`import * as monaco` 与 `import { monaco }` 都成立）；② 用 `monaco-esm/` 前缀（vite.config.js 的 alias 直指 esm/vs/，exports map 取不到 .css 与深层路径）；③ **升级 Monaco 后要重对清单**：`diff node_modules/monaco-editor/esm/vs/editor/editor.main.js` 的 import 表与这份清单，新增的 contribution 逐条决定收不收；④ **dev 下验「动作在不在册」不可靠**：预打包把 78 个 bare import 各自成 chunk、按需发现时可能跑两次 esbuild，两次产物的模块图各带一份动作注册表实例，动作会「忽有忽无」（2026-10-13 探针实测：同一份代码 dev 下 127/128 动作不稳定）——验编辑器能力一律**对产物**（`npx vite build --outDir /tmp/xxx` + `vite preview`），别信 dev server。
  i18n/index.js                 # ★ 界面双语的唯一权威：locale（模块级 ref 单例）/ setLocale / t(key, params) / messages(域) + LOCALES（id 与**自称**标签）/ DEFAULT_LOCALE / LOCALE_STORAGE_KEY。**刻意不走 usePersistentRef**——界面语言必须在任何组件挂载之前就定下来（首帧不能先闪中文），所以自己同步读写 localStorage、初值在第 0 帧算好；`applyLocale()` 同时维护 `<html lang>`。缺词条先退中文、再原样露出 key
  i18n/messages/{app,engines,explorer,help,settings,tests}.js  # 六个域的词条表：**同一文件里中英两栏并排**，改一处就看得见另一处（help.js 整棵是「应用内帮助」的正文内容树，走 messages('help') 整棵取，不是逐条 t()）
  styles/base.css               # ★ 所有 CSS 变量 + 全局元素样式，改配色只改这里
  styles/fonts.css              # 代码区三款内置字体的 @font-face（JetBrains Mono / Fira Code / Cascadia Code，各取 latin 子集 + Regular/Bold），由 base.css 首行 @import 引入；字体文件在 public/fonts/
  styles/cf-console.css         # Codeforces 页共用的版式（2026-10-28 大改版）：不铺卡片 / 不画网格，留白 + 一条 5% 淡线分区；输入框 6px 圆角，芯片 / 分段 / 主操作 10px，小徽标与紧凑行内按钮 6px；主操作是通栏 36px 低透明度 `--accent-face` 面，颜色只留在字与图标上。抽题 / 比赛 / 赛程 / 榜单 / 提交五个组件都用 `<style scoped src>` 挂同一份，另有 `.cf-tabs` / `.cf-titlebar` / `.cf-search` 这类页内规则留在各自组件里
  styles/guide.css              # 使用指南页（guide.html 与 guide.en.html 共用）的样式：**`@import './base.css'` 后再加长文排版**，两套主题的配色 / 字体 / 滚动条仍来自 base.css，这里一律 `var(--…)` 引用、不写十六进制（见第 12 节）。唯一要小心的：base.css 是为「满屏 IDE」写的（`html/body` 高度 100%、body 锁死滚动），内容页必须把那两条放开，否则长页滚不动
  App.vue                       # 布局骨架（workspace / pane / splitter）+ 全局状态；另外挂两件全局事：window 捕获阶段的 keydown（快捷键。两张表分开放：`SHORTCUT_HANDLERS` 是「在哪儿按都算」的 8 条，`SHORTCUT_TREE_HANDLERS` 是**作用域受限**的重命名 / Delete / ⌘·Ctrl+A 那 3 条 —— 后者先过 `treeScopeFrom()` 闸门，其中 ⌘·Ctrl+A 另有一条「指针在哪一块」的判据，见第 13.4 节）与 `useCompanionImport()`（接扩展投来的题目）
  composables/usePersistentRef.js
  composables/useUiScale.js       # ★ 全局界面缩放的唯一权威：uiScale 单例 + 档位表 UI_SCALE_OPTIONS + px()（设计 px → 真实 px）+ applyUiScale()（落根字号）+ normalizeUiScale()（读盘校验）。三条边界见文件头与第 5 节坑 24
  composables/useInstallPrompt.js  # 设置视图「应用」分组里「安装到设备」按钮的数据源：拦 beforeinstallprompt，用完即弃；另含 MANUAL_INSTALL_BROWSER（三星例外，见 13.4）
  composables/useMobileKeyboard.js # 触摸屏「键盘模式」：视口收缩 + 不抢焦的保焦拦截（见第 3 节末）
  composables/useCompanionBridge.js # ★ 扩展消息接收端：window.postMessage 握手（cp-ping → cp-info）与题目投递（cp-task）。状态是**模块级单例**（扩展装没装是全局事实，各组件不该各探一次）；同站多开标签页时扩展会广播，按 taskId 去重。2026-10-11 加了两对**网页发起的请求**：`cp-fill-code`（请扩展去 Codeforces 代填云同步验证码，`requestCodeFill`，超时 `FILL_TIMEOUT = 15000`）与 `cp-cf-check`（问「这个浏览器登的是不是这个 handle」，`checkCfIdentity`，超时 `CF_CHECK_TIMEOUT = 3000`，只回四值枚举），以及**能力协商** `canFillCode` / `canCheckCf`（读 `cp-info` 的 `capabilities`，见 13.1）。2026-10-20 又加了一条**扩展发起的收尾回报** `cp-fill-code-saved`（`saved` = 那枚码在 Codeforces 上到底保存成功没有，`requestCodeFill` 顺手返回一条 `saved` Promise、超时 `FILL_SAVED_TIMEOUT = 13000`）与能力 `canFillSaved`（`fill-saved`）—— 站点据此把「填写 → 验证 → 登录」串成一条链路。**2026-10-23 再加一键提交那一组**：`cp-submit`（`requestSubmit({ url, source, language }, onVerdict)`，源码字段叫 `sourceCode`、别与信封的 `source` 撞名）+ `cp-submit-result`（表单提交这半步的回执，超时 `SUBMIT_TIMEOUT = 60000`）+ `cp-submit-status`（判定变化广播，等待上限 `SUBMIT_WATCH_TIMEOUT = 5min`），能力 `canSubmitCode`（`submit-code`）；失败原因 / 判定码翻人话是 `services/ojSubmit.js` 的事，本文件只收消息、认 `requestId`。**2026-10-27 再加比赛那一组四对**：`requestContestStates`（`cp-contest-states`，超时 30s，只收六种状态枚举）、`requestContestEntry`（`cp-register` / `cp-start-virtual` 合成一个函数，超时 60s）、`requestUnofficialRank`（`cp-unofficial-rank`，超时 40s，只收「handle 字符串 + 正数名次」的条目），能力 `canReadContestStates` / `canRegisterContest` / `canRegisterUnrated` / `canStartVirtual` / `canReadUnofficialRank`；⚠️ 名次回包那一页叫 `rankSource`，不叫 `source`（信封标记同名会被展开覆盖，整条消息被丢掉 —— 2026-10-27 实测踩过）
  composables/useCompanionImport.js # 订阅扩展题目 → 调 problemImport 落盘 → 把样例**整体替换**进评测面板 → nextTick 后抢焦点。它是 problemImport 返回值的唯一消费方
  composables/useShortcutManager.js # ★ 全局快捷键的唯一权威：动作表 SHORTCUT_ACTIONS（**11 项**；2026-10-23 加「提交到 Codeforces」`submit-solution`，默认 `Mod+Shift+Enter`）+ 绑定表 + comboFromEvent 规范化 + 冲突检测 + localStorage。**刻意不挂组件生命周期**（App 的全局 keydown 与 EditorPane 的状态栏提示都要在任何组件挂载前就可用）。两条别踩：① 动作表里 **3 条是「作用域受限」的**（`rename-node` / `delete-node` / `select-all-nodes`），执行入口不在 App.vue 的 `SHORTCUT_HANDLERS` 而在 `SHORTCUT_TREE_HANDLERS`，别照抄别的动作往那张表里加；② 裸键默认只放行功能键与 `Esc`（`SAFE_BARE_CODES`），个别动作可用自己的 `bareCodes` 额外点名（目前只有 `delete-node` 的 `Delete`），导出 `bareAllowedFor()` 给录制框共用（见第 13.4 节）
  composables/springOpen.js      # ★ 悬停在折叠目录上自动展开的时钟（2026-10-19 加）：站内挪文件（`useTreeDrag`）与从系统里拖入（`usePageDrop`）**共用同一份**实现 —— 600ms（`SPRING_OPEN_MS`）、只对折叠的目录计时、目标没变就不重新计时、到点只 `toggleExpand` 一次。`createSpringOpen({ delay, onOpen })` 返回的是**一次拖拽过程内**的状态，别做成模块级单例；调用方必须在拖拽结束（松手 / Esc / dragend / 离开窗口）时 `cancel()`，否则计时器会在结束后补一发展开。`usePageDrop` 用它时多一条「指针真的挪过才重挂」（见第 5 节坑 42 第 7 条）
  composables/useTreeDrag.js     # ★ 资源管理器文件树的拖拽移动（Pointer Events；鼠标位移超 4px 即拖，触屏要先按住 450ms）。本模块不碰 VFS，落盘由 FileExplorer 的 onDrop 交给 vfs.rename；树以外的落点（编辑区 = 拖过去打开 / 跳转页签）由落点自己 registerDropZone 登记。2026-10-10 加触屏长按的两段反馈：`pressingId`（按住中 → 行上 `--pressing`）与 `armedId`（长按已成 → 行上 `--armed`），**两态互斥**、都在这里置位、统一在 cancelPress 收掉（行上怎么画见第 3 节 FileTreeItem 那格）。**2026-10-11 改长按的落点**：到 450ms 那一刻**菜单当场弹出来**（以前要等抬手才弹），此后原地抬手 = 菜单留在屏幕上接着点、指头一动（超 8px）= 先把这个菜单收掉再改判成拖拽；抬手那一下浏览器补的合成 click 在**捕获阶段整个吃掉**（菜单在屏幕下半部会被视口推到指头之上，点击目标正好是某根条目），收网的时机是「它自己吃掉那一发」或「下一根指头按下来」，**不能挂在 cancelPress 上**（那比抬手还早）
  composables/usePageDrop.js     # ★ **从系统里往页面上拖文件**（2026-10-12 加；与 useTreeDrag 是两套手势、事件面零重叠，别合并）：窗口捕获阶段的 dragenter / dragover / drop，只认 `dataTransfer.types` 里有 `Files` 的（编辑器里拖一段文本不受影响）。落点判据：指针压在资源管理器某一行上 = 那个目录（压着文件行 = 它所在的目录，与站内拖拽同口径）、**别处一律根目录** —— 整页都是落点。状态在模块级 `pageDropTarget`（`{ path, rowId, inExplorer }`），由 FileExplorer 与站内拖拽的高亮**合流**后点亮树（`mergedDropRowId` / `mergedRootDrop`）；导出的 `active` 给 App.vue 干两件事 —— **拖入期间把侧栏撑开到最宽并停在资源管理器**（App.vue 的 `previewDropTargetLayout`，2026-10-13 加；离开窗口 / 松手原样还原），以及松手交给 `onFiles(path, items)` 由 FileExplorer 的 `importDroppedItems` 落盘（与页头导入**同源**，结果播报经 `announce` 出口换成**全局通知**，见 `announceImportInline` 的说明）。**悬停在折叠的目录行上 600ms 会自动展开**（2026-10-19 加，与站内挪文件**同一份实现** `composables/springOpen.js`；`dragover` 在指针不动时也会反复来，所以计时只在指针真的挪过时重挂 —— 见坑 42 第 7 条）。坑见第 5 节坑 42
  composables/useTabDrag.js      # 编辑器页签的拖动排序（Pointer Events，鼠标 5px 阈值 / 触屏 450ms 长按先 armed 再拖）。**一条混排序列里排**：文件页签与合成视图页签都认同一个 `data-strip-id`，落点在**整条条带**上数（混排这条规矩的来由见 services/tabStrip.js 那格；2026-10-11 之前它是「只排文件页签、视图页签恒定在后」，现已改成混排）。本模块不碰 store，落盘由调用方的 onDrop 交给 `tabStrip.moveStripItem`。触屏另有三件事：`contextmenu` 与非被动 `touchmove` 都在 **pointerdown 那一刻**就挂上（拦截本身只在 armed/dragging 时生效），并输出 `pressingId` / `armedId` 两段长按反馈。详见第 3 节 EditorTabs 那格
  composables/useEditorMenu.js   # 编辑区的上下文菜单（2026-10-10 加）：**桌面鼠标右键与触屏长按共用同一份自绘菜单**（`ContextMenu.vue`），并负责把 Monaco 自带的英文菜单拦掉。触屏长按 450ms 会**先选中手指下的词**再弹菜单（轻点 = 光标、双击 = 选词、长按 = 选词 + 菜单，与 iOS / Android 原生一致；长按处已在选区内则保持原选区）。⚠️ Monaco 那套触摸手势的三个硬事实见第 5 节坑 31与坑 30
  composables/usePopoverLayer.js # 浮层的两件公共事（2026-10-11 从 `ContextMenu.vue` 抽出来）：「匣进视口」与「什么时候关」。传 `{ x, y, align, onDismiss }` —— `x` 默认是浮层左缘、`align: 'right'` 时是右缘（菜单右对齐这么用），量到真实宽度后换算 + 夹进 `[gap, 视口 - 尺寸 - gap]`；关闭四路：点浮层外 / Esc / 窗口失焦 / resize，监听注册时机**分开**（2026-10-19 修）：**只有 `pointerdown` 延迟一拍**（打开这一下往往就是某个 pointerdown 带出来的，当场挂会被同一发事件立刻关掉）；Esc / 失焦 / resize **当场挂** —— 它们打开不了浮层，跟着一起等只会留出一个真实的吞键窗口（实测：浮层刚显形、主线程忙时立刻按 Esc，第一发不生效、第二发才关 —— 旧实现把四路全塞进 clamp 之后的 `setTimeout(0)`，timer 会被长任务拖后几十毫秒）。**resize 那一路有例外**（2026-10-11）：焦点在浮层里面时**只重匣位置、不收** —— 手机上点进输入框会顶起软键盘，安卓把视口压矮并派发 resize，照默认口径收掉等于把用户正在填的表单当场销毁（实测 414×896 点进菜单里那个用户名框、视口一变矮整个菜单就没了）。判据是 `root.contains(document.activeElement)`，没有输入框的 `ContextMenu` 因此行为不变。`ContextMenu.vue` 与 `SettingsMenu.vue` 共用，别再手搓第二份定位
  composables/useSelectionHandles.js # ★ 触屏编辑区的选区手柄（2026-10-10 加）：Monaco **没有**「拖两端圆点改选区」的能力，这一层整块自己画（`.editor-pane__stage` 里一块浮层 + 两颗圆点）。位置用 `editor.getScrolledVisiblePosition()`（返回值已含滚动偏移）算，拖动时把**对面那一端**钉住、用 `getTargetAtClientPoint()` 把手势坐标换回 model 位置再 `setSelection()`（选区与高亮仍归 Monaco 管）；拖到上下边缘会自己滚（rAF）。只对触摸出手柄（初值 = `isTouchPointer() || navigator.maxTouchPoints > 0`，之后每次 `pointerdown` 按 `pointerType` 更新），鼠标一路不受影响。⚠️ **拖动期间必须给手柄挂 `.is-dragging`（`pointer-events: none`）**，否则手指移进手柄自己的盒子会让 `getTargetAtClientPoint` 返回空、拖动当场卡死 ——    见第 5 节坑 32
  composables/useOverlayScrollbar.js # ★ 覆盖式滚动条（2026-10-13 加）：不占宽度、浮在内容之上、滚动才淡入。原生滚动条是**占位**的（base.css 里 11px），一出现就从内容里挖掉一条、窄侧栏里行会整体挪一下；这里把原生那条藏掉（**调用方自己**在 scoped 里补 `scrollbar-width: none` + `::-webkit-scrollbar { width: 0 }`，本模块管不着） ，改用一条挂在 `body` 上的 `position: fixed` 自绘滑块（几何 = `clientHeight` / `scrollHeight` 按比例映射，下限 `MIN_THUMB = 20`；**横向留白 `EDGE_INSET_X = 1`（2026-10-13 由 3 收到 1）、纵向 `EDGE_INSET_Y = 3`** —— 两支刻意分开：往边线靠只该发生在右边，上下那 3px 是留给「不压住行的悬停底色」的；停 `HIDE_DELAY = 800` 淡出，悬停 / 拖拽期间不淡出）。滑块**不是纯指示灯**：`pointerdown` 起手 + `setPointerCapture`，位移按同一比例换回 `scrollTop`。样式在 `base.css` 的 `.oscroll-thumb`（**必须全局** —— 那片滑块是 JS 建出来挂 body 上的，组件的 scoped 够不到），`data-oscroll-for` 标明归属容器（同页多条滑块时给探针指名道姓）。**滑块宽度写死在 `base.css` 的 `.oscroll-thumb`（现 6px，2026-10-13 由 8px 收到 6px）**，本模块不碰宽度。目前两个消费方：`FileExplorer` 的 `.explorer__tree`、`TestPanel` 的 `.cases`。坑见第 5 节坑 43
  composables/contentHit.js      # ★ 命中测试的**穿透层**（2026-10-13 加）：`contentElementAt(x, y)` 取指针底下**真正属于内容**的那个元素 —— 穿透两件浮在内容之上、不属于任何面板内容的界面件：覆盖式滚动条滑块 `.oscroll-thumb`（可见时 `pointer-events: auto`）与两栏分隔条 `.splitter`（12px 热区靠负外边距压进两侧卡片各 4px）。它俩正好都盖住资源树右缘那一条（均为热区「只向右外扩」之前的实测：滑块 `[553,559]`、热区 `[555.6,567.6]`，重叠 3.4px、滑块右缘离那条线只有 1.6px），用裸的 `elementFromPoint` 会让落点判定拿不到行、退化成「树空白处 = 根目录」。做派：先问一次 `elementFromPoint`，只有命中的确实是这两件浮层时才退回 `elementsFromPoint` 逐个找下去。三个消费方：`useTreeDrag.resolveTarget`、`usePageDrop.resolveDropTarget`、`App.vue` 的 `pointerTarget`（⌘A 区域判据）。见第 5 节坑 44
  composables/useCfContest.js    # ★ 比赛的数据层（2026-10-19 加；取数与倒计时纯网页，**只有样例要靠扩展**）：比赛链接 / 裸 ID → 元数据（`contest.list`，缓存 1h）→ 倒计时 → 题目列表 → 逐题导入工作区 → 整场抓样例。八条口径：① 倒计时**不累减** —— 每秒只推进一个 `now`，剩余量由 `contestRemainingMs` 拿「取数时刻 + `relativeTimeSeconds`」现算，后台标签页被节流、睡一夜再回来都对，cf-tool 那句 `Sleep(900ms)` 想补的时钟偏差它一并解决；② 状态行的顺序有讲究，**倒计时排在「正在获取题目列表」前面**（开赛前那个数字才是主信息）；③ 「还没开赛 / 这场没有列表」走 `problemsNote`（列表区的小字），**绝不进 error 去顶掉状态行** —— 这条是探针当场抓出来的：先前它把 `距开始 288:27:11` 盖成了「还没开赛」；④ 题目列表**唯一来源是 `contest.standings`**（2026-10-20 改 —— 2274 实报题库 dump 缺题且可能永久缺，细则见第 7 节比赛那条的 ②；standings 裸参响应是整场榜单 2–6MB，Worker 里按场次缓存 `contestProblems:<id>`）；⑤ **两条取数各带一个代次计数器**（`contestSeq` / `problemsSeq`），并发都放行、回来按代次认领，晚到的旧结果直接丢 —— 用 `if (loading) return` 当并发守卫会让「改一下输入框再点载入」**根本不发请求**，界面停在旧那场；⑥ 归零那一刻**元数据与题目列表都要重取**（挡掉 `next === 'unknown'`，否则换一场时会被补刷多打一遍）；⑦ 抓样例**先安静落题、再请扩展**（`importProblem(..., { quiet: true })`，否则一场七八道会把页签连翻七八次、还把抽题面板自己顶掉），成败只写在抬头那行小字 `scrapeNote` 上、**不占 `error`**；⑧ **组件卸载联动**：`cfReady` 翻假时关页签、清状态（细则见第 7 节比赛那条的 ⑤）。界面是 `components/CfContestPanel.vue`，2026-10-27 起挂进合并后的 Codeforces 页签（不再单独占视图 id）；2026-10-28 起页内是「题目 / 排行榜 / 提交」三个平铺页签（原两层模式轴已撤，赛程升到页头的三个模式里）；同日再改「空状态 → 比赛名」两态：没载入时整页只剩一颗大输入框 + 载入（落在内容区 38.2% 黄金分割点；页签与列表这时全是无数据的空壳，不画），载入成功后抬头**原地升到顶部**变成比赛名（链去 CF）+ 铅笔（点它换回输入框，可贴另一场的 ID / 链接），页签与列表在其下展开。五条实现口径：① 移位靠 FLIP（量旧 `top` → `nextTick` → 量新 `top` → 反向 `translateY` → 下一帧归零，`0.28s cubic-bezier(0.22,0.72,0.2,1)`；`transitionend` 清内联样式 + 420ms 兜底；`prefers-reduced-motion` 直接落位），形态交替靠 `Transition`（离场元素绝对定位，不撑高）；② 输入框载入期间用 `readonly` **不用 `disabled`** —— `disabled` 会把焦点丢给 body，Esc 退回当场收不到；③ Esc 退回要复原**上一次成功载入**的文本（`loadedText`），不能只清 `error`：失败那次 `load()` 可能已经把整场清空，得按 `failedSearch.cleared` 决定是否补跑一次 `load()`；④ 列表容器用 `v-show` 不用 `v-if`，铅笔来回切时榜单 / 提交的取数进度与分页都还在；转换期间 `:active` 跟着 `searching` 熄火，别让轮询顶着搜索态跑；⑤ 名字条只截**名字**（省略号 + `title` 看全名），状态胶囊 `flex: 0 0 auto` 不许被挤成「已…」；页签行 `flex-wrap`，极窄容器下换行而不是叠字
  composables/useCfSchedule.js  # Codeforces 页「赛程」模式的数据层（2026-10-27 加；2026-10-28 赛程升到合成页签抬头，页签打开仍先落在抽题）：`contest.list` → 正在进行的 / 即将开始的 / 最近结束的（最近结束只留 `FINISHED_LIMIT = 12` 场）三组 + 每秒重算的倒计时。**倒计时同样不累减**（每秒只推进 `now`，剩余量按 `contestRemainingMs(contest, fetchedAt, now)` 现算，后台节流 / 睡一夜回来都对）；**阶段自己按时间推**（列表能在缓存里躺 1 小时，期间 BEFORE → CODING，等下一次刷新才翻面就会在开赛那一刻显示错状态）；**不自动轮询列表**（只变「有没有新场次」），回访时数据超过 `STALE_MS = 10 分钟` 才静默取一次，刷新按钮走 force 绕过 1 小时缓存。**2026-10-26 加报名状态与两个动作**：`loadStates()` 只在「这一页可见 + 扩展有 `contest-schedule`」时读一次（`STATES_STALE_MS = 3 分钟`），存成 `contestId -> 枚举`；`submitEntry(contest, kind)` 报名 / 开 VP 各发一条、等一个枚举，报名成功只就地改那一格（不重取整表），VP 不改那一列。**两条硬口径**：① 不可逆动作只由确认卡片触发一次，这里不弹界面、也绝不自动重放；② `active` 是「这一页真的露出来了」（由 `CfContestPanel` 逐层与页签可见性相与），不能只判内部 mode —— 整页没露出来时一次都不该取
  composables/useCfStandings.js # 比赛面板「排行榜」页的数据层（2026-10-27 加）：取一次 `contest.standings` → `cf/standings.js` 归一化 → 客户端分页（`STANDINGS_PAGE_SIZE = 100`；API 没有分页参数，一份 2–6MB 一次拿全，DOM 画不了 15,000 行）+ 我的行高亮 / 「跳到我」（只改页码不额外请求）。**轮询自己算**：只有「这一子页可见 + 页面在前台 + 比赛进行中」才排，10 秒一次、`setTimeout` 链（慢请求不会堆积）；已结束 / 未开赛一次都不排；后台回来先补一次。`seq` + `inFlight` 让换场 / 手动刷新 / 轮询撞车时只认最新一发。**只画官方榜**（API 不含 VP），自己的非正式名次要靠那颗按钮去问扩展（见 `CfStandingsTable`），这里不掺进去。**2026-10-27 起导出 `problemStats`**：表尾那行「通过 / 尝试」由 `cf/standings.js` 的 `problemStatistics` 拿手里这份榜单现算，整场口径、零额外请求（细则见第 7 节）
  composables/useCfSubmissions.js # 比赛面板「提交」页的数据层（2026-10-27 加）：最新提交流（`FETCH_COUNT = 200`，**永远只取最新一段**，更早的历史 P1 再做）+「只看我」+ 比赛中的轮询。**「只看我」走服务端过滤**：`contest.status?handle=` 让 CF 先筛 —— 旧比赛整场 60 万条，最近 200 条里很可能一条都不是你的；切筛选会清空重取（两种口径的记录不能混在同一份缓存里），在途那一发按代次作废。轮询与榜单同一条纪律：只有「这一子页可见 + 前台 + 进行中」才跑，5 秒一次；与榜单的 10 秒合起来 3 次 / 10 秒，在 CF 的 1 次 / 2 秒限流内
  cf/contest.js                 # 上面那条的纯逻辑：链接解析（URL 分段，覆盖 /contest /gym /group /problemset + 裸 ID，**不用正则大表**）/ URL 拼回（gym 与 group 的题目链接形态不同，别用 `cfProblemToTask` 拼）/ `contestRemainingMs` / `contestStatus`（**不信 `phase`** —— 页面开着不动时它恒为取数那一刻的值，倒计时归零必须能自己翻面）/ `sortByIndex`（A、B1、B10 自然序）/ `formatDuration`（`HH:MM:SS`，比赛状态行用）/ `durationParts`（拆成周 / 天 / 小时 / 分钟 / 秒，赛程行用）。无框架、无网络，能直接在 Node 里跑
  cf/cfWorker.js                # ★ CF 所有网络请求的唯一出口（module worker）。一条**全局串行闸门** `apiFetch()`：任意两次 CF API 请求至少隔 `API_MIN_GAP = 2100ms` —— CF 明写 1 次 / 2 秒且**按来源 IP** 算，抽题、赛程、榜单、提交记录、提交详情共用同一份额度，**新接口一律走它，别在别处 fetch**；同 URL 的并发再由 `once()` 合并成一个 Promise。消息协议见文件头（`status / prefetch / pick / checkHandles / clear / contest / contestProblems / contests / standings / submissions / submissionDetail`）。缓存纪律：题库 24h、已 AC 12h、handle 1h、contest.list 1h、每场题目清单 24h（只存 problems，几 KB）；**榜单不落 IndexedDB**（单场 2–6MB），只在内存里留一份：已结束 60s、进行中 3s，最多 4 场。P0 的三条：`contests` 走 `contest.list`（非 gym 与 gym 两个列表分开缓存）；`standings` 只打裸参、开赛前回 `{pending:true}` 而不是报错；`submissions` 的 count 收敛到 1..1000（老场次 61.5 万条，**永远不全量拉**），`handle` 交给服务端筛。**2026-10-27 起所有请求统一带 `Accept-Language: en`** —— CF 的题名只有英 / 俄两套（没有中文），`contest.standings` 不带这个头**默认回俄文**（2276 实测 `Идеальные бутерброды` ↔ `Perfect Sandwiches`，与官网 `title="A - Perfect Sandwiches"` 一致）；它是 CORS 安全列表内的简单头、不触发预检。每场题目清单的缓存键因此抬到 `contestProblems:2:<id>`，否则已缓存的俄文题名还会再躺 24 小时
  cf/cfCache.js                 # Worker 侧 IndexedDB 缓存（题库 / 已 AC / handle / 比赛列表 / 每场题目清单）。TTL 由 cfWorker 的常量决定，这里只管读写；主线程不碰
  cf/standings.js               # 排行榜纯逻辑（2026-10-27 加，无框架 / 无网络 / 能在 Node 里直接跑）：把 API 的 `{contest, problems, rows}` 归一化成界面形状；**三套计分口径别混**（CF 制直接显示 `row.points`，含 hack 加减分，别自己重算；ICPC 的 points = 过题数、penalty = 罚时；IOI 只有总分）；冻结节保留 `cell.type = PRELIMINARY` 给界面挂提示。**API 榜单只有正式参赛者**（2026-10-26 拿 2184 的 15,725 行验过，全是 `CONTESTANT`）—— VP / 非正式不在里面，界面明说「官方榜」，精确的那一个名次由排行榜抬头那颗「非正式名次」去问扩展（2026-10-27 起）。**题格口径（2026-10-27 定）**：主行 = `+`（ICPC）/ 得分（CF / IOI），副行 = **通过时刻**（`bestSubmissionTimeSeconds` → `HH:MM`，与 CF 榜单页一致），CF 制的失败次数只进 `title`；**「通过的格子算不算 partial」只对 IOI 生效** —— CF 给的是衰减后的得分（500 分题实际到手 320），拿它跟 `problem.maxPoints` 比会让每个通过的格子都落进 `partial`（黄色），这个 bug 2026-10-27 实测抓出并修掉。`problemStatistics(rows, problems)` 供表尾：通过 = `points > 0`、尝试 = `points > 0 || rejected > 0`，整场（不是当前页）—— 与 CF 页面表尾 `tr.standingsStatisticsRow` 逐题一致（2276 ICPC：7342/7618 … 4/4；2272 CF 制同口径对上）。**没通过的格子（2026-10-27 深夜定死）**：`rejected > 0` 时主行画红字 `-N`、`tone: 'fail'`，**不许放进 9px 的副行** —— 曾这么干过一次，副行的 `--text-faint` 把 fail 色盖掉，用户当场报「排行榜又不显示罚时了」（CF 的 ICPC 榜单也是一格红字 `-2`）。CF 制「通过」的格子才把被拒次数留在 `title`（CF 同款）
  cf/submissions.js             # 提交记录纯逻辑（2026-10-27 加）：CF `verdict` 枚举 → 站内短码（TESTING / SUBMITTED 不是终态，界面画「进行中」）、按 id 合并（轮询只取最新一段，合并而不是替换，旧的因被挤出前 200 的不能丢）、倒序截断、`filterMine` / `summarizeMine`。⚠️ **`relativeTimeSeconds` 会把赛后 / 练习提交填成 INT32_MAX（2147483647）** —— 那是「没有比赛内时刻」的哨兵不是秒数，照常格式化会得到 `596523:14` 把时间列撑爆；`RELATIVE_TIME_MAX`（100 天）以外一律归一成 null，界面退回本地时刻
  cf/myHandle.js                # 「我的 CF handle」的**模块级单例**（2026-10-27 加）：落盘键沿用抽题的 `cp.cf.handle`，三个消费方（抽题「排除已通过」/ 排行榜「跳到我」/ 提交记录「只看我」）必须读同一份 —— 各持一个 `usePersistentRef` 会得到三份互不同步的副本。允许逗号 / 分号 / 空格分隔多账号：排行榜取第一个高亮，提交记录用整组做本地过滤
  components/
    ActivityBar.vue             # 折叠后顶替侧栏的图标栏（仿 VS Code 的 Activity Bar，`nav.activity-bar`）：顶部两枚 = 侧栏两个面板（点一下 = 展开侧栏并切过去，走 App 的 `selectSidebarPanel`），底部两枚 = 编辑区里的合成页签入口（组件 / 设置，**不展开侧栏**；组件那颗 2026-10-19 起弹组件菜单 `ComponentsMenu`（2026-10-20 由 `CfMenu` 改名并按类分组）、齿轮弹 `SettingsMenu`，都 `placement="beside"` 朝屏幕内侧展开；组件那颗**常驻**（工具类与 Codeforces 装没装无关），填亮 = 抽题 / 比赛任一页签或倒计时卡开着）。展开态整条不渲染（`v-show` 与 `is-collapsed` 同源），所以它与页头那套不会同时在场 —— 2026-10-14 之前还挂着一条「`flex-basis` 收到 0 + 淡出」的过渡，那是给 CSS 补间路径用的，随那条路径一并删除。面板表由 App 从 Sidebar 的 `defineExpose` 透传进来（状态仍只有 `cp.sidebarTab` 一份），本组件不自己存。**窄屏折叠态整条横过来、通栏贴在工作区的一条边上**（贴下还是贴上由设置 `cp.narrowCollapseSide` 决定，默认下；高 50px、一排按钮整排居中，2026-10-13）—— 判据与坑 45 是同一个类（`html.is-narrow`），但规则写在 **App.vue**（要匹配 `.workspace.is-collapsed` 这个祖先），口径见第 3 节组件树与第 5 节坑 46
    HotkeyRecorder.vue          # 单个动作的快捷键录制框：点一下开录、冲突红字且拒绝写入、Esc 放弃、Delete 清除绑定；开录时置 recordingActive 让全局监听让路（见第 13 节）。⚠️ Delete / Backspace 是「清除绑定」，**但若这个动作允许裸按它**（`bareAllowedFor()`，目前只有「删除（文件 / 文件夹）」）就当键位收下 —— 一律当清除的话，那条动作被清掉之后就再也录不回来（只能整组复位），想清除它请用 × 或 Backspace
    EditorPane.vue              # 编辑区容器：Monaco 画布 + 设置视图（两者 v-show 互斥）+ 底部状态栏；把 judge / connection 透传给设置视图（运行状态不再透传——页签栏那颗运行按钮已删）。**题解那一行（工具栏 / 插入行 / 字数 / 视图胶囊 / 全屏按钮 / 预览面板）与 Monaco 侧那 14 条 `addAction` 也都在这个文件里**；状态栏的四道闸门在样式表末尾
    EditorTabs.vue              # 编辑器标签栏：只有一条 `strip`，里面是**文件页签与合成页签（设置 / Codeforces）的混排序列**（横向滚动，顺序归 services/tabStrip.js，拖动可跨类换位）。右端那颗「运行 / 停止」按钮已于 2026-09-28 删除（运行入口见第 1 节硬约束表）
    EditorSettingsPanel.vue     # 设置视图：铺满编辑区、与代码文件平级的合成页签（不再是抽屉 / Teleport）；宽面板下是「目录 + 内容」两栏、窄面板下目录折成顶部横条（判定走容器查询，见第 5 节坑 7），目录 = 工作区（仅桌面端）/ 外观 / 编辑器 / **模板** / **快捷键** / 评测 / **云端同步** / 应用 / **浏览器插件**（仅网页版）/ 帮助（`SECTIONS` 常量驱动，共 10 项，两端各隐掉一项自己独有的、都显示 9 项；B 步自 2026-10-01 起逐项点开验行为、不再数个数）。默认选中项是「外观」（2026-10-11 起：原先排在最前的「常用设置」分类已删 —— 它只是把主题 / 界面缩放 / 字体大小 / 侧边栏位置再摆一份、与各原分类共用**同一份数据**）；「云端同步」管登录绑定与「预下载本地运行环境」开关，后端见 `docs/云端同步服务.md`；未绑定时输入框右侧还有一颗**导入**按钮（2026-10-06 加）——只取一份公开的云端配置（`fetchCloudProfile`），不取码、不写 `cp.cloudAccount` / `cp.cloudToken`、不建立绑定，实现上是把用户名交给 `cloudApplyHandle`，复用地址栏 `/<handle>` 那条确认弹窗与 `confirmCloudApply()`。它是装成 PWA（独立窗口、没有地址栏）后导入云端设置的唯一入口。⚠️ **「云端同步」这一栏的会话状态与动作 2026-10-11 已下沉到 `services/cloudSession.js`**（账号 / 令牌 / 用户名框 / 验证码 / busy / 报错 / 提示，以及取码、登录、验证、带令牌上传）—— 齿轮菜单的二级里也要做同一套，两边必须共用一份；这里只剩渲染与「上传 / 下载 / 解绑 / 导入的确认弹窗」这些**面板独有**的部分，别在本文件里重写一份云逻辑（2026-10-11 起那三颗按钮直接绑 `uploadCloud` / `downloadCloud` / `unbindCloud`，动画与反馈都在服务层里）。这四条路（导入 / 上传 / 登录 / 下载到本机）成功之后都会把 `/<handle>` 写进地址栏、并把「本机在跟谁 + 套用的是哪一版」记进 `cp.cloudActive`（2026-10-10 加，下次打开站点直接对齐这一套，并把地址栏补成 `/<handle>` —— 只在**网页版 + 站点根路径**时补，见 cloudEntry.js 的文件头），见 `cloudEntry.js` 的 `writeCloudEntryPath` / `writeActiveProfile`：上传两处在各自成功分支里直接调这两个函数，导入 / 登录 / 下载走 `adoptCloudProfile(data, handle, updatedAt)` 的第二、三个参数（**登录只下不传、也不因此建立绑定**的规矩没变）。「外观」那组管主题 / 字体大小（`APPEARANCE_ROWS`，仍是 editorSettings 的键）与侧边栏位置 / 界面缩放 / 窄屏折叠方向（各有自己的出口；这一栏自 2026-10-13 起按行上的 `when` 过滤 —— 就是 `appearanceRows` 那个 computed，目前只有「窄屏折叠方向」一行有条件，见第 5 节坑 49）；「编辑器」那组按 `EDITOR_GROUPS`（字体 / 编辑 / 光标与高亮 / 视图 4 小节，共 22 行；2026-09-30 在「视图」小节末尾加了 `statusBar`）数据驱动渲染，每行只写「键 + 标签 + 控件类型 + 可选项」，可选项表全部来自 services/editorOptions.js；「快捷键」那组按 `SHORTCUT_ACTIONS` 渲染 `HotkeyRecorder`；「应用」那栏 = **安装到设备** + **本地运行环境**（按 `RUNTIMES` 表渲染**三行运行时**：C++ / Python / 题解渲染器，同一套代码，`language === 'markdown'` 时由 wasmRuntime 转给 mdRuntime）；**「浏览器插件」2026-10-11 起独立成一栏**（网页版独有，桌面端由 `visibleSections` 裁掉），管扩展的安装包下载 / 状态探测 / 投递目标两个开关 / 插件侧快捷键查看（两个常量 `EXTENSION_VERSION` / `EXTENSION_FILE` 决定下载地址，升版本只改这里 + 换 zip）
    EngineSettingsPanel.vue     # 「评测」分组里的引擎列表 + 服务地址 + 自检（原顶栏「评测引擎设置」弹层的正文）
    HelpPanel.vue               # 「帮助」分组里的问答列表 + 完整指南链接（原顶栏「?」抽屉的正文，现只读、无按钮 / Teleport，与 docs/使用手册.md 同源）。**体例（2026-09-29 定）**：`GROUPS` 是「分组 → 条目」两层，每条 = `name`（**必须是疑问句**，它就是小标题）/ `role`（一句话答案）/ `steps`（操作步骤，渲染成 `<ol>` 1. 2. 3.）/ `notes`（要点与口径，渲染成圆点）/ 可选 `table`（判定码、性能实测这类多列短值）；正文里用 `**…**` 标出界面上的按钮名与页面名，`segments()` 负责拆成加粗片段（**不走 `v-html`**：文案里会出现 `<vector>` 这类头文件名，交给 HTML 解析会被当标签吃掉）
    MarkdownPreview.vue         # 题解预览面板（2026-09-30 加）：渲染状态机（`pending` / `missing` / `downloading` / `failed` / 就绪）、160ms 防抖、缺渲染器时的「下载渲染器」入口、与编辑器的**双向滚动同步**（比例 + 回音吃掉 + 重渲染后按 lastRatio 复位）。只接受 source 字符串、不认识 Monaco
    Sidebar.vue                 # ★ 统一侧边栏外壳：页头（`header.sidebar__head`）+ 用 v-show 切换两个面板（资源管理器 / 评测样例），面板本体由 App.vue 经具名插槽（#explorer / #tests）填入。页头全站只有一份（2026-10-11 上提）：左 SidebarSwitcher、右 `#sidebar-context`（两个面板各自 Teleport 上来的上下文动作：新建文件/文件夹 ↔ verdict + 耗时，见坑 37 的 `defer`）。页签状态（cp.sidebarTab）与持久化留在这里，经 provide 下发给切换器与两个面板。另有三条自适应：ResizeObserver 按侧栏宽 < 360 逻辑 px 切紧凑模式（胶囊收文字标签）；列表滚动后页头下沿浮出 1px 发丝线（`.is-scrolled`，静止在顶时保持 2026-10-04 定稿的透明页头）；**窄屏时把页头左簇整块沉到侧栏底部**（判据是 `shellSettings` 的 `isNarrowLayout()` —— 触摸设备 + **设备**竖屏，或视口宽 < 600px 两条并集，命中给 `<html>` 挂 `is-narrow`；窄屏那几条规则写 `:where(html.is-narrow) …`：把页头 `display: contents` 解散、两个子元素用 `order` 重排成「动作区 / 内容 / 左簇」，动作区改为**内容居中**（宽屏仍是内容宽、右贴）、左簇外面包了一层 `.sidebar__switcher` 壳 —— 见第 3 节与第 5 节坑 45、坑 50）。自己不管宽度与整栏显隐——那是外层 .pane--tests 的事。**收 `panelPosition` 这个 prop**（只为算窄屏底部那颗「收起侧栏」的箭头朝哪边、贴哪一端，`collapseEntry`）并 `emit('collapse')` 把动作交回 App（折叠本体在 App 的 `togglePanel`）；App 里必须写 `@collapse="togglePanel()"` —— 直接写 `togglePanel` 会把事件对象当成 `{ instant }`（truthy）而**不播动画**。另 `defineExpose({ showPanel })` 供父组件从外部切面板（App.vue 跑测试时要把「评测样例」亮出来），状态仍只有这一份
    SidebarSwitcher.vue         # 侧栏页头里的两组入口（2026-09 加）：面板胶囊开关 + 设置。**窄屏（竖屏触摸设备，或视口 < 600px）下整块被搬到侧栏底部那一条**——挪位置的是父组件给的壳 `.sidebar__switcher`，本组件一行没改（见第 5 节坑 45）。渲染在 Sidebar 的共享页头里、**全站单实例**（2026-10-11 上提；此前两个面板各渲染一份、靠 v-show 藏一个，滑动只能靠 keyframes 假装）。段位是「图标 + 短标签」（文件 / 评测，词条 `app.sidebar.explorerShort` / `testsShort`），侧栏不够宽时（Sidebar 下发的 `compact`）收起文字退回纯图标。状态从 Sidebar 的 provide 取（`panels` / `targetPanel` / `togglePanel` / `settings` / `components` / `collapse` / `activeTab` / `compact`），自己不存状态。**末位那颗「收起侧栏」箭头**（2026-10-13 加，`chevron-left` / `chevron-right` 两枚按侧栏停靠侧选一枚）：只在窄屏底部那条上出现 —— 基础 `display: none`，由 Sidebar 的窄屏块带着 `.sidebar__switcher` 祖先打开（父组件抬特异性，见坑 45 第 6 条）；宽屏没有它（那边有分隔条可拖、也有快捷键，入口不重复）。外观整套复用 `__tab`（同一颗 26×26 圆形图标钮），点击派发给 Sidebar、再由 App 的 `togglePanel` 收栏 —— 与拖分隔条到边界是同一条路。位置靠 `order` 贴着箭头那端：停靠在右时排到整条末尾，在左时它本来就在最前面板那枚：`.sidebar-switcher__pill` **本身是一颗 `<button>`**（点任意位置 toggle，高度 26 / 13px 圆角 / 底色 `--bg-control`），里面 `v-for` 出两段 `<span class="sidebar-switcher__seg">` 作纯视觉指示（带标签 72×22、紧凑 30×22，11px 圆角，当前段 `.is-active` 文字换 `--text-on-accent`，并打 `data-panel` 与 `data-current`），蓝色高亮是独立的 `.sidebar-switcher__indicator`（绝对定位，active 变化只改 `transform`、transition 补间 —— 滑动是真的，不再有 data-switched / keyframes 那套）。设置那颗 `gear`（**弹 Quick Settings 下拉菜单** `SettingsMenu.vue`，由菜单里的「打开设置面板…」开编辑区里那个合成页签 `settingsTab`、不落盘）在轨道外，是独立的圆形按钮；「组件」那颗（2026-10-20 由 Codeforces 那颗改名而来，图标换 `grid`（四宫格））排在齿轮左边，**常驻**（不再按 `cf.ready` 显隐 —— 工具类与模块装没装无关），与齿轮同款弹浮层（`ComponentsMenu` 组件菜单，不再直接 toggle 抽题页签）；填亮 = `cfPickerTab.active || cfContestTab.active || countdown.open`
    FileExplorer.vue            # 资源管理器面板（Sidebar 的 #explorer 插槽）：页头动作区是两颗按钮（新建文件 / 新建文件夹；原先还有导入文件 / 导入文件夹，2026-10-12 已删、导入只剩目录右键菜单这一处入口），经 `<Teleport defer>` 投进 Sidebar 共享页头的 `#sidebar-context`（本面板不激活时 disabled 原地渲染；defer 的来历见坑 37）+ FileTreeItem 树 + 右键菜单（`ContextMenu`，经 `provide('openContextMenu')` 下发给树节点）+ 删除确认弹窗（自绘，见第 5 节坑 11）+ 题目信息弹窗（自绘，同款，见第 5 节坑 17）。原 `.explorer__head` 已随页头上提删除（2026-10-11）。新建的**目标目录可以是任意目录**：页头四颗按钮跟随**树里主选中的那一行**（`workspace.selectedId`；选中文件时取其父目录，点树里空白处 = 选中根 → 回落根目录），右键目录则显式指定，**树空白处右键**（2026-10-12 加）与页头同口径、只给这四项（见坑 40）；新建的**状态与提交都收在这里**（`creating` / `createFlights` / `commitCreate`），输入行本体见 InlineCreateRow.vue（见第 5 节坑 12）。**多选**（2026-10-12 加）：高亮集合是 `workspace.selectedIds`、`workspace.selectedId` 是其中的**主选中兼 Shift 锚点**；**区间（Shift 扩选）以「可见行」为准**（DOM 顺序，`visibleRowIds()`），所以 `selectRangeTo`（provide 给树项）收在本组件；而 **⌘/Ctrl+A 是「全选焦点所在父文件夹里的内容」** —— 目录**递归展开**（`folderContentIds()` —— 选中一个目录就等于把它里面的文件一起选中），折叠目录内部也算；焦点在树的空白处时读成「焦点在根上」，于是选的是整棵树（口径 2026-10-12 改过三次：先由「全选可见行」改成「全部节点」，同日收窄成「焦点所在文件夹」，再按用户要求补上「选中目录 = 连里面的文件一起选中」；理由与闸门见第 13.4 节）。⚠️ **这两条口径刻意不同**，别顺手统一：Shift 划段是「手能指到的范围」，⌘A 是「当前这个文件夹」；**删除作用于整个选区**（右键多选项时菜单标签报数「删除 N 项」，`pruneNested()` 转调 `treeOps.pruneNestedNodes()` 把「祖先也在名单里」的后代剔掉 —— `isWithin(dirPath, maybeChild)` 的参数是**目录在前**，别传反；导出那条路共用同一个函数）；确认弹窗标题报数、路径逐条列出（最多 `DELETE_LIST_MAX = 6` 条，多的折成「另有 N 项」）。对外接口：`defineExpose({ startRename, requestDelete, selectAllNodes })`，供全局快捷键 F2 / Delete / ⌘·Ctrl+A 调用（App.vue 过完闸门传 id 进来，**三条都收可空的行 id**：null = 焦点在树的空白处，前两条退到主选中、全选读成「焦点在根上」）—— 与右键菜单那两条**完全同源**，不另写一份。菜单右列的键位走 `shortcutOf()`，读的是快捷键绑定表（设置里改绑这里跟着变），**别写死 'F2' / 'Delete'**。「取消删除」会把焦点交还给主选中那一行（`refocusRow`），否则 Esc 之后紧接着再按 Delete 是没反应的。**导入 / 导出（2026-10-12 加，网页版与桌面端都支持）**：页头**两颗**按钮（新建文件 / 新建文件夹）+ 目录右键菜单里的两项导入（**导入文件** / **导入文件夹**，2026-10-12 由页头搬到菜单、页头不再留入口 —— 一个 `input[multiple]`、一个 `input[webkitdirectory]`，**必须在用户手势的同一调用栈里开**）；**导出只有右键菜单一处**、作用于**整个选区**（多选时标签报数「导出 N 项」），落点按平台分岔 —— **恰好一个文件就直下那个文件**（`<a download>`），其余打成 zip（手写的 `services/zip.js`，零依赖）；**桌面端额外多一条「导出到本机文件夹」**，走 Rust 的 `export_choose` / `export_write` / `export_mkdir` / `export_close`（前端全程拿不到 fs / dialog 权限，导出这条链路的 Rust 侧契约见 14.O）。内容收集（递归读文件、算 zip 内的相对路径）与导入落盘都在 `services/fileTransfer.js`，本组件只负责选落点、报提示、把新导入的文件揭示出来（`revealImported` 等树重建，最多轮询 1s）。导入 / 导出期间 `transferBusy` 压住页头按钮；导出落点是**一张复用 `.confirm` 样式的三按钮卡片**（导出到本机文件夹 / 打包成 zip / 取消），别按 `window.confirm` 去写
    InlineCreateRow.vue         # 内联新建的输入行（2026-09-28 从 FileExplorer 里抽出来）：根目录那份由 FileExplorer 渲染、某个目录里那份由 FileTreeItem 渲染，两处共用。挂载时把 `{ focus }` 注册进 `provide('creatingRow')`，供「程序性失焦后把焦点抢回来」用（见第 5 节坑 12）
    FileTreeItem.vue            # 文件树节点：展开态存在自己身上，靠 Sidebar 的 v-show 保住；右键 `@contextmenu.stop` 把事件交给 FileExplorer（**`.stop` 不能删**，见第 5 节坑 14）；目录展开时还会在 `role="group"` 内、递归 `v-for` 之前渲染一份 InlineCreateRow（见第 5 节坑 12）；行的选中底色读 `workspace.selectedIds`（**多选高亮集合**，2026-10-12 起）—— 2026-10-01 起**文件与目录同一套高亮**；目录的范围线亮起判据也跟着改成「选区里有任一节点的父是它」（`isActiveParent`）。**重命名 / Delete 删除 / ⌘·Ctrl+A 全选 2026-10-10 起已搬出这个文件**（全局动作，见第 13.4 节；其中 ⌘/Ctrl+A 的语义 2026-10-12 先由「全选可见行」改成「全选所有节点」、同日收窄成 **「全选焦点所在父文件夹里的内容（目录递归展开）」**）：行内的 `onKeyDown` 只管方向键（**带 Shift = 扩选**；mac 上 **⌘+↓ = 打开文件 / 切换目录展开**，2026-10-20 加 —— 单按回车在 mac 上让给了重命名，见第 13.4 节）/ Home / End / Enter / **Esc（多选时收成单选）**，**别把全局那三条加回来** —— 全局那条挂在 window 捕获阶段并 `stopPropagation`，加回来永远收不到按键，还会多出一份改绑后不跟着变的真相。重命名结束（回车提交 / Esc 取消）会把焦点交还给这一行（`refocusRow()`），**只有「失焦提交」那条路不还**（那条正是用户点到别处去了）。**点击的三个手势分岔**（`onClick`，2026-10-12 定）：**⌥ / Alt + 单击 = 加选 / 减选**（只改选区，不打开文件、不折叠目录）；**Shift + 单击 = 从锚点整段选中**（同上，区间按可见行算，起点是谁由 FileExplorer 的 `selectRangeTo` 定）；**⌘ / Ctrl + 单击 = 在新标签页打开这一行的题目**（2026-10-11 加，用户点名保留 —— 所以加选让给了 Alt）：判平台主修饰键（macOS 上 Control + 单击是系统右键，所以只看 ⌘），出口 `provide('openProblem')` 与右键菜单那一项**同源**，该行没有题目链接时 `openProblem` 回 false、整条退化成普通单击。**键盘挪焦点必须显式同步选区**（`focusRowAt`：不带 Shift = 单选、带 Shift = 扩选）—— `FileExplorer.onTreeFocus` **只记账 roving tabindex、不写选区**（见第 5 节坑 38）
    ContextMenu.vue             # 通用右键菜单：Teleport 到 body、fixed 定位、挂载后按视口四边收敛、点外部 / Esc / 失焦关闭。目前三处在用：**文件树**（**三份场景**：文件节点给「打开题目（仅当 `meta.url` 是 http(s) 链接）/ 题目信息」+ 分隔线 + 「导出 / 重命名 / 删除」；目录节点给「新建文件 / 新建文件夹 / 导入文件 / 导入文件夹」+ 分隔线 + 同样那三项；**树空白处**（2026-10-12 加）只给前面那四项，目标目录取 `headerCreateTarget()`、跟随主选中那一行，见第 5 节坑 40）与**编辑区**（2026-10-10 加：鼠标右键 / 触屏长按都走它，四项「剪切 / 复制 / 粘贴 / 全选」，无选区时前两项置灰；见 `composables/useEditorMenu.js`）。**视觉**（2026-10-10 改）：整站右键菜单只有这一个实现，样式以用户给的一份 vanilla IDE 右键菜单模板为准 —— 颜色全部走 `base.css` 的 `--menu-*` 令牌（那组是 VS Code **Dark+ / Light+ 的官方配对**，不是随手配的：主文字 = `foreground`、悬停底 = `list.activeSelectionBackground`），形状照模板（6px 圆角 / 220px 最小宽 / 容器上下 6px / 条目 6px 20px / **通栏方形悬停**、条目因此不带圆角 / 分隔线 6px 10px / 0.1s 弹开；**2026-10-11 起这一整组数值统一乘 `--menu-scale`** —— 用户要「整体等比缩小一号」，现取 0.92 ≈ 字体 13px→12px、条目约 26px，模板原值仍留在 `calc()` 里当被乘数，**要再调大小只改 `--menu-scale` 这一个值，别单独动某一项 px**）。**字距也照模板**：字体 13px、条目 6px 20px、右列键位 11px 且与文字至少隔 20px、右缘缩进 20px；**行高刻意不写死**（模板也没写 = `normal`），交给字体的天然行盒 —— 实测英文界面 13px 拉丁天然行盒 16px → 条目 28px（与模板逐像素相同），中文界面 18px → 30px（CJK 天然行盒天生高一档，模板若写中文也是这个数）；天然行盒跟着 `font-size` 自己缩，所以整组缩放不用额外写行高。右列键位现在**两处都有数据**：编辑区那四项走 `useEditorMenu.js` 的 `SHORTCUT`（`formatCombo`，显示的是 Monaco 真正的默认键位 ⌘/Ctrl+X C V A），文件树的「重命名 / 删除」走 `FileExplorer` 的 `shortcutOf()`（读快捷键绑定表，默认 F2 / Delete，**设置里改绑这里跟着变**）；其余项（题目信息 / 新建文件 / 新建文件夹）是真没有键位，**不给右列、也不编假的**；「打开题目」那格是 2026-10-11 加的，填的是 ⌘ / Ctrl + 单击这个**手势**本身（不走 `formatCombo` —— 它是鼠标事件的修饰键，`useShortcutManager` 那套 keydown 管线接不住）。改菜单样子只改这里 + `base.css` 那两组令牌
    SettingsMenu.vue            # 设置下拉菜单（Quick Settings，2026-10-11 加）：侧栏页头那颗齿轮与折叠图标栏那颗齿轮点出来的浮层。一级 10 行（「下载浏览器插件」那颗按 when 出现，机器而异）—— 2 个内联开关（启用模板 / 自动保存）、1 个步进器（字体大小）、3 个二级子菜单（**主题** / 界面缩放 / **侧边栏位置**，选完**菜单不关**。**「界面语言」原本是第 4 个二级，2026-10-14 按用户要求从菜单删掉** —— 菜单只留「当场就想改」的那几项，语言是个改一次基本不再动的选择；唯一入口在设置面板「外观」组，`cp.uiLocale` 的写入方不变，settingsMenu.js 头注记了这段口径，别加回来）、**「同步设置」那一行展开的是个小表单**（见下。这一行 2026-10-11 按用户要求由「云端同步」改名而来，**只改菜单里这一行** —— 设置面板左栏与右侧分组标题仍叫「云端同步」，两处刻意不同名，别顺手统一；同理菜单里那个用户名框的占位文字也单有一份 `settings.menu.cloudHandlePlaceholder`（中「如：he-jie（CFID）」/ 英 "he-jie (CF ID)"），**不复用** `cloud.handlePlaceholder`。⚠️ 这只框的内容宽只有 ~108px：flex-basis 是 0、宽度全靠按钮让出来的剩余，占位文字一长就会被截尾 —— 改这句文案前先量宽度）、「打开设置面板…」（开出编辑区里那个设置页签）与「设置分类」二级（8 个分类，**选完连菜单一起收**，它把人送到设置面板去）。**二值项用开关还是用二级**（2026-10-11 定的判据）：**两档各有名字的走二级**（主题 = 深 / 浅，侧边栏位置 = 左 / 右）—— 开关只能说「开 / 关」、说不出档位叫什么，二级里既看得到当前停在哪一档、也能直接认出另一档叫什么；**本身就是「开或不开」语义的才用开关**（剩下的启用模板 / 自动保存）。主题与侧边栏位置原先都是开关，按这条改成二级；「空格代替 Tab / 自动换行 / 代码缩略图」这三个开关 2026-10-11 **从菜单里去掉了**（面板里照旧）—— 菜单只留「当场就想改」的那几项。**「云端同步」的二级不是档位列表，是一个小表单**（2026-10-11 定），形态跟着「这台设备绑没绑人」走（`cloudBound` = `cp.cloudAccount` 里有没有 handle）：**未绑定** → 用户名框 + 「导入」/「登录」挤在**同一行**；**已绑定** → 最上面先是一行账号名（handle 加粗 + 「已绑定」小标记，与设置面板那一枚同款，2026-10-11 用户反馈补的）、下面一行「上传本机设置 / 下载到本机 / 解绑」（这位自己的事）、一条分隔线、最后一行仍是用户名框 + 「导入」。**用户名框与它的按钮必须同处一行**（2026-10-11 用户反馈定的）：填谁和取谁的是同一件事的两半，拆成两行会被读成两个步骤 —— 框 `flex: 1 1 0 + min-width: 0` 吃掉剩余宽度（`min-width: 0` 不能省，flex 项默认 `min-width: auto` 会撑住不缩、窄屏整行溢出），按钮 `flex: 0 0 auto + white-space: nowrap`。**已绑定时不再显示「登录」** —— 绑着再点一遍就又走一次取码验证（2026-10-11 用户当场反馈：登录之后点它还会再触发一次验证）；导入则两态都留着，它是「取一份配置」，与绑不绑无关，绑着的时候照样能取别人的（所以单独放第二行、不与账号那三颗混在一起）。取到码 → 码相（**登录与上传两套文案都显示**，按 `codeMode` 挑：菜单里点「上传」令牌失效时也要取码，那时遮住不显示就会变成「按钮没反应」）；要覆盖本机或断开绑定 → 确认相（`cloudPendingConfirm.kind` = 'import' / 'unbind'，共用同一句问法；解绑要先问是因为它会把绑定与令牌一起丢掉）。三个相由**云会话状态推出来**，不另存一份状态。**状态与动作全在 `services/cloudSession.js`，与设置面板共用同一份** —— 菜单里不许自己调云端接口、也不许自己 ref 一份账号：一边取了码另一边看不见。表单展开即聚焦用户名框；框空着时把本机认得的那一位填进去（先 `cp.cloudAccount`、再 `cp.cloudActive`）。表单里的输入框要拿回方向键 / Home 等键（`onRootKeydown` 对 `HTMLInputElement` 直接 return），只有 Esc / Tab 仍然收菜单。⚠️ 用户名框的 ref 必须写成**函数 ref**：整个二级都在一级的 `v-for` 里，同名字符串 ref 会被 Vue 收成数组，`.focus()` 报「不是函数」（与下面那条 `.settings-menu__sub` 是同一个坑）**它不用 `ContextMenu.vue`** —— 那份只有扁平 action 列表，撑不起二级 + 内联控件 + 键盘导航；但两件事仍共用：颜色走同一组 `--menu-*` 令牌、尺寸走同一个 `--menu-scale`，定位收敛与关闭逻辑走同一个 `composables/usePopoverLayer.js`。**结构表（每一项读什么、写哪份偏好）在 `services/settingsMenu.js`**，组件只按 `kind` 挑控件，加一项不必改组件。键盘：↑↓ 移动、→ / Enter 进二级或触发、← 收回二级、Esc / Tab 关；roving tabindex 收焦点，打开即钉在第一行。二级的展开：hover 即开（**只算鼠标**，2026-11-01 起，见下面触屏那条）、移出整块给 220ms 宽限再收；展开后还要**自己再收一次位置** —— 右边放不下翻到左侧（`subFlipped`）、下边放不下整块上抬（`subShift`，二级比视口还高时只抬到顶部也留边）。这一层**不能省**：`usePopoverLayer` 的视口收敛只夹一级那一块，管不到 absolute 挂出来的二级，而折叠态那颗齿轮在图标栏**贴底**那一组（一级被夹到 519–892），实测「设置分类」的二级能从 852 伸到 1089、**底部溢出 189px**（1400×900）。取二级元素按 `root.querySelector('.settings-menu__sub')` 而不是 ref：那批 div 都在 v-for / v-if 里，hover 从一行挪到下一行时卸载与挂载的先后不保证，ref 有可能停在上一个元素或 null 上。**触屏上没有 hover**（2026-10-11 修）：手指抬起时那个 pointer 直接不存在了，浏览器照规矩补一发 `pointerleave`（`pointerType === 'touch'`），照鼠标那套排 220ms 定时器，二级会在手指落下之前自己收掉（实测 430×800 下轻点后 160ms 还在、450ms 归零 —— 二级根本点不到）。所以 `onRootPointerLeave` 对非 mouse 的 pointerType 直接 return，二级在触屏上是「轻点展开、常驻」，换二级靠轻点别的行、收起靠点菜单外。鼠标行为不变。**展开那一路同样只认鼠标（2026-11-01 修，用户报「点主题时容易直接点到主题菜单里的深色，当场切了主题」）**：`onRowPointerEnter` 也加了「`pointerType` 非 mouse 就 return」。真因不在「开不开二级」，而在**谁接那一发 click** —— 触屏的 `pointerenter` 是在 touchstart 那一刻到的，二级当场插进 DOM；同一根手指抬起后浏览器补的 `click` 会按**那一刻**的落点**重新做命中测试**，于是它落到刚长出来的二级上。窄屏首当其冲：二级「两侧都塞不下 → 夹回视口」时正压在所属那一行上（390 宽实测二级左缘 108、行右缘 249.7，**压住 141px**），第一格「深色」就在指头下面。改成 click 之后再展开（`trigger` → `openSubmenuAt`）即解：DOM 在那发 click **之后**才变，自己长出来的二级不可能把自己这一下接走。探针 A/B（390×780、`hasTouch`、真实页面）——旧码轻点行右端：`light` 变 `dark`、二级还被连带收起；新码同一击：主题不动、二级展开，而落点底下确实是 `.settings-menu__theme-chip`（午夜蓝，危险区还在，只是不再被自己吃下）。鼠标悬停展开照旧（同一支探针里一并验了）。**二级的位置收敛有三步**（2026-10-11，当晚按用户「修改一下吧」重写）：右边放不下 → 翻到左侧；翻过去左边反而出屏（手机上一级就占掉大半宽度，两侧都塞不下二级，实测 414×896 折叠态不翻右缘 493 > 414、翻了左缘 -184 < 0）→ 翻回来改按实测位置**左右夹**（`--sub-shift-x` 走 transform，翻转时是 `right: 100%` 定位，改 margin-left 挪不动它）；下边放不下 → 整块上抬。宁可压住一级那一行，也别把二级推出屏幕。**三条硬规矩（2026-10-11 深夜定，动这里前先读）**：①收敛量必须**按「没挪过」的位置算绝对值**（量到的 rect 含着已写上的 transform / top，拿它当基准再算 overshoot 等于把上一轮结果当地基，越重跑越出屏 —— 实测右缘 421.9 → 436.7 反向漂）；②视口宽度用 `documentElement.clientWidth`（innerWidth 含滚动条）、高度仍用 `innerHeight`（软键盘缩的是它）；③收敛要**分帧跑到「连续两帧不动」**（最多 12 帧）—— 菜单是 0.95 → 1 弹开动画，打开后头一百来毫秒 `getBoundingClientRect` 量到的都是被缩小的那一份（实测二级宽 227.23 → 239.19），ResizeObserver 对祖先 transform 不响，帮不上这个忙；另外再挂一个 ResizeObserver 盯二级自己的 border-box（换语言 / 切到验证码、确认相 / 账号名变长变短都属这类），尺寸一变重算一次 —— 收敛量走 transform / top 不改布局盒，不会自己触发自己。视口变了（软键盘）也要重跑 —— 一级由 `usePopoverLayer` 重新匣进视口，挂出来的二级得自己跟上。验证判据：各视口下二级四缘都不得越过「视口 − GAP(4)」，且连发两次 resize 后位置漂移 ≤ 1px
    CfCodeforcesPanel.vue       # ★ 合并后的 Codeforces 组件（2026-10-27 加）：抽题、赛程、比赛塞进**同一个合成页签**（视图 id `codeforces`，见 services/editorViews.js），抬头一行品牌 + 圆角分段「抽题 / 赛程 / 比赛」管这一层的切换（2026-10-28 改版：透明底、不画线、13px 标题，与设置页页头同一档；赛程同日从比赛面板的子页签升到这里）。三个子面板仍以 `v-show` 常挂 —— 切走再回来，表单、赛程列表、比赛列表与子页签都还在；`CfPickerPanel` / `CfContestPanel` 的 `.cf-view` 是 `position: absolute; inset: 0`，所以本组件给了一层 `position: relative` 的 stage（同时 `min-height: 0`，内容自己滚），赛程也包在同一套 `.cf-view > .cf-page` 里以便吃到 `cf` 容器查询。赛程点一行走本组件的 `openContest()`：翻到「比赛」再调 `CfContestPanel` 的 `defineExpose({ openContest })`（填链接、切「题目」、取数）。入口只有一处：组件菜单 / 折叠图标栏 / 旧 pin 都指向 `openCodeforcesTab()`，**不再有「打开抽题」「打开比赛」两个视图 id**；旧的 `cp.activityBarPins` 里 `picker` / `contest` 两项在 `activityBarPins.load()` 里迁移成一个 `codeforces`。UI 已于 2026-10-28 改版定稿：子面板自己的抬头撤掉，整页只剩这一行标题；共用版式在 `src/styles/cf-console.css`（本组件也 `<style scoped src>` 挂同一份 —— 页签 / 分段只有一处出处）。**`active` prop（2026-10-27 加）**：本组件同样常挂（`EditorPane` 只 v-show 它），「这一页露没露出来」只能由外面告诉它 —— 没有它，赛程会拿内部 mode 当可见性，整页启动就去取赛程、连带让扩展读报名状态；`EditorPane` 传 `codeforcesTab.active`，本组件分别与 `mode === 'schedule'` / `mode === 'contest'` 相与后交给赛程与 `CfContestPanel`
    CfContestPanel.vue          # ★ 比赛的视图（2026-10-19 晚从 `CfPickerPanel` 拆出单飞；2026-10-27 起挂进合并后的 `CfCodeforcesPanel`，自己不再占视图 id）：2026-10-28 起抬头只有一行子页签（题目 / 排行榜 / 提交），三页共用一条「比赛链接条」（链接输入 + 载入 + 状态 + 去 CF）；题目页的抓样例 / 全部导入在页签行右端，列表抬头只留比赛名与抓取进度。数据全在 `useCfContest`，**只在本组件 setup 调一次**（与 useCfPicker 只归 CfPickerPanel 同一条纪律）；`EditorPane` 用 v-show 常挂，切走再回来那场与列表都还在。版式与抽题面板共用 `src/styles/cf-console.css`（五个 CF 组件都用 `<style scoped src>` 挂同一份 —— 页签 / 输入框 / 状态行 / 列表 / 主操作只有一处出处，改一处五处生效），本文件只放比赛特有的两条规则（页签行、链接条）。**2026-10-28 起「赛程」升到页头成为第三页**，这里只剩三个子页签（默认「题目」）；从赛程点一行不归它管 —— 由 `CfCodeforcesPanel` 翻到「比赛」再调本组件的 `defineExpose({ openContest })`（填链接、切回「题目」、取数）。三个子页面的取数各归自己的组合式（`useCfStandings` / `useCfSubmissions`，赛程归 `CfContestSchedule`），本组件只管 `tab` 是哪一个并用 v-show 常挂 —— 切回来不重取、不丢页码；**三个子页的 `active` 一律是 `props.active && tab === '<该页>'`**（本组件常挂，只判 tab 会把「整页没露出来」当成「那一页开着」）。「提交当前文件」这颗只在**活跃文件确实属于已载入的这一场**时出现（判据与 App 的提交按钮同源：`shouldShowSubmit` + `submitBlockedReason`），置灰原因写在按钮的 title 上；确认与发送仍归 App（`emit('submit-active')` → `requestSubmitConfirmation`）。**2026-10-28：页面还空着的「正在获取…」也不挂在右上角** —— 题目没到手、又没有说明（还没开赛）/ 错误时，那句话落到内容区居中偏上（共享的 `.cf-page--fill` + `.cf-blank`，垂直 38.2%）；此时工具条右端的状态行只在有真数据时出现（倒计时 / 已结束 / 错误），载入按钮也只写「载入」——判据 `blankText` 排除了 `error` / `problems.length` / `problemsNote` 三种「不算空」。**同日：输入框（`.cf-input`，抽题 / 比赛共用）去掉外包的那 1px 细线** —— 静止只有一块 `--bg-input` 的输入面 + 6px 圆角（悬停提亮到 `--bg-control`），获焦时才浮出 1px 主色内描边 + 3px 光晕（`inset 0 0 0 1px var(--focus), 0 0 0 3px var(--focus-ring)`，与 `CountdownCard` 的 `.cd-dms input` 同一套写法）—— 焦点仍看得见，静止不画线
    CfContestSchedule.vue       # 「赛程」页（2026-10-27 加；2026-10-28 升为合成页签抬头上的三个模式之一，`active` 由 `CfCodeforcesPanel` 给）：三组（正在进行 / 即将开始 / 最近结束）+ 每行一枚每秒走字的倒计时 + 开赛时刻 + 比赛类型。**行内顺序（2026-10-28 改）**：比赛名在最左，类型紧跟其后，开赛时刻与倒计时整块靠右端；倒计时不再写 `HH:MM:SS`，改成「3 周 6 天 21 小时」这种单位串（`durationParts` 拆档 + `cf.contest.schedule.units.*` 拼文案，最多取最大的三档 —— 一天以内才带秒）；比赛名本身就是去 CF 的链接（点名字开新页、不触发载入），点行内其余位置 → `select` 交给 `CfCodeforcesPanel.openContest`（翻到「比赛」并让比赛面板载入这一场）。取数与阶段判断全在 `useCfSchedule`。抬头只剩右侧「更新于 / 刷新」（赛程已是页头模式，不再重复写标题）。**2026-10-27 起每行末尾多一列「报名状态」**（仅当扩展有 `contest-schedule` / `contest-register` / `contest-virtual` 之一时才出现，网格多一列）：即将开始且 `open` 给「报名」钮、已结束给「VP」钮、其余写「已报名 / 未开放 / 已截止」，读不到就写「—」。报名 / VP 都是不可逆动作 —— **先弹一张确认卡片**（`role="alertdialog"`，Esc / 点背景关，默认焦点在「确认」），确认后才交给 `useCfSchedule.submitEntry`，失败按 `reason` 折成一句通知，绝不自动重放。**2026-10-28：列表还空着、第一份数据还在路上时，「获取中…」不再挂在右上角的按钮里，而是落到内容区居中偏上（黄金分割点 38.2%，共享的 `.cf-page--fill` + `.cf-blank`，见 `cf-console.css`），抬头那颗按钮只留一句灰着的「刷新」；已经有一份列表时（手动刷新）进度仍留在按钮里，列表照常显示**
    CfStandingsTable.vue        # 「排行榜」页（2026-10-27 加）：官方榜（抬头明说「API 只有正式参赛者」）、名次 / 选手 / 过题或得分 / 奖牌 / rating / 每道题的格子，每页 100 行 + 翻页 + 「跳到我」。题格与计分的口径全在 `cf/standings.js`，本文件不重算分数。**2026-10-27 起抬头多一颗「非正式名次」**（需 `contest-unofficial`）：点了才问扩展，结果写成一行「含非正式：第 N 名」（多个 handle 取最好的一行），换一场就清掉；官方榜本身仍只画 API 给的那份。**同日晚补三样**：题格副行改为通过时刻、通过的格子 `is-ok` 绿色；表底一行**粘性表尾**（每题「通过 / 尝试」两行数字，整场口径，翻页不消失、`title` 里写全句）；非正式参赛的名字前一枚 `*`（`--warn` 色）—— 星号只在 `row.unofficial` 为真时出现，**真实 API 数据里恒为 0 枚**（原因见第 7 节），它是给「将来能拿到非正式行」预留的，别拿它当「榜单已含 VP」的证据。**同日深夜再补两样**：① 没通过的题格主行红字 `-N`（见 `cf/standings.js` 的题格口径）；② **「我在榜单里的位置」置顶条** —— `myRow` 存在时表上方粘一条（`position: sticky; top: 0`，在 `.cf-view` 的滚动容器里生效）`我：第 N 名 · 选手 · 计分摘要（ICPC「过 N 题 · 罚时 P」/ CF「N 分 ±hack」）· 跳到我`，往下滚或翻到任意页都看得见；条尾那颗「跳到我」就是原来的翻页动作。抬头那颗重复的「跳到我」与口径行里的「我：第 N 名」都已删掉（避免三处同名次）；置顶条里的名次是**官方榜**名次，含非正式的总名次仍只由抬头「非正式名次」那颗按钮单独查
    CfSubmissionList.vue        # 「提交」页（2026-10-27 加）：最新提交流（时间 / 选手 / 题目 / 判定 / 耗时 / 内存 / 语言）+ 判定配色 + CF 外链 +「只看我」开关与「过 N 题 · AC n · 未过 m」小结 + 比赛中的自动刷新。时间列取 `relativeTime`（比赛内时刻），哨兵值归一成 null 后退回本地时刻 —— 两者都带完整本地时间进 `title`
    ComponentsMenu.vue          # 组件菜单（2026-10-19 加为 `CfMenu`，2026-10-20 改名并按类分组）：侧栏那颗「组件」按钮点出来的**应用抽屉**浮层 —— 深色圆角面板 + 按类分节的网格（2026-10-20 去掉抬头「组件」：按钮的 title / aria-label 已经说明是哪个菜单，直接进分组）。两类：**Codeforces**（`components.menu.codeforces`，组内「随机抽题 / 比赛」两项，分别 `openCfPickerTab()` / `openCfContestTab()`；**整组只在 `cfReady` 为真时出现** —— 模块没下载不该留两颗点了没反应的格子）与**工具**（`components.menu.tools`，常驻，组内「倒计时」一项 → `openCountdown()`）。点哪项就把那个界面亮出来、再收菜单。与 SettingsMenu / ContextMenu 共用三样：`--menu-*` 令牌、`--menu-scale` 缩放系数（坑 33）、`usePopoverLayer` 的定位与关闭；两个宿主是 SidebarSwitcher（`placement="below-end"`）与 ActivityBar（`placement="beside"`）。键盘只做 Esc 关 + 打开即聚焦第一项，Tab 自然走 —— 一屏最多三项，方向键漫游不做了。抬头与类名走 `src/i18n/messages/components.js`（不能挂在可卸载的 cf 域里），条目名仍在各自域（`cf.menu.*` / `countdown.title`）
    TestPanel.vue               # 评测样例面板（Sidebar 的 #tests 插槽）：页头动作区只剩 verdict（「全部 AC / n/m AC」）与耗时，经 `<Teleport defer>` 投进 Sidebar 共享页头的 `#sidebar-context`（同 FileExplorer 那颗，见坑 37）+ 用例列表 + 页脚运行按钮。原 `.panel__head` 已随页头上提删除（2026-10-11）。**一键提交那颗按钮 2026-10-23 加**：页脚与 ▶ 同一行、同高（实测 `uiScale = 1` 下两颗都是 41×32）的纯图标钮（`arrow-up`，`--accent` 底），只在活跃文件带题目链接时出现（`showSubmit`，判据在 App）；置灰原因写成页脚那行 `.run-blocked`（与「不能运行」共用一行，运行那条优先）**不能只塞 title** —— 置灰的按钮在浏览器里收不到鼠标事件。提交中挂 `.is-submitting`（脉冲），期间自己与 ▶ 一起禁用；动作全在 App 的 `submitActiveFile`，本文件只 emit。**不可运行态**（`runBlocked` 非空，由 App 的 `runBlockedReason` 算好传进来：题解这类非代码文件的 `activeLanguage` 是 null，以及「一个文件都没打开」）由同一份文案解释：页脚那行 `.run-blocked`（常驻，`v-if="runBlocked || submitBlocked"`）与两个 ▶ 的 title。**空态里不放这行** —— 「No test cases yet.」一行就是空态的全部（2026-10-06 定，别再加回去；空态里的 `notice` 是抓样那三条提示，说的是「样例为什么还没到手」，与能不能运行无关）。**「添加测试样例」也要跟着灰**（2026-10-06）：用例是写进活跃文件的 `config.tests` 的，跑不了的文件根本加不出用例，`App.addCase()` 里还有一道兜底挡住 `new-case` 快捷键。页脚两颗按钮的禁用态是同一档 opacity 0.45。**窄屏（两条并集那条判据）下「添加测试样例」四个字隐藏、只留那个加号**（2026-10-13 加，见第 5 节坑 51）：规则写在 `Sidebar.vue` 的窄屏块里（借那条现成的断点，不给 TestPanel 再造第四份副本），本文件只给那个 `span` 挂了 `add__label` 这个钩子类并补了 `:title`（AppIcon 是 aria-hidden，文字藏了之后可访问名只剩它）。**面板末尾还挂着一块纸屑 canvas**（`.panel__confetti`，2026-10-23 加）：`position: absolute` 铺满整块面板、`pointer-events: none`、`aria-hidden`，实现与触发点都不在本文件（见 `services/confetti.js` 与第 17 节），这里只管「挂上 / 摘掉」这一对，`.panel` 也只为它补了 `position: relative`
    TestCaseCard.vue            # 单个用例卡片：徽标（AC/WA/CE/TLE/RE/ERR 判定码）/ 耗时 / 输入框 / 输出块。输入与期望输出**超过 6000 字符时显示切成「开头一段 + 省略行」**（框仍可编辑，但只能改省略行之前那段；全选复制与运行走的都是完整内容）；**没到 6000 但已超出框高（约 15 行）时没有任何标记**（字符一个没少、拖滚动条就能看全，底边仍是实线、框下也没有小字）；底边虚线与小字**只给真被截断的那种**；**框内那行标记就是一个光秃秃的 `……`，省略了多少一律由框下面那行「还有 N 个字符未显示 + 复制全部」说明**（那行只在真截断时出现；这个 `……` 时有时无的两条原因见第 5 节坑 26）
    AppIcon.vue                 # 内联 SVG 图标集（name 取图标名）。三张表：PATHS（24×24 描边线性图标，主力）/ SOLID_PATHS（整块实心品牌标，`fill: currentColor`）/ VIEWBOX（不在 24 网格上的图标的专用方框）。语言图标的两个坑见第 5 节坑 16（`.md` / `.markdown` → `markdown`，2026-09-30 加，配色 `--icon-markdown`）；设置目录用的 `keyboard`（快捷键）与 `plugin`（浏览器插件，拼图形状，刻意区别于「应用」组的 `install` 图标）也在 PATHS 里；新建按钮专用的 `file-plus` / `folder-plus`（2026-09-28 加）同表；**导入那两颗用的是 `file-down` / `folder-down`**（2026-10-12 加：同一份文件 / 文件夹轮廓 + **轮廓内部居中**的一枚向下箭头；⚠️ 第一版把箭头放在**右下角**、与 `file-plus` 的加号同处一角，14px 页头下两者只差角上那一撇，「新建」和「导入」根本分不出，当天即改 —— **这一排的判据是「轮廓保持一致、符号位置与形状错开」**）；**题解工具栏那 13 个线性图标与全屏用的 `expand` / `collapse`（2026-09-30 加）** 同样在 PATHS 里，键名与 `services/mdFormat.js` 的 `MD_TOOL_GROUPS` 一一对应。**`chevron-left`（2026-10-13 加）与既有的 `chevron-right` 是同一字形的镜像**，成对用在窄屏侧栏底部那颗「收起侧栏」上 —— 按侧栏停靠侧选一枚，横向箭头只有这两枚，别拿竖着的 `chevron`（那是下拉用的）凑。**⚠️ `:size` 必须是 viewBox 网格（24）的整数倍，否则边缘锯齿**（2026-11-01 实测）：渲染尺寸 ÷ 24 再乘 dpr 必须是整数，路径坐标才落在物理像素的整数位置上；只要不是，圆弧的抗锯齿就被量化成台阶。dpr 2 / 3 的边缘硬边占比（同一条测量口径）：`size 22` 28% / 18% → `size 24` **15% / 9%**，肉眼可见地干净（`ComponentsMenu` 那两枚 2026-11-01 由 22 改 24，是全站目前唯一的 24）。**只有 12 与 24 两个尺寸在 Retina 上锐**（12 的 dpr 2 倍数是 1.0）；站内其余 77 处（13×33 / 15×12 / 14×9 / 17×4 / 26×3 / 11×3 / 16×3 / 18×2）都是锯的，小图标不显眼、17 与 26 那几处最扎眼 —— 要改就往 24 靠，别往 22 / 26 这种「接近但不整」的数上走。非整数 dpr（系统缩放 125% / 150%）下任何尺寸都一样糊，那是浏览器光栅化的固有限制，改代码救不了。
    CountdownCard.vue           # 悬浮倒计时卡（2026-10-20 从 `WorkBuddy/…/ellipse-demo` 的 `FloatingCountdownCard.vue` 移植）：`Teleport` 到 body、fixed 定位、显隐只看 `services/countdown.js` 的 `countdown.open`；头部（状态点 / 关闭 / 暂停 / 中止 / 锁定）+ 设置区（时:分:秒 + 4 个预设 + 开始）+ 环形读数区 + 右下角缩放手柄。入口：齿轮菜单的「倒计时」那一行（`settingsMenu.js`）与组件菜单 › 工具 › 倒计时（`ComponentsMenu.vue`），关闭后不留角标。**圆环改纯 SVG 自绘**（`stroke-dasharray` / `dashoffset`，`viewBox` 100×100），不再引 `vue-ellipse-progress`；环径由 `ResizeObserver` 量 `.cd-body` 的短边、数字用绝对定位的 DOM 盖在环心（SVG 文本不吃 rem 与字体回退链）。颜色全走 `base.css` 变量；几何即设计 px，见第 16 节
  services/                     # 判题逻辑，改样式基本不碰
    runner.js                   # 逐用例调度（并发 2）+ 进度回调；引擎 outcome 翻译成卡片 verdict（AC/WA/CE/TLE/RE/ERR）
    compare.js                  # 实际输出与期望输出比对，只返回布尔（不再产出「输出多 N 行」之类 hint）
    templates.js                # 各语言默认模板；`LANGUAGES` 里 **markdown 是「非判题语言」**（只有展示标签与默认扩展名，没有 piston 字段，引擎不认它），`MARKDOWN_TEMPLATE` 是新建 .md 的题解骨架
    monaco/language.js          # 文件路径 → Monaco languageId（`.md` / `.markdown` → 内置 markdown 分词器；头文件统一按 cpp 高亮）；语言路由只在扩展名这一处
    mdView.js                   # ★ 题解视图状态的唯一权威：视图模式 / 全屏 / 滚动同步的前提判断
    mdFormat.js                 # 题解工具栏的纯变换层：MD_TOOL_GROUPS / MD_SHORTCUTS / formatMarkdown / markdownStats
    mdRenderer.js               # 题解渲染管线：marked（含 $…$ / $$…$$ 扩展）→ DOMPurify → KaTeX 填公式
    mdRuntime.js                # 题解渲染运行时的本地侧：/md/assets.json 清单 + cp-md-runtime 缓存桶 + 探针 / 下载 / 卸载 / 注入
    mdImage.js                  # .md 选区（或整篇）「生成图片」的渲染导出（2026-10-21 加）：走题解预览的同一套排版（复读 `.md-preview__body` 的 `data-v-*` scoped 属性 + 挂同名类，不维护第二份排版表）→ 内联计算样式（STYLE_PROPERTIES 白名单）→ `<svg><foreignObject>` + 字体 / 图片转 data URL → canvas。版心固定 720 + 四周 32 留白，纯净文档（无卡片 / 圆点 / 行号），配色跟当前主题（底取 `--bg-editor-pane`），倍率复用 `codeImageQuality`（经 codeImage.js 新导出的 `imageQualityScale()`）。**Chrome 与 macOS Safari 27（WKWebView）实测均正确；Safari 侧另有六道防线，详见第 7 节条目**
    editorOptions.js            # 编辑器偏好的单一出处：默认值 33 项 + 可选项表 + 逐键校验 + 偏好 → Monaco 选项（编辑器级 editorOptions(settings, scale) / model 级 editorModelOptions()）。**`scale` 是全局缩放的补偿点**：Monaco 不吃 rem，fontSize / lineHeight / padding / scrollbarSize 都在这里乘 scale；tabSize 不乘（列数不是像素），见第 5 节坑 24。最后一项 `statusBar`（默认开，2026-09-30 加）**不是 Monaco 选项**、不进 `editorOptions()`，它只管编辑区底部那条状态栏的显隐
    settingsMenu.js             # 设置下拉菜单的**结构表 + 每一项写哪份偏好**（2026-10-11 加）：一级 11 行（2026-10-20 加「倒计时」那行动作后由 10 变 11），按 `kind` 分 `switch` / `radio`（二级）/ `stepper` / `cloud`（二级是个表单，只有菜单里「同步设置」这一行用，标签走 `settings.menu.cloudSync` 而非 `settings.section.cloud`）/ `action` / `divider`；读值一律是函数（要读「此刻」的值），标签一律存 i18n key。写只走原有单一出口：`editorSettings.js` / `shellSettings.js` / `fileTemplates.js` / `i18n/index.js`，所以菜单改完设置面板立刻跟着变。标了 `closes: true` 的行（「设置分类」）选完连菜单一起收，其余多档项选完留在原地好连着试。**两档也照样用 radio**（主题、侧边栏位置）：判据见 `SettingsMenu.vue` 那条（两档各有名字的走二级，开 / 关语义的才用开关）。行级的 `when` 以前只挂在下面那几颗「一次性安装动作」上（能装、且还没装），2026-10-13 起**也用来藏偏好行**：「窄屏折叠方向」只在窄屏出现（宽屏上它是空转的），见第 5 节坑 49。
    countdown.js                # 悬浮倒计时的**状态与计时单例**（2026-10-20 加）：`cp.countdown`（键名在 storageNames.js）自己读写 localStorage，卡片关掉 / 刷新后接着走；存「结束时间戳 + 暂停剩余量」而不累加 tick（后台被降频也不走慢）；ticker 只在 `running` 时开；`now` 是独立的 ref（与状态分开，免得每 200ms 落一次盘）；退出时只 flush **还压着的那一次**写入。导出的动作：`openCountdown` / `closeCountdown` / `startCountdown` / `cancelCountdown` / `toggleCountdownPause` / `toggleCountdownLock` / `clampCountdownBox` / `clampCountdownForm`。几何口径见第 16 节。**刻意不进云同步白名单** —— 窗口摆哪、屏幕多大是这台设备的事实
    confetti.js                 # 「全部样例通过」的庆祝纸屑（2026-10-23 加）：`canvas-confetti` 唯一消费者，`mountConfetti(canvas)` / `unmountConfetti()` / `celebrateAllPassed()` 三个出口，canvas 由 `TestPanel.vue` 摆在样例面板里、盖满整块面板。**只认「全过」**（整轮 ▶ 的判据在 App.vue 的 `celebrateIfAllPassed`；逐张 ▶ 只在「这一跑刚好凑齐全过」时放、单样例每次 AC 都放，见 `runOne`），任一失败不放；可在 设置 › 评测 关掉；**刻意不给 `useWorker`**（控制权会被交给 OffscreenCanvas、尺寸只跟 window resize 走）；尺寸每次自己量、`1 CSS px = 1 位图 px`；颜色现读 `--confetti-1..4`。为什么挂在这些点上，见第 17 节
    shellSettings.js            # 「外壳」偏好的模块级单例（2026-10-11 从 App.vue 下沉）：侧边栏位置 `cp.panelPosition`（含 `flipPanelPosition()` / `setPanelPosition()` 那套 View Transitions 换边 —— flip 只是「另一边」的简写；档位表 `PANEL_POSITIONS` 也在这里，设置面板与菜单共用）、窄屏折叠方向 `cp.narrowCollapseSide`（2026-10-13 加：**窄屏**折叠后图标栏贴上边还是下边，`top` / `bottom`，默认 `bottom`；档位表 `NARROW_COLLAPSE_SIDES` 与写入入口 `setNarrowCollapseSide()` 也在这里，设置面板与菜单共用。它**不走 View Transitions** —— 只在窄屏生效、只是把主轴换头换尾，没有「两栏互换」那种重排）与全局缩放 `cp.uiScale`（含 `applyUiScale` 落地根字号）。另导出**窄屏判据 `isNarrowLayout()`**（2026-10-13 加，同日晚从 CSS 那三处 `@media` 挪进本文件 —— **判据的唯一副本**：触摸设备 + **设备**竖屏（读 `screen` 的朝向，键盘改不动它），或视口宽 ≤ 600px；命中时给 `<html>` 挂 `is-narrow`，三处样式的规则写 `:where(html.is-narrow) …`（`:where()` 不贡献特异性，各块的 (0,x,0) 算式照旧）。为什么不在 CSS 里：键盘会把布局视口削矮、`(orientation: portrait)` 随之翻面，见第 5 节坑 53。三个消费方：`App.vue` 的 `measureLimits`（窄屏折点改用固定的指针容差 `NARROW_HINGE_PX = 30`：离边缘 30px 内就折叠，见第 5 节坑 48）、设置菜单与设置面板外观栏里「窄屏折叠方向」那一行的 `when`（只在窄屏出现，见坑 49）。底层是一个 ref，由 `matchMedia` 的 `change` 写回来 —— 那两处设置入口按响应式依赖缓存，现查 `matches` 会把首帧答案缓存住）。**这几个键自己读写 localStorage，刻意不用 `usePersistentRef`** —— 那份 composable 的「首次访问也落盘」靠 `onMounted`，而服务层模块没有组件实例，那条钩子根本不执行（首次打开站点会不留下存档，回归脚本读 `cp.panelPosition` 得 null，见第 5 节坑 36）。体例同 `editorSettings.js` / `i18n/index.js`：模块自己读盘 + `immediate` 的 watch 写回
    ojSubmit.js                 # ★ 「一键提交到 Codeforces」的唯一前端边界（2026-10-23 加）：`parseCodeforcesProblem(url)`（认 contest / problemset / gym / group 四种地址 → 提交页 + `/my` 页，**与扩展 background 的解析一一对应**，改一处就得改另一处）、`shouldShowSubmit(node)`（有 `meta.url` 就显示按钮 —— 不支持的 OJ 也显示，置灰比凭空消失好懂）、`submitBlockedReason({ node, language, capability, checking })`（空串 = 可提交；顺序 = 桌面端 → 没文件 → 没题目 → 不认识的 OJ → 没语言 → 握手未定 → 扩展没这条能力）、`submitActiveSolution`（取 `peekActiveContent()` 的**未保存正文**，不要求先存盘）、失败原因 / 判定码 → 人话两张表（`submitReasonText` / `submitVerdictText` / `submitVerdictType`）。动作编排与通知在 `App.vue` 的 `submitActiveFile`
    problemMeta.js              # 题目元数据的单一出处：OJ 表（洛谷/Codeforces/AtCoder/牛客/LeetCode/其它）+ 难度口径（CF·AtCoder 分数段 800…3500 / 洛谷八级 / 其余自由文本）+ 逐键校验 normalizeMeta() + 悬停文案 formatMetaTooltip()。meta **五项**：url / oj / difficulty / date / **timeLimit**（毫秒，100–60000，0 = 未设置；判题时优先于全局档位，见第 5 节坑 17）
    engines/                    # 引擎注册表：wasm（网页默认）/ native（桌面默认）/ piston / judge0 / echo。平台专属引擎在对象上写 `platforms: ['web'|'desktop']` 限定，注册表的 engineChoices / defaultBases / getEngine / DEFAULT_ENGINE_ID 都按它过滤（见第 14 节）
    wasmRuntime.js              # 本地沙箱的唯一入口：语言路由 + 阶段播报 + 看门狗 + 串行队列 + PCH 后台预热。**另外它还兼着「运行时」这个概念的三个出口**（probeRuntime / preload / uninstallRuntime），`language === 'markdown'` 时转给 mdRuntime —— 设置视图「应用 › 本地运行环境」才能用同一套代码渲染三行
    runnoSandbox.js             # runno 双管线：C++ 编译（工具链地址、编译产物缓存、PCH 生成）+ Python 解释运行
    vfs/runnoFs.js              # VFS → runno fs 的转换层（fsEntry 记录形状的唯一出处，两个管线共用）
    pchStore.js                 # PCH 的 IndexedDB 存档（原生 API，任何失败都按「没有存档」处理）
    editorViews.js              # ★ 编辑区「合成视图」页签（设置 / Codeforces）的 UI 状态（2026-10-11 起由已删的 settingsTab.js 扩成一张表，删除见提交 21aa244；2026-10-27 抽题与比赛合并成一个 `codeforces` 视图 id，`EDITOR_VIEW_IDS` 只剩两项）：`EDITOR_VIEW_IDS` 收口两视图的互斥共层、`viewOrder` 只记视图**彼此之间**的相对次序（条带上的绝对位置归 tabStrip）、`show()/close()` 开关页签、`openSettingsTab(sectionId)` 让侧栏菜单定位到某分类（`settingsSectionEntry` 消费完复位）。刻意不进 workspaceStore/openTabIds、不建 model、不落 localStorage，见第 5 节坑 7；`viewActive`（stage 让位）与 `anyViewOpen`（页签栏去留）两个 computed 从这里出。本模块还负责把 `deactivateViews` 注册进 `workspaceStore.codeViewIntent`（「打开文件 = 要看代码」，见坑 7）
    tabStrip.js                 # ★ **页签栏顺序的唯一权威**（2026-10-11 加）：`stripOrder` 是一条**混排**序列，文件页签 id 与合成视图 id（`settings` / `codeforces`）穿插排列，所以页签拖动**可以跨类换位**（文件插到设置左边、Codeforces 排到某个 .cpp 前面都成立）。为什么必须单独一份：顺序要跨两类，而 `workspace.openTabIds` 装不了合成视图（装了会被 rebuildTree 当「文件已删除」清掉，纪律见第 5 节坑 7），`editorViews.viewOrder` 也只记视图。**规则是单向的** —— 顺序只由这里改（拖动 → `moveStripItem()` → 分部写回 openTabIds（走 store 的 `moveTab`，含持久化）与 viewOrder（走 `setViewOrder()`））；成员反过来由两头同步进来（文件看 openTabIds、视图看 viewOrder，两个 watch **只同步增减、不同步顺序**，否则两边互相纠会来回抖）。导出 `isViewId()` 判类别；id 空间天然不冲突（VFS 节点 id 是 UUID / `f_*`）。**这份顺序自己不落盘**：文件部分的相对次序由 openTabIds 顺带持久化，合成视图本来就不跨会话恢复（刷新后回到代码文件是预期行为）
    cloudSession.js             # 云同步的**会话状态与动作**（2026-10-11 从 EditorSettingsPanel.vue 下沉）：账号 `cp.cloudAccount` / 令牌 `cp.cloudToken`（键名常量在 storageNames.js，按坑 36 的规矩自己读写 localStorage）+ 一次会话里的用户名框 / 验证码 / busy / 报错 / 提示，以及取码（`requestCloudCode`）、登录（`loginCloud`）、验证（`confirmCloudCode` → 登录 / 上传两条路）、带令牌上传（`uploadWithToken`）、**已绑定态那三颗按钮的动作**（`uploadCloud` 有令牌直接写、没令牌退回取码；`downloadCloud` 拉云端并落本机；`unbindCloud` 只清本机存档、不发请求）、拉取并落本机（`probeCloud` + `adoptCloud`）与「整句里嵌一个链接」的劈法（`splitLinkText`）。**面板与齿轮菜单共用这一份**（2026-10-11 菜单的二级里也要填用户名、取码、验证），所以在面板里**不许再自己 `usePersistentRef` 一份云状态**、也不许重写这些动作 —— 两边各一份必然走偏（一边取了码另一边看不见）。2026-10-11 又加了取码那一步的两处便利，同样放这里共用：`codeCopied` / `copyCloudCode`（复制验证码，2s 复位）、`filling` / `fillCloudCode`（请扩展代填，失败原因枚举 → 中文案），并把 `canFillCode` 从 `useCompanionBridge.js` 转出来，好让面板与菜单**只认这一个入口**就读全这块 UI 的状态。**2026-10-20 把代填串成一条链路**：`fillCloudCode` 在 `fill-saved` 能力下会等扩展报「保存完了」（那一刻它已关掉那个 Codeforces 标签页），然后直接 `verifyAndLogin()` —— 填 / 保存 / 关页 / 验证 / 登录一次点完；`fillCodeChained`（= `canFillSaved && codeMode === 'login'`）是**唯一判据**，面板、菜单、通知三处按钮文案都读它，**上传那条路刻意不串**（覆盖云端，最后一下该由用户按）
    cloudProfile.js             # ★ 云同步的前端唯一边界：`SYNC_KEYS` 白名单（16 个键）+ `collectProfile` / `applyProfile` + 四个接口封装（`requestCode` / `verifyAndSave` / `saveWithToken` / `fetchCloudProfile`）+ `postJson`（网络失败折成 `{success:false}`、失败带 `status` 以区分 401 与 400）。接口地址按平台分岔：网页版走同源相对路径 `/api/*`，Tauri 壳走 `https://www.998244353.best/api/*`（壳的资源协议不认 `/api`，理由与坑见 `docs/云端同步服务.md` 第 1 节，落地记录见 14.K）
    cloudEntry.js               # 云配置的**两条**入口：地址栏的 `/<handle>`，以及本机自己记住的那一位（2026-10-10 加）。`captureCloudHandleFromPath()`（启动时读 `location.pathname` 的 `/<handle>`）+ `confirmCloudEntry()`（启动那一次的总入口：地址里有 handle 就探一次云端到底有没有这份配置，据此决定要不要开设置页；**地址里没有就用存档里那位静默对齐**，见下面三条边界）+ `markCloudEntryHandled()` / `clearPendingCloudHandle()` + `writeCloudEntryPath(handle)`（2026-10-06 加，反方向）+ `readActiveProfile()` / `writeActiveProfile()` / `forgetActiveProfile()`（2026-10-10 加，`cp.cloudActive` 的读写）。三条边界：①地址里是**别人**（不是本机在跟的那位）时行为不变 —— 只登记、不自动套用、不自动登录、不写 `cp.cloudAccount` / `cp.cloudToken`；②存档那条路**只认「云端版本变过」**（`updatedAt` 与本机记着的一致就一个字节都不写；拆掉这道闸门会「套用 → 刷新 → 又套用」转不出去 —— 那次 reload 是无条件的，读 `applyCloudProfile` 的注释）；③对齐时地址栏**跟着走到 `/<handle>`（2026-10-10 加，与四条入口共用「地址 = 这套配置」这个语义）**，但只在**网页版的站点根路径**且**云端确实有这份配置**时才写：壳端的页面来自 `tauri://localhost` / `http://tauri.localhost`，改成 `/<handle>` 等于让壳的资源协议去找一个不存在的文件（一刷新就白屏），而壳里本来没有地址栏；`guide.html` / `privacy.html` 那类静态页同理（见 `isSiteRoot`）。这一行还必须排在 `applyCloudProfile` 之前 —— 那一步会 reload。「已答过」的记号写在 `history.state`（键 `cpCloudEntry`）、地址**保持原样不抹回根路径** —— 唯一例外是云端没有这份配置时（不打开设置页，地址 replaceState 回根路径 + `cloudEntryMissingHandle` 弹一句提示）。`writeCloudEntryPath` 是另一头：本机自己认下某个 handle（导入 / 上传 / 登录 / 下载到本机）之后把 `/<handle>` 写进地址栏并顺手打上同一个记号（读那两条注释：**一个只管自己写、一个只管不抹**，别把它们合成一条规则）。用 replaceState 不用 pushState；带点号的 handle 直接放弃（会和静态资源撞车）
    vfs/problemImport.js        # 扩展题目 → VFS 落盘（`/<年月>/<OJ 标签>/<难度>/<题名>.cpp`，无外层 wrapper；比赛导入给 `options.contestName` 时第三层换成比赛名；题目信息与样例挂在**该文件节点**的 `meta` / `config` 上）：OJ 辨认、题名清洗、按 url 全库认题、名字去重、batch 落库、打开文件。改这里等于动用户数据，见第 13 节
    fileTransfer.js             # ★ 文件「导入 / 导出」的服务层（2026-10-12 加），**两端共用**，组件只消费。四块：① **下载** `downloadBlob`（`<a download>` + `URL.createObjectURL`，插进 DOM 点一下再撤，30s 后 revoke）；② **导出** `collectExport(nodes)` —— 递归读内容、算出每个条目在 zip 里的相对路径（以选区**公共父目录**为根，`commonParent()`；选中一个目录时保留它自己那一层），落点入口是 `exportAsZip` / `exportSingleFile`；③ **导入** `planImport(files)` 把 `File[]` 拍成 `{ rel, file }[]`（**保住 `webkitRelativePath`**，所以「选一个文件夹」进来时顶层文件夹名与子目录层级都在；没有这个属性就退化成单级文件名），`importInto(dir, items)` 落盘并回 `{ imported, skipped, failed, firstId }`；④ **平台能力** `CAN_EXPORT_TO_DISK = IS_DESKTOP`（**只有桌面端能写本机目录**）/ `canPickFolder()`（**只有桌面浏览器能整目录导入**，安卓与 iOS 的 `webkitdirectory` 认不出来）。两条纪律：**用户文件绝不覆盖**，重名一律走 `treeOps.uniqueNameIn` 排号（`a.cpp` → `a-2.cpp`，与 problemImport 同口径）；**整批落盘包在一个 `vfs.batch()` 里**，否则几百个文件就是几百次树重建。上限 `MAX_IMPORT_BYTES = 5MB`（与 Rust 侧 `MAX_TEXT_BYTES` 同号）、目录深度 `MAX_DEPTH = 32`；二进制与超大文件都只计入 `skipped`、**不报错**，提示里报个数就行。⑤ **拖入** `readDroppedItems(dataTransfer)`（2026-10-12 加）：把系统拖放里带的东西读成同一形状的 `{ rel, file }[]` —— 目录结构只能靠 `webkitGetAsEntry()` 递归（`dataTransfer.files` 是**平的**，文件夹进去只有一个伪 File）；**同步段不能挪**（`DataTransfer` 只在事件派发期间有效，entry 引用要在事件里抓到手，之后才能慢慢递归，见第 5 节坑 42）；`readEntries()` 一次只回一批（Chrome 上限 100 条），必须读到空为止；浏览器不给 entry 时退回 `files`（至少把顶层文件导进来）。顶层名字保留（拖 `chapter1/` 就建 `chapter1/`），与 ③ 同一口径
    zip.js                      # 极简 zip 打包（2026-10-12 加）。**刻意不引依赖**（第 0 节：加依赖先讨论），压缩走原生 `CompressionStream('deflate-raw')`（Chromium 103+ / Safari 16.4+ / Firefox 113+），拿不到就退回 store（method 0、不压缩）—— **「能解开」比「压得小」重要**。结构是本地文件头 + 中央目录 + EOCD，EFS 标志位 `0x0800` 声明文件名是 UTF-8（中文目录名全靠它），不写 data descriptor。上限照 zip 格式本身（`MAX_ENTRIES = 0xffff` / `MAX_UINT32`），**超了就抛错**、不静默产出半个包（文案 `error.zipTooManyEntries` / `error.zipTooLarge`，落点在 `engines.js` 的 `error` 组）
    systemBars.js               # 壳里那条**系统状态栏**的同步入口（2026-10-12 加），前端这一侧的唯一出处：`syncSystemBars(dark, color)` —— `IS_ANDROID` 闸门 + `invoke('set_system_bars')`，失败只 `console.warn`。调用点只有一个：`editorSettings.js` 里主题那个 watch（与写 `<meta name="theme-color">` 同处）。为什么网页上做不到、底色为什么取 `--bg-chrome`、以及 Rust / JNI 那一整条链路，见第 14.P 节
    backStack.js                # ★ 装成 app 之后的**系统返回**在站内的去处（2026-10-30 加）：一条哨兵历史 + 一条自维护的 LIFO 栈 + 一层可反复消费的兜底。对外四个出口 —— `armBackStack()`（`main.js` 在 mount **之前**调）、`pushBackLayer(onBack)`（返回注销函数，幂等）、`watchBackLayer(source, onBack)`（开 / 关型状态用这个）、`addBackFallback(fn, priority)`（「还能往回退一步的路」用这个，不占栈位）。只在独立窗口武装，浏览器标签页里四个出口全是空转。机制与全部判据见第 23 节，踩过的坑见第 5 节坑 66
```

## 3. 布局骨架（改布局 / 尺寸看这里）

`App.vue` 模板（`src/App.vue:551` 起）：

```
div.app（column，100% 高；padding 只有安全区，2026-09-28 起顶栏已删，工作区直接贴顶）
└─ main.workspace            flex: 1 1 auto; min-height: 0; padding: 6px; 背景 --bg-editor
   │                         类名状态：is-left / is-dragging / is-collapsed
   ├─ section.pane.pane--editor   内联 flexBasis = editorShare%
   │    └─ EditorPane
   │         ├─ EditorTabs            strip（页签，横向滚动，铺满整行）
   │         ├─ 编辑器画布 或 EditorSettingsPanel（v-show 互斥）
   │         └─ footer.editor-pane__status
   ├─ div.splitter                role=separator，键盘左右微调，单击折叠 / 展开（**窄屏没有这一条**，见第 5 节坑 48）；热区随侧栏停靠方向镜像（见第 5 节坑 52）
   │    ├─ span.splitter__line    悬停/拖拽才亮（2px）
   │    └─ span.splitter__dots    三点抓手，常驻可见
   ├─ section.pane.pane--tests    内联 flexBasis = (100 - editorShare)%，v-show 控制整栏显隐
   │    └─ Sidebar               统一侧边栏外壳（一个整体参与拖拽）
   │         ├─ header.sidebar__head     共享页头（全站一份）：div.sidebar__switcher（左，窄屏时整块沉到侧栏底部，里面那枚「收起侧栏」箭头也只在窄屏出现） + #sidebar-context（宽屏右贴、窄屏顶行且内容居中，当前面板 Teleport 上来的动作区）
   │         └─ div.sidebar__body        内容区（flex: 1 1 auto; min-height: 0）
   │              ├─ div.sidebar__panel  v-show="activeTab === 'explorer'" → FileExplorer（新建文件 / 文件夹两颗钮 Teleport 进页头）
   │              └─ div.sidebar__panel  v-show="activeTab === 'tests'"    → TestPanel（verdict / 耗时 Teleport 进页头）
   └─ ActivityBar                折叠后顶替侧栏的图标栏（`nav.activity-bar`，order 0 / 4 = 贴侧栏那一侧的最外侧）。**窄屏折叠态整条横过来、通栏贴在工作区的一条边上（上 / 下由设置 `cp.narrowCollapseSide` 决定，默认下），一排按钮整排居中**（见第 5 节坑 46、坑 47）
```

侧边栏页头（2026-10-11 起是 Sidebar 里的一份共享页头 `.sidebar__head`，不再是两个面板各自一份）左侧是**一枚面板胶囊开关 + 一颗设置钮**：胶囊整枚是一颗 toggle 按钮（点它任意位置都翻到另一个面板，切 `cp.sidebarTab`），里面两段分别是资源管理器与评测样例、当前所在的那段底下压着实心蓝的指示块；胶囊外那颗（2026-09-28 加，顶栏删除后从顶栏齿轮搬来）不切面板，而是弹出 Quick Settings 下拉菜单（`SettingsMenu.vue`，2026-10-11 起；菜单里的「打开设置面板…」才开那个编辑区里的合成页签 `settingsTab`，见第 5 节坑 7）。因为设置页签是编辑区的东西，关掉它时那颗齿轮的底色也跟着灭——它的状态由 `settingsTab.active` 决定，不走 `cp.sidebarTab`，但它填的是与胶囊指示块同一枚实心蓝（「填亮＝开着」一套语言；它在轨道外、是圆形，不会被误读成第三个面板）。它旁边那颗「组件」（2026-10-20 由 Codeforces 那颗改名而来，图标换 `grid`（四宫格）、**常驻**不再跟 `cf.ready` 显隐）同属轨道外一族：点它弹组件菜单 `ComponentsMenu`，菜单按类分组 —— **Codeforces**（随机抽题 / 比赛，模块没装时整组不出现）与**工具**（倒计时）；填亮 = 任一 CF 页签或倒计时卡开着。页头右侧是 `#sidebar-context`：当前激活面板经 `<Teleport defer>` 投上来的上下文动作（资源管理器 = 新建文件/文件夹，评测样例 = verdict + 耗时；defer 的来历见坑 37）。

**开跑必亮结果**（2026-09-28 加）：运行入口有两处——`⌘/Ctrl + Enter`、评测面板页脚的运行按钮（编辑器页签栏右端那颗已于 2026-09-28 删除）——全都并到 `App.vue` 的 `runAll()` 这一个出口。`runAll()` 在通过「正在跑 / 没有用例 / 没有活跃语言」三道前置判断之后、真正开跑之前，会调 `revealTestsPanel()`：侧栏收起了就用 `togglePanel()` 展开（它顺带把 `virtualShare` 接回 `editorShare`，与双击展开同一套收口），然后 `sidebarRef.value?.showPanel('tests')` 切到评测样例。已经在评测样例上就是空操作，不会破坏页签持久化。**别把这段放到 `runAll()` 的前置判断之前**——那样点「停止」（同一个按钮，跑到一半时发的是中止）也会把侧栏弹出来。页签栏那颗按钮删掉之后这条路更关键了：侧栏收起时唯一的点击入口已经没了，`⌘/Ctrl + Enter` 是唯一还能「隔空开跑并把结果亮出来」的手段（无头回归 E 步走的就是它）。

切换栏目的入口（`SidebarSwitcher.vue`，2026-09 加）**不再单独占一行页签栏**，2026-10-11 起渲染在 Sidebar 的共享页头里、全站单实例（此前渲染在两个面板各自的页头里、靠 v-show 藏一个）。段位是「图标 + 短标签」（文档折角 = 资源管理器「文件」，带勾的清单 = 评测样例「评测」，齿轮 = 设置，见 `AppIcon.vue` 的 `files` / `cases` / `gear`）；侧栏不够宽时收起文字退回纯图标（Sidebar 的 compact，阈值 360 逻辑 px）。全称仍放 `title` 与 `aria-label`。

**两个面板的入口在 2026-09-28 定稿为「胶囊式开关」**，当天改了两轮，最终形态是这两条的合体：

- **视觉像分段控件**：两段并排住在一个圆角轨道（`.sidebar-switcher__pill`）里，**当前所在的那段底下压着实心蓝的指示块**（`.sidebar-switcher__indicator`，`--accent`；段内图标与文字换 `--text-on-accent`）。这守的是「有两个面板可切」，也是第一轮否掉「一颗只有去向往哪儿的动作钮」时提的要求。
- **交互是一颗 toggle**：整枚轨道就是那个 `<button>`，点它**任意位置**（含 2px 内边距、圆角内的边缘、当前段自己）都翻到另一个面板；两段是纯视觉的 `<span>`，不接点击、也没有 `tabindex`。这是第二轮的要求——两段各自可点会在胶囊里留下点不动的边。

所以**别把点击下放回某一段**，也别退回「一颗只有去向往哪儿的单钮」。文案写**将要去的那一个**（`title` / `aria-label` 都是「切换到评测样例」这种祈使句，跟着 `targetPanel` 变）。无头回归的 `sidebarSegActive` 读的是每段上的 `data-current="true"`（哪一段被标记成当前），`sidebarTabs` 读页头两个控件的 `aria-label`。另外「现在停在哪个面板」仍有一个更直接的机器可读出处：`.sidebar__panel[data-panel]`。面板状态是 `cp.sidebarTab`，只有 `Sidebar` 一份（经 `provide('sidebarTabs')` 下发），别让面板各存一份；胶囊外那颗（设置）读的是 `settingsTab.active`。

关键规则（`src/App.vue:513` 起）：

- `.workspace` 恒为 `row`，左右换边靠 `order`（编辑器 1 / 分隔条 2 / 侧边栏 3，左侧时对调），**DOM 不重建**（布局切换还有 View Transitions 动画）。**别改回 `row-reverse`**：那会把两栏一起甩到另一边，连侧边栏内部的滚动条方向都跟着反。
- 两栏 `flex-basis` 之和恒为 100%：编辑器栏拿 `editorShare%`，侧边栏拿 `100 - editorShare%`。若给两栏留出 basis 之外的剩余空间，会被 `flex-grow` 平分，分隔条就只以一半幅度跟手——**改这两条 basis 时要一起想**。反过来也要留神：basis 是按**内容宽**算的，而这一行里还站着分隔条（净占 4px，见样式表 `.splitter`），于是两条 basis 加起来比可用空间多 4px，两栏按各自占比各缩一点 —— 把像素宽反算成百分比时必须除「内容宽 − 4」，否则少算这一段（见坑 61）。
- `.pane` 是独立的圆角卡片（`border-radius: 8px; overflow: hidden`），让 Monaco 画布和面板头脚的方角被裁掉。
- `.splitter` 视觉 1px 细线、热区 12px（**只向一侧外扩**：`margin: 0 -8px 0 0` —— 2026-10-13 由对称的 `margin: 0 -4px` 改来，为的是让热区左缘正好落在侧栏右缘上、不再压住资源树右缘那条覆盖式滚动条，见第 5 节坑 44；占宽仍是 `12 − 8 = 4px`，卡片净间距与两侧卡片位置逐像素不变）。**侧栏停靠在右时整条热区镜像**（`margin: 0 0 0 -8px`，触屏 `-20px`；线 / 三点那两条偏移同步取反号 `calc(50% + 4px)` / `+ 10px`）—— 「只向一侧外扩」这件事只跟「热区要贴住侧栏」有关，跟侧栏在左还是在右无关；不镜像的话那 8/20px 会反过来压进侧栏左缘（折角箭头点不动、树滑不动），见第 5 节坑 52。折叠状态下热区**不加宽**（两侧是编辑器卡片与折叠图标栏，不是窗口边缘，以前贴边时才需要 24px），**位置也与展开态同取那份偏心** —— 折叠态**没有**单独的热区覆盖（2026-10-13 曾加过一版 `.workspace.is-collapsed .splitter { margin: 0 -4px }` + 同名 `.splitter__line { left: 50% }` 把热区挪回左右对称，**当天撤掉、别再补回来**：热区左移会让左缘压进折叠图标栏）。三点抓手（`.splitter__dots`，靠 `left: 50%` 居中在热区里，展开态 `display: none`）会跟着偏，折叠态它常驻可见，由一条单独的 `.workspace.is-collapsed .splitter__dots { left: calc(50% - 4px) }`（触屏 `calc(50% - 10px)`，**必须写在桌面那条之后**）钉回中缝（2026-10-13 加，用户报「三个小圆点错位」）—— **只挪点、不挪热区**：点不接指针事件、纯视觉，挪它没有行为代价。触屏（`pointer: coarse`）下热区加宽到 24px，**负外边距要同步从 -8px 改成 -20px**——两者一起改，分隔条在 flex 里才仍只占 4px，两侧卡片位置逐像素不变。⚠️ 热区不对称后它的 `50%` 不再等于空隙中心（偏右整 4px），那条线要单独减掉：`left: calc(50% - 4px)`，触屏 24px 热区是 `calc(50% - 10px)`，**且这两条必须写在 `.splitter__line` 基础规则之后**（并进靠前那个 `@media (pointer: coarse)` 块会被同特异性的基础规则压掉，实测踩过：线停在默认偏移上、跑到空隙外 6px）。**改净间距还要同步 `.splitter__dots` 的横向 padding**：那个抓手容器的底色条宽度必须正好等于净间距（现为 `padding: 3px 0.5px` + 3px 点宽 = 4px），宽了会溢到卡片边缘上、窄了遮不住身后的细线。**窄屏折叠态整条不参与排版**（`display: none`，2026-10-13 加）：那个形态下工作区转成了竖排（见第 5 节坑 46），竖分隔条 12/24px 的 `flex-basis` 会变成一条横带，而它想表达的那条竖缝已经不存在；展开改由底部图标栏上的两枚面板按钮承担（用户口径：触屏下那条线本来也点不准）。
- `.splitter` 必须声明 `touch-action: none`。触屏手势的归属是浏览器在 `pointerdown` 那一刻定的：缺这行它就把这一拖当成滚动/缩放，随即发 `pointercancel`，而 `beginDrag` 的 `stop` 正挂在 `pointercancel` 上，于是手机上按下即被打断。`pointerdown` 里的 `preventDefault()` 挡不住（按规范它只抑制兼容的 `mousedown` / `mouseup`）。
- 拖拽用**像素直连**（2026-10-11 改，取代旧的百分比间接模型）：`move()` 里由指针位置一次算出面板内容宽 `panelW`（面板在右 = `contentRight - clientX`，在左 = `clientX - left`，`measureLimits()` 提供 `left`/`contentRight`），直接写进 `dragPanelPx`（ref），再由 `testsPaneStyle`/`editorPaneStyle` 把侧栏定成 `flex-grow:0; flex-shrink:0; flex-basis: ${dragPanelPx}px`、编辑器 `flex-grow:1; flex-basis:'0px'` 填剩余空间。绕开「百分比 → 舍入 → 浏览器 px」三层累积误差，蓝线严格 1:1 跟手——旧模型每多一轮折叠展开就多漂移一点（用户报「几轮展开后不跟手」，根因是 `MAX_SHARE=82` 上限把展开落点卡死 + 图标栏 48px 偏移不补偿 + 逐次舍入叠漂移；`MAX_SHARE` 已删，上限改由 `minPanelPx`/`maxPanelPx` 直算）。**死区钉住不动**（用户 2026-10-11 原话「蓝线强制跟着鼠标，除非鼠标在某个无法触发宽度变化的区域」）：展开态下 `panelW∈[minPanelPx, maxPanelPx]` 是可变区、严格 1:1 跟手；`panelW < minPanelPx` 是死区（面板已被 CSS min-width 顶住、无法更窄），钉在最窄位置不动，继续拖过 `hingePx` 才折叠。**折叠与展开是同一条线**（`hingePx`，2026-10-11 用户定的口径；2026-10-13 两次加窄屏分支）：**宽屏**取「折叠之后分隔条停的位置」与「展开到最窄时分隔条停的位置」的**中点** —— 后者是 `minPanelPx`，前者是 `collapsedPx`（**折叠之后侧栏真正占的宽度**，那条图标栏 `ACTIVITY_BAR_PX = 44px` × `uiScale`，见 `App.vue`）；**窄屏**（`isNarrowLayout()`，判据见 `services/shellSettings.js`）**不走中点**，改用固定的指针容差 `NARROW_HINGE_PX = 30`：**指针离侧栏那一侧的边缘 30px 以内就折叠**（用户 2026-10-13 第二次改口径；上一版是「最窄宽度的一半」，390 档落在离边缘 94.5px 处，用户报「感觉容易误触」），见第 5 节坑 48。判据因此只剩一句：**侧栏在左时，指针在这条线左边 = 折叠、右边 = 展开**（在右时左右对称，`move()` 里统一按 `panelW` 比），两侧各留一段「宽度无法再变」的死区。实测（W=1400、`uiScale=1`）：折叠线 x=57、最窄线 x=248、中点 x≈150，翻转发生在 147.5（仍折叠）与 157.5（已展开）之间，两向四组共 14 条断言全绿。⚠️ 由此有一条**预期内的代价**：展开那一刻分隔条会从中点跳到最窄落点（`minPanelPx`）—— 中点比最窄还窄、面板不可能更窄，这一跳改不掉（旧口径「展开要拖过 `minPanelPx`」之所以无跳跃，正因为它的阈值就是最窄本身）。**越界翻转走 `handoffDrag(expand, limits)`**（与单击完全同一套 `togglePanel()`，Chrome 下即 View Transitions 交叉淡化）：展开**只**把 `editorShare` 反算成 `Math.round((width-minPanelPx)/width*100*10)/10`（= 最窄宽度），`dragPanelPx` 保持 `null`；折叠把当前 `dragPanelPx` 反算回 `editorShare` 后置 `null`。⚠️ 展开这一侧**不许提前把 `dragPanelPx` 钉成 `minPanelPx`**（2026-10-11 用户报「展开那一下出现在别处、动画结束还跳一下」，见第 5 节坑 35）：像素直连的优先级高于 `panelVisible` 的 `0%`，提前钉会让折叠态那一帧的 flex-basis 直接变成最窄宽 —— 展开动画的起点被顶掉，面板先整块闪现在「折叠位 + 最窄宽」处，动画收尾图标栏让位时又往回收 48px。手势真正的收尾在 `pointerup`/`pointercancel`（`finish()`）：把最终 `dragPanelPx` 反算回 `editorShare`（一次舍入，与键盘/reclamp 同口径）再退出像素模式。**一次按住能来回触发多次**：`handoffDrag` 只在 `handoffPending` 时挡重复触发，window 上的监听留着（手势不结束，光标反向再越过对面阈值就能接着翻；此前把监听一起摘了，一次按住只能翻一下）。摘 `is-dragging` **只在非 VT 路径**（那条规则会把 `.pane` 的过渡整段让掉、动画起不来；VT 走 `::view-transition` 伪元素不依赖它，摘了反而让内层定宽壳钉死在 `flex:0 0 auto`、拖拽不跟手，用户报的「几轮展开后不跟手」另一处成因；非 VT 摘掉后由动画结束回调 `if (dragLive) dragging.value = true` 补回）。`handoffPending` 到翻转真正落到 `panelVisible` 上（`watch(panelVisible)`）才解锁。
- **折叠到底后，侧栏里那层内容必须整块退出绘制**（`App.vue` 样式表里 `.pane--tests.is-collapsed .pane__inner { visibility: hidden; opacity: 0 }`，2026-10-10 加；2026-10-14 去掉了原先那条 `:not(.is-animating)`，理由见下 ①）：折叠态那张卡只剩 1px，可里面的内容照旧排版，而且内容盒的左缘**就压在卡的左缘上** —— 凡是自带底色 / 外框的元素都会从这 1px 里透出一条竖线（用户报的就是文件树里选中那一行的 `--bg-hover` 底色 + 键盘焦点那道 1px `--focus` 蓝圈，改样式时别把它当成「卡片描边」）。三条别踩：① 选择器直接挂在折叠态上，**不要**再补 `:not(.is-animating)` 之类的排除项：那条排除是给已被删掉的 CSS 补间路径用的（「收窄那 200ms 里内容得一路可见」），而折叠现在只剩 View Transitions 一条路 —— VT 按快照播、旧快照是折叠前的样子，DOM 全程不动，根本不存在「收窄途中」这个中间态；② 两条属性各有分工、**不能删任何一条** —— `visibility` 管「退出 Tab 序与无障碍树」（折叠着还能 Tab 进看不见的行，本来就说不通），但它是继承的、**后代写 `visible` 就能顶掉**（`TestCaseCard.vue` 的 `.card__fold > .card__body` 正是这么写的，实测折叠后仍有 21 个后代是 `visible`），所以还得压一条 `opacity: 0` 管「一定不画」；③ 两者都不能换成 `display: none` —— 它不进布局、不生成盒子，`getClientRects()` / `offsetParent` / ResizeObserver 会一起变（`syncSidebarPin` 与第 8 节的回归脚本都读这些），View Transitions 的新快照也会少一块。
- **运行中分隔条照样能拖、也能单击折叠**（2026-10-18）：`beginDrag` 开头原先有一句 `if (running.value) return`（建仓时就在、没注释），于是编译一久（数组里带 `std::vector` 的用例可达 40s+）整条热区就哑掉 —— 而键盘方向键 `nudgeShare` 从来没有对应限制，同一段时间里两种入口行为不一致，用户报的就是这个（「无法拖拽、点击也没反应」）。守卫已删：拖拽只写 `dragPanelPx` / `editorShare`，与 `runCases` 不共享任何状态；运行中把侧栏收起来会看不见进度，但结果有 `notifyRunOutcome` 那条常驻通知兜底。实测（1400×900、真沙箱 256MB、慢编译那 46s 窗口内）：拖拽让面板 554 → 657px、`is-dragging` 全程为真，单击折叠 / 再单击展开都生效，运行未被中断。
- `measureLimits()` 用面板的**最低宽度 + 分隔条实际渲染宽度**算拖拽上限，两项都随视口与触屏档变（见下面「侧边栏的最低宽度」）。它同时返回像素直连拖拽要用的 `left` / `contentRight`（工作区内容盒左右边界）、`minPanelPx` / `maxPanelPx`（面板内容宽的合法区间）、`collapsedPx`（折叠态侧栏真正占的宽度 = 那条图标栏）与由这两者算出的 `hingePx`（**折叠 / 展开共用的那条分界线**，= `collapsedPx` 与 `minPanelPx` 的中点；**窄屏例外**：不走中点，改用固定的 `NARROW_HINGE_PX = 30`「离边缘 30px 内就折叠」，见坑 48），供 `move()` 把指针位置直接换算成面板宽（见上方「像素直连」那条）。

### 无顶栏后的两条宽度线（2026-09-28 顶栏删除后重测）

顶栏（`TopBar.vue`）整体删除后，原来那套「三档断点 + 省略号收纳」**不再存在**（历史见本节末）。现在需要守的只有两条，且都不靠 `@media` 断点，靠 flex 自己收缩；下表是 2026-09-28 用无头 CfT 在 1680 / 560 / 414 / 375 / 320 五档实测的（`documentElement` 无横向溢出，异常 0 条）。

| 视口宽 | 侧边栏宽（= 页头宽） | 页头图标区 | 图标是否溢出 | 页签 strip 宽 | strip 是否横向滚动 | 页面是否横向溢出 |
| --- | --- | --- | --- | --- | --- | --- |
| 1680 | 666 | 148 + 4 + 26 = 178（带标签） | 否 | 996 | 否 | 否 |
| 560 | 250 | 64 + 4 + 26 = 94（紧凑） | 否 | 292 | 否 | 否 |
| 414 | 211 | 64 + 4 + 26 = 94（紧凑） | 否 | 185 | 否 | 否 |
| 375 | 191 | 64 + 4 + 26 = 94（紧凑） | 否 | 166 | 否 | 否 |
| 320 | 170 | 64 + 4 + 26 = 94（紧凑） | 否 | 132 | 否 | 否 |

> 本表 **2026-10-11 重测过一次**（页头重构后）：胶囊段位带短标签（文件 / 评测）时整枚 148px，侧栏宽 < 360 逻辑 px 时收起文字退回纯图标（64px）——五档里只有 1680 档进带标签模式。阈值由 Sidebar 的 ResizeObserver 按侧栏实际宽度切换（不用 @container 的原因：页头里有 fixed 定位的 SettingsMenu 浮层，`container-type` 的 layout containment 会把它的定位基准从视口改到页头）。测量时默认只开着 `main.cpp` 一个页签、停在资源管理器面板（页头右侧动作区 = 新建两颗钮 50px），五档都不需要滚动；**strip 自己仍是 `overflow-x: auto`**，页签多起来照常滚——别把「不滚动」当成新契约。
>
> 上一版（2026-09-28，胶囊纯图标时代）五档的侧边栏宽是 663 / 238 / 199 / 180 / 158、图标区恒 90px，与本表略有出入是本次重测条件（视口高 900、`cp.uiScale=1`）下整条链路的现值，不是页头重构挤出来的。
>
> **2026-10-13 补测：上表「图标是否溢出 = 否」是在没装抽题模块的条件下量的**，装了它（`.sidebar-switcher__tab` +30px）之后页头那一排在窄屏装不下 —— 用户报的「窄屏时页头图标挤在一起、还错位」就是这个。实测（`cp.uiScale=1`、停在评测样例、390/360/320 三档触屏）：320px 视口下侧栏只剩 **181px**，而那一排要 94（左簇）+ 8（gap）+ 73（verdict）+ 12（内边距）= **187px** → `.sidebar__head` 的 `flex-wrap` 当场折到第二行（`.sidebar__head` 高 35 → 59，动作区被顶到 y=34）。抽题模块在场时左簇是 128px、uiScale 110% 再涨一成，折行的视口范围一路上行到 ~450px。**处理方式不是加宽侧栏**（用户明确否掉），而是窄屏时把左簇整块搬到侧栏底部一条（判据 2026-10-13 定为「竖屏触摸设备 **或** 视口 < 600px」两条并集，出处是 `shellSettings` 的 `isNarrowLayout()`，口径见下一条与第 5 节坑 45）。

- **侧边栏页头图标区**（`SidebarSwitcher`）：`.sidebar-switcher` 是 `inline-flex; gap: 4px`，内含①面板胶囊 `.sidebar-switcher__pill`（**本身是那颗 toggle 按钮**；`padding: 2px` + 两段各 72×22 = 148px 宽（紧凑时两段各 30×22 = 64px），整枚 13px 圆角）②设置钮（26×26 圆形；抽题那颗可选，渲染时再加 30px）。带标签 / 紧凑由 Sidebar 按侧栏宽 360 逻辑 px 切换（见上表注）。共享页头 `.sidebar__head` 常态高 35px、装不下才 `flex-wrap` 折第二行（所以把文字标签改成常驻、加大 `gap`、往胶囊里塞第三段都会更早折行——要加先按下面口径重量，见第 1 节硬约束表）。**2026-10-13 起窄屏不再靠折行兜底**：窄屏（判据见 `shellSettings` 的 `isNarrowLayout()`：触摸设备 + **设备**竖屏，或视口宽 < 600px）时上面这一整块（父组件包的壳 `.sidebar__switcher`）被 `order` 排到侧栏最后一行，页头 `display: contents` 解散、顶部只留 `#sidebar-context`（当前面板的动作）—— 完整口径、断点来历与实测见第 5 节坑 45。
- **编辑器页签栏**（`.editor-tabs`，`flex: 0 0 35px`）：现在只有一个子元素 `.editor-tabs__strip { flex: 1 1 auto; min-width: 0; overflow-x: auto }`，页签铺满整行、装不下就自己横向滚。右端那颗 64×25 的「运行 / 停止」按钮（`.editor-tabs__run`）**2026-09-28 已删**：删之前它靠 `flex: 0 0 auto` 钉在右端不跟着滚，同时把 strip 挤窄 64px + 12px 外边距；删掉之后 strip 直接宽出这一截（见上表）。**别再往这里加常驻按钮**——加了就要重新量五档宽度，并想清楚窄屏下页签被挤成什么样。
- 怎么量「必需宽度」：把摊平后的每个可见 flex 项**逐个**注 `flex-shrink: 0`，再把吃剩余空间的项藏掉，量最后一个可见子项右缘到容器左缘的距离 + 右内边距。**不能直接量 `scrollWidth`**——容器不是滚动容器时，收缩后的子项不会让它溢出，量出来的恒等于容器宽。
- 量宽度时的两个口径坑：`display: none` 父元素内的子元素，`getComputedStyle(child).display` **仍返回它自己的值**（不是 `none`），判可见要量外层容器或用 `el.getClientRects().length > 0`；`display: contents` / `display: none` 的子元素不生成盒子、**不占 gap**，量必需宽度时要把它们排除，否则会虚高几十像素。
- **不要用 iframe 或注入 `display: revert` 的方式模拟视口**——量不到真实溢出，返回的数字是自洽的假象。触屏档要用 `page.setViewport({ hasTouch: true, isMobile: true })` 才会命中 `@media (pointer: coarse)`（`emulateMediaFeatures` 不支持 `pointer`）。
- **历史**：顶栏原有的三档响应式断点（820 / 520 / 349）与 `⋯` 省略号收纳，2026-09-28 连同 `.topbar` / `.brand*` / `.tool` / `.primary` / `.popover--menu` 一起删除。设置入口搬进侧边栏页头（当时是第三颗图标，现在胶囊外那颗）、运行按钮先搬进编辑器页签栏、**同一天又删掉**（删后运行只剩 `⌘/Ctrl + Enter` 与评测面板页脚那颗 ▶）、安装到设备并进设置视图的「应用」分组、侧边栏开关与品牌删除（侧栏显隐仍可由分隔条双击 / 键盘切换，见第 3 节关键规则）。`--bg-chrome` 变量保留——它现在只服务于 `theme-color`（独立应用窗口标题栏底色），不再是任何组件的背景。

### 侧边栏的最低宽度（`App.vue`，2026-09 加；原名「测试面板的最低宽度」）

`.pane--tests`（统一侧边栏那一栏）的 `min-width` 不再是固定 320px，而是 `clamp(160px, 50%, 320px)`。三个参数定义在 `.workspace` 上（`--tests-min-cap` / `--tests-min-ratio` / `--tests-min-floor`），**JS 不另存一份**：`measureLimits()` 从 `getComputedStyle(workspace)` 读这三个变量，再按 `max(floor, min(cap, 内容宽 × ratio))` 复算面板下限。改参数只改 CSS 那三行（JS 里的 160 / 0.5 / 320 只是取不到变量时的兜底）。

| 视口宽 | 320 | 360 | 375 | 414 | 480 | 520 | 560 | 640 | ≥652 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 面板最低宽 | 160（地板生效） | 174 | 182 | 201 | 234 | 254 | 274 | 314 | 320 |
| 默认 60/40 实测（编辑器 / 面板） | 142 / 160 | 168 / 174 | 176 / 182 | 195 / 201 | 228 / 234 | 248 / 254 | 268 / 274 | 308 / 314 | 与改版前逐像素一致 |

- 为什么要改：改版前 375px 下面板被 320px 下限顶住、编辑器只剩 **37px**；320px 下更糟，两栏合计超出工作区，面板被挤出视口（编辑器 2px）。
- 50% 的来历：面板与编辑器在窄屏各占一半，两边都还放得下；320px 要到工作区内容宽 ≈640px 才够，所以 **≥652px 的视口行为与改版前完全一致**，桌面端零影响。
- 160px 是实测硬底：面板固定到 160px 时面板与卡片都无横向溢出（到 150px 时 `.card__head` 才开始超 5px）。320px 视口正好卡在地板上。
- 拖拽路径也同步：`measureLimits()` 的 `maxShare` 读同一组值，所以「一直往右拖」停在面板下限上（375px 下编辑器 167 / 面板 190，触屏因热区 24px 再让 18px），再往外才是折叠。**拖拽触发的展开终点恒为这条下限**（2026-10-11）：`handoffDrag()` 在翻状态前把 `editorShare` 钉到 `limits.maxShare`，于是快速甩出去也不会落到指针所在的远位置（此前 `share` 直接取 `raw`，一次跨过阈值就会把侧栏一展开就撑到半屏宽）。
- 面板头必须能**折行**（`TestPanel.vue` 的 `.panel__head` 加了 `flex-wrap: wrap` + `row-gap`，`.panel__heading` 加 `margin-left: auto`）：不折行时 `.verdict`（`white-space: nowrap`）会溢出自己的盒子、直接压到左边的胶囊上。**2026-09-29 复核**：页头现在只有「侧栏胶囊 + verdict + 耗时」三项；下面这两个数字是**还含时限下拉**时的实测（面板 160px 时压过去 82px、面板 320px 带上耗时压过去 ~33px），时限当天已搬进设置视图的「评测」组，所以它们只能当**历史上限**看——改页头时按当前 DOM 重新量一次。
- 已知窄极限（2026-09-18 收紧过一次，**改完未逐档复测**，动卡片头部后按第 8 节重量）：头部那句失败提示（「输出多 N 行」「编译失败」）已删除；跑完卡片的徽标改成两字母判定码 AC/WA/CE/TLE/RE/ERR（不再竖排，未跑的「待运行」在 320px 档仍可能竖排）；`.card__title` / `.badge` / `.metric` 都加了 `flex: 0 0 auto; white-space: nowrap`，耗时不再折成两行。面板 ≤174px 且**跑过一轮**时，耗时文字仍可能被卡片横向裁掉几个字符（旧实测约 32px）；想要更干净就上容器查询（`container-type: inline-size` + `@container`）按面板宽度摘掉耗时或标题。

### 触摸屏的键盘适配（2026-09-18 加）

手机上虚拟键盘会盖住大半个屏幕。这套适配**在触摸屏上默认开启、没有开关**，只做三件事：**把整块应用收缩到键盘上方**（内容照常滚动）+ **焦点不要被「滑动」改变** + **代码里不许主动把焦点塞进编辑器**（切文件只换内容，不弹键盘）。

**唤出键盘的时机用浏览器默认的**（焦点落进可输入文字的框里就弹），界面上不要另设开关。用户口径是：**滑动只滚动，轻点才聚焦**——一条曾经的失败尝试记在下面。
1. 加界面开关（先是「底部输入停靠栏 + 按钮」，再是「键盘模式按钮」）：真机上点按钮本身就会把焦点从编辑器抢走，反而把已经弹着的键盘收起来。两版都因此撤掉，**不要再加**。

- **默认开启的判定**：`matchMedia('(pointer: coarse)')` 为真即启用（鼠标设备上不写变量、不挂任何监听，行为与加这个功能之前逐像素一致）。判定单独导出成 `isTouchPointer()`（`composables/useMobileKeyboard.js`），供下面「不许抢焦点」的调用点复用——那里**不能**整体调 `useMobileKeyboard()`，否则 `onMounted` 会把整套 document 监听再挂一遍。
- **切文件不抢焦点（2026-09-28 加）**：`EditorPane.vue` 的 `activeId` watch 结尾原本无条件 `instance.focus()`，于是触屏上**点页签、点文件树都会把软键盘唤起来**——和上面「点哪儿都不会莫名弹键盘」的口径直接冲突。改成 `if (!isTouchPointer()) instance.focus()`：触屏上只是**不再主动聚焦**，并没有 `blur()`，所以「键盘弹着时一概不碰焦点」那条照旧（正在改代码时切页签，键盘不会被收掉）。暴露给外部的 `focus()`（扩展导入题目后补焦用）同样加了这道闸。
  - 触屏上「要看代码」的正常入口因此只剩一个：**轻点编辑器正文**，由 Monaco 自己的手势 Tap 去 `focusTextArea()`。光标不再跟着页签跑，这本来就是用户要的——焦点与光标只属于「用户点过的那块正文」。
  - **不要把 `focus()` 整个删掉**：鼠标设备上点页签后能直接敲键盘，是 VS Code 的既有手感（桌面实测点页签后 `activeElement` 仍是 `.native-edit-context`），删了就回归了。

- **可视高度**：`.app.is-keyboard` 是 `position: fixed; top: var(--vv-top); height: var(--vvh)`。这两个变量由 composable 从 `window.visualViewport` 的 `height` / `offsetTop` 写进 `documentElement.style`（`resize` / `scroll` / `orientationchange` 都跟）。用 `top` 一起对齐是因为 iOS 上可视区会被顶上去（`offsetTop > 0`），只改高度的话底部仍会被键盘盖住。**没有用 `interactive-widget=resizes-content`**（Chrome 专用）。工作区是 flex、Monaco 是 `automaticLayout`，都不需要额外写高度。
  - **浮层（菜单 / 设置下拉）的定位收敛同样以可视视口为准**（2026-10-14 加）：`composables/usePopoverLayer.js` 的 `clampIntoViewport()` 夹的是 `visualViewport` 而不是 `window.innerWidth / innerHeight` —— 理由与上面这条完全一样（键盘弹起时布局视口不动，拿它当匣菜单就会伸到键盘底下），见第 5 节坑 54。
- **保焦 = 只拦默认行为，不抢焦点**：键盘收起是因为焦点被移走了，所以监听 `document` 的 **`mousedown`（capture）**，目标不是可编辑元素时 `preventDefault()`：焦点不再移给 body，键盘不落。
  - 可编辑元素**一律放行**（`input, textarea, select, [contenteditable]`）。Monaco 的输入面是它自己那个 `textarea.inputarea`（Chrome 里实际聚焦到 `.native-edit-context`），卡片输入框是 `.ta`——挡掉它们就等于「焦点进不去编辑器」。
  - **唯一不进保焦的地方是 CF 抽题面板**（根节点标了 `data-native-focus`，见本节末）：它要的是原生行为——点按钮就收键盘。
  - **只挡 `mousedown`，别改成 `pointerdown`**：挡 `pointerdown` 会把兼容的 `click` 一起吞掉，「运行全部」「添加样例」这些按钮就点不动了；挡 `mousedown` 只阻止焦点转移，`click` 照常触发（已用 `page.touchscreen.tap()` 验过）。
  - **别再加 `focusout` 抢焦兜底**（旧版踩过）：那会在点 Monaco 编辑器时把焦点立刻抢回底部输入框，真机反馈「焦点无法集中在代码编辑框中」就是这么来的。
- **滑动不改变焦点（滑动只滚动、轻点才聚焦）**：`touchstart` 记起点与「滑动前的焦点」，`touchmove` 位移超过 `PAN_SLOP = 10px` 即判为滑动。之后：
  - **真凶是 Monaco 自己那套手势识别**，不是浏览器原生逻辑，光拦鼠标事件没用：
    - 触摸时它不走 `mousedown`（`pointerHandler.js` 的 `_onMouseDown` 对 `pointerType === 'touch'` 直接 `return`），`mousedown` 那条路只在鼠标/笔上生效；
    - 它在 `touchend` 里自己判 Tap（`vs/base/browser/touch.js` 的 `onTouchEnd`）：**按住 < 700ms 且「起始位置与最后一次 `rolling` 位置的差」< 30px** 就算 Tap，然后 `onTap` → `focusTextArea()`，键盘随之弹出；
    - 比较基准是**最后一次位置**，所以「划出去再划回来」——阅读代码时最常见的动作——只要落点回到起点 30px 内，也会被判成 Tap。
    - 修法：那个 Tap 是派发在 `.view-lines` 上的自定义事件（`'-monaco-gesturetap'`，`bubbles = false`、`cancelable = true`），**在捕获阶段**监听它，判定为滑动就 `stopPropagation()` + `preventDefault()`——Monaco 压根收不到，不会聚焦，也就没有「闪一下又收」。它自己也是挂在这个节点上监听的，冒泡阶段去拦就晚了。
    - 事件名是 Monaco 内部实现细节。若以后升级 monaco 后又要复发，先照上面 `onTouchEnd` 那段重新确认阈值与事件名；下面那道 `focusin` 兜底还能接住「焦点真的变了」的情况。
  - **键盘没弹着、焦点却还残留在编辑器 / 普通输入框里时，一落手（`touchstart`）就把焦点清掉**（`blur()`，这道是最后加上的，也是真机复发的关键）：Android Chrome 上，一个**已经聚焦**的输入框会在手势结束时被系统重新弹起键盘——这一步连 `focusin` 都不派发，所以上面拦 `mousedown`、拦手势 Tap 两道闸都看不见它。真机反馈正是「滑之前点过编辑器、有光标，抬手之后键盘才弹」（滑动）与「按返回键收了键盘，轻点任意位置键盘又被捞回来」（轻点）——同一个成因、两种触发方式。
    - **轻点那条拦 `mousedown` 来不及**：合成的 `mousedown` 在 `touchend` **之后**才来，那时系统已经决定重弹键盘了。所以两道都在 **`touchstart`** 断掉前提：`isEditable(current) && !isTouchOn(event, current) && (!keyboardUpAtTouchStart || inNativeFocus(current))`→ `current.blur()` 并把 `focusBeforeTouch` 清成 `null`（滑动那条在判定为滑动时还有一次 `undoFocusChangeFromPan()`，见上）。
    - 清哪些：**焦点在 Monaco 的输入面里**（`.native-edit-context` / `textarea.inputarea` 的祖先）或**在普通 `<input>` 里**（2026-10-01 扩，真机反馈「重命名框 / CF 抽题输入框收起键盘后轻点别处又被捞回来」，与编辑器同源）。2026-10-14 起两者并入整片 `isEditable`（`FOCUSABLE_SURFACE`），测试用例的 `.ta`（textarea）也会被清（见 15.5 的真机复现）。点编辑器文本时的重新聚焦不用管——那是 Monaco 自己的 Tap 干的，焦点本来就是这个入口给的。
    - 对 `<input>` 多一条 `isTouchOn`：**落点就在那个输入框里**（它本身 / 子节点 / 包着它的 `<label>`，如题目信息弹窗那种 `<label>` 包 `input` 的写法）就不清焦点——用户是想点回来接着打字（重命名框还挂着 `@blur` 提交，被抢跑连光标都点不进去）。**落手在框内、接着又滑起来**的那半段判不出是点还是滑，改在 `undoFocusChangeFromPan()` 里补一刀（`current === focusBeforeTouch && isInputBox(current) && !keepsFocusOnPan(current)`）。**但重命名框留了个口子**：它一失焦就提交改名，替它 blur 会把「拖选一段文字」变成「提交改名」、连选区一起丢，所以它自己标了 `data-keep-focus-on-pan`（见 `FileTreeItem` 的 `renameInput`），滑动时不动它——代价（用户已知情）是这种拖动收尾时键盘可能被系统重新弹起。**注意这条口子只覆盖「落手在框内」的滑动**：落手在框外、键盘收着时的 touchstart 那道闸照常清焦点（那是「轻点别处即失焦提交」的设计路径，落手那一刻分不出点还是滑）。
    - **键盘弹着时一概不碰焦点**（`keyboardUpAtTouchStart` 那道闸）：这时正确行为是保焦（点按钮、点输出区都不该收键盘），也正是「滑一下就收键盘」的老 bug 的修法。
    - **唯一的例外：CF 抽题面板整片走浏览器原生焦点**（`data-native-focus` 标在 `CfPickerPanel` 与 `CfContestPanel` 各自的根 `.cf-view` 上，判据 `inNativeFocus()`）。保焦是给「点按钮不收键盘」设计的，而这块面板的用户口径正好相反（2026-10-01 真机反馈两条：键盘自己的开关键把它收掉后轻点别处又弹；键盘弹着时点「抽取」/ 常用区间 / ON-OFF 不收）。所以面板内：
      - `onMouseDown` **放行**（不 `preventDefault`）——点按钮时焦点照常跟到按钮上，键盘随之收掉；
      - 里面的 `<input>` 在 `touchstart` **不看** `keyboardUpAtTouchStart` 那道闸（`inNativeFocus(current)`），因为「键盘刚被收起、`keyboardUp` 还没跟上来」的那一瞬，落手不清焦点就会在手势结束时被系统重新弹起；
      - 别的区域（编辑器、重命名框、测试样例…）一切照旧。
    - 代价（用户已知情、**真机已确认口感**）：键盘收掉后焦点不再留在编辑器里，接着打字得先点一下编辑器。这样换来的是「点哪儿都不会莫名弹键盘」，按用户口径是对的。
  - `mousedown` 也照拦（滑动幅度很小时浏览器仍会合成一次点击）：捕获阶段 `preventDefault()` + `stopPropagation()`（CF 抽题面板内不拦，见上）。
  - 再加一道 `focusin`（capture）兜底：滑动期间只要焦点跑到了可编辑元素上就还回去——编辑器里的直接 `blur()`（别还回去，否则又把键盘请回来）；其余情况还给「滑动前那个」（它是可编辑元素时 `focus()`，本来没焦点就 `blur()`）。两种时机都覆盖：判定为滑动的那一刻（**iOS 在 `touchstart` 就把焦点给了输入框，那时还没滑**，只在 focusin 里拦会漏），以及滑动过程中焦点又被移走。
  - **`PAN_SLOP = 10px` 是夹在两个阈值中间取的**：平台自己的点按 slop（约 8px，决定浏览器补不补那个 `mousedown`）与 Monaco 的 30px。比平台 slop 略大，手抖的轻点不会被误判成滑动（实测 4px 拖动照常聚焦）；又远小于 30px，才盖得住 Monaco 把小幅拖动当点击那一段。
  - `panning` 一直保留到下一次 `touchstart`（合成的点击是在 `touchend` 之后才来的，提前清掉就拦不住了）。轻点会在 `touchstart` 重置它，所以「滑动之后轻点」照常聚焦。
  - **判定「焦点落进可编辑元素」时必须认 Monaco 的输入面**：Chrome 里是 EditContext 的 `.native-edit-context`，它**不是** `contenteditable`（`node.isContentEditable` 为 false），上面那串 `input, textarea, ...` 选择器认不出来——漏掉它，那道 `focusin` 兜底对编辑器形同虚设。
- **状态**：没有持久化。`cph.mobileKeyboard`、`cph.mobileInputDock` 两个旧键都已作废，残留在 localStorage 里无害。
- 验证口径（临时 puppeteer 脚本，跑完即删；触屏要用 `page.setViewport({ hasTouch: true, isMobile: true })` 才命中 `pointer: coarse`，`emulateMediaFeatures` 不支持 `pointer`）。触屏 390×844：`.app` 带 `is-keyboard`、`--vvh=844px`；**轻点**编辑器 / 卡片 `.ta` → 焦点分别进 Monaco 输入面与那个 textarea；**手抖 4px** 拖动 → 仍聚焦（不误伤轻点）；**拖动 20px** 与**划出去再划回来** → 焦点仍 body（这两条是真机问题的靶子，改前必红：探针会在页面里给 `-monaco-gesturetap` 挂个计数器，先确认 Monaco 那时**确实派了 Tap**，再看焦点没进去）；拖动 72px → 焦点仍 body（Monaco 本就不派）；滑动后手动派一个 `mousedown` 给编辑器 → `defaultPrevented` 且焦点不进去；滑动期间手动 `focus()` 编辑器输入面 → 焦点被还回 body（这是 `focusin` 兜底那道闸）；焦点在 `.ta` 时滑动编辑器 → 焦点仍在 `.ta`；滑动后再轻点 → 焦点能进；焦点在 `.ta` 时点面板标题、输出区 `.out`、页签栏空白处 → activeElement 一字不变；视口 844→420 → `--vvh` 与 `.app` 高度都变 420。鼠标视口：无 `is-keyboard`、`--vvh` 为空、点输入框与点编辑器都照常聚焦。
  - **先点编辑器、再滑动 → 焦点必须被清掉**（这条是最后一个真机 bug 的靶子，改前实测焦点仍留在 `.native-edit-context`）；滑动期间再强行 `focus()` 编辑器 → 又被清掉；焦点在 `.ta` 时滑动编辑器 → `.ta` 焦点不动；滑动后轻点 → 焦点能进；手抖 4px → 不算滑动、焦点保留。
  - **轻点那条（2026-09-28 加）**：模拟「键盘收起但焦点还残留在编辑器里」（`visualViewport` 复位使 `keyboardUp` 为假，焦点仍 `.native-edit-context`）→ 只 `touchstart` 一次、不滑 → 焦点必须被清成 body（**改前必红**）；反过来「键盘弹着时轻点非可编辑处」→ 焦点一字不动（证明没破坏保焦设计）；轻点编辑器文本本身仍能重新聚焦（靠 Monaco 自己的 Tap）；焦点在卡片 `.ta` 时轻点别处 → 不动它；鼠标视口下整层不生效（`--vvh` 为空）。
    - **普通 `<input>`（2026-10-01 扩）**：焦点在重命名框 / CF 抽题输入框里、键盘收起时轻点别处 → 焦点必须被清成 body（**改前必红**）；轻点回那个输入框本身、或它的 `<label>` → 焦点保持；从框内起手拖动 > `PAN_SLOP` → 也被清掉（**重命名框除外**：标了 `data-keep-focus-on-pan`，既不清焦点也不提交改名）；键盘弹着时轻点「运行全部」这类面板外的按钮 → 焦点一字不动（保焦没被破坏）；**CF 抽题面板内相反**（`data-native-focus`）：键盘弹着时轻点「抽取」/ ON-OFF 分段按钮 → `defaultPrevented` 为假、焦点跟到按钮上（键盘随之收掉，`activeElement` 不再是那个 `input`）；焦点在 CF 输入框里、`keyboardUp` 为假时轻点面板内别处 → 焦点被清成 body。
  - **切文件不抢焦点（2026-09-28 加）**：触屏 390×844，先把焦点 `blur()` 到 body → 轻点**文件树里另一个文件**、以及轻点**页签栏里另一个页签** → 两者都换文件成功（activeTab 改名；轻点文件树走的是**预览页签**，上一个预览会被顶替，所以「页签数增加」不再是判据）且 `activeElement` 仍是 `body`、不在 `.monaco-editor` 里（**改前必红**）；再轻点编辑器正文 → `activeElement` 进 `DIV.native-edit-context`（证明正常入口没被误伤）。鼠标视口 1680×950 下点页签 → `activeElement` 仍是 `.native-edit-context`（证明没回归桌面手感）。
    - **落点要落在编辑器「可视区」里**：`.view-lines` 的 `getBoundingClientRect()` 比 `.monaco-editor` 宽得多（它是内容全宽、被裁掉的），取它的中心点会打到编辑器外面——390px 档实测 `.monaco-editor` 只有 `x:7 w:181`，而 `.view-lines` 是 `x:75 w:314`。要取「两者矩形交集」再取中心，并用 `document.elementFromPoint()` 先确认 `closest('.monaco-editor')` 为真。
  - **本地探针验证不了「真滑动」**：`page.touchscreen` 的合成触摸在我们这个无头 Chrome 里**根本不会滚动**（实测拖动 200px 前后 `.monaco-scrollable-element` 的 `scrollTop` 都是 0）。所以凡是依赖「真的滚起来了」的用例（Safari 在 `touchstart` 就聚焦、系统的键盘重弹）本地一律复现不出，**只能靠真机反馈；这一层已在真机上验证通过**（2026-10-01）。本地可验证的是「touchmove 位移判定」那一层，它不依赖滚动。
  - **选落点要避开本来就会改焦点的地方**，否则用例自己会测糊：卡片头左侧 30px 是折叠按钮（点了会把 `.card__body` 收起 —— 2026-10-06 起走 `.card__fold` 的行高动画，正文改由 `visibility: hidden` 藏，同样不可聚焦，焦点只能掉给 body）；面板头中部是时限的 `<label>`，点它会把 click 转给 `<select>`，焦点本来就会跟着走。

### 触屏编辑区的编辑手势（2026-10-10 加）

编辑区在触摸屏上的分工与 **iOS / Android 原生文本控件、VS Code 移动版一致**。Monaco 自己那套触摸手势只做了一半（轻点 / 双击 / 滚动），长按那一半是我们补的：

| 手势 | 行为 | 由谁实现 |
| --- | --- | --- |
| 轻点 | 光标定位 + 聚焦（键盘随之弹出；**键盘没弹着时键盘推迟约 400ms**，见下面那条） | Monaco（`Gesture` 的 Tap → `focusTextArea()`）；防抖那半由 `useEditorMenu.js` 接管 |
| 双击 | 选中光标下的词 | Monaco（`tapCount: 2` → `wordSelect`）；键盘没弹着时同样走下面的防抖那一路 |
| **三击** | **选中整行**（连行尾的换行一起选） | **`composables/useEditorMenu.js`**（Monaco 的 `tapCount` 封顶在 2、数不到 3，见坑 31） |
| **四击** | **全选** | 同上 |
| **长按 450ms** | **先选中手指下的词，再弹出「剪切 / 复制 / 粘贴 / 全选」** | **`composables/useEditorMenu.js`** |
| 拖动 | 滚动（触摸下不做框选） | Monaco（`Gesture` 的 Change → `deltaScrollNow`） |
| **拖手柄** | **按住两颗圆点之一拖动 = 改选区两端**（拖到上下边缘自动滚） | **`composables/useSelectionHandles.js`** |
| 鼠标右键（桌面） | 弹同一份菜单（这正是它替掉 Monaco 英文内置菜单的地方） | 同上 |

- **防抖的判据是「键盘此刻弹着没有」，不是「编辑器有没有焦点」（2026-11-01 修）**：`useMobileKeyboard.js` 导出模块级读数 `isKeyboardShown()`（与它唯一实例的 `keyboardUp` 同源，由 `syncViewport()` 按 visualViewport 实测写入），`useEditorMenu.js` 只在 `tapSequence === 1` 时读它。原先写的是 `editor.hasTextFocus()`，而本站刻意保焦 —— 键盘被返回键收掉之后焦点还留在 Monaco 的输入面上，那个判据恒为真，接管分支（含三击 / 四击）从来没有进入过，表现就是「单击立刻弹键盘、双击第二下落在被视口收缩顶走的位置」。补聚焦也不能只调 `editor.focus()`：焦点残留时 Monaco 的 `_setHasFocus` 见同值直接早退、一次 DOM focus 都不发生，键盘不弹；所以 `focusEditor()` 先把那个已聚焦的输入面 blur 掉再聚焦。
- **长按阈值 450ms 与文件树的 `LONG_PRESS_MS` 同口径**（比 Monaco 自带的 700ms 短），手指在判定前移动超过 10px 就当滚动、撤掉长按。
- **长按处若已落在选区里**（刚双击选好的词、或刚全选），**保持原选区不动**，只弹菜单 —— 同 iOS：长按已选中的内容 = 直接弹菜单。
- **菜单项随选区实时算**：没有选区时「剪切 / 复制」置灰；「粘贴」走 Monaco 的 `editor.action.clipboardPasteAction`，所以能拿到系统剪贴板。文案在 `i18n/messages/app.js` 的 `app.editorMenu.*`，中英各一份。
- **编辑器没有 model 时整份菜单不弹**（2026-10-12 用户点名的 bug：没开任何文件、编辑区只剩中间那块占位提示时，右键照样弹出来）。判据是 `editor.getModel()` 为空 —— `EditorPane.vue` 在 `activeId` 为空时正是 `setModel(null)`，所以这条与面板的「空态」等价，不必把面板状态搬进来；鼠标右键与触屏长按都拦在 `useEditorMenu.js` 的 `openAt` 一处。⚠️ **是拦住、不是放行**：空编辑区右键连浏览器原生菜单也不露（用户当场定的口径），别改成放行。
- **Monaco 自己那份英文菜单被彻底关掉**（2026-10-14 起是 Monaco 自己的开关：`services/editorOptions.js` 里的 `contextmenu: false`；桌面右键与触屏长按两条路上另有捕获拦截兜着，桌面 Shift+F10 靠这个开关一并关掉）；拦法与 Monaco 触摸手势的三个硬事实见第 5 节坑 31。
- `-webkit-touch-callout: none` 挂在 `.editor-pane__host` 上 —— 否则 iOS 长按会在我们的菜单之外**再弹一份系统菜单**（拷贝 / 查询 + 放大镜），两套叠在一起。
- **手柄是自绘的一层，不是 Monaco 的能力**：`EditorPane.vue` 在 `host` 之后渲染 `.selection-handles`（`position: absolute; inset: 0; z-index: 4; overflow: hidden; pointer-events: none`），里面两颗 44×44 的 `.selection-handle`（盒子透明、圆点与短杆都是伪元素画的），坐标由 `useSelectionHandles.js` 算成**盒子左上角**（相对 `stage`）。
  - **起点盒挂在选区上沿之上**（盒子的下边 = 首行行首那一列的 left/top），**终点盒挂在下沿之下** —— 同 iOS 左 / 右两颗。两盒都**不压住被选中的那些行**，代价是圆点会盖住上一行 / 下一行的一小块（行长 21px、圆点 16px，躲不开；iOS 也一样）。
  - 盒子尺寸是 44px 的触摸目标，允许伸到编辑器外面，多出来的部分由浮层的 `overflow: hidden` **裁掉且不参与命中测试** —— 否则页签栏 / 状态栏上会多出一条看不见的点击区。夹取只保证**圆点**整个留在可视区内。
  - 只对触摸出手柄：桌面鼠标本来就有「按住拖选」，再挂两颗圆点只会碍事。门闩是「最近一次落在编辑区的指针是不是触摸」，鼠标点一下编辑器手柄就会收起来（还可逆，再触摸就回来）。
  - 手柄层在 `!viewActive && mdViewMode !== 'preview'` 之外一律收掉 —— 设置 / 抽题 / 仅预览那几层都是同级的 `v-show`，浮层不收会浮在它们上面。
- **三击选行、四击全选（2026-10-11 加）**：`tapCount` 封顶在 2（见坑 31），三次轻点到了 Monaco 那边只是「又选了一次词」，所以这两个手势由 `useEditorMenu.js` 的 `onMonacoGestureTap` 借它报的 `tapCount` **接着往下数**：报 1 = 新一轮（间隔超 400ms，时间线与 Monaco 同一条），报 2 = 继续往下数；数到 3 / 4 就自己接管，并在**捕获阶段把那发 Tap 拦掉** —— 不拦的话 Monaco 会按「双击」把刚选好的整行又缩回一个词。选行的口径与鼠标三击完全一致（`CursorMoveCommands.expandLineSelection`，即 Ctrl+L）：**连行尾的换行一起选**，于是退格一下正好删掉一整行；末行没有换行，选到行尾。
- **键盘防抖：编辑器没焦点时，这一轮轻点先不聚焦（2026-10-11 加，用户点名「防止多击时把键盘弹出来」）**。起因是 Monaco 的 Tap 除了落光标还带 `focusTextArea()`：第一击就把键盘弹起来，而键盘一弹 App 就按 `--vvh` 把自己收矮，编辑区跟着重排版 —— **后面几击 `pageX / pageY` 给的是手指抬起那一刻的坐标，早就不是按下时的那个位置了**，于是双击选到别的词、三击选到别的行。做法：`hasTextFocus()` 为假时整轮由 `useEditorMenu.js` 接管（Monaco 的每一击都拦掉），光标 / 选词 / 选行 / 全选自己落地，补聚焦推到 `TAP_SETTLE_MS` 之后 —— **每来一击都重新计时**，所以单击 = 光标立刻落下、键盘晚约 0.4s；双击及以上 = 选完才弹。焦点已经在编辑器里（键盘弹着打字）时不做这套，视口本来就不会动。
  - `TAP_SETTLE_MS` **必须与 Monaco 的双击窗口同口径**（`touch.js` 的 `CLEAR_TAP_COUNT_TIME = 400`），否则会出现「Monaco 认为还在双击、我们已经把键盘弹了」。
  - 两处要撤掉这笔补聚焦：**长按接管**（用户要的是菜单，不是键盘；不撤的话键盘会在菜单弹出之后把视口收矮，菜单像跳了一下）与**滑动**（口径：滑动只滚动、轻点才聚焦）。卸载时也清一次。
  - 与 `useMobileKeyboard` 的「焦点」逻辑没有冲突：它只在 `touchstart` 与滑动时动焦点，而我们补聚焦是在手指停下之后。

- **文件拖拽的触屏手势已真机验证通过**（2026-10-01）：实现是 `composables/useTreeDrag.js`（手势状态机 `press → armed → dragging`）+ `services/vfs/treeOps.js`（重名排成 `name-2`）。触屏那套（长按 450ms 弹菜单、非被动 `touchmove` 按住滚动、行上 `touch-action: pan-y`、捕获阶段接管 `contextmenu`）已在真机上过了一遍：长按后拖动起拖且列表不跟着滚、拖到树上下边缘自动滚动、悬停折叠目录自动展开、拖动中系统的长按菜单不冒出来、松手那一下不误折叠落点目录。
- **长按到点的分叉（2026-10-11 改，**真机还没重验**）**：以前是「到 armed 态、抬手才弹菜单」，现在是**到 450ms 那一刻菜单当场弹出** —— 原地抬手 = 菜单留在屏幕上接着点（抬手那一下浏览器补的合成 click 被整个吃掉，不会误点条目）；此后指头一动（超 8px）= 先把菜单收掉再改判成拖拽。要重验的四条：长按不动 → 菜单在指头还按着时就出现、抬手后仍留着可点、抬手瞬间没执行任何条目；长按后移动 → 菜单消失、起拖、列表不跟着滚；短滑（不到 450ms）→ 照旧滚列表、不出菜单；鼠标右键 → 照旧在 `FileTreeItem.onContextMenu` 里弹。

## 4. 主题与 CSS 变量

- 主题落在 `<html data-theme="...">` 上（`App.vue:79` 的 watch），由 `base.css` 的变量接管；不带 `data-theme` 时即深色。
- Monaco 侧用同一批 id 的自定义主题（`src/monaco-setup.js`），`light` 的底色要和 `--bg-panel` 对齐，否则编辑区和面板会出现两块不同的白。
- 光标所在行（2026-10-11 改）：改前只覆盖了 `editor.lineHighlightBorder`，Monaco 的 current-line 装饰照样把边框画出来，观感是一圈 2px 方框。现在 `lineHighlightBackground` 与 `lineHighlightBorder` **取同一个值**，方框被填实成一条横贯全宽的色带。当前取值：深色 `#252528`（`--bg-card`）、浅色 `#e0e0e0`（`--bg-control-hover`）。
  - 深色那一支的三个落点（都是调色板现成的值，按「由暗到亮」排）：`--bg-panel-head`（`#222225`，实机反馈不够抓眼）→ `--bg-tab-hover`（`#28282b`，实机反馈偏亮、有点抢眼）→ `--bg-card`（`#252528`，当前）。同一天反复调了三次，**下次再动先问清是「不够明显」还是「太亮」**，别在 `#252528` 上下各一档里来回蹭。
  - 深色的阶梯参照：`#181818` 编辑区 → `#1d1d1e` 面板 → `#222225` 面板头 → `#252528` 卡片 → `#28282b` 页签悬停。上限不要摸到 `--bg-hover`（`#323539`），再亮就跟文件树选中行抢戏。
  - 两色**都不能省略**：省略背景则退回透明，省略边框则退回注册表默认 `#282828`，又变回灰框。
  - **只铺正文，不铺行号栏**（2026-10-11 同日）：行号栏那块底色由 Monaco 的 `renderLineHighlight` 决定 —— `'all'` = 正文 + 行号栏，`'line'` = 只正文（源码依据：`currentLineHighlight.js` 的 `_shouldRenderInMargin()`）。`editorOptions.js` 的默认值已由 `'all'` 改成 `'line'`，并抬 `EDITOR_SETTINGS_VERSION` 到 **6** 做一次性改写（见第 6 节）——不改写的话存档里的 `'all'` 会盖住新默认，老用户刷新看不到变化。行号文字本身的「当前行提亮」与这个选项**无关**（`active-line-number` 只看光标行），所以改完行号仍比别行亮。设置面板四档全留，想要连行号栏一起铺底色的仍可选「全部」。
  - ⚠️ **这条改写当天抬了两次版本号（5 → 6），第一次没生效**：当时把「版本号抬到 5」和「加改写分支」分成了两次编辑落地，中间那段窗口里 dev server 的 HMR 重载过一次页面 —— 那次读盘时版本号已是 5、改写分支还不存在，于是把 `{ renderLineHighlight: 'all', version: 5 }` 原样写回存档；此后 `< 6` 之前的老判定永远不成立，这条改写对该存档彻底失效（症状：用户怎么刷新，行号栏都还在染色）。**动 `EDITOR_SETTINGS_VERSION` 时必须和它对应的迁移分支在同一次编辑里落地，别分两步。**
- **侧边栏无论折叠还是展开，底色都与整页底色同色**（2026-10-23 用户要求：「无论折叠还是展开的底色都改为与网站整个页面的底色相同」）。四处一律 `--bg-editor`，改一处必须四处一起改：
  - `.pane--tests`（`App.vue`，覆盖 `.pane` 给的 `--bg-panel`）/ `.sidebar`（`Sidebar.vue`）/ `.panel`（`TestPanel.vue` 的评测面板 —— 它盖在 `.sidebar` 上，两边不同值的话切一次页签就能看出「底板被换了一档」）/ `.activity-bar`（`ActivityBar.vue`，折叠态那条 44px 图标栏；2026-10-26 从 48 收来）。
  - 编辑器那半张卡仍是 `--bg-panel` + 1px `--border-soft`：卡片语言只落在编辑器一侧，侧边栏读起来是「地面让出来的一块」，与编辑器之间只靠那 4px 留白分开。
  - 探针实测（1400×900，两套主题 × 展开资源管理器 / 展开评测 / 折叠三种）：`.pane--tests`、`.sidebar`、`.panel`、`.activity-bar` 与 `html`、`body`、`.workspace` **全部同色** —— 深色 `rgb(28,28,28)`、浅色 `rgb(243,243,243)`；`.pane--editor` 仍是 `rgb(29,29,30)` / `rgb(244,244,244)`。
  - 页头那几条仍是 `--bg-panel-head`（编辑区页签栏 / 资源管理器页头这类「条」）—— 它们不是底色，别顺手一起改。**评测面板页脚已不在此列**，见下一条。
- **评测样例面板页脚（`.panel__foot`，「添加测试样例」+ ▶ 那一条）改成与面板同色的透明条 + 一条「还有下文」发丝线**（2026-10-23，用户：「仿照侧边栏页头菜单的样式，修改底色，添加动态的分隔线」）。三条：
  - 底色 `--bg-panel-head` → **`transparent`**：它不再是一块比正文亮一档的色斑，而是同一条地面的末段，两颗按钮直接浮在上面 —— 与侧边栏页头（`.sidebar__head` 常时透明）同一套做法。
  - 与列表的分界改由**发丝线**承担，且是**动态**的：判据是**没滚到底**才给页脚挂 `.is-more-below`、上沿才描 `--border-soft`。**⚠️ 这条与页头 `.is-scrolled`（`scrollTop > 0` 才画）正好相反**（用户 2026-10-23 当场纠正：「页头是滚到最上方时不显示，页脚那个应该是在最下方时不显示」）—— 页头在上、说明「内容从底下穿过去了」；页脚在下、说明「下面还有内容压着」。所以：滚到最底 / 一屏装得下 / 空列表 → **没有线**；其余位置 → 有线。判据写法 `scrollTop + clientHeight < scrollHeight − 1`，那个 `−1` 是亚像素余量（缩放后 `scrollHeight` 常带小数，差 0.5px 会把「已到底」读成「还有下文」，线就永远擦不掉）。
  - 判据要跟着三种「没人滚但边界变了」的情形重算：① 面板是 `v-show`，藏起来时 `clientHeight = 0` 算不出东西，切回来靠 `ResizeObserver` 补算（只挂 `scroll` 的话，进面板不动滚轮线就一直缺着）；② 增删用例、改输入让卡片长高变矮 → `watch(props.cases, deep)` + `nextTick`；③ 卡片自己的折叠态在子组件里，`TestPanel` 看不到 —— 只在「收起后刚好不再溢出」时多留一条线，滚一下自愈，没为它上 `MutationObserver`。
  - 那条 `border-top` 常时就在、只是 `transparent`：显示 / 隐藏不改盒高，页脚不抖 1px（与页头 `border-bottom: 1px solid transparent` 同理）。实测页脚恒为 53px（含这条 1px）。
  - 探针实测（1400×900，两套主题，3 条用例 / 溢出 279px）：空列表 → 无线；停在顶部 → `1px rgb(45,45,50)`（深）/ `rgb(228,228,228)`（浅）= `--border-soft`；滚到最底 → `1px rgba(0,0,0,0)`；停在中间 → 又有线；切到资源管理器再切回 → 线按当前滚动位置重新算对。页脚 `backgroundColor` = `rgba(0,0,0,0)`，与 `.panel` / `.sidebar` 同为 `rgb(28,28,28)` / `rgb(243,243,243)`。
- **页脚主操作从线框图标改成通栏图文条**（2026-10-24，用户：「运行按钮过于单薄」——它是一栏的 Primary Action，却只有一颗 32px 的 ▶ 缩在左下角）。`▶` 那颗改成 `flex: 1 1 auto`、高 36、图标 +「运行全部」居中，**`background: var(--ok-face)`、不描边**，悬停加深到 `--ok-face-hover`；页脚左右内边距从 12px 收到 8px，与 `.cases` 对齐，所以它与「添加测试样例」同宽。提交那颗仍是纯图标、36×36、靠右，不与主操作抢权重。实测（1400×900，两套主题）：主条 538×36 与 Add 538×32 同宽，深色面 `rgba(137,209,133,.12)` / 浅色 `rgba(23,128,61,.08)`；侧栏压到下限 158px 且提交按钮在场时主条 98×36，`scrollWidth == clientWidth`（文字不被裁），页脚高 57px（原 53px）。
  - 主操作的「面」最终是**低透明度绿色微光底**（2026-10-24 用户选定版本）：深色 12% / 浅色 8%，悬停 20% / 14%，不描边；不加渐变、内高光、阴影、噪点。中间试过的磨砂层、细噪点、「霜云」、透明幽灵皮肤都被用户退掉了 —— **只保留 `--ok-face` / `--ok-face-hover` 两支 token，别再给这颗按钮叠加别的质感**。它的主操作身份靠通栏面积 + 位置 + 图文承担，颜色只留在图标与文字（`--ok`）上。
- **评测样例卡片底色同样跟着换成 `--bg-editor`**（2026-10-23 同日，用户：「将评测样例的卡片底色也改为与侧边栏底色相同」）。`TestCaseCard.vue` 的 `.card` 原本是 `--bg-panel` —— 面板自己改走 `--bg-editor` 之后，卡片就成了列表里唯一亮着的一块。它本来就设计成「与面板同色、无外框、读成一条平铺列表」（见该处 2026-10-06 注释），所以面板换哪支它就跟哪支。只改这一处：卡片内部的输入 / 输出框是 `--bg-input`、徽标是 `--case-chip-bg`，都是独立层次，别跟着改。
- **所有「显示评测结果」的胶囊改成圆角矩形 `6px`**（2026-10-23，用户：「形状改为圆角矩形，R 角用项目里常用的那个」）。全站只有两枚这类胶囊，两处必须同时改，否则同一块面板里会并存两种形状：
  - `.badge`（`TestCaseCard.vue`，卡片头栏的判定码 AC / WA / TLE…）
  - `.verdict`（`TestPanel.vue`，共享页头右侧的「全部 AC / n/m AC」）
  - 取 `6px` 的依据：它是全站出现最多的圆角值（20 处），也是同一块面板里 `.add` / `.run-inline` 两颗按钮的圆角，判定码与按钮因此同属一套形状语言。
  - ⚠️ **别改成 10px**（编辑器卡 / 折叠图标栏 / 侧栏胶囊那档）：这两枚连内边距才 17–20px 高，`10 + 10` 超过高度，CSS 规定相邻两角之和不得超边长，浏览器会把四个角一起按比例夹小 → 又变回半圆胶囊，白改。
  - 实测（1400×900，两套主题，echo 引擎跑出 AC）：`border-radius` 均为 `6px`；`.badge` 高 17–20px、`.verdict` 高 20px（未运行时 17px）；截图看过形状是「直边 + 小圆角」，与页头那枚 10px 圆角的面板胶囊能区分开。
- **「运行中」徽标改成静态，不再呼吸**（2026-10-23，用户：「点击运行，侧边栏的评测样例卡片发生了闪烁」）。`.badge[data-status='running']` 原先挂着 `breathe 1.15s ease-in-out infinite`（opacity `1 ↔ 0.55`），而 `runAll` 一开始就 `queue.forEach(resetCase)` 把**所有**卡片同时置成 `running`（`runner.js` 的 `concurrency` 默认 2，排队中的卡片同样显示「运行中」）—— 于是整栏徽标的文字同步明灭，观感就是「卡片在闪」。
  - 实测（12 条用例，echo 引擎，1400×900，深浅两套）：运行窗口 725ms 里 12 枚徽标 opacity 由 `1.00` 一路掉到 **`0.55`** 再爬回；**同期卡片高度恒为 349px、`.card` 节点零增删**（MutationObserver 记录）⇒ 闪烁只来自那条动画，与布局抖动、组件重建都无关。
  - 现在徽标只剩静态 `--info` 字 + `rgba(79,193,255,.16)` 底；**运行状态由圆点的涟漪交代**（`.card__dot[data-status='running']` 的 `dot-ripple` 保留，8px 光晕）。
  - ⚠️ 别再加回任何 opacity / 闪烁类的 `infinite` 动画：一枚 8px 光晕是背景节奏，一行 11px 的字**整栏同步明灭**不是。想强调「正在跑」，走圆点或页头的 verdict，别动徽标文字。
- **样例之间只剩留白，标题到 INPUT 再收紧一档**（2026-10-24 深夜，用户：「样例的标题与下方 INPUT 的间隔有点大了……去掉样例与样例之间的分隔线，但是样例与样例之间的间隔不变」）。两笔改动：
  - `.card::after`（原先压在两张样例中线上那条 1px `--border-divider`）**整条删除**，`.card` 的 `position: relative` 随之撤掉。它是零高绝对定位伪元素、不参与布局，所以删掉之后**样例间距一个像素没动**。`--border-divider` 变量保留 —— 设置页 `.settings-group` 的 `border-top` 还在用。
  - `.card__body` 的上内边距 **8 → 4 → 0px**（基础档与 `@container (max-width: 22.5rem)` 的窄档同步改；用户 2026-10-24 深夜先要求从 8 收到 4，又要求再收一档到 0 —— 头栏那两颗 32px 图标按钮已经比 13.5px 的标题文字高出不少，标题文字底到头栏盒底本来就有约 10px 的天然留白，所以收到 0 也不会让 INPUT 的标签贴上按钮），下内边距仍是 10px。
  - 间距账本维持原值：`.cases` 的 `gap: 10px`、`.card` 与 `.card__body` 的下内边距各 10px（合成末行内容 → 卡片底 20px）、下一张 `.card__head` 的上内边距 2px —— **改这里任何一项都要把这张账重新配平**。
  - 实测（1400×900 宽档 + 窄档、深浅两套，36/36 断言）：标题行中心仍在 18px、头栏高 36px、头栏 → INPUT 标签 4px、样例间距 10px、末行内容 → 卡片底 20px、`.card::after` 的 `content` / `background-image` 均为 `none`、横向零溢出。

- 变量分组（`src/styles/base.css`）：

| 分组 | 变量 |
| --- | --- |
| 底色层次 | `--bg-editor` 页面留白（侧边栏与评测样例卡片 2026-10-23 起也用它） / `--bg-panel` 卡片面板 / `--bg-panel-head` 面板头脚 / `--bg-card`、`--bg-card-head` Markdown 代码块与指南卡片（用例卡片已不用它们） / `--bg-chrome` 应用外壳（2026-09-28 顶栏删除后只服务于 `theme-color`） / `--bg-tab-active` / `--bg-tab-hover`（页签悬停底色，2026-10-10 加；**两套主题方向相反** —— 浅色比栏底压深 6 阶，深色比栏底提亮 6 阶，深色压暗会与选中色混为一类，见 base.css 注释。深色那支因此不能复用 `--bg-hover-soft`（只亮 2 阶、看不见）与 `--bg-hover`（亮过头）） |
| 浮层与控件 | `--bg-raised` 浮层底色（删除确认卡 `.confirm__card`、题目信息卡，**已无抽屉**；右键菜单自 2026-10-10 起**不再用它**，见下面「右键菜单」那行） / `--bg-control`、`--bg-control-hover` 按钮下拉 / `--bg-input` 输入框 / `--bg-hover` / `--bg-selection` |
| 描边 | `--border`、`--border-soft` / `--border-faint`（比 soft 再淡一档，只给折叠态图标栏 `ActivityBar` 那条常显的卡片边界用，2026-10-10 加） |
| 文字 | `--text`、`--text-dim`、`--text-faint`、`--text-on-accent`、`--statusbar-text` |
| 强调 | `--accent`、`--accent-hover`、`--accent-strong`、`--accent-deep`、`--accent-text`（2026-10-28 加：主色当**文字 / 图标**色用；`--accent` 压在深色地面上只有约 2.6:1，彩色面上的字改用它）、`--focus`（焦点框与分隔条高亮） |
| 低透明度状态面（2026-10-28 加） | `--accent-face` / `--accent-face-hover` / `--accent-face-soft`（CF 页的通栏主操作、置顶条、题格、选中态）+ `--fail-face` / `--warn-face` / `--info-face`（判定徽标、题目状态）。一律纯 `rgba`、无描边无高光，面上的字色配 `--accent-text` / `--ok` 这类实色；浅色主题整体压一档 |
| 运行（评测样例面板页脚主按钮；2026-10-24 改） | `--ok` + 微光底 `--ok-face`、`--ok-face-hover`。`--run-green` / `--run-green-hover` 现在只有 `styles/guide.css` 的教程按钮在用，评测面板不再消费 |
| 状态色 | `--ok`、`--fail`、`--err`、`--info`、`--warn` + 浅底变体 `--ok-soft`、`--fail-soft`、`--danger-bg`、`--danger-bg-hover`、`--danger-text` |
| 提示块 | `--info-soft-bg`、`--info-soft-border`、`--info-soft-bg-hover`、`--info-soft-border-hover`、`--info-soft-text` |
| 用例卡片 | `--case-border`、`--case-chip-bg`、`--hint-goose`（ACTUAL 框内系统提示的鹅黄，2026-10-26 晚加；**单开一支不跟 `--warn` 联动**，取值与理由见 §20.8） |
| 右键菜单（2026-10-10 加） | `--menu-bg` / `--menu-border` / `--menu-text` / `--menu-muted`（右列快捷键） / `--menu-hover-bg`、`--menu-hover-text`、`--menu-hover-muted`（悬停那一行） / `--menu-separator` / `--menu-shadow`。**唯一消费者是 `ContextMenu.vue`**（文件树 + 编辑区两处入口共用同一份）。两条别踩：① 这是全站**唯一一组悬停取蓝色**的变量 —— `--menu-hover-bg` 深色 `#04395e` / 浅色 `#0060c0`，别为了「跟文件树的灰悬停一致」把它换成 `--bg-hover`；② 深色那列是模板原值（VS Code Dark+），浅色那列是 Monaco 注册表里同一批颜色 id 的 light 项（`foreground` / `list.activeSelectionBackground` / `dropdown.border`），**两套主题是一对**，改一边要连另一边一起想（唯一刻意不同值的是 `--menu-muted`：模板的 `#858585` 压在白底上只有 3.4:1，浅色压到 `#767676`） |
| 分隔条 | `--splitter-dot`（三点抓手颜色） |
| 滚动条 | `--scrollbar-thumb`、`--scrollbar-thumb-hover`（两个消费方：`base.css` 里那条原生 `::-webkit-scrollbar` 样式，以及覆盖式滑块 `.oscroll-thumb` —— 2026-10-13 加，见第 5 节坑 43）。**取值 2026-10-13 往背景靠了一档**（深色 `#424247` / `#525258` → **`#333338` / `#43434a`**，浅色 `#c4c4c4` / `#adadad` → **`#d5d5d5` / `#c0c0c0`**）：滑块对面板底色的对比度由约 1.7 压到约 1.3，按要求「与背景色差更小」。两套主题的改动量对齐、方向相反（深色变暗、浅色变亮），别只改一边 |
| 字体 | `--ui-font`、`--mono-font` |

组件样式入口（**下面括号里的行号是「该组件 `<style>` 块的起始行」，只作定位参考——它会随上方模板增删而漂移，真要照着找请搜索选择器名而不是行号**）：

| 组件 | 主要选择器 |
| --- | --- |
| `App.vue`（style@622） | `.app` `.workspace` `.pane` `.splitter` 及其状态类 |
| （原 `TopBar.vue`） | **已删除**（2026-09-28）：`.topbar` / `.brand*` / `.tool` / `.primary` / `.popover--menu` / `.menu__item--*` 和三档响应式断点整块没了。对应的三处去处见第 3 节「无顶栏后的两条宽度线」 |
| `Sidebar.vue`（style@218） | `.sidebar`（column）`.sidebar__head`（共享页头，高 35px、不折行：左 SidebarSwitcher、右 `#sidebar-context` 接各面板 Teleport 上来的动作区；透明底是 2026-10-04 的定稿，列表滚动后 `.is-scrolled` 才在下沿浮出 1px `--border-soft` 发丝线）`.sidebar__context`（投进这里的两份内容交替时播一次 `sidebar-context-in` 淡入；窄屏下它铺满整条侧栏宽、内容**居中**，宽屏是内容宽 + `margin-left: auto` 右贴 —— 见第 5 节坑 50）`.sidebar__body` `.sidebar__panel`（`flex: 1 1 auto; min-height: 0`）。**面板内部的滚动归各面板自己**，这里只保证「不限高、不撑破外层」。原 `.sidebar__tabs` / `.sidebar__tab`（独占一行的页签栏）已在 2026-09 删除，改成页头里那套 |
| `SidebarSwitcher.vue`（style@151） | `.sidebar-switcher`（`inline-flex; gap: 4px`，高 26px，`flex: 0 0 auto`；段宽变量 `--seg-w` 只在这里写一次：带标签 72px、`.is-compact` 30px）`.sidebar-switcher__pill`（**本身是 `<button>`**：胶囊轨道 + 那颗 toggle，`padding: 2px`、`border-radius: 13px`、底色 `--bg-control`，hover 提亮到 `--bg-control-hover`；`data-active` 记当前面板 id，指示块位移按它选）`.sidebar-switcher__indicator`（**蓝色高亮本体**：绝对定位的小胶囊，`--accent`，active 变化只改 `transform: translateX(var(--seg-w))`、transition 补间 —— 单实例后滑动是真的；`width` 也挂过渡，切紧凑模式时与段一起收）`.sidebar-switcher__seg`（胶囊里的两段，`<span>` 纯视觉、不接点击也没 `tabindex`，宽 `var(--seg-w)` × 22 / `border-radius: 11px`，带 `data-panel` 与 `data-current`；`z-index: 1` 抬到指示块之上，`.is-active` 把图标与 `.sidebar-switcher__label` 短标签换成 `--text-on-accent`，颜色过渡压 60ms 延迟 —— 指示块先滑到位、文字随后点亮，iOS 分段控件那个观感）`.sidebar-switcher__tab`（胶囊**外**的设置钮与抽题钮，26×26 圆形；`.is-active` 同样填 `--accent`——**不能**退回 `--bg-hover`，那色与隔壁轨道 `--bg-control` 几乎同色，实测两个控件会糊成一块）。全称放 `title` / `aria-label`（胶囊那颗写「将要去的那一个」）。查询 / 断言落在 `.sidebar__head` 作用域里，认 `aria-label` / `data-current` / `data-panel`（单实例，不必再落到「当前可见的 `.sidebar__panel`」里找）。旧版那套 `sidebar-indicator-from-*` keyframes、`sidebar-icon-light-up`、`[data-switched]` 与段 `::before` 已整体删除（2026-10-11，历史见第 5 节坑 5c） |
| `TestPanel.vue`（style@93） | `.panel`（`flex: 1 1 auto; min-height: 0`，不再写 `height: 100%`）`.panel__heading`（Teleport 进共享页头的 verdict + 耗时那条；`margin-left: auto` 贴右）`.verdict[data-tone]`（文案「全部 AC / n/m AC」）`.elapsed` `.panel__foot` `.add`（页脚那颗「添加测试样例」；`span.add__label` 是窄屏藏字用的钩子类，规则在 `Sidebar.vue` 的窄屏块里 —— 见第 5 节坑 51；**2026-10-24 凌晨 title 也带上了它的快捷键**：`tests.panel.addCaseTip`「动作名（组合键）」，组合键走 `formatCombo(bindings['new-case'])`，与 `runAllTip` 同一套口径）`.run-inline`（页脚主操作，2026-10-24 起是通栏图文条 + 低透明度 `--ok` 磨砂面，见上面那条；**2026-10-24 凌晨原生 title 里带上了它的快捷键**（用户要求「鼠标在运行全部按钮上时，显示它的快捷键」，口径明确是原生描述、不自绘气泡）：title 走 `tests.panel.runAllTip`（「动作名（组合键）」，括号全角 / 半角中英各一套），组合键由 `formatCombo(bindings.run)` 现算 —— 绑定表是唯一口径，设置里改键这里跟着变，解绑了退回纯 `runAll`；跑不了时 title 仍填原因（原生禁用按钮悬不出 title，原因由页脚 `.run-blocked` 那行可见字负责）。**别给这颗按钮包 `AppTooltip`**：试过一版自绘气泡，用户指明要原生描述）。`.submit-inline`（页脚最左那颗纯图标「提交到 Codeforces」，只在**真交得了**时渲染；**2026-10-24 凌晨 title 也带上了它的快捷键**：走 `tests.submit.buttonTip`「动作名（组合键）」，组合键由 `formatCombo(bindings['submit-solution'])` 现算，解绑了退回 `tests.submit.button`；它是纯图标按钮，title 就是唯一的可见说明。`aria-label` **不带**组合键，仍是纯动作名 / 提交中）。**`.cases`（用例列表，`overflow-y: auto`）的原生滚动条是藏掉的**（2026-10-13，同 `.explorer__tree`），由 `useOverlayScrollbar(listEl)` 接手 —— 卡片宽度不再随滚动条出现 / 消失变一下（见第 5 节坑 43）。原 `.panel__head` 已随页头上提删除（2026-10-11，折行 / 35px 同高 / 滚动描边都由 `.sidebar__head` 一处承担）。**`.select` 已随时限下拉一起移出**（2026-09-29）：时限改在设置视图的「评测」组里，页头不再有下拉 |
| `FileExplorer.vue`（style@764） | `.explorer`（column，`flex: 1 1 auto`）`.explorer__actions`（Teleport 进共享页头的新建两颗钮那条；`flex: 0 0 auto`）`.explorer__btn` `.explorer__tree` `.explorer__input` `.explorer__error`。**`.explorer__tree` 的原生滚动条是藏掉的**（2026-10-13：`scrollbar-width: none` + `::-webkit-scrollbar { width: 0 }`），改由 `useOverlayScrollbar(rootEl)` 那条浮在行之上的滑块接手 —— 原生那条占 11px、出现 / 消失时整棵树跟着挪，见第 5 节坑 43。原 `.explorer__head` 已随页头上提删除（2026-10-11）；删除确认弹窗（Teleport 到 body，`z-index: 130`）：`.confirm`（遮罩）`.confirm__card` `.confirm__title` `.confirm__desc` `.confirm__path` `.confirm__actions` `.confirm__btn`（`--danger` 用 `--danger-bg` / `--danger-bg-hover` / `--danger-text`） |
| `FileTreeItem.vue`（style@395） | `.tree-item` `.tree-item__row`（高 24px、`touch-action: pan-y`）`.tree-item__arrow` `.tree-item__icon`（`.is-cpp` / `.is-python` / `.is-markdown` 三色字标）`.tree-item__label` `.tree-item__dot`（未保存圆点）`.tree-item__input`（内联重命名）`.tree-item__error`，以及行上的状态类：`--dir` / `--active`（选中，`--bg-hover`）/ `--dragging`（被拖，淡到 0.5）/ `--drop`（合法落点）/ `--muted`（打不开的文件）/ **`--pressing` · `--armed`**（2026-10-10 加，触屏长按的两段反馈，见下）。子容器 `.tree-item__children` 的 `::before` 是那条层级范围线（`--drop` / `--active` 时换成 `--tree-guide-strong`）；展开动画 `tree-children-*` 的时长写在样式里、高度由脚本钉成实测 px。**触屏长按两态**（由 `useTreeDrag.js` 的 `pressingId` / `armedId` 驱动，**鼠标路径完全不经过**）：`--pressing` 是「还在等」——整行底色当进度条，`background-color` 从透明走 450ms `linear` 到 `--bg-hover`，**这个 450ms 必须与 `LONG_PRESS_MS` 对齐，改一边就得改另一边**（两处都留了注释）；`--armed` 是「已经就绪（原地松手 = 弹右键菜单，继续移动 = 拖走）」——`tree-press-pop` 播一次（220ms，`scale(1) → 1.04 → 1`，只动 `transform`、播完不留形变），底色换成 `--bg-hover`（**不带投影** —— 2026-10-10 按要求去掉，就绪感只靠「底色保持 + 跳一下」两件事表达）并一直留到松手或真的开始拖（开始拖时 `useTreeDrag` 会清掉它，改由 `--dragging` 表达）。两条别踩：① 两条都写成「元素 + 类」的**双类** `(0,2,0)` —— 单类 `(0,1,0)` 压不过 `.tree-item__row:hover` 与 `--active:hover`，而**触屏浏览器常在按下那一刻就补一个 `:hover`**，写成单类的话进度条一上来就被悬停色顶掉、根本看不见；② `arm()` 里必须把 `pressingId` 一起清掉（两态互斥）——漏掉的话 `--pressing` 那条 450ms 过渡会跟着留在行上，松手时整行要比别的行慢一拍才淡回去 |
| `TestCaseCard.vue`（style@202） | `.card[data-status]` `.card__head`（flex、`gap: 8px`；徽标紧跟在标题后面，所以 **`.card__title` 必须带 `font-variant-numeric: tabular-nums`**（2026-10-24）：默认比例数字下「样例 1」比「样例 2 / 3」窄 1.8–2.1px，徽标列会逐张右移（实测 x = 81.58 / 83.34 / 83.69），开等宽后三张同在 83.73）`.badge[data-status]`（文字是 `verdict` 判定码，见第 5 节坑 1）`.metric` `.icon-btn` `.card__body`（上内边距 2026-10-24 深夜由 8 收到 4、再收到 0px、下 10px；卡片与样例之间已无 `::after` 分隔线，只靠留白） `.card__fold`（展开 / 折叠动画的外壳，**2026-10-06 新增**：grid 行高 `1fr ↔ 0fr` 过渡，正文的高度是活的、`max-height` 猜不出上限；折叠时正文的上下内边距也要收到 0，否则那 16px 不可压缩、卡片收不干净。原先 `.card__body` 上的 `v-show` 已删，改由 `.is-collapsed` 加 `visibility: hidden` 把正文移出 Tab 序） `.ta`（输入，高度随内容自增）`.out`（输出）`.icon-btn--danger`（删除，32×32 幽灵按钮，休眠 0.18）`.icon-btn--run`（运行，32×32 幽灵按钮，`aria-disabled` 而非原生 disabled；2026-10-24 晚起删除在左、运行在右，原先撑满中段的 `.run-zone` 已删除）。超长样例相关的 `.ta--truncated` / `.out.is-truncated`（只换底边为虚线，**只给真被截断的情形**，即 `xxxHidden > 0`；只是超出框高要滚动的那种字符一个没少，底边仍是实线）与 `.ionote` / `.ionote__text` / `.ionote__btn`（框下面那行提示：「还有 N 个字符未显示 + 复制全部」；**只在截断态出现** —— 纯溢出态一个字符都没少、没有「全部」可复制，这一行与虚线底边都不给；窄容器下靠 `.ionote:has(.ionote__btn)` 把输入框那行与输出块那行区分开）见第 5 节坑 26。框内的截断标记**没有文案**，就是 `MARKER_SEED = '\n\n……'`。**「结果待重测」在 `@container (max-width: 22.5rem)` 那一档换短称**（2026-10-24：全称五个字在这一档会和标题一起截断成「样…」；模板里 `.stale__full` / `.stale__short` 两份文案由容器查询切换，短称「待重测 / Stale」，完整解释留在 `title`；同档还给 `.stale` 加 `flex-shrink: 4` —— 先挤它、标题不让；`@container (max-width: 17rem)`（内容盒 272px）起整条 `.stale` 隐藏，把宽度还给标题 —— 界线是实测的：276px 内容宽短称还装得下、272px 标题与短称就开始一起折；staleness 由面板页头 ?/N 与卡片降透明度兜着，15.625rem 那档只保留间距收敛与提示行让位）。旧的 `.hint` 已随 2026-09-18 改动删除 |
| `EditorTabs.vue`（style@106） | `.editor-tabs`（`flex: 0 0 35px`）`.editor-tabs__strip`（`flex: 1 1 auto; min-width: 0`，**横向滚动在这里**，现在铺满整行）`.editor-tabs__item[--active]` `.editor-tabs__dot` `.editor-tabs__label` `.editor-tabs__close`（「设置」合成页签与文件页签共用这套样式）。原 `.editor-tabs__run`（64×25 的运行 / 停止按钮，以及它的 `.is-running`）2026-09-28 已随按钮一起删除。**页签互不描边**（2026-10-10 去掉原 `border-right: 1px solid var(--border-soft)`）：相邻页签之间没有竖线，三种态全靠底色 + 文字色区分〔**2026-10-19 改成 Chrome 风格，只动形状、颜色一个字没改**：页签 `border-radius: 8px 8px 0 0`（下沿仍齐平，不许四角全圆 —— 下圆角会在页签与编辑区之间露缝）；选中页签底角用 `::before` / `::after` 各补一只 8×8 的凹弧「脚」（`radial-gradient` 抠掉四分之一圆，`left/right: -8px` 画在盒子外面，`pointer-events: none`），于是它像从编辑区里长出来；md 模式下两只脚 2026-10-19 晚起也画（见下面的追加），触屏长按 `--pressing` / `--armed` 期间藏起来（整块底色已换成 `--bg-hover`，留着就是两块补丁）。**没有**加回分隔线，也**没有**新增颜色变量〕〔2026-10-19 追加（用户口径「下方有一条线，造成了类似阴影的效果」）：`.editor-tabs` 的 `border-bottom` 与条带上那条 `background-image` 底线**整条删掉**，`.editor-pane:not(.is-md)` 那两条「把线挪进条带」的规则一并删除。现在栏底 `--bg-panel-head` 与编辑区 `--bg-editor-pane` 直接相接、选中页签与后者同色，天然连成一片，不需要任何补线手段。is-md 与这条线无关，也不再管那两只脚（md 下照画）〕〔**2026-10-19 加：页签分组**（模仿 Chrome 的标签页组）—— 状态在 `services/tabGroups.js`（成员表 + 颜色/名字，落盘 `cp.tabGroups`；成员键是**节点 id**，改名/移动跟着走；watch openTabIds 随手 prune，空组即摘）。**连续性不变式：同组成员在 stripOrder 里必须连续** —— 加成员时 relocateIntoRun 挪到位，拖动落盘后 syncAfterDrop 归拢（拖出组 = 退组、拖进组旁 = 入组；EditorTabs 的 onStripDrop 在 moveStripItem 之后调它）。渲染三件事：① 芯片是组前一枚**独立的小方块 / 圆角矩形**（不是页签、不带 data-strip-id（2026-10-20 按用户截图改形：高 16 → 20px、文字水平 + 垂直双向居中——inline-flex center + 名字 span 加 text-align:center；圆角改过两次：先是 `border-radius: 999px` 两端全圆，**同日晚些时候二十三改统一成 6px**（用户口径「这部分的样式我想改为一个带圆角的矩形，当没有为他命名的时候」）—— 没名字的 20×20 圆角方块、有名字的 padding 0 9px + 整体 max-width 140px（名字 span 122px 省略号截断）现在同为 6px，`--chip--named` 上那份单独的圆角覆盖已经删掉，折叠 / 展开不换形状（探针实测：无名芯片展开与折叠都是 `20×20` / `border-radius: 6px`）。几何实测：芯片中心恰在条带 17.5px 处、名字中心偏差 0/0）；margin 由「左 8 / 右 4」改成**左右各 6px 对称**——用户随后指出「与左边标签和右边标签的间距不同」，芯片要居中于左右两格之间的空隙（实测 gapLeft/gapRight 均 6px）。〔2026-10-20 再追加（用户口径「药丸改成类似图片的样式」，确认是组头芯片）：**有名字的芯片不再染组色** —— base.css 新增 --group-chip-bg: #dadce0（从用户参考图逐像素取的中性浅灰，两套主题同值），字仍 --tab-group-text；未命名的小圆保留组色（没有文字，颜色是它唯一的身份，Chrome 同款）；组色退到描边 / 底线 / 折叠环上。〔2026-10-20 九改推翻本节：**命名芯片的底色改回组色** `--group-c`，`--group-chip-bg` 作废（用户口径「线和胶囊的颜色没有遵循选中的颜色」）；无名芯片也从正圆改成 20×20 的 6px 圆角方块（见 ①）〕。当版实测：named 芯片 bg rgb(218,220,224)、无名组色圆不变，两主题一致（九改之后 named 也吃组色，这组读数只作历史），useTabDrag 的落点数学只认 `.editor-tabs__item[data-strip-id]` 所以天然看不见它；⚠️ stripItems 的三支 v-if 里视图那支**必须是 `v-else-if`**——写成 `v-else` 会给芯片项渲染出一只空文案的幽灵页签，实测踩过）；② 组的区分样式**分段画在成员页签上**（`is-grouped` / `is-group-first` / `is-group-last`）（2026-10-19 深夜按用户截图二次改版：**不染底色** —— 一圈 `--group-c` 实色描边包住整段成员 + 底部 **2px 组色实线** `inset 0 -2px 0 var(--group-c)`，描边顺着组首左缘 / 组尾右缘经 `::before` / `::after` 凹弧（8×8 抠四分之一圆，与选中页签的脚同一画法、填组色）**外撇接住底线**，整段成员像从那条组色线上「长出来」—— 与截图里 Chrome 对选中页签的画法同构；组内选中页签维持自己本来的选中底色。**必须用 inset 阴影而不是 border-bottom** —— border 吃 2px 高度、会把页签从条带底部垫起来；页签是 stretch 撑满 35px 条带的，inset 线天然贴着条带下沿，相邻成员逐段接上即一条贯通的线（1400×900 无头像素扫描：粉线为单段连续、无缝隙）。描边走过三版：染色药丸 + 1px 混色细线（`--group-line` color-mix）→ 下沿换 2px 组色实线 → 按截图整段换成实色描边，`--group-line` 变量已删。折叠后整段消失，只剩芯片）〔2026-10-20 加（用户口径「修正展开标签页组的动画」）：**展开 / 折叠不走 TransitionGroup** —— 折叠成员是 display:none，TransitionGroup 记不到它们的位置（rect 全 0），一展开就给每张算出「从条带左端飞回来」的 move 补间，正是那段乱飞的动画。修法：toggleGroup 自己量宽度、用 Web Animations 逐帧改 width + padding + opacity（180ms，缓动与 .tab-move 同源），兄弟页签跟着 flex 逐帧重排滑动；动画期间组 id 记进组件内的 animatingGroups —— 模板据此**暂缓** is-group-hidden（否则动画开始前就被 display:none 拿掉），同一标志把 TransitionGroup 的 ：name 切成 tab-instant（无 -move 类）整段跳过 FLIP，两层动画不会叠加。三个时机坑：① 展开时元素还藏着量不到宽 —— 同一个任务里临时放出来量自然宽、随即压回 0（任务中间不绘制，看不见闪）；② 收尾必须「先清内联 → 再解除 animatingGroups 触发重渲染 → 最后 cancel 动画」，反了会露一帧全宽或宽度 0（清内联时 fill:both 还托着终态，那时不会跳）；③ 连点芯片先 cancel 上一次再重来。宽度收到 0 时内边距要跟着收（paddingLeft 10 → 0、paddingRight 7 → 0），否则盒子下限停在 17px。实测 1400×900：展开 0 → 99/97px 逐帧平滑、transform 全程 none（FLIP 已消失）、右侧页签 left 831 → 1027 连续；折叠 99 → 0 后 display:none 落下；终态内联样式清空、stripOrder 不变〕，组内选中页签**不画自己那两只脚**（「与线相接」的职责已由组的描边和撇脚接管）〔2026-10-20 深夜三改（用户口径「不要用高光以及外边框来区分标签组的标签，用下划线的方式来划分」）：**成员页签不再有任何组专属记号** —— 描边、外撇脚、分段圆角整段删除，选中/悬停/两只脚全部回到普通页签的规则（组内选中也照常画脚，上面的 display:none 例外随之删除）；唯一的视觉记号是底部那条 `inset 0 -2px 0 var(--group-c)` 2px 组色下划线，相邻成员逐段接成一条贯通的线。is-group-first / is-group-last 两个类仍打在模板上（结构信息，眼下无样式消费，别顺手删）。胶囊（组头芯片）同轮已按参考图改成中性浅底（--group-chip-bg #dadce0），组色只剩下划线与折叠环。实测 1400×900：computed boxShadow 仅 `rgb(group) 0 -2px 0 inset`、radius 回到 8px 8px 0 0，两主题一致〔2026-10-20 深夜四改（用户参考图：选中的成员被描边包住、从线上掀起来）：**组内选中页签**改为一圈组色描边 + 两端凹弧外撇脚（填组色），下划线在它脚下断开（box-shadow 三边版替掉带 -2px 的那条）；**不画** --bg-tab-active 底色与它的脚（内部就是条带底色，特异性 (0,3,0)/(0,3,1) 压过 --active 与 --active:hover）。⚠️ 这两只组色脚的特异性高过长按隐藏规则的 (0,2,1)，触屏长按要隐藏得用 :is(--pressing,--armed) 的 (0,4,1) 那条（已加）。普通（非分组）选中页签的画法不受影响〔2026-10-20 深夜五改（用户口径三连：「线的颜色应该和选中的标签页颜色相同」「展开之后才有下划线」「线的位置从胶囊起始」）：① 线与选中页签描边/撇脚的填色全部从 --group-c 换成 **--text**（选中页签的文字色）—— 参考图里线、胶囊、选中描边是同一个中性色，组色从此只剩折叠时芯片那圈环；② 胶囊去掉 overflow:hidden（文字截断由名字 span 自管），加 position:relative，用 ::before 在条带下沿补一段线（left:0 → right:-6px 跨过自己的右外边距接上首张成员），bottom: calc((20px - 35px) / 2) —— 两个常量绑定 35px 条高与 20px 胶囊高，改任一个要同步；③ 折叠时这条补线由 .editor-tabs__chip--collapsed::before { display:none } 关掉。实测（1400×900@2x 像素扫描，两主题一致）：条带内坐标下线从胶囊左缘 113 起、断在选中成员脚下 271–368、组尾 466 收；折叠后底行 0 个线色像素〔2026-10-20 深夜六改（用户口径「线的粗细应该处处相同」「选中的标签页脚部有个直角，不是曲线」）：① 组内选中的描边 1px → **2px**（inset 2px 三边），与下划线同粗；② 两只脚从「8×8 radial-gradient 填色三角」改成 **border 圆角弧**：8×8 盒子（box-sizing:border-box）只留一侧 2px 边框 + 对应下圆角（半径 8 = 盒宽，整段无直线段），外弧 8 / 内弧 6 的四分之一圆环 —— 粗细恒定 2px，上端接 2px 竖描边、下端水平接到下划线，无直角无楔形。4x 截图放大验证：脚为光滑等粗弧线；线在胶囊下 / 成员下 / 脚端量得均为 2px；③ 右键菜单（ContextMenu 通用件）文件页签给「添加到新标签页组 / 从标签页组中移除 / 关闭」、视图页签只给关闭；**onMenuSelect 选中即收菜单**（留着会吞掉下一次按下，实测拖拽没起手）。卡片 `TabGroupCard.vue` 点芯片弹出：命名 / 换色（`--group-*` 色板，两套主题同值）/ 在组内新建 / 关闭组 / 取消分组；「将分组移至新窗口」没有对应物，不做。**给其它功能的创建入口**（2026-10-19 晚加：抽题按题目归组 / 批量导入圈文件这类需求走它们，别直接 push `tabGroups.groups` 或写 `memberOf`）：`groupTabs(tabIds, {name, color})`（建组 + 一次收编一批，成员按传入顺序连续排在「第一个有效页签」原位）、`createGroupWithTab(tabId, {name, color})`（右键菜单那条，一元情形）、`addTabsToGroup(tabIds, gid)`（收进已有组、顺带展开）、`findGroupByName(name)`（重复导入先找再补）。约定：成员必须**已经开成页签**（先 await createFile / openFile）；视图 id、没开的 id、重复 id 静默丢掉；没有有效页签时返回 null / 0 且**不建空组**（空组在条带上无处渲染，prune 也会摘掉它）；从别的组移走之后旧组空了当场 prune。建组内部的落位用 moveAfter（不能直接传「prev 下标 + 1」——moveStripItem 的下标是去掉被挪项之后的，被挪项原本在左时 prev 会前移一位）〔2026-10-19 又追加（用户口径「左键点分组 = 展开 / 折叠，右键才是菜单」）：**折叠只动渲染** —— 组对象加 collapsed（随 cp.tabGroups 落盘，旧档缺省当展开）。成员页签**留在 DOM 与 stripOrder 里**、只加 is-group-hidden（display:none）：拖拽的下标数学建立在「DOM 顺序 == stripOrder」上，摘出序列必错位；代价是 useTabDrag 的 rectOf 要给隐藏页签借**芯片**当替身矩形（芯片画在组左缘，指针压过芯片左半 / 右半即「组前 / 组后」，落点仍准，实测指示条与落位一致）；onTabPointerDown 的「只剩一张别拖」相应只数**可见**页签。另外两条配套：折叠组的成员**不参与「拖到旁边即入组」**（syncAfterDrop 经 joinableGroupAt 对折叠组返回 null —— Chrome 同款，拖到折叠组边上只是排在它旁边，实测 ccc 拖到芯片左没有入组）；反过来**往折叠组里加页签会顺手展开**（addToGroup 置 collapsed=false，否则页签凭空消失）。芯片左键 toggleCollapsed、右键才弹卡片（openGroupCard 挂 @contextmenu.prevent）；折叠后若藏着的正是当前打开的文件，芯片外套一圈组色环（--holds-active，两道 box-shadow 叠出「条带底色垫层 + 组色环」，两主题已实拍）—— 没有这圈环，「编辑区开着这个文件、条带上却找不到它」〔**十七改追记**：折叠路径的焦点已改「转走 / 全折叠清空」，这圈环在正常折叠下不再出现，只兜底「刷新后焦点从 cp.activeFile 复原到折叠组成员上」这类没经过折叠动作的残留〕〕〔2026-10-19 再追加（用户口径「把 .md 编辑区域页头那条工具栏改为与编辑区同色」）：`.editor-pane__bar` 的 `background` 由 `--bg-panel-head` 改成 `--bg-editor-pane`，于是「选中页签 → md 工具栏 → md 预览」是一条连通的同色面；原先 `.editor-pane.is-md .editor-tabs__item--active::before/::after { display: none }` 那条例外随之删除，**md 页签的脚与普通页签一致**。工具栏自己那根 `border-bottom: 1px solid var(--border-soft)` 保留（现在它是工具栏与正文之间唯一的断句）。⚠️ 别再让 is-md 参与任何「页签栏挂件」的显隐〕 —— 静止「透明底 + `--text-dim`」/ 悬停 `--bg-tab-hover` / 选中 `--bg-tab-active`；`border: none` 必须留着 —— 全局 `button` 样式带着边框，删掉会露出系统描边。**悬停与选中都是底色**（2026-10-10 定稿；同日先后走过「下沿一条 1px 细线」「细线上浮到顶端变蓝」两版，两版都已删净 —— 页签上不再有任何会移动的东西）：点选看见的动画就是基类那两行 `transition: background-color / color 150ms` 上的底色淡入（顺带文字转亮）。三条别踩：① `.editor-tabs__item--active:hover` 那一条**不是冗余** —— `:hover` 按类级计 `(0,2,0)` 高过单写 `--active` 的 `(0,1,0)`，少了它，鼠标停在当前页签上会被涂成悬停色；② 两套主题的**方向相反、而且是有意的**（浅色比栏底压深 6 阶 `#f3f3f3 → #ededed`；深色比栏底**提亮** 6 阶 `#222225 → #28282b`）—— 深色里再压暗会被读成「凹进去」，还会与选中色 `--bg-tab-active`（`#181818`，同样比栏底暗）撞成同一类；浅色里反过来「提亮等于没有」。取值与理由都在 `base.css` 那两条注释里，**别再以「两套主题该同构」为由把任一支翻回去**（用户为此来回改过一次）。〔2026-10-10 更正：这里原先写的是「两套都是压深、深色 `#1c1c1f`」—— 那是 `5a9fe06` 把它改成提亮之前的旧值〕；③ 悬停底色是**不透明**的（2026-10-19 起条带底下那条 1px `--border-soft` 已整条删掉 —— Chrome 的页签条没有分隔线，而它在浅色下被读成「页签栏投下来的一道阴影」；原先「把线挪进条带、让不透明页签盖住它」那套机制随之作废）。**拖动排序**（2026-10-10 加；**2026-10-11 改成混排**）：按住页签横向拖，松手换位 —— 手势与落点判据全在 `composables/useTabDrag.js`（只认统一的 `data-strip-id`，**不再区分文件 / 视图**，两类可在一条序列里互相穿插），壳只提供根元素、转交 `@pointerdown`、渲染拖拽态。混排之后两条新纪律：① 顺序权威是 `services/tabStrip.js` 的 `stripOrder`，本组件**不管顺序怎么算**、只按它渲染（渲染单元是单个 `template v-for` + `v-if` 两分支的文件 / 视图分支，不再是「文件 `v-for` + 视图 `v-for`」两段）；② 预览页签被顶替时量旧格宽度要按 `[data-strip-id="<id>"]` 找元素，**不能**再用 openTabIds 的下标去 strip.children 上取（视图页签插在中间后两个下标不再对齐）。三个类：`.editor-tabs__item--dragging`（被拖那张，留在原位压暗 0.4）、`.editor-tabs.is-dragging`（根容器，抓取光标 + `user-select: none`，并靠 `.editor-tabs.is-dragging .editor-tabs__item:not(.editor-tabs__item--active):hover` 把沿途页签的悬停底色压回透明 —— **`:not` 不能省**，那条特异性 `(0,5,0)` 高过 `--active:hover` 的 `(0,2,0)`，不排除会连当前页签的选中底色一起抹掉）、`.editor-tabs__indicator`（插入指示条，**根容器的直接子元素**、`position: absolute`、2px `--focus` 竖线，`left` 由 JS 写成相对根容器左缘的 px）。两条别踩：① 指示条**不能放进 `.editor-tabs__strip`** —— 那是横向滚动容器，放进去得再补一个 `scrollLeft` 且自动滚动每帧重算，两个偏移量必然对不齐；② 拖动中**不改 `stripOrder` / `openTabIds`**，只在松手那一刻提交（中途改会让被拖那张也吃一次 `.tab-move` 补间），落盘走 `tabStrip.moveStripItem(id, insertIndex)`（由它分部写回 openTabIds 与 viewOrder），`insertIndex` 是「**去掉被拖项之后**」的下标。**触屏适配**（2026-10-10 补，用户报「拖动标签页没有对触摸屏做适配」—— 手势状态机本身没坏，缺的是下面三件**只在真机上现形**的事）：① **页签上的三条声明** —— `touch-action: pan-x`（**不能写 `none`**：条带是横向滚动容器，写 none 之后手指在页签上就再也滚不动页签条；也不能用这条来「按住不滚」，那是 `useTabDrag` 非被动 `touchmove` 的活）、`user-select: none` / `-webkit-user-select: none` / `-webkit-touch-callout: none`（长按起手那 450ms 里不许选中标签文字 —— iOS 一旦进入选词就会连 callout（放大镜 + 菜单）一起弹出来，拖拽当场变成选词）。与文件树行 `.tree-item__row` 的 `touch-action: pan-y` 同源、方向相反；② **`contextmenu` 从按下那一刻就接管**（`useTabDrag` 的 `onContextMenuBlock`）—— 各家系统长按菜单的阈值大多在 500ms 上下，与这 450ms 贴得太近，等 `arm()` 再拦晚了一步（菜单会在拖拽中途弹出来、还要等下一次点击才关掉）；非被动 `touchmove` 也一并**提前到按下时就挂**，但只在 `armed / dragging` 时 `preventDefault` —— 早挂是因为「浏览器在 touchstart 那一刻就决定了这次手势要不要等 JS」，**挪回 armed 再挂就不保证拦得住**；而没 armed 时不拦，所以「短滑滚页签条」照旧是原生横滚（第 8 节触屏专项第 2 条守着这条）；③ **长按两段反馈** `--pressing`（450ms `linear` 底色进度 → `--bg-hover`）/ `--armed`（`tab-press-pop` 弹一次、底色保持到松手或开始拖），与文件树同款。**用 `--bg-hover` 而不是页签自己的 `--bg-tab-hover`** 是实拍量出来的：那一档只比栏底差 6 阶、进度走到一半实测只有 3 阶，等于没有反馈；也不能用 `--bg-tab-active`（深色下方向相反，还会被读成「这个页签被选中了」）。这两条必须写成「元素 + 类」**双类** `(0,2,0)` 并排在 `--active` **之后**：触屏浏览器常在按下那一刻补一个 `:hover`，单类会被 `--active:hover` 顶掉（长按当前选中那一张时进度色会整个被顶掉），同为 (0,2,0) 靠源序取胜。⚠️ **这三条在无头探针里一条都测不出来**：`Input.dispatchTouchEvent` 那类合成事件不跑浏览器的手势识别器（`contextmenu` / `selectstart` 永不触发、触屏那份 `:hover` 也不补），只能靠「派发 `cancelable` 的合成事件看 `defaultPrevented`」或上真机 —— 见坑 30 与第 8 节触屏专项〔**2026-10-20 深夜七改（用户口径「显然与我给的示例不同，重新规划如何画线」，按最新参考图重画）**：组内选中那张改成「**填充 + 描边 + 圆环脚 + 挖缺口**」——① 底色从 transparent 改填 `--bg-tab-active`（参考图实测选中成员内部比条带底色亮一档：#4b3538 vs #2d1a1c，即 Chrome 的激活页签色）；② 脚重画为 8×8 盒子（位置 `left/right: -8px; bottom: 0` 不变）上的**两层同轴背景**：第 1 层 `radial-gradient(circle at 0 0, transparent 0 6px, var(--text) 6px 8px, transparent 8px)` 画内 6 外 8 的等宽 2px 圆环（上端竖直接住页签描边、下端水平接住线），第 2 层 `transparent 0 8px, var(--bg-panel-head) 8px` 把外半径以外的角区涂成条带底色——**盖掉底下成员画到脚下的那 2px 线**，参考图里线在距描边约 9px 处就收住、由弧拐进页签，不是怼到描边上的（旧版线画到描边才停、与弧叠成一坨，扫描实测线段 [345,785] 贯通）；③ 页签抬 `z-index: 1`：脚与挖缺层是本页签的伪元素、要盖到**左右邻居成员**的线上，z-index:auto 时按 DOM 序后面的右邻成员反而压住伪元素，右侧缺口失灵（实测踩过）；`--armed` 的 2 仍在它之上；④ 组尾成员不画右脚（`.is-grouped.is-group-last.editor-tabs__item--active::after { display: none }`——右边没有线可接，描边右竖边直落条带底收方角）。深浅两主题 ×「中间成员 / 组尾成员」两状态实测：线恒 2px、两侧缺口对称、组尾右缘方角、圆环粗细均匀〔**2026-10-20 深夜八改（用户局部截图：描边与脚弧分叉）**：竖描边改用**背景渐变**画、在弧顶收住 —— 旧版三边描边是 inset box-shadow，竖边只能通到盒底，而脚弧只有 8px 高，描边在弧起点以下继续直落、跟向旁边弯走的弧分叉成两笔中间漏暗缝（用户截图逐行扫描实测：竖边 [44,47] 通到 y=43、弧 [39,42] 与它之间隔 1px 暗缝）。现 `background-image` 三层 linear-gradient（左 / 右竖边 `background-size: 2px calc(100% - 8px)`，顶边 `100% 2px`），左右竖边正好停在 `bottom-8px` 即弧顶，往下由圆环脚接管。**连带回归**：旧 active 块的 box-shadow 顺带压掉了基类 `.is-grouped` 的 `inset 0 -2px` 下划线，改成背景渐变后忘了清，选中成员脚下重新出现断线 —— 必须 `box-shadow: none` 显式清掉。组尾成员右竖边没有弧接管，单独恢复 `background-size: 2px 100%` 通到盒底收方角〔**2026-10-20 深夜十改（用户口径：「不要零散的 CSS border，用 SVG 画 Chrome 原生 Tab Group 的连续包络线」，并给出完整路径指令）**：整条组线改为一个盖在条带内容上的 SVG 图层（`.editor-tabs__gline`，absolute / pointer-events:none / 随条带滚动，宽度 = 测量值，须盖住最右外扩脚）统一绘制 —— 七改 / 八改那套「成员 inset 下划线 + 选中成员背景渐变描边 + 两只 radial-gradient 圆环脚 + 挖缺 + z-index」**整段删除**，成员页签回归与普通页签完全相同的规则（含 `is-grouped` 基类的 box-shadow 下划线、选中页签的 `z-index:1` 都不再需要）。画法：几何全部由 `measureGroupLines()` 现场量 DOM（成员 `offsetLeft` 以条带为定位祖先 = SVG 内容坐标）；无激活成员时一条 path 画 `M x0 H-1 L x1 H-1`；有激活成员时按用户给的指令画连续包络：水平线 → `A r r 0 0 0` 左下外扩脚（圆心 (left-r, H-1-r)）→ 竖边 → `A r r 0 0 1` 左上圆角（圆心 (left+r, 1+r)，与页签 8px 顶角同心同径）→ 顶边 → `A r r 0 0 1` 右上圆角 → 竖边 → `A r r 0 0 0` 右下外扩脚 → 水平线到组尾（激活成员是组尾时右脚落地即终点、不回画）；r=8、线宽 2px、色 = 组色。〔2026-10-20 二十四改（用户报「标签页组里绘制的线，最右侧为直线的时候，如果选中了组右边的一个标签，线会挡住它左下角的圆角」）：**右端为直线时若右邻页签是选中态，x1 内收 r（8px）**—— 邻签那只 `left: -8px` 的左下外扩脚正压在 [x1-8, x1] 上，2px 宽的线会把弧的下沿削平；收到 x1-8 正好停在弧与底边的切点（圆心 (x1-8, h-8) 在 (x1-8, h) 处切线水平），线尾与圆弧相切、不交叉也不留缝。判据在 `measureGroupLines` 的 `straightTail`：只认「选中页签左缘与 x1 重合（±1.5px）」，组尾与下一个芯片之间隔着芯片的 6px 外边距，那种情形不剪（**「必须选中」这条已被二十五改去掉、整条判据已被二十六改去掉**，见下）。探针实测：组线 `M 6 34 L 127.59 34` = 邻签左缘 135.59 − 8；组内选中时仍走原路径（末段直接收在脚上）。〕〔2026-10-20 二十五改（用户口径「如果右侧为直线，无论是否邻页签是否选中，都收短线尾」）：把二十四改里「右邻必须选中」这条前置去掉 —— **右端为直线时，只要紧挨组尾右缘的是一个页签（选没选中都算），线尾就内收 r**。动机是不让线尾跟着右邻的选中态跳那 8px：那格空档恰好是右脚在选中时占的宽度，于是切换选中时线尾位置不动。判据仍是几何、不猜 DOM 相邻（`straightTail(end, floor, members)` 遍历所有可见页签的左缘，容差 1.5px，排除本组成员与零宽元素），所以**组尾后面跟的是另一组芯片（6px 外边距）或什么都没有时照旧 flush** —— 那里没有圆角要露，收了只像线没画到头。实测（1280 宽，组 1 个成员 + 右邻一个页签）：右邻未选中与右邻选中两种状态的末段一字不差 `… L 249.203125 34`（x1 = 257.203125，内收 8）；把右邻也建成组（其后只剩芯片）时两组都 flush（`L 257.203125 34` / `L 413.03125 34`）；组内成员选中时仍走原包络路径。`npm run verify` 基线不变。〕〔2026-10-20 二十六改（用户口径「无论右边有没有页签，都缩短这个线尾」）：把二十五改里「紧挨组尾右缘的是一个页签」这条前置也去掉 —— **右端为直线就一律内收 r（8px）**，不看右邻是谁、有没有。`straightTail(end, floor)` 现在只是一句 `Math.max(end - GROUP_LINE_R, floor)`，那份「遍历所有可见页签左缘、容差 1.5px、排除本组成员」的 `tabLefts` 因无人使用整段删除（别为了「只在需要时收」把它加回来：二十五改的实测已表明三种右邻情形落点不同会让线尾跳）。收益是线尾只由组尾自己决定，右邻选中 / 未选中切换、换成另一组芯片、条带最末无人，三种情形落点一致；代价是二十四改说的「组后只剩芯片时 flush、否则像线没画到头」不再成立 —— 用户看过这两种情形后仍要求一律收。有激活成员那条分支的末段同样走收口（floor 仍是 `right + r`，短路到零长时不画多余线段）。〕两只脚的楔形区域另用一条 path 填 `--bg-tab-active`（页签盒子外面那 8px，元素自己的底色盖不到）。**重算时机**：MutationObserver 监听条带子树（childList + subtree + attributes + characterData）统一调度、rAF 合帧 —— 页签宽度变化源太多（改名 / i18n / 图标 / active 类）逐个 watch 必漏；展开 / 折叠动画是 WAAPI 逐帧改宽（不走内联样式、MO 看不见），`animatingGroups` 期间另挂 rAF 逐帧量；resize 兜底。**踩坑**：① 芯片注释块在九改编辑时丢了收尾 `*/`，postcss 「Unexpected }」让整个模块 500、应用起不来 —— 探针表现为 waitForSelector 空等，**要看 vite 的 pre-transform error 才能定位**；② SVG 是 TransitionGroup 的静态子元素，必须给固定 key（`group-lines`）〕〔**2026-10-20 十一改**：拖拽从「竖线指示条 + 松手才换位」重构成 Chrome 原生的**实时横向让位**（`useTabDrag.js` 重写拖拽段，用户给的完整规范）。① 拖拽期间 DOM 顺序不动，`collectUnits` 把条带可见单元（页签 + **分组芯片**，display:none 的折叠成员按组归档）盘成一份虚拟序列，`layoutTargets` 按边距盒首尾相接摆槽位，差值 `translate3d` 写元素：被拖页签无过渡逐帧跟手（`--dragging` 关过渡 + z-index 100），其余单元由 `.is-dragging` 规则给 `transform 200ms cubic-bezier(0.2,0,0,1)` 滑过去。② 换位判据 = 被拖页签中心越过相邻**槽位**的中线，中线按换位后目标位置算（用当前位置会自我反馈、来回横跳）。〔**十六改**已换成「前导边缘」判据 + 方向门控，见本节末；「中线按槽位算」这条不变〕③ 松手 `commitIndex` 把虚拟序列换算回全表下标（芯片展开成它藏的折叠成员）→ `onDrop` → `moveStripItem`；`settle()` 在 nextTick 从各元素**当前视觉位置**用 150ms ease-out 的 WAAPI 补到新车位（就位差 0 自动跳过），Esc / pointercancel 同一出口但不提交、原地回弹。④ **钳制必须用可视条带（scrollLeft ~ scrollLeft+clientWidth）而不是内容总宽**：内容总宽的右缘 = 最后槽位的中线，严格大于永远差 1px 触发不了（宽度不等时向左拖同理卡死）—— Chrome 的做法是允许拖进右侧空白区，溢出时靠边缘自动滚动扩行程。⑤ **拖拽期间 TransitionGroup 必须切 `tab-instant`**（name 条件加 `draggingId`）：gline 测量每帧更新 refs → 组件每帧重渲染 → TransitionGroup 每次 update 拿旧位置缓存对比当前 rect，被 JS transform 挪开的页签被它当成列表重排、倒放 `.tab-move` 把跟手位移整个抢走（实测 bbb 被拉回 8.9px）。⑥ 包络线跟随：`measureGroupLines` 改用 `getBoundingClientRect` 换算回条带内容坐标（带着 transform，拖拽 / 让位中途 / WAAPI 动画的视觉位置全部实时反映），`draggingId` 期间挂 rAF 循环逐帧量。⑦ 指示条（`.editor-tabs__indicator` / `indicatorX` / `resolveDrop`）整条删除〕。〔2026-10-20 十二改，用户报「拖拽时顶部的线条不显示」「松手动画不自然」，顺藤摸出一只更深的渲染循环：① **包络线抬层**：`.editor-tabs__gline` 原 z-index auto、靠 DOM 序压在页签上，被拖页签 z-index 100 把画在自己身上的顶边 / 竖边全盖住 —— 抬到 **101**（仍 pointer-events:none）。② **settle 残差口径**：原在提交重排之后量 `rect.left - offsetLeft`，量到的是「旧内联位移」而非「提交前视觉位置 − 新车位」，松手那帧先跳「新车位 + 旧位移」再滑回；改为**提交前**按元素记视觉位置快照（finishDrag 里），settle 用「快照 − 提交后自然车位」补间（useTabDrag.js）。③ **gline 测量自增长反馈**：`maxX` 原以 `strip.scrollWidth` 为底值，而 SVG 是条带子元素、scrollWidth 把 SVG 自身宽度算进去 → `glineWidth = scrollWidth + 1` → SVG 变宽 1px → 下次测量再 +1，每测一次宽 1px；改从**元素几何**取右缘（无组时 0）。④ **测量签名防抖**：`groupLines` 每次赋新数组都触发重渲染，TransitionGroup 的 onUpdated 又往条带 append/remove 探测克隆（hasCSSTransform）喂回 MutationObserver → 每帧重渲染永动（实测 1.2s 内 754 次 childList 变更）—— 增加 `glineSig` 签名比对，几何没变不写 ref。⑤ **FLIP 期间跳过测量**：挪位（.tab-move）进行中几何每帧都在变，量了就写 ref → 重渲染 → onUpdated 搅动这轮 FLIP（callPendingCbs / 重设 transform）→ 几何再变 —— 实测把 180ms 的挪位拖成永不收敛的亚像素蠕动、FLIP 的 CSSTransition 卡在 currentTime 0 永不出第一帧（建组后页签与芯片互相重叠 5 秒不止）；scheduleGroupLineMeasure 见 `.tab-move` 即跳过，摘类那一刻的 DOM 变动会再调度一次终态测量。回归实测（探针 /tmp/gline-fix）：FLIP 155ms 收敛到自然位、停后 childList 增量归零；拖拽顶线可见（gline 101 > dragging 100）；松手提交帧零瞬移、单调滑入；`npm run verify` 基线不变（A/B/C/D/F 绿，E/G/H 既有红）。〕 |。〔2026-10-20 十三改，用户需求「拖拽的移动边界限制（Clamping）+ 拖入 / 拖出分组的交互逻辑」：① **边界钳制**本就有（updateDrag 把被拖页签钳在可视条带内 scrollLeft ~ scrollLeft+clientWidth−span；本项目条带无固定页签区、无「+」按钮，两端即全部可拖区，注释已按需求口径补记）；② **扁平槽位模型**本就有（虚拟序列 = 页签 + 芯片混排一维列表，单元自带 gid）；③ **拖入 / 拖出的实时归属**：useTabDrag 维护 `drag.gid`（被拖页签的实时归属，初始 = 真实归属），经 `liveGroup` ref 喂给 measureGroupLines —— 包络线按实时归属画（拖进哪组线当场拉长包裹、拖出线当场收缩），DOM 上的 data-group-id 一概不动，松手才随下标一起提交（onDrop 第三参），EditorTabs.onStripDrop 据它结算成员关系（拖出 = removeFromGroup、拖进 = addToGroup）并调 tabGroups.removeEmptyGroups 摘掉被拖空的组（拖拽期间空组的芯片故意保留，反悔拖回还能吸入）。判定锚在**被拖页签自己的边缘**而不是中心 —— 页签比芯片宽得多，邻位停放时中心早就越过芯片的任何固定线，中心判据会在起拖瞬间误触发（顺带修掉了旧实现「与芯片相邻的页签一起拖就瞬移到芯片另一侧」的潜伏 bug）：从左拖入 = 右缘压上组首成员左缘再深入 12px（空组退化为右缘完全越过芯片），成为组内第 1 个成员；从右拖入 = 左缘越过组末成员右缘往左 40% 页签宽，并入组尾；右拖出 = 左缘越过「组剩余部分右缘」20px（脱离阈值）；左拖出 = 右缘收回到芯片中线以左，并排到芯片左侧；两阶段退出 = 先退组（包络线收缩）再与外部单元普通换位；视图页签不参与分组；折叠组是一整段槽位，拖过只换位不吸入。探针 /tmp/g13 十八项断言全过（A 钳制 ×2 / B 左入 ×3 / C 右入 ×2 / D 右出 ×3 / E 左出 ×3 / F 空组销毁 ×2 / G Esc ×1 / H 折叠 ×2）。〕 〔2026-10-20 十四改，用户给「激活态自动转移」状态机三需求，全部落地：① **按下即获焦**：页签 `pointerdown`（`EditorTabs.onTabPointerDown` 包装层）瞬间 `activateNow`（`activate` 拆出免抑制版本 —— pointerdown 时机在拖拽开始前，绝不能吃掉拖拽收尾 300ms 的 click 抑制窗口），不等 click / 拖动阈值；豁免两条：中键（button 1，关页签不抢焦）与 `target.closest('.editor-tabs__close')`（× 上按下不抢焦 —— 注意 × 平时 `pointer-events:none`、hover/active 才 auto，**真实鼠标必先 mousemove 触发 hover**，target 才会是 ×；合成事件不经 mousemove 直接 press 会打在页签本体上，探针必须先派 mousemove）。视图页签（设置 / 抽题）同款按下获焦走 `onViewPointerDown` → `viewMeta.activate`（另一条激活轴，不碰 `setActiveTab`）。包络线靠既有 MutationObserver 在 class 翻转时即时重绘（探针实测按下瞬间 stroke path 已包住被按页签）。② **折叠组焦点转移**：`toggleGroup` 在 `toggleCollapsed` **之后**调 `transferFocusOutOfGroup(gid)`（`isHiddenTab` 吃刚翻面的 collapsed 标志）—— 焦点在组内才动，anchor 传组内第一名成员的 `stripOrder` 下标；全折叠（一张可见页签都没有）**不转移**，activeId 留在被折叠页签上、芯片 holds-active 环提示（置 null 会让「编辑区开着文件、页签栏无激活态」，比现状糟）。〔**十七改已推翻**：全折叠改为清空焦点 + 记 lastActiveTabId 展开恢复，见本节末〕③ **关闭激活页签复用**：寻址抽成公共方法 `tabGroups.findNextVisibleTab(anchorIndex, excludeId)`（stripOrder 上「含 anchor 向右、不含向左」，可见 = 文件页签 + 还开着 + 不在折叠组）；`workspaceStore.closeTab` 的焦点回退改成注入点 `closeFocus.pick`（tabGroups 模块加载时注入 —— 可见性判据在那边，反向 import 会成环），pick 返回空才退回「原下标顶上来」老行为，**全部关闭路径**（× / 右键 / 中键 / closeGroup）统一生效。回归实测：探针 /tmp/g14 共 21 断言全过（按下获焦 ×5 + 豁免 ×3 + 折叠转移四态 ×5 + 关闭复用 ×3 + 前置/清理 ×5）；verify 基线不变。〕 〔2026-10-20 十五改（用户发五模块自查单，逐项复核后修三处）：① **松手后包络线冻结**：让位（200ms）与 settle 回弹（150ms）都在 draggingId 归零**之后**才跑，而 glineTick 循环以 `draggingId` 为续跑条件 —— 松手即停，包络线冻在动画起点几何上，页签滑完它也不跟（要等下一次无关 DOM 变动）。修：watch(draggingId) 归零分支设 `glineSettleUntil = now + 350ms`，循环条件追加该窗口（实测松手后 250ms 内 4~5 个 path 形态、末两帧收敛）。② **条带左缘裁切外扩脚**：strip 无水平内边距，组芯片顶到最左时包络的左外扩脚要伸到 x = 芯片左缘 − 8，被 SVG 视口（x<0 直接裁）与滚动容器一起裁成平角。修：`.editor-tabs__strip` 加 `padding: 0 9px`（r=8 + 描边 1px；条内所有坐标数学都以 padding 盒为原点，加 padding 不动相对关系，探针实测芯片顶格时 min x = 15 ≥ 0）。③ **× 上按下仍会起手拖拽**：pointerdown 包装层只豁免了激活、dragPointerDown 照跑 —— 按住 × 横移会拖走页签。修：两个包装层（文件 / 视图页签）在 target 命中 `.editor-tabs__close` 时连拖拽起手一并跳过。其余自查项核实达标：被拖页签 `transition:none` + will-change（类挂载卸载，无内联残留）、其余单元 200ms cubic-bezier(0.2,0,0,1) 让位、碰撞用换位后槽位中线（天然有邻签宽度的防抖带，交界处停住不抖）、settle 清内联 transform、两阶段退组 20px、空组拖拽期间保留芯片松手销毁、折叠转移先右后左跳过一切折叠组。**两条与清单字面冲突、维持现状（都有用户此前拍板 + Chrome 同款佐证）**：无激活时包络 = 底部直线**从芯片画到组末**（十改口径，非「徽章宽度」）；折叠组**不画**任何线（用户口径「展开之后才有下划线」）。⚠️ 顺带实锤一条探针口径：g13 的 B0 在十四改后必然变化 —— dragFrom 以 pointerdown 按在 bbb 上起手，按下即获焦把 bbb 点亮，组末激活时包络以右脚收尾（dEnd = 组末右缘 + 8），探针期望已同步。回归实测：g13 18/18、g14 20/20、新自查探针（/tmp/g14/foot.mjs）5/5。〕〔2026-10-20 十六改，用户报「拖拽换位手感偏迟钝」，要求改成「移动方向上的前导边缘越过相邻槽位中线」并补防抖。① **判据**：向右 `drag.visual + width > 右邻槽位中线`、向左 `drag.visual < 左邻槽位中线`（`visual` = 被拖页签的视觉左缘，含跟手位移；槽位坐标一律取 `layoutTargets` 现摆的目标位置，不读正在播 200ms 让位过渡的 `getBoundingClientRect`）。等宽相邻时行程从 1.0w 降到 0.5w（实测 bbb 拖 52px 即换位、邻签宽 100.45；旧判据要 101.4）。与分组芯片的换位同样改用前导边缘，两个方向共用一条公式，原先「向右看右缘、向左看中心」的二分支删除。② **方向门控**（`dir` = 本帧指针 clientX 增量，用 `drag.lastPointerX` 单独存 —— `press.lastX` 在 onPointerMove 里每帧先被覆盖，不能拿来比）：`dir > 0` 才查右缘、`dir < 0` 才查左缘、`dir === 0` 两侧都不查。没有它必乒乓：前导边缘判据触发的那一刻，另一侧边缘**恰好等于**新邻居的中线（触发点 dragged.left = 原槽位左缘 + 邻宽/2，换位后新邻居占原槽位、中线同值），于是任何一点反向位移都会立刻换回来。探针实测：按住不动 400ms 不换回、继续同向 1px 不换回、反向 6px 立刻换回（反向 3px 时还差 1px 没越过 —— 平衡位就卡在中线上，这也是「必须按方向判、不能靠留余量」的原因）。③ **自动滚动兜底**：指针不动时 `dir` 退化成「被拖页签在内容坐标里的位移」（`drag.visual - prevVisual`）—— 不兜底的话，贴边自动滚动时页签在动却不换位。④ **起手不误触**：`drag.visual` 初始化为 `dragged.left`、`lastPointerX` 初始化为 null，第一帧 `dir = 0`；邻位停放时两条前导边缘都离相邻中线有半张邻签的余量（芯片同理，旧实现「与芯片相邻就瞬移」的 bug 没回来 —— 探针专门断言起手瞬间零让位）。⑤ 顺带纠正一条失效论据：原文「不能钳在内容总宽里 —— 最后槽位的中线恰好等于内容右缘，中心永远差 1px」是中心判据的推论，前导边缘判据下不成立；钳可视条带的理由改成「按内容钳会让页签被推到条带外，而指针没贴边、自动滚动又不触发」。探针实测：等宽页签（/tmp/t16/probe.mjs **15/15**：右 52 / 左 52、双向门控、回拉、落盘顺序、194px 长页签对 102.5px 邻签行程 52px 与被拖宽度无关）、折叠组芯片（/tmp/t16/chip.mjs **6/6**：起手零让位、行程 18px ≈ 起手左缘到芯片中线 16px、按住不乒乓、松手 ccc 排到芯片前）。〕〔2026-10-20 十七改，用户报「折叠唯一可见的组后，焦点仍留在被隐藏的文件上，编辑区还开着它、页签栏里却找不到」（状态幽灵化），并给策略：全折叠就清空焦点 + 组上记 lastActiveTabId、展开时恢复。① **全折叠兜底**（`EditorTabs.transferFocusOutOfGroup`）：`findNextVisibleTab` 返回 null 时，把 activeId 记进组对象的 `lastActiveTabId`（随 `cp.tabGroups` 落盘；load 时非字符串丢弃），再 `clearActiveTab()`（workspaceStore 新导出，与 setActiveTab 对称，组件不直接写 store 字段）—— EditorPane 的 activeId watch 收到 null 会 `setModel(null)`，`.editor-pane__empty`（「未打开任何文件」占位）随即露出。十四改「不转移、靠环提示」的口径就此推翻。② **展开恢复**（`restoreFocusIntoGroup`，toggleGroup 的展开分支调）：仅当全局 activeId === null 才还焦点 —— 优先 `lastActiveTabId`（已被关掉 / 摘出组则退组内第一名成员），且走 `activateNow`（合成视图盖在编辑区上时先让开，否则文件回来了仍被挡着）；activeId 有值一概不动。**lastActiveTabId 只在全折叠兜底里写**，普通转移路径不写（探针断言过）。③ **连带必须改的一处**：EditorPane 原来 `editorEmpty = !activeNode && !anyViewOpen` 控制页签栏的 v-show —— activeId 清空后整条页签栏会连同那枚唯一能点开分组的**芯片**一起消失，恢复路径永远走不到（探针实拍：芯片 rect 0×0、page.click 直接 not clickable）。改成 `stripEmpty = !openTabIds.length && !anyViewOpen`（改名 + 语义变化，理由写在 EditorPane 注释里；editorViews.js 那条引用同步改）：条带上还有东西可显示（哪怕全是折叠组成员）页签栏就留着。④ 顺带修：toggleGroup 的 `memberElsOf` 为空分支原来**无条件**调 transferFocusOutOfGroup，展开时会把焦点反手抢走 —— 收进 `settleFocusAfterToggle(gid, collapsing)`，折叠走转移（含兜底）、展开走恢复，两条各归各。⑤ **已知残留（未修，用户未点名）**：刷新后 activeId 从 `cp.activeFile` 恢复，saved 为 null 时回落「最后一张页签」，可能正落在折叠组里 —— 幽灵状态会从刷新这条路再进来；芯片 holds-active 环是这条残留路的唯一提示。要修的话口径与 ① 相同（启动恢复完 activeId 后做一次同样的全折叠判定）。探针 /tmp/t17/probe.mjs **21/21**：全折叠 9 项（可见 0、activeId null、cp.activeFile null、占位露出、model 卸载、无 holds-active 环、lastActiveTabId 记对、页签栏仍在）、展开恢复 5 项（焦点回 ccc、model 重挂、占位收起、activeFile 回写）、部分折叠 4 项（转移不清空、不写记录、编辑区不空、展开不抢焦点）。verify 基线不变（A/B/C/D/F 绿，E/G/H 既有红）。〕 〔2026-10-20 十八改，用户报两件事：①「标签页组应该也可以被拖动」；②「最左边的标签页左下角有一个曲线，产生了虚假的占用左右空间」。① **芯片拖动 = 整组搬移**（Chrome 同款，芯片就是组的把柄）：`useTabDrag` 加 `onChipPointerDown`（与页签共用 `beginPress` 建档，`press.id=null` + `press.gid` 记组），被拖对象是「芯片 + 紧随其后的全体可见组员」的**整段块**（`drag.block`，折叠组只有芯片 —— 组员由它代表），块内全体共用同一个 translate3d（块内相对间距 == 槽位模型的 `mr(prev)+ml(next)`，钢性连体；`draggingIds` 导出块内全部 strip id，模板给整块挂 `--dragging` —— 只给芯片关过渡的话组员会被 200ms 让位过渡拖着、整组肉眼可见地拉开）。碰撞判定走**邻接 run 整段换**（`neighborRun`）：无组单元就是它自己，某组则是「芯片 + 它的组员」整段 —— 组对组必须整段换，只换芯片会把对方组员与芯片拆开、破坏「同组成员在 stripOrder 里连续」的不变式（松手后那组包络线永久断成两截）；触发判据当时取前导边缘过「run 槽位跨度中点」+ 方向门控（**二十改推翻**：中点门槛要多走半段 run，见下面二十改）。搬组**无成员结算**（drag.gid 恒等组 id，无出入组判定），松手经 `tabStrip.moveStripRun`（新导出，insertIndex 契约与 moveStripItem 同 =「去掉被搬段」的列表）整段挪 `stripOrder`，`onDrop` 载荷改 `{kind:'tab',id,liveGid}` / `{kind:'group',gid}` 两型。芯片原样点击仍是折叠 / 展开：`toggleGroup` 补 `consumeClickSuppression` 挡拖拽收尾的 click（原先注释「不参与拖动不用挡」已失效）。② **条带端缘不再留 9px 内边距**（本节自查单第 1 项的预留作废）：`padding: 0 9px` 改 `padding: 0`，页签 / 芯片顶到条带端缘 —— 那段预留让最左激活页签的左脚悬空画出一段弧线（用户眼中的「虚假占用」）。关键发现：**包络线的脚锚在组员身上、组员左边永远垫着芯片（≥20px），左向的脚根本伸不到端缘**，预留只对右向的脚有意义；右向的脚改按「贴端缘不画」处理 —— `stripItems` 给可见序列第一名 / 末名打 `stripFirst` / `stripLast`，CSS 关掉对应伪元素脚（`.editor-tabs__item--active.is-strip-first::before` / `…is-strip-last::after`），`measureGroupLines` 对 `is-strip-last` 的激活成员不画右脚弧与楔形、path 以 `L right h-1` 直落收口（硬画会被滚动容器裁平，且 `::after` 参与**可滚动溢出**，会把条带撑出几像素的假滚动行程 —— 实测 scrollW 828 == clientW）。探针 /tmp/t18/probe.mjs **27/27**：端缘 8 项（padL=0、贴边 x=0、无假滚动、is-strip-* 类、伪元素 display:none）、左缘组包络左脚完好（起点 x≥0，芯片垫着裁不到）、芯片拖 8 项（连体 tx、落盘整段挪、成员关系未变、拖回原位）、组对组整段交换、折叠组芯片拖（成员隐藏仍整段搬、折叠态不打断）、原样点击仍折叠 / 展开（含 <5px 阈值）、页签拖拽回归。verify 基线不变（A/B/C/D/F 绿，E/G/H 既有红）。〕 〔2026-10-20 十九改，用户要求「为标签栏与标签页组构建完整的触屏手势状态机」，给了 200/500/10/5/40 五个数与四条规则。① **状态机**（useTabDrag，press 上的 armed / dragging / menuOpen 三个标志）：触屏按下后 200ms 内位移 >10px = 横向滚动（撤销长按与菜单计时、放行原生 pan-x）；静止到 200ms = armed「可拖」（`navigator.vibrate?.(15)` 轻震 + 页签 / 芯片浮起：`--armed` 上加 `scale: 1.02`，芯片首次有了两段反馈 —— 组色块不能拿底色当进度条，改走 `brightness(1.08) → 1.18` 两档）；位移 ≥5px = dragging（锁滚动 + `is-touch-drag` 放大 1.04 + 投影）；静止到 500ms = 弹自定义上下文菜单（拖拽态作废，页签走右键菜单同款、芯片走分组卡片，位置取手指最后停留处 +12px 向下避开指腹）；200ms 内抬手（<10px）= **tap**（onTap 回调：文件页签切 activeId、视图页签走 viewMeta.activate、芯片折叠 / 展开）。鼠标路径原样保留（按下即获焦 + 5px 起拖），**触屏按下不再抢焦**（原来 pointerdown 就 activate，手指想滚一下条带会连切三个文件）—— 切焦点挪到 tap 与 onDragStart 两个出口。LONG_PRESS_MS 450 → 200（`--pressing` 的 450ms linear 过渡同步改 200，两处注释互相点名）。② **滚动锁**：armed 起 `lockStripScroll()` 给条带写内联 `overflow-x: hidden` + `touch-action: none`（后者给下一次手势读，本次靠非被动 touchmove preventDefault）；解锁走 `unlockStripScroll()`，**唯一收口是 cancelPress**（松手 / tap / Esc / pointercancel / 菜单弹出 / 组件卸载全汇到它）—— 探针证实上锁不重置 scrollLeft、每个出口都还原。③ **边缘自动滚动**：EDGE_PX 24 → 40，速度改为随距离线性（贴边 14px/帧、40px 处 3px/帧），纵向容差 ±12 → ±20。④ **tap 与 × 保护的连带修**（探针抓到的真实缺陷）：轻点未激活页签时 onTap 先激活、× 随之从 `pointer-events:none` 变可点，而浏览器在**抬手那一刻**才做 click 命中测试 —— 同一落点按下命中页签、抬手命中刚露出的 ×，「第一次只切换」当场变「第一次就关掉」；修法是 × 的 click 也走 `consumeClickSuppression`（`onCloseClick` / `onViewCloseClick`）。粗指针（`@media (pointer: coarse)`）下：非激活页签的 × 用 `:not(--active)`（0,4,0）钉死不可点（防某些安卓浏览器 hover:hover 误报）、激活页签的 × 用 `::after` 挂 32×32 透明热区（`right:-7px` = 页签右内边距，一条边不越到邻签）。⑤ **pointercancel**：与 pointerup 同一条清理链（cancelPress），拖拽中先 `finishDrag(false)` 平滑回弹（settle 150ms）再 markClickSuppressed；探针证取消后无任何类 / 内联位移 / 滚动锁残留、手势机立即可用。⑥ 视觉：`scale` 用**独立属性**而不是 transform（transform 被 useTabDrag 逐帧写 translate3d 占着）；基类过渡加 `scale 140ms`，`--dragging` 从 `transition: none` 改成「transform 0s + scale/box-shadow 140ms」（不然松手摘类那一拍 scale 会瞬跳回去）；`is-touch-drag` 只在触屏拖拽时挂（鼠标拖拽不放大）。探针 /tmp/t19/probe.mjs **45/45**：轻点 2、短滑滚条带 3、长按两段反馈 + 起拖 + 放大投影 + 落盘 10、菜单 6（500ms 弹出、不压指腹、抬手不误触、点外部收）、pointercancel 6、鼠标回归 2、× 保护 4（含 32px 热区实测「框外 9px 也能关」）、芯片两段态 + 整组拖 + 卡片 7。verify 基线不变（A/B/C/D/F 绿，E/G/H 既有红）。〔**已知残留**：① 500ms 菜单里没有「重命名文件 / 关闭右侧标签页」—— 站内没有页签改名的 API，未加；② 窄视口下左侧分栏条 `.splitter` 有 24px 热区，盖住条带最左 ~19px，最左芯片 / 页签的左半在这一条底下点不到（既有布局，与本轮无关，未动）；③ 真机专属项（系统长按菜单 / 放大镜 / 双指打断）无头探针测不到，靠 touchmove preventDefault + contextmenu 拦截 + 三件套 CSS 兜着。〕〔2026-10-20 二十改，用户报两件事：①「折叠状态下的标签页组，从左到右拖动的时候，被右边的标签页遮挡了，显然是优先级有问题」；②「希望它复用标签页拖动的逻辑，现在是完全拖动到对应位置才会触发交换，应该把边界改为和拖动标签页相同」。① **遮挡 = 根元素 is-dragging 没挂上**：类判据原是 `draggingIds.length`，而折叠组的芯片拖动时块里一个可见组员都没有、`draggingIds` 是空数组 —— 抬层（`--dragging` 的 z-index:100）、邻居的 200ms 让位过渡、TransitionGroup 切 tab-instant 全挂在它下面，于是芯片被右边页签整块盖住（探针 elementFromPoint 命中的是页签自己的 label）、邻居瞬移不滑。判据改 `!!draggingId`（页签与芯片哨兵都在 beginLiveReorder 前置位、cancelPress 统一收），`<TransitionGroup>` 的 `:name` tab-instant 条件同步改。② **迟钝 = neighborRun 把散签并成一个 run**：「同组成员连续」的扩展判据写的是 `v.gid === head.gid`，而普通页签的 gid 是 **null** —— 它跟后面每一张普通页签都相等，向右一拖就把一串散签当成一个 run，阈值变成整串中点（实测：20px 芯片拖过 102px 邻签要走到 108px 才换，且一换越过两张）。修法：`neighborRun` 对 `!head.gid` 直接返回单元素 run；阈值（十八改取 run **整段中点**）改成锚在**紧挨着被拖块那个单元**的中线上 —— 向右取 run 首元、向左取末元，与页签拖动的前导边缘判据逐字相同；组对组仍整段换（连续性不变式不动），只是门槛挪到贴脸一侧。探针 /tmp/p2.mjs·p3.mjs **8 组断言全过**：芯片→右首换 d=66（公式 65）、页签→右对照 d=60（公式 59）、芯片→左 d=70（62+8 采样步长 2px 内对齐）、页签→左过芯片 d=26（公式 24），四个方向全程 0 遮挡帧（elementFromPoint 恒命中被拖者）、z=100、is-dragging 在位；真实松手落盘整段
挪 stripOrder、cp.openTabs 落盘正确、成员连续。verify 基线不变（A/B/C/D/F 绿，E/G/H 既有红）。〕
〔2026-10-20 二十一改，用户报「正在拖动的标签页应该都显示外扩圆角，而不应该在拖动到最左边的标签页放下的时候突然出现一个圆角」。**根因：strip-first / strip-last 按 DOM 顺序（stripOrder）判定，而拖拽期间页签的视觉位置与 DOM 顺序脱钩** —— 十八改的「贴端缘不画脚」吃的是这两个标记，于是「把最左的激活页签拖到中间」整路上它都顶着 is-strip-first、左脚被压着，一松手 DOM 序更新才突然长出来（探针实测：拖动中 `::before` display:none、松手后 block）；反向（中间拖到端缘）则是拖着一只会被裁掉的脚。修法两层：① useTabDrag 新增 `dragEdge`（shallowRef，'first' | 'last' | null），updateDrag **每帧**按被拖块的视觉位置重算 —— 判据与脚的几何对齐：视觉左缘 ≤ 0.5（内容坐标；左脚伸到 x=-8 就被条带裁平）→ 'first'；视觉右缘 ≥ 内容总宽 − 0.5（右脚越过末槽右缘会撑假滚动行程，十八改同一条理由）→ 'last'；内容总宽从槽位模型取（末单元 pos+width+mr），cancelPress 统一收。② EditorTabs 的 stripItems 尾部：拖拽期间（draggingId 在位）把被拖项的两个标记**总是**用 dragEdge 覆盖（第一版写成 `draggingId && dragEdge` 才覆盖，探针抓到「离开端缘后 DOM 序的旧标又冒回来」—— dragEdge 为 null 时也要写成 false）；芯片拖动不匹配（哨兵 `group:<gid>` 匹配不到页签），组员标记维持原样（脚锚在组员身上永远够不到端缘）。包络线的 atRightEdge 消费 is-strip-last 类，自动跟随。探针 /tmp/r2.mjs 四场景 **16/16**（最左→中间拖动中左脚出现 / 松手保持、中间→最左拖动中关 / 松手保持、→最右右脚关且 scrollW==clientW 无假行程、最右→中间右脚出现 / 松手保持）。verify 基线不变（A/B/C/D/F 绿，E/G/H 既有红）。〕
〔2026-10-20 二十二改，用户报「触屏下拖动标签页必须立即拖动；希望在弹出菜单之后也可以拖动这个标签页」。**菜单从此不再是手势的终点**：长按 500ms 弹出菜单后，手指继续动 ≥ 10px（新常量 `TOUCH_MENU_DRAG_PX`，故意比 armed 后的 5px 大 —— 先被判成「菜单」的手势改口要一点明确意图，微抖不该把菜单晃没）就收起菜单、**同一次手势**直接并进拖拽。真正的难点不在阈值：菜单弹出那一刻旧代码 `unlockStripScroll()` 把滚动锁解了、`onTouchMoveBlock` 也不再拦 —— 手指一动浏览器立刻把它判成横向滚动并发 pointercancel，「菜单后接着拖」永远起不来。修法：① openLongPressMenu **不再解滚动锁**、onTouchMoveBlock 把 menuOpen 一并拦（手势已归我们；菜单打开时背景本来也不该滚）—— 出口没有新增，松手 / cancel 仍走 cancelPress 统一解；② onPointerMove 的 menuOpen 分支：相对 `press.menuX/menuY`（菜单弹出那一刻的指针位置，**不按相对按下的总位移** —— 按下到 500ms 间允许 <5px 抖动，拿总位移当基准会让抖过 4px 的手再动 6px 就起拖）的增量过阈值 → `press.menuOpen = false` → 先调新增的 `onMenuDismiss` 回调收浮层（Teleport 到 body 的 fixed 元素不会自己让路，不收会跟着被拖页签走完整个拖拽）→ `startDrag`。EditorTabs 传 `dismissStripMenus`（页签菜单 `menu` 与分组卡片 `groupCard` 共用一个出口）。原地抬手行为不变：菜单留着、吃掉 click。探针 /tmp/g1.mjs 四场景 **35/35**（页签：armed→菜单→微动 6px 不关 →+14px 菜单收起并进拖拽 → 跟手 matrix(1,0,0,1,146,0) → 松手落盘顺序与 cp.openTabs 一致、滚动锁出口全对；芯片：长按弹分组卡片 → 再动卡片收起、整组搬移、组完好；回归：原地抬手菜单留着、点外部收起、短滑窄视口（420px，scrollW 443/clientW 176）仍能滚 scrollLeft=36 且不弹菜单不起拖）。verify 基线不变（A/B/C/D/F 绿，E/G/H 既有红）。〕 〔2026-10-20 二十三改，
用户给了六条工业级不变量（Chromium TabStripModel / TabStripLayoutHelper、M3 Tabs & Gestures、WAI-ARIA tablist、
VS Code Workbench）要求全局审计。逐条对照后**规范本身基本已满足**（扁平数组 + 组连续 / 理想槽位与视觉坐标分离 /
前导边缘 + 方向门控 / 两阶段退出 20px 落在 15–25 区间 / padding 0 与端缘退化 / 鼠标 5px 与触屏 200-500-10-5 状态机 /
粗指针隐藏非激活 ×）—— 查出并修掉的 4 个洞都是**边缘路径**：① **无幽灵空组**：`removeFromGroup`/`addToGroup`
搬走某组最后一名成员后不清组（旧代码只有 `groupTabs`/`closeGroup` 走 `prune()`），组对象连同名字颜色永久留在状态与
localStorage 里；两处补 `prune()`，与拖拽期「空组暂留」不冲突（拖拽期 memberOf 一概不动，松手结算才走到这里）。
② **焦点必可见**：`closeTab` 的兜底 `picked ?? openTabIds[min(index, len-1)]` 会在 `closeFocus.pick` 返回 null
（其余页签全被折叠藏起来）时把焦点指到一张隐藏页签上 —— 与十七改的折叠路径自相矛盾；改为**注入在场就信它的结论**，
null 就置 null（旧注释「全折叠时点不到关闭所以走不到这里」不成立：右键菜单 / 中键 / 快捷键都能关看不见的页签），
只有注入还没装上的模块加载早期才退回旧兜底。③ **异常中断清理**：`blur` 没人监听 —— Cmd+Tab / 切应用时 pointerup
发生在别的应用里永远回不来，armed 的滚动锁与浮起态会永久挂在 DOM 上（这套手势里唯一不能接受的死锁）；补
`window.addEventListener('blur', onWindowBlur)`，拖拽中走 `finishDrag(false)` + 抑制 click，按压中走 `cancelPress`，
卸载时一并摘。④ **清理完备性**：`settle()` 开头 `if (!strip) return` 会先退、留下一串内联 translate3d 没清；
改成**无条件先清内联 transform**，只有补间那步才看条带在不在。审计探针 /tmp/audit.mjs **11/11**（空组 4、全折叠关页签
焦点置 null + 空状态 2、拖起后 blur 清理 3、正常换位回归 1）；verify 基线不变。〕 〔2026-10-20 二十四改，
用户报「拖动一个标签页到标签页组中的时候，出现了两个胶囊」（截图：一枚具名芯片 + 一枚无名芯片，
中间夹着被拖的 new.cpp）。**根因是「同组连续」被打破，不是芯片画重了**：`stripItems` 按「组首」插芯片
（`runStart` = 前一格不是同组），一段组的成员在 `stripOrder` 上被**非成员**隔开，就会渲染出两枚芯片 +
两条包络线（`measureGroupLines` 逐芯片一行，`g` 元素 key 撞成重复）。非成员怎么进去的：普通换位的
准入条件写的是 `!drag.gid || next.gid === drag.gid` —— 未分组的单元（视图页签，以及还没被吸入的页签）
对这个判据是**全放行**。为什么以前多数时候不炸：拖入判据按**被拖页签自己的宽度**算（右入要越过组末
成员右缘 40% 自身宽、左入要压过组首 12px），宽签对上宽签时它比「前导边缘过中线」早，于是先入组、
后换位；窄签（new.cpp 那种 100px 上下）对上 190px 的长题名页签时，35px 的行程里**换位先到、入组没到**，
那一帧之后它已经在组中间了，两块判据都不再命中。两处修法：① `useTabDrag.updateDrag` 新增「跨组越界」
一段（在普通换位之前）：未分组单元撞上某组成员、且这一换会把它塞进组内部时 —— 页签**就地入组**
（Chrome 口径：拖到两名组员之间 = 加入该组），视图页签（不能入组）**连芯片带组员整段跳过去**；
单成员的组劈不开，仍走普通换位。② `tabGroups.normalizeRuns()`（新导出）：以组内第一名成员为锚把其余
成员依次贴回去，挂在 `prune()`（含开机 `watch(openTabIds, …, {immediate:true})`）与 `onStripDrop` 的
两个分支上 —— 既兜旧版本留下的脏 `stripOrder`（用户当场的状态下次落盘 / 下次开机自愈），也兜
「整组搬移落点正好插进另一组内部」这条同类路径。探针 /tmp/cap3、cap4 共 **15/15**（视图页签拖进组中间
拖动中不再出现第二枚芯片、能整段越过组、文件页签拖进组中间仍入组、拖出组回归、**灌脏后确实复现
chips=2 → normalizeRuns 后回到 1**）；verify 基线不变（A/B/C/D/F 绿，E/G/H 既有红）。〕
〔2026-10-20 二十七改，用户报「标签页组的线，下方的横线比上方的细一点」（附截图）。**根因是条带高取了整数**：
`measureGroupLines` 原用 `strip.clientHeight`。条带 35px 经 rem 化 + 界面缩放（如 1.1 → 根字号 17.6px）
后实际是 **38.5px**，而 `clientHeight` 取整成 **39**；底边线锚在 `h - 1 = 38`，2px 描边要占到 39，
SVG 视口（`height: 100%`）只有 38.5 —— 下沿被裁掉 0.5px，看着就比顶边细一档。修法一行：
`h` 改用 `strip.getBoundingClientRect().height`（保留小数），底边线正好画到条带底。实测（1280×800、
deviceScaleFactor 2、根字号 17.6px、走真实 `groupTabs` 建组、逐像素扫描）：改前顶边 4 device px /
底边 3 device px；改后 4 / 4，线宽恒 2 CSS px（顶边、底边、竖边同一 `stroke-width: 2`，无裁剪）。
界面缩放为 1 时该两值本就相等，所以这一档缺陷只在非 1 缩放下现形。**共用同一函数，所有组同病**：另做
两组六状态审计（无激活成员 / 激活首成员 / 激活尾成员 / 条带最右 `atRightEdge` / 组折叠 / 缩放回 1），
每组底线、顶边全部为 4 device px，竖边 2 CSS px（x 落在半设备像素上时呈 3 实 + 2 半透明，属抗锯齿，
非裁剪）；折叠组在重绘后无任何线像素。`npm run build` 通过。〕
〔2026-10-20 二十八改，用户口径「直接去掉这个提示环」：删除芯片上的 `--holds-active` 组色环。
落地三处 —— `stripItems` 里的 `holdsActive` 计算、模板 chip 的 `editor-tabs__chip--holds-active`
类名、样式表里那条两道 `box-shadow`（曾用于「折叠组里藏着当前文件」的残留提示，十四改引入、
十七改后正常折叠路径已不触发）。删除后没有任何替代提示；「刷新后焦点复原进折叠组」这条已知残留
（见十七改 ⑤）仍在，只是不再有视觉标记。历史章节里的 holds-active 记述保留作沿革，不再生效。〕 |
| `EditorPane.vue`（style@231） | `.editor-pane` `.editor-pane__stage` `.editor-pane__host`（Monaco 容器）`.editor-pane__empty*` `.editor-pane__status*` |
| `EditorSettingsPanel.vue`（style@837） | `.settings-view`（滚动容器，`container-type: inline-size` + `container-name: settings`，窄宽降级靠它而不是视口断点）`.settings-view__inner`（**默认单列**，编辑区 ≥35rem 时才升级成目录 + 内容两栏，见坑 7）`.settings-nav*`（分类目录，8 项，`--active` 是选中项；宽面板下是左栏、窄面板下是顶部横向标签条）`.setting-group*` `.setting-subtitle`（组内小标题，把「运行时限」与「评测引擎」分开）`.setting-group__note`（分组说明文字，如「应用」组那句）`.setting-row`（**不画行边框**，靠内边距 + `:hover` 底色划分边界；`.is-modified::before` 是左侧 3px `--accent` 「已改动」线）`.setting-row__main` / `__head` / `__label` / `__key` / `__hint` / `__control`（标题 / 键名 / 描述三级灰度：`--text` / `--text-faint` 等宽 / `--text-dim`）`.setting-row--select` / `--number`（上下结构，控件在左下）`--switch`（左右结构，开关靠右上）`--action`（左右结构，按钮 / 录制框居中在右）；窄面板（`@container settings (max-width: 26rem)`）下整行退回上下排，**控件仍贴行尾**：`.setting-row__control` 是 `justify-content: flex-end`、`.runtime-row__actions` 是 `justify-self: stretch` + `flex-end`（2026-10-30 由 `flex-start` 改，原先按钮掉到第二行最左边、手指要横跨整行）。还剩两处例外：下拉框 / 数字框在窄面板下撑满整行（对齐无从谈起），`.setting-row--template` 的「恢复默认」用 `margin-left: auto` 贴右（不受这套规则影响）。开关原先靠左（`align-self: flex-start` 收缩成自身宽度）、**2026-10-30 同日改为贴行尾**（一并走上面那条 `justify-content: flex-end`，与按钮同一摆法）`.select` `.number-input` `.switch*` `.runtime-list` `.runtime-row*` `.runtime-row__actions`（已就绪时右侧「已就绪 + 卸载」两颗的容器）`.download-button*`（本地运行环境下载 / 卸载 / 「应用」组安装按钮 / 扩展包下载共用；`.is-uninstall` 悬停才转危险色）`.shortcut-key`（插件快捷键只读键位徽标，与 `HotkeyRecorder` 的 `.hotkey` 同观感；**字体必须用 `--ui-font`**，见下）`.setting-code`（行内代码，如 `chrome://extensions/shortcuts`）`.is-spinning`，以及卸载确认弹窗那一组 `.confirm*`（与 `FileExplorer` 同款，Teleport 到 body，见坑 23）（铺满编辑区的设置视图；原 `.panel-drawer*` / `.icon-button*` / `.done-button*` 已随抽屉外壳一起删掉） |
| `HotkeyRecorder.vue` | `.hotkey-field`（右对齐一列）`.hotkey`（录制框，`--is-recording` 描边点亮 / `--is-conflict` 红描边红字 / `--is-empty` 未绑定置灰）`.hotkey-clear`（清除按钮）`.hotkey-error`（冲突红字）`.hotkey-tip`（录制中的 Esc / Delete 提示）。**键位徽标一律用 `var(--ui-font)`，不要图「像代码」改成 `--mono-font`**：等宽字体没有 `⌘` `⇧` `⌥` 这几个字形，浏览器会按字符逐个回退到别的字体，同一枚徽标里符号比字母大一圈、粗细也不一致（2026-09-30 修的就是这个）。同一条理由适用于 `EditorSettingsPanel` 的 `.shortcut-key`；状态栏里 `formatCombo` 那一处本来就是 `--ui-font`，所以改完三处一致 |
| `EngineSettingsPanel.vue`（style@103） | `.engine-panel` `.engine-list` `.engine`（`--active` 是选中引擎，整块可点）`.engine__*` `.engine-field*`（服务地址）`.engine-button*`（自检 / 保存）`.engine-probe*`（自检结果文案，`--ok` / `--bad` 由 `is-*` 类控制） |
| `HelpPanel.vue`（style@95） | `.help-content` `.help-group*` `.help-item*`（`.is-bold` 是 `**…**` 加粗片段）`.guide-link`。原 `.help-button` / `.panel-backdrop` / `.panel-drawer*` / `.done-button` 与两段 Transition 已随抽屉外壳一起删掉 |
| `base.css` | **全局元素样式从 `*`（第 281 行）起**：`body`、`button`、`input/textarea/select`、滚动条、`:focus-visible`、`prefers-reduced-motion`，另有覆盖式滑块 `.oscroll-thumb`（2026-10-13 加：那颗 `div` 是 JS 挂到 `body` 上的，组件的 scoped 够不到，所以只能全局；见第 5 节坑 43）。第 8–161 行是深色变量、第 163–280 行是浅色覆盖 |
| `ContextMenu.vue`（style@113） | `.context-menu`（fixed 浮层；底色 / 描边 / 圆角 / 投影全部走 `--menu-*`，**不再用 `--bg-raised`**；`--ready` 才显形——先量完尺寸再定位，避免看见它从屏幕角上跳一下）`.context-menu__item`（`display: flex` 两端对齐、`gap: 20px`；字体 13px / 字重 400 / **`line-height: normal`——刻意不写死**，行盒由字体决定：英文界面条目 28px（= 模板），中文 30px，见第 5 节坑 33；`:disabled` 置灰到 `opacity: .4`；**无圆角**，配容器 `padding: 6px 0` 才是通栏的方形悬停块）`.context-menu__label` / `.context-menu__shortcut`（右列 11px 键位，`color: --menu-muted`、悬停提亮成 `--menu-hover-muted`，`v-if` 按 `item.shortcut` 出现——文件树的「重命名 / 删除」与编辑区那四项都带数据，见坑 33）`.context-menu__divider`。定位靠读 `getBoundingClientRect()` 后按视口四边收敛（`gap`），**别改成 absolute 锚在树节点上**（树一滚菜单就跟着跑）。**弹开动效是 `animation` 不是 `transition`**（父级用 `v-if`，每次打开都是新挂载，没有「旧状态 → 新状态」可过渡），`prefers-reduced-motion` 由 `base.css` 的全局规则统一压掉，这里不重复写第 5 节坑 6 那一段 |
| `guide.css` | 指南页专用（`@import './base.css'` 打头）：`.page` `.page__top` `.page__foot` `.brand` `.brand__mark` `.brand__name` `.cta` `.doc` `.doc__lead` `.toc` `.toc__title` `.table-wrap` `.note` 与长文排版。**改它只需看指南页，不影响应用**（见第 12 节） |

## 5. 改样式时的几个坑

1. **状态色是三元组，但徽标文字是判定码**：卡片/徽标颜色用 `data-status="passed|failed|error|running"`（`TestCaseCard.vue`），面板小结用 `data-tone="passed|failed|error|info"`（`TestPanel.vue`），加新状态要同时补 CSS 分支。徽标里显示的文字不是状态名，而是用例记录上的 `verdict` 字段（`AC / WA / CE / TLE / RE / ERR`，没跑时回退「待运行/运行中」）；颜色归 `status`、文案归 `verdict`，两者在 `runner.js` 的补丁里成对产出，别合并成一个字段。
2. **Monaco 文字用 NBSP 渲染**：用脚本读 `.view-lines` 的文本时，空格是 `\u00a0`（charCode 160），`includes('def solve')` 这类断言永远匹配不上。
3. **Monaco 的 `.minimap` DOM 节点始终存在**，关闭时宽度为 0；判断"有没有小地图"要看 `getBoundingClientRect().width`，不是 `querySelector`。
4. **localStorage 里存的是 JSON 字符串**：`cp.panelPosition` 的值是 `"left"`（带引号）。直接比较原始字符串会误判。
5. **统一侧边栏里全是 `v-show`**：整栏折叠（分隔条要能用鼠标/键盘把它拖回来）、栏内两个面板的切换，都不能改成 `v-if`——文件树的展开状态与样例里手填的输入都挂在 DOM 上，切换一次就被销毁重建，用户数据直接丢。副作用有两个：（a）「页签内容在 `display: none` 期间量不到尺寸」，凡是靠 `scrollHeight` / 宽高做自适应的组件（如 `TestCaseCard` 的输入框自增）都得自己接住「从不可见变为可见」那一刻，见坑 8；（b）切换器（`SidebarSwitcher`）2026-10-11 起是**全站单实例**、渲染在 Sidebar 的共享页头 `.sidebar__head` 里（此前两个面板的页头里各有一份实例，按选择器取它必须先落到「当前可见的那个 `.sidebar__panel`」里）。单实例后查询直接认 `.sidebar__head` 作用域即可。（c）单实例也让「跨面板的运动」成了**真的 `transition`**：蓝色指示块是胶囊里一个绝对定位元素（`.sidebar-switcher__indicator`），active 变化只改它的 `transform`、由 transition 补间。旧版那套「两份胶囊互换 + `sidebar-indicator-from-*` keyframes 假装滑动 + `[data-switched]` 挡首屏误播」的 Hack 已整体删除（历史：两份实例时高亮不是同一个元素在动，`transition` 永远看不到，只能用 animation）。
6. `@media (prefers-reduced-motion: reduce)` 会全局压掉动画，新增动画不用额外处理。
7. **「设置」是编辑区里的一个合成页签，不是抽屉**（`src/services/editorViews.js`，原 `settingsTab.js` 已并入）：它刻意**不进** `workspaceStore.openTabIds`——那边的 `openTabIds` / `nodeIndex` / 会话恢复全建立在「一个页签 = 一个真实 VFS 节点」之上，塞一个没有节点的 id 进去，`rebuildTree` 会把它当「文件已删除」顺手清掉，`modelManager.release` 也会去找一个不存在的 model。所以它不建模型、不落 localStorage（刷新后回到代码文件是预期行为）。视图与 Monaco 用 **`v-show` 互斥**（不是 `v-if`）：Monaco 实例与设置组件的运行环境探针订阅因此只建立一次。让出激活态有三条路，缺一条就漏一种「点了文件还在看设置」：① `editorViews.js` 里 `watch(() => workspace.activeId)` 管「活跃文件**变了**」；② **`workspaceStore.openFile()` 里的 `codeViewIntent.show`**（`editorViews` 加载时把 `deactivateViews` 注册进去，那边不能反向 import，成环）管「**打开某个文件**」这个意图本身 —— 判据与 activeId 变不变无关，所以「文件树焦点停在某文件上、屏幕上却是设置页，再点一次它」（2026-10-25 用户报的）也能收起来；③ `EditorTabs.activate()` 里显式再让一次，因为点页签走的是 `setActiveTab`、根本不进 `openFile`。（「本地运行环境」原先是独立抽屉 + `composables/useLocalRuntime.js`，现两者都不在仓库里了——运行时 UI 已并进设置视图。）设置视图自身**默认单列**（目录折成顶部横向标签条、内容在下），编辑区够宽时才升级成**「目录 + 内容」两栏**（2026-09 建，2026-10 反转默认值）：`.settings-nav` 是分类目录（工作区（仅桌面端）/ 外观 / 编辑器 / 模板 / 快捷键 / 评测 / 云端同步 / 应用 / 浏览器插件（仅网页版）/ 帮助，`SECTIONS` 常量驱动），内容区同一时刻**只渲染一组设置**（`v-if` / `v-else-if`，不是 v-show 平铺），当前分类存在组件内的 `activeSection` 里（不落盘，关掉页签再打开仍记得）；切到「浏览器插件」那一栏会顺带 `refreshExtension()` 重探一次扩展状态（`watch(activeSection)`）。原顶栏的「评测引擎设置」弹层与「帮助」抽屉（`HelpPanel.vue`）在 2026-09-28 都并进了这里：引擎列表 / 服务地址 / 自检成为 `EngineSettingsPanel.vue`，挂在「评测」组的「运行时限」下面（`.setting-subtitle` 分开两块）；帮助的问答列表成为「帮助」组，`HelpPanel.vue` 已瘦身成纯内容组件（无按钮 / 无 Teleport / 无 Esc 逻辑）；「应用」组装 `useInstallPrompt()` 的安装按钮（原顶栏那颗）；「快捷键」组是 2026-09 新加的（见第 13 节）；「浏览器插件」原先也是独立一组，2026-10-01 与「本地运行环境」一起并入「应用」；**2026-10-11 又按内容独立回一栏**（桌面端不出现）—— 搬走的同时把「应用」与插件两栏那套**卡片化版式**（描边卡片、卡片吞掉小标题、参考稿尺寸的开关）一并去掉，回归其余栏的「分组大标题 + 朴素行（无边框、悬浮出底色）」，只留三样自己的信息特征：状态胶囊、运行环境行的图标方块、下载/卸载按钮的实心与警示态。**别再往这两栏加卡片外框**：`.app-card` / `.setting-group--app` 两个类名已删。宽度判断不靠 `@media`（设置视图活在编辑区里，视口宽是错的代理），而是在 `.settings-view` 上挂 `container-type: inline-size` + `container-name: settings`，用 `@container settings (min-width: 35rem)` 把默认的单列升级成两栏（阈值与目录项字号都是 rem，全局缩放后目录与内容都会变大、要更早翻回竖排）。**方向必须保持「默认单列 + `min-width` 升级」，别改回「默认两栏 + `max-width` 降级」**：生产构建会把 `max-width` 压成区间语法 `width<=35rem`，不支持它的浏览器（荣耀自带浏览器实测，2026-10）整条查询匹配不上、直接回落到基线两栏，手机上就被挤成两列；反着写的话认不认容器查询都落在安全的一列（代价是不支持的浏览器上永远吃横条目录，可接受）。
8. **用例输入框的高度是 JS 撑的**（`TestCaseCard.vue` 的 `autoGrow`，上限 320px）：改 `.ta` 的内边距 / 字号后高度会自己重算，不用手改。但卡片折叠、以及整个「评测样例」页签被切走时元素都是 `display: none`，此刻 `scrollHeight` 为 0，代码会跳过重算——别把这个空值保护删了，否则折叠一次输入框就被压成 0 高。重算的触发有两处：`watch`（输入变化 / 卡片展开）+ 一个挂在输入框上的 **`ResizeObserver`**（只认宽度从 0 变有值、或面板被拖宽，宽度变大才算，避免回调环）。页签是 `v-show` 切换的，没有重新挂载的时刻，**没有这个 observer 就会一直塌成一行**（旧版只在 `onMounted` 跑一次，切到「评测样例」时必然塌）。
9. **头栏右侧是两颗 32×32 的幽灵按钮**（2026-10-24 晚第三次改）：删除在左、运行在右，默认都无底色、无描边；运行只在悬停图标本身时浮出 `--icon-hover-bg`，垃圾桶休眠 `opacity: .18`、鼠标进入卡片升到 1 并转危险色（**键盘意图另算，别写 `:focus-within`**：鼠标点一下旁边的运行按钮，焦点就留在头栏里，垃圾桶会被它带着点亮、指针移出卡片后也不灭；亮起条件用 `.card__head:has(:focus-visible)`，键盘 Tab 进头栏仍会显形，焦点真正落到垃圾桶上才转危险色 —— 2026-10-24 修，探针实测「点运行后移开鼠标」0.18 / 「Shift+Tab 回到垃圾桶」1 + 危险色）。`.icon-btn--run` 用 `aria-disabled` 而不是原生 `disabled` —— 原生禁用会吞掉按钮的鼠标事件，`runBlocked` 的提示就永远弹不出来。2026-10-24 晚更早那版「`.run-zone` 撑满中段、整条空白都能点运行」已随两钮互换取消：两枚按钮旁边再没有隐藏的大热区，**只有 ▶ 本体 32×32 可点**。提示框统一走 `AppTooltip.vue`（Teleport 到 body、无边框深底 `--tooltip-bg` + `--tooltip-shadow`、相对图标居中、上方放不下自动翻到下方），别退回原生 `title`。
10. **`theme-color` 是 JS 写的，不是静态 meta**：`editorSettings.js` 里那条 `watch(theme)` 把 `--bg-chrome` 读出来写进 `<meta name="theme-color">`（装成独立应用后浏览器拿它画系统栏 / 窗口标题栏）。`index.html` 里那个 `content` 只是首帧兜底，别在那里维护第二份色值。⚠️ **这个色值一共写三处，改一处就得三处一起改**：`base.css` 的 `--bg-chrome` + `index.html` 的静态 meta + `manifest.webmanifest` 的 `theme_color` —— **Firefox 安卓不认运行期写的那条，只读 manifest 里那个静态值**（2026-10-12 定，判据与实测见第 9 节 9.1）。
11. **删除确认弹窗是自绘的，不要换回 `window.confirm`**：`FileExplorer.vue` 的 `requestDelete()` 只把待删节点记进 `pendingDelete`，真正调用 `deleteNode()` 的是弹窗上「删除」按钮的 `confirmDelete()`。原生 `confirm()` 的返回值在 webview / 装成独立应用窗口打开时不由页面掌控（被浏览器抑制时它自己直接返回一个值），出现过「点取消文件还是没了」。自绘弹窗的取消路径有三条且都只清 `pendingDelete`：取消按钮、点遮罩（`@pointerdown.self`）、Esc；`watch(pendingDelete)` 会在弹窗出现时把焦点送到「删除」上（Enter 即确认）。键盘 `Delete` 键走的是同一个 `requestDelete`（2026-10-10 起它登记成了全局快捷键、经 `App.vue` 的作用域闸门进来，见第 13.4 节与坑 34），不需要另写一份确认。
12. **新建的目标目录可以是任意目录，输入行要挡住一种「程序性失焦」**（`FileExplorer.vue` + `InlineCreateRow.vue` + `FileTreeItem.vue`，2026-09-28 改）：两处入口——页头那几只按钮**跟随树内聚焦的节点**（目录取自己、文件取父目录、没聚焦回落根目录，见 `headerCreateTarget()`），右键**目录**则显式指定该目录（菜单项回来了，见坑 14）；**2026-10-12 起还有第三处：树空白处右键**，同样跟随主选中（见坑 40）。状态里的 `targetId` / `targetPath` 决定落点（`join(targetPath, name)`），名字仍是单级（`assertName` 拒绝 `/`）。输入行抽成了 `InlineCreateRow.vue`，**两处渲染点**：根目录那份在 `FileExplorer` 的树容器里，建在某个目录里那份在 `FileTreeItem` 的 `role="group"` 内、递归 `v-for` 之前。三条纪律：
    - **输入行不能放进 `.tree-item__row` 里**：那一行挂着 `@keydown="onKeyDown"`（方向键导航）与由 `onTreeFocus` 的 `closest('[data-tree-id]')` 驱动的 roving tabindex，输入框进去会让编辑文字的光标键被树抢走、打字还会篡改 `focusedId`。放 `role="group"` 里则 `closest('[data-tree-id]')` 返回 `null`（`[data-tree-id]` 只在 `.tree-item__row` 上，而它是兄弟不是祖先），两个问题一起避开（已实测）。另：`role="group"` 挂着 `v-if="expanded"`，所以 `startCreate` 必须先 `toggleExpand` 目标目录，否则输入行根本不存在。
    - **默认名按目标目录查重**：`defaultName` 扫的是目标目录的兄弟（根目录扫 `workspace.tree`，其余走 `getNodeById(targetId).children`），不是全库；文件按 `activeLanguage` 给 `new.cpp` / `new.py`、目录给「新建文件夹」，撞了排 `new-2` / `new-3`。
    - 焦点靠 `nextTick(focusCreateInput)`（聚焦 + 选中主干，见下）送进去，`autofocus` 属性对动态插入的节点不生效、指望不上；句柄由 InlineCreateRow 挂载时注册进 `provide('creatingRow')`。真正阴的地方是失焦提交：创建成功后会自动**打开**新文件，`EditorPane` 在 `activeId` 变化时会 `instance.focus()`（打开文件抢焦点本身是正常行为，别删它），这一抢就落在内联输入框头上 → 输入框 `blur` → 失焦提交 → **凭空多出一个默认名的文件**（连点两次「新建文件」时必现：第二轮输入框刚聚焦就被提交掉）。所以绑的是 `onCreateBlur()` 而不是直接 `commitCreate()`，用 `createFlights`（在途创建轮次的 state 集合）分两种：屏幕上这个输入框自己正在提交（失焦正来自「打开刚建好的文件」）→ 跳过重复提交、也不抢焦点，让焦点留在 Monaco；在途的是上一轮、屏幕上这个是新一轮被误伤的 → `nextTick` 把焦点抢回来（Monaco 的 focus 在 pre-flush watcher 里，抢得赢）并放弃提交。
    - **进去时不是「全选」，是「只选中主干」**（2026-09-28 改）：两个输入框（这里的 InlineCreateRow 与 `FileTreeItem` 的重命名）都用 `setSelectionRange(0, 主干长度)`，落点是 `new.cpp → 'new'`、`main.cpp → 'main'`，后缀留在选中区外——全选的话，改个文件名会顺手把 `.cpp` 打没，用户还得手动补回去。**目录名没有后缀这回事，整段选中**（所以两处都要判 `type === 'file'` / `type === 'directory'`，别无条件套 `stem`）。主干长度取自 `paths.js` 的 `stem(name)`，**它收的是单级名称而不是路径**——`stem('main.cpp')` 对，`stem('/src/main.cpp')` 会返回 `'/src/main'` 这种垃圾，因为它不剥目录（`extname` 那边收的是路径、内部走 `basename`，两者签名刻意不同）。判定规则与 `extname` 保持一致：没有点或点是前导点都算没有后缀，所以 `.gitignore` 与 `Makefile` 是整段选中。
13. **`tabSize` / `insertSpaces` 是 model 级选项，不是编辑器选项**（`services/editorOptions.js` 的 `editorModelOptions` + `EditorPane.vue` 的 `applyModelOptions`）：monaco 0.56 的 `EditorOption` 枚举里**根本没有这两项**（整个 `esm/vs/editor/common/editorOptions.js` 里搜不到 `tabSize`），真实定义在 `ITextModelCreationOptions` / `ITextModelUpdateOptions`。把 `tabSize: 2` 塞进 `editor.create()` 或 `editor.updateOptions()`，`EditorOptionsUtil.validateOptions()` 会当成未知键**静默丢掉**——面板看起来改了、localStorage 也存了，编辑器却一直按 4 空格渲染，而且 `getOption(EditorOption.tabSize)` 返回 `undefined`，不细看根本发现不了。正确姿势是 `model.updateOptions({ tabSize, insertSpaces })`，并且**每挂一个 model 都要补一次**（`setModel()` 之后、切文件 / 新建文件都算），否则新 model 立刻退回默认值。校验这类「改了没生效」的选项时，要读 `editor.getModel().getOptions()`，不是 `editor.getOption()`。顺带记一句默认值：`tabSize` 沿用改造前的 4，`insertSpaces` 刻意是 **`false`（关闭，按 Tab 出制表符）**——Monaco 自己的默认是 `true`，这是全表唯一一处刻意偏离 Monaco 默认的项（`editorOptions.js` 文件头也写了）。
14. **文件树的右键事件必须 `.stop`**（`FileTreeItem.vue` 的 `@contextmenu.stop="onContextMenu"`）：树根 `.explorer__tree` 上也挂了一个 `@contextmenu`（`onTreeContextMenu`，2026-10-12 起它负责**弹空白处那份菜单**并屏蔽原生菜单，见坑 40），而节点的右键**会冒泡到树根**——不 `.stop` 的话节点菜单会被树根那一次覆盖掉，症状是「右键文件/文件夹没反应、右键空白处反而正常」。菜单项在 2026-09-28 变成「题目信息（仅文件）」/「新建文件 · 新建文件夹（仅目录）」/「重命名」/「删除」，2026-09-29 又给有 `meta.url` 的文件加了「打开题目链接」（`problemUrl()` 只放行 http / https），2026-09-30 它与「题目信息」对调、改排在前面 —— 目录上那两项是**刻意加回来**的：新建的目标目录可以是任意目录，而页头按钮只能跟随聚焦节点、表达不了「建在哪个目录」（见坑 12）。**2026-10-11 起它改名为「打开题目」**（`explorer.menu.openUrl`，英文 `Open problem`），右列标出 `⌘ / Ctrl + 单击`，并在树行上做了同款手势：`FileTreeItem.onClick` 判平台主修饰键 → `provide('openProblem')`（就是 `problemUrl` + `window.open` 那一份，与菜单项同一个出口），没链接时退化成普通单击。注意它是鼠标事件的修饰键，**不进 `useShortcutManager` 的绑定表**（那套管线只吃 keydown），所以设置页的快捷键列表里没有它。
15. **判题语言没有独立状态，由活跃文件的扩展名派生**（`App.vue` 的 `activeLanguage`）：2026-09-28 顶栏整体删除时那颗语言下拉也一并删了，`cph.language` 随之成为死键（见第 6 节）。现在 `runAll()` / `runOne()` 直接拿 `activeLanguage` + `activeNode.path` 调 `wasmRuntime.runCase()`（`.py` 走解释分支、其余走 C++ 分支），`workspaceStore.initWorkspaceStore()` 里那句 `openLanguage()` 只剩「首次启动给 `/main.cpp` 兜底」这一个作用。**别把语言选择器加回来**——它与「一个页签 = 一个真实文件」这套模型天然冗余，加回来就得再造一份语言状态去和活跃文件抢口径。想加「新建 Python 文件」入口也不用碰状态层，改 `FileExplorer` 的默认名规则即可（见坑 12）。
16. **语言图标有两处不能随手改的地方**（`AppIcon.vue`）：图标分两张表——`PATHS`（24×24 描边线性图标，主力）与 `SOLID_PATHS`（整块实心路径，`fill: currentColor` 且不描边，`solid` 由 `name in SOLID_PATHS` 判定）；另有 `VIEWBOX` 表存放「不在 24 网格上」的图标的专用方框（模板是 `:viewBox="VIEWBOX[name] ?? '0 0 24 24'"`，目前有 `cpp` / `markdown` / `codeforces` 三项）。C++ 用的是 seti-ui 的 `icons/cpp.svg`（MIT）——**VS Code 默认的 Seti 文件图标主题**（字形 `\E01A`，Seti 配色 `#519aba`）用的就是它，2026-09 从 simple-icons 那枚实心六边形字标换过来（那个在 15px 下糊成一团）。两个坑：
    - **它原始网格是 32×32**，直接套 `0 0 24 24` 会明显偏小，所以方框取边长 22（15px 下墨迹约 12.1×11.0px，与 `folder` 的 12.5×11.25 齐平）。
    - **方框的 `min-x` 被刻意右移到 `4.733`**（= 6.2 − 22/15，正好让 15px 尺寸下右移 1px）：这枚字形左边是大块实心的「C」、右边是两个细「+」，外框虽然几何居中（实测 cpp 与 python 的墨迹中点重合在同一条竖线上），但墨迹重心比中点偏左约 0.7px，排到 python 旁边看着不齐。**别改回 6.2**，也别想着去动 python 的 viewBox——python / folder / file / header 都是几何居中的，动它们会让整列图标一起偏。
    图标本身不带颜色，一律 `currentColor` 跟主题走（没照搬 Seti 蓝）。
17. **题目信息与抓题结果都挂在 VFS 节点上（`node.meta` / `node.config`），不是单独一张表**（`meta` 2026-09 加、`config` 2026-10-01 加）：meta **五项**——题目链接 / OJ / 难度 / 日期 / 时限（毫秒，2026-09-29 加）；config 存抓取结果原文（`tests` 样例等，见坑 19）。入口是文件树右键的「题目信息」，弹窗与删除确认同款自绘（不要 `window.confirm`、不要引 UI 库），目录节点不给这一项（`buildMenuItems(node)` 里按 `node.type === 'file'` 判断）。三条纪律：
    - **不动 `DB_VERSION`**：`LocalVFSProvider` 本来就整条记录持久化（`_commit` / `#persistPuts` 只剥掉 `children`），`writeFile` / `rename` 又是 `{...node}` 展开，所以 `meta` / `config` 天然跟着走。`setMeta(path, meta)` 与 `setConfig(path, config)` 都用 `#schedulePut(node, null)` 落库（`content === null` = 只写 nodes store、不碰正文），各改各的键、互不覆盖。
    - **难度跟着 OJ 走**，口径表、合法值、悬停文案全在 `services/problemMeta.js` 一处：Codeforces / AtCoder → 分数段 `800…3500`（步长 100），洛谷 → 官方八级，牛客 / LeetCode / 其它 → 自由文本。换 OJ 时**必须清空当前难度**（`onOjChange`）——两套口径的 id 互不相通，留着会存下一个对不上的值（比如 `1200` 混进洛谷）。
    - **全空存 `null`**：`normalizeMeta()` 逐键校验后四项全空就返回 `null`，`setMeta` 据此把 `meta` 字段整个摘掉，不在节点上留空壳；`formatMetaTooltip()` 对空 meta 返回空串，`FileTreeItem` 此时不设 `title`（避免弹出空提示）。
18. **导入的题目是「一个代码文件」，不给每道题套目录**（`services/vfs/problemImport.js`，2026-09 定稿，**别再改回题名目录结构**）：树里多一层「题目名/」纯是噪音——点开一道题还得再点一次才见得到代码。所以题名直接做文件名，上面按「年月 / OJ / 难度」分层归类：`/<年月>/<OJ 标签>/<难度>/<题名>.cpp`（挂在工作区根下），题目信息与抓到的样例都挂在这个文件节点上（`meta` / `config`），**树里不另有条目**。四条纪律：
    - **代码文件只在首次导入时创建，此后一个字都不动**：那里面是用户写的题解。重抓同一道题只刷新 `node.config`（样例整体覆盖），难度这种用户手填的字段还得从 `existingCode.meta` 里保留下来、日期只在首次播种。
    - **题目身份认 `url`，不认文件名、也不认路径**：题目在来源站点改名后文件名就对不上；跨月再抓、或用户事后填了难度，算出来的新路径也对不上。只认其中任何一个都会另起一个文件、把用户旧文件里的题解变成孤儿。所以先走「算出来的新路径 + 文件名 + `meta.url` 都对上」的快路径，不中再**全库扫每个文件节点的 `meta.url`** 找回旧题目、**复用原来那个文件**（不搬文件）。**`batch.id` 不能用**——它是扩展每次抓取现生成的随机 uuid，抓两次就是两个值。
    - **`未分类` 是「难度为空」的占位，且路径一定下就跟着题走**：导入时难度一律为空（来源站点口径不一），所以新题都落在 `未分类/` 下；用户事后填难度**不会**把已有文件搬过去（搬动 = 丢题解），分层只对**之后新抓的**生效，老数据不迁移。
    - **同名但 `url` 对不上 = 用户自己的文件**，这时候不能覆盖，要 `baseName-2`、`baseName-3` 依次找空位（只看代码文件那个路径空不空）；整趟塞进一个 `vfs.batch()`，界面只重建一次树。
19. **`meta` 与 `config` 是两个字段，而 `setMeta` 是「整体替换」**（`LocalVFSProvider.setMeta` / `setConfig`）：两个方法都先 `{ ...node }` 展开、再只改自己那一个键，所以并存时不互相覆盖；但 `setMeta(path, meta)` 传进去的对象**就是**新的 `meta` 全部内容——题目信息弹窗（`updateFileMeta`）改一下难度就会用五项重建 meta，**样例若也存在 meta 里，就会在这一刻被抹掉**。所以样例一律走 `config`（`problemImport` 落盘与评测面板取用例都读它）。旧版这两样是同级隐藏的 `.cph/<题名>.json` 文件（旧版靠 `workspaceStore` 的 `withoutHiddenDirs()` 在渲染层摘掉，该函数已删），**2026-10-01 取消**：过滤逻辑已删，老数据由 `migrate.js` 的 `migrateProblemMetaInline()`（标记 `cp.problemMetaInline`）搬进 `config` 后连 `.cph` 一起删掉。
20. **扩展安装包靠文件名换版，不靠 `SHELL_VERSION`**（`EditorSettingsPanel.vue` 的 `EXTENSION_VERSION` / `EXTENSION_FILE`）：`public/extension/` 下的 zip 不在构建清单里，而 SW 对同源 GET 走 `cacheFirst` 且**不重新校验**——原地覆盖同名文件，老用户会一直下到缓存里的旧包。所以发新版必须换文件名（`cc-for-web-2.65.3.zip` → `...-2.66.0.zip`），同步改这两个常量 + `CC-for-Web` 的 `package.json` 版本号。也**不要**把它塞进 `STATIC_ASSETS`（那会每次 install 都预缓存一份几百 KB 的包，而它只在用户点「下载」时才需要）。
21. **全局快捷键挂在 `window` 的捕获阶段，且录制期间必须让路**（`useShortcutManager.js` + `App.vue` 的 `onKeydown` + `HotkeyRecorder.vue`）：`window.addEventListener('keydown', onKeydown, true)` 里 `preventDefault()` + `stopPropagation()`——Monaco 的键位服务挂在编辑器内部 DOM 上，捕获是从外往内走，只有这样才能抢在它前面，编辑器里也归这套表管（顺带把 `Ctrl/⌘+Enter` 原本「在下方插入一行」的内置行为一并挡掉）。反过来，`HotkeyRecorder` 的 keydown 在按钮的目标阶段，而捕获永远先跑，所以**开录时必须置 `recordingActive = true`**、`onKeydown` 见到它就 return，否则录入组合键的瞬间功能会先被执行一遍。同理，`event.isComposing` 期间一律不处理（拼音选词不能被当成命令）。**不要**改回 `editor.addCommand()` 同步键位：Monaco 0.56 的 `ICodeEditor` 只有 `addCommand`、没有 `removeCommand`，改过键之后旧的撤不掉，会出现「新键不跑、旧键反而跑」。
22. **组合键内部串用 `event.code`，且必须挡住浏览器原生键**（同上）：用 `event.key` 对不上——Alt 组合在 macOS 上会把 key 变成特殊字符（Alt+B 是 `∫`）、Shift 会把 `Digit1` 变成 `!`。内部写法固定为 `Mod+Ctrl+Alt+Shift+<code>`（顺序固定、必带键码），所以字符串相等就是精确匹配，`Ctrl+B` 与 `Ctrl+Shift+B` 天然不会互相误触；`Mod` = 平台主修饰键（macOS 是 ⌘，其它平台是 Ctrl），macOS 上还要单独有 `Ctrl`。另外 `BROWSER_RESERVED` 那张表（`⌘W` / `⌘T` / `⌘R` / `F12` 等）要在**录制阶段**就拒绝并给红字原因：这些组合由浏览器 UI 层直接吃掉，`preventDefault()` 无效，绑上去只会得到一个永远不触发的快捷键。裸键默认只放行功能键与 `Esc`（`SAFE_BARE_CODES`），其余一律要求带修饰键，否则打字时会不停误触发；单个动作可以用自己的 `bareCodes` 额外点名一个裸键（目前只有「删除」的 `Delete`，判据是导出的 `bareAllowedFor()`，录制框也共用它），**加之前先想清楚这个动作有没有作用域闸门**（见坑 34）。
23. **「卸载本地运行环境」删的是 Cache Storage，判据也必须以它为准**（`runnoSandbox.unloadRuntime` + `wasmRuntime` 的 `uninstallRuntime` / `isAssetCached`，2026-09-28 加）：设置页「应用 › 本地运行环境」在 `ready` 时右侧多一颗「卸载」（自绘确认弹窗，理由同坑 11，不要 `window.confirm`）。要同时清三处，缺一处就「卸了像没卸」：
    - **Cache Storage**（`cp-toolchain*`，名字见 `services/storageNames.js`）：资产的实际落点，按 `runtimeAssetURLs()` 逐个 `cache.delete()`；**不只认当前那一个桶**，而是按 `TOOLCHAIN_CACHE` 前缀全扫（它不带版本尾缀、本身就是前缀）——SW 的搬运要等 activate 才跑，页面先动手时旧桶还在，漏掉就等于「卸了像没卸」。题解渲染器那侧同一个道理：`mdRuntime.uninstallMdRuntime()` 也按 `MD_CACHE` 前缀**整桶** `caches.delete()`（它没有「逐个条目」这一说，整个桶就是这份运行时）。只删当前桶名的话，旧桶残留会被探针的 `caches.match()` 跨桶搜到、判回「已就绪」，而且 SW 稍后的 `migrateLegacyBuckets()` 还会把它搬回新桶，等于把卸载撤销掉。**两边都按前缀扫，别写单桶名。**
    - **内存**：C++ 是 `toolchain` / `toolchainPromise` / `compileCache` / `pchBytes` / `pchPromise`，Python 是 `pythonRuntime` / `pythonRuntimePromise`；另加 `wasmRuntime` 的 `pchWarmupStarted` 复位（不复位的话，卸载后再跑 C++，`warmupPch()` 会因「已预热过」直接跳过）。PCH 存在 IndexedDB（十几 MB），单独 `deletePch()`。
    - **HTTP 缓存：删不掉**，浏览器没给 JS 任何清除接口（`fetch` 的 cache 选项只改取值策略）。所以 `isAssetCached` 改成「SW 控制页面时只认 `caches.match()`，没有 SW（dev 模式）才退回 `only-if-cached` 探 HTTP 缓存」——仍让 HTTP 缓存当判据的话，刚卸载完的资产会被那份残留立刻判回「已就绪」。**这是本项目第一次让「判据」与「删得掉的那一层」对齐**，以后改探针先想清楚这点（坑 12 那套探针注释也同步改过）。
    - 卸载按钮只在 `ready` 时出现（没装就没有可卸的），下载中禁用——会和 SW 在途的 `cache.put` 打架。
24. **`postcss-pxtorem` 只转 CSS 声明，转不到 JS 与断点**（`vite.config.js` 的 `css.postcss` + `composables/useUiScale.js`，2026-09-28 加）：全局缩放的机制是「构建期把 CSS 的 `px` 转 `rem`，运行时只改 `document.documentElement.style.fontSize`」，但有四类东西**根本不经过转换**，不认清楚就会踩：
    - **JS 内联样式与 JS 常量**：`el.style.height = '320px'`、`:style="{ … }"` 这类不走 PostCSS，永远是真 px。凡是「按 100% 设计的逻辑尺寸」都要自己乘 `scale`（`useUiScale.js` 的 `px()`），如 `TestCaseCard.vue` 的 `MAX_IO_HEIGHT`（且要 `watch(uiScale)` 在缩放后重算）；反过来，**物理尺寸绝不能乘**——`clientX/clientY`、`getBoundingClientRect`、`offsetWidth`、`scrollHeight`，以及 `TAP_SLOP` / `EDGE_PX = 32` / `RELEASE_PX = 60` 这类手势阈值，量的是屏幕与手指，与 UI 大小无关。`FileTreeItem` / `InlineCreateRow` 的树缩进已改成「模板传无单位 `--depth` + CSS `calc(var(--depth) * 10px + 8px)`」，让缩进跟着 rem 走、不再走内联 px。
    - **`@container` 断点参数不被转换**（`mediaQuery: false`，且插件内部只特判 `@media`）：本仓 7 处 `@container` 阈值都是**手工写成 rem** 的——`EditorPane` 状态栏 3 处（`22.5rem` / `19.375rem` / `15.625rem`）、`TestCaseCard` 3 处（`35rem` / `22.5rem` / `15.625rem`）、`EditorSettingsPanel` 1 处（`35rem`，**`min-width` 升级**方向，见坑 7）；改断点时**别再写回 px**，否则缩放后断点位置与实际内容宽度脱节。`@media (max-height: 479px)`（`EditorPane`）与 JS 的 `SHORT_VIEWPORT = 480`（`useMobileKeyboard`）是一对刻意**都不转**的契约，两者必须同时是物理 px。
    - **被 JS `parseFloat` 读的自定义属性**：`App.vue` 的 `measureLimits()` 用 `style.getPropertyValue('--tests-min-cap') + parseFloat` 做拖拽数学，该变量一旦被转成 `rem`，`parseFloat("15rem")` 得到的是 `15` 而不是 `240`，上限直接算错（实测已确认保留为 `240px`）。所以 `--tests-min-cap / --tests-min-floor / --tests-min-ratio` 三个变量在 `propList` 里以 `!` 前缀排除、留在 px 坐标系；**不要**改成在 JS 里对 parseFloat 结果做 rem 反向换算。反之 `--seg-w` / `--seg-h`（胶囊宽高）是纯视觉尺寸、无 JS 读取，**不放**排除名单，必须整组一起随 rem 缩放——只保护其中一个会让胶囊扭形（28 × 27.5）。**「留在 px」不等于「不缩放」**：这三个变量是逻辑尺寸（100% 下的设计值），得在使用处各乘一次缩放倍数——CSS 的 `.pane--tests` 写 `calc(var(--tests-min-floor) * var(--ui-scale, 1))`（cap 同理，ratio 是比例不乘），JS 的 `measureLimits()` 写 `* uiScale.value`；`--ui-scale` 是无单位倍数，由 `applyUiScale()` 写在 `<html>` 上（`styles/base.css` 的 `:root` 里默认 `1`）。**两边必须同款**，否则 125% 下分隔条会与浏览器强行撑开面板的那条线错位（表现为拖到最窄时脱手）。
    - **`minPixelValue: 3`**：小于 3px 的值不转换，所以 1px / 2px 的细线、小间距（如胶囊的 2px padding）在缩放下始终是物理像素、不会亚像素模糊。
    - Monaco 那侧靠 `exclude: /node_modules/i` + `selectorBlackList: [/monaco/]` 双重排除（它的样式表经 `node_modules` 进 Vite 管线，整包不吃 rem），尺寸补偿改走 `services/editorOptions.js` 的 `editorOptions(settings, scale)`；缩放变化时 `EditorPane.vue` 的 `watch(() => props.uiScale)` 重新 `updateOptions()` + `nextTick(layout())`（容器尺寸同步也变了，补一次 layout 最稳）。
25. **越界的 panel share 必须在拖拽之前收敛**（`App.vue` 的 `reclampShare()`，2026-09-28 加）：`cp.editorShare` 是持久化的，而它的合法上限 `maxShare` 会随**缩放**（面板最低宽度跟着放大）与**视口宽度**（窄到 50% 那一项接手）变化。越界时浏览器靠 CSS 的 `min-width` 把面板撑住、JS 眼里的区间却已经挪走，于是**第一次拖拽**时 `applyShare` 会一口气把比例夹进新区间 —— 表现就是「拖一下就猛地跳一段」（150% + 存 82 实测纯瞬跳 13px）。由 `reclampShare()` 在三个时机补夹：挂载（`nextTick`）、`watch(uiScale)`、`ResizeObserver`。三条纪律：
    - **夹取是单向的**（`Math.min` 只压不放）：一旦压小，约束放宽后不会自己长回来。所以 ResizeObserver 那条必须走 `scheduleReclamp()` 去抖 150ms —— 拖窗口 / 切视口的途中会喂进一串「过渡尺寸」，拿它们夹取会把用户的比例**永久改小**。缩放那条是确定性的，一次跳变用一个 `nextTick` 接住即可。
    - **挂载期回写会与外部写入抢同一个 key**：`usePersistentRef` 在 `onMounted` 无条件回写一次，`reclampShare` 越界时再回写一次。用脚本往 localStorage 塞测试值时必须等挂载回写跑完，否则会被覆盖（曾据此误判成「过夹」）。
    - 只在面板可见时收敛（折叠态下 `virtualShare` 恒为 100，不参与）。

26. **超过 6000 字符的样例字段只截断「显示」，框仍可编辑，省略行是省略段的化身**（`TestCaseCard.vue`，2026-09-29 加、当天迭代三轮）：超长样例有两个问题——① 用户根本看不过来；② 每敲一个字符都要让**整段文本重新排版**（实测 10 万 3.5ms / 50 万 18ms / 100 万 37ms / 200 万 75ms；根因不是 `autoGrow`，文本排好版后 `autoGrow` 净开销是 0）。所以 `IO_PREVIEW_TRIGGER = 6000` 之上的字段只**渲染**开头 `IO_PREVIEW_CHARS = 4000` 个字符（在最后一个换行处收尾），后面接 `MARKER_SEED = '\n\n……'`；真值一个字节都不动。十一条纪律：
    - **真值始终是 `testCase.input` / `expectedOutput`，显示只是渲染层**：`inputModel` / `expectedModel` 是可写 computed，`get` 给「可编辑段 + 省略行」、`set` 走 `commitEdit()` 把省略段拼回。**别把截断文本直接写回字段**，那是静默的数据丢失。
    - **省略段长度在「进入长文本」那一刻冻结，掉出长文本时归零**（`inputHidden` / `expectedHidden` + `watch(longRef, …, { immediate: true })`，回调写 `long ? hiddenOf(值) : 0`）：预览段是按「4000 字符内最后一个换行」收尾的，边界要是每敲一下都重算，收尾位置就跟着挪，用户会看到文字随着自己打字凭空消失或冒出来。但**不能只写 `if (long)`** —— 用户把可编辑段全删光后真值只剩那截尾巴（实测 4505 字符，不算长），冻结值留着的话界面会一直摆着「还有 4,505 个字符未显示」而其实一个字符都没少（实测踩过）。watch 只在「长 ↔ 不长」那一次跳变上重算，长文本内部的打字不触发。（用例对象只在 `createCase` 造一次、此后没有外部写入路径，所以这个实例级缓存不会被别处改脏。）
    - **`commitEdit()` 的分支只有三种，第三种是血换来的**：① `hidden <= 0`（短文本）→ 直接写；② `raw` 里还找得到省略行 → 取省略行之前的部分 + 原真值的尾部 `hidden` 个字符；③ **`raw` 里找不到省略行了 → 省略段跟着一起走，同时按新内容重算 `hidden`**。第 ③ 条踩过的坑：早先写成「找不到就取整段 raw、再接回旧尾部」，于是用户**全选粘一份新样例进来**（选区含省略行、被一起覆盖）时，旧的 4500 个字符会被悄悄缀在新内容后面 —— 实测粘 12 个字符得到 4517 个字符，而框里看不出来。**改这段前先把这两种编辑分开想清楚**：省略行还在 = 局部编辑，省略行没了 = 整段替换。
    - **`displayOf()` 要防 `value.length < hidden`**：整段换掉后 `hidden` 归零/重算这一帧之间可能对不上，按字符数切会切出空串 + 一行假的省略行。宁可返回完整内容。
    - **复制靠 `copy` 事件接管，判据是「选区里含省略行」**：`onLongCopy(event, 完整内容)` 里 textarea 走 `selectionStart/End`、`<pre>` 走 `window.getSelection()`，命中就 `clipboardData.setData('text/plain', 全文)` + `preventDefault()`。**只选了一段、没碰省略行时一律不接管**——那时浏览器给的本来就是准确的那一段，替换成全文会让「复制我选的这几个字」变成复制 120 万字符。判据用 `MARKER_KEY = '……'`（不含前导换行与数字）：从省略行中间开始拖选时选区里没有开头那两个换行。⚠️ **省略行在 2026-09-29 缩成了一个光秃秃的省略号**（原来是 `…… 以下省略 N 个字符`），撞号概率因此变大了：**样例正文里只要出现「空行 + `……`」就会被 `commitEdit` 的 `indexOf(MARKER_SEED)` 误判成省略行**，出现 `……` 的选区也会触发全文复制。竞程输入里这种组合极罕见，接受这个代价；**改这两个字面量前必须把 `commitEdit` 的三个分支再读一遍**。另给一颗「复制全部」按钮兜底（移动端 / 不派发 copy 事件的场景）。三个框（标准输入 / 期望输出 / 实际输出）共用同一条逻辑，所以**文案与行为必须三处同时改**。
    - **`autoGrow` 的 watch 挂的是渲染值（`inputModel` / `expectedModel`），不是字段本身**：内容越过阈值时显示文本会整段换掉（4000 字 ↔ 120 万字），高度必须跟着重算。同时 `.field` 从 `<label>` 换成了 `<div>` + `for`/`id`（`case-<id>-input` / `-expected`）——字段里多了按钮，不能再让 `<label>` 包住整个字段（按钮的点击会被转发给 textarea）。
    - **长文本态不能 `disabled`**：只有 `locked`（正在跑）才禁用。框是可编辑的，长文本不是「另一套控件」。
    - **样式：底边虚线，不是整框虚框**。框能打字，整框虚线会被读成「这里不能编辑」；`.ta--truncated` / `.out-box.is-truncated` 只把 `border-bottom-style` 换成 `dashed`，**边框色必须从 `--border-soft` 提到 `--border`**——1px 虚线在浅色主题下没有对比度就等于没画（这条踩过两次，`.ionote__btn` 的边框同理）。说明行的文案是「还有 N 个字符未显示」（2026-09-29 删掉了后半句「· 全选可复制全文」——那句是在解释「全选能拿到全文」，而「复制全部」按钮的 `title`（`tests.card.copyFull`）里已经说了一遍，提示行再说一次是噪音），窄容器（`@container (max-width: 15.625rem)`）下只让文字让位、按钮留下。**框内不再重复这个数字**：框里那行标记就是一个 `……`（它本来就要滚动才看得见，写两遍数字是噪音），数字统一由下面那行承担。
    - **「框里装不下」有两种成因，但只有 ① 才算「真少了东西」、才配得上任何标记**（2026-09-29 第四、五次改，原话「这不是废话吗？纯溢出态就是没显示全，但是滚动就可以看到所有的，这没什么好说的吧」→「超出框高不需要虚线」）：① 被截断 —— 框里根本没有那部分字符，判据 `xxxHidden > 0`，它同时拿到**虚线底边 + 一行小字**（两样都是能操作的信息）；② **只是超出框高**（`autoGrow` 把上限压在 `MAX_IO_HEIGHT = 320`，约 15 行就满）—— 字符一个不少、全在框里，只是要滚动才看得见，**现在没有任何视觉标记**，只剩 `overflowY: auto` 自带的那根滚动条（浏览器给的，不是我们画的）。**最早只做了 ①，于是「十几行到 6000 字符」这一段是静默的**：框被内容撑满、底边还是实线、一行提示都没有（实测 200 行 ≈ 3000 字符就是如此，而 >6000 的样例反而有提示，看着像「越长的才有」）；后来给 ② 加了一行小字、又把虚线也共用了过去，这两样在第四、五次改动里被用户分别退掉。于是 `autoGrow(el)` 现在只摆盒子、**不再向 Vue 报告溢出状态**（`inputOverflow` / `expectedOverflow` 两个 ref 已删），模板里虚线与小字共用同一个判据 `xxxHidden > 0`。四条不能破：**(a) 提示行只在截断态出现，一句话「还有 N 个字符未显示」，N 就是 `xxxHidden`（精确的字符数，恒定）**。术语（这两个词在本文与代码注释里到处出现，先钉死）：**截断态** = 字符数过 `IO_PREVIEW_TRIGGER`，显示只留开头 `IO_PREVIEW_CHARS` 个字符，剩下的字符**根本不在框里**；**纯溢出态** = 字符数没过阈值、**一个字符都没少**，只是框不够高（上限 `MAX_IO_HEIGHT` ≈ 15 行）要滚动才看得见。**纯溢出态现在没有任何数字**：曾经算过一个「框里当前看不见的那截」（比例估算 `框内文本长度 × (1 − 可见内容高 / 内容总高)`，随面板宽度在 4,257 / 4,403 / 4,546 之间跳），第四次改动把它连同代码一起删了（`inputOverflowHidden` / `expectedOverflowHidden` / `omittedCount()` 都已不存在）—— 一个拖一下滚动条就能自己验证的数，报出来只会让人以为框尾少了字。⚠️ **这一行用户为它报过四次 bug，2026-09-29 的最终形态是「只在截断态出现 + 措辞用『未显示』」——别再给它加回纯溢出态**：①「有的时候显示已省略多少字，输入文本的底部仍然没有省略号」→ ②「字符多的时候输入框下方没有小字」（这两次促成了给纯溢出态也加一行）→ ③「（字符超出限制后）底部会有一个省略号，有时候没有省略号，例如 `vvvvvv…` 这种字符，最后不会有省略号」（实测复现：`v`×5000 走纯溢出态，框内 5000 字一个不少、框尾无 `……`，提示行却说「已省略 4,554 个字符」；于是措辞从「已省略」换成「未显示」）→ ④「这不是废话吗？纯溢出态就是没显示全，但是滚动就可以看到所有的，这没什么好说的吧」（于是纯溢出态那一行整个删掉）。中途还试过拆成两句（纯溢出态说「还有 N 个字符未显示 · 可滚动查看」，`tests.card.overflow`），也被否。**别再改成「已省略」，别再拆两句，也别再给纯溢出态加提示行**。**(b) 只有截断态才给「复制全部」按钮**：纯溢出态一个字符都没少、全在框里，没有「全部」可复制。**(c) 窄容器下只让「带按钮的那种提示行」的文字让位**（`.ionote:has(.ionote__btn) .ionote__text { display: none }`）—— 输出块底下那行提示没有按钮，藏掉就剩一条空行，靠 `:has` 把两种区分开。**(d) 纯溢出态框内不插省略号**：字符一个都不少，插了就是把正文改了；那种状态**没有任何标记**（没有提示行、没有数字、连虚线底边也没有）。`autoGrow` 只写 `el.style.height` 与 `overflowY`，宽度不受影响，不会和 ResizeObserver 形成回调环。
    - ⚠️ **给模板传 ref 时：收的是值，不是 ref**（这条踩过两次，函数现在虽然已随第四次改动删掉，但坑本身还在 —— 模板里 `copyText(testCase.input)`、`onLongCopy($event, testCase.input)` 都是这个形状）：模板里 `inputHidden` 这类 ref 会被 Vue 自动解包，函数签名要是写成 `(hiddenRef, …)` 再去 `.value`，拿到的是 `undefined`，一路传到 `fmt()` 就是 `Cannot read properties of undefined (reading 'toLocaleString')` —— **而这次抛错发生在渲染期，整张卡片会一起渲染失败，连框里的省略号都出不来**（症状极具误导性：看着像「截断逻辑坏了」，其实是翻译函数炸了）。
    - **文本结尾那个 `……` 时有时无，是两条独立的线**（2026-09-29，用户问过）：**① 字符数有没有过 6000** —— `displayOf()` 只在 `long && hidden > 0` 时追加 `MARKER_SEED`，≤6000 字符显示的就是完整内容，结尾**根本没有**省略号（哪怕超出框高要滚动也没有，那是纯溢出态）；**② 截断态下有没有滚到底** —— `……` 是文本的最后一行，不滚到底就在视口外，所以**同一个样例**也会看着时有时无。下面的提示行与虚线底边都只在**截断态**出现（纯溢出态既没有提示行、也没有虚线底边、也没有省略号，见 (a)/(d)）。⚠️ **别为了「让它稳定出现」把 `……` 做成画在框上的浮层**：2026-09-29 试过（`.ta-wrap` / `.ta-wrap--more::after`，条件「真截断 + 还没滚到底」、滚到底时让位给正文那颗），**用户当天否掉了** —— 他要的就是文本结尾那个 `……`，别再提这个方案。（那次尝试留下的两个技术点仍成立：textarea 放不了伪元素所以要包一层定位；`@scroll` 只能挂具名 handler —— 模板里 `@scroll="onTaScroll($event.target, someRef)"` 传进去的是**解包后的布尔值**，函数里再 `.value = …` 就是 `Cannot create property 'value' on boolean 'false'`，与 `omittedCount` 那次是同一类坑的两个方向：**读** ref 拿到 `undefined`、**写** ref 直接抛错。）
    - ⚠️ **不要再改回「只读预览」**：用户明确要的就是「过长时仍然能编辑，只是只能改未被省略的部分」。第二版曾整体改成 `readonly` 并用一颗「编辑完整内容」按钮兜底，当天就被这条要求推翻。反过来，**删掉省略行里的一两个字也会连省略段一起丢** —— 这是第 ③ 条分支刻意选的代价，与「选中省略号就等于选中被省略的那段内容」是同一个心智模型，别再为了「救回那几个字」把分支逻辑搞复杂。
27. **localStorage 每个源大约只装得下 520 万 ASCII 字符，而 `cp.testCases` 是 deep watch + 全量 `JSON.stringify` 写入**（实测：100 万字符的输入 + 100 万字符的期望输出 = JSON 220 万字符 ≈ 源的 40%）。写入本身不慢（stringify 0.9ms + setItem 1.2ms），可怕的是 `usePersistentRef` 的 `catch` 会把配额错误**吞掉**：超限以后界面一切正常，**刷新却回退到旧版本**。目前刻意没修（用户 2026-09-29 决定本轮不动），但写任何「要不要把大数据放进用例」的功能前先想清楚这条。
28. **界面双语：`t()` 读的是 ref，所以「在哪里调」比「翻得对不对」更容易出错**（`src/i18n/`，2026-09-29 加）：机制是模块级单例 `locale = ref(...)` + `t(key, params)`，`t()` 每次调用都读当前 ref。由此推出下面几条，**第 1 条是这一整套设计里唯一真正的陷阱**：
    - **模块顶层 / `<script setup>` 顶层调 `t()` = 冻结语言**：那时只取到「那一刻」的语言，切了语言这些字符串不会变。模板里、computed 里、函数体（事件处理 / 生命周期）里调都没问题。所以**数据驱动的表一律只存 key**——`EDITOR_GROUPS` / `SECTIONS` / `RUNTIMES` / `THEMES` / `SHORTCUT_ACTIONS` / `OJ_LIST` / `LUOGU_LEVELS` / 各引擎的 `labelKey` / `Sidebar.vue` 的 `PANEL_TABS` 都改成 `labelKey` + `hintKey` + `labelParams`，由消费处（模板 / computed / 一处 `labelOf()` 小工具）再 `t()`。漏一个的症状很隐蔽：设置面板切语言后大部分变了、某一处的下拉项还是中文。**顺带一条**：调用纪律也适用于 `runner.js` / `engines/*` / `vfs/*` 这些 service——它们的 `t()` 都在函数体里（跑起来才调），所以正确；但**模块级常量**（如 `BaseVFSProvider` 原先的 `NOT_IMPLEMENTED`）必须改成惰性的 `const notImplemented = () => t(...)`。
    - **语言要在任何组件挂载之前定下来，所以不走 `usePersistentRef`**：那个 composable 靠 `onMounted` 播种首次写入，而界面语言的首帧不能先闪一下中文再切英文。`i18n/index.js` 因此自己读写 localStorage，初值在第 0 帧同步算出（存档优先，没有存档才探测 `navigator.languages`：任一命中 `/^zh\b/i` → `zh-CN`，否则 `en`）。`switchPanel` 那种「切了当场生效、不重载」的效果落在这里：`locale` 是 ref，模板 / computed 全是响应式的。`applyLocale()` 负责同步 `<html lang>`（模块加载时一次 + `watch(locale)` 跟随），**别在别处再写一份**。
    - **新键是 `cp.uiLocale`，不是 `cph.language`**：`cph.language` 是「编辑器判题语言」的死键（顶栏下拉删除后作废，见坑 15 与第 6 节），两者语义完全不同，别再合并。界面上的文案刻意写成「**界面语言**」，用来与「判题语言（由文件扩展名派生）」区分。**别把语言选择器当成「把判题语言加回来」的借口**。
    - **写进文件系统的名字不翻译**（第 1 节有这条硬约束）：`problemImport.js` 的 `未分类` / `未命名题目`，以及 `OJ_LIST` 上新加的 `dirName`（洛谷 / Codeforces / 牛客…）。**`labelKey` 与 `dirName` 是两个字段、刻意不合并**——显示名跟着语言走、落盘名永远固定，否则用户切一次语言就会在同一个逻辑位置看到两个目录（`/2026-09/洛谷/` 与 `/2026-09/Luogu/`），老题解直接变孤儿。`formatMetaTooltip()` / `difficultyLabel()` 走 `labelOf()` 拿显示名，导入路径走 `dirName`。
    - **标签自称用哪种语言是有讲究的**：`LOCALES` 里 `简体中文` 与 `English` 都是**自称**，不跟着界面语言变（中文界面里也显示「English」而不是「英文」）。同理 `guide.html` 页头的语言链接写 `English`、`guide.en.html` 那侧写 `简体中文`（各带 `lang` 属性让屏幕阅读器读对）。`fmt` 的千分位也必须跟随语言（`n.toLocaleString(locale.value)`，原先是写死的 `'en-US'`），否则英文界面里的「1,234」在中文界面下也不该变、但 `… 个字符` 的量词要跟着变——两件事别混。
    - **超长样例的省略行干脆没有文案**（与坑 26 配套，2026-09-29 改）：框里那行截断标记就是一个光秃秃的 `……`，定位与判据用两个**语言无关**的字面量 `MARKER_SEED = '\n\n……'` / `MARKER_KEY = '……'`；具体省略了多少由框下面那行说明承担，它走 `tests.card.omitted`（`还有 {n} 个字符未显示` / `{n} characters not shown`；只在真截断时出现，原因见坑 26 (a)）。**别把省略号挪进消息表**——`commitEdit()` 靠 `raw.indexOf(MARKER_SEED)` 认「省略行还在不在」，`onLongCopy()` 靠 `MARKER_KEY` 认「选区里有没有省略行」，两者一进消息表就会跟着语言变、历史文本也会失配。
    - **漏网之鱼要往两个方向查**：上一轮迁移的复查只搜了「硬编码中文」，结果**硬编码英文**漏了三处——
      `TestCaseCard.vue` 三个字段的小标题（`Standard Input` / `Expected Output` / `Actual Output`）
      一直是写死的，中文界面里也显示英文（2026-09-29 用户报了输入框那处才挖出来）。
      **复查脚本要对称**：既要搜中文字面量、也要搜「模板文本节点里裸露的 ASCII 词」。
      别把 `UTF-8` / `OJ` / `chrome://extensions/shortcuts` 这类专有名词、URL、缩写当成要翻的——它们刻意不翻。
      ⚠️ **挖出来不等于一定要翻，而且要问到什么粒度**：那三处小标题**一个都没留下 i18n**。
      输入框那条先按用户当轮的原话接了 zh `输入` / en `input`，用户随即指出「应该也是 `input`」——
      因为三个标签并排、另一个已经改回英文，混着写成中英两种看着不齐。于是全部退回写死的
      `input` / `Expected Output` / `Actual Output`（2026-09-29 同日，两次来回）。
      **现在的口径（2026-10-06 更新）**：三个小标题仍是写死的英文、中英界面都一样，但末二词
      砍短成 `input` / `Expected` / `Actual`（用户当轮要求：那一行窄，而每个框本来就是「标题 + 框」，
      `Output` 二字没有增量信息）；**框里的灰字占位两个都跟着语言走** —— `tests.card.inputPlaceholder`
      （中文「输入」/ 英文 `input`）与已有的 `tests.card.expectedPlaceholder`。
      ⚠️ 2026-09-29 那句「别再把 `input` 那条接回 i18n」**已被 2026-10-06 的决定推翻**，
      别再照它改回去；现在的边界是「小标题不翻、占位翻」。
    - **无头探针里 `navigator.clipboard.readText()` 恒返回空串**（见第 8 节与本仓的探针技能），验证语言切换要走 localStorage + DOM 文本；且**同一个 browser 里 localStorage 跨页共享**，探针第 0 帧必须先 `localStorage.clear()`，否则前一组用例种下的 `cp.uiLocale = 'en'` 会污染后面所有页面（实测踩过，表现为一整组假失败）。
29. **预览页签的钉住手段有两条，但真正兜底的是「编辑即钉住」**（2026-09-30 加）：钉住入口是**双击文件树的行 / 双击页签栏的页签 / 在预览页签里敲第一个字**。前两条都靠浏览器原生 `dblclick`，而**原生 `dblclick` 在部分 Android / iOS 浏览器里压根合成不出来**（分隔条那处折叠 / 展开因此不走 `dblclick`，改在自己的 `pointerup` 上认，见第 3 节）。所以 `workspaceStore.js` 里那条 `watch(modelManager.isDirty(previewTabId))` 不是「顺手加的 VS Code 细节」，而是触屏唯一可靠的保命闸——少了它，用户在预览页签里正在改的内容会被下一次单击顶替掉。另外 `previewTabId` 刻意**不落 localStorage**（刷新后退化成普通页签，无害），它**没有**进第 6 节的表，别顺手补上，也别把它塞进 `cp.openTabs` 那一份存档格式里。

30. **触屏拖拽要「三件套」，缺一件只在真机上现形**（2026-10-10 加，起因是用户报「拖动标签页没有对触摸屏做适配」—— 手势状态机在无头探针里全绿，真机上却是「长按弹系统菜单 + 文字被选中 + 条带先滚起来」）。三件事：① 目标元素要声明 **`touch-action`** —— 横向滚动容器写 `pan-x`、纵向列表写 `pan-y`，**绝不能图省事写 `none`**（手指在它上面就再也滚不动那个容器了：页签条 / 文件树都是靠手指滑的，写 none 等于砍掉滚动）；② **`user-select: none` + `-webkit-user-select: none` + `-webkit-touch-callout: none`** —— 否则长按 450ms 起手时先选中文字，iOS 连放大镜 + 菜单一起弹出来，拖拽当场变成选词；③ **`contextmenu` 从 `pointerdown` 那一刻就接管**（系统长按菜单阈值 ~500ms，与长按判定贴得太近，等 armed 再拦会晚一步），非被动 `touchmove` 也**在按下时就挂好**、只在 `armed / dragging` 时才 `preventDefault`（早挂是因为浏览器在 `touchstart` 就决定了这次手势要不要等 JS；没 armed 时不拦，短滑才是原生滚动）。⚠️ **这三条在无头探针里一条都测不出来**：`Input.dispatchTouchEvent` 走的不是浏览器真正的手势识别器，`contextmenu` / `selectstart` 永不触发、触屏那份 `:hover` 也不补 —— 于是「长按后横拖 → 顺序真的变了」会全绿，而真机上一塌糊涂。唯一的无头验法：**在按压期间派发一个 `cancelable` 的合成 `contextmenu` / `touchmove`，断言 `event.defaultPrevented === true`；松手之后（以及 armed 之前的 `touchmove`）再派发一次，断言是 `false`** —— 正测 + 反证成对出现，否则「拦没拦」这条断言没有牙。另外两条同类经验：④ **长按中间那段等待必须给反馈**（`--pressing` 进度 + `--armed` 就绪，见第 3 节页签与文件树两格）—— 触屏借不到 `hover`，450ms 不给反馈就是「按了没反应」；⑤ **进度那 450ms 必须与 `LONG_PRESS_MS` 对齐**，两处都留了交叉注释。参照实现是 `useTabDrag.js` + `EditorTabs.vue` 与 `useTreeDrag.js` + `FileTreeItem.vue`（`pressingId` / `armedId`），**改一处记得对一遍另一处**。

31. **Monaco 的触摸手势有三个硬事实，要在编辑器上做触屏交互就得先知道**（2026-10-10 加，动 `composables/useEditorMenu.js` 前先读这里）。三条都写在 `node_modules/monaco-editor/esm/vs/base/browser/touch.js` 与 `.../browser/controller/pointerHandler.js` 里，**是常量不是配置项，改不了**：
    - **长按阈值是 `HOLD_DELAY = 700ms`，带一个 30px 位移窗**。`touchend` 那一刻：holdTime ≥ 700 且位移 < 30px → 派发 `-monaco-gesturecontextmenu`（Monaco 随即弹它自己的菜单）；holdTime < 700 且位移 < 30px → 派发 `-monaco-gesturetap`；位移 ≥ 30px → 走惯性滚动。**触摸下的拖动只滚动、不做选择**，别指望能框选。
    - **`tapCount` 的上限被写死成 2**。`Gesture.dispatchEvent` 只产出 1 或 2（两次轻点间隔 400ms 内算 2），而消费侧 `viewController.dispatchMouse` 的分支是 `2 = 选词 / 3 = 选行 / ≥4 = 全选` —— 所以**三击选行在触屏上根本到不了**（第三次仍带 `tapCount: 2`，结果还是选词）。要做三击得自己数（2026-10-11 已做：`useEditorMenu.js` 的 `onMonacoGestureTap` 借 `tapCount` 往下数到 3 = 选行 / 4 = 全选，完了必须在捕获阶段把那发 Tap 拦掉，见第 3 节手势表）。
    - **Monaco 内置菜单渲染在 shadow DOM 里**（`.shadow-root-host`）：`document.querySelector('.monaco-menu')` 查不到它。探针里判「内置菜单弹没弹」要遍历 `el.shadowRoot`，或者干脆不查它、只验我们自己那份菜单出现没有。
    两条实现纪律：① **拦截要挂「祖先 + 捕获阶段」** —— Monaco 把 `-monaco-gesturetap` / `-monaco-gesturecontextmenu` 直接 `dispatchEvent` 到 `.view-lines`（`bubbles: false`），冒泡阶段抄不到；而且**同一元素上的两个监听器之间 `stopPropagation` 不管用**（只有 `stopImmediatePropagation` 管），所以必须挂在 `.monaco-editor` 的祖先上（`useMobileKeyboard` 拦 Tap 用的就是这一招）。② **自己判了长按，就得把 Monaco 那一发拦掉** —— 我们 450ms 接管之后，700ms 时 Monaco 还会派发一次 `Contextmenu`，不拦就是「长按弹两次菜单」。**2026-10-14 起这条拦改成无条件**（原先用 `handledTouch` 标志只拦「已被我们接管」的那一发，漏见下面那条追记）。
    **2026-10-14 追记：「Monaco 那份菜单被彻底关掉」靠的是选项，不是靠拦**（用户报「触屏用手势能打开 Monaco 原生右键菜单」）。上述第一条那个 **30px 位移窗**与本仓 `useEditorMenu.js` 的 **`MOVE_SLOP = 10px`** 之间有一条缝：手指按住后先在原地动过 10px 又不到 30px 时，我们撤了长按（`press = null`、`handledTouch = false`），而 Monaco 的 700ms 判定照旧在 `touchend` 到点、把 `-monaco-gesturecontextmenu` 发出来 —— 旧代码那句 `if (!handledTouch) return` 正好把它放过去，于是它那份英文菜单冒出来（放行还附带一次 Monaco 自己的 `editor.focus()`，触屏上等于把键盘弹起来）。修法两条一起上：① `services/editorOptions.js` 给编辑器下 **`contextmenu: false`**（Monaco 自己的开关，`contrib/contextmenu/browser/contextmenu.js` 三个入口全早退 ⇒ **任何入口**都弹不出来，含 Shift+F10 / Menu 键那条键盘路）；② `onMonacoMenu` 改成**无条件拦**。那条缝本身还在（10px 与 30px 两个阈值不变），只是现在缝两边都不会有菜单冒出来。
    顺带一条实测口径：**探针里要判「选没选中」必须拿真的 editor 实例**（`await import('/@id/monaco-editor')` → `editor.getEditors()[0].getSelection()`）。读 DOM（`.selected-text` / `.view-overlays .selection`）在这套渲染下拿不到东西，会得到一片「怎么弄都没选中」的假结论；同理，**落点要用 `Range.getBoundingClientRect()` 精确点到某个字母上**，点在括号 / 空白上时 `getWordAtPosition` 返回 null，双击看起来也像「没选词」。

32. **往编辑器里叠自己画的浮层（尤其是能当拖拽把手的那种），一定要防「它挡住 Monaco 自己的命中测试」**（2026-10-10 加，做触屏选区手柄时踩到，症状是「拖着拖着手柄就不跟手了」）。`editor.getTargetAtClientPoint(x, y)` 看着像是纯数学换算，其实**在没传 `eventTarget` 时会自己做一次 DOM 命中测试**：`mouseTarget.js` 的 `HitTestRequest` 里 `_useHitTestTarget = !hasEventTarget`，于是它走 `document.elementFromPoint` 拿到那个点上真正的元素。而 `_createMouseTarget()` 的头两行是「元素不在 `.overflow-guard` / `.overflowingContentWidgets` / `.overflowingOverlayWidgets` 里 → `fulfillUnknown()`」，`fulfillUnknown(position = null)` 默认参数是 null —— 于是**返回的对象 `position` 为 null**（`type: 0`）。后果：我们自己的手柄压在落点上时，`applyDrag` 拿不到位置、静默放弃这一帧；更糟的是那个落点正是手柄自己所在的位置，**下一帧手柄没动、落点还在盒子里，拖动就此永久卡死**（不是「慢一拍」，是「再也拖不动」）。三条防法：
    - **拖动期间给手柄挂 `pointer-events: none`**（本项目是 `.selection-handles.is-dragging .selection-handle`）—— `elementFromPoint` 会跳过 `pointer-events: none` 的元素，于是它照样看得见下面的代码。拖动本身不受影响：`pointermove` / `pointerup` 挂在 `window` 上，触摸另有隐式指针捕获。
    - **别用「移动距离够大就没事」来侥幸**：常态下圆点与手指是错开的（起点手柄的锚在行**上沿**、手指落在行**中间**，天然差半行），所以大位移看着都正常；只有**移动量小于半个盒子高度（约 44px）**时落点才会落回盒子里 —— 往上拖一行、往下拖两行，正好都在这段里。
    - 探针判据也很直白：`document.elementFromPoint(x, y)` 从 `span.selection-handle--start` 切到 `span.mtk8`（代码）的那一列就是分界线。**x 轴上扫一遍**（336 / 344 / … / 416）比只测一个点可靠得多，本轮就是靠这个把「断言写错」和「真卡死」分开的。
    同类风险：任何盖在编辑器上的自绘层（悬浮工具条、拖拽把手、标记浮标）都可能这样吃掉 Monaco 的命中测试，加之前先想清楚它在不在拖拽路径上。

33. **右键菜单：全站只剩一份实现，且它的悬停色是蓝的不是灰的**（2026-10-10 加，样式与字距都以用户给的一份 vanilla IDE 右键菜单模板为准）。七条：
    - **只有 `ContextMenu.vue` 一份**。文件树的节点菜单与编辑区的编辑菜单（2026-10-10 由 `useEditorMenu.js` 接过 Monaco 内置那份，见坑 31；同日补到 Monaco 默认菜单的可达全集）都走它、都 Teleport 到 body —— 所以改样子只改这一个文件 + `base.css` 的两组 `--menu-*` 令牌，全站一起变。**别在别处再手搓一个列表**。
    - **`--menu-hover-bg` 是蓝的**（深 `#04395e` / 浅 `#0060c0`），与站内通用的灰悬停 `--bg-hover` **不同源、也不该统一**：它就是模板原值，也正是 VS Code 的 `list.activeSelectionBackground`，而浅色那支是同一个颜色 id 的 light 项 —— 那整组令牌是 **Dark+ / Light+ 的官方配对**（主文字 = `foreground`、描边 = `dropdown.border`），所以**别凭手感调、更别以「跟文件树悬停保持一致」为由换成灰的**。
    - **`--menu-muted` 是两套主题里唯一刻意取不同"档位"的一个**：模板的 `#858585` 压在白底上只有 3.4:1、11px 的快捷键太虚，浅色压到 `#767676`（4.5:1）。其余每个令牌都是官方对应值，原样照抄。
    - **右列键位：只有「真有」的才标**。编辑区那六项由 `useEditorMenu.js` 的 `SHORTCUT` 喂数据，取的是 `formatCombo('Mod+F2' | 'Mod+KeyX' | 'Mod+KeyC' | 'Mod+KeyV' | 'Mod+KeyA' | 'F1')` —— **显示的就是 Monaco 的内置默认键位，按了真的会跑**。〔2026-10-10 更正：这条原先写「文件树那四项站内没有任何键位绑定，所以留空」—— 用户随后点名「重命名和删除这两个完全可以绑定上快捷键」，那两条于是**真绑了**（`F2` / `Delete`），右列由 `FileExplorer.shortcutOf()` 读绑定表给出，见第 13.4 节。〕剩下那些（题目信息 / 新建文件 / 新建文件夹）是真没有键位，**留空、别编**；「打开题目」那格是 2026-10-11 加的，填的是 `⌘ / Ctrl + 单击` 这个**手势**本身（`t('explorer.menu.openUrlClick', { mod })`，macOS 给 ⌘、其余给 Ctrl，**不经过 `formatCombo`** —— 它只吃 `'Mod+KeyX'` 那种 keydown 串，而这是一个鼠标事件的修饰键，也正因此它不进绑定表、不占任何键位）。写法一律走 `formatCombo`（站内唯一那一份）：macOS 出 `⌘ + X`、Win / Linux 出 `Ctrl + X`，与设置页的快捷键列表永远同一套符号。`formatCombo` 只吃平台常量、不吃 i18n 的 ref，所以**可以在模块顶层算**（不受「顶层 `t()` 会把语言冻住」那条约束）。要让某一项显示键位，往那个菜单的 items 里加 `shortcut` 就行（**keydown 键位一律从绑定表取，别写死字符串**；唯一的例外就是上面那条「打开题目」的手势提示），别改 CSS 去硬凑。
    - **编辑区菜单的条目 = Monaco 默认菜单在本应用的「可达全集」**（2026-10-10 补）。判据不是「像不像 VS Code」，而是 Monaco 自己会不会显示：`MenuId.EditorContext` 里凡带 `hasXxxProvider` 前置条件的条目（Go to Definition / Declaration / Type Definition / Implementations / References / Peek ▸ / Rename Symbol / Format Document / Format Selection / Refactor / Go to Symbol…）在本应用**一个都不成立**（全仓只注册了 `languages.registerCompletionItemProvider`，见 `services/monaco/completion.js`），Monaco 也**不会**把它们渲染出来。去掉这些后只剩「更改所有匹配项」（`Mod+F2`）与「命令面板」（`F1`）两条没补，即本次补的这两条；分组照 Monaco 的 group 走（`1_modification` / `9_cutcopypaste` / `z_commands`），组间一条分隔线。「全选」并不属于全功能编辑器的默认菜单（它来自 `SimpleEditorContext`），是刻意保留、并进剪贴板那一簇的一项。**别为了凑数往菜单里塞点不动的条目** —— 那与「只登记本应用真做得到的动作」是同一条纪律（见 `useShortcutManager.js` 里格式化没进绑定表的注释）。
    - **点菜单项触发 action 前必须 `editor.focus()`**（2026-10-10 实测踩到）。菜单是 Teleport 到 body 的 `<button>`，点它会把 DOM 焦点从 Monaco 的 `div.native-edit-context` 上抢走；`editor.action.quickCommand` 拿不到聚焦编辑器会**直接抛** `Quick input service needs a focused editor to work.`（画面表现是「命令面板点了没反应」）。`useEditorMenu.js` 的 `onMenuSelect` 先 `closeMenu()`、再 `instance.focus()`、最后才 `trigger`。剪贴板那几条不挑焦点，但一并归还没有副作用。
    - **行高刻意不写死 ⇒ 「条目高」是跟着界面语言走的，别当常数断言**：`.context-menu__item` 只给 `font-size: 13px / font-weight: 400 / line-height: normal`。实测（macOS / macOS 上 dSF=2）：**英文界面** 13px 拉丁天然行盒 **16px** → 条目 **28px**（与模板逐像素相同）；**中文界面** 天然行盒 **18px** → 条目 **30px**（CJK 行盒天生高一档，模板若写中文也是这个数）。所以中英条目高差 2px 是**预期**、不是 bug。同理别在 `base.css` 里给菜单补一个写死的行高 —— 上一版写的 `18px` 正好是中文那一档，等于把英文界面也撑高了 2px。真要让两种语言都锁 28px，得把 `line-height` 写成 `16px`，**那会明确违背「照模板」的前提，改之前先问**。

34. **作用域受限的快捷键：闸门必须拦在 `preventDefault()` 之前，且「焦点在哪」比「选中了什么」更靠谱**（2026-10-10 加，做 F2 / Delete 两条文件树快捷键时整条踩遍；重命名的键位 2026-10-20 起按平台分岔，见第 13.4 节）。五条：
    - **两张表分工**：`SHORTCUT_HANDLERS`（App.vue）是「在哪儿按都算」的；作用域受限的进 `SHORTCUT_TREE_HANDLERS`，先过 `treeScopeFrom(event, actionId)` 再动手。判据是**焦点落在资源管理器那块面板里**（`[data-panel="explorer"]`）—— **行上、以及树的空白处都算**（2026-10-12 放宽；容器上有 `tabindex="-1"`、点空白由 `onTreePointerDown` 把焦点收进去，见第 5 节坑 41）。落点不在行上时 `rowId` 给 null：F2 / Delete 由 `FileExplorer.keyboardRowId()` 退回主选中那一行，⌘A 把 null 读成「焦点在根上」（选根的内容）。
    - **闸门必须在 `preventDefault()` 之前**。看着像废话，但顺手写在 handler 里就会错：那个位置 `preventDefault()` 早执行过了，于是「不在树里」的场合（编辑器里删字符、输入框里退格）全被静默吃掉。正确写法是在取 `SHORTCUT_HANDLERS[actionId]` **之前**先判，判不过直接 `return`，连 `preventDefault` 都不碰。
    - **可编辑元素必须排掉，但也别只靠它**：内联重命名的输入框就在行**内部**（`[data-tree-id]` 的子树里），不排掉的话改名时按 Delete 会删不掉字符、反倒弹出删除确认框（实测踩到，已修）。⚠️ 反过来的坑：Monaco 现在用的是 **EditContext**（`div.native-edit-context`，不是隐藏 textarea），按标签名做「可编辑」判定根本抓不到它 —— 真正兜住编辑器那条路的是「必须落在树行上」这个更强的前提，「排掉可编辑元素」只是第二道保险。
    - **裸键（不带修饰键）只在有闸门时才敢用**：`Delete` 这类键的放行写在动作自己的 `bareCodes` 里、由 `bareAllowedFor()` 判定（`SAFE_BARE_CODES` 之外唯一的开口），录制框共用同一个判据 —— 否则 `Delete` 在录制态还是「清除绑定」，那条动作被清掉就再也录不回来（只能整组复位）。
    - **焦点要归还**：重命名框 / 删除确认框一消失，焦点就落到 `<body>` 上；不还回去的话「F2 → Esc → F2」第二次没反应，观感正是「快捷键只能用一次」（实测出来的症状）。归还只走**明确的键盘路径**（Esc 取消、回车提交）与**取消删除**；**「失焦提交」那条绝不能还** —— 那条正是「用户点到别处去了」。
    两条实测口径：① 桌面端点一个**还没打开过**的文件行，`EditorPane` 的 `instance.focus()` 会把焦点交给 Monaco（`activeElement` 是 `div.native-edit-context`），那之后 F2 / Delete 不生效，得再点回树里；点**文件夹行**或**已经打开着的**文件行时 `activeId` 没变、那条 watch 不响，焦点留在行上。② 探针里凡「取消之后接着再按一次」的用例，都要先确认焦点回到了行上，否则会把「焦点丢了」误报成「键位没生效」（本轮就这么误报过一次）。

35. **折叠态那一帧的 `flex-basis` 必须是 `0%`：越界展开不许提前接管像素直连**（2026-10-11 加，用户报「展开动画出现的位置与最窄位置不同、动画结束还跳一下」）。两条：
    - **成因**：`testsPaneStyle` 里 `dragPanelPx !== null` 的分支**优先于** `panelVisible ? '${100-editorShare}%' : '0%'`。于是 `handoffDrag(true)` 一旦在翻状态之前把 `dragPanelPx` 写成 `minPanelPx`，折叠态（还挂着 `is-collapsed`、图标栏仍占着 48px、侧栏挤在它右边）那一帧的 flex-basis 就变成最窄宽 —— 展开动画的起点（`0%`）被顶掉。实测（W=1400、`uiScale=1`、侧栏在左、拖到 x=170）这一改之前：`t=160ms` 面板先整块撑到 240px（分隔条中心跳到 **296**，而指针在 170），`t=213ms` 图标栏让位时面板左移 48px、分隔条再跳到 **248** —— 两次位移，正是用户看到的「出现在别处 + 结束再跳」。
    - **修法**：展开只写 `editorShare`（反算到最窄宽度），`dragPanelPx` 保持 `null`，让 `togglePanel()` 自己从折叠态的 `0%` 补间到最窄宽；像素直连交给翻转后的下一帧（`move()` 的展开分支按指针位置夹进 `[minPanelPx, maxPanelPx]`，此刻两者都等于最窄宽，不会抖）。改完同一场景只剩一次 `1px → 240px` 的翻转、分隔条直接落在 248；非 VT 路径（删掉 `document.startViewTransition` 实测）则是一条 0 → 240 的 200ms 平滑曲线。折叠方向不受影响（240 → 1 的序列照旧）。
36. **服务层（不在组件里）的单例偏好别用 `usePersistentRef`**（2026-10-11 加，把 `cp.panelPosition` / `cp.uiScale` 从 `App.vue` 下沉到 `services/shellSettings.js` 时踩到）。那份 composable 的「首次访问也落盘」是 `onMounted(write)` —— 而服务层模块是在组件之外被 import 的，那里**没有 active instance**，Vue 只给一句警告、回调根本不注册。于是新用户第一次打开站点时不留下存档：回归脚本 A 步读 `cp.panelPosition` 得到 `null`（断言 `storedPanel === 'left'` 当场红），而界面看着一切正常（内存里的 ref 是有值的），极难往「没落盘」上想。服务层一律照 `editorSettings.js` / `i18n/index.js` / `fileTemplates.js` 的体例：**模块自己读盘，再用 `immediate` 的 watch 写回**（首值也立刻落盘）。判据：`localStorage.getItem('cp.panelPosition')` 在全新 profile 的首帧就该有值
37. **Teleport 的目标元素与源同在一棵挂载树里时，必须加 `defer`**（2026-10-11 加，侧栏页头重构时踩到）：两个面板把自己的页头动作区投进 Sidebar 页头的 `#sidebar-context`，目标与源同一次挂载 —— Vue 首挂是把整棵子树建完才插进 document 的，所以源挂载那一刻 `document.querySelector('#sidebar-context')` 还查不到（Vue 只 warn 一句「Invalid Teleport target」，注意 puppeteer 里这句是 `warn` 不是 `warning`/`error`），内容**创建而不挂载**。这些 vnode 的 `component` 因此是 null；下一次任何响应式更新 patch 到里面的组件（如 AppIcon）就在 `shouldUpdateComponent` 崩 `Cannot read properties of null (reading 'emitsOptions')`，那一帧之后的渲染整段中止（实测：文件树永远挂不上、用例加不出来，而首屏看着「基本正常」）。修法一行：`<Teleport defer ...>`（Vue 3.5+），等整个应用挂完再解析目标。判据：Teleport 的 `to` 指向的元素若**不是 body / 早就挂在 document 里的节点**，就要 `defer`。
38. **树里的焦点（focusin）只准记账、不准写选区**（2026-10-12 加，做文件树多选时踩到）：`FileExplorer.onTreeFocus` 原来会顺手 `selectNode(焦点行)`，单选时代是无害的重复写入；多选一来就成了杀手 —— **⌥/Alt + 单击的时序是 pointerdown（聚焦）在前、click（切换选中）在后**，focusin 那一下先把选区收成单选，等 click 跑到 `toggleSelection` 时多选已经被冲掉了，实测「加选永远变成先清空再加一个」。选区的写入只走明确的入口：鼠标在 `FileTreeItem.onClick`（单击收成单选 / Alt 切换 / Shift 划范围），键盘在 `focusRowAt`（挪焦点后显式单选或扩选）。同理两条：① `paths.js` 的 **`isWithin(dirPath, maybeChild)` 目录在前**，「A 在 B 里面」写 `isWithin(B, A)` —— 多选删除的去重（`pruneNested`）第一版就传反了，结果把祖先剔掉、留下后代，删完目录再删子路径平白报错；② `workspaceStore` 里 `selectedId` 与 `selectedIds` 这对状态**只准在 `applySelection()` 一处同时写**（约束：集合去重、主选中落在集合里、集合空则主选中为 null），散着写必然对不上。
39. **排号拆名要用 `stem`、不能用 `extname`：`paths.js` 这两个函数收的入参刻意不同**（2026-10-12 加，做文件导入时现形）。`treeOps.uniqueNameIn` 要拆「主干 + 扩展名」给重名排号用（`a.cpp` → `a-2.cpp`，后缀插在扩展名**之前**），第一版写的是 `extname(name)` —— 但这两个函数签名是刻意分开的：`stem()` 收**单级名称**直接切，`extname()` 收的是**路径**、内部走 `basename` → `normalize`，喂给它 `'a.cpp'` 会当场抛「VFS 只支持绝对路径」。这一行**只在真的撞名时才走到**，所以从「新建文件」（默认名自己排号、库里尚无同名）到「拖拽移动」一路都没碰上，直到导入功能开始频繁重名才现形（症状：重名导入报「没有可导入的文件」、`failed=1`，看着像整个导入都坏了）。判据：**凡收单级名称的场合一律用 `stem`**，`extname` 只用在手里已经有绝对路径的地方。同一条路上还有一处同源教训：**`collectExport` 自己也要调一次 `pruneNestedNodes()`** —— 不能把「选区里不会有祖先与后代同时在场」寄在调用方的自觉上：同时选中 `a/` 与 `a/b.cpp` 会打出两条同名的 zip 条目，解压时后者盖前者，**包是错的但看着一切正常**。
40. **空白处那份右键菜单的目标目录要自己算：`startCreate(type, null)` 的 `null` 是「根」，不是「跟随选中」**（2026-10-12 加，做资源管理器空白处右键菜单时踩到）。两条：
    - **两个默认值同名反义**：`startCreate(type, target = null)` 里是 `const targetId = target ? target.id : 'root'` —— 传 `null` 就是**根目录**；而 `runImport(mode, node = null)` 的 `null` 会走 `importTargetPath(node)` → **`headerCreateTarget()`**（跟随主选中那一行）。第一版把空白处那份写成 `menu.node = null`（想着「与页头按钮同口径」），探针实测：先选中 `aaa/`、再在空白处右键点「新建文件」，输入行落在了**根**（`scope: root`）而不是 `aaa`（`scope: inside-row`）。
    - **正确做法**：目标在 `onTreeContextMenu` 里就算出来 —— `menu.value = { …, node: headerCreateTarget(), items }`，让两份菜单的 `node` 统一成「目标目录，`null` = 根」，`onMenuSelect` 的四项直接把它交给 `startCreate` / `runImport`。空白处那份只给四项（不带导出 / 重命名 / 删除 —— 那些作用于节点本身，空白处没有节点）；`.create-row` 上要放行原生菜单（输入法候选框挂在它上面），`.tree-item` 上的右键被 `@contextmenu.stop` 拦在本行、走不到这里。

41. **作用域受限的三条快捷键（⌘·Ctrl+A / 重命名 / Delete）：「焦点在不在资源管理器里」不能只看 DOM 焦点**（2026-10-12 加，用户两次报障：先是「资源管理器区域不支持 ⌘A 之类的快捷键」，修完再报「点开文件后 ⌘A 全选的是代码」）。三条：
    - **点树的空白处，焦点会掉到 `<body>`**：闸门原来写的是「落点必须在 `[data-tree-id]` 那一行上」—— 行自带 tabindex 没问题，但行下方的留白**没有任何可聚焦元素**，闸门判「不在资源管理器里」→ 整条放行、什么都不发生。修法：`.explorer__tree` 加 `tabindex="-1"` + `onTreePointerDown` 把焦点收进容器本身（**排掉 `.tree-item` 与 `.create-row`**：前者自己会被浏览器聚焦、后者是刚冒出来的输入行，抢了等于让它失焦提交），闸门判据同时换成 `closest('[data-panel="explorer"]')`。**容器不画焦点圈**：`.explorer__tree:focus, :focus-visible { outline: none }` —— 那一刻屏幕上没有任何一行是高亮的，沿整块树套一圈蓝框会被读成「根这个节点被选中」（2026-10-12 用户要求；行自己的焦点圈照旧来自 `base.css` 那条全局 `:focus-visible`，别去动全局）。
    - **桌面端点开一个「还没打开过的」文件行，焦点被 `EditorPane` 抢进 Monaco**（`if (!isTouchPointer()) instance.focus()`，为的是「点开就能直接打字」；touch 上不抢，所以触屏没这个症状）。于是「点文件 → 马上 ⌘A」按 DOM 焦点判就成了「在编辑器里按的」。用户拍板：**⌘A 改看指针在哪一块**（挂 `pointermove` 只记 `pointerType === 'mouse'`，按键时 `elementFromPoint` 现算）——指针在资源管理器里 → 按「焦点在指针底下那一行」算（指针压在空白处 / 面板其他部位时给 null，退回主选中，都没有就是「焦点在根上」）；指针在 `.pane--editor` 里 → 一律放行给编辑器自己的「全选代码」；指针在别处（活动栏、页签栏、浮层）或根本没有指针（纯键盘、触摸）→ 退回 DOM 焦点判据。**只给 ⌘A 开这个口子，F2 / Delete 不看指针**：Delete 不带修饰键，光标在代码里、指针恰巧搭在侧栏上时按一下就成了「弹删除文件确认框」，那个方向的风险比收益大得多。
    - **空白处（`rowId === null`）的兜底两边口径不同，别搞反**：F2 / Delete 取**主选中**（`workspace.selectedId`），**不能用** roving tabindex 的 `focusedId` —— 那是「键盘最后走到哪一行」，点过空白之后它仍停在一个**早已取消高亮**的行上，实测按 F2 去改名了一个屏幕上根本没被选中的目录；⌘A 则把 null 读成「焦点在根上」（选根的内容）。
    - 配套：`folderContentIds()` 算「父文件夹里的内容」时**逐层往下走**（目录先入列、再把它的孩子跟上 —— 就是「选中目录 = 连里面的文件一起选中」那条），且**顶层节点的 `parentId` 是字面量 `'root'`，而索引里那份根是 `stat('/')` 的浅拷贝、没有 `children`** —— 顺着 `parentId` 取父再取孩子会得到空数组，⌘A 静默什么都不选（探针第一版就是这么红的）。取不到节点、或节点在顶层时一律读 `workspace.tree`。

42. **「从系统里拖文件进来」（`composables/usePageDrop.js`）的七条坑**（2026-10-12 加，探针当场踩中前两条；第 6 条 2026-10-13 加，第 7 条 2026-10-19 加）：
    - **回调不能叫 `onDrop`**：调用方给的落地回调若是这个名字，会被本模块内部的 `function onDrop(event)`（drop 事件处理函数的自然命名）**遮蔽掉** —— 于是「松手」那一发落到自己身上（拿事件对象当 path 传进去），树毫无变化、也**没有任何提示**，比报错难查得多。现名：回调 `onFiles`、事件处理函数 `handleDrop`，别改回去。
    - **回调第一参数是路径字符串**（`onFiles('/P', items)`），不是对象 —— App.vue 第一版按 `target.path` 读，拿到 `undefined` 喂给 `importInto`，报「VFS 只支持绝对路径：undefined」。
    - **`DataTransfer` 只在这一次事件派发期间有效**：派发一结束 `items` 就空了。所以 `readDroppedItems` 的第一段（把 `webkitGetAsEntry()` 与 `files` 的引用抓到手）必须**同步**跑完 —— 它是 async，但 `await` 之前的代码就是同步执行的，前提是调用方在 drop 回调里**直接**调它、前面别先 await 别的东西。之后递归读目录随便多慢都行（`FileSystemEntry` / `File` 对象在事件结束后仍然有效）。
    - **`readEntries()` 一次只回一批**（Chrome 上限 100 条）：要反复读到空数组为止，少读一遍的表现是「目录里超过 100 个条目时后面的凭空消失」—— 静默少东西最难查。
    - **合成 `DragEvent` 造不出 `FileSystemEntry`**：探针里 `new DataTransfer()` + `items.add(new File(...))` 的条目 `webkitGetAsEntry()` 恒为 null —— 这**正好**用来自动走通「退回 files」那条分支；要验目录递归，就把假的 entry（含 `createReader`）直接喂给 `readDroppedItems`。配套判据：dragover 必须 `preventDefault`（不拦浏览器不认落点、drop 永远不来）、drop 必须 `preventDefault`（不拦整页跳去打开那个文件）。
    - **`dragenter` 那一发算落点时，侧栏还没被撑开**（2026-10-13 加）：「拖入期间撑开侧栏」是 App.vue 的响应式更新，晚一个微任务才落到 DOM；而落点判定靠 `elementFromPoint`，那一刻量到的是**撑开前的布局** —— 指针底下还没有树，落点会算成根目录、高亮也不亮。所以 `onDragEnter` 之后要 `requestAnimationFrame(reflowTarget)` 按同一位置重算一次（`reflowTarget` 里判 `depth <= 0` 就返回，防拖拽已结束的定时复活把目标救回来）。后续 `dragover` 本来就持续重算，这里只为把**第一帧**补齐。
    - **悬停自动展开不能在每发 `dragover` 上重挂计时器**（2026-10-19 加，用户报「拖到文件夹上不会自己张开」）：效果本身与站内挪文件共用 `composables/springOpen.js`（600ms），但两边的触发节奏完全不同 —— 站内拖拽只在**指针挪过**时重算落点（`pointermove`），系统拖入的 `dragover` 在指针**一动不动**时也会隔一会儿来一发。照站内那份「目标变了就重挂」照抄，600ms 永远走不满，实测停在折叠目录上怎么等都不张开。现写法：`settle()` 里比对上一发坐标，**只有 `moved` 为真才 `springOpen.hover(rowId)`**；`dragover` 在静止时照旧只更新落点 / 高亮。连带两条：① 目录张开后新行会顶到指针底下，到点回调里用 `requestAnimationFrame(reflowTarget)` 按同一位置补算一次落点，高亮才不会停在已经被顶走的那一行（这一发 `moved` 为假，所以不会把新长出来的子目录也捎上、一路连环张开）；② `reset()`（松手 / Esc / dragend / 离开窗口）里必须 `springOpen.cancel()`，否则计时器会在拖拽结束后补一发展开。探针口径：合成 `DragEvent` + `DataTransfer` 里塞一个 `File`（`types` 里才有 `Files`），按行中心派发 `dragenter` → 450ms 未展开 → 800ms 已展开；对照项「悬停在已展开目录上 900ms 不折叠」「dragend 后 900ms 不补开」「站内拖拽同一处仍会在 600ms 后展开」（11 + 4 条全绿）。
43. **覆盖式滚动条（`composables/useOverlayScrollbar.js`）的五条坑**（2026-10-13 加；第 5 条同日加）：
    - **无头环境验不出「占宽度」这件事**：Chrome 无头里原生滚动条本身就是 overlay（实测 `offsetWidth - clientWidth` 恒为 0），拿它当对照会得出「加不加 `scrollbar-width` 都一样」的错误结论。要证「原生那条真的占 11px」，得用**有头**跑一次（`--headless` 去掉）：实测有头原生 11px、补上 `scrollbar-width: none` 后 0。以后动这一块，别只在无头里量。
    - **藏掉原生那条要在调用方的 scoped 里写**，本模块**不管**：`scrollbar-width: none`（标准路径，Chromium 121+ 只认它）+ `::-webkit-scrollbar { width: 0 }`（兜旧内核）两条都要。少一条的表现是「滑块出来了、原生那条也还在」，两条并排。
    - **滑块样式必须写在 `base.css`**：那颗 `div` 是 JS 建出来 `appendChild` 到 `body` 的，组件的 scoped 够不到它（`.oscroll-thumb` / `.is-visible` / `.is-dragging` 三条都在 base.css）。颜色走 `--scrollbar-thumb*`，与原生那条同一对变量。
    - **隐藏时 `pointer-events: none` 不能省**：淡出只是 `opacity: 0`，盒子还在那儿；不关掉指针事件的话，那一列 6px 会吃掉底下的点击（树行点不动，而**看不见的任何东西都不该挡住屏幕**）。反过来，`.is-visible` 时要收回 `pointer-events: auto`，否则拖不动滑块。同理隐藏时不能 `display: none` —— 拖拽 / 悬停期间要用它接事件，淡出才是对的做法。⚠️ **显形时它照样是浮层**：可见那会儿它会替底下的树行回话，拖拽落点 / ⌘A 区域判据都必须穿透它 —— 见坑 44。
    - **验「悬停 / 拖拽换色」别挂上类就立刻读**（2026-10-13 加）：`.oscroll-thumb` 的 `background-color` 挂着 0.15s 过渡，刚 `classList.add('is-dragging')` 那一刻读到的计算值还是**补间起点色**（看着像「这条规则没生效」）。探针里先把 `thumb.style.transition = 'none'` 再读，或者等过渡走完（≥200ms）—— 实测踩过：两套主题各假失败 1 条。
44. **浮层会替内容回话：命中测试必须穿透两件界面件**（2026-10-13 加）。`document.elementFromPoint` 只回答「谁画在最上面」，而下面两件浮在内容之上、**不属于任何面板内容**的界面件正好都压在资源树的右缘：
    - **`.oscroll-thumb`**（覆盖式滚动条滑块）：fixed 在树右缘之内，可见时 `pointer-events: auto`（要能按住拖）。实测占 `[553, 559]`，树右缘 560。
    - **`.splitter`**（两栏之间那条分隔条）：热区 12px，原先靠 `margin: 0 -4px` 左右各压进两侧卡片 4px（线的视觉位置不动，纯为好抓），实测热区 `[555.6, 567.6]` —— **压进树 4.4px**，虽与滚动条无关，却恰好把滑块那一列也盖住了。**2026-10-13 已改成只向一侧外扩**：`margin: 0 -8px 0 0`，热区变成 `[559.6, 571.6]`，左缘正好落在侧栏右缘上、离滑块右缘（559）1px，谁也不压谁；占宽仍是 `12 − 8 = 4px`，卡片净间距与编辑器卡片位置逐像素不变（拿 `addStyleTag` 临时改回 `0 -4px` 做过反证：热区回到 `[555.6, 567.6]`，编辑器左缘纹丝不动）。代价是热区的 `50%` 不再等于空隙中心，线改由 `left: calc(50% - 4px)` 单独钉回空隙正中（触屏 24px 热区是 `calc(50% - 10px)`）。**这份偏心展开态与折叠态一致** —— 折叠态**没有**单独的热区覆盖（2026-10-13 当天加过一版 `.workspace.is-collapsed` 把它挪回对称，当天撤掉）；三点抓手是纯视觉件，折叠态由单独一条 dots 规则钉回中缝（写法与理由见第 3 节分隔条行），不算这条纪律的例外。**侧栏在右时这份偏心整体镜像**（`margin: 0 0 0 -8px` / 触屏 `-20px`，线 / 点同步取反号）—— 「只向右扩」原本只是「让左缘落在侧栏右缘上」的一种实现，侧栏换了边就必须换方向，否则那 8/20px 反压进侧栏（见坑 52）。

    改前两者叠起来：滑块右缘离分隔条那条线只有 **1.6px**，彼此重叠 **3.4px**（热区右移后这个重叠归零，但穿透层照旧得留着：滑块显形时自己仍是浮层，只是不再与分隔条互相叠加）。后果全部实测复现（1400×980、`uiScale=1`、45 行可滚长树）：
    - 指针压在树右缘那一条上时，`elementFromPoint` 拿到的是滑块 / 分隔条，`closest('[data-tree-id]')` 为 null ⇒ `useTreeDrag.resolveTarget` 与 `usePageDrop.resolveDropTarget` 双双退回「树空白处 = 根目录」。改前实测：往 `dirA` 那行拖（指针压在滑块上），**根级源文件**的落点整个消失（`folderDrop` 由 `dirA` 变 null）、**嵌套源文件** `dirA/inner.cpp` 的落点变成根目录（`rootDrop` 变 true）—— 松手就是把文件从文件夹里挪到了根。让开滑块 30px 拖同一处则一切正常（对照组）。
    - `App.vue` 的 `regionUnderPointer`（⌘A 的区域判据）走的是同一步：指针停在树右缘时判成「不在资源管理器里」，⌘A 退回 DOM 焦点判据 ⇒ 实测压在滑块上按 ⌘A，选区停在 1 不动（本该选中整个目录）。

    **修法**：`composables/contentHit.js` 的 `contentElementAt(x, y)` —— 先问一次 `elementFromPoint`，只有命中的**确实是这两件浮层**时才退回 `elementsFromPoint`（从最上层往下的一叠）逐个找下去；多花的那一次调用只发生在指针压着浮层的那一小片区域。三处调用点全部改用它（`useTreeDrag` / `usePageDrop` / App.vue 的 `pointerTarget`）。改后同口径探针 8/8：穿透后命中的是那一行，三次拖拽（对照 / 根级源 / 嵌套源）落点都是 `dirA`，⌘A 选区 1 → 49。2026-10-13 热区右移后同口径探针仍 8/8，另加一组几何探针 14/14（热区与滑块不重叠、热区左缘落在侧栏右缘、互相归属没串、线仍在空隙正中、两卡净空隙与编辑器位置不变、触屏 24px 档同理）。同日还试过一版**折叠态热区挪回对称**的覆盖（另配一组 29/29 的折叠态几何探针），当天下掉 —— 上表那两条硬约束里记的是**唯一在行**的写法。

    - ⚠️ **别图省事给浮层挂 `pointer-events: none`**：滑块要能按住拖、分隔条也要能按住拖，两件都得接指针事件。穿透只该发生在**读**的那一侧（命中测试），不该动写入侧（事件绑定）。
    - ⚠️ **这两条要一起治**：`.splitter` 压进树那 4.4px 与滚动条无关，单独把滑块往左挪治不了它（挪了之后那一带仍然拿不到行）。**物理上分开**只能从分隔条这侧下手（2026-10-13 的做法：热区只向右外扩，见本节第 1 条），但**穿透层不能因此删掉** —— 滑块显形时照样压在内容上，只是两个浮层之间不再叠加。
    - ⚠️ **探针口径**：断言要落在「穿透后 `closest('[data-tree-id]')` 是不是那一行」，别只看裸 `elementFromPoint` 的类名 —— 裸命中本来就是滑块 / 分隔条（那是 bug 的前提，不是结论）。同一区域跑一次「让开滑块」的对照，否则分不清是浮层还是别的什么在作怪。
45. **窄屏把侧栏页头左簇搬到侧栏底部一条**（2026-10-13 加，用户报「窄屏时页头图标挤在一起还错位」）。判据在 `shellSettings` 的 `isNarrowLayout()`（命中时给 `<html>` 挂 `is-narrow`；规则在 `Sidebar.vue` / `App.vue` 里写 `:where(html.is-narrow) …`），六条纪律：
    - **为什么用 `display: contents` 而不是 `position: absolute`**：`display: contents` 把 `.sidebar__head` 整条解散，它的两个子元素升成 `.sidebar` 的直接 flex 项，再用 `order`（`#sidebar-context` 0 / `.sidebar__body` 1 / `.sidebar__switcher` 2）排成「顶上一行 + 中间内容 + 底下一行」。绝对定位那条路走不通有两个原因：① **结构**——`display: contents` 不生成盒子、压根不进定位体系，底部那条才能是 flex 里**真的一条**（占位、不压内容），而不是浮在树上的抽屉；② **位置**——绝对定位得自己找包含块，而祖先链上一旦出现 `transform`（带 transform 的元素会成为绝对定位后代的包含块），位置当场就跳。⚠️ ② 的两条出处**都已在 2026-10-14 晚消失**（`panel-fade-in` 随 CSS 补间整段删除、`is-swapping` 随换边自绘兜底删除），现在折叠 / 换边这条路径上**没有任何动画会给祖先加 `transform`** —— ② 因此退化成「谁再加一条带 transform 的动画它就复活」的预防性说明，当下撑着结论的是 ①。结论不变：用 `display: contents`。
    - **左簇必须包一层壳（`div.sidebar__switcher`）**，别把规则直接盖在 `SidebarSwitcher.vue` 的根上：父组件的 scoped 规则与子组件自己的 `.sidebar-switcher[data-v-x]` **特异性完全相同（都是 (0,2,0)）**，谁在样式表里靠后谁赢 —— 跨组件不可控，而要覆盖的 `height: 26px` / `display: inline-flex` 恰好都在那边写着。包一层之后父组件只碰自己的类，没有这个不确定性。
    - **`.sidebar__context` 的 `margin-left: auto` 必须在窄屏清掉**：交叉轴上的 auto 外边距**优先于 `align-items: stretch`**，留着它那一行会缩成内容宽并被推到右边，于是滚动显影那条发丝线只剩按钮那一小段。清掉之后它自己铺满整条侧栏宽，里面的动作区**居中**（2026-10-13 晚从 `flex-end` 改来，见第 5 节坑 50）。同时页头没了盒子，原来那条 `is-scrolled` 的发丝线要挪到 `.sidebar__context` 上（`display: contents` 的元素仍参与选择器匹配，所以 `.sidebar__head.is-scrolled .sidebar__context` 这条写得通）。
    - **原来那条「展开时的淡入要按元素补一份」**（`panel-fade-in` 打在 `.sidebar__head` 盒子上，窄屏没盒子就得给 `.sidebar__switcher` / `.sidebar__context` 补同参数的一份）**随 2026-10-14 删掉 CSS 补间一并移除** —— 补版与母版一起没了，那条「两侧动画参数必须一致（间隔 180ms / 时长 120ms / 曲线）」的纪律也随之作废。`display: contents` 本身不受影响：它从来只是为了让底部那条成为真的一条（见上第 1 条）。
    - **窄屏底部那条上的「收起侧栏」箭头（2026-10-13 加）三条纪律**：① **显示开关写在父组件里**：按钮本身在 `SidebarSwitcher.vue`（基础 `display: none`），打开它的那条在 Sidebar 的窄屏块里、**带着 `.sidebar__switcher` 祖先**（`.sidebar__switcher :deep(.sidebar-switcher__collapse)` → (0,3,0)）—— 若在子组件里自己写一条 `:where(html.is-narrow)` 打开，就又多出一份判据副本（判据现在只有 `shellSettings.js` 一处）；若只写裸 `:deep(.sidebar-switcher__collapse)` 则与子组件那条同是 (0,2,0)、又回到「拼源码顺序」的老毛病。② **箭头方向与它自身的位置同源**：`chevron-left` 在左停靠（DOM 首位，天然贴左端）、`chevron-right` 在右停靠（`order: 1` 排到末尾、贴右端），于是「箭头指哪、按钮在哪、点下去往哪收」三件事一致；方向与位置都读 Sidebar 收下的 `panelPosition` 一个来源。③ **别让它污染 A 组的页头控件清单**：`scripts/verify-ui.mjs` 里 `visibleSwitcherTabs()`（页面侧另有一份内联的同款查询）按 `.sidebar-switcher__pill, .sidebar-switcher__tab` 取 aria-label 拼精确串，而本品沿用 `__tab` 外观类 —— 2026-10-13 加它当天 A 组当场变红（清单多出一项「收起侧边栏」）。已给两处查询都补上 `getClientRects().length > 0` 过滤（与同文件 `visiblePanel()` 同一口径，函数名里的 visible 也就落实了）；以后再往页头塞窄屏专用件，**先看这两处查询**。实测（静态构建产物 + 探针，19/19 绿，`cp.uiScale=1`）：390 / 768 两档箭头可见、26×26、与底条同行（`y` 与底条上下沿逐像素对齐）、点它当场折叠成「编辑器铺满 + 图标栏贴工作区下沿」；1400 档 `display: none` 且 rect 全 0（不占位、不进 tab 序），底条仍是三项；右停靠档换 `chevron-right`、`order: 1` 排到整条最右端（pill 216.9 / 齿轮 284.9 / 箭头 314.9），点击同样折叠。`npm run verify` 仍是基线 A/B/C/D/F 绿 + E/G/H 红（改采集器之前 A 组红，见第 ③ 条）。
    - **判据是两条并集（2026-10-13 晚定，同日晚从 CSS 挪进 `shellSettings.isNarrowLayout()` —— 命中给 `<html>` 挂 `is-narrow`，见坑 53）**：① 触摸设备 **且 设备竖屏**；② 视口宽 ≤ 600px —— 任一成立即走窄屏布局。① 管「竖屏的触摸设备」（手机竖屏 + 平板竖屏）：用 `pointer` 而不用宽度是为了把**桌面窄窗口**排除在外（有鼠标键盘，给移动形态反而碍事），用**设备朝向**（`screen`）而不用视口的高宽比，是因为视口高宽比会被软键盘改掉（坑 53）；⚠️ `pointer` 只认**主**指针，带触摸屏的笔记本主指针是触摸板 → 报 `fine`、不命中（要「只要存在触摸就命中」得写 `any-pointer: coarse`）。② 是与设备无关的硬底线：视口 < 600px 时页头那排**客观上**放不下，不论输入方式都走窄屏布局（用户明确要求保留这条）。**代价**：平板竖屏（768×1024，侧栏 301px 本来够放、不折行）现在也会沉底 —— 这是有意的形态选择（竖屏横向稀缺），不是修 bug。
    - **第 ② 条那个 600px 的来历**：侧栏宽 ≈ 0.53 × 视口，按上面那个最坏 ~221px（装了抽题模块）/ ~243px（uiScale 110%）反推，会折行的范围到 ~450px 视口为止；600 是留了余量的整数，桌面正常窗口（≥ 900px）一概不受影响。它**不随 `--ui-scale` 走**（判据里的 600 是物理 px、不吃 `postcss-pxtorem`，也不认运行期改的根字号）—— uiScale 调得更高时要按上面那条重新核一遍这个值；真想与 rem 口径一致，得让 `isNarrowLayout()` 读根字号（改一处即可 —— 判据已经只有一份了）。
    - 实测（静态构建产物 + 探针，28/28 绿）：390 / 360 / 320 三档底条都贴侧栏下沿（`|Δ| ≤ 1px`）、左右铺满、高 39px（26 内容 + 6×2 内边距 + 1 上边线）、内容居中、顶行恒 35px 不再折行、文件树 / 用例列表下沿正好停在底条上沿（不重叠）；底条上的胶囊仍能切面板（explorer ↔ tests）、切完两行都还成立。1400 档逐项与改前一致：壳与胶囊同尺寸同位置（x=10 / 页头内 y=4 / 178×26）、动作区仍右贴 8px、内容区仍顶到侧栏底部。（这一轮还顺带验过「展开动画补丁只在窄屏生效」—— 那条补丁 2026-10-14 已随 CSS 补间删除，这条实测随之作废。）
    - **判据矩阵实测（2026-10-13 晚改判据后补，8/8 绿）**：命中三档 —— 手机竖屏 390×844（①②都成立）、**平板竖屏 768×1024（只靠①**，768 > 600）、**桌面窄窗 500×900 无触摸（只靠②**，`coarse=false`）；判据一律落在 `head.display === 'contents'` + 底条贴在内容下沿（`switcherY === bodyBottom`）。不命中五档 —— 手机横屏 844×390、平板横屏 1024×768、桌面 1400×900、**平板尺寸但无触摸 768×1024**（`portrait=true` 而 `coarse=false` → 证明①的 `pointer` 真在起作用）、**桌面 720×900 竖高**（证明单靠 `orientation` 不够）。这四条交叉验证把 ①② 各自的作用分开了。**键盘把布局视口削矮的三档**另见坑 53。

46. **窄屏折叠态：图标栏横过来、通栏贴在工作区的一条边上（贴下 / 贴上由设置决定）**（2026-10-13 加，用户报「窄屏时折叠的侧边栏也该到底部；触屏点边界线展不开」；同日稍晚加 `cp.narrowCollapseSide` 让上下可选）。判据与坑 45 是同一个类（`:where(html.is-narrow)`），但规则写在 **`App.vue`** 而不是 `ActivityBar.vue` —— 要匹配的 `.workspace.is-collapsed` 是它的祖先。七条：
    - **为什么必须改**：展开态的左簇已经在同一断点沉到侧栏底部，折叠态却还是屏幕左边一条 48px 竖栏，两个形态对不上；而折叠之后唯一剩下的入口是那条「边界线」，它的可见部分只是热区里一列 2px 的点（线平时 `opacity: 0`，触屏更没有 hover），热区左半又正好压在图标栏中部那片**没有按钮的空白**上 —— 实测横向扫描（390 档触摸、逐 2px 打点）有效展开区是 x∈[46, 78]，左边 46px 全是死区，手指基本指不准。改成底栏之后，展开 / 选面板落到两枚 40×40 的面板按钮上（指尖大小、看得见）。
    - **竖排靠 `flex-direction`，不碰内联 `order`**：`App.vue` 的 `activityBarStyle` 把图标栏的 `order` 写成内联（左停靠 0 / 右停靠 4），要把它挪到最后只能 `order: 9 !important`。换一条路：图标栏在两个停靠侧上 order 的位置本来就不一样，正好各用一条 —— `.workspace.is-collapsed.is-left { flex-direction: column-reverse }`（`column-reverse` 让**最小**的 order 落到最下）、`.workspace.is-collapsed.is-right { flex-direction: column }`（order 最大的一枚本来就在最下）。两条都零 `!important`，内联那份仍是 order 的唯一出处。**贴哪条边由 `cp.narrowCollapseSide`（上 / 下，默认下）决定**：模板上落成 `.is-fold-top` / `.is-fold-bottom`（`.workspace` 的类名里多带一个 `is-fold-${narrowCollapseSide}`），把上面两条各再写一份反向的（`is-fold-top.is-left → column`、`is-fold-top.is-right → column-reverse`）—— **四条规则全部由主轴方向表达，一个 `!important` 都没有**，两档各管两条、互不重叠。加第三档 / 改档位名只动四处：`NARROW_COLLAPSE_SIDES`（档位表）、`setNarrowCollapseSide()`、`App.vue` 这四条 CSS 与模板里那个类名，别处没有第二份。
    - **底栏的高度要改由内容定**（`:deep(.activity-bar) { flex: 0 0 auto }`）：竖着时 `flex: 0 0 48px` 是**宽度**，横过来它成了高度 —— 48px 装不下「40px 方块 + 上下各 4px 内边距 + 上下各 1px 边框」（全局 `box-sizing: border-box`），40px 的方块会被裁掉一像素（hover 底色那圈会缺边）。横排实测 50px。
    - **那条 4px 净空隙写在两档里、不合并成一条**：分隔条在窄屏折叠态已经整条不排版（`display: none`），空隙得由图标栏自己让出来 —— 栏在下走 `margin-top: 4px`（`.is-fold-bottom`）、栏在上走 `margin-bottom: 4px`（`.is-fold-top`）。两条都用**物理**方向（`column-reverse` 下物理外边距不会被翻到另一边去），两档实测净空隙都是 4px。另：`.activity-bar` 的 `padding: 4px 0` 要改成 `4px 8px`、两组 `flex-direction` 改成 `row`、每格的 `margin-left: 3px` 清零（那是竖排里「钉在同一列」用的）。
    - **一排按钮要整排居中，且簇间要自己补 gap**（2026-10-13 当天下午加，用户要求「折叠后的侧边栏按钮居中」）：基础规则那条 `justify-content: space-between` 是**给竖排用的**（上簇贴顶、下簇贴底），横排里它只会把两簇顶到通栏两端、中间留一大片空档（390 档实测第一枚 `x=15`、末枚右缘 `W−15`，看着像散了）—— 窄屏折叠态要显式压成 `justify-content: center`（压得住是因为这条带 `.workspace.is-collapsed` 祖先，特异性 (0,3,0) 高过 `ActivityBar.vue` 里那条 (0,2,0) 的基础规则，与源码顺序无关）。
      ⚠️ **光居中还不够**：那 4px 间隔是 `.activity-bar__group` **内部**的 `gap`，两条栏之间什么都没有（竖排里靠 `space-between` 分开，改成居中后两簇直接贴着）—— 实测中间那两枚方块**间隙 0**、比别处少 4px，一眼看得出来。所以要在整条上补 `gap: 4px`（与组内格间距同值 ⇒ 一排等距），**这个 4px 与 `ActivityBar.vue` 的 `.activity-bar__group { gap: 4px }` 是同一个数，改一处要一起改**。居中之后两簇的语义分界只剩图标与选中态差异；要拉开簇间距，调这里这个 `gap` 即可。
    - **坑 45 那套 `display: contents` 挪不了这里**：那挪的是 Sidebar 内部的页头（父组件自己的 DOM），图标栏是 `.workspace` 的**兄弟节点**，跨组件挪不了位置，只能整块改主轴方向。⚠️ 代价：主轴一翻，折叠 / 展开两态的**布局形态是跳变的**。**2026-10-14 用户拍板：折叠动画只留 View Transitions 一条路，`togglePanel()` 的 `animate` 闸门加了 `canViewTransition()` —— 无 VT 的浏览器 / 旧版本直切不播**（此前 CSS 路径的 `flex-basis 200ms` 在窄屏遮不住这个跳变，已废弃；`is-animating` 那套两段式样式、`PANEL_LOCK_MS` 闸门与 `panelAnimating` 随之空转 —— **2026-10-14 晚已整段删除**：JS 侧一个动画 class 都不再挂，CSS 侧 `panel-fade-in` / `panel-ghost` / `activity-bar-icon-in` 三个关键帧与 `.pane--tests.is-animating` 那条 `transition`、`ActivityBar` 的两条 `is-animating` 规则一并消失，只留 `::view-transition-*`）；VT 路径下是整屏交叉淡化，与折叠动画本来的观感一致。（换边那套自绘兜底 `pane-settle` 已于同日晚一并删除，见 §15.5。）
    - 实测（静态构建产物 + 探针；`cp.uiScale=1`）：**四档形态**（左 / 右停靠 × 上 / 下，390 档）逐项对齐 —— 贴底两档主轴 `column-reverse`（左停靠）/ `column`（右停靠），贴顶两档正好互换；图标栏一律通栏（`x=6` / `r=W−6`、宽 378、高 50）、离屏边 6px（与编辑器同一条外沿）、与编辑器净空隙 4px（栏在下走 `margin-top`、栏在上走 `margin-bottom`）；768 平板竖屏同形（编辑器 756、图标栏 `x=6`）。**一排 4 枚居中**（`justify-content` 计算值 `center`、相邻两枚间隙一律 4px）；`cfReady` 为假时只剩 3 枚同样居中。设置菜单里「窄屏折叠方向」二级点「上方」→ 存档当场写成 `top`、图标栏当场上移并弹出可撤回通知（端到端验过）。早先两轮验过、这次没重跑的：编辑器件宽 378（改前并排只剩 149）、点底栏首枚仍能展开并切面板、Android 平板档同形、浅色主题同形。1400 档完全不动（`row` + 48px 竖条在左 + `space-between` + 分隔条照常排版，两栏逐像素与改前一致）。`npm run verify` 仍是基线 A/B/C/D/F 绿 + E/G/H 红。

47. **软键盘弹起时收掉贴底的图标栏**（2026-10-13 加，用户要求「窄屏 + 唤出软键盘 + 折叠的侧边栏在下面时，把它隐藏掉，别影响打字」）。三条：
    - **判据是 `.app.is-typing`，不是 `.app.is-keyboard`**：后者其实只是「这是台触摸设备」（`useMobileKeyboard()` 的 `active = isTouchPointer()`，整台设备上恒真，名字是历史遗留）—— 拿它当判据等于**在触屏上永远收起底栏**。真正「键盘弹着」的是同一个 composable 里的 `keyboardUp`（2026-10-13 起也 `return` 出去）：按 `baselineHeight − innerHeight > 100` 或 `innerHeight − visualViewport.height > 100` 实测（iOS 只缩可视视口、Android Chrome 两个一起缩，两头都要看），由 `syncViewport()` 在 `resize` / `orientationchange` / `visualViewport` 的 `resize`·`scroll` 上更新。
    - **只管贴底那一档**（CSS 判据里带着 `.is-fold-bottom`）：键盘从下边顶上来，而 `.app.is-keyboard` 那套会把整块应用挂到 `--vvh` 上 —— 贴底的图标栏正好停在键盘正上方，白吃那几十像素；贴顶那档键盘够不到它，留着（用户口径就是「在下面才隐藏」）。规则只有一条 `display: none`；`v-show` 给的是**空**的内联 `display`，压不住 CSS 的 `none`，这点不必额外处理（也**不要**改成在 JS 里藏 —— 折叠只剩 View Transitions 一条路，JS 不再给任何元素挂动画 class，再塞一个「隐藏状态」进来只会让 `v-show` 与 CSS 两处判据分家）。
    - **探针怎么造「键盘弹着」**：在 `evaluateOnNewDocument` 里 `Object.defineProperty(window, 'visualViewport', { value: 假的 })`，假对象的 `height` getter 读一个可变的 `window.__vvKbd`（`innerHeight − __vvKbd`），再 `window.dispatchEvent(new Event('resize'))` 就触发 `syncViewport()`；把 `__vvKbd` 调回 0 再派一次 `resize` 就是**反证**（键盘收起）。实测（390 档、`__vvKbd=320`）：贴底档图标栏 `display: none`、编辑器上下留白都回到 6px（让出的那 50px 归编辑器）；`__vvKbd` 归零后图标栏回来（`flex` / 高 50）、`.app` 同时摘掉 `is-typing`；贴顶档键盘弹着时图标栏照旧在（高 50）。

48. **窄屏的拖拽折点 = 固定的「离边缘 30px」，不是中点、也不是最窄宽度的一半；且窄屏没有「单击分隔条折叠」**（2026-10-13 加，当天改了三版：第一版用户报「通过拖动来折叠侧边栏的边界在窄屏模式下不太适用」，第二版报「感觉容易误触，改为距离边缘 30px 则折叠」，第三版报「去掉窄屏模式里的点击拖拽线来折叠」）。八条：
    - **口径（两版）**：`hingePx`（折叠 / 展开共用的那条线，见第 3 节「像素直连」那条）**宽屏**仍是「折叠停位与最窄宽度的中点」= `(48 × uiScale + minPanelPx) / 2`（2026-10-11 口径，两版都没动）。**窄屏**走 `App.vue` 里的 `NARROW_HINGE_PX = 30`：指针离侧栏那一侧的面板边缘 30px 以内就折叠、拉出 30px 以外就展开。第一版曾是「最窄宽度的一半」（`minPanelPx / 2`，因为窄屏折叠后图标栏是一条通栏横条、横向上什么都没拿走，折叠停位等价于 0，中点自然落在那里）—— 390 档实测落在离边缘 **94.5px**，等于「拖到一半稍一用力就越线」，用户当成误触报回来。
    - **30 不乘 `uiScale`**（唯一的例外，别照抄 `ACTIVITY_BAR_PX` 那条「逻辑尺寸要乘 scale」）：它是**指针容差**，与 `TAP_SLOP = 10` 同一性质 —— UI 缩放改的是界面元素的逻辑尺寸，不改手指的物理活动范围；乘了 scale 反而让放大档更容易误触，与这次改动的目的相反。
    - **坐标系不用换算**：`panelW`（`move()` 里由指针位置一次算出）本身就是「指针到面板内容盒边缘的像素距离」（在左 = `clientX - left`，在右 = `contentRight - clientX`），所以「离边缘 30px」直接写成 `hingePx = 30`。⚠️ 它量的是**工作区内容盒**的边（窄屏下那条外沿离窗口边还有 6px 的留白），不是窗口边。
    - **判据的唯一出处是 JS**：`services/shellSettings.js` 导出 `isNarrowLayout()` （触摸设备 + **设备**竖屏，或视口宽 ≤ 600px），命中时给 `<html>` 挂 `is-narrow`；CSS 那三处（`App.vue` 两处、`Sidebar.vue` 一处）只认这个类、写 `:where(html.is-narrow) …`。**别再往 CSS 里加 @media 副本** —— 键盘会把布局视口削矮、`(orientation: portrait)` 随之翻面（坑 53）。底层是个 ref（`resize` / `orientationchange` / `screen.orientation` 的 `change` / 指针那条 `matchMedia` 的 `change` 一起写回来），因为设置入口那两处按响应式依赖缓存；`measureLimits()` 现取现用。
    - **同一条线还留着一处不对称，是**有意**的**：百分比那一版（键盘方向键 + 窗口收敛走的 `applyShare`）仍拿 `edgeShare`（面板收到 48px 时的占比）当折叠线，所以窄屏上按方向键几乎收不起来。没跟着改 —— 窄屏上根本够不到这条入口（分隔条只在展开态可见，且键盘不会落在它上面），改它只会把宽屏的既有行为一起动掉。
    - **代价（两版都有，第二版更明显）**：越界展开那一刻，分隔条会从折点跳到最窄落点 `minPanelPx` —— 阈值比最窄还窄，面板不可能更窄，这一跳改不掉。第一版跳 94.5 → 189（94.5px），第二版跳 30 → 189（159px）。这是「阈值靠近边缘」必然的代价，不是 bug。
    - **实测**（静态构建产物 + 一次按住内扫再从最内侧连续外扫，读 `.workspace.is-collapsed`；`cp.uiScale=1`，共 16 条断言全绿）：390 竖屏触摸（内容宽 378、`minPanelPx` 189、分隔条 24px、内容盒左缘 x=6）—— 内扫折点 `panelW (31 → 29]`、外扫 `(28 → 30]`（预测 30，旧口径 94.5，**早了 64.5px**）；`panelW ∈ (34, 183)` 的 127 个采样点面板一律钉在 **189** 且状态不翻（死区）；`panelW > 34` 的点**没有一个**是折叠态；折叠后图标栏 `x=6 / w=378 / h=50`（通栏）。右停靠镜像折点同为 `(31 → 29]`。1400 桌面（`minPanelPx` 240）：内扫 `(146 → 144]`、外扫 `(142 → 144]`，预测 `(48+240)/2 = 144` —— 宽屏逐项未被波及，折叠后图标栏仍是 48×968 竖条；`npm run verify` 仍是 A/B/C/D/F 绿 + E/G/H 红（D 组「拖动分隔条改变两栏比例」也绿）。
    - **窄屏连「单击分隔条」这个入口一起去掉了，而且轻点必须是「彻底的空操作」**（2026-10-13 第三版，用户要求「去掉窄屏模式里的点击拖拽线来折叠」）。两处：① `stop()` 里在 `moved <= TAP_SLOP` 那句之前先 `if (isNarrowLayout()) return` —— 窄屏的折点已经贴到 30px、分隔条又停在最窄落点上，手指按住它稍一抖动就会被当成轻点、面板整块翻面（宽屏的单击照旧：实测 1400 下仍 `false → true → false`）。② `finish()` 里补一条：窄屏 + `moved <= TAP_SLOP` 时**原样退回按下时的 `editorShare`**（按下那一刻存进 `startShare`），不按像素宽反算 —— 因为像素直连的落点是「指针到边缘的**绝对**距离」，而热区是一只 24px 的盒子、整个铺在细线**右侧**（`.splitter` 的 `margin: 0 -20px 0 0`；实测静止态：面板右缘 = `panelW` 210.56，细线左缘 = 211.56，热区盒中心 = 222.56），按在热区中间就等于把面板右缘当成指针 ⇒ 「面板凭空宽 12px 并落盘」。宽屏不必这么兜（那边轻点会整块翻面，这点宽度变化看不出来）。⚠️ 拖动仍然照旧：**按下那一刻面板右缘还是会先吸到手指上**（抓热区正中 = 先跳 12px 再 1:1 跟手），这是像素直连「绝对量」的既有设计，两版都没动、也不属于这次的范围。
    - **实测**（静态构建产物 + 探针，`cp.uiScale=1`、`cp.editorShare=43.7`）：**13/13 绿** —— 390 竖屏（左）单击 `collapsed=false`、面板宽 `210.6 → 210.6`、`cp.editorShare 43.7 → 43.7`（彻底空操作）；抖动 4px（`+4/−3/+1`）也不翻、宽度不动；小拖 20px 不翻（未到 30px 折点，面板按拖拽跟手到 200.8）；拖到 29px **仍然折叠**、松手后仍是折叠态、图标栏 = 通栏（`w=378`）；折叠态 `.splitter` 命中不到（`getClientRects()` 为空 → 谈不上「单击展开」）。右停靠单击 / 抖动同样不翻（面板恒 210.6）。1400 宽屏：单击 `false → true`、再单击 `true → false`、折叠时图标栏 48×968 —— **宽屏一字未动**。另跑一遍折点回归（3/3 绿）：窄屏 `(31 → 29]`、宽屏 `(146 → 144]`（预测 144），本轮没把折点带歪。

49. **「窄屏折叠方向」这一项只在窄屏出现（两处设置入口都藏）**（2026-10-13 加，用户要求「这个设置最好在窄屏的时候才在设置菜单栏出现」）。四条：
    - **两处入口用同一个判据**：齿轮菜单 `SETTINGS_MENU_ROWS` 与设置面板外观栏 `SHELL_ROWS` 的那一行都挂 `when: () => isNarrowLayout()`；菜单那边 `SettingsMenu.vue` 早就在表上过滤（`rows` 那个 computed），面板那边 2026-10-13 才加同款机制（`appearanceRows` computed，模板从 `v-for="row in appearanceRows"` 起，别改回 `APPEARANCE_ROWS`）。**只藏菜单、面板照旧摆着是不够的** —— 用户的原话是「最好在窄屏的时候才出现」，两处不一致会在宽屏上留下一个点了没反应的入口。
    - **`when` 的判据必须是响应式的读法**：`isNarrowLayout()` 底层是 `shellSettings.js` 里一个 ref（`resize` / `orientationchange` / `screen.orientation` 的 `change` / 指针那条 `matchMedia('(pointer: coarse)')` 的 `change` 写回来）。**别改成每次现取现判**：那两处都是按响应式依赖缓存的计算值 / 渲染结果，现查会把第一帧的答案一直缓存住 —— 桌面把窗口拉窄到 600px 以下（或旋屏）后那一行不回来，只有刷新才认。
    - **藏的是入口，不是这一项**：`cp.narrowCollapseSide` 照旧持久化、照旧在 `cloudProfile.js` 的同步白名单里（手机上调好的档位要跟着账号走），`settingsUndo` 的三处接线也原样 —— 把值藏起来 ≠ 把这个键下线。
    - **实测**（静态构建产物 + 探针 13/13 绿，`cp.uiLocale=zh-CN`）：1400 桌面 —— 菜单表里没有 `narrowCollapseSide`（11 行标签里没有「窄屏折叠方向」、仍有「侧边栏位置」）、外观栏 9 行里也没有它；**同一页把视口拉到 500（未刷新）** ⇒ 外观栏当场变 10 行、菜单 12 行，且那一行 `当前值=bottom`；再拉回 1400 ⇒ 两边都当场消失、行数回到 9。390 竖屏触摸 —— 两处都在，菜单二级点「上方」后 `cp.narrowCollapseSide = "top"`、面板里读到的也是 `top`。`npm run verify` = A/B/C/D/F 绿 + E/G/H 红。

50. **窄屏页头顶条（`#sidebar-context`）里的动作区也居中**（2026-10-13 加，用户要求「窄屏模式下侧边栏页头的添加文件/文件夹和 verdict 也应该居中」）。三条：
    - **改的是一条**：`Sidebar.vue` 窄屏块里 `.sidebar__context` 的 `justify-content` 由 `flex-end` 改成 `center`，`padding` 同时从 `4px 8px 4px 4px`（左 4 右 8）改成对称的 `4px 8px` —— `justify-content: center` 居中的是**内容盒**，内边距偏 2px，居出来同样是偏的。宽屏那条（`.sidebar__context { margin-left: auto }` + 内容宽、顶在页头右端）一个字没动。语义上窄屏这条顶行现在与底部那条图标行（坑 45 / 46 都居中）取同一形态；折到第二行贴右那套是宽屏的事，窄屏不适用。
    - ⚠️ **归零内层 `margin-left: auto` 时，`> *` 的选择器必须挣到特异性**：投进来的两份（FileExplorer 的 `.explorer__actions`、TestPanel 的 `.panel__heading`）各自带着 `margin-left: auto`（宽屏靠它贴右、折行也贴右），auto 外边距会先把剩余空间吃光 —— 不归零则 `justify-content: center` 完全失效。而 `.sidebar__context :deep(> *)` 编出来是 `.sidebar__context[data-v-x] > *` = **(0,2,0)**，与两条子组件规则**同分**，谁赢只看构建产物里的先后：实测 `.explorer__actions` 排在 Sidebar 之后 ⇒ 资源管理器那一半照旧被推到右边（探测当场读出 `margin-left: 141px`），而 `.panel__heading` 排在前面 ⇒ 评测样例那一半居中 —— **同一份代码两半表现不同**，最容易误判成"改漏了一处"。前面多挂一层祖先（`.sidebar .sidebar__context :deep(> *)`）变成 (0,3,0) 就压得住，与源码顺序无关（同坑 45 第 2 条、坑 46 第 5 条那条"跨组件覆盖要自己挣特异性"的纪律）。
    - **实测**（静态构建产物 + 探针 19/19 绿，`cp.uiScale=1`）：390 竖屏触摸 —— 两半的动作组中心与侧栏中线 `Δ=0`（资源管理器 `explorer__actions` 54px 宽、评测样例 `panel__heading` 73px 宽，各 `cx=111.5`，侧栏 `x=6 / w=211`），内层 `margin-left` 计算值 `0px`、`padding` 左右都是 8px；600 宽（硬底线内侧）同样 `Δ=0`。宽屏 1400 逐项未动 —— 页头仍是 `display: flex`、`justify-content: normal`、上下文条仍是内容宽（54 / 73px）且右缘距侧栏右缘 8px。`npm run verify` = A/B/C/D/F 绿 + E/G/H 红。

51. **窄屏下评测面板页脚那颗「添加测试样例」只留加号**（2026-10-13 加，用户要求「去掉添加测试样例字样，仅留一个加号」）。三条：
    - **规则写在 `Sidebar.vue` 的窄屏块里，不新增断点副本**：那条复合查询在 CSS 里已经有三份（`Sidebar.vue` 一份、`App.vue` 两份），为一个 `display: none` 再造第四份不划算（同坑 48 第 4 条「判据的唯一出处是 JS」那个口径）。选择器是 `.sidebar__body :deep(.add__label)` —— 那半个 `:deep` 必须留着：页脚是 `#tests` 插槽内容，编译在 TestPanel 的 scope 里（同坑 45 第 2 条那类跨组件覆盖）。`TestPanel.vue` 那边只做两件事：给那个 `span` 挂上 `add__label` 这个钩子类、给按钮补 `:title`。
    - ⚠️ **藏了字就必须补可访问名**：`AppIcon` 是 `aria-hidden="true"`，那个 `span` 是这颗按钮**唯一**的可访问名来源 —— 没有 `:title` 它就成了一个没有名字的图标按钮（与这一栏的 `.explorer__btn` 同一条路子：栏内的图标按钮全靠 `title` 命名；页脚那颗 ▶ 自 2026-10-24 起已有可见文字，不在此列）。探针里把「`title` 非空」当成一条断言守着。
    - **按钮尺寸与形态没动**（用户没提，别自作主张）：仍是 `width: 100%`、高 32、内容居中 —— 加号落在正中（实测 svg 中心与按钮中心逐像素相同，138×32 那条），一排仍是「一条铺满的加号条 + 右侧 ▶」。另一种选择是缩成与 ▶ 同宽的小方块（备选渲染实测 44×32），但那一行右侧会空一大片；当天排过两张实拍，用户没要就没做。
    - **实测**（静态构建产物 + 探针 12/12 绿，`cp.uiScale=1`、`cp.sidebarTab=tests`）：390 竖屏触摸（深 / 浅两主题）与 600 宽（硬底线内侧）—— `span` 计算值 `display: none`、rect 宽 0，加号 svg 仍可见（14×14，落在 138×32 那颗的正中），按钮中心那一击命中自己（`elementFromPoint` → `path`），▶ 那颗 41×32 未受影响；1400 宽屏逐项未动（`span` 照旧 `display: block`、字宽 75、按钮 481×32）。`npm run verify` = A/B/C/D/F 绿 + E/G/H 红。

52. **分隔条热区必须随侧栏停靠方向**镜像**：`.workspace.is-right .splitter { margin: 0 0 0 -8px }`**（2026-10-13 加，用户报「侧栏在右边的时候，窄屏模式，拖拽线的热区有问题」）。四条：
    - **毛病在哪**：热区那条「只向右外扩」的负外边距（`margin: 0 -8px 0 0`，触屏 `-20px`）是冲着**侧栏在左**时那只覆盖式滚动条写的 —— 那时热区左缘正好落在侧栏右缘上、谁也不压谁（见坑 44）。侧栏一停到右边，同一个「向右」就变成**整段长进侧栏里**：触屏那 24px 里 20px 压在侧栏左缘上，宽屏那 12px 里 8px —— 实测 390 竖屏触摸下侧栏左缘起 `0..+20px` 的 `elementFromPoint` 全部命中 `div.splitter`。
    - **后果是硬的，不只是「手感」**：① 文件夹的折角箭头落在这一带（实测箭头横跨侧栏左缘 `+8..+24px`），点它**展不开文件夹**、反而起拖拽（`is-dragging` 置上、`aria-expanded` 纹丝不动）；② 树行最左那一段选不中；③ 热区带 `touch-action: none`，在这一带拖**滑不动树**（10% 的侧栏宽度成了滚动手势的死区）；④ 宽屏还多一条：轻点落到 `.splitter` 上会被当成「单击分隔条」直接把侧栏折了。
    - **解法**：只镜像**热区盒朝哪边长**那一件事 —— `.workspace.is-right .splitter { margin: 0 -8px 0 0 → 0 0 0 -8px }`（触屏同名一条 `-20px`）。盒内的两个偏移随之取反号，否则线 / 三点会跟着偏 8px：`.workspace.is-right .splitter__line { left: calc(50% + 4px) }`（触屏 `+10px`）、`.workspace.is-right.is-collapsed .splitter__dots { left: calc(50% + 4px) }`（触屏 `+10px`）。不变量因此变成一句与左右无关的话：**热区永远一侧贴住侧栏、多出来的宽度全从编辑器那边借**（净空隙恒 4px，两栏宽度逐像素不变）。
    - **实测**（静态构建产物 + 探针；几何 23/23 绿、功能 8/8 绿、手势 3/3 绿，`cp.uiScale=1`）：改前后各跑一遍同一份探针 —— 390 竖屏触摸 · 侧栏在右，热区盒由 `[169.44, 193.44]`（右缘 = 侧栏左缘 +20）变成 `[149.44, 173.44]`（右缘 = 侧栏左缘 173.44，逐像素贴住），线中心 171.4 = 空隙中心 171.4 **改前改后同值**；命中扫描侧栏内 `+2..+40px` 全归树，轻点 `sidebar.left + 4` 由「命中 splitter、起拖拽、什么都没选中」变成「命中 `tree-item__row`、选中该行、不起拖拽」，折角箭头中心的一击由「`aria-expanded` false → false + 起拖拽」变成「true → false、不起拖拽」；从新热区起手拖到离右缘 22px（< 折点 30）仍当场折叠、松手仍是折叠态。宽屏 1400 同样镜像（热区 `[717.69, 729.69]`，右缘贴住侧栏左缘），折叠态三点中心 1343 = 中缝 1343 —— 与改前**同一个值**（盒整体平移、盒内偏移同步取反，视觉件一无所动）；侧栏在左（窄 / 宽两档）逐项与改前相同，`npm run verify` = A/B/C/D/F 绿 + E/G/H 红。

53. **窄屏判据从 CSS 挪进了 JS：软键盘一弹，`(orientation: portrait)` 当场翻面、整个窄屏形态弹回宽屏**（2026-10-13 加，用户报「唤出键盘之后，竟然退出了窄屏模式」）。六条：
    - **毛病在哪**：原判据 ① 是 `(pointer: coarse) and (orientation: portrait)`，而 `orientation` 看的是**布局视口**的高宽比 —— 软键盘弹起时安卓会把布局视口削矮（Tauri 那个 WebView 随窗口收缩，网页层的 `interactive-widget` 管不到 WebView；iOS 不受影响，键盘只缩可视视口，`@media` 看不见它）。竖屏因此当场翻成 landscape、三处 `@media` 一起失效：页头盒子回来、左簇从底栏弹回页头、折叠图标栏竖回去 —— 打字那一瞬间整个形态翻面。② 那条 `max-width: 600px` 兜不住：它只在宽度 ≤ 600 时命中，而出事的正是**宽度 > 600 的触摸设备**（平板竖屏 / 折叠屏展开 / 手机上开了「桌面版网站」）。
    - **修法**：判据挪进 `services/shellSettings.js`（`isNarrowLayout()`）—— ① 改读**设备朝向**（`screen.orientation.type`，不认它的浏览器退回比 `screen` 的宽高），键盘改不动它；② 照旧读视口宽。命中时给 `<html>` 挂 `is-narrow`，CSS 那三处由 `@media` 改成 `:where(html.is-narrow) …`。
    - **`:where()` 不是装饰**：它不贡献特异性，所以各块注释里那些 (0,x,0) 算式（`.sidebar .sidebar__context :deep(> *)` 的 (0,3,0)、`.workspace.is-collapsed :deep(.activity-bar)` 压 ActivityBar.vue 里那条 (0,2,0)）逐条照旧。改成 `html.is-narrow .x` 那种直写形式会给整块凭空加一层特异性，这些算式全被推翻 —— 别改。
    - **判据的三个输入要各有一条变更来源**：视口宽 → `resize`；设备朝向 → `orientationchange` / `screen.orientation` 的 `change`；**主指针是不是触摸 → 另挂一条 `matchMedia('(pointer: coarse)')` 的 `change`**。少了最后这条，答案会停在旧值上（探针当场量到过：先改视口、后开触摸模拟，挂到 `<html>` 的类没跟上）。
    - **实测**（无头 Chrome + 探针，`cp.uiScale=1`，改前 / 改后各跑同一份 11 条矩阵）：8 条既有判据**逐条未变**（390×844 触摸 ✓、768×1024 触摸 ✓、500×900 无触摸 ✓、844×390 触摸 ✗、1024×768 触摸 ✗、1400×900 ✗、768×1024 无触摸 ✗、720×900 竖高 ✗）；键盘三档（布局视口 768×700 / 768×420 / 390×420，`screen` 仍是 768×1024 / 390×844）改前**全部掉出窄屏**（旧查询 true→false、`.sidebar__head` 的 `display` 从 `contents` 掉回 `flex`），改后全部保持窄屏。另抽查两条走 `:deep()` 的规则（藏「添加测试样例」的字、打开底部那颗「收起侧栏」）在窄 / 宽两侧各自照旧。
    - **有意改掉的一点**：视口朝向与设备朝向不一致时以**设备**为准 —— 手机上开「桌面版网站」（视口 980 宽、设备仍竖屏）现在也算窄屏。这本来就是 ① 想表达的那句「竖屏的触摸设备」。

54. **浮层收敛的「匣」必须是可视视口，不是布局视口：软键盘弹起时两者会分家**（2026-10-14 加，用户报「软键盘弹出的时候，再长按换出菜单，这个菜单有可能被软键盘挡住」）。四条：
    - **毛病在哪**：`composables/usePopoverLayer.js` 的 `clampIntoViewport()` 原来夹的是 `window.innerWidth / window.innerHeight` —— 那是**布局**视口。而软键盘弹起时，安卓 / iOS 都常只缩**可视**视口（`visualViewport`）、布局视口一动不动（第 3 节「可视高度」那条已按同一事实处理应用本身：`.app.is-keyboard` 挂到 `--vvh` / `--vv-top` 上）。于是菜单按「触点 y + 自身高度」落下去之后，下半截整段停在键盘底下 —— 实测（可视高 596、`innerHeight` 仍是 915）在 y=543 长按，245px 高的菜单落在 543→788，**200px 被键盘盖住**。
    - **修法**：匣换成可视视口。新增模块级 `viewportBox()`，返回**布局视口坐标系**里的可见矩形（`[offsetLeft, offsetLeft + width] × [offsetTop, offsetTop + height]`）—— `fixed` 定位用的就是这个坐标系，所以不必做任何换算；`clampIntoViewport()` 里只把 `gap` 与四条边换成它，其余（右对齐那条先左移一个自身宽度、掉头由调用方决定）一字未动。`visualViewport` 不存在时退回布局视口，行为与以往逐像素一致。**菜单 / 设置下拉 / 文件树菜单共用这一处**（`ContextMenu.vue` 与 `SettingsMenu.vue` 都走它），所以改这一个函数三处一起好。
    - **实测**（探针按坑 47 那套造假键盘：`evaluateOnNewDocument` 里 `Object.defineProperty(window, 'visualViewport', { value: 假对象 })`，height=596 / offsetTop=0；412×915 触摸 + 安卓 UA，长按走真实 450ms 那条路；**改前 / 改后各跑一遍同一份脚本**）：S1「键盘弹着 · 长按靠下」改前 543→788（底边超出门槛 588 达 200px，**红**）→ 改后 **342.66→588**（底边正好压在键盘上沿、留 8px）；S2「键盘弹着 · 长按靠上（下方有空间）」的 `top` 改前改后都是 **200 = 触点 y**，没有被多此一举地挪动；S3「无键盘 · 长按靠下」两遍都是 661.66→907（= `innerHeight − 8`，**逐像素未变**）。`npm run verify` = A/B/C/D/F 绿 + E/G/H 红。
    - **悬着的一格（本次刻意没动）**：菜单**已经开着**、键盘高度随后变化时（换输入法、建议条收放）不会再匣一次 —— `onResize` 只挂在 `window.resize` 上，本文档没有验过「只缩可视视口时 `window.resize` 到底派发不派发」。要补这条路得再挂 `visualViewport` 的 `resize` / `scroll`，那是另一件事。

55. **三星 Internet 的属性检测是假阳性：`onbeforeinstallprompt` 在、安装事件不来**（2026-10-14 加，用户报「三星手机的三星浏览器打开网址，没有正确的安装引导，并且设置菜单中没有安装为应用的按钮」）。四条：
    - **毛病在哪**：三星浏览器是 Chromium 基座，`'onbeforeinstallprompt' in window` 为真，可它的安装事件实践中不派发 —— 三星自家开发文档从未提到这个事件，它的安装入口是地址栏那个「＋」徽标（ambient badging，要求 manifest 的 `display` 为 `standalone` / `fullscreen`，本站满足）与菜单 ›「添加页面到」›「主屏幕」。于是**三条判据同时走错**：① 面板状态词写「当前浏览器支持」、按钮却永远灰着；② 那一格补的说明是桌面口径（`blockedPrefix` + `chrome://apps` + `blockedSuffix`，安卓上那个地址打不开）；③ `app-manual` 的自动弹判据是 `!INSTALL_API_SUPPORTED` ⇒ 一条引导都不弹，齿轮菜单那颗「安装为应用」要 `canInstall` ⇒ 也不出现。用户看到的正是「没有正确的安装引导、也没有按钮」。
    - **修法**：把「引擎实现了这个事件」（**原始事实**）与「网页侧能不能靠它一键装」（**判据**）拆开 —— `INSTALL_EVENT_IMPLEMENTED` 留作模块内部事实，`INSTALL_API_SUPPORTED = 属性检测 && !MANUAL_INSTALL_BROWSER`，`canInstall` 也挂上它（否则三星上万一偶发派发了事件，就会亮出按钮、而状态词仍写「不支持」，又变成「状态词与按钮打架」）。`MANUAL_INSTALL_BROWSER = BROWSER === 'samsung'`，判据本体是 `platform.js` 新增的 `'samsung'` 一档（UA 的 `SamsungBrowser/`，**必须排在 `Chrome/` 之前**：两个 token 它都有）。文案走 `NO_API_KEYS.samsung` → `noApiSamsung`（中英并排，两条路都写：地址栏「＋」是安装口径、菜单那条永远在）；齿轮菜单按 13.3 那张表新增一颗「安装引导」（`when: MANUAL_INSTALL_BROWSER && !appInstalled`，动作就是面板那颗的 `fireSectionGuide('app')`）。`available('app-manual')` 一个字没改 —— 它的判据本来就是「没有可用的一键入口」，三星现在正好落进去（自动弹一次）。
    - ⚠️ **这是全项目唯一一处「用 UA 决定功能（而非文案）」**：「判据是能力探测、不是 UA」那条主纪律不变（13.4 第 4 条），它只是「属性检测在**已知**引擎上不可靠」的例外清单 —— 想再加引擎进这份清单，先问有没有别的路。
    - **实测**（dev server + 探针，五档 24 条全绿，界面由 `cp.uiLocale` 锁成中文）：三星 UA（真实引擎仍是 Chrome ⇒ **属性天然在**）→ 开机自动弹一条「安装为应用」+ 三星步骤、面板状态词「当前浏览器不支持」、说明行给三星那两句、全档无 `chrome://apps` 字样、齿轮菜单出现「安装引导」且不出现「安装为应用」、关掉通知再点它当场重发一条；三星 UA + `delete window.onbeforeinstallprompt` → 逐条同上（分支不依赖那个属性）。三条回归：桌面 Chrome（属性在）→「当前浏览器支持」+ 无应用类通知 + 菜单无引导行；桌面 Chrome 删属性 →「不支持」+ `noApiGeneric` 那句；安卓 Firefox 删属性 → `noApiFirefoxAndroid` 那句，两档菜单都无引导行。
56. **手势与分组状态机里有三类「出口漏写」，都只在边缘路径现形**（2026-10-20 加，对照 Chromium TabStripModel / WAI-ARIA tablist 规范做全局审计时查出）。三类：
    - **异常中断只认 pointerup / pointercancel**：`window` 失焦（Cmd+Tab、切应用、来电）时 pointerup 发生在**别的应用里**、永远回不来，按压态与定时器就永久挂着 —— 对这套手势来说 `armed` 的滚动锁 + 浮起态是唯一不能接受的死锁。判据：**只要在 pointerdown 里挂过一次性监听，就要问「这个监听有没有对应的异常出口」**，`blur` 与 `pointercancel` 走同一条清理链（`useTabDrag.onWindowBlur`），`onBeforeUnmount` 里一并摘。
    - **清内联样式前先问了「元素还在不在」**：`settle()` 原本 `if (!strip) return`，条带在松手那一拍消失（关掉最后一个文件）时一串内联 `translate3d` 留在元素上。判据：**清理动作无条件做，只有「要不要补间」才看几何在不在**（现写法先清 transform，再 `if (!strip || from == null) continue`）。
    - **成员关系有出口、组对象没有**：`addToGroup` / `removeFromGroup` 改完 `memberOf` 就走，被搬空的组对象连同名字颜色留着（`prune()` 只挂在 `groupTabs` / `closeGroup` 上）。判据：**凡是能搬走成员的入口，搬完都要 `prune()`**（幂等，重复调无害）。拖拽期的「空组暂留」不受影响 —— 拖拽中 `memberOf` 一概不动，松手结算才进这些函数。
    - **实测**：审计探针 11/11（空组 4、全折叠关页签 → `activeId=null` + `.editor-pane__empty` 出现 2、拖起后 blur → 拖拽态/内联 transform/滚动锁三清 3、正常换位回归 1）。
57. **「同组连续」只要破一格，渲染层就把它放大成「两枚芯片」（2026-10-20 加，用户报「拖动一个标签页到组里出现两个胶囊」）。** 三个要点：
    - **症状的位置会骗人**：`stripItems` 的芯片是**渲染期算出来的**（`runStart` = 前一格不是同组），`measureGroupLines` 也是一芯片一行 —— 所以数据层「组员排得不连续」的唯一后果，就是条带上长出第二枚芯片 + 第二条包络线（`v-for` 的 key 还会撞成重复）。看到「两枚胶囊」要先去查 `stripOrder` 里该组成员的下标连不连续，别去查 CSS / 芯片的渲染条件。
    - **谁都能破**：普通换位的准入条件是 `!drag.gid || next.gid === drag.gid`，**未分组的单元对它全放行**（视图页签、还没被吸入的页签）。拖入判据（右入 40% 自身宽 / 左入压过组首 12px）按**被拖页签自己的宽度**算，窄签对宽签时「前导边缘过中线」先到 —— 先换位、后入组，那一帧之后它已经在组中间，两块判据都不再命中。判据：**凡是能在数组里插一格的地方，都要问「这一格会不会落在某组的两名成员之间」**。
    - **两个执法点**：拖拽期在 `updateDrag` 的「跨组越界」一段（页签就地入组 / 视图页签整段跳过），落盘期在 `tabGroups.normalizeRuns()`（以组首为锚把成员贴回去，挂在 `prune()` 与 `onStripDrop` 两个分支上）。**只做前者修不了旧数据**（用户当场的脏 `stripOrder` 还在），只做后者修不了「拖动中就已经劈开」的观感 —— 两边都要。
58. **页签变矮之后，包络线的顶边不能写死 `1`；宽度是「三处样式 + 一处联动」**（2026-10-20 加，用户口径「缩小这个高亮的区域」，追问后定「高度和宽度都收窄」；同日追记「文字要在标签页栏里上下居中」「悬停高光与上下的间距不同」「被选中的样式高度应该和高亮的区域高度对齐」）。七个要点：
    - **高度只从顶收、底边不动**：条带仍是 35px（`useTabDrag.collectUnits` 只吃 `offsetLeft` / `offsetWidth`，纵向不参与几何；芯片是 `align-self: center`），页签 `.editor-tabs__item` 加 `height: 30px`，条带 `align-items: stretch → flex-end` 把上面那 5px 让出去。**别改成「页签居中、条带也跟着压到 30」**：选中页签的底边要与下面的编辑区连成一片（`::before` / `::after` 那两只脚锚的就是底缘），而且退场页签的 `left/top` 与包络线的高度基准 `h` 都取实际盒子。实测：改前页签 `y=7 / h≈35 / bottom=42`，改后 `y=12 / h=30 / bottom=42`（底边像素不动）。
    - **包络线顶边必须实测**：`measureGroupLines()` 原先四处写死 `1`，页签矮下去以后那 5px 又被圈回高亮里。改成 `const top = active.offsetTop + 1`（`offsetTop` 相对条带、不受 `transform` 影响；同日晚些时候选中块上抬之后这条又减了 `TAB_RAISE`，见本条第 7 点），路径里四处 `1` 全换成 `top`。实测 ring 的 `getBBox()` 从 `{y:1, h:33}` → `{y:6, h:28}`。**凡是「圈住某个盒子」的描边，边距都要从那个盒子实测来，别从条带的常量来。**
    - **内容要相对「栏」居中，不是相对「页签盒」**（用户当天追加口径）：页签 30 贴底之后，`align-items: center` 只是在**盒内**居中 —— 文字中心落在 27，而 35px 条带的中心是 24.5，看着像字坠在栏底。给页签补 `padding-bottom: 5px`：内容盒变成 12→37、中心正好 24.5，图标与文字一起上移 2.5px；底色仍铺满整个 30px 盒（背景覆盖 padding box）、两只脚仍锚 `bottom: 0`。**别改用「整枚页签在条带里居中」**：那样底边离编辑区 2.5px，选中页签的脚会悬空、与编辑区断开。实测 `label.cy = icon.cy = 24.5 = strip.cy`（Δ0.00），页签仍 30 贴底（`bottom=42`），`::after` 仍 `bottom: 0 / height: 8px`。
    - **宽度三处一起收**：`gap: 5px → 4px`、`padding: 0 7px 0 10px → 0 6px 0 9px`、`.editor-tabs__label` 的 `max-width: 160px → 128px`。左右内边距仍保持不对称（右端 × 的墨迹只占 15px 框里的 7px），那条口径没变、只是各收 1px。
    - ⚠️ **`gap` / `padding` 在折叠动画的首帧里是硬编码的**（`toggleGroupCollapse` 的 `open` 帧 `paddingLeft/paddingRight`），改样式必须同步那两行，否则展开到第一帧时页签会跳 1px。实测（探针 5/5）：点击仍能激活、拖拽仍能起手并换位（`main aaa. bbb. ccc.` → `ccc. main aaa. bbb.`）、页签 `h=30`、ring `{y:6, h:28, w:220.5}`；`npm run verify` 基线不变（A/B/C/D/F 绿，E/G/H 既有红）。
    - **悬停高光要跟文字同心，不能铺整盒**（用户同日第三句「鼠标放上去之后，高光与上下的间距不同」）：`background` 铺满 30px 盒时永远是「上 5 / 下 0」。改成由 `::before` 画 `inset: -2.5px 0 2.5px` 的圆角块（顶边越过盒 2.5px、底边内收 2.5px；块高仍 30、块心 24.5 与文字同心），`.editor-tabs__item:hover` 自身 `background: transparent`。三个配套：① 页签要 **`isolation: isolate`**，否则 `z-index: -1` 的伪元素会降到更外的层叠上下文、跑到条带底色下面（症状是「高光整块不见了」）；② `--active` / `--pressing` / `--dragging` 三种状态必须排除（选中页签有自己的底色、长按进度要整盒、拖动中整盒才像「被拎起来」）；③ **别用 `clip-path: inset(0 0 5px 0)` 裁底部来省事** —— `clip-path` 连命中区一起裁掉，鼠标停在页签底部那几像素就会 hover 掉、进「有/无」抖动循环。实测 17/17：`::before` 的 `top=-2.5px / bottom=2.5px / height=30px / z=-1`，高光块到条带上下各 **2.5px**，悬停后页签底部 2px 处仍命中页签；编组后 5/5（包络线 SVG 仍在、`bbox {y:6,h:28}`、一组一枚芯片、高光块照常）。
    - **选中块的上缘要跟高光齐平**（用户同日第四句「选中之后的，被选中的样式高度应该和高亮的区域高度对齐」）：高光块是 9.5→39.5（上下各 2.5），选中页签的底色却只铺 12→42 —— 两块**高度都是 30**，差的只是那 2.5px 的错位，并排时上缘一眼就是一道台阶。**别靠撑高盒子纠正**（`height: 32.5` 会顶动内容、`margin-top: -2.5` 会把页签压到条带外）。正解是往正上方多铺一块同形状同色的 `box-shadow: 0 -2.5px 0 0 var(--bg-tab-active)`：影子落在盒外的部分只有顶边那 2.5px，两侧与下缘全被盒子自己的底色盖住 —— 净效果「上缘抬 2.5、下缘一个像素没动」，仍与编辑区连成一片、两只脚照旧接得上（用户在这条与「悬浮药丸」之间选的就是这个：只对齐上缘、底部铺满）。四个配套：① 基类要给一条 `box-shadow: 0 0 0 0 transparent` 并写进 `transition`（`none` 不参与插值，选中那一瞬会先冒出一条硬边）；② `--pressing` 的 `transition` 会整个顶掉基类那条，必须补 `box-shadow 200ms linear`；③ 两段按压反馈把底色换成 `--bg-hover` 时檐也得跟着换色（`.editor-tabs__item--active.editor-tabs__item--pressing` / `--armed`），否则选中页签一长按、顶上留一条选中色的小檐；④ 触屏拖拽那条 `box-shadow: 0 6px 18px` 是 (0,3,0)、会把檐一起顶掉，要给 `--active`+`--dragging` 补一条把两条影子叠起来（偏移不同、不冲突）。
    - **包络线顶边跟着减 `TAB_RAISE`**：`const top = active.offsetTop - TAB_RAISE + 1`，实测 ring `{y:3.5, h:30.5}`（块顶 2.5 + 1）。**`2.5` 这个数三处同值** —— 脚本的 `TAB_RAISE`、`:hover::before` 的 `inset: -2.5px 0 2.5px`、`--active` 的 `box-shadow` 偏移，改一处必须改三处。实测（探针 6/6）：选中块上缘 9.5 = 高光块上缘 9.5、`box-shadow` 计算值 `rgb(24, 24, 24) 0px -2.5px 0px 0px`、下缘仍 42 = 条带底缘、两只脚仍 `display: block`。
59. **条带末位页签的右下角要「朝外摊开的脚」，不是「向内收的圆角」**（2026-10-20 加，用户先报「最右边的那个应该也有右下角的圆角」，照字面改成 `border-bottom-right-radius: 8px` 之后又报「选中之后，最右侧标签页的样式有问题」，并附参考图）。三条：
    - **参考图量出来的形状**（`sips -s format bmp` 之后逐行扫边界，520×92，横竖各约 2 倍）：顶角半径 ≈10px、两侧竖直，**底边两角都是向外张开的凹弧** —— 左边界从 42 一路收到 24、右边界从 505 放到 519（镜像的 8px 脚），脚下面是同色的内容区。也就是 `::before` 那只脚的镜像，与 `border-radius` 无关。
    - **判据**：选中页签与编辑区同色，本来就是要「连成一片」。凡是把底角往里收的处理（凸圆角、或者干脆方角）都会在那 8×8 里露出**条带的底色**，读起来就是「一块浮在条带上的方片」；脚是唯一能接住下面内容区的画法。**改「角」之前先把参考图逐行量成边界数字，别把「圆角」照字面实现成 `border-radius`。**
    - **实现与代价**：`.is-strip-first::before` 仍然 `display: none`（x<0 被裁、本来就看不见），`.is-strip-last::after` 不再关。代价是这只脚给横向滚动容器垫出 8px 假行程 —— `::after` 是 abspos，**换成 `transform: translateX(8px)` 一样躲不掉**（实测 `scrollWidth` 1164 → 1172）。现在接受它：滚到最右时多出来的这 8px 正好是脚落地的地方（末位页签右缘落在条带右缘内 8px）。实测（三页签，浅 / 深两套主题）：末位选中 `border-radius: 8px 8px 0 0`、`::after display:block / right:-8px`，元素截图与参考图同形；第一张选中做对照，左脚仍不画。`npx vite build --outDir /tmp/…` 通过。
60. **「单击分隔条 = 折叠 / 展开」与「拖拽调宽」的分界要严于触摸端的轻点口径**（2026-10-20 加，用户报「本是在拖动，却判定成点击」）。六条：
    - **判据在 `App.vue` 的 `stop()`，三条全过才算单击**：① 横向位移 ≤ slop；② 这一趟**真的改过面板宽**（`|dragPanelPx − pressPanelW| > CLICK_WIDTH_EPS`）；③ 松手事件是 `pointerup`（`pointercancel` 一律不翻面）。任一条不过就按拖拽处理 —— 拖拽不翻面。
    - **只量横向（`dragDx`），不量两轴取大值**：分隔条只做横向拖拽，纵向抖动不该被算成「动手了」。`moved`（两轴取大）仍保留，但只服务窄屏那条「按了没动就把占比原样退回」—— 那是触摸端「轻点 / 滑动」的口径，别合并。
    - **slop 按 `pointerType` 分岔**：鼠标 4px（点击抖动通常 ≤2px），手指 / 笔沿用 `TAP_SLOP = 10`。压到 4 会让宽屏触控设备上「点一下收起」直接失灵 —— 点按抖动是手指的物理事实，不是代码能收紧的。
    - **判据 ② 的基线 `pressPanelW` 用与 `move()` 完全同一套像素直连算式在按下点算一遍**，不是量 DOM：热区是整块铺在细线**一侧**的 24px 盒子，按下点未必落在线上，绝对值会偏十几像素，但那个偏移在首尾两端同时出现、相减即消 —— **比的是差值**。
    - **判据 ② 必须在 `finish()` 之前取**：`finish()` 会把 `dragPanelPx` 清成 `null`，放在它后面永远是「没拖过」。
    - **刻意不用「按住多久」当判据**：按住不动再松手仍是点击意图，用时长卡它只会让「按一下想收起」偶尔失灵。实测（1400×900，自起 dev server，真鼠标事件）：纯点击翻面 ✓；纵向抖 6px 仍翻面 ✓（`dragDx = 0`）；横向拖 3 / 6 / 8px（含按住 400ms 再拖）**一律不翻面**、面板宽各变 564.7 / 574.4 / 586.8 ✓；拖 120px 只调宽 ✓；之后点击照常翻面 ✓。`npm run verify` 基线不变（A/B/C/D/F 绿，E/G/H 既有红）。
61. **松手瞬间面板会窄 1~2px：像素宽反算占比要除以「内容宽 − 分隔条净占宽」**（2026-10-20 加，用户报「拖动松手的时候，有个大概只有 1px 的宽度抖动变化」）。五条：
    - **真因不在舍入，在 flex 收缩**：两栏 basis 加起来是**内容宽**的 100%，而这一行里还站着分隔条（`flex: 0 0 12px` + `margin-right: -8px`，净占 **4px**）。多出来的 4px 由两栏按各自 basis 的比例 shrink，于是面板实得宽 = `t% × (内容宽 − 4)`，比 `t% × 内容宽` 少 `4 × t/100`。拖拽期间走的是像素直连（`flex-grow: 0; flex-shrink: 0`，不吃收缩），一松手切回百分比就当场窄掉这 1~2px。
    - **实测**（1400 宽、`uiScale=1`、面板在右）：拖到 470.5313 → 松手 469.1719（**−1.36**）；另一档 499.2813 → 498.2344（**−1.05**）。两档都对得上 `4 × 面板占比`（0.339 → 1.356、0.36 → 1.44 里剩下的那点差是下一行说的舍入）。
    - **修法**：`measureLimits()` 多返回 `paneSpace = 内容宽 − splitterOuter`（宽度读 rect、左右外边距读计算值 —— 两者都随 `--ui-scale` 缩放，差值恒为 4；分隔条不可见时 rect 为 0，按净占 0 处理）。`finish()` 反算改成 `100 − dragPanelPx / paneSpace × 100`。**别再把 `width` 当分母**。
    - **舍入同时从 0.1% 收到 0.01%**：0.1% 在 1400 宽上是 1.4px 一格，余量还有 ≤0.7px —— 修掉收缩之后那半像素就成了新的「松手一抖」。收紧后残差 ≤0.0625px（一个 LayoutUnit）。落盘的 `cp.editorShare` 因此可能带两位小数（如 72.86），`applyShare` 那套 0.1% 舍入只服务方向键 / 收敛，不冲突。
    - **`handoffDrag()` 里那两处反算没跟着改**（仍是 `(width − px) / width`）：它们只是折叠动画的起点，面板随即收到 `0%`，差 0.7px 看不出来。要改就两处一起想清楚，别只改一半。改完实测：五次不同位移（含 33.7 / 60.3 / 87.45 这类小数）松手前后差 **≤0.0625px**，反向拖同样；`npm run verify` 基线不变（A/B/C/D/F 绿，E/G/H 既有红）。
62. **Vue 的 reactive Proxy 进不了 IndexedDB；事务中途抛异常时不 abort 会留下「半批数据」**（2026-10-20 加，用户报「推送之后刷新，通过随机题目得到的题目会丢失」—— 与推送无关，任何一次刷新都丢）。六条：
    - **症状**：抽题面板里导入的题目，界面上树里有、页签也开着；刷新后题目整个消失，**IndexedDB 里只剩 `/<年月>`、`/<年月>/Codeforces`、`/…/<难度>` 三个空目录**，文件节点与它的正文一个字都没进库。树里留下空文件夹，页签被 `rebuildTree` 当「文件已删除」清掉。
    - **真因链条**（四步，缺一不成立）：① `useCfPicker` 的 `results` 是 `ref`，`results.value = response.problems` ⇒ 元素与**嵌套字段**（`task.tests`、`task.languages`）都是 reactive Proxy；② `importOne` 把 `problem.task` 原样交给 `importProblem`，`buildConfig` 只做**浅**展开 `{...task, oj, importedAt}` ⇒ 嵌套值仍是 Proxy；③ `LocalVFSProvider._commit()` 的 `nodesStore.put()` 对 Proxy 抛 `DataCloneError`（structured clone 不认 Proxy）；④ `idb.js` 的 `commitTransaction` 用 `try` 把**同步抛异常**吞成 `resolve(false)`、**却不 `tx.abort()`** ⇒ 抛之前已入队的记录（三个目录）照常提交，抛之后的一个都不写。
    - **为什么只有抽题这条会中**：扩展抓题走 `postMessage` 的普通对象、手写探针也是普通对象，都能 clone。**落库层只该看见纯数据**，reactive 数据必须在入口 `toRaw` 剥掉 —— 现在 `importOne` 传的是 `toRaw(problem.task)`。
    - **修法三条**：① `useCfPicker.importOne` 传 `toRaw(problem.task)`（`toRaw` 取回原始对象，它底下本来就是原始对象）；**比赛视图同款两处也一起改**（`useCfContest` 的 `importOne` 与 `scrapeSamples`，`problems` 也是 ref，症状一字不差）；② `commitTransaction` 的 `catch` 里先 `tx?.abort()` 再 `resolve(false)`，让事务**要么全成、要么全不成**（这一刻 `onabort` 还没挂上，不会二次 resolve；事务可能已被浏览器自动中止，再 abort 抛的 `InvalidStateError` 咽掉）；③ 别让失败静默：`LocalVFSProvider._commit()` 返回布尔（纯内存降级与空批次不算失败），`BaseVFSProvider.batch()` 见 `false` 记一条 `console.warn`，单条写路径（`#persistPuts`）就地记一条。判据用 `=== false`，默认 `_commit` 是 no-op、返回 `undefined`，不能当失败。
    - **验证**（自起 dev server、真界面走「抽题 → 导入 → 刷新」）：修前刷新后库里只剩三个空目录；修后文件节点带 `meta` + `config` 落库，刷新后树里可见、页签自动恢复、`contents` store 三条（main.cpp / main.py / 题目）。abort 语义单独验：往事务里先塞目录再塞带 Proxy 的记录 → 返回 `false` 且目录**也没落库**；走 `vfs.batch()` 同样不留半批，控制台出现一条 `[vfs] batch not persisted: …`。
    - **没做的**：`_commit` 失败只留 warn、不抛错（抛错会连带 `_rollback()` 把内存也退回去，行为变更比这次请求大）。要是哪天要「写入失败就提示用户」，得把 `batch()` 的返回值改成显式失败、并在调用方接住，别只在 VFS 里抛。比赛视图那两处 `toRaw` 未单独跑端到端（要真实比赛 + 扩展才能验），与抽题那条是同一行代码、同一个数据形状。
63. **同一份产物「第一遍」跑在 V8 的 Liftoff 上，比稳态慢 25–40% —— 而它必须正好是第一条样例**（2026-10-26 加，用户报「第一次运行代码的时候，第一条样例似乎把编译时间也算进去了，有时候耗时过多，甚至会 TLE」）。五条：
    - **症状**：同一批用例、同一份代码，第一条的耗时明显比别人高（实测 300M 次循环：首条 602.9 ms，后三条 427.6 / 434.7 / 435.2 ms），量大到能改判定 —— 时限设 175 ms 跑三条同样的用例，**首条 TLE、后面两条 163 / 161.5 ms 通过**。刷新后再跑又恢复正常，因为产物和 Module 都还在缓存里。
    - **真因**：不是编译被算进运行段（`runMs` 量的就是 `_start` 起止，编译在它之前）。是 **V8 的 wasm 分层编译**：`wasi.worker.js` 的 `moduleCache` 让整批用例复用**同一个** `WebAssembly.Module`，而这份 Module 的**第一遍执行**跑的是 Liftoff 基线代码，热函数要等 TurboFan 编完才切过去，于是整遍慢 25–40%。偏差之所以全压在第一条上，正是因为 Module 只建一次、后面几遍都是热的。Python 不受影响：它每条用例都是全新的解释器实例（实测 90 / 91 / 88 ms，本来就每条都冷）。
    - **修法**：`wasi.worker.js` 在 run 结果里回报 `cold`（这一遍是不是刚 `compile` 出来的 Module）→ `runnoSandbox.runCpp` 原样带回 → `wasmRuntime.runCase` 见 **`cold && ok`** 就把这一遍整个丢掉（耗时与输出都不要），再跑一遍拿它的数当结论。三条边界：① **判据不能加「首遍没超时」** —— 首遍恰恰是因为冷 JIT 才超的，拿它当门槛等于把要修的现象留在原地；② 程序真跑不完时看门狗在第一遍就掐断（走 catch），到不了这里，所以最坏只是墙钟翻倍、上界仍是 `时限 + 宽限`；③ 第二遍若仍是 `cold`（worker 被看门狗重建过、Module 缓存跟着没了）就不再循环，退回第一遍 —— 只跑两遍，绝不「跑到不冷为止」。
    - **实测**（自起 dev server + 探针直调 `wasmRuntime.runCase`，本机 Chrome）：修前每种规模的「新 Module 首遍 / 第二遍」= 1M `2.5/1.6`、5M `10.5/7.7`、20M `40.7/30.7`、100M `197.6/150.9`、300M `602.9/427.6`；修后同一组全是稳态值（`1.6/1.6`、`7.8/7.7`、`30.6/30.1`、`151.2/148.3`、`434.7/435.2`）。时限 175 ms 的三连跑：修前 `TLE / 163 / 161.5`，修后 `150.8 / 150.2 / 150.6`。界面回归（三条 a+b 用例、冷启动）：首条从 `1.9 ms` 变成 `0.0 ms`、三条齐平，阶段总线里能看到 `run` 连着出现两次（2429 → 2434 ms）。边界回归：CE 仍是一次编译 + `durationMs: null`；RE（野指针）不预热、直接 `RE`；死循环在 `时限 800 + 宽限` 处被掐断（`durationMs 901`）、只跑一遍；Python 三条仍是 `60 / 62 / 55 ms`。`npm run verify` 基线不变（B/C/D/F 绿，A/E/G/H 既有红）。
    - **代价与口径**：改代码后的**第一次运行**里，第一条用例的墙钟会多出「一遍程序运行」（最坏 `时限 + 宽限`，会 TLE 的程序不重跑），卡片上的数字与后续用例同档。⚠️ 别把这条修法顺手扩展到 Python：它每条用例本来都冷，加了预热就是每条都白跑一遍 —— 平白把墙钟翻倍。

64. **`backdrop-filter` 与 `-webkit-` 前缀**成对**写，线上就整条失效**（2026-10-26 加，用户报「localhost 和网站上倒计时窗口的透明度不同，网站的高很多」）。四条：
    - **症状**：dev 下磨砂模糊正常，线上产物里 `backdrop-filter` 计算值是 `none` —— 倒计时卡 / 放大镜 / 通知条的半透明底不再糊背景，背后的代码清晰透上来，看起来「透明度高很多」。实际透明度没变（`--cd-bg` 两边都是 70%），变的是模糊没了。
    - **真因**：rolldown-vite 的 CSS 压缩（Lightning CSS）遇到「标准 + `-webkit-` 前缀」成对出现时**只保留前缀那条**（线上 `main-*.css` 实测只剩 `-webkit-backdrop-filter:blur(...)`），而 **Chrome 141 起移除了 `-webkit-backdrop-filter` 别名** —— 解析时整条丢弃，CSSOM 里规则里干干净净没有这个属性。dev server 吐未压缩 CSS（标准属性在），所以本地永远复现不出来。
    - **修法**：源码里**只写标准属性**，一行前缀都不要（Chrome 76+ / Firefox 103+ / Safari 18+ 都认；压缩器会按它自己的 targets 自己补前缀，补回的 `-webkit-` 是给老 Safari 的、Chrome 不认就忽略，无害）。改动四处：`CountdownCard.vue`（卡片 + `is-locked`）、`EditorPane.vue`（放大镜、toast）、`NotificationCenter.vue`（通知条）。改完产物里标准 / 前缀两条并存，`vite preview` 实测计算值 `blur(0.875rem)` 回来了。
    - **通用判据**：**凡是「本地正常、线上缺一条 CSS 效果」的报障，先 curl 线上那份 `main-*.css` 对着源码查这条属性还在不在** —— 压缩器吞属性是静默的，`getComputedStyle` 在 dev 上永远查不出来。同类高危写法还有：依赖声明顺序的缩写展开（`background` 缩写覆盖前面的 `background-color`）、`@media` 参数被 pxtorem 转换单位（已用 `mediaQuery: false` 关掉，见 vite.config.js）。

65. **触屏上的 `:hover` 会粘住：手指抬起后元素仍是 hover 态，直到点了别处**（2026-10-30 加，用户报「触屏模式下拖动拖拽条，有的时候松手之后蓝线还存在」「样例栏的写入 / 复制按钮点完热区还高亮」）。八条：
    - **症状**：手指点在按钮上抬起 → 高亮不退；长按拖分隔条 → 松手后 `.splitter__line` 的蓝线留驻。点一下空白处才恢复。键盘 / 鼠标一切正常，所以只有真机报障。
    - **真因**：**`:hover` 的状态机不区分输入设备** —— 触屏上它被沿用成「最后一个触点落在这里」，要等下一次 pointerdown 落在别处才清。全站原先用 `@media (hover: hover)` 做闸门，而那个媒体特性判的是**设备**，不是「这一次输入」，于是三种情况全漏：① **安卓的「长按模拟悬停」**：长按期间 `(hover: hover)` 在部分机型 / 浏览器上当场成立，而拖分隔条这个动作本身就是长按 —— 闸门自己开了；② 手机开「桌面版网站」、Windows 触屏本（既有鼠标又有手指）：媒体查询恒真，手指点按照样粘；③ 同一台设备鼠标与手指交替，媒体查询根本不变。
    - **修法**：新增 `src/services/hoverCapability.js`，全站唯一的悬停判定出口，`main.js` 里 `import` 即执行（早于首帧，避免首屏闪一下悬停态）。它给 `<html>` 挂 / 摘 `is-hoverable` 类：初始值与「开」的闸门用 `(any-hover: hover)`（判「有没有**任何**可悬停指针」，纯触屏恒假，比 `(hover: hover)` 更严）；`pointerdown` 捕获阶段 —— `pointerType === 'touch'` 就关并记时刻，鼠标 / 笔按设备能力重开；`pointermove` 只在「鼠标 + 当前是关 + 距上次触摸 > 700ms + 设备有悬停能力」时重开（700ms 是躲开触摸抬起时浏览器补发的那串 `pointermove`）。**所有 `:hover` 规则加 `:where(html.is-hoverable) ` 前缀**，本轮 31 个文件、源码里 132 处统一改完。`:where()` 特异性为 0，不破坏既有覆盖顺序，也不会被 scoped 的 `data-v-*` 反压。
    - **原先靠 `@media (hover: none)` 常亮的兜底也要反向改**：`TestCaseCard.vue` 的垃圾桶（本轮全站唯一一处这种兜底）原先用 `@media (hover: none)` 让它常亮（触屏没有 hover，0.18 的隐形态会让人找不到它），在「插着鼠标的触屏本」上那个查询不成立 → 常亮不生效、又走不到 hover → **停在 0.18 幽灵态**。改成 `:where(html:not(.is-hoverable)) .icon-btn--danger:not(:disabled)`，判的是「这一刻的输入」，两边都对。
    - **分隔条另加两条兜底**（`App.vue` 的 `beginDrag`）：系统手势（边缘回划、拉通知栏、来电）会把**整串指针事件**吞掉，`pointerup` / `pointercancel` 一个都收不到 → `dragging` 永远挂在那里。补 `window` 的 `blur` 与 `document` 的 `visibilitychange`（`hidden` 时才收尾）两个出口，都走同一个 `finish()`。
    - **实测**（自起 dev server + 无头 Chrome，探针在 `/tmp/hoverprobe/`，跑完即删）：手机口径 412×915（`page.emulate` + CDP 触摸，`hover:none`）—— 指针压住写入 / 复制按钮，改前背景 `rgba(50,53,57,0.992)`、改后 `rgba(0,0,0,0)`；垃圾桶改前**常态就是红的**、改后回到 0.18。桌面 1200×800（`hover:hover`）两组读数与改前一致（悬停高亮照常）。触摸拖动分隔条四场景（shrink / collapse / blur / hide）：拖动中 `dragging:true` / 蓝线 `opacity:1`；松手 / 失焦 / 转后台后均 `false` / `0`。产物 CSS 里 `:where(html.is-hoverable)` 共 188 处、`@media (hover: hover)` 残留 0 处，scoped 属性落在最右复合选择器上（`:where(html.is-hoverable) .cf-input[data-v-bc80c02c]:hover`）。
    - **两处刻意没改**：`styles/guide.css` 不给那两页（`guide.html` / `privacy.html` 及其英文版）加闸门 —— 它们不走 `main.js`，拿不到 `is-hoverable`，加了等于把悬停反馈整条废掉。**以后要动它们得先让那两页自己挂类**。另外这轮只处理 hover 类残留，`pointerdown` 期间的 `:active` 不受影响、也不用管（抬手就退）。
    - **同类排查（2026-10-30 追记，用户问「标签页的关闭按钮是否也有类似问题」）**：`EditorTabs` 的 × 不属于受损面 —— 它的显形主路径是 `.editor-tabs__item--active .editor-tabs__close`（选中态，与输入设备无关），hover 只负责「非激活页签上露出」与「更亮 + 底色」。实测触屏：`is-hoverable=false` 时手指压住页签 / 压住 ×，× 始终 `opacity 0.75`、背景透明（不上 `--bg-control-hover`），松开正常关闭；桌面 1200×800 压住 × 时背景 `rgb(61,61,62)`、移开即退回 —— 两边都对。审计方法是遍历 CSSOM 取所有含 `:hover` 且不含 `is-hoverable` 的**单个选择器**（逗号拆开、`[data-v-*]` 归一），结果**站内自写样式 0 条**、只剩 Monaco 自带 74 条（`.monaco-editor .codicon`、`.minimap-autohide-mouseover:hover`、`.action-widget` 等）。**这 74 条别去写 override 反转**：它们是 `monaco-esm` 的 CSS（`node_modules` 里），逐条反转会把桌面端的折叠箭头 / 滚动条悬停反馈一起废掉；无头实测触屏 tap 行号槽后折叠箭头仍 `0/2` 显形（不粘），只有真机长按才可能把这个 hover 挂上去，可见面很小。**排查看这一节就够，别再另起一份清单**。

66. **装成 app 之后的「系统返回」不是事件、是历史：一条哨兵 + 一条自维护的栈**（2026-10-30 加，用户问「装成 app 之后能不能拦截系统返回、映射成站内操作」；落地在 `src/services/backStack.js`，全貌见第 23 节）。八条：
    - **能接管的不是 `backbutton`**：Web 平台从来没有这个 API（那是 Cordova / Capacitor 的私有事件），PWA 里也没有任何「返回键按下」的通知。安卓装成 PWA 之后，返回键与边缘返回手势**先走 webview 的历史**，历史空了才退出 app —— 所以能接住的只有「后退」这一发 `popstate`。iOS 独立窗口既没有返回键、也没有后退手势，那条路上机制空转、无害（别为此写特判）。
    - **必须让历史里恒压着一条哨兵**：启动时 `pushState` 一条带标记的条目，`popstate` 一到就补回。⚠️ **补回必须同步** —— 不能在 `async` 函数里、等某个 `await` 之后再补：那一拍用户已经看见回退动画，慢的设备上页面可能先卸载。所以 `onPopState` 是同步函数，先出栈、调 `onBack()`、再 `ensureSentinel()`。
    - **哨兵不能整体覆盖 `history.state`**：`services/cloudEntry.js` 早就往 `history.state` 里放了 `cpCloudEntry`（`/<handle>` 那条地址的载荷，见 §2 那一格）。一律写成 `{ ...history.state, [SENTINEL_KEY]: true }` —— 整体替换会把云端入口那条链路打断。
    - **栈自己维护，不拿 history 层数当 UI 层数**：「开一层压一条 `pushState`」那种天生对齐的写法被否决了，两个理由：① 刷新之后那些条目**静默残留**，用户下次打开按返回，浏览器吃掉一层、屏幕上什么都不动；② 点遮罩关闭时不进 `popstate`，还得主动 `back()` 伪造一次后退，多出一路不可控的时序。现在历史里恒定只有一条哨兵，UI 层数完全由 `backStack.js` 里那个数组说了算。
    - **`display_override: ["fullscreen"]` 匹配的是 `(display-mode: fullscreen)`，不是 `standalone`**：三个 query（`standalone` / `fullscreen` / `minimal-ui`）都要列，漏一个就等于「装了 app 但返回没接管」—— `manifest.webmanifest` 里那一行就在同一个仓库里，改之前先对一眼。再加上 iOS 那个 `navigator.standalone`。**只在独立窗口武装**：浏览器标签页里 `Alt+←` 是用户真想回上一页，拦下来站不住脚（这条就是 `armBackStack()` 返回 `false` 的分支）。
    - **栈底不许把历史漏空**（2026-10-30 改过一次口径）：第一版是「栈底不发哨兵、下一发由系统退出 app」，用户驳回为「容易误触」—— 现在栈底**无条件补回哨兵**，那一发返回等于什么都不发生，退 app 走系统默认路。补哨兵那一句收在 `onPopState` 的 `finally` 里（三个分支共用一个出口），别退化成「每个分支各写一遍」：层里的 `onBack` 抛个异常就会漏，而漏的后果是下一次返回真的退出 app，报上来只会是「偶尔一按就退」。另外「Web 上做不到『再按一次才退』」这条老判断仍然成立 —— 哨兵要先被弹掉，那一发必然先进 `popstate`。新开的层不补哨兵也别担心（`pushBackLayer` / `addBackFallback` 里各有一句 `ensureSentinel()` 幂等兜底）。
    - **`watchBackLayer` 的 source 要用「生效态」，不是「存档态」**：题解全屏接的是 `mdFullscreen` 而不是 `mdView.fullscreen` —— 在全屏里点开一个 `.cpp` 时生效态回落成 `false`（`mdView` 的 `mdActive` 那条），存档态还是 `true`，接错就一直占着一层、按返回什么都不发生。同理**注册点必须收在「拥有生命周期」的地方**（浮层在 `usePopoverLayer`，三个开 / 关状态在各自的组件里）：`pushBackLayer` 的注销必须与注册成对，散出去写必然漏一个，漏一个就在栈里留个幽灵条目。
    - **实测**（自起 dev server + 无头 Chrome 1400×980，探针 `/tmp/back-probe.mjs`、`/tmp/noexit-probe.mjs`，跑完即删；浏览器标签页里用 `?backstack=1` 这个探针口子强制武装）：启动即压好哨兵；齿轮浮层上按返回只关菜单、URL 不变；**Esc 关掉浮层之后再按返回，落的是下一层**（没有幽灵条目）；栈底连按 5 次全部停在站内、不弹任何 toast、`history.length` 稳定 3；删除确认上按返回是**取消**（文件还在）；题解全屏上按返回退全屏、两栏布局恢复；确认卡 + 全屏叠着时返回一次**只退最上面那层**；一路按到底**仍在站内**（2026-10-30 起，之前是离开站点）。另开一个无参数标签页对照：`history.state` 仍是 `null`、`history.length` 仍是 2，**完全没武装**。第二支探针（`/tmp/back-probe2.mjs`）验窄屏抽屉与 CF 兜底：560×900 下抽屉收起、宽屏 1400 下**不**收侧栏、CF 切「赛程」后退回「抽题」且不弹提示、CF 页签关掉后按返回不被它抢走。第三支（`noexit-probe` 的 E 段）用两个假兜底验健壮性：前一个抛错不连累后一个、后一个能反复消费、注销后回到「什么都不发生」，三种情况哨兵都在。第四支（`/tmp/exp-probe.mjs`）验后加的四层：伪装成桌面壳（塞 `window.__TAURI_INTERNALS__`，只有那时导出才先弹二选一卡片）后右键导出 → 按返回只退卡片、不替用户选；播种 `cp.cloudAccount` 造出危险区 → 「解绑」卡按返回是取消、handle 还在；把 `cloudEntry.pendingCloudHandle` 置值造出「应用云端配置」卡 → 按返回后它被清空（证明走的是 `cancelCloudApply`，否则下次刷新还问）。卸载卡只能读代码 —— 它要运行时真 ready（76MB 工具链），探针里造不出来。`npm run verify` 与改动前的基线一字不差（**B/C/D/F 绿、A/E/G/H 红**；四项都是既有失败，A 自 2026-10-23 起由绿转红、根因未查，口径见 23.5）。
    - **哪些是新增、哪些改了既有行为**：浮层 / 六个卡片（提交 / 删除 / 导出 / 卸载 / 解绑 / 应用云端配置）/ 题解全屏 / CF 页内后退都是「以前按返回直接退出、现在落在站内」，属纯新增；**改过既有行为的是两处**：① 窄屏抽屉（以前窄屏按返回直接退 app，现在先把抽屉收起来），所以那一层的判据必须带 `isNarrowLayout()` —— 宽窄屏共用同一个 `panelVisible`，无条件接会让宽屏上按返回把常开的侧栏收掉，用户会以为坏了（探针里有这条对照）；② **栈底也不再退 app**（下一轮按用户口径改的，见 23.4）—— 于是「以前一按就退」这件事整体没了，退 app 只剩系统那条默认路。**兜底层必须自己判「此刻该不该管」**：它不占栈位，没有入栈 / 出栈帮它收窄时机，而 CF 面板是**常驻挂载**的（`v-show` 保状态），所以那边一定得带 `props.active`，否则在代码页按返回会莫名其妙地翻 CF 的内部页面（同样有对照）。Esc 一行没改（仍是各浮层自己响应）；不新增任何 `cp.*` 键（`cpBackSentinel` 只活在 `history.state` 里，刷新后靠它判断「已经压过了」）。

67. **旧页面的「按需 chunk」会被 SW 换代回收：`new Worker` / 动态 `import()` 都可能 404，而 404 触发的 `onerror` 连 message 都是空的**（2026-10-30 加，用户报「codeforces 无法下载，显示 `Codeforces worker error`」；全貌与实测见第 24 节）。四条：
    - **症状长什么样**：界面只显示一句英文兜底文案（`cfClient` 的 `'Codeforces worker error'`），跟真实原因（文件 404）毫无关系。同类故障换到别的入口会换个长相：点「运行」没反应、题解不渲染 —— 根因都是「页面版本与当前部署不同步」。
    - **判据**：`worker.onerror` 里 **`event.message` 与 `event.filename` 同时为空 = 脚本根本没取到**（实测：请求一个不存在的 `/assets/cfWorker-*.js`，两者都是空串）。有 message 的才是 Worker 内部抛错，那种要原样显示，别一起吞。
    - **为什么会 404**：链条三步 —— ① `cfWorker` 是按需加载的、文件名带哈希；② SW 的 `pruneStaleShellArtifacts()` 按 `/retain-manifest.json`（**只列当前这一版**）把外壳桶里不在清单上的 `/assets/` 删掉；③ 停在旧页面的人点下载 → 桶里没了、服务器上也没了（Vercel 只留当次构建）→ 404。**任何新增的按需资源都天生带这个风险**，别以为只影响 CF。
    - **修法与两条纪律**：`cfClient` 在失败路径上 `fetch('/retain-manifest.json?v=' + Date.now())` 取当前清单里的 worker 顶上、把在途请求原样重投（`id` 不变），`rescueTried` 只试一次。纪律一：**清单请求必须带变化的 query**（它走 `cacheFirst`，不带差异会拿回上一版清单）；纪律二：**别在 `new Worker(new URL(...))` 附近另写裸 `new URL(...)`** —— 构建器会把同一份 worker 多打一个产物（实测多出 33KB 那份）。另：兜底成立的前提是**消息 type 只增不改**。

68. **「计分 / 不计分」不能靠认控件结构，也不能在没认出时替他按计分报下去**（2026-10-30 加，用户提「有些比赛是 Unrated allowed，想自己选报名哪种」）。五条：
    - **CF 的形态不统一**：同一个选项可能是 `participate as rated` 复选框（**不勾 = 不计分**，最常见的样式）、可能是 `Unrated allowed` 复选框（**勾上 = 不计分**，语义反着）、也可能是 Rated / Unrated 的单选组或下拉框。所以扩展侧 `applyRatingChoice()` 按 **name + value + aria-label + 包着它的 label + `label[for]` + 紧跟的纯文字** 拼成一段文字，认 `rated` / `unrated` 两个词，三种控件分别处理。**先认 `unrated` 再认 `rated`**（前者含后者）；`takePartAs` 那一组（个人 / 队伍）一律跳过。
    - **复选框的「设上了」与单选组不是一回事**：复选框两边都能表达（勾 = 自己那一边，不勾 = 另一边），所以只要认出它是计分相关的就算设上；单选组只有存在「要的那一边」那颗才算。**这一条不写清就会出现「明明不勾就是不计分，却报没有这个选项」**（本轮实测抓到过）。
    - **设不上就不提交**：用户选不计分、而表单里没有那颗控件 → 回 `unrated-unavailable`，**这次报名没有发生**，标签页也直接关掉（那是确定结论，不留现场）。替他按计分报下去是不可逆的错 —— 报名方式开赛后就改不了。
    - **能力位单列**：`contest-register-unrated`，站点拿到这一条才在确认卡片上摆「计分 / 不计分」。老扩展不认识 `unrated` 字段，会静默按计分提交 —— 不加能力位等于把这个选择吃掉。
    - **实测**（无头 Chrome 上跑真实源码里的 `applyRatingChoice`，探针 `/tmp/probe-unrated.mjs`，跑完即删）：五种形态逐个验过 —— `participate as rated` 复选框 → 不计分时 `checked=false`；`Unrated allowed` 复选框 → `checked=true`；单选组 → `UNRATED` 选中；下拉框 → 切到 Unrated 那一项；**只有个人 / 队伍那一组时两个方向都判「设不上」且一个控件都没动**。

69. **脚本 `focus()` 在触屏上会点亮 `:focus-visible`：组件菜单打开后第一格像「被按下」**（2026-10-31 加，用户报「安装为应用之后，在触屏设备上使用，组件的 codeforces 按钮是被按下的状态，但实际我没有按它」）。四条：
    - **症状**：触屏上点「组件」那颗按钮唤出菜单，**第一格**（装了两个组件时就是 Codeforces）当场带上一块蓝色底、文字转白，看着像处于选中 / 按下态；手指没落在它上面，点别处才恢复。桌面鼠标点开是干净的，所以只有触屏报障。
    - **真因**：`ComponentsMenu` 打开时把焦点送上第一项（`watch(ready)` → `.focus()`，为的是 Esc / Tab 立刻有着落）。这块高亮是**焦点**画的，不是悬停 —— 那一格的选中样式与悬停共用同一条规则（`.components-menu__item:focus-visible` 同样上 `--menu-hover-bg` + `--menu-hover-text`）。鼠标设备上点开时浏览器把「脚本聚焦」判成指针意图、`:focus-visible` 不成立；**触屏上却成立**，于是脚本聚焦被画成了「选中」。与坑 65 是两回事：那条是 `:hover` 粘住，这条是 `:focus-visible`，`is-hoverable` 闸门管不到。
    - **修法**：`ComponentsMenu` 的 `watch(ready)` 前面加 `if (!shown || isTouchPointer()) return`（`composables/useMobileKeyboard.js` 导出，与 `EditorPane` / `FileExplorer` 那几处「触屏上不许程序化抢焦点」同一条口径）。触屏上没有 Tab 要走，Esc 由 `usePopoverLayer` 在 window 捕获阶段处理、与焦点无关，所以只少了「打开即选中第一项」这一下。**别把这理解成删掉 `.focus()`**：鼠标设备上它照旧生效（键盘用户的 Tab 起点）。
    - **实测**（自起 dev server + 无头 Chrome，探针在 `/tmp/probe-focus/`，跑完即删）：手机口径 412×915（`isMobile` + CDP 触摸，`pointer: coarse`）改前第一格 `focusVisible=true`、背景 `rgb(4, 57, 94)`（= `--menu-hover-bg`）、文字 `rgb(255,255,255)`；改后 `focusVisible=false`、背景 `rgba(0,0,0,0)`、文字 `rgb(204,204,204)`。鼠标口径 1400×900 两组读数与改前一致（第一格仍拿到焦点，`focusVisible=false`、背景透明）。两种口径下 Esc 都照常关菜单。**判据留给后来人**：菜单里凡「打开即送焦点」的格子，选中态别写成 `:focus-visible` 与悬停共用一条 —— 要么像 `SettingsMenu` 那样给 `:focus-visible` 只留 `outline: none`，要么在触屏上不送焦点。

70. **`input[type=number]` 的固有宽度会悄悄撑大它的 flex 容器：难度那两个数字停在整块左端、看着「没有靠右」**（2026-10-31 加，用户报「难度的这两个分数，位置有问题没有靠右」）。四条：
    - **症状**：抽题面板「难度」那一行的 `2100 – 2200` 停在行的左三分之一处，与右端的折叠箭头之间空出两百多像素；聚焦时能看见那块淡底一直铺到箭头跟前，**数字却挤在它的左端**。其余三行（标签 / 数量 / 两个开关）都正常靠右。
    - **真因**：`.pk-range` 的宽度是 `flex: 0 1 auto`，即**内容撑出来的**；而它的内容里那两颗 `input[type=number]` 的**固有宽度约 164px**（`size` 默认 20 个字符）。只给了 `flex: 0 1 5ch` 时，「固有宽度要不要算进容器的 max-content」各引擎取值不同 —— 算进去的那一侧整块被撑到 355px，`margin-left: auto` 仍然把**整块的右缘**推到箭头上，于是 5ch 的两颗数字停在整块的左端。判据是「右缘对、内容不对」：这既不是 `margin` 丢了，也不是 `justify-content` 的问题。
    - **修法**：给 `.pk-range__input` 补一条显式 `width: 5ch`（`flex: 0 1 5ch` 保留，收缩兜底不变）。显式宽度让输入框对容器 max-content 的贡献变成确定的 5ch，两边引擎算出来的整块都是 102px。空态那两条（第一颗吃满右对齐、第二颗收成 0 宽）特异性更高，照旧生效。
    - **实测**（生产产物 `vite build --outDir /tmp` + `vite preview`，无头 Chrome 640×1000、dpr 2，探针在 `/tmp/probe-range/`，跑完即删）：本机 Chrome 上改前改后都是 102.5px / 右缘 558（对得齐，**所以本地复现不出来**，与坑 64 一样属「本地正常、某些设备坏」）；**反证**用 `.pk-range__input{flex:none}` 模拟「把固有宽度算进 max-content」那一侧引擎 —— 整块 355.2px、右缘仍 558、两颗数字挤在 202.8 起的左端，**画出来与用户截图一致**；补上 `width: 5ch` 后同一条件下回到 102.5px / 455.5–558，空态 87.3px / 470.8–558 也都靠右。`npm run verify` 基线不变（B/C/D/F 绿 + A/E/G/H 红）。

71. **Firefox 安卓「安装」窗口里按返回，先留一个深色空窗口、第二下才退出：那一发根本不进历史，页面拦不住**（2026-11-01 加，用户报「安装为应用之后……返回后，先是到一个完全是深色的一个页面，再次返回会直接退出」；根因、证据与结论见 §23.7）。三条：
    - **别把它当成「没武装」**：设置 › 应用显示「已安装」⇒ manifest 的 `display: standalone` 生效 ⇒ `isAppWindow()` 为真、哨兵已压（`history.length` 至少 2）。**所以不用去 `isAppWindow()` 里补档位、也不用去 `pushState` 时机上找问题** —— 浏览器侧给出了更硬的读数：`pagehide` 到了、`popstate` 没到（Bugzilla 2070832，`history.length=1 / state=null / standalone=true`）。
    - **Web 侧无解**：没有 backbutton 事件、也拦不住文档卸载。`pagehide` 里 `location.reload()` 是「按一次返回重启一次应用」，比空窗口更糟；空窗口的深色来自 manifest 的 `background_color`（`#1c1c1c`），不是站内画出来的东西。
    - **口径**：**已定，不改行为**（2026-11-01 用户口径「只记录，不改行为」）—— 不动代码、不动 manifest、不新增文案。Chrome 安卓同一套机制正常。**判据留给后来人**：凡「返回不按栈走」，先看这一发走的是 `popstate` 还是 `pagehide`。

## 6. 已持久化的状态（加设置项时照抄这套）

| key | 内容 | 位置 |
| --- | --- | --- |
| `App.vue`（`EDITOR_SETTINGS_KEY` / `readEditorSettings()` / `updateEditorSettings()`，约 38–112 行；定义在 `services/editorOptions.js`） | `cp.editorSettings` + `cp.editorSettingsVersion` | 编辑器偏好共 23 项（主题、字体族 / 字号 / 行高 / 连字、Tab 宽度 / 空格代替 Tab / 自动换行 / 换行列宽、光标样式 / 闪烁 / 平滑移动、当前行突出、空白字符、缩略图、括号对着色 / 缩进参考线 / 括号参考线、粘性滚动 / 滚过最后一行 / 平滑滚动、内边距、滚动条粗细）。**默认值、可选项表、逐键校验、偏好 → Monaco 选项的映射全部在 `src/services/editorOptions.js` 一处**，面板下拉、读盘校验、Monaco 吃到的选项三者共用，加新项只改这一个文件（面板加一行描述即可，见 `EditorSettingsPanel.vue` 的 `EDITOR_GROUPS`）。`Version` 只服务于一次性迁移（不是版本号体检，别指望它兜住所有旧值）：v3 之前是 Monaco 原生主题 id（`vs-dark` / `vs` / `hc-black`，原本选浅色 `vs` 的迁到浅色），v4（2026-09-29）起主题 id 去掉 `cph-` 前缀、旧存档的 `cph-light` 照样认；认不出的旧值一律交给白名单丢掉、回落到默认深色。**这个计数器做「一次性迁移」，每加一条迁移抬一次**：v4 及以前只有主题 id 换算；**v5 / v6（2026-10-11）新增第二条**——把存档里的 `renderLineHighlight: 'all'` 改写为 `'line'`（原因见第 4 节「光标所在行」，v6 是 v5 分两次编辑落地导致改写失效后的补救，见同处 ⚠️）。迄今两条，都只改各自那个键、都不参与其余键。**抬版本号必须和迁移分支在同一次编辑里落地** |
| `cp.panelVisible` / `cp.panelPosition`（**只有 `panelVisible` 还在 `App.vue`**；`panelPosition` 2026-10-11 起在 `services/shellSettings.js`，模块自己读写 localStorage，理由见第 5 节坑 36） | 统一侧边栏是否展开 / 侧边栏在左还是右（键名是历史沿革，语义已从「测试面板」扩到整栏）。换边统一走 `shellSettings.setPanelPosition()`，`flipPanelPosition()` 是它「目标 = 另一边」的简写（动画只有一份实现）。三处入口：设置面板「外观」的下拉、设置菜单里「侧边栏位置」那个二级子菜单（2026-10-11 从一级开关改来）、快捷键 `toggle-layout`。档位表 `PANEL_POSITIONS` 也在这里导出，面板与菜单共用同一份。**同一份体例下还有 `cp.narrowCollapseSide`**（2026-10-13 加：**窄屏**折叠后图标栏贴在**上边还是下边**，`top` / `bottom`，默认 `bottom`；档位表 `NARROW_COLLAPSE_SIDES`、写入走 `setNarrowCollapseSide()`）。它与 `panelPosition` **正交**：那个管左右（宽屏主轴方向）、这个管上下（窄屏主轴方向），四个组合都成立。两处入口：设置面板「外观」的下拉、设置菜单里「窄屏折叠方向」那个二级（**没有快捷键**）。宽屏改它空转（折叠后是 44px 竖条，没有上下之分），所以这两处入口**只在窄屏出现**（2026-10-13 用户要求：行上挂 `when: () => isNarrowLayout()`，见第 5 节坑 49；那一项最初是「两处都照常摆着」，当天改掉）—— 值本身照旧持久化、照旧在云端同步白名单里 |
| `cp.sidebarTab` | 侧边栏当前面板（`explorer` / `tests`），认不出来的值一律退回 `explorer`。**没有 `settings`**——设置页签刻意不落盘（见第 5 节坑 7） | `Sidebar.vue`（页头里的 `SidebarSwitcher` 只是消费方，经 provide 拿状态） |
| `cp.editorShare`（`App.vue:35`） | 两栏比例（%） |
| `cp.timeLimitMs`（`App.vue:40`） | 全局时限（毫秒，只计运行段）。**它只是「题目没带时限时的默认值」**：活跃文件的 `meta.timeLimit` 非 0 时优先用它（`App.vue` 的 `effectiveTimeLimitMs`）。默认 **2000ms**（2026-10-25 从 1000 上调，常量是 `runner.js` 的 `TIME_LIMIT_DEFAULT_MS`，可选项 `1/2/5/10 s`）。**注意 `usePersistentRef` 挂载时就写一次**，所以老浏览器里都躺着一条显式 `1000` —— 只改常量等于没改，`services/storageMigration.js` 的 `bumpTimeLimitDefault()` 负责一次性顶到 2000（只认恰好 1000 的，手选过 2/5/10 s 的不动），标记键 `cp.timeLimitDefault2s` |
| `cp.uiScale`（2026-10-11 起在 `services/shellSettings.js`，模块自己读写 localStorage，理由见第 5 节坑 36） | 全局界面缩放比例，默认 `DEFAULT_UI_SCALE = 1`（100%；2026-10-01 由 1.1 改来，同时去掉了默认档那枚「（默认）」后缀，档位显示只剩百分比），只认四档 `1` / `1.1` / `1.25` / `1.5`（认不出来退回默认档）。读盘经 `normalizeUiScale()` 校验；`applyUiScale()` 把它写成 `document.documentElement.style.fontSize`（`16 × scale` px），并在 **setup 期**就落地（早于首帧，不会先按 100% 画一帧再跳）。档位表与 `px()` 都在 `composables/useUiScale.js`；设置页「外观」组的「界面缩放」下拉是它的消费方（prop / emit 贯穿 `App → EditorPane → EditorSettingsPanel`）。见第 5 节坑 24 |
| `cp.selectedNode` | 文件树里**主选中**的那一行（文件 / 目录的节点 id）；`null` = **选中根**（整棵树都不高亮，页头「新建文件 / 文件夹」落在根）。多选（2026-10-12 加）之后它兼任 **Shift 区间选择的锚点**；高亮本身看的是内存态 `workspace.selectedIds`（**刻意不落盘** —— 与 VS Code 一致，跨会话只恢复主选中那一个）。恢复放在 `initWorkspaceStore()` 最后一步、节点消失时由 `rebuildTree()` 从选区里摘掉再顺位回落。**刻意不进云同步白名单**——存的是本机 VFS 节点 uuid，同步到别的设备只会指向不存在的节点。 | `services/vfs/workspaceStore.js`（`SELECTED_KEY` / `selectNode()` / `applySelection()`） |
| `cp.uiLocale` | 界面语言，取值 `zh-CN` / `en`（`i18n/index.js` 的 `LOCALE_STORAGE_KEY`，**权威定义在那一处**）。**刻意不走 `usePersistentRef`**：界面语言必须在任何组件挂载之前定下来（首帧不能先闪中文再跳成英文），所以 `i18n/index.js` 自己同步读写 localStorage。**没有存档时跟随浏览器**（`navigator.languages` 任一命中 `/^zh\b/i` → `zh-CN`，否则 `en`）——注意「跟随探测」的结果**不写回存档**，「跟随浏览器的默认」与「用户显式选过」是两件事，别在首帧替用户落一个值。设置页「外观」组的「界面语言」下拉是唯一写入方，切了当场生效、不重载 | `src/i18n/index.js`（消费方散布在全仓，读的是 `locale` 这个 ref） |
| `cph.drafts`（**只读的老键**：仅由 `vfs/migrate.js` 建工作区时搬进 `/main.cpp`、`/main.py`，应用其余部分一概不读写）/ `cp.testCases` / `cp.engine` / `cp.judgeBases`（`App.vue:36-37` 与用例段） | 各语言草稿、用例、引擎、服务地址 |
| `cp.cloudAccount` / `cp.cloudToken`（键名常量 `CLOUD_ACCOUNT_KEY` / `CLOUD_TOKEN_KEY` 在 `services/storageNames.js` 是唯一出处；2026-10-11 起读写都在 `services/cloudSession.js`，**不用 `usePersistentRef`**，理由见第 5 节坑 36） | 绑定的云端账号 `{ handle, updatedAt }`（handle 空串 = 未绑定）与设备令牌（验证成功后服务端签发，之后写入不必再取码）。两个键**只留在本机**、且**绝不进云同步白名单**：账号是「这台设备认领了谁」（换台设备要重新验证），令牌与 handle 一对一，同步过去等于把写入权搬走 | `services/cloudSession.js`（**面板与齿轮菜单共用同一份**，别在组件里再 `usePersistentRef` 一份） |
| `cp.installGuides`（2026-10-12 加） | 「安装引导」那一组通知**已经自动弹过**的 id 数组（`['app-install','app-manual','ext-install','ext-update']` 的子集）。四条各记各的：见过「可以装应用」不等于见过「插件有新版」，状态变了仍会再提示一次；**手动触发（设置里那颗「安装引导」）不看它** —— 那是用户点名要看。**刻意不进云同步白名单**：它是「**这台设备**已经被告知过什么」，同步过去等于让另一台从没弹过的设备也永远不弹。 | `services/installGuides.js`（`SHOWN_KEY`，模块自己读写 localStorage；引导本身见 13.8） |
| `cp.flashNotice`（2026-10-12 加，**存 sessionStorage** —— 全站唯一的 sessionStorage 用途） | 「刷新前寄下的那条通知」：`{ type, title, message, duration }`。云端导入 / 登录成功都是**办完整页刷新**的（见 `cloudSession.adoptCloud`），可通知只活在内存里，刷新前发出去等于没发 —— 于是先寄存在这里，由下次启动的 `flushFlashNotification()`（`App.vue` 的 `onMounted` 第一行）补发并**立即删除**。用 sessionStorage 而不是 localStorage 是刻意的：它只该跨过这一次同页签刷新，随页签关掉一起消失；换 localStorage 会让用户下次开站时忽然弹出一条三天前的「导入成功」。**不进云同步白名单**（一次性的界面状态），也**不存 `actions` / `tag`**（回调函数过不了 JSON）。 | `services/notifications.js`（`notifyAfterReload` / `flushFlashNotification`；键名 `FLASH_NOTICE_KEY` 在 `services/storageNames.js`；用法与纪律见 13.9） |
| ~~`cph.language`~~ | **已作废**（2026-09 顶栏语言下拉移除后成为死键，全仓不再读写）；残留在 localStorage 里无害。判题语言现在一律由活跃文件的扩展名派生，见第 5 节坑 15 | — |
| `cph.mobileKeyboard` / `cph.mobileInputDock` | 都已作废（两个版本的键盘适配都不再持久化）；残留在 localStorage 里无害 | `composables/useMobileKeyboard.js` |
| `cp.localRuntime.clangReady` / `cp.localRuntime.pythonReady` | C++ / Python 本地运行时是否已拉取。**只作首帧播种，不是权威判据**：权威判据是 `wasmRuntime.probeRuntime()`（内存已加载 → SW Cache Storage → HTTP 缓存 `only-if-cached` 探针，全程不触网）；**探的时机只有一个**——`EditorSettingsPanel` 的 `watch(() => props.active)` 在切到设置视图时调一次 `reconcile()`（页面加载、任务状态推进时都**不**探：`only-if-cached` 未命中会在控制台记一条 `ERR_CACHE_MISS`，页面一加载就探等于白刷一屏红字）。标记过期（缓存被清）或缺失（直接跑代码落了缓存）都会在那一刻被正回来 | `EditorSettingsPanel.vue`（本地运行环境分组；下载走 `wasmRuntime.preload(language)`） |
| `cp.localRuntime.markdownReady` | **题解渲染器**（katex + marked）是否已拉取。与上面两条同一个键前缀、同一套「首帧播种 + 探针校正」的口径（权威判据是 `probeMdRuntime()` 的 Cache Storage 探针）。它在**设置面板那一行**与**预览面板的「下载渲染器」**之间共用，否则从预览下的那一次，下次打开设置会先闪一下「未下载」 | `services/mdRuntime.js`（`MD_READY_FLAG_KEY`） |
| `cp.mdView` | 题解的**视图模式**：`{ mode, fullscreen }`（`edit` / `split` / `preview` + 是否全屏）。**刻意不走 `usePersistentRef`**：App 在 setup 期（首帧之前）就得知道该不该把侧栏收起来。旧存档是一个字符串（`'fullscreen'` 等），读盘时换算，认不出来一律回默认 `edit` | `services/mdView.js`（**不是**组件；模块级单例体例与 `editorViews.js` 一致——原 `settingsTab.js` 已并入它，区别是这份要跨会话记住） |
| `cp.pchUnsupported` | 本机被判定扛不住 PCH（生成时 OOM / cc1 卡死，或 PCH 加载校验失败）后写下的开关；值等于当前 `PCH_CACHE_VERSION`（`v6` 这种形态）时不再生成、编译也不再挂 PCH。**值带版本号**：换代或改生成参数后旧标记自动失效、重试一次（裸 `'true'` 是 v5 及更早的写法，现在认作过期） | `runnoSandbox.js` |
| `cp.shortcuts` | 全局快捷键：动作 id → 组合键串（`{"run":"Mod+Enter", …}`，内部写法见第 5 节坑 22）。另有一次性迁移标记 `cp.shortcuts.mac-enter`（2026-10-20：mac 上重命名默认 F2 → Enter 的那次迁移，见第 13.4 节；先落盘再打标记，之后用户显式绑回 F2 不再被覆盖）。**刻意不走 `usePersistentRef`**——那个 composable 靠 `onMounted` 播种首次写入、必须挂在组件上，而这份状态要在任何组件挂载之前就能被读到（App 的全局 keydown 与 EditorPane 的状态栏提示都要用），所以 `useShortcutManager.js` 里直接读写 localStorage。读盘以默认值打底再套已存键：以后新增动作时老用户自动拿到它的默认键，已删动作与手改坏的值自然丢掉 | `composables/useShortcutManager.js` |
| `cp.fileTemplates` | 模板功能的**用户覆盖表**：`{ [语言]: 文本 }`，只存改过的语言（`''` 是合法覆盖 ＝ 新建时留空）。内置三份在 `services/templates.js` 的 `BUILTIN_TEMPLATES`（cpp / python / markdown），取用户值一律 `overrides[id] ?? builtin`、判型一律 `typeof === 'string'`，**绝不能用 `||`**（空串会被当成「没改」）。**刻意不走 `usePersistentRef`**——要在任何组件挂载之前被读到（新建文件时取模板），所以 `services/fileTemplates.js` 自己读写 localStorage，并在**模块加载时先 persist 一次**让键恒存（空表 `{}`）：`applyProfile` 只写云端存在的键，键缺席就会让「下载干净配置」清不掉别机的自定义。**在白名单里**（跟人走） | `services/fileTemplates.js`（`FILE_TEMPLATES_KEY` / `templateForPath`） |
| `cp.fileTemplates.enabled` | 模板功能的**总开关**（`'1'` / `'0'`，默认开）。与覆盖表**刻意分成两个键**：覆盖表是「内容」、开关是「偏好」，合成一个键就会逼出「关掉时得清空覆盖」这种毁用户东西的做法。读盘只认显式的 `'0'` 为关（缺省 / 存档损坏 / 隐私模式一律按开），同样**模块加载即落盘**让键恒存，理由与上一行一致。闸门只设在 `templateForPath()` 一处（新建文件与抓题都走它）。**在白名单里** | `services/fileTemplates.js`（`FILE_TEMPLATES_ENABLED_KEY` / `setTemplatesEnabled` / `templatesEnabled`） |
| `cp.countdown`（2026-10-20 加） | 悬浮倒计时卡的**整份现场**：`{ open, locked, phase, endAt, totalMs, pausedRemain, withHours, form: { h, m, s }, x, y, w, h }`。三条口径：① 时间只存 `endAt` 时间戳与 `pausedRemain`，**不存累加秒数**（后台被降频也不会走慢）；② `x/y/w/h` 是**设计 px**（100% 缩放下的值），渲染处过 `px()`，拖拽时物理位移除以当前倍数再落盘；`x/y = null` 表示「还没摆过」，首次打开落右下角；③ 读盘时把越界 / 认不出的值逐项收回（`phase` 白名单、`totalMs` ≤ 99h、`pausedRemain` 夹在总时长内、过了点的 `running` 直接转 `done`）。**这份状态桶刻意不进云同步白名单**：窗口摆哪、屏幕多大是**这台设备**的事实（2026-10-25 起「要不要自动装」那条偏好另立一个键 `cp.countdown.autoInstall`，那个进白名单，见下一行）。**也刻意不用 `usePersistentRef`**：卡要在首帧就恢复上次的显隐与位置（见本节末尾那条「必须早于组件挂载」） | `services/countdown.js`（`COUNTDOWN_KEY` 在 `services/storageNames.js`；体例、几何与交互见第 16 节） |
| `cp.cfPicker.autoInstall` / `cp.countdown.autoInstall`（2026-10-25 并列记在这里；后者这一天新加，前者一直在用、只是漏记） | 两个组件的**「默认安装」偏好**（JSON bool，缺省 / 坏值一律按 `true`）。与上面那些 `*Ready` / `installed` 的事实键严格分开：事实键说的是「**这台设备**此刻有没有」，所以不进白名单；这两条说的是「要不要自动装」，跟人走，**在 `cloudProfile.js` 的同步白名单里**。键名常量各自定义在 `cfRuntime.js`（`CF_AUTO_INSTALL_KEY`）与 `countdown.js`（`COUNTDOWN_AUTO_INSTALL_KEY`），设置面板只 import 常量、不写字面量。两条的配套动作一致：打开时若本机没装就补装；设置里卸载时把开关一并关掉（否则下次启动又装回来，那次卸载等于没卸） | `services/cfRuntime.js` / `services/countdown.js`（写入方是设置面板的 `cfAutoInstall` / `countdownAutoInstall`；启动读取在 `main.js`） |
| `cp.cloudActive`（2026-10-10 加） | **本机现在跟着谁的云端配置**：`{ handle, updatedAt }`，`updatedAt` 是**已套用过的那一版**云端的更新时间（空串 = 不知道，于是下次打开一定会对齐一次）。启动时地址里没有 `/<handle>` 就用它去对齐那一份 —— 这就是「下次打开网站直接用它那一套」。写入点：四条认下 handle 的入口（导入 / 上传 / 登录 / 下载到本机，与 `writeCloudEntryPath` 同四处；上传两处直接调 `writeActiveProfile`、其余走 `adoptCloudProfile`）+ **解绑时删掉它**（`forgetActiveProfile`：留着的话下次打开站点会把刚解绑那位的配置又套回来）。**门闩就是 `updatedAt`**：与云端相同则一个字节都不写 —— 拆掉它等于「每次打开都覆盖本机 + 套用→刷新→又套用」的死循环（那次 reload 是无条件的），改这里前先读 `cloudEntry.js` 的 `applyCloudProfile`。**刻意不进云同步白名单**：它是「**这台设备**在跟谁」的事实，同步过去等于让另一台设备自动套用一份它从没认领过的配置。**顺带把地址栏补成 `/<handle>`（2026-10-10 加）**：启动对齐时若当前是网页版的站点根路径、且云端确实有这份配置，地址就写成 `/<handle>`（此后可收藏 / 可分享）——两道闸门见 `cloudEntry.js` 的文件头，壳端与静态页都不能写 | `services/cloudEntry.js`（`readActiveProfile` / `writeActiveProfile` / `forgetActiveProfile`；键名定义在 `services/storageNames.js` 的 `CLOUD_ACTIVE_KEY`） |
| `cp.cf.*`（抽题面板 / 比赛的**表单偏好**，共 8 键；唯一出处是 `useCfPicker.js` 与 `useCfContest.js` 顶部的 `KEY`） | `ratingMin` / `ratingMax` / `tags` / `count` / `preferNew` / `excludeSolved` / `handle`（抽题表单）+ `contestSpec`（**比赛链接或裸 ID 的原始输入串**，刷新与换会话都回填上次查的那场）。`contestOpen`（比赛区块是否展开）2026-10-19 晚随比赛拆出独立组件而**废除**——看板自成页签，没有折叠态了。三条口径：① 它们只是「上次填了什么」，**不参与任何判据**；② `contestSpec` 存的是**原始串而不是解析后的 spec** —— 解析永远走 `parseContestSpec`，存解析结果会把 `kind` 判据（如裸 ID 的 gym 分界）钉死在写盘那一刻；③ 与设置页的 `cp.cfPicker.ready` 同前缀但不是一回事（后者是组件安装标记） | `composables/useCfPicker.js` / `composables/useCfContest.js` |

另外 PCH 二进制（约 8.6MB，v3 起；v2 的微型版是 6.9MB）存 IndexedDB 而不是 localStorage：库名 `cp-pch`（2026-10-01 从 `cph-pch` 改名；`pchStore.js` 打开库时会把旧库静默删掉——PCH 是缓存，下次编译自己会重建）、store 名 `pch`，记录形状 `{ id, bytes: Uint8Array, size, createdAt }`；`id = 存档版本:工具链版本:PCH 源码内容的 FNV-1a 哈希`（当前是 `3:8.0.1:b4c5185a`），三者任一变化旧存档自然失效，取存档只按这个 id。

工作区文件树也存在 IndexedDB（不是 localStorage）：库名 `cp-vfs`（2026-10-01 从 `cph-vfs` 改名，旧库由 `LocalVFSProvider` 的 `migrateLegacyDb()` 一次性搬运：只在新库 `nodes` 表确实为空时把旧库整条搬过来，读失败就保留旧库下次再试）、两个 store `nodes` / `contents`（`LocalVFSProvider`），`nodes` 里就是整条 `VFSNode` 记录（`id / name / type / path / parentId / createdAt / updatedAt`），2026-09 给文件节点加了可选的 `meta`（题目链接 / OJ / 难度 / 日期 / 时限，见第 5 节坑 17），2026-10-01 又加了 `config`（抓题结果原文：`tests` 样例、`oj`、原始 `timeLimit` 等）。**两个都是记录里的可选字段，不是新 store、也不动 `DB_VERSION`**——旧记录没有就按「没有」处理，纯向后兼容。

导入的题目与用户自己建的文件**共用同一套存储**：题目信息与样例直接挂在代码文件节点上（`meta` / `config`），代码文件也只是一条普通记录，没有「题目专用表」这种东西。所以题目目录的搬移 / 重命名 / 删除走的都是既有路径，不需要为扩展另写存储。

写值统一走 `usePersistentRef(key, defaultValue)`；`editorSettings` 因为要版本迁移，单独用 deep watch 存。加编辑器设置项时**必须**两道校验都过：读盘（`readEditorSettings()`）与面板回写（`updateEditorSettings()`）都逐键走 `editorOptions.js` 的 `normalizeEditorSetting()`，不在默认值表里的键直接丢弃、越界数字退回默认——所以 localStorage 里手改出来的 `fontSize: 999`、认不出的 `cursorStyle`、乃至早已移除的旧键都不会漏进编辑器。

**唯一不落站点 localStorage 的「设置项」是扩展的投递目标两个开关**（设置 → 浏览器插件）：真值存在扩展自己的 `chrome.storage.local` 里，站点这边只有一份内存镜像（`useCompanionBridge` 的 `extensionInfo.config`，随 `cp-ping` 握手刷新）。所以别按上面这套给它加 localStorage 存档——那样会出现「站点存档说开、扩展实际关」的两份真相。

**「必须早于组件挂载就能读到」的状态现在有三处先例，加第四处前先想清楚**：`cp.shortcuts`（App 的全局 keydown 与状态栏提示都要用）、`cp.uiLocale`（首帧的语言）与 `cp.countdown`（2026-10-20 加：卡要在首帧就恢复上次的显隐 / 位置，不能先画成关闭再弹出来）。这三处的做法一致——**绕开 `usePersistentRef`，在模块里直接读写 localStorage**，因为那个 composable 的读写时机挂在组件生命周期上。代价是「读盘校验 / 默认值打底」得自己写（`useShortcutManager.js` 是「默认值打底再套已存键」，`i18n/index.js` 是「`isLocale()` 白名单 + 探测兜底」，`countdown.js` 是逐字段 `clamp` + `phase` 白名单），三处都别省。

## 7. 现在的功能边界（写文案时别夸大）

- 引擎：**本地 WASM 沙箱（默认，`DEFAULT_ENGINE_ID = wasmEngine.id`，新访客打开就能跑，不需要外部服务）** / Piston / Judge0 / 自检（不执行代码，只回显标准输入，用来联调界面）。本地沙箱支持 **C++ 与 Python**，首次运行要下载工具链（`public/wasm/8.0.1/` 自托管的 clang + wasm-ld + sysroot，裸文件约 52MB、由 Vercel 边缘压缩传输，之后工具链常驻 HTTP 缓存）。下载**只有一个入口**：设置 → 应用 › 本地运行环境（C++ / Python 两行同一套数据驱动渲染，下载中另一行按钮自动禁用；状态在 `EditorSettingsPanel.vue` 里，直接调 `wasmRuntime.preload(language)`）。编译产物缓存只留最近一份，**键为源码原文 + 内存上限**（口径见下文 `compileCache` 那条，上限烙进 `--max-memory`、改上限必须重链接），所以成批跑用例时只有第一个用例付编译开销。
- **本地沙箱的 Python（2026-09 加）**：走 CPython 3.11.3 的 wasm32-wasi 构建（`public/wasm/python-3.11.3/`，约 24MB，来源与 C++ 工具链一致，都取自 `taybenlor/runno` 的 `langs/`）。没有编译段：`runPython()` 直接把整棵 VFS 拍成 fs、以 `args: ['python', 入口文件]` 拉起解释器，多文件 `import` 靠 `sys.path[0] = '/'` 找到同目录的模块。标准库打包在 `/usr/local/lib/python311.zip`（zipimport），`sys.prefix` 编译期写死为 `/usr/local`，所以 **env 必须留空**（不要自作聪明加 `PYTHONHOME`）。语言路由在 `wasmRuntime.runCase()`：`language === 'python'` 走解释分支，其余原样走 C++ 分支；`entryPath` 由 App 从当前激活文件传下来。Python 与 C++ 互不影响，改一边不用管另一边。
- Vim 键位已移除（与 Monaco 0.56 不兼容），别再被试着重加。
- TLE：时限在**设置视图「评测」组里的「运行时限」**（1/2/5/10 s，默认 1 s；2026-09-29 从面板页头搬进这里），只计**程序运行段**，不含编译；超时靠 `kill()` 当前 WASI 实例实现。卡片上的耗时**同样是运行段**（与时限同口径），程序没跑起来时（编译失败 / 编译错误）卡片不显示耗时。Python 没有编译段，它的「运行段」包含解释器冷启动（实测约 190ms），因此 `wasmRuntime.js` 给 Python 的 run 时限额外加 `PYTHON_STARTUP_ALLOWANCE_MS = 500` 余量——不加的话 1s 时限会被启动开销吃掉一大截，跑得再快的程序也可能被判 TLE。代价是 TLE 最多晚 0.5s 报出来。
- **MLE（2026-10-12 加）**：内存上限在**设置视图「评测」组里的「内存上限」**（64/128/256/512/1024 MB，默认 256 MB，`cp.memoryLimitBytes`，随云同步走）。管线与 timeLimitMs 同构：`runner.js` 导出 `MEMORY_LIMIT_OPTIONS`，`evaluateCase` 传 `memoryLimitBytes` 给引擎，**引擎自己决定怎么兑现**——wasm 沙箱在链接期给产物加 `--max-memory=<字节>`（`runnoSandbox.linkerArgs()`；**必须写成单 token `--max-memory=<值>`**，lld 不收空格分隔，verify 抓过），Judge0 透传 `memory_limit`（KB）；Piston / native 不支持、直接忽略（文案已写明「wasm 沙箱与 Judge0 支持」）。判 MLE 的口径在 `engines/wasm.js`：**开了上限 + 退出码 134 + stderr 全空** → `outcome 'mle'`；`runner.js` 把它翻成 `MLE` 徽标（detail 走 `tests.outcome.memoryExceeded`）。实测过的边界（改判据前先看）：真实程序触碰超限地址 → OOB trap → 134 ✓；用户自己 `abort()` 也是 134 + 空 stderr → 会误判成 MLE；**常量下标 / 从不读写的分配会被 -O2 的死存储消除 + store-to-load 转发「假成功」**（libc++abi 的 unreachable 语义吞掉分配失败分支），只有运行期下标的循环才必 trap——真实竞赛程序都会落进 MLE，纯分配不碰的退化程序判 AC（真实 OJ 的 RSS 口径下也不算超内存）；C 程序检查 malloc 返回 0 后自行退出 → 判 RE。**compileCache 的键含内存上限**（上限烙进产物，改上限必须重链接）。**题目自带限制优先**（2026-10-12 加）：扩展抓来的题在 `node.config.memoryLimit`（单位 MB，CC-for-Web 的 Task 契约，个别 parser 硬编码的值是该 OJ 真实限制照用），`App.vue` 的 `effectiveMemoryLimitBytes` 把它换算成字节优先用，`cp.memoryLimitBytes` 只是没抓到时的默认值——与 `effectiveTimeLimitMs` 读 `meta.timeLimit` 完全同构；注意 memoryLimit 留在 config 不进 meta（meta 是弹窗整体替换的，见 problemImport 的注释）。Python（wasm）没有链接期、做不了超限即杀，本版不支持 MLE；精确读峰值内存（worker 注入记 grow）留作二期。
- **RE 在本地沙箱的真实覆盖面（2026-10-12 探针全表，早前「只有野指针一类判不出」的说法已被推翻）**：wasm 语义 + -O2 让「常见 RE」大多**不落 RE**。能判对的只有两类——显式非零退出（`exit(1)` / main 返回非 0）和 assert 失败（134 + stderr 带断言文本，`wasm.js` 因 stderr 非空走 runtime-error）。其余形态逐个实测散落如下：
  - **除零不崩**：这条工具链（clang 8 wasm32-wasi，-O2）的整数除法不 trap——运行期除数为 0（从 stdin 读入、排除常量转发）实测输出 0、正常退出 0 → 判 **WA**；
  - **无限递归**：尾递归 / 可累加器变换的形态被 LLVM 变成死循环（实测 `f(n+1)+1` 跑出 2³⁰−1 正常返回）→ 判 **TLE**；
  - **真栈溢出**（每帧 64KB 局部数组、递归返回后仍读它，变换消不掉）：worker 级崩溃 → `type 'failure'` → 现行分流判 **ERR「服务不可达」**（`wasm.js` 的 failure 分支只认 `stage === 'compile'`，运行期 failure 一律落 unreachable）；
  - **abort() / throw 类**（`vector::at` 越界 → terminate）：134 + 空 stderr → 被 MLE 判据接走，判 **MLE**（已知误判边界）；
  - **野指针 / 小幅越界**：wasm 线性内存偏移 0 合法可读、越界不出上限不 trap → 读垃圾值正常退出 → **WA**（原理见上一版结论：trap 从根上不会发生）。
  结论：本地 wasm 的 RE 只有「非零退出」一族可靠；要 SIGSEGV / 除零语义的 RE 只有 native 进程（judge0 一类远端）能给。**栈溢出落 ERR 的粗糙点已修（2026-10-12）**：`wasmRuntime.js` 的 failure 现按 `entry.stage` 分流——运行段异常标 `'run'`（`engines/wasm.js` 判 RE，stderr 透传 worker 消息当 detail），prepare/compile 段仍标 `'infra'` 走「服务不可达」。
- **`long double` 的能力边界（2026-10-24 实测，23 段程序真跑）**：上游 musl 把 long double 的格式化 / 扫描编成了 abort，所以过去凡是走 stdio 的 `long double` 都会**响亮地崩**（134 + 那句「Support for formatting long double values is currently disabled」）。现在 `LINKER_ARGS` 里把 `libc-printscan-long-double` 排在 `-lc` **之前**（wasm-ld LLVM 8 不认 `--start-group`，只能靠归档先后），于是 **`printf` / `scanf` / `sprintf` / `sscanf` / `strtold` 与 `cin >> long double` 全部正确**（`%.20Lf` 给 `3.14159265358979000000`），`put_money` 也跟着活了过来（它内部要格式化一个 long double）。**但 `cout << long double` 仍是错的**（实测 `2.5L` 打出 `2.98619e-4947`、`fixed` 下打 `0.000000`）：那条路走的是 `libc++.a` 里**预编译**的 `num_put::do_put(long double)`，它交给 `snprintf` 的格式串不带 `L`，改不动（要换 libc++ 或改二进制）。也就是说这一族从「响亮地崩」变成了「安静地错」——**给用户写题解 / 提示时按「`long double` 请用 `printf` 输出」这条口径**。同批实测的其它边界：`chrono::steady_clock` 曾**只有 1ms 粒度、而且其实是墙上时钟**（2026-10-24 复核：早前「差值恒 0」的说法是错的，那只是被测工作量不足 1ms）—— **同日已由下一颗时钟补丁修好**；`try` / `throw`、`std::regex`、`to_chars` / `from_chars`、`std::complex`、`std::thread` / `this_thread`、`random_device`、`filesystem::current_path` **全是编译错误**（`__config` 里自带 `#define _LIBCPP_CXX03_LANG`，且异常没开 —— 与前面「沙箱刻意没开 `-fno-exceptions`」那句对照，实测异常确实关着）；`wcout` / `wcin` / `wprintf`、`__int128`（含转 `long long` 后输出）、`%a`、`powl` 正常。链接期改动**不进 `FRONTEND_ARGS`**，所以 PCH 签名不受影响、不需要重生成。
- **沙箱时钟（2026-10-24 修，`scripts/patch-wasi-clock.mjs`）**：`@runno/wasi` 0.10.0（已是最新版）的 `clock_time_get` 四种 clock id 一律回 `new Date()`（毫秒级**墙上**钟）、`clock_res_get` 一律回 1e6 ns，于是 `chrono::steady_clock` 只有 1ms 粒度且跟着系统时钟跳（`CLOCK_REALTIME` 与 `CLOCK_MONOTONIC` 读出同一个 `tv_sec`）。补丁在装完依赖后把 `node_modules/@runno/wasi/dist/main.js` 里那**两处实现整段替换**：REALTIME = `Date.now()`（口径没动），MONOTONIC 与两个 CPU 时钟 = `performance.timeOrigin + performance.now()`，`clock_getres` 相应报 1ms / 1µs。四条不可略的实现口径：① **只能改源码** —— 真正跑用户程序的是 `dist/main.js` 里**内联的那份 worker 源码**（单引号转义字符串 + `new Blob`）：`WASIWorkerHost` 的 context 选项碰不到 WASI 方法、`debug` 钩子原样返回 errno、Blob 在模块加载时就造好（运行时换 `URL.createObjectURL` 来不及），而实例化走 `this.clock_time_get.bind(this)`，所以**事后覆盖 prototype 无效**（那是第一版写法，已弃）；② **必须连带删 `node_modules/.vite/deps`** —— Vite 预打包的缓存键是 lockfile + 配置哈希，**不含 node_modules 里的文件内容**，只改源码的话 dev 照旧跑旧那份；`vite build` 走 Rollup 直读源码，不受这一步影响；③ 单调钟把「取整毫秒的 `timeOrigin`」与「换纳秒的 `now()`」**分开算再相加**，直接把两个数量级差很多的浮点数相加会掉进 ~0.5µs 的量化台阶；④ 锚点对不上就非零退出、绝不静默放过（上游一改形状必须当场响），`npm run wasi:clock-check` 是给 CI 用的那一份，`predev` / `prebuild` 都挂了幂等的 `wasi:clock-patch`。实测（dev + 真工具链，18/18 绿）：`clock_getres(MONOTONIC)=1000`、`(REALTIME)=1000000`；同一毫秒内 `MONO` 带出亚毫秒位（`…965000`）而 `RT` 恒 `…000000`；6 段 2M 次累加的 `steady_clock` 微秒读数 mod 1000 = `605/850/720/655/710/760`（**改前恒 0**）；Python 侧 `time.perf_counter_ns()` 同步拿到亚毫秒（`delta` 的 mod 1e6 = 770000），`time_ns()` 仍毫秒对齐。**有效粒度是 5µs 而非 1µs** —— 相邻两次 `now()` 的差实测 0 或 5，那是跨域隔离（`vite.config.js` 的 COOP/COEP）下 `performance.now()` 的量化台阶，`clock_getres` 报 1µs 属于「不比真实情况差」（真 Linux 报 1ns）。CPU 时钟浏览器给不了真 CPU 时间，退化到单调钟是各家浏览器 WASI 运行时的通行做法。同一批复测：`npm run verify` 基线不变（A/E/G/H 红、B/C/D/F 绿），`-w`、MLE 判据、long double stdio 三条没被带坏。
- **耗时口径（2026-09 改过，别改回去）**：卡片数字 = `runCpp` 里只包住 `runWasi` 的那一段（Python 同理，是 `runPython` 里只包住 `runWasi` 的那一段），编译时间不计入。原先取的是 `runCase()` 入口到结束的墙钟，于是第一个用例含编译、命中编译缓存的后续用例只含运行，**同一份代码下第一个卡片能比其余大好几倍**（修前 3 个用例是「数百 ms + 9ms + 12ms」，修后 10/11/7ms），很容易被误读成「程序在第一个用例上特别慢」。面板页头那个 `elapsed` 现在也是同一口径：取当轮所有卡片耗时的**最大值**（`App.vue` 里是 computed，单独跑一个用例也会跟着更新），标题写明「最慢用例耗时」。TLE 消息里的 `durationMs` 与卡片同口径（`wasmRuntime.js` 在进入 `run` 段时重置 `stageStartedAt`）。
- 判定词表：引擎 outcome 是 `ok / compile-error / runtime-error / timeout / mle / unreachable / cancelled`（见 `src/services/runner.js`、`src/services/engines/index.js`）；`runner.js` 再把它翻译成卡片徽标上的 **verdict 判定码**：`ok` + 比对一致 → `AC`，`ok` + 不一致 → `WA`，`compile-error` → `CE`，`timeout` → `TLE`，`mle` → `MLE`，`runtime-error` → `RE`，`unreachable` 等基础设施失败 → `ERR`。徽标颜色仍按 `status`（passed 绿 / failed 红 / error 琥珀，MLE 落在 error 琥珀档，无新颜色变量）。`compare.js` 只返回布尔，**不再**产出「输出多 N 行 / 第 N 行不匹配」这类 hint 文案（2026-09-18 起，卡片头部不再显示它）。
- 判题流程：先编译运行出实际输出，再与期望输出比对（`src/services/compare.js`）。
- **编译只报错、不报警告：走编译参数 `-w`（2026-10-18 加）**：网页沙箱把它放进 `runnoSandbox.js` 的 `FRONTEND_ARGS`，桌面壳在 `native.rs` 的编译命令里加同一条 —— **两处必须一起动**（这组参数是跨端契约，见 §14 与 14.B）。之所以放进那份**公共**参数而不是只给用户代码那条加：`-w` 属于语言选项、会写进 PCH 签名，PCH 生成与用户编译不一致时 clang 会直接拒载；`PCH_CACHE_VERSION` 同时 1 → 2，老存档自然取不到（否则每次都得先走一趟「加载失败 → 判废重编」）。只压诊断、不动语义：`-std=c++17 -O2` 与产物不变，CE 的 `detail` 仍原样透传编译器 stderr（现在里面只剩错误与错误自己的 `note:`），RE / TLE / MLE 的 `detail` 是**程序自己**的 stderr、完全不受影响。两条边界：远端引擎（Piston / Judge0）的编译参数不在我们手里，它们的 CE 详情里仍可能出现警告；Python 侧的警告是解释器打到程序 stderr 上的，属于程序输出，也不归这条管。
- **样例可以很大，但「能跑多大」有两个上限**（2026-09-29 实测）：本地沙箱的 stdin 走分块推送（`runnoSandbox.js` 的 `pushStdinInChunks`），已实测到 100 万字节以上一致，所以「大样例能跑」这条**只对本地 WASM 沙箱成立**；Piston / Judge0 是把 stdin 内联进 JSON POST 的（Judge0 还要 base64），1MB 级别的 stdin 很可能被对方拒绝或超时。**别在文案里无条件承诺「多大的样例都能跑」。** 界面上超过 6000 字符的字段会把显示切成「开头一段 + 省略行」（见第 5 节坑 26），那只是显示层——复制与运行用的都是完整内容，全选即可拿到全文。另外整个用例集受 localStorage 配额约束（约 520 万字符），见第 5 节坑 27。
- 工具链是静态自托管的（`public/wasm/8.0.1/`），但 `clang-fs.tar.gz` 这个扩展名会让静态服务器补上 `Content-Encoding: gzip`，浏览器已替我们解过一层，所以 `runnoSandbox.js` 里用**魔数判断**要不要 gunzip。换托管方时别把 `unpackSysroot` 改回无条件 `gunzip`（失败时 Chrome 只会报一句 "Failed to fetch"，很难查）。
- 工具链地址里的 `8.0.1` 是**目录版本号**：升级工具链就换目录名，旧的 immutable 缓存自然失效；别在原地覆盖同名文件（浏览器会继续用缓存里的旧版本）。
- 编译产物缓存只留**最近一份「源码 + 内存上限」**（`runnoSandbox.js` 的 `compileCache`，键为源码原文 + `memoryLimitBytes`：上限烙进 `--max-memory`、改上限必须重链接）：命中时连工具链都不碰，第 2..N 个用例只付运行开销；编译失败的结论同样会被缓存，改代码或改上限即失效。别把它改成常驻多份——用例总是成批跑的，代码一改全都作废。
- **STL 预编译头（PCH）**：为老机器省掉每次编译反复解析 STL 头的开销，全流程都在 `runnoSandbox.js` / `pchStore.js` / `wasmRuntime.js`，没有独立 worker。改这一块时几条不能破的约定：
  - PCH 源码就是**整份 `bits/stdc++.h`**（`PCH_SOURCE_TEXT = UNIVERSAL_HEADER`，连 include guard 都一样）：用户代码里那句 `#include <bits/stdc++.h>` 命中同名 guard 直接整段跳过。**别再退回「只覆盖 5 个头」的微型版**——2026-10-19 实测同一份 85 行题解：5 个头 `.pch` 6.9MB / 检查 104–127ms，30 个头 `.pch` 8.6MB / 检查 42–44ms。多 1.7MB 换掉约 60ms，剩下的 25 个头（尤其是 `<sstream>` / `<deque>` / `<unordered_map>`）比前 5 个还贵。三种形态里「PCH 与万能头同 guard」最快；异 guard 只多约 5ms（多展开 30 行被各自 guard 挡掉的 `#include`）。
  - 语义上要清楚：`-include-pch` 是**隐式前缀 include**，等于每个 TU 自动带上一整份万能头。所以「少写了 `#include <vector>` 也能过」是这条加速的固有副作用（PCH 只覆盖 5 个头时同样如此），别把它当成 bug 去修。
  - PCH 生成与用户编译必须**逐字共用** `FRONTEND_ARGS`（`-std=c++17 -O2`、三个 `-internal-isystem` 路径等）：PCH 文件签名里含语言/目标选项和头文件搜索路径，参数对不上 clang 加载时直接 fatal，还可能混进语义不一致的 libc++ AST。生成走 cc1 直连：`-cc1 -emit-pch -x c++-header`（我们从来没有 driver，别写成 `clang -x c++-header ... -emit-pch`）。
  - 生成只走后台：`wasmRuntime.warmupPch()` 在「首次编译成功」或「手点下载成功」后，经 `requestIdleCallback` 排进**同一条串行队列**（不能并行——sysroot + PCH 克隆会让内存翻倍，老机器正是要避开这个）。生成带 3 分钟看门狗，失败（OOM / 卡死）写 `cp.pchUnsupported=<当前版本记号，如 v6>` 且**同一代内核里任何路径都不再重试**（换代后自动重试一次，见 §22.8）。
  - `generatePch()` 先查 IndexedDB 存档，命中是毫秒级返回且**不会**拉起工具链；编译路径的 `loadPchBytes()` 只读存档、**绝不触发生成**——没备好就平滑走普通编译。带 PCH 时把 `/stdc++.h`（源码）和 `/stdc++.h.pch`（二进制）一起挂进 MemFS，参数追加 `-include-pch`，链接前把 `.pch` 从 fs 摘掉（免得 8.6MB 白克隆给 wasm-ld）。
  - 判废条件必须窄：只有「带了 PCH、没产出 `.o`、且 stderr 命中 `/stdc\+\+\.h\.pch|precompiled header/i`」才判废（删存档 + 置标记 + 普通编译重试一次）。用户自己代码写错同样没有 `.o`，放宽条件会让每次编译错误都白编一遍并永久关掉加速。
  - 实测（2026-09，本机 headless Chrome）：生成约 510–580ms；公平 A/B 下编译+运行 937ms → 730ms，真实 UI 每题 601ms → 354ms，输出逐字一致。数字含 WASI 启动 + sysroot 克隆 + 链接固定开销，老机器上 STL 解析占比更高，绝对收益更大，别在文案里承诺固定倍率。**2026-10-19 补测（Node + 站内同一份 clang 8 + sysroot，85 行线段树题解）**：无 PCH 407–445ms、v2 微型版 104–127ms、v3 全量版 42–44ms；4 行小程序 105ms → 42ms，说明**固定成本已降到「实例化 + 反序列化 PCH」这一档，与代码规模基本无关**。另测 `-fno-validate-pch` 只省 2–5ms（且会让过期 PCH 静默产出错诊断，**不采纳**）；`-disable-free` 在噪声内（**不采纳**）。
- **wasm-opt 二次优化：实测无收益，刻意不接进构建**（2026-09 测过并决策放弃）。`npm run wasm:opt`（`scripts/optimize-wasm.mjs`）能对 `clang.wasm` 跑 `-Oz`，但上游这份已经是裁剪过的终态：code 段占 80.7%，抠不动；文件里**没有 name section**，「抹掉调试符号」几乎无对象；而且 `-Oz` 重排指令会让 **gzip 反而变大 0.98%**（老机器真正传输的是压缩流）。实测：`-Oz` → raw −1.89% / gzip **+0.98%**，`-Oz --strip` → raw −2.78% / gzip −0.15%，且函数数量不变、JIT 编译单元不变。**结论：不要做 dev/prod 资源分流去引第二个 30MB 文件**，脚本留着当资产（将来换未优化的工具链、比如 clang 18，可以重测）。脚本优先用 `tools/binaryen/` 下 gitignore 掉的原生二进制（比 npm 的 wasm 版快一个量级），没有才回退到 npm 包 / `WASM_OPT_BIN` / PATH。
- **PWA：装到设备后可独立窗口运行，离线也能编译**（2026-09 加，见第 9 节）。语言工具链**不在 install 预缓存**：用户用哪个语言，才在第一次真正请求时把哪个拉下来并落进 `cp-toolchain-*`（`cacheFirst` 按 `/wasm/` 前缀分流），拉过一次之后一样能离线用。所以「断网也能编译」的前提是该语言此前已经用过一次；离线状态下本地沙箱、判题、主题、布局照常，只有 Piston / Judge0 这两种远端引擎、以及尚未拉取过的语言会失效。装完之后设置视图「应用」分组里的安装按钮自动消失，也不会再重复提示。
- **浏览器插件抓题（2026-09 加，全流程见第 13 节）**：配合**改造版 Competitive Companion**（已更名 **CC for Web**、主色换成与本站一致的蓝）。原版是把题目 POST 到本机 `localhost` 端口，改造后改为在目标网站注入内容脚本、用 `window.postMessage` 推给已打开的站点标签页；站点侧落盘到 `/<年月>/<OJ 标签>/<难度>/<题名>.cpp`（挂在工作区根下；难度导入时为空、先落「未分类」；题目信息与抓到的样例都挂在这个文件节点上 `node.meta` / `node.config`，树里不另有条目），并把抓到的样例**整体替换**进评测面板。安装包在站内分发（设置 → 浏览器插件）：下载 → 解压 → `chrome://extensions` 开开发者模式 → 「加载已解压的扩展程序」。**能力边界：只在站点已打开时投递**（没开就给一条系统通知提示先打开网站）；难度不会自动填（来源站点口径不一，由用户自己在题目信息弹窗里填），日期在首次导入时自动播种。
- **比赛（2026-10-19 加；当晚拆成独立组件 `CfContestPanel`，2026-10-27 起并入合并后的 Codeforces 页签 `CfCodeforcesPanel`）**：在比赛页签里贴一场比赛的链接或裸 ID（`/contest/` `/gym/` `/group/` `/problemset/` 四种链接与 `2276` `2276A` 都认），得到**元数据 + 倒计时 + 本场题目列表**，可逐题或一键导入工作区。**全程纯网页、不需要浏览器扩展**（CF 的 `api/contest.list` 回 `access-control-allow-origin: *`，Worker 直连即可）。四条边界：① **元数据路径不带样例** —— CF 的 API 不给样例、题目页 HTML 又没有 CORS 头，所以导入先落题、样例走「抓样例」那颗按钮（扩展整场读一页，见本节末）或用户打开题目页时的自动补抓；② **题目列表唯一来源是 `contest.standings`**（2026-10-20 改，2274 实报六道只回两道：`problemset.problems` 的全局题库对部分比赛**缺题且可能是永久缺**——2274 的 C–F 是 olympiad 镜像题，dump 已收录更新的 2275/2276 却始终没有它们，「题库筛不到才回落」的口径会把残缺清单当成全场）。standings 非 gym 只允许**裸参数**、响应是整场榜单（实测 2–6MB），所以按场次缓存 `contestProblems:<id>`（24h，只存几 KB 的 problems 数组，不存榜单行），每场只付一次；rating standings 不带，从题库 dump 按 (contestId, index) 补、且只读缓存不触发网络；**连不上就报错，绝不回退 problemset** —— 部分缺失比失败更害人。gym / group 要 apiKey 签名，网页这边一律回「这类比赛要靠扩展」，不是故障；③ **不信 `phase`** —— 页面开着不动时它恒为取数那一刻的值，倒计时归零必须能自己翻面（判据在 `cf/contest.js` 的 `contestStatus`）；④ 倒计时**不累减**，每秒只推进 `now`、剩余量现算，后台节流或睡一夜回来都对；⑤ **组件卸载联动**（2026-10-19 晚补）：`cfReady` 翻回 false（设置 › 应用 › 组件里卸载，或浏览器清库被 reconcile 正回来）时 `useCfContest` 里那条 watch 会关掉比赛页签并清空本场的内存状态（代次计数器一并作废，否则在途那一发会把刚清空的列表填回来；`finally` 里按代次认领的 loading 也因此要手动归零）—— 与 `useCfPicker` 对抽题页签那条 watch 同一条纪律，卸载后不留点不开的空页签。**归零那一刻两条都要重取**（元数据 + 题目列表）—— 只刷元数据的话，「还没开赛，题目开赛后才会出现」会一直挂着、要用户自己再点一次「载入」；而刷新回调必须挡掉 `next === 'unknown'`（换一场时 `contest` 被清空也会走这条），否则 `load()` 自己刚发的那两条会被补刷再来一遍，题目那条又是 2–6MB 的整场榜单。**样例在 2026-10-19 晚接上了（P2）**：题目列表抬头多一颗「抓样例」，走 `cp-scrape-contest` 请扩展在后台读一遍 `/contest/{id}/problems`（整场题面与样例都在那一页，实测 2276：7 个 `.problem-frames > div`、7 组 `.input pre`），抓回来的题仍按 `cp-task` 逐题投递、由 `importProblem` 按 url 并进已有节点。**点它之前会先把还没导入的题安静落盘**（`quiet: true`：不切页签、不 `deactivateViews`），否则样例没有地方挂。这条受 `capabilities` 的 `contest-batch` 保护 —— 老扩展下那颗按钮根本不出现，界面等于 P1。**入口**：侧栏那颗「组件」按钮点开的组件菜单 `ComponentsMenu`（分「Codeforces」与「工具」两类；Codeforces 类里只有一格 Codeforces（抽题与比赛合并，见下一条），工具类里是倒计时；仿应用抽屉的网格浮层；折叠图标栏那颗同款、`placement="beside"`）—— 它不再是抽题面板里的折叠块，`cp.cf.contestOpen` 折叠偏好随之废除。
- **比赛题目导入的落盘路径与页签组（2026-10-26 用户口径）**：比赛导入的题落在 `/<年月>/<OJ>/<比赛名>/<题号. 题名>.cpp` —— 第三层是**比赛名**、不是难度（难度仍写进 `meta`）；文件名去掉 `CF<比赛ID>` 前缀，格式为 `A. 1+2=3`（由 `cfWorker` 的 `contestProblems` 拼 `task.name`）。导入后页签归进一个**以比赛名命名**的标签页组，单题导入也建组；同一场分几次导 / 刷新后再导，先按名字找回已有的组再追加（`useCfContest` 的 `trackContestTab`，入组前 `await nextTick()` 的纪律与抽题同款）。文件路径由 `importProblem` 的 `options.contestName` 决定；已有文件仍按 url 找回原目录复用、**不搬动也不改名**（老比赛导入过的老文件不会被迁移，这是「搬动 = 丢题解」的既有纪律）。实测（2026-10-26 dev、真界面）：2276 全部导入 → 芯片名 = 比赛名、7 张页签同组，树为 `/2026-10/Codeforces/Educational Codeforces Round 195 (Rated for Div. 2)/A. Perfect Sandwiches.cpp`。
- **抽题与比赛合并成一个 Codeforces 组件（2026-10-27 用户口径「先塞到一起，UI 之后再设计」）**：`EDITOR_VIEW_IDS` 从 `settings / cfPicker / cfContest` 收成 `settings / codeforces`，新外壳 `CfCodeforcesPanel` 用一行直角分段「抽题 / 比赛」切换两个子面板（子面板 `v-show` 常挂，状态不丢）。三处入口一起收口：组件菜单 / 折叠图标栏 / 合成页签都只认 `openCodeforcesTab()`；`cp.activityBarPins` 旧的 `picker` / `contest` 在 `load()` 里迁移成一个 `codeforces`（`pinnedComponents` 因此不会出现两格同物）；`useCfPicker` / `useCfContest` 卸载联动改关 `closeCodeforcesTab()`。**仍是临时 UI**：外壳抬头与子面板自己的抬头会叠成两行标题，设置 › 应用 › 组件 也还列着「抽题 / 比赛」两行（同一份安装资产），这些留给后续 UI 设计统一收（**UI 已由 2026-10-28 那次改版定稿，见上一条**）。实测（dev、headless Chrome，探针 9/9）：组件菜单打开只有一个 Codeforces 页签、默认抽题、切比赛显示赛程页、切回抽题表单仍在、关页签后重开仍是一个页签、旧 pin 迁移为单格、零控制台错误
- **比赛核心功能 P0（2026-10-27 加）—— 赛程 / 排行榜 / 提交记录都走原生接口，全程纯网页**：比赛面板新增模式轴「赛程 / 比赛」，比赛模式下再分「题目 / 排行榜 / 提交」。**赛程**读 `contest.list`（非 gym 与 gym 分开缓存 1h），分「正在进行 / 即将开始 / 最近结束」三组，每行一枚每秒重算的倒计时（2026-11-01 改口径：**进行中那一格显示「还剩 X」= 距结束**，原来显示的是「已开赛多久」，用户报「开赛之后看不到还剩多少，不方便」；已进行 / 本场共多长退到悬停提示 `runningHintOf`。两条实现约定别踩：`useCfSchedule.remainingOf` 返回的是**距开赛**的毫秒数，开赛后为**负数**（= 已进行），「还剩多久结束」要 `remaining + durationSeconds*1000`，见 `untilEndOf`；行底那 1px 进度线同一个坑 —— `progressOf` 原先写成 `duration − remaining`，于是开赛瞬间就等于 `duration`、进度线起步即满格，正确是 `−remaining / duration`。时钟列同时从 144px 加宽到 168px：最长的「还剩 4 小时 59 分钟 59 秒」实测 163.5px，按 144 会向左溢出 19.5px 压到「开赛时刻」那列）。**抬头那枚「LIVE」角标的翻面时刻（2026-11-01 修）**：它读模块级的 `cfRunningCount`，过去只由 `watch(running)` 写，而 `running` 依赖每秒推进的 `now`，`now` 又只在**赛程页可见**时跳（`active` watch 里的 `startTick` / `stopTick`）—— 于是把页停在抽题 / 比赛、或干脆在别处写代码时，比赛到点角标根本不出现，必须重开赛程（或切走再切回）才补上（用户报障）。探针 A/B 复现了：停在抽题页、开赛 +2.5s 后角标仍是 `null`，切回赛程才变 `LIVE`；同一时刻赛程行的时钟冻在「8 秒」（证明那条心跳确实停了）。修法：`load()` 落地时把 `{contests, fetchedAt}` 存进模块级快照并调 `syncRunningCount()`，它按 `untilNextPhase`（距开赛 / 距结束里最近的那个）排一只 `setTimeout`，**只在阶段切换那一刻醒来**，中间零开销 —— 也不用把 `now` 挪到模块级（那样 v-show 着的赛程列表会在后台每秒重排一遍）。**别改回 `watch(running)`**：那等于又把角标绑回赛程页的心跳。边界：本会话没打开过赛程页时手上没有列表，角标仍是 0 —— 这是「赛程页没打开过就不取数」的既有口径，不在这次改动里。**赛程行的点击口径（2026-11-01 统一）**：整行只有一个行为 —— 点哪里都是「切到比赛模式并载入这场」，比赛名**不再**是去 CF 的 `<a>`（以前名字是外链、行是载入，同一根水平带里两种行为、也看不出谁是谁，用户报障）。去 CF 网页只剩行尾那颗 ↗（`.cf-schedule__open`，`<a target="_blank">` + `@click.stop`，图标 `AppIcon name="external"`，`title` 走 `cf.contest.schedule.cfPage` =「在 Codeforces 打开」）—— 它一直在、不靠悬停才现身；行尾为此多一列 26px（宽容器 `… 168px 26px`、带报名列 `… 76px 26px`、窄容器 `1fr 168px 26px` / `1fr 168px 72px 26px`），**四套 grid 必须一起改，漏一套就是列错位**。悬停强调也从「名字自身 hover」改成「整行 hover 时名字转主色」，与「点的是整行」对齐。**排行榜**读 `contest.standings`（裸参），客户端分页 100 行 + 「跳到我」；**提交**读 `contest.status`（默认最近 200 条，`handle` 可服务端筛「只看我」）。**提交当前文件**：活跃文件属于已载入的这一场时，比赛面板直接给一颗提交钮，确认与发送仍走 App 的 `submitActiveFile`（不另开一条提交链路）。五条硬口径：① **全局限流只有一条闸门**（`cfWorker` 的 `apiFetch`，2100ms）—— 榜单 / 提交 / 详情 / 抽题共用同一份 IP 配额，`ojSubmit.fetchSubmissionDetail` 2026-10-27 也从「自己排队」搬到这条闸门上，两处各排各的必然撞车；② **轮询按「这一子页可见 + 页面在前台 + 比赛进行中」三重闸门**，榜单 10 秒、提交 5 秒（合起来 3 次 / 10 秒），已结束 / 未开赛一次都不排，后台回来先补一次；③ **榜单只有官方参赛者**（CF API 的 `contest.standings` 只回 `CONTESTANT`，VP / 非正式不在里面，2026-10-26 拿 2184 的 15,725 行验过），界面明说「官方榜」——自己的非正式名次走 P1 那颗按钮（见下一条）；④ **提交记录永远只取最新一段**（旧比赛整场 61.5 万条 / 16.9MB gzip，count 在 Worker 侧收敛到 1..1000），「只看我」清空重取、两种口径不混；⑤ **`relativeTimeSeconds` 的 INT32_MAX 哨兵**（见 `cf/submissions.js`）——赛后 / 练习提交该字段是 2147483647，不是秒数，不处理会把 46px 时间列撑成 `596523:14`。**还没做**：gym / group（要 apiKey，网页侧一律回「要靠扩展」）、完整历史分页。实测（2026-10-27 dev、真界面、真实 CF 数据）：1791 官方榜 11,501 行 / 116 页、翻页与「跳到我」正确，提交 200 条判定与时间列正常（0 条溢出），`handle=zawatin` 时「只看我」8 条、小结「过 7 题 · AC 7 · 未过 1」，赛程 19 场分组与倒计时正常，提交详情经 Worker 取回；探针 35/35 通过。**本批零扩展改动**：P0 全在网页侧（新增的接口都是 CF 公开 API），`CC-for-Web` 的消息协议、能力表与版本号一个字节都没动 —— 下次改扩展时不需要为 P0 补兼容
- **比赛核心功能 P1（2026-10-26/27 加）—— 报名、开 VP、非正式名次交给扩展，站点只出界面**：赛程每行末尾多一列报名状态（`contest-schedule`），即将开始且 `open` 时给「报名」钮（`contest-register`），已结束的每场给「VP」钮（`contest-virtual`）；排行榜抬头多一颗「非正式名次」（`contest-unofficial`），结果就地写成「含非正式：第 N 名」。**四件事都只在用户点按后发生**：报名 / VP 先弹一张确认卡片（`role="alertdialog"`，Esc / 点背景关闭，默认焦点在「确认」），确认后才发一条消息，失败按 `reason` 枚举折成一句人话的通知，**永不自动重放**；非正式名次只在那颗按钮上发。四条能力各自独立（见 13.1 能力协商），老扩展下整列 / 两颗钮 / 那颗按钮一起消失，版式回到 5 列。三条实现口径：① **`active` 必须从页签可见性一路传下来** —— 合并后的 `CfCodeforcesPanel` / `CfContestPanel` 都是常驻挂载（`v-show`），只看内部的 mode/tab 会把「页签根本没露出来」当成「赛程页正开着」，于是整页启动就去取赛程、连带让扩展开一个 CF 标签页读报名状态；`EditorPane` 现在把 `codeforcesTab.active` 传给 `CfCodeforcesPanel`，再与内部 mode/tab 相与后给三个子面板。② **报名成功只就地改一格状态**（不重取整表），VP 成功不改那一列（那一列说的是报名）。③ **非正式名次回包那一页叫 `rankSource`**，理由见 13.1 那条（`source` 撞信封标记）。实测（2026-10-27 dev、headless Chrome、伪造扩展握手 + 真实 `contest.list` 数据，19/19 绿）：赛程 18 行全带列、`open` 那场出「报名」、已报名那行写「已报名」、12 场已结束出「VP」；点报名 → 确认卡片标题「报名 …？」→ Esc 不发请求 / 点确认恰发一条 `cp-register`、失败通知「要先去 Codeforces 登录」；VP 同理发 `cp-start-virtual`；老扩展（无四条能力）整列消失、5 列、零请求，且**没打开 Codeforces 页时一次都不发** `cp-contest-states`；排行榜点「非正式名次」→ 就地「含非正式：第 5000 名」，请求带 `contestId` 与 handle。**本批扩展改动**：`CC-for-Web` 2.68.0（新增 `src/contestActions.ts` 内容脚本、四条消息、四条能力；`host_permissions` 190 → 195、`content_scripts` 4 → 5，API 权限与第三方组件不变），站点 `public/extension/cc-for-web-2.68.0.zip` 已随之更新
- **比赛榜单补数据（2026-10-27 晚；六项 + 一条导入口径）**：① **题名语言** —— 不是站点语言设置的问题：CF 的题名只有英 / 俄两套（没有中文），`contest.standings` 不带 `Accept-Language` 时**默认俄文**，现在 `cfWorker` 的 `apiFetch` 统一带 `Accept-Language: en`（CORS 简单头、不触发预检），题目清单缓存键抬到 `contestProblems:2:`；实测 2276 七个题名全英文、与官网 `title="A - Perfect Sandwiches"` 一致。② **每题「多少人尝试 / 多少人通过」** = CF 榜单页表尾那行，由手里这份榜单**本地现算**（`problemStatistics`：通过 `points > 0`，尝试 `points > 0 || rejected > 0`），**零额外请求**；与 CF 页面逐题完全一致（2276 ICPC 制 7342/7618、5789/6119、5096/5424、3217/3585、1106/1244、107/219、4/4；2272 CF 制同样对上）。③ **通过时刻**本来就在 API 里（`bestSubmissionTimeSeconds`），题格副行现在画成 `HH:MM`，与 CF「得分 / 时刻」两行同款；CF 制的失败次数仍只在 tooltip（CF 自己也是这样）。顺带修掉一个实测抓到的配色 bug：CF 制得分是**衰减后**的（500 分题到手 320），原先拿它跟 `maxPoints` 比，导致每个通过的格子都被画成 `partial`（黄），现在只有 IOI 判 partial。④ **非正式参赛的 `*` 画不出来** —— 不是没做：界面已支持 `row.unofficial` 的星号，但 `contest.standings` 只回 `CONTESTANT`，真实数据里恒为 0 枚；要在列表里看见 VP / unrated 只能读 CF 排行榜的 HTML（勾上 `showUnofficial` 后 2276 从 40 页变 126 页 ≈ 25,200 行、多 86 发请求，且匿名带参翻页回 403），本版不做 —— 自己的非正式名次仍走 P1 那颗「非正式名次」（扩展只读那一页、回一个数字）。⑤ **「能不能部分导入」** —— 本来就能：题目列表每行一颗导入钮、抬头一颗「全部导入」，逐题导入各自落盘并进同一场比赛的标签页组；而排行榜这份数据是**一次性拿全**的（API 没有分页参数，2–6MB 一发），翻页与表尾统计都在本地算 —— 补这些数据**不多取任何一次请求**，不需要「分批导入」。实测（dev、headless Chrome、真实 2276 数据、深浅两套主题各一张截图）：题名全英文、题格 `+ / 00:05` 全绿、表尾 7 组数字与 CF 逐题一致、表头题名全英文，探针 7/7。**⑥ 罚时 `-N` 可见性回归（当晚二次报障）**：上一轮把没通过的 `-N` 挪到了 9px 的副行，副行 `color: var(--text-faint)` 直接压掉 fail 色，等于看不见 —— 用户原话「排行榜现在又不显示罚时了，就是那个减号带数字的东西」。现在 `problemCell` 把所有「没通过且有被拒」的格子都画在主行（ICPC 与 CF / IOI 两套口径都如此），`tone: 'fail'` = `--fail` #f48771、字号取题格那一档 11px、无副行；CF 制已通过的格子仍只把被拒次数放 `title`（与 CF 自己一致）。**⑦ 「我在榜单里的位置」置顶**：`myRow` 存在时表格上方粘一条（`position: sticky; top: 0`，粘在 `.cf-view` 的滚动容器里），内容 = 名次 + 选手 + 计分摘要 +「跳到我」；往下滚、翻到第 3 / 79 页都看得见，条尾那颗就是原来的翻页动作。抬头那颗重复的「跳到我」和口径行里的小字名次一起删掉，名次只留一处。新增词条 `pinSolved` / `pinPenalty` / `pinPoints`（中英同步）。实测（同一支探针扩到 8 条）：置顶条 `我：248 名 hamburger46 过 5 题 · 罚时 137`、`-2` 为 `rgb(244,135,113)` / 11px / 无副行、窄视口滚到底 `deltaTop = 12`（= `.cf-view` 的 12px 内边距）条高 25px 仍在可视区内、「跳到我」翻到 `3 / 79 页` 且自身行高亮、英文界面 `Me: rank 248 … 5 solved · penalty 137`、浅色主题正常，**8/8**
- **Codeforces 页 UI 改版（2026-10-28，用户口径「严格按项目现行 UI 风格，尤其是非设置页面」）**：整页从「工业引擎控制台」（1px 网格、直角、9–10px 小字、实心蓝主按钮）换成与设置页 / 评测面板同一套语汇，**功能与取数零改动**。五处：① **抬头**只剩一行（品牌 + 圆角分段「抽题 / 比赛」），透明底 + 一条 5% 底线，子面板自己的抬头撤掉（原先是两行标题叠着）；② **抽题表单**是一列「92px 标签 + 控件」，行间只留 `--border-divider`，输入框 / 芯片 10px 圆角，布尔选项换成带勾的开关芯片，主操作是通栏 36px `--accent-face` 面；表单与结果列表**同宽**（留一条 640px 的窄列会让淡线与列表差出一截）；③ **比赛**从两层模式轴收成「赛程 / 题目 / 排行榜 / 提交」一条子页签，赛程之外的三页共用一条比赛链接条（窄容器换成两行网格：标签 · 状态 · 外链 / 输入 + 载入 —— flex-wrap 会把「载入」甩到输入框上面）；④ **列表**统一 `.cf-list`（行悬停面左右外扩 10px、圆角 8、行间一条 5% 线且悬停时让开），赛程 / 题目 / 榜单 / 提交四块共用；榜单选手列**左对齐**（基础规则 `.cf-table td` 是右对齐，`.cf-table__who` 必须带 `.cf-table` 前缀才压得住），表头 / 表尾贴边背景用 `--bg-editor`；⑤ **新令牌**：`--accent-text` + 六支低透明度面（见变量表）。窄档走容器查询 `@container cf (max-width: 34rem)`（抽题行变单列、榜单 / 提交 / 赛程撤次要列；赛程倒计时列窄档也保 72px，否则 `185:54:02` 会截成省略号）。实测（dev、headless Chrome 1400×980 + 760×900，深 / 浅两套 15 张截屏）：抽题 5 条结果、赛程 / 题目 / 榜单 / 提交四页都有数据、账号校验 `is-ok` 正常，`npx vite build` 通过
- **随机抽题（`CfPickerPanel`）导入的页签归成一个标签页组（2026-10-20 加）**：一批抽到的题打开成页签后**共用一个组**（无名、颜色取 `tabGroups` 的「用得最少」那个），条带上一眼看出「这些是这次抽的」；同一批里逐题点导入也是进同一个组，不会排出一串单成员的组。**一批超过 5 道（`useCfPicker` 的 `BULK_TAB_LIMIT`）则只落盘、不开页签** —— 判据是**抽到的数量**（`results.length`），不是「这一次导了几道」；用户在结果区本来就看得到导没导，不需要靠页签确认。组的粒度是「批」：`run()`（换一批）重置，**单抽一道题不建组**（一个成员的组没信息量）。两条实现纪律：建组只走 `tabGroups` 的公开入口（`groupTabs` / `addTabsToGroup`，连续性与空组清理都在那边）；入组前要 `await nextTick()` —— 新页签是 `openTabIds` 的 watch（`flush: 'pre'`）才排进 `stripOrder` 的，不等这一下 `validTabIds` 会把刚打开的页签静默过滤掉（组建不出来 / 加不进去）。实测（dev、真界面、1400×900、`preferNew` 关）：抽 3 道 → 3 张页签同组、条带下标连续 1/2/3、1 枚芯片；改成 6 道 → 页签 4→4、芯片 1→1（不新增），库里 codeforces 文件 3→9。
- **题解（Markdown / LaTeX，2026-09-30 加）**：`.md` / `.markdown` 能写、能预览、能排版，**但只是文本，不参与判题** —— 两个运行入口在题解下都是禁用态并给出一句提示（不是「点了没反应」）。预览依赖**按需下载**的 marked + KaTeX（约 578KB，缓存桶 `cp-md-runtime`，与本地工具链同一套路数）：**没下载时预览面板显示的是「去下载」入口而不是空白页**，下完当场渲染，设置 → 应用 › 本地运行环境里可以整体卸载（清缓存 + 删全局 + 删标记三件一起做）。三条边界：① `.md` **不进**判题链路（`activeLanguage` 为 `null`，外部引擎也没有 markdown 语言）；② 公式只在预览里渲染，编辑器里就是 `$…$` 原文；③ 题解与代码文件共用同一套 VFS / IndexedDB 存储，没有「题解专用表」，重命名 / 移动 / 删除走的都是既有路径。
- **题解的「生成图片」走渲染排版（2026-10-21 加）**：编辑区右键「生成图片」在 `.md` / `.markdown` 下不再把选区当代码画，而是**按题解预览的 Markdown + LaTeX 排版渲染成 PNG**（`services/mdImage.js`）；其余语言不变，仍走 `codeImage.js`。四条口径：① **渲染器没下载时回退为代码图**（`MD_RUNTIME_MISSING` / `MD_IMAGE_UNAVAILABLE` 两种错误都在 `useEditorMenu.exportEditorImage()` 里静默接住，继续走 codeImage，不弹报错、不打断用户）；② 出图是**纯净文档** —— 无卡片、无窗口圆点、无行号、无阴影，只有内容与四周留白；③ 配色**跟当前界面主题**（底色取 `--bg-editor-pane`，正文色由 `.md-preview__body` 的 `color: var(--text)` 继承）；④ 版心**固定 720px** + 四周 32 留白（总宽 784），不跟预览栏宽度走，换窗口导出同一段内容排版不变。质量倍率复用设置里的 `codeImageQuality`（码率 2/3/4，经 `codeImage.js` 的 `imageQualityScale()` 取同一档）。实现上有四条不容改动的细节：**SVG 必须以 data URL 喂给 `<img>`，不能走 blob URL** —— Chrome 对「blob + foreignObject」会污染 canvas，`toDataURL` 直接抛 `SecurityError`；**要等 KaTeX 样式表就绪**（`mdRuntime` 用 `<link>` 插 CSS，脚本加载完 ≠ CSS 到位，不等就会按兜底字体量高度、图和预览对不上）；**字体与图片一律转 data URL** —— SVG 作为图片加载时不取外部资源，不转则公式字体回退、图片变破图（跨域图片取不到时删掉 `src` 留 alt 文本）；**排版样式只有一份来源** —— 现读 `.md-preview__body` 的 `data-v-*` scoped 属性抄到离屏容器上，命中 MarkdownPreview 的 scoped 规则，不另写排版表（改预览样式导出即跟着变；加新排版特性时记得回 `mdImage.js` 的 `STYLE_PROPERTIES` 白名单补属性）。**canvas 尺寸护栏（2026-10-21 补）**：Safari / iOS 的单张 canvas 只给到 16384 边长 / 16.7M 像素面积，**超了不抛错、`toDataURL` 返回 `"data:,"`**（存下来是 0 字节图，Chrome 实测同样如此：65536 边长、300M 面积都回 `"data:,"`）；Chrome 的上限是 65535 边长 / 268M 面积。所以 `fitCanvas()` 按引擎分档（`isWebKit()` 判 UA：带 `AppleWebKit` 且不带 `Chrome` / `CriOS` / `Edg` / `OPR` / `Android`），**超限时按同一比例整体缩小宽高**（版面不变形、内容不裁切，长题解在 Safari 上以低倍率出图而不是 0 字节）；缩到 `MIN_CANVAS_SCALE = 0.25` 仍装不下才抛 `MD_IMAGE_TOO_LARGE` 回落代码图。实测（Chrome + 伪造 Safari UA，quality=ultra）：普通题解 3136×780 不受影响；400 段长文 Chrome 927×65535、Safari 232×16384，两者都出得了有效 PNG。**Safari / WebKit 兼容（2026-10-21 补）**：macOS Safari 27（系统 WKWebView 实跑）与 Playwright WebKit 均实测出图正确（含 KaTeX 根号那枚内联 `<svg>`）；但 WebKit 有几个「不修复就表现为点了没反应 / 一张白图」的坑，`mdImage.js` 里各留了一道防线：① **窗口不可见（后台标签 / 最小化 / 被盖住）时 rAF 完全不触发** —— `nextFrame()` 除了 rAF 再挂 120ms 定时器兜底；② **`onload` ≠ 栅格化完成** —— `loadSvgImage()` 加载后补一次 `image.decode()`（本身也带超时，防某实现里 decode 永不落定）；③ **`fonts.ready` / KaTeX 样式表 / 图片解码都可能永不落定** —— 每步套 `STEP_TIMEOUT = 5000`，字体那步超时只降级按兜底字体出图、不失败；④ **超长 base64 data URL 的 SVG 图片会解码失败** —— 改走 `encodeURIComponent` 的 percent-encoding（也省掉 FileReader）；⑤ **万一还是画不出来** —— `assertNotBlank()` 把结果缩到 64×64 量着墨量，全为空抛 `MD_IMAGE_BLANK`，`getImageData` 抛（canvas 被污染）抛 `MD_IMAGE_UNREADABLE`；⑥ **回落口径扩成「任何 `MD_` 前缀错误」** —— `useEditorMenu.exportEditorImage()` 只把非 `MD_` 错误继续往外抛，其余一律静默走代码图（与「渲染器没下载」同一口径），所以 Safari 上最坏情况也只是出一张代码图。**通知文案按出口分四路（2026-10-21 补）**：复制成功 → success「图片已复制」；用户自己点的「保存」→「图片已保存」（纯下载，不提剪贴板）；复制没成、退化成下载时再按**失败原因**分两条 —— 能力上真的没有（无 `ClipboardItem` / `navigator.clipboard.write`，或 `ClipboardItem.supports('image/png')` 为假）才说「这个浏览器不支持写入图片剪贴板」；**有能力却这次没写成**（权限被拒 / 手势窗口过期 / 剪贴板被占）只说「这次没能写入剪贴板」并给 warning。`copyCanvasToClipboard()` 因此返回 `{ ok, reason: 'unsupported' | 'failed' }` —— 别把后一种也说成「不支持」，那是正常桌面设备上会出现的误报。
- **「生成图片」没有选区就整篇（2026-10-23 加）**：编辑区右键那一项不再因没有选区置灰 —— 有选区仍只导出选区，没有选区时导出**整个文件**（`useEditorMenu.exportEditorImage()` 无选区时取 `model.getValue()`、行号从 1 起；`.md` 同样按整篇走预览排版）。快捷键（默认 ⌘ / Ctrl+P，可在设置里改绑）与右键菜单同源，「没选东西就整篇」两边一致。空文件 / 全是空白时静默不响应（没有可画的内容）。
- **把文件从资源管理器拖到编辑区（2026-09-30 加）**：拖过去时编辑区亮起与「拖到树空白处（根区域）」**同一个变量**（`--bg-drop-root`）的提示色，松手后**已经开着就切到那个页签、没开就常开一个新页签**（不是预览页签；顺带把它从预览槽里钉住）。三条边界：① 高亮范围是编辑器**内容区**（`.editor-pane__stage`），不含页签栏与状态栏；② **目录不接**（拖目录过去不亮、不动作——目录的语义是「移动」不是「打开」）；③ 触屏也走同一条路（长按起拖之后拖到编辑区即可），没有额外的触屏入口。
- **界面双语（2026-09-29 加）**：界面、应用内帮助与使用指南都有**中文 / 英文**两套，语言默认跟随浏览器、可在设置视图「外观」组的「界面语言」里改，**切了当场生效、不重载**。写文案时注意两条边界：① **判题语言与界面语言无关**——判题语言仍由活跃文件的扩展名派生（第 5 节坑 15），界面语言只管文案，别把两者写成一回事；② **没有第三方本地化机制**（没引 vue-i18n，没有 `.po` / `.json` 语言包，没有 URL 前缀 `/en/`），词条就是 `src/i18n/messages/` 下六个 JS 文件里中英并排的对象，加语言 = 加一栏 + 在 `LOCALES` 里加一项。另外 `guide.html` 与 `guide.en.html` 是**两个独立的静态页**（各自的 `guide.html` 级别 SEO 头、互相 `hreflang`），不做客户端语言跳转——抓取器拿到什么就是什么。
- **全局快捷键（2026-09 加）**：可绑定的只有 6 个动作——运行全部用例 / 显示隐藏侧边栏 / **切换侧栏面板** / 侧边栏左右对调 / 新增测试用例 / 打开收起设置（表在 `SHORTCUT_ACTIONS`）。**没登记的动作就是做不到的**：格式化没进来，因为 Monaco 内置的 `Shift+Alt+F` 在 C++ / Python 下没有注册 formatter，绑了也是空按。**题解那 14 条格式键位刻意不在这个表里**（它们不可改、也只在 `.md` 里说得通，注册在 Monaco 上）。绑定的键在编辑器里同样生效（监听在 window 捕获阶段，见第 5 节坑 21）；侧边栏折叠时按运行键会先把结果亮出来（见第 3 节「开跑必亮结果」），它和评测面板页脚那颗 ▶ 走的是同一个出口。**插件的快捷键改不了**：浏览器不允许网页改写扩展键位，也没法跳转到各自的快捷键管理页，所以设置视图里那一块只做「查看 + 复制该地址」。**地址按 `BROWSER` 分岔**（2026-10-11）：Chrome / Edge 是 `chrome://extensions/shortcuts`，Firefox 那个地址不存在、是 `about:addons`（齿轮菜单 →「管理扩展快捷键」），说明文案与复制目标各有一套（`shortcutsManagedSuffixFx` / `shortcutsTitleFx`）。另：Firefox 侧扩展其实能一键打开该页（`commands.openShortcutSettings()`）、甚至能改键（`commands.update()`），Chrome 没有写接口——要上这两条得改扩展发新版，暂缓。
- **模板（2026-10-06 加）**：新建文件时按扩展名归一到语言、填入该语言的初始正文（`.cpp` → C++、`.py` → Python、`.md` → 题解）。归链是 `languageForPath()`（`services/monaco/language.js`）→ Monaco languageId → `langMetaByMonaco()` → 语言 id；**认不出的扩展名（`.c` / `.txt` / 无扩展名）给空文件**，`.c` 不会落到 C++ 模板。插件抓题生成的代码文件走同一条路（`vfs/problemImport.js` 里 `vfs.createFile(codePath, templateForPath(codePath))`，仍守着 `if (!existingCode)` 那道闸门——已存在的题解一个字都不动）。三份模板可在 设置 › **模板** 里改、可逐份**恢复默认**；那一节顶部的**启用模板**总开关可以整体关掉（关掉后新建与抓题都给空文件，模板文本原样留着，闸门只在 `templateForPath()` 一处）。**不支持占位符变量**（纯静态文本、原样写入）。覆盖表与开关都随云同步走（见第 6 节）。`templateForPath('')` 有护栏——`languageForPath('')` 会抛 `error.pathNotAbsolute`。
- **代码区的字体是自托管的（2026-10-02 加）**：界面（代码区以外）仍然只用系统字体；代码区另内置三款等宽字体（JetBrains Mono / Fira Code / Cascadia Code，latin 子集、合计 149KB），**只在下拉里选中时才下载**，不依赖任何第三方服务。写文案时别写成「界面全面自带字体」——「默认」档与其余 4 项仍是系统字体；另外「字体连写」只对**带连字的字体**有效：这三款有，系统内置的 SF Mono / Menlo / Consolas / Courier New 一款都没有。
- **编辑器自动补全（2026-10-08 加）**：C / C++ / Python 有一张**静态补全表**——关键字 + 常用标准库（`vector` / `sort` / `printf` / `cin` / `print` / `sorted` …）+ 代码片段（`main` / `fastio` / `fori` / `ifmain` / `readints` …）。表在 `services/monaco/completion.js`，由 `monaco-setup.js` 顶层**副作用导入**注册（模块只求值一次，注册也就一次），**不加设置开关、恒开**。写文案时别写成「IntelliSense / 语言服务」：它**不是**语义分析——不认变量名与类型、没有跳转定义、没有实时报错，只是「表里的候选 + 同文档里出现过的词」，`markdown` 也不在这张表里（散文用不上）。Monaco 内置的高亮 / 括号配对 / 注释 / 自动闭合 / 缩进规则本来就都有，这次没动。补全的**弹法**（快捷建议 / 触发字符 / Tab 接受 / Enter 策略）显式写在 `editorOptions.js` 里，不再依赖 Monaco 各版本的默认值。一条实现纪律：**每条候选都必须给 `insertText`**（表里没写的由 provider 用 `label` 兜底）——漏给的话补全框照样弹，但 Monaco 的内联补全适配层会拿 `undefined` 去调 `.replaceAll`，控制台整片红。文案五处已同步（`guide.html` §11 / `guide.en.html` §11 / `help.js`「抓题与文件」组 / `docs/使用手册.md` §4 / `index.html` noscript 那条 Monaco 特性行）。另一条实现纪律：**`#` 不在 Monaco 的 `wordPattern` 里**，打 `#inc` 时它只认单词 `inc`，默认的替换范围漏掉那个 `#`，采用 `#include <bits/stdc++.h>` 会得到 `##include …`（症状像是「在已有内容后面又贴了一段」）。provider 里把紧贴单词左边的 `#` 一并算进 range（`swallowHash`，**只给 C / C++**——Python 的 `#` 是注释开头，吞了反而错）；顺带过滤也准了，因为 Monaco 是拿 range 里的文本去比 label 的。
- **补全的三个误触发（2026-10-19 修）**：症状是「明明没想要它却自己弹、Tab 一按就把前面的词换掉」。三个成因各自独立，修法都在 `completion.js` / `editorOptions.js`：① `tabCompletion` 曾写成 `'on'`（Monaco 与 VSCode 的默认都是 `'off'`），补全框关着时按 Tab 会接受「最佳建议」——`retur` + Esc + Tab 直接变 `return`，日常更常见的是「按 Tab 缩进，上一行的词被吞」。现在恒为 `'off'`，Tab 只缩进；② 触发字符（`<` `>` `#` `:`）在光标前**还没有任何前缀**时返回空表。以前 `#include <iostream>` 后面接个 `<` 就会把整表摊开、预选 `abs`，回车正是「`#include <iostream>abs`」的来源；判据是 `context.triggerKind === TriggerCharacter` **且** `getWordUntilPosition().word === ''`，而 `->` / `::` / `.` 仍放行（正则 `/(?:\.|->|::)$/`），手动 Ctrl+Space 一律给全表；③ 预处理指令按 `label.startsWith(typed)` 收窄。`#` 进了 range 之后过滤文本是 `#d` 这种串，而 Monaco 的过滤是模糊匹配——`d` 会在 `#include <bits/stdc++.h>` 的 `stdc` 里命中，于是打 `#d` 只弹这一条、一按就整段替换。现在 `#d` 给空表、`#i` 给唯一那条。⚠️ `v.` 仍然返回整表（12 行可见、`abs` 排第一）：这是「没有语义」的固有结果，不是 bug，别拿它当回归判据。
- **编辑器内的 C++ 语法诊断（2026-10-19 加，`services/monaco/syntaxDiagnostics.js`）**：停手 300ms 后用**站内那份 clang 23.1.0** 跑一次 `-fsyntax-only`，把 stderr 变成 Monaco 标记（owner `clang-syntax`，`source: 'clang'`）。**阶段 4 之后这一枪改吃常驻 worker**（`checkCppSyntax` → `toolchain.host.syntax()`，不再像 runno 那样每次起新实例；Python 那半仍走 `@runno/wasi`）。不是常驻语言服务——每次检查依然是一次性 job（喂源码 → 进前端 → 出 stderr 就结束），装不下 clangd 那种「读一行 JSON-RPC、算完再等下一行」的长驻进程；而 clangd.wasm 实测裸文件 **126.5MB**、导入 `env.memory` 声明 **shared / initial 2GiB / max 4GiB**，手机端不可行。四条纪律：① **不主动下工具链**——`isToolchainReady()` 为假就静默跳过（`checkCppSyntax` 返回 null），绝不因为「打开一个 .cpp」偷下 23MB；② **只有最新一枪能落地**：下一枪开始时 kill 掉在跑的实例，序号对不上或期间内容又变了就丢弃结果，绝不清已有标记（清掉等于告诉用户「代码突然对了」）。⚠️ 阶段 4 之后 `kill()` 掐的是**整颗常驻 worker**（`Worker.terminate()`，`host.alive` 转假），不再是 runno 时代那种丢掉一个廉价实例：下一次要用就得重新 init（量级见 §21.2 的 674–982ms），判题/编译路径会自己重建，**诊断则在重建前静默跳过**；③ 命令行与真编译**共用 `FRONTEND_ARGS`**（`syntaxArgs` 只把 `-emit-obj` 换成 `-fsyntax-only`），否则会出现「编辑器说没问题、运行却编译不过」；④ 按「内容指纹」缓存结果，切回文件 / 撤销回去直接重放，不重跑。实测（85 行题解，**clang 8 档时期**）：带 PCH 的 `-fsyntax-only` 155–268ms，完整 `-emit-obj` 690–782ms，所以编辑器里只付前端那一段（阶段 4 换内核后只重测过编译与运行，见 §21.2；**这条 `-fsyntax-only` 没有重测**，下面的防抖读数同理，都是老档的数）；防抖是**自适应**的（照 clangd `TUScheduler` 的 `DebouncePolicy{50, 500, 1}`：等待 = 下限 ×（连续重建次数 + 1），上限封顶）：正常档 300→600→900→1200ms，停手超过 `上限 × 1.5`（1.8s）清零回到 300；低配档 1200→2400→3600ms（清零阈值 5.4s）。实测（2026-10-19 晚，真实页面、共享同一份模块实例）：第 1 枪 389ms 出红线、连续第 2 / 3 枪 686 / 988ms，改回合法代码 395ms 清空（旧的固定 800ms 恒为 ~1.0s）。两档的上限也都逐枪量到过（同一台机器、每次检查本身约 430ms 含在读数里）：正常档 732 / 1049 / 1325 / 1614ms（间隔 1.6s，= 300→600→900→1200 的封顶）、低配档 1652 / 2794 / 4043 / 4001ms（间隔 4.2s，= 1200→2400→3600 封顶）；4.2s 这个间隔正落在「旧阈值 2000 会清零、新阈值 5400 不清零」之间，所以它同时是「低配档爬得到 3600」的判据。⚠️ 清零阈值**必须比该档上限大**，否则「等够久让计时器跑完」与「停手清零」是同一个条件，低配档的退避永远攒不到上限（曾出现上限 3600、实际最高只到 2400）。**边界**：桌面壳（Tauri）的 C++ 走系统 `clang++`（`engines/native.js`），没有 wasm 工具链，这条诊断在那边不会生效——要支持得单独加一条 Tauri 命令。桌面端已于 2026-10-19 冻结，这条缺口随桌面端一并归档到 `docs/废案.md` §1.2 第 6 条，别再当待办。**触发时机只有「改内容 / 切文件」两个**，所以「先打开文件、后点运行」时运行时才首次进内存的那一幕，要靠 `runnoSandbox` 的 `onRuntimeReady` 通知补一枪（2026-10-20 加，两语言共用）：否则加载完成后屏幕上不会自动出红线，要等下一次击键——用户会当成「诊断没生效」。反方向也成立：只跑过 Python 时 cpp 运行时不在内存，cpp 文件静默无诊断，等第一次跑 C++ 的瞬间由同一机制自动补上。**「装过一次之后打开文件就该有红线」也走这条路**（2026-10-20）：`wasmRuntime.ensureRuntimeLoaded()` 在运行时不在内存时先探缓存、齐了就静默读进内存（几十到几百毫秒，**零下载**），于是刷新后打开坏文件不跑代码也能出线（实测 562ms）。**只在 SW 控制的页面上探**：那时判据是 `caches.match`，静默；dev 没有 SW，只能靠 `only-if-cached` 探 HTTP 缓存，而未命中时它本身就是一条失败请求（控制台 `ERR_CACHE_MISS` + Network 三行红）——dev 里「先跑一次」是常态，不值得刷屏（与设置页探针同一条取舍）。每语言每会话只试一次。
- **编辑器内的 Python 语法诊断（2026-10-20 加，与上一条同一套调度）**：用已在场的 python.wasm 跑 `-c` 小脚本，对 `/main.py` 做 `compile()`，把 `SyntaxError` 译成 **clang 同款格式**（`main.py:行:列: error: 消息`）打给 stderr —— 于是 `syntaxDiagnostics.js` 的解析器一份两用，防抖 / 只让最新一枪落地 / 内容指纹缓存 / 低配模式全部原样共用。三条刻意的边界：① **只解析、绝不执行**（`compile()` 编到字节码就停，诊断要是把用户代码跑起来，`while True:` 就是烧 CPU 的死循环——实测顶层 `while True` 与 `print` 副作用都不触发）；② **每枪只报第一条错**——Python 的异常模型决定了 `compile()` 一次只抛一个 SyntaxError，不像 clang 有 `-ferror-limit` 连环报，这是语言口径不是缺陷；③ 运行时就绪判据是 `isPythonRuntimeReady()`（用过 Python 才在内存里），没用过就静默跳过、绝不为诊断下载。能抓的：语法级错（括号 / 冒号 / 缩进 / 非法字符）；**抓不到** `pritn(x)` 这类「语法对但名字不存在」的错——那是 pyflakes 档的活，Python 的 compile 只付语法这一段。实测（dev，headless）：坏代码 698ms 出线、缩进错 412ms、合法代码 985ms 清空；C++ 回归 740ms 出线无相互污染。另：排查时出现过「python 切 cpp 后旧标记残留 300ms」，那是探针手动调 `setModelLanguage` 制造的伪象——真实应用**没有任何 `setModelLanguage` 调用**，model 与语言一一对应、切文件即换 model，标记按 model 挂不跨文件泄漏，不需要清标记逻辑。
- **语法诊断的红线与列单位（2026-10-20 修，同一条链路）**：症状是 `solve();` 只在 `s` 下面出现一个字符宽的红线，VSCode 里则盖住整个标识符。两层成因：① **clang 的文本诊断只给「起始行列」**，结构化 range 是 clangd 的 JSON 才有，旧代码为「零宽区间看不见」补成 `endColumn: column + 1`，于是每条恒一列宽；现由 `tokenRangeAt` 按最小词法常识扩到整个词——标识符 / 数字 / 字符串字面量各自吃到自己的结尾，运算符 / 括号 / 分号保持单列，**列越界或落在空白上时也保持单列**（硬扩到前一个 token 上必然标错地方）。② 更严重的一层：**clang 的列是字节偏移**，Monaco 的列是 UTF-16 码元，行内有中文时整条红线右移甚至落到行外——实测 `    /* 中文注释 */ int a = ;` 里分号在第 24 列、clang 报 32（四个汉字各多 2 字节），现由 `byteColumnToChar` 换算；**Python 那条不换算**（`SyntaxError.offset` 本来就是字符列，同一行中文实测报 10 而非 14）。刻意**不用 `monaco.editor.tokenize`**：cpp 的 monarch 定义是懒加载的（`loader: () => import('./cpp.js')`），未加载时它把整行当成一个空 token，反而标满一整行。实测（dev，headless，读 marker 区间并回切源码核对）：`solve` 顶格 10:1-6 / 缩进 7:9-14、`int a = ;` 2:13-14 只标分号、中文行 2:24-25、Python `(` 3:12-13。⚠️ `solve()` 只划 `solve`、**不含调用括号**是对齐 clangd 的（clang 对 undeclared identifier 的 range 就是 DeclRefExpr 本身），别把它当没修完。
- **文件导入 / 导出（2026-10-12 加）：全平台都能导能出，但「写回本机目录」只有桌面端有**。导入文件 / 导入文件夹在**所有平台**都在（用浏览器自己的文件选择器，不碰任何权限）；导出是**恰好一个文件就直下那个文件、多文件或目录就打成一个 zip**。**两条桌面端独有的能力**别在文案里说成通用的：① **「导出到本机文件夹」**（走 Rust 的 `export_*` 命令，前端全无 fs / dialog 权限，见 14.O）；② **「导入整个文件夹」**（`input[webkitdirectory]`，安卓 / iOS 认不出来，移动端只能一个个挑文件）。四条口径：① 导入**只收文本** —— 二进制（含 NUL / 非法 UTF-8，判据同 Rust 的 `looks_binary`）与超过 5MB 的文件**跳过并在提示里报个数**，不报错、不中断；② **用户自己写的文件一个字都不会被覆盖** —— 重名一律排号成 `a-2.cpp`（与抓题导入同口径，见第 5 节坑 39）；③ 导入**保留文件夹结构**（选一个文件夹进来时顶层文件夹名与子目录层级都在）；④ zip 里的相对路径以**选区公共父目录**为根 —— 只选一个目录时，包里就是这个目录本身那一层。⑤ **从系统里拖文件进来**（2026-10-12 加）也是导入的一条入口：整页都是落点，指针压在资源管理器某一行上就落进那个目录（压着文件行 = 它所在的目录，与站内拖拽同口径）、别处一律**根目录**；**拖入期间侧栏自动撑开到最宽、停在资源管理器，让落点高亮有语境 —— 离开窗口或松手（无论导入成败）就原样还原**（原折叠状态 / 原页签 / 原宽度，App.vue 的 `previewDropTargetLayout`，2026-10-13 加，取代了最初的整页提示层 `PageDropOverlay.vue` —— 已删）；目标行 / 整棵树的亮与站内拖拽**同一套**（`FileExplorer` 里合流，树项只认一个信号）；**恰好一个文件时导入后顺手打开它**（拖文件夹或多个文件只导入不开页签，免得一下冒出几十个）；**导入成功弹一条全局通知、写明放到哪儿**（「已导入 N 个文件到 /P」，落根目录写「根目录」—— 侧栏已还原、屏幕上不再有落点痕迹，这句是唯一的交代；走 `notify`，不走资源管理器里的行内横幅，见 `announceImportInline` 的说明）。技术侧入口与上限见第 2 节的 `fileTransfer.js` / `zip.js`，手势与落点判定见 `composables/usePageDrop.js`，坑见第 5 节坑 42。

## 8. 验证方式

- **跑 `npm run verify` 前的两个前置**（只影响无头回归，`npm run dev` 不需要）：
  - **Node / npm 不在 PATH 里**就先补上，例如 `export PATH="/Users/hejie/.local/node-v22.23.3-darwin-arm64/bin:$PATH"`（按自己机器改路径）。
  - 脚本用 `puppeteer-core` 驱动 Chrome，默认候选是 `/Applications` 下那几个；本机没装就设 `CHROME_PATH` 指到 Chrome for Testing，例如 `CHROME_PATH="/Users/hejie/.cache/cft/chrome/mac_arm-154.0.8037.57/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"`。
- **静态审计 `npm run lint`（2026-10-31 加，零依赖、秒级）：改完样式或文案先跑它，比 `verify` 便宜得多。**
  两条脚本各自也能单跑：`npm run lint:css`（`scripts/lint-css.mjs`）、`npm run lint:text`（`scripts/lint-text.mjs`）。
  它们抓的是**构建与浏览器都不会报错、但规则/文案永远不会按本意生效**的那一类：选择器列表少逗号被粘成后代选择器、
  `html` 跑到非首段、`:hover` 漏闸门、写死十六进制颜色、圆角自创第四档、胶囊形、模板里的中文字面量。
  输出分两级：**错误**（结构上失效，退出码 1，必须清）与**提示**（§1 / §1.A 登记过的存量偏离，退出码 0）；
  加 `--strict` 时提示也算失败，适合以后接 CI。放行名单都在脚本顶部的常量里（`NO_HOVER_GATE` / `COLOR_OK_HEX` /
  `PILL_OK` / `RADIUS_OK` / `NO_RADIUS_CHECK`），**别在脚本里现贴一处例外**；单个文件/行要豁免就用行内 `lint-text-ok`。
  改判据本身时先自测：`node scripts/lint-css.mjs /tmp/样例目录` —— 拿几条「该报 / 不该报」的样例喂进去，
  确认没被改坏（第一版扫描器就出过「四条被粘成一条的选择器在它眼里全是单行、一条都没报」这种事）。
- 手工：`npm run dev`，浏览器 http://localhost:5199，重点看**两套主题各一遍**、面板折叠/展开、分隔条拖拽与单击折叠 / 展开（宽屏；窄屏上单击分隔条**应当无反应**），**且侧栏停靠左 / 右各试一遍** —— 分隔条热区的偏心要跟着换方向（见第 5 节坑 52：在右时热区不得压进侧栏，文件夹折角箭头那一带点得开）。
- 本地沙箱端到端（动过 `runnoSandbox.js` / `wasmRuntime.js` / 工具链目录后必做）：手工路径是打开设置页签（侧栏页头的齿轮图标）→「评测」组里选「本地 WASM 沙箱」→ 跑一段带 `vector` / `sort` 的 A+B，看输出对不对、同一份代码第二次跑是否秒回（编译缓存）。想自动化就临时写个 puppeteer 脚本，在页面上下文 `import('/src/services/runnoSandbox.js')` 后直接调 `preloadToolchain()` 和 `runCpp({ code, stdin })`——**用完删掉脚本**，仓库里不留临时探针（这条纪律之前踩过：残留探针把 `scripts/` 弄得很乱）。
- Python 专项（动过 `runPython` / 语言路由 / `python-3.11.3/` 目录后必做），同样临时探针、用完即删：手工路径是新建/打开一个 `.py` 文件（面板会自动切到 Python）→ 在设置里切「本地 WASM 沙箱」→ 运行，应看到 AC 且耗时在 100–200ms 量级；再补一条用例验证 `import` 同目录的另一个 `.py`（多文件路径）。自动化时在页面上下文 `import('/src/services/runnoSandbox.js')` 后直接调 `runPython({ code, entryPath, fs })`，注意 `fs` 是「路径 → `{ path, content, mode, timestamps }`」的映射，别直接塞裸字符串。
- PCH 专项（动过 PCH 段落 / `FRONTEND_ARGS` / PCH 源码后必做），同样临时探针、用完即删：
  1. DevTools → Application → IndexedDB 删 `cp-pch` 库、localStorage 删 `cp.pchUnsupported`，从零开始；
  2. 在设置里切「本地 WASM 沙箱」，点一次「运行全部」（默认模板是合法 A+B，输出应判定通过），随后 IndexedDB 的 `pch` store 应在约 1 秒内自己出现一条 id 形如 **`6:23.1.0:<指纹>`** 的记录（第 1 段是 `PCH_CACHE_VERSION`、第 2 段是内核版本。体积随头文件而变，别抄死某个字节数 —— 本文件历史上抄过 clang 8 档的 9,025,124，换代后全部作废）；
  3. 刷新页面再跑一次：编译应吃到存档（UI 每题耗时约从 600ms 降到 350ms 量级），输出与首次逐字一致；
  4. 降级：把那条记录的 `bytes` 改成任意垃圾字节再刷新运行，用户代码仍应正常通过，同时 `cp.pchUnsupported` 被置成**当前存档版本号**（`v6` 这种形态）、坏记录被删。
  注意：直接 `import` 模块做 A/B 时，无 PCH 基线要用「先置 `cp.pchUnsupported` 为当前 token（如 `v6`）」走真实降级分支，不要只是改参数——对比的必须是两条产品代码路径。置成裸 `true` 是不生效的，那正好是「换代后自动重试一次」的判据。
  **另一个探针陷阱（2026-10-19 踩过）**：dev server 会给模块依赖改写上 `?t=<时间戳>`（改过文件之后尤其如此），裸路径 `import('/src/services/runnoSandbox.js')` 拿到的是**另一份模块实例**——工具链、PCH 都装在那份里，而 `syntaxDiagnostics` 依赖的是 `?t=` 那份，于是 `isToolchainReady()` 在调度器眼里永远是假、诊断静默跳过，看起来像「改了没生效」。正确做法是从页面里 `fetch('/src/services/monaco/syntaxDiagnostics.js')` 取出它实际 import 的那个带 `?t=` 的 specifier，再按它 import。
- PWA / 离线专项（动过 `sw.js` / manifest / 图标 / 预缓存清单后必做），仍然临时探针、用完即删：
  1. `npm run build && npm run preview`（**必须是生产构建**，dev 下不注册 SW），DevTools → Application 应看到 manifest 无报错、Service Worker 已是 `activated`；
  2. Application → Cache Storage 应只有 `cp-shell-v6`（install 后约 19 条：预缓存清单 17 条 + `/` 与 `/index.html`，之后随页面用到字体等再增；2026-10-25 升 v6 之前这里写的是「约 100 条」，那是 Monaco 还没并进主包时的旧数字；**图标不在里面**，它们走网络 —— 见第 9 节）；`cp-toolchain` **install 之后不该存在**——要等真的跑过一次本地沙箱（该语言工具链被请求）才出现，且里面只会有用过的那个语言的文件；
  3. 在设置里切「本地 WASM 沙箱」跑一次「运行全部」，确认判定通过；
  4. DevTools → Network 勾 Offline（或直接拔网线），刷新页面：界面应正常渲染，再跑一次「运行全部」仍应通过——这一步才是真的在验工具链入了缓存，只看第 2 步的条数不够；
  5. 自动化同上一节：临时 puppeteer 脚本里用 `Page.getAppManifest` 拿 manifest 解析错误、用 `page.setOfflineMode(true)` 断网后跑一遍，跑完删脚本。
- 布局宽度专项（动过 `SidebarSwitcher.vue` / `EditorTabs.vue` / `.sidebar__head` / `.pane--tests` 下限后必做），临时探针、用完即删：在 1680 / 560 / 414 / 375 / 320 五档量四件事——（a）侧栏页头图标区（量 `.sidebar-switcher`，带标签 178px = 胶囊 148 + 间距 4 + 设置 26；紧凑 94px = 胶囊 64 + 4 + 26，侧栏宽 < 360 逻辑 px 进紧凑）都可见、且右缘不超页头右缘，（b）侧栏宽 / 页头宽（与第 3 节 2026-10-11 重测表逐像素比），（c）`documentElement.scrollWidth === innerWidth`（无横向溢出），（d）`.workspace` 的 `getBoundingClientRect().top === 0`（顶栏确实没了、工作区贴顶）。**只看有没有横向滚动条不够**：`.editor-tabs__strip` 自己会滚，真溢出反而被它吸收；要按第 3 节那个「必需宽度」公式自己算。2026-10-11 的实测表与结论记在第 3 节「无顶栏后的两条宽度线」。
- 触屏拖拽专项（动过 `useTabDrag.js` / `useTreeDrag.js` / `EditorTabs.vue` / `FileTreeItem.vue` 的手势段后必做），临时探针、用完即删。**先接受一件事：本机无头 Chrome 验不了真机手势**（见坑 30），所以这里分「能验的」与「必须靠真机 / 合成事件补的」两半，绿不等于真机通过：
  1. 起一个 `hasTouch: true` 的 page + `Emulation.setTouchEmulationEnabled({ enabled: true, maxTouchPoints: 1 })`，手势全走 CDP `Input.dispatchTouchEvent`（`touchStart` → 等 560ms → 若干 `touchMove` → `touchEnd`）。⚠️ **坐标必须在每次手势前重新量**：滚动过一屏之后旧几何会落到条带外面，起手点跑到别的元素上，整场结论作废（这坑当场踩过）；起手只挑「完整落在可视区内」的页签。⚠️ 快滑之后有一条**惯性滚动尾巴**，下一个场景开始前先等 ~900ms，否则会把那段漂移误判成「长按期间条带被滚了」。
  2. 四条要覆盖：**短滑（不等待）= 条带滚动 + 顺序不变**（守住「没 armed 时不拦滚动」这条）、**长按 560ms 后横拖 = 顺序改变 + 落盘 `cp.openTabs` + 条带 `scrollLeft` 不动**、**长按后原地松手 = 什么都不发生**、**快速轻点 = 照旧切换页签**（守住补的两个监听器没把点击吃掉）。
  3. 探针测不到的那半用「派发合成事件」补（见坑 30）：按压期间 `cancelable` 的 `contextmenu` 应被 `preventDefault`；`touchmove` 在 armed **之前**应 `false`、armed **之后**应 `true`；松手后两者都回到 `false`。日志里要给自己的合成事件**打标记并排除**，否则「异常事件」清单会被自己污染。
  4. 两段反馈要验「看得出来」而不是「类名挂上了」：读 `backgroundColor` 在 t≈16 / 230 / 540ms 三个点 —— 中途必须**严格停在起止色之间**（非活跃页签看 alpha 递增；**活跃页签起点是不透明的 `--bg-tab-active`，alpha 恒为 1、只有 RGB 在插值**，这时要自己算插值进度 t，别照抄 alpha 那套断言）；就绪帧的 `animationName` 只比**前缀** `tab-press-pop`（Vue 会按 scope 给 `@keyframes` 改名成 `tab-press-pop-xxxxxxxx`）。
  5. 页面侧要同时断言静态声明：`getComputedStyle(item).touchAction === 'pan-x'`、`userSelect === 'none'`。**`-webkit-touch-callout` 读不到** —— Chrome 的 CSS 解析器会直接丢掉这个 Safari 专属属性（`cssRules` 里也没有），要验它只能扫**源码**或扫**构建产物的 CSS**（`npx vite build --outDir /tmp/xxx` 之后在 `assets/*.css` 里搜），别把它当成「没生效」。
- 编辑器触屏手势专项（动过 `useEditorMenu.js` / `EditorPane.vue` 的手势段 / `ContextMenu.vue` 后必做），临时探针、用完即删。要用 **Android 手机 UA**（Monaco 只有在 `isIOS || (isAndroid && isMobile)` 时才走 `PointerEventHandler` 那条分支）+ `hasTouch` 视口 + CDP `Input.dispatchTouchEvent`。要覆盖：长按 600ms 落在**词上** → `editor.getSelection()` 等于那个词 + 自绘菜单出现 + Monaco 内置菜单没弹；长按 200ms（不到阈值）→ 不弹；长按期间滑动 70px → 不弹（当滚动）；双击 → 仍选词、且不弹我们的菜单；长按**空白处** → 无选区但菜单照弹、「剪切 / 复制」置灰；全选之后长按选区内 → 保持原选区；桌面右键 → 英文界面下是 `Cut/Copy/Paste/Select All`，点「Select All」真的全选。⚠️ 三条判据坑：**判「选没选中」必须拿真 editor 实例**（`await import('/@id/monaco-editor')` → `editor.getEditors()[0].getSelection()`），读 DOM 的 `.selected-text` 拿不到东西，会得到「怎么弄都没选中」的假结论；**落点要用 `Range.getBoundingClientRect()` 精确点到某个字母上**，点在括号 / 空白上时 `getWordAtPosition` 返回 null，双击看起来也像「没选词」；**「空白处」的坐标要夹在 `.editor-pane__host` 内**——`.view-line` 比容器宽，直接取它的右缘会落到编辑器外面、手势压根不会触发（三条都是本次当场踩的）。
- 选区手柄专项（动过 `useSelectionHandles.js` / `EditorPane.vue` 的手柄层与样式 / `ContextMenu.vue` 后必做），临时探针、用完即删。起法与上一条同款（Android 手机 UA + `hasTouch` 视口 + CDP 触摸），**两套主题各跑一遍**。要覆盖的九组：
  1. 触摸轻点编辑器建立「最近一次指针是触摸」→ 程序化设一段跨行选区 → 手柄层出现、两颗都在、盒子正好 44×44；
  2. 几何（判据要**独立于实现**，别把 `place()` 的公式抄进断言）：起点盒的**下边** = `stageTop + getScrolledVisiblePosition(选区起点).top`，终点盒的**上边** = 该端 `top + height`；两颗盒子的**水平中点**分别对齐各自端点的列；起点圆点在锚点之上、终点圆点在锚点之下；两盒都不压住被选中的行；
  3. 圆点计算值 `background-color` = 本主题的 `--accent`（`--accent` 得先 hex→rgb 归一化再比，见第 7 节那条）；
  4. `document.elementFromPoint(圆点中心)` 命中的是手柄自己（证明浮层压在编辑器之上、且真的可点）；
  5. **拖终点**：用 `getScrolledVisiblePosition({lineNumber, column})` 反算目标点的 client 坐标，`touchStart` 在圆点上 → 两次 `touchMove` → `touchEnd`；断言终点落到目标行列（±1 列）、**起点钉住不动**、拖动中与松手后手柄都在；
  6. **拖起点**：同上，断言起点动、终点钉住；
  7. **小幅拖动**（真机微调是常态）：位移 ~24px 也要跟手，同时打印 `pointermove` 的计数 —— 计数为 1 而选区没变，通常是「落点没跨过字符格」，不是坏；
  8. **拖回首行**（卡死 bug 的靶子，见坑 32）：起点手柄往上拖一行时落点会落在手柄自己的盒子里，必须断言**拖动前**该点被 `selection-handle` 挡住且 `getTargetAtClientPoint` 返回 `position: null`（复现条件），**拖动中**浮层带 `is-dragging`、手柄 `pointer-events === 'none'`、该点已能看穿到 `span.mtk*`，**拖动后**选区起点真的到 1 行 1 列；
  9. 边缘自动滚动（先把 model 换成 300 行才有得滚）：拖终点越过下边缘并**停住不放** ~520ms，`getScrollTop()` 必须明显增大且终点行号继续变大；另外三条闸门：空选区无手柄、鼠标点过编辑器之后手柄不再出现（再触摸一次要回来）、打开设置视图时手柄层收掉。
  出图用 `clip` 裁到选区附近（整页图里这两颗点太小看不出朝向），两套主题各一张。
- 右键菜单专项（动过 `ContextMenu.vue` / `base.css` 的 `--menu-*` / `useEditorMenu.js` 后必做），临时探针、用完即删。两处入口都要覆盖（文件树右键 + 编辑区右键），两套主题各测一遍：读 `.context-menu` 与 `.context-menu__item` 的**计算值**（底色 / 描边 / 圆角 / 最小宽 / 内边距 / 条目内边距 / 条目圆角必须为 0）与**悬停态**（`page.mouse.move` 到某个条目上再读 `backgroundColor`，等 0.1s 过渡走完），并断言它们分别等于 `getComputedStyle(document.documentElement)` 里那组 `--menu-*`。**弹开动效要"看它真的播了"，不能只断言 `animationName`**：在右键**之前**起一个 `requestAnimationFrame` 循环逐帧记 `opacity`，菜单出现后应当从 ~0 爬升到 1（本次实测 `0 → 0.22 → 0.58 → 0.80 → 0.93 → 0.98 → 1`），⚠️ 断言 `animationName` 只比**前缀** `context-menu-in`（Vue 会按 scope 改名成 `context-menu-in-xxxxxxxx`）。⚠️ 两个当场踩的坑：① **`page.screenshot` 默认 `captureBeyondViewport: true`，会临时改视口 → 触发 `resize` → 菜单自己的 `window resize` 监听把它关掉**，表现是"截图之后菜单就没了、后面所有断言全部报 `undefined`"，探测里必须写 `captureBeyondViewport: false`（或每次截图后重新打开）；② 站内**没有任何菜单带 `divider`**，`--menu-separator` 与 `.context-menu__divider` 那两条规则在页面上量不到，只能读编译后的 `cssRules` 文本 + 令牌值来定值（会看到 `0.375rem 0.625rem`，那是 px→rem 之后的形态）。分隔线的**真实可见度**因此至今没有实拍证据。⚠️ 第三个坑：**菜单一打开就在播 `context-menu-in`（`transform: scale(0.95) → 1`），而 `getBoundingClientRect()` 会把变形算进去** —— `waitForSelector('.context-menu--ready')` 一返回就量，菜单宽会是 **209** 而不是 220（= 220 × 0.95）、条目高 30 会读成 28.5，两个数都「看着像对的」，最容易被误读成「和模板对不上」。**要么等 ~250ms、要么等 `animationend` 再量**。用户给的那份模板 HTML 同样如此（它静态就带 `transform: scale(0.95)`，只有加上 `.active` 才回到 1，量模板也要等）。另有一个省事口径：**要量字体本身的天然行高，别反复调菜单**，直接在页面里插一个不可见合成元素 —— `position:absolute;left:-9999px;font-size:13px;line-height:normal` 的 div，分别塞中文与拉丁字，一次拿到两种语言的行盒（本次实测 18 / 16，正是条目 30 / 28 的来源）；量完 `remove()` 掉即可。
- 插件抓题专项（动过 `problemImport.js` / `useCompanionBridge.js` / `useCompanionImport.js` / 落盘结构后必做），临时探针、用完即删。**不必真装扩展**——在页面上下文直接 `window.postMessage({ source: 'competitive-companion', type: 'cp-task', taskId: 't1', payload: JSON.stringify(task) }, location.origin)` 就能走完整条链路（`event.source` 与 `event.origin` 两道校验都能过）。要覆盖的九件事：
  1. 首次导入后树里出现 `<年月> / <OJ 标签> / 未分类 / <题名>.cpp` 这一条链（中间几层是归类用的，**不是**「题名」那一层目录），且该目录里**只有这一个文件**（题目信息与样例挂在节点上，不会再冒出第二个条目）；
  2. 底层数据在：`(await vfs.stat(path)).meta` 有 `url` / `oj` / `date` / `timeLimit`，`.config` 里能读到 `tests`；
  3. 往代码文件里写入 `// my solution` 再重抓同一道题 → 正文**原样保留**、样例换成新的；
  4. 评测面板的用例是**整体替换**而不是追加（第 3 条之后卡片数应等于新题目的样例数）；
  5. 同一个 `url` 换个题目名重抓 → 仍落在**同一个文件**上（按 url **全库**认题，哪怕算出来的新路径不同）；`url` 不同但题名相同 → 另起 `<题名>-2.cpp`；
  6. 抓完后编辑器打开的是这道题的代码文件（`.editor-tabs__item--active` 与 `workspace.activeId` 对得上）。
  7. **重抓时本次没带样例**（抽题面板 / 比赛导入的形态，`tests: []`）→ 已有样例**不许被冲成空数组**（2026-10-19 加的保护：那不是「刷新」而是白抓一趟）；
  8. `importProblem(task, { quiet: true })` → 落库但不切页签、不 `deactivateViews`（判据：`workspace.activeId` 与当前合成视图都没变）；
  9. 整场抓样例（2026-10-19 加）：**不必真装新版扩展**，注入一个假扩展应答即可 —— 收到 `cp-ping` 回 `cp-info`（`capabilities` 含 `contest-batch`）→ 收到 `cp-scrape-contest` 就投 7 条 `cp-task`（`payload` 是**字符串**，不是 `{ message }` 对象；写成对象会被 `dispatchTask` 的 `typeof data.payload !== 'string'` 静默丢掉）→ 再回 `cp-scrape-contest-done`。断言：按钮出现、请求的是 `/contest/{id}/problems`、7 道都带样例、比赛页签仍在前台（2026-10-19 晚起看板是独立页签 `cfContest`，不再是抽题面板）。
  写这个探针时踩过两个坑，别再踩：**（a）** 点树上的箭头展开目录时，只点 `.tree-item__row[aria-expanded="false"]`——`.tree-item__arrow` 这个 span 在**每一行**都有（文件行的箭头是空的），而点击处理挂在父级 `.tree-item__row` 上，所以「点所有箭头」实际会把每个文件都 `openFile` 一遍，最后点到的文件抢走 `activeId`，断言就会误报「打开的标题不对」；**（b）** 动态 `import('/src/services/…')` 拿到的可能是**另一个空实例**——Vite dev 给源码模块 URL 加了 `?t=<时间戳>`，裸路径 import 与 app 真正加载的那份不是同一个模块（症状是 `workspace.tree.length === 0` 但界面明明渲染出来了）。正确姿势是用 `performance.getEntriesByType('resource')` 找到 app 真实加载过的那条 URL 再 import。
- 快捷键专项（动过 `useShortcutManager.js` / `HotkeyRecorder.vue` / `App.vue` 的 `onKeydown` 后必做），临时探针、用完即删：设置视图 →「快捷键」→ 点某个动作的录制框 → 按 `Mod+Shift+KeyB` 这类组合应写入并回显；再录一个**已被占用**的组合应停在录制态、出现红字且**不写入**（这就是「阻止绑定」）；录 `Mod+KeyW` 这类浏览器原生键应被红字拒绝；刷新页面绑定仍在（`localStorage['cp.shortcuts']`）。最后验真正触发：光标放进 Monaco，按 `Mod+Enter` 应跑全部用例（说明捕获阶段确实抢在 Monaco 前面），按 `Mod+Shift+KeyE` 应翻到另一个侧栏面板（等价于点页头那枚胶囊）；开录状态下按同一个键**不应**触发功能。
- 界面双语专项（动过 `src/i18n/` 任一文件 / 任何含 `t()` 的组件或 service 后必做），临时探针、用完即删。四条要覆盖：
  1. **跟随浏览器**：第 0 帧不种任何存档，用 `--lang=zh-CN` 与 `--lang=en-US` 各起一次 Chrome，前者应中文 + `<html lang="zh-CN">`，后者应英文 + `<html lang="en">`，且**两种情况下都不写 `cp.uiLocale`**（跟随探测不等于用户显式选择）；
  2. **存档覆盖探测**：种 `cp.uiLocale = 'en'` 配中文浏览器 → 应英文；种 `zh-CN` 配英文浏览器 → 应中文；
  3. **切换当场生效 + 落盘**：设置视图「外观」组的「界面语言」下拉切一下，**同一 document 内不重载**就应看到目录里每一项（分组大标题 + 各组小标题）全变、`html lang` 跟着变、`localStorage['cp.uiLocale']` 落成 `"en"`。**顺带验「数据表存 key」这条设计**：编辑器组里数据表驱动的行（`Font family` / `Minimap` / `Padding`）也必须跟着变——只验目录项验不出坑 28 第 1 条；
  4. **英文下的超长样例**（守住坑 26 × 坑 28 的交叉）：**框内那个 `……` 不翻译**（语言无关常量，见坑 26），只有框下面那行走 `t()` —— 英文是 `{n} characters not shown`；且**改语言后「选中省略行 = 选中被省略内容」依然生效**（按第 8 节的合成 `ClipboardEvent` 法测，`clipboardData` 是只读 null，要 `Object.defineProperty`）。最后截两套主题各一张图**真的看一眼**。
  探针注意：**同一个 browser 里 localStorage 跨页共享**，每一组用例前都要先 `localStorage.clear()`，否则前一组种下的 `cp.uiLocale` 会污染后面所有页面（实测踩过，表现是一整组假失败）；无头 Chrome 里 `navigator.clipboard.readText()` 恒返回空串，别拿它当断言。
- guide 双语专项（动过任一版 guide / `guide.css` / `sitemap.xml` 后必做），临时探针、用完即删。**机械可复核的四条**：两页都跑一遍，断言 ① `html lang` 各是 `zh-CN` / `en`；② `canonical` 各指向自己、两页都恰好有三条 `link[rel=alternate][hreflang]`；③ **h2 数 = 目录条目数 = 12**（这条是「两版没走偏」的廉价判据，改了章节数记得同步改期望值）；④ 页头 `.page__top-actions` 里 `.lang-link` 的 `href` / `hreflang` / `lang` 三属性。
  再加两条容易忽略的：**页头加了这颗链接之后不许换行**——断言 `.page__top` 高度 < 70px、`.brand` 与 `.page__top-actions` 的 `top` 差 < 6px、`documentElement.scrollWidth === clientWidth`；以及**英文页的表格**（英文文案比中文长约 30%）在 1400px 与 700px 两档下 `.table-wrap` 的 `scrollWidth === clientWidth`、表头没被压到换行（表头是 `white-space: nowrap`，真挤不下会直接溢出容器）。两档都要截元素级截图看一眼——页面级「无横向溢出」不会告诉你表格自己在容器里滚。
- 题解专项（动过 `mdView.js` / `mdFormat.js` / `mdRenderer.js` / `mdRuntime.js` / `MarkdownPreview.vue` / EditorPane 的题解段后必做），临时探针、用完即删。`npm run verify` 的 **H 步**（2026-09-30 加）只钉静态的那几条（`.md` 下工具栏与字数出现、状态栏消失、运行入口禁用、**⌘B 在 `.md` 里是加粗、在 `main.cpp` 里仍是收侧栏**），**渲染正确性仍然要人看**：
  1. 树里点开 `.md`（新建时模板就是题解骨架）→ 工具栏出现、右端两块统计（字数 / 行数，数字与单位各就位）有数、底部状态栏消失；
  2. 切「双栏」——未下载时会先看到「下载渲染器」入口（不是空白页）→ 点它，进度按 `(当前/总数)` 走 → 下完当场渲染；
  3. 写一段含 `$E=mc^2$`、`$$…$$`、表格、任务列表、删除线、`<script>alert(1)</script>` 的正文：公式要变成公式、表格要成表、`<script>` 要被洗掉（**不许**弹出来）——这一条是渲染管线的唯一验收点；
  4. 滚动同步：在编辑器里滚，预览跟着滚；把预览滚到底再继续打字，位置**不该跳回顶部**（`lastRatio` 那一条）；
  5. `Mod+\` 四态轮换（仅编辑 → 双栏 → 仅预览 → 仅编辑；最后一步在「仅预览」下按得动，就是它当初搬去全局监听的原因）；全屏按钮收掉侧栏与页签栏、`Esc` 退出且**模式不变**；
  6. 设置视图「应用 › 本地运行环境」卸载渲染器 → 回预览应重新显示「去下载」入口，控制台不该有 `MD_RUNTIME_MISSING` 之外的报错。
  探针注意：VFS model 的 uri 是 `vfs://file/<uuid>`，**认不出文件名**，要读编辑器内容就用 `monaco.editor.getEditors()[0].getValue()`；动态 `import('/src/services/…')` 在 dev 下可能拿到另一个空实例（见插件那节的两个坑）。
- 文件导入 / 导出专项（动过 `fileTransfer.js` / `zip.js` / `FileExplorer.vue` 的导入导出段 / `treeOps.js` 的 `uniqueNameIn`·`pruneNestedNodes` / `workspace.rs` 的导出段后必做），临时探针、用完即删。2026-10-12 实测 **38 项全绿**，覆盖这些判据（**都是探针自己造真文件走完整条链路**，不是只调函数）：
  1. **页头两颗按钮**（新建文件 / 新建文件夹 —— 原先在左的「导入文件 / 导入文件夹」2026-10-12 已删，导入只剩目录右键菜单这一处入口）+ 目录右键菜单的顺序（新建文件 / 新建文件夹 / 导入文件 / 导入文件夹 / **分隔线** / 导出）；**文件节点的菜单里没有「导入文件」**（那是目录才有的事）；
  2. **导入文件**：三个文本文件进树、**二进制被跳过且提示里报数**（样本要够脏：含 `0x00` 或截断的非法 UTF-8 —— 只塞高位字节如 `0xFF` 会被 `TextDecoder` 当合法字符收下）、导入正文逐字正确；
  3. **重名一律排号、绝不覆盖**：往同一目录再导一份 `a.cpp` → 树里出现 `a-2.cpp`、原来的 `a.cpp` 正文**一个字没动**。⚠️ **排号函数要单独在干净子目录里验** —— 直接拿根目录当靶子会被「上一步自己造出的 `a-2.cpp`」干扰，断言当场假红（本次踩过）。正确姿势：`createDirectory('/dup')` + `createFile('/dup/x.cpp')` 之后再问 `uniqueNameIn(vfs, '/dup', 'x.cpp')`，期望 `x-2.cpp`；顺带验不撞名时原样返回；
  4. **文件夹导入**：`webkitRelativePath` 要**手动 `Object.defineProperty` 造**（`accept()` 喂进去的 `File` 没有这个属性，正好顺带走通「退化成单级文件名」那条分支）；断言顶层文件夹名与子目录层级都在、模型里查得到 `/dirs/chapter1/a.cpp`、展开后 DOM 里出现 `chapter1` 那一层；
  5. **⌘/Ctrl+A = 全选焦点所在父文件夹里的内容**：先展开一个装着子文件的目录、单击其中一行（焦点与主选中都落在这行上），按 `⌘A` —— 选区应恰好等于**该目录里的全部内容**（含再往下每一层子目录里的文件，`folderContentIds()` 的递归口径；不含顶层节点），主选中不变；再把**指针停在树的空白处**按 `⌘A` —— 空白处读作「焦点在根上」，选区应是**整棵树**。补一条**目录折叠起来时**的对照（这步直接验的就是本次改的口径）：把装着子文件的目录折起来，⌘A 仍要选中里面**看不见**的子项。桌面端这条的判据是**指针在哪一块**（点开文件时焦点会被 EditorPane 抢进 Monaco，见第 5 节坑 41）：所以还要补一组同一 DOM 焦点、只挪指针的对照 —— 指针在编辑区里时 `⌘A` 必须是编辑器自己的「全选代码」、树上选区一动不动。随后单击收成单选；
  6. **单文件直下**：恰好选中一个文件时落下来的必须是 `text/plain` 的**那个文件本体**（不是 zip）、内容一致、提示里带文件名；
  7. **目录打 zip**：截获 `window.__blobs` 里那份 `Blob` 存成文件，**用 `unzip -t` 核 CRC**（只解出一个文件不算过 —— 包里说「CRC 对得上」才是真过），再断言条目带目录名那一层与嵌套路径、解出的正文逐字正确；
  8. **跨目录多选保留相对结构**：同时选中根下 `a.cpp` 与 `dirs/`，zip 里应是 `a.cpp` + `dirs/` + `dirs/chapter1/` + `dirs/chapter1/a.cpp`（公共父目录 = 根，两条各自成一条）；此时右键菜单那一项要报数「导出 2 项」；
  9. **读不出内容时不产出空 zip**：只选一个空目录 → `files === 0`，但仍保留目录自身那一个条目；
  10. **界面现场**：收尾断言页头那两颗按钮（新建文件 / 新建文件夹）没卡在 `busy`（`disabled`）。
  11. **从系统拖入**（2026-10-12 加，2026-10-13 改判据 —— 提示层已删、换成「侧栏临时撑开」+ 全局通知；动过 `usePageDrop.js` / `fileTransfer.js` 的 `readDroppedItems` / `FileExplorer.vue` 的合流高亮 / App.vue 的 `previewDropTargetLayout` 后必做）：合成 `DragEvent` + `new DataTransfer()`（`items.add(new File(...))` 就够 —— 合成条目的 `webkitGetAsEntry()` 恒为 null，正好走通「退回 files」那条分支；**目录递归那条分支探针验不动**，要验就把假的 `FileSystemEntry`（含 `createReader`）直接喂给 `readDroppedItems`，顺带验「分批 100 条要读到空」）。判据：dragover 必须 `preventDefault`（否则浏览器不认落点、drop 永远不来）、drop 必须 `preventDefault`（否则整页跳去打开那个文件）；**dragenter 之后下一帧落点要重算一次**（`reflowTarget` —— 那一刻侧栏还没撑开，`elementFromPoint` 量到的是旧布局，不重算高亮就不亮）；拖入期间断言三件事：资源管理器面板可见、`cp.editorShare` 变 24（面板撑到最宽 ~76%）、`.drop-veil` 不存在；拖出窗口（`window` 上补一发 `dragleave`）→ 三样全部还原（含面板页签）；拖到编辑区松手 → 落进根目录且通知写「根目录」、拖到目录行松手 → 落进那个目录、那一行亮 `tree-item__row--drop` 且通知写出该路径；单个文件松手 → 落进目标目录**并自动开页签**、两个文件 → 都落进根目录**不开页签**；拖一段纯文本 → 侧栏状态一点不动、资源管理器那一侧不 `preventDefault`；读通知要**按标题过滤**（`.notif` 里还可能有开机那条「安装为应用」的安装引导通知，直接取第一条会读错对象）；Esc → 侧栏还原。
  探针写法照 `wasm-oj-browser-probe` 那套：脚本放 `/tmp`（**仓库不留脚本**）、`puppeteer-core` 用绝对路径 import、**端口随机**（崩溃残留的 dev server 会占住固定端口，`--strictPort` 下直接 exit 1）、输出**同步** `fs.appendFileSync` 进日志文件（前台被 SIGTERM 时也不丢），并**在 `server.kill()` 之后 await 它的 `exit` 事件**再 `process.exit`。菜单类的场景每次开始前先按 `Esc` + 点树空白（`clickBlank()`）把选中收回根，否则上一条留下的菜单 / 选中会让落点跑偏。
- 抽题成功通知专项（2026-10-13 加；动过 `composables/useCfPicker.js` 的 `run()` 或 `cf.js` 的 `cf.picker.notif` 后必做），临时探针、用完即删。**行为**：点「开始抽取 / 换一批」跑完且结果非空 → 发一条 `success` 通知（标题 `cf.picker.notif.title` = 「抽取成功」/「Pick finished」，正文**复用**结果区抬头那句 `cf.picker.result.count` = 「抽中 N 道题」，5s 自动收）；**抽题页签已经被切走时也照发**（抽题非阻塞：题库首次要下约 2MB、勾了「排除已通过的题」还要多走一趟 `user.status`，用户多半切回文件页签等）；被拦下的抽取（下限 > 上限 / 没填账号 / `NO_MATCH`）**不发**。探针两条要注意的：
  - **等组件就绪别等 `.sidebar-switcher__tab`** —— 齿轮那颗恒在，等它会「秒就绪」，而抽题那颗要 `cfReady`（题库下载完）才渲染。判据是页头里有没有 `title` 含 `Codeforces` 的那颗（两套语言都有这个词），点它也一样按 title 找。
  - **要验的正是「页签已切走」那一态**：点完「抽取」**立刻点回第一颗文件页签**，再等通知出现 —— 抽题面板是 `v-show`，`.cf-result` 与通知都在 DOM 里，两边的条数（`cf.picker.result.count` 的 N 与 `.cf-result` 的个数）可以直接对。无头 Chrome 默认 `en-US`，验中文文案要先种 `cp.uiLocale = '"zh-CN"'`。
- 无头回归：`scripts/verify-ui.mjs`（`npm run verify`）。**基线是 A/B/C/D/F 绿，E/G/H 红且是既有失败（2026-10-12 复核），别顺手去修**，跑之前先知道这几条：
  - **A 步（2026-10-12 复核）稳定绿**：脚本现在先 `waitForFunction` 等 `.view-line` 行数 > 3（即 `/main.cpp` 真的被打开、正文画进 Monaco）再往下探，早前「探针在 model 绘出行前抓到 `editorText: ""` / `codeLineCount: 1`」的竞态**已不复现**，旧描述作废。仍然成立的两条：断言**别把行数写死**（行数随模板改而变）；A 步真正在守的契约是 `tabs === ['切换到评测样例','设置']`（胶囊那颗写的是去向）、`segIds === ['explorer','tests']`（两段都渲染出来了）、`sidebarSegActive === ['tests']`（胶囊填亮的段，读 `data-current`）与 `sidebarPanel === 'tests'`。
  - **E/G/H 的失败签名（2026-10-12 实测）同指一处——「把侧栏折叠回来」这个动作在探针里不再生效**：E 与 G 都靠 `clickSplitter`（合成 `pointerdown` 打在 `.splitter` 上 + `pointerup` 冒泡到 window、中间不带位移）折叠侧栏，两处 `collapsed` 都量到 `false`（其余部分是好的：G 的 `tests → explorer → tests` 面板切换照常走通，E 的运行、亮结果、判题链路也照常跑）。H 的断言里工具栏 / 字数统计 / 状态栏收掉 / 运行闸门 / ⌘B 加粗**全过**，失败点只剩末段「回 `.cpp` 按 ⌘B 收侧栏」（`cppSidebarCollapsed`——详情打印被 `slice(0, 460)` 截断，量不到值）。E 详情里的 WA 徽标**不是失败断言**：空样例喂给含 `cin >>` 的模板是 UB，输出垃圾值（实测 `7904`）很正常，别被它带偏去查判题。
  - **B 步（切布局）走的是「设置页签」这条路**（2026-09 改）：点侧栏页头那颗 `aria-label === '设置'` 的 `.sidebar-switcher__tab`（它落在**当前可见的那个 `.sidebar__panel`** 里；`textContent` 是空的，认 `aria-label`）。⚠️ **2026-10-11 起这一步是两步**：齿轮先弹 Quick Settings 菜单，再由菜单里「打开设置面板…」那一行开出页签 —— 齿轮本身不再直接开页签，那一次 `click()` 之后必须再从 `.settings-menu__row` 里点一次。分类也不在一级里了：它们在「设置分类」的二级（`.settings-menu__sub .settings-menu__item--sub`），且**选完连菜单一起收**，所以逐项点开时每次都要重开菜单（齿轮是 toggle，先按一次把状态归零再开，否则这一下是「关」）。→ 断言编辑区里 `.settings-view` 真显示、`.editor-tabs__item--active` 落在含「设置」的那个页签上、`!document.querySelector('.topbar')` 且 `.workspace` 贴顶、目录那一段（2026-10-01 改成行为断言）：**不再「数人头」**，而是挨个点开每一项，要求 `aria-current` 落在它身上、`.settings-view section.setting-group` 恰好 1 个（8 个分类是 `v-else-if` 互斥的）、且内容区文本非空——**加删分类不用再改脚本**（这段原来写死 `navItems === 8`，后来涨到 10，每次加分类都先把回归搞红）。同一段仍会随手记下 `navItems` 的实际值放进 detail 里，只作观察、不作断言。 → **点目录里的「外观」**（设置是「目录 + 内容」两栏，默认停在「外观」，右侧只渲染当前那一组；这一步仍显式点一下，默认分类以后再变也不坏）→ 在页签里选「右侧」（2026-09-28 起面板默认在**左**，所以这一步反过来选「右侧」）→ 点 `.editor-tabs__close[aria-label="关闭设置"]` 关掉 → 断言设置视图与设置页签一起消失。设置仍是 `v-show` 的视图、不是抽屉，所以「Monaco 实例不重建」的老断言（`data-marker`）照样成立。
  - **F 步（Python 模板与判题语言）走的是「资源管理器 → 点 main.py」这条路**（2026-09 改）：顶栏语言下拉已移除，语言只跟活跃文件的扩展名走。所以步骤是——先把面板切回「资源管理器」（用脚本里的 `showPanel(page, 'explorer')`，它点胶囊那颗 toggle；先判当前面板不是目标再点，否则会翻过头。该 helper 必须把 `page` 当参数传进来，`const page` 在 `try {}` 块里，模块级函数直接引用会 `page is not defined`）→ DOM click 标签为 `main.py` 的 `.tree-item__row` → 断言 `.view-lines` 文本（NBSP 已归一）含 `def solve`、`.editor-tabs__item--active` 是 `main.py`、动态 `import('/src/services/vfs/workspaceStore.js')` 后 `activeLanguage === 'python'` 且 `activeNode.path === '/main.py'`、`[...document.querySelectorAll('select')].every((el) => !!el.closest('.settings-view'))`（钉住「顶栏语言下拉不会复活」——现在全站只剩设置视图里那几个原生下拉）。
  - F 步曾长期误报：断言切到 Python 后 `.view-lines` 文本含 `def solve`，而 Monaco 把空格渲染成 NBSP（第 5 节坑 2），`includes('def solve')` **永远匹配不上**——已修（断言前把 `\u00a0` 归一成空格），现在过。这条 NBSP 归一化仍在用，别退回直接 `includes`。对照 A 步的 `includes('include')` 因为不含空格，从来没被这条绊到。
  - 它自己起 dev server。**端口由脚本自己挑空闲的**（`freePort()` 监听 `:0` 拿一个再用 `--strictPort` 起 Vite，2026-10-01 改），所以常驻的 `npm run dev` 不会再撞车；只有想固定端口时才给 `VERIFY_PORT=<端口>`，这时撞上仍会直接退出。
  - **写探针时别用 `page.$('.xxx')` / `page.click('.xxx')` 去碰页头里的东西**：它们抓的是**文档里第一个**匹配，而侧栏那两个面板是 `v-show` 双份 DOM，第一个多半落在被藏起来的那个面板里。症状是 `Node is either not clickable or not an Element`（`page.click`）或截图报 `Node is either not visible`（`ElementHandle.screenshot`）。正确姿势：先用 `[...document.querySelectorAll('.sidebar__panel')].find((el) => el.getClientRects().length > 0)` 拿到可见面板，再在它里面 `querySelector`，要真点就用 `page.mouse.click(x, y)` 打真实坐标（2026-09-28 一天里踩了两次）。
  - 它跑的是**默认引擎 = 本地 wasm 沙箱**（`DEFAULT_ENGINE_ID = wasmEngine.id`，不需要任何外部服务），所以 **E 步是「真评测」不是空过**：跑不通就是真红（现在正是如此，见上面 E/G/H 那条）。早前「默认 Piston 引擎、E 步空过、验不到本地沙箱」的描述已作废——**别按它把 E 的红当引擎连不上的噪音**。
  - **E 步同时守「开跑必亮结果」**（见第 3 节）：跑之前先把侧栏切回「资源管理器」再双击分隔条折叠，然后**按 `⌘/Ctrl + Enter`**（2026-09-28 起，页签栏那颗运行按钮删掉后 E 步改走快捷键——此刻侧栏正折叠着，页脚那颗 ▶ 是 `display: none` 点不到的，正好顺带守住「侧栏收起时快捷键照样能跑」），收尾断言 `.pane--tests` 又可见、且当前面板是「评测样例」（`collapsedBeforeRun` / `revealedAfterRun` 两个字段；后者看的是 `.sidebar__panel[data-panel] === 'tests'`，不再是 `is-active` 高亮）。顺序不能反——折叠后整栏 `display: none`，页头那几颗切换图标就点不到了。这一改让 E 收尾时侧栏停在「评测样例」，F 步本来就会自己切回「资源管理器」，两边不冲突。修饰键按平台取（`process.platform === 'darwin' ? 'Meta' : 'Control'`，与 `useShortcutManager` 的 `IS_MAC` 同口径）。
  - 2026-09 修掉的三处**恒假断言**（探针自己写错，别再踩）：偏好存的是 JSON 字符串（`"left"`）必须 `JSON.parse` 才能比；`.minimap` 节点常驻 DOM（宽度 0），可见性只能看渲染宽度；D 步拖拽方向要按当前 `flexDirection` 推导——前序 B/C 已把面板切到右侧，写死向左会让测试栏反向变宽。
  - **A / B / C 三步把「面板默认在哪一侧」写进了断言**（A 断言 `storedPanel === 'left'` 首屏默认、B 选「右侧」并断言 `testsPane.x > editorPane.x`、C 断言刷新后仍是 `'right'`）。2026-09-28 默认从右改成左时这四处一起翻过；**再改默认就把它们一起改**，并顺手过一遍 §12 那四处文案里描述左右的那几句（`guide.html` 首段与折叠小节、`index.html` 的 `<noscript>`）。`og-cover.png` 那张截图里的面板位置不会跟着变，`og:image:alt` 描述的是**那张图**、不是当前默认，别跟着翻。
  - **G 步（快捷键切换侧栏面板，2026-09-28 加）** 守的是 `switch-panel` 这条链路（第 13.4 节）：交替按两次 `Mod+Shift+KeyE` 断言 `data-panel` 走 `explorer → tests → explorer`（等价于点胶囊，走的是同一个 `Sidebar.vue` 的 `togglePanel`）；再双击 `.splitter` 折叠侧栏、按第三次，断言 `.pane--tests` 又可见**且**当前面板变成「评测样例」——「收起时按一下 = 先捞回来再翻面」这条契约就在这一句里。收尾记得把侧栏恢复成「可见 + 资源管理器」。修饰键用模块级常量 `MOD`（`process.platform === 'darwin' ? 'Meta' : 'Control'`），E 步那个运行快捷键也复用它，别再造一份。
  - **H 步（题解回归，2026-09-30 加）** 只钉静态的那几条：走资源管理器页头那颗「新建文件」（`.explorer__btn` 的第一颗）把预填的 `new.cpp` 全选改成 `notes.md`（**必须先 `.select()` 再打字**——预填名只选中主干、后缀留在选区外，直接敲会得到 `notes.cpp`）→ Enter 后 `createFile → openFile` 会自己打开它，等 `.md-tools` 可见即算到位 → 断言 `.md-tools` 与 `.md-stats`（`N 字 · M 行`，正则同时收中英文）出现、`.editor-pane__status` **不可见**（它是 `v-if` 存在、靠 `.editor-pane.is-md` 收掉，所以只能看渲染盒）、`.run-inline` 为 `disabled` 且 `.run-blocked` 有字（此刻有用例、没在运行，唯一能置灰它的就是题解这条闸门）→ 再验「让路」那一对：先用 `monaco.editor.getEditors()[0].focus()` 把焦点**确定地**送进编辑器（让路判据正是「焦点在不在编辑器里」，别靠上一步顺手留下的焦点），按 ⌘B 断言正文多出一对 `**`（新建的文件是空的、题解模板里也没有 `**`，所以这条不会假过）**且侧栏没收起来**；点回 `main.cpp` 再按 ⌘B，断言 `.pane--tests` 被收起来了（同一个键在 `.cpp` 里落回全局的「收侧栏」）。收尾再按一次把侧栏放回来。探针里读编辑器全文用模块级 `editorValue(page)`（`monaco.editor.getEditors()[0].getValue()`，VFS 的 uri 认不出文件名）、按键用 `pressMod(page, 'KeyB')`。
  - 临时探针的第三个坑：**边改源码边跑着 dev server** 时，探针会服务到旧的 transform（改完文件、刷新了页面，行为却还是旧的，断言照旧失败）。停掉 server → `rm -rf node_modules/.vite` → 重启，再跑一遍。
  - 各步之间有状态耦合（B/C 切布局会影响 D 的期望方向），改断言时顺着看一遍。
- 回归脚本会把截图写到仓库根目录的 `cp-*.png`（可用 `SHOT_DIR` 改路径），`.gitignore` 已忽略它们，不用管。

## 9. PWA（可安装 / 独立窗口 / 离线）

2026-09 加，全程**零新增依赖**（没用 `vite-plugin-pwa`，也没用 Workbox）。四块拼图：

| 文件 | 职责 |
| --- | --- |
| `public/manifest.webmanifest` | `display: standalone`、`start_url: /`、`scope: /`、`id: /`；`theme_color` = `--bg-chrome`（深色那支 `#1c1c1c`）。**它不是「首帧兜底」——它才是 Firefox 安卓唯一认的那个值**，见 9.1 |
| `public/icons/*.png` | `icon-192/512`（圆角、透明角）、`icon-maskable-192/512`（满幅方块 + 图形收在安全区内）、`apple-touch-icon`（180，满幅） |
| `public/favicon.svg` + `public/favicon.ico` | 标签页 / 快捷方式图标。**`.ico` 是安卓 Firefox 「添加到主屏幕」那条路唯一认的**：造快捷方式时它按老规矩直接抓根目录 `/favicon.ico`，不看 `<link rel="icon">`、也不看 manifest（2026-10-14 加，见下面那段）。两条 URL 在 `index.html` 里都带 `?v=` 版本串（2026-10-15 加）：它们会变、又没有内容哈希，**换图时必须递增那个数字** |
| `src/sw.js` → `dist/sw.js` | Service Worker，缓存策略见下。**源码是模板、产物由构建生成**（见下） |
| `src/composables/useInstallPrompt.js` | 拦 `beforeinstallprompt` 交给设置视图「应用」分组里的安装按钮，跟踪 `appinstalled` 与 `display-mode: standalone`。**三层判据**：`INSTALL_EVENT_IMPLEMENTED`（属性检测，原始事实）→ `INSTALL_API_SUPPORTED`（可用性，扣掉 `MANUAL_INSTALL_BROWSER`）→ `canInstall`（事件判据）。`MANUAL_INSTALL_BROWSER` 目前只认三星 Internet（2026-10-14，见 13.4） |

**「添加到主屏幕」造出来的快捷方式没有图标（2026-10-14 修）**：安卓 Firefox 那条路有两个入口，取的图不是同一处 —— 菜单项是 **Install**（站点可安装）时走 manifest 的 `icons`；是 **Add to Home Screen**（普通快捷方式）时，它按 1999 年那条老规矩**直接抓 `/favicon.ico`**，`<link rel="icon">` 与 manifest 都不看。站点以前**只有 `favicon.svg`、根目录没有 `.ico`**（线上是 404），SVG 在它那条路上栅格化不出来 ⇒ 主屏上就是一张空图标。
修法：新出 `public/favicon.ico`（16/32/48 三尺寸，PNG-in-ICO，源图是 `icons/icon-192.png`，本机用 `sips` 缩放 + 手拼 ICONDIR），并在 `index.html` 里**显式**声明一条（声明了别的 `rel="icon"` 之后浏览器未必再兜底抓根目录那份，写出来才保证它在候选集里）。当时顺手把它**同步进了** `STATIC_ASSETS`，判据是「它跟 `favicon.svg` 一样是内容不动的 `public/` 资产」——**这条判断第二天就被证伪了**：图标随后去了白底，于是被那个永不过期的桶钉死。2026-10-15 已把它连同其余图标一起移出，详见下面「站点图标」那段。

**Service Worker 的三段策略**：

- `install`：读构建期产出的 `/precache-manifest.json` 拿全部带哈希的产物名，与 `sw.js` 里手写的 `STATIC_ASSETS`（`public/` 下那些不过构建、**且内容永不改**的静态资源 —— 2026-10-15 起缩到只剩 `/` 与 `/index.html`，图标那一组已移出、改走网络放行，见下）合并后一起预缓存进 `cp-shell-v6`。**语言工具链不预缓存**——install 阶段不拉任何 `/wasm/` 资产，用户用哪个语言、哪个语言才在第一次请求时被 `cacheFirst` 写进 `cp-toolchain`。**逐条 `catch` 容错**：任何一条失败都不能让整次 install 作废（install 失败等于永远装不上），漏掉的之后由 fetch 处理器补。
- `activate`：删掉名字不在保留名单里的缓存桶，再 `clients.claim()`。**2026-10-01 起多一步 `migrateLegacyBuckets()`**：按 `storageNames.js` 的 `LEGACY_BUCKETS` 表，把改名前的旧桶**原样搬进新桶**再删旧桶——工具链是随 URL 固定的二进制，不搬的话老用户升一次外壳就得白下 76MB。表里现在是四对（两轮改名的层积）：`cph-toolchain-v3` / `cph-md-runtime-v1`（去 `cph-` 前缀那一轮）与 `cp-toolchain-v3` / `cp-md-runtime-v1`（去版本尾缀那一轮），都指向 `cp-toolchain` / `cp-md-runtime`；**外壳桶 `cph-shell-*` / `cp-shell-v3` 刻意不搬**，它装的是带哈希的构建产物，重新预缓存本来就是升外壳该发生的事。**2026-10-25 起再多一步 `pruneStaleShellArtifacts()`**（按 `retain-manifest` 清同桶内「带版本、这一版已没人要」的条目，见下）。
- `fetch`：只碰同源 GET。**导航网络优先**（重新部署后刷新一次就拿到新外壳，断网才退回缓存的 `index.html`），其余缓存优先。跨域一律放行——判题服务地址是用户填的，SW 插手就会变成 CORS 事故；带 `range` 头的请求也放行，206 塞进 Cache Storage 会抛错；`/api/*`、**`/manifest.webmanifest`（2026-10-14 加）与站点图标那一组（2026-10-15 加）** 也放行，判据见下一条。

**外壳桶里「按版本换代」的条目必须主动回收（2026-10-25 修，同日扩到字体 / 扩展包）**：`install` 只往桶里**加**，`activate` 的清理是按**整桶**删的 —— 同桶内的旧条目没有任何一条代码会碰。而外壳桶里有一整类「URL 随版本换代」的资产：构建产物带内容哈希（每发一次版多一份 `main-*.js`，**4.3–4.5MB**）、字体文件名带**字体内部版本**、扩展安装包文件名带扩展版本。旧的那份再也没人按它的 URL 取，却一直占着配额。实测（用户线上档案，2026-10-25，当时桶名还是 `cp-shell-v5`）：`cp-shell-v5` **68 条 / 约 170MB**，其中只有 16 条 / 5.2MB 是当前这版，其余全是 10-14 至 10-24 历次发版的残骸；整站 240MB 里 **约 165MB 是这批死文件**（`cp-toolchain` 那 50MB 是干净的）。**回收之后的上限是「外壳 ≈5MB + 当前工具链」**，不是「只剩 5MB」：工具链是这一版仍在用的活数据（C++ 23.1.0 ≈ 24.4MB、Python ≈ 24.6MB，`cp.autoPreload` 缺省预取 C++），拿它跟死文件混在一起说会把 240MB → 5MB 当成全覆盖。

三处配套：

1. **`/retain-manifest.json`（2026-10-25 新增）**：`vite.config.js` 的 `cp-retain-manifest` 插件在 `generateBundle` 时列出**这一版还要留哪些外壳条目** —— `bundle` 里的 `assets/*`（带内容哈希）+ 扫 `public/fonts/*.woff2` + 扫 `public/extension/*.zip`（这两类是「文件名带版本」，构建期读目录就等于当前版本）。**刻意与 `precache-manifest.json` 分成两份**：那份是「install 该预下载什么」，只装 rollup 产物；这份是「桶里哪些条目还有消费者」。将来再加一类「会变、又没哈希」的资产：补进这个插件的扫描列表 + 补进 `sw.js` 的 `SHELL_VERSIONED_PREFIXES`，两处是配套的。
2. **`src/sw.js` 的 `pruneStaleShellArtifacts()`**（原名 `pruneStaleShellAssets`）在 `activate` 里按那份清单清 `cp-shell-v6`：只删 `/assets/`、`/fonts/`、`/extension/` 这三类前缀下**不在清单里**的条目。判据的根据是「URL 里带版本 ⇒ 旧 URL 永远没人再取」；`/`、`/index.html`、guide / notice / privacy 这些固定 URL 页面由 `networkFirstNavigation` 覆盖写同一个 key，本来不堆；`/<handle>` 那种「一 handle 一个 key」的入口页也不是旧产物，一律不碰。**清单拿不到（网络抖动 / 部署中 / 上一版没这个文件）就整趟放弃** —— 宁可不清理，也不能在清单为空时把当前外壳删光。工具链那半不归它：`cp-toolchain` 里的旧目录由页面侧 `runnoSandbox.pruneLegacyToolchainCache()` 按**当前资产前缀**回收（SW 读不到版本号，而写死一张「要清哪一代」的表又会漏掉下一代）。**已知边界（2026-10-25 记，未处理）**：`/assets/` 里有两个**懒取**的文件 —— `wasi.worker-*.js`（第一次点 ▶ 才取）与 `editor.worker-*.js`（编辑器启动才取），本趟清理会在 activate 当场删掉上一版的它们；而 activate 带 `skipWaiting` + `clients.claim()`，新 SW 会立刻接管**旧标签页** ⇒ 旧标签页再点 ▶ 就按旧 URL 取 worker，Cache Storage 已无、线上也已换成新哈希 → 404，运行直接失败（不清理时它还能吃桶里那份旧的）。窗口是「部署前就开着页面 → 部署后 SW 后台更新 → 再点运行」。修法是保留一代：activate 里 keep = 本次清单 ∪ 上一代清单，上一代存在桶内一个固定 key 下，代价是常驻多 ≈5MB。2026-10-25 这一版没做 —— 而它恰好把 `wasi.worker` 整个换掉（文件名必变），所以发版时这个窗口是实际会命中的，不是理论。
3. **构建指纹**：`cp-service-worker` 插件往 `sw.js` 头部注入 sha1 前 12 位（取本次 `bundle` 文件名集合）。没有它，发版只要没动 `sw.js` 源码，脚本字节就不变 ⇒ 浏览器不重新 install / activate ⇒ 上面那趟清理永远不跑（与 2026-10-15 图标那条是同一个机制，方向相反）。指纹确定性实测过：同源两次构建 `sw.js` 逐字节一致。

**`SHELL_VERSION` v5 → v6（2026-10-25）**：按硬约束「改外壳缓存内容或策略就升」。这一版**必须**升的理由是 v5 桶里已经攒下的东西里有新判据也认不出来的（`/<handle>` 入口页、10-15 之前那批图标条目、历年 `/assets/` 那 165MB）—— 整桶删一次才是真正的清空；之后改回收判据就不必再升，只要「该留哪些」仍由 `retain-manifest` 驱动、桶里不留判据够不着的东西。

端到端验证（2026-10-25，一次性探针放 `/tmp`、仓库不留）：在 `preview` 上播种 3 条旧产物（三类前缀各一条）+ 当前版本的字体与扩展包 + `/he-jie` 与 `/stale-page.html` + 一个 `cp-shell-v5` 残留桶 + 工具链两条（8.0.1 / 23.1.0），改磁盘上的 `sw.js` 触发一次真实 update —— **11/11 PASS**：三类旧条目全删，当前字体 / 扩展包 / 固定 URL 页面全留，桶里不再有任何「带版本但不在清单里」的条目，`cp-shell-v5` 整桶消失；工具链侧 8.0.1 被页面那趟删掉、23.1.0 保留。**注意清单里那 7 条幽灵键**（guide / notice / privacy 的入口 chunk 被内联进 HTML，磁盘上没有这些文件）：线上 install 对它们 404、逐条 `catch` 兜掉，`vite preview` 却会回落成 `index.html` 200 把它们缓存进去 —— 所以「预缓存条目数」这类断言在 preview 与线上不是同一个数，别拿 preview 的数字当线上数据。PCH 那侧仍由 `/tmp/tlb/storage-prune.mjs` 那轮断言（`readPch` 命中清孤儿 / `writePch` 只留一份）。

**PCH 存档同样只该留一份（2026-10-25 修）**：`PCH_CACHE_VERSION` 是 PCH id 的一部分，升版之后旧存档再也取不到 —— 而 `pchStore.js` 原先只按 id `put`，没有一处会删别的 id。实测用户档案的 IndexedDB 19.6MB ≈ 当前 v4 的 8.6MB + 孤儿 v3 的 8.6MB + VFS/抽题缓存。现在两条路都收口：`writePch()` 在同一个事务里先 `clear()` 再 `put`；`readPch()` 命中时顺手 `pruneOthers(id)`（只有这条路径能在「新版本已存在、不会再写」的情况下发现孤儿）。

**为什么文件名清单要构建期生成**：产物名带内容哈希，没法在 `sw.js` 里硬编码。`vite.config.js` 里那个 `cp-precache-manifest` 插件在 `generateBundle` 时把 `bundle` 的键写成 `precache-manifest.json`，正好绕开引依赖这件事。加产物类型（比如新图）时它会自动跟上，**不用改 `sw.js`**；但 `public/` 下的东西不过 `bundle`，加文件要**逐个判内容会不会变**：永不变的才手动补进 `STATIC_ASSETS`（2026-10-15 起只剩 `/` 与 `/index.html`），会变的一律别进 —— 站点图标走网络放行、扩展包与字体靠文件名带版本（第 1 节表里那几条约束就是这么来的）。反过来，**`public/` 下不是每个文件都该进去**：`public/extension/*.zip` 就刻意不进——它只在用户点「下载」时才需要，而且靠**文件名带版本号**来换代（第 5 节坑 20），塞进 install 预缓存等于每次装 SW 都白拉几百 KB 的旧包。**2026-10-25 起构建期多产出第二份清单 `/retain-manifest.json`**：那份不管「预下载」，只管「桶里哪些条目还有消费者」（见上面「按版本换代的条目必须主动回收」），两者的消费方不同，别合并。

**`/manifest.webmanifest` 只能放行，不进任何缓存（2026-10-14 加，第 4 条判据）**：
判据一句话 —— **「会变、且没有内容哈希可依赖」的同源 GET，一律别让 SW 碰**（现在就是 `/api/*`、`/manifest.webmanifest`，以及 `/favicon.svg` + `/favicon.ico` + `/icons/*` 这一组）。manifest 原先既在 `STATIC_ASSETS` 里预缓存、又会被 fetch 的 `cacheFirst` 在未命中时写进外壳桶，而那个桶在 `activate` 的白名单里**永不过期** ⇒ 只有 `sw.js` 自身字节变了（install 重跑预缓存）才会顺带刷新它；**发版只改 manifest 的话，它就是被钉死的那份**。
实感：安卓上「添加到主屏后那条状态栏永远是旧配色」。2026-10-14 实测（用户截图逐像素读）：设备停在 10-04 那版的 `#2a2a2b`（读到 `#2a2a2a`），而线上 / 产物 / 三处契约早已是 `#1c1c1c`；`theme_color` 的历史正好是 `#323233`(9-18) → `#2a2a2b`(10-04) → `#1c1c1c`(10-12)，对上设备上那一版就是「装机那天读到的」。现在它在 `fetch` 处理器里直接 `return` 放行给网络 —— 注意**光把它从 `STATIC_ASSETS` 里摘掉不够**，`cacheFirst` 在未命中时同样会写进外壳桶，必须整条 `return` 掉。
设备侧还有半格手要动：**已装好的那个图标得删掉重新「添加到主屏幕」一次**，装机那一刻的 manifest 元数据不会自己刷新。

**站点图标同一个坑（2026-10-15 修）**：`/favicon.svg`、`/favicon.ico` 与 `public/icons/*.png` 原先也躺在 `STATIC_ASSETS` 里（当初的理由是「`public/` 资产内容不动」，见上面 `.ico` 那段），于是被同一个机制钉死 —— 把图标的白底改成透明圆角重新发版后，用户报「图标又冒出白底、刷新有时管用、过一会又回去」。**CDP 实测**：标签页的 `/favicon.ico` 请求确实走 SW（`Network.responseReceived` 的 `fromServiceWorker: true`；首访 SW 还没接管时是 false），也就是标签页吃的就是桶里那份装机时的图；往 `cp-shell-v4` 里塞回 git 里的旧图后，普通刷新拿到旧图、`Network.setBypassServiceWorker: true` 再刷才拿到新图 —— 与用户描述的「偶尔一次硬刷新对、其余都错」逐条对上。**这次发版更没救回来**：改的只是 `public/` 下的位图，`sw.js` 字节没变 ⇒ 浏览器不会安装新 SW ⇒ 桶里的图标永远不刷新。
修法与 manifest 完全同款：**从 `STATIC_ASSETS` 摘掉 + 在 `fetch` 处理器里 `return` 放行**（只摘不够，`cacheFirst` 未命中时照样会写进兜底桶）。另加一条 `?v=`：SW 放行只拆掉了「永不过期的桶」这层，还有一层 `cache-control: max-age=14400`（4 小时，来自 Cloudflare 的 Browser Cache TTL，不是 Vercel 默认）压在浏览器与 CDN 上，**换 URL 才能立刻绕开** —— 所以 `index.html` 里两条 `rel="icon"` 都带上了 `?v=2`，换图时必须递增。同时把 `SHELL_VERSION` 升到 `v5`，让旧桶里那 7 条已无消费者的图标记录一并清掉。

**两个版本号，别混**：

- `storageNames.js` 的 `SHELL_VERSION = 'v6'` —— **只决定外壳桶名**（`cp-shell-v6`）。改外壳缓存策略或 `STATIC_ASSETS` 就升它，`activate` 会把旧外壳桶整个删掉。**2026-10-25 起这条判据有个例外**：同桶内「带版本」的条目已由 `pruneStaleShellArtifacts()` 按 `retain-manifest` 回收（见上），所以只是扩回收范围、不改「桶里该留什么」时**不必**升 —— 升版本只在「vN 桶里已有新判据也够不着的残骸，要一次清空」时才用。v5 → v6 就是这种情况。
- `storageNames.js` 的 `TOOLCHAIN_CACHE = 'cp-toolchain'` —— **不带版本尾缀，也刻意不跟 `SHELL_VERSION` 走**。2026-09-30 前两个桶共用一个版本号，升一次外壳就把老用户的 clang（52MB）+ CPython（24MB）一起删掉、逼他们重下 76MB；现在工具链桶名固定，它落在 `activate` 的 keep 白名单里，跨外壳升级无损继承，一个字节都不用重下。**不带尾缀还有第二个用处**：这个名字同时被 `purgeRuntimeCache` 当成「所有历代工具链桶」的前缀（见第 5 节坑 23），带尾缀就连老桶都配不上了。换代工具链靠 `public/wasm/<版本>/` 的目录名，**不用再动这一行**。
- 工具链目录 `public/wasm/23.1.0/`（C++）与 `public/wasm/python-3.11.3/`（Python）—— 目录名就是版本号，换名字即自然失效（URL 变了，浏览器与 SW 都当新资源重新取）。`public/wasm/8.0.1/` 仍在仓库里，但**只为回滚留档**（2026-10-25 拍板不做运行时回退），页面一行代码都不会去取它 —— 它留在缓存里的条目由 `pruneLegacyToolchainCache()` 按当前前缀删掉。**换代不用再改 `sw.js`**：`cacheFirst` 只按 `/wasm/` 前缀分流、不认具体版本目录；桶里的旧目录由那个函数回收，而它认的是「当前资产地址」，不是一张写死的旧 URL 表。

**桶名只有一处定义（2026-10-01 收敛）**：`src/services/storageNames.js` 是 `SHELL_CACHE` / `TOOLCHAIN_CACHE` / `MD_CACHE` / `LEGACY_BUCKETS` 与两个 IndexedDB 库名（`VFS_DB_NAME` / `PCH_DB_NAME`）及各自 `LEGACY_*` 的**唯一出处**。页面侧（`mdRuntime.js` / `pchStore.js` / `LocalVFSProvider.js` / `runnoSandbox.js`）直接 `import`；`sw.js` 是 classic worker、没有 `import`，所以走**构建期注入**：

- `src/sw.js` 是**源码模板**（不是产物，`public/sw.js` 已删）。它用到的桶名常量不定义在自己文件里。
- `vite.config.js` 的 `cp-service-worker` 插件按 `storageNames.js` 导出的 `SERVICE_WORKER_CONSTANTS` 生成一段 `const <名字> = <值>`，**前置**拼到模板上：构建期 `emitFile` 成 `dist/sw.js`（URL 与原来完全一致，`main.js` 的 `register('/sw.js')` 与 `vercel.json` 的 `/sw.js` 响应头都不用动）；dev 下挂中间件现场拼同一份（不拼就是 404）。
- **加一个 SW 要用的桶名** = 在 `storageNames.js` 定义 + 补进 `SERVICE_WORKER_CONSTANTS`，插件与两个文件都不用改。
- 为什么不在 `sw.js` 里再抄一份：两处字面量对不上时没有任何报错——页面往 A 桶写、SW 在 `activate` 里按 B 桶白名单清理，用户的 76MB 工具链会被静默删掉。
- 改桶名**必须**同时改对应的 `LEGACY_BUCKETS` / `LEGACY_*_DB_NAME`（迁移源），否则老用户的数据搬不过来。

**注册时机**：`src/main.js` 里 `import.meta.env.PROD && 'serviceWorker' in navigator` 才注册，且挂在 `window.load` 上。**dev 下刻意不注册**——Vite 的模块是即时编译的，缓存它只会让改完代码看到旧页面；所以 `npm run dev` 里既没有安装入口也测不到离线，要验就走 `npm run build && npm run preview`。

**安装入口**：设置视图「应用」分组里那个「安装」按钮只在 `beforeinstallprompt` 真的触发后才可点（说明浏览器已判定可安装；不可安装时它 `disabled`），点它调 `prompt()`，`userChoice` 返回后事件即失效、按钮跟着置灰；已经装在独立窗口里跑或已被 `appinstalled` 标记过，也不再提示（文案变「已安装」）。2026-10-12 起这把锁**能被随后到来的安装事件冲掉**（事件到达 = 其实没装），且有两行配套说明：引擎有 API 却拿不到入口 → `chrome://apps` 那行（判据见 13.5 第 6 条）；引擎没有 API → 按浏览器给安装出路的 `noApi*` 那行（判据见 13.5 第 4 条）。iOS Safari 没有 `beforeinstallprompt`，走「分享 → 添加到主屏幕」（站点已有这句引导）。**2026-10-12 起这一整套还多一个主动入口**：开机用通知弹一次（能装时带「安装」按钮、装不了时按浏览器给一句出路），弹过就记进 `cp.installGuides`；设置面板「应用」栏末尾那颗「安装引导」可随时手动再发一次 —— 通知形态见 **13.8**。

### 9.1 装成应用后的系统栏配色（2026-10-12 定）

装到桌面 / 主屏之后，**那两条系统栏（状态栏、导航条）的颜色不是页面说了算**，两族引擎的规矩不一样。
本节此前只写了「`theme_color` 只有首帧兜底作用，真正生效的是 JS 写进去的值」——**那句只对 Blink 成立**：

| 引擎 | 它拿哪个值画系统栏 | 能不能跟着切主题 |
| --- | --- | --- |
| Chrome / Edge（桌面 + 安卓） | 运行期那个 `<meta name="theme-color">` | 能，切主题当场变 |
| Firefox 桌面 | 同上（独立窗口的标题栏） | 能 |
| **Firefox 安卓** | **manifest 里的静态 `theme_color`** | **不能** |

Firefox 安卓那条是上游现状，不是这里的配置错：它**至今不认运行期改写的 meta**
（Mozilla bug 1922023，状态仍是 NEW），只读 manifest 里那个静态值；底部那条**系统导航条**更彻底，
完全不跟站点颜色（fenix#27221 原文 `Navigation Bar color isn't synced with website's color`；
同族的状态栏那条 2023 年修过 = bug 1813875，导航条没有）。

**所以「同一个色值必须写三处」是这类问题的唯一防线**（漏一处，两类引擎就显示成两个颜色）：

1. `src/styles/base.css` 的 `--bg-chrome`（深色 / 浅色各一支）—— 运行期真值，Blink 与 Firefox 桌面用它；
2. `public/manifest.webmanifest` 的 `theme_color` —— **Firefox 安卓唯一认的那个**；
3. `index.html` 里 `<meta name="theme-color">` 的静态 `content` —— 只是首帧兜底（JS 到之前）。

**2026-10-12 的三次改动**（用户报「安卓 Firefox 装成应用后下方有白边、状态栏也不为深色」）：
`--bg-chrome` 深色那支由 `#2a2a2b` **压到地面色 `#1c1c1c`** —— 原来那支是深色主题里最亮的一档（42），
装到手机上状态栏就是一道明显比界面亮一截的灰；压到地面色之后它和页面画布同色。

**2026-10-14：浅色那支也改成同构**（用户口径：「把状态栏的颜色改为和底色一样，并且随主题切换」）——
`#e8e8e8` → **地面色 `#f3f3f3`**。原先那支刻意比地面深一档（白底上留一点「这是窗口装饰」的痕迹），
现在两套主题一律「宿主那条栏 = 地面色」。**这条改动推翻了 2026-10-12 写下的「别去同构」** ——
不是笔误，是口径本身换了：色值仍只在 `--bg-chrome` 一处，`editorSettings.js` 现读现发，
两套主题都能跟上；manifest / 首帧 meta 那两处是**静态单值**，按默认主题（深色）写，给不了浅色这一支。

**页面补不了那两条栏**，两条判据（2026-10-12 探针实测）：一是根元素 `html` 的背景按画布规则铺满
**整个视口**，页面内部不可能出现白条；二是 Firefox 安卓既不吃 `viewport-fit=cover`、
`env(safe-area-inset-*)` 也返回 `0px`，页面**到不了那两条栏下面**。结论：**状态栏那条是我们发错了色值
（可改），底部导航条那条是浏览器自己画的（无解，别再查）**。

**同一条「下方白边」在浏览器里也会出现**（2026-10-14 用户报：「平板 Firefox 直接打开网页，底部有几像素
白条，把站内主题切到深色它还是白的」）—— 上一次报的是**装成应用之后**，这次是**没装**，成因是同一条：
**那条栏不跟站点色，页面也够不到**。所以浏览器里同样**无解**，**唯一能动的旋钮是把平板的系统切深色**
（那条栏跟系统 / Firefox 自己的主题走，不跟站点）。2026-10-14 复核（真实应用 + 安卓 UA + 768×1024 竖屏 /
1024×768 横屏 × 暗色 / 亮色 / 侧栏折叠，共四态）：`.app` 与视口等高（gap 恒 0，`is-keyboard` 那条
`--vvh` 在可视高度 ±90px 收放时每次都跟上），逐像素扫**最底 5.5 CSS px** 只有 `#1c1c1c`（暗）/
`#f3f3f3`（亮）、**最亮像素 28**，第一个亮像素在**离底 11px** 处 —— 那是编辑器状态栏里那行白字（该栏当天曾试改成地面色、同日已按要求改回蓝底），
不是线 ⇒ **页面这一侧没有任何白条可改**。

实测（探针 21 条断言全绿 + 截图，Firefox 安卓 UA + 412×915，跑完即删）：深色下 `--bg-chrome` /
运行期 meta / manifest 三处都是 `#1c1c1c`，浅色下前两处当时是 `#e8e8e8`（当天稍后按用户要求改成
`#f3f3f3`）；`.app` 与视口等高、`elementFromPoint` 在视口四条边中点与两个下角命中的都是页面
自己的元素（底部那 100px 里没有白）。`npm run verify` 基线不变（A/B/C/D/F 绿 + E/G/H 红）。

**2026-10-14 再核一次「Firefox 安卓认不认 meta」——三方一致，确认不是我们的配置错**：
MDN 的 `theme-color` 兼容表标 **Firefox for Android 不支持**（`Firefox` 桌面同样标不支持）；
Chromium 侧的开发者信号仓库（`web-platform-dx/developer-signals#145`）同一结论；bug 1922023
（YouTube 装成应用后状态栏恒为 manifest 里那个红、页面改不动）状态仍是 NEW。
⇒ **浏览器标签页里那条栏，页面发什么色值都到不了**（不是「值发错了」，是通道不存在）；
装成应用后 Firefox 安卓只认 manifest 里那个**静态** `theme_color`，所以「随主题切换」在它那里
做不到 —— **Chrome / Edge 安卓（读运行期 meta）与安卓壳（走 14.P 那条原生通道）都能切**。

**2026-10-14 追记：改了 manifest 却不生效，是我们自己的 SW 把它钉住了** —— 设备上读到的是
10-04 那版 `#2a2a2b`，不是线上那份 `#1c1c1c`。成因与解法见第 9 节那条「`/manifest.webmanifest`
只能放行」；**换完还要在设备侧把主屏图标删掉重新添加一次**（装机那一刻读走的元数据不会自己更新）。

**同一件事在安卓壳（APK）里是另一条通路**（2026-10-12 加）：那边没有浏览器读 meta，那条栏归
Activity 的窗口管，得由 `services/systemBars.js` 经 Rust / JNI 送过去 —— 底色取的还是这里这一支
`--bg-chrome`（两个「装好的形态」同色值），但**图标明暗在壳里跟的是站内主题、在浏览器里跟的是系统**。
整条链路与三处契约见 **14.P**。

## 10. 部署（GitHub + Vercel）

- 仓库：https://github.com/hejiehejiehejiehejie/wasm-oj-frontend.git （私有），`main` 分支就是部署分支，推上去 Vercel 自动构建。
- Vercel 面板导入时的配置：Framework Preset 选 `Vite`，Build Command `npm run build`，Output Directory `dist`，Install Command 用默认。
  - **环境变量留空**：前端没有任何密钥；判题服务地址是用户在设置视图「评测」组里填的，存在 `cp.judgeBases` 里。
  - Node 版本不用在面板上设，`package.json` 的 `engines.node = 22.x` 已经钉死，`build` 就是一句 `vite build`。
- `vercel.json` 负责六件事，**别删**：
  1. 全站注入 COOP `same-origin` / COEP `require-corp` —— 少任何一个，本地沙箱连 `SharedArrayBuffer` 都拿不到；
  2. `.wasm` 声明 `Content-Type: application/wasm` —— MIME 不对时 `WebAssembly.instantiateStreaming` 会直接拒绝加载；
  3. `.wasm` 与 `/wasm/(.*)` 一年 immutable 缓存；
  4. `/manifest.webmanifest` 补 `Content-Type: application/manifest+json` 并禁缓存 —— Vercel 对这个扩展名的 MIME 不保证，错了 Chrome 会直接判定「manifest 无效」从而不给出安装入口；
  5. `/sw.js` 与 `/precache-manifest.json` 禁缓存（`max-age=0, must-revalidate`）—— Service Worker 脚本被长缓存的话，发了新版用户也永远拿不到。
  6. `/robots.txt` 补 `text/plain; charset=utf-8`、`/sitemap.xml` 补 `application/xml; charset=utf-8`，两者都禁缓存（见第 12 节）。
  7. `/api/:path*` → `https://api.998244353.best/api/:path*` 一条 rewrite（2026-10-19 加）：`www` 已改成 **Cloudflare DNS only（灰云）**，Worker Route 只对橙云主机名生效，所以 API 挪到 `api` 子域、由 Vercel 反代回来 —— 浏览器看到的仍是同源 `/api`，`cloudProfile.js` 的相对路径与壳里的绝对地址一行都没动。**别随手删这条，也别把 `www` 改回橙云**（理由与实测数字见 `docs/云端同步服务.md` §1）。
  本地 `vite.config.js` 的 `server.headers` / `preview.headers` 是同一组头的开发侧对应物，两边要一起改。
- **为什么 `www` 直连 Vercel（2026-10-19 实测）**：走 Cloudflare 橙云时国内 TLS 握手 0/8.1/10.0s、三轮 12s 全超时、`clang.wasm` 15s 收到 0 字节；改成灰云直连 Vercel 后首页 TLS 0.35s / TTFB 0.56s，同一个 `clang.wasm`（31.2MB）**15s 内下完、3.76 MB/s**。Cloudflare 边缘落在 LAX（`cf-ray: …-LAX`），`ping 1.1.1.1` 340ms/20% 丢包、`ping 119.28.28.28` 143ms/0 丢包 —— 瓶颈在「本机 → CF 边缘」这一段，与 Vercel 无关。Cloudflare 只在 `api` 子域上保留，且只有 Vercel 服务端会去打它。**apex `998244353.best` 同日也改成了灰云** —— Vercel 侧本来就挂了 apex 并设 308 → www，改前走 CF 是 TTFB 3.47s，改后由 Vercel 直发：TTFB 0.60s，跟着跳到 www 拿到 200 全程 0.99s。`www` / `apex` 两条 DNS 都别再开回橙云。
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

2026-09 加。主应用是纯前端 SPA，抓取器拿到空壳壳；为此补了**真正的静态 HTML 入口**——使用指南长文（不带 Vue、不带任何 JS 逻辑），并在 `index.html` 里给不执行 JS 的抓取器留了一段正文。全程零新增依赖。2026-09-29 起指南页有**中英两版**（`guide.html` / `guide.en.html`）。

**七个 Vite 入口**（`vite.config.js` 的 `build.rollupOptions.input`）：`main` → `index.html`、`guide` → `guide.html`、`guideEn` → `guide.en.html`、`notice` → `notice.html`、`noticeEn` → `notice.en.html`、`privacy` → `privacy.html`、`privacyEn` → `privacy.en.html`。加新的静态页时照抄 `guide` 那一行即可——**`.html` 不列进 `input` 就不会被构建**（它不在 `public/` 下，不会被原样拷贝）。

**`guide.css`（`src/styles/guide.css`）的两条硬约束**（两版 guide 共用这一份，别为英文版另起一个）：

- 必须 `@import './base.css'` 打头——两套主题的配色、字体、滚动条都只在 `base.css` 里定义（第 1 节「颜色只走 CSS 变量」），指南页只准 `var(--…)` 引用、不写十六进制。底色 / 前景色靠 `base.css` 的 `:root` 变量直接落在 `html/body` 上，所以指南页天然跟随主题，不用自己写一套。
- `base.css` 是为「满屏 IDE」写的：`html/body` 高度 100%、`body` 锁死滚动（第 3 节）。内容页要在 `guide.css` 里把这两条**放开**（`height: auto; overflow: visible` 之类），否则长页滚不动。

**主题不闪**：两版 guide 的 `<head>` 里都有一段内联脚本，读同一份 `localStorage` 契约（`cp.editorSettings.theme`），存的是 `light`（或主应用还没跑过、尚未迁过的旧值 `cph-light`）时才给 `<html data-theme="light">`（不写即默认深色）。它**故意不加 `type="module"`**——普通内联脚本不会被打包器挪走或包起来，才能在首帧前同步执行、避免暗→亮闪一下。**两段脚本内容一致、两边都要留**，改一处要同步另一处。

**中英两版是一对，必须逐条对照**（2026-09-29 加）：

| | `guide.html` | `guide.en.html` |
| --- | --- | --- |
| `<html lang>` | `zh-CN` | `en` |
| 章节 | 12 节，`#what` … `#credits` | **同 12 节、同 id、同顺序**（h2 数 = 目录条目数 = 12） |
| `canonical` | 指向自己 | 指向自己 |
| 页头右侧 | `.page__top-actions` 里一颗 `.lang-link`（写 `English`，带 `hreflang="en" lang="en"`）+ 主按钮 | 同结构，链接写 `简体中文`（带 `hreflang="zh-CN" lang="zh-CN"`） |
| 按钮名 | 与中文界面词条一致 | **必须与英文界面词条一致**（出处是 `src/i18n/messages/` 那六个文件），否则指南说的按钮在界面上找不到 |

三条纪律：
1. **改一版等于改两版**。加一节 / 改一条事实 / 动一个数字，两边同时改。判据是「h2 数 = 目录条目数 = 12」这类可机械复核的量，别靠 eyeball。
2. **`hreflang` 三行两边都要有**（`zh-CN` → 中文页、`en` → 英文页、`x-default` → **中文页**，因为站点主要受众是中文）。`public/sitemap.xml` 里两条 URL 也得用 `xhtml:link` 互指同一组值，**三处必须一致**。
3. **正文里 `未分类` 不译**——它是导入时真正建出来的目录名（见第 1 节与第 5 节坑 28 第 4 条）。英文版照写 `未分类`，可以在正文里补一句解释，**但不能把它「翻」成 `Uncategorised`**。

**五处文案要一起看**（能力 / 口径变了先搜这五处）：

| 位置 | 形态 |
| --- | --- |
| `guide.html` + `guide.en.html` | **完整版**（长文、表格、FAQ、目录），**中英两版** |
| `src/i18n/messages/help.js` | 应用内「设置 → 帮助」的简版（条目式），**中英两栏在同一个文件里**（`HelpPanel.vue` 已瘦身成纯渲染组件，正文全在这里） |
| `docs/使用手册.md` | 仓库内的简版，只回答最常问的两三个问题（**只有中文**） |
| `index.html` 的 `<noscript>` | 给不跑 JS 的抓取器的摘要，内容与上面几处对齐；**中英两半并列**（`<div lang="en">`） |

其中 `guide.html` 第 1 节末那两句、`guide.html` 第 9 节的折叠小节、`index.html` 的 `<noscript>` 首段会**点名描述侧边栏在哪一侧**（「左侧是资源管理器与评测样例，右侧是编辑器」）。面板默认位置 2026-09-28 从右改成左时，这几处跟着翻过一遍——**它描述的是「默认」，不是「唯一」**，所以别再往里面加「（可配置）」之类的补丁，也别让它们和 §8 的 A/B/C 断言各说各话。`og:image:alt` 是例外：它描述的是 `og-cover.png` **那张实际截图**，只有重新截图时才该改。

**致谢那一节不走上面那张表**（2026-09-29 加）：两版 guide 的「12. 致谢与开源许可」是仓库根目录 `NOTICE.md` 的**面向用户精简版**——上面那张表管的是「能力 / 口径」的几处同步，致谢管的是许可义务，两者别混。**注意节号**：2026-09-29 重写指南页后 guide 变成 12 节（新增了「在浏览器里跑有多快？」「怎么把题目抓进来？」「有哪些快捷键？」等节），致谢落在第 12 节；引用它时按**小标题文字**找，别按节号。**两版要一起改**（英文版的许可证名是法定名称，如 `Apache-2.0 WITH LLVM-exception` / `PSF License`，**原样照抄不译**）。它与 `NOTICE.md` 是**一对**：改依赖、换 `public/wasm/` 的工具链目录、换 `public/extension/` 的扩展包时**这三处一起改**，完整清单以 `NOTICE.md` 为准（那边记着每个组件的版本、许可与落在哪个文件）。精简版故意只列「跑在哪里、什么许可、负责什么」，不放版本号与文件路径——那些会过时，放在 `NOTICE.md` 里一处维护。

**`index.html` 的 `<noscript>` 正文有硬约束**（注释里也写了）：构建期的 HTML 解析按「脚本未启用」遍历 `<noscript>`，`<style>` / `<link>` / `<script>` 与**相对路径的 `<img>`** 会被特殊处理而在浏览器里失效，所以这块只放纯语义标签（`h1/h2/h3/h4/ul/li/p/a/div/section/hr`），**链接一律写绝对地址**（如导向 `https://www.998244353.best/guide.html` 与 `.../guide.en.html`）。用户端零影响（JS 开启时不渲染、不进无障碍树），Vue 挂载时 `#app` 内容也会被清空。**中英两半并列**（`<hr />` + `<div lang="en">`）而不是二选一——无脚本环境给不出语言切换器，而中文那半的 `<h1>` 是全页唯一的 h1，所以英文那半从 `<h2>` 起（两半各自内部 h2→h3→h4 自洽）。

**其余 SEO 落点**（都在 `public/`，直接进产物）：

- `public/robots.txt`：`Allow: /`，`Disallow: /wasm/`（52MB 工具链只在用户点下载时才请求，别占抓取预算）与 `/precache-manifest.json`；**不要** Disallow `/assets/`（Google 需要抓 JS/CSS 才能渲染页面）；末尾指 `Sitemap:` 绝对地址。
- `public/sitemap.xml`：五条 URL（`/`、`/guide.html`、`/guide.en.html`、`/privacy.html`、`/privacy.en.html`），**故意不写 `lastmod`**（写死的日期会变成假信息；`changefreq` / `priority` 已被 Google 忽略）。每一对双语页的两条 URL 上各挂一组 `<xhtml:link rel="alternate" hreflang=…>` 互指（含 `x-default` 指中文页），`urlset` 因此要带 `xmlns:xhtml`——**不加这组互指，Google 会把两版当成互相竞争的重复内容**。notice 两页**刻意不进**（许可义务页，不抢排名）。
- `public/og-cover.png`：1200×630 的分享大图，被 `index.html` / `guide.html` / `guide.en.html` 的 `og:image` 引用（`og:image` 必须是绝对地址）。
- canonical / `og:*` / `twitter:*` / `ld+json` 都写在各自的 HTML `<head>` 里；站点主地址是**带 `www`** 的 `https://www.998244353.best`（apex 会 308 跳过来，canonical 用来收掉 Vercel 预览域等重复地址）。
- **主应用与两版 guide 的语言声明方式不同，别套用**：主应用是**同一个 URL 服务两种语言**（`cp.uiLocale` 存档优先、否则跟随浏览器），所以 `index.html` 里只写 `og:locale` + `og:locale:alternate`、`ld+json` 的 `inLanguage` 给成数组，**刻意不写 hreflang**（没有「另一语言版本的 URL」这回事，写了反而错）；两版 guide 是**一页一语言**，那边才需要 hreflang 三件套。

**致谢页也是「一页一语言」的一对**（2026-09-30 加）：`NOTICE.md` → `notice.html`（中文）、`NOTICE.en.md` → `notice.en.html`（英文），两页由 `scripts/render-notice.mjs` 一次生成（`npm run notice`，已挂 `prebuild`），页头各有一颗语言切换链接 + 一组对称的三行 hreflang，canonical 各指自己。**`notice.en.html` 与两版 guide 同列 `vite.config.js` 的 `input`，否则不会被构建**。**它刻意不进 `public/sitemap.xml`**（那份地图只有五条 URL，见上；致谢页是许可义务页、不是要抢排名的内容页——要加就两页一起加，并带上 `xhtml:link` 互指）。两份源文件之间**没有自动同步**：章节与表格行逐条对应，改一份就要手改另一份（同 guide 的双语约定）；语言相关的外壳文案不写在 markdown 里，集中在 `render-notice.mjs` 的 `PAGES` 表。

**隐私政策也是一对「一页一语言」**（2026-10-06 加）：`privacy.html`（中文）/ `privacy.en.html`（英文），**手写**——没走 notice 那套生成器，因为这份文档改一次就长期不动，不值得再造一条 markdown 管线。复用 `guide.css` 与同一套页头 / 主题脚本 / 语言切换链接，canonical 各指自己 + 三行对称 hreflang，并与 `sitemap.xml` 里那两条 URL 逐字对齐。**它存在的直接原因是商店上架**：Edge Add-ons 与 Firefox AMO 都要求填一个可访问的隐私政策 URL，所以它有一条额外纪律——**内容必须与站点实际行为一致**。目前强制对齐的三处行为：① 云端同步上传的是偏好类项、且上传后公开可读；② 切到 Piston / Judge0 时代码发往**你自己填的**服务地址；③ 扩展只读当前标签页网址与受支持站点的题面样例。**改这三处行为就要回来改这两页**。页脚与正文的联系方式指向两个仓库的 issue（站点 → `wasm-oj-frontend`，扩展 → `CC-for-Web`），换仓库要同步。

**部署侧的 MIME**（`vercel.json`，见第 10 节）：`/robots.txt` 补 `text/plain; charset=utf-8`、`/sitemap.xml` 补 `application/xml; charset=utf-8`，两者都禁缓存（`max-age=0, must-revalidate`）。

**已知取舍**：两版 guide（以及致谢两页）**都不进 Service Worker 预缓存**（`vite.config.js` 的 `precacheManifest` 在 `generateBundle` 阶段从 `bundle` 生成，而 `.html` 是 `vite:build-html` 之后才产出的，清单里只有它们的 js/css）。所以断网访问 `/guide.html` 或 `/guide.en.html` 时，导航的兜底（`sw.js` 里 `caches.match('/index.html')`）会把**主应用外壳**顶上来——指南页离线不可用，但至少不会白屏。要改就在 `sw.js` 里单独缓存它们（每一版都要）。

## 13. 浏览器插件抓题（CC for Web）与全局快捷键

两块都是 2026-09 加的，彼此独立，只是同一批做的。

### 13.1 两端怎么接上

改造的插件在**另一个仓库**：`/Users/hejie/Code/CC-for-Web`（上游 jmerle/competitive-companion 的 fork，`package.json` 的 `productName` 已改成 **CC for Web**、版本 `2.68.x`，图标与宣传图的主色换成了与本站一致的蓝 `#0e639c`）。原版是把题目 POST 到用户本机的 `localhost` 端口（CP Editor / CPH 那套），fork 先是改成只推给本站，2026-09-30 又改成**两边同时投**——网站标签页与本地工具是并列的两个接收端，各有一个开关（选项页 `Destinations` 分组，默认都开），单侧失败不影响另一侧。

**投递目标可以在本站设置里直接切**（2026-09-30 加）：设置 → 浏览器插件 那一栏多了「投递目标」两个开关，它们**只是扩展 `chrome.storage` 的镜像**——网页点一下发 `cp-set-config` 给扩展，扩展写盘后再回一条 `cp-config`，站点拿回执就地更新 `extensionInfo.config`（刻意不重跑 `refresh()`，否则面板会闪一下「检测中」）。写盘的真值是扩展存的，所以刷新页面后开关状态来自扩展的上报而不是站点自己的 localStorage。

**唯一能在网页里改的配置就是这两个键**：扩展 `background.ts` 里的 `WRITABLE_CONFIG_KEYS` 白名单只放 `sendToWebPage` / `sendToLocalTools`，且值必须是 boolean，其余一律回 `{ ok: false }`。**快捷键改不了**——Chrome 的 `chrome.commands` 只有 `getAll` / `onCommand`，没有任何写接口，站点只能展示 + 让人去 `chrome://extensions/shortcuts` 手动改（网页也不许跳 `chrome://`）。

**扩展侧**（`CC-for-Web`，改动集中在 7 个文件）：

| 文件 | 职责 |
| --- | --- |
| `src/hosts/targetSites.ts` | 目标网站白名单 `TARGET_SITE_PATTERNS`：`localhost` / `127.0.0.1`（**不带端口，本机所有端口一起认**：dev 5199、端口顺延、`preview` 默认 4173 都覆盖；带端口 Firefox 会整包拒载）+ `www.998244353.best` / `998244353.best`。少了哪条就等于「网站没打开」 |
| `src/hosts/WebPageHost.ts` | 查已打开的标签页、把任务投过去（**接收端之一**，与本地工具并列） |
| `src/hosts/hosts.ts` | `getHosts()` 按两个开关拼接收端列表：`WebPageHost` + `CHelperHost`(4243，body 带 `json\n` 前缀) + `CustomHost`(上游 7 个默认端口 + 选项页 `customPorts`)；`LOCAL_TOOL_ORIGINS` 是 manifest 的 host 权限来源，**匹配模式不带端口即覆盖所有端口** |
| `src/background.ts` | `sendTask()` 用 `allSettled` 并发投所有接收端，**全部失败才**发系统通知（`notifyNoReceiver()`，标题 `CC for Web`）；两侧都关（接收端列表为空）时静默，不拿「没有接收端」打扰用户；**消息处理必须用 `sendResponse` 回调式**，不要返回 Promise（Chrome 原生 API 不认）。另外四件事：`cp-get-info` 的 `getExtensionInfo()` 现在还要 `Promise.all` 把 `sendToWebPage` / `sendToLocalTools` 读出来塞进 `config` 字段（站点据此渲染开关）**并带上 `capabilities`（见 13.1 的能力协商）**；`cp-set-config` 分支走 `WRITABLE_CONFIG_KEYS` 白名单写盘并回 `{ ok, key, value }`；`cp-fill-code` 分支走 `fillCodeOnCodeforces()`（复用 / 新开 Social 标签页 → 等 `status === 'complete'` → 问 `FillCode` 内容脚本，**没应答就补注入一次 `js/fillCode.js` 再问**，两次都不行回 `{ ok: false, reason: 'page' }`），结果顺手 `syncCfIdentityFromFill()` 对齐会话缓存；**2026-10-20 起成功之后还要跟一趟 `finishCodeFill()`**（`tabs.onUpdated` 等提交后那次 loading → complete，期间不轮询 —— 一次快 POST 会整个落在两次轮询之间；看到跳转且那个页是扩展自己开的就 `tabs.remove`，然后广播 `cp-fill-code-saved`）；`cp-cf-check` 分支读同一份缓存本地比对后**只回枚举**。Codeforces 登录态缓存放 `storage.session`（**会话级，刻意不落盘**；`storage.session` 不存在的环境退化成 SW 内存，只会更常回 `unknown`，**不回退 storage.local** —— 把 CF 账号写进磁盘没必要），带 `CF_IDENTITY_TTL = 30min` 保鲜期，过期当 unknown；`ReportCfIdentity` 只认正牌 codeforces.com 标签页的回报（按 `sender.tab.url` 核） |
| `src/options.html` + `src/options.ts` | `Destinations` 分组两个勾选框，`config` 持久化 |
| `src/utils/config.ts` | 新增 `sendToWebPage` / `sendToLocalTools`（**默认 true**）。坑：`Config.get` 的兜底必须用 `??` 而不是 `||`——默认 true 的开关存了 `false` 会被 `||` 当成「没设置」回退成 true，开关等于关不掉（2026-09-30 实测踩到） |
| `src/bridge.ts` | **注入目标网站的内容脚本**：扩展拿不到网页的 JS 作用域，只能靠它做 `window.postMessage` 中转。页面→扩展的路：`cp-ping` → `cp-get-info` → 回 `cp-info`；`cp-set-config` → 转发给 background 写盘 → 回 `cp-config`（合法性由 background 把关，bridge 只转发不校验）；`cp-fill-code` → 转发给 background → 回 `cp-fill-code-result`；`cp-fill-code-saved` → 由 background 广播回来，原样转给网页（`requestId` 由网页配对）；`cp-cf-check` → 转发给 background → 回 `cp-cf-check-result`（后两对 2026-10-11 加、`cp-fill-code-saved` 2026-10-20 加，bridge 只递话不解释） |
| `src/fillCode.ts` | **代填验证码脚本**（2026-10-11 加）：只注入 `https://codeforces.com/settings/social*`（清单常量 `FILL_CODE_SITE_PATTERNS` 在 `scripts/build/extension.ts`，同时进 `host_permissions` —— Social 页不在任何 parser 的路径里，不单独声明权限 `tabs.query` / `executeScript` 都会失败）。只做一件事：把码写进 Last name → 先 `sendResponse` 再提交（**顺序不能反**，页面一跳转消息通道就没了）。**不读 cookie、不回传页面内容**，只回 `not-logged-in` / `handle-mismatch` / `page` 三个原因；登录的是别人时什么都不写 |
| `src/cfIdentity.ts` | **「这个浏览器在 Codeforces 上登的是谁」的唯一判据**（2026-10-11 加）：`currentHandle()` 读页头那个 `/profile/<handle>` 链接（公开可见的 DOM，不是 cookie）、`hasLoginForm()` 把「没登录」与「改版了」分开、`isCodeforcesSite()` 只认正牌 codeforces.com（镜像是另一套会话）。`fillCode.ts` 与 `autoParse.ts` **必须共用这一份** —— 各留一份必然走偏，用户会看到「提示说已登录、点下去却说没登录」。⚠️ 这个值只够驱动界面提示，**不能当身份凭据**（伪造一个扩展就能冒充任意 handle），见 13.1 的硬边界 |
| `src/autoParse.ts` | **自动抓样例**（上游行为，2026-10-11 加了一条捎带）：注入面是整个来源站点域（Codeforces 那条是 `https://codeforces.com/*`，**不只有题目页**），所以用户开任意 CF 页面它都在场 —— 顺手读一次 `cfIdentity` 报给后台（`ReportCfIdentity`，fire-and-forget），站点取码时就能提前说清代填能不能成。**不发任何请求、不开标签页、不读 cookie**；只在正牌 codeforces.com 上做，回报失败只影响「预检那一行」，绝不影响抓题本身 |
| `src/contestActions.ts` | **报名 / VP / 非正式名次的页面侧**（2026-10-27 加）：只注入 `/contests`、`/contestRegistration/*` 与三种榜单页（清单常量 `CONTEST_ACTIONS_SITE_PATTERNS` 在 `scripts/build/extension.ts`，同时进 `host_permissions`）。四件事：`ReadContestStates` 读 `/contests/page/1` 每行 `tr[data-contestid]` 的报名状态（`open` / `before` / `closed` / `registered` / `count` / `unknown`）；`SubmitRegistration` / `StartVirtual` 在报名页里按 `kind` 填表（`action=formSubmitted`、`takePartAs=personal`、`virtual`、`requiredConfirmation`、`teamId=-1`）并**先回执再提交**（`SUBMIT_DELAY = 50`）；`ReadUnofficialRank` 先读好友榜（`/standings/friends/true?showUnofficial=true`，一页拿全、名次是总榜），拿不到再 `fetch` 合并榜第一页（同源、带 `?showUnofficial=true`）。**只回枚举、布尔与数字**：不读 cookie、不回传页面内容；一次消息只提交一次表单，绝不自动重放。页面问题统一先问 `cfIdentity.ts` 的 `pageProblem()`（challenge 先于登录判） |
| `src/submitCode.ts` | **一键提交的页面侧**（2026-10-23 加）：只注入提交页与 `/my` 页（清单常量 `SUBMIT_SITE_PATTERNS` 在 `scripts/build/extension.ts`，同时进 `host_permissions`）。两种消息：`SubmitCode` = 在提交页里选题目 / 选编译器（按**显示名**挑最后一个 `GNU G++`，退而求其次任意 C++；Python 挑最后一个非 PyPy 的）→ 写 `textarea[name=sourceFile]` → **先回执再点提交**（页面一跳转消息通道就没了，见 `SUBMIT_DELAY = 50`）；`ReadSubmission` = 在 `/my` 页上读某条提交的当前判定（空 id = 读第一行），读不到就自己 `fetch` 同一地址（`credentials: 'same-origin'`、`cache: 'no-store'`）再解析。**不读 cookie、不回传页面内容**，只回原因枚举（`not-logged-in` / `challenge` / `problem-missing` / `language-missing` / `page` / `empty`；其中 `challenge` 是 Cloudflare 验证页，2026-10-23 按真实 CF 的标记补的）与判定码 |

**站点侧**两个 composable + 一个服务：`useCompanionBridge.js`（收消息）→ `useCompanionImport.js`（订阅 + 兜异常）→ `services/vfs/problemImport.js`（落盘）。`App.vue` 里只有一句 `useCompanionImport({ setTestCases, onImported })`。

**消息协议**（两侧的 `source` 常量是约定的握手暗号）：

| 消息 | 方向 | 载荷 |
| --- | --- | --- |
| `cp-task` | 扩展 → 页面 | `taskId`（每次抓取现生成的 uuid，**只用来去重**）+ `payload`（题目 JSON 字符串） |
| `cp-ping` | 页面 → 扩展 | `requestId`（站点自增，用来认领回包） |
| `cp-info` | 扩展 → 页面 | 同一个 `requestId` + `info`（`{ version, commands, config, capabilities }`，`commands` 是插件自己的快捷键，`config` 是投递目标两项的当前值，`capabilities` 见下）。**`shortcut` 是浏览器自己那套写法，且有两种形态**：Chrome 系在 macOS 回符号前缀（`⇧⌘U`），Firefox 全平台与 Chrome 在其它平台回加号词形式（macOS 上是 `Command+Shift+U` / `MacCtrl+Shift+E` 这类）——所以 `comboFromChromeShortcut()` **按串形态分岔**（首字符是修饰键符号就剥符号、否则按 `+` 拆词），**别改回按运行平台分岔**（实测 macOS + Firefox 会把 `Command+Shift+U` 原样亮进面板）。转成站点写法仍走 `formatCombo()`（`⌘ + ⇧ + U`）；`shortcut` 为空串是常态（Chrome 遇到冲突就不分配建议键，且不会事后补），此时显示「未设置」+ **一行「为什么没有 / 去哪儿绑」的说明**（见 13.5） |
| `cp-set-config` | 页面 → 扩展 | `requestId` + `key` + `value`（只认 `sendToWebPage` / `sendToLocalTools` 两个键 + boolean） |
| `cp-config` | 扩展 → 页面 | 同一个 `requestId` + `key` + `ok` + `value`（写失败时 `ok: false`，站点在那一组下面显示一行警示文案） |
| `cp-fill-code` | 页面 → 扩展 | `requestId` + `handle` + `code`：请扩展去 Codeforces 把云同步这枚验证码填进 Last name 并保存（2026-10-11 加）。**只有在用户点那颗按钮时才发**，不轮询、不后台自动跑 |
| `cp-fill-code-result` | 扩展 → 页面 | 同一个 `requestId` + `ok` + `reason`（`reason` 是个短枚举：`not-logged-in` / `handle-mismatch` / `no-tab` / `page` / `timeout` / `unsupported`；站点把认不出的折成一句兜底文案）。**扩展绝不回传 cookie 或页面内容** —— 服务端仍然只认 `user.info` 里读回来的那枚 Last name，信任模型与手工填写一字不差 |
| `cp-cf-check` | 页面 → 扩展 | `requestId` + `handle`：问「这个浏览器在 Codeforces 上登的是不是这个 handle」（2026-10-11 加）。取码之后问一次、代填跑完再问一次，就这两处，**不轮询** |
| `cp-cf-check-result` | 扩展 → 页面 | 同一个 `requestId` + `status`，**只有四个枚举**：`match` / `mismatch` / `not-logged-in` / `unknown`（站点把认不出的也折成 `unknown`）。**只回枚举、绝不回用户名** —— handle 明文是站点自己填的，所以这个回答里没有一个字是站点原本不知道的信息；扩展判据读的是 Codeforces 页面上公开可见的 `/profile/<handle>` 链接，不是 cookie（见扩展侧 `src/cfIdentity.ts`） |
| `cp-fill-code-saved` | 扩展 → 页面 | 同一个 `requestId` + `saved`（布尔）：那枚码在 Codeforces 上**到底保存成功没有**（2026-10-20 加）。扩展在提交那一趟整页跳转走完之后发这条，成功时**同时已经把那个标签页关掉**（只关自己开的，复用的用户标签页不动）。它是「接着验证」的发令枪 —— 网页自己看不见 Codeforces 那一侧什么时候落定，猜固定延时必然两头不讨好。受 `capabilities` 的 `fill-saved` 保护，老扩展不发、站点等 13s 后按 `false` 收场（退回「回来点验证」） |
| `cp-scrape-contest` | 页面 → 扩展 | `requestId` + `url`（**整场题目列表页** `/contest/{id}/problems`，不是逐题地址，2026-10-19 加）。扩展开一个 `active: false` 的标签页读这一页（整场题面与样例都在上面），解析结果**仍走既有 `cp-task` 逐题投递** —— 网页不为「补样例」另造入库路径。只回 `{ accepted, reason }`（`busy` / `bad-url` / `tab-failed`），成败由下一条广播 |
| `cp-scrape-contest-done` | 扩展 → 页面 | 同一个 `requestId` + `ok` + `count` + `reason`（`timeout` / `load-failed` / `inject-failed` / `parse-failed`；站点把认不出的折成一句兜底文案并附原文）。**扩展同一时刻只跑一场**：两场混在一起，谁也说不清哪条 `cp-task` 属于哪批 |
| `cp-submit` | 页面 → 扩展 | `requestId` + `oj`（首版恒为 `codeforces`）+ `url`（题目页地址）+ `sourceCode`（**编辑器里的当前正文**）+ `language`（`cpp` / `python`）：请扩展把这份代码提交到 Codeforces（2026-10-23 加）。**只有在用户点按钮 / 按快捷键时才发**，不轮询、不后台自动跑。⚠️ 源码那一栏叫 `sourceCode` 而不是 `source` —— 信封上的 `source`（`cp-page`）已经被占用，同名会把它盖掉、整条桥当场失联（见 13.12） |
| `cp-submit-result` | 扩展 → 页面 | 同一个 `requestId` + `ok` + `reason` + `submissionId` + `verdict`：只说明**表单提交这半步**成没成（成功时 `submissionId` 可能为空 —— 提交出去了但没读到行号）。`reason` 枚举：`unsupported-url` / `empty` / `language-missing` / `no-tab` / `not-logged-in` / `problem-missing` / `rejected` / `page`；认不出的折成一句兜底文案 |
| `cp-submit-status` | 扩展 → 页面 | 同一个 `requestId` + `submissionId` + `verdict`：提交成功之后，扩展在 `/my` 页上盯着这一条，判定每变一次广播一条（`testing` 之后才有终态）。判定码 `ac` / `wa` / `tle` / `mle` / `re` / `ce` / `other`，由站点翻成一句话。终态之后站点收掉等待，扩展也收掉自己开的标签页 |
| `cp-contest-states` | 页面 → 扩展 | `requestId`：请扩展读 `/contests/page/1` 每场的报名状态（2026-10-27 加）。**只在赛程页可见、且手里那份超过 3 分钟时发**，不轮询 |
| `cp-contest-states-result` | 扩展 → 页面 | 同一个 `requestId` + `ok` + `reason` + `states`（`{ [contestId]: 枚举 }`；枚举 `open` / `before` / `closed` / `registered` / `count` / `unknown`，认不出的当场丢掉）。`reason` 枚举：`not-logged-in` / `challenge` / `page`，空串 = 正常 |
| `cp-register` | 页面 → 扩展 | `requestId` + `contestId` + `unrated`（布尔，2026-10-30 加，缺省 = 计分）：替用户报名（2026-10-27 加）。**只有在确认卡片上点「确认」之后才发**，不可逆 |
| `cp-start-virtual` | 页面 → 扩展 | `requestId` + `contestId`：替用户开一场虚拟参赛（2026-10-27 加）。与报名同一条信任边界，只在确认后发 |
| `cp-register-result` / `cp-start-virtual-result` | 扩展 → 页面 | 同一个 `requestId` + `ok` + `reason`：`reason` 枚举 `not-logged-in` / `challenge` / `page` / `not-eligible` / `already-registered` / `rejected` / `unrated-unavailable`（2026-10-30 加：要的是不计分，可这一场的表单里没有那颗控件 —— **这次报名没有发生**）；认不出的折成兜底文案 |
| `cp-unofficial-rank` | 页面 → 扩展 | `requestId` + `contestId` + `handles`（字符串数组）：问这些 handle 在一场里的非正式名次（2026-10-27 加）。只在用户点按钮时发，不轮询 |
| `cp-unofficial-rank-result` | 扩展 → 页面 | 同一个 `requestId` + `ok` + `reason` + `rankSource` + `ranks`：`rankSource` 是 `friends` / `page1`（名次从哪一页读的，两者名次口径相同）；`ranks` 是 `[{ handle, rank, unofficial }]`，只回数字与布尔。`reason` 枚举同上一条。⚠️ 这一页叫 `rankSource` 而不是 `source` —— 信封自己的 `source` 是 `competitive-companion` 这个标记，`postToPage` 是「先写标记再展开 payload」，同名会把标记盖成 `friends`，站点整条消息丢掉（2026-10-27 实测：名次一直停在「查询中…」，直到 40 秒超时才发现） |

**⚠️ `cp-cf-check` 的硬边界（2026-10-11 定，改这块前先读）**：这四个值来自**扩展自报**，伪造一个扩展就能对任意 handle 回答 `match`。所以它**只能决定界面显示什么，绝不能参与「放行什么」** —— 身份证明始终是服务端那条 `user.info` + Last name（`verifyAndSave`），一个字都不能改。站点侧落点是 `cloudSession.js` 的 `cloudCfStatus` / `cloudCfHint`：后者只产出那一行提示的 `tone`（`'ok'` / `'warn'` / `''`）与 i18n 键，不碰任何按钮的可用性，更不碰验证。也别把它升格成「跳过取码」的依据 —— 那等于把 UI 提示当鉴权用，整条安全模型当场塌掉。

**能力协商（`capabilities`，2026-10-11 加）**：`cp-info` 的 `info` 里多一个字符串数组，声明这台扩展**会做**哪些额外动作，目前是 `fill-code`（能代填验证码）、`cf-check`（能回答「登的是不是这个 handle」）、`contest-batch`（能整场抓样例，2026-10-19 加）、`fill-saved`（代填会跑到保存落定、然后关掉它开的那个页并回报，2026-10-20 加）、`submit-code`（能把代码提交到 Codeforces 并盯判定，2026-10-23 加）与 2026-10-27 加的四条比赛能力：`contest-schedule`（能读赛程上的报名状态）、`contest-register`（能替用户报名）、`contest-virtual`（能开虚拟参赛）、`contest-unofficial`（能读含非正式参赛者的名次）与 2026-10-30 加的 `contest-register-unrated`（报名时能拨「计分 / 不计分」那颗控件 —— 只有标明 Unrated allowed 的轮次，CF 的报名表单里才有它）。**几条分开列是刻意的**：一个管「能干活」、一个管「能答话」，互不蕴含，合成一条会让「支持代填但不支持预检」的版本无路可走；四个比赛能力同样互不蕴含，站点按格子的能力各自决定画不画那个按钮，不替扩展猜。站点侧 `useCompanionBridge.js` 导出 `canFillCode` / `canCheckCf` / `canScrapeContest` / `canFillSaved` / `canSubmitCode` / `canReadContestStates` / `canRegisterContest` / `canRegisterUnrated` / `canStartVirtual` / `canReadUnofficialRank`（都是 `(info.capabilities ?? []).includes(...)`）。**刻意不按版本号比大小**：那笔账一旦记错方向就反了，而且每加一条能力都要回来改比较逻辑。老扩展不带这个字段 → 落空数组 → 按钮不出现、这一问不发，行为与改动前一字不差（这是「加一对消息不必两边同版发布」的前提）。

**这几个协议名是与 `CC-for-Web` 仓库的跨仓契约**（`cp-ping` / `cp-task` / `cp-info` / `cp-config` / `cp-set-config` / `cp-page` / `cp-fill-code` / `cp-fill-code-result` / `cp-fill-code-saved` / `cp-cf-check` / `cp-cf-check-result` / `cp-scrape-contest` / `cp-scrape-contest-done` / `cp-submit` / `cp-submit-result` / `cp-submit-status` / `cp-contest-states` / `cp-contest-states-result` / `cp-register` / `cp-register-result` / `cp-start-virtual` / `cp-start-virtual-result` / `cp-unofficial-rank` / `cp-unofficial-rank-result`）：改任何一条都必须同步改扩展并发新版插件，否则新站点与老插件互相认不出、抓题直接失联。`cp-fill-code` / `cp-cf-check` / `cp-fill-code-saved` 这几条在「**加**出来的消息不必同版」上：老扩展不认识就不回，站点按超时收场，且因为能力协商，那颗按钮与那一问在老扩展下根本不存在。**但反过来不成立**——老站点配新扩展时 `capabilities` 被忽略，新扩展照旧只做它原来那些事，不会多事（`cp-fill-code-saved` 这条额外广播老站点压根没有监听，收到也不理）。`cp-submit` 这一组同理：能力 `submit-code` 不在 → 站点连按钮都不画。

站点侧的纪律：**只认本窗口、同源**的消息（`event.source === window && event.origin === location.origin`，挡掉 iframe 与外部页面伪造）；回包只认自己那一轮的 `requestId`（改配置的那一路回包同样按 `requestId` 在 `pendingConfigs` 里认领，`CONFIG_TIMEOUT = 1000` 没等到就当失败）；`taskId` 进 `seenTaskIds` 去重（同站多开标签页时扩展会广播）。握手会按 `PING_DELAYS = [0, 400, 1500]` 连探三次——内容脚本只在页面加载时注入一次，扩展被重载过而页面一直没刷新时会失联，多探几次能救回来；最后一次仍无回音才判定「未安装」（`PING_TIMEOUT = 500`）。

### 13.2 落盘结构（**动之前先想清楚**）

```
/<年月>/<OJ 标签>/<难度>/<题名>.cpp   用户写的题解 —— 只在首次导入时创建，此后一个字都不动
    · node.meta     题目信息：url / oj / difficulty / date / timeLimit
    · node.config   抓取结果：含全部测试样例 —— 每次抓取整体覆盖
```

**没有外层 wrapper**（2026-09-30 改）：题目目录直接挂在根下，与用户自己建的 `main.cpp` 平铺。此前是 `/Problems/<年月>/…`，`migrate.js` 会把老工作区里 `/Problems` 下的条目逐个 `rename` 到根一层，再把搬空的 `/Problems` 与 `/Contest` 删掉（标记 `cp.workspaceLayoutV2`，只跑一次；撞名时跳过该项并保留外壳，宁可留壳也不覆盖用户数据）。`migrate.js` 也**不再种子**这两个顶层目录——工作区骨架由用户自己长出来。

**为什么去掉 wrapper**：抓题是「按月归档」的形态，年月目录本身已经足够表达「这批是抓来的」；再套一层 `/Problems` 只是让树多一层无信息量的父节点。

- `<年月>` 取**当天本地时间**的 `YYYY-MM`（`todayMonth()`，`todayISO().slice(0, 7)`）。粒度到月：按天会长出大量只含一个文件的目录。
- `<OJ 标签>` 取自 `services/problemMeta.js` 的 `OJ_LIST` 中文标签（洛谷 / Codeforces / …），认不出来落 `其它`。OJ 由题目 `url` 的域名判断（`problemImport.js` 的 `OJ_HOSTS`，带子域名的按 `endsWith` 匹配）。
- `<难度>` 导入时**一律为空**（来源站点口径不一，由用户手填），先落 `未分类` 占位。用户事后填难度**不会**搬动已有文件——路径一旦定下就跟着题走，分层只对之后新抓的生效。这是一条纪律，不是待补的漏洞。
- **比赛导入（2026-10-26 加）的第三层是 `<比赛名>`，不是 `<难度>`**：`importProblem(task, { contestName })` 给了比赛名就落 `/<年月>/<OJ>/<比赛名>/<题名>.cpp`，难度只写进 `meta`。文件名同时去掉比赛 ID 前缀（`A. 1+2=3` 而不是 `CF2272A 1+2=3`）。这与「路径一旦定下就跟着题走」不冲突：只影响**之后新导入**的题，已有题仍按 url 找回原文件、不搬不改。
- 为什么不留「题名」目录、为什么题目信息挂在节点上而不是另立文件、为什么认 `url` 不认文件名 / 路径：全在第 5 节坑 18。
- `config` 里**原样保留**扩展送来的所有字段（`tests` / `timeLimit` / `memoryLimit` / `testType` / `input` / `output` / `group` / `interactive` / `name` …），只额外补 `oj` 与 `importedAt`：少存一份，将来要加模板或按批次分组就得回头重抓。
- 旧版这两样是同级的隐藏文件 `.cph/<题名>.json`，2026-10-01 起取消：`migrate.js` 的 `migrateProblemMetaInline()`（标记 `cp.problemMetaInline`）把 json 内容搬进 `node.config` 后连目录一起删；**配对不上（同名代码文件找不到）或 json 坏了就原样保留**，不猜。`meta` 不在这趟迁移里——题目身份本来就在导入时写进节点了。
- 代码文件后缀**暂时写死 `.cpp`**：扩展送来的 `languages` 里只有 `java`（TaskBuilder 的固定默认值），拿它判语言等于把每道题都当 Java，`cpp` / `python` 这些键上游解析器根本不写。等真做了模板功能再改这里（`CODE_EXT`）。
- 题名清洗（`sanitizeName()`）：非法字符换 `-`、空白收成一个、连续短横收成一个、**结尾的点 / 空格 / 短横剪掉**（题名里问号极常见，`Is It a Tree?` 替换完会留个尾巴），超长截到 80 字。全空退回「未命名题目」。
- 中间几层由 `ensureDirectory()` 逐级建（`createDirectory` 要求父目录已存在），整趟在一个 `vfs.batch()` 里，界面只重建一次树。
- 用户手填的**难度保留**、日期只在首次播种，其余（`url` / `oj`）每次刷新——见坑 18。

### 13.3 安装包的分发

- 包放在 `public/extension/cc-for-web-<版本>.zip`，站内直接给下载（`<a download>`），**不做自动更新机制**：装完要升级就重新下载解压、再在 `chrome://extensions` 里点一次刷新。
- 发新版的三步：`CC-for-Web` 里 `pnpm build:chrome` 构建 → 把 `build-chrome/` 打包成 `cc-for-web-<新版本>.zip` → 拷进本站 `public/extension/`，**同时**改 `services/extensionPackage.js` 里的 `EXTENSION_VERSION`（`EXTENSION_FILE` 与 `EXTENSION_DOWNLOAD_URL` 都从它派生，2026-10-12 起那份数据的唯一出处就是它，别再去面板里找）。文件名必须换（第 5 节坑 20），「原地覆盖同名文件」能坑掉所有已下载过的用户。
- 安装提示写在设置视图那一组里，**两条路并列**（2026-10-10 改，Firefox 上架后）：
  - **Chrome**：下载 → 解压 → `chrome://extensions` 打开「开发者模式」→「加载已解压的扩展程序」选中解压出来的目录。Chrome 版**仍未上架**，这条手动路是它唯一的安装方式，别把这一段说成「一键安装」。
  - **Firefox**：**已上架 AMO**，那一行右侧多了一颗按钮直接外链 `https://addons.mozilla.org/zh-CN/firefox/addon/cc-for-web/`（常量 `FIREFOX_EXTENSION_URL`，在 `services/extensionPackage.js`），点一下就装，这才是真的一键安装。**这个地址不随版本走**（AMO 那个页面永远指向最新获批版本），换包时不用动它，也不在上面「改一处常量」之列。
- **安装文案有四处、口径必须一致**（2026-10-11 起；同日按浏览器分流又改过一遍）：设置页 `settings.extension.hint*`（**不再是单个 `downloadHint`** —— 面板按 `BROWSER` 只挑一条显示，见 13.6）、`src/i18n/messages/help.js` 的「怎么把题目抓进来？」条目（中英两栏）、`guide.html` 与 `guide.en.html` 第 5 节——四处都写成「那一栏会认出你的浏览器、只给你一条对应的装法」，手动加载那几步的前缀**从（Chrome）改成（Chromium 内核）**、地址写成 `chrome://extensions`（Edge 是 `edge://extensions`），并在 notes / 列表尾带两条固定口径：① Firefox 已上架 Mozilla 附加组件商店一键装，**Chrome 与 Edge 的商店版都还没上架**（两家都只能手动加载）；② **手机 / 平板上目前只有安卓的 Firefox 能装本插件**（安卓的 Edge 已支持扩展，但本插件还没上架 Edge 加载项；Chrome 手机版完全不支持扩展）—— 这是给手机 / 平板用户的正式建议。⚠️ 第 ② 条 **2026-10-11 更正过**：原话是「移动端只有安卓的 Firefox 支持扩展」，而 Edge 安卓自 2025 起已支持扩展，那句已经不成立。（`docs/使用手册.md` 与 `index.html` 的 `<noscript>` 不含安装步骤，不在其列。）
- **当前在站的版本：`2.69.0`**（2026-10-30 换版。两件事：① **已报名的行认「Registration completed」** —— CF 对已报名比赛渲染的就是这句、里面没有 `registered` 一词，旧判据 `/registered/i` 一路落到 `unknown`，赛程那格只能画成「—」；② **报名可选「计分 / 不计分」** —— 新增能力 `contest-register-unrated`，确认卡片对报名多一行选择，扩展按控件文字去拨那颗开关，拨不动就回 `unrated-unavailable`、这次报名不发生（见坑 68）。清单**一条未改**）。
  上一版是 `2.68.1`（2026-10-28 换版。只改扩展侧一件事：**后台每次启动时给已打开的目标网站标签页补注入 `js/bridge.js`**（`background.ts` 的 `ensureBridges`），于是装上 / 更新 / 在扩展管理页点「重新加载」之后**不必再刷新页面**，站点探活当场就能拿到 `cp-info` —— 修的正是 13.7.1 列入的第三种「装了也探不到」。清单**一条未改**（`scripting` 与站点 host 权限本来就在），关键是 `bridge.ts` 末尾加了幂等标记 `window.__cpBridgeInstalled`：两条注入路径（content_scripts 与 executeScript）落在同一个隔离世界，重复注入是空操作，否则一次 `cp-ping` 会回两条 `cp-info`、一条 `cp-task` 会入库两次。实测见下面那条「补注入的实测」）。
  再上一版是 `2.68.0`（2026-10-26 换版。**比赛核心功能**：四对跨仓消息 + 四条能力，`host_permissions` 190→195、`content_scripts` 4→5，详见 13.1 与 22 节那条 P1）。
  更早一版是 `2.66.4`（2026-10-11 换版。两项改动，都是云同步登录的便利：① **验证码代填** —— 用户在本站点那颗按钮时，扩展去 Codeforces 的 Social 设置页把本站取到的码写进 Last name 并提交（只写这一格，不读 cookie、不读凭据）；② **登录态预检** —— 扩展在本地比对本浏览器登录的 handle 与用户填的是否一致，只回 `match` / `mismatch` / `not-logged-in` / `unknown` 四个枚举、**绝不回用户名**。清单随之变化：`host_permissions` 183→184 条、`content_scripts` 2→3 条（多出的一条只注入 `https://codeforces.com/settings/social*`，**不进 parser 注册表**），API `permissions` 一条未新增。站点侧已换包，AMO 侧两个包都已出好 —— **但还没上传 AMO**）。
  更早是 `2.66.3`（2026-10-10 换版。三项改动：① **Firefox for Android 支持**——manifest 增加 `gecko_android`（下限 142，因 `data_collection_permissions` 安卓端 142 才认识），并修复后台脚本在安卓上的两处致命崩溃：`contextMenus.onClicked` 顶层访问、`commands.getAll()`，这两个命名空间在安卓端整个不存在（MDN BCD：`menus`/`commands` = `ff_android false`），原代码在模块求值时抛 TypeError 把整个 background 带走，安卓上表现为网站「未检测到插件」、点图标无反应——已在真机 Firefox 143.0.2 实测通过（三星 SM-S9010 / Android 16）；② 来源站点注入范围改由 parser 注册表推导（`host_permissions` 6→183 条、自动解析脚本 2→182 条）；③ Firefox 端 manifest 描述加注「Fork of Competitive Companion, now also working on Firefox for Android.」（`extension.ts` 的 `descriptionOverride`，只挂 Firefox 目标——Chrome/Edge/Opera 的移动端根本不支持扩展，挂上就是失真）。AMO 提审包 `dist/cc_for_web-2.66.3-firefox.zip` 已打好，源码包仍需**先提交全部改动**再 `git archive`）。
  此前是 `2.66.2`（2026-10-01 当天两次换版。先是 `2.66.0`，行为改动是**插件与网页之间握手用的消息名去掉 `cph-` 前缀、统一成 `cp-`**——`cp-page` / `cp-task` / `cp-ping` / `cp-get-info` / `cp-info` / `cp-set-config` / `cp-config`，见 13.1 那张表；**这是破坏性改动，站点与插件必须同版发布**，老插件配新站点会静默失联且没有任何报错；当天接着升到 `2.66.2`，把「打开题目页就直接抓」改成**现场问答契约**——先问工作区实况再决定抓不抓，消息名不变，站点与插件同样要同版）。上一次是 `2.65.3`（2026-09-30：「可在本站设置页直接切换投递目标」）、`2.65.2`（同一天：「双投」）。每次换版都按上面三步走：`package.json` 改版本号 → `node scripts/build/extension.ts chrome true false`（本机没装 `pnpm`，直接 `node node_modules/tsx/dist/cli.mjs` 等价调用）→ 打包 `build-chrome/` 成 `cc-for-web-<版本>.zip`（`cd build-chrome && zip -r -X ../cc-for-web-<版本>.zip *`；用 `*` 而不是 `.`，否则条目会带上 `./` 前缀；`web-ext build` 也行，但它会加 `-chrome` 后缀、名字和站内现有的不一致）→ 拷进 `public/extension/`、删掉旧包、站点 `EXTENSION_VERSION` 改同号。`NOTICE.md` / `NOTICE.en.md` 第四节必须同步改（那份文件自己规定「换 `public/extension/` 里的包」就要回来核对），改完跑 `npm run notice` 重新生成 `notice.html` / `notice.en.html`——**这两个 html 是生成的，别手改**（第 12 节）。
- **换包会牵动站点侧的几个常量/文件**（一次别落下一个）：`services/extensionPackage.js` 的 `EXTENSION_VERSION`（`EXTENSION_FILE` / `EXTENSION_DOWNLOAD_URL` 都是从它派生的；**这份数据只有一个消费者入口** —— 设置面板与齿轮菜单都从它 import，2026-10-12 起不再各存一份）、`public/extension/` 下的 zip、`NOTICE.md` + `NOTICE.en.md`。`public/extension/` 不在 SW 的 `STATIC_ASSETS` 里，靠换文件名让老用户拿到新包。**旧包不删**（2026-10-30 定，与上面 2.66.2 那条历史记录里写的「删掉旧包」相反）：停在旧页面的人手里那份 `dist` 写死的是旧文件名，Vercel 只留当次构建，删了就是 404；体积换可用性，留着。
- **换版本还要同步两份上架材料**（2026-10-11 加）：`CC-for-Web` 仓库里的 `SUBMISSION-AMO.md`（AMO 商店页）与 `SUBMISSION-EDGE.md`（Edge 商店页）是那两处文案的**唯一出处**，改了扩展行为就得回来改它们 —— 判据是「审核员或用户会不会看到」。新增内容脚本 / host 权限 → 两份的权限清单与数字都要改；新增「替用户提交表单」这类动作 → **Edge 的 §2.4 Data usage 必须改**（写成「只在用户点击那一刻读当前页」而实际会自己读，等于与行为不符，会被判违反 developer policies）。每一版到底新增了哪段、哪些数字变了，都记在 `SUBMISSION-AMO.md` §3 版本记录里，照那一行的口径改。

### 13.4 全局快捷键

- 动作表 `SHORTCUT_ACTIONS`（**11 项**；2026-09-28 多了 `switch-panel`，2026-10-10 多了 `rename-node` / `delete-node`，2026-10-12 多了 `select-all-nodes`，2026-10-23 多了 `submit-solution`，另有 `export-image`；其中后三条是 `fixed` + `hideInSettings`，**不在设置面板的列表里**）就是全部能力边界，**没登记的动作就是做不到的**（理由见第 7 节）。加动作 = 改这张表 + 在 `App.vue` 的 `SHORTCUT_HANDLERS` 里补一条同 id 的处理函数，两处 id 必须对上。设置视图那个「快捷键」分组是 `v-for` 出来的（数据源 = `SHORTCUT_ACTIONS` 滤掉 `hideInSettings`；`fixed` 的行分流成只读徽标，目前没有这样的可见行），加普通动作不用改 UI。
- `switch-panel`（默认 `Mod+Shift+KeyE`，label「切换侧栏面板」，2026-09-28 加）等价于点页头那枚胶囊。处理函数是 `App.vue` 的 `switchSidebarPanel()`：先 `if (!panelVisible.value) togglePanel()` 把侧栏捞回来，再 `sidebarRef.value?.switchPanel()`。**翻面只有 `Sidebar.vue` 一处实现**——`switchPanel` 就是它内部 `togglePanel` 直接 expose 出来的，所以滑动动画（`hasSwitched`）、`localStorage` 持久化与点胶囊完全同源；别在 App 里另写一份改 `activeTab` 的逻辑，那样键盘切过去会没动画、还多一份状态。**先捞侧栏是刻意的**：侧栏收起着的时候只翻那个看不见的面板，用户会以为快捷键没生效。
- `rename-node`（**按平台分岔默认键位**，2026-10-20 用户要求：macOS 上 F2 被系统占成调屏幕亮度、且 Finder / VS Code 都是单按回车改名 —— **mac 默认 `Enter`、Windows / Linux 仍是 `F2`**。**2026-10-25 起这条键位写死**，见本节末那条 `fixed`；`cp.shortcuts.mac-enter` 那个迁移标记键随之作废，读盘时顺手 `removeItem` 掉，别再指望它。F2 仍是这个动作的**别名键** `aliases` —— 别名不进绑定表、界面只显示主绑定，但匹配与冲突检测都认它，所以把 F2 绑给别的动作仍会被红字拦下。Enter 是裸键，`bareCodes` 在 mac 上点名放行）/ `delete-node`（默认 `Delete`）/ `select-all-nodes`（默认 `Mod+KeyA`，2026-10-12 加）**与上面那 8 条不是一回事**（前两条 2026-10-10 加）：它们**作用域受限**，只认「资源树里当前有焦点的那一行」，所以**不要**往 `SHORTCUT_HANDLERS` 里加 —— 加到它下面那张 `SHORTCUT_TREE_HANDLERS`：先过 `treeScopeFrom(event, actionId)` 闸门（焦点在 `[data-panel="explorer"]` 里、且不在任何可编辑元素里；**行上或树的空白处都算**。`rename-node` 另加两道，2026-10-20 —— 它在 mac 上是裸 Enter，误触的代价是「在编辑器里按一下回车，树上的文件被改了名」：① `document.activeElement` 也必须在树里（不能只信 `event.target`，合成事件 / 窗口刚激活那一瞬两者会对不上）；② 落点不在按钮 / 链接上 —— 那类元素自己的 Enter 是「按一下」），再调 `FileExplorer` 经 `defineExpose` 给出的 `startRename(id)` / `requestDelete(id)` / `selectAllNodes(id)`（**三条都收可空的行 id**，null = 焦点在树的空白处；前两条与右键菜单**同源**，不另写一份）。`delete-node` 的删除对象是**整个选区**（那一行不在选区里时才只删它自己）；全选收的是**行 id**（可空）—— 它要的是**这一行所在父文件夹里的全部内容**（`folderContentIds()`：目录**递归展开** —— 选中一个目录 = 连它里面的文件一起选中；折叠目录内部也算，**不是** Shift 扩选用的那套「可见行」，两条口径刻意不同、别顺手统一；2026-10-12 口径改过三次：先「全选可见行」→「全部节点」→ 收窄成「焦点所在文件夹」→ 再补上「目录连带其内容」）。⚠️ 顶层节点的 `parentId` 是字面量 `'root'`，而索引里那份根是 `stat('/')` 的浅拷贝、**没有 children** —— 顺着它取孩子会拿到空数组（⌘A 静默不选任何东西），顶层一律读 `workspace.tree`。
- **这三条是 `fixed` + `hideInSettings`（2026-10-25 两条用户口径：「这几个设置没有意义，应该固定死」→「删去设置页面快捷键的这几项」）**：`SHORTCUT_ACTIONS` 上多了 `fixed: true`（语义是**键位写死**）与 `hideInSettings: true`（语义是**不进设置面板的列表**），四处配合缺一不可 ——
  - `readBindings()` 跳过它们（老存档里存着 `rename-node: 'F2'` 也不算数，mac 上照样是回车）；
  - `setBinding()` 返回 false、`clearBinding()` 直接 return（设置界面上根本没有入口，这两道是防「以后有人接别的 UI」）；
  - 设置面板 `v-for` 的数据源是 `SHORTCUT_ACTIONS.filter(a => !a.hideInSettings)`（`EditorSettingsPanel` 的 `settingsShortcutActions`），所以**这三行整行不画**：既没有录制框，也没有只读徽标。模板里 `v-if="action.fixed"` 那条只读徽标分支（`.shortcut-key.is-fixed` + title「固定键位，不可改绑」）与对应文案 / 样式**都还留着**，只是眼下没有可见的 `fixed` 行、永不渲染 —— 将来真有「写死但仍要露个键位」的动作时不用再回来改模板。
  - **别把这三条从 `SHORTCUT_ACTIONS` 里删掉**：执行走 `App.vue` 的 `SHORTCUT_TREE_HANDLERS`、冲突检测要它们占住 ⌘A / Delete、`FileExplorer.shortcutOf()` 的右键键位也读 `bindings` —— `hideInSettings` 只作用于面板。
  - 冲突检测**不用改**：它们照旧留在 `bindings` 里当「已占用」，别的动作抢 ⌘A / Delete 仍会被红字拦下。
  判据（写进代码注释了）：这三条不是本应用自造的命令，而是文件树的通用约定、前两条还是裸键，改绑只会让肌肉记忆失效、并让 hint 里的平台说明与界面上的键位互相打架；而写死之后面板上只剩一行不可点的徽标、hint 还得解释「为什么改不了」，纯噪声 —— 判据是「这条动作在面板里有没有可操作的东西」。**别拿 `fixed` 去「锁」可配置的动作**。
  实测（2026-10-25 第二轮，dev + 无头 Chrome，中英各一遍）：面板 **8 行动作 + 「恢复默认」**、固定徽标 **0** 个、录制框 8 个 / 清除钮 8 个，行序与 `SHORTCUT_ACTIONS` 滤后一致；模块侧 `hideInSettings` 恰好那三条，`bindings` 仍是 `Enter` / `Delete` / `Mod+KeyA`，`actionForCombo('Mod+KeyA')` = `select-all-nodes`、`('Delete')` = `delete-node`，`setBinding('rename-node','F8')` 仍 false。（徽标还在展示时那次实测：徽标 3 个、三类控件高 28 / 宽 124 / 右缘 1371 完全一致；`clearBinding('select-all-nodes')` 后仍是 `Mod+KeyA`；`actionForCombo` 对 `Enter` / `F2` 都解得 `rename-node`。）
    - **⌘·Ctrl+A 另有一条「指针在哪一块」的判据**（2026-10-12 加；重命名 / Delete 没有 —— 2026-10-20 起重命名的隔离走上面那两道 activeElement / 按钮判据）：桌面端点开一个还没打开过的文件行时 `EditorPane` 会把焦点抢进 Monaco（`if (!isTouchPointer()) instance.focus()`），只看 DOM 焦点的话「点文件 → 马上 ⌘A」全选的是代码。`App.vue` 因此挂了一条 `pointermove`（**只记 `pointerType === 'mouse'`**，触摸 / 笔不记账），按键时 `elementFromPoint` 现算：指针在资源管理器里 → 按「焦点在指针底下那一行」算；指针在 `.pane--editor` 里 → 一律放行给编辑器自己的「全选代码」；指针在别处 / 根本没有指针 → 退回 DOM 焦点判据。理由与另外两条同款坑见第 5 节坑 41。⌘/Ctrl+A 在编辑器里是「全选文本」，两边靠这道闸门分开：焦点不在树行上就整条放行。闸门必须拦在 `preventDefault()` 之前（不在树里就整条放行，否则编辑器里按 Delete 会删不掉字符反倒弹删除框）；`Delete` 是**裸键**，靠动作自己的 `bareCodes` 放行、由 `bareAllowedFor()` 判定（录制框共用它，否则这条动作被清掉就再也录不回来）。四条坑与两条实测口径见第 5 节坑 34。
- 展示：编辑器底部状态栏那枚运行提示读的是 `formatCombo(bindings.run)`，键改了提示跟着变（`EditorPane.vue`）——**别把它写成写死的 `⌘↵`**。同一口径还有两处：文件树右键菜单右列的键位读 `bindings['rename-node']` / `bindings['delete-node']`（`FileExplorer.shortcutOf()`），编辑区右键菜单读 `useEditorMenu.js` 的 `SHORTCUT`。
- 冲突检测分三类，都在 `shortcutConflict()` 一处：浏览器原生键（`BROWSER_RESERVED`）、没带修饰键又不是功能键 / `Esc` / 该动作 `bareCodes` 里点名的那个裸键、已经绑给别的动作。冲突时录制框**停在录制态显示红字、不写入**，用户可以接着按别的组合，不用重新点一次。
- `resetAll()` 复位成默认表；单条可用 Delete / Backspace 清除（清成空串 = 未绑定，不是删键）。两道**边界**：① 上面那三条 `fixed` 清不掉也改不动（面板里根本不列它们，见上一条）；② 某个动作自己的键位正是它 `bareCodes` 里点名的裸键时（历史上只有 `delete-node` 与 `Delete`），录制态不当清除、当录制收下 —— 随着 `delete-node` 变 `fixed`，这条保护现在只剩「`bareAllowedFor` 别删」这一层意义。
- 原理、坑与「为什么不能改回 `editor.addCommand()`」全在第 5 节坑 21、22。

### 13.5 改这块时最容易连带踩到的

- 改落盘结构 → 老用户已导入的题目不会迁移（当初的决策就是「不迁移，只对新抓取生效」），别顺手写个迁移把人家的题解搬丢了。
- 改设置视图的分类 → **不用再动脚本了**（2026-10-01 起 B 步逐项点开验行为，不再数个数；原来这里写着「`navItems` 那个数字要跟着改」）。
- 改扩展的 `TARGET_SITE_PATTERNS` / 开发端口 → 插件与网站是对着 `5199` 写死的，**两边必须一起改**（改了端口插件就再也找不到网站了）。
- 加/改「网页能改的扩展配置」→ 三处要一起动：扩展 `background.ts` 的 `WRITABLE_CONFIG_KEYS`、`getExtensionInfo()` 里读出来的 `config` 字段、站点 `EditorSettingsPanel.vue` 的 `EXTENSION_DESTINATIONS`（键名与文案），以及 `useCompanionBridge.js` 里 `cp-config` 回包的处理。网页端**没有**写扩展存储的能力，只能走这条消息通路。
- 动过扩展就要**升版本号 + 换 zip 文件名**（同版本号原地覆盖会被 SW 的 `cacheFirst` 坑住，见第 5 节坑 20），站点侧四个消费方一并改（见 13.3）。
- 改 `useCompanionBridge.js` 里的**消息名**（`cp-ping` / `cp-task` / …）→ 那是与 `CC-for-Web` 的**跨仓契约**，必须同步改扩展的 `src/bridge.ts` + `src/background.ts`，再升版本号发新版（2026-10-01 就是一次这样的改动：`cph-*` 全改成 `cp-*`）。**结论是「两边不同版就完全失联」**，而且失败是静默的——只剩「未检测到插件」。注意 `EXTENSION_SOURCE`（`competitive-companion`）是**扩展上游的标识，不是这次那批消息名，改它等于单方面毁约**；`PAGE_SOURCE` 才是本站自己的那半边。
- **插件快捷键读回来是空串时，界面必须说清「为什么没有 / 去哪儿绑」，不能只留一个「未设置」**（2026-10-12 加，用户报障「我在 chrome 浏览器中，看不到浏览器快捷键是什么」）。真因不在站点：Chrome 只在**安装插件那一刻**按 manifest 的 `suggested_key` 绑一次（`Ctrl+Shift+U`，macOS 上 Chrome 自己翻成 `⌘⇧U`），那一刻键位被别的扩展占着、或用户后来清掉过，就**再也不自动绑**，`commands.getAll()` 回的就是空串 —— 站点怎么改都变不出一个键来。实测复现（2026-10-12）：**另装一个同样申明 `Ctrl+Shift+U` 的扩展，Chrome 会让两边都留空**，`chrome://extensions/shortcuts` 上两行都摆着「输入快捷键」的空框 —— 那条命令在那里叫**「激活该扩展程序」**，一直是可绑的，所以引导闭环是「复制上面的地址 → 绑一个空闲键 → 回来点重新检测」。落点：两句文案 `settings.extension.shortcutUnassignedNote`（命令都在、键位全空）与 `shortcutEmptyNote`（一条命令都没上报），由 `extensionShortcutsUnassigned` / `extensionShortcutsEmpty` 二选一，**只在异常态出现**（正常有键位时两条都不渲染，别改成常驻说明）。
  **唯一的例外是「新增一对消息 + 能力协商」**（2026-10-11 的 `cp-fill-code` 就是这么加的）：老扩展不认识新消息就不回，站点按超时收场、且能力协商让那颗按钮根本不出现，所以**不必两边同版**。要新增能力时照这个形状做，别去动已有消息的载荷。
- ⚠️ **代填与预检这一对站点侧已发、AMO 侧还没上传**（2026-10-11，版本 `2.66.4`）：`CC-for-Web` 里 `src/fillCode.ts` / `src/cfIdentity.ts` / `bridge.ts` / `background.ts` / `models/messaging.ts` / `scripts/build/extension.ts` 都已改好并提交；`dist/cc_for_web-2.66.4-firefox.zip` 与 `dist/cc_for_web-2.66.4-source.zip` 都已出好（源码包已按 `BUILD-INSTRUCTIONS.md` 空目录复现过，产物与上传包一致）。**站点侧已换包**：`public/extension/cc-for-web-2.66.4.zip`（chrome 产物）、`EXTENSION_VERSION` 已改 2.66.4、`NOTICE.md` / `NOTICE.en.md` 已同步（走的是 13.3 那三步）。**但 AMO 线上仍是 `2.66.3`**（到今天只有 `2.66.2` / `2.66.3` 两版），所以 Firefox 用户那颗「在 Codeforces 上自动填写」按钮与那行预检提示**还看不到**（从本站下 zip 手动装 Chrome 版的能看到）—— **只差最后一步：把两个 zip 传 AMO**。**API `permissions` 一条没新增**（预检读的是公开 DOM，不碰 `cookies`）；但 `host_permissions` 从 183 涨到 **184**、`content_scripts` 从 2 条涨到 **3 条**，这两个数字要在提交材料里说明（纪律写在 13.3）。
- 取码那一步的三处便利（复制 / 代填 / **预检**）**状态与动作都在 `services/cloudSession.js`**（`codeCopied` / `copyCloudCode` / `filling` / `fillCloudCode`，以及预检的 `cloudCfStatus` / `cloudCfHint`，且把 `canFillCode` / `canCheckCf` 从桥那边转出来），面板与齿轮菜单只消费 —— 同 13.1 那条纪律，两边不许各存一份。代填成功只提示「已填好，回来点验证」，**验证那一步刻意不替用户点**：服务端要的是「确认这一次写入」。预检**只换那一行提示的文案与颜色**（`cloudCfHint` 产出 `tone: 'ok' | 'warn' | ''`），不改任何按钮行为 —— 刻意不做「没登录就把按钮换成『去 Codeforces 登录』」那类重排，那是行为改动，得先拍板。
- 改插件那一栏的**按钮 / 提示** → 先看 **13.6**：那一栏按 `BROWSER` 只摆一条路，加按钮或改文案都要顺手对一遍「认不出时 fail-open」这条（`unknown` 必须两条路都给），以及 13.3 那张四处文案口径表。
- 改**齿轮菜单那几颗安装 / 更新行**（安装为应用 / 拿浏览器插件 / 插件换新版）、或动安装包的版本与商店地址 → 看 **13.7**：条件写在 `services/settingsMenu.js` 的 `when` 里，安装包数据只有 `services/extensionPackage.js` 一处（「装着的这版旧不旧」也在那里，`isExtensionOutdated`），`useInstallPrompt.js` 是模块级单例（那条别退回每实例一份）。若在 dev 上看到「明明装了插件那一行还在」→ 直接看 **13.7.1**（生产包的桥不注入 localhost，dev 上要验就用 `pnpm watch:chrome` 的扩展）——那是预期行为，不是这一行的 bug。

### 13.6 按浏览器推荐安装路径（2026-10-11 加；同日「应用」栏改为能力探测）

这一节管**两个互不相干的轴，判据别串用**：

- **「浏览器插件」栏** —— 先认浏览器、只给当前这台真走得通的那条路。判据是 `services/platform.js` 的 `BROWSER` / `BROWSER_PLATFORM`（**UA 推断**，与 `HOST_OS` 同一体例）。
- **「应用」栏的「安装到设备」** —— 状态词与按钮**只看引擎有没有安装 API，完全不看浏览器型号**（也就完全不看 UA）。判据是 `useInstallPrompt.js` 的 `INSTALL_API_SUPPORTED`（属性检测）。**UA 只许决定那行「出路说明」写哪句**（2026-10-12 起，见 13.5 第 4 条），不许回头去改状态词与按钮。

| 导出 | 取值 | 判据（按顺序短路） |
| --- | --- | --- |
| `BROWSER` | `firefox` / `edge` / `chrome` / `safari` / `unknown` | `Firefox/` → `Edg[AE]?/` → `Chrome/`或`Chromium/` → `Safari/` → 兜底 `unknown` |
| `BROWSER_PLATFORM` | `desktop` / `android` / `ios` | `Android` → `iPhone\|iPad\|iPod` → （iPadOS 13+ 报 `Macintosh`，靠 `maxTouchPoints > 1` 分开）→ 兜底 `desktop` |

五条不能破的：

1. **上面这两个只挑文案，不当功能开关**（同 `HOST_OS` 那条纪律）。唯一一处「决定显示什么」的是插件栏摆哪颗按钮，所以**那一处必须 fail-open**：`unknown` 时两条路都摆出来。猜错的代价是用户看不到入口，比多给一条路糟得多。
2. **360 / QQ / 搜狗 / 2345 一律落 `chrome`** —— 它们的 UA 里只有 `Chrome/`，与 Chrome 本尊逐字一样。它们的扩展安装路径本来就与 Chrome 同源（扩展管理页 + 加载已解压），所以不细分不影响结果；**别为了「认出 360」加 UA 特例**，认出来的那部分是少数，多一份分支反而会走偏。
3. **`safari` 那一档刻意一颗按钮都不摆**：Safari 扩展走 App Store 分发，与我们这套完全不通用。它还**收下了 iOS 上的所有浏览器** —— iOS 的 Chrome / Firefox 用 `CriOS` / `FxiOS` 标识、UA 里同样带 `Safari/`，而 iOS 上谁都装不了本插件，归到这一档正好是正确答案（别去认 `CriOS` 再分流，结论一样）。
4. **「装成应用」的判据是能力探测 —— 不是 UA，也不是等事件**（2026-10-11 定）。判据只有一条：`'onbeforeinstallprompt' in window`（`useInstallPrompt.js` 导出为 `INSTALL_API_SUPPORTED`，**属性检测**：同步、零等待、开机就能读）。它问的是「这个引擎有没有实现安装 API」，正好落在真实边界上 —— Blink（Chrome / Edge / 360 / QQ / Opera）为 `true`，Firefox / Safari 与全部 iOS 为 `false`。**2026-10-14 起它多了一层**：属性检测之上还要扣掉三星那一档（见下面第四条纪律，`INSTALL_EVENT_IMPLEMENTED` 是原始事实、`INSTALL_API_SUPPORTED` 才是判据）。四条纪律：
   - **别拿 `canInstall` 当「支不支持」**：那是 `beforeinstallprompt` **事件**的判据，只说明「此刻能不能一键装」。事件不来既可能是「不支持」、也可能是「这一刻条件不满足」（Service Worker 未接管 / 已装过但没被检测到）。两者混成一句，就会写成从前那句「已安装或不支持」，还得靠猜浏览器去补救。现在状态词只回答「支不支持」（三态：**已安装 / 当前浏览器支持 / 当前浏览器不支持**），**按钮亮不亮另由 `canInstall` 决定**，两者不许互相替换。
   - **刻意的取舍，2026-10-12 改口**：Firefox 的网页应用能力**在 JS 里没有任何 API**（`beforeinstallprompt` 在 Firefox 桌面 + 安卓、Safari 桌面 + iOS 上**全都不支持**，MDN 兼容表），所以这一格一律落「当前浏览器不支持」。2026-10-11 曾据此把按浏览器分岔的引导**全删**（`hintFirefoxWindows` / `hintFirefoxOther` / `hintChromium` / `hintMobile` / `hintUnknown`）；**2026-10-12 用户点名恢复**——「没有 API」不等于「这台机器装不了」，Firefox 安卓 / iOS Safari 自己的菜单里就有安装入口，只留一句「不支持」会让人以为没有这条路（报障原文：安卓 Firefox 里「没有在设置中显示安装选项」）。恢复后的形态：**说明行**（`installNoApiHint` + `installNoApiHintKey`，七条 `noApi*` 文案）按浏览器 / 系统挑一句，**状态词与按钮仍只看引擎判据**——UA 分支只许决定「说明写哪句」，两者混起来就又变回从前那套「猜浏览器来解释按钮」。
   - **★ 三星 Internet 是「例外按 UA 认」的唯一一档**（2026-10-14 加，用户报「三星手机的三星浏览器打开网址，没有正确的安装引导，并且设置菜单中没有安装为应用的按钮」）。它是 Chromium 基座 ⇒ 属性检测**假阳性**（`onbeforeinstallprompt` 在、事件却不派发，三星自家文档从未提到这个事件，入口是地址栏那个「＋」徽标与菜单 ›「添加页面到」›「主屏幕」）。于是 `useInstallPrompt.js` 里 `MANUAL_INSTALL_BROWSER = BROWSER === 'samsung'`，`INSTALL_API_SUPPORTED = 属性检测 && !MANUAL_INSTALL_BROWSER`，`canInstall` 也跟着挂上它（免得出现「状态词说不支持、按钮却亮着」）。**这是全项目唯一一处用 UA 决定功能（不是文案）的地方** —— 主纪律不变，它只是「属性检测在已知引擎上不可靠」的例外清单，新加引擎前先问有没有别的路。判据本体是 `platform.js` 的 `BROWSER`（UA 里的 `SamsungBrowser/`，必须排在 `Chrome/` 之前）。配套：说明行走新的 `noApiSamsung`（两项都在 `NO_API_KEYS` / `noApiVariant()`），`app-manual` 自动弹的判据是 `!INSTALL_API_SUPPORTED` ⇒ 三星也会自动弹一次，齿轮菜单另给一颗「安装引导」（13.3 表）。
   - 背景事实（留着备查）：`beforeinstallprompt` 只在 Blink 派发，`appinstalled` 在 Firefox / Safari 也不触发；Firefox / Safari 移动端只能从菜单装（安卓 Firefox 是菜单 › 安装），Safari 桌面 17+ 走「文件 › 添加到 Dock」；网上那套 `about:config` → `browser.ssb.enabled` 早已移除，别再照抄。
5. **插件版本提示不比能力**：装的那一版来自 `cp-info` 的 `info.version`（`useCompanionBridge`），只拿来报「有新版」；**能力一律走 `capabilities` 协商**（13.1），别退回版本号比大小 —— 那笔账记错方向就反了。且「有新版」时**装包那一行不能收**（2026-10-11 定）：没探到与探到旧版**共用同一行**（`extensionActionVisible` = `!extensionInfo || extensionOutdated`）—— 没探到给安装口径（`hint*`），探到旧版换更新口径（`update.label` + `updateHint*`），只有「装了且是最新」才收。那一行是 Chromium 拿包的**唯一入口**（没有商店可点），旧版时把它收掉，用户就只剩一句「本站最新是 vX」可读、没有任何途径拿到新包。版本对照（`updateAvailable`）只说对不上，怎么换新只在行里说一次 —— 两处都写就是重复。
6. **「装过又删掉」按钮一灰到底不是 bug，但必须给解释**（2026-10-12 定）。Chrome 只在**自己认为没装**时派发安装事件；**从 Finder 把 `~/Applications/Chrome Apps/` 里的图标删掉不算卸载** —— 记录还在浏览器 profile 里，于是事件永远不来、按钮永远灰，而状态词照写「当前浏览器支持」，用户看不出为什么。灰按钮本身修不了（没有任何 API 能问「到底装没装」，`getInstalledRelatedApps` 也指望不上），所以能做的只有如实解释 + 给出路：面板在「引擎支持 + 没装 + 拿不到入口」（`installUnavailable`）这一格补一行说明 + 「复制地址」（`chrome://apps`，网页没有权限跳转 chrome://，与插件快捷键那条同一套写法）；已装与不支持两格各有状态词罩着，**不加**。配套纪律：**`appinstalled` 设下的「已装」锁必须能被随后到来的安装事件冲掉**（事件到达 = 「其实没装」的权威证据，见 `useInstallPrompt.js` 的 `onBeforeInstallPrompt`）—— 这把锁别改成只进不出。

**Edge 商店的位置先留在这儿**：`EditorSettingsPanel.vue` 的 `EDGE_EXTENSION_URL` 现在是**空串**，那颗「Edge 版」按钮因此不渲染 —— 刻意如此，宁可暂时少一颗按钮，也不给用户一个点开是 404 的入口。Edge 加载项上架后把 URL 填上，按钮自己出现，其余一处都不用改（`showEdgeInstall` 会跟着亮）。

**怎么验**（临时探针、用完即删；无头 Chrome 只能靠 `page.setUserAgent()` 换 UA，**每个 UA 一个 `browser.createBrowserContext()`**，理由见探针技能第 2 节）：进设置 → 点 `.settings-nav__item` 切到「浏览器插件」/「应用」→ 插件的读 `.setting-row__hint` 与 `a.download-button`（手动那颗带 `download` 属性）；「应用」的读 `.setting-row--action` 里的 `.app-status`（状态词）与那颗 `button.download-button` 的 `disabled`。
⚠️ 三个当场踩到的路：① 设置齿轮是 **`.sidebar-switcher .sidebar-switcher__tab[aria-label="设置"]`，它在 `.sidebar__head` 里、不在 `.sidebar__panel` 内**（按「可见 panel 里找」会一个都找不到）；② 齿轮点完只是弹出 Quick Settings 菜单，还要再点菜单里含「设置面板」那一行（`settings.menu.openSettings`）才开出设置视图；③ **点 `.settings-nav__item` 之后 Vue 是异步渲染的 —— 点完立刻查 DOM 恒查不到**（本轮首跑 `.app-status` 一直为 null，差点误判成「标记类不存在」）。必须等**两帧 rAF**；选目录项别按 index，改成「点一项 → 等两帧 → 查那一组里有没有 `t('settings.app.install.label')` 那一行」，既不依赖界面语言也不会因目录增删而错位。

⚠️ **「应用」那一栏换 UA 是测不动的 —— 它的判据根本不是 UA**（2026-10-11 实测，值得记住）：`page.setUserAgent()` 只改请求头，**改不了引擎的真实属性**，所以八个 UA（含 Firefox / Safari / iOS）跑出来 `'onbeforeinstallprompt' in window` **全是 `true`** —— 看着像「判定彻底失效」，其实是**探针方法错了**。正确测法：`evaluateOnNewDocument` 里 `delete window.onbeforeinstallprompt` 模拟无 API 的引擎（实测该属性是 **`window` 自己的、`configurable: true` 的访问器**，不在 `Window.prototype` 上 —— 所以 `delete Window.prototype.onbeforeinstallprompt` 返回 `true` 但**是空操作**，删了 `in window` 仍为 `true`，这条弯路踩过）。两个分支都验过：不删 → 「当前浏览器支持」（绿点）、删掉 → 「当前浏览器不支持」（灰点）。顺带一个正面结论：**这条判据是「不可伪装」的** —— UA 造假的套壳浏览器骗不到它。

四个状态实测齐了（`appinstalled` 用 `window.dispatchEvent(new Event('appinstalled'))` 造）：引擎支持 + 事件已到 → 「当前浏览器支持」+ 按钮**亮**；引擎支持 + 事件未到（读得早就会撞上）→ 「当前浏览器支持」+ 按钮灰；引擎不支持 → 「当前浏览器不支持」+ 按钮灰；派发 `appinstalled` 后 → 「已安装」且按钮字也变「已安装」、置灰。

⚠️ **「可一键装」这一档在 dev server 上必须用合成事件造**（2026-10-12 更正）：本站的 SW 只在生产构建里注册（`main.js` 的 `if (import.meta.env.PROD && IS_WEB …) navigator.serviceWorker.register('/sw.js')`），而 Chrome 判定「可安装」要求有接管页面的 SW —— 所以在 `vite dev` 下 `navigator.serviceWorker.controller` 恒为 `false`、**真实的 `beforeinstallprompt` 不会来**（等 25s 也不来），`canInstall` 永远 `false`。探针里要推这一档，就自己派发一个形状对的事件（实测有效，那一下能让面板按钮变亮、菜单里多出「安装为应用」）：

```js
const ev = new Event('beforeinstallprompt', { cancelable: true })
ev.prompt = () => { window.__prompted += 1 }        // 应用侧只会调它一次
ev.userChoice = Promise.resolve({ outcome: 'accepted' })
window.dispatchEvent(ev)
```

（想验真实事件，就得拿 `dist/` 的**构建产物**跑，不要用 dev server。线上有 SW，所以线上这一档是真的。）

插件侧本轮实测过八个 UA（**那半边仍然是 UA 判据，照旧有效**）：Chrome / 360 套壳 → 手动那颗 + `hintChrome`；Edge → 手动那颗 + `hintEdge`（**没有** Edge 按钮，URL 空着）；Firefox → AMO 那颗 + `hintFirefox`；Safari 与 iOS Chrome → **无按钮** + `hintUnsupported`；安卓 Chrome → 无按钮 + `hintMobileUnsupported`；安卓 Firefox → AMO 那颗 + `hintFirefox`。

### 13.7 齿轮菜单里那几颗「装到本机」的行（2026-10-12 加；同日插件行拆出「更新」一对）

下拉菜单在「同步设置」下面多出六颗**一次性动作**（不是偏好）：应用那两颗 —— **安装为应用**（能一键装时）与 **安装引导**（三星 Internet 专用，2026-10-14 加），以及插件的**两对**行——「安装 / 下载浏览器插件」（没装）与「更新浏览器插件」（装着旧版；2026-10-12 用户要求把两种情况区分开，2026-10-20 再要求旧版那对与「下载」也分得开，两条路统一叫「更新浏览器插件」）。它们**只在各自条件成立时出现** —— 出现了就是真能用的，用掉、装好、或这台机器本来没这条路，就自己消失。条件全写在 `services/settingsMenu.js` 的 `when` 上（表里那一行的显隐；组件只按它过滤，不认任何业务事实）。⚠️ 应用那两颗**互斥**（三星上 `canInstall` 恒假，其余引擎不认三星）：所以菜单里一次最多看到其中一颗。⚠️ 插件那四颗的准确判据是「**探到什么**」而非「装没装」（两者不等价，见本节末那段）：没探到 → 安装口径；探到且版本旧 → 更新口径；探到且是最新 → 四颗全收。**同一批判据还驱动通知里的插件引导**（开机自动弹一次、设置面板里手动再发一次），见 **13.8**。

| 行 | 出现条件 | 点它做什么 | 文案 key |
| --- | --- | --- | --- |
| **安装为应用** | `canInstall`（引擎有**可用**的一键安装 **且**此刻真能一键装 **且**还没装） | 调 `install()` → 触发浏览器的安装弹窗 | `settings.menu.installApp` |
| **安装引导** | `MANUAL_INSTALL_BROWSER && !appInstalled`（目前只有三星 Internet，2026-10-14 加） | `fireSectionGuide('app')` → 发一条通知讲清三星自己的装法（地址栏「＋」/ 菜单 ›「添加页面到」›「主屏幕」） | `settings.app.install.guide`（与设置面板那颗按钮同一句） |
| **安装浏览器插件** | 没探到扩展 **且** `EXTENSION_ROUTES` 含 `'firefox'`（Firefox 桌面 / 安卓） | 外链 AMO，一键装 | `settings.menu.installExtension` |
| **更新浏览器插件** | `isExtensionOutdated(info.version)` **且** 路含 `'firefox'` | 同一行 AMO（那页永远是最新版） | `settings.menu.updateExtension` |
| **下载浏览器插件** | 没探到扩展 **且** `EXTENSION_ROUTES` 含 `'manual'`（Chromium 系桌面版） | 下载 zip（与面板那条手动路同一颗包） | `settings.menu.downloadExtension` |
| **更新浏览器插件** | `isExtensionOutdated(info.version)` **且** 路含 `'manual'` | 重新下载 zip（换掉解压目录后刷新）；词与 Firefox 那颗相同（2026-10-20 起），区别只在动作 | `settings.menu.updateExtension` |

五条不能破的：

1. **`when` 是函数**（表里那一整套都是函数，理由同文件头）：读的是此刻的值，Vue 追得到依赖，所以装完 / 事件一到，那一行自己长出来或消失。**别把这类条件写进组件**。
2. **插件四颗 = 两种状态 × 这台机器的路**：没探到 → 「安装 / 下载」那对（判据 `!extensionInfo`）；探到旧版 → 「更新」那对（两条路同名；判据 `isExtensionOutdated`，唯一出处 `services/extensionPackage.js`，面板的 `extensionOutdated` 与菜单共用一份比对 —— 别在表里再抄一份版本比较）。每对内部按 `EXTENSION_ROUTES` 二选一，**与设置面板那两颗外链按钮同一份**；认不出浏览器时它给两条（fail-open），于是同对两颗都出现 —— 这是刻意的，别收敛成一颗。**「更新」那一对也不能收**（与面板「装包行不能收」是同一条判据）：Chromium 没有商店可点，菜单这颗就是拿新包的唯一入口，旧版用户看不见它就只剩「有新版」可读、拿不到包。Chromium 那颗措辞用「重新下载」而非「更新」—— 要与 AMO 那颗统一叫法先问（2026-10-12 定）。
3. **`useInstallPrompt.js` 是模块级单例**（2026-10-12 改）：`beforeinstallprompt` 一个会话只派发一次，**拦下来的那个事件对象是唯一能 `prompt()` 的东西**，所以这份状态只能有一份；监听挂在模块顶层、没有 teardown。别再退回「每次 `useInstallPrompt()` 各持一份 ref」—— 那样菜单与面板各拿一半，谁都不对。
4. **安装包那份数据只有一处**：版本 / 文件名 / 下载地址 / 两个商店地址都在 `services/extensionPackage.js`，面板与菜单都 import 它。**别在组件或表里再存一份版本号**（换包时必漏一处，见 13.3）。
5. **位置是挑过的**：三颗条件行插在 `cloud` 之后、`openSettings` / `sections` 之前。因为组件里 `activeIndex` / `openSubmenu` 都按下标干活，而这个位置**在所有可展开的行（radio / cloud）下面** —— 条件行出现或消失时，那些存下来的下标不会被推着走。

**实测**（2026-10-12，探针跑在 dev server 上、用完即删）：Chrome 与 360 类 → 只有「下载浏览器插件」；Firefox（UA）→ 只有「安装浏览器插件」；Safari（UA）→ 两颗都没有；把 `extensionInfo.value` 置成已装 → 两颗都收起来（设置面板那一栏的下载行同步消失）。「安装为应用」按 13.6 那条**合成事件**的写法驱动：事件一到 → 菜单里多出该行；点它 → `prompt()` 被调到 **1** 次、菜单自己收起、那一行随之消失。面板那两颗外链按钮的回归也一并过了（Chrome → `download` 那颗 zip；Firefox → AMO；Safari → 一颗都没有），即常量搬进 `extensionPackage.js` 之后行为没变。

**「更新」那一对的实测**（2026-10-12 追记，六场景 × 中英 + 动作出口全绿）：探针扮桥回旧版号 `2.65.0` → Chrome 菜单只出「重新下载浏览器插件」、Firefox 只出「更新浏览器插件」（安装口径那颗不并排出现）；回最新版 `2.66.4` 或探不到 → 更新行不出现；点 Chromium 那颗 → 合成锚点指向 `/extension/cc-for-web-2.66.4.zip` 且带 `download`；点 Firefox 那颗 → `window.open` 去 AMO。面板回归同场验过：重构 `extensionOutdated` 到共用判据后，「更新插件」行与版本对照 warn 照旧。

⚠️ 探针里连 dev server 要写成 `--host 127.0.0.1` **并按 IP 访问**（`http://127.0.0.1:<port>/`）：本机 vite 默认只监听 `[::1]`，而 Chrome 走 `localhost` 时可能落到 IPv4 上，症状是 `goto` 报 `ERR_CONNECTION_REFUSED`（2026-10-12 踩到，`curl localhost` 通、`curl 127.0.0.1` 不通就是它）。

### 13.7.1 「探不到扩展」≠「没装扩展」（2026-10-12 追记）

探活只有**一条通道**：扩展的内容脚本 `js/bridge.js`（`document_start` 注入）在页面里监听 `cp-ping` 并回 `cp-info`。它注入哪些 origin 由 **CC-for-Web 的 `src/hosts/targetSites.ts`** 决定，而**生产构建会把两条本地 origin 剔掉**（`scripts/build/extension.ts` 的 `DEV_ONLY_SITE_PATTERNS`，理由是商店审查会追问「为什么要读 localhost」）—— 仓库里 `build-chrome/manifest.json` 的 `content_scripts[0].matches` 实测只剩两条 https。**别拿 manifest 里那条 `http://localhost/*` 的 `host_permissions` 当反例**：那是给本地工具 POST 用的（`src/hosts/hosts.ts` 的 `LOCAL_TOOL_ORIGINS`），与桥无关。

于是有**三种「装了也探不到」**，表现全都是 `extensionInfo === null`、插件那一行照旧出现：

1. **dev 起源 + 生产包扩展**（2026-10-12 用户当场撞到）：在 `http://localhost:5199`（或 `127.0.0.1:5199`）上，生产包**不会**注入桥。**要在 dev 上验这一栏 / 这两行，扩展必须用 dev 模式构建**：`pnpm watch:chrome`（即 `extension.ts chrome false true`，本地两条匹配会保留；一次性构建用 `tsx scripts/build/extension.ts chrome false false`，产物同样是 `build-chrome/`），构建完在 `chrome://extensions` **重新加载**该扩展即可（`2.68.1` 起后台启动时会自己给已打开的标签页补注入桥，不必再刷新页面；更老的扩展要刷一次）。只想看这两行长什么样，也可以直接去线上站看。⚠️ 访问必须用 `localhost` 或 `127.0.0.1` 这两个**主机名** —— 两条匹配**不带端口**（覆盖 dev / 端口顺延 / preview），但 **`http://[::1]:<端口>` 不在匹配清单里**，就算 dev 包也不会注入（vite 默认只听 `[::1]`，`localhost` 连不上时给 vite 加 `--host 127.0.0.1`）。这一条 2026-10-12 已用**真实扩展 + 真实站点**端到端验证过（见本节末），不是推断；2026-11-02 又把两条匹配改成不带端口（原先是 `localhost:5199` / `127.0.0.1:5199`）并复测：dev 包在任意本机端口都能握手，生产包仍旧一条都不注入。
2. **装 / 重载扩展晚于页面加载**：内容脚本只在页面加载那一刻注入，页面开在扩展装上之前的那些标签页里没有桥。**2026-10-28 起扩展侧已修（`2.68.1`）**：后台每次启动都跑一遍 `ensureBridges()`（见 `CC-for-Web` 的 `src/background.ts`），按 manifest 里桥那一条的 `matches` 查已打开的标签页、用 `scripting.executeScript` 补注入一份 —— 装上 / 更新 / 在扩展管理页点「重新加载」都会重启后台，所以这三种情况下**不必再刷新页面**（旧扩展仍要刷）。站点这一侧一个字没改：探活还是那三次 ping，只是现在真的有人接。剩下两档仍会走到「探不到」：扩展**根本没装**、以及下面第 3 条。
3. **扩展被禁用于本站**（`chrome://extensions` 里「网站访问权限」改成了特定站点之类）：桥不注入，同上。

一句话纪律：这一行说的是「**站点探不到**」，不是「**这台机器没装**」。要把它当「没装」的证据用，先排除上面三条。**也别为了消掉 dev 上的这个误报去加特例**（例如按 `import.meta.env.DEV` 藏掉这一行）—— 那会把「开发时它到底长什么样」一起藏掉，而 dev 上探不到本来就该由「用 dev 包」解决。

**怎么验站点侧那一半**（不必真装扩展，2026-10-12 实测）：在页面里扮一个桥就行 —— `page.evaluateOnNewDocument()` 里监听 `cp-page` / `cp-ping`、回一条 `{ source: 'competitive-companion', type: 'cp-info', requestId, info: { version, capabilities, config } }`（`requestId` 必须原样回，见 `useCompanionBridge.js` 的 `onMessage`，它只认自己那一轮）。三种状态都对得上：没桥 → `extensionInfo === null`、那一行在；有桥 → `2.66.4`、那一行没；**菜单开着的时候才回包 → 那一行就地消失**（`when` 是函数，Vue 追得到）。

**「真实扩展能不能被探到」这条链路 2026-10-12 起探针也验得动了**（上面那句「做不到」已过时）：按下面这套写法 —— 启动参数带 `--enable-unsafe-extension-debugging`、`ignoreDefaultArgs: ['--disable-extensions']`、CDP `Extensions.loadUnpacked` 装真扩展 —— 当天实测三断言全绿：装 dev 包 → `extensionInfo.version === '2.66.4'`、菜单无「下载浏览器插件」；同一探针不装扩展（反证）→ `extensionInfo === null`、那一行在。

⚠️ **2026-10-28 更正：这套写法在品牌版 Chrome 155 上已经失效**，别照着试到天黑。`--load-extension` 自 Chrome 137 起对品牌版关闭（`--disable-features=DisableLoadExtensionCommandLineSwitch` 也救不回来），而 `Extensions.loadUnpacked` 虽然**返回一个 ID、不报错**，扩展却根本没被启用：`chrome-extension://<id>/options.html` 一律 `net::ERR_BLOCKED_BY_CLIENT`、`browser.targets()` 里永远没有扩展的 `service_worker`、页面里的桥也不出现。**要装真扩展跑探针，用 Chrome for Testing**（`https://storage.googleapis.com/chrome-for-testing-public/<ver>/mac-arm64/chrome-mac-arm64.zip`，解压即用；`--load-extension` 在它上面照常生效），实测路径 `/tmp/cpx/cft/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`。

**补注入的实测（2026-10-28，Chrome for Testing 150、headless、真站点 + 真扩展包）**，三条断言全绿：
- **桥缺席 → 补注入后能探到**：用一份「manifest 里桥那一条被摘掉」的拷贝（模拟「页面开在扩展装上之前」），页面 `cp-ping` 得 `0` 条回包；再从扩展自己的 `options.html` 里按 `ensureBridges` 同一组调用（`tabs.query({url: matches})` + `scripting.executeScript({files:['js/bridge.js']})`）注入一次 → 同一次页面会话（没刷新）立刻回 `1` 条、`version === '2.68.1'`。
- **重复注入不重复回包**：在上面这一页再手动注入两次 → 仍只回 `1` 条（`window.__cpBridgeInstalled` 生效）。
- **真实路径（后台重启）确实会补注入**：用一份在 `bridge.js` 末尾追加 `console.log('CP_BRIDGE_EVAL')` 的拷贝，页面加载后计数 `1`；**等 MV3 后台自己空闲退出**（约 30s，`browser.targets()` 里扩展 SW 消失）后用 `cp-ping` 唤醒它 → 计数变 `2`（顶层 `ensureBridges` 又执行了一遍 executeScript），而回包仍是 `1` 条、版本 `2.68.1`。这条把「后台每次启动都补一遍」和「两条注入路径不会叠出第二套监听」同时钉住了。

### 13.8 安装引导的通知形态（2026-10-12 加）

这一节管「怎么把本站装成应用 / 怎么装、更新插件」这两件事的**主动引导**。原来它们只被动躺在
设置面板里（「应用」栏的说明行、「浏览器插件」栏的装包行），用户不点进去就永远看不到；2026-10-12
起改由通知系统（`services/notifications.js` + `components/NotificationCenter.vue`）主动讲 ——
这正是通知系统上线时留的那块「暂不接业务事件」的位置。

**四条引导**，唯一出处 `services/installGuides.js`（面板那一栏、齿轮菜单、通知读的是同一批判据）：

| id | 出现条件 | 通知长什么样 |
| --- | --- | --- |
| `app-install` | `canInstall`（引擎有 API **且**此刻真能一键装 **且**还没装） | 一句话正文；按钮 **安装 / 以后再说**（安装那颗直接调 `install()`） |
| `app-manual` | 没装，且（引擎没 API **或** 有 API 却拿不到入口） | 只说明：无 API 走 `noApi*` 六条之一，拿不到入口走 `blocked` 前后半拼 `chrome://apps`，后者带 **复制地址**。⚠️ **只有「没 API」那半会自动弹**；「拿不到入口」那半 2026-10-12 起退出自动弹，只剩手动按钮与面板那一行 |
| `ext-install` | 没探到扩展，且这台机器有路（`EXTENSION_ROUTES` 非空） | 正文 = 面板那六条 `hint*`；按钮按路给 **下载 / Firefox 版** |
| `ext-update` | 探到扩展且版本旧（`isExtensionOutdated`） | 正文 = `updateHint*`；按钮 **更新 / Firefox 版**（手动那条 2026-10-20 起叫「更新」，原「重新下载」） |

六条不能破的：

1. **分岔只有一处**：`noApiVariant()` / `extensionVariant()` 与两张 key 表（`NO_API_KEYS` /
   `EXTENSION_HINT_KEYS`）都在 `installGuides.js`，面板那两行说明与通知正文**读同一批句子**
   （`t(EXTENSION_HINT_KEYS[extensionVariant()])` 这种取法）。别在组件里再写一遍 if 链 ——
   那正是 `extensionPackage.js` 那次把版本比对挪出去要防的事。顺带改了一处字：`hintFirefox`
   原来是「点**右侧**「Firefox 版」…装完回**这里**点「重新检测」」，通知里没有「右侧」也没有
   那颗「重新检测」，所以改成位置中性的「点「Firefox 版」…装完回**设置里**点「重新检测」」——
   两处都读得通，别改回去。插件那六条里只有 Firefox 那条自带收尾动作，其余的在通知里由
   `guide.extRecheck` 补一句（通知上没有「重新检测」按钮）。
2. **「有 API 却拿不到入口」那一格只被动躺着，不自动弹**（2026-10-12 用户反馈「感觉出现的
   有些频繁了」后定的）。它是四条里唯一会**误报**的一格：`beforeinstallprompt` 什么时候来不由
   站点定，「拿不到事件」既可能是「装过又删掉」（值得解释）、也可能只是「这一刻还没轮到」
   （不该提醒），站点没有任何手段把两者分开；而它又是唯一的 `warning` 型、还带按钮因而
   **常驻上屏**（`show()` 里 `duration: 0`、排序排最上），一条黄色警告一直杵着。更要命的是
   这个判据**每个来源都会重来一遍** —— 记录是 per-origin 的 localStorage，dev server 每换端口、
   Vercel 每个预览域名、清一次站点数据都是全新的一份（第一版为此分过 `early` / `late` 两趟，
   现在连 `late` 那趟一起取消了，`runAutoGuides` 不再收 `phase`）。想发它只有一条路：
   设置面板那颗「安装引导」（`fireSectionGuide`，不看 `shown` 记录）。
   剩下三条自动弹的都是**真能办成一件事**的：能一键装了 / 插件没装 / 插件旧了。
   ⚠️ `app-manual` 那一格的判据是 `!INSTALL_API_SUPPORTED` —— 2026-10-14 起**它把三星
   Internet 一起收进来了**（三星的属性检测是假阳性，见 13.4 第三条纪律）：所以三星上开机
   会**自动**弹一条「安装为应用」+ 三星步骤，那条不是 `warning`、也没有「复制地址」，
   与上面这段说的「有 API 却拿不到入口」不是同一格。
3. **「自动弹一次」记在 `cp.installGuides`**（第 6 节），**手动触发不看这份记录**（用户点名要看）。
   **例外 `ext-update`**（2026-10-24 用户口径「可以更新插件时，打开 / 刷新就弹通知」）：不落这份记录，
   每次页面加载只要插件版本旧于 `EXTENSION_VERSION` 就弹一次（同一次加载内只弹一次）；换上新版后自然不再出现。
   实测：伪造 2.67.3 握手，首开 + 两次刷新各 1 条、`cp.installGuides` 不含它；伪造 2.67.4 则三次都 0 条。
4. **同一件事同时只留一条通知**：两条引导各一个 tag（`guide:app` / `guide:extension`），
   发新的先 `dismissByTag` 旧的。
5. **有按钮的常驻、纯说明的 12 秒**（`INFO_MS`）：带按钮的通知是要用户动手的，替他关掉没有道理。
6. **插件引导只在「这台机器有路」时弹**（`EXTENSION_ROUTES` 非空）：Safari / iOS 上一颗按钮都给
   不出，这时弹一条「快去装」是纯打扰 —— 面板那一栏仍照旧给 `hintUnsupported`，那是用户自己点进去看的。

**手动入口**：设置面板「应用」栏与「浏览器插件」栏末尾各有一颗「安装引导」（`fireSectionGuide`），
点它把这一栏的引导改成通知再发一次。与开机那一趟走的是同一个构造函数，所以**已经装好 / 已是最新版
也照样有话说**（后者给 `guide.extUpToDate`），不会点了没反应。

**实测**（2026-10-12 探针跑在 dev server 上、用完即删；中英各九场景、共 11 条断言全绿。
⚠️ 下面「Chrome 不派发事件」那条是**旧口径**，同日稍后「拿不到入口」那格退出自动弹之后，
自动弹不再出那条 —— 重测时按新口径断言：只剩下插件那条，应用引导一条都不自动出）：
Chrome 合成安装事件 → 「安装为应用[安装/以后再说]」+「安装浏览器插件[下载]」；Chrome 不派发事件 →
~~10s 后补出「安装为应用[复制地址]」~~（现改为**不自动出**，点设置里那颗「安装引导」才发，
正文含 `chrome://apps`）；扮桥回 `2.65.0` →
「更新浏览器插件[重新下载]」（该按钮字 2026-10-20 起改「更新」，菜单行同步改「更新浏览器插件」）；回 `2.66.4` → 一条都没有；Firefox（`delete window.onbeforeinstallprompt`）
→ 应用那条落 `noApiFirefoxOther`、插件那条给「Firefox 版」；Safari → 只有应用那条（`noApiSafariDesktop`，
插件一条都不弹）；预置 `cp.installGuides` → 刷新后一条都不弹；预置后点设置里那颗「安装引导」→
通知照常出现。⚠️ **探针坑**：`evaluateOnNewDocument` 里直接 `setTimeout` 派发合成安装事件会丢 ——
dev 下模块要加载好几秒，那时应用还没挂上监听（症状：插件那条正常、应用那条整条不出现）。正确做法是
暴露一个钩子，等 `.sidebar-switcher__tab` 出现（＝应用已挂载）后再调。

### 13.9 云端那几步的通知（2026-10-12 加）

三件事，都在 `services/cloudSession.js`，都走通知系统：

| 事件 | 形态 | 说明 |
| --- | --- | --- |
| 导入云端配置（四条显式入口）/ 登录验证通过 | `success` · 5s，**跨整页刷新** | 走 `notifyAfterReload` 寄存在 `cp.flashNotice`，下次启动 `flushFlashNotification()` 补发 |
| 登录时云端还没有这个用户名（直接认领，不刷新） | `success` · 5s，当场发 | 与行内那句并存：行内当「下一步去上传」的指引，通知负责让齿轮菜单那条路也看得见 |
| 取到验证码（登录 / 上传两条路共用） | `info` · **10 分钟**（= 码的有效期 `CODE_TTL_MS`），tag `cloud:code`，正文下带一行**活倒计时** | 五颗按钮：**验证**（2026-10-19 加）/ 一键填写（**仅装了带 `fill-code` 能力的扩展时才有**；扩展还会回报 `fill-saved` 时改叫「填写并登录」—— 那一颗点下去连验证一起做完，2026-10-20）/ 复制验证码 / 跳转到网页 / 取消登录（上传流程叫「取消上传」）。过期那行转「已过期，请重新取码」，「验证」同时换成「重新取码」 |

七条不能破的：

1. **`cp.flashNotice` 是全站唯一的持久化例外**，且**只存 sessionStorage**（第 6 节）。理由与边界：
   - 为什么要存：导入 / 登录成功办完就 `window.location.reload()`（见 `adoptCloud`），通知只活在内存里，
     刷新前 `notify()` 等于没发；
   - 为什么不是 localStorage：它只该跨过**这一次同页签刷新**，随页签关掉消失。存 localStorage 会让用户
     下周开站时忽然弹出一条「导入成功」；
   - **只存 `{ type, title, message, duration }` 四个展示字段**，`actions` / `tag` 一律不存（回调函数
     过不了 JSON，存了只会变成一堆空标签）；存的是**已翻译好的字符串**，因为补发时页面刚起来、
     i18n 还没进任何组件；
   - `flushFlashNotification()` **先删后发**、且幂等；存档是用户能手改的地方，解析失败就当没有
     （删掉脏数据，不往界面上塞垃圾）；
   - **不进云同步白名单**：它是「这台设备刚做完一件事」的一次性界面状态。
2. **取码那条通知只认 `code` 这一个 ref**：`watch(code)` —— 非空就（重）发一条、清空就 `dismissByTag` 整组收掉。
   清 `code` 的地方有五处（取消 / 两种验证成功 / …），逐个补 `dismiss` 漏一处就是一条甩不掉的通知。
   ⚠️ **验证失败刻意不清 `code`**（码可能还有效，用户改完 Last name 能接着来），所以那条通知留着，
   上面那几颗按钮正好还用得上。
   ⚠️ **同一个码值再来一次时 `watch` 不响**：`refreshCloudCode()` 因此自己补一次
   `refreshCodeNotice()`（`updateNotification` 原地换内容，失败才补发新的），否则通知会一直停在
   「已过期」而码其实已经生效（2026-10-19 探针用「每次回同一个码」的 mock 当场撞出来）。
3. **`keep: true` 的按钮点了不退场**（`notifications.js` 的 action 新增标记）：取码通知的**前四颗**都是
   「还得再来一下」的动作（复制完往往还要跳转、跳转完还要回来点验证），点一下就把通知收掉等于逼用户
   把码重新弄出来一次；只有最后一颗「取消」不带 `keep`。**「验证」那颗尤其要 `keep`**：
   验证成功会清空 `code`、watch 顺势收掉整条，用不着按钮自己退场；失败则要留在场上重试。
4. **`MAX_ACTIONS` 由 2 提到 4、2026-10-19 再提到 5**：就是为了这条通知（4 颗是「填 / 复制 / 跳转 / 取消」，
   第 5 颗是「验证」）。按钮行本来就 `flex-wrap`，五颗在 320px 卡片里折成两行、不缩字
   （2026-10-19 实测：5 颗 / 2 行 / 卡片 320×163）。超过 5 颗仍按老规矩拆成两条通知。
5. **通知里那行倒计时是通用能力，不是云端专用**（2026-10-19 加）：`notify({ countdown })` 只收
   `{ deadline, text(remainingMs), expiredText() }` —— 文案与格式由调用方（`cloudSession`）给，
   组件（`NotificationCenter`）只负责「每秒把 `now` 推进一格再问一次」，所以它不认识任何一门业务。
   剩余量按 `deadline - Date.now()` 重算、绝不累减（后台节流那条老账，见 13.11 第 2 条）；
   那只 interval 只在场上确实有带 `countdown` 的通知时才开。
   起点与面板同一个 `codeDeadline`，两处读数差不超过一秒。
6. **CF 个人资料地址提为常量 `CF_SOCIAL_URL`**（`cloudSession.js` 导出）：面板说明里的 `<a>`、齿轮菜单
   说明里的 `<a>`、通知上「跳转到网页」那颗按钮**同源**。改地址只改这一处。
7. **「导入」还是「登录」由 `adoptCloud(data, handle, updatedAt, kind)` 的 `kind` 参数决定**（默认
   `'import'`）：四条显式导入入口（面板「导入」/ 菜单「导入」/ 两处「下载到本机」/ 地址栏 `/<handle>` 套用）
   都走默认，只有 `verifyAndLogin` 传 `'login'`。词条表是 `CLOUD_NOTICES`。

**实测**（2026-10-12 探针 36 条断言全绿，mock `/api/*` 驱动真实 UI；用完即删）：
zh 取到码 → 「等待验证」+ 码进正文 + 三颗按钮（没装扩展时没有「一键填写」）+ tag `cloud:code`，
点「取消登录」通知收掉且面板回到未取码态；en 同场景文案全对；四颗按钮折两行、卡片 320px、
6 颗只留前 4；云端无配置那支当场发「登录成功」且不刷新（行内提示仍在）；**点「导入」→ 确认框 →
地址栏变成 `/<handle>` 且整页刷新 → 补发「已导入云端配置」、`cp.flashNotice` 已删**；登录验证通过 →
刷新 → 补发「登录成功」；`sessionStorage` 里塞 `not-json` 不弹通知、不崩、脏数据被清掉；
手种合法寄存 → 中英各原样补发一条。
⚠️ **探针坑**：`openSettingsTab('cloud')` 之后**别立刻点面板里的按钮** —— 会话恢复是异步的，VFS 落定后
`workspace.activeId` 才赋值，那一跳会 `deactivateViews()` 把刚铺开的设置视图收掉（页签还在、
内容 `display:none`，症状是 `page.click` 报 `Node is either not clickable`）。要重试到
`.cloud-account` 的 `getBoundingClientRect().width > 0` 为止。

### 13.10 设置改动的「撤回」通知（2026-10-12 加）

改任一设置 → 右下角一条 `info` · **3 秒**的通知，标题是「「<设置名>」已更新为「<取值名>」」，带一颗**「撤回」**。
**同一项只有一条**：连着改同一项不新发，而是原地改那一条，撤回目标是**最近这一手**（再点一次才更早一手）。
全在 `services/settingsUndo.js`（App.vue 里 `initSettingsUndo()` 挂一次，不画东西）。

| 收口在哪些 ref 上 | 写它们的通路（**都不需要改**） |
| --- | --- |
| `editorSettings`（浅 watch） | 面板整份回写 `updateEditorSettings` / 菜单 `setEditorSetting` |
| `uiScalePref` / `panelPosition` | 菜单与面板两条（缩放那条本来就没有单一出口） |
| `templatesEnabled` / `locale` | `setTemplatesEnabled` / `setLocale` |

八条不能破的：

1. **在模块级 ref 上收口，不在写入方插钩**：五条写入通路，逐个插钩要动五个文件、漏一条就漏一类设置；
   它们最终都落回单例 ref（就是「抽单例」的收益），挂 watch 一次全覆盖。
2. **代价是一条契约：写入方必须整份替换 `editorSettings`**（`editorSettings.value = {...}`）。
   这里用的是**浅** watch —— deep 的回调里 newValue 与 oldValue 是同一个对象（Vue 不克隆），
   拿不到「改之前是什么」，撤销就无从谈起。哪天有人写 `editorSettings.value.fontSize = 20`，这一项就静默失联。
3. **watch 一律 `flush: 'sync'` + `applying` 守卫**：撤回是自己写回去的，那一下也会触发 watch，
   必须当场跳过。默认的 `'pre'` 会把回调推到微任务里，那时守卫早已复位 —— 于是撤回自己又弹一条，无限套娃。
4. **每项一份撤销栈**（旧值在栈底），点一次退一手、退干净才收通知。栈**只跟着那条通知的命**：
   判据是「这一项记着的通知 id 还在 `notifications.value` 里且未退场」。通知 3 秒到期 / 被 × 关掉之后，
   下一次修改就从头记 —— 否则用户看不见的那截栈会让他按一下「撤回」退到很早以前的值。
5. **同一项只留一条走 `updateNotification`（`notifications.js` 新加）**：原地改 title / message / actions /
   duration，**位置与进场动画都不动**。靠「先 `dismissByTag` 再 `notify`」会一次淡出、一次滑入，
   连点字号步进器时整排通知都在抖。条目已退场时它返回 `false`，调用方据此新发一条。
6. **tag 是 `setting:<键>`，设置名与取值名都按约定取**：设置名按 `settings.editor.<key>.label`，六条不在编辑器域的
   （theme / fontSize / uiScale / locale / panelPosition / templatesEnabled）走 `EXTRA_LABEL_KEYS` 例外表。
   取值名复用面板下拉 / 菜单档位那一批选项表（`VALUE_LABELERS`），开关译成「开启 / 关闭」。
   约定类的东西**必须有断言**：探针逐键校验「译出来不等于键本身」（现在 31 + 6 条全过）。
7. **撤回之后标题要换成刚还原的那一档**：`undo()` 里写回值后若还有撤销栈，同时 `updateNotification`
   换 title；否则通知上会停着一个已经不在生效的值。
8. **两种情形刻意不弹**：值没变（整份回写也要逐键比对，选中的就是当前那一档）；**一次改一批**
   —— 云端导入 / 登录走 `applyProfile`，它只写 localStorage 再整页刷新，运行期 ref 一个都不动，
   所以天然不响（那时页面马上要重载，弹了也看不见，那两条另有跨刷新寄存，见 13.9）。

**实测**（2026-10-12 探针 43 条断言全绿，走真实 UI：面板下拉 + 齿轮菜单步进器 / 开关；用完即删）：
面板改主题 → 「「主题」已更新」+「撤回」（当时标题还只带设置名，取值是 2026-11-01 加的），点它主题回退且通知收掉；菜单连点三步进器 → 字号 14→17
**只有一条**通知，逐手撤回 16→15→14、退干净通知消失；通知 3 秒自动消失后，下一次改重新计一条、
撤回**只退一手**（不会退到很早以前的值）；同时改两项 → 两条通知、tag 各自独立；写回同一值、
`applyProfile` 批量套用都不弹；中英两版文案全对（`“Font size” updated` / `Undo`）。

**复测**（2026-11-01 探针 10 条全绿，真实齿轮菜单）：标题带上取值 ——
「「主题」已更新为「浅色」」；同项连改仍只有一条、标题原地换成最新一档；连撤两手时标题跟着退回
「浅色」再收掉；开关项显示「「自动保存」已更新为「关闭」」；英文为 `“Theme” updated to “Light”`。
⚠️ **探针坑**：判「3 秒自动消失」不能只看「在场且未退场」的计数 —— 退场动画有 200ms，
那一刻计数已经是 0 而 DOM 节点还在，紧接着点「撤回」会点在**正在淡出的那颗**上
（组件对退场中的通知整颗忽略，看着像「撤回没生效」）。要等 DOM 节点真的拆掉。

### 13.11 取码那一步的 10 分钟倒计时（2026-10-19 加）

**为什么加**：这一步的主战场在**另一个网站**（把码填进 Codeforces 的 Last name、点保存、再回来），
用户在那头折腾多久，这边原先一点提示都没有 —— 只会在点「验证」时撞回服务端那句「验证码已过期或
未获取」，分不清是码过期了还是自己填错了。

**状态与判据全在 `services/cloudSession.js`**，面板（`EditorSettingsPanel.vue`）与齿轮菜单
（`SettingsMenu.vue`）只是消费方，两边渲染**同一个** computed：

| 导出 | 作用 |
| --- | --- |
| `codeDeadline` | 到期时刻（`Date.now()` 口径），0 = 没在计时 |
| `codeRemainMs` | 剩余毫秒，随滴答更新 |
| `codeCountdown` | `{ expired, key, params }` —— 与 `cloudCfHint` 同一写法，模板里自己 `t()` |
| `refreshCloudCode()` | 过期后重取一枚（同一个 `pendingHandle`） |

**三处显示同一份状态**：面板、齿轮菜单，以及**「等待验证」那条通知**（2026-10-19 加）。前两者渲染
`codeCountdown`，通知渲染 `notify({ countdown })` 那一行（通用能力，判据见 13.9 第 5 条）——
起点都是 `codeDeadline`，三处读数差不超过一秒。通知上那颗「验证」也走这里同一个 `confirmCloudCode()`。

五条不能破的：

1. **起点是「收到码的那一刻」**，不是服务端签发时刻（客户端拿不到它）。网络延迟那一秒吃不掉整分钟，
   宁可晚一丁点判过期，也别把还活着的码提前判死。
2. **剩余量每次用 `Date.now()` 重算，绝不累减**。后台标签页 / 移动端的 interval 会被节流到一分钟
   一次甚至冻住，累减出来的读数会比真实时间慢一大截；另挂一条 `visibilitychange`，切回前台先对一次表。
3. **倒计时由 `requestCloudCode()` 显式 `startCodeTimer()`，`watch(code)` 只负责清空时 `stopCodeTimer()`**。
   反过来（全靠 watch 启停）会在「同一个码值又来一次」时漏掉重置 —— mock 每次回同一个码正好造出这情形。
4. **`CODE_TTL_MS` 仍是唯一的时间常量**，必须与后端 `CODE_TTL = 600`、i18n 的 `codeHint` 三处一致；
   通知那条 `duration` 也吃它（见 13.9）。
5. **过期只换「验证」那颗，不动「取消」**：`codeCountdown.expired` 为真时，面板与菜单都把
   「验证并登录 / 验证并上传」换成「重新取码」（`settings.cloud.refreshCode`），通知里那颗则靠
   `watch(codeCountdown.expired)` + `updateNotification` 原地换掉 —— 那颗验证必然被服务端打回，
   留着只会制造一次无解释的失败。倒计时那行同时转 `--warn` 并换成「已过期，请重新取码」。
   **验证失败仍不清 `code`**（老规矩，见 13.9 第 2 条），所以过期前那枚码的失败结论不被这里改写。

**实测**（2026-10-19 探针，mock `/api/config/*` + `/api/get-code`，时钟用 `Date.now` 偏移推快；
用完即删）：面板取到码 → `剩余 10:00` → 2.3s 后 `9:58`；推快 10 分钟 → 下一拍翻 `已过期，请重新取码`
（`#c9a45c` = `--warn`）、页脚变 `取消 / 重新取码`；点它 → 回到 `9:59` 且过期态收起；浅色主题
`--text-dim` = `#616161`；齿轮菜单同场景文案与按钮一致。
**通知那条**（同一轮）：正文 `把验证码 CF-ABC123 填进 Codeforces 的 Last name` + `剩余 10:00`，
按钮 `验证 / 复制验证码 / 跳转到网页 / 取消登录`（没装扩展所以没有「一键填写」）折两行；
推快 10 分钟 → `已过期，请重新取码`、首颗变 `重新取码`；点它 → `剩余 10:00`、首颗变回 `验证`
（mock 每次回同一个码，走的是 `refreshCodeNotice()` 那条原地刷新）；点 `验证` → 真的打出
`POST /api/verify-save`，mock 回失败后通知仍在场、码与倒计时照旧（`keep: true` 的预期）。
装扩展那支的满配形态另量过：5 颗 / 2 行 / 卡片 320×163。
⚠️ **探针坑**：这里踩的就是 13.9 末尾那条 —— `openSettingsTab('cloud')` 之后设置视图会被
`deactivateViews()` 收掉，表现为「DOM 在、`page.click` 报 not clickable」。本轮改成页面内
`import('/src/services/editorViews.js').openSettingsTab('cloud')` 再等 `.cloud-account .text-input`，
按钮也走 `page.evaluate` 点；用户名框是 `v-model`，必须原生 setter + `input` 事件才写得进去。

#### 取码那一步的排版（2026-10-19 定稿，改这块前先看）

原先「码卡 / 琥珀警告句 / 代填按钮 / 步骤列表 / 页脚」五块各占一段，同一列里没有主次，而且
「自动填写」与「验证并登录」是两颗同色实心按钮。现在：

1. **一张卡 `.cloud-flow` 收住「码 + 时效 + 步骤 + 代填」**，卡内用 `border-top` 细线分两段。
2. **外框照抄原来那只验证码盒**：`--border-soft` / `7px` / `--bg-panel` / `margin: 4px 18px 8px` /
   `padding: 10px 12px`。**别再自造强调条或换 `--bg-card`** —— 用户 2026-10-19 为此退回过一次。
3. **实心 accent 只留给「验证并登录」**；「在 Codeforces 上自动填写」是描边次按钮（它只是抄近道）。
   码过期后那颗一并禁用：往 Codeforces 写一枚已经作废的码只是白跑一趟。
4. **步骤用自绘编号圆点**（`grid 16px + 1fr`），不用 `<ol>` 的默认序数 —— 那个缩进会让两行都挂在
   第一行下面。`settings.cloud.codeSteps`（「接下来」）只当引导词，压到 11px 灰。
5. **时效一行说完**：`剩余 9:58 · 同一用户名 10 分钟最多申请 5 次`。`codeHint` 里那句「10 分钟内
   有效」已删除 —— 与倒计时说的是同一件事。
6. **按钮行 `.cloud-footer` 排在状态行之后**（「已填好…点下面的按钮」那句话才能字面成立），
   上下留白刻意不对称：**上 0、下 16** —— 上面那 8px 由卡片 / 状态行的下边距给。
   ⚠️ `.setting-group` 是 `display: flex` 列，**外边距不会塌陷**，算间距是相加不是取 max。
7. **「只认屏幕上这一枚…」那行琥珀提示已整行删除**（2026-10-19 用户判为废话）：模板、样式、
   `settings.cloud.codeWarn` 中英两词条一起清掉。同理，通知正文里的「10 分钟内有效」也删了。

#### 已绑定那张卡（`.cloud-account`）改成「上信息 / 下动作」（2026-10-23）

**症状**（用户截图）：设置视图被压到 300px 上下时，卡里用户名断成 `he-` / `jie`、「已绑定」竖排三行、
「云端最近更新：2026年10月19日 17:30」一个字符一行竖着排了十几行，三颗按钮右对齐挤在右边。探针读数：
`.setting-row__main` 被压到 **0px**，卡片高 **311px**。

**根因**：已绑定那张卡沿用 `.setting-row--action` 的「标签在左、控件在右」，而三颗按钮
（下载到本机 102 + 上传本机设置 114 + 解绑 66 + 两个 6px 间距）自身就要 **294px**；`.setting-row__main`
是 `flex: 1 1 auto; min-width: 0`，宽度不够时 flex 先压它 —— 于是文字块归零，中文只能一字一行。

**修法**（只动 `.cloud-account` 这一支，`.setting-row` 主体没碰）：卡片改纵向 ——
`flex-direction: column` + `justify-content: flex-start`（`--action` 给的 `space-between` 在纵向下会把两段推开，
**必须显式写**）+ `align-items: stretch` + `gap: 8px`；`.cloud-account .cloud-field` 的
`justify-content` 由 `flex-end` 改 `flex-start`（按钮跟着文字靠左，不再右对齐）；
`.setting-row__head` 允许 `flex-wrap`，用户名与「已绑定」各自 `white-space: nowrap` +
`max-width: 100%` + 省略号 —— 要换行时是**整块**掉下去，不是逐字断。未绑定那张卡
（`.setting-row--select`）本来就是这个纵向形状，一并吃到同一套规则，观感不变。

**实测**（1400×900，两套主题，`max-width` 强行压容器模拟窄栏）：容器 280 / 320 时卡片高
**311 → 133**，`.setting-row__main` **0 → 226 / 266**，用户名 1 行、`已绑定` 1 行、更新时间 1 行，
三颗按钮折成 2 行（102 + 114 / 66）；容器 ≥380 时按钮回到 1 行；容器 828（自然宽）时卡片 616×99、
main 586。超长用户名 `a_very_long_codeforces_handle`（197px）在 280 下是「已绑定」整块掉到第二行
（卡片 150），无横向溢出。未绑定态 280 下：输入框 + 导入 一行、登录 一行。

⚠️ 别为了「省高度」把这行改回两端对齐：这张卡是竖着长的，按钮必须跟文字同一条左轴线；
真要并排，三颗按钮加起来 294px，容器得 ≥ 380 才放得下，而设置视图在窄编辑器里远远到不了。

### 13.12 一键提交到 Codeforces（2026-10-23 加；扩展 2.67.0 → 2.67.4）

**为什么必须走扩展**：站点自己提交不了 —— 提交页要 CSRF token，跨源也读不到用户的登录 cookie。扩展本来就注入在 codeforces.com、本来就带着登录态，与代填验证码是同一条信任边界：源码由网页显式递过去，扩展只把它写进表单，**不读 cookie、不回传页面内容**，回给网页的只有原因枚举、提交号与判定码。

**数据流**（一次点击一整条）：

点击页脚那颗 ↑ / 按 `Mod+Shift+Enter` → `App.submitActiveFile` → `services/ojSubmit.js` 的 `submitActiveSolution` 取**编辑器里的当前正文**（`peekActiveContent()`，不要求先存盘）→ `useCompanionBridge` 发 `cp-submit` → 扩展后台 `submitOnCodeforces` 开一个**不激活**的新标签页 → 等加载 → `submitCode.ts` 在提交页里选题目 / 选编译器 / 写入源码 → **先回执再点提交** → 后台等页面跳到 `/my` → 读出这一条的 `data-submission-id` → 回 `cp-submit-result` → 后台每 2s 读一次判定，变化就广播 `cp-submit-status` → 站点换通知；扩展看到终态后 **AC 收掉**自己开的那个标签页，**非 AC 留着**并导航到这一条的提交详情页、亮到前台（站点侧等待上限 5 分钟，扩展侧 2 分钟）。

**站点侧三块**：

| 位置 | 职责 |
| --- | --- |
| `services/ojSubmit.js` | 地址解析（contest / problemset / gym / group 四种）、可不可提交、失败原因 / 判定码翻人话。**唯一的地址解析副本**，与扩展 `background.ts` 的 `parseSubmitTarget` 必须同口径 |
| `App.vue` 的 `submitActiveFile` | 闸门（正在运行 / 正在提交 / 不可提交 → 弹一条 warning 就收场）、`submitting` 状态、两条通知（提交中 → 已提交 / 失败，再 → 判定）、`submitSeq` 代次守卫（旧提交的推送不能覆盖新提交的通知） |
| `TestPanel.vue` 页脚 | 那颗 ↑ 与「不可提交的原因」那一行；动作只 emit，不认识 OJ |

**四处刻意如此**：

1. **按钮显示与否 ≠ 能不能交**：判据只看「活跃文件有没有 `meta.url`」。洛谷题、题解文件也显示，置灰并在页脚那行说清原因（「只支持 Codeforces」）—— 按钮凭空消失比置灰更难理解。置灰的按钮**收不到鼠标事件**，所以原因必须写成看得见的字，不能只塞 `title`（与 `.run-blocked` 共用一行，两条原因同时存在时优先说「不能运行」）。
2. **永远新开标签页，不挪用户的**：用户可能正开着一份填了一半的提交页；拿它跳转会当场毁掉草稿。失败时关掉自己开的那个；**`not-logged-in` / `challenge` / `page` 例外** —— 把那个标签页亮出来并保留：登录页用户就地登录后重试，人机验证页与「找不到表单」的页面就是唯一的现场（关掉等于把证据也收走）。其余原因（题目没了 / 编译器没了）都是确定结论，关掉别堆标签页。判定收尾同理：**AC 收掉，非 AC 保留并导航到详情页**（2026-10-24，2.67.4）。
3. **编译器按显示名挑、不写死 `programTypeId`**：同一道题在不同比赛里可用的编译器会变。取最后一个 `GNU G++`、退而求其次任意 C++；Python 取最后一个非 PyPy 的。挑不到就回 `language-missing`，不猜。
4. **判定映射宁保守**：`Pretests passed` 算 `ac`；空 / `In queue` / `Running` / `Testing` 都算 `testing`（中转态不弹通知）；认不出的折成 `other`。站点只拿判定码决定通知颜色与文案，**不拿它做任何放行判断** —— 与 `cp-cf-check` 那条硬边界同理。

**⚠️ 消息字段名踩过的坑**：`cp-submit` 的源码那一栏叫 `sourceCode`，**不能叫 `source`** —— 信封上的 `source` 是 `'cp-page'` 这个暗号，同名字段会把暗号盖掉，整条桥（所有消息）当场失联。`bridge.ts` 的类型检查当场抓到了这个重名。

**验证**（2026-10-23，dev server + headless Chrome，探针跑完即删）：

- **A 没装扩展**：握手超时后按钮 `disabled=true`、opacity 0.45（与 ▶ 同一档），页脚那行与 `title` 都是「需要浏览器插件 CC for Web（含提交能力）才能提交」；按快捷键弹出的也是这条 message（`提交失败` 标题），不是静默无反应。
- **B 用假桥扮一个带 `submit-code` 的扩展**：按钮变亮（`--accent`），在编辑器里**敲一段不存盘**再点它 —— 扩展收到的是这 24 个字符（与输入一字不差）、`language: 'cpp'`、题目地址与提交页推导一致，信封 `source` 仍是 `'cp-page'`；点击瞬间按钮进 `.is-submitting` 且禁用、弹常驻「提交中…」；回执后换成「已提交到 Codeforces / 提交 #123456789」；`cp-submit-status` 推 `ac` 后换成「#123456789 通过」。两套主题都截了图，`pageerror` 为 0。
- `npm run verify` 仍是既有基线（A/E/G/H 红、B/C/D/F 绿），`npm run build` 通过。

**2.67.1 当日补丁**（2026-10-23，用户在自己 Chrome 里实报「提交页认不出来（站点可能改版了）」）：三处都改了。

1. **新建标签页的空白页竞态**：`browser.tabs.create` 之后、导航真正开始之前，标签页就可能报 `status === 'complete'`，那会儿 `tab.url` 还是 `about:blank`。旧的 `waitForTabComplete` 只看 status，于是立刻去问内容脚本 —— 空白页上没人应答，最后折成 `page`。现在要 `status === 'complete'` **且** `isRealDocument(tab.url)`（http / https）才算加载完成。
2. **失败现场不再收走**：`page` / `challenge` 与 `not-logged-in` 一样保留并激活那个标签页（见上面第 2 条）。
3. **人机验证不再被误报成「站点改版」**：真实 codeforces.com 在干净浏览器里会先落到 Cloudflare 托管验证页（标题「请稍候…」、`cf-chl-widget-*` 输入框、`window._cf_chl_opt`），它既没有登录表单也没有提交表单，原先只能折成 `page`。现在新增原因 `challenge`（跨仓契约，站点文案「Codeforces 正在人机验证，请在打开的页面里完成后重试」）。判据只在**找不到提交表单**时才看，且不拿 `challenge-platform` 脚本单独作数 —— 普通 CF 页面也可能挂那条脚本。

清单（`host_permissions` 190 / `content_scripts` 4）与 API `permissions` 未变，第三方组件未变。

**2.67.2 当日补丁**（2026-10-23 晚，在用户**已登录**的浏览器里看真实提交页 + 真交了一次）：**根因与上面三条都不同 —— 真页面的源码框叫 `source`，不是 `sourceFile`。** `fillSource` 早先按 `textarea[name="sourceFile"]` 找，可 `sourceFile` 在真页面上是旁边那个**上传文件的 input**，全页没有一个叫 sourceFile 的文本域，于是 `fill` 在最后一步返回 `page`，用户看到的就是「提交页认不出来」。

真实提交页（`/contest/1832/submit`，2026-10-23 登录态实测）的结构：

| 元素 | 真实值 |
| --- | --- |
| 表单 | `form.submit-form.submitFrameForm`；action 自带 `?adcd1e=…&csrf_token=…` |
| 题目 | `select[name="submittedProblemIndex"]`，value 就是 `A` / `D1` |
| 编译器 | `select[name="programTypeId"]`，34 项；最后一个 `GNU G++` 是 `91` = `GNU G++23 14.2 (64 bit, msys2)` |
| 源码 | `textarea[name="source"]`（`#sourceCodeTextarea`，`display:none`）—— **`sourceFile` 是文件上传框** |
| 可见编辑器 | Ace（`window.ace`，`#editor`），与那个隐藏框**双向同步**：写隐藏框再派发 `input`，Ace 里的内容跟着变（实测 249/249 字符一致）；反向也一样 |
| 隐藏域 | `csrf_token` / `ftaa` / `bfaa` / `_tta` —— 点页面自己的提交按钮就由页面带着走，扩展不用碰 |

**实测**：按修好后的步骤（同样的选择器、同样派发 `input` / `change`、同样点 `input[type=submit]`）在真实页面上选 A、选 91、写入源码 → 302 到 `/contest/1832/my` → 新行 `data-submission-id=395707398`、判定 `Running on test 1` → 落定为 **Accepted**（C++23 GCC 14-64）。源码若没进 POST 会直接 CE，所以这条 AC 同时证明源码确实到了判题机。

**判定读取的实况**：刚跳转时实时行上还有 `.submissionVerdictWrapper`（读到 `Running on test 1`）；判定落定后实时行被站点自己的脚本改写，包裹类**消失**、只剩 `<td>` 文本（`Accepted`）；而 `fetch()` 重新拉到的 HTML 里仍带包裹类。两条路都必须留 —— `VERDICT_HINT` 扫各列不是备用，是主力之一。

**端到端实测**（2026-10-23 晚，真扩展 + 真站点 dev server + headless Chrome；`codeforces.com` 由本机 CONNECT 代理喂一个「已登录」的假提交页，主机名与同源都保持真实；探针跑完即删）：

| 场景 | 结果 |
| --- | --- |
| 完整提交（假 CF 已登录） | 站点点 ↑ → 扩展打开 `https://codeforces.com/contest/1/submit` → 表单 POST 里 `submittedProblemIndex=A`、`programTypeId=89`（列表里最后一个 `GNU G++`）、源码与编辑器正文一致（浏览器按表单规则把换行统一成 CRLF，归一化后 82/82 字符全等）→ 跳 `/my` → 读出提交号 123456789 → 通知依次为「提交中…」→「已提交到 Codeforces / 提交 #123456789」→「#123456789 通过」；终态后扩展自己开的标签页被关掉 |
| 提交页没有表单 | 通知「提交失败 / 提交页认不出来（站点可能改版了）」；扩展开的 `https://codeforces.com/contest/2/submit` **保留且在前台**（`visibilityState = visible`） |
| Cloudflare 验证页 | 通知「提交失败 / Codeforces 正在人机验证，请在打开的页面里完成后重试」；验证页保留且在前台 |
| 真实 codeforces.com（未登录的干净环境） | 落到 CF 的 Cloudflare 托管验证页，返回 `challenge` 而不是 `page`；那一页被亮出来，用户能直接看到「正在进行安全验证」 |

**仍未自动化的**：扩展整条链跑在真实登录态里 —— 那要把新版装进用户已登录的 Chrome 并由本站触发；探针不碰用户的登录态，所以这几次修复都是在真实页面上按扩展的同一套步骤逐字执行的（选择器、事件、点按钮都一样）。真实的表单字段与判定文案已由 2026-10-23 两次真提交（#395707398、#395709826，均 `Accepted`）覆盖。

**2.67.3 当日补丁**（2026-10-23 深夜，用户装了 2.67.2 后实报：「打开了提交界面，代码也已经粘贴进去了，过一会儿超时返回失败；此时我手动点一下提交就成功了」）：**源码框修好之后，卡在提交按钮上 —— 它是服务端渲染成 `disabled` 的。**

真页面上那颗按钮是 `<input class="submit" type="submit" id="singlePageSubmitButton" disabled="disabled">`，解禁它的只有页面内联脚本里挂在题目下拉框上的 change 处理器：

```js
function updateSubmitButtonState() { ... if (problemIndex == "") $(".submit-form :submit").attr("disabled","disabled")
                                          else $(".submit-form :submit").removeAttr("disabled") }
$("select[name=submittedProblemIndex]").bind('change', updateSubmitButtonState);
```

扩展只写 `select.value = 'A'` 而不派发事件，处理器从不触发，按钮一直是灰的 → `click()` 在浏览器里对 disabled 控件是空操作 → 没有任何 POST → 后台等不到跳转 `/my`，20 秒后按超时回 `rejected`。**这正好解释了「手动点就成功」**：用户接管那一刻页面早已解禁（或他重选了下拉框），按钮当然能点。

实测（真实登录页，未做任何其他操作）：只设 `.value` 后等 3 s / 8 s，按钮 `disabled` 仍是 `true`；随后 `dispatchEvent(new Event('change', { bubbles: true }))`，**同步**变成 `false`（jQuery 的处理器当场 `removeAttr`）。

修法：`submitCode.ts` 新增 `enableSubmit(select)`（就是派发那个 `change`），`selectProblem` 的两个分支都调它；选编译器之后也补一次 `change`（同样是页面脚本在监听）。随后在一个**全新的**提交页上按扩展的顺序走一遍（选 A → change → 选 91 → change → 写源码 253 字符 → 50 ms 后点按钮）→ 302 到 `/contest/1832/my` → `#395709826` **Accepted**（46 ms，C++23 GCC 14-64）。

**2.67.4 当日改版**（2026-10-24，用户口径：「样例为非 AC 需要看网页具体是怎么出错了，所以不要关」）：终态收尾按判定分两路 —— **AC 照旧收掉**扩展自己开的标签页；**非 AC（wa / tle / mle / re / ce / other）保留**，并把这一页从 `/my` 直接导航到 `https://codeforces.com/{base}/submission/{id}`、`active: true` 亮到前台。留在 `/my` 列表上还得再点一次才到得了现场，而失败测试点、编译错误原文、RE 输出都只在详情页上。总超时（2 分钟仍无终态）也走非 AC 这一路：留着并跳到详情页，让用户自己看卡在哪。`SubmitTarget` 因此多带一个 `base`（`contest/2276` / `gym/100001` / `group/123/contest/456`），详情页地址由它拼。

**端到端实测**（2026-10-24，dev 构建真扩展 + 最小目标页 + 本机 CONNECT 代理扮 codeforces.com，探针跑完即删）：AC → 判定 `ac` 后标签页被关（只剩 `about:blank` 与目标页）；WA → `wa` 后标签页保留在 `/contest/1/submission/123456789`、`visibilityState=visible`、5 秒后仍在；CE → 与 WA 同。三场景 20 条断言全绿。同一个探针里踩到一条**探针自身**的坑：`waitForFunction` 默认按 rAF 轮询，CF 页被激活后目标页转入后台、rAF 被节流，等终态永远等不到（判定其实早已推送）——改成 `polling: 100` 即可。

**改动文件**：站点 `services/ojSubmit.js`（新）、`composables/useCompanionBridge.js`、`composables/useShortcutManager.js`、`components/TestPanel.vue`、`App.vue`、`i18n/messages/{tests,settings}.js`、`services/extensionPackage.js`（版本 → 2.67.0 / 2.67.1 / 2.67.2 / 2.67.3 / 2.67.4）；扩展 `src/submitCode.ts`（新）、`src/messaging.ts`、`src/background.ts`、`src/bridge.ts`、`scripts/build/extension.ts`、`package.json`（2.67.0 → 2.67.4）。清单随之变为 **`host_permissions` 190 条 / `content_scripts` 4 条**（新增的提交页与 `/my` 页），**没有**新增 API `permissions`；第三方组件一个没变（`NOTICE.md` / `NOTICE.en.md` 已按 2026-10-23 记三笔）。

**还不做什么**：其余 OJ 的提交页各是另一套形态（洛谷要 token、牛客 / LeetCode 是接口），首版只认 Codeforces；**不自动提交**（不发源码、不后台跑，只认用户那一次显式动作）；不替用户选题目 —— 题目由地址里的 contest + index 唯一确定，扩展只是把它在提交页的下拉框里选中。

## 14. 多平台移植（**macOS 已落地**；Windows 第 1–3 步已落地、待实机实测；**Android 真机已跑通 C++ 编译与运行**，见 14.I；**Android release 已签名出包、包体 118.6 MiB**，见 14.J；**壳里的云端同步已接管（绝对地址 + Worker 放行壳来源）**，见 14.K；**壳端出包已剔掉 `dist/wasm`（74 MB 死重）**，见 14.L；**Android 工具链再裁掉 7 处系统头（设备 Data −6.2 MB）**，见 14.M；**壳里「收键盘后点哪都把输入框捞回来」已修（保焦闸门放宽到全部可编辑面）**，见 14.N；**桌面端「导出到本机文件夹」已落地（另立 `export_*` 四条命令，不复用 `fs_*`）**，见 14.O；**壳的系统状态栏已跟随站内主题（底色 + 图标明暗，前端 → Rust → JNI）**，见 14.P；Linux 未开工）

> **⚠️ 2026-10-19 起冻结**：桌面端（macOS / Windows / Linux 的 Tauri 壳）不再推进，未完成计划已归档到 [`docs/废案.md`](docs/废案.md) §1。**本节以下全部是已落地的实测记录，不是待办清单**；`src-tauri/` 与相关代码保留不动，网页版与安卓壳不受影响。

**目标**：把同一套前端搬到桌面，用 **Tauri** 打包成原生应用（首选 macOS，其次 Windows / Linux）。**Web 版（Vercel + PWA）继续保留、是并行的一条线，不是被替代**；桌面端与网页端共用同一份 `src/`，只在「跑代码」「存储」「离线」这几处按平台分流。

**架构定调（照这个做）**：前端只负责 UI，**凡是碰系统的东西——读写文件、调编译器、起子进程——全部放在 Rust 侧**，前端只通过 `invoke` 递一个字符串 / 数据对象过去，结果再拿回来。所以 Tauri 侧**不用**给前端开 `shell` / `fs` 权限插件，权限面收到最小（这是这条路线最主要的价值）。参考方案里那段 `main.rs` 的 `run_cpp` 就是这个形状：前端送 `code`，Rust 落盘 → 调 `clang++` → 跑 → 回 stdout/stderr。

**先纠正参考方案里与本仓不符的地方（照抄会直接踩坑）**：

| 参考方案 | 本仓实际 |
| --- | --- |
| React 项目、产物目录 `build` | **Vue 3 + Vite**，产物目录 **`dist`**（第 10 节） |
| dev server `localhost:3000` / `5173` | **`http://localhost:5199`**（`vite.config.js` 写死；扩展的 `TARGET_SITE_PATTERNS` 在 dev 构建里认 `localhost` 的**所有端口**，见第 13 节） |
| `npm run start` | `npm run dev` / `npm run build` |
| `main.rs` 里写死 `clang++` + `env::temp_dir()` + 固定名 `temp_code.cpp` / `temp_exec` | **只能当原型**：固定文件名在并发用例（`runner.js` 并发 2）下会互相覆盖；要按运行轮次隔离临时目录、跑完即清，并接上本仓既有的时限 / kill / stdin / 退出码语义（见下） |

**接进本仓时要对齐的既有契约**：

- **走引擎注册表，别绕过它**：新引擎落在 `src/services/engines/`，由 `runner.js` 调度；网页构建的 `DEFAULT_ENGINE_ID` 仍是 wasm 沙箱（第 7 节），桌面端由**运行时探测**（`'__TAURI_INTERNALS__' in window`）改指向原生引擎 —— 两端共用同一份 `dist`，所以没用构建期变量，见 14.C。
- **命运要与现有沙箱一致**：时限（`--timeLimit` 同口径，只计运行段）、超时 `kill()`、stdin 分块推、编译产物缓存（对应 `compileCache`）、卡片耗时口径（第 7 节「耗时口径」那段，别改回去）、引擎 outcome 词表（`ok / compile-error / runtime-error / timeout / unreachable / cancelled`）→ `runner.js` 翻成 `AC / WA / CE / TLE / RE / ERR`。原生引擎只是把「怎么跑」换了，**上面这些口径一个都不许另起一套**。
- **命令名与参数名是跨语言契约**：Rust `#[tauri::command] fn run_cpp(code: String)` 与前端 `invoke('run_cpp', { code })` 必须逐字对上；Tauri v2 的 `invoke` 从 `@tauri-apps/api/core` 引（不是 `@tauri-apps/api/tauri`）。多参数（如 `entryPath`）要按 Tauri 的 `rename_all` 规则对齐大小写，写错了只会得到一句「参数缺失」。

**落地前必须一起想清楚的九件事（都是本仓硬约束的延伸）**：

1. **COOP / COEP 与 `SharedArrayBuffer`**：浏览器版沙箱靠 `vite.config.js` + `vercel.json` 那组 `Cross-Origin-Opener-Policy: same-origin` / `Cross-Origin-Embedder-Policy: require-corp` 才拿到 `SharedArrayBuffer`（第 10 节第 1 条）。Tauri 的 webview 不走 Vercel，**这组头要在 Tauri 配置侧另设一份**（`tauri.conf.json` 的 `app.security.headers` / 自定义协议的响应头，具体字段开工时按所用 Tauri 版本核），否则桌面端连现有的 WASM 沙箱都起不来。
2. **存储契约照旧，但数据不通用**：`cp.*` / `cp-vfs` / `cp-pch` 的唯一出处仍是 `storageNames.js`（第 1 节）。桌面端 webview 是另一个 origin，localStorage / IndexedDB 与浏览器版**不共享**，要迁移得另做导入导出，别指望自动带过去，也别为此改键名（改名要配迁移，见第 1 节）。
3. **Cache Storage 在 webview 里不存在**：`cp-toolchain` / `cp-md-runtime` 那两套探针（第 5 节坑 23）在桌面端会一律判「未就绪」。桌面端要么把运行时改由 Rust 读本地文件，要么直接用原生编译器、不再下那 76MB。
4. **原生编译取代自托管工具链（但别删）**：桌面端用系统 `clang++`（macOS 需 Xcode CLT：`xcode-select --install`），`public/wasm/` 那 52MB 在桌面产物里可以不打包；**仓库里必须留着**——浏览器版与 PWA 离线全靠它（第 9 节）。
5. **Service Worker / PWA 在 Tauri 里没有**：`sw.js` / `precache-manifest.json` / 安装入口（`useInstallPrompt`）在桌面端都是死路，要按平台关掉，别让桌面界面出现「安装到设备」。
6. **扩展抓题链路只在浏览器**：`useCompanionBridge` 走 `window.postMessage` + 内容脚本（第 13 节），桌面端拿不到扩展。桌面版要么不做抓题、要么另开通路；**那批 `cp-*` 消息名是跨仓契约，不许单方面改**。
7. **新增依赖要先讨论**（第 0 节）：`@tauri-apps/cli`（devDependency）与 `@tauri-apps/api` 是本项目第一次为桌面端引 npm 依赖；Rust 侧的 `tauri` crate 版本与 `src-tauri/tauri.conf.json` 也要一并记进本文件。
8. **多平台 = 每平台各自构建**：Tauri 不能一次交叉编译出全套，macOS / Windows / Linux 各自 CI 构建；发布还涉及签名（macOS 公证 / Windows 代码签名）。这与 Vercel 部署（第 10 节）是**两条独立的发布线**。（Windows 那份已落地：`.github/workflows/desktop.yml`，见 14.H；macOS 目前仍是本机手打，未进 CI。）
9. **文案五处同步照旧**（第 12 节）：桌面版一上，guide 双语 / `help.js` / `docs/使用手册.md` / `index.html` 的 `<noscript>` 里「在浏览器里跑」这类口径要按平台补。

**建议的推进顺序（每步单独验收，别一次铺开；每步跑通后回写本节）**：

1. **环境与空壳**：Rust（`rustup`）+ Xcode CLT + `@tauri-apps/cli`；`npx tauri init` 把 web assets 指到 `dist`、dev server 指到 `http://localhost:5199`；`npx tauri dev` 能起一个只显示现有前端的原生窗口。
2. **最小链路**：Rust 侧 `run_cpp`（临时目录按运行隔离、带时限与 kill），先**不碰引擎注册表**，单独验一次能编能跑。
3. **并进引擎表**：包成 `services/engines/` 里的一个新引擎，接上 `runner.js` 的调度与 outcome / 耗时口径，桌面构建改 `DEFAULT_ENGINE_ID`。
4. **平台分流**：桌面构建里关掉 SW / PWA / 安装入口 / 扩展抓题 / 工具链下载；COOP/COEP 在桌面侧另设一份。
5. **打包发布**：`npx tauri build`，产物在 `src-tauri/target/release/bundle/`；macOS 先出 `.dmg` / `.app`，再考虑 Windows / Linux 与 CI。

**纪律**：按上面 5 步逐步做，每步实测通过后把结论回写到下面「落地记录」，并把动到的契约同步到对应章节（尤其第 0、6、7、9、13 节）。**当前进度：第 1–5 步已落地（见 14.A–14.E），macOS 已能出未签名的 `.app` / `.dmg`。Windows 移植见 14.F–14.H：第 1 步（Rust 侧跨平台）、第 2 步（打包配置）、第 3 步（GitHub Actions，已出 `unnamed_0.1.0_x64-setup.exe`）均已落地，**第 4 步（实机实测 + 文案五处）未做**。Android 移植见 14.I：工具链组装、Rust 侧解压与转指、前端准备遮罩均已落地，**真机上 C++ 用例能编能跑（2026-10-09 实测）**，Python 侧无解；签名与公证未做；Linux 仍未开工。**

### 14.A 第 1 步落地记录（环境与空壳，2026-10-08 实测通过）

- **新增依赖**：`@tauri-apps/cli` `^2.12.1`（devDependency，本仓第一个为桌面端引的 npm 包）。前端运行时包 `@tauri-apps/api` **尚未安装**，第 3 步要写 `invoke` 时再装。
- **新增目录**：`src-tauri/`，即 Tauri v2 标准结构（`Cargo.toml` / `Cargo.lock` / `build.rs` / `tauri.conf.json` / `src/main.rs` / `src/lib.rs` / `capabilities/default.json` / `icons/`）。它自带的 `src-tauri/.gitignore` 忽略 `/target/` 与 `/gen/schemas`，所以只有源码与 `Cargo.lock` 进仓库。
- **Rust 工具链**：本机装的是 rustup **rustc / cargo 1.99.0**。`static.rust-lang.org` 对本机网络不稳（`curl: (56) Recv failure`），最后是从 USTC 镜像取 `rustup-init` 装的；crate 侧 `crates.io` 直连正常，**没**配镜像。生成的 crate 版本：`tauri 2.12.1` / `tauri-build 2.7.1` / `tauri-plugin-log 2.10.0`。
- **仓库外的系统级改动**：`~/.zprofile` 追加了一行 `. "$HOME/.cargo/env"`。rustup 默认只写 `~/.profile`，而本机 shell 是 zsh、**不读它**，不加这行自己在终端敲 `cargo` 会 command not found。另新增 `~/.cargo/`、`~/.rustup/`。
- **`tauri.conf.json` 关键值**：`productName` `unnamed`、`identifier` `best.998244353.unnamed`、`frontendDist` `../dist`、`devUrl` `http://localhost:5199`、`beforeDevCommand` `npm run dev`、`beforeBuildCommand` `npm run build`。窗口 1280×820（最小 960×640）。窗口另有 **`"dragDropEnabled": false`**（2026-10-12 加）：Tauri 默认接管 webview 的拖放来发自己的 `DragDropEvent`，Windows 的 WebView2 被**整个替换**掉拖放处理器 —— 不关掉它，前端永远收不到 HTML5 的 dragenter / drop，「从系统拖文件进来」（第 7 节第 ⑤ 条入口）在桌面壳里就是死的。我们没用 Tauri 的原生 drop 事件（`src-tauri/src/` 里没有 `DragDropEvent` 的消费方），关掉零损失；**桌面端出包后要实机拖一次确认**（无头探针验不了这一层）。
  - `identifier` 必须早点定：生成时的默认值 `com.tauri.dev` 打包会被 Tauri 直接拒绝，而且它同时是 webview 的数据目录名（`~/Library/Application Support/<identifier>`），**后改等于把用户的题解全丢**。
  - 窗口尺寸同理改了默认的 800×600 —— 那个尺寸装不下三栏 IDE。
- **验证**：`npx tauri dev` 首次整树编译 **2m01s** 后弹出原生窗口。硬证据是 WebKit 的 `WebContent` / `Networking` / `GPU` 三个 XPC 进程都在跑，且 `com.apple.WebKit.Networking` 与 vite 的 `5199` 之间存在 ESTABLISHED 连接（本机没给终端授「屏幕录制 / 辅助功能」权限，截图取证做不了，只能靠这条连接 + 目视）。
- **坑（记下来，别再踩）**：`npx tauri dev` 从**非登录 shell** 起会找不到 `cargo`（报 `failed to run 'cargo metadata'`），因为 PATH 里没有 `~/.cargo/bin`。临时办法是在命令前 `export PATH="$HOME/.cargo/bin:$PATH"`，长期就靠上面那行 `.zprofile`。
- **待决**：`vite.config.js` 的 `strictPort` 仍是 `false` —— 5199 被占时 vite 会静默换端口，而 Tauri 还死等 5199，`tauri dev` 会挂住不给提示。改 `true` 会影响 `npm run verify`，**当前刻意未动**，列此备查。

### 14.B 第 2 步落地记录（最小链路 `run_cpp`，2026-10-08 实测通过）

- **新增文件**：`src-tauri/src/native.rs`（命令 + 核心逻辑 + 单元测试，一个文件装完）。`src-tauri/src/lib.rs` 加了两行：`mod native;` 与 `.invoke_handler(tauri::generate_handler![native::run_cpp])`。
- **命令契约**：`run_cpp(code: String, stdin: String, time_limit_ms: Option<u64>) -> RunOutcome`。Tauri v2 按 camelCase 反序列化参数，所以前端要写 `invoke('run_cpp', { code, stdin, timeLimitMs })`；`timeLimitMs` 不传时 Rust 侧取 1000。
- **返回体**：`RunOutcome { outcome, stdout, stderr, durationMs, detail }`，带 `#[serde(rename_all = "camelCase")]`，与 `src/services/engines/index.js` 里的 `EngineExecution` **同构** —— 第 3 步包引擎时把 `invoke` 的结果原样递回去即可。`detail` 为空时不序列化（避免前端拿到 `null` 而不是 `undefined`）。
- **口径对齐（逐条）**：
  - 编译参数 `-std=c++17 -O2 -w`，与 `src/services/runnoSandbox.js` 的 `FRONTEND_ARGS` 同值（`-w` 是 2026-10-18 加的，理由见 §7 那条）；沙箱那边刻意没开 `-fno-exceptions`，这里同样不开。
  - 时限**只计运行段**（从 `spawn` 到进程退出的墙钟），不含编译，默认 2000ms（2026-10-25 从 1000 上调）—— 同 `runner.js` 的 `TIME_LIMIT_DEFAULT_MS`；Rust 侧 `DEFAULT_TIME_LIMIT_MS = 1000` 只是前端漏传时的兜底，正常路径用不到。
  - 到点 `child.kill()`，记为 `timeout`；非 0 退出码与「被信号杀死」（`code()` 为 `None`）都归 `runtime-error`；退出码 0 记 `ok`。
  - `ok` 时把 `stderr` 清空、`ok` 之外的三种（timeout / runtime-error / compile-error）保留 `stdout`；编译失败 `durationMs` 记 `null`（卡片就不显示耗时）—— 全部照 `src/services/engines/wasm.js` 的处理。
- **临时目录隔离**：`$TMPDIR/cp-native-<pid>-<自增序号>-<纳秒>`，一次运行独占一个，跑完（含报错路径）`remove_dir_all` 清掉。**三个分量缺一不可**：`runner.js` 的 `concurrency = 2` 会同时跑两次，参考方案里那个固定名 `temp_code.cpp` 会直接互相覆盖。
- **三条管道各一个线程**：stdout / stderr 边跑边读（读晚了会被管道缓冲区堵死，程序写满 64KB 就卡住，我们又等它退出，死锁）；stdin 也在独立线程里推、推完 drop 掉写端（不发 EOF 的话 `while (std::cin >> x)` 会永远等下去）。
- **不产出界面文案**：Rust 侧只回原始 stdout / stderr 与机器可读状态，`detail` 一律不填 —— 文案仍由前端 i18n 数据表兜底（`错因就让它空着`，见「界面文案一律不写死」）。编译错误的 `stderr` 是 clang 自己的诊断原文，与沙箱行为一致。
- **验证**：`cargo test` **5 个用例全过**（0.41s）：编译并运行 / stdin 推入 / 编译错误且 `durationMs` 为 null / 非零退出且保留已输出的 stdout / 死循环被 kill（用 `volatile` 累加防 `-O2` 把无副作用的无限循环整段删掉）。`cargo test` 直接调 `run_cpp_core`，不需要起窗口。
- **尚未做（第 3 步的活）**：编译阶段没有看门狗（`clang++` 卡住会一直等）；没有编译产物缓存（对应 `compileCache`）；没有 `cancelled` 通路（前端 `AbortSignal` 还传不进来）；`-ferror-limit` / `-fmessage-length` 这两个诊断格式开关没跟沙箱对齐。

### 14.C 第 3 步落地记录（并进引擎表，2026-10-08）

- **新增依赖**：`@tauri-apps/api` `^2.12.1`（**dependencies**，前端运行时包；与 devDependency 的 `@tauri-apps/cli` 同版本）。装它才有 `invoke`。npm 官方源当时超时，重试一次即成功（`--fetch-retries` 用不着改源）。
- **新增文件**：`src/services/engines/native.js`。**改动文件**：`src/services/engines/index.js`、`src/services/engines/wasm.js`、`src/i18n/messages/engines.js`、`src/App.vue`、`src-tauri/src/native.rs`、`src-tauri/src/lib.rs`。
- **平台判定用运行时探测**（不是构建期变量）：`'__TAURI_INTERNALS__' in window`（Tauri v2 必注入）。理由：两端**共用同一份 `dist`**，构建期变量会逼出第二条构建线，还有「忘设变量就跑错引擎」的隐患。代价是 `@tauri-apps/api` 也进了网页包（很小，值得）。
- **引擎对象新增可选字段 `platforms: ['web'|'desktop']`**（不写 = 两端都可用）。`wasm` 标 `['web']`、`native` 标 `['desktop']`。注册表四处按它过滤：`engineChoices()`（列不出来的就是选不到）、`defaultBases()`、`getEngine()`（存档里的 id 来自另一端就退回本端默认）、`DEFAULT_ENGINE_ID`（= 列表里第一个能在本端跑的：网页 wasm / 桌面 native）。**这不是第 4 步抢跑**：不过滤就会在网页版露出一个点了必报错的「本机原生编译器」，在桌面版露出跑不起来的沙箱（§14 第 1、3 条）。
- **`App.vue` 的 `cp.engine` 存档会当场归位**：dev 里桌面 webview 加载的是 `http://localhost:5199`，与浏览器**同源**，`cp.engine` 是共享的；云端同步也会把另一端的 id 带过来。所以启动时若 `getEngine(id).id !== id` 就改回本端默认，免得面板高亮的引擎与真正生效的那个对不上。
- **Rust 侧加 `run_python`**（`run_cpp` 契约不变）：把原先的 `run_cpp_core` 抽成 `run_core(Language, …)`，`run_in_workspace` 按语言组装命令（C++：clang++ 编译后跑 `main.bin`；Python：直接 `python3 main.py`），两者最后都进同一个 `run_program`（原 `run_binary`）—— 时限 / kill / 三管道 / 退出码口径**完全共用，没有第二套**。文件顶部新增 `enum Language`，`source_name()` 决定 `main.cpp` / `main.py`。
- **Python 的口径**：没有编译段，耗时就是「解释器启动 + 程序执行」的墙钟（同 `engines/wasm.js`）；语法错误发生在运行段，按既有词表归 `runtime-error`（**不是** `compile-error`），`durationMs` 照常有值；`ok` 时同样清空 `stderr`。`python3` 用系统 PATH 里的那个（本机是 `/Library/Frameworks/Python.framework/.../3.14.6`；Windows 的 `python` 别名未处理，属已知限制）。
- **`native.js` 的职责**：`invoke` 包装 + 把 Rust 的 `unreachable` 翻成人话（`runner.js` 那条分支只看 `detail`，不看 `stderr`）+ `health()`。命令名用一张 `COMMANDS = { cpp: 'run_cpp', python: 'run_python' }` 表与 Rust 逐字对账；`timeLimitMs` 只在是数字时才放进参数（不依赖「缺字段等价于 None」）。
- **`health()` 自检两项系统依赖**：先跑一句 C++（验 clang++，macOS 缺则提示 `xcode-select --install`），再跑一句 `print(1)`（验 python3）；任一不过就报出来。
- **取消**：只认「还没开始跑就被取消」（`signal.aborted` 进 `execute` 时）。Rust 侧仍无中途 kill 通路，与 14.B 的「尚未做」一致。
- **i18n**：新增 `engine.native.*` 八条（label / hint / ready / cppUnavailable / pythonUnavailable / unavailable / unsupportedLanguage / noDetail，中英各一份）。另外把 `engine.localNoBase` 从「本地沙箱在浏览器里跑…」改成「该引擎在本机运行，不需要服务地址。」—— 现在两个本地引擎共用这一行，原话术对新引擎不成立。
- **验证**：
  - `cargo test` **8 个用例全过**（原 5 个 C++ + 新增 3 个 Python：stdin 求和 / 语法错误归 runtime-error 且耗时非空 / `while True` 被 kill）。注意 Python `print` 自带换行，断言写 `\"3\\n\"`；判定侧由 `compare.js` 的 `normalizeLines` 抹掉行尾空白，不影响 AC。
  - `npm run build` 通过（网页包能正常 import `@tauri-apps/api/core`）。
  - 网页版回归（浏览器实测 localhost:5199）：设置 › 评测引擎 列表仍是「本地 WASM 沙箱 / Piston / Judge0 / 自检」，**没有**混入「本机原生编译器」，`localNoBase` 新文案已生效。
  - 桌面端：`npx tauri dev` 起窗口，前端接的是 `run_cpp` / `run_python`，真实评测由用户目视确认（本机终端没给录屏权限，截不了图）。
- **尚未做（留给第 4 / 5 步）**：桌面端仍在跑 SW / PWA / 安装入口（那些在 Tauri 里是死路，勿点）；COOP/COEP 未在 Tauri 侧另设；扩展抓题链路在桌面端不通；**guide 双语 / `help.js` / `docs/使用手册.md` / `index.html` noscript 这五处文案尚未按平台补** —— 刻意等桌面版真能发布时再动，现在网页文档描述的仍是网页产品，不会误导读者。
- **坑**：`cargo test` 里 Python 用例依赖系统 `python3`，CI 机器若没有会挂；桌面端正式支持 Python 前，得先决定是「依赖系统解释器」还是「随包带一个」。

### 14.D 第 4 步落地记录（平台分流，2026-10-08）

- **新增文件**：`src/services/platform.js`。这是「我在哪一端」的**唯一出处**：`IS_DESKTOP`（`'__TAURI_INTERNALS__' in window`）与 `IS_WEB`。第 3 步写在 `engines/index.js` 里的那份判定已改为引用它 —— **以后不要再任何地方手写 `'__TAURI_INTERNALS__' in window`**。
- **改动文件**：`src/services/engines/index.js`、`src/main.js`、`src/composables/useCompanionBridge.js`、`src/services/runtimePreload.js`、`src/App.vue`、`src/components/EditorSettingsPanel.vue`、`src-tauri/tauri.conf.json`。
- **桌面端关掉的五处（逐条）**：
  1. **Service Worker**：`main.js` 的注册条件加 `IS_WEB`（dev 与桌面端都不注册）。`vite.config.js` 仍照常产出 `dist/sw.js` —— 网页版与 PWA 离线要用它，只是桌面端不去注册。
  2. **PWA 安装入口**：设置 › 应用 的「安装到设备」那一行 `v-if="!isDesktop"`。`useInstallPrompt` 本身没动（那行藏了就没有入口，`beforeinstallprompt` 在桌面端本来也不触发）。
  3. **扩展抓题**：`useCompanionBridge` 的 `refreshExtensionInfo()` 与 `attach()` 在桌面端**直接 return** —— 不挂 `message` 监听、不发 ping，`extensionInfo` 恒为 `null`；设置 › 浏览器插件 整栏（状态 / 下载 / 投递开关 / 快捷键）在桌面端由 `visibleSections` 从导航里整项裁掉（2026-10-11 前是块级 `v-if="!isDesktop"`）；`App.vue` 的 `emptyNotice` 在桌面端直接返回 `null`（不再说「未检测到浏览器插件」这种在桌面端不成立的话）。**消息名与 `EXTENSION_SOURCE` 一个都没动**（跨仓契约）。
  4. **工具链下载**：设置 › 应用 的「本地运行环境」三行（C++ / Python 3 / 题解渲染器）、设置 › 云端同步 的「预下载」三个开关，都在桌面端 `v-if="!isDesktop"`；`runtimePreload.scheduleAutoPreload()` 在桌面端直接 return，启动不预下载。（桌面端改用系统 `clang++` / `python3`，见 14.B / 14.C；`public/wasm/` 与 `probeRuntime` 都**照旧保留**，网页版要用。）
  5. **COOP / COEP**：`src-tauri/tauri.conf.json` 的 `app.security.headers` 加 `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`。Tauri v2 会把它们加到自建协议的每个响应上；dev 走 vite，那两份头 `vite.config.js` 本来就有，所以 dev 不受影响。
- **验证**：
  - `npm run build` 通过。
  - 网页版回归（浏览器实测 localhost:5199，用户界面逐项核对）：设置 › 应用 两块（安装到设备 / 本地运行环境三行）与设置 › 浏览器插件 一栏（状态 / 下载 / 投递开关 / 插件快捷键）都在；设置 › 评测 的引擎列表仍是「本地 WASM 沙箱 / Piston / Judge0 / 自检」四项、**没有**混入 native；设置 › 云端同步 的预下载三开关都在。控制台无红色报错（仅有两条与本地 WASM 资源相关的 `ERR_CACHE_MISS`，改动前就有）。
  - 桌面端界面由用户目视确认（本机终端无录屏权限，截不了图）。
- **尚未做 / 待决（第 5 步或后续）**：
  - **题解渲染器在桌面端装不上**：Markdown / LaTeX 预览同样靠 Cache Storage（`mdRuntime.js`），桌面端因此会停在「缺渲染器」。本步只按 §14 纪律收起了「本地运行环境」里的下载入口，**预览面板自己那颗「下载渲染器」按钮没管** —— 要么让 Rust 读本地文件，要么桌面端不提供题解预览，得单独定。
  - **桌面端云端同步**：✅ **2026-10-09 已落地，见 14.K**（原记录：`/api/*` 是相对路径，在 tauri 自定义协议下没有对应后端，需另配绝对地址）。
  - `index.html` 的 `manifest.webmanifest` / `apple-*` 元标签是静态的、两端共用，未按平台拆（桌面端忽略它们，无害）。
  - **文案五处仍未补**（guide 双语 / `help.js` / `docs/使用手册.md` / `index.html` noscript）：口径仍是「等桌面版真能发布再动」。

### 14.E 第 5 步落地记录（打包发布，2026-10-08）

- **四个决定（发布前定死，先问后做，别再自己拍）**：
  1. **`productName` `unnamed` / `identifier` `best.998244353.unnamed` 定稿不动**。`identifier` 同时是 webview 的数据目录名（`~/Library/Application Support/<identifier>`），**发布后再改等于把用户的题解全丢**；`unnamed` 也不是占位符，它就是本站的品牌名（网页标题、PWA manifest、结构化数据三处一致）。
  2. **应用图标换成本项目自己的**：`npx tauri icon public/icons/icon-512.png` 覆盖掉 `tauri init` 的默认图标，`src-tauri/icons/` 下全套（`.icns` / `.ico` / 各尺寸 png / iOS / Android）一并重生成。
  3. ~~**`public/wasm/`（约 52MB）照常打包**：桌面端跑的是系统 `clang++` / `python3`，用不到它，但两端**共用同一份 `dist`**，排除要另加一条「打包前从 dist 删 wasm」的构建步骤并小心别影响网页版部署链路。先出可用产物，出包瘦身留到以后单独做。~~ ✅ **2026-10-09 已落地，见 14.L** —— 做法就是壳端单独一条 `build:tauri`，网页版仍走 `npm run build`，两条链路各不相干。
  4. **macOS 不做签名与公证**：先出未签名产物。
- **命令**：`export PATH="$HOME/.cargo/bin:$PATH"; npx tauri build`（非登录 shell 没有 `~/.cargo/bin`，见 14.A 的坑）。首次整树 release 编译 1m12s，改完前端再打一次增量只要 15.7s。
- **产物**（都在 `src-tauri/target/release/bundle/`）：
  - `macos/unnamed.app`（41.10 MiB）
  - `dmg/unnamed_0.1.0_aarch64.dmg`（34.20 MiB）
  - 架构是 **aarch64**（本机 Apple Silicon），**没做** universal / x86_64 交叉构建。
- **重打过一次**：补全的 `#` 替换范围修好后（见第 7 节那条末句）又跑了一次 `npx tauri build`，两个产物都是修好之后的版本。
- **未签名的影响**：首次打开会被 Gatekeeper 拦（「无法验证开发者」），得右键「打开」或在「系统设置 › 隐私与安全性」里放行。要对外分发就得补 Apple Developer 证书 + `notarytool` 公证。
- **本次产物包含当日新做的编辑器补全**（见第 7 节那条「编辑器自动补全」）：补全改动先落在前端，`beforeBuildCommand` 会重跑 `npm run build` 重新出 `dist`，所以重打一次包即可带上，不必单独处理。
- **尚未做（留给后续）**：Windows / Linux 构建（Tauri 不能一次交叉编译出全套，得各自 CI 出，另见本条第 8 项）；签名与公证；~~`public/wasm/` 出包瘦身~~ ✅ **2026-10-09 已落地，见 14.L**；~~**桌面端云端同步**（`/api/*` 是相对路径，Tauri 自定义协议下没有对应后端，见 14.D）~~ ✅ **2026-10-09 已落地，见 14.K**；**文案五处**（guide 双语 / `help.js` / `docs/使用手册.md` / `index.html` noscript）仍未按平台补。

### 14.F Windows 移植 · 第 1 步落地记录（Rust 侧跨平台，2026-10-08）

**先定的三项**（用户拍板）：工具链走**检测系统已装**，不做随包便携工具链；产物由 **GitHub Actions 的 `windows-latest`** 出；**这一轮只做 Windows**，Linux 之后再说。

**前端零改动**：`platform.js` 只分 `desktop` / `web`，Windows 与 macOS 同属 `desktop`，原生引擎本来就显示。真正的活全在 Rust 侧。

- **新增 `src-tauri/src/toolchain.rs`**：「用哪个编译器 / 哪个解释器 / 产物叫什么」的唯一出处。原先 `native.rs` 里写死的三处都是 macOS 的答案，逐条按平台分岔：
  1. **`clang++` → 候选表 `clang++` / `g++`**。Windows 上系统自带没有 clang++，除 PATH 外还要扫常见安装目录：MSYS2 四种环境（mingw64 / ucrt64 / clang64 / mingw32）、`Program Files\LLVM`、`C:\MinGW`、`C:\mingw64`、TDM-GCC-64、CodeBlocks 自带 MinGW、scoop。
  2. **`python3` → 候选表 `python3` / `python` / `py`**（Windows 上没有 `python3`；`py` 是官方启动器）。两个 Windows 专属的坑：**必须跳过 `%LOCALAPPDATA%\Microsoft\WindowsApps`** —— 那里的 `python.exe` 是 0 字节占位符，跑它只会弹 Microsoft Store，不跳过就会「找到一个假解释器」；还要补扫 `%LOCALAPPDATA%\Programs\Python\Python3XX` 与盘符根下的 `C:\Python3XX` —— 官方安装器的默认落点，「Add Python to PATH」**默认不勾**，不扫就漏掉最常见的一种装法（多版本按版本号从新到旧排）。
  3. **产物名 `main.bin` → Windows 上是 `main.exe`**。`CreateProcess` 只对**没有扩展名**的路径补 `.exe`，所以带 `.bin` 的产物在 Windows 上根本执行不了，症状是「编译成功却起不来」。
- **只认 clang / gcc 两族，不给 MSVC 加分支**：`-std=c++17 -O2` 是这两族的口径，而 `cl.exe` 是另一套（`/std:c++17 /O2`）—— 支持它等于让编译参数出现第二套口径，违反第 14 节那条「不许另起一套」。
- **`with_toolchain_dir`**：MinGW 的 `g++` 编出来的 exe 依赖**编译器同目录**的 `libstdc++-6.dll` / `libgcc_s_seh-1.dll`，而我们从常见安装目录按绝对路径捞出来的编译器，那个目录**不一定在 PATH 里** —— 不补就会「编译成功、一运行报缺 DLL」。运行前把工具链目录插进子进程 PATH（非 Windows 是空实现，调用处不必套 `cfg`）。
- **结果缓存**：`OnceLock`，一次运行里同一个工具只找一遍，不必每个用例都 stat 一串目录。
- **找不到工具链**：新增 `missing_toolchain()`，沿用 `unreachable` 口径，`stderr` 回机器可读的原始文本（`clang++ / g++ not found`），人话仍由前端 i18n 拼 —— 本文件不产出话术的约定不变。
- **文案**：`engine.native.cppUnavailable` / `pythonUnavailable` 拆成「正文 + `{hint}`」，按宿主系统填 `cppHintWindows` / `cppHintMac` / `cppHintOther`（Python 侧同理）。**macOS 的渲染结果与改动前逐字一致**（已逐条核对）。宿主系统取自 `platform.js` 新增的 `HOST_OS`：UA 猜的，**只用来挑提示文案，不当功能开关**；没为它引 Tauri 的 os 插件（一个 npm 包 + 一个 Rust crate 换一句提示不划算）。

**验证**：`cargo test` **16 passed**（原 8 个 + 新增 8 个），`cargo build` 无 warning，`npm run build` 通过。新增用例覆盖名字优先级（跨目录也成立）、目录不该被当成可执行文件、商店别名目录规则（纯逻辑，**在 macOS 上真跑**而非只编译）、结果缓存、找到的路径必须是绝对路径。

**本机验不到的**：Windows 专属分支（`extra_dirs` 的具体目录、`.exe` 后缀、商店别名过滤的实际生效）在 macOS 上只被编译、未被执行。要等第 3 步 CI 编译 + 装完实跑才算验过 —— 不假装本机验过。

**尚未做**：第 2 步打包配置（`bundle.targets` 从 `all` 收成 `nsis`，避免顺带拉 WiX）、第 3 步 CI、第 4 步实机实测与文案五处。

### 14.G Windows 移植 · 第 2 步落地记录（打包配置，2026-10-08）

- **新增 `src-tauri/tauri.windows.conf.json`**（平台专用配置文件，不动主文件）。这么做是因为 `bundle.targets` 两个平台要的值不同：
  - macOS 要 `all` → 出 `.app` + `.dmg`（14.E 就是这么来的）；
  - Windows 要 `nsis` → 只出单个 `.exe` 安装器。Windows 上 `all` 会把 MSI 一起出了，而 MSI 走 WiX、要另外下载工具链、还多一个失败点，所以收成 NSIS 一种。
  - Tauri v2 会读 `tauri.<平台>.conf.json` 并按 **RFC 7396（JSON Merge Patch）** 与主配置合并 —— 该规则下**数组是整体替换**（不是逐项合并），所以 `targets` 能被这样覆盖。已对过官方文档与本地 `@tauri-apps/cli` 的 `config.schema.json`，不是凭记忆写的。
- **NSIS 两项设置**：
  - `installMode: "currentUser"` —— 这本来就是默认值，**写出来是为了把「装到用户目录、不弹 UAC」变成仓库里的契约**（默认值以后可能变）。
  - `languages: ["English", "SimpChinese"]` —— **顺序有讲究**：NSIS 默认按系统语言选，系统语言不在表里时回落到**第一项**。把 `English` 放前面，中文系统照样得到中文（中文在表里，按系统语言命中），而日语之类没覆盖的系统会落到英文而不是中文。`SimpChinese` 是 NSIS 的语言名（Language ID 2052，已核对 NSIS 仓库的 `Contrib/Language files/SimpChinese.nlf`）。
- **刻意没动的**：`productName` / `identifier`（已定稿，见 14.E）；`webviewInstallMode` 保持默认的 `downloadBootstrapper` —— 它只在机器**缺** WebView2 时才去下载，而 Win11 自带、Win10 基本随 Edge 装上了，为省这一步去嵌 1.5MB 引导器不划算（真正能离线的是 `offlineInstaller`，127MB，不考虑）。图标 `.ico` 在第 5 步换项目图标时已生成，不用管。

**验证**：两份 JSON 都能解析；键名与取值逐条对过本地 `config.schema.json`（`nsis` 是合法 target、`currentUser` 是合法 installMode、`languages` 是字符串数组）；按 RFC 7396 手工模拟合并，确认 Windows 侧 `targets` 变成 `["nsis"]` 且 macOS 侧不受影响。**macOS 回归打包通过** —— 仍出 `.app` + `.dmg` 两份（约 41.1 / 34.2 MiB，体积随构建有零点几 MiB 的浮动，不必追），说明多出来的平台配置文件没干扰 mac 侧。

**本机验不到的**：`tauri.windows.conf.json` 只在 Windows 目标上被加载，macOS 上跑 `tauri build` 根本不读它 —— 所以「合并确实生效」本机证不了。要等第 3 步 CI 出产物时看是不是**只**出一个 NSIS `.exe`（有没有多出 MSI 就是判据）。

**尚未做**：第 3 步 CI、第 4 步实机实测与文案五处。

### 14.H Windows 移植 · 第 3 步落地记录（GitHub Actions CI，2026-10-08 实测通过）

- **新增 `.github/workflows/desktop.yml`**，是 Windows 产物的**唯一构建入口**（本机是 macOS，出不了也测不了 Windows 包）。
- **触发只留两个口子**：`workflow_dispatch`（Actions 页面手动点）与 `push` 打 `v*` tag。**刻意不跟 `main` 的 push 跑** —— 仓库私有，Actions 分钟数计费，而 **Windows runner 按 2× 扣减**，跟着每次 push 跑会把额度烧在纯前端 / 文档改动上。代价是「改了桌面相关代码得记得手动点一次」。
- **workflow 必须先在默认分支上存在**，`workflow_dispatch` 才认得它 —— 新增或改这个文件都要**推上去**才谈得上触发。
- **只用官方 action，不引第三方**（对齐第 0 节的依赖纪律）：`actions/checkout@v4` / `setup-node@v4` / `cache@v4` / `upload-artifact@v4`。**没用 `dtolnay/rust-toolchain`，也没用 `swatinem/rust-cache`** —— Rust 工具链走镜像预装的 `rustup`，缓存走 `actions/cache`。
- **Rust 显式对齐 stable**：`rustup toolchain install stable --profile minimal --no-self-update` + `rustup default stable`。镜像本来就带 stable，写出来是因为 `Cargo.toml` 用的是 `edition 2024`（需 ≥1.85），不能让镜像默认版本的变化悄悄把构建搞红；`--no-self-update` 是躲 rustup 无法覆盖自身时的报错。
- **缓存 Cargo registry + `src-tauri/target`**，key 跟 `Cargo.lock` 走、`restore-keys` 前缀增量复用。2× 计费下编译产物缓存是实打实的省钱。
- **构建前必须清 `src-tauri/target/release/bundle`**：缓存会把上次的 `target/` 一并还原，其中 `bundle/` 是**上次**的安装器；不清掉的话，`productName` 或 `version` 一变就会把新旧两个安装器一起传上去。这一步专为消掉那层不确定性。
- **上传步骤 `if-no-files-found: error`**：第一次在真 Windows 上出产物，路径若与预期不符宁可让构建红掉，也不要静默传一个空包。
- 其余：`runs-on: windows-latest`、`timeout-minutes: 60`（防异常时一直烧）、`concurrency` 取消重复触发、`permissions: contents: read`。
- **不改任何主配置**：`targets` / `installMode` / `languages` 仍全在 `tauri.windows.conf.json` 里（14.G），workflow 不碰它们。

**实测（run 37793609192，`workflow_dispatch`）**：**成功，14m20s**，八步全绿（检出 → Node → Rust → 缓存 → `npm ci` → 清理 → `npx tauri build` → 上传）。产物 `unnamed_0.1.0_x64-setup.exe`，**33.20 MiB**（artifact `windows-nsis-installer.zip` 34,805,448 字节，内含 1 个文件）。**只出了这一个 NSIS `.exe`、没有 MSI** —— 这正是 14.G 里「本机证不了」的那条判据，至此「平台配置合并确实生效」已验。runner 上的 Rust 是 `1.99.0 (b940084d7 2026-09-28)`，与本机 macOS **同版本**，无版本漂移。取产物：`gh run download 37793609192 -n windows-nsis-installer`。

**顺带排掉的疑虑**：`npm ci` 在 Windows 上跑得通（无平台相关依赖问题）；rustup 装得上；`prebuild` 链（`notice` + `md:runtime`）是纯 Node 文本处理，Windows 无碍；`render-notice.mjs` 会先把 `\r\n` 归一成 `\n` 再算哈希，换行差异不会把构建搞红。

**成本**：这趟按 Windows 2× 口径约 **29 分钟**额度。缓存已在收尾时写入，下次会便宜得多。

**已知 warning（不是缺陷）**：Actions 报 annotation —— `checkout@v4` / `setup-node@v4` / `cache@v4` / `upload-artifact@v4` 仍以 Node 20 为目标、被 GitHub 强制跑在 Node 24 上。是 GitHub 侧的迁移过渡（见其 2025-09-19 changelog），等官方发新版本即可。

**本机验不到的**：这一趟只证明「**能编出安装包**」。**工具链探测在真实 Windows 上的表现**（用户机器上装的是 MSYS2 还是 LLVM、`python` 会不会落到商店别名）与 **COOP/COEP 响应头在 WebView2 下是否真生效**，都得等第 4 步装一次才算验过。

**尚未做**：第 4 步实机实测与文案五处（guide 双语 / `help.js` / `docs/使用手册.md` / `index.html` noscript）。

### 14.I Android 移植落地记录（2026-10-09 真机实测通过：C++ 能编能跑）

**目标**：同一套前端 + Tauri，出 Android 包，**用随包 clang 在设备上原生编译并运行 C++**。Web 版与桌面版两条线照旧并行。

#### 承重点（先看这三条，动它们前先读本节）

1. **`targetSdk` 必须停在 28**（`app/build.gradle.kts`，`minSdk 24` / `compileSdk 37`）。Android 10 起（`targetSdk >= 29`）应用落到 `untrusted_app` 域，SELinux 对 `app_data_file` 收掉了 `execute`，**私有目录里的可执行文件会被 `EACCES` 挡掉**；降到 28 落 `untrusted_app_27` 域才允许。本项目要起随包 clang 与它编出来的产物，全部落在 `filesDir` 下，所以这一项是**承重的**（这也是 Termux 长期停在 28 的原因）。真机探针实测：targetSdk 37 时 `filesDir` / `cacheDir` 里 execve 一律 `EACCES`，28 时正常。
2. **编译器随 APK 打包、首启解到私有目录**。Android 上 `resource_dir()` 解析出来是 `asset://localhost/`，**不是文件系统路径**，所以 `bundle.resources` 这条路走不通；工具链只能进 APK 的 `assets/`，由 NDK 的 `AAssetManager` 读出、解到 `<filesDir>`。assets 只读、跑不了里面的二进制，所以必须解出来。
3. **WASM 沙箱在 Android WebView 上不可行**（宿主无 site isolation，`SharedArrayBuffer` 拿不到），所以 Android 端**只有原生编译这一条路**，没有退路。

#### 工具链组装（`scripts/prepare-android-toolchain.mjs`，npm 脚本 `android:toolchain`）

- 从**清华 Termux 镜像**取 pinned 版本的 11 个 `.deb`，解出 `clang` 的动态库闭包（**BFS 从 `clang-21` 出发**，含 `libLLVM.so` / `libclang-cpp.so` / `libc++_shared.so` 等；只算直接依赖会漏 `libffi.so` 之类，运行期才炸），按 **Termux 布局**重组后打成 `tar.gz`，落 `src-tauri/gen/android/app/src/main/assets/`。
- 产物：**2659 条目（2515 文件）**，解压 **212 MB**，包 **68.6 MiB**；sha256 `f8d8b4f5f85eec77a3873746fe03f5abdabe65e5f8bbecc1d9b12398f73c7338`（可复现 —— tar 头里 mtime/uid/gid 固定为 0）。**历史值**：首版 3537 条目 / 219 MB / 69.5 MiB / `21c63237…`；再往前未瘦身时 3737 条目 / 264 MB / 77.5 MiB。
- **瘦身（2026-10-09）**：`assemble()` 第 6.5 步 `pruneUnusedAssets()` 就地删掉两类判题永不需要的资产，共 **200 个文件 / 45 MiB（解压后）**，设备 Data **264 → 219 MB**、tgz **77.5 → 69.5 MiB**：
  - `lib/clang/21/lib/linux/` 下除 `libclang_rt.builtins-*` 外的 compiler-rt 运行库 —— sanitizer（asan/tsan/ubsan/lsan/hwasan）、fuzzer、profile、stats、orc-jit，33 个。它们只有 `-fsanitize=` / `-fprofile-` 才会被链上，判题不带这些开关；`builtins` 是每次普通链接都要的，**必须留**。
  - `lib/clang/21/include/` 下按架构分的 intrinsic 头，166 个：x86/ppc/s390/mips/hexagon/loongarch 全系（`*intrin.h`、`altivec.h`、`vecintrin.h`、`hexagon*` 等），外加 **ARM 自己的 NEON/SVE/MVE/SME 与 `opencl-c.h`**（手写 SIMD / OpenCL 在判题范围外，而单一个 `arm_neon.h` 就 3 MiB）。libc++ 的 `c++/v1`、bionic 的 C 头、`stddef.h` / `stdint.h` / `float.h` 这些基础头全部保留。
  - 验证：解压后 218.6 MiB，`bin/clang-21`、`bin/lld`、`libLLVM.so`、`libclang-cpp.so`、`libc++_shared.so`、`libclang_rt.builtins-aarch64-android.a`、`include/c++/v1/{vector,iostream}`、`include/stddef.h` 均在。**尚未在真机上跑过一次编译**（见「待办」）。
- **再瘦身（2026-10-09 第二轮）**：`assemble()` 第 3.5 步 `pruneSysrootIncludes()` 再删 **7 处系统头**（`c++/v1/__cxx03`、`camera`、`drm`、4 个非本架构头目录），设备 Data **219 → 212 MB**、tgz **69.45 → 68.56 MiB**。详见 **14.M**。
- 两个坑：**大小写冲突**（`xt_MARK.h` / `xt_mark.h` 等 8 对，macOS 这种大小写不敏感的文件系统上必须在内存里处理，不能落盘）；**可执行位**（`bin/clang-21`、`bin/lld` 必须 0755，其余 0644 —— tar 头的 mode 是特意带进去的，解压端要开 `preserve_permissions` 才还原，否则落成 0644 直接 `can't execute`）。
- 依赖系统 `tar` 支持 `ar` + `xz`（macOS bsdtar 可行；Linux 需 `libarchive-tools`）。下载缓存到 `node_modules/.cache/android-toolchain`（每次构建约 71 MB，缓存后不再重下）。**pinned 版本会随 Termux 滚动仓库过期**，需定期重 pin。

#### Rust 侧（A2–A4）

- **新增 `src-tauri/src/android_toolchain.rs`**：读 assets → 解压 → 写版本标记。
  - 落点：**`<filesDir>/compiler/usr/{bin,include,lib,lib/clang}`**，外加 `<filesDir>/compiler/.version`（存随包版本文件原文 = tgz 的 sha256）。下次启动据此判断要不要重解 —— 212 MB 不该每次启动都解一遍。
  - 解压用 `flate2` + `tar`（`set_preserve_permissions(true)`），必须先 `remove_dir_all` 清旧树（换版本时旧版本有、新版本没有的文件不该留下），**标记最后写**（中途被打断就下次重解，不会拿半棵树去用）。
  - `prepare_toolchain` 标 `#[tauri::command(async)]`：函数体同步但丢线程池，解压几秒不会 ANR。
- **`toolchain.rs` 加 Android 分支**：`cxx()` 先看随包那份（`bundled_cxx`），再退回 PATH 探测；`cxx_extra_args()` 给编译参数；`with_run_env()` 给子进程环境变量（**A7 期间由 `with_toolchain_dir` 改名而来**，因为它早已不只是「目录」：Windows 补 `PATH`、Android 补 `LD_LIBRARY_PATH` + `TMPDIR`）。
- **`native.rs`**：工作区从 `std::env::temp_dir()` 改到 **`<filesDir>/run`**（`std::env::temp_dir()` 在 Android 上是 `/tmp`，既不存在也建不出来；更要紧的是产物得能被执行）。
- **转指三件套（Android 专有，桌面端全为空实现）**：
  1. **`--sysroot=<filesDir>/compiler`** —— 见下面「真机证伪」。
  2. **`LD_LIBRARY_PATH=<filesDir>/compiler/usr/lib`** —— 承重：随包 clang 是从 Termux 搬来的，二进制里的 `RUNPATH` 指向不存在的 Termux 路径，不给它直接 `CANNOT LINK EXECUTABLE ... library "libclang-cpp.so" not found`；编译段与运行段都要给（运行段是让产物找得到 `libc++_shared.so`）。
  3. **`TMPDIR=<filesDir>/tmp`** —— 见下面「真机发现」。

#### 真机证伪 A3 的推导：`--sysroot` 是 `<filesDir>/compiler`，**不是** `.../compiler/usr`

- **症状**：按 A3 推的参数编译报 `fatal error: 'asm/types.h' file not found`。
- **诊断**：`clang++ -v -E -x c++ -` 打印搜索列表对比两组 —— 取 `<root>/usr` 时列表里**没有** `usr/include/aarch64-linux-android`；取 `<root>` 才有，而 `asm/types.h` 正在那个目录下。
- **机制**：Termux 的 clang 按 `<sysroot>/usr/include/...`、`<sysroot>/usr/lib` 推搜索路径，原生 Termux 里 sysroot = `$PREFIX` 的**上一层**。取对之后 clang 自动补齐：`usr/include/c++/v1`、`usr/lib/clang/21/include`、`usr/include/aarch64-linux-android`、`usr/include`，并**自动**加 `-rpath=<sysroot>/usr/lib` —— 所以原来那两条 `-isystem` / `-L` / `-Wl,-rpath` **全不需要**，只留一条 `--sysroot`。
- **旁证**：4b 原型产物 `hello.bin` 的 `RUNPATH` 正是 `<filesDir>/compiler/usr/lib`，反过来说明**当时那份 sysroot 就是 `<root>`**（A3 推导时把它当成了 `<root>/usr`）。
- **实测（修复后）**：`clang++ -std=c++17 -O2 --sysroot=<filesDir>/compiler` 编译通过，运行输出 `ok sum=10 n=4`、exit 0；再把产物**去掉 `LD_LIBRARY_PATH`** 单独跑一次仍成功，证明 `RUNPATH` 确由 `<sysroot>/usr/lib` 自动写对。

#### 真机发现 A4 漏了 `TMPDIR`

- **症状**：`clang++: error: unable to make temporary file: No such file or directory`。
- **诊断**：app 进程 environ 里**没有 `TMPDIR`**（只有 `PATH` / `BOOTCLASSPATH` / `DEX2OATBOOTCLASSPATH` / `SYSTEMSERVERCLASSPATH`）；设备的 `/tmp` 是 `drwxrwx--x shell shell`，应用写不进去。
- **修法**：落点 **`<filesDir>/tmp`**（与工具链是**兄弟**目录，重解工具链时的 `remove_dir_all` 不会顺手清掉它）；在 `android_toolchain::prepare()` 里、**`is_current` 提前返回之前** `create_dir_all` —— 复用那一路也必须保证它在（装完第一次之后就总走复用，建在返回之后等于没建）；`with_run_env()` 的 Android 分支设 `command.env("TMPDIR", ...)`。
- **真机验证**：`rm -rf files/tmp` → 杀掉应用 → 重新启动 → `tmp` 重新出现（02:15），而 `compiler` 的 mtime 仍是 02:07（= 走了 `reused` 分支）。即**复用路径下也把 tmp 建起来了**。

#### 真机上已量到的其余事实

- 首启解压 **~10s**，`.version` 内容与 A1 记录的 sha256 **逐字一致**；二次启动 mtime 未变（`reused`）。
- 权限位正确：`bin/clang-21`、`bin/lld` 均 0755，`bin/clang++` 是软链（指向 `clang-21`）。
- 构建：`npx tauri android build --debug --target aarch64`（需显式给 `ANDROID_HOME` / `NDK_HOME` / `ANDROID_SDK_ROOT`，本机这几个环境变量为空；NDK 用 `29.0.14206865`）。通用 debug APK **418,224,623 B**（≈418 MB）—— A6 回滚 `jniLibs.useLegacyPackaging = true` 之后 libs 在 APK 内不再解包（APK 变大、**装机占用变小**），这是有意为之。

#### 前端（A5）：首次准备的等待遮罩

- **新增 `src/services/nativeToolchain.js`**：`toolchainState`（`idle|preparing|ready|failed`）、`toolchainError`（原文，不翻译）、`prepareNativeToolchain()`（非 Android 立即 resolve `null`；同一发 pending Promise 全进程复用，失败清空以便重试）。
- **新增 `src/components/ToolchainGate.vue`**：`REVEAL_DELAY_MS = 300` 延迟显形（`preparing` 才排定时器，`ready` 收遮罩，`failed` 立即显形）；失败态给「重试」与「先进入」。**只在 Android 显形**（`IS_ANDROID`）。
- **`src/services/platform.js`** 加 `IS_ANDROID`（只能从 UA 认；「是不是桌面壳」仍旧看 `IS_DESKTOP`）。
- **`src/App.vue`** 的 `onMounted` 最前面 `void prepareNativeToolchain()`（不 await）；模板挂 `<ToolchainGate />`。
- **`src/i18n/messages/app.js`** 加 `app.toolchain.{title,note,failedTitle,skip}` 中英两栏。

#### 验证清单

- **本机**：`cargo check`（桌面）**0 警告**；`cargo check --target aarch64-linux-android` **0 警告**；`cargo test --lib` **16 passed / 0 failed**；`npm run build` ✓。
- **真机**（`OPD2515`，serial `fe906c3d`）：`adb install -r` 成功；启动后 `<filesDir>/tmp` 在 `reused` 路径下被重建（见上）；用 `run-as` 复刻**与 Rust 完全相同的参数与环境变量**（`--sysroot=<root>` + `LD_LIBRARY_PATH=<root>/usr/lib` + `TMPDIR=<filesDir>/tmp`）编译并运行，`ok sum=10 n=4`、exit 0。

#### 本机 / 本次未验到的（如实记）

- **UI → `invoke('run_cpp')` 的整条链路没有程序化驱动**：想把 WebView 的 devtools 拉出来（`adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>`）在 `curl /json` 上没响应，未走通。**参数与环境变量那一层是 `run-as` 逐字复刻验证的**，Rust 侧 `prepare_toolchain` 则是**真跑过**（上条 tmp 重建就是它干的）。**建议人工在 app 里跑一次带用例的 C++ 编译**，把最后这一格补上。
- **Python 侧在 Android 上无解**：系统里没有解释器，随包也没带（Termux 的 python 依赖太多）。按设计如实报「找不到解释器」（`unreachable`），不是缺陷。
- **只验了 `arm64-v8a`**；`armeabi-v7a` / `x86_64` 未验。
- **release 包与签名**：已于 **14.J** 落地（v2 验签通过，APK 118.6 MiB）；但**功能未在真机验证** —— 只验到「能启动、界面正常、无崩溃」，没在 release 包里真跑过一次编译。

#### 尚未做 / 待办

- **`src-tauri/gen/` 已纳入版本库**（A7 收尾 `git add`，40 项；`gen/android/.gitignore` 另补了 `.kotlin`）。`targetSdk = 28` 这条承重配置与 Android 工程模板都在里面。`assets/android-toolchain.tgz` / `.version` 已由 `gen/android/app/.gitignore` 挡住（脚本生成，不入库，构建前须 `npm run android:toolchain`）。
- **CI 若要出 Android 包**：构建前必须先跑 `npm run android:toolchain`（assets 不在仓库里），且需要 Android SDK / NDK。
- **`.tgz` 是否加 `noCompress`**：未加时首启解压 ~10s，可接受，**倾向不加**，待最终拍板。
- **文案五处已补（2026-10-09）**：guide 双语 / `help.js` / `docs/使用手册.md` / `index.html` noscript 各加了一条**「开发中」口径** —— 说明另有 macOS / Windows / Android 原生版在开发、编译与运行都在本机完成，**不承诺下载渠道**（五处措辞一致）。**自此 14.C「文案五处仍未补」与 14.D「口径仍是『等桌面版真能发布再动』」作废。**
- 探针脚手架（`probe.rs` / `services/probe.js` / `libprobe_sh.so`）已在 A6 拆除，`invoke_handler` 只剩 `native::run_cpp` / `native::run_python` / `android_toolchain::prepare_toolchain`。

### 14.J Android 包瘦身与 release 签名（2026-10-09）

**目标**：把真机装机占用压下来，并让 release 包能签名出包。三项里两项落地，第三项经实测收益过低而放弃（见「被否掉的那一项」）。

#### 占用账本（先看这条脚注，两个来源对不上）

| 来源 | App | Data | Cache |
|---|---|---|---|
| `dumpsys diskstats`（debug 包；`Latency: 0ms`，**疑为缓存**） | 242.4 MiB | 220.8 MiB | 22.5 MiB |
| `run-as … du -sm files`（debug 包；**更新、更可信**） | — | **273 MB** | — |

两者对不上：`files` 单目录就有 273 MB，已大于 diskstats 报的「App Data Size 220.8 MiB」——说明 **diskstats 那组是旧缓存**（它自己的 `Latency: 0ms` 也指向缓存）。**算占用时 Data 取 `du` 的 273 MB。** 于是 debug 包真实占用 ≈ **242.4 + 273 + 22.5 ≈ 538 MiB**。

Data 的绝对大头就是工具链树：`files/compiler` **273 MB**（同一份 tgz 解出来的），`files/tmp` 1 MB。

#### 事项一：APK 里的 157.7 MiB 孤儿（已消除）

- **现象**：debug arm64 APK **418,224,623 B（398.9 MiB）**，但 `lib/arm64-v8a/libapp_lib.so` 本该只有一份 157.7 MiB。按各条目的局部头部重算，发现 offset **5,506,078 → 170,842,488** 是一段 **157.7 MiB 的死字节，且不在 zip 中央目录**里（安装器不读它，但整份 APK 会原样落到 `/data/app`，照样吃空间）。
- **成因**：14.I 的 A6 回滚 `jniLibs.useLegacyPackaging = true` 之后，**增量打包**把上一版已解包的 `libapp_lib.so` 留在了原位，中央目录改指新条目，旧字节就成了孤儿。**不是配置问题，是脏构建目录。**
- **修法/验证**：`src-tauri/gen/android/gradlew clean` 后重打即消失，debug arm64 APK 降到 **252,891,107 B（241.2 MiB）**，局部头部之间只剩 15 KB 对齐填充。

#### 事项二：debug → release + 签名（已落地）

- **`.so` 收益**：cargo release 的 `libapp_lib.so` = **40.5 MiB**（debug 是 157.7 MiB）。
- **产物**：`app/build/outputs/apk/universal/release/app-universal-release.apk` = **124,408,387 B（118.6 MiB）**。构成：`libapp_lib.so` 40.6 MiB + `assets/android-toolchain.tgz` 76.5 MiB + dex/资源 ~1.5 MiB；678 条目、仅 1 处 9 KB 间隙（无孤儿）。
- **签名**：`apksigner verify --verbose` → **v2 方案 verified**（v1/v3 未启用；`minSdk 24` 下 v2 已充分）。证书 `CN=unnamed, OU=Android, O=unnamed, L=Beijing, ST=Beijing, C=CN`，RSA 2048，SHA-256 `708776608f965ba224649919455116ac4cc1639d5a506c9578b64e1304965eb6`。
- **装机预期**：App 242.4 → **118.6** MiB；Data 不变（工具链与 VFS 都在 data 里，与 APK 无关）。即 **~538 → ~393 MiB**，省 **~145 MiB**（其中 ~124 MiB 来自 APK）。

#### ⚠️ 出包命令必须钉死 `--target aarch64`

不带 `--target` 会**把四个 ABI 全塞进去**：arm64 157.7 + armv7 143.2 + x86 149.4 + x86_64 158.1，加 tgz 后 **725,510,279 B（691.9 MiB）**。**任何 Android 出包都写全 `--apk --target aarch64`。**

```
ANDROID_HOME=$HOME/Library/Android/sdk \
ANDROID_SDK_ROOT=$HOME/Library/Android/sdk \
NDK_HOME=$HOME/Library/Android/sdk/ndk/29.0.14206865 \
ANDROID_NDK_HOME=$HOME/Library/Android/sdk/ndk/29.0.14206865 \
npx tauri android build --apk --target aarch64
```

（本机这几个环境变量为空，必须显式给；工程内没有 npm 封装脚本，走 `@tauri-apps/cli`。）

#### 构建配置的三处改动（都在 `src-tauri/gen/android/`）

1. **根 `build.gradle.kts` 前置阿里云镜像**。国内直连 `dl.google.com` 拉 release 的 lint 工具（`intellij-core` / `kotlin-compiler` 两个 jar）会 `Read timed out`，release 构建直接失败（**debug 不跑 lintVital，所以一直没暴露**）。`buildscript` 与 `allprojects` 各加 `maven.aliyun.com/repository/{google,public}` 且**必须放在 `google()` 之前**（Gradle 按顺序试，镜像排在后等于白加），原仓库保留作后备。
2. **`app/build.gradle.kts` 加 `lint { disable += "ExpiredTargetSdkVersion" }`，只关这一条**。lint 能跑起来后就报 `Error: Google Play requires that apps target API level 33 or higher. [ExpiredTargetSdkVersion]`，fatal 级、掐死 release。而 `targetSdk = 28` 是 14.I 的**承重点**（≥29 落 `untrusted_app` 域、私有目录执行被 EACCES），**不能为了过 lint 去改它**，只能关规则。**若要上 Google Play，这条矛盾得先解决。**
3. **`app/build.gradle.kts` 加 `signingConfigs.release`**，从 `key.properties` 读 `storeFile` / `storePassword` / `keyAlias` / `keyPassword`；**`key.properties` 缺席时不建 signingConfig**，仍能出未签名包（CI 上不塞密钥也不至于整条构建挂掉）。`gen/android/.gitignore` 新增 `/keystore/`（`key.properties` 原本就在忽略列表里）。两者均已 `git check-ignore -v` 复核、`git status --ignored` 显示 `!!`。

**密钥**（**离线备份，上架后不可更换**）：`keystore/release.jks`，alias `unnamed-release`，RSA 2048，有效期 10000 天，SHA384withRSA。

#### 真机冒烟（release，2026-10-09）

- `adb install -r` 成功。release 的 applicationId **不带 `.debug`**，与 debug 包**共存**而非覆盖 —— 所以量测期间设备上同时有两份安装，这点在解读数字时要注意。
- 启动后 WebView 正常：文件树、Monaco 编辑器、状态栏（`main.cpp · 空格:4 行19,列5 · C++ · Ctrl+Enter`）都在（已截图留证）。`monkey -c android.intent.category.LAUNCHER` 拉起后 60s 进程仍在（pid 12852）。
- 设备上 `base.apk` 实测 **124,408,387 B**，与宿主产物逐字节一致。
- **crash buffer 无该包记录**；tombstones 最新为 2026-07-20（今日无新增）。03:10 再查进程已不在，**无崩溃/低内存日志**，按正常回收论。
- 顺带看到一条**旧记录**：`02:07:33 F linker: CANNOT LINK EXECUTABLE "…unnamed.debug/files/compiler/usr/bin/clang++": library "libclang-cpp.so" not found`。同一时刻 `files/compiler` 的 mtime 也是 02:07，而 `libclang-cpp.so` 现已在位（62,972,824 B）。**成因未查**（可能是首解压窗口内被并发调用），本次未复现，**留作疑点**。

#### 本机做不到的两件事（如实记）

1. **release 的 Data 体积量不到**。release 不是 debuggable → `run-as` 不可用；`/data/data/<pkg>` 对 shell 是 `Permission denied`；`dumpsys diskstats` 的包列表（430 项）**在安装后两分钟内仍未收录**新装的 release 包。**本次没找到非 root 的读法。** 上面所有 Data 数字都取自 debug 包（两包解压同一份 tgz、落点与布局相同，可作代理）。
2. **UI → `invoke('run_cpp')` 整条链路仍未程序化驱动**（14.I 也挂着同一格）。本次只验到「能启动、界面正常、无崩溃」，**没在 release 包里实际跑过一次编译**。release 开了 `optimization { enable = true }` 且带 proguardFiles，建议人工在 app 里跑一次带用例的 C++ 编译把这一格补上。

#### 「精简工具链」：曾否掉，2026-10-09 重做并落地

第一轮估算「删 sanitizer/fuzzer 与非 aarch64 头可省 55–60 MiB」**是把解压后体积当成了 tgz 体积**，逐项实测后（独立 tar + gzip -9）得：

| 待删 | 文件数 | 解压后 | tgz 内实际减少 |
|---|---|---|---|
| sanitizer/fuzzer/orc 运行时 | 33 | 31.7 MB | **7.0 MB** |
| 非 aarch64 的 android 头（4 个目录） | 210 | 0.4 MB | **0.1 MB** |
| `include/c++/v1/__cxx03`（c++03 兼容层） | 582 | 4.7 MB | **0.6 MB** |

于是按「tgz 只值 ~7.7 MiB，不值一次版本 bump」判了**放弃**。2026-10-09 重做，两处前提变了：

1. 上一轮的「非 aarch64 头」只数了 4 个目录的 210 个文件（0.4 MB），**漏掉 `lib/clang/21/include/` 里那批按架构分的 intrinsic 头** —— 光 `arm_neon.h` / `arm_sve.h` / `arm_mve.h` / `opencl-c.h` 加 x86 全系就 13 MiB（解压后）。
2. 「版本 bump 会让已装机重解 264 MB」在本项目**不成立** —— app 尚未发布，没有存量装机。

落地后（`pruneUnusedAssets()`）：**解压后 264 → 219 MB（−45 MiB）、tgz 77.5 → 69.5 MiB（−8 MiB）**。真正的收益大头在**设备 Data**、不在 APK —— 只盯 tgz 会把账看小 5 倍。未采用 `__cxx03` 那一项（C++03 兼容层，判题可能用到）→ ✅ **2026-10-09 已推翻并采用，见 14.M**：`__cxx03` 只在定义了 `_LIBCPP_USE_FROZEN_CXX03_HEADERS` 时才会被 include，而我们从不定义 —— 实测 `-std=c++03` / `c++17` / `c++20` 三档都能编过。

天花板依旧在 `libLLVM.so`（127.4 MB 原始 / 40.4 MB 压缩，占 tgz 的 52%），且它**已 stripped**（无 `.symtab` / `.debug*`），删无可删。

> 若要继续瘦 APK，只剩**换压缩格式**：`tar.xz` / `tar.zst` 在这类内容上通常比 gzip 小 25–35%，即再省 20+ MiB；代价是 `android_toolchain.rs` 要新增一个 Rust 解压依赖（xz2/liblzma 或 zstd）。**尚未实测、尚未决策。** 另一条更大的路是**不随包、首启联网下载**（APK 直接 −76.5 MiB），代价是离线不可用 —— 同样未决策。

#### 待办

- **release 包的功能验证**：真机上跑一次带用例的 C++ 编译。**瘦身后的工具链尤其要补这一格** —— 被删的 sanitizer/fuzzer 运行库与非本架构内建头理论上不被普通编译链路引用，但**没有实机编译验证过**（2026-10-09 只验到 `prepare_toolchain` 成功、界面正常、无崩溃）。
- **决定是否换 tgz 压缩格式**（见上）。
- **仓库状态：本轮改动未提交。** 除 `gen/android/{build.gradle.kts, app/build.gradle.kts, .gitignore}`（`AM`）外，本轮还新增/改了：`scripts/prepare-android-toolchain.mjs`（瘦身）、`src/services/storageQuota.js`（删配额与明细，只留持久化）、`src/components/EditorSettingsPanel.vue` / `src/i18n/messages/settings.js` / `src/styles/base.css`（删设置里的存储行）、`src/services/nativeToolchain.js` 与 `src-tauri/src/android_toolchain.rs`（注释数字）。`key.properties` 与 `keystore/` 已被忽略，**不要**加进版本库。
- **设备上只剩下 release 一个包**（`pm list packages -u -f` 证实；曾装过的 `.debug` 已卸载）。`dumpsys diskstats` 在这台 ROM（OPPO OPD2515）上是**开机快照、不刷新**，里面的 `….unnamed.debug` 是陈旧条目、不是真实占用 —— 要拿 release 的准确 App/Data 尺寸，得先重启手机再读。
- **这台 ROM 上读 app 私有数据无路可走**：`adb shell pm clear` 抛 SecurityException（shell 无 `CLEAR_APP_USER_DATA`）；非调试包不能 `run-as`，`du /data/data/<pkg>` 直接 Permission denied。设备侧要量 Data，只能用 debug 包 + `run-as`，或重启后读 diskstats。

### 14.K Tauri 壳的云端同步（2026-10-09 落地，补上 14.D / 14.E 挂着的那一格）

**症状**（Android 真机上点「登录 / 取码」）：报「接口返回了 HTTP 200，但内容不是预期的格式（这次请求可能没走到本站的 /api）」—— 即 `cloudProfile.js` 的 `transport: 'badBody'`。

**根因（两层，缺一层都不通）**：

1. **相对路径被壳的资源协议接住**。壳里的页面不在站点域下，而是来自 Tauri 自带的资源协议：**Windows / Android 是 `http://tauri.localhost`**，**macOS / Linux / iOS 是 `tauri://localhost`**（Tauri v2 的 `app.security.useHttpsScheme` 默认 `false`，见 `node_modules/@tauri-apps/cli/config.schema.json` 里那条字段说明，2026-10-09 核对）。所以 `fetch('/api/get-code')` 打的是壳自己而不是本站 —— 它不认识 `/api`，回一份 `index.html` 加状态 200，于是 `response.json()` 失败。
2. **跨源没被放行**。改成站点绝对地址后请求就变成跨源，而 Worker 的 `ALLOWED_ORIGINS` 只列了站点域名与 `localhost:5199`。2026-10-09 用 curl 实测确认：带 `Origin: http://tauri.localhost` 的预检回 204、`vary: Origin`，**没有任何 `Access-Control-Allow-Origin`** —— 改完第一层而不改第二层，只会从 `badBody` 变成 `unreachable`。

**落地内容**：

- 前端 `src/services/cloudProfile.js`：`API_BASE` 按 `IS_WEB` 分岔 —— 网页版仍 `/api`（dev 走 vite 代理、PWA 完全不受影响），壳里 `https://www.998244353.best/api`。**写死的仍是站点自己的域名**，不是 Worker 的 workers.dev 子域（那个国内不通），所以 `docs/云端同步服务.md` 里「别写死 Worker 域名」那条规矩没有被破坏，只是文档里补了这条例外。
- Worker（附录 A，**权威版本在 Cloudflare Dashboard 上**）：`ALLOWED_ORIGINS` 补三条壳来源 —— `http://tauri.localhost`、`https://tauri.localhost`、`tauri://localhost`。三条都列是刻意的（自定义协议的来源序列化在不同 WebView 上不一致，多列一条没有副作用）。
- `docs/云端同步服务.md`：第 1 节由「两条约定」改成「三条约定」并写明两层根因；第 3 节 OPTIONS 那行注明现在服务两个跨源来源；附录 A 同步更新；变更记录加一行。

**为什么不是「改用 Rust 发请求」**：`src-tauri/Cargo.toml` 里没有任何 HTTP 客户端（只有一个 `tauri-plugin-log`），那条路要引新依赖，而绝对地址本身就在 14.D 定好的方向上。顺带确认 `COEP: require-corp`（`tauri.conf.json` 的 `app.security.headers`）不挡这条路：跨源请求走的是 CORS 模式，CORS 过了即满足 COEP，不需要额外加 `Cross-Origin-Resource-Policy`。

**验证方式**（部署 Worker 后可复跑）：

```bash
# 预检：应回 204，且**有** Access-Control-Allow-Origin: http://tauri.localhost
curl -s -i -X OPTIONS https://www.998244353.best/api/get-code \
  -H 'Origin: http://tauri.localhost' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type'

# 读接口：public 且是简单请求，没有预检，同样应带 ACAO
curl -s -i -H 'Origin: http://tauri.localhost' \
  https://www.998244353.best/api/config/he-jie | head -12
```

**Worker 侧已落地并验证（2026-10-09）**：附录 A 的五条 `ALLOWED_ORIGINS` 已粘进 Dashboard 并 Deploy。实测四条来源的预检全部放行（`HTTP/2 204` + `access-control-allow-origin`）：

```
== http://tauri.localhost   → 204 + ACAO ✅
== https://tauri.localhost  → 204 + ACAO ✅
== tauri://localhost        → 204 + ACAO ✅
== https://www.998244353.best → 204 + ACAO ✅（原有那条没被挤掉）
```

再按壳真实的请求形状打两发，确认拿到的是 JSON 而不是 `index.html`（即不再 `badBody`）：

```
POST /api/get-code   -H 'Origin: http://tauri.localhost'  → 200 + content-type: application/json + ACAO
GET  /api/config/<未存过的 handle>                          → 404 + content-type: application/json + ACAO
```

**尚未做**：Android 真机上再跑一次「取码 / 登录 / 上传」把整条链路补验（需要用户把自己的 CF 验证码填进个人资料，agent 代不了）。**没有新增界面文案，所以 guide 双语 / `help.js` / `docs/使用手册.md` / `index.html` noscript 这五处不用动。**

### 14.L 壳端出包剔掉 `dist/wasm`（2026-10-09）

**问题**：`public/wasm/`（74 MB = C++ 51 MB + Python 24 MB）被 vite 原样拷进 `dist`，而壳端（桌面 + Android）跑的是原生编译器，从头到尾没有一个代码路径会取它 —— 这 74 MB 被 `tauri::generate_context!` 嵌进了 `libapp_lib.so` / 桌面可执行文件，白占包体。这一格同时对应 14.C 第 3 项与 14.C 末尾「尚未做」里的「`public/wasm/` 出包瘦身」。

**为什么「壳端没有代码路径会用它」这话是硬的**（四条闸门，互不相干）：`wasmEngine` 的 `platforms: ['web']`（`engines/index.js`）；设置页「本地运行环境」整组 `v-if="!isDesktop"`（`EditorSettingsPanel.vue`）；预下载在桌面端早退（`runtimePreload.js` 的 `scheduleAutoPreload`）；SW 注册要求 `IS_WEB`（`main.js`）。所以设置页那个「下载」按钮也不会在壳里冒出来报 404。

**为什么必须删在编译前**：前端产物不是放在 APK 的 assets 里，而是被 `tauri::generate_context!` **编进产物本体**的 —— 只有先删 dist 里那一份，字节才真的省下来。

**落地内容**：

- 新脚本 `scripts/strip-wasm-assets.mjs`：删 `dist/wasm/` 并报出省了多少；目录不存在时**报错退出**，当「vite 输出位置变了」的哨兵。
- `package.json` 新增 `build:tauri` = `npm run build && node scripts/strip-wasm-assets.mjs`。**`build` 一个字没改**，网页版 / Vercel 部署链路照旧。
- `tauri.conf.json` 的 `beforeBuildCommand` 由 `npm run build` 改成 `npm run build:tauri` —— 因为**所有** Tauri 目标（桌面 + Android）都不需要 wasm，挂在基础配置上比逐平台覆盖干净；`tauri.android.conf.json` 因此没有 `build` 覆盖（仍只有 identifier 一项）。
- 不动 `dist/md/`（约 1 MB）：桌面端没有 Cache Storage，Markdown 预览靠随包这份直接可用。

**预期收益**：约 **25~30 MiB**（wasm 在产物里是压缩存的，所以不等于 74）—— Android release APK 应从 118.6 MiB 降下来，Windows NSIS 安装器同理。

**已验证（本机）**：`npm run build:tauri` → `strip-wasm-assets: 去掉 dist/wasm（73.5 MiB）`，`dist/wasm` 已移除、`dist/md` 完整、`precache-manifest.json` 不受影响（该插件只收 rollup 输出，不收 `public/`）。

**待验**：Android 真机包的体积与装机后 C++ 判题照常 AC（走 `npx tauri android build --apk --target aarch64`，它现在会先跑 `build:tauri`）；Windows 安装包体积（走 CI 的 `desktop.yml`）。

**没有新增界面文案**，所以 guide 双语 / `help.js` / `docs/使用手册.md` / `index.html` noscript 这五处不用动。

### 14.M Android 工具链再裁 7 处系统头（2026-10-09）

**背景**：14.J 那轮把 `__cxx03`（4.7 MB 原始 / 0.6 MB 压缩）与 4 个非本架构头目录判了「放弃」，理由是「tgz 只值 ~7.7 MiB，不值一次版本 bump」。该判断里 `__cxx03` 的前提**是错的**，本次推翻并落地，同时补上当时没数到的 `camera/` `drm/`。

**为什么 `__cxx03` 是死代码**（这次拿证据说话）：libc++ 引用它的那 134 个头，include 全部落在
`#if __cplusplus < 201103L && defined(_LIBCPP_USE_FROZEN_CXX03_HEADERS)` 之下 —— 两个条件**同时**成立才展开，而 `_LIBCPP_USE_FROZEN_CXX03_HEADERS` 是 libc++ 的构建期开关，我们从不定义。实测三档都编得过：

| `-std=` | 裁剪后结果 |
|---|---|
| `c++03` | 通过 |
| `c++17`（判题固定这档） | 通过 |
| `c++20` | 通过 |

**落地内容**：`scripts/prepare-android-toolchain.mjs` 新增 `PRUNE_SYSROOT_INCLUDE` + `pruneSysrootIncludes()`，在 `assemble()` 第 3 步（`cpSync` 系统头之后、登记进 tar 清单之前）调用 —— 删在登记之前，所以它们连 tar 条目都不会有。删 7 处：

`include/c++/v1/__cxx03`、`include/camera`、`include/drm`、`include/{x86_64-linux-android, i686-linux-android, arm-linux-androideabi, riscv64-linux-android}`

**必须留**的两处：`include/aarch64-linux-android/`（本架构的 `asm/` 那类头）、`include/android/`（bionic 的正经 API 头，`api-level.h` 那批，C 头会 include 过去）。

**收益（实测，比估计小）**：

| | 改前 | 改后 | 差 |
|---|---|---|---|
| 解压后（脚本口径） | 219 MB | **212 MB** | **−6.2 MB** |
| tgz | 72,825,236 B（69.45 MiB） | 71,892,740 B（**68.56 MiB**） | **−0.88 MiB** |
| 条目 | 3537（3348 文件） | **2659（2515 文件）** | |
| sha256 | `21c63237…` | `f8d8b4f5…` | 变了 → 已装机下次启动重解 |

**别把账看错**：真正省下来的是**设备 Data 6.2 MB**；APK 只瘦 **0.88 MiB**。原因是这 7 处全是**文本头文件**，gzip 能压到 ~1/7 —— 6.2 MB 的头只让 tgz 掉 0.88 MiB。（这与 14.J 表格里 `__cxx03` 那一行估的 0.6 MB 压缩量吻合，当初的估算没错，错的是「判题可能用到」这个理由。）

**已验证（本机）**：

1. tgz 内 7 处路径条目数全为 0；`c++/v1` 1140 条、`aarch64-linux-android` 40 条、`android` 68 条、`linux` 852 条俱在。
2. **头文件 smoke**：把新树解到 `usr/`，用 NDK r29 的 clang 21 以 `--target=aarch64-linux-android28 --sysroot=<树根> -std=c++17` 编译一份覆盖 30 个常用 C++ 头的源文件 → 通过，产物是合法 aarch64 ELF。（**只编译不链接**：链接期要找的是 Termux 专属的 `<sysroot>/lib/aarch64-linux-android/` 布局，宿主 clang 复现不了，与本次改动无关。）
3. 连跑两次 `npm run android:toolchain`，sha256 一致 —— 可复现性未被破坏。

**待验**：真机出包装机 + 判一道 C++ 题照常 AC（`npx tauri android build --apk --target aarch64`）。

**天花板与下一步**：`libLLVM.so`（127.4 MiB）+ `libclang-cpp.so`（60.1 MiB）仍是整棵树的 83%，且**都已 stripped**（无 `.symtab` / `.debug_*`，再跑一次 `llvm-strip` 每个文件只掉 408 字节）—— 体积全在 `.text` / `.rodata` 里，是**别的 CPU 后端的机器码**。实测 Termux 的 `libLLVM.so` 烘焙了全部后端（符号计数：X86 463 / AArch64 313 / RISCV 268 / PPC 145 / SystemZ 138 / Mips 115 / LoongArch 92 …），而 NDK r29 自己就是定向构建（只 X86/AArch64/RISCV/BPF）—— **自建单目标 LLVM 是唯一能真正压设备占用的路**（预估解包 226 → 120~140 MB），已单独做过一份可行性评估，尚未开工。

**没有新增界面文案**，所以 guide 双语 / `help.js` / `docs/使用手册.md` / `index.html` noscript 这五处不用动。

### 14.N 壳里「收键盘后点哪都把输入框捞回来」修复（2026-10-09）

**症状**（用户报）：安卓壳里点进输入框、按返回键/收起键收掉键盘后，**再点任意位置键盘都会自己弹回来**，焦点被拽回原来那个输入框。

**真机取证**（adb 驱动，屏幕顶部临时读数条 `ih / vv / base / kbd / el`）：

| 步骤 | 读数条 | 结论 |
| --- | --- | --- |
| 初始 | `ih=960 vv=960 base=960 kbd=0 el=body` | 基线正常 |
| 点测试用例 INPUT 框 | `ih=960 vv=596 base=960 kbd=1 el=textarea.ta` | 键盘判定对（`vv` 掉 364 > `KEYBOARD_MIN`） |
| 按返回键收键盘 | `ih=960 vv=960 base=960 kbd=0 el=textarea.ta` | **键盘可见性判对，但焦点仍钉在 `textarea.ta`** |
| 点侧栏空白处 | `ih=960 vv=596 base=960 kbd=1 el=textarea.ta` | **键盘被系统重新捞起 ← 复现** |

**根因**：不是键盘可见性判错（`kbd` 全程正确），而是 `useMobileKeyboard.js` 的 touchstart 清焦闸门判据只认 `isInputBox`（`closest('input')`）与 `isInEditor`（Monaco）。**测试用例的 `.ta` 是 `<textarea>`**，收键盘后焦点不被清掉；Android 对「已聚焦的可编辑节点 + 一次点按」会重新拉起 IME，而这一步连 `focusin` 都不派发，`over-mousedown` / 手势 Tap 两道闸都看不见。

**落地**（仅此一处）：把判据放宽为整片 `FOCUSABLE_SURFACE`（`isEditable`），两条豁免原样保留 —— 落点就在该节点内时不 blur（`isTouchOn`）、`data-native-focus` 面板不受「键盘是否弹着」这道闸约束。键盘弹着时的保焦行为不变（`keyboardUpAtTouchStart` 那道闸仍在）。

**已验证（真机，同一台 OPPO，adb 驱动）**：收键盘后点空白处 `kbd` 保持 0、蓝色焦点边消失、键盘不回来；再点回 INPUT 框 `kbd=1` 键盘正常弹回（`isTouchOn` 豁免没坏）。`npx vite build` 通过。

**走错又撤回的一版**（留档，别再走）：初版把病因猜成「键盘可见性判错」，加了 `navigator.virtualKeyboard` 双来源（带 `vkVisibleSeen` 自校验）与 `baselineHeight` 的 `screen.availHeight` 上界。真机读数条显示 `navigator.virtualKeyboard` **在这台设备上压根没报数据**（`vv` 与 `ih` 两条口径均由高度差得出），那套是死代码，已全部撤回。

**待办**：

1. 用户在原报场景（设置 / 弹窗里的 `input`）复现确认；本机设置面板里几个都是下拉框、文本输入在别的分类下，adb 没翻到，故只验到 `textarea.ta` 这条同机制的路径。
2. 确认后**删掉临时读数条**：`useMobileKeyboard.js` 的 `probe` / `describeActive()` / `updateProbe()` 及其调用点，连同 App.vue 的 `focusProbe` 解构、模板里的 `.focus-probe` 与对应 CSS。
3. 本次**没有新增界面文案**，五处文档同步不用动。

### 14.O 桌面端「导出到本机文件夹」（2026-10-12 加）

**为什么另立一套命令、不复用 `fs_*`**：`workspace.rs` 里那组 `fs_*`（`fs_scan` / `fs_read` / `fs_write` / `fs_mkdir` / `fs_rename` / `fs_delete`）**全部绑在 `WorkspaceState` 的那个根上** —— 那是「用户打开的本机工作区」；而导出是「把文件写到我**刚选的另一个**文件夹」，根不同、生命周期也不同（工作区跨会话记着，导出点是一次性的）。所以另立 `ExportState { dir: Mutex<Option<PathBuf>> }`：**一个一次性落点**，`export_choose` 选中、`export_close` 清掉，与工作区互不干扰。

**四条命令**（`src-tauri/src/lib.rs` 里 `.manage(workspace::ExportState::default())` + 注册进 `generate_handler!`）：

| 命令 | 参数 | 回参 | 说明 |
| --- | --- | --- | --- |
| `export_choose` | — | `Option<String>` | 弹**原生目录选择器**（Rust 侧调 dialog 插件，所以前端仍然不需要任何 dialog capability）；取消回 `null`（不是错误）。回给前端的字符串**只用来显示**（「已导出到 …」），真正的权威是 `ExportState` 里那份 —— 前端拿着这个字符串也写不进任何文件 |
| `export_write` | `{ rel, content }` | `{ overwritten: bool }` | 写一个文件；父目录按需建 |
| `export_mkdir` | `{ rel }` | — | 在导出目录里建一个目录（单独一条的来由见下） |
| `export_close` | — | — | 清掉落点。**导完与取消都要调**，否则下一次导出会悄悄用上次的目录 |

**三条与 `fs_*` 不同的口径，别顺手统一**：

1. **这里敢覆盖，而且必须如实报数**。「保存到我刚选的那个文件夹」覆盖同名文件正是用户预期 —— 改完代码再导一次，期望更新那个文件，而不是冒出一个 `main-2.cpp`。所以 `export_write` 直接写目标（不像 `fs_write` 走临时文件 + `rename`），回参 `overwritten` 让界面能说清「覆盖了 N 个已有文件」。**导入那条路正好相反**：绝对不会覆盖用户的代码文件，一律排号（见第 7 节）。
2. **`export_mkdir` 刻意不跟 `fs_mkdir` 同契约**。`fs_mkdir` 只建一级、父目录必须已存在；而导出一个文件夹时天然是一串层级，`export_write` 的 `create_dir_all` 又只在写文件时顺带建父目录 —— **空目录会被整个丢掉**（而用户建的目录结构里带一个空文件夹很正常），所以要单独一条、允许整串建。它也**不做 canonical 关**：目标目录可能压根不存在、`canonicalize` 走不通，而词法关已经挡掉绝对路径与 `..`。
3. **校验顺序：先过词法关 → 建目录 → 再过完整的 canonical 关**。`create_dir_all` 是**真的落盘**，不能让它接触到未校验的路径，所以从 `resolve()` 里抽出 `lexical_rel()`（只做第一道闸）先用一遍；目录就位后再走完整的 `resolve()`（这时 symlink 指到导出目录外面的会在那里现形）。**改动这里别把两道闸合成一道。**

**前端零权限这条没变**：前端仍然**没有** fs / shell / dialog 三项 capability，全套磁盘访问只走 `#[tauri::command]`，且命令**只收相对路径**、绝对根由 Rust 侧持有（同 `workspace.rs` 文件头那条：前端即使被注入脚本也拼不出一个能跑到落点之外的路径）。

**平台边界**：这套命令**只在桌面端**（`services/fileTransfer.js` 的 `CAN_EXPORT_TO_DISK = IS_DESKTOP` 决定那一项显不显示），安卓端编不过 `workspace.rs`、也就没有这一项。网页端与安卓端的导出是「恰好一个文件直下 / 其余打成 zip」，全在前端完成（见第 2 节的 `zip.js`）。

**验证**：`cargo check` 0 warning（2026-10-12 实跑）；`npx vite build` 通过；端到端探针 38/38 绿 —— 覆盖导入（含二进制跳过、重名排号、文件夹层级保留）、⌘/Ctrl+A 全选口径、单文件直下、目录打 zip（用 `unzip -t` 核 CRC）。**这三条 `export_*` 本身没有在探针里驱动**（网页端探针够不着 Tauri 壳），要在桌面壳里人工导一次才算补齐。

### 14.P 壳的系统状态栏跟随站内主题（2026-10-12 加）

**问题**：安卓壳里状态栏的图标明暗跟的是**系统深色模式**，而本应用的主题是**站内自己的偏好**（存在 WebView 的 localStorage 里，默认深色）。两者不一致时那条栏就没法看：深色主题配浅色系统 → 图标黑压在一整片黑上；浅色主题配深色系统 → 反过来。

**根因在 `MainActivity` 那一句 `enableEdgeToEdge()`**（AndroidX Activity 1.10.1 的默认参数，源码实测）：

- 它调 `WindowCompat.setDecorFitsSystemWindows(window, false)` → **页面铺到状态栏/导航条下面**，状态栏底色设成**透明**（默认那对 scrim 都是 `Color.TRANSPARENT`，且 `nightMode == MODE_NIGHT_AUTO` 时 `getScrimWithEnforcedContrast` 也回透明）。所以**底色本来就跟着主题走** —— 那条栏背后露出来的就是网页 `html` 的画布底色（`--bg-editor`；`App.vue` 的 `.app` 用 `env(safe-area-inset-top)` 把内容让开）。
- 但它把图标明暗设成 `isAppearanceLightStatusBars = !statusBarIsDark`，那个 `statusBarIsDark` 来自 `SystemBarStyle.auto` 的默认 `detectDarkMode` = `Configuration.UI_MODE_NIGHT_YES`，**判的是系统，不是站内主题**。
- 它还**只算一次**：`impl.setUp(...)` 调完就完了，1.10.1 里没有装 `OnApplyWindowInsetsListener` 跟着 insets 重算。这条是好消息 —— 我们覆盖它之后不会跟谁来回打架。反过来说上游那个「系统深色在运行中切换不生效」的毛病也还在（本工程不管，我们跟的是站内主题）。

**解决**：主题真值在前端，所以走既有的那条通路把它送下去。

| 环节 | 位置 | 做什么 |
| --- | --- | --- |
| 前端 | `src/services/systemBars.js` | `IS_ANDROID` 闸门 → `invoke('set_system_bars', { dark, color })`；失败只 `console.warn` |
| 前端调用点 | `src/services/editorSettings.js` | **主题那个 watch 里**（与写 `<meta name="theme-color">` 同一处，同一个 `--bg-chrome`）：`syncSystemBars(theme === 'dark', chrome)` |
| Rust | `src-tauri/src/system_bars.rs` | `#[tauri::command] set_system_bars(dark, color)`；把 `#rrggbb` 解析成 ARGB；Android 走 JNI 调 `SystemBars.apply`，其它目标是空实现 |
| Kotlin | `gen/android/.../unnamed/SystemBars.kt` | `@JvmStatic apply(dark, color)`：主线程上 `window.statusBarColor = color` + `isAppearanceLightStatusBars = !dark` |

**底色取 `--bg-chrome`**（不是 `--bg-editor`）：那是本工程的「窗口装饰色」，装成 PWA 后浏览器画系统栏用的也是它（第 9.1 节）。同一个应用的两个「装好的形态」用同一个色值，深色下两支恰好都等于地面色 `#1c1c1c`（连成一片），浅色下 `#e8e8e8` 比页面地面 `#f3f3f3` 深一档 —— 那是第 9.1 节刻意保留的「看得出这是窗口装饰」。**要改成与页面完全同色就把 watch 里那支换成 `--bg-editor`，一行。**

**三处契约（改名必须一起改）**：

1. `SystemBars.kt` 的包名 = `app/build.gradle.kts` 的 `namespace`（`best.prime998244353.unnamed`）；Rust 侧那一串写在 `system_bars.rs` 的 `BRIDGE_CLASS`。debug 包的 `applicationIdSuffix = ".debug"` **不改包名**，不用管。
2. 方法名 `apply` + 描述符 `(ZI)V`，两边各写一份（`BRIDGE_METHOD` / `BRIDGE_SIG`）。加参数要三处同改。
3. 前端命令名 `set_system_bars`（`invoke` 的一侧）↔ `#[tauri::command] fn set_system_bars`。

**⚠️ 一处 JNI 上的坑（写这个文件时踩到的，值得记住）**：调 `SystemBars` 是「调**应用自己的类**」，**不能用 `JNIEnv::find_class`**。从 `ndk_context` 那条通路拿到的线程是 native 附到 JVM 上的（`AttachCurrentThread`），这种线程栈里没有 Java 帧，`FindClass` 会退回去用**系统 ClassLoader**（不认识应用类）→ `ClassNotFoundException`。改用 `ApplicationContext.getClassLoader().loadClass("…")`。**`android_toolchain.rs` 没撞上这条，是因为它调的全是 `ApplicationContext` 自己的方法、一个类名都没查** —— 以后再加「Rust 调 Kotlin」的地方要按这里的写法来。

**另一条：窗口只能从 Activity 上取**。`ndk_context.android_context().context()` 给的是 **ApplicationContext**（tao 的 `ndk_glue.rs` 里明明白白先 `getApplicationContext()` 再 `initialize_android_context`），`getWindow()` 只有 Activity 有。所以 Kotlin 侧拿一个 `@Volatile` 的 `WeakReference<Activity>` 挂着：`MainActivity.onCreate` 末尾 `attach(this)`、`onDestroy` 里 `detach(this)`（只摘自己那一份 —— 新旧 Activity 交叠时别把新的顺手摘掉）。

**`MainActivity.kt` 可以改**：Tauri 的 CLI 生成文件时是 `if !path.exists() { 写 }`（源码实测，`project.rs` 的 `generate_out_file`，只有 `BuildTask.kt` 例外地强制截断重写）。生成的几个文件都顶着 `DO NOT MODIFY!!`，`MainActivity.kt` 没有 —— 它就是留给用户的入口。新增的 `SystemBars.kt` 同目录、同样不会被动。

**边界（如实记）**：

- **只管状态栏**。顶部那条是这次要的。**底部导航条没管**：`enableEdgeToEdge()` 对它是「API 29+ 透明 + 平台自己按**系统**深色决定要不要加一层 contrast scrim」，所以三键导航时那条 scrim 仍可能跟站内主题不一致；手势导航下它是全透明的、露出的就是页面底色，本来就是对的。要一起管就是同一个 `apply` 里多两行（`navigationBarColor` + `isAppearanceLightNavigationBars`），没做。
- **`statusBarColor` 在 Android 15 起被标 deprecated**（那边只强制 `targetSdk >= 35` 的纯 edge-to-edge）。本工程 `targetSdk = 28`（承重，见 14.I），调用仍然生效。**真要升 targetSdk 时这里会是一个静默失效点。**
- **`env(safe-area-inset-top)` 在壳里是否真的非 0，没有在真机上量过**（本机没有连着的设备）。如果它返回 0，页面顶部就会压到那条栏下面 —— 那是另一个问题、与本节无关，但上面那条「底色取 `--bg-chrome`」的可见效果会跟着变。当前没有真机证据说明它有问题（14.J 的真机冒烟里界面是正常的）。

**验证**（2026-10-12；**本机没有连着真机，所以这一节没有端到端实测**）：

| 项 | 结果 |
| --- | --- |
| `cargo check`（宿主机） | **0 warning**（跟 `prepare_toolchain` 同一形状：命令两个 handler 都注册，非安卓实现回空，所以没有 dead_code 告警） |
| `cargo check --target aarch64-linux-android` | 通过、0 warning —— **这条才真的编译了 JNI 那段**（`platform::apply` 只在这个目标上存在） |
| `./gradlew :app:compileUniversalDebugKotlin` | `BUILD SUCCESSFUL`；`SystemBars.kt` / `MainActivity.kt` 零告警（输出里那几条 warning 全来自 tauri 自己的 `generated/*.kt` 与 `tauri-android` 库） |
| `cargo test --lib` | 带上本文件的 2 条色值解析用例全绿（`#rrggbb` / `#rgb` / 大写 / 缺 `#` / 拒绝 `rgb()` 与奇数长度） |
| `npx vite build` | 通过（只有既有的 chunk 体积提示） |
| `npm run verify` | 基线不变（A/B/C/D/F 绿 + E/G/H 红） |

**要在真机上确认的**（换一台连着 `adb` 的机器时补）：① 深色主题 + 浅色系统 → 状态栏图标应是**浅色**（修之前是深色）；② 进设置把主题切到浅色 → 图标当场变深、底色变 `#f3f3f3`（2026-10-14 由 `#e8e8e8` 改）；③ 那条栏与页面之间没有缝（说明 `safe-area-inset-top` 非 0）。

## 15. 跨设备差异清单（同一份 `dist`，不同引擎 / 外壳下体验不一样）

2026-10-14 加。起因是「三星浏览器装成应用后无视系统旋转锁」那一改 —— 根因是 manifest 里的 `orientation: "any"`，安卓把它映射成 `FULL_SENSOR`（四方向全开、**明确无视系统旋转锁**），规范说 `any` 等同省略、实现上不是，所以只能整行删掉（§9 有那一节）。顺着把全仓「特性探测 / 平台分叉 / 版本降级」的点位捞了一遍，**这一节是台账，不是待办**：每条写明「缺什么能力 → 谁缺 → 现在的降级长什么样 → 落在哪个文件」。要动其中任一条，先读那一行的注释，判据都在注释里。

**写这一节的两条纪律**：

1. **只写「谁有谁没有」的档位，具体版本号一律现查 MDN** —— 别凭记忆把版本号写进文档（`orientation` 那次就是「规范怎么写」与「谁怎么实现」分家的现成例子）。
2. **判据是能力探测，不是 UA**（`platform.js` 那条主纪律）。本节里唯二按型号 / UA 分叉的是三星那一档（`useInstallPrompt.js` 的 `MANUAL_INSTALL_BROWSER`，已知假阳性）与外壳、宿主系统的**文案**，两处都在注释里写明了为什么。

### 15.1 动画与视觉（坑 46 那条「折叠动画」就是这一类的代表）

| 能力 | 谁没有 | 现在的降级 | 位置 |
| --- | --- | --- | --- |
| View Transitions（**换边**） | 旧 Firefox / 较旧内核 | **硬切**，什么都不播（2026-10-14 晚统一：原先会自绘 `is-swapping` 补一段 280ms settle，已删） | `services/shellSettings.js` 的 `setPanelPosition` |
| View Transitions（**折叠**） | 同上 | **硬切**，什么都不播 | `App.vue` 的 `togglePanel`（091b296 拍板，坑 46） |
| `backdrop-filter` | 较旧 Firefox / Safari（要 `-webkit-`） | 通知 toast、**选中镜片**糊不住底下的代码 | `components/NotificationCenter.vue`、`EditorPane.vue`；镜片那条是功能性的，理由在 `base.css` 的 `--probe-bg` 注释里 |
| `:has()` | 较旧内核 | 整条规则失效 → 那条注释文字不给按钮让位 | `components/TestCaseCard.vue` 的 `.ionote:has(.ionote__btn)` |
| `@container` 尺寸查询 | 较旧内核 | **整套「挤不下就降级」同时消失**：设置的左目录 + 右内容、编辑器状态栏逐项摘、样例卡逐级让位 | `EditorSettingsPanel.vue` / `EditorPane.vue` / `TestCaseCard.vue`。面最广的一处。⚠️ 断点参数**不走 pxtorem**，一律手写 rem（坑 24） |
| `color-scheme` | 较旧内核 | 原生 `select` / caret / 滚动条不跟暗色 | `styles/base.css` |
| `prefers-reduced-motion` | **不是版本，是用户设置** | 全局压到 0.01ms，且**折叠与换边都整段走直切** | 兜底在 `styles/base.css`；两道 JS 闸门：折叠在 `App.vue` 的 `animate` 表达式、换边在 `services/shellSettings.js` 的 `reduceMotion`（2026-10-14 补，原先只有折叠守） |

### 15.2 布局与视口（各引擎对「视口」的定义本身就不一样）

- **`visualViewport`** —— 软键盘那整套处理的**唯一**依据（`composables/useMobileKeyboard.js`；浮层那个「匣」在 `usePopoverLayer.js`）。没有它只能退回布局视口，iOS 上键盘直接盖住内容。
- **`viewport-fit=cover` + `env(safe-area-inset-*)`** —— Firefox 安卓两样都不吃 → 那条底部白边（§9.1 已记，含实测）。
- **`interactive-widget` 刻意没声明**（`index.html` 的 viewport 只有三项）—— 正因为它在网页层靠不住，键盘判据才搬进 JS（坑 53）。
- **自绘覆盖式滚动条**（`composables/useOverlayScrollbar.js`）—— 动机**就是 OS 差异**：原生滚动条是**占位**的（Windows 常驻 11px、macOS 与移动端悬浮）。藏原生那条要**双写** `scrollbar-width: none`（Chromium 121+ 只认它）与 `::-webkit-scrollbar`。
- **`-webkit-touch-callout: none`** —— 只有 Safari / iOS 认（页签拖动那几个元素上）；Chrome 的 CSS 解析器**当场丢掉**它，`cssRules` 里也读不到（§8 有这条实测注记）。
- **`display: contents` + `order`** —— 窄屏页头左簇沉到侧栏底部用的就是它（坑 45）；老内核不支持，会直接多出一个盒子。
- **Monaco 的触摸手势归属** —— 正文吃掉纵向滑动，行号槽 / 页签 / 文件树漏给根（2026-10-14 实测）。触摸设备上「哪儿能滑」与桌面完全不同 —— 这是设备差异，不是版本差异，但用户体感差得很大，一并记在这里。

**浮层（Teleport 到 body 的菜单）也要自己成组**（2026-11-01 加）：`SettingsMenu` / `ComponentsMenu` 都声明了 `view-transition-name`（`settings-menu` / `components-menu`），`base.css` 里把这两个组对齐到与两栏同一档（260ms、同一条曲线）。理由是 VT 的**具名组画在 root 快照之上**，而这两个菜单 Teleport 到 body、**没有名字时只是 root 快照的一部分** —— 换边那一下会被两栏（`pane-editor` / `pane-tests`）的组盖住，观感就是「菜单闪没、动画结束又冒出来」（2026-11-01 用户报）。以后新增「换边期间要活着」的浮层，同样给它一个唯一的 `view-transition-name`。另一半：换边后齿轮整颗搬到另一侧，菜单要跟着走 —— 宿主（`SidebarSwitcher` / `ActivityBar`）在 `flush: 'post'` 的 watch 里重写 anchor，`usePopoverLayer` 监听 `x/y/align` 重匣（**只重匣、不关**，关不关仍由调用方决定；toggle 行本来就不关菜单）。
实测（dev / 无头 Chrome / 1400×980 / DSF 1 / 给菜单加临时描边逐帧数像素）：浅色主题 + 页头齿轮、深色 + 折叠图标栏两条入口，点段钮后约 0–1.1s 的 12 帧里菜单标记**一帧都没消失**（旧行为是整段归零）；落点也对：换边后 gear right 1052.4 / menu right 1052.4（`below-end`），折叠栏那侧菜单贴栏左缘、垂直贴齿轮。

### 15.3 能力（不是「难看一点」，是功能没了或被整条换掉）

- **跨域隔离（COOP / COEP → `crossOriginIsolated` + `SharedArrayBuffer`）** —— 本地 WASM 沙箱的**硬前提**，缺了整条引擎不可用，报 `engine.wasm.noIsolation`（`services/engines/wasm.js`）。任何会吞掉这两个响应头的中间层（部分托管、代理、内嵌 WebView）都中招。**dev server 与 Vercel 各注入一份**（`vite.config.js` / `vercel.json`），换部署先看这两处。
- **图片剪贴板** —— `ClipboardItem.supports('image/png')` 为假就退化成下载（`services/codeImage.js`）。三星 Internet 与老 WebView 只有文本剪贴板，判据写在那段函数的文件头里。
- **`navigator.clipboard` 需要安全上下文** —— 非 https（且非 localhost）时整个不存在。**已有兜底**：`TestCaseCard` 的三颗复制钮退回 `document.execCommand('copy')`（见 15.5 第 2 条）；`services/cloudSession.js` 与 `components/EditorSettingsPanel.vue`（两处）仍是空 `catch` —— 这三处都带「已复制」态，失败至少表现为「按钮不变」，不算全哑。
- **安装三件套** —— `beforeinstallprompt`（Chromium 有 / 三星是假阳性 / Firefox 与 iOS 没有）、`display_override: ["fullscreen"]`（只有 Chromium 认，其余落 `standalone`）、`theme_color`（Firefox 安卓只读 manifest 里的静态值，§9.1）。
- **Storage 持久化**（`services/storageQuota.js`）—— Chrome 按参与度自动批、Firefox 要用户点一下、Safari 至今不实现 → 同一个站，`cp-vfs` 被浏览器清掉的风险按引擎不同。
- **有兜底的小件**（顺带存一笔，别再各写一份）—— `requestIdleCallback`（无则 `setTimeout 1500`：`wasmRuntime.js` / `runtimePreload.js`）、`crypto.randomUUID`（需安全上下文，`workspaceSidecar.js` / `LocalVFSProvider.js` 两处都有退回路径）、`ResizeObserver`（`SettingsMenu.vue` 有 `typeof` 守卫）、`document.fonts.ready`（`codeImage.js` 导出代码图前等字体，可选链跳过）。

### 15.4 外壳（最大的一处，落地记录全在 §14）

> 桌面壳（Tauri）**已于 2026-10-19 冻结**，下面三条是已实现的现状（不是待办）；未完成的部分见 `docs/废案.md` §1。安卓壳不受影响。

- **桌面壳（Tauri）没有 Service Worker / 没有 COOP-COEP / 没有 Cache Storage** → `wasmEngine` 的 `platforms: ['web']` 直接把它排除，判题换 `services/engines/native.js` 跑**本机编译器**。同一个题，两端给出的耗时口径都不同，别拿两端对时间。
- **导出**：桌面壳多一条「导出到本机文件夹」（14.O，闸门是 `services/fileTransfer.js` 的 `CAN_EXPORT_TO_DISK`）；网页与安卓只有「恰好一个文件直下 / 其余打 zip」。
- **工具链**：网页版按需下 52MB（`cp-toolchain`）；安卓壳随包自带（`services/nativeToolchain.js`）；桌面壳用机器上那个编译器。
- **扩展抓题**：Firefox 已上架 AMO 一键装 / Chrome 手动加载已解压 / Edge 未上架（`EDGE_EXTENSION_URL` 为空）/ Safari 与**所有移动端**一条路都没有（§13.6）。
- **低配设备的隐性差异**：PCH 预编译头可能 OOM，失败即写 `cp.pchUnsupported`（值带版本号，同一代内不再重试、换代自动重试一次，见 §22.8；`services/runnoSandbox.js`）→ 同一份代码在弱机上编译更慢。这是**设备**差异。

### 15.5 「同一类东西、两个口径」的两笔旧账（均已收，2026-10-14 晚）

1. **~~View Transitions 的兜底不对称~~ —— 已统一（2026-10-14 晚）**：折叠与换边现在**都是「有 VT 就播、没有就直切」**。分两步做完：先给换边补上 `prefers-reduced-motion` 闸门（原先只有折叠守，开着减弱动效时换边照播 260ms），再把换边那套自绘兜底（`is-swapping` + `pane-settle` + `swapping` ref + `SETTLE_MS`）整段删掉。判定：同一类动作不该有两个降级形态；换边那套只有横移加淡入、本来也不难看，但既然折叠已经拍板「无 VT 就直切」，两边就都直切。顺带把拖拽越界那处 `!canViewTransition()` 分叉也一并去掉（见下）。
   - ⚠️ 连带改动（都是同一件事的尾巴）：`handoffDrag` 里的 `if (!canViewTransition()) dragging.value = false` 删了 —— 摘 `is-dragging` 本是给 CSS 补间让路用的（那条 `.workspace.is-dragging .pane { transition: none }` 上一轮已删），现在两条路径都不摘它；`togglePanel` 直切分支里「把拖拽态补回来」那句随之作废，regression 由 D 组（拖动分隔条）覆盖。
2. **~~复制失败时静默~~ —— 已修（2026-10-14 晚，只动了 `TestCaseCard` 一处）**：`components/TestCaseCard.vue` 的 `copyText()` 原来是「`await navigator.clipboard.writeText` + 空 `catch {}`」。而 `http`（非 localhost）下 `navigator.clipboard` **整个不存在**，抛的是 `TypeError: Cannot read properties of undefined`（不是 `NotAllowedError`），被空 `catch` 吞掉；三颗按钮又没有成功反馈（`@click` 直调，没有「已复制」态也没有 toast）→ **成功与失败在界面上长得一模一样**。现在两层：① `navigator.clipboard?.writeText` 在就先试，成功即返回；② 失败（不存在 / 未授权 / 文档失焦）落回临时 `textarea` + `document.execCommand('copy')` —— 它走浏览器原生的 copy 事件，与安全上下文无关。两处细节别省：临时框必须 `readOnly`（否则 `focus()` 会把软键盘弹起来再收回去，`.app.is-typing` 跟着闪、贴底图标栏收一下）、用 `setSelectionRange` 而非 `select()`（iOS Safari 上后者对长文本选不全）；摘掉临时框后**把焦点还给点击前那个元素** —— 丢给 `body` 会把键盘一起收掉，与「点按钮 / 点输出区不收键盘」的保焦口径冲突（「已按返回键收掉键盘、焦点还残留在框里」那一种不必在这里兜，同一次手势的 `touchstart` 已经把它清掉了，见 `useMobileKeyboard`）。实测四档：抹掉 `navigator.clipboard`（模拟 http）与 `writeText` 抛 `NotAllowedError` 两档都真的交出了全文（copy 那一刻选区 9789/9789 字符、`execCommand` 返回 `true`、临时框摘干净、焦点回到原处）；正常档走 `writeText`、不建临时框也不碰 `execCommand`；焦点原本在卡片输入框里时，复制完光标位置原样保住（100-140 → 100-140）。
   - **另 3 处同形未修**（都带「已复制」态，失败至少表现为「按钮不变」，所以不算全哑）：`services/cloudSession.js` 的 `copyCloudCode()`、`components/EditorSettingsPanel.vue` 的 `copyAppsUrl()` / `copyShortcutsUrl()`。`services/installGuides.js` 的 `copyAppsUrl()` **不是**这一类：它有 warning 降级，把地址放进正文再弹一条通知（但那条文案写的是「请手动复制这个**地址**」，搬到输出框上不贴切 —— 所以当初没照搬它）。要一并收掉的话，三处换成同一个两层写法、或抽成 `services/clipboard.js` 共用。



## 16. 悬浮倒计时卡（2026-10-20 加）

从 `WorkBuddy/2026-10-20-21-45-14/ellipse-demo` 的 `FloatingCountdownCard.vue` 移植。演示版依赖 `vue-ellipse-progress`，本站**没有引这个包**——圆环改成纯 SVG 自绘，颜色、缩放、主题全部按站点既有口径重做。

**入口与形态**
- 入口**只剩一处**：**组件菜单 › 工具 › 倒计时**（`ComponentsMenu.vue`）。2026-10-20 原本还有齿轮菜单（Quick Settings）里的「倒计时」那一行，2026-10-21 用户要求「去掉设置菜单中的倒计时」，连同 `settings.menu.openCountdown` 文案与那条 `divider` 一起删干净了 —— 别再往齿轮菜单里加回来。关闭后**不**在角落留重开圆钮：第一次访问不该有常驻浮层，而「关掉」本身就该是干净的。
- **组件图标 = 圆表盘时钟 `clock`**（2026-10-25 用户要求「换成圆形时钟那个 logo，注意墨迹对齐」）：图标名只在 `services/activityBarPins.js` 一处（组件菜单与折叠图标栏的上簇都从那张表派生），墨迹口径在 `ActivityBar.vue` 的 `ICON_INK`（`clock: { w: 18, h: 18, vb: 24 }`，句柄 `M12 7.5V12l3 2` 不外扩，所以外框就是 r9 正圆的 3..21）。算出来 `size 25.47 / stroke-width 1.79` ⇒ 墨迹 **21×21**、视觉描边仍是 1.9px、墨迹中心正好落在 viewBox 中心（`dx/dy ≈ 0`），与 gear 20.8² / grid 21.2² / cases 21×16.7 同一条基线；既不需要短边拉伸也不需要补视觉重心。**2026-10-22 那轮把倒计时换成 `hourglass` 的理由已经不存在**（当时是 clock 与 timer 两枚圆表盘并排分不出来，而现在比赛那格是 `flag` 旗子），别再按旧理由换回沙漏 —— 真要换，先看 `ICON_INK` 里三枚 clock / timer / hourglass 的外框都还在。**设置 › 应用 › 组件 › 倒计时那一行的行首图标也是 `clock`**（2026-10-25 用户指定，原来是 `timer`；`EditorSettingsPanel.vue` 里唯一一处，改了之后栏上那格、页签、设置行三处是同一枚，`timer` 条目仍留在 `AppIcon.vue` 的表里、别顺手删）。
- 整卡 `Teleport` 到 `body`、`position: fixed`、`z-index: 110`。刻意低于右键菜单 / 设置菜单（120 / 125）与通知 toast（150）—— 浮层是常驻的，菜单和通知是「此刻要你看」的，层级不能反。
- 卡内分区：头部（状态点 / 标题 / 暂停·继续 / 中止·重设 / 锁定 / 关闭）→ 设置区（时:分:秒 + 5/10/30 分钟与 1 小时四个预设 + 开始）→ 环形读数区 → 右下角缩放手柄。
- **排版收口（2026-10-20）**：设置区三行同宽 —— 三个输入框 `flex: 1` 均分、四个预设 `grid` 四等分、开始按钮通栏；冒号改成与输入框同高的 `flex` 居中（不再用 `padding-top` 猜基线）；与当前时长一致的那枚预设填亮（`is-on`）。运行态右上四枚动作统一 26px 热区、13px 字形，暂停·中止 与 锁定·关闭 之间加一道 1px 细缝（`.cd-actions__sep`）分组；结束态那颗换成 `reset` 字形，`stop` 的字形从 10×10 放大到 14×14 —— 原来挨着暂停的两条竖线明显偏小，整排看着不齐。
- **视觉减线（2026-10-24，同日三轮）**：第一轮按用户「组件库默认样式太重」重做设置区 —— 输入框去掉 1px 描边，改浅实底（浅 `#f5f7fa`）+ 20px / 500 等宽数字，获焦只用 1px 内描边 + 3px 淡光晕；预设改无边框胶囊（999px）；主按钮浅色用深藏青 `#16202b`。第二轮按用户「暗色对比度失衡」只调深色：输入区连色块一起撤掉（`--cd-field-bg: transparent`，数字 22px，单位提亮到 `--cd-label`、间距 2→1px）；选中胶囊提亮成浅蓝面 `#c9e3ff` + 深蓝字 `#0a3f74`，与暗灰未选中拉开明度；主按钮从近白面改回主题蓝 `#0e639c`（hover `#1177bb`）；`--cd-shadow` 顶部加一道 `inset 0 1px 0 rgba(255,255,255,.1)` 内发光，卡片不再是一块纯平面。卡片本身两轮都去掉实线边框，改 16px 圆角 + 大范围柔影，内边距 14/16/12。所有新色落成 `--cd-*` 变量（深浅两套在 base.css，组件不写死）。设置区变高后 `COUNTDOWN_MIN_H` 由 186 抬到 **200** —— 186 会把主按钮压出 `overflow: hidden` 的卡片外。运行态读数同步从 700 降到 600。第三轮按用户「全站不要胶囊、圆角保持一致」把预设与锁定态解锁按钮从 `999px` 改成 **10px**（与输入框 / 主按钮同档）：两者高 28 / 26px，`10 + 10` 都不会触发「相邻两角之和超边长被夹成半圆」，仍是直边圆角矩形。
- **触屏手势（2026-10-20 加）**：① 单指拖动移动（与鼠标同一条 pointer 路径）；② **双指捏合缩放**：第二根指针落下时按 `pointerId` 切到 `pinch`，以双指中点为准按比例改 `w/h`，中点保持不动（位置随 `x/y` 反算），并受 `COUNTDOWN_MIN_W/H` 与视口上限约束；③ **双击环心暂停 / 继续**：只用 `pointerType !== 'mouse'` 的 tap，`pointerup` 时自行判（触屏的 `click` / `dblclick` 时序不可靠），两击间隔 ≤320ms、落点相距 ≤24px，且必须是单指、未移动、落在 `.cd-body` 内。任一根手指抬起即收手；触屏（`pointer: coarse`）下缩放手柄常显 0.5、热区放大到 20px，单指也摸得着。
- **装 / 卸（2026-10-21 加）**：`cp.countdown.installed` 是唯一判据（默认 `true`，老存档没有这个字段一律按装着算）。设置 › 应用 › 组件里多一行「倒计时」，装着时给「卸载」、卸了给「安装」。卸载**没有资产可删**，做的是三件事：`open = false`、计时现场清回 `setup`、侧栏「组件 › 工具」那一格随之消失；`x/y/w/h` 刻意保留，装回来还在原处。卸载走与运行环境 / Codeforces 同一颗确认弹窗（`COUNTDOWN_UNINSTALL_TARGET`），因为它会顺手清掉正在跑的计时。两组都空时（Codeforces 没下 + 倒计时卸了）组件菜单给一句 `components.menu.empty`，不留一个空白浮层。
- **「默认安装」开关（2026-10-25 加）**：`cp.countdown.autoInstall`（缺省 `true`），与 `cp.cfPicker.autoInstall` 同一套口径 —— 偏好进云同步白名单、`installed` 那个事实不进；写入方只有设置面板（`countdownAutoInstall`），启动读取在 `main.js`：`readCountdownAutoInstall() && !countdown.installed` 才 `installCountdown()`。三条配套：① 面板里从关到开、而本机确实卸过 → **立刻装回来**，不等下次启动（与抽题那颗同形）；② 设置里卸载时把开关一并关掉（否则下次启动又装回来，那次卸载等于没卸）；③ 反过来（开着开关点「安装」）**不回写开关** —— 「装一次」不是「以后每次都自动装」。
  - 设置 › 云同步 › 默认安装（2026-10-27 合并后**两行**：Codeforces / 倒计时）：「随机抽题」与「比赛」在磁盘上是同一份题库（同一个 `cfReady`），2026-10-25 曾按组件列成三行、前两行读写同一个键 `cp.cfPicker.autoInstall`；2026-10-27 抽题与比赛在组件菜单、页签与设置里都合成一个 Codeforces 组件，这组开关随之收成两行、`switchTitle` 只说这一个开关。开关行之间**不许塞任何段落** —— 一旦插进去，`.setting-row + .setting-row` 那条行间分割线就因为不再是相邻兄弟而消失（2026-10-25 用户报的正是「倒计时和比赛中间缺少分隔线」）。同理，往任何一组开关行中间加说明都会打出这个洞。
- **设置 › 应用 › 组件的行与按钮（2026-10-27 合并后两行）**：Codeforces 一行有「下载（重试）」+「卸载」（题库只有一份，同一个 `CF_UNINSTALL_TARGET`、同一颗确认弹窗；tooltip 用 `cf.module.title`「卸载 Codeforces」），倒计时一行自己一条完整（装 / 卸各一颗）。2026-10-25 曾拆成三行、比赛行只有卸载；2026-10-27 合并成一个 Codeforces 组件后回到一行。**Codeforces 图标右上角那枚「测试」小标签**（`cf.module.testing`；云同步那张卡没有图标，同一枚挂在标题旁）标识该组件仍在测试中；组件菜单里那格也挂了同一枚（`COMPONENT_GROUPS` 的 `testing: true`，尺寸跟 `--menu-scale` 走）。未就绪时提示行只说「按难度与标签抽题；题库约 2MB，仅下载一次」（`cf.module.idleHint`），就绪态不写字 —— 状态点已经说了「装好了」；两行在就绪态高度一律 62px，别把「提示行没了」当成样式塌了。
- **图标与配色（2026-10-25）**：设置里那一行的图标是 `clock`（同日由 `hourglass` 换过来，与折叠图标栏那格、页签、齿轮菜单同一枚），颜色走新变量 `--icon-countdown`（`base.css` 两套主题各一值：深色 `#5aa9dd` / 浅色 `#1f8acb`，与紧邻的 `--icon-codeforces` 同值）。判据（用户口径「和上方几个 logo 的颜色一致」）：`.runtime-row__icon` 那五个图标全是蓝色系（`--icon-cpp` / `--icon-python` / `--icon-markdown` / `--icon-codeforces`），倒计时只有基础类的 `--text-dim` 灰 —— 观感像「未安装 / 禁用」。**两套主题都要给值**，别只改深色那一支。实测（两套主题各一遍，`getComputedStyle` 读 `.runtime-row__icon`）：深色 `rgb(90, 169, 221)`、浅色 `rgb(31, 138, 203)`，与 Codeforces 那一行完全相同；截图看描边时钟与实心的三条竖条视觉重量相当。

**圆环怎么画**
- `<svg viewBox="0 0 100 100">`，两圈 `<circle>`：底轨 + 进度弧；进度走 `stroke-dasharray = 周长`、`stroke-dashoffset = 周长 × (1 − 剩余比)`，再 `rotate(-90)` 让起点在十二点。弧头那颗小圆点按角度算坐标，进度为 0 或 100 时不画。
- 线性渐变的两端是 `var(--accent-strong)` → `var(--info)`；暂停换成 `--warn`、结束换成 `--fail`。所有颜色只在 CSS 里引用 `base.css` 变量，浅色主题不需要第二套代码。
- **数字不塞进 SVG**：SVG 文本不吃 rem、也不跟站点的字体回退链。环心改用绝对定位的 DOM（`.cd-readout`），字号按环径的比例算成物理 px（有小时位 0.145，只有分:秒 0.2），居中、字距、等宽数字都交给 CSS。
- 环径由 `ResizeObserver` 量 `.cd-body` 的短边得出；首帧量到 0 时线宽必须直接返回 0 —— 比例公式会把线宽放大到几百，半径变成负数，SVG 在控制台报 `A negative value is not valid`（已修，回归时注意别把这道闸门删了）。

**几何与缩放（最容易踩的一处）**
- `cp.countdown` 里的 `x / y / w / h` 一律是**设计 px**（100% 缩放下的值），渲染时 `left/top/width/height` 全部过 `px()`。CSS 里的尺寸照常交给 `postcss-pxtorem`。
- 拖拽 / 缩放时指针位移是物理 px，必须**除以 `uiScale`** 再写回；这样 100% → 150% 时卡片与内容一起长大，而不是内容涨了、壳没涨。
- 读盘后若 `x/y` 为 `null`（从没摆过）就在首次打开时落右下角；其它情况按「至少留 80 物理 px 可见」收回视口。窗口 resize / 改缩放都会再收一次。
- 锁定态保留头部槽位（`::before` 撑 26px），否则环形区会突然变大一圈，锁定 / 解锁时视觉跳一下。锁定后整卡 `pointer-events: none`，只有解锁按钮 `pointer-events: auto`；按钮悬停显形靠 window 的 `pointermove`（锁定后拿不到 `:hover`），锁定那一刻还会自亮 1.5s。锁定后环形内容（`.cd-body`）降到 `opacity: .6`、带 0.18s 过渡，卡片让出视线但读数仍能瞥见；解锁按钮是兄弟节点，不跟着变淡。

**计时口径**
- 存 `endAt` 时间戳，渲染时用 `now` 现减；后台标签页的定时器会被降频，累加 tick 会走慢。暂停冻结 `pausedRemain`，继续时重算 `endAt`。
- ticker 只在 `running` 时开（200ms）；`now` 是独立 ref，与状态分开，免得每跳一次就落一次盘。`visibilitychange` 回来补一次 tick。
- 状态落盘是 150ms 防抖。`beforeunload` **只 flush 还压着的那一次写入** —— 无脑写会把另一个标签页 / 外部改过的存档盖回旧值。
- 正好 1 小时走 `60:00`（不出现小时位），**超过** 1 小时才出现小时位；与演示版一致。
- 结束时**不弹通知、不响铃、不震动**，只把环与状态点转成 `--fail` 并在环心写「已结束」。这是刻意留白，做提醒要先想清楚 `prefers-reduced-motion` 与后台标签页两件事。

**文案与主题**
- 组件文案在 `src/i18n/messages/countdown.js`（中英各一份，预设里的数字走 `{n}`）；菜单行是 `settings.menu.openCountdown`。界面文案没有一处写死。
- 标题、按钮、输入框、预设、解锁按钮的颜色全部引用变量。**底色是专属的 `--cd-bg`，不借 `--toast-bg`**。这支色值翻了三次面：2026-10-21 用户两轮反馈「未锁定时太透」「好像没变化」，先 0.62→0.94 仍被指没变化（剩 6% 底被 blur 糊成亮斑），当天改成**不透明**（与面板同色）并删掉卡上的 `backdrop-filter`；**2026-10-24 凌晨用户又要求「提高倒计时组件窗口的透明度」**，在「纯半透明」与「半透明 + 背景模糊」里选了后者、程度选「明显（约 0.7）」：底色回到 70% 不透明（深色 `rgba(30, 30, 32, 0.7)` / 浅色 `rgba(255, 255, 255, 0.7)`），`.cd-card` 重新挂 `backdrop-filter: blur(14px)`（模糊半径写在组件里而不是 base.css —— 它是这支卡的观感参数，与色值分开调）。锁定态 `.cd-card.is-locked` 必须同时 `backdrop-filter: none`：整卡透明后若不关 blur，只剩环的那块矩形区域仍会把背后的代码糊出来，凭空多一块磨砂方斑。2026-10-21 那条「别再给这张卡加半透明底或 blur」的禁令**已被用户本轮推翻**，以本条为准。深浅两套已把卡摆在代码正文上截图核对：背后字迹糊而可辨，环心读秒的对比度不受影响。

**验证记录（2026-10-20）**
- `npm run verify`：A/B/C/D/F 绿；E/G/H 仍是既有失败（判题 WA、快捷键、题解），与本次改动无关。
- 无头 Chrome 实测：默认态 / 设置态 / 运行态 / 暂停态 / 结束态 / 锁定态 / 解锁按钮悬停 / 中英双语 / 浅色主题 / 390px 手机视口 / 150% 缩放全部正常；拖拽与右下角缩放跟手，刷新后位置、尺寸与计时连续；控制台无报错（负半径那条修掉之前有 5 条 `A negative value is not valid`）。
- **环与弧头光点越界的修正（2026-10-20 同日，用户报「圆形和发光特效溢出边框」）**：原先是两个来源叠在一起 —— ① 半径按「圆环外沿刚好贴住 `viewBox` 边」算，弧头那颗圆点的半径（`thickness * 0.62`）与它的 `drop-shadow`（当时 3px）都落在圆周之外，SVG 根元素默认 `overflow: hidden` 把它们切平（弧头走到 12 点附近时能看到圆点被削掉一块，浅色主题下最明显）；② 卡片自己没有裁切，任何外溢都会画到圆角边框外面。现在：`radius = UNIT/2 - thickness/2 - haloPad`，`haloPad = 圆点半径 + 1.5px 折成用户单位 + 0.5`；`.cd-card` 加 `overflow: hidden` 兜底。代价是环径约小 10%，卡片留白反而更稳；100% / 150% / 390px 手机 / 深色 / 浅色 / 锁定态均已重新截图核对。同日用户再要求「缩减光晕」：弧头光点 `drop-shadow` 3px→1.5px，运行态小圆点 `box-shadow` 7px→3px；`haloPad` 随之收小，环径略回。
- **装 / 卸的实测（2026-10-21）**：无头 Chrome 走完整链路 —— 组件菜单 → 设置 › 应用 › 组件 → 卸载 → 确认弹窗 → 侧栏组件菜单里「工具」整组消失 → 再点「安装」恢复；`cp.countdown` 的 `installed` 正确翻转，`x/y/w/h` 未被清掉。`npx vite build` 通过；控制台只有探针既有的 `ERR_CACHE_MISS`。
- **半透明 + 背景模糊的实测（2026-10-24）**：无头 Chrome 五个场景 —— 深色运行 / 浅色运行 / 深色锁定，外加两个把卡摆到代码正文上的深色 / 浅色。断言 `--cd-bg` 计算值 alpha 0.7、`backdrop-filter` 为 `blur(14px)`、锁定态分别为 `rgba(0, 0, 0, 0)` 与 `none`，10/10 通过；截图核对磨砂透字与「锁定态无磨砂方斑」。
- 刻意没做：结束提醒、托盘 / 角标式常驻重开入口、多计时器、与比赛倒计时联动。要加先和用户确认入口形态，别顺手把 `CfContestPanel` 的倒计时并过来。

## 17. 「全部样例通过」的庆祝纸屑（2026-10-23 加，同日改口径三次；2026-10-24 补逐张 ▶）

本地一次评测**每一张样例都 AC** 时，在**侧栏的样例面板**里落一片彩色纸屑。库是 `canvas-confetti@1.9.4`（ISC，2026-10-23 用户指定引入；`package.json` + 两份 NOTICE 都记了）。可以在 **设置 › 评测 › 通过动画** 关掉。

**口径演变（三次，以最后一次为准）**
1. 最初：「每次评测，按不同结果在样例栏落对应颜色的纸屑」。
2. 第一次改口：「只有在 AC 的时候，在测试样例栏中飘落彩色纸屑」—— 做成「每张卡片判到 AC 放一次」。
3. 第二次改口：「只有所有样例都通过才显示，范围是整个评测页面，且能在 设置 › 评测 关掉」—— 触发从**逐张**改成**整轮全过**，并加了一个开关。
4. 当天第三次（纠正上一轮的读法）：「动画的位置就是侧边栏中，而不是整个页面」——「整个评测页面」指的**是这一栏**（样例面板整块），不是整屏。所以铺满的是 `.panel`，不是视口。
5. 2026-10-24 补：**逐张 ▶ 跑到全过也放**（用户报「本地测试里所有样例都 AC，却没有纸屑」——他习惯逐张点卡片里的 ▶，而那条路原先刻意不触发）。判据仍是一件事：这一跑让整组**从「非全过」变成「全过」**；已经全过时重跑任意一张不再放。
6. 2026-10-24 再补：**单样例是例外** —— 整组只有一条用例时，逐张 ▶ 每次 AC 都放（用户报「只有一个样例，多次 AC 不触发庆祝」）。那一次运行本身就是整份提交，与页脚 ▶ 的行为对齐；多样例的 `false → true` 闸门不变。

- **只认「全过」**：任一张 WA / TLE / RE / MLE / CE 都不放。纸屑是「这份提交过了」的奖励，不是「有结果了」的通知 —— 失败那条路由徽标变色与结果通知兜着。
- **颜色与判定无关**，就是一把节日彩纸。因此**不复用 `--ok`**：那是「通过」的语义色，与「庆祝」的糖果色是两件事，四支颜色同时出现才叫彩色。
- **范围是样例面板整块**（`.panel__confetti`，`position: absolute; inset: 0` 盖住列表 + 页脚），不是单个卡片、也不是整页：这一栏就是「评测页」，庆祝落在这一栏里。

**落点**
- `services/confetti.js` —— 全部实现。`mountConfetti(el)` 用 `confetti.create(el, …)` 绑面板自有的 canvas；`unmountConfetti()` 清掉几把之间那几个 `setTimeout` 再 `reset()`；`celebrateAllPassed()` 量尺寸 + 读颜色 + 放帘子。
- `components/TestPanel.vue` —— 宿主。`<canvas class="panel__confetti" aria-hidden="true">` 挂在 `.panel` 末尾（`.panel` 为此补了 `position: relative`），`onMounted` 挂、`onBeforeUnmount` 摘。
- `App.vue` 的 `celebrateIfAllPassed(list)` —— 整轮 ▶ 的闸门：设置开着 + `isAllAccepted(list)` 才放。`runAll` 在 `notifyRunOutcome` 之后调一次，传**本轮那批 `queue`**（不是 `testCases.value`，理由同那条通知：运行途中卡片对象会被整批换新）。
- `App.vue` 的 `runOne` —— 逐张 ▶ 的闸门：跑之前记下 `wasAccepted`，跑完若「之前不是全过、现在是全过」才放（中途切文件不放）；**单样例例外**（`isSingleCase = queue.length === 1`）：每次 AC 都放，与整轮 ▶ 对齐。判据与整轮共用 `isAllAccepted`（`status === 'passed'` 且 `!stale`）。
- `components/EditorSettingsPanel.vue` 的「评测」栏 —— 开关行（`setting-row--switch` + `.switch`），写 `cp.editorSettings.celebration`。
- `styles/base.css` —— `--confetti-1..4`，两套主题各一档（深色糖果色，浅色同色相压深一档，否则白底上糊成一片看不出是四种颜色）。

**六个别动**
1. **不给 `useWorker: true`**：worker 模式下 canvas 的控制权会被 `transferControlToOffscreen` 永久交出去，尺寸从此只能靠库自己的 `resize: true`（挂 window 的 resize）改 —— 而**拖分隔条、折叠侧栏、切窄屏都不发 window resize**，位图会停在旧尺寸、粒子被 CSS 拉伸变形。几十颗粒子画在主线程上没有成本。
2. **尺寸每次自己量**（`resize: false`）：放之前按 `getBoundingClientRect()` 重设位图，**1 CSS px = 1 位图 px**。乘 `devicePixelRatio` 会让粒子只剩一半大（库自己的 `setCanvasWindowSize` 也是同口径）。
3. **位图尺寸只在一次庆祝的开头设一次**：几把里每把都设一遍的话，后一把会把前一把还在空中的粒子抹掉。
4. **颜色现读 CSS 变量**，JS 里不写十六进制；读不到就少用一支，一支都读不到就干脆不放（不拿自造颜色兜底）。
5. **面板 0×0 时不放**：`v-show` 藏起来时量到 0，放进去只是画在一块空位图上。
6. **`pointer-events: none` 是硬要求**：少这一行，整块面板上的卡片、▶、覆盖式滑块就全都点不动了。

**手感（首版返工过一次）**
- 首版是「一个点喷一股」+ `ticks: 260` + `gravity: 0.9`：截图里像半空中炸开一小团，而且半空就淡没了。
- 现在是**几小把拼成一条帘子**，把数按面板宽度选：宽 < 700（侧栏常态 500~600）用三把 —— x = 0.2 / 0.5 / 0.8，delay 0 / 90 / 180ms，每把 20 颗；≥ 700（面板被拖宽）用五把 —— x = 0.1 / 0.3 / 0.5 / 0.7 / 0.9，delay 0 / 70 / 140 / 210 / 280ms，每把 18 颗。固定五把在 550px 里会挤成一团。
- 共用一组弹道参数：`angle: 270` + `spread: 80`（朝正下方扇开才是「飘落」，库默认的 90° 是斜上喷的礼炮）、`startVelocity: 13`、`gravity: 1.2`、`ticks: 300`（≈5s，够落到面板下沿）、`origin.y = -0.05`（从面板**上沿之外**落进来，不是凭空出现在半空）。每把的 x 再加 ±0.04 抖动，连放几次不落在同几条线上。

**触发点为什么不在 `TestPanel` 里 watch `props.cases`**
用例回写会在运行途中把卡片对象整批换成新的（见 `runAll` 那段的注释），watch 比的「上一份 status」经常已经丢了；而「全过」这个判据必须等整轮跑完才有意义，所以闸门摆在 `runAll` 的结果归位之后。逐张 ▶ 走 `runOne` 里另一个闸门，判据是**这一跑有没有让整组从「非全过」变成「全过」**：跑之前记一份 `wasAccepted`，跑完再判一次，只有 `false → true` 那一下才放。所以单看一张的日常用法（已经全过时重跑任意一张）不会重复庆祝，而「一张张点、最后一张点完刚好全过」会把纸屑放出来 —— 用户报的「本地测试全 AC 却没纸屑」就是这条（2026-10-24）。**单样例不走这个转换判据**：一组只有一条时，它每次 AC 都放（否则第一次之后永远静默，用户 2026-10-24 报的就是这个）。中断（abort）的那次两边都不放 —— 那种「全过」只是没跑完的假象。

**无障碍与实测**
- `disableForReducedMotion: true`（`confetti.create` 与每次 `fire` 都带，库内部读 `matchMedia`）—— 系统开了「减弱动态效果」就整个不出。canvas 是 `aria-hidden="true"`、`pointer-events: none` 的纯装饰层。
- 无头 Chrome（1400×900，自检引擎造的用例）五档全绿（2026-10-23）：① 两条全过 → 画布 `554x853`（= `.panel` 尺寸）、`painted ≈ 2000`、四支色都在（深色 `79,193,255` / `178,141,255` / `110,231,168` / `242,201,76`；浅色 `11,111,184` / `31,157,107` / `124,92,214` / `181,122,18`）；② 一条 WA → **一像素没画**；③ 设置里关掉 + 两条全过 → 同样一像素没画；④ 单卡 ▶ 只跑第一张 → `statuses ['passed','idle']`，一像素没画（当时的预期；2026-10-24 改成「凑齐全过才放」，见下条）；⑤ 设置 › 评测 那颗开关点一下 → `cp.editorSettings.celebration` 落成 `false`，再点回 `true`，`aria-checked` 跟着翻。深浅两套都截了图。
- 2026-10-24 复核（同一套无头 Chrome + 自检引擎，两条用例）：① 页脚 ▶ → 0ms 一像素没画、120ms `painted 788`、300ms `2128`，确认「全过就放」本身没坏；② **逐张 ▶ 依次跑** → 第一张跑完 `['passed','idle']` 时 0（正确），第二张跑完 `['passed','passed']` 时**仍为 0** —— 这就是用户报的那个洞，触发点原先只在 `runAll`。补上 `runOne` 的闸门后同一场景：第一张 0、第二张 `+120ms 655` / `+300ms 2096`；接着**已全过后重跑任意一张，等上一片纸屑完全落净再点** → `0 / 0 / 0`，不重复庆祝；③ 模拟 `prefers-reduced-motion: reduce` → 整轮全过也 0（库自己压掉，不是 bug，见上一条）。
- 2026-10-24 单样例复核（每轮之间等画布清零再点）：① 一条用例连跑三次 → `painted 591 / 538 / 583`，三次都放（修复前第 2、3 次为 0）；② 两条用例回归 → 第一条 0、第二条 568（凑齐放），之后重跑两条均 0（不重复庆祝）。

## 18. 本地沙箱基准（2026-10-24 建立）

用户点名要求：把当前 runno 工具链的**空间占用（网络 + 内存）**与**时间损耗（编译 + 运行）**实测成一份绝对基准，之后任何改进都跟这一节比。所以这里每组成员都写清「怎么量的」——**口径不同的数字不可比，改口径等于没测**。复测方法在最后一小节，探针不留在仓库。

**环境与代码状态（换一样就要整组重测）**
- 机器：本机 macOS / Apple Silicon；Google Chrome 无头（`--no-sandbox --disable-gpu`，量时间的探针另加 `--enable-precise-memory-info --js-flags=--expose-gc`）；Node 走托管的 22.22.2。
- 代码：工作树带 2026-10-24 两颗**未提交**补丁 —— `LINKER_ARGS` 里 `libc-printscan-long-double` 排在 `-lc` 之前、`scripts/patch-wasi-clock.mjs` 的沙箱时钟补丁（两条都在 §7）。**时钟补丁必须在位**：否则 C++ 侧自报时间只有 1ms 粒度，这一节的 ms / µs 全体失真。判据是读数带亚毫秒位（例：`read 65536 bytes in 42785 us`）。
- 探针用 `node_modules/vite/bin/vite.js dev` 直起，**不走 `npm run dev`** → `predev` 不会自动打补丁，换机器要先 `npm run wasi:clock-patch`（并删 `node_modules/.vite/deps`，见 §7 那颗坑）。
- **两条计时线**（用户指定的分法）：JS 侧 = `performance.now()` 包住整次沙箱调用（含 worker 通信、`instantiateStreaming`、宿主收 stdout）；C++ 侧 = 程序内 `chrono::high_resolution_clock` 自报、写 **stderr**。卡片上那个数（`runCpp` 的 `durationMs`）是第三条：**只算运行段**，与用例时限同口径（§7「耗时口径」那条别改回去）。
- **三个内存口径**：① `performance.measureUserAgentSpecificMemory()` = 跨 agent 总量，要 crossOriginIsolated（dev 的 COOP/COEP 在 `vite.config.js`），一次约 16–18s；② 页 `performance.memory.usedJSHeapSize`，要 `--enable-precise-memory-info` 才逐字节响应；③ **程序自报 `sbrk(0)`** —— 这是唯一看得见 wasm 线性内存水位的通道，原因见「运行期峰值」。
- 标准件（用户给的那段，原样使用）：
  ```cpp
  #include <iostream> / <vector> / <chrono> / <algorithm>（或 bits/stdc++.h 一份对照）
  const int N = 2000000; vector<int> v(N);
  for (int i = 0; i < N; ++i) v[i] = N - i;
  sort(v.begin(), v.end());
  cerr << "[C++] sort " << duration_cast<milliseconds>(end - start).count() << " ms\n";
  ```
  配套三件：384³ 矩阵乘（`double[384][384]` 三份，自报 matmul ms）、160MB `new`+`memset` 堆用例（自报 alloc ms 与 `sbrk(0)`）、30 万行 `printf` 大输出用例（5,245,485 字节）。Python 侧同规模：`list(range(2000000))` → `reverse()` → `sort()`。

### 18.1 空间 · 网络传输体积

五件资产（`public/wasm/`，全部自托管，来源见 §7 与 `notice` 页）：

| 资产 | 裸文件 | dev 传输 | 线上 Transferred | 线上占比 | 线上编码 |
| --- | --- | --- | --- | --- | --- |
| `8.0.1/clang.wasm` | 31,214,472 | 31,214,472（identity） | **10,240,236 (9.77MiB)** | 32.8% | br |
| `8.0.1/wasm-ld.wasm` | 19,490,094 | 19,490,094（identity） | **6,581,348 (6.28MiB)** | 33.8% | br |
| `8.0.1/clang-fs.tar.gz` | 1,790,862 | 1,790,862（gzip 透明解压） | **1,790,862** | 100% | identity 透传 |
| `python-3.11.3/python.wasm` | 20,538,911 | 20,538,911（identity） | **9,658,480 (9.21MiB)** | 47.0% | br |
| `python-3.11.3/python-fs.tar.gz` | 4,066,590 | 4,066,590（gzip 透明解压） | **4,069,002** | 100% | identity 透传 |

- **合计**：C++ 三件裸 52,495,428 = 50.06MiB → 线上 **18,612,446 = 17.75MiB（35.5%）**；Python 两件裸 24,605,501 = 23.47MiB → 线上 **13,727,482 = 13.09MiB（55.8%）**；五件裸 77,100,929 = 73.53MiB → 线上 **32,339,928 = 30.84MiB（41.9%）**。
- 线上数怎么来的：全新浏览器上下文（HTTP 缓存 / Cache Storage 皆空 = F12 勾 Disable cache 的第一次访问），同源 `fetch`，取 CDP `Network.loadingFinished.encodedDataLength`。两个 `.tar.gz` 的 Transferred 与裸文件等长（多出的 2,412 B 是响应头与分块框架）—— **Vercel 对已经是 gzip 的文件不再二次压缩**，这是刻意的，见 §10「工具链裸文件直接进仓库」。
- 首页自身（不含任何工具链）：**3 条 · 1.21MiB**（`/` br、`main-*.js` 1.16MiB、`main-*.css` 0.05MiB、`codicon-*.ttf` 0.07MiB）。dev 完全另一回事：**550 条 · 112.55MiB**（monaco 未压缩的预打包 chunk 单个就 4.36 / 2.26 / 1.69 / 1.67MiB）—— 别拿 dev 的传输量当用户体验。
- 本机到 Vercel 实测 **1.6–1.8 MiB/s**（逐件 3.2–4.5s）→ 首次下载 C++ 三件约 **12s**、五件约 **21s**。§7/§10 里那句「3.76 MB/s」是旧测量，本轮慢得多，做下载体验决策按本轮数。
- **离线落点（Cache Storage，装完之后设备上的占用）**：桶 `cp-toolchain` = 5 条 · **73.53MiB**、桶 `cp-shell-v5` = 11 条 · 5.06MiB（**当时**是 v5；2026-10-25 升 v6，桶名随之变、内容不变）。注意 `cp-toolchain` 存的是**解码后**的字节（br 只存在于传输路上），所以「两种语言都用过」的设备占用 ≈ **78.6MiB**；只跑 C++ 的用户只落 50.06MiB（§9：工具链不随 install 预缓存，用哪个语言才下哪个）。dev **不会**写这两个桶（没有 SW），别拿 dev 页面查 Cache Storage。
- **包里的东西有多重**（`scripts/` 之外的一次性分析，`/tmp/tlb/assets.cjs`）：`clang-fs.tar.gz` 解包 = **416 个文件 / 8,797,774 B (8.4MiB)**（裸 tar 9,138,176），大头是库不是头：`libc++.a` 1722KB、`libc.a` 746KB、`libc++abi.a` 624KB、`libclang_rt.builtins-wasm32.a` 299KB，头文件里最大的是 `random` 221KB / `regex` 217KB / `algorithm` 200KB / `ctre.hpp` 189KB。`python-fs.tar.gz` 解包只有 **3 个文件 / 4,136,455 B**：`python311.zip` 4001KB（标准库走 zipimport）+ `os.py` 39KB（zipimport 加载它有循环依赖，必须是真文件）。
- ⚠ **同一个 URL 的 Transferred Size 会随 SW 是否已接管而变**：SW 接管后页面侧那条记录 `encodedDataLength = 0`（真实网络算在 SW 自己的请求上，而 CDP 只 attach 页面 session 时看不见）。本轮五件里先发的几件赶在 SW 接管前，才拿到真数。复测要么趁早发，要么把 SW target 也 attach。
- ⚠ **别把本地 br-11 当线上可达的下限**：本机 `brotli -q 11` 能把 clang.wasm 压到 7,540,088、wasm-ld 到 4,872,917、python 到 7,878,884，而 Vercel 实给 10,240,236 / 6,581,348 / 9,658,480 —— 边缘用的是较轻的 brotli 档。§7 那条 `npm run wasm:opt` 的「gzip 反而变大 0.98%」结论是按 gzip 算的，换成 br 要重算再说。

### 18.2 空间 · 内存

**dev 侧跨 agent 总量（`measureUserAgentSpecificMemory`，单位 MiB）**

`A0 空载 108.51` → `A1 工具链就绪 127.79`（**+19.28**）→ `A2 首次编译运行后 129.13` → `A3 PCH 生成后 136.47`（**+7.35**）→ `A4 Python 运行时也进内存 140.43`（**+3.96**）→ `A5 卸载后 119.40`。
原始字节：`113,783,728 / 134,000,334 / 135,399,552 / 143,102,887 / 147,253,769 / 125,199,533`。
- **A1 那 +19.28MiB 是 sysroot**：`loadToolchain()` 把 tar 解成 416 条目的 JS Map 常驻页面（`unpackSysroot`），两个编译器二进制只读进 HTTP 缓存、不驻留（`warmCache` 刻意不转 blob，理由在那段注释里）。
- **A5 − A0 = +10.89**，而 A1 起才出现的 monaco `editor.worker.js` 条目本身就 10.76–10.78MiB → **工具链净残留 ≈ 0**，`unloadRuntime()` 是干净的（这条是卸载功能的验收依据）。
- **页 `usedJSHeapSize`**：空载 84.06 → 冷工具链期间峰值 **140.88** → 冷编译+运行期间峰值 111.00（曲线 103,973KiB 平推 → 121,855 → 132,045KiB 两级台阶，分别对应链接产物与宿主收 stdout） → 高负载段（160MB 堆用例）**186.45**。
- **发货包体小得多**：线上「回访、应用已起来、工具链不在内存」实测跨 agent **23.13MiB**（页 heap 17.36），条目只有 `/` 20.79 + `editor.worker-*.js` 1.46 + 零头。同一个界面在 dev 是 108.51 —— **差 4.7 倍，全是 monaco 未压缩 ESM 的账**。所以下图做内存优化时拿 dev 当基线会把收益夸大一倍；线上「工具链已读进内存 + 刚跑完一次」的实测见 §18.6。

**运行期峰值（用户点名要的 Peak Memory）**
- ⚠ **`measureUserAgentSpecificMemory` 看不见 runno worker 里的 wasm 线性内存**：按住 160MB 堆时跨 agent 总量 138.16MiB，与只按住 8MB 时 138.25MiB 几乎相同；涨的只有 `(unattributed)`（1.34 → 9.22）。所以**「Peak Memory」必须以程序自报 `sbrk(0)` 为准**，UaMem 只能证明「宿主侧没被吃爆」。
- 自报水位（同一次运行内的真实线性内存上沿）：起始 **1,179,648 B (1.13MiB)**；2M 排序（数据本身 8MB）后 **9,175,040 B (8.75MiB)** 且**不回落**；160MB 用例 **168,951,808 B (161.13MiB)**（那次上限给到 256MiB）。
- **只增不减**是 wasm 线性内存的硬性质：`free` / 析构都不会把页还给宿主，所以一次峰值会一路带到 worker 销毁。这也是 `--max-memory` 是唯一的「内存上限」手段的原因。
- **闸门有效**：`--max-memory=64MiB` 时，程序想 `new` 400×1MiB 只成功 **62** 次、exit 0、运行段 8ms —— MLE 判据正是从这类「分配失败但不 trap」的表现来的（§7 的 MLE 那条）。`memoryLimitBytes` 会烙进链接参数，所以**改上限必须重链接**（`compileCache` 的键里带着它）。

### 18.3 时间 · 加载与编译段（dev，本机 localhost，无网络抖动）

- `preloadToolchain()` **81ms** —— 这**不含网络**：三发 fetch 走已热的 HTTP 缓存 + 解 8.4MiB tar。冷网体积见 §18.1（线上首访 C++ 三件约 12s）。`preloadPythonRuntime()` **26ms**（同口径）。
- **首次「编译 + 运行」标准件：JS 侧 647.6ms · 运行段 40ms · C++ 自报 32ms** → 编译段 ≈ **600ms**（另一次独立测量 526.2 / 41 / 32 → ≈490ms；取 **490–610ms** 为冷编译区间）。
- 五份不同代码各自冷编译（每次都是真冷编）：`empty` **504.9** / `hello` 596.7 / `bigout` 592.8 / `sort_bits` 657.0 / `matrix` **714.9** ms → **505–715ms**，与代码量只有弱相关：大头是 clang 首帧 `instantiateStreaming` 与 libc++ 头文件的前端处理，不是用户那几行。
- **PCH**：`generatePch()` 一次性 **529ms**、产物 **9,025,124 B (8.61MiB)**（落 IndexedDB `cp-pch`）。带 PCH 后冷编译：`sort_iostream` **423.1** / `sort_bits` **427.5** / `matrix` **449.4** ms → **省 230–265ms（约 −35%）**。代价是 +7.35MiB 常驻（A2→A3）。所以「PCH 默认开不开」是一句「每次首编快 0.25s」换「常驻多 7MiB」的取舍，不是纯收益。
- **命中 `compileCache`（单槽，键 = 源码全文 + `memoryLimitBytes`）后**：同一份代码连跑 5 次 JS 侧 **64.2 / 39.4 / 37.1 / 36.8 / 37.1ms**（第一次含 worker 冷启动，之后稳定在 37±1ms；C++ 自报 46/31/30/29/30ms）。
- ⚠ **单槽**意味着「同一份代码 + 同一个内存上限」才免编译：切文件、改上限、改一个字都要重付 500–700ms；成批跑用例时只有第一张卡片付（§7「编译刻意不算进 durationMs」那条同因）。

### 18.4 时间 · 运行段与 I/O scaling（dev）

**纯算力**（运行段 = 卡片那个数；C++ 自报是程序内时间，两者之差是沙箱内的启动/退出，**不是**宿主通信）

| 用例 | C++ 自报 | 运行段 | JS 侧总 | 运行段 − C++ |
| --- | --- | --- | --- | --- |
| 2M 排序 | 30–32ms | 37–41ms | **36.8–39.4**（命中编译缓存） | **≈6–9ms** |
| 384³ 矩阵乘 | 55ms | 66–67ms | 448.6 / 449.4（**都带重编**，见 §18.3） | ≈11–12ms |
| 160MB alloc+memset | 14ms | 22ms | 442.6（带重编） | ≈8ms |

→ **JS 侧总 − 运行段 = 0–1ms**（同一段代码连跑、必命中缓存时；iotime 十次全这样），也就是说宿主↔worker 的通信本身几乎不花钱；上面那 6–12ms 是**运行段之内**的开销 —— crt1 启动、静态初始化、stdout flush、wasm 实例化，都在沙箱里。

**stdin：整段都落在沙箱里**（JS 总 ≈ 运行段，说明慢不在宿主）

| 输入量 | 运行段（两次独立测量） | 程序自报「读干 stdin」 |
| --- | --- | --- |
| 0 KiB | 9 / 8ms | 305µs / 265µs |
| 16 KiB | 25 / 20ms | 15.4 / 12.1ms |
| 64 KiB | 50 / 49ms | 42.8 / 40.9ms |
| 256 KiB | 168 / 164ms | 158.3 / 155.8ms |
| 1 MiB | **643 / 632ms** | 629.9 / 621.5ms |
| 4 MiB | **2,559 / 2,478ms** | 2,544.8 / 2,465.0ms |

→ **≈0.61ms/KiB ≈ 1.6MB/s**，线性、无拐点，两次测量差 ≤3%（另一次 5MiB 独立实测 3,613ms / 运行段 3,173ms，同一条线上）。成因是 `SharedArrayBuffer` 那个 **8188 字节**的槽位必须分块搬运（`runnoSandbox.js` 的 `STDIN_CHUNK_BYTES`，4MiB 输入要切成约 512 块，每块都有一次宿主↔worker 的往返），不是程序自己慢。

**stdout：沙箱侧快、宿主侧贵**（`iotime2` 那一组，程序自己 `putchar` 并自报 µs）

| 输出量 | 运行段 | 程序自报「putchar」 |
| --- | --- | --- |
| 0 KiB | 13ms | 45µs |
| 16 KiB | 8ms | 305µs |
| 64 KiB | 9ms | 685µs |
| 256 KiB | 11ms | 2.05ms |
| 1 MiB | 21ms | 8.1ms |
| 4 MiB | **41ms** | 31.0ms |

→ **4MiB 输出只比空输出多花约 30ms**，比 stdin 侧快两个数量级（同尺寸下 stdin 要 2,559ms）。
- 但**宿主侧收口**另花 **≈270–360ms / 5MB**：`bigout` 30 万行 = 5,245,485 字节，命中编译缓存那一次 JS 431.6ms 而运行段 73ms（差 **358.6ms**）；另一次 JS 322.5 / 运行段 54（差 **268.5ms**）。也就是**大输出的真正成本在把字符串交回页面**（宿主拼接 + 跨线程传），不在沙箱里。
- 缓存命中后同一段代码连测 10 次（各带 64KiB 输入）：JS **min 49 / 中位 54 / max 55ms**（第一次 807ms 是冷编），其中程序自己读输入就占 39.6–45.1ms → 剩下的 **≈5–10ms** 是运行段内的启动/退出，宿主↔worker 通信只占 **0–1ms**。

### 18.5 Python

- `preloadPythonRuntime()` **26ms**（缓存已热，解 3 个文件的标准库包）。
- 2M 排序：冷 **229.9ms** / 热 **216.1ms**，**都是运行段口径**（没有编译段，解释器启动 + import + 执行都在同一次 WASI run 里）。这与 §7 那句「解释器冷启动约 190ms」以及 `PYTHON_STARTUP_ALLOWANCE_MS = 500` 的余量对得上 —— 也就是说 Python 那条 1s 时限里，**六成是启动**。
- Python 运行时进内存只多 **+3.96MiB**（A3→A4），因为标准库是 zipimport、按需用。

### 18.6 线上（发货包体）实跑

**口径与前提**
- 目标是 `https://www.998244353.best` 的发货产物（与本机 HEAD 同一 commit）。⚠ **线上不含工作树那两颗未提交补丁**（§7 的沙箱时钟、`libc-printscan-long-double`）→ 线上 C++ 自报时间只有 1ms 粒度，ms 级读数不受影响。
- 走**真实界面**：注入标准件 → 点「添加测试样例」→ 填期望输出 → 点页脚「▶ 运行全部」。一次评测的墙钟取「▶ 进禁用态 → 回可用态」，那就是 `runAll` 的完整生命周期（保存 → 读工具链 → 编译 → 运行 → 收 stdout → 比对 → 回写）。
- 每次都是全新浏览器上下文（Cache Storage / HTTP 缓存皆空），首访那一段是真首访。

**时间**

| 场景 | 点▶→跑完 | 卡片耗时（运行段） | 期间 /wasm | 页 heap 峰值 |
| --- | --- | --- | --- | --- |
| 首访真空缓存、第一次点▶（三次独立实测） | **6,743 / 14,616 / 18,013ms** | — | 三件全 net：clang 9.77MiB(br) + wasm-ld 6.28MiB(br) + clang-fs 1.71MiB(identity) | 86.22MiB |
| 回访、刷新后第一次点▶（`compileCache` 是页面内存态，刷新即空） | **505ms** | **43ms** | 三件全 sw · Transferred 0 | 136.28MiB |
| 同一次页面里连点（命中 `compileCache`） | **58 / 84 / 58 / 55ms** | — | 无请求 | 56.87–64.60MiB |

同一支探针改打 dev、**节奏一字不改**（`/tmp/tlb/devrun.mjs`）：首访第一次 1,211ms（本机 localhost，50MiB 传输不吃网络）、连点 **58 / 57 / 63 / 59ms**、页 heap 首跑峰 **249.42MiB**。
- → **发货包体在运行这条路上没有额外开销**：命中编译缓存的一次，线上 55–84ms vs dev 57–63ms；线上 2M 排序的运行段 **43ms** vs dev 37–41ms（§18.3/18.4）。**dev 侧那套基准可以直接当线上基准用**，不必为线上单开一组数。
- → **首访用户点第一下要等 7–18 秒**，全部来自那 17.76MiB：§18.1 逐件量到 **1.6–1.8MiB/s**（传输 10–11s），本组最快一次整批 6.7s（≈2.6MiB/s）→ 传输占 **7–11s**，剩下才是解 8.4MiB tar + 首帧 `instantiateStreaming` + 冷编译。三次数差近三倍，全是 Vercel 那条吞吐的抖动，**别拿单次当 SLA**。§10 那句「按语言懒下载」的体感成本就是这个数。

**空间（内存）**
- 跨 agent UaMem：**23.13MiB**（应用已起、工具链不在内存，§18.2）→ **47.23MiB**（工具链读进内存 + 刚跑过一次），净增 **+24.10MiB**；条目 `/` 44.54 + `editor.worker-*.js` 1.51 + 零头。dev 同场景 108.51 → 127.79（+19.28）——**绝对量线上只有 dev 的三分之一，净增那 20MiB 级两边一致**（那 416 条目 sysroot Map 的账，跟打包方式无关）。
- 设备占用（`navigator.storage.estimate().usage`，只跑过 C++ 的档案）：**70,000,782 B = 66.75MiB**，其中两桶 Cache Storage 占 55.1MiB（`cp-toolchain` 50.06 + `cp-shell-v5` 5.06 —— 当时是 v5，2026-10-25 起为 `cp-shell-v6`），其余是 VFS / IndexedDB（PCH、设置、通知历史）与 SW 脚本。
- ⚠ **首访那三发 `/wasm` 不落 `cp-toolchain`**：首访那一跑之后实测桶里只有 **2 条 · 48.36MiB**（clang + wasm-ld），`clang-fs.tar.gz` 那 1.71MiB 要等 SW 接管后的下一次请求才进桶（刷新后三发全部由 SW 供出、Transferred 0）。§18.1 那句「5 条 · 73.53MiB」是探针把五件各连取两次凑出来的**稳定态**，不是首访落点。

⚠ **只有走真实界面才看得见的坑（本轮实测到；只记录，未修、未授权动手）**
- **「改过东西立刻点▶，这一次的结论不落卡片」**：跑是真跑完了（▶ 禁用 0.85–1.3s、下载/编译/运行都发生），但卡片停在「待运行」、耗时与判定都不出，**dev 与线上同一节奏都复现**（两组探针的卡片列全程 `idle 0/1`）。机制：`runAll` 取完 `queue = [...testCases.value]` 之后，`saveAll()` / 用例回写会重建文件树，`watch(activeNode)` 里 `id === casesNodeId && sameTests(...)` 这条守卫（`src/App.vue:263`）没拦住 → `testCases.value` 被换成 `createCase()` 的一批新对象（`id: ++caseSeq` → `:key` 变 → DOM 卡片重建），`applyPatch` 落在已经脱链的旧引用上。`src/App.vue:1271` 那条注释早承认过同一竞态的另一半（发通知必须读 `queue` 而不是 `testCases.value`），**显示这一半没兜住**。绕法即判据：刷页面（什么都不 dirty）再点▶，立刻正常 —— 线上实测 `WA · 43 ms · 0/1 · 通知「答案错误 1」`，ACTUAL 是程序打出的 `1 2000000`，链路本身没问题。
- 用例两栏的持久化**没有**问题，别顺着上一条怀疑它：真键盘往两栏打字 → 刷新 → 再点一次▶ → 再刷新两次，`["AAA","1 2000000"]` 一路都在（`/tmp/tlb/casepersist.mjs`）。写回时字段名在 `expectedOutput` 与扩展那套 `output` 之间来回翻（`src/App.vue:195` 读、`src/App.vue:239` 写），口径是对的。探针用原生 setter + 合成 `input` 事件时偶发读不回，那是**探针**没走通 v-model，不是应用丢数据。

### 18.7 由基准排出的改进优先级（排序；①② 的宿主方案已定 B，2026-10-25，见 `docs/新内核规划.md` 阶段 4）

1. **stdin 搬运 1.6MB/s** 是整条链路最贵的一段：1MB 输入就要 643ms，比标准件的全部算力（30ms）贵 20 倍。改法是把块尺寸从 8188 提上去、或直接把输入一次性写进 wasm 内存。
2. **stdout 宿主收口 ≈270–360ms / 5MB** 与 ① 同一条通道，动一边要一起看。
3. **冷编译 505–715ms**：PCH 已能砍 35%，但要 +7.35MiB 常驻；再往下只剩「换更快的工具链」或「多 worker 并行编译」，都不小。
4. **首访网络 30.84MiB**：C++ 那两件 br 后 16.05MiB 是绝对大头，`clang-fs.tar.gz` 只有 1.71MiB —— **精简 sysroot 的收益远小于动两个编译器**，别一上来就朝头文件下手。另：这一条按「改进计算/IO 路径」排在这里，**但如果 metric 换成「首访用户点第一下的等待」，它必须排第一** —— 线上实测那一次是 7–18 秒（§18.6），比 ①②③ 任何一条都贵一个数量级。
5. **UaMem 看不见 wasm 线性内存**：后续任何「省内存」的验收必须继续用 `sbrk(0)` 自报，否则测不出收益也测不出回归。

### 18.8 复测方法（要可比就照这段走）

- 探针（一次性，用完即删，**仓库里不留**）：`/tmp/tlb/bench.mjs` = 13 段主基准（dev 传输体积 / 空载 / 首次加载 / 首编 / 缓存复用 / 逐份冷编 / PCH / 高负载 / 大输出 / Python / Cache Storage / 网络请求明细 / 卸载回收）；`/tmp/tlb/mempeak.mjs` = 运行期峰值（20ms 采样曲线 + 「按住不放 + 并发量测」）；`/tmp/tlb/iotime.mjs` = stdin/stdout scaling + 缓存命中 10 连跑；`/tmp/tlb/prodnet2.mjs` / `prodnet3.mjs` = 线上逐件 Transferred 与回访内存；`/tmp/tlb/prodrun6.mjs`（连点 5 次取墙钟）/ `prodrun7.mjs`（刷新后干净跑一次取卡片）/ `devrun.mjs`（dev 同节奏对照，改 ORIGIN 与端口即可）/ `casepersist.mjs`（用例两栏持久化）= §18.6 那组。原始输出留在 `/tmp/tlb/*.log`（**这台机器重启即失**，要长期留就抄进当日记忆）。
- 探针只往 `localStorage` 播种、只 `import('/src/services/runnoSandbox.js')` 拿模块，**不改仓库文件**。dev 里任何人要复现同样三个数，起 `npm run dev` 后在页面控制台执行：
  ```js
  const sb = await import('/src/services/runnoSandbox.js')
  await sb.preloadToolchain()
  const r = await sb.runCpp({ code, stdin: '', memoryLimitBytes: 256 * 1048576, onStatus: console.log })
  ```
  `r.durationMs` = 卡片那个数；C++ 自报的时间在 `r.stderr` 里。JS 侧总耗时要自己在外面包 `performance.now()`（`runCpp` 不含编译段的账）。
- **量运行期峰值只能「按住不放」**：`window.__hold = sb.runCpp(...)`（**不要 await**）→ 等 5–6s 让程序进到占住内存的位置（用 §7 修好的 `steady_clock` 空转 N 秒）→ 期间发 `measureUserAgentSpecificMemory()` → 最后再 `await window.__hold`。await 在前就没有「运行期」可量。
- 四条会造出假数字的坑：① **worker 空闲十几秒后第一枪 +7~12ms**（冷启动），要干净的「命中缓存后」数字就连跑几次丢掉第一次；② `npm run build` 在这台机器必挂 safe-delete（清 `dist/` 超 50 文件），要产物用 `npx vite build --outDir /tmp/…`；③ 探针起 dev 要避开 5199 与残留 vite（`--strictPort` 会直接 exit 1）；④ **一个 page 只跑一个场景**，IndexedDB（VFS 与 PCH）跨页共享，第二个场景会撞上上一轮的同名文件。
- 线上侧另有四条：① SW 接管与否会改变页面侧看到的 Transferred Size（§18.1 那个 ⚠），以及**只刷页面不会把工具链读进内存** —— `ensureRuntimeLoaded` 由「编辑器里内容变了」才触发（`syntaxDiagnostics.js`），空打开一个 .cpp 不触发，量线上内存必须动一次键盘或点一次 ▶。② **别用「等卡片终态」当线上跑完的信号**（§18.6 那条竞态：刚改过东西就点▶，卡片永远停在待运行）——要等的是「▶ 进禁用态 → 回可用态」，`elapsed` / 判定 / 通知都不可信；要看结论就得先刷新让状态干净。③ 首访那三发 `/wasm` 不进 `cp-toolchain`，量「装完之后占多少」要跑两次或刷一次。④ `page.evaluate` 的回调是**在页面里重新编译**的，闭包外的 Node 侧常量一律引用不到（`ORIGIN` 那种写法直接 `ReferenceError`，会把最后一步 UaMem 整发打飞），URL 要在外面拼成字面量传进去。


### 18.9 复测：栈 64 MiB + sbrk 探针之后（2026-10-25）

动机：§5.3 的栈策略与 §5.2 的 sbrk 探针都改了链接参数，需要确认「用户程序跑得更慢没有」。口径照 §18.8，dev / 无头 Chrome / 256 MiB 上限 / 编译缓存命中、每项 3 连跑取中位。

⚠ **运行段的数字与 §18.3/§18.4 不再同口径**：那时 `durationMs` 从「进入运行阶段」起算，含 wasm 实例化与宿主收尾；现在 §20.4 改成宿主补丁记的 `_start` 起止（`runMs`）。所以**比速度看「C++ 自报」与「JS 侧总」，运行段只与今天的运行段比**。

| 标准件 | 旧：自报 / 运行段 / JS 总 | 现在：自报 / 运行段 / JS 总 | 判断 |
|---|---|---|---|
| 空程序 | — / — / — | — / 1 / 5 ms | 起跑底噪 |
| 2M 排序 | 30–32 / 37–41 / 36.8–39.4 | **28 / 33–34 / 40** | 持平（自报 −7%，JS +1） |
| 384³ 矩阵乘 | 55 / 66–67 / — | **57–58 / 60 / 68** | 持平（自报 +4%） |
| 160 MB alloc+memset | 14 / 22 / — | **17–18 / 19–20 / 23–24** | 自报 +3~4 ms，运行段更低 |
| stdin 64 KiB（自报） | 42.8 / 40.9 | **41.7** | 持平 |
| stdin 1 MiB（自报） | 629.9 / 621.5 | **611–613** | 略快 2% |
| stdin 4 MiB（自报） | 2544.8 / 2465.0 | **2418–2432** | 略快 3–4% |
| 5.29 MB 输出（JS 总） | 322–431 | **53** | **不可比，见下** |
| Python 2M 排序（运行段） | 216–230 | **203–206** | 略快 5%，按抖动看 |

- **计算速度没有退化**：自报值全部落在 ±7% 的抖动带里；运行段整体低 5–7 ms，正好是「实例化 + 宿主收尾」被移出计时口径的量，不是程序变快。
- **内存底噪变了**：栈策略让初始线性内存从 1.13 MiB 变成 **64 MiB**（`hello` 的 `memoryBytes` = 67,239,936 B），160 MB 用例总水位 235,012,096 B（224.1 MiB），仍在上限内。以后 `memoryBytes` 的读数要减掉这 64 MiB 才能和旧数比。
- **160 MB 用例必须加内存屏障**：只写满再读最后一个字节时，`-O2` 会把整段分配与写入删掉（本次先测出「0 ms / 64 MiB」的假数）；`asm volatile("" : : "r"(p) : "memory")` 之后才回到 17–18 ms / 224 MiB。写这类用例别省这一行。
- **5 MB 输出的 53 ms 不能当成提速**：旧数 322–431 ms 含页面侧卡片收口，新数走的是 `runCpp` 裸路径，两次测量路径不同；要定论得按 §18.8 同一支探针重测。stdout 捕获代码这两轮没动（宿主补丁只改时钟与结果元数据）。
- 原始输出：`/tmp/bench-runtime-now.mjs` + `/tmp/bench-alloc.mjs`（一次性，已删）。

## 19. 新内核阶段 0：clang 23 / wasm-ld 编出来并跑通（2026-10-24 深夜）

施工规划在 `docs/新内核规划.md`；这一节只记**已完成的事实、踩过的坑和复跑方式**。底座：LLVM 23.1.0 + wasi-sdk 34.0（arm64 macOS 本机编）。产物在 `tools/wasm-core/out/23.1.0/`（`tools/` 进 `.gitignore`，**不进仓库**），源码/缓存 3.4G、构建目录 1.4G。

### 19.1 产物与体积（与 §18.1 同口径）

| 文件 | raw | gzip -9 | br q9 | br q11 | 现役 8.0.1 对照 |
|---|---|---|---|---|---|
| `clang.wasm` | **103.59 MiB** | 24.76 | 18.55 | 16.27 | raw 29.77 / br11 7.19 / 线上 br 9.77 |
| `wasm-ld.wasm` | **62.58 MiB** | 15.02 | 11.44 | 10.06 | raw 18.59 / br11 4.65 / 线上 br 6.28 |
| 合计 | **166.17 MiB** | **39.78** | 29.99 | 26.33 | raw 48.36 / br11 11.84 / 线上 br 16.05 |

→ 裸体积 **3.44×**、本地 br11 **2.22×**。当前构建**未做 wasm-opt / strip**，这是阶段 0 的早期数字；预算已拍板接受（§19.11，首访 7–18s 会等比放大，接受）。**别拿 gzip 和线上 br 直接比**（§18.1 那条 ⚠ 同理）。

**`-Oz` 对照**（`--opt`，binaryen 132）：`clang.wasm` 103.59 → **62.32**（gz 20.64 / br11 14.29），`wasm-ld.wasm` 62.58 → **36.04**（gz 12.29 / br11 8.73）；合计裸 166.17 → **98.36**（−41%）、gzip 39.78 → **32.93**（−17%）、br11 26.33 → **23.02**（−13%），对现役 8.0.1 仍是 2.03× 裸 / 1.94× br11。优化后的两颗都复验过整条链：`--version` 正常 → `-cc1` 编 → `wasm-ld -flavor wasm` 链（要显式带 `crt1-command.o` 才有 `_start`）→ 跑出 `before / caught: vector / len=5`。

**但 `-Oz` 是拿编译速度换的**（同一台机器、同一份含 `map/vector/function` 模板的 TU，Node WASI，交替 6 轮）：

| 内核 | 空跑 `--version` | `-cc1` 编译 |
|---|---|---|
| 未优化 103.59 MiB | 122 ms | **984 ms** |
| `-Oz` 62.32 MiB | 101 ms | **1732 ms** |

**编译慢 1.69×**，只有「实例化」因为模块小反而快 17%。压缩收益主要来自重复的字符串与表，所以裸体积 −41% 只换来 br11 −13%。**结论：`-Oz` 不作默认**（用户直接感受到的是编译墙钟）；`-Oz` 已排除（§5 第 4 项），不为体积接受这 1.69×。这些是本机 Node 口径，与 §18 的浏览器数字不可混用，只比相对值。

### 19.2 复跑（一条命令）

```bash
node scripts/wasm-core/build.mjs          # 增量：编译产物不会重编，改旗标只触发重链
node scripts/wasm-core/build.mjs --opt    # 可选：wasm-opt -Oz 体积探针
```

两段式：原生段出 `llvm-tblgen/clang-tblgen/llvm-min-tblgen`，wasm 段用 `scripts/wasm-core/toolchain-wasip1.cmake` 交叉编 clang + lld（`LLVM_ENABLE_THREADS/EH/RTTI/LTO=OFF`、`PARALLEL_LINK_JOBS=1`）。

### 19.3 移植补丁（都在 `scripts/wasm-core/` 里，幂等）

改过 LLVM 源码的只有 3 处（`build.mjs` 的 `patchLlvmWasi`，未命中会告警）：

1. `Unix/Program.inc` 的 `Info.ru_maxrss` 按 `__wasi__` 排除 —— wasi 的 `struct rusage` 只有 `ru_utime/ru_stime`（`__struct_rusage.h` 里就一句 TODO）。
2. `llvm/include/llvm/Support/Compiler.h` + `clang/include/clang/Support/Compiler.h`：上游写的 wasm 分支是**大写 `__WASM__`**（Emscripten 的宏），clang 定义的是**小写 `__wasm__`**。不改则 `CLANG_ABI` 未定义，生成的 `Attrs.inc` 整片报「未知类型 CLANG_ABI」，clang 侧还没有 LLVM 那边 `#if !defined(LLVM_ABI)` 的兜底。**这是 44 个编译失败点里的绝大多数。**

兼容头（`compat-include/`，只挂内核构建的 `-I`，不进 sysroot）：

- `unistd.h` **必须先 `#include <sys/types.h>`**（wasi 的 unistd.h 自己不拉，缺它连 `<unistd.h>` 都编不过，CMake 的 `check_symbol_exists` 会把 `getpagesize`/`sysconf` 全判成不存在 → `#error Cannot get the page size`）；另补 `fchown`。
- `signal.h`：`SA_*`、`siginfo_t`、`kill`；`sa_sigaction` 第二参必须是 `siginfo_t*`（写成 `void*` 与 `Signals.inc` 的函数签名对不上）。
- `sys/wait.h`：`wait4` + `WNOHANG`。
- `LLVMSupport` 加一个生成源文件 `WASIPortStubs.cpp`：**`posix_madvise` 在 wasi-libc 里只有声明、没有实现**（`libwasi-emulated-mman.a` 里也没有），只能给真符号 —— 宏在 `::posix_madvise(...)` 前会展开成 `::0`。

### 19.4 工具链文件里三个必须记住的点

1. **`CMAKE_EXE_LINKER_FLAGS_INIT` 只播种缓存**：已配置过的构建目录改了工具链文件也不更新 → 看着改了、链接行没变。`CMAKE_EXE_LINKER_FLAGS` 要用 `CACHE ... FORCE`。C/CXX 的 `*_FLAGS_INIT` 同理。
2. **wasm-ld 默认栈只有 64 KiB**：`--version` 能跑、真编译立刻 `memory access out of bounds`。给 8 MiB（`-Wl,-z,stack-size=8388608`，与 Linux 默认一致）。
3. **`-lpthreads` 是假阳性**：`CMAKE_TRY_COMPILE_TARGET_TYPE=STATIC_LIBRARY` 让所有 `check_library_exists` 都「成功」，LLVM 于是把 `-lpthreads`（带 s）写进每个目标，而 wasi-sdk 只有 `libpthread.a`。加 `-DHAVE_LIBPTHREAD=OFF` 钉死。
4. 另外补了 `-D_WASI_EMULATED_GETPID -lwasi-emulated-getpid`（`getpid` 是 LLVM 自己用的，不补只有弃用告警）。

### 19.5 跑通口径（本机 Node `node:wasi`，探针在 `/tmp`）

- 冒烟：`clang.wasm --version` → `clang version 23.1.0`。
- **驱动模式**：`--target=wasm32-wasip1 --sysroot=<wasi-sysroot> -resource-dir=<sdk>/lib/clang/23 -fwasm-exceptions` → 编过；`wasm-ld.wasm -flavor wasm …` 链上 `noeh` 系会用变量带不了异常，**要 `-L …/lib/wasm32-wasip1/eh -lunwind`**；产物跑出 `before / caught: vector`。
  - 链接还要两样，缺了报的错都很误导：① `lib/wasm32-wasip1/crt1-command.o`，否则 `entry symbol not defined: _start`；② `-L <sdk>/lib/clang/23/lib/wasm32-unknown-wasip1 -lclang_rt.builtins`，否则 `libc++.a(locale.cpp.o): undefined symbol: __multi3`（128 位乘法在 compiler-rt 里，driver 平时替你加）。
- **站内真正用的 `-cc1` 直调**（必须与站内一致）：`-cc1 -triple wasm32-unknown-wasip1 -O2 -std=c++20 -fexceptions -fcxx-exceptions -exception-model=wasm -target-feature +exception-handling -target-feature +multivalue -target-feature +reference-types -mllvm -wasm-enable-eh -mllvm -wasm-use-legacy-eh=false -target-feature +simd128 -fno-rtti -resource-dir <…> -isysroot <…> -internal-isystem <…>/include/wasm32-wasip1/eh/c++/v1 -internal-isystem <…>/include/wasm32-wasip1 -internal-isystem <…>/lib/clang/23/include`。
  - `-cc1` 不认 `-fwasm-exceptions` / `-msimd128`（都是驱动旗标）：上面那组就是 `-fwasm-exceptions` 的 **exnref** 展开式。**不能用 legacy**：wasi-sdk 34 的 `eh` libc++ 是 `try_table`/`throw_ref` 编的，混用会被 V8 拒绝（§19.12）。
  - 缺 `-resource-dir` 时报 `stddef.h file not found`（内置头不随 sysroot 走）。
- **`lld` 是多合一驱动**：argv[0] 不是 `wasm-ld` 时必须显式 `-flavor wasm`，否则回 `lld is a generic driver`。接线时要决定是「拷成 wasm-ld 名字」还是「宿主传 `-flavor wasm`」—— 现在 `build.mjs` 拷的是 `bin/lld` → `wasm-ld.wasm`，运行时必须走后者。
- **`--no-threads` 已经不被 LLVM 23 的 wasm-ld 接受**（老 `LINKER_ARGS` 里有）：报 `unknown argument: --no-threads`，接线时直接删。**语言档位 2026-10-25 定为 `-std=c++20`**（上一条 `-std=c++17` 是阶段 0 的探针口径）。
- 耗时（本机 Node，含进程启动，**只作量级参考**）：cc1 编那段 `t.cpp` 墙钟 0.55s；链接 <0.2s；产物 425KB。**不要拿它当浏览器内数字**，§18 的 423–449ms（带 PCH）是浏览器口径。

### 19.6 阶段 0 的出口判据（已满足）

两颗内核编出来、`-cc1` 直调能编 C++17 + 异常、新 lld 能链、产物能在 WASI 里跑并捕到 `std::out_of_range`。**运行时接线仍是零**（`runnoSandbox.js` 一行没动），下一步是 `docs/新内核规划.md` 阶段 1（sysroot 取子集打包）——动它之前先拍板 §5 的第 1/2/6 项。

### 19.7 标准档位对体积与时间的影响（为 §5 第 2 项量的）

口径：站内那份万能头（`runnoSandbox.js` 的 `UNIVERSAL_HEADER`，30 个头）+ 一份典型题解（线段树 + map/unordered_map/set + iostream），`-O2` + 异常全开，本机 Node `node:wasi`；每项 3 轮交替取中位，进程启动与模块实例化（约 110 ms）计在时间列里。

| | PCH | PCH 构建 | 带 PCH 编译 | .o | 可执行 |
|---|---|---|---|---|---|
| `-std=c++17` | 14.38 MiB | 891 ms | 825 ms | 13 KiB | 3.15 MiB |
| `-std=c++20` | 17.75 MiB | 1068 ms | 857 ms | 13 KiB | 3.15 MiB |
| `-std=c++23` | 20.67 MiB | 1350 ms | 908 ms | 13 KiB | 3.15 MiB |

- **传输体积三档完全一样**：标准是编译旗标，sysroot 是同一份头文件与 `libc++.a`，下载量一分不多。
- **差的只有 PCH**：20 比 17 多 2.92 MiB（+16.5%），23 比 17 多 6.29 MiB（+44%）。PCH 落在 IndexedDB（`pchStore.js`），直接吃浏览器配额；构建时间也跟着涨（+52% 从 17 到 23）。
- **用户产物体积三档一致**：同样的 .o、同样的可执行，标准档位不改变链接进来的代码量——只有真用了 23 新库（`<expected>`/`<print>`/`<mdspan>`）才会多，实测那份用到三样的程序 .o 是 128 KiB、可执行 3.20 MiB（+46 KiB）。
- 顺带对照：现役 clang 8 的 PCH 是 8.6 MB（`runnoSandbox.js:218`），新内核**哪怕 c++17 也到 14.38 MiB（1.67×）**，c++23 是 2.4× —— 这是换内核必然要吃的缓存/内存增量，与选哪档无关。
- **2026-10-25 拍板：标准档位选 `c++20`**（覆盖竞赛所需，比 23 少 2.92 MiB PCH、PCH 建得快 26%）。按部署挂载口径（`/sys/...` 短路径 + 精简 sysroot）复测 PCH 是 **17.54 MiB**；与表里 17.75 的差来自头搜索路径与文件管理器缓存的存档内容，线上按 17.5 估。
- 23 的能力已验：`std::expected` / `std::mdspan` / `std::print` 三样在本 sysroot 下 `-std=c++23` 编、链、跑全通过（输出 `42 4`）；`-std=c++20` 下 `expected`/`mdspan` 报「no member named」——档位是真实可见的能力边界，不是纯标签。
- **接线提醒**：站内 `FRONTEND_ARGS` 里的 `-fmessage-length 80` 在 clang 23 的 cc1 里**已被删除**（报 `unknown argument`），换内核时要摘掉；`-ferror-limit` 仍可用。

### 19.8 整包体积：内核 + 精简 sysroot（阶段 1 已落地，2026-10-25）

两颗内核默认 `llvm-strip --strip-all`（已固化进 `build.mjs`）；sysroot 由 `scripts/wasm-core/pack-sysroot.mjs`（`npm run wasm:core:pack`）取子集后打包，归档内 `.a`/`.o` 一律 `--strip-debug`。同一条命令把两颗内核也压成 `.br`，分发物料一次出齐（`sys23-fs.tar.br` / `clang.wasm.br` / `wasm-ld.wasm.br`）。

| 组成 | 现役 8.0.1 | 新内核（当前默认产物） |
|---|---|---|
| `clang.wasm` raw / br11 | 29.77 / 7.09 | 73.71 / **13.58** |
| `wasm-ld.wasm` raw / br11 | 18.59 / 4.60 | 41.49 / **8.11** |
| sysroot 归档（线上实际编码） | 1.71（gz，identity） | **1.54**（br，identity） |
| sysroot 解包 / 条目 | 9.49 MiB / 416 | **11.67 MiB / 1385** |
| **首访传输** | **13.40** | **23.23** |

（br11 一律指 `quality=11, lgwin=24, size_hint=原文长度`；默认 lgwin 22 会多出 3–4%，别混用两套数。）

- 上一轮表里的「原样 33.37 / 剥调试段 26.03 / `-Oz` 25.65」是拿手工 28 MiB 子集量的。本轮把 `noeh`、`__cxx03`、clang 内置头（8.27 MiB → 316 KiB）、printscan 变体、全部 `.so` 都裁掉后，sysroot 从 3.56 降到 **gz 2.25 / br 1.54 MiB**。
- **sysroot 分发改用 brotli**：同一份 tar（15.57 MiB），gz9 2.23 / br11 1.54（−31%）。`pack-sysroot.mjs` 现在直接产出 `sys23-fs.tar.br`，浏览器按 `Content-Encoding: br` 解出来就是 tar 字节，客户端不需要自己解压。⚠ **不能指望 `DecompressionStream`**：Chrome 155 实测只认 `gzip` / `deflate` / `deflate-raw`，`br` 与 `brotli` 两个名字都抛 `Unsupported compression format`（2026-10-25 无头 Chrome 探针）。要自己解就只能带一份 wasm 解码器，不值得。
- **预压 br 的真正收益是绕开 Vercel 的压缩档位**：§18.1 线上实测现役 clang 传 9.77 MiB，而本机 br11 只有 7.09 —— 线上那份 br 比 q11 差 **~1.38×**。新包若交给 Vercel 自己压，按同比例外推首访 ~32–33 MiB；预压成 `.br` + `Content-Encoding: br` 则把首访钉在 **23.23 MiB**。这条**尚未在 Vercel 上验证**（要 preview 部署看响应头会不会被改写），阶段 5 必测。
- 预压链路本身已在浏览器里验过（2026-10-25 无头 Chrome 155）：本地服务器给 `clang.wasm.br` 加 `Content-Encoding: br` + `Content-Type: application/wasm`，页面 `fetch` + `WebAssembly.compileStreaming` 直接成功（28 个 import / 180 ms）；**反证**：同一份字节去掉响应头，立刻 `CompileError: expected magic word 00 61 73 6d, found cf ff ff 7f`。所以「部署后响应头丢了」的症状一眼可辨，不会悄悄降级。
- **Cache Storage 存的是解码后字节**（2026-10-25 探针：1.54 MiB 的 br 响应放进桶，`storage.estimate()` 涨 15.6 MB，且命中响应的头里没有 `Content-Encoding`）。所以新工具链的 `cp-toolchain` 稳定态从 48.36 MiB 变成 **~131 MiB**（115.20 内核 + 15.57 sysroot tar）。配额上仍可行，但 iOS 的 7 天清理策略下这已经是「大头」，别再把 PCH（17.54 MiB，IndexedDB）也算进同一桶的预算。
- 线上折算：现役线上 17.75 对本地 13.40（≈1.32×）→ **不预压则 ~32–33 MiB（外推）**；预压后与本地一致 23.23（前提是响应头生效）。
- 常驻：解包 11.67 MiB 按 §18.2 的 2.3× 外推 ≈ **+27 MiB**（重裁前 28 MiB 那份是 +90 量级）——阶段 4 仍要改挂载方式，但压力已从「不可接受」回到「与现役同量级」。
- `--strip-all` 零运行时代价，已复验：`-cc1` 编译、PCH 生成、`wasm-ld` 链接、产物运行（含 `throw/catch`、`%Lf`、`__int128`）全部通过；代价只是 wasm 崩溃栈只剩 `wasm-function[N]`。`-Oz` 仍不作默认（编译慢 1.69×，只再省 ~0.4 MiB）。
- **archives 已无可再剥的空间**：上游 `libc++.a` 9.04 MiB → `--strip-debug` 1.52 MiB（已进包）；再 `--strip-all` 只剩 0.85 MiB，但会删掉归档符号索引、链接器直接找不到成员 —— 不可用；`--strip-unneeded` 反而只到 8.62 MiB。`libc++abi.a` / `libc.a` 同理。
- **C++20 的 PCH 在精简包口径下是 17.54 MiB**（§19.7 的 17.75 是 SDK 全量路径口径），落在 IndexedDB，不进传输。

#### 为什么 runno 那个包明显小（体积账）

| 段 | 旧 clang.wasm | 新 clang.wasm（原样） |
|---|---|---|
| code | 24.01 | 66.80 |
| data | 5.56 | 6.69 |
| name | ~0 | 26.38 |
| debug | ~0 | 3.50 |

- **主因是 LLVM 8 → 23**：只算 code 段，clang **2.78×**、lld **2.69×**。这 15 个版本的前端、后端、诊断都在长；旧包没有 C++20 库、没有异常 —— 能力差距就是这部分体积。
- **次因是旧包本来就没 name / debug 段**：新包原样 166.17 MiB 里，name 43.98 + debug 6.98 = **50.96 MiB**；`--strip-all` 后 115.20 MiB。旧包 48.36 MiB 里几乎没有这类内容。
- **sysroot 已回到同档**：1.71 / 9.49 / 416 对新 2.25 / 11.67 / 1385。条目多是 libc++ 20 把实现头拆细了（旧 libc++ 8 是 196 个扁平头），字节数只多 2 MiB。
- 结论：**「小」买的是「旧」**。要 C++20 + 异常，code 段这 2.7× 躲不掉；能免费拿的 50.96 MiB（name/debug）已经拿了。

**阶段现状、未完成清单与新旧方案逐项对比见 `docs/新内核报告.md`（2026-10-25）。**

### 19.9 阶段 3：能力与判定验收（`verify.mjs` 落地，2026-10-25）

> 本节是**首轮**结果（参数里还没有 `+simd128` / `-fno-rtti`）。用户 2026-10-25 拍板后按最终参数复跑、并新增 §9 #22–#24 的结果见 §19.10，**数字以 §19.10 为准**（能力组 13/13、判定组 23/23）。

入口：`npm run wasm:core:verify`（= `node scripts/wasm-core/verify.mjs`）。默认两组都跑，`--group=capability|judge` 可分组；`--case=7,9` 选判定用例、`--case=cap2,cap12` 选能力用例；`--keep` 留临时目录，`--verbose` 打参数与用例注记。

**宿主是 Node 22 的 `node:wasi`（preview1），不是站内 runno。** 它把 `sys23-fs.tar.br` 解到临时目录并 preopen 成 `/sys`，`/work` 放 `.cpp` / `.o` / `.wasm`。这样在阶段 2 接线之前就能验「内核 + 精简 sysroot + 判定语义」，代价是**不能拿它证明 runno 宿主的行为**——接线后要再用 `npm run verify:judge` 走一遍浏览器宿主。cc1 的 exnref 异常参数组与 §19.5 一致，另与站内对齐：`-std=c++20 -O2 -DONLINE_JUDGE`，栈按 §5.3（256 MiB 上限 → 64 MiB），`--max-memory=268435456`，探针 `oom.o` 塞在 `-lc` 前。

**结果（2026-10-25 本机，node v22.22.2）**

| 组 | 结果 |
|---|---|
| 能力组 | **12/12 PASS**（拍板参数后的 13/13 见 §19.10） |
| 判定组（§9，跑 20 条 + #20 跳过） | **20/20 PASS**，0 KNOWN（#22–#24 见 §19.10） |

能力组里值得单独记的三条：

- **`cout << long double` 已经不是问题**：`2.5L` 输出 `2.5`、`printf("%.2Lf")` 输出 `2.50`。§7 / `HANDOFF.md:820` 那条「libc++ 的 `num_put` 只会打 0」是 libc++ 8 的毛病，libc++ 20 已修；用例从「只要求跑完」收紧成硬期望 `2.5 / 2.50`。
- `std::regex`、`to_chars/from_chars`、`<format>/<ranges>/<span>/<numbers>`、`random_device`、`__int128`、`powl`、`%a` 均按预期。
- `std::filesystem::current_path()` 在 WASI 下返回 `/`（没有真正的 cwd），用例只要求「编过、跑完」。

判定组与站内 `verify-judge` 的差异（都是换内核带来的语义变化，**接线时要跟着改判分**）：

- **abort / 空指针 / 除零在 Node 宿主里是 `trap`，不是 exit 134**：`unreachable`（#7/#9/#10）、`divide by zero`（#8）、`Maximum call stack size exceeded`（#11）、`memory access out of bounds`（#21）。`verdictOf` 按规范 §8 走「trap 且 `sbrk>0` 才是 MLE，否则 RE」，20 条全对。
- **#5 的写法必须改**：clang 23 在 `-O2` 下能看出「memset 之后只读回一个恒为 1 的字节」，把 `malloc + memset` 整段删掉（clang 8 不会），循环退化成空转 → TLE。改成 volatile 指针逐页写之后，实测 `trap + sbrk=2 + 240.1 MiB`、11 ms 判 MLE。**以后写 MLE 用例照这个写。**
- #6 仍是假 AC（`vector(1<<28)` 只打印 size，`sbrk=0`，分配被消除），与规范 §9 的已知偏差一致。
- 每条程序起始线性内存都是 **64.1 MiB**，即 §5.3 的 64 MiB 栈；#18/#19 的 1 GiB `malloc` 记为 `sbrk=2`。

**验证台自己踩的三个坑（复跑或改脚本前先看）**

- 覆写 `fd_write` 必须把非 1/2 的 fd 原样交回 `wasi.wasiImport.fd_write`（`fd_read` 同理只截 0）。否则 clang 的 `-o` 输出被吞，`.o` 变成 0 字节，`wasm-ld` 报 `unknown file type`。
- **常驻 worker 不能跨用例复用**：每次 cc1 / 链接都是一颗新 wasm 实例、堆峰值 GB 级，而 Worker 不接受 `--expose-gc`；十几次之后下一次内存增长直接 SIGSEGV（实测 cap11+cap12 连跑必崩，单独跑都过）。现在每条用例跑完 `retireToolWorker()` 重开一颗（重编模块实测 64 ms），并忽略主动退休那颗 worker 的 `exit` 事件。
- `verdictOf` 必须先看 `timedOut` 再看 `!ok`：看门狗 kill 的 worker 也回 `ok:false`，顺序反了会把 TLE 记成 ERR。

**没覆盖的**：wasm vs native 倍率表（要桌面壳的 `native` 引擎，阶段 3 的剩余项）、浏览器里真跑新内核（阶段 2 之后）。`+simd128` / `-fno-rtti` 的复跑见 §19.10。

### 19.10 阶段 3 复跑：拍板参数 `+simd128` / `-fno-rtti` 与 `new` 失败路径（2026-10-25）

用户 2026-10-25 拍板：`-msimd128` 开、`-fno-rtti` 开、双档并存、一次性换默认；异常开启后的 MLE / RE 按 `评测判定规范.md` 与权威测评机口径执行。本节只记**参数怎么落、实测结果**。

**参数（`scripts/wasm-core/verify.mjs`，与阶段 2 的目标值一致）**

- cc1 追加两条：`-target-feature +simd128` 与 `-fno-rtti`。⚠ **`-msimd128` 是驱动旗标，`-cc1` 直接报 `unknown argument: '-msimd128'`**（实测），必须写 target feature。
- 链接行不变：不漏 `-lunwind`，也**不加** feature 旗标 —— wasm-ld 按对象里的 `target_features` 带入，`wasm_simd128.h` 用例能编、能链、能跑就是证据。
- 其余照旧：`-std=c++20 -O2 -w -DONLINE_JUDGE`、exnref 那组 wasm 异常参数（`+multivalue` / `+reference-types` / `-wasm-use-legacy-eh=false`）、`crt1-command.o`、`eh/` 的 `-L`、sbrk 探针、§5.3 栈公式、`--max-memory`。

**结果（本机，node v24.16.0；物料 clang 73.7 MiB / wasm-ld 41.5 MiB / sysroot 1.5 MiB br）**

| 组 | 结果 |
|---|---|
| 能力组（新增 `13 simd128`） | **13/13 PASS**；`wasm_i32x4_add` 输出 `11 22 33 44`，编 227 ms / 链 31 ms |
| 判定组（§9 + #22 / #23 / #24） | **23/23 PASS**，#20 跳过，0 KNOWN / 0 FAIL |

新增三条判定用例（`评测判定规范.md` §9 #22–#24，**仅 23 档**）：

- **#22 `new` 连到底、`bad_alloc` 未捕获 → `MLE`**：trap 是 wasm 异常（`[object WebAssembly.Exception]`），`sbrk=2`、线性内存 240.1 MiB、运 36 ms。旧的 8.0.1 档同一程序会跑到 TLE（`new` 失败只返 NULL）。
- **#23 同一循环但 `catch (bad_alloc)` 后正常退出 → `AC`**：`exit 0`、`sbrk=2`、240.1 MiB、运 12 ms。判据是「内存上限有没有直接终止进程」——没有，就按程序自身结果判（同 #18 的 `malloc` 返回 NULL 后 AC）。
- **#24 `dynamic_cast` → `CE`**：`-fno-rtti` 的直接代价，报错 `use of dynamic_cast requires -frtti`；8.0.1 档能编过。
- `-fno-rtti` 没有破坏异常路径：`try/catch`（#1 / cap01）、`catch (const std::bad_alloc&)`（#23）与 libc++ 的 `type_info` 都正常。

**复跑**

```bash
npm run wasm:core:verify             # 13 + 23 条；约 1 分钟
npm run wasm:core:verify -- --case=cap13,22,23,24 --verbose
```

**仍然没覆盖**：wasm vs native 倍率表（`-O2` / `+simd128` 两档 × 2M 排序 / 384³ 矩阵乘 / 160 MB memset）、浏览器里的 EH + SIMD 探测（Safari 16.4 下限）。证据日志在 `/tmp`，一次性。

### 19.11 体积预算与双档缓存：接受 + 恢复预取 + 稳态单档（2026-10-25 拍板）

用户拍板：首访 **23.23 MiB**（线上若不认 `Content-Encoding: br` 则 ~32–33）与常驻 **~27 MiB** 都接受；**恢复后台预取**；双档并存，但**不要把两套 C++ 工具链同时留在本机**。

**预取（要恢复的行为）**

- 默认对 C++ 生效：`cp.autoPreload` 缺省视为含 `cpp`，显式 `[]` 才是用户关闭；Python / 题解渲染器仍按勾选，不默认拉。
- 必须等 `navigator.serviceWorker.ready` 且页面已被 controller 接管，再等 idle 才动手 —— 现在 `scheduleAutoPreload()` 只看 idle，首访时 SW 还没接管，那几发 fetch 不进 `cp-toolchain`（§18.6 实测首访桶里只有 2 条）。失败静默、不阻塞首屏，复用 `runtimePreload.js` 的串行队列。
- 预取只下**当前档**的三件资产，不下另一档。**只下到 Cache Storage，不调用 `preloadToolchain()`**：那条路会 `untar` 成 Map 常驻（实测 +19.28 dev / +24.10 线上），等于让每个访客都为没用到的语言付内存；首次点▶再解包 + 实例化（回访 505 ms 就是这个口径）。

**稳态只留一套**

- **仓库里仍放两份**（旧 8.0.1 约 50 MiB + 新档裸 115.2 MiB、sysroot tar 15.57 MiB；`public/wasm/8.0.1/` 是回退档，这是双档并存的前提）；这一条说的是**客户端存储**：稳态下 `cp-toolchain` 只存当前档，不是两档各存一份。
- 启动先定档（EH + SIMD 探测，§19.10 / 规划 §5 第 7 项），`TOOLCHAIN_VERSION` 从模块常量变成运行期选档；`runtimeAssetURLs` / `probeRuntime` / `preloadToolchain` / 语法诊断的资产地址全部按当前档。
- **新档预取成功后才清旧档**；预取失败保留旧档给 runno 回退。清理三处：`cp-toolchain*` 里旧档 URL（沿用 `purgeRuntimeCache` 的「扫所有前缀桶 + 按 URL 删」写法）、PCH 旧 id（`pchStore` 的 `save` 已经先 `clear`，切档时再显式清一次）、`compileCache` 里旧内核的产物（缓存键里加内核档位）。
- 稳态账：`cp-toolchain` 单档 ≈ 73.71 + 41.49 + 15.57 ≈ **131 MiB 解码后字节**；PCH 17.54 MiB；两档同时留会翻倍，所以这条是硬约束，不是优化。
- **清不掉 HTTP 缓存**：浏览器没给 JS 接口。SW 控制下以 Cache Storage 为准，旧档字节可能还在 HTTP 缓存里直到浏览器自行淘汰 —— 文档只承诺「Cache Storage 单档」，别承诺「本机一个字节都不剩」。

**代码现状（落地时照这个改）**

| 位置 | 现状 | 要做 |
|---|---|---|
| `src/services/runtimePreload.js` | **已完成（2026-10-25）**：缺省 `['cpp']`；等 SW `ready` + controller；`prefetchRuntimeAssets()` 只下不解包；自动化 / `saveData` 跳过；每次先清旧档 | 无（阶段 6 接 active track 后按当前档预取） |
| `src/services/runnoSandbox.js` | `prefetchRuntimeAssets()` + `pruneLegacyToolchainCache()` 已落地；`TOOLCHAIN_VERSION` 仍写死 `23.1.0` | 阶段 6：运行期选档、`runtimeAssetURLs` 按档、PCH/编译缓存切档清理 |
| `src/components/EditorSettingsPanel.vue` | `autoPreload` 默认 `['cpp']`，与启动行为一致 | — |
| `src/services/pchStore.js` | `save` 先 `clear`；`get` 命中才清旧版本；`PCH_CACHE_VERSION` 6 | 阶段 6：切档时显式清旧 PCH |
| `src/sw.js` / `storageNames.js` | 一个 `cp-toolchain` 桶，`activate` 只保桶名 | 阶段 6：按 URL 删旧档；若要整档清，再考虑分桶与迁移 |

**验收口径**：预取完成时间、就绪后点▶等待、首访立刻点▶等待三条分开量；切档后扫 `caches.keys()` 与各桶条目，确认只剩当前档三件 + 当前 PCH。

### 19.12 阶段 2：前端接线到 23.1.0（dev 已通，生产未发；编译性能待阶段 4）

**已落地（2026-10-25）**

- `public/wasm/23.1.0/` 三件预压资产：`clang.wasm.br` 13.58 MiB / `wasm-ld.wasm.br` 8.11 MiB / `sys23-fs.tar.br` 1.54 MiB。`runnoSandbox.js` 的 `TOOLCHAIN_VERSION`、三个 URL、头路径、cc1 / 链接参数全换。
- `vite.config.js` 的 `cp-wasm-brotli-assets`：dev / preview 给 `.br` 补 `Content-Encoding: br` + `application/wasm` / `application/x-tar`；`vercel.json` 加了同口径的两条 headers（**preview 部署上是否被 Vercel 改写仍未验**）。
- `PCH_CACHE_VERSION` 4→5；`compileCache` 键加 `toolchain`；`native.rs` 的 `-std` 升 `c++20`；`unpackSysroot` 加 ustar 校验（响应头丢了会报 `error.sysrootNotTar`，不再静默解出空 fs）。
- `scripts/patch-wasi-clock.mjs` 新增 `cp-enoent-patch`（见下第 2 条）。

**三个必须记住的事实**

1. **异常必须走新标准 exnref**。wasi-sdk 34 的 `eh` libc++ 是用 `try_table` / `throw_ref` 编的（`llvm-objdump` 实测 vector.cpp.o）；用户代码停在 legacy 会被 V8 在实例化时拒绝：
   `module uses a mix of legacy and new exception handling instructions`。
   cc1 的完整展开式（`-fwasm-exceptions` / `-msimd128` 都是 **driver** 旗标，cc1 不认）：
   `-fexceptions -fcxx-exceptions -exception-model=wasm -target-feature +exception-handling -target-feature +multivalue -target-feature +reference-types -mllvm -wasm-enable-eh -mllvm -wasm-use-legacy-eh=false`；
   另加 `-triple wasm32-unknown-wasip1`（新 cc1 没有内置 host triple，不给会 `unknown target triple 'unknown'`）。
2. **runno 把「文件不存在」返回成 `ENOTCAPABLE`**，clang 23 的 `__has_include(<features.h>)` 把它当 fatal error（`cannot open file ... Capabilities insufficient`）。补丁把 drive 的 `path_open` / `pathStat` 缺文件返回改成 `ENOENT`；不改这条，新内核在 runno 里连 `<cstdio>` 都过不去。`npm run wasi:clock-patch --check` 会守这组补丁。
3. **编译段 13–17 s**（基线 505–715 ms）。分阶段探针：download 1.8 s → compile 13.4 s → run 0.013 s；编译缓存命中后 JS 侧 156 ms、运行 133 ms。慢在 runno 每次 `runWasi` 都新起 worker、重新实例化 73 MB clang / 41 MB wasm-ld，并把整份 **1385 条 sysroot** structured clone 过去 —— **阶段 4 的宿主常驻 + 一次 untar 才能解**。

**验收**

- `npm run verify:judge`：**20/20 PASS、0 KNOWN、0 FAIL**。#5 的用例改成 volatile 逐页写（clang 23 在 -O2 下会把 `malloc+memset` 整段删掉，退化成 TLE —— 与 `scripts/wasm-core/verify.mjs` 的 #5 同一份写法）。
- PCH 生成成功（**18,372,440 B**），`checkCppSyntax` 可用；SIMD 用例在浏览器跑出 `11 22 33 44`；`throw/catch`、`<format>/<ranges>` 都过。
- 2M 排序自报：**已排序输入 14–36 ms**、**随机输入 100–135 ms**。§18 的 28–34 ms 不能直接与随机输入比，先别把它当回归。
- dev / preview 的 `.br` 响应头都实测到 `Content-Encoding: br` + 正确 MIME；生产 bundle 真跑没做（hashed 模块不能在页面里 import `/src/`）。

**留给后续**

- 阶段 6：双档探测与回退（`TOOLCHAIN_VERSION` 现在仍写死 `23.1.0`）、生产部署上验 br 头、guide / NOTICE / 使用手册口径。
- 阶段 4：**已完成（§19.13）**，首编 13–17 s 的账已收回。
- 阶段 5：客户端单档缓存与后台预取。

证据：`npm run verify:judge` 的 20/20 输出；`/tmp/stage2-*.mjs` 与 `/tmp/probe1x.mjs` 探针（一次性）。

### 19.13 阶段 4：自写 WASI 宿主接线（2026-10-25，C++ 全链路）

**落地物**

| 文件 | 作用 |
|---|---|
| `src/services/wasi/host.js` | WASI preview1 语义 + `MemoryFs`：fd 表、预开 `/`、`path_open`/`fd_read`/`fd_write`/`fd_seek`/`poll_oneoff`/`proc_exit`/`clock`/`random_get`；未实现调用返回 ENOSYS |
| `src/services/wasi/wasi.worker.js` | 常驻 worker：init 时 fetch 三件 `.br`、untar 1385 条、编译 clang / wasm-ld 两个 `WebAssembly.Module`，并预编 OOM 探针；之后只换 argv / 源码 |
| `src/services/wasi/client.js` | `WasiWorkerHost`：单队列、消息编号、stdout/stderr 增量、`kill()` = `worker.terminate()` |
| `src/services/wasi/tar.js` | 极简 ustar 解析（`ustar` 魔数校验） |

`runnoSandbox.js` 的 C++ 路径全换：`compileAndLink` / `loadOomProbe` / `generatePch` / `checkCppSyntax` / `runCpp` 都走 `tool.host`；runno 的 `WASIWorkerHost` 只剩 Python。`PCH_CACHE_VERSION` 6。

**实测（dev，无头 Chrome 155）**

| 指标 | 基线 | 现在 |
|---|---|---|
| `preloadToolchain()`（init + 探针预编） | 81 ms（热 HTTP 缓存） | **655 ms**（一次性） |
| 首编（已 preload） | 505–715 ms | **855–1234 ms**（1.2–1.7×，视机器抖动；含第一次 lld 冷启动） |
| 之后不同代码冷编 | 505–715 ms | **502–608 ms** |
| 2M 随机排序自报 / 运行段 | 28–34 / 37–41 ms | **36–40 / 37–43 ms** |
| stdin 1 MiB / 4 MiB 墙钟 | 1 MiB ≈ 643 ms | **2–4 ms / 5–8 ms** |
| 5 MB 输出宿主收口 | 270–360 ms | **62–80 ms**（`runMs` 22–29 ms） |
| `verify:judge` | 20/20 | **20/20 PASS** |

**三个宿主坑（都已在代码里修，别再踩）**

1. **目录的 `rights_inheriting` 要带文件权限**。wasi-libc 的 `open()` 拿目录的 inheriting 拼 `path_open` 的 `rights_base`；`fd_fdstat_get` 只回 `DIR_RIGHTS` 时，clang 写 `.o` 的 `path_open` 不带 `FD_WRITE`，`fd_write` 直接 `EBADF`，报 `unable to open output file '/program.o'`。`host.js` 的目录分支已改成 `DIR_RIGHTS | FILE_RIGHTS`。
2. **PCH 源头的 mtime 必须固定**。`MemoryFs` 默认 `Date.now()`，PCH 生成与加载两次写 `/stdc++.h` 的 mtime 不同，会报 `/stdc++.h has been modified since the precompiled header was built`。worker 用常量 `1_700_000_000_000`。
3. **自写宿主的 fd 2 是 CHARACTER_DEVICE**，clang 23 会默认开彩色诊断；`FRONTEND_ARGS` 显式加 `-fno-color-diagnostics`（否则 CE 卡片会出现 ANSI 码）。

**其它口径**

- `kill()` 直接 terminate worker；下一次 `loadToolchain` 看到 `host.alive === false` 会重建并重新 init（TLE 用例 #4 之后 #5 仍 20/20，说明重建路径可用）。
- `generatePch` / `checkCppSyntax` 与运行共用同一颗 worker，client 内部串行队列；不会互相覆盖 pending。
- 2M 随机排序这次回到 37–43 ms，说明阶段 2 那 100–135 ms 是 runno worker 环境的账，不是代码生成。
- **未做**：生产 bundle 真跑（`npx vite build` 已出 `wasi.worker-*.js`，没在 preview 上点过）；页面净增内存的 UaMem 复测；双档（阶段 6）。阶段 5 的预取见 §19.14。

### 19.14 阶段 5：后台预取 + 客户端单档（2026-10-25，本地 preview 已验）

**已落地**

- `runtimePreload.js`：
  - `cp.autoPreload` **缺省视为 `['cpp']`**（键不存在才用缺省；显式 `[]` 才是用户关闭），`EditorSettingsPanel` 的默认值同步成 `['cpp']`。
  - 等 `navigator.serviceWorker.ready` + `controllerchange` 后再 idle 动手；`navigator.webdriver`（自动化探针）与 `navigator.connection.saveData` 直接跳过。
  - 预取走新增的 `prefetchRuntimeAssets()`：**只 fetch 三件并丢弃 body**，不 init 宿主、不 untar —— 不会让每个访客为没用到的语言付 ~27 MiB 常驻。
- `runnoSandbox.js`：`prefetchRuntimeAssets()` + `pruneLegacyToolchainCache()`；`loadToolchain` 初始化完成后也会清一次旧档。
- 旧档清理：每次 `runAutoPreload()` 先删 `cp-toolchain*` 里的 `/wasm/8.0.1/{clang.wasm,wasm-ld.wasm,clang-fs.tar.gz}`，所以当前档已缓存时也不会把 8.0.1 留在桶里。HTTP 缓存没有 JS 接口，只能承诺 Cache Storage 单档。

**本地 `vite preview` 实测（生产 bundle + SW）**

- 首访 SW 还没 controller；刷新一次后 controller = true，`scheduleAutoPreload` 在 idle 后把三件 **23.1.0** 写进 `cp-toolchain`。
- 手工往桶里播种 8.0.1 三件后刷新：预取跑完只剩三件 23.1.0，旧档被删干净。
- `.br` 响应头在 preview 上仍是 `Content-Encoding: br` + `application/wasm` / `application/x-tar`。

**还没做**

- **Vercel preview 上的 `Content-Encoding: br`**：本地中间件对，Vercel 会不会改写仍未验。
- **限速下的三条时间**（预取完成 / 就绪后点▶ / 首访立刻点▶）与首访三次独立实测。
- **PCH 不预取**：后台预取只下资产，首次点▶仍要 0.5–1.2 s 编译；PCH 只有在 `preload()` 手动下载或首次运行后的 `warmupPch()` 才生成。
- 双档 active track 的动态预取（阶段 6）。

## 20. 判定接口：比对器插件 / 每题覆盖 / 引擎口径统一（2026-10-25）

依据是 `docs/评测判定规范.md`（§6 / §7.2 / §8 / §9）。这一节只记「落到哪、为什么这么落、验到了什么」。

### 20.1 比对器注册表 `src/services/checkers.js`（新文件）

- 四个 id：`lines`（默认，原 `compare.js` 口径一行不动）、`tokens`（按空白切词）、`float`（词元一致 + `1e-6` 混合容差）、`unordered`（行多重集）。`checkOutput(actual, expected, id)` 是唯一入口；**未知 id / 空 / `lines` 一律退回逐行**，不报错、不放宽。
- 比对只发生在引擎给 `ok`（exit 0）之后，TLE / MLE / RE 不经过它（`runner.js` 的 `evaluateCase`）。
- 显示名走 i18n key（`tests.checker.*`），数据表里不存中文；`FileExplorer.vue` 消费时才 `t()`。
- **按题覆盖**：`meta.checker`（`problemMeta.normalizeMeta` 白名单，`lines` 与空串不落盘）。资源管理器右键「题目信息」里新增「输出比对」下拉，默认项是「默认（逐行）」；题目信息 tooltip 多一行 `输出比对：<名>`。`App.vue` 用 `effectiveChecker`（`meta.checker || 'lines'`）传给 `runCases`，`runAll` / `runOne` 两条路都接。
- 另外修了题目信息弹窗的高度：多一个字段后 `.meta__card` 加 `max-height: calc(100dvh - 32px); overflow-y: auto`，矮屏不会顶出视口。

### 20.2 引擎口径（都按规范 §2.1 / §4.2 / §8）

- `judge0`：`statusId === 3`（Accepted）时**忽略 stderr**（选手往 cerr 打调试不算 RE）；`durationMs` 取服务端 `time`（CPU 秒，字符串），编译失败 / 拒绝 / 不可达一律 `null`，不再拿 HTTP 往返顶替；health 在拿不到时间时显示「服务可用」而不是空耗时。
- `piston`：exit 0 时忽略 stderr；`durationMs` 取 `wall_time`，缺失退 `cpu_time`，都没有就 `null`；编译失败 / 拒绝 / 不可达 `null`。
- 内存披露：引擎注册表新增 `enforcesMemoryLimit`（wasm=true、judge0=true、native/piston/echo=false），`EngineSettingsPanel` 对「跑代码但不兑现」的引擎显示一行「该引擎不兑现内存上限，不会判 MLE。」（`engine.noMemoryLimit`），不把界面上的内存设置静默吞掉。
- `-DONLINE_JUDGE`：网页端放进 `runnoSandbox.js` 的 `FRONTEND_ARGS`（**属于语言选项、会写进 PCH 签名**，所以 `PCH_CACHE_VERSION` 3 → 4），桌面端 `native.rs` 编译参数同步加一条 —— 跨端契约，两处必须一起动。

### 20.3 自动验收 `scripts/verify-judge.mjs`（`npm run verify:judge`）

- 起真实 dev server + 无头 Chrome（`--no-sandbox --disable-gpu`、`protocolTimeout: 900000`），先验 `crossOriginIsolated` 与 wasm health，再在页面里 `import('/src/services/runner.js')` 直接调 `evaluateCase`（真工具链、真看门狗），逐条跑 §9 的 19 条（#20 无 OLE，跳过）+ 12 条比对器语义。带 `knownActual` 的行只要求「等于已知值」，别的值才算回归。
- **2026-10-25 实测：PASS 16 / KNOWN 3 / FAIL 0**；耗时 1 s / 内存 256 MiB。证据：`/tmp/verify-judge2.log`（一次性）。
- 三条 KNOWN 都是同一件事：runno 把 `WebAssembly.RuntimeError` 折成 134 且**不保留 trap 原因**，于是「开上限 + 134 + 空 stderr」把空指针写入（#7）、运行期除零（#8）、`abort()`（#9）全判成 MLE。规范 §5.2 / §10 P0 已把这条记成「134 启发式」，精确口径要沿 `scripts/patch-wasi-clock.mjs` 那条路再补一个宿主补丁（trap 时带回 `memory.buffer.byteLength`），本轮没做。**已被 §20.4 收掉：三条现在都判 RE，验收 20/20 PASS。**
- 写用例时踩到的两个编译器事实（**以后写验收用例别再踩**）：
  - **`malloc` 的判空会被 `-O2` 整个删掉**：clang 把 `malloc` 当已知库函数、默认返回非空，`if (!p)` 连同分配一起消失（host clang 21 与站内 clang 8 都实测；裸声明 `void *malloc(unsigned long)` 也一样）。#18/#19 的指针必须写 `volatile`，才是真的在测「拿到 NULL 怎么走」。
  - **常量被除数的 `/` 会被改写成不陷阱的 select**：`1 / z`（即使 `z` 是 volatile 的 0）实测得 `0`、exit 0；只有两个操作数都来自运行期，才落成真的 `i32.div_s` → trap。§9 #8 因此改成两个 volatile 操作数。
- 回归口径：`npm run verify` 仍守界面流程，本轮实测 **A/E/G/H 红、B/C/D/F 绿**，与 2026-10-24 时钟补丁那批复测同一基线。A 的原因与判定无关：侧栏页头现在多了第三颗可见页签「组件」，脚本里 A 仍钉死「胶囊 + 设置」两颗；E/G/H 本来就是红的。`npm run verify:judge` 守判定语义，两者互不替代。`npx vite build --outDir /tmp/bishe-build-judge2` 已过（不走 `npm run build`：它会在 safe-delete 的 50 文件阈值上挂掉）。

### 20.4 判定口径对齐：栈策略 / MLE 证据链 / TLE 宽限（2026-10-25，验收 20/20）

依据 `docs/评测判定规范.md` §4.2 / §5.2 / §5.3，把三处「文档写了、实现没跟上」补齐。约定一直没变：`durationMs` 只表示运行段，MLE 必须有内存证据，TLE 用程序结束时刻而不是消息时刻。

**栈（§5.3）**
- `runnoSandbox.stackSizeBytes(memoryLimitBytes)`：`min(64 MiB, max(8 MiB, limit/4), limit/2)`，向下取整到 64 KiB；`linkerArgs()` 里用 `-z stack-size=` 传给 wasm-ld。64 MiB 上限 → 16 MiB 栈，128 → 32，256 及以上 → 64。
- 不采用「`--max-memory = 上限 + 栈`」：栈在线性内存内，必须从总上限里划，语义才与 DOMjudge / Isolate 的「总内存含栈」一致。
- 栈大小随上限变，因此编译缓存键多一位 `stackPolicy: STACK_POLICY_VERSION`（当前 1）。键是 `(code, memoryLimitBytes, stackPolicy)`，任一项变都重链接。

**MLE 证据链（§5.2）**
- 链接期塞一段探针（`OOM_PROBE_SOURCE`）：自定义 `sbrk` 顶掉 `libc.a:sbrk.o`，每次 `memory.grow` 失败给 `__oj_sbrk_failures` +1，并导出 `__oj_sbrk_get()` 供宿主读。探针 `.o` 每个会话只编一次、常驻内存。
- 宿主补丁（`scripts/patch-wasi-clock.mjs` 的 `RESULT_REPLACEMENTS`）在 `_start` 返回 / trap 之后统一调 `__cpr(exitCode, trap, startTime)`，带回 `{ trap, runMs, memoryBytes, sbrkFailures }`。补丁带 `cp-result-patch` 标记、幂等，`preverify:judge` 会自动跑一遍。
- `engines/wasm.js`：只有 `134 + sbrkFailures > 0` 判 `mle`；计数拿不到时才退回旧的「134 + stderr 空」启发式（宁可把真 MLE 认出来，也不留死角）。空指针、除零、`abort()`、栈溢出都是 134 但计数为 0 → `RE`。
- 探针与 wasi-libc 的 `sbrk` 语义一致（增量须非负且 64 KiB 对齐，否则 `abort`；成功返回旧页号 `<< 16`，失败 `(void*)-1`）。唯一差异是不写 `errno`：clang 8 的 wasm 后端给 TLS 变量选不出指令，而 dlmalloc 只认返回值。

**TLE 宽限（§4.2）**
- 看门狗在 `T + max(100 ms, 5% × T)` 才 kill；判定用 `_start` 起止墙钟 `runMs` 与 `T` 比较 —— 程序先自己结束了、但 `runMs > T` 也判 TLE。`durationMs` 就是 `runMs`（1 s 时限下实测 1101 ms 被杀）。
- Python 的 `runMs` 含解释器启动，`runCase` 给它加 `PYTHON_STARTUP_ALLOWANCE_MS`（500）后才与 `T` 比。

**验收**
- `npm run verify:judge`：**20/20 PASS、0 KNOWN、0 FAIL**（#20 无 OLE，跳过）。#7/#8/#9 从 MLE 翻回 RE，#5 是真正的分配失败 MLE（16 ms），#21（成功分配后越界写）是 RE。证据：`/tmp/verify-judge-3.log`。
- #5 起初写成 `new char[16 MiB]` 死循环，实测判成 TLE。原因是**这套内核异常是关的**（wasm32-wasi 默认 `-fno-exceptions`）：`operator new` 失败只静默返回空指针，而 WASM 线性内存的 0 地址合法，`memset(nullptr, …)` 不 trap，循环就一直跑。改成 `malloc` + 判空后 `abort()` 才是「分配失败 → 134」。
- 写用例的结论：**在这套内核里，MLE 用例必须用 `malloc` + 显式终止**；`new` 那种「等 `bad_alloc`」的写法在这里不存在（已记进规范 §5.2 已知边界 / §10 P2）。
- ⚠️ 跑验收时**不要改仓库文件**：Vite 会整页热刷，正在跑的 `page.evaluate` 直接抛 `Execution context was destroyed`，看起来像用例崩了（本轮踩过一次，单独探针复现 #4 是正常的 TLE 1101 ms）。
- 界面回归 `npm run verify` 仍是 **A/E/G/H 红、B/C/D/F 绿**，与 §20.3 同一基线（E 的红是 `collapsedBeforeRun=false`：单击分隔条没折叠，与判定无关）。说明新增的探针链接与栈调整没有改变正常编译 / 运行流程。
- 本轮未提交、未 push。

### 20.5 RE 的 detail：trap 的「人话 + 原文」（2026-10-25，用户拍板选 A）

**报障**：RE 的卡片说明永远是「程序退出码 134」，越界、`unreachable`、`abort()`、栈溢出一个样 —— 用户没法判断是哪种错。

**为什么以前只能给 134**：宿主把**任何** wasm trap 都折成 134 且不写 stderr（runno 时代就是这样，自写宿主沿用同一数值），而 `engines/wasm.js` 只看 `stderr`，空了就退回退出码。真正的 trap 原文其实一直在 `message.trap` 里（`RuntimeError: memory access out of bounds` 这种），没人用。

**改法**（`src/services/engines/wasm.js` 的 `describeTrap` + 一张 9 条的正则表）：
- 优先级：**用户自己的 stderr → trap 人话 → 退出码**。程序自己往 `cerr` 打的东西优先，那是它自己的诊断；trap 只在 stderr 为空时补位；
- 归类用**正则**而不是精确匹配（同一件事在不同浏览器 / V8 版本上措辞会变：`unreachable` / `unreachable executed`），认不出来就**原样透出**——宁可英文，也别丢真因；
- 剥掉 `RuntimeError:` / `RangeError:` 这类前缀（栈溢出是 `RangeError: Maximum call stack size exceeded`，前缀不一），只留正文；
- 文案在 `i18n/messages/engines.js`（中英各 9 条，服务里不许有中文字面量）。**英文侧不套括号** —— 英文原文本身就是这句话，套上去会变成 `Memory access out of bounds (memory access out of bounds)`（实测撞到过一次）；中文侧保留括号里的原文，方便用户拿去搜；
- 非 trap 的失败不受影响：`return 3` 仍然是「程序退出码 3」，这是诚实的（它不是 trap）。

**实测**（`evaluateCase` 产品路径，无头 Chrome，中英各一遍）：

| 用例 | verdict | detail（zh） | detail（en） |
| --- | --- | --- | --- |
| 野指针写 `0x7fff0000` | RE | 内存访问越界（memory access out of bounds） | Memory access out of bounds |
| `abort()` | RE | 执行到不可达指令，程序已被中止（unreachable） | Program aborted: hit an unreachable instruction |
| 整数除零（两个 volatile 操作数） | RE | 整数除以零（divide by zero） | Integer division by zero |
| 无终止递归 | RE | 调用栈溢出（Maximum call stack size exceeded） | Call stack overflow |
| `fprintf(stderr, …)` 后崩 | RE | **我的诊断信息**（用户 stderr 优先） | 同左 |
| `return 3` | RE | 程序退出码 3（不是 trap，保持原样） | Program exited with 3 |

`npm run verify:judge` 20/20 PASS、`npx vite build` 通过。
**回归时注意**：`verify-judge` 的日志会跟着变成新文案（#21 现在打「内存访问越界…」而不是「程序退出码 134」），别把它当成失败。

### 20.6 ACTUAL 框里到底显示什么：七种判定的盘点（2026-10-25）

用户连问「RE / TLE / MLE 时 ACTUAL 输出的是什么」「其他判定有没有同类不明确」。**先记住这条**：
卡片上那个 `Actual` 框 = **`actualOutput` + `detail` 用换行拼起来**（`TestCaseCard.vue` 的 `outputText`），
判定码只出现在徽标上。所以「某判定的输出」= 它的 stdout + 这一行 detail，全部由 `runner.js` 写进补丁。

| 判定 | detail 的来源（改前） | 明不明确 |
| --- | --- | --- |
| AC / WA | **空字符串** | ⚠️ WA 完全不给「哪里不一样」，四种比对方式（§7.2）也不提示。**2026-10-26 起 AC / WA 还可能多一行 `note`，见 §20.7，但 detail 仍是空的** |
| CE | 编译器 stderr 原文 | 基本明确，但路径是 `/program.cpp`（见下） |
| TLE | `运行超时 (TLE)` | ⚠️ 没有时限数字 |
| MLE | `内存超限 (MLE)` | ⚠️ 没有上限数字 |
| RE | 用户 stderr → trap 人话 → 退出码（§20.5） | ⚠️ 未捕获异常那条漏了（见下） |
| ERR | 服务不可达 / 引擎不支持语言 / `评测失败（{outcome}）` | 最后一条会把内部英文枚举名（`rejected`）抖给用户 |

本轮补的三处（2026-10-25，用户选定的三条）：

1. **未捕获的 C++ 异常**（`engines/wasm.js` 的 `TRAP_LABELS` 加第 10 条）
   `throw std::runtime_error(...)`、`vector::at` 越界、`std::stoi` 抛 `invalid_argument` 全都走这条路，
   宿主给回来的 trap 文本是 `Exception: [object WebAssembly.Exception]` —— 原来的正则表认不出，**原样透出**，
   卡片上就是这一串 JS 对象字面量，比「程序退出码 134」还难懂。现在映射成
   「未捕获的 C++ 异常，程序已被中止」（英文 `Uncaught C++ exception — the program was aborted`）。
   **文案里刻意不带 `{raw}`**：那串字面对用户没有任何信息量，而 `what()` 拿不到（要模块自己的 tag 才能 `getArg`）。
2. **TLE / MLE 带上数字**（`runner.js` 的 `timeLimitLabel` / `memoryLimitLabel` + 两条新 i18n）
   「运行超时 (TLE)：时限 1 s」「内存超限 (MLE)：上限 256 MB」。口径与设置页一致（`256 MB`、`1 s`）。
   理由：这两个上限都是可改的全局设置、还能被单题覆盖（`config.timeLimit` / `config.memoryLimit`），
   只写 TLE/MLE 的话分不清「程序真慢」和「时限被调低」。拿不到值时退回 `timeoutPlain` / `memoryExceededPlain`。
3. **CE 的诊断路径换回真实文件名**（`runnoSandbox.js` 新增导出 `withSourceName`，引擎里两处编译分支调用）
   用户代码永远写进 `/program.cpp` 再编，于是每条诊断都以 `/program.cpp:2:21:` 开头，而用户的文件叫
   `main.cpp`。**只改显示文本，不动编译路径** —— 真写进 `entryPath` 的话，`/a/b/c.cpp` 这种还得先建目录，
   而宿主 mkdir 是残缺实现（见 §21 那段）。`/program.cpp` 是唯一来源，替换在两处编译分支各一行。

**实测**（`evaluateCase` 产品路径，无头 Chrome，中英各一遍）：

| 用例 | verdict | detail（zh） | detail（en） |
| --- | --- | --- | --- |
| `int x = ;`（`/main.cpp`） | CE | `/main.cpp:2:21: error: expected expression` | 同左（路径与语言无关） |
| 同上，`entryPath=/algo/a+b.cpp` | CE | `/algo/a+b.cpp:2:21: ...` | — |
| `volatile` 死循环，时限 1000ms | TLE | 运行超时 (TLE)：时限 1 s | Time limit exceeded (TLE): 1 s |
| 同上，时限 5000ms | TLE | 运行超时 (TLE)：时限 5 s | — |
| `vector` 无界 push_back，上限 64MiB | MLE | 内存超限 (MLE)：上限 64 MB | Memory limit exceeded (MLE): 64 MB |
| `v.at(5)`（未捕获 `out_of_range`） | RE | 未捕获的 C++ 异常，程序已被中止 | Uncaught C++ exception — the program was aborted |
| `throw std::runtime_error("boom")` | RE | 同上 | 同上 |
| `return 3` | RE | 程序退出码 3（不受影响） | — |

`npm run verify:judge` 20/20 PASS、`npx vite build` 通过。

**仍未做**（用户这轮没选，别再当已办）：
- **Python 语法错误判 RE 不判 CE**：detail 是 `File "/main.py", line 1 / SyntaxError: invalid syntax`，
  而 C++ 同类错误是 CE。要改得在 Python 分支认「traceback 里只有帧、末行是 SyntaxError / IndentationError」，
  判据有风险（运行期 `eval` / `import` 触发的 SyntaxError 会误判），用户明确没选这条。
- **WA 没有任何差异提示**：不开 diff、也不提示「这题用的是浮点容差 / 忽略行序」，字面几乎一样却判 WA 时最费解。
- `ERR` 分支 `failed()` 硬写 `actualOutput: ''`（piston / judge0 的 `rejected` 可能带着 stdout，被丢了）。
- MLE 分支把 stderr 清空（用户在 stderr 上打的诊断看不到）；RE 分支是保留的。
- 取消（`cancelled`）之后卡片直接回「待运行」，看不出「刚被取消」而不是「没跑过」。

### 20.7 编译期常量除零：不判死，只多一行 `note`（2026-10-26，用户拍板选「只提示不判死」）

**起因**：用户问「别的 OJ 里 `a / 0` 会 RE，我们这里为什么判 AC、还输出了 0」。
实测（`evaluateCase` 产品路径，本机无头 Chrome）把三种情形区分开：

| 代码 | 编译诊断（改前，`-w`） | 运行结果 | 判定 |
| --- | --- | --- | --- |
| `int a = 10; printf("%d", a / 0);` | 无 | **输出 `0`，退出 0** | **AC** |
| `volatile int z = 0; printf("%d", a / z);` | 无 | trap `divide by zero` | RE（`整数除以零（divide by zero）`，§20.5 已修） |
| `if (argc > 1) printf("%d", 10 / 0); puts("alive");` | 无 | 输出 `alive` | AC |

**根因不在判定链**：`-O2` 把常量除法折成一个常量，产物里**连除法指令都不剩**，运行期无从检测。
而 `-O0` 的 OJ 真发一条 `idiv`、收到 SIGFPE —— 两边都只是 UB 的合法后果。

**为什么不做「并入 RE」**：能抓的唯一入口是编译警告，而这条警告对**走不到的分支**里的 `10 / 0`
同样会报（上表第三行）。据此判死，会把一个在 `-O0` 的 OJ 上完全正常的程序误杀。所以判定照旧按
「实际跑出来的」走，只把这件事说出来。

**改动四步（缺一条就不出效果）**：

1. `runnoSandbox.js` 的 `FRONTEND_ARGS`：`-w` → **`-Wno-everything`**。
   `-w` 是「全抑制」位，后面再写任何 `-Wxxx` 都压不动它（实测 `-w -Wdivision-by-zero` 一条不报）；
   换掉之后 PCH / OOM 探针 / 语法检查仍然全静音。
2. `clangArgs()` 末尾加 **`-Wdivision-by-zero`** —— 只给用户代码那次编译放开这一条。
   实测诊断是 `/program.cpp:2:42: warning: division by zero is undefined [-Wdivision-by-zero]`。
3. `compileAndLink` 成功分支带回 **`diagnostics: compiled.stderr`**（以前成功时直接丢掉），
   `runCpp` 透传到 message；`engines/wasm.js` 的 `describeWarnings()` 认 `division by zero`
   并给出 `warning` 文案（`tests.outcome.divideByZero`）。
4. `runner.js` 把它放进**新字段 `note`**，`TestCaseCard.vue` 渲染成 ACTUAL **框内顶部**的
   `.out-box__note` 一行（`--hint-goose` 鹅黄、12px、允许折行；2026-10-26 晚由「框下面那行灰字」改到这里，
   颜色同日第二版才从 `--warn` 换成专用黄，理由与取色见 §20.8）。
   **不进 `detail`** —— 先按 detail 做过一版，实测「复制输出」交出去的是 `0\n\n源码含除以零…`，
   把提示粘到别处就多一行中文，所以拆开；也**不能进 `<pre>` 的正文**，同一个理由。

**实测读数**（两套主题 + 窄面板，无头 Chrome）：

| 项 | 值 |
| --- | --- |
| 卡片 ACTUAL | `0\n`（AC 绿） |
| note 行 | `源码含除以零（编译期已确定），输出结果不可预期` / `Source divides by zero at compile time; the output is undefined` |
| note 位置 | **ACTUAL 框内第一行**（`.out-box__note`，在 `<pre>` 之上、与正文左缘对齐 delta = 0） |
| note 颜色 / 字号 | 深色 `rgb(245,230,168)`（`#f5e6a8`）、浅色 `rgb(128,96,10)`（`#80600a`），都是 `--hint-goose`，12px（正文 13.5px） |
| 「复制输出」 | `0\n`（提示不在里面）；长输出那份 7890 字符也不含提示 |
| 面板 274px（下限附近） | note 折 2 行、`scrollWidth === clientWidth`（440px 时 1 行），不截断不溢出 |
| 带 PCH 编译 | 同样报警告；`cp.pchUnsupported` 仍为 `null`（`-Wno-everything` 不改 PCH 签名） |

**要知道的两个副作用**：
- **每张卡都会显示同一句**：编译是整批共享的一次性开销，N 个用例就是 N 行相同提示（与 CE 的重复
  是同一个口径）。
- **走不到的分支也会提示**：这是刻意的 —— 源码里确实写了除零，而结果确实不可预期。
- `note` **只活在内存**：用例回写只取 `input` / `expectedOutput` 两栏，它不进 `config.tests`，
  刷新后要重跑才会再出现（与 `detail` / `actualOutput` 同一条纪律）。

### 20.8 ACTUAL 里的「系统提示」统一长相（2026-10-26 晚，用户要求）

**范围**：ACTUAL 里**不是程序打印出来的字** —— 目前两类：编译期诊断 `note`、空态占位「输出为空」。
两者都是 `--hint-goose` + 12px（正文 13.5px，小一号）。

**颜色为什么单开一支**（2026-10-26 晚第二版，用户：「换成鹅黄色，不要现在这个绿色」）：
最初用 `--warn`，深色那一支是 `#c9a45c`（偏褐的金）、浅色是 `#8a6116`（偏橄榄的黄褐），
12px 小字压在 ACTUAL 框底上被读成灰绿。于是新增 `--hint-goose`（`base.css` 两套主题各一份），
**只服务这一处**，不跟页签未保存点 / 通知那批 `--warn` 联动 —— 动 `--warn` 会牵一片。

| 主题 | 值 | 实测色 | 对 ACTUAL 框底（复合后） |
| --- | --- | --- | --- |
| 深色 | `#f5e6a8` | `rgb(245,230,168)` | 14.31:1（框底 `rgb(23,23,23)`） |
| 浅色 | `#80600a` | `rgb(128,96,10)` | 4.86:1（框底 `rgb(234,234,234)`） |

浅色不可能真用「鹅黄」：`#f5e6a8` 压在白底上只有约 1.4:1，读不出来。所以同一色相（~44°，不带绿）
压暗到 5:1 上下 —— 第一版取 `#8a6a0f` 算下来约 4.2:1，仍不到 12px 正文该有的 4.5:1，才再压一档
（`#80600a` 实测 4.86:1）。

**位置**：都在**框内第一行**。为此新增一层 `.out-box`：底色 / 描边 / 圆角 / 截断虚线全部从 `.out`
搬上来，`<pre>` 退成「只剩内边距与滚动」的内容区 —— 提示要跟正文共用一个框，就得有个把它们包住的元素。
副作用是长输出时提示固定在框顶不随内容滚走（这是想要的）。

**为什么 `note` 不进 `<pre>` 的正文**：会污染「复制输出」（实测交出去 `0\n\n源码含除以零…`）
和手动全选复制。它是 `<pre>` 的**兄弟**，只共享外框。

**「运行中…」不在这一类**：它是状态不是结论，颜色一变会像已经给出了结果，所以仍走 `--text-faint` 的
`.is-empty` 原样（12px 也不给 —— 只有「跑完了但没输出」才是提示）。

**坑（实测踩到）**：`.card[data-status='passed'] .out` 把整个 `<pre>` 染成判定色（AC 绿 / WA 红），
特异性 (0,2,1)；单写 `.out.is-hint`（0,2,0）压不住，「输出为空」会显示成绿色。
必须 `.out.is-empty.is-hint`（0,3,0）—— 两个类本来就同时出现，不是凑特异性；
与 `.card[data-status] .out` 打平，靠**写在其后**才赢（顺序一挪就会变回绿色）。

**副作用与配套**：`.out-box` 的 `overflow: hidden` 会裁掉浏览器画在 `<pre>` 外的默认 outline
（改动前 `.out` 自己就是框，outline 露在外面），于是 Tab 过去看不出焦点 —— 焦点态改成
`.out-box:has(.out:focus) { border-color: var(--focus) }` + `.out:focus { outline: none }`，
判据与 `.ta:focus` 同一条（实测 transparent → `rgb(0,122,204)`）。

**实测读数**（两套主题 + 440px / 240px 框宽）：note `rgb(245,230,168)` / `rgb(128,96,10)`、12px、
与正文左缘对齐（delta 0）、440px 一行 / 240px 折两行且 `scrollWidth === clientWidth`、
`<pre>` 背景变透明、`.out-box` 底边 `dashed` 仍在截断态出现、省略行仍在框外。

---

## 21. 新内核阶段 4：自写 WASI 宿主（2026-10-25）

C++ 的 compile / link / run / syntax 四条路全部换成**常驻 worker 里的自写宿主**（`src/services/wasi/`：`host.js` 是同步 WASI preview1 实现，`wasi.worker.js` 负责常驻模块与 sysroot，`client.js` 是主线程侧的薄封装，`tar.js` 解 `.tar.br`）。Python 仍走 runno，一个字没动。

为什么换：阶段 2 的 13–17 s 首编不是内核慢，而是 runno 的模型决定的 —— 每次 run 新建 worker、重新实例化 73 MB clang / 41 MB wasm-ld、把 1385 条 sysroot 整份 clone 过去；stdin 还是 8 KiB SAB 槽 + `setTimeout(0)` 轮询（实测 1.6 MB/s）。

### 21.1 结构（改之前先认清这四条边界）

- **同步执行是刻意的**：`runWasiModule()` 全同步，阻塞的只是 worker。主线程看门狗照旧用 `worker.terminate()` 打断死循环，代价是下次要重新 init（`loadToolchain()` 检测到 `host.alive === false` 会重建）。
- **两个模块名同时注册**：新内核只认 `wasi_snapshot_preview1`，8.0.1 认 `wasi_unstable`，同一张函数表挂两个名字，换档不用改宿主。
- **未实现的调用返回 `ENOSYS`**，不抛异常：用户程序没用过的调用不该炸掉整个 worker。
- **sysroot 的 mtime 必须钉死**（见 21.3 第 1 条），这是 PCH 能不能跨会话工作的全部前提。

### 21.2 验收读数（dev / localhost / 无头 Chrome，2026-10-25；基线见 §18）

| 指标 | 旧 8.0.1 + runno（§18） | 阶段 2（23.1.0 + runno） | 现在（阶段 4） |
| --- | --- | --- | --- |
| 工具链进内存 | 81 ms（缓存已热） | 13–17 s（每次 run 重建） | **674 / 772 / 982 ms**（首访含 23 MiB 下载 + 模块编译 + 解 1385 条） |
| 首编（含 V8 懒编译 clang 模块） | — | 13–17 s | **0.55–1.6 s**（方差大，取决于页面是否已静置） |
| 稳态冷编（无 PCH） | 505–715 ms | — | **216–262 ms** |
| 带 PCH 冷编 | 423–449 ms | — | **75–122 ms**（跨刷新修好后 84–103 ms） |
| PCH 生成 | 529 ms / 8.61 MiB | 18.37 MB | **622–679 ms / 17.52 MiB** |
| 命中编译缓存（同代码连跑） | 37–41 ms | — | **16 / 43 ms**（2M 排序，不读输入） |
| stdin 1 MiB | 632–643 ms（1.6 MB/s） | — | **1 ms** |
| stdin 4 MiB | 2,478–2,559 ms | — | **5 ms**（≈838 MB/s） |
| stdout 4 MiB | 运行段 41 ms + 宿主收口见下 | — | 运行段 **6 ms** / 墙钟 **8 ms** |
| 4.8 MB 输出（30 万行） | 运行段 73 ms + **收口 268–358 ms** | — | 运行段 244 ms / 墙钟 250 ms → **收口 ≈6 ms** |
| 384³ 矩阵乘 | 运行段 66–67 ms | — | 运行段 **16 / 35 ms** |
| 2M 排序（内存内） | 运行段 37–41 ms | — | 运行段 41 / 46 ms |
| 判定矩阵 | — | 20/20 | **20/20 PASS**（改动前后各跑一轮） |

- stdin 的分块往返彻底消失：宿主把 stdin 一次读进内存，`fd_read` 同步按 iov 拷。4 MiB 只花 5 ms，**比基线快三个数量级**，规划里「≥ 20 MB/s」的目标不再是瓶颈。
- stdout 的收口从 268–358 ms 降到约 6 ms，靠的是「worker 内直接拼字符串、只在 ≥64 KiB 时回传一次」，而不是每块跨线程 postMessage。
- 算力没有退化（矩阵反而快一倍：LLVM 23 的 `-O2` + SIMD 对这类循环更强）。**别拿 scanf 重读的程序比较**：2M 整数读入本身要 45–55 ms，`cin`（`sync_with_stdio(false)`）更是 379–411 ms —— 那是 libc++ 20 的 iostream，不是宿主。
- 常驻内存这次**没测出可用结论**：`measureUserAgentSpecificMemory` 在 A0→A1→A2 之间来回摆（125.6 → 181.2 → 140.5 MB），把尚未回收的 23 MiB 响应也算进去。整份 sysroot 仍然是「全份常驻」，只是从页面搬进了 worker —— 规划 §3.5 那条「不再整份常驻」**仍未做到**。

### 21.3 两个必须记住的坑（都修在 2026-10-25）

**1. 跨会话 PCH 从来不生效，而且会把自己永久关掉。**

症状：刷新页面后每次编译都是 216–262 ms 档，PCH 像是不存在。实测抓到 clang 的原话：

```
fatal error: file '/sys/include/wasm32-wasip1/eh/c++/v1/__memory/allocator.h'
has been modified since the precompiled header '/stdc++.h.pch' was built
note: mtime changed from expected 1792903218 to 1792903221
```

根因：`MemoryFs` 给每个节点取 `Date.now()` 当 mtime，所以**每次 init 解出来的 sysroot 头 mtime 都不同**；PCH 里记着建它那一刻的 mtime，加载时逐个核对 → 必挂。修法：`MemoryFs` 支持 `sourceMtime`（只作用于初始平表），sysroot 统一钉 `SYSROOT_MTIME = 1.7e12`。

放大器：`compileAndLink()` 见到 `PCH_ERROR_RE` 会 `discardPch()` —— 清内存、**删 IndexedDB 存档**、打上 `cp.pchUnsupported`。于是「这台机器不再用 PCH」被永久记住，谁也不会再看见那条 fatal。**以后凡是「优化悄悄没生效」，先怀疑这套判废标记。**

修后实测（同一份代码，刷新后连跑 5 次）：**84 / 94 / 89 / 103 ms，5/5 都带 PCH**（拦 `Worker.postMessage` 核对过 `-include-pch /stdc++.h.pch` 确实在）。

**2. `compile` 分支不装 PCH，只有 `syntax` 装。**

`client.compile({ pch })` 会把字节送进 worker，但 worker 里原来只写了 `if (type === 'syntax') installPch(message.pch)`。刷新后 `loadPchBytes()` 从 IndexedDB 取回 PCH、送进 worker、被忽略 —— 不报错、不变慢得可疑，只是白送 18 MB 过一遍结构化克隆。修法：`if (message.pch) installPch(message.pch)`（`compile` 与 `syntax` 共用）。2026-10-25 之前，跨刷新 PCH 这条路**完全没通过**，只在同一会话内（`generatePch()` 把 `.pch` 写进共享 fs）才碰巧可用 —— 所以「PCH 有效」在单元测试里看不出来。

**附带**：`run` 段现在按产物字节指纹（FNV-1a）留一份 `WebAssembly.Module`，一批用例不再每个都 `compile` 一遍。53 KB 产物一次只要 1–3 ms，**收益很小**，别当成性能手段。

### 21.4 仍未做

- 阶段 6：**双档探测没接**。`TOOLCHAIN_VERSION` 还是写死的 `23.1.0`，`public/wasm/8.0.1/` 在仓库里但没有任何代码会选它。缺 wasm EH / SIMD 的特性探测，也缺「探测不到就回退 8.0.1」。这是 Safari < 16.4 与老 Firefox 会直接编译失败的地方。
- 阶段 3 两项：**wasm vs native 倍率表**（要桌面壳 `native` 引擎）与**浏览器里的 EH + SIMD 真机探测**，目前无基线。
- 阶段 5 剩部署侧：preview 上验 `Content-Encoding: br` 有没有被 Vercel 改写；限速条件下的首访实测。
- 文档侧（guide / `help.js` / `docs/使用手册.md` / `NOTICE.md` 第二节 / `index.html` noscript）仍按 C++17 写，要改成 **C++20 / clang 23 / `dynamic_cast`·`typeid` 不可用 / Safari 16.4**。

### 21.5 复跑

```bash
npm run verify:judge     # 判定矩阵 20/20（改宿主后先跑这条）
npx vite build --outDir /tmp/x   # 只验编译，别用 npm run build（沙箱守卫会拦 dist/）
```

探针放 `/tmp`，口径照 §18.4 / §18.8；本次那几支（首编分档、stdin/stdout scaling、跨刷新 PCH）跑完即删，仓库里不留。

### 21.6 TLE 时 stdout 不丢：逐字节镜像（2026-10-25 用户报障后修）

**症状**：一条「打印几行后死循环」的用例判出 TLE，卡片 ACTUAL **空的** —— 程序明明打印过东西。

**根因**（两层，缺一不可）：
1. `runner.js` 的 TLE 分支本来就写 `actualOutput: result.stdout`，`wasmRuntime` 的 TLE 分支也把 `error.partialStdout` 带回来了 —— 上层是通的；
2. 但 `wasi.worker.js` 的 run 分支把 stdout **攒到 64 KiB 才 `postMessage` 一次**，末尾那截靠 `runWasiModule` 正常返回后的 `if (out) post(...)` 补发。看门狗掐断走的是 `worker.terminate()`，函数永远不返回 → 尾巴那截（含「不足 64 KiB 的全部输出」）当场蒸发。

实测（无头 Chrome，2026-10-25）：打印 3 行 → TLE 后 ACTUAL 空；打印 128 KiB → 只剩 131072 字节（正好两个整块）。Python 那条线走 runno 的宿主、逐次回传，同样用例**保留**全部输出 —— 所以这是自写宿主独有的坑。

**为什么不是「把攒批粒度调小」**：那只是把丢多少变小，没把「会不会丢」消掉，而且消息条数会涨上千倍。这里要的是「掐断之后仍能读」。

**修法**：`src/services/wasi/stdoutMirror.js`（新文件，零依赖，worker / 主线程共用）+ 三处接线。
- 主线程 `client.run()` 前开一份 **8 MiB 的 SharedArrayBuffer**（懒分配、同一颗常驻 worker 反复用，开跑前清零），随 run 消息一起过去（SAB 不需要 transfer）；
- 宿主 `emit()` 在**解码之前**把原始字节 memcpy 进镜像（`appendMirror`）—— 与字符串怎么切无关，`Atomics` 记已写字节数；
- `terminate()` 之后主线程直接 `readMirror()` 读回，**不依赖任何消息送达**，因此不可能丢；
- 布局：`control[0]` 已写字节、`control[1]` 溢出位、`bytes` 是本体。**只做前缀、不做环形**：写满即停。TLE 的用户要看的是「程序开头打出了什么」，环形缓冲区会从半行开始，看着像乱码；
- 容量 8 MiB：判题侧输出上限的几十倍（CF 256 KB / AtCoder 8 MB），超过的部分不保留 —— 一个 1.2 s 的疯打印能打出几百 MB，不封顶会吃光内存。**这条是有意的取舍，不是漏**；
- `client.partialStdout()` 统一出口：镜像有内容就用镜像，否则退回老的 `this.stdout`（SAB 不可用时的兜底）。

**踩到的坑**：`TextDecoder.decode()` **不接受 SharedArrayBuffer 上的视图**（Encoding 规范里直接抛 TypeError，防撕裂读）。不先拷贝的话 `try/catch` 把错误吞掉，症状是「镜像明明有 21 字节，读出来是空串」——2026-10-25 在这一步上多花了一轮。修法：`decode(new Uint8Array(view.subarray(...)))`，先 copy。

**实测**（`runCase` / `evaluateCase` 产品路径，无头 Chrome，dev 5203/5209）：

| 用例 | 结果 |
| --- | --- |
| 打印 3 行后死循环，T=1.2s | TLE，stdout = `line 0 / line 1 / line 2`（21 字节，**齐**） |
| 打印 1 MiB 后死循环 | TLE，stdout 1048576 / 1048576 字节（**齐**） |
| 打印 20 MiB 后死循环 | TLE，8388608 字节（封顶 8 MiB，不崩） |
| 正常跑完（AC 路径，5 MiB 输出） | 5242880 字节不重不漏，`runMs` 3.9–5.5 ms（改动前后同量级） |
| 卡片层（`evaluateCase`） | `verdict TLE` / `actualOutput "1\n2\n"` / `detail 运行超时 (TLE)` —— ACTUAL 框里两样都有 |

`npm run verify:judge` 20/20 PASS、`npx vite build` 通过（改完复跑）。
**下次动 run 分支的 stdout 路径时**：消息那条路仍然是 64 KiB 攒批（编译诊断照用），但**运行期的取数只认镜像**，别再指望 `this.stdout` 在 kill 之后有内容。

---

## 22. 新内核阶段 6：浏览器能力探测与闸门（2026-10-25）

23 档工具链不是「慢一点也能跑」的那种降级：它要 **wasm 新标准异常（exnref / `try_table`）+ SIMD + multivalue + reference-types**。
缺任一项时，用户代码**能编、能链**，只在「跑产物」那一步实例化失败，报出来是引擎内部措辞
（`invalid value type` / `unknown opcode`），卡片上看起来像「你的代码写错了」。这一节做的就是把这个失败
提前成一句人话。

### 22.1 探测物是四段手写字节码（不新增资产、不过 SW）

`src/services/wasmFeatures.js`，每段 15–22 字节，判据只有 `WebAssembly.validate`：同步、零网络、几微秒，结果在页面生命周期内缓存。

| 特性 id | 探测物 | 关键字节 |
| --- | --- | --- |
| `wasm-exceptions` | `(module (type (func)) (func (try_table (catch_all 0))))` | `1f`（**try_table**）+ `40`（空 blocktype）+ `02 00`（catch_all → label 0） |
| `simd128` | `(module (type (func (param v128))))` | 值类型 `7b` |
| `multivalue` | `(module (type (func (result i32 i32))))` | 返回值个数 `02` |
| `reference-types` | `(module (type (func (param externref))))` | 值类型 `6f` |

**必须是 `try_table`(0x1f) 而不是 legacy `try`(0x06)**：wasi-sdk 34 的 `eh` libc++ 用新标准编的，两代混用会让 V8 拒绝整个模块。
每段的段结构都写进了源码注释，改之前对照 wasm 规范读一遍 —— 探测物写错的后果是**所有人**被误判成老浏览器。

### 22.2 闸门三处（少一处就会白下 23 MiB 或给出误导结论）

- `runnoSandbox.loadToolchain()`：探测不过就抛 `error.wasmUnsupported`（带缺失项与版本要求），**在下载之前**；
- `wasmRuntime.probeRuntime('cpp')`：直接返回 false —— 设置页不会把它显示成「已下载」；
- `runtimePreload.js`：跳过 C++ 预取。

文案在 `i18n/messages/engines.js` 的 `error.wasmUnsupported`（中英各一份），最终由 `engines/wasm.js` 的
`engine.wasm.unavailable` 包成「本地运行环境不可用：…」。

### 22.3 实测（2026-10-25，探针放 /tmp、跑完即删）

| 环境 | 结果 |
| --- | --- |
| Node 22.22.2（V8 12.4） | 四项全 true；三项**反证**全 false（legacy `try`(0x06)、截断 2 字节、catch 种类写成 0x19） |
| 无头 Chrome 155 | 同上，`detectWasmFeatures()` 两次调用返回同一个对象（记忆化生效） |
| 模拟老浏览器（开机前 `WebAssembly.validate = () => false`） | `missing` 四项俱全；`preloadToolchain()` **1 ms** 抛中文提示、**未触网**；`probeRuntime('cpp')` = false |
| `npm run verify:judge` | **20/20 PASS**（10 s，改动前后各一轮） |
| `npx vite build --outDir /tmp/x` | 1.12 s，无错 |

### 22.4 口径：**不做运行时 8.0.1 回退**（用户 2026-10-25 拍板）

阶段 4 已经把 clang 8 + runno 那条 C++ 管线整体换掉了；要真跑 8.0.1 就得把它搬回来（约 600 行、且判定口径与
23 档不同 —— 同一份代码可能一端 CE 一端 AC）。所以定的是：

- 探测失败 → **明确告知 + C++ 不可用**（Python 不受影响，它不需要 EH/SIMD）；
- **回滚 = 重新部署上一版**（`public/wasm/8.0.1/` 留在仓库里就是为这条路准备的，目录名不同、SW 的 immutable 缓存天然失效）；
- 不引入 `wasm23` 自选档、不做两周灰度（§5 第 8 项不变）。

顺带：`strip-wasm-assets.mjs` 删的是整个 `dist/wasm/` 目录，与档位无关，**不需要跟着改**；
SW 也不必再「按档分桶」—— 客户端只有一档。

### 22.5 用户可见文案（2026-10-25 已完成）

原来四处都还写着「clang 8 / C++17」，已全部改成 **C++20 / clang 23.1.0 / 无 RTTI（`dynamic_cast`·`typeid` 是 CE）**：

- **两版 guide**（`guide.html` / `guide.en.html`）：§2 注意事项加三条（C++20 有异常、`dynamic_cast`/`typeid` 不可用、
  浏览器要新标准 EH + SIMD），新增 FAQ「对浏览器有什么要求？」；§4 脚注与致谢表改 23.1.0，并把「上游现成预编译产物」
  改成「C++ 工具链由本站从 LLVM 23.1.0 源码编出，Python 仍是 runno 分发的官方构建」；runno 那行注明 C++ 已走自写宿主。
- **`help.js`**（中英）：下载体积 50MB→23MB、加 C++20/RTTI 说明、新增「对浏览器有什么要求？」条目。
- **`docs/使用手册.md`**：设置页那行实际文案本来就是 `clang 23 + libc++（C++20），约 23MB`（`engines.js` 早改过），
  手册一直没跟上；连同代码块示意图与注意事项一起补齐。
- **`NOTICE.md` / `NOTICE.en.md` 第二节**：改 23.1.0 与 wasi-sdk 34 的落点（`sys23-fs.tar.br` 里 1385 个文件、
  `eh/` 版 libc++、`sys/lib/clang/23/.../libclang_rt.builtins.a`），`8.0.1/` 降级为「只作部署回退、没有代码会选它」；
  核对命令一并换成先 `brotliDecompressSync` 再找（产物是 `.br`，`grep -a` 直接扫扫不到）。`npm run notice` 已重生成。
- **`index.html` 的 noscript**：体积、语言段（补 C++20/RTTI/浏览器要求）、性能段三处，中英各一份。

**两处顺手纠正的事实错误（都不是单纯换词）**：

1. **浏览器下限原来说反了**。`engines.js` 的 `error.wasmUnsupported` 写的是「Safari 16.4+ / Chrome 123+ / Firefox 121+」，
   那是 **legacy EH + SIMD** 的年代。我们的产物是**新标准 EH**（`try_table`/`exnref`：`FRONTEND_ARGS` 里显式
   `-mllvm -wasm-use-legacy-eh=false`，因为 wasi-sdk 34 的 `eh` libc++ 就是 `try_table` 编的），探测物测的也是 `try_table`。
   按 MDN 的 `try_table` / `catch_all_ref` 兼容表，真实下限是 **Chrome 137+ / Firefox 131+ / Safari 18.4+**（2026-10-25 核对）。
   那句提示已改正，四份文案与之对齐。**旧值不是「保守」，是错的**：Safari 16.4 的用户会被告知「换个浏览器」而不是「升级浏览器」。
2. **性能表整张重测**。旧表（2026-09-29）是 clang 8 档测的，标着 clang 23 就是假数据；而 `guide` 的脚注、`help.js`、
   `index.html` 三处引的是同一张表。基准程序当年放 `/tmp/wasmbench/`（已删），按同样的用例名与规模重写后重测
   （Apple M5 / 无头 Chrome / 两侧 `-O2`，沙箱取 `runCpp().runMs`，本机取 10–15 次中位数**再扣掉 2.55 ms 进程启动**）：

   | 用例 | 旧表（clang 8） | 现在（clang 23） | 本机 | 倍率 |
   | --- | --- | --- | --- | --- |
   | 纯计算 5×10⁷ 轮 xorshift | 132 ms / 1.77× | **87 ms** | 76 ms | **1.14×** |
   | 顺序访存 8×10⁶ int | 26 ms / 3.51× | **8 ms** | 4.0 ms | **2.0×** |
   | 排序 50 万 | 60 ms / 5.08× | **12 ms** | 7.5 ms | **1.60×** |
   | 排序 200 万 | 247 ms / 6.73× | **41 ms** | 33 ms | **1.25×** |

   倍率从「1.8–6.7×」降到「1.1–2.0×」。**别把旧口径照抄回来**：旧表两列都含启动开销（沙箱那列其实不含，只有本机含），
   所以「排序 50 万」一度算出 5.08×；新表把本机的进程启动扣掉，两边同口径。短用例（顺序访存、排序 50 万）
   只有十几毫秒，已接近计时下限，那两个比值只当参考 —— 文案里已写明。

### 22.6 换代回收：`/wasm/` 缓存清理改成版本无关（2026-10-25）

先看这笔账（两条语言都装才有意义）：C++ 23.1.0 = 14.24 + 8.51 + 1.61 ≈ **24.4 MB**；Python = 20.54 + 4.07 ≈ **24.6 MB**；合计 ≈ **49 MB**。
`cp-toolchain` 在 SW 的 activate keep 白名单里，**永久保留** —— 换代只改目录名，桶里旧目录的条目**没有任何一条代码会回收**，几十 MB 就那么搁着。

原实现两处都把「当前那一代」写死了：

- `pruneLegacyToolchainCache()` 只删 `LEGACY_ASSET_URLS`（8.0.1 那三件）—— 换到第三代之后，谁也删不到；
- `purgeRuntimeCache()`（设置页「卸载」）只删 `runtimeAssetURLs(lang)` 指向的**当前** URL —— 换代之后点卸载，旧版本那几十 MB 还在。

**修法（`src/services/runnoSandbox.js`）：判据从「列举要删的」翻成「推出要留的」。**

- `currentAssetPrefixes()` 由 `ASSETS` / `PYTHON_ASSETS` 推出当前目录前缀，换代自动跟着变；
- `deleteToolchainEntries(isStale)` 用 `cache.keys()` 读**条目自己的 URL** 再筛 —— 这是能删到「仓库里早已没有的目录」的唯一办法；
- 启动清理 = 删掉所有 `/wasm/` 里不匹配任一当前前缀的条目；
- 卸载 = 删掉所有 `/wasm/` 里不匹配**另一个语言**当前前缀的条目（卸 C++ 不误伤 Python，反之亦然）；
- `LEGACY_TOOLCHAIN_VERSION` / `LEGACY_ASSETS` / `LEGACY_ASSET_URLS` 整组退役。

判据安全的前提只有两条：当前版本的条目必然以当前前缀开头；没下完的条目根本不在桶里。只承诺 Cache Storage（HTTP 缓存浏览器不给 JS 接口）。
**别把这件事放进 SW**：SW 不认版本号，还得再注入一份。

**实测**（无头 Chrome，桶里种 10 条：当前 C++ 3 + 当前 Python 2 + 8.0.1 三件 + `python-3.11.2/python.wasm` + `/md/marked.js`；探针在 `/tmp`，跑完即删）：

| 操作 | 结果 |
| --- | --- |
| `pruneLegacyToolchainCache()` | 剩当前 C++ 3 + 当前 Python 2 + `/md/` 1；8.0.1 三件与 python-3.11.2 全清 |
| `unloadRuntime('cpp')` | 剩当前 Python 2 + `/md/` 1（8.0.1 三件一并清掉 —— 旧实现会漏） |
| `unloadRuntime('python')` | 剩当前 C++ 3 + `/md/` 1（python-3.11.2 一并清掉） |

非 `/wasm/` 条目三次都没被动过。`npm run verify:judge` **20/20 PASS**，`npx vite build` 通过。

### 22.7 仍未做（只剩已冻结的壳线）

- 阶段 6 ②（桌面壳是否同步 `-fno-rtti`）与 ③（Android 头裁剪清单并排）：桌面线与 Android 线都已冻结，
  未办事项归档在 `docs/废案.md` §1，不在这里重复。
- `docs/评测判定规范.md` 里还留着「接线前站点仍跑 8.0.1 档」这类前置说明与 8.0.1 对照行（内部文档，本轮不动）。

### 22.8 换代回收补完：PCH 判废标记版本化 + 渲染器桶清扫（2026-10-25）

§22.6 收的是 `/wasm/` 那 49 MB。同一次盘点里还漏了两个「换代后不归零」的状态，本轮补上。
判据是一致的：**让「换代」这件事自己把旧的否定结论作废，不写迁移代码。**

**① `cp.pchUnsupported` 从裸 `'true'` 改成带版本号的记号**

原来写死 `'true'`、读的时候只认 `'true'` —— 于是一台在旧内核下生成 PCH 失败（OOM / cc1 卡死 /
加载校验失败）的机器，**换内核之后仍然被判「扛不住」**，永远不再试。而换代换的恰恰是生成 PCH 的
那套 clang 与头文件，旧结论对新内核没有意义。

改法（`runnoSandbox.js`）：值写成 `v${PCH_CACHE_VERSION}`（当前 `v6`），读的时候用同一个 token 比。
- 裸 `'true'`（v5 及更早）与任何旧版本号都不等于当前 token → **认作过期**，换代后自动重试一次；
- 重试若还是失败，`markPchUnsupported()` 再写一次当前 token，又变回「同一代内不再重试」；
- `PCH_CACHE_VERSION` 本来就会因为「改生成参数 / 换内核 / 改存档结构」+1，所以这两个开关天然同步，
  不需要第二套版本号（与 §22.6「别引入第二套版本号」同一条纪律）；
- `storageMigration` 把 `cph.pchUnsupported` 原值搬过来也没事 —— 搬过来的旧值同样被认作过期。

代价是一次重试（最坏情况：老机器再花几十秒撞一次看门狗）。这条**值得**：不重试的代价是
「换了内核仍然永久无加速」，而且是静默的 —— 用户只会觉得「这网站编译慢」，没人会去翻 localStorage。

**② `cp-md-runtime`（katex + marked）换代清扫**

`storageNames.js` 里那条「渲染器的资产路径本身带版本，换版本 = 换 URL = 旧缓存自然失效」**是错的**：
katex 升版后文件仍叫 `/md/katex.min.js`、`/md/fonts/KaTeX_*.woff2`，版本只写在 `/md/assets.json`
的 `katex` / `marked` 字段里；而 `assets.json` 走 SW 的 cacheFirst，桶又在 activate 的 keep 白名单里。

后果分两半，轻重不同：
- **同名的会被覆盖**：重新下载时 `cache.put` 落到同一 URL，所以不会无限涨；
- **改名/删掉的旧文件没人扫**：katex 换掉某个字体、或多出来的旧字体，会一直躺在桶里（量级几百 KB，
  不是 49 MB，但同样是「换代后回收不到」）。

改法（`mdRuntime.js` 的 `downloadMdRuntime` → 新增 `pruneStaleMdAssets`）：拿到新清单、把 23 个资产
重新 `put` 完之后，用 `cache.keys()` 逐条读 URL，删掉**不在当前清单上**的条目。
- 放在**下载成功之后**：中途失败时旧的那份（哪怕多几个字体）还能用，比「先清空再失败、渲染器直接坏掉」好；
- 失败静默（`catch`）：清不掉只是占空间，不该把一次成功的下载变成失败；
- `mdRuntime.js` 与 `storageNames.js` 里那两句错论据一并改掉了，别再拿「路径带版本」解释渲染器。

**剩下的一个已知缺口（本轮不修，写在这里免得下次又当成新发现）**：已下载的用户**不会自己发现**版本变了 ——
`probeMdRuntime()` 读的是桶里那份旧 `assets.json`，它当然说「已就绪」，注入的还是旧 katex。
要修就得让清单能触网比版本（破「探针不触网」这条既有约束），或者给清单 URL 带上版本（要动
`prepare-md-runtime.mjs` 与 SW 的 fetch 分桶）。当前口径：**换渲染器版本时提示重下一次，或让 SW
的 `SHELL_VERSION` 单独升一版**——`uninstallMdRuntime()` 会按前缀删桶，是最干净的兜底。

**验证**：`npx vite build --outDir /tmp/xxx` 通过；`npm run verify:judge` **20/20 PASS**。
两项行为都用无头 Chrome 探针复核（dev server 临时端口 5197，探针在 `/tmp`、跑完即删）：

| 场景 | 读数 |
| --- | --- |
| `cp.pchUnsupported='true'`（v5 及更早）→ `generatePch()` | **认作过期**：真的去拉工具链（3 发 `/wasm/23.1.0/` 请求，首个 `sys23-fs.tar.br`）并生成 **18,372,448 字节**的 PCH |
| `cp.pchUnsupported='v6'`（当前 token）→ `generatePch()` | 3 秒内返回 `null`、**0 发** `/wasm/` 请求（`pchPromise` 直接短路，没触网） |
| 渲染器桶种 26 条（当前清单 23 + 清单本身 + 两条上一代残留）→ `preloadMdRuntime()` | 剩 **24 条**：两条残留全清、当前资产一条不少、清单还在，`probeMdRuntime()` 仍为 `true`，耗时 220ms |

PCH 那个 18,372,448 是 23.1.0 档的实测值，**只在本次有效** —— 以后动了 `PCH_SOURCE_TEXT` 或内核版本就会变，
本文件不打算再把它钉成断言（clang 8 档那个 9,025,124 就是这么过期的）。

## 2026-10-27 · 宿主队列：抢占、透明交接与错误归因

PCH 随工具链下发（`.pch.br` 8.3MB）之后，又回头把「共用一颗常驻宿主」的三条使用线
（运行 / 语法诊断 / PCH 本机生成）的调度纪律收紧了一遍。四个改动一起落地：

1. **看门狗不再误杀排队中的用户任务**（`wasi/client.js`）。`terminate()` 新增
   `preserveWaiting`：超时 / 抢占掐掉的是正在跑的那一条，队列里的**前台**任务改签世代后交给
   就地重建的新 worker，后台活（语法 / PCH）直接扔掉；`init` 自己不交接（否则会每 5 分钟重启一次）。
   用户取消（`USER_CANCEL`）仍然整队收掉、不重建。
2. **`KILL_REASON` 枚举**（timeout / preempted / user-cancel / disposed）挂在错误的 `reason` 上。
   上层只看它判断「外力打断」还是「真失败」—— PCH 的永久标记 `cp.pchUnsupported` 现在只认
   `code === 'pch-compile-failed'`，一次取消 / 一次误杀不会再让这台机器永远失去 PCH。
3. **前台抢占后台**（`send`）：用户点运行时，若正在派发的是后台活（语法 / PCH 生成），
   整颗 worker 换掉再把编译交接过去 —— wasm 没有中断点，只能 terminate；但用户任务不再
   排在几十秒的 PCH 本机生成后面。PCH 的预热闸（`pchWarmupStarted`）在被抢占 / 没轮到时
   会放开，下一次运行结尾再来。
4. **语法诊断不再「下一枪掐上一枪」**（`syntaxDiagnostics.js`）：只 `cancelQueued('syntax')`，
   正在跑的那一枪让它跑完（结果本来就按 `latestSeq` 作废，15s 表兜底）。老机器上单次检查
   1–2s > 防抖 300ms，原先会变成「每次击键杀一颗 23MB 宿主再重建」。
5. `checkCppSyntax` / `checkPythonSyntax` 的 `null` 升级为 `SYNTAX_STATUS`
   （success / busy / unavailable / aborted）：`busy` 才登记补账重试，`unavailable` / `aborted`
   清掉定时器收手，等 `onRuntimeReady` 或下一次击键。

顺带的 I/O 微调：PCH 下载单飞（在途去重，settle 即清，避免 18MB 常驻）、两份 `writePch`
改为 fire-and-forget。

**验证**：`npx vite build` 通过；`/tmp/wasi-queue-test.mjs`（假 Worker）三场景 PASS ——
「语法跑着时点运行 → 语法 reject `preempted`、编译在新 worker 上跑完」「编译看门狗超时 →
排队中的编译交接后正常返回」「用户取消 → 两条都 reject `user-cancel`、不重建」。

## 23. 装成 app 之后的系统返回（2026-10-30 加，第一版）

用户在安卓上把站点装成 app 之后，返回键 / 边缘返回手势会当场把应用退掉 —— 屏幕上有浮层、有确认框、正在看题解全屏，也一样退。这一节是那一发返回在站内的去处。

**现在接上来的是五层**：浮层 / 提交确认 / 删除确认 / 题解全屏（这四者都是「开 / 关型」，进栈），加上**窄屏抽屉**（同样是开关，但判据必须带上窄屏）与 **Codeforces 页内后退**（不是开关，走兜底层）。导出卡片与设置面板里的几个确认还没接，见 23.6。踩坑细节在 §5 坑 66。

### 23.1 能接管的到底是什么

Web 没有「返回键被按下」这回事。`backbutton` 是 Cordova / Capacitor 那类原生容器的私有事件，PWA 里拿不到；`beforeunload` 也不解决这个问题（它管的是离开页面，而装成 app 之后「离开」本身就是退出）。

真正能用的机制只有一条：**安卓 PWA 里，返回键与边缘返回手势先走 webview 的历史，历史空了才退出应用**。所以只要让历史永远不为空，一次「返回」就变成一次 `popstate`，站内再把它翻译成关闭动作。这是这类需求的唯一正解，不要去找别的 API。

三处平台差异（都写在 `isAppWindow()` 里，别在别处重判）：

| 环境 | 行为 |
| --- | --- |
| 安卓 PWA（装成 app） | 返回 → `popstate`，接管成立 |
| iOS 独立窗口 | 没有返回键、也没有后退手势，机制空转、无害 |
| 浏览器标签页 | **不武装**（`Alt+←` 是用户真想回上一页），`armBackStack()` 直接返回 `false` |

### 23.2 机制：一条哨兵 + 一条自维护的栈 + 一层兜底

`src/services/backStack.js`，模块级单例，对外四个出口：

- `armBackStack()` —— `main.js` 里调一次，**必须在 `createApp().mount()` 之前**。组件 setup 里的 `watchBackLayer` 带 `immediate`，刷新时正停在题解全屏的情形下会立刻注册第一层，武装晚了那一层就永远注册不上。返回 `boolean`（这次到底有没有武装）。
- `pushBackLayer(onBack)` —— 压一层，返回**幂等**的注销函数。只给「拥有生命周期」的地方调（浮层 composable、组件的状态 watch），不许业务代码各自 push。
- `watchBackLayer(source, onBack)` —— 开 / 关型状态用这个：`source` 为真入栈、为假出栈，返回「停表 + 出栈」。出栈发生在状态变假那一刻，所以不管是谁关的（返回键 / Esc / 点遮罩 / 业务逻辑）栈都能跟上。
- `addBackFallback(fn, priority)` —— **兜底层**：不占栈位，只在**栈空时**才有机会消费一次，`fn` 返回 `true` 表示「这一发我处理了」。用在「还能往回退一步的路」上（CF 页内后退），可以**反复消费**，消费后照样补哨兵。

两种层的差别就是「开关」与「路径」：栈层被返回键关掉之后它那个状态会变假、自己出栈；兜底层退了一格还能再退，所以不能进栈（进栈一次就没了），只能每次栈空时再问一遍。

历史里**恒定只有一条哨兵**（`history.state.cpBackSentinel`），UI 的层数完全由模块里那个数组说了算。不采用「开一层压一条 `pushState`」，理由见坑 66 第 4 条（刷新残留 + 点遮罩关闭还得伪造后退）。

```
pushState 一条哨兵
      ↓ 用户按返回
popstate ─→ layers.pop() ──有──→ onBack() ────→ 补回哨兵 ─→ （继续下一次）
                │
                └─没有─→ 问兜底层 ──接住──→ 补回哨兵 ─→ （继续下一次）
                              │
                              └─没接住─→ 补回哨兵，什么都不做（返回键永不退 app，见 23.4）
```

三条分支的出口是同一个 `finally { ensureSentinel() }`，所以图里那三段「补回」不是各写一遍，是一处兜住的。

`popstate` 里**先 `pop` 再 `onBack()`**：`onBack` 内部常会同步翻一个标记，那个标记的 watch 又要来注销自己 —— 先弹掉，注销那一下按 `indexOf` 找不到条目，是幂等的。

### 23.3 现在接上了哪些

| 对象 | 挂在哪 | 返回键做什么 |
| --- | --- | --- |
| 浮层（右键菜单 / 齿轮菜单 / 组件菜单 / 分组卡重命名） | `composables/usePopoverLayer.js` | 走 `dismiss`，与点外 / Esc / 失焦 / resize **同一个出口** |
| 提交确认卡 | `App.vue` 的 `stopBackSubmit` | `cancelSubmit()` —— **取消**，不是确认提交 |
| 删除确认卡 | `FileExplorer.vue` 的 `stopBackDelete` | `cancelDelete()` —— 取消，文件还在 |
| 导出卡片（二选一：下载 / 写进本机目录，**只有桌面壳会弹**） | `FileExplorer.vue` 的 `stopBackExport` | `cancelExport()` —— 返回键**不替用户选**，只退卡片 |
| 题解全屏 | `EditorPane.vue` 的 `stopBackFullscreen` | `exitFullscreen()`，与 Esc 同一个出口 |
| 窄屏抽屉 | `App.vue` 的 `stopBackDrawer` | `togglePanel()` —— 与点遮罩、侧栏底栏那枚箭头同一个动作 |
| 卸载扩展确认 | `EditorSettingsPanel.vue` 的 `stopBackUninstall` | `cancelUninstall()` —— 取消；删的是几十 MB 缓存，绝不能让返回等于确认 |
| 解绑确认 | 同上的 `stopBackUnbind` | `cancelUnbind()` —— 取消，仍是已绑定 |
| 应用云端配置确认 | 同上的 `stopBackCloudApply` | `cancelCloudApply()` —— 取消；**必须走它**，因为它还会 `clearPendingCloudHandle` + `markCloudEntryHandled`，绕过则下次刷新又冒一遍 |
| Codeforces 页内后退 | `CfCodeforcesPanel.vue` 的 `stopBackNav`（**兜底层**） | `goBack()` —— 与页头那枚后退按钮同一个动作 |

三处口径值得记住：

- **浮层那一层收在 `usePopoverLayer` 里注册**，因为浮层有四路关闭 + 外层 `v-if` 卸载，注册点散到各调用方必然漏；收在一处，四条老路也顺带把栈清干净了。它是「第五路关闭」，与 Esc 一起**当场挂**、不排进 `pointerdown` 那个 `setTimeout(0)`（那几路的注册时机为什么分家，见 §2 里 `usePopoverLayer.js` 那一格）。
- **题解全屏接的是 `mdFullscreen`（生效态），不是 `mdView.fullscreen`（存档态）**：在全屏里点开一个 `.cpp` 时生效态会回落成 `false`，存档态还是 `true`，接错就一直占着一层。
- **窄屏抽屉的判据必须带 `isNarrowLayout()`**：宽窄屏共用同一个 `panelVisible`，无条件接的话**宽屏上按返回会把一直开着的侧栏收起来**（探针里专门做了这条对照）。而**兜底层必须自己判「此刻该不该管」** —— 它不占栈位，也就没有入栈 / 出栈帮它收窄时机；CF 面板是常驻挂载的（`v-show` 保状态），所以那边一定得带上 `props.active`，否则在代码页按返回会莫名其妙地翻 CF 的内部页面（同样有探针对照）。

`i18n` 一条都没多 —— 曾经加过一条 `notifications.back.exitHint`（「再按一次返回即可退出」），2026-10-30 栈底口径改了之后它描述的行为不复存在，已随那一轮删掉。也没有新增任何 `cp.*` 键，`cpBackSentinel` 只活在 `history.state` 里。

### 23.4 栈见底：返回键不退 app（2026-10-30 改过一次口径）

第一版是「栈底发一次提示、这一发不再补哨兵，历史到此到底，下一发由系统退出 app」。**已否决**：app 里按返回的本意是「站内退一步」，一按就退出等于手重一下就把整个工作区关掉 —— 用户口径原话是「容易误触」。

现在的规则只有一条：**返回键永远不退 app**。栈底（没有层可关、兜底层也不管）同样把哨兵补回去，那一发返回等价于「什么都不发生」，也不弹任何提示（提示里说的事不会发生了）。退 app 走系统那条默认路：Android 从最近任务上划掉、桌面端关窗口。

实现上把补哨兵收进了 `finally`：

```js
try {
  const top = layers.pop()
  if (top) { top.onBack(); return }
  runFallbacks()
} finally {
  ensureSentinel()   // 无论走哪条分支、哪个回调抛错，历史都不许漏成空的
}
```

这样「永不退 app」是**结构上的**保证，而不是各分支的自觉 —— 否则哪天某个 `onBack` 抛个异常，历史当场到底，下一发返回就真退出了，而且这种漏法极难复现。`runFallbacks` 那个「有没有人接住」的返回值也因此取消了：接没接住处理完全一样。

两条读数值得记：栈底连按 5 次，`history.length` **稳定在 3、不增长** —— `back()` 把指针退一格、`pushState` 又在同一位置压回一条，前进侧被截断，不会攒出一长串历史；另外全程没有 toast 冒出来。

代价是这类 app 的「退不出去」问题：只能靠系统手势 / 关窗口。这是有意选的 —— 相比误触退出丢工作区，退不出去更可接受。

### 23.5 怎么验（探针口子）

浏览器标签页里带 `?backstack=1` 也按「装成 app」跑一遍（`isAppWindow()` 里的第一个分支）。不加这个口子，这条功能在开发机上根本走不到。**对照要另开一个无参数标签页**，确认它完全没武装。

实测（自起 dev server + 无头 Chrome，探针 `/tmp/back-probe.mjs`、`/tmp/back-probe2.mjs`、`/tmp/noexit-probe.mjs`、`/tmp/exp-probe.mjs`，跑完即删）逐项通过：

- 启动即压好哨兵；齿轮浮层上按返回只关菜单、URL 不变。
- **Esc 关掉浮层之后再按返回，落的是下一层**（没有幽灵条目）。
- 栈底（2026-10-30 口径）：连按 5 次返回全部停在站内、**一次 toast 都没弹**、每发哨兵都在，`history.length` 稳定 3；之后打开删除确认，哨兵仍在。
- 删除确认上按返回是**取消**（文件还在）；题解全屏上按返回退全屏、两栏布局恢复。
- 确认卡 + 全屏叠着时，返回一次**只退最上面那层**（后开的先退）。
- 一路按到底**仍在站内**，不导航、不白屏（2026-10-30 之前是离开站点，见 23.4）。
- 无参数标签页：`history.state` 仍是 `null`、`history.length` 仍是 2。
- **窄屏 560×900**：抽屉（`.drawer-scrim` 可见）上按返回 → 收起、哨兵补上；再按一次 → 仍在站内、什么都不发生。
- **窄屏 + 删除确认叠着**：返回一次只关确认框（抽屉还在）、再一次关抽屉、第三次起什么都不发生 —— 常驻在栈底的那层不会被顺手带走。
- **宽屏 1400×980 对照**：侧栏一直开着，按返回**不会**把它收起来（直接落到「什么都不发生」）。
- **CF 页签**：切到「赛程」记一步、页头后退钮变亮；按返回 → 回到「抽题」、后退钮变灰、没弹提示（兜底吃掉了这一发）、哨兵补上；再按一次 → 仍在站内。
- **CF 页签关掉之后**（页内历史还在）：按返回**不走 CF 的内部页面**，直接落到「什么都不发生」—— `props.active` 那道判据生效。
- **兜底层健壮性**（`noexit-probe` 的 E 段，注册两个假兜底）：前面那个抛 `Error('boom')` 不影响后面那个被调用；第二个被连续消费两次（可反复消费）；注销之后回到「什么都不发生」—— 三种情况下哨兵都在，页面一律没导航。
- **导出卡片**（`/tmp/exp-probe.mjs` 的 A 段；网页版不弹这张卡，探针在开机前塞 `window.__TAURI_INTERNALS__` 伪装成桌面壳，`CAN_EXPORT_TO_DISK` 才为真）：右键 → 导出 → 二选一卡片出现 → 按返回只关卡片、**没有替你选下载还是落盘**；Esc 关掉之后再按返回仍在站内（没有幽灵条目）。
- **解绑确认**（同探针 B 段；播种 `cp.cloudAccount` 让危险区出现，再从「云端同步」那一节点「解绑」）：卡片出现 → 按返回关掉，`cp.cloudAccount` 里的 handle **还在**（是取消，不是解绑）。
- **应用云端配置确认**（同探针 C 段；把 `cloudEntry.pendingCloudHandle` 置一个值，等价于「地址栏带 `/<handle>` 进来且云端有配置」）：卡片出现 → 按返回关掉，`pendingCloudHandle` 被清空 —— 证明确实走了 `cancelCloudApply` 那条（否则下次刷新又会问一遍）。
- **卸载扩展确认没做浏览器实测**：卡片只在运行时 `state === 'ready'` 时可开，而 ready 要么真有 76MB 工具链缓存、要么已载入内存，探针里造不出来。代码与解绑同构（同一个文件、同一个 `watchBackLayer` + 各自的 `cancelXxx`），风险面就是「判据写成恒假」—— 那一处对着 `pendingUninstall` 的 `shallowRef` 读代码即可。

`npm run verify` 与本次改动前的基线一字不差（**B/C/D/F 绿、A/E/G/H 红**，四项都是既有失败、别顺手去修；其中 A 是 2026-10-23 复核时由绿转红的，根因未查，与本轮无关 —— 所以 §0 与 §8 里那句「A/B/C/D/F 绿」是 10-23 之前的旧口径），`npx vite build` 通过。

### 23.6 剩下的：未做与已定不改

- **Esc 的口径没改**：仍是各浮层自己响应，两个浮层同时开着时会一起关。改成「只关最上层」会动既有可见行为，单独一轮再说。
- **「云端配置在，但地址进来的这个 handle 没有配置」那张提示卡**（`cloudEntryMissingHandle` / `dismissCloudMissing`）**没接**：2026-10-30 用户点名的三个确认里不含它，它也只是句一次性提示、没有选项要选。要接的话是同一处再补一行。
- **CF 页内退到底之后再按返回**：**已定，不改**（2026-10-30 用户口径）。现在落到栈底那条「什么都不发生」，不改成「退出 CF 页签」—— 那一步会丢页内状态，而用户已经被「一按就退」咬过一次。

### 23.7 Firefox 安卓「安装」窗口：第一下返回留个深色空窗口（2026-11-01，浏览器侧 Bug，只记录不改行为）

用户原话：「之前为移动端安装为应用之后，在网站中返回的功能，但是我返回后，先是到一个完全是深色的一个页面，再次返回会直接退出」。确认下来的口径：环境是 **Firefox 安卓的「安装」**；深色那页是**纯空白窗口、没有任何站内界面**；设置 › 应用那行状态显示**「已安装」**。

- **症状**：在首页按一次系统返回 → 整屏变成一片纯深的空窗口；再按一次 → 直接退出 app。与 23.4 那条「一路按到底仍在站内」正相反。
- **根因在浏览器侧**：Mozilla Bugzilla **2070832**（*Back press on a home-screen web app's first page unloads the document but leaves an empty window, so a second press is needed to close it*，History 组件，状态 UNCONFIRMED）。Firefox 安卓在独立窗口的**首页**上按返回时**不消费 `pushState` 压出来的那条哨兵**，直接把文档卸载、把空窗口留在那儿；第二下才关窗。
- **深色从哪来**：那个空窗口是 Firefox 按 manifest 的 `background_color`（本项目 `#1c1c1c`）涂的，所以看着「完全是深色」而不是白屏 —— 它与 `theme_color` 同值，见 `index.html` 里那段注释（Firefox 安卓不认运行期改写，读的是 manifest 的静态值）。
- **为什么不能当成「没武装」**：设置里显示「已安装」说明这份产物带着 manifest 的 `display: standalone`，即 `(display-mode: standalone)` 为真 → `isAppWindow()` 为真 → `armBackStack()` 武装过、哨兵已压（`history.length` 至少 2）。Bugzilla 那台的读数更直接：`history.length=1`、`state=null`、`standalone=true`，返回那一下到达页面的是 **`pagehide` 而不是 `popstate`** —— 浏览器根本没走历史。**所以这不是判据漏了 `fullscreen` / `minimal-ui` 一档，也不是哨兵没补**。
- **页面代码无解**：Web 没有 backbutton 事件，也没有「阻止文档卸载」的手段；`pagehide` 里 `location.reload()` 那一类兜底会变成「按一次返回就重启一次应用」，比空窗口更糟；把 manifest 改成只给 `browser`（`display_override` 只有 Chromium 认）等于放弃独立窗口。Chrome 安卓上同一套哨兵机制是正常的，见 23.5。
- **结论**：**已定，不改行为**（2026-11-01 用户口径「只记录，不改行为」）。不改代码、不改 manifest、不新增用户可见文案。**判据留给后来人**：`pagehide` 到了而 `popstate` 没到，就是这条缺陷的指纹；以后遇到「返回不按栈走」，先看这一条，别从 `isAppWindow()` 或哨兵补回那两句开始改。
- **用户侧绕路**：想避开这个空窗口，在 Firefox 安卓里把它当普通标签页用（不安装，那时 `armBackStack()` 不武装、返回就是真正的后退），或改用 Chrome 安装。等 Bugzilla 2070832 修掉之后，这条自然消失 —— 到时候用真机重验一遍 23.5 那几条即可。

## 24. 「Codeforces worker error」：旧页面的按需 chunk 被 SW 换代回收（2026-10-30 修）

### 24.1 症状与根因链

用户报「codeforces 无法下载，显示 `Codeforces worker error`」。这句不是 CF 接口的报错 —— 它来自 `cfClient.ensureWorker` 的 `worker.onerror` 兜底文案，只在 **Worker 脚本根本没取到** 时出现（脚本存在、Worker 里抛异常时 `event.message` 有原文，会照原样显示）。

链条三步，缺一不成立：

1. `cfWorker` 是**按需**加载的（点下载 / 抽题时才 `new Worker`），文件名带内容哈希，落在 `/assets/`。
2. 站点装成 PWA 后由 SW 接管：`sw.js` 的 `pruneStaleShellArtifacts()` 按 `/retain-manifest.json` 把外壳桶里「不在当前清单里」的 `/assets/` 条目删掉（`SHELL_VERSIONED_PREFIXES` 含 `/assets/`；桶里 170MB 残骸就是这么清的，见 §9）。而那份清单**只列当前这一版**的产物。
3. 用户停留在旧页面（SW 给的是旧 HTML + 旧 main chunk）去点下载：这个 chunk 桶里已被删、服务器上也不存在（Vercel 只保留当次构建）→ `cacheFirst` 未命中后联网 → **404**。

实测佐证：`new Worker('/assets/cfWorker-DOES-NOT-EXIST.js', {type:'module'})` 的 `onerror` 里 **`message` 与 `filename` 都是空字符串** → 正好落进兜底文案。而同一个文件存在时能正常回 status（写这份文档时线上 `cfWorker-D27m9ueT.js` 200、13KB，`cfStatus` 回 `ready:true, count:11481`）。

**影响面不止 CF**：同一个坑会咬 `wasi.worker-*.js`（点「运行」时才创建）、`editor.worker-*.js`、以及动态 `import()` 的 `markdown` / `python` / `cpp` chunk —— 旧页面点这些都会 404，症状各不相同（运行失败 / 题解不渲染），但根因是同一个。

### 24.2 修法：`cfClient` 的失败路径兜底（正常路径零成本）

`src/services/cfClient.js`：

- `onerror` 里先判断「脚本没取到」：`!event.message && !event.filename`。**只有这种**才走兜底，Worker 内部抛的异常照旧原样报出去。
- 兜底 `rescueWorker()`：`fetch('/retain-manifest.json?v=' + Date.now())` 取**当前部署**的清单 → 找 `cfWorker-*.js` → `new Worker` 起它 → **把 `pending` 里所有在途请求原样重投**（id 不变，新 worker 回信对得上）。新 worker 加载的是一整套同代资源（相对 URL 都指回自己的目录），自洽。
- `attach(target)` 抽出来给「首次创建」与「兜底换代」共用 —— 两处各写一份的话，兜底那颗会漏掉 `progress` 转发，抽题进度卡住不动。
- `rescueTried` 保证只试一次；兜底失败走原路 `failAll(WORKER_ERROR)`。
- `pending` 里连 payload 一起存（重投要用）。
- ⚠️ `onerror` 里**必须先 `worker = null`**：否则兜底也失败时，下一次请求会往一颗死掉的 worker `postMessage`，Promise 永远不结算 —— 界面卡在「下载中…」，比报错更糟。
- 兜底用 `void rescueWorker().catch(...)`，不让它自身变成未捕获 rejection。

### 24.3 两个坑（都是本轮踩出来的）

- **别为了拿 URL 另写一句裸 `new URL('../cf/cfWorker.js', import.meta.url)`**。构建器会把它当静态资源引用，给同一个 worker **多打一份产物**（实测多出一个 33KB 的 `cfWorker-*.js`，而正常那份是 13KB）。所以兜底里不比较「清单里的是不是同一个文件」，直接试一次 —— 万一相同也只是多一次空跑，落回 failAll。
- **清单请求必须带变化的 query**。`/retain-manifest.json` 不在 `/assets/` 前缀里，会被 `cacheFirst` 写进外壳桶，不带差异的 URL 拿回的是**上一版**清单（列的正是已经删掉的那些文件）。带 `?v=` 就绕开 `caches.match` 直接问网络。
- **兜底成立的前提是「消息 type 只增不改」**。将来要改某个 type 的入参 / 出参形状，不能再直接改 —— 旧页面会拿新 worker 来跑。要么加新 type，要么两版并存。

### 24.4 实测（自起 dev server + 请求拦截模拟「旧页面」，探针在 `/tmp/cfc/`，跑完即删）

| 场景 | 结果 |
| --- | --- |
| 首选 worker 404 → 清单指向另一份可用 worker | `cfStatus()` **resolve**（`id:3` 是原请求重投后回的），兜底 worker 请求 1 次 |
| 首选 404 + 清单指向**同名**文件 | `WORKER_ERROR`，**1ms** 返回（不挂住） |
| 首选 404 + 清单本身 404 | `WORKER_ERROR`，**1ms** 返回 |
| 正常路径（无 404） | `cfStatus()` ok，**`/retain-manifest.json` 请求 0 次** |
| 全 404 时连发两次请求 | 两次都 `WORKER_ERROR`（各 1ms），清单**只请求 1 次**（`rescueTried` 生效） |

`npx vite build` 通过，产物里 `cfWorker-*.js` **只有一份**（13.03 kB，hash 与线上一致，说明 worker 源码未动）。`npm run verify` 与基线一致（**B/C/D/F 绿、A/E/G/H 红**，四项既有失败）。

### 24.5 用户侧：已经卡住的页面怎么救

补丁只对**加载了新版 main chunk 的页面**生效。停在旧页面上的人，刷新一次（桌面 Cmd/Ctrl+Shift+R；手机 / PWA 关掉重开）即恢复 —— 刷新后拿到新 HTML + 新 main + 同代 worker。

### 24.6 没做的（要做另开一轮）

- **SW 换代时通知受控页面刷新**：`activate` 里 `clients.matchAll()` → `postMessage` → 页面弹一条「已更新，刷新」。这能把「旧页面按需加载 404」从根上收敛掉，但它会新增一条用户可见的提示，按惯例要先问。
- **prune 保留上一代清单**：需要构建期拿到上一次部署的 manifest（CI 里 curl 旧地址），链路更脆，暂时不做。
- `wasi.worker` / `editor.worker` / 动态 chunk 的同类兜底没做 —— 它们没有 `cfClient` 这种单一入口，得各自想清楚（`wasi.worker` 崩了是「点运行没反应」，比 CF 更值得单独处理）。

## 25. 题解统计簇压缩：双层数字块 + 容器查询降级（2026-11-01）

工具栏右端原是一句 `N 字 · M 行`。实测（100% 缩放、PingFang SC / ui-monospace，`352 字 / 21 行` 样本）：`.md-stats` 中文 **96.25px**、英文 **144.50px**，其中约 **52.9px**（文本的 55%）只是「4 个空格 + `·` + 4 个空格」；位数从 1 位涨到 4 位时还会再撑约 **36px**，且中英宽度差 **50%**。现在改成**数字在上、单位在下**的两列，两块之间只隔一个小圆点（点两侧各 3px）：横向只按每列较宽的那个算，单位不再占行宽，读数仍然 0 次点击 / 0 次悬停。

| 中文样本（含右侧 8px 间距的统计簇） | 原 | 现 | 变化 |
| --- | --- | --- | --- |
| 352 字 / 21 行 | 104.25px | **约 44px** | **约 −58%** |
| 1234 字 / 186 行（四位数） | 104.25px | **约 57px** | **约 −45%** |
| 英文（同结构，单位词比数字宽） | 152.50px | **约 50px** | **约 −67%** |

（「现」一列按 12px 数字版的实测宽度换算到最终的 11px 数字 / 8px 单位；缩放比例沿用同一字体的推进宽度，误差在 1px 内。）

验收口径说明：**−40% 是「统计簇」的指标**。整条工具栏 742.25 → 693.14（−6.6%）就到顶了 —— 14 颗工具按钮本来就占 63.9%，统计全删也只有 −13%，所以「整栏 −40%」在不动按钮结构的前提下不成立。

- `markdownStats()`（`src/services/mdFormat.js`）改成**单遍字符码扫描**：空白码点逐个列在 `isBlankCode()`，口径与 `/\s/` 一致（别图省事写 `code <= 32`，那会把 NBSP / 全角空格算进字数）。原先 `replace` + `split` 每敲一个字就产一份整篇长度的中间数组。
- i18n：`stats.chars / stats.lines` 两句整句拆成 `stats.charsUnit / linesUnit`（中英各一套）。模板只拼数字与单位，**别把整句再塞回来**，否则双层结构又得为两端语言各写一套。
- `EditorPane.vue`：`.md-stats` → 两块 `.md-stat`（数字 `11px` `--mono-font` + `tabular-nums`，单位 `8px` `--ui-font`，`align-items: center` 让单位相对数字居中）+ `.md-stat__dot`（`::after` 出字符 `·`，不额外占布局宽度）。顺手修掉旧样式的笔误 `var(--font-mono, …)`（项目里的变量是 `--mono-font`，写错的 fallback 一直没生效）。
- 分级降级：`.editor-pane__bar` 自己挂 `container: mdbar / inline-size`，四道闸门 **26 / 20 / 18 / 13rem** —— 缩统计间距（3 → 2px）→ 数字降到 10px（`@media (pointer: coarse)` 里保持 11px，手机可读下限）→ 三段胶囊换成单颗循环键 `.view-cycle`（图标即当前模式，提示 `app.md.view.cycleTitle` 带模式名与键位）→ 收全屏。阈值写 rem 以跟随界面缩放。**容器查询不能挂到 `.editor-pane` 上**：那会成为 Monaco `fixedOverflowWidgets` 的包含块（见第 5 节同类坑）。
- `scripts/verify-ui.mjs` 的 H 步断言同步：不再找 ` · `，改判 `.md-stats > .md-stat` 恰好两块 + 两段「数字 + 单位」。
- 文案只动了 `docs/使用手册.md` §3（正文与 ASCII 示意图）。`guide*.html` / `help.js` / `index.html` 原本只笼统提「字数与视图按钮」，不含统计格式，无需改。



