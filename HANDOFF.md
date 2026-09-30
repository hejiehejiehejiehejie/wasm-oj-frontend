# unnamed · 交接文档

面向「接下来要改前端样式」的接手人。当前代码**已跑通并上线**：本地 WASM 沙箱能编译运行 C++、也能解释运行 Python（含多文件 import）、判题（含 TLE）、主题与布局都能用；前端已推到 GitHub 并由 Vercel 托管（见第 10 节）；也能作为 PWA 装到设备上独立窗口运行、断网可用（见第 9 节）；还能配合改造版浏览器插件**一键抓题**（题目直接落进工作区、样例自动填进评测面板，见第 13 节）。

## 0. 一分钟上手

- 目录：`/Users/hejie/Code/BISHE`（仓库名是 `wasm-oj-frontend`）。
- **是 git 仓库**：远程 `origin` = https://github.com/hejiehejiehejiehejie/wasm-oj-frontend.git ，主分支 `main`（就是部署分支）。动大样式前先看一眼 `git status`。
- 启动：`npm run dev` → http://localhost:5199；想验生产构建用 `npm run build && npm run preview`（Service Worker 与安装入口**只在生产构建里存在**，dev 下测不到，见第 9 节）。
- 其他命令：`npm run verify` 跑无头回归（**B–H 应当是绿的**，A 步有一条已知竞态，见第 8 节；**本机要显式给 Node 与 Chrome 的路径**，见第 8 节开头）；`npm run wasm:opt` 是工具链体积优化，**当前结论是不用跑**（第 7 节）；`npm run md:runtime` 把题解渲染器（katex + marked）从 `node_modules` 抄进 `public/md/`，**已挂在 `predev` / `prebuild` 上，平时不用手动跑**（第 15 节）。
- HTML 入口：`index.html`（主应用）与四个内容页——`guide.html` / `guide.en.html`（使用指南的**中文版与英文版**，给搜索引擎抓取的静态长文）、`notice.html` / `notice.en.html`（第三方组件清单的中英文版，**生成物**，见第 12 节），各语言两页共用 `src/styles/guide.css`。改文案 / 样式时，`guide.html` 与 `guide.en.html` **两版必须同时改**，再加 `src/i18n/messages/help.js`（应用内「设置 → 帮助」那份内容）、`docs/使用手册.md`、`index.html` 的 `<noscript>`，一共五处要一起看（见第 12 节）。
- 响应式：**没有顶栏**（2026-09-28 整体删除）。所有入口都在工作区内——侧边栏页头的两颗图标（面板切换 / 设置）、设置视图里的「应用」分组（安装到设备）。**运行只剩两个入口**：全局快捷键 `Mod+Enter`、评测样例面板页脚那颗 ▶（曾有的编辑器页签栏运行按钮已于 2026-09-28 删除，见第 3 节）。侧边栏最低宽度随视口收缩（见第 3 节两小节）；工作区两栏始终并排、不堆叠。各档宽度都是实测定出来的，改动后要重量（第 1、3 节）；触屏下分隔条已可拖动，且有「键盘模式」（第 3 节末）。
- 浏览器插件抓题（2026-09 加）：改造版 Competitive Companion（已更名 **CC for Web**，主色与本站同蓝）解析完题目后，把 JSON 经内容脚本用 `window.postMessage` 投给本站，站点落盘到 `/<年月>/<OJ 标签>/<难度>/<题名>.cpp`（直接挂在工作区根下，无外层 wrapper），题目信息与抓到的样例都挂在代码文件**自己的节点**上（`node.meta` / `node.config`，2026-10-01 起；旧版是同级隐藏的 `.cph/<题名>.json` 文件，已由 `migrate.js` 一次性搬进节点；难度导入时为空，先落「未分类」），树里不另有条目，并把抓到的样例整体替换进评测面板。安装包就在站内分发——设置视图「浏览器插件」分组里有下载按钮（`public/extension/cc-for-web-<版本>.zip`），同一组里还有「投递目标」两个开关，可以直接把「发到本网站 / 发到本地工具」任一关掉（2026-09-30 加，真值写在扩展的 `chrome.storage`，见 13.1）。详见第 13 节。
- 全局快捷键（2026-09 加）：设置视图「快捷键」分组里可录制 / 清除 / 复位，默认 `Mod+Enter` = 运行全部用例、`Mod+Shift+KeyE` = 切换侧栏面板（等价于点页头那枚胶囊）；实现要点与坑都在第 13 节。
- **题解（Markdown / LaTeX，2026-09-30 加）**：`.md` / `.markdown` 走 Monaco 内置的 markdown 分词器，只用于**写题解、不参与判题**（两个运行入口都会给禁用态）。编辑区为此多了一行工具栏（14 项：加粗 / 标题 / 列表 / 链接 / 图片 / 公式 / 表格 / 分割线…）、`N 字 · M 行` 统计、三态视图胶囊（仅编辑 / 双栏 / 仅预览）与一颗全屏按钮，另有 15 条题解专用快捷键（`Mod+\` 轮换视图、`Esc` 退全屏）。预览用的 marked + KaTeX **按需下载**（设置视图「本地运行环境」的第三行，缓存桶 `cph-md-runtime-v1`，约 578KB），与 C++ / Python 工具链同一套路数。**完整说明与坑都在第 15 节。**
- **界面双语（2026-09-29 加）**：界面文案分**中文 / 英文**两套，语言存在 `cph.uiLocale`，默认**跟随浏览器**（`navigator.languages` 任一命中 `/^zh\b/i` → `zh-CN`，否则 `en`；存档优先于探测）。切换入口在设置视图「外观」组的「界面语言」下拉，**切了当场生效、不重载**。实现是自写的轻量模块（`src/i18n/`，**没有引 vue-i18n**），词条按域拆成六个文件、同一文件里中英两栏并排。翻译范围是「UI + 应用内帮助 + guide.html 整页」三块（**致谢页的双语是 2026-09-30 另外补的**，不走 i18n 机制，而是中英各一份源文件 + 一次生成两页，见第 12 节）；`guide.en.html` 是 `guide.html` 的逐条对照版（见第 12 节）。**最容易踩的一条**：数据表里只能存 key、由模板 / computed 再 `t()`，详见第 5 节坑 28。
- 技术栈：Vue 3（Composition API + `<script setup>`）+ Vite 8 + **纯原生 CSS**（没有 Tailwind，也没有任何组件库 / UI 库）。
- 重量级第三方依赖只有 `monaco-editor` 和 `@runno/wasi`（浏览器里跑 clang）；`puppeteer-core` 只给无头回归脚本用；`binaryen` 是 devDependency，只服务 `npm run wasm:opt`（不进产物、不影响运行时，卸掉它会自动回退到系统级 wasm-opt）。新增 npm 包要先讨论。
- **计划与待办都在第 14 节**，每条都带着要避开的坑与落地顺序。2026-09-28 一天里落地了：14.1「合并侧栏切换钮」、14.5「文件归类」的**固定落盘结构**（只剩配置 UI）、**14.8「换新建图标」**、以及 **14.11 的第一阶段（VS Code 式目录内新建）**；同日还删掉编辑器页签栏那颗运行按钮、并给胶囊配了 `Mod+Shift+KeyE` 快捷键，另**计划外**落地了**全局界面缩放**（默认 110%，档位 100% / 110% / 125% / 150%，见 14.12 与第 5 节坑 24）。仍待做 5 项：VFS 优化 / 默认模板 / 文件归类设置（配置 UI）/ 比赛模式 / 设置页 UI 精修，外加 14.11 的**嵌套路径**阶段。**2026-09-29 又落地了两条**：**14.3「题目时限接入」**——题目自带的时限存进节点 `meta.timeLimit`，判题时优先于全局档位（见该节）；**14.14「界面双语（中 / 英）」**——自写 `src/i18n/`（未引 vue-i18n），界面语言存 `cph.uiLocale`、默认跟随浏览器、设置视图「外观」组可切；范围含 UI + 应用内帮助 + `guide.html` 整页（英文版是 `guide.en.html`，见第 12 节）。同日还重写了 `guide.html` / `HelpPanel.vue` / `docs/使用手册.md` 三份文档（体例：小标题一律疑问句、操作走数字列表、实测性能数字见 `guide.html` 第 4 节）。**2026-09-30 落地了 14.9「登录 + 云同步」**（Cloudflare Worker + KV，落地位置与坑见 14.9；网址形态的入口 `www.998244353.best/<handle>` 见 14.21）**与 14.15「题解（Markdown / LaTeX）」**（七步，见第 15 节），同日还补了致谢页的英文版（`NOTICE.en.md` → `notice.en.html`）与右键菜单「打开题目链接」。
- **站点显示名当前是占位符 `unnamed`**（2026-09-29 由原「CPH IDE」整体改来，等定好新名再替换一轮）。出现处固定这几处，改名时照这份清单搜：`index.html`（title / apple-mobile-web-app-title / og / twitter / ld+json / noscript 正文）、`guide.html` 与 `guide.en.html`（**两版都要搜**；同样一组 + 页头 `.brand__name` + 各处正文）、致谢页（**页头品牌名与标题里的 `unnamed` 在 `scripts/render-notice.mjs` 的 PAGES 表 / `NOTICE*.md` 里，不是在生成物里改**——`notice.html` / `notice.en.html` 是生成物，改完跑 `npm run notice`）、`src/i18n/messages/*.js` 里正文出现的品牌名、`public/manifest.webmanifest`、`public/robots.txt` 与 `public/sw.js` 的注释、`src/components/TestPanel.vue` 的 `aria-label`、`docs/使用手册.md`、本文件。**别顺手改另外两样**：① `cph.*` 开头的 localStorage 键名；② `cph-vfs` / `cph-pch` 的 IndexedDB 库名 —— 都是持久化契约，改了等于把用户的偏好与题解全丢掉（题目元数据的 `.cph/` 目录已于 2026-10-01 取消，如今只剩 `migrate.js` 里认老数据用的那个常量）。**能改的只有主题 id**（`dark` / `light`，同日已去掉 `cph-` 前缀，改动清单与迁移见第 1 节首行与第 6 节）。`package.json` 的 `name: cph-ide` 是 npm 标识、与展示无关，未动。

## 1. 硬约束（改样式时最容易被打破的几条）

| 约束 | 说明 |
| --- | --- |
| 只有两套主题 | 主题 id 是 `dark`（默认）/ `light`（2026-09-29 去掉 `cph-` 前缀）。这一个串**有四处身份**：Monaco 自定义主题名（`src/monaco-setup.js`）、`<html data-theme>` 的值（`base.css` 的选择器）、`services/editorOptions.js` 里 `THEMES` 的 id 与默认值、以及**存档里 `theme` 字段的取值**（`guide.html` 的首帧内联脚本也读它）。改它必须四处同步 + 抬一次 `EDITOR_SETTINGS_VERSION` 做迁移，见第 6 节 |
| 颜色只走 CSS 变量 | 组件里**不许**出现写死的十六进制颜色；所有色值定义在 `src/styles/base.css` |
| 新增变量必须定义两遍 | `:root` 和 `:root[data-theme='light']` 都要给值，否则浅色主题下会串色 |
| 禁止第三方 UI 库 | 抽屉 / 弹层 / 下拉全部原生 CSS + Vue + `Teleport` |
| 侧边栏页头的图标不许溢出 | 页头左侧是一枚**面板胶囊开关**（两段，共 60px）+ 一颗独立的设置钮（26px）+ 4px 间距 = 90px，渲染在**两个面板各自的页头**里；最窄的面板下限是 158px（320px 视口），实测仍留 64px 给右侧的动作按钮（新建文件 / 文件夹）。**别给图标加文字、别加大 `gap`、别加第三段/第三颗**——页头没有折行兜底（`FileExplorer` 的 `.explorer__head` 是固定 `height: 35px`），撑不下就直接溢出。整枚胶囊是一颗 toggle 按钮（点它任意位置都翻到另一个面板），里面的两段是纯视觉指示——**别把点击下放回某一段**，那会在胶囊里留出点不动的边 |
| 运行入口只剩两处 | 编辑器页签栏右端那颗「运行 / 停止」按钮已于 **2026-09-28 删除**（它当时是侧栏收起后唯一的点击入口）。现在只剩：全局快捷键 `Mod+Enter`（捕获阶段监听，见坑 21）、评测样例面板页脚那颗 ▶。两个入口都并到 `App.vue` 的 `runAll()`，跑之前都会 `revealTestsPanel()` 把侧栏亮出来（见第 3 节「开跑必亮结果」）。**别再往页签栏加运行按钮**：`.editor-tabs` 现在只有 `.editor-tabs__strip` 一个子元素、`flex: 1 1 auto` 铺满整行 |
| 面板下限只在 CSS 里定义一份 | 侧边栏最低宽度由 `.workspace` 上的 `--tests-min-cap / --tests-min-ratio / --tests-min-floor` 决定（即 `.pane--tests` 的 `clamp(160px, 50%, 320px)`；变量名里的 `tests` 是历史沿革，统一侧边栏沿用同一套），`measureLimits()` 读同一组变量复算；改数字只改 CSS 那三行，别在脚本或组件里再写一份 |
| 侧边栏内部只用 `v-show` | 整栏显隐、栏内两个面板（资源管理器 / 评测样例）的切换**都是 `v-show`**：文件树的展开状态、样例里手填的输入与卡片折叠态都挂在 DOM 上，改成 `v-if` 会在切换时被销毁重建，用户数据直接丢。**「设置」也在这一栏里，但它不是第三个面板**——它是编辑区里的合成页签，页头那颗图标只负责开关那个页签，不参与两个面板的 `v-show` 切换（见第 5 节坑 7） |
| flex 容器的子元素要显式拉伸 | 布局里 `.pane > *` 必须 `flex: 1 1 auto; min-width: 0`，否则子组件收缩到内容宽度 |
| Monaco 只能动态改 | 设置项变化走 `editor.updateOptions()` / `monaco.editor.setTheme()`，**不要重建实例** |
| 设置要持久化 | 统一用 `src/composables/usePersistentRef.js`（存的是 JSON 字符串，见第 5 节的坑） |
| SW 改了**外壳**策略就升 `SHELL_VERSION` | `public/sw.js` 的 `SHELL_VERSION` 只决定外壳桶名（现为 `cph-shell-v4`）；改外壳缓存内容或策略时必须同步升它，否则老用户会一直吃旧桶。**工具链桶名是硬编码的 `cph-toolchain-v3`，刻意不跟版本号走**——工具链是随 URL 固定的二进制（clang 52MB + CPython 24MB），跟外壳改不改无关，绑在一起会让每次升外壳都逼老用户重下 76MB。要换代工具链时才手动改那一行 |
| 图标是构建产物之外的静态资源 | `public/icons/*.png` 直接进产物，**不在**构建清单里，改动它们要同步 `sw.js` 的 `STATIC_ASSETS`（见第 9 节） |
| 扩展安装包文件名必须带版本号 | `public/extension/cc-for-web-<版本>.zip`。它同理不在构建清单里，但**故意不进 `STATIC_ASSETS`**——发新版靠的是换个文件名（SW 对同源 GET 走 `cacheFirst` 且不重新校验，同名覆盖会让老用户一直下到旧包），见第 13 节 |
| 导入题目挂在 VFS 节点上，不许另立存储 | 一道题 = 一个代码文件 `/<年月>/<OJ 标签>/<难度>/<题名>.cpp`（直接挂根下，无外层 wrapper；年月粒度 `YYYY-MM`；难度导入时一律为空，先落「未分类」）。题目信息（`node.meta`）与抓到的样例（`node.config`）都挂在这个文件节点上，树里不另有条目（2026-10-01 起；旧版是同级隐藏的 `.cph/<题名>.json`，由 `migrate.js` 一次性搬进节点）。代码文件只在首次导入时创建，**此后正文一个字都不动**（那是用户写的题解），样例整体覆盖而难度由用户手填、重抓要保留；题目身份认 `url` 不认文件名，且**必须全库按 `node.meta.url` 找回原文件**（分层后同一道题会算出新路径，只扫一个 OJ 目录会让老题解变孤儿）。改这里等于动用户数据，见第 13 节 |
| 全局快捷键监听必须在 `window` 捕获阶段 | `window.addEventListener('keydown', onKeydown, true)` + `preventDefault()` + `stopPropagation()`。Monaco 的键位服务挂在编辑器内部 DOM 上，只有捕获阶段抢得过它；**不要**再用 `editor.addCommand()` 同步键位（Monaco 0.56 没有 `removeCommand`，旧的撤不掉） |
| 录制快捷键时全局监听必须让路 | 开录时置 `recordingActive = true`（录制框自己的监听在按钮的目标阶段，捕获永远先跑），否则按下新组合键的瞬间功能会先被执行一遍 |
| 禁止引第三方快捷键库 | 规范化只需要「读 `event.code` + 四个修饰键」，`useShortcutManager.js` 里一个纯函数就够（Mousetrap 之类一律不引） |
| px / rem 的边界纪律 | CSS 里写 `px`，构建时由 `postcss-pxtorem` 统一转 `rem`（配置在 `vite.config.js` 的 `css.postcss`），全局缩放只改根字号。但**转换只发生在 CSS 声明值上**：JS 内联样式、JS 常量、`@media` / `@container` 断点参数都不受影响（见第 5 节坑 24）。三条判据：① 物理尺寸（鼠标坐标 / DOM 原生测量 / 手势阈值）永远保持 `px`；② 逻辑尺寸里，喂给 Monaco 的 `fontSize / lineHeight / scrollbarSize / padding`、以及 JS 写死的容器上限必须自己乘 `scale`（见 `composables/useUiScale.js` 的 `px()`）；③ 被 JS `parseFloat` 读的 CSS 变量（`--tests-min-*`）必须在 `propList` 排除名单里留在 px 坐标系，**不要**在 JS 里对 parseFloat 结果做 rem 反向换算——代价是它们吃不到 rem 的自动缩放，所以这类「以物理 px 存放、但语义上是逻辑尺寸」的值要在**使用处**乘一次缩放倍数（JS 用 `uiScale.value`，CSS 用 `--ui-scale`），见第 5 节坑 24 |
| 界面文案不许写死 | 组件、composable、service 里**一律不许出现中文字面量**（现在只剩注释里有中文）。模板与 computed 里写 `t('域.组.键')`，整棵内容树（应用内帮助）走 `messages('help')`。加新文案 = 在 `src/i18n/messages/<域>.js` 里**中英两栏同时补**（同一文件里并排），缺哪一栏会静默退到中文。唯一例外是**写进文件系统的名字**（见下一条）与 `[unnamed]` 这类控制台前缀（见第 5 节坑 28 第 5 条） |
| 数据表只存 key，不存译文 | `EDITOR_GROUPS` / `SECTIONS` / `RUNTIMES` / `THEMES` / `SHORTCUT_ACTIONS` / `OJ_LIST` / `LUOGU_LEVELS` / 各引擎的 `labelKey` 都只存 `labelKey` / `hintKey` / `titleKey`（可带 `labelParams`），由消费处再 `t()`。**在模块顶层或 `<script setup>` 顶层调 `t()` 会冻结成那一刻的语言**——切语言不跟着变，是最容易漏的一类（第 5 节坑 28 第 1 条） |
| 写进文件系统的名字不翻译 | `vfs/problemImport.js` 的 `未分类` / `未命名题目`、`problemMeta.js` 里 `OJ_LIST[].dirName`（洛谷 / Codeforces / 牛客…）都会变成**真实目录名 / 文件名**。跟着界面语言变会让同一个逻辑位置出现两个目录（老用户切换语言后找不到自己的题）。所以显示名走 `labelKey`、落盘名走 `dirName`，**两个字段刻意分开**，主应用与两份 guide 的正文里也照写 `未分类` 不译。同理 `cph.*` 键名、IndexedDB 库名、主题 id 都不随语言变 |

## 2. 与界面相关的文件

```
index.html                      # 主应用入口：挂载点 + PWA（manifest / apple-touch-icon / theme-color，见第 9 节）+ 一整套 SEO 头（canonical / og / ld+json）+ 服务无脚本抓取器的 noscript 兜底正文（见第 12 节；那块正文**是给搜索引擎看的文案**，改界面能力时别忘了它）
guide.html                      # 第二个 Vite 入口：使用指南长文（静态、无 Vue、无 JS），给搜索引擎直接抓取；样式在 src/styles/guide.css（见第 12 节）
guide.en.html                   # 第三个 Vite 入口：上面那页的**英文版**，逐条对应（同为 12 节、同序、同数字），共用同一份 guide.css；两页用 hreflang 互链 + 页头各有一颗语言切换链接。**内容改了必须两版一起改**（见第 12 节）
vite.config.js                  # 五个 rollup 入口（index / guide / guideEn / notice / noticeEn）+ COOP/COEP 响应头（本地沙箱的硬前提，别动）+ 构建期产出 precache-manifest.json + `css.postcss` 里的 postcss-pxtorem（全局缩放的 px→rem 转换，四项防御与判据见第 5 节坑 24）
vercel.json                     # 部署侧同一组响应头 + .wasm 的 MIME 与 immutable 缓存 + manifest/sw.js 的响应头 + sitemap.xml 的 MIME（见第 10 节）
public/manifest.webmanifest     # PWA 清单：display standalone、start_url /、scope /
public/sw.js                    # Service Worker：预缓存外壳（工具链与题解渲染器都不预缓存、改为按需落缓存），导航网络优先（见第 9 节）。`MD_CACHE = 'cph-md-runtime-v1'` 与 services/mdRuntime.js 的 CACHE_NAME **必须逐字一致**（见第 15 节）
public/icons/                   # PWA 图标：icon-192/512、icon-maskable-192/512、apple-touch-icon(180)
public/favicon.svg              # 站点图标（唯一进 STATIC_ASSETS 的 svg）
public/og-cover.png             # 社交分享大图 1200×630（被 index.html / guide.html / guide.en.html 的 og:image 引用）
public/extension/               # 站内分发的浏览器扩展安装包：cc-for-web-<版本>.zip（文件名带版本号是刻意的，见第 1 节与第 13 节）
public/robots.txt               # 抓取规则 + 指向 sitemap
public/sitemap.xml              # 站点地图（三条 URL：/ 与 guide 的中英两版，两版之间用 xhtml:link hreflang 互指）
public/wasm/8.0.1/              # 自托管的 C++ 工具链：clang.wasm / wasm-ld.wasm / clang-fs.tar.gz（约 52MB，进仓库）
public/wasm/python-3.11.3/      # 自托管的 CPython（wasm32-wasi）：python.wasm + python-fs.tar.gz（约 24MB，进仓库）
public/md/                      # 自托管的题解渲染器：katex.min.js / katex.min.css / marked.min.js / fonts/*.woff2（20 个字重）/ assets.json（清单，约 578KB）。**不进仓库**（.gitignore 已忽略）——它是构建输入而不是源码，由 `npm run md:runtime` 从 node_modules 生成，跟着 katex 版本走；同样不在 SW 预缓存清单里，用户点了「下载」才进 `cph-md-runtime-v1`（见第 15 节）
scripts/verify-ui.mjs           # 无头回归脚本（B–H 应当是绿的，A 是已知竞态，见第 8 节；B 步走的是「设置页签」；H 步是 2026-09-30 加的题解回归，见第 15 节）
scripts/optimize-wasm.mjs       # wasm-opt 体积优化（npm run wasm:opt）——**刻意未接进构建**，结论见第 7 节
scripts/prepare-md-runtime.mjs  # 把 node_modules 里的 katex / marked 抄进 public/md/（裁掉 CSS 里的 woff / ttf 回退、写 assets.json），挂在 predev / prebuild 上（见第 15 节）
scripts/render-notice.mjs       # NOTICE.md / NOTICE.en.md → notice.html / notice.en.html（`npm run notice`，已挂在 prebuild 上；`--check` 校验两页是否最新）。语言相关的外壳文案（lang / canonical / 标题 / 描述 / 页头语言链 / 页脚）在文件内的 PAGES 表里，**不写进 markdown**；自写的极简 markdown 子集渲染，不引第三方解析器
NOTICE.md                       # 第三方开源组件清单（致谢 + 许可声明）：一、随产物分发的 npm 运行时依赖（Vue / Monaco / @runno/wasi + 直接依赖的 marked 与 DOMPurify，KaTeX 不在主包里、列在第二节）；二、`public/` 下自托管的上游产物（**2.1** 本地沙箱工具链：LLVM clang + lld 8.0.1 / wasi-libc / libc++ / compiler-rt / CPython 3.11.3；**2.2** 题解渲染运行时 public/md/ 的 KaTeX 0.18.9 + marked 14.0.0）；三、图标与字体（字体全是系统字体）；四、扩展 CC for Web 及其打包的库；五、构建期工具；六、外部评测服务（Piston / Judge0，本仓不含其代码）。**四件事任一发生都要回来同步**：改 package.json / 换 `public/wasm/` 的目录 / **换 `public/md/` 下的渲染运行时** / 换 `public/extension/` 的包；版本号要实机核（文件末尾附了核对命令，第 6 条就是查 `public/md/assets.json`）；面向用户的精简版是两版 guide 的「致谢与开源许可」一节（见第 12 节）。**英文对照版是 `NOTICE.en.md`**（2026-09-30 加，人工逐条对应，没有自动同步）
notice.html / notice.en.html    # **生成物，别手改**：上面两份源文件各自生成的静态页（中 / 英各一页），页头互链 + 三行 hreflang（x-default 指中文页），与两版 guide 同一套类名与主题脚本；两页都不进 SW 预缓存（见第 12 节）
docs/使用手册.md                # 面向新用户的说明：回答三个问题——「如何在本地运行 C++」「如何切换侧边栏面板 / 展开折叠侧边栏」「如何写题解（Markdown / LaTeX）」，与 src/i18n/messages/help.js 内容同源（**精简版**，且只有中文；完整版是 guide.html / guide.en.html）
docs/云端同步服务.md            # ★ 云端同步的后端（Cloudflare Worker `cf-config-api`）的**唯一在仓库记录**：拓扑 / Worker Route、身份验证模型（Codeforces handle 的 Last name）、五个接口的实测契约与错误原文、KV 键与 TTL、实测确认的行为（验证成功即删码 / 取新码作废旧码）、前端 `SYNC_KEYS` 白名单与登录语义，以及方案 A（设备令牌）的四处服务端补丁 + 前端令牌接线（`cp.cloudToken`、「上传本机设置」有令牌时直打 `/api/save`、401 自动退回取码）+ 部署自测命令。**Worker 源码不在本仓库**（也没有 wrangler 工程），所以改它之前先读这份文件、改完回来更新它
src/
  main.js                       # 挂载 + 生产构建里注册 Service Worker
  monaco-setup.js               # Monaco 的 dark / light 两套自定义主题
  i18n/index.js                 # ★ 界面双语的唯一权威：locale（模块级 ref 单例）/ setLocale / t(key, params) / useI18n() / messages(域) + LOCALES（id 与**自称**标签）/ DEFAULT_LOCALE / LOCALE_STORAGE_KEY。**刻意不走 usePersistentRef**——界面语言必须在任何组件挂载之前就定下来（首帧不能先闪中文），所以自己同步读写 localStorage、初值在第 0 帧算好；`applyLocale()` 同时维护 `<html lang>`。缺词条先退中文、再原样露出 key
  i18n/messages/{app,engines,explorer,help,settings,tests}.js  # 六个域的词条表：**同一文件里中英两栏并排**，改一处就看得见另一处（help.js 整棵是「应用内帮助」的正文内容树，走 messages('help') 整棵取，不是逐条 t()）
  styles/base.css               # ★ 所有 CSS 变量 + 全局元素样式，改配色只改这里
  styles/guide.css              # 使用指南页（guide.html 与 guide.en.html 共用）的样式：**`@import './base.css'` 后再加长文排版**，两套主题的配色 / 字体 / 滚动条仍来自 base.css，这里一律 `var(--…)` 引用、不写十六进制（见第 12 节）。唯一要小心的：base.css 是为「满屏 IDE」写的（`html/body` 高度 100%、body 锁死滚动），内容页必须把那两条放开，否则长页滚不动
  App.vue                       # 布局骨架（workspace / pane / splitter）+ 全局状态；另外挂两件全局事：window 捕获阶段的 keydown（快捷键，`SHORTCUT_HANDLERS` 把动作 id 接上真函数）与 `useCompanionImport()`（接扩展投来的题目）
  composables/usePersistentRef.js
  composables/useUiScale.js       # ★ 全局界面缩放的唯一权威：uiScale 单例 + 档位表 UI_SCALE_OPTIONS + px()（设计 px → 真实 px）+ applyUiScale()（落根字号）+ normalizeUiScale()（读盘校验）。三条边界见文件头与第 5 节坑 24
  composables/useInstallPrompt.js  # 设置视图「应用」分组里「安装到设备」按钮的数据源：拦 beforeinstallprompt，用完即弃
  composables/useMobileKeyboard.js # 触摸屏「键盘模式」：视口收缩 + 不抢焦的保焦拦截（见第 3 节末）
  composables/useCompanionBridge.js # ★ 扩展消息接收端：window.postMessage 握手（cph-ping → cph-info）与题目投递（cph-task）。状态是**模块级单例**（扩展装没装是全局事实，各组件不该各探一次）；同站多开标签页时扩展会广播，按 taskId 去重
  composables/useCompanionImport.js # 订阅扩展题目 → 调 problemImport 落盘 → 把样例**整体替换**进评测面板 → nextTick 后抢焦点。它是 problemImport 返回值的唯一消费方
  composables/useShortcutManager.js # ★ 全局快捷键的唯一权威：动作表 SHORTCUT_ACTIONS + 绑定表 + comboFromEvent 规范化 + 冲突检测 + localStorage。**刻意不挂组件生命周期**（App 的全局 keydown 与 EditorPane 的状态栏提示都要在任何组件挂载前就可用）
  components/
    HotkeyRecorder.vue          # 单个动作的快捷键录制框：点一下开录、冲突红字且拒绝写入、Esc 放弃、Delete 清除绑定；开录时置 recordingActive 让全局监听让路（见第 13 节）
    EditorPane.vue              # 编辑区容器：Monaco 画布 + 设置视图（两者 v-show 互斥）+ 底部状态栏；把 judge / connection 透传给设置视图（运行状态不再透传——页签栏那颗运行按钮已删）。**题解那一行（工具栏 / 插入行 / 字数 / 视图胶囊 / 全屏按钮 / 预览面板）与 Monaco 侧那 14 条 `addAction` 也都在这个文件里**，见第 15.6 / 15.7 节；状态栏的四道闸门在样式表末尾（第 15.8 节）
    EditorTabs.vue              # 编辑器标签栏：只有一条 `strip`（文件页签 + 「设置」合成页签，横向滚动）。右端那颗「运行 / 停止」按钮已于 2026-09-28 删除（运行入口见第 1 节硬约束表）
    EditorSettingsPanel.vue     # 设置视图：铺满编辑区、与代码文件平级的合成页签（不再是抽屉 / Teleport）；「目录 + 内容」两栏，目录 = **常用设置** / 外观 / 编辑器 / **快捷键** / 评测 / 本地运行环境 / **浏览器插件** / **云端同步** / 应用 / 帮助（共 10 项，`SECTIONS` 常量驱动，顺序即 `scripts/verify-ui.mjs` 里 `navItems === 10` 的断言口径）。「常用设置」是最前面那个分类、也是默认选中项，里面的主题 / 界面缩放 / 字体大小 / 侧边栏位置与原分类是**同一份数据**（不是副本）；「云端同步」管登录绑定与「预下载本地运行环境」开关，后端见 `docs/云端同步服务.md`。「外观」那组管主题 / 字体大小（`APPEARANCE_ROWS`，仍是 editorSettings 的键）与侧边栏位置 / 界面缩放（各有自己的出口）；「编辑器」那组按 `EDITOR_GROUPS`（字体 / 编辑 / 光标与高亮 / 视图 4 小节，共 22 行；2026-09-30 在「视图」小节末尾加了 `statusBar`）数据驱动渲染，每行只写「键 + 标签 + 控件类型 + 可选项」，可选项表全部来自 services/editorOptions.js；「快捷键」那组按 `SHORTCUT_ACTIONS` 渲染 `HotkeyRecorder`；「本地运行环境」那组按 `RUNTIMES` 表渲染**三行运行时**（C++ / Python / 题解渲染器，同一套代码，`language === 'markdown'` 时由 wasmRuntime 转给 mdRuntime，见第 15.3 节）；「浏览器插件」那组管扩展的安装包下载 / 状态探测 / 插件侧快捷键查看（两个常量 `EXTENSION_VERSION` / `EXTENSION_FILE` 决定下载地址，升版本只改这里 + 换 zip）
    EngineSettingsPanel.vue     # 「评测」分组里的引擎列表 + 服务地址 + 自检（原顶栏「评测引擎设置」弹层的正文）
    HelpPanel.vue               # 「帮助」分组里的问答列表 + 完整指南链接（原顶栏「?」抽屉的正文，现只读、无按钮 / Teleport，与 docs/使用手册.md 同源）。**体例（2026-09-29 定）**：`GROUPS` 是「分组 → 条目」两层，每条 = `name`（**必须是疑问句**，它就是小标题）/ `role`（一句话答案）/ `steps`（操作步骤，渲染成 `<ol>` 1. 2. 3.）/ `notes`（要点与口径，渲染成圆点）/ 可选 `table`（判定码、性能实测这类多列短值）；正文里用 `**…**` 标出界面上的按钮名与页面名，`segments()` 负责拆成加粗片段（**不走 `v-html`**：文案里会出现 `<vector>` 这类头文件名，交给 HTML 解析会被当标签吃掉）
    MarkdownPreview.vue         # 题解预览面板（2026-09-30 加）：渲染状态机（`pending` / `missing` / `downloading` / `failed` / 就绪）、160ms 防抖、缺渲染器时的「下载渲染器」入口、与编辑器的**双向滚动同步**（比例 + 回音吃掉 + 重渲染后按 lastRatio 复位）。只接受 source 字符串、不认识 Monaco（见第 15.4 / 15.5 节）
    Sidebar.vue                 # ★ 统一侧边栏外壳：用 v-show 切换两个面板（资源管理器 / 评测样例），面板本体由 App.vue 经具名插槽（#explorer / #tests）填入；页签状态（cph.sidebarTab）与持久化留在这里，经 provide 下发给页头里的切换组件。自己不管宽度与整栏显隐——那是外层 .pane--tests 的事。另 `defineExpose({ showPanel })` 供父组件从外部切面板（App.vue 跑测试时要把「评测样例」亮出来），状态仍只有这一份
    SidebarSwitcher.vue         # 侧栏页头里的两组入口（2026-09 加）：面板胶囊开关 + 设置。不再独占一行页签栏，而是渲染进两个面板各自的页头里（同一时刻只有一个面板可见，视觉上只有一份）；只画 logo 不写字，名字在 `title` / `aria-label`；状态从 Sidebar 的 provide 取（`panels` / `targetPanel` / `togglePanel` / `settings` / `toggleSettings`），自己不存状态。面板那枚：`.sidebar-switcher__pill` **本身是一颗 `<button>`**（点任意位置 toggle，高度 26 / 13px 圆角 / 底色 `--bg-control`），里面 `v-for` 出两段 `<span class="sidebar-switcher__seg">` 作纯视觉指示（28×22、11px 圆角，当前段 `.is-active` 填 `--accent` + `--text-on-accent`，并打 `data-panel` 与 `data-current`）。设置那颗 `gear`（开关编辑区里的设置页签，`settingsTab`，不落盘）在轨道外，是独立的圆形按钮。切换时选中段播一次滑动动画（见第 4 节类名表与第 5 节坑 5c），只在 `[data-switched]` 下放
    FileExplorer.vue            # 资源管理器面板（Sidebar 的 #explorer 插槽）：页头左侧是 SidebarSwitcher、右侧是新建文件 / 文件夹两颗按钮 + FileTreeItem 树 + 右键菜单（`ContextMenu`，经 `provide('openContextMenu')` 下发给树节点）+ 删除确认弹窗（自绘，见第 5 节坑 11）+ 题目信息弹窗（自绘，同款，见第 5 节坑 17）。新建的**目标目录可以是任意目录**：页头两颗按钮跟随树内聚焦的节点，右键目录则显式指定；新建的**状态与提交都收在这里**（`creating` / `createFlights` / `commitCreate`），输入行本体见 InlineCreateRow.vue（见第 5 节坑 12）
    InlineCreateRow.vue         # 内联新建的输入行（2026-09-28 从 FileExplorer 里抽出来）：根目录那份由 FileExplorer 渲染、某个目录里那份由 FileTreeItem 渲染，两处共用。挂载时把 `{ focus }` 注册进 `provide('creatingRow')`，供「程序性失焦后把焦点抢回来」用（见第 5 节坑 12）
    FileTreeItem.vue            # 文件树节点：展开态存在自己身上，靠 Sidebar 的 v-show 保住；右键 `@contextmenu.stop` 把事件交给 FileExplorer（**`.stop` 不能删**，见第 5 节坑 14）；目录展开时还会在 `role="group"` 内、递归 `v-for` 之前渲染一份 InlineCreateRow（见第 5 节坑 12）
    ContextMenu.vue             # 通用右键菜单：Teleport 到 body、fixed 定位、挂载后按视口四边收敛、点外部 / Esc / 失焦关闭。目前只有文件树在用（文件节点给「打开题目链接（仅当 `meta.url` 是 http(s) 链接）/ 题目信息 / 重命名 / 删除」，目录节点给「新建文件 / 新建文件夹 / 重命名 / 删除」、不给题目相关的两项）
    TestPanel.vue               # 评测样例面板（Sidebar 的 #tests 插槽）：页头左侧是 SidebarSwitcher、右侧是 verdict（「全部 AC / n/m AC」）与耗时 + 用例列表 + 页脚运行按钮
    TestCaseCard.vue            # 单个用例卡片：徽标（AC/WA/CE/TLE/RE/ERR 判定码）/ 耗时 / 输入框 / 输出块。输入与期望输出**超过 6000 字符时显示切成「开头一段 + 省略行」**（框仍可编辑，但只能改省略行之前那段；全选复制与运行走的都是完整内容）；**没到 6000 但已超出框高（约 15 行）时没有任何标记**（字符一个没少、拖滚动条就能看全，底边仍是实线、框下也没有小字）；底边虚线与小字**只给真被截断的那种**；**框内那行标记就是一个光秃秃的 `……`，省略了多少一律由框下面那行「还有 N 个字符未显示 + 复制全部」说明**（那行只在真截断时出现；这个 `……` 时有时无的两条原因见第 5 节坑 26）
    AppIcon.vue                 # 内联 SVG 图标集（name 取图标名）。三张表：PATHS（24×24 描边线性图标，主力）/ SOLID_PATHS（整块实心品牌标，`fill: currentColor`）/ VIEWBOX（不在 24 网格上的图标的专用方框）。语言图标的两个坑见第 5 节坑 16（`.md` / `.markdown` → `markdown`，2026-09-30 加，配色 `--icon-markdown`）；设置目录用的 `keyboard`（快捷键）与 `plugin`（浏览器插件，拼图形状，刻意区别于「应用」组的 `install` 图标）也在 PATHS 里；新建按钮专用的 `file-plus` / `folder-plus`（2026-09-28 加，见 14.8）同表；**题解工具栏那 13 个线性图标与全屏用的 `expand` / `collapse`（2026-09-30 加）** 同样在 PATHS 里，键名与 `services/mdFormat.js` 的 `MD_TOOL_GROUPS` 一一对应（见第 15.6 节）
  services/                     # 判题逻辑，改样式基本不碰
    runner.js                   # 逐用例调度（并发 2）+ 进度回调；引擎 outcome 翻译成卡片 verdict（AC/WA/CE/TLE/RE/ERR）
    compare.js                  # 实际输出与期望输出比对，只返回布尔（不再产出「输出多 N 行」之类 hint）
    templates.js                # 各语言默认模板；`LANGUAGES` 里 **markdown 是「非判题语言」**（只有展示标签与默认扩展名，没有 piston 字段，引擎不认它），`MARKDOWN_TEMPLATE` 是新建 .md 的题解骨架（见第 15.2 节）
    monaco/language.js          # 文件路径 → Monaco languageId（`.md` / `.markdown` → 内置 markdown 分词器；头文件统一按 cpp 高亮）；语言路由只在扩展名这一处
    mdView.js                   # ★ 题解视图状态的唯一权威：视图模式 / 全屏 / 滚动同步的前提判断（见第 15.5 节）
    mdFormat.js                 # 题解工具栏的纯变换层：MD_TOOL_GROUPS / MD_SHORTCUTS / formatMarkdown / markdownStats（见第 15.6 节）
    mdRenderer.js               # 题解渲染管线：marked（含 $…$ / $$…$$ 扩展）→ DOMPurify → KaTeX 填公式（见第 15.4 节）
    mdRuntime.js                # 题解渲染运行时的本地侧：/md/assets.json 清单 + cph-md-runtime-v1 缓存桶 + 探针 / 下载 / 卸载 / 注入（见第 15.3 节）
    editorOptions.js            # 编辑器偏好的单一出处：默认值 24 项 + 可选项表 + 逐键校验 + 偏好 → Monaco 选项（编辑器级 editorOptions(settings, scale) / model 级 editorModelOptions()）。**`scale` 是全局缩放的补偿点**：Monaco 不吃 rem，fontSize / lineHeight / padding / scrollbarSize 都在这里乘 scale；tabSize 不乘（列数不是像素），见第 5 节坑 24。最后一项 `statusBar`（默认开，2026-09-30 加）**不是 Monaco 选项**、不进 `editorOptions()`，它只管编辑区底部那条状态栏的显隐（见第 15.8 节）
    problemMeta.js              # 题目元数据的单一出处：OJ 表（洛谷/Codeforces/AtCoder/牛客/LeetCode/其它）+ 难度口径（CF·AtCoder 分数段 800…3500 / 洛谷八级 / 其余自由文本）+ 逐键校验 normalizeMeta() + 悬停文案 formatMetaTooltip()。meta **五项**：url / oj / difficulty / date / **timeLimit**（毫秒，100–60000，0 = 未设置；判题时优先于全局档位，见 14.3 与第 5 节坑 17）
    engines/                    # 引擎注册表：piston（默认）/ judge0 / wasm / echo
    wasmRuntime.js              # 本地沙箱的唯一入口：语言路由 + 阶段播报 + 看门狗 + 串行队列 + PCH 后台预热。**另外它还兼着「运行时」这个概念的三个出口**（probeRuntime / preload / uninstallRuntime），`language === 'markdown'` 时转给 mdRuntime —— 设置视图「本地运行环境」才能用同一套代码渲染三行（见第 15.3 节）
    runnoSandbox.js             # runno 双管线：C++ 编译（工具链地址、编译产物缓存、PCH 生成）+ Python 解释运行
    vfs/runnoFs.js              # VFS → runno fs 的转换层（fsEntry 记录形状的唯一出处，两个管线共用）
    pchStore.js                 # PCH 的 IndexedDB 存档（原生 API，任何失败都按「没有存档」处理）
    settingsTab.js              # 「设置」合成页签的 UI 状态（刻意不进 workspaceStore/openTabIds、不建模型、不落 localStorage；见第 5 节坑 7）
    cloudProfile.js             # ★ 云同步的前端唯一边界：`SYNC_KEYS` 白名单（12 个键）+ `collectProfile` / `applyProfile` + 四个接口封装（`requestCode` / `verifyAndSave` / `saveWithToken` / `fetchCloudProfile`）+ `postJson`（网络失败折成 `{success:false}`、失败带 `status` 以区分 401 与 400）。接口一律走同源相对路径 `/api/*`，理由与坑见 `docs/云端同步服务.md` 与 14.9
    cloudEntry.js               # 网址形态的云配置入口：`captureCloudHandleFromPath()`（启动时读 `location.pathname` 的 `/<handle>`，写进 `pendingCloudHandle`）+ `markCloudEntryHandled()` / `clearPendingCloudHandle()`。**只登记**：不自动套用、不自动登录、不写 `cp.cloudAccount` / `cp.cloudToken`；「已答过」的记号写在 `history.state`（键 `cpCloudEntry`）、地址**保持原样不抹回根路径**。见 14.21
    vfs/problemImport.js        # 扩展题目 → VFS 落盘（`/<年月>/<OJ 标签>/<难度>/<题名>.cpp`，无外层 wrapper；题目信息与样例挂在**该文件节点**的 `meta` / `config` 上）：OJ 辨认、题名清洗、按 url 全库认题、名字去重、batch 落库、打开文件。改这里等于动用户数据，见第 13 节
```

## 3. 布局骨架（改布局 / 尺寸看这里）

`App.vue` 模板（`src/App.vue:551` 起）：

```
div.app（column，100% 高；padding 只有安全区，2026-09-28 起顶栏已删，工作区直接贴顶）
└─ main.workspace            flex: 1 1 auto; min-height: 0; padding: 6px; 背景 --bg-editor
   │                         类名状态：is-left / is-dragging / is-swapping / is-collapsed
   ├─ section.pane.pane--editor   内联 flexBasis = editorShare%
   │    └─ EditorPane
   │         ├─ EditorTabs            strip（页签，横向滚动，铺满整行）
   │         ├─ 编辑器画布 或 EditorSettingsPanel（v-show 互斥）
   │         └─ footer.editor-pane__status
   ├─ div.splitter                role=separator，键盘左右微调，双击折叠
   │    ├─ span.splitter__line    悬停/拖拽才亮（2px）
   │    └─ span.splitter__dots    三点抓手，常驻可见
   └─ section.pane.pane--tests    内联 flexBasis = (100 - editorShare)%，v-show 控制整栏显隐
        └─ Sidebar               统一侧边栏外壳（一个整体参与拖拽）
             └─ div.sidebar__body        内容区（flex: 1 1 auto; min-height: 0）
                  ├─ div.sidebar__panel  v-show="activeTab === 'explorer'" → FileExplorer
                  │      └─ header.explorer__head   ← SidebarSwitcher（左，面板胶囊 2 段 + 设置 1 颗） + 新建文件 / 文件夹（右）
                  └─ div.sidebar__panel  v-show="activeTab === 'tests'"    → TestPanel
                         └─ header.panel__head      ← SidebarSwitcher（左，同上） + verdict / 耗时（右）
```

侧边栏页头左侧是**一枚面板胶囊开关 + 一颗设置钮**：胶囊整枚是一颗 toggle 按钮（点它任意位置都翻到另一个面板，切 `cph.sidebarTab`），里面两段分别是资源管理器与评测样例、当前所在的那段填亮；胶囊外那颗（2026-09-28 加，顶栏删除后从顶栏齿轮搬来）不切面板，而是开关编辑区里的设置页签（`settingsTab`，见第 5 节坑 7）。因为设置页签是编辑区的东西，关掉它时那颗齿轮的底色也跟着灭——它的状态由 `settingsTab.active` 决定，不走 `cph.sidebarTab`，但它填的是与胶囊选中段同一枚实心蓝（「填亮＝开着」一套语言；它在轨道外、是圆形，不会被误读成第三个面板）。

**开跑必亮结果**（2026-09-28 加）：运行入口有两处——`⌘/Ctrl + Enter`、评测面板页脚的运行按钮（编辑器页签栏右端那颗已于 2026-09-28 删除）——全都并到 `App.vue` 的 `runAll()` 这一个出口。`runAll()` 在通过「正在跑 / 没有用例 / 没有活跃语言」三道前置判断之后、真正开跑之前，会调 `revealTestsPanel()`：侧栏收起了就用 `togglePanel()` 展开（它顺带把 `virtualShare` 接回 `editorShare`，与双击展开同一套收口），然后 `sidebarRef.value?.showPanel('tests')` 切到评测样例。已经在评测样例上就是空操作，不会破坏页签持久化。**别把这段放到 `runAll()` 的前置判断之前**——那样点「停止」（同一个按钮，跑到一半时发的是中止）也会把侧栏弹出来。页签栏那颗按钮删掉之后这条路更关键了：侧栏收起时唯一的点击入口已经没了，`⌘/Ctrl + Enter` 是唯一还能「隔空开跑并把结果亮出来」的手段（无头回归 E 步走的就是它）。

切换栏目的入口（`SidebarSwitcher.vue`，2026-09 加）**不再单独占一行页签栏**，而是渲染在两个面板各自的页头里：同一时刻只有一个面板可见，所以视觉上只有一份，且两个页头里它都贴左——切过去之后按钮位置不动，可以连点。按钮**只画 logo 不写字**（多文件 = 资源管理器，带勾的清单 = 评测样例，齿轮 = 设置，见 `AppIcon.vue` 的 `files` / `cases` / `gear`），名字放 `title` 与 `aria-label`。

**两个面板的入口在 2026-09-28 定稿为「胶囊式开关」**（第 14.1 项的落地结果，见该节），当天改了两轮，最终形态是这两条的合体：

- **视觉像分段控件**：两段图标并排住在一个圆角轨道（`.sidebar-switcher__pill`）里，**当前所在的那段填实心蓝**（`--accent` + `--text-on-accent`）。这守的是「有两个面板可切」，也是第一轮否掉「一颗只有去向往哪儿的动作钮」时提的要求。
- **交互是一颗 toggle**：整枚轨道就是那个 `<button>`，点它**任意位置**（含 2px 内边距、圆角内的边缘、当前段自己）都翻到另一个面板；两段是纯视觉的 `<span>`，不接点击、也没有 `tabindex`。这是第二轮的要求——两段各自可点会在胶囊里留下点不动的边。

所以**别把点击下放回某一段**，也别退回「一颗只有去向往哪儿的单钮」。文案写**将要去的那一个**（`title` / `aria-label` 都是「切换到评测样例」这种祈使句，跟着 `targetPanel` 变）。无头回归的 `sidebarSegActive` 读的是每段上的 `data-current="true"`（哪一段被标记成当前），`sidebarTabs` 读页头两个控件的 `aria-label`。另外「现在停在哪个面板」仍有一个更直接的机器可读出处：`.sidebar__panel[data-panel]`。面板状态是 `cph.sidebarTab`，只有 `Sidebar` 一份（经 `provide('sidebarTabs')` 下发），别让面板各存一份；胶囊外那颗（设置）读的是 `settingsTab.active`。

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

| 视口宽 | 侧边栏宽（= 页头宽） | 页头图标区 | 图标是否溢出 | 页签 strip 宽 | strip 是否横向滚动 | 页面是否横向溢出 |
| --- | --- | --- | --- | --- | --- | --- |
| 1680 | 663 | 60 + 4 + 26 = 90 | 否 | 995 | 否 | 否 |
| 560 | 238 | 60 + 4 + 26 = 90 | 否 | 300 | 否 | 否 |
| 414 | 199 | 60 + 4 + 26 = 90 | 否 | 193 | 否 | 否 |
| 375 | 180 | 60 + 4 + 26 = 90 | 否 | 174 | 否 | 否 |
| 320 | 158 | 60 + 4 + 26 = 90 | 否 | 140 | 否 | 否 |

> 本表 **2026-09-28 重测过一次**（编辑器页签栏右端那颗运行按钮当天删除后）：侧边栏宽 / 页头宽与删除前逐像素一致（663 / 238 / 199 / 180 / 158，五档全中），而「页签 strip 宽」因为不再被那颗 64px 的按钮挤窄而变宽（375 档从 98 → 174、320 档从 64 → 140），所以后两列是新的。测量时默认只开着 `main.cpp` 一个页签，五档都不需要滚动；**strip 自己仍是 `overflow-x: auto`**，页签多起来照常滚——别把「不滚动」当成新契约。
>
> 表里「页头图标区」一列 2026-09-28 改动过两次，最终**回到 90px**：先是「三颗 30px 图标」= 90px（实测值），当天中午合并成一颗动作钮变成 60px，下午按反馈改成胶囊（两段 60px + 间距 4px + 设置 26px）又回到 90px。

- **侧边栏页头图标区**（`SidebarSwitcher`）：`.sidebar-switcher` 是 `inline-flex; gap: 4px`，内含①面板胶囊 `.sidebar-switcher__pill`（**本身是那颗 toggle 按钮**；`padding: 2px` + 两段各 28×22 = 60px 宽，整枚 13px 圆角）②设置钮（26×26 圆形）。三者相加 90px，与最早「三颗 30px」的占位完全相同。最窄档（320px 视口，面板 158px）页头右侧还有新建文件 / 文件夹两颗动作按钮，图标区右缘到动作区仍留 64px。`.explorer__head` 是固定 `height: 35px`、**不折行**，所以给图标加文字、加大 `gap`、往胶囊里塞第三段都会直接溢出——要加先按下面口径重量（见第 1 节硬约束表）。
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
- 拖拽路径也同步：`measureLimits()` 的 `maxShare` 读同一组值，所以「一直往右拖」停在面板下限上（375px 下编辑器 167 / 面板 190，触屏因热区 24px 再让 18px），再往外才是折叠。
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
  - **切文件不抢焦点（2026-09-28 加）**：触屏 390×844，先把焦点 `blur()` 到 body → 轻点**文件树里另一个文件**、以及轻点**页签栏里另一个页签** → 两者都换文件成功（activeTab 改名；轻点文件树走的是**预览页签**，上一个预览会被顶替，所以「页签数增加」不再是判据，见 14.17）且 `activeElement` 仍是 `body`、不在 `.monaco-editor` 里（**改前必红**）；再轻点编辑器正文 → `activeElement` 进 `DIV.native-edit-context`（证明正常入口没被误伤）。鼠标视口 1680×950 下点页签 → `activeElement` 仍是 `.native-edit-context`（证明没回归桌面手感）。
    - **落点要落在编辑器「可视区」里**：`.view-lines` 的 `getBoundingClientRect()` 比 `.monaco-editor` 宽得多（它是内容全宽、被裁掉的），取它的中心点会打到编辑器外面——390px 档实测 `.monaco-editor` 只有 `x:7 w:181`，而 `.view-lines` 是 `x:75 w:314`。要取「两者矩形交集」再取中心，并用 `document.elementFromPoint()` 先确认 `closest('.monaco-editor')` 为真。
  - **本地探针验证不了「真滑动」**：`page.touchscreen` 的合成触摸在我们这个无头 Chrome 里**根本不会滚动**（实测拖动 200px 前后 `.monaco-scrollable-element` 的 `scrollTop` 都是 0）。所以凡是依赖「真的滚起来了」的用例（Safari 在 `touchstart` 就聚焦、系统的键盘重弹）本地一律复现不出，别把绿色当已验过——只能靠真机反馈。可验证的是「touchmove 位移判定」这一层，它不依赖滚动。
  - **选落点要避开本来就会改焦点的地方**，否则用例自己会测糊：卡片头左侧 30px 是折叠按钮（点了会把 `.card__body` 收起，输入框被 `v-show` 藏掉，焦点只能掉给 body）；面板头中部是时限的 `<label>`，点它会把 click 转给 `<select>`，焦点本来就会跟着走。

## 4. 主题与 CSS 变量

- 主题落在 `<html data-theme="...">` 上（`App.vue:79` 的 watch），由 `base.css` 的变量接管；不带 `data-theme` 时即深色。
- Monaco 侧用同一批 id 的自定义主题（`src/monaco-setup.js`），`light` 的底色要和 `--bg-panel` 对齐，否则编辑区和面板会出现两块不同的白。
- 变量分组（`src/styles/base.css`）：

| 分组 | 变量 |
| --- | --- |
| 底色层次 | `--bg-editor` 页面留白 / `--bg-panel` 卡片面板 / `--bg-panel-head` 面板头脚 / `--bg-card`、`--bg-card-head` 用例卡片 / `--bg-chrome` 应用外壳（2026-09-28 顶栏删除后只服务于 `theme-color`） / `--bg-tab-active` |
| 浮层与控件 | `--bg-raised` 浮层底色（右键菜单 `ContextMenu` / 删除确认卡 `.confirm__card`，**已无抽屉**） / `--bg-control`、`--bg-control-hover` 按钮下拉 / `--bg-input` 输入框 / `--bg-hover` / `--bg-selection` |
| 描边 | `--border`、`--border-soft` |
| 文字 | `--text`、`--text-dim`、`--text-faint`、`--text-on-accent`、`--statusbar-text` |
| 强调 | `--accent`、`--accent-hover`、`--accent-strong`、`--accent-deep`、`--focus`（焦点框与分隔条高亮） |
| 运行（评测样例面板页脚那颗 ▶） | `--run-green`、`--run-green-hover` |
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
| `SidebarSwitcher.vue`（style@40） | `.sidebar-switcher`（`inline-flex; gap: 4px`，高 26px，`flex: 0 0 auto`）`.sidebar-switcher__pill`（**本身是 `<button>`**：胶囊轨道 + 那颗 toggle，`padding: 2px`、`border-radius: 13px`、底色 `--bg-control`，hover 提亮到 `--bg-control-hover`）`.sidebar-switcher__seg`（胶囊里的两段，`<span>` 纯视觉、不接点击也没 `tabindex`，28×22 / `border-radius: 11px`，带 `data-panel` 与 `data-current`；段自己是 `position: relative; isolation: isolate`，**只放图标**）与它的 `::before`（**蓝色高亮本体**：`inset: 0` + `border-radius: 11px` + `--accent`，`z-index: -1` 所以压在图标下面、又靠 `isolation` 不会钻到轨道背景后面；默认 `opacity: 0`，`.is-active::before` 才 `opacity: 1`）——两层是给动画拆的，见下）`.sidebar-switcher__tab`（胶囊**外**那颗设置钮，26×26 圆形；`.is-active` 同样填 `--accent`——**不能**退回 `--bg-hover`，那色与隔壁轨道 `--bg-control` 几乎同色，实测两个控件会糊成一块）。只画 logo 不写字，名字放 `title` / `aria-label`（胶囊那颗写「将要去的那一个」）。切换动画**拆成两层、分别挂在不同选择器上**：位移只挂在选中段的 `::before` 上（`sidebar-indicator-from-left` / `sidebar-indicator-from-right`，260ms，house 缓动 `cubic-bezier(0.22, 0.61, 0.36, 1)`，起点是一段宽 `var(--seg-w)`，与段的宽高同源、只在上面的 `--seg-w` 写一次），**段自己不参与 transform，图标因此钉在原格不动**；段的 `color` 另走 `sidebar-icon-light-up`（200ms + 90ms `delay` + `backwards`，只碰颜色不碰位移）——高亮先滑到位、图标随后在原地点亮。四条规则都只挂在 `.sidebar-switcher__pill[data-switched]` 下，首屏不放（见第 5 节坑 5c）。断言时先落到当前可见的那个 `.sidebar__panel` 里，再认 `aria-label` / `data-current` / `data-panel`（`textContent` 都是空的） |
| `TestPanel.vue`（style@93） | `.panel`（`flex: 1 1 auto; min-height: 0`，不再写 `height: 100%`）`.panel__head`（`min-height: 35px` + 上下 4px 内边距，左侧放 `SidebarSwitcher`，`flex-wrap: wrap`）`.panel__heading`（`margin-left: auto`，折行后仍贴右）`.verdict[data-tone]`（文案「全部 AC / n/m AC」）`.elapsed` `.panel__foot` `.run-inline`。**`.select` 已随时限下拉一起移出**（2026-09-29）：时限改在设置视图的「评测」组里，页头不再有下拉 |
| `FileExplorer.vue`（style@330） | `.explorer`（column，`flex: 1 1 auto`）`.explorer__head`（`height: 35px`，左侧放 `SidebarSwitcher`、右上角两颗按钮；两边加起来离面板下限还远，所以**不折行**）`.explorer__actions`（`flex: 0 0 auto`）`.explorer__btn` `.explorer__tree` `.explorer__input` `.explorer__error`；删除确认弹窗（Teleport 到 body，`z-index: 130`）：`.confirm`（遮罩）`.confirm__card` `.confirm__title` `.confirm__desc` `.confirm__path` `.confirm__actions` `.confirm__btn`（`--danger` 用 `--danger-bg` / `--danger-bg-hover` / `--danger-text`） |
| `TestCaseCard.vue`（style@202） | `.card[data-status]` `.card__head` `.badge[data-status]`（文字是 `verdict` 判定码，见第 5 节坑 1）`.metric` `.icon-btn` `.card__body` `.ta`（输入，高度随内容自增）`.out`（输出）`.run-zone`（撑满徽标到删除按钮之间的运行判定区，`.run-zone__icon` 才是那个 22px 的 ▶）。超长样例相关的 `.ta--truncated` / `.out.is-truncated`（只换底边为虚线，**只给真被截断的情形**，即 `xxxHidden > 0`；只是超出框高要滚动的那种字符一个没少，底边仍是实线）与 `.ionote` / `.ionote__text` / `.ionote__btn`（框下面那行提示：「还有 N 个字符未显示 + 复制全部」；**只在截断态出现** —— 纯溢出态一个字符都没少、没有「全部」可复制，这一行与虚线底边都不给；窄容器下靠 `.ionote:has(.ionote__btn)` 把输入框那行与输出块那行区分开）见第 5 节坑 26。框内的截断标记**没有文案**，就是 `MARKER_SEED = '\n\n……'`。旧的 `.hint` 已随 2026-09-18 改动删除 |
| `EditorTabs.vue`（style@106） | `.editor-tabs`（`flex: 0 0 35px`）`.editor-tabs__strip`（`flex: 1 1 auto; min-width: 0`，**横向滚动在这里**，现在铺满整行）`.editor-tabs__item[--active]` `.editor-tabs__dot` `.editor-tabs__label` `.editor-tabs__close`（「设置」合成页签与文件页签共用这套样式）。原 `.editor-tabs__run`（64×25 的运行 / 停止按钮，以及它的 `.is-running`）2026-09-28 已随按钮一起删除 |
| `EditorPane.vue`（style@231） | `.editor-pane` `.editor-pane__stage` `.editor-pane__host`（Monaco 容器）`.editor-pane__empty*` `.editor-pane__status*` |
| `EditorSettingsPanel.vue`（style@837） | `.settings-view`（滚动容器，`container-type: inline-size`）`.settings-view__inner`（目录 + 内容两栏）`.settings-nav*`（左栏分类目录，9 项，`--active` 是选中项）`.setting-group*` `.setting-subtitle`（组内小标题，把「运行时限」与「评测引擎」分开）`.setting-group__note`（分组说明文字，如「应用」组那句）`.setting-row`（**不画行边框**，靠内边距 + `:hover` 底色划分边界；`.is-modified::before` 是左侧 3px `--accent` 「已改动」线）`.setting-row__main` / `__head` / `__label` / `__key` / `__hint` / `__control`（标题 / 键名 / 描述三级灰度：`--text` / `--text-faint` 等宽 / `--text-dim`）`.setting-row--select` / `--number`（上下结构，控件在左下）`--switch`（左右结构，开关靠右上）`--action`（左右结构，按钮 / 录制框居中在右）`.select` `.number-input` `.switch*` `.runtime-list` `.runtime-row*` `.runtime-row__actions`（已就绪时右侧「已就绪 + 卸载」两颗的容器）`.download-button*`（本地运行环境下载 / 卸载 / 「应用」组安装按钮 / 扩展包下载共用；`.is-uninstall` 悬停才转危险色）`.shortcut-key`（插件快捷键只读键位徽标，与 `HotkeyRecorder` 的 `.hotkey` 同观感；**字体必须用 `--ui-font`**，见下）`.setting-code`（行内代码，如 `chrome://extensions/shortcuts`）`.is-spinning`，以及卸载确认弹窗那一组 `.confirm*`（与 `FileExplorer` 同款，Teleport 到 body，见坑 23）（铺满编辑区的设置视图；原 `.panel-drawer*` / `.icon-button*` / `.done-button*` 已随抽屉外壳一起删掉） |
| `HotkeyRecorder.vue` | `.hotkey-field`（右对齐一列）`.hotkey`（录制框，`--is-recording` 描边点亮 / `--is-conflict` 红描边红字 / `--is-empty` 未绑定置灰）`.hotkey-clear`（清除按钮）`.hotkey-error`（冲突红字）`.hotkey-tip`（录制中的 Esc / Delete 提示）。**键位徽标一律用 `var(--ui-font)`，不要图「像代码」改成 `--mono-font`**：等宽字体没有 `⌘` `⇧` `⌥` 这几个字形，浏览器会按字符逐个回退到别的字体，同一枚徽标里符号比字母大一圈、粗细也不一致（2026-09-30 修的就是这个）。同一条理由适用于 `EditorSettingsPanel` 的 `.shortcut-key`；状态栏里 `formatCombo` 那一处本来就是 `--ui-font`，所以改完三处一致 |
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
5. **统一侧边栏里全是 `v-show`**：整栏折叠（分隔条要能用鼠标/键盘把它拖回来）、栏内两个面板的切换，都不能改成 `v-if`——文件树的展开状态与样例里手填的输入都挂在 DOM 上，切换一次就被销毁重建，用户数据直接丢。副作用有两个：（a）「页签内容在 `display: none` 期间量不到尺寸」，凡是靠 `scrollHeight` / 宽高做自适应的组件（如 `TestCaseCard` 的输入框自增）都得自己接住「从不可见变为可见」那一刻，见坑 8；（b）切换按钮（`SidebarSwitcher`）在两个面板的页头里各有一份实例，**按选择器取它时必须先落到「当前可见的那个 `.sidebar__panel`」里**（用 `getClientRects().length > 0` 判可见），否则会同时拿到隐藏那份，脚本/断言会凭空多出一倍。（c）**同一原因让「跨这两个实例的运动」做不了 `transition`**：点一下就是把刚点的那份藏了、另一份亮出来，高亮不是同一个元素在动，`transition` 永远看不到。胶囊的滑动高亮（`SidebarSwitcher` 的 `sidebar-indicator-from-*`，挂在选中段的 `::before` 上、段本身不参与位移）因此用 `animation` ——元素从 `display: none` 变成可见时动画会从头播；并用 `[data-switched]` 挡掉首屏那次（首屏同样是「从隐藏变可见」，可那时并没有发生任何切换）。两份胶囊在屏幕上的位置完全相同，所以「新亮出来的那份从旧位置滑过来」看起来就是同一枚高亮在横移。
6. `@media (prefers-reduced-motion: reduce)` 会全局压掉动画，新增动画不用额外处理。
7. **「设置」是编辑区里的一个合成页签，不是抽屉**（`src/services/settingsTab.js`）：它刻意**不进** `workspaceStore.openTabIds`——那边的 `openTabIds` / `nodeIndex` / 会话恢复全建立在「一个页签 = 一个真实 VFS 节点」之上，塞一个没有节点的 id 进去，`rebuildTree` 会把它当「文件已删除」顺手清掉，`modelManager.release` 也会去找一个不存在的 model。所以它不建模型、不落 localStorage（刷新后回到代码文件是预期行为）。视图与 Monaco 用 **`v-show` 互斥**（不是 `v-if`）：Monaco 实例与设置组件的运行环境探针订阅因此只建立一次。让出激活态统一收口在 `settingsTab.js` 里 `watch(() => workspace.activeId)`；「点已经在活跃的那个文件页签」不改 activeId、不触发该 watch，所以 `EditorTabs.activate()` 里显式再让一次。（「本地运行环境」原先是独立抽屉 + `composables/useLocalRuntime.js`，现两者都不在仓库里了——运行时 UI 已并进设置视图。）设置视图自身是**「目录 + 内容」两栏**（2026-09 改）：左边 `.settings-nav` 是分类目录（外观 / 编辑器 / 快捷键 / 评测 / 本地运行环境 / 浏览器插件 / 应用 / 帮助，`SECTIONS` 常量驱动），右边同一时刻**只渲染一组设置**（`v-if` / `v-else-if`，不是 v-show 平铺），当前分类存在组件内的 `activeSection` 里（不落盘，关掉页签再打开仍记得）；切到「浏览器插件」那一组会顺带 `refreshExtension()` 重探一次扩展状态（`watch(activeSection)`）。原顶栏的「评测引擎设置」弹层与「帮助」抽屉（`HelpPanel.vue`）在 2026-09-28 都并进了这里：引擎列表 / 服务地址 / 自检成为 `EngineSettingsPanel.vue`，挂在「评测」组的「运行时限」下面（`.setting-subtitle` 分开两块）；帮助的问答列表成为「帮助」组，`HelpPanel.vue` 已瘦身成纯内容组件（无按钮 / 无 Teleport / 无 Esc 逻辑）；「应用」组装 `useInstallPrompt()` 的安装按钮（原顶栏那颗）；「快捷键」与「浏览器插件」两组是 2026-09 新加的（见第 13 节）。窄宽度降级不靠 `@media`（设置视图活在编辑区里，视口宽是错的代理），而是在 `.settings-view` 上挂 `container-type: inline-size` + `@container settings (max-width: 560px)` 把目录翻成顶部横向标签条。
8. **用例输入框的高度是 JS 撑的**（`TestCaseCard.vue` 的 `autoGrow`，上限 320px）：改 `.ta` 的内边距 / 字号后高度会自己重算，不用手改。但卡片折叠、以及整个「评测样例」页签被切走时元素都是 `display: none`，此刻 `scrollHeight` 为 0，代码会跳过重算——别把这个空值保护删了，否则折叠一次输入框就被压成 0 高。重算的触发有两处：`watch`（输入变化 / 卡片展开）+ 一个挂在输入框上的 **`ResizeObserver`**（只认宽度从 0 变有值、或面板被拖宽，宽度变大才算，避免回调环）。页签是 `v-show` 切换的，没有重新挂载的时刻，**没有这个 observer 就会一直塌成一行**（旧版只在 `onMounted` 跑一次，切到「评测样例」时必然塌）。
9. **`.run-zone` 是撑满中段的 `<button>`**：里面的 `padding: 0` 不是装饰，是在抵消浏览器给按钮的默认内边距（不抵消的话 ▶ 图标位置会跑偏）；`.run-zone__icon` 才是那个 22px 的 ▶ 本体，悬停点亮的是它。
10. **`theme-color` 是 JS 写的，不是静态 meta**：`App.vue` 切主题时会把 `--bg-chrome` 读出来写进 `<meta name="theme-color">`（装成独立应用后浏览器拿它画窗口标题栏）。`index.html` 里那个 `content` 只是首帧兜底，别在那里维护第二份色值。
11. **删除确认弹窗是自绘的，不要换回 `window.confirm`**：`FileExplorer.vue` 的 `requestDelete()` 只把待删节点记进 `pendingDelete`，真正调用 `deleteNode()` 的是弹窗上「删除」按钮的 `confirmDelete()`。原生 `confirm()` 的返回值在 webview / 装成独立应用窗口打开时不由页面掌控（被浏览器抑制时它自己直接返回一个值），出现过「点取消文件还是没了」。自绘弹窗的取消路径有三条且都只清 `pendingDelete`：取消按钮、点遮罩（`@pointerdown.self`）、Esc；`watch(pendingDelete)` 会在弹窗出现时把焦点送到「删除」上（Enter 即确认）。键盘 `Delete` 键走的是同一个 `requestDelete`，不需要另写一份确认。
12. **新建的目标目录可以是任意目录，输入行要挡住一种「程序性失焦」**（`FileExplorer.vue` + `InlineCreateRow.vue` + `FileTreeItem.vue`，2026-09-28 改）：两处入口——页头两颗按钮**跟随树内聚焦的节点**（目录取自己、文件取父目录、没聚焦回落根目录，见 `headerCreateTarget()`），右键**目录**则显式指定该目录（菜单项回来了，见坑 14）。状态里的 `targetId` / `targetPath` 决定落点（`join(targetPath, name)`），名字仍是单级（`assertName` 拒绝 `/`）。输入行抽成了 `InlineCreateRow.vue`，**两处渲染点**：根目录那份在 `FileExplorer` 的树容器里，建在某个目录里那份在 `FileTreeItem` 的 `role="group"` 内、递归 `v-for` 之前。三条纪律：
    - **输入行不能放进 `.tree-item__row` 里**：那一行挂着 `@keydown="onKeyDown"`（方向键导航）与由 `onTreeFocus` 的 `closest('[data-tree-id]')` 驱动的 roving tabindex，输入框进去会让编辑文字的光标键被树抢走、打字还会篡改 `focusedId`。放 `role="group"` 里则 `closest('[data-tree-id]')` 返回 `null`（`[data-tree-id]` 只在 `.tree-item__row` 上，而它是兄弟不是祖先），两个问题一起避开（已实测）。另：`role="group"` 挂着 `v-if="expanded"`，所以 `startCreate` 必须先 `toggleExpand` 目标目录，否则输入行根本不存在。
    - **默认名按目标目录查重**：`defaultName` 扫的是目标目录的兄弟（根目录扫 `workspace.tree`，其余走 `getNodeById(targetId).children`），不是全库；文件按 `activeLanguage` 给 `new.cpp` / `new.py`、目录给「新建文件夹」，撞了排 `new-2` / `new-3`。
    - 焦点靠 `nextTick(focusCreateInput)`（聚焦 + 选中主干，见下）送进去，`autofocus` 属性对动态插入的节点不生效、指望不上；句柄由 InlineCreateRow 挂载时注册进 `provide('creatingRow')`。真正阴的地方是失焦提交：创建成功后会自动**打开**新文件，`EditorPane` 在 `activeId` 变化时会 `instance.focus()`（打开文件抢焦点本身是正常行为，别删它），这一抢就落在内联输入框头上 → 输入框 `blur` → 失焦提交 → **凭空多出一个默认名的文件**（连点两次「新建文件」时必现：第二轮输入框刚聚焦就被提交掉）。所以绑的是 `onCreateBlur()` 而不是直接 `commitCreate()`，用 `createFlights`（在途创建轮次的 state 集合）分两种：屏幕上这个输入框自己正在提交（失焦正来自「打开刚建好的文件」）→ 跳过重复提交、也不抢焦点，让焦点留在 Monaco；在途的是上一轮、屏幕上这个是新一轮被误伤的 → `nextTick` 把焦点抢回来（Monaco 的 focus 在 pre-flush watcher 里，抢得赢）并放弃提交。
    - **进去时不是「全选」，是「只选中主干」**（2026-09-28 改）：两个输入框（这里的 InlineCreateRow 与 `FileTreeItem` 的重命名）都用 `setSelectionRange(0, 主干长度)`，落点是 `new.cpp → 'new'`、`main.cpp → 'main'`，后缀留在选中区外——全选的话，改个文件名会顺手把 `.cpp` 打没，用户还得手动补回去。**目录名没有后缀这回事，整段选中**（所以两处都要判 `type === 'file'` / `type === 'directory'`，别无条件套 `stem`）。主干长度取自 `paths.js` 的 `stem(name)`，**它收的是单级名称而不是路径**——`stem('main.cpp')` 对，`stem('/src/main.cpp')` 会返回 `'/src/main'` 这种垃圾，因为它不剥目录（`extname` 那边收的是路径、内部走 `basename`，两者签名刻意不同）。判定规则与 `extname` 保持一致：没有点或点是前导点都算没有后缀，所以 `.gitignore` 与 `Makefile` 是整段选中。
13. **`tabSize` / `insertSpaces` 是 model 级选项，不是编辑器选项**（`services/editorOptions.js` 的 `editorModelOptions` + `EditorPane.vue` 的 `applyModelOptions`）：monaco 0.56 的 `EditorOption` 枚举里**根本没有这两项**（整个 `esm/vs/editor/common/editorOptions.js` 里搜不到 `tabSize`），真实定义在 `ITextModelCreationOptions` / `ITextModelUpdateOptions`。把 `tabSize: 2` 塞进 `editor.create()` 或 `editor.updateOptions()`，`EditorOptionsUtil.validateOptions()` 会当成未知键**静默丢掉**——面板看起来改了、localStorage 也存了，编辑器却一直按 4 空格渲染，而且 `getOption(EditorOption.tabSize)` 返回 `undefined`，不细看根本发现不了。正确姿势是 `model.updateOptions({ tabSize, insertSpaces })`，并且**每挂一个 model 都要补一次**（`setModel()` 之后、切文件 / 新建文件都算），否则新 model 立刻退回默认值。校验这类「改了没生效」的选项时，要读 `editor.getModel().getOptions()`，不是 `editor.getOption()`。顺带记一句默认值：`tabSize` 沿用改造前的 4，`insertSpaces` 刻意是 **`false`（关闭，按 Tab 出制表符）**——Monaco 自己的默认是 `true`，这是全表唯一一处刻意偏离 Monaco 默认的项（`editorOptions.js` 文件头也写了）。
14. **文件树的右键事件必须 `.stop`**（`FileTreeItem.vue` 的 `@contextmenu.stop="onContextMenu"`）：树根 `.explorer__tree` 上也挂了一个 `@contextmenu`（`onTreeContextMenu`，负责屏蔽空白处右键的原生菜单），而节点的右键**会冒泡到树根**——不 `.stop` 的话节点菜单会被树根那一次覆盖掉，症状是「右键文件/文件夹没反应、右键空白处反而正常」。菜单项在 2026-09-28 变成「题目信息（仅文件）」/「新建文件 · 新建文件夹（仅目录）」/「重命名」/「删除」，2026-09-29 又给有 `meta.url` 的文件加了「打开题目链接」（`problemUrl()` 只放行 http / https，见 14.7），2026-09-30 它与「题目信息」对调、改排在前面——目录上那两项是**刻意加回来**的：新建的目标目录可以是任意目录，而页头按钮只能跟随聚焦节点、表达不了「建在哪个目录」（见坑 12）。
15. **判题语言没有独立状态，由活跃文件的扩展名派生**（`App.vue` 的 `activeLanguage`）：2026-09-28 顶栏整体删除时那颗语言下拉也一并删了，`cph.language` 随之成为死键（见第 6 节）。现在 `runAll()` / `runOne()` 直接拿 `activeLanguage` + `activeNode.path` 调 `wasmRuntime.runCase()`（`.py` 走解释分支、其余走 C++ 分支），`workspaceStore.initWorkspaceStore()` 里那句 `openLanguage()` 只剩「首次启动给 `/main.cpp` 兜底」这一个作用。**别把语言选择器加回来**——它与「一个页签 = 一个真实文件」这套模型天然冗余，加回来就得再造一份语言状态去和活跃文件抢口径。想加「新建 Python 文件」入口也不用碰状态层，改 `FileExplorer` 的默认名规则即可（见坑 12）。
16. **语言图标有两处不能随手改的地方**（`AppIcon.vue`）：图标分两张表——`PATHS`（24×24 描边线性图标，主力）与 `SOLID_PATHS`（整块实心路径，`fill: currentColor` 且不描边，`solid` 由 `name in SOLID_PATHS` 判定）；另有 `VIEWBOX` 表存放「不在 24 网格上」的图标的专用方框（模板是 `:viewBox="VIEWBOX[name] ?? '0 0 24 24'"`，目前只有 `cpp` 一项）。C++ 用的是 seti-ui 的 `icons/cpp.svg`（MIT）——**VS Code 默认的 Seti 文件图标主题**（字形 `\E01A`，Seti 配色 `#519aba`）用的就是它，2026-09 从 simple-icons 那枚实心六边形字标换过来（那个在 15px 下糊成一团）。两个坑：
    - **它原始网格是 32×32**，直接套 `0 0 24 24` 会明显偏小，所以方框取边长 22（15px 下墨迹约 12.1×11.0px，与 `folder` 的 12.5×11.25 齐平）。
    - **方框的 `min-x` 被刻意右移到 `4.733`**（= 6.2 − 22/15，正好让 15px 尺寸下右移 1px）：这枚字形左边是大块实心的「C」、右边是两个细「+」，外框虽然几何居中（实测 cpp 与 python 的墨迹中点重合在同一条竖线上），但墨迹重心比中点偏左约 0.7px，排到 python 旁边看着不齐。**别改回 6.2**，也别想着去动 python 的 viewBox——python / folder / file / header 都是几何居中的，动它们会让整列图标一起偏。
    图标本身不带颜色，一律 `currentColor` 跟主题走（没照搬 Seti 蓝）。
17. **题目信息与抓题结果都挂在 VFS 节点上（`node.meta` / `node.config`），不是单独一张表**（`meta` 2026-09 加、`config` 2026-10-01 加）：meta **五项**——题目链接 / OJ / 难度 / 日期 / 时限（毫秒，2026-09-29 加，见 14.3）；config 存抓取结果原文（`tests` 样例等，见坑 19）。入口是文件树右键的「题目信息」，弹窗与删除确认同款自绘（不要 `window.confirm`、不要引 UI 库），目录节点不给这一项（`buildMenuItems(node)` 里按 `node.type === 'file'` 判断）。三条纪律：
    - **不动 `DB_VERSION`**：`LocalVFSProvider` 本来就整条记录持久化（`_commit` / `#persistPuts` 只剥掉 `children`），`writeFile` / `rename` 又是 `{...node}` 展开，所以 `meta` / `config` 天然跟着走。`setMeta(path, meta)` 与 `setConfig(path, config)` 都用 `#schedulePut(node, null)` 落库（`content === null` = 只写 nodes store、不碰正文），各改各的键、互不覆盖。
    - **难度跟着 OJ 走**，口径表、合法值、悬停文案全在 `services/problemMeta.js` 一处：Codeforces / AtCoder → 分数段 `800…3500`（步长 100），洛谷 → 官方八级，牛客 / LeetCode / 其它 → 自由文本。换 OJ 时**必须清空当前难度**（`onOjChange`）——两套口径的 id 互不相通，留着会存下一个对不上的值（比如 `1200` 混进洛谷）。
    - **全空存 `null`**：`normalizeMeta()` 逐键校验后四项全空就返回 `null`，`setMeta` 据此把 `meta` 字段整个摘掉，不在节点上留空壳；`formatMetaTooltip()` 对空 meta 返回空串，`FileTreeItem` 此时不设 `title`（避免弹出空提示）。
18. **导入的题目是「一个代码文件」，不给每道题套目录**（`services/vfs/problemImport.js`，2026-09 定稿，**别再改回题名目录结构**）：树里多一层「题目名/」纯是噪音——点开一道题还得再点一次才见得到代码。所以题名直接做文件名，上面按「年月 / OJ / 难度」分层归类：`/<年月>/<OJ 标签>/<难度>/<题名>.cpp`（挂在工作区根下），题目信息与抓到的样例都挂在这个文件节点上（`meta` / `config`），**树里不另有条目**。四条纪律：
    - **代码文件只在首次导入时创建，此后一个字都不动**：那里面是用户写的题解。重抓同一道题只刷新 `node.config`（样例整体覆盖），难度这种用户手填的字段还得从 `existingCode.meta` 里保留下来、日期只在首次播种。
    - **题目身份认 `url`，不认文件名、也不认路径**：题目在来源站点改名后文件名就对不上；跨月再抓、或用户事后填了难度，算出来的新路径也对不上。只认其中任何一个都会另起一个文件、把用户旧文件里的题解变成孤儿。所以先走「算出来的新路径 + 文件名 + `meta.url` 都对上」的快路径，不中再**全库扫每个文件节点的 `meta.url`** 找回旧题目、**复用原来那个文件**（不搬文件）。**`batch.id` 不能用**——它是扩展每次抓取现生成的随机 uuid，抓两次就是两个值。
    - **`未分类` 是「难度为空」的占位，且路径一定下就跟着题走**：导入时难度一律为空（来源站点口径不一），所以新题都落在 `未分类/` 下；用户事后填难度**不会**把已有文件搬过去（搬动 = 丢题解），分层只对**之后新抓的**生效，老数据不迁移。
    - **同名但 `url` 对不上 = 用户自己的文件**，这时候不能覆盖，要 `baseName-2`、`baseName-3` 依次找空位（只看代码文件那个路径空不空）；整趟塞进一个 `vfs.batch()`，界面只重建一次树。
19. **`meta` 与 `config` 是两个字段，而 `setMeta` 是「整体替换」**（`LocalVFSProvider.setMeta` / `setConfig`）：两个方法都先 `{ ...node }` 展开、再只改自己那一个键，所以并存时不互相覆盖；但 `setMeta(path, meta)` 传进去的对象**就是**新的 `meta` 全部内容——题目信息弹窗（`updateFileMeta`）改一下难度就会用五项重建 meta，**样例若也存在 meta 里，就会在这一刻被抹掉**。所以样例一律走 `config`（`problemImport` 落盘与评测面板取用例都读它）。旧版这两样是同级隐藏的 `.cph/<题名>.json` 文件（旧版靠 `workspaceStore` 的 `withoutHiddenDirs()` 在渲染层摘掉，该函数已删），**2026-10-01 取消**：过滤逻辑已删，老数据由 `migrate.js` 的 `migrateProblemMetaInline()`（标记 `cp.problemMetaInline`）搬进 `config` 后连 `.cph` 一起删掉。
20. **扩展安装包靠文件名换版，不靠 `sw.js` 的 `SHELL_VERSION`**（`EditorSettingsPanel.vue` 的 `EXTENSION_VERSION` / `EXTENSION_FILE`）：`public/extension/` 下的 zip 不在构建清单里，而 SW 对同源 GET 走 `cacheFirst` 且**不重新校验**——原地覆盖同名文件，老用户会一直下到缓存里的旧包。所以发新版必须换文件名（`cc-for-web-2.65.1.zip` → `...-2.65.2.zip`），同步改这两个常量 + `cph-companion` 的 `package.json` 版本号。也**不要**把它塞进 `STATIC_ASSETS`（那会每次 install 都预缓存一份几百 KB 的包，而它只在用户点「下载」时才需要）。
21. **全局快捷键挂在 `window` 的捕获阶段，且录制期间必须让路**（`useShortcutManager.js` + `App.vue` 的 `onKeydown` + `HotkeyRecorder.vue`）：`window.addEventListener('keydown', onKeydown, true)` 里 `preventDefault()` + `stopPropagation()`——Monaco 的键位服务挂在编辑器内部 DOM 上，捕获是从外往内走，只有这样才能抢在它前面，编辑器里也归这套表管（顺带把 `Ctrl/⌘+Enter` 原本「在下方插入一行」的内置行为一并挡掉）。反过来，`HotkeyRecorder` 的 keydown 在按钮的目标阶段，而捕获永远先跑，所以**开录时必须置 `recordingActive = true`**、`onKeydown` 见到它就 return，否则录入组合键的瞬间功能会先被执行一遍。同理，`event.isComposing` 期间一律不处理（拼音选词不能被当成命令）。**不要**改回 `editor.addCommand()` 同步键位：Monaco 0.56 的 `ICodeEditor` 只有 `addCommand`、没有 `removeCommand`，改过键之后旧的撤不掉，会出现「新键不跑、旧键反而跑」。
22. **组合键内部串用 `event.code`，且必须挡住浏览器原生键**（同上）：用 `event.key` 对不上——Alt 组合在 macOS 上会把 key 变成特殊字符（Alt+B 是 `∫`）、Shift 会把 `Digit1` 变成 `!`。内部写法固定为 `Mod+Ctrl+Alt+Shift+<code>`（顺序固定、必带键码），所以字符串相等就是精确匹配，`Ctrl+B` 与 `Ctrl+Shift+B` 天然不会互相误触；`Mod` = 平台主修饰键（macOS 是 ⌘，其它平台是 Ctrl），macOS 上还要单独有 `Ctrl`。另外 `BROWSER_RESERVED` 那张表（`⌘W` / `⌘T` / `⌘R` / `F12` 等）要在**录制阶段**就拒绝并给红字原因：这些组合由浏览器 UI 层直接吃掉，`preventDefault()` 无效，绑上去只会得到一个永远不触发的快捷键。裸键只放行功能键与 `Esc`（`SAFE_BARE_CODES`），其余一律要求带修饰键，否则打字时会不停误触发。
23. **「卸载本地运行环境」删的是 Cache Storage，判据也必须以它为准**（`runnoSandbox.unloadRuntime` + `wasmRuntime` 的 `uninstallRuntime` / `isAssetCached`，2026-09-28 加）：设置页「本地运行环境」在 `ready` 时右侧多一颗「卸载」（自绘确认弹窗，理由同坑 11，不要 `window.confirm`）。要同时清三处，缺一处就「卸了像没卸」：
    - **Cache Storage**（SW 的 `cph-toolchain-*`）：资产的实际落点，按 `runtimeAssetURLs()` 逐个 `cache.delete()`；缓存名**不等于** `sw.js` 里那两个常量（工具链那个是硬编码的固定名），所以按前缀全扫，不只认当前那一个。
    - **内存**：C++ 是 `toolchain` / `toolchainPromise` / `compileCache` / `pchBytes` / `pchPromise`，Python 是 `pythonRuntime` / `pythonRuntimePromise`；另加 `wasmRuntime` 的 `pchWarmupStarted` 复位（不复位的话，卸载后再跑 C++，`warmupPch()` 会因「已预热过」直接跳过）。PCH 存在 IndexedDB（十几 MB），单独 `deletePch()`。
    - **HTTP 缓存：删不掉**，浏览器没给 JS 任何清除接口（`fetch` 的 cache 选项只改取值策略）。所以 `isAssetCached` 改成「SW 控制页面时只认 `caches.match()`，没有 SW（dev 模式）才退回 `only-if-cached` 探 HTTP 缓存」——仍让 HTTP 缓存当判据的话，刚卸载完的资产会被那份残留立刻判回「已就绪」。**这是本项目第一次让「判据」与「删得掉的那一层」对齐**，以后改探针先想清楚这点（坑 12 那套探针注释也同步改过）。
    - 卸载按钮只在 `ready` 时出现（没装就没有可卸的），下载中禁用——会和 SW 在途的 `cache.put` 打架。
24. **`postcss-pxtorem` 只转 CSS 声明，转不到 JS 与断点**（`vite.config.js` 的 `css.postcss` + `composables/useUiScale.js`，2026-09-28 加）：全局缩放的机制是「构建期把 CSS 的 `px` 转 `rem`，运行时只改 `document.documentElement.style.fontSize`」，但有四类东西**根本不经过转换**，不认清楚就会踩：
    - **JS 内联样式与 JS 常量**：`el.style.height = '320px'`、`:style="{ … }"` 这类不走 PostCSS，永远是真 px。凡是「按 100% 设计的逻辑尺寸」都要自己乘 `scale`（`useUiScale.js` 的 `px()`），如 `TestCaseCard.vue` 的 `MAX_IO_HEIGHT`（且要 `watch(uiScale)` 在缩放后重算）；反过来，**物理尺寸绝不能乘**——`clientX/clientY`、`getBoundingClientRect`、`offsetWidth`、`scrollHeight`，以及 `TAP_SLOP` / `EDGE_PX = 32` / `RELEASE_PX = 60` 这类手势阈值，量的是屏幕与手指，与 UI 大小无关。`FileTreeItem` / `InlineCreateRow` 的树缩进已改成「模板传无单位 `--depth` + CSS `calc(var(--depth) * 10px + 8px)`」，让缩进跟着 rem 走、不再走内联 px。
    - **`@container` 断点参数不被转换**（`mediaQuery: false`，且插件内部只特判 `@media`）：本仓 7 处 `@container` 阈值都是**手工写成 rem** 的——`EditorPane` 状态栏 3 处（`22.5rem` / `19.375rem` / `15.625rem`）、`TestCaseCard` 3 处（`35rem` / `22.5rem` / `15.625rem`）、`EditorSettingsPanel` 1 处（`35rem`）；改断点时**别再写回 px**，否则缩放后断点位置与实际内容宽度脱节。`@media (max-height: 479px)`（`EditorPane`）与 JS 的 `SHORT_VIEWPORT = 480`（`useMobileKeyboard`）是一对刻意**都不转**的契约，两者必须同时是物理 px。
    - **被 JS `parseFloat` 读的自定义属性**：`App.vue` 的 `measureLimits()` 用 `style.getPropertyValue('--tests-min-cap') + parseFloat` 做拖拽数学，该变量一旦被转成 `rem`，`parseFloat("15rem")` 得到的是 `15` 而不是 `240`，上限直接算错（实测已确认保留为 `240px`）。所以 `--tests-min-cap / --tests-min-floor / --tests-min-ratio` 三个变量在 `propList` 里以 `!` 前缀排除、留在 px 坐标系；**不要**改成在 JS 里对 parseFloat 结果做 rem 反向换算。反之 `--seg-w` / `--seg-h`（胶囊宽高）是纯视觉尺寸、无 JS 读取，**不放**排除名单，必须整组一起随 rem 缩放——只保护其中一个会让胶囊扭形（28 × 27.5）。**「留在 px」不等于「不缩放」**：这三个变量是逻辑尺寸（100% 下的设计值），得在使用处各乘一次缩放倍数——CSS 的 `.pane--tests` 写 `calc(var(--tests-min-floor) * var(--ui-scale, 1))`（cap 同理，ratio 是比例不乘），JS 的 `measureLimits()` 写 `* uiScale.value`；`--ui-scale` 是无单位倍数，由 `applyUiScale()` 写在 `<html>` 上（`styles/base.css` 的 `:root` 里默认 `1`）。**两边必须同款**，否则 125% 下分隔条会与浏览器强行撑开面板的那条线错位（表现为拖到最窄时脱手）。
    - **`minPixelValue: 3`**：小于 3px 的值不转换，所以 1px / 2px 的细线、小间距（如胶囊的 2px padding）在缩放下始终是物理像素、不会亚像素模糊。
    - Monaco 那侧靠 `exclude: /node_modules/i` + `selectorBlackList: [/monaco/]` 双重排除（它的样式表经 `node_modules` 进 Vite 管线，整包不吃 rem），尺寸补偿改走 `services/editorOptions.js` 的 `editorOptions(settings, scale)`；缩放变化时 `EditorPane.vue` 的 `watch(() => props.uiScale)` 重新 `updateOptions()` + `nextTick(layout())`（容器尺寸同步也变了，补一次 layout 最稳）。
25. **越界的 panel share 必须在拖拽之前收敛**（`App.vue` 的 `reclampShare()`，2026-09-28 加）：`cph.editorShare` 是持久化的，而它的合法上限 `maxShare` 会随**缩放**（面板最低宽度跟着放大）与**视口宽度**（窄到 50% 那一项接手）变化。越界时浏览器靠 CSS 的 `min-width` 把面板撑住、JS 眼里的区间却已经挪走，于是**第一次拖拽**时 `applyShare` 会一口气把比例夹进新区间 —— 表现就是「拖一下就猛地跳一段」（150% + 存 82 实测纯瞬跳 13px）。由 `reclampShare()` 在三个时机补夹：挂载（`nextTick`）、`watch(uiScale)`、`ResizeObserver`。三条纪律：
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
    - **样式：底边虚线，不是整框虚框**。框能打字，整框虚线会被读成「这里不能编辑」；`.ta--truncated` / `.out.is-truncated` 只把 `border-bottom-style` 换成 `dashed`，**边框色必须从 `--border-soft` 提到 `--border`**——1px 虚线在浅色主题下没有对比度就等于没画（这条踩过两次，`.ionote__btn` 的边框同理）。说明行的文案是「还有 N 个字符未显示」（2026-09-29 删掉了后半句「· 全选可复制全文」——那句是在解释「全选能拿到全文」，而「复制全部」按钮的 `title`（`tests.card.copyFull`）里已经说了一遍，提示行再说一次是噪音），窄容器（`@container (max-width: 15.625rem)`）下只让文字让位、按钮留下。**框内不再重复这个数字**：框里那行标记就是一个 `……`（它本来就要滚动才看得见，写两遍数字是噪音），数字统一由下面那行承担。
    - **「框里装不下」有两种成因，但只有 ① 才算「真少了东西」、才配得上任何标记**（2026-09-29 第四、五次改，原话「这不是废话吗？纯溢出态就是没显示全，但是滚动就可以看到所有的，这没什么好说的吧」→「超出框高不需要虚线」）：① 被截断 —— 框里根本没有那部分字符，判据 `xxxHidden > 0`，它同时拿到**虚线底边 + 一行小字**（两样都是能操作的信息）；② **只是超出框高**（`autoGrow` 把上限压在 `MAX_IO_HEIGHT = 320`，约 15 行就满）—— 字符一个不少、全在框里，只是要滚动才看得见，**现在没有任何视觉标记**，只剩 `overflowY: auto` 自带的那根滚动条（浏览器给的，不是我们画的）。**最早只做了 ①，于是「十几行到 6000 字符」这一段是静默的**：框被内容撑满、底边还是实线、一行提示都没有（实测 200 行 ≈ 3000 字符就是如此，而 >6000 的样例反而有提示，看着像「越长的才有」）；后来给 ② 加了一行小字、又把虚线也共用了过去，这两样在第四、五次改动里被用户分别退掉。于是 `autoGrow(el)` 现在只摆盒子、**不再向 Vue 报告溢出状态**（`inputOverflow` / `expectedOverflow` 两个 ref 已删），模板里虚线与小字共用同一个判据 `xxxHidden > 0`。四条不能破：**(a) 提示行只在截断态出现，一句话「还有 N 个字符未显示」，N 就是 `xxxHidden`（精确的字符数，恒定）**。术语（这两个词在本文与代码注释里到处出现，先钉死）：**截断态** = 字符数过 `IO_PREVIEW_TRIGGER`，显示只留开头 `IO_PREVIEW_CHARS` 个字符，剩下的字符**根本不在框里**；**纯溢出态** = 字符数没过阈值、**一个字符都没少**，只是框不够高（上限 `MAX_IO_HEIGHT` ≈ 15 行）要滚动才看得见。**纯溢出态现在没有任何数字**：曾经算过一个「框里当前看不见的那截」（比例估算 `框内文本长度 × (1 − 可见内容高 / 内容总高)`，随面板宽度在 4,257 / 4,403 / 4,546 之间跳），第四次改动把它连同代码一起删了（`inputOverflowHidden` / `expectedOverflowHidden` / `omittedCount()` 都已不存在）—— 一个拖一下滚动条就能自己验证的数，报出来只会让人以为框尾少了字。⚠️ **这一行用户为它报过四次 bug，2026-09-29 的最终形态是「只在截断态出现 + 措辞用『未显示』」——别再给它加回纯溢出态**：①「有的时候显示已省略多少字，输入文本的底部仍然没有省略号」→ ②「字符多的时候输入框下方没有小字」（这两次促成了给纯溢出态也加一行）→ ③「（字符超出限制后）底部会有一个省略号，有时候没有省略号，例如 `vvvvvv…` 这种字符，最后不会有省略号」（实测复现：`v`×5000 走纯溢出态，框内 5000 字一个不少、框尾无 `……`，提示行却说「已省略 4,554 个字符」；于是措辞从「已省略」换成「未显示」）→ ④「这不是废话吗？纯溢出态就是没显示全，但是滚动就可以看到所有的，这没什么好说的吧」（于是纯溢出态那一行整个删掉）。中途还试过拆成两句（纯溢出态说「还有 N 个字符未显示 · 可滚动查看」，`tests.card.overflow`），也被否。**别再改成「已省略」，别再拆两句，也别再给纯溢出态加提示行**。**(b) 只有截断态才给「复制全部」按钮**：纯溢出态一个字符都没少、全在框里，没有「全部」可复制。**(c) 窄容器下只让「带按钮的那种提示行」的文字让位**（`.ionote:has(.ionote__btn) .ionote__text { display: none }`）—— 输出块底下那行提示没有按钮，藏掉就剩一条空行，靠 `:has` 把两种区分开。**(d) 纯溢出态框内不插省略号**：字符一个都不少，插了就是把正文改了；那种状态**没有任何标记**（没有提示行、没有数字、连虚线底边也没有）。`autoGrow` 只写 `el.style.height` 与 `overflowY`，宽度不受影响，不会和 ResizeObserver 形成回调环。
    - ⚠️ **给模板传 ref 时：收的是值，不是 ref**（这条踩过两次，函数现在虽然已随第四次改动删掉，但坑本身还在 —— 模板里 `copyText(testCase.input)`、`onLongCopy($event, testCase.input)` 都是这个形状）：模板里 `inputHidden` 这类 ref 会被 Vue 自动解包，函数签名要是写成 `(hiddenRef, …)` 再去 `.value`，拿到的是 `undefined`，一路传到 `fmt()` 就是 `Cannot read properties of undefined (reading 'toLocaleString')` —— **而这次抛错发生在渲染期，整张卡片会一起渲染失败，连框里的省略号都出不来**（症状极具误导性：看着像「截断逻辑坏了」，其实是翻译函数炸了）。
    - **文本结尾那个 `……` 时有时无，是两条独立的线**（2026-09-29，用户问过）：**① 字符数有没有过 6000** —— `displayOf()` 只在 `long && hidden > 0` 时追加 `MARKER_SEED`，≤6000 字符显示的就是完整内容，结尾**根本没有**省略号（哪怕超出框高要滚动也没有，那是纯溢出态）；**② 截断态下有没有滚到底** —— `……` 是文本的最后一行，不滚到底就在视口外，所以**同一个样例**也会看着时有时无。下面的提示行与虚线底边都只在**截断态**出现（纯溢出态既没有提示行、也没有虚线底边、也没有省略号，见 (a)/(d)）。⚠️ **别为了「让它稳定出现」把 `……` 做成画在框上的浮层**：2026-09-29 试过（`.ta-wrap` / `.ta-wrap--more::after`，条件「真截断 + 还没滚到底」、滚到底时让位给正文那颗），**用户当天否掉了** —— 他要的就是文本结尾那个 `……`，别再提这个方案。（那次尝试留下的两个技术点仍成立：textarea 放不了伪元素所以要包一层定位；`@scroll` 只能挂具名 handler —— 模板里 `@scroll="onTaScroll($event.target, someRef)"` 传进去的是**解包后的布尔值**，函数里再 `.value = …` 就是 `Cannot create property 'value' on boolean 'false'`，与 `omittedCount` 那次是同一类坑的两个方向：**读** ref 拿到 `undefined`、**写** ref 直接抛错。）
    - ⚠️ **不要再改回「只读预览」**：用户明确要的就是「过长时仍然能编辑，只是只能改未被省略的部分」。第二版曾整体改成 `readonly` 并用一颗「编辑完整内容」按钮兜底，当天就被这条要求推翻。反过来，**删掉省略行里的一两个字也会连省略段一起丢** —— 这是第 ③ 条分支刻意选的代价，与「选中省略号就等于选中被省略的那段内容」是同一个心智模型，别再为了「救回那几个字」把分支逻辑搞复杂。
27. **localStorage 每个源大约只装得下 520 万 ASCII 字符，而 `cph.testCases` 是 deep watch + 全量 `JSON.stringify` 写入**（实测：100 万字符的输入 + 100 万字符的期望输出 = JSON 220 万字符 ≈ 源的 40%）。写入本身不慢（stringify 0.9ms + setItem 1.2ms），可怕的是 `usePersistentRef` 的 `catch` 会把配额错误**吞掉**：超限以后界面一切正常，**刷新却回退到旧版本**。目前刻意没修（用户 2026-09-29 决定本轮不动，见第 14 节），但写任何「要不要把大数据放进用例」的功能前先想清楚这条。
28. **界面双语：`t()` 读的是 ref，所以「在哪里调」比「翻得对不对」更容易出错**（`src/i18n/`，2026-09-29 加）：机制是模块级单例 `locale = ref(...)` + `t(key, params)`，`t()` 每次调用都读当前 ref。由此推出下面几条，**第 1 条是这一整套设计里唯一真正的陷阱**：
    - **模块顶层 / `<script setup>` 顶层调 `t()` = 冻结语言**：那时只取到「那一刻」的语言，切了语言这些字符串不会变。模板里、computed 里、函数体（事件处理 / 生命周期）里调都没问题。所以**数据驱动的表一律只存 key**——`EDITOR_GROUPS` / `SECTIONS` / `RUNTIMES` / `THEMES` / `SHORTCUT_ACTIONS` / `OJ_LIST` / `LUOGU_LEVELS` / 各引擎的 `labelKey` / `Sidebar.vue` 的 `PANEL_TABS` 都改成 `labelKey` + `hintKey` + `labelParams`，由消费处（模板 / computed / 一处 `labelOf()` 小工具）再 `t()`。漏一个的症状很隐蔽：设置面板切语言后大部分变了、某一处的下拉项还是中文。**顺带一条**：调用纪律也适用于 `runner.js` / `engines/*` / `vfs/*` 这些 service——它们的 `t()` 都在函数体里（跑起来才调），所以正确；但**模块级常量**（如 `BaseVFSProvider` 原先的 `NOT_IMPLEMENTED`）必须改成惰性的 `const notImplemented = () => t(...)`。
    - **语言要在任何组件挂载之前定下来，所以不走 `usePersistentRef`**：那个 composable 靠 `onMounted` 播种首次写入，而界面语言的首帧不能先闪一下中文再切英文。`i18n/index.js` 因此自己读写 localStorage，初值在第 0 帧同步算出（存档优先，没有存档才探测 `navigator.languages`：任一命中 `/^zh\b/i` → `zh-CN`，否则 `en`）。`switchPanel` 那种「切了当场生效、不重载」的效果落在这里：`locale` 是 ref，模板 / computed 全是响应式的。`applyLocale()` 负责同步 `<html lang>`（模块加载时一次 + `watch(locale)` 跟随），**别在别处再写一份**。
    - **新键是 `cph.uiLocale`，不是 `cph.language`**：`cph.language` 是「编辑器判题语言」的死键（顶栏下拉删除后作废，见坑 15 与第 6 节），两者语义完全不同，别再合并。界面上的文案刻意写成「**界面语言**」，用来与「判题语言（由文件扩展名派生）」区分。**别把语言选择器当成「把判题语言加回来」的借口**。
    - **写进文件系统的名字不翻译**（第 1 节有这条硬约束）：`problemImport.js` 的 `未分类` / `未命名题目`，以及 `OJ_LIST` 上新加的 `dirName`（洛谷 / Codeforces / 牛客…）。**`labelKey` 与 `dirName` 是两个字段、刻意不合并**——显示名跟着语言走、落盘名永远固定，否则用户切一次语言就会在同一个逻辑位置看到两个目录（`/2026-09/洛谷/` 与 `/2026-09/Luogu/`），老题解直接变孤儿。`formatMetaTooltip()` / `difficultyLabel()` 走 `labelOf()` 拿显示名，导入路径走 `dirName`。
    - **标签自称用哪种语言是有讲究的**：`LOCALES` 里 `简体中文` 与 `English` 都是**自称**，不跟着界面语言变（中文界面里也显示「English」而不是「英文」）。同理 `guide.html` 页头的语言链接写 `English`、`guide.en.html` 那侧写 `简体中文`（各带 `lang` 属性让屏幕阅读器读对）。`fmt` 的千分位也必须跟随语言（`n.toLocaleString(locale.value)`，原先是写死的 `'en-US'`），否则英文界面里的「1,234」在中文界面下也不该变、但 `… 个字符` 的量词要跟着变——两件事别混。
    - **超长样例的省略行干脆没有文案**（与坑 26 配套，2026-09-29 改）：框里那行截断标记就是一个光秃秃的 `……`，定位与判据用两个**语言无关**的字面量 `MARKER_SEED = '\n\n……'` / `MARKER_KEY = '……'`；具体省略了多少由框下面那行说明承担，它走 `tests.card.omitted`（`还有 {n} 个字符未显示` / `{n} characters not shown`；只在真截断时出现，原因见坑 26 (a)）。**别把省略号挪进消息表**——`commitEdit()` 靠 `raw.indexOf(MARKER_SEED)` 认「省略行还在不在」，`onLongCopy()` 靠 `MARKER_KEY` 认「选区里有没有省略行」，两者一进消息表就会跟着语言变、历史文本也会失配。
    - **漏网之鱼要往两个方向查**：上一轮迁移的复查只搜了「硬编码中文」，结果**硬编码英文**漏了三处——
      `TestCaseCard.vue` 三个字段的小标题（`Standard Input` / `Expected Output` / `Actual Output`）
      一直是写死的，中文界面里也显示英文（2026-09-29 用户报了输入框那处才挖出来）。
      **复查脚本要对称**：既要搜中文字面量、也要搜「模板文本节点里裸露的 ASCII 词」。
      别把 `UTF-8` / `OJ` / `chrome://extensions/shortcuts` 这类专有名词、URL、缩写当成要翻的——它们刻意不翻。
      ⚠️ **挖出来不等于一定要翻，而且要问到什么粒度**：那三处**一个都没留下 i18n**。
      输入框那条先按用户当轮的原话接了 zh `输入` / en `input`，用户随即指出「应该也是 `input`」——
      因为三个标签并排、另一个已经改回英文，混着写成中英两种看着不齐。于是全部退回写死的
      `input` / `Expected Output` / `Actual Output`（2026-09-29 同日，两次来回）。
      **现在的口径**：这三个小标题**中英界面都是英文**，只有期望输出的空框占位跟着语言走
      （前两个框的首行已经被标签说明了，占位再重复一遍是噪音）。
      **别再去翻它们，也别再把 `input` 那条接回 i18n。**
    - **无头探针里 `navigator.clipboard.readText()` 恒返回空串**（见第 8 节与本仓的探针技能），验证语言切换要走 localStorage + DOM 文本；且**同一个 browser 里 localStorage 跨页共享**，探针第 0 帧必须先 `localStorage.clear()`，否则前一组用例种下的 `cph.uiLocale = 'en'` 会污染后面所有页面（实测踩过，表现为一整组假失败）。
29. **预览页签的钉住手段有两条，但真正兜底的是「编辑即钉住」**（2026-09-30 加，实现见 14.17）：钉住入口是**双击文件树的行 / 双击页签栏的页签 / 在预览页签里敲第一个字**。前两条都靠浏览器原生 `dblclick`，而**原生 `dblclick` 在部分 Android / iOS 浏览器里压根合成不出来**（本仓另一次踩坑在分隔条双击吸附上，见第 3 节）。所以 `workspaceStore.js` 里那条 `watch(modelManager.isDirty(previewTabId))` 不是「顺手加的 VS Code 细节」，而是触屏唯一可靠的保命闸——少了它，用户在预览页签里正在改的内容会被下一次单击顶替掉。另外 `previewTabId` 刻意**不落 localStorage**（刷新后退化成普通页签，无害），它**没有**进第 6 节的表，别顺手补上，也别把它塞进 `cph.openTabs` 那一份存档格式里。

## 6. 已持久化的状态（加设置项时照抄这套）

| key | 内容 | 位置 |
| --- | --- | --- |
| `App.vue`（`EDITOR_SETTINGS_KEY` / `readEditorSettings()` / `updateEditorSettings()`，约 38–112 行；定义在 `services/editorOptions.js`） | `cph.editorSettings` + `cph.editorSettingsVersion` | 编辑器偏好共 23 项（主题、字体族 / 字号 / 行高 / 连字、Tab 宽度 / 空格代替 Tab / 自动换行 / 换行列宽、光标样式 / 闪烁 / 平滑移动、当前行突出、空白字符、缩略图、括号对着色 / 缩进参考线 / 括号参考线、粘性滚动 / 滚过最后一行 / 平滑滚动、内边距、滚动条粗细）。**默认值、可选项表、逐键校验、偏好 → Monaco 选项的映射全部在 `src/services/editorOptions.js` 一处**，面板下拉、读盘校验、Monaco 吃到的选项三者共用，加新项只改这一个文件（面板加一行描述即可，见 `EditorSettingsPanel.vue` 的 `EDITOR_GROUPS`）。`Version` 只用于一次性换主题 id：v3 之前是 Monaco 原生 id（`vs-dark` / `vs` / `hc-black`，原本选浅色 `vs` 的迁到浅色），v4（2026-09-29）起主题 id 去掉 `cph-` 前缀、旧存档的 `cph-light` 照样认；认不出的旧值一律交给白名单丢掉、回落到默认深色。**这个计数器只管主题这一件事，不参与其余键** |
| `cph.panelVisible` / `cph.panelPosition`（`App.vue:31-33`） | 统一侧边栏是否展开 / 侧边栏在左还是右（键名是历史沿革，语义已从「测试面板」扩到整栏） |
| `cph.sidebarTab` | 侧边栏当前面板（`explorer` / `tests`），认不出来的值一律退回 `explorer`。**没有 `settings`**——设置页签刻意不落盘（见第 5 节坑 7） | `Sidebar.vue`（页头里的 `SidebarSwitcher` 只是消费方，经 provide 拿状态） |
| `cph.editorShare`（`App.vue:35`） | 两栏比例（%） |
| `cph.timeLimitMs`（`App.vue:40`） | 全局时限（毫秒，只计运行段）。**它只是「题目没带时限时的默认值」**：活跃文件的 `meta.timeLimit` 非 0 时优先用它（`App.vue` 的 `effectiveTimeLimitMs`，见 14.3） |
| `cph.uiScale`（`App.vue:49`） | 全局界面缩放比例，默认 `DEFAULT_UI_SCALE = 1.1`（110%），只认四档 `1` / `1.1` / `1.25` / `1.5`（认不出来退回默认档）。读盘经 `normalizeUiScale()` 校验；`applyUiScale()` 把它写成 `document.documentElement.style.fontSize`（`16 × scale` px），并在 **setup 期**就落地（早于首帧，不会先按 100% 画一帧再跳）。档位表与 `px()` 都在 `composables/useUiScale.js`；设置页「外观」组的「界面缩放」下拉是它的消费方（prop / emit 贯穿 `App → EditorPane → EditorSettingsPanel`）。见 14.12 与第 5 节坑 24 |
| `cph.uiLocale` | 界面语言，取值 `zh-CN` / `en`（`i18n/index.js` 的 `LOCALE_STORAGE_KEY`，**权威定义在那一处**）。**刻意不走 `usePersistentRef`**：界面语言必须在任何组件挂载之前定下来（首帧不能先闪中文再跳成英文），所以 `i18n/index.js` 自己同步读写 localStorage。**没有存档时跟随浏览器**（`navigator.languages` 任一命中 `/^zh\b/i` → `zh-CN`，否则 `en`）——注意「跟随探测」的结果**不写回存档**，「跟随浏览器的默认」与「用户显式选过」是两件事，别在首帧替用户落一个值。设置页「外观」组的「界面语言」下拉是唯一写入方，切了当场生效、不重载 | `src/i18n/index.js`（消费方散布在全仓，读的是 `locale` 这个 ref） |
| `cph.drafts` / `cph.testCases` / `cph.engine` / `cph.judgeBases`（`App.vue:36-37` 与用例段） | 各语言草稿、用例、引擎、服务地址 |
| ~~`cph.language`~~ | **已作废**（2026-09 顶栏语言下拉移除后成为死键，全仓不再读写）；残留在 localStorage 里无害。判题语言现在一律由活跃文件的扩展名派生，见第 5 节坑 15 | — |
| `cph.mobileKeyboard` / `cph.mobileInputDock` | 都已作废（两个版本的键盘适配都不再持久化）；残留在 localStorage 里无害 | `composables/useMobileKeyboard.js` |
| `cph.localRuntime.clangReady` / `cph.localRuntime.pythonReady` | C++ / Python 本地运行时是否已拉取。**只作首帧播种，不是权威判据**：权威判据是 `wasmRuntime.probeRuntime()`（内存已加载 → SW Cache Storage → HTTP 缓存 `only-if-cached` 探针，全程不触网）；**探的时机只有一个**——`EditorSettingsPanel` 的 `watch(() => props.active)` 在切到设置视图时调一次 `reconcile()`（页面加载、任务状态推进时都**不**探：`only-if-cached` 未命中会在控制台记一条 `ERR_CACHE_MISS`，页面一加载就探等于白刷一屏红字）。标记过期（缓存被清）或缺失（直接跑代码落了缓存）都会在那一刻被正回来 | `EditorSettingsPanel.vue`（本地运行环境分组；下载走 `wasmRuntime.preload(language)`） |
| `cph.localRuntime.markdownReady` | **题解渲染器**（katex + marked）是否已拉取。与上面两条同一个键前缀、同一套「首帧播种 + 探针校正」的口径（权威判据是 `probeMdRuntime()` 的 Cache Storage 探针，见第 15.3 节）。它在**设置面板那一行**与**预览面板的「下载渲染器」**之间共用，否则从预览下的那一次，下次打开设置会先闪一下「未下载」 | `services/mdRuntime.js`（`MD_READY_FLAG_KEY`） |
| `cph.mdView` | 题解的**视图模式**：`{ mode, fullscreen }`（`edit` / `split` / `preview` + 是否全屏）。**刻意不走 `usePersistentRef`**：App 在 setup 期（首帧之前）就得知道该不该把侧栏收起来。旧存档是一个字符串（`'fullscreen'` 等），读盘时换算，认不出来一律回默认 `edit`——换算逻辑与理由见第 15.5 节 | `services/mdView.js`（**不是**组件；与 `settingsTab.js` 同一体例的模块级单例，区别是这份要跨会话记住） |
| `cph.pchUnsupported` | 本机被判定扛不住 PCH（生成时 OOM / cc1 卡死，或 PCH 加载校验失败）后写下的永久开关；有它就不再生成、编译也不再挂 PCH | `runnoSandbox.js` |
| `cph.shortcuts` | 全局快捷键：动作 id → 组合键串（`{"run":"Mod+Enter", …}`，内部写法见第 5 节坑 22）。**刻意不走 `usePersistentRef`**——那个 composable 靠 `onMounted` 播种首次写入、必须挂在组件上，而这份状态要在任何组件挂载之前就能被读到（App 的全局 keydown 与 EditorPane 的状态栏提示都要用），所以 `useShortcutManager.js` 里直接读写 localStorage。读盘以默认值打底再套已存键：以后新增动作时老用户自动拿到它的默认键，已删动作与手改坏的值自然丢掉 | `composables/useShortcutManager.js` |

另外 PCH 二进制（约 6.9MB）存 IndexedDB 而不是 localStorage：库名 `cph-pch`、store 名 `pch`，记录形状 `{ id, bytes: Uint8Array, size, createdAt }`；`id = 存档版本:工具链版本:微缩头内容的 FNV-1a 哈希`（当前是 `1:8.0.1:69dc7cd9`），三者任一变化旧存档自然失效，取存档只按这个 id。

工作区文件树也存在 IndexedDB（不是 localStorage）：库名 `cph-vfs`、两个 store `nodes` / `contents`（`LocalVFSProvider`），`nodes` 里就是整条 `VFSNode` 记录（`id / name / type / path / parentId / createdAt / updatedAt`），2026-09 给文件节点加了可选的 `meta`（题目链接 / OJ / 难度 / 日期 / 时限，见第 5 节坑 17），2026-10-01 又加了 `config`（抓题结果原文：`tests` 样例、`oj`、原始 `timeLimit` 等）。**两个都是记录里的可选字段，不是新 store、也不动 `DB_VERSION`**——旧记录没有就按「没有」处理，纯向后兼容。

导入的题目与用户自己建的文件**共用同一套存储**：题目信息与样例直接挂在代码文件节点上（`meta` / `config`），代码文件也只是一条普通记录，没有「题目专用表」这种东西。所以题目目录的搬移 / 重命名 / 删除走的都是既有路径，不需要为扩展另写存储。

写值统一走 `usePersistentRef(key, defaultValue)`；`editorSettings` 因为要版本迁移，单独用 deep watch 存。加编辑器设置项时**必须**两道校验都过：读盘（`readEditorSettings()`）与面板回写（`updateEditorSettings()`）都逐键走 `editorOptions.js` 的 `normalizeEditorSetting()`，不在默认值表里的键直接丢弃、越界数字退回默认——所以 localStorage 里手改出来的 `fontSize: 999`、认不出的 `cursorStyle`、乃至早已移除的旧键都不会漏进编辑器。

**唯一不落站点 localStorage 的「设置项」是扩展的投递目标两个开关**（设置 → 浏览器插件）：真值存在扩展自己的 `chrome.storage.local` 里，站点这边只有一份内存镜像（`useCompanionBridge` 的 `extensionInfo.config`，随 `cph-ping` 握手刷新）。所以别按上面这套给它加 localStorage 存档——那样会出现「站点存档说开、扩展实际关」的两份真相。

**「必须早于组件挂载就能读到」的状态有两处先例，加第三处前先想清楚**：`cph.shortcuts`（App 的全局 keydown 与状态栏提示都要用）与 `cph.uiLocale`（首帧的语言）。这两处的做法一致——**绕开 `usePersistentRef`，在模块里直接读写 localStorage**，因为那个 composable 的读写时机挂在组件生命周期上。代价是「读盘校验 / 默认值打底」得自己写（`useShortcutManager.js` 是「默认值打底再套已存键」，`i18n/index.js` 是「`isLocale()` 白名单 + 探测兜底」），两处都别省。

## 7. 现在的功能边界（写文案时别夸大）

- 引擎：**本地 WASM 沙箱（默认，`DEFAULT_ENGINE_ID = wasmEngine.id`，新访客打开就能跑，不需要外部服务）** / Piston / Judge0 / 自检（不执行代码，只回显标准输入，用来联调界面）。本地沙箱支持 **C++ 与 Python**，首次运行要下载工具链（`public/wasm/8.0.1/` 自托管的 clang + wasm-ld + sysroot，裸文件约 52MB、由 Vercel 边缘压缩传输，之后工具链常驻 HTTP 缓存）。下载**只有一个入口**：设置视图目录里的「本地运行环境」（C++ / Python 两行同一套数据驱动渲染，下载中另一行按钮自动禁用；状态在 `EditorSettingsPanel.vue` 里，直接调 `wasmRuntime.preload(language)`）。编译产物按源码原文缓存一份，所以成批跑用例时只有第一个用例付编译开销。
- **本地沙箱的 Python（2026-09 加）**：走 CPython 3.11.3 的 wasm32-wasi 构建（`public/wasm/python-3.11.3/`，约 24MB，来源与 C++ 工具链一致，都取自 `taybenlor/runno` 的 `langs/`）。没有编译段：`runPython()` 直接把整棵 VFS 拍成 fs、以 `args: ['python', 入口文件]` 拉起解释器，多文件 `import` 靠 `sys.path[0] = '/'` 找到同目录的模块。标准库打包在 `/usr/local/lib/python311.zip`（zipimport），`sys.prefix` 编译期写死为 `/usr/local`，所以 **env 必须留空**（不要自作聪明加 `PYTHONHOME`）。语言路由在 `wasmRuntime.runCase()`：`language === 'python'` 走解释分支，其余原样走 C++ 分支；`entryPath` 由 App 从当前激活文件传下来。Python 与 C++ 互不影响，改一边不用管另一边。
- Vim 键位已移除（与 Monaco 0.56 不兼容），别再被试着重加。
- TLE：时限在**设置视图「评测」组里的「运行时限」**（1/2/5/10 s，默认 1 s；2026-09-29 从面板页头搬进这里，见 14.3），只计**程序运行段**，不含编译；超时靠 `kill()` 当前 WASI 实例实现。卡片上的耗时**同样是运行段**（与时限同口径），程序没跑起来时（编译失败 / 编译错误）卡片不显示耗时。Python 没有编译段，它的「运行段」包含解释器冷启动（实测约 190ms），因此 `wasmRuntime.js` 给 Python 的 run 时限额外加 `PYTHON_STARTUP_ALLOWANCE_MS = 500` 余量——不加的话 1s 时限会被启动开销吃掉一大截，跑得再快的程序也可能被判 TLE。代价是 TLE 最多晚 0.5s 报出来。
- **耗时口径（2026-09 改过，别改回去）**：卡片数字 = `runCpp` 里只包住 `runWasi` 的那一段（Python 同理，是 `runPython` 里只包住 `runWasi` 的那一段），编译时间不计入。原先取的是 `runCase()` 入口到结束的墙钟，于是第一个用例含编译、命中编译缓存的后续用例只含运行，**同一份代码下第一个卡片能比其余大好几倍**（修前 3 个用例是「数百 ms + 9ms + 12ms」，修后 10/11/7ms），很容易被误读成「程序在第一个用例上特别慢」。面板页头那个 `elapsed` 现在也是同一口径：取当轮所有卡片耗时的**最大值**（`App.vue` 里是 computed，单独跑一个用例也会跟着更新），标题写明「最慢用例耗时」。TLE 消息里的 `durationMs` 与卡片同口径（`wasmRuntime.js` 在进入 `run` 段时重置 `stageStartedAt`）。
- 判定词表：引擎 outcome 是 `ok / compile-error / runtime-error / timeout / unreachable / cancelled`（见 `src/services/runner.js`、`src/services/engines/index.js`）；`runner.js` 再把它翻译成卡片徽标上的 **verdict 判定码**：`ok` + 比对一致 → `AC`，`ok` + 不一致 → `WA`，`compile-error` → `CE`，`timeout` → `TLE`，`runtime-error` → `RE`，`unreachable` 等基础设施失败 → `ERR`。徽标颜色仍按 `status`（passed 绿 / failed 红 / error 琥珀）。`compare.js` 只返回布尔，**不再**产出「输出多 N 行 / 第 N 行不匹配」这类 hint 文案（2026-09-18 起，卡片头部不再显示它）。
- 判题流程：先编译运行出实际输出，再与期望输出比对（`src/services/compare.js`）。
- **样例可以很大，但「能跑多大」有两个上限**（2026-09-29 实测）：本地沙箱的 stdin 走分块推送（`runnoSandbox.js` 的 `pushStdinInChunks`），已实测到 100 万字节以上一致，所以「大样例能跑」这条**只对本地 WASM 沙箱成立**；Piston / Judge0 是把 stdin 内联进 JSON POST 的（Judge0 还要 base64），1MB 级别的 stdin 很可能被对方拒绝或超时。**别在文案里无条件承诺「多大的样例都能跑」。** 界面上超过 6000 字符的字段会把显示切成「开头一段 + 省略行」（见第 5 节坑 26），那只是显示层——复制与运行用的都是完整内容，全选即可拿到全文。另外整个用例集受 localStorage 配额约束（约 520 万字符），见第 5 节坑 27。
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
- **浏览器插件抓题（2026-09 加，全流程见第 13 节）**：配合**改造版 Competitive Companion**（已更名 **CC for Web**、主色换成与本站一致的蓝）。原版是把题目 POST 到本机 `localhost` 端口，改造后改为在目标网站注入内容脚本、用 `window.postMessage` 推给已打开的站点标签页；站点侧落盘到 `/<年月>/<OJ 标签>/<难度>/<题名>.cpp`（挂在工作区根下；难度导入时为空、先落「未分类」；题目信息与抓到的样例都挂在这个文件节点上 `node.meta` / `node.config`，树里不另有条目），并把抓到的样例**整体替换**进评测面板。安装包在站内分发（设置视图「浏览器插件」分组）：下载 → 解压 → `chrome://extensions` 开开发者模式 → 「加载已解压的扩展程序」。**能力边界：只在站点已打开时投递**（没开就给一条系统通知提示先打开网站）；难度不会自动填（来源站点口径不一，由用户自己在题目信息弹窗里填），日期在首次导入时自动播种。
- **题解（Markdown / LaTeX，2026-09-30 加，全流程见第 15 节）**：`.md` / `.markdown` 能写、能预览、能排版，**但只是文本，不参与判题** —— 两个运行入口在题解下都是禁用态并给出一句提示（不是「点了没反应」）。预览依赖**按需下载**的 marked + KaTeX（约 578KB，缓存桶 `cph-md-runtime-v1`，与本地工具链同一套路数）：**没下载时预览面板显示的是「去下载」入口而不是空白页**，下完当场渲染，设置视图「本地运行环境」里可以整体卸载（清缓存 + 删全局 + 删标记三件一起做）。三条边界：① `.md` **不进**判题链路（`activeLanguage` 为 `null`，外部引擎也没有 markdown 语言）；② 公式只在预览里渲染，编辑器里就是 `$…$` 原文；③ 题解与代码文件共用同一套 VFS / IndexedDB 存储，没有「题解专用表」，重命名 / 移动 / 删除走的都是既有路径。
- **把文件从资源管理器拖到编辑区（2026-09-30 加，见 14.18）**：拖过去时编辑区亮起与「拖到树空白处（根区域）」**同一个变量**（`--bg-drop-root`）的提示色，松手后**已经开着就切到那个页签、没开就常开一个新页签**（不是预览页签；顺带把它从预览槽里钉住）。三条边界：① 高亮范围是编辑器**内容区**（`.editor-pane__stage`），不含页签栏与状态栏；② **目录不接**（拖目录过去不亮、不动作——目录的语义是「移动」不是「打开」）；③ 触屏也走同一条路（长按起拖之后拖到编辑区即可），没有额外的触屏入口。
- **界面双语（2026-09-29 加）**：界面、应用内帮助与使用指南都有**中文 / 英文**两套，语言默认跟随浏览器、可在设置视图「外观」组的「界面语言」里改，**切了当场生效、不重载**。写文案时注意两条边界：① **判题语言与界面语言无关**——判题语言仍由活跃文件的扩展名派生（第 5 节坑 15），界面语言只管文案，别把两者写成一回事；② **没有第三方本地化机制**（没引 vue-i18n，没有 `.po` / `.json` 语言包，没有 URL 前缀 `/en/`），词条就是 `src/i18n/messages/` 下六个 JS 文件里中英并排的对象，加语言 = 加一栏 + 在 `LOCALES` 里加一项。另外 `guide.html` 与 `guide.en.html` 是**两个独立的静态页**（各自的 `guide.html` 级别 SEO 头、互相 `hreflang`），不做客户端语言跳转——抓取器拿到什么就是什么。
- **全局快捷键（2026-09 加）**：可绑定的只有 6 个动作——运行全部用例 / 显示隐藏侧边栏 / **切换侧栏面板** / 侧边栏左右对调 / 新增测试用例 / 打开收起设置（表在 `SHORTCUT_ACTIONS`）。**没登记的动作就是做不到的**：格式化没进来，因为 Monaco 内置的 `Shift+Alt+F` 在 C++ / Python 下没有注册 formatter，绑了也是空按。**题解那 14 条格式键位刻意不在这个表里**（它们不可改、也只在 `.md` 里说得通，注册在 Monaco 上，见第 15.7 节）。绑定的键在编辑器里同样生效（监听在 window 捕获阶段，见第 5 节坑 21）；侧边栏折叠时按运行键会先把结果亮出来（见第 3 节「开跑必亮结果」），它和评测面板页脚那颗 ▶ 走的是同一个出口。**插件的快捷键改不了**：浏览器不允许网页改写扩展键位，也没法跳转到 `chrome://extensions/shortcuts`，所以设置视图里那一块只做「查看 + 复制该地址」。

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
  2. Application → Cache Storage 应只有 `cph-shell-v4`（约 100 条：外壳 + 全部 Monaco 分块 + 静态资源）；`cph-toolchain-v3` **install 之后不该存在**——要等真的跑过一次本地沙箱（该语言工具链被请求）才出现，且里面只会有用过的那个语言的文件；
  3. 在设置里切「本地 WASM 沙箱」跑一次「运行全部」，确认判定通过；
  4. DevTools → Network 勾 Offline（或直接拔网线），刷新页面：界面应正常渲染，再跑一次「运行全部」仍应通过——这一步才是真的在验工具链入了缓存，只看第 2 步的条数不够；
  5. 自动化同上一节：临时 puppeteer 脚本里用 `Page.getAppManifest` 拿 manifest 解析错误、用 `page.setOfflineMode(true)` 断网后跑一遍，跑完删脚本。
- 布局宽度专项（动过 `SidebarSwitcher.vue` / `EditorTabs.vue` / 侧栏各面板页头 / `.pane--tests` 下限后必做），临时探针、用完即删：在 1680 / 560 / 414 / 375 / 320 五档量四件事——（a）侧栏页头图标区（量 `.sidebar-switcher`，合计 90px = 胶囊 60 + 间距 4 + 设置 26）都可见、且右缘不超页头右缘，（b）侧栏宽 / 页头宽（与上表逐像素比，删掉页签栏那颗运行按钮后应仍是 663 / 238 / 199 / 180 / 158），（c）`documentElement.scrollWidth === innerWidth`（无横向溢出），（d）`.workspace` 的 `getBoundingClientRect().top === 0`（顶栏确实没了、工作区贴顶）。**只看有没有横向滚动条不够**：`.editor-tabs__strip` 自己会滚，真溢出反而被它吸收；要按第 3 节那个「必需宽度」公式自己算。2026-09-28 的实测表与结论记在第 3 节「无顶栏后的两条宽度线」（**运行按钮 2026-09-28 删除后已重测**，所以别再去找 `.editor-tabs__run`）。
- 插件抓题专项（动过 `problemImport.js` / `useCompanionBridge.js` / `useCompanionImport.js` / 落盘结构后必做），临时探针、用完即删。**不必真装扩展**——在页面上下文直接 `window.postMessage({ source: 'competitive-companion', type: 'cph-task', taskId: 't1', payload: JSON.stringify(task) }, location.origin)` 就能走完整条链路（`event.source` 与 `event.origin` 两道校验都能过）。要覆盖的六件事：
  1. 首次导入后树里出现 `<年月> / <OJ 标签> / 未分类 / <题名>.cpp` 这一条链（中间几层是归类用的，**不是**「题名」那一层目录），且该目录里**只有这一个文件**（题目信息与样例挂在节点上，不会再冒出第二个条目）；
  2. 底层数据在：`(await vfs.stat(path)).meta` 有 `url` / `oj` / `date` / `timeLimit`，`.config` 里能读到 `tests`；
  3. 往代码文件里写入 `// my solution` 再重抓同一道题 → 正文**原样保留**、样例换成新的；
  4. 评测面板的用例是**整体替换**而不是追加（第 3 条之后卡片数应等于新题目的样例数）；
  5. 同一个 `url` 换个题目名重抓 → 仍落在**同一个文件**上（按 url **全库**认题，哪怕算出来的新路径不同）；`url` 不同但题名相同 → 另起 `<题名>-2.cpp`；
  6. 抓完后编辑器打开的是这道题的代码文件（`.editor-tabs__item--active` 与 `workspace.activeId` 对得上）。
  写这个探针时踩过两个坑，别再踩：**（a）** 点树上的箭头展开目录时，只点 `.tree-item__row[aria-expanded="false"]`——`.tree-item__arrow` 这个 span 在**每一行**都有（文件行的箭头是空的），而点击处理挂在父级 `.tree-item__row` 上，所以「点所有箭头」实际会把每个文件都 `openFile` 一遍，最后点到的文件抢走 `activeId`，断言就会误报「打开的标题不对」；**（b）** 动态 `import('/src/services/…')` 拿到的可能是**另一个空实例**——Vite dev 给源码模块 URL 加了 `?t=<时间戳>`，裸路径 import 与 app 真正加载的那份不是同一个模块（症状是 `workspace.tree.length === 0` 但界面明明渲染出来了）。正确姿势是用 `performance.getEntriesByType('resource')` 找到 app 真实加载过的那条 URL 再 import。
- 快捷键专项（动过 `useShortcutManager.js` / `HotkeyRecorder.vue` / `App.vue` 的 `onKeydown` 后必做），临时探针、用完即删：设置视图 →「快捷键」→ 点某个动作的录制框 → 按 `Mod+Shift+KeyB` 这类组合应写入并回显；再录一个**已被占用**的组合应停在录制态、出现红字且**不写入**（这就是「阻止绑定」）；录 `Mod+KeyW` 这类浏览器原生键应被红字拒绝；刷新页面绑定仍在（`localStorage['cph.shortcuts']`）。最后验真正触发：光标放进 Monaco，按 `Mod+Enter` 应跑全部用例（说明捕获阶段确实抢在 Monaco 前面），按 `Mod+Shift+KeyE` 应翻到另一个侧栏面板（等价于点页头那枚胶囊）；开录状态下按同一个键**不应**触发功能。
- 界面双语专项（动过 `src/i18n/` 任一文件 / 任何含 `t()` 的组件或 service 后必做），临时探针、用完即删。四条要覆盖：
  1. **跟随浏览器**：第 0 帧不种任何存档，用 `--lang=zh-CN` 与 `--lang=en-US` 各起一次 Chrome，前者应中文 + `<html lang="zh-CN">`，后者应英文 + `<html lang="en">`，且**两种情况下都不写 `cph.uiLocale`**（跟随探测不等于用户显式选择）；
  2. **存档覆盖探测**：种 `cph.uiLocale = 'en'` 配中文浏览器 → 应英文；种 `zh-CN` 配英文浏览器 → 应中文；
  3. **切换当场生效 + 落盘**：设置视图「外观」组的「界面语言」下拉切一下，**同一 document 内不重载**就应看到目录八项（外观 / 编辑器 / 快捷键 / 评测 / 本地运行环境 / 浏览器插件 / 应用 / 帮助）全变、`html lang` 跟着变、`localStorage['cph.uiLocale']` 落成 `"en"`。**顺带验「数据表存 key」这条设计**：编辑器组里数据表驱动的行（`Font family` / `Minimap` / `Padding`）也必须跟着变——只验目录项验不出坑 28 第 1 条；
  4. **英文下的超长样例**（守住坑 26 × 坑 28 的交叉）：**框内那个 `……` 不翻译**（语言无关常量，见坑 26），只有框下面那行走 `t()` —— 英文是 `{n} characters not shown`；且**改语言后「选中省略行 = 选中被省略内容」依然生效**（按第 8 节的合成 `ClipboardEvent` 法测，`clipboardData` 是只读 null，要 `Object.defineProperty`）。最后截两套主题各一张图**真的看一眼**。
  探针注意：**同一个 browser 里 localStorage 跨页共享**，每一组用例前都要先 `localStorage.clear()`，否则前一组种下的 `cph.uiLocale` 会污染后面所有页面（实测踩过，表现是一整组假失败）；无头 Chrome 里 `navigator.clipboard.readText()` 恒返回空串，别拿它当断言。
- guide 双语专项（动过任一版 guide / `guide.css` / `sitemap.xml` 后必做），临时探针、用完即删。**机械可复核的四条**：两页都跑一遍，断言 ① `html lang` 各是 `zh-CN` / `en`；② `canonical` 各指向自己、两页都恰好有三条 `link[rel=alternate][hreflang]`；③ **h2 数 = 目录条目数 = 12**（这条是「两版没走偏」的廉价判据，改了章节数记得同步改期望值）；④ 页头 `.page__top-actions` 里 `.lang-link` 的 `href` / `hreflang` / `lang` 三属性。
  再加两条容易忽略的：**页头加了这颗链接之后不许换行**——断言 `.page__top` 高度 < 70px、`.brand` 与 `.page__top-actions` 的 `top` 差 < 6px、`documentElement.scrollWidth === clientWidth`；以及**英文页的表格**（英文文案比中文长约 30%）在 1400px 与 700px 两档下 `.table-wrap` 的 `scrollWidth === clientWidth`、表头没被压到换行（表头是 `white-space: nowrap`，真挤不下会直接溢出容器）。两档都要截元素级截图看一眼——页面级「无横向溢出」不会告诉你表格自己在容器里滚。
- 题解专项（动过 `mdView.js` / `mdFormat.js` / `mdRenderer.js` / `mdRuntime.js` / `MarkdownPreview.vue` / EditorPane 的题解段后必做），临时探针、用完即删。`npm run verify` 的 **H 步**（2026-09-30 加）只钉静态的那几条（`.md` 下工具栏与字数出现、状态栏消失、运行入口禁用、**⌘B 在 `.md` 里是加粗、在 `main.cpp` 里仍是收侧栏**），**渲染正确性仍然要人看**：
  1. 树里点开 `.md`（新建时模板就是题解骨架）→ 工具栏出现、`N 字 · M 行` 有数、底部状态栏消失；
  2. 切「双栏」——未下载时会先看到「下载渲染器」入口（不是空白页）→ 点它，进度按 `(当前/总数)` 走 → 下完当场渲染；
  3. 写一段含 `$E=mc^2$`、`$$…$$`、表格、任务列表、删除线、`<script>alert(1)</script>` 的正文：公式要变成公式、表格要成表、`<script>` 要被洗掉（**不许**弹出来）——这一条是 15.4 那条管线的唯一验收点；
  4. 滚动同步：在编辑器里滚，预览跟着滚；把预览滚到底再继续打字，位置**不该跳回顶部**（`lastRatio` 那一条）；
  5. `Mod+\` 四态轮换（仅编辑 → 双栏 → 仅预览 → 仅编辑；最后一步在「仅预览」下按得动，就是它当初搬去全局监听的原因）；全屏按钮收掉侧栏与页签栏、`Esc` 退出且**模式不变**；
  6. 设置视图「本地运行环境」卸载渲染器 → 回预览应重新显示「去下载」入口，控制台不该有 `MD_RUNTIME_MISSING` 之外的报错。
  探针注意：VFS model 的 uri 是 `vfs://file/<uuid>`，**认不出文件名**，要读编辑器内容就用 `monaco.editor.getEditors()[0].getValue()`；动态 `import('/src/services/…')` 在 dev 下可能拿到另一个空实例（见插件那节的两个坑）。
- 无头回归：`scripts/verify-ui.mjs`（`npm run verify`）。**B–H 应当是绿的**，跑之前先知道这几条：
  - **A 步有一条已知的既有竞态**：它在 `.monaco-editor` 可见后立刻探针，此时 model 还没绘出行，于是 `editorText: ""` / `codeLineCount: 1`，让 `codeLineCount > 3` 与 `editorText.includes('include')` 两条恒假（本机连跑两次都是同一签名）。**与面板切换无关**——同一个页面会话里 B 步读到的 `editorText` 是完整的（整份 C++ 模板，行数随模板改而变，别把行数写死进断言）。要修就得等 Monaco 的首个 model 渲染完（比如 `waitForSelector('.view-line')`），但那是另一件事，别顺手改。A 步真正在守的新契约是 `tabs === ['切换到评测样例','设置']`（胶囊那颗写的是去向）、`segIds === ['explorer','tests']`（两段都渲染出来了）、`sidebarSegActive === ['tests']`（胶囊填亮的段，读 `data-current`）与 `sidebarPanel === 'tests'`。
  - **B 步（切布局）走的是「设置页签」这条路**（2026-09 改）：点侧栏页头那颗 `aria-label === '设置'` 的 `.sidebar-switcher__tab`（它落在**当前可见的那个 `.sidebar__panel`** 里；`textContent` 是空的，认 `aria-label`）→ 断言编辑区里 `.settings-view` 真显示、`.editor-tabs__item--active` 落在含「设置」的那个页签上、`!document.querySelector('.topbar')` 且 `.workspace` 贴顶、目录里正好 **8** 个 `.settings-nav__item`（外观 / 编辑器 / 快捷键 / 评测 / 本地运行环境 / 浏览器插件 / 应用 / 帮助；2026-09 加了「快捷键」与「浏览器插件」两项、2026-09-28 后把「布局」并成「外观」并置顶，**加删分类时这个数字要跟着改**） → **点目录里的「外观」**（设置是「目录 + 内容」两栏，默认就停在第一项「外观」，右侧只渲染当前那一组；这一步仍显式点一下，默认分类以后再变也不坏）→ 在页签里选「右侧」（2026-09-28 起面板默认在**左**，所以这一步反过来选「右侧」）→ 点 `.editor-tabs__close[aria-label="关闭设置"]` 关掉 → 断言设置视图与设置页签一起消失。设置仍是 `v-show` 的视图、不是抽屉，所以「Monaco 实例不重建」的老断言（`data-marker`）照样成立。
  - **F 步（Python 模板与判题语言）走的是「资源管理器 → 点 main.py」这条路**（2026-09 改）：顶栏语言下拉已移除，语言只跟活跃文件的扩展名走。所以步骤是——先把面板切回「资源管理器」（用脚本里的 `showPanel(page, 'explorer')`，它点胶囊那颗 toggle；先判当前面板不是目标再点，否则会翻过头。该 helper 必须把 `page` 当参数传进来，`const page` 在 `try {}` 块里，模块级函数直接引用会 `page is not defined`）→ DOM click 标签为 `main.py` 的 `.tree-item__row` → 断言 `.view-lines` 文本（NBSP 已归一）含 `def solve`、`.editor-tabs__item--active` 是 `main.py`、动态 `import('/src/services/vfs/workspaceStore.js')` 后 `activeLanguage === 'python'` 且 `activeNode.path === '/main.py'`、`[...document.querySelectorAll('select')].every((el) => !!el.closest('.settings-view'))`（钉住「顶栏语言下拉不会复活」——现在全站只剩设置视图里那几个原生下拉）。
  - F 步曾长期误报：断言切到 Python 后 `.view-lines` 文本含 `def solve`，而 Monaco 把空格渲染成 NBSP（第 5 节坑 2），`includes('def solve')` **永远匹配不上**——已修（断言前把 `\u00a0` 归一成空格），现在过。这条 NBSP 归一化仍在用，别退回直接 `includes`。对照 A 步的 `includes('include')` 因为不含空格，从来没被这条绊到。
  - 它自己起 dev server，和常驻的 5199 冲突（`--strictPort`，撞上就直接退出），跑的时候用 `VERIFY_PORT=<任意空闲端口>` 覆盖（端口占用很随机，别写死某一个）。
  - **写探针时别用 `page.$('.xxx')` / `page.click('.xxx')` 去碰页头里的东西**：它们抓的是**文档里第一个**匹配，而侧栏那两个面板是 `v-show` 双份 DOM，第一个多半落在被藏起来的那个面板里。症状是 `Node is either not clickable or not an Element`（`page.click`）或截图报 `Node is either not visible`（`ElementHandle.screenshot`）。正确姿势：先用 `[...document.querySelectorAll('.sidebar__panel')].find((el) => el.getClientRects().length > 0)` 拿到可见面板，再在它里面 `querySelector`，要真点就用 `page.mouse.click(x, y)` 打真实坐标（2026-09-28 一天里踩了两次）。
  - 它跑的是默认 Piston 引擎（需要本地有 `localhost:2000` 服务），所以**E 步是「空过」**：断言只看徽标数量，引擎连不上、三个卡片全报错也照样 PASS，验不到本地沙箱。
  - **E 步同时守「开跑必亮结果」**（见第 3 节）：跑之前先把侧栏切回「资源管理器」再双击分隔条折叠，然后**按 `⌘/Ctrl + Enter`**（2026-09-28 起，页签栏那颗运行按钮删掉后 E 步改走快捷键——此刻侧栏正折叠着，页脚那颗 ▶ 是 `display: none` 点不到的，正好顺带守住「侧栏收起时快捷键照样能跑」），收尾断言 `.pane--tests` 又可见、且当前面板是「评测样例」（`collapsedBeforeRun` / `revealedAfterRun` 两个字段；后者看的是 `.sidebar__panel[data-panel] === 'tests'`，不再是 `is-active` 高亮）。顺序不能反——折叠后整栏 `display: none`，页头那几颗切换图标就点不到了。这一改让 E 收尾时侧栏停在「评测样例」，F 步本来就会自己切回「资源管理器」，两边不冲突。修饰键按平台取（`process.platform === 'darwin' ? 'Meta' : 'Control'`，与 `useShortcutManager` 的 `IS_MAC` 同口径）。
  - 2026-09 修掉的三处**恒假断言**（探针自己写错，别再踩）：偏好存的是 JSON 字符串（`"left"`）必须 `JSON.parse` 才能比；`.minimap` 节点常驻 DOM（宽度 0），可见性只能看渲染宽度；D 步拖拽方向要按当前 `flexDirection` 推导——前序 B/C 已把面板切到右侧，写死向左会让测试栏反向变宽。
  - **A / B / C 三步把「面板默认在哪一侧」写进了断言**（A 断言 `storedPanel === 'left'` 首屏默认、B 选「右侧」并断言 `testsPane.x > editorPane.x`、C 断言刷新后仍是 `'right'`）。2026-09-28 默认从右改成左时这四处一起翻过；**再改默认就把它们一起改**，并顺手过一遍 §12 那四处文案里描述左右的那几句（`guide.html` 首段与折叠小节、`index.html` 的 `<noscript>`）。`og-cover.png` 那张截图里的面板位置不会跟着变，`og:image:alt` 描述的是**那张图**、不是当前默认，别跟着翻。
  - **G 步（快捷键切换侧栏面板，2026-09-28 加）** 守的是 `switch-panel` 这条链路（第 13.4 节）：交替按两次 `Mod+Shift+KeyE` 断言 `data-panel` 走 `explorer → tests → explorer`（等价于点胶囊，走的是同一个 `Sidebar.vue` 的 `togglePanel`）；再双击 `.splitter` 折叠侧栏、按第三次，断言 `.pane--tests` 又可见**且**当前面板变成「评测样例」——「收起时按一下 = 先捞回来再翻面」这条契约就在这一句里。收尾记得把侧栏恢复成「可见 + 资源管理器」。修饰键用模块级常量 `MOD`（`process.platform === 'darwin' ? 'Meta' : 'Control'`），E 步那个运行快捷键也复用它，别再造一份。
  - **H 步（题解回归，2026-09-30 加）** 只钉静态的那几条（第 15 节）：走资源管理器页头那颗「新建文件」（`.explorer__btn` 的第一颗）把预填的 `new.cpp` 全选改成 `notes.md`（**必须先 `.select()` 再打字**——预填名只选中主干、后缀留在选区外，直接敲会得到 `notes.cpp`）→ Enter 后 `createFile → openFile` 会自己打开它，等 `.md-tools` 可见即算到位 → 断言 `.md-tools` 与 `.md-stats`（`N 字 · M 行`，正则同时收中英文）出现、`.editor-pane__status` **不可见**（它是 `v-if` 存在、靠 `.editor-pane.is-md` 收掉，所以只能看渲染盒）、`.run-inline` 为 `disabled` 且 `.run-blocked` 有字（此刻有用例、没在运行，唯一能置灰它的就是题解这条闸门）→ 再验「让路」那一对：先用 `monaco.editor.getEditors()[0].focus()` 把焦点**确定地**送进编辑器（让路判据正是「焦点在不在编辑器里」，别靠上一步顺手留下的焦点），按 ⌘B 断言正文多出一对 `**`（新建的文件是空的、题解模板里也没有 `**`，所以这条不会假过）**且侧栏没收起来**；点回 `main.cpp` 再按 ⌘B，断言 `.pane--tests` 被收起来了（同一个键在 `.cpp` 里落回全局的「收侧栏」）。收尾再按一次把侧栏放回来。探针里读编辑器全文用模块级 `editorValue(page)`（`monaco.editor.getEditors()[0].getValue()`，VFS 的 uri 认不出文件名）、按键用 `pressMod(page, 'KeyB')`。
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

- `install`：读构建期产出的 `/precache-manifest.json` 拿全部带哈希的产物名，与 `sw.js` 里手写的 `STATIC_ASSETS`（`public/` 下那些不过构建的静态资源：favicon、manifest、图标）合并后一起预缓存进 `cph-shell-v4`。**语言工具链不预缓存**——install 阶段不拉任何 `/wasm/` 资产，用户用哪个语言、哪个语言才在第一次请求时被 `cacheFirst` 写进 `cph-toolchain-v3`。**逐条 `catch` 容错**：任何一条失败都不能让整次 install 作废（install 失败等于永远装不上），漏掉的之后由 fetch 处理器补。
- `activate`：删掉名字不在保留名单里的缓存桶，再 `clients.claim()`。
- `fetch`：只碰同源 GET。**导航网络优先**（重新部署后刷新一次就拿到新外壳，断网才退回缓存的 `index.html`），其余缓存优先。跨域一律放行——判题服务地址是用户填的，SW 插手就会变成 CORS 事故；带 `range` 头的请求也放行，206 塞进 Cache Storage 会抛错。

**为什么文件名清单要构建期生成**：产物名带内容哈希，没法在 `sw.js` 里硬编码。`vite.config.js` 里那个 `cph-precache-manifest` 插件在 `generateBundle` 时把 `bundle` 的键写成 `precache-manifest.json`，正好绕开引依赖这件事。加产物类型（比如新图）时它会自动跟上，**不用改 `sw.js`**；但 `public/` 下的东西不过 `bundle`，加文件必须手动补进 `STATIC_ASSETS`（第 1 节表里那两条约束就是这么来的）。反过来，**`public/` 下不是每个文件都该进去**：`public/extension/*.zip` 就刻意不进——它只在用户点「下载」时才需要，而且靠**文件名带版本号**来换代（第 5 节坑 20），塞进 install 预缓存等于每次装 SW 都白拉几百 KB 的旧包。

**两个版本号，别混**：

- `sw.js` 的 `SHELL_VERSION = 'v4'` —— **只决定外壳桶名**（`cph-shell-v4`）。改外壳缓存策略或 `STATIC_ASSETS` 就升它，`activate` 会把旧外壳桶整个删掉。
- `sw.js` 的 `TOOLCHAIN_CACHE = 'cph-toolchain-v3'` —— **硬编码，刻意不跟 `SHELL_VERSION` 走**。2026-09-30 前两个桶共用一个版本号，升一次外壳就把老用户的 clang（52MB）+ CPython（24MB）一起删掉、逼他们重下 76MB；现在工具链桶名固定，它落在 `activate` 的 keep 白名单里，跨外壳升级无损继承，一个字节都不用重下。**换工具链时代码时才手动改这一行。**
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

2026-09 加。主应用是纯前端 SPA，抓取器拿到空壳壳；为此补了**真正的静态 HTML 入口**——使用指南长文（不带 Vue、不带任何 JS 逻辑），并在 `index.html` 里给不执行 JS 的抓取器留了一段正文。全程零新增依赖。2026-09-29 起指南页有**中英两版**（`guide.html` / `guide.en.html`）。

**五个 Vite 入口**（`vite.config.js` 的 `build.rollupOptions.input`）：`main` → `index.html`、`guide` → `guide.html`、`guideEn` → `guide.en.html`、`notice` → `notice.html`、`noticeEn` → `notice.en.html`。加新的静态页时照抄 `guide` 那一行即可——**`.html` 不列进 `input` 就不会被构建**（它不在 `public/` 下，不会被原样拷贝）。

**`guide.css`（`src/styles/guide.css`）的两条硬约束**（两版 guide 共用这一份，别为英文版另起一个）：

- 必须 `@import './base.css'` 打头——两套主题的配色、字体、滚动条都只在 `base.css` 里定义（第 1 节「颜色只走 CSS 变量」），指南页只准 `var(--…)` 引用、不写十六进制。底色 / 前景色靠 `base.css` 的 `:root` 变量直接落在 `html/body` 上，所以指南页天然跟随主题，不用自己写一套。
- `base.css` 是为「满屏 IDE」写的：`html/body` 高度 100%、`body` 锁死滚动（第 3 节）。内容页要在 `guide.css` 里把这两条**放开**（`height: auto; overflow: visible` 之类），否则长页滚不动。

**主题不闪**：两版 guide 的 `<head>` 里都有一段内联脚本，读同一份 `localStorage` 契约（`cph.editorSettings.theme`），存的是 `light`（或主应用还没跑过、尚未迁过的旧值 `cph-light`）时才给 `<html data-theme="light">`（不写即默认深色）。它**故意不加 `type="module"`**——普通内联脚本不会被打包器挪走或包起来，才能在首帧前同步执行、避免暗→亮闪一下。**两段脚本内容一致、两边都要留**，改一处要同步另一处。

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
- `public/sitemap.xml`：只有三条 URL（`/`、`/guide.html`、`/guide.en.html`），**故意不写 `lastmod`**（写死的日期会变成假信息；`changefreq` / `priority` 已被 Google 忽略）。指南页两条 URL 上各挂一组 `<xhtml:link rel="alternate" hreflang=…>` 互指（含 `x-default` 指中文页），`urlset` 因此要带 `xmlns:xhtml`——**不加这组互指，Google 会把两版当成互相竞争的重复内容**。
- `public/og-cover.png`：1200×630 的分享大图，被 `index.html` / `guide.html` / `guide.en.html` 的 `og:image` 引用（`og:image` 必须是绝对地址）。
- canonical / `og:*` / `twitter:*` / `ld+json` 都写在各自的 HTML `<head>` 里；站点主地址是**带 `www`** 的 `https://www.998244353.best`（apex 会 308 跳过来，canonical 用来收掉 Vercel 预览域等重复地址）。
- **主应用与两版 guide 的语言声明方式不同，别套用**：主应用是**同一个 URL 服务两种语言**（`cph.uiLocale` 存档优先、否则跟随浏览器），所以 `index.html` 里只写 `og:locale` + `og:locale:alternate`、`ld+json` 的 `inLanguage` 给成数组，**刻意不写 hreflang**（没有「另一语言版本的 URL」这回事，写了反而错）；两版 guide 是**一页一语言**，那边才需要 hreflang 三件套。

**致谢页也是「一页一语言」的一对**（2026-09-30 加）：`NOTICE.md` → `notice.html`（中文）、`NOTICE.en.md` → `notice.en.html`（英文），两页由 `scripts/render-notice.mjs` 一次生成（`npm run notice`，已挂 `prebuild`），页头各有一颗语言切换链接 + 一组对称的三行 hreflang，canonical 各指自己。**`notice.en.html` 与两版 guide 同列 `vite.config.js` 的 `input`，否则不会被构建**。**它刻意不进 `public/sitemap.xml`**（那份地图只有 `/` 与两版 guide 三条 URL，致谢页是许可义务页、不是要抢排名的内容页——要加就两页一起加，并带上 `xhtml:link` 互指）。两份源文件之间**没有自动同步**：章节与表格行逐条对应，改一份就要手改另一份（同 guide 的双语约定）；语言相关的外壳文案不写在 markdown 里，集中在 `render-notice.mjs` 的 `PAGES` 表。

**部署侧的 MIME**（`vercel.json`，见第 10 节）：`/robots.txt` 补 `text/plain; charset=utf-8`、`/sitemap.xml` 补 `application/xml; charset=utf-8`，两者都禁缓存（`max-age=0, must-revalidate`）。

**已知取舍**：两版 guide（以及致谢两页）**都不进 Service Worker 预缓存**（`vite.config.js` 的 `precacheManifest` 在 `generateBundle` 阶段从 `bundle` 生成，而 `.html` 是 `vite:build-html` 之后才产出的，清单里只有它们的 js/css）。所以断网访问 `/guide.html` 或 `/guide.en.html` 时，导航的兜底（`sw.js` 里 `caches.match('/index.html')`）会把**主应用外壳**顶上来——指南页离线不可用，但至少不会白屏。要改就在 `sw.js` 里单独缓存它们（每一版都要）。

## 13. 浏览器插件抓题（CC for Web）与全局快捷键

两块都是 2026-09 加的，彼此独立，只是同一批做的。

### 13.1 两端怎么接上

改造的插件在**另一个仓库**：`/Users/hejie/Code/cph-companion`（上游 jmerle/competitive-companion 的 fork，`package.json` 的 `productName` 已改成 **CC for Web**、版本 `2.65.x`，图标与宣传图的主色换成了与本站一致的蓝 `#0e639c`）。原版是把题目 POST 到用户本机的 `localhost` 端口（CP Editor / CPH 那套），fork 先是改成只推给本站，2026-09-30 又改成**两边同时投**——网站标签页与本地工具是并列的两个接收端，各有一个开关（选项页 `Destinations` 分组，默认都开），单侧失败不影响另一侧。

**投递目标可以在本站设置里直接切**（2026-09-30 加）：设置 → 浏览器插件 那一组多了「投递目标」两个开关，它们**只是扩展 `chrome.storage` 的镜像**——网页点一下发 `cph-set-config` 给扩展，扩展写盘后再回一条 `cph-config`，站点拿回执就地更新 `extensionInfo.config`（刻意不重跑 `refresh()`，否则面板会闪一下「检测中」）。写盘的真值是扩展存的，所以刷新页面后开关状态来自扩展的上报而不是站点自己的 localStorage。

**唯一能在网页里改的配置就是这两个键**：扩展 `background.ts` 里的 `WRITABLE_CONFIG_KEYS` 白名单只放 `sendToWebPage` / `sendToLocalTools`，且值必须是 boolean，其余一律回 `{ ok: false }`。**快捷键改不了**——Chrome 的 `chrome.commands` 只有 `getAll` / `onCommand`，没有任何写接口，站点只能展示 + 让人去 `chrome://extensions/shortcuts` 手动改（网页也不许跳 `chrome://`）。

**扩展侧**（`cph-companion`，改动集中在 6 个文件）：

| 文件 | 职责 |
| --- | --- |
| `src/hosts/targetSites.ts` | 目标网站白名单 `TARGET_SITE_PATTERNS`：`localhost:5199` / `127.0.0.1:5199`（**必须与 `vite.config.js` 的开发端口一致**，见第 0 节）+ `www.998244353.best` / `998244353.best`。少了哪条就等于「网站没打开」 |
| `src/hosts/WebPageHost.ts` | 查已打开的标签页、把任务投过去（**接收端之一**，与本地工具并列） |
| `src/hosts/hosts.ts` | `getHosts()` 按两个开关拼接收端列表：`WebPageHost` + `CHelperHost`(4243，body 带 `json\n` 前缀) + `CustomHost`(上游 7 个默认端口 + 选项页 `customPorts`)；`LOCAL_TOOL_ORIGINS` 是 manifest 的 host 权限来源，**匹配模式不带端口即覆盖所有端口** |
| `src/background.ts` | `sendTask()` 用 `allSettled` 并发投所有接收端，**全部失败才**发系统通知（`notifyNoReceiver()`，标题 `CC for Web`）；两侧都关（接收端列表为空）时静默，不拿「没有接收端」打扰用户；**消息处理必须用 `sendResponse` 回调式**，不要返回 Promise（Chrome 原生 API 不认）。另外两件事：`cph-get-info` 的 `getExtensionInfo()` 现在还要 `Promise.all` 把 `sendToWebPage` / `sendToLocalTools` 读出来塞进 `config` 字段（站点据此渲染开关）；`cph-set-config` 分支走 `WRITABLE_CONFIG_KEYS` 白名单写盘并回 `{ ok, key, value }` |
| `src/options.html` + `src/options.ts` | `Destinations` 分组两个勾选框，`config` 持久化 |
| `src/utils/config.ts` | 新增 `sendToWebPage` / `sendToLocalTools`（**默认 true**）。坑：`Config.get` 的兜底必须用 `??` 而不是 `||`——默认 true 的开关存了 `false` 会被 `||` 当成「没设置」回退成 true，开关等于关不掉（2026-09-30 实测踩到） |
| `src/bridge.ts` | **注入目标网站的内容脚本**：扩展拿不到网页的 JS 作用域，只能靠它做 `window.postMessage` 中转。页面→扩展的两条路：`cph-ping` → `cph-get-info` → 回 `cph-info`；`cph-set-config` → 转发给 background 写盘 → 回 `cph-config`（合法性由 background 把关，bridge 只转发不校验） |

**站点侧**两个 composable + 一个服务：`useCompanionBridge.js`（收消息）→ `useCompanionImport.js`（订阅 + 兜异常）→ `services/vfs/problemImport.js`（落盘）。`App.vue` 里只有一句 `useCompanionImport({ setTestCases, onImported })`。

**消息协议**（两侧的 `source` 常量是约定的握手暗号）：

| 消息 | 方向 | 载荷 |
| --- | --- | --- |
| `cph-task` | 扩展 → 页面 | `taskId`（每次抓取现生成的 uuid，**只用来去重**）+ `payload`（题目 JSON 字符串） |
| `cph-ping` | 页面 → 扩展 | `requestId`（站点自增，用来认领回包） |
| `cph-info` | 扩展 → 页面 | 同一个 `requestId` + `info`（`{ version, commands, config }`，`commands` 是插件自己的快捷键，`config` 是投递目标两项的当前值）。**`shortcut` 是浏览器自己那套写法**（macOS 上是 `⇧⌘U`、其它平台是 `Ctrl+Shift+U`），显示前必须过 `comboFromChromeShortcut()` + `formatCombo()` 转成站点写法（`⌘ + ⇧ + U`），否则同一个界面里会出现两种键位格式；`shortcut` 为空串是常态（Chrome 遇到冲突就不分配建议键，且不会事后补），此时显示「未设置」 |
| `cph-set-config` | 页面 → 扩展 | `requestId` + `key` + `value`（只认 `sendToWebPage` / `sendToLocalTools` 两个键 + boolean） |
| `cph-config` | 扩展 → 页面 | 同一个 `requestId` + `key` + `ok` + `value`（写失败时 `ok: false`，站点在那一组下面显示一行警示文案） |

站点侧的纪律：**只认本窗口、同源**的消息（`event.source === window && event.origin === location.origin`，挡掉 iframe 与外部页面伪造）；回包只认自己那一轮的 `requestId`（改配置的那一路回包同样按 `requestId` 在 `pendingConfigs` 里认领，`CONFIG_TIMEOUT = 1000` 没等到就当失败）；`taskId` 进 `seenTaskIds` 去重（同站多开标签页时扩展会广播）。握手会按 `PING_DELAYS = [0, 400, 1500]` 连探三次——内容脚本只在页面加载时注入一次，扩展被重载过而页面一直没刷新时会失联，多探几次能救回来；最后一次仍无回音才判定「未安装」（`PING_TIMEOUT = 500`）。

### 13.2 落盘结构（**动之前先想清楚**）

```
/<年月>/<OJ 标签>/<难度>/<题名>.cpp   用户写的题解 —— 只在首次导入时创建，此后一个字都不动
    · node.meta     题目信息：url / oj / difficulty / date / timeLimit
    · node.config   抓取结果：含全部测试样例 —— 每次抓取整体覆盖
```

**没有外层 wrapper**（2026-09-30 改）：题目目录直接挂在根下，与用户自己建的 `main.cpp` 平铺。此前是 `/Problems/<年月>/…`，`migrate.js` 会把老工作区里 `/Problems` 下的条目逐个 `rename` 到根一层，再把搬空的 `/Problems` 与 `/Contest` 删掉（标记 `cph.workspaceLayoutV2`，只跑一次；撞名时跳过该项并保留外壳，宁可留壳也不覆盖用户数据）。`migrate.js` 也**不再种子**这两个顶层目录——工作区骨架由用户自己长出来。

**为什么去掉 wrapper**：抓题是「按月归档」的形态，年月目录本身已经足够表达「这批是抓来的」；再套一层 `/Problems` 只是让树多一层无信息量的父节点。

- `<年月>` 取**当天本地时间**的 `YYYY-MM`（`todayMonth()`，`todayISO().slice(0, 7)`）。粒度到月：按天会长出大量只含一个文件的目录。
- `<OJ 标签>` 取自 `services/problemMeta.js` 的 `OJ_LIST` 中文标签（洛谷 / Codeforces / …），认不出来落 `其它`。OJ 由题目 `url` 的域名判断（`problemImport.js` 的 `OJ_HOSTS`，带子域名的按 `endsWith` 匹配）。
- `<难度>` 导入时**一律为空**（来源站点口径不一，由用户手填），先落 `未分类` 占位。用户事后填难度**不会**搬动已有文件——路径一旦定下就跟着题走，分层只对之后新抓的生效。这是一条纪律，不是待补的漏洞。
- 为什么不留「题名」目录、为什么题目信息挂在节点上而不是另立文件、为什么认 `url` 不认文件名 / 路径：全在第 5 节坑 18。
- `config` 里**原样保留**扩展送来的所有字段（`tests` / `timeLimit` / `memoryLimit` / `testType` / `input` / `output` / `group` / `interactive` / `name` …），只额外补 `oj` 与 `importedAt`：少存一份，将来要加模板或按批次分组就得回头重抓。
- 旧版这两样是同级的隐藏文件 `.cph/<题名>.json`，2026-10-01 起取消：`migrate.js` 的 `migrateProblemMetaInline()`（标记 `cp.problemMetaInline`）把 json 内容搬进 `node.config` 后连目录一起删；**配对不上（同名代码文件找不到）或 json 坏了就原样保留**，不猜。`meta` 不在这趟迁移里——题目身份本来就在导入时写进节点了。
- 代码文件后缀**暂时写死 `.cpp`**：扩展送来的 `languages` 里只有 `java`（TaskBuilder 的固定默认值），拿它判语言等于把每道题都当 Java，`cpp` / `python` 这些键上游解析器根本不写。等真做了模板功能再改这里（`CODE_EXT`）。
- 题名清洗（`sanitizeName()`）：非法字符换 `-`、空白收成一个、连续短横收成一个、**结尾的点 / 空格 / 短横剪掉**（题名里问号极常见，`Is It a Tree?` 替换完会留个尾巴），超长截到 80 字。全空退回「未命名题目」。
- 中间几层由 `ensureDirectory()` 逐级建（`createDirectory` 要求父目录已存在），整趟在一个 `vfs.batch()` 里，界面只重建一次树。
- 用户手填的**难度保留**、日期只在首次播种，其余（`url` / `oj`）每次刷新——见坑 18。

### 13.3 安装包的分发

- 包放在 `public/extension/cc-for-web-<版本>.zip`，站内直接给下载（`<a download>`），**不做自动更新机制**：装完要升级就重新下载解压、再在 `chrome://extensions` 里点一次刷新。
- 发新版的三步：`cph-companion` 里 `pnpm build:chrome` 构建 → 把 `build-chrome/` 打包成 `cc-for-web-<新版本>.zip` → 拷进本站 `public/extension/`，**同时**改 `EditorSettingsPanel.vue` 里的 `EXTENSION_VERSION` / `EXTENSION_FILE`。文件名必须换（第 5 节坑 20），「原地覆盖同名文件」能坑掉所有已下载过的用户。
- 卸载 / 重装提示写在设置视图那一组里：下载 → 解压 → `chrome://extensions` 打开「开发者模式」→「加载已解压的扩展程序」选中解压出来的目录。这是**未上架**插件的唯一安装方式，别改文案说成「一键安装」。
- **当前在站的版本：`2.65.3`**（2026-09-30 换版，行为改动是「可在本站设置页直接切换投递目标」；`2.65.2` 是同一天上一次换版，行为改动是「双投」）。两次换版都按上面三步走：`package.json` 改版本号 → `node scripts/build/extension.ts chrome true false`（本机没装 `pnpm`，直接 `node node_modules/tsx/dist/cli.mjs` 等价调用）→ `node_modules/.bin/web-ext build -s build-chrome/ -a dist/ -o -n cc-for-web-<版本>.zip` → 拷进 `public/extension/`、删掉旧包、站点 `EXTENSION_VERSION` 改同号。`NOTICE.md` / `NOTICE.en.md` 第四节与两页 `notice.html` 同步改过（那份文件自己规定「换 `public/extension/` 里的包」就要回来核对；改完跑 `npm run notice` 重新生成 HTML）。
- **换包会牵动站点侧的几个常量/文件**（一次别落下一个）：`EditorSettingsPanel.vue` 的 `EXTENSION_VERSION`（`EXTENSION_FILE` / `EXTENSION_DOWNLOAD_URL` 都是从它派生的）、`public/extension/` 下的 zip、`NOTICE.md` + `NOTICE.en.md`。`public/extension/` 不在 SW 的 `STATIC_ASSETS` 里，靠换文件名让老用户拿到新包。

### 13.4 全局快捷键

- 动作表 `SHORTCUT_ACTIONS`（**6 项**，2026-09-28 多了 `switch-panel`）就是全部能力边界，**没登记的动作就是做不到的**（理由见第 7 节）。加动作 = 改这张表 + 在 `App.vue` 的 `SHORTCUT_HANDLERS` 里补一条同 id 的处理函数，两处 id 必须对上。设置视图那个「快捷键」分组是 `v-for` 出来的，加动作不用改 UI。
- `switch-panel`（默认 `Mod+Shift+KeyE`，label「切换侧栏面板」，2026-09-28 加）等价于点页头那枚胶囊。处理函数是 `App.vue` 的 `switchSidebarPanel()`：先 `if (!panelVisible.value) togglePanel()` 把侧栏捞回来，再 `sidebarRef.value?.switchPanel()`。**翻面只有 `Sidebar.vue` 一处实现**——`switchPanel` 就是它内部 `togglePanel` 直接 expose 出来的，所以滑动动画（`hasSwitched`）、`localStorage` 持久化与点胶囊完全同源；别在 App 里另写一份改 `activeTab` 的逻辑，那样键盘切过去会没动画、还多一份状态。**先捞侧栏是刻意的**：侧栏收起着的时候只翻那个看不见的面板，用户会以为快捷键没生效。
- 展示：编辑器底部状态栏那枚运行提示读的是 `formatCombo(bindings.run)`，键改了提示跟着变（`EditorPane.vue`）——**别把它写成写死的 `⌘↵`**。
- 冲突检测分三类，都在 `shortcutConflict()` 一处：浏览器原生键（`BROWSER_RESERVED`）、没带修饰键又不是功能键 / `Esc`、已经绑给别的动作。冲突时录制框**停在录制态显示红字、不写入**，用户可以接着按别的组合，不用重新点一次。
- `resetAll()` 复位成默认表；单条可用 Delete / Backspace 清除（清成空串 = 未绑定，不是删键）。
- 原理、坑与「为什么不能改回 `editor.addCommand()`」全在第 5 节坑 21、22。

### 13.5 改这块时最容易连带踩到的

- 改落盘结构 → 老用户已导入的题目不会迁移（当初的决策就是「不迁移，只对新抓取生效」），别顺手写个迁移把人家的题解搬丢了。
- 改设置视图的分类 → `scripts/verify-ui.mjs` 里 `navItems` 那个数字要跟着改（第 8 节 B 步），否则无头回归直接红。
- 改扩展的 `TARGET_SITE_PATTERNS` / 开发端口 → 插件与网站是对着 `5199` 写死的，**两边必须一起改**（改了端口插件就再也找不到网站了）。
- 加/改「网页能改的扩展配置」→ 三处要一起动：扩展 `background.ts` 的 `WRITABLE_CONFIG_KEYS`、`getExtensionInfo()` 里读出来的 `config` 字段、站点 `EditorSettingsPanel.vue` 的 `EXTENSION_DESTINATIONS`（键名与文案），以及 `useCompanionBridge.js` 里 `cph-config` 回包的处理。网页端**没有**写扩展存储的能力，只能走这条消息通路。
- 动过扩展就要**升版本号 + 换 zip 文件名**（同版本号原地覆盖会被 SW 的 `cacheFirst` 坑住，见第 5 节坑 20），站点侧四个消费方一并改（见 13.3）。

## 14. 后续计划与待解决问题

这一节是**还没做、但已经想清楚怎么做**的清单（2026-09-28 记），按「动手前要先定的事」写，不是需求描述。**已落地：14.1、14.3（2026-09-29）、14.7（2026-09-29）、14.8、14.12、14.9（2026-09-30，架构变更，含 14.21）、14.15、14.19、14.20，以及 14.5 的固定结构 + 身份索引提级那一半、14.11 的阶段一**（这些条目保留在下面只作记录）。仍待做 5 项里靠前的都是站点侧小改动，越往后越重：14.6 会动用户数据，14.2 是 14.5 剩余部分的前置。**整节的建议落地顺序见本节末尾。**

### 14.1 把「资源管理器 / 评测样例」两颗按钮合并成一个切换钮 —— ✅ 已落地（2026-09-28，做成胶囊开关）

**原现状**：`Sidebar.vue` 的 `PANEL_TABS` 两项（`explorer` / `tests`）+ 一项 `settings`，三颗按钮并排渲染在面板页头（`SidebarSwitcher.vue`）；当前面板存在 `cph.sidebarTab`，两个面板用 `v-show` 切；`Sidebar.vue` 用 `defineExpose` 暴露 `showPanel(id)`，供 `App.vue` 开跑时把「评测样例」亮出来。

**做成了**：两个面板的入口是**「视觉像分段控件、交互是一颗 toggle」的胶囊**（当天改了两轮才定稿，见下）。改动落在三处：

- `Sidebar.vue`：`PANEL_TABS` 保留两项（仍是状态与持久化的唯一出处）；新增 `panels`（每项带 `active`）、`targetPanel`、`togglePanel`、`settingsEntry`、`toggleSettings`，经 `provide('sidebarTabs')` 下发。两个 `.sidebar__panel` 加了 `data-panel="explorer" / "tests"`。
- `SidebarSwitcher.vue`：`.sidebar-switcher__pill` **本身就是 `<button>`**（点它任意位置都 toggle），里面 `v-for` 出两段 `<span>` 作纯视觉指示（28×22、11px 圆角、带 `data-panel` 与 `data-current`、当前段 `.is-active` 填 `--accent`）；设置那颗是轨道外的 26×26 圆形按钮。
- `scripts/verify-ui.mjs`：探针新增 `visiblePanel()` / `visibleSegs()` / `sidebarSegActive`（读 `data-current`），用 `sidebarPanel`（读 `data-panel`）取代 `sidebarActiveTab`；`showPanel(page, id)` 改成「先判当前面板不是目标，再点胶囊」（**必须传 `page`**，块级作用域坑见第 8 节 F 步那条）；A / E / F 三处断言同步。

**两轮反馈各推翻了什么**（别再走回头路）：

1. 原方案是「两颗独立按钮合并成**一颗动作钮**」。落地后用户指出**看不出切换的过程**——只有一颗钮、只画「将要去的那一个」，看不到「有两个面板可选」。于是改成**胶囊**：两段并排住在一个轨道里、当前段填亮，「有哪些面板」和「我在哪一个」同时可见。
2. 第一版胶囊让**每段各自可点**。用户随即要求「点胶囊的任意位置都可以切换」——那版在胶囊里留了 2px 内边距的死区，而且点当前段本身是空操作。于是把整枚轨道做成那颗 `<button>`（toggle），两段降级为纯视觉 `<span>`。
   > 实测（真实鼠标坐标打 hit-test）：正中、上下左右边缘内 1px、当前段正中、另一段正中**全都能切**；只有圆角裁掉的那 1px 角不响应——那本来就不在胶囊形状里。
3. 接着要求「做一个胶囊按钮中切换的动画」。这里有个真陷阱：胶囊在**两个面板的页头里各有一份实例**（`v-show` 藏一份），点一下就是把刚点的那份藏了、另一份亮出来，**高亮不是同一个元素在移动，`transition` 永远看不到**。做法是让新亮出来的那份里的选中段用 `animation` 从旧位置滑过来（两份胶囊屏幕位置完全相同，看起来就是同一枚高亮在横移），`color` 从 `transparent` 起步遮掉「图标在起点就跳成目标图标」那一瞬，并用 `[data-switched]` 挡掉首屏那次假切换。**没有改动 DOM 结构、也没有加 JS 状态机式的东西**（只多了一个「点过胶囊」标记）——把胶囊提出面板做成单一实例是另一条路，但那会破坏「切换入口长在面板页头里」这个已经定过的布局。
   > 当时实测确认过两件事，重做后仍成立（对外接口没变）：位移起点确实是一段宽（放慢到 2s，取样点推得回 28px 的起点）、`[data-switched]` 确实挡住了首屏那次假切换（首屏动画数 0，点击后 1）。
4. 紧接着（同日下午）用户指出这版动画**不够美观，而且蓝色高亮上的图标会跟着一起横移、不符合直觉**——图标应该待在原格，动的只有高亮。于是把**位移与图标拆成两层**：位移只挂在选中段的 `::before`（蓝色高亮本体；段自带 `isolation: isolate`，让这个 `z-index: -1` 只在段内生效），**段自己完全不参与 transform，图标因此钉死不动**；段的 `color` 另走一条 `sidebar-icon-light-up`（200ms + 90ms `delay` + `backwards`，延迟期间保持暗态）——高亮先滑到位、图标随后在原地点亮，就是 iOS 分段控件的观感。旧 keyframes（`sidebar-seg-from-left` / `-from-right`，含 `color: transparent` 那招）整组废弃。
   > 实测（把指示块动画放慢到 2s、切换后每 110ms 逐帧取样）：**图标横坐标取值集合是单值**——`activeIconX` 恒为 762、`inactiveIconX` 恒为 734，一格都没动；真正在动的只有 `getComputedStyle(seg, '::before').transform`，从 `matrix(1, 0, 0, 1, -24.14, 0)` 单调收敛到 `none`。另采样 `color` 确认图标在约 220–330ms 由 `rgb(162, 163, 162)` 淡到 `rgb(241, 247, 244)`（真实时长为 90ms 延迟 + 200ms 淡入）。层叠也核对过：`::before` 在**自己所属段**的 stacking context 内 `z-index: -1`，而该段作为兄弟节点绘制在其他段之后 → 蓝块滑动时盖住另一段的图标、不盖自己段的图标；两张途中截图确认轨道内无露底、无空洞、无遮挡异常。

**其余决定**：

- **页头宽度最终仍是 90px**（胶囊 60 + 间距 4 + 设置 26），与最初「三颗 30px」逐像素一致；中间那版单钮的 60px 是过渡态。第 1 节硬约束表与第 3 节实测表已同步，且因为总占位回到原值，**第 3 节其余各列不必重测**。
- **设置那颗不进胶囊**：塞进同一枚胶囊会暗示它是第三个面板、且属于同一个单选组（它其实是编辑区页签的独立开关）。第一版把它的 `.is-active` 做成 `--bg-hover` 底以求「不与胶囊抢」，截图一看那色和轨道 `--bg-control` 几乎同色、两个控件糊成一块，于是改成与面板段同一枚实心蓝——它在轨道外、是个圆形，不会被误读成「第三个面板被选中」。
- **`showPanel('tests')` 的语义保住了**：仍是直接赋值、不是 toggle，`App.vue` 的「开跑必亮结果」不受影响。
- **`defineExpose` 现在是两个**（2026-09-28 下午加）：`showPanel(id)`（直接赋值，给「开跑必亮结果」）与 `switchPanel()`（就是内部 `togglePanel`，给快捷键 `switch-panel`）。两者分工别混：要「必定落到某个面板」用前者，要「翻到另一个」用后者。
- **沿用 `cph.sidebarTab`**，没开新 key；老存档里的 `explorer` / `tests` 继续有效。

**还没做（留给后续）**：页头宽度只在 1680 视口下跑过 `npm run verify`，320px 窄档没重量（总占位与最初实测的那一版相同，风险低）。

### 14.2 VFS 需要优化（14.5 的前置）

**现状与痛点**（都能在代码里指认，不是猜的）：

- **接口缺 `readDirectory` / `list`**：`BaseVFSProvider` 只给 `getTree()`（整树）。所以 `problemImport.findByUrl()` 为了按 url 找一道旧题，得把整棵树取回来再自己递归找节点——题目一多，这一步就是 O(全库)（题目分层落盘后它已经是全库扫描，见 13.2）。
- **启动时把所有正文读进内存**：`LocalVFSProvider` 初始化走 `contentsStore.getAll()`，把**每个文件的正文**都塞进 `#contents`。文件少时无所谓，题解多了以后这是启动耗时和常驻内存的主要来源；正文完全可以惰性读。
- **`rebuildTree()` 是全量重建**：`workspaceStore` 里任何一次改动都重取整树 → 重新 walk 建索引 → 清理死 tab。`rebuildChain` 只是把它串行化，并没有减少工作量。
- **rename / delete 一律聚合成一次 `reset`**（见 `workspaceStore.js` 头部注释），UI 侧永远吃一次全量 diff。
- **`getTree()` 每次调用现组装 `children`**（存储层不维护），整树越大这项成本越高。

**建议方向（按收益 / 风险排序）**：

1. 给 provider 补 `readDirectory(path)`，把「按目录找题」从 O(n) 降到 O(该目录)。
2. 正文惰性加载：`#contents` 只缓存打开中的文件（或做 LRU），其余按需读 IDB。
3. `rebuildTree` 改成按变更子树局部刷新，或给 `getTree()` 加缓存 + 失效标记。
4. 常驻一份 `path → node` 索引，替掉 `findByUrl` 那种自己 walk 的写法（或直接维护一张全局 `url → path` 表，让认题变成 O(1)）。

**不能破的约定**：题目信息与样例都挂在代码文件自己的节点上（`node.meta` / `node.config`，第 5 节坑 19）、代码文件正文永不覆盖、题目身份认 `url`。

### 14.3 把 CC for Web 的时限接到评测时限上 —— ✅ 已落地（2026-09-29，走的是「挪进节点 meta」那条路）

**做法**：题目时限不再当成「全局档位的替代品」，而是**每道题各自一份**：
`problemImport.js` 在落盘时把扩展送来的 `timeLimit`（毫秒）写进节点 `meta.timeLimit`（`normalizeMeta()` 校验，合法区间 100ms–60s，越界归 0 = 未设置），
`App.vue` 的 `effectiveTimeLimitMs` 再按「活跃文件的 `meta.timeLimit` 非 0 就用它、否则退回全局 `cph.timeLimitMs`」算出真正生效的值，`runAll()` / `runOne()` 都喂这个 computed。
UI 侧新增的只有**题目信息弹窗里的「时限（秒）」**一栏（`FileExplorer.vue`，step 0.5、留空用默认），全局档位仍是设置视图「评测」组的四档下拉。
顺带把**时限从面板页头搬进了设置视图**（页头只剩胶囊 + verdict + 耗时），面板页头因此不再有 `.select`。
**判定口径没动**：仍然只计运行段、Python 仍多给 `PYTHON_STARTUP_ALLOWANCE_MS = 500`。

**当初列的四个坑怎么解的**：

- **枚举 vs 任意值** → 绕开了：全局档位保持四档枚举，题目侧走任意毫秒（UI 输入秒、0.5 步进），两条路各管各的。
- **口径不一样**（面板只计运行段、OJ 给整段 wall-clock）→ 照旧按本机口径判，**文档里写明白了**（`guide.html` 第 6 节「时限与耗时的口径是什么？」），不做整段 wall-clock 的近似。
- **要不要覆盖用户的选择** → 不需要区分了：题目时限进 `meta`，全局档位一个字节都不碰。
- **这是全局量，不是每道题一份** → 正是因此才把它挪进 `meta`（节点元数据的第 5 个字段，`problemMeta.js` 的 `emptyMeta()` / `formatMetaTooltip()` 一起加了它）。

**还没做的**：`node.config` 里也留着原始 `timeLimit` 字段（每次抓取刷新），目前只有 `meta.timeLimit` 参与判题；两者是「来源备份」与「生效值」的关系，别顺手删掉前者。

### 14.4 默认模板功能

**现状**（2026-09-28 更新）：**骨架已经有了，缺的是把新建也接上去**。两份骨架写在 `services/templates.js`（`defaultCode(id)`，C++ / Python，**不含样例块**——`{{ … }}` 那种「样例写进注释」是 CPH 的约定，本站用不到，2026-09-28 已去掉），目前被两处消费：`migrate.js` 首次建工作区时种出 `/main.cpp` / `/main.py`，`workspaceStore.js` 的 `openLanguage()` 在对应文件缺失时兜底创建。**还没接上的两处**：文件树新建走 `createFile(path)` 的空串（`FileExplorer.vue` 的内联输入框），导入题目走 `problemImport.js` 的 `NEW_FILE_CONTENT = '// your code here\n'`（注释里写着「等真做了模板功能再改这里」）。

**要做的**：把「新建文件」与「导入题目」都接上 `defaultCode(按扩展名判出的语言)`，与种子 / `openLanguage()` 兜底共用同一份（骨架已经在 `templates.js` 里了，别再造第二份）。

**坑**：

- **按扩展名选模板，不要按「当前激活语言」**：在 `.cpp` 上新建 `main.py` 时，当前激活的还是 cpp。
- **顺带把 `CODE_EXT` 做活**：导入题目的后缀现在写死 `.cpp`（见 13.2），做模板正好是把它变成可配置的时机，两件事应当一起做。
- **模板存哪（部分已定）**：内置骨架已定为**写死在源码里**（`services/templates.js`，用户不可编辑）。将来若要让用户**可编辑**，得先决定它的家——放 localStorage 不适合多行代码，另立一套隐藏存储又会让用户看不见（看不见也就改不了）。这是「先定产品形态再写代码」的问题。

### 14.5 文件归类设置（可视化编排 时间 / OJ / 难度 三层目录）—— 🟡 固定结构已落地（2026-09-28），配置 UI 未做

**需求**（2026-09-28 澄清）：在**设置面板里新增一个「文件管理」分类**，用来规划导入的题目落盘时怎么分层。

- **默认是 `时间 / OJ / 难度 / 题目名.cpp`**（时间在最外层）。
- 三个维度（时间 / OJ / 难度）**顺序可以互换**，**每个都可以选或不选**——关掉的那个维度直接从路径里跳过，不是落一个「无」目录。
- 编排要**图形化**：三个维度做成可拖拽的卡片 / 标签，横向排列即层级顺序，各自带一个开关，旁边实时预览最终路径。
- 在图形编排之外，**仍然允许自定义文件夹结构**（手写层级模板串，作为高级入口）。

**现状**（2026-09-30 更新）：落盘**已经**按「时间 / OJ / 难度」分好层（见 13.2）——`/<年月>/<OJ 标签>/<难度>/<题名>.cpp`（挂在工作区根下），难度为空落 `未分类`；认题也已经**提级成全库按 url 查**（`findByUrl()` 扫全库、按文件节点的 `meta.url` 找回，并复用题目原目录），这是这条需求能不能做的**前提**，已完成。**还差的只有「让用户可配置」这一半**：`EditorSettingsPanel.vue` 的 `SECTIONS` 仍是 9 项（2026-09-30 加了「常用设置」，见 14.19），没有任何设置项与这套路径对应——三个维度的顺序与开关都还写死在 `problemImport.js` 里。难度在节点 `meta.difficulty`（**用户自己填**，导入时保留不覆盖），日期在 `meta.date`（只在首次导入时播种）。

**要做的三块**：

1. **新增设置分类**：`SECTIONS` 加一项（**9 → 10**），内容按现有设置面板「分组 + 行」的写法组织（`EDITOR_GROUPS` 那套）。
2. **图形编排 UI**：三个可拖拽的维度卡片 + 每张卡上的开关 + 旁边的路径预览。拖拽必须**原生实现**（第 1 节硬约束：不引第三方 UI 库），且要键盘可操作（左右箭头换序）+ `aria-label` 交代「第几层」，否则触屏 / 无鼠标用户用不了。
3. **路径装配**：把 `problemImport.js` 里写死的那三段（`todayMonth()` / OJ 标签 / `未分类` 兜底）抽成「读设置 → 编译成分段数组」；自定义模板串那条高级入口复用同一套装配逻辑，别写两份。

**坑（这条风险最高，直接动用户数据）**：

- **新增设置分类会让无头回归直接红**：`scripts/verify-ui.mjs` 里 `navItems` 断言的是设置分类数（第 8 节 B 步），8 → 9 必须同步改；第 4 节 CSS 类名表里那句「8 项」也要跟着改。
- ~~**先确认一件事：根目录 `/Problems` 还留不留**~~ **已定（2026-09-30 改）：去掉**——题目目录直接挂根下（见 13.2），与用户自己建的 `main.cpp` 平铺。原先 2026-09-28 的「保留 `/Problems`」决定作废；`migrate.js` 已不再种子 `/Problems` 与 `/Contest`，并会把老工作区里 `/Problems` 的内容搬到根一层（标记 `cph.workspaceLayoutV2`）。
- ~~**默认把「时间」放最外层会不断长出新顶层目录**~~ **已定（2026-09-28）：粒度 `YYYY-MM`（按月）**，按天会产生大量只含一个文件的目录。
- ~~**难度维度首次导入时是空的**~~ **已定（2026-09-28）：维度开着但当前题无值 → 落「未分类」**（整层不跳过，新题路径层级才稳定）。用户事后填难度**不搬动**已有文件，见 13.2。
- ~~**`findNameByUrl` 会失效，这是能不能做的前提**~~ **已做（2026-09-28）**：`findByUrl()` 已改成**全库**扫文件节点的 `meta.url` 找回旧题目、并复用原目录。只要「身份索引提级」这条在，路径可配置以后「用户一改结构、老题就变孤儿」的风险就不存在——保留这条记录只为说明它当初为什么是前置条件。
- **对老数据零影响**：与 13.2 的纪律一致——新规则只对之后抓的题生效；若要做「重新归位」，必须是一次独立的、要用户确认的操作，绝不能隐式迁移（题解会跟着代码文件挪窝，一动就丢）。**唯一例外是 13.2 的外层 wrapper**：去掉 `/Problems` 这一层是一次性的、结构级的搬迁（题目相对根的位置整体上移一级，题目内部结构不变），已由 `migrate.js` 的 `cph.workspaceLayoutV2` 标记兜住、只跑一次；**不要**照此把「按新维度规则重排题目」也做成隐式迁移。
- **持久化放哪**：维度顺序与开关是全局偏好，适合进 localStorage 的一个新 key（如 `cph.problemLayout`）——它是设置项，**别塞进 VFS 的节点里**。
- **强依赖 14.2**：路径多两层之后全树规模明显变大，`rebuildTree` 的整树重建会先扛不住。

### 14.6 比赛模式（赛时功能）

**需求**：加一个「比赛模式」开关，开启后**新建一个以比赛名字命名的文件夹**，并把这场比赛**所有题目的样例**一次性准备好。

**好消息：扩展侧不用改**。比赛解析走 `Contest`（`cph-companion/src/models/Contest.ts`），它的 `send()` 是**逐道题顺序发**，并且在构造时把每道题的 `batch.id` 统一成第一道题的那个、`batch.size` 设成题数。所以站点收到的每道题目 JSON 里本来就带着这些：

- `group`：比赛名（`TaskBuilder.setGroup()`）
- `batch: { id, size }`：`id` 同一场比赛共用，`size` 是题目总数；**单题解析时 `size === 1`**（`TaskBuilder` 默认 `{ id: uuidv4(), size: 1 }`）
- `tests`：样例已经在载荷里，不需要额外去抓

而 `problemImport.buildConfig()` 是 `...task` 展开落盘的，**这三样现在就已经存进该文件节点的 `node.config` 里了**。

**要做的**：一个开关（放哪待定：设置面板 or 面板页头）→ 收到 `batch.size > 1` 的一批任务时，落进比赛目录（如 `/<group>`；`/Contest` 这个旧壳 2026-09-30 起不再种子，见 13.2，落点届时再定），而不是按 OJ 分目录；并给出「第 3 / 8 题」这类进度。

**坑**：

- **`batch.id` 不能当题目身份**：它是每次解析现生成的随机 uuid（`problemImport.js` 顶部注释就是这么说的）。但用来把「同一场的一批题」归到一起**正好合适**——别把它的用途搞混。
- **是逐条顺序到达，不是一次数组**：`Contest.send()` 是 `for ... await`。所以站点侧要在**第一条到达时**就把比赛目录建好，并知道后面还有 `size - 1` 条。中途用户关页面 / 某题解析失败会只落一部分 → 要有「本场还差 N 题」之类的提示，否则用户以为抓全了。
- **比赛名是外部输入**：落盘前必须过 `sanitizeName()`，重名还要走 `resolveFreeName()`。
- **与 14.5 的目录规则冲突**：比赛模式要的「用比赛名新建一层」和 14.5 的「时间/OJ/难度」是两套规则，得明确比赛模式是否**绕过**归类设置（建议绕过：比赛场景下比赛名就是最自然的顶层）。
- **同一场比赛再抓一次要复用已有目录**，不能新建出「比赛名-2」（与 13.2「身份认 url」一致）。

### 14.7 右键菜单加「打开题目链接」 —— ✅ 已落地（2026-09-29）

**做法（2026-09-29）**：`FileExplorer.vue` 新增 `problemUrl(node)` —— `new URL()` 解析后只放行 `http:` / `https:` 并返回归一化的 `href`，解析失败或伪协议一律返回空串。**菜单项与开链接共用这一个判据**：`buildMenuItems()` 里「有链接才 push 这一项」（两项都是题目相关，2026-09-30 起它排在「题目信息」**前面**），`onMenuSelect()` 里 `window.open(url, '_blank', 'noopener')`。这样「点了没反应」与「伪协议被执行」两个问题一起避开：`meta.url` 只做 trim + 截 500 字（`problemMeta.js`），协议没有任何约束。文案是 `explorer.menu.openUrl`（中英两栏）。

**现状**：`FileExplorer.vue` 的 `buildMenuItems(node)` 现在按节点类型分支——文件给 `打开题目链接`（有 `meta.url` 时才给，2026-09-29 加、2026-09-30 提到最前）/ `题目信息` / `重命名` / `删除`，目录给 `新建文件` / `新建文件夹` / `重命名` / `删除`（后两项是 2026-09-28 加的，见坑 14）；`onMenuSelect(id)` 按 id 分发。题目链接存在节点 `meta.url`（题目信息弹窗里可编辑，`beginEditMeta` 读的就是它）。

**要做的**：给**有 `meta.url` 的节点**加一项「打开题目链接」。

**坑**（落地时都按这条做了，留档）：

- **只对带 `url` 的节点出现**：导入的题目才有；用户自建文件、所有目录都没有。别无条件下发一项，否则点了没反应。
- **`url` 是不可信输入**（一半来自扩展解析结果，一半来自用户手输），`window.open` 之前**必须校验协议是 `http:` / `https:`**，否则 `javascript:` 这类伪协议会被当链接执行。
- 用 `window.open(url, '_blank', 'noopener')`，别让新页面拿到 `window.opener`。
- 位置挨着「题目信息」（两者都是题目相关的），没塞在「删除」后面；2026-09-30 两项对调，现在是「打开题目链接 → 题目信息」（常用的那个排前面）。

### 14.8 换掉「新建文件 / 新建文件夹」的图标 —— ✅ 已落地（2026-09-28）

**做法**：`AppIcon.vue` 的 `PATHS` 表新增 `file-plus` / `folder-plus`——**主体轮廓原样沿用 `file` / `folder`，另加一个跨出主体底边右下角的加号**（`M19 17v6` + `M16.5 20h5`，两枚共用同一段加号）。`FileExplorer.vue` 页头两颗按钮改用新图标，**树里节点仍用旧的 `file` / `folder`**。24×24 网格、`:size="14"`、页头宽度都没动。

**选型过程**：对比过四种——A 纯加号（VS Code 新版，两钮同图靠 title 区分）/ B 加号在主体上方 / C 加号跨出底边外露 / D 加号在主体中部。选了 **C**（动作感最强、主体不被遮挡）。D 是上一轮被否掉的方案。

**坑**（以后再动图标同样适用）：

- 图标必须画在 **24×24 网格**上（`AppIcon.vue` 现有路径都是这个网格），否则和旁边的 `SidebarSwitcher` 图标对不齐；`.explorer__btn` 是 26×26、图标 `:size="14"`，只要不改尺寸就不会动页头宽度（窄屏余量见第 3 节）。
- 加完确认树里节点**仍然**用旧的 `file` / `folder`。两处一起改就等于没区分。

### 14.9 登录 + 云同步 —— ✅ 已落地（2026-09-30，做法：Cloudflare Worker + KV）

**原需求**：加账号体系与跨设备云同步。

**原现状（也是当初最大的障碍）**：

- 当时是**纯静态前端**：没有后端、没有账号，Vite 构建直接上 Vercel，数据全在浏览器本地（VFS 落在 IndexedDB）。
- 第 0 节写着「**新增 npm 包要先讨论**」，而这件事看着必然要引后端 / 第三方 SDK——所以它**不该被排进功能队列，它是一次架构变更**。
- 站点为了 WASM 多线程带了 `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`（第 1 节硬约束），跨源脚本 / 资源都要带 CORP 头，第三方 SDK 的接入方式要按这个约束先验一遍。
- VFS **没有版本号、也没有变更日志**：rename / delete 一律聚合成一次 `reset`（见 `workspaceStore.js` 头部注释），同步需要的「增量」当时拿不到。

**当初「必须先定」的四件事，最后的答案**：

1. **同步什么** → **只同步偏好类键**，就是 `cloudProfile.js` 的 `SYNC_KEYS`（12 个）：编辑器偏好（含主题）/ 存档版本号 / 站点快捷键 / 界面缩放 / 界面语言 / 侧栏左右 / 编辑器与评测面板的宽度比 / 侧栏停在哪个面板 / 题解视图模式 / 全局时限 / 评测引擎 / 预下载勾选。**题目文件、测试样例、判题服务器地址一律不上传**：`cp.testCases` 是内容而不是偏好、体积也大；`cp.judgeBases` 可能是内网地址，而云端是**公开可读**的；三个 runtime ready 标记是「这台设备有没有下过」的事实，换设备根本不成立。
2. **谁是权威** → **本地优先，但一次交换一整个快照**：云端存的是全量偏好快照，**没有增量、也没有合并**。登录 / 点「下载到本机」= 云端那份覆盖本机；点「上传本机设置」= 本机那份覆盖云端。特意没做文件级同步（当初 VFS 没有增量、也没有变更日志，这条短板至今还在）。
3. **冲突策略** → **last-write-wins**，界面上只把 `updatedAt` 显示成「云端最近更新」给你自己判断，不做三方合并。
4. **鉴权与后端用谁的** → **自建一个 Cloudflare Worker（`cf-config-api`）+ KV**，接口挂在**站点自己域名下的 `/api/*`**（Worker Route）。于是浏览器看来全是同源请求：不需要 CORS，也**不与 COEP: require-corp 冲突**（第 1 节硬约束）。**前端零新增 npm 包**（只用 fetch），绕开了第 0 节「新增包要先讨论」那条门。

**身份怎么证明**：服务端发一枚验证码存进 KV（TTL 600s，同一 handle 10 分钟最多 5 次），用户把它填到自己 Codeforces 个人资料的 **Last name** 上，服务端再调 CF 公开 API 读回来比对（两边都 `trim()` + `toUpperCase()`，所以大小写不敏感）。**「用户名」始终指 Codeforces handle，Cloudflare 只是托管平台**——文案与注释里别把两者混成一件事（见 `cloudProfile.js` 文件头）。

**三条刻意的设计**：

- **登录不写云端**：云端已有配置时，登录只做「验证身份 → 读回云端原文 → 落到本机」（回写的是原文，服务端内容一个字节都不改）；云端为空（404）就直接认领这个用户名并提示手动上传。理由：换台设备第一次登录时本机往往还是一套默认设置，顺手推上去就把云端那份好的冲掉了。
- **唯一覆盖云端的入口是已绑定态下的「上传本机设置」**（要重新取一枚码；本机有设备令牌时直打 `/api/save` 不取码）。
- **解绑只断本机关联**：不发 unbind 请求、不动云端（云端那份本来就在「拿到 handle 就能读」的位置），同时清掉跟着 handle 走的 `cp.cloudToken`。

**落地位置 / 改这块先读哪**：

| 东西 | 位置 |
| --- | --- |
| 后端与接口契约的**唯一记录** | `docs/云端同步服务.md`（拓扑、五个接口的实测契约与错误原文、KV 键与 TTL、安全边界、Worker 源码附录、部署自测命令）。**Worker 源码不在本仓库**，改前先读、改完回来更新它 |
| 前端接口层 | `src/services/cloudProfile.js`：`postJson`（网络失败折成 `{success:false}`、失败带 `status`）+ `SYNC_KEYS` + `collectProfile` / `applyProfile` |
| 界面 | `EditorSettingsPanel.vue` 的「云端同步」分组：三态 UI（未绑定 / 待验证 / 已绑定）+ 取码面板 + 自绘确认弹窗，外加设备令牌、401 自动退回取码 |
| 本地 dev 的 `/api` | `vite.config.js` 的 `server.proxy` 转发到线上域名。**别在代码里写死 Worker 域名**：`workers.dev` 子域在国内网络不通 |
| 网址形态的入口 `/<handle>` | 见 14.21 |

**坑**：

- **验证码是单枚有效**：取新码会让旧码立刻作废，所以面板上必须把这句写出来（`settings.cloud.codeWarn`），否则用户会拿旧码去比对然后一头雾水。
- **取码用的是用户输入的 handle，验证时比对的是 CF 返回的规范名**：大小写不一致（`he-jie` vs `He-Jie`）会让验证莫名失败——靠服务端两边统一 `trim()` + `toUpperCase()` 兜住，别在客户端"顺手"做一次 toLowerCase。
- **「上传」等于「同意公开」**：`GET /api/config/<handle>` 没有任何鉴权，这句话必须在按下按钮之前就看得见 —— 同一份声明铺在四处（设置页一条 `.setting-group__note` + 两版 guide 的 §11 + `使用手册.md` 末尾附录），清单与措辞见 `docs/云端同步服务.md` 第 6.1 节。
- **同步白名单是唯一的边界**：往 `SYNC_KEYS` 里加键之前先问「换台设备还成立吗、公开出去有没有问题」；`cp.cloudToken` 这类"每台设备各自的身份"永远不进白名单。

### 14.10 优化设置页 UI、精改各条文案

**现状**：`EditorSettingsPanel.vue` 是设置面板的全部（左栏分类目录 + 右栏分组行），样式类名表在第 4 节；它挂在**编辑区里的一个合成页签**上（`services/settingsTab.js`），高度受编辑器区域限制（`.editor-pane__status` 在窗口 <480px 或 `is-short` 时隐藏）。14.5 做完后分类从 8 变 9。

**要做的**：排版精修 + 逐条过文案。

**进度**（2026-09-28）：~~排版重构与逐条文案已落地~~。设置行改成「无边框 + 悬浮底色」的卡片式层级：三级灰度（`__label` 用 `--text` / `__hint` 用 `--text-dim` / `__key` 用 `--text-faint` 等宽）；版式按控件类型分流（`--select` / `--number` 上下结构、`--switch` / `--action` 左右结构）；`.is-modified::before` 在偏离 `EDITOR_SETTINGS_DEFAULTS` 时亮一条 3px `--accent` 线。仍是 8 个分类，`verify-ui.mjs` 的导航断言未动。

**「代码辅助」整组已删**（同日）：`quickSuggestions` / `parameterHints` / `linkedEditing` / `inlineSuggest` 四个开关全部只透传给 Monaco，而**项目没有注册任何语言 provider**（`monaco.languages.register*` 零调用；`monaco-setup.js` 给所有 label 都返回同一个通用 `editorWorker`，而 `language.js` 里只会出现 `cpp` / `c` / `python` / `plaintext`——四种都只有 Monarch 高亮、没有语言服务）。所以这四个开关拨了没有任何反应，属于「接线接到一半」，直接删掉：面板少一个分组（`EDITOR_GROUPS` 4 小节 23 行）、`editorOptions.js` 少了 4 个默认值与 4 行 Monaco 选项透传。**以后再想加补全，得先有 provider**；老用户 localStorage 里的残留键会被 `normalizeEditorSetting` 自动丢掉（它只认 `EDITOR_SETTINGS_DEFAULTS` 里有的键）。

**坑**：

- **`scripts/verify-ui.mjs` 里对设置分类数的断言**要同步改（第 8 节 B 步已经踩过一次）。
- **文案不只在这一个文件**：第 12 节列了「能力 / 口径变了先搜这四处」——`guide.html`、`HelpPanel.vue` 的 `GROUPS`、`docs/使用手册.md`、`index.html` 的 `<noscript>`。设置页里的词如果和它们叫得不一样，用户会以为说的是两个功能。
- **两套主题都要过一遍**（`dark` / `light`），色值只能来自 `base.css` 变量。
- **窄面板靠容器查询隐藏元素**，改布局时要连着容器查询一起看，否则窄屏会挤成一团。

### 14.11 VS Code 式目录内新建 —— 🟡 阶段一已落地（2026-09-28），嵌套路径阶段二待做

**要做的**：像 VS Code 那样，在**任意一层目录里就地新建**（点页头按钮 / 右键目录 → 该目录下展开一行输入框，输名字回车落盘），而不是只能建在根目录。

**阶段一（已落地）**：**单级名 + 任意目标目录**。

- **输入行抽成组件**：`InlineCreateRow.vue`，两处渲染点——根目录那份在 `FileExplorer` 的树容器里，建在某个目录里那份在 `FileTreeItem` 的 `role="group"` 内、递归 `v-for` 之前。两处都把「行不要放进 `.tree-item__row`」这条纪律落到实际结构上（理由、以及 `closest('[data-tree-id]')` 返回 `null` 的实测结论见坑 12）。
- **目标目录怎么来的**：页头两颗按钮**跟随树内聚焦的节点**（目录取自己、文件取父目录、没聚焦回落根目录，`headerCreateTarget()`）；右键**目录**则显式指定该目录（菜单项 `new-file` / `new-folder`）。状态里的 `targetId` / `targetPath` 决定落点 = `join(targetPath, name)`。
- **`startCreate` 先展开目标目录**：`role="group"` 挂着 `v-if="expanded"`，目标目录折叠时输入行根本不存在，得先 `toggleExpand`（沿用 `expandedIds`，会一起被持久化）。
- **默认名按目标目录查重**：`defaultName` 扫的是目标目录的兄弟，不是全库（见坑 12）。
- **焦点与失焦提交**：句柄由 InlineCreateRow 挂载时注册进 `provide('creatingRow')`，`nextTick` 聚焦 + 选中主干（不是全选，约定见坑 12）；失焦提交要挡「打开刚建好的文件时 Monaco 抢焦点」的程序性失焦，用 `createFlights` 区分在途轮次（连点两次「新建文件」时必现的那种凭空多文件，就是这里的坑，详见坑 12）。

**阶段二（待做）**：**支持嵌套路径**（在输入框里敲 `a/b/c.cpp` 逐级建目录）。

- **`assertName` 现在拒绝 `/`**（`paths.js`），阶段二要么放宽、要么改走新入口。落点建议做成 `workspaceStore.createEntry(parentPath, relativePath, type, initialContent)`：把**逐级 mkdir -p** 包进一次 `vfs.batch()`，照 `problemImport.js` 的 `ensureDirectory` 样板写（batch 期间事件入队、结束单条原样发 / 多条合并一次 `reset`，中间态不外泄）。
- **`revealId` 时序竞争**：新建目录 + 新建文件要连成一条链（先目录后文件），而 `reveal`（滚动定位 / 展开祖先）依赖索引已就绪。要在一个 batch 里把「目录路径 → 文件路径」一次性建完再 reveal，别中途分两次等异步。
- **嵌套输入行溢出**：输入行的左缩进是 `depth * 10 + 8`（像素），深层目录 + 窄侧边栏（下限 160px）会顶到边界，阶段二落地时连着看窄屏截断。

**注**：这条推翻了坑 14 原来「禁止把新建放回右键菜单」的写法——根因是当时没有「目标目录」这个概念，现在右键目录正好是它的自然载体（坑 14 已按此改写）。

### 14.12 全局界面缩放（默认 110%，档位 100% / 110% / 125% / 150%）—— ✅ 已落地（2026-09-28，计划外新增）

**做法**：构建期用 `postcss-pxtorem` 把 CSS 的 `px` 统一转 `rem`（配置在 `vite.config.js` 的 `css.postcss`），运行时只改 `document.documentElement.style.fontSize`；Monaco 的样式表在 `node_modules` 里被整包排除、不吃 rem，靠它自己的 API 单独补偿。

- **状态与换算**：`composables/useUiScale.js` 是唯一权威——`uiScale` 单例（值即比例）、`UI_SCALE_OPTIONS` 档位表（含文案）、`px()`（设计 px → 真实 px，只给「逻辑尺寸」用）、`applyUiScale()`（落根字号 + 更新单例）、`normalizeUiScale()`（读盘校验，认不出来退回默认档）、`DEFAULT_UI_SCALE = 1.1`（默认档，设置页的「（默认）」标记因此挂在 110% 而不是 100% 上）。`App.vue:49` 用 `usePersistentRef('cph.uiScale', DEFAULT_UI_SCALE, { revive: normalizeUiScale })` 持久化，并在 **setup 期**就 `applyUiScale()` 落地。设置页「外观」组的下拉是消费方，prop / emit 一路贯穿 `App → EditorPane → EditorSettingsPanel`。
- **Monaco 补偿**：`services/editorOptions.js` 的 `editorOptions(settings, scale)` 把 `fontSize`（取整）、`lineHeight`（按缩放后的字号 × 倍数算，不各乘一次）、`padding`、`scrollbarSize` 都乘 `scale`；`tabSize` 不乘（列数不是像素）。`EditorPane.vue` 的 `watch(() => props.uiScale)` 在变化时重新 `updateOptions()` + `nextTick(layout())`。
- **JS 动态像素**：`TestCaseCard.vue` 的 `MAX_IO_HEIGHT` 走 `px()`（`scrollHeight` 是真实 px，上限必须跟着缩放），并 `watch(uiScale)` 在缩放后重算高度。树缩进改成模板传无单位 `--depth` + CSS `calc()`，不再走内联 px。
- **随缩放变化的约束**：统一侧边栏（测试栏）的最窄宽度也跟着缩放——`.pane--tests` 的 `min-width` 在 `calc()` 里乘 `--ui-scale`，`measureLimits()` 侧的 `--tests-min-floor` / `--tests-min-cap` 也各乘一次 `uiScale`（CSS 与 JS 用同一份倍数，变量本身仍是物理 px，`parseFloat` 量纲不变）。实测最窄宽度 100% / 125% / 150% → 299 / 313 / 375（100% 时先被编辑器 `MAX_SHARE = 82` 的兜底卡住，125% 起缩放后的地板才成为真正约束）。
- **越界比例的收敛**：`App.vue` 的 `reclampShare()` 在三个时机把持久化里的 `editorShare` 夹回当前合法区间（挂载 `nextTick`、`watch(uiScale)`、`ResizeObserver` 去抖 150ms 后），消除「第一次拖拽猛地跳一段」（完整背景见第 5 节坑 25）。它只做收敛：越界才写回，本来就合法则原样不动。
- **陷阱**（完整版见第 5 节坑 24）：JS 内联样式 / JS 常量 / `@container`·`@media` 断点参数**都不经过转换**，所以本仓 7 处 `@container` 阈值是手工写成 rem 的；被 `measureLimits()` 用 `parseFloat` 读的 `--tests-min-*` 必须留在 `propList` 排除名单里（否则 `240` 会变成 `15`）；`--seg-w` / `--seg-h` 反过来必须一起随 rem 缩放，否则胶囊扭形；`minPixelValue: 3` 保住 1px / 2px 细线。
- **验证**：`npm run verify` A–G 全 PASS（scale=1 的几何与第 8 节记录逐像素一致）；125% / 150% 下实测根字号 20px / 24px、Monaco 字号与行高同步、拖拽仍 1:1 跟手。`--tests-min-cap` 变量本身恒为 240px（`parseFloat` 量纲不变），乘过 scale 后实际生效是 300 / 360。越界收敛实测（按下只挪 40px 取样）：150% + 存档 82 → 加载即收敛为 77.3（恰为该布局 `maxShare`）、视口 600px + 存档 60 → 57.1、本就合法的值原样不动，四个 case 拖拽均 1:1 跟手，控制台无 `ResizeObserver loop` 告警。

### 14.13 超长样例（百万字符级）—— 🟡 显示层已落地（2026-09-29 三轮迭代），存储与远程引擎未动

**背景**：用户问「上百万字符的样例会不会把输入框撑爆」。实测结论是**不会崩，会卡在打字上**（每敲一个字符：10 万 3.5ms / 50 万 18ms / 100 万 37ms / 200 万 75ms），根因是「每次 value 变更都让整段文本重新排版」——与 `autoGrow` 无关，文本已排好版时 `autoGrow` 净开销是 0ms。

**已落地（显示层，当天迭代过三轮）**：超过 6000 字符的字段把**显示**切成「开头一段 + 省略行」，真值一个字节不动；框**仍然可编辑**，但只能改省略行之前的那一段。复制靠 `copy` 事件接管：**选区里带上省略行就等于连省略段一起选中**，直接给完整内容（Ctrl+A 天然带上）。三个框（标准输入 / 期望输出 / 实际输出）同一套行为。迭代史：第一版阈值 2 万 + 「编辑完整内容」按钮 → 第二版阈值收到 6000 并撤掉编辑入口（整体 `readonly`）→ 第三版按用户要求**恢复局部编辑**，并用「省略行 = 省略段的化身」取代那颗按钮。第三版收尾时**顺手挖出一个真 bug**：按「取省略行之前的部分 + 原尾部」拼回的话，用户全选粘一份新样例进来时旧的 4500 个字符会被悄悄缀在新内容后面（实测粘 12 个字符得到 4517 个字符，界面上看不出来）——已改成「省略行没了，省略段就跟着走」。完整约定见第 5 节坑 26。

**刻意未做（用户 2026-09-29 决定本轮不动）**：

- **localStorage 配额**（见坑 27）：约 520 万 ASCII 字符的上限，「输入 100 万 + 期望 100 万」就吃掉 40%；超了以后 `usePersistentRef` 的 `catch` 静默吞掉，**界面正常、刷新回退**。两条修法——轻的：写入加节流 + 失败时明确提示「用例太大，未能保存」；重的：复用 `services/vfs/idb.js` 把超长字段挪进 IndexedDB，`cph.testCases` 只留摘要（要动持久化结构 + 写迁移）。
- **远程引擎的大 stdin**：Piston / Judge0 把 stdin 内联进 JSON POST，1MB 级别的输入很可能被拒或超时。可选做法是超阈值时提示「该引擎可能吃不下这么大的输入」。
- **Python 的性能画像**：C++ 侧的倍率与固定开销已测全（见第 7 节），Python 目前只有「a+b 67~81ms」一个数据点。

### 14.14 界面双语（中 / 英）—— ✅ 已落地（2026-09-29）

**背景**：用户要「翻译一套英语版本的，添加一个语言设置选项」。

**选型（用户当场定的三条）**：① **自写轻量模块，不引 vue-i18n**——词条是扁平的 `'域.组.键'` 字符串，只需要 `t(key, params)` + 一个 ref，vue-i18n 的复数规则 / 日期本地化 / 组件插值一样用不上，多一个重量级依赖不值（与「新增 npm 包要先讨论」那条纪律一致）；② 翻译范围是 **UI + 应用内帮助 + `guide.html` 整页**（不含 `NOTICE.md` 与 `docs/使用手册.md`）；③ 首次打开**跟随浏览器语言**。

**已落地**：
- **基础设施** `src/i18n/`：`index.js`（`locale` ref 单例 / `setLocale` / `t()` / `messages(域)` / `LOCALES` / `applyLocale`）+ `messages/` 下六个域文件（`app` / `engines` / `explorer` / `help` / `settings` / `tests`），**同一文件里中英两栏并排**。缺词条先退中文、再原样露出 key（不抛错）。
- **持久化**：`cph.uiLocale`，**刻意绕开 `usePersistentRef`**（界面语言必须早于任何组件挂载就定下来，首帧不能先闪中文）。跟随浏览器的探测结果**不写回存档**。见第 6 节。
- **设置项**：设置视图「外观」组新增「**界面语言**」下拉（在「主题 / 字体大小 / 界面缩放 / 侧边栏位置」之后），切了当场生效、不重载。文案刻意叫「界面语言」以区分「判题语言（由文件扩展名派生）」——`cph.language` 那个死键别复用（坑 15 / 坑 28）。
- **迁移规模**：UI 文案硬编码中文从 **434 处降到 130 处，且全部落在注释里**（构建通过 + 脚本复查确认残余「中文」都是 `/* */` 与 `<!-- -->`）。改动面覆盖 `App.vue` 与全部 14 个组件、9 个 service / composable。**顺带为 i18n 做的一次重构是这次最有价值的副产品**：`EDITOR_GROUPS` / `SECTIONS` / `RUNTIMES` / `THEMES` / `SHORTCUT_ACTIONS` / `OJ_LIST` / `LUOGU_LEVELS` / 各引擎的显示名全部从「存字面量」改成「**只存 key**」，由消费处再 `t()`（见第 1 节与坑 28 第 1 条）。
- **写进文件系统的名字不译**：`未分类` / `未命名题目` 照旧，`OJ_LIST` 因此新增与 `labelKey` 并列的 `dirName`（显示名走 `labelKey`、落盘名走 `dirName`，**两个字段刻意不合并**）。
- **`guide.en.html`**：`guide.html` 的逐条对照版（同 12 节、同 id、同序），共用 `guide.css`；两页 `hreflang` 三件套互链 + 页头各一颗语言切换链接；`public/sitemap.xml` 加第三条 URL 并用 `xhtml:link` 互指；`index.html` 的 `<noscript>` 补英文半篇、`og:locale:alternate`、`ld+json` 的 `inLanguage` 改成数组。详见第 12 节。
- **验证**：`npm run build` 通过（产物含 `dist/guide.en.html`）；两轮无头探针共 **29 + 10 条断言全 PASS**（跟随浏览器 / 存档覆盖 / 切换当场生效与落盘 / 英文下的超长样例 / 两版 guide 的 hreflang 与页头布局 / 英文表格在 1400px 与 700px 两档不溢出）；两套主题的截图肉眼核对过。`npm run verify` 的 A 步仍是既有竞态（基线同样失败，与本轮无关）。

**刻意未做**：
- **`NOTICE.md`（以及它的英文对照版 `NOTICE.en.md`）与两版 guide 的致谢部分只列了组件名与许可证**；`docs/使用手册.md` 保持单语（它是仓库内文档，不是站点内容）。致谢页的双语是 **2026-09-30 补的**：`NOTICE.md` / `NOTICE.en.md` 各自生成 `notice.html` / `notice.en.html`，`npm run notice` 一次出两页，`--check` 两页都校验。
- **没做 URL 前缀式的语言路由**（没有 `/en/`）。主应用是「一个 URL 服务两种语言」，两版 guide 是「一页一语言」，两种形态并存是刻意的（见第 12 节最后一条）。
- **没做 `manifest.webmanifest` 的语言分流**：清单是单份静态文件，`lang` 只能写一个值。PWA 的名字是品牌名 `unnamed`（语言无关），唯一的中文是 `description` 与 `lang: "zh-CN"`。真要分流得挂多份 manifest + `hreflang`，收益（安装后的应用名描述）不值这个复杂度。

### 14.15 题解（Markdown / LaTeX）编辑 —— ✅ 已落地（2026-09-30）

**背景**：用户要「编辑器支持 Markdown 和 LaTeX，用来写题解」，参照洛谷的文章编辑器、**只做编辑区**（不做发布 / 列表 / 评论）。选型当场定三条：marked + DOMPurify + KaTeX（不引 md 编辑器组件库）；渲染器按需下载（与 `public/wasm/` 同一套路数）；工具栏 / 预览 / 视图切换全原生 CSS（与硬约束「禁第三方 UI 库」一致）。

**七步全部落地**：s1 语言接入与题解模板 → s2 渲染器按需下载 → s3 预览骨架（双栏 / 三态视图 / 全屏 / 滚动同步）→ s4 工具栏 14 项 + 字数统计 → s5 运行闸门（.md 不触发编译）→ s6 15 条快捷键 → s7 文档与回归断言（NOTICE 补 `public/md/`、本文件第 15 节、`verify-ui.mjs` 的 .md 断言、五处用户文案）。**实现细节与坑一律见第 15 节**，这里只留结论。

**建议的落地顺序**：~~14.1（纯 UI，最小）~~（✅ 已落地，2026-09-28）→ 14.3（小而收益直接）→ 14.8 → ~~14.7~~（✅ 已落地，2026-09-29）→ 14.10 → 14.4 → 14.6（扩展侧已就绪，只做站点侧）→ 14.2（基础设施）→ 14.5 剩余部分（配置 UI，依赖 14.2；固定结构 + 身份索引提级已于 2026-09-28 落地）→ ~~14.9（要先选型，且是唯一需要后端的）~~（✅ 已落地，2026-09-30，见 14.9 / 14.21）。

### 14.16 资源管理器的拖拽移动 / 剪切复制粘贴 —— 🟡 第 1 步（拖拽移动）已落地（2026-09-30），后两步待做

**背景**：用户要「参考 `coder/code-server` 完善文件管理」，明确**只补文件管理、不引别的功能**。核对下来 code-server 不自研资源管理器（它就是浏览器里的 VS Code），所以照的是 VS Code 的交互；范围当场圈成三件事，并明确**不做**多选、复制路径、拖拽排序、搜索、撤销。三件事按顺序分三步走，每步单独验收。

**第 1 步（已落地）：拖拽移动**

- **`composables/useTreeDrag.js`（新）** 是唯一的手势实现：状态机 `press → armed → dragging`，鼠标与触屏共用。**刻意不用 HTML5 拖放**——`dragstart` / `drop` 在触屏上根本不触发，幽灵元素与自动滚动也不可控。
  - 鼠标：位移 > 4px 即起拖，不需要长按。
  - 触屏：按住不动 **450ms** 进 armed —— **原地松手仍然弹右键菜单**（保住触屏原有入口），继续移动才起拖。
  - 指针对此模块是纯 UI：**它不碰 VFS**，落盘通过 `onDrop` 回调交回 FileExplorer。
- **`services/vfs/treeOps.js`（新）**：`uniqueNameIn(vfs, dirPath, name, type)` —— 重名排成 `name-2`。后缀只对**文件**插在扩展名之前（目录名里的点不算扩展名，`v1.2` → `v1.2-2`）。放在 service 层是因为拖拽、粘贴、以后拖入外部文件都要同一份口径。
- **`workspaceStore.moveNode(path, targetDirPath)`**：`uniqueNameIn` + `vfs.rename` 的薄封装。**节点 id 不变**（provider 只改 path / parentId / name），所以移动一个已打开的文件不会打断页签、Monaco model 与 undo 栈——这是整件事能做得这么薄的根本原因。
- **落点语义只有「拖进目录」一种**：目录行 → 该目录；文件行 → 它的父目录（跟 VS Code 一样，让可投递面积大一些）；树空白处 → 根 `/`。拖回原目录、拖到自己身上、把目录拖进自己的后代 → 无效，不高亮也不落盘。
- **触屏的两条硬约束**（与第 3 节 `.splitter` 那条同源）：行上声明 `touch-action: pan-y`（保住纵向滚动，**不能是 `none`**）；armed 之后靠**非被动 `touchmove` + `preventDefault()`** 把滚动按住（`touch-action` 在手势开始时就读定了，中途改无效）。
- **辅助体验**：拖到树上下边缘 24px 内自动滚动（rAF，每帧 8px）；悬停在折叠目录上 600ms 自动展开（触屏时手指腾不出来点它）；被拖的行变淡、落点行铺 `--bg-drop`；落点是根时整个树容器铺同一色（见下条）。幽灵 `Teleport` 到 body、**`pointer-events: none`**（否则 `elementFromPoint` 永远只命中它自己）。
- **点击抑制**：松手与 `click` 是两次事件，不挡会把落点目录顺带折叠/展开。`consumeClickSuppression()` 读取即清零，另带 300ms 兜底定时器防止标记卡死吞掉下一次正常点击。
- **目录范围线（缩进参考线）**：画在 `role="group"` 那个 div 上（`FileTreeItem.vue` 的 `.tree-item__children`），不画在行上——group 天然只包住这个目录的全部子节点，线的上下端正好是文件夹的起止，**收起时 group 不存在、线自动消失**，零 JS。x 取父行箭头中心 `calc(depth*10px + 16px)`。**常显**，不做 onHover：触屏没有 hover，而颜色只有 `--tree-guide` 一个变量（比 `--border-soft` 更淡）。用户提过「去掉文件夹图标换细线」，当时否决（图标是「一眼分辨文件/文件夹」的锚点，和范围线解决的不是同一个问题）——**2026-09-30 用户又要求「去掉文件夹的 logo 试一下」，已按新口径落地**：文件夹行只留折角箭头，`folder` / `folder-open` 两个字形只剩 `AppIcon.vue` 里的定义（拖动幽灵仍在用 `folder`），见下面「行的列位」那条。
  - **必须用绝对定位的 `::before`，不能用 group 自己的 `background-image`**：子元素总画在父元素背景之上，行一有 hover / 选中底色（不透明）就把线盖掉了。`position: relative` + `::before` + `z-index: 1` + `pointer-events: none` 即可压在行之上，行本身没有 `position`，压得住。线的 x 落在行的左侧留白里，盖在行上也不会压到文字/图标。
  - 也不用 `border-left`：那会把每层子节点整体右移 1px，层层累加会歪。
  - **文件行的列位（2026-09-30 改过一轮）**：文件行**不再渲染那条 16px 的箭头槽**（`v-if="node.type === 'directory'"`）——槽是给折角箭头留的，文件没有箭头，留着就是名字前一块 16px 的空白。原先这块空当靠一枚 `tree-item__row--file::before` 的浅色小圆点（圆心落在箭头槽中心 `depth*10 + 16`，与范围线同列）填着，用户先要求去点、再要求把点占的这块空当一并去掉，于是圆点与 `.tree-item__row--file` 这个类一起删了（`.tree-item__dot` 是「未保存」小点，不受影响）。槽收掉后图标会直接贴到范围线上，所以 `.tree-item__icon` 给了 `margin-left: 3px`，同时把与名字之间的 `margin-right` 从 5px 收到 2px（两者相加仍是 20px）。**于是两边名字落在同一列**：文件行 `3 + 15 + 2`、文件夹行「箭头槽 16 + 4」，都从 `depth*10 + 8` 起算、名字在 `+20`；文件图标与文件夹的折角箭头同在槽的那一列上。文件夹的折角箭头同日记从 `size 12` 调到 `14`（`AppIcon` 的 chevron 在 24 网格里只占 12×6 单位，14px 时字形约 7×3.5px、描边约 1.1px；槽宽 16px 没动，所以范围线的 x 与名字列都不受影响，再大就要撑出槽）。`InlineCreateRow` 同步收掉了那条空槽，文件夹那行用 `margin-left: 20px` 补回同样的缝（错误提示的缩进随之从 30px 收到 28px），否则按「新建文件」时输入框会比树里的名字右移 16px。
- **落点提示是半透明色块**（`--bg-drop`，dark `rgba(38,79,120,.55)` / light `rgba(173,214,255,.55)`，即 `--bg-selection` 的透明版）：实心会把范围线盖掉，半透明则「拖到哪儿」和「落在哪个文件夹」能同时看清。用户的原话是「拖动文件时预示文件放在什么位置的提示」。**铺满整个文件夹**：类挂在 `.tree-item` 根容器上（`.tree-item--drop`），而不在行上——容器就是这棵子树本身，于是色块覆盖「文件夹行 + 展开的全部后代」，「会落进这个文件夹」的边界一眼可见；折叠时容器只有一行高，悬停 600ms 自动展开后随之变高。落点那个文件夹自己的行则被 `.tree-item__row.tree-item__row--drop{, :hover} { background: transparent }` 清成透明（双类 + `:hover` 压过 `:hover` 与 `--active:hover`，拖拽时光标必然停在那一行），否则不透明的悬停色会在整块蓝中间压出一条深色带。行底下的 `--bg-hover-soft` / `--bg-hover` 是子元素、仍画在容器背景之上（容器铺色时它们照旧透出自己那一小块，不影响判断）。**根落点同款颜色、更淡的浓度**：`.explorer__tree.is-drop-root` 不再画虚线框，改成给树容器铺 `--bg-drop-root`（dark / light 都是同色 30%，行用的 `--bg-drop` 是 55%）+ `border-radius: 4px` —— 铺满一整个面板时，行上那个浓度会糊成一片蓝。
- **缩进线亮起的两种情况共用一套样式**：`.tree-item__children--drop::before, .tree-item__children--active::before { background: var(--tree-guide-strong) }`。`--drop` 是拖拽落点所在文件夹（`isDropTarget`）；`--active` 是**当前选中文件的父目录**（`isActiveParent`，由 `activeParentId` 算出：`workspace.activeId` 指向的节点必须是 file，取其 `parentId`，目录自己选中不算——只有文件才有「它属于哪个文件夹」这回事）。指针停在文件行时落点就是它的父目录，所以两种情况的视觉完全一致，用户看到的都是「父目录那条线亮起」。**只亮直接父目录那一条，祖先不亮**：用户的原话是「选中某个文件时，其对应文件夹的竖线要亮起」，与上一条「落点对应文件夹的细线也要亮起」是同一种表述。若要改成「整条路径都亮」，把 `isActiveParent` 换成「向上走 parentId 能否走到本节点」即可。
- **落点文件夹的缩进线跟着亮起**：`.tree-item__children` 上按 `isDropTarget` 挂 `--drop` 类，`::before` 由 `--tree-guide` 换成 `--tree-guide-strong`（dark `rgba(255,255,255,.45)` / light `rgba(0,0,0,.45)`）——**不换颜色**，仍是同一支白笔，只是按到底（用户明确要求「细线的颜色应该还是白色的」，最初那版给成了 `--focus` 的蓝，已改回）。1px 不变，避免宽度变化引起位移。规则必须**写在基础线那条之后**：两者特异性同为 (0,1,0)，靠源序压回来。落点是根时没有对应文件夹，自然不亮。
- **行的悬停色要比选中色淡一档**：`.tree-item__row:hover` 用新的 `--bg-hover-soft`（dark `#2c2c2f` / light `#f2f2f2`），`--active` 仍是 `--bg-hover`（dark `#3a3d41` / light `#e8e8e8`）——两者原本同色，鼠标划过别的文件时根本分不出哪个才是打开的。注意 `.tree-item__row--active:hover` 那条**必须留在 `:hover` 之后**：两者特异性同为 (0,2,0)，靠源序压回来，否则悬停当前打开的那一行会把它淡成悬停色。
- **失败提示**：拖拽/粘贴没有行内位置可放，新增 `.explorer__notice`（页头下一条，显示 `error.message`，4s 自动消失）。移动/复制的错误文案**本来就有**（`error.notFound` / `duplicateName` / `parentMissing` / `moveIntoChild`，见 `messages/engines.js`），只新增了一条 `explorer.moveFailed` 兜底。
- **⚠️ 触屏可用性还没有验证过**（2026-09-30 记）：上面整套手势本来就是照触屏设计的——450ms 长按进 armed、非被动 `touchmove` + `preventDefault()` 按住滚动、行上 `touch-action: pan-y`、捕获阶段接管 `contextmenu`——但**只在桌面浏览器上用鼠标走过一遍，真机（iOS Safari / Android Chrome）一次都没点过**，所以「触屏文件管理可用」目前是**未验证状态**，别当成已知可用。本地也验不了：无头 Chrome 的合成触摸不会真的滚动，也不会触发系统长按菜单（同第 3 节末「本地探针验证不了真滑动」那条，**别把探针绿色读成触屏已验**）。上手真机时按这几条过一遍：长按不动 → 弹右键菜单；长按后拖动 → 起拖且列表不跟着滚；拖到树上下边缘 24px → 自动滚动；悬停折叠目录 600ms → 自动展开；把文件拖进折叠目录后松手 → 该目录展开、文件落进去；整个拖拽过程中系统的长按菜单不冒出来；松手那一下不顺手把落点目录折叠/展开。

