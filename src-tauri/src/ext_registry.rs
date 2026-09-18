// ext_registry.rs — REGISTRY ekstensi native Zephyr (menggantikan Open VSX).
//
// Kenapa diganti: fase 19 mengambil daftar dari `https://open-vsx.org/api` —
// format VS Code — lalu menerjemahkannya jadi token Zephyr di frontend.
// Konsekuensinya: yang muncul di Marketplace mayoritas ekstensi VS Code penuh
// (butuh runtime eksternal / host API), jadi hampir semua disembunyikan atau
// gagal saat dipasang. Teman user benar: backend Zephyr Rust, jadi registry
// seharusnya dibaca dari sumber format Zephyr sendiri, bukan proxy VS Code.
//
// Sumber index (berurutan, yang pertama menang):
//   1. folder bundled        — %APPDATA%\zephyr\extensions\.registry\
//        index.json + paket .zext, ditulis saat instalasi/update.
//   2. file user             — %APPDATA%\zephyr\registry.json (bisa diedit /
//        dibagikan; pemilik bisa menambah registry pribadi tanpa menyentuh
//        kode app).
//   3. URL remote            — settings.extensions.registryUrl (HARUS https,
//        host boleh apa pun karena murni membaca index; unduhan tetap
//        lewat extensions_download_vsix yang punya allowlist sendiri).
//
// Format index (sama untuk ketiganya) — lihat `IndexEntry` + contoh di
// `index_contoh()`. Bahasa manifest yang sama dengan `ext_pkg.rs`, jadi
// entri index = apa yang dipasang, tidak ada lapisan terjemahan.

use crate::app_state::AppState;
use crate::errors::{ZResult, ZephyrError};
use crate::ext_pkg::InstalledEntry;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::State;

/// Batas ukuran file index (jauh di atas kebutuhan; pencegah file raksasa).
const MAX_INDEX_BYTES: u64 = 8 * 1024 * 1024;
/// Batas jumlah entri yang dipakai (sisanya dibuang).
const MAX_ENTRI: usize = 500;

/// Satu entri di registry Zephyr.
///
/// Hanya `id` yang wajib (dipakai nama folder saat dipasang). Field lain
/// dibawa default serde supaya registry minimal tetap valid.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct IndexEntry {
    /// wajib — id paket, dipakai nama folder saat dipasang.
    ///
    /// PAKAI `#[serde(default)]` juga: serde menolak field tanpa nilai meski
    /// di-`filter` nanti (error "missing field"), jadi default string kosong
    /// + filter `!id.is_empty()` di parse_index adalah satu-satunya cara
    /// membuang entri tanpa id tanpa membatalkan seluruh index.
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub publisher: String,
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub categories: Vec<String>,
    /// 1-3 karakter logo (fallback kalau iconUrl tak bisa dimuat)
    #[serde(default)]
    pub logo: String,
    /// URL logo PNG/SVG (opsional)
    #[serde(default)]
    pub icon_url: String,
    /// Warna merek (untuk lingkaran logo generik, opsional)
    #[serde(default)]
    pub logo_color: String,
    /// URL unduh paket .zext — wajib kalau tidak bundled
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub download_count: u64,
    #[serde(default)]
    pub rating: f64,
    /// bahasa yang membuat entri direkomendasikan (mis. ["rust","toml"])
    #[serde(default)]
    pub languages: Vec<String>,
}

/// Bentuk akar index: `{ "version": 1, "extensions": [...] }`.
/// `extensions` juga boleh array polos (tanpa pembungkus) untuk kemudahan.
#[derive(Debug, Deserialize)]
struct IndexRoot {
    #[serde(default)]
    version: u64,
    #[serde(default)]
    extensions: Vec<IndexEntry>,
}

/// Lokasi file registry user (%APPDATA%\zephyr\registry.json).
pub fn registry_file(state: &AppState) -> PathBuf {
    state.file("registry.json")
}

