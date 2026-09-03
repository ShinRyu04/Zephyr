// history.rs — Local History / Timeline (fase 26).
//
// KEPUTUSAN ARSITEKTUR
//
// 1. Snapshot disimpan sebagai FILE UTUH, bukan diff/delta. Ini safety-net
//    lokal, bukan VCS: file yang di-edit manusia jarang > beberapa ratus KB,
//    dan menyimpan isi utuh membuat restore tidak bisa gagal karena rantai
//    delta rusak. Batas ukuran + retention yang menjaga disk, bukan delta.
//
// 2. Nama folder per file = hash BLAKE3 dari path absolut yang sudah
//    dinormalisasi (huruf kecil). Alasannya bukan keamanan: path Windows
//    memuat `:` dan `\` yang tidak boleh jadi nama folder, panjangnya bisa
//    lewat MAX_PATH, dan LSP/Explorer memberi bentuk drive yang berbeda
//    (`d:\x` vs `D:/x`) untuk file yang SAMA — hash setelah normalisasi
//    membuat ketiganya jatuh ke satu folder. Ini masalah yang sama dengan
//    src/lib/pathKey.ts di frontend.
//
// 3. Nama file snapshot = `<timestamp_ms>__<reason>.snap`. Timestamp di depan
//    supaya urutan leksikografis = urutan waktu, jadi tidak perlu membaca
//    metadata untuk mengurutkan Timeline.
//
// 4. Dedup memakai hash isi, bukan perbandingan byte: `meta.json` menyimpan
//    hash snapshot terakhir, jadi save berulang tanpa perubahan tidak perlu
//    membaca kembali file snapshot dari disk.
//
// KEAMANAN
// - Snapshot HANYA untuk file di dalam workspace (atau yang sudah lolos
//   dialog). Tanpa itu, membuka file mana pun di disk akan menyalinnya ke
//   %APPDATA%, termasuk file yang tidak diminta user.
// - Restore TIDAK menulis ke disk. Ia hanya mengembalikan konten; editor
//   menandainya dirty dan user yang memutuskan save. Brief 26 tegas soal ini.

use crate::app_state::AppState;
use crate::errors::{ZResult, ZephyrError};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::State;

/// Batas ukuran file yang boleh di-snapshot (brief: mis. 5MB).
const BATAS_BYTE: u64 = 5 * 1024 * 1024;

/// Jumlah byte awal yang diperiksa untuk menebak biner.
const CEK_BINER_BYTE: usize = 8192;

