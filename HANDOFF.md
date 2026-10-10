# unnamed · 交接文档

面向「接下来要改前端样式」的接手人。当前代码**已跑通并上线**：本地 WASM 沙箱能编译运行 C++、也能解释运行 Python（含多文件 import）、判题（含 TLE）、主题与布局都能用；前端已推到 GitHub 并由 Vercel 托管（见第 10 节）；也能作为 PWA 装到设备上独立窗口运行、断网可用（见第 9 节）；还能配合改造版浏览器插件**一键抓题**（题目直接落进工作区、样例自动填进评测面板，见第 13 节）。

## 0. 一分钟上手

- 目录：`/Users/hejie/Code/BISHE`（仓库名是 `wasm-oj-frontend`）。
- **是 git 仓库**：远程 `origin` = https://github.com/hejiehejiehejiehejie/wasm-oj-frontend.git ，主分支 `main`（就是部署分支）。动大样式前先看一眼 `git status`。
- 启动：`npm run dev` → http://localhost:5199；想验生产构建用 `npm run build && npm run preview`（Service Worker 与安装入口**只在生产构建里存在**，dev 下测不到，见第 9 节）。
- 其他命令：`npm run verify` 跑无头回归（**B–H 应当是绿的**，A 步有一条已知竞态，见第 8 节；**本机要显式给 Node 与 Chrome 的路径**，见第 8 节开头）；`npm run wasm:opt` 是工具链体积优化，**当前结论是不用跑**（第 7 节）；`npm run md:runtime` 把题解渲染器（katex + marked）从 `node_modules` 抄进 `public/md/`，**已挂在 `predev` / `prebuild` 上，平时不用手动跑**。
- HTML 入口：`index.html`（主应用）与四个内容页——`guide.html` / `guide.en.html`（使用指南的**中文版与英文版**，给搜索引擎抓取的静态长文）、`notice.html` / `notice.en.html`（第三方组件清单的中英文版，**生成物**，见第 12 节），各语言两页共用 `src/styles/guide.css`。改文案 / 样式时，`guide.html` 与 `guide.en.html` **两版必须同时改**，再加 `src/i18n/messages/help.js`（应用内「设置 → 帮助」那份内容）、`docs/使用手册.md`、`index.html` 的 `<noscript>`，一共五处要一起看（见第 12 节）。
- 响应式：**没有顶栏**（2026-09-28 整体删除）。所有入口都在工作区内——侧边栏页头的两颗图标（面板切换 / 设置）、设置视图里的「应用」分组（安装到设备）。**运行只剩两个入口**：全局快捷键 `Mod+Enter`、评测样例面板页脚那颗 ▶（曾有的编辑器页签栏运行按钮已于 2026-09-28 删除，见第 3 节）。侧边栏最低宽度随视口收缩（见第 3 节两小节）；工作区两栏始终并排、不堆叠。各档宽度都是实测定出来的，改动后要重量（第 1、3 节）；触屏下分隔条已可拖动，且有「键盘模式」（第 3 节末）。
- 浏览器插件抓题（2026-09 加）：改造版 Competitive Companion（已更名 **CC for Web**，主色与本站同蓝）解析完题目后，把 JSON 经内容脚本用 `window.postMessage` 投给本站，站点落盘到 `/<年月>/<OJ 标签>/<难度>/<题名>.cpp`（直接挂在工作区根下，无外层 wrapper），题目信息与抓到的样例都挂在代码文件**自己的节点**上（`node.meta` / `node.config`，2026-10-01 起；旧版是同级隐藏的 `.cph/<题名>.json` 文件，已由 `migrate.js` 一次性搬进节点；难度导入时为空，先落「未分类」），树里不另有条目，并把抓到的样例整体替换进评测面板。安装包就在站内分发——设置视图「应用 › 浏览器插件」里有下载按钮（`public/extension/cc-for-web-<版本>.zip`），同一组里还有「投递目标」两个开关，可以直接把「发到本网站 / 发到本地工具」任一关掉（2026-09-30 加，真值写在扩展的 `chrome.storage`，见 13.1）。详见第 13 节。
- 全局快捷键（2026-09 加）：设置视图「快捷键」分组里可录制 / 清除 / 复位，默认 `Mod+Enter` = 运行全部用例、`Mod+Shift+KeyE` = 切换侧栏面板（等价于点页头那枚胶囊）；实现要点与坑都在第 13 节。
- **题解（Markdown / LaTeX，2026-09-30 加）**：`.md` / `.markdown` 走 Monaco 内置的 markdown 分词器，只用于**写题解、不参与判题**（两个运行入口都会给禁用态）。编辑区为此多了一行工具栏（14 项：加粗 / 标题 / 列表 / 链接 / 图片 / 公式 / 表格 / 分割线…）、`N 字 · M 行` 统计、三态视图胶囊（仅编辑 / 双栏 / 仅预览）与一颗全屏按钮，另有 15 条题解专用快捷键（`Mod+\` 轮换视图、`Esc` 退全屏）。预览用的 marked + KaTeX **按需下载**（设置视图「应用 › 本地运行环境」的第三行，缓存桶 `cp-md-runtime`，约 578KB），与 C++ / Python 工具链同一套路数。
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
| 侧边栏页头的图标不许溢出 | 页头左侧是一枚**面板胶囊开关**（两段，共 60px）+ 一颗独立的设置钮（26px）+ 4px 间距 = 90px，渲染在**两个面板各自的页头**里；最窄的面板下限是 158px（320px 视口），实测仍留 64px 给右侧的动作按钮（新建文件 / 文件夹）。**别给图标加文字、别加大 `gap`、别加第三段/第三颗**——页头没有折行兜底（`FileExplorer` 的 `.explorer__head` 是固定 `height: 35px`），撑不下就直接溢出。整枚胶囊是一颗 toggle 按钮（点它任意位置都翻到另一个面板），里面的两段是纯视觉指示——**别把点击下放回某一段**，那会在胶囊里留出点不动的边 |
| 运行入口只剩两处 | 编辑器页签栏右端那颗「运行 / 停止」按钮已于 **2026-09-28 删除**（它当时是侧栏收起后唯一的点击入口）。现在只剩：全局快捷键 `Mod+Enter`（捕获阶段监听，见坑 21）、评测样例面板页脚那颗 ▶。两个入口都并到 `App.vue` 的 `runAll()`，跑之前都会 `revealTestsPanel()` 把侧栏亮出来（见第 3 节「开跑必亮结果」）。**别再往页签栏加运行按钮**：`.editor-tabs` 现在只有 `.editor-tabs__strip` 一个子元素、`flex: 1 1 auto` 铺满整行 |
| 面板下限只在 CSS 里定义一份 | 侧边栏最低宽度由 `.workspace` 上的 `--tests-min-cap / --tests-min-ratio / --tests-min-floor` 决定（即 `.pane--tests` 的 `clamp(160px, 50%, 320px)`；变量名里的 `tests` 是历史沿革，统一侧边栏沿用同一套），`measureLimits()` 读同一组变量复算；改数字只改 CSS 那三行，别在脚本或组件里再写一份 |
| 侧边栏内部只用 `v-show` | 整栏显隐、栏内两个面板（资源管理器 / 评测样例）的切换**都是 `v-show`**：文件树的展开状态、样例里手填的输入与卡片折叠态都挂在 DOM 上，改成 `v-if` 会在切换时被销毁重建，用户数据直接丢。**「设置」也在这一栏里，但它不是第三个面板**——它是编辑区里的合成页签，页头那颗图标只负责开关那个页签，不参与两个面板的 `v-show` 切换（见第 5 节坑 7） |
| flex 容器的子元素要显式拉伸 | 布局里 `.pane > *` 必须 `flex: 1 1 auto; min-width: 0`，否则子组件收缩到内容宽度 |
| 触屏上的可拖目标必须声明 `touch-action` | 各自保住本容器的滚动方向：页签栏的页签 `pan-x`、文件树的行 `pan-y`、分隔条 `none`（它不需要滚动）。**绝不能图省事写 `none`** —— 手指按在它上面就再也滚不动那个容器了。`pointerdown` 里的 `preventDefault()` 挡不住这件事（按规范它只抑制兼容的 `mousedown` / `mouseup`）：手势归属是浏览器在 `touchstart` / `pointerdown` 那一刻定下的，之后改 `touch-action` 无效。配套的还有 `user-select: none` 一族与「`contextmenu` 从 `pointerdown` 就接管」—— 这三件套缺一件都**只在真机上现形**，无头探针全绿什么也说明不了（见坑 30） |
| Monaco 只能动态改 | 设置项变化走 `editor.updateOptions()` / `monaco.editor.setTheme()`，**不要重建实例** |
| 设置要持久化 | 统一用 `src/composables/usePersistentRef.js`（存的是 JSON 字符串，见第 5 节的坑） |
| SW 改了**外壳**策略就升 `SHELL_VERSION` | `src/services/storageNames.js` 的 `SHELL_VERSION` 只决定外壳桶名（现为 `cp-shell-v4`）；改外壳缓存内容或策略时必须同步升它，否则老用户会一直吃旧桶。**工具链桶名是硬编码的 `cp-toolchain`，刻意不跟版本号走**——工具链是随 URL 固定的二进制（clang 52MB + CPython 24MB），跟外壳改不改无关，绑在一起会让每次升外壳都逼老用户重下 76MB。要换代工具链时才手动改那一行 |
| 图标是构建产物之外的静态资源 | `public/icons/*.png` 直接进产物，**不在**构建清单里，改动它们要同步 `sw.js` 的 `STATIC_ASSETS`（见第 9 节） |
| 扩展安装包文件名必须带版本号 | `public/extension/cc-for-web-<版本>.zip`。它同理不在构建清单里，但**故意不进 `STATIC_ASSETS`**——发新版靠的是换个文件名（SW 对同源 GET 走 `cacheFirst` 且不重新校验，同名覆盖会让老用户一直下到旧包），见第 13 节 |
| 内置字体文件名必须带版本号 | `public/fonts/<族>-latin-<字重>-<字体内部版本>.woff2`，`@font-face` 只写在 `src/styles/fonts.css`（由 `base.css` 的**首行** `@import` 引入，`@import` 只能出现在其它规则之前）。与扩展包同理**不进 `STATIC_ASSETS`**，靠首次使用落进外壳桶，同名覆盖会让老用户永远吃旧文件。版本号必须取**字体内部**的真实版本，别抄上游 release 号（@fontsource 的包会滞后） |
| 导入题目挂在 VFS 节点上，不许另立存储 | 一道题 = 一个代码文件 `/<年月>/<OJ 标签>/<难度>/<题名>.cpp`（直接挂根下，无外层 wrapper；年月粒度 `YYYY-MM`；难度导入时一律为空，先落「未分类」）。题目信息（`node.meta`）与抓到的样例（`node.config`）都挂在这个文件节点上，树里不另有条目（2026-10-01 起；旧版是同级隐藏的 `.cph/<题名>.json`，由 `migrate.js` 一次性搬进节点）。代码文件只在首次导入时创建，**此后正文一个字都不动**（那是用户写的题解），样例整体覆盖而难度由用户手填、重抓要保留；题目身份认 `url` 不认文件名，且**必须全库按 `node.meta.url` 找回原文件**（分层后同一道题会算出新路径，只扫一个 OJ 目录会让老题解变孤儿）。改这里等于动用户数据，见第 13 节 |
| 全局快捷键监听必须在 `window` 捕获阶段 | `window.addEventListener('keydown', onKeydown, true)` + `preventDefault()` + `stopPropagation()`。Monaco 的键位服务挂在编辑器内部 DOM 上，只有捕获阶段抢得过它；**不要**再用 `editor.addCommand()` 同步键位（Monaco 0.56 没有 `removeCommand`，旧的撤不掉） |
| 录制快捷键时全局监听必须让路 | 开录时置 `recordingActive = true`（录制框自己的监听在按钮的目标阶段，捕获永远先跑），否则按下新组合键的瞬间功能会先被执行一遍 |
| 禁止引第三方快捷键库 | 规范化只需要「读 `event.code` + 四个修饰键」，`useShortcutManager.js` 里一个纯函数就够（Mousetrap 之类一律不引） |
| px / rem 的边界纪律 | CSS 里写 `px`，构建时由 `postcss-pxtorem` 统一转 `rem`（配置在 `vite.config.js` 的 `css.postcss`），全局缩放只改根字号。但**转换只发生在 CSS 声明值上**：JS 内联样式、JS 常量、`@media` / `@container` 断点参数都不受影响（见第 5 节坑 24）。三条判据：① 物理尺寸（鼠标坐标 / DOM 原生测量 / 手势阈值）永远保持 `px`；② 逻辑尺寸里，喂给 Monaco 的 `fontSize / lineHeight / scrollbarSize / padding`、以及 JS 写死的容器上限必须自己乘 `scale`（见 `composables/useUiScale.js` 的 `px()`）；③ 被 JS `parseFloat` 读的 CSS 变量（`--tests-min-*`）必须在 `propList` 排除名单里留在 px 坐标系，**不要**在 JS 里对 parseFloat 结果做 rem 反向换算——代价是它们吃不到 rem 的自动缩放，所以这类「以物理 px 存放、但语义上是逻辑尺寸」的值要在**使用处**乘一次缩放倍数（JS 用 `uiScale.value`，CSS 用 `--ui-scale`），见第 5 节坑 24 |
| 界面文案不许写死 | 组件、composable、service 里**一律不许出现中文字面量**（现在只剩注释里有中文）。模板与 computed 里写 `t('域.组.键')`，整棵内容树（应用内帮助）走 `messages('help')`。加新文案 = 在 `src/i18n/messages/<域>.js` 里**中英两栏同时补**（同一文件里并排），缺哪一栏会静默退到中文。唯一例外是**写进文件系统的名字**（见下一条）与 `[unnamed]` 这类控制台前缀（见第 5 节坑 28 第 5 条） |
| 数据表只存 key，不存译文 | `EDITOR_GROUPS` / `SECTIONS` / `RUNTIMES` / `THEMES` / `SHORTCUT_ACTIONS` / `OJ_LIST` / `LUOGU_LEVELS` / 各引擎的 `labelKey` 都只存 `labelKey` / `hintKey` / `titleKey`（可带 `labelParams`），由消费处再 `t()`。**在模块顶层或 `<script setup>` 顶层调 `t()` 会冻结成那一刻的语言**——切语言不跟着变，是最容易漏的一类（第 5 节坑 28 第 1 条） |
| 写进文件系统的名字不翻译 | `vfs/problemImport.js` 的 `未分类` / `未命名题目`、`problemMeta.js` 里 `OJ_LIST[].dirName`（洛谷 / Codeforces / 牛客…）都会变成**真实目录名 / 文件名**。跟着界面语言变会让同一个逻辑位置出现两个目录（老用户切换语言后找不到自己的题）。所以显示名走 `labelKey`、落盘名走 `dirName`，**两个字段刻意分开**，主应用与两份 guide 的正文里也照写 `未分类` 不译。同理 `cp.*` 键名、IndexedDB 库名、主题 id 都不随语言变 |

## 2. 与界面相关的文件

```
index.html                      # 主应用入口：挂载点 + PWA（manifest / apple-touch-icon / theme-color，见第 9 节）+ 一整套 SEO 头（canonical / og / ld+json）+ 服务无脚本抓取器的 noscript 兜底正文（见第 12 节；那块正文**是给搜索引擎看的文案**，改界面能力时别忘了它）
guide.html                      # 第二个 Vite 入口：使用指南长文（静态、无 Vue、无 JS），给搜索引擎直接抓取；样式在 src/styles/guide.css（见第 12 节）
guide.en.html                   # 第三个 Vite 入口：上面那页的**英文版**，逐条对应（同为 12 节、同序、同数字），共用同一份 guide.css；两页用 hreflang 互链 + 页头各有一颗语言切换链接。**内容改了必须两版一起改**（见第 12 节）
privacy.html / privacy.en.html  # 隐私政策的中英两版（2026-10-06 加，**手写**，复用 guide.css 与同一套页头/主题脚本）。存在的直接原因：Edge Add-ons 与 Firefox AMO 上架都要求填一个可访问的隐私政策 URL（见第 13 节）。**内容必须与站点实际行为一致**，重点两处：云端同步上传的是公开可读的偏好项、切到 Piston/Judge0 时代码发往你自己填的地址
vite.config.js                  # 七个 rollup 入口（index / guide / guideEn / notice / noticeEn / privacy / privacyEn）+ COOP/COEP 响应头（本地沙箱的硬前提，别动）+ 构建期产出 precache-manifest.json + `css.postcss` 里的 postcss-pxtorem（全局缩放的 px→rem 转换，四项防御与判据见第 5 节坑 24）
vercel.json                     # 部署侧同一组响应头 + .wasm 的 MIME 与 immutable 缓存 + manifest/sw.js 的响应头 + sitemap.xml 的 MIME（见第 10 节）
public/manifest.webmanifest     # PWA 清单：display standalone、start_url /、scope /
public/icons/                   # PWA 图标：icon-192/512、icon-maskable-192/512、apple-touch-icon(180)
public/favicon.svg              # 站点图标（唯一进 STATIC_ASSETS 的 svg）
public/og-cover.png             # 社交分享大图 1200×630（被 index.html / guide.html / guide.en.html 的 og:image 引用）
public/extension/               # 站内分发的浏览器扩展安装包：cc-for-web-<版本>.zip（文件名带版本号是刻意的，见第 1 节与第 13 节）
public/robots.txt               # 抓取规则 + 指向 sitemap
public/sitemap.xml              # 站点地图（五条 URL：/ 、guide 的中英两版、privacy 的中英两版；双语对之间用 xhtml:link hreflang 互指。notice 两页刻意不进）
public/wasm/8.0.1/              # 自托管的 C++ 工具链：clang.wasm / wasm-ld.wasm / clang-fs.tar.gz（约 52MB，进仓库）
public/wasm/python-3.11.3/      # 自托管的 CPython（wasm32-wasi）：python.wasm + python-fs.tar.gz（约 24MB，进仓库）
public/md/                      # 自托管的题解渲染器：katex.min.js / katex.min.css / marked.min.js / fonts/*.woff2（20 个字重）/ assets.json（清单，约 578KB）。**不进仓库**（.gitignore 已忽略）——它是构建输入而不是源码，由 `npm run md:runtime` 从 node_modules 生成，跟着 katex 版本走；同样不在 SW 预缓存清单里，用户点了「下载」才进 `cp-md-runtime`
scripts/verify-ui.mjs           # 无头回归脚本（B–H 应当是绿的，A 是已知竞态，见第 8 节；B 步走的是「设置页签」；H 步是 2026-09-30 加的题解回归）
scripts/generate-store-screenshots.mjs # 出浏览器扩展商店的截图（npm run screenshots:store）：自己挑空闲端口起 dev server → 用 postMessage 投一条真的 cp-task（Codeforces 158A 的题目 JSON）走 importProblem 落盘 → 截 1280×800。产出在 screenshots/（.gitignore 已忽略，是本地物料）。**只产「站点工作区」这一张**：工具栏图标画在浏览器 UI 上、系统通知画在操作系统层，自动化够不着，那两张只能真机手拍（操作单在 cph-companion/SUBMISSION-EDGE.md 第 5.1 节）
scripts/optimize-wasm.mjs       # wasm-opt 体积优化（npm run wasm:opt）——**刻意未接进构建**，结论见第 7 节
scripts/prepare-md-runtime.mjs  # 把 node_modules 里的 katex / marked 抄进 public/md/（裁掉 CSS 里的 woff / ttf 回退、写 assets.json），挂在 predev / prebuild 上
scripts/render-notice.mjs       # NOTICE.md / NOTICE.en.md → notice.html / notice.en.html（`npm run notice`，已挂在 prebuild 上；`--check` 校验两页是否最新）。语言相关的外壳文案（lang / canonical / 标题 / 描述 / 页头语言链 / 页脚）在文件内的 PAGES 表里，**不写进 markdown**；自写的极简 markdown 子集渲染，不引第三方解析器
NOTICE.md                       # 第三方开源组件清单（致谢 + 许可声明）：一、随产物分发的 npm 运行时依赖（Vue / Monaco / @runno/wasi + 直接依赖的 marked 与 DOMPurify，KaTeX 不在主包里、列在第二节）；二、`public/` 下自托管的上游产物（**2.1** 本地沙箱工具链：LLVM clang + lld 8.0.1 / wasi-libc / libc++ / compiler-rt / CPython 3.11.3；**2.2** 题解渲染运行时 public/md/ 的 KaTeX 0.18.9 + marked 14.0.0）；三、图标与字体（字体全是系统字体）；四、扩展 CC for Web 及其打包的库；五、构建期工具；六、外部评测服务（Piston / Judge0，本仓不含其代码）。**四件事任一发生都要回来同步**：改 package.json / 换 `public/wasm/` 的目录 / **换 `public/md/` 下的渲染运行时** / 换 `public/extension/` 的包；版本号要实机核（文件末尾附了核对命令，第 6 条就是查 `public/md/assets.json`）；面向用户的精简版是两版 guide 的「致谢与开源许可」一节（见第 12 节）。**英文对照版是 `NOTICE.en.md`**（2026-09-30 加，人工逐条对应，没有自动同步）
notice.html / notice.en.html    # **生成物，别手改**：上面两份源文件各自生成的静态页（中 / 英各一页），页头互链 + 三行 hreflang（x-default 指中文页），与两版 guide 同一套类名与主题脚本；两页都不进 SW 预缓存（见第 12 节）
docs/使用手册.md                # 面向新用户的说明：回答三个问题——「如何在本地运行 C++」「如何切换侧边栏面板 / 展开折叠侧边栏」「如何写题解（Markdown / LaTeX）」，与 src/i18n/messages/help.js 内容同源（**精简版**，且只有中文；完整版是 guide.html / guide.en.html）
docs/云端同步服务.md            # ★ 云端同步的后端（Cloudflare Worker `cf-config-api`）的**唯一在仓库记录**：拓扑 / Worker Route、身份验证模型（Codeforces handle 的 Last name）、五个接口的实测契约与错误原文、KV 键与 TTL、实测确认的行为（验证成功即删码 / 取新码作废旧码）、前端 `SYNC_KEYS` 白名单与登录语义，以及方案 A（设备令牌）的四处服务端补丁 + 前端令牌接线（`cp.cloudToken`、「上传本机设置」有令牌时直打 `/api/save`、401 自动退回取码）+ 部署自测命令。**Worker 源码不在本仓库**（也没有 wrangler 工程），所以改它之前先读这份文件、改完回来更新它
src/
  main.js                       # 挂载 + 生产构建里注册 Service Worker
  sw.js                         # Service Worker 的**源码模板**（不是产物）：预缓存外壳（工具链与题解渲染器都不预缓存、改为按需落缓存），导航网络优先（见第 9 节）。桶名常量不在本文件里——SW 是 classic worker、没法 import，所以由 vite.config.js 的 `cp-service-worker` 插件把 services/storageNames.js 的 `SERVICE_WORKER_CONSTANTS` 生成一段 `const …` 前置进来，产物落 `dist/sw.js`（URL 与原来的 `public/sw.js` 完全一致）。**`public/` 下已经没有这个文件**，dev 下由同一个插件的中间件现场拼出来
  monaco-setup.js               # Monaco 的 dark / light 两套自定义主题
  i18n/index.js                 # ★ 界面双语的唯一权威：locale（模块级 ref 单例）/ setLocale / t(key, params) / useI18n() / messages(域) + LOCALES（id 与**自称**标签）/ DEFAULT_LOCALE / LOCALE_STORAGE_KEY。**刻意不走 usePersistentRef**——界面语言必须在任何组件挂载之前就定下来（首帧不能先闪中文），所以自己同步读写 localStorage、初值在第 0 帧算好；`applyLocale()` 同时维护 `<html lang>`。缺词条先退中文、再原样露出 key
  i18n/messages/{app,engines,explorer,help,settings,tests}.js  # 六个域的词条表：**同一文件里中英两栏并排**，改一处就看得见另一处（help.js 整棵是「应用内帮助」的正文内容树，走 messages('help') 整棵取，不是逐条 t()）
  styles/base.css               # ★ 所有 CSS 变量 + 全局元素样式，改配色只改这里
  styles/fonts.css              # 代码区三款内置字体的 @font-face（JetBrains Mono / Fira Code / Cascadia Code，各取 latin 子集 + Regular/Bold），由 base.css 首行 @import 引入；字体文件在 public/fonts/
  styles/guide.css              # 使用指南页（guide.html 与 guide.en.html 共用）的样式：**`@import './base.css'` 后再加长文排版**，两套主题的配色 / 字体 / 滚动条仍来自 base.css，这里一律 `var(--…)` 引用、不写十六进制（见第 12 节）。唯一要小心的：base.css 是为「满屏 IDE」写的（`html/body` 高度 100%、body 锁死滚动），内容页必须把那两条放开，否则长页滚不动
  App.vue                       # 布局骨架（workspace / pane / splitter）+ 全局状态；另外挂两件全局事：window 捕获阶段的 keydown（快捷键，`SHORTCUT_HANDLERS` 把动作 id 接上真函数）与 `useCompanionImport()`（接扩展投来的题目）
  composables/usePersistentRef.js
  composables/useUiScale.js       # ★ 全局界面缩放的唯一权威：uiScale 单例 + 档位表 UI_SCALE_OPTIONS + px()（设计 px → 真实 px）+ applyUiScale()（落根字号）+ normalizeUiScale()（读盘校验）。三条边界见文件头与第 5 节坑 24
  composables/useInstallPrompt.js  # 设置视图「应用」分组里「安装到设备」按钮的数据源：拦 beforeinstallprompt，用完即弃
  composables/useMobileKeyboard.js # 触摸屏「键盘模式」：视口收缩 + 不抢焦的保焦拦截（见第 3 节末）
  composables/useCompanionBridge.js # ★ 扩展消息接收端：window.postMessage 握手（cp-ping → cp-info）与题目投递（cp-task）。状态是**模块级单例**（扩展装没装是全局事实，各组件不该各探一次）；同站多开标签页时扩展会广播，按 taskId 去重
  composables/useCompanionImport.js # 订阅扩展题目 → 调 problemImport 落盘 → 把样例**整体替换**进评测面板 → nextTick 后抢焦点。它是 problemImport 返回值的唯一消费方
  composables/useShortcutManager.js # ★ 全局快捷键的唯一权威：动作表 SHORTCUT_ACTIONS + 绑定表 + comboFromEvent 规范化 + 冲突检测 + localStorage。**刻意不挂组件生命周期**（App 的全局 keydown 与 EditorPane 的状态栏提示都要在任何组件挂载前就可用）
  composables/useTreeDrag.js     # ★ 资源管理器文件树的拖拽移动（Pointer Events；鼠标位移超 4px 即拖，触屏要先按住 450ms 进 armed）。本模块不碰 VFS，落盘由 FileExplorer 的 onDrop 交给 vfs.rename；树以外的落点（编辑区 = 拖过去打开 / 跳转页签）由落点自己 registerDropZone 登记。2026-10-10 加触屏长按的两段反馈：`pressingId`（按住中 → 行上 `--pressing`）与 `armedId`（长按已成 → 行上 `--armed`），**两态互斥**、都在这里置位、统一在 cancelPress 收掉（行上怎么画见第 3 节 FileTreeItem 那格）
  composables/useTabDrag.js      # 编辑器页签的拖动排序（Pointer Events，鼠标 5px 阈值 / 触屏 450ms 长按先 armed 再拖）。**只排文件页签**，落点恒落在 `[0, openTabIds.length]`；本模块不碰 store，落盘由调用方的 onDrop 交给 `workspaceStore.moveTab`。触屏另有三件事：`contextmenu` 与非被动 `touchmove` 都在 **pointerdown 那一刻**就挂上（拦截本身只在 armed/dragging 时生效），并输出 `pressingId` / `armedId` 两段长按反馈。详见第 3 节 EditorTabs 那格与坑 30
  components/
    HotkeyRecorder.vue          # 单个动作的快捷键录制框：点一下开录、冲突红字且拒绝写入、Esc 放弃、Delete 清除绑定；开录时置 recordingActive 让全局监听让路（见第 13 节）
    EditorPane.vue              # 编辑区容器：Monaco 画布 + 设置视图（两者 v-show 互斥）+ 底部状态栏；把 judge / connection 透传给设置视图（运行状态不再透传——页签栏那颗运行按钮已删）。**题解那一行（工具栏 / 插入行 / 字数 / 视图胶囊 / 全屏按钮 / 预览面板）与 Monaco 侧那 14 条 `addAction` 也都在这个文件里**；状态栏的四道闸门在样式表末尾
    EditorTabs.vue              # 编辑器标签栏：只有一条 `strip`（文件页签 + 「设置」合成页签，横向滚动）。右端那颗「运行 / 停止」按钮已于 2026-09-28 删除（运行入口见第 1 节硬约束表）
    EditorSettingsPanel.vue     # 设置视图：铺满编辑区、与代码文件平级的合成页签（不再是抽屉 / Teleport）；宽面板下是「目录 + 内容」两栏、窄面板下目录折成顶部横条（判定走容器查询，见第 5 节坑 7），目录 = **常用设置** / 外观 / 编辑器 / **快捷键** / 评测 / **云端同步** / 应用 / 帮助（共 8 项，`SECTIONS` 常量驱动；B 步自 2026-10-01 起逐项点开验行为、不再数个数）。「常用设置」是最前面那个分类、也是默认选中项，里面的主题 / 界面缩放 / 字体大小 / 侧边栏位置与原分类是**同一份数据**（不是副本）；「云端同步」管登录绑定与「预下载本地运行环境」开关，后端见 `docs/云端同步服务.md`；未绑定时输入框右侧还有一颗**导入**按钮（2026-10-06 加）——只取一份公开的云端配置（`fetchCloudProfile`），不取码、不写 `cp.cloudAccount` / `cp.cloudToken`、不建立绑定，实现上是把用户名交给 `cloudApplyHandle`，复用地址栏 `/<handle>` 那条确认弹窗与 `confirmCloudApply()`。它是装成 PWA（独立窗口、没有地址栏）后导入云端设置的唯一入口。这四条路（导入 / 上传 / 登录 / 下载到本机）成功之后都会把 `/<handle>` 写进地址栏、并把「本机在跟谁 + 套用的是哪一版」记进 `cp.cloudActive`（2026-10-10 加，下次打开站点直接对齐这一套，并把地址栏补成 `/<handle>` —— 只在**网页版 + 站点根路径**时补，见 cloudEntry.js 的文件头），见 `cloudEntry.js` 的 `writeCloudEntryPath` / `writeActiveProfile`：上传两处在各自成功分支里直接调这两个函数，导入 / 登录 / 下载走 `adoptCloudProfile(data, handle, updatedAt)` 的第二、三个参数（**登录只下不传、也不因此建立绑定**的规矩没变）。「外观」那组管主题 / 字体大小（`APPEARANCE_ROWS`，仍是 editorSettings 的键）与侧边栏位置 / 界面缩放（各有自己的出口）；「编辑器」那组按 `EDITOR_GROUPS`（字体 / 编辑 / 光标与高亮 / 视图 4 小节，共 22 行；2026-09-30 在「视图」小节末尾加了 `statusBar`）数据驱动渲染，每行只写「键 + 标签 + 控件类型 + 可选项」，可选项表全部来自 services/editorOptions.js；「快捷键」那组按 `SHORTCUT_ACTIONS` 渲染 `HotkeyRecorder`；「应用」那栏除「安装到设备」外还并入两块（用 `.setting-subtitle` 分区）：**本地运行环境**按 `RUNTIMES` 表渲染**三行运行时**（C++ / Python / 题解渲染器，同一套代码，`language === 'markdown'` 时由 wasmRuntime 转给 mdRuntime）；**浏览器插件**管扩展的安装包下载 / 状态探测 / 插件侧快捷键查看（两个常量 `EXTENSION_VERSION` / `EXTENSION_FILE` 决定下载地址，升版本只改这里 + 换 zip）
    EngineSettingsPanel.vue     # 「评测」分组里的引擎列表 + 服务地址 + 自检（原顶栏「评测引擎设置」弹层的正文）
    HelpPanel.vue               # 「帮助」分组里的问答列表 + 完整指南链接（原顶栏「?」抽屉的正文，现只读、无按钮 / Teleport，与 docs/使用手册.md 同源）。**体例（2026-09-29 定）**：`GROUPS` 是「分组 → 条目」两层，每条 = `name`（**必须是疑问句**，它就是小标题）/ `role`（一句话答案）/ `steps`（操作步骤，渲染成 `<ol>` 1. 2. 3.）/ `notes`（要点与口径，渲染成圆点）/ 可选 `table`（判定码、性能实测这类多列短值）；正文里用 `**…**` 标出界面上的按钮名与页面名，`segments()` 负责拆成加粗片段（**不走 `v-html`**：文案里会出现 `<vector>` 这类头文件名，交给 HTML 解析会被当标签吃掉）
    MarkdownPreview.vue         # 题解预览面板（2026-09-30 加）：渲染状态机（`pending` / `missing` / `downloading` / `failed` / 就绪）、160ms 防抖、缺渲染器时的「下载渲染器」入口、与编辑器的**双向滚动同步**（比例 + 回音吃掉 + 重渲染后按 lastRatio 复位）。只接受 source 字符串、不认识 Monaco
    Sidebar.vue                 # ★ 统一侧边栏外壳：用 v-show 切换两个面板（资源管理器 / 评测样例），面板本体由 App.vue 经具名插槽（#explorer / #tests）填入；页签状态（cp.sidebarTab）与持久化留在这里，经 provide 下发给页头里的切换组件。自己不管宽度与整栏显隐——那是外层 .pane--tests 的事。另 `defineExpose({ showPanel })` 供父组件从外部切面板（App.vue 跑测试时要把「评测样例」亮出来），状态仍只有这一份
    SidebarSwitcher.vue         # 侧栏页头里的两组入口（2026-09 加）：面板胶囊开关 + 设置。不再独占一行页签栏，而是渲染进两个面板各自的页头里（同一时刻只有一个面板可见，视觉上只有一份）；只画 logo 不写字，名字在 `title` / `aria-label`；状态从 Sidebar 的 provide 取（`panels` / `targetPanel` / `togglePanel` / `settings` / `toggleSettings`），自己不存状态。面板那枚：`.sidebar-switcher__pill` **本身是一颗 `<button>`**（点任意位置 toggle，高度 26 / 13px 圆角 / 底色 `--bg-control`），里面 `v-for` 出两段 `<span class="sidebar-switcher__seg">` 作纯视觉指示（28×22、11px 圆角，当前段 `.is-active` 填 `--accent` + `--text-on-accent`，并打 `data-panel` 与 `data-current`）。设置那颗 `gear`（开关编辑区里的设置页签，`settingsTab`，不落盘）在轨道外，是独立的圆形按钮。切换时选中段播一次滑动动画（见第 4 节类名表与第 5 节坑 5c），只在 `[data-switched]` 下放
    FileExplorer.vue            # 资源管理器面板（Sidebar 的 #explorer 插槽）：页头左侧是 SidebarSwitcher、右侧是新建文件 / 文件夹两颗按钮 + FileTreeItem 树 + 右键菜单（`ContextMenu`，经 `provide('openContextMenu')` 下发给树节点）+ 删除确认弹窗（自绘，见第 5 节坑 11）+ 题目信息弹窗（自绘，同款，见第 5 节坑 17）。新建的**目标目录可以是任意目录**：页头两颗按钮跟随**树里选中的那一行**（`workspace.selectedId`；选中文件时取其父目录，点树里空白处 = 选中根 → 回落根目录），右键目录则显式指定；新建的**状态与提交都收在这里**（`creating` / `createFlights` / `commitCreate`），输入行本体见 InlineCreateRow.vue（见第 5 节坑 12）
    InlineCreateRow.vue         # 内联新建的输入行（2026-09-28 从 FileExplorer 里抽出来）：根目录那份由 FileExplorer 渲染、某个目录里那份由 FileTreeItem 渲染，两处共用。挂载时把 `{ focus }` 注册进 `provide('creatingRow')`，供「程序性失焦后把焦点抢回来」用（见第 5 节坑 12）
    FileTreeItem.vue            # 文件树节点：展开态存在自己身上，靠 Sidebar 的 v-show 保住；右键 `@contextmenu.stop` 把事件交给 FileExplorer（**`.stop` 不能删**，见第 5 节坑 14）；目录展开时还会在 `role="group"` 内、递归 `v-for` 之前渲染一份 InlineCreateRow（见第 5 节坑 12）；行的选中底色读 `workspace.selectedId` —— 2026-10-01 起**文件与目录同一套高亮**（单选）
    ContextMenu.vue             # 通用右键菜单：Teleport 到 body、fixed 定位、挂载后按视口四边收敛、点外部 / Esc / 失焦关闭。目前只有文件树在用（文件节点给「打开题目链接（仅当 `meta.url` 是 http(s) 链接）/ 题目信息 / 重命名 / 删除」，目录节点给「新建文件 / 新建文件夹 / 重命名 / 删除」、不给题目相关的两项）
    TestPanel.vue               # 评测样例面板（Sidebar 的 #tests 插槽）：页头左侧是 SidebarSwitcher、右侧是 verdict（「全部 AC / n/m AC」）与耗时 + 用例列表 + 页脚运行按钮。**不可运行态**（`runBlocked` 非空，由 App 的 `runBlockedReason` 算好传进来：题解这类非代码文件的 `activeLanguage` 是 null，以及「一个文件都没打开」）由同一份文案解释：页脚那行 `.run-blocked`（常驻，`v-if="runBlocked"` 不带附加条件）与两个 ▶ 的 title。**空态里不放这行** —— 「No test cases yet.」一行就是空态的全部（2026-10-06 定，别再加回去；空态里的 `notice` 是抓样那三条提示，说的是「样例为什么还没到手」，与能不能运行无关）。**「添加测试样例」也要跟着灰**（2026-10-06）：用例是写进活跃文件的 `config.tests` 的，跑不了的文件根本加不出用例，`App.addCase()` 里还有一道兜底挡住 `new-case` 快捷键。页脚两颗按钮的禁用态是同一档 opacity 0.45
    TestCaseCard.vue            # 单个用例卡片：徽标（AC/WA/CE/TLE/RE/ERR 判定码）/ 耗时 / 输入框 / 输出块。输入与期望输出**超过 6000 字符时显示切成「开头一段 + 省略行」**（框仍可编辑，但只能改省略行之前那段；全选复制与运行走的都是完整内容）；**没到 6000 但已超出框高（约 15 行）时没有任何标记**（字符一个没少、拖滚动条就能看全，底边仍是实线、框下也没有小字）；底边虚线与小字**只给真被截断的那种**；**框内那行标记就是一个光秃秃的 `……`，省略了多少一律由框下面那行「还有 N 个字符未显示 + 复制全部」说明**（那行只在真截断时出现；这个 `……` 时有时无的两条原因见第 5 节坑 26）
    AppIcon.vue                 # 内联 SVG 图标集（name 取图标名）。三张表：PATHS（24×24 描边线性图标，主力）/ SOLID_PATHS（整块实心品牌标，`fill: currentColor`）/ VIEWBOX（不在 24 网格上的图标的专用方框）。语言图标的两个坑见第 5 节坑 16（`.md` / `.markdown` → `markdown`，2026-09-30 加，配色 `--icon-markdown`）；设置目录用的 `keyboard`（快捷键）与 `plugin`（浏览器插件，拼图形状，刻意区别于「应用」组的 `install` 图标）也在 PATHS 里；新建按钮专用的 `file-plus` / `folder-plus`（2026-09-28 加）同表；**题解工具栏那 13 个线性图标与全屏用的 `expand` / `collapse`（2026-09-30 加）** 同样在 PATHS 里，键名与 `services/mdFormat.js` 的 `MD_TOOL_GROUPS` 一一对应
  services/                     # 判题逻辑，改样式基本不碰
    runner.js                   # 逐用例调度（并发 2）+ 进度回调；引擎 outcome 翻译成卡片 verdict（AC/WA/CE/TLE/RE/ERR）
    compare.js                  # 实际输出与期望输出比对，只返回布尔（不再产出「输出多 N 行」之类 hint）
    templates.js                # 各语言默认模板；`LANGUAGES` 里 **markdown 是「非判题语言」**（只有展示标签与默认扩展名，没有 piston 字段，引擎不认它），`MARKDOWN_TEMPLATE` 是新建 .md 的题解骨架
    monaco/language.js          # 文件路径 → Monaco languageId（`.md` / `.markdown` → 内置 markdown 分词器；头文件统一按 cpp 高亮）；语言路由只在扩展名这一处
    mdView.js                   # ★ 题解视图状态的唯一权威：视图模式 / 全屏 / 滚动同步的前提判断
    mdFormat.js                 # 题解工具栏的纯变换层：MD_TOOL_GROUPS / MD_SHORTCUTS / formatMarkdown / markdownStats
    mdRenderer.js               # 题解渲染管线：marked（含 $…$ / $$…$$ 扩展）→ DOMPurify → KaTeX 填公式
    mdRuntime.js                # 题解渲染运行时的本地侧：/md/assets.json 清单 + cp-md-runtime 缓存桶 + 探针 / 下载 / 卸载 / 注入
    editorOptions.js            # 编辑器偏好的单一出处：默认值 24 项 + 可选项表 + 逐键校验 + 偏好 → Monaco 选项（编辑器级 editorOptions(settings, scale) / model 级 editorModelOptions()）。**`scale` 是全局缩放的补偿点**：Monaco 不吃 rem，fontSize / lineHeight / padding / scrollbarSize 都在这里乘 scale；tabSize 不乘（列数不是像素），见第 5 节坑 24。最后一项 `statusBar`（默认开，2026-09-30 加）**不是 Monaco 选项**、不进 `editorOptions()`，它只管编辑区底部那条状态栏的显隐
    problemMeta.js              # 题目元数据的单一出处：OJ 表（洛谷/Codeforces/AtCoder/牛客/LeetCode/其它）+ 难度口径（CF·AtCoder 分数段 800…3500 / 洛谷八级 / 其余自由文本）+ 逐键校验 normalizeMeta() + 悬停文案 formatMetaTooltip()。meta **五项**：url / oj / difficulty / date / **timeLimit**（毫秒，100–60000，0 = 未设置；判题时优先于全局档位，见第 5 节坑 17）
    engines/                    # 引擎注册表：wasm（网页默认）/ native（桌面默认）/ piston / judge0 / echo。平台专属引擎在对象上写 `platforms: ['web'|'desktop']` 限定，注册表的 engineChoices / defaultBases / getEngine / DEFAULT_ENGINE_ID 都按它过滤（见第 14 节）
    wasmRuntime.js              # 本地沙箱的唯一入口：语言路由 + 阶段播报 + 看门狗 + 串行队列 + PCH 后台预热。**另外它还兼着「运行时」这个概念的三个出口**（probeRuntime / preload / uninstallRuntime），`language === 'markdown'` 时转给 mdRuntime —— 设置视图「应用 › 本地运行环境」才能用同一套代码渲染三行
    runnoSandbox.js             # runno 双管线：C++ 编译（工具链地址、编译产物缓存、PCH 生成）+ Python 解释运行
    vfs/runnoFs.js              # VFS → runno fs 的转换层（fsEntry 记录形状的唯一出处，两个管线共用）
    pchStore.js                 # PCH 的 IndexedDB 存档（原生 API，任何失败都按「没有存档」处理）
    settingsTab.js              # 「设置」合成页签的 UI 状态（刻意不进 workspaceStore/openTabIds、不建模型、不落 localStorage；见第 5 节坑 7）
    cloudProfile.js             # ★ 云同步的前端唯一边界：`SYNC_KEYS` 白名单（15 个键）+ `collectProfile` / `applyProfile` + 四个接口封装（`requestCode` / `verifyAndSave` / `saveWithToken` / `fetchCloudProfile`）+ `postJson`（网络失败折成 `{success:false}`、失败带 `status` 以区分 401 与 400）。接口地址按平台分岔：网页版走同源相对路径 `/api/*`，Tauri 壳走 `https://www.998244353.best/api/*`（壳的资源协议不认 `/api`，理由与坑见 `docs/云端同步服务.md` 第 1 节，落地记录见 14.K）
    cloudEntry.js               # 云配置的**两条**入口：地址栏的 `/<handle>`，以及本机自己记住的那一位（2026-10-10 加）。`captureCloudHandleFromPath()`（启动时读 `location.pathname` 的 `/<handle>`）+ `confirmCloudEntry()`（启动那一次的总入口：地址里有 handle 就探一次云端到底有没有这份配置，据此决定要不要开设置页；**地址里没有就用存档里那位静默对齐**，见下面三条边界）+ `markCloudEntryHandled()` / `clearPendingCloudHandle()` + `writeCloudEntryPath(handle)`（2026-10-06 加，反方向）+ `readActiveProfile()` / `writeActiveProfile()` / `forgetActiveProfile()`（2026-10-10 加，`cp.cloudActive` 的读写）。三条边界：①地址里是**别人**（不是本机在跟的那位）时行为不变 —— 只登记、不自动套用、不自动登录、不写 `cp.cloudAccount` / `cp.cloudToken`；②存档那条路**只认「云端版本变过」**（`updatedAt` 与本机记着的一致就一个字节都不写；拆掉这道闸门会「套用 → 刷新 → 又套用」转不出去 —— 那次 reload 是无条件的，读 `applyCloudProfile` 的注释）；③对齐时地址栏**跟着走到 `/<handle>`（2026-10-10 加，与四条入口共用「地址 = 这套配置」这个语义）**，但只在**网页版的站点根路径**且**云端确实有这份配置**时才写：壳端的页面来自 `tauri://localhost` / `http://tauri.localhost`，改成 `/<handle>` 等于让壳的资源协议去找一个不存在的文件（一刷新就白屏），而壳里本来没有地址栏；`guide.html` / `privacy.html` 那类静态页同理（见 `isSiteRoot`）。这一行还必须排在 `applyCloudProfile` 之前 —— 那一步会 reload。「已答过」的记号写在 `history.state`（键 `cpCloudEntry`）、地址**保持原样不抹回根路径** —— 唯一例外是云端没有这份配置时（不打开设置页，地址 replaceState 回根路径 + `cloudEntryMissingHandle` 弹一句提示）。`writeCloudEntryPath` 是另一头：本机自己认下某个 handle（导入 / 上传 / 登录 / 下载到本机）之后把 `/<handle>` 写进地址栏并顺手打上同一个记号（读那两条注释：**一个只管自己写、一个只管不抹**，别把它们合成一条规则）。用 replaceState 不用 pushState；带点号的 handle 直接放弃（会和静态资源撞车）
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
   ├─ div.splitter                role=separator，键盘左右微调，单击折叠 / 展开
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

侧边栏页头左侧是**一枚面板胶囊开关 + 一颗设置钮**：胶囊整枚是一颗 toggle 按钮（点它任意位置都翻到另一个面板，切 `cp.sidebarTab`），里面两段分别是资源管理器与评测样例、当前所在的那段填亮；胶囊外那颗（2026-09-28 加，顶栏删除后从顶栏齿轮搬来）不切面板，而是开关编辑区里的设置页签（`settingsTab`，见第 5 节坑 7）。因为设置页签是编辑区的东西，关掉它时那颗齿轮的底色也跟着灭——它的状态由 `settingsTab.active` 决定，不走 `cp.sidebarTab`，但它填的是与胶囊选中段同一枚实心蓝（「填亮＝开着」一套语言；它在轨道外、是圆形，不会被误读成第三个面板）。

**开跑必亮结果**（2026-09-28 加）：运行入口有两处——`⌘/Ctrl + Enter`、评测面板页脚的运行按钮（编辑器页签栏右端那颗已于 2026-09-28 删除）——全都并到 `App.vue` 的 `runAll()` 这一个出口。`runAll()` 在通过「正在跑 / 没有用例 / 没有活跃语言」三道前置判断之后、真正开跑之前，会调 `revealTestsPanel()`：侧栏收起了就用 `togglePanel()` 展开（它顺带把 `virtualShare` 接回 `editorShare`，与双击展开同一套收口），然后 `sidebarRef.value?.showPanel('tests')` 切到评测样例。已经在评测样例上就是空操作，不会破坏页签持久化。**别把这段放到 `runAll()` 的前置判断之前**——那样点「停止」（同一个按钮，跑到一半时发的是中止）也会把侧栏弹出来。页签栏那颗按钮删掉之后这条路更关键了：侧栏收起时唯一的点击入口已经没了，`⌘/Ctrl + Enter` 是唯一还能「隔空开跑并把结果亮出来」的手段（无头回归 E 步走的就是它）。

切换栏目的入口（`SidebarSwitcher.vue`，2026-09 加）**不再单独占一行页签栏**，而是渲染在两个面板各自的页头里：同一时刻只有一个面板可见，所以视觉上只有一份，且两个页头里它都贴左——切过去之后按钮位置不动，可以连点。按钮**只画 logo 不写字**（多文件 = 资源管理器，带勾的清单 = 评测样例，齿轮 = 设置，见 `AppIcon.vue` 的 `files` / `cases` / `gear`），名字放 `title` 与 `aria-label`。

**两个面板的入口在 2026-09-28 定稿为「胶囊式开关」**，当天改了两轮，最终形态是这两条的合体：

- **视觉像分段控件**：两段图标并排住在一个圆角轨道（`.sidebar-switcher__pill`）里，**当前所在的那段填实心蓝**（`--accent` + `--text-on-accent`）。这守的是「有两个面板可切」，也是第一轮否掉「一颗只有去向往哪儿的动作钮」时提的要求。
- **交互是一颗 toggle**：整枚轨道就是那个 `<button>`，点它**任意位置**（含 2px 内边距、圆角内的边缘、当前段自己）都翻到另一个面板；两段是纯视觉的 `<span>`，不接点击、也没有 `tabindex`。这是第二轮的要求——两段各自可点会在胶囊里留下点不动的边。

所以**别把点击下放回某一段**，也别退回「一颗只有去向往哪儿的单钮」。文案写**将要去的那一个**（`title` / `aria-label` 都是「切换到评测样例」这种祈使句，跟着 `targetPanel` 变）。无头回归的 `sidebarSegActive` 读的是每段上的 `data-current="true"`（哪一段被标记成当前），`sidebarTabs` 读页头两个控件的 `aria-label`。另外「现在停在哪个面板」仍有一个更直接的机器可读出处：`.sidebar__panel[data-panel]`。面板状态是 `cp.sidebarTab`，只有 `Sidebar` 一份（经 `provide('sidebarTabs')` 下发），别让面板各存一份；胶囊外那颗（设置）读的是 `settingsTab.active`。

关键规则（`src/App.vue:513` 起）：

- `.workspace` 恒为 `row`，左右换边靠 `order`（编辑器 1 / 分隔条 2 / 侧边栏 3，左侧时对调），**DOM 不重建**（布局切换还有 View Transitions 动画）。**别改回 `row-reverse`**：那会把两栏一起甩到另一边，连侧边栏内部的滚动条方向都跟着反。
- 两栏 `flex-basis` 之和恒为 100%：编辑器栏拿 `editorShare%`，侧边栏拿 `100 - editorShare%`。若给两栏留出 basis 之外的剩余空间，会被 `flex-grow` 平分，分隔条就只以一半幅度跟手——**改这两条 basis 时要一起想**。
- `.pane` 是独立的圆角卡片（`border-radius: 8px; overflow: hidden`），让 Monaco 画布和面板头脚的方角被裁掉。
- `.splitter` 视觉 1px 细线、热区 12px（负外边距各压进卡片 4px，卡片净间距 4px）；折叠状态下热区加宽到 24px。触屏（`pointer: coarse`）下热区同样加宽到 24px，**但负外边距要同步从 -4px 改成 -10px**——两者一起改，分隔条在 flex 里才仍只占 4px，两侧卡片位置逐像素不变。**改净间距还要同步 `.splitter__dots` 的横向 padding**：那个抓手容器的底色条宽度必须正好等于净间距（现为 `padding: 3px 0.5px` + 3px 点宽 = 4px），宽了会溢到卡片边缘上、窄了遮不住身后的细线。
- `.splitter` 必须声明 `touch-action: none`。触屏手势的归属是浏览器在 `pointerdown` 那一刻定的：缺这行它就把这一拖当成滚动/缩放，随即发 `pointercancel`，而 `beginDrag` 的 `stop` 正挂在 `pointercancel` 上，于是手机上按下即被打断。`pointerdown` 里的 `preventDefault()` 挡不住（按规范它只抑制兼容的 `mousedown` / `mouseup`）。
- 折叠阈值在 `App.vue` 的拖拽逻辑里（贴边 32px 内折叠、离开边缘 60px 展开），改视觉宽度时注意别和阈值打架。
- **折叠到底后，侧栏里那层内容必须整块退出绘制**（`App.vue` 样式表里 `.pane--tests.is-collapsed:not(.is-animating) .pane__inner { visibility: hidden; opacity: 0 }`，2026-10-10 加）：折叠态那张卡只剩 1px，可里面的内容照旧排版，而且内容盒的左缘**就压在卡的左缘上** —— 凡是自带底色 / 外框的元素都会从这 1px 里透出一条竖线（用户报的就是文件树里选中那一行的 `--bg-hover` 底色 + 键盘焦点那道 1px `--focus` 蓝圈，改样式时别把它当成「卡片描边」）。三条别踩：① 判据必须带 `:not(.is-animating)`：收窄那 200ms 里侧栏是被「推拉门」推出去的、内容得一路可见（同一次动画里内容忽然不见，看着像卡了一下）；② 两条属性各有分工、**不能删任何一条** —— `visibility` 管「退出 Tab 序与无障碍树」（折叠着还能 Tab 进看不见的行，本来就说不通），但它是继承的、**后代写 `visible` 就能顶掉**（`TestCaseCard.vue` 的 `.card__fold > .card__body` 正是这么写的，实测折叠后仍有 21 个后代是 `visible`），所以还得压一条 `opacity: 0` 管「一定不画」；③ 两者都不能换成 `display: none` —— 它不进布局、不生成盒子，`getClientRects()` / `offsetParent` / ResizeObserver 会一起变（`syncSidebarPin` 与第 8 节的回归脚本都读这些），View Transitions 的新快照也会少一块。
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
    - **轻点那条拦 `mousedown` 来不及**：合成的 `mousedown` 在 `touchend` **之后**才来，那时系统已经决定重弹键盘了。所以两道都在 **`touchstart`** 断掉前提：`(isInEditor(current) || onInputBox) && (!keyboardUpAtTouchStart || (onInputBox && inNativeFocus(current)))`（`onInputBox = isInputBox(current) && !isTouchOn(event, current)`）→ `current.blur()` 并把 `focusBeforeTouch` 清成 `null`（滑动那条在判定为滑动时还有一次 `undoFocusChangeFromPan()`，见上）。
    - 清两种：**焦点在 `.monaco-editor` 里**（`isInEditor`，认 `.native-edit-context` / `textarea.inputarea` 的祖先）与**焦点在普通 `<input>` 里**（`isInputBox`；2026-10-01 扩，真机反馈「重命名框 / CF 抽题输入框收起键盘后轻点别处又被捞回来」，与编辑器同源）。焦点在卡片 `.ta`（textarea）上时**仍不动它**（滑动/轻点不该把用户的输入焦点扔掉，既有口径不变）。点编辑器文本时的重新聚焦不用管——那是 Monaco 自己的 Tap 干的，焦点本来就是这个入口给的。
    - 对 `<input>` 多一条 `isTouchOn`：**落点就在那个输入框里**（它本身 / 子节点 / 包着它的 `<label>`，如题目信息弹窗那种 `<label>` 包 `input` 的写法）就不清焦点——用户是想点回来接着打字（重命名框还挂着 `@blur` 提交，被抢跑连光标都点不进去）。**落手在框内、接着又滑起来**的那半段判不出是点还是滑，改在 `undoFocusChangeFromPan()` 里补一刀（`current === focusBeforeTouch && isInputBox(current) && !keepsFocusOnPan(current)`）。**但重命名框留了个口子**：它一失焦就提交改名，替它 blur 会把「拖选一段文字」变成「提交改名」、连选区一起丢，所以它自己标了 `data-keep-focus-on-pan`（见 `FileTreeItem` 的 `renameInput`），滑动时不动它——代价（用户已知情）是这种拖动收尾时键盘可能被系统重新弹起。**注意这条口子只覆盖「落手在框内」的滑动**：落手在框外、键盘收着时的 touchstart 那道闸照常清焦点（那是「轻点别处即失焦提交」的设计路径，落手那一刻分不出点还是滑）。
    - **键盘弹着时一概不碰焦点**（`keyboardUpAtTouchStart` 那道闸）：这时正确行为是保焦（点按钮、点输出区都不该收键盘），也正是「滑一下就收键盘」的老 bug 的修法。
    - **唯一的例外：CF 抽题面板整片走浏览器原生焦点**（`data-native-focus` 标在 `CfPickerPanel` 的根 `.cf-view` 上，判据 `inNativeFocus()`）。保焦是给「点按钮不收键盘」设计的，而这块面板的用户口径正好相反（2026-10-01 真机反馈两条：键盘自己的开关键把它收掉后轻点别处又弹；键盘弹着时点「抽取」/ 常用区间 / ON-OFF 不收）。所以面板内：
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

- **文件拖拽的触屏手势已真机验证通过**（2026-10-01）：实现是 `composables/useTreeDrag.js`（手势状态机 `press → armed → dragging`）+ `services/vfs/treeOps.js`（重名排成 `name-2`）。触屏那套（长按 450ms 进 armed、非被动 `touchmove` 按住滚动、行上 `touch-action: pan-y`、捕获阶段接管 `contextmenu`）已在真机上过了一遍：长按不动弹右键菜单、长按后拖动起拖且列表不跟着滚、拖到树上下边缘自动滚动、悬停折叠目录自动展开、拖动中系统的长按菜单不冒出来、松手那一下不误折叠落点目录。

## 4. 主题与 CSS 变量

- 主题落在 `<html data-theme="...">` 上（`App.vue:79` 的 watch），由 `base.css` 的变量接管；不带 `data-theme` 时即深色。
- Monaco 侧用同一批 id 的自定义主题（`src/monaco-setup.js`），`light` 的底色要和 `--bg-panel` 对齐，否则编辑区和面板会出现两块不同的白。
- 变量分组（`src/styles/base.css`）：

| 分组 | 变量 |
| --- | --- |
| 底色层次 | `--bg-editor` 页面留白 / `--bg-panel` 卡片面板 / `--bg-panel-head` 面板头脚 / `--bg-card`、`--bg-card-head` 用例卡片 / `--bg-chrome` 应用外壳（2026-09-28 顶栏删除后只服务于 `theme-color`） / `--bg-tab-active` / `--bg-tab-hover`（页签悬停底色，2026-10-10 加；**两套主题方向相反** —— 浅色比栏底压深 6 阶，深色比栏底提亮 6 阶，深色压暗会与选中色混为一类，见 base.css 注释。深色那支因此不能复用 `--bg-hover-soft`（只亮 2 阶、看不见）与 `--bg-hover`（亮过头）） |
| 浮层与控件 | `--bg-raised` 浮层底色（右键菜单 `ContextMenu` / 删除确认卡 `.confirm__card`，**已无抽屉**） / `--bg-control`、`--bg-control-hover` 按钮下拉 / `--bg-input` 输入框 / `--bg-hover` / `--bg-selection` |
| 描边 | `--border`、`--border-soft` / `--border-faint`（比 soft 再淡一档，只给折叠态图标栏 `ActivityBar` 那条常显的卡片边界用，2026-10-10 加） |
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
| `FileTreeItem.vue`（style@395） | `.tree-item` `.tree-item__row`（高 24px、`touch-action: pan-y`）`.tree-item__arrow` `.tree-item__icon`（`.is-cpp` / `.is-python` / `.is-markdown` 三色字标）`.tree-item__label` `.tree-item__dot`（未保存圆点）`.tree-item__input`（内联重命名）`.tree-item__error`，以及行上的状态类：`--dir` / `--active`（选中，`--bg-hover`）/ `--dragging`（被拖，淡到 0.5）/ `--drop`（合法落点）/ `--muted`（打不开的文件）/ **`--pressing` · `--armed`**（2026-10-10 加，触屏长按的两段反馈，见下）。子容器 `.tree-item__children` 的 `::before` 是那条层级范围线（`--drop` / `--active` 时换成 `--tree-guide-strong`）；展开动画 `tree-children-*` 的时长写在样式里、高度由脚本钉成实测 px。**触屏长按两态**（由 `useTreeDrag.js` 的 `pressingId` / `armedId` 驱动，**鼠标路径完全不经过**）：`--pressing` 是「还在等」——整行底色当进度条，`background-color` 从透明走 450ms `linear` 到 `--bg-hover`，**这个 450ms 必须与 `LONG_PRESS_MS` 对齐，改一边就得改另一边**（两处都留了注释）；`--armed` 是「已经就绪（原地松手 = 弹右键菜单，继续移动 = 拖走）」——`tree-press-pop` 播一次（220ms，`scale(1) → 1.04 → 1`，只动 `transform`、播完不留形变），底色换成 `--bg-hover`（**不带投影** —— 2026-10-10 按要求去掉，就绪感只靠「底色保持 + 跳一下」两件事表达）并一直留到松手或真的开始拖（开始拖时 `useTreeDrag` 会清掉它，改由 `--dragging` 表达）。两条别踩：① 两条都写成「元素 + 类」的**双类** `(0,2,0)` —— 单类 `(0,1,0)` 压不过 `.tree-item__row:hover` 与 `--active:hover`，而**触屏浏览器常在按下那一刻就补一个 `:hover`**，写成单类的话进度条一上来就被悬停色顶掉、根本看不见；② `arm()` 里必须把 `pressingId` 一起清掉（两态互斥）——漏掉的话 `--pressing` 那条 450ms 过渡会跟着留在行上，松手时整行要比别的行慢一拍才淡回去 |
| `TestCaseCard.vue`（style@202） | `.card[data-status]` `.card__head` `.badge[data-status]`（文字是 `verdict` 判定码，见第 5 节坑 1）`.metric` `.icon-btn` `.card__body` `.card__fold`（展开 / 折叠动画的外壳，**2026-10-06 新增**：grid 行高 `1fr ↔ 0fr` 过渡，正文的高度是活的、`max-height` 猜不出上限；折叠时正文的上下内边距也要收到 0，否则那 16px 不可压缩、卡片收不干净。原先 `.card__body` 上的 `v-show` 已删，改由 `.is-collapsed` 加 `visibility: hidden` 把正文移出 Tab 序） `.ta`（输入，高度随内容自增）`.out`（输出）`.run-zone`（撑满徽标到删除按钮之间的运行判定区，`.run-zone__icon` 才是那个 22px 的 ▶）。超长样例相关的 `.ta--truncated` / `.out.is-truncated`（只换底边为虚线，**只给真被截断的情形**，即 `xxxHidden > 0`；只是超出框高要滚动的那种字符一个没少，底边仍是实线）与 `.ionote` / `.ionote__text` / `.ionote__btn`（框下面那行提示：「还有 N 个字符未显示 + 复制全部」；**只在截断态出现** —— 纯溢出态一个字符都没少、没有「全部」可复制，这一行与虚线底边都不给；窄容器下靠 `.ionote:has(.ionote__btn)` 把输入框那行与输出块那行区分开）见第 5 节坑 26。框内的截断标记**没有文案**，就是 `MARKER_SEED = '\n\n……'`。旧的 `.hint` 已随 2026-09-18 改动删除 |
| `EditorTabs.vue`（style@106） | `.editor-tabs`（`flex: 0 0 35px`）`.editor-tabs__strip`（`flex: 1 1 auto; min-width: 0`，**横向滚动在这里**，现在铺满整行）`.editor-tabs__item[--active]` `.editor-tabs__dot` `.editor-tabs__label` `.editor-tabs__close`（「设置」合成页签与文件页签共用这套样式）。原 `.editor-tabs__run`（64×25 的运行 / 停止按钮，以及它的 `.is-running`）2026-09-28 已随按钮一起删除。**页签互不描边**（2026-10-10 去掉原 `border-right: 1px solid var(--border-soft)`）：相邻页签之间没有竖线，三种态全靠底色 + 文字色区分 —— 静止「透明底 + `--text-dim`」/ 悬停 `--bg-tab-hover` / 选中 `--bg-tab-active`；`border: none` 必须留着 —— 全局 `button` 样式带着边框，删掉会露出系统描边。**悬停与选中都是底色**（2026-10-10 定稿；同日先后走过「下沿一条 1px 细线」「细线上浮到顶端变蓝」两版，两版都已删净 —— 页签上不再有任何会移动的东西）：点选看见的动画就是基类那两行 `transition: background-color / color 150ms` 上的底色淡入（顺带文字转亮）。三条别踩：① `.editor-tabs__item--active:hover` 那一条**不是冗余** —— `:hover` 按类级计 `(0,2,0)` 高过单写 `--active` 的 `(0,1,0)`，少了它，鼠标停在当前页签上会被涂成悬停色；② 两套主题的**方向相反、而且是有意的**（浅色比栏底压深 6 阶 `#f3f3f3 → #ededed`；深色比栏底**提亮** 6 阶 `#222225 → #28282b`）—— 深色里再压暗会被读成「凹进去」，还会与选中色 `--bg-tab-active`（`#181818`，同样比栏底暗）撞成同一类；浅色里反过来「提亮等于没有」。取值与理由都在 `base.css` 那两条注释里，**别再以「两套主题该同构」为由把任一支翻回去**（用户为此来回改过一次）。〔2026-10-10 更正：这里原先写的是「两套都是压深、深色 `#1c1c1f`」—— 那是 `5a9fe06` 把它改成提亮之前的旧值〕；③ 悬停底色是**不透明**的，会连带盖掉 `.editor-tabs__strip` 抹在底边那条 1px `--border-soft`（原本只有选中页签会盖住它，见下面「选中页签与编辑区连成一片」）。**拖动排序**（2026-10-10 加）：按住页签横向拖，松手换位 —— 手势与落点判据全在 `composables/useTabDrag.js`（只排**文件页签**，认 `data-tab-id`；视图页签恒定排在后面，理由见该文件头与坑 7），壳只提供根元素、转交 `@pointerdown`、渲染拖拽态。三个类：`.editor-tabs__item--dragging`（被拖那张，留在原位压暗 0.4）、`.editor-tabs.is-dragging`（根容器，抓取光标 + `user-select: none`，并靠 `.editor-tabs.is-dragging .editor-tabs__item:not(.editor-tabs__item--active):hover` 把沿途页签的悬停底色压回透明 —— **`:not` 不能省**，那条特异性 `(0,5,0)` 高过 `--active:hover` 的 `(0,2,0)`，不排除会连当前页签的选中底色一起抹掉）、`.editor-tabs__indicator`（插入指示条，**根容器的直接子元素**、`position: absolute`、2px `--focus` 竖线，`left` 由 JS 写成相对根容器左缘的 px）。两条别踩：① 指示条**不能放进 `.editor-tabs__strip`** —— 那是横向滚动容器，放进去得再补一个 `scrollLeft` 且自动滚动每帧重算，两个偏移量必然对不齐；② 拖动中**不改 `openTabIds`**，只在松手那一刻提交（中途改会让被拖那张也吃一次 `.tab-move` 补间），落盘走 `workspaceStore.moveTab(id, insertIndex)`，`insertIndex` 是「**去掉被拖项之后**」的下标。**触屏适配**（2026-10-10 补，用户报「拖动标签页没有对触摸屏做适配」—— 手势状态机本身没坏，缺的是下面三件**只在真机上现形**的事）：① **页签上的三条声明** —— `touch-action: pan-x`（**不能写 `none`**：条带是横向滚动容器，写 none 之后手指在页签上就再也滚不动页签条；也不能用这条来「按住不滚」，那是 `useTabDrag` 非被动 `touchmove` 的活）、`user-select: none` / `-webkit-user-select: none` / `-webkit-touch-callout: none`（长按起手那 450ms 里不许选中标签文字 —— iOS 一旦进入选词就会连 callout（放大镜 + 菜单）一起弹出来，拖拽当场变成选词）。与文件树行 `.tree-item__row` 的 `touch-action: pan-y` 同源、方向相反；② **`contextmenu` 从按下那一刻就接管**（`useTabDrag` 的 `onContextMenuBlock`）—— 各家系统长按菜单的阈值大多在 500ms 上下，与这 450ms 贴得太近，等 `arm()` 再拦晚了一步（菜单会在拖拽中途弹出来、还要等下一次点击才关掉）；非被动 `touchmove` 也一并**提前到按下时就挂**，但只在 `armed / dragging` 时 `preventDefault` —— 早挂是因为「浏览器在 touchstart 那一刻就决定了这次手势要不要等 JS」，**挪回 armed 再挂就不保证拦得住**；而没 armed 时不拦，所以「短滑滚页签条」照旧是原生横滚（第 8 节触屏专项第 2 条守着这条）；③ **长按两段反馈** `--pressing`（450ms `linear` 底色进度 → `--bg-hover`）/ `--armed`（`tab-press-pop` 弹一次、底色保持到松手或开始拖），与文件树同款。**用 `--bg-hover` 而不是页签自己的 `--bg-tab-hover`** 是实拍量出来的：那一档只比栏底差 6 阶、进度走到一半实测只有 3 阶，等于没有反馈；也不能用 `--bg-tab-active`（深色下方向相反，还会被读成「这个页签被选中了」）。这两条必须写成「元素 + 类」**双类** `(0,2,0)` 并排在 `--active` **之后**：触屏浏览器常在按下那一刻补一个 `:hover`，单类会被 `--active:hover` 顶掉（长按当前选中那一张时进度色会整个被顶掉），同为 (0,2,0) 靠源序取胜。⚠️ **这三条在无头探针里一条都测不出来**：`Input.dispatchTouchEvent` 那类合成事件不跑浏览器的手势识别器（`contextmenu` / `selectstart` 永不触发、触屏那份 `:hover` 也不补），只能靠「派发 `cancelable` 的合成事件看 `defaultPrevented`」或上真机 —— 见坑 30 与第 8 节触屏专项 |
| `EditorPane.vue`（style@231） | `.editor-pane` `.editor-pane__stage` `.editor-pane__host`（Monaco 容器）`.editor-pane__empty*` `.editor-pane__status*` |
| `EditorSettingsPanel.vue`（style@837） | `.settings-view`（滚动容器，`container-type: inline-size` + `container-name: settings`，窄宽降级靠它而不是视口断点）`.settings-view__inner`（**默认单列**，编辑区 ≥35rem 时才升级成目录 + 内容两栏，见坑 7）`.settings-nav*`（分类目录，8 项，`--active` 是选中项；宽面板下是左栏、窄面板下是顶部横向标签条）`.setting-group*` `.setting-subtitle`（组内小标题，把「运行时限」与「评测引擎」分开）`.setting-group__note`（分组说明文字，如「应用」组那句）`.setting-row`（**不画行边框**，靠内边距 + `:hover` 底色划分边界；`.is-modified::before` 是左侧 3px `--accent` 「已改动」线）`.setting-row__main` / `__head` / `__label` / `__key` / `__hint` / `__control`（标题 / 键名 / 描述三级灰度：`--text` / `--text-faint` 等宽 / `--text-dim`）`.setting-row--select` / `--number`（上下结构，控件在左下）`--switch`（左右结构，开关靠右上）`--action`（左右结构，按钮 / 录制框居中在右）`.select` `.number-input` `.switch*` `.runtime-list` `.runtime-row*` `.runtime-row__actions`（已就绪时右侧「已就绪 + 卸载」两颗的容器）`.download-button*`（本地运行环境下载 / 卸载 / 「应用」组安装按钮 / 扩展包下载共用；`.is-uninstall` 悬停才转危险色）`.shortcut-key`（插件快捷键只读键位徽标，与 `HotkeyRecorder` 的 `.hotkey` 同观感；**字体必须用 `--ui-font`**，见下）`.setting-code`（行内代码，如 `chrome://extensions/shortcuts`）`.is-spinning`，以及卸载确认弹窗那一组 `.confirm*`（与 `FileExplorer` 同款，Teleport 到 body，见坑 23）（铺满编辑区的设置视图；原 `.panel-drawer*` / `.icon-button*` / `.done-button*` 已随抽屉外壳一起删掉） |
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
4. **localStorage 里存的是 JSON 字符串**：`cp.panelPosition` 的值是 `"left"`（带引号）。直接比较原始字符串会误判。
5. **统一侧边栏里全是 `v-show`**：整栏折叠（分隔条要能用鼠标/键盘把它拖回来）、栏内两个面板的切换，都不能改成 `v-if`——文件树的展开状态与样例里手填的输入都挂在 DOM 上，切换一次就被销毁重建，用户数据直接丢。副作用有两个：（a）「页签内容在 `display: none` 期间量不到尺寸」，凡是靠 `scrollHeight` / 宽高做自适应的组件（如 `TestCaseCard` 的输入框自增）都得自己接住「从不可见变为可见」那一刻，见坑 8；（b）切换按钮（`SidebarSwitcher`）在两个面板的页头里各有一份实例，**按选择器取它时必须先落到「当前可见的那个 `.sidebar__panel`」里**（用 `getClientRects().length > 0` 判可见），否则会同时拿到隐藏那份，脚本/断言会凭空多出一倍。（c）**同一原因让「跨这两个实例的运动」做不了 `transition`**：点一下就是把刚点的那份藏了、另一份亮出来，高亮不是同一个元素在动，`transition` 永远看不到。胶囊的滑动高亮（`SidebarSwitcher` 的 `sidebar-indicator-from-*`，挂在选中段的 `::before` 上、段本身不参与位移）因此用 `animation` ——元素从 `display: none` 变成可见时动画会从头播；并用 `[data-switched]` 挡掉首屏那次（首屏同样是「从隐藏变可见」，可那时并没有发生任何切换）。两份胶囊在屏幕上的位置完全相同，所以「新亮出来的那份从旧位置滑过来」看起来就是同一枚高亮在横移。
6. `@media (prefers-reduced-motion: reduce)` 会全局压掉动画，新增动画不用额外处理。
7. **「设置」是编辑区里的一个合成页签，不是抽屉**（`src/services/settingsTab.js`）：它刻意**不进** `workspaceStore.openTabIds`——那边的 `openTabIds` / `nodeIndex` / 会话恢复全建立在「一个页签 = 一个真实 VFS 节点」之上，塞一个没有节点的 id 进去，`rebuildTree` 会把它当「文件已删除」顺手清掉，`modelManager.release` 也会去找一个不存在的 model。所以它不建模型、不落 localStorage（刷新后回到代码文件是预期行为）。视图与 Monaco 用 **`v-show` 互斥**（不是 `v-if`）：Monaco 实例与设置组件的运行环境探针订阅因此只建立一次。让出激活态统一收口在 `settingsTab.js` 里 `watch(() => workspace.activeId)`；「点已经在活跃的那个文件页签」不改 activeId、不触发该 watch，所以 `EditorTabs.activate()` 里显式再让一次。（「本地运行环境」原先是独立抽屉 + `composables/useLocalRuntime.js`，现两者都不在仓库里了——运行时 UI 已并进设置视图。）设置视图自身**默认单列**（目录折成顶部横向标签条、内容在下），编辑区够宽时才升级成**「目录 + 内容」两栏**（2026-09 建，2026-10 反转默认值）：`.settings-nav` 是分类目录（常用设置 / 外观 / 编辑器 / 快捷键 / 评测 / 云端同步 / 应用 / 帮助，`SECTIONS` 常量驱动），内容区同一时刻**只渲染一组设置**（`v-if` / `v-else-if`，不是 v-show 平铺），当前分类存在组件内的 `activeSection` 里（不落盘，关掉页签再打开仍记得）；切到「应用」那一栏会顺带 `refreshExtension()` 重探一次扩展状态（`watch(activeSection)`）。原顶栏的「评测引擎设置」弹层与「帮助」抽屉（`HelpPanel.vue`）在 2026-09-28 都并进了这里：引擎列表 / 服务地址 / 自检成为 `EngineSettingsPanel.vue`，挂在「评测」组的「运行时限」下面（`.setting-subtitle` 分开两块）；帮助的问答列表成为「帮助」组，`HelpPanel.vue` 已瘦身成纯内容组件（无按钮 / 无 Teleport / 无 Esc 逻辑）；「应用」组装 `useInstallPrompt()` 的安装按钮（原顶栏那颗）；「快捷键」组是 2026-09 新加的（见第 13 节）；「浏览器插件」原先也是独立一组，2026-10-01 与「本地运行环境」一起并入「应用」。宽度判断不靠 `@media`（设置视图活在编辑区里，视口宽是错的代理），而是在 `.settings-view` 上挂 `container-type: inline-size` + `container-name: settings`，用 `@container settings (min-width: 35rem)` 把默认的单列升级成两栏（阈值与目录项字号都是 rem，全局缩放后目录与内容都会变大、要更早翻回竖排）。**方向必须保持「默认单列 + `min-width` 升级」，别改回「默认两栏 + `max-width` 降级」**：生产构建会把 `max-width` 压成区间语法 `width<=35rem`，不支持它的浏览器（荣耀自带浏览器实测，2026-10）整条查询匹配不上、直接回落到基线两栏，手机上就被挤成两列；反着写的话认不认容器查询都落在安全的一列（代价是不支持的浏览器上永远吃横条目录，可接受）。
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
14. **文件树的右键事件必须 `.stop`**（`FileTreeItem.vue` 的 `@contextmenu.stop="onContextMenu"`）：树根 `.explorer__tree` 上也挂了一个 `@contextmenu`（`onTreeContextMenu`，负责屏蔽空白处右键的原生菜单），而节点的右键**会冒泡到树根**——不 `.stop` 的话节点菜单会被树根那一次覆盖掉，症状是「右键文件/文件夹没反应、右键空白处反而正常」。菜单项在 2026-09-28 变成「题目信息（仅文件）」/「新建文件 · 新建文件夹（仅目录）」/「重命名」/「删除」，2026-09-29 又给有 `meta.url` 的文件加了「打开题目链接」（`problemUrl()` 只放行 http / https），2026-09-30 它与「题目信息」对调、改排在前面——目录上那两项是**刻意加回来**的：新建的目标目录可以是任意目录，而页头按钮只能跟随聚焦节点、表达不了「建在哪个目录」（见坑 12）。
15. **判题语言没有独立状态，由活跃文件的扩展名派生**（`App.vue` 的 `activeLanguage`）：2026-09-28 顶栏整体删除时那颗语言下拉也一并删了，`cph.language` 随之成为死键（见第 6 节）。现在 `runAll()` / `runOne()` 直接拿 `activeLanguage` + `activeNode.path` 调 `wasmRuntime.runCase()`（`.py` 走解释分支、其余走 C++ 分支），`workspaceStore.initWorkspaceStore()` 里那句 `openLanguage()` 只剩「首次启动给 `/main.cpp` 兜底」这一个作用。**别把语言选择器加回来**——它与「一个页签 = 一个真实文件」这套模型天然冗余，加回来就得再造一份语言状态去和活跃文件抢口径。想加「新建 Python 文件」入口也不用碰状态层，改 `FileExplorer` 的默认名规则即可（见坑 12）。
16. **语言图标有两处不能随手改的地方**（`AppIcon.vue`）：图标分两张表——`PATHS`（24×24 描边线性图标，主力）与 `SOLID_PATHS`（整块实心路径，`fill: currentColor` 且不描边，`solid` 由 `name in SOLID_PATHS` 判定）；另有 `VIEWBOX` 表存放「不在 24 网格上」的图标的专用方框（模板是 `:viewBox="VIEWBOX[name] ?? '0 0 24 24'"`，目前只有 `cpp` 一项）。C++ 用的是 seti-ui 的 `icons/cpp.svg`（MIT）——**VS Code 默认的 Seti 文件图标主题**（字形 `\E01A`，Seti 配色 `#519aba`）用的就是它，2026-09 从 simple-icons 那枚实心六边形字标换过来（那个在 15px 下糊成一团）。两个坑：
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
20. **扩展安装包靠文件名换版，不靠 `SHELL_VERSION`**（`EditorSettingsPanel.vue` 的 `EXTENSION_VERSION` / `EXTENSION_FILE`）：`public/extension/` 下的 zip 不在构建清单里，而 SW 对同源 GET 走 `cacheFirst` 且**不重新校验**——原地覆盖同名文件，老用户会一直下到缓存里的旧包。所以发新版必须换文件名（`cc-for-web-2.65.3.zip` → `...-2.66.0.zip`），同步改这两个常量 + `cph-companion` 的 `package.json` 版本号。也**不要**把它塞进 `STATIC_ASSETS`（那会每次 install 都预缓存一份几百 KB 的包，而它只在用户点「下载」时才需要）。
21. **全局快捷键挂在 `window` 的捕获阶段，且录制期间必须让路**（`useShortcutManager.js` + `App.vue` 的 `onKeydown` + `HotkeyRecorder.vue`）：`window.addEventListener('keydown', onKeydown, true)` 里 `preventDefault()` + `stopPropagation()`——Monaco 的键位服务挂在编辑器内部 DOM 上，捕获是从外往内走，只有这样才能抢在它前面，编辑器里也归这套表管（顺带把 `Ctrl/⌘+Enter` 原本「在下方插入一行」的内置行为一并挡掉）。反过来，`HotkeyRecorder` 的 keydown 在按钮的目标阶段，而捕获永远先跑，所以**开录时必须置 `recordingActive = true`**、`onKeydown` 见到它就 return，否则录入组合键的瞬间功能会先被执行一遍。同理，`event.isComposing` 期间一律不处理（拼音选词不能被当成命令）。**不要**改回 `editor.addCommand()` 同步键位：Monaco 0.56 的 `ICodeEditor` 只有 `addCommand`、没有 `removeCommand`，改过键之后旧的撤不掉，会出现「新键不跑、旧键反而跑」。
22. **组合键内部串用 `event.code`，且必须挡住浏览器原生键**（同上）：用 `event.key` 对不上——Alt 组合在 macOS 上会把 key 变成特殊字符（Alt+B 是 `∫`）、Shift 会把 `Digit1` 变成 `!`。内部写法固定为 `Mod+Ctrl+Alt+Shift+<code>`（顺序固定、必带键码），所以字符串相等就是精确匹配，`Ctrl+B` 与 `Ctrl+Shift+B` 天然不会互相误触；`Mod` = 平台主修饰键（macOS 是 ⌘，其它平台是 Ctrl），macOS 上还要单独有 `Ctrl`。另外 `BROWSER_RESERVED` 那张表（`⌘W` / `⌘T` / `⌘R` / `F12` 等）要在**录制阶段**就拒绝并给红字原因：这些组合由浏览器 UI 层直接吃掉，`preventDefault()` 无效，绑上去只会得到一个永远不触发的快捷键。裸键只放行功能键与 `Esc`（`SAFE_BARE_CODES`），其余一律要求带修饰键，否则打字时会不停误触发。
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
    - **样式：底边虚线，不是整框虚框**。框能打字，整框虚线会被读成「这里不能编辑」；`.ta--truncated` / `.out.is-truncated` 只把 `border-bottom-style` 换成 `dashed`，**边框色必须从 `--border-soft` 提到 `--border`**——1px 虚线在浅色主题下没有对比度就等于没画（这条踩过两次，`.ionote__btn` 的边框同理）。说明行的文案是「还有 N 个字符未显示」（2026-09-29 删掉了后半句「· 全选可复制全文」——那句是在解释「全选能拿到全文」，而「复制全部」按钮的 `title`（`tests.card.copyFull`）里已经说了一遍，提示行再说一次是噪音），窄容器（`@container (max-width: 15.625rem)`）下只让文字让位、按钮留下。**框内不再重复这个数字**：框里那行标记就是一个 `……`（它本来就要滚动才看得见，写两遍数字是噪音），数字统一由下面那行承担。
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

## 6. 已持久化的状态（加设置项时照抄这套）

| key | 内容 | 位置 |
| --- | --- | --- |
| `App.vue`（`EDITOR_SETTINGS_KEY` / `readEditorSettings()` / `updateEditorSettings()`，约 38–112 行；定义在 `services/editorOptions.js`） | `cp.editorSettings` + `cp.editorSettingsVersion` | 编辑器偏好共 23 项（主题、字体族 / 字号 / 行高 / 连字、Tab 宽度 / 空格代替 Tab / 自动换行 / 换行列宽、光标样式 / 闪烁 / 平滑移动、当前行突出、空白字符、缩略图、括号对着色 / 缩进参考线 / 括号参考线、粘性滚动 / 滚过最后一行 / 平滑滚动、内边距、滚动条粗细）。**默认值、可选项表、逐键校验、偏好 → Monaco 选项的映射全部在 `src/services/editorOptions.js` 一处**，面板下拉、读盘校验、Monaco 吃到的选项三者共用，加新项只改这一个文件（面板加一行描述即可，见 `EditorSettingsPanel.vue` 的 `EDITOR_GROUPS`）。`Version` 只用于一次性换主题 id：v3 之前是 Monaco 原生 id（`vs-dark` / `vs` / `hc-black`，原本选浅色 `vs` 的迁到浅色），v4（2026-09-29）起主题 id 去掉 `cph-` 前缀、旧存档的 `cph-light` 照样认；认不出的旧值一律交给白名单丢掉、回落到默认深色。**这个计数器只管主题这一件事，不参与其余键** |
| `cp.panelVisible` / `cp.panelPosition`（`App.vue:31-33`） | 统一侧边栏是否展开 / 侧边栏在左还是右（键名是历史沿革，语义已从「测试面板」扩到整栏） |
| `cp.sidebarTab` | 侧边栏当前面板（`explorer` / `tests`），认不出来的值一律退回 `explorer`。**没有 `settings`**——设置页签刻意不落盘（见第 5 节坑 7） | `Sidebar.vue`（页头里的 `SidebarSwitcher` 只是消费方，经 provide 拿状态） |
| `cp.editorShare`（`App.vue:35`） | 两栏比例（%） |
| `cp.timeLimitMs`（`App.vue:40`） | 全局时限（毫秒，只计运行段）。**它只是「题目没带时限时的默认值」**：活跃文件的 `meta.timeLimit` 非 0 时优先用它（`App.vue` 的 `effectiveTimeLimitMs`） |
| `cp.uiScale`（`App.vue:49`） | 全局界面缩放比例，默认 `DEFAULT_UI_SCALE = 1`（100%；2026-10-01 由 1.1 改来，同时去掉了默认档那枚「（默认）」后缀，档位显示只剩百分比），只认四档 `1` / `1.1` / `1.25` / `1.5`（认不出来退回默认档）。读盘经 `normalizeUiScale()` 校验；`applyUiScale()` 把它写成 `document.documentElement.style.fontSize`（`16 × scale` px），并在 **setup 期**就落地（早于首帧，不会先按 100% 画一帧再跳）。档位表与 `px()` 都在 `composables/useUiScale.js`；设置页「外观」组的「界面缩放」下拉是它的消费方（prop / emit 贯穿 `App → EditorPane → EditorSettingsPanel`）。见第 5 节坑 24 |
| `cp.selectedNode` | 文件树里选中的那一行（文件 / 目录的节点 id）；`null` = **选中根**（整棵树都不高亮，页头「新建文件 / 文件夹」落在根）。恢复放在 `initWorkspaceStore()` 最后一步、节点消失时由 `rebuildTree()` 回落 `null`。**刻意不进云同步白名单**——存的是本机 VFS 节点 uuid，同步到别的设备只会指向不存在的节点。 | `services/vfs/workspaceStore.js`（`SELECTED_KEY` / `selectNode()`） |
| `cp.uiLocale` | 界面语言，取值 `zh-CN` / `en`（`i18n/index.js` 的 `LOCALE_STORAGE_KEY`，**权威定义在那一处**）。**刻意不走 `usePersistentRef`**：界面语言必须在任何组件挂载之前定下来（首帧不能先闪中文再跳成英文），所以 `i18n/index.js` 自己同步读写 localStorage。**没有存档时跟随浏览器**（`navigator.languages` 任一命中 `/^zh\b/i` → `zh-CN`，否则 `en`）——注意「跟随探测」的结果**不写回存档**，「跟随浏览器的默认」与「用户显式选过」是两件事，别在首帧替用户落一个值。设置页「外观」组的「界面语言」下拉是唯一写入方，切了当场生效、不重载 | `src/i18n/index.js`（消费方散布在全仓，读的是 `locale` 这个 ref） |
| `cph.drafts`（**只读的老键**：仅由 `vfs/migrate.js` 建工作区时搬进 `/main.cpp`、`/main.py`，应用其余部分一概不读写）/ `cp.testCases` / `cp.engine` / `cp.judgeBases`（`App.vue:36-37` 与用例段） | 各语言草稿、用例、引擎、服务地址 |
| ~~`cph.language`~~ | **已作废**（2026-09 顶栏语言下拉移除后成为死键，全仓不再读写）；残留在 localStorage 里无害。判题语言现在一律由活跃文件的扩展名派生，见第 5 节坑 15 | — |
| `cph.mobileKeyboard` / `cph.mobileInputDock` | 都已作废（两个版本的键盘适配都不再持久化）；残留在 localStorage 里无害 | `composables/useMobileKeyboard.js` |
| `cp.localRuntime.clangReady` / `cp.localRuntime.pythonReady` | C++ / Python 本地运行时是否已拉取。**只作首帧播种，不是权威判据**：权威判据是 `wasmRuntime.probeRuntime()`（内存已加载 → SW Cache Storage → HTTP 缓存 `only-if-cached` 探针，全程不触网）；**探的时机只有一个**——`EditorSettingsPanel` 的 `watch(() => props.active)` 在切到设置视图时调一次 `reconcile()`（页面加载、任务状态推进时都**不**探：`only-if-cached` 未命中会在控制台记一条 `ERR_CACHE_MISS`，页面一加载就探等于白刷一屏红字）。标记过期（缓存被清）或缺失（直接跑代码落了缓存）都会在那一刻被正回来 | `EditorSettingsPanel.vue`（本地运行环境分组；下载走 `wasmRuntime.preload(language)`） |
| `cp.localRuntime.markdownReady` | **题解渲染器**（katex + marked）是否已拉取。与上面两条同一个键前缀、同一套「首帧播种 + 探针校正」的口径（权威判据是 `probeMdRuntime()` 的 Cache Storage 探针）。它在**设置面板那一行**与**预览面板的「下载渲染器」**之间共用，否则从预览下的那一次，下次打开设置会先闪一下「未下载」 | `services/mdRuntime.js`（`MD_READY_FLAG_KEY`） |
| `cp.mdView` | 题解的**视图模式**：`{ mode, fullscreen }`（`edit` / `split` / `preview` + 是否全屏）。**刻意不走 `usePersistentRef`**：App 在 setup 期（首帧之前）就得知道该不该把侧栏收起来。旧存档是一个字符串（`'fullscreen'` 等），读盘时换算，认不出来一律回默认 `edit` | `services/mdView.js`（**不是**组件；与 `settingsTab.js` 同一体例的模块级单例，区别是这份要跨会话记住） |
| `cp.pchUnsupported` | 本机被判定扛不住 PCH（生成时 OOM / cc1 卡死，或 PCH 加载校验失败）后写下的永久开关；有它就不再生成、编译也不再挂 PCH | `runnoSandbox.js` |
| `cp.shortcuts` | 全局快捷键：动作 id → 组合键串（`{"run":"Mod+Enter", …}`，内部写法见第 5 节坑 22）。**刻意不走 `usePersistentRef`**——那个 composable 靠 `onMounted` 播种首次写入、必须挂在组件上，而这份状态要在任何组件挂载之前就能被读到（App 的全局 keydown 与 EditorPane 的状态栏提示都要用），所以 `useShortcutManager.js` 里直接读写 localStorage。读盘以默认值打底再套已存键：以后新增动作时老用户自动拿到它的默认键，已删动作与手改坏的值自然丢掉 | `composables/useShortcutManager.js` |
| `cp.fileTemplates` | 模板功能的**用户覆盖表**：`{ [语言]: 文本 }`，只存改过的语言（`''` 是合法覆盖 ＝ 新建时留空）。内置三份在 `services/templates.js` 的 `BUILTIN_TEMPLATES`（cpp / python / markdown），取用户值一律 `overrides[id] ?? builtin`、判型一律 `typeof === 'string'`，**绝不能用 `||`**（空串会被当成「没改」）。**刻意不走 `usePersistentRef`**——要在任何组件挂载之前被读到（新建文件时取模板），所以 `services/fileTemplates.js` 自己读写 localStorage，并在**模块加载时先 persist 一次**让键恒存（空表 `{}`）：`applyProfile` 只写云端存在的键，键缺席就会让「下载干净配置」清不掉别机的自定义。**在白名单里**（跟人走） | `services/fileTemplates.js`（`FILE_TEMPLATES_KEY` / `templateForPath`） |
| `cp.fileTemplates.enabled` | 模板功能的**总开关**（`'1'` / `'0'`，默认开）。与覆盖表**刻意分成两个键**：覆盖表是「内容」、开关是「偏好」，合成一个键就会逼出「关掉时得清空覆盖」这种毁用户东西的做法。读盘只认显式的 `'0'` 为关（缺省 / 存档损坏 / 隐私模式一律按开），同样**模块加载即落盘**让键恒存，理由与上一行一致。闸门只设在 `templateForPath()` 一处（新建文件与抓题都走它）。**在白名单里** | `services/fileTemplates.js`（`FILE_TEMPLATES_ENABLED_KEY` / `setTemplatesEnabled` / `templatesEnabled`） |
| `cp.cloudActive`（2026-10-10 加） | **本机现在跟着谁的云端配置**：`{ handle, updatedAt }`，`updatedAt` 是**已套用过的那一版**云端的更新时间（空串 = 不知道，于是下次打开一定会对齐一次）。启动时地址里没有 `/<handle>` 就用它去对齐那一份 —— 这就是「下次打开网站直接用它那一套」。写入点：四条认下 handle 的入口（导入 / 上传 / 登录 / 下载到本机，与 `writeCloudEntryPath` 同四处；上传两处直接调 `writeActiveProfile`、其余走 `adoptCloudProfile`）+ **解绑时删掉它**（`forgetActiveProfile`：留着的话下次打开站点会把刚解绑那位的配置又套回来）。**门闩就是 `updatedAt`**：与云端相同则一个字节都不写 —— 拆掉它等于「每次打开都覆盖本机 + 套用→刷新→又套用」的死循环（那次 reload 是无条件的），改这里前先读 `cloudEntry.js` 的 `applyCloudProfile`。**刻意不进云同步白名单**：它是「**这台设备**在跟谁」的事实，同步过去等于让另一台设备自动套用一份它从没认领过的配置。**顺带把地址栏补成 `/<handle>`（2026-10-10 加）**：启动对齐时若当前是网页版的站点根路径、且云端确实有这份配置，地址就写成 `/<handle>`（此后可收藏 / 可分享）——两道闸门见 `cloudEntry.js` 的文件头，壳端与静态页都不能写 | `services/cloudEntry.js`（`readActiveProfile` / `writeActiveProfile` / `forgetActiveProfile`；键名定义在 `services/storageNames.js` 的 `CLOUD_ACTIVE_KEY`） |

另外 PCH 二进制（约 6.9MB）存 IndexedDB 而不是 localStorage：库名 `cp-pch`（2026-10-01 从 `cph-pch` 改名；`pchStore.js` 打开库时会把旧库静默删掉——PCH 是缓存，下次编译自己会重建）、store 名 `pch`，记录形状 `{ id, bytes: Uint8Array, size, createdAt }`；`id = 存档版本:工具链版本:微缩头内容的 FNV-1a 哈希`（当前是 `1:8.0.1:69dc7cd9`），三者任一变化旧存档自然失效，取存档只按这个 id。

工作区文件树也存在 IndexedDB（不是 localStorage）：库名 `cp-vfs`（2026-10-01 从 `cph-vfs` 改名，旧库由 `LocalVFSProvider` 的 `migrateLegacyDb()` 一次性搬运：只在新库 `nodes` 表确实为空时把旧库整条搬过来，读失败就保留旧库下次再试）、两个 store `nodes` / `contents`（`LocalVFSProvider`），`nodes` 里就是整条 `VFSNode` 记录（`id / name / type / path / parentId / createdAt / updatedAt`），2026-09 给文件节点加了可选的 `meta`（题目链接 / OJ / 难度 / 日期 / 时限，见第 5 节坑 17），2026-10-01 又加了 `config`（抓题结果原文：`tests` 样例、`oj`、原始 `timeLimit` 等）。**两个都是记录里的可选字段，不是新 store、也不动 `DB_VERSION`**——旧记录没有就按「没有」处理，纯向后兼容。

导入的题目与用户自己建的文件**共用同一套存储**：题目信息与样例直接挂在代码文件节点上（`meta` / `config`），代码文件也只是一条普通记录，没有「题目专用表」这种东西。所以题目目录的搬移 / 重命名 / 删除走的都是既有路径，不需要为扩展另写存储。

写值统一走 `usePersistentRef(key, defaultValue)`；`editorSettings` 因为要版本迁移，单独用 deep watch 存。加编辑器设置项时**必须**两道校验都过：读盘（`readEditorSettings()`）与面板回写（`updateEditorSettings()`）都逐键走 `editorOptions.js` 的 `normalizeEditorSetting()`，不在默认值表里的键直接丢弃、越界数字退回默认——所以 localStorage 里手改出来的 `fontSize: 999`、认不出的 `cursorStyle`、乃至早已移除的旧键都不会漏进编辑器。

**唯一不落站点 localStorage 的「设置项」是扩展的投递目标两个开关**（设置 → 应用 › 浏览器插件）：真值存在扩展自己的 `chrome.storage.local` 里，站点这边只有一份内存镜像（`useCompanionBridge` 的 `extensionInfo.config`，随 `cp-ping` 握手刷新）。所以别按上面这套给它加 localStorage 存档——那样会出现「站点存档说开、扩展实际关」的两份真相。

**「必须早于组件挂载就能读到」的状态有两处先例，加第三处前先想清楚**：`cp.shortcuts`（App 的全局 keydown 与状态栏提示都要用）与 `cp.uiLocale`（首帧的语言）。这两处的做法一致——**绕开 `usePersistentRef`，在模块里直接读写 localStorage**，因为那个 composable 的读写时机挂在组件生命周期上。代价是「读盘校验 / 默认值打底」得自己写（`useShortcutManager.js` 是「默认值打底再套已存键」，`i18n/index.js` 是「`isLocale()` 白名单 + 探测兜底」），两处都别省。

## 7. 现在的功能边界（写文案时别夸大）

- 引擎：**本地 WASM 沙箱（默认，`DEFAULT_ENGINE_ID = wasmEngine.id`，新访客打开就能跑，不需要外部服务）** / Piston / Judge0 / 自检（不执行代码，只回显标准输入，用来联调界面）。本地沙箱支持 **C++ 与 Python**，首次运行要下载工具链（`public/wasm/8.0.1/` 自托管的 clang + wasm-ld + sysroot，裸文件约 52MB、由 Vercel 边缘压缩传输，之后工具链常驻 HTTP 缓存）。下载**只有一个入口**：设置 → 应用 › 本地运行环境（C++ / Python 两行同一套数据驱动渲染，下载中另一行按钮自动禁用；状态在 `EditorSettingsPanel.vue` 里，直接调 `wasmRuntime.preload(language)`）。编译产物按源码原文缓存一份，所以成批跑用例时只有第一个用例付编译开销。
- **本地沙箱的 Python（2026-09 加）**：走 CPython 3.11.3 的 wasm32-wasi 构建（`public/wasm/python-3.11.3/`，约 24MB，来源与 C++ 工具链一致，都取自 `taybenlor/runno` 的 `langs/`）。没有编译段：`runPython()` 直接把整棵 VFS 拍成 fs、以 `args: ['python', 入口文件]` 拉起解释器，多文件 `import` 靠 `sys.path[0] = '/'` 找到同目录的模块。标准库打包在 `/usr/local/lib/python311.zip`（zipimport），`sys.prefix` 编译期写死为 `/usr/local`，所以 **env 必须留空**（不要自作聪明加 `PYTHONHOME`）。语言路由在 `wasmRuntime.runCase()`：`language === 'python'` 走解释分支，其余原样走 C++ 分支；`entryPath` 由 App 从当前激活文件传下来。Python 与 C++ 互不影响，改一边不用管另一边。
- Vim 键位已移除（与 Monaco 0.56 不兼容），别再被试着重加。
- TLE：时限在**设置视图「评测」组里的「运行时限」**（1/2/5/10 s，默认 1 s；2026-09-29 从面板页头搬进这里），只计**程序运行段**，不含编译；超时靠 `kill()` 当前 WASI 实例实现。卡片上的耗时**同样是运行段**（与时限同口径），程序没跑起来时（编译失败 / 编译错误）卡片不显示耗时。Python 没有编译段，它的「运行段」包含解释器冷启动（实测约 190ms），因此 `wasmRuntime.js` 给 Python 的 run 时限额外加 `PYTHON_STARTUP_ALLOWANCE_MS = 500` 余量——不加的话 1s 时限会被启动开销吃掉一大截，跑得再快的程序也可能被判 TLE。代价是 TLE 最多晚 0.5s 报出来。
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
  - 生成只走后台：`wasmRuntime.warmupPch()` 在「首次编译成功」或「手点下载成功」后，经 `requestIdleCallback` 排进**同一条串行队列**（不能并行——sysroot + PCH 克隆会让内存翻倍，老机器正是要避开这个）。生成带 3 分钟看门狗，失败（OOM / 卡死）写 `cp.pchUnsupported=true` 且**以后任何路径都不再重试**。
  - `generatePch()` 先查 IndexedDB 存档，命中是毫秒级返回且**不会**拉起工具链；编译路径的 `loadPchBytes()` 只读存档、**绝不触发生成**——没备好就平滑走普通编译。带 PCH 时把 `/stdc++.h`（源码）和 `/stdc++.h.pch`（二进制）一起挂进 MemFS，参数追加 `-include-pch`，链接前把 `.pch` 从 fs 摘掉（免得 7MB 白克隆给 wasm-ld）。
  - 判废条件必须窄：只有「带了 PCH、没产出 `.o`、且 stderr 命中 `/stdc\+\+\.h\.pch|precompiled header/i`」才判废（删存档 + 置标记 + 普通编译重试一次）。用户自己代码写错同样没有 `.o`，放宽条件会让每次编译错误都白编一遍并永久关掉加速。
  - 实测（2026-09，本机 headless Chrome）：生成约 510–580ms；公平 A/B 下编译+运行 937ms → 730ms，真实 UI 每题 601ms → 354ms，输出逐字一致。数字含 WASI 启动 + sysroot 克隆 + 链接固定开销，老机器上 STL 解析占比更高，绝对收益更大，别在文案里承诺固定倍率。
- **wasm-opt 二次优化：实测无收益，刻意不接进构建**（2026-09 测过并决策放弃）。`npm run wasm:opt`（`scripts/optimize-wasm.mjs`）能对 `clang.wasm` 跑 `-Oz`，但上游这份已经是裁剪过的终态：code 段占 80.7%，抠不动；文件里**没有 name section**，「抹掉调试符号」几乎无对象；而且 `-Oz` 重排指令会让 **gzip 反而变大 0.98%**（老机器真正传输的是压缩流）。实测：`-Oz` → raw −1.89% / gzip **+0.98%**，`-Oz --strip` → raw −2.78% / gzip −0.15%，且函数数量不变、JIT 编译单元不变。**结论：不要做 dev/prod 资源分流去引第二个 30MB 文件**，脚本留着当资产（将来换未优化的工具链、比如 clang 18，可以重测）。脚本优先用 `tools/binaryen/` 下 gitignore 掉的原生二进制（比 npm 的 wasm 版快一个量级），没有才回退到 npm 包 / `WASM_OPT_BIN` / PATH。
- **PWA：装到设备后可独立窗口运行，离线也能编译**（2026-09 加，见第 9 节）。语言工具链**不在 install 预缓存**：用户用哪个语言，才在第一次真正请求时把哪个拉下来并落进 `cp-toolchain-*`（`cacheFirst` 按 `/wasm/` 前缀分流），拉过一次之后一样能离线用。所以「断网也能编译」的前提是该语言此前已经用过一次；离线状态下本地沙箱、判题、主题、布局照常，只有 Piston / Judge0 这两种远端引擎、以及尚未拉取过的语言会失效。装完之后设置视图「应用」分组里的安装按钮自动消失，也不会再重复提示。
- **浏览器插件抓题（2026-09 加，全流程见第 13 节）**：配合**改造版 Competitive Companion**（已更名 **CC for Web**、主色换成与本站一致的蓝）。原版是把题目 POST 到本机 `localhost` 端口，改造后改为在目标网站注入内容脚本、用 `window.postMessage` 推给已打开的站点标签页；站点侧落盘到 `/<年月>/<OJ 标签>/<难度>/<题名>.cpp`（挂在工作区根下；难度导入时为空、先落「未分类」；题目信息与抓到的样例都挂在这个文件节点上 `node.meta` / `node.config`，树里不另有条目），并把抓到的样例**整体替换**进评测面板。安装包在站内分发（设置 → 应用 › 浏览器插件）：下载 → 解压 → `chrome://extensions` 开开发者模式 → 「加载已解压的扩展程序」。**能力边界：只在站点已打开时投递**（没开就给一条系统通知提示先打开网站）；难度不会自动填（来源站点口径不一，由用户自己在题目信息弹窗里填），日期在首次导入时自动播种。
- **题解（Markdown / LaTeX，2026-09-30 加）**：`.md` / `.markdown` 能写、能预览、能排版，**但只是文本，不参与判题** —— 两个运行入口在题解下都是禁用态并给出一句提示（不是「点了没反应」）。预览依赖**按需下载**的 marked + KaTeX（约 578KB，缓存桶 `cp-md-runtime`，与本地工具链同一套路数）：**没下载时预览面板显示的是「去下载」入口而不是空白页**，下完当场渲染，设置 → 应用 › 本地运行环境里可以整体卸载（清缓存 + 删全局 + 删标记三件一起做）。三条边界：① `.md` **不进**判题链路（`activeLanguage` 为 `null`，外部引擎也没有 markdown 语言）；② 公式只在预览里渲染，编辑器里就是 `$…$` 原文；③ 题解与代码文件共用同一套 VFS / IndexedDB 存储，没有「题解专用表」，重命名 / 移动 / 删除走的都是既有路径。
- **把文件从资源管理器拖到编辑区（2026-09-30 加）**：拖过去时编辑区亮起与「拖到树空白处（根区域）」**同一个变量**（`--bg-drop-root`）的提示色，松手后**已经开着就切到那个页签、没开就常开一个新页签**（不是预览页签；顺带把它从预览槽里钉住）。三条边界：① 高亮范围是编辑器**内容区**（`.editor-pane__stage`），不含页签栏与状态栏；② **目录不接**（拖目录过去不亮、不动作——目录的语义是「移动」不是「打开」）；③ 触屏也走同一条路（长按起拖之后拖到编辑区即可），没有额外的触屏入口。
- **界面双语（2026-09-29 加）**：界面、应用内帮助与使用指南都有**中文 / 英文**两套，语言默认跟随浏览器、可在设置视图「外观」组的「界面语言」里改，**切了当场生效、不重载**。写文案时注意两条边界：① **判题语言与界面语言无关**——判题语言仍由活跃文件的扩展名派生（第 5 节坑 15），界面语言只管文案，别把两者写成一回事；② **没有第三方本地化机制**（没引 vue-i18n，没有 `.po` / `.json` 语言包，没有 URL 前缀 `/en/`），词条就是 `src/i18n/messages/` 下六个 JS 文件里中英并排的对象，加语言 = 加一栏 + 在 `LOCALES` 里加一项。另外 `guide.html` 与 `guide.en.html` 是**两个独立的静态页**（各自的 `guide.html` 级别 SEO 头、互相 `hreflang`），不做客户端语言跳转——抓取器拿到什么就是什么。
- **全局快捷键（2026-09 加）**：可绑定的只有 6 个动作——运行全部用例 / 显示隐藏侧边栏 / **切换侧栏面板** / 侧边栏左右对调 / 新增测试用例 / 打开收起设置（表在 `SHORTCUT_ACTIONS`）。**没登记的动作就是做不到的**：格式化没进来，因为 Monaco 内置的 `Shift+Alt+F` 在 C++ / Python 下没有注册 formatter，绑了也是空按。**题解那 14 条格式键位刻意不在这个表里**（它们不可改、也只在 `.md` 里说得通，注册在 Monaco 上）。绑定的键在编辑器里同样生效（监听在 window 捕获阶段，见第 5 节坑 21）；侧边栏折叠时按运行键会先把结果亮出来（见第 3 节「开跑必亮结果」），它和评测面板页脚那颗 ▶ 走的是同一个出口。**插件的快捷键改不了**：浏览器不允许网页改写扩展键位，也没法跳转到 `chrome://extensions/shortcuts`，所以设置视图里那一块只做「查看 + 复制该地址」。
- **模板（2026-10-06 加）**：新建文件时按扩展名归一到语言、填入该语言的初始正文（`.cpp` → C++、`.py` → Python、`.md` → 题解）。归链是 `languageForPath()`（`services/monaco/language.js`）→ Monaco languageId → `langMetaByMonaco()` → 语言 id；**认不出的扩展名（`.c` / `.txt` / 无扩展名）给空文件**，`.c` 不会落到 C++ 模板。插件抓题生成的代码文件走同一条路（`vfs/problemImport.js` 里 `vfs.createFile(codePath, templateForPath(codePath))`，仍守着 `if (!existingCode)` 那道闸门——已存在的题解一个字都不动）。三份模板可在 设置 › **模板** 里改、可逐份**恢复默认**；那一节顶部的**启用模板**总开关可以整体关掉（关掉后新建与抓题都给空文件，模板文本原样留着，闸门只在 `templateForPath()` 一处）。**不支持占位符变量**（纯静态文本、原样写入）。覆盖表与开关都随云同步走（见第 6 节）。`templateForPath('')` 有护栏——`languageForPath('')` 会抛 `error.pathNotAbsolute`。
- **代码区的字体是自托管的（2026-10-02 加）**：界面（代码区以外）仍然只用系统字体；代码区另内置三款等宽字体（JetBrains Mono / Fira Code / Cascadia Code，latin 子集、合计 149KB），**只在下拉里选中时才下载**，不依赖任何第三方服务。写文案时别写成「界面全面自带字体」——「默认」档与其余 4 项仍是系统字体；另外「字体连写」只对**带连字的字体**有效：这三款有，系统内置的 SF Mono / Menlo / Consolas / Courier New 一款都没有。
- **编辑器自动补全（2026-10-08 加）**：C / C++ / Python 有一张**静态补全表**——关键字 + 常用标准库（`vector` / `sort` / `printf` / `cin` / `print` / `sorted` …）+ 代码片段（`main` / `fastio` / `fori` / `ifmain` / `readints` …）。表在 `services/monaco/completion.js`，由 `monaco-setup.js` 顶层**副作用导入**注册（模块只求值一次，注册也就一次），**不加设置开关、恒开**。写文案时别写成「IntelliSense / 语言服务」：它**不是**语义分析——不认变量名与类型、没有跳转定义、没有实时报错，只是「表里的候选 + 同文档里出现过的词」，`markdown` 也不在这张表里（散文用不上）。Monaco 内置的高亮 / 括号配对 / 注释 / 自动闭合 / 缩进规则本来就都有，这次没动。补全的**弹法**（快捷建议 / 触发字符 / Tab 接受 / Enter 策略）显式写在 `editorOptions.js` 里，不再依赖 Monaco 各版本的默认值。一条实现纪律：**每条候选都必须给 `insertText`**（表里没写的由 provider 用 `label` 兜底）——漏给的话补全框照样弹，但 Monaco 的内联补全适配层会拿 `undefined` 去调 `.replaceAll`，控制台整片红。文案五处已同步（`guide.html` §11 / `guide.en.html` §11 / `help.js`「抓题与文件」组 / `docs/使用手册.md` §4 / `index.html` noscript 那条 Monaco 特性行）。另一条实现纪律：**`#` 不在 Monaco 的 `wordPattern` 里**，打 `#inc` 时它只认单词 `inc`，默认的替换范围漏掉那个 `#`，采用 `#include <bits/stdc++.h>` 会得到 `##include …`（症状像是「在已有内容后面又贴了一段」）。provider 里把紧贴单词左边的 `#` 一并算进 range（`swallowHash`，**只给 C / C++**——Python 的 `#` 是注释开头，吞了反而错）；顺带过滤也准了，因为 Monaco 是拿 range 里的文本去比 label 的。

## 8. 验证方式

- **跑 `npm run verify` 前的两个前置**（只影响无头回归，`npm run dev` 不需要）：
  - **Node / npm 不在 PATH 里**就先补上，例如 `export PATH="/Users/hejie/.local/node-v22.23.3-darwin-arm64/bin:$PATH"`（按自己机器改路径）。
  - 脚本用 `puppeteer-core` 驱动 Chrome，默认候选是 `/Applications` 下那几个；本机没装就设 `CHROME_PATH` 指到 Chrome for Testing，例如 `CHROME_PATH="/Users/hejie/.cache/cft/chrome/mac_arm-154.0.8037.57/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"`。
- 手工：`npm run dev`，浏览器 http://localhost:5199，重点看**两套主题各一遍**、面板折叠/展开、分隔条拖拽与单击折叠 / 展开。
- 本地沙箱端到端（动过 `runnoSandbox.js` / `wasmRuntime.js` / 工具链目录后必做）：手工路径是打开设置页签（侧栏页头的齿轮图标）→「评测」组里选「本地 WASM 沙箱」→ 跑一段带 `vector` / `sort` 的 A+B，看输出对不对、同一份代码第二次跑是否秒回（编译缓存）。想自动化就临时写个 puppeteer 脚本，在页面上下文 `import('/src/services/runnoSandbox.js')` 后直接调 `preloadToolchain()` 和 `runCpp({ code, stdin })`——**用完删掉脚本**，仓库里不留临时探针（这条纪律之前踩过：残留探针把 `scripts/` 弄得很乱）。
- Python 专项（动过 `runPython` / 语言路由 / `python-3.11.3/` 目录后必做），同样临时探针、用完即删：手工路径是新建/打开一个 `.py` 文件（面板会自动切到 Python）→ 在设置里切「本地 WASM 沙箱」→ 运行，应看到 AC 且耗时在 100–200ms 量级；再补一条用例验证 `import` 同目录的另一个 `.py`（多文件路径）。自动化时在页面上下文 `import('/src/services/runnoSandbox.js')` 后直接调 `runPython({ code, entryPath, fs })`，注意 `fs` 是「路径 → `{ path, content, mode, timestamps }`」的映射，别直接塞裸字符串。
- PCH 专项（动过 PCH 段落 / `FRONTEND_ARGS` / 微缩头后必做），同样临时探针、用完即删：
  1. DevTools → Application → IndexedDB 删 `cp-pch` 库、localStorage 删 `cp.pchUnsupported`，从零开始；
  2. 在设置里切「本地 WASM 沙箱」，点一次「运行全部」（默认模板是合法 A+B，输出应判定通过），随后 IndexedDB 的 `pch` store 应在约 1 秒内自己出现一条 7,249,912 字节、id 前缀 `1:8.0.1:` 的记录（证明后台 `warmupPch()` 真的跑了）；
  3. 刷新页面再跑一次：编译应吃到存档（UI 每题耗时约从 600ms 降到 350ms 量级），输出与首次逐字一致；
  4. 降级：把那条记录的 `bytes` 改成任意垃圾字节再刷新运行，用户代码仍应正常通过，同时 `cp.pchUnsupported` 被置成 `true`、坏记录被删。
  注意：直接 `import` 模块做 A/B 时，无 PCH 基线要用「先置 `cp.pchUnsupported=true`」走真实降级分支，不要只是改参数——对比的必须是两条产品代码路径。
- PWA / 离线专项（动过 `sw.js` / manifest / 图标 / 预缓存清单后必做），仍然临时探针、用完即删：
  1. `npm run build && npm run preview`（**必须是生产构建**，dev 下不注册 SW），DevTools → Application 应看到 manifest 无报错、Service Worker 已是 `activated`；
  2. Application → Cache Storage 应只有 `cp-shell-v4`（约 100 条：外壳 + 全部 Monaco 分块 + 静态资源）；`cp-toolchain` **install 之后不该存在**——要等真的跑过一次本地沙箱（该语言工具链被请求）才出现，且里面只会有用过的那个语言的文件；
  3. 在设置里切「本地 WASM 沙箱」跑一次「运行全部」，确认判定通过；
  4. DevTools → Network 勾 Offline（或直接拔网线），刷新页面：界面应正常渲染，再跑一次「运行全部」仍应通过——这一步才是真的在验工具链入了缓存，只看第 2 步的条数不够；
  5. 自动化同上一节：临时 puppeteer 脚本里用 `Page.getAppManifest` 拿 manifest 解析错误、用 `page.setOfflineMode(true)` 断网后跑一遍，跑完删脚本。
- 布局宽度专项（动过 `SidebarSwitcher.vue` / `EditorTabs.vue` / 侧栏各面板页头 / `.pane--tests` 下限后必做），临时探针、用完即删：在 1680 / 560 / 414 / 375 / 320 五档量四件事——（a）侧栏页头图标区（量 `.sidebar-switcher`，合计 90px = 胶囊 60 + 间距 4 + 设置 26）都可见、且右缘不超页头右缘，（b）侧栏宽 / 页头宽（与上表逐像素比，删掉页签栏那颗运行按钮后应仍是 663 / 238 / 199 / 180 / 158），（c）`documentElement.scrollWidth === innerWidth`（无横向溢出），（d）`.workspace` 的 `getBoundingClientRect().top === 0`（顶栏确实没了、工作区贴顶）。**只看有没有横向滚动条不够**：`.editor-tabs__strip` 自己会滚，真溢出反而被它吸收；要按第 3 节那个「必需宽度」公式自己算。2026-09-28 的实测表与结论记在第 3 节「无顶栏后的两条宽度线」（**运行按钮 2026-09-28 删除后已重测**，所以别再去找 `.editor-tabs__run`）。
- 触屏拖拽专项（动过 `useTabDrag.js` / `useTreeDrag.js` / `EditorTabs.vue` / `FileTreeItem.vue` 的手势段后必做），临时探针、用完即删。**先接受一件事：本机无头 Chrome 验不了真机手势**（见坑 30），所以这里分「能验的」与「必须靠真机 / 合成事件补的」两半，绿不等于真机通过：
  1. 起一个 `hasTouch: true` 的 page + `Emulation.setTouchEmulationEnabled({ enabled: true, maxTouchPoints: 1 })`，手势全走 CDP `Input.dispatchTouchEvent`（`touchStart` → 等 560ms → 若干 `touchMove` → `touchEnd`）。⚠️ **坐标必须在每次手势前重新量**：滚动过一屏之后旧几何会落到条带外面，起手点跑到别的元素上，整场结论作废（这坑当场踩过）；起手只挑「完整落在可视区内」的页签。⚠️ 快滑之后有一条**惯性滚动尾巴**，下一个场景开始前先等 ~900ms，否则会把那段漂移误判成「长按期间条带被滚了」。
  2. 四条要覆盖：**短滑（不等待）= 条带滚动 + 顺序不变**（守住「没 armed 时不拦滚动」这条）、**长按 560ms 后横拖 = 顺序改变 + 落盘 `cp.openTabs` + 条带 `scrollLeft` 不动**、**长按后原地松手 = 什么都不发生**、**快速轻点 = 照旧切换页签**（守住补的两个监听器没把点击吃掉）。
  3. 探针测不到的那半用「派发合成事件」补（见坑 30）：按压期间 `cancelable` 的 `contextmenu` 应被 `preventDefault`；`touchmove` 在 armed **之前**应 `false`、armed **之后**应 `true`；松手后两者都回到 `false`。日志里要给自己的合成事件**打标记并排除**，否则「异常事件」清单会被自己污染。
  4. 两段反馈要验「看得出来」而不是「类名挂上了」：读 `backgroundColor` 在 t≈16 / 230 / 540ms 三个点 —— 中途必须**严格停在起止色之间**（非活跃页签看 alpha 递增；**活跃页签起点是不透明的 `--bg-tab-active`，alpha 恒为 1、只有 RGB 在插值**，这时要自己算插值进度 t，别照抄 alpha 那套断言）；就绪帧的 `animationName` 只比**前缀** `tab-press-pop`（Vue 会按 scope 给 `@keyframes` 改名成 `tab-press-pop-xxxxxxxx`）。
  5. 页面侧要同时断言静态声明：`getComputedStyle(item).touchAction === 'pan-x'`、`userSelect === 'none'`。**`-webkit-touch-callout` 读不到** —— Chrome 的 CSS 解析器会直接丢掉这个 Safari 专属属性（`cssRules` 里也没有），要验它只能扫**源码**或扫**构建产物的 CSS**（`npx vite build --outDir /tmp/xxx` 之后在 `assets/*.css` 里搜），别把它当成「没生效」。
- 插件抓题专项（动过 `problemImport.js` / `useCompanionBridge.js` / `useCompanionImport.js` / 落盘结构后必做），临时探针、用完即删。**不必真装扩展**——在页面上下文直接 `window.postMessage({ source: 'competitive-companion', type: 'cp-task', taskId: 't1', payload: JSON.stringify(task) }, location.origin)` 就能走完整条链路（`event.source` 与 `event.origin` 两道校验都能过）。要覆盖的六件事：
  1. 首次导入后树里出现 `<年月> / <OJ 标签> / 未分类 / <题名>.cpp` 这一条链（中间几层是归类用的，**不是**「题名」那一层目录），且该目录里**只有这一个文件**（题目信息与样例挂在节点上，不会再冒出第二个条目）；
  2. 底层数据在：`(await vfs.stat(path)).meta` 有 `url` / `oj` / `date` / `timeLimit`，`.config` 里能读到 `tests`；
  3. 往代码文件里写入 `// my solution` 再重抓同一道题 → 正文**原样保留**、样例换成新的；
  4. 评测面板的用例是**整体替换**而不是追加（第 3 条之后卡片数应等于新题目的样例数）；
  5. 同一个 `url` 换个题目名重抓 → 仍落在**同一个文件**上（按 url **全库**认题，哪怕算出来的新路径不同）；`url` 不同但题名相同 → 另起 `<题名>-2.cpp`；
  6. 抓完后编辑器打开的是这道题的代码文件（`.editor-tabs__item--active` 与 `workspace.activeId` 对得上）。
  写这个探针时踩过两个坑，别再踩：**（a）** 点树上的箭头展开目录时，只点 `.tree-item__row[aria-expanded="false"]`——`.tree-item__arrow` 这个 span 在**每一行**都有（文件行的箭头是空的），而点击处理挂在父级 `.tree-item__row` 上，所以「点所有箭头」实际会把每个文件都 `openFile` 一遍，最后点到的文件抢走 `activeId`，断言就会误报「打开的标题不对」；**（b）** 动态 `import('/src/services/…')` 拿到的可能是**另一个空实例**——Vite dev 给源码模块 URL 加了 `?t=<时间戳>`，裸路径 import 与 app 真正加载的那份不是同一个模块（症状是 `workspace.tree.length === 0` 但界面明明渲染出来了）。正确姿势是用 `performance.getEntriesByType('resource')` 找到 app 真实加载过的那条 URL 再 import。
- 快捷键专项（动过 `useShortcutManager.js` / `HotkeyRecorder.vue` / `App.vue` 的 `onKeydown` 后必做），临时探针、用完即删：设置视图 →「快捷键」→ 点某个动作的录制框 → 按 `Mod+Shift+KeyB` 这类组合应写入并回显；再录一个**已被占用**的组合应停在录制态、出现红字且**不写入**（这就是「阻止绑定」）；录 `Mod+KeyW` 这类浏览器原生键应被红字拒绝；刷新页面绑定仍在（`localStorage['cp.shortcuts']`）。最后验真正触发：光标放进 Monaco，按 `Mod+Enter` 应跑全部用例（说明捕获阶段确实抢在 Monaco 前面），按 `Mod+Shift+KeyE` 应翻到另一个侧栏面板（等价于点页头那枚胶囊）；开录状态下按同一个键**不应**触发功能。
- 界面双语专项（动过 `src/i18n/` 任一文件 / 任何含 `t()` 的组件或 service 后必做），临时探针、用完即删。四条要覆盖：
  1. **跟随浏览器**：第 0 帧不种任何存档，用 `--lang=zh-CN` 与 `--lang=en-US` 各起一次 Chrome，前者应中文 + `<html lang="zh-CN">`，后者应英文 + `<html lang="en">`，且**两种情况下都不写 `cp.uiLocale`**（跟随探测不等于用户显式选择）；
  2. **存档覆盖探测**：种 `cp.uiLocale = 'en'` 配中文浏览器 → 应英文；种 `zh-CN` 配英文浏览器 → 应中文；
  3. **切换当场生效 + 落盘**：设置视图「外观」组的「界面语言」下拉切一下，**同一 document 内不重载**就应看到目录八项（外观 / 编辑器 / 快捷键 / 评测 / 本地运行环境 / 浏览器插件 / 应用 / 帮助）全变、`html lang` 跟着变、`localStorage['cp.uiLocale']` 落成 `"en"`。**顺带验「数据表存 key」这条设计**：编辑器组里数据表驱动的行（`Font family` / `Minimap` / `Padding`）也必须跟着变——只验目录项验不出坑 28 第 1 条；
  4. **英文下的超长样例**（守住坑 26 × 坑 28 的交叉）：**框内那个 `……` 不翻译**（语言无关常量，见坑 26），只有框下面那行走 `t()` —— 英文是 `{n} characters not shown`；且**改语言后「选中省略行 = 选中被省略内容」依然生效**（按第 8 节的合成 `ClipboardEvent` 法测，`clipboardData` 是只读 null，要 `Object.defineProperty`）。最后截两套主题各一张图**真的看一眼**。
  探针注意：**同一个 browser 里 localStorage 跨页共享**，每一组用例前都要先 `localStorage.clear()`，否则前一组种下的 `cp.uiLocale` 会污染后面所有页面（实测踩过，表现是一整组假失败）；无头 Chrome 里 `navigator.clipboard.readText()` 恒返回空串，别拿它当断言。
- guide 双语专项（动过任一版 guide / `guide.css` / `sitemap.xml` 后必做），临时探针、用完即删。**机械可复核的四条**：两页都跑一遍，断言 ① `html lang` 各是 `zh-CN` / `en`；② `canonical` 各指向自己、两页都恰好有三条 `link[rel=alternate][hreflang]`；③ **h2 数 = 目录条目数 = 12**（这条是「两版没走偏」的廉价判据，改了章节数记得同步改期望值）；④ 页头 `.page__top-actions` 里 `.lang-link` 的 `href` / `hreflang` / `lang` 三属性。
  再加两条容易忽略的：**页头加了这颗链接之后不许换行**——断言 `.page__top` 高度 < 70px、`.brand` 与 `.page__top-actions` 的 `top` 差 < 6px、`documentElement.scrollWidth === clientWidth`；以及**英文页的表格**（英文文案比中文长约 30%）在 1400px 与 700px 两档下 `.table-wrap` 的 `scrollWidth === clientWidth`、表头没被压到换行（表头是 `white-space: nowrap`，真挤不下会直接溢出容器）。两档都要截元素级截图看一眼——页面级「无横向溢出」不会告诉你表格自己在容器里滚。
- 题解专项（动过 `mdView.js` / `mdFormat.js` / `mdRenderer.js` / `mdRuntime.js` / `MarkdownPreview.vue` / EditorPane 的题解段后必做），临时探针、用完即删。`npm run verify` 的 **H 步**（2026-09-30 加）只钉静态的那几条（`.md` 下工具栏与字数出现、状态栏消失、运行入口禁用、**⌘B 在 `.md` 里是加粗、在 `main.cpp` 里仍是收侧栏**），**渲染正确性仍然要人看**：
  1. 树里点开 `.md`（新建时模板就是题解骨架）→ 工具栏出现、`N 字 · M 行` 有数、底部状态栏消失；
  2. 切「双栏」——未下载时会先看到「下载渲染器」入口（不是空白页）→ 点它，进度按 `(当前/总数)` 走 → 下完当场渲染；
  3. 写一段含 `$E=mc^2$`、`$$…$$`、表格、任务列表、删除线、`<script>alert(1)</script>` 的正文：公式要变成公式、表格要成表、`<script>` 要被洗掉（**不许**弹出来）——这一条是渲染管线的唯一验收点；
  4. 滚动同步：在编辑器里滚，预览跟着滚；把预览滚到底再继续打字，位置**不该跳回顶部**（`lastRatio` 那一条）；
  5. `Mod+\` 四态轮换（仅编辑 → 双栏 → 仅预览 → 仅编辑；最后一步在「仅预览」下按得动，就是它当初搬去全局监听的原因）；全屏按钮收掉侧栏与页签栏、`Esc` 退出且**模式不变**；
  6. 设置视图「应用 › 本地运行环境」卸载渲染器 → 回预览应重新显示「去下载」入口，控制台不该有 `MD_RUNTIME_MISSING` 之外的报错。
  探针注意：VFS model 的 uri 是 `vfs://file/<uuid>`，**认不出文件名**，要读编辑器内容就用 `monaco.editor.getEditors()[0].getValue()`；动态 `import('/src/services/…')` 在 dev 下可能拿到另一个空实例（见插件那节的两个坑）。
- 无头回归：`scripts/verify-ui.mjs`（`npm run verify`）。**B–H 应当是绿的**，跑之前先知道这几条：
  - **A 步有一条已知的既有竞态**：它在 `.monaco-editor` 可见后立刻探针，此时 model 还没绘出行，于是 `editorText: ""` / `codeLineCount: 1`，让 `codeLineCount > 3` 与 `editorText.includes('include')` 两条恒假（本机连跑两次都是同一签名）。**与面板切换无关**——同一个页面会话里 B 步读到的 `editorText` 是完整的（整份 C++ 模板，行数随模板改而变，别把行数写死进断言）。要修就得等 Monaco 的首个 model 渲染完（比如 `waitForSelector('.view-line')`），但那是另一件事，别顺手改。A 步真正在守的新契约是 `tabs === ['切换到评测样例','设置']`（胶囊那颗写的是去向）、`segIds === ['explorer','tests']`（两段都渲染出来了）、`sidebarSegActive === ['tests']`（胶囊填亮的段，读 `data-current`）与 `sidebarPanel === 'tests'`。
  - **B 步（切布局）走的是「设置页签」这条路**（2026-09 改）：点侧栏页头那颗 `aria-label === '设置'` 的 `.sidebar-switcher__tab`（它落在**当前可见的那个 `.sidebar__panel`** 里；`textContent` 是空的，认 `aria-label`）→ 断言编辑区里 `.settings-view` 真显示、`.editor-tabs__item--active` 落在含「设置」的那个页签上、`!document.querySelector('.topbar')` 且 `.workspace` 贴顶、目录那一段（2026-10-01 改成行为断言）：**不再「数人头」**，而是挨个点开每一项，要求 `aria-current` 落在它身上、`.settings-view section.setting-group` 恰好 1 个（8 个分类是 `v-else-if` 互斥的）、且内容区文本非空——**加删分类不用再改脚本**（这段原来写死 `navItems === 8`，后来涨到 10，每次加分类都先把回归搞红）。同一段仍会随手记下 `navItems` 的实际值放进 detail 里，只作观察、不作断言。 → **点目录里的「外观」**（设置是「目录 + 内容」两栏，默认停在第一项「常用设置」，右侧只渲染当前那一组；这一步仍显式点一下，默认分类以后再变也不坏）→ 在页签里选「右侧」（2026-09-28 起面板默认在**左**，所以这一步反过来选「右侧」）→ 点 `.editor-tabs__close[aria-label="关闭设置"]` 关掉 → 断言设置视图与设置页签一起消失。设置仍是 `v-show` 的视图、不是抽屉，所以「Monaco 实例不重建」的老断言（`data-marker`）照样成立。
  - **F 步（Python 模板与判题语言）走的是「资源管理器 → 点 main.py」这条路**（2026-09 改）：顶栏语言下拉已移除，语言只跟活跃文件的扩展名走。所以步骤是——先把面板切回「资源管理器」（用脚本里的 `showPanel(page, 'explorer')`，它点胶囊那颗 toggle；先判当前面板不是目标再点，否则会翻过头。该 helper 必须把 `page` 当参数传进来，`const page` 在 `try {}` 块里，模块级函数直接引用会 `page is not defined`）→ DOM click 标签为 `main.py` 的 `.tree-item__row` → 断言 `.view-lines` 文本（NBSP 已归一）含 `def solve`、`.editor-tabs__item--active` 是 `main.py`、动态 `import('/src/services/vfs/workspaceStore.js')` 后 `activeLanguage === 'python'` 且 `activeNode.path === '/main.py'`、`[...document.querySelectorAll('select')].every((el) => !!el.closest('.settings-view'))`（钉住「顶栏语言下拉不会复活」——现在全站只剩设置视图里那几个原生下拉）。
  - F 步曾长期误报：断言切到 Python 后 `.view-lines` 文本含 `def solve`，而 Monaco 把空格渲染成 NBSP（第 5 节坑 2），`includes('def solve')` **永远匹配不上**——已修（断言前把 `\u00a0` 归一成空格），现在过。这条 NBSP 归一化仍在用，别退回直接 `includes`。对照 A 步的 `includes('include')` 因为不含空格，从来没被这条绊到。
  - 它自己起 dev server。**端口由脚本自己挑空闲的**（`freePort()` 监听 `:0` 拿一个再用 `--strictPort` 起 Vite，2026-10-01 改），所以常驻的 `npm run dev` 不会再撞车；只有想固定端口时才给 `VERIFY_PORT=<端口>`，这时撞上仍会直接退出。
  - **写探针时别用 `page.$('.xxx')` / `page.click('.xxx')` 去碰页头里的东西**：它们抓的是**文档里第一个**匹配，而侧栏那两个面板是 `v-show` 双份 DOM，第一个多半落在被藏起来的那个面板里。症状是 `Node is either not clickable or not an Element`（`page.click`）或截图报 `Node is either not visible`（`ElementHandle.screenshot`）。正确姿势：先用 `[...document.querySelectorAll('.sidebar__panel')].find((el) => el.getClientRects().length > 0)` 拿到可见面板，再在它里面 `querySelector`，要真点就用 `page.mouse.click(x, y)` 打真实坐标（2026-09-28 一天里踩了两次）。
  - 它跑的是默认 Piston 引擎（需要本地有 `localhost:2000` 服务），所以**E 步是「空过」**：断言只看徽标数量，引擎连不上、三个卡片全报错也照样 PASS，验不到本地沙箱。
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
| `public/manifest.webmanifest` | `display: standalone`、`start_url: /`、`scope: /`、`id: /`；`theme_color` 只有首帧兜底作用，真正生效的是 `App.vue` 写进去的值 |
| `public/icons/*.png` | `icon-192/512`（圆角、透明角）、`icon-maskable-192/512`（满幅方块 + 图形收在安全区内）、`apple-touch-icon`（180，满幅） |
| `src/sw.js` → `dist/sw.js` | Service Worker，缓存策略见下。**源码是模板、产物由构建生成**（见下） |
| `src/composables/useInstallPrompt.js` | 拦 `beforeinstallprompt` 交给设置视图「应用」分组里的安装按钮，跟踪 `appinstalled` 与 `display-mode: standalone` |

**Service Worker 的三段策略**：

- `install`：读构建期产出的 `/precache-manifest.json` 拿全部带哈希的产物名，与 `sw.js` 里手写的 `STATIC_ASSETS`（`public/` 下那些不过构建的静态资源：favicon、manifest、图标）合并后一起预缓存进 `cp-shell-v4`。**语言工具链不预缓存**——install 阶段不拉任何 `/wasm/` 资产，用户用哪个语言、哪个语言才在第一次请求时被 `cacheFirst` 写进 `cp-toolchain`。**逐条 `catch` 容错**：任何一条失败都不能让整次 install 作废（install 失败等于永远装不上），漏掉的之后由 fetch 处理器补。
- `activate`：删掉名字不在保留名单里的缓存桶，再 `clients.claim()`。**2026-10-01 起多一步 `migrateLegacyBuckets()`**：按 `storageNames.js` 的 `LEGACY_BUCKETS` 表，把改名前的旧桶**原样搬进新桶**再删旧桶——工具链是随 URL 固定的二进制，不搬的话老用户升一次外壳就得白下 76MB。表里现在是四对（两轮改名的层积）：`cph-toolchain-v3` / `cph-md-runtime-v1`（去 `cph-` 前缀那一轮）与 `cp-toolchain-v3` / `cp-md-runtime-v1`（去版本尾缀那一轮），都指向 `cp-toolchain` / `cp-md-runtime`；**外壳桶 `cph-shell-*` / `cp-shell-v3` 刻意不搬**，它装的是带哈希的构建产物，重新预缓存本来就是升外壳该发生的事。
- `fetch`：只碰同源 GET。**导航网络优先**（重新部署后刷新一次就拿到新外壳，断网才退回缓存的 `index.html`），其余缓存优先。跨域一律放行——判题服务地址是用户填的，SW 插手就会变成 CORS 事故；带 `range` 头的请求也放行，206 塞进 Cache Storage 会抛错。

**为什么文件名清单要构建期生成**：产物名带内容哈希，没法在 `sw.js` 里硬编码。`vite.config.js` 里那个 `cp-precache-manifest` 插件在 `generateBundle` 时把 `bundle` 的键写成 `precache-manifest.json`，正好绕开引依赖这件事。加产物类型（比如新图）时它会自动跟上，**不用改 `sw.js`**；但 `public/` 下的东西不过 `bundle`，加文件必须手动补进 `STATIC_ASSETS`（第 1 节表里那两条约束就是这么来的）。反过来，**`public/` 下不是每个文件都该进去**：`public/extension/*.zip` 就刻意不进——它只在用户点「下载」时才需要，而且靠**文件名带版本号**来换代（第 5 节坑 20），塞进 install 预缓存等于每次装 SW 都白拉几百 KB 的旧包。

**两个版本号，别混**：

- `storageNames.js` 的 `SHELL_VERSION = 'v4'` —— **只决定外壳桶名**（`cp-shell-v4`）。改外壳缓存策略或 `STATIC_ASSETS` 就升它，`activate` 会把旧外壳桶整个删掉。
- `storageNames.js` 的 `TOOLCHAIN_CACHE = 'cp-toolchain'` —— **不带版本尾缀，也刻意不跟 `SHELL_VERSION` 走**。2026-09-30 前两个桶共用一个版本号，升一次外壳就把老用户的 clang（52MB）+ CPython（24MB）一起删掉、逼他们重下 76MB；现在工具链桶名固定，它落在 `activate` 的 keep 白名单里，跨外壳升级无损继承，一个字节都不用重下。**不带尾缀还有第二个用处**：这个名字同时被 `purgeRuntimeCache` 当成「所有历代工具链桶」的前缀（见第 5 节坑 23），带尾缀就连老桶都配不上了。换代工具链靠 `public/wasm/<版本>/` 的目录名，**不用再动这一行**。
- 工具链目录 `public/wasm/8.0.1/`（C++）与 `public/wasm/python-3.11.3/`（Python）—— 目录名就是版本号，换名字即自然失效（URL 变了，浏览器与 SW 都当新资源重新取）。**不用再改 `sw.js`**：工具链已改成按需缓存的，`cacheFirst` 只按 `/wasm/` 前缀分流、不认具体版本目录。

**桶名只有一处定义（2026-10-01 收敛）**：`src/services/storageNames.js` 是 `SHELL_CACHE` / `TOOLCHAIN_CACHE` / `MD_CACHE` / `LEGACY_BUCKETS` 与两个 IndexedDB 库名（`VFS_DB_NAME` / `PCH_DB_NAME`）及各自 `LEGACY_*` 的**唯一出处**。页面侧（`mdRuntime.js` / `pchStore.js` / `LocalVFSProvider.js` / `runnoSandbox.js`）直接 `import`；`sw.js` 是 classic worker、没有 `import`，所以走**构建期注入**：

- `src/sw.js` 是**源码模板**（不是产物，`public/sw.js` 已删）。它用到的桶名常量不定义在自己文件里。
- `vite.config.js` 的 `cp-service-worker` 插件按 `storageNames.js` 导出的 `SERVICE_WORKER_CONSTANTS` 生成一段 `const <名字> = <值>`，**前置**拼到模板上：构建期 `emitFile` 成 `dist/sw.js`（URL 与原来完全一致，`main.js` 的 `register('/sw.js')` 与 `vercel.json` 的 `/sw.js` 响应头都不用动）；dev 下挂中间件现场拼同一份（不拼就是 404）。
- **加一个 SW 要用的桶名** = 在 `storageNames.js` 定义 + 补进 `SERVICE_WORKER_CONSTANTS`，插件与两个文件都不用改。
- 为什么不在 `sw.js` 里再抄一份：两处字面量对不上时没有任何报错——页面往 A 桶写、SW 在 `activate` 里按 B 桶白名单清理，用户的 76MB 工具链会被静默删掉。
- 改桶名**必须**同时改对应的 `LEGACY_BUCKETS` / `LEGACY_*_DB_NAME`（迁移源），否则老用户的数据搬不过来。

**注册时机**：`src/main.js` 里 `import.meta.env.PROD && 'serviceWorker' in navigator` 才注册，且挂在 `window.load` 上。**dev 下刻意不注册**——Vite 的模块是即时编译的，缓存它只会让改完代码看到旧页面；所以 `npm run dev` 里既没有安装入口也测不到离线，要验就走 `npm run build && npm run preview`。

**安装入口**：设置视图「应用」分组里那个「安装」按钮只在 `beforeinstallprompt` 真的触发后才可点（说明浏览器已判定可安装；不可安装时它 `disabled`），点它调 `prompt()`，`userChoice` 返回后事件即失效、按钮跟着置灰；已经装在独立窗口里跑或已被 `appinstalled` 标记过，也不再提示（文案变「已安装」）。iOS Safari 没有 `beforeinstallprompt`，只能手动「分享 → 添加到主屏幕」，未做提示引导（要加就在这里加）。

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

**隐私政策也是一对「一页一语言」**（2026-10-06 加）：`privacy.html`（中文）/ `privacy.en.html`（英文），**手写**——没走 notice 那套生成器，因为这份文档改一次就长期不动，不值得再造一条 markdown 管线。复用 `guide.css` 与同一套页头 / 主题脚本 / 语言切换链接，canonical 各指自己 + 三行对称 hreflang，并与 `sitemap.xml` 里那两条 URL 逐字对齐。**它存在的直接原因是商店上架**：Edge Add-ons 与 Firefox AMO 都要求填一个可访问的隐私政策 URL，所以它有一条额外纪律——**内容必须与站点实际行为一致**。目前强制对齐的三处行为：① 云端同步上传的是偏好类项、且上传后公开可读；② 切到 Piston / Judge0 时代码发往**你自己填的**服务地址；③ 扩展只读当前标签页网址与受支持站点的题面样例。**改这三处行为就要回来改这两页**。页脚与正文的联系方式指向两个仓库的 issue（站点 → `wasm-oj-frontend`，扩展 → `cph-companion`），换仓库要同步。

**部署侧的 MIME**（`vercel.json`，见第 10 节）：`/robots.txt` 补 `text/plain; charset=utf-8`、`/sitemap.xml` 补 `application/xml; charset=utf-8`，两者都禁缓存（`max-age=0, must-revalidate`）。

**已知取舍**：两版 guide（以及致谢两页）**都不进 Service Worker 预缓存**（`vite.config.js` 的 `precacheManifest` 在 `generateBundle` 阶段从 `bundle` 生成，而 `.html` 是 `vite:build-html` 之后才产出的，清单里只有它们的 js/css）。所以断网访问 `/guide.html` 或 `/guide.en.html` 时，导航的兜底（`sw.js` 里 `caches.match('/index.html')`）会把**主应用外壳**顶上来——指南页离线不可用，但至少不会白屏。要改就在 `sw.js` 里单独缓存它们（每一版都要）。

## 13. 浏览器插件抓题（CC for Web）与全局快捷键

两块都是 2026-09 加的，彼此独立，只是同一批做的。

### 13.1 两端怎么接上

改造的插件在**另一个仓库**：`/Users/hejie/Code/cph-companion`（上游 jmerle/competitive-companion 的 fork，`package.json` 的 `productName` 已改成 **CC for Web**、版本 `2.66.x`，图标与宣传图的主色换成了与本站一致的蓝 `#0e639c`）。原版是把题目 POST 到用户本机的 `localhost` 端口（CP Editor / CPH 那套），fork 先是改成只推给本站，2026-09-30 又改成**两边同时投**——网站标签页与本地工具是并列的两个接收端，各有一个开关（选项页 `Destinations` 分组，默认都开），单侧失败不影响另一侧。

**投递目标可以在本站设置里直接切**（2026-09-30 加）：设置 → 应用 › 浏览器插件 那一组多了「投递目标」两个开关，它们**只是扩展 `chrome.storage` 的镜像**——网页点一下发 `cp-set-config` 给扩展，扩展写盘后再回一条 `cp-config`，站点拿回执就地更新 `extensionInfo.config`（刻意不重跑 `refresh()`，否则面板会闪一下「检测中」）。写盘的真值是扩展存的，所以刷新页面后开关状态来自扩展的上报而不是站点自己的 localStorage。

**唯一能在网页里改的配置就是这两个键**：扩展 `background.ts` 里的 `WRITABLE_CONFIG_KEYS` 白名单只放 `sendToWebPage` / `sendToLocalTools`，且值必须是 boolean，其余一律回 `{ ok: false }`。**快捷键改不了**——Chrome 的 `chrome.commands` 只有 `getAll` / `onCommand`，没有任何写接口，站点只能展示 + 让人去 `chrome://extensions/shortcuts` 手动改（网页也不许跳 `chrome://`）。

**扩展侧**（`cph-companion`，改动集中在 6 个文件）：

| 文件 | 职责 |
| --- | --- |
| `src/hosts/targetSites.ts` | 目标网站白名单 `TARGET_SITE_PATTERNS`：`localhost:5199` / `127.0.0.1:5199`（**必须与 `vite.config.js` 的开发端口一致**，见第 0 节）+ `www.998244353.best` / `998244353.best`。少了哪条就等于「网站没打开」 |
| `src/hosts/WebPageHost.ts` | 查已打开的标签页、把任务投过去（**接收端之一**，与本地工具并列） |
| `src/hosts/hosts.ts` | `getHosts()` 按两个开关拼接收端列表：`WebPageHost` + `CHelperHost`(4243，body 带 `json\n` 前缀) + `CustomHost`(上游 7 个默认端口 + 选项页 `customPorts`)；`LOCAL_TOOL_ORIGINS` 是 manifest 的 host 权限来源，**匹配模式不带端口即覆盖所有端口** |
| `src/background.ts` | `sendTask()` 用 `allSettled` 并发投所有接收端，**全部失败才**发系统通知（`notifyNoReceiver()`，标题 `CC for Web`）；两侧都关（接收端列表为空）时静默，不拿「没有接收端」打扰用户；**消息处理必须用 `sendResponse` 回调式**，不要返回 Promise（Chrome 原生 API 不认）。另外两件事：`cp-get-info` 的 `getExtensionInfo()` 现在还要 `Promise.all` 把 `sendToWebPage` / `sendToLocalTools` 读出来塞进 `config` 字段（站点据此渲染开关）；`cp-set-config` 分支走 `WRITABLE_CONFIG_KEYS` 白名单写盘并回 `{ ok, key, value }` |
| `src/options.html` + `src/options.ts` | `Destinations` 分组两个勾选框，`config` 持久化 |
| `src/utils/config.ts` | 新增 `sendToWebPage` / `sendToLocalTools`（**默认 true**）。坑：`Config.get` 的兜底必须用 `??` 而不是 `||`——默认 true 的开关存了 `false` 会被 `||` 当成「没设置」回退成 true，开关等于关不掉（2026-09-30 实测踩到） |
| `src/bridge.ts` | **注入目标网站的内容脚本**：扩展拿不到网页的 JS 作用域，只能靠它做 `window.postMessage` 中转。页面→扩展的两条路：`cp-ping` → `cp-get-info` → 回 `cp-info`；`cp-set-config` → 转发给 background 写盘 → 回 `cp-config`（合法性由 background 把关，bridge 只转发不校验） |

**站点侧**两个 composable + 一个服务：`useCompanionBridge.js`（收消息）→ `useCompanionImport.js`（订阅 + 兜异常）→ `services/vfs/problemImport.js`（落盘）。`App.vue` 里只有一句 `useCompanionImport({ setTestCases, onImported })`。

**消息协议**（两侧的 `source` 常量是约定的握手暗号）：

| 消息 | 方向 | 载荷 |
| --- | --- | --- |
| `cp-task` | 扩展 → 页面 | `taskId`（每次抓取现生成的 uuid，**只用来去重**）+ `payload`（题目 JSON 字符串） |
| `cp-ping` | 页面 → 扩展 | `requestId`（站点自增，用来认领回包） |
| `cp-info` | 扩展 → 页面 | 同一个 `requestId` + `info`（`{ version, commands, config }`，`commands` 是插件自己的快捷键，`config` 是投递目标两项的当前值）。**`shortcut` 是浏览器自己那套写法**（macOS 上是 `⇧⌘U`、其它平台是 `Ctrl+Shift+U`），显示前必须过 `comboFromChromeShortcut()` + `formatCombo()` 转成站点写法（`⌘ + ⇧ + U`），否则同一个界面里会出现两种键位格式；`shortcut` 为空串是常态（Chrome 遇到冲突就不分配建议键，且不会事后补），此时显示「未设置」 |
| `cp-set-config` | 页面 → 扩展 | `requestId` + `key` + `value`（只认 `sendToWebPage` / `sendToLocalTools` 两个键 + boolean） |
| `cp-config` | 扩展 → 页面 | 同一个 `requestId` + `key` + `ok` + `value`（写失败时 `ok: false`，站点在那一组下面显示一行警示文案） |

**这几个协议名是与 `cph-companion` 仓库的跨仓契约**（`cp-ping` / `cp-task` / `cp-info` / `cp-config` / `cp-set-config` / `cp-page`）：改任何一条都必须同步改扩展并发新版插件，否则新站点与老插件互相认不出、抓题直接失联。

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
- 安装提示写在设置视图那一组里，**两条路并列**（2026-10-10 改，Firefox 上架后）：
  - **Chrome**：下载 → 解压 → `chrome://extensions` 打开「开发者模式」→「加载已解压的扩展程序」选中解压出来的目录。Chrome 版**仍未上架**，这条手动路是它唯一的安装方式，别把这一段说成「一键安装」。
  - **Firefox**：**已上架 AMO**，那一行右侧多了一颗按钮直接外链 `https://addons.mozilla.org/zh-CN/firefox/addon/cc-for-web/`（常量 `FIREFOX_EXTENSION_URL`，见 `EditorSettingsPanel.vue`），点一下就装，这才是真的一键安装。**这个地址不随版本走**（AMO 那个页面永远指向最新获批版本），换包时不用动它，也不在上面「改两个常量」之列。
- **待办（2026-10-10 留，尚未做）**：设置页的 `settings.extension.downloadHint` 已改成「Firefox 一键装 / Chrome 手动加载」两条路，但**别处的「不在任何商店里、这是唯一安装方式」还没同步**——`src/i18n/messages/help.js` 中英（`The extension is not in any store…` 与中文对句）、`docs/使用手册.md`、两版 guide。口径现在与设置页不一致，要一起改齐（这五处见第 0 节末尾那条纪律）。
- **当前在站的版本：`2.66.3`**（2026-10-10 换版。三项改动：① **Firefox for Android 支持**——manifest 增加 `gecko_android`（下限 142，因 `data_collection_permissions` 安卓端 142 才认识），并修复后台脚本在安卓上的两处致命崩溃：`contextMenus.onClicked` 顶层访问、`commands.getAll()`，这两个命名空间在安卓端整个不存在（MDN BCD：`menus`/`commands` = `ff_android false`），原代码在模块求值时抛 TypeError 把整个 background 带走，安卓上表现为网站「未检测到插件」、点图标无反应——已在真机 Firefox 143.0.2 实测通过（三星 SM-S9010 / Android 16）；② 来源站点注入范围改由 parser 注册表推导（`host_permissions` 6→183 条、自动解析脚本 2→182 条）；③ Firefox 端 manifest 描述加注「Fork of Competitive Companion, now also working on Firefox for Android.」（`extension.ts` 的 `descriptionOverride`，只挂 Firefox 目标——Chrome/Edge/Opera 的移动端根本不支持扩展，挂上就是失真）。AMO 提审包 `dist/cc_for_web-2.66.3-firefox.zip` 已打好，源码包仍需**先提交全部改动**再 `git archive`）。
  此前是 `2.66.2`（2026-10-01 当天两次换版。先是 `2.66.0`，行为改动是**插件与网页之间握手用的消息名去掉 `cph-` 前缀、统一成 `cp-`**——`cp-page` / `cp-task` / `cp-ping` / `cp-get-info` / `cp-info` / `cp-set-config` / `cp-config`，见 13.1 那张表；**这是破坏性改动，站点与插件必须同版发布**，老插件配新站点会静默失联且没有任何报错；当天接着升到 `2.66.2`，把「打开题目页就直接抓」改成**现场问答契约**——先问工作区实况再决定抓不抓，消息名不变，站点与插件同样要同版）。上一次是 `2.65.3`（2026-09-30：「可在本站设置页直接切换投递目标」）、`2.65.2`（同一天：「双投」）。每次换版都按上面三步走：`package.json` 改版本号 → `node scripts/build/extension.ts chrome true false`（本机没装 `pnpm`，直接 `node node_modules/tsx/dist/cli.mjs` 等价调用）→ 打包 `build-chrome/` 成 `cc-for-web-<版本>.zip`（`cd build-chrome && zip -r -X ../cc-for-web-<版本>.zip *`；用 `*` 而不是 `.`，否则条目会带上 `./` 前缀；`web-ext build` 也行，但它会加 `-chrome` 后缀、名字和站内现有的不一致）→ 拷进 `public/extension/`、删掉旧包、站点 `EXTENSION_VERSION` 改同号。`NOTICE.md` / `NOTICE.en.md` 第四节必须同步改（那份文件自己规定「换 `public/extension/` 里的包」就要回来核对），改完跑 `npm run notice` 重新生成 `notice.html` / `notice.en.html`——**这两个 html 是生成的，别手改**（第 12 节）。
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
- 改设置视图的分类 → **不用再动脚本了**（2026-10-01 起 B 步逐项点开验行为，不再数个数；原来这里写着「`navItems` 那个数字要跟着改」）。
- 改扩展的 `TARGET_SITE_PATTERNS` / 开发端口 → 插件与网站是对着 `5199` 写死的，**两边必须一起改**（改了端口插件就再也找不到网站了）。
- 加/改「网页能改的扩展配置」→ 三处要一起动：扩展 `background.ts` 的 `WRITABLE_CONFIG_KEYS`、`getExtensionInfo()` 里读出来的 `config` 字段、站点 `EditorSettingsPanel.vue` 的 `EXTENSION_DESTINATIONS`（键名与文案），以及 `useCompanionBridge.js` 里 `cp-config` 回包的处理。网页端**没有**写扩展存储的能力，只能走这条消息通路。
- 动过扩展就要**升版本号 + 换 zip 文件名**（同版本号原地覆盖会被 SW 的 `cacheFirst` 坑住，见第 5 节坑 20），站点侧四个消费方一并改（见 13.3）。
- 改 `useCompanionBridge.js` 里的**消息名**（`cp-ping` / `cp-task` / …）→ 那是与 `cph-companion` 的**跨仓契约**，必须同步改扩展的 `src/bridge.ts` + `src/background.ts`，再升版本号发新版（2026-10-01 就是一次这样的改动：`cph-*` 全改成 `cp-*`）。**结论是「两边不同版就完全失联」**，而且失败是静默的——只剩「未检测到插件」。注意 `EXTENSION_SOURCE`（`competitive-companion`）是**扩展上游的标识，不是这次那批消息名，改它等于单方面毁约**；`PAGE_SOURCE` 才是本站自己的那半边。

## 14. 多平台移植（**macOS 已落地**；Windows 第 1–3 步已落地、待实机实测；**Android 真机已跑通 C++ 编译与运行**，见 14.I；**Android release 已签名出包、包体 118.6 MiB**，见 14.J；**壳里的云端同步已接管（绝对地址 + Worker 放行壳来源）**，见 14.K；**壳端出包已剔掉 `dist/wasm`（74 MB 死重）**，见 14.L；**Android 工具链再裁掉 7 处系统头（设备 Data −6.2 MB）**，见 14.M；**壳里「收键盘后点哪都把输入框捞回来」已修（保焦闸门放宽到全部可编辑面）**，见 14.N；Linux 未开工）

**目标**：把同一套前端搬到桌面，用 **Tauri** 打包成原生应用（首选 macOS，其次 Windows / Linux）。**Web 版（Vercel + PWA）继续保留、是并行的一条线，不是被替代**；桌面端与网页端共用同一份 `src/`，只在「跑代码」「存储」「离线」这几处按平台分流。

**架构定调（照这个做）**：前端只负责 UI，**凡是碰系统的东西——读写文件、调编译器、起子进程——全部放在 Rust 侧**，前端只通过 `invoke` 递一个字符串 / 数据对象过去，结果再拿回来。所以 Tauri 侧**不用**给前端开 `shell` / `fs` 权限插件，权限面收到最小（这是这条路线最主要的价值）。参考方案里那段 `main.rs` 的 `run_cpp` 就是这个形状：前端送 `code`，Rust 落盘 → 调 `clang++` → 跑 → 回 stdout/stderr。

**先纠正参考方案里与本仓不符的地方（照抄会直接踩坑）**：

| 参考方案 | 本仓实际 |
| --- | --- |
| React 项目、产物目录 `build` | **Vue 3 + Vite**，产物目录 **`dist`**（第 10 节） |
| dev server `localhost:3000` / `5173` | **`http://localhost:5199`**（`vite.config.js` 写死，扩展的 `TARGET_SITE_PATTERNS` 也认它，见第 13 节） |
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
- **`tauri.conf.json` 关键值**：`productName` `unnamed`、`identifier` `best.998244353.unnamed`、`frontendDist` `../dist`、`devUrl` `http://localhost:5199`、`beforeDevCommand` `npm run dev`、`beforeBuildCommand` `npm run build`。窗口 1280×820（最小 960×640）。
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
  - 编译参数 `-std=c++17 -O2`，与 `src/services/runnoSandbox.js` 的 `FRONTEND_ARGS` 同值；沙箱那边刻意没开 `-fno-exceptions`，这里同样不开。
  - 时限**只计运行段**（从 `spawn` 到进程退出的墙钟），不含编译，默认 1000ms —— 同 `runner.js` 的 `TIME_LIMIT_DEFAULT_MS`。
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
  3. **扩展抓题**：`useCompanionBridge` 的 `refreshExtensionInfo()` 与 `attach()` 在桌面端**直接 return** —— 不挂 `message` 监听、不发 ping，`extensionInfo` 恒为 `null`；设置 › 应用 的整组「浏览器插件」块（状态 / 下载 / 投递开关 / 快捷键）`v-if="!isDesktop"`；`App.vue` 的 `emptyNotice` 在桌面端直接返回 `null`（不再说「未检测到浏览器插件」这种在桌面端不成立的话）。**消息名与 `EXTENSION_SOURCE` 一个都没动**（跨仓契约）。
  4. **工具链下载**：设置 › 应用 的「本地运行环境」三行（C++ / Python 3 / 题解渲染器）、设置 › 云端同步 的「预下载」三个开关，都在桌面端 `v-if="!isDesktop"`；`runtimePreload.scheduleAutoPreload()` 在桌面端直接 return，启动不预下载。（桌面端改用系统 `clang++` / `python3`，见 14.B / 14.C；`public/wasm/` 与 `probeRuntime` 都**照旧保留**，网页版要用。）
  5. **COOP / COEP**：`src-tauri/tauri.conf.json` 的 `app.security.headers` 加 `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`。Tauri v2 会把它们加到自建协议的每个响应上；dev 走 vite，那两份头 `vite.config.js` 本来就有，所以 dev 不受影响。
- **验证**：
  - `npm run build` 通过。
  - 网页版回归（浏览器实测 localhost:5199，用户界面逐项核对）：设置 › 应用 三块（安装到设备 / 本地运行环境三行 / 浏览器插件）都在；设置 › 评测 的引擎列表仍是「本地 WASM 沙箱 / Piston / Judge0 / 自检」四项、**没有**混入 native；设置 › 云端同步 的预下载三开关都在。控制台无红色报错（仅有两条与本地 WASM 资源相关的 `ERR_CACHE_MISS`，改动前就有）。
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


