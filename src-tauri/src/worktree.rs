/*
 * worktree.rs - `git worktree` dari dalam Zephyr, versi yang TIDAK melempar.
 *
 * Item kanonik `zeph-git-worktree` (tambahan Ryu 2026-10-14, poin 6 agen lain:
 * "Git worktree: bikin checkout paralel"): buat/daftar/hapus git worktree dari
 * dalam Zephyr supaya kerja paralel di beberapa cabang tidak saling
 * mengganggu.
 *
 * ## Kenapa berkas BARU, padahal `git.rs` sudah punya `git_worktree_*`
 *
 * Tiga command lama itu bekerja untuk JENDELA (`State<AppState>` -> workspace
 * yang sedang terbuka) dan mengembalikan `ZResult<...>`: kesalahan pemakaian
 * datang sebagai `Err` yang ditampilkan UI sebagai toast. Model tidak bisa
 * memakai bentuk itu dengan aman - satu argumen salah membuat panggilan tool
 * GAGAL, dan model tidak dapat membedakan "git menolak karena worktree kotor"
 * dari "IPC putus".
 *
 * Berkas ini karena itu sengaja:
 *
 *   - menerima `root` EKSPLISIT (bukan store), sehingga bisa diuji tanpa
 *     menjalankan app dan bisa dipanggil untuk repo mana pun yang sudah
 *     diverifikasi;
 *   - SELALU mengembalikan `{berhasil, pesan, data}` dan TIDAK PERNAH `Err`
 *     untuk kesalahan pemakaian - model menerima kalimat penolakan sebagai
 *     teks dan bisa memperbaiki argumennya sendiri;
 *   - memeriksa sendiri syarat-syarat yang tidak boleh diserahkan ke git:
 *     jalur relatif, `..`, root yang bukan akar repo, dan (khusus hapus)
 *     worktree yang masih punya perubahan belum di-commit.
 *
 * ## Batas yang dipegang
 *
 *   1. TANPA SHELL. `git` dijalankan sebagai proses anak dengan array argumen;
 *      tidak ada string perintah yang dirakit dan tidak ada `sh -c`. Jadi nama
 *      branch/jalur yang memuat spasi, `;`, `&&`, kutip, atau `$` tidak
 *      ditafsirkan siapa pun.
 *   2. Root harus AKAR REPO NYATA: `git rev-parse --show-toplevel` dijalankan di
 *      dalam root, dan hasilnya harus sama dengan root itu sendiri. Karena itu
 *      menyebut folder biasa (atau subfolder repo) DITOLAK dengan menyebutkan
 *      akar yang benar - lebih baik model dikoreksi daripada operasi menyerempet
 *      repo induk yang tidak dimaksud.
 *   3. Jalur worktree harus ABSOLUT dan tidak memuat komponen `..`. Relatif
 *      ditolak karena artinya bergantung cwd (cwd proses Zephyr, bukan root).
 *   4. `worktree_remove` menolak menghapus worktree yang `git status
 *      --porcelain` masih kotor - termasuk berkas BARU yang belum pernah
 *      di-commit - kecuali `paksa: true` benar-benar diminta. Kalau status
 *      tidak bisa dibaca, penghapusan DIBATALKAN (gagal-tertutup), bukan
 *      dilanjutkan.
 *   5. Worktree utama tidak pernah dihapus, dan hanya worktree yang terdaftar
 *      pada root itu yang boleh dihapus.
 *
 * Pemetaan argumen dari JS: `#[tauri::command]` menerjemahkan nama argumen ke
 * camelCase, jadi TS memanggil `buatCabang` untuk `buat_cabang` (sama seperti
 * `createBranch` di `git_worktree_add`).
 */
use serde::Serialize;
use serde_json::{json, Value};
use std::path::{Component, Path, PathBuf};
use std::process::Stdio;
use std::sync::mpsc;
use std::time::Duration;

/// Batas waktu satu pemanggilan git. `worktree add` pada repo besar bisa lama;
/// 60 detik lega tanpa membuat panggilan yang menggantung tak berujung.
const BATAS_WAKTU: Duration = Duration::from_secs(60);

/// Jumlah baris pesan git yang dipertahankan (baris setelahnya dipotong, dan
/// pemotongan itu dikatakan) supaya pesan penolakan tetap terbaca model.
const BARIS_PESAN_MAKS: usize = 6;
/// Anggaran karakter pesan git.
const KARAKTER_PESAN_MAKS: usize = 400;

/* ------------------------------------------------------------------ */
/* Bentuk balasan                                                      */
/* ------------------------------------------------------------------ */

