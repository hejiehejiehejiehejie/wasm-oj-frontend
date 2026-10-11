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
              role: '编译与运行都在这台设备上完成。',
              steps: [
                '点侧边栏页头的**齿轮图标**，打开**设置**页签，进入**本地运行环境**',
                '给 **C++** 或 **Python 3** 点**下载**，约 50MB / 24MB，只下一次',
                '等按钮变成**已就绪**',
                '确认**评测**里的引擎是**本地 WASM 沙箱**——新访客默认就是它，不用填服务地址',
                '按 ⌘/Ctrl + Enter，或点**评测样例**面板页脚那颗 ▶',
              ],
              notes: [
                '跑之前侧边栏会自动展开，并切到**评测样例**',
                'Python 不编译，直接解释执行；C++ 只编译当前打开的这个文件，本地头文件不会被包含',
                'Python 能 import 同目录的模块',
                '沙箱里的文件读写都在内存里，不会写回工作区',
                '运行时只下一次，之后刷新页面命中缓存；清掉浏览器数据就要重下',
                '**已就绪**那行右侧有**卸载**，用来腾出空间',
              ],
            },
            {
              name: '评测引擎怎么选？',
              role: '默认就是本地沙箱，不用填地址。',
              notes: [
                '**本地 WASM 沙箱**：在你的浏览器里跑，支持 C++ 与 Python 3',
                '**Piston** / **Judge0**：你自建的评测服务，要填地址、要联网',
                '**自检（不执行代码）**：只把标准输入原样回显，用来联调界面',
                '切到远端引擎之后，代码会发到你填的那个地址',
                '入口在**设置** › **评测**，下方有服务地址与自检',
              ],
            },
            {
              name: '有桌面版或手机版吗？',
              role: '能用的是网页版，不需要安装。',
              notes: [
                '网页版现在就可用，也不用安装',
                'macOS / Windows / Android 的原生版本**正在开发中**：编译与运行都在本机完成，不再依赖浏览器沙箱',
                '原生版能发布时会在这里补上获取方式；网页版不受影响、会继续维护',
              ],
            },
          ],
        },
        {
          title: '本地沙箱与性能',
          items: [
            {
              name: '在浏览器里跑有多快？',
              role: '没有统一的缩放系数，倍率随访存密度涨。',
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
                '实测：Apple M5 + 无头 Chrome，两侧都开 **-O2**',
                '沙箱那列取运行段，与卡片上的耗时同口径',
                '倍率从约 1.8× 涨到约 6.7×，不能外推',
                '5 次采样极差 ≤3 ms，输出与本机逐字一致',
                '两列都含启动开销，耗时越短的用例倍率越会被拉平',
                '空程序的对照是假象：本机那 4.4 ms 是进程启动，沙箱那 3.0 ms 是 WASI 实例化',
                '换一台设备，绝对值与倍率都会变',
              ],
            },
            {
              name: '为什么第一次运行明显更慢？',
              role: '首次要下运行时，每份新代码还要编译一次。',
              notes: [
                '同一份代码连续跑多个用例只编译一次，第 2 个起只付运行开销',
                '后台会生成一份 STL 预编译头，排在空闲时间，不阻塞操作',
                '预编译头只覆盖 5 个最常用的标准库头；生成失败也不影响正常编译',
                '这部分受本机性能影响，不承诺固定倍率',
              ],
            },
            {
              name: '判定码与时限怎么算？',
              role: '耗时只计运行段，不含编译；含沙箱启动开销。',
              table: {
                head: ['判定码', '含义'],
                rows: [
                  ['AC', '输出与期望输出一致'],
                  ['WA', '输出与期望输出不一致'],
                  ['CE', '编译失败'],
                  ['TLE', '运行时间超过当前时限'],
                  ['RE', '运行时错误，程序非正常退出'],
                  ['ERR', '评测服务连不上之类的环境问题'],
                ],
              },
              notes: [
                '卡片与页头的耗时同口径：只计运行段，不含编译与排队',
                '运行段含沙箱启动的固定开销，量级几毫秒',
                '程序没跑起来时卡片不显示耗时',
                '页头显示当轮**最慢**的那个用例',
                '默认 1 秒。改：**设置** › **评测** › **运行时限**（1 / 2 / 5 / 10 秒）',
                '题目自带时限时优先用它：右键文件 › **题目信息** › **时限（秒）**',
                'Python 额外给 0.5 秒启动余量',
                '卡片中间那条空白就是「只跑这一个用例」的按钮',
              ],
            },
          ],
        },
        {
          title: '抓题与文件',
          items: [
            {
              name: '怎么把题目抓进来？',
              role: '装一个插件，题面和样例自动送进来。',
              steps: [
                '打开**设置** › **浏览器插件**：Firefox 点右侧的**Firefox 版**一键安装，装完跳到第 5 步；Chrome 点**下载**',
                '（Chrome）解压下载到的压缩包',
                '（Chrome）地址栏打开 chrome://extensions，打开右上角的**开发者模式**',
                '（Chrome）点**加载已解压的扩展程序**，选中刚解压出来的目录',
                '回到本站，点那一组的**重新检测**，状态里会显示版本号',
                '打开任意 OJ 题目页，点浏览器工具栏上的插件图标',
              ],
              notes: [
                '题目落进 〈年月〉/〈OJ〉/未分类/（工作区根下），样例整体替换进**评测样例**',
                '代码文件的初始正文取自**模板**（按扩展名归到语言，设置 › 模板 里可改、也能整体关掉），题解归你写',
                '重抓同一道题只刷新样例与元数据，你的题解一个字都不动',
                '认题靠**题目链接**，不靠文件名',
                '难度要自己填；本站要开着，插件才送得进来',
                'Firefox 已上架 Mozilla 附加组件商店，一键即可装；只有 Chrome 还得按上面那几步手动加载（Chrome 版尚未上架）',
                '手机 / 平板上只有安卓的 Firefox 支持扩展，Chrome 的手机版完全没有扩展功能 —— 移动端用户建议改用 Firefox',
              ],
            },
            {
              name: '文件树怎么用？',
              role: '新建、重命名、删除，以及填写题目信息。',
              steps: [
                '页头有两颗按钮：**新建文件**与**新建文件夹**',
                '建在哪个目录，看树里当前聚焦的那个节点',
                '想指定目录：右键该目录 › **新建文件** / **新建文件夹**',
                '输入名字后回车。输入框只选中主干，改完不用补后缀',
              ],
              notes: [
                '新建文件的初始正文来自**模板**：按扩展名归到语言（.cpp / .py / .md），在设置 › **模板** 里可改、可逐份恢复默认、也能整体关掉',
                '右键文件还有**重命名**与**删除**',
                '**题目信息**填五项：**题目链接**、**OJ**、**难度**、**日期**、**时限（秒）**',
                '难度跟着 OJ 走：CF 与 AtCoder 用 800–3500 分数段，洛谷用官方八级',
                '题目信息与抓到的样例挂在代码文件自己身上，树里不会多出别的条目',
              ],
            },
            {
              name: '题解（Markdown / LaTeX）怎么写？',
              role: '新建一个 .md 文件就是题解，边写边预览。',
              steps: [
                '页头点**新建文件**，把名字改成「题解.md」后回车',
                '编辑器上方会多出一行工具栏：加粗、标题、列表、链接、图片、公式、表格等 14 颗按钮',
                '点右上角那三颗**视图**按钮，或按 ⌘/Ctrl + \\，在**仅编辑 / 双栏 / 仅预览**之间轮换',
                '公式写 $行内$ 与 $$独占一段$$，预览里会渲染成 LaTeX',
              ],
              notes: [
                '预览要先下**渲染器**（marked + KaTeX，约 578KB），与**本地运行环境**一样只下一次、可随时卸载',
                '题解不参与评测：打开 .md 时运行按钮会置灰，按 ⌘/Ctrl + Enter 也不会进编译',
                '工具栏按钮悬停能看到键位，那 14 条键只在 .md 里生效',
                '工具栏右端那颗**全屏**按钮让编辑区占满窗口，按 Esc 退出',
              ],
            },
            {
              name: '可以打开本机的文件夹吗？',
              role: '桌面版可以，网页版只用自己的虚拟工作区。',
              steps: [
                '打开**设置** › **工作区**',
                '点**选择文件夹**，在系统弹窗里挑一个目录',
                '界面会重新加载，之后文件树画的就是那个目录',
              ],
              notes: [
                '新建、改名、删除动的都是磁盘上真实的文件，用别的编辑器改了它也会自动更新',
                '点开看不了的：二进制文件与超过 5MB 的大文件会调暗，点一下只弹一句提示，不会开页签',
                '题目信息与抓到的样例存在目录里的 **.unnamed/** 下，不在文件正文里，随目录一起搬走',
                '点开头的隐藏项与 **node_modules** 不进文件树',
                '本地文件夹里撞名会拒绝并提示，不会替你改磁盘上的文件名',
                '想换回来：**设置** › **工作区** › **回到虚拟工作区**，文件不会被删',
              ],
            },
            {
              name: '编辑器有自动补全吗？',
              role: '有，但只给 C / C++ / Python 三种语言的代码文件。',
              steps: [
                '在 .c / .cpp / .py 里打几个字母，候选框会自动弹出',
                '方向键翻动，Tab 采用当前那条，Esc 关掉',
                '片段带占位符：采用后按 Tab 在占位符之间跳',
              ],
              notes: [
                '候选分三类：关键字、常用标准库（vector / sort / printf / print）与代码片段（main / fori / ifmain）',
                '它是**查表**，不是语言服务：不认变量名与类型、不能跳转定义，也不会实时报错',
                '同一个文件里出现过的词也会一起建议；.md 等其它文件不参与',
              ],
            },
          ],
        },
        {
          title: '界面',
          items: [
            {
              name: '界面怎么调？',
              role: '切面板、收发侧边栏、换配色与缩放。',
              steps: [
                '切面板：点侧边栏页头左侧那枚**胶囊开关**',
                '开关设置页签：点页头那颗**齿轮**',
                '收起整栏：单击两栏中间的分隔条（再点一次展开）',
                '换边：**设置** › **外观** › **侧边栏位置**',
                '缩放：**设置** › **外观** › **界面缩放**，默认 100%',
                '配色：**设置** › **外观** › **主题**，深色 / 浅色',
              ],
              notes: [
                '收起只是不显示，用例与文件树的展开状态都不会丢',
                '分隔条：单击折叠 / 展开、拖到贴边折叠，或 Tab 聚焦后按 ← / → 微调宽度',
                '所有快捷键在**设置** › **快捷键**里改绑，默认运行是 ⌘/Ctrl + Enter',
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
              role: 'Both compiling and running happen on this device.',
              steps: [
                'Click the **gear icon** in the sidebar header, open the **Settings** tab, then go to **Local runtime**',
                'Click **Download** next to **C++** or **Python 3** — about 50MB / 24MB, downloaded once',
                'Wait for the button to read **Ready**',
                'Make sure the engine under **Judge** is **Local WASM sandbox** — that is the default for new visitors, and it needs no service URL',
                'Press ⌘/Ctrl + Enter, or click the ▶ in the footer of the **Test cases** panel',
              ],
              notes: [
                'The sidebar expands automatically and switches to **Test cases** before a run',
                'Python is not compiled — it runs straight in the interpreter; C++ compiles only the file you have open, and local headers are not included',
                'Python can import modules from the same folder',
                'File reads and writes inside the sandbox stay in memory and never touch your workspace',
                'The runtime is downloaded once and served from cache afterwards; clearing your browser data means downloading it again',
                'The **Ready** line has an **Uninstall** button on the right if you need the space back',
              ],
            },
            {
              name: 'Which judge engine should I pick?',
              role: 'The local sandbox is the default and needs no URL.',
              notes: [
                '**Local WASM sandbox**: runs in your browser, supports C++ and Python 3',
                '**Piston** / **Judge0**: judge services you host yourself — you must enter a URL and be online',
                '**Self-test (does not run code)**: echoes the standard input back, for exercising the UI only',
                'Once you switch to a remote engine, your code is sent to the URL you entered',
                'The setting lives under **Settings** › **Judge**, together with the service URL and the connection test',
              ],
            },
            {
              name: 'Is there a desktop or mobile app?',
              role: 'The web version is what is available today, and it needs no installation.',
              notes: [
                'The web version works right now and needs no installation',
                'Native builds for macOS / Windows / Android are **in development**: compiling and running happen natively on your machine instead of in the browser sandbox',
                'Download details will be added here once they are ready to ship; the web version is unaffected and keeps being maintained',
              ],
            },
          ],
        },
        {
          title: 'Local sandbox & performance',
          items: [
            {
              name: 'How fast is it in the browser?',
              role: 'There is no single scaling factor — the ratio grows with memory density.',
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
                'The sandbox column is the run phase — the same thing the card timing measures',
                'The ratio climbs from about 1.8× to about 6.7× and cannot be extrapolated',
                'Five samples spread over ≤3 ms, and the output matched the native run byte for byte',
                'Both columns include startup cost, which flattens the ratio for short runs',
                'The empty-program comparison is an illusion: that 4.4 ms native is process startup, and the 3.0 ms in the sandbox is WASI instantiation',
                'Change the machine and both the absolute times and the ratios change',
              ],
            },
            {
              name: 'Why is the first run so much slower?',
              role: 'The runtime is downloaded once, and every new piece of code is compiled once.',
              notes: [
                'One compilation covers every case you run for the same code; from the second case on you only pay for the run',
                'A precompiled STL header is built in the background during idle time and never blocks you',
                'It only covers the 5 most common standard library headers, and a failure to build it does not affect normal compilation',
                'This part depends on your machine, so no fixed ratio is promised',
              ],
            },
            {
              name: 'How are verdicts and the time limit calculated?',
              role: 'Timing covers the run phase only, excluding compilation, and includes sandbox startup.',
              table: {
                head: ['Verdict', 'Meaning'],
                rows: [
                  ['AC', 'Output matches the expected output'],
                  ['WA', 'Output differs from the expected output'],
                  ['CE', 'Compilation failed'],
                  ['TLE', 'The program exceeded the current time limit'],
                  ['RE', 'Runtime error — the program exited abnormally'],
                  ['ERR', 'An environment problem, such as an unreachable judge service'],
                ],
              },
              notes: [
                'The card and the panel header measure the same thing: the run phase only, excluding compilation and queueing',
                'The run phase includes a fixed sandbox startup cost of a few milliseconds',
                'The card shows no timing when the program never got to run',
                'The panel header shows the **slowest** case of the current run',
                'The default is 1 second. To change it: **Settings** › **Judge** › **Time limit** (1 / 2 / 5 / 10 s)',
                'A time limit stored on the problem takes priority: right-click the file › **Problem info** › **Time limit (s)**',
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
              role: 'Install an extension and the statement plus samples arrive on their own.',
              steps: [
                'Open **Settings** › **Browser extension**: on Firefox click **Firefox version** to install in one step, then skip to step 5; on Chrome click **Download**',
                '(Chrome) Unzip the downloaded archive',
                '(Chrome) Open chrome://extensions in the address bar and turn on **Developer mode** in the top right',
                '(Chrome) Click **Load unpacked** and pick the folder you just unzipped',
                'Back on this site, click **Check again** in that group — the status line will show the version',
                'Open any problem page on an online judge and click the extension icon in the browser toolbar',
              ],
              notes: [
                'The problem lands in 〈year-month〉/〈OJ〉/未分类/ (under the workspace root), and its samples replace the contents of **Test cases**',
                'The code file starts from the **template** for its language (editable under Settings › Templates, and can be switched off entirely) — the solution is yours to write',
                'Importing the same problem again only refreshes the samples and metadata; not a character of your solution is touched',
                'Problems are identified by **Problem URL**, not by file name',
                'You fill in the difficulty yourself, and this site has to be open for the extension to deliver anything',
                'Firefox is on the Mozilla Add-ons store and installs in one click; only Chrome still needs the manual load above (the Chrome build is not listed yet)',
                'On phones and tablets only Firefox for Android supports extensions — Chrome for mobile has no extension support at all — so mobile users should switch to Firefox',
              ],
            },
            {
              name: 'How do I use the file tree?',
              role: 'Create, rename and delete files, and record problem metadata.',
              steps: [
                'The header has two buttons: **New file** and **New folder**',
                'The new entry is created in whichever folder is currently focused in the tree',
                'To place it somewhere specific: right-click that folder › **New file** / **New folder**',
                'Type a name and press Enter. Only the stem is selected, so you do not need to retype the extension',
              ],
              notes: [
                'A new file starts from its **template**: the extension picks the language (.cpp / .py / .md), and Settings › **Templates** lets you edit each one, restore its default, or switch the whole feature off',
                'Right-clicking a file also offers **Rename** and **Delete**',
                '**Problem info** holds five fields: **Problem URL**, **Judge**, **Difficulty**, **Date** and **Time limit (s)**',
                'Difficulty follows the judge: Codeforces and AtCoder use the 800–3500 rating scale, Luogu uses its eight official levels',
                'Problem info and captured samples live on the code file itself, so nothing extra shows up in the tree',
              ],
            },
            {
              name: 'How do I write notes (Markdown / LaTeX)?',
              role: 'A new .md file is a notes file — write on one side, preview on the other.',
              steps: [
                'Click **New file** in the header, rename it to something like “notes.md” and press Enter',
                'A toolbar appears above the editor: 14 buttons for bold, headings, lists, links, images, formulas, tables and more',
                'Click one of the three **view** buttons on the right, or press ⌘/Ctrl + \\, to cycle **editor only / split / preview only**',
                'Write formulas as $inline$ and $$on their own line$$ — the preview renders them as LaTeX',
              ],
              notes: [
                'The preview needs a **renderer** first (marked + KaTeX, about 578KB) — like **Local runtime**, it is downloaded once and can be uninstalled at any time',
                'Notes are not judged: opening a .md greys out the run button, and ⌘/Ctrl + Enter will not start a compilation',
                'Hover a toolbar button to see its shortcut; those 14 shortcuts only apply inside .md',
                'The **full screen** button at the right end of the toolbar gives the editor the whole window — press Esc to leave',
              ],
            },
            {
              name: 'Can I open a folder on my computer?',
              role: 'Yes in the desktop build; the web version uses its own virtual workspace.',
              steps: [
                'Open **Settings** › **Workspace**',
                'Click **Choose folder** and pick a directory in the system dialog',
                'The interface reloads, and the file tree becomes that directory',
              ],
              notes: [
                'Creating, renaming and deleting act on real files on disk, and changes made in another editor show up automatically',
                'Files you cannot open: binaries and anything over 5MB are dimmed — clicking only shows a one-line notice and opens no tab',
                'Problem info and captured samples live in **.unnamed/** inside the folder, never in the files themselves, so they travel with it',
                'Hidden entries (names starting with a dot) and **node_modules** stay out of the file tree',
                'A name clash in a local folder is refused with a notice — files on your disk are never renamed for you',
                'To switch back: **Settings** › **Workspace** › **Back to virtual workspace**; nothing is deleted',
              ],
            },
            {
              name: 'Does the editor autocomplete?',
              role: 'Yes — but only for C, C++ and Python code files.',
              steps: [
                'Type a few letters in a .c / .cpp / .py file and the suggestion box appears on its own',
                'Arrow keys move through the list, Tab accepts the highlighted one, Esc dismisses it',
                'Snippets carry placeholders — press Tab after accepting one to jump between them',
              ],
              notes: [
                'Three kinds of candidate: keywords, common standard-library names (vector / sort / printf / print) and snippets (main / fori / ifmain)',
                'It is a **lookup table**, not a language service: it does not know your variable names or types, cannot jump to definitions and reports no errors',
                'Words already used in the same file are suggested too; .md and other files are not covered',
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
                'Switch panels: click the **pill switch** on the left of the sidebar header',
                'Toggle the Settings tab: click the **gear** in that header',
                'Collapse the whole sidebar: single-click the divider between the two columns — click again to expand',
                'Move it to the other side: **Settings** › **Appearance** › **Sidebar position**',
                'Scale it: **Settings** › **Appearance** › **Interface scale** — 100% by default',
                'Change colours: **Settings** › **Appearance** › **Theme** — dark / light',
                'Change the language: **Settings** › **Appearance** › **Interface language**',
              ],
              notes: [
                'Collapsing only hides the sidebar — expanded folders and test cases are never lost',
                'The divider: single-click to collapse or expand, drag it to an edge to collapse, or focus it with Tab and nudge with ← / →',
                'Every shortcut can be rebound under **Settings** › **Shortcuts**; Run is ⌘/Ctrl + Enter by default',
              ],
            },
          ],
        },
      ],
    },
  },
}
