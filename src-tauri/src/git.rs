// git.rs — Source Control (fase 10).
//
// KEPUTUSAN IMPLEMENTASI (final, jangan diganti tanpa uji ulang):
// memakai **git CLI** (`git.exe` yang sudah ada di PATH), bukan gix/git2.
// Alasan: perilakunya identik dengan yang user lihat di terminal, mendukung
// credential helper, rename detection, dan konflik merge tanpa kita
// implementasikan ulang. Output dibaca dari `--porcelain=v2 -z` supaya
// stabil antar versi git dan aman untuk path berspasi/unicode.
//
// Aturan lintas fase yang dipegang di sini:
//   * SEMUA operasi git diserialisasi (satu proses git sekaligus) lewat
//     `AppState.git_lock` — dua agent MCP tidak boleh saling menimpa index.
//   * timeout 30s per perintah; proses yang menggantung dibunuh (pohonnya).
//   * `GIT_TERMINAL_PROMPT=0`: git TIDAK boleh menunggu input user di stdin
//     (tanpa ini push ke remote berkredensial menggantung selamanya).
//   * `git push --force` tidak tersedia — tidak ada jalurnya sama sekali.
//   * error git dikembalikan sebagai ZephyrError::Git dengan stderr apa
//     adanya (sudah cukup ramah), bukan panic.

use crate::app_state::AppState;
use crate::errors::{ZResult, ZephyrError};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

const TIMEOUT: Duration = Duration::from_secs(30);

// ───────────────────────── bentuk data ─────────────────────────

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitChange {
    /// path relatif ke root repo, separator '/'
    pub path: String,
    /// M A D R C U T ? — satu huruf, sudut pandang grup ini
    pub status: String,
    /// true = entri ini ada di index (Staged Changes)
    pub staged: bool,
    pub is_new: bool,
    pub is_deleted: bool,
    /// nama lama saat rename (status R)
    pub orig_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub is_repo: bool,
    pub repo_root: Option<String>,
    pub branch: Option<String>,
    /// nama upstream (mis. "origin/main"); None = belum di-set
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub changes: Vec<GitChange>,
    /// true bila repo punya remote bernama origin
    pub has_remote: bool,
    /// ada file dalam kondisi konflik merge
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
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitUser {
    pub name: Option<String>,
    pub email: Option<String>,
}

// ───────────────────────── eksekusi git ─────────────────────────

struct GitOut {
    ok: bool,
    stdout: String,
    stderr: String,
}

/// Jalankan git di `cwd`. `extra` = argumen `-c ...` yang disisipkan sebelum
/// subcommand (dipakai untuk credential helper saat push/pull ke GitHub).
fn run_git_in(cwd: &Path, args: &[&str], extra: &[String]) -> ZResult<GitOut> {
    let mut cmd = Command::new("git");
    cmd.current_dir(cwd);
    for e in extra {
        cmd.arg("-c").arg(e);
    }
    cmd.args(args);
    cmd.env("GIT_TERMINAL_PROMPT", "0");
    // Pesan git harus stabil untuk di-parse & ditampilkan.
    cmd.env("LC_ALL", "C");
    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        // CREATE_NO_WINDOW: jangan memunculkan jendela konsol hitam.
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }

    let child = cmd.spawn().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            ZephyrError::Git("git tidak ditemukan di PATH — pasang Git for Windows".into())
        } else {
            ZephyrError::Git(format!("gagal menjalankan git: {e}"))
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
        Ok(Err(e)) => Err(ZephyrError::Git(format!("git gagal: {e}"))),
        Err(_) => {
            kill_tree(pid);
            Err(ZephyrError::Git(format!(
                "git tidak selesai dalam {}s (dihentikan)",
                TIMEOUT.as_secs()
            )))
        }
    }
}

#[cfg(windows)]
fn kill_tree(pid: u32) {
    let _ = Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
}

#[cfg(not(windows))]
fn kill_tree(pid: u32) {
    let _ = Command::new("kill").args(["-9", &pid.to_string()]).status();
}