/// Balasan seragam tiga command di berkas ini.
///
/// `data` berisi rincian saat `berhasil`, dan `null` saat gagal - jadi pemanggil
/// tidak pernah bisa salah membaca "tidak ada data" sebagai "berhasil kosong".
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Hasil {
    pub berhasil: bool,
    pub pesan: String,
    pub data: Value,
}

impl Hasil {
    fn gagal(pesan: impl Into<String>) -> Self {
        Hasil {
            berhasil: false,
            pesan: pesan.into(),
            data: Value::Null,
        }
    }

    fn sukses(pesan: impl Into<String>, data: Value) -> Self {
        Hasil {
            berhasil: true,
            pesan: pesan.into(),
            data,
        }
    }
}

/* ------------------------------------------------------------------ */
/* Menjalankan git                                                     */
/* ------------------------------------------------------------------ */

struct Keluaran {
    kode: Option<i32>,
    stdout: String,
    stderr: String,
}

impl Keluaran {
    fn berhasil(&self) -> bool {
        self.kode == Some(0)
    }
}

/// Jalankan `git` di `cwd` dengan array argumen - TANPA shell.
fn jalankan_git(cwd: &Path, args: &[&str]) -> Result<Keluaran, String> {
    if !cwd.is_dir() {
        return Err(format!("folder tidak ada: {}", cwd.display()));
    }

    let mut perintah = crate::proc::cmd("git");
    perintah.current_dir(cwd).args(args);
    perintah.env("GIT_TERMINAL_PROMPT", "0");
    perintah.env("GIT_PAGER", "cat");
    perintah.env("LC_ALL", "C");
    perintah
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let anak = perintah
        .spawn()
        .map_err(|e| format!("tidak bisa menjalankan git: {e}"))?;
    let pid = anak.id();

    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let _ = tx.send(anak.wait_with_output());
    });

    match rx.recv_timeout(BATAS_WAKTU) {
        Ok(Ok(out)) => Ok(Keluaran {
            kode: out.status.code(),
            stdout: String::from_utf8_lossy(&out.stdout).to_string(),
            stderr: String::from_utf8_lossy(&out.stderr).to_string(),
        }),
        Ok(Err(e)) => Err(format!("git gagal dijalankan: {e}")),
        Err(_) => {
            matikan(pid);
            Err(format!(
                "git tidak selesai dalam {} detik (dihentikan)",
                BATAS_WAKTU.as_secs()
            ))
        }
    }
}

