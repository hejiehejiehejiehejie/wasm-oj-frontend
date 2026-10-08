//! 桌面端「打开本机文件夹」的磁盘原语层 —— 选一个工作区根、列目录、读文件。
//!
//! 【为什么有这个模块】项目有一条硬约束：**前端不给 fs / shell 权限**，webview 里
//! 拿不到任何文件系统能力。所以本机文件夹既不经过 `tauri-plugin-fs`（那个会把 fs 权限
//! 按 scope 授给前端 JS），也不让前端碰绝对路径 —— 所有读写都经由这里的
//! `#[tauri::command]`，且命令**只收相对路径**，绝对根由本模块的 [`WorkspaceState`] 持有。
//! 前端即使被注入脚本，也拼不出一个能跑到授权根之外的路径。
//!
//! 【本层是哑原语】不做业务规则（哪些目录该跳过由前端传参数决定，这里不写死策略），
//! 也不产出面向用户的话术：出错时回的是**稳定错误码**
//! （`no-root` / `outside-root` / `not-found` / `already-exists` / `binary` / `too-large` / `io:…`），
//! 人话由前端的 i18n 数据表翻 —— 与 `native.rs` / `android_toolchain.rs` 同一条纪律。
//!
//! 【只在桌面端编译】Android 上这套原语不成立（那边走 SAF），所以模块在 `lib.rs` 里
//! 由 `#[cfg(desktop)]` 收着；依赖也只在非 Android 目标上声明（见 Cargo.toml）。

use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};
use std::sync::mpsc::{channel, RecvTimeoutError};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant, UNIX_EPOCH};

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use tauri::{Emitter, State};
use tauri_plugin_dialog::DialogExt;

/// 判定「这是不是二进制」的探针长度：只看文件头，不把整个文件拉进内存。
const PROBE_BYTES: usize = 8 * 1024;

/// 文件监听的自身写入抑制窗口：这段时间内落在同一路径的事件一律当作回环丢掉。
/// 这是两道保险里的第一道，第二道是前端重扫时的指纹比对。
const SELF_WRITE_WINDOW: Duration = Duration::from_millis(400);

/// 文件监听的去抖窗：一波事件静默这么久之后才合成一次通知。一次 `git checkout`
/// 会打出成百上千个事件，逐个推给前端等于让前端重扫几百遍。
const CHANGE_DEBOUNCE: Duration = Duration::from_millis(200);

/// 超过这个大小就不给编辑器打开。Monaco 载入几十上百 MB 的文本会把界面卡死；
/// 与前端 `FileExplorer` 的提示共用这一个口径（树里标 `tooLarge`，打开时被拦）。
const MAX_TEXT_BYTES: u64 = 5 * 1024 * 1024;

// ------------------------------------------------------------------ 进程状态

/// 当前授权的工作区根，以及跟着它走的两样东西：文件监听器、自身写入的记账。
#[derive(Default)]
pub struct WorkspaceState {
    root: Mutex<Option<PathBuf>>,
    /// 递归监听器。**丢掉它 = 停监听**：回调随之释放，发送端断开，去抖线程自行退出。
    watcher: Mutex<Option<RecommendedWatcher>>,
    /// 最近由本进程写过的路径 → 时刻。监听回调据此丢掉回环事件
    self_writes: Arc<Mutex<HashMap<PathBuf, Instant>>>,
    /// 过滤策略由前端在 `fs_scan` 时递进来（策略留在 JS，这里只收参数）。
    /// 监听回调拿它过滤事件，免得 `.git` / `node_modules` 里的动静也把前端叫起来重扫。
    ignore: Arc<Mutex<IgnoreRules>>,
}

impl WorkspaceState {
    fn set(&self, root: PathBuf) {
        *lock(&self.root) = Some(root);
    }

    fn get(&self) -> Option<PathBuf> {
        lock(&self.root).clone()
    }

    /// 收回授权，并停掉监听。
    fn clear(&self) {
        *lock(&self.watcher) = None;
        *lock(&self.root) = None;
    }

    fn set_ignore(&self, rules: IgnoreRules) {
        *lock(&self.ignore) = rules;
    }

    /// 记一笔自身写入（`fs_write` / `fs_mkdir` / `fs_delete` / `fs_rename` 成功后调用）。
    fn mark_self_write(&self, path: &Path) {
        mark_self_write(&self.self_writes, path);
    }
}

