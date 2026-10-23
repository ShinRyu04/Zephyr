use crate::app_state::AppState;
use crate::errors::{ZResult, ZephyrError};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

const TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitChange {
    pub path: String,

    pub status: String,

    pub staged: bool,
    pub is_new: bool,
    pub is_deleted: bool,

    pub orig_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub is_repo: bool,
    pub repo_root: Option<String>,
    pub branch: Option<String>,

    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub changes: Vec<GitChange>,

    pub has_remote: bool,

    pub conflicted: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBranches {
    pub current: Option<String>,
    pub locals: Vec<String>,
    pub remotes: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitInfo {
    pub hash7: String,
    pub subject: String,
    pub author: String,
    pub date: String,
    pub refs: String,
    pub parents: Vec<String>,
}

/// One file inside a commit: path + status letter + numstat counts.
/// Status follows `git diff-tree --name-status`: A/M/D/R/C/T.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitFile {
    pub path: String,
    pub status: String,
    pub add: u64,
    pub del: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitUser {
    pub name: Option<String>,
    pub email: Option<String>,
}

struct GitOut {
    ok: bool,
    stdout: String,
    stderr: String,
}

fn run_git_in(cwd: &Path, args: &[&str], extra: &[String]) -> ZResult<GitOut> {
    /*
     * current_dir() with an empty/broken path makes CreateProcess fail with
     * "The directory name is invalid. (os error 267)". Check here so that
     * every caller gets the same message, not a raw system error.
     */
    if !cwd.is_dir() {
        return Err(ZephyrError::Git(format!(
            "folder not found: {}",
            cwd.display()
        )));
    }
    let mut cmd = Command::new("git");
    cmd.current_dir(cwd);
    for e in extra {
        cmd.arg("-c").arg(e);
    }
    cmd.args(args);
    cmd.env("GIT_TERMINAL_PROMPT", "0");

    cmd.env("LC_ALL", "C");
    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }

    let child = cmd.spawn().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            ZephyrError::Git("git was not found on PATH — install Git for Windows".into())
        } else {
            ZephyrError::Git(format!("running git failed: {e}"))
        }
    })?;
    let pid = child.id();

    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let _ = tx.send(child.wait_with_output());
    });

    match rx.recv_timeout(TIMEOUT) {
        Ok(Ok(out)) => Ok(GitOut {
            ok: out.status.success(),
            stdout: String::from_utf8_lossy(&out.stdout).to_string(),
            stderr: String::from_utf8_lossy(&out.stderr).to_string(),
        }),
        Ok(Err(e)) => Err(ZephyrError::Git(format!("git failed: {e}"))),
        Err(_) => {
            kill_tree(pid);
            Err(ZephyrError::Git(format!(
                "git did not finish within {}s (dihentikan)",
                TIMEOUT.as_secs()
            )))
        }
    }
}

#[cfg(windows)]
fn kill_tree(pid: u32) {
    use std::os::windows::process::CommandExt;
    let mut c = Command::new("taskkill");
    c.args(["/PID", &pid.to_string(), "/T", "/F"])
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    c.creation_flags(0x0800_0000);
    let _ = c.status();
}

#[cfg(not(windows))]
fn kill_tree(pid: u32) {
    let _ = Command::new("kill").args(["-9", &pid.to_string()]).status();
}

fn progress(app: &AppHandle, op: &str, phase: &str) {
    let _ = app.emit(
        "git-progress",
        serde_json::json!({ "op": op, "phase": phase }),
    );
}

fn with_progress<T>(app: &AppHandle, op: &str, f: impl FnOnce() -> ZResult<T>) -> ZResult<T> {
    progress(app, op, "start");
    let t0 = std::time::Instant::now();
    let out = f();
    let ms = t0.elapsed().as_millis() as u64;
    match &out {
        Ok(_) => {
            tracing::info!(op, ms, "git selesai");
            progress(app, op, "done");
        }
        Err(e) => {
            tracing::warn!(op, ms, code = e.code(), "git failed: {e}");
            progress(app, op, "error");
        }
    }
    out
}

/// Direktori kerja git yang sedang dipakai.
///
/// Repo pilihan Source Control bila ada, kalau tidak workspace itu sendiri.
/// Dipakai juga oleh command yang menyentuh berkas berdasarkan path relatif
/// dari git (`git diff`, discard, conflict): path itu relatif terhadap REPO,
/// jadi menyambungnya ke workspace saat repo lain sedang dipilih akan menunjuk
/// berkas yang salah.
fn repo_aktif(state: &AppState) -> Option<PathBuf> {
    state.scm_repo_aktif().or_else(|| state.workspace_path())
}

fn ws(state: &AppState) -> ZResult<PathBuf> {
    /*
     * Satu titik masuk untuk menentukan direktori kerja git.
     *
     * Kalau pengguna memilih repo lain di Source Control (multi-repo), pilihan
     * itu berlaku di sini dan OTOMATIS berlaku untuk seluruh command git -
     * status, stage, commit, diff, branch, log - tanpa satu pun dari mereka
     * perlu tahu soal multi-repo. `scm_repo_aktif` sudah memvalidasi bahwa
     * pilihannya masih di dalam workspace, jadi tidak ada jalur yang bisa
     * menjalankan git di folder di luar folder yang dibuka.
     */
    let dir = match state.scm_repo_aktif() {
        Some(p) => p,
        None => state
            .workspace_path()
            .ok_or_else(|| ZephyrError::Git("no workspace is open".into()))?,
    };

    /*
     * The workspace may no longer exist on disk — the folder was moved/deleted
     * or an external drive was unplugged. Command::current_dir() with a missing
     * path fails with "The directory name is invalid. (os error 267)"
     * which means nothing to the user, so check here and give a message
     * they can act on.
     */
    if !dir.is_dir() {
        return Err(ZephyrError::Git(format!(
            "workspace folder not found: {} — reopen the project folder",
            dir.display()
        )));
    }
    Ok(dir)
}

fn git(state: &AppState, args: &[&str]) -> ZResult<String> {
    git_extra(state, args, &[])
}

fn git_extra(state: &AppState, args: &[&str], extra: &[String]) -> ZResult<String> {
    let dir = ws(state)?;
    let _guard = state.git_permit()?;
    let out = run_git_in(&dir, args, extra)?;
    if !out.ok {
        return Err(ZephyrError::Git(clean_err(&out.stderr, &out.stdout)));
    }
    Ok(out.stdout)
}

fn git_soft(state: &AppState, args: &[&str], extra: &[String]) -> ZResult<GitOut> {
    let dir = ws(state)?;
    let _guard = state.git_permit()?;
    run_git_in(&dir, args, extra)
}

fn clean_err(stderr: &str, stdout: &str) -> String {
    let raw = if stderr.trim().is_empty() {
        stdout
    } else {
        stderr
    };
    let msg = raw
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .take(6)
        .collect::<Vec<_>>()
        .join(" · ");
    let msg = if msg.is_empty() {
        "the git command failed with no message".to_string()
    } else {
        msg
    };

    scrub_url_credentials(&msg)
}

pub fn scrub_url_credentials(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(pos) = rest.find("://") {
        let (head, tail) = rest.split_at(pos + 3);
        out.push_str(head);

        let end = tail
            .find(|c: char| c.is_whitespace() || c == '/')
            .unwrap_or(tail.len());
        let (hostpart, after) = tail.split_at(end);
        match hostpart.rfind('@') {
            Some(at) => out.push_str(&hostpart[at + 1..]),
            None => out.push_str(hostpart),
        }
        rest = after;
    }
    out.push_str(rest);
    out
}

fn push_change(
    changes: &mut Vec<GitChange>,
    path: &str,
    code: char,
    staged: bool,
    orig: Option<String>,
) {
    if code == '.' {
        return;
    }
    changes.push(GitChange {
        path: path.to_string(),
        status: code.to_string(),
        staged,
        is_new: code == 'A' || code == '?',
        is_deleted: code == 'D',
        orig_path: orig,
    });
}

