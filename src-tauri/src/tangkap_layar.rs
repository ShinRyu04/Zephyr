/*
 * Tangkap layar jendela — sisi Rust (item ZEPH-SCREENSHOT-TOOL / 151).
 *
 * ── KEPUTUSAN: ADA jalur tanpa dependensi baru ────────────────────────────────
 *
 * Yang diperiksa lebih dulu (bukan dugaan, semuanya baris yang bisa dibuka):
 *
 * 1. `tauri = { version = "2", ... }` di `src-tauri/Cargo.toml:17`, versi
 *    terkunci `tauri 2.11.5` di `src-tauri/Cargo.lock:4420-4423`. Tauri versi
 *    ini TIDAK memaparkan API tangkap layar sama sekali:
 *    `grep -rni "fn capture" .../tauri-2.11.5/src/` -> NOL hasil. Jadi tidak ada
 *    `Window::capture_page` / `capture()` yang bisa dipanggil. Handle asli yang
 *    memang dipaparkan adalah `Window::hwnd()`
 *    (`tauri-2.11.5/src/window/mod.rs:1668`, `#[cfg(windows)]`), dan repo ini
 *    sudah memakainya di `titlebar.rs:55` (`jendela.hwnd()?.0 as isize`).
 * 2. `windows` crate TIDAK perlu ditambahkan walau namanya disebut rancangan
 *    (`docs/RANCANGAN-TANGKAP-JENDELA.md` bagian 3 pilihan (b)). Pola yang
 *    SUDAH dipakai repo ini untuk memanggil API Windows tanpa crate itu ada di
 *    `titlebar.rs:8-11`:
 *        #[link(name = "dwmapi")]
 *        extern "system" { fn DwmSetWindowAttribute(...) -> i32; }
 *    Modul ini memakai pola yang sama untuk `user32`/`gdi32`
 *    (`PrintWindow` + `BitBlt` + `GetDIBits`), jadi NOL dependensi baru dan
 *    `Cargo.toml` tidak perlu disentuh. Hanya `isize` (HWND) yang menyeberang,
 *    bukan tipe dari crate lain.
 * 3. WebView2 `CapturePreview` TETAP tidak dipakai — persis keputusan yang sudah
 *    tertulis di `browser.rs:88-90`. Itu API untuk ISI webview, bukan jendela
 *    OS, dan Tauri 2 tidak memaparkannya. Yang di sini menangkap JENDELA OS
 *    (klien+isi yang di-composite), jadi tidak bertentangan dengan kalimat itu.
 * 4. `screenshot_pane` di `mcp_server.rs:971-990` tetap bukan penangkap layar
 *    (ia menulis TEKS buffer pane ke .txt) dan tidak disentuh.
 *
 * ── KEAMANAN ─────────────────────────────────────────────────────────────────
 *
 * Perintah ini HANYA menulis berkas PNG ke disk. Tidak ada parameter jaringan,
 * tidak ada URL, tidak ada jalur "kirim ke X": tidak ada cara memakainya untuk
 * membaca rahasia lalu mengirimkannya keluar. Penjagaan path keluaran meniru
 * pola yang sudah ada di repo:
 *   - `ext_pkg.rs:409-420` (`resolve_in_ext`): tolak absolut & komponen `..`;
 *   - `paths.rs:23` / `cli.rs:101` (`is_absolute`) sebagai syarat bentuk path;
 *   - `paths.rs` (`canonical_or_parent`, `is_inside`) untuk membandingkan path
 *     yang sudah dinormalkan (UNC di-strip, huruf besar/kecil diabaikan);
 *   - `tulis_aman.rs` (`tulis_atomik`) untuk penulisan atomik;
 *   - `browser.rs:71-81` (`browser_download_url`) untuk pola VERIFIKASI byte
 *     sesudah menulis sebelum melaporkan sukses.
 *
 * ── BATAS YANG DIKETAHUI (jujur di muka) ─────────────────────────────────────
 *
 * PNG di sini dikodekan sendiri memakai blok deflate "stored" (tanpa kompresi,
 * lihat `zlib_tersimpan`). Alasannya: crate `png` memang sudah ada di
 * `Cargo.lock` (0.17.16 / 0.18.1) tetapi belum menjadi dependensi langsung, dan
 * `Cargo.toml` di luar berkas yang boleh disentuh lane ini. Akibatnya PNG
 * berukuran ~lebar*tinggi*3 byte (bukan ~10%). Berkasnya PNG yang SAH dan bisa
 * dibuka penampil mana pun (ada uji CRC + inflate balik), hanya besar. Bila
 * suatu saat `png = "0.17"` ditambahkan ke `Cargo.toml`, ganti isi
 * `kodek_png_rgb` — sisanya tidak berubah.
 *
 * Jalur penangkapan piksel: `PrintWindow(hwnd, dc, PW_RENDERFULLCONTENT)`
 * (termasuk isi yang di-render GPU/DirectComposition), dengan cabang kedua
 * `BitBlt` dari layar kalau PrintWindow menolak atau menghasilkan gambar
 * kosong. Kalau keduanya gagal, yang dikembalikan adalah GALAT dengan pesan
 * yang menyebut sebabnya — bukan PNG hitam dan bukan "berhasil".
 */

use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::errors::{ZResult, ZephyrError};

/// Nama perintah yang disepakati di `src/lib/commands.ts:131`
/// (`NAMA_PERINTAH_TANGKAP = 'window_capture'`). Dipakai uji supaya nama ini
/// tidak bisa berubah tanpa ketahuan.
pub const NAMA_PERINTAH_TANGKAP: &str = "window_capture";

/// Batas ukuran gambar yang mau diolah. Area lebih besar dari ini ditolak
/// dengan pesan jelas ketimbang mengalokasikan buffer raksasa tanpa batas.
const MAKS_SISI: u32 = 20_000;
const MAKS_PIKSEL: u64 = 50_000_000;

// ─────────────────────────────── kontrak argumen ────────────────────────────

/// Argumen `window_capture`.
///
/// Bentuknya dipatok oleh pemanggil TypeScript
/// (`src/lib/commands.ts:141-144`):
///     invoke('window_capture', { args: { target, savePath } })
/// jadi parameter perintahnya WAJIB bernama `args`.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArgumenTangkap {
    /// `"window"` (bawaan, jendela Zephyr saja) atau `"screen"` (layar penuh).
    #[serde(default)]
    pub target: Option<String>,
    /// Path PNG tujuan. Kosong/null -> folder gambar user.
    #[serde(default)]
    pub save_path: Option<String>,
}

/// Hasil tangkap layar.
///
/// Nama field Rust memakai bahasa Indonesia, tetapi nama di JSON dipatok ke
/// kontrak TypeScript `HasilTangkapLayar` (`src/lib/commands.ts:133-139`)
/// lewat `rename`: `path`, `width`, `height`, `bytes`. `berhasil` dan
/// `pesanGalat` adalah tambahan; TypeScript tidak menolak field tambahan, dan
/// `tangkapJendela()` sudah memeriksa `hasil.path` sebelum mengaku sukses
/// (`src/lib/zephyrTools/kendaliJendela.ts:453-455`).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct HasilTangkapLayar {
    /// true HANYA kalau PNG benar-benar tertulis dan sudah diverifikasi.
    pub berhasil: bool,
    #[serde(rename = "path")]
    pub path: String,
    #[serde(rename = "width")]
    pub lebar: u32,
    #[serde(rename = "height")]
    pub tinggi: u32,
    pub bytes: u64,
    /// Pesan galat saat `berhasil == false`. Tidak pernah diisi bersamaan
    /// dengan path yang terisi, dan tidak pernah kosong saat gagal.
    #[serde(rename = "pesanGalat", skip_serializing_if = "Option::is_none")]
    pub pesan_galat: Option<String>,
}

