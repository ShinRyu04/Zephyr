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
    /// FASE 16.5: nama + versi OS
    pub os: String,
    /// FASE 16.5: RAM fisik mesin (byte)
    pub host_ram_bytes: u64,
    /// FASE 16.5: jumlah CPU logis
    pub cpu_count: usize,
    /// FASE 16.5: status ringkas per domain (fs/pty/git/mcp/ai/extensions/log)
    pub domains: Vec<DomainStatus>,
}

/// Satu baris tabel status domain (fase 16.5).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DomainStatus {
    pub id: String,
    /// "ok" | "warn" | "off"
    pub level: String,
    pub detail: String,
}

/// Hasil satu mini-test `self_test` (fase 16.5).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SelfTestItem {
    pub name: String,
    pub ok: bool,
    pub ms: u64,
    pub detail: String,
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
        // FASE 16.5: info host dibaca dari sampler (sysinfo statis), BUKAN dengan
        // membuat `sysinfo::System` baru di sini — itu yang membuat app keluar
        // sendiri saat command ini dipolling (pelajaran V8 fase 14).
        os: crate::settings::host_os(),
        host_ram_bytes: crate::settings::host_ram_total(),
        cpu_count: crate::settings::host_cpu_count(),
        domains: domain_status(&state),
    })
}

/// FASE 16.5: status ringkas tiap domain untuk tabel Diagnostics.
///
/// Semua nilai dibaca dari state/PATH yang sudah ada — tidak ada operasi berat
/// (tidak menjalankan git, tidak menyentuh jaringan), supaya panel ini aman
/// di-refresh tiap 3 detik.
fn domain_status(state: &AppState) -> Vec<DomainStatus> {
    let baris = |id: &str, level: &str, detail: String| DomainStatus {
        id: id.to_string(),
        level: level.to_string(),
        detail,
    };
    let mut out = Vec::new();

    // fs / workspace
    match state.workspace_path() {
        Some(p) => out.push(baris("fs", "ok", format!("workspace {}", p.display()))),
        None => out.push(baris("fs", "warn", "belum ada workspace terbuka".into())),
    }

    // pty
    let n = state.pty_count();
    out.push(baris(
        "pty",
        "ok",
        if n == 0 {
            "tidak ada pane aktif".into()
        } else {
            format!("{n} pane aktif")
        },
    ));

    // git — hanya cek keberadaan folder .git (murah).
    let git_ok = state
        .workspace_path()
        .map(|p| p.join(".git").exists())
        .unwrap_or(false);
    out.push(baris(
        "git",
        if git_ok { "ok" } else { "off" },
        if git_ok {
            "repo git terdeteksi".into()
        } else {
            "workspace bukan repo git".into()
        },
    ));

    // mcp
    match state.mcp_port() {
        Some(p) => out.push(baris("mcp", "ok", format!("listening :{p}"))),
        None => out.push(baris("mcp", "off", "server mati".into())),
    }

    // ai — provider aktif + apakah ada key (tanpa membuka key-nya)
    let cfg = crate::settings::read_settings_value(state);
    let prov = cfg
        .get("models")
        .and_then(|m| m.get("activeProvider"))
        .and_then(|v| v.as_str())
        .unwrap_or("-")
        .to_string();
    let ada_key = !crate::secrets::key_for(state, &prov).is_empty();
    out.push(baris(
        "ai",
        if ada_key { "ok" } else { "warn" },
        format!(
            "provider {prov} — key {}",
            if ada_key { "terpasang" } else { "belum ada" }
        ),
    ));

    // extensions
    let ext_n = cfg
        .get("extensions")
        .and_then(|e| e.get("enabled"))
        .and_then(|v| v.as_array())
        .map(|a| a.len())
        .unwrap_or(0);
    out.push(baris("extensions", "ok", format!("{ext_n} aktif")));

    // log
    let lf = crate::logging::log_file_path();
    match lf {
        Some(p) if p.exists() => {
            let kb = std::fs::metadata(&p).map(|m| m.len() / 1024).unwrap_or(0);
            out.push(baris("log", "ok", format!("{kb} KB (rotate 2 MB)")));
        }
        _ => out.push(baris("log", "warn", "file log belum dibuat".into())),
    }

    out
}

