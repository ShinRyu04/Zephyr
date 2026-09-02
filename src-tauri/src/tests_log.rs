// tests_log.rs — unit test fase 14: rotate log, keamanan path, error mapping.
// Jalan dengan `cargo test --lib` (tanpa membuka window Tauri).

#![cfg(test)]

use std::path::{Path, PathBuf};

fn tmpdir(name: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("zephyr-t14-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    std::fs::create_dir_all(&d).expect("buat folder temp");
    d
}

// ───────────────────────── logging ─────────────────────────

#[test]
fn log_menulis_baris() {
    let dir = tmpdir("write");
    let sink = crate::logging::sink_for_test(&dir);
    sink.write_line("halo dari uji");
    let path = sink.path();
    let isi = std::fs::read_to_string(&path).expect("baca log");
    assert!(isi.contains("halo dari uji"), "isi = {isi}");
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

    // Tulis sedikit di atas batas: satu rotate harus terjadi.
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

// ───────────────────────── paths ─────────────────────────

#[test]
fn lexical_clean_membuang_dotdot() {
    let out = crate::paths::lexical_clean_for_test(Path::new(r"C:\ws\sub\..\file.txt"));
    assert_eq!(out, PathBuf::from(r"C:\ws\file.txt"));

    // `..` tidak boleh naik melewati root.
    let root = crate::paths::lexical_clean_for_test(Path::new(r"C:\..\..\x"));
    assert_eq!(root, PathBuf::from(r"C:\x"));
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

    // Path dengan `..` yang menunjuk KELUAR harus terdeteksi di luar.
    let keluar = dir.join("..").join("zephyr-t14-luar.txt");
    let n2 = crate::paths::normalize_workspace_path(Some(&dir), &keluar).expect("normalize luar");
    assert!(!n2.inside, "path .. keluar harus dilaporkan di luar");

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn normalize_menolak_path_kosong() {
    let e = crate::paths::normalize_workspace_path(None, Path::new(""));
    assert!(e.is_err(), "path kosong harus error");
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

// ───────────────────── AppState: lock & permit ─────────────────────

#[test]
fn ensure_writable_menolak_luar_workspace() {
    let dir = tmpdir("ws");
    std::fs::create_dir_all(dir.join("in")).unwrap();
    let st = crate::app_state::AppState::new();
    st.set_workspace(crate::paths::canonical_or_parent(&dir))
        .unwrap();

    // Di dalam workspace: boleh (walau file belum ada).
    assert!(st.ensure_writable(&dir.join("in").join("baru.txt")).is_ok());

    // Di luar: WorkspaceOutside.
    let luar = std::env::temp_dir().join("zephyr-t14-luar-tulis.txt");
    let e = st.ensure_writable(&luar).expect_err("harus ditolak");
    assert_eq!(e.code(), "WorkspaceOutside");

    // Trik `..` juga ditolak karena perbandingan pakai path kanonik.
    let trik = dir.join("in").join("..").join("..").join("kabur.txt");
    let e2 = st
        .ensure_writable(&trik)
        .expect_err("path .. harus ditolak");
    assert_eq!(e2.code(), "WorkspaceOutside");

    // Setelah user memilihnya di dialog (allow), file itu boleh ditulis.
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
    // Workspace lain supaya `dir` benar-benar di luar.
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
    // Permit kedua tidak boleh didapat selama yang pertama hidup.
    // `git_permit` menunggu sampai 90s, jadi cukup buktikan lewat semaphore:
    // drop dulu lalu ambil lagi harus sukses.
    drop(a);
    let b = st.git_permit().expect("permit setelah dilepas");
    drop(b);
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
