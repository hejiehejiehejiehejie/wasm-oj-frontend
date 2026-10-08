//! 原生（桌面端）代码执行 —— 把前端递过来的一串代码落到一次性临时目录，
//! C++ 调本机的 clang++ / g++ 编译后运行，Python 直接起本机解释器，都按既有的时限口径跑一遍。
//!
//! 「本机到底用哪个编译器、哪个解释器、产物叫什么」一律交给 `toolchain` 模块探测
//! —— 那是唯一出处。本文件不写死任何工具名，也不按平台分岔（macOS 与 Windows 的差别
//! 全在那边，见其文件头）。
//!
//! 这一层刻意**不碰**前端的引擎注册表（`src/services/engines/`）：这里只暴露
//! `run_cpp` / `run_python` 两条命令，返回值与 `EngineExecution` 同构，
//! 前端 `engines/native.js` 包引擎时把 `invoke` 的结果原样递回去。
//!
//! 与浏览器沙箱逐条对齐的口径（依据见各处的注释引用，**不许另起一套**）：
//! - 编译参数 `-std=c++17 -O2`：与 `src/services/runnoSandbox.js` 的 `FRONTEND_ARGS` 同值；
//!   沙箱那边刻意没开 `-fno-exceptions`，这里也不开
//! - 时限**只计运行段、不含编译**：`src/services/runner.js` 的 `TIME_LIMIT_DEFAULT_MS`；
//!   Python 没有编译段，耗时就是「解释器启动 + 程序执行」的墙钟（同 `engines/wasm.js`）
//! - `ok` 时 `stderr` 清空、编译失败的 `durationMs` 记 `null`：`src/services/engines/wasm.js`
//! - outcome 词表：`ok` / `compile-error` / `runtime-error` / `timeout` / `unreachable` / `cancelled`
//!
//! 另外，本文件**不产出任何面向用户的话术**：界面文案一律由前端的 i18n 数据表翻译
//! （见项目约定「界面文案一律不写死」），这里只回原始 stdout / stderr 与机器可读的
//! 状态，拿不到人话的错因就让它空着，前端那边已有兜底文案。

use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use crate::toolchain;

/// 与 `src/services/runner.js` 的 `TIME_LIMIT_DEFAULT_MS` 一致（毫秒）
const DEFAULT_TIME_LIMIT_MS: u64 = 1000;

/// 轮询子进程的间隔。只影响超时的判定精度，不影响 measured 的墙钟耗时
const POLL_INTERVAL: Duration = Duration::from_millis(5);

/// 临时目录名的去重序号：同一纳秒内并发起两次（`runner.js` 的 concurrency = 2）
/// 也必须落到两个不同目录，否则用例之间会互相覆盖源码与可执行文件
static RUN_SEQ: AtomicU64 = AtomicU64::new(0);

/// 支持的语言。决定源码文件名、有没有编译段、用哪个程序去跑。
///
/// 前端只按 `languageId`（`cpp` / `python`）路由到对应的那条命令，命令名是跨语言契约，
/// 见 `src/services/engines/native.js` 里那张表；这张表两边必须逐字对上。
#[derive(Debug, Clone, Copy)]
enum Language {
    Cpp,
    Python,
}

impl Language {
    /// 落进临时目录的源码文件名（扩展名只影响编译器/解释器怎么读，不参与判定）
    fn source_name(self) -> &'static str {
        match self {
            Language::Cpp => "main.cpp",
            Language::Python => "main.py",
        }
    }
}

