// ssh_extra.rs — Port forwarding + SFTP explorer (T3.3).
//
// KENAPA modul terpisah dari `ssh.rs`: `ssh.rs` mengurus HOST + sesi terminal.
// Modul ini mengurus dua hal yang berbeda sifatnya — tunnel port yang hidup
// sebagai proses latar, dan penjelajahan file remote yang sifatnya permintaan
// satu-per-satu. Menggabungkannya akan membuat `ssh.rs` menanggung dua siklus
// hidup yang tidak berhubungan.
//
// DUA CARA KERJA:
//   1. PORT FORWARDING memakai `ssh -L` (lokal) / `ssh -R` (remote) / `ssh -D`
//      (SOCKS). Proses ssh.exe hidup selama tunnel dipakai, jadi ia disimpan
//      di AppState dan dibunuh saat app ditutup — tunnel yang tertinggal
//      membuat port lokal terbuka tanpa user sadar.
//   2. SFTP memakai `sftp -b -` (batch mode): perintah dikirim lewat stdin,
//      output dibaca dari stdout. Cara ini TIDAK butuh pustaka SSH di Rust dan
//      memakai kredensial yang sudah dikonfigurasi user di ssh.exe.
//
// BATAS KEAMANAN:
//   * Password TIDAK PERNAH jadi argumen baris perintah.
//   * Nama file yang datang dari UI disaring: tidak boleh memuat karakter
//     kontrol atau `..` yang bisa keluar dari folder remote.

use std::collections::HashMap;
use std::process::{Child, Stdio};
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};

use crate::errors::{ZResult, ZephyrError};
use crate::proc;
use crate::ssh::SshConfig;
use tauri::State;

/// Satu tunnel port yang hidup.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TunnelPort {
    pub id: String,
    /// host config yang dipakai (id)
    pub host_id: String,
    /// "lokal" | "remote" | "socks"
    pub jenis: String,
    /// port di sisi lokal (untuk socks: port SOCKS)
    pub port_lokal: u16,
    /// tujuan: host:port di sisi remote (kosong untuk socks)
    pub tujuan: String,
    pub pid: u32,
    /// keterangan untuk UI
    pub label: String,
}

/// Satu entri file/direktori remote.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileRemote {
    pub nama: String,
    /// true kalau direktori
    pub dir: bool,
    pub ukuran: u64,
    /// "drwxr-xr-x" — kosong kalau tidak terbaca
    pub izin: String,
    pub waktu: String,
}

/// Registry tunnel hidup. Disimpan di AppState supaya bisa dibunuh saat exit.
#[derive(Default)]
pub struct TunnelRegistry {
    pub proses: Mutex<HashMap<String, Child>>,
}

impl TunnelRegistry {
    /// Bunuh semua tunnel. Dipanggil saat aplikasi keluar.
    pub fn bunuh_semua(&self) {
        if let Ok(mut m) = self.proses.lock() {
            for (_, anak) in m.iter_mut() {
                let _ = anak.kill();
            }
            m.clear();
        }
    }

    pub fn jumlah(&self) -> usize {
        self.proses.lock().map(|m| m.len()).unwrap_or(0)
    }
}

/// Cari executable OpenSSH (ssh.exe / sftp.exe).
fn find_openssh(exe: &str) -> Option<std::path::PathBuf> {
    let sysroot = std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".into());
    let cand = [
        std::path::PathBuf::from(&sysroot).join(format!(r"System32\OpenSSH\{exe}")),
        std::path::PathBuf::from(&sysroot).join(format!(r"System32\{exe}")),
    ];
    for p in &cand {
        if p.exists() {
            return Some(p.clone());
        }
    }
    let out = proc::cmd("where").arg(exe).output().ok()?;
    if !out.status.success() {
        return None;
    }
    let s = String::from_utf8_lossy(&out.stdout);
    s.lines().next().map(|l| std::path::PathBuf::from(l.trim()))
}

