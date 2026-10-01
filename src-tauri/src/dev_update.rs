//! Dev-only in-app update for the person building Zephyr.
//!
//! The problem this solves is a Windows fact, not a design choice: a running
//! `.exe` is locked by the loader, so the process you are looking at cannot
//! replace its own file. Any "update me" button has to do the swap from
//! OUTSIDE that process. The shape that works:
//!
//! ```text
//!   Zephyr (this process)        helper (detached pwsh)          Zephyr (new)
//!   ----------------------       ----------------------         ------------
//!   build --release
//!   spawn helper  ─────────────▶ wait for pid to exit
//!                                copy exe -> zephyr.prev.exe
//!                                copy new exe -> zephyr.exe
//!                                relaunch                  ────▶ running new build
//!   exit()
//! ```
//!
//! Everything here is gated on the build being a DEBUG build. A release build
//! compiled by a user has no `npm`, no `src-tauri`, and no business rebuilding
//! itself; the commands refuse with a clear reason instead of half-doing it.
//!
//! State that survives: everything in `%APPDATA%\zephyr\` plus whatever the
//! user's shell wrote to disk. State that does NOT survive: live terminal
//! sessions, running tasks, LSP servers and unsaved buffers. Those live in this
//! process's memory, and the swap kills it. The UI says so before it starts.

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// `CREATE_NO_WINDOW`: the helper must not flash a console window over the UI.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
/// `DETACHED_PROCESS`: the helper must outlive the process that started it.
#[cfg(windows)]
const DETACHED_PROCESS: u32 = 0x0000_0008;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DevUpdateInfo {
    /// Whether this build is allowed to rebuild itself at all.
    pub tersedia: bool,
    /// Human-readable reason when `tersedia` is false.
    pub alasan: Option<String>,
    /// The build profile this process was compiled with.
    pub profile: String,
    pub versi: String,
    /// Absolute path of the running executable.
    pub exe: String,
    /// Folder holding `src-tauri` and `package.json`, when it can be found.
    pub repo: Option<String>,
    /// Path the previous build is parked at before a swap.
    pub backup: String,
    /// Where the helper writes its progress log.
    pub log: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DevUpdateHasil {
    pub ok: bool,
    pub pesan: String,
    pub langkah: Vec<String>,
}

fn exe_path() -> Result<PathBuf, String> {
    std::env::current_exe().map_err(|e| format!("tidak bisa membaca path exe: {e}"))
}

fn profile() -> &'static str {
    if cfg!(debug_assertions) {
        "debug"
    } else {
        "release"
    }
}

/// Directory the helper logs to and the backup lives in: next to the exe.
fn folder_exe() -> Result<PathBuf, String> {
    exe_path()?
        .parent()
        .map(|p| p.to_path_buf())
        .ok_or_else(|| "exe tidak punya folder induk".to_string())
}

fn path_backup() -> Result<PathBuf, String> {
    Ok(folder_exe()?.join("zephyr.prev.exe"))
}

fn path_log() -> Result<PathBuf, String> {
    Ok(folder_exe()?.join("zephyr-devupdate.log"))
}

/// Walk up from the exe looking for the repo root.
///
/// In a dev run the exe sits at `<repo>/src-tauri/target/debug/zephyr.exe`, so
/// the repo is three levels up; the walk also copes with a custom target dir.
/// A packaged install has no `src-tauri` anywhere above it and correctly fails.
fn cari_repo() -> Option<PathBuf> {
    let mut dir = folder_exe().ok()?;
    for _ in 0..6 {
        let punya_toml = dir.join("src-tauri").join("Cargo.toml").is_file();
        let punya_pkg = dir.join("package.json").is_file();
        if punya_toml && punya_pkg {
            return Some(dir);
        }
        dir = dir.parent()?.to_path_buf();
    }
    None
}

