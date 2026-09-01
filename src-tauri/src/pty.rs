// pty.rs — terminal nyata lewat ConPTY (crate portable-pty).
//
// KEPUTUSAN IMPLEMENTASI (fase 05, JANGAN diganti di fase berikutnya):
// memakai `portable-pty` 0.8 — di Windows ia memakai ConPTY sehingga
// warna/ANSI, resize, dan Ctrl+C bekerja seperti terminal sungguhan.
// Tidak ada fallback ke pipa: ConPTY tersedia di Windows 10 1809+.
//
// Alur data:
//   pty_spawn  -> buka pty, spawn shell, jalankan 2 thread:
//                 (1) reader: baca 4KB, kirim ke channel
//                 (2) pengirim: gabung potongan tiap 16ms -> emit `pty-output`
//   pty_write  -> tulis ke master (termasuk \x03 untuk Ctrl+C)
//   pty_resize -> master.resize()
//   pty_kill   -> ChildKiller.kill() + bersihkan sesi
//   Saat proses berakhir sendiri -> emit `pty-exit` { id, code }.

use crate::app_state::AppState;
use crate::errors::{ZResult, ZephyrError};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::Serialize;
use serde_json::json;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};

/// Satu sesi terminal hidup.
pub struct PtySession {
    pub id: String,
    pub kind: String,
    pub shell: String,
    pub pid: Option<u32>,
    /// Penulis ke master pty (pemakaian di-serialisasi lewat Mutex).
    pub writer: Mutex<Box<dyn Write + Send>>,
    master: Mutex<Box<dyn portable_pty::MasterPty + Send>>,
    killer: Mutex<Box<dyn portable_pty::ChildKiller + Send + Sync>>,
    /// Penanda supaya thread reader berhenti saat sesi ditutup.
    alive: Arc<AtomicBool>,
}

impl PtySession {
    pub fn info(&self) -> PtyInfo {
        PtyInfo {
            id: self.id.clone(),
            kind: self.kind.clone(),
            shell: self.shell.clone(),
            pid: self.pid,
            alive: self.alive.load(Ordering::Relaxed),
        }
    }

