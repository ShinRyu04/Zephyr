// github.rs — autentikasi GitHub untuk push/pull HTTPS (fase 10).
//
// Dua metode:
//   1. PAT  — user menempel Personal Access Token; divalidasi ke
//      GET /user sebelum disimpan (401 = tidak menyimpan apa pun).
//   2. OAuth Device Flow — tidak butuh client secret, jadi tidak ada
//      rahasia yang dibundel ke aplikasi. Hanya aktif bila
//      `settings.git.github.clientId` diisi user (buat OAuth App sendiri +
//      aktifkan Device Flow).
//
// PEMISAHAN DATA (invariant §10.3):
//   settings.json → git.github { method, user, scopes, expiresAt, clientId }
//                   (metadata, tidak rahasia)
//   secrets.json  → github { token, refresh }   ← RAHASIA, Rust-only.
// Token TIDAK PERNAH menyeberang IPC ke frontend, tidak masuk argv git,
// tidak masuk remote URL / .git/config, dan tidak ditulis ke log.
//
// Jalur ke git: subcommand `zephyr git-credential` (lihat credential.rs),
// disisipkan per-invocation oleh git.rs — bukan lewat `git config --global`.

use crate::app_state::AppState;
use crate::errors::{ZResult, ZephyrError};
use serde::Serialize;
use serde_json::{json, Value};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};

const API_USER: &str = "https://api.github.com/user";
const DEVICE_CODE_URL: &str = "https://github.com/login/device/code";
const TOKEN_URL: &str = "https://github.com/login/oauth/access_token";
/// Scope minimum agar bisa push ke repo privat.
const SCOPE: &str = "repo read:user";
const UA: &str = "Zephyr-Editor";

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

// ───────────────────────── penyimpanan ─────────────────────────

/// Token aktif (RUST-ONLY). None = belum login.
pub fn active_token(state: &AppState) -> Option<String> {
    let raw = crate::secrets::key_for(state, "github");
    if raw.is_empty() {
        return None;
    }
    // Format lama (hanya token) maupun JSON { token, refresh } didukung.
    match serde_json::from_str::<Value>(&raw) {
        Ok(v) => v
            .get("token")
            .and_then(|t| t.as_str())
            .map(|s| s.to_string())
            .filter(|s| !s.is_empty()),
        Err(_) => Some(raw),
    }
}

fn refresh_token(state: &AppState) -> Option<String> {
    let raw = crate::secrets::key_for(state, "github");
    serde_json::from_str::<Value>(&raw)
        .ok()?
        .get("refresh")
        .and_then(|t| t.as_str())
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
}

fn save_tokens(state: &AppState, token: &str, refresh: Option<&str>) -> ZResult<()> {
    let payload = json!({ "token": token, "refresh": refresh.unwrap_or("") });
    crate::secrets::set_secret(state, "github", &payload.to_string())
}

fn clear_tokens(state: &AppState) -> ZResult<()> {
    crate::secrets::set_secret(state, "github", "")
}

/// Metadata non-rahasia di settings.json → git.github.
fn meta(state: &AppState) -> Value {
    crate::settings::read_settings_value(state)
        .get("git")
        .and_then(|g| g.get("github"))
        .cloned()
        .unwrap_or_else(|| json!({}))
}

fn set_meta(app: &AppHandle, state: &AppState, patch: Value) -> ZResult<()> {
    crate::settings::patch_settings(app, state, json!({ "git": { "github": patch } }))
}

/// Username GitHub yang tercatat (dipakai credential helper).
pub fn stored_user(state: &AppState) -> Option<String> {
    meta(state)
        .get("user")
        .and_then(|u| u.as_str())
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
}

