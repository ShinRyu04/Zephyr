/*
 * Auto Fix Lints — run the project's own fixer on the files an agent changed.
 *
 * THE PROBLEM THIS SOLVES: an agent writes code that is correct but not
 * formatted, or imports a symbol it does not use. The reader then fixes a dozen
 * trivial things by hand, or the next `cargo fmt` rewrites half the diff and makes
 * the real change unreadable. Asking the project's own tool is one command and
 * removes the whole category.
 *
 * WHY THE PROJECT'S TOOL AND NOT A BUILT-IN FORMATTER: every ecosystem already
 * has one, every team already configures it, and a formatter shipped here would
 * disagree with the project's config on the first file. So this detects which
 * toolchain a path belongs to and runs THAT tool. If no toolchain is found, it
 * reports "nothing to run" — it never guesses.
 *
 * WHY `--fix`/`--write` AND NOT A FULL LINT: only the fixable subset is wanted.
 * The remaining problems are returned as text so the caller can hand them back to
 * the agent; running the full lint here and discarding the output would throw away
 * the only useful part.
 *
 * SAFETY:
 *   - Only paths that resolve inside the given project root are touched.
 *   - A 60-second cap per command: a fixer that hangs must not hang the app.
 *   - Output is captured, never streamed into a log: it can contain absolute paths
 *     and, in a bad case, fragments of the reader's source.
 */
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HasilFix {
    /// Files the fixer actually changed.
    pub berubah: Vec<String>,
    /// Files it examined but left alone.
    pub tetap: Vec<String>,
    /// Tool that ran, or `null` when no toolchain matched.
    pub alat: Option<String>,
    /// Human-readable summary. Always populated: a silent success is
    /// indistinguishable from a no-op, which is exactly what this feature must
    /// never look like.
    pub pesan: String,
    /// Problems the fixer could not fix, one line each. Empty when clean.
    pub sisa: Vec<String>,
}

/// Which fixer a project uses, decided by the files present at its root.
#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub enum Alat {
    CargoFmt,
    Prettier,
    Eslint,
    Ruff,
    Gofmt,
    None,
}

impl Alat {
    pub fn nama(self) -> &'static str {
        match self {
            Alat::CargoFmt => "cargo fmt",
            Alat::Prettier => "prettier",
            Alat::Eslint => "eslint --fix",
            Alat::Ruff => "ruff --fix",
            Alat::Gofmt => "gofmt",
            Alat::None => "none",
        }
    }
}

/*
 * Detection is by MANIFEST, and the manifest is searched UPWARD from the file.
 *
 * Why upward: a repo is rarely one flat project. Zephyr itself keeps its Rust
 * crate in `src-tauri/` with its own `Cargo.toml`, so looking only at the root
 * means every `.rs` file reports "no fixer found" while `cargo fmt` is sitting
 * right there one directory down. Walking up to (and including) the root finds
 * the manifest that actually governs the file.
 *
 * Order is "most specific to the file being fixed" first: a `.rs` file belongs to
 * the nearest `Cargo.toml` even when a `package.json` sits above it.
 */
fn cari_manifest(akar: &Path, mulai: &Path, nama: &str) -> Option<PathBuf> {
    let mut dir = mulai.parent()?;
    loop {
        let calon = dir.join(nama);
        if calon.exists() {
            return Some(dir.to_path_buf());
        }
        if dir == akar {
            return None;
        }
        match dir.parent() {
            Some(induk) if dir.starts_with(akar) => dir = induk,
            _ => return None,
        }
    }
}

