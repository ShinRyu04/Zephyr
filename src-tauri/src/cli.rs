// cli.rs — parser argumen `zephyr` + single instance (fase 28).
//
// KEPUTUSAN ARSITEKTUR
//
// 1. Parser DITULIS SENDIRI, bukan clap. Alasannya bukan "clap jelek":
//    sintaks `zephyr file.ts:10:5` bukan bentuk yang dikenal clap (positional
//    dengan makna internal), dan brief menuntut stdout SENYAP untuk pemanggilan
//    normal — sedangkan clap punya opini sendiri soal --help/--version dan
//    exit code. Menulis 200 baris parser jauh lebih murah daripada melawan
//    default clap di tiga tempat. Semua bentuk argumen dikunci uji unit.
//
// 2. Banner HANYA di --help/--version, dan HANYA saat stdout adalah TTY.
//    `zephyr --version | grep` harus bersih (brief BRANDING CLI), jadi
//    pewarnaan ANSI + ASCII art dimatikan begitu output di-pipe.
//
// 3. `--wait` diselesaikan di sisi APP, bukan CLI: proses CLI menunggu file
//    penanda dihapus oleh app saat tab ditutup. Alternatifnya (CLI menahan
//    socket) berarti membuat IPC jaringan — dilarang brief ("lokal saja").
//
// Doc yang dipakai: context7 /tauri-apps/plugins-workspace (single-instance:
// `tauri_plugin_single_instance::init(|app, argv, cwd| ...)`, dan catatan
// bahwa plugin harus didaftarkan PERTAMA).

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::errors::{ZResult, ZephyrError};

/// Warna aksen Zephyr (#4f8cff) sebagai ANSI truecolor.
const ACCENT: &str = "\x1b[38;2;79;140;255m";
const DIM: &str = "\x1b[2m";
const RESET: &str = "\x1b[0m";

/// Satu target yang diminta dari command line.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Target {
    /// buka folder sebagai workspace
    Folder(String),
    /// buka file, opsional kursor ke baris/kolom
    File {
        path: String,
        line: Option<u32>,
        col: Option<u32>,
    },
    /// buka DiffViewer A vs B
    Diff { kiri: String, kanan: String },
}

/// Hasil parse argumen.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Args {
    pub targets: Vec<Target>,
    /// -n: paksa jendela baru (multi-instance eksplisit)
    pub new_window: bool,
    /// --wait: blok sampai file ditutup
    pub wait: bool,
    /// token penanda `--wait` (dibuat shim CLI, dipakai app untuk melepas)
    #[serde(default)]
    pub wait_token: Option<String>,
    pub help: bool,
    pub version: bool,
    /// argumen yang tidak dikenal — dilaporkan, bukan didiamkan
    pub errors: Vec<String>,
    /// true = tidak ada target & tidak ada flag → buka workspace terakhir
    pub kosong: bool,
}

/// Pisahkan `path:line:col` menjadi bagiannya.
///
/// JEBAKAN WINDOWS: `D:\a\b.ts` juga memuat titik dua. Karena itu segmen
/// diambil dari BELAKANG dan hanya diakui sebagai posisi kalau seluruhnya
/// angka — tanpa aturan itu, `D:\a.ts` terpecah menjadi path `D` + sisanya.
pub fn pisah_posisi(s: &str) -> (String, Option<u32>, Option<u32>) {
    let angka = |x: &str| -> Option<u32> {
        if x.is_empty() || !x.chars().all(|c| c.is_ascii_digit()) {
            None
        } else {
            x.parse().ok()
        }
    };

    // Coba bentuk path:line:col — dua segmen terakhir harus angka.
    if let Some((sisa, terakhir)) = s.rsplit_once(':') {
        if let Some(n2) = angka(terakhir) {
            if let Some((awal, tengah)) = sisa.rsplit_once(':') {
                if let Some(n1) = angka(tengah) {
                    // path:line:col
                    return (awal.to_string(), Some(n1), Some(n2));
                }
            }
            // path:line (segmen sebelum bukan angka, mis. "D:\a.ts:10")
            return (sisa.to_string(), Some(n2), None);
        }
    }
    (s.to_string(), None, None)
}

