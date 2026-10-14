use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};

const MAX_BYTES: u64 = 2 * 1024 * 1024;

const KEEP: usize = 3;

static SINK: OnceLock<LogSink> = OnceLock::new();

static EMIT: OnceLock<tauri::AppHandle> = OnceLock::new();

static PANICKED: AtomicBool = AtomicBool::new(false);

static LAST_PANIC: OnceLock<Mutex<String>> = OnceLock::new();

struct Inner {
    file: Option<File>,
    path: PathBuf,
    written: u64,
}

#[derive(Clone)]
pub struct LogSink(std::sync::Arc<Mutex<Inner>>);

impl LogSink {
    fn open(dir: &Path) -> Self {
        let _ = std::fs::create_dir_all(dir);
        let path = dir.join(format!(
            "zephyr-{}.log",
            chrono::Local::now().format("%Y-%m-%d")
        ));
        let (file, written) = match OpenOptions::new().create(true).append(true).open(&path) {
            Ok(f) => {
                let len = f.metadata().map(|m| m.len()).unwrap_or(0);
                (Some(f), len)
            }
            Err(_) => (None, 0),
        };
        LogSink(std::sync::Arc::new(Mutex::new(Inner {
            file,
            path,
            written,
        })))
    }

    pub fn write_line(&self, line: &str) {
        if let Ok(mut inner) = self.0.lock() {
            let mut buf = line.as_bytes().to_vec();
            buf.push(b'\n');
            write_locked(&mut inner, &buf);
        }
    }

    pub fn path(&self) -> PathBuf {
        self.0
            .lock()
            .map(|i| i.path.clone())
            .unwrap_or_else(|_| PathBuf::from("zephyr.log"))
    }
}

fn write_locked(inner: &mut Inner, buf: &[u8]) {
    if inner.written + buf.len() as u64 > MAX_BYTES {
        rotate(inner);
    }
    if let Some(f) = inner.file.as_mut() {
        if f.write_all(buf).is_ok() {
            inner.written += buf.len() as u64;
        }
    }
}

fn rotate(inner: &mut Inner) {
    inner.file = None;

    let stem = inner
        .path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "zephyr".to_string());
    let dir = inner
        .path
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| PathBuf::from("."));
    let nth = |n: usize| dir.join(format!("{stem}-{n}.log"));

    let _ = std::fs::remove_file(nth(KEEP));
    for n in (1..KEEP).rev() {
        if nth(n).exists() {
            let _ = std::fs::rename(nth(n), nth(n + 1));
        }
    }
    let _ = std::fs::rename(&inner.path, nth(1));

    inner.file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&inner.path)
        .ok();
    inner.written = 0;
}

pub struct LogWriter(LogSink);

impl Write for LogWriter {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        if let Ok(mut inner) = self.0 .0.lock() {
            write_locked(&mut inner, buf);
        }
        Ok(buf.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        if let Ok(mut inner) = self.0 .0.lock() {
            if let Some(f) = inner.file.as_mut() {
                let _ = f.flush();
            }
        }
        Ok(())
    }
}

impl<'a> tracing_subscriber::fmt::MakeWriter<'a> for LogSink {
    type Writer = LogWriter;
    fn make_writer(&'a self) -> Self::Writer {
        LogWriter(self.clone())
    }
}

pub fn init(dir: &Path) {
    if SINK.get().is_some() {
        return;
    }
    let sink = LogSink::open(dir);
    let _ = SINK.set(sink.clone());

    let level = level_from_env().unwrap_or({
        if cfg!(debug_assertions) {
            tracing::Level::DEBUG
        } else {
            tracing::Level::INFO
        }
    });

    let _ = tracing_subscriber::fmt()
        .with_writer(sink.clone())
        .with_ansi(false)
        .with_target(true)
        .with_max_level(level)
        .try_init();

    install_panic_hook();

    tracing::info!(
        version = env!("CARGO_PKG_VERSION"),
        level = %level,
        file = %sink.path().to_string_lossy(),
        "application start"
    );
}