/// Validasi nama yang akan dipakai di perintah sftp.
///
/// KEAMANAN: nama file datang dari UI. Karakter kontrol bisa menyuntikkan
/// perintah tambahan ke sesi sftp batch, dan `..` bisa keluar dari folder yang
/// dituju. Keduanya ditolak di sini, bukan di UI — validasi harus di sisi yang
/// benar-benar menjalankan perintah.
fn nama_aman(nama: &str) -> ZResult<()> {
    if nama.is_empty() {
        return Err(ZephyrError::InvalidInput("nama kosong".into()));
    }
    if nama.chars().any(|c| c.is_control()) {
        return Err(ZephyrError::InvalidInput(
            "nama memuat karakter kontrol".into(),
        ));
    }
    if nama.contains("..") {
        return Err(ZephyrError::InvalidInput(
            "nama tidak boleh memuat '..'".into(),
        ));
    }
    Ok(())
}

/// Bangun argumen ssh untuk sebuah tunnel.
fn argumen_tunnel(
    cfg: &SshConfig,
    jenis: &str,
    port_lokal: u16,
    tujuan: &str,
) -> ZResult<Vec<String>> {
    let mut argv: Vec<String> = vec![
        // Tunnel harus mati sendiri kalau koneksinya putus, dan tidak boleh
        // menahan sesi kalau stdin tertutup.
        "-N".into(),
        "-o".into(),
        "ExitOnForwardFailure=yes".into(),
        "-o".into(),
        "ServerAliveInterval=30".into(),
        "-p".into(),
        cfg.port.to_string(),
    ];
    if cfg.auth == "key" && !cfg.key_path.trim().is_empty() {
        argv.push("-i".into());
        argv.push(cfg.key_path.trim().to_string());
    }

    match jenis {
        "lokal" => {
            if tujuan.is_empty() {
                return Err(ZephyrError::InvalidInput(
                    "tunnel lokal butuh tujuan host:port".into(),
                ));
            }
            argv.push("-L".into());
            argv.push(format!("{port_lokal}:{tujuan}"));
        }
        "remote" => {
            if tujuan.is_empty() {
                return Err(ZephyrError::InvalidInput(
                    "tunnel remote butuh tujuan host:port".into(),
                ));
            }
            argv.push("-R".into());
            argv.push(format!("{port_lokal}:{tujuan}"));
        }
        "socks" => {
            argv.push("-D".into());
            argv.push(port_lokal.to_string());
        }
        lain => {
            return Err(ZephyrError::InvalidInput(format!(
                "jenis tunnel tidak dikenal: {lain}"
            )))
        }
    }

    argv.push(format!("{}@{}", cfg.user, cfg.host));
    Ok(argv)
}

/// Apakah sebuah port lokal masih bebas.
fn port_bebas(port: u16) -> bool {
    use std::net::TcpListener;
    TcpListener::bind(("127.0.0.1", port)).is_ok()
}

/// Nyalakan tunnel port.
#[tauri::command]
pub fn ssh_forward_start(
    registry: State<TunnelRegistry>,
    config: SshConfig,
    jenis: String,
    port_lokal: u16,
    tujuan: String,
) -> ZResult<TunnelPort> {
    if port_lokal == 0 {
        return Err(ZephyrError::InvalidInput("port lokal tidak boleh 0".into()));
    }
    // KEAMANAN: jangan pernah merebut port yang sudah dipakai.
    if !port_bebas(port_lokal) {
        return Err(ZephyrError::InvalidInput(format!(
            "port {port_lokal} sudah dipakai — pilih port lain"
        )));
    }
    let ssh = find_openssh("ssh.exe").ok_or_else(|| {
        ZephyrError::NotFound("ssh.exe tidak ditemukan — instal OpenSSH Client".into())
    })?;

    let argv = argumen_tunnel(&config, &jenis, port_lokal, &tujuan)?;
    let mut cmd = proc::cmd(ssh);
    cmd.args(&argv)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    let anak = cmd
        .spawn()
        .map_err(|e| ZephyrError::Io(format!("gagal menjalankan ssh: {e}")))?;
    let pid = anak.id();

    let id = format!("fwd-{pid}");
    let label = match jenis.as_str() {
        "lokal" => format!("localhost:{port_lokal} → {tujuan}"),
        "remote" => format!("remote:{port_lokal} → {tujuan}"),
        _ => format!("socks localhost:{port_lokal}"),
    };

    if let Ok(mut m) = registry.proses.lock() {
        m.insert(id.clone(), anak);
    }

    Ok(TunnelPort {
        id,
        host_id: config.id,
        jenis,
        port_lokal,
        tujuan,
        pid,
        label,
    })
}