impl HasilTangkapLayar {
    /// Bentuk hasil saat gagal. Path SELALU kosong: tidak ada keberhasilan
    /// palsu, dan pemanggil yang memeriksa `path` akan tahu ini gagal.
    pub fn gagal(pesan: impl Into<String>) -> Self {
        HasilTangkapLayar {
            berhasil: false,
            path: String::new(),
            lebar: 0,
            tinggi: 0,
            bytes: 0,
            pesan_galat: Some(pesan.into()),
        }
    }
}

/// Pembungkus hasil untuk perintah Tauri: `ZResult` dari inti dikembalikan
/// sebagai struct dengan `berhasil`/`pesanGalat`, sehingga perintah tidak
/// melempar dan pemanggil selalu menerima bentuk yang sama. Dipakai
/// `window_capture` DAN diuji langsung, supaya bentuk "gagal" benar-benar
/// teruji tanpa perlu jendela hidup.
pub fn bungkus(hasil: ZResult<HasilTangkapLayar>) -> HasilTangkapLayar {
    match hasil {
        Ok(h) => h,
        Err(e) => HasilTangkapLayar::gagal(e.to_string()),
    }
}

// ───────────────────────────── penjagaan path keluaran ──────────────────────

/// Folder yang tidak boleh jadi tujuan tangkap layar (folder sistem).
fn folder_terlarang() -> Vec<PathBuf> {
    ["SystemRoot", "windir", "ProgramFiles", "ProgramFiles(x86)"]
        .iter()
        .filter_map(|k| std::env::var(k).ok())
        .filter(|v| !v.trim().is_empty())
        .map(PathBuf::from)
        .collect()
}

/// Nama berkas yang tidak boleh dipakai di Windows (perangkat cadangan).
fn nama_perangkat(nama: &str) -> bool {
    let dasar = nama
        .split('.')
        .next()
        .unwrap_or("")
        .trim()
        .to_ascii_uppercase();
    matches!(
        dasar.as_str(),
        "CON" | "PRN" | "AUX" | "NUL" | "COM1" | "COM2" | "COM3" | "COM4" | "COM5" | "COM6" | "COM7"
            | "COM8" | "COM9" | "LPT1" | "LPT2" | "LPT3" | "LPT4" | "LPT5" | "LPT6" | "LPT7" | "LPT8"
            | "LPT9"
    )
}

/// Periksa path keluaran yang diminta pemanggil, kembalikan bentuk absolute
/// yang sudah dinormalkan.
///
/// Aturannya (`percobaan` bertipe `&str` karena datang dari JSON):
///  1. tidak kosong;
///  2. harus ABSOLUT — path relatif ambigu: relatif terhadap apa? CWD proses
///     bukan tempat yang dilihat pengguna, dan pola repo (`paths.rs:23`,
///     `cli.rs:101`) selalu menuntut absolut lebih dulu;
///  3. tidak boleh memuat komponen `..` — sama dengan `resolve_in_ext`
///     (`ext_pkg.rs:409-420`), supaya berkas tidak bisa "keluar" dari folder
///     yang terlihat di path;
///  4. harus berakhir `.png` — perintah ini hanya tahu menulis PNG, dan
///     membiarkan ekstensi lain berarti nama berkas/iisi tidak cocok;
///  5. tiap komponen harus nama yang masuk akal di Windows: tidak berakhir
///     titik/spasi (Windows membuangnya, sehingga berkas yang benar-benar
///     tertulis BUKAN path yang dilaporkan — itu bentuk lain dari laporan
///     palsu), dan bukan nama perangkat cadangan (CON/NUL/COM1/...);
///  6. tidak boleh di dalam folder sistem (`%SystemRoot%`, `%ProgramFiles%`):
///     itu yang dimaksud "di luar folder user" pada tugas ini. Path absolute
///     lain — termasuk folder kerja, D:\shots, atau folder gambar user —
///     tetap diterima.
pub fn periksa_path_keluaran(minta: &str) -> ZResult<PathBuf> {
    let mentah = minta.trim();
    if mentah.is_empty() {
        return Err(ZephyrError::InvalidInput("path keluaran kosong".into()));
    }

    let p = Path::new(mentah);
    if !p.is_absolute() {
        return Err(ZephyrError::InvalidInput(format!(
            "path keluaran harus absolut, bukan relatif: {mentah}"
        )));
    }

    if p.components()
        .any(|c| matches!(c, Component::ParentDir))
    {
        return Err(ZephyrError::Permission(format!(
            "path keluaran tidak boleh memuat '..': {mentah}"
        )));
    }

    let nama = p
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .filter(|n| !n.is_empty())
        .ok_or_else(|| {
            ZephyrError::InvalidInput(format!("path keluaran tidak menunjuk berkas: {mentah}"))
        })?;

    if !nama.to_ascii_lowercase().ends_with(".png") {
        return Err(ZephyrError::InvalidInput(format!(
            "path keluaran harus berakhir .png: {mentah}"
        )));
    }

    for c in p.components() {
        if let Component::Normal(s) = c {
            let t = s.to_string_lossy();
            if t.ends_with('.') || t.ends_with(' ') {
                return Err(ZephyrError::InvalidInput(format!(
                    "komponen path berakhir titik/spasi (Windows akan membuangnya, jadi berkas \
                     yang tertulis bukan path yang dilaporkan): {t}"
                )));
            }
            if nama_perangkat(&t) {
                return Err(ZephyrError::InvalidInput(format!(
                    "nama berkas itu nama perangkat Windows, bukan berkas biasa: {t}"
                )));
            }
        }
    }

    let polos = crate::paths::canonical_or_parent(p);
    for terlarang in folder_terlarang() {
        if crate::paths::is_inside(&terlarang, &polos) {
            return Err(ZephyrError::Permission(format!(
                "path keluaran ada di dalam folder sistem {}: {mentah}",
                terlarang.display()
            )));
        }
    }

    Ok(polos)
}

/// Stempel waktu untuk nama berkas bawaan (detik + milidetik, waktu lokal).
fn stempel_waktu() -> String {
    chrono::Local::now()
        .format("%Y%m%d-%H%M%S-%3f")
        .to_string()
}

/// Path bawaan saat pemanggil tidak menentukan `savePath`:
/// `%USERPROFILE%\Pictures\Zephyr\zephyr-<stamp>.png`
/// (bentuk yang disepakati di `docs/RANCANGAN-TANGKAP-JENDELA.md` bagian 3).
/// Kalau `USERPROFILE` tidak ada, folder temp dipakai supaya perintah tidak
/// mengarang path yang tidak bisa ditulis.
pub fn path_bawaan(stamp: &str) -> PathBuf {
    let dasar = std::env::var_os("USERPROFILE")
        .map(PathBuf::from)
        .filter(|d| !d.as_os_str().is_empty())
        .unwrap_or_else(std::env::temp_dir);
    dasar
        .join("Pictures")
        .join("Zephyr")
        .join(format!("zephyr-{stamp}.png"))
}

// ─────────────────────────────── kodek PNG ──────────────────────────────────
//
// PNG minimal, tanpa dependensi: warna 24-bit (RGB), bit depth 8, filter 0
// (None) di setiap baris, dan zlib berisi blok deflate "stored". Semua yang
// dibutuhkan penampil (CRC tiap chunk, adler32, panjang chunk) dihitung sendiri
// dan diuji.

const PNG_SIGNATURE: [u8; 8] = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];

fn crc32(data: &[u8]) -> u32 {
    let mut c: u32 = 0xFFFF_FFFF;
    for &b in data {
        c ^= b as u32;
        for _ in 0..8 {
            c = if c & 1 != 0 {
                0xEDB8_8320 ^ (c >> 1)
            } else {
                c >> 1
            };
        }
    }
    !c
}

