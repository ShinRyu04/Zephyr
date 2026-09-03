// lib.rs — entry point Zephyr: register plugin, state, dan semua command.
// Kontrak nama command: ARCHITECTURE.md §2.

mod adapters;
mod agents;
mod ai;
mod app_state;
mod browser;
mod cli;
mod credential;
mod dap;
mod diagnostics;
mod dialogs;
mod errors;
mod explorer;
mod ext_bundled;
mod ext_pkg;
mod extensions;
mod fs_utils;
mod git;
mod github;
mod history;
mod logging;
mod lsp;
mod mcp_commands;
mod mcp_config;
mod mcp_server;
mod paths;
mod pty;
mod search;
mod secrets;
mod settings;
mod tasks;
mod tests_ai;
mod tests_browser;
mod tests_fs;
mod tests_git;
mod tests_log;
mod tests_mcp;

use app_state::AppState;
use serde_json::json;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{Emitter, Manager, RunEvent, WindowEvent};

/// Mode `zephyr git-credential <op>`: dipanggil git, bukan user.
/// true = argumen memang untuk helper dan sudah dijawab (proses harus keluar
/// tanpa membuka window). Lihat credential.rs untuk kontraknya.
pub fn run_credential_helper() -> bool {
    credential::handle_cli()
}

// ───────────────────────── command CLI (fase 28) ─────────────────────────
//
// Command DIDEFINISIKAN di cli.rs, bukan di sini: `generate_handler!` mengimpor
// nama command ke modul tempat ia dipanggil, jadi command yang tinggal di lib.rs
// bertabrakan dengan dirinya sendiri (E0255 "defined multiple times").

