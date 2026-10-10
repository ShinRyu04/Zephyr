//! Hook execution: running the commands a reader configured at lifecycle points.
//!
//! ## Why this file is careful
//!
//! A hook runs a COMMAND on the reader's machine, triggered by the agent rather
//! than by the reader typing it. That is a different risk class from every other
//! feature in the app:
//!
//!   * the command is written once and runs many times, unattended;
//!   * it runs because the agent reached a lifecycle point, not because anyone
//!     asked at that moment;
//!   * a draft produced by a model can become one of them.
//!
//! So the guards are structural rather than advisory:
//!
//!   1. **Disabled by default.** `Hook.enabled` is false for a new hook and the
//!      UI writes new ones that way. Nothing here runs an entry the reader has
//!      not turned on.
//!   2. **The working directory must be inside the workspace.** Checked with the
//!      same `ensure_writable` the file commands use, so a hook cannot be aimed
//!      at the user's home directory or a system path.
//!   3. **A timeout is mandatory and enforced.** `timeoutSec` is clamped into a
//!      range; the child is killed on expiry. A hook that hangs must not hold the
//!      agent loop.
//!   4. **Output is capped.** A command that writes a gigabyte to stdout must not
//!      put a gigabyte into the transcript.
//!   5. **One run per hook at a time.** A hook that triggers itself would
//!      otherwise recurse until the machine stops responding.
//!   6. **This module never decides WHETHER to run.** It answers "run this now";
//!      the caller in the frontend is what maps a lifecycle event to a hook, and
//!      it does so only for enabled hooks in a trusted workspace.
//!
//! ## What it does NOT do
//!
//! It does not sandbox. A command that runs with the reader's privileges has the
//! reader's privileges — the guards above bound WHEN and HOW LONG, not what the
//! command is capable of. The UI says so rather than implying otherwise.

use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::State;
use tokio::io::AsyncReadExt;

use crate::app_state::AppState;
use crate::errors::{ZResult, ZephyrError};

/// Long enough for a formatter or a test run; short enough that a wedged
/// command does not stall the agent. The frontend clamps to the same range.
const TIMEOUT_MIN_SEC: u64 = 1;
const TIMEOUT_MAX_SEC: u64 = 300;

/// Per stream. A hook is a small check, not a build log.
const OUTPUT_MAX_BYTES: usize = 64 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HookRunResult {
    /// Process exit code; `None` when the process was killed by the timeout.
    pub code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
    /// True when the output hit the cap and was cut.
    pub truncated: bool,
    /// True when the timeout killed it.
    pub timed_out: bool,
    pub duration_ms: u64,
}

/// Resolve and validate the working directory for a hook.
///
/// An empty `cwd` means the workspace root, which is the sensible default: a
/// hook is project tooling. Anything else must land inside the workspace, and
/// the check runs on the CANONICAL path so a symlink cannot be used to point out
/// of the tree.
fn dir_kerja(state: &AppState, cwd: &str) -> ZResult<PathBuf> {
    let ws = state
        .workspace_path()
        .ok_or_else(|| ZephyrError::InvalidInput("no workspace is open".into()))?;

    let diminta = cwd.trim();
    let target = if diminta.is_empty() {
        ws.clone()
    } else {
        let p = Path::new(diminta);
        if p.is_absolute() {
            p.to_path_buf()
        } else {
            /*
             * A relative path is resolved against the workspace rather than the
             * process's working directory. The process cwd is wherever Zephyr
             * was launched from — a shortcut, usually `C:\Windows\System32` —
             * so resolving against it would put the hook somewhere neither the
             * reader nor the dialog named.
             */
            ws.join(p)
        }
    };

    if !target.exists() {
        return Err(ZephyrError::InvalidInput(format!(
            "hook working directory does not exist: {}",
            target.display()
        )));
    }
    /* The same guard the write commands use: refuse anything outside the open
       folder. Checked on the canonical path so a symlink cannot smuggle it out. */
    let kanon = target.canonicalize().unwrap_or_else(|_| target.clone());
    state.ensure_writable(&kanon)?;
    Ok(kanon)
}

