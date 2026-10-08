//! 「这台机器上该用哪个 C++ 编译器、哪个 Python 解释器」—— 工具链的**唯一出处**。
//!
//! 原先 `native.rs` 里写死了 `clang++` 与 `python3`，那是 macOS 的答案。换到 Windows 有三处
//! 对不上，全部收在本文件里按平台分岔：
//!
//! 1. **系统自带没有 clang++**：Windows 得去 PATH 之外的常见安装目录里捞（MSYS2 / LLVM / MinGW）。
//! 2. **解释器不叫 python3**：Windows 上是 `python`，以及启动器 `py`。
//! 3. **产物必须带 `.exe`**：带别的扩展名的路径不会被 `CreateProcess` 当成可执行文件。
//!
//! Android 是第三种情况，与上面两条路都不同：系统里**既没有编译器、也没有解释器**。
//! 编译器随 APK 打包、启动时解到应用私有目录（见 `android_toolchain.rs`），本文件负责认出它
//! —— `cxx` 先看随包那一份，再退回 PATH 探测；Python 侧目前无解，如实报缺失。
//! （那份工具链是从 Termux 原样搬来的，路径前缀烧死在二进制里，搬到别处还得重新指路：
//! `--sysroot` 在 `cxx_extra_args()`，`LD_LIBRARY_PATH` 与 `TMPDIR` 在 `with_run_env()`
//! 的 Android 分支里，消费者都在 `native.rs`。）
//!
//! 探测结果在进程内缓存：一次运行里同一个工具只找一遍，不必每个用例都去 stat 一串目录。
//!
//! 这里**只认 clang / gcc 两族**。编译参数 `-std=c++17 -O2` 是它们的口径，而 MSVC 的
//! `cl.exe` 是另一套（`/std:c++17 /O2`）—— 支持它等于让编译参数出现第二套口径，违反
//! 「不许另起一套」的既有约束，所以不在范围内。

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::OnceLock;

/// C++ 编译器候选，**按优先级**。两个平台共用一张表：
/// macOS 靠 Xcode 命令行工具自带 clang++；Windows 上通常来自 LLVM 或 MSYS2 的 clang64，
/// 退而求其次用 MinGW 的 g++。
const CXX_NAMES: &[&str] = &["clang++", "g++"];

/// Python 解释器候选，按优先级。`python3` 在 Windows 上一般不存在，会自然落到 `python`；
/// `py` 是 Windows 官方的启动器，前两者都没装成时才轮到它。
const PYTHON_NAMES: &[&str] = &["python3", "python", "py"];

static CXX: OnceLock<Option<PathBuf>> = OnceLock::new();
static PYTHON: OnceLock<Option<PathBuf>> = OnceLock::new();

/// 编译产物的文件名。
///
/// Windows 上必须带 `.exe`：`CreateProcess` 只对**没有扩展名**的路径补 `.exe`，
/// 一个叫 `main.bin` 的文件它是不会执行的（那会变成「编译成功却起不来」）。
pub fn binary_name() -> &'static str {
    if cfg!(windows) {
        "main.exe"
    } else {
        "main.bin"
    }
}

/// 候选名，给「找不到」时的上报文案用 —— 让调用方拼原因，而不是在别处再抄一遍名字表
pub fn cxx_names() -> &'static [&'static str] {
    CXX_NAMES
}

/// 同上，Python 侧
pub fn python_names() -> &'static [&'static str] {
    PYTHON_NAMES
}

/// 找到的 C++ 编译器（绝对路径）。找不到返回 `None`，由调用方按 `unreachable` 口径上报。
///
/// 随包的那一份优先：Android 的系统里没有编译器，PATH 探测注定落空；
/// 其余平台上 `bundled_cxx()` 恒为 `None`，这条短路不影响原有的探测顺序。
pub fn cxx() -> Option<&'static Path> {
    CXX.get_or_init(|| bundled_cxx().or_else(|| find_first(CXX_NAMES, &tool_dirs())))
        .as_deref()
}

/// 找到的 Python 解释器（绝对路径）。语义同上
pub fn python() -> Option<&'static Path> {
    PYTHON
        .get_or_init(|| find_first(PYTHON_NAMES, &tool_dirs()))
        .as_deref()
}

