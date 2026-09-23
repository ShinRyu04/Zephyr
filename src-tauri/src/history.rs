use crate::app_state::AppState;
use crate::errors::{ZResult, ZephyrError};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::State;

const BATAS_BYTE: u64 = 5 * 1024 * 1024;

const CEK_BINER_BYTE: usize = 8192;

fn reason_valid(r: &str) -> bool {
    matches!(
        r,
        "save" | "before-rename" | "manual" | "before-restore" | "before-replace"
    )
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct MetaFile {
    path: String,

    hash_terakhir: String,

    total: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub id: String,
    pub timestamp_ms: u64,
    pub reason: String,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryInfo {
    pub dir: String,
    pub snapshots: Vec<Snapshot>,

    pub skip: String,
}

fn kunci_path(p: &Path) -> String {
    p.to_string_lossy().replace('\\', "/").to_lowercase()
}

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

pub fn tampak_biner(buf: &[u8]) -> bool {
    let n = buf.len().min(CEK_BINER_BYTE);
    let awal = &buf[..n];
    if awal.contains(&0) {
        return true;
    }

    match std::str::from_utf8(awal) {
        Ok(_) => false,
        Err(e) => e.valid_up_to() + 4 < n,
    }
}

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

    if let Some(terbaru) = list.first() {
        hapus.retain(|id| id != &terbaru.id);
    }
    for id in &hapus {
        let _ = std::fs::remove_file(dir.join(id));
    }
    hapus.len()
}

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
        state.ensure_writable(&abs)?;
    }
    Ok(abs)
}

pub fn snapshot_internal(state: &AppState, path: &Path, reason: &str) -> ZResult<String> {
    if !reason_valid(reason) {
        return Err(ZephyrError::InvalidInput(format!(
            "reason \"{reason}\" tidak dikenal"
        )));
    }
    let abs = izinkan(state, path)?;
    let meta_fs = std::fs::metadata(&abs)?;
    if !meta_fs.is_file() {
        return Ok(String::new());
    }
    if meta_fs.len() > BATAS_BYTE {
        return Ok(String::new());
    }
    let isi = std::fs::read(&abs)?;
    if !alasan_skip(&isi, meta_fs.len()).is_empty() {
        return Ok(String::new());
    }

    let dir = dir_untuk(state, &abs);
    std::fs::create_dir_all(&dir)?;
    let mut meta = baca_meta(&dir);
    meta.path = abs.to_string_lossy().to_string();

    let hash = blake3::hash(&isi).to_hex().to_string();
    if hash == meta.hash_terakhir {
        if let Some(s) = daftar_snapshot(&dir).first() {
            return Ok(s.id.clone());
        }
    }
    let id = format!("{}__{}.snap", now_ms(), reason);
    std::fs::write(dir.join(&id), &isi)?;
    meta.hash_terakhir = hash;
    meta.total += 1;
    tulis_meta(&dir, &meta);
    pangkas(&dir, 50, 30);
    Ok(id)
}

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

#[tauri::command]
pub fn history_list(state: State<AppState>, path: String) -> ZResult<HistoryInfo> {
    let abs = izinkan(&state, Path::new(&path))?;
    let dir = dir_untuk(&state, &abs);
    let skip = match std::fs::metadata(&abs) {
        Ok(m) if m.len() > BATAS_BYTE => alasan_skip(&[], m.len()),
        Ok(_) => {
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

#[tauri::command]
pub fn history_read(state: State<AppState>, path: String, id: String) -> ZResult<String> {
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

#[tauri::command]
pub fn history_clear(state: State<AppState>, path: String) -> ZResult<usize> {
    let abs = izinkan(&state, Path::new(&path))?;
    let dir = dir_untuk(&state, &abs);
    let n = daftar_snapshot(&dir).len();
    let _ = std::fs::remove_dir_all(&dir);
    Ok(n)
}

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

        assert_eq!(sisa[0].timestamp_ms, dasar + 4);
        assert!(sisa[0].timestamp_ms > sisa[1].timestamp_ms);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn pangkas_umur_tidak_menghapus_satu_satunya_snapshot() {
        let dir = std::env::temp_dir().join(format!("zephyr-uji-hist2-{}", now_ms()));
        std::fs::create_dir_all(&dir).unwrap();

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