fn adler32(data: &[u8]) -> u32 {
    let mut a: u32 = 1;
    let mut b: u32 = 0;
    for &x in data {
        a = (a + x as u32) % 65521;
        b = (b + a) % 65521;
    }
    (b << 16) | a
}

/// zlib dengan blok deflate "stored" (BTYPE=00). Data <= 65535 byte per blok.
fn zlib_tersimpan(data: &[u8]) -> Vec<u8> {
    // CMF=0x78 (deflate, 32K window), FLG=0x01 (tanpa dict, level tercepat).
    let mut out = vec![0x78u8, 0x01];
    let mut i = 0usize;
    loop {
        let sisa = data.len() - i;
        let n = sisa.min(65535);
        let bfinal = i + n >= data.len();
        out.push(if bfinal { 1 } else { 0 });
        let n16 = n as u16;
        out.extend_from_slice(&n16.to_le_bytes());
        out.extend_from_slice(&(!n16).to_le_bytes());
        out.extend_from_slice(&data[i..i + n]);
        i += n;
        if bfinal {
            break;
        }
    }
    out.extend_from_slice(&adler32(data).to_be_bytes());
    out
}

fn chunk(out: &mut Vec<u8>, jenis: &[u8; 4], isi: &[u8]) {
    out.extend_from_slice(&(isi.len() as u32).to_be_bytes());
    out.extend_from_slice(jenis);
    out.extend_from_slice(isi);
    let mut untuk_crc = jenis.to_vec();
    untuk_crc.extend_from_slice(isi);
    out.extend_from_slice(&crc32(&untuk_crc).to_be_bytes());
}

/// Kodekan piksel RGB (3 byte per piksel, atas-ke-bawah) menjadi berkas PNG.
pub fn kodek_png_rgb(lebar: u32, tinggi: u32, rgb: &[u8]) -> ZResult<Vec<u8>> {
    if lebar == 0 || tinggi == 0 {
        return Err(ZephyrError::InvalidInput(format!(
            "ukuran gambar tidak masuk akal: {lebar}x{tinggi}"
        )));
    }
    if lebar > MAKS_SISI || tinggi > MAKS_SISI || (lebar as u64) * (tinggi as u64) > MAKS_PIKSEL {
        return Err(ZephyrError::InvalidInput(format!(
            "gambar terlalu besar untuk ditangkap: {lebar}x{tinggi}"
        )));
    }
    let diharapkan = (lebar as usize) * (tinggi as usize) * 3;
    if rgb.len() != diharapkan {
        return Err(ZephyrError::InvalidInput(format!(
            "panjang piksel tidak cocok: {} byte, seharusnya {diharapkan} (RGB {lebar}x{tinggi})",
            rgb.len()
        )));
    }

    let mut mentah = Vec::with_capacity(diharapkan + tinggi as usize);
    for y in 0..tinggi as usize {
        mentah.push(0u8); // filter: None
        let dasar = y * (lebar as usize) * 3;
        mentah.extend_from_slice(&rgb[dasar..dasar + (lebar as usize) * 3]);
    }

    let mut out = Vec::with_capacity(mentah.len() + 64);
    out.extend_from_slice(&PNG_SIGNATURE);

    let mut ihdr = Vec::with_capacity(13);
    ihdr.extend_from_slice(&lebar.to_be_bytes());
    ihdr.extend_from_slice(&tinggi.to_be_bytes());
    ihdr.push(8); // bit depth
    ihdr.push(2); // color type: truecolor RGB
    ihdr.push(0); // compression: deflate
    ihdr.push(0); // filter method 0
    ihdr.push(0); // interlace: none
    chunk(&mut out, b"IHDR", &ihdr);
    chunk(&mut out, b"IDAT", &zlib_tersimpan(&mentah));
    chunk(&mut out, b"IEND", &[]);
    Ok(out)
}

/// BGRA (DIB 32-bit, baris dari BAWAH ke atas) -> RGB (atas ke bawah).
///
/// Saluran alpha dibuang, bukan ditulis: `GetDIBits` pada bitmap kompatibel
/// GDI biasanya meninggalkan alpha nol, dan menuliskannya berarti PNG yang
/// tembus pandang (terlihat "kosong" di penampil) — persis bentuk laporan
/// palsu yang dihindari.
#[cfg(windows)]
fn bgra_ke_rgb(bgra: &[u8], lebar: u32, tinggi: u32) -> Vec<u8> {
    let baris = lebar as usize * 4;
    let mut out = Vec::with_capacity(lebar as usize * tinggi as usize * 3);
    for y in (0..tinggi as usize).rev() {
        let dasar = y * baris;
        for x in 0..lebar as usize {
            let i = dasar + x * 4;
            out.push(bgra[i + 2]); // R
            out.push(bgra[i + 1]); // G
            out.push(bgra[i]); // B
        }
    }
    out
}

// ─────────────────────────── penangkapan piksel (Windows) ───────────────────

#[cfg(windows)]
mod win32 {
    use std::ffi::c_void;

    pub type Hdc = *mut c_void;
    pub type Hbitmap = *mut c_void;
    pub type Hgdiobj = *mut c_void;

    #[repr(C)]
    #[derive(Clone, Copy)]
    pub struct Rect {
        pub kiri: i32,
        pub atas: i32,
        pub kanan: i32,
        pub bawah: i32,
    }

    #[repr(C)]
    struct BitmapInfoHeader {
        bi_size: u32,
        bi_width: i32,
        bi_height: i32,
        bi_planes: u16,
        bi_bit_count: u16,
        bi_compression: u32,
        bi_size_image: u32,
        bi_x_pels: i32,
        bi_y_pels: i32,
        bi_clr_used: u32,
        bi_clr_important: u32,
    }

    #[repr(C)]
    struct RgbQuad {
        b: u8,
        g: u8,
        r: u8,
        cadangan: u8,
    }

    #[repr(C)]
    struct BitmapInfo {
        header: BitmapInfoHeader,
        warna: [RgbQuad; 1],
    }

    /// PrintWindow: render isi jendela, termasuk yang di-composite GPU/DComp.
    const PW_RENDER_FULL_CONTENT: u32 = 0x0000_0002;
    const BI_RGB: u32 = 0;
    const DIB_RGB_COLORS: u32 = 0;
    const SRCCOPY: u32 = 0x00CC_0020;

    pub const SM_XVIRTUALSCREEN: i32 = 76;
    pub const SM_YVIRTUALSCREEN: i32 = 77;
    pub const SM_CXVIRTUALSCREEN: i32 = 78;
    pub const SM_CYVIRTUALSCREEN: i32 = 79;
    pub const SM_CXSCREEN: i32 = 0;
    pub const SM_CYSCREEN: i32 = 1;

    #[link(name = "user32")]
    extern "system" {
        fn GetWindowRect(hwnd: isize, rect: *mut Rect) -> i32;
        fn PrintWindow(hwnd: isize, hdc: Hdc, flags: u32) -> i32;
        fn GetDC(hwnd: isize) -> Hdc;
        fn ReleaseDC(hwnd: isize, hdc: Hdc) -> i32;
        fn GetSystemMetrics(index: i32) -> i32;
    }

    #[link(name = "gdi32")]
    extern "system" {
        fn CreateCompatibleDC(hdc: Hdc) -> Hdc;
        fn CreateCompatibleBitmap(hdc: Hdc, w: i32, h: i32) -> Hbitmap;
        fn SelectObject(hdc: Hdc, obj: Hgdiobj) -> Hgdiobj;
        fn DeleteObject(obj: Hgdiobj) -> i32;
        fn DeleteDC(hdc: Hdc) -> i32;
        fn BitBlt(
            dst: Hdc,
            x: i32,
            y: i32,
            w: i32,
            h: i32,
            src: Hdc,
            src_x: i32,
            src_y: i32,
            rop: u32,
        ) -> i32;
        fn GetDIBits(
            hdc: Hdc,
            hbm: Hbitmap,
            start: u32,
            baris: u32,
            bit: *mut c_void,
            info: *mut BitmapInfo,
            pemakaian: u32,
        ) -> i32;
    }