/// 随包工具链里那棵树的根 —— `<root>/usr`（Android 专有），用来定位 `bin/clang++` 与 `lib`。
///
/// **它本身不是 `--sysroot`**：clang 是从 `$PREFIX` 的上一层推搜索路径的
/// （`<sysroot>/usr/include/...`、`<sysroot>/usr/lib`），所以 `--sysroot` 取的是 `<root>`，
/// 见 `cxx_extra_args()`。这一层之所以还在，是因为树的形状本来就是 Termux 的 `$PREFIX`。
///
/// 只存在于 Android：其余平台没有随包工具链，`bundled_cxx` 直接返回 `None`，
/// 不必为它留一个恒空的桩。落点由 `android_toolchain` 那边给，不在这里重拼一遍目录名。
#[cfg(target_os = "android")]
fn bundled_prefix() -> Option<PathBuf> {
    let root = crate::android_toolchain::root_dir().ok()?;
    Some(root.join(crate::android_toolchain::PREFIX_DIR))
}

/// 随包的那份 clang++。树还没落地（首次准备没做完）时返回 `None`，让调用方按缺失上报
#[cfg(target_os = "android")]
fn bundled_cxx() -> Option<PathBuf> {
    let executable = bundled_prefix()?.join("bin").join("clang++");
    executable.is_file().then_some(executable)
}

#[cfg(not(target_os = "android"))]
fn bundled_cxx() -> Option<PathBuf> {
    None
}

/// 送给 C++ 编译器的额外参数 —— 只在「工具链不在它以为的地方」时才需要（Android 专有）。
///
/// 桌面端是空的：编译器就在系统里，头和库都是它自己找得到的默认位置，多给参数反而成了第二套口径。
///
/// Android 那份 clang 从 Termux 搬来，`$PREFIX` 烧死在二进制里，只补一条 `--sysroot` 就够：
/// 树摆成 Termux `$PREFIX` 的样子，clang 按 `<sysroot>/usr/include/...`、`<sysroot>/usr/lib`
/// 推搜索路径，所以这里要的是 `$PREFIX` 的**上一层**，即 `<filesDir>/compiler` 本身，
/// **不是** `<root>/usr`。（这一层是 A7 真机上拿 `clang++ -v -E -x c++ -` 的搜索列表对出来的：
/// 取 `<root>/usr` 时列表里没有 `usr/include/aarch64-linux-android`，取 `<root>` 才有，
/// 而 `asm/types.h` 正在那个目录下，取错就 `'asm/types.h' file not found`。）
///
/// 取对之后下面这些全是 clang 自己补的，一条都不用再给：
/// - 头：`usr/include/c++/v1`、`usr/lib/clang/21/include`、`usr/include/aarch64-linux-android`、`usr/include`
/// - 链接期的 `-L<sysroot>/usr/lib`，以及自动写进产物的 `-Wl,-rpath=<sysroot>/usr/lib`
///   （4b 那份 `hello.bin` 的 `RUNPATH` 正是这一项，反过来说明当时的 `<sysroot>` 就是 `<root>`）
///
/// 拿不到私有目录（`root_dir()` 报错）时返回空表：那说明首次准备没做完，`cxx()` 那边也会
/// 一并返回 `None`，调用方按「缺工具链」上报，轮不到这里兜底。
#[cfg(target_os = "android")]
pub fn cxx_extra_args() -> Vec<std::ffi::OsString> {
    let Some(root) = crate::android_toolchain::root_dir().ok() else {
        return Vec::new();
    };
    vec![format!("--sysroot={}", root.display()).into()]
}

#[cfg(not(target_os = "android"))]
pub fn cxx_extra_args() -> Vec<std::ffi::OsString> {
    Vec::new()
}

