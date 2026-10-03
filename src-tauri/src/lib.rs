mod adapters;
mod agent_exec;
mod agent_patch;
mod agents;
mod ai;
mod api_client;
mod app_state;
mod database;
mod credentials;
mod bg_image;
mod browser;
mod browser_pane;
mod cli;
mod cli_agents;
mod cli_ext;
mod credential;
mod cron;
mod dap;
mod devenv;
mod dev_update;
mod diagnostics;
mod dialogs;
mod discord_rpc;
pub mod errors;
mod explorer;
mod ext_bundled;
mod ext_lang_icons;
mod ext_pkg;
mod ext_registry;
mod extensions;
pub mod fs_utils;
pub mod tulis_aman;
mod gambar;
mod git;
mod github;
mod history;
mod logging;
mod lsp;
mod mcp_client;
mod mcp_commands;
mod mcp_config;
mod mcp_server;
mod memory;
mod paths;
mod proc;
mod pty;
mod rag;
pub mod search;
mod secrets;
mod sftp;
mod settings;
mod skills;
mod snippets;
mod ssh;
mod tasks;
mod tests_ai;
mod tests_browser;
mod tests_fs;
mod tests_git;
mod tests_log;
mod tests_mcp;
mod titlebar;
mod voice;
mod web;
mod workspace;

use app_state::AppState;
use serde_json::json;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{Emitter, Manager, RunEvent, WindowEvent};

/*
 * Argumen WebView2 yang dipasang selalu.
 *
 * `--renderer-process-limit=1` dan `--single-process` DIHAPUS dari sini: keduanya
 * memaksa renderer, GPU, dan utility masuk ke proses browser. Itu menghemat RAM
 * saat menganggur, tetapi mematikan multi-proses WebView2, dan terminal PTY serta
 * pane browser (iframe) tidak hidup tanpa pemisahan proses. Di build rilis
 * gejalanya: terminal tidak jalan, pane browser kosong.
 *
 * PENTING — jangan hapus dua flag ini: `SpareRendererForSitePerProcess` dan
 * `CalculateNativeWinOcclusion`. Keduanya WAJIB agar child webview (pane browser)
 * dan terminal PTY benar-benar menggambar di build rilis:
 *   * `SpareRendererForSitePerProcess` mempertahankan renderer cadangan. Tanpa
 *     ini, ketika renderer pane browser mati, tidak ada pengganti — pane tinggal
 *     hitam.
 *   * `CalculateNativeWinOcclusion` menjaga penghitungan occlusion Windows; tanpa
 *     ini child webview tidak pernah disuruh menggambar, sehingga hitam sejak awal.
 * Gejala ini muncul di rilis karena flag ini hanya ada lewat path ini (env var +
 * config rilis). Dev dan debug memuat frontend dari Vite dan juga butuh flag ini,
 * tapi rilis-lah yang terlihat hitam pertama kali. Bukti A/B: build lama yang
 * jalan punya kedua flag ini di command line WebView2; build baru yang hitam tidak.
 *
 * Yang tersisa selain kedua flag wajib di atas hanya argumen yang aman: hemat RAM
 * tanpa mengganggu proses ATAU cara WebView2 menggambar.
 */
const RAM_ARGS_BASE: &str = "--js-flags=--max-old-space-size=192 --disable-background-networking --no-first-run --disable-component-update --disable-domain-reliability --disable-sync --disable-features=SpareRendererForSitePerProcess,CalculateNativeWinOcclusion,msWebOOUI,msPdfOOUI,msSmartScreenProtection,msEdgeIdentity,msEdgeSync,msEdgeAutofill,msEdgeSidebar,msEdgeShoppingAssistant,msEdgeCollections,msEdgeWorkspaces";

fn pasang_arg_webview2() {
    let ada = std::env::var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").unwrap_or_default();
    // Penjaga yang benar: jangan pasang dua kali.
    //
    // Memeriksa `--js-flags` saja TIDAK cukup. `additionalBrowserArgs` di
    // tauri.release.conf.json diteruskan langsung ke WebView2, bukan lewat env
    // var, jadi penjaga lama tidak pernah melihatnya - dan flag yang sama
    // terpasang dua kali. Sekarang kita kenali kedua penanda yang mungkin sudah
    // datang dari config.
    if ada.contains("--js-flags") || ada.contains("--disable-features") {
        return;
    }
    let mut gabung = RAM_ARGS_BASE.to_string();
    if !ada.trim().is_empty() {
        gabung.push(' ');
        gabung.push_str(ada.trim());
    }
    std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", gabung);
}

pub fn run_credential_helper() -> bool {
    credential::handle_cli()
}

pub fn run_cli_console() -> bool {
    let argv: Vec<String> = std::env::args().skip(1).collect();
    if cli_ext::jalankan(&argv) {
        return true;
    }
    cli::tangani_help_version()
}

pub fn portable_aktif() -> bool {
    cli_ext::portable_aktif()
}