/// 取锁；被毒化（某个线程 panic 在锁里）时取回内层数据。这几个字段都没有会被半途
/// 写坏的跨字段不变量，不该因为别处 panic 就让整个工作区不可用。
fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

// ------------------------------------------------------------------ 出入参

/// 一个已授权的根。`root` 是磁盘绝对路径，`name` 是最后一级目录名（界面拿来显示）。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceInfo {
    pub root: String,
    pub name: String,
}

/// 目录树里的一个条目。路径 `rel` 是相对根的 POSIX 风格路径（分隔符统一成 `/`）。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceEntry {
    pub rel: String,
    pub name: String,
    /// `"file"` 或 `"directory"`
    pub kind: &'static str,
    pub size: u64,
    pub mtime_ms: Option<u64>,
    /// 文件头是二进制（含 NUL 或非法 UTF-8）：可以看，但不给编辑器打开
    pub binary: bool,
    /// 超过 [`MAX_TEXT_BYTES`]：同上，只提示不打开
    pub too_large: bool,
}

#[derive(Debug, Serialize)]
pub struct ScanReport {
    pub nodes: Vec<WorkspaceEntry>,
}

#[derive(Debug, Serialize)]
pub struct ReadFile {
    pub content: String,
}

/// 一次写入之后目标的落盘事实。前端拿它更新节点指纹（不必再 stat 一次）。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteReport {
    pub mtime_ms: Option<u64>,
    pub size: u64,
}

/// 前端给的过滤策略。**实现留在前端**（见 `src/services/vfs/ignoreRules.js`）：
/// 这里只收参数，不写死任何目录名 —— 免得同一套规则在两边各有一份。
///
/// `Default` 是给监听回调用的兜底：`workspace_open` 起监听时前端还没调过 `fs_scan`，
/// 这一刻按「跳过点开头项」这条最保守的规则走（目录名单随即由第一次 `fs_scan` 补上）。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IgnoreRules {
    /// 跳过以 `.` 开头的条目
    #[serde(default)]
    pub dot_files: bool,
    /// 额外跳过的名字（按单级名字比，不看层级）
    #[serde(default)]
    pub dir_names: Vec<String>,
}

impl Default for IgnoreRules {
    fn default() -> Self {
        Self {
            dot_files: true,
            dir_names: Vec::new(),
        }
    }
}

/// 文件监听推给前端的事件体。`paths` 是相对根的 POSIX 路径（已去重），
/// 目前只作调试信息 —— 前端收到就全量重扫，并不看里面有什么。
#[derive(Debug, Clone, Serialize)]
pub struct ChangedEvent {
    pub paths: Vec<String>,
}

// ------------------------------------------------------------------ 命令

/// 前端调用方式：`invoke('workspace_choose')` —— 弹原生目录选择器，选中即授权。
///
/// 取消选择时回 `null`（不是错误）。函数体同步，但标了 `async`：Tauri 会把它丢到
/// 线程池上跑，避开「在主线程阻塞弹窗」。
#[tauri::command]
pub async fn workspace_choose(
    app: tauri::AppHandle,
    state: State<'_, WorkspaceState>,
) -> Result<Option<WorkspaceInfo>, String> {
    // 由 Rust 侧调 dialog 插件：前端因此不需要任何 dialog capability
    let Some(picked) = app.dialog().file().blocking_pick_folder() else {
        return Ok(None);
    };
    // into_path 的 Err 是插件自己的错误类型（内部包着 io 错），这里统一归到 io: 前缀下
    let path = picked.into_path().map_err(|err| format!("io:{err}"))?;
    let root = canonical_dir(&path)?;
    activate(&app, &state, root.clone());
    Ok(Some(info_of(&root)))
}

/// 前端调用方式：`invoke('workspace_open', { root })` —— 重新授权一个已知的根。
///
/// 用于界面重载 / 应用重启之后：Rust 进程里的 [`WorkspaceState`] 是空的，前端把上次
/// 记住的路径再递一次即可（真正的权威仍是这里的校验：路径必须存在且是目录）。
/// 授权同时把递归文件监听挂上（换根时旧监听被替换掉）。
#[tauri::command]
pub async fn workspace_open(
    app: tauri::AppHandle,
    root: String,
    state: State<'_, WorkspaceState>,
) -> Result<WorkspaceInfo, String> {
    let path = canonical_dir(Path::new(&root))?;
    activate(&app, &state, path.clone());
    Ok(info_of(&path))
}

