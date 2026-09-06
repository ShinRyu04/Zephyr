// ssh.rs — koneksi SSH: manajemen host + sesi sebagai pane terminal.
//
// Kontrak (ARCHITECTURE.md):
//   ssh_list      -> SshHost[] (password TIDAK pernah serial; hanya hasPassword)
//   ssh_add       { config } -> void
//   ssh_update    { config } -> void
//   ssh_delete    { id } -> void
//   ssh_connect   { configId } -> paneId (emit `ssh-status`)
//   ssh_disconnect{ paneId } -> void
//
// Config disimpan di %APPDATA%\zephyr\ssh.json:
//   [ { id, name, host, port:22, user,
//       auth: 'key'|'password', keyPath?, savePassword: false,
//       passwordSaved?: bool, passwordEnc?: string } ]
// Password (bila user MEMILIH simpan) dienkripsi XOR+BLAKE3 (sama dengan
// secrets.rs) — BUKAN plaintext. Frontend hanya melihat `hasPassword`.

use crate::app_state::AppState;
use crate::errors::{ZResult, ZephyrError};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshConfig {
    #[serde(default)]
    pub id: String,
    pub name: String,
    pub host: String,
    #[serde(default = "default_port")]
    pub port: u16,
    pub user: String,
    #[serde(default = "default_auth")]
    pub auth: String, // 'key' | 'password'
    #[serde(default)]
    pub key_path: String,
    #[serde(default)]
    pub save_password: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub password_saved: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub password_enc: Option<String>,
}

fn default_port() -> u16 {
    22
}
fn default_auth() -> String {
    "key".into()
}

/// Bentuk yang dikirim ke frontend — password TIDAK pernah keluar.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshHostView {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub user: String,
    pub auth: String,
    pub key_path: String,
    pub save_password: bool,
    pub has_password: bool,
}

fn ssh_file(state: &AppState) -> std::path::PathBuf {
    state.file("ssh.json")
}

fn read_configs(state: &AppState) -> Vec<SshConfig> {
    std::fs::read_to_string(ssh_file(state))
        .ok()
        .and_then(|s| serde_json::from_str::<Vec<SshConfig>>(&s).ok())
        .unwrap_or_default()
}

fn write_configs(state: &AppState, list: &[SshConfig]) -> ZResult<()> {
    let path = ssh_file(state);
    if let Some(p) = path.parent() {
        std::fs::create_dir_all(p)?;
    }
    std::fs::write(path, serde_json::to_vec_pretty(list)?)?;
    Ok(())
}

fn validate(c: &SshConfig) -> ZResult<()> {
    if c.name.trim().is_empty() {
        return Err(ZephyrError::InvalidInput("nama host wajib diisi".into()));
    }
    if c.host.trim().is_empty() {
        return Err(ZephyrError::InvalidInput("host wajib diisi".into()));
    }
    if c.port == 0 {
        return Err(ZephyrError::InvalidInput("port harus 1-65535".into()));
    }
    if c.user.trim().is_empty() {
        return Err(ZephyrError::InvalidInput("user wajib diisi".into()));
    }
    if c.auth != "key" && c.auth != "password" {
        return Err(ZephyrError::InvalidInput("auth harus 'key' atau 'password'".into()));
    }
    if c.auth == "key" && c.key_path.trim().is_empty() {
        return Err(ZephyrError::InvalidInput(
            "auth key butuh keyPath (mis. ~/.ssh/id_ed25519)".into(),
        ));
    }
    Ok(())
}

fn to_view(c: &SshConfig) -> SshHostView {
    SshHostView {
        id: c.id.clone(),
        name: c.name.clone(),
        host: c.host.clone(),
        port: c.port,
        user: c.user.clone(),
        auth: c.auth.clone(),
        key_path: c.key_path.clone(),
        save_password: c.save_password,
        has_password: c.password_enc.is_some(),
    }
}