pub fn dir_data_zephyr() -> std::path::PathBuf {
    cli_ext::dir_data()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let minimized = Arc::new(AtomicBool::new(false));
    let minimized_setup = minimized.clone();

    pasang_arg_webview2();

    let state = AppState::new();
    logging::init(&state.data_dir.join("logs"));
    let boot = std::time::Instant::now();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            let args = cli::parse(
                &argv.iter().skip(1).cloned().collect::<Vec<String>>(),
                std::path::Path::new(&cwd),
            );

            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
            let _ = app.emit("cli-args", &args);
        }))
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::all()
                        & !tauri_plugin_window_state::StateFlags::DECORATIONS,
                )
                .build(),
        )
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(state)
        .manage(tasks::TasksRuntime::default())
        .manage(search::SearchRuntime::default())
        .manage(dap::DapRuntime::default())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(move |app| {
            settings::spawn_ram_sampler(app.handle().clone(), minimized_setup);

            logging::attach_app(app.handle().clone());

            cron::mulai_timer(app.handle().clone());
            discord_rpc::start(app.handle().clone());
            app.state::<AppState>()
                .perf_mark("setup", Some(boot.elapsed().as_millis() as u64));

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
                    tracing::debug!("MCP is not running — the server starts lazily");
                    return;
                }
                match mcp_server::start(handle.clone()).await {
                    Ok(port) => tracing::info!(port, "MCP hidup saat startup"),
                    Err(e) => tracing::warn!("MCP could not start: {e}"),
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
                WindowEvent::Resized(size) => {
                    let m = window.is_minimized().unwrap_or(false);
                    if m != minimized.swap(m, Ordering::Relaxed) {
                        window.state::<AppState>().set_render_paused(m);
                        tracing::debug!(minimized = m, "render pause diubah");
                    }

                    let _ = window.emit(
                        "window-resized",
                        json!({ "width": size.width, "height": size.height }),
                    );
                }

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
            bg_image::bg_image_read,
            dev_update::dev_update_info,
            dev_update::dev_update_build,
            dev_update::dev_update_apply,
            dev_update::dev_update_log,
            dev_update::dev_update_rollback,
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
            explorer::scan_dir,
            explorer::fs_watch,
            explorer::fs_unwatch,
            explorer::search_files,
            explorer::list_workspace_files,
            browser::browser_probe,
            browser::browser_download_url,
            browser_pane::browser_pane_open,
            browser_pane::browser_pane_bounds,
            browser_pane::browser_pane_visible,
            browser_pane::browser_pane_close,
            browser_pane::browser_pane_nav,
            browser_pane::browser_pane_eval,
            browser_pane::browser_pane_info,
            browser_pane::browser_pane_cursor,
            web::web_fetch,
            web::web_search,
            rag::rag_search,
            explorer::replace_in_file,
            explorer::reveal_path,
            pty::list_shells,
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
            pty::pty_list,
    pty::pty_tail,
            pty::pty_set_paused,
            pty::pty_interrupt,
            /*
             * Dev Environment and SFTP.
             *
             * Both modules existed as files but were never declared with `mod`
             * or registered here, so every command they expose answered
             * "Command not found": SFTP reported the OpenSSH client as missing
             * and the Dev Environment listed every runtime as not installed.
             */
            devenv::devenv_detect_runtimes,
            devenv::devenv_detect_services,
            devenv::devenv_service_start,
            devenv::devenv_service_stop,
            devenv::devenv_scan_projects,
            devenv::devenv_open_path,
            sftp::sftp_available,
            sftp::sftp_list,
            sftp::sftp_upload,
            sftp::sftp_download,
            sftp::sftp_tunnel_start,
            sftp::sftp_tunnel_stop,
            sftp::sftp_tunnel_list,
            ssh::ssh_list,
            ssh::ssh_add,
            ssh::ssh_update,
            ssh::ssh_delete,
            ssh::ssh_save_password,
            ssh::ssh_clear_password,
            ssh::ssh_connect,
            ssh::ssh_disconnect,
            agents::list_agents,
            secrets::get_public_models,
            secrets::secrets_snapshot,
            secrets::set_model_key,
            secrets::test_model_connection,
            secrets::list_models,
            secrets::reset_settings,
            ai::ai_chat,
            ai::ai_capture_set,
            ai::ai_capture_get,
            ai::ai_capture_clear,
            ai::ai_cancel,
            voice::ai_transcribe,
            cli_agents::cli_agents_detect,
            cli_agents::cli_agent_run,
            gambar::baca_gambar,
            app_state::portable_mode,
            ai::ai_tool_chat,
            ai::ai_tool_chat_stream,
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
            git::git_blame,
            git::git_stash_save,
            git::git_stash_list,
            git::git_stash_pop,
            git::git_stash_drop,
            git::git_rebase,
            git::git_conflict_take,
            git::git_conflict_read,
            git::git_rebase_interactive,
            git::git_rebase_continue,
            git::git_rebase_abort,
            git::git_rebase_status,
            git::git_worktree_list,
            git::git_worktree_add,
            git::git_worktree_remove,
            git::git_worktree_prune,
            github::gh_status,
            github::gh_set_pat,
            github::gh_login_device,
            github::gh_logout,
            github::gh_test,
            mcp_commands::mcp_status,
            mcp_commands::mcp_start,
            mcp_commands::mcp_stop,
            mcp_commands::mcp_reply,
            mcp_commands::mcp_ui_ready,
            mcp_commands::mcp_rotate_token,
            mcp_commands::mcp_write_cli,
            mcp_commands::mcp_remove_cli,
            mcp_commands::mcp_cli_status,
            mcp_commands::mcp_write_custom_cli,
            mcp_commands::mcp_client_list,
            mcp_commands::mcp_client_tools,
            mcp_commands::mcp_client_call,
            mcp_commands::mcp_client_save,
            mcp_commands::mcp_client_remove,
            extensions::extensions_list,
            extensions::extensions_load,
            extensions::extensions_add,
            extensions::extensions_remove,
            extensions::extensions_folder,
            ext_pkg::extensions_install,
            ext_pkg::extensions_uninstall,
            ext_pkg::extensions_set_enabled,
            ext_pkg::extensions_read_contrib,
            ext_pkg::extensions_read_main,
            ext_pkg::extensions_read_files,
            ext_pkg::ext_which,
            ext_pkg::ext_exec,
            ext_pkg::extensions_manifests,
            ext_pkg::extensions_download_zext,
            ext_bundled::extensions_write_bundled,
            ext_bundled::extensions_bundled_ids,
            ext_registry::ext_registry_list,
            ext_registry::ext_registry_save,
            ext_registry::ext_registry_read,
            ext_registry::ext_registry_installed,
            ext_registry::ext_registry_url_diizinkan,
            tasks::tasks_load,
            tasks::tasks_matchers,
            tasks::tasks_match_line,
            tasks::tasks_run,
            tasks::tasks_wait,
            tasks::tasks_kill,
            tasks::tasks_runs,
            tasks::tasks_clear_runs,
            agent_exec::agent_exec,
            agent_patch::file_patch,
            tasks::tasks_detect_port,
            history::history_snapshot,
            history::history_list,
            history::history_read,
            history::history_clear,
            history::history_prune,
            history::history_stats,
            search::search_grep,
            search::search_cancel,
            search::search_rg_info,
            search::search_replace,
            cli::cli_args_awal,
            cli::cli_wait_selesai,
            cli::cli_wait_buat,
            cli::cli_wait_aktif,
            cli::cli_teks,
            cli::cli_parse,
            workspace::workspace_info,
            workspace::workspace_set_trust,
            workspace::workspace_forget_trust,
            workspace::workspace_trust_list,
            workspace::workspace_add_root,
            workspace::workspace_remove_root,
            workspace::workspace_set_active_root,
            workspace::workspace_open_file,
            workspace::workspace_save_file,
            workspace::workspace_settings_efektif,
            workspace::workspace_settings_asal,
            workspace::workspace_set_settings,
            workspace::workspace_boleh_eksekusi,
            snippets::snippets_load,
            snippets::snippets_user_file,
            snippets::snippets_user_list,
            snippets::snippets_builtin_langs,
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
            diagnostics::get_diagnostics,
            diagnostics::self_test,
            diagnostics::log_frontend,
            diagnostics::perf_mark,
            diagnostics::debug_panic,
            dialogs::file_dialog_open,
            dialogs::file_dialog_save,
            dialogs::folder_dialog_open,
            titlebar::titlebar_theme,
            skills::skills_list,
            skills::skill_read,
            skills::skill_write,
            skills::skill_delete,
            skills::agent_context,
            memory::memory_read,
            memory::memory_write,
            cron::cron_list,
            cron::cron_create,
            cron::cron_delete,
            cron::cron_toggle,
            cron::cron_due,
            cron::cron_mark_run,

            /*
             * The API Client, SQL Explorer and Credentials handlers.
             *
             * These were WRITTEN but never registered, so every button in those
             * three extensions failed the moment it was clicked with
             * `Command ... not found` - no build error, no type error, nothing in
             * any log until a user pressed the button. The frontend declares all
             * of them in `commands.ts`, so the UI drew every control and every
             * one was dead.
             *
             * This is the failure Tauri makes easy: a handler is a plain function
             * and a command is a string, so the compiler cannot see the link
             * between them, and an unregistered handler looks exactly like a
             * missing one until runtime. `scripts/audit-command-hilang.mjs` now
             * checks the pairing statically.
             */
            api_client::http_request,
            api_client::graphql_body,
            api_client::graphql_errors,
            database::db_default_path,
            database::db_tables,
            database::db_columns,
            database::db_query,
            credentials::credentials_list,
            credentials::credentials_set,
            credentials::credentials_get,
            credentials::credentials_delete,
        ])
        .build(tauri::generate_context!());

    match app {
        Ok(app) => app.run(|handle, event| {
            if let RunEvent::Exit = event {
                let st = handle.state::<AppState>();
                tracing::info!(uptime_ms = st.uptime_ms(), "application exit");
                st.pty_kill_all();

                discord_rpc::stop();
                mcp_server::stop(handle);
            }
        }),
        Err(e) => {
            tracing::error!("failed start: {e:?}");
            eprintln!("[zephyr] failed start: {e:?}");
        }
    }
}