pub fn parse_status_v2(raw: &str) -> (Option<String>, Option<String>, u32, u32, Vec<GitChange>) {
    let mut branch = None;
    let mut upstream = None;
    let mut ahead = 0u32;
    let mut behind = 0u32;
    let mut changes: Vec<GitChange> = Vec::new();

    let mut it = raw.split('\0');
    while let Some(rec) = it.next() {
        if rec.is_empty() {
            continue;
        }
        if let Some(h) = rec.strip_prefix("# ") {
            if let Some(v) = h.strip_prefix("branch.head ") {
                branch = if v == "(detached)" {
                    Some("HEAD (detached)".to_string())
                } else {
                    Some(v.to_string())
                };
            } else if let Some(v) = h.strip_prefix("branch.upstream ") {
                upstream = Some(v.to_string());
            } else if let Some(v) = h.strip_prefix("branch.ab ") {
                for tok in v.split_whitespace() {
                    if let Some(n) = tok.strip_prefix('+') {
                        ahead = n.parse().unwrap_or(0);
                    } else if let Some(n) = tok.strip_prefix('-') {
                        behind = n.parse().unwrap_or(0);
                    }
                }
            }
            continue;
        }

        if let Some(body) = rec.strip_prefix("1 ") {
            let f: Vec<&str> = body.splitn(8, ' ').collect();
            if f.len() < 8 {
                continue;
            }
            let xy: Vec<char> = f[0].chars().collect();
            let path = f[7];
            if xy.len() == 2 {
                push_change(&mut changes, path, xy[0], true, None);
                push_change(&mut changes, path, xy[1], false, None);
            }
            continue;
        }

        if let Some(body) = rec.strip_prefix("2 ") {
            let f: Vec<&str> = body.splitn(9, ' ').collect();
            if f.len() < 9 {
                continue;
            }
            let xy: Vec<char> = f[0].chars().collect();
            let path = f[8];
            let orig = it.next().map(|s| s.to_string());
            if xy.len() == 2 {
                push_change(&mut changes, path, xy[0], true, orig.clone());
                push_change(&mut changes, path, xy[1], false, orig);
            }
            continue;
        }

        if let Some(body) = rec.strip_prefix("u ") {
            let f: Vec<&str> = body.splitn(10, ' ').collect();
            if f.len() < 10 {
                continue;
            }
            push_change(&mut changes, f[9], 'U', false, None);
            continue;
        }

        if let Some(path) = rec.strip_prefix("? ") {
            push_change(&mut changes, path, '?', false, None);
            continue;
        }
    }

    (branch, upstream, ahead, behind, changes)
}

#[tauri::command(async)]
pub fn git_init(state: State<AppState>, path: Option<String>) -> ZResult<()> {
    let dir = match path {
        Some(p) if !p.trim().is_empty() => PathBuf::from(p),
        _ => ws(&state)?,
    };
    if !dir.is_dir() {
        return Err(ZephyrError::InvalidInput(format!(
            "{} is not a folder",
            dir.to_string_lossy()
        )));
    }
    state.ensure_writable(&dir)?;
    let _guard = state.git_permit()?;

    let default_branch = crate::settings::git_default_branch(&state);
    let out = run_git_in(&dir, &["init", "-b", &default_branch], &[])?;
    if !out.ok {
        let retry = run_git_in(&dir, &["init"], &[])?;
        if !retry.ok {
            return Err(ZephyrError::Git(clean_err(&retry.stderr, &retry.stdout)));
        }
    }
    Ok(())
}

/*
 * ============================ Multi-repo Source Control ====================
 *
 * Satu workspace bisa memuat lebih dari satu repo: monorepo dengan paket yang
 * di-`git init` sendiri, atau folder biasa yang berisi beberapa proyek. Dulu
 * Source Control hanya melihat workspace itu sendiri, jadi repo di dalamnya
 * tidak bisa di-stage/commit sama sekali.
 *
 * Pencariannya sengaja DIBATASI: kedalaman 4 dan maksimal 32 repo. Pohon yang
 * sangat besar (node_modules, target, dist) dilewati, dan `target` di repo Rust
 * ini saja berisi puluhan ribu folder - tanpa batas itu pemindaian akan menjadi
 * pekerjaan disk yang jauh lebih mahal daripada manfaatnya.
 */

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScmRepo {
    pub path: String,
    pub name: String,

    /// Path relatif terhadap workspace, dengan garis miring depan ("" = akar).
    pub relative: String,
    pub branch: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScmRepoList {
    pub repos: Vec<ScmRepo>,

    /// Repo yang sedang dipilih; `null` berarti workspace itu sendiri.
    pub active: Option<String>,
}

const REPO_LEWATI: &[&str] = &[
    "node_modules",
    "target",
    "dist",
    "build",
    "out",
    ".next",
    ".turbo",
    ".cache",
    ".venv",
    "venv",
    "vendor",
    "coverage",
    ".git",
];

fn punya_git(dir: &Path) -> bool {
    let g = dir.join(".git");

    g.is_dir() || g.is_file()
}

fn cari_repo(dir: &Path, kedalaman: usize, keluar: &mut Vec<PathBuf>, batas: usize) {
    if keluar.len() >= batas {
        return;
    }
    if punya_git(dir) {
        keluar.push(dir.to_path_buf());
    }
    if kedalaman == 0 {
        return;
    }
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    let mut anak: Vec<PathBuf> = entries
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
        .map(|e| e.path())
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .map(|n| !REPO_LEWATI.contains(&n))
                .unwrap_or(false)
        })
        .collect();
    anak.sort();
    for p in anak {
        cari_repo(&p, kedalaman - 1, keluar, batas);
    }
}

fn cabang_repo(dir: &Path) -> Option<String> {
    let out = run_git_in(dir, &["rev-parse", "--abbrev-ref", "HEAD"], &[]).ok()?;
    if out.ok {
        let b = out.stdout.trim();
        if !b.is_empty() && b != "HEAD" {
            return Some(b.to_string());
        }
    }
    /* Repo yang baru di-`git init` belum punya commit, jadi `rev-parse HEAD`
       gagal - padahal namanya sudah ada di HEAD yang simbolik. Tanpa fallback
       ini setiap repo baru tampil tanpa nama branch. */
    let sim = run_git_in(dir, &["symbolic-ref", "--short", "HEAD"], &[]).ok()?;
    if !sim.ok {
        return None;
    }
    let b = sim.stdout.trim();
    if b.is_empty() {
        None
    } else {
        Some(b.to_string())
    }
}

#[tauri::command(async)]
pub fn scm_repos(state: State<AppState>) -> ZResult<ScmRepoList> {
    let akar = match state.workspace_path() {
        Some(w) => crate::paths::canonical_or_parent(&w),
        None => {
            return Ok(ScmRepoList {
                repos: vec![],
                active: None,
            })
        }
    };

    let mut ketemu: Vec<PathBuf> = Vec::new();
    cari_repo(&akar, 4, &mut ketemu, 32);

    let _guard = state.git_permit()?;
    let nama_akar = akar
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| akar.to_string_lossy().to_string());

    let repos: Vec<ScmRepo> = ketemu
        .into_iter()
        .map(|p| {
            let relative = p
                .strip_prefix(&akar)
                .map(|r| r.to_string_lossy().replace('\\', "/"))
                .unwrap_or_default();
            ScmRepo {
                name: if relative.is_empty() {
                    nama_akar.clone()
                } else {
                    p.file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_else(|| relative.clone())
                },
                branch: cabang_repo(&p),
                path: p.to_string_lossy().to_string(),
                relative,
            }
        })
        .collect();

    let active = state
        .scm_repo_aktif()
        .map(|p| p.to_string_lossy().to_string());

    Ok(ScmRepoList { repos, active })
}

