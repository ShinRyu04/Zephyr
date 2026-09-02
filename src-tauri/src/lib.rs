// lib.rs — entry point Zephyr: register plugin, state, dan semua command.
// Kontrak nama command: ARCHITECTURE.md §2.

mod adapters;
mod agents;
mod ai;
mod app_state;
mod browser;
mod credential;
mod dialogs;
mod errors;
mod explorer;
mod fs_utils;
mod git;
mod github;
mod mcp_commands;
mod mcp_config;
mod mcp_server;
mod pty;
mod secrets;
mod settings;
mod tests_ai;
mod tests_fs;
mod tests_browser;
mod tests_git;
mod tests_mcp;

use app_state::AppState;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{Manager, RunEvent, WindowEvent};

/// Mode `zephyr git-credential <op>`: dipanggil git, bukan user.
/// true = argumen memang untuk helper dan sudah dijawab (proses harus keluar
/// tanpa membuka window). Lihat credential.rs untuk kontraknya.
pub fn run_credential_helper() -> bool {
    credential::handle_cli()
}

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
            // MCP (fase 11): kalau user sudah menyalakannya, hidupkan lagi
            // saat app dibuka supaya AI CLI yang sudah didaftari langsung
            // menemukan port-nya tanpa harus klik switch dulu.
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let enabled = {
                    let st = handle.state::<AppState>();
                    settings::read_settings_value(&st)
                        .get("mcp")
                        .and_then(|m| m.get("enabled"))
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false)
                };
                if enabled {
                    if let Err(e) = mcp_server::start(handle.clone()).await {
                        eprintln!("[zephyr] MCP tidak bisa start: {e}");
                    }
                }
            });
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
            explorer::list_workspace_files,
            // browser pane (fase 12)
            browser::browser_probe,
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
            // git (fase 10)
            git::git_init,
            git::git_status,
            git::git_stage,
            git::git_unstage,
            git::git_commit,
            git::git_push,
            git::git_pull,
            git::git_fetch,
            git::git_branches,
            git::git_checkout,
            git::git_create_branch,
            git::git_delete_branch,
            git::git_diff,
            git::git_discard,
            git::git_log,
            git::git_config_get_user,
            // GitHub auth (fase 10)
            github::gh_status,
            github::gh_set_pat,
            github::gh_login_device,
            github::gh_logout,
            github::gh_test,
            // MCP server 9222 (fase 11)
            mcp_commands::mcp_status,
            mcp_commands::mcp_start,
            mcp_commands::mcp_stop,
            mcp_commands::mcp_reply,
            mcp_commands::mcp_rotate_token,
            mcp_commands::mcp_write_cli,
            mcp_commands::mcp_remove_cli,
            mcp_commands::mcp_cli_status,
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
                // Tutup socket MCP supaya port 9222 tidak tertinggal listening.
                mcp_server::stop(handle);
            }
        }),
        Err(e) => eprintln!("[zephyr] gagal start: {e:?}"),
    }
}
