# 第三方开源组件致谢（NOTICE）

本站（unnamed，仓库 `wasm-oj-frontend`）自己写的只有界面、交互与判题逻辑；能跑起来靠的是一批开源项目。
这份文件是**第三方组件的唯一清单**，目的有两个：**致谢**，以及在分发时**保留各项目要求的版权与许可声明**。

面向用户的精简版在 `guide.html` 的「致谢与开源许可」一节，**完整版（就是本文件）会自动生成成站点上的 `notice.html`**（`npm run notice`，那一页从 `guide.html` 链接过去）；**以本文件为准**。

英文版是 `NOTICE.en.md` → `notice.en.html`（同样从 `guide.en.html` 链接过去）。**两份源文件之间没有自动同步**：章节与表格行逐条对应，改一份就要手改另一份。

## 维护约定

- 改 `package.json`（增删依赖 / 升级大版本）、换 `public/wasm/` 下的工具链目录、换 `public/md/` 下的渲染运行时（跟着 katex / marked 的版本走）、换 `public/extension/` 里的扩展包、换 `public/fonts/` 下的内置字体 —— 五件事任一发生，都要回来同步这份文件。
- **版本号一律实机核出来，不要凭记忆手写**（末尾附了核对命令）。
- 站点是公开部署的，产物里带着别人的代码，所以这份清单不是「本地备忘」，是分发义务的一部分。
- 本文件只列**别人的**项目。本仓库自己目前没有 `LICENSE` 文件（即默认「保留所有权利」），这不影响上面那些第三方许可的义务，但若将来要开源本站代码，需要另做决定。