/// Ekspansi `~` dan `%VAR%` (brief: path Windows harus keduanya).
pub fn ekspansi_path(s: &str) -> String {
    let mut out = s.to_string();

    // ~ hanya di AWAL — "a~b" adalah nama file yang sah.
    if out == "~" || out.starts_with("~/") || out.starts_with("~\\") {
        if let Some(home) = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")) {
            let h = home.to_string_lossy().to_string();
            out = if out.len() == 1 {
                h
            } else {
                format!("{h}{}", &out[1..])
            };
        }
    }

    // %VAR% gaya cmd.exe.
    while let Some(i) = out.find('%') {
        let Some(j) = out[i + 1..].find('%') else {
            break;
        };
        let nama = &out[i + 1..i + 1 + j];
        if nama.is_empty() {
            break;
        }
        let nilai = std::env::var(nama).unwrap_or_default();
        out = format!("{}{}{}", &out[..i], nilai, &out[i + 1 + j + 1..]);
    }

    out
}

/// Jadikan path absolut relatif terhadap cwd yang dikirim CLI.
pub fn absolutkan(p: &str, cwd: &Path) -> String {
    let pb = PathBuf::from(p);
    if pb.is_absolute() {
        // Normalisasi pemisah: brief minta backslash & forward slash sama-sama
        // diterima, dan sisa app memakai '/'.
        return pb.to_string_lossy().replace('\\', "/");
    }
    // "." dan ".." diselesaikan di sini, bukan diserahkan ke frontend.
    let gabung = cwd.join(pb);
    let bersih = bersihkan_titik(&gabung);
    bersih.to_string_lossy().replace('\\', "/")
}

/// Buang segmen "." dan selesaikan ".." tanpa menyentuh disk.
///
/// `std::fs::canonicalize` TIDAK dipakai: ia gagal untuk path yang belum ada
/// (mis. `zephyr file-baru.txt`) dan menambah prefix `\\?\` di Windows.
fn bersihkan_titik(p: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for komp in p.components() {
        match komp {
            std::path::Component::CurDir => {}
            std::path::Component::ParentDir => {
                out.pop();
            }
            lain => out.push(lain.as_os_str()),
        }
    }
    out
}

/// Parse argv (TANPA argv[0]) menjadi `Args`.
pub fn parse(argv: &[String], cwd: &Path) -> Args {
    let mut a = Args::default();
    let mut i = 0;
    let mut positional: Vec<String> = Vec::new();

    while i < argv.len() {
        let arg = argv[i].as_str();
        match arg {
            "--help" | "-h" | "/?" => a.help = true,
            "--version" | "-v" | "-V" => a.version = true,
            "-n" | "--new-window" => a.new_window = true,
            "--wait" | "-w" => a.wait = true,
            // Token penanda --wait: DIISI OLEH SHIM, bukan user. Shim membuat
            // file penanda lalu memberi tahu app token-nya, supaya app tahu
            // penanda mana yang harus dihapus saat tab ditutup.
            "--wait-token" => {
                if i + 1 < argv.len() {
                    a.wait_token = Some(argv[i + 1].clone());
                    i += 1;
                } else {
                    a.errors.push("--wait-token butuh satu nilai".into());
                }
            }
            "--diff" | "-d" => {
                // --diff butuh TEPAT dua path. Kurang dari itu = error yang
                // dilaporkan, bukan diff kosong yang membingungkan.
                //
                // Syaratnya: DUA elemen setelah flag harus ada, yaitu
                // argv.len() >= i + 3. Versi `i + 2 < argv.len()` yang sempat
                // dipakai menolak `--diff a b` (len 3) karena 2 < 3 benar tapi
                // indeksnya sudah mentok — uji `diff_butuh_dua_path` yang
                // menangkapnya.
                if argv.len() >= i + 3 {
                    let kiri = absolutkan(&ekspansi_path(&argv[i + 1]), cwd);
                    let kanan = absolutkan(&ekspansi_path(&argv[i + 2]), cwd);
                    a.targets.push(Target::Diff { kiri, kanan });
                    i += 2;
                } else {
                    a.errors.push("--diff butuh dua path: --diff A B".into());
                    // Argumen sisa DIMAKAN, bukan dibiarkan jatuh ke positional:
                    // `zephyr --diff a.ts` yang salah tidak boleh diam-diam
                    // berubah jadi "buka a.ts" — user memintanya sebagai diff.
                    i = argv.len();
                }
            }
            lain if lain.starts_with('-') && lain.len() > 1 => {
                a.errors.push(format!("opsi tidak dikenal: {lain}"));
            }
            lain => positional.push(lain.to_string()),
        }
        i += 1;
    }

    for p in positional {
        let (raw, line, col) = pisah_posisi(&p);
        let ekspansi = ekspansi_path(&raw);
        let abs = absolutkan(&ekspansi, cwd);
        // Folder vs file ditentukan dari DISK bila ada; kalau belum ada,
        // "." dan path berakhiran pemisah dianggap folder.
        let pb = PathBuf::from(&abs);
        let folder =
            pb.is_dir() || raw == "." || raw == ".." || raw.ends_with('/') || raw.ends_with('\\');
        if folder && line.is_none() {
            a.targets.push(Target::Folder(abs));
        } else {
            a.targets.push(Target::File {
                path: abs,
                line,
                col,
            });
        }
    }

    a.kosong = a.targets.is_empty() && !a.help && !a.version && a.errors.is_empty();
    a
}

