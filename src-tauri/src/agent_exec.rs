use crate::app_state::AppState;
use crate::errors::{ZResult, ZephyrError};
use serde::Serialize;
use std::path::PathBuf;
use std::process::Stdio;
use std::time::{Duration, Instant};
use tauri::State;

const MAX_OUTPUT_CHARS: usize = 20_000;
/*
 * Default when the model does not pass a timeout.
 *
 * 30s was too short for real work, and the failure it produced was silent:
 * a build, an install, or a test suite that legitimately runs for a minute was
 * killed, and the timeout branch below returns EMPTY stdout and stderr - so the
 * model saw a command that "ran" and said nothing at all. It then retried,
 * guessed, or gave up, which reads on screen as heavy work that keeps breaking
 * off. `bash_run` is the general-purpose command tool and cannot know in advance
 * whether it got a `dir` or a `cargo build`.
 *
 * 5 minutes covers a cold install or a full build; the caller can still pass an
 * explicit value (honored up to MAX_TIMEOUT_MS) and long-lived processes belong
 * in `bash_background` regardless.
 */
const DEFAULT_TIMEOUT_MS: u64 = 300_000;
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
    out_buf: &std::sync::Arc<tokio::sync::Mutex<Vec<u8>>>,
    err_buf: &std::sync::Arc<tokio::sync::Mutex<Vec<u8>>>,
) -> std::io::Result<(i32, String, String)> {
    use tokio::io::AsyncReadExt;

    /*
     * Output accumulates into SHARED buffers, not local ones.
     *
     * A local buffer only becomes readable when the future completes - and on
     * the timeout path the future is dropped, taking every byte with it. That is
     * how a timed-out command came back with `stdout: ""` and `stderr: ""`: the
     * model was told the command ran and produced nothing, which is
     * indistinguishable from a command that genuinely printed nothing. It then
     * retried or invented a reason, and the run looked broken.
     *
     * Reading incrementally means the timeout branch below can still return what
     * arrived before the deadline: usually the compiler error, the progress
     * line, or the prompt that explains WHY it was slow.
     */
    let so = out_pipe.as_mut();
    let se = err_pipe.as_mut();
    let ob = out_buf.clone();
    let eb = err_buf.clone();
    let t_out = async {
        if let Some(p) = so {
            let mut chunk = [0u8; 8192];
            loop {
                match p.read(&mut chunk).await {
                    Ok(0) | Err(_) => break,
                    Ok(n) => ob.lock().await.extend_from_slice(&chunk[..n]),
                }
            }
        }
    };
    let t_err = async {
        if let Some(p) = se {
            let mut chunk = [0u8; 8192];
            loop {
                match p.read(&mut chunk).await {
                    Ok(0) | Err(_) => break,
                    Ok(n) => eb.lock().await.extend_from_slice(&chunk[..n]),
                }
            }
        }
    };

    /*
     * The three run CONCURRENTLY, not in sequence.
     *
     * The earlier version awaited `child.wait()` first and only then joined the
     * readers - which meant the readers did not begin until the process had
     * already exited. On the happy path that still works (the pipes buffer the
     * output), but on the timeout path the whole future is dropped the moment
     * the deadline fires, and `child.wait()` never returns, so the readers never
     * even started and the shared buffers stayed empty. That is why a timed-out
     * command came back with nothing.
     *
     * Reading alongside the wait means every byte the process prints lands in
     * the shared buffer as it arrives, so the timeout branch can read whatever
     * was collected before the kill.
     */
    let (status, _, _) = tokio::join!(child.wait(), t_out, t_err);
    let stdout = String::from_utf8_lossy(&ob.lock().await).to_string();
    let stderr = String::from_utf8_lossy(&eb.lock().await).to_string();
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

    /*
     * Shared so the timeout branch can still hand back what arrived before the
     * deadline - see `jalan`. A killed command that returns its partial output
     * tells the model what happened; one that returns nothing tells it nothing.
     */
    let out_buf = std::sync::Arc::new(tokio::sync::Mutex::new(Vec::<u8>::new()));
    let err_buf = std::sync::Arc::new(tokio::sync::Mutex::new(Vec::<u8>::new()));

    let (exit_code, timed_out, stdout, stderr) = match tokio::time::timeout(
        Duration::from_millis(ms_cap),
        jalan(&mut child, &mut out_pipe, &mut err_pipe, &out_buf, &err_buf),
    )
    .await
    {
        Ok(Ok((code, so, se))) => (code, false, so, se),
        Ok(Err(e)) => {
            return Err(ZephyrError::Internal(format!(
                "waiting for the command failed: {e}"
            )));
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
            /*
             * Keep the partial output. The buffer is read AFTER the kill so it
             * holds everything the process managed to print; whatever the reader
             * task appended last is already in there because it locks per chunk.
             */
            let so = String::from_utf8_lossy(&out_buf.lock().await).to_string();
            let se = String::from_utf8_lossy(&err_buf.lock().await).to_string();
            (-1, true, so, se)
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
        assert!(
            s.contains("/d /s /c") || s.contains("/c"),
            "perintah harus dibungkus shell"
        );
    }
}