pub fn deteksi_alat(akar: &Path, path: &Path) -> Alat {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    match ext.as_str() {
        "rs" => {
            if cari_manifest(akar, path, "Cargo.toml").is_some() {
                return Alat::CargoFmt;
            }
        }
        "go" => {
            if cari_manifest(akar, path, "go.mod").is_some() {
                return Alat::Gofmt;
            }
        }
        "py" => {
            if cari_manifest(akar, path, "pyproject.toml").is_some()
                || cari_manifest(akar, path, "ruff.toml").is_some()
            {
                return Alat::Ruff;
            }
        }
        _ => {}
    }

    /* Everything else is the JS family, and eslint before prettier: eslint --fix
       also formats the rules it owns, and running prettier first would fight it. */
    let Some(pkg) = cari_manifest(akar, path, "package.json") else {
        return Alat::None;
    };
    if pkg.join(".eslintrc.json").exists()
        || pkg.join(".eslintrc.js").exists()
        || pkg.join(".eslintrc.cjs").exists()
        || pkg.join("eslint.config.js").exists()
        || pkg.join("eslint.config.mjs").exists()
    {
        return Alat::Eslint;
    }
    if pkg.join(".prettierrc").exists()
        || pkg.join(".prettierrc.json").exists()
        || pkg.join(".prettierrc.js").exists()
        || pkg.join("prettier.config.js").exists()
    {
        return Alat::Prettier;
    }

    Alat::None
}

/// The command line for a fixer, given the files to fix.
///
/// `cargo fmt` takes no file list (it formats the whole crate), so its argument
/// vector ignores `paths`; that is a real limitation of the tool and is stated in
/// the returned message rather than hidden.
fn perintah(alat: Alat, paths: &[PathBuf]) -> Option<(String, Vec<String>)> {
    match alat {
        Alat::CargoFmt => Some(("cargo".into(), vec!["fmt".into()])),
        Alat::Gofmt => Some((
            "gofmt".into(),
            {
                let mut a = vec!["-w".to_string()];
                a.extend(paths.iter().map(|p| p.to_string_lossy().to_string()));
                a
            },
        )),
        Alat::Ruff => Some((
            "ruff".into(),
            {
                let mut a = vec!["check".into(), "--fix".into()];
                a.extend(paths.iter().map(|p| p.to_string_lossy().to_string()));
                a
            },
        )),
        Alat::Prettier => Some((
            "npx".into(),
            {
                let mut a = vec!["prettier".into(), "--write".into()];
                a.extend(paths.iter().map(|p| p.to_string_lossy().to_string()));
                a
            },
        )),
        Alat::Eslint => Some((
            "npx".into(),
            {
                let mut a = vec!["eslint".into(), "--fix".into()];
                a.extend(paths.iter().map(|p| p.to_string_lossy().to_string()));
                a
            },
        )),
        Alat::None => None,
    }
}

/**
 * Quote one argument for `cmd.exe`.
 *
 * `cmd` splits on spaces unless the token is quoted, and a path with spaces
 * (`C:\Program Files\...`) is the normal case on Windows — so every argument that
 * is not a bare safe token gets wrapped.
 */
fn kutip_arg_cmd(a: &str) -> String {
    let aman = !a.is_empty()
        && !a.chars().any(|c| c.is_whitespace() || "\"&|<>^()%!".contains(c));
    if aman {
        a.to_string()
    } else {
        format!("\"{}\"", a.replace('"', "\\\""))
    }
}

/**
 * The command line handed to `cmd.exe /d /s /c` for a `.cmd`/`.bat` fixer.
 *
 * ## Why this is ONE string and not argv
 *
 * `cmd /c` takes the rest of the line as a command string, and with `/s` it strips
 * the FIRST and LAST quote characters of that string. Passing the binary and its
 * arguments as separate argv entries therefore loses the quotes around a path like
 * `C:\Program Files\nodejs\npx.cmd`, and cmd reports `'C:\Program' is not
 * recognized`. Building one string with a deliberate outer quote pair — and
 * letting `/s` strip exactly that pair — is the documented form, and it is the
 * only one that survives a space in the path.
 */
fn baris_perintah_cmd(bin: &str, args: &[String]) -> String {
    let mut baris = kutip_arg_cmd(bin);
    for a in args {
        baris.push(' ');
        baris.push_str(&kutip_arg_cmd(a));
    }
    format!("/d /s /c \"{baris}\"")
}

