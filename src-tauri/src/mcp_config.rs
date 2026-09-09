// mcp_config.rs — mcp.json (%APPDATA%\zephyr\mcp.json) + penulisan config CLI.
//
// mcp.json memegang token yang di-generate SEKALI saat pertama dipakai, jadi
// AI CLI yang sudah didaftari tidak kehilangan akses tiap restart. Token
// TIDAK ditaruh di settings.json karena file itu wajar di-share/di-backup.
//
// writeToCli: menambah entri server ke config AI CLI milik user. Aturan
// keras: JSON existing di-parse lalu di-merge (key lain tidak boleh rusak),
// dan file lama selalu disalin ke <nama>.bak sebelum ditulis.

use crate::app_state::AppState;
use crate::errors::{ZResult, ZephyrError};
use serde::Serialize;
use serde_json::{json, Value};
use std::path::PathBuf;

/// Isi mcp.json.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpConfig {
    pub token: String,
    /// Port yang benar-benar dipakai terakhir kali (9222, atau fallback).
    pub port: u16,
}

fn path(state: &AppState) -> PathBuf {
    state.file("mcp.json")
}

/// Token acak 32 hex (16 byte) — cukup untuk penjaga loopback.
fn random_token() -> String {
    // Sumber acak tanpa dependensi baru: waktu nano + alamat stack + pid,
    // di-hash BLAKE3. Bukan CSPRNG OS, tapi tidak bisa ditebak dari luar
    // proses dan token ini hanya menjaga port loopback.
    let mut h = blake3::Hasher::new();
    h.update(b"zephyr/mcp/token/v1");
    h.update(&std::process::id().to_le_bytes());
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    h.update(&now.to_le_bytes());
    let stack_marker = 0u8;
    h.update(&(&stack_marker as *const u8 as usize).to_le_bytes());
    h.finalize().to_hex()[..32].to_string()
}

/// Baca mcp.json; buat + tulis bila belum ada (token di-generate sekali).
pub fn load_or_init(state: &AppState) -> McpConfig {
    let p = path(state);
    let existing: Option<Value> = std::fs::read_to_string(&p)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok());

    let token = existing
        .as_ref()
        .and_then(|v| v.get("token"))
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| s.len() >= 16)
        .unwrap_or_else(random_token);

    let port = existing
        .as_ref()
        .and_then(|v| v.get("port"))
        .and_then(|v| v.as_u64())
        .and_then(|n| u16::try_from(n).ok())
        .filter(|n| *n >= 1024)
        .unwrap_or(9222);

    let cfg = McpConfig { token, port };
    let _ = save(state, &cfg);
    cfg
}

pub fn save(state: &AppState, cfg: &McpConfig) -> ZResult<()> {
    let p = path(state);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(
        &p,
        serde_json::to_vec_pretty(&json!({ "token": cfg.token, "port": cfg.port }))?,
    )?;
    Ok(())
}

/// Token baru (tombol "Regenerate" di panel MCP).
pub fn rotate_token(state: &AppState) -> ZResult<McpConfig> {
    let mut cfg = load_or_init(state);
    cfg.token = random_token();
    save(state, &cfg)?;
    Ok(cfg)
}

// ───────────────────── config AI CLI ─────────────────────

/// Satu target penulisan config.
pub struct CliTarget {
    pub id: &'static str,
    pub label: &'static str,
    /// Path relatif dari %USERPROFILE% (atau absolut bila diawali drive).
    pub rel: &'static str,
    /// Format file: json | toml | yaml
    pub format: Format,
    /// Key induk tempat server MCP didaftarkan.
    pub key: &'static str,
}

#[derive(PartialEq, Eq)]
pub enum Format {
    Json,
    Toml,
    /// Hermes Agent (Nous Research) memakai ~/.hermes/config.yaml
    /// dengan blok `mcp_servers:` (YAML) — fase 35a.
    Yaml,
}

