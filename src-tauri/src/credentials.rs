//! Credential store for user-owned third-party accounts: database passwords,
//! OAuth client secrets, SFTP passphrases.
//!
//! Kept separate from `secrets.json` on purpose. That file holds model API keys
//! and has its own shape; mixing database credentials into it would mean a
//! reset of one clears the other, and neither could be reasoned about alone.
//!
//! Encryption is the same construction as secrets.rs (BLAKE3 stream XOR keyed
//! off MachineGuid + host + user). That is OBFUSCATION, not protection from
//! someone who already holds the Windows account. It stops the file from being
//! useful if it is copied off the machine.

use crate::app_state::AppState;
use crate::errors::{ZResult, ZephyrError};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::path::PathBuf;
use tauri::State;

/// A distinct salt keeps the keystream different from secrets.json, so a value
/// encrypted in one file cannot be transplanted into the other.
const SALT: &str = "zephyr/credentials/v1";

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

fn cred_path(state: &AppState) -> PathBuf {
    state.file("credentials.json")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CredentialInfo {
    pub id: String,
    pub label: String,
    /// `password` | `oauth` | `ssh`
    pub kind: String,
    /// Set once a secret exists, so the UI can show state without the value.
    pub has: bool,
    /// Seconds since epoch, 0 when unknown.
    pub updated_at: u64,
}

/// On-disk shape: metadata in the clear, values encrypted in place. Keeping the
/// metadata readable means the Settings list can render without decrypting
/// every secret on load.
fn baca(state: &AppState) -> Map<String, Value> {
    let Ok(raw) = std::fs::read_to_string(cred_path(state)) else {
        return Map::new();
    };
    if raw.trim().is_empty() {
        return Map::new();
    }
    serde_json::from_str::<Value>(&raw)
        .ok()
        .and_then(|v| v.as_object().cloned())
        .unwrap_or_default()
}

fn tulis(state: &AppState, map: &Map<String, Value>) -> ZResult<()> {
    let path = cred_path(state);
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let teks = serde_json::to_string_pretty(&Value::Object(map.clone()))
        .map_err(|e| ZephyrError::Internal(format!("credentials serialize: {e}")))?;
    std::fs::write(&path, teks).map_err(|e| ZephyrError::Io(format!("credentials write: {e}")))
}

/// Every credential, metadata only. The secret is never returned here.
#[tauri::command(async)]
pub fn credentials_list(state: State<'_, AppState>) -> ZResult<Vec<CredentialInfo>> {
    let map = baca(&state);
    let mut out = Vec::new();
    for (id, v) in map {
        let label = v.get("label").and_then(|x| x.as_str()).unwrap_or(&id).to_string();
        let kind = v.get("kind").and_then(|x| x.as_str()).unwrap_or("password").to_string();
        let updated_at = v.get("updatedAt").and_then(|x| x.as_u64()).unwrap_or(0);
        out.push(CredentialInfo {
            has: v.get("secret").and_then(|x| x.as_str()).is_some_and(|s| !s.is_empty()),
            label,
            kind,
            updated_at,
            id,
        });
    }
    out.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(out)
}

/// Store a secret. `id` is the caller's own key, e.g. `mysql/local`.
#[tauri::command(async)]
pub fn credentials_set(
    state: State<'_, AppState>,
    id: String,
    label: String,
    kind: String,
    secret: String,
) -> ZResult<()> {
    if id.trim().is_empty() {
        return Err(ZephyrError::InvalidInput("credential id is empty".into()));
    }
    let mut map = baca(&state);
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    map.insert(
        id,
        serde_json::json!({
            "label": label,
            "kind": kind,
            "secret": encrypt(&secret),
            "updatedAt": now,
        }),
    );
    tulis(&state, &map)
}

/// Remove a credential entirely.
#[tauri::command(async)]
pub fn credentials_delete(state: State<'_, AppState>, id: String) -> ZResult<()> {
    let mut map = baca(&state);
    map.remove(&id);
    tulis(&state, &map)
}

/// Used by a feature that needs the value (a DB connection, an OAuth refresh).
/// Kept as a command rather than a plain function so a mis-used caller cannot
/// reach it from the frontend without going through the bridge on purpose.
#[tauri::command(async)]
pub fn credentials_get(state: State<'_, AppState>, id: String) -> ZResult<Option<String>> {
    let map = baca(&state);
    let Some(v) = map.get(&id) else { return Ok(None) };
    let Some(enc) = v.get("secret").and_then(|x| x.as_str()) else {
        return Ok(None);
    };
    Ok(decrypt(enc))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bolak_balik_terenkripsi() {
        let asli = "s3cr3t-p@ssword";
        let enc = encrypt(asli);
        assert_ne!(enc, asli, "ciphertext harus beda dari plaintext");
        assert_eq!(decrypt(&enc).as_deref(), Some(asli));
    }

    #[test]
    fn ciphertext_kosong_ditolak() {
        assert!(decrypt("bukan base64 !!").is_none());
    }
}