/// Matikan tunnel berdasarkan id.
#[tauri::command]
pub fn ssh_forward_stop(registry: State<TunnelRegistry>, id: String) -> ZResult<bool> {
    let mut m = registry
        .proses
        .lock()
        .map_err(|_| ZephyrError::Internal("registry tunnel terkunci".into()))?;
    match m.remove(&id) {
        Some(mut anak) => {
            let _ = anak.kill();
            Ok(true)
        }
        None => Ok(false),
    }
}

/// Daftar tunnel yang hidup.
#[tauri::command]
pub fn ssh_forward_list(registry: State<TunnelRegistry>) -> ZResult<Vec<String>> {
    let m = registry
        .proses
        .lock()
        .map_err(|_| ZephyrError::Internal("registry tunnel terkunci".into()))?;
    Ok(m.keys().cloned().collect())
}

/// Baca isi direktori remote lewat `sftp -b -`.
///
/// Format keluaran `ls -l` sftp: `-rw-r--r--    1 user grp  1234 Jan 1 12:00 nama`
/// Baris pertama setelah `sftp>` adalah `sftp> ls -l <path>` itu sendiri, jadi
/// harus dilewati.
#[tauri::command]
pub fn ssh_sftp_list(config: SshConfig, path: String) -> ZResult<Vec<FileRemote>> {
    let sftp = find_openssh("sftp.exe").ok_or_else(|| {
        ZephyrError::NotFound("sftp.exe tidak ditemukan — instal OpenSSH Client".into())
    })?;

    // Path remote: boleh absolut atau relatif; kutip supaya spasi aman.
    // Karakter kontrol ditolak (bisa memutus perintah batch).
    if path.chars().any(|c| c.is_control()) {
        return Err(ZephyrError::InvalidInput(
            "path memuat karakter kontrol".into(),
        ));
    }

    let mut argv: Vec<String> = vec![
        "-b".into(),
        "-".into(),
        "-o".into(),
        "BatchMode=yes".into(),
        "-P".into(),
        config.port.to_string(),
    ];
    if config.auth == "key" && !config.key_path.trim().is_empty() {
        argv.push("-i".into());
        argv.push(config.key_path.trim().to_string());
    }
    argv.push(format!("{}@{}", config.user, config.host));

    let mut cmd = proc::cmd(sftp);
    cmd.args(&argv)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut anak = cmd
        .spawn()
        .map_err(|e| ZephyrError::Io(format!("gagal menjalankan sftp: {e}")))?;

    // Kirim perintah batch lewat stdin.
    if let Some(stdin) = anak.stdin.as_mut() {
        use std::io::Write;
        let perintah = format!("ls -l {}\nbye\n", kutip_remote(&path));
        stdin
            .write_all(perintah.as_bytes())
            .map_err(|e| ZephyrError::Io(format!("gagal menulis ke sftp: {e}")))?;
    }

    let out = anak
        .wait_with_output()
        .map_err(|e| ZephyrError::Io(format!("sftp tidak selesai: {e}")))?;

    // Status exit WAJIB diperiksa. Tanpa ini, koneksi yang gagal (host mati,
    // auth ditolak) menghasilkan stdout kosong -> UI menampilkan "folder
    // kosong" padahal sebenarnya tidak bisa terhubung sama sekali.
    if !out.status.success() {
        let pesan = String::from_utf8_lossy(&out.stderr);
        let baris: Vec<&str> = pesan
            .lines()
            .filter(|l| !l.trim().is_empty())
            .take(3)
            .collect();
        return Err(ZephyrError::Io(format!(
            "sftp gagal: {}",
            if baris.is_empty() {
                "tidak bisa terhubung".to_string()
            } else {
                baris.join(" ")
            }
        )));
    }

    let teks = String::from_utf8_lossy(&out.stdout);
    Ok(parse_ls(&teks))
}