/// Emit `git-progress` { op, phase } — fase 14.4. Payload kecil & idempoten:
/// frontend hanya perlu tahu operasi apa yang mulai/selesai supaya bisa
/// menampilkan spinner tanpa menebak dari `busy` sendiri.
fn progress(app: &AppHandle, op: &str, phase: &str) {
    let _ = app.emit(
        "git-progress",
        serde_json::json!({ "op": op, "phase": phase }),
    );
}

/// Bungkus satu operasi jaringan: emit start/end + catat durasi ke log.
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
            tracing::warn!(op, ms, code = e.code(), "git gagal: {e}");
            progress(app, op, "error");
        }
    }
    out
}

/// Workspace aktif; semua command git bekerja relatif ke sini.
fn ws(state: &AppState) -> ZResult<PathBuf> {
    state
        .workspace_path()
        .ok_or_else(|| ZephyrError::Git("belum ada workspace terbuka".into()))
}

/// Jalankan git di workspace dengan lock (satu proses git sekaligus).
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

/// Versi yang mengembalikan stderr walau exit code != 0 (dipakai untuk
/// operasi yang "gagal wajar", mis. pull dengan konflik).
fn git_soft(state: &AppState, args: &[&str], extra: &[String]) -> ZResult<GitOut> {
    let dir = ws(state)?;
    let _guard = state.git_permit()?;
    run_git_in(&dir, args, extra)
}

/// Rapikan pesan error git supaya bisa dibaca user, tanpa membocorkan token.
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
        "perintah git gagal tanpa pesan".to_string()
    } else {
        msg
    };
    // Jaring pengaman: kalau ada URL berkredensial, buang bagian rahasianya.
    scrub_url_credentials(&msg)
}

/// `https://user:token@host/...` → `https://host/...`
pub fn scrub_url_credentials(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(pos) = rest.find("://") {
        let (head, tail) = rest.split_at(pos + 3);
        out.push_str(head);
        // batas host = spasi/'/' pertama
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

// ───────────────────────── parsing status ─────────────────────────

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

/// Parse `git status --porcelain=v2 --branch -z`.
/// Dipisah dari command supaya bisa diuji tanpa repo (tests_git.rs).
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
                // "+2 -1"
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

        // ordinary: 1 XY sub mH mI mW hH hI path
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

        // renamed/copied: 2 XY sub mH mI mW hH hI Xscore path \0 origPath
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

        // unmerged: u XY sub m1 m2 m3 mW h1 h2 h3 path
        if let Some(body) = rec.strip_prefix("u ") {
            let f: Vec<&str> = body.splitn(10, ' ').collect();
            if f.len() < 10 {
                continue;
            }
            push_change(&mut changes, f[9], 'U', false, None);
            continue;
        }

        // untracked: ? path
        if let Some(path) = rec.strip_prefix("? ") {
            push_change(&mut changes, path, '?', false, None);
            continue;
        }
        // '!' (ignored) tidak diminta — dilewati.
    }

    (branch, upstream, ahead, behind, changes)
}

// ───────────────────────── commands ─────────────────────────

#[tauri::command(async)]
pub fn git_init(state: State<AppState>, path: Option<String>) -> ZResult<()> {
    let dir = match path {
        Some(p) if !p.trim().is_empty() => PathBuf::from(p),
        _ => ws(&state)?,
    };
    if !dir.is_dir() {
        return Err(ZephyrError::InvalidInput(format!(
            "{} bukan folder",
            dir.to_string_lossy()
        )));
    }
    state.ensure_writable(&dir)?;
    let _guard = state.git_permit()?;
    // Branch awal mengikuti settings.git.defaultBranch bila ada.
    let default_branch = crate::settings::git_default_branch(&state);
    let out = run_git_in(&dir, &["init", "-b", &default_branch], &[])?;
    if !out.ok {
        // git < 2.28 tidak punya -b; ulangi tanpa flag itu.
        let retry = run_git_in(&dir, &["init"], &[])?;
        if !retry.ok {
            return Err(ZephyrError::Git(clean_err(&retry.stderr, &retry.stdout)));
        }
    }
    Ok(())
}