/// 前端调用方式：`invoke('workspace_close')` —— 收回授权并停掉监听。
#[tauri::command]
pub async fn workspace_close(state: State<'_, WorkspaceState>) -> Result<(), String> {
    state.clear();
    Ok(())
}

/// 前端调用方式：`invoke('fs_scan', { ignore: { dotFiles: true, dirNames: [...] } })`
///
/// 全量重扫授权根，返回**平表**（`rel` + `kind`），树结构由前端拼 —— 这样前端刷新时
/// 拿到的是同一份可比对的指纹，不需要为增量维护另一套协议。
/// 顺带把过滤策略存进 state：文件监听的回调要用同一份规则（策略仍只由前端给）。
#[tauri::command]
pub async fn fs_scan(
    ignore: IgnoreRules,
    state: State<'_, WorkspaceState>,
) -> Result<ScanReport, String> {
    let root = state.get().ok_or_else(no_root)?;
    let mut nodes = Vec::new();
    scan(&root, &root, &ignore, &mut nodes)?;
    state.set_ignore(ignore);
    Ok(ScanReport { nodes })
}

/// 前端调用方式：`invoke('fs_read', { rel })`
///
/// 二进制与超大文件不返回正文，分别回 `binary` / `too-large` 两个错误码 ——
/// 界面据它给只读提示（见 `FileExplorer` 的 notice 横幅）。
#[tauri::command]
pub async fn fs_read(rel: String, state: State<'_, WorkspaceState>) -> Result<ReadFile, String> {
    let root = state.get().ok_or_else(no_root)?;
    let path = resolve(&root, &rel)?;

    let meta = std::fs::metadata(&path).map_err(io_error)?;
    if meta.is_dir() {
        return Err("not-found".to_string());
    }
    if meta.len() > MAX_TEXT_BYTES {
        return Err("too-large".to_string());
    }

    let bytes = std::fs::read(&path).map_err(io_error)?;
    if looks_binary(&bytes) {
        return Err("binary".to_string());
    }
    // 上面已过二进制判定，走到这里还失败的只剩「结尾被切掉的半个字符」这类边角
    let content = String::from_utf8(bytes).map_err(|_| "binary".to_string())?;
    Ok(ReadFile { content })
}

/// 前端调用方式：`invoke('fs_write', { rel, content })`
///
/// **原子替换**：先往同目录写一个点开头的临时文件（点开头不进树的扫描结果），
/// 再用 `rename` 覆盖目标 —— 同目录保证是同一文件系统内的原子操作，
/// 用户绝不会读到「写了一半」的正文。
#[tauri::command]
pub async fn fs_write(
    rel: String,
    content: String,
    state: State<'_, WorkspaceState>,
) -> Result<WriteReport, String> {
    let root = state.get().ok_or_else(no_root)?;
    let path = resolve(&root, &rel)?;
    if path == root {
        return Err("outside-root".to_string());
    }
    if path.is_dir() {
        return Err("not-found".to_string());
    }

    let parent = path.parent().ok_or_else(|| "outside-root".to_string())?;
    let name = path.file_name().ok_or_else(|| "outside-root".to_string())?;
    let temp = parent.join(format!(
        ".{}.cp-tmp-{}",
        name.to_string_lossy(),
        unique_suffix()
    ));

    std::fs::write(&temp, content.as_bytes()).map_err(io_error)?;
    if let Err(err) = std::fs::rename(&temp, &path) {
        // 收尾：留下临时文件会污染用户目录
        let _ = std::fs::remove_file(&temp);
        return Err(io_error(err));
    }
    // 这笔写入会触发监听事件，记下来让回调丢掉它（临时文件是点开头，本来就被忽略规则挡掉）
    state.mark_self_write(&path);
    report_write(&path)
}

