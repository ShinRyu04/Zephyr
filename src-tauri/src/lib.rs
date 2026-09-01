// lib.rs — entry point Zephyr: register plugin, state, dan semua command.
// Kontrak nama command: ARCHITECTURE.md §2.

mod app_state;
mod dialogs;
mod errors;
mod fs_utils;
mod settings;
mod tests_fs;

use app_state::AppState;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::WindowEvent;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Status minimized dipegang di sini (bukan dibaca dari thread lain):
    // memanggil API window dari thread non-main mematikan proses di Windows.
    let minimized = Arc::new(AtomicBool::new(false));
    let minimized_setup = minimized.clone();

    let result = tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::new())
        .setup(move |app| {
            // Sampler RAM untuk StatusBar (fase 02 V6).
            settings::spawn_ram_sampler(app.handle().clone(), minimized_setup);
            Ok(())
        })
        .on_window_event(move |window, event| {
            // Update flag minimized dari main thread.
            if let WindowEvent::Resized(_) = event {
                if window.label() == "main" {
                    let m = window.is_minimized().unwrap_or(false);
                    minimized.store(m, Ordering::Relaxed);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            // app / settings
            settings::get_app_info,
            settings::get_settings,
            settings::set_settings,
            settings::set_window_size,
            settings::list_recents,
            settings::workspace_open,
            settings::workspace_close,
            // fs / editor
            fs_utils::fs_read,
            fs_utils::fs_write,
            fs_utils::fs_exists,
            fs_utils::fs_stat,
            fs_utils::fs_create_file,
            fs_utils::fs_create_dir,
            fs_utils::fs_delete,
            fs_utils::fs_rename,
            fs_utils::session_load,
            fs_utils::session_save,
            // dialog
            dialogs::file_dialog_open,
            dialogs::file_dialog_save,
            dialogs::folder_dialog_open,
        ])
        .run(tauri::generate_context!());

    if let Err(e) = result {
        eprintln!("[zephyr] gagal start: {e:?}");
    }
}
