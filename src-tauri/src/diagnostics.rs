// diagnostics.rs — command untuk About → Diagnostics (fase 14.5/14.6).
//
// Isinya angka yang benar-benar diukur di proses ini: RAM, uptime, jumlah
// pane/lock, path file log, penanda perf, dan status panic. Tidak ada data
// yang dikirim ke luar mesin (larangan telemetri di AGENTS.md §7).

use crate::app_state::{AppState, PerfMark};
use crate::errors::ZResult;
use serde::Serialize;
use std::collections::HashMap;
use tauri::State;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostics {
    /// versi paket (Cargo.toml)
    pub version: String,
    /// umur proses (ms)
    pub uptime_ms: u64,
    /// RAM proses ini saja (byte) — angka yang dipakai StatusBar
    pub ram_bytes: u64,
    /// RAM TOTAL: proses ini + turunan WebView2 (byte). Ini yang cocok dengan
    /// Task Manager; `ram_bytes` sendiri hanya ~1/5 dari kenyataan.
    pub ram_total_bytes: u64,
    /// RAM total tertinggi yang tercatat sejak start (byte)
    pub ram_peak_bytes: u64,
    /// jumlah sesi PTY hidup
    pub pty_count: usize,
    /// port MCP yang listening (0 = mati)
    pub mcp_port: u16,
    /// file log hari ini
    pub log_file: String,
    /// ukuran file log (byte)
    pub log_bytes: u64,
    /// build debug (true) atau release (false)
    pub debug: bool,
    /// sudah pernah panic di sesi ini?
    pub panicked: bool,
    /// pesan panic terakhir ("" = belum ada)
    pub last_panic: String,
    /// penanda perf (startup, workspace_open, ...)
    pub marks: Vec<PerfMark>,
    /// penghitung operasi (fs_write, git, pty_spawn, ...)
    pub counters: HashMap<String, u64>,
}

/// RAM proses sendiri — dibaca dari sampel thread sampler (settings.rs).
///
/// JANGAN memanggil sysinfo di sini. `get_diagnostics` yang membuat
/// `sysinfo::System::new()` sendiri membuat proses Zephyr KELUAR SENDIRI saat
/// command ini dipanggil berulang (terbukti di V8 fase 14: app mati setelah
/// ~1 menit polling tiap 30s). Sampler sudah menyegarkan angkanya tiap 3 detik.
fn self_ram() -> u64 {
    crate::settings::ram_last()
}

#[tauri::command(async)]
pub fn get_diagnostics(state: State<AppState>) -> ZResult<Diagnostics> {
    let ram = self_ram();
    let log_file = crate::logging::log_file_path()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();
    let log_bytes = if log_file.is_empty() {
        0
    } else {
        std::fs::metadata(&log_file).map(|m| m.len()).unwrap_or(0)
    };

    Ok(Diagnostics {
        version: env!("CARGO_PKG_VERSION").to_string(),
        uptime_ms: state.uptime_ms(),
        ram_bytes: ram,
        ram_total_bytes: crate::settings::ram_total_last(),
        ram_peak_bytes: crate::settings::ram_total_peak(),
        pty_count: state.pty_count(),
        mcp_port: state.mcp_port().unwrap_or(0),
        log_file,
        log_bytes,
        debug: cfg!(debug_assertions),
        panicked: crate::logging::panicked(),
        last_panic: crate::logging::last_panic(),
        marks: state.perf_marks(),
        counters: state.counters(),
    })
}

/// Frontend melaporkan error yang tidak tertangkap (`window.onerror` /
/// `unhandledrejection`) supaya jejaknya ada di file log yang sama —
/// tanpa ini masalah di WebView hilang begitu app ditutup.
#[tauri::command(async)]
pub fn log_frontend(level: String, message: String) -> ZResult<()> {
    // Batasi panjang: pesan dari WebView bisa memuat stack raksasa.
    let msg: String = message.chars().take(4000).collect();
    match level.as_str() {
        "error" => tracing::error!(target: "webview", "{msg}"),
        "warn" => tracing::warn!(target: "webview", "{msg}"),
        _ => tracing::info!(target: "webview", "{msg}"),
    }
    Ok(())
}

/// Catat satu penanda perf dari frontend (mis. "ui-ready", "tab-mount").
#[tauri::command(async)]
pub fn perf_mark(state: State<AppState>, name: String, dur_ms: Option<u64>) -> ZResult<()> {
    let n: String = name.chars().take(64).collect();
    state.perf_mark(&n, dur_ms);
    Ok(())
}

/// Sengaja panik — HANYA build debug (V7 fase 14). Di release command ini
/// mengembalikan error, jadi tidak ada jalur untuk mematikan app dari UI.
#[tauri::command(async)]
pub fn debug_panic() -> ZResult<()> {
    #[cfg(debug_assertions)]
    {
        panic!("panic uji fase 14 (debug_panic)");
    }
    #[cfg(not(debug_assertions))]
    {
        Err(crate::errors::ZephyrError::Permission(
            "debug_panic hanya tersedia di build debug".into(),
        ))
    }
}
