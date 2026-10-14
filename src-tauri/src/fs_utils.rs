use crate::app_state::AppState;
use crate::errors::{ZResult, ZephyrError};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::State;

const BOM: [u8; 3] = [0xEF, 0xBB, 0xBF];

const BOM_UTF16LE: [u8; 2] = [0xFF, 0xFE];
const BOM_UTF16BE: [u8; 2] = [0xFE, 0xFF];

pub const BIG_FILE_BYTES: u64 = 4 * 1024 * 1024;

pub fn map_fs_err(e: std::io::Error, path: &str) -> ZephyrError {
    match e.kind() {
        std::io::ErrorKind::NotFound => ZephyrError::NotFound(format!(
            "{path} is missing (it may have been deleted or moved)"
        )),
        std::io::ErrorKind::PermissionDenied => {
            ZephyrError::Permission(format!("{path} cannot be accessed"))
        }
        _ => ZephyrError::Io(format!("{path}: {e}")),
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadResult {
    pub content: String,
    pub detected_encoding: String,
    pub line_ending: String,

    pub read_only: bool,

    pub bytes: u64,

    pub note: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatResult {
    pub size: u64,
    pub is_dir: bool,

    pub mtime: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionTab {
    pub path: String,
    #[serde(default = "default_encoding")]
    pub encoding: String,
    /*
     * `serde(default)` so a session.json written by an older build — which has
     * no `pinned` key — still parses. Without it every saved session would fail
     * to deserialize into an empty list, and an upgrade would silently lose the
     * reader's open files.
     *
     * Preview tabs are never written (the frontend filters them out), so this
     * flag is only ever true for a tab the reader deliberately pinned.
     */
    #[serde(default)]
    pub pinned: bool,
}

fn default_encoding() -> String {
    "utf8".to_string()
}

fn detect_line_ending(s: &str) -> &'static str {
    if s.contains("\r\n") {
        "crlf"
    } else {
        "lf"
    }
}

fn decode_bytes(bytes: &[u8], forced: Option<&str>) -> ZResult<(String, String)> {
    if let Some(enc) = forced {
        match enc {
            "ansi" => {
                let (cow, _, _) = encoding_rs::WINDOWS_1252.decode(bytes);
                return Ok((cow.into_owned(), "ansi".into()));
            }
            "utf8" | "utf8-bom" => {}

            "utf16le" => {
                let body = if bytes.len() >= 2 && bytes[0..2] == BOM_UTF16LE {
                    &bytes[2..]
                } else {
                    bytes
                };
                let (cow, _, _) = encoding_rs::UTF_16LE.decode(body);
                return Ok((cow.into_owned(), "utf16le".into()));
            }
            "utf16be" => {
                let body = if bytes.len() >= 2 && bytes[0..2] == BOM_UTF16BE {
                    &bytes[2..]
                } else {
                    bytes
                };
                let (cow, _, _) = encoding_rs::UTF_16BE.decode(body);
                return Ok((cow.into_owned(), "utf16be".into()));
            }
            other => return Err(ZephyrError::Encoding(format!("unknown encoding: {other}"))),
        }
    }

    if bytes.len() >= 2 {
        if bytes[0..2] == BOM_UTF16LE {
            let (cow, _, _) = encoding_rs::UTF_16LE.decode(&bytes[2..]);
            return Ok((cow.into_owned(), "utf16le".into()));
        }
        if bytes[0..2] == BOM_UTF16BE {
            let (cow, _, _) = encoding_rs::UTF_16BE.decode(&bytes[2..]);
            return Ok((cow.into_owned(), "utf16be".into()));
        }
    }

    let has_bom = bytes.len() >= 3 && bytes[0..3] == BOM;
    let body = if has_bom { &bytes[3..] } else { bytes };

    match std::str::from_utf8(body) {
        Ok(s) => Ok((
            s.to_string(),
            if has_bom {
                "utf8-bom".into()
            } else {
                "utf8".into()
            },
        )),
        Err(_) => {
            let (cow, _, _) = encoding_rs::WINDOWS_1252.decode(bytes);
            Ok((cow.into_owned(), "ansi".into()))
        }
    }
}

fn encode_string(content: &str, encoding: &str, line_ending: &str) -> ZResult<Vec<u8>> {
    let normalized = content.replace("\r\n", "\n");
    let text = if line_ending == "crlf" {
        normalized.replace('\n', "\r\n")
    } else {
        normalized
    };

    match encoding {
        "utf8" => Ok(text.into_bytes()),
        "utf8-bom" => {
            let mut out = BOM.to_vec();
            out.extend_from_slice(text.as_bytes());
            Ok(out)
        }
        "ansi" => {
            let (cow, _, had_errors) = encoding_rs::WINDOWS_1252.encode(&text);
            if had_errors {
                return Err(ZephyrError::Encoding(
                    "content contains characters that are not in Windows-1252 (ANSI); \
                     save as UTF-8"
                        .into(),
                ));
            }
            Ok(cow.into_owned())
        }

        "utf16le" | "utf16be" => Err(ZephyrError::Encoding(
            "UTF-16 file opened read-only  Euse \"Save as UTF-8\" to edit it".into(),
        )),
        other => Err(ZephyrError::Encoding(format!("unknown encoding: {other}"))),
    }
}

fn mtime_ms(meta: &std::fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/**
 * Batas ukuran berkas yang boleh dibaca bulat-bulat.
 *
 * Sama dengan batas yang dipakai `fs_read`, supaya kedua jalur membaca
 * memperlakukan berkas besar dengan cara yang sama - dua batas berbeda untuk
 * hal yang sama hanya menghasilkan kejutan di kemudian hari.
 */
pub const MAX_READ_BYTES: u64 = 32 * 1024 * 1024;

pub fn read_file_detect(path: &Path) -> ZResult<ReadResult> {
    /*
     * Diperiksa SEBELUM membaca, bukan sesudah.
     *
     * `std::fs::read` menyerap seluruh berkas ke memori, lalu `decode_bytes`
     * membuat salinan kedua, dan `raw.replace` salinan ketiga. Berkas 500MB
     * jadi lonjakan beberapa GB dan UI membeku - dan pada berkas yang lebih
     * besar lagi, prosesnya bisa mati.
     *
     * Versi sebelumnya tidak memeriksa apa pun. `fs_read` sudah memeriksa, tapi
     * `replace_in_file` dan `search_replace` memanggil fungsi ini langsung,
     * jadi keduanya bisa dipicu pengguna lewat "Replace All" pada berkas besar.
     *
     * Diperiksa dari metadata dulu supaya berkas raksasa tidak pernah tersentuh
     * sama sekali; ukuran sebenarnya tetap dicek setelah baca untuk berkas yang
     * bertambah besar di antara dua panggilan.
     */
    let meta = std::fs::metadata(path)?;
    if meta.len() > MAX_READ_BYTES {
        return Err(crate::errors::ZephyrError::InvalidInput(format!(
            "berkas terlalu besar untuk diolah ({} MB, batas {} MB): {}",
            meta.len() / (1024 * 1024),
            MAX_READ_BYTES / (1024 * 1024),
            path.display()
        )));
    }

    let bytes = std::fs::read(path)?;
    if bytes.len() as u64 > MAX_READ_BYTES {
        return Err(crate::errors::ZephyrError::InvalidInput(format!(
            "berkas bertambah besar saat dibaca ({} MB, batas {} MB): {}",
            bytes.len() / (1024 * 1024),
            MAX_READ_BYTES / (1024 * 1024),
            path.display()
        )));
    }
    let (raw, detected) = decode_bytes(&bytes, None)?;
    let line_ending = detect_line_ending(&raw).to_string();
    let (read_only, note) = read_only_reason(bytes.len() as u64, &detected);
    Ok(ReadResult {
        content: raw.replace("\r\n", "\n"),
        detected_encoding: detected,
        line_ending,
        read_only,
        bytes: bytes.len() as u64,
        note,
    })
}

fn read_only_reason(len: u64, encoding: &str) -> (bool, String) {
    if encoding == "utf16le" || encoding == "utf16be" {
        return (
            true,
            "UTF-16 file  Eopened read-only; save as UTF-8 to edit".to_string(),
        );
    }
    if len > BIG_FILE_BYTES {
        return (
            true,
            format!(
                "large file ({:.1} MB)  Elightweight read-only mode",
                len as f64 / (1024.0 * 1024.0)
            ),
        );
    }
    (false, String::new())
}

/**
 * Batas ukuran isi yang boleh ditulis dalam SATU panggilan tulis
 * (`write_file`: `fs_write`/`fs_create_file`, plus penulisan ulang hasil
 * penggantian lewat `write_file_encoded`).
 *
 * Kenapa 64 MB (= 2 x `MAX_READ_BYTES`), bukan angka bulat yang lebih kecil:
 *
 * - Berkas terbesar yang NYATA ada di repo ini adalah
 *   `src-tauri/assets/cc-catalog.json` = 6.225.418 byte (5,94 MB), dan berkas
 *   teks terbesar sesudahnya `src/lib/i18n-extra.ts` = 1.711.491 byte (1,63 MB).
 *   Batas 64 MB memberi ruang ~10x di atas berkas nyata terbesar, jadi tidak
 *   ada berkas normal - dan tidak ada uji - yang bisa tersentuh batas ini.
 * - Yang dijaga adalah KEUTUHAN PUTAR-BALIK: apa yang bisa dibaca harus bisa
 *   ditulis kembali. Jalur baca menerima berkas sampai 32 MB (`MAX_READ_BYTES`)
 *   dan mengubah akhir baris (LF -> CRLF menambah 1 byte per baris). Pada
 *   berkas 32 MB yang seluruhnya baris pendek, hasil encode bisa mendekati dua
 *   kali ukuran aslinya, jadi 2 x MAX_READ_BYTES adalah batas terkecil yang
 *   masih menjamin setiap berkas yang bisa dibuka bisa disimpan kembali.
 * - Yang dicegah: satu panggilan agen yang menulis keluaran tak terbatas
 *   (mis. hasil `bash_run` 500 MB) tanpa peringatan apa pun.
 */
pub const MAKS_TULIS_BYTE: usize = 64 * 1024 * 1024;

/**
 * Menolak isi yang melampaui `MAKS_TULIS_BYTE`.
 *
 * Dipanggil SEBELUM apa pun ditulis, jadi berkas yang sudah ada tidak pernah
 * berubah saat penulisan ditolak. Pesannya menyebut ukuran yang diminta, batas,
 * dan berkasnya - supaya pengguna tahu persis apa yang harus dipecah.
 */
pub fn periksa_ukuran_tulis(path: &Path, panjang: usize) -> ZResult<()> {
    if panjang > MAKS_TULIS_BYTE {
        return Err(ZephyrError::InvalidInput(format!(
            "isi terlalu besar untuk ditulis ({panjang} byte, batas {MAKS_TULIS_BYTE} byte = {} MB): {} - pecah jadi beberapa berkas atau tulis sebagian",
            MAKS_TULIS_BYTE / (1024 * 1024),
            path.display()
        )));
    }
    Ok(())
}

pub fn write_file_encoded(
    path: &Path,
    content: &str,
    encoding: &str,
    line_ending: &str,
) -> ZResult<()> {
    let bytes = encode_string(content, encoding, line_ending)?;

    periksa_ukuran_tulis(path, bytes.len())?;
    std::fs::write(crate::paths::long_path(path), bytes)?;
    Ok(())
}

#[tauri::command(async)]
pub fn fs_read(
    state: State<AppState>,
    path: String,
    encoding: Option<String>,
) -> ZResult<ReadResult> {
    let p = state.resolve_ws(&PathBuf::from(&path));
    // Reads are confined to the workspace, registered roots, or paths that
    // the application explicitly allowed. Do not treat an absolute path as an
    // implicit permission grant.
    state.ensure_writable(&p)?;

    let p = crate::paths::long_path(&p);

    let meta = std::fs::metadata(&p).map_err(|e| map_fs_err(e, &path))?;
    if meta.is_dir() {
        return Err(ZephyrError::InvalidInput(format!("{path} adalah folder")));
    }

    if meta.len() > 32 * 1024 * 1024 {
        return Err(ZephyrError::InvalidInput(
            "file is larger than 32MB  Enot supported yet".into(),
        ));
    }

    let bytes = std::fs::read(&p).map_err(|e| map_fs_err(e, &path))?;
    let (raw, detected) = decode_bytes(&bytes, encoding.as_deref())?;
    let line_ending = detect_line_ending(&raw).to_string();
    let (read_only, note) = read_only_reason(meta.len(), &detected);

    state.allow_exact(&p);
    state.bump("fs_read");

    Ok(ReadResult {
        content: raw.replace("\r\n", "\n"),
        detected_encoding: detected,
        line_ending,
        read_only,
        bytes: meta.len(),
        note,
    })
}

#[allow(clippy::too_many_arguments)]
#[tauri::command(async)]
pub fn fs_write(
    state: State<AppState>,
    path: String,
    content: String,
    encoding: Option<String>,
    line_ending: Option<String>,
    was_existing: Option<bool>,
    allow_missing: Option<bool>,
) -> ZResult<()> {
    let p = state.resolve_ws(&PathBuf::from(&path));
    tulis_isi(
        &state,
        &p,
        &path,
        &content,
        encoding,
        line_ending,
        was_existing,
        allow_missing,
    )
}

/**
 * Badan `fs_write`, dipisah dari perintah supaya bisa diuji tanpa `State`.
 *
 * Perilaku tulisnya sendiri tidak berubah; yang ditambahkan hanya
 * `periksa_ukuran_tulis` yang dijalankan SEBELUM berkas disentuh.
 */
#[allow(clippy::too_many_arguments)]
pub fn tulis_isi(
    state: &AppState,
    p: &Path,
    label: &str,
    content: &str,
    encoding: Option<String>,
    line_ending: Option<String>,
    was_existing: Option<bool>,
    allow_missing: Option<bool>,
) -> ZResult<()> {
    state.ensure_writable(p)?;

    /*
     * Diperiksa pada panjang ISI, sebelum encoding dan sebelum apa pun
     * ditulis. Cek kedua (pada byte hasil encode) ada di `write_file_encoded`,
     * karena encoding bisa menambah byte (LF -> CRLF).
     */
    periksa_ukuran_tulis(p, content.len())?;

    let existing = std::fs::read(p).ok();

    if existing.is_none() && !allow_missing.unwrap_or(false) && was_existing.unwrap_or(false) {
        return Err(ZephyrError::NotFound(format!(
            "{label} is already missing on disk"
        )));
    }
    let (fallback_enc, fallback_le) = match &existing {
        Some(bytes) => {
            let (raw, enc) = decode_bytes(bytes, None)?;
            (enc, detect_line_ending(&raw).to_string())
        }
        None => ("utf8".to_string(), "crlf".to_string()),
    };

    let enc = encoding.unwrap_or(fallback_enc);
    let le = line_ending.unwrap_or(fallback_le);
    let bytes = encode_string(content, &enc, &le)?;
    let bytes_len = bytes.len();
    periksa_ukuran_tulis(p, bytes_len)?;

    if let Some(parent) = p.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            std::fs::create_dir_all(parent)?;
        }
    }
    std::fs::write(p, bytes)?;
    state.allow_exact(p);
    state.bump("fs_write");
    tracing::debug!(path = %state.label(p), bytes = bytes_len, enc = %enc, "fs_write");
    Ok(())
}

#[tauri::command(async)]
pub fn fs_exists(path: String) -> ZResult<bool> {
    Ok(crate::paths::long_path(Path::new(&path)).exists())
}

#[tauri::command(async)]
pub fn fs_stat(state: State<AppState>, path: String) -> ZResult<StatResult> {
    let p = state.resolve_ws(&PathBuf::from(&path));
    state.periksa_path_baca(&p)?;
    let meta = std::fs::metadata(crate::paths::long_path(&p)).map_err(|e| map_fs_err(e, &path))?;
    Ok(StatResult {
        size: meta.len(),
        is_dir: meta.is_dir(),
        mtime: mtime_ms(&meta),
    })
}

/**
 * Bentuk KANONIK sebuah jalur yang WAJIB masih di dalam `akar`.
 *
 * Dipisah dari perintahnya supaya bisa diuji tanpa `State` - pola yang sama
 * dengan `tulis_isi`. Yang penting di sini BUKAN penggantian garis miring,
 * melainkan `std::fs::canonicalize`: dialah yang menyelesaikan symlink dan
 * junction, sehingga `D:\ws\keluar\berkas.ts` yang `keluar`-nya menunjuk ke
 * luar akar keluar sebagai jalur tujuan yang sesungguhnya dan bukan sebagai
 * jalur yang kelihatan di dalam.
 *
 * `canonicalize` sengaja dipakai, bukan `paths::canonical_or_parent`: jalur
 * yang TIDAK ADA harus GAGAL. Pemanggilnya (`src/lib/bacaKode.ts`)
 * menerjemahkan kegagalan itu menjadi "berkas tidak ada"; kalau bentuknya
 * dikarang dari induknya, berkas hantu akan terlihat ada dan pagar di JS hanya
 * membandingkan jalur karangan.
 */
pub fn realpath_dalam_akar(akar: &Path, p: &Path, label: &str) -> ZResult<String> {
    if akar.as_os_str().is_empty() {
        /* Fail-closed: `paths::is_inside("", apa pun)` SELALU benar (path
         * kosong adalah awalan dari semua path), jadi akar kosong akan
         * meloloskan segalanya. Lebih baik menolak daripada memagari dengan
         * batas yang tidak ada. */
        return Err(ZephyrError::WorkspaceOutside(
            "akar workspace kosong: tidak ada batas yang bisa dipakai untuk memeriksa".into(),
        ));
    }
    let akar_nyata = crate::paths::canonical_or_parent(akar);
    let nyata = std::fs::canonicalize(crate::paths::long_path(p)).map_err(|e| map_fs_err(e, label))?;
    let nyata = crate::paths::strip_unc(&nyata);
    if !crate::paths::is_inside(&akar_nyata, &nyata) {
        return Err(ZephyrError::WorkspaceOutside(format!(
            "tautan menunjuk KELUAR akar workspace: {label} -> {}",
            nyata.to_string_lossy()
        )));
    }
    Ok(nyata.to_string_lossy().to_string())
}

/**
 * `fs_realpath` - bentuk kanonik sebuah jalur, symlink/junction SUDAH
 * diselesaikan, dan hasilnya DITOLAK kalau keluar dari akar workspace.
 *
 * Perintah ini ada karena jalur tool `zephyr_kode` butuh realpath yang
 * SUNGGUHAN: `src/lib/bacaKode.ts` membandingkan bentuk nyata berkas dengan
 * bentuk nyata akar, dan pagar itu hanya berarti kalau "bentuk nyata" bukan
 * jalur masukan yang dikembalikan apa adanya. Tanpa perintah ini satu-satunya
 * jawaban yang tersedia adalah identitas (`p => p`), dan identitas selalu
 * lolos: `D:/Zephyr/keluar/rahasia.ts` yang `keluar`-nya junction ke luar repo
 * tetap terlihat "di dalam D:/Zephyr".
 *
 * Dua lapis, dan keduanya perlu: `is_inside` di sini menolak pautan yang
 * keluar akar, sementara `bacaKode.ts` mengulang pemeriksaan yang sama
 * terhadap akar yang DIKETAHUINYA sendiri - kalau perintah ini dipanggil
 * dengan akar yang berbeda, penolakan tetap terjadi di sisi JS.
 */
#[tauri::command(async)]
pub fn fs_realpath(state: State<AppState>, path: String) -> ZResult<String> {
    let akar = state.workspace_path().ok_or_else(|| {
        ZephyrError::WorkspaceOutside(
            "tidak ada folder workspace terbuka: bentuk nyata jalur tidak bisa dipastikan".into(),
        )
    })?;
    let p = state.resolve_ws(&PathBuf::from(&path));
    let label = state.label(&p);
    let nyata = realpath_dalam_akar(&akar, &p, &label)?;
    state.bump("fs_realpath");
    Ok(nyata)
}

#[tauri::command(async)]
pub fn fs_create_file(
    state: State<AppState>,
    path: String,
    content: Option<String>,
) -> ZResult<()> {
    let p = state.resolve_ws(&PathBuf::from(&path));
    state.ensure_writable(&p)?;
    let lp = crate::paths::long_path(&p);
    if lp.exists() {
        return Err(ZephyrError::InvalidInput(format!("{path} already exists")));
    }
    if let Some(parent) = p.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(crate::paths::long_path(parent))?;
        }
    }

    let bytes = encode_string(&content.unwrap_or_default(), "utf8", "crlf")?;
    periksa_ukuran_tulis(&p, bytes.len())?;
    std::fs::write(&lp, bytes)?;
    Ok(())
}