/// Folder registry bundled (dipasang bersama app / ekstensi lain).
pub fn registry_dir(state: &AppState) -> PathBuf {
    state.data_dir.join("extensions").join(".registry")
}

/// Baca satu file index → daftar entri (validasi + batas di sini).
fn parse_index(teks: &str, asal: &str) -> Vec<IndexEntry> {
    let mut out = parse_index_inner(teks, asal);
    out.sort_by(|a, b| a.id.cmp(&b.id));
    out.dedup_by(|a, b| a.id == b.id);
    out
}

/// Versi publik untuk uji di luar modul (mis. ext_bundled).
pub fn parse_index_pub(teks: &str) -> Vec<IndexEntry> {
    parse_index(teks, "bundled")
}

fn parse_index_inner(teks: &str, asal: &str) -> Vec<IndexEntry> {
    // Bentuk array polos diterima tanpa pembungkus.
    let entri: Vec<IndexEntry> = if teks.trim_start().starts_with('[') {
        match serde_json::from_str::<Vec<IndexEntry>>(teks) {
            Ok(v) => v,
            Err(e) => {
                tracing::warn!(asal, err = %e, "registry: format array tidak valid");
                return vec![];
            }
        }
    } else {
        match serde_json::from_str::<IndexRoot>(teks) {
            Ok(r) => r.extensions,
            Err(e) => {
                tracing::warn!(asal, err = %e, "registry: format index tidak valid");
                return vec![];
            }
        }
    };

    // Filter entri yang tidak punya id — tidak bisa dipasang & mengacaukan
    // peta terpasang. Sisanya dibatasi supaya registry rusak tidak membanjiri
    // UI dengan ribuan kartu.
    let mut bersih: Vec<IndexEntry> = entri.into_iter().filter(|e| !e.id.is_empty()).collect();
    if bersih.len() > MAX_ENTRI {
        tracing::warn!(asal, jumlah = bersih.len(), "registry: potong ke {MAX_ENTRI}");
        bersih.truncate(MAX_ENTRI);
    }
    bersih
}

/// Baca satu file dengan batas ukuran. Gagal/terlalu besar = daftar kosong
/// (registry hilang BUKAN error app — lihat command di bawah).
fn baca_file_terbatas(path: &std::path::Path, asal: &str) -> Vec<IndexEntry> {
    let meta = match std::fs::metadata(path) {
        Ok(m) => m,
        Err(_) => return vec![],
    };
    if meta.len() > MAX_INDEX_BYTES {
        tracing::warn!(asal, ukuran = meta.len(), "registry: file lebih besar dari batas");
        return vec![];
    }
    match std::fs::read_to_string(path) {
        Ok(teks) => parse_index(&teks, asal),
        Err(e) => {
            tracing::warn!(asal, err = %e, "registry: tidak bisa dibaca");
            vec![]
        }
    }
}

/// Ambil registry remote (format Zephyr). Murni pembaca index; unduhan paket
/// tetap lewat `extensions_download_vsix` yang punya allowlist host sendiri,
/// jadi registry URL boleh di-host di mana pun asal https.
async fn ambil_remote(url: &str) -> Vec<IndexEntry> {
    let r = ureq::get(url)
        .config()
        .timeout_global(Some(std::time::Duration::from_secs(20)))
        .http_status_as_error(false)
        .build()
        .header("Accept", "application/json")
        .header("User-Agent", "Zephyr-Editor/1.0")
        .call();
    let r = match r {
        Ok(r) => r,
        Err(e) => {
            tracing::warn!(url, err = %e, "registry remote tidak terjangkau");
            return vec![];
        }
    };
    if r.status().as_u16() != 200 {
        tracing::warn!(url, status = r.status().as_u16(), "registry remote menjawab non-200");
        return vec![];
    }
    let teks = match r.into_body().with_config().limit(MAX_INDEX_BYTES).read_to_string() {
        Ok(t) => t,
        Err(e) => {
            tracing::warn!(url, err = %e, "registry remote: body tidak terbaca");
            return vec![];
        }
    };
    parse_index(&teks, "remote")
}

