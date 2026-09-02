// app_state.rs — state global Zephyr (ARCHITECTURE.md §5–§7).
// Menyimpan workspace aktif, whitelist path hasil dialog native,
// lokasi folder data user (%APPDATA%\zephyr\), dan sampler RAM.

use crate::errors::{ZResult, ZephyrError};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

pub struct AppState {
    /// Workspace (folder) yang sedang dibuka. None = belum buka folder.
    pub workspace: Mutex<Option<PathBuf>>,
    /// Path yang di-whitelist karena dipilih user lewat dialog native.
    /// Dipakai agar file di luar workspace tetap boleh dibaca/ditulis
    /// SETELAH user memilihnya sendiri (ARCHITECTURE.md §7.1).
    pub allowed: Mutex<HashSet<PathBuf>>,
    /// %APPDATA%\zephyr\
    pub data_dir: PathBuf,
    /// Semaphore git (dipakai fase 10) — 1 proses git sekaligus.
    #[allow(dead_code)]
    pub git_lock: Mutex<()>,
    /// Generasi watcher aktif (fase 04). Thread watcher berhenti sendiri
    /// begitu nilai ini melewati generasinya — dipakai saat ganti workspace.
    watch_generation: Arc<AtomicU64>,
    /// Sesi terminal hidup (fase 05), key = id pane.
    ptys: Mutex<HashMap<String, Arc<crate::pty::PtySession>>>,
    /// true saat window minimized: emit output PTY ditunda (output tetap
    /// dikumpulkan di buffer supaya tidak ada desync).
    render_paused: Arc<AtomicBool>,
    /// Permintaan AI yang sedang berjalan (fase 09), key = id request.
    /// Nilainya flag batal yang dibaca thread streaming tiap baris.
    ai_reqs: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

impl AppState {
    pub fn new() -> Self {
        let data_dir = resolve_data_dir();
        // Siapkan struktur folder sekali di startup; error diabaikan agar
        // app tetap jalan (command yang butuh folder akan melapor sendiri).
        let _ = std::fs::create_dir_all(&data_dir);
        let _ = std::fs::create_dir_all(data_dir.join("logs"));
        let _ = std::fs::create_dir_all(data_dir.join("extensions"));
        Self {
            workspace: Mutex::new(None),
            allowed: Mutex::new(HashSet::new()),
            data_dir,
            git_lock: Mutex::new(()),
            watch_generation: Arc::new(AtomicU64::new(0)),
            ptys: Mutex::new(HashMap::new()),
            render_paused: Arc::new(AtomicBool::new(false)),
            ai_reqs: Mutex::new(HashMap::new()),
        }
    }

    // ── permintaan AI (fase 09) ──

    /// Daftarkan request baru; kembalikan flag batal untuk thread streaming.
    pub fn ai_begin(&self, id: &str) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        if let Ok(mut m) = self.ai_reqs.lock() {
            // id yang sama dipakai ulang = permintaan lama dibatalkan dulu.
            if let Some(old) = m.insert(id.to_string(), flag.clone()) {
                old.store(true, Ordering::Relaxed);
            }
        }
        flag
    }

    /// true = ada request dengan id itu dan sudah ditandai batal.
    pub fn ai_cancel(&self, id: &str) -> bool {
        match self.ai_reqs.lock() {
            Ok(mut m) => match m.remove(id) {
                Some(flag) => {
                    flag.store(true, Ordering::Relaxed);
                    true
                }
                None => false,
            },
            Err(_) => false,
        }
    }

    // ── registry sesi PTY (fase 05) ──

    pub fn pty_insert(&self, session: crate::pty::PtySession) {
        if let Ok(mut map) = self.ptys.lock() {
            map.insert(session.id.clone(), Arc::new(session));
        }
    }

    pub fn pty_exists(&self, id: &str) -> bool {
        self.ptys
            .lock()
            .map(|m| m.contains_key(id))
            .unwrap_or(false)
    }

    pub fn pty_remove(&self, id: &str) {
        if let Ok(mut map) = self.ptys.lock() {
            map.remove(id);
        }
    }

    pub fn pty_list(&self) -> Vec<crate::pty::PtyInfo> {
        match self.ptys.lock() {
            Ok(map) => map.values().map(|s| s.info()).collect(),
            Err(_) => vec![],
        }
    }

    /// Jalankan aksi pada sesi tertentu. Arc di-clone dulu supaya lock
    /// registry TIDAK ditahan selama I/O (menghindari deadlock).
    pub fn with_pty<T, F>(&self, id: &str, f: F) -> ZResult<T>
    where
        F: FnOnce(&crate::pty::PtySession) -> ZResult<T>,
    {
        let session = {
            let map = self
                .ptys
                .lock()
                .map_err(|_| ZephyrError::Internal("registry pty terkunci".into()))?;
            map.get(id).cloned()
        };
        match session {
            Some(s) => f(&s),
            None => Err(ZephyrError::NotFound(format!("sesi terminal {id}"))),
        }
    }

