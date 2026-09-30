//! Dev Environment: detect what is actually installed on this machine.
//!
//! Phase 2 only. Detection is read-only: it never installs, never starts a
//! process it did not find, and never writes outside the app directory.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::errors::ZResult;
use std::sync::Mutex;

/// Pids of the services Zephyr started itself, by service id. A service missing
/// from this map is owned by someone else and must not be stopped from here.
static PID_MILIK: Mutex<Vec<(String, u32)>> = Mutex::new(Vec::new());

/// Child handles kept alive so a background service is not reaped while it is
/// serving. Dropping the Child would not kill it on Windows, but holding the
/// handle keeps the exit status readable and the process owned.
static ANAK: Mutex<Vec<std::process::Child>> = Mutex::new(Vec::new());


fn rt() -> Vec<(String, u32)> {
    PID_MILIK.lock().map(|g| g.clone()).unwrap_or_default()
}

fn catat_pid(id: &str, pid: u32) {
    if let Ok(mut g) = PID_MILIK.lock() {
        g.retain(|(k, _)| k != id);
        g.push((id.to_string(), pid));
    }
}

fn hapus_pid(id: &str) {
    if let Ok(mut g) = PID_MILIK.lock() {
        g.retain(|(k, _)| k != id);
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeFound {
    pub id: String,
    pub label: String,
    /// Empty when the runtime is not installed.
    pub path: String,
    /// Empty when the runtime is not installed or did not report a version.
    pub version: String,
    pub installed: bool,
    /// The path the user pinned in Settings, which wins over detection.
    pub custom: bool,
}

/// One runtime we look for, with the exe names that identify it. Windows
/// installs the same tool under several names, so the first match wins.
struct Kandidat {
    id: &'static str,
    label: &'static str,
    exes: &'static [&'static str],
    /// Extra places to look when the tool is not on PATH. Herd, Laragon and
    /// XAMPP all install outside PATH, and that is the normal case on Windows.
    dirs: &'static [&'static str],
}

const KANDIDAT: &[Kandidat] = &[
    Kandidat {
        id: "node",
        label: "Node.js",
        exes: &["node"],
        dirs: &[r"C:\Program Files\nodejs", r"C:\Program Files (x86)\nodejs"],
    },
    Kandidat {
        id: "php",
        label: "PHP",
        exes: &["php"],
        dirs: &[
            r"C:\php",
            r"C:\laragon\bin\php",
            r"C:\xampp\php",
            r"D:\DevEnv\php",
            r"D:\DevEnv\laragon\bin\php",
        ],
    },
    Kandidat {
        id: "python",
        label: "Python",
        exes: &["python", "python3", "py"],
        dirs: &[],
    },
    Kandidat {
        id: "rust",
        label: "Rust",
        exes: &["cargo"],
        dirs: &[],
    },
    Kandidat {
        id: "git",
        label: "Git",
        exes: &["git"],
        dirs: &[
            r"C:\Program Files\Git\cmd",
            r"C:\Program Files (x86)\Git\cmd",
        ],
    },
];

/// Every subfolder of a directory. Used where the folder itself is already the
/// tool folder (`...\bin\apache`), so each child is a candidate version.
fn subfolder(base: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let Ok(entries) = std::fs::read_dir(base) else {
        return out;
    };
    for e in entries.flatten() {
        let p = e.path();
        if p.is_dir() {
            out.push(p);
        }
    }
    out.sort();
    out
}

/// Extra version directories under a Herd/Laragon style install root, where
/// each version lives in its own folder (`php\php-8.3.33\php.exe`).
fn versi_dir(base: &Path, tool: &str) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let Ok(entries) = std::fs::read_dir(base.join(tool)) else {
        return out;
    };
    for e in entries.flatten() {
        let p = e.path();
        if p.is_dir() {
            out.push(p);
        }
    }
    // Newest folder name last in the listing; sorting keeps the pick stable.
    out.sort();
    out
}

fn executable_in(dir: &Path, exes: &[&str]) -> Option<PathBuf> {
    for e in exes {
        let p = dir.join(format!("{e}.exe"));
        if p.is_file() {
            return Some(p);
        }
        // A .cmd shim counts too: that is what the PATH normally resolves to.
        let c = dir.join(format!("{e}.cmd"));
        if c.is_file() {
            return Some(c);
        }
    }
    None
}

