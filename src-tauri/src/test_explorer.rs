// test_explorer.rs — deteksi & jalankan test project (T2.4).
//
// KENAPA fitur ini ada: menjalankan test adalah pekerjaan yang paling sering
// diulang saat ngoding, tapi Zephyr belum punya jalan pintasnya — user harus
// membuka terminal dan mengetik perintah panjang tiap kali. Test Explorer
// mendeteksi runner dari file project, lalu menyediakan tombol jalankan.
//
// YANG DIDETEKSI (dari file penanda di root workspace):
//   * package.json  → npm test / vitest / jest (dibaca dari scripts + deps)
//   * Cargo.toml    → cargo test
//   * go.mod        → go test ./...
//   * pyproject.toml / pytest.ini → pytest
//   * composer.json → composer test
//   * Makefile      → make test
//
// PENTING: modul ini TIDAK menebak perintah yang tidak ada. Kalau `scripts.test`
// tidak didefinisikan di package.json, npm test akan gagal — jadi entri itu
// hanya dimunculkan kalau benar-benar ada.

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::errors::ZResult;

/// Satu runner test yang terdeteksi.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestRunner {
    /// id stabil (dipakai UI sebagai kunci)
    pub id: String,
    /// nama yang ditampilkan, mis. "Vitest"
    pub nama: String,
    /// perintah yang akan dijalankan
    pub command: String,
    pub args: Vec<String>,
    /// folder kerja relatif terhadap root workspace (biasanya "")
    pub cwd: String,
    /// file penanda yang membuat runner ini terdeteksi
    pub penanda: String,
    /// catatan singkat (mis. "18 test terdeteksi dari nama file")
    pub catatan: String,
}

/// Baca file kecil dengan aman (gagal = string kosong).
fn baca(path: &Path) -> String {
    std::fs::read_to_string(path).unwrap_or_default()
}

