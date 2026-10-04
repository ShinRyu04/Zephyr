use crate::app_state::AppState;
use crate::errors::{ZResult, ZephyrError};
use serde::Serialize;
use std::path::PathBuf;
use std::process::Stdio;
use std::time::{Duration, Instant};
use tauri::State;

const MAX_OUTPUT_CHARS: usize = 20_000;
// Shell commands that omit a timeout should fail fast on a stalled network call.
// Explicit values, including long build timeouts, are still honored up to the cap.
const DEFAULT_TIMEOUT_MS: u64 = 30_000;
const MAX_TIMEOUT_MS: u64 = 600_000;
const POLL_MS: u64 = 25;

#[derive(Debug, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ExecResult {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
    pub truncated: bool,
    pub ms: u64,
    pub timed_out: bool,
}

fn potong_ekor(teks: &str) -> (String, bool) {
    let n = teks.chars().count();
    if n <= MAX_OUTPUT_CHARS {
        return (teks.to_string(), false);
    }
    let skip = n - MAX_OUTPUT_CHARS;
    let s: String = teks.chars().skip(skip).collect();
    (s, true)
}

fn shell_for(perintah: &str) -> (String, Option<String>) {
    #[cfg(windows)]
    {
        let shell = std::env::var("ComSpec").unwrap_or_else(|_| "cmd.exe".into());
        (shell, Some(perintah.to_string()))
    }
    #[cfg(not(windows))]
    {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".into());
        (shell, Some(perintah.to_string()))
    }
}

fn build(perintah: &str, cwd: std::path::PathBuf) -> ZResult<tokio::process::Command> {
    let (shell, arg) = shell_for(perintah);
    let arg = arg.unwrap_or_default();
    let mut c = crate::proc::tokio_cmd(&shell);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        c.raw_arg(format!("/d /s /c \"{arg}\""));
    }
    #[cfg(not(windows))]
    {
        c.arg("-c").arg(&arg);
    }
    c.current_dir(cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    Ok(c)
}