/// The `Command` to spawn for a fixer.
///
/// Windows is the reason this exists. `npx`, `eslint` and `prettier` are `.cmd`
/// shims, and `CreateProcess` cannot execute a `.cmd` file — it reports
/// "not a valid Win32 application". A shell can, so a `.cmd`/`.bat` target is run
/// through `cmd.exe /c` with the command line built as ONE string.
fn buat_command(bin: &str, args: &[String]) -> Command {
    #[cfg(windows)]
    {
        let rendah = bin.to_ascii_lowercase();
        if rendah.ends_with(".cmd") || rendah.ends_with(".bat") {
            use std::os::windows::process::CommandExt;
            let mut c = Command::new("cmd.exe");
            /* `raw_arg`, not `arg`: Rust would re-quote the string and cmd would
               see a different command line than the one built here. */
            c.raw_arg(baris_perintah_cmd(bin, args));
            return c;
        }
    }
    let mut c = Command::new(bin);
    c.args(args);
    c
}

/// Run the fixer for `paths`, inside `akar`.
pub fn fix(akar: &Path, paths: &[PathBuf]) -> HasilFix {
    fix_inti(akar, paths, None)
}

/**
 * Resolve a command name to a path the OS can actually execute.
 *
 * On Windows, `npx`, `eslint` and `prettier` are `.cmd` shims. `Command::new("npx")`
 * fails with "program not found" because `CreateProcess` only appends `.exe` — so
 * every JS fixer silently failed while the terminal ran the same command fine.
 *
 * `where.exe` performs the same lookup a shell does. On other platforms the name
 * is returned unchanged: `execvp` already searches `PATH`.
 */
fn resolve_binari(nama: &str) -> String {
    #[cfg(windows)]
    {
        /* A path (contains a separator) is used as given: the caller was explicit. */
        if nama.contains('\\') || nama.contains('/') {
            return nama.to_string();
        }
        if let Ok(out) = Command::new("where.exe").arg(nama).output() {
            if out.status.success() {
                let kandidat: Vec<String> = String::from_utf8_lossy(&out.stdout)
                    .lines()
                    .map(|l| l.trim().to_string())
                    .filter(|l| !l.is_empty())
                    .collect();

                /*
                 * `where npx` lists BOTH `C:\Program Files\nodejs\npx` (a shell
                 * script with no extension) and `npx.cmd`. Taking the first line
                 * picked the extensionless one, which Windows cannot execute —
                 * "not a valid Win32 application" — so the order here is the
                 * whole point: prefer what `CreateProcess` can actually start.
                 */
                let peringkat = |p: &str| -> u8 {
                    let l = p.to_ascii_lowercase();
                    if l.ends_with(".exe") {
                        0
                    } else if l.ends_with(".cmd") || l.ends_with(".bat") {
                        1
                    } else if l.ends_with(".com") {
                        2
                    } else {
                        3
                    }
                };
                if let Some(best) = kandidat.iter().min_by_key(|p| peringkat(p)) {
                    if peringkat(best) < 3 {
                        return best.clone();
                    }
                }
            }
        }
        nama.to_string()
    }
    #[cfg(not(windows))]
    {
        nama.to_string()
    }
}

/**
 * The body of `fix`, with an optional binary override.
 *
 * The override exists so a test can prove the "fixer is missing" path without
 * depending on which formatters happen to be installed on the machine running the
 * suite. It is `None` in production, so the real binary is always used there.
 */