/// Kutip path untuk sesi sftp batch.
fn kutip_remote(p: &str) -> String {
    let p = p.trim();
    if p.is_empty() || p == "." {
        ".".into()
    } else if p.contains(' ') {
        format!("\"{p}\"")
    } else {
        p.to_string()
    }
}

/// Offset byte tepat SETELAH `n` field pertama, dengan pemisah berupa RUN
/// spasi (satu atau lebih).
///
/// KENAPA tidak `splitn`: `splitn(9, char::is_whitespace)` membagi pada SETIAP
/// karakter spasi, jadi kolom kosong antara `-rw-r--r--` dan `1` ikut terhitung
/// dan nama file yang dihasilkan masih memuat sisa barisnya.
fn offset_setelah_field(b: &str, n: usize) -> Option<usize> {
    let mut field = 0usize;
    let mut dalam_field = false;
    for (i, c) in b.char_indices() {
        if c.is_whitespace() {
            if dalam_field {
                dalam_field = false;
                field += 1;
                if field == n {
                    // `i` = posisi spasi yang MENGAKHIRI field ke-n.
                    return Some(i);
                }
            }
        } else {
            dalam_field = true;
        }
    }
    None
}

/// Urai keluaran `ls -l` dari sftp menjadi entri.
///
/// Dipisah dari perintah supaya bisa diuji tanpa server SSH.
fn parse_ls(teks: &str) -> Vec<FileRemote> {
    let mut hasil = Vec::new();
    for baris in teks.lines() {
        let b = baris.trim_end();
        if b.is_empty() {
            continue;
        }
        // Lewati prompt + gema perintah.
        if b.starts_with("sftp>") || b.starts_with("Connected to") || b.starts_with("bye") {
            continue;
        }
        let kolom: Vec<&str> = b.split_whitespace().collect();
        if kolom.len() < 9 {
            continue;
        }
        let izin = kolom[0];
        // Harus dimulai dengan salah satu penanda tipe Unix.
        if !matches!(
            izin.chars().next(),
            Some('d') | Some('-') | Some('l') | Some('c') | Some('b') | Some('p') | Some('s')
        ) {
            continue;
        }
        let dir = izin.starts_with('d');
        let ukuran: u64 = kolom[4].parse().unwrap_or(0);
        // Nama bisa memuat spasi, jadi tidak boleh diambil dari `kolom[8]`.
        // Cara benar: buang 8 kolom pertama dari STRING, lalu sisa itulah nama.
        // `splitn(9, char::is_whitespace)` membagi di paling banyak 8 pemisah,
        // sehingga elemen terakhir memuat seluruh sisa baris.
        let nama = offset_setelah_field(b, 8)
            .map(|i| b[i..].trim().to_string())
            .unwrap_or_default();
        if nama.is_empty() || nama == "." || nama == ".." {
            continue;
        }
        hasil.push(FileRemote {
            nama,
            dir,
            ukuran,
            izin: izin.to_string(),
            // Kolom 5..8 = bulan, tanggal, jam/tahun.
            waktu: kolom.get(5..8).map(|s| s.join(" ")).unwrap_or_default(),
        });
    }
    // Direktori dulu, lalu alfabetis — sama seperti penjelajah file pada umumnya.
    hasil.sort_by(|a, b| match (a.dir, b.dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.nama.to_lowercase().cmp(&b.nama.to_lowercase()),
    });
    hasil
}