/// Alasan snapshot dibuat.
fn reason_valid(r: &str) -> bool {
    matches!(r, "save" | "before-rename" | "manual" | "before-restore")
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct MetaFile {
    /// path absolut asli (untuk diagnosa & pembersihan folder yatim)
    path: String,
    /// hash isi snapshot terakhir — dasar dedup
    hash_terakhir: String,
    /// jumlah snapshot yang pernah dibuat (termasuk yang sudah dipangkas)
    total: u64,
}

/// Satu entri Timeline yang berasal dari Local History.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    /// id = nama file snapshot, dipakai untuk membaca/restore
    pub id: String,
    pub timestamp_ms: u64,
    pub reason: String,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryInfo {
    /// folder history untuk file ini (kosong bila belum ada)
    pub dir: String,
    pub snapshots: Vec<Snapshot>,
    /// alasan file ini TIDAK di-snapshot ('' = boleh)
    pub skip: String,
}

/// Normalisasi path untuk kunci hash.
///
/// Harus cocok dengan `kunciPath()` di src/lib/pathKey.ts: pisah `\` → `/`,
/// huruf kecil semua. Tanpa ini `D:/a/b.ts` dan `d:\a\b.ts` menghasilkan dua
/// folder history untuk satu file yang sama.
fn kunci_path(p: &Path) -> String {
    p.to_string_lossy().replace('\\', "/").to_lowercase()
}

/// Nama folder history untuk sebuah file absolut.
pub fn folder_untuk(p: &Path) -> String {
    blake3::hash(kunci_path(p).as_bytes()).to_hex()[..32].to_string()
}

fn root_history(state: &AppState) -> PathBuf {
    state.data_dir.join("history")
}

fn dir_untuk(state: &AppState, p: &Path) -> PathBuf {
    root_history(state).join(folder_untuk(p))
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Tebak biner: ada byte NUL di awal file, atau bukan UTF-8 yang valid.
///
/// Cek NUL saja tidak cukup (file UTF-16 tanpa NUL di 8KB pertama lolos),
/// tapi cek UTF-8 penuh pada file besar mahal — dua-duanya dipakai pada
/// potongan awal saja, dan itu memang cukup untuk memutuskan "layak
/// disimpan sebagai teks atau tidak".
pub fn tampak_biner(buf: &[u8]) -> bool {
    let n = buf.len().min(CEK_BINER_BYTE);
    let awal = &buf[..n];
    if awal.contains(&0) {
        return true;
    }
    // Potongan bisa memotong karakter multi-byte di ujung; toleransi 4 byte.
    match std::str::from_utf8(awal) {
        Ok(_) => false,
        Err(e) => e.valid_up_to() + 4 < n,
    }
}

/// Alasan sebuah file tidak boleh di-snapshot ('' = boleh).
fn alasan_skip(isi: &[u8], ukuran: u64) -> String {
    if ukuran > BATAS_BYTE {
        return format!(
            "ukuran {:.1} MB melewati batas {:.0} MB",
            ukuran as f64 / 1048576.0,
            BATAS_BYTE as f64 / 1048576.0
        );
    }
    if tampak_biner(isi) {
        return "tampak biner (bukan teks)".into();
    }
    String::new()
}

fn baca_meta(dir: &Path) -> MetaFile {
    std::fs::read_to_string(dir.join("meta.json"))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn tulis_meta(dir: &Path, m: &MetaFile) {
    if let Ok(s) = serde_json::to_string_pretty(m) {
        let _ = std::fs::write(dir.join("meta.json"), s);
    }
}

/// Daftar snapshot dalam satu folder, terbaru DI DEPAN.
fn daftar_snapshot(dir: &Path) -> Vec<Snapshot> {
    let mut out = Vec::new();
    let Ok(rd) = std::fs::read_dir(dir) else {
        return out;
    };
    for e in rd.flatten() {
        let nama = e.file_name().to_string_lossy().to_string();
        if !nama.ends_with(".snap") {
            continue;
        }
        // <ts>__<reason>.snap
        let inti = nama.trim_end_matches(".snap");
        let (ts, reason) = match inti.split_once("__") {
            Some((a, b)) => (a.parse::<u64>().unwrap_or(0), b.to_string()),
            None => (0, "save".to_string()),
        };
        let size = e.metadata().map(|m| m.len()).unwrap_or(0);
        out.push(Snapshot {
            id: nama,
            timestamp_ms: ts,
            reason,
            size,
        });
    }
    out.sort_by(|a, b| b.timestamp_ms.cmp(&a.timestamp_ms));
    out
}

/// Pangkas snapshot: sisakan `maks` terbaru DAN buang yang lebih tua dari
/// `hari` (0 = tanpa batas umur).
fn pangkas(dir: &Path, maks: usize, hari: u64) -> usize {
    let list = daftar_snapshot(dir);
    let mut hapus: Vec<String> = Vec::new();

    if maks > 0 && list.len() > maks {
        for s in list.iter().skip(maks) {
            hapus.push(s.id.clone());
        }
    }
    if hari > 0 {
        let batas = now_ms().saturating_sub(hari * 86_400_000);
        for s in &list {
            if s.timestamp_ms < batas && !hapus.contains(&s.id) {
                hapus.push(s.id.clone());
            }
        }
    }
    // Snapshot paling baru TIDAK boleh ikut terhapus walau tua: kalau semuanya
    // hilang, satu-satunya salinan sebelum edit terakhir ikut lenyap.
    if let Some(terbaru) = list.first() {
        hapus.retain(|id| id != &terbaru.id);
    }
    for id in &hapus {
        let _ = std::fs::remove_file(dir.join(id));
    }
    hapus.len()
}

/// Validasi bahwa file boleh diakses history (di dalam workspace / whitelist).
fn izinkan(state: &AppState, p: &Path) -> ZResult<PathBuf> {
    let abs = if p.is_absolute() {
        p.to_path_buf()
    } else {
        state
            .workspace_path()
            .ok_or_else(|| ZephyrError::InvalidInput("belum ada workspace".into()))?
            .join(p)
    };
    let di_dalam = state
        .workspace_path()
        .and_then(|w| std::fs::canonicalize(w).ok())
        .zip(std::fs::canonicalize(&abs).ok())
        .map(|(w, f)| f.starts_with(&w))
        .unwrap_or(false);
    if !di_dalam {
        // ensure_writable memakai whitelist dialog yang sama dengan fs_ops —
        // file yang user buka lewat dialog tetap boleh punya history.
        state.ensure_writable(&abs)?;
    }
    Ok(abs)
}

// ───────────────────────── command ─────────────────────────

/// Buat snapshot sebuah file. Mengembalikan id snapshot, atau '' bila di-skip.
#[tauri::command(async)]
pub fn history_snapshot(
    state: State<AppState>,
    path: String,
    reason: Option<String>,
    max_per_file: Option<usize>,
    max_days: Option<u64>,
) -> ZResult<serde_json::Value> {
    let reason = reason.unwrap_or_else(|| "save".to_string());
    if !reason_valid(&reason) {
        return Err(ZephyrError::InvalidInput(format!(
            "reason \"{reason}\" tidak dikenal"
        )));
    }
    let abs = izinkan(&state, Path::new(&path))?;
    let meta_fs = std::fs::metadata(&abs)
        .map_err(|e| ZephyrError::InvalidInput(format!("tidak bisa membaca {path}: {e}")))?;
    if !meta_fs.is_file() {
        return Err(ZephyrError::InvalidInput(format!("{path} bukan file")));
    }
    let ukuran = meta_fs.len();

    // File besar tidak dibaca seluruhnya hanya untuk ditolak.
    if ukuran > BATAS_BYTE {
        return Ok(serde_json::json!({
            "id": "",
            "skip": alasan_skip(&[], ukuran),
        }));
    }
    let isi = std::fs::read(&abs)?;
    let skip = alasan_skip(&isi, ukuran);
    if !skip.is_empty() {
        return Ok(serde_json::json!({ "id": "", "skip": skip }));
    }

    let dir = dir_untuk(&state, &abs);
    std::fs::create_dir_all(&dir)?;
    let mut meta = baca_meta(&dir);
    meta.path = abs.to_string_lossy().to_string();

    let hash = blake3::hash(&isi).to_hex().to_string();
    if hash == meta.hash_terakhir {
        // Dedup: isi identik snapshot terakhir → tidak ada gunanya menyimpan.
        return Ok(serde_json::json!({ "id": "", "skip": "isi identik snapshot terakhir" }));
    }

    let id = format!("{}__{}.snap", now_ms(), reason);
    std::fs::write(dir.join(&id), &isi)?;
    meta.hash_terakhir = hash;
    meta.total += 1;
    tulis_meta(&dir, &meta);

    let dibuang = pangkas(&dir, max_per_file.unwrap_or(50), max_days.unwrap_or(30));

    Ok(serde_json::json!({
        "id": id,
        "skip": "",
        "dibuang": dibuang,
        "total": meta.total,
    }))
}

/// Daftar snapshot sebuah file (terbaru di depan).
#[tauri::command]
pub fn history_list(state: State<AppState>, path: String) -> ZResult<HistoryInfo> {
    let abs = izinkan(&state, Path::new(&path))?;
    let dir = dir_untuk(&state, &abs);
    let skip = match std::fs::metadata(&abs) {
        Ok(m) if m.len() > BATAS_BYTE => alasan_skip(&[], m.len()),
        Ok(_) => {
            // Baca potongan awal saja untuk menebak biner.
            let mut buf = vec![0u8; CEK_BINER_BYTE];
            use std::io::Read;
            let n = std::fs::File::open(&abs)
                .and_then(|mut f| f.read(&mut buf))
                .unwrap_or(0);
            buf.truncate(n);
            if tampak_biner(&buf) {
                "tampak biner (bukan teks)".to_string()
            } else {
                String::new()
            }
        }
        Err(_) => String::new(),
    };
    Ok(HistoryInfo {
        dir: if dir.is_dir() {
            dir.to_string_lossy().to_string()
        } else {
            String::new()
        },
        snapshots: daftar_snapshot(&dir),
        skip,
    })
}

/// Isi satu snapshot (untuk diff / restore).
#[tauri::command]
pub fn history_read(state: State<AppState>, path: String, id: String) -> ZResult<String> {
    // `id` datang dari frontend: WAJIB dicek tidak memuat pemisah path,
    // kalau tidak `../../secrets.json` bisa dibaca lewat command ini.
    if id.contains('/') || id.contains('\\') || id.contains("..") || !id.ends_with(".snap") {
        return Err(ZephyrError::InvalidInput(format!(
            "id snapshot tidak valid: {id}"
        )));
    }
    let abs = izinkan(&state, Path::new(&path))?;
    let f = dir_untuk(&state, &abs).join(&id);
    let isi = std::fs::read(&f)
        .map_err(|e| ZephyrError::InvalidInput(format!("snapshot {id} tidak terbaca: {e}")))?;
    Ok(String::from_utf8_lossy(&isi).to_string())
}

/// Hapus seluruh history sebuah file.
#[tauri::command]
pub fn history_clear(state: State<AppState>, path: String) -> ZResult<usize> {
    let abs = izinkan(&state, Path::new(&path))?;
    let dir = dir_untuk(&state, &abs);
    let n = daftar_snapshot(&dir).len();
    let _ = std::fs::remove_dir_all(&dir);
    Ok(n)
}

/// Pangkas paksa (dipakai saat setting retention berubah + harness).
#[tauri::command]
pub fn history_prune(
    state: State<AppState>,
    path: String,
    max_per_file: usize,
    max_days: u64,
) -> ZResult<usize> {
    let abs = izinkan(&state, Path::new(&path))?;
    let dir = dir_untuk(&state, &abs);
    Ok(pangkas(&dir, max_per_file, max_days))
}

/// Statistik seluruh history (Settings: "berapa disk yang dipakai").
#[tauri::command]
pub fn history_stats(state: State<AppState>) -> ZResult<serde_json::Value> {
    let root = root_history(&state);
    let mut folder = 0u64;
    let mut berkas = 0u64;
    let mut byte = 0u64;
    if let Ok(rd) = std::fs::read_dir(&root) {
        for e in rd.flatten() {
            if !e.path().is_dir() {
                continue;
            }
            folder += 1;
            for s in daftar_snapshot(&e.path()) {
                berkas += 1;
                byte += s.size;
            }
        }
    }
    Ok(serde_json::json!({
        "root": root.to_string_lossy(),
        "folder": folder,
        "snapshot": berkas,
        "byte": byte,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kunci_path_menyatukan_tiga_bentuk_path() {
        // Bentuk dari Explorer, workspace store, dan LSP untuk file yang SAMA.
        let a = kunci_path(Path::new(r"D:\proj\src\a.ts"));
        let b = kunci_path(Path::new("D:/proj/src/a.ts"));
        let c = kunci_path(Path::new(r"d:\proj\src\a.ts"));
        assert_eq!(a, b);
        assert_eq!(b, c);
        assert_eq!(folder_untuk(Path::new(r"D:\proj\src\a.ts")).len(), 32);
        assert_eq!(
            folder_untuk(Path::new(r"D:\proj\src\a.ts")),
            folder_untuk(Path::new("d:/proj/src/a.ts")),
        );
    }

    #[test]
    fn folder_beda_untuk_file_beda() {
        assert_ne!(
            folder_untuk(Path::new("D:/a.ts")),
            folder_untuk(Path::new("D:/b.ts")),
        );
    }

    #[test]
    fn biner_terdeteksi_dari_nul_dan_utf8_rusak() {
        assert!(!tampak_biner(b"const a = 1;\n"));
        assert!(!tampak_biner("halo dunia — em dash".as_bytes()));
        assert!(tampak_biner(b"PK\x03\x04\x00\x00isi zip"));
        // 0xFF bukan awalan UTF-8 yang sah.
        let mut rusak = vec![0xFFu8; 64];
        rusak.extend_from_slice(b"teks");
        assert!(tampak_biner(&rusak));
    }

    #[test]
    fn alasan_skip_menyebut_ukuran() {
        let s = alasan_skip(b"kecil", BATAS_BYTE + 1);
        assert!(s.contains("melewati batas"), "{s}");
        assert!(alasan_skip(b"kecil", 5).is_empty());
    }

    #[test]
    fn reason_hanya_yang_dikenal() {
        assert!(reason_valid("save"));
        assert!(reason_valid("before-rename"));
        assert!(reason_valid("manual"));
        assert!(!reason_valid("sembarang"));
    }

    #[test]
    fn pangkas_menyisakan_terbaru_dan_membuang_kelebihan() {
        let dir = std::env::temp_dir().join(format!("zephyr-uji-hist-{}", now_ms()));
        std::fs::create_dir_all(&dir).unwrap();
        let dasar = now_ms();
        for i in 0..5u64 {
            std::fs::write(
                dir.join(format!("{}__save.snap", dasar + i)),
                format!("v{i}"),
            )
            .unwrap();
        }
        assert_eq!(daftar_snapshot(&dir).len(), 5);
        let buang = pangkas(&dir, 2, 0);
        assert_eq!(buang, 3);
        let sisa = daftar_snapshot(&dir);
        assert_eq!(sisa.len(), 2);
        // Terbaru harus yang bertahan, dan urutannya terbaru dulu.
        assert_eq!(sisa[0].timestamp_ms, dasar + 4);
        assert!(sisa[0].timestamp_ms > sisa[1].timestamp_ms);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn pangkas_umur_tidak_menghapus_satu_satunya_snapshot() {
        let dir = std::env::temp_dir().join(format!("zephyr-uji-hist2-{}", now_ms()));
        std::fs::create_dir_all(&dir).unwrap();
        // Timestamp jauh di masa lalu (1 Jan 2020) → lebih tua dari 30 hari.
        std::fs::write(dir.join("1577836800000__save.snap"), "tua").unwrap();
        let buang = pangkas(&dir, 50, 30);
        assert_eq!(buang, 0, "snapshot terakhir tidak boleh ikut terhapus");
        assert_eq!(daftar_snapshot(&dir).len(), 1);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn daftar_snapshot_mengurai_reason_dan_urut_waktu() {
        let dir = std::env::temp_dir().join(format!("zephyr-uji-hist3-{}", now_ms()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("1000__save.snap"), "a").unwrap();
        std::fs::write(dir.join("2000__manual.snap"), "bb").unwrap();
        std::fs::write(dir.join("3000__before-rename.snap"), "ccc").unwrap();
        // File bukan .snap harus diabaikan.
        std::fs::write(dir.join("meta.json"), "{}").unwrap();
        let l = daftar_snapshot(&dir);
        assert_eq!(l.len(), 3);
        assert_eq!(l[0].reason, "before-rename");
        assert_eq!(l[0].timestamp_ms, 3000);
        assert_eq!(l[2].reason, "save");
        assert_eq!(l[1].size, 2);
        std::fs::remove_dir_all(&dir).ok();
    }
}
