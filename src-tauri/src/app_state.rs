// app_state.rs — state global Zephyr (ARCHITECTURE.md §5–§7).
// Menyimpan workspace aktif, whitelist path hasil dialog native,
// lokasi folder data user (%APPDATA%\zephyr\), sampler RAM, dan registry
// per-domain (pty / ai / mcp / ekstensi).
//
// FASE 14 (hardening) — aturan yang dipegang di file ini:
//   * Setiap domain punya SATU `RwLock` sendiri. Tidak ada lock global,
//     jadi `git status` yang berjalan lama tidak memblokir output terminal.
//   * Semua akses lewat helper `read_lock` / `write_lock`: kalau lock tidak
//     bisa diambil dalam 500ms, helper MENCATAT ke log lalu mengembalikan
//     `ZephyrError::Internal` — TIDAK PANIK, dan tidak menunggu selamanya.
//   * Lock yang ter-poison (thread lain panik saat memegangnya) dipulihkan
//     (`into_inner`) alih-alih membuat seluruh app mati.
//   * Git diserialisasi dengan `tokio::sync::Semaphore` 1 permit (14.3):
//     maksimum satu proses `git` sekaligus supaya index tidak korup.
//   * Lock TIDAK PERNAH ditahan selama I/O: `with_pty` meng-clone `Arc`
//     sesi dulu, lalu melepas lock registry sebelum menulis ke pty.

use crate::errors::{ZResult, ZephyrError};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, RwLock, TryLockError};
use std::time::{Duration, Instant};

/// Batas tunggu satu lock domain. Lebih lama dari ini = ada yang salah;
/// lebih baik menolak operasi dengan pesan jelas daripada UI membeku.
const LOCK_BUDGET: Duration = Duration::from_millis(500);
/// Batas tunggu permit git (perintah git sendiri time-out 30s di git.rs,
/// jadi menunggu 90s = paling banyak dua perintah mengantre di depan).
const GIT_WAIT: Duration = Duration::from_secs(90);
/// Jeda antar percobaan saat menunggu lock/permit.
const SPIN: Duration = Duration::from_millis(4);

// ───────────────────────── helper lock ─────────────────────────

/// Ambil lock baca dengan batas waktu. Log + `Internal` bila gagal.
fn read_lock<'a, T>(lock: &'a RwLock<T>, name: &str) -> ZResult<std::sync::RwLockReadGuard<'a, T>> {
    let start = Instant::now();
    loop {
        match lock.try_read() {
            Ok(g) => return Ok(g),
            // Poisoned: pemegang sebelumnya panik. Datanya tetap dipakai —
            // mematikan seluruh app karena satu thread panik itu berlebihan.
            Err(TryLockError::Poisoned(g)) => {
                tracing::warn!(lock = name, "lock ter-poison, dipulihkan");
                return Ok(g.into_inner());
            }
            Err(TryLockError::WouldBlock) => {
                if start.elapsed() >= LOCK_BUDGET {
                    tracing::error!(lock = name, "lock baca sibuk >500ms — operasi ditolak");
                    return Err(ZephyrError::Internal(format!(
                        "state '{name}' sedang sibuk, coba lagi"
                    )));
                }
                std::thread::sleep(SPIN);
            }
        }
    }
}

/// Ambil lock tulis dengan batas waktu. Log + `Internal` bila gagal.
fn write_lock<'a, T>(
    lock: &'a RwLock<T>,
    name: &str,
) -> ZResult<std::sync::RwLockWriteGuard<'a, T>> {
    let start = Instant::now();
    loop {
        match lock.try_write() {
            Ok(g) => return Ok(g),
            Err(TryLockError::Poisoned(g)) => {
                tracing::warn!(lock = name, "lock ter-poison, dipulihkan");
                return Ok(g.into_inner());
            }
            Err(TryLockError::WouldBlock) => {
                if start.elapsed() >= LOCK_BUDGET {
                    tracing::error!(lock = name, "lock tulis sibuk >500ms — operasi ditolak");
                    return Err(ZephyrError::Internal(format!(
                        "state '{name}' sedang sibuk, coba lagi"
                    )));
                }
                std::thread::sleep(SPIN);
            }
        }
    }
}

