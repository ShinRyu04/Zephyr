use crate::app_state::AppState;
use crate::errors::{ZResult, ZephyrError};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{Emitter, Manager, State};

pub const MAX_JOBS: usize = 50;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CronJob {
    pub id: String,
    pub name: String,

    pub command: String,

    pub every_minutes: u64,

    pub at_hour: Option<u32>,
    pub enabled: bool,

    pub last_run: Option<u64>,

    /**
     * Jadwal SEKALI-JALAN: satu target tunggal (epoch detik).
     *
     * Saling meniadakan dengan `every_minutes`/`at_hour` — dijaga
     * `validasi_jadwal`, karena jadwal yang "sekali" tapi juga "tiap 5 menit"
     * tidak punya arti yang jelas.
     *
     * `#[serde(default)]` bukan hiasan: tanpa itu, `cron.json` lama (tanpa
     * bidang baru ini) gagal di-parse dan `muat()` mengembalikan daftar KOSONG —
     * semua jadwal pengguna hilang senyap saat aplikasi diperbarui.
     */
    #[serde(default)]
    pub sekali_at: Option<u64>,

    /// Sekali-jalan sudah dijalankan (atau sudah dilaporkan terlewat). Job
    /// dengan `selesai = true` TIDAK PERNAH dijalankan lagi.
    #[serde(default)]
    pub selesai: bool,

    /// Jejak: target sekali-jalan yang TERLEWAT karena aplikasi tidak hidup saat
    /// waktunya tiba. Disimpan supaya keterlambatan itu tidak hilang senyap.
    #[serde(default)]
    pub terlewat: Option<u64>,
}

/**
 * Hasil penilaian satu jadwal pada satu saat.
 *
 * Dipisah dari "siap/tidak" yang lama karena jadwal sekali-jalan punya keadaan
 * ketiga yang penting: targetnya sudah lewat, tapi bukan karena timer
 * melewatkannya — aplikasinya memang sedang mati. Yang seperti itu TIDAK boleh
 * dijalankan terlambat; harus dilaporkan.
 */
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StatusJadwal {
    /// Nonaktif, atau belum waktunya.
    Belum,
    /// Waktunya jalan sekarang (sesi ini yang menunggunya).
    Siap,
    /// Sekali-jalan yang targetnya sudah lewat sebelum sesi ini hidup.
    Terlewat,
    /// Sekali-jalan yang sudah dijalankan/dilaporkan.
    Selesai,
}

impl CronJob {
    pub fn jatuh_tempo(&self) -> Option<u64> {
        if !self.enabled {
            return None;
        }
        if self.every_minutes > 0 {
            return Some(self.last_run.unwrap_or(0) + self.every_minutes * 60);
        }
        let jam = self.at_hour?;
        if jam > 23 {
            return None;
        }

        use chrono::{Datelike, Local, TimeZone};
        let now = Local::now();
        let mut target = match now.date_naive().and_hms_opt(jam, 0, 0) {
            Some(naive) => match Local.from_local_datetime(&naive).single() {
                Some(dt) => dt,

                None => return Some(epoch_sekarang() + 86_400),
            },
            None => return None,
        };
        let terakhir = self.last_run.unwrap_or(0) as i64;
        if terakhir >= target.timestamp() {
            target += chrono::Duration::days(1);
        } else if now >= target {
            return Some(epoch_sekarang());
        }
        let _ = now.year();
        Some(target.timestamp().max(0) as u64)
    }

