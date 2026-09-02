// secrets.rs — penyimpanan API key provider AI (fase 08).
//
// ATURAN KEAMANAN (AGENTS.md §4 & §7):
//   * apiKey TIDAK PERNAH dikirim utuh ke frontend. Frontend hanya melihat
//     `hasKey` + `preview` (mis. "sk-…4f2a").
//   * key TIDAK ditulis ke settings.json (file itu ikut dibaca/di-share);
//     disimpan terpisah di %APPDATA%\zephyr\secrets.json.
//   * key TIDAK pernah masuk log / pesan error.
//
// Enkripsi: XOR stream dengan kunci turunan BLAKE3 dari (machine GUID +
// nama komputer + salt aplikasi). Ini OBFUSKASI, bukan proteksi terhadap
// penyerang yang sudah memegang akun Windows-mu — dan itu memang batas
// yang realistis untuk app desktop tanpa credential store OS. Disebutkan
// apa adanya di UI Settings.

use crate::app_state::AppState;
use crate::errors::{ZResult, ZephyrError};
use serde::Serialize;
use serde_json::{json, Map, Value};
use std::path::PathBuf;
use tauri::State;

const SALT: &str = "zephyr/secrets/v1";

/// Bahan kunci yang stabil di satu mesin.
fn machine_seed() -> String {
    let name = std::env::var("COMPUTERNAME").unwrap_or_else(|_| "unknown-host".into());
    let user = std::env::var("USERNAME").unwrap_or_else(|_| "unknown-user".into());
    // MachineGuid: identitas instalasi Windows. Kalau gagal dibaca, tetap
    // jalan dengan bahan lain (jangan sampai fitur mati total).
    let guid = std::process::Command::new("reg")
        .args([
            "query",
            r"HKLM\SOFTWARE\Microsoft\Cryptography",
            "/v",
            "MachineGuid",
        ])
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
    // BLAKE3 XOF: hasilkan byte sebanyak yang dibutuhkan.
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

fn secrets_path(state: &AppState) -> PathBuf {
    state.file("secrets.json")
}

fn read_secrets(state: &AppState) -> Map<String, Value> {
    std::fs::read_to_string(secrets_path(state))
        .ok()
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        .and_then(|v| v.as_object().cloned())
        .unwrap_or_default()
}

fn write_secrets(state: &AppState, map: &Map<String, Value>) -> ZResult<()> {
    let path = secrets_path(state);
    if let Some(p) = path.parent() {
        std::fs::create_dir_all(p)?;
    }
    std::fs::write(
        path,
        serde_json::to_vec_pretty(&Value::Object(map.clone()))?,
    )?;
    Ok(())
}

/// Mask key untuk ditampilkan: 4 karakter awal + 4 akhir.
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
    /// masked, mis. "sk-a…4f2a". Kosong bila belum ada key.
    pub preview: String,
}

/// Provider yang selalu dilaporkan walau belum punya key, supaya frontend
/// mendapat jawaban pasti (`hasKey: false`) alih-alih entri yang hilang.
/// Harus sinkron dengan katalog di src/lib/modelCatalog.tsx.
const KNOWN_PROVIDERS: [&str; 6] = [
    "gemini",
    "openai",
    "anthropic",
    "deepseek",
    "local",
    "custom",
];

/// Daftar provider + status key (TANPA key asli).
#[tauri::command(async)]
pub fn get_public_models(state: State<AppState>) -> ZResult<Vec<PublicModel>> {
    let secrets = read_secrets(&state);

    // Gabungkan katalog bawaan dengan provider tambahan yang ada di file.
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

/// Ambil key satu provider untuk dipakai DI DALAM Rust (fase 09: ai.rs).
/// Sengaja tidak `pub` sebagai command: nilainya tidak boleh keluar ke
/// frontend. Kosong = belum ada key.
pub fn key_for(state: &AppState, provider: &str) -> String {
    read_secrets(state)
        .get(provider.trim())
        .and_then(|v| v.as_str())
        .and_then(decrypt)
        .unwrap_or_default()
}

/// Simpan/ganti satu secret dari dalam Rust (fase 10: token GitHub).
/// Nilai kosong = hapus. TIDAK ada command Tauri yang membaca kembali
/// nilainya — hanya `key_for` di dalam proses.
pub fn set_secret(state: &AppState, name: &str, value: &str) -> ZResult<()> {
    let n = name.trim();
    if n.is_empty() {
        return Err(ZephyrError::InvalidInput("nama secret kosong".into()));
    }
    let mut map = read_secrets(state);
    if value.trim().is_empty() {
        map.remove(n);
    } else {
        map.insert(n.to_string(), Value::String(encrypt(value.trim())));
    }
    write_secrets(state, &map)
}

/// Simpan/ganti key satu provider. `key` kosong = hapus.
#[tauri::command(async)]
pub fn set_model_key(state: State<AppState>, provider: String, key: String) -> ZResult<()> {
    let p = provider.trim();
    if p.is_empty() {
        return Err(ZephyrError::InvalidInput("provider kosong".into()));
    }
    let mut map = read_secrets(&state);
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

/// Uji koneksi ke provider: panggil endpoint daftar model dengan key
/// tersimpan. TIDAK pernah menyertakan key di pesan hasil.
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

    // Endpoint "list models" tiap provider + cara mengirim key.
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
        // openai / deepseek / custom: OpenAI-compatible
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
        ),
    };

    let started = std::time::Instant::now();

    // ureq 3: header() chainable, call() -> Result<Response, Error>;
    // status 4xx/5xx datang sebagai Error::StatusCode (default behaviour).
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
        Err(e) => (
            false,
            None,
            // Pesan transport aman ditampilkan: tidak memuat key.
            format!("Tidak bisa menghubungi server: {e}"),
        ),
    };

    Ok(TestResult {
        ok,
        message,
        status,
        ms: started.elapsed().as_millis() as u64,
    })
}

/// Hapus settings.json (Reset Semua ke Default). secrets.json TIDAK
/// disentuh: API key bukan "setting" dan menghapusnya diam-diam berbahaya.
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