**第 2 步（待做）**：剪切 / 复制 / 粘贴（右键菜单 + `Mod+X/C/V`，剪贴板存 **id 不存 path**，复制递归时**保留每个节点的 `meta` / `config`**）。
**第 3 步（待做）**：新建时支持嵌套路径（`src/util/new.cpp` 逐级建目录）——即 14.11 的阶段二。

**踩过的坑**：

- **别用 HTML5 拖放**（见上）。
- **`touch-action` 必须在元素上声明**，`pointerdown` 里的 `preventDefault()` 挡不住浏览器把拖动当滚动手势——不处理的话触屏按下会立刻 `pointercancel`，表现是「手机上完全拖不动」。与 `.splitter` 那条同一次踩坑。
- **长按要接管 `contextmenu`**，否则触屏起手瞬间会同时弹系统菜单和拖拽。接管的是 window **捕获阶段**的 `contextmenu` + `preventDefault()`，而且**从 `pointerdown`（仅触屏）就挂上**，不是在 armed 时才挂——各家系统长按菜单的阈值并不一致（多数 ~500ms，某些 WebView / 系统设置更短），等 450ms 再拦可能已经晚一步，会出现「先弹系统菜单、随后进入拖拽、菜单残留到下次点击」的怪状态。接管权从头拿住后，触屏菜单的时机只由我们决定（抬手时弹），与系统阈值无关。鼠标右键不进这条路（`button !== 0` 直接 return），行为不变。
- **`setPointerCapture` 只在真的进入拖拽时调用**并包 `try/catch`（与分隔条同款）：提前捕获会把普通点击和滚动一起搅进来。

