// Dialogue Tauri shell - Phase 0 skeleton spike.
// Goal: Tauri 2.x opens a window pointing at the running Next.js dev server.
// No custom Rust commands yet; behaviour comes from `tauri.conf.json` (`devUrl`).
// Custom commands (PocketBase lifecycle, sidecar Node, etc.) will be added in later phases.

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