/// Hentikan proses git yang melewati batas waktu, beserta anak-anaknya.
fn matikan(pid: u32) {
    #[cfg(windows)]
    {
        let _ = crate::proc::cmd("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    #[cfg(not(windows))]
    {
        let _ = crate::proc::cmd("kill").args(["-9", &pid.to_string()]).status();
    }
}

/// Pesan git yang dipadatkan: stderr lebih dulu, beberapa baris pertama saja.
fn pesan_git(out: &Keluaran) -> String {
    let bahan = if out.stderr.trim().is_empty() {
        out.stdout.trim()
    } else {
        out.stderr.trim()
    };

    let mut baris: Vec<String> = bahan
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect();

    if baris.is_empty() {
        return match out.kode {
            Some(k) => format!("git keluar dengan kode {k} tanpa pesan"),
            None => "git dihentikan tanpa kode keluar".to_string(),
        };
    }

    let dipotong = baris.len() > BARIS_PESAN_MAKS;
    baris.truncate(BARIS_PESAN_MAKS);
    let mut teks = baris.join(" · ");
    if teks.chars().count() > KARAKTER_PESAN_MAKS {
        teks = teks.chars().take(KARAKTER_PESAN_MAKS).collect::<String>();
        return format!("{teks}…");
    }
    if dipotong {
        teks.push_str(" · …");
    }
    teks
}

/* ------------------------------------------------------------------ */
/* Penjagaan jalur                                                     */
/* ------------------------------------------------------------------ */

/// Validasi jalur yang datang dari model: absolut, tanpa `..`, tanpa NUL.
fn mutlak_aman(raw: &str, apa: &str) -> Result<PathBuf, String> {
    let teks = raw.trim();
    if teks.is_empty() {
        return Err(format!("{apa} kosong"));
    }
    if teks.contains('\0') {
        return Err(format!("{apa} memuat byte NUL: ditolak"));
    }
    let p = PathBuf::from(teks);
    if !p.is_absolute() {
        return Err(format!(
            "{apa} harus jalur ABSOLUT (contoh: D:/repo-cabang); jalur relatif ditolak karena artinya bergantung direktori kerja proses: {teks}"
        ));
    }
    if p.components()
        .any(|c| matches!(c, Component::ParentDir))
    {
        return Err(format!("{apa} tidak boleh memuat '..': {teks}"));
    }
    Ok(p)
}

/// Akar repo NYATA untuk `root`.
///
/// Bukan sekadar "git berhasil jalan": hasil `git rev-parse --show-toplevel`
/// harus menunjuk folder yang sama dengan `root`. Kalau tidak, pesannya
/// menyebutkan akar yang benar, sehingga model bisa mengulang dengan argumen
/// yang tepat alih-alih menebak.
fn akar_repo(root: &str) -> Result<PathBuf, String> {
    let dir = mutlak_aman(root, "root")?;

    if !dir.is_dir() {
        return Err(format!("folder root tidak ada: {}", dir.display()));
    }

    let out = jalankan_git(&dir, &["rev-parse", "--show-toplevel"])?;
    if !out.berhasil() {
        return Err(format!(
            "root bukan repo git (git rev-parse --show-toplevel gagal): {} - {}",
            dir.display(),
            pesan_git(&out)
        ));
    }

    let top = out.stdout.trim();
    if top.is_empty() {
        return Err(format!(
            "root bukan repo git (git rev-parse tidak menyebut akar): {}",
            dir.display()
        ));
    }

    let akar = crate::paths::canonical_or_parent(Path::new(top));
    let diminta = crate::paths::canonical_or_parent(&dir);
    if !crate::paths::is_same(&akar, &diminta) {
        return Err(format!(
            "root bukan AKAR repo: {} ada DI DALAM repo {} - ulangi dengan root={}",
            dir.display(),
            akar.display(),
            akar.display()
        ));
    }

    Ok(akar)
}

/* ------------------------------------------------------------------ */
/* Inti tiap perintah (dipisah dari pembungkus Tauri supaya bisa diuji)  */
/* ------------------------------------------------------------------ */

use crate::git::GitWorktree;

fn daftar_worktree(akar: &Path) -> Result<Vec<GitWorktree>, String> {
    let out = jalankan_git(akar, &["worktree", "list", "--porcelain"])?;
    if !out.berhasil() {
        return Err(format!("git worktree list gagal: {}", pesan_git(&out)));
    }
    Ok(crate::git::parse_worktree_porcelain(&out.stdout))
}

fn cari_entri<'a>(daftar: &'a [GitWorktree], target: &Path) -> Option<&'a GitWorktree> {
    daftar.iter().find(|w| {
        crate::paths::is_same(
            &crate::paths::canonical_or_parent(Path::new(&w.path)),
            target,
        )
    })
}

/// Apakah worktree ini punya perubahan belum di-commit (termasuk berkas baru)?
///
/// Gagal membaca status = `Err`, dan pemanggil menolak menghapus. Menghapus
/// karena "tidak bisa memeriksa" akan menghapus pekerjaan orang.
fn worktree_kotor(dir: &Path) -> Result<bool, String> {
    let out = jalankan_git(
        dir,
        &["status", "--porcelain", "--untracked-files=all"],
    )?;
    if !out.berhasil() {
        return Err(format!(
            "tidak bisa memeriksa perubahan di {}: {}",
            dir.display(),
            pesan_git(&out)
        ));
    }
    Ok(!out.stdout.trim().is_empty())
}

fn list_dalam(root: &str) -> Result<Value, String> {
    let akar = akar_repo(root)?;
    let daftar = daftar_worktree(&akar)?;
    Ok(json!({
        "akar": akar.to_string_lossy(),
        "jumlah": daftar.len(),
        "worktree": serde_json::to_value(&daftar).unwrap_or(Value::Null),
    }))
}