/// 前端调用方式：`invoke('fs_mkdir', { rel })`
///
/// 只建**一级**：父目录必须已存在（与 VFS 的 `createDirectory` 同一契约）。
/// 目标已存在回 `already-exists`，不静默吞掉。
#[tauri::command]
pub async fn fs_mkdir(rel: String, state: State<'_, WorkspaceState>) -> Result<(), String> {
    let root = state.get().ok_or_else(no_root)?;
    let path = resolve(&root, &rel)?;
    if path == root || path.exists() {
        return Err("already-exists".to_string());
    }
    std::fs::create_dir(&path).map_err(io_error)?;
    state.mark_self_write(&path);
    Ok(())
}

/// 前端调用方式：`invoke('fs_delete', { rel, recursive })`
///
/// 目录默认只删空目录（`recursive=false`）；递归删除由前端明确要求。
/// **根不可删**：`rel` 指向根本身时一律拒。
#[tauri::command]
pub async fn fs_delete(
    rel: String,
    recursive: bool,
    state: State<'_, WorkspaceState>,
) -> Result<(), String> {
    let root = state.get().ok_or_else(no_root)?;
    let path = resolve(&root, &rel)?;
    if path == root {
        return Err("outside-root".to_string());
    }
    let meta = std::fs::metadata(&path).map_err(|_| "not-found".to_string())?;
    let result = if meta.is_dir() {
        if recursive {
            std::fs::remove_dir_all(&path)
        } else {
            std::fs::remove_dir(&path)
        }
    } else {
        std::fs::remove_file(&path)
    };
    result.map_err(io_error)?;
    state.mark_self_write(&path);
    Ok(())
}

/// 前端调用方式：`invoke('fs_rename', { from, to })`
///
/// 改名 / 移动；目录整棵子树跟着走（系统调用自带）。**目标已存在一律拒绝**：
/// `std::fs::rename` 在 POSIX 上会静默覆盖，真文件夹里「拖过去把同名文件弄没了」
/// 是不可接受的，所以重名在这一层挡下，由前端转成提示。
#[tauri::command]
pub async fn fs_rename(
    from: String,
    to: String,
    state: State<'_, WorkspaceState>,
) -> Result<(), String> {
    let root = state.get().ok_or_else(no_root)?;
    let source = resolve(&root, &from)?;
    let target = resolve(&root, &to)?;
    if source == root || target == root {
        return Err("outside-root".to_string());
    }
    if source == target {
        return Ok(());
    }
    if target.exists() {
        return Err("already-exists".to_string());
    }
    std::fs::rename(&source, &target).map_err(io_error)?;
    // 改名会在源与目标两处各报一次事件（有些平台只报父目录，那道滤网交给 ignore 规则）
    state.mark_self_write(&source);
    state.mark_self_write(&target);
    Ok(())
}

// ------------------------------------------------------------------ 文件监听

/// 记一笔自身写入（在抑制窗内的事件会被回调丢掉，避免「自己写 → 自己收 → 自己刷新」）。
/// 顺手清掉过期的记账，免得这份表随运行时长无限长大。
fn mark_self_write(map: &Arc<Mutex<HashMap<PathBuf, Instant>>>, path: &Path) {
    let mut map = lock(map);
    let now = Instant::now();
    map.retain(|_, at| now.duration_since(*at) < SELF_WRITE_WINDOW);
    map.insert(path.to_path_buf(), now);
}

/// 这个路径是不是刚被本进程写过（在抑制窗内）。查询时也清一次过期项。
fn is_self_write(map: &Arc<Mutex<HashMap<PathBuf, Instant>>>, path: &Path) -> bool {
    let mut map = lock(map);
    let now = Instant::now();
    map.retain(|_, at| now.duration_since(*at) < SELF_WRITE_WINDOW);
    map.contains_key(path)
}

/// 相对根看，这个路径是否命中过滤规则：**任一级**是点开头、或在 deny 名单里，整条都算被忽略。
/// 根外路径、以及根本身一律按「忽略」处理（根本身的变化没有意义）。
fn path_ignored(path: &Path, root: &Path, rules: &IgnoreRules) -> bool {
    let Ok(rel) = path.strip_prefix(root) else {
        return true;
    };
    if rel.as_os_str().is_empty() {
        return false;
    }
    rel.components().any(|component| match component {
        Component::Normal(name) => {
            let name = name.to_string_lossy();
            (rules.dot_files && name.starts_with('.'))
                || rules.dir_names.iter().any(|denied| denied == name.as_ref())
        }
        _ => false,
    })
}

