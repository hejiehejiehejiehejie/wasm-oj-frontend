//! 随包 C++ 工具链在 **Android** 上的落地 —— 把 APK `assets/` 里那份 tar.gz 解到应用私有目录。
//!
//! 为什么必须走 assets：Android 上 `resource_dir()` 解析出来是 `asset://localhost/`，
//! **不是文件系统路径**，所以 `bundle.resources` 在 Android 上拿不到可读文件 ——
//! 工具链只能进 APK 的 `assets/`，再由 NDK 的 `AAssetManager` 读出来。
//!
//! 为什么解到私有目录：assets 是只读的，跑不了里面的二进制；而私有目录 `filesDir`
//! 在 **targetSdk 28** 下允许 `execve`。这一条是探针在真机上量出来的，也是整个方案的
//! 承重点（见 HANDOFF §14 的 Android 部分）。
//!
//! 落点：`<filesDir>/compiler/usr/{bin,include,lib,lib/clang}`，外加 `<filesDir>/compiler/.version`。
//! 版本标记存的是随包版本文件的原文（即 tgz 的 sha256）；下次启动据此判断要不要重解 ——
//! 219 MB 不该每次启动都解一遍。另有一个兄弟目录 `<filesDir>/tmp` 存编译器的临时文件
//! （见 `tmp_dir()`），它不是工具链的一部分，所以不放在 `compiler/` 里面。
//!
//! 中间那层 `usr/` 是契约，不是随手加的：这棵树是从 Termux 的 `$PREFIX`
//! （`/data/data/com.termux/files/usr`）原样搬来的，clang 找头与库时按 `<sysroot>/usr/include/...`、
//! `<sysroot>/usr/lib` 推 —— 也就是说 `--sysroot` 要的是 `$PREFIX` 的**上一层**，即
//! `<filesDir>/compiler` 本身（A7 真机上拿 `clang++ -v -E` 的搜索列表对出来的）。
//! 这一层也是 4b 真机跑通时那份树的落点 —— 产物 `hello.bin` 里的 `RUNPATH` 是
//! `<filesDir>/compiler/usr/lib`，正是 clang 由 `<sysroot>/usr/lib` 自动补上的那一项，
//! 反过来说明当时的 `<sysroot>` 就是 `<root>`（见 `toolchain.rs` 的 Android 分支）。
//!
//! 与 `native.rs` 同一个口径：本文件**不产出任何面向用户的话术**，错的原文回给前端，
//! 人话由前端的 i18n 数据表翻译。

/// 解压落点根目录（相对 `filesDir`）的目录名。**这是契约**：`toolchain.rs` 的 Android 分支按它拼路径
#[cfg(target_os = "android")]
pub const ROOT_DIR: &str = "compiler";

/// 树本体落在 `ROOT_DIR` 下的这一层，摆成 Termux `$PREFIX` 的样子。
/// **这是契约**：`toolchain.rs` 的 Android 分支按它定位 `<root>/usr/bin/clang++` 与 `<root>/usr/lib`
#[cfg(target_os = "android")]
pub const PREFIX_DIR: &str = "usr";

/// 编译器的临时目录（相对 `filesDir`）的目录名。
/// **这是契约**：`toolchain.rs` 的 Android 分支把它设进子进程的 `TMPDIR`
#[cfg(target_os = "android")]
pub const TMP_DIR: &str = "tmp";

/// 版本标记文件名。放在 `ROOT_DIR` 里面、`PREFIX_DIR` 外面 —— 重解时随目录一起清掉，
/// 而它又不属于那棵「照抄 Termux」的树
#[cfg(target_os = "android")]
const MARKER: &str = ".version";

/// 随包的两个 assets，由 `scripts/prepare-android-toolchain.mjs` 生成
#[cfg(target_os = "android")]
const ARCHIVE_ASSET: &str = "android-toolchain.tgz";
#[cfg(target_os = "android")]
const VERSION_ASSET: &str = "android-toolchain.version";