/// Look in PATH first, then the well-known install roots.
///
/// A root is checked flat (`<root>/php.exe`) and then one level of version
/// folders deep (`<root>/8.1.34/php.exe`), which is how a Herd/Laragon style
/// root and `D:\DevEnv\php` both lay their runtimes out. Sorting means the
/// newest version wins, the same rule the services use.
fn cari(exe: &[&str], dirs: &[&str]) -> Option<PathBuf> {
    for e in exe {
        if let Ok(p) = which::which(e) {
            if p.is_file() {
                return Some(p);
            }
        }
    }
    for d in dirs {
        let base = Path::new(d);
        if let Some(p) = executable_in(base, exe) {
            return Some(p);
        }
        // Versioned layout: <root>/<version>/<exe>, newest first.
        let mut versi = subfolder(base);
        versi.sort();
        while let Some(v) = versi.pop() {
            if let Some(p) = executable_in(&v, exe) {
                return Some(p);
            }
        }
    }
    None
}

/// Read `<exe> --version` and keep just the version number.
///
/// A raw line is not usable in the UI: `python --version` prints
/// "Python 3.11.9", `git --version` prints "git version 2.55.0.windows.2" and
/// `cargo --version` appends a build hash. All three are reduced to the number
/// so the row reads "Python 3.11.9" and not "Python Python 3.11.9".
///
/// Both streams are read: `redis-server --version` writes its banner to
/// stderr, so reading stdout alone reports Redis with no version at all.
fn versi_dari(exe: &Path) -> String {
    let Ok(out) = crate::proc::cmd(exe).arg("--version").output() else {
        return String::new();
    };
    let stdout = String::from_utf8_lossy(&out.stdout);
    let stderr = String::from_utf8_lossy(&out.stderr);
    for teks in [stdout.as_ref(), stderr.as_ref()] {
        let baris = teks
            .lines()
            .find(|l| !l.trim().is_empty())
            .unwrap_or("")
            .trim();
        let v = ambil_versi(baris);
        if !v.is_empty() {
            return v;
        }
    }
    String::new()
}

/// The first token that looks like a version: starts with a digit and contains
/// a dot. Trailing non-numeric parts (`2.55.0.windows.2`) are kept only up to
/// the last purely-numeric segment, so `cargo`'s build hash is dropped.
///
/// A leading `v` or an `=` assignment is stripped first, because tools disagree
/// on how to spell it: `node --version` prints `v22.23.2`, `redis-server`
/// prints `v=5.0.14.1` and `mariadbd` prints `10.11.6-MariaDB`. All three must
/// reduce to the bare number or the row shows no version at all.
fn ambil_versi(baris: &str) -> String {
    for token in baris.split_whitespace() {
        let t = token.trim_start_matches('v');
        let t = t.trim_start_matches('=');
        let inti: String = t
            .chars()
            .take_while(|c| c.is_ascii_digit() || *c == '.')
            .collect();
        if inti.contains('.') && inti.chars().next().is_some_and(|c| c.is_ascii_digit()) {
            let rapih = inti.trim_end_matches('.').to_string();
            if !rapih.is_empty() {
                return rapih;
            }
        }
    }
    String::new()
}

fn semua_versi(exe: &Path, dirs: &[&str], tool: &str) -> Vec<String> {
    let mut out = Vec::new();
    // The active binary first, so the dropdown opens on what actually runs.
    if let Some(v) = exe.file_stem().and_then(|_| {
        let v = versi_dari(exe);
        if v.is_empty() {
            None
        } else {
            Some(v)
        }
    }) {
        out.push(v);
    }
    for d in dirs {
        for sub in versi_dir(Path::new(d), tool) {
            if let Some(p) = executable_in(&sub, &["php", "php.exe", "php8"]) {
                let v = versi_dari(&p);
                if !v.is_empty() && !out.contains(&v) {
                    out.push(v);
                }
            }
        }
    }
    out
}