    pub fn render_paused_flag(&self) -> Arc<AtomicBool> {
        self.render_paused.clone()
    }

    pub fn set_render_paused(&self, paused: bool) {
        self.render_paused.store(paused, Ordering::Relaxed);
    }

    /// Matikan semua terminal (dipakai saat app ditutup).
    pub fn pty_kill_all(&self) {
        let sessions: Vec<_> = match self.ptys.lock() {
            Ok(mut m) => m.drain().map(|(_, v)| v).collect(),
            Err(_) => return,
        };
        for s in sessions {
            s.terminate();
        }
    }

    // ── watcher (fase 04) ──

    /// Naikkan generasi lalu kembalikan generasi BARU untuk thread watcher.
    pub fn next_watch_generation(&self) -> u64 {
        self.watch_generation.fetch_add(1, Ordering::Relaxed) + 1
    }

    /// Handle yang dibaca thread watcher untuk tahu kapan harus berhenti.
    pub fn watch_stop_flag(&self) -> Arc<AtomicU64> {
        self.watch_generation.clone()
    }

    /// Minta semua watcher lama berhenti (dipanggil saat ganti/tutup workspace).
    pub fn stop_watcher(&self) {
        self.watch_generation.fetch_add(1, Ordering::Relaxed);
    }

    pub fn file(&self, name: &str) -> PathBuf {
        self.data_dir.join(name)
    }

    pub fn allow(&self, p: &Path) {
        if let Ok(mut set) = self.allowed.lock() {
            set.insert(normalize(p));
            // Folder induk file yang dipilih user ikut diizinkan supaya
            // "Save As" di folder yang sama tidak ditolak.
            if let Some(parent) = p.parent() {
                set.insert(normalize(parent));
            }
        }
    }

    pub fn workspace_path(&self) -> Option<PathBuf> {
        self.workspace.lock().ok().and_then(|w| w.clone())
    }

    /// Validasi path untuk operasi TULIS.
    /// Boleh bila: (a) dalam workspace aktif, atau (b) ada di whitelist
    /// dialog, atau (c) belum ada workspace sama sekali dan path
    /// di-whitelist. Selain itu -> WorkspaceOutside.
    pub fn ensure_writable(&self, p: &Path) -> ZResult<()> {
        let target = normalize(p);

        if let Some(ws) = self.workspace_path() {
            let ws = normalize(&ws);
            if target.starts_with(&ws) {
                return Ok(());
            }
        }

        if let Ok(set) = self.allowed.lock() {
            if set.contains(&target) {
                return Ok(());
            }
            // izinkan bila salah satu leluhur ada di whitelist
            let mut cur = target.parent().map(|x| x.to_path_buf());
            while let Some(c) = cur {
                if set.contains(&c) {
                    return Ok(());
                }
                cur = c.parent().map(|x| x.to_path_buf());
            }
        }

        Err(ZephyrError::WorkspaceOutside(
            p.to_string_lossy().to_string(),
        ))
    }

    /// Validasi path untuk operasi BACA. Lebih longgar dari tulis:
    /// file yang dipilih user via dialog/argumen tetap boleh dibaca,
    /// tapi tetap tolak path kosong / bukan absolut.
    pub fn ensure_readable(&self, p: &Path) -> ZResult<()> {
        if p.as_os_str().is_empty() {
            return Err(ZephyrError::InvalidInput("path kosong".into()));
        }
        Ok(())
    }
}

/// Normalisasi path untuk perbandingan: canonicalize bila file ada,
/// jika belum ada gabungkan parent yang sudah ada + sisa komponen.
/// Prefix `\\?\` dari Windows dibuang agar perbandingan konsisten.
pub fn normalize(p: &Path) -> PathBuf {
    let canon = match p.canonicalize() {
        Ok(c) => c,
        Err(_) => match p.parent().map(|x| x.canonicalize()) {
            Some(Ok(parent)) => match p.file_name() {
                Some(name) => parent.join(name),
                None => parent,
            },
            _ => p.to_path_buf(),
        },
    };
    strip_unc(&canon)
}

fn strip_unc(p: &Path) -> PathBuf {
    let s = p.to_string_lossy();
    match s.strip_prefix(r"\\?\") {
        Some(rest) => PathBuf::from(rest),
        None => p.to_path_buf(),
    }
}

fn resolve_data_dir() -> PathBuf {
    // PRD: data user di %APPDATA%\zephyr\ (bukan folder identifier).
    if let Ok(appdata) = std::env::var("APPDATA") {
        if !appdata.is_empty() {
            return PathBuf::from(appdata).join("zephyr");
        }
    }
    if let Ok(home) = std::env::var("USERPROFILE") {
        return PathBuf::from(home).join(".zephyr");
    }
    PathBuf::from(".zephyr")
}