/// 把「子进程要用随包工具链」这件事需要调的环境变量一次配齐。
///
/// 名字不叫 `with_toolchain_dir` 是因为它早已不只是「目录」：Windows 上补的是搜索路径，
/// Android 上补的是动态库路径与临时目录，三件事的共同点是**都得落在子进程的环境变量里**
/// （将来再冒出第四件同类的事，也加在这里）。
///
/// MinGW 的 `g++` 编出来的 exe 依赖同目录下的 `libstdc++-6.dll` / `libgcc_s_seh-1.dll`，
/// 而我们是从**常见安装目录**按绝对路径把它捞出来的——那个目录**不一定在 PATH 里**。
/// 于是会出现「编译成功，一运行就报缺 DLL」，且报错在子进程里、看着像运行错误。
/// 运行前把工具链所在目录补进子进程的 PATH 就绕开了。
///
/// Android 也是同一类问题，只是变量不同（见下一段）。
///
/// macOS / Linux 不需要（clang 用的系统库，路径本来就找得到），留个空实现
/// 让调用处不必套 `cfg` —— 调用处只有「把 command 递进来」这一个动作，几个平台写法一致。
#[cfg(not(any(windows, target_os = "android")))]
pub fn with_run_env(_command: &mut Command, _executable: &Path) {}

/// Android：两件事。
///
/// 一是**动态库路径**。随包编译器是从 Termux 原样搬来的，二进制里的 `RUNPATH` 指向 Termux
/// 自己的 `$PREFIX/lib`，搬到我们的私有目录后那条路径并不存在。不给它重新指路，clang 连自己
/// 链接的 `libclang-cpp.so` / `libLLVM.so` 都加载不上，直接起不来 —— 4a 在真机上验过的正是这条。
/// 编译段与运行段都要走这里：前者让 clang 自己起得来，后者让编出来的产物找得到
/// `libc++_shared.so`（`hello.bin` 的 `NEEDED` 里就有它）。两份都从 `<prefix>/lib` 取，
/// 而 `<prefix>` 就是可执行文件的上一层目录 —— 不必再问一趟 JNI。
///
/// 二是**临时目录**。应用进程的环境变量里没有 `TMPDIR`，设备的 `/tmp` 又是 `shell:shell` 的、
/// 应用写不进去，clang 一开工就报 `unable to make temporary file: No such file or directory`
/// （A7 真机上量的）。落点由 `android_toolchain` 给，目录本身在首次准备时就建好了。
/// 这一条只对编译器有意义，但运行段带上它也无害，所以不分段设置。
#[cfg(target_os = "android")]
pub fn with_run_env(command: &mut Command, executable: &Path) {
    if let Ok(scratch) = crate::android_toolchain::tmp_dir() {
        command.env("TMPDIR", scratch);
    }

    let Some(lib) = executable
        .parent()
        .and_then(Path::parent)
        .map(|prefix| prefix.join("lib"))
    else {
        return;
    };
    let current = std::env::var_os("LD_LIBRARY_PATH").unwrap_or_default();
    let mut paths = vec![lib];
    paths.extend(std::env::split_paths(&current));
    if let Ok(joined) = std::env::join_paths(paths) {
        command.env("LD_LIBRARY_PATH", joined);
    }
}

#[cfg(windows)]
pub fn with_run_env(command: &mut Command, executable: &Path) {
    let Some(dir) = executable.parent() else {
        return;
    };
    let current = std::env::var_os("PATH").unwrap_or_default();
    let mut paths = vec![dir.to_path_buf()];
    paths.extend(std::env::split_paths(&current));
    if let Ok(joined) = std::env::join_paths(paths) {
        command.env("PATH", joined);
    }
}

/// 搜索目录 = PATH（剔掉应用商店别名目录）+ 各平台补的常见安装目录
fn tool_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Some(path) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path) {
            if is_store_alias_dir(&dir) {
                continue;
            }
            dirs.push(dir);
        }
    }
    dirs.extend(extra_dirs());
    dirs
}

/// Windows 商店别名目录：里面那个 `python.exe` 是 0 字节占位符，跑它只会把 Microsoft Store
/// 打开。必须整目录跳过，否则会「找到」一个假解释器，症状还很费解（跑 Python 弹商店）。
fn is_store_alias_dir(dir: &Path) -> bool {
    cfg!(windows) && looks_like_store_alias(dir)
}

/// 判断规则本身与平台解耦，`cfg!` 的门只留在调用处 —— 这样这条 Windows 字符串规则
/// 在任何平台上都能被测到，而不是只能靠编译过。
fn looks_like_store_alias(dir: &Path) -> bool {
    dir.to_string_lossy()
        .to_ascii_lowercase()
        .replace('/', "\\")
        .ends_with(r"microsoft\windowsapps")
}