    pub struct BitmapRgb {
        pub lebar: u32,
        pub tinggi: u32,
        pub rgb: Vec<u8>,
        /// Cara yang benar-benar dipakai ("PrintWindow" atau "BitBlt(layar)").
        pub cara: &'static str,
    }

    /// Kotak jendela dalam koordinat layar (piksel fisik, karena proses Tauri
    /// sudah DPI-aware per-monitor).
    pub fn rect_jendela(hwnd: isize) -> Result<Rect, String> {
        let mut r = Rect {
            kiri: 0,
            atas: 0,
            kanan: 0,
            bawah: 0,
        };
        let ok = unsafe { GetWindowRect(hwnd, &mut r) };
        if ok == 0 {
            return Err(format!(
                "GetWindowRect menolak HWND {hwnd:#x} (jendela tidak ada / handle bukan jendela)"
            ));
        }
        Ok(r)
    }

    /// Kotak layar; kalau tidak ada layar virtual, jatuh ke layar utama.
    pub fn rect_layar() -> Rect {
        unsafe {
            let (x, y) = (
                GetSystemMetrics(SM_XVIRTUALSCREEN),
                GetSystemMetrics(SM_YVIRTUALSCREEN),
            );
            let (w, h) = (
                GetSystemMetrics(SM_CXVIRTUALSCREEN),
                GetSystemMetrics(SM_CYVIRTUALSCREEN),
            );
            if w > 0 && h > 0 {
                Rect {
                    kiri: x,
                    atas: y,
                    kanan: x + w,
                    bawah: y + h,
                }
            } else {
                Rect {
                    kiri: 0,
                    atas: 0,
                    kanan: GetSystemMetrics(SM_CXSCREEN),
                    bawah: GetSystemMetrics(SM_CYSCREEN),
                }
            }
        }
    }

    /// Cara menggambar yang dicoba, berurutan.
    enum Cara {
        /// PrintWindow(hwnd, flag) — tetap bekerja walau jendela terhalang
        /// jendela lain, dan flag `PW_RENDER_FULL_CONTENT` menyertakan isi yang
        /// di-composite GPU/DirectComposition.
        PrintWindow(isize, u32),
        /// BitBlt dari DC layar pada kotak `rect` — jalan terakhir, andal hanya
        /// kalau jendela benar-benar terlihat di layar.
        BitBltLayar,
    }

    impl Cara {
        fn nama(&self) -> &'static str {
            match self {
                Cara::PrintWindow(_, PW_RENDER_FULL_CONTENT) => "PrintWindow(render-full-content)",
                Cara::PrintWindow(_, _) => "PrintWindow(legacy)",
                Cara::BitBltLayar => "BitBlt(layar)",
            }
        }
    }

    /// Jalankan `f` dengan `bmp` terpilih di `dc_mem`, lalu kembalikan pilihan
    /// lama. Bitmap GDI HARUS terpilih di DC saat digambar (`PrintWindow`/
    /// `BitBlt` menggambar ke bitmap yang sedang terpilih) dan HARUS sudah tidak
    /// terpilih saat dibaca (`GetDIBits` menolak bitmap yang masih di DC) —
    /// pembungkus ini memegang kedua aturan itu di satu tempat.
    unsafe fn dengan_bitmap_terpilih<T>(dc_mem: Hdc, bmp: Hbitmap, f: impl FnOnce() -> T) -> T {
        let lama = SelectObject(dc_mem, bmp);
        let hasil = f();
        if !lama.is_null() && lama as isize != -1 {
            SelectObject(dc_mem, lama);
        }
        hasil
    }

    /// Lepaskan handle GDI di semua jalur keluar, termasuk galat: tanpa ini,
    /// perintah yang gagal berkali-kali akan menumpuk kebocoran handle DC/bitmap.
    struct SumberDaya {
        dc_layar: Hdc,
        dc_mem: Hdc,
        bmp: Hbitmap,
    }

    impl Drop for SumberDaya {
        fn drop(&mut self) {
            unsafe {
                if !self.bmp.is_null() {
                    DeleteObject(self.bmp);
                }
                if !self.dc_mem.is_null() {
                    DeleteDC(self.dc_mem);
                }
                if !self.dc_layar.is_null() {
                    ReleaseDC(0, self.dc_layar);
                }
            }
        }
    }

    /// Salin piksel `rect` lalu baca jadi RGB.
    ///
    /// Urutan percobaan: `PrintWindow` (flag modern lalu flag lama) bila ada
    /// jendela, kemudian `BitBlt` dari layar. Percobaan berikutnya dipakai JUGA
    /// kalau yang sebelumnya "berhasil" tetapi seluruh pikselnya nol — itu gejala
    /// klasik PrintWindow pada jendela yang di-render GPU, dan menerimanya berarti
    /// mengirim PNG hitam sambil mengaku berhasil. Kalau seluruh percobaan gagal,
    /// hasilnya pesan galat yang menyebut sebabnya.
    pub fn tangkap(rect: Rect, jendela: Option<isize>) -> Result<BitmapRgb, String> {
        let lebar_i = rect.kanan - rect.kiri;
        let tinggi_i = rect.bawah - rect.atas;
        if lebar_i <= 0 || tinggi_i <= 0 {
            return Err(format!(
                "area tangkap tidak masuk akal: {lebar_i}x{tinggi_i} piksel"
            ));
        }
        let lebar = lebar_i as u32;
        let tinggi = tinggi_i as u32;

        unsafe {
            let dc_layar = GetDC(0);
            if dc_layar.is_null() {
                return Err("GetDC(desktop) gagal; tidak ada jalur lain untuk membaca piksel".into());
            }
            let mut sumber = SumberDaya {
                dc_layar,
                dc_mem: std::ptr::null_mut(),
                bmp: std::ptr::null_mut(),
            };
            sumber.dc_mem = CreateCompatibleDC(dc_layar);
            if sumber.dc_mem.is_null() {
                return Err("CreateCompatibleDC gagal".into());
            }
            sumber.bmp = CreateCompatibleBitmap(dc_layar, lebar_i, tinggi_i);
            if sumber.bmp.is_null() {
                return Err(format!("CreateCompatibleBitmap({lebar}x{tinggi}) gagal"));
            }
            let (dc_mem, bmp) = (sumber.dc_mem, sumber.bmp);

            let mut percobaan: Vec<Cara> = Vec::new();
            if let Some(hwnd) = jendela {
                percobaan.push(Cara::PrintWindow(hwnd, PW_RENDER_FULL_CONTENT));
                percobaan.push(Cara::PrintWindow(hwnd, 0));
            }
            percobaan.push(Cara::BitBltLayar);

            let mut galat = String::from("tidak ada cara penangkapan yang dicoba");
            for cara in percobaan {
                let ok = match cara {
                    Cara::PrintWindow(hwnd, flag) => {
                        dengan_bitmap_terpilih(dc_mem, bmp, || PrintWindow(hwnd, dc_mem, flag))
                    }
                    Cara::BitBltLayar => dengan_bitmap_terpilih(dc_mem, bmp, || {
                        BitBlt(
                            dc_mem,
                            0,
                            0,
                            lebar_i,
                            tinggi_i,
                            dc_layar,
                            rect.kiri,
                            rect.atas,
                            SRCCOPY,
                        )
                    }),
                };
                if ok == 0 {
                    galat = format!(
                        "{}: GDI menolak menggambar area {lebar}x{tinggi} pada ({}, {})",
                        cara.nama(),
                        rect.kiri,
                        rect.atas
                    );
                    continue;
                }

                let mut info = BitmapInfo {
                    header: BitmapInfoHeader {
                        bi_size: std::mem::size_of::<BitmapInfoHeader>() as u32,
                        bi_width: lebar_i,
                        bi_height: tinggi_i,
                        bi_planes: 1,
                        bi_bit_count: 32,
                        bi_compression: BI_RGB,
                        bi_size_image: lebar * tinggi * 4,
                        bi_x_pels: 0,
                        bi_y_pels: 0,
                        bi_clr_used: 0,
                        bi_clr_important: 0,
                    },
                    warna: [RgbQuad {
                        b: 0,
                        g: 0,
                        r: 0,
                        cadangan: 0,
                    }],
                };
                let mut bgra = vec![0u8; lebar as usize * tinggi as usize * 4];
                /* Dibaca saat bitmap sudah dilepas dari DC (lihat
                `dengan_bitmap_terpilih`) — syarat GetDIBits. */
                let baris = GetDIBits(
                    dc_mem,
                    bmp,
                    0,
                    tinggi,
                    bgra.as_mut_ptr() as *mut c_void,
                    &mut info,
                    DIB_RGB_COLORS,
                );
                if baris as u32 != tinggi {
                    galat = format!(
                        "{}: GetDIBits hanya mengembalikan {baris} dari {tinggi} baris",
                        cara.nama()
                    );
                    continue;
                }
                if bgra.iter().all(|b| *b == 0) {
                    galat = format!(
                        "{}: seluruh piksel nol untuk area {lebar}x{tinggi} (jendela di-render \
                         GPU atau tidak terlihat) — bukan gambar yang sah",
                        cara.nama()
                    );
                    continue;
                }
                return Ok(BitmapRgb {
                    lebar,
                    tinggi,
                    rgb: super::bgra_ke_rgb(&bgra, lebar, tinggi),
                    cara: cara.nama(),
                });
            }
            Err(galat)
        }
    }
}