fn level_from_env() -> Option<tracing::Level> {
    let raw = std::env::var("ZEPHYR_LOG").ok()?;
    match raw.trim().to_ascii_lowercase().as_str() {
        "trace" => Some(tracing::Level::TRACE),
        "debug" => Some(tracing::Level::DEBUG),
        "info" => Some(tracing::Level::INFO),
        "warn" => Some(tracing::Level::WARN),
        "error" => Some(tracing::Level::ERROR),
        _ => None,
    }
}

fn install_panic_hook() {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let msg = panic_message(info);
        let loc = info
            .location()
            .map(|l| format!("{}:{}", l.file(), l.line()))
            .unwrap_or_else(|| "?".into());
        let bt = std::backtrace::Backtrace::force_capture();

        if let Some(sink) = SINK.get() {
            sink.write_line(&format!(
                "{} PANIC di {loc}: {msg}",
                chrono::Local::now().format("%Y-%m-%dT%H:%M:%S%.3f")
            ));
            sink.write_line(&format!("{bt}"));
        }

        tracing::error!(location = %loc, "panic: {msg}");

        PANICKED.store(true, Ordering::SeqCst);
        if let Ok(mut slot) = LAST_PANIC.get_or_init(|| Mutex::new(String::new())).lock() {
            *slot = format!("{msg} ({loc})");
        }

        if let Some(app) = EMIT.get() {
            use tauri::Emitter;
            let _ = app.emit(
                "app-panic",
                serde_json::json!({
                    "message": msg,
                    "location": loc,
                    "logFile": SINK.get().map(|s| s.path().to_string_lossy().to_string()),
                }),
            );
        }

        previous(info);
    }));
}

pub fn attach_app(app: tauri::AppHandle) {
    let _ = EMIT.set(app);
}

fn panic_message(info: &std::panic::PanicHookInfo<'_>) -> String {
    if let Some(s) = info.payload().downcast_ref::<&str>() {
        (*s).to_string()
    } else if let Some(s) = info.payload().downcast_ref::<String>() {
        s.clone()
    } else {
        "panic tanpa pesan".to_string()
    }
}

pub fn log_file_path() -> Option<PathBuf> {
    SINK.get().map(|s| s.path())
}

/// Batas yang dipakai `log_tail` (dibaca test, jangan ditulis ulang di dua tempat).
pub const LOG_TAIL_N_BAWAAN: usize = 200;
pub const LOG_TAIL_N_MAKS: usize = 1000;
pub const LOG_TAIL_BYTES_BAWAAN: u64 = 64 * 1024;
pub const LOG_TAIL_BYTES_MAKS: u64 = 1024 * 1024;
pub const LOG_TAIL_BYTES_MIN: u64 = 1024;

/// Baca `n` baris terakhir dari sebuah berkas, MUNDUR dari akhir.
///
/// - Hanya `max_bytes` ekor yang dibaca, jadi berkas 2 MiB tidak dibaca penuh.
/// - Kalau pembacaan mulai di TENGAH baris (rotasi berbarengan / ekor terpotong),
///   baris pertama yang setengah itu DIBUANG - frontend tidak boleh menerima
///   baris separuh yang bisa disalahartikan sebagai pesan penuh.
/// - Urutan keluaran kronologis MAJU (paling lama dulu), `\r` dibuang.
pub fn baca_ekor(path: &Path, n: usize, max_bytes: u64) -> std::io::Result<Vec<String>> {
    use std::io::{Read, Seek, SeekFrom};

    let mut file = File::open(path)?;
    let panjang = file.metadata()?.len();
    let mulai = panjang.saturating_sub(max_bytes);
    file.seek(SeekFrom::Start(mulai))?;

    let mut buf = Vec::with_capacity((panjang - mulai) as usize);
    file.read_to_end(&mut buf)?;

    let teks = String::from_utf8_lossy(&buf).to_string();
    let mut baris: Vec<&str> = teks.split('\n').collect();

    // Mulai di tengah baris? Buang potongan pertamanya.
    if mulai > 0 && !baris.is_empty() {
        baris.remove(0);
    }
    // Buang baris kosong di ekor (sisa newline terakhir).
    while baris
        .last()
        .map(|b| b.trim_end_matches('\r').trim().is_empty())
        .unwrap_or(false)
    {
        baris.pop();
    }

    let dari = baris.len().saturating_sub(n);
    Ok(baris[dari..]
        .iter()
        .map(|b| b.trim_end_matches('\r').to_string())
        .collect())
}