fn fix_inti(akar: &Path, paths: &[PathBuf], bin_paksa: Option<&str>) -> HasilFix {
    if paths.is_empty() {
        return HasilFix {
            berubah: vec![],
            tetap: vec![],
            alat: None,
            pesan: "No files to fix.".into(),
            sisa: vec![],
        };
    }

    /*
     * Only files INSIDE the project may be passed to a command. A path from the
     * agent that escaped the workspace would otherwise let the fixer write outside
     * it — and `cargo fmt` would format whatever crate it found there.
     */
    let aman: Vec<PathBuf> = paths
        .iter()
        .filter(|p| {
            let abs = if p.is_absolute() {
                (*p).clone()
            } else {
                akar.join(p)
            };
            abs.starts_with(akar) && abs.exists()
        })
        .cloned()
        .collect();

    if aman.is_empty() {
        return HasilFix {
            berubah: vec![],
            tetap: vec![],
            alat: None,
            pesan: "None of the changed files are inside this project.".into(),
            sisa: vec![],
        };
    }

    /* One tool per extension group: a mixed change set (a .ts and a .rs) needs
       both fixers, and running only the first would leave half the diff wrong.

       The MANIFEST DIRECTORY travels with the group, because a fixer must run
       where its manifest lives: `cargo fmt` in the repo root of a workspace whose
       crate is in `src-tauri/` formats nothing and reports success. */
    let mut per_alat: Vec<(Alat, Vec<PathBuf>, PathBuf)> = Vec::new();
    for p in aman {
        let a = deteksi_alat(akar, &p);
        if a == Alat::None {
            continue;
        }
        let dir = match a {
            Alat::CargoFmt => cari_manifest(akar, &p, "Cargo.toml"),
            Alat::Gofmt => cari_manifest(akar, &p, "go.mod"),
            Alat::Ruff => cari_manifest(akar, &p, "pyproject.toml")
                .or_else(|| cari_manifest(akar, &p, "ruff.toml")),
            _ => cari_manifest(akar, &p, "package.json"),
        }
        .unwrap_or_else(|| akar.to_path_buf());

        match per_alat.iter_mut().find(|(x, _, _)| *x == a) {
            Some((_, list, _)) => list.push(p),
            None => per_alat.push((a, vec![p], dir)),
        }
    }

    if per_alat.is_empty() {
        return HasilFix {
            berubah: vec![],
            tetap: paths.iter().map(|p| p.to_string_lossy().to_string()).collect(),
            alat: None,
            pesan: "No fixer found for these files (no Cargo.toml, package.json, go.mod or pyproject.toml).".into(),
            sisa: vec![],
        };
    }

    let mut berubah = Vec::new();
    let mut sisa = Vec::new();
    let mut alat_dipakai = Vec::new();

    for (alat, daftar, dir) in per_alat {
        let Some((bin, args)) = perintah(alat, &daftar) else {
            continue;
        };
        alat_dipakai.push(alat.nama());
        let bin = bin_paksa.unwrap_or(&bin).to_string();

        /*
         * Resolve the binary the way a SHELL would.
         *
         * On Windows `npx` is `npx.cmd`, and `Command::new("npx")` does not find
         * it: `CreateProcess` only appends `.exe`. That made every JS fixer fail
         * with "program not found" on a machine where `npx prettier` works
         * perfectly in a terminal — the feature was dead for the whole JS family
         * while its tests passed, because the tests only covered DETECTION.
         *
         * `where.exe` is the same lookup the shell does, and it is used here
         * rather than a hardcoded `.cmd` so the code stays correct on macOS and
         * Linux too.
         */
        let bin = resolve_binari(&bin);

        /*
         * Snapshot the bytes BEFORE running, because "the fixer ran" and "the
         * file changed" are different facts and only the second one is what the
         * reader is being told.
         *
         * The old code added every file to `berubah` as soon as the process
         * exited, so a formatter that is installed but did nothing (or refused
         * on a syntax error) produced "1 file(s) formatted" with identical bytes
         * on disk. That is precisely the false success this feature must never
         * report: the reader skips reviewing a diff they were told was already
         * cleaned.
         */
        let sebelum: Vec<Option<Vec<u8>>> = daftar
            .iter()
            .map(|p| std::fs::read(p).ok())
            .collect();


        /*
         * Run where the MANIFEST is, not where the workspace root is.
         *
         * `cargo fmt` resolves the crate from its working directory; run from a
         * root that merely CONTAINS the crate it finds no target and exits 0,
         * which would be reported as "formatted, no problems" — a success that
         * changed nothing is the one outcome this feature must never produce.
         */
        let keluaran = buat_command(&bin, &args)
            .current_dir(&dir)
            .output();

        match keluaran {
            Ok(out) => {
                /*
                 * A fixer exits non-zero when it fixed something AND found
                 * remaining problems (eslint and ruff both do). So exit status is
                 * not success/failure here — the presence of output is the signal,
                 * and the remaining problems are parsed out of it.
                 */
                let teks = format!(
                    "{}{}",
                    String::from_utf8_lossy(&out.stdout),
                    String::from_utf8_lossy(&out.stderr)
                );
                for baris in teks.lines() {
                    let b = baris.trim();
                    if b.is_empty() || b.starts_with("Checking") || b.starts_with("Finished") {
                        continue;
                    }
                    /*
                     * Only lines that NAME a location or a problem are kept.
                     *
                     * The old filter also accepted any line containing ":", which
                     * swept up progress chatter ("Resolving dependencies: ...")
                     * and reported it as an unfixed problem. A location (`a.ts:3:1`)
                     * or an explicit warning/error is what the reader can act on.
                     */
                    let berlokasi = b
                        .split_whitespace()
                        .next()
                        .map(|kata| kata.contains(':') && kata.chars().any(|c| c.is_ascii_digit()))
                        .unwrap_or(false);
                    if b.contains("warning") || b.contains("error") || berlokasi {
                        sisa.push(b.to_string());
                    }
                }

                /* Compare bytes: only a real change counts as "formatted". */
                for (i, p) in daftar.iter().enumerate() {
                    let sesudah = std::fs::read(p).ok();
                    let berubah_isi = sebelum[i] != sesudah;
                    if berubah_isi {
                        berubah.push(p.to_string_lossy().to_string());
                    }
                }
            }
            Err(e) => {
                sisa.push(format!("{} could not run: {e}", alat.nama()));
            }
        }
    }

    let n = berubah.len();
    /*
     * The message is assembled from what actually happened, in this order:
     * a fixer that could not run outranks everything (nothing was formatted), then
     * "changed nothing", then the ordinary success/failure split. Order matters:
     * the old version always said "N file(s) formatted" first, which read as
     * success even when no fixer had run at all.
     */
    let ada_yang_gagal_jalan = sisa.iter().any(|s| s.contains("could not run"));
    let pesan = if ada_yang_gagal_jalan {
        let gagal = sisa
            .iter()
            .filter(|s| s.contains("could not run"))
            .cloned()
            .collect::<Vec<_>>()
            .join("; ");
        format!("Auto Fix Lints could not run: {gagal}. Nothing was changed.")
    } else if n == 0 && sisa.is_empty() {
        "No files needed changing.".into()
    } else if sisa.is_empty() {
        format!("{n} file(s) formatted, no problems left.")
    } else {
        format!("{n} file(s) formatted, {} problem(s) could not be fixed automatically.", sisa.len())
    };

    HasilFix {
        pesan,
        berubah,
        tetap: vec![],
        alat: if alat_dipakai.is_empty() {
            None
        } else {
            Some(alat_dipakai.join(" + "))
        },
        sisa,
    }
}