/// 起递归文件监听：事件先过两道滤网（ignore 规则、自身写入抑制），再进去抖线程，
/// 静默 [`CHANGE_DEBOUNCE`] 之后把攒下的路径合成一次 `workspace://changed`。
///
/// 只推「有变化」这个信号、不带内容：前端收到就全量重扫，再与自己的索引比对指纹，
/// 无差异直接吞掉（见 `LocalFolderVFSProvider.refresh`）。所以这里多推几次无害。
fn start_watch(
    app: tauri::AppHandle,
    root: &Path,
    self_writes: Arc<Mutex<HashMap<PathBuf, Instant>>>,
    ignore: Arc<Mutex<IgnoreRules>>,
) -> Result<RecommendedWatcher, String> {
    let (tx, rx) = channel::<PathBuf>();

    let worker_root = root.to_path_buf();
    // 去抖线程：收到的路径攒着，静默 CHANGE_DEBOUNCE 之后一次发出去。watcher 被丢掉时
    // 发送端一并释放，recv 回到 Disconnected，线程自然结束 —— 不必另设停止旗标。
    std::thread::spawn(move || {
        let mut pending: Vec<PathBuf> = Vec::new();
        loop {
            match rx.recv_timeout(CHANGE_DEBOUNCE) {
                Ok(path) => {
                    if !pending.contains(&path) {
                        pending.push(path);
                    }
                }
                Err(RecvTimeoutError::Timeout) => {
                    if pending.is_empty() {
                        continue;
                    }
                    let rels: Vec<String> = std::mem::take(&mut pending)
                        .iter()
                        .filter_map(|path| path.strip_prefix(&worker_root).ok())
                        .map(|rel| rel.to_string_lossy().replace('\\', "/"))
                        .collect();
                    if !rels.is_empty() {
                        let _ = app.emit("workspace://changed", ChangedEvent { paths: rels });
                    }
                }
                Err(RecvTimeoutError::Disconnected) => break,
            }
        }
    });

    let filter_root = root.to_path_buf();
    let mut watcher = notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
        let Ok(event) = event else {
            return;
        };
        let rules = lock(&ignore).clone();
        for path in event.paths {
            if !path.starts_with(&filter_root) {
                continue;
            }
            if path_ignored(&path, &filter_root, &rules) {
                continue;
            }
            if is_self_write(&self_writes, &path) {
                continue;
            }
            let _ = tx.send(path);
        }
    })
    .map_err(|err| format!("io:{err}"))?;

    watcher
        .watch(root, RecursiveMode::Recursive)
        .map_err(|err| format!("io:{err}"))?;
    Ok(watcher)
}

/// 授权一个根：起监听 + 写进 state。
///
/// 监听起不来（macOS 的 kqueue 句柄耗尽、目录恰好被删等）**不阻断授权** —— 退化成
/// 「外部改动了界面不自动跟进」，磁盘上的数据一点没变，不是数据风险；用户重新打开
/// 工作区时会再试一次。
fn activate(app: &tauri::AppHandle, state: &WorkspaceState, root: PathBuf) {
    match start_watch(
        app.clone(),
        &root,
        state.self_writes.clone(),
        state.ignore.clone(),
    ) {
        Ok(watcher) => *lock(&state.watcher) = Some(watcher),
        Err(err) => {
            log::warn!("文件监听未能启动，外部改动需要手动刷新：{err}");
            *lock(&state.watcher) = None;
        }
    }
    state.set(root);
}

// ------------------------------------------------------------------ 路径安全