/// Ekor berkas log APLIKASI: `n` baris terakhir dibaca dari berkas yang sama
/// dengan yang dilaporkan `get_diagnostics`, BUKAN dari workspace pengguna.
///
/// Sengaja TIDAK menerima path dari pemanggil: kalau menerima, tool ini jadi
/// jalan pintas membaca berkas di luar app - persis masalah yang dihindari
/// `WorkspaceOutside`. Read-only.
#[tauri::command]
pub async fn log_tail(n: Option<usize>, max_bytes: Option<u64>) -> Result<Vec<String>, String> {
    let path = log_file_path().ok_or_else(|| "log belum diinisialisasi".to_string())?;
    let n = n.unwrap_or(LOG_TAIL_N_BAWAAN).clamp(1, LOG_TAIL_N_MAKS);
    let max_bytes = max_bytes
        .unwrap_or(LOG_TAIL_BYTES_BAWAAN)
        .clamp(LOG_TAIL_BYTES_MIN, LOG_TAIL_BYTES_MAKS);
    baca_ekor(&path, n, max_bytes).map_err(|e| format!("gagal membaca log: {e}"))
}

pub fn panicked() -> bool {
    PANICKED.load(Ordering::SeqCst)
}

pub fn last_panic() -> String {
    LAST_PANIC
        .get()
        .and_then(|m| m.lock().ok().map(|s| s.clone()))
        .unwrap_or_default()
}

#[cfg(test)]
pub fn sink_for_test(dir: &Path) -> LogSink {
    LogSink::open(dir)
}

#[cfg(test)]
pub fn max_bytes_for_test() -> u64 {
    MAX_BYTES
}

#[cfg(test)]
mod tests_ekor {
    use super::*;
    use std::io::Write as _;

    /// Berkas sementara dengan isi yang diberikan; dibersihkan saat test selesai.
    struct BerkasUji(PathBuf);

    impl BerkasUji {
        fn baru(nama: &str, isi: &[u8]) -> Self {
            let dir = std::env::temp_dir().join("zephyr-uji-ekor");
            let _ = std::fs::create_dir_all(&dir);
            let path = dir.join(format!("{}-{}.log", nama, std::process::id()));
            let mut f = File::create(&path).expect("buat berkas uji");
            f.write_all(isi).expect("tulis berkas uji");
            BerkasUji(path)
        }
    }

    impl Drop for BerkasUji {
        fn drop(&mut self) {
            let _ = std::fs::remove_file(&self.0);
        }
    }

    #[test]
    fn ekor_mengambil_n_baris_terakhir_urutan_maju() {
        // 500 baris: yang diminta 200 terakhir, dan urutannya lama -> baru.
        let isi: String = (1..=500).map(|i| format!("baris-{i}\n")).collect();
        let b = BerkasUji::baru("500", isi.as_bytes());
        let hasil = baca_ekor(&b.0, 200, LOG_TAIL_BYTES_MAKS).expect("baca ekor");
        assert_eq!(hasil.len(), 200);
        assert_eq!(hasil[0], "baris-301");
        assert_eq!(hasil[199], "baris-500");
    }

    #[test]
    fn ekor_lebih_panjang_dari_isi_mengembalikan_semua() {
        let b = BerkasUji::baru("sedikit", b"satu\ndua\ntiga\n");
        let hasil = baca_ekor(&b.0, 200, LOG_TAIL_BYTES_MAKS).expect("baca ekor");
        assert_eq!(hasil, vec!["satu", "dua", "tiga"]);
    }