fn add_dalam(
    root: &str,
    path: &str,
    branch: Option<String>,
    buat_cabang: Option<bool>,
) -> Result<Value, String> {
    let akar = akar_repo(root)?;
    let target = mutlak_aman(path, "jalur worktree")?;
    let target_aman = crate::paths::canonical_or_parent(&target);

    /*
     * Worktree adalah checkout NYATA: tempatnya harus folder sendiri di luar
     * repo. Di dalam repo artinya menggelar checkout di dalam working tree -
     * git sendiri menolaknya, tapi pesannya ("is a missing but already
     * registered worktree") tidak menjelaskan apa yang salah.
     */
    if crate::paths::is_inside(&akar, &target_aman) {
        return Err(format!(
            "jalur worktree ada DI DALAM repo ({}): taruh di folder terpisah, misalnya di sebelah repo",
            akar.display()
        ));
    }

    if target.exists() {
        return Err(format!("folder sudah ada, tidak ditimpa: {}", target.display()));
    }

    let induk = target
        .parent()
        .ok_or_else(|| format!("tidak bisa menentukan folder induk dari {}", target.display()))?;
    if !induk.is_dir() {
        return Err(format!(
            "folder induk belum ada: {} (buat dulu, berkas ini tidak menebak struktur folder)",
            induk.display()
        ));
    }

    let cabang = branch.unwrap_or_default().trim().to_string();
    if cabang.is_empty() {
        return Err("branch kosong: sebutkan nama branch (yang sudah ada, atau yang akan dibuat)".into());
    }

    // Nama branch divalidasi git sendiri (`check-ref-format`), bukan oleh
    // daftar karakter karangan di berkas ini.
    let cek = jalankan_git(&akar, &["check-ref-format", "--branch", &cabang])?;
    if !cek.berhasil() {
        return Err(format!(
            "nama branch tidak sah menurut git: {cabang} ({})",
            pesan_git(&cek)
        ));
    }

    let buat = buat_cabang.unwrap_or(false);
    let target_teks = target.to_string_lossy().to_string();

    let out = if buat {
        jalankan_git(
            &akar,
            &["worktree", "add", "-b", &cabang, &target_teks, "HEAD"],
        )?
    } else {
        jalankan_git(&akar, &["worktree", "add", &target_teks, &cabang])?
    };

    if !out.berhasil() {
        return Err(format!("git worktree add gagal: {}", pesan_git(&out)));
    }

    Ok(json!({
        "akar": akar.to_string_lossy(),
        "path": target_teks,
        "branch": cabang,
        "buatCabang": buat,
    }))
}

fn hapus_dalam(root: &str, path: &str, paksa: Option<bool>) -> Result<Value, String> {
    let akar = akar_repo(root)?;
    let target = mutlak_aman(path, "jalur worktree")?;
    let target_aman = crate::paths::canonical_or_parent(&target);

    /*
     * Hanya worktree yang TERDAFTAR pada root ini yang boleh dihapus. Daftar
     * itu sekaligus batas "di luar root": jalur yang bukan worktree milik root
     * ini tidak punya jalan masuk ke sini, jadi tidak ada `git worktree remove`
     * yang bisa menyerempet checkout repo lain.
     */
    let daftar = daftar_worktree(&akar)?;
    let entri = cari_entri(&daftar, &target_aman)
        .ok_or_else(|| {
            format!(
                "bukan worktree terdaftar untuk {}: {} (lihat worktree_list dulu)",
                akar.display(),
                target.display()
            )
        })?
        .clone();

    if entri.is_main {
        return Err(format!(
            "worktree UTAMA tidak boleh dihapus: {}",
            target.display()
        ));
    }

    let diminta_paksa = paksa.unwrap_or(false);

    // Pemeriksaan kotor dilakukan SEBELUM git dipanggil, supaya pesannya
    // menyebut apa yang akan hilang - dan supaya jalur `paksa` satu-satunya
    // jalan yang melewatinya.
    if !diminta_paksa {
        match worktree_kotor(&target) {
            Ok(false) => {}
            Ok(true) => {
                return Err(format!(
                    "worktree masih punya perubahan/BERKAS BARU yang belum di-commit: {} - commit atau buang dulu, atau kirim paksa=true kalau memang mau dihapus",
                    target.display()
                ));
            }
            Err(e) => {
                return Err(format!(
                    "penghapusan dibatalkan (gagal-tertutup): {e} - kirim paksa=true kalau memang mau dihapus tanpa memeriksa",
                ));
            }
        }
    }

    let target_teks = target.to_string_lossy().to_string();
    let out = if diminta_paksa {
        jalankan_git(&akar, &["worktree", "remove", "--force", &target_teks])?
    } else {
        jalankan_git(&akar, &["worktree", "remove", &target_teks])?
    };

    if !out.berhasil() {
        return Err(format!("git worktree remove gagal: {}", pesan_git(&out)));
    }

    Ok(json!({
        "akar": akar.to_string_lossy(),
        "path": target_teks,
        "paksa": diminta_paksa,
        "branch": entri.branch,
        "masih_ada_di_disk": target.exists(),
    }))
}

/* ------------------------------------------------------------------ */
/* Command Tauri                                                       */
/* ------------------------------------------------------------------ */