#[tauri::command(async)]
pub fn fs_create_dir(state: State<AppState>, path: String) -> ZResult<()> {
    let p = state.resolve_ws(&PathBuf::from(&path));
    state.ensure_writable(&p)?;

    std::fs::create_dir_all(crate::paths::long_path(&p))?;
    Ok(())
}

#[tauri::command(async)]
pub fn fs_delete(state: State<AppState>, paths: Vec<String>, recursive: bool) -> ZResult<()> {
    if paths.is_empty() {
        return Err(ZephyrError::InvalidInput("empty path list".into()));
    }
    for path in &paths {
        let p = state.resolve_ws(&PathBuf::from(path));
        state.ensure_writable(&p)?;
        let meta = match std::fs::metadata(&p) {
            Ok(m) => m,
            Err(_) => continue,
        };
        if meta.is_dir() {
            if recursive {
                std::fs::remove_dir_all(&p)?;
            } else {
                std::fs::remove_dir(&p)?;
            }
        } else {
            std::fs::remove_file(&p)?;
        }
        tracing::info!(path = %state.label(&p), "fs_delete");
    }
    state.bump("fs_delete");
    Ok(())
}

#[tauri::command(async)]
pub fn fs_rename(state: State<AppState>, from: String, to: String) -> ZResult<()> {
    let a = state.resolve_ws(&PathBuf::from(&from));
    let b = state.resolve_ws(&PathBuf::from(&to));
    state.ensure_writable(&a)?;
    state.ensure_writable(&b)?;

    let la = crate::paths::long_path(&a);
    let lb = crate::paths::long_path(&b);
    if !la.exists() {
        return Err(ZephyrError::NotFound(from));
    }
    if lb.exists() {
        return Err(ZephyrError::InvalidInput(format!("{to} already exists")));
    }
    std::fs::rename(&la, &lb)?;
    tracing::info!(from = %state.label(&a), to = %state.label(&b), "fs_rename");
    Ok(())
}