#[tauri::command(async)]
pub fn scm_set_repo(state: State<AppState>, path: Option<String>) -> ZResult<Option<String>> {
    let Some(pilih) = path else {
        state.set_scm_repo(None)?;
        return Ok(None);
    };

    let ws = state
        .workspace_path()
        .ok_or_else(|| ZephyrError::Git("no workspace is open".into()))?;
    let ws = crate::paths::canonical_or_parent(&ws);
    let dir = crate::paths::canonical_or_parent(Path::new(pilih.trim()));

    if pilih.trim().is_empty() {
        state.set_scm_repo(None)?;
        return Ok(None);
    }
    if !crate::paths::is_inside(&ws, &dir) {
        return Err(ZephyrError::InvalidInput(
            "the repository must be inside the folder that is open".into(),
        ));
    }
    if !dir.is_dir() || !punya_git(&dir) {
        return Err(ZephyrError::InvalidInput(
            "that folder is not a git repository".into(),
        ));
    }

    state.set_scm_repo(Some(dir.clone()))?;
    Ok(Some(dir.to_string_lossy().to_string()))
}

#[tauri::command(async)]
pub fn git_status(state: State<AppState>) -> ZResult<GitStatus> {
    let dir = match repo_aktif(&state) {
        Some(d) => d,
        None => {
            return Ok(GitStatus {
                is_repo: false,
                repo_root: None,
                branch: None,
                upstream: None,
                ahead: 0,
                behind: 0,
                changes: vec![],
                has_remote: false,
                conflicted: false,
            })
        }
    };

    let _guard = state.git_permit()?;

    let root = run_git_in(&dir, &["rev-parse", "--show-toplevel"], &[])?;
    if !root.ok {
        return Ok(GitStatus {
            is_repo: false,
            repo_root: None,
            branch: None,
            upstream: None,
            ahead: 0,
            behind: 0,
            changes: vec![],
            has_remote: false,
            conflicted: false,
        });
    }
    let repo_root = root.stdout.trim().to_string();

    /*
     * BATAS PENELUSURAN (bug 2026-10-14 — badai "git permit was not granted
     * within 90s"): workspace boleh berada DI DALAM repo yang lebih besar
     * (kejadian nyata: sandbox `%TEMP%\zephyr-mcp-*` ternyata di dalam repo home
     * `C:/Users/Zyrex` yang di-`git init` tanpa index). Tanpa pathspec,
     * `--untracked-files=all` menelusuri SELURUH worktree repo itu: diukur
     * 36,5 s dan keluaran 68 MB → melewati TIMEOUT git 30 s → izin git ditahan
     * 30 s berkali-kali → penunggu ke-4 lewat `GIT_WAIT` 90 s → seluruh IPC mati.
     * Pathspec `.` membatasi penelusuran ke workspace saja (0,3 s pada kasus
     * yang sama) dan TIDAK mengubah hasil saat workspace = root repo
     * (diverifikasi: 678 = 678 baris pada root repo Zephyr).
     */
    let st = run_git_in(
        &dir,
        &[
            "status",
            "--porcelain=v2",
            "--branch",
            "--untracked-files=all",
            "-z",
            "--",
            ".",
        ],
        &[],
    )?;
    if !st.ok {
        return Err(ZephyrError::Git(clean_err(&st.stderr, &st.stdout)));
    }
    let (branch, upstream, ahead, behind, changes) = parse_status_v2(&st.stdout);

    let remotes = run_git_in(&dir, &["remote"], &[])?;
    let has_remote = remotes
        .stdout
        .lines()
        .any(|l| l.trim() == "origin" || !l.trim().is_empty());

    let conflicted = changes.iter().any(|c| c.status == "U");

    Ok(GitStatus {
        is_repo: true,
        repo_root: Some(repo_root),
        branch,
        upstream,
        ahead,
        behind,
        changes,
        has_remote,
        conflicted,
    })
}

/**
 * Added/removed line counts per changed file, for the Changes list.
 *
 * `git status` says WHICH files changed but not how much, and the Changes list
 * shows "+92 -1" beside each row. `--numstat` is the cheapest source: one line
 * per file, `added<TAB>removed<TAB>path`, and it counts a rename as its new
 * path so the numbers line up with the status entries.
 *
 * Binary files report `-` instead of numbers; they are returned as 0/0 rather
 * than guessed at, because a "binary" showing a fake line count is worse than
 * showing none.
 *
 * Untracked files are absent from `git diff` entirely (there is nothing to
 * diff against), so they are counted by reading the file: every line it has is
 * an added line, which is what the editor would show for a new file.
 */
#[tauri::command(async)]
pub fn git_numstat(
    state: State<AppState>,
    staged: Option<bool>,
) -> ZResult<std::collections::HashMap<String, (u64, u64)>> {
    let dir = match repo_aktif(&state) {
        Some(d) => d,
        None => return Ok(std::collections::HashMap::new()),
    };

    let _guard = state.git_permit()?;

    let mut out_map: std::collections::HashMap<String, (u64, u64)> =
        std::collections::HashMap::new();

    /* Tracked changes: staged reads the index, unstaged the working tree.
       Both are asked for, so a file with staged AND further unstaged edits
       reports the total the reader will see after committing. */
    let args: Vec<&str> = if staged.unwrap_or(false) {
        vec!["diff", "--numstat", "--cached", "--", "."]
    } else {
        vec!["diff", "--numstat", "--", "."]
    };
    if let Ok(got) = run_git_in(&dir, &args, &[]) {
        if got.ok {
            for line in got.stdout.lines() {
                let mut it = line.split('\t');
                let (a, r, p) = match (it.next(), it.next(), it.next()) {
                    (Some(a), Some(r), Some(p)) => (a, r, p),
                    _ => continue,
                };
                /* "-" means binary; 0/0 keeps the row honest. */
                let add = a.trim().parse::<u64>().unwrap_or(0);
                let del = r.trim().parse::<u64>().unwrap_or(0);
                let entry = out_map.entry(p.trim().to_string()).or_insert((0, 0));
                entry.0 += add;
                entry.1 += del;
            }
        }
    }

    /* Untracked files: `git diff` never lists them, so they would show no
       counts at all. Counting their lines here makes a brand-new file read as
       "all added", matching what the editor gutter shows for it. */
    if !staged.unwrap_or(false) {
        if let Ok(ls) = run_git_in(
            &dir,
            &["ls-files", "--others", "--exclude-standard", "--", "."],
            &[],
        ) {
            if ls.ok {
                for p in ls.stdout.lines().map(|l| l.trim()).filter(|l| !l.is_empty()) {
                    if out_map.contains_key(p) {
                        continue;
                    }
                    let full = dir.join(p.replace('/', std::path::MAIN_SEPARATOR_STR));
                    /* A missing or unreadable file is skipped: an untracked entry
                       that has since been deleted is not worth an error. */
                    if let Ok(text) = std::fs::read_to_string(&full) {
                        let n = text.lines().count() as u64;
                        out_map.insert(p.to_string(), (n, 0));
                    }
                }
            }
        }
    }

    Ok(out_map)
}

fn non_empty(paths: &[String]) -> ZResult<Vec<&str>> {
    let v: Vec<&str> = paths
        .iter()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect();
    if v.is_empty() {
        return Err(ZephyrError::InvalidInput("no path given".into()));
    }

    if v.iter().any(|p| p.starts_with('-')) {
        return Err(ZephyrError::InvalidInput("invalid path".into()));
    }
    Ok(v)
}

#[tauri::command(async)]
pub fn git_stage(state: State<AppState>, paths: Vec<String>) -> ZResult<()> {
    let p = non_empty(&paths)?;
    let mut args = vec!["add", "--all", "--"];
    args.extend(p);
    git(&state, &args)?;
    Ok(())
}