/// Daftar worktree milik repo `root`.
#[tauri::command(async)]
pub fn worktree_list(root: String) -> Hasil {
    match list_dalam(&root) {
        Ok(data) => {
            let jumlah = data
                .get("jumlah")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            let akar = data
                .get("akar")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            Hasil::sukses(format!("{jumlah} worktree terdaftar untuk {akar}"), data)
        }
        Err(e) => Hasil::gagal(e),
    }
}

/// Buat worktree baru di `path`; `buatCabang=true` berarti sekalian membuat
/// branch `branch` dari HEAD.
#[tauri::command(async)]
pub fn worktree_add(
    root: String,
    path: String,
    branch: Option<String>,
    buat_cabang: Option<bool>,
) -> Hasil {
    match add_dalam(&root, &path, branch, buat_cabang) {
        Ok(data) => {
            let p = data.get("path").and_then(|v| v.as_str()).unwrap_or("");
            let b = data.get("branch").and_then(|v| v.as_str()).unwrap_or("");
            Hasil::sukses(format!("worktree dibuat: {p} (branch {b})"), data)
        }
        Err(e) => Hasil::gagal(e),
    }
}

/// Hapus worktree `path` milik repo `root`. Worktree kotor hanya terhapus kalau
/// `paksa=true`.
#[tauri::command(async)]
pub fn worktree_remove(root: String, path: String, paksa: Option<bool>) -> Hasil {
    match hapus_dalam(&root, &path, paksa) {
        Ok(data) => {
            let p = data.get("path").and_then(|v| v.as_str()).unwrap_or("");
            Hasil::sukses(format!("worktree dihapus: {p}"), data)
        }
        Err(e) => Hasil::gagal(e),
    }
}