/// Daftar CLI yang didukung (ARCHITECTURE.md §4 / prompt fase 11 §11.4).
pub const TARGETS: [CliTarget; 8] = [
    CliTarget {
        id: "claude",
        label: "Claude Code",
        rel: ".claude.json",
        format: Format::Json,
        key: "mcpServers",
    },
    CliTarget {
        id: "codex",
        label: "Codex CLI",
        rel: ".codex/config.toml",
        format: Format::Toml,
        key: "mcp_servers",
    },
    CliTarget {
        id: "gemini",
        label: "Gemini CLI",
        rel: ".gemini/settings.json",
        format: Format::Json,
        key: "mcpServers",
    },
    CliTarget {
        id: "opencode",
        label: "opencode",
        rel: ".config/opencode/opencode.json",
        format: Format::Json,
        key: "mcp",
    },
    CliTarget {
        id: "hermes",
        label: "Hermes Agent",
        rel: ".hermes/config.yaml",
        format: Format::Yaml,
        key: "mcp_servers",
    },
    CliTarget {
        id: "copilot",
        label: "GitHub Copilot CLI",
        rel: ".copilot/mcp-config.json",
        format: Format::Json,
        key: "mcpServers",
    },
    CliTarget {
        id: "cursor",
        label: "Cursor",
        rel: ".cursor/mcp.json",
        format: Format::Json,
        key: "mcpServers",
    },
    CliTarget {
        id: "startup",
        label: "Startup/.mcp.json",
        rel: "Startup/.mcp.json",
        format: Format::Json,
        key: "mcpServers",
    },
];

pub fn target(id: &str) -> Option<&'static CliTarget> {
    TARGETS.iter().find(|t| t.id == id)
}

fn home() -> ZResult<PathBuf> {
    std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map(PathBuf::from)
        .map_err(|_| ZephyrError::Internal("USERPROFILE tidak ada".into()))
}

pub fn target_path(t: &CliTarget) -> ZResult<PathBuf> {
    Ok(home()?.join(t.rel.replace('/', std::path::MAIN_SEPARATOR_STR)))
}

/// Entri server yang ditulis ke config CLI.
fn server_entry(port: u16, token: &str) -> Value {
    json!({
        "type": "http",
        "url": format!("http://127.0.0.1:{port}"),
        "headers": { "Authorization": format!("Bearer {token}") }
    })
}

/// Hasil satu operasi tulis/hapus config CLI (dilaporkan ke UI).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliWriteResult {
    pub id: String,
    pub label: String,
    pub path: String,
    pub ok: bool,
    /// true = file lama disalin ke <nama>.bak
    pub backup: bool,
    pub message: String,
}

fn backup_file(p: &std::path::Path) -> bool {
    if !p.exists() {
        return false;
    }
    let bak = p.with_file_name(format!(
        "{}.bak",
        p.file_name()
            .map(|x| x.to_string_lossy().to_string())
            .unwrap_or_default()
    ));
    std::fs::copy(p, bak).is_ok()
}

/// Sisipkan `zephyr` ke dalam key induk TANPA merusak key lain.
fn merge_json(existing: &str, key: &str, entry: Value) -> ZResult<String> {
    let mut root: Value = if existing.trim().is_empty() {
        json!({})
    } else {
        serde_json::from_str(existing)
            .map_err(|e| ZephyrError::InvalidInput(format!("config bukan JSON valid: {e}")))?
    };
    if !root.is_object() {
        return Err(ZephyrError::InvalidInput(
            "config teratas bukan object".into(),
        ));
    }
    let obj = root.as_object_mut().unwrap();
    let slot = obj.entry(key.to_string()).or_insert_with(|| json!({}));
    if !slot.is_object() {
        *slot = json!({});
    }
    slot.as_object_mut().unwrap().insert("zephyr".into(), entry);
    Ok(serde_json::to_string_pretty(&root)? + "\n")
}

/// Buang key `zephyr` dari config; key lain dibiarkan utuh.
fn unmerge_json(existing: &str, key: &str) -> ZResult<String> {
    let mut root: Value = serde_json::from_str(existing)
        .map_err(|e| ZephyrError::InvalidInput(format!("config bukan JSON valid: {e}")))?;
    if let Some(obj) = root.as_object_mut() {
        if let Some(slot) = obj.get_mut(key).and_then(|v| v.as_object_mut()) {
            slot.remove("zephyr");
        }
    }
    Ok(serde_json::to_string_pretty(&root)? + "\n")
}

/// Codex memakai TOML. Tanpa dependensi toml: tabel `[mcp_servers.zephyr]`
/// ditulis/diganti sebagai blok teks — cukup dan tidak menyentuh baris lain.
fn merge_toml(existing: &str, key: &str, port: u16, token: &str) -> String {
    let header = format!("[{key}.zephyr]");
    let block = format!(
        "{header}\ntype = \"http\"\nurl = \"http://127.0.0.1:{port}\"\n\
         [{key}.zephyr.headers]\nAuthorization = \"Bearer {token}\"\n",
    );
    let cleaned = strip_toml_block(existing, key);
    if cleaned.trim().is_empty() {
        block
    } else {
        format!("{}\n{block}", cleaned.trim_end())
    }
}