### 14.17 资源管理器预览页签（VS Code 式）—— ✅ 已落地（2026-09-30）

**背景**：用户问「点资源管理器中多个文件，逻辑应该是每次新建窗口还是同一个窗口打开不同文件」。结论是**同一个窗口 + 页签**（真·多窗口走不通：浏览器多标签各持一份内存状态，但 VFS 写的是同一个 IndexedDB，`modelManager` / 快捷键监听也都是模块级单例），并选定照 VS Code 补**预览页签**——浏览式地「点开看一眼」不再往页签栏里堆常驻页签。

**语义（就这三条）**

- **单击文件树里的文件 = 预览**：占住全局唯一的预览槽 `workspace.previewTabId`，页签标签显示为**斜体**。再单击另一个文件 → 上一个预览页签被**顶替**（`closeTab` 走完整流程：splice + `modelManager.release`，refs 归零即 dispose model）。
- **已开着的文件被再次单击 → 只切活跃，不动预览槽**（VS Code 亦然：顺手点一个已打开的文件不会让预览页签消失）。
- **钉住（转正体）三条入口**：双击文件树的行、双击页签栏的页签、**在预览页签里敲下第一个字**（`watch(workspace.previewTabId → modelManager.isDirty)`）。第三条是主路径，理由见第 5 节坑 29。
- `closeTab` 关掉预览页签时清槽；`rebuildTree` 清死页签时一并清槽；**预览状态不落 localStorage**（刷新后退化成普通页签）。

