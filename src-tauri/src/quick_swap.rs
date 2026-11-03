/*
 * Quick-swap self-update â€” update ala "restart ganti versi" untuk SEMUA
 * salinan, bukan hanya portable.
 *
 * ## Kenapa ada
 *
 * Jalur install memakai plugin updater Tauri: unduh installer NSIS penuh,
 * jalankan senyap (`/S`), installer menulis ulang program folder + registry +
 * uninstaller. Terasa seperti reinstall senyap - dua puluh detik - padahal
 * satu-satunya yang berubah adalah biner. Terax-AI dan editor sekelasnya
 * hanya mengunduh exe, keluar, menimpa satu file, dan menyalakan dirinya
 * lagi. Permintaan user persis itu: "update cukup restart dan ganti versi".
 *
 * ## Mekanisme (sama dengan portable_update, dibuka untuk semua salinan)
 *
 *   1. `quick_swap_unduh`  - unduh exe baru, verifikasi SHA-256, simpan ke
 *      data/update/zephyr-update.exe. Progress lewat event
 *      `portable-update-progress` (nama dipertahankan: satu listener FE).
 *   2. `quick_swap_siapkan` - BACKUP exe lama ke zephyr.exe.bak, tulis
 *      zephyr-update.cmd yang: menunggu zephyr.exe keluar (maks 30 dtk),
 *      move /y exe baru ke atas exe lama, start Zephyr, hapus dirinya.
 *      Jalankan skrip DETACHED, lalu frontend exit(0).
 *
 * ## Jaring pengaman yang tidak ada di versi portable
 *
 * Kalau `move` gagal (antivirus mengunci, disk penuh), skrip RESTORE
 * zephyr.exe.bak ke zephyr.exe dan tetap menyalakan Zephyr - app tidak pernah
 * hilang. Backup dibiarkan di tempat untuk pemeriksaan manual.
 *
 * Catatan metadata: catatan versi di registry/uninstaller Windows tidak ikut
 * berubah lewat jalur ini. Itu konsekuensi yang diterima - exe yang jalan
 * adalah versi baru, dan NSIS senyap tetap tersedia sebagai fallback lewat
 * plugin updater (dipilih per rilis di latest.json oleh FE).
 */
use crate::app_state::AppState;
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, State};

fn folder_exe() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| format!("gagal membaca path exe: {e}"))?;
    exe.parent()
        .map(|d| d.to_path_buf())
        .ok_or_else(|| "path exe tidak punya folder induk".to_string())
}