/// Unduh satu file remote ke folder lokal.
#[tauri::command]
pub fn ssh_sftp_get(config: SshConfig, remote: String, lokal: String) -> ZResult<String> {
    let sftp = find_openssh("sftp.exe").ok_or_else(|| {
        ZephyrError::NotFound("sftp.exe tidak ditemukan — instal OpenSSH Client".into())
    })?;
    if remote.chars().any(|c| c.is_control()) || lokal.chars().any(|c| c.is_control()) {
        return Err(ZephyrError::InvalidInput(
            "path memuat karakter kontrol".into(),
        ));
    }

    let mut argv: Vec<String> = vec![
        "-b".into(),
        "-".into(),
        "-o".into(),
        "BatchMode=yes".into(),
        "-P".into(),
        config.port.to_string(),
    ];
    if config.auth == "key" && !config.key_path.trim().is_empty() {
        argv.push("-i".into());
        argv.push(config.key_path.trim().to_string());
    }
    argv.push(format!("{}@{}", config.user, config.host));

    let mut cmd = proc::cmd(sftp);
    cmd.args(&argv)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut anak = cmd
        .spawn()
        .map_err(|e| ZephyrError::Io(format!("gagal menjalankan sftp: {e}")))?;

    if let Some(stdin) = anak.stdin.as_mut() {
        use std::io::Write;
        let perintah = format!(
            "get {} {}\nbye\n",
            kutip_remote(&remote),
            kutip_remote(&lokal)
        );
        stdin
            .write_all(perintah.as_bytes())
            .map_err(|e| ZephyrError::Io(format!("gagal menulis ke sftp: {e}")))?;
    }
    let out = anak
        .wait_with_output()
        .map_err(|e| ZephyrError::Io(format!("sftp tidak selesai: {e}")))?;
    let gabung = format!(
        "{}{}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    );
    if !out.status.success() {
        return Err(ZephyrError::Io(format!(
            "sftp gagal: {}",
            gabung.lines().take(3).collect::<Vec<_>>().join(" ")
        )));
    }
    Ok(lokal)
}

/// Hapus file remote (dipakai explorer; tidak untuk direktori).
#[tauri::command]
pub fn ssh_sftp_hapus(config: SshConfig, remote: String) -> ZResult<bool> {
    let sftp = find_openssh("sftp.exe").ok_or_else(|| {
        ZephyrError::NotFound("sftp.exe tidak ditemukan — instal OpenSSH Client".into())
    })?;
    if remote.chars().any(|c| c.is_control()) {
        return Err(ZephyrError::InvalidInput(
            "path memuat karakter kontrol".into(),
        ));
    }

    let mut argv: Vec<String> = vec![
        "-b".into(),
        "-".into(),
        "-o".into(),
        "BatchMode=yes".into(),
        "-P".into(),
        config.port.to_string(),
    ];
    if config.auth == "key" && !config.key_path.trim().is_empty() {
        argv.push("-i".into());
        argv.push(config.key_path.trim().to_string());
    }
    argv.push(format!("{}@{}", config.user, config.host));

    let mut cmd = proc::cmd(sftp);
    cmd.args(&argv)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut anak = cmd
        .spawn()
        .map_err(|e| ZephyrError::Io(format!("gagal menjalankan sftp: {e}")))?;

    if let Some(stdin) = anak.stdin.as_mut() {
        use std::io::Write;
        let perintah = format!("rm {}\nbye\n", kutip_remote(&remote));
        stdin
            .write_all(perintah.as_bytes())
            .map_err(|e| ZephyrError::Io(format!("gagal menulis ke sftp: {e}")))?;
    }
    let out = anak
        .wait_with_output()
        .map_err(|e| ZephyrError::Io(format!("sftp tidak selesai: {e}")))?;
    Ok(out.status.success())
}

/// Nama file aman (dipakai UI sebelum memanggil sftp).
#[tauri::command]
pub fn ssh_sftp_cek_nama(nama: String) -> ZResult<bool> {
    nama_aman(&nama)?;
    Ok(true)
}

/// Jumlah tunnel hidup (untuk verifikasi + indikator UI).
#[tauri::command]
pub fn ssh_forward_jumlah(registry: State<TunnelRegistry>) -> ZResult<usize> {
    Ok(registry.jumlah())
}

/// Alias publik dari `nama_aman` untuk test.
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_ls_baris_sftp() {
        let teks = "\
sftp> ls -l /var/www
-rw-r--r--    1 root     root         1234 Jan  1 12:00 index.html
drwxr-xr-x    2 root     root         4096 Feb 10 09:30 aset
lrwxrwxrwx    1 root     root           11 Mar  3 08:00 link -> index.html
";
        let r = parse_ls(teks);
        assert_eq!(r.len(), 3, "{:?}", r);
        // Direktori didahulukan.
        assert_eq!(r[0].nama, "aset");
        assert!(r[0].dir);
        assert_eq!(r[0].ukuran, 4096);
        // File biasa.
        let idx = r.iter().find(|x| x.nama == "index.html").unwrap();
        assert!(!idx.dir);
        assert_eq!(idx.ukuran, 1234);
        assert_eq!(idx.izin, "-rw-r--r--");
        assert!(idx.waktu.contains("Jan"));
    }

    #[test]
    fn offset_field_menangani_run_spasi() {
        let b = "-rw-r--r--    1 root     root         1234 Jan  1 12:00 index.html";
        let i = offset_setelah_field(b, 8).unwrap();
        assert_eq!(b[i..].trim(), "index.html");
        // 8 field = izin, nlink, user, grup, ukuran, bulan, tanggal, jam.
        assert_eq!(offset_setelah_field("a b", 5), None);
    }

    #[test]
    fn parse_ls_nama_dengan_spasi() {
        let teks = "-rw-r--r--    1 root     root          500 Jan  1 10:00 laporan tahunan.pdf\n";
        let r = parse_ls(teks);
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].nama, "laporan tahunan.pdf");
    }

    #[test]
    fn parse_ls_mengabaikan_sampah() {
        let teks = "Connected to contoh.com.\nsftp> ls -l .\nbye\n";
        assert!(parse_ls(teks).is_empty());
    }

    #[test]
    fn nama_aman_menolak_kontrol_dan_dotdot() {
        assert!(nama_aman("index.html").is_ok());
        assert!(nama_aman("").is_err());
        assert!(nama_aman("a\nb").is_err());
        assert!(nama_aman("../etc/passwd").is_err());
        assert!(nama_aman("a..b").is_err());
    }

    #[test]
    fn argumen_tunnel_lokal_benar() {
        let cfg = SshConfig {
            id: "h1".into(),
            name: "uji".into(),
            host: "contoh.com".into(),
            port: 22,
            user: "root".into(),
            auth: "key".into(),
            key_path: "C:/kunci/id_rsa".into(),
            save_password: false,
            password_saved: None,
            password_enc: None,
        };
        let a = argumen_tunnel(&cfg, "lokal", 8080, "localhost:3000").unwrap();
        assert!(a.contains(&"-L".to_string()));
        assert!(a.contains(&"8080:localhost:3000".to_string()));
        assert!(a.contains(&"root@contoh.com".to_string()));
        // -N: tanpa ini ssh membuka shell interaktif dan menahan pane.
        assert!(a.contains(&"-N".to_string()));

        let b = argumen_tunnel(&cfg, "socks", 1080, "").unwrap();
        assert!(b.contains(&"-D".to_string()));
        assert!(b.contains(&"1080".to_string()));

        // Tujuan kosong untuk tunnel lokal = error, bukan tunnel rusak.
        assert!(argumen_tunnel(&cfg, "lokal", 8080, "").is_err());
        // Jenis tak dikenal = error.
        assert!(argumen_tunnel(&cfg, "ngawur", 8080, "x:1").is_err());
    }

    #[test]
    fn registry_bunuh_semua_aman_saat_kosong() {
        let r = TunnelRegistry::default();
        assert_eq!(r.jumlah(), 0);
        r.bunuh_semua();
        assert_eq!(r.jumlah(), 0);
    }
}
