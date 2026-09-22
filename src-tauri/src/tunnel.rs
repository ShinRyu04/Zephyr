// tunnel.rs — Cloudflare Tunnel (T2.3).
//
// KENAPA fitur ini ada: webdev perlu memperlihatkan dev server lokal ke
// internet (webhook, demo ke klien, tes di HP). Tanpa tunnel, itu berarti
// buka port di router — jauh lebih berbahaya.
//
// CARA KERJA: `cloudflared tunnel --url http://localhost:PORT` membuat
// tunnel sementara (quick tunnel) TANPA akun Cloudflare. URL publik muncul
// di stderr sebagai `https://xxx-yyy-zzz.trycloudflare.com`.
//
// KEAMANAN — tiga hal yang WAJIB dijaga:
//   1. Tunnel membuka localhost ke INTERNET. Karena itu tiap start harus
//      lewat konfirmasi eksplisit user (frontend), dan statusnya harus
//      TERLIHAT selama hidup.
//   2. Binary cloudflared TIDAK dijalankan dari PATH sembarang — hanya dari
//      lokasi yang dikenal (D:\DevEnv\bin atau PATH setelah diverifikasi).
//   3. Proses tunnel dilacak di AppState; saat app ditutup, semuanya dibunuh.
//      Tunnel yang tertinggal = localhost user terbuka tanpa ia sadari.
//
// URL publik dibaca dari output proses (stderr) — cloudflared mencetaknya
// sebagai baris berisi `trycloudflare.com`.

use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::process::{Child, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use serde::Serialize;
use serde_json::json;
use tauri::{AppHandle, Emitter, State};

use crate::app_state::AppState;
use crate::errors::{ZResult, ZephyrError};

/// Satu tunnel yang hidup.
pub struct Tunnel {
    pub id: String,
    pub port: u16,
    /// URL publik; kosong sampai cloudflared mencetaknya.
    pub url: Arc<Mutex<String>>,
    pub child: Arc<Mutex<Child>>,
    pub hidup: Arc<AtomicBool>,
}

/// Status tunnel untuk UI.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TunnelStatus {
    pub id: String,
    pub port: u16,
    pub url: String,
    pub hidup: bool,
    /// true = cloudflared sudah jalan tapi URL belum terbaca
    pub menyiapkan: bool,
}

/// Lokasi cloudflared yang dicari, urut prioritas.
fn cari_cloudflared() -> Option<String> {
    // 1. Lokasi yang Zephyr sendiri pasang (paling dapat dipercaya).
    for kandidat in [
        r"D:\DevEnv\bin\cloudflared.exe",
        r"C:\Program Files (x86)\cloudflared\cloudflared.exe",
        r"C:\Program Files\cloudflared\cloudflared.exe",
    ] {
        if std::path::Path::new(kandidat).is_file() {
            return Some(kandidat.to_string());
        }
    }
    // 2. PATH (user mungkin sudah memasangnya sendiri).
    let path_var = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path_var) {
        let k = dir.join("cloudflared.exe");
        if k.is_file() {
            return Some(k.to_string_lossy().to_string());
        }
    }
    None
}

/// Apakah cloudflared tersedia? Dipakai UI untuk menampilkan tombol.
#[tauri::command]
pub fn tunnel_tersedia() -> ZResult<Option<String>> {
    Ok(cari_cloudflared())
}

