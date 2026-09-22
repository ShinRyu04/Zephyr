// devenv.rs — Dev Environment manager (T3.1).
//
// KENAPA fitur ini ada: webdev butuh PHP/Nginx/MySQL/Postgres/Redis untuk
// kerja lokal, dan alat seperti XAMPP/Laragon memaksa SATU versi per layanan.
// Di sini versi bisa dipilih dan diganti — karena setiap versi hidup di folder
// sendiri di `D:\DevEnv\`.
//
// TIGA ATURAN YANG DIJAGA MODUL INI:
//   1. TIDAK ADA PROSES YANG DI-SPAWN SAAT DETEKSI. Deteksi hanya membaca
//      folder; ini bisa dipanggil sesering apa pun tanpa efek samping.
//   2. Semua spawn lewat `proc::cmd` — tanpa jendela konsol yang berkedip.
//   3. Port yang sudah dipakai TIDAK PERNAH direbut. Kalau 3306 hidup,
//      pengguna diberi tahu, bukan dipaksa.

use std::path::{Path, PathBuf};
use std::process::Stdio;

use serde::{Deserialize, Serialize};

use crate::errors::{ZResult, ZephyrError};
use crate::proc;

/// Satu versi dari sebuah layanan (mis. PHP 8.3.33).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayananVersi {
    /// nama layanan: php | nginx | mariadb | redis
    pub layanan: String,
    /// versi yang terbaca dari nama folder, mis. "8.3.33"
    pub versi: String,
    /// path folder versi ini
    pub path: String,
    /// path executable utama (kosong kalau tidak ketemu)
    pub exe: String,
}

/// Layanan yang berjalan.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayananHidup {
    pub layanan: String,
    pub versi: String,
    pub pid: u32,
    pub port: u16,
    /// true kalau port benar-benar menjawab (bukan sekadar proses ada)
    pub siap: bool,
}

/// Root default DevEnv.
fn root_default() -> PathBuf {
    PathBuf::from("D:/DevEnv")
}

/// Baca daftar folder versi di dalam sebuah layanan.
///
/// Struktur yang didukung (dari cara ekstrak ZIP arsip):
///   php/8.3.33/php.exe            -> folder bernama versi
///   nginx/nginx-1.31.6/nginx.exe  -> folder berawalan nama layanan
///   redis/redis-server.exe        -> exe langsung di folder layanan
fn scan_layanan(akar: &Path, layanan: &str, exe_rel: &str) -> Vec<LayananVersi> {
    let dir = akar.join(layanan);
    let mut hasil = Vec::new();
    if !dir.is_dir() {
        return hasil;
    }

    // Kasus exe langsung di folder layanan (redis).
    let langsung = dir.join(exe_rel);
    if langsung.is_file() {
        hasil.push(LayananVersi {
            layanan: layanan.into(),
            versi: "bawaan".into(),
            path: dir.to_string_lossy().into_owned(),
            exe: langsung.to_string_lossy().into_owned(),
        });
        return hasil;
    }

    // Kasus exe di subfolder berversi.
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return hasil;
    };
    for e in entries.flatten() {
        let p = e.path();
        if !p.is_dir() {
            continue;
        }
        let exe = p.join(exe_rel);
        if !exe.is_file() {
            continue;
        }
        let nama_folder = e.file_name().to_string_lossy().into_owned();
        // Versi = bagian angka di nama folder. "nginx-1.31.6" -> "1.31.6",
        // "8.3.33" -> "8.3.33", "mariadb-11.4.4-winx64" -> "11.4.4".
        let versi = tebak_versi(&nama_folder, layanan);
        hasil.push(LayananVersi {
            layanan: layanan.into(),
            versi,
            path: p.to_string_lossy().into_owned(),
            exe: exe.to_string_lossy().into_owned(),
        });
    }
    hasil.sort_by(|a, b| b.versi.cmp(&a.versi));
    hasil
}

