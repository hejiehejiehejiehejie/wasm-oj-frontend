# CPH IDE · 交接文档

面向「接下来要改前端样式」的接手人。当前代码**已跑通并上线**：本地 WASM 沙箱能编译运行 C++、判题（含 TLE）、主题与布局都能用；前端已推到 GitHub 并由 Vercel 托管（见第 10 节）；也能作为 PWA 装到设备上独立窗口运行、断网可用（见第 9 节）。

## 0. 一分钟上手

- 目录：`/Users/hejie/Code/BISHE`
- **是 git 仓库**：远程 `origin` = https://github.com/hejiehejiehejiehejie/wasm-oj-frontend.git ，主分支 `main`（就是部署分支）。动大样式前先看一眼 `git status`。
- 启动：`cd /Users/hejie/Code/BISHE && npm run dev` → http://localhost:5199；想验生产构建用 `npm run build && npm run preview`（Service Worker 与安装入口**只在生产构建里存在**，dev 下测不到，见第 9 节）。
- 其他命令：`npm run verify` 跑无头回归（先看第 8 节的已知红项，另需 `VERIFY_PORT` 避开占用中的 5199）；`npm run wasm:opt` 是工具链体积优化，**当前结论是不用跑**（第 7 节）。
- 响应式：顶栏五档断点（窄屏把图标从右到左折进省略号）+ 测试面板最低宽度随视口收缩（见第 3 节三小节）；工作区两栏始终并排、不堆叠。断点与下限都是实测定出来的，改动后要重量（第 1、3 节）；触屏下分隔条已可拖动，且有「键盘模式」（第 3 节末）。
- 技术栈：Vue 3（Composition API + `<script setup>`）+ Vite 8 + **纯原生 CSS**（没有 Tailwind，也没有任何组件库 / UI 库）。
- 重量级第三方依赖只有 `monaco-editor` 和 `@runno/wasi`（浏览器里跑 clang）；`puppeteer-core` 只给无头回归脚本用；`binaryen` 是 devDependency，只服务 `npm run wasm:opt`（不进产物、不影响运行时，卸掉它会自动回退到系统级 wasm-opt）。新增 npm 包要先讨论。

## 1. 硬约束（改样式时最容易被打破的几条）

| 约束 | 说明 |
| --- | --- |
| 只有两套主题 | `cph-dark`（默认）/ `cph-light`，主题 id 同时用于 Monaco 自定义主题名 |
| 颜色只走 CSS 变量 | 组件里**不许**出现写死的十六进制颜色；所有色值定义在 `src/styles/base.css` |
| 新增变量必须定义两遍 | `:root` 和 `:root[data-theme='cph-light']` 都要给值，否则浅色主题下会串色 |
| 禁止第三方 UI 库 | 抽屉 / 弹层 / 下拉全部原生 CSS + Vue + `Teleport` |
| 顶栏按钮不能进 Teleport | 抽屉本体 Teleport 到 `body`，**触发按钮不许跟着走**，否则脱离 flex 布局被挤出视口。窄屏下这颗按钮可以降级成省略号菜单里的一项（2026-09 起），因为菜单弹层仍在顶栏 DOM 内——但**别把它挪到 `body`** |
| 顶栏断点只能重测，不能照抄 | `TopBar.vue` 的五档阈值是按元素实测必需宽度反推的（现为 820 / 560 / 520 / 480 / 400，**触摸屏与鼠标要各量一遍**，数值表见第 3 节）。动了顶栏任何元素的宽度（文案、图标、gap、padding）都要**重新量一遍**，照抄旧值会在某一档悄悄溢出 |
| 面板下限只在 CSS 里定义一份 | 测试面板最低宽度由 `.workspace` 上的 `--tests-min-cap / --tests-min-ratio / --tests-min-floor` 决定（即 `.pane--tests` 的 `clamp(160px, 50%, 320px)`），`measureLimits()` 读同一组变量复算；改数字只改 CSS 那三行，别在脚本或组件里再写一份 |
| 顶栏装不下时不会省略，而是整体右溢出 | `.topbar` 没有 `flex-wrap`，`.tool` / `.primary` 都是 `white-space: nowrap`，所以宽度不够时既不换行也不截断，只是整体向右溢、把运行按钮挤出视口。窄屏只能靠断点主动舍弃（见第 3 节） |
| 窄屏弹层必须由视口定位 | 弹层默认 `right: 0` 锚在栏中部那颗按钮上，窄屏会溢出到视口外（实测 375px 下 `left = -28`）。**只收窄 `width` 救不了**，因为锚点本身不在栏右端；≤520px 一律改 `position: fixed` 贴边整幅 |
| flex 容器的子元素要显式拉伸 | 布局里 `.pane > *` 必须 `flex: 1 1 auto; min-width: 0`，否则子组件收缩到内容宽度 |
| Monaco 只能动态改 | 设置项变化走 `editor.updateOptions()` / `monaco.editor.setTheme()`，**不要重建实例** |
| 设置要持久化 | 统一用 `src/composables/usePersistentRef.js`（存的是 JSON 字符串，见第 5 节的坑） |
| SW 改了策略就升版本号 | `public/sw.js` 的 `VERSION` 决定缓存桶名（`cph-shell-v1` / `cph-toolchain-v1`）；改缓存内容或策略时必须同步升它，否则老用户会一直吃旧桶 |
| 图标是构建产物之外的静态资源 | `public/icons/*.png` 直接进产物，**不在**构建清单里，改动它们要同步 `sw.js` 的 `STATIC_ASSETS`（见第 9 节） |

