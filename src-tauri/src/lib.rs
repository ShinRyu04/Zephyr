// lib.rs — entry point Zephyr: register plugin, state, dan semua command.
// Kontrak nama command: ARCHITECTURE.md §2.

mod adapters;
mod agents;
mod ai;
mod app_state;
mod dialogs;
mod errors;
mod explorer;
mod fs_utils;
mod pty;
mod secrets;
mod settings;
mod tests_ai;
mod tests_fs;

use app_state::AppState;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{Manager, RunEvent, WindowEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Status minimized dipegang di sini (bukan dibaca dari thread lain):
    // memanggil API window dari thread non-main mematikan proses di Windows.
    let minimized = Arc::new(AtomicBool::new(false));
    let minimized_setup = minimized.clone();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        // Clipboard lewat Rust: navigator.clipboard di WebView2 menolak
        // saat dokumen tidak fokus, sedangkan copy/paste terminal harus
        // selalu bisa (klik kanan, Ctrl+Shift+C, Shift+Insert).
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(AppState::new())
        .setup(move |app| {
            // Sampler RAM untuk StatusBar (fase 02 V6).
            settings::spawn_ram_sampler(app.handle().clone(), minimized_setup);
            Ok(())
        })
        .on_window_event(move |window, event| {
            // Update flag minimized dari main thread; sekaligus tunda emit
            // output PTY supaya CPU tidak terbuang saat window disembunyikan.
            if let WindowEvent::Resized(_) = event {
                if window.label() == "main" {
                    let m = window.is_minimized().unwrap_or(false);
                    if m != minimized.swap(m, Ordering::Relaxed) {
                        window.state::<AppState>().set_render_paused(m);
                    }
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
            // explorer / search (fase 04)
            explorer::scan_dir,
            explorer::fs_watch,
            explorer::fs_unwatch,
            explorer::search_files,
            explorer::replace_in_file,
            explorer::reveal_path,
            // terminal / pty (fase 05)
            pty::list_shells,
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
            pty::pty_list,
            pty::pty_set_paused,
            pty::pty_interrupt,
            // agent CLI (fase 06)
            agents::list_agents,
            // settings lanjutan (fase 08)
            secrets::get_public_models,
            secrets::set_model_key,
            secrets::test_model_connection,
            secrets::reset_settings,
            // AI panel (fase 09)
            ai::ai_chat,
            ai::ai_cancel,
            // dialog
            dialogs::file_dialog_open,
            dialogs::file_dialog_save,
            dialogs::folder_dialog_open,
        ])
        .build(tauri::generate_context!());

    match app {
        Ok(app) => app.run(|handle, event| {
            // Saat app benar-benar keluar, matikan semua shell anak supaya
            // tidak ada proses tertinggal di Task Manager (V7 fase 05).
            if let RunEvent::Exit = event {
                handle.state::<AppState>().pty_kill_all();
            }
        }),
        Err(e) => eprintln!("[zephyr] gagal start: {e:?}"),
    }
}
