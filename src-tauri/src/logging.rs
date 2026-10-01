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
pub fn keep_for_test() -> usize {
    KEEP
}