## 2. 与界面相关的文件

```
index.html                      # 除挂载点外还负责 PWA 的 manifest / apple-touch-icon / theme-color（见第 9 节）
vite.config.js                  # COOP/COEP 响应头（本地沙箱的硬前提，别动）+ 构建期产出 precache-manifest.json
vercel.json                     # 部署侧同一组响应头 + .wasm 的 MIME 与 immutable 缓存 + manifest/sw.js 的响应头（见第 10 节）
public/manifest.webmanifest     # PWA 清单：display standalone、start_url /、scope /
public/sw.js                    # Service Worker：预缓存外壳 + 52MB 工具链，导航网络优先（见第 9 节）
public/icons/                   # PWA 图标：icon-192/512、icon-maskable-192/512、apple-touch-icon(180)
public/wasm/8.0.1/              # 自托管的工具链：clang.wasm / wasm-ld.wasm / clang-fs.tar.gz（约 52MB，进仓库）
scripts/verify-ui.mjs           # 无头回归脚本（A–E 已修绿，F 仍红，见第 8 节）
scripts/optimize-wasm.mjs       # wasm-opt 体积优化（npm run wasm:opt）——**刻意未接进构建**，结论见第 7 节
docs/使用手册.md                # 面向新用户的说明：只回答「如何在本地运行 C++」「如何展开/折叠样例栏」，与 HelpPanel.vue 内容同源
src/
  main.js                       # 挂载 + 生产构建里注册 Service Worker
  monaco-setup.js               # Monaco 的 cph-dark / cph-light 两套自定义主题
  styles/base.css               # ★ 所有 CSS 变量 + 全局元素样式，改配色只改这里
  App.vue                       # 布局骨架（workspace / pane / splitter）+ 全局状态
  composables/usePersistentRef.js
  composables/useInstallPrompt.js  # 顶栏「安装」按钮的数据源：拦 beforeinstallprompt，用完即弃
  composables/useMobileKeyboard.js # 触摸屏「键盘模式」：视口收缩 + 不抢焦的保焦拦截（见第 3 节末）
  components/
    TopBar.vue                  # 顶栏：语言/引擎/连接/布局/设置/本地环境/安装/帮助/键盘模式/运行（50px 高）+ 五档响应式断点与省略号收纳（见第 3 节）
    EditorPane.vue              # Monaco 容器 + 文件页签
    EditorSettingsPanel.vue     # 右侧设置抽屉（Teleport，按钮在顶栏）
    LocalRuntimePanel.vue       # 右侧本地运行环境抽屉（Teleport，按钮在顶栏）
    HelpPanel.vue               # 右侧「使用帮助」抽屉（Teleport，按钮在顶栏最右；只读，内容是三条常见操作解答，与 docs/使用手册.md 同源）
    TestPanel.vue               # 右侧评测面板：页头（verdict「全部 AC / n/m AC」/耗时/时限）+ 用例列表 + 页脚运行按钮
    TestCaseCard.vue            # 单个用例卡片：徽标（AC/WA/CE/TLE/RE/ERR 判定码）/ 耗时 / 输入框 / 输出块
    AppIcon.vue                 # 内联 SVG 图标集（name 取图标名）
  services/                     # 判题逻辑，改样式基本不碰
    runner.js                   # 逐用例调度（并发 2）+ 进度回调；引擎 outcome 翻译成卡片 verdict（AC/WA/CE/TLE/RE/ERR）
    compare.js                  # 实际输出与期望输出比对，只返回布尔（不再产出「输出多 N 行」之类 hint）
    templates.js                # 各语言默认模板
    engines/                    # 引擎注册表：piston（默认）/ judge0 / wasm / echo
    wasmRuntime.js              # 本地沙箱的唯一入口：阶段播报 + 看门狗 + 串行队列 + PCH 后台预热
    runnoSandbox.js             # runno 的 clang 流水线（工具链地址、编译产物缓存、PCH 生成都在这里）
    pchStore.js                 # PCH 的 IndexedDB 存档（原生 API，任何失败都按「没有存档」处理）
```

## 3. 布局骨架（改布局 / 尺寸看这里）

`App.vue` 模板（`src/App.vue:434` 起）：