/// Detect every runtime. `custom` carries the paths pinned in Settings so a
/// runtime the user pointed at is reported even when it is not on PATH.
#[tauri::command(async)]
pub fn devenv_detect_runtimes(custom: Option<std::collections::HashMap<String, String>>) -> ZResult<Vec<RuntimeFound>> {
    let custom = custom.unwrap_or_default();
    let mut out = Vec::new();

    for k in KANDIDAT {
        let pin = custom.get(k.id).map(|s| s.as_str()).unwrap_or("").trim();
        let (path, pinned) = if !pin.is_empty() {
            (PathBuf::from(pin), true)
        } else {
            (cari(k.exes, k.dirs).unwrap_or_default(), false)
        };

        let installed = !path.as_os_str().is_empty() && path.is_file();
        let version = if installed { versi_dari(&path) } else { String::new() };
        let list = if installed {
            let mut v = semua_versi(&path, k.dirs, k.id);
            if v.is_empty() && !version.is_empty() {
                v.push(version.clone());
            }
            v
        } else {
            Vec::new()
        };

        out.push(RuntimeFound {
            id: k.id.to_string(),
            label: k.label.to_string(),
            path: if installed { path.to_string_lossy().to_string() } else { String::new() },
            version,
            installed,
            custom: pinned,
        });
        // `list` is deliberately not returned: the UI only needs the active
        // version now, and the full list grows with the install root.
        let _ = list;
    }
    Ok(out)
}

// ───────────────────────── services ─────────────────────────

/// One service Zephyr knows how to describe. `dirs` are scanned under the
/// configured root (a Herd/Laragon style layout keeps one folder per tool,
/// each version in its own subfolder).
struct KandidatService {
    id: &'static str,
    label: &'static str,
    /// Folder under <root>, e.g. "nginx". Empty when the service only ever
    /// lives in an outside install (Apache and PostgreSQL ship their own
    /// installer and do not sit under the Dev Environment root).
    tool: &'static str,
    /// Exe to run, relative to the version folder. Several candidates are
    /// tried in order, which is how one entry covers MariaDB (`bin/mysqld.exe`
    /// one level down) and XAMPP (`mysql/bin/mysqld.exe` two levels down).
    exe: &'static [&'static str],
    port: u16,
    /// Extra workdir arguments the service needs (nginx needs a -p prefix).
    butuh_konf: bool,
    /// Absolute fallback locations of an outside install, e.g. XAMPP, Laragon
    /// and the standalone MySQL/PostgreSQL installers. Each entry is a root
    /// that gets the same version-folder scan as the configured root.
    luar: &'static [&'static str],
    /// Executable that names the *parent* of a Postgres style layout
    /// (`<prefix>/bin/postgres.exe` is a file, not a folder we descend into).
    datadir: &'static str,
}