**落点**

- `workspaceStore.js`：`workspace.previewTabId` 字段、`openFile(id, nodeHint, { preview })`（**只有文件树单击传 `preview: true`**）、新导出 `pinTab(id)`、`closeTab` / `rebuildTree` 的清槽、那条「编辑即钉住」的 watch。
- `FileTreeItem.vue`：`activate({ preview })`；`onClick` 走预览、**键盘 Enter 走常开**（Enter 是明确意图，不该只给临时页签）；行上 `@dblclick="onDblClick"`（先过 `consumeClickSuppression`，与拖拽抑制同一条口径）。
- `EditorTabs.vue`：`:class` 加 `--preview`、`:data-preview`（探针用）、`@dblclick="pinTab(id)"`；样式只有一条 `.editor-tabs__item--preview .editor-tabs__label { font-style: italic }`——**不动图标 / 宽度 / 关闭按钮**，所以第 3 节那套页签栏宽度实测不受影响。

**别的入口一律常开**：`createFile`（新建文件）、`problemImport.js`、启动兜底的 `openLanguage('cpp')` 都不传 `preview`，默认值 `false` 保证对老调用方零变化。

**没做的**：多选、页签数量上限、「关闭其它」、钉住图标、预览状态的持久化（都不在这次的范围内）。