/* ------------------------------------------------------------------ */
/* Uji                                                                 */
/* ------------------------------------------------------------------ */

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    /// Folder uji sekali pakai; dihapus saat drop (termasuk saat panic).
    struct Bersihkan(PathBuf);

    impl Drop for Bersihkan {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn git_ada() -> bool {
        std::process::Command::new("git")
            .arg("--version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    fn git_raw(cwd: &Path, args: &[&str]) -> std::process::Output {
        let mut c = crate::proc::cmd("git");
        c.current_dir(cwd)
            .args(args)
            .env("GIT_TERMINAL_PROMPT", "0");
        c.output().expect("git harus bisa dijalankan di uji")
    }

    /// Folder sementara BERISI repo git mini buatan sendiri - tidak pernah
    /// menyentuh repo Zephyr tempat uji ini berjalan.
    fn repo_mini(nama: &str) -> (PathBuf, Bersihkan) {
        let akar = std::env::temp_dir().join(format!(
            "zephyr-uji-wt-{}-{nama}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&akar);
        fs::create_dir_all(&akar).expect("folder uji harus bisa dibuat");
        let jaga = Bersihkan(akar.clone());

        assert!(git_raw(&akar, &["init", "-q"]).status.success());
        fs::write(akar.join("a.txt"), "satu\n").expect("tulis berkas");
        assert!(git_raw(&akar, &["add", "-A"]).status.success());
        let commit = git_raw(
            &akar,
            &[
                "-c",
                "user.name=Zephyr Uji",
                "-c",
                "user.email=uji@zephyr.local",
                "-c",
                "commit.gpgsign=false",
                "commit",
                "-q",
                "-m",
                "awal",
            ],
        );
        assert!(
            commit.status.success(),
            "commit repo mini gagal: {}",
            String::from_utf8_lossy(&commit.stderr)
        );

        (akar, jaga)
    }

    fn teks(p: &Path) -> String {
        p.to_string_lossy().to_string()
    }

    /// Jalur target worktree yang BELUM ada, di sebelah repo mini.
    fn target_worktree(akar: &Path, nama: &str) -> PathBuf {
        let p = akar
            .parent()
            .expect("repo mini punya induk")
            .join(format!("{}-wt-{nama}", akar.file_name().unwrap().to_string_lossy()));
        let _ = fs::remove_dir_all(&p);
        p
    }

    /* ---------------- batas: root ---------------- */

    #[test]
    fn tolak_root_bukan_repo() {
        let kosong = std::env::temp_dir().join(format!("zephyr-uji-wt-kosong-{}", std::process::id()));
        let _ = fs::remove_dir_all(&kosong);
        fs::create_dir_all(&kosong).unwrap();
        let _jaga = Bersihkan(kosong.clone());

        let h = worktree_list(teks(&kosong));
        assert!(!h.berhasil, "folder biasa tidak boleh dianggap repo");
        assert!(h.pesan.contains("repo"), "pesan harus menyebut repo: {}", h.pesan);
        assert!(h.data.is_null(), "kegagalan tidak membawa data");
    }

    #[test]
    fn tolak_root_kosong_relatif_dan_titik_titik() {
        let h = worktree_list("   ".into());
        assert!(!h.berhasil);

        let h = worktree_list("repo-tanpa-akar".into());
        assert!(!h.berhasil);
        assert!(h.pesan.contains("ABSOLUT"), "pesan: {}", h.pesan);

        let h = worktree_list("D:/salah/../bukan".into());
        assert!(!h.berhasil);
        assert!(h.pesan.contains("'..'"), "pesan: {}", h.pesan);
    }

    #[test]
    fn tolak_root_subfolder_repo() {
        if !git_ada() {
            return;
        }
        let (akar, _jaga) = repo_mini("subfolder");
        let sub = akar.join("sub");
        fs::create_dir_all(&sub).unwrap();

        let h = worktree_list(teks(&sub));
        assert!(!h.berhasil, "subfolder bukan akar repo: {}", h.pesan);
        assert!(
            h.pesan.contains("AKAR repo") && h.pesan.contains(&teks(&akar)),
            "pesan harus menyebut akar yang benar: {}",
            h.pesan
        );
    }

    /* ---------------- batas: jalur ---------------- */

    #[test]
    fn tolak_jalur_relatif_dan_titik_titik() {
        if !git_ada() {
            return;
        }
        let (akar, _jaga) = repo_mini("jalur");

        let h = worktree_add(teks(&akar), "cabang-lain".into(), Some("uji".into()), Some(false));
        assert!(!h.berhasil, "jalur relatif harus ditolak");
        assert!(h.pesan.contains("ABSOLUT"), "pesan: {}", h.pesan);

        let nakal = format!("{}/halo/../nakal", teks(&akar.parent().unwrap()));
        let h = worktree_add(teks(&akar), nakal, Some("uji".into()), Some(false));
        assert!(!h.berhasil, "'..' harus ditolak");
        assert!(h.pesan.contains("'..'"), "pesan: {}", h.pesan);
    }

    #[test]
    fn tolak_jalur_di_dalam_repo() {
        if !git_ada() {
            return;
        }
        let (akar, _jaga) = repo_mini("di-dalam");

        let h = worktree_add(
            teks(&akar),
            teks(&akar.join("checkout-di-dalam")),
            Some("uji".into()),
            Some(true),
        );
        assert!(!h.berhasil, "worktree di dalam repo harus ditolak");
        assert!(h.pesan.contains("DI DALAM repo"), "pesan: {}", h.pesan);
        assert!(!akar.join("checkout-di-dalam").exists());
    }

    #[test]
    fn tolak_branch_kosong_dan_tidak_sah() {
        if !git_ada() {
            return;
        }
        let (akar, _jaga) = repo_mini("branch");
        let target = target_worktree(&akar, "branch");

        let h = worktree_add(teks(&akar), teks(&target), Some("   ".into()), Some(false));
        assert!(!h.berhasil);
        assert!(h.pesan.contains("branch kosong"), "pesan: {}", h.pesan);

        let h = worktree_add(
            teks(&akar),
            teks(&target),
            Some("nama~tidak sah".into()),
            Some(true),
        );
        assert!(!h.berhasil, "nama branch tak sah harus ditolak git");
        assert!(h.pesan.contains("tidak sah"), "pesan: {}", h.pesan);
        assert!(!target.exists(), "penolakan tidak boleh meninggalkan folder");
    }

    #[test]
    fn tolak_folder_target_sudah_ada() {
        if !git_ada() {
            return;
        }
        let (akar, _jaga) = repo_mini("sudah-ada");
        let target = target_worktree(&akar, "sudah-ada");
        fs::create_dir_all(&target).unwrap();
        let _jaga2 = Bersihkan(target.clone());

        let h = worktree_add(teks(&akar), teks(&target), Some("uji".into()), Some(true));
        assert!(!h.berhasil);
        assert!(h.pesan.contains("sudah ada"), "pesan: {}", h.pesan);
    }

    /* ---------------- bentuk keluaran gagal ---------------- */

    #[test]
    fn gagal_tidak_mengaku_berhasil() {
        if !git_ada() {
            return;
        }
        let (akar, _jaga) = repo_mini("bentuk");

        let kasus: Vec<Hasil> = vec![
            worktree_list("bukan-jalur-absolut".into()),
            worktree_add(teks(&akar), "relatif".into(), Some("uji".into()), Some(true)),
            worktree_remove(teks(&akar), teks(&akar), Some(false)),
        ];

        for h in kasus {
            assert!(!h.berhasil, "penolakan tidak boleh mengaku berhasil");
            assert!(!h.pesan.trim().is_empty(), "pesan penolakan harus terisi");
            assert!(h.data.is_null(), "data harus null saat gagal");
        }

        // Kegagalan harus BERBEDA satu sama lain: satu pesan generik untuk semua
        // penolakan membuat model menebak apa yang salah.
        let a = worktree_add(teks(&akar), "relatif".into(), Some("uji".into()), Some(true));
        let b = worktree_add(
            teks(&akar),
            teks(&akar.join("x")),
            Some("uji".into()),
            Some(true),
        );
        assert_ne!(a.pesan, b.pesan);
    }

    /* ---------------- uji nyata (repo mini di TMPDIR) ---------------- */

    #[test]
    fn nyata_daftar_repo_mini_menyebut_worktree_utama() {
        if !git_ada() {
            return;
        }
        let (akar, _jaga) = repo_mini("daftar");
        let h = worktree_list(teks(&akar));

        assert!(h.berhasil, "list harus berhasil: {}", h.pesan);
        let isi = h.data.get("worktree").and_then(|v| v.as_array()).cloned().unwrap_or_default();
        assert_eq!(isi.len(), 1, "repo baru: hanya worktree utama");
        assert_eq!(isi[0].get("isMain").and_then(|v| v.as_bool()), Some(true));
        assert!(h.pesan.contains("1 worktree"), "pesan: {}", h.pesan);
    }

    #[test]
    fn nyata_buat_daftar_hapus_bersih() {
        if !git_ada() {
            return;
        }
        let (akar, _jaga) = repo_mini("siklus");
        let target = target_worktree(&akar, "siklus");
        let _jaga2 = Bersihkan(target.clone());

        let b = worktree_add(teks(&akar), teks(&target), Some("uji-siklus".into()), Some(true));
        assert!(b.berhasil, "buat harus berhasil: {}", b.pesan);
        assert!(target.join("a.txt").is_file(), "checkout harus punya isi repo");

        let d = worktree_list(teks(&akar));
        assert!(d.berhasil, "{}", d.pesan);
        let isi = d.data.get("worktree").and_then(|v| v.as_array()).cloned().unwrap_or_default();
        assert_eq!(isi.len(), 2, "setelah add: utama + satu cabang");
        assert!(
            isi.iter().any(|w| w.get("branch").and_then(|v| v.as_str()) == Some("uji-siklus")),
            "branch baru harus muncul di daftar"
        );

        let h = worktree_remove(teks(&akar), teks(&target), Some(false));
        assert!(h.berhasil, "hapus worktree bersih harus berhasil: {}", h.pesan);
        assert!(!target.exists(), "folder worktree harus hilang setelah hapus");

        let sisa = worktree_list(teks(&akar));
        let isi = sisa.data.get("worktree").and_then(|v| v.as_array()).cloned().unwrap_or_default();
        assert_eq!(isi.len(), 1, "kembali ke satu worktree");
    }

    /// Contoh keluaran NYATA tiga perintah pada repo mini di TMPDIR.
    ///
    /// Tidak menyentuh repo Zephyr: repo mini dibuat sendiri (`git init`) di
    /// folder sementara dan dihapus oleh `Bersihkan`. Dijalankan dengan
    /// `cargo test --lib worktree::tests::contoh -- --nocapture` kalau pesan
    /// aslinya ingin dilihat (dipakai sebagai bukti di
    /// `docs/LAPORAN-GIT-WORKTREE.md`).
    #[test]
    fn contoh_keluaran_nyata_tiga_perintah() {
        if !git_ada() {
            return;
        }
        let (akar, _jaga) = repo_mini("contoh");
        let target = target_worktree(&akar, "contoh");
        let _jaga2 = Bersihkan(target.clone());

        let daftar = worktree_list(teks(&akar));
        println!("worktree_list(root={}) -> {{berhasil:{}, pesan:{:?}}}", teks(&akar), daftar.berhasil, daftar.pesan);
        assert!(daftar.berhasil);

        let buat = worktree_add(
            teks(&akar),
            teks(&target),
            Some("contoh-cabang".into()),
            Some(true),
        );
        println!("worktree_add(path={}) -> {{berhasil:{}, pesan:{:?}}}", teks(&target), buat.berhasil, buat.pesan);
        assert!(buat.berhasil);

        // Tanpa paksa: worktree bersih tetap boleh dihapus, dan `paksa` di data
        // harus `false` - bukan diam-diam `true`.
        let hapus = worktree_remove(teks(&akar), teks(&target), None);
        println!("worktree_remove(path={}) -> {{berhasil:{}, pesan:{:?}}}", teks(&target), hapus.berhasil, hapus.pesan);
        assert!(hapus.berhasil);
        assert_eq!(hapus.data.get("paksa").and_then(|v| v.as_bool()), Some(false));

        // Dan penolakan yang sama, apa adanya, untuk worktree kotor.
        let (akar2, _jaga3) = repo_mini("contoh-kotor");
        let target2 = target_worktree(&akar2, "contoh-kotor");
        let _jaga4 = Bersihkan(target2.clone());
        let b2 = worktree_add(teks(&akar2), teks(&target2), Some("kotor-cabang".into()), Some(true));
        assert!(b2.berhasil, "{}", b2.pesan);
        fs::write(target2.join("baru.txt"), "belum di-commit\n").unwrap();
        let tolak = worktree_remove(teks(&akar2), teks(&target2), None);
        println!("worktree_remove(kotor) -> {{berhasil:{}, pesan:{:?}}}", tolak.berhasil, tolak.pesan);
        assert!(!tolak.berhasil);
    }

    #[test]
    fn nyata_tolak_hapus_dengan_perubahan_tanpa_paksa() {
        if !git_ada() {
            return;
        }
        let (akar, _jaga) = repo_mini("kotor");
        let target = target_worktree(&akar, "kotor");
        let _jaga2 = Bersihkan(target.clone());

        let b = worktree_add(teks(&akar), teks(&target), Some("uji-kotor".into()), Some(true));
        assert!(b.berhasil, "{}", b.pesan);
        fs::write(target.join("a.txt"), "diubah belum di-commit\n").unwrap();
        fs::write(target.join("baru.txt"), "berkas baru\n").unwrap();

        let h = worktree_remove(teks(&akar), teks(&target), Some(false));
        assert!(!h.berhasil, "worktree kotor tidak boleh terhapus tanpa paksa");
        assert!(h.pesan.contains("belum di-commit"), "pesan: {}", h.pesan);
        assert!(target.join("a.txt").is_file(), "tidak ada yang boleh terhapus");
        assert!(target.join("baru.txt").is_file(), "berkas baru pun tidak");
    }

    #[test]
    fn nyata_paksa_menghapus_perubahan() {
        if !git_ada() {
            return;
        }
        let (akar, _jaga) = repo_mini("paksa");
        let target = target_worktree(&akar, "paksa");
        let _jaga2 = Bersihkan(target.clone());

        let b = worktree_add(teks(&akar), teks(&target), Some("uji-paksa".into()), Some(true));
        assert!(b.berhasil, "{}", b.pesan);
        fs::write(target.join("a.txt"), "diubah belum di-commit\n").unwrap();

        let h = worktree_remove(teks(&akar), teks(&target), Some(true));
        assert!(h.berhasil, "paksa=true harus menghapus: {}", h.pesan);
        assert_eq!(h.data.get("paksa").and_then(|v| v.as_bool()), Some(true));
        assert!(!target.exists(), "folder harus hilang");
    }

    #[test]
    fn tolak_hapus_bukan_worktree_terdaftar_dan_worktree_utama() {
        if !git_ada() {
            return;
        }
        let (akar, _jaga) = repo_mini("bukan-terdaftar");

        let h = worktree_remove(teks(&akar), teks(&akar), Some(true));
        assert!(!h.berhasil, "worktree utama tidak boleh dihapus");
        assert!(h.pesan.contains("UTAMA"), "pesan: {}", h.pesan);
        assert!(akar.join("a.txt").is_file(), "repo utama harus utuh");

        let lain = akar.parent().unwrap().join(format!(
            "{}-bukan-wt",
            akar.file_name().unwrap().to_string_lossy()
        ));
        let _ = fs::remove_dir_all(&lain);
        fs::create_dir_all(&lain).unwrap();
        let _jaga2 = Bersihkan(lain.clone());

        // Folder lain yang KEBETULAN repo git: bukan worktree milik root ini.
        assert!(git_raw(&lain, &["init", "-q"]).status.success());
        let h = worktree_remove(teks(&akar), teks(&lain), Some(true));
        assert!(!h.berhasil, "repo lain bukan worktree milik root ini");
        assert!(h.pesan.contains("terdaftar"), "pesan: {}", h.pesan);
        assert!(lain.join(".git").exists(), "repo lain tidak boleh tersentuh");
    }
}