#[tauri::command(async)]
pub fn git_unstage(state: State<AppState>, paths: Vec<String>) -> ZResult<()> {
    let p = non_empty(&paths)?;
    let mut args = vec!["restore", "--staged", "--"];
    args.extend(p);

    match git(&state, &args) {
        Ok(_) => Ok(()),
        Err(_) => {
            let p2 = non_empty(&paths)?;
            let mut alt = vec!["rm", "--cached", "-r", "--"];
            alt.extend(p2);
            git(&state, &alt)?;
            Ok(())
        }
    }
}

#[tauri::command(async)]
pub fn git_commit(state: State<AppState>, message: String) -> ZResult<String> {
    let msg = message.trim().to_string();
    if msg.is_empty() {
        return Err(ZephyrError::InvalidInput("empty commit message".into()));
    }

    let mut extra: Vec<String> = Vec::new();
    let user = read_user(&state)?;
    if user.name.is_none() || user.email.is_none() {
        let (n, e) = crate::settings::git_identity(&state);
        match (n, e) {
            (Some(n), Some(e)) => {
                extra.push(format!("user.name={n}"));
                extra.push(format!("user.email={e}"));
            }
            _ => return Err(ZephyrError::Git(
                "git identity is not set up — fill in Name & Email in Settings → Source Control"
                    .into(),
            )),
        }
    }
    git_extra(&state, &["commit", "-m", &msg], &extra)?;
    let head = git(&state, &["rev-parse", "--short=7", "HEAD"])?;
    Ok(head.trim().to_string())
}

fn credential_args(state: &AppState) -> Vec<String> {
    let url = remote_url(state).unwrap_or_default();
    if !is_github_https(&url) {
        return vec![];
    }
    if crate::github::active_token(state).is_none() {
        return vec![];
    }
    let exe = match std::env::current_exe() {
        Ok(p) => p.to_string_lossy().to_string(),
        Err(_) => return vec![],
    };
    vec![
        "credential.helper=".to_string(),
        format!("credential.helper=!\"{exe}\" git-credential"),
    ]
}

fn remote_url(state: &AppState) -> Option<String> {
    let dir = repo_aktif(state)?;
    let out = run_git_in(&dir, &["remote", "get-url", "origin"], &[]).ok()?;
    if !out.ok {
        return None;
    }
    Some(out.stdout.trim().to_string())
}

fn is_github_https(url: &str) -> bool {
    let u = url.trim().to_ascii_lowercase();
    u.starts_with("https://github.com/") || u.starts_with("https://www.github.com/")
}

#[tauri::command(async)]
pub fn git_push(
    app: AppHandle,
    state: State<AppState>,
    set_upstream: Option<bool>,
) -> ZResult<String> {
    with_progress(&app, "push", || push_inner(&state, set_upstream))
}

fn push_inner(state: &AppState, set_upstream: Option<bool>) -> ZResult<String> {
    let extra = credential_args(state);
    let branch = current_branch(state)?;
    let out = if set_upstream.unwrap_or(false) {
        git_soft(state, &["push", "-u", "origin", &branch], &extra)?
    } else {
        git_soft(state, &["push"], &extra)?
    };
    if !out.ok {
        if looks_like_auth_error(&out.stderr) && crate::github::try_refresh(state) {
            let retry = if set_upstream.unwrap_or(false) {
                git_soft(state, &["push", "-u", "origin", &branch], &extra)?
            } else {
                git_soft(state, &["push"], &extra)?
            };
            if retry.ok {
                return Ok(scrub_url_credentials(&format!(
                    "{}{}",
                    retry.stdout, retry.stderr
                )));
            }
            return Err(ZephyrError::Git(clean_err(&retry.stderr, &retry.stdout)));
        }
        return Err(ZephyrError::Git(clean_err(&out.stderr, &out.stdout)));
    }
    Ok(scrub_url_credentials(&format!(
        "{}{}",
        out.stdout, out.stderr
    )))
}

fn looks_like_auth_error(stderr: &str) -> bool {
    let s = stderr.to_ascii_lowercase();
    s.contains("authentication failed")
        || s.contains("could not read username")
        || s.contains("invalid username or token")
        || s.contains("http basic: access denied")
        || s.contains("403")
        || s.contains("401")
}

#[tauri::command(async)]
pub fn git_pull(app: AppHandle, state: State<AppState>, rebase: Option<bool>) -> ZResult<String> {
    with_progress(&app, "pull", || pull_inner(&state, rebase))
}

fn pull_inner(state: &AppState, rebase: Option<bool>) -> ZResult<String> {
    let extra = credential_args(state);
    let args: Vec<&str> = if rebase.unwrap_or(false) {
        vec!["pull", "--rebase"]
    } else {
        vec!["pull", "--no-rebase"]
    };
    let out = git_soft(state, &args, &extra)?;
    if !out.ok {
        return Err(ZephyrError::Git(clean_err(&out.stderr, &out.stdout)));
    }
    Ok(scrub_url_credentials(&format!(
        "{}{}",
        out.stdout, out.stderr
    )))
}

#[tauri::command(async)]
pub fn git_fetch(app: AppHandle, state: State<AppState>) -> ZResult<String> {
    with_progress(&app, "fetch", || fetch_inner(&state))
}

fn fetch_inner(state: &AppState) -> ZResult<String> {
    let extra = credential_args(state);
    let out = git_soft(state, &["fetch", "--prune"], &extra)?;
    if !out.ok {
        return Err(ZephyrError::Git(clean_err(&out.stderr, &out.stdout)));
    }
    Ok(scrub_url_credentials(&format!(
        "{}{}",
        out.stdout, out.stderr
    )))
}

fn current_branch(state: &AppState) -> ZResult<String> {
    let out = git(state, &["rev-parse", "--abbrev-ref", "HEAD"])?;
    let b = out.trim().to_string();
    if b.is_empty() || b == "HEAD" {
        return Err(ZephyrError::Git(
            "HEAD does not point to a branch (detached)".into(),
        ));
    }
    Ok(b)
}

#[tauri::command(async)]
pub fn git_branches(state: State<AppState>) -> ZResult<GitBranches> {
    let raw = git(
        &state,
        &["branch", "-a", "--format=%(refname:short)%09%(HEAD)"],
    )?;
    let mut locals = Vec::new();
    let mut remotes = Vec::new();
    let mut current = None;
    for line in raw.lines() {
        let mut parts = line.split('\t');
        let name = parts.next().unwrap_or("").trim().to_string();
        let head = parts.next().unwrap_or("").trim() == "*";
        if name.is_empty() {
            continue;
        }
        if head {
            current = Some(name.clone());
        }
        if name.starts_with("origin/") || name.contains("->") {
            if !name.contains("->") {
                remotes.push(name);
            }
        } else {
            locals.push(name);
        }
    }
    Ok(GitBranches {
        current,
        locals,
        remotes,
    })
}

fn valid_branch_name(name: &str) -> ZResult<String> {
    let n = name.trim();
    if n.is_empty() {
        return Err(ZephyrError::InvalidInput("nama branch empty".into()));
    }

    if n.starts_with('-')
        || n.contains("..")
        || n.contains(' ')
        || n.contains('~')
        || n.contains('^')
        || n.contains(':')
        || n.contains('?')
        || n.contains('*')
        || n.contains('[')
        || n.contains('\\')
        || n.starts_with('/')
        || n.ends_with('/')
        || n.contains("//")
        || n.ends_with(".lock")
        || n.ends_with('.')
    {
        return Err(ZephyrError::InvalidInput(format!(
            "branch name is not valid: {n}"
        )));
    }
    Ok(n.to_string())
}

