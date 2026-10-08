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
        hint: '在浏览器里编译运行，代码不出本机；支持 C++ 与 Python，首次需下载本地运行时（C++ 约 50MB / Python 约 24MB）',
        ready: '本地沙箱可用，首次运行需下载本地运行时（C++ 约 50MB / Python 约 24MB，之后常驻缓存）',
        noIsolation: '页面没有跨域隔离，SharedArrayBuffer 不可用：确认 dev server 已注入 COOP / COEP 响应头',
        unavailable: '本地沙箱不可用：{message}',
      },
      native: {
        label: '本机原生编译器',
        hint: '桌面端专用：直接用本机已装好的编译器运行，不下载任何运行时；支持 C++（clang++）与 Python',
        ready: '本机编译链可用（C++ 与 Python）',
        cppUnavailable: 'C++ 编译器不可用：{message}（macOS 可执行 xcode-select --install 装命令行工具）',
        pythonUnavailable: 'Python 解释器不可用：{message}',
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
        notPiston: '响应格式不是 Piston',
      },
      judge0: {
        label: 'Judge0',
        hint: '填自建地址（https://ce.judge0.com 这类公共沙箱会吞掉标准输入，只适合试跑）',
        internal: 'Judge0 内部错误',
        statusCode: '状态码 {code}',
        available: '服务可用，{ms}ms',
        unreachable: '连不上 {base}',
        returned: '返回 {outcome}',
      },
      echo: {
        label: '自检（不执行代码）',
        hint: '把标准输入原样回显成输出，仅用于联调界面与状态流转',
        ready: '内置引擎，无需服务',
      },
      /** 引擎卡片上的小徽标：该引擎不真正执行代码 */
      notExecutes: '不执行代码',
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
        idleHint: 'clang 8 + libc++，约 50MB，只下一次',
        downloadTitle: '下载 clang 工具链',
        uninstallHint:
          '将从本机删除已缓存的 clang 工具链（约 50MB，另含编译加速用的预编译头）。下次运行 C++ 代码时需要重新下载。',
      },
      python: {
        title: 'Python 3',
        idleHint: 'CPython 3.11 + 标准库，约 24MB，只下一次',
        downloadTitle: '下载 Python 运行时',
        uninstallHint:
          '将从本机删除已缓存的 Python 运行时（解释器 + 标准库，约 24MB）。下次运行 Python 代码时需要重新下载。',
      },
      markdown: {
        title: 'Markdown / LaTeX',
        idleHint: '题解预览与公式渲染（katex + marked，约 0.6MB），只下一次',
        downloadTitle: '下载题解渲染器',
        uninstallHint:
          '将从本机删除已缓存的题解渲染器（公式排版与字形，约 0.6MB）。下次预览题解时需要重新下载。',
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
          '预下载 {title}：应用下次启动、浏览器空闲时自动把它下到本机（本机已有就跳过）',
        note: '打开后，该运行环境会在应用下次启动、浏览器空闲时自动下载，本机已有则跳过。这几个开关是偏好，会跟着账号同步到其它设备。',
      },
    },

    /** 沙箱的实时阶段播报（设置页下载那一行会显示） */
    stage: {
      toolchain: '正在获取本地工具链（编译器 + 系统头文件，约 50MB，只下一次）…',
      compile: '正在编译…',
      run: '正在运行…',
      pythonRuntime: '正在获取 Python 运行时（解释器 + 标准库，约 24MB，只下一次）…',
    },

    error: {
      /** 沙箱与工具链 */
      noDecompressionStream: '当前浏览器不支持 DecompressionStream，无法解包本地工具链',
      downloadFailed: '{label} 下载失败（HTTP {status}）',
      sysrootFailed: '系统头文件下载失败（HTTP {status}）',
      pythonLibFailed: 'Python 标准库下载失败（HTTP {status}）',
      compileFailed: '编译未通过',
      linkFailed: '链接失败',
      pchFailed: '预编译头生成失败（clang 退出码 {code}）',
      programExitCode: '程序退出码 {code}',
      compileTimeout:
        '本地编译超过 {seconds} s 没有返回，已中断（正常编译只要几百毫秒，超时多半是这段代码触发了工具链的极端情况）。',
      prepareTimeout: '本地运行环境准备超过 {seconds} s 没有返回，已中断，请检查网络后重试。',

      /** 远端评测服务 */
      noResponse: '服务无响应',
      pistonConnect: '无法连接评测服务 {base}/execute。用设置里的「评测」改成自建 Piston 地址即可。',
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

      /** 题目导入 */
      importEmpty: '题目数据为空',
    },
  },

  en: {
    engine: {
      wasm: {
        label: 'Local WASM sandbox',
        hint: 'Compiles and runs in your browser; your code never leaves this machine. Supports C++ and Python — the first run downloads the local runtime (C++ ≈ 50MB / Python ≈ 24MB).',
        ready:
          'The local sandbox is available. The first run downloads the local runtime (C++ ≈ 50MB / Python ≈ 24MB), which is cached afterwards.',
        noIsolation:
          'This page is not cross-origin isolated, so SharedArrayBuffer is unavailable. Check that your dev server sends the COOP / COEP response headers.',
        unavailable: 'Local sandbox unavailable: {message}',
      },
      native: {
        label: 'Native compiler (desktop)',
        hint: 'Desktop only: runs your code with the compilers already installed on this machine — no runtime download. Supports C++ (clang++) and Python.',
        ready: 'The native toolchain is available (C++ and Python)',
        cppUnavailable:
          'The C++ compiler is unavailable: {message} (on macOS, run xcode-select --install to install the command line tools)',
        pythonUnavailable: 'The Python interpreter is unavailable: {message}',
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
        hint: 'Enter your own self-hosted address (public sandboxes such as https://ce.judge0.com swallow stdin and are only good for a quick try)',
        internal: 'Judge0 internal error',
        statusCode: 'Status {code}',
        available: 'Service is up, {ms}ms',
        unreachable: 'Cannot reach {base}',
        returned: 'Returned {outcome}',
      },
      echo: {
        label: 'Self-test (does not run code)',
        hint: 'Echoes the standard input back as output; for exercising the UI and state flow only',
        ready: 'Built-in engine, no service needed',
      },
      notExecutes: 'Does not run code',
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
        idleHint: 'clang 8 + libc++, about 50MB, downloaded once',
        downloadTitle: 'Download the clang toolchain',
        uninstallHint:
          'Deletes the cached clang toolchain from this device (about 50MB, plus the precompiled header used to speed up compilation). It will be downloaded again the next time you run C++ code.',
      },
      python: {
        title: 'Python 3',
        idleHint: 'CPython 3.11 + standard library, about 24MB, downloaded once',
        downloadTitle: 'Download the Python runtime',
        uninstallHint:
          'Deletes the cached Python runtime from this device (interpreter + standard library, about 24MB). It will be downloaded again the next time you run Python code.',
      },
      markdown: {
        title: 'Markdown / LaTeX',
        idleHint: 'Editorial preview and math rendering (katex + marked, about 0.6MB), downloaded once',
        downloadTitle: 'Download the editorial renderer',
        uninstallHint:
          'Deletes the cached editorial renderer from this device (math layout and glyphs, about 0.6MB). It will be downloaded again the next time you preview an editorial.',
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
          'Preload {title}: download it automatically in the background the next time the app starts (skipped when this device already has it)',
        note: 'Once on, the runtime is downloaded automatically in the background the next time the app starts — skipped when this device already has it. These switches are preferences, so they sync with your account.',
      },
    },

    stage: {
      toolchain: 'Fetching the local toolchain (compiler + system headers, about 50MB, downloaded once)…',
      compile: 'Compiling…',
      run: 'Running…',
      pythonRuntime: 'Fetching the Python runtime (interpreter + standard library, about 24MB, downloaded once)…',
    },

    error: {
      noDecompressionStream:
        'This browser does not support DecompressionStream, so the local toolchain cannot be unpacked',
      downloadFailed: 'Failed to download {label} (HTTP {status})',
      sysrootFailed: 'Failed to download the system headers (HTTP {status})',
      pythonLibFailed: 'Failed to download the Python standard library (HTTP {status})',
      compileFailed: 'Compilation failed',
      linkFailed: 'Linking failed',
      pchFailed: 'Failed to build the precompiled header (clang exited with {code})',
      programExitCode: 'Program exited with {code}',
      compileTimeout:
        'Local compilation did not return within {seconds} s and was interrupted. Normal compilations take a few hundred milliseconds — a timeout usually means this code hit an extreme case in the toolchain.',
      prepareTimeout:
        'Preparing the local runtime did not return within {seconds} s and was interrupted. Check your network and try again.',

      noResponse: 'No response from the service',
      pistonConnect:
        'Cannot reach the judge service at {base}/execute. Point Settings › Judge › Service URL at a self-hosted Piston to fix this.',
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

      importEmpty: 'The problem data is empty',
    },
  },
}