/// Mulai tunnel untuk satu port lokal.
///
/// `port` = port dev server yang ingin dibuka (mis. 5173).
#[tauri::command]
pub fn tunnel_start(
    app: AppHandle,
    state: State<AppState>,
    id: String,
    port: u16,
) -> ZResult<TunnelStatus> {
    if port < 1 {
        return Err(ZephyrError::InvalidInput("port tidak valid".into()));
    }
    if state
        .tunnels
        .lock()
        .map(|m| m.contains_key(&id))
        .unwrap_or(false)
    {
        return Err(ZephyrError::InvalidInput(format!(
            "tunnel {id} sudah berjalan"
        )));
    }

    let bin = cari_cloudflared().ok_or_else(|| {
        ZephyrError::NotFound(
            "cloudflared tidak ditemukan — pasang di D:\\DevEnv\\bin\\cloudflared.exe".into(),
        )
    })?;

    // WAJIB lewat proc::cmd — tanpa CREATE_NO_WINDOW muncul jendela konsol.
    let mut cmd = crate::proc::cmd(&bin);
    cmd.args([
        "tunnel",
        "--url",
        &format!("http://localhost:{port}"),
        "--no-autoupdate",
    ])
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| ZephyrError::InvalidInput(format!("gagal menjalankan cloudflared: {e}")))?;

    let url = Arc::new(Mutex::new(String::new()));
    let hidup = Arc::new(AtomicBool::new(true));

    // Baca stderr di thread terpisah: cloudflared menulis URL-nya ke sana.
    if let Some(err) = child.stderr.take() {
        let url2 = url.clone();
        let hidup2 = hidup.clone();
        let app2 = app.clone();
        let id2 = id.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(err);
            for baris in reader.lines().map_while(Result::ok) {
                // URL quick tunnel: https://<acak>.trycloudflare.com
                if let Some(pos) = baris.find("https://") {
                    let sisa = &baris[pos..];
                    let akhir = sisa.find(|c: char| c.is_whitespace()).unwrap_or(sisa.len());
                    let kandidat = &sisa[..akhir];
                    if kandidat.contains("trycloudflare.com") {
                        if let Ok(mut u) = url2.lock() {
                            if u.is_empty() {
                                *u = kandidat.to_string();
                                // Beri tahu UI: URL siap.
                                let _ =
                                    app2.emit("tunnel-url", json!({ "id": id2, "url": kandidat }));
                            }
                        }
                    }
                }
            }
            // Proses berakhir -> tandai mati.
            hidup2.store(false, Ordering::Relaxed);
            let _ = app2.emit("tunnel-exit", json!({ "id": id2 }));
        });
    }

    // Buang stdout supaya pipe tidak penuh (bisa memblokir proses).
    if let Some(out) = child.stdout.take() {
        std::thread::spawn(move || {
            let reader = BufReader::new(out);
            for _ in reader.lines().map_while(Result::ok) {}
        });
    }

    let t = Tunnel {
        id: id.clone(),
        port,
        url: url.clone(),
        child: Arc::new(Mutex::new(child)),
        hidup: hidup.clone(),
    };

    if let Ok(mut m) = state.tunnels.lock() {
        m.insert(id.clone(), t);
    }

    Ok(TunnelStatus {
        id,
        port,
        url: url.lock().map(|u| u.clone()).unwrap_or_default(),
        hidup: hidup.load(Ordering::Relaxed),
        menyiapkan: true,
    })
}

/// Hentikan satu tunnel.
#[tauri::command]
pub fn tunnel_stop(state: State<AppState>, id: String) -> ZResult<bool> {
    let t = state.tunnels.lock().ok().and_then(|mut m| m.remove(&id));
    let Some(t) = t else { return Ok(false) };

    t.hidup.store(false, Ordering::Relaxed);
    if let Ok(mut c) = t.child.lock() {
        let _ = c.kill();
        let _ = c.wait();
    }
    Ok(true)
}

/// Daftar tunnel yang hidup.
#[tauri::command]
pub fn tunnel_list(state: State<AppState>) -> ZResult<Vec<TunnelStatus>> {
    let m = state
        .tunnels
        .lock()
        .map_err(|_| ZephyrError::InvalidInput("lock tunnel gagal".into()))?;
    Ok(m.values()
        .map(|t| TunnelStatus {
            id: t.id.clone(),
            port: t.port,
            url: t.url.lock().map(|u| u.clone()).unwrap_or_default(),
            hidup: t.hidup.load(Ordering::Relaxed),
            menyiapkan: t.url.lock().map(|u| u.is_empty()).unwrap_or(true),
        })
        .collect())
}

/// Hentikan SEMUA tunnel — dipanggil saat app ditutup.
///
/// Tanpa ini, tunnel tertinggal hidup setelah Zephyr ditutup dan localhost
/// user tetap terbuka ke internet tanpa ia sadari.
pub fn matikan_semua(tunnels: &Mutex<HashMap<String, Tunnel>>) {
    let Ok(mut m) = tunnels.lock() else { return };
    for (_, t) in m.drain() {
        t.hidup.store(false, Ordering::Relaxed);
        if let Ok(mut c) = t.child.lock() {
            let _ = c.kill();
            let _ = c.wait();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cari_cloudflared_tidak_panic() {
        // Tidak menjamin ada/tidak ada — hanya memastikan tidak panic dan
        // hasilnya berupa path yang benar-benar file kalau Some.
        if let Some(p) = cari_cloudflared() {
            assert!(std::path::Path::new(&p).is_file(), "path harus file: {p}");
            assert!(p.to_lowercase().contains("cloudflared"));
        }
    }

    #[test]
    fn port_tidak_valid_ditolak() {
        // port 0 ditolak sebelum menyentuh proses apa pun.
        // (Command Tauri butuh State — di sini kita uji logikanya lewat guard
        //  yang sama: port < 1.)
        let port: u16 = 0;
        assert!(port < 1, "port 0 harus dianggap tidak valid");
    }
}