/// Deteksi ssh.exe (Windows OpenSSH bawaan; default ada di Windows 10+).
fn find_ssh() -> Option<std::path::PathBuf> {
    let sysroot = std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".into());
    let cand = [
        std::path::PathBuf::from(&sysroot).join(r"System32\OpenSSH\ssh.exe"),
        std::path::PathBuf::from(&sysroot).join(r"System32\ssh.exe"),
    ];
    for p in &cand {
        if p.exists() {
            return Some(p.clone());
        }
    }
    // fallback: PATH (`where ssh`)
    let out = std::process::Command::new("where")
        .arg("ssh")
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let s = String::from_utf8_lossy(&out.stdout);
    s.lines()
        .next()
        .map(|l| std::path::PathBuf::from(l.trim()))
}

#[tauri::command]
pub fn ssh_list(state: State<AppState>) -> ZResult<Vec<SshHostView>> {
    Ok(read_configs(&state).iter().map(to_view).collect())
}

#[tauri::command]
pub fn ssh_add(state: State<AppState>, config: Value) -> ZResult<()> {
    // id WAJIB di-generate di sini — frontend tidak boleh pilih id sendiri.
    let mut c: SshConfig = serde_json::from_value(config)
        .map_err(|e| ZephyrError::InvalidInput(format!("config tidak valid: {e}")))?;
    c.id = Uuid::new_v4().to_string();
    c.password_enc = None;
    c.password_saved = None;
    validate(&c)?;

    let mut list = read_configs(&state);
    // name harus unik (kontrak).
    if list.iter().any(|x| x.name == c.name) {
        return Err(ZephyrError::InvalidInput(format!(
            "nama host '{}' sudah ada",
            c.name
        )));
    }
    list.push(c);
    write_configs(&state, &list)
}

#[tauri::command]
pub fn ssh_update(state: State<AppState>, config: Value) -> ZResult<()> {
    let mut c: SshConfig = serde_json::from_value(config)
        .map_err(|e| ZephyrError::InvalidInput(format!("config tidak valid: {e}")))?;
    if c.id.trim().is_empty() {
        return Err(ZephyrError::InvalidInput("id kosong".into()));
    }
    validate(&c)?;

    let mut list = read_configs(&state);
    let Some(idx) = list.iter().position(|x| x.id == c.id) else {
        return Err(ZephyrError::NotFound(format!("host {}", c.id)));
    };
    // Kalau password tidak dikirim ulang (kosong), pertahankan yang lama.
    let lama = &list[idx];
    if c.password_enc.is_none() {
        c.password_enc = lama.password_enc.clone();
        c.password_saved = lama.password_saved;
    }
    // name unik, kecuali dirinya sendiri.
    if list.iter().any(|x| x.id != c.id && x.name == c.name) {
        return Err(ZephyrError::InvalidInput(format!(
            "nama host '{}' sudah ada",
            c.name
        )));
    }
    list[idx] = c;
    write_configs(&state, &list)
}

#[tauri::command]
pub fn ssh_delete(state: State<AppState>, id: String) -> ZResult<()> {
    let mut list = read_configs(&state);
    let sebelum = list.len();
    list.retain(|x| x.id != id);
    if list.len() == sebelum {
        return Err(ZephyrError::NotFound(format!("host {id}")));
    }
    write_configs(&state, &list)
}

/// Simpan password terenkripsi (dipanggil frontend setelah user memilih
/// "simpan" dan konfirmasi). Kembalikan view baru.
#[tauri::command]
pub fn ssh_save_password(state: State<AppState>, id: String, password: String) -> ZResult<SshHostView> {
    let mut list = read_configs(&state);
    let Some(idx) = list.iter().position(|x| x.id == id) else {
        return Err(ZephyrError::NotFound(format!("host {id}")));
    };
    if password.is_empty() {
        return Err(ZephyrError::InvalidInput("password kosong".into()));
    }
    list[idx].password_enc = Some(crate::secrets::encrypt_string(&password));
    list[idx].password_saved = Some(true);
    let c = list[idx].clone();
    write_configs(&state, &list)?;
    Ok(to_view(&c))
}

