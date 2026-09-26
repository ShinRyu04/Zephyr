use crate::app_state::AppState;
use crate::errors::{ZResult, ZephyrError};
use serde::Serialize;
use serde_json::{json, Map, Value};
use std::path::PathBuf;
use tauri::State;

const SALT: &str = "zephyr/secrets/v1";

fn machine_seed() -> String {
    let name = std::env::var("COMPUTERNAME").unwrap_or_else(|_| "unknown-host".into());
    let user = std::env::var("USERNAME").unwrap_or_else(|_| "unknown-user".into());

    let mut reg = crate::proc::cmd("reg");
    reg.args([
        "query",
        r"HKLM\SOFTWARE\Microsoft\Cryptography",
        "/v",
        "MachineGuid",
    ]);
    let guid = reg
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .and_then(|s| {
            s.split_whitespace()
                .last()
                .map(|x| x.trim().to_string())
                .filter(|x| x.len() > 8)
        })
        .unwrap_or_else(|| "no-guid".into());

    format!("{SALT}|{guid}|{name}|{user}")
}

fn keystream(len: usize) -> Vec<u8> {
    let mut out = vec![0u8; len];
    blake3::Hasher::new()
        .update(machine_seed().as_bytes())
        .finalize_xof()
        .fill(&mut out);
    out
}

fn xor_crypt(data: &[u8]) -> Vec<u8> {
    let ks = keystream(data.len());
    data.iter().zip(ks).map(|(b, k)| b ^ k).collect()
}

fn encrypt(plain: &str) -> String {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(xor_crypt(plain.as_bytes()))
}

fn decrypt(enc: &str) -> Option<String> {
    use base64::Engine;
    let raw = base64::engine::general_purpose::STANDARD.decode(enc).ok()?;
    String::from_utf8(xor_crypt(&raw)).ok()
}

pub fn encrypt_string(plain: &str) -> String {
    encrypt(plain)
}

#[allow(dead_code)]
pub fn decrypt_string(enc: &str) -> Option<String> {
    decrypt(enc)
}

fn secrets_path(state: &AppState) -> PathBuf {
    state.file("secrets.json")
}

fn baca_mentah(state: &AppState) -> Option<(String, Map<String, Value>)> {
    let path = secrets_path(state);
    let raw = std::fs::read_to_string(&path).ok()?;
    if raw.trim().is_empty() {
        return Some((raw, Map::new()));
    }
    match serde_json::from_str::<Value>(&raw) {
        Ok(Value::Object(o)) => Some((raw, o)),
        _ => None,
    }
}

fn read_secrets(state: &AppState) -> Map<String, Value> {
    baca_mentah(state).map(|(_, m)| m).unwrap_or_default()
}

fn map_untuk_tulis(state: &AppState) -> ZResult<Map<String, Value>> {
    let path = secrets_path(state);
    if !path.exists() {
        return Ok(Map::new());
    }
    match baca_mentah(state) {
        Some((_, m)) => Ok(m),
        None => {
            if let Ok(raw) = std::fs::read_to_string(&path) {
                backup_sekali(state, &raw);
            }
            Err(ZephyrError::Internal(
                "secrets.json ada tapi tidak terbaca (kunci mesin mungkin berubah). \
                 File lama dibiarkan utuh dan dicadangkan ke secrets.json.bak-*. \
                 Isi ulang API key untuk melanjutkan."
                    .into(),
            ))
        }
    }
}

fn backup_sekali(state: &AppState, raw: &str) {
    let path = secrets_path(state);
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let mut b = path.clone();
    b.set_file_name(format!("secrets.json.bak-{stamp}"));
    let _ = std::fs::write(&b, raw);
}

fn write_secrets(state: &AppState, map: &Map<String, Value>) -> ZResult<()> {
    let path = secrets_path(state);
    if let Some(p) = path.parent() {
        std::fs::create_dir_all(p)?;
    }
    let bytes = serde_json::to_vec_pretty(&Value::Object(map.clone()))?;
    let mut tmp = path.clone();
    let nama = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "secrets.json".into());
    tmp.set_file_name(format!("{nama}.tmp-{}", std::process::id()));
    std::fs::write(&tmp, &bytes)?;
    match std::fs::rename(&tmp, &path) {
        Ok(()) => Ok(()),
        Err(e) => {
            let _ = std::fs::remove_file(&tmp);
            Err(ZephyrError::Internal(format!("gagal menyimpan secrets: {e}")))
        }
    }
}