/// Hermes Agent memakai YAML (~/.hermes/config.yaml). Tanpa dependensi yaml:
/// blok `mcp_servers.zephyr:` ditulis/diganti sebagai teks ber-indent — cukup
/// dan tidak menyentuh baris lain (sama prinsipnya seperti TOML di atas).
fn merge_yaml(existing: &str, key: &str, port: u16, token: &str) -> String {
    let block = format!(
        "{key}:\n  zephyr:\n    type: http\n    url: \"http://127.0.0.1:{port}\"\n    headers:\n      Authorization: \"Bearer {token}\"\n",
    );
    let cleaned = strip_yaml_block(existing, key);
    if cleaned.trim().is_empty() {
        block
    } else {
        format!("{}\n{block}", cleaned.trim_end())
    }
}

/// Hapus blok `<key>` → `zephyr:` dari YAML (indent 2 di bawah key induk).
/// YAML pakai indent, jadi dicari: baris `key:` di kolom 0, lalu anak
/// `zephyr:` di indent 2 — baris setelahnya ikut dihapus sampai indent
/// kembali <= 2 atau keluar dari blok induk.
fn strip_yaml_block(existing: &str, key: &str) -> String {
    let mut out: Vec<&str> = Vec::new();
    let mut in_parent = false; // sedang di dalam blok `key:`
    let mut skipping = false; // sedang melewati blok `zephyr:`
    for line in existing.lines() {
        let indent = line.len() - line.trim_start().len();
        let t = line.trim_start();
        if t.is_empty() || t.starts_with('#') {
            if !skipping {
                out.push(line);
            }
            continue;
        }
        // Top-level: cari `key:` di kolom 0.
        if indent == 0 {
            in_parent = t == format!("{key}:") || t.starts_with(&format!("{key}: "));
            skipping = false;
            out.push(line);
            continue;
        }
        if !in_parent {
            out.push(line);
            continue;
        }
        // Di dalam `key:` — anak level-1 (indent 2) menentukan blok mana.
        if indent <= 2 {
            skipping = t.starts_with("zephyr:") || t.starts_with("zephyr: ");
            if !skipping {
                out.push(line);
            }
            continue;
        }
        // Anak level > 2 (isi blok) — ikut dihapus bila sedang skip.
        if !skipping {
            out.push(line);
        }
    }
    let joined = out.join("\n");
    if joined.trim().is_empty() {
        String::new()
    } else {
        format!("{}\n", joined.trim_end())
    }
}

/// Hapus blok `[<key>.zephyr]` (termasuk sub-tabel headers) dari TOML.
fn strip_toml_block(existing: &str, key: &str) -> String {
    let mine = format!("[{key}.zephyr");
    let mut out: Vec<&str> = Vec::new();
    let mut skipping = false;
    for line in existing.lines() {
        let t = line.trim_start();
        if t.starts_with('[') {
            skipping = t.starts_with(&mine);
        }
        if !skipping {
            out.push(line);
        }
    }
    let joined = out.join("\n");
    if joined.trim().is_empty() {
        String::new()
    } else {
        format!("{}\n", joined.trim_end())
    }
}

/// Tulis entri `zephyr` ke config satu CLI. Backup dulu, merge, lalu simpan.
pub fn write_cli(id: &str, port: u16, token: &str) -> CliWriteResult {
    let Some(t) = target(id) else {
        return CliWriteResult {
            id: id.into(),
            label: id.into(),
            path: String::new(),
            ok: false,
            backup: false,
            message: format!("CLI '{id}' tidak dikenal"),
        };
    };
    let p = match target_path(t) {
        Ok(p) => p,
        Err(e) => {
            return CliWriteResult {
                id: id.into(),
                label: t.label.into(),
                path: String::new(),
                ok: false,
                backup: false,
                message: e.to_string(),
            }
        }
    };
    let existing = std::fs::read_to_string(&p).unwrap_or_default();
    let backup = backup_file(&p);

    let next = match t.format {
        Format::Json => match merge_json(&existing, t.key, server_entry(port, token)) {
            Ok(s) => s,
            Err(e) => {
                return CliWriteResult {
                    id: id.into(),
                    label: t.label.into(),
                    path: p.to_string_lossy().into(),
                    ok: false,
                    backup,
                    message: e.to_string(),
                }
            }
        },
        Format::Toml => merge_toml(&existing, t.key, port, token),
        Format::Yaml => merge_yaml(&existing, t.key, port, token),
    };

    if let Some(parent) = p.parent() {
        if let Err(e) = std::fs::create_dir_all(parent) {
            return CliWriteResult {
                id: id.into(),
                label: t.label.into(),
                path: p.to_string_lossy().into(),
                ok: false,
                backup,
                message: format!("gagal membuat folder: {e}"),
            };
        }
    }
    match std::fs::write(&p, next) {
        Ok(()) => CliWriteResult {
            id: id.into(),
            label: t.label.into(),
            path: p.to_string_lossy().into(),
            ok: true,
            backup,
            message: if backup {
                "entri zephyr ditulis (file lama disalin ke .bak)".into()
            } else {
                "entri zephyr ditulis (file baru dibuat)".into()
            },
        },
        Err(e) => CliWriteResult {
            id: id.into(),
            label: t.label.into(),
            path: p.to_string_lossy().into(),
            ok: false,
            backup,
            message: format!("gagal menulis: {e}"),
        },
    }
}

