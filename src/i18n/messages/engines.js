/**
 * 评测引擎、本地运行时、沙箱阶段播报与各类错误文案。
 *
 * 【为什么不翻「落进文件系统的名字」】`vfs/problemImport.js` 里的 `未分类` /
 * `未命名题目` 会**写进 VFS 成为真实目录名与文件名**。它们要是跟着界面语言变，
 * 同一道题在中文界面导入会建出 `未分类/`、切到英文再导出一份 `Uncategorized/`，
 * 同一个逻辑位置就出现了两个目录。这类名字一律**语言无关**，所以不在这张表里，
 * 在那边以常量形式固定着 —— 见 HANDOFF 的 i18n 章节。
 */
export default {
  'zh-CN': {
    engine: {
      /** 引擎显示名与一行说明；`notExecutes` 是「不执行代码」那枚小徽标 */
      wasm: {
        label: '本地 WASM 沙箱',
        hint: '在浏览器中编译运行，代码不出本机。首次需下载运行时（C++ 约 23MB / Python 约 24MB）。',
        ready: '沙箱可用。首次运行需下载运行时（C++ 约 23MB / Python 约 24MB），之后常驻缓存。',
        noIsolation: '页面缺少跨域隔离，SharedArrayBuffer 不可用；请为 dev server 配置 COOP / COEP 响应头。',
        unavailable: '本地沙箱不可用：{message}',
      },
      native: {
        label: '本机原生编译器',
        hint: '桌面端专用：用本机已装的编译器运行，无需下载运行时；支持 C++ 与 Python。',
        ready: '本机编译链可用（C++ 与 Python）',
        cppUnavailable: 'C++ 编译器不可用：{message}{hint}',
        cppHintMac: '（macOS 可运行 xcode-select --install）',
        cppHintWindows: '（Windows 可装 LLVM、MSYS2 或 MinGW-w64，并确保在 PATH 中）',
        cppHintOther: '',
        pythonUnavailable: 'Python 解释器不可用：{message}{hint}',
        pythonHintMac: '',
        pythonHintWindows: '（Windows 请用 python.org 版本，应用商店别名无效）',
        pythonHintOther: '',
        unavailable: '本机运行失败：{message}',
        unsupportedLanguage: '原生引擎不支持该语言：{language}',
        noDetail: '没有更多信息',
      },
      piston: {
        label: 'Piston',
        hint: '推荐自建：docker run -p 2000:2000 ghcr.io/piston-cli/piston:stable，然后填 http://localhost:2000',
        cancelled: '已取消',
        unreachable: '连不上 {base}（{text}）',
        available: '服务可用，{ms}ms',
        availableNoTime: '服务可用',
        notPiston: '响应格式不是 Piston',
      },
      judge0: {
        label: 'Judge0',
        hint: '填自建地址；公共沙箱（如 https://ce.judge0.com）会吞掉标准输入，仅供试跑。',
        internal: 'Judge0 内部错误',
        statusCode: '状态码 {code}',
        available: '服务可用，{ms}ms',
        /** 服务端没给运行时间（返回里缺 time）：只说「可用」，别编一个数 */
        availableNoTime: '服务可用',
        unreachable: '连不上 {base}',
        returned: '返回 {outcome}',
      },
      echo: {
        label: '自检（不执行代码）',
        hint: '回显标准输入，仅用于联调界面。',
        ready: '内置引擎，无需服务',
      },
      /** 引擎卡片上的小徽标：该引擎不真正执行代码 */
      notExecutes: '不执行代码',
      /** 不兑现内存上限的引擎（native / piston）在说明区补的一句（判定规范 §8） */
      noMemoryLimit: '该引擎不兑现内存上限，不会判 MLE。',
      /** 服务地址输入框的标签与保存按钮 */
      baseLabel: '服务地址',
      localNoBase: '该引擎在本机运行，不需要服务地址。',
      selfTest: '自检',
      checking: '探测中…',
      /** 引擎对象上没有 health() 时，自检按钮给出的说明 */
      selfTestUnsupported: '该引擎未提供自检接口',
    },

    /** 本地运行时（设置 › 本地运行环境） */
    runtime: {
      groupNote: '在浏览器里直接编译运行，代码不出本机。',
      cpp: {
        title: 'C++',
        idleHint: 'clang 23 + libc++（C++20），约 23MB，仅下载一次',
        downloadTitle: '下载 clang 工具链',
        uninstallHint:
          '删除本机 clang 工具链（约 23MB，含预编译头）；下次运行 C++ 需重新下载。',
      },
      python: {
        title: 'Python 3',
        idleHint: 'CPython 3.11 + 标准库，约 24MB，仅下载一次',
        downloadTitle: '下载 Python 运行时',
        uninstallHint:
          '删除本机 Python 运行时（约 24MB）；下次运行 Python 需重新下载。',
      },
      markdown: {
        title: 'Markdown / LaTeX',
        idleHint: '题解预览与公式渲染（katex + marked，约 0.6MB），仅下载一次',
        downloadTitle: '下载题解渲染器',
        uninstallHint:
          '删除本机题解渲染器（约 0.6MB）；下次预览题解需重新下载。',
        downloading: '正在下载题解渲染器…',
        progress: '正在下载题解渲染器（{done}/{total}）…',
      },
      /** 状态行（行首那颗状态点右边那行说明）。就绪不再写「已就绪」—— 状态由绿点表达，
          这里只补一句耗时；没耗时（上次会话就装好的）就整句省略 */
      downloading: '正在下载…',
      readyWithTime: '用时 {seconds} s',
      failed: '下载失败',
      /** 按钮文案（就绪后这颗按钮整颗收起，所以没有「已就绪」这一条） */
      button: {
        downloading: '下载中…',
        failed: '重试',
        idle: '下载',
      },
      uninstall: '卸载',
      /** 行内那个「卸载」按钮的 tooltip（不带问号，问号那版是弹窗标题） */
      uninstallActionTitle: '卸载 {title} 运行环境',
      uninstallTitle: '卸载 {title} 运行环境？',
      /** 「预下载」这几项挂在设置 › 云端同步里：它记的是意图（会跟着账号同步），
          真正的下载在应用下次启动、浏览器空闲时（services/runtimePreload.js） */
      autoPreload: {
        label: '预下载本地运行环境',
        switchTitle:
          '预下载 {title}：下次启动且浏览器空闲时自动下载（本机已有则跳过）',
        note: '该运行环境会在下次启动、浏览器空闲时自动下载；本机已有则跳过。开关随账号同步。',
      },
    },

    /** 沙箱的实时阶段播报（设置页下载那一行会显示） */
    stage: {
      toolchain: '正在获取本地工具链（约 23MB，仅下一次）…',
      compile: '正在编译…',
      run: '正在运行…',
      pythonRuntime: '正在获取 Python 运行时（约 24MB，仅下一次）…',
    },

    error: {
      /** 沙箱与工具链 */
      wasmUnsupported:
        '当前浏览器缺少 {missing}，C++ 工具链（clang 23）跑不起来。请改用 Chrome 137+ / Firefox 131+ / Safari 18.4+。',
      noDecompressionStream: '浏览器不支持 DecompressionStream，无法解包工具链',
      downloadFailed: '{label} 下载失败（HTTP {status}）',
      sysrootFailed: '系统头文件下载失败（HTTP {status}）',
      sysrootNotTar: '系统头文件没有按 tar 解出来（多半是 Content-Encoding: br 没生效）',
      pythonLibFailed: 'Python 标准库下载失败（HTTP {status}）',
      compileFailed: '编译未通过',
      linkFailed: '链接失败',
      pchFailed: '预编译头生成失败（clang 退出码 {code}）',
      oomProbeFailed: '内存探针编译失败（clang 退出码 {code}）',
      programExitCode: '程序退出码 {code}',
      // wasm trap 的「人话 + 原文」：括号里保留 V8 的原文，方便用户拿它去搜
      // （中文部分是归类，不是翻译——同一个 trap 在不同浏览器上措辞可能不同，所以按正则归）
      trapOutOfBounds: '内存访问越界（{raw}）',
      trapUnreachable: '执行到不可达指令，程序已被中止（{raw}）',
      trapDivideByZero: '整数除以零（{raw}）',
      trapRemainderByZero: '整数取模除零（{raw}）',
      trapIntegerOverflow: '整数溢出（{raw}）',
      trapInvalidConversion: '非法的整数转换（{raw}）',
      trapTableIndex: '函数表索引越界（{raw}）',
      trapNullFunction: '调用了空函数指针（{raw}）',
      trapStackOverflow: '调用栈溢出（{raw}）',
      // C++ 未捕获异常（throw / vector::at 越界 / std::stoi 抛 invalid_argument）。
      // 宿主只能拿到 `Exception: [object WebAssembly.Exception]` 这一串，拿不到 what()，
      // 所以不套 {raw}（那串字面对用户没有信息量）。2026-10-25 加。
      trapUncaught: '未捕获的 C++ 异常，程序已被中止',
      compileTimeout: '本地编译超过 {seconds} 秒未返回，已中断。',
      prepareTimeout: '运行环境准备超过 {seconds} 秒未返回，已中断，请检查网络后重试。',

      /** 远端评测服务 */
      noResponse: '服务无响应',
      pistonConnect: '无法连接评测服务 {base}/execute；请在「设置 › 评测」填入自建 Piston 地址。',
      judge0Connect: '无法连接评测服务 {base}。{hint}',
      pistonCompileFailed: '编译失败',
      pistonExitCode: '退出码 {code}',

      /** VFS：这些 message 会被资源管理器直接显示出来 */
      nameEmpty: '名称不能为空',
      nameInvalid: '非法名称',
      nameHasSlash: '名称不能包含 “/”',
      nameHasNull: '名称不能包含空字符',
      pathNotAbsolute: 'VFS 只支持绝对路径：{path}',
      fileNotFound: '文件不存在：{path}',
      notFound: '不存在：{path}',
      alreadyExists: '已存在：{path}',
      duplicateName: '同目录下已存在：{name}',
      targetIsDirectory: '目标是目录，无法写入：{path}',
      parentMissing: '父目录不存在：{path}',
      rootRename: '根目录不能改名',
      rootDelete: '根目录不能删除',
      moveIntoChild: '不能移动到自己的子目录中',
      notImplemented: 'IVFSProvider 子类未实现该方法',
      unknownProvider: '未知的 VFS provider：{kind}',
      notInitialized: 'VFS 尚未初始化：请先 createVFSProvider().init()',
      retainFailed: 'retain 失败：model 尚未创建（{id}）',

      /** 本机文件夹工作区（仅桌面端；错误码由 Rust 侧回，人话在这里翻） */
      workspaceRootMissing: '还没有选择要打开的本机文件夹',
      workspaceNoRoot: '尚未授权任何文件夹，请重新选择',
      workspaceOpenFailed: '打不开这个文件夹：{message}',
      workspaceOutsideRoot: '该路径不在当前工作区内',
      workspaceBinary: '这是二进制文件，编辑器无法打开',
      workspaceTooLarge: '文件太大，编辑器无法打开',
      workspaceSidecarBroken: '工作区元数据损坏，已按空白打开；题目链接、难度与样例可能丢失',

      /** 题目导入 */
      importEmpty: '题目数据为空',

      /** 打包导出。两条都是 zip 格式本身的硬上限（65535 个条目 / 4GB），
       *  正常用不到 —— 兜底给一句人话，别把 `error.zipTooLarge` 这种 key 露给用户 */
      zipTooManyEntries: '条目超过 {max} 个（zip 上限），请分批导出',
      zipTooLarge: '打包后超过 4GB（zip 上限），请分批导出',
    },
  },

  en: {
    engine: {
      wasm: {
        label: 'Local WASM sandbox',
        hint: 'Runs in your browser; your code stays on this machine. The first run downloads the runtime (C++ ≈ 23MB / Python ≈ 24MB).',
        ready:
          'Sandbox available. The first run downloads the runtime (C++ ≈ 23MB / Python ≈ 24MB), then it is cached.',
        noIsolation:
          'The page is not cross-origin isolated, so SharedArrayBuffer is unavailable. Configure COOP / COEP headers on the dev server.',
        unavailable: 'Local sandbox unavailable: {message}',
      },
      native: {
        label: 'Native compiler (desktop)',
        hint: 'Desktop only: uses the compilers already on this machine — no runtime download. Supports C++ and Python.',
        ready: 'The native toolchain is available (C++ and Python)',
        cppUnavailable: 'The C++ compiler is unavailable: {message}{hint}',
        cppHintMac:
          ' (on macOS, run xcode-select --install)',
        cppHintWindows:
          ' (on Windows, install LLVM, MSYS2 or MinGW-w64 and put it on PATH)',
        cppHintOther: '',
        pythonUnavailable: 'The Python interpreter is unavailable: {message}{hint}',
        pythonHintMac: '',
        pythonHintWindows:
          ' (use the python.org build on Windows; the Store alias doesn’t count)',
        pythonHintOther: '',
        unavailable: 'Native run failed: {message}',
        unsupportedLanguage: 'The native engine does not support this language: {language}',
        noDetail: 'no further details',
      },
      piston: {
        label: 'Piston',
        hint: 'Self-hosting is recommended: docker run -p 2000:2000 ghcr.io/piston-cli/piston:stable, then enter http://localhost:2000',
        cancelled: 'Cancelled',
        unreachable: 'Cannot reach {base} ({text})',
        available: 'Service is up, {ms}ms',
        notPiston: 'The response is not in Piston format',
      },
      judge0: {
        label: 'Judge0',
        hint: 'Use a self-hosted address; public sandboxes such as https://ce.judge0.com swallow stdin and are for quick tests only.',
        internal: 'Judge0 internal error',
        statusCode: 'Status {code}',
        available: 'Service is up, {ms}ms',
        /** 同 zh-CN：服务端没给运行时间时只说「可用」 */
        availableNoTime: 'Service is up',
        unreachable: 'Cannot reach {base}',
        returned: 'Returned {outcome}',
      },
      echo: {
        label: 'Self-test (does not run code)',
        hint: 'Echoes stdin as stdout; for UI testing only',
        ready: 'Built-in engine, no service needed',
      },
      notExecutes: 'Does not run code',
      /** 同 zh-CN：不兑现内存上限的引擎提示 */
      noMemoryLimit: 'This engine does not enforce the memory limit and never reports MLE.',
      baseLabel: 'Service URL',
      localNoBase: 'This engine runs on this machine and needs no service URL.',
      selfTest: 'Test connection',
      checking: 'Testing…',
      selfTestUnsupported: 'This engine does not provide a connection test',
    },

    runtime: {
      groupNote: 'Compile and run right inside your browser. Your code never leaves this machine.',
      cpp: {
        title: 'C++',
        idleHint: 'clang 23 + libc++ (C++20), ~23MB, downloaded once',
        downloadTitle: 'Download the clang toolchain',
        uninstallHint:
          'Deletes the cached clang toolchain (~23MB, including the precompiled header); it will be downloaded again on the next C++ run.',
      },
      python: {
        title: 'Python 3',
        idleHint: 'CPython 3.11 + standard library, ~24MB, downloaded once',
        downloadTitle: 'Download the Python runtime',
        uninstallHint:
          'Deletes the cached Python runtime (~24MB); it will be downloaded again on the next Python run.',
      },
      markdown: {
        title: 'Markdown / LaTeX',
        idleHint: 'Editorial preview and math rendering (katex + marked, ~0.6MB), downloaded once',
        downloadTitle: 'Download the editorial renderer',
        uninstallHint:
          'Deletes the cached editorial renderer (~0.6MB); it will be downloaded again on the next preview.',
        downloading: 'Downloading the editorial renderer…',
        progress: 'Downloading the editorial renderer ({done}/{total})…',
      },
      /** The status line to the right of the status dot. "Ready" is no longer spelled
          out — the green dot says it; only the elapsed time is added here, and the whole
          line is omitted when there is no timing (installed in an earlier session) */
      downloading: 'Downloading…',
      readyWithTime: 'Took {seconds} s',
      failed: 'Download failed',
      button: {
        downloading: 'Downloading…',
        failed: 'Retry',
        idle: 'Download',
      },
      uninstall: 'Uninstall',
      uninstallActionTitle: 'Uninstall the {title} runtime',
      uninstallTitle: 'Uninstall the {title} runtime?',
      autoPreload: {
        label: 'Preload local runtimes',
        switchTitle:
          'Preload {title}: download it in the background on the next start (skipped if already present)',
        note: 'Downloads the runtime in the background on the next start if it is missing. These switches sync with your account.',
      },
    },

    stage: {
      toolchain: 'Fetching the local toolchain (~23MB, once)…',
      compile: 'Compiling…',
      run: 'Running…',
      pythonRuntime: 'Fetching the Python runtime (~24MB, once)…',
    },

    error: {
      wasmUnsupported:
        'This browser is missing {missing}, so the C++ toolchain (clang 23) cannot run. Use Chrome 137+ / Firefox 131+ / Safari 18.4+.',
      noDecompressionStream:
        'This browser lacks DecompressionStream, so the toolchain cannot be unpacked',
      downloadFailed: 'Failed to download {label} (HTTP {status})',
      sysrootFailed: 'Failed to download the system headers (HTTP {status})',
      sysrootNotTar: 'System headers did not arrive as a tar archive (Content-Encoding: br probably missing)',
      pythonLibFailed: 'Failed to download the Python standard library (HTTP {status})',
      compileFailed: 'Compilation failed',
      linkFailed: 'Linking failed',
      pchFailed: 'Failed to build the precompiled header (clang exited with {code})',
      oomProbeFailed: 'Failed to build the memory probe (clang exited with {code})',
      programExitCode: 'Program exited with {code}',
      // 英文侧不再把原文放进括号：英文原文本身就是这句话，套上去只会变成
      // "Memory access out of bounds (memory access out of bounds)"（2026-10-25 实测撞到）
      trapOutOfBounds: 'Memory access out of bounds',
      trapUnreachable: 'Program aborted: hit an unreachable instruction',
      trapDivideByZero: 'Integer division by zero',
      trapRemainderByZero: 'Integer remainder by zero',
      trapIntegerOverflow: 'Integer overflow',
      trapInvalidConversion: 'Invalid conversion to integer',
      trapTableIndex: 'Function table index out of bounds',
      trapNullFunction: 'Called a null function pointer',
      trapStackOverflow: 'Call stack overflow',
      /** 见 zh-CN：未捕获的 C++ 异常，正文里不带那串 `[object WebAssembly.Exception]` */
      trapUncaught: 'Uncaught C++ exception — the program was aborted',
      compileTimeout:
        'Local compilation did not return within {seconds} s and was interrupted.',
      prepareTimeout:
        'Runtime preparation did not return within {seconds} s. Check your network and retry.',

      noResponse: 'No response from the service',
      pistonConnect:
        'Cannot reach {base}/execute. Set a self-hosted Piston under Settings › Judge.',
      judge0Connect: 'Cannot reach the judge service at {base}. {hint}',
      pistonCompileFailed: 'Compilation failed',
      pistonExitCode: 'Exited with {code}',

      nameEmpty: 'The name cannot be empty',
      nameInvalid: 'Invalid name',
      nameHasSlash: 'The name cannot contain “/”',
      nameHasNull: 'The name cannot contain a null character',
      pathNotAbsolute: 'The VFS only supports absolute paths: {path}',
      fileNotFound: 'File not found: {path}',
      notFound: 'Not found: {path}',
      alreadyExists: 'Already exists: {path}',
      duplicateName: 'Already exists in this folder: {name}',
      targetIsDirectory: 'Target is a folder and cannot be written to: {path}',
      parentMissing: 'Parent folder not found: {path}',
      rootRename: 'The root folder cannot be renamed',
      rootDelete: 'The root folder cannot be deleted',
      moveIntoChild: 'Cannot move a folder into its own subfolder',
      notImplemented: 'The IVFSProvider subclass did not implement this method',
      unknownProvider: 'Unknown VFS provider: {kind}',
      notInitialized: 'The VFS is not initialised yet: call createVFSProvider().init() first',
      retainFailed: 'retain failed: the model has not been created yet ({id})',

      /** Local-folder workspace (desktop only; codes come from Rust, wording is translated here) */
      workspaceRootMissing: 'No local folder has been selected yet',
      workspaceNoRoot: 'No folder is authorised — please pick one again',
      workspaceOpenFailed: 'Could not open this folder: {message}',
      workspaceOutsideRoot: 'That path is outside the current workspace',
      workspaceBinary: 'This is a binary file; the editor cannot open it',
      workspaceTooLarge: 'This file is too large for the editor to open',
      workspaceSidecarBroken:
        'Workspace metadata is corrupted; opened empty — problem links, difficulty and samples may be lost',

      importEmpty: 'The problem data is empty',

      /** Both are hard limits of the zip format (65 535 entries / 4 GB); unreachable in
       *  practice — here only so the raw `error.zipTooLarge` key never reaches the user. */
      zipTooManyEntries: 'More than {max} entries (zip limit) — export in batches',
      zipTooLarge: 'The archive would exceed 4GB (zip limit) — export in batches',
    },
  },
}
