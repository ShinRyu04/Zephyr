use crate::errors::{ZResult, ZephyrError};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, RwLock, TryLockError};
use std::time::{Duration, Instant};

const LOCK_BUDGET: Duration = Duration::from_millis(500);

const GIT_WAIT: Duration = Duration::from_secs(90);

const SPIN: Duration = Duration::from_millis(4);

fn read_lock<'a, T>(lock: &'a RwLock<T>, name: &str) -> ZResult<std::sync::RwLockReadGuard<'a, T>> {
    let start = Instant::now();
    loop {
        match lock.try_read() {
            Ok(g) => return Ok(g),

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
    workspace: RwLock<Option<PathBuf>>,

    allowed: RwLock<HashSet<PathBuf>>,

    roots_extra: RwLock<Vec<PathBuf>>,

    root_names: RwLock<HashMap<String, String>>,

    ws_file: RwLock<String>,

    ws_settings: RwLock<Option<serde_json::Value>>,

    pub data_dir: PathBuf,

    git_sem: tokio::sync::Semaphore,

    watch_generation: Arc<AtomicU64>,

    pub ai_capture: RwLock<Vec<crate::ai::CapturedRequest>>,

    pub ai_capture_on: std::sync::atomic::AtomicBool,

    ptys: RwLock<HashMap<String, Arc<crate::pty::PtySession>>>,

    render_paused: Arc<AtomicBool>,

    ai_reqs: RwLock<HashMap<String, Arc<AtomicBool>>>,

    mcp_rt: RwLock<Option<McpRuntime>>,

    mcp_pending: RwLock<HashMap<String, tokio::sync::oneshot::Sender<serde_json::Value>>>,

    mcp_lock: tokio::sync::Mutex<()>,

    ext_code: RwLock<HashMap<String, String>>,

    started: Instant,
    perf: RwLock<Vec<PerfMark>>,

    counters: RwLock<HashMap<String, u64>>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PerfMark {
    pub name: String,

    pub at_ms: u64,

    pub dur_ms: Option<u64>,
}

pub struct McpRuntime {
    pub port: u16,

    pub requested: u16,
    pub started: std::time::Instant,
    pub shutdown: tokio::sync::oneshot::Sender<()>,
}

pub struct GitPermit<'a> {
    _permit: tokio::sync::SemaphorePermit<'a>,
}

impl AppState {
    pub fn new() -> Self {
        let data_dir = resolve_data_dir();

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
            ai_capture: RwLock::new(Vec::new()),
            ai_capture_on: std::sync::atomic::AtomicBool::new(false),
        }
    }

    pub fn uptime_ms(&self) -> u64 {
        self.started.elapsed().as_millis() as u64
    }

    pub fn perf_mark(&self, name: &str, dur_ms: Option<u64>) {
        let mark = PerfMark {
            name: name.to_string(),
            at_ms: self.uptime_ms(),
            dur_ms,
        };
        if let Ok(mut v) = write_lock(&self.perf, "perf") {
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

    pub fn ext_store_code(&self, id: &str, code: String) {
        if let Ok(mut m) = write_lock(&self.ext_code, "ext_code") {
            m.insert(id.to_string(), code);
        }
    }

    #[allow(dead_code)]
    pub fn ext_code_len(&self, id: &str) -> usize {
        read_lock(&self.ext_code, "ext_code")
            .map(|m| m.get(id).map(|c| c.len()).unwrap_or(0))
            .unwrap_or(0)
    }

    pub fn mcp_set_runtime(&self, rt: McpRuntime) {
        if let Ok(mut slot) = write_lock(&self.mcp_rt, "mcp_rt") {
            *slot = Some(rt);
        }
    }

    pub fn mcp_take_runtime(&self) -> Option<McpRuntime> {
        write_lock(&self.mcp_rt, "mcp_rt")
            .ok()
            .and_then(|mut s| s.take())
    }

    pub fn mcp_port(&self) -> Option<u16> {
        read_lock(&self.mcp_rt, "mcp_rt")
            .ok()
            .and_then(|s| s.as_ref().map(|r| r.port))
    }

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

    pub fn mcp_register(&self, id: &str) -> tokio::sync::oneshot::Receiver<serde_json::Value> {
        let (tx, rx) = tokio::sync::oneshot::channel();
        if let Ok(mut m) = write_lock(&self.mcp_pending, "mcp_pending") {
            m.insert(id.to_string(), tx);
        }
        rx
    }

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

    pub fn mcp_forget(&self, id: &str) {
        if let Ok(mut m) = write_lock(&self.mcp_pending, "mcp_pending") {
            m.remove(id);
        }
    }

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

    pub fn mcp_lock(&self) -> &tokio::sync::Mutex<()> {
        &self.mcp_lock
    }

    pub fn ai_begin(&self, id: &str) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        if let Ok(mut m) = write_lock(&self.ai_reqs, "ai_reqs") {
            if let Some(old) = m.insert(id.to_string(), flag.clone()) {
                old.store(true, Ordering::Relaxed);
            }
        }
        flag
    }

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

    pub fn pty_kill_all(&self) {
        let sessions: Vec<_> = match write_lock(&self.ptys, "ptys") {
            Ok(mut m) => m.drain().map(|(_, v)| v).collect(),
            Err(_) => return,
        };
        for s in sessions {
            s.terminate();
        }
    }

    pub fn next_watch_generation(&self) -> u64 {
        self.watch_generation.fetch_add(1, Ordering::Relaxed) + 1
    }

    pub fn watch_stop_flag(&self) -> Arc<AtomicU64> {
        self.watch_generation.clone()
    }

    pub fn stop_watcher(&self) {
        self.watch_generation.fetch_add(1, Ordering::Relaxed);
    }

    pub fn file(&self, name: &str) -> PathBuf {
        self.data_dir.join(name)
    }

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

    pub fn allow(&self, p: &Path) {
        if let Ok(mut set) = write_lock(&self.allowed, "allowed") {
            set.insert(crate::paths::canonical_or_parent(p));
            if let Some(parent) = p.parent() {
                set.insert(crate::paths::canonical_or_parent(parent));
            }
        }
    }

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

    pub fn remove_root(&self, path: &Path) -> ZResult<()> {
        let aktif = self.workspace_path();
        if aktif
            .as_deref()
            .map(|w| crate::paths::is_same(w, path))
            .unwrap_or(false)
        {
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

        self.set_workspace_file(String::new());
        self.set_workspace_settings(None);
        self.clear_workspace();
    }

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

    pub fn ensure_readable(&self, p: &Path) -> ZResult<()> {
        if p.as_os_str().is_empty() {
            return Err(ZephyrError::InvalidInput("path kosong".into()));
        }
        Ok(())
    }

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

pub fn normalize(p: &Path) -> PathBuf {
    crate::paths::canonical_or_parent(p)
}

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
    if crate::cli_ext::portable_aktif() {
        if let Ok(exe) = std::env::current_exe() {
            if let Some(d) = exe.parent() {
                return d.join("data");
            }
        }
    }

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

#[tauri::command]
pub fn portable_mode() -> bool {
    crate::cli_ext::portable_aktif()
}