    #[test]
    fn ekor_terpotong_membuang_baris_pertama_yang_setengah() {
        // 3600 byte isi, hanya 500 byte ekor dibaca -> pembacaan mulai di TENGAH
        // sebuah baris, jadi baris pertama yang setengah itu dibuang: tidak ada
        // baris separuh yang lolos ke frontend.
        let isi: String = (1..=200).map(|i| format!("pesan-panjang-{i:04}\n")).collect();
        let b = BerkasUji::baru("potong", isi.as_bytes());
        let hasil = baca_ekor(&b.0, 50, 500).expect("baca ekor");

        // Berapa baris UTUH yang sebenarnya ada di 500 byte ekor itu?
        let ekor = &isi.as_bytes()[isi.len() - 500..];
        let jumlah_newline = ekor.iter().filter(|byte| **byte == b'\n').count();
        assert_eq!(
            hasil.len(),
            jumlah_newline - 1,
            "harus tepat baris utuh di ekor, potongan pertama dibuang"
        );
        for baris in &hasil {
            let angka = baris.strip_prefix("pesan-panjang-").unwrap_or_else(|| panic!("baris terpotong lolos: {baris:?}"));
            assert_eq!(angka.len(), 4, "baris terpotong lolos: {baris:?}");
            assert!(angka.chars().all(|c| c.is_ascii_digit()), "baris terpotong lolos: {baris:?}");
        }
        // Dan isinya memang EKOR-nya, bukan awal berkas.
        assert_eq!(hasil.last().map(String::as_str), Some("pesan-panjang-0200"));
    }

    #[test]
    fn ekor_menghormati_awal_berkas_kecil_tanpa_membuang_baris() {
        // Berkas lebih kecil dari max_bytes -> mulai == 0 -> tidak ada yang dibuang.
        let b = BerkasUji::baru("kecil", b"alfa\nbeta\n");
        let hasil = baca_ekor(&b.0, 10, LOG_TAIL_BYTES_MAKS).expect("baca ekor");
        assert_eq!(hasil, vec!["alfa", "beta"]);
    }

    #[test]
    fn ekor_membuang_cr_dan_baris_kosong_ekor() {
        let b = BerkasUji::baru("crlf", b"a\r\nb\r\n\r\n");
        let hasil = baca_ekor(&b.0, 10, LOG_TAIL_BYTES_MAKS).expect("baca ekor");
        assert_eq!(hasil, vec!["a", "b"]);
    }

    #[test]
    fn ekor_berkas_kosong_menghasilkan_daftar_kosong() {
        let b = BerkasUji::baru("kosong", b"");
        let hasil = baca_ekor(&b.0, 200, LOG_TAIL_BYTES_MAKS).expect("baca ekor");
        assert!(hasil.is_empty());
    }

    #[test]
    fn ekor_baris_panjang_tidak_meledak_dan_dipangkas_dari_atas() {
        // Satu baris raksasa (lebih panjang dari max_bytes) -> tidak ada baris utuh
        // yang bisa dikembalikan; yang penting tidak panik dan tidak menyerahkan
        // potongan yang menyesatkan sebagai hasil.
        let isi = "x".repeat(4000) + "\npendek\n";
        let b = BerkasUji::baru("raksasa", isi.as_bytes());
        let hasil = baca_ekor(&b.0, 10, 500).expect("baca ekor");
        assert!(hasil.len() <= 1, "dapat {} baris: {hasil:?}", hasil.len());
        let _ = LOG_TAIL_N_MAKS;
        let _ = LOG_TAIL_BYTES_MIN;
    }

    #[test]
    fn batas_log_tail_wajar() {
        assert!(LOG_TAIL_N_BAWAAN <= LOG_TAIL_N_MAKS);
        assert!(LOG_TAIL_BYTES_MIN < LOG_TAIL_BYTES_BAWAAN);
        assert!(LOG_TAIL_BYTES_BAWAAN < LOG_TAIL_BYTES_MAKS);
    }
}


#[cfg(test)]
pub fn keep_for_test() -> usize {
    KEEP
}