### 14.18 把文件拖到编辑区（打开 / 跳转页签）—— ✅ 已落地（2026-09-30）

**背景**：14.16 的拖拽只认树里的落点，拖到左边栏以外松手 = 什么都不发生。用户在左侧看着文件、右侧开着编辑器时，最自然的动作是把文件拖过去。

**语义**：文件拖到编辑区上方 → 编辑区内容区亮起与「拖到根区域」**同款提示色**（复用 `.explorer__tree.is-drop-root` 的同一个变量 `--bg-drop-root`，**没有新增变量**）；松手后走 `openFile(node.id, null)`（默认 `preview: false` = 常开）—— 已开着就只切活跃 + reveal，没开就建 model 并推一个新页签，随后 `pinTab` 把它从预览槽里摘掉（它可能刚才是预览页签，落进来就是要固定）。落点自己还要先 `deactivateSettingsTab()`：settingsTab 只在 `activeId` **变化**时自动收回，拖进来的如果本来就是当前活跃文件，`activeId` 不变，不主动让位就会「点了文件还在看设置」。

**跨面板怎么连线**（这是这一节的要点，以后要给别的面板加落点照这套抄）：`useTreeDrag.js` 的状态是**每次调用各一份**（FileExplorer 里那一个），编辑区既读不到 `dropTarget` 也没法把自己的元素塞进去，所以在该模块的**模块级**加了一个登记处：

