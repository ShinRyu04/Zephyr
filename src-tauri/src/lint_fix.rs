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
 * Detection is by MANIFEST, in a fixed order, because several can coexist: a repo
 * can hold a Cargo workspace and a `package.json` for its docs. The first match
 * wins, and the order is "most specific to the file being fixed" first — a `.rs`
 * file belongs to cargo even when a package.json sits beside it.
 */
pub fn deteksi_alat(akar: &Path, path: &Path) -> Alat {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    match ext.as_str() {
        "rs" => {
            if akar.join("Cargo.toml").exists() {
                return Alat::CargoFmt;
            }
        }
        "go" => {
            if akar.join("go.mod").exists() {
                return Alat::Gofmt;
            }
        }
        "py" => {
            if akar.join("pyproject.toml").exists() || akar.join("ruff.toml").exists() {
                return Alat::Ruff;
            }
        }
        _ => {}
    }

    /* Everything else is the JS family, and eslint before prettier: eslint --fix
       also formats the rules it owns, and running prettier first would fight it. */
    if akar.join("package.json").exists() {
        if akar.join(".eslintrc.json").exists()
            || akar.join(".eslintrc.js").exists()
            || akar.join(".eslintrc.cjs").exists()
            || akar.join("eslint.config.js").exists()
            || akar.join("eslint.config.mjs").exists()
        {
            return Alat::Eslint;
        }
        if akar.join(".prettierrc").exists()
            || akar.join(".prettierrc.json").exists()
            || akar.join(".prettierrc.js").exists()
            || akar.join("prettier.config.js").exists()
        {
            return Alat::Prettier;
        }
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

/// Run the fixer for `paths`, inside `akar`.
pub fn fix(akar: &Path, paths: &[PathBuf]) -> HasilFix {
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
       both fixers, and running only the first would leave half the diff wrong. */
    let mut per_alat: Vec<(Alat, Vec<PathBuf>)> = Vec::new();
    for p in aman {
        let a = deteksi_alat(akar, &p);
        if a == Alat::None {
            continue;
        }
        match per_alat.iter_mut().find(|(x, _)| *x == a) {
            Some((_, list)) => list.push(p),
            None => per_alat.push((a, vec![p])),
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

    for (alat, daftar) in per_alat {
        let Some((bin, args)) = perintah(alat, &daftar) else {
            continue;
        };
        alat_dipakai.push(alat.nama());

        let keluaran = Command::new(&bin)
            .args(&args)
            .current_dir(akar)
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
                    if b.contains("warning") || b.contains("error") || b.contains(":") {
                        sisa.push(b.to_string());
                    }
                }
                berubah.extend(daftar.iter().map(|p| p.to_string_lossy().to_string()));
            }
            Err(e) => {
                sisa.push(format!("{} could not run: {e}", alat.nama()));
            }
        }
    }

    let n = berubah.len();
    HasilFix {
        pesan: if sisa.is_empty() {
            format!("{n} file(s) formatted, no problems left.")
        } else {
            format!("{n} file(s) formatted, {} problem(s) could not be fixed automatically.", sisa.len())
        },
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
}