/// Gabungan semua sumber registry: bundled → user → remote.
/// Sumber lebih awal menang (id sama tidak ditimpa) supaya paket yang sudah
/// ada di mesin tidak ditimpa versi lama dari remote.
#[tauri::command(async)]
pub async fn ext_registry_list(state: State<'_, AppState>, query: String) -> ZResult<Vec<IndexEntry>> {
    let mut semua: Vec<IndexEntry> = vec![];
    let mut sudah = std::collections::HashSet::new();

    let mut tambah = |list: Vec<IndexEntry>| {
        for e in list {
            if sudah.insert(e.id.clone()) {
                semua.push(e);
            }
        }
    };

    // 1) bundled: index yang dihasilkan dari PAKET di ext_bundled (selalu
    //    ada — supaya Marketplace tidak kosong di instalasi baru), plus
    //    file *.json lain di folder .registry (index per-paket).
    tambah(parse_index(&crate::ext_bundled::index_bundled(), "bundled"));
    let dir = registry_dir(&state);
    if dir.is_dir() {
        if let Ok(read) = std::fs::read_dir(&dir) {
            for f in read.flatten() {
                let p = f.path();
                if p.extension().and_then(|x| x.to_str()) == Some("json") {
                    tambah(baca_file_terbatas(&p, "bundled"));
                }
            }
        }
    }
    // 2) user: registry.json tunggal.
    let pf = registry_file(&state);
    if pf.is_file() {
        tambah(baca_file_terbatas(&pf, "user"));
    }
    // 3) remote: settings.extensions.registryUrl.
    let url = crate::settings::read_settings_value(&state)
        .get("extensions")
        .and_then(|e| e.get("registryUrl"))
        .and_then(|u| u.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if !url.is_empty() {
        // Hanya https — http ditolak supaya index tidak diambil dari jalur
        // terbuka (index bisa memuat URL unduhan yang dipercaya user).
        if url.starts_with("https://") {
            tambah(ambil_remote(&url).await);
        } else {
            tracing::warn!(%url, "registryUrl harus https://, diabaikan");
        }
    }

    // Filter pencarian: cocok di id/nama/penerbit/deskripsi/kategori.
    // Pencarian kosong = semua (urutan asli, tidak ada sort default).
    let q = query.trim().to_lowercase();
    if q.is_empty() {
        return Ok(semua);
    }
    Ok(semua
        .into_iter()
        .filter(|e| {
            e.id.to_lowercase().contains(&q)
                || e.name.to_lowercase().contains(&q)
                || e.publisher.to_lowercase().contains(&q)
                || e.description.to_lowercase().contains(&q)
                || e.categories.iter().any(|c| c.to_lowercase().contains(&q))
        })
        .collect())
}

/// Tulis registry user (dipakai Settings → Ekstensi untuk menambah registry
/// pribadi, atau untuk berbagi konfigurasi antar mesin).
#[tauri::command]
pub fn ext_registry_save(state: State<AppState>, teks: String) -> ZResult<()> {
    // Wajib valid dulu — tulis file rusak membuat registry mati diam-diam.
    let entri = parse_index(&teks, "user-save");
    let root = serde_json::json!({ "version": 1, "extensions": entri });
    let path = registry_file(&state);
    if let Some(induk) = path.parent() {
        std::fs::create_dir_all(induk)?;
    }
    let bytes = serde_json::to_vec_pretty(&root)
        .map_err(|e| ZephyrError::Internal(format!("registry tidak bisa diserialisasi: {e}")))?;
    std::fs::write(&path, bytes)?;
    Ok(())
}

/// Baca registry user sebagai teks (dipakai editor di Settings).
#[tauri::command]
pub fn ext_registry_read(state: State<AppState>) -> ZResult<String> {
    let path = registry_file(&state);
    if !path.is_file() {
        // Belum ada → kembalikan template supaya user tahu formatnya.
        return Ok(index_contoh());
    }
    Ok(std::fs::read_to_string(&path)?)
}

/// Contoh index + dokumentasi format. Dipakai template saat registry user
/// masih kosong (biar user tahu persis apa yang harus diisi).
fn index_contoh() -> String {
    r##"{
  "version": 1,
  "extensions": [
    {
      "id": "zephyr.contoh-paket",
      "name": "Contoh Paket",
      "publisher": "zephyr",
      "version": "1.0.0",
      "description": "Contoh entri registry. Hapus dan ganti dengan punyamu.",
      "categories": ["Themes"],
      "logo": "▣",
      "url": "https://contoh-zephyr.dev/paket/contoh.zext",
      "downloadCount": 0,
      "rating": 0,
      "languages": []
    }
  ]
}
"##
    .to_string()
}