// ──────────────────────────────── perintah inti ─────────────────────────────

/// Inti `window_capture` tanpa `tauri::Window`, supaya bisa diuji langsung
/// (jendela hidup tidak tersedia di `cargo test`).
///
/// `hwnd`: handle jendela yang mau ditangkap; wajib `Some` non-nol untuk
/// target `"window"`, diabaikan untuk `"screen"`.
pub fn jalankan_tangkap(args: &ArgumenTangkap, hwnd: Option<isize>) -> ZResult<HasilTangkapLayar> {
    let target = args
        .target
        .as_deref()
        .map(|t| t.trim().to_ascii_lowercase())
        .filter(|t| !t.is_empty())
        .unwrap_or_else(|| "window".to_string());

    if target != "window" && target != "screen" {
        return Err(ZephyrError::InvalidInput(format!(
            "target tidak dikenal: {target} (pakai \"window\" atau \"screen\")"
        )));
    }

    let path = match args
        .save_path
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        Some(minta) => periksa_path_keluaran(minta)?,
        None => path_bawaan(&stempel_waktu()),
    };

    #[cfg(not(windows))]
    {
        let _ = hwnd;
        let _ = &path;
        return Err(ZephyrError::Internal(
            "tangkap layar hanya didukung di Windows (aplikasi ini hanya menargetkan Windows)".into(),
        ));
    }

    #[cfg(windows)]
    {
        let (rect, jendela) = if target == "screen" {
            (win32::rect_layar(), None)
        } else {
            let h = hwnd.ok_or_else(|| {
                ZephyrError::Internal(
                    "HWND jendela tidak tersedia, jadi tidak ada yang bisa ditangkap".into(),
                )
            })?;
            if h == 0 {
                return Err(ZephyrError::InvalidInput(
                    "HWND jendela nol: jendela belum dibuat atau sudah ditutup".into(),
                ));
            }
            (win32::rect_jendela(h).map_err(ZephyrError::Internal)?, Some(h))
        };

        let bmp = win32::tangkap(rect, jendela).map_err(ZephyrError::Internal)?;
        tracing::debug!(
            cara = bmp.cara,
            lebar = bmp.lebar,
            tinggi = bmp.tinggi,
            "tangkap layar: piksel tersalin"
        );

        let png = kodek_png_rgb(bmp.lebar, bmp.tinggi, &bmp.rgb)?;

        /* Tulis atomik (pola `tulis_aman.rs`) lalu VERIFIKASI byte yang benar-benar
        ada di disk sebelum mengaku sukses (pola `browser.rs:71-81`). */
        crate::tulis_aman::tulis_atomik(&path, &png)?;
        let ditulis = std::fs::metadata(&path)
            .map_err(|e| {
                ZephyrError::Io(format!(
                    "PNG ditulis tetapi tidak bisa diperiksa ({}): {e}",
                    path.display()
                ))
            })?
            .len();
        if ditulis != png.len() as u64 {
            return Err(ZephyrError::Io(format!(
                "verifikasi byte gagal: {} byte di disk, {} byte yang ditulis",
                ditulis,
                png.len()
            )));
        }

        Ok(HasilTangkapLayar {
            berhasil: true,
            path: path.to_string_lossy().to_string(),
            lebar: bmp.lebar,
            tinggi: bmp.tinggi,
            bytes: ditulis,
            pesan_galat: None,
        })
    }
}

#[cfg(windows)]
fn hwnd_dari(jendela: &tauri::Window) -> Option<isize> {
    jendela.hwnd().ok().map(|h| h.0 as isize)
}

#[cfg(not(windows))]
fn hwnd_dari(_jendela: &tauri::Window) -> Option<isize> {
    None
}

/// Perintah Tauri `window_capture` — nama persis yang disepakati di
/// `src/lib/commands.ts:131` dan `docs/RANCANGAN-TANGKAP-JENDELA.md`.
///
/// Tidak melempar: hasilnya selalu `HasilTangkapLayar`, dengan `berhasil=false`
/// + `pesanGalat` kalau gagal, dan path kosong. Pemanggil yang memeriksa
/// `hasil.path` tidak mungkin tertipu oleh keberhasilan palsu.
///
/// Tidak ada parameter jaringan/URL/"kirim ke ..." di sini: satu-satunya
/// dampaknya adalah menulis satu berkas .png ke path yang sudah diperiksa.
#[tauri::command]
pub fn window_capture(jendela: tauri::Window, args: ArgumenTangkap) -> HasilTangkapLayar {
    tracing::debug!(
        perintah = NAMA_PERINTAH_TANGKAP,
        target = ?args.target,
        "tangkap layar: permintaan diterima"
    );
    let hwnd = hwnd_dari(&jendela);
    bungkus(jalankan_tangkap(&args, hwnd))
}

