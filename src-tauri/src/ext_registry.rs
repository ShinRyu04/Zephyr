use crate::app_state::AppState;
use crate::errors::{ZResult, ZephyrError};
use crate::ext_pkg::InstalledEntry;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::State;

const MAX_INDEX_BYTES: u64 = 8 * 1024 * 1024;

const MAX_ENTRI: usize = 500;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct IndexEntry {
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

    #[serde(default)]
    pub logo: String,

    #[serde(default)]
    pub icon_url: String,

    #[serde(default)]
    pub logo_color: String,

    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub download_count: u64,
    #[serde(default)]
    pub rating: f64,

    #[serde(default)]
    pub languages: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct IndexRoot {
    #[serde(default)]
    version: u64,
    #[serde(default)]
    extensions: Vec<IndexEntry>,
}

pub fn registry_file(state: &AppState) -> PathBuf {
    state.file("registry.json")
}

pub fn registry_dir(state: &AppState) -> PathBuf {
    state.data_dir.join("extensions").join(".registry")
}

fn parse_index(teks: &str, asal: &str) -> Vec<IndexEntry> {
    let mut out = parse_index_inner(teks, asal);
    out.sort_by(|a, b| a.id.cmp(&b.id));
    out.dedup_by(|a, b| a.id == b.id);
    out
}

pub fn parse_index_pub(teks: &str) -> Vec<IndexEntry> {
    parse_index(teks, "bundled")
}

fn parse_index_inner(teks: &str, asal: &str) -> Vec<IndexEntry> {
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

    let mut bersih: Vec<IndexEntry> = entri.into_iter().filter(|e| !e.id.is_empty()).collect();
    if bersih.len() > MAX_ENTRI {
        tracing::warn!(
            asal,
            jumlah = bersih.len(),
            "registry: potong ke {MAX_ENTRI}"
        );
        bersih.truncate(MAX_ENTRI);
    }
    bersih
}

fn baca_file_terbatas(path: &std::path::Path, asal: &str) -> Vec<IndexEntry> {
    let meta = match std::fs::metadata(path) {
        Ok(m) => m,
        Err(_) => return vec![],
    };
    if meta.len() > MAX_INDEX_BYTES {
        tracing::warn!(
            asal,
            ukuran = meta.len(),
            "registry: file lebih besar dari batas"
        );
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
        tracing::warn!(
            url,
            status = r.status().as_u16(),
            "registry remote menjawab non-200"
        );
        return vec![];
    }
    let teks = match r
        .into_body()
        .with_config()
        .limit(MAX_INDEX_BYTES)
        .read_to_string()
    {
        Ok(t) => t,
        Err(e) => {
            tracing::warn!(url, err = %e, "registry remote: body tidak terbaca");
            return vec![];
        }
    };
    parse_index(&teks, "remote")
}

#[tauri::command(async)]
pub async fn ext_registry_list(
    state: State<'_, AppState>,
    query: String,
) -> ZResult<Vec<IndexEntry>> {
    let mut semua: Vec<IndexEntry> = vec![];
    let mut sudah = std::collections::HashSet::new();

    let mut tambah = |list: Vec<IndexEntry>| {
        for e in list {
            if sudah.insert(e.id.clone()) {
                semua.push(e);
            }
        }
    };

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

    let pf = registry_file(&state);
    if pf.is_file() {
        tambah(baca_file_terbatas(&pf, "user"));
    }

    let url = crate::settings::read_settings_value(&state)
        .get("extensions")
        .and_then(|e| e.get("registryUrl"))
        .and_then(|u| u.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if !url.is_empty() {
        if url.starts_with("https://") {
            tambah(ambil_remote(&url).await);
        } else {
            tracing::warn!(%url, "registryUrl harus https://, diabaikan");
        }
    }

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

#[tauri::command]
pub fn ext_registry_save(state: State<AppState>, teks: String) -> ZResult<()> {
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

#[tauri::command]
pub fn ext_registry_read(state: State<AppState>) -> ZResult<String> {
    let path = registry_file(&state);
    if !path.is_file() {
        return Ok(index_contoh());
    }
    Ok(std::fs::read_to_string(&path)?)
}

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

#[tauri::command]
pub fn ext_registry_installed(state: State<AppState>) -> ZResult<Vec<InstalledEntry>> {
    Ok(crate::ext_pkg::read_installed(&state))
}

#[tauri::command]
pub fn ext_registry_url_diizinkan(url: String) -> ZResult<bool> {
    let host = url.split('/').nth(2).unwrap_or("").to_lowercase();
    Ok(url.starts_with("https://")
        && matches!(
            host.as_str(),
            "open-vsx.org" | "www.open-vsx.org" | "github.com" | "raw.githubusercontent.com"
        ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_index_root_dan_array_polos() {
        let root =
            r#"{"version":1,"extensions":[{"id":"a.b","name":"A","publisher":"a","version":"1"}]}"#;
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
