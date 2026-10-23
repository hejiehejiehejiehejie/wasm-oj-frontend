/**
 * 内置帮助面板（设置 › 帮助）的全部正文。
 *
 * 这一份是**内容**不是界面：整棵树直接给 `HelpPanel.vue` 渲染，所以用
 * `messages('help').groups` 取当前语言的那一棵，而不是逐条 `t()`。
 *
 * 【加粗标记】正文里的 `**…**` 由 HelpPanel 自己解析成 <strong>（没走 v-html，
 * 因为文案里会出现 `<vector>` 这类头文件名）。两套语言都要保留这层标记。
 *
 * 【同步义务】这份内容的「完整版」是根目录的 guide.html（英文版 guide.en.html），
 * 简版还有 docs/使用手册.md。改一处要检查另外几处是否还说得通。
 *
 * 【术语】下面 en 那一栏里的按钮名不是自由翻译，要与界面里真实的英文词条一致
 * （出处是同目录下的 app.js / settings.js / explorer.js / engines.js / tests.js），
 * 否则帮助面板说的按钮在界面上找不到。
 *
 * 【不翻的地名】`未分类` 是题目导入时真正建出来的 VFS 目录名（见 messages/engines.js
 * 的文件头说明），英文正文里也照写 `未分类`。
 */
