use crate::app_state::AppState;
use crate::errors::{ZResult, ZephyrError};
use serde::Serialize;
use std::process::Stdio;
use std::time::{Duration, Instant};
use tauri::State;

const MAX_OUTPUT_CHARS: usize = 20_000;
const DEFAULT_TIMEOUT_MS: u64 = 120_000;
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
) -> ZResult<ExecResult> {
    crate::workspace::ensure_trusted(&state, "Menjalankan perintah")?;

    let perintah = command.trim();
    if perintah.is_empty() {
        return Err(ZephyrError::InvalidInput("command kosong".into()));
    }
    let cwd = state
        .workspace_path()
        .ok_or_else(|| ZephyrError::InvalidInput("belum ada workspace".into()))?;

    let ms_cap = timeout_ms
        .unwrap_or(DEFAULT_TIMEOUT_MS)
        .clamp(1_000, MAX_TIMEOUT_MS);

    let started = Instant::now();
    let mut c = build(perintah, cwd)?;
    let mut child = c
        .spawn()
        .map_err(|e| ZephyrError::Internal(format!("gagal menjalankan perintah: {e}")))?;

    let mut out_pipe = child.stdout.take();
    let mut err_pipe = child.stderr.take();

    let (exit_code, timed_out, stdout, stderr) =
        match tokio::time::timeout(Duration::from_millis(ms_cap), jalan(&mut child, &mut out_pipe, &mut err_pipe)).await {
            Ok(Ok((code, so, se))) => (code, false, so, se),
            Ok(Err(e)) => {
                return Err(ZephyrError::Internal(format!("gagal menunggu perintah: {e}")));
            }
            Err(_) => {
                let _ = child.start_kill();
                tokio::time::sleep(Duration::from_millis(POLL_MS)).await;
                let _ = child.kill().await;
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