#[tauri::command(async)]
pub fn git_status(state: State<AppState>) -> ZResult<GitStatus> {
    let dir = match state.workspace_path() {
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
        // Bukan repo — ini kondisi normal (empty state UI), bukan error.
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

    let st = run_git_in(
        &dir,
        &[
            "status",
            "--porcelain=v2",
            "--branch",
            "--untracked-files=all",
            "-z",
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

fn non_empty(paths: &[String]) -> ZResult<Vec<&str>> {
    let v: Vec<&str> = paths
        .iter()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect();
    if v.is_empty() {
        return Err(ZephyrError::InvalidInput("tidak ada path".into()));
    }
    // '--' sudah dipasang pemanggil; path tidak boleh dimulai '-'.
    if v.iter().any(|p| p.starts_with('-')) {
        return Err(ZephyrError::InvalidInput("path tidak valid".into()));
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
    // `restore --staged` gagal di repo tanpa commit (belum ada HEAD) →
    // pakai `rm --cached` sebagai jalur kedua.
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
        return Err(ZephyrError::InvalidInput("pesan commit kosong".into()));
    }
    // Identitas: kalau repo/global belum diisi, pakai settings.git (fase 08).
    let mut extra: Vec<String> = Vec::new();
    let user = read_user(&state)?;
    if user.name.is_none() || user.email.is_none() {
        let (n, e) = crate::settings::git_identity(&state);
        match (n, e) {
            (Some(n), Some(e)) => {
                extra.push(format!("user.name={n}"));
                extra.push(format!("user.email={e}"));
            }
            _ => {
                return Err(ZephyrError::Git(
                    "identitas git belum diatur — isi Nama & Email di Settings → Source Control"
                        .into(),
                ))
            }
        }
    }
    git_extra(&state, &["commit", "-m", &msg], &extra)?;
    let head = git(&state, &["rev-parse", "--short=7", "HEAD"])?;
    Ok(head.trim().to_string())
}

/// Argumen `-c credential.helper=...` untuk operasi jaringan.
///
/// Hanya disisipkan bila remote-nya github.com DAN Zephyr punya token.
/// Di luar itu tidak ada yang diinjeksi sama sekali, sehingga credential
/// manager milik user (GCM) tetap menangani host lain seperti biasa
/// (invariant V15: `git push` dari terminal tidak boleh berubah perilaku).
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
        // kosongkan daftar helper lalu pasang milik Zephyr saja: hasilnya
        // deterministik (tidak tergantung urutan helper global user).
        "credential.helper=".to_string(),
        format!("credential.helper=!\"{exe}\" git-credential"),
    ]
}

fn remote_url(state: &AppState) -> Option<String> {
    let dir = state.workspace_path()?;
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
        // 401 di tengah operasi & token OAuth kadaluarsa → refresh lalu
        // coba SEKALI lagi (bukan loop).
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
            "HEAD tidak menunjuk branch (detached)".into(),
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
        return Err(ZephyrError::InvalidInput("nama branch kosong".into()));
    }
    // Tolak yang jelas berbahaya sebelum git menolaknya sendiri.
    // CATATAN fase 15.3: '/' TETAP DIIZINKAN — "feat/ui" adalah nama branch
    // yang sah dan dropdown/checkout harus bekerja untuknya. Yang dilarang
    // hanya bentuk yang membuat git bingung atau bisa dibaca sebagai flag.
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
            "nama branch tidak valid: {n}"
        )));
    }
    Ok(n.to_string())
}

#[tauri::command(async)]
pub fn git_checkout(state: State<AppState>, branch: String) -> ZResult<()> {
    let b = valid_branch_name(&branch)?;
    // Branch remote: buat local tracking-nya sekalian.
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
            "branch \"{n}\" sedang aktif — pindah dulu sebelum menghapus"
        )));
    }
    git(&state, &["branch", "-D", &n])?;
    Ok(())
}