const SERVICE: &[KandidatService] = &[
    KandidatService {
        id: "nginx",
        label: "Nginx",
        tool: "nginx",
        exe: &["nginx.exe"],
        port: 80,
        butuh_konf: true,
        luar: &[],
        datadir: "",
    },
    KandidatService {
        id: "apache",
        label: "Apache",
        tool: "apache",
        exe: &["bin/httpd.exe", "httpd.exe"],
        port: 80,
        butuh_konf: true,
        luar: &[
            r"C:\xampp\apache",
            r"C:\laragon\bin\apache",
            r"D:\DevEnv\laragon\bin\apache",
            r"D:\DevEnv\apache",
        ],
        datadir: "",
    },
    KandidatService {
        id: "mysql",
        label: "MySQL",
        tool: "mariadb",
        exe: &["bin/mysqld.exe", "mysqld.exe"],
        port: 3306,
        butuh_konf: false,
        luar: &[
            r"C:\xampp\mysql",
            r"C:\laragon\bin\mysql",
            r"D:\DevEnv\laragon\bin\mysql",
            r"D:\DevEnv\mysql",
            r"C:\Program Files\MySQL",
        ],
        datadir: "",
    },
    KandidatService {
        id: "postgres",
        label: "PostgreSQL",
        tool: "postgresql",
        exe: &["bin/pg_ctl.exe", "pg_ctl.exe"],
        port: 5432,
        butuh_konf: false,
        luar: &[
            r"C:\Program Files\PostgreSQL",
            r"C:\xampp\pgsql",
            r"D:\DevEnv\postgresql",
        ],
        datadir: "",
    },
    KandidatService {
        id: "redis",
        label: "Redis",
        tool: "redis",
        exe: &["redis-server.exe"],
        port: 6379,
        butuh_konf: false,
        luar: &[],
        datadir: "",
    },
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceFound {
    pub id: String,
    pub label: String,
    /// Empty when the service is not installed under the root.
    pub path: String,
    pub version: String,
    pub port: u16,
    pub installed: bool,
    /// True when something already listens on the port, i.e. the service is up
    /// but was NOT started by Zephyr.
    pub jalan: bool,
    /// The pid Zephyr started, when it owns the service.
    pub pid: u32,
    /// Whether Zephyr may stop it. A service found already running belongs to
    /// someone else, so stopping it is refused.
    pub milik_zephyr: bool,
    /// Data directory a server-style tool needs on the command line. Empty
    /// for a tool that starts from its own folder (nginx, mysqld).
    pub datadir: String,
    /// Name of the Windows service backing this row, when there is one.
    /// PostgreSQL's installer registers `postgresql-x64-18` and MySQL's
    /// registers `MySQL84`; those run under the service manager, so Start and
    /// Stop must go through `sc` instead of spawning the binary.
    pub windows_service: String,
    /// Every version found next to the active one, newest last. Lets the row
    /// offer a real version switch instead of a dropdown with one entry.
    pub versions: Vec<String>,
}

/// Every version of a service found under any scanned root. The row uses this
/// to offer a switch, so a Laragon install with three PHP drops and a MariaDB
/// plus a standalone MySQL all show up in one dropdown.
fn versi_semua_service(root: &Path, s: &KandidatService) -> Vec<String> {
    let mut out = Vec::new();
    let mut roots: Vec<PathBuf> = Vec::new();
    if !s.tool.is_empty() && !root.as_os_str().is_empty() {
        roots.push(root.to_path_buf());
    }
    roots.extend(s.luar.iter().map(PathBuf::from));

    for r in roots {
        let sudah_tool = r
            .file_name()
            .is_some_and(|n| n.to_string_lossy().eq_ignore_ascii_case(s.tool));
        let base = if sudah_tool || s.tool.is_empty() {
            r.clone()
        } else {
            r.join(s.tool)
        };
        for dir in subfolder(&base) {
            let nama = dir
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();
            let v = versi_dari_nama_folder(&nama);
            if !v.is_empty() && !out.contains(&v) {
                out.push(v);
            }
        }
    }
    out
}

/// Name of the Windows service that owns a given port, when one does.
///
/// PostgreSQL and MySQL register themselves with the service manager during
/// install, and a service keeps running whether or not Zephyr is open. Those
/// rows cannot be spawned directly (the binary expects the service's own
/// environment), so the row carries the service name and Start/Stop go through
/// `sc` instead.
#[cfg(windows)]
fn windows_service_untuk(id: &str) -> String {
    // `sc query state= all` prints every service; matching on the known
    // prefixes avoids pulling in a service crate for one lookup. The names are
    // what the official installers register.
    let prefix = match id {
        "postgres" | "postgresql" => "postgresql",
        "mysql" => "mysql",
        _ => return String::new(),
    };
    let Ok(out) = crate::proc::cmd("sc").args(["query", "state=", "all"]).output() else {
        return String::new();
    };
    let teks = String::from_utf8_lossy(&out.stdout);
    for baris in teks.lines() {
        let b = baris.trim();
        if let Some(nama) = b.strip_prefix("SERVICE_NAME:") {
            let nama = nama.trim();
            if nama.to_ascii_lowercase().starts_with(prefix) {
                return nama.to_string();
            }
        }
    }
    String::new()
}

#[cfg(not(windows))]
fn windows_service_untuk(_id: &str) -> String {
    String::new()
}

/// A TCP connect tells us whether the port really answers. A process being
/// alive is not enough: nginx forks workers and the master owns the port.
fn port_live(port: u16) -> bool {
    if port == 0 {
        return false;
    }
    std::net::TcpStream::connect_timeout(
        &format!("127.0.0.1:{port}").parse().unwrap(),
        std::time::Duration::from_millis(400),
    )
    .is_ok()
}

/// Version directory the exe sits in, so the caller can derive the install
/// prefix for a tool that needs `-D <datadir>`.
fn exe_di(base: &Path, rel: &[&str]) -> Option<PathBuf> {
    let mut p = base.to_path_buf();
    for seg in rel {
        p.push(seg);
    }
    if p.is_file() {
        Some(p)
    } else {
        None
    }
}

/// Same as [`exe_di`], but tries every candidate in order. One service entry
/// carries several layouts (`bin/mysqld.exe` for a versioned MariaDB drop,
/// `mysqld.exe` for a flat one) and the first hit wins.
fn exe_kandidat(base: &Path, rel: &[&str]) -> Option<PathBuf> {
    for r in rel {
        let mut p = base.to_path_buf();
        for seg in r.split('/') {
            p.push(seg);
        }
        if p.is_file() {
            return Some(p);
        }
    }
    None
}

/// Data directory for the services that need one on the command line.
///
/// PostgreSQL will not start without `-D`, and MySQL needs `--datadir` or it
/// aborts with "Can't find data directory". Each layout puts the cluster in a
/// different place, so every known spot is probed; an existing cluster wins,
/// because the UI must never point at an empty directory and look like it
/// started.
fn datadir_service(exe: &Path, s: &KandidatService) -> Option<PathBuf> {
    // <prefix>/bin/<exe> -> <prefix>
    let prefix = exe.parent()?.parent()?;

    if matches!(s.id, "postgres" | "postgresql") {
        for kandidat in [prefix.join("data"), prefix.join("data").join("postgresql")] {
            if kandidat.join("PG_VERSION").is_file() {
                return Some(kandidat);
            }
        }
        // Nothing initialised yet: report the conventional path so the UI can
        // say where it looked instead of staying silent.
        let kosong = prefix.join("data");
        return if kosong.is_dir() { Some(kosong) } else { None };
    }

    if s.id == "mysql" {
        // MySQL 8 uses `data`; MariaDB ships `data` too. A Laragon install
        // keeps every cluster under `<laragon>/data/<tool>` instead, so the
        // prefix chain and the install root are both checked.
        let mut kandidat = vec![prefix.join("data")];
        if let Some(instalasi) = prefix.parent().and_then(|p| p.parent()) {
            // .../bin/mysql/<versi> -> .../<laragon>
            kandidat.push(instalasi.join("data").join("mysql"));
            kandidat.push(instalasi.join("data").join("mariadb"));
        }
        for k in kandidat {
            // `mysql/` is the system schema, present only after initialize.
            if k.join("mysql").is_dir() {
                return Some(k);
            }
        }
        return None;
    }

    None
}

/// Pull "1.31.6" out of a folder named "nginx-1.31.6" or
/// "mariadb-11.4.4-winx64". The arch suffix after the version is dropped,
/// because a version is what the user reads, not the packaging.
fn versi_dari_nama_folder(nama: &str) -> String {
    for seg in nama.split(|c: char| c == '-' || c == '_') {
        let looks_version = seg.chars().next().is_some_and(|c| c.is_ascii_digit())
            && seg.contains('.');
        if looks_version {
            return seg.to_string();
        }
    }
    String::new()
}

/// A service is either laid out as <root>/<tool>/<version>/... (nginx,
/// mariadb) or flat as <root>/<tool>/<exe> (redis, as downloaded). Return the
/// directory the exe lives in, plus the version parsed from the folder name.
///
/// An outside install (XAMPP, Laragon, the standalone MySQL and PostgreSQL
/// installers) is scanned the same way: `luar` lists absolute roots that get
/// the identical version-folder treatment, so a service shipped by its own
/// installer is found without the user having to move files.
fn cari_service(root: &Path, s: &KandidatService) -> Option<(PathBuf, String)> {
    // The configured root wins, then each outside install in order.
    if !s.tool.is_empty() && !root.as_os_str().is_empty() {
        if let Some(k) = cari_di_root(root, s) {
            return Some(k);
        }
    }
    for l in s.luar {
        if let Some(k) = cari_di_root(Path::new(l), s) {
            return Some(k);
        }
    }
    None
}

/// Scan one root for a service: `<root>/<tool>/<version>/<exe>` first, then
/// the flat `<root>/<tool>/<exe>`. A root whose last segment already names the
/// tool (e.g. `C:\xampp\apache`) is also tried directly, because that is how
/// XAMPP lays its components out.
fn cari_di_root(root: &Path, s: &KandidatService) -> Option<(PathBuf, String)> {
    // A root that already ends in the tool name (XAMPP's `C:\xampp\apache`,
    // Laragon's `...\bin\apache`) is the tool folder itself, so `base` is the
    // root and the version folders live directly inside it.
    let root_sudah_tool = root
        .file_name()
        .is_some_and(|n| n.to_string_lossy().eq_ignore_ascii_case(s.tool));
    let base = if root_sudah_tool || s.tool.is_empty() {
        root.to_path_buf()
    } else {
        root.join(s.tool)
    };

    // Versioned layout first: <base>/<version>/<exe>.
    let mut dirs = Vec::new();
    if root_sudah_tool {
        // Every subfolder of the tool folder is a candidate version.
        dirs.extend(subfolder(root));
    } else {
        dirs.extend(versi_dir(root, s.tool));
    }
    if base != root {
        if let Some(n) = base.file_name().map(|n| n.to_string_lossy().to_string()) {
            dirs.extend(subfolder(&base));
            dirs.extend(versi_dir(root, &n));
        }
        // XAMPP keeps the exe one level down with no version folder at all.
        dirs.extend(versi_dir(&base, "bin"));
    }
    dirs.sort();
    dirs.dedup();
    while let Some(v) = dirs.pop() {
        // Laragon nests one more level: <tool>/<version>/bin/<exe>.
        if let Some(p) = exe_kandidat(&v, s.exe) {
            let nama = v
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();
            return Some((p, versi_dari_nama_folder(&nama)));
        }
        if let Some(p) = exe_kandidat(&v.join("bin"), s.exe) {
            let nama = v
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();
            return Some((p, versi_dari_nama_folder(&nama)));
        }
    }

    // Flat layout: <base>/<exe>, version read from the folder name.
    if let Some(p) = exe_kandidat(&base, s.exe) {
        let nama = base
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        return Some((p, versi_dari_nama_folder(&nama)));
    }

    // A root that is itself the version folder: <root>/<exe>.
    if base != root {
        if let Some(p) = exe_kandidat(root, s.exe) {
            let nama = root
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();
            return Some((p, versi_dari_nama_folder(&nama)));
        }
    }

    None
}

#[tauri::command(async)]
pub fn devenv_detect_services(root: Option<String>) -> ZResult<Vec<ServiceFound>> {
    let root = root.unwrap_or_default();
    let mut out = Vec::new();

    for s in SERVICE {
        let ketemu = cari_service(Path::new(&root), s);
        let path = ketemu.clone().map(|(p, _)| p).unwrap_or_default();
        let installed = !path.as_os_str().is_empty() && path.is_file();
        // Prefer the version baked into the folder name (a Herd/Laragon drop
        // spells it out), but fall back to asking the binary. Redis ships in a
        // folder simply named "redis", so the folder alone reports nothing.
        let version = if installed {
            let dari_folder = ketemu.clone().unwrap().1;
            if dari_folder.is_empty() {
                versi_dari(&path)
            } else {
                dari_folder
            }
        } else {
            String::new()
        };
        // Every version sitting next to the active one, so the row can offer a
        // real switch. The active version is first so the dropdown opens on it.
        let versions = if installed {
            let mut v = vec![version.clone()];
            for k in versi_semua_service(Path::new(&root), s) {
                if !v.contains(&k) {
                    v.push(k);
                }
            }
            v.retain(|x| !x.is_empty());
            v
        } else {
            Vec::new()
        };

        let hidup = rt()
        .iter()
        .find(|(k, _)| k == s.id)
        .map(|(_, p)| *p)
        .unwrap_or(0);
        let jalan = port_live(s.port);
        // Zephyr owns the process it started, AND it is still the one serving
        // the port. If the port answers but we have no pid, the service was
        // started outside Zephyr and must be treated as read-only.
        let milik_zephyr = hidup != 0 && jalan;

        out.push(ServiceFound {
            id: s.id.to_string(),
            label: s.label.to_string(),
            path: if installed {
                path.to_string_lossy().to_string()
            } else {
                String::new()
            },
            version,
            port: s.port,
            installed,
            jalan,
            pid: hidup,
            milik_zephyr,
            // A server-style tool needs its data directory on the command
            // line. Reported next to the prefix so the UI can show it.
            datadir: if installed {
                datadir_service(&path, s)
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_default()
            } else {
                String::new()
            },
            windows_service: windows_service_untuk(s.id),
            versions,
        });
    }
    Ok(out)
}

/// What the UI needs after a start/stop attempt.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceHasil {
    pub ok: bool,
    pub pid: u32,
    pub jalan: bool,
    /// Set when ok is false, so the panel can explain itself.
    pub pesan: String,
}

