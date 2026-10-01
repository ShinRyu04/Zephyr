//! SFTP and port forwarding, driven by the OpenSSH client Windows already
//! ships (`ssh.exe`, `sftp.exe`).
//!
//! No SSH library is linked in on purpose: a native client would add a large
//! dependency tree for the same result, and the bundled OpenSSH is the same
//! binary the user's terminal already uses, so a host in `known_hosts` behaves
//! identically here and there.
//!
//! Passwords are never passed on the command line: `ssh` cannot take one there,
//! and it would land in the process list. A private key (or ssh-agent) is the
//! supported path, which is also the safer one.

use crate::errors::{ZResult, ZephyrError};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpEntry {
    pub nama: String,
    pub direktori: bool,
    pub ukuran: u64,
    /// Permissions as reported by `sftp`, e.g. "drwxr-xr-x".
    pub mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpHostInfo {
    pub host: String,
    pub port: u16,
    pub user: String,
}

/// Port forwards Zephyr started, by tunnel id, so a stop only ever kills a
/// tunnel this app owns.
static TUNNEL: Mutex<Vec<(String, u32)>> = Mutex::new(Vec::new());
static ANAK: Mutex<Vec<std::process::Child>> = Mutex::new(Vec::new());

/// Path to the OpenSSH client, if this machine has one.
///
/// Windows ships OpenSSH at a fixed location that is NOT always on PATH — the
/// System32\OpenSSH directory is added by an optional feature, and a GUI process
/// started before that feature was enabled keeps the old environment. Running
/// `ssh -V` alone therefore reported "not installed" on machines that have it.
/// The well-known paths are checked first, then PATH as a fallback.
pub fn ssh_path() -> Option<std::path::PathBuf> {
    #[cfg(windows)]
    {
        for kandidat in [
            r"C:\Windows\System32\OpenSSH\ssh.exe",
            r"C:\Program Files\OpenSSH\ssh.exe",
            r"C:\Program Files (x86)\OpenSSH\ssh.exe",
        ] {
            let p = std::path::Path::new(kandidat);
            if p.is_file() {
                return Some(p.to_path_buf());
            }
        }
    }
    // PATH lookup: `ssh -V` writes to stderr but still exits 0 when found.
    if crate::proc::cmd("ssh").arg("-V").output().is_ok() {
        return Some(std::path::PathBuf::from("ssh"));
    }
    None
}

fn ada_ssh() -> bool {
    ssh_path().is_some()
}

fn ssh_ok() -> ZResult<()> {
    if ada_ssh() {
        Ok(())
    } else {
        Err(ZephyrError::NotFound(
            "ssh.exe not found. Install the OpenSSH Client via Settings > Apps > Optional features.".into(),
        ))
    }
}

/// Common flags: batch mode so a password prompt can never hang the call,
/// a short connect timeout, and no pseudo-terminal.
fn args_umum(host: &str, port: u16, user: &str) -> Vec<String> {
    let mut a = vec![
        "-o".into(),
        "BatchMode=yes".into(),
        "-o".into(),
        "ConnectTimeout=10".into(),
        "-o".into(),
        "StrictHostKeyChecking=accept-new".into(),
        "-p".into(),
        port.to_string(),
    ];
    a.push(if user.is_empty() {
        host.to_string()
    } else {
        format!("{user}@{host}")
    });
    a
}

/// Run one `sftp -b -` batch script and return its stdout.
fn sftp_batch(host: &str, port: u16, user: &str, skrip: &str) -> ZResult<String> {
    ssh_ok()?;
    // sftp.exe sits beside ssh.exe; resolve the same way so a PATH-less
    // install still works.
    let sftp_bin = ssh_path()
        .map(|p| p.with_file_name("sftp.exe"))
        .unwrap_or_else(|| std::path::PathBuf::from("sftp"));
    let mut c = crate::proc::cmd(&sftp_bin);
    c.arg("-q")
        .arg("-b")
        .arg("-")
        .arg("-o")
        .arg("BatchMode=yes")
        .arg("-o")
        .arg("ConnectTimeout=10")
        .arg("-o")
        .arg("StrictHostKeyChecking=accept-new")
        .arg("-P")
        .arg(port.to_string())
        .arg(if user.is_empty() {
            host.to_string()
        } else {
            format!("{user}@{host}")
        })
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    let mut anak = c
        .spawn()
        .map_err(|e| ZephyrError::Io(format!("failed menjalankan sftp: {e}")))?;

    if let Some(mut si) = anak.stdin.take() {
        use std::io::Write;
        let _ = si.write_all(skrip.as_bytes());
    }

    let out = anak
        .wait_with_output()
        .map_err(|e| ZephyrError::Io(format!("sftp failed: {e}")))?;

    if !out.status.success() {
        let pesan = String::from_utf8_lossy(&out.stderr);
        let bersih = pesan.lines().take(4).collect::<Vec<_>>().join(" | ");
        return Err(ZephyrError::InvalidInput(format!("sftp: {bersih}")));
    }
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

/// Parse `ls -l` output. Split out so the format handling is testable without
/// a live server: OpenSSH for Windows differs from Linux, and getting a column
/// wrong is silent (every size becomes 1) rather than loud.
fn parse_ls(keluaran: &str) -> Vec<SftpEntry> {
    let mut out = Vec::new();
    for baris in keluaran.lines() {
        let b = baris.trim();
        if b.is_empty() || b.starts_with("sftp>") || b.starts_with("total") {
            continue;
        }
        // drwxr-xr-x  1 user group  4096 Jan 1 00:00 name
        let bagian: Vec<&str> = b.split_whitespace().collect();
        // mode, links, owner, group, size, then a three-field date, then name.
        if bagian.len() < 9 {
            continue;
        }
        let mode = bagian[0];
        if mode.len() < 2
            || (!mode.starts_with('d') && !mode.starts_with('-') && !mode.starts_with('l'))
        {
            continue;
        }
        // The name starts after the date, so a name containing spaces survives.
        let nama = bagian[8..].join(" ");
        if nama == "." || nama == ".." {
            continue;
        }
        // Layout is fixed: [0] mode, [1] links, [2] owner, [3] group,
        // [4] size, [5..8] date, [8..] name. Searching backwards for a number
        // would find the day-of-month instead of the size.
        let ukuran = bagian[4].parse::<u64>().unwrap_or(0);
        out.push(SftpEntry {
            direktori: mode.starts_with('d'),
            nama,
            ukuran,
            mode: mode.to_string(),
        });
    }
    out
}

/// List a remote directory. `ls -l` is parsed because it is the only listing
/// the batch interface gives in a stable shape.
#[tauri::command(async)]
pub fn sftp_list(
    host: String,
    port: Option<u16>,
    user: String,
    path: String,
) -> ZResult<Vec<SftpEntry>> {
    let port = port.unwrap_or(22);
    let skrip = format!("ls -l {}\n", if path.trim().is_empty() { "." } else { path.trim() });
    let keluaran = sftp_batch(&host, port, &user, &skrip)?;
    Ok(parse_ls(&keluaran))
}

/// Upload one local file to a remote path.
#[tauri::command(async)]
pub fn sftp_upload(
    host: String,
    port: Option<u16>,
    user: String,
    lokal: String,
    remote: String,
) -> ZResult<()> {
    let port = port.unwrap_or(22);
    let l = PathBuf::from(&lokal);
    if !l.is_file() {
        return Err(ZephyrError::InvalidInput(format!(
            "local file is missing: {lokal}"
        )));
    }
    // Quote both sides: a path with a space would otherwise split into two
    // sftp commands.
    let skrip = format!("put \"{}\" \"{}\"\n", lokal, remote);
    let _ = sftp_batch(&host, port, &user, &skrip)?;
    Ok(())
}

/// Download one remote file to a local path.
#[tauri::command(async)]
pub fn sftp_download(
    host: String,
    port: Option<u16>,
    user: String,
    remote: String,
    lokal: String,
) -> ZResult<()> {
    let port = port.unwrap_or(22);
    let skrip = format!("get \"{}\" \"{}\"\n", remote, lokal);
    let _ = sftp_batch(&host, port, &user, &skrip)?;
    Ok(())
}

/// Start a local port forward: `-L <local>:<target>:<targetPort>`.
#[tauri::command(async)]
pub fn sftp_tunnel_start(
    id: String,
    host: String,
    port: Option<u16>,
    user: String,
    local_port: u16,
    target_host: String,
    target_port: u16,
) -> ZResult<u32> {
    ssh_ok()?;
    let port = port.unwrap_or(22);

    let mut a: Vec<String> = vec![
        "-N".into(),
        "-o".into(),
        "BatchMode=yes".into(),
        "-o".into(),
        "ExitOnForwardFailure=yes".into(),
        "-o".into(),
        "ConnectTimeout=10".into(),
        "-o".into(),
        "StrictHostKeyChecking=accept-new".into(),
        "-L".into(),
        format!("{local_port}:{target_host}:{target_port}"),
        "-p".into(),
        port.to_string(),
        if user.is_empty() {
            host.clone()
        } else {
            format!("{user}@{host}")
        },
    ];
    // Keyboard-interactive is refused in batch mode, so a host that needs a
    // password fails fast with a message instead of hanging on a prompt.
    a.push("-o".into());
    a.push("NumberOfPasswordPrompts=0".into());

    let ssh_bin = ssh_path().unwrap_or_else(|| std::path::PathBuf::from("ssh"));
    let mut c = crate::proc::cmd(&ssh_bin);
    c.args(&a)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped());

    let anak = c
        .spawn()
        .map_err(|e| ZephyrError::Io(format!("failed menjalankan ssh: {e}")))?;
    let pid = anak.id();

    if let Ok(mut g) = ANAK.lock() {
        g.retain_mut(|c| c.try_wait().ok().flatten().is_none());
        g.push(anak);
    }
    if let Ok(mut g) = TUNNEL.lock() {
        g.retain(|(_, p)| *p != pid);
        g.push((id, pid));
    }
    Ok(pid)
}

/// Stop a tunnel. Only a tunnel Zephyr started can be stopped.
#[tauri::command(async)]
pub fn sftp_tunnel_stop(id: String) -> ZResult<bool> {
    let pid = {
        let g = TUNNEL.lock().map_err(|_| ZephyrError::Internal("tunnel is locked".into()))?;
        g.iter().find(|(k, _)| k == &id).map(|(_, p)| *p)
    };
    let Some(pid) = pid else {
        return Ok(false);
    };
    let _ = crate::proc::cmd("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .output();
    if let Ok(mut g) = TUNNEL.lock() {
        g.retain(|(k, _)| k != &id);
    }
    Ok(true)
}

/// Live tunnels, so the panel can show state after a reload.
#[tauri::command(async)]
pub fn sftp_tunnel_list() -> ZResult<Vec<String>> {
    Ok(TUNNEL.lock().map(|g| g.iter().map(|(k, _)| k.clone()).collect()).unwrap_or_default())
}

/// Whether the OpenSSH client is present, so the UI can say so up front.
#[tauri::command(async)]
pub fn sftp_available() -> ZResult<bool> {
    Ok(ada_ssh())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn args_umum_memakai_port_dan_user() {
        let a = args_umum("contoh.test", 2222, "budi");
        assert!(a.contains(&"2222".to_string()));
        assert!(a.contains(&"budi@contoh.test".to_string()));
    }

    #[test]
    fn args_umum_tanpa_user() {
        let a = args_umum("contoh.test", 22, "");
        assert!(a.contains(&"contoh.test".to_string()));
        assert!(!a.iter().any(|x| x.starts_with('@')));
    }

    #[test]
    fn ssh_terdeteksi() {
        // The machine this runs on must have it; the panel depends on it.
        assert!(ada_ssh(), "ssh.exe tidak ditemukan");
    }

    /// OpenSSH for Windows prints `ls -l` differently from Linux: the mode ends
    /// in stars, owner/group are `-`, and the size is the third numeric column.
    /// Reading the first number picked up the link count and called every entry
    /// one byte, which is the bug this guards.
    #[test]
    fn parsing_ls_openssh_windows() {
        let keluaran = "\
drwx******    1 -        -               0 Jul 19 16:38 AndroidStudioProjects
drwx******    1 -        -            4096 Sep 27 14:34 Desktop
-rw******     1 -        -              42 Sep 28 11:20 zephyr-sftp-uji.txt
drwx******    1 -        -               0 Jun 15 20:27 Cisco Packet Tracer 9.0.0
";
        let entri = parse_ls(keluaran);
        assert_eq!(entri.len(), 4, "harus empat entri");

        let berkas = entri.iter().find(|e| e.nama == "zephyr-sftp-uji.txt").expect("berkas ada");
        assert!(!berkas.direktori);
        assert_eq!(berkas.ukuran, 42, "ukuran harus 42, bukan link count");

        let dir = entri.iter().find(|e| e.nama == "Desktop").expect("dir ada");
        assert!(dir.direktori);
        assert_eq!(dir.ukuran, 4096);

        // A name with spaces must survive intact.
        assert!(
            entri.iter().any(|e| e.nama == "Cisco Packet Tracer 9.0.0"),
            "nama berspasi harus utuh"
        );
    }

    #[test]
    fn parsing_melewati_baris_sampah() {
        let entri = parse_ls("sftp> ls -l\ntotal 12\n.\n..\n-rw****** 1 - - 7 Jan 1 00:00 a.txt\n");
        assert_eq!(entri.len(), 1);
        assert_eq!(entri[0].nama, "a.txt");
        assert_eq!(entri[0].ukuran, 7);
    }
}