```
div.app（column，100% 高）
├─ TopBar                    高度 50px，flex: 0 0 50px（TopBar.vue:277）
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
- `.splitter` 视觉 1px 细线、热区 12px（负外边距各压进卡片 3px，卡片净间距 6px）；折叠状态下热区加宽到 24px。触屏（`pointer: coarse`）下热区同样加宽到 24px，**但负外边距要同步从 -3px 改成 -9px**——两者一起改，分隔条在 flex 里才仍只占 6px，两侧卡片位置逐像素不变。
- `.splitter` 必须声明 `touch-action: none`。触屏手势的归属是浏览器在 `pointerdown` 那一刻定的：缺这行它就把这一拖当成滚动/缩放，随即发 `pointercancel`，而 `beginDrag` 的 `stop` 正挂在 `pointercancel` 上，于是手机上按下即被打断。`pointerdown` 里的 `preventDefault()` 挡不住（按规范它只抑制兼容的 `mousedown` / `mouseup`）。
- 折叠阈值在 `App.vue` 的拖拽逻辑里（贴边 32px 内折叠、离开边缘 60px 展开），改视觉宽度时注意别和阈值打架。
- `measureLimits()` 用面板的**最低宽度 + 分隔条实际渲染宽度**算拖拽上限，两项都随视口与触屏档变（见下面「测试面板的最低宽度」）。

### 顶栏的响应式（`TopBar.vue`，2026-09 加）

五档断点 + 一档弹层定位，阈值全部由实测反推。各档「必需宽度」= 可见 flex 项宽度之和 + gap + padding，**不含 `.spacer`**（它总是吃掉剩余空间，算进去公式会自证），**`display: contents` 的容器摊平后递归统计**。下表是 2026-09-18 加入顶栏「键盘模式」按钮时测的；同日稍后该按钮被撤掉（见第 3 节末），所以**现在的实际必需宽度比下表小 38px**，阈值未跟着调回（多出的余量无害）。

| 档位 | 条件 | 顶栏让位的东西 | 触摸屏必需宽度 | 鼠标必需宽度 | 该档可用下限 | 余量（触屏） |
| --- | --- | --- | --- | --- | --- | --- |
| 宽档 | ≥821px | — | 715 | 677 | 821 | 106 |
| 1 | ≤820px | 品牌名 + 分隔线（装饰）、运行按钮文案（只留 ▶） | 537 | 499 | 561 | 24 |
| 2 | ≤560px | “语言”二字 | 507 | 469 | 521 | 14 |
| 3 | ≤520px | 帮助、换边 → 折进省略号 | 469 | 431 | 481 | 12 |
| 4 | ≤480px | 引擎设置齿轮、安装 → 折进省略号 | 379 | 341 | 401 | 22 |
| 5 | ≤400px | 编辑器齿轮、本地运行环境 → 折进省略号 | 289 | 251 | 320 | 31 |

- 「该档可用下限」= 下一档阈值 + 1（末档取支持的最小宽度 320px）。表里触摸屏比鼠标宽 38px 是因为当时有「键盘模式」按钮（28px + 10px gap），该按钮撤掉后两列已等价。
- 怎么量「必需宽度」：先把 `.topbar > * { flex-shrink: 0 }` 注进去（并把 `.spacer` 藏掉），再量最后一个可见子项右缘到栏左缘的距离 + 右内边距。**不能直接量 `scrollWidth`**——栏不是滚动容器，收缩后的子项不会让它溢出，量出来的恒等于栏宽。
- **每档折走两颗**：省略号自己占一格（28px + 10px gap），只折一颗净值是 0，白折。
- 收纳位在图标簇最右端（最右是「⋯」自己），折叠顺序是 **帮助 → 换边 → 引擎齿轮 → 安装 → 编辑器齿轮 + 本地运行环境**；位置不动，只往左吞。
- **第 4 档阈值由 460 抬到 480**、**第 5 档由 380 抬到 400**：当时是为了给「键盘模式」按钮腾位置（折叠三格仍需 469px）。该按钮已撤掉，这两档现在偏保守约 38px，**没有调回**——调回属于新的改动，要动就按第 127 行的复测口径重新逐像素量一遍。
- **菜单项复用同一批开关**（`setEditorSettingsOpen` / `setLocalRuntimeOpen` / `setHelpOpen` / `settingsOpen` / `emit('toggle-layout')`），**不复制组件**：抽屉与弹层始终只有一份实例。
- 折叠时给 `.settings` 加 `display: contents`：既腾出它那格（齿轮按钮 `display: none` 后 `.settings` 宽度为 0，但仍占一个 gap），也让弹层不再挂在零宽锚点上。弹层的 `fixed` 阈值**刻意保持 520px**——比齿轮折叠的第 4 档（480）更早一档，齿轮还可见的那段宽度里弹层也已由视口定位。
- 三个抽屉（编辑器偏好 / 本地运行环境 / 使用帮助）互斥：`closeDrawers(except)` 一次关掉另外两个，并顺手关掉引擎设置弹层（否则遮罩把它盖住、关掉抽屉后它又冒出来）。
- 隐藏一律用 `display: none`（而非 `visibility` / `opacity`），顺带从无障碍树里摘掉；因此运行按钮的可访名改由模板上的 `aria-label` 承担——**文字被藏的元素必须另给可访名**。
- 量宽度时的两个口径坑：`display: none` 父元素内的子元素，`getComputedStyle(child).display` **仍返回它自己的值**（不是 `none`），判可见要量外层容器；`display: contents` / `display: none` 的子元素不生成盒子、**不占 gap**，量必需宽度时要把它们排除，否则每档虚高几十像素。
- 语言下拉是**定宽**的：原生 `<select>` 按最宽的选项（「Python 3」）算宽，切到 Python 后各档必需宽度一个像素都没变（已复测）。会变宽的只有运行按钮文案，而它在 ≤820 档已藏，带文案的宽档留了 90px 以上余量。
- **复测口径**（2026-09-18 更新）：触屏与鼠标各跑一遍 **300–900px 逐像素**，同时判两件事——`topbar.scrollWidth - clientWidth === 0`（没溢出）、每个图标按钮宽度不小于它的正常值（28px / 35px，没被 flex 挤扁）。**别只看溢出**：`.tool` 的 `flex-shrink` 默认为 1，挤扁到 17px 时图标被裁掉但仍不溢出，只量溢出的探针会漏掉它。触屏要用 `page.setViewport({ hasTouch: true, isMobile: true })` 才会命中 `@media (pointer: coarse)`（`emulateMediaFeatures` 不支持 `pointer`）。**不要再用 iframe 或注入 `display: revert` 的方式模拟视口**——量不到真实溢出，返回的数字是自洽的假象。

### 测试面板的最低宽度（`App.vue`，2026-09 加）

`.pane--tests` 的 `min-width` 不再是固定 320px，而是 `clamp(160px, 50%, 320px)`。三个参数定义在 `.workspace` 上（`--tests-min-cap` / `--tests-min-ratio` / `--tests-min-floor`），**JS 不另存一份**：`measureLimits()` 从 `getComputedStyle(workspace)` 读这三个变量，再按 `max(floor, min(cap, 内容宽 × ratio))` 复算面板下限。改参数只改 CSS 那三行（JS 里的 160 / 0.5 / 320 只是取不到变量时的兜底）。

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

### 触摸屏的键盘适配（2026-09-18 加，同日改版四次）

手机上虚拟键盘会盖住大半个屏幕。这套适配**在触摸屏上默认开启、没有开关**，只做两件事：**把整块应用收缩到键盘上方**（内容照常滚动）+ **焦点不要被「滑动」改变**。

**唤出键盘的时机用浏览器默认的**（焦点落进可输入文字的框里就弹），界面上不要另设开关。用户口径是：**滑动只滚动，轻点才聚焦**——一条曾经的失败尝试记在下面。
1. 加顶栏开关（先是「底部输入停靠栏 + 按钮」，再是「键盘模式按钮」）：真机上点按钮本身就会把焦点从编辑器抢走，反而把已经弹着的键盘收起来。两版都因此撤掉，**不要再加**。

- **默认开启的判定**：`matchMedia('(pointer: coarse)')` 为真即启用（鼠标设备上不写变量、不挂任何监听，行为与加这个功能之前逐像素一致）。
- **可视高度**：`.app.is-keyboard` 是 `position: fixed; top: var(--vv-top); height: var(--vvh)`。这两个变量由 composable 从 `window.visualViewport` 的 `height` / `offsetTop` 写进 `documentElement.style`（`resize` / `scroll` / `orientationchange` 都跟）。用 `top` 一起对齐是因为 iOS 上可视区会被顶上去（`offsetTop > 0`），只改高度的话底部仍会被键盘盖住。**没有用 `interactive-widget=resizes-content`**（Chrome 专用）。工作区是 flex、Monaco 是 `automaticLayout`，都不需要额外写高度。
- **保焦 = 只拦默认行为，不抢焦点**：键盘收起是因为焦点被移走了，所以监听 `document` 的 **`mousedown`（capture）**，目标不是可编辑元素时 `preventDefault()`：焦点不再移给 body，键盘不落。
  - 可编辑元素**一律放行**（`input, textarea, select, [contenteditable]`）。Monaco 的输入面是它自己那个 `textarea.inputarea`（Chrome 里实际聚焦到 `.native-edit-context`），卡片输入框是 `.ta`——挡掉它们就等于「焦点进不去编辑器」。
  - **只挡 `mousedown`，别改成 `pointerdown`**：挡 `pointerdown` 会把兼容的 `click` 一起吞掉，「运行全部」「添加样例」这些按钮就点不动了；挡 `mousedown` 只阻止焦点转移，`click` 照常触发（已用 `page.touchscreen.tap()` 验过）。
  - **别再加 `focusout` 抢焦兜底**（旧版踩过）：那会在点 Monaco 编辑器时把焦点立刻抢回底部输入框，真机反馈「焦点无法集中在代码编辑框中」就是这么来的。
- **滑动不改变焦点（滑动只滚动、轻点才聚焦）**：`touchstart` 记起点与「滑动前的焦点」，`touchmove` 位移超过 `PAN_SLOP = 8px` 即判为滑动。之后：
  - 这次触摸补上来的 `mousedown`（滑动幅度很小或压根没滚动成时浏览器仍会合成一次点击）在捕获阶段被 `preventDefault()` + `stopPropagation()`——不派给 Monaco，它就不会 `focus()`。
  - 再加一道 `focusin`（capture）兜底：滑动期间只要焦点跑到了可编辑元素上就还回去——还给「滑动前那个」（它是可编辑元素时 `focus()`，本来没焦点就 `blur()`）。两种时机都覆盖：判定为滑动的那一刻（**iOS 在 `touchstart` 就把焦点给了输入框，那时还没滑**，只在 focusin 里拦会漏），以及滑动过程中焦点又被移走。
  - `panning` 一直保留到下一次 `touchstart`（合成的点击是在 `touchend` 之后才来的，提前清掉就拦不住了）。轻点会在 `touchstart` 重置它，所以「滑动之后轻点」照常聚焦。
  - **判定「焦点落进可编辑元素」时必须认 Monaco 的输入面**：Chrome 里是 EditContext 的 `.native-edit-context`，它**不是** `contenteditable`（`node.isContentEditable` 为 false），上面那串 `input, textarea, ...` 选择器认不出来——漏掉它，第 6 条用例会「焦点被抢走却判不出来」，兜底形同虚设。
- **状态**：没有持久化。`cph.mobileKeyboard`、`cph.mobileInputDock` 两个旧键都已作废，残留在 localStorage 里无害。
- 验证口径（临时 puppeteer 脚本，跑完即删；触屏要用 `page.setViewport({ hasTouch: true, isMobile: true })` 才命中 `pointer: coarse`，`emulateMediaFeatures` 不支持 `pointer`）。触屏 390×844：`.app` 带 `is-keyboard`、`--vvh=844px`；**轻点**编辑器 / 卡片 `.ta` → 焦点分别进 Monaco 输入面与那个 textarea；**滑动**编辑器 → 焦点仍是 body；滑动后手动派一个 `mousedown` 给编辑器 → `defaultPrevented` 且焦点不进去；滑动期间手动 `focus()` 编辑器输入面 → 焦点被还回 body（这条是那道带的兜底闸，改前必红）；焦点在 `.ta` 时滑动编辑器 → 焦点仍在 `.ta`；滑动后再轻点 → 焦点能进；焦点在 `.ta` 时点面板标题、输出区 `.out`、顶栏 `.spacer` → activeElement 一字不变；视口 844→420 → `--vvh` 与 `.app` 高度都变 420。鼠标视口：无 `is-keyboard`、`--vvh` 为空、点输入框与输出区 `pre` 的聚焦行为照旧。
  - **选落点要避开本来就会改焦点的地方**，否则用例自己会测糊：卡片头左侧 30px 是折叠按钮（点了会把 `.card__body` 收起，输入框被 `v-show` 藏掉，焦点只能掉给 body）；面板头中部是时限的 `<label>`，点它会把 click 转给 `<select>`，焦点本来就会跟着走。

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
| `TopBar.vue:277` | `.topbar` `.select` `.popover` 及引擎/连接 chip（`height: 50px` 在这里）；`.engines` `.engine-row` `.engine__action`（本地沙箱行尾的下载 chip，约 `TopBar.vue:486/598`）；`TopBar.vue:629` 起是四档响应式断点 + 省略号收纳与菜单（见第 3 节） |
| `TestPanel.vue:102` | `.panel` `.panel__head` `.panel__heading` `.panel__title` `.verdict[data-tone]`（文案「全部 AC / n/m AC」）`.elapsed` `.limit` `.select` `.panel__foot` `.run-inline` |
| `TestCaseCard.vue:184` | `.card[data-status]` `.card__head` `.badge[data-status]`（文字是 `verdict` 判定码，见第 5 节坑 1）`.metric` `.icon-btn` `.card__body` `.ta`（输入，高度随内容自增）`.out`（输出）`.run-zone`（撑满徽标到删除按钮之间的运行判定区，`.run-zone__icon` 才是那个 22px 的 ▶）。旧的 `.hint` 已随 2026-09-18 改动删除 |
| `EditorPane.vue:158` | `.tab` `.tab__icon` |
| `EditorSettingsPanel.vue:162` | `.icon-button` `.panel-drawer*` `.select` |
| `LocalRuntimePanel.vue:181` | `.panel-button` `.panel-drawer*` `.runtime-row*` `.panel-note` |
| `HelpPanel.vue:130` | `.help-button` `.panel-backdrop` `.panel-drawer*` `.panel-note` `.help-group*` `.help-item*` |
| `base.css:141` 起 | `body`、`button`、`input/textarea/select`、滚动条、`:focus-visible`、`prefers-reduced-motion` |

## 5. 改样式时的几个坑

1. **状态色是三元组，但徽标文字是判定码**：卡片/徽标颜色用 `data-status="passed|failed|error|running"`（`TestCaseCard.vue`），面板小结用 `data-tone="passed|failed|error|info"`（`TestPanel.vue`），加新状态要同时补 CSS 分支。徽标里显示的文字不是状态名，而是用例记录上的 `verdict` 字段（`AC / WA / CE / TLE / RE / ERR`，没跑时回退「待运行/运行中」）；颜色归 `status`、文案归 `verdict`，两者在 `runner.js` 的补丁里成对产出，别合并成一个字段。
2. **Monaco 文字用 NBSP 渲染**：用脚本读 `.view-lines` 的文本时，空格是 `\u00a0`（charCode 160），`includes('def solve')` 这类断言永远匹配不上。
3. **Monaco 的 `.minimap` DOM 节点始终存在**，关闭时宽度为 0；判断"有没有小地图"要看 `getBoundingClientRect().width`，不是 `querySelector`。
4. **localStorage 里存的是 JSON 字符串**：`cph.panelPosition` 的值是 `"left"`（带引号）。直接比较原始字符串会误判。
5. **面板折叠是 `v-show`**，测试栏 DOM 一直在（分隔条要能用鼠标/键盘把面板拖回来）。
6. `@media (prefers-reduced-motion: reduce)` 会全局压掉动画，新增动画不用额外处理。
7. 抽屉有两个（设置 / 本地运行环境）**互斥**，开一个会关另一个；改抽屉宽高/动画时别破坏这个联动。
8. **用例输入框的高度是 JS 撑的**（`TestCaseCard.vue` 的 `autoGrow`，上限 320px）：改 `.ta` 的内边距 / 字号后高度会自己重算，不用手改。但卡片折叠用的是 `v-show`，此刻 `scrollHeight` 为 0，代码会跳过重算，面板重新展开时会再算一次——别把这个空值保护删了，否则折叠一次输入框就被压成 0 高。
9. **`.run-zone` 是撑满中段的 `<button>`**：里面的 `padding: 0` 不是装饰，是在抵消浏览器给按钮的默认内边距（不抵消的话 ▶ 图标位置会跑偏）；`.run-zone__icon` 才是那个 22px 的 ▶ 本体，悬停点亮的是它。
10. **`theme-color` 是 JS 写的，不是静态 meta**：`App.vue` 切主题时会把 `--bg-chrome` 读出来写进 `<meta name="theme-color">`（装成独立应用后浏览器拿它画窗口标题栏）。`index.html` 里那个 `content` 只是首帧兜底，别在那里维护第二份色值。

## 6. 已持久化的状态（加设置项时照抄这套）

| key | 内容 | 位置 |
| --- | --- | --- |
| `cph.editorSettings` + `cph.editorSettingsVersion` | 字体、tab、换行、小地图、**主题**（`theme`） | `App.vue:24-35` |
| `cph.panelVisible` / `cph.panelPosition` | 测试面板是否展开 / 面板在左还是右 | `App.vue:13-15` |
| `cph.editorShare` | 两栏比例（%） | `App.vue:17` |
| `cph.timeLimitMs` | 全局时限（毫秒，只计运行段） | `App.vue:20` |
| `cph.language` / `cph.drafts` / `cph.testCases` / `cph.engine` / `cph.judgeBases` | 语言、各语言草稿、用例、引擎、服务地址 | `App.vue` |
| `cph.mobileKeyboard` / `cph.mobileInputDock` | 都已作废（两个版本的键盘适配都不再持久化）；残留在 localStorage 里无害 | `composables/useMobileKeyboard.js` |
| `cph.localRuntime.clangReady` | C++ 本地工具链是否已拉取（只表示「这台浏览器下过一次」，用来少点一次「下载」；标记过期也无害） | `composables/useLocalRuntime.js`（顶栏引擎弹层的下载 chip 与本地运行环境抽屉共用这一份状态） |
| `cph.pchUnsupported` | 本机被判定扛不住 PCH（生成时 OOM / cc1 卡死，或 PCH 加载校验失败）后写下的永久开关；有它就不再生成、编译也不再挂 PCH | `runnoSandbox.js` |

另外 PCH 二进制（约 6.9MB）存 IndexedDB 而不是 localStorage：库名 `cph-pch`、store 名 `pch`，记录形状 `{ id, bytes: Uint8Array, size, createdAt }`；`id = 存档版本:工具链版本:微缩头内容的 FNV-1a 哈希`（当前是 `1:8.0.1:69dc7cd9`），三者任一变化旧存档自然失效，取存档只按这个 id。

写值统一走 `usePersistentRef(key, defaultValue)`；`editorSettings` 因为要版本迁移，单独用 deep watch 存。

## 7. 现在的功能边界（写文案时别夸大）

- 引擎：Piston（默认，需自建服务）/ Judge0 / **本地 WASM 沙箱**。本地沙箱只支持 C++，首次运行要下载工具链（`public/wasm/8.0.1/` 自托管的 clang + wasm-ld + sysroot，裸文件约 52MB、由 Vercel 边缘压缩传输，之后工具链常驻 HTTP 缓存）。下载有两个入口、同一份状态（`composables/useLocalRuntime.js`）：「本地运行环境」抽屉，以及引擎设置弹层里本地沙箱那一行尾部的下载 chip（工具链未就绪时才出现；点 chip 只下载、**不切换当前引擎**；引擎注册表里用可选的 `localRuntime: true` 声明，界面不硬编码引擎 id）。编译产物按源码原文缓存一份，所以成批跑用例时只有第一个用例付编译开销。
- 本地沙箱**没有 Python**（面板上 Python 是禁用态）。Vim 键位已移除（与 Monaco 0.56 不兼容），别再被试着重加。
- TLE：面板页头的「时限」（1/2/5/10 s，默认 1 s）只计**程序运行段**，不含编译；超时靠 `kill()` 当前 WASI 实例实现。卡片上的耗时**同样是运行段**（与时限同口径），程序没跑起来时（编译失败 / 编译错误）卡片不显示耗时。
- **耗时口径（2026-09 改过，别改回去）**：卡片数字 = `runCpp` 里只包住 `runWasi` 的那一段，编译时间不计入。原先取的是 `runCase()` 入口到结束的墙钟，于是第一个用例含编译、命中编译缓存的后续用例只含运行，**同一份代码下第一个卡片能比其余大好几倍**（修前 3 个用例是「数百 ms + 9ms + 12ms」，修后 10/11/7ms），很容易被误读成「程序在第一个用例上特别慢」。面板页头那个 `elapsed` 现在也是同一口径：取当轮所有卡片耗时的**最大值**（`App.vue` 里是 computed，单独跑一个用例也会跟着更新），标题写明「最慢用例耗时」。TLE 消息里的 `durationMs` 与卡片同口径（`wasmRuntime.js` 在进入 `run` 段时重置 `stageStartedAt`）。
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
- **PWA：装到设备后可独立窗口运行，且断网也能编译**（2026-09 加，见第 9 节）。工具链被 Service Worker 一起预缓存，所以离线状态下本地沙箱、判题、主题、布局全部照常，只有 Piston / Judge0 这两种远端引擎会失效。装完之后顶栏的「安装」按钮自动消失，也不会再重复提示。

## 8. 验证方式

- 手工：`npm run dev`，浏览器 http://localhost:5199，重点看**两套主题各一遍**、面板折叠/展开、分隔条拖拽与双击。
- 本地沙箱端到端（动过 `runnoSandbox.js` / `wasmRuntime.js` / 工具链目录后必做）：手工路径是顶栏切「本地 WASM 沙箱」→ 跑一段带 `vector` / `sort` 的 A+B，看输出对不对、同一份代码第二次跑是否秒回（编译缓存）。想自动化就临时写个 puppeteer 脚本，在页面上下文 `import('/src/services/runnoSandbox.js')` 后直接调 `preloadToolchain()` 和 `runCpp({ code, stdin })`——**用完删掉脚本**，仓库里不留临时探针（这条纪律之前踩过：残留探针把 `scripts/` 弄得很乱）。
- PCH 专项（动过 PCH 段落 / `FRONTEND_ARGS` / 微缩头后必做），同样临时探针、用完即删：
  1. DevTools → Application → IndexedDB 删 `cph-pch` 库、localStorage 删 `cph.pchUnsupported`，从零开始；
  2. 切「本地 WASM 沙箱」点一次「运行全部」（默认模板是合法 A+B，输出应判定通过），随后 IndexedDB 的 `pch` store 应在约 1 秒内自己出现一条 7,249,912 字节、id 前缀 `1:8.0.1:` 的记录（证明后台 `warmupPch()` 真的跑了）；
  3. 刷新页面再跑一次：编译应吃到存档（UI 每题耗时约从 600ms 降到 350ms 量级），输出与首次逐字一致；
  4. 降级：把那条记录的 `bytes` 改成任意垃圾字节再刷新运行，用户代码仍应正常通过，同时 `cph.pchUnsupported` 被置成 `true`、坏记录被删。
  注意：直接 `import` 模块做 A/B 时，无 PCH 基线要用「先置 `cph.pchUnsupported=true`」走真实降级分支，不要只是改参数——对比的必须是两条产品代码路径。
- PWA / 离线专项（动过 `sw.js` / manifest / 图标 / 预缓存清单后必做），仍然临时探针、用完即删：
  1. `npm run build && npm run preview`（**必须是生产构建**，dev 下不注册 SW），DevTools → Application 应看到 manifest 无报错、Service Worker 已是 `activated`；
  2. Application → Cache Storage 应有两个桶：`cph-shell-v1`（约 100 条：外壳 + 全部 Monaco 分块 + 静态资源）与 `cph-toolchain-v1`（3 条，clang / wasm-ld / clang-fs 全中）；
  3. 切「本地 WASM 沙箱」跑一次「运行全部」，确认判定通过；
  4. DevTools → Network 勾 Offline（或直接拔网线），刷新页面：顶栏应正常渲染，再跑一次「运行全部」仍应通过——这一步才是真的在验工具链入了缓存，只看第 2 步的条数不够；
  5. 自动化同上一节：临时 puppeteer 脚本里用 `Page.getAppManifest` 拿 manifest 解析错误、用 `page.setOfflineMode(true)` 断网后跑一遍，跑完删脚本。
- 响应式专项（动过 `TopBar.vue` 的断点或任何顶栏元素宽度后必做），临时探针、用完即删：在 320 / 375 / 414 / 520 / 560 / 820 / 1200 逐档量「必需宽度 = 子元素宽度之和 + gap + padding − `.spacer`」和「运行按钮右缘是否 ≤ 视口宽」。**只看有没有横向滚动条不够**：`.spacer` 会吸收剩余空间，所以 `topbar.scrollWidth` 在真溢出之前一直等于 `clientWidth`，必须按上面那个公式自己算差值。窄屏还要顺手验：375px 下打开省略号菜单，弹层 `getBoundingClientRect()` 应完整落在视口内（`left ≥ 0` 且 `right ≤ innerWidth`，修复前是 `left = -28`），并把菜单四项各点一次，确认能真的开抽屉 / 开引擎弹层 / 换布局。量的时候注意第 3 节记的那两个口径坑。
- 无头回归：`scripts/verify-ui.mjs`（`npm run verify`）。**A–E 应当是绿的，F 仍是红的**，跑之前先知道这几条：
  - F 断言切到 Python 后 `.view-lines` 文本含 `def solve`——Monaco 把空格渲染成 NBSP（第 5 节坑 2），`includes('def solve')` **永远匹配不上**，属探针 bug（对照：A 步的 `includes('include')` 因为没有空格所以能过）。修法是断言前把 `\u00a0` 归一成空格，**不是**页面坏了。
  - 它自己起 dev server，和常驻的 5199 冲突（`--strictPort`，撞上就直接退出），跑的时候用 `VERIFY_PORT=5299` 覆盖。
  - 它跑的是默认 Piston 引擎（需要本地有 `localhost:2000` 服务），所以**E 步是「空过」**：断言只看徽标数量，引擎连不上、三个卡片全报错也照样 PASS，验不到本地沙箱。
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
| `src/composables/useInstallPrompt.js` | 拦 `beforeinstallprompt` 交给顶栏按钮，跟踪 `appinstalled` 与 `display-mode: standalone` |

**Service Worker 的三段策略**：

- `install`：读构建期产出的 `/precache-manifest.json` 拿全部带哈希的产物名，与 `sw.js` 里手写的 `STATIC_ASSETS`（`public/` 下那些不过构建的静态资源：favicon、manifest、图标）合并后一起预缓存；工具链单独进 `cph-toolchain-v1`。**逐条 `catch` 容错**——灵感来自 52MB 的工具链，任何一条失败都不能让整次 install 作废（install 失败等于永远装不上），漏掉的之后由 fetch 处理器补。
- `activate`：删掉名字不在保留名单里的缓存桶，再 `clients.claim()`。
- `fetch`：只碰同源 GET。**导航网络优先**（重新部署后刷新一次就拿到新外壳，断网才退回缓存的 `index.html`），其余缓存优先。跨域一律放行——判题服务地址是用户填的，SW 插手就会变成 CORS 事故；带 `range` 头的请求也放行，206 塞进 Cache Storage 会抛错。

**为什么文件名清单要构建期生成**：产物名带内容哈希，没法在 `sw.js` 里硬编码。`vite.config.js` 里那个 `cph-precache-manifest` 插件在 `generateBundle` 时把 `bundle` 的键写成 `precache-manifest.json`，正好绕开引依赖这件事。加产物类型（比如新图）时它会自动跟上，**不用改 `sw.js`**；但 `public/` 下的东西不过 `bundle`，加文件必须手动补进 `STATIC_ASSETS`（第 1 节表里那两条约束就是这么来的）。

**两个版本号，别混**：

- `sw.js` 的 `VERSION = 'v1'` —— 常量前缀，决定缓存桶名。改缓存策略或 `STATIC_ASSETS` 就升它，`activate` 会把旧桶整个删掉。**只在缓存桶名上生效，和工具链版本无关。**
- 工具链目录 `public/wasm/8.0.1/` —— 换目录名即自然失效，`sw.js` 的 `TOOLCHAIN_ASSETS` 要跟着改（第 7 节那条约定）。

**注册时机**：`src/main.js` 里 `import.meta.env.PROD && 'serviceWorker' in navigator` 才注册，且挂在 `window.load` 上。**dev 下刻意不注册**——Vite 的模块是即时编译的，缓存它只会让改完代码看到旧页面；所以 `npm run dev` 里既没有安装入口也测不到离线，要验就走 `npm run build && npm run preview`。

**安装入口**：顶栏那个「安装」按钮只在 `beforeinstallprompt` 真的触发后才出现（说明浏览器已判定可安装），点它调 `prompt()`，`userChoice` 返回后事件即失效、按钮跟着隐藏；已经装在独立窗口里跑或已被 `appinstalled` 标记过，也都不再显示。iOS Safari 没有 `beforeinstallprompt`，只能手动「分享 → 添加到主屏幕」，未做提示引导（要加就在这里加）。

## 10. 部署（GitHub + Vercel）

- 仓库：https://github.com/hejiehejiehejiehejie/wasm-oj-frontend.git （私有），`main` 分支就是部署分支，推上去 Vercel 自动构建。
- Vercel 面板导入时的配置：Framework Preset 选 `Vite`，Build Command `npm run build`，Output Directory `dist`，Install Command 用默认。
  - **环境变量留空**：前端没有任何密钥；判题服务地址是用户在顶栏填的，存在 `cph.judgeBases` 里。
  - Node 版本不用在面板上设，`package.json` 的 `engines.node = 22.x` 已经钉死，`build` 就是一句 `vite build`。
- `vercel.json` 负责五件事，**别删**：
  1. 全站注入 COOP `same-origin` / COEP `require-corp` —— 少任何一个，本地沙箱连 `SharedArrayBuffer` 都拿不到；
  2. `.wasm` 声明 `Content-Type: application/wasm` —— MIME 不对时 `WebAssembly.instantiateStreaming` 会直接拒绝加载；
  3. `.wasm` 与 `/wasm/(.*)` 一年 immutable 缓存；
  4. `/manifest.webmanifest` 补 `Content-Type: application/manifest+json` 并禁缓存 —— Vercel 对这个扩展名的 MIME 不保证，错了 Chrome 会直接判定「manifest 无效」从而不给出安装入口；
  5. `/sw.js` 与 `/precache-manifest.json` 禁缓存（`max-age=0, must-revalidate`）—— Service Worker 脚本被长缓存的话，发了新版用户也永远拿不到。
  本地 `vite.config.js` 的 `server.headers` / `preview.headers` 是同一组头的开发侧对应物，两边要一起改。
- 工具链裸文件（约 52MB）直接进仓库：Vercel 边缘会做压缩传输，**不要自己塞 `.br` / `.gz` 预压缩文件**——那会被二次压缩成 `Content-Encoding: br, br`，Safari 直接崩。
- 最大的单文件 31.2MB，远低于 GitHub 的 100MB 单文件上限，可以直接 `git push`（但会明显变慢，属正常）。
- **工具链直到 2026-09-18 才进 git**（此前 `public/` 里只有 `favicon.svg`）：本地 `npm run dev` 一直正常是因为 dev server 直接读工作区，**与 git 无关**，所以这个缺口长期不可见。如果 Vercel 是**从 git 构建**的，那次入库之前线上取 `/wasm/8.0.1/*` 会 404（若线上沙箱一直可用，说明它是用 CLI 直接上传的）。入库后两条路径已对齐，部署完按上面的冒烟检查验一次 `content-type` / `cache-control` 就能确认。
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