/// Locate `pwsh`, falling back to Windows PowerShell 5 when it is absent.
fn shell() -> PathBuf {
    let kandidat = [
        r"C:\Program Files\PowerShell\7\pwsh.exe",
        r"C:\Program Files\PowerShell\7-preview\pwsh.exe",
    ];
    for k in kandidat {
        let p = Path::new(k);
        if p.is_file() {
            return p.to_path_buf();
        }
    }
    let mana = Command::new("where").arg("pwsh").output();
    if let Ok(out) = mana {
        if out.status.success() {
            let teks = String::from_utf8_lossy(&out.stdout);
            if let Some(baris) = teks.lines().next() {
                if !baris.trim().is_empty() {
                    return PathBuf::from(baris.trim());
                }
            }
        }
    }
    PathBuf::from(r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe")
}

/// Everything the UI needs to decide whether to offer the button.
#[tauri::command]
pub fn dev_update_info() -> Result<DevUpdateInfo, String> {
    let exe = exe_path()?;
    let repo = cari_repo();
    let backup = path_backup()?;
    let log = path_log()?;

    let mut tersedia = cfg!(debug_assertions);
    let mut alasan: Option<String> = None;

    if !tersedia {
        alasan = Some(
            "build release tidak bisa membangun ulang dirinya sendiri - jalankan Zephyr dari `npm run tauri dev` (atau target/debug) untuk memakai fitur ini"
                .to_string(),
        );
    } else if repo.is_none() {
        tersedia = false;
        alasan = Some(
            "folder repo tidak ditemukan di atas exe ini; fitur ini hanya untuk build developer yang berada di dalam repo Zephyr"
                .to_string(),
        );
    }

    Ok(DevUpdateInfo {
        tersedia,
        alasan,
        profile: profile().to_string(),
        versi: env!("CARGO_PKG_VERSION").to_string(),
        exe: exe.to_string_lossy().to_string(),
        repo: repo.map(|p| p.to_string_lossy().to_string()),
        backup: backup.to_string_lossy().to_string(),
        log: log.to_string_lossy().to_string(),
    })
}

/// Build the release binary and verify it actually produced a file.
///
/// Deliberately does NOT touch the running exe: that is `dev_update_apply`'s
/// job and it needs this process to end first. A failed build leaves the app
/// running exactly as it was, which is the whole point of splitting the two.
#[tauri::command]
pub async fn dev_update_build() -> Result<DevUpdateHasil, String> {
    if !cfg!(debug_assertions) {
        return Err("build release tidak bisa membangun ulang dirinya sendiri".to_string());
    }
    let repo = cari_repo().ok_or("folder repo Zephyr tidak ditemukan")?;
    let log = path_log()?;

    let hasil = tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = Command::new("cmd");
        cmd.current_dir(&repo)
            .arg("/C")
            .arg("npm run tauri build -- --no-bundle 2>&1");
        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd.output()
    })
    .await
    .map_err(|e| format!("gagal menjalankan build: {e}"))?
    .map_err(|e| format!("gagal menjalankan npm: {e}"))?;

    let teks = format!(
        "{}\n{}",
        String::from_utf8_lossy(&hasil.stdout),
        String::from_utf8_lossy(&hasil.stderr)
    );
    let _ = std::fs::write(&log, &teks);

    let baris: Vec<String> = teks
        .lines()
        .filter(|l| !l.trim().is_empty())
        .rev()
        .take(40)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .map(|l| l.trim_end().to_string())
        .collect();

    let baru = cari_repo()
        .map(|r| r.join("src-tauri").join("target").join("release").join(if cfg!(windows) {
            "zephyr.exe"
        } else {
            "zephyr"
        }));

    match baru {
        Some(p) if p.is_file() => Ok(DevUpdateHasil {
            ok: hasil.status.success(),
            pesan: if hasil.status.success() {
                format!("Build selesai: {}", p.to_string_lossy())
            } else {
                "Build selesai dengan kode keluar bukan nol - baca log sebelum menukar binary.".to_string()
            },
            langkah: baris,
        }),
        _ => Ok(DevUpdateHasil {
            ok: false,
            pesan: "Build selesai tetapi binary release tidak ditemukan - tidak ada yang bisa ditukar."
                .to_string(),
            langkah: baris,
        }),
    }
}

