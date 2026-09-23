use crate::errors::{ZResult, ZephyrError};
use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeResult {
    pub url: String,

    pub reachable: bool,
    pub status: Option<u16>,

    pub embeddable: bool,

    pub reason: String,

    pub header: Option<String>,
    pub ms: u64,
}

#[tauri::command(async)]
pub fn browser_probe(url: String) -> ZResult<ProbeResult> {
    let u = url.trim().to_string();
    if !(u.starts_with("http://") || u.starts_with("https://")) {
        return Err(ZephyrError::InvalidInput(
            "URL harus diawali http:// atau https://".into(),
        ));
    }
    let started = std::time::Instant::now();

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