/// 把相对路径拼到根下，并确保结果指不到根之外。
///
/// 三道关：
/// 1. 词法上只许普通分量 —— 绝对路径、`..`、盘符前缀（Windows 的 `C:`）一律拒；
/// 2. 已存在的目标 `canonicalize()` 后必须落在根内 —— 这一步认的是**真实路径**，
///    symlink 指到根外会在这里现形；
/// 3. 不存在的目标（新建用）校验其**父目录**的 canonical 在根内。
fn resolve(root: &Path, rel: &str) -> Result<PathBuf, String> {
    if rel.contains('\0') {
        return Err("outside-root".to_string());
    }
    let candidate = Path::new(rel);
    if candidate.is_absolute() {
        return Err("outside-root".to_string());
    }
    for component in candidate.components() {
        if !matches!(component, Component::Normal(_)) {
            return Err("outside-root".to_string());
        }
    }

    let joined = root.join(candidate);
    if joined.exists() {
        let real = joined.canonicalize().map_err(io_error)?;
        if !real.starts_with(root) {
            return Err("outside-root".to_string());
        }
        return Ok(real);
    }

    let parent = joined.parent().ok_or_else(|| "outside-root".to_string())?;
    let name = joined.file_name().ok_or_else(|| "outside-root".to_string())?;
    let real_parent = parent.canonicalize().map_err(io_error)?;
    if !real_parent.starts_with(root) {
        return Err("outside-root".to_string());
    }
    Ok(real_parent.join(name))
}

/// 校验并规范化一个目录：必须存在、必须是目录，返回 canonical 绝对路径。
/// 之后所有相对路径都相对这个 canonical 根解析（`resolve` 的 `starts_with` 依赖它）。
fn canonical_dir(path: &Path) -> Result<PathBuf, String> {
    let real = path.canonicalize().map_err(io_error)?;
    if !real.is_dir() {
        return Err("not-found".to_string());
    }
    Ok(real)
}

// ------------------------------------------------------------------ 扫描与判定

/// 递归收目录树。命中 ignore 规则的条目整棵跳过；结果按名字排序（前端可再排一次，
/// 这里排是为了「同一次扫描结果稳定」，便于前端做指纹比对）。
fn scan(
    root: &Path,
    dir: &Path,
    ignore: &IgnoreRules,
    out: &mut Vec<WorkspaceEntry>,
) -> Result<(), String> {
    let entries = std::fs::read_dir(dir).map_err(io_error)?;

    let mut children: Vec<_> = entries.filter_map(Result::ok).collect();
    children.sort_by_key(|entry| entry.file_name());

    for entry in children {
        let name = entry.file_name().to_string_lossy().into_owned();
        if is_ignored(&name, ignore) {
            continue;
        }

        // 读不到条目的元数据（权限、目录刚被删）就跳过它，不让一个坏条目废掉整次扫描
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        let Ok(meta) = entry.metadata() else {
            continue;
        };
        let Ok(rel_path) = entry.path().strip_prefix(root).map(Path::to_path_buf) else {
            continue;
        };
        let rel = rel_path.to_string_lossy().replace('\\', "/");

        // 目录：递归下去，目录本身也进结果（否则空目录在树里会消失）
        if file_type.is_dir() {
            out.push(WorkspaceEntry {
                rel,
                name,
                kind: "directory",
                size: 0,
                mtime_ms: mtime_of(&meta),
                binary: false,
                too_large: false,
            });
            scan(root, &entry.path(), ignore, out)?;
        } else if file_type.is_file() {
            let size = meta.len();
            let too_large = size > MAX_TEXT_BYTES;
            out.push(WorkspaceEntry {
                rel,
                name,
                kind: "file",
                size,
                mtime_ms: mtime_of(&meta),
                // 超大文件不去探测（不值得为它读盘），一律按「不能打开」处理
                binary: !too_large && probe_binary(&entry.path()),
                too_large,
            });
        }
        // symlink 与其它类型一律不进树：`DirEntry::file_type` 不跟链接，
        // 所以指向根外的软链在这里就被挡掉了，不必等到读写时才发现
    }

    Ok(())
}

fn is_ignored(name: &str, ignore: &IgnoreRules) -> bool {
    if ignore.dot_files && name.starts_with('.') {
        return true;
    }
    ignore.dir_names.iter().any(|denied| denied == name)
}

/// 读文件头判二进制
fn probe_binary(path: &Path) -> bool {
    use std::io::Read;

    let Ok(mut file) = std::fs::File::open(path) else {
        return false;
    };
    let mut probe = vec![0u8; PROBE_BYTES];
    let Ok(read) = file.read(&mut probe) else {
        return false;
    };
    probe.truncate(read);
    looks_binary(&probe)
}