/// 与前端 `EngineExecution` 同构的返回体。
///
/// 字段用 camelCase 序列化出去，前端拿到就能直接当引擎结果用；
/// `durationMs` 为 `null` 表示「程序没跑起来」（编译失败等），卡片就不显示耗时。
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunOutcome {
    pub outcome: &'static str,
    pub stdout: String,
    pub stderr: String,
    pub duration_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

/// 前端调用方式：`invoke('run_cpp', { code, stdin, timeLimitMs })`
///
/// Tauri v2 会把命令参数按 camelCase 反序列化，所以这里的 `time_limit_ms`
/// 对应前端的 `timeLimitMs`；两边名字写错只会得到一句「参数缺失」。
#[tauri::command]
pub fn run_cpp(code: String, stdin: String, time_limit_ms: Option<u64>) -> RunOutcome {
    run_core(
        Language::Cpp,
        &code,
        &stdin,
        time_limit_ms.unwrap_or(DEFAULT_TIME_LIMIT_MS),
    )
}

/// Python 那条命令，契约与 `run_cpp` 完全一致，只是走解释器、没有编译段。
/// 前端调用方式：`invoke('run_python', { code, stdin, timeLimitMs })`
#[tauri::command]
pub fn run_python(code: String, stdin: String, time_limit_ms: Option<u64>) -> RunOutcome {
    run_core(
        Language::Python,
        &code,
        &stdin,
        time_limit_ms.unwrap_or(DEFAULT_TIME_LIMIT_MS),
    )
}

/// 真正干活的入口：开一个一次性工作区，跑完无论走哪条分支都把它删掉。
///
/// 独立成函数（而不是直接写在命令里）是为了能让 `#[cfg(test)]` 直接调用，
/// 不必起窗口、也不必经过 webview。
fn run_core(language: Language, code: &str, stdin: &str, time_limit_ms: u64) -> RunOutcome {
    let workspace = match unique_workspace() {
        Ok(dir) => dir,
        Err(err) => return internal_failure(err),
    };
    let outcome = run_in_workspace(&workspace, language, code, stdin, time_limit_ms);
    // 跑完即清，失败也不管：临时目录残留不该把一次运行变成报错
    let _ = std::fs::remove_dir_all(&workspace);
    outcome
}

/// 在给定的工作区里走「落盘 →（C++ 才有）编译 → 运行」三步
fn run_in_workspace(
    workspace: &Path,
    language: Language,
    code: &str,
    stdin: &str,
    time_limit_ms: u64,
) -> RunOutcome {
    let source = workspace.join(language.source_name());

    if let Err(err) = std::fs::write(&source, code) {
        return internal_failure(err);
    }

    // 组装「怎么跑这段代码」：C++ 先编译再跑产物，Python 直接起解释器。
    // 两种语言最后都交回同一个 run_program，时限 / kill / 管道 / 退出码口径完全共用。
    let command = match language {
        Language::Cpp => {
            // 编译器由 toolchain 探测，不写死名字：Windows 上没有系统自带的 clang++
            let Some(compiler) = toolchain::cxx() else {
                return missing_toolchain(toolchain::cxx_names());
            };
            // 产物名按平台取：Windows 上不带 .exe 的文件是执行不了的
            let binary = workspace.join(toolchain::binary_name());

            // 编译：与浏览器沙箱同一组参数（src/services/runnoSandbox.js 的 FRONTEND_ARGS）。
            // 这组开关只认 clang / gcc 两族 —— 所以 toolchain 那边也只找这两族，
            // **不给 MSVC 的 cl.exe 加分支**，否则编译参数就成了第二套口径。
            // 这里不加 -fcolor-diagnostics 之类的开关：没有 TTY 时 clang 本来就不着色，
            // 卡片是纯文本渲染，正好对上。
            let compile = Command::new(compiler)
                .arg("-std=c++17")
                .arg("-O2")
                .arg(&source)
                .arg("-o")
                .arg(&binary)
                .current_dir(workspace)
                .output();

            let compile = match compile {
                Ok(output) => output,
                Err(err) => return internal_failure(err),
            };

            if !compile.status.success() {
                // 编译区没有「运行段」，所以耗时记 null；诊断正文是 clang 自己的原文，
                // 前端 runner.js 已经会在它为空时兜底 t('tests.outcome.compileFailed')
                return RunOutcome {
                    outcome: "compile-error",
                    stdout: String::new(),
                    stderr: String::from_utf8_lossy(&compile.stderr).into_owned(),
                    duration_ms: None,
                    detail: None,
                };
            }

            let mut command = Command::new(&binary);
            command.current_dir(workspace);
            // MinGW 编出来的 exe 依赖编译器同目录的 DLL，而那个目录不一定在 PATH 里
            toolchain::with_toolchain_dir(&mut command, compiler);
            command
        }
        Language::Python => {
            // 没有编译段：直接 `python3 main.py`（Windows 上是 `python` / `py`，由探测决定）。
            // 耗时从 spawn 起算，也就是「解释器启动 + 程序执行」的墙钟，与沙箱侧 Python 同口径。
            let Some(interpreter) = toolchain::python() else {
                return missing_toolchain(toolchain::python_names());
            };
            let mut command = Command::new(interpreter);
            command.arg(&source).current_dir(workspace);
            toolchain::with_toolchain_dir(&mut command, interpreter);
            command
        }
    };

    run_program(command, stdin, time_limit_ms)
}

/// 起子进程、推 stdin、读输出、跑不完就杀
///
/// 三条管道各配一个线程是必须的，不是洁癖：输出等程序结束再读会被管道缓冲区堵死
/// （程序写满 64KB 就卡住不退出，我们又在等它退出 —— 经典死锁）；stdin 若在主线程
/// 直接写，程序不读它同样会把我们卡死。
///
/// 收进来的 `command` 已经带好了要跑什么（产物路径或解释器 + 脚本）与工作目录，
/// 这里只负责接管道、计时、到点 kill。
fn run_program(mut command: Command, stdin: &str, time_limit_ms: u64) -> RunOutcome {
    let mut child = match command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(child) => child,
        Err(err) => return internal_failure(err),
    };

    let writer = {
        let mut pipe = child.stdin.take();
        let payload = stdin.as_bytes().to_vec();
        thread::spawn(move || {
            if let Some(pipe) = pipe.as_mut() {
                // 程序提前退出（或压根不读 stdin）时管道会断，BrokenPipe 属正常现象
                let _ = pipe.write_all(&payload);
            }
            // 函数返回时 pipe 被 drop，等于给子进程关上 stdin —— 不发 EOF 的话
            // 一个 while (std::cin >> x) 会永远等下去
        })
    };
    let stdout_pipe = child.stdout.take();
    let stdout_reader = thread::spawn(move || read_to_string(stdout_pipe));
    let stderr_pipe = child.stderr.take();
    let stderr_reader = thread::spawn(move || read_to_string(stderr_pipe));

    let limit = Duration::from_millis(time_limit_ms);
    let started = Instant::now();
    let mut timed_out = false;

    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) => {
                if started.elapsed() >= limit {
                    // 到点就杀：这是 TLE，与沙箱的看门狗同一口径
                    let _ = child.kill();
                    timed_out = true;
                    break child.wait().ok();
                }
                thread::sleep(POLL_INTERVAL);
            }
            Err(_) => break child.wait().ok(),
        }
    };

    // 运行段墙钟：从 spawn 到这里，不含编译。这就是卡片上显示的耗时口径
    let duration_ms = Some(started.elapsed().as_millis() as u64);

    // 读线程要么已经读完，要么因为管道被关闭而返回，两个 join 都不会再阻塞
    let _ = writer.join();
    let stdout = stdout_reader.join().unwrap_or_default();
    let stderr = stderr_reader.join().unwrap_or_default();

    if timed_out {
        return RunOutcome {
            outcome: "timeout",
            stdout,
            stderr,
            duration_ms,
            detail: None,
        };
    }

    // 退出码 0 才算 ok；非 0 与「被信号杀死」（code() 为 None）都归 runtime-error
    let succeeded = matches!(status, Some(status) if status.code() == Some(0));
    RunOutcome {
        outcome: if succeeded { "ok" } else { "runtime-error" },
        stdout,
        // ok 时把 stderr 清空，与 src/services/engines/wasm.js 的处理一致
        stderr: if succeeded { String::new() } else { stderr },
        duration_ms,
        detail: None,
    }
}