#[tauri::command(async)]
pub fn session_load(state: State<AppState>) -> ZResult<Vec<SessionTab>> {
    let p = state.file("session.json");
    if !p.exists() {
        return Ok(vec![]);
    }
    let raw = std::fs::read_to_string(&p)?;
    let tabs: Vec<SessionTab> = serde_json::from_str(&raw).unwrap_or_default();

    Ok(tabs
        .into_iter()
        .filter(|t| Path::new(&t.path).exists())
        .collect())
}

#[tauri::command(async)]
pub fn session_save(state: State<AppState>, tabs: Vec<SessionTab>) -> ZResult<()> {
    let p = state.file("session.json");
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&p, serde_json::to_vec_pretty(&tabs)?)?;
    Ok(())
}

#[cfg(test)]
pub fn decode_for_test(bytes: &[u8], forced: Option<&str>) -> ZResult<(String, String)> {
    decode_bytes(bytes, forced)
}

#[cfg(test)]
pub fn encode_for_test(content: &str, encoding: &str, line_ending: &str) -> ZResult<Vec<u8>> {
    encode_string(content, encoding, line_ending)
}

#[cfg(test)]
pub fn detect_le_for_test(s: &str) -> &'static str {
    detect_line_ending(s)
}

/**
 * Uji batas ukuran tulis.
 *
 * Uji di bawah ini menjalankan `tulis_isi` yang SESUNGGUHNYA (badan `fs_write`),
 * bukan salinan logikanya: berkas benar-benar ditulis ke folder sementara, dan
 * untuk kasus penolakan berkas benar-benar dibaca ulang untuk membuktikan
 * isinya tidak berubah.
 */