/// Folder penanda `--wait`.
///
/// Dipakai bersama oleh proses CLI (yang menunggu) dan app (yang menghapus).
/// %TEMP% dipilih karena keduanya bisa menulis ke sana tanpa izin khusus dan
/// isinya dibersihkan OS bila proses mati mendadak.
pub fn dir_penanda_wait() -> PathBuf {
    std::env::temp_dir().join("zephyr-wait")
}

/// Path penanda untuk satu sesi `--wait`.
pub fn path_penanda_wait(token: &str) -> PathBuf {
    // Token dibersihkan: ia berasal dari argumen luar dan tidak boleh
    // menjelajah folder lain (`../`).
    let bersih: String = token
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .take(64)
        .collect();
    dir_penanda_wait().join(format!("{bersih}.wait"))
}

// ───────────────────────── command Tauri (fase 28) ─────────────────────────
//
// Command tinggal DI MODUL INI, bukan di lib.rs: `generate_handler!` mengimpor
// nama command ke modul tempat ia dipanggil, jadi command yang didefinisikan
// di lib.rs bertabrakan dengan dirinya sendiri (E0255 "defined multiple times").

/// Argumen CLI yang dipakai instance PERTAMA saat start.
///
/// Dibaca lewat command (bukan event) karena frontend perlu memintanya saat
/// bootstrap: event `cli-args` hanya dikirim oleh instance KEDUA, dan yang
/// pertama tidak punya pengirim.
#[tauri::command(async)]
pub fn cli_args_awal() -> Args {
    let argv: Vec<String> = std::env::args().skip(1).collect();
    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    parse(&argv, &cwd)
}

/// Selesaikan `--wait`: hapus file penanda supaya proses CLI berhenti menunggu.
///
/// Penanda file dipakai, BUKAN socket: brief melarang IPC berjaringan
/// ("lokal saja"), dan file di %TEMP% adalah cara paling sederhana yang
/// bekerja lintas proses tanpa membuka port.
#[tauri::command(async)]
pub fn cli_wait_selesai(token: String) -> ZResult<bool> {
    let p = path_penanda_wait(&token);
    if p.exists() {
        std::fs::remove_file(&p)
            .map_err(|e| ZephyrError::Io(format!("gagal menghapus penanda wait: {e}")))?;
        return Ok(true);
    }
    Ok(false)
}

/// Buat penanda `--wait` (dipakai shim CLI dan harness).
#[tauri::command(async)]
pub fn cli_wait_buat(token: String) -> ZResult<String> {
    let dir = dir_penanda_wait();
    std::fs::create_dir_all(&dir)
        .map_err(|e| ZephyrError::Io(format!("gagal membuat folder wait: {e}")))?;
    let p = path_penanda_wait(&token);
    std::fs::write(&p, b"1").map_err(|e| ZephyrError::Io(format!("gagal menulis penanda: {e}")))?;
    Ok(p.to_string_lossy().replace('\\', "/"))
}

/// Apakah penanda `--wait` masih ada (true = proses CLI masih menunggu).
#[tauri::command(async)]
pub fn cli_wait_aktif(token: String) -> bool {
    path_penanda_wait(&token).exists()
}

