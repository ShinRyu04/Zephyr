// extensions.rs — fondasi ekstensi (fase 13), MANIFEST-ONLY v1.
//
// Keputusan keamanan (jangan diubah tanpa diskusi): kode JS ekstensi TIDAK
// dieksekusi. Alasannya: satu-satunya cara menjalankannya di WebView2 adalah
// `import('file://…')` atau eval — dua-duanya memberi ekstensi pihak ketiga
// akses penuh ke `window`, artinya ke seluruh jembatan IPC Zephyr (fs, pty,
// git, secrets). Untuk lingkup fase ini itu tidak sebanding.
//
// Yang dipakai v1: `contributes.commands` dari package.json didaftarkan ke
// Command Palette. `extensions_load` tetap MEMBACA file `main` dan menyimpan
// isinya di state (+ validasi ≤1MB) supaya jalur "muat kode" sudah terbukti
// benar saat runtime eksekusi ditambahkan nanti.
//
// Folder yang dipercaya:
//   %APPDATA%\zephyr\extensions\<id>\package.json         (bawaan tempat)
//   path lain yang DIPILIH USER lewat dialog → dicatat di registry.json

use crate::app_state::AppState;
use crate::errors::{ZResult, ZephyrError};
use serde::Serialize;
use serde_json::Value;
use std::path::{Path, PathBuf};
use tauri::State;

