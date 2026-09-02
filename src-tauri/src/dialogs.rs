// dialogs.rs — dialog native (open/save file, pilih folder).
// Memakai tauri-plugin-dialog secara blocking di thread command.

use crate::app_state::AppState;
use crate::errors::ZResult;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

#[tauri::command(async)]
pub fn file_dialog_open(
    app: AppHandle,
    state: State<AppState>,
    multiple: Option<bool>,
) -> ZResult<Option<Vec<String>>> {
    let mut builder = app.dialog().file().set_title("Buka File");
    if let Some(ws) = state.workspace_path() {
        builder = builder.set_directory(ws);
    }

    let picked: Option<Vec<String>> = if multiple.unwrap_or(false) {
        builder
            .blocking_pick_files()
            .map(|v| v.into_iter().map(|p| p.to_string()).collect())
    } else {
        builder.blocking_pick_file().map(|p| vec![p.to_string()])
    };

    // Whitelist supaya file di luar workspace tetap bisa disimpan (ARCHITECTURE.md §7.1).
    if let Some(list) = &picked {
        for p in list {
            state.allow(std::path::Path::new(p));
        }
    }
    Ok(picked)
}

#[tauri::command(async)]
pub fn file_dialog_save(
    app: AppHandle,
    state: State<AppState>,
    default_path: Option<String>,
) -> ZResult<Option<String>> {
    let mut builder = app.dialog().file().set_title("Simpan File");
    match default_path.as_deref() {
        Some(dp) if !dp.is_empty() => {
            let p = std::path::Path::new(dp);
            if let Some(name) = p.file_name() {
                builder = builder.set_file_name(name.to_string_lossy().to_string());
            }
            if let Some(dir) = p.parent() {
                if dir.is_dir() {
                    builder = builder.set_directory(dir);
                }
            }
        }
        _ => {
            if let Some(ws) = state.workspace_path() {
                builder = builder.set_directory(ws);
            }
        }
    }

    let picked = builder.blocking_save_file().map(|p| p.to_string());
    if let Some(p) = &picked {
        state.allow(std::path::Path::new(p));
    }
    Ok(picked)
}

#[tauri::command(async)]
pub fn folder_dialog_open(app: AppHandle, state: State<AppState>) -> ZResult<Option<String>> {
    let picked = app
        .dialog()
        .file()
        .set_title("Buka Folder")
        .blocking_pick_folder()
        .map(|p| p.to_string());
    if let Some(p) = &picked {
        // Folder yang dipilih user: hanya folder ITU yang di-whitelist.
        // `allow()` akan ikut mengizinkan INDUK-nya (bug V2 fase 14).
        state.allow_exact(std::path::Path::new(p));
    }
    Ok(picked)
}
