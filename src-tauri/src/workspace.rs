use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, State};

use crate::app_state::AppState;
use crate::errors::{ZResult, ZephyrError};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Trust {
    Unknown,

    Trusted,

    Restricted,
}

impl Trust {
    pub fn boleh_eksekusi(self) -> bool {
        matches!(self, Trust::Trusted)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Root {
    pub path: String,

    pub name: String,

    pub is_repo: bool,
    pub trust: Trust,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceFile {
    #[serde(default)]
    pub folders: Vec<FolderEntry>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub settings: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderEntry {
    pub path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceInfo {
    pub roots: Vec<Root>,

    pub active_root: String,

    pub file: String,

    pub trusted: bool,

    pub perlu_tanya: bool,

    pub alasan: String,
}

fn file_trust(state: &AppState) -> PathBuf {
    state.data_dir.join("trust.json")
}

fn baca_trust(state: &AppState) -> HashMap<String, Trust> {
    let p = file_trust(state);
    let Ok(teks) = std::fs::read_to_string(&p) else {
        return HashMap::new();
    };
    let Ok(v) = serde_json::from_str::<Value>(&teks) else {
        tracing::warn!(path = %p.to_string_lossy(), "trust.json rusak, diabaikan");
        return HashMap::new();
    };
    let mut out = HashMap::new();
    if let Value::Object(map) = v {
        for (k, val) in map {
            let t = match val.as_str() {
                Some("trusted") => Trust::Trusted,
                Some("restricted") => Trust::Restricted,
                _ => continue,
            };
            out.insert(kunci(&PathBuf::from(k)), t);
        }
    }
    out
}

fn tulis_trust(state: &AppState, map: &HashMap<String, Trust>) -> ZResult<()> {
    let mut obj = serde_json::Map::new();
    for (k, v) in map {
        let s = match v {
            Trust::Trusted => "trusted",
            Trust::Restricted => "restricted",
            Trust::Unknown => continue,
        };
        obj.insert(k.clone(), json!(s));
    }
    let p = file_trust(state);
    let teks = serde_json::to_string_pretty(&Value::Object(obj))
        .map_err(|e| ZephyrError::Internal(format!("serialisasi trust: {e}")))?;
    std::fs::write(&p, teks)
        .map_err(|e| ZephyrError::Io(format!("tulis trust.json gagal: {e}")))?;
    Ok(())
}

fn kunci(p: &Path) -> String {
    let s = p.to_string_lossy().replace('\\', "/");
    let s = s.trim_end_matches('/').to_string();
    #[cfg(windows)]
    {
        s.to_lowercase()
    }
    #[cfg(not(windows))]
    {
        s
    }
}

pub fn trust_untuk(state: &AppState, path: &Path) -> Trust {
    let map = baca_trust(state);
    trust_dari_map(&map, path)
}

fn trust_dari_map(map: &HashMap<String, Trust>, path: &Path) -> Trust {
    let k = kunci(path);
    if let Some(t) = map.get(&k) {
        return *t;
    }

    let mut terbaik: Option<(usize, Trust)> = None;
    for (kk, tt) in map {
        if k.starts_with(kk) && k.as_bytes().get(kk.len()) == Some(&b'/') {
            let panjang = kk.len();
            if terbaik.map(|(p, _)| panjang > p).unwrap_or(true) {
                terbaik = Some((panjang, *tt));
            }
        }
    }
    terbaik.map(|(_, t)| t).unwrap_or(Trust::Unknown)
}

pub fn ensure_trusted(state: &AppState, apa: &str) -> ZResult<()> {
    let Some(ws) = state.workspace_path() else {
        return Err(ZephyrError::InvalidInput(format!(
            "{apa} butuh workspace terbuka"
        )));
    };
    let t = trust_untuk(state, &ws);
    if t.boleh_eksekusi() {
        return Ok(());
    }
    let sebab = match t {
        Trust::Restricted => "folder ini dibuka dalam Restricted Mode",
        _ => "folder ini belum dipercaya",
    };
    Err(ZephyrError::Permission(format!(
        "{apa} diblokir: {sebab}. Buka \"Manage Workspace Trust\" lalu pilih Trust untuk mengaktifkan."
    )))
}

pub fn ensure_trusted_path(state: &AppState, path: &Path, apa: &str) -> ZResult<()> {
    if trust_untuk(state, path).boleh_eksekusi() {
        return Ok(());
    }
    Err(ZephyrError::Permission(format!(
        "{apa} diblokir untuk {}: folder belum dipercaya",
        path.to_string_lossy()
    )))
}

pub fn baca_workspace_file(path: &Path) -> ZResult<WorkspaceFile> {
    let teks = std::fs::read_to_string(path)
        .map_err(|e| ZephyrError::Io(format!("baca {}: {e}", path.to_string_lossy())))?;
    let bersih = crate::tasks::buang_komentar(&teks);
    serde_json::from_str::<WorkspaceFile>(&bersih).map_err(|e| {
        ZephyrError::InvalidInput(format!(
            "{} bukan .code-workspace yang sah: {e}",
            path.to_string_lossy()
        ))
    })
}

fn absolutkan_root(basis: &Path, p: &str) -> PathBuf {
    let pb = PathBuf::from(p);
    if pb.is_absolute() {
        return pb;
    }
    let gabung = basis.join(pb);

    let mut out = PathBuf::new();
    for komp in gabung.components() {
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

pub fn gabung_scope(
    default_v: Value,
    user: Option<Value>,
    ws: Option<Value>,
    folder: Option<Value>,
) -> Value {
    let mut out = default_v;
    for lapis in [user, ws, folder].into_iter().flatten() {
        crate::settings::deep_merge_um(&mut out, &lapis);
    }
    out
}

fn settings_folder(root: &Path) -> Option<Value> {
    let p = root.join(".zephyr").join("settings.json");
    let teks = std::fs::read_to_string(&p).ok()?;
    let bersih = crate::tasks::buang_komentar(&teks);
    serde_json::from_str(&bersih).ok()
}

#[tauri::command(async)]
pub fn workspace_info(state: State<AppState>) -> ZResult<WorkspaceInfo> {
    let map = baca_trust(&state);
    let roots_raw = state.roots();
    let aktif = state.workspace_path();

    let mut roots = Vec::new();
    for r in &roots_raw {
        let t = trust_dari_map(&map, r);
        roots.push(Root {
            path: r.to_string_lossy().replace('\\', "/"),
            name: state.nama_root(r),
            is_repo: r.join(".git").exists(),
            trust: t,
        });
    }

    let semua_percaya = !roots.is_empty() && roots.iter().all(|r| r.trust.boleh_eksekusi());
    let perlu_tanya = roots.iter().any(|r| r.trust == Trust::Unknown);
    let alasan = if roots.is_empty() {
        String::new()
    } else if semua_percaya {
        String::new()
    } else if perlu_tanya {
        "Folder ini belum dipercaya — tasks, debug, LSP, dan ekstensi dinonaktifkan.".into()
    } else {
        "Restricted Mode: tasks, debug, LSP, dan ekstensi dinonaktifkan.".into()
    };

    Ok(WorkspaceInfo {
        roots,
        active_root: aktif
            .map(|p| p.to_string_lossy().replace('\\', "/"))
            .unwrap_or_default(),
        file: state.workspace_file(),
        trusted: semua_percaya,
        perlu_tanya,
        alasan,
    })
}

#[tauri::command(async)]
pub fn workspace_set_trust(
    app: AppHandle,
    state: State<AppState>,
    path: String,
    trust: bool,
) -> ZResult<WorkspaceInfo> {
    let p = PathBuf::from(&path);
    if !p.is_dir() {
        return Err(ZephyrError::InvalidInput(format!("{path} bukan folder")));
    }
    let mut map = baca_trust(&state);
    map.insert(
        kunci(&p),
        if trust {
            Trust::Trusted
        } else {
            Trust::Restricted
        },
    );
    tulis_trust(&state, &map)?;
    tracing::info!(path = %path, trust, "trust workspace diubah");
    let _ = app.emit("workspace-trust", json!({ "path": path, "trusted": trust }));
    workspace_info(state)
}

#[tauri::command(async)]
pub fn workspace_forget_trust(state: State<AppState>, path: String) -> ZResult<WorkspaceInfo> {
    let mut map = baca_trust(&state);
    map.remove(&kunci(&PathBuf::from(&path)));
    tulis_trust(&state, &map)?;
    workspace_info(state)
}

#[tauri::command(async)]
pub fn workspace_trust_list(state: State<AppState>) -> ZResult<Value> {
    let map = baca_trust(&state);
    let mut arr: Vec<Value> = map
        .into_iter()
        .map(|(p, t)| {
            json!({
                "path": p,
                "trust": match t { Trust::Trusted => "trusted", Trust::Restricted => "restricted", Trust::Unknown => "unknown" },
            })
        })
        .collect();
    arr.sort_by(|a, b| a["path"].as_str().cmp(&b["path"].as_str()));
    Ok(Value::Array(arr))
}

#[tauri::command(async)]
pub fn workspace_add_root(
    app: AppHandle,
    state: State<AppState>,
    path: String,
) -> ZResult<WorkspaceInfo> {
    let p = crate::app_state::normalize(&PathBuf::from(&path));
    if !p.is_dir() {
        return Err(ZephyrError::InvalidInput(format!("{path} bukan folder")));
    }
    if crate::paths::is_drive_root(&p) {
        return Err(ZephyrError::InvalidInput(format!(
            "{path} adalah root drive — buka folder proyek di dalamnya"
        )));
    }
    state.add_root(p.clone(), None)?;

    state.allow_exact(&p);
    let _ = app.emit(
        "workspace-roots",
        json!({ "path": p.to_string_lossy().replace('\\', "/") }),
    );
    workspace_info(state)
}

#[tauri::command(async)]
pub fn workspace_remove_root(
    app: AppHandle,
    state: State<AppState>,
    path: String,
) -> ZResult<WorkspaceInfo> {
    let p = crate::app_state::normalize(&PathBuf::from(&path));
    state.remove_root(&p)?;
    let _ = app.emit(
        "workspace-roots",
        json!({ "removed": p.to_string_lossy().replace('\\', "/") }),
    );
    workspace_info(state)
}

#[tauri::command(async)]
pub fn workspace_set_active_root(
    app: AppHandle,
    state: State<AppState>,
    path: String,
) -> ZResult<WorkspaceInfo> {
    let p = crate::app_state::normalize(&PathBuf::from(&path));
    state.set_active_root(&p)?;
    let _ = app.emit(
        "workspace-active-root",
        json!({ "path": p.to_string_lossy().replace('\\', "/") }),
    );
    workspace_info(state)
}

#[tauri::command(async)]
pub fn workspace_open_file(
    app: AppHandle,
    state: State<AppState>,
    path: String,
) -> ZResult<WorkspaceInfo> {
    let p = PathBuf::from(&path);
    let wf = baca_workspace_file(&p)?;
    let basis = p.parent().unwrap_or(Path::new(".")).to_path_buf();

    if wf.folders.is_empty() {
        return Err(ZephyrError::InvalidInput(
            "file .code-workspace tidak memuat folder".into(),
        ));
    }

    state.clear_roots();
    let mut dipasang = 0usize;
    let mut dilewati: Vec<String> = Vec::new();
    for f in &wf.folders {
        let abs = crate::app_state::normalize(&absolutkan_root(&basis, &f.path));
        if !abs.is_dir() {
            dilewati.push(f.path.clone());
            continue;
        }
        state.add_root(abs.clone(), f.name.clone())?;
        state.allow_exact(&abs);
        dipasang += 1;
    }
    if dipasang == 0 {
        return Err(ZephyrError::InvalidInput(format!(
            "tidak ada folder yang bisa dibuka dari {path} (dilewati: {})",
            dilewati.join(", ")
        )));
    }

    state.set_workspace_file(p.to_string_lossy().replace('\\', "/"));
    state.set_workspace_settings(wf.settings.clone());
    crate::settings::push_recent(&state, &p.to_string_lossy())?;

    tracing::info!(file = %path, roots = dipasang, dilewati = dilewati.len(), "workspace file dibuka");
    let _ = app.emit(
        "workspace-opened",
        json!({
            "path": state.workspace_path().map(|x| x.to_string_lossy().replace('\\', "/")).unwrap_or_default(),
            "file": p.to_string_lossy().replace('\\', "/"),
            "roots": dipasang,
            "dilewati": dilewati,
        }),
    );
    workspace_info(state)
}

#[tauri::command(async)]
pub fn workspace_save_file(
    state: State<AppState>,
    path: String,
    settings: Option<Value>,
) -> ZResult<String> {
    let p = PathBuf::from(&path);
    state.ensure_writable(&p)?;
    let basis = p.parent().unwrap_or(Path::new(".")).to_path_buf();

    let folders: Vec<FolderEntry> = state
        .roots()
        .iter()
        .map(|r| {
            let rel = pathdiff_sederhana(&basis, r);
            FolderEntry {
                path: rel.unwrap_or_else(|| r.to_string_lossy().replace('\\', "/")),
                name: Some(state.nama_root(r)),
            }
        })
        .collect();

    if folders.is_empty() {
        return Err(ZephyrError::InvalidInput(
            "tidak ada root untuk disimpan".into(),
        ));
    }

    let wf = WorkspaceFile {
        folders,
        settings: settings.or_else(|| state.workspace_settings()),
    };
    let teks = serde_json::to_string_pretty(&wf)
        .map_err(|e| ZephyrError::Internal(format!("serialisasi workspace: {e}")))?;
    std::fs::write(&p, format!("{teks}\n"))
        .map_err(|e| ZephyrError::Io(format!("tulis {path}: {e}")))?;

    state.set_workspace_file(p.to_string_lossy().replace('\\', "/"));
    state.set_workspace_settings(wf.settings.clone());
    Ok(p.to_string_lossy().replace('\\', "/"))
}

fn pathdiff_sederhana(basis: &Path, anak: &Path) -> Option<String> {
    let b: Vec<String> = komponen_bandingkan(basis);
    let a: Vec<String> = komponen_bandingkan(anak);
    if b.is_empty() || a.is_empty() {
        return None;
    }

    if b[0] != a[0] {
        return None;
    }

    let sama = b.iter().zip(a.iter()).take_while(|(x, y)| x == y).count();
    let naik = b.len() - sama;

    if naik > 4 {
        return None;
    }

    let mut bagian: Vec<String> = std::iter::repeat("..".to_string()).take(naik).collect();

    let asli: Vec<String> = anak
        .components()
        .map(|c| c.as_os_str().to_string_lossy().to_string())
        .collect();
    for seg in asli.into_iter().skip(sama) {
        bagian.push(seg.replace('\\', "/"));
    }
    if bagian.is_empty() {
        return Some(".".to_string());
    }
    Some(bagian.join("/"))
}

fn komponen_bandingkan(p: &Path) -> Vec<String> {
    p.components()
        .map(|c| {
            let s = c.as_os_str().to_string_lossy().replace('\\', "/");
            #[cfg(windows)]
            {
                s.to_lowercase()
            }
            #[cfg(not(windows))]
            {
                s
            }
        })
        .collect()
}

#[tauri::command(async)]
pub fn workspace_settings_efektif(state: State<AppState>, root: Option<String>) -> ZResult<Value> {
    let user = crate::settings::read_json_um(&state.file("settings.json"));
    let ws = state.workspace_settings();
    let r = root.map(PathBuf::from).or_else(|| state.workspace_path());
    let folder = r.as_deref().and_then(settings_folder);
    Ok(gabung_scope(
        crate::settings::default_settings(),
        user,
        ws,
        folder,
    ))
}

#[tauri::command(async)]
pub fn workspace_settings_asal(
    state: State<AppState>,
    key: String,
    root: Option<String>,
) -> ZResult<String> {
    let ambil = |v: &Value| -> Option<Value> {
        let mut cur = v;
        for seg in key.split('.') {
            cur = cur.get(seg)?;
        }
        Some(cur.clone())
    };

    let r = root.map(PathBuf::from).or_else(|| state.workspace_path());
    let folder = r.as_deref().and_then(settings_folder);
    if folder.as_ref().and_then(&ambil).is_some() {
        return Ok("folder".into());
    }
    if state
        .workspace_settings()
        .as_ref()
        .and_then(&ambil)
        .is_some()
    {
        return Ok("workspace".into());
    }
    if crate::settings::read_json_um(&state.file("settings.json"))
        .as_ref()
        .and_then(&ambil)
        .is_some()
    {
        return Ok("user".into());
    }
    Ok("default".into())
}

#[tauri::command(async)]
pub fn workspace_set_settings(
    app: AppHandle,
    state: State<AppState>,
    patch: Value,
) -> ZResult<Value> {
    if !patch.is_object() {
        return Err(ZephyrError::InvalidInput("patch harus object".into()));
    }
    let mut cur = state.workspace_settings().unwrap_or_else(|| json!({}));
    crate::settings::deep_merge_um(&mut cur, &patch);
    state.set_workspace_settings(Some(cur.clone()));

    let f = state.workspace_file();
    if !f.is_empty() {
        let p = PathBuf::from(&f);
        if let Ok(mut wf) = baca_workspace_file(&p) {
            wf.settings = Some(cur.clone());
            let teks = serde_json::to_string_pretty(&wf)
                .map_err(|e| ZephyrError::Internal(format!("serialisasi: {e}")))?;
            std::fs::write(&p, format!("{teks}\n"))
                .map_err(|e| ZephyrError::Io(format!("tulis {f}: {e}")))?;
        }
    }

    if let Value::Object(map) = &patch {
        for k in map.keys() {
            let _ = app.emit(
                "settings-changed",
                json!({ "key": k, "scope": "workspace" }),
            );
        }
    }
    Ok(cur)
}

#[tauri::command(async)]
pub fn workspace_boleh_eksekusi(state: State<AppState>) -> bool {
    state
        .workspace_path()
        .map(|ws| trust_untuk(&state, &ws).boleh_eksekusi())
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kunci_tidak_peka_huruf_dan_separator() {
        assert_eq!(kunci(Path::new("D:\\Proj")), kunci(Path::new("d:/proj")));
        assert_eq!(kunci(Path::new("D:/proj/")), kunci(Path::new("D:/proj")));
    }

    #[test]
    fn trust_mewarisi_ke_bawah_bukan_ke_atas() {
        let mut map = HashMap::new();
        map.insert(kunci(Path::new("D:/proj")), Trust::Trusted);

        assert_eq!(
            trust_dari_map(&map, Path::new("D:/proj/src/lib")),
            Trust::Trusted
        );

        assert_eq!(trust_dari_map(&map, Path::new("D:/")), Trust::Unknown);
        assert_eq!(trust_dari_map(&map, Path::new("D:/lain")), Trust::Unknown);
    }

    #[test]
    fn awalan_string_bukan_berarti_anak() {
        let mut map = HashMap::new();
        map.insert(kunci(Path::new("D:/proj")), Trust::Trusted);

        assert_eq!(trust_dari_map(&map, Path::new("D:/proj2")), Trust::Unknown);
    }

    #[test]
    fn keputusan_terdekat_menang() {
        let mut map = HashMap::new();
        map.insert(kunci(Path::new("D:/proj")), Trust::Trusted);
        map.insert(kunci(Path::new("D:/proj/vendor")), Trust::Restricted);
        assert_eq!(
            trust_dari_map(&map, Path::new("D:/proj/vendor/x")),
            Trust::Restricted
        );
        assert_eq!(
            trust_dari_map(&map, Path::new("D:/proj/src")),
            Trust::Trusted
        );
    }

    #[test]
    fn unknown_tidak_boleh_eksekusi() {
        assert!(!Trust::Unknown.boleh_eksekusi());
        assert!(!Trust::Restricted.boleh_eksekusi());
        assert!(Trust::Trusted.boleh_eksekusi());
    }

    #[test]
    fn scope_folder_menimpa_workspace_menimpa_user() {
        let d = json!({ "editor": { "tabSize": 2, "wordWrap": false }, "theme": "dark" });
        let user = json!({ "editor": { "tabSize": 4 } });
        let ws = json!({ "editor": { "tabSize": 8 } });
        let folder = json!({ "editor": { "tabSize": 3 } });

        let hanya_user = gabung_scope(d.clone(), Some(user.clone()), None, None);
        assert_eq!(hanya_user["editor"]["tabSize"], 4);

        let sampai_ws = gabung_scope(d.clone(), Some(user.clone()), Some(ws.clone()), None);
        assert_eq!(sampai_ws["editor"]["tabSize"], 8);

        let semua = gabung_scope(d.clone(), Some(user), Some(ws), Some(folder));
        assert_eq!(semua["editor"]["tabSize"], 3);

        assert_eq!(semua["editor"]["wordWrap"], false);
        assert_eq!(semua["theme"], "dark");
    }

    #[test]
    fn null_di_scope_atas_menghapus_key() {
        let d = json!({ "a": 1, "b": 2 });
        let ws = json!({ "b": null });
        let out = gabung_scope(d, None, Some(ws), None);
        assert_eq!(out["a"], 1);
        assert!(
            out.get("b").is_none(),
            "null harus MENGHAPUS key (RFC 7386)"
        );
    }

    #[test]
    fn root_relatif_di_workspace_file_diselesaikan() {
        let basis = Path::new("D:/kerja");
        assert_eq!(
            absolutkan_root(basis, "./app"),
            PathBuf::from("D:/kerja/app")
        );
        assert_eq!(absolutkan_root(basis, "../lain"), PathBuf::from("D:/lain"));
        assert_eq!(
            absolutkan_root(basis, "D:/absolut"),
            PathBuf::from("D:/absolut")
        );
    }

    #[test]
    fn simpan_path_relatif_bila_di_dalam_basis() {
        assert_eq!(
            pathdiff_sederhana(Path::new("D:/kerja"), Path::new("D:/kerja/app")),
            Some("app".to_string())
        );
    }

    #[test]
    fn simpan_path_relatif_menaik_untuk_sibling() {
        assert_eq!(
            pathdiff_sederhana(Path::new("D:/proj/root-a"), Path::new("D:/proj/root-b")),
            Some("../root-b".to_string())
        );
        assert_eq!(
            pathdiff_sederhana(Path::new("D:/proj/a/b"), Path::new("D:/proj/x")),
            Some("../../x".to_string())
        );
    }

    #[test]
    fn drive_berbeda_tidak_punya_path_relatif() {
        assert_eq!(
            pathdiff_sederhana(Path::new("D:/kerja"), Path::new("E:/lain")),
            None
        );
    }

    #[test]
    fn naik_terlalu_jauh_biarkan_absolut() {
        assert_eq!(
            pathdiff_sederhana(Path::new("D:/a/b/c/d/e/f"), Path::new("D:/z")),
            None
        );
    }
}