#[cfg(windows)]
fn kill_tree(child: &tokio::process::Child) {
    if let Some(pid) = child.id() {
        // Killing only cmd.exe leaves network tools and their pipe handles alive.
        // taskkill /T is intentional here: it is the Windows tree equivalent.
        let _ = crate::proc::cmd("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .output();
    }
}

#[cfg(not(windows))]
fn kill_tree(child: &tokio::process::Child) {
    let _ = child.id();
}

/**
 * Folder kerja untuk satu pemanggilan `agent_exec`.
 *
 * `cwd` datang dari frontend dan TIDAK dipercaya: jalur ini menjalankan
 * perintah arbitrer dari model, jadi string mentah dari UI tidak boleh
 * menentukan folder. Aturannya dua lapis, keduanya memakai helper yang sudah
 * ada di `paths` (dipakai juga oleh `tasks` dan `pty`):
 *
 * 1. `validate_cwd` menolak apa pun yang bukan folder yang benar-benar ada -
 *    path hilang dan path berupa berkas ikut ditolak.
 * 2. Kalau ada workspace aktif, folder hasil validasi harus berada DI DALAM
 *    workspace itu. Tanpa lapis ini, cwd palsu bisa menjalankan perintah di
 *    folder mana saja di mesin user.
 *
 * Kalau tidak ada workspace aktif, `validate_cwd` saja yang berlaku: hanya
 * path yang benar-benar ada di disk yang lolos.
 */
fn tentukan_cwd(state: &AppState, cwd: Option<String>) -> ZResult<PathBuf> {
    let Some(raw) = cwd.filter(|c| !c.trim().is_empty()) else {
        return state
            .workspace_path()
            .ok_or_else(|| ZephyrError::InvalidInput("no workspace".into()));
    };

    let dir = crate::paths::validate_cwd(std::path::Path::new(&raw))?;

    if let Some(ws) = state.workspace_path() {
        if !crate::paths::is_inside(&ws, &dir) {
            return Err(ZephyrError::InvalidInput(format!(
                "cwd di luar workspace: {}",
                dir.to_string_lossy()
            )));
        }
    }

    Ok(dir)
}

async fn jalan(
    child: &mut tokio::process::Child,
    out_pipe: &mut Option<tokio::process::ChildStdout>,
    err_pipe: &mut Option<tokio::process::ChildStderr>,
) -> std::io::Result<(i32, String, String)> {
    use tokio::io::AsyncReadExt;

    let so = out_pipe.as_mut();
    let se = err_pipe.as_mut();
    let t_out = async {
        let mut buf = Vec::new();
        if let Some(p) = so {
            let _ = p.read_to_end(&mut buf).await;
        }
        String::from_utf8_lossy(&buf).to_string()
    };
    let t_err = async {
        let mut buf = Vec::new();
        if let Some(p) = se {
            let _ = p.read_to_end(&mut buf).await;
        }
        String::from_utf8_lossy(&buf).to_string()
    };

    let status = child.wait().await;
    let (stdout, stderr) = tokio::join!(t_out, t_err);
    let code = status?.code().unwrap_or(-1);
    Ok((code, stdout, stderr))
}

#[tauri::command(async)]
pub async fn agent_exec(
    state: State<'_, AppState>,
    command: String,
    timeout_ms: Option<u64>,
    cwd: Option<String>,
) -> ZResult<ExecResult> {
    crate::workspace::ensure_trusted(&state, "Menjalankan perintah")?;

    let perintah = command.trim();
    if perintah.is_empty() {
        return Err(ZephyrError::InvalidInput("empty command".into()));
    }
    let cwd = tentukan_cwd(&state, cwd)?;

    let ms_cap = timeout_ms
        .unwrap_or(DEFAULT_TIMEOUT_MS)
        .clamp(1_000, MAX_TIMEOUT_MS);

    let started = Instant::now();
    let mut c = build(perintah, cwd)?;
    let mut child = c
        .spawn()
        .map_err(|e| ZephyrError::Internal(format!("running the command failed: {e}")))?;

    let mut out_pipe = child.stdout.take();
    let mut err_pipe = child.stderr.take();

    let (exit_code, timed_out, stdout, stderr) =
        match tokio::time::timeout(Duration::from_millis(ms_cap), jalan(&mut child, &mut out_pipe, &mut err_pipe)).await {
            Ok(Ok((code, so, se))) => (code, false, so, se),
            Ok(Err(e)) => {
                return Err(ZephyrError::Internal(format!("waiting for the command failed: {e}")));
            }
            Err(_) => {
                kill_tree(&child);
                let _ = child.start_kill();
                tokio::time::sleep(Duration::from_millis(POLL_MS)).await;
                let _ = child.kill().await;
                // Do not wait for inherited stdout/stderr handles. A descendant
                // that escaped the shell can otherwise keep read_to_end pending.
                drop(out_pipe.take());
                drop(err_pipe.take());
                let _ = child.wait().await;
                (-1, true, String::new(), String::new())
            }
        };

    let (stdout, t1) = potong_ekor(&stdout);
    let (stderr, t2) = potong_ekor(&stderr);

    Ok(ExecResult {
        exit_code,
        stdout,
        stderr,
        truncated: t1 || t2,
        ms: started.elapsed().as_millis() as u64,
        timed_out,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn potong_menjaga_ekor() {
        let panjang: String = std::iter::repeat('a').take(MAX_OUTPUT_CHARS + 50).collect();
        let (s, trunc) = potong_ekor(&panjang);
        assert!(trunc);
        assert_eq!(s.chars().count(), MAX_OUTPUT_CHARS);
        assert!(s.ends_with('a'));
    }

    #[test]
    fn potong_tidak_mengubah_yang_pendek() {
        let (s, trunc) = potong_ekor("halo");
        assert_eq!(s, "halo");
        assert!(!trunc);
    }

    #[test]
    fn potong_berfokus_di_akhir_output() {
        let teks = format!("{}AKHIR-SEBAGAI-TANDA", "x".repeat(MAX_OUTPUT_CHARS + 10));
        let (s, _) = potong_ekor(&teks);
        assert!(s.ends_with("AKHIR-SEBAGAI-TANDA"));
    }

    #[test]
    fn timeout_dibatasi_ke_maksimum() {
        let kecil = 10u64;
        assert!(kecil.clamp(1_000, MAX_TIMEOUT_MS) == 1_000);
        let besar = 9_000_000u64;
        assert!(besar.clamp(1_000, MAX_TIMEOUT_MS) == MAX_TIMEOUT_MS);
    }

    #[test]
    fn shell_ditemukan() {
        let (s, _) = shell_for("echo hi");
        assert!(!s.is_empty());
    }

    #[cfg(windows)]
    #[test]
    fn build_membungkus_dengan_flag_cmd() {
        let dir = std::env::temp_dir();
        let c = build("echo halo", dir).expect("build harus berhasil");
        let s = format!("{:?}", c);
        assert!(s.contains("/d /s /c") || s.contains("/c"), "perintah harus dibungkus shell");
    }
}