/// 准备结果，字段直接序列化成 camelCase 给前端用
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareReport {
    /// 复用了已经落盘的那份，没有重新解压
    pub reused: bool,
    /// 工具链根目录（绝对路径）
    pub root: String,
    /// 随包版本（tgz 的 sha256）
    pub version: String,
}

/// 前端调用方式：`invoke('prepare_toolchain')`
///
/// 函数体是同步的，但标了 `async` —— Tauri 会把「同步函数 + async」丢到线程池上跑
/// （见 tauri-macros 的 `ExecutionContext::Async` → `sync_threadpool`）。
/// 解压 219 MB 要好几秒，跑在主线程上会 ANR。
#[tauri::command(async)]
pub fn prepare_toolchain() -> Result<PrepareReport, String> {
    platform::prepare()
}

/// 工具链落点根目录（`<filesDir>/compiler`）的绝对路径。
///
/// 给 `toolchain.rs` 的 Android 分支认编译器用 —— 那是「落点在哪」的第二个读者，
/// 所以走这里问，而不是各自拼一遍目录名。**没准备过也照给路径**：存不存在由调用方判，
/// 这里只负责回答「该在哪儿」。
#[cfg(target_os = "android")]
pub fn root_dir() -> Result<std::path::PathBuf, String> {
    platform::root_dir()
}

/// 应用私有目录（`<filesDir>`）。
///
/// 之所以从本文件出去，是因为 JNI 那套（取 JavaVM、附线程、调 `getFilesDir`、缓存结果）
/// 已经长在这里了，再抄一份不值当。`native.rs` 拿它来放一次性工作区 ——
/// 真机探针量过，targetSdk 28 时全应用只有私有目录允许 `execve` 自备二进制，
/// 工作区里编译出来的产物要能跑起来，就只能落在它下面。
#[cfg(target_os = "android")]
pub fn files_dir() -> Result<std::path::PathBuf, String> {
    platform::files_dir()
}

/// 编译器要用的临时目录（`<filesDir>/tmp`）。
///
/// 真机上应用进程的环境变量里没有 `TMPDIR`，而设备的 `/tmp` 属于 `shell`、应用写不进去，
/// clang 一开工就报 `unable to make temporary file: No such file or directory`。
/// 目录本身由 `prepare()` 建出来 —— 与工具链是兄弟目录，重解工具链时不会被顺手清掉。
/// 这里只回答「该在哪儿」，存不存在由调用方判。
#[cfg(target_os = "android")]
pub fn tmp_dir() -> Result<std::path::PathBuf, String> {
    platform::tmp_dir()
}

#[cfg(target_os = "android")]
mod platform {
    use std::ffi::CString;
    use std::io::Read;
    use std::path::{Path, PathBuf};
    use std::ptr::NonNull;
    use std::sync::OnceLock;

    use jni::objects::{JObject, JString};
    use jni::JNIEnv;

    use super::{PrepareReport, ARCHIVE_ASSET, MARKER, PREFIX_DIR, ROOT_DIR, TMP_DIR, VERSION_ASSET};

    /// `<filesDir>` 进程内只解析一次：每问一次都要附到 JVM 上，没必要反复问
    static FILES_DIR: OnceLock<PathBuf> = OnceLock::new();

    /// 落点根目录。存不存在不在这里判 —— 调用方各有各的判法（`prepare` 看版本标记，
    /// `toolchain.rs` 看 `bin/clang++` 在不在）
    pub fn root_dir() -> Result<PathBuf, String> {
        files_dir().map(|files| files.join(ROOT_DIR))
    }

    /// 编译器要用的临时目录：`<filesDir>/tmp`
    pub fn tmp_dir() -> Result<PathBuf, String> {
        files_dir().map(|files| files.join(TMP_DIR))
    }