- `registerDropZone({ el, canDrop?, onDrop })` —— 面板在 `onMounted` 登记自己的根元素与落点回调，返回的注销函数在 `onBeforeUnmount` 里调（`EditorPane.vue`）。
- `activeDropZone`（模块级 `shallowRef`）—— 当前指针命中的那块；落点拿它跟自己**比对象引用**，相等才亮（`isDropTarget`）。登记处只管算出「命中了谁」，命中之后干什么全由落点的 `onDrop` 说了算，本模块照旧不碰 VFS。
- 命中顺序**永远先树内、后树外**：`updateDropTarget` 里 `activeDropZone.value = next ? null : hitDropZone(...)` —— 反过来的话，在树里划过时会把编辑区也点亮。
- 外部落点用**矩形命中**而不是 `elementFromPoint`：拖拽时幽灵元素就贴在手底下，谁压谁上全靠 DOM 顺序，用 `elementFromPoint` 得先赌幽灵的 `pointer-events: none` 万无一失。宽 0 的面板（被折没了）不算落点。
- `cancelPress()` 里统一把 `activeDropZone` 置空 —— 松手 / Esc / `pointercancel` / 组件卸载都汇到那里，一处收口。

**顺带修掉的一个副作用**：`updateAutoScroll` 原先只看纵向位置，于是拖着文件在编辑区里晃时，左树会自己一路滚到底（新增落点让「拖出树」成了常见路径，这个毛病才露出来）。现在加了横向包含判断：指针不在树容器的水平范围内就不滚。树内的行为一字未改。