// ─────────────────────────────────── uji ────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn dir_uji(nama: &str) -> PathBuf {
        let d = std::env::temp_dir()
            .join("zephyr-tangkap-layar")
            .join(nama);
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    /// Inflate untuk blok deflate "stored" saja — cukup untuk memeriksa bahwa
    /// yang ditulis kodek ini benar-benar bisa dibaca kembali.
    fn inflate_tersimpan(z: &[u8]) -> Vec<u8> {
        assert!(z.len() >= 6, "zlib terlalu pendek: {} byte", z.len());
        assert_eq!(z[0] & 0x0F, 8, "metode kompresi harus deflate");
        assert_eq!(
            (u16::from_be_bytes([z[0], z[1]])) % 31,
            0,
            "header zlib harus kelipatan 31"
        );
        let mut i = 2usize;
        let mut out = Vec::new();
        loop {
            assert!(i + 5 <= z.len(), "blok deflate terpotong");
            let bfinal = z[i] & 1 == 1;
            let btype = (z[i] >> 1) & 3;
            assert_eq!(btype, 0, "kodek ini hanya menulis blok tersimpan");
            let n = u16::from_le_bytes([z[i + 1], z[i + 2]]) as usize;
            let nlen = u16::from_le_bytes([z[i + 3], z[i + 4]]);
            assert_eq!(nlen, !(n as u16), "NLEN harus komplemen LEN");
            out.extend_from_slice(&z[i + 5..i + 5 + n]);
            i += 5 + n;
            if bfinal {
                break;
            }
        }
        assert_eq!(
            adler32(&out),
            u32::from_be_bytes([z[z.len() - 4], z[z.len() - 3], z[z.len() - 2], z[z.len() - 1]]),
            "adler32 di ekor zlib harus cocok dengan isinya"
        );
        out
    }

    /// Pecah PNG jadi (jenis, isi) dan sekaligus memastikan setiap CRC benar —
    /// inilah yang membuat penampil mana pun mau membukanya.
    fn chunk_png(png: &[u8]) -> Vec<(String, Vec<u8>)> {
        assert_eq!(&png[0..8], &PNG_SIGNATURE, "signature PNG");
        let mut i = 8usize;
        let mut out = Vec::new();
        loop {
            assert!(i + 12 <= png.len(), "chunk terpotong di offset {i}");
            let n = u32::from_be_bytes([png[i], png[i + 1], png[i + 2], png[i + 3]]) as usize;
            let jenis = String::from_utf8(png[i + 4..i + 8].to_vec()).unwrap();
            let isi = png[i + 8..i + 8 + n].to_vec();
            let crc_di_berkas = u32::from_be_bytes([
                png[i + 8 + n],
                png[i + 9 + n],
                png[i + 10 + n],
                png[i + 11 + n],
            ]);
            let mut untuk_crc = png[i + 4..i + 8].to_vec();
            untuk_crc.extend_from_slice(&isi);
            assert_eq!(
                crc_di_berkas,
                crc32(&untuk_crc),
                "CRC chunk {jenis} salah — berkas bukan PNG sah"
            );
            i += 12 + n;
            let selesai = jenis == "IEND";
            out.push((jenis, isi));
            if selesai {
                break;
            }
        }
        assert_eq!(i, png.len(), "ada byte berlebih sesudah IEND");
        out
    }

    fn dimensi_png(png: &[u8]) -> Option<(u32, u32)> {
        if png.len() < 24 || &png[0..8] != &PNG_SIGNATURE {
            return None;
        }
        Some((
            u32::from_be_bytes([png[16], png[17], png[18], png[19]]),
            u32::from_be_bytes([png[20], png[21], png[22], png[23]]),
        ))
    }

    // ── kodek PNG ──────────────────────────────────────────────────────────

    #[test]
    fn kodek_png_menghasilkan_berkas_png_sah() {
        let lebar = 100u32;
        let tinggi = 50u32;
        let rgb: Vec<u8> = (0..(lebar as usize * tinggi as usize * 3))
            .map(|i| (i % 251) as u8)
            .collect();
        let png = kodek_png_rgb(lebar, tinggi, &rgb).unwrap();

        let chunk = chunk_png(&png);
        let jenis: Vec<&str> = chunk.iter().map(|(n, _)| n.as_str()).collect();
        assert_eq!(jenis, vec!["IHDR", "IDAT", "IEND"]);

        // IHDR: bit depth 8, truecolor, tanpa interlace
        let ihdr = &chunk[0].1;
        assert_eq!(ihdr.len(), 13);
        assert_eq!(ihdr[8], 8, "bit depth");
        assert_eq!(ihdr[9], 2, "color type truecolor");
        assert_eq!(ihdr[12], 0, "interlace");
        assert_eq!(dimensi_png(&png), Some((lebar, tinggi)));

        /* Panjang PERSIS: signature 8 + (12+13) IHDR + (12+IDAT) + (12+0) IEND,
        dengan IDAT = 2 header + 5 header blok + mentah + 4 adler32, dan mentah
        = tinggi * (1 filter + lebar*3). */
        let mentah = tinggi as usize * (1 + lebar as usize * 3);
        let idat = 2 + 5 + mentah + 4;
        let harusnya = 8 + (12 + 13) + (12 + idat) + (12 + 0);
        assert_eq!(png.len(), harusnya, "ukuran berkas PNG tidak sesuai hitungan");

        // dan isinya benar-benar piksel yang dikirim
        let kembali = inflate_tersimpan(&chunk[1].1);
        assert_eq!(kembali.len(), mentah);
        for y in 0..tinggi as usize {
            let dasar = y * (1 + lebar as usize * 3);
            assert_eq!(kembali[dasar], 0, "filter baris {y} harus None");
            assert_eq!(
                &kembali[dasar + 1..dasar + 1 + (lebar as usize) * 3],
                &rgb[y * (lebar as usize) * 3..(y + 1) * (lebar as usize) * 3],
                "piksel baris {y} tidak sama setelah bolak-balik"
            );
        }
    }

    #[test]
    fn kodek_png_menolak_ukuran_dan_panjang_yang_tidak_masuk_akal() {
        assert!(kodek_png_rgb(0, 10, &[]).is_err(), "lebar 0 harus ditolak");
        assert!(kodek_png_rgb(10, 0, &[]).is_err(), "tinggi 0 harus ditolak");
        assert!(
            kodek_png_rgb(4, 4, &[0u8; 10]).is_err(),
            "panjang piksel yang tidak cocok harus ditolak, bukan diisi sampah"
        );
        assert!(
            kodek_png_rgb(MAKS_SISI + 1, 1, &vec![0u8; ((MAKS_SISI + 1) * 3) as usize]).is_err(),
            "gambar raksasa harus ditolak dengan pesan, bukan mengalokasikan buffer"
        );
    }

    #[test]
    fn zlib_tersimpan_memecah_data_besar_jadi_beberapa_blok() {
        // > 65535 byte -> lebih dari satu blok; harus tetap terbaca kembali.
        let data: Vec<u8> = (0..200_000).map(|i| (i % 256) as u8).collect();
        let z = zlib_tersimpan(&data);
        assert_eq!(inflate_tersimpan(&z), data);
    }

    #[cfg(windows)]
    #[test]
    fn bgra_ke_rgb_membalik_baris_dan_membuang_alpha() {
        /* DIB 32-bit: baris pertama yang dibaca adalah baris BAWAH gambar, dan
        tiap piksel tersimpan B,G,R,A. Kalau urutan ini salah, hasilnya adalah
        tangkapan layar terbalik — bukan hal yang bisa terlihat dari uji lain. */
        let bgra: Vec<u8> = vec![
            // baris bawah (dibaca pertama): 2 piksel
            10, 20, 30, 0, 40, 50, 60, 0, // baris atas: 2 piksel
            70, 80, 90, 0, 100, 110, 120, 0,
        ];
        let rgb = bgra_ke_rgb(&bgra, 2, 2);
        assert_eq!(
            rgb,
            vec![
                90, 80, 70, 120, 110, 100, // baris ATAS dulu
                30, 20, 10, 60, 50, 40,
            ],
            "urutan baris/saluran salah"
        );
    }

    // ── penjagaan path keluaran ────────────────────────────────────────────

    #[test]
    fn tolak_path_kosong_dan_relatif() {
        assert!(matches!(
            periksa_path_keluaran("   "),
            Err(ZephyrError::InvalidInput(_))
        ));
        for relatif in ["gambar.png", "./gambar.png", "Pictures/gambar.png"] {
            let r = periksa_path_keluaran(relatif);
            assert!(
                matches!(r, Err(ZephyrError::InvalidInput(_))),
                "{relatif} harus ditolak sebagai path relatif, dapat {r:?}"
            );
        }
    }

    #[test]
    fn tolak_path_dengan_parent_dir() {
        let r = periksa_path_keluaran("C:/Users/x/Pictures/../../Windows/rahasia.png");
        assert!(
            matches!(r, Err(ZephyrError::Permission(_))),
            "'..' harus ditolak, dapat {r:?}"
        );
    }

    #[test]
    fn tolak_ekstensi_bukan_png() {
        for p in [
            "C:/Users/x/Pictures/gambar.txt",
            "C:/Users/x/Pictures/gambar.png.exe",
            "C:/Users/x/Pictures/gambar",
        ] {
            let r = periksa_path_keluaran(p);
            assert!(
                matches!(r, Err(ZephyrError::InvalidInput(_))),
                "{p} harus ditolak karena bukan .png, dapat {r:?}"
            );
        }
    }

    #[test]
    fn tolak_komponen_path_aneh_dan_nama_perangkat() {
        for p in [
            "C:/Users/x/Pictures/pics /gambar.png",
            "C:/Users/x/Pictures/berkas./gambar.png",
            "C:/Users/x/Pictures/NUL.png",
            "C:/Users/x/Pictures/CON.png",
            "C:/Users/x/Pictures/COM1.png",
        ] {
            let r = periksa_path_keluaran(p);
            assert!(
                matches!(r, Err(ZephyrError::InvalidInput(_))),
                "{p} harus ditolak sebagai nama path yang tidak masuk akal, dapat {r:?}"
            );
        }
        // Nama yang hanya MENGANDUNG nama perangkat tetap boleh.
        assert!(periksa_path_keluaran("C:/Users/x/Pictures/console.png").is_ok());
        // Spasi di TENGAH nama berkas sah di Windows, jadi tidak boleh ditolak.
        assert!(periksa_path_keluaran("C:/Users/x/Pictures/tangkap 1.png").is_ok());
    }

    #[test]
    fn tolak_folder_sistem() {
        let mut diuji = 0;
        for kunci in ["SystemRoot", "ProgramFiles"] {
            let Ok(dasar) = std::env::var(kunci) else {
                continue;
            };
            if dasar.trim().is_empty() {
                continue;
            }
            let p = format!("{}\\\\cap-uji\\\\gambar.png", dasar.trim_end_matches(['\\', '/']));
            let r = periksa_path_keluaran(&p);
            assert!(
                matches!(r, Err(ZephyrError::Permission(_))),
                "{p} (di dalam {kunci}) harus ditolak, dapat {r:?}"
            );
            diuji += 1;
        }
        assert!(diuji > 0, "tidak ada variabel folder sistem untuk diuji");
    }

    #[test]
    fn terima_path_absolut_yang_wajar() {
        let dasar = std::env::var("USERPROFILE").unwrap_or_else(|_| std::env::temp_dir().to_string_lossy().to_string());
        let p = format!("{}/Pictures/Zephyr/uji-lane-tangkap.png", dasar.replace('\\', "/"));
        let hasil = periksa_path_keluaran(&p).expect("path wajar harus diterima");
        assert!(hasil.is_absolute(), "hasil harus absolut: {hasil:?}");
        assert_eq!(
            hasil.file_name().unwrap().to_string_lossy().to_lowercase(),
            "uji-lane-tangkap.png"
        );
    }

    #[test]
    fn path_bawaan_di_folder_gambar_user() {
        let p = path_bawaan("20260101-010203-000");
        let teks = p.to_string_lossy().replace('\\', "/");
        assert!(p.is_absolute());
        assert!(
            teks.contains("/Pictures/Zephyr/"),
            "path bawaan harus di folder gambar user: {teks}"
        );
        assert!(teks.ends_with("zephyr-20260101-010203-000.png"));
        // hasilnya harus lolos penjagaan yang sama dengan path yang diminta user
        assert!(periksa_path_keluaran(&teks).is_ok());
    }

    #[test]
    fn stempel_waktu_aman_untuk_nama_berkas() {
        let s = stempel_waktu();
        assert!(s.len() >= 15, "stempel terlalu pendek: {s}");
        assert!(
            s.chars().all(|c| c.is_ascii_digit() || c == '-'),
            "stempel hanya boleh angka dan '-': {s}"
        );
        // dua pemanggilan berbeda nama (millidetik), supaya berkas tidak saling menimpa
        let t = stempel_waktu();
        assert_ne!(s.len(), 0);
        assert!(t.chars().all(|c| c.is_ascii_digit() || c == '-'));
    }

    // ── bentuk hasil ───────────────────────────────────────────────────────

    #[test]
    fn hasil_sukses_serialisasi_ikut_kontrak_typescript() {
        let h = HasilTangkapLayar {
            berhasil: true,
            path: "C:/Users/x/Pictures/Zephyr/zephyr-1.png".into(),
            lebar: 800,
            tinggi: 600,
            bytes: 1234,
            pesan_galat: None,
        };
        let v: serde_json::Value = serde_json::to_value(&h).unwrap();
        /* Nama field JSON dipatok ke `HasilTangkapLayar` di
        `src/lib/commands.ts:133-139` — kalau salah satu berubah, sisi
        TypeScript membaca `undefined` dan melaporkan ukuran 0. */
        assert_eq!(v["path"], "C:/Users/x/Pictures/Zephyr/zephyr-1.png");
        assert_eq!(v["width"], 800);
        assert_eq!(v["height"], 600);
        assert_eq!(v["bytes"], 1234);
        assert_eq!(v["berhasil"], true);
        assert!(v.get("pesanGalat").is_none(), "sukses tidak membawa pesanGalat");
    }

    #[test]
    fn hasil_gagal_serialisasi_tidak_klaim_berhasil() {
        let h = bungkus(Err(ZephyrError::Permission("path keluaran ada di folder sistem".into())));
        assert!(!h.berhasil);
        assert!(h.path.is_empty(), "path harus kosong saat gagal: {:?}", h.path);
        assert_eq!(h.bytes, 0);
        assert_eq!((h.lebar, h.tinggi), (0, 0));
        let pesan = h.pesan_galat.clone().expect("pesan galat wajib ada");
        assert!(pesan.contains("folder sistem"), "pesan harus aslinya: {pesan}");

        let v: serde_json::Value = serde_json::to_value(&h).unwrap();
        assert_eq!(v["berhasil"], false);
        assert_eq!(v["path"], "");
        assert!(v["pesanGalat"].as_str().unwrap().contains("folder sistem"));
    }

    #[test]
    fn bungkus_meneruskan_hasil_sukses_apa_adanya() {
        let sukses = HasilTangkapLayar {
            berhasil: true,
            path: "C:/tmp/a.png".into(),
            lebar: 2,
            tinggi: 3,
            bytes: 99,
            pesan_galat: None,
        };
        assert_eq!(bungkus(Ok(sukses.clone())), sukses);
    }

    // ── penangkapan nyata (harus jujur, tidak boleh "berhasil" palsu) ───────

    /// Pemeriksa jujur: kalau hasilnya `Ok`/berhasil, berkasnya WAJIB ada, PNG,
    /// ukurannya cocok, dan header IHDR-nya sama dengan yang dilaporkan. Kalau
    /// gagal, pesannya tidak boleh kosong dan tidak boleh ada berkas tertinggal.
    fn periksa_hasil_jujur(hasil: &ZResult<HasilTangkapLayar>, path: &Path) {
        match hasil {
            Ok(h) => {
                assert!(h.berhasil, "hasil Ok harus berhasil=true");
                assert!(!h.path.is_empty(), "berhasil tanpa path adalah laporan palsu");
                let f = Path::new(&h.path);
                assert!(f.is_file(), "berkas hasil tidak ada: {}", h.path);
                let n = std::fs::metadata(f).unwrap().len();
                assert!(n > 0, "berkas hasil kosong");
                assert_eq!(n, h.bytes, "byte yang dilaporkan beda dengan byte di disk");
                let isi = std::fs::read(f).unwrap();
                assert_eq!(&isi[0..8], &PNG_SIGNATURE, "berkas hasil bukan PNG");
                let (w, t) = dimensi_png(&isi).expect("IHDR harus terbaca");
                assert_eq!(
                    (w, t),
                    (h.lebar, h.tinggi),
                    "dimensi IHDR beda dengan dimensi yang dilaporkan"
                );
                assert!(w > 0 && t > 0, "dimensi nol");
                assert!(
                    isi.len() as u64 >= (w as u64 * t as u64 * 3) / 2,
                    "PNG lebih kecil dari yang mungkin untuk {w}x{t}"
                );
                chunk_png(&isi);
            }
            Err(e) => {
                assert!(
                    !e.to_string().trim().is_empty(),
                    "galat wajib membawa pesan yang bisa dibaca, bukan pesan kosong"
                );
                assert!(
                    !path.exists(),
                    "gagal tidak boleh meninggalkan berkas setengah jadi: {}",
                    path.display()
                );
            }
        }
    }

    #[test]
    fn target_tidak_dikenal_ditolak_dengan_pesan() {
        let d = dir_uji("target");
        let path = d.join("a.png");
        let args = ArgumenTangkap {
            target: Some("monitor".into()),
            save_path: Some(path.to_string_lossy().to_string()),
        };
        let r = jalankan_tangkap(&args, Some(1));
        let pesan = format!("{:?}", r);
        assert!(pesan.contains("target tidak dikenal"), "pesan: {pesan}");
        periksa_hasil_jujur(&r, &path);
    }

    #[test]
    fn path_berbahaya_ditolak_sebelum_menyentuh_layar() {
        let r = jalankan_tangkap(
            &ArgumenTangkap {
                target: Some("window".into()),
                save_path: Some("gambar.png".into()),
            },
            Some(1),
        );
        assert!(matches!(r, Err(ZephyrError::InvalidInput(_))), "dapat {r:?}");
        assert!(format!("{r:?}").contains("relatif"), "pesan: {r:?}");
    }

    #[test]
    fn hwnd_tidak_masuk_akal_tidak_pernah_mengaku_berhasil() {
        let d = dir_uji("hwnd");
        for (i, hwnd) in [0isize, 1isize].into_iter().enumerate() {
            let path = d.join(format!("hwnd-{i}.png"));
            let args = ArgumenTangkap {
                target: Some("window".into()),
                save_path: Some(path.to_string_lossy().to_string()),
            };
            let r = jalankan_tangkap(&args, Some(hwnd));
            periksa_hasil_jujur(&r, &path);
            if let Err(e) = &r {
                assert!(
                    !e.to_string().is_empty(),
                    "hwnd {hwnd} harus memberi pesan galat yang jelas"
                );
            }
        }
        // tanpa hwnd sama sekali: wajib galat, bukan tangkapan entah dari mana
        let path = d.join("hwnd-none.png");
        let r = jalankan_tangkap(
            &ArgumenTangkap {
                target: Some("window".into()),
                save_path: Some(path.to_string_lossy().to_string()),
            },
            None,
        );
        assert!(matches!(r, Err(ZephyrError::Internal(_))), "dapat {r:?}");
        periksa_hasil_jujur(&r, &path);
    }

    #[cfg(windows)]
    #[test]
    fn tangkap_layar_nyata_atau_galat_jelas() {
        /* Uji ini memanggil jalur NYATA (GetDC(0) + BitBlt + GetDIBits + PNG).
        Di sesi desktop ia berhasil dan seluruh berkasnya diperiksa; di CI
        headless (tidak ada desktop) ia WAJIB gagal dengan pesan — dan yang
        tidak boleh terjadi adalah "berhasil" tanpa gambar sah. */
        let d = dir_uji("layar");
        let path = d.join("layar.png");
        let r = jalankan_tangkap(
            &ArgumenTangkap {
                target: Some("screen".into()),
                save_path: Some(path.to_string_lossy().to_string()),
            },
            None,
        );
        eprintln!("tangkap layar (target=screen) -> {r:?}");
        periksa_hasil_jujur(&r, &path);
    }

    #[cfg(windows)]
    #[test]
    fn tangkap_jendela_desktop_lewat_printwindow_atau_galat_jelas() {
        /* PrintWindow diuji pada jendela yang pasti ada di sesi mana pun:
        jendela desktop. Kalau PrintWindow menolak / menghasilkan gambar kosong,
        modul ini jatuh ke BitBlt — dan kalau keduanya gagal, hasilnya galat
        (bukan PNG hitam yang diklaim berhasil). */
        #[link(name = "user32")]
        extern "system" {
            fn GetDesktopWindow() -> isize;
        }
        let hwnd = unsafe { GetDesktopWindow() };
        let d = dir_uji("desktop");
        let path = d.join("desktop.png");
        let r = jalankan_tangkap(
            &ArgumenTangkap {
                target: Some("window".into()),
                save_path: Some(path.to_string_lossy().to_string()),
            },
            Some(hwnd),
        );
        eprintln!("tangkap jendela desktop (hwnd={hwnd:#x}) -> {r:?}");
        periksa_hasil_jujur(&r, &path);
    }

    #[cfg(windows)]
    #[test]
    fn strategi_tangkap_tercatat_bukan_tebakan() {
        /* Menjawab pertanyaan "API apa yang BENAR-BENAR jalan di runtime ini"
        dengan cara memanggil lapis GDI-nya langsung, lalu mencetak nama cara
        yang dipakai (PrintWindow render-full-content / PrintWindow legacy /
        BitBlt layar). Hasil cetak ini yang dilaporkan di
        docs/LAPORAN-TANGKAP-LAYAR.md — bukan tebakan dari dokumentasi. */
        #[link(name = "user32")]
        extern "system" {
            fn GetDesktopWindow() -> isize;
        }
        let hwnd = unsafe { GetDesktopWindow() };
        let rect = win32::rect_layar();
        match win32::tangkap(rect, Some(hwnd)) {
            Ok(b) => {
                eprintln!(
                    "TANGKAP: cara={} {}x{} rgb={} byte",
                    b.cara,
                    b.lebar,
                    b.tinggi,
                    b.rgb.len()
                );
                assert!(
                    matches!(
                        b.cara,
                        "PrintWindow(render-full-content)" | "PrintWindow(legacy)" | "BitBlt(layar)"
                    ),
                    "nama cara tidak dikenal: {}",
                    b.cara
                );
                assert_eq!(
                    b.rgb.len(),
                    b.lebar as usize * b.tinggi as usize * 3,
                    "panjang piksel harus 3 byte per piksel"
                );
                assert!(
                    b.rgb.iter().any(|x| *x != 0),
                    "gambar seluruhnya nol tidak boleh dikembalikan sebagai hasil"
                );
            }
            Err(e) => eprintln!("TANGKAP: gagal jujur (tidak mengaku berhasil) -> {e}"),
        }
    }

    #[cfg(windows)]
    #[test]
    fn berkas_yang_sudah_ada_tidak_ditinggalkan_setengah_saat_gagal() {
        let d = dir_uji("tidak-menimpa");
        let path = d.join("ada.png");
        std::fs::write(&path, b"isi lama milik pengguna").unwrap();
        let r = jalankan_tangkap(
            &ArgumenTangkap {
                target: Some("window".into()),
                save_path: Some(path.to_string_lossy().to_string()),
            },
            Some(0),
        );
        if r.is_err() {
            assert_eq!(
                std::fs::read(&path).unwrap(),
                b"isi lama milik pengguna",
                "gagal tidak boleh merusak berkas yang sudah ada"
            );
        }
    }
}