fn client_id(state: &AppState) -> Option<String> {
    meta(state)
        .get("clientId")
        .and_then(|c| c.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

// ───────────────────────── HTTP kecil ─────────────────────────

struct Resp {
    status: u16,
    body: String,
}

fn http_get(url: &str, token: &str) -> ZResult<Resp> {
    let r = ureq::get(url)
        .config()
        .timeout_global(Some(Duration::from_secs(15)))
        .http_status_as_error(false)
        .build()
        .header("Authorization", &format!("Bearer {token}"))
        .header("Accept", "application/vnd.github+json")
        .header("User-Agent", UA)
        .call()
        .map_err(|e| ZephyrError::Git(format!("tidak bisa menghubungi GitHub: {e}")))?;
    let status = r.status().as_u16();
    // Scope dikirim GitHub di header, bukan body.
    let scopes = r
        .headers()
        .get("x-oauth-scopes")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    let mut body = r.into_body();
    let text = body.read_to_string().unwrap_or_default();
    // Sisipkan scope ke body supaya pemanggil tidak perlu tahu soal header.
    let merged = match serde_json::from_str::<Value>(&text) {
        Ok(mut v) => {
            if v.is_object() {
                v["__scopes"] = Value::String(scopes);
            }
            v.to_string()
        }
        Err(_) => text,
    };
    Ok(Resp {
        status,
        body: merged,
    })
}

fn http_post_form(url: &str, form: &[(&str, &str)]) -> ZResult<Resp> {
    let r = ureq::post(url)
        .config()
        .timeout_global(Some(Duration::from_secs(15)))
        .http_status_as_error(false)
        .build()
        .header("Accept", "application/json")
        .header("User-Agent", UA)
        .send_form(form.iter().map(|(k, v)| (*k, *v)))
        .map_err(|e| ZephyrError::Git(format!("tidak bisa menghubungi GitHub: {e}")))?;
    let status = r.status().as_u16();
    let mut body = r.into_body();
    Ok(Resp {
        status,
        body: body.read_to_string().unwrap_or_default(),
    })
}

// ───────────────────────── commands ─────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GhStatus {
    pub signed_in: bool,
    /// "none" | "pat" | "oauth"
    pub method: String,
    pub user: Option<String>,
    pub scopes: Vec<String>,
    /// epoch detik; None = tidak kadaluarsa (PAT klasik)
    pub expires_at: Option<u64>,
    /// true = clientId terisi, tombol OAuth boleh aktif
    pub oauth_configured: bool,
    /// true = token ada tapi sudah lewat expiresAt
    pub expired: bool,
}

#[tauri::command(async)]
pub fn gh_status(state: State<AppState>) -> ZResult<GhStatus> {
    let m = meta(&state);
    let method = m
        .get("method")
        .and_then(|x| x.as_str())
        .unwrap_or("none")
        .to_string();
    let token = active_token(&state);
    let expires_at = m.get("expiresAt").and_then(|x| x.as_u64());
    Ok(GhStatus {
        signed_in: token.is_some() && method != "none",
        method,
        user: stored_user(&state),
        scopes: m
            .get("scopes")
            .and_then(|x| x.as_array())
            .map(|a| {
                a.iter()
                    .filter_map(|s| s.as_str().map(|x| x.to_string()))
                    .collect()
            })
            .unwrap_or_default(),
        expires_at,
        oauth_configured: client_id(&state).is_some(),
        expired: matches!(expires_at, Some(t) if t <= now_secs()),
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GhUser {
    pub user: String,
    pub scopes: Vec<String>,
}

/// Simpan PAT setelah divalidasi ke GitHub. Token salah → tidak menyimpan.
#[tauri::command(async)]
pub fn gh_set_pat(app: AppHandle, state: State<AppState>, token: String) -> ZResult<GhUser> {
    let t = token.trim().to_string();
    if t.is_empty() {
        return Err(ZephyrError::InvalidInput("token kosong".into()));
    }
    let r = http_get(API_USER, &t)?;
    if r.status == 401 {
        return Err(ZephyrError::Git(
            "Token ditolak GitHub (401) — periksa token & masa berlakunya".into(),
        ));
    }
    if r.status != 200 {
        return Err(ZephyrError::Git(format!(
            "GitHub menjawab {} saat memverifikasi token",
            r.status
        )));
    }
    let v: Value = serde_json::from_str(&r.body).unwrap_or_else(|_| json!({}));
    let login = v
        .get("login")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    if login.is_empty() {
        return Err(ZephyrError::Git("GitHub tidak mengirim username".into()));
    }
    let scopes: Vec<String> = v
        .get("__scopes")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

    save_tokens(&state, &t, None)?;
    set_meta(
        &app,
        &state,
        json!({
            "method": "pat",
            "user": login,
            "scopes": scopes,
            // PAT: masa berlaku tidak diketahui dari API → hapus key lama.
            "expiresAt": Value::Null,
        }),
    )?;
    Ok(GhUser {
        user: login,
        scopes,
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceLogin {
    pub user_code: String,
    pub verification_uri: String,
    pub expires_at: u64,
    pub interval: u64,
}

/// Mulai OAuth Device Flow; polling jalan di thread dan mengabarkan hasil
/// lewat event `gh-login`.
#[tauri::command(async)]
pub fn gh_login_device(app: AppHandle, state: State<AppState>) -> ZResult<DeviceLogin> {
    let cid = client_id(&state).ok_or_else(|| {
        ZephyrError::Git(
            "OAuth belum dikonfigurasi — isi Client ID (GitHub OAuth App dengan Device Flow aktif)"
                .into(),
        )
    })?;

    let r = http_post_form(DEVICE_CODE_URL, &[("client_id", &cid), ("scope", SCOPE)])?;
    if r.status != 200 {
        return Err(ZephyrError::Git(format!(
            "GitHub menolak permintaan device code ({})",
            r.status
        )));
    }
    let v: Value = serde_json::from_str(&r.body).unwrap_or_else(|_| json!({}));
    if let Some(err) = v.get("error").and_then(|e| e.as_str()) {
        let hint = if err == "unauthorized_client" {
            " — aktifkan \"Device flow\" di setelan OAuth App"
        } else {
            ""
        };
        return Err(ZephyrError::Git(format!("GitHub: {err}{hint}")));
    }
    let device_code = v
        .get("device_code")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    let user_code = v
        .get("user_code")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    let verification_uri = v
        .get("verification_uri")
        .and_then(|x| x.as_str())
        .unwrap_or("https://github.com/login/device")
        .to_string();
    let interval = v
        .get("interval")
        .and_then(|x| x.as_u64())
        .unwrap_or(5)
        .max(1);
    let expires_in = v.get("expires_in").and_then(|x| x.as_u64()).unwrap_or(900);
    if device_code.is_empty() || user_code.is_empty() {
        return Err(ZephyrError::Git("GitHub tidak mengirim device code".into()));
    }

    let handle = app.clone();
    let deadline = now_secs() + expires_in;
    std::thread::spawn(move || {
        let emit = |state: &str, message: &str| {
            let _ = handle.emit("gh-login", json!({ "state": state, "message": message }));
        };
        emit("pending", "Menunggu persetujuan di browser…");

        loop {
            std::thread::sleep(Duration::from_secs(interval));
            if now_secs() > deadline {
                emit("error", "Kode kadaluarsa — ulangi Sign in");
                return;
            }
            let res = http_post_form(
                TOKEN_URL,
                &[
                    ("client_id", &cid),
                    ("device_code", &device_code),
                    ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
                ],
            );
            let body = match res {
                Ok(r) => r.body,
                Err(e) => {
                    emit("error", &e.to_string());
                    return;
                }
            };
            let v: Value = serde_json::from_str(&body).unwrap_or_else(|_| json!({}));
            if let Some(err) = v.get("error").and_then(|e| e.as_str()) {
                match err {
                    // Belum di-approve / diminta melambat: lanjut polling.
                    "authorization_pending" => continue,
                    "slow_down" => {
                        std::thread::sleep(Duration::from_secs(interval + 5));
                        continue;
                    }
                    "expired_token" => {
                        emit("error", "Kode kadaluarsa — ulangi Sign in");
                        return;
                    }
                    "access_denied" => {
                        emit("error", "Permintaan ditolak di GitHub");
                        return;
                    }
                    other => {
                        emit("error", &format!("GitHub: {other}"));
                        return;
                    }
                }
            }
            let token = v
                .get("access_token")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string();
            if token.is_empty() {
                emit("error", "GitHub tidak mengirim access token");
                return;
            }
            let refresh = v
                .get("refresh_token")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string();
            let expires_in = v.get("expires_in").and_then(|x| x.as_u64());

            // Ambil username + scope dengan token baru.
            let (login, scopes) = match http_get(API_USER, &token) {
                Ok(u) if u.status == 200 => {
                    let uv: Value = serde_json::from_str(&u.body).unwrap_or_else(|_| json!({}));
                    let login = uv
                        .get("login")
                        .and_then(|x| x.as_str())
                        .unwrap_or("")
                        .to_string();
                    let sc: Vec<String> = uv
                        .get("__scopes")
                        .and_then(|x| x.as_str())
                        .unwrap_or("")
                        .split(',')
                        .map(|s| s.trim().to_string())
                        .filter(|s| !s.is_empty())
                        .collect();
                    (login, sc)
                }
                _ => (String::new(), vec![]),
            };

            let st = handle.state::<AppState>();
            if save_tokens(&st, &token, Some(&refresh)).is_err() {
                emit("error", "Gagal menyimpan token");
                return;
            }
            let expires_at = expires_in.map(|s| now_secs() + s);
            let _ = set_meta(
                &handle,
                &st,
                json!({
                    "method": "oauth",
                    "user": login,
                    "scopes": scopes,
                    "expiresAt": expires_at.map(Value::from).unwrap_or(Value::Null),
                }),
            );
            emit(
                "success",
                if login.is_empty() {
                    "Login berhasil"
                } else {
                    &login
                },
            );
            return;
        }
    });

    Ok(DeviceLogin {
        user_code,
        verification_uri,
        expires_at: deadline,
        interval,
    })
}

#[tauri::command(async)]
pub fn gh_logout(app: AppHandle, state: State<AppState>) -> ZResult<()> {
    clear_tokens(&state)?;
    set_meta(
        &app,
        &state,
        json!({
            "method": "none",
            "user": Value::Null,
            "scopes": [],
            "expiresAt": Value::Null,
        }),
    )
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GhTest {
    pub ok: bool,
    pub user: Option<String>,
    pub message: String,
    pub status: Option<u16>,
}

#[tauri::command(async)]
pub fn gh_test(state: State<AppState>) -> ZResult<GhTest> {
    let token = match active_token(&state) {
        Some(t) => t,
        None => {
            return Ok(GhTest {
                ok: false,
                user: None,
                message: "Belum login GitHub".into(),
                status: None,
            })
        }
    };
    let r = http_get(API_USER, &token)?;
    let v: Value = serde_json::from_str(&r.body).unwrap_or_else(|_| json!({}));
    let login = v
        .get("login")
        .and_then(|x| x.as_str())
        .map(|s| s.to_string());
    Ok(GhTest {
        ok: r.status == 200,
        user: login.clone(),
        message: match r.status {
            200 => format!("OK — @{}", login.clone().unwrap_or_default()),
            401 => "Token ditolak (401) — login ulang".into(),
            403 => "Ditolak (403) — cek scope token".into(),
            s => format!("GitHub menjawab {s}"),
        },
        status: Some(r.status),
    })
}

/// Refresh token OAuth saat operasi git kena 401. true = token diperbarui.
/// PAT tidak bisa di-refresh (selalu false).
pub fn try_refresh(state: &AppState) -> bool {
    let m = meta(state);
    if m.get("method").and_then(|x| x.as_str()) != Some("oauth") {
        return false;
    }
    let (Some(cid), Some(rt)) = (client_id(state), refresh_token(state)) else {
        return false;
    };
    let r = http_post_form(
        TOKEN_URL,
        &[
            ("client_id", &cid),
            ("grant_type", "refresh_token"),
            ("refresh_token", &rt),
        ],
    );
    let body = match r {
        Ok(x) => x.body,
        Err(_) => return false,
    };
    let v: Value = serde_json::from_str(&body).unwrap_or_else(|_| json!({}));
    let token = v.get("access_token").and_then(|x| x.as_str()).unwrap_or("");
    if token.is_empty() {
        return false;
    }
    let refresh = v
        .get("refresh_token")
        .and_then(|x| x.as_str())
        .unwrap_or(&rt)
        .to_string();
    if save_tokens(state, token, Some(&refresh)).is_err() {
        return false;
    }
    // expiresAt diperbarui lewat file settings langsung (tanpa AppHandle di
    // jalur ini) — cukup metadata, bukan rahasia.
    if let Some(exp) = v.get("expires_in").and_then(|x| x.as_u64()) {
        let _ = crate::settings::patch_settings_no_emit(
            state,
            json!({ "git": { "github": { "expiresAt": now_secs() + exp } } }),
        );
    }
    true
}