/// Ambil versi dari nama folder. Mengembalikan nama folder apa adanya kalau
/// tidak ada pola angka yang dikenali (lebih baik menampilkan sesuatu yang
/// benar daripada menebak salah).
fn tebak_versi(nama: &str, layanan: &str) -> String {
    let sisa = nama
        .strip_prefix(layanan)
        .map(|s| s.trim_start_matches(['-', '_', ' ']))
        .unwrap_or(nama);

    // Kumpulkan token yang berawalan angka.
    for tok in sisa.split(['-', '_', ' ']) {
        let bersih = tok.trim();
        if bersih.is_empty() {
            continue;
        }
        let c0 = bersih.chars().next().unwrap_or('x');
        if c0.is_ascii_digit() {
            // Buang sufiks non-angka/titik di belakang ("11.4.4-winx64" -> "11.4.4").
            let v: String = bersih
                .chars()
                .take_while(|c| c.is_ascii_digit() || *c == '.')
                .collect();
            let v = v.trim_end_matches('.');
            if !v.is_empty() {
                return v.to_string();
            }
        }
    }
    nama.to_string()
}

/// Deteksi semua layanan + versinya. TIDAK menyalakan apa pun.
#[tauri::command]
pub fn devenv_detect(root: Option<String>) -> ZResult<Vec<LayananVersi>> {
    let akar = root.map(PathBuf::from).unwrap_or_else(root_default);
    let mut hasil = Vec::new();
    hasil.extend(scan_layanan(&akar, "php", "php.exe"));
    hasil.extend(scan_layanan(&akar, "nginx", "nginx.exe"));
    hasil.extend(scan_layanan(&akar, "redis", "redis-server.exe"));
    hasil.extend(scan_layanan(&akar, "mariadb", "bin/mysqld.exe"));
    Ok(hasil)
}

/// Cek apakah sebuah port menjawab (TCP connect cepat).
///
/// Dipakai untuk membedakan "proses ada" dari "layanan benar-benar siap" —
/// mysqld butuh beberapa detik inisialisasi setelah prosesnya muncul.
fn port_hidup(port: u16) -> bool {
    use std::net::{Ipv4Addr, SocketAddrV4, TcpStream};
    use std::time::Duration;
    let addr = SocketAddrV4::new(Ipv4Addr::LOCALHOST, port);
    TcpStream::connect_timeout(&addr.into(), Duration::from_millis(300)).is_ok()
}

/// Port bawaan tiap layanan.
fn port_bawaan(layanan: &str) -> u16 {
    match layanan {
        "nginx" => 80,
        "mariadb" => 3306,
        "redis" => 6379,
        _ => 0,
    }
}

/// Nyalakan sebuah layanan dari folder versi tertentu.
///
/// KEAMANAN: menolak kalau port bawaannya sudah dipakai proses LAIN — merebut
/// port yang hidup akan mematikan layanan orang lain tanpa peringatan.
#[tauri::command]
pub fn devenv_start(layanan: String, path: String) -> ZResult<LayananHidup> {
    let dir = PathBuf::from(&path);
    if !dir.is_dir() {
        return Err(ZephyrError::NotFound(format!("folder tidak ada: {path}")));
    }

    let port = port_bawaan(&layanan);
    if port != 0 && port_hidup(port) {
        return Err(ZephyrError::InvalidInput(format!(
            "port {port} sudah dipakai proses lain — {layanan} tidak dinyalakan"
        )));
    }

    let versi = dir
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();

    // Perintah per layanan. Semua memakai proc::cmd (tanpa jendela konsol).
    let mut cmd = match layanan.as_str() {
        "php" => {
            // PHP-FPM tidak ada di build Windows; pakai built-in server yang
            // memang ditujukan untuk pengembangan.
            let mut c = proc::cmd(dir.join("php.exe"));
            c.arg("-S").arg("127.0.0.1:8000").current_dir(&dir);
            c
        }
        "nginx" => {
            let mut c = proc::cmd(dir.join("nginx.exe"));
            c.current_dir(&dir);
            c
        }
        "redis" => {
            let mut c = proc::cmd(dir.join("redis-server.exe"));
            c.current_dir(&dir);
            c
        }
        "mariadb" => {
            let mut c = proc::cmd(dir.join("bin").join("mysqld.exe"));
            // --console supaya log ke stdout (ditangkap), bukan ke file.
            c.arg("--console").current_dir(&dir);
            c
        }
        lain => {
            return Err(ZephyrError::InvalidInput(format!(
                "layanan tidak dikenal: {lain}"
            )))
        }
    };

    cmd.stdout(Stdio::null()).stderr(Stdio::null());
    let anak = cmd
        .spawn()
        .map_err(|e| ZephyrError::Io(format!("gagal menjalankan {layanan}: {e}")))?;
    let pid = anak.id();

    Ok(LayananHidup {
        layanan,
        versi,
        pid,
        port,
        // Siap BELUM tentu true: mysqld/nginx butuh waktu. UI memanggil
        // `devenv_status` untuk memantau sampai port benar-benar menjawab.
        siap: false,
    })
}