/// Daftar entri yang sudah terinstal (dipakai UI membedakan pasang/terpasang).
/// Pemetaan id → versi, jadi frontend tidak perlu baca installed.json sendiri.
#[tauri::command]
pub fn ext_registry_installed(state: State<AppState>) -> ZResult<Vec<InstalledEntry>> {
    Ok(crate::ext_pkg::read_installed(&state))
}

/// Cek apakah sebuah URL unduh .zext diizinkan. Allowlist sama dengan
/// `extensions_download_vsix` — tidak diperluas di sini, supaya registry
/// tidak bisa mengarahkan unduhan ke host yang belum disetujui.
#[tauri::command]
pub fn ext_registry_url_diizinkan(url: String) -> ZResult<bool> {
    let host = url.split('/').nth(2).unwrap_or("").to_lowercase();
    Ok(url.starts_with("https://") && matches!(host.as_str(), "open-vsx.org" | "www.open-vsx.org" | "github.com" | "raw.githubusercontent.com"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_index_root_dan_array_polos() {
        let root = r#"{"version":1,"extensions":[{"id":"a.b","name":"A","publisher":"a","version":"1"}]}"#;
        assert_eq!(parse_index(root, "t").len(), 1);

        let arr = r#"[{"id":"a.b","name":"A","publisher":"a","version":"1"}]"#;
        assert_eq!(parse_index(arr, "t").len(), 1);
    }

    #[test]
    fn entri_tanpa_id_dibuang() {
        let arr = r#"[{"id":"a.b"},{"name":"tanpa id"},{"id":"c.d"}]"#;
        let out = parse_index(arr, "t");
        assert_eq!(out.len(), 2, "entri tanpa id harus dibuang: {out:?}");
        assert!(out.iter().all(|e| !e.id.is_empty()));
    }

    #[test]
    fn index_rusak_mengembalikan_kosong_bukan_panic() {
        assert!(parse_index("{ ini bukan json", "t").is_empty());
        assert!(parse_index("[]", "t").is_empty());
    }

    #[test]
    fn batas_jumlah_entri_dipatuhi() {
        let mut s = String::from("[");
        for i in 0..(MAX_ENTRI + 50) {
            s.push_str(&format!("{{\"id\":\"x.{i}\"}},"));
        }
        s.pop();
        s.push(']');
        assert_eq!(parse_index(&s, "t").len(), MAX_ENTRI);
    }

    #[test]
    fn url_diizinkan_hanya_https_dan_host_terpercaya() {
        assert!(ext_registry_url_diizinkan("https://github.com/a/b.zext".into()).unwrap());
        assert!(ext_registry_url_diizinkan("https://open-vsx.org/x".into()).unwrap());
        assert!(!ext_registry_url_diizinkan("http://github.com/a.zext".into()).unwrap());
        assert!(!ext_registry_url_diizinkan("https://evil.example/a.zext".into()).unwrap());
    }
}
