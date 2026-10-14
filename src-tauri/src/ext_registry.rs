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
                tracing::warn!(asal, err = %e, "registry: invalid array format");
                return vec![];
            }
        }
    } else {
        match serde_json::from_str::<IndexRoot>(teks) {
            Ok(r) => r.extensions,
            Err(e) => {
                tracing::warn!(asal, err = %e, "registry: format index is not valid");
                return vec![];
            }
        }
    };

    let mut bersih: Vec<IndexEntry> = entri.into_iter().filter(|e| !e.id.is_empty()).collect();
    if bersih.len() > MAX_ENTRI {
        tracing::warn!(
            asal,
            jumlah = bersih.len(),
            "registry: truncated to {MAX_ENTRI}"
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
            "registry: file larger than the limit"
        );
        return vec![];
    }
    match std::fs::read_to_string(path) {
        Ok(teks) => parse_index(&teks, asal),
        Err(e) => {
            tracing::warn!(asal, err = %e, "registry: could not be read");
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
            tracing::warn!(url, err = %e, "remote registry unreachable");
            return vec![];
        }
    };
    if r.status().as_u16() != 200 {
        tracing::warn!(
            url,
            status = r.status().as_u16(),
            "remote registry responded non-200"
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
            tracing::warn!(url, err = %e, "remote registry: body could not be read");
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

    /*
     * Registry sources: many, not one.
     *
     * A single `registryUrl` meant a reader who pointed it at their own index
     * LOST the public one — the field is a replacement, not an addition. Zed
     * takes a list, and a list is what a marketplace needs: the bundled index,
     * a team's private one, and a public mirror are all useful at once.
     *
     * `registryUrl` (singular) is still READ, and is folded in as the first
     * entry when present. That keeps an existing settings.json working without a
     * migration step — the alternative is a reader's configured registry
     * silently disappearing after an update.
     */
    let setelan = crate::settings::read_settings_value(&state);
    let mut sumber: Vec<String> = Vec::new();
    if let Some(arr) = setelan
        .get("extensions")
        .and_then(|e| e.get("registryUrls"))
        .and_then(|u| u.as_array())
    {
        for u in arr {
            if let Some(s) = u.as_str() {
                let t = s.trim();
                if !t.is_empty() {
                    sumber.push(t.to_string());
                }
            }
        }
    }
    if let Some(satu) = setelan
        .get("extensions")
        .and_then(|e| e.get("registryUrl"))
        .and_then(|u| u.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        /* Prepended so the reader's own index wins a tie on id — they
           configured it deliberately, and the bundled set is the fallback. */
        if !sumber.iter().any(|x| x == satu) {
            sumber.insert(0, satu.to_string());
        }
    }

    for url in sumber {
        /*
         * https only, and said out loud when it is not.
         *
         * `tambah(ambil_remote(..).await)` fetches and parses whatever comes
         * back, so an http:// URL would be a registry installed over a channel
         * anyone on the network can rewrite. A rejected URL is warned about
         * rather than skipped silently: a reader whose registry vanished needs
         * to know why, and "must be https://" is the whole answer.
         */
        if !url.starts_with("https://") {
            tracing::warn!(%url, "registry URL must be https://, ignored");
            continue;
        }
        tambah(ambil_remote(&url).await);
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
        .map_err(|e| ZephyrError::Internal(format!("registry could not be serialized: {e}")))?;
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
      "description": "Example registry entry. Delete it and replace it with your own.",
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