    /**
     * Penilaian jadwal sekali-jalan pada satu waktu.
     *
     * `sesi_mulai` adalah epoch detik saat PROSES INI pertama hidup. Itulah
     * pembeda antara "timer di sesi ini melewatkannya" (tidak mungkin: timer
     * mengecek jadwal <= sekarang) dan "aplikasi memang tidak hidup saat
     * waktunya tiba".
     *
     * Aturan yang dipilih:
     * - target <= sekarang DAN target >= sesi_mulai -> waktunya jatuh saat sesi
     *   ini hidup, jadi `Siap` (dijalankan tepat waktu/beberapa detik telat);
     * - target < sesi_mulai -> aplikasi mati saat waktunya tiba. TIDAK dijalankan
     *   terlambat; ditandai `Terlewat` supaya bisa dilaporkan ke pengguna;
     * - `selesai = true` -> `Selesai`, titik. Inilah yang membuat jadwal
     *   sekali-jalan tidak pernah jalan dua kali, walau timer kebetulan
     *   mengeceknya berkali-kali dalam satu detik yang sama.
     */
    pub fn status(&self, sekarang: u64, sesi_mulai: u64) -> StatusJadwal {
        if !self.enabled {
            return StatusJadwal::Belum;
        }
        let Some(target) = self.sekali_at else {
            // Jadwal berulang: perilakunya persis seperti sebelum perubahan ini.
            return match self.jatuh_tempo() {
                Some(t) if t <= sekarang => StatusJadwal::Siap,
                _ => StatusJadwal::Belum,
            };
        };
        if self.selesai {
            return StatusJadwal::Selesai;
        }
        if target > sekarang {
            return StatusJadwal::Belum;
        }
        if target < sesi_mulai {
            return StatusJadwal::Terlewat;
        }
        StatusJadwal::Siap
    }
}

/**
 * Epoch detik saat proses ini mulai hidup.
 *
 * Dihitung dari `uptime_ms()` milik `AppState`, bukan dari berkas atau jam
 * dinding, supaya tidak ada keadaan tambahan yang perlu disimpan dan supaya
 * nilainya tetap benar walau jam sistem diubah setelah aplikasi hidup.
 */
pub fn sesi_mulai(state: &AppState) -> u64 {
    epoch_sekarang().saturating_sub(state.uptime_ms() / 1000)
}

pub fn epoch_sekarang() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn file_cron(state: &AppState) -> PathBuf {
    state.data_dir.join("cron.json")
}