pub struct AppState {
    /// Workspace (folder) yang sedang dibuka. None = belum buka folder.
    workspace: RwLock<Option<PathBuf>>,
    /// Path yang di-whitelist karena dipilih user lewat dialog native.
    /// Dipakai agar file di luar workspace tetap boleh dibaca/ditulis
    /// SETELAH user memilihnya sendiri (ARCHITECTURE.md §7.1).
    allowed: RwLock<HashSet<PathBuf>>,
    /// fase 29: root TAMBAHAN selain `workspace` (multi-root).
    ///
    /// `workspace` tetap jadi root AKTIF dan tetap jadi jawaban
    /// `workspace_path()` — 10 modul memakainya (git, search, tasks, dap,
    /// history, pty, explorer, dialogs, diagnostics). Daftar ini ditambahkan
    /// di sampingnya, dan hanya penjaga tulis yang belajar soal daftar; kalau
    /// `workspace` dibuang, setiap jalur tulis harus diubah dalam satu fase.
    roots_extra: RwLock<Vec<PathBuf>>,
    /// Nama tampil per root (dari .code-workspace), key = path lowercase.
    root_names: RwLock<HashMap<String, String>>,
    /// Path file .code-workspace yang sedang dipakai ('' = folder biasa).
    ws_file: RwLock<String>,
    /// Settings scope WORKSPACE (dari .code-workspace).
    ws_settings: RwLock<Option<serde_json::Value>>,
    /// %APPDATA%\zephyr\
    pub data_dir: PathBuf,
    /// Semaphore git (14.3) — 1 proses git sekaligus.
    git_sem: tokio::sync::Semaphore,
    /// Generasi watcher aktif (fase 04). Thread watcher berhenti sendiri
    /// begitu nilai ini melewati generasinya — dipakai saat ganti workspace.
    watch_generation: Arc<AtomicU64>,
    /// Sesi terminal hidup (fase 05), key = id pane.
    ptys: RwLock<HashMap<String, Arc<crate::pty::PtySession>>>,
    /// true saat window minimized: emit output PTY ditunda (output tetap
    /// dikumpulkan di buffer supaya tidak ada desync).
    render_paused: Arc<AtomicBool>,
    /// Permintaan AI yang sedang berjalan (fase 09), key = id request.
    /// Nilainya flag batal yang dibaca thread streaming tiap baris.
    ai_reqs: RwLock<HashMap<String, Arc<AtomicBool>>>,
    /// Server MCP yang sedang hidup (fase 11). None = tidak listening.
    mcp_rt: RwLock<Option<McpRuntime>>,
    /// Permintaan MCP yang menunggu jawaban frontend, key = reqId.
    /// Rust mengirim event `mcp-action`, frontend menjawab `mcp_reply`.
    mcp_pending: RwLock<HashMap<String, tokio::sync::oneshot::Sender<serde_json::Value>>>,
    /// Serialisasi method MCP: dua agent CLI yang mengemudi sekaligus
    /// diproses satu per satu (V11 fase 11), bukan saling menimpa.
    mcp_lock: tokio::sync::Mutex<()>,
    /// Isi file `main` ekstensi yang sudah dimuat (fase 13), key = id.
    /// Disimpan TAPI TIDAK dieksekusi — lihat catatan di extensions.rs.
    ext_code: RwLock<HashMap<String, String>>,
    /// Penanda waktu untuk Diagnostics (14.5): kapan proses mulai + marks.
    started: Instant,
    perf: RwLock<Vec<PerfMark>>,
    /// Penghitung ringkas untuk Diagnostics (jumlah operasi sejak start).
    counters: RwLock<HashMap<String, u64>>,
}

/// Satu titik ukur performa (dipakai About → Diagnostics).
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PerfMark {
    pub name: String,
    /// milidetik sejak proses mulai
    pub at_ms: u64,
    /// durasi operasi bila diketahui (None = titik waktu saja)
    pub dur_ms: Option<u64>,
}

/// Server MCP yang hidup: port yang benar-benar terikat + kanal shutdown.
pub struct McpRuntime {
    pub port: u16,
    /// Port yang DIMINTA saat start (bisa beda dari `port` bila terpakai).
    /// Disimpan di sini karena settings.mcp.port ditimpa port hasil bind —
    /// tanpa ini UI kehilangan info "9222 dipakai, jadi pindah".
    pub requested: u16,
    pub started: std::time::Instant,
    pub shutdown: tokio::sync::oneshot::Sender<()>,
}