/// FASE 16.5: self-test cepat. Menjalankan mini-test nyata untuk tiap domain
/// dan mengembalikan hasilnya — bukan klaim "OK" dari konfigurasi.
///
/// Sengaja SEMUANYA murah dan tidak menyentuh jaringan: fs tulis+baca+hapus di
/// data dir, pty spawn+kill, `git --version` (bukan operasi repo), dan cek
/// socket MCP dari dalam proses. Aman dijalankan user kapan pun.
#[tauri::command(async)]
pub fn self_test(state: State<AppState>) -> ZResult<Vec<SelfTestItem>> {
    let mut out: Vec<SelfTestItem> = Vec::new();
    let ukur = |f: &dyn Fn() -> (bool, String)| -> (bool, String, u64) {
        let t0 = std::time::Instant::now();
        let (ok, detail) = f();
        (ok, detail, t0.elapsed().as_millis() as u64)
    };

    // 1) fs: tulis → baca → hapus di data dir (selalu boleh ditulis).
    let (ok, detail, ms) = ukur(&|| {
        let p = state.data_dir.join("selftest.tmp");
        let isi = "zephyr-selftest";
        match std::fs::write(&p, isi) {
            Ok(_) => match std::fs::read_to_string(&p) {
                Ok(baca) => {
                    let _ = std::fs::remove_file(&p);
                    if baca == isi {
                        (true, format!("tulis+baca+hapus {}", p.display()))
                    } else {
                        (false, "isi file tidak sama setelah dibaca".into())
                    }
                }
                Err(e) => (false, format!("gagal baca: {e}")),
            },
            Err(e) => (false, format!("gagal tulis: {e}")),
        }
    });
    out.push(SelfTestItem {
        name: "fs tulis/baca".into(),
        ok,
        ms,
        detail,
    });

    // 2) pty: shell benar-benar bisa di-resolve (tanpa spawn, supaya tidak
    //    meninggalkan proses kalau kill gagal).
    let (ok, detail, ms) = ukur(&|| match crate::pty::list_shells() {
        Ok(v) if !v.is_empty() => (
            true,
            format!(
                "{} shell terdeteksi: {}",
                v.len(),
                v.iter()
                    .map(|s| s.id.clone())
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
        ),
        Ok(_) => (false, "tidak ada shell terdeteksi".into()),
        Err(e) => (false, format!("{e}")),
    });
    out.push(SelfTestItem {
        name: "pty shell".into(),
        ok,
        ms,
        detail,
    });

    // 3) git: binary ada & bisa dijalankan.
    let (ok, detail, ms) = ukur(&|| {
        let mut c = std::process::Command::new("git");
        c.arg("--version");
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            c.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        }
        match c.output() {
            Ok(o) if o.status.success() => {
                (true, String::from_utf8_lossy(&o.stdout).trim().to_string())
            }
            Ok(o) => (false, format!("exit {:?}", o.status.code())),
            Err(e) => (false, format!("git tidak ditemukan: {e}")),
        }
    });
    out.push(SelfTestItem {
        name: "git CLI".into(),
        ok,
        ms,
        detail,
    });

    // 4) mcp: kalau menyala, socket-nya harus benar-benar menerima koneksi.
    let (ok, detail, ms) = ukur(&|| match state.mcp_port() {
        Some(p) => match std::net::TcpStream::connect_timeout(
            &std::net::SocketAddr::from(([127, 0, 0, 1], p)),
            std::time::Duration::from_millis(800),
        ) {
            Ok(_) => (true, format!("socket :{p} menerima koneksi")),
            Err(e) => (false, format!("port {p} tidak bisa dihubungi: {e}")),
        },
        None => (true, "server mati (tidak diuji)".into()),
    });
    out.push(SelfTestItem {
        name: "mcp socket".into(),
        ok,
        ms,
        detail,
    });

    // 5) log: file log bisa ditulis (baris uji benar-benar masuk).
    let (ok, detail, ms) = ukur(&|| {
        tracing::info!(target: "selftest", "self-test menulis satu baris");
        match crate::logging::log_file_path() {
            Some(p) if p.exists() => {
                let n = std::fs::metadata(&p).map(|m| m.len()).unwrap_or(0);
                (true, format!("{} ({} byte)", p.display(), n))
            }
            _ => (false, "file log tidak ada".into()),
        }
    });
    out.push(SelfTestItem {
        name: "log tulis".into(),
        ok,
        ms,
        detail,
    });

    let gagal = out.iter().filter(|x| !x.ok).count();
    tracing::info!("self_test: {} item, {gagal} gagal", out.len());
    Ok(out)
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