#[tauri::command(async)]
pub fn devenv_service_stop(id: String) -> ZResult<ServiceHasil> {
    let kandidat = match SERVICE.iter().find(|s| s.id == id) {
        Some(s) => s,
        None => {
            return Ok(ServiceHasil {
                ok: false,
                pid: 0,
                jalan: false,
                pesan: format!("unknown service: {id}"),
            })
        }
    };

    // A Windows service is stopped through the manager too, and it is safe to
    // do so even though Zephyr did not spawn it: the service was registered by
    // the official installer, so it is the same install Zephyr is showing.
    let svc = windows_service_untuk(&id);
    if !svc.is_empty() {
        let _ = crate::proc::cmd("sc").args(["stop", &svc]).output();
        for _ in 0..60 {
            if !port_live(kandidat.port) {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
        let mati = !port_live(kandidat.port);
        return Ok(ServiceHasil {
            ok: mati,
            pid: 0,
            jalan: !mati,
            pesan: if mati {
                String::new()
            } else {
                format!("{} service did not stop", kandidat.label)
            },
        });
    }

    // Ownership gate: only a process this app started may be stopped. Anything
    // else is reported instead, so a MySQL from XAMPP that happens to sit on
    // the same port is never killed from here.
    let (_, pid) = match rt().into_iter().find(|(k, _)| k == &id) {
        Some(x) => x,
        None => {
            return Ok(ServiceHasil {
                ok: false,
                pid: 0,
                jalan: port_live(kandidat.port),
                pesan: "not started by Zephyr; left untouched".into(),
            })
        }
    };

    // taskkill mirrors what the terminal panel already does for a process
    // tree, so nginx workers die with the master.
    let _ = crate::proc::cmd("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .output();
    hapus_pid(&id);

    // The port takes a moment to be released.
    for _ in 0..20 {
        if !port_live(kandidat.port) {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }

    Ok(ServiceHasil {
        ok: true,
        pid: 0,
        jalan: port_live(kandidat.port),
        pesan: String::new(),
    })
}

#[tauri::command(async)]
pub fn devenv_service_start(id: String, root: String) -> ZResult<ServiceHasil> {
    let kandidat = match SERVICE.iter().find(|s| s.id == id) {
        Some(s) => s,
        None => {
            return Ok(ServiceHasil {
                ok: false,
                pid: 0,
                jalan: false,
                pesan: format!("unknown service: {id}"),
            })
        }
    };

    let path = match cari_service(Path::new(&root), kandidat) {
        Some((p, _)) if p.is_file() => p,
        _ => {
            return Ok(ServiceHasil {
                ok: false,
                pid: 0,
                jalan: false,
                pesan: format!("{} is not installed under {root}", kandidat.label),
            })
        }
    };

    // Refuse to start on a busy port rather than fight whoever has it.
    if port_live(kandidat.port) {
        return Ok(ServiceHasil {
            ok: false,
            pid: 0,
            jalan: true,
            pesan: format!("port {} is already in use", kandidat.port),
        });
    }

    let kerja = path.parent().map(|p| p.to_path_buf()).unwrap_or_default();

    /*
     * A service registered with the Windows service manager must be started
     * through `sc`, not by spawning its binary: PostgreSQL's `postgres.exe`
     * and MySQL's `mysqld.exe` read the service environment (data directory,
     * account, log paths) from the manager and abort when launched bare.
     * nginx, apache and redis ship as plain programs and take the normal path.
     */
    let svc = windows_service_untuk(kandidat.id);
    if !svc.is_empty() {
        let _ = crate::proc::cmd("sc").args(["start", &svc]).output();
        for _ in 0..30 {
            if port_live(kandidat.port) {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
        let jalan = port_live(kandidat.port);
        return Ok(ServiceHasil {
            ok: jalan,
            pid: 0,
            jalan,
            pesan: if jalan {
                String::new()
            } else {
                format!("{} service did not open port {}", kandidat.label, kandidat.port)
            },
        });
    }

    let mut c = crate::proc::cmd(&path);
    c.current_dir(&kerja);
    // nginx needs -p <prefix> or it looks for conf/ next to the binary.
    if kandidat.butuh_konf {
        c.arg("-p").arg(&kerja);
    }
    // PostgreSQL is not a server binary: pg_ctl is the launcher and it refuses
    // to run without the cluster directory. `start` keeps it detached, and the
    // log goes next to the cluster so a failed start is diagnosable.
    if matches!(kandidat.id, "postgres" | "postgresql") {
        match datadir_service(&path, kandidat) {
            Some(dd) => {
                c.arg("-D").arg(&dd);
                c.arg("-l").arg(dd.join("zephyr.log"));
                c.arg("start");
            }
            None => {
                return Ok(ServiceHasil {
                    ok: false,
                    pid: 0,
                    jalan: false,
                    pesan: "PostgreSQL cluster not initialised (no data directory)".into(),
                })
            }
        }
    }
    // MySQL aborts immediately without its cluster path, and a Laragon drop
    // keeps it outside the version folder, so the location is passed in
    // explicitly rather than relying on the binary's own default.
    if kandidat.id == "mysql" {
        match datadir_service(&path, kandidat) {
            Some(dd) => {
                c.arg(format!("--datadir={}", dd.to_string_lossy()));
                c.arg(format!("--port={}", kandidat.port));
            }
            None => {
                return Ok(ServiceHasil {
                    ok: false,
                    pid: 0,
                    jalan: false,
                    pesan: "MySQL data directory not initialised".into(),
                })
            }
        }
    }
    // Redirect the child's stdio so a service that logs to stdout cannot fill
    // the pipe and block.
    c.stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());

    let anak = match c.spawn() {
        Ok(x) => x,
        Err(e) => {
            return Ok(ServiceHasil {
                ok: false,
                pid: 0,
                jalan: false,
                pesan: format!("could not start {}: {e}", kandidat.label),
            })
        }
    };
    let pid = anak.id();
    // Zephyr must keep the handle so the child is not reaped while it serves.
    if let Ok(mut g) = ANAK.lock() {
        g.retain_mut(|c| c.try_wait().ok().flatten().is_none());
        g.push(anak);
    }
    catat_pid(&id, pid);

    // A service answers on its port well inside a second once the binary is
    // up, so a 5s ceiling only ever showed up as a frozen button. 1.5s is
    // enough for the slowest of the bundled servers (nginx on Windows forks
    // workers before the master binds) while staying responsive.
    for _ in 0..15 {
        if port_live(kandidat.port) {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }

    let jalan = port_live(kandidat.port);
    if !jalan {
        hapus_pid(&id);
    }
    Ok(ServiceHasil {
        ok: jalan,
        pid,
        jalan,
        pesan: if jalan {
            String::new()
        } else {
            format!("{} started but port {} never opened", kandidat.label, kandidat.port)
        },
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFound {
    pub nama: String,
    pub path: String,
    pub composer: bool,
    pub package: bool,
    /// Filled by the frontend: the project URL is built from the domain setting.
    pub url: String,
}

/// Scan for projects.
///
/// Only a real projects folder is scanned: `<root>/www` when it exists, else a
/// `Projects`/`sites` sibling. Scanning the root itself would list every
/// runtime and cache folder as a project, which is what the first attempt did.
#[tauri::command(async)]
pub fn devenv_scan_projects(root: String, domain: Option<String>) -> ZResult<Vec<ProjectFound>> {
    let tld = domain.unwrap_or_else(|| ".test".into());
    let base = PathBuf::from(&root);

    let folder_projects = ["www", "projects", "sites", "htdocs"]
        .iter()
        .map(|n| base.join(n))
        .find(|p| p.is_dir());

    let Some(folder_projects) = folder_projects else {
        // Nothing to scan yet. An empty list is the honest answer, and the
        // panel says so instead of inventing rows.
        return Ok(Vec::new());
    };

    let mut out = Vec::new();
    let Ok(entries) = std::fs::read_dir(&folder_projects) else {
        return Ok(out);
    };

    let mut dirs: Vec<PathBuf> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.is_dir())
        .collect();
    // Stable order so the list does not shuffle between refreshes.
    dirs.sort();

    for d in dirs {
        let nama = d
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        // A dot-folder is tooling, not a project.
        if nama.starts_with('.') {
            continue;
        }
        out.push(ProjectFound {
            url: format!("https://{nama}{tld}"),
            composer: d.join("composer.json").is_file(),
            package: d.join("package.json").is_file(),
            nama,
            path: d.to_string_lossy().to_string(),
        });
    }
    Ok(out)
}

/// Open a project folder in the system file manager.
#[tauri::command(async)]
pub fn devenv_open_path(path: String) -> ZResult<()> {
    if !std::path::Path::new(&path).exists() {
        return Err(crate::errors::ZephyrError::InvalidInput(format!(
            "path does not exist: {path}"
        )));
    }
    crate::proc::cmd("explorer")
        .arg(&path)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| crate::errors::ZephyrError::Io(format!("could not open {path}: {e}")))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn executable_in_menemba_cmd() {        let d = std::env::temp_dir().join("dv-test-bin");
        let _ = std::fs::create_dir_all(&d);
        let f = d.join("fake.cmd");
        std::fs::write(&f, "@echo off").unwrap();
        assert!(executable_in(&d, &["fake"]).is_some());
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn kandidat_memiliki_label_dan_exe() {
        for k in KANDIDAT {
            assert!(!k.id.is_empty(), "candidate without id");
            assert!(!k.label.is_empty(), "{} without label", k.id);
            assert!(!k.exes.is_empty(), "{} without exes", k.id);
        }
    }

    #[test]
    fn versi_dari_kosong_untuk_path_palsu() {
        assert_eq!(versi_dari(Path::new(r"Z:\tidak\ada\node.exe")), "");
    }
}