/// 含 NUL 字节，或不是合法的 UTF-8。
///
/// 读的是文件头，末尾很可能切断一个多字节字符（例如 8KB 正好切在「世」字中间）——
/// 那种情况 `from_utf8` 也会报错，但 `error_len()` 为 `None`，据此放行，别误判成二进制。
fn looks_binary(bytes: &[u8]) -> bool {
    if bytes.contains(&0) {
        return true;
    }
    match std::str::from_utf8(bytes) {
        Ok(_) => false,
        Err(err) => err.error_len().is_some(),
    }
}

fn mtime_of(meta: &std::fs::Metadata) -> Option<u64> {
    meta.modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|elapsed| elapsed.as_millis() as u64)
}

/// 写入目标的落盘事实（mtime + 大小），供前端更新节点指纹。
fn report_write(path: &Path) -> Result<WriteReport, String> {
    let meta = std::fs::metadata(path).map_err(io_error)?;
    Ok(WriteReport {
        mtime_ms: mtime_of(&meta),
        size: meta.len(),
    })
}

/// 临时文件名的唯一后缀：进程号 + 纳秒时间戳。
/// 并发写同一目录时不会互相踩，也不必引入随机数依赖。
fn unique_suffix() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_nanos())
        .unwrap_or(0);
    format!("{}-{nanos}", std::process::id())
}

fn info_of(root: &Path) -> WorkspaceInfo {
    WorkspaceInfo {
        root: root.to_string_lossy().into_owned(),
        name: root
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_else(|| root.to_string_lossy().into_owned()),
    }
}

// ------------------------------------------------------------------ 错误码

fn no_root() -> String {
    "no-root".to_string()
}

