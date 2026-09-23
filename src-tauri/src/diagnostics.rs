use crate::app_state::{AppState, PerfMark};
use crate::errors::ZResult;
use serde::Serialize;
use std::collections::HashMap;
use tauri::State;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostics {
    pub version: String,

    pub uptime_ms: u64,

    pub ram_bytes: u64,

    pub ram_total_bytes: u64,

    pub ram_peak_bytes: u64,

    pub pty_count: usize,

    pub mcp_port: u16,

    pub log_file: String,

    pub log_bytes: u64,

    pub debug: bool,

    pub panicked: bool,

    pub last_panic: String,

    pub marks: Vec<PerfMark>,

    pub counters: HashMap<String, u64>,

    pub os: String,

    pub host_ram_bytes: u64,

    pub cpu_count: usize,

    pub domains: Vec<DomainStatus>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DomainStatus {
    pub id: String,

    pub level: String,
    pub detail: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SelfTestItem {
    pub name: String,
    pub ok: bool,
    pub ms: u64,
    pub detail: String,
}

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

        os: crate::settings::host_os(),
        host_ram_bytes: crate::settings::host_ram_total(),
        cpu_count: crate::settings::host_cpu_count(),
        domains: domain_status(&state),
    })
}

fn domain_status(state: &AppState) -> Vec<DomainStatus> {
    let baris = |id: &str, level: &str, detail: String| DomainStatus {
        id: id.to_string(),
        level: level.to_string(),
        detail,
    };
    let mut out = Vec::new();

    match state.workspace_path() {
        Some(p) => out.push(baris("fs", "ok", format!("workspace {}", p.display()))),
        None => out.push(baris("fs", "warn", "belum ada workspace terbuka".into())),
    }

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

    match state.mcp_port() {
        Some(p) => out.push(baris("mcp", "ok", format!("listening :{p}"))),
        None => out.push(baris("mcp", "off", "server mati".into())),
    }

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

    let ext_n = cfg
        .get("extensions")
        .and_then(|e| e.get("enabled"))
        .and_then(|v| v.as_array())
        .map(|a| a.len())
        .unwrap_or(0);
    out.push(baris("extensions", "ok", format!("{ext_n} aktif")));

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

#[tauri::command(async)]
pub fn self_test(state: State<AppState>) -> ZResult<Vec<SelfTestItem>> {
    let mut out: Vec<SelfTestItem> = Vec::new();
    let ukur = |f: &dyn Fn() -> (bool, String)| -> (bool, String, u64) {
        let t0 = std::time::Instant::now();
        let (ok, detail) = f();
        (ok, detail, t0.elapsed().as_millis() as u64)
    };

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

    let (ok, detail, ms) = ukur(&|| {
        let mut c = crate::proc::cmd("git");
        c.arg("--version");
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

#[tauri::command(async)]
pub fn log_frontend(level: String, message: String) -> ZResult<()> {
    let msg: String = message.chars().take(4000).collect();
    match level.as_str() {
        "error" => tracing::error!(target: "webview", "{msg}"),
        "warn" => tracing::warn!(target: "webview", "{msg}"),
        _ => tracing::info!(target: "webview", "{msg}"),
    }
    Ok(())
}

#[tauri::command(async)]
pub fn perf_mark(state: State<AppState>, name: String, dur_ms: Option<u64>) -> ZResult<()> {
    let n: String = name.chars().take(64).collect();
    state.perf_mark(&n, dur_ms);
    Ok(())
}

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