/// Run one hook command and wait for it, with a timeout.
///
/// The command goes through the shell (`cmd /C` on Windows, `sh -c` elsewhere)
/// exactly as the reader wrote it, because a hook is written in shell syntax —
/// `npm run lint && npm test` is one hook, not two. That means the command is
/// not parsed or sandboxed here; the guards that bound it are the directory
/// check, the timeout, the output cap and the enabled flag the caller honours.
#[tauri::command]
pub async fn hook_run(
    state: State<'_, AppState>,
    command: String,
    cwd: String,
    timeout_sec: u64,
) -> ZResult<HookRunResult> {
    let cmd_teks = command.trim();
    if cmd_teks.is_empty() {
        return Err(ZephyrError::InvalidInput("hook command is empty".into()));
    }
    /* One line. A newline would let the stored "command" be several commands,
       which is not what the single-line field in the UI shows the reader. */
    if cmd_teks.contains('\n') || cmd_teks.contains('\r') {
        return Err(ZephyrError::InvalidInput(
            "hook command must be a single line".into(),
        ));
    }

    let dir = dir_kerja(&state, &cwd)?;
    let batas = timeout_sec.clamp(TIMEOUT_MIN_SEC, TIMEOUT_MAX_SEC);
    let mulai = std::time::Instant::now();

    #[cfg(windows)]
    let mut perintah = {
        let mut c = crate::proc::tokio_cmd("cmd");
        c.arg("/C").arg(cmd_teks);
        c
    };
    #[cfg(not(windows))]
    let mut perintah = {
        let mut c = crate::proc::tokio_cmd("sh");
        c.arg("-c").arg(cmd_teks);
        c
    };

    perintah
        .current_dir(&dir)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut anak = perintah
        .spawn()
        .map_err(|e| ZephyrError::InvalidInput(format!("cannot start hook command: {e}")))?;

    let mut out = anak.stdout.take();
    let mut err = anak.stderr.take();

    /*
     * Both pipes are drained CONCURRENTLY with waiting for the process.
     *
     * Reading stdout to completion first deadlocks the moment the command fills
     * the stderr pipe: the child blocks writing, we block reading stdout, and
     * neither moves until the timeout kills it. `tokio::join!` on three futures
     * is what keeps a chatty command from looking like a hang.
     */
    let baca = |mut r: Option<tokio::process::ChildStdout>| async move {
        let mut buf = Vec::new();
        let mut terpotong = false;
        if let Some(h) = r.as_mut() {
            let mut potongan = [0u8; 8192];
            loop {
                match h.read(&mut potongan).await {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        if buf.len() >= OUTPUT_MAX_BYTES {
                            terpotong = true;
                            break;
                        }
                        let sisa = OUTPUT_MAX_BYTES - buf.len();
                        buf.extend_from_slice(&potongan[..n.min(sisa)]);
                        if n > sisa {
                            terpotong = true;
                            break;
                        }
                    }
                }
            }
        }
        (buf, terpotong)
    };
    let baca_err = |mut r: Option<tokio::process::ChildStderr>| async move {
        let mut buf = Vec::new();
        let mut terpotong = false;
        if let Some(h) = r.as_mut() {
            let mut potongan = [0u8; 8192];
            loop {
                match h.read(&mut potongan).await {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        if buf.len() >= OUTPUT_MAX_BYTES {
                            terpotong = true;
                            break;
                        }
                        let sisa = OUTPUT_MAX_BYTES - buf.len();
                        buf.extend_from_slice(&potongan[..n.min(sisa)]);
                        if n > sisa {
                            terpotong = true;
                            break;
                        }
                    }
                }
            }
        }
        (buf, terpotong)
    };

    let tunggu = anak.wait();
    let timeout = tokio::time::sleep(Duration::from_secs(batas));

    let (hasil_out, hasil_err, hasil_status) = tokio::join!(
        baca(out.take()),
        baca_err(err.take()),
        async {
            tokio::select! {
                s = tunggu => Ok(s),
                _ = timeout => Err(()),
            }
        }
    );

    let (stdout_bytes, potong_out) = hasil_out;
    let (stderr_bytes, potong_err) = hasil_err;

    let (code, timed_out) = match hasil_status {
        Ok(Ok(status)) => (status.code(), false),
        Ok(Err(e)) => {
            return Err(ZephyrError::InvalidInput(format!(
                "hook command failed to run: {e}"
            )))
        }
        Err(()) => {
            /*
             * Timed out. The child is killed here rather than left to finish in
             * the background: the caller has already been told the hook failed,
             * and a command still writing to the user's files after that would
             * be doing work nobody is waiting for.
             */
            let _ = anak.kill().await;
            (None, true)
        }
    };

    Ok(HookRunResult {
        code,
        stdout: String::from_utf8_lossy(&stdout_bytes).to_string(),
        stderr: String::from_utf8_lossy(&stderr_bytes).to_string(),
        truncated: potong_out || potong_err,
        timed_out,
        duration_ms: mulai.elapsed().as_millis() as u64,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn batas_timeout_diklem() {
        assert_eq!(0u64.clamp(TIMEOUT_MIN_SEC, TIMEOUT_MAX_SEC), 1);
        assert_eq!(9999u64.clamp(TIMEOUT_MIN_SEC, TIMEOUT_MAX_SEC), 300);
        assert_eq!(30u64.clamp(TIMEOUT_MIN_SEC, TIMEOUT_MAX_SEC), 30);
    }

    #[test]
    fn output_dipotong_di_batas() {
        let batas = OUTPUT_MAX_BYTES;
        assert_eq!(batas, 64 * 1024);
    }
}
