mod android_toolchain;
// 原生端要碰系统的部分（起编译器、起子进程）都在这里，前端只通过 invoke 递字符串过来。
// 因此 capabilities 里不需要给前端开 shell / fs 权限，权限面收在最小处。
mod native;
mod toolchain;
// 「打开本机文件夹」的磁盘原语（选根、列目录、读文件）。只在桌面端编译：
// Android 上这套原语不成立，且它的依赖也只在非 Android 目标上声明（见 Cargo.toml）。
#[cfg(desktop)]
mod workspace;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let builder = tauri::Builder::default();

  // 桌面端多挂三件东西：原生目录选择器（本机文件夹工作区用它选根）、
  // 「当前授权的根」这份进程状态、以及 workspace 的那几条命令。
  // **都不给前端加任何 capability** —— 选择器只从 Rust 侧调用，前端连 dialog 的
  // JS API 都看不到（与「前端不给 fs / shell 权限」同一条纪律）。
  // 导出那一组（export_*）另挂一份 ExportState：落点是「用户刚选的那个目录」，
  // 与工作区根分开管，写完由前端 export_close 收回（见 workspace.rs 的 ExportState）。
  #[cfg(desktop)]
  let builder = builder
    .plugin(tauri_plugin_dialog::init())
    .manage(workspace::WorkspaceState::default())
    .manage(workspace::ExportState::default())
    .invoke_handler(tauri::generate_handler![
      native::run_cpp,
      native::run_python,
      android_toolchain::prepare_toolchain,
      workspace::workspace_choose,
      workspace::workspace_open,
      workspace::workspace_close,
      workspace::fs_scan,
      workspace::fs_read,
      workspace::fs_write,
      workspace::fs_mkdir,
      workspace::fs_delete,
      workspace::fs_rename,
      workspace::export_choose,
      workspace::export_write,
      workspace::export_mkdir,
      workspace::export_close
    ]);

  #[cfg(not(desktop))]
  let builder = builder.invoke_handler(tauri::generate_handler![
    native::run_cpp,
    native::run_python,
    android_toolchain::prepare_toolchain
  ]);

  builder
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