/// 一次运行独占一个目录：进程号 + 自增序号 + 纳秒时间戳，三者凑一起才够唯一
fn unique_workspace() -> std::io::Result<PathBuf> {
    let seq = RUN_SEQ.fetch_add(1, Ordering::Relaxed);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_nanos())
        .unwrap_or(0);
    let dir = std::env::temp_dir().join(format!("cp-native-{}-{seq}-{nanos}", std::process::id()));
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// 环境层面的失败（建目录、写文件、起进程）：交给前端翻成人话，
/// 这里只回原始错误文本，`durationMs` 为 null
fn internal_failure(err: std::io::Error) -> RunOutcome {
    RunOutcome {
        outcome: "unreachable",
        stdout: String::new(),
        stderr: err.to_string(),
        duration_ms: None,
        detail: None,
    }
}

/// 机器上压根没有这条工具链（PATH 与常见安装目录里都没有）。
///
/// 与 `internal_failure` 同一个 `unreachable` 口径，只是原因不是 `io::Error`；
/// 回的仍是机器可读的原始文本（「哪些名字都没找到」），人话由前端 i18n 拼上去。
fn missing_toolchain(names: &[&str]) -> RunOutcome {
    RunOutcome {
        outcome: "unreachable",
        stdout: String::new(),
        stderr: format!("{} not found", names.join(" / ")),
        duration_ms: None,
        detail: None,
    }
}