pub fn muat(state: &AppState) -> Vec<CronJob> {
    let p = file_cron(state);
    match std::fs::read_to_string(&p) {
        Ok(s) => serde_json::from_str(&s).unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

fn simpan(state: &AppState, daftar: &[CronJob]) -> ZResult<()> {
    let p = file_cron(state);
    if let Some(dir) = p.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let teks = serde_json::to_string_pretty(daftar)
        .map_err(|e| ZephyrError::Internal(format!("building the cron JSON failed: {e}")))?;
    std::fs::write(&p, teks)?;
    Ok(())
}

fn id_baru() -> String {
    let n = epoch_sekarang();
    let jitter = std::process::id() as u64 % 1000;
    format!("job-{n}-{jitter}")
}

fn validasi_jadwal(every_minutes: u64, at_hour: Option<u32>, sekali_at: Option<u64>) -> ZResult<()> {
    /*
     * Sekali-jalan saling meniadakan dengan jadwal berulang. Tanpa aturan ini,
     * jadwal yang isinya "sekali pada jam X" DAN "tiap 5 menit" akan lolos, dan
     * arti mana yang menang tidak pernah jelas.
     */
    if let Some(t) = sekali_at {
        if every_minutes > 0 || at_hour.is_some() {
            return Err(ZephyrError::InvalidInput(
                "jadwal sekali-jalan tidak boleh digabung dengan every_minutes/at_hour - pilih salah satu"
                    .into(),
            ));
        }
        if t == 0 {
            return Err(ZephyrError::InvalidInput(
                "sekali_at harus epoch detik > 0".into(),
            ));
        }
        return Ok(());
    }
    if every_minutes > 0 {
        return Ok(());
    }
    match at_hour {
        Some(h) if h <= 23 => Ok(()),
        Some(h) => Err(ZephyrError::InvalidInput(format!(
            "the daily hour must be 0-23, not {h}"
        ))),
        None => Err(ZephyrError::InvalidInput(
            "isi every_minutes (>0) ATAU at_hour (0-23) ATAU sekali_at (epoch detik)".into(),
        )),
    }
}

pub fn tambah(
    state: &AppState,
    name: &str,
    command: &str,
    every_minutes: u64,
    at_hour: Option<u32>,
) -> ZResult<CronJob> {
    tambah_penuh(state, name, command, every_minutes, at_hour, None)
}

/// Varian `tambah` yang juga menerima jadwal sekali-jalan.
pub fn tambah_penuh(
    state: &AppState,
    name: &str,
    command: &str,
    every_minutes: u64,
    at_hour: Option<u32>,
    sekali_at: Option<u64>,
) -> ZResult<CronJob> {
    let nm = name.trim();
    let cmd = command.trim();
    if nm.is_empty() {
        return Err(ZephyrError::InvalidInput("empty task name".into()));
    }
    if cmd.is_empty() {
        return Err(ZephyrError::InvalidInput("empty command".into()));
    }
    validasi_jadwal(every_minutes, at_hour, sekali_at)?;
    let mut daftar = muat(state);
    if daftar.len() >= MAX_JOBS {
        return Err(ZephyrError::InvalidInput(format!(
            "the limit of {MAX_JOBS} jobs has been reached — delete the ones you no longer use first"
        )));
    }
    let job = CronJob {
        id: id_baru(),
        name: nm.to_string(),
        command: cmd.to_string(),
        every_minutes,
        at_hour,
        enabled: true,
        last_run: None,
        sekali_at,
        selesai: false,
        terlewat: None,
    };
    daftar.push(job.clone());
    simpan(state, &daftar)?;
    Ok(job)
}

pub fn hapus(state: &AppState, id: &str) -> ZResult<()> {
    let mut daftar = muat(state);
    let sebelum = daftar.len();
    daftar.retain(|j| j.id != id);
    if daftar.len() == sebelum {
        return Err(ZephyrError::NotFound(format!("task '{id}' does not exist")));
    }
    simpan(state, &daftar)
}

pub fn set_aktif(state: &AppState, id: &str, aktif: bool) -> ZResult<()> {
    let mut daftar = muat(state);
    let mut kena = false;
    for j in daftar.iter_mut() {
        if j.id == id {
            j.enabled = aktif;
            kena = true;
        }
    }
    if !kena {
        return Err(ZephyrError::NotFound(format!("task '{id}' does not exist")));
    }
    simpan(state, &daftar)
}

pub fn tandai_jalan(state: &AppState, id: &str) -> ZResult<()> {
    let mut daftar = muat(state);
    for j in daftar.iter_mut() {
        if j.id == id {
            j.last_run = Some(epoch_sekarang());
            if j.sekali_at.is_some() {
                /*
                 * Sekali-jalan ditandai selesai di sini, di berkas yang sama
                 * dengan `last_run`. Jadi walau aplikasi mati tepat setelah job
                 * dijalankan, penandanya sudah tersimpan, dan saat hidup lagi
                 * job itu tidak akan dianggap "terlewat" lalu dijalankan dua kali.
                 */
                j.selesai = true;
                j.terlewat = None;
            }
        }
    }
    simpan(state, &daftar)
}

/**
 * Jadwal yang waktunya tiba SEKARANG dan harus dijalankan di sesi ini.
 *
 * Untuk jadwal berulang, hasilnya identik dengan sebelum perubahan ini
 * (`jatuh_tempo() <= sekarang`). Jadwal sekali-jalan hanya muncul di sini kalau
 * targetnya jatuh SETELAH sesi ini hidup; kalau targetnya sudah lewat sebelum
 * sesi ini hidup, ia dilaporkan `Terlewat` oleh `lapor_terlewat`, bukan
 * dijalankan terlambat.
 */
pub fn jatuh_tempo(state: &AppState) -> Vec<CronJob> {
    let now = epoch_sekarang();
    let sesi = sesi_mulai(state);
    muat(state)
        .into_iter()
        .filter(|j| j.status(now, sesi) == StatusJadwal::Siap)
        .collect()
}

/**
 * Jejak jadwal sekali-jalan yang targetnya sudah lewat SEBELUM sesi ini hidup
 * dan belum pernah dilaporkan.
 */
pub fn terlewat_belum_dilapor(state: &AppState) -> Vec<CronJob> {
    let now = epoch_sekarang();
    let sesi = sesi_mulai(state);
    muat(state)
        .into_iter()
        .filter(|j| {
            j.status(now, sesi) == StatusJadwal::Terlewat && j.terlewat.is_none()
        })
        .collect()
}

/**
 * Pemulihan saat aplikasi hidup lagi: tandai jadwal sekali-jalan yang terlewat
 * sebagai `terlewat` (tersimpan ke `cron.json`) dan kembalikan daftarnya supaya
 * pemanggil bisa melaporkannya ke pengguna.
 *
 * Yang SENGAJA TIDAK dilakukan: menjalankan job yang terlewat. Job berkurang
 * satu kali jalan, tapi tidak ada perintah pengguna yang nomplok di waktu yang
 * tidak diinginkan pengguna; jejaknya tetap ada dan bisa dijalankan ulang
 * dengan sengaja lewat "Jalankan sekarang".
 *
 * Aman dipanggil berkali-kali: laporan pertama menulis `terlewat`, dan
 * pemanggilan berikutnya mengembalikan daftar kosong (tidak ada laporan ganda).
 */
pub fn lapor_terlewat(state: &AppState) -> ZResult<Vec<CronJob>> {
    let now = epoch_sekarang();
    let sesi = sesi_mulai(state);
    let mut daftar = muat(state);
    let mut dilapor: Vec<CronJob> = Vec::new();
    let mut berubah = false;
    for j in daftar.iter_mut() {
        if j.status(now, sesi) == StatusJadwal::Terlewat && j.terlewat.is_none() {
            let target = j.sekali_at.unwrap_or(0);
            j.terlewat = Some(target);
            dilapor.push(j.clone());
            berubah = true;
        }
    }
    if berubah {
        simpan(state, &daftar)?;
    }
    Ok(dilapor)
}

/// Teks laporan satu jadwal terlewat, dipakai untuk notifikasi/CLI supaya
/// formatnya sama di semua jalur.
pub fn pesan_terlewat(j: &CronJob) -> String {
    let target = j.sekali_at.or(j.terlewat).unwrap_or(0);
    format!(
        "jadwal sekali-jalan \"{}\" terlewat: waktunya tiba ({}) saat aplikasi tidak hidup dan TIDAK dijalankan terlambat",
        j.name, target
    )
}

static TIMER_MULAI: Mutex<bool> = Mutex::new(false);

pub fn mulai_timer(app: tauri::AppHandle) {
    let mut mulai = match TIMER_MULAI.lock() {
        Ok(g) => g,
        Err(_) => return,
    };
    if *mulai {
        return;
    }
    *mulai = true;
    drop(mulai);

    /*
     * Pemulihan dijalankan DI SINI, sebelum thread timer dibuat dan sebelum
     * pengecekan berkala pertama: jadwal sekali-jalan yang terlewat ditandai
     * `terlewat` lebih dulu, sehingga timer tidak pernah sempat menganggapnya
     * "siap jalan" lalu menjalankannya terlambat.
     */
    match pulihkan_jadwal_terlewat(&app) {
        Ok(lewat) if !lewat.is_empty() => {
            tracing::info!(
                jumlah = lewat.len(),
                "jadwal sekali-jalan yang terlewat dilaporkan saat aplikasi hidup"
            );
        }
        Ok(_) => {}
        Err(e) => tracing::warn!("gagal memulihkan jadwal terlewat: {e}"),
    }

    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(30));
        let state = match app.try_state::<AppState>() {
            Some(s) => s,
            None => continue,
        };
        let due = jatuh_tempo(&state);
        for job in due {
            let _ = tandai_jalan(&state, &job.id);
            let _ = app.emit("cron-due", &job);
        }
    });
}