/// Status semua layanan: proses hidup + port menjawab.
#[tauri::command]
pub fn devenv_status() -> ZResult<Vec<LayananHidup>> {
    let mut hasil = Vec::new();
    for (layanan, port) in [
        ("nginx", 80u16),
        ("mariadb", 3306),
        ("redis", 6379),
        ("php", 8000),
    ] {
        if port_hidup(port) {
            hasil.push(LayananHidup {
                layanan: layanan.into(),
                versi: String::new(),
                pid: 0,
                port,
                siap: true,
            });
        }
    }
    Ok(hasil)
}

/// Matikan layanan berdasarkan port yang dipakai (cara paling andal: proses
/// yang memegang port itu memang layanan tersebut).
#[tauri::command]
pub fn devenv_stop(port: u16) -> ZResult<bool> {
    if !port_hidup(port) {
        return Ok(false);
    }
    // Cari PID pemegang port lewat netstat, lalu taskkill.
    // Alternatif (menyimpan pid saat start) tidak cukup: layanan bisa dinyalakan
    // dari sesi Zephyr sebelumnya.
    let out = proc::cmd("netstat")
        .arg("-ano")
        .output()
        .map_err(|e| ZephyrError::Io(format!("gagal membaca netstat: {e}")))?;
    let teks = String::from_utf8_lossy(&out.stdout);
    let pola = format!(":{port} ");
    let mut pid: Option<u32> = None;
    for baris in teks.lines() {
        if !baris.contains("LISTENING") || !baris.contains(&pola) {
            continue;
        }
        if let Some(p) = baris.split_whitespace().last() {
            if let Ok(v) = p.parse::<u32>() {
                pid = Some(v);
                break;
            }
        }
    }
    let Some(pid) = pid else {
        return Ok(false);
    };
    let _ = proc::cmd("taskkill")
        .arg("/PID")
        .arg(pid.to_string())
        .arg("/T")
        .arg("/F")
        .output();
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tebak_versi_pola_umum() {
        assert_eq!(tebak_versi("8.3.33", "php"), "8.3.33");
        assert_eq!(tebak_versi("nginx-1.31.6", "nginx"), "1.31.6");
        assert_eq!(tebak_versi("mariadb-11.4.4-winx64", "mariadb"), "11.4.4");
        assert_eq!(tebak_versi("redis", "redis"), "redis");
    }

    #[test]
    fn deteksi_tidak_menyalakan_apa_pun() {
        // Root yang tidak ada -> kosong, tanpa error.
        let r = devenv_detect(Some("D:/dev-env-tidak-ada-xyz".into())).unwrap();
        assert!(r.is_empty());
    }

    #[test]
    fn deteksi_devenv_nyata() {
        let r = devenv_detect(Some("D:/DevEnv".into())).unwrap();
        if r.is_empty() {
            // DevEnv belum diunduh di mesin ini — bukan kegagalan.
            return;
        }
        // Setiap entri harus punya exe yang benar-benar ada.
        for x in &r {
            assert!(
                Path::new(&x.exe).is_file(),
                "exe tidak ada: {} ({})",
                x.exe,
                x.layanan
            );
            assert!(!x.versi.is_empty(), "versi kosong untuk {}", x.layanan);
        }
        // Harus menemukan minimal PHP (yang jelas ada di DevEnv).
        assert!(
            r.iter().any(|x| x.layanan == "php"),
            "php tidak terdeteksi: {:?}",
            r.iter().map(|x| (&x.layanan, &x.versi)).collect::<Vec<_>>()
        );
    }

    #[test]
    fn port_mati_tidak_dianggap_hidup() {
        // Port 9 (discard) hampir pasti tidak ada yang listen.
        assert!(!port_hidup(9));
    }
}