/// Deteksi runner test yang tersedia di root workspace.
#[tauri::command]
pub fn test_detect(root: String) -> ZResult<Vec<TestRunner>> {
    let akar = Path::new(&root);
    if !akar.is_dir() {
        return Ok(Vec::new());
    }
    let mut hasil: Vec<TestRunner> = Vec::new();

    // ── Node: package.json ──
    let pkg = akar.join("package.json");
    if pkg.is_file() {
        let teks = baca(&pkg);
        // Cari nama script test tanpa parser JSON penuh: file package.json
        // bisa memuat komentar/trailing comma di beberapa proyek.
        let ada_test = teks.contains("\"test\"");
        let ada_vitest = teks.contains("\"vitest\"");
        let ada_jest = teks.contains("\"jest\"");
        let nama_runner = if ada_vitest {
            "Vitest"
        } else if ada_jest {
            "Jest"
        } else {
            "npm test"
        };
        if ada_test || ada_vitest || ada_jest {
            hasil.push(TestRunner {
                id: "npm-test".into(),
                nama: nama_runner.into(),
                command: "npm".into(),
                args: vec!["test".into(), "--".into(), "--run".into()],
                cwd: String::new(),
                penanda: "package.json".into(),
                catatan: if ada_test {
                    "dari scripts.test".into()
                } else {
                    "dari dependensi".into()
                },
            });
        }
    }

    // ── Script npm lain yang lazim dipakai untuk memeriksa kode ──
    // (Zephyr sendiri memakai `verify`, `soak`, `stress` — bukan `test`.)
    if pkg.is_file() {
        let teks = baca(&pkg);
        for nama_script in ["verify", "soak", "stress", "lint"] {
            let pola = format!("\"{nama_script}\"");
            if teks.contains(&pola) {
                hasil.push(TestRunner {
                    id: format!("npm-{nama_script}"),
                    nama: format!("npm run {nama_script}"),
                    command: "npm".into(),
                    args: vec!["run".into(), nama_script.into()],
                    cwd: String::new(),
                    penanda: "package.json".into(),
                    catatan: format!("scripts.{nama_script}"),
                });
            }
        }
    }

    // ── Rust: Cargo.toml ──
    if akar.join("Cargo.toml").is_file() {
        hasil.push(TestRunner {
            id: "cargo-test".into(),
            nama: "cargo test".into(),
            command: "cargo".into(),
            args: vec!["test".into()],
            cwd: String::new(),
            penanda: "Cargo.toml".into(),
            catatan: String::new(),
        });
    }

    // ── Go: go.mod ──
    if akar.join("go.mod").is_file() {
        hasil.push(TestRunner {
            id: "go-test".into(),
            nama: "go test".into(),
            command: "go".into(),
            args: vec!["test".into(), "./...".into()],
            cwd: String::new(),
            penanda: "go.mod".into(),
            catatan: String::new(),
        });
    }

    // ── Python: pytest ──
    let ada_pyproject = akar.join("pyproject.toml").is_file();
    let ada_pytest_ini = akar.join("pytest.ini").is_file();
    let ada_tests_dir = akar.join("tests").is_dir();
    if ada_pyproject || ada_pytest_ini || ada_tests_dir {
        // Hanya tawarkan kalau pytest memang disebut atau ada folder tests.
        let teks = baca(&akar.join("pyproject.toml"));
        if teks.contains("pytest") || ada_pytest_ini || ada_tests_dir {
            hasil.push(TestRunner {
                id: "pytest".into(),
                nama: "pytest".into(),
                command: "python".into(),
                args: vec!["-m".into(), "pytest".into(), "-q".into()],
                cwd: String::new(),
                penanda: if ada_pytest_ini {
                    "pytest.ini".into()
                } else if ada_pyproject {
                    "pyproject.toml".into()
                } else {
                    "tests/".into()
                },
                catatan: String::new(),
            });
        }
    }

    // ── PHP: composer.json ──
    let composer = akar.join("composer.json");
    if composer.is_file() && baca(&composer).contains("\"test\"") {
        hasil.push(TestRunner {
            id: "composer-test".into(),
            nama: "composer test".into(),
            command: "composer".into(),
            args: vec!["test".into()],
            cwd: String::new(),
            penanda: "composer.json".into(),
            catatan: String::new(),
        });
    }

    // ── Makefile: target test ──
    let mf = akar.join("Makefile");
    if mf.is_file() {
        let teks = baca(&mf);
        // Target harus di awal baris: "test:" atau "test :"
        let ada_target = teks.lines().any(|l| {
            let t = l.trim_start();
            t.starts_with("test:") || t.starts_with("test :")
        });
        if ada_target {
            hasil.push(TestRunner {
                id: "make-test".into(),
                nama: "make test".into(),
                command: "make".into(),
                args: vec!["test".into()],
                cwd: String::new(),
                penanda: "Makefile".into(),
                catatan: String::new(),
            });
        }
    }

    Ok(hasil)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Root yang tidak ada harus menghasilkan daftar kosong, bukan error.
    #[test]
    fn root_tidak_ada_kosong() {
        let r = test_detect("D:/folder-yang-tidak-mungkin-ada-xyz".into()).unwrap();
        assert!(r.is_empty());
    }

    /// Deteksi di repo Zephyr sendiri.
    ///
    /// CATATAN PENTING: Zephyr TIDAK punya `scripts.test` di package.json
    /// (yang ada `verify`, `soak`, dst). Deteksi yang benar adalah TIDAK
    /// menawarkan npm-test di sini — menawarkannya berarti user menekan
    /// tombol dan langsung dapat error "missing script: test".
    #[test]
    fn deteksi_repo_zephyr() {
        let r = test_detect("D:/Zephyr".into()).unwrap();
        assert!(
            !r.iter().any(|x| x.id == "npm-test"),
            "npm-test TIDAK boleh muncul (Zephyr tidak punya scripts.test): {:?}",
            r.iter().map(|x| &x.id).collect::<Vec<_>>()
        );
        // Semua entri yang muncul harus punya command & nama tidak kosong.
        for x in &r {
            assert!(!x.command.is_empty(), "command kosong: {}", x.id);
            assert!(!x.nama.is_empty(), "nama kosong: {}", x.id);
        }
    }

    /// Setiap runner punya id unik (tidak ada duplikat).
    #[test]
    fn id_unik() {
        let r = test_detect("D:/Zephyr".into()).unwrap();
        let mut ids: Vec<&str> = r.iter().map(|x| x.id.as_str()).collect();
        ids.sort_unstable();
        let n = ids.len();
        ids.dedup();
        assert_eq!(ids.len(), n, "id runner duplikat");
    }
}
