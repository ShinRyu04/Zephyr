#![cfg(test)]

use std::path::{Path, PathBuf};

fn tmpdir(name: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("zephyr-t14-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    std::fs::create_dir_all(&d).expect("buat folder temp");
    d
}

#[test]
fn log_menulis_baris() {
    let dir = tmpdir("write");
    let sink = crate::logging::sink_for_test(&dir);
    sink.write_line("hello from the test");
    let path = sink.path();
    let isi = std::fs::read_to_string(&path).expect("baca log");
    assert!(isi.contains("hello from the test"), "isi = {isi}");
    assert!(
        path.file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("zephyr-"),
        "nama file harus zephyr-YYYY-MM-DD.log, dapat {path:?}"
    );
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn log_rotate_saat_lewat_2mb() {
    let dir = tmpdir("rotate");
    let sink = crate::logging::sink_for_test(&dir);
    let max = crate::logging::max_bytes_for_test();

    let baris = "x".repeat(64 * 1024);
    let mut ditulis = 0u64;
    while ditulis <= max + 128 * 1024 {
        sink.write_line(&baris);
        ditulis += baris.len() as u64 + 1;
    }

    let aktif = sink.path();
    let stem = aktif.file_stem().unwrap().to_string_lossy().to_string();
    let rotated = dir.join(format!("{stem}-1.log"));

    assert!(rotated.exists(), "file rotasi -1.log harus ada");
    let len_aktif = std::fs::metadata(&aktif).unwrap().len();
    assert!(
        len_aktif < max,
        "file aktif harus < 2MB setelah rotate, dapat {len_aktif}"
    );
    assert!(crate::logging::keep_for_test() >= 1);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn lexical_clean_membuang_dotdot() {
    let out = crate::paths::lexical_clean_for_test(Path::new(r"C:\ws\sub\..\file.txt"));
    assert_eq!(out, PathBuf::from(r"C:\ws\file.txt"));

    let root = crate::paths::lexical_clean_for_test(Path::new(r"C:\..\..\x"));
    assert_eq!(root, PathBuf::from(r"C:\x"));
}

/*
 * Regresi: `.` pernah dibersihkan menjadi path KOSONG.
 *
 * `Component::CurDir` dibuang tanpa menulis apa pun kembali, jadi
 * `lexical_clean(".")` mengembalikan `""`. Path kosong tidak bisa
 * di-canonicalize, sehingga `validate_cwd` menolak folder yang jelas-jelas ada
 * dengan pesan `cwd bukan folder: .` - pesan itu menyebut `.` padahal yang
 * diuji adalah string kosong. Akibatnya `bash_run` gagal setiap kali agen
 * berjalan sebelum workspace terbuka, karena `akar()` mengirim `.`.
 */
#[test]
fn lexical_clean_pertahankan_titik_tunggal() {
    let titik = crate::paths::lexical_clean_for_test(Path::new("."));
    assert_eq!(titik, PathBuf::from("."), "`.` harus tetap `.`, bukan kosong");

    // Bentuk yang sama setelah dinormalkan oleh OS.
    let titik2 = crate::paths::lexical_clean_for_test(Path::new("./"));
    assert_eq!(titik2, PathBuf::from("."), "`./` harus tetap `.`");

    // Masukan yang benar-benar kosong tetap kosong: `normalize_workspace_path`
    // memakai kekosongan itu untuk mendeteksi path hilang.
    let kosong = crate::paths::lexical_clean_for_test(Path::new(""));
    assert!(kosong.as_os_str().is_empty(), "masukan kosong tetap kosong");
}

/// `..` di depan tidak punya segmen untuk dibatalkan, jadi ia harus DIPERTAHANKAN.
#[test]
fn lexical_clean_pertahankan_dotdot_di_depan() {
    let satu = crate::paths::lexical_clean_for_test(Path::new(".."));
    assert_eq!(satu, PathBuf::from(".."));

    let dua = crate::paths::lexical_clean_for_test(Path::new("../.."));
    assert_eq!(dua, PathBuf::from("../.."));

    // Bercampur dengan segmen nyata: yang bisa dibatalkan tetap dibatalkan.
    let campur = crate::paths::lexical_clean_for_test(Path::new("../ws/../x"));
    assert_eq!(campur, PathBuf::from("../x"));
}

/**
 * Yang paling penting: `validate_cwd(".")` harus MENERIMA direktori kerja.
 *
 * Ini bukan sekadar uji pembersih path - ini jalur yang dipakai `bash_run`,
 * `pty`, dan `ext_pkg`. Sebelum perbaikan, tiga pemanggil itu menolak `.`
 * dengan pesan yang menyesatkan.
 */
#[test]
fn validate_cwd_menerima_titik() {
    let d = crate::paths::validate_cwd(Path::new("."));
    assert!(d.is_ok(), "`.` harus diterima sebagai cwd: {d:?}");
    let p = d.unwrap();
    assert!(p.is_dir(), "hasil validasi `.` harus sebuah folder: {p:?}");
    assert!(
        p.is_absolute(),
        "hasilnya harus absolut supaya tidak bergantung cwd proses: {p:?}"
    );
}

/// Bentuk yang sama, lewat jalur yang sama, untuk `./` dan `.\\`.
#[test]
fn validate_cwd_menerima_bentuk_titik_lain() {
    assert!(crate::paths::validate_cwd(Path::new("./")).is_ok());
    assert!(crate::paths::validate_cwd(Path::new(".\\")).is_ok());
}

#[test]
fn is_inside_case_insensitive_di_windows() {
    let ws = Path::new(r"C:\Ws\Proj");
    assert!(crate::paths::is_inside(
        ws,
        Path::new(r"c:\ws\proj\src\a.rs")
    ));
    assert!(crate::paths::is_inside(ws, ws));
    assert!(!crate::paths::is_inside(ws, Path::new(r"C:\Ws\Lain\a.rs")));
}

#[test]
fn normalize_workspace_path_memberi_relatif() {
    let dir = tmpdir("norm");
    let sub = dir.join("sub");
    std::fs::create_dir_all(&sub).unwrap();
    let file = sub.join("a.txt");
    std::fs::write(&file, b"x").unwrap();

    let n = crate::paths::normalize_workspace_path(Some(&dir), &file).expect("normalize");
    assert!(n.inside, "file di dalam workspace harus inside");
    assert_eq!(n.relative.as_deref(), Some("sub/a.txt"));

    let keluar = dir.join("..").join("zephyr-t14-luar.txt");
    let n2 = crate::paths::normalize_workspace_path(Some(&dir), &keluar).expect("normalize luar");
    assert!(!n2.inside, "path .. keluar harus dilaporkan di luar");

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn normalize_menolak_path_kosong() {
    let e = crate::paths::normalize_workspace_path(None, Path::new(""));
    assert!(e.is_err(), "empty path harus error");
    assert_eq!(e.err().unwrap().code(), "InvalidInput");
}

#[test]
fn validate_cwd_menolak_file_dan_folder_hilang() {
    let dir = tmpdir("cwd");
    let file = dir.join("bukan-folder.txt");
    std::fs::write(&file, b"x").unwrap();

    assert!(crate::paths::validate_cwd(&dir).is_ok());
    assert!(crate::paths::validate_cwd(&file).is_err());
    assert!(crate::paths::validate_cwd(&dir.join("tidak-ada")).is_err());

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn ensure_writable_menolak_luar_workspace() {
    let dir = tmpdir("ws");
    std::fs::create_dir_all(dir.join("in")).unwrap();
    let st = crate::app_state::AppState::new();
    st.set_workspace(crate::paths::canonical_or_parent(&dir))
        .unwrap();

    assert!(st.ensure_writable(&dir.join("in").join("baru.txt")).is_ok());

    let luar = std::env::temp_dir().join("zephyr-t14-luar-tulis.txt");
    let e = st.ensure_writable(&luar).expect_err("harus ditolak");
    assert_eq!(e.code(), "WorkspaceOutside");

    let trik = dir.join("in").join("..").join("..").join("kabur.txt");
    let e2 = st
        .ensure_writable(&trik)
        .expect_err("path .. harus ditolak");
    assert_eq!(e2.code(), "WorkspaceOutside");

    st.allow_exact(&luar);
    assert!(st.ensure_writable(&luar).is_ok());

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn allow_exact_tidak_membuka_folder_induk() {
    let dir = tmpdir("allowfile");
    let f = dir.join("satu.txt");
    std::fs::write(&f, b"x").unwrap();

    let st = crate::app_state::AppState::new();

    let ws = tmpdir("allowfile-ws");
    st.set_workspace(crate::paths::canonical_or_parent(&ws))
        .unwrap();

    st.allow_exact(&f);
    assert!(
        st.ensure_writable(&f).is_ok(),
        "file yang dibaca boleh disimpan balik"
    );
    let tetangga = dir.join("dua.txt");
    assert!(
        st.ensure_writable(&tetangga).is_err(),
        "allow_exact TIDAK boleh membuka folder induk"
    );

    let _ = std::fs::remove_dir_all(&dir);
    let _ = std::fs::remove_dir_all(&ws);
}

#[test]
fn git_permit_serialisasi_satu_proses() {
    let st = crate::app_state::AppState::new();
    let a = st.git_permit().expect("permit pertama");

    drop(a);
    let b = st.git_permit().expect("permit setelah dilepas");
    drop(b);
}

/// Regresi 2026-10-13 — penantian izin git TIDAK boleh membekukan runtime.
///
/// Bentuk kejadian asli: 12 `editor_insert` bersamaan → 12 command git (semua
/// `#[tauri::command(async)]` dengan badan sinkron, jadi badannya jalan LANGSUNG DI
/// WORKER runtime) → 9+ worker berputar di spin-wait izin → task IPC yang mengantar
/// balasan `mcp_reply` tak pernah dapat giliran → app "diam" bermenti-menit.
///
/// Di sini runtime sengaja dibatasi 2 worker dan pemegang izin baru bisa SELESAI
/// setelah task lain membebaskannya (spawn_blocking + timer). Kalau penunggu
/// menyandera worker, tes ini macet sampai batas GIT_WAIT; dengan `block_in_place`
/// ia lulus cepat.
#[test]
fn git_permit_penunggu_tidak_membekukan_runtime() {
    let rt = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .build()
        .expect("runtime");
    let st = std::sync::Arc::new(crate::app_state::AppState::new());
    let st_pemegang = st.clone();

    let mulai = std::time::Instant::now();
    rt.block_on(async move {
        let (tx, rx) = std::sync::mpsc::channel::<()>();
        let pemegang = tokio::spawn(async move {
            let _izin = st_pemegang.git_permit().expect("izin pemegang");
            tokio::task::spawn_blocking(move || {
                let _ = rx.recv_timeout(std::time::Duration::from_secs(30));
            })
            .await
            .expect("recv");
        });

        // 12 penunggu — persis jumlah burst `editor_insert` pemicu kejadian asli.
        let mut penunggu = Vec::new();
        for _ in 0..12 {
            let stx = st.clone();
            penunggu.push(tokio::spawn(async move {
                let _izin = stx.git_permit().expect("izin penunggu");
            }));
        }

        // Pembebas: HARUS tetap dapat worker walau semua penunggu berputar.
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
            let _ = tx.send(());
        });

        pemegang.await.expect("pemegang selesai");
        for p in penunggu {
            p.await.expect("penunggu selesai");
        }
    });

    let ms = mulai.elapsed().as_millis() as u64;
    assert!(ms < 5_000, "penantian izin memblokir runtime: {ms} ms");
}

#[test]
fn perf_mark_dan_counter_tercatat() {
    let st = crate::app_state::AppState::new();
    st.perf_mark("uji", Some(12));
    st.bump("fs_write");
    st.bump("fs_write");

    let marks = st.perf_marks();
    assert!(marks
        .iter()
        .any(|m| m.name == "uji" && m.dur_ms == Some(12)));
    assert_eq!(st.counters().get("fs_write").copied(), Some(2));
    assert!(st.uptime_ms() < 60_000, "uptime baru dibuat harus kecil");
}

#[test]
fn map_fs_err_menyebut_path() {
    let e = crate::fs_utils::map_fs_err(
        std::io::Error::new(std::io::ErrorKind::NotFound, "os error 2"),
        r"C:\ws\hilang.txt",
    );
    assert_eq!(e.code(), "NotFound");
    let msg = e.to_string();
    assert!(
        msg.contains("hilang.txt"),
        "pesan harus menyebut file: {msg}"
    );
}