/// Teks --help / --version untuk dipakai uji & panel About.
#[tauri::command(async)]
pub fn cli_teks(mode: String, warna: bool, kolom: Option<usize>) -> ZResult<String> {
    let k = kolom.unwrap_or(100);
    Ok(match mode.as_str() {
        "help" => teks_help(warna, k),
        "version" => teks_version(warna, k),
        "banner" => banner(warna, k),
        lain => {
            return Err(ZephyrError::InvalidInput(format!(
                "mode teks CLI \"{lain}\" tidak dikenal (help|version|banner)"
            )))
        }
    })
}

/// Parse argv apa adanya — dipakai harness verify28 supaya parser diuji lewat
/// JALUR PRODUK, bukan disalin ulang di JS.
#[tauri::command(async)]
pub fn cli_parse(argv: Vec<String>, cwd: String) -> Args {
    parse(&argv, Path::new(&cwd))
}

// ───────────── mode konsol: --help / --version (fase 28) ─────────────

/// Windows FFI mentah — TANPA crate `windows`.
///
/// Hanya tiga fungsi kernel32 yang dibutuhkan, dan menambah dependensi
/// sebesar crate `windows` untuk itu tidak sepadan (waktu kompilasi naik
/// menit-menitan untuk 3 simbol).
///
/// CATATAN KEAMANAN: `AttachConsole` di sini AMAN. Yang pernah mematikan
/// proses Zephyr sendiri adalah `GenerateConsoleCtrlEvent` (fase 05) — ia
/// mengirim Ctrl+C ke SELURUH grup konsol termasuk diri sendiri. Attach saja
/// tidak mengirim sinyal apa pun.
#[cfg(windows)]
mod win {
    #[link(name = "kernel32")]
    extern "system" {
        pub fn AttachConsole(dw_process_id: u32) -> i32;
        pub fn GetStdHandle(n_std_handle: u32) -> isize;
        pub fn GetFileType(h_file: isize) -> u32;
    }
    pub const ATTACH_PARENT_PROCESS: u32 = 0xFFFF_FFFF;
    pub const STD_OUTPUT_HANDLE: u32 = 0xFFFF_FFF5; // -11
    pub const FILE_TYPE_CHAR: u32 = 0x0002;
}

/// Apakah stdout menuju konsol (bukan pipe/file)?
///
/// Ini yang menentukan warna & ASCII art: brief menuntut `zephyr --version |
/// grep` tetap bersih. `GetFileType` mengembalikan FILE_TYPE_CHAR hanya untuk
/// konsol; pipe = FILE_TYPE_PIPE, redirect ke file = FILE_TYPE_DISK.
#[cfg(windows)]
pub fn stdout_tty() -> bool {
    unsafe { win::GetFileType(win::GetStdHandle(win::STD_OUTPUT_HANDLE)) == win::FILE_TYPE_CHAR }
}

#[cfg(not(windows))]
pub fn stdout_tty() -> bool {
    false
}

/// Lebar terminal untuk memutuskan banner penuh vs satu baris.
///
/// `COLUMNS` dibaca dulu (shim/POSIX shell menyetelnya); kalau tidak ada,
/// diasumsikan 100 — asumsi yang aman karena banner hanya 44 kolom dan
/// pengecekan sempit ada untuk terminal yang benar-benar melaporkan diri.
fn kolom_terminal() -> usize {
    std::env::var("COLUMNS")
        .ok()
        .and_then(|s| s.trim().parse::<usize>().ok())
        .filter(|n| *n > 0)
        .unwrap_or(100)
}

/// Tangani `--help` / `--version` sebagai mode KONSOL, lalu minta proses keluar.
///
/// Mengembalikan `true` bila argumen itu ada (pemanggil harus `return`).
/// Dipanggil dari `main()` SEBELUM Tauri: membuka window untuk `--version`
/// berarti user melihat editor berkedip padahal cuma minta satu baris teks.
pub fn tangani_help_version() -> bool {
    let argv: Vec<String> = std::env::args().skip(1).collect();
    let a = parse(&argv, Path::new("."));
    if !a.help && !a.version {
        return false;
    }

    // Exe ini GUI-subsystem di release, jadi tanpa attach tidak ada stdout
    // sama sekali. Gagal attach (mis. dijalankan dari Explorer) bukan error:
    // tulis saja, biarkan hilang.
    #[cfg(windows)]
    unsafe {
        win::AttachConsole(win::ATTACH_PARENT_PROCESS);
    }

    let warna = stdout_tty();
    let kolom = kolom_terminal();
    let teks = if a.help {
        teks_help(warna, kolom)
    } else {
        teks_version(warna, kolom)
    };

    use std::io::Write;
    let out = std::io::stdout();
    let mut lock = out.lock();
    let _ = lock.write_all(teks.as_bytes());
    let _ = lock.flush();
    true
}