#[tauri::command(async)]
pub fn git_checkout(state: State<AppState>, branch: String) -> ZResult<()> {
    let b = valid_branch_name(&branch)?;

    if let Some(short) = b.strip_prefix("origin/") {
        let exists = git(&state, &["branch", "--list", short])
            .map(|s| !s.trim().is_empty())
            .unwrap_or(false);
        if exists {
            git(&state, &["checkout", short])?;
        } else {
            git(&state, &["checkout", "-b", short, "--track", &b])?;
        }
        return Ok(());
    }
    git(&state, &["checkout", &b])?;
    Ok(())
}

#[tauri::command(async)]
pub fn git_create_branch(
    state: State<AppState>,
    name: String,
    from: Option<String>,
) -> ZResult<()> {
    let n = valid_branch_name(&name)?;
    let base = from.unwrap_or_else(|| "HEAD".to_string());
    let b = valid_branch_name(&base)?;
    git(&state, &["checkout", "-b", &n, &b])?;
    Ok(())
}

#[tauri::command(async)]
pub fn git_delete_branch(state: State<AppState>, name: String) -> ZResult<()> {
    let n = valid_branch_name(&name)?;
    let cur = current_branch(&state)?;
    if n == cur {
        return Err(ZephyrError::Git(format!(
            "branch \"{n}\" is currently active — switch away before deleting"
        )));
    }
    git(&state, &["branch", "-D", &n])?;
    Ok(())
}

#[tauri::command(async)]
pub fn git_diff(state: State<AppState>, path: String, staged: Option<bool>) -> ZResult<String> {
    let p = path.trim();
    if p.is_empty() || p.starts_with('-') {
        return Err(ZephyrError::InvalidInput("invalid path".into()));
    }
    let staged = staged.unwrap_or(false);
    let args: Vec<&str> = if staged {
        vec!["diff", "--cached", "--no-color", "--", p]
    } else {
        vec!["diff", "--no-color", "--", p]
    };
    let out = git(&state, &args)?;

    if out.contains("Binary files ") || out.contains("GIT binary patch") {
        return Ok(binary_diff_note(&state, p, &out));
    }
    if !out.trim().is_empty() {
        return Ok(out);
    }

    if !staged {
        if let Some(root) = repo_aktif(&state) {
            let full = root.join(p.replace('/', std::path::MAIN_SEPARATOR_STR));
            if full.is_file() {
                let is_untracked = git(&state, &["ls-files", "--error-unmatch", "--", p]).is_err();
                if is_untracked {
                    return Ok(synth_new_file_diff(p, &full));
                }
            }
        }
    }
    Ok(out)
}

/**
 * The diff of one file against HEAD — what the gutter needs.
 *
 * `git_diff` above compares the working tree to the INDEX, which is the right
 * question for the Source Control panel: staging a file makes its diff empty,
 * because the change has moved into the index. For a gutter the question is
 * different — "what have I changed since the last commit" — and a file that has
 * been staged still shows bars there, because the commit has not happened.
 *
 * `git diff HEAD -- <path>` answers exactly that: both staged and unstaged
 * changes against the commit, which is what the bars are drawn from.
 *
 * Untracked files get the same synthetic new-file diff the panel uses, so a
 * file that has just been created shows every line as added rather than as
 * unchanged.
 */
#[tauri::command(async)]
pub fn git_diff_head(
    state: State<AppState>,
    path: String,
    ignore_ws: Option<bool>,
) -> ZResult<String> {
    let p = path.trim();
    if p.is_empty() || p.starts_with('-') {
        return Err(ZephyrError::InvalidInput("invalid path".into()));
    }
    /* `-w` tells git that whitespace-only edits are not changes — the flag
       behind the "Ignore Whitespace" toggle in the Diff View settings. */
    let mut args: Vec<&str> = vec!["diff", "HEAD", "--no-color"];
    if ignore_ws.unwrap_or(false) {
        args.push("-w");
    }
    args.push("--");
    args.push(&p);
    let out = git(&state, &args)?;

    if out.contains("Binary files ") || out.contains("GIT binary patch") {
        return Ok(binary_diff_note(&state, p, &out));
    }
    if !out.trim().is_empty() {
        return Ok(out);
    }

    if let Some(root) = repo_aktif(&state) {
        let full = root.join(p.replace('/', std::path::MAIN_SEPARATOR_STR));
        if full.is_file() {
            let is_untracked = git(&state, &["ls-files", "--error-unmatch", "--", p]).is_err();
            if is_untracked {
                return Ok(synth_new_file_diff(p, &full));
            }
        }
    }
    Ok(out)
}

fn binary_diff_note(state: &AppState, rel: &str, raw: &str) -> String {
    let size = repo_aktif(state)
        .map(|root| root.join(rel.replace('/', std::path::MAIN_SEPARATOR_STR)))
        .and_then(|full| std::fs::metadata(full).ok())
        .map(|m| m.len());
    let ukuran = match size {
        Some(n) if n >= 1024 * 1024 => format!("{:.1} MB", n as f64 / 1024.0 / 1024.0),
        Some(n) if n >= 1024 => format!("{} KB", n / 1024),
        Some(n) => format!("{n} B"),
        None => "ukuran unknown".to_string(),
    };

    let index_line = raw
        .lines()
        .find(|l| l.starts_with("index "))
        .unwrap_or("")
        .to_string();
    let mut s = format!("diff --git a/{rel} b/{rel}\n");
    if !index_line.is_empty() {
        s.push_str(&index_line);
        s.push('\n');
    }
    s.push_str(&format!("Binary file ({ukuran}) — differences not shown\n"));
    s
}

fn synth_new_file_diff(rel: &str, full: &Path) -> String {
    const MAX_LINES: usize = 2000;
    let content = std::fs::read(full).unwrap_or_default();

    if content.iter().take(8192).any(|b| *b == 0) {
        return format!("diff --git a/{rel} b/{rel}\nnew file\nBinary file (not shown)\n");
    }
    let text = String::from_utf8_lossy(&content);
    let lines: Vec<&str> = text.lines().collect();
    let shown = lines.len().min(MAX_LINES);
    let mut s = format!(
        "diff --git a/{rel} b/{rel}\nnew file mode 100644\n--- /dev/null\n+++ b/{rel}\n@@ -0,0 +1,{} @@\n",
        lines.len().max(1)
    );
    for l in lines.iter().take(shown) {
        s.push('+');
        s.push_str(l);
        s.push('\n');
    }
    if lines.len() > shown {
        s.push_str(&format!("… {} more lines not shown\n", lines.len() - shown));
    }
    s
}

#[tauri::command(async)]
pub fn git_discard(state: State<AppState>, paths: Vec<String>) -> ZResult<()> {
    let p = non_empty(&paths)?;

    let mut args = vec!["checkout", "--"];
    args.extend(p.clone());
    let tracked_err = git(&state, &args).err();

    let mut removed_any = false;
    for rel in &p {
        let is_untracked = git(&state, &["ls-files", "--error-unmatch", "--", rel]).is_err();
        if !is_untracked {
            continue;
        }
        if let Some(root) = repo_aktif(&state) {
            let full = root.join(rel.replace('/', std::path::MAIN_SEPARATOR_STR));
            state.ensure_writable(&full)?;
            let r = if full.is_dir() {
                std::fs::remove_dir_all(&full)
            } else {
                std::fs::remove_file(&full)
            };
            if r.is_ok() {
                removed_any = true;
            }
        }
    }
    if let Some(e) = tracked_err {
        if !removed_any {
            return Err(e);
        }
    }
    Ok(())
}