/// Batas ukuran file `main` (prompt fase 13: max 1MB).
pub const MAX_MAIN_BYTES: u64 = 20_971_520;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExtCommand {
    /// id yang dipakai palette: selalu di-prefix `ext.<extId>.`
    pub id: String,
    pub title: String,
    pub description: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub enabled: bool,
    pub path: String,
    /// true = ekstensi bawaan Zephyr (tidak bisa dihapus)
    pub builtin: bool,
    /// nama file entry dari manifest (`main`), kosong bila tidak ada
    pub main: String,
    /// ukuran file main; -1 = file tidak ada
    pub main_bytes: i64,
    /// command yang dikontribusikan manifest
    pub commands: Vec<ExtCommand>,
    /// alasan ekstensi tidak bisa dipakai (manifest rusak / main kebesaran)
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionLoad {
    pub id: String,
    pub name: String,
    pub version: String,
    pub main: String,
    pub main_bytes: u64,
    pub commands: Vec<ExtCommand>,
    /// manifest apa adanya (untuk ditampilkan di Settings)
    pub manifest: Value,
    /// v1 SELALU false — lihat catatan di atas file
    pub executed: bool,
}

/// Ekstensi bawaan (internal, dipasang Zephyr sendiri). Dipakai sebagai
/// contoh konsep sekaligus daftar yang bisa dimatikan user.
/// Cermin dari BUILTIN di frontend — kalau menambah, ubah keduanya.
const BUILTIN: &[(&str, &str, &str)] = &[
    (
        "file-icon-provider",
        "File Icon Provider",
        "Ikon per bahasa di Explorer & tab editor",
    ),
    (
        "git-provider",
        "Git Provider",
        "Status file, diff, dan Source Control",
    ),
    (
        "ai-provider",
        "AI Provider",
        "Adapter OpenAI/Anthropic/Gemini untuk panel AI",
    ),
    ("lang-web", "Bahasa Web", "HTML, CSS, JS/TS, JSON"),
    ("lang-python", "Python", "highlight + indentasi"),
    ("lang-rust", "Rust", "highlight"),
    ("lang-markdown", "Markdown", "highlight"),
    (
        "bracket-pair",
        "Bracket Pair",
        "pasangan tanda kurung berwarna",
    ),
];

pub fn extensions_dir(state: &AppState) -> PathBuf {
    state.data_dir.join("extensions")
}

fn registry_file(state: &AppState) -> PathBuf {
    extensions_dir(state).join("registry.json")
}

/// Path ekstensi luar yang pernah dipilih user lewat dialog.
fn registry_paths(state: &AppState) -> Vec<PathBuf> {
    let raw = match std::fs::read_to_string(registry_file(state)) {
        Ok(r) => r,
        Err(_) => return vec![],
    };
    serde_json::from_str::<Value>(&raw)
        .ok()
        .and_then(|v| v.as_array().cloned())
        .unwrap_or_default()
        .iter()
        .filter_map(|x| x.as_str().map(PathBuf::from))
        .filter(|p| p.is_dir())
        .collect()
}

fn write_registry(state: &AppState, list: &[PathBuf]) -> ZResult<()> {
    let dir = extensions_dir(state);
    std::fs::create_dir_all(&dir)?;
    let arr: Vec<Value> = list
        .iter()
        .map(|p| Value::String(p.to_string_lossy().to_string()))
        .collect();
    std::fs::write(registry_file(state), serde_json::to_vec_pretty(&arr)?)?;
    Ok(())
}

/// `settings.extensions.enabled`. Daftar KOSONG = semua bawaan aktif
/// (default paling ramah), ekstensi luar TETAP harus di-enable manual.
fn enabled_list(state: &AppState) -> Vec<String> {
    crate::settings::read_settings_value(state)
        .get("extensions")
        .and_then(|e| e.get("enabled"))
        .and_then(|e| e.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|x| x.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default()
}

fn str_field(v: &Value, key: &str) -> String {
    v.get(key)
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .trim()
        .to_string()
}

/// Baca peta lokal `package.nls.json` (+ `package.nls.<locale>.json` bila
/// ada). VS Code memakai file ini untuk mengganti `%key%` di dalam
/// `contributes.commands[].title` — tanpa ini title tampil mentah seperti
/// `%contributes.commands.java.project.build%` di Command Palette.
fn nls_map(dir: &Path) -> std::collections::HashMap<String, String> {
    let mut map = std::collections::HashMap::new();
    for fname in ["package.nls.json", "package.nls.en.json", "package.nls.id.json"] {
        let p = dir.join(fname);
        let Ok(raw) = std::fs::read_to_string(&p) else {
            continue;
        };
        if let Ok(v) = serde_json::from_str::<Value>(&raw) {
            if let Some(obj) = v.as_object() {
                for (k, val) in obj {
                    if let Some(s) = val.as_str() {
                        map.insert(k.clone(), s.to_string());
                    }
                }
            }
        }
    }
    map
}

/// Ganti `%key%` pada string memakai peta nls. String tanpa `%` dikembalikan
/// apa adanya. Key yang tidak ditemukan TETAP dipakai (lebih baik daripada
/// judul kosong), tapi tanda `%` dibuang supaya tidak tampil mentah.
fn resolve_nls(s: &str, nls: &std::collections::HashMap<String, String>) -> String {
    if !s.contains('%') {
        return s.to_string();
    }
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(start) = rest.find('%') {
        out.push_str(&rest[..start]);
        let after = &rest[start + 1..];
        let Some(end) = after.find('%') else {
            // `%` tanpa pasangan: buang sisanya agar tidak mentah.
            return out;
        };
        let key = &after[..end];
        match nls.get(key) {
            Some(val) => out.push_str(val),
            None => {
                // Key tidak dikenal: lewati (jangan tampilkan `%key%`).
                // Nama command asli lebih informatif sebagai fallback?
                // Tidak — biarkan kosong, caller mengganti dengan raw.
                out.push_str(key);
            }
        }
        rest = &after[end + 1..];
    }
    out.push_str(rest);
    out
}

/// Ambil `contributes.commands` dari manifest. Bentuk yang diterima:
/// `[{ command|name, title|label, description? }]`.
/// `dir` dipakai membaca `package.nls.json` untuk resolve `%key%` pada title.
fn parse_commands(ext_id: &str, manifest: &Value, dir: &Path) -> Vec<ExtCommand> {
    let nls = nls_map(dir);
    let arr = manifest
        .get("contributes")
        .and_then(|c| c.get("commands"))
        .and_then(|c| c.as_array())
        .cloned()
        .unwrap_or_default();

    let mut out = Vec::new();
    for c in arr {
        let raw = {
            let a = str_field(&c, "command");
            if a.is_empty() {
                str_field(&c, "name")
            } else {
                a
            }
        };
        if raw.is_empty() {
            continue;
        }
        let title = {
            let t = str_field(&c, "title");
            let resolved = if t.is_empty() {
                let l = str_field(&c, "label");
                if l.is_empty() {
                    raw.clone()
                } else {
                    l
                }
            } else {
                t
            };
            // VS Code: title bisa berupa kunci lokal `%...%` — resolve dari
            // package.nls.json supaya Command Palette tidak menampilkan kunci
            // mentah. Kalau kunci tidak dikenal, pakai nama command (short)
            // sebagai ganti.
            let r = resolve_nls(&resolved, &nls);
            if r.is_empty() {
                raw.clone()
            } else {
                r
            }
        };
        // Namespace WAJIB: ekstensi tidak boleh menimpa command inti.
        let short = raw.rsplit('.').next().unwrap_or(&raw).to_string();
        out.push(ExtCommand {
            id: format!("ext.{ext_id}.{short}"),
            title,
            description: str_field(&c, "description"),
        });
        if out.len() >= 32 {
            break; // batas wajar per ekstensi
        }
    }
    out
}

/// Wrapper publik untuk `parse_commands` — dipakai `ext_pkg.rs` (fase 19)
/// supaya aturan namespace `ext.<id>.<nama>` cuma punya SATU definisi.
/// `dir` (bila ada) dipakai resolve `%key%` nls; kosong = tanpa nls.
pub fn parse_commands_pub(ext_id: &str, manifest: &Value, dir: Option<&Path>) -> Vec<ExtCommand> {
    parse_commands(ext_id, manifest, dir.unwrap_or_else(|| Path::new("")))
}

/// Baca satu folder ekstensi → info. None = bukan paket ekstensi.
fn read_package(dir: &Path, enabled: &[String]) -> Option<ExtensionInfo> {
    let pkg = dir.join("package.json");
    if !pkg.is_file() {
        return None;
    }
    let id = dir.file_name()?.to_string_lossy().to_string();
    let raw = std::fs::read_to_string(&pkg).ok()?;

    let manifest: Value = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(e) => {
            return Some(ExtensionInfo {
                id: id.clone(),
                name: id,
                version: "-".into(),
                description: String::new(),
                enabled: false,
                path: dir.to_string_lossy().to_string(),
                builtin: false,
                main: String::new(),
                main_bytes: -1,
                commands: vec![],
                error: Some(format!("package.json tidak valid: {e}")),
            })
        }
    };

    let name = {
        let n = str_field(&manifest, "displayName");
        if n.is_empty() {
            let n2 = str_field(&manifest, "name");
            if n2.is_empty() {
                id.clone()
            } else {
                n2
            }
        } else {
            n
        }
    };
    let main = {
        let m = str_field(&manifest, "main");
        if m.is_empty() {
            "index.js".to_string()
        } else {
            m
        }
    };
    let main_path = dir.join(&main);
    let main_bytes = std::fs::metadata(&main_path)
        .map(|m| m.len() as i64)
        .unwrap_or(-1);

    let mut error = None;
    if main_bytes > MAX_MAIN_BYTES as i64 {
        error = Some(format!(
            "file {main} berukuran {} KB — melebihi batas {} MB, ekstensi ditolak",
            main_bytes / 1024,
            MAX_MAIN_BYTES / 1024 / 1024
        ));
    }

    Some(ExtensionInfo {
        id: id.clone(),
        // Ekstensi rusak/kebesaran tidak boleh terlihat aktif walau ada di
        // settings — kalau tidak, palette menampilkan command yang tak jalan.
        enabled: error.is_none() && enabled.iter().any(|x| x == &id),
        commands: parse_commands(&id, &manifest, &dir),
        name,
        version: str_field(&manifest, "version"),
        description: str_field(&manifest, "description"),
        path: dir.to_string_lossy().to_string(),
        builtin: false,
        main,
        main_bytes,
        error,
    })
}

/// Semua ekstensi: bawaan (internal) + folder di extensions/ + registry user.
pub fn list_all(state: &AppState) -> Vec<ExtensionInfo> {
    let enabled = enabled_list(state);
    let builtin_on = |id: &str| enabled.is_empty() || enabled.iter().any(|x| x == id);

    let mut out: Vec<ExtensionInfo> = BUILTIN
        .iter()
        .map(|(id, name, desc)| ExtensionInfo {
            id: (*id).to_string(),
            name: (*name).to_string(),
            version: env!("CARGO_PKG_VERSION").to_string(),
            description: (*desc).to_string(),
            enabled: builtin_on(id),
            path: "(internal)".into(),
            builtin: true,
            main: String::new(),
            main_bytes: -1,
            commands: vec![],
            error: None,
        })
        .collect();

    let dir = extensions_dir(state);
    let mut dirs: Vec<PathBuf> = std::fs::read_dir(&dir)
        .map(|rd| {
            rd.filter_map(|e| e.ok())
                .map(|e| e.path())
                .filter(|p| p.is_dir())
                .collect()
        })
        .unwrap_or_default();
    dirs.extend(registry_paths(state));
    dirs.sort();
    dirs.dedup();

    for d in dirs {
        if let Some(info) = read_package(&d, &enabled) {
            if out.iter().any(|x| x.id == info.id) {
                continue; // id bentrok dengan bawaan → yang bawaan menang
            }
            out.push(info);
        }
    }
    out
}

// ───────────────────────── commands ─────────────────────────

#[tauri::command]
pub fn extensions_list(state: State<AppState>) -> ZResult<Vec<ExtensionInfo>> {
    Ok(list_all(&state))
}

/// Muat manifest + file `main` satu ekstensi. Validasi: folder harus ada di
/// whitelist (extensions/ atau registry pilihan user) dan `main` ≤ 1MB.
/// Isi `main` disimpan di state, TIDAK dieksekusi (lihat catatan atas file).
#[tauri::command]
pub fn extensions_load(state: State<AppState>, id: String) -> ZResult<ExtensionLoad> {
    // fase 29: ekstensi v1 manifest-only, tapi `contributes.commands` yang
    // didaftarkan ke palette berasal dari folder repo/marketplace. Folder
    // tak-tepercaya tidak boleh menyuntik command ke palette.
    crate::workspace::ensure_trusted(&state, "Memuat ekstensi")?;

    let info = list_all(&state)
        .into_iter()
        .find(|x| x.id == id)
        .ok_or_else(|| ZephyrError::NotFound(format!("ekstensi {id}")))?;

    if info.builtin {
        return Err(ZephyrError::InvalidInput(
            "ekstensi bawaan tidak punya manifest di disk".into(),
        ));
    }
    if let Some(e) = info.error {
        return Err(ZephyrError::InvalidInput(e));
    }

    let dir = PathBuf::from(&info.path);
    let pkg = dir.join("package.json");
    let manifest: Value = serde_json::from_str(&std::fs::read_to_string(&pkg)?)
        .map_err(|e| ZephyrError::InvalidInput(format!("package.json tidak valid: {e}")))?;

    let main_path = dir.join(&info.main);
    let size = std::fs::metadata(&main_path)
        .map(|m| m.len())
        .map_err(|_| ZephyrError::NotFound(format!("file entry {}", info.main)))?;
    if size > MAX_MAIN_BYTES {
        return Err(ZephyrError::InvalidInput(format!(
            "{} berukuran {} KB — batas 1MB",
            info.main,
            size / 1024
        )));
    }

    let code = std::fs::read_to_string(&main_path)?;
    state.ext_store_code(&id, code);

    Ok(ExtensionLoad {
        id,
        name: info.name,
        version: info.version,
        main: info.main,
        main_bytes: size,
        commands: info.commands,
        manifest,
        executed: false,
    })
}

/// Daftarkan folder ekstensi dari luar (user memilih package.json-nya).
#[tauri::command]
pub fn extensions_add(state: State<AppState>, path: String) -> ZResult<ExtensionInfo> {
    let p = PathBuf::from(&path);
    let dir = if p.is_file() {
        p.parent()
            .map(|x| x.to_path_buf())
            .ok_or_else(|| ZephyrError::InvalidInput("folder ekstensi tidak ketemu".into()))?
    } else {
        p
    };
    if !dir.join("package.json").is_file() {
        return Err(ZephyrError::InvalidInput(
            "folder itu tidak punya package.json".into(),
        ));
    }
    let dir = crate::app_state::normalize(&dir);
    let enabled = enabled_list(&state);
    let info = read_package(&dir, &enabled)
        .ok_or_else(|| ZephyrError::InvalidInput("bukan paket ekstensi".into()))?;

    let mut list = registry_paths(&state);
    if !list.iter().any(|x| x == &dir) {
        list.push(dir);
        write_registry(&state, &list)?;
    }
    Ok(info)
}

/// Lepas satu id dari registry path luar. Dipakai `ext_pkg::extensions_uninstall`
/// supaya uninstall tidak meninggalkan entri hantu di registry.json.
pub fn registry_lepas(state: &AppState, id: &str) -> ZResult<bool> {
    let before = registry_paths(state);
    let after: Vec<PathBuf> = before
        .iter()
        .filter(|p| {
            p.file_name()
                .map(|n| n.to_string_lossy() != id)
                .unwrap_or(true)
        })
        .cloned()
        .collect();
    if after.len() == before.len() {
        return Ok(false);
    }
    write_registry(state, &after)?;
    Ok(true)
}

#[tauri::command]
pub fn extensions_remove(state: State<AppState>, id: String) -> ZResult<bool> {
    let before = registry_paths(&state);
    let after: Vec<PathBuf> = before
        .iter()
        .filter(|p| {
            p.file_name()
                .map(|n| n.to_string_lossy() != id)
                .unwrap_or(true)
        })
        .cloned()
        .collect();
    if after.len() == before.len() {
        return Ok(false);
    }
    write_registry(&state, &after)?;
    Ok(true)
}

/// Path folder extensions/ (dipakai tombol "Buka folder ekstensi").
#[tauri::command]
pub fn extensions_folder(state: State<AppState>) -> ZResult<String> {
    let dir = extensions_dir(&state);
    std::fs::create_dir_all(&dir)?;
    Ok(dir.to_string_lossy().to_string())
}