    pub fn prepare() -> Result<PrepareReport, String> {
        let root = root_dir().map_err(|err| format!("拿不到工具链落点：{err}"))?;
        let version = with_asset_manager(|manager| read_text(manager, VERSION_ASSET))?;

        // 编译器要一个能写的临时目录。建在 `is_current` 之前是有意的：复用那一路也得保证它
        // 在（装完第一次之后就总是走复用，不在这儿建等于没建）。与工具链是兄弟目录，
        // 所以重解工具链时不会被上面那句 `remove_dir_all` 顺手清掉。
        let scratch = tmp_dir().map_err(|err| format!("拿不到临时目录落点：{err}"))?;
        std::fs::create_dir_all(&scratch).map_err(|err| format!("建临时目录失败：{err}"))?;

        if is_current(&root, &version) {
            return Ok(PrepareReport {
                reused: true,
                root: path_text(&root),
                version,
            });
        }

        // 重解之前先把旧的清干净：换工具链时，旧版本里有、新版本里没有的文件不该留下来
        if root.exists() {
            std::fs::remove_dir_all(&root).map_err(|err| format!("清理旧工具链失败：{err}"))?;
        }
        std::fs::create_dir_all(&root).map_err(|err| format!("建工具链目录失败：{err}"))?;

        // 解到 `usr/` 那一层：树本身摆成 Termux `$PREFIX` 的样子，好让 `--sysroot`
        // 指到 `<root>/usr` 就成立（见文件头）
        with_asset_manager(|manager| extract(manager, &root.join(PREFIX_DIR)))?;

        // 标记最后写：中途被打断的话标记不在，下次启动会重解，不会拿半棵树去用
        std::fs::write(root.join(MARKER), &version)
            .map_err(|err| format!("写版本标记失败：{err}"))?;

        Ok(PrepareReport {
            reused: false,
            root: path_text(&root),
            version,
        })
    }

    fn path_text(path: &Path) -> String {
        path.to_string_lossy().into_owned()
    }

    /// 落盘的那份是不是就是随包这份：标记内容对得上，且编译器确实在
    fn is_current(root: &Path, version: &str) -> bool {
        let marked = std::fs::read_to_string(root.join(MARKER))
            .map(|text| text.trim() == version)
            .unwrap_or(false);
        marked && root.join(PREFIX_DIR).join("bin").join("clang++").exists()
    }

    fn read_text(manager: &ndk::asset::AssetManager, name: &str) -> Result<String, String> {
        let mut asset = open(manager, name)?;
        let mut text = String::new();
        asset
            .read_to_string(&mut text)
            .map_err(|err| format!("读 assets/{name} 失败：{err}"))?;
        Ok(text.trim().to_string())
    }

    fn extract(manager: &ndk::asset::AssetManager, dest: &Path) -> Result<(), String> {
        let asset = open(manager, ARCHIVE_ASSET)?;
        let decoder = flate2::read::GzDecoder::new(asset);
        let mut archive = tar::Archive::new(decoder);
        // 必须开：tar 头里的 mode 就是打包时特意带进来的可执行位，默认不还原的话
        // bin/clang-21 会落成 0644，设备上直接 `can't execute`
        archive.set_preserve_permissions(true);
        // unpack 会逐条校验「不许逃出 dest」，也认 typeflag 里的软链
        archive
            .unpack(dest)
            .map_err(|err| format!("解压 {ARCHIVE_ASSET} 失败：{err}"))
    }

    fn open(manager: &ndk::asset::AssetManager, name: &str) -> Result<ndk::asset::Asset, String> {
        let cname = CString::new(name).map_err(|err| format!("asset 名里混进了 NUL 字节：{err}"))?;
        manager.open(&cname).ok_or_else(|| {
            format!("APK 的 assets 里没有 {name}（是不是没跑 npm run android:toolchain？）")
        })
    }

    /// `<filesDir>`，例如 `/data/user/0/<包名>/files`。第一次要过 JNI，之后走缓存
    pub fn files_dir() -> Result<PathBuf, String> {
        if let Some(dir) = FILES_DIR.get() {
            return Ok(dir.clone());
        }
        let dir = with_java(read_files_dir)?;
        Ok(FILES_DIR.get_or_init(|| dir).clone())
    }