/**
 * Pemulihan jadwal yang terlewat saat aplikasi mati, dijalankan sekali saat
 * aplikasi hidup lagi.
 *
 * Dipanggil dari `mulai_timer` SEBELUM timer berkala mulai bekerja, supaya
 * jeleknya kebijakan "terlambat -> dijalankan" tidak pernah aktif walau
 * sekejap. Hasilnya juga disimpan ke `cron.json` (lewat `lapor_terlewat`), jadi
 * laporan ini bukan cuma log yang menguap.
 */
pub fn pulihkan_jadwal_terlewat(app: &tauri::AppHandle) -> ZResult<Vec<CronJob>> {
    let state = match app.try_state::<AppState>() {
        Some(s) => s,
        None => return Ok(Vec::new()),
    };
    let lewat = lapor_terlewat(&state)?;
    for job in &lewat {
        tracing::warn!("{}", pesan_terlewat(job));
        let _ = app.emit("cron-missed", job);
    }
    Ok(lewat)
}

#[tauri::command]
pub fn cron_list(state: State<AppState>) -> ZResult<Vec<CronJob>> {
    Ok(muat(&state))
}

#[tauri::command]
pub fn cron_create(
    state: State<AppState>,
    name: String,
    command: String,
    every_minutes: Option<u64>,
    at_hour: Option<u32>,
    sekali_at: Option<u64>,
) -> ZResult<CronJob> {
    tambah_penuh(
        &state,
        &name,
        &command,
        every_minutes.unwrap_or(0),
        at_hour,
        sekali_at,
    )
}