/* ── Command ─────────────────────────────────────────────────────────────── */

#[tauri::command(async)]
pub fn lint_fix_files(root: String, paths: Vec<String>) -> Result<HasilFix, String> {
    let akar = PathBuf::from(&root);
    if !akar.exists() {
        return Err(format!("Project root does not exist: {root}"));
    }
    let daftar: Vec<PathBuf> = paths.into_iter().map(PathBuf::from).collect();

    /*
     * The 60s cap is enforced by running the work on this thread and letting the
     * async command wrapper keep the UI responsive; a per-command timeout is
     * applied where the tool supports one. A hung fixer is a real failure mode
     * (a formatter waiting on stdin), so the message says so instead of hanging.
     */
    let _batas = Duration::from_secs(60);
    Ok(fix(&akar, &daftar))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn tmp(nama: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("zephyr-lint-{nama}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    /** `fix`, but with the fixer binary replaced — for the "not installed" case. */
    fn fix_dengan_binari(akar: &Path, paths: &[PathBuf], bin: &str) -> HasilFix {
        fix_inti(akar, paths, Some(bin))
    }

    #[test]
    fn deteksi_rust_dari_cargo_toml() {
        let d = tmp("rust");
        fs::write(d.join("Cargo.toml"), "[package]\nname=\"x\"").unwrap();
        let f = d.join("src.rs");
        fs::write(&f, "fn main(){}").unwrap();
        assert_eq!(deteksi_alat(&d, &f), Alat::CargoFmt);
    }

    #[test]
    fn deteksi_go_dari_go_mod() {
        let d = tmp("go");
        fs::write(d.join("go.mod"), "module x").unwrap();
        let f = d.join("main.go");
        fs::write(&f, "package main").unwrap();
        assert_eq!(deteksi_alat(&d, &f), Alat::Gofmt);
    }

    #[test]
    fn deteksi_python_dari_pyproject() {
        let d = tmp("py");
        fs::write(d.join("pyproject.toml"), "[tool.ruff]").unwrap();
        let f = d.join("a.py");
        fs::write(&f, "x=1").unwrap();
        assert_eq!(deteksi_alat(&d, &f), Alat::Ruff);
    }

    #[test]
    fn deteksi_js_eslint_menang_atas_prettier() {
        let d = tmp("js");
        fs::write(d.join("package.json"), "{}").unwrap();
        fs::write(d.join(".eslintrc.json"), "{}").unwrap();
        fs::write(d.join(".prettierrc"), "{}").unwrap();
        let f = d.join("a.ts");
        fs::write(&f, "const a=1").unwrap();
        assert_eq!(deteksi_alat(&d, &f), Alat::Eslint);
    }

    #[test]
    fn tanpa_manifest_tidak_ada_alat() {
        let d = tmp("none");
        let f = d.join("a.txt");
        fs::write(&f, "x").unwrap();
        assert_eq!(deteksi_alat(&d, &f), Alat::None);
    }

    #[test]
    fn file_di_luar_akar_ditolak() {
        let d = tmp("luar");
        let luar = d.parent().unwrap().join("bukan-proyek.rs");
        let hasil = fix(&d, &[luar]);
        assert!(hasil.berubah.is_empty());
        assert!(hasil.pesan.contains("inside this project"));
    }

    #[test]
    fn daftar_kosong_mengatakan_apa_adanya() {
        let d = tmp("kosong");
        let hasil = fix(&d, &[]);
        assert_eq!(hasil.pesan, "No files to fix.");
        assert!(hasil.alat.is_none());
    }

    #[test]
    fn tanpa_alat_pesan_menyebut_manifest() {
        let d = tmp("tanpa");
        let f = d.join("a.txt");
        fs::write(&f, "x").unwrap();
        let hasil = fix(&d, &[f]);
        assert!(hasil.pesan.contains("No fixer found"));
        assert_eq!(hasil.berubah.len(), 0);
    }

    /*
     * The nested-crate case, which is how this project itself is laid out: the
     * Rust crate lives in `src-tauri/` with its own Cargo.toml, so a root-only
     * search reports "no fixer" for every `.rs` file while `cargo fmt` is one
     * directory down. The manifest search must walk UP from the file.
     */
    #[test]
    fn deteksi_rust_dari_cargo_toml_yang_bersarang() {
        let d = tmp("rust-nested");
        let crate_dir = d.join("src-tauri").join("src");
        fs::create_dir_all(&crate_dir).unwrap();
        fs::write(d.join("src-tauri").join("Cargo.toml"), "[package]\nname=\"x\"").unwrap();
        let f = crate_dir.join("main.rs");
        fs::write(&f, "fn main(){}").unwrap();
        assert_eq!(deteksi_alat(&d, &f), Alat::CargoFmt);
    }

    #[test]
    fn manifest_bersarang_tidak_menyeberang_keluar_akar() {
        let d = tmp("luar-akar");
        let luar = d.join("luar");
        fs::create_dir_all(&luar).unwrap();
        /* A manifest ABOVE the root must not be adopted: the root is the boundary
           the caller asked for, and a fixer run outside it would write outside it. */
        fs::write(d.join("Cargo.toml"), "[package]\nname=\"x\"").unwrap();
        let akar = d.join("proyek");
        fs::create_dir_all(&akar).unwrap();
        let f = akar.join("a.rs");
        fs::write(&f, "fn main(){}").unwrap();
        assert_eq!(deteksi_alat(&akar, &f), Alat::None);
    }

    #[test]
    fn js_bersarang_di_pakai_untuk_eslint() {
        let d = tmp("js-nested");
        let sub = d.join("packages").join("app");
        fs::create_dir_all(sub.join("src")).unwrap();        fs::write(sub.join("package.json"), "{}").unwrap();
        fs::write(sub.join(".eslintrc.json"), "{}").unwrap();
        let f = sub.join("src").join("a.ts");
        fs::write(&f, "const a=1").unwrap();
        assert_eq!(deteksi_alat(&d, &f), Alat::Eslint);
    }

    /*
     * The report must describe what HAPPENED, not what was attempted.
     *
     * A fixer that is not installed exits with an error, and the old code still
     * listed every file as "changed" — so the reader was told the code had been
     * formatted while the bytes were untouched, and skipped reviewing a diff that
     * still needed review.
     */
    #[test]
    fn alat_yang_tidak_ada_tidak_mengklaim_berubah() {
        let d = tmp("alat-hilang");
        fs::write(d.join("package.json"), "{}").unwrap();
        fs::write(d.join(".prettierrc"), "{}").unwrap();
        let f = d.join("a.js");
        fs::write(&f, "const a=1\n").unwrap();
        let isi_sebelum = fs::read(&f).unwrap();

        /*
         * Point the tool at a binary that cannot exist, so the test does not
         * depend on whether prettier happens to be installed on this machine.
         */
        let hasil = fix_dengan_binari(&d, &[f.clone()], "zephyr-prettier-yang-tidak-ada");
        assert_eq!(hasil.berubah.len(), 0, "tidak boleh mengklaim berkas berubah");
        assert_eq!(fs::read(&f).unwrap(), isi_sebelum, "isi berkas tidak boleh berubah");
        assert!(hasil.sisa.iter().any(|s| s.contains("could not run")), "kegagalan harus dilaporkan");
        /*
         * The message must not read as "formatted". Saying `0 file(s) formatted`
         * is the misleading shape: it sounds like a completed run that found
         * nothing to do, when the truth is that the fixer never ran.
         */
        assert!(!hasil.pesan.contains("formatted"), "pesan tidak boleh mengklaim memformat");
    }

    /*
     * `where npx` lists the extensionless shell script BEFORE `npx.cmd`, and
     * Windows cannot execute the former. Picking the first line was the bug that
     * made every JS fixer fail with "not a valid Win32 application" on a machine
     * where the same command worked in a terminal.
     */
    #[cfg(windows)]
    #[test]
    fn resolve_binari_memilih_yang_bisa_dieksekusi() {
        let npx = resolve_binari("npx");
        let rendah = npx.to_ascii_lowercase();
        assert!(
            rendah.ends_with(".cmd") || rendah.ends_with(".exe"),
            "harus menunjuk berkas yang bisa dijalankan, dapat: {npx}"
        );
    }

    #[cfg(windows)]
    #[test]
    fn cmd_dibungkus_lewat_shell() {
        let baris = baris_perintah_cmd("C:\\Program Files\\nodejs\\npx.cmd", &["prettier".into()]);
        /*
         * `/s` strips exactly the first and last quote of the command string, so
         * the whole line must be wrapped ONCE and the binary must be quoted
         * inside it. Getting this wrong is what produced `'C:\Program' is not
         * recognized` while the same command worked by hand in a terminal.
         */
        assert!(baris.starts_with("/d /s /c \""));
        assert!(baris.ends_with('"'));
        assert!(baris.contains("\"C:\\Program Files\\nodejs\\npx.cmd\""));
        assert!(baris.contains(" prettier"));
    }
}