**高亮层**：`.editor-pane__drop`（`position: absolute; inset: 0; background: var(--bg-drop-root); pointer-events: none`），写在 `.editor-pane__stage` 的**最后** —— stage 里那几层（`__host` / `__preview` / `__empty`）全是 `inset: 0` 的绝对定位且**没有 z-index**，谁在后面谁在上面；放前面会被 Monaco 盖住。`pointer-events: none` 是必须的，否则它会挡住命中测试与编辑器本身。

**边界**：目录不接（`canDrop` 只认 `type === 'file'`）；不新增 i18n 文案 / CSS 变量 / localStorage key；落点只在「已经在拖」时命中（`updateDropTarget` 开头的 `press?.dragging` 闸门），普通悬停不会亮。

### 14.19 设置分组调整：字体大小归位 + 新增「常用设置」—— ✅ 已落地（2026-09-30）

**改了什么**（都在 `src/components/EditorSettingsPanel.vue`）：

- 「**字体大小**」从「外观」组挪到「**编辑器 › 字体**」小节，紧跟「字体」（字体族）那一行。它本来就是代码区的字号，放外观里名不副实。词条沿用 `settings.appearance.fontSize.*`（**键没改**，换的只是它显示在哪一组），所以不用动 i18n；`control: 'number'` 走编辑器组模板里已有的 number 分支，`rangeOf` / `isModified` 都按 `key` 查，一行数据即可。
- 新增一级分类「**常用设置**」`{ id: 'common', icon: 'star' }`，排在目录**最前**，并成为 `activeSection` 的初值（打开设置先落这里）。组内四行：主题 → 界面缩放 → 字体大小 → 侧边栏位置。
- `AppIcon.vue` 加了一枚线性 `star`（新分类的导航图标，刻意不与「外观」的 `sliders` 共用）。
- i18n 补 `settings.section.common` 与 `settings.common.note`（中英各一）。