/// 按名字优先级、在给定目录里找第一个存在的可执行文件。
///
/// 是**名字优先**而不是目录优先：`clang++` 在任何一个目录里出现，都该胜过别处的 `g++`。
fn find_first(names: &[&str], dirs: &[PathBuf]) -> Option<PathBuf> {
    for name in names {
        let file = with_exe_suffix(name);
        for dir in dirs {
            let candidate = dir.join(&file);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

/// Windows 上给候选名补 `.exe`。PATH 查找本可以靠 PATHEXT 代劳，但我们自己 stat 目录，
/// 得把扩展名显式拼上。
fn with_exe_suffix(name: &str) -> String {
    if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.to_string()
    }
}

#[cfg(not(windows))]
fn extra_dirs() -> Vec<PathBuf> {
    // macOS 上 Homebrew 装的 python3 落在这里；PATH 里通常也有，补上只是兜底
    vec![
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/local/bin"),
    ]
}

#[cfg(windows)]
fn extra_dirs() -> Vec<PathBuf> {
    let system_drive = std::env::var("SystemDrive").unwrap_or_else(|_| "C:".to_string());
    let program_files =
        std::env::var("ProgramFiles").unwrap_or_else(|_| r"C:\Program Files".to_string());
    let program_files_x86 =
        std::env::var("ProgramFiles(x86)").unwrap_or_else(|_| r"C:\Program Files (x86)".to_string());
    let user_profile = std::env::var("USERPROFILE").unwrap_or_default();

    let mut dirs = Vec::new();
    // MSYS2 四种环境各有一套 bin，都列上：用户装哪一种都认
    for env in ["mingw64", "ucrt64", "clang64", "mingw32"] {
        dirs.push(PathBuf::from(format!(r"{system_drive}\msys64\{env}\bin")));
    }
    dirs.push(PathBuf::from(format!(r"{system_drive}\msys64\usr\bin")));
    dirs.push(PathBuf::from(format!(r"{program_files}\LLVM\bin")));
    dirs.push(PathBuf::from(format!(r"{program_files_x86}\LLVM\bin")));
    dirs.push(PathBuf::from(format!(r"{system_drive}\MinGW\bin")));
    dirs.push(PathBuf::from(format!(r"{system_drive}\mingw64\bin")));
    dirs.push(PathBuf::from(format!(r"{system_drive}\TDM-GCC-64\bin")));
    dirs.push(PathBuf::from(format!(
        r"{program_files}\CodeBlocks\MinGW\bin"
    )));
    if !user_profile.is_empty() {
        dirs.push(PathBuf::from(format!(
            r"{user_profile}\scoop\apps\llvm\current\bin"
        )));
        dirs.push(PathBuf::from(format!(r"{user_profile}\scoop\shims")));
    }
    dirs.extend(python_install_dirs());
    dirs
}

/// 官方安装器的默认落点是 `%LOCALAPPDATA%\Programs\Python\Python3XX\`，
/// 而且「Add Python to PATH」**默认不勾**——不扫这一层就会漏掉最常见的一种装法。
/// 目录名带版本号，所以按版本号从新到旧排，多个版本时优先用新的。
#[cfg(windows)]
fn python_install_dirs() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        roots.push(PathBuf::from(local).join("Programs").join("Python"));
    }
    // 老装法（以及「为所有用户安装」的勾选项）会直接落在盘符根下，如 C:\Python312
    let system_drive = std::env::var("SystemDrive").unwrap_or_else(|_| "C:".to_string());
    roots.push(PathBuf::from(format!(r"{system_drive}\")));

    let mut found = Vec::new();
    for root in roots {
        let Ok(entries) = std::fs::read_dir(&root) else {
            continue;
        };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
            // 只认 Python3xx 这种目录名：盘符根下别的目录（Users、Windows…）一个都不碰
            if name.starts_with("python") && name.len() > "python".len() && entry.path().is_dir() {
                found.push(entry.path());
            }
        }
    }
    found.sort_by_key(|dir| std::cmp::Reverse(version_number(dir)));
    found
}

/// 从 `Python312` 这样的目录名里取出 312，用于排序。解析不出来当 0（排最后）
#[cfg(windows)]
fn version_number(dir: &Path) -> u32 {
    dir.file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.chars().filter(char::is_ascii_digit).collect::<String>())
        .and_then(|digits| digits.parse().ok())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 每个用例独占一个临时目录，测完删掉
    fn scratch_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("cp-toolchain-test-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("建临时目录");
        dir
    }

    fn touch(dir: &Path, name: &str) {
        std::fs::write(dir.join(with_exe_suffix(name)), b"").expect("落一个假可执行文件");
    }

    /// 名字优先：同一个目录里既有 clang++ 又有 g++ 时，必须挑 clang++
    #[test]
    fn prefers_the_earlier_candidate_name() {
        let dir = scratch_dir("prefer");
        touch(&dir, "g++");
        touch(&dir, "clang++");

        let found = find_first(CXX_NAMES, &[dir.clone()]).expect("应该能找到");
        assert_eq!(found, dir.join(with_exe_suffix("clang++")));

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// 名字优先跨目录也成立：第二个目录里的 clang++ 要胜过第一个目录里的 g++
    #[test]
    fn name_priority_outranks_directory_order() {
        let first = scratch_dir("dir-first");
        let second = scratch_dir("dir-second");
        touch(&first, "g++");
        touch(&second, "clang++");

        let found = find_first(CXX_NAMES, &[first.clone(), second.clone()]).expect("应该能找到");
        assert_eq!(found, second.join(with_exe_suffix("clang++")));

        let _ = std::fs::remove_dir_all(&first);
        let _ = std::fs::remove_dir_all(&second);
    }

    /// 目录里没有就是没有，不许瞎猜一个路径回去
    #[test]
    fn returns_none_when_nothing_matches() {
        let dir = scratch_dir("empty");
        assert_eq!(find_first(CXX_NAMES, &[dir.clone()]), None);

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// 目录（而非文件）不该被当成可执行文件
    #[test]
    fn ignores_directories_with_a_matching_name() {
        let dir = scratch_dir("is-dir");
        std::fs::create_dir_all(dir.join(with_exe_suffix("clang++"))).expect("建同名目录");

        assert_eq!(find_first(CXX_NAMES, &[dir.clone()]), None);

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// 产物名必须与平台匹配：Windows 上没有 `.exe` 就根本执行不了
    #[test]
    fn binary_name_matches_the_platform() {
        if cfg!(windows) {
            assert_eq!(binary_name(), "main.exe");
        } else {
            assert_eq!(binary_name(), "main.bin");
        }
    }

    /// 商店别名目录（Windows）必须被跳过；正常目录不许误伤。
    /// 判断规则本身走 `looks_like_store_alias`，所以在 macOS 上也是真跑了这条字符串逻辑，
    /// 不是只编译过。
    #[test]
    fn store_alias_dir_is_filtered_on_windows_only() {
        let alias = Path::new(r"C:\Users\me\AppData\Local\Microsoft\WindowsApps");
        let alias_with_slashes = Path::new("C:/Users/me/AppData/Local/Microsoft/WindowsApps");
        let normal = Path::new(r"C:\msys64\mingw64\bin");

        assert!(looks_like_store_alias(alias));
        // 两种分隔符都要认：路径可能是拼出来的，分隔符不保证
        assert!(looks_like_store_alias(alias_with_slashes));
        assert!(!looks_like_store_alias(normal));

        // 过滤本身只在 Windows 上生效
        assert_eq!(is_store_alias_dir(alias), cfg!(windows));
        assert!(!is_store_alias_dir(normal));
    }

    /// 探测结果在缓存里，两次调用拿到同一个答案（也是「别每次运行都重扫一遍」的保证）
    #[test]
    fn results_are_cached() {
        assert_eq!(cxx().map(Path::to_path_buf), cxx().map(Path::to_path_buf));
        assert_eq!(python().map(Path::to_path_buf), python().map(Path::to_path_buf));
    }

    /// 找得到就必须是绝对路径：相对路径会随子进程的 `current_dir` 变味
    #[test]
    fn found_paths_are_absolute() {
        for found in [cxx(), python()].into_iter().flatten() {
            assert!(found.is_absolute(), "{found:?} 不是绝对路径");
        }
    }
}