/// 把一条管道读到 EOF。读的过程中子进程可能已经把写端关了，失败就当空串处理
fn read_to_string<R: Read>(pipe: Option<R>) -> String {
    let mut buffer = Vec::new();
    if let Some(mut pipe) = pipe {
        let _ = pipe.read_to_end(&mut buffer);
    }
    String::from_utf8_lossy(&buffer).into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compiles_and_runs_a_program() {
        let code = "#include <iostream>\nint main(){ std::cout << \"hi\"; return 0; }\n";
        let result = run_core(Language::Cpp, code, "", 5_000);
        assert_eq!(result.outcome, "ok", "stderr = {}", result.stderr);
        assert_eq!(result.stdout, "hi");
        // ok 时 stderr 必须是空的，否则卡片会显示不该显示的东西
        assert_eq!(result.stderr, "");
        assert!(result.duration_ms.is_some());
    }

    #[test]
    fn feeds_stdin_to_the_program() {
        // 竞赛题第一件事就是读入，stdin 推不进去这个引擎就没用
        let code = "#include <iostream>\nint main(){ int a = 0, b = 0; std::cin >> a >> b; std::cout << a + b; }\n";
        let result = run_core(Language::Cpp, code, "1 2\n", 5_000);
        assert_eq!(result.outcome, "ok", "stderr = {}", result.stderr);
        assert_eq!(result.stdout, "3");
    }

    #[test]
    fn reports_compile_error_without_duration() {
        let result = run_core(Language::Cpp, "int main() { this is not c++ }", "", 5_000);
        assert_eq!(result.outcome, "compile-error");
        // 没跑起来就没有运行段耗时，卡片不该显示时间
        assert_eq!(result.duration_ms, None);
        assert!(!result.stderr.is_empty(), "clang 的诊断正文应该原样回传");
    }

    #[test]
    fn reports_runtime_error_for_nonzero_exit() {
        let code = "#include <iostream>\nint main(){ std::cout << \"before\"; return 3; }\n";
        let result = run_core(Language::Cpp, code, "", 5_000);
        assert_eq!(result.outcome, "runtime-error");
        // 崩之前已经吐出来的那一截要留着，判定用得上
        assert_eq!(result.stdout, "before");
    }

    #[test]
    fn kills_a_program_that_never_ends() {
        // volatile 累加是为了让这个死循环真的进不去优化：C++ 允许把「没有副作用的
        // 无限循环」当成不会发生，-O2 下可能被整段删掉，那这个用例就白测了
        let code = "int main(){ volatile long long x = 0; for(;;){ x = x + 1; } }\n";
        let result = run_core(Language::Cpp, code, "", 300);
        assert_eq!(result.outcome, "timeout");
        // 真的是「到点被杀」而不是「等程序自己结束」：墙钟该在时限附近，不该成倍
        let duration = result.duration_ms.expect("超时也该有运行段耗时");
        assert!(duration < 5_000, "duration = {duration}ms，看着不像被 kill 的");
    }

    /// Python 没有编译段：直接落盘 main.py 起解释器，与 C++ 共用同一套管道 / 时限口径
    #[test]
    fn runs_python_with_stdin() {
        let code = "a, b = map(int, input().split())\nprint(a + b)\n";
        let result = run_core(Language::Python, code, "1 2\n", 5_000);
        assert_eq!(result.outcome, "ok", "stderr = {}", result.stderr);
        // print 自带换行，这里照原样断言；判定那侧由 compare.js 的 normalizeLines 收尾
        assert_eq!(result.stdout, "3\n");
        // ok 时 stderr 同样要清空，与 C++ / 沙箱一致
        assert_eq!(result.stderr, "");
        assert!(result.duration_ms.is_some());
    }

    /// Python 的语法错误发生在「运行段」（解释器启动后解析源码），不是编译段：
    /// 按既有的 outcome 词表归 runtime-error，durationMs 照常有值
    #[test]
    fn reports_python_syntax_error_as_runtime_error() {
        let result = run_core(Language::Python, "print(1\n", "", 5_000);
        assert_eq!(result.outcome, "runtime-error");
        assert!(!result.stderr.is_empty(), "解释器的诊断正文应该原样回传");
        assert!(result.duration_ms.is_some());
    }

    /// Python 死循环同样要被看门狗 kill 掉
    #[test]
    fn kills_a_python_program_that_never_ends() {
        let result = run_core(Language::Python, "while True:\n    pass\n", "", 300);
        assert_eq!(result.outcome, "timeout");
    }
}