#[tauri::command(async)]
pub fn git_log(state: State<AppState>, n: Option<u32>) -> ZResult<Vec<GitCommitInfo>> {
    let count = n.unwrap_or(30).clamp(1, 200).to_string();

    let fmt = "--pretty=format:%h%x1f%s%x1f%an%x1f%ad%x1f%D%x1f%p%x1e";
    let raw = match git(
        &state,
        &["log", &format!("-n{count}"), "--date=format-local:%Y-%m-%dT%H:%M:%S", fmt],
    ) {
        Ok(r) => r,

        Err(_) => return Ok(vec![]),
    };
    let mut out = Vec::new();
    for rec in raw.split('\u{1e}') {
        let rec = rec.trim_start_matches('\n');
        if rec.trim().is_empty() {
            continue;
        }
        let f: Vec<&str> = rec.split('\u{1f}').collect();
        if f.len() < 5 {
            continue;
        }
        let parents = if f.len() >= 6 {
            f[5].split_whitespace().map(|s| s.to_string()).collect()
        } else {
            vec![]
        };
        out.push(GitCommitInfo {
            hash7: f[0].to_string(),
            subject: f[1].to_string(),
            author: f[2].to_string(),
            date: f[3].to_string(),
            refs: f[4].to_string(),
            parents,
        });
    }
    Ok(out)
}

/// Files changed by one commit, with per-file numstat counts.
///
/// `git show` would also print the patch; `diff-tree` answers only the file
/// list, which is what the Committed Changes list needs. `-m --first-parent`
/// keeps merge commits pointing at their first parent instead of exploding
/// into every merged branch.
#[tauri::command(async)]
pub fn git_commit_files(
    state: State<AppState>,
    hash: String,
) -> ZResult<Vec<GitCommitFile>> {
    let h = hash.trim();
    if h.is_empty() || h.starts_with('-') {
        return Err(ZephyrError::InvalidInput("invalid hash".into()));
    }
    /* DUA panggilan terpisah: `--name-status` dan `--numstat` adalah format
       keluaran yang saling menggantikan — kalau diminta bersamaan, git hanya
       mengeluarkan name-status, sehingga semua baris tampil +0/-0.
       `-r` wajib: tanpa itu diff-tree tidak masuk ke folder dan hanya
       melaporkan entri level atas (`src`, `scripts`, ...). */
    let status_raw = git(
        &state,
        &[
            "diff-tree",
            "-r",
            "--no-renames",
            "--no-color",
            "--name-status",
            "-m",
            "--first-parent",
            "--no-commit-id",
            h,
        ],
    )?;
    let stat_raw = git(
        &state,
        &[
            "diff-tree",
            "-r",
            "--no-renames",
            "--no-color",
            "--numstat",
            "-m",
            "--first-parent",
            "--no-commit-id",
            h,
        ],
    )?;

    /* Status lines are "<letter>\t<path>"; numstat lines are
       "<add>\t<del>\t<path>". */
    let mut status_map: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();
    let mut stat_map: std::collections::HashMap<String, (u64, u64)> =
        std::collections::HashMap::new();
    for line in status_raw.lines() {
        let line = line.trim_end();
        let mut it = line.split('\t');
        let a = it.next().unwrap_or("");
        let b = it.next().unwrap_or("");
        if a.len() == 1
            && !b.is_empty()
            && a.chars().next().is_some_and(|ch| ch.is_ascii_uppercase())
        {
            status_map.insert(b.to_string(), a.to_string());
        }
    }
    for line in stat_raw.lines() {
        let line = line.trim_end();
        let mut it = line.split('\t');
        let a = it.next().unwrap_or("");
        let b = it.next().unwrap_or("");
        let c = it.next().unwrap_or("");
        if !a.is_empty() && !b.is_empty() && !c.is_empty() {
            let add = a.parse::<u64>().unwrap_or(0);
            let del = b.parse::<u64>().unwrap_or(0);
            stat_map.insert(c.to_string(), (add, del));
        }
    }

    /* Order: diff-tree already lists alphabetically; keep its order but merge stats. */
    let mut out_vec: Vec<GitCommitFile> = Vec::new();
    for (p, st) in &status_map {
        let (add, del) = stat_map.get(p).copied().unwrap_or((0, 0));
        out_vec.push(GitCommitFile {
            path: p.clone(),
            status: st.clone(),
            add,
            del,
        });
    }
    out_vec.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(out_vec)
}

/// The diff of one file as of a commit — comparing that commit against its
/// first parent, so the reader sees exactly what the commit changed.
#[tauri::command(async)]
pub fn git_diff_commit(
    state: State<AppState>,
    hash: String,
    path: String,
    ignore_ws: Option<bool>,
) -> ZResult<String> {
    let h = hash.trim();
    let p = path.trim();
    if h.is_empty() || h.starts_with('-') || p.is_empty() || p.starts_with('-') {
        return Err(ZephyrError::InvalidInput("invalid hash or path".into()));
    }
    /* `-w` = "Ignore Whitespace" di Diff View, sama seperti git_diff_head. */
    let rentang = format!("{h}^!");
    let mut args: Vec<&str> = vec!["diff", "--no-color", "--no-ext-diff"];
    if ignore_ws.unwrap_or(false) {
        args.push("-w");
    }
    args.push(&rentang);
    args.push("--");
    args.push(p);
    let out = git(&state, &args)?;
    if out.contains("Binary files ") || out.contains("GIT binary patch") {
        return Ok(binary_diff_note(&state, p, &out));
    }
    Ok(out)
}

fn read_user(state: &AppState) -> ZResult<GitUser> {
    let name = git(state, &["config", "--get", "user.name"])
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let email = git(state, &["config", "--get", "user.email"])
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    Ok(GitUser { name, email })
}