/// Buang entri `zephyr` dari config satu CLI (config lain tetap utuh).
pub fn remove_cli(id: &str) -> CliWriteResult {
    let Some(t) = target(id) else {
        return CliWriteResult {
            id: id.into(),
            label: id.into(),
            path: String::new(),
            ok: false,
            backup: false,
            message: format!("CLI '{id}' tidak dikenal"),
        };
    };
    let p = match target_path(t) {
        Ok(p) => p,
        Err(e) => {
            return CliWriteResult {
                id: id.into(),
                label: t.label.into(),
                path: String::new(),
                ok: false,
                backup: false,
                message: e.to_string(),
            }
        }
    };
    if !p.exists() {
        return CliWriteResult {
            id: id.into(),
            label: t.label.into(),
            path: p.to_string_lossy().into(),
            ok: true,
            backup: false,
            message: "config tidak ada — tidak ada yang dihapus".into(),
        };
    }
    let existing = std::fs::read_to_string(&p).unwrap_or_default();
    let backup = backup_file(&p);
    let next = match t.format {
        Format::Json => match unmerge_json(&existing, t.key) {
            Ok(s) => s,
            Err(e) => {
                return CliWriteResult {
                    id: id.into(),
                    label: t.label.into(),
                    path: p.to_string_lossy().into(),
                    ok: false,
                    backup,
                    message: e.to_string(),
                }
            }
        },
        Format::Toml => strip_toml_block(&existing, t.key),
        Format::Yaml => strip_yaml_block(&existing, t.key),
    };
    match std::fs::write(&p, next) {
        Ok(()) => CliWriteResult {
            id: id.into(),
            label: t.label.into(),
            path: p.to_string_lossy().into(),
            ok: true,
            backup,
            message: "entri zephyr dihapus".into(),
        },
        Err(e) => CliWriteResult {
            id: id.into(),
            label: t.label.into(),
            path: p.to_string_lossy().into(),
            ok: false,
            backup,
            message: format!("gagal menulis: {e}"),
        },
    }
}

/// Status pendaftaran: apakah config CLI sudah memuat entri zephyr.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliStatus {
    pub id: String,
    pub label: String,
    pub path: String,
    pub exists: bool,
    pub registered: bool,
}

pub fn cli_status() -> Vec<CliStatus> {
    TARGETS
        .iter()
        .map(|t| {
            let p = target_path(t).unwrap_or_default();
            let raw = std::fs::read_to_string(&p).unwrap_or_default();
            let registered = match t.format {
                Format::Json => serde_json::from_str::<Value>(&raw)
                    .ok()
                    .and_then(|v| v.get(t.key).and_then(|s| s.get("zephyr")).cloned())
                    .is_some(),
                Format::Toml => raw.contains(&format!("[{}.zephyr]", t.key)),
                Format::Yaml => raw.lines().any(|l| l.trim_start().starts_with("zephyr:")),
            };
            CliStatus {
                id: t.id.into(),
                label: t.label.into(),
                path: p.to_string_lossy().into(),
                exists: p.exists(),
                registered,
            }
        })
        .collect()
}

// ───────────────────── unit test hook ─────────────────────

#[cfg(test)]
pub fn merge_json_for_test(existing: &str, key: &str, port: u16, token: &str) -> ZResult<String> {
    merge_json(existing, key, server_entry(port, token))
}

#[cfg(test)]
pub fn unmerge_json_for_test(existing: &str, key: &str) -> ZResult<String> {
    unmerge_json(existing, key)
}

#[cfg(test)]
pub fn merge_toml_for_test(existing: &str, key: &str, port: u16, token: &str) -> String {
    merge_toml(existing, key, port, token)
}

#[cfg(test)]
pub fn strip_toml_for_test(existing: &str, key: &str) -> String {
    strip_toml_block(existing, key)
}

#[cfg(test)]
pub fn merge_yaml_for_test(existing: &str, key: &str, port: u16, token: &str) -> String {
    merge_yaml(existing, key, port, token)
}

#[cfg(test)]
pub fn strip_yaml_for_test(existing: &str, key: &str) -> String {
    strip_yaml_block(existing, key)
}