    /// 一趟 Java 环境：取 JavaVM → 附到当前线程 → 取 ApplicationContext，把 env/context 交出去。
    ///
    /// 写成「回调」而不是让调用方自己端这套，是因为 JNIEnv 的宿主（`AttachGuard`）与
    /// `JObject` 的生命周期绑在一起，直接返回会变成自引用结构。
    fn with_java<T>(
        run: impl for<'a> FnOnce(&mut JNIEnv<'a>, &JObject<'a>) -> Result<T, String>,
    ) -> Result<T, String> {
        let ctx = ndk_context::android_context();
        // SAFETY: 这两个指针是 tao 在 Android 启动时经 ndk_context::initialize_android_context
        // 存进来的（vm 是 JavaVM*，context 是 ApplicationContext 的 global ref），进程内一直有效
        let vm = unsafe { jni::JavaVM::from_raw(ctx.vm().cast()) }
            .map_err(|err| format!("拿不到 JavaVM：{err}"))?;
        let mut guard = vm
            .attach_current_thread()
            .map_err(|err| format!("附加到 JVM 失败：{err}"))?;
        // SAFETY: 同上。这里只借用这个 global ref，不接管所有权
        let context = unsafe { JObject::from_raw(ctx.context().cast()) };
        run(&mut guard, &context)
    }

    /// 开一趟 Java 环境，拿 AssetManager 跑一段
    fn with_asset_manager<T>(
        run: impl FnOnce(&ndk::asset::AssetManager) -> Result<T, String>,
    ) -> Result<T, String> {
        with_java(|env, context| {
            let manager = open_asset_manager(env, context)?;
            run(&manager)
        })
    }

    fn read_files_dir<'a>(env: &mut JNIEnv<'a>, context: &JObject<'a>) -> Result<PathBuf, String> {
        let file = env
            .call_method(context, "getFilesDir", "()Ljava/io/File;", &[])
            .map_err(|err| format!("调用 getFilesDir 失败：{err}"))?
            .l()
            .map_err(|err| format!("getFilesDir 的返回值不是对象：{err}"))?;
        let text = env
            .call_method(&file, "getAbsolutePath", "()Ljava/lang/String;", &[])
            .map_err(|err| format!("调用 getAbsolutePath 失败：{err}"))?
            .l()
            .map_err(|err| format!("getAbsolutePath 的返回值不是对象：{err}"))?;
        let text: String = env
            .get_string(&JString::from(text))
            .map_err(|err| format!("读 filesDir 路径失败：{err}"))?
            .into();
        Ok(PathBuf::from(text))
    }

    fn open_asset_manager<'a>(
        env: &mut JNIEnv<'a>,
        context: &JObject<'a>,
    ) -> Result<ndk::asset::AssetManager, String> {
        let assets = env
            .call_method(
                context,
                "getAssets",
                "()Landroid/content/res/AssetManager;",
                &[],
            )
            .map_err(|err| format!("调用 getAssets 失败：{err}"))?
            .l()
            .map_err(|err| format!("getAssets 的返回值不是对象：{err}"))?;
        // SAFETY: env 是活的，assets 确实是个 android.content.res.AssetManager。
        // NDK 侧会把它 NewGlobalRef 收好，所以这个 local ref 用完即弃也不影响后续使用
        let raw =
            unsafe { ndk_sys::AAssetManager_fromJava(env.get_native_interface(), assets.as_raw()) };
        NonNull::new(raw)
            .map(|ptr| unsafe { ndk::asset::AssetManager::from_ptr(ptr) })
            .ok_or_else(|| "AAssetManager_fromJava 返回了空指针".to_string())
    }
}

#[cfg(not(target_os = "android"))]
mod platform {
    use super::PrepareReport;

    pub fn prepare() -> Result<PrepareReport, String> {
        Err("随包 C++ 工具链是 Android 专有的；桌面端用系统里的编译器，不需要准备".to_string())
    }
}