/// Permit git: selama guard ini hidup, tidak ada proses git lain yang jalan.
pub struct GitPermit<'a> {
    _permit: tokio::sync::SemaphorePermit<'a>,
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
            workspace: RwLock::new(None),
            allowed: RwLock::new(HashSet::new()),
            roots_extra: RwLock::new(Vec::new()),
            root_names: RwLock::new(HashMap::new()),
            ws_file: RwLock::new(String::new()),
            ws_settings: RwLock::new(None),
            data_dir,
            git_sem: tokio::sync::Semaphore::new(1),
            watch_generation: Arc::new(AtomicU64::new(0)),
            ptys: RwLock::new(HashMap::new()),
            render_paused: Arc::new(AtomicBool::new(false)),
            ai_reqs: RwLock::new(HashMap::new()),
            mcp_rt: RwLock::new(None),
            mcp_pending: RwLock::new(HashMap::new()),
            mcp_lock: tokio::sync::Mutex::new(()),
            ext_code: RwLock::new(HashMap::new()),
            started: Instant::now(),
            perf: RwLock::new(Vec::new()),
            counters: RwLock::new(HashMap::new()),
        }
    }

    // ── diagnostics (fase 14.5) ──

    /// Umur proses dalam milidetik.
    pub fn uptime_ms(&self) -> u64 {
        self.started.elapsed().as_millis() as u64
    }

    /// Catat titik ukur. `dur_ms` opsional (durasi operasi).
    pub fn perf_mark(&self, name: &str, dur_ms: Option<u64>) {
        let mark = PerfMark {
            name: name.to_string(),
            at_ms: self.uptime_ms(),
            dur_ms,
        };
        if let Ok(mut v) = write_lock(&self.perf, "perf") {
            // Batas 200 entri: Diagnostics hanya butuh gambaran, bukan trace penuh.
            if v.len() >= 200 {
                v.remove(0);
            }
            v.push(mark);
        }
    }

    pub fn perf_marks(&self) -> Vec<PerfMark> {
        read_lock(&self.perf, "perf")
            .map(|v| v.clone())
            .unwrap_or_default()
    }

    /// Tambah penghitung operasi (mis. "fs_write", "git", "pty_spawn").
    pub fn bump(&self, key: &str) {
        if let Ok(mut m) = write_lock(&self.counters, "counters") {
            *m.entry(key.to_string()).or_insert(0) += 1;
        }
    }

    pub fn counters(&self) -> HashMap<String, u64> {
        read_lock(&self.counters, "counters")
            .map(|m| m.clone())
            .unwrap_or_default()
    }

    // ── git (fase 14.3) ──

    /// Ambil permit git (maks 1 proses git paralel). Menunggu sampai
    /// `GIT_WAIT`; lebih dari itu -> error, bukan menggantung selamanya.
    ///
    /// `try_acquire` dipakai dalam loop (bukan `.await`) karena semua command
    /// git adalah fungsi sinkron yang dijalankan Tauri di threadpool —
    /// `block_on` di thread itu bisa panik.
    pub fn git_permit(&self) -> ZResult<GitPermit<'_>> {
        let start = Instant::now();
        let mut warned = false;
        loop {
            match self.git_sem.try_acquire() {
                Ok(permit) => {
                    if warned {
                        tracing::debug!(
                            waited_ms = start.elapsed().as_millis() as u64,
                            "git antre"
                        );
                    }
                    return Ok(GitPermit { _permit: permit });
                }
                Err(_) => {
                    if !warned && start.elapsed() >= LOCK_BUDGET {
                        warned = true;
                        tracing::debug!("menunggu proses git lain selesai");
                    }
                    if start.elapsed() >= GIT_WAIT {
                        tracing::error!("permit git tidak didapat dalam 90s");
                        return Err(ZephyrError::Git(
                            "proses git lain masih berjalan — coba lagi".into(),
                        ));
                    }
                    std::thread::sleep(SPIN);
                }
            }
        }
    }

    // ── ekstensi (fase 13) ──

    /// Simpan isi file entry ekstensi (validasi ukuran di extensions.rs).
    pub fn ext_store_code(&self, id: &str, code: String) {
        if let Ok(mut m) = write_lock(&self.ext_code, "ext_code") {
            m.insert(id.to_string(), code);
        }
    }

    /// Jumlah byte kode yang tersimpan untuk satu ekstensi (0 = belum dimuat).
    #[allow(dead_code)]
    pub fn ext_code_len(&self, id: &str) -> usize {
        read_lock(&self.ext_code, "ext_code")
            .map(|m| m.get(id).map(|c| c.len()).unwrap_or(0))
            .unwrap_or(0)
    }

    // ── server MCP (fase 11) ──

    /// Simpan runtime server yang baru terikat.
    pub fn mcp_set_runtime(&self, rt: McpRuntime) {
        if let Ok(mut slot) = write_lock(&self.mcp_rt, "mcp_rt") {
            *slot = Some(rt);
        }
    }

    /// Ambil runtime keluar (untuk mengirim signal shutdown).
    pub fn mcp_take_runtime(&self) -> Option<McpRuntime> {
        write_lock(&self.mcp_rt, "mcp_rt")
            .ok()
            .and_then(|mut s| s.take())
    }

    /// Port yang sedang listening; None = server mati.
    pub fn mcp_port(&self) -> Option<u16> {
        read_lock(&self.mcp_rt, "mcp_rt")
            .ok()
            .and_then(|s| s.as_ref().map(|r| r.port))
    }

    /// Port yang DIMINTA saat start (untuk banner fallback di UI).
    pub fn mcp_requested_port(&self) -> Option<u16> {
        read_lock(&self.mcp_rt, "mcp_rt")
            .ok()
            .and_then(|s| s.as_ref().map(|r| r.requested))
    }

    pub fn mcp_uptime_ms(&self) -> u64 {
        read_lock(&self.mcp_rt, "mcp_rt")
            .ok()
            .and_then(|s| s.as_ref().map(|r| r.started.elapsed().as_millis() as u64))
            .unwrap_or(0)
    }

    /// Daftarkan permintaan ke frontend; kembalikan penerima jawabannya.
    pub fn mcp_register(&self, id: &str) -> tokio::sync::oneshot::Receiver<serde_json::Value> {
        let (tx, rx) = tokio::sync::oneshot::channel();
        if let Ok(mut m) = write_lock(&self.mcp_pending, "mcp_pending") {
            m.insert(id.to_string(), tx);
        }
        rx
    }

    /// Frontend menjawab. false = id tidak dikenal / sudah kadaluarsa.
    pub fn mcp_resolve(&self, id: &str, value: serde_json::Value) -> bool {
        let tx = match write_lock(&self.mcp_pending, "mcp_pending") {
            Ok(mut m) => m.remove(id),
            Err(_) => None,
        };
        match tx {
            Some(tx) => tx.send(value).is_ok(),
            None => false,
        }
    }

    /// Buang permintaan yang timeout supaya map tidak bocor.
    pub fn mcp_forget(&self, id: &str) {
        if let Ok(mut m) = write_lock(&self.mcp_pending, "mcp_pending") {
            m.remove(id);
        }
    }

    /// FASE 15.4: server dimatikan saat masih ada permintaan menggantung.
    /// Semua penunggu dijawab dengan error TERSTRUKTUR sekarang, bukan
    /// dibiarkan menunggu sampai `UI_TIMEOUT` (agent-nya terlihat hang).
    /// Mengembalikan jumlah permintaan yang dibatalkan.
    pub fn mcp_fail_pending(&self, reason: &str) -> usize {
        let drained: Vec<_> = match write_lock(&self.mcp_pending, "mcp_pending") {
            Ok(mut m) => m.drain().map(|(_, tx)| tx).collect(),
            Err(_) => return 0,
        };
        let n = drained.len();
        for tx in drained {
            let _ = tx.send(serde_json::json!({ "error": reason }));
        }
        n
    }

    /// Mutex serialisasi method MCP.
    pub fn mcp_lock(&self) -> &tokio::sync::Mutex<()> {
        &self.mcp_lock
    }

    // ── permintaan AI (fase 09) ──

    /// Daftarkan request baru; kembalikan flag batal untuk thread streaming.
    pub fn ai_begin(&self, id: &str) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        if let Ok(mut m) = write_lock(&self.ai_reqs, "ai_reqs") {
            // id yang sama dipakai ulang = permintaan lama dibatalkan dulu.
            if let Some(old) = m.insert(id.to_string(), flag.clone()) {
                old.store(true, Ordering::Relaxed);
            }
        }
        flag
    }

    /// true = ada request dengan id itu dan sudah ditandai batal.
    pub fn ai_cancel(&self, id: &str) -> bool {
        match write_lock(&self.ai_reqs, "ai_reqs") {
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
        if let Ok(mut map) = write_lock(&self.ptys, "ptys") {
            map.insert(session.id.clone(), Arc::new(session));
        }
    }

    pub fn pty_exists(&self, id: &str) -> bool {
        read_lock(&self.ptys, "ptys")
            .map(|m| m.contains_key(id))
            .unwrap_or(false)
    }

    pub fn pty_remove(&self, id: &str) {
        if let Ok(mut map) = write_lock(&self.ptys, "ptys") {
            map.remove(id);
        }
    }

    pub fn pty_list(&self) -> Vec<crate::pty::PtyInfo> {
        match read_lock(&self.ptys, "ptys") {
            Ok(map) => map.values().map(|s| s.info()).collect(),
            Err(_) => vec![],
        }
    }

    pub fn pty_count(&self) -> usize {
        read_lock(&self.ptys, "ptys").map(|m| m.len()).unwrap_or(0)
    }

    /// Jalankan aksi pada sesi tertentu. Arc di-clone dulu supaya lock
    /// registry TIDAK ditahan selama I/O (menghindari deadlock).
    pub fn with_pty<T, F>(&self, id: &str, f: F) -> ZResult<T>
    where
        F: FnOnce(&crate::pty::PtySession) -> ZResult<T>,
    {
        let session = {
            let map = read_lock(&self.ptys, "ptys")?;
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
        let sessions: Vec<_> = match write_lock(&self.ptys, "ptys") {
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

    // ── workspace & whitelist ──

    /// Tetapkan workspace aktif (sudah kanonik).
    pub fn set_workspace(&self, path: PathBuf) -> ZResult<()> {
        let mut ws = write_lock(&self.workspace, "workspace")?;
        *ws = Some(path);
        Ok(())
    }

    pub fn clear_workspace(&self) {
        if let Ok(mut ws) = write_lock(&self.workspace, "workspace") {
            *ws = None;
        }
    }

    /// Whitelist file + FOLDER INDUKNYA. HANYA untuk file yang benar-benar
    /// dipilih user di dialog native: "Save As" di folder yang sama harus
    /// tetap bisa. JANGAN dipakai untuk folder (mis. workspace) — itu akan
    /// mem-whitelist folder induknya, dan seluruh isi induk jadi bisa ditulis.
    /// Terbukti di V2 fase 14: `workspace_open` yang memakai ini membuat
    /// `fs_write` ke sibling workspace lolos padahal harus WorkspaceOutside.
    pub fn allow(&self, p: &Path) {
        if let Ok(mut set) = write_lock(&self.allowed, "allowed") {
            set.insert(crate::paths::canonical_or_parent(p));
            if let Some(parent) = p.parent() {
                set.insert(crate::paths::canonical_or_parent(parent));
            }
        }
    }

    /// Whitelist TEPAT path itu saja (tanpa folder induk). Dipakai untuk:
    ///   * `fs_read` — file yang dibuka user boleh disimpan balik (Ctrl+S),
    ///     tapi membaca satu file di C:\Windows tidak boleh membuka seluruh
    ///     C:\Windows untuk ditulis;
    ///   * `workspace_open` dan `folder_dialog_open` — folder itu sendiri.
    pub fn allow_exact(&self, p: &Path) {
        if let Ok(mut set) = write_lock(&self.allowed, "allowed") {
            set.insert(crate::paths::canonical_or_parent(p));
        }
    }

    pub fn workspace_path(&self) -> Option<PathBuf> {
        read_lock(&self.workspace, "workspace")
            .ok()
            .and_then(|w| w.clone())
    }

    // ── multi-root (fase 29) ──

    /// Semua root: root aktif DULU, lalu root tambahan.
    ///
    /// Urutan penting: explorer menampilkannya apa adanya, dan root aktif di
    /// posisi pertama membuat "root utama" jelas tanpa penanda tambahan.
    pub fn roots(&self) -> Vec<PathBuf> {
        let mut out = Vec::new();
        if let Some(ws) = self.workspace_path() {
            out.push(ws);
        }
        if let Ok(extra) = read_lock(&self.roots_extra, "roots_extra") {
            for r in extra.iter() {
                if !out.iter().any(|x| crate::paths::is_same(x, r)) {
                    out.push(r.clone());
                }
            }
        }
        out
    }

    /// Tambah root. Kalau belum ada workspace, root ini jadi root AKTIF.
    pub fn add_root(&self, path: PathBuf, nama: Option<String>) -> ZResult<()> {
        if let Some(n) = nama {
            if let Ok(mut m) = write_lock(&self.root_names, "root_names") {
                m.insert(kunci_root(&path), n);
            }
        }
        if self.workspace_path().is_none() {
            return self.set_workspace(path);
        }
        let mut extra = write_lock(&self.roots_extra, "roots_extra")?;
        if !extra.iter().any(|x| crate::paths::is_same(x, &path))
            && !self
                .workspace_path()
                .map(|w| crate::paths::is_same(&w, &path))
                .unwrap_or(false)
        {
            extra.push(path);
        }
        Ok(())
    }

    /// Hapus root. Menghapus root AKTIF akan menaikkan root berikutnya.
    pub fn remove_root(&self, path: &Path) -> ZResult<()> {
        let aktif = self.workspace_path();
        if aktif
            .as_deref()
            .map(|w| crate::paths::is_same(w, path))
            .unwrap_or(false)
        {
            // Root aktif dihapus: promosikan root tambahan pertama. Tanpa ini
            // workspace jadi None dan seluruh fitur mati padahal masih ada
            // folder lain yang terbuka.
            let pengganti = {
                let mut extra = write_lock(&self.roots_extra, "roots_extra")?;
                if extra.is_empty() {
                    None
                } else {
                    Some(extra.remove(0))
                }
            };
            match pengganti {
                Some(p) => self.set_workspace(p)?,
                None => {
                    return Err(ZephyrError::InvalidInput(
                        "root terakhir tidak bisa dihapus — pakai Close Folder".into(),
                    ))
                }
            }
            return Ok(());
        }
        let mut extra = write_lock(&self.roots_extra, "roots_extra")?;
        let sebelum = extra.len();
        extra.retain(|x| !crate::paths::is_same(x, path));
        if extra.len() == sebelum {
            return Err(ZephyrError::NotFound(format!(
                "{} bukan root workspace",
                path.to_string_lossy()
            )));
        }
        Ok(())
    }

    /// Jadikan root tertentu sebagai root aktif (bertukar dengan yang lama).
    pub fn set_active_root(&self, path: &Path) -> ZResult<()> {
        let lama = self.workspace_path();
        if lama
            .as_deref()
            .map(|w| crate::paths::is_same(w, path))
            .unwrap_or(false)
        {
            return Ok(());
        }
        {
            let mut extra = write_lock(&self.roots_extra, "roots_extra")?;
            if !extra.iter().any(|x| crate::paths::is_same(x, path)) {
                return Err(ZephyrError::NotFound(format!(
                    "{} bukan root workspace",
                    path.to_string_lossy()
                )));
            }
            extra.retain(|x| !crate::paths::is_same(x, path));
            if let Some(l) = lama {
                extra.insert(0, l);
            }
        }
        self.set_workspace(path.to_path_buf())
    }

    pub fn clear_roots(&self) {
        if let Ok(mut extra) = write_lock(&self.roots_extra, "roots_extra") {
            extra.clear();
        }
        if let Ok(mut m) = write_lock(&self.root_names, "root_names") {
            m.clear();
        }
        // File & settings .code-workspace juga dilepas: keduanya milik
        // workspace yang baru ditutup, dan membiarkannya membuat Explorer
        // menampilkan judul workspace lama untuk folder yang berbeda.
        self.set_workspace_file(String::new());
        self.set_workspace_settings(None);
        self.clear_workspace();
    }

    /// Nama tampil root: dari .code-workspace bila ada, kalau tidak basename.
    pub fn nama_root(&self, path: &Path) -> String {
        if let Ok(m) = read_lock(&self.root_names, "root_names") {
            if let Some(n) = m.get(&kunci_root(path)) {
                return n.clone();
            }
        }
        path.file_name()
            .map(|x| x.to_string_lossy().to_string())
            .unwrap_or_else(|| path.to_string_lossy().to_string())
    }

    pub fn workspace_file(&self) -> String {
        read_lock(&self.ws_file, "ws_file")
            .map(|s| s.clone())
            .unwrap_or_default()
    }

    pub fn set_workspace_file(&self, f: String) {
        if let Ok(mut s) = write_lock(&self.ws_file, "ws_file") {
            *s = f;
        }
    }

    pub fn workspace_settings(&self) -> Option<serde_json::Value> {
        read_lock(&self.ws_settings, "ws_settings")
            .ok()
            .and_then(|v| v.clone())
    }

    pub fn set_workspace_settings(&self, v: Option<serde_json::Value>) {
        if let Ok(mut s) = write_lock(&self.ws_settings, "ws_settings") {
            *s = v;
        }
    }

    /// Validasi path untuk operasi TULIS.
    /// Boleh bila: (a) dalam workspace aktif (dibandingkan pakai path
    /// KANONIK, jadi `..` dan symlink tidak bisa dipakai kabur), atau
    /// (b) ada di whitelist dialog / di bawah folder yang di-whitelist.
    /// Selain itu -> WorkspaceOutside.
    pub fn ensure_writable(&self, p: &Path) -> ZResult<()> {
        if p.as_os_str().is_empty() {
            return Err(ZephyrError::InvalidInput("path kosong".into()));
        }
        let ws = self.workspace_path();
        let norm = crate::paths::normalize_workspace_path(ws.as_deref(), p)?;

        if norm.inside {
            crate::paths::warn_if_symlink_escapes(ws.as_deref(), p);
            return Ok(());
        }

        // fase 29: root TAMBAHAN juga boleh ditulis. Ini satu-satunya tempat
        // yang perlu tahu soal multi-root — kalau tiap command diajari sendiri,
        // salah satu pasti lupa dan file di root kedua jadi read-only diam-diam.
        for r in self.roots() {
            if crate::paths::is_inside(&r, &norm.absolute) {
                crate::paths::warn_if_symlink_escapes(Some(&r), p);
                return Ok(());
            }
        }

        if let Ok(set) = read_lock(&self.allowed, "allowed") {
            if set.contains(&norm.absolute) {
                return Ok(());
            }
            // izinkan bila salah satu leluhur ada di whitelist
            let mut cur = norm.absolute.parent().map(|x| x.to_path_buf());
            while let Some(c) = cur {
                if set.contains(&c) {
                    return Ok(());
                }
                cur = c.parent().map(|x| x.to_path_buf());
            }
        }

        tracing::warn!(
            path = %p.to_string_lossy(),
            resolved = %norm.absolute.to_string_lossy(),
            "tulis di luar workspace ditolak"
        );
        Err(ZephyrError::WorkspaceOutside(
            p.to_string_lossy().to_string(),
        ))
    }

    /// Validasi path untuk operasi BACA. Lebih longgar dari tulis:
    /// file yang dipilih user via dialog/argumen tetap boleh dibaca,
    /// tapi tetap tolak path kosong.
    pub fn ensure_readable(&self, p: &Path) -> ZResult<()> {
        if p.as_os_str().is_empty() {
            return Err(ZephyrError::InvalidInput("path kosong".into()));
        }
        Ok(())
    }

    /// Label path untuk LOG: relatif ke workspace bila di dalam (14.2),
    /// absolut bila di luar. Log tidak boleh membocorkan struktur folder
    /// user lebih dari yang perlu, dan path relatif jauh lebih enak dibaca.
    pub fn label(&self, p: &Path) -> String {
        let ws = self.workspace_path();
        match crate::paths::normalize_workspace_path(ws.as_deref(), p) {
            Ok(n) => n
                .relative
                .unwrap_or_else(|| n.absolute.to_string_lossy().to_string()),
            Err(_) => p.to_string_lossy().to_string(),
        }
    }
}

/// Normalisasi path untuk perbandingan/penyimpanan.
/// Tetap ada karena dipakai modul lain (explorer, settings, extensions);
/// implementasinya sekarang ada di `paths.rs` (fase 14.2).
pub fn normalize(p: &Path) -> PathBuf {
    crate::paths::canonical_or_parent(p)
}

/// Kunci map untuk root (fase 29): Windows tidak peka huruf besar/kecil.
fn kunci_root(p: &Path) -> String {
    let s = p.to_string_lossy().replace('\\', "/");
    let s = s.trim_end_matches('/').to_string();
    #[cfg(windows)]
    {
        s.to_lowercase()
    }
    #[cfg(not(windows))]
    {
        s
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