    /// Hentikan proses anak (dipakai pty_kill dan saat app ditutup).
    pub fn terminate(&self) {
        self.alive.store(false, Ordering::Relaxed);
        if let Ok(mut k) = self.killer.lock() {
            let _ = k.kill();
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PtyInfo {
    pub id: String,
    pub kind: String,
    pub shell: String,
    pub pid: Option<u32>,
    pub alive: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellInfo {
    pub id: String,
    pub label: String,
    pub path: String,
}

/// Cari shell yang benar-benar ada di mesin ini (dipakai UI "+" dropdown).
#[tauri::command(async)]
pub fn list_shells() -> ZResult<Vec<ShellInfo>> {
    // fungsi bebas (bukan closure) supaya tidak menahan borrow `out`
    fn push(out: &mut Vec<ShellInfo>, id: &str, label: &str, path: std::path::PathBuf) {
        if path.exists() && !out.iter().any(|s| s.id == id) {
            out.push(ShellInfo {
                id: id.to_string(),
                label: label.to_string(),
                path: path.to_string_lossy().to_string(),
            });
        }
    }

    let mut out: Vec<ShellInfo> = Vec::new();
    let sysroot = std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".to_string());
    let sys32 = std::path::PathBuf::from(&sysroot).join("System32");

    push(
        &mut out,
        "powershell",
        "PowerShell",
        sys32.join(r"WindowsPowerShell\v1.0\powershell.exe"),
    );

    // PowerShell 7 (pwsh) bila terpasang.
    for base in [
        std::env::var("ProgramFiles").unwrap_or_default(),
        std::env::var("LOCALAPPDATA").unwrap_or_default(),
    ] {
        if base.is_empty() {
            continue;
        }
        push(
            &mut out,
            "pwsh",
            "PowerShell 7",
            std::path::PathBuf::from(&base).join(r"PowerShell\7\pwsh.exe"),
        );
    }

    push(&mut out, "cmd", "Command Prompt", sys32.join("cmd.exe"));
    push(
        &mut out,
        "bash",
        "Git Bash",
        std::path::PathBuf::from(
            std::env::var("ProgramFiles").unwrap_or_else(|_| r"C:\Program Files".into()),
        )
        .join(r"Git\bin\bash.exe"),
    );
    push(&mut out, "wsl", "WSL", sys32.join("wsl.exe"));

    Ok(out)
}

fn resolve_shell(kind: &str, explicit: Option<&str>) -> ZResult<(String, Vec<String>)> {
    if let Some(cmd) = explicit.filter(|c| !c.trim().is_empty()) {
        return Ok((cmd.to_string(), vec![]));
    }
    let shells = list_shells()?;
    let find = |id: &str| shells.iter().find(|s| s.id == id).map(|s| s.path.clone());

    match kind {
        // Private: PowerShell -NoProfile + PSReadLine SaveNothing supaya
        // perintah TIDAK masuk ConsoleHost_history.txt milik user.
        "private" => {
            let ps = find("pwsh")
                .or_else(|| find("powershell"))
                .ok_or_else(|| ZephyrError::Pty("PowerShell tidak ditemukan".into()))?;
            Ok((
                ps,
                vec![
                    "-NoLogo".into(),
                    "-NoProfile".into(),
                    "-NoExit".into(),
                    "-Command".into(),
                    // SaveNothing = riwayat sesi ini tidak ditulis ke disk.
                    "Set-PSReadLineOption -HistorySaveStyle SaveNothing -ErrorAction SilentlyContinue; \
                     Write-Host 'Zephyr Private Terminal — riwayat tidak disimpan ke disk' \
                     -ForegroundColor DarkGray"
                        .into(),
                ],
            ))
        }
        "cmd" => Ok((
            find("cmd").ok_or_else(|| ZephyrError::Pty("cmd.exe tidak ditemukan".into()))?,
            vec![],
        )),
        "bash" => Ok((
            find("bash").ok_or_else(|| ZephyrError::Pty("bash tidak ditemukan".into()))?,
            vec!["--login".into(), "-i".into()],
        )),
        "wsl" => Ok((
            find("wsl").ok_or_else(|| ZephyrError::Pty("wsl tidak ditemukan".into()))?,
            vec![],
        )),
        "pwsh" => Ok((
            find("pwsh").ok_or_else(|| ZephyrError::Pty("pwsh tidak ditemukan".into()))?,
            vec!["-NoLogo".into()],
        )),
        // Agent CLI (fase 06): program datang dari Settings.startCommands
        // lewat parameter `command`/`args`. Kalau sampai ke sini berarti
        // frontend tidak mengirimnya — itu bug, bukan kondisi normal.
        "agent" => Err(ZephyrError::InvalidInput(
            "kind 'agent' wajib menyertakan command".into(),
        )),
        // default: PowerShell biasa (profil user tetap dipakai)
        _ => Ok((
            find("powershell")
                .or_else(|| find("pwsh"))
                .ok_or_else(|| ZephyrError::Pty("PowerShell tidak ditemukan".into()))?,
            vec!["-NoLogo".into()],
        )),
    }
}

/// Akses `resolve_shell` untuk unit test (tests_fs.rs) tanpa membuka pty.
#[cfg(test)]
pub fn resolve_shell_for_test(
    kind: &str,
    explicit: Option<&str>,
) -> ZResult<(String, Vec<String>)> {
    resolve_shell(kind, explicit)
}

#[allow(clippy::too_many_arguments)]
#[tauri::command(async)]
pub fn pty_spawn(
    app: AppHandle,
    state: State<AppState>,
    id: String,
    kind: Option<String>,
    command: Option<String>,
    args: Option<Vec<String>>,
    cwd: Option<String>,
    cols: Option<u16>,
    rows: Option<u16>,
) -> ZResult<u32> {
    if id.trim().is_empty() {
        return Err(ZephyrError::InvalidInput("id kosong".into()));
    }
    if state.pty_exists(&id) {
        return Err(ZephyrError::InvalidInput(format!("sesi {id} sudah ada")));
    }

    let kind = kind.unwrap_or_else(|| "shell".to_string());
    let (program, default_args) = resolve_shell(&kind, command.as_deref())?;
    let argv = match args {
        Some(a) if !a.is_empty() => a,
        _ => default_args,
    };

    // cwd: workspace bila ada, kalau tidak %USERPROFILE%.
    let workdir = cwd
        .filter(|c| !c.trim().is_empty())
        .map(std::path::PathBuf::from)
        .or_else(|| state.workspace_path())
        .or_else(|| std::env::var("USERPROFILE").ok().map(Into::into))
        .unwrap_or_else(|| std::path::PathBuf::from("."));

    let size = PtySize {
        rows: rows.unwrap_or(24).max(1),
        cols: cols.unwrap_or(80).max(1),
        pixel_width: 0,
        pixel_height: 0,
    };

    let pair = native_pty_system()
        .openpty(size)
        .map_err(|e| ZephyrError::Pty(format!("openpty gagal: {e}")))?;

    let mut cmd = CommandBuilder::new(&program);
    for a in &argv {
        cmd.arg(a);
    }
    if workdir.is_dir() {
        cmd.cwd(&workdir);
    }
    cmd.env("TERM", "xterm-256color");
    cmd.env("ZEPHYR_TERMINAL", "1");
    if kind == "private" {
        cmd.env("ZEPHYR_PRIVATE", "1");
    }

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| ZephyrError::Pty(format!("spawn {program} gagal: {e}")))?;
    let pid = child.process_id();

    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| ZephyrError::Pty(format!("clone reader gagal: {e}")))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| ZephyrError::Pty(format!("take writer gagal: {e}")))?;
    let killer = child.clone_killer();

    let alive = Arc::new(AtomicBool::new(true));

    state.pty_insert(PtySession {
        id: id.clone(),
        kind: kind.clone(),
        shell: program.clone(),
        pid,
        writer: Mutex::new(writer),
        master: Mutex::new(pair.master),
        killer: Mutex::new(killer),
        alive: alive.clone(),
    });

    // ── thread 1: baca byte mentah dari pty ──
    let (tx, rx) = mpsc::channel::<Vec<u8>>();
    let alive_reader = alive.clone();
    std::thread::spawn(move || {
        let mut reader = reader;
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break, // EOF: shell keluar
                Ok(n) => {
                    if tx.send(buf[..n].to_vec()).is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
            if !alive_reader.load(Ordering::Relaxed) {
                break;
            }
        }
        alive_reader.store(false, Ordering::Relaxed);
    });

    // ── thread 2: gabung potongan tiap 16ms lalu emit ke frontend ──
    let app_emit = app.clone();
    let emit_id = id.clone();
    let alive_emit = alive.clone();
    let paused = state.render_paused_flag();
    std::thread::spawn(move || {
        let mut pending: Vec<u8> = Vec::with_capacity(16 * 1024);
        let mut last = Instant::now();

        loop {
            match rx.recv_timeout(Duration::from_millis(16)) {
                Ok(chunk) => pending.extend_from_slice(&chunk),
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }

            // Saat window minimized, output TETAP dikumpulkan (tidak hilang),
            // hanya pengirimannya ditunda supaya tidak membuang CPU render.
            let hold = paused.load(Ordering::Relaxed) && pending.len() < 512 * 1024;

            if !pending.is_empty() && !hold && last.elapsed() >= Duration::from_millis(16) {
                let data = String::from_utf8_lossy(&pending).to_string();
                pending.clear();
                last = Instant::now();
                if app_emit
                    .emit("pty-output", json!({ "id": emit_id, "data": data }))
                    .is_err()
                {
                    return; // app tutup
                }
            }
        }

        // Sisa buffer sebelum memberi tahu proses berakhir.
        if !pending.is_empty() {
            let data = String::from_utf8_lossy(&pending).to_string();
            let _ = app_emit.emit("pty-output", json!({ "id": emit_id, "data": data }));
        }
        alive_emit.store(false, Ordering::Relaxed);
        let _ = app_emit.emit("pty-exit", json!({ "id": emit_id }));
    });

    Ok(pid.unwrap_or(0))
}

#[tauri::command(async)]
pub fn pty_write(state: State<AppState>, id: String, data: String) -> ZResult<()> {
    state.with_pty(&id, |s| {
        let mut w = s
            .writer
            .lock()
            .map_err(|_| ZephyrError::Pty("writer terkunci".into()))?;
        w.write_all(data.as_bytes())
            .map_err(|e| ZephyrError::Pty(format!("tulis gagal: {e}")))?;
        w.flush()
            .map_err(|e| ZephyrError::Pty(format!("flush gagal: {e}")))?;
        Ok(())
    })
}

#[tauri::command(async)]
pub fn pty_resize(state: State<AppState>, id: String, cols: u16, rows: u16) -> ZResult<()> {
    state.with_pty(&id, |s| {
        let m = s
            .master
            .lock()
            .map_err(|_| ZephyrError::Pty("master terkunci".into()))?;
        m.resize(PtySize {
            rows: rows.max(1),
            cols: cols.max(1),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| ZephyrError::Pty(format!("resize gagal: {e}")))
    })
}

#[tauri::command(async)]
pub fn pty_kill(state: State<AppState>, id: String) -> ZResult<()> {
    // Kill dulu (butuh &self), baru hapus dari registry.
    state.with_pty(&id, |s| {
        s.terminate();
        Ok(())
    })?;
    state.pty_remove(&id);
    Ok(())
}

#[tauri::command(async)]
pub fn pty_list(state: State<AppState>) -> ZResult<Vec<PtyInfo>> {
    Ok(state.pty_list())
}

/// Dipanggil frontend saat window minimize/restore: menunda emit output
/// (bukan menghentikan pembacaan) agar tidak ada desync.
#[tauri::command(async)]
pub fn pty_set_paused(state: State<AppState>, paused: bool) -> ZResult<()> {
    state.set_render_paused(paused);
    Ok(())
}

/// Ctrl+C: hentikan program yang sedang berjalan di terminal, shell tetap hidup.
///
/// CATATAN JUJUR (jangan diubah tanpa uji ulang):
/// 1. Menulis byte `0x03` ke pty saja TIDAK cukup di ConPTY. Program yang
///    tidak membaca stdin (`ping -t`, loop PowerShell) tidak pernah
///    melihatnya dan terus berjalan.
/// 2. Cara "resmi" (AttachConsole ke konsol child + GenerateConsoleCtrlEvent)
///    SUDAH DICOBA dan membuat proses Zephyr sendiri mati — event Ctrl+C
///    ikut mengenai proses kita walau `SetConsoleCtrlHandler(NULL, TRUE)`
///    sudah dipasang. JANGAN pakai jalur itu.
/// 3. Yang dipakai sekarang: `0x03` (agar PSReadLine membatalkan baris yang
///    sedang diketik) + terminasi proses turunan shell. Efek yang dilihat
///    user sama seperti Ctrl+C: program berhenti, prompt kembali.
///    Bedanya: program tidak dapat kesempatan cleanup seperti SIGINT asli.
#[tauri::command(async)]
pub fn pty_interrupt(state: State<AppState>, id: String) -> ZResult<u32> {
    let shell_pid = state.with_pty(&id, |s| {
        // 0x03 dulu: shell interaktif membatalkan input yang sedang diketik.
        if let Ok(mut w) = s.writer.lock() {
            let _ = w.write_all(b"\x03");
            let _ = w.flush();
        }
        s.pid
            .ok_or_else(|| ZephyrError::Pty("pid tidak diketahui".into()))
    })?;

    // Cari seluruh turunan shell (anak, cucu, ...) lalu hentikan yang
    // terdalam lebih dulu supaya program utama tidak sempat re-spawn.
    let mut sys = sysinfo::System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    let target = sysinfo::Pid::from_u32(shell_pid);
    let mut descendants: Vec<(usize, sysinfo::Pid)> = Vec::new();

    for (pid, proc_) in sys.processes() {
        if *pid == target {
            continue;
        }
        // Telusuri rantai parent maksimum 12 tingkat.
        let mut cur = proc_.parent();
        let mut depth = 1usize;
        while let Some(p) = cur {
            if p == target {
                descendants.push((depth, *pid));
                break;
            }
            cur = sys.process(p).and_then(|x| x.parent());
            depth += 1;
            if depth > 12 {
                break;
            }
        }
    }

    // Terdalam dulu.
    descendants.sort_by(|a, b| b.0.cmp(&a.0));

    let mut killed = 0u32;
    for (_, pid) in descendants {
        if let Some(p) = sys.process(pid) {
            if p.kill() {
                killed += 1;
            }
        }
    }

    Ok(killed)
}