/// Mode konsol `--help` / `--version` (fase 28).
///
/// Sama polanya dengan credential helper: ditangani SEBELUM Tauri start supaya
/// `zephyr --version` tidak membuka window sekadar untuk mencetak satu baris.
pub fn run_cli_console() -> bool {
    cli::tangani_help_version()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Status minimized dipegang di sini (bukan dibaca dari thread lain):
    // memanggil API window dari thread non-main mematikan proses di Windows.
    let minimized = Arc::new(AtomicBool::new(false));
    let minimized_setup = minimized.clone();

    // Logging dipasang PALING AWAL (fase 14.6) supaya error saat membangun
    // window pun tercatat. AppState dibuat di sini karena ia yang tahu lokasi
    // %APPDATA%\zephyr\logs.
    let state = AppState::new();
    logging::init(&state.data_dir.join("logs"));
    let boot = std::time::Instant::now();

    let app = tauri::Builder::default()
        // ═══ fase 28: single instance HARUS plugin PERTAMA ═══
        //
        // Plugin dijalankan sesuai urutan penambahan (catatan resmi
        // plugins-workspace). Kalau ini bukan yang pertama, instance kedua
        // sudah membangun window/state sebelum sadar harus keluar.
        //
        // argv yang diterima di sini SUDAH memuat argv[0] (path exe), jadi
        // di-skip sebelum di-parse.
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            let args = cli::parse(
                &argv.iter().skip(1).cloned().collect::<Vec<String>>(),
                std::path::Path::new(&cwd),
            );
            // Fokus jendela dulu: user menjalankan `zephyr x` untuk MELIHAT
            // hasilnya, jadi jendela harus muncul walau argumennya kosong.
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
            let _ = app.emit("cli-args", &args);
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        // Clipboard lewat Rust: navigator.clipboard di WebView2 menolak
        // saat dokumen tidak fokus, sedangkan copy/paste terminal harus
        // selalu bisa (klik kanan, Ctrl+Shift+C, Shift+Insert).
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(state)
        // Runtime task (fase 23): daftar run + peta proses anak.
        .manage(tasks::TasksRuntime::default())
        // Runtime pencarian (fase 25): flag batal untuk query yang sedang jalan.
        .manage(search::SearchRuntime::default())
        // Runtime debugger (fase 22): satu sesi DAP aktif.
        .manage(dap::DapRuntime::default())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(move |app| {
            // Sampler RAM untuk StatusBar (fase 02 V6).
            settings::spawn_ram_sampler(app.handle().clone(), minimized_setup);
            // Panic hook boleh memberi tahu frontend mulai dari sini (14.6).
            logging::attach_app(app.handle().clone());
            app.state::<AppState>()
                .perf_mark("setup", Some(boot.elapsed().as_millis() as u64));

            // MCP (fase 11): LAZY (fase 14.5) — socket, task axum, dan token
            // generator TIDAK pernah dibuat kalau switch-nya mati. Yang dibaca
            // saat startup cuma satu key di settings.json.
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
                if !enabled {
                    tracing::debug!("MCP tidak aktif — server tidak dijalankan (lazy)");
                    return;
                }
                match mcp_server::start(handle.clone()).await {
                    Ok(port) => tracing::info!(port, "MCP hidup saat startup"),
                    Err(e) => tracing::warn!("MCP tidak bisa start: {e}"),
                }
            });
            tracing::info!(ms = boot.elapsed().as_millis() as u64, "setup selesai");
            Ok(())
        })
        .on_window_event(move |window, event| {
            if window.label() != "main" {
                return;
            }
            match event {
                // Update flag minimized dari main thread; sekaligus tunda emit
                // output PTY supaya CPU tidak terbuang saat window disembunyikan.
                WindowEvent::Resized(size) => {
                    let m = window.is_minimized().unwrap_or(false);
                    if m != minimized.swap(m, Ordering::Relaxed) {
                        window.state::<AppState>().set_render_paused(m);
                        tracing::debug!(minimized = m, "render pause diubah");
                    }
                    // fase 14.4: `window-resized` kanonik. Payload kecil (2 angka)
                    // dan idempoten — frontend cukup menyimpan nilai terakhir.
                    let _ = window.emit(
                        "window-resized",
                        json!({ "width": size.width, "height": size.height }),
                    );
                }
                // fase 14.4: `file-dropped`. Frontend punya onDragDropEvent
                // sendiri untuk membuka tab; event ini melengkapi kontrak §3
                // dan mencatat drop ke log.
                WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) => {
                    let list: Vec<String> = paths
                        .iter()
                        .map(|p| p.to_string_lossy().to_string())
                        .collect();
                    tracing::info!(count = list.len(), "file di-drop ke window");
                    let _ = window.emit("file-dropped", json!({ "paths": list }));
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            // app / settings
            settings::get_app_info,
            settings::get_settings,
            settings::set_settings,
            settings::take_broken_config,
            settings::get_keybindings,
            settings::set_keybindings,
            lsp::lsp_start,
            lsp::lsp_request,
            lsp::lsp_notify,
            lsp::lsp_stop,
            lsp::lsp_stop_all,
            lsp::lsp_status,
            lsp::lsp_reap,
            lsp::lsp_set_idle,
            lsp::lsp_probe,
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
            // extensions (fase 13)
            extensions::extensions_list,
            extensions::extensions_load,
            extensions::extensions_add,
            extensions::extensions_remove,
            extensions::extensions_folder,
            // fase 19: manifest native, install/uninstall, kontribusi
            ext_pkg::extensions_install,
            ext_pkg::extensions_uninstall,
            ext_pkg::extensions_set_enabled,
            ext_pkg::extensions_read_contrib,
            ext_pkg::extensions_manifests,
            ext_bundled::extensions_write_bundled,
            ext_bundled::extensions_bundled_ids,
            // tasks (fase 23)
            tasks::tasks_load,
            tasks::tasks_matchers,
            tasks::tasks_match_line,
            tasks::tasks_run,
            tasks::tasks_wait,
            tasks::tasks_kill,
            tasks::tasks_runs,
            tasks::tasks_clear_runs,
            tasks::tasks_detect_port,
            // local history / timeline (fase 26)
            history::history_snapshot,
            history::history_list,
            history::history_read,
            history::history_clear,
            history::history_prune,
            history::history_stats,
            // global search & replace (fase 25)
            search::search_grep,
            search::search_cancel,
            search::search_rg_info,
            search::search_replace,
            // CLI launcher (fase 28)
            cli::cli_args_awal,
            cli::cli_wait_selesai,
            cli::cli_wait_buat,
            cli::cli_wait_aktif,
            cli::cli_teks,
            cli::cli_parse,
            // debugger DAP (fase 22)
            dap::dap_load,
            dap::dap_adapters,
            dap::dap_start,
            dap::dap_stop,
            dap::dap_status,
            dap::dap_kontrol,
            dap::dap_threads,
            dap::dap_stack,
            dap::dap_scopes,
            dap::dap_variables,
            dap::dap_evaluate,
            dap::dap_set_variable,
            dap::dap_set_breakpoints,
            dap::dap_loaded_sources,
            // diagnostics / logging (fase 14)
            diagnostics::get_diagnostics,
            diagnostics::self_test,
            diagnostics::log_frontend,
            diagnostics::perf_mark,
            diagnostics::debug_panic,
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
                let st = handle.state::<AppState>();
                tracing::info!(uptime_ms = st.uptime_ms(), "application exit");
                st.pty_kill_all();
                // Tutup socket MCP supaya port 9222 tidak tertinggal listening.
                mcp_server::stop(handle);
            }
        }),
        Err(e) => {
            tracing::error!("gagal start: {e:?}");
            eprintln!("[zephyr] gagal start: {e:?}");
        }
    }
}