/// Banner ASCII "ZEPHYR" — motif zap/angin, sama semangatnya dengan logo 17.
///
/// Lebar TIDAK di-hardcode ke lebar terminal: banner ini 44 kolom dan aman di
/// terminal 80; kalau terminal lebih sempit dari 46, banner dilewati dan hanya
/// baris teks yang dicetak (brief: "wrap aman di terminal sempit").
pub fn banner(warna: bool, kolom: usize) -> String {
    let versi = env!("CARGO_PKG_VERSION");
    if kolom < 46 {
        return if warna {
            format!("{ACCENT}Zephyr{RESET} v{versi}\n")
        } else {
            format!("Zephyr v{versi}\n")
        };
    }

    let seni = [
        r"  ______          _               ",
        r" |___  /         | |              ",
        r"    / /  ___ _ __| |__  _   _ _ __",
        r"   / /  / -_) '_ \ '_ \| | | | '__|",
        r"  /_/___\___| .__/_| |_|\__, |_|   ",
        r"       ⚡    |_|         |___/      ",
    ];

    let mut s = String::new();
    for baris in seni {
        if warna {
            s.push_str(ACCENT);
            s.push_str(baris);
            s.push_str(RESET);
        } else {
            s.push_str(baris);
        }
        s.push('\n');
    }
    if warna {
        s.push_str(&format!(
            "{DIM}  Zephyr v{versi} — code faster, lighter, yours{RESET}\n"
        ));
    } else {
        s.push_str(&format!(
            "  Zephyr v{versi} — code faster, lighter, yours\n"
        ));
    }
    s
}

/// Teks `--help`.
pub fn teks_help(warna: bool, kolom: usize) -> String {
    let mut s = banner(warna, kolom);
    s.push('\n');
    s.push_str(
        "Pakai: zephyr [opsi] [path...]\n\
         \n\
         Path:\n\
         \x20 zephyr .                    buka folder sekarang sebagai workspace\n\
         \x20 zephyr <folder>             buka folder sebagai workspace\n\
         \x20 zephyr <file>               buka file di tab baru\n\
         \x20 zephyr <file>:LINE[:COL]    buka file, kursor ke posisi\n\
         \n\
         Opsi:\n\
         \x20 -n, --new-window            paksa jendela baru\n\
         \x20 -d, --diff A B              bandingkan dua file\n\
         \x20 -w, --wait                  tunggu sampai file ditutup (core.editor)\n\
         \x20 -h, --help                  tampilkan bantuan ini\n\
         \x20 -v, --version               tampilkan versi\n\
         \n\
         Tanpa argumen: membuka jendela/workspace terakhir.\n\
         Git: git config --global core.editor \"zephyr --wait\"\n",
    );
    s
}