export default {
  'zh-CN': {
    help: {
      groups: [
        {
          title: '开始使用',
          items: [
            {
              name: '如何在浏览器里运行 C++ 或 Python？',
              role: '编译与运行都在本机完成。',
              steps: [
                '打开**设置** › **本地运行环境**',
                '给 **C++** 或 **Python 3** 点**下载**（约 50MB / 24MB，只下一次）',
                '等按钮变成**已就绪**',
                '确认**评测**引擎是**本地 WASM 沙箱**（默认，无需填地址）',
                '按 ⌘/Ctrl + Enter，或点**评测样例**页脚的 ▶',
              ],
              notes: [
                '运行前侧边栏会自动展开并切到**评测样例**',
                'Python 直接解释执行；C++ 只编译当前文件，不包含本地头文件',
                'Python 可 import 同目录的模块',
                '沙箱内的文件读写只在内存中，不写回工作区',
                '运行时只下一次，刷新命中缓存；清除浏览器数据需重下',
                '**已就绪**行右侧的**卸载**可腾出空间',
              ],
            },
            {
              name: '评测引擎怎么选？',
              role: '默认是本地沙箱，无需填地址。',
              notes: [
                '**本地 WASM 沙箱**：在浏览器中运行，支持 C++ 与 Python 3',
                '**Piston** / **Judge0**：自建评测服务，需填地址并联网',
                '**自检（不执行代码）**：回显标准输入，仅用于调试界面',
                '切到远端引擎后，代码会发送到所填地址',
                '入口：**设置** › **评测**（含服务地址与自检）',
              ],
            },
            {
              name: '有桌面版或手机版吗？',
              role: '目前只有网页版，无需安装。',
              notes: [
                '网页版现在可用，无需安装',
                'macOS / Windows / Android 原生版**开发中**：编译运行在本机完成，不依赖浏览器沙箱',
                '原生版可发布时会在此补充；网页版继续维护',
              ],
            },
          ],
        },
        {
          title: '本地沙箱与性能',
          items: [
            {
              name: '在浏览器里跑有多快？',
              role: '没有统一倍率，随访存密度上升。',
              table: {
                head: ['用例', '沙箱', '本机', '倍率'],
                rows: [
                  ['纯计算 5×10⁷ 轮', '132 ms', '74.4 ms', '1.77×'],
                  ['顺序访存 8×10⁶ int', '26 ms', '7.4 ms', '3.51×'],
                  ['排序 50 万', '60 ms', '11.8 ms', '5.08×'],
                  ['排序 200 万', '247 ms', '36.7 ms', '6.73×'],
                ],
              },
              notes: [
                '实测：Apple M5 + 无头 Chrome，两侧均开 **-O2**',
                '沙箱一列取运行段，与卡片耗时同口径',
                '倍率约 1.8× 至 6.7×，不可外推',
                '5 次采样极差 ≤3 ms，输出与本机逐字一致',
                '两列均含启动开销，短用例倍率会被拉平',
                '空程序对照是假象：本机 4.4 ms 为进程启动，沙箱 3.0 ms 为 WASI 实例化',
                '换设备后绝对值与倍率都会变',
              ],
            },
            {
              name: '为什么第一次运行更慢？',
              role: '首次下载运行时，每份新代码还需编译一次。',
              notes: [
                '同一份代码的多个用例只编译一次，第 2 个起只付运行开销',
                '后台会在空闲时生成 STL 预编译头，不阻塞操作',
                '预编译头仅覆盖 5 个常用标准库头；生成失败不影响编译',
                '速度受本机性能影响，不承诺固定倍率',
              ],
            },
            {
              name: '判定码与时限怎么算？',
              role: '耗时只计运行段（含沙箱启动），不含编译。',
              table: {
                head: ['判定码', '含义'],
                rows: [
                  ['AC', '输出与期望输出一致'],
                  ['WA', '输出与期望输出不一致'],
                  ['CE', '编译失败'],
                  ['TLE', '运行时间超过当前时限'],
                  ['MLE', '运行内存超过当前上限'],
                  ['RE', '运行时错误，程序非正常退出'],
                  ['ERR', '评测服务连不上之类的环境问题'],
                ],
              },
              notes: [
                '卡片与页头同口径：只计运行段，不含编译与排队',
                '运行段含几毫秒的沙箱启动开销',
                '程序未运行时不显示耗时',
                '页头显示当轮**最慢**的用例',
                '默认 1 秒；改：**设置** › **评测** › **运行时限**（1 / 2 / 5 / 10 秒）',
                '默认内存 256 MB；改：**设置** › **评测** › **内存上限**（wasm 沙箱与 Judge0 支持）',
                '题目自带时限优先：右键文件 › **题目信息** › **时限（秒）**',
                'Python 额外给 0.5 秒启动余量',
                '卡片中间的空白条是「只跑这一个用例」按钮',
              ],
            },
          ],
        },
        {
          title: '抓题与文件',
          items: [
            {
              name: '怎么把题目抓进来？',
              role: '装插件后，题面与样例自动送进来。',
              steps: [
                '打开**设置** › **浏览器插件**，按提示选择对应装法',
                '（Firefox）点**Firefox 版**从商店安装，完成后跳到第 5 步',
                '（Chromium）点**下载**并解压，打开 chrome://extensions（Edge 为 edge://extensions），启用**开发者模式**',
                '（Chromium）点**加载已解压的扩展程序**，选中解压目录',
                '回到本站点**重新检测**，状态会显示版本号',
                '打开任意 OJ 题目页，点工具栏上的插件图标',
              ],
              notes: [
                '题目存入 〈年月〉/〈OJ〉/未分类/，样例替换到**评测样例**',
                '代码初始正文取自**模板**（设置 › 模板 可改或关闭）；题解由你写',
                '重抓同一道题只刷新样例与元数据，题解不受影响',
                '认题靠**题目链接**，不靠文件名',
                '难度需自己填；本站需保持打开',
                'Firefox 已在 Mozilla 商店上架；Chrome 与 Edge 商店版未上架，需手动加载',
                '移动端目前只有安卓 Firefox 能装（Chrome 手机版不支持扩展）',
              ],
            },
            {
              name: '文件树怎么用？',
              role: '新建、重命名、删除与填写题目信息。',
              steps: [
                '页头两颗按钮：**新建文件**与**新建文件夹**',
                '新条目建在当前聚焦的目录下',
                '指定目录：右键该目录 › **新建文件** / **新建文件夹**',
                '输入名字后回车；输入框只选中主干，无需补后缀',
              ],
              notes: [
                '新文件正文取自**模板**（按扩展名：.cpp / .py / .md；设置 › **模板** 可改、恢复或关闭）',
                '右键文件可**重命名**、**删除**',
                '**题目信息**含五项：**题目链接**、**OJ**、**难度**、**日期**、**时限（秒）**',
                '难度随 OJ：CF 与 AtCoder 用 800–3500 分段，洛谷用官方八级',
                '题目信息与样例挂在代码文件上，树里不会多出条目',
              ],
            },
            {
              name: '题解（Markdown / LaTeX）怎么写？',
              role: '新建 .md 文件即题解，可边写边预览。',
              steps: [
                '页头点**新建文件**，命名为「题解.md」后回车',
                '编辑器上方出现工具栏：加粗、标题、列表、链接、图片、公式、表格等 14 颗按钮',
                '点右侧三颗**视图**按钮或按 ⌘/Ctrl + \\，切换**仅编辑 / 双栏 / 仅预览**',
                '公式用 $行内$ 与 $$独占一段$$，预览时渲染为 LaTeX',
              ],
              notes: [
                '预览需先下载**渲染器**（marked + KaTeX，约 578KB），只下一次，可随时卸载',
                '题解不参与评测：打开 .md 时运行按钮置灰，⌘/Ctrl + Enter 不编译',
                '工具栏按钮悬停可见键位，14 条快捷键仅在 .md 生效',
                '工具栏右端的**全屏**按钮占满窗口，Esc 退出',
              ],
            },
            {
              name: '可以打开本机的文件夹吗？',
              role: '桌面版可以；网页版使用虚拟工作区。',
              steps: [
                '打开**设置** › **工作区**',
                '点**选择文件夹**，在系统弹窗中选目录',
                '界面重新加载，文件树显示该目录',
              ],
              notes: [
                '新建、改名、删除都作用于磁盘真实文件，外部修改也会自动同步',
                '二进制文件与超过 5MB 的文件会调暗，点击仅提示、不开页签',
                '题目信息与样例存于目录内的 **.unnamed/**，随目录一起移动',
                '点开头的隐藏项与 **node_modules** 不进文件树',
                '本地撞名会拒绝并提示，不会替你改名',
                '切回：**设置** › **工作区** › **回到虚拟工作区**，文件不会删除',
              ],
            },
            {
              name: '编辑器有自动补全吗？',
              role: '有，仅限 C / C++ / Python 代码文件。',
              steps: [
                '在 .c / .cpp / .py 中输入几个字母，候选框自动弹出',
                '方向键翻动，Tab 采用，Esc 关闭',
                '片段带占位符：采用后按 Tab 在占位符间跳转',
              ],
              notes: [
                '候选分三类：关键字、常用标准库（vector / sort / printf / print）与代码片段（main / fori / ifmain）',
                '它是**查表**，不是语言服务：不识别变量与类型，不能跳转定义，也不实时报错',
                '同一文件中出现过的词也会建议；其它文件不参与',
              ],
            },
          ],
        },
        {
          title: '界面',
          items: [
            {
              name: '界面怎么调？',
              role: '切面板、收起侧边栏、换配色与缩放。',
              steps: [
                '切面板：点侧边栏页头左侧的**胶囊开关**',
                '开关设置页签：点页头的**齿轮**',
                '收起整栏：单击两栏间的分隔条（再点一次展开）',
                '换边：**设置** › **外观** › **侧边栏位置**',
                '缩放：**设置** › **外观** › **界面缩放**（默认 100%）',
                '配色：**设置** › **外观** › **主题**（深色 / 浅色）',
                '语言：**设置** › **外观** › **界面语言**',
              ],
              notes: [
                '收起只是隐藏，用例与展开状态都不会丢失',
                '分隔条：单击折叠 / 展开、拖到贴边折叠，或 Tab 聚焦后用 ← / → 调宽度',
                '快捷键在**设置** › **快捷键**中改绑；运行默认为 ⌘/Ctrl + Enter',
              ],
            },
          ],
        },
      ],
    },
  },

  en: {
    help: {
      groups: [
        {
          title: 'Getting started',
          items: [
            {
              name: 'How do I run C++ or Python in the browser?',
              role: 'Compiling and running both happen on this device.',
              steps: [
                'Open **Settings** › **Local runtime**',
                'Click **Download** next to **C++** or **Python 3** (about 50MB / 24MB, once)',
                'Wait for the button to read **Ready**',
                'Make sure the **Judge** engine is **Local WASM sandbox** (default, no URL needed)',
                'Press ⌘/Ctrl + Enter, or click ▶ in the **Test cases** footer',
              ],
              notes: [
                'The sidebar expands and switches to **Test cases** before a run',
                'Python runs directly in the interpreter; C++ compiles only the open file, without local headers',
                'Python can import modules from the same folder',
                'File reads and writes in the sandbox stay in memory and never touch the workspace',
                'The runtime downloads once and is cached; clearing browser data means downloading again',
                '**Uninstall** next to **Ready** frees the space',
              ],
            },
            {
              name: 'Which judge engine should I pick?',
              role: 'The local sandbox is the default and needs no URL.',
              notes: [
                '**Local WASM sandbox**: runs in your browser, supports C++ and Python 3',
                '**Piston** / **Judge0**: self-hosted services — enter a URL and stay online',
                '**Self-test (does not run code)**: echoes stdin, for UI debugging only',
                'A remote engine sends your code to the URL you entered',
                'Setting: **Settings** › **Judge** (service URL and connection test included)',
              ],
            },
            {
              name: 'Is there a desktop or mobile app?',
              role: 'Only the web version is available today, and it needs no install.',
              notes: [
                'The web version works now without installation',
                'Native macOS / Windows / Android builds are **in development**: compile and run locally without the browser sandbox',
                'Download details will appear here once they ship; the web version stays maintained',
              ],
            },
          ],
        },
        {
          title: 'Local sandbox & performance',
          items: [
            {
              name: 'How fast is it in the browser?',
              role: 'No single multiplier — the ratio grows with memory density.',
              table: {
                head: ['Case', 'Sandbox', 'Native', 'Ratio'],
                rows: [
                  ['Pure compute, 5×10⁷ iterations', '132 ms', '74.4 ms', '1.77×'],
                  ['Sequential access, 8×10⁶ ints', '26 ms', '7.4 ms', '3.51×'],
                  ['Sorting 500k', '60 ms', '11.8 ms', '5.08×'],
                  ['Sorting 2M', '247 ms', '36.7 ms', '6.73×'],
                ],
              },
              notes: [
                'Measured on an Apple M5 with headless Chrome, **-O2** on both sides',
                'The sandbox column is the run phase, the same measure as card timing',
                'The ratio ranges from about 1.8× to 6.7× and cannot be extrapolated',
                'Five samples spread over ≤3 ms; output matched native byte for byte',
                'Both columns include startup cost, flattening short runs',
                'The empty-program comparison is an illusion: 4.4 ms native is process startup, 3.0 ms in the sandbox is WASI instantiation',
                'Changing the machine changes both times and ratios',
              ],
            },
            {
              name: 'Why is the first run so much slower?',
              role: 'The runtime downloads once, and each new piece of code compiles once.',
              notes: [
                'One compilation covers every case for the same code; from the second case on you only pay for the run',
                'A precompiled STL header is built in the background during idle time, without blocking you',
                'It covers only the 5 most common standard library headers; a failed build does not affect compilation',
                'Speed depends on your machine, so no fixed ratio is promised',
              ],
            },
            {
              name: 'How are verdicts and the time limit calculated?',
              role: 'Timing covers the run phase (including sandbox startup), excluding compilation.',
              table: {
                head: ['Verdict', 'Meaning'],
                rows: [
                  ['AC', 'Output matches the expected output'],
                  ['WA', 'Output differs from the expected output'],
                  ['CE', 'Compilation failed'],
                  ['TLE', 'The program exceeded the current time limit'],
                  ['MLE', 'The program exceeded the current memory limit'],
                  ['RE', 'Runtime error — the program exited abnormally'],
                  ['ERR', 'An environment problem, such as an unreachable judge service'],
                ],
              },
              notes: [
                'Cards and the panel header use the same measure: run phase only, excluding compilation and queueing',
                'The run phase includes a few milliseconds of sandbox startup',
                'No timing is shown when the program never ran',
                'The header shows the **slowest** case of the current run',
                'Default 1 s. Change: **Settings** › **Judge** › **Time limit** (1 / 2 / 5 / 10 s)',
                'Default memory 256 MB. Change: **Settings** › **Judge** › **Memory limit** (wasm sandbox and Judge0 only)',
                'A per-problem limit takes priority: right-click the file › **Problem info** › **Time limit (s)**',
                'Python gets an extra 0.5 s of startup allowance',
                'The blank strip in the middle of a card is the “run this case only” button',
              ],
            },
          ],
        },
        {
          title: 'Importing problems & files',
          items: [
            {
              name: 'How do I import a problem?',
              role: 'Install the extension and the statement plus samples arrive automatically.',
              steps: [
                'Open **Settings** › **Browser extension** and follow the step for your browser',
                '(Firefox) Click **Firefox version** to install from the store, then skip to step 5',
                '(Chromium) Click **Download** and unzip, open chrome://extensions (edge://extensions on Edge) and enable **Developer mode**',
                '(Chromium) Click **Load unpacked** and pick the unzipped folder',
                'Back on this site, click **Check again** — the status line shows the version',
                'Open any problem page and click the extension icon in the toolbar',
              ],
              notes: [
                'The problem lands in 〈year-month〉/〈OJ〉/未分类/; samples replace the **Test cases** contents',
                'The code file starts from its **template** (editable under Settings › Templates, or switch it off); the solution is yours to write',
                'Re-importing the same problem only refreshes samples and metadata; your solution is untouched',
                'Problems are identified by **Problem URL**, not file name',
                'You fill in the difficulty yourself, and this site must stay open',
                'Firefox is on Mozilla Add-ons; Chrome and Edge are not listed yet, so those need the manual load',
                'On mobile only Firefox for Android can install it (Chrome for mobile has no extension support)',
              ],
            },
            {
              name: 'How do I use the file tree?',
              role: 'Create, rename and delete files, and record problem metadata.',
              steps: [
                'The header has two buttons: **New file** and **New folder**',
                'New entries go in the folder currently focused in the tree',
                'To choose a folder: right-click it › **New file** / **New folder**',
                'Type a name and press Enter; only the stem is selected, so no need to retype the extension',
              ],
              notes: [
                'New files start from their **template** (.cpp / .py / .md; Settings › **Templates** to edit, restore or disable)',
                'Right-click a file to **Rename** or **Delete** it',
                '**Problem info** has five fields: **Problem URL**, **Judge**, **Difficulty**, **Date** and **Time limit (s)**',
                'Difficulty follows the judge: Codeforces and AtCoder use 800–3500, Luogu its eight official levels',
                'Problem info and samples live on the code file, so the tree gains no extra entries',
              ],
            },
            {
              name: 'How do I write notes (Markdown / LaTeX)?',
              role: 'A new .md file is a notes file — write and preview side by side.',
              steps: [
                'Click **New file**, name it “notes.md” and press Enter',
                'A toolbar appears above the editor: 14 buttons for bold, headings, lists, links, images, formulas and tables',
                'Click a **view** button or press ⌘/Ctrl + \\ to cycle **editor only / split / preview only**',
                'Write formulas as $inline$ and $$on their own line$$ to render as LaTeX',
              ],
              notes: [
                'Preview needs the **renderer** first (marked + KaTeX, about 578KB) — downloaded once and removable anytime',
                'Notes are not judged: opening a .md greys out the run button and ⌘/Ctrl + Enter starts no compilation',
                'Hover a toolbar button to see its shortcut; those 14 shortcuts only apply inside .md',
                'The **full screen** button at the right end fills the window — press Esc to leave',
              ],
            },
            {
              name: 'Can I open a folder on my computer?',
              role: 'Yes in the desktop build; the web version uses its virtual workspace.',
              steps: [
                'Open **Settings** › **Workspace**',
                'Click **Choose folder** and pick a directory',
                'The interface reloads and the tree shows that directory',
              ],
              notes: [
                'Creating, renaming and deleting act on real files on disk; outside changes sync automatically',
                'Binaries and files over 5MB are dimmed — clicking shows a notice and opens no tab',
                'Problem info and samples live in **.unnamed/** inside the folder and travel with it',
                'Dot-hidden entries and **node_modules** stay out of the tree',
                'A name clash is refused with a notice — files on disk are never renamed',
                'To switch back: **Settings** › **Workspace** › **Back to virtual workspace**; nothing is deleted',
              ],
            },
            {
              name: 'Does the editor autocomplete?',
              role: 'Yes, but only for C / C++ / Python code files.',
              steps: [
                'Type a few letters in a .c / .cpp / .py file and suggestions appear',
                'Arrow keys move, Tab accepts, Esc dismisses',
                'Snippets carry placeholders — press Tab to jump between them',
              ],
              notes: [
                'Three kinds: keywords, common standard library names (vector / sort / printf / print) and snippets (main / fori / ifmain)',
                'It is a **lookup table**, not a language service: no variable or type awareness, no jump to definition, no live errors',
                'Words already used in the same file are suggested too; other files are not covered',
              ],
            },
          ],
        },
        {
          title: 'Interface',
          items: [
            {
              name: 'How do I tweak the interface?',
              role: 'Switch panels, collapse the sidebar, change colours and scaling.',
              steps: [
                'Switch panels: click the **pill switch** left of the sidebar header',
                'Toggle the Settings tab: click the **gear** in the header',
                'Collapse the sidebar: single-click the divider (click again to expand)',
                'Move it: **Settings** › **Appearance** › **Sidebar position**',
                'Scale: **Settings** › **Appearance** › **Interface scale** (100% by default)',
                'Colours: **Settings** › **Appearance** › **Theme** (dark / light)',
                'Language: **Settings** › **Appearance** › **Interface language**',
              ],
              notes: [
                'Collapsing only hides the sidebar — expanded folders and cases are kept',
                'Divider: click to collapse / expand, drag to an edge to collapse, or focus with Tab and nudge with ← / →',
                'Shortcuts can be rebound under **Settings** › **Shortcuts**; Run is ⌘/Ctrl + Enter by default',
              ],
            },
          ],
        },
      ],
    },
  },
}