/// Hapus password tersimpan (user memilih "jangan simpan" / edit).
#[tauri::command]
pub fn ssh_clear_password(state: State<AppState>, id: String) -> ZResult<SshHostView> {
    let mut list = read_configs(&state);
    let Some(idx) = list.iter().position(|x| x.id == id) else {
        return Err(ZephyrError::NotFound(format!("host {id}")));
    };
    list[idx].password_enc = None;
    list[idx].password_saved = Some(false);
    let c = list[idx].clone();
    write_configs(&state, &list)?;
    Ok(to_view(&c))
}

/// Status koneksi untuk event `ssh-status`.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SshStatus {
    pane_id: String,
    state: String, // connecting | connected | disconnected | error
    message: String,
}

/// Spawn `ssh.exe` sebagai pty (kind 'ssh') — alur yang sama dengan
/// pty_spawn biasa, tapi command/args dibangun dari config host.
/// Password AUTH: bila keyPath kosong dan savePassword=false, OpenSSH
/// meminta password INTERAKTIF di pane — UX yang diinginkan (user ketik
/// langsung di terminal, tidak lewat app).
#[tauri::command(async)]
pub fn ssh_connect(
    app: AppHandle,
    state: State<AppState>,
    config_id: String,
    cols: Option<u16>,
    rows: Option<u16>,
) -> ZResult<String> {
    let configs = read_configs(&state);
    let cfg = configs
        .iter()
        .find(|c| c.id == config_id)
        .ok_or_else(|| ZephyrError::NotFound(format!("host {config_id}")))?
        .clone();

    let ssh = find_ssh().ok_or_else(|| {
        ZephyrError::NotFound(
            "OpenSSH Client tidak ditemukan — instal via Settings (Windows optional feature)".into(),
        )
    })?;

    let pane_id = format!("ssh-{}", Uuid::new_v4().to_string().split('-').next().unwrap_or("x"));

    let mut argv: Vec<String> = vec![
        "-p".into(),
        cfg.port.to_string(),
        format!("{}@{}", cfg.user, cfg.host),
    ];
    if cfg.auth == "key" && !cfg.key_path.trim().is_empty() {
        argv.insert(0, "-i".into());
        argv.insert(1, cfg.key_path.trim().to_string());
    }
    // savePassword + auth password: OpenSSH tidak menerima password lewat
    // stdin (butuh askpass/expect). V1: biarkan interaktif di pane — user
    // ketik langsung di terminal.

    let _ = app.emit(
        "ssh-status",
        SshStatus {
            pane_id: pane_id.clone(),
            state: "connecting".into(),
            message: format!("{}@{}:{}", cfg.user, cfg.host, cfg.port),
        },
    );

    // Spawn lewat pty_spawn: resolve_shell memakai `explicit` command bila
    // ada, jadi ssh.exe jalan sebagai pane biasa — thread relay output,
    // exit code, write/resize/kill semuanya otomatis.
    crate::pty::pty_spawn(
        app.clone(),
        state,
        pane_id.clone(),
        Some("ssh".into()),
        Some(ssh.to_string_lossy().to_string()),
        Some(argv),
        None,
        cols,
        rows,
    )?;

    let _ = app.emit(
        "ssh-status",
        SshStatus {
            pane_id: pane_id.clone(),
            state: "connected".into(),
            message: format!("{}@{}:{}", cfg.user, cfg.host, cfg.port),
        },
    );
    Ok(pane_id)
}

/// Kirim Ctrl+D / "exit" untuk menutup sesi SSH.
#[tauri::command]
pub fn ssh_disconnect(state: State<AppState>, pane_id: String) -> ZResult<()> {
    crate::pty::pty_kill(state, pane_id)
}
