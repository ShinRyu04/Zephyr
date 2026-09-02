// browser.rs — dukungan pane browser (fase 12).
//
// Satu tugas: memeriksa apakah sebuah URL boleh ditampilkan di dalam iframe.
// Kenapa harus dari Rust: header respons TIDAK bisa dibaca dari dalam webview
// (CORS), dan menebak lewat timeout event `load` tidak bisa dipercaya —
// Chromium tetap mem-fire `load` untuk halaman error X-Frame-Options. Jadi
// Zephyr menanyakannya langsung ke server, lalu UI menampilkan alasan yang
// sebenarnya, bukan dugaan.

use crate::errors::{ZResult, ZephyrError};
use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeResult {
    pub url: String,
    /// true = server menjawab (bukan berarti boleh di-embed)
    pub reachable: bool,
    pub status: Option<u16>,
    /// false = header melarang embed → UI menawarkan browser eksternal
    pub embeddable: bool,
    /// alasan singkat yang ditampilkan apa adanya ke user
    pub reason: String,
    /// isi header yang menjadi dasar keputusan (untuk transparansi)
    pub header: Option<String>,
    pub ms: u64,
}

/// Periksa satu URL: bisa dijangkau? boleh di-embed?
///
/// Aturan penolakan yang dikenali:
///   * `X-Frame-Options: DENY | SAMEORIGIN | ALLOW-FROM …`
///   * `Content-Security-Policy: frame-ancestors …` yang tidak memuat `*`
///     (Zephyr memuat halaman dari origin tauri/localhost, jadi apa pun selain
///     `*` dianggap menolak — lebih baik salah di sisi hati-hati daripada
///     menampilkan frame putih tanpa penjelasan).
#[tauri::command(async)]
pub fn browser_probe(url: String) -> ZResult<ProbeResult> {
    let u = url.trim().to_string();
    if !(u.starts_with("http://") || u.starts_with("https://")) {
        return Err(ZephyrError::InvalidInput(
            "URL harus diawali http:// atau https://".into(),
        ));
    }
    let started = std::time::Instant::now();

    // GET, bukan HEAD: banyak dev server (Vite) tidak melayani HEAD dengan
    // benar. Body-nya diabaikan.
    let req = ureq::get(&u)
        .config()
        .timeout_global(Some(std::time::Duration::from_secs(6)))
        .build()
        .header("User-Agent", "Zephyr/0.5 (browser-pane probe)");

    let (reachable, status, headers) = match req.call() {
        Ok(r) => {
            let st = r.status().as_u16();
            let xfo = r
                .headers()
                .get("x-frame-options")
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string());
            let csp = r
                .headers()
                .get("content-security-policy")
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string());
            (true, Some(st), (xfo, csp))
        }
        // 4xx/5xx tetap informasi berguna: server hidup, halamannya tidak ada.
        Err(ureq::Error::StatusCode(code)) => (true, Some(code), (None, None)),
        Err(e) => {
            return Ok(ProbeResult {
                url: u,
                reachable: false,
                status: None,
                embeddable: false,
                reason: format!("Tidak bisa dihubungi: {e}"),
                header: None,
                ms: started.elapsed().as_millis() as u64,
            })
        }
    };

    let (xfo, csp) = headers;
    let (embeddable, reason, header) = decide(xfo.as_deref(), csp.as_deref());

    Ok(ProbeResult {
        url: u,
        reachable,
        status,
        embeddable,
        reason,
        header,
        ms: started.elapsed().as_millis() as u64,
    })
}

/// Keputusan embed dari dua header. Dipisah agar bisa diuji tanpa jaringan.
pub fn decide(xfo: Option<&str>, csp: Option<&str>) -> (bool, String, Option<String>) {
    if let Some(v) = xfo {
        let low = v.to_ascii_lowercase();
        if low.contains("deny") {
            return (
                false,
                "Server mengirim X-Frame-Options: DENY — embed dilarang total.".into(),
                Some(format!("X-Frame-Options: {v}")),
            );
        }
        if low.contains("sameorigin") {
            return (
                false,
                "Server mengirim X-Frame-Options: SAMEORIGIN — hanya boleh di-embed oleh dirinya sendiri.".into(),
                Some(format!("X-Frame-Options: {v}")),
            );
        }
        if low.contains("allow-from") {
            return (
                false,
                "Server membatasi embed ke origin tertentu (ALLOW-FROM).".into(),
                Some(format!("X-Frame-Options: {v}")),
            );
        }
    }
    if let Some(v) = csp {
        let low = v.to_ascii_lowercase();
        if let Some(idx) = low.find("frame-ancestors") {
            let sisa = &low[idx + "frame-ancestors".len()..];
            let daftar = sisa.split(';').next().unwrap_or("").trim().to_string();
            if daftar.contains("'none'") {
                return (
                    false,
                    "CSP frame-ancestors 'none' — embed dilarang.".into(),
                    Some(format!("Content-Security-Policy: frame-ancestors {daftar}")),
                );
            }
            if !daftar.split_whitespace().any(|t| t == "*") {
                return (
                    false,
                    format!("CSP frame-ancestors membatasi ke: {daftar}"),
                    Some(format!("Content-Security-Policy: frame-ancestors {daftar}")),
                );
            }
        }
    }
    (true, "Boleh di-embed".into(), None)
}