#[tauri::command(async)]
pub fn git_config_get_user(state: State<AppState>) -> ZResult<GitUser> {
    read_user(&state)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBlameLine {
    pub line: u32,
    pub hash: String,
    pub author: String,
    pub date: String,
    pub summary: String,
}

#[tauri::command(async)]
pub fn git_blame(state: State<AppState>, path: String) -> ZResult<Vec<GitBlameLine>> {
    let rel = path.replace('\\', "/");
    let raw = git(&state, &["blame", "--line-porcelain", "--", &rel])?;

    let mut out: Vec<GitBlameLine> = Vec::new();
    let mut line_no: u32 = 0;
    let mut hash = String::new();
    let mut author = String::new();
    let mut date = String::new();
    let mut summary = String::new();

    for l in raw.lines() {
        if let Some(rest) = l.strip_prefix("author ") {
            author = rest.to_string();
        } else if let Some(rest) = l.strip_prefix("author-time ") {
            date = rest.to_string();
        } else if let Some(rest) = l.strip_prefix("summary ") {
            summary = rest.to_string();
        } else if let Some(rest) = l.strip_prefix('\t') {
            let _ = rest;
            line_no += 1;
            out.push(GitBlameLine {
                line: line_no,
                hash: hash.chars().take(8).collect(),
                author: author.clone(),
                date: date.clone(),
                summary: summary.clone(),
            });
        } else if !l.starts_with(' ') {
            let mut it = l.split(' ');
            if let Some(h) = it.next() {
                if h.len() >= 8 && h.chars().all(|c| c.is_ascii_hexdigit()) {
                    hash = h.to_string();
                }
            }
        }
    }
    Ok(out)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStashEntry {
    pub index: u32,
    pub message: String,
}

#[tauri::command(async)]
pub fn git_stash_save(state: State<AppState>, message: Option<String>) -> ZResult<bool> {
    let msg = message.unwrap_or_else(|| "zephyr-stash".to_string());
    match git(&state, &["stash", "push", "-u", "-m", &msg]) {
        Ok(out) => Ok(!out.contains("No local changes")),
        Err(e) => Err(e),
    }
}

#[tauri::command(async)]
pub fn git_stash_list(state: State<AppState>) -> ZResult<Vec<GitStashEntry>> {
    let raw = match git(&state, &["stash", "list", "--pretty=format:%gd%x1f%s"]) {
        Ok(r) => r,
        Err(_) => return Ok(vec![]),
    };
    let mut out = Vec::new();
    for (i, l) in raw.lines().enumerate() {
        let mut it = l.split('\u{1f}');
        let _gd = it.next();
        let msg = it.next().unwrap_or("").to_string();
        out.push(GitStashEntry {
            index: i as u32,
            message: msg,
        });
    }
    Ok(out)
}

#[tauri::command(async)]
pub fn git_stash_pop(state: State<AppState>, index: u32) -> ZResult<bool> {
    let refspec = format!("stash@{{{index}}}");
    git(&state, &["stash", "pop", &refspec])?;
    Ok(true)
}

#[tauri::command(async)]
pub fn git_stash_drop(state: State<AppState>, index: u32) -> ZResult<bool> {
    let refspec = format!("stash@{{{index}}}");
    git(&state, &["stash", "drop", &refspec])?;
    Ok(true)
}

#[tauri::command(async)]
pub fn git_rebase(state: State<AppState>, onto: String) -> ZResult<String> {
    if onto.trim().is_empty() || onto.starts_with('-') {
        return Err(ZephyrError::InvalidInput("branch name is not valid".into()));
    }
    git(&state, &["rebase", &onto])
}

#[tauri::command(async)]
pub fn git_conflict_take(state: State<AppState>, path: String, side: String) -> ZResult<bool> {
    let rel = path.replace('\\', "/");
    let flag = match side.as_str() {
        "ours" => "--ours",
        "theirs" => "--theirs",
        _ => {
            return Err(ZephyrError::InvalidInput(
                "side must be 'ours' or 'theirs'".into(),
            ))
        }
    };
    git(&state, &["checkout", flag, "--", &rel])?;
    git(&state, &["add", "--", &rel])?;
    Ok(true)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictHunk {
    pub ours: String,
    pub theirs: String,
    pub base: String,
}

#[tauri::command(async)]
pub fn git_conflict_read(state: State<AppState>, path: String) -> ZResult<Vec<ConflictHunk>> {
    let rel = path.replace('\\', "/");
    let isi = {
        let ws = repo_aktif(&state)
            .ok_or_else(|| ZephyrError::InvalidInput("no workspace".into()))?;
        let full = ws.join(&rel);
        std::fs::read_to_string(crate::paths::long_path(&full))
            .map_err(|e| ZephyrError::NotFound(format!("baca {rel}: {e}")))?
    };

    let mut out = Vec::new();
    let mut mode = 0u8;
    let mut ours = String::new();
    let mut theirs = String::new();
    let mut base = String::new();
    for l in isi.lines() {
        if l.starts_with("<<<<<<<") {
            mode = 1;
            ours.clear();
            base.clear();
            theirs.clear();
        } else if l.starts_with("|||||||") {
            mode = 2;
        } else if l.starts_with("=======") {
            mode = 3;
        } else if l.starts_with(">>>>>>>") {
            out.push(ConflictHunk {
                ours: ours.clone(),
                theirs: theirs.clone(),
                base: base.clone(),
            });
            mode = 0;
        } else {
            match mode {
                1 => {
                    ours.push_str(l);
                    ours.push('\n');
                }
                2 => {
                    base.push_str(l);
                    base.push('\n');
                }
                3 => {
                    theirs.push_str(l);
                    theirs.push('\n');
                }
                _ => {}
            }
        }
    }
    Ok(out)
}

#[tauri::command(async)]
pub fn git_rebase_interactive(state: State<AppState>, onto: String) -> ZResult<String> {
    git_rebase(state, onto)
}

#[tauri::command(async)]
pub fn git_rebase_continue(state: State<AppState>) -> ZResult<String> {
    git(&state, &["rebase", "--continue"])
}

#[tauri::command(async)]
pub fn git_rebase_abort(state: State<AppState>) -> ZResult<String> {
    git(&state, &["rebase", "--abort"])
}

#[tauri::command(async)]
pub fn git_rebase_status(state: State<AppState>) -> ZResult<bool> {
    let ws = repo_aktif(&state)
        .ok_or_else(|| ZephyrError::InvalidInput("no workspace".into()))?;
    let git_dir = ws.join(".git");
    Ok(git_dir.join("rebase-merge").exists() || git_dir.join("rebase-apply").exists())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitWorktree {
    pub path: String,
    pub branch: Option<String>,
    pub head: Option<String>,
    pub bare: bool,
    pub detached: bool,
    pub locked: bool,
    pub prunable: bool,
    pub is_main: bool,
}

/*
 * `git worktree list --porcelain` prints one block per worktree, blocks
 * separated by an empty line, e.g.
 *
 *   worktree D:/repo
 *   HEAD abc...
 *   branch refs/heads/main
 *
 *   worktree D:/repo-feat
 *   HEAD def...
 *   detached
 *
 * The first block is always the main worktree. Keys with no value (bare,
 * detached, locked, prunable) are flags; locked and prunable may carry a
 * reason after the key which we ignore.
 */
pub fn parse_worktree_porcelain(raw: &str) -> Vec<GitWorktree> {
    let mut out: Vec<GitWorktree> = Vec::new();
    let mut cur: Option<GitWorktree> = None;

    for line in raw.lines() {
        if line.trim().is_empty() {
            if let Some(w) = cur.take() {
                out.push(w);
            }
            continue;
        }
        let (key, value) = match line.split_once(' ') {
            Some((k, v)) => (k, v.trim()),
            None => (line.trim(), ""),
        };
        match key {
            "worktree" => {
                if let Some(w) = cur.take() {
                    out.push(w);
                }
                cur = Some(GitWorktree {
                    path: value.to_string(),
                    branch: None,
                    head: None,
                    bare: false,
                    detached: false,
                    locked: false,
                    prunable: false,
                    is_main: false,
                });
            }
            "HEAD" => {
                if let Some(w) = cur.as_mut() {
                    w.head = Some(value.to_string());
                }
            }
            "branch" => {
                if let Some(w) = cur.as_mut() {
                    w.branch = Some(
                        value
                            .strip_prefix("refs/heads/")
                            .unwrap_or(value)
                            .to_string(),
                    );
                }
            }
            "bare" => {
                if let Some(w) = cur.as_mut() {
                    w.bare = true;
                }
            }
            "detached" => {
                if let Some(w) = cur.as_mut() {
                    w.detached = true;
                }
            }
            "locked" => {
                if let Some(w) = cur.as_mut() {
                    w.locked = true;
                }
            }
            "prunable" => {
                if let Some(w) = cur.as_mut() {
                    w.prunable = true;
                }
            }
            _ => {}
        }
    }
    if let Some(w) = cur.take() {
        out.push(w);
    }

    if let Some(first) = out.first_mut() {
        first.is_main = true;
    }
    out
}

fn worktrees_in(state: &AppState) -> ZResult<Vec<GitWorktree>> {
    let raw = git(state, &["worktree", "list", "--porcelain"])?;
    Ok(parse_worktree_porcelain(&raw))
}

#[tauri::command(async)]
pub fn git_worktree_list(state: State<AppState>) -> ZResult<Vec<GitWorktree>> {
    worktrees_in(&state)
}

/*
 * Resolve a user-supplied worktree path. Relative paths are siblings of the
 * repo (the workspace parent), matching the common `repo-feat` layout. An
 * absolute path is used as-is.
 */
fn resolve_worktree_path(root: &Path, raw: &str) -> ZResult<PathBuf> {
    let p = PathBuf::from(raw.trim());
    if p.is_absolute() {
        return Ok(p);
    }
    let parent = root
        .parent()
        .ok_or_else(|| ZephyrError::InvalidInput(format!("tidak bisa resolve path: {raw}")))?;
    Ok(parent.join(p))
}

#[tauri::command(async)]
pub fn git_worktree_add(
    state: State<AppState>,
    path: String,
    branch: String,
    create_branch: bool,
    from: Option<String>,
) -> ZResult<()> {
    if path.trim().is_empty() {
        return Err(ZephyrError::InvalidInput("worktree path is empty".into()));
    }
    if branch.trim().is_empty() {
        return Err(ZephyrError::InvalidInput("branch name is empty".into()));
    }

    let root = ws(&state)?;
    let target = resolve_worktree_path(&root, &path)?;

    // A worktree is a real checkout of the repo; it must be its own folder
    // outside the repo, never inside it (that would nest a checkout in the
    // working tree) and never over an existing folder.
    if crate::paths::is_inside(&root, &target) {
        return Err(ZephyrError::InvalidInput(format!(
            "worktree path is inside the repository: {}",
            target.display()
        )));
    }
    if target.exists() {
        return Err(ZephyrError::InvalidInput(format!(
            "path already exists: {}",
            target.display()
        )));
    }

    let target_str = target.to_string_lossy().to_string();
    if create_branch {
        let base = match from {
            Some(f) if !f.trim().is_empty() => f,
            _ => "HEAD".to_string(),
        };
        git(
            &state,
            &["worktree", "add", "-b", &branch, &target_str, &base],
        )?;
    } else {
        git(&state, &["worktree", "add", &target_str, &branch])?;
    }
    Ok(())
}

#[tauri::command(async)]
pub fn git_worktree_remove(state: State<AppState>, path: String, force: bool) -> ZResult<()> {
    if path.trim().is_empty() {
        return Err(ZephyrError::InvalidInput("worktree path is empty".into()));
    }

    let list = worktrees_in(&state)?;
    let target = PathBuf::from(path.trim());
    let target_norm = crate::paths::canonical_or_parent(&target);

    let found = list.iter().find(|w| {
        crate::paths::is_same(
            &crate::paths::canonical_or_parent(Path::new(&w.path)),
            &target_norm,
        )
    });

    if let Some(w) = found {
        if w.is_main {
            return Err(ZephyrError::InvalidInput(
                "cannot remove the main worktree".into(),
            ));
        }
    }

    let mut args = vec!["worktree", "remove"];
    if force {
        args.push("--force");
    }
    args.push(path.trim());
    git(&state, &args)?;
    Ok(())
}

#[tauri::command(async)]
pub fn git_worktree_prune(state: State<AppState>) -> ZResult<String> {
    let out = git(&state, &["worktree", "prune"])?;
    let combined = out.trim();
    if combined.is_empty() {
        Ok("(nothing to prune)".to_string())
    } else {
        Ok(combined.to_string())
    }
}

#[cfg(test)]
mod tests_batas_status {
    /*
     * Penjaga regresi bug 2026-10-14 (badai izin git): kalau workspace berada di
     * dalam repo yang LEBIH BESAR, `git status --untracked-files=all` tanpa
     * pathspec menelusuri seluruh worktree repo itu — pada kasus nyata (repo home
     * `C:/Users/Zyrex`) 36,5 s / 68 MB, melewati TIMEOUT 30 s, dan izin git
     * ditahan berulang sampai penunggu lain mati di 90 s. Pathspec `.` membatasi
     * penelusuran ke workspace.
     */
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    /// Repo uji: root berisi `big/` (3 berkas) + `ws/` (1 berkas).
    fn siapkan() -> Option<(PathBuf, PathBuf)> {
        if Command::new("git").arg("--version").output().is_err() {
            return None; // git tidak ada di PATH — lewati
        }
        let root = std::env::temp_dir().join(format!("zephyr-uji-status-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("big")).ok()?;
        fs::create_dir_all(root.join("ws")).ok()?;
        for n in ["a", "b", "c"] {
            fs::write(root.join("big").join(format!("{n}.txt")), "x").ok()?;
        }
        fs::write(root.join("ws").join("satu.txt"), "x").ok()?;
        let init = Command::new("git")
            .current_dir(&root)
            .args(["init", "-q"])
            .output()
            .ok()?;
        assert!(init.status.success(), "git init gagal di repo uji");
        Some((root.clone(), root.join("ws")))
    }

    const ARGS: [&str; 5] = [
        "status",
        "--porcelain=v2",
        "--branch",
        "--untracked-files=all",
        "-z",
    ];

    #[test]
    fn pathspec_membatasi_status_ke_workspace() {
        let Some((root, ws)) = siapkan() else { return };
        let args = ARGS.to_vec();
        let tanpa = run_git_in(&ws, &args, &[]).expect("status tanpa pathspec");
        assert!(
            tanpa.stdout.contains("big/a.txt"),
            "tanpa pathspec harus melihat berkas di luar workspace"
        );

        let mut args_fix = args;
        args_fix.push("--");
        args_fix.push(".");
        let dengan = run_git_in(&ws, &args_fix, &[]).expect("status dengan pathspec");
        assert!(
            dengan.stdout.contains("ws/satu.txt"),
            "pathspec harus tetap melaporkan berkas di dalam workspace"
        );
        assert!(
            !dengan.stdout.contains("big/"),
            "pathspec harus memotong berkas di luar workspace"
        );
        assert!(
            dengan.stdout.len() < tanpa.stdout.len(),
            "keluaran berpathspec harus lebih kecil daripada tanpa"
        );
        let _ = fs::remove_dir_all(&root);
    }
}

#[cfg(test)]
mod tests_multi_repo {
    use super::*;
    use std::fs;

    fn akar_uji(nama: &str) -> PathBuf {
        let d = std::env::temp_dir()
            .join("zephyr-multi-repo")
            .join(nama);
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    fn buat_repo(p: &Path) {
        fs::create_dir_all(p).unwrap();
        /* `.git` sebagai folder sudah cukup untuk deteksi; submodule memakai
           berkas `.git`, dan keduanya diterima oleh `punya_git`. */
        fs::create_dir_all(p.join(".git")).unwrap();
    }

    #[test]
    fn menemukan_repo_di_dalam_workspace() {
        let d = akar_uji("dasar");
        buat_repo(&d);
        buat_repo(&d.join("packages").join("a"));
        buat_repo(&d.join("packages").join("b"));
        fs::create_dir_all(d.join("packages").join("c")).unwrap();

        let mut ketemu = Vec::new();
        cari_repo(&d, 4, &mut ketemu, 32);

        /* Akar dulu (urutan pemindaian), lalu anak-anaknya yang terurut. */
        assert!(ketemu.contains(&d));
        assert!(ketemu.contains(&d.join("packages").join("a")));
        assert!(ketemu.contains(&d.join("packages").join("b")));
        assert!(!ketemu.contains(&d.join("packages").join("c")));
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn melewati_folder_berat_dan_menghormati_batas() {
        let d = akar_uji("lewati");
        buat_repo(&d.join("node_modules").join("pustaka"));
        buat_repo(&d.join("target").join("debug"));
        for i in 0..5 {
            buat_repo(&d.join(format!("r{i}")));
        }

        let mut ketemu = Vec::new();
        cari_repo(&d, 4, &mut ketemu, 2);

        assert_eq!(ketemu.len(), 2, "batas jumlah repo harus dihormati");
        assert!(
            !ketemu.iter().any(|p| p.to_string_lossy().contains("node_modules")),
            "node_modules tidak boleh dipindai"
        );
        assert!(
            !ketemu.iter().any(|p| p.to_string_lossy().contains("target")),
            "target tidak boleh dipindai"
        );
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn kedalaman_dibatasi() {
        let d = akar_uji("dalam");
        buat_repo(&d.join("a").join("b").join("c").join("d").join("dalam-sekali"));

        let mut ketemu = Vec::new();
        cari_repo(&d, 2, &mut ketemu, 32);
        assert!(ketemu.is_empty(), "repo di kedalaman 3+ tidak ikut dipindai");
        let _ = fs::remove_dir_all(&d);
    }
}