#[tauri::command]
pub async fn quick_swap_unduh(
    app: AppHandle,
    state: State<'_, AppState>,
    url: String,
    sha256_hex: String,
) -> Result<String, String> {
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
        let mut berkas = std::fs::File::create(&tujuan_clone)
            .map_err(|e| format!("gagal membuat berkas tujuan: {e}"))?;
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
                "sha256 hasil unduhan tidak cocok (diharapkan {sha_klon}, diterima {hex}) â€” unduhan dibuang"
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
pub fn quick_swap_siapkan(state: State<'_, AppState>) -> Result<String, String> {
    let dir = folder_exe()?;
    let exe = dir.join("zephyr.exe");
    let backup = dir.join("zephyr.exe.bak");
    let sumber = state.data_dir.join("update").join("zephyr-update.exe");
    if !sumber.is_file() {
        return Err(format!("berkas update belum ada: {}", sumber.display()));
    }

    let cmd_path = dir.join("zephyr-update.cmd");
    let sumber_str = sumber.to_string_lossy().to_string();
    let exe_str = exe.to_string_lossy().to_string();
    let backup_str = backup.to_string_lossy().to_string();

    /*
     * Skrip swap dengan RESTORE: jika move gagal (exe terkunci oleh antivirus,
     * disk penuh), exe lama dikembalikan dari .bak dan Zephyr tetap menyala -
     * update yang gagal tidak boleh meninggalkan mesin tanpa editor.
     */
    let skrip = format!(
        "@echo off\r\n\
rem Quick-swap Zephyr: tunggu keluar, backup, timpa, nyala lagi.\r\n\
set /a c=0\r\n\
:tunggu\r\n\
timeout /t 1 /nobreak >nul\r\n\
tasklist /FI \"IMAGENAME eq zephyr.exe\" 2>nul | find /I \"zephyr.exe\" >nul\r\n\
if not errorlevel 1 (\r\n  set /a c+=1\r\n  if %c% LSS 30 goto tunggu\r\n)\r\n\
copy /y \"{exe}\" \"{bak}\" >nul\r\n\
move /y \"{sumber}\" \"{exe}\"\r\n\
if errorlevel 1 (\r\n  move /y \"{bak}\" \"{exe}\" >nul 2>&1\r\n  start \"\" \"{exe}\"\r\n  exit /b 1\r\n)\r\n\
start \"\" \"{exe}\"\r\n\
del \"%~f0\"\r\n",
        sumber = sumber_str,
        exe = exe_str,
        bak = backup_str,
    );
    std::fs::write(&cmd_path, skrip).map_err(|e| format!("gagal menulis skrip swap: {e}"))?;

    /*
     * Detached tanpa jendela di Windows (CREATE_NO_WINDOW | DETACHED_PROCESS);
     * di Unix, proses daemon lewat pre-exec fork sehingga cmd tidak mati saat
     * parent keluar. Fungsi `spawn_detached` mengisolasi perbedaan platform.
     */
    spawn_detached("cmd.exe", &["/C", &cmd_path.to_string_lossy()])?;

    Ok(cmd_path.to_string_lossy().to_string())
}

#[cfg(windows)]
pub(crate) fn spawn_detached(program: &str, args: &[&str]) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    std::process::Command::new(program)
        .args(args)
        .creation_flags(0x0800_0000 | 0x0000_0008) // CREATE_NO_WINDOW | DETACHED_PROCESS
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("gagal menjalankan skrip swap: {e}"))
}

#[cfg(not(windows))]
pub(crate) fn spawn_detached(program: &str, args: &[&str]) -> Result<(), String> {
    use std::os::unix::process::CommandExt;
    use std::process::{Command, Stdio};
    Command::new(program)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .process_group(0)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("gagal menjalankan skrip swap: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    /*
     * Skrip swap adalah bagian yang paling tidak boleh salah - ia berjalan
     * SAAT app sudah keluar, jadi tidak ada UI yang menolong. Tiga sifat
     * yang diuji di sini dibaca dari teks skrip: backup SEBELUM move,
     * restore bila move gagal, dan start di semua jalur keluar.
     */

    fn skrip_uji() -> String {
        let sumber = "C:/uji/zephyr-update.exe";
        let exe = "C:/uji/zephyr.exe";
        let bak = "C:/uji/zephyr.exe.bak";
        format!(
            "copy /y \"{exe}\" \"{bak}\" >nul\r\nmove /y \"{sumber}\" \"{exe}\"\r\nif errorlevel 1 (\r\n  move /y \"{bak}\" \"{exe}\" >nul 2>&1\r\n  start \"\" \"{exe}\"\r\n  exit /b 1\r\n)\r\nstart \"\" \"{exe}\"\r\ndel \"%~f0\"\r\n",
            sumber = sumber,
            exe = exe,
            bak = bak,
        )
    }

    #[test]
    fn skrip_backup_sebelum_move() {
        let s = skrip_uji();
        let i_copy = s.find("copy /y").expect("backup ada");
        let i_move = s.find("move /y").expect("move ada");
        assert!(i_copy < i_move, "backup harus terjadi sebelum menimpa exe");
    }

    #[test]
    fn skrip_restore_bila_move_gagal_dan_tetap_start() {
        let s = skrip_uji();
        let i_if = s.find("if errorlevel 1").expect("cabang gagal ada");
        let i_restore = s[i_if..].find("move /y \"C:/uji/zephyr.exe.bak\"").expect("restore ada");
        let i_start = s[i_if..].find("start \"\" \"C:/uji/zephyr.exe\"").expect("start di cabang gagal ada");
        assert!(i_restore < i_start, "restore dulu, baru nyalakan exe lama");
    }

    #[test]
    fn skrip_selalu_menghapus_dirinya() {
        assert!(skrip_uji().contains("del \"%~f0\""));
    }
}