/// Teks `--version`.
pub fn teks_version(warna: bool, kolom: usize) -> String {
    let versi = env!("CARGO_PKG_VERSION");
    if warna {
        format!("{}\n{ACCENT}zephyr{RESET} {versi}\n", banner(true, kolom))
    } else {
        // Plain: satu baris yang aman untuk `| grep` / parsing skrip.
        format!("zephyr {versi}\n")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cwd() -> PathBuf {
        PathBuf::from("D:/kerja")
    }

    fn a(v: &[&str]) -> Args {
        let argv: Vec<String> = v.iter().map(|s| s.to_string()).collect();
        parse(&argv, &cwd())
    }

    #[test]
    fn folder_titik_jadi_workspace() {
        let r = a(&["."]);
        assert_eq!(r.targets, vec![Target::Folder("D:/kerja".into())]);
        assert!(!r.kosong);
    }

    #[test]
    fn file_dengan_baris_dan_kolom() {
        let r = a(&["src/a.ts:10:5"]);
        assert_eq!(
            r.targets,
            vec![Target::File {
                path: "D:/kerja/src/a.ts".into(),
                line: Some(10),
                col: Some(5),
            }]
        );
    }

    #[test]
    fn file_dengan_baris_saja() {
        let r = a(&["src/a.ts:10"]);
        assert_eq!(
            r.targets,
            vec![Target::File {
                path: "D:/kerja/src/a.ts".into(),
                line: Some(10),
                col: None,
            }]
        );
    }

    #[test]
    fn path_absolut_windows_tidak_terpecah_di_titik_dua_drive() {
        // JEBAKAN UTAMA: "D:\a\b.ts" punya titik dua tapi BUKAN posisi.
        let r = a(&["D:\\proj\\b.ts"]);
        assert_eq!(
            r.targets,
            vec![Target::File {
                path: "D:/proj/b.ts".into(),
                line: None,
                col: None,
            }]
        );

        // Dengan posisi: drive tetap utuh.
        let r2 = a(&["D:\\proj\\b.ts:33:7"]);
        assert_eq!(
            r2.targets,
            vec![Target::File {
                path: "D:/proj/b.ts".into(),
                line: Some(33),
                col: Some(7),
            }]
        );
    }

    #[test]
    fn forward_slash_dan_backslash_sama() {
        let x = a(&["D:/proj/b.ts"]);
        let y = a(&["D:\\proj\\b.ts"]);
        assert_eq!(x.targets, y.targets);
    }

    #[test]
    fn relatif_dengan_titik_dua_diselesaikan() {
        let r = a(&["../lain/c.ts"]);
        assert_eq!(
            r.targets,
            vec![Target::File {
                path: "D:/lain/c.ts".into(),
                line: None,
                col: None,
            }]
        );
    }

    #[test]
    fn diff_butuh_dua_path() {
        let ok = a(&["--diff", "a.ts", "b.ts"]);
        assert_eq!(
            ok.targets,
            vec![Target::Diff {
                kiri: "D:/kerja/a.ts".into(),
                kanan: "D:/kerja/b.ts".into(),
            }]
        );
        assert!(ok.errors.is_empty());

        let kurang = a(&["--diff", "a.ts"]);
        assert!(kurang.targets.is_empty());
        assert_eq!(kurang.errors.len(), 1);
        assert!(kurang.errors[0].contains("dua path"));
    }

    #[test]
    fn flag_dikenali() {
        assert!(a(&["-n", "."]).new_window);
        assert!(a(&["--wait", "MSG"]).wait);
        assert!(a(&["--help"]).help);
        assert!(a(&["-v"]).version);
        assert!(a(&["--tidak-ada"]).errors[0].contains("tidak dikenal"));
    }

    #[test]
    fn tanpa_argumen_kosong() {
        let r = a(&[]);
        assert!(r.kosong);
        assert!(r.targets.is_empty());
    }

    #[test]
    fn ekspansi_variabel_lingkungan() {
        std::env::set_var("ZEPHYR_UJI28", "D:/dari-env");
        let r = a(&["%ZEPHYR_UJI28%/x.ts"]);
        assert_eq!(
            r.targets,
            vec![Target::File {
                path: "D:/dari-env/x.ts".into(),
                line: None,
                col: None,
            }]
        );
    }

    #[test]
    fn banner_plain_tanpa_ansi() {
        let b = banner(false, 100);
        assert!(!b.contains('\x1b'), "banner plain tidak boleh punya ANSI");
        assert!(b.contains("Zephyr v"));

        let w = banner(true, 100);
        assert!(w.contains(ACCENT), "banner TTY harus berwarna accent");
    }

    #[test]
    fn banner_terminal_sempit_tidak_pakai_ascii_art() {
        let b = banner(false, 30);
        assert_eq!(b.lines().count(), 1, "terminal sempit → satu baris saja");
    }

    #[test]
    fn version_plain_satu_baris_untuk_grep() {
        let v = teks_version(false, 100);
        assert_eq!(v.lines().count(), 1);
        assert!(v.starts_with("zephyr "));
        assert!(!v.contains('\x1b'));
    }

    #[test]
    fn help_memuat_semua_opsi() {
        let h = teks_help(false, 100);
        for opsi in ["--new-window", "--diff", "--wait", "--help", "--version"] {
            assert!(h.contains(opsi), "help harus menyebut {opsi}");
        }
        assert!(h.contains("core.editor"), "help menyebut integrasi git");
    }
}
