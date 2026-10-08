// 原生端要碰系统的部分（起编译器、起子进程）都在这里，前端只通过 invoke 递字符串过来。
// 因此 capabilities 里不需要给前端开 shell / fs 权限，权限面收在最小处。
mod native;
mod toolchain;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
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
    .invoke_handler(tauri::generate_handler![native::run_cpp, native::run_python])
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