fn io_error(err: std::io::Error) -> String {
    format!("io:{err}")
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 建一个临时根。**必须 canonicalize 之后再交出去** —— 生产上 `state` 里存的
    /// 就是 canonical 路径，测试若不归一化，macOS 上 `/var` 与 `/private/var` 的差异
    /// 会让 `resolve` 的 `starts_with` 假性失败
    fn temp_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("cp-workspace-{label}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("建临时目录");
        dir.canonicalize().expect("归一化临时目录")
    }

    fn rules() -> IgnoreRules {
        IgnoreRules {
            dot_files: true,
            dir_names: vec!["node_modules".to_string()],
        }
    }

    /// 词法拒绝：绝对路径与含 `..` 的路径一律不许出根
    #[test]
    fn rejects_paths_that_escape_the_root() {
        let root = temp_dir("escape");
        assert_eq!(resolve(&root, "/etc/passwd").unwrap_err(), "outside-root");
        assert_eq!(resolve(&root, "../secret").unwrap_err(), "outside-root");
        assert_eq!(resolve(&root, "a/../../b").unwrap_err(), "outside-root");

        // 根内的正常路径照旧放行，且落在根下（父目录得存在，否则拿不到 canonical 父路径）
        std::fs::create_dir_all(root.join("src")).expect("建 src");
        let ok = resolve(&root, "src/main.cpp").expect("根内路径该放行");
        assert!(ok.starts_with(&root), "解析结果该在根内：{ok:?}");
        assert!(ok.ends_with("src/main.cpp"));
    }

    /// 已存在的软链指到根外：`canonicalize` 那一关要拦下来
    #[cfg(unix)]
    #[test]
    fn rejects_symlink_pointing_outside_the_root() {
        let root = temp_dir("symlink");
        let outside = temp_dir("outside");
        std::fs::write(outside.join("secret.txt"), "x").expect("写目标文件");
        std::os::unix::fs::symlink(outside.join("secret.txt"), root.join("link.txt"))
            .expect("建软链");

        assert_eq!(resolve(&root, "link.txt").unwrap_err(), "outside-root");

        let _ = std::fs::remove_dir_all(&root);
        let _ = std::fs::remove_dir_all(&outside);
    }

    /// 写入用的临时文件（点开头）必须被扫描规则挡在树外 ——
    /// 否则原子替换的那一瞬间，用户会看到树里闪出一个鬼影文件
    #[test]
    fn hides_write_temp_files_from_scan() {
        let root = temp_dir("temp");
        std::fs::write(root.join(".main.cpp.cp-tmp-123-456"), "x").expect("写临时文件");
        std::fs::write(root.join("main.cpp"), "int main(){}").expect("写正文");

        let mut nodes = Vec::new();
        scan(&root, &root, &rules(), &mut nodes).expect("扫描该成功");
        let rels: Vec<&str> = nodes.iter().map(|node| node.rel.as_str()).collect();
        assert_eq!(rels, vec!["main.cpp"], "临时文件不该进树：{rels:?}");

        let _ = std::fs::remove_dir_all(&root);
    }

    /// 二进制判定：NUL 与非法 UTF-8 算二进制；结尾被切断的多字节字符要放行
    #[test]
    fn classifies_text_and_binary() {
        assert!(!looks_binary("hello 世界\n".as_bytes()));
        assert!(!looks_binary(&[]), "空文件不是二进制");
        assert!(looks_binary(&[0x00, 0x01, 0x02]), "含 NUL 就是二进制");
        assert!(looks_binary(&[0xff, 0xfe, 0xfd]), "非法 UTF-8 就是二进制");
        // "世" 是 E4 B8 96：只给前两字节，属于「读到一半被切断」，不算二进制
        assert!(!looks_binary(&[0xe4, 0xb8]));
    }

    /// 过滤规则：点开头与 deny 名单都要整棵跳过，普通条目照收
    #[test]
    fn skips_hidden_and_denied_entries() {
        let root = temp_dir("scan");
        std::fs::create_dir_all(root.join("src")).expect("建 src");
        std::fs::create_dir_all(root.join(".git")).expect("建 .git");
        std::fs::create_dir_all(root.join("node_modules")).expect("建 node_modules");
        std::fs::write(root.join("src/main.cpp"), "int main(){}").expect("写 main.cpp");
        std::fs::write(root.join(".env"), "SECRET=1").expect("写 .env");

        let mut nodes = Vec::new();
        scan(&root, &root, &rules(), &mut nodes).expect("扫描该成功");

        let rels: Vec<&str> = nodes.iter().map(|node| node.rel.as_str()).collect();
        assert!(rels.contains(&"src/main.cpp"), "普通文件要在：{rels:?}");
        assert!(rels.contains(&"src"), "目录要进结果：{rels:?}");
        assert!(
            !rels.iter().any(|rel| rel.starts_with('.')),
            "隐藏项要被跳过：{rels:?}"
        );
        assert!(
            !rels.iter().any(|rel| rel.starts_with("node_modules")),
            "deny 目录要被跳过：{rels:?}"
        );

        let main = nodes
            .iter()
            .find(|node| node.rel == "src/main.cpp")
            .expect("找到 main.cpp");
        assert_eq!(main.kind, "file");
        assert_eq!(main.name, "main.cpp");
        assert!(!main.binary);
        assert!(!main.too_large);
        assert!(main.mtime_ms.is_some(), "真实文件该有 mtime");

        let _ = std::fs::remove_dir_all(&root);
    }

    /// 监听滤网与扫描共用一套规则：任一级命中点开头 / deny 名单的被忽略，其余放行
    #[test]
    fn filters_watched_paths_by_ignore_rules() {
        let root = Path::new("/tmp/cp-watch-root");
        let rules = rules();

        assert!(path_ignored(&root.join(".git/config"), root, &rules));
        assert!(path_ignored(&root.join("node_modules/pkg/index.js"), root, &rules));
        // 原子写用的临时文件也是点开头，靠这条挡在事件流外
        assert!(path_ignored(&root.join(".main.cpp.cp-tmp-1-2"), root, &rules));
        assert!(!path_ignored(&root.join("src/main.cpp"), root, &rules));
        assert!(
            !path_ignored(root, root, &rules),
            "根本身的变化没有意义，但不该被当作「被忽略的路径」丢弃判断"
        );
        assert!(
            path_ignored(Path::new("/tmp/elsewhere/x"), root, &rules),
            "根外路径一律忽略"
        );
    }

    /// 自身写入抑制：记过账的路径在窗口内被认出来，没记过的照旧放行
    #[test]
    fn suppresses_self_writes_within_the_window() {
        let map = Arc::new(Mutex::new(HashMap::new()));
        let written = PathBuf::from("/tmp/cp-watch-root/main.cpp");

        assert!(!is_self_write(&map, &written), "没记过账的不该被抑制");
        mark_self_write(&map, &written);
        assert!(is_self_write(&map, &written));
        assert!(
            !is_self_write(&map, &PathBuf::from("/tmp/cp-watch-root/other.cpp")),
            "只抑制记过账的那条路径"
        );
    }
}