fn preview(key: &str) -> String {
    let n = key.chars().count();
    if n <= 8 {
        return "•".repeat(n.max(3));
    }
    let head: String = key.chars().take(4).collect();
    let tail: String = key.chars().skip(n - 4).collect();
    format!("{head}…{tail}")
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicModel {
    pub provider: String,
    pub has_key: bool,

    pub preview: String,
}

const KNOWN_PROVIDERS: [&str; 6] = [
    "gemini",
    "openai",
    "anthropic",
    "deepseek",
    "local",
    "custom",
];

#[tauri::command(async)]
pub fn get_public_models(state: State<AppState>) -> ZResult<Vec<PublicModel>> {
    let secrets = read_secrets(&state);

    let mut names: Vec<String> = KNOWN_PROVIDERS.iter().map(|s| s.to_string()).collect();
    for k in secrets.keys() {
        if !names.iter().any(|n| n == k) {
            names.push(k.clone());
        }
    }

    let mut out: Vec<PublicModel> = names
        .into_iter()
        .map(|provider| {
            let plain = secrets
                .get(&provider)
                .and_then(|v| v.as_str())
                .and_then(decrypt)
                .unwrap_or_default();
            PublicModel {
                provider,
                has_key: !plain.is_empty(),
                preview: if plain.is_empty() {
                    String::new()
                } else {
                    preview(&plain)
                },
            }
        })
        .collect();
    out.sort_by(|a, b| a.provider.cmp(&b.provider));
    Ok(out)
}

pub fn key_for(state: &AppState, provider: &str) -> String {
    read_secrets(state)
        .get(provider.trim())
        .and_then(|v| v.as_str())
        .and_then(decrypt)
        .unwrap_or_default()
}

pub fn set_secret(state: &AppState, name: &str, value: &str) -> ZResult<()> {
    let n = name.trim();
    if n.is_empty() {
        return Err(ZephyrError::InvalidInput("nama secret kosong".into()));
    }
    let mut map = map_untuk_tulis(state)?;
    if value.trim().is_empty() {
        map.remove(n);
    } else {
        map.insert(n.to_string(), Value::String(encrypt(value.trim())));
    }
    write_secrets(state, &map)
}

#[tauri::command(async)]
pub fn set_model_key(state: State<AppState>, provider: String, key: String) -> ZResult<()> {
    let p = provider.trim();
    if p.is_empty() {
        return Err(ZephyrError::InvalidInput("provider kosong".into()));
    }
    let mut map = map_untuk_tulis(&state)?;
    if key.trim().is_empty() {
        map.remove(p);
    } else {
        map.insert(p.to_string(), Value::String(encrypt(key.trim())));
    }
    write_secrets(&state, &map)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestResult {
    pub ok: bool,
    pub message: String,
    pub status: Option<u16>,
    pub ms: u64,
}

#[tauri::command(async)]
pub fn test_model_connection(
    state: State<AppState>,
    provider: String,
    base_url: Option<String>,
) -> ZResult<TestResult> {
    let secrets = read_secrets(&state);
    let key = secrets
        .get(provider.trim())
        .and_then(|v| v.as_str())
        .and_then(decrypt)
        .unwrap_or_default();

    if key.is_empty() {
        return Ok(TestResult {
            ok: false,
            message: "Belum ada API key untuk provider ini".into(),
            status: None,
            ms: 0,
        });
    }

    let (url, header, value) = match provider.trim() {
        "gemini" => (
            format!(
                "{}/v1beta/models",
                base_url
                    .clone()
                    .unwrap_or_else(|| "https://generativelanguage.googleapis.com".into())
                    .trim_end_matches('/')
            ),
            "x-goog-api-key",
            key.clone(),
        ),
        "anthropic" => (
            format!(
                "{}/v1/models",
                base_url
                    .clone()
                    .unwrap_or_else(|| "https://api.anthropic.com".into())
                    .trim_end_matches('/')
            ),
            "x-api-key",
            key.clone(),
        ),

        other => (
            format!(
                "{}/models",
                base_url
                    .clone()
                    .unwrap_or_else(|| match other {
                        "deepseek" => "https://api.deepseek.com/v1".into(),
                        "xai" => "https://api.x.ai/v1".into(),
                        "lmstudio" => "http://127.0.0.1:1234/v1".into(),
                        _ => "https://api.openai.com/v1".to_string(),
                    })
                    .trim_end_matches('/')
            ),
            "Authorization",
            format!("Bearer {key}"),
        ),
    };

    let started = std::time::Instant::now();

    let mut req = ureq::get(&url)
        .config()
        .timeout_global(Some(std::time::Duration::from_secs(8)))
        .build()
        .header(header, &value);
    if provider.trim() == "anthropic" {
        req = req.header("anthropic-version", "2023-06-01");
    }

    let (ok, status, message) = match req.call() {
        Ok(r) => (true, Some(r.status().as_u16()), "Koneksi OK".to_string()),
        Err(ureq::Error::StatusCode(code)) => (
            false,
            Some(code),
            match code {
                401 | 403 => "API key ditolak (401/403) — periksa key".to_string(),
                404 => "Endpoint tidak ditemukan (404) — periksa base URL".to_string(),
                429 => "Rate limit (429) — key valid tapi sedang dibatasi".to_string(),
                c => format!("Server menjawab {c}"),
            },
        ),
        Err(e) => (false, None, format!("Tidak bisa menghubungi server: {e}")),
    };

    Ok(TestResult {
        ok,
        message,
        status,
        ms: started.elapsed().as_millis() as u64,
    })
}

#[tauri::command(async)]
pub fn list_models(
    state: State<AppState>,
    provider: String,
    base_url: Option<String>,
) -> ZResult<Vec<String>> {
    let key = key_for(&state, &provider);
    if key.is_empty() {
        return Err(ZephyrError::InvalidInput(format!(
            "Belum ada API key untuk {provider} — isi di Settings → Model AI"
        )));
    }

    let (url, header, value, style) = match provider.trim() {
        "gemini" => (
            format!(
                "{}/v1beta/models",
                base_url
                    .clone()
                    .unwrap_or_else(|| "https://generativelanguage.googleapis.com".into())
                    .trim_end_matches('/')
            ),
            "x-goog-api-key",
            key.clone(),
            "gemini",
        ),
        "anthropic" => (
            format!(
                "{}/v1/models",
                base_url
                    .clone()
                    .unwrap_or_else(|| "https://api.anthropic.com".into())
                    .trim_end_matches('/')
            ),
            "x-api-key",
            key.clone(),
            "openai",
        ),
        other => (
            format!(
                "{}/models",
                base_url
                    .clone()
                    .unwrap_or_else(|| match other {
                        "deepseek" => "https://api.deepseek.com/v1".into(),
                        _ => "https://api.openai.com/v1".to_string(),
                    })
                    .trim_end_matches('/')
            ),
            "Authorization",
            format!("Bearer {key}"),
            "openai",
        ),
    };

    let mut req = ureq::get(&url)
        .config()
        .timeout_global(Some(std::time::Duration::from_secs(8)))
        .build()
        .header(header, &value);
    if provider.trim() == "anthropic" {
        req = req.header("anthropic-version", "2023-06-01");
    }

    let body = req.call().map_err(|e| match e {
        ureq::Error::StatusCode(code) => {
            ZephyrError::InvalidInput(format!("Server menjawab {code} — cek key & base URL"))
        }
        e => ZephyrError::InvalidInput(format!("Tidak bisa menghubungi server: {e}")),
    })?;

    let json: serde_json::Value = serde_json::from_str(
        &body
            .into_body()
            .read_to_string()
            .map_err(|e| ZephyrError::InvalidInput(format!("Gagal baca respon: {e}")))?,
    )
    .map_err(|e| ZephyrError::InvalidInput(format!("Respon bukan JSON: {e}")))?;

    let ids: Vec<String> = if style == "gemini" {
        json.get("models")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|m| m.get("name").and_then(|n| n.as_str()))
                    .map(|n| n.strip_prefix("models/").unwrap_or(n).to_string())
                    .collect()
            })
            .unwrap_or_default()
    } else {
        json.get("data")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|m| m.get("id").and_then(|n| n.as_str()))
                    .map(|s| s.to_string())
                    .collect()
            })
            .unwrap_or_default()
    };

    Ok(ids)
}

#[tauri::command(async)]
pub fn reset_settings(app: tauri::AppHandle, state: State<AppState>) -> ZResult<()> {
    use tauri::Emitter;
    let path = state.file("settings.json");
    if path.exists() {
        std::fs::remove_file(&path)?;
    }
    let _ = app.emit("settings-changed", json!({ "key": "*" }));
    Ok(())
}

#[cfg(test)]
pub fn roundtrip_for_test(plain: &str) -> (String, Option<String>) {
    let enc = encrypt(plain);
    (enc.clone(), decrypt(&enc))
}

#[cfg(test)]
pub fn preview_for_test(key: &str) -> String {
    preview(key)
}