> 最后核对：**2026-10-02**（代码区新增三款内置等宽字体：JetBrains Mono 2.211 / Fira Code 5.002 / Cascadia Code 2407.024，源文件落在 `public/fonts/`。**只取 latin 子集的 woff2（Regular + Bold，合计 149KB）**，来自 [@fontsource](https://github.com/fontsource/fontsource) 5.3.0 的构建产物，上游均为 **OFL-1.1**。版本号按字体内部的真实版本核出 —— fontsource 的包偏旧，例如 Fira Code 上游 6.2 而包内是 5.002，按上游 release 号写文件名就会记错。属于新增素材而非依赖变动，`package.json` 与运行时清单**未变**）。
>
> 此前一次核对：**2026-10-01**（同日两次换扩展包：先 → `cc-for-web-2.66.1.zip`（行为改动同上一条，握手消息名去 `cph-` 前缀），随即 → `cc-for-web-2.66.2.zip`（行为改动：「样例待抓名单」机制整体移除 —— 扩展不再保存名单，改成用户打开题目页时由扩展现场问网页「这道题在工作区里且样例为空吗」（新消息 `cp-query-need` / `cp-need-answer`，见 `src/composables/useCompanionBridge.js`），要抓才抓；跨仓契约，必须与本站同版发布）。两次都属于行为改动而非依赖变动，包内第三方组件的版本与许可**未变**）。
>
> 上上一次核对：**2026-10-01**（换扩展包 → `cc-for-web-2.66.0.zip`。唯一的改动是插件与网页之间的握手消息名去掉 `cph-` 前缀、统一成 `cp-`（跨仓契约，见 `src/composables/useCompanionBridge.js`），属于行为改动而非依赖变动，包内第三方组件的版本与许可**未变**）。
>
> 上一次核对：**2026-09-30**（同日两件事：① 换扩展包 → `cc-for-web-2.65.3.zip`，行为改动是「可在本站设置页直接切换投递目标」，包内第三方组件的版本与许可**未变**；
> ② 题解功能上线，新增自托管的 Markdown / LaTeX 渲染运行时 `public/md/`（KaTeX 0.18.9 + marked 14.0.0），并因此把 `marked` / `dompurify` / `katex` 提为本站的**直接依赖**。
> 依赖清单按同一天的 `package-lock.json` 重核：`lockfileVersion: 3`，共 **94** 条依赖：**30** 条生产、**64** 条开发）。

---

## 一、站点运行时依赖（随产物分发）

| 组件 | 版本 | 许可 | 用途 |
| --- | --- | --- | --- |
| [Vue](https://github.com/vuejs/core) | 3.5.42 | MIT | 整个界面的框架 |
| [Monaco Editor](https://github.com/microsoft/monaco-editor) | 0.56.0 | MIT | 代码编辑器（VS Code 的编辑器内核） |
| ├─ [marked](https://github.com/markedjs/marked) | 14.0.0 | MIT | Monaco 的传递依赖（Markdown 渲染） |
| └─ [DOMPurify](https://github.com/cure53/DOMPurify) | 3.4.8 | **MPL-2.0 OR Apache-2.0**（双许可） | Monaco 的传递依赖（HTML 净化）。**这是本站唯一一个非宽松许可的运行时依赖** |
| [KaTeX](https://github.com/KaTeX/KaTeX) | 0.18.9 | MIT | 题解的 LaTeX 公式渲染。**不在主包里**，只在 `public/md/` 按需下载（见 2.2） |
| [@runno/wasi](https://github.com/taybenlor/runno) | 0.10.0 | MIT | 本地沙箱的 WASI 运行时：起实例、喂 stdin、`kill()`（TLE 靠它） |

题解功能（2026-09-30 上线）把上面那两条 Monaco 的传递依赖也提成了**本站的直接依赖**：`mdRenderer.js` 直接 `import` DOMPurify（本来就随 Monaco 进主包），marked 则除了 Monaco 拉进主包的那一份之外，还在 `public/md/` 里自托管一份按需下载。已实测（在主包 `dist/assets/main-*.js` 里搜）：
`DOMPurify` ✓、`marked` ✓（Monaco 依赖树那一份）、`katex` ✗（主包里只有「katex」字样的文案与文件名）。
所以「按需下载」不等于「没下载过的用户外壳里一份 marked 都没有」—— **marked 早在主包里了**；`public/md/` 那一份是为了让渲染器与站点版本对齐，同时把 katex 整个挡在首屏之外。

`package-lock.json` 里那 30 条「生产依赖」的其余部分（`@vue/compiler-*`、`@babel/*`、`entities`、`postcss`、`magic-string`、`source-map-js`、`estree-walker`、`csstype`、`nanoid`、`picocolors` 等）是 Vue 的编译器链，只在**构建期**使用，不进产物。

## 二、自托管运行时（`public/` 下，都只在用户点过「下载」之后才进浏览器）

两处共同点：都是**上游的产物被原样收进本仓库**（本站没有改动；`public/md/` 那份由 `scripts/prepare-md-runtime.mjs` 从 `node_modules` 抄出来），并且都**不在 Service Worker 的预缓存清单里** —— 没点过下载的用户，外壳里一份都没有。所以上游的版权声明随文件一并分发；完整许可文本在对应上游仓库里。

### 2.1 本地沙箱工具链（`public/wasm/`，约 76MB）

| 组件 | 版本 | 许可 | 落点与用途 |
| --- | --- | --- | --- |
| [LLVM / clang](https://github.com/llvm/llvm-project) | 8.0.1 | Apache-2.0 WITH LLVM-exception | `public/wasm/8.0.1/clang.wasm`（31.2MB）—— 本地编译 C++。预编译产物出自 [binji/wasm-clang](https://github.com/binji/wasm-clang)，经 runno 的 `langs/` 分发 |
| [LLVM lld](https://github.com/llvm/llvm-project)（wasm-ld） | 与上同世代 | Apache-2.0 WITH LLVM-exception | `public/wasm/8.0.1/wasm-ld.wasm`（19.5MB）—— 链接 |
| [wasi-libc](https://github.com/WebAssembly/wasi-libc) | 随上述 wasi-sysroot | Apache-2.0 WITH LLVM-exception | `clang-fs.tar.gz` 里的 `libc.a`、`libm.a`、`libpthread.a`、`libdl.a`、`librt.a`、`libutil.a`、`libxnet.a`、`libcrypt.a`、`libresolv.a`、`libwasi-emulated-mman.a`、`crt1.o` —— C 标准库与启动代码 |
| [libc++ / libc++abi](https://github.com/llvm/llvm-project) | 同上 | MIT（University of Illinois / NCSA 系） | 同上 tar 里的 `libc++.a`、`libc++abi.a` —— C++ 标准库（`<vector>` / `<string>` 这些） |
| [compiler-rt](https://github.com/llvm/llvm-project) | 同上 | Apache-2.0 WITH LLVM-exception | 同上 tar 里的 `libclang_rt.builtins-wasm32.a` —— 编译器运行时内建函数 |
| [CPython](https://github.com/python/cpython) | 3.11.3 | PSF License | `public/wasm/python-3.11.3/python.wasm` + `python-fs.tar.gz` —— 本地跑 Python。wasm32-wasi 构建，标准库在 `usr/local/lib/python311.zip`；构建同样取自 runno 的 `langs/` |

### 2.2 题解渲染运行时（`public/md/`，约 578KB）

题解的 Markdown 解析与 LaTeX 公式渲染走的也是同一条「按需下载」的路（`src/services/mdRuntime.js`）：下载前只有一句提示，下载后落进 Cache Storage 的 `cp-md-runtime`，设置页「本地运行环境」里可以连同缓存与浏览器上的全局变量一起卸载。

| 组件 | 版本 | 许可 | 落点与用途 |
| --- | --- | --- | --- |
| [KaTeX](https://github.com/KaTeX/KaTeX) | 0.18.9 | MIT | `katex.min.js` + `katex.min.css` + `fonts/KaTeX_*.woff2`（20 个字重）—— 体积的大头 |
| [marked](https://github.com/markedjs/marked) | 14.0.0 | MIT | `marked.min.js` —— Markdown 解析（与第一节里主包中的那一份同版本） |

- **只留 woff2**：KaTeX 的 CSS 同时引 woff / ttf 两套回退，全拷是 1.1MB，woff2 一共 296KB，所以脚本把回退项裁掉了（改完会断言没有残留）。
- `public/md/assets.json` 是下载清单的**唯一出处**（`{ katex, marked, bytes, assets[] }`，由脚本写入），所以版本号不必在这里手抄——但本文件的规矩是「实机核出来」，所以上表仍以 `public/md/assets.json` 为准。

## 三、界面素材

| 素材 | 许可 | 出处 |
| --- | --- | --- |
| seti-ui 的 `icons/cpp.svg` | MIT | [jesseweed/seti-ui](https://github.com/jesseweed/seti-ui)（VS Code 默认文件图标主题，字形 `\E01A`）。用在 `src/components/AppIcon.vue` 的 `SOLID_PATHS.cpp`，文件内注释已记出处 |
| 内置代码字体 [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono) 2.211 / [Fira Code](https://github.com/tonsky/FiraCode) 5.002 / [Cascadia Code](https://github.com/microsoft/cascadia-code) 2407.024 | **OFL-1.1**（三款各自随附 SIL OFL，再分发允许） | `public/fonts/*.woff2`，**latin 子集 + Regular/Bold 各一份**（6 个文件 149KB），取自 [@fontsource](https://github.com/fontsource/fontsource) 5.3.0 的构建产物；`src/styles/fonts.css` 里的 `@font-face` 是唯一声明处。文件名带的是字体**内部**的真实版本号，不是上游 release 号 |

- 其余图标（`play` / `gear` / `files` / `cases` / `file-plus` / `folder-plus` / `python` 等）都是本站自绘的内联 SVG，形状参考 lucide 的 24×24 描边风格，**没有引入图标依赖**。
- 界面（代码区以外）仍全部走系统字体栈（`-apple-system` / PingFang SC / …），**没有**自托管或 CDN webfont。
- **代码区是例外**：上表那三款等宽字体是自托管的，但**只在用户于「设置 › 编辑器 › 字体」里选中时才下载**（不选的人一个字节都不下）；也不进 Service Worker 的预缓存清单，靠首次使用的缓存策略落进外壳桶 —— 所以文件名必须带版本号，同名覆盖会让老用户永远吃旧文件。
- PWA 图标（`public/icons/*.png`）、`favicon.svg`、`og-cover.png` 均为本站自制。
- ⚠️ **待确认**：`SOLID_PATHS.python` 那枚 Python 双蛇标志在代码里**没有写出处**（形状与 simple-icons 的 Python 标志一致）。谁加的、从哪儿取的，确认后再往本表补一行。

## 四、浏览器扩展 CC for Web

安装包由本站分发（`public/extension/cc-for-web-<版本>.zip`，当前 **2.66.2**；2026-10-01 换版，行为改动是「样例待抓名单」机制整体移除 —— 扩展不再保存名单，改成用户打开题目页时由扩展现场问网页「这道题在工作区里且样例为空吗」（`cp-query-need` / `cp-need-answer`，跨仓契约，必须与本站同版发布），要抓才抓；包里第三方组件的版本与上表一致），源码在另一个仓库（`cph-companion`）。

| 组件 | 版本 | 许可 | 说明 |
| --- | --- | --- | --- |
| [Competitive Companion](https://github.com/jmerle/competitive-companion) | 上游主版本 2.x | MIT（© 2017 Jasper van Merle） | 本项目的改造版（改名 CC for Web、改为同时向网页与本机 IDE 工具投递）。zip 内附上游 `LICENSE` |
| [jszip](https://github.com/Stuk/jszip) | 3.10.1 | **MIT OR GPL-3.0-or-later**（双许可，本项目按 MIT 一支使用） | 扩展运行时 |
| [pdfjs-dist](https://github.com/mozilla/pdf.js) | 4.2.67 | Apache-2.0 | 扩展运行时（PDF 题面） |
| [nanobar](https://github.com/jacoborus/nanobar) | 0.4.2 | MIT | 扩展运行时 |
| [snarkdown](https://github.com/developit/snarkdown) | 2.0.0 | MIT | 扩展运行时 |
| [p-limit](https://github.com/sindresorhus/p-limit) | 7.3.0 | MIT | 扩展运行时 |
| [cyrillic-to-translit-js](https://github.com/gerigo/cyrillic-to-translit-js) | 3.2.1 | MIT | 扩展运行时 |

以上都被打进 `js/content.js`（约 2MB），随扩展包分发。

## 五、构建期工具（不进产物，一并致谢）

| 组件 | 版本 | 许可 | 用途 |
| --- | --- | --- | --- |
| [Vite](https://github.com/vitejs/vite) | 8.3.0 | MIT | 构建与 dev server |
| [Rolldown](https://github.com/rolldown/rolldown) | 1.2.8 | MIT | Vite 8 的打包内核 |
| [Lightning CSS](https://github.com/parcel-bundler/lightningcss) | 1.33.0 | MPL-2.0 | CSS 处理 |
| [@vitejs/plugin-vue](https://github.com/vitejs/vite-plugin-vue) | 6.0.9 | MIT | SFC 编译 |
| [PostCSS](https://github.com/postcss/postcss) + [postcss-pxtorem](https://github.com/cuth/postcss-pxtorem) | 8.5.28 / 6.1.0 | MIT | 全局界面缩放的 px→rem 转换 |
| [puppeteer-core](https://github.com/puppeteer/puppeteer) | 25.11.0 | Apache-2.0 | 无头回归脚本（`npm run verify`） |
| [Binaryen](https://github.com/WebAssembly/binaryen) | 132.0.0 | Apache-2.0 | `npm run wasm:opt`（当前结论是不用跑） |

## 六、外部评测服务（本仓库**不含**其代码）

这两者是本站**通过 HTTP 对接**的外部服务，服务端要你自己部署；本站只实现协议客户端，没有复制或链接它们的代码。

| 服务 | 许可 | 说明 |
| --- | --- | --- |
| [Piston](https://github.com/engineer-man/piston) | MIT | 默认引擎，推荐 `docker run -p 2000:2000 ghcr.io/piston-cli/piston:stable` |
| [Judge0](https://github.com/judge0/judge0) | **GPL-3.0** | 可选引擎。GPL 的义务跟着它的服务端走，与本站前端无关；但**若将来把 Judge0 的代码搬进本项目**，许可就变了，届时必须重新评估 |

## 七、许可全文在哪

- **npm 包**：`node_modules/<包名>/LICENSE*`；归属（生产 / 开发）看 `package-lock.json`。
- **工具链二进制**：见第二节表格里对应的上游仓库（LLVM / wasi-libc / CPython / runno）。
- **自托管的渲染运行时**：本质是 npm 包里的 `dist` 产物被抄了一份（KaTeX / marked），所以许可全文同样看 `node_modules/<包名>/LICENSE*`。
- **扩展**：`public/extension/cc-for-web-<版本>.zip` 里的 `LICENSE`。

## 附：怎么重新核对这份清单

```bash
# 1) 直接依赖
cat package.json

# 2) 全部依赖的版本与许可证（区分生产 / 开发）
node -e "const l=require('./package-lock.json');for(const [k,v] of Object.entries(l.packages))if(k)console.log((v.dev?'dev ':'prd ')+k.replace('node_modules/','')+' '+v.version+' '+(v.license||'?'))"

# 3) 工具链版本（实测串，不是靠目录名猜）
LC_ALL=C grep -a -o -E "clang version [0-9][0-9a-zA-Z. ()-]*" public/wasm/8.0.1/clang.wasm | sort -u
LC_ALL=C grep -a -o -E "3\.11\.[0-9]+" public/wasm/python-3.11.3/python.wasm | sort -u

# 4) sysroot 里到底有哪些库（确认 wasi-libc / libc++ / compiler-rt 的落点）
tar tzf public/wasm/8.0.1/clang-fs.tar.gz | grep "sys/lib/"

# 5) 产物里是否真的带上了某个依赖（注意：katex / marked 走的是按需下载，主包里搜不到库本身）
grep -l DOMPurify dist/assets/*.js
grep -c "marked" dist/assets/main-*.js

# 6) 题解渲染运行时的版本与字节数
cat public/md/assets.json
```

> 改完这份清单，做两件事：跑 `npm run notice` 把站点上的 `notice.html` 与 `notice.en.html` 重新生成一遍（不跑就是过期页面，`node scripts/render-notice.mjs --check` 能查出来），
> 再看一眼 `guide.html` 的「致谢与开源许可」一节是否还说得通——那边是给用户看的精简版。**别忘了同步改 `NOTICE.en.md`（英文版是人工对应的，没有自动同步）。**