#[cfg(test)]
mod uji_batas_tulis {
    use super::*;

    fn kerja(nama: &str) -> (AppState, PathBuf) {
        let akar = std::env::temp_dir().join(format!(
            "zephyr-batas-tulis-{nama}-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&akar);
        let ws = akar.join("ws");
        let data = akar.join("data");
        std::fs::create_dir_all(&ws).expect("buat workspace");
        std::fs::create_dir_all(&data).expect("buat data");
        let mut st = AppState::new();
        st.data_dir = data;
        st.set_workspace(crate::paths::canonical_or_parent(&ws))
            .expect("set workspace");
        (st, ws)
    }

    fn tulis(st: &AppState, p: &Path, isi: &str) -> ZResult<()> {
        tulis_isi(
            st,
            p,
            &p.to_string_lossy(),
            isi,
            Some("utf8".to_string()),
            Some("lf".to_string()),
            None,
            None,
        )
    }

    #[test]
    fn penjaga_ukuran_batas_bawah_atas() {
        let p = Path::new("D:/ws/berkas.txt");
        assert!(periksa_ukuran_tulis(p, 0).is_ok());
        assert!(periksa_ukuran_tulis(p, MAKS_TULIS_BYTE - 1).is_ok());
        assert!(periksa_ukuran_tulis(p, MAKS_TULIS_BYTE).is_ok());
        assert!(periksa_ukuran_tulis(p, MAKS_TULIS_BYTE + 1).is_err());

        let e = periksa_ukuran_tulis(p, MAKS_TULIS_BYTE + 1).expect_err("harus ditolak");
        let pesan = e.to_string();
        assert_eq!(e.code(), "InvalidInput");
        assert!(pesan.contains(&(MAKS_TULIS_BYTE + 1).to_string()), "{pesan}");
        assert!(pesan.contains("67108864"), "{pesan}");
        assert!(pesan.contains("berkas.txt"), "{pesan}");
    }

    #[test]
    fn tulis_di_bawah_batas_sukses() {
        let (st, ws) = kerja("bawah");
        let p = ws.join("kecil.txt");
        let isi = "halo dunia\nbaris kedua\n";
        tulis(&st, &p, isi).expect("tulis di bawah batas harus sukses");
        assert_eq!(std::fs::read_to_string(&p).unwrap(), isi);
        let _ = std::fs::remove_dir_all(ws.parent().unwrap());
    }

    #[test]
    fn tulis_tepat_di_batas_sukses() {
        let (st, ws) = kerja("tepat");
        let p = ws.join("tepat.txt");
        let isi = "a".repeat(MAKS_TULIS_BYTE);
        tulis(&st, &p, &isi).expect("tulis tepat di batas harus sukses");
        assert_eq!(
            std::fs::metadata(&p).unwrap().len() as usize,
            MAKS_TULIS_BYTE,
            "berkas harus persis sebesar batas"
        );
        let _ = std::fs::remove_dir_all(ws.parent().unwrap());
    }

    #[test]
    fn tulis_di_atas_batas_ditolak_dan_berkas_tidak_berubah() {
        let (st, ws) = kerja("atas");
        let p = ws.join("besar.txt");
        let lama = "isi lama yang harus utuh\n";
        std::fs::write(&p, lama).expect("siapkan berkas lama");

        let isi = "a".repeat(MAKS_TULIS_BYTE + 1);
        let e = tulis(&st, &p, &isi).expect_err("di atas batas harus ditolak");
        assert_eq!(e.code(), "InvalidInput");
        let pesan = e.to_string();
        assert!(pesan.contains("67108865"), "{pesan}");
        assert!(pesan.contains("besar.txt"), "{pesan}");

        assert_eq!(
            std::fs::read_to_string(&p).unwrap(),
            lama,
            "berkas lama tidak boleh berubah saat penulisan ditolak"
        );
        let _ = std::fs::remove_dir_all(ws.parent().unwrap());
    }

    #[test]
    fn penolakan_encode_dihitung_pada_byte_hasil_encode() {
        /*
         * Batas diukur pada BYTE HASIL ENCODE, bukan pada panjang string.
         * Buktinya dua panggilan dengan ISI YANG SAMA PERSIS:
         * - `lf`   -> byte hasil encode == panjang isi -> tepat di batas, sukses;
         * - `crlf` -> setiap '\n' menambah satu byte -> melewati batas, ditolak.
         * Kalau pemeriksaannya memakai panjang string saja, dua-duanya akan lolos
         * dan berkas CRLF akan menembus batas tanpa suara.
         */
        let (st, ws) = kerja("encode");
        let isi = format!(
            "{}{}",
            "\n".repeat(2000),
            "a".repeat(MAKS_TULIS_BYTE - 2000)
        );
        assert_eq!(isi.len(), MAKS_TULIS_BYTE);

        let p_crlf = ws.join("crlf.txt");
        let e = tulis_isi(
            &st,
            &p_crlf,
            &p_crlf.to_string_lossy(),
            &isi,
            Some("utf8".to_string()),
            Some("crlf".to_string()),
            None,
            None,
        )
        .expect_err("byte hasil encode di atas batas harus ditolak");
        assert_eq!(e.code(), "InvalidInput");
        assert!(!p_crlf.exists(), "tidak boleh ada berkas yang tertulis");

        let p_lf = ws.join("lf.txt");
        tulis_isi(
            &st,
            &p_lf,
            &p_lf.to_string_lossy(),
            &isi,
            Some("utf8".to_string()),
            Some("lf".to_string()),
            None,
            None,
        )
        .expect("isi yang sama dengan akhir baris lf tepat di batas harus sukses");
        assert_eq!(
            std::fs::metadata(&p_lf).unwrap().len() as usize,
            MAKS_TULIS_BYTE
        );
        let _ = std::fs::remove_dir_all(ws.parent().unwrap());
    }
}

/**
 * Uji `fs_realpath` / `realpath_dalam_akar` (item `baca-kode-realpath-symlink`).
 *
 * Yang diuji di sini PERILAKU NYATA terhadap filesystem: tautan folder dibuat
 * sungguhan di folder sementara, bukan disimulasikan dengan penggantian
 * string. Tautan dibuat lewat dua jalan - `symlink_dir` dulu, lalu
 * `cmd /C mklink /J` (junction tidak butuh hak istimewa di Windows) - supaya
 * ujinya tetap jalan di mesin tanpa mode developer.
 *
 * Kalau dua-duanya ditolak mesin, uji tautan mencetak CATATAN dan berhenti;
 * kasus non-tautan tetap jalan dan tetap merah kalau pagarnya rusak.
 */
#[cfg(test)]
mod uji_realpath {
    use super::*;

    fn base_kerja(nama: &str) -> PathBuf {
        let base = std::env::var_os("TMPDIR")
            .map(PathBuf::from)
            .unwrap_or_else(std::env::temp_dir);
        let dir = base.join(format!("zephyr-realpath-{nama}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("buat folder uji");
        dir
    }

    fn tulis(p: &Path, isi: &str) {
        if let Some(parent) = p.parent() {
            std::fs::create_dir_all(parent).expect("buat induk");
        }
        std::fs::write(p, isi).expect("tulis berkas uji");
    }

    /// Tautan folder yang sesungguhnya. `symlink_dir` butuh hak istimewa di
    /// Windows; `mklink /J` (junction) tidak.
    fn buat_tautan(target: &Path, link: &Path) -> Result<(), String> {
        #[cfg(windows)]
        {
            if std::os::windows::fs::symlink_dir(target, link).is_ok() {
                return Ok(());
            }
            let out = std::process::Command::new("cmd")
                .arg("/C")
                .arg("mklink")
                .arg("/J")
                .arg(link)
                .arg(target)
                .output()
                .map_err(|e| format!("mklink tidak bisa dijalankan: {e}"))?;
            if out.status.success() {
                return Ok(());
            }
            Err(format!(
                "symlink_dir dan mklink /J dua-duanya gagal: {}",
                String::from_utf8_lossy(&out.stderr).trim()
            ))
        }
        #[cfg(not(windows))]
        {
            std::os::unix::fs::symlink(target, link).map_err(|e| e.to_string())
        }
    }

    fn kanonik(p: &Path) -> String {
        crate::paths::strip_unc(&p.canonicalize().expect("kanonik"))
            .to_string_lossy()
            .to_string()
    }

    #[test]
    fn jalur_biasa_di_dalam_akar_mengembalikan_bentuk_kanonik() {
        let base = base_kerja("biasa");
        let akar = base.join("w");
        let f = akar.join("sub").join("ok.ts");
        tulis(&f, "halo");
        let berantakan = akar
            .join("sub")
            .join("..")
            .join("sub")
            .join(".")
            .join("ok.ts");

        let hasil = realpath_dalam_akar(&akar, &berantakan, "sub/ok.ts").expect("harus diterima");
        assert_eq!(hasil, kanonik(&f), "hasil harus bentuk kanonik berkas");
        assert!(
            crate::paths::is_inside(&akar, Path::new(&hasil)),
            "hasil harus di dalam akar: {hasil}"
        );
        assert_ne!(
            hasil,
            berantakan.to_string_lossy(),
            "hasil TIDAK boleh berupa jalur masukan apa adanya"
        );
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn jalur_di_luar_akar_ditolak() {
        let base = base_kerja("luar");
        let akar = base.join("w");
        let luar = base.join("luar");
        std::fs::create_dir_all(&akar).expect("akar");
        tulis(&luar.join("rahasia.ts"), "JANGAN SAMPAI KELUAR");

        let e = realpath_dalam_akar(&akar, &luar.join("rahasia.ts"), "rahasia.ts")
            .expect_err("jalur di luar akar harus ditolak");
        assert_eq!(e.code(), "WorkspaceOutside");
        assert!(e.to_string().contains("KELUAR akar workspace"), "{e}");
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn berkas_tidak_ada_ditolak_bukan_dikarang() {
        let base = base_kerja("hantu");
        let akar = base.join("w");
        std::fs::create_dir_all(&akar).expect("akar");

        let e = realpath_dalam_akar(&akar, &akar.join("tidak-ada.ts"), "tidak-ada.ts")
            .expect_err("berkas yang tidak ada harus ditolak");
        assert_eq!(e.code(), "NotFound");
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn akar_kosong_ditolak() {
        let base = base_kerja("akarkosong");
        let f = base.join("ok.ts");
        tulis(&f, "x");

        let e = realpath_dalam_akar(Path::new(""), &f, "ok.ts")
            .expect_err("akar kosong tidak boleh meloloskan apa pun");
        assert_eq!(e.code(), "WorkspaceOutside");
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn tautan_yang_menunjuk_keluar_akar_ditolak() {
        let base = base_kerja("tautanluar");
        let akar = base.join("w");
        let luar = base.join("luar");
        std::fs::create_dir_all(&akar).expect("akar");
        tulis(&luar.join("rahasia.ts"), "JANGAN SAMPAI KELUAR");

        let tautan = akar.join("keluar");
        if let Err(pesan) = buat_tautan(&luar, &tautan) {
            eprintln!(
                "CATATAN uji_realpath: tautan folder tidak bisa dibuat di mesin ini ({pesan}); \
                 kasus 'tautan keluar akar' LEWAT TAUTAN NYATA tidak terjalankan"
            );
            let _ = std::fs::remove_dir_all(&base);
            return;
        }
        eprintln!("uji_realpath: tautan folder NYATA dipakai ({})", tautan.display());

        /* Jalur yang KELIHATAN di dalam akar, tapi tautannya menunjuk keluar. */
        let lewat_tautan = tautan.join("rahasia.ts");
        assert!(
            crate::paths::is_inside(&akar, &lewat_tautan),
            "prasyarat uji: jalur mentahnya harus terlihat di dalam akar"
        );
        let e = realpath_dalam_akar(&akar, &lewat_tautan, "keluar/rahasia.ts")
            .expect_err("tautan keluar akar harus ditolak");
        assert_eq!(e.code(), "WorkspaceOutside");
        assert!(e.to_string().contains("KELUAR akar workspace"), "{e}");
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn tautan_yang_masih_di_dalam_akar_diterima_dan_dikanonikkan() {
        let base = base_kerja("tautandalam");
        let akar = base.join("w");
        let asli = akar.join("asli");
        tulis(&asli.join("ok.ts"), "ISI-DALAM");

        let tautan = akar.join("tautan");
        if let Err(pesan) = buat_tautan(&asli, &tautan) {
            eprintln!(
                "CATATAN uji_realpath: tautan folder tidak bisa dibuat di mesin ini ({pesan}); \
                 kasus 'tautan di dalam akar' LEWAT TAUTAN NYATA tidak terjalankan"
            );
            let _ = std::fs::remove_dir_all(&base);
            return;
        }

        let hasil = realpath_dalam_akar(&akar, &tautan.join("ok.ts"), "tautan/ok.ts")
            .expect("tautan yang masih di dalam akar harus diterima");
        assert_eq!(
            hasil,
            kanonik(&asli.join("ok.ts")),
            "hasil harus jalur TUJUAN, bukan jalur lewat tautan"
        );
        assert!(crate::paths::is_inside(&akar, Path::new(&hasil)));
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn akar_yang_sendiri_tautan_tetap_dinormalkan() {
        let base = base_kerja("akartautan");
        let akar_asli = base.join("akar-asli");
        tulis(&akar_asli.join("sub").join("ok.ts"), "x");

        let akar_tautan = base.join("akar-tautan");
        if let Err(pesan) = buat_tautan(&akar_asli, &akar_tautan) {
            eprintln!(
                "CATATAN uji_realpath: tautan folder tidak bisa dibuat di mesin ini ({pesan}); \
                 kasus 'akar lewat tautan' tidak terjalankan"
            );
            let _ = std::fs::remove_dir_all(&base);
            return;
        }

        /* Akar yang dipasang aplikasi bisa berupa tautan. Bentuk nyata akar
         * harus disamakan dulu, kalau tidak berkas di dalamnya akan terlihat
         * "keluar akar" hanya karena dua jalur menyebutnya dengan cara
         * berbeda. */
        let hasil = realpath_dalam_akar(&akar_tautan, &akar_asli.join("sub").join("ok.ts"), "sub/ok.ts")
            .expect("berkas di dalam akar (lewat tautan) harus diterima");
        assert_eq!(hasil, kanonik(&akar_asli.join("sub").join("ok.ts")));
        let _ = std::fs::remove_dir_all(&base);
    }
}