#[tauri::command(async)]
pub fn git_diff(state: State<AppState>, path: String, staged: Option<bool>) -> ZResult<String> {
    let p = path.trim();
    if p.is_empty() || p.starts_with('-') {
        return Err(ZephyrError::InvalidInput("path tidak valid".into()));
    }
    let staged = staged.unwrap_or(false);
    let args: Vec<&str> = if staged {
        vec!["diff", "--cached", "--no-color", "--", p]
    } else {
        vec!["diff", "--no-color", "--", p]
    };
    let out = git(&state, &args)?;
    // FASE 15.3: file biner. `git diff` untuk PNG membalas satu baris
    // "Binary files a/x.png and b/x.png differ" — kalau itu dilempar apa adanya
    // ke viewer, `kindOf()` menandainya sebagai baris konteks dan tidak jelas
    // bagi user. Ganti dengan blok berlabel + ukuran supaya jelas dan tidak
    // ada byte mentah yang pernah masuk DOM.
    if out.contains("Binary files ") || out.contains("GIT binary patch") {
        return Ok(binary_diff_note(&state, p, &out));
    }
    if !out.trim().is_empty() {
        return Ok(out);
    }
    // File untracked tidak punya diff. Buat unified diff sintetis supaya
    // viewer tetap bisa menampilkan isinya sebagai baris '+'.
    if !staged {
        if let Some(root) = state.workspace_path() {
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

/// Blok pengganti diff untuk file biner (fase 15.3). Menyertakan ukuran file
/// di worktree bila masih ada, supaya user tetap dapat informasi berguna.
fn binary_diff_note(state: &AppState, rel: &str, raw: &str) -> String {
    let size = state
        .workspace_path()
        .map(|root| root.join(rel.replace('/', std::path::MAIN_SEPARATOR_STR)))
        .and_then(|full| std::fs::metadata(full).ok())
        .map(|m| m.len());
    let ukuran = match size {
        Some(n) if n >= 1024 * 1024 => format!("{:.1} MB", n as f64 / 1024.0 / 1024.0),
        Some(n) if n >= 1024 => format!("{} KB", n / 1024),
        Some(n) => format!("{n} B"),
        None => "ukuran tidak diketahui".to_string(),
    };
    // Baris "index ..." dari git tetap dibawa (berguna), sisanya dibuang.
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
    s.push_str(&format!(
        "Binary file ({ukuran}) — perbedaan tidak ditampilkan\n"
    ));
    s
}

/// Diff buatan untuk file baru (belum dilacak git).
fn synth_new_file_diff(rel: &str, full: &Path) -> String {
    const MAX_LINES: usize = 2000;
    let content = std::fs::read(full).unwrap_or_default();
    // File biner: jangan tampilkan isinya.
    if content.iter().take(8192).any(|b| *b == 0) {
        return format!("diff --git a/{rel} b/{rel}\nnew file\nBinary file (tidak ditampilkan)\n");
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
        s.push_str(&format!(
            "… {} baris berikutnya tidak ditampilkan\n",
            lines.len() - shown
        ));
    }
    s
}

#[tauri::command(async)]
pub fn git_discard(state: State<AppState>, paths: Vec<String>) -> ZResult<()> {
    let p = non_empty(&paths)?;
    // File terlacak: kembalikan ke HEAD (worktree + index).
    let mut args = vec!["checkout", "--"];
    args.extend(p.clone());
    let tracked_err = git(&state, &args).err();

    // File untracked: `checkout --` gagal untuk mereka; hapus filenya.
    let mut removed_any = false;
    for rel in &p {
        let is_untracked = git(&state, &["ls-files", "--error-unmatch", "--", rel]).is_err();
        if !is_untracked {
            continue;
        }
        if let Some(root) = state.workspace_path() {
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
    let count = n.unwrap_or(20).clamp(1, 200).to_string();
    // %x1f = unit separator, %x1e = record separator → aman untuk subject
    // yang memuat tab/pipe.
    let fmt = "--pretty=format:%h%x1f%s%x1f%an%x1f%ad%x1f%D%x1e";
    let raw = match git(&state, &["log", &format!("-n{count}"), "--date=short", fmt]) {
        Ok(r) => r,
        // Repo baru tanpa commit: `git log` gagal — itu bukan error UI.
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
        out.push(GitCommitInfo {
            hash7: f[0].to_string(),
            subject: f[1].to_string(),
            author: f[2].to_string(),
            date: f[3].to_string(),
            refs: f[4].to_string(),
        });
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