**为什么「常用设置」里的项和别处重复**：这几项是**同一份偏好**（`settings.theme` / `cph.uiScale` / `settings.fontSize` / `cph.panelPosition`），两个入口读写同一个值，改哪边另一处立刻同步，**不存在第二份数据**。刻意保留了「外观」组（用户要的），所以主题 / 界面缩放 / 侧边栏位置会同时出现在「外观」和「常用设置」、字体大小会同时出现在「编辑器」和「常用设置」——这是有意为之，不是漏删。实现上直接照搬各处的控件写法（内联 `<label>`），没有为「常用」另造一套数据表。

**连带改的**：`scripts/verify-ui.mjs` 的 `navItems === 8` → `=== 9`（B 步仍显式点目录里的「外观」，不受默认分类变更影响）。

### 14.20 自动保存 —— ✅ 已落地（2026-09-30）

**为什么要做**：改造前只有两个时点会写盘 —— ⌘/Ctrl+S（还只在编辑器有焦点时生效）和点运行前的 `saveAll()`。于是 `closeTab()`（`release()` → dispose model）和刷新页面这两条路会**实打实丢内容**。自动保存既补了这个洞，也让「不按 Ctrl+S 也不丢」成为默认体验。

**五个触发时点**（口径：停顿后 + 离开时点；新增设置项 `autoSave`，**默认开**）：

| 时点 | 代码位置 |
| --- | --- |
| 编辑停顿 800ms（debounce，每次按键重置） | `services/autoSave.js` 的 `schedule()` |
| 切页签 | `workspaceStore.js` 里 `watch(() => workspace.activeId)` 那句 `void flush()` |
| 关页签前 | `workspaceStore.js` 的 `closeTab()` —— **必须在 `release()` 之前** |
| 窗口失焦 | `App.vue` 的 `window` `blur` |
| 页面切后台 | `App.vue` 的 `document` `visibilitychange`（`document.hidden`） |

不做定时轮询（没 dirty 时 `saveAll()` 自己就返回了）；**不用 `beforeunload`** —— 卸载时异步写 IndexedDB 大概率来不及，`visibilitychange → hidden` 才是可靠的那个时点。

**关键实现细节**：

- `services/autoSave.js` 只管时机（debounce、开关、`flush()`），写盘仍然复用 `modelManager.save(id)` / `saveAll()`。关闭开关时**只丢挂起的计时器、不写盘**，语义干净地退回「只认 Ctrl+S」。
- **开关是响应式的 `autoSaveEnabled` ref**（2026-09-30 由内部 `let enabled` 改来）：`setAutoSaveEnabled()` 写它，`isAutoSaveEnabled()` 读 `.value`（workspaceStore 那边接口不变）。开这个 ref 是为了 UI —— **开着自动保存时文件树与页签都不显示 dirty 圆点**（`FileTreeItem` 的 `dirty` computed、`EditorTabs` 的 `isDirtyTab()`，2026-09-30 加）：dirty 只存在 800ms，圆点基本只是闪一下，反倒像在说「这文件没保存」。`dirtyIds` 本身照常维护，只影响显示。
- **`closeTab` 里为什么可以不 await**：`save()` 的 `getVFS().writeFile(entry.node.path, entry.model.getValue())` 两个实参都在 `await` 之前求值成字符串了，所以紧跟其后的 `release()`（dispose model）不会把正文弄丢。
- **依赖方向是单向的** `autoSave → modelManager`：`modelManager` 用 `onDidEdit(cb)` 向外登记回调（运行时读 `#editListeners`），**不** import `autoSave`，否则会成环。订阅时机与 model 何时创建无关。
- `autoSave` 不是 Monaco 选项（`editorOptions()` 里没有它，和 `statusBar` 一样只存不传），面板里是 `control: 'switch'` 的一行，摆在「编辑器 › 编辑」组首。

**默认值是刻意的例外**：按「新默认值 = 改造前行为」的纪律它本该 `false`，但上面那条丢内容的路子是 bug，所以默认开 —— 这条写在 `editorOptions.js` 的默认值注释里（另一处例外是 `insertSpaces`）。

### 14.21 网址形态的云配置入口 `www.998244353.best/<handle>` —— ✅ 已落地（2026-09-30）

**为什么要做**：`GET /api/config/<handle>` 本来就**公开可读**，所以「把用户名接在站点域名后面」天然是一条分享链接 —— 别人打开就能拿到这套偏好，不用注册、不用登录。`docs/云端同步服务.md` 第 6.1 节的公开性声明里承诺过这个入口（那句「形如 `https://www.998244353.best/he-jie`」），本节记录它的落地。

**四件改动**：

| # | 位置 | 做什么 |
| --- | --- | --- |
| 1 | `vercel.json` | `"rewrites": [{ "source": "/:handle([A-Za-z0-9_-]+)", "destination": "/index.html" }]`。**单段 + 不带点号**才和静态资源区分得开：`guide.html` / `sw.js` / `robots.txt` / `manifest.webmanifest` 都带点号，`/assets/…` `/wasm/…` `/md/…` 都是多段 |
| 2 | `src/services/cloudEntry.js` | 启动时读 `location.pathname`，认出 handle 就写进 `pendingCloudHandle`（模块级 ref 单例）。**只登记**：不自动套用、不自动登录、不写 `cp.cloudAccount` / `cp.cloudToken`，也不落任何 storage 待办键 |
| 3 | `src/main.js` + `src/App.vue` | `captureCloudHandleFromPath()` 在 `mount` **之前**调用（地址保持原样，见下）；`App.vue` 则在 `initWorkspace()` / `initWorkspaceStore()` **跑完之后**才 `if (pendingCloudHandle.value) openSettingsTab()` |
| 4 | `public/sw.js` | 外壳升到 `SHELL_VERSION = 'v4'`，导航网络优先 + **按 request URL 回填** —— 离线下再打开同一条 `/<handle>` 仍能命中 |

**第 3 条那个顺序为什么必须是「之后」**：会话恢复会把 `workspace.activeId` 设回上次那个文件，而 `settingsTab.js` 末尾那个 watch 的规矩是「活跃文件一变就让开」。早开一步，紧接着的这次变更会立刻把设置页关掉，弹窗根本没机会出现。

**地址栏保留 `/<handle>`，不抹回根路径**：这条链接的含义就是「这个地址 = 这套配置」—— 抹掉之后想再打开一次、想复制给别人，都得重新翻链接。代价是刷新（含套用成功后那次 reload）都会再看到同一段路径，所以必须有个「这个历史条目已经答过了」的记号挡住重复追问（否则套用 → reload → 又弹问 → 又套用，转不出去）。记号写在 **`history.state`**（键 `cpCloudEntry`）上：随历史条目走、刷新后仍在、不碰 localStorage / sessionStorage，于是也不需要任何清理逻辑；换个新页签打开同一条链接，state 是空的，会照常再问一次 —— 这正是想要的。

**实测（2026-09-30）**：开 `/He-Jie` → 确认弹窗出现（`confirmCount: 1`）、地址栏保持 `/<handle>`；点「取消」→ `history.state === {"cpCloudEntry":"He-Jie"}`、刷新不再追问；新页签点「套用」→ 打 `GET /api/config/He-Jie`（**只读**：不取码、不写云端）→ reload 后地址不变，白名单里的键逐个落进本机（实测 11 个，本机当时没有 `cp.autoPreload`）。窄视口（800px）下 `cp.editorShare` 与云端值不符，是首帧 `reclampShare` 把比例收敛到侧栏下限所致（1600px 下两边一致），不是套用链路的问题。

**坑**：

- **别为了「记住这次待办」先把地址抹掉、再另找地方存状态**：抹掉地址就失去了「这个地址 = 这套配置」的含义；`history.state` 已经同时满足「随条目走 / 刷新仍在 / 换页签重来」三件事。
- **套用的标记必须落在那次 reload 之前**：`confirmCloudApply()` 里 `markCloudEntryHandled()` 紧跟 `clearPendingCloudHandle()`，因为套用成功会立刻 reload —— 标记晚一步就会又弹一次。**拒绝（点取消 / 关掉设置页签）同样算答过**，也要落这个标记。
- **线上生效前提是部署**：rewrite 在 `vercel.json`、SW 版本在 `public/sw.js`，都要构建后随 `main` 推上去才生效；本地 `npm run dev` 走 Vite 自己的 history fallback，**测不到 rewrite 那条规则**（要验就得 `npm run build && npm run preview` 或看线上）。

## 15. 题解（Markdown / LaTeX）

2026-09-30 加，**七步做完**（背景与结论见 14.15）。范围只有**编辑区**：写一份 `.md` 题解，能预览、能排版、能插公式，**不参与判题**（见 15.8）。这一节按「读到什么改什么」分小节。

### 15.1 文件与职责

| 文件 | 职责 |
| --- | --- |
| `src/services/mdView.js` | ★ 题解视图状态的唯一权威：`mdView`（`{ mode, fullscreen }` 单例）+ `MD_VIEW_MODES` / `MD_VIEW_SHORTCUT` / `cycleMdView()` / `toggleMdFullscreen()` / `exitFullscreen()` + 六个派生 computed（`mdFileActive` / `mdActive` / `mdViewMode` / `mdViewSplit` / `mdViewPreview` / `mdFullscreen`）。与 `settingsTab.js` 同一体例（纯 UI 状态的模块级单例），区别是这份**要跨会话记住**、自带 localStorage 读写（见 15.5） |
| `src/services/mdFormat.js` | 工具栏的**纯变换层**：`MD_TOOL_GROUPS`（编排）/ `MD_SHORTCUTS`（14 条键位）/ `formatMarkdown(action, text, ranges, options)`（给定全文 + 绝对偏移选区 → `{ edits, selections }`）/ `markdownStats(text)`。不碰 Monaco、不碰 DOM，每条变换都能脱离编辑器单独验 |
| `src/services/mdRenderer.js` | 渲染管线：`renderMarkdown(source, container)` = marked（含两个自定义数学扩展）→ DOMPurify → `hydrateMath()` 填公式。见 15.4 |
| `src/services/mdRuntime.js` | ★ 渲染运行时的本地侧：清单 `/md/assets.json`、缓存桶 `cph-md-runtime-v1`、`probeMdRuntime()` / `preloadMdRuntime()` / `uninstallMdRuntime()` / `loadMdRenderer()` / `MD_READY_FLAG_KEY`。见 15.3 |
| `src/components/MarkdownPreview.vue` | 预览面板：渲染状态机（`pending` / `missing` / `downloading` / `failed` / 就绪）、160ms 防抖、缺渲染器时的「下载」入口、与编辑器的滚动同步（含回音吃掉）。见 15.5 |
| `src/components/EditorPane.vue` | 题解那一行全部落在这里：工具栏（`.md-tools`）、链接 / 图片的填写行（`.md-insert`）、字数（`.md-stats`）、视图三态胶囊（`.view-switch`）、全屏按钮、预览面板的挂载与布局，以及 Monaco 侧那 14 条 `addAction` |
| `scripts/prepare-md-runtime.mjs` | 构建期把 `node_modules` 里的 katex / marked 抄进 `public/md/`（裁掉 woff / ttf 回退、写 `assets.json`）。挂在 `predev` / `prebuild` 上，不用手跑 |
| `public/md/` | 渲染运行时的落点（约 578KB）。**不进仓库**（`.gitignore` 里躺着）：它是构建输入而不是源码，跟着 katex 版本走 |
| `public/sw.js` | `MD_CACHE = 'cph-md-runtime-v1'`（与 `mdRuntime.js` 的 `CACHE_NAME` **必须逐字一致**）；`/md/` 走 `cacheFirst` 的按需落点，**不在 install 预缓存里** |
| `src/services/monaco/language.js` | `.md` / `.markdown` → Monaco 的 `markdown` 分词器（第 4 行有注释写明「题解用，不参与判题」） |
| `src/services/templates.js` | `LANGUAGES.markdown`：只有展示标签与默认扩展名 `md`，**没有 `piston` 字段**（引擎不认它）；`MARKDOWN_TEMPLATE` 是新建 `.md` 时的题解骨架 |
| `src/components/AppIcon.vue` | `markdown`（seti-ui 的 `icons/markdown.svg`，MIT，与 `cpp` 同一图标主题）+ 工具栏那 13 个线性图标 + `expand` / `collapse` |
| `src/components/FileTreeItem.vue` | 树里 `.md` / `.markdown` 认成 `markdown`，配色 `--icon-markdown` |

### 15.2 `.md` 是「非判题语言」

三条链路刻意各写一份、互不牵连，加新语言时别把 `markdown` 混进判题那条：

- **判题语言由扩展名派生**（第 5 节坑 15）：`markdown` 在 `LANGUAGES` 里有条目，但 `App.vue` 的 `activeLanguage` 只在引擎认得时才给值，`.md` 拿到的是 `null` —— 这就是运行闸门（15.8）的判据。
- **引擎不认识它**：`engines/wasm.js` 没有 markdown 分支，`runner.js` 也不会被走到（闸门挡在前面）。
- **状态栏**读不到判题语言，于是退回「按扩展名反查展示标签」的 `langMetaByMonaco(monacoId)`（`templates.js`）—— 不过 `.md` 下这条栏本来就被收掉了，见 15.8。

### 15.3 渲染运行时：与工具链同一套路数，按需下载

「没下载过的用户，外壳里没有它任何一份」这句在题解这边是**真的**（与 `public/wasm/` 同）：`public/` 下的文件不进 rollup 产物、也就进不了 `cph-precache-manifest`，唯一入口是设置面板或预览面板那颗「下载」。

| 产物 | 说明 |
| --- | --- |
| `public/md/katex.min.js` / `katex.min.css` | 公式渲染与样式；**CSS 里的 woff / ttf 回退被脚本裁掉**（全拷 1.1MB → 只留 woff2 的 296KB，现代浏览器都支持），裁完脚本还会断言没有残留 |
| `public/md/marked.min.js` | Markdown 解析（与主包里 Monaco 依赖树带进来的那份**同版本**） |
| `public/md/fonts/*.woff2` | 20 个公式字体，体积的大头 |
| `public/md/assets.json` | `{ katex, marked, bytes, assets[] }` —— **下载清单的唯一出处**（构建期生成），所以 katex 升版不用改任何一行代码，也不用手抄版本号进文档 |

与 C++ / Python 工具链**不同的三处**（`mdRuntime.js` 文件头写了原因，都是因为渲染器是 JS 而不是 WASM）：① 下载就是 `fetch` + `cache.put`，没有 IndexedDB 落盘、也不解压；② 清单来自构建期生成的 `assets.json`；③ 「已下载」的判据**只看 Cache Storage**（页面自己能读写，不需要 SW 控制），所以 dev 模式下的「已下载」同样成立 —— 不像 `wasmRuntime` 那样还得退回 HTTP 缓存，而那层没有 API 可清，卸载后会把资产立刻判回「已就绪」。

- **入口只有一处实现、三个调用点**：`wasmRuntime.js` 的 `probeRuntime` / `preload` / `uninstallRuntime` 在 `language === 'markdown'` 时转给 `mdRuntime`，所以设置视图「本地运行环境」那一行与 C++ / Python 共用同一套数据驱动渲染（`EditorSettingsPanel.vue` 的 `RUNTIMES` 表，三行同一份代码），预览面板那颗「下载」走的也是同一个 `preload`。加第四行运行时照抄这张表。
- **存档标记只是首帧播种值**：`cph.localRuntime.markdownReady`（`MD_READY_FLAG_KEY`，与设置面板那一行共用同一个键）。真正的判据永远是缓存探针 —— 浏览器随时可能清缓存而标记还留着；反过来「直接跑代码落了缓存」也会在下次探针时被正回来。探针同样**只在切到设置视图时跑一次**（`watch(() => props.active)` → `reconcile()`），别改成页面加载就探（未命中会在控制台记 `ERR_CACHE_MISS`，等于白刷一屏红字）。
- **卸载**是「清缓存 + 删全局 + 删标记」三件一起做（`uninstallMdRuntime()`），缺一件就会出现「界面说卸了、预览还能渲」。
- **升级 katex / marked**：改 `package.json` → `npm run md:runtime` 重跑（`predev` / `prebuild` 本来也会跑）→ `assets.json` 自己就对了 → 回来同步 `NOTICE.md` 与 `NOTICE.en.md` 的第二节 2.2（那是「四件事」里的一件，见 NOTICE 的维护约定）。

### 15.4 渲染管线：marked → DOMPurify → KaTeX

`renderMarkdown(source, container)` 三步，**顺序是刻意的**：

1. **marked**（`gfm: true` 保表格 / 任务列表 / 删除线，`breaks: true` 让单个换行就当换行 —— 中文题解里一行一句是常态，CommonMark 默认会把这整段挤成一行），外加两个自定义扩展 `INLINE_MATH` / `BLOCK_MATH`：只把 `$…$` / `$$…$$` 认出来，**渲染成一个空的占位壳**（`.md-math`，带 `data-display`）。
2. **DOMPurify.sanitize**（`USE_PROFILES: { html: true }`）：这一步**看不到任何 MathML** —— 公式此刻还只是空壳，所以不存在「DOMPurify 把 KaTeX 生成的 MathML 与内联样式洗掉」那个经典冲突（第 5 节「经验教训」里那条）。SVG / MathML 两套命名空间一律不留，少开几扇 XSS 的门。
3. **`hydrateMath()`** 拿 `katex.render()` 按壳里的 TeX 就地填（`displayMode` 读壳上的 `data-display`，`throwOnError: false`、`strict: 'ignore'` 免得公式里混进中文就刷满控制台），单个公式抛错就把它退回原始 TeX —— 一个公式炸掉整篇预览是不可接受的。

另外两条不能删的约定：

- `DOMPurify.addHook('afterSanitizeAttributes')` 给所有 `<a>` 写死 `target="_blank"` + `rel="noopener noreferrer"`：题解里放的是题面与参考博客，原页跳走会把未保存的正文一起丢掉。
- 数学扩展按**实例**装（`configured` 是 `WeakSet` 而不是布尔量）：卸载渲染器会把 `window.marked` 整个删掉，重新下载拿到的是**新实例**，布尔量留着 `true` 就永远装不上扩展，`$\LaTeX$` 会原地变成纯文本。

### 15.5 视图模式、全屏与滚动同步

**两个互不相干的维度**，刻意不做成四个枚举（「全屏的仅预览」「全屏的双栏」都是正当诉求，塞进一个枚举就得翻一倍）：

- `mode`：`edit`（仅编辑）→ `split`（双栏）→ `preview`（仅预览），说的是「编辑区里摆什么」；
- `fullscreen`：是否让编辑区独占整个窗口 —— 全屏时 **App 收掉侧栏与分隔条**（`v-show="panelVisible && !mdFullscreen"`）、**EditorPane 收掉页签栏**（`<EditorTabs v-show="!mdFullscreen" />`），**Esc 退出**（EditorPane 里的 keydown，`exitFullscreen()` 只关全屏、模式原样留着）。

- **存档**：`cph.mdView` = `{ mode, fullscreen }`。旧存档是**一个字符串**（`'edit' | 'split' | 'preview' | 'fullscreen'`），读盘时换算：`'fullscreen'` → `edit + fullscreen`，其余原样，认不出来一律回默认（`edit`）。**刻意不走 `usePersistentRef`**：那个 composable 要等组件 `onMounted` 才播种，而 App 在 **setup 期（首帧之前）**就得知道该不该把侧栏收起来 —— 与 `cph.shortcuts` / `cph.uiLocale` 是同一类先例（第 6 节末）。
- **`mdActive` 是两个条件的与**：`!settingsTab.active && mdFileActive`。两个回落条件都属于「这次不算数、但**存档别动**」：设置视图盖在编辑器上时分栏 / 全屏无从谈起；活跃文件不是 `.md` 时（用户点了旁边的 `.cpp`）视图照旧留着、切回题解原样恢复 —— 否则会出现「在全屏里点开一个 `.cpp`，侧栏和测试面板一起消失」。`mdViewMode` / `mdViewSplit` / `mdViewPreview` / `mdFullscreen` 都从它派生，所以**判「此刻算不算数」只有这一处**，App 与 EditorPane 各写一份迟早漂移。
- **切换后要 `layout()`**：`watch([mdViewMode, mdFullscreen])` → `nextTick(() => editor.value?.layout())`，Monaco 不会自己发现容器宽度变了。
- **滚动同步**按**比例**而不是像素（两栏内容高度本来就不同），关键是**吃掉回音**：设 `scrollTop` 前记一个 `programmatic` 比例，随后那一发 scroll 事件的比例几乎相等（容差 `ECHO_EPSILON = 0.01`，盖住整数取整）就当作自己的回音吞掉、不再往回发 —— 判据比数值而不是挂布尔标志，因为 Monaco 与浏览器派发滚动事件的时机并不一致（第 5 节经验教训里那条）。
- **重渲染会把预览 `scrollTop` 归零**（本质是 `innerHTML = …`），所以还存一个 `lastRatio`：渲染完照着它把位置放回去。少了这一条，典型症状是「一边打字一边被自动带到文末」时预览孤零零停在顶部 —— 那些滚动事件发生在正文还没重排完的时候（此刻预览还不够高，同步过来是空转），等正文渲染好，编辑器已经不滚了。
- 渲染**防抖 160ms**（`MarkdownPreview.vue` 的 `schedule`）：打字时正文逐字在变，每个字符都重排整篇 markdown 与全部公式会明显拖手；这 160ms 也顺手把「切文件」带起的一串变更合成一次。缺渲染器 / 正在下载时**不再自动重试**（每次重渲染都要翻一遍 Cache Storage，而结论不会变）。

### 15.6 工具栏 14 项与字数统计

`MD_TOOL_GROUPS` 三组，共 **14** 项：`bold / italic / strike / code` ｜ `heading / quote / list / orderedList / codeBlock` ｜ `link / image / math / table / hr`。键名**一身三职** —— 动作名、`AppIcon` 的图标名、i18n 的 `app.md.tool.<键>`，改名要一起动。

- **工具栏按钮用 `@mousedown.prevent`**：不 prevent 的话焦点会先跑到按钮上，编辑器的选区随之丢掉，点一下加粗就变成「在光标处插占位符」。插入类的两个（链接 / 图片）在按钮正下方弹一条填写行（`.md-insert`，不是弹层：省掉了点外部关闭与层级打架两件事）；地址走 `new URL()` 校验、只允许 http / https，不合法就在行内标红、不写入。
- **开关语义收在 `mdFormat.js` 一处**：同一个按钮按第二次退回原样。包裹类（加粗 / 斜体 / 删除线 / 行内代码 / 公式）要辨四种情形 —— 光标卡在 `**|**` 当中、选区正好卡在一对 marker 内侧、选区自己带一对 marker、其余才加 marker；行级类（标题 / 引用 / 列表）逐行加前缀、整段都带前缀就全脱掉。这类判断写在十几个按钮回调里必然走形。
- **回位口径**：无选区就插入占位文案并**选中占位文案**（接着打字正好替换掉）；有选区就把 marker 加在外侧、选区留在内容上。插入类（表格 / 分割线）光标落到插入内容之后，表格额外选中第一格（接着打字就是改表头）。
- **块级插入要自己补空行**：`---` 紧跟在文字下面会被当成 setext 标题（上一行变 h2），表格同样不能打断段落，两者都要求前面有一个真正的空行 —— `blankGap()` 负责这件事。
- **多光标**：每个选区各算各的编辑，再按前面几段的净位移把后面几段的光标挪一下（`combine()`）；不挪的话第二处之后的光标会全落在原地（前面插进去的 marker 把它顶偏了）。
- **一次按键 = 一步 ⌘Z**：`applyTool()` 在 `executeEdits` **前后各推一个撤销点**（`instance.pushUndoStop()`），不让中间态（只有 marker 没有内容）成为独立的一步。
- **字数**：`markdownStats()` 返回「**不含空白**的字数」与行数（题解里换行与缩进是排版手段，不该算进篇幅），面板右端渲染成 `N 字 · M 行`（`app.md.stats.chars` / `lines`，**不是 words**）。它跟着 `mdSource` 走 —— EditorPane 订阅了活跃 model 的变更，不必再单独订阅一次。
- **插入行 / 工具栏跟随 `mdActive`**：`watch(mdActive)` 在不再是题解时把填了一半的插入行收掉（否则状态留着，下次进题解会平白冒出来一条上次的残留）。

### 15.7 15 条快捷键：14 条格式 + 1 条视图

| 键位 | 动作 |  | 键位 | 动作 |
| --- | --- | --- | --- | --- |
| `Mod+B` | 加粗 |  | `Mod+K` | 链接 |
| `Mod+I` | 斜体 |  | `Mod+Shift+P` | 图片 |
| `Mod+Shift+X` | 删除线 |  | `Mod+Shift+M` | 行内公式 |
| `Mod+Shift+E` | 行内代码 |  | `Mod+Alt+T` | 表格 |
| `Mod+Shift+H` | 标题 |  | `Mod+Alt+R` | 分割线 |
| `Mod+Shift+Q` | 引用 |  | `Mod+Shift+U` | 无序列表 |
| `Mod+Shift+K` | 代码块 |  | `Mod+Shift+O` | 有序列表 |
| `Mod+\` | **轮换视图模式**（`MD_VIEW_SHORTCUT`，在 `mdView.js` 里） | | | |

- **键位对齐 VS Code / 洛谷的习惯**，写法与全局那套完全一致（`Mod+Ctrl+Alt+Shift+<KeyboardEvent.code>`）。
- **14 条注册进 Monaco**（`EditorPane.vue` 的 `registerMarkdownActions`，`onMounted` 里只调一次），作用域交给 `precondition: editorLangId == markdown`。**刻意不登记进全局快捷键系统**：那套表是「全应用一份、用户可改」，而这几条只在题解里说得通 —— 在 `.cpp` 里按 `Mod+K` 冒出一个 Markdown 链接显然不对。代价是它们**不可改、也不出现在设置面板的快捷键列表里**，键位只能写在工具栏按钮的 `title` 上（`toolTitle()`，i18n 的 `app.md.toolHint`）。Monaco 0.56 **没有 `removeCommand`**（第 5 节经验教训），所以只注册一次、靠 precondition 划作用域是唯一可行解。
- **两条「自私」的键位与全局撞车**：`Mod+B` = 全局「收侧栏」、`Mod+Shift+E` = 全局「翻侧栏面板」。解法定成**编辑器优先**：`App.vue` 的 `onKeydown` 在捕获阶段先判「`mdActive` + 事件目标在 `.monaco-editor` 里 + 这个组合是那 14 条之一」→ **原样放行给 Monaco**。判据取「焦点在编辑器里」而不是「活跃文件是 `.md`」：在题解旁边摸着测试面板按 `Mod+B`，该收的还是侧栏；只有真在写字的时候它才是加粗（VS Code 也是这个口径）。**副作用**：写题解时这两条全局动作暂时按不动。
- **`Mod+\` 不跟着那 14 条进 Monaco，走 App 的全局监听**：它改的是「编辑区怎么摆」，与光标在哪无关，而切到「仅预览」时编辑器整块被藏、焦点已经不在里面，Monaco 就再也收不到那一发（症状是**走出去回不来**）。作用域照样钉在题解上，判断换成「活跃文件是 `.md`」；用户若把这个组合显式绑给了别的动作，**以用户那条为准**（`!actionId` 才走轮换）。
- 全局监听挂着 `if (recordingActive.value) return` 与 `event.isComposing`：录制中让路、输入法组字期间不算快捷键。

### 15.8 运行闸门与状态栏

- **`.md` 不触发编译**，做法是「入口上的禁用态」而不是「点了没反应」：`activeLanguage` 为 `null`，于是 `App.vue` 的 `runBlockedReason` 给出一句提示（**「一个文件都没打开」与「打开的不是代码」是两句话**，别混成一句），评测面板页脚那颗 ▶ 据此 `disabled` + `title`；`runAll()` 里**再兜一次**（`if (!activeLanguage.value) return`），保证「没有判题语言就绝不进编译」这条不依赖 UI 是否画对。快捷键那条没有独立判据，走的就是 `runAll` —— 所以它天然是同一个态。
- **状态栏的四道闸门**统一写在 `EditorPane.vue` 样式表末尾（都是「这 22px 此刻不值得占」，不必分两种写法）：① `.editor-pane.is-md` —— 题解下恒收掉（这条栏说的全是代码的事，而且它是一整条实心蓝，压在一屏散文底下太抢眼）；② `.is-status-off` —— 设置里关掉了（`editorOptions.js` 的 `statusBar` 偏好，**默认开**、不进 Monaco，只是面板自己的开关，见 15.1）；③ `@media (max-height: 479px)`；④ `.app.is-short`（`useMobileKeyboard` 按 visualViewport 写）。写 **479** 而不是 480：口径是「高度**小于** 480」，与 JS 那边的 `< 480` 等价。

### 15.9 改这块时的几条纪律

- **缓存桶名两处一致**：`mdRuntime.js` 的 `CACHE_NAME` 与 `sw.js` 的 `MD_CACHE`（`cph-md-runtime-v1`）。那里管保留与清理（`keep` 集合），这里管读写。
- **`public/md/` 不进仓库**（`.gitignore` 已忽略）：它是 `node_modules` 里 dist 产物的副本，由 `npm run md:runtime` 生成。别手改里面的文件，改的是 `scripts/prepare-md-runtime.mjs`。
- **换 katex / marked 版本**：三件事连着 —— 重跑 `md:runtime`（`assets.json` 自己就对）、回来同步 `NOTICE.md` + `NOTICE.en.md` 第二节 2.2 与第一节的版本号（NOTICE 的规则是「版本号必须实机核，不许凭记忆写」）、再确认预览真能渲出公式。
- **别把 `.md` 接进判题链路**（`activeLanguage` / 引擎表 / `LANGUAGE_IDS` 的用法），那条边界是闸门与状态栏的共同前提。
- **新加工具栏动作**要同时改：`MD_TOOL_GROUPS`（编排）+ `formatMarkdown`（变换）+ `AppIcon`（图标）+ `app.md.tool.<键>`（中英两栏）+ 可选 `MD_SHORTCUTS`（键位）。漏掉图标会在工具栏里留一块空白。
- **文案五处一起看**（第 12 节那张表）：题解能力落在 `guide.html` / `guide.en.html` 第 7 节末的 h3「题解（Markdown / LaTeX）怎么写？」（英文版同位置）、`src/i18n/messages/help.js` 「抓题与文件 / Importing problems & files」组的**最后一条**、`docs/使用手册.md` 第 3 节、`index.html` `<noscript>` 「能做什么」清单里的那一条（中英各一条）。改题解的口径——键位数、渲染器体积、哪个入口被禁用——这五处都要过一遍。