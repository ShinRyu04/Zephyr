/*
 * Portable self-update — dua command yang melengkapi `updaterStore` untuk
 * salinan PORTABLE (tanda: berkas kosong bernama `portable` di sebelah exe).
 *
 * Installer NSIS hanya menimpa produk TERINSTALL di %LOCALAPPDATA%, jadi
 * portable dulu diblokir dari update (keluhan user: portable tak bisa update).
 * Konsepnya sekarang:
 *
 *   1. `portable_update_unduh`  — unduh exe portable baru dari URL rilis,
 *      verifikasi SHA-256 (integritas unduhan; transportnya HTTPS ke repo
 *      rilis user), simpan ke `data/update/zephyr-update.exe`. Progress
 *      dipancarkan lewat event `portable-update-progress`.
 *   2. `portable_update_siapkan` — tulis `zephyr-update.cmd` di sebelah exe
 *      dan jalankan ia DETACHED. Skrip itu menunggu zephyr.exe keluar
 *      (Windows mengunci exe yang sedang jalan), menimpa exe dengan yang
 *      baru, menyalakan Zephyr lagi, lalu menghapus dirinya. Frontend cukup
 *      memanggil exit(0) setelah command ini sukses.
 *
 * Kedua command MENOLAK jalan kalau salinannya bukan portable: jalur ini
 * tidak boleh menjadi pintu kedua bagi salinan terinstall untuk mengganti
 * binarinya sendiri di luar updater NSIS.
 */
use crate::app_state::AppState;
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, State};

fn pasti_portable() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| format!("gagal membaca path exe: {e}"))?;
    let dir = exe
        .parent()
        .map(|d| d.to_path_buf())
        .ok_or_else(|| "path exe tidak punya folder induk".to_string())?;
    if !crate::cli_ext::portable_aktif() {
        return Err("bukan salinan portable: jalur update ini hanya untuk salinan portable".into());
    }
    Ok(dir)
}

#[tauri::command]
pub async fn portable_update_unduh(
    app: AppHandle,
    state: State<'_, AppState>,
    url: String,
    sha256_hex: String,
) -> Result<String, String> {
    pasti_portable()?;

    let tujuan = state.data_dir.join("update").join("zephyr-update.exe");
    let tujuan_clone = tujuan.clone();
    let url_clone = url.clone();
    let sha_klon = sha256_hex.trim().to_lowercase();

    let hasil = tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let respons = ureq::get(&url_clone)
            .call()
            .map_err(|e| format!("unduhan gagal: {e}"))?;
        let total: u64 = respons
            .headers()
            .get("content-length")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse().ok())
            .unwrap_or(0);

        if let Some(parent) = tujuan_clone.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("gagal membuat folder update: {e}"))?;
        }
        let mut berkas =
            std::fs::File::create(&tujuan_clone).map_err(|e| format!("gagal membuat berkas tujuan: {e}"))?;
        let mut reader = respons.into_body().into_reader();
        let mut hasher = Sha256::new();
        let mut buffer = [0u8; 64 * 1024];
        let mut terunduh: u64 = 0;
        let mut terakhir: u64 = 0;
        loop {
            let n = reader
                .read(&mut buffer)
                .map_err(|e| format!("gagal membaca aliran unduhan: {e}"))?;
            if n == 0 {
                break;
            }
            berkas
                .write_all(&buffer[..n])
                .map_err(|e| format!("gagal menulis berkas tujuan: {e}"))?;
            hasher.update(&buffer[..n]);
            terunduh += n as u64;
            /* Laporan progres tiap ~256 KiB, jangan membanjiri event bus. */
            if terunduh - terakhir >= 256 * 1024 || (total > 0 && terunduh == total) {
                terakhir = terunduh;
                let persen = if total > 0 {
                    Some((terunduh as f64 / total as f64 * 100.0) as u32)
                } else {
                    None
                };
                let _ = app.emit(
                    "portable-update-progress",
                    serde_json::json!({ "terunduh": terunduh, "total": total, "persen": persen }),
                );
            }
        }
        berkas.flush().ok();
        drop(berkas);

        let hex: String = {
            let mut f = std::fs::File::open(&tujuan_clone)
                .map_err(|e| format!("gagal membuka hasil unduhan untuk verifikasi: {e}"))?;
            let mut h = Sha256::new();
            std::io::copy(&mut f, &mut h).map_err(|e| format!("gagal menghitung sha256: {e}"))?;
            h.finalize()
                .iter()
                .map(|b| format!("{b:02x}"))
                .collect()
        };
        if hex != sha_klon {
            let _ = std::fs::remove_file(&tujuan_clone);
            return Err(format!(
                "sha256 hasil unduhan tidak cocok (diharapkan {sha_klon}, diterima {hex}) — unduhan dibuang"
            ));
        }
        Ok(())
    })
    .await
    .map_err(|e| format!("tugas unduhan gagal: {e}"))?;

    hasil?;
    Ok(tujuan.to_string_lossy().to_string())
}

#[tauri::command]
pub fn portable_update_siapkan(state: State<'_, AppState>) -> Result<String, String> {
    let dir = pasti_portable()?;

    let exe = dir.join("zephyr.exe");
    let sumber = state.data_dir.join("update").join("zephyr-update.exe");
    if !sumber.is_file() {
        return Err(format!("berkas update belum ada: {}", sumber.display()));
    }

    let cmd_path = dir.join("zephyr-update.cmd");
    let sumber_str = sumber.to_string_lossy();
    let exe_str = exe.to_string_lossy();
    let skrip = format!(
        "@echo off\r\nrem Tunggu zephyr.exe keluar (maks 30 detik) lalu timpa dengan versi baru.\r\nset /a c=0\r\n:tunggu\r\ntimeout /t 1 /nobreak >nul\r\ntasklist /FI \"IMAGENAME eq zephyr.exe\" 2>nul | find /I \"zephyr.exe\" >nul\r\nif not errorlevel 1 (\r\n  set /a c+=1\r\n  if %c% LSS 30 goto tunggu\r\n)\r\nmove /y \"{sumber}\" \"{exe}\"\r\nif errorlevel 1 exit /b 1\r\nstart \"\" \"{exe}\"\r\ndel \"%~f0\"\r\n",
        sumber = sumber_str,
        exe = exe_str,
    );
    std::fs::write(&cmd_path, skrip).map_err(|e| format!("gagal menulis skrip swap: {e}"))?;

    /*
     * Detached tanpa jendela (lihat quick_swap::spawn_detached): skrip harus
     * hidup setelah app keluar, dan tanpa jendela konsol di Windows.
     */
    crate::quick_swap::spawn_detached("cmd.exe", &["/C", &cmd_path.to_string_lossy()])?;

    Ok(cmd_path.to_string_lossy().to_string())
}