/// Hand the swap to a detached helper and return; the caller exits after this.
///
/// The helper waits for THIS pid to disappear, which is the only reliable
/// signal that the exe lock is gone. It then copies the new binary over the old
/// one, keeping the previous build as `zephyr.prev.exe`, and relaunches.
#[tauri::command]
pub fn dev_update_apply(relaunch: Option<bool>) -> Result<DevUpdateHasil, String> {
    if !cfg!(debug_assertions) {
        return Err("build release tidak bisa menukar binary-nya sendiri".to_string());
    }
    let repo = cari_repo().ok_or("folder repo Zephyr tidak ditemukan")?;
    let exe = exe_path()?;
    let backup = path_backup()?;
    let log = path_log()?;
    let pid = std::process::id();
    let relaunch = relaunch.unwrap_or(true);

    let baru = repo
        .join("src-tauri")
        .join("target")
        .join("release")
        .join(if cfg!(windows) { "zephyr.exe" } else { "zephyr" });
    if !baru.is_file() {
        return Err(format!(
            "binary hasil build tidak ada di {} - jalankan build dulu",
            baru.to_string_lossy()
        ));
    }

    let skrip = format!(
        r#"$ErrorActionPreference = 'Stop'
$log = '{log}'
function Catat($m) {{ "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $m | Out-File -FilePath $log -Append -Encoding utf8 }}
Catat 'helper hidup'
$pid_lama = {pid}
for ($i = 0; $i -lt 600; $i++) {{
  if (-not (Get-Process -Id $pid_lama -ErrorAction SilentlyContinue)) {{ break }}
  Start-Sleep -Milliseconds 200
}}
if (Get-Process -Id $pid_lama -ErrorAction SilentlyContinue) {{ Catat 'proses lama tidak berhenti dalam 120 detik'; exit 1 }}
Catat 'proses lama sudah berhenti'
$exe = '{exe}'
$bak = '{bak}'
$baru = '{baru}'
try {{
  if (Test-Path $exe) {{
    Copy-Item -Path $exe -Destination $bak -Force
    Catat "binary lama disimpan di $bak"
  }}
  Copy-Item -Path $baru -Destination $exe -Force
  Catat "binary baru dipasang di $exe"
}} catch {{
  Catat "GAGAL menukar binary: $($_.Exception.Message)"
  exit 1
}}
{relaunch_blok}Catat 'selesai'
"#,
        log = log.to_string_lossy().replace('\'', "''"),
        pid = pid,
        exe = exe.to_string_lossy().replace('\'', "''"),
        bak = backup.to_string_lossy().replace('\'', "''"),
        baru = baru.to_string_lossy().replace('\'', "''"),
        relaunch_blok = if relaunch {
            format!(
                "Start-Process -FilePath '{}' | Out-Null\nCatat 'Zephyr dijalankan kembali'\n",
                exe.to_string_lossy().replace('\'', "''")
            )
        } else {
            String::new()
        }
    );

    let skrip_path = folder_exe()?.join("zephyr-devupdate.ps1");
    std::fs::write(&skrip_path, skrip).map_err(|e| format!("gagal menulis helper: {e}"))?;

    let mut cmd = Command::new(shell());
    cmd.arg("-NoProfile")
        .arg("-ExecutionPolicy")
        .arg("Bypass")
        .arg("-File")
        .arg(&skrip_path);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW | DETACHED_PROCESS);
    cmd.spawn().map_err(|e| format!("gagal menjalankan helper: {e}"))?;

    Ok(DevUpdateHasil {
        ok: true,
        pesan: if relaunch {
            "Helper berjalan. Zephyr akan ditutup, binary ditukar, lalu dibuka lagi. Sesi terminal yang hidup akan hilang."
                .to_string()
        } else {
            "Helper berjalan. Zephyr akan ditutup dan binary ditukar tanpa dibuka lagi.".to_string()
        },
        langkah: vec![
            format!("exe sekarang: {}", exe.to_string_lossy()),
            format!("binary baru: {}", baru.to_string_lossy()),
            format!("cadangan: {}", backup.to_string_lossy()),
            format!("log helper: {}", log.to_string_lossy()),
        ],
    })
}

/// Tail of the helper log, for showing progress inside the (new) app.
#[tauri::command]
pub fn dev_update_log(batas: Option<usize>) -> Result<String, String> {
    let p = path_log()?;
    if !p.is_file() {
        return Ok(String::new());
    }
    let teks = std::fs::read_to_string(&p).map_err(|e| format!("gagal membaca log: {e}"))?;
    let n = batas.unwrap_or(40).clamp(1, 500);
    let baris: Vec<&str> = teks.lines().collect();
    let mulai = baris.len().saturating_sub(n);
    Ok(baris[mulai..].join("\n"))
}

/// Put the previous build back and relaunch. Same helper, swapped arguments.
#[tauri::command]
pub fn dev_update_rollback(relaunch: Option<bool>) -> Result<DevUpdateHasil, String> {
    if !cfg!(debug_assertions) {
        return Err("build release tidak bisa mengembalikan binary sendiri".to_string());
    }
    let exe = exe_path()?;
    let backup = path_backup()?;
    if !backup.is_file() {
        return Err(format!(
            "tidak ada build sebelumnya di {} - rollback hanya bisa setelah satu kali tukar binary",
            backup.to_string_lossy()
        ));
    }
    let log = path_log()?;
    let pid = std::process::id();
    let relaunch = relaunch.unwrap_or(true);

    let skrip = format!(
        r#"$ErrorActionPreference = 'Stop'
function Catat($m) {{ "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $m | Out-File -FilePath '{log}' -Append -Encoding utf8 }}
Catat 'helper rollback hidup'
for ($i = 0; $i -lt 600; $i++) {{
  if (-not (Get-Process -Id {pid} -ErrorAction SilentlyContinue)) {{ break }}
  Start-Sleep -Milliseconds 200
}}
try {{
  Copy-Item -Path '{bak}' -Destination '{exe}' -Force
  Catat 'binary lama dikembalikan'
}} catch {{
  Catat "GAGAL rollback: $($_.Exception.Message)"
  exit 1
}}
{blok}Catat 'selesai'
"#,
        log = log.to_string_lossy().replace('\'', "''"),
        pid = pid,
        bak = backup.to_string_lossy().replace('\'', "''"),
        exe = exe.to_string_lossy().replace('\'', "''"),
        blok = if relaunch {
            format!(
                "Start-Process -FilePath '{}' | Out-Null\nCatat 'Zephyr dijalankan kembali'\n",
                exe.to_string_lossy().replace('\'', "''")
            )
        } else {
            String::new()
        }
    );

    let skrip_path = folder_exe()?.join("zephyr-devupdate.ps1");
    std::fs::write(&skrip_path, skrip).map_err(|e| format!("gagal menulis helper: {e}"))?;

    let mut cmd = Command::new(shell());
    cmd.arg("-NoProfile")
        .arg("-ExecutionPolicy")
        .arg("Bypass")
        .arg("-File")
        .arg(&skrip_path);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW | DETACHED_PROCESS);
    cmd.spawn().map_err(|e| format!("gagal menjalankan helper: {e}"))?;

    Ok(DevUpdateHasil {
        ok: true,
        pesan: "Helper rollback berjalan. Zephyr akan ditutup dan build sebelumnya dipasang kembali."
            .to_string(),
        langkah: vec![
            format!("cadangan: {}", backup.to_string_lossy()),
            format!("exe: {}", exe.to_string_lossy()),
        ],
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cari_repo_menemukan_akar_dari_target_debug() {
        // The test binary lives under `<repo>/src-tauri/target/debug/deps`, so
        // the walk must find the repo root from a few levels down.
        let repo = cari_repo();
        assert!(repo.is_some(), "repo root harus ditemukan dari lokasi test");
        let r = repo.unwrap();
        assert!(r.join("src-tauri").join("Cargo.toml").is_file());
        assert!(r.join("package.json").is_file());
    }

    #[test]
    fn info_debug_selalu_tersedia_di_dalam_repo() {
        let info = dev_update_info().expect("info harus bisa dibaca");
        assert!(info.tersedia, "build test adalah debug build di dalam repo");
        assert!(info.alasan.is_none());
        assert_eq!(info.profile, "debug");
        assert!(info.backup.ends_with("zephyr.prev.exe"));
    }
}
