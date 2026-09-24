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
        .map_err(|e| ZephyrError::Internal(format!("gagal menyusun JSON cron: {e}")))?;
    std::fs::write(&p, teks)?;
    Ok(())
}

fn id_baru() -> String {
    let n = epoch_sekarang();
    let jitter = std::process::id() as u64 % 1000;
    format!("job-{n}-{jitter}")
}

fn validasi_jadwal(every_minutes: u64, at_hour: Option<u32>) -> ZResult<()> {
    if every_minutes > 0 {
        return Ok(());
    }
    match at_hour {
        Some(h) if h <= 23 => Ok(()),
        Some(h) => Err(ZephyrError::InvalidInput(format!(
            "jam harian harus 0-23, bukan {h}"
        ))),
        None => Err(ZephyrError::InvalidInput(
            "isi every_minutes (>0) ATAU at_hour (0-23)".into(),
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
    let nm = name.trim();
    let cmd = command.trim();
    if nm.is_empty() {
        return Err(ZephyrError::InvalidInput("nama tugas kosong".into()));
    }
    if cmd.is_empty() {
        return Err(ZephyrError::InvalidInput("perintah kosong".into()));
    }
    validasi_jadwal(every_minutes, at_hour)?;
    let mut daftar = muat(state);
    if daftar.len() >= MAX_JOBS {
        return Err(ZephyrError::InvalidInput(format!(
            "batas {MAX_JOBS} tugas tercapai — hapus yang tidak dipakai dulu"
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
        return Err(ZephyrError::NotFound(format!("tugas '{id}' tidak ada")));
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
        return Err(ZephyrError::NotFound(format!("tugas '{id}' tidak ada")));
    }
    simpan(state, &daftar)
}

pub fn tandai_jalan(state: &AppState, id: &str) -> ZResult<()> {
    let mut daftar = muat(state);
    for j in daftar.iter_mut() {
        if j.id == id {
            j.last_run = Some(epoch_sekarang());
        }
    }
    simpan(state, &daftar)
}

pub fn jatuh_tempo(state: &AppState) -> Vec<CronJob> {
    let now = epoch_sekarang();
    muat(state)
        .into_iter()
        .filter(|j| matches!(j.jatuh_tempo(), Some(t) if t <= now))
        .collect()
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
) -> ZResult<CronJob> {
    tambah(&state, &name, &command, every_minutes.unwrap_or(0), at_hour)
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
        }
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
        assert!(validasi_jadwal(0, None).is_err());
    }

    #[test]
    fn harian_jam_di_luar_rentang_ditolak() {
        assert!(validasi_jadwal(0, Some(24)).is_err());
        assert!(validasi_jadwal(0, Some(23)).is_ok());
        assert!(validasi_jadwal(30, None).is_ok());
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