#[tauri::command]
pub fn cron_delete(state: State<AppState>, id: String) -> ZResult<()> {
    hapus(&state, &id)
}

#[tauri::command]
pub fn cron_toggle(state: State<AppState>, id: String, enabled: bool) -> ZResult<()> {
    set_aktif(&state, &id, enabled)
}

#[tauri::command]
pub fn cron_due(state: State<AppState>) -> ZResult<Vec<CronJob>> {
    Ok(jatuh_tempo(&state))
}

#[tauri::command]
pub fn cron_mark_run(state: State<AppState>, id: String) -> ZResult<()> {
    tandai_jalan(&state, &id)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn job(every: u64, at: Option<u32>, last: Option<u64>) -> CronJob {
        CronJob {
            id: "x".into(),
            name: "uji".into(),
            command: "echo".into(),
            every_minutes: every,
            at_hour: at,
            enabled: true,
            last_run: last,
            sekali_at: None,
            selesai: false,
            terlewat: None,
        }
    }

    fn job_sekali(target: u64) -> CronJob {
        CronJob {
            sekali_at: Some(target),
            every_minutes: 0,
            ..job(0, None, None)
        }
    }

    /// State dengan `data_dir` di folder sementara, supaya `cron.json` uji tidak
    /// menyentuh data asli pengguna.
    fn state_uji(nama: &str) -> (AppState, PathBuf) {
        let akar =
            std::env::temp_dir().join(format!("zephyr-cron-{nama}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&akar);
        std::fs::create_dir_all(&akar).expect("buat folder uji");
        let mut st = AppState::new();
        st.data_dir = akar.clone();
        (st, akar)
    }

    fn beres(akar: &PathBuf) {
        let _ = std::fs::remove_dir_all(akar);
    }

    #[test]
    fn nonaktif_tidak_pernah_jatuh_tempo() {
        let mut j = job(1, None, None);
        j.enabled = false;
        assert!(j.jatuh_tempo().is_none());
    }

    #[test]
    fn interval_dihitung_dari_jalan_terakhir() {
        let now = epoch_sekarang();
        let j = job(10, None, Some(now - 600));

        let t = j.jatuh_tempo().unwrap();
        assert!(t <= now + 1);
    }

    #[test]
    fn interval_belum_waktunya() {
        let now = epoch_sekarang();
        let j = job(60, None, Some(now));
        assert!(j.jatuh_tempo().unwrap() > now);
    }

    #[test]
    fn harian_tanpa_jam_tidak_valid() {
        assert!(validasi_jadwal(0, None, None).is_err());
    }

    #[test]
    fn harian_jam_di_luar_rentang_ditolak() {
        assert!(validasi_jadwal(0, Some(24), None).is_err());
        assert!(validasi_jadwal(0, Some(23), None).is_ok());
        assert!(validasi_jadwal(30, None, None).is_ok());
    }

    /* ---- Jadwal sekali-jalan + pemulihan jadwal terlewat ---- */

    #[test]
    fn status_sekali_jalan_deterministik() {
        let sekarang = 1_000_000u64;
        let sesi = 900_000u64;

        // Target jauh di depan -> belum waktunya.
        assert_eq!(job_sekali(sekarang + 60).status(sekarang, sesi), StatusJadwal::Belum);
        // Target jatuh saat sesi ini hidup -> siap.
        assert_eq!(job_sekali(sekarang).status(sekarang, sesi), StatusJadwal::Siap);
        assert_eq!(job_sekali(sesi).status(sekarang, sesi), StatusJadwal::Siap);
        // Target sudah lewat SEBELUM sesi ini hidup -> terlewat, bukan "siap".
        assert_eq!(job_sekali(sesi - 1).status(sekarang, sesi), StatusJadwal::Terlewat);
        // Sudah ditandai selesai -> selesai, apa pun targetnya.
        let mut selesai = job_sekali(sekarang);
        selesai.selesai = true;
        assert_eq!(selesai.status(sekarang, sesi), StatusJadwal::Selesai);
        assert_eq!(
            job_sekali(sesi - 1).status(sekarang, sesi),
            StatusJadwal::Terlewat
        );
        // Nonaktif menang atas semuanya.
        let mut mati = job_sekali(sekarang);
        mati.enabled = false;
        assert_eq!(mati.status(sekarang, sesi), StatusJadwal::Belum);
    }

    #[test]
    fn validasi_sekali_jalan_saling_meniadakan_dengan_berulang() {
        assert!(validasi_jadwal(0, None, Some(epoch_sekarang() + 60)).is_ok());
        assert!(validasi_jadwal(5, None, Some(epoch_sekarang() + 60)).is_err());
        assert!(validasi_jadwal(0, Some(3), Some(epoch_sekarang() + 60)).is_err());
        assert!(validasi_jadwal(0, None, Some(0)).is_err());
    }

    #[test]
    fn sekali_jalan_tidak_pernah_jalan_dua_kali() {
        let (st, akar) = state_uji("sekali");
        let job = tambah_penuh(&st, "sekali", "echo hai", 0, None, Some(epoch_sekarang()))
            .expect("tambah jadwal sekali-jalan");

        // Waktunya tiba di sesi ini -> muncul sebagai jatuh tempo.
        let due = jatuh_tempo(&st);
        assert_eq!(due.len(), 1, "jadwal sekali-jalan harus jatuh tempo sekali");
        assert_eq!(due[0].id, job.id);

        // Dijalankan: ditandai di disk.
        tandai_jalan(&st, &job.id).expect("tandai jalan");
        let di_disk = muat(&st);
        assert!(di_disk[0].selesai, "sekali-jalan harus ditandai selesai");

        // Cek berkali-kali setelah itu: tidak boleh muncul lagi.
        for _ in 0..3 {
            assert!(
                jatuh_tempo(&st).is_empty(),
                "sekali-jalan tidak boleh dijalankan dua kali"
            );
        }
        assert!(lapor_terlewat(&st).expect("lapor").is_empty());
        beres(&akar);
    }

    #[test]
    fn jadwal_terlewat_dilaporkan_bukan_dijalankan_terlambat() {
        let (st, akar) = state_uji("terlewat");
        // Target 1 menit SEBELUM sesi ini hidup: persis kasus "aplikasi mati saat
        // waktunya tiba".
        let target = sesi_mulai(&st).saturating_sub(60);
        assert!(target > 0);
        let job =
            tambah_penuh(&st, "lapor", "echo hai", 0, None, Some(target)).expect("tambah");

        assert!(
            jatuh_tempo(&st).is_empty(),
            "jadwal terlewat TIDAK boleh dijalankan terlambat"
        );

        let lapor = lapor_terlewat(&st).expect("lapor terlewat");
        assert_eq!(lapor.len(), 1);
        assert_eq!(lapor[0].id, job.id);
        assert_eq!(lapor[0].terlewat, Some(target));
        assert!(pesan_terlewat(&lapor[0]).contains("lapor"));

        // Jejak tersimpan: bukan cuma ada di memori.
        let di_disk = muat(&st);
        assert_eq!(di_disk[0].terlewat, Some(target));
        assert!(!di_disk[0].selesai, "terlewat bukan berarti sudah dijalankan");

        // Laporan kedua tidak menggandakan.
        assert!(lapor_terlewat(&st).expect("lapor kedua").is_empty());
        assert!(terlewat_belum_dilapor(&st).is_empty());
        assert!(jatuh_tempo(&st).is_empty());
        beres(&akar);
    }

    #[test]
    fn terlewat_dan_refresh_daftar_tidak_menghidupkannya_kembali() {
        // Skenario nyata: app mati, jadwal terlewat, app hidup lagi -> dilaporkan,
        // lalu timer berkala tetap tidak menjalankannya.
        let (st, akar) = state_uji("hidup-lagi");
        let target = sesi_mulai(&st).saturating_sub(600);
        tambah_penuh(&st, "pagi", "echo hai", 0, None, Some(target)).expect("tambah");

        assert_eq!(lapor_terlewat(&st).expect("lapor").len(), 1);
        for _ in 0..5 {
            assert!(jatuh_tempo(&st).is_empty());
        }
        // Job lama (dibuat sebelum bidang baru ada) tetap termuat: `serde(default)`.
        let lama = r#"[{"id":"job-lama","name":"lama","command":"echo","every_minutes":60,"at_hour":null,"enabled":true,"last_run":null}]"#;
        std::fs::write(st.data_dir.join("cron.json"), lama).expect("tulis cron.json lama");
        let termuat = muat(&st);
        assert_eq!(termuat.len(), 1, "cron.json lama tidak boleh hilang senyap");
        assert!(termuat[0].sekali_at.is_none());
        assert!(!termuat[0].selesai);
        beres(&akar);
    }

    #[test]
    fn jadwal_berulang_lama_tidak_berubah_perilakunya() {
        let (st, akar) = state_uji("berulang");
        let now = epoch_sekarang();

        // Jatuh tempo: last_run lama -> harus jalan.
        let j_due = tambah_penuh(&st, "berulang-due", "echo", 10, None, None).expect("tambah");
        {
            let mut daftar = muat(&st);
            daftar[0].last_run = Some(now - 600);
            simpan(&st, &daftar).expect("simpan last_run");
        }
        let due = jatuh_tempo(&st);
        assert!(due.iter().any(|j| j.id == j_due.id), "berulang lama harus jatuh tempo");

        // Belum waktunya: last_run baru -> tidak jalan.
        let j_nanti = tambah_penuh(&st, "berulang-nanti", "echo", 60, None, None).expect("tambah");
        {
            let mut daftar = muat(&st);
            for j in daftar.iter_mut() {
                if j.id == j_nanti.id {
                    j.last_run = Some(now);
                }
            }
            simpan(&st, &daftar).expect("simpan last_run");
        }
        let due = jatuh_tempo(&st);
        assert!(!due.iter().any(|j| j.id == j_nanti.id), "belum waktunya tidak jalan");

        // Harian tetap valid dan tidak dianggap sekali-jalan.
        let j_harian = tambah_penuh(&st, "harian", "echo", 0, Some(23), None).expect("tambah");
        let semua = muat(&st);
        let harian = semua.iter().find(|j| j.id == j_harian.id).unwrap();
        assert!(harian.sekali_at.is_none());
        assert!(harian.jatuh_tempo().is_some());

        // Tidak ada jadwal berulang yang dilaporkan sebagai terlewat.
        assert!(lapor_terlewat(&st).expect("lapor").is_empty());
        beres(&akar);
    }

    #[test]
    fn jatuh_tempo_harian_di_masa_depan() {
        let now = epoch_sekarang();
        let jam_depan = ((now % 86_400) / 3600 + 2) % 24;
        let j = job(0, Some(jam_depan as u32), Some(now));
        let t = j.jatuh_tempo().unwrap();
        assert!(t >= now);
        assert!(t <= now + 86_400 + 60);
    }
}
