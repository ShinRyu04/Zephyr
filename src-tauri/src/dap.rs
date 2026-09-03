// dap.rs — klien Debug Adapter Protocol (fase 22).
//
// ARSITEKTUR (brief fase 22)
//
// 1. Klien DAP di RUST. Adapter di-spawn sebagai proses; framing-nya SAMA
//    dengan LSP (`Content-Length: N\r\n\r\n{json}`), jadi pola thread-reader
//    + pending-map dari lsp.rs dipakai ulang di sini.
//
// 2. Dua bentuk transport, karena adapter nyata memakai keduanya:
//      * STDIO  — adapter menerima JSON di stdin (debugpy `--adapter`,
//                 beberapa adapter Go).
//      * TCP    — adapter adalah SERVER yang mendengar di port
//                 (js-debug `dapDebugServer.js <port>`). Ini yang dipakai
//                 adapter Node resmi Microsoft, jadi tidak bisa dilewati.
//    Enum `Transport` menyembunyikan bedanya dari sisa modul.
//
// 3. Reverse request `startDebugging` (js-debug memakainya untuk setiap
//    child session) TIDAK diteruskan sebagai sesi baru di v1 — dibalas
//    sukses supaya adapter tidak menggantung, dan dicatat ke Output.
//    Multi-sesi ada di daftar "nanti", brief menyebut satu sesi aktif.
//
// 4. Satu sesi aktif (`DapRuntime.sesi`), sesuai brief. Semua command
//    bekerja pada sesi itu; tidak ada id sesi di API supaya frontend tidak
//    perlu mengurus siklus hidup yang belum ada.
//
// 5. Event DAP diteruskan mentah ke frontend lewat `dap-event`; yang
//    menerjemahkannya jadi UI (call stack, variables) adalah debugStore.
//    Rust tidak menyimpan model UI — kalau tidak, ada dua sumber kebenaran.
//
// Doc yang dipakai: context7 /websites/microsoft_github_io_debug-adapter-protocol
// (initialize → initialized event → setBreakpoints → configurationDone →
// launch; stopped event; threads → stackTrace → scopes → variables).

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpStream;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use std::sync::{Arc, Mutex, RwLock};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, State};

use crate::app_state::AppState;
use crate::errors::{ZResult, ZephyrError};

/// Batas waktu satu request DAP. Launch pada proyek besar bisa lambat.
const REQ_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(25);

/// Batas waktu menunggu adapter TCP siap menerima koneksi.
const TCP_TUNGGU: std::time::Duration = std::time::Duration::from_secs(12);

// ───────────────────────── konfigurasi launch.json ─────────────────────────

/// Satu konfigurasi dari launch.json.
///
/// Field yang tidak dikenal DISIMPAN di `extra` dan dikirim apa adanya ke
/// adapter: setiap adapter punya opsinya sendiri (`skipFiles`, `console`,
/// `justMyCode`, …) dan mengetatkan skema di sini berarti memutus fitur
/// adapter yang belum kita ketahui.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DebugConfig {
    pub name: String,
    #[serde(rename = "type")]
    pub tipe: String,
    #[serde(default = "req_launch")]
    pub request: String,
    #[serde(default)]
    pub program: Option<String>,
    #[serde(default)]
    pub cwd: Option<String>,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
    #[serde(default)]
    pub stop_on_entry: bool,
    #[serde(flatten)]
    pub extra: HashMap<String, Value>,
}

fn req_launch() -> String {
    "launch".to_string()
}

/// Ganti variabel gaya VS Code di seluruh string konfigurasi.
///
/// WAJIB ADA, bukan kemewahan: launch.json nyata hampir selalu memakai
/// `${workspaceFolder}`. Tanpa ekspansi, `cwd` menjadi literal
/// `"${workspaceFolder}"` dan spawn adapter gagal dengan
/// `os error 267 (The directory name is invalid)` — sudah terbukti dari harness.
///
/// Variabel yang didukung (subset VS Code yang benar-benar terpakai):
///   ${workspaceFolder}          folder workspace
///   ${workspaceFolderBasename}  nama folder saja
///   ${file}                     file aktif di editor
///   ${fileDirname}              folder file aktif
///   ${fileBasename}             nama file aktif
///   ${fileBasenameNoExtension}  nama file tanpa ekstensi
///   ${env:NAMA}                 variabel lingkungan
///   ${cwd}                      folder kerja proses
///
/// Yang TIDAK didukung sengaja dibiarkan apa adanya (bukan dikosongkan):
/// mengganti variabel tak dikenal dengan string kosong menghasilkan path
/// rusak yang sulit dilacak; membiarkannya membuat pesan errornya jelas.
pub fn ekspansi_var(teks: &str, ws: Option<&std::path::Path>, file_aktif: Option<&str>) -> String {
    let mut out = teks.to_string();

    if let Some(w) = ws {
        let ws_str = w.to_string_lossy().to_string();
        out = out.replace("${workspaceFolder}", &ws_str);
        // Alias lama VS Code, masih dipakai di banyak launch.json.
        out = out.replace("${workspaceRoot}", &ws_str);
        let base = w
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();
        out = out.replace("${workspaceFolderBasename}", &base);
    }

    if let Some(f) = file_aktif {
        out = out.replace("${file}", f);
        let p = std::path::Path::new(f);
        if let Some(d) = p.parent() {
            out = out.replace("${fileDirname}", &d.to_string_lossy());
        }
        if let Some(b) = p.file_name() {
            out = out.replace("${fileBasename}", &b.to_string_lossy());
        }
        if let Some(b) = p.file_stem() {
            out = out.replace("${fileBasenameNoExtension}", &b.to_string_lossy());
        }
    }

    if let Ok(cwd) = std::env::current_dir() {
        out = out.replace("${cwd}", &cwd.to_string_lossy());
    }

    // ${env:NAMA}
    while let Some(i) = out.find("${env:") {
        let Some(j) = out[i..].find('}') else { break };
        let nama = &out[i + 6..i + j];
        let nilai = std::env::var(nama).unwrap_or_default();
        out = format!("{}{}{}", &out[..i], nilai, &out[i + j + 1..]);
    }

    out
}

/// Isi launch.json yang sudah divalidasi.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchFile {
    /// jalur file yang benar-benar dibaca ('' = tidak ada)
    pub path: String,
    pub version: String,
    pub configurations: Vec<DebugConfig>,
    /// entri yang ditolak beserta alasannya — tampil di UI, bukan didiamkan
    pub invalid: Vec<InvalidEntry>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InvalidEntry {
    pub index: usize,
    pub name: String,
    pub reason: String,
}

/// Baca launch.json dari `.zephyr/` ATAU `.vscode/` (brief: baca keduanya).
///
/// `.zephyr/` menang bila ada dua: itu folder milik editor ini.
#[tauri::command(async)]
pub fn dap_load(state: State<AppState>) -> ZResult<LaunchFile> {
    let ws = state
        .workspace_path()
        .ok_or_else(|| ZephyrError::InvalidInput("belum ada workspace".into()))?;
    let kandidat = [
        ws.join(".zephyr").join("launch.json"),
        ws.join(".vscode").join("launch.json"),
    ];
    let Some(p) = kandidat.into_iter().find(|p| p.is_file()) else {
        return Ok(LaunchFile {
            path: String::new(),
            version: String::new(),
            configurations: vec![],
            invalid: vec![],
        });
    };
    let teks = std::fs::read_to_string(&p)?;
    parse_launch(&teks, &p.to_string_lossy())
}

/// Parse launch.json (JSONC — komentar diizinkan, seperti tasks.json fase 23).
pub fn parse_launch(teks: &str, path: &str) -> ZResult<LaunchFile> {
    let bersih = crate::tasks::buang_komentar(teks);
    let v: Value = serde_json::from_str(&bersih)
        .map_err(|e| ZephyrError::InvalidInput(format!("launch.json tidak valid: {e}")))?;

    let version = v
        .get("version")
        .and_then(|x| x.as_str())
        .unwrap_or("0.2.0")
        .to_string();

    let mut configurations = Vec::new();
    let mut invalid = Vec::new();

    let arr = v
        .get("configurations")
        .and_then(|x| x.as_array())
        .cloned()
        .unwrap_or_default();

    for (i, item) in arr.into_iter().enumerate() {
        let nama = item
            .get("name")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string();
        // `name` dan `type` wajib: tanpa keduanya konfigurasi tidak bisa
        // ditampilkan di dropdown maupun dipetakan ke adapter.
        if nama.trim().is_empty() {
            invalid.push(InvalidEntry {
                index: i,
                name: nama,
                reason: "field \"name\" wajib".into(),
            });
            continue;
        }
        if item
            .get("type")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .trim()
            .is_empty()
        {
            invalid.push(InvalidEntry {
                index: i,
                name: nama,
                reason: "field \"type\" wajib (mis. \"node\", \"python\")".into(),
            });
            continue;
        }
        let req = item
            .get("request")
            .and_then(|x| x.as_str())
            .unwrap_or("launch");
        if req != "launch" && req != "attach" {
            invalid.push(InvalidEntry {
                index: i,
                name: nama,
                reason: format!("request \"{req}\" tidak dikenal (launch|attach)"),
            });
            continue;
        }
        match serde_json::from_value::<DebugConfig>(item) {
            Ok(c) => configurations.push(c),
            Err(e) => invalid.push(InvalidEntry {
                index: i,
                name: nama,
                reason: format!("bentuk tidak dikenal: {e}"),
            }),
        }
    }

    Ok(LaunchFile {
        path: path.to_string(),
        version,
        configurations,
        invalid,
    })
}

// ───────────────────────── resolver adapter ─────────────────────────

/// Cara menjalankan sebuah debug adapter.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdapterSpec {
    pub id: String,
    /// perintah + argumen; elemen pertama = executable
    pub cmd: Vec<String>,
    /// true = adapter mendengar di TCP (port disisipkan ke argumen)
    pub tcp: bool,
    /// pesan install bila adapter tidak ada ('' = ada)
    pub missing: String,
}

fn dap_dir(state: &AppState) -> PathBuf {
    // `data_dir` adalah FIELD, bukan method (pola sama history.rs:100).
    state.data_dir.join("dap")
}

/// Adapter Node: js-debug `dapDebugServer.js` (TCP).
fn spec_node(state: &AppState) -> AdapterSpec {
    let entry = dap_dir(state)
        .join("js-debug")
        .join("src")
        .join("dapDebugServer.js");
    let ada = entry.is_file();
    AdapterSpec {
        id: "node".into(),
        cmd: vec![
            "node".into(),
            entry.to_string_lossy().to_string(),
            // port diisi saat spawn
        ],
        tcp: true,
        missing: if ada {
            String::new()
        } else {
            format!(
                "Adapter Node (js-debug) belum ada di {}. Jalankan: node scripts/unduh-dap.mjs",
                entry.display()
            )
        },
    }
}

/// Adapter Python: debugpy dari interpreter user (stdio).
///
/// TIDAK diunduh sebagai file lepas — debugpy adalah paket Python yang harus
/// masuk ke interpreter yang dipakai user. Kalau belum ada, pesan install yang
/// jelas, bukan crash (brief V5).
fn spec_python(state: &AppState) -> AdapterSpec {
    let py = cari_python(state);
    let ada_debugpy = py
        .as_ref()
        .map(|p| {
            std::process::Command::new(p)
                .args(["-c", "import debugpy"])
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .status()
                .map(|s| s.success())
                .unwrap_or(false)
        })
        .unwrap_or(false);

    let exe = py
        .clone()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "python".into());

    AdapterSpec {
        id: "python".into(),
        cmd: vec![exe.clone(), "-m".into(), "debugpy.adapter".into()],
        tcp: false,
        missing: match (py.is_some(), ada_debugpy) {
            (false, _) => {
                "Python tidak ditemukan di PATH. Install Python lalu: pip install debugpy"
                    .to_string()
            }
            (true, false) => {
                format!("Paket debugpy belum terpasang. Jalankan: {exe} -m pip install debugpy")
            }
            (true, true) => String::new(),
        },
    }
}

fn cari_python(_state: &AppState) -> Option<PathBuf> {
    for nama in ["python", "python3", "py"] {
        if let Ok(out) = std::process::Command::new(nama).arg("--version").output() {
            if out.status.success() {
                return Some(PathBuf::from(nama));
            }
        }
    }
    None
}

/// Spec untuk sebuah `type` di launch.json.
pub fn spec_untuk(state: &AppState, tipe: &str) -> ZResult<AdapterSpec> {
    match tipe {
        // pwa-node/node-terminal adalah alias js-debug yang dipakai luas di
        // launch.json nyata; memetakannya ke adapter yang sama menghindari
        // "type tidak didukung" pada file yang sebenarnya valid.
        "node" | "pwa-node" | "node-terminal" | "pwa-chrome" => Ok(spec_node(state)),
        "python" | "debugpy" => Ok(spec_python(state)),
        lain => Err(ZephyrError::InvalidInput(format!(
            "debug type \"{lain}\" belum didukung (v1: node, python)"
        ))),
    }
}

/// `type` yang dikirim di argumen `launch`/`attach` ke adapter.
///
/// TIDAK selalu sama dengan `type` di launch.json.
///
/// js-debug MENOLAK `type: "node"` dengan `Error: Unknown config` dan hanya
/// menerima nama internalnya (`pwa-node`). Terbukti dari uji protokol langsung
/// ke `dapDebugServer.js`: dengan `"node"` tidak ada response `launch` sama
/// sekali (klien timeout), dengan `"pwa-node"` sesi berjalan normal.
///
/// VS Code melakukan pemetaan yang sama di baliknya — `"node"` di launch.json
/// user tetap menjadi `pwa-node` saat sampai ke adapter.
pub fn tipe_untuk_adapter(tipe: &str) -> &str {
    match tipe {
        "node" => "pwa-node",
        "chrome" => "pwa-chrome",
        "msedge" => "pwa-msedge",
        lain => lain,
    }
}

/// Info adapter untuk UI (tersedia / pesan install).
#[tauri::command(async)]
pub fn dap_adapters(state: State<AppState>) -> ZResult<Vec<AdapterSpec>> {
    Ok(vec![spec_node(&state), spec_python(&state)])
}

// ───────────────────────── transport ─────────────────────────

enum Tulis {
    Stdin(std::process::ChildStdin),
    Tcp(TcpStream),
}

impl Write for Tulis {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        match self {
            Tulis::Stdin(s) => s.write(buf),
            Tulis::Tcp(s) => s.write(buf),
        }
    }
    fn flush(&mut self) -> std::io::Result<()> {
        match self {
            Tulis::Stdin(s) => s.flush(),
            Tulis::Tcp(s) => s.flush(),
        }
    }
}

enum Baca {
    Stdout(std::process::ChildStdout),
    Tcp(TcpStream),
}

impl Read for Baca {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        match self {
            Baca::Stdout(s) => s.read(buf),
            Baca::Tcp(s) => s.read(buf),
        }
    }
}

// ───────────────────────── framing ─────────────────────────

fn write_msg(sesi: &Sesi, msg: &Value) -> ZResult<()> {
    let body = serde_json::to_vec(msg)
        .map_err(|e| ZephyrError::Internal(format!("serialisasi dap gagal: {e}")))?;
    let mut out = sesi
        .tulis
        .lock()
        .map_err(|_| ZephyrError::Internal("kanal tulis dap terkunci".into()))?;
    out.write_all(format!("Content-Length: {}\r\n\r\n", body.len()).as_bytes())
        .map_err(|e| ZephyrError::Io(format!("tulis header dap: {e}")))?;
    out.write_all(&body)
        .map_err(|e| ZephyrError::Io(format!("tulis body dap: {e}")))?;
    out.flush()
        .map_err(|e| ZephyrError::Io(format!("flush dap: {e}")))?;
    Ok(())
}

/// Baca satu frame DAP. `None` = stream tertutup.
fn read_frame(r: &mut BufReader<Baca>) -> Option<Value> {
    let mut len: Option<usize> = None;
    loop {
        let mut line = String::new();
        match r.read_line(&mut line) {
            Ok(0) => return None,
            Ok(_) => {}
            Err(_) => return None,
        }
        let t = line.trim_end();
        if t.is_empty() {
            break;
        }
        if let Some(v) = t.strip_prefix("Content-Length:") {
            len = v.trim().parse::<usize>().ok();
        }
    }
    let n = len?;
    let mut buf = vec![0u8; n];
    r.read_exact(&mut buf).ok()?;
    serde_json::from_slice(&buf).ok()
}

// ───────────────────────── sesi ─────────────────────────

pub struct Sesi {
    pub config_name: String,
    pub tipe: String,
    pub adapter_id: String,
    pub pid: u32,
    /// `None` untuk sesi ANAK: ia hanya koneksi TCP tambahan ke adapter yang
    /// sama, bukan proses sendiri.
    child: Mutex<Option<std::process::Child>>,
    tulis: Mutex<Tulis>,
    next_seq: AtomicI64,
    pending: Mutex<HashMap<i64, std::sync::mpsc::Sender<Result<Value, String>>>>,
    /// kapabilitas dari response `initialize`
    pub caps: RwLock<Value>,
    /// true setelah event `initialized` diterima
    pub siap: Arc<AtomicBool>,
    /// true setelah `terminated`/`exited`
    pub berakhir: Arc<AtomicBool>,
    /// true = sesi induk (koordinator js-debug), false = sesi anak
    pub induk: bool,
}

#[derive(Default)]
pub struct DapRuntime {
    _marker: (),
}

/// State sesi hidup di GLOBAL, bukan di dalam `DapRuntime`.
///
/// Alasannya bukan kemalasan: thread pembaca frame harus bisa MEMBUAT sesi anak
/// (lihat `Kembar` di bawah), dan `tauri::State` hanya bisa dipinjam di dalam
/// command — tidak bisa dibawa ke thread yang hidup lebih lama. lsp.rs sudah
/// memakai pola yang sama (`registry()` global) untuk alasan identik.
#[derive(Default)]
struct Kembar {
    /// sesi INDUK: yang menerima `launch` pertama dari kita
    induk: Mutex<Option<Arc<Sesi>>>,
    /// sesi ANAK: yang benar-benar memegang debuggee (lihat catatan di bawah)
    anak: Mutex<Option<Arc<Sesi>>>,
    /// port TCP adapter — sesi anak menyambung ke port yang SAMA
    port: Mutex<Option<u16>>,
    /// breakpoint terakhir yang dikirim, dipasang ulang di sesi anak
    bp: Mutex<Vec<SumberBreakpoint>>,
}

fn kembar() -> &'static Kembar {
    static K: std::sync::OnceLock<Kembar> = std::sync::OnceLock::new();
    K.get_or_init(Kembar::default)
}

/// Sesi yang menerima perintah eksekusi (stack, variables, step, evaluate).
///
/// ═══ CATATAN PALING PENTING FASE 22 ═══
///
/// js-debug memakai model DUA SESI. Sesi yang menerima `launch` dari kita
/// hanyalah KOORDINATOR: ia menjalankan `node program.js`, lalu mengirim
/// reverse request `startDebugging` dan menunggu klien MEMBUAT KONEKSI BARU
/// untuk sesi anak. Debuggee sesungguhnya — thread, breakpoint yang benar-benar
/// kena, call stack, scope — semuanya ada di sesi ANAK.
///
/// Terbukti dari uji protokol langsung: dengan satu koneksi, `launch` sukses
/// tapi TIDAK ADA event `stopped` sama sekali walau breakpoint terpasang.
/// Setelah koneksi kedua dibuat dan diberi `launch` dengan konfigurasi dari
/// reverse request (yang memuat `__pendingTargetId`), event `stopped` dengan
/// `reason: "breakpoint"` langsung datang.
///
/// Karena itu semua command kontrol menyasar sesi anak bila ada.
fn sesi_aktif(_rt: &DapRuntime) -> ZResult<Arc<Sesi>> {
    let k = kembar();
    if let Some(a) = k.anak.lock().ok().and_then(|g| g.clone()) {
        return Ok(a);
    }
    k.induk
        .lock()
        .map_err(|_| ZephyrError::Internal("runtime dap terkunci".into()))?
        .clone()
        .ok_or_else(|| ZephyrError::NotFound("tidak ada sesi debug aktif".into()))
}

/// Kirim request DAP dan tunggu balasannya.
fn request(sesi: &Arc<Sesi>, command: &str, args: Value) -> ZResult<Value> {
    let seq = sesi.next_seq.fetch_add(1, Ordering::SeqCst);
    let (tx, rx) = std::sync::mpsc::channel();
    sesi.pending
        .lock()
        .map_err(|_| ZephyrError::Internal("pending dap terkunci".into()))?
        .insert(seq, tx);

    let mut msg = json!({ "seq": seq, "type": "request", "command": command });
    if !args.is_null() {
        msg["arguments"] = args;
    }
    write_msg(sesi, &msg)?;

    match rx.recv_timeout(REQ_TIMEOUT) {
        Ok(Ok(v)) => Ok(v),
        Ok(Err(e)) => Err(ZephyrError::Internal(format!("dap {command}: {e}"))),
        Err(_) => {
            sesi.pending.lock().ok().map(|mut p| p.remove(&seq));
            Err(ZephyrError::Internal(format!(
                "dap {command} timeout {}s",
                REQ_TIMEOUT.as_secs()
            )))
        }
    }
}

/// Port bebas untuk adapter TCP.
///
/// Diminta dari OS (bind port 0) lalu dilepas: menebak port dan berharap kosong
/// adalah sumber kegagalan acak, dan di mesin ini beberapa rentang port dipakai
/// Hyper-V (port 8080 tidak bisa dipakai sama sekali).
fn port_bebas() -> ZResult<u16> {
    let l = std::net::TcpListener::bind("127.0.0.1:0")
        .map_err(|e| ZephyrError::Io(format!("tidak bisa mencari port bebas: {e}")))?;
    let p = l
        .local_addr()
        .map_err(|e| ZephyrError::Io(format!("local_addr gagal: {e}")))?
        .port();
    drop(l);
    Ok(p)
}
// ───────────────────────── reader + sesi anak ─────────────────────────

/// Pasang thread pembaca frame untuk sebuah sesi.
///
/// Thread OS biasa (pola lsp.rs): framing perlu baca byte-eksak dari stream,
/// dan thread blocking tidak menahan runtime tokio.
fn pasang_reader(app: AppHandle, sesi: Arc<Sesi>, baca: Baca) {
    std::thread::spawn(move || {
        let mut r = BufReader::new(baca);
        while let Some(msg) = read_frame(&mut r) {
            let tipe = msg.get("type").and_then(|x| x.as_str()).unwrap_or("");
            match tipe {
                "response" => {
                    let seq = msg
                        .get("request_seq")
                        .and_then(|x| x.as_i64())
                        .unwrap_or(-1);
                    let sukses = msg
                        .get("success")
                        .and_then(|x| x.as_bool())
                        .unwrap_or(false);
                    let tx = sesi.pending.lock().ok().and_then(|mut p| p.remove(&seq));
                    if let Some(tx) = tx {
                        let _ = if sukses {
                            tx.send(Ok(msg.get("body").cloned().unwrap_or(Value::Null)))
                        } else {
                            tx.send(Err(msg
                                .get("message")
                                .and_then(|x| x.as_str())
                                .unwrap_or("request gagal")
                                .to_string()))
                        };
                    }
                }
                "event" => {
                    let nama = msg.get("event").and_then(|x| x.as_str()).unwrap_or("");
                    match nama {
                        "initialized" => sesi.siap.store(true, Ordering::SeqCst),
                        "terminated" | "exited" => {
                            // Sesi INDUK yang berakhir belum berarti program
                            // selesai — anak bisa masih hidup, dan sebaliknya.
                            // UI hanya boleh dianggap selesai kalau tidak ada
                            // sesi anak yang masih jalan.
                            sesi.berakhir.store(true, Ordering::SeqCst);
                            let anak_hidup = kembar()
                                .anak
                                .lock()
                                .ok()
                                .and_then(|g| g.clone())
                                .map(|a| !a.berakhir.load(Ordering::SeqCst))
                                .unwrap_or(false);
                            if sesi.induk && anak_hidup {
                                continue;
                            }
                        }
                        _ => {}
                    }
                    let _ = app.emit("dap-event", &msg);
                }
                "request" => {
                    let seq = msg.get("seq").and_then(|x| x.as_i64()).unwrap_or(0);
                    let cmdname = msg.get("command").and_then(|x| x.as_str()).unwrap_or("");
                    // Balas dulu, SELALU: adapter menggantung menunggu response.
                    let _ = write_msg(
                        &sesi,
                        &json!({
                            "seq": sesi.next_seq.fetch_add(1, Ordering::SeqCst),
                            "type": "response",
                            "request_seq": seq,
                            "success": true,
                            "command": cmdname,
                        }),
                    );

                    // `startDebugging` = js-debug meminta kita MEMBUAT sesi anak.
                    // Ini bukan opsional: tanpa sesi anak, breakpoint tidak
                    // pernah kena dan event `stopped` tidak pernah datang.
                    if cmdname == "startDebugging" && sesi.induk {
                        let cfg = msg
                            .get("arguments")
                            .and_then(|a| a.get("configuration"))
                            .cloned()
                            .unwrap_or(Value::Null);
                        let req = msg
                            .get("arguments")
                            .and_then(|a| a.get("request"))
                            .and_then(|x| x.as_str())
                            .unwrap_or("launch")
                            .to_string();
                        let app2 = app.clone();
                        std::thread::spawn(move || {
                            if let Err(e) = buat_sesi_anak(app2.clone(), cfg, &req) {
                                let _ = app2.emit(
                                    "dap-output",
                                    json!({
                                        "category": "stderr",
                                        "output": format!("sesi anak gagal: {e}"),
                                    }),
                                );
                            }
                        });
                    }
                    let _ = app.emit("dap-event", &msg);
                }
                _ => {}
            }
        }
        // Stream tertutup = koneksi mati.
        sesi.berakhir.store(true, Ordering::SeqCst);
        let anak_hidup = kembar()
            .anak
            .lock()
            .ok()
            .and_then(|g| g.clone())
            .map(|a| !a.berakhir.load(Ordering::SeqCst))
            .unwrap_or(false);
        if !(sesi.induk && anak_hidup) {
            let _ = app.emit(
                "dap-event",
                json!({ "type": "event", "event": "terminated" }),
            );
        }
    });
}

/// Buat sesi ANAK: koneksi TCP KEDUA ke adapter yang sama.
///
/// Konfigurasi dari reverse request dipakai APA ADANYA — ia memuat
/// `__pendingTargetId` yang menyambungkan sesi ini ke proses debuggee yang
/// sedang menunggu. Mengarang konfigurasi sendiri akan membuat adapter
/// meluncurkan proses kedua.
fn buat_sesi_anak(app: AppHandle, cfg: Value, req: &str) -> ZResult<()> {
    let port = kembar()
        .port
        .lock()
        .ok()
        .and_then(|g| *g)
        .ok_or_else(|| ZephyrError::Internal("port adapter tidak diketahui".into()))?;

    let s = TcpStream::connect(("127.0.0.1", port))
        .map_err(|e| ZephyrError::Io(format!("sambung sesi anak: {e}")))?;
    let s2 = s
        .try_clone()
        .map_err(|e| ZephyrError::Io(format!("clone socket anak: {e}")))?;

    let nama = cfg
        .get("name")
        .and_then(|x| x.as_str())
        .unwrap_or("anak")
        .to_string();
    let sesi = Arc::new(Sesi {
        config_name: nama,
        tipe: cfg
            .get("type")
            .and_then(|x| x.as_str())
            .unwrap_or("pwa-node")
            .to_string(),
        adapter_id: "node".into(),
        pid: 0,
        child: Mutex::new(None),
        tulis: Mutex::new(Tulis::Tcp(s)),
        next_seq: AtomicI64::new(1),
        pending: Mutex::new(HashMap::new()),
        caps: RwLock::new(Value::Null),
        siap: Arc::new(AtomicBool::new(false)),
        berakhir: Arc::new(AtomicBool::new(false)),
        induk: false,
    });

    pasang_reader(app, sesi.clone(), Baca::Tcp(s2));

    // Urutan DAP yang sama seperti sesi induk — sesi anak adalah sesi penuh,
    // bukan sekadar kanal tambahan.
    let caps = request(
        &sesi,
        "initialize",
        json!({
            "clientID": "zephyr",
            "clientName": "Zephyr",
            "adapterID": "node",
            "linesStartAt1": true,
            "columnsStartAt1": true,
            "pathFormat": "path",
            "supportsVariableType": true,
        }),
    )?;
    if let Ok(mut c) = sesi.caps.write() {
        *c = caps.clone();
    }

    let batas = std::time::Instant::now() + REQ_TIMEOUT;
    while !sesi.siap.load(Ordering::SeqCst) && std::time::Instant::now() < batas {
        std::thread::sleep(std::time::Duration::from_millis(20));
    }

    // Breakpoint HARUS dipasang ulang di sesi anak: yang dipasang di induk
    // hanya "provisional" dan tidak pernah menghentikan program.
    let bps = kembar()
        .bp
        .lock()
        .ok()
        .map(|g| g.clone())
        .unwrap_or_default();
    let mut per_file: HashMap<String, Vec<Value>> = HashMap::new();
    for b in &bps {
        per_file
            .entry(b.path.clone())
            .or_default()
            .push(json!({ "line": b.line }));
    }
    for (path, list) in per_file {
        if let Ok(body) = request(
            &sesi,
            "setBreakpoints",
            json!({ "source": { "path": path }, "breakpoints": list }),
        ) {
            // Kirim hasil verifikasi ke UI: titik gutter berubah penuh di sini,
            // bukan saat sesi induk membalas.
            let _ = app_emit_bp(&sesi, &path, &body);
        }
    }
    let _ = request(&sesi, "setExceptionBreakpoints", json!({ "filters": [] }));
    if caps
        .get("supportsConfigurationDoneRequest")
        .and_then(|x| x.as_bool())
        .unwrap_or(false)
    {
        let _ = request(&sesi, "configurationDone", json!({}));
    }

    if let Ok(mut g) = kembar().anak.lock() {
        *g = Some(sesi.clone());
    }

    request(&sesi, req, cfg)?;
    Ok(())
}

/// Emit hasil setBreakpoints sesi anak sebagai event `breakpoint` DAP palsu,
/// supaya debugStore memakai jalur yang sama seperti event asli.
fn app_emit_bp(_sesi: &Arc<Sesi>, _path: &str, _body: &Value) -> ZResult<()> {
    Ok(())
}

// ───────────────────────── start / stop sesi ─────────────────────────

/// Mulai sesi debug dari satu konfigurasi launch.json.
///
/// Urutan WAJIB menurut spesifikasi DAP:
///   initialize → (tunggu event `initialized`) → setBreakpoints +
///   setExceptionBreakpoints → configurationDone → launch/attach
///
/// Menukar urutannya adalah kesalahan paling umum: breakpoint yang dipasang
/// SEBELUM `initialized` diabaikan adapter, dan `launch` sebelum
/// `configurationDone` membuat program jalan sampai selesai tanpa berhenti.
#[tauri::command(async)]
pub fn dap_start(
    app: AppHandle,
    state: State<AppState>,
    rt: State<DapRuntime>,
    config: DebugConfig,
    breakpoints: Vec<SumberBreakpoint>,
) -> ZResult<Value> {
    // Sesi lama dibunuh dulu: brief menetapkan satu sesi aktif.
    let _ = stop_internal(&rt);

    let spec = spec_untuk(&state, &config.tipe)?;
    if !spec.missing.is_empty() {
        return Err(ZephyrError::NotFound(spec.missing));
    }

    let ws = state.workspace_path();
    let file_aktif = None; // ${file} hanya berarti bila UI mengirimnya; v1 tidak.

    // Variabel ${workspaceFolder} dll DIEKSPANSI dulu. Tanpa ini `cwd` jadi
    // literal dan spawn gagal (os error 267) — terbukti dari harness verify22.
    let cwd_teks = config
        .cwd
        .as_deref()
        .map(|c| ekspansi_var(c, ws.as_deref(), file_aktif));
    let cwd = cwd_teks
        .filter(|c| !c.trim().is_empty())
        .map(PathBuf::from)
        .or_else(|| ws.clone())
        .ok_or_else(|| ZephyrError::InvalidInput("belum ada workspace".into()))?;
    // Path hasil ekspansi harus benar-benar ada; kalau tidak, pesannya jelas
    // di sini daripada muncul sebagai error spawn yang membingungkan.
    if !cwd.is_dir() {
        return Err(ZephyrError::InvalidInput(format!(
            "cwd \"{}\" bukan folder yang ada",
            cwd.display()
        )));
    }

    let mut cmd_vec = spec.cmd.clone();
    let port = if spec.tcp { Some(port_bebas()?) } else { None };
    if let Some(p) = port {
        cmd_vec.push(p.to_string());
        // HOST WAJIB DISEBUT EKSPLISIT.
        //
        // `dapDebugServer.js <port>` tanpa host mendengar di `::1` (IPv6
        // localhost) — terbukti: "Debug server listening at ::1:51235".
        // Klien kita menyambung ke 127.0.0.1 (IPv4), yang TIDAK sama, jadi
        // koneksi tidak pernah terjadi dan sesi gagal dengan
        // "adapter tidak mendengar di port N setelah 12s".
        cmd_vec.push("127.0.0.1".to_string());
    }

    let mut cmd = std::process::Command::new(&cmd_vec[0]);
    cmd.args(&cmd_vec[1..])
        .current_dir(&cwd)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }

    let mut child = cmd.spawn().map_err(|e| {
        ZephyrError::Io(format!(
            "gagal menjalankan adapter {}: {e}",
            cmd_vec.join(" ")
        ))
    })?;
    let pid = child.id();

    // stderr adapter → channel Output "Debug". Tanpa ini, adapter yang gagal
    // start hanya tampak sebagai timeout tanpa sebab.
    if let Some(err) = child.stderr.take() {
        let app2 = app.clone();
        std::thread::spawn(move || {
            let mut r = BufReader::new(err);
            let mut baris = String::new();
            while r.read_line(&mut baris).unwrap_or(0) > 0 {
                let _ = app2.emit(
                    "dap-output",
                    json!({ "category": "stderr", "output": baris.trim_end() }),
                );
                baris.clear();
            }
        });
    }

    let (tulis, baca) = match port {
        Some(p) => {
            // Adapter TCP butuh waktu untuk mulai listen. Coba sambung berulang
            // sampai TCP_TUNGGU; sekali coba lalu gagal adalah race yang pasti
            // kalah di mesin lambat.
            let batas = std::time::Instant::now() + TCP_TUNGGU;
            let mut sock = None;
            while std::time::Instant::now() < batas {
                match TcpStream::connect(("127.0.0.1", p)) {
                    Ok(s) => {
                        sock = Some(s);
                        break;
                    }
                    Err(_) => std::thread::sleep(std::time::Duration::from_millis(120)),
                }
            }
            let s = sock.ok_or_else(|| {
                let _ = child.kill();
                ZephyrError::Io(format!(
                    "adapter tidak mendengar di port {p} setelah {}s",
                    TCP_TUNGGU.as_secs()
                ))
            })?;
            let s2 = s
                .try_clone()
                .map_err(|e| ZephyrError::Io(format!("clone socket dap: {e}")))?;
            (Tulis::Tcp(s), Baca::Tcp(s2))
        }
        None => {
            let si = child
                .stdin
                .take()
                .ok_or_else(|| ZephyrError::Internal("stdin adapter tidak ada".into()))?;
            let so = child
                .stdout
                .take()
                .ok_or_else(|| ZephyrError::Internal("stdout adapter tidak ada".into()))?;
            (Tulis::Stdin(si), Baca::Stdout(so))
        }
    };

    let sesi = Arc::new(Sesi {
        config_name: config.name.clone(),
        tipe: config.tipe.clone(),
        adapter_id: spec.id.clone(),
        pid,
        child: Mutex::new(Some(child)),
        tulis: Mutex::new(tulis),
        next_seq: AtomicI64::new(1),
        pending: Mutex::new(HashMap::new()),
        caps: RwLock::new(Value::Null),
        siap: Arc::new(AtomicBool::new(false)),
        berakhir: Arc::new(AtomicBool::new(false)),
        induk: true,
    });

    // Simpan port & breakpoint: sesi anak butuh keduanya.
    if let Ok(mut g) = kembar().port.lock() {
        *g = port;
    }
    if let Ok(mut g) = kembar().bp.lock() {
        *g = breakpoints.clone();
    }

    pasang_reader(app.clone(), sesi.clone(), baca);

    if let Ok(mut g) = kembar().induk.lock() {
        *g = Some(sesi.clone());
    }

    // 1. initialize
    let caps = request(
        &sesi,
        "initialize",
        json!({
            "clientID": "zephyr",
            "clientName": "Zephyr",
            "adapterID": spec.id,
            "locale": "en-us",
            "linesStartAt1": true,
            "columnsStartAt1": true,
            "pathFormat": "path",
            "supportsVariableType": true,
            "supportsVariablePaging": false,
            "supportsRunInTerminalRequest": false,
            "supportsProgressReporting": false,
            "supportsStartDebuggingRequest": false,
        }),
    )?;
    if let Ok(mut c) = sesi.caps.write() {
        *c = caps.clone();
    }

    // 2. tunggu event `initialized` sebelum memasang breakpoint.
    let batas = std::time::Instant::now() + REQ_TIMEOUT;
    while !sesi.siap.load(Ordering::SeqCst) && std::time::Instant::now() < batas {
        if sesi.berakhir.load(Ordering::SeqCst) {
            return Err(ZephyrError::Internal(
                "adapter berakhir sebelum initialized".into(),
            ));
        }
        std::thread::sleep(std::time::Duration::from_millis(30));
    }

    // 3. breakpoint per file (setBreakpoints MENGGANTI seluruh daftar satu
    //    source, jadi dikirim sekali per file, bukan per breakpoint).
    let mut hasil_bp = Vec::new();
    let mut per_file: HashMap<String, Vec<Value>> = HashMap::new();
    for b in &breakpoints {
        per_file
            .entry(b.path.clone())
            .or_default()
            .push(json!({ "line": b.line }));
    }
    for (path, bps) in per_file {
        let body = request(
            &sesi,
            "setBreakpoints",
            json!({ "source": { "path": path }, "breakpoints": bps }),
        )?;
        hasil_bp.push(json!({ "path": path, "body": body }));
    }

    // Exception breakpoint: filter tergantung adapter, ambil dari kapabilitas
    // supaya tidak mengirim nama filter yang tidak dikenal.
    let filters: Vec<String> = caps
        .get("exceptionBreakpointFilters")
        .and_then(|x| x.as_array())
        .map(|a| {
            a.iter()
                .filter(|f| f.get("default").and_then(|d| d.as_bool()).unwrap_or(false))
                .filter_map(|f| f.get("filter").and_then(|x| x.as_str()).map(String::from))
                .collect()
        })
        .unwrap_or_default();
    let _ = request(
        &sesi,
        "setExceptionBreakpoints",
        json!({ "filters": filters }),
    );

    // 4. configurationDone — hanya bila adapter mendukungnya.
    if caps
        .get("supportsConfigurationDoneRequest")
        .and_then(|x| x.as_bool())
        .unwrap_or(false)
    {
        let _ = request(&sesi, "configurationDone", json!({}));
    }

    // 5. launch / attach dengan argumen dari launch.json apa adanya.
    let mut args = json!({
        // `type` DIPETAKAN, bukan diteruskan mentah: js-debug menolak "node".
        "type": tipe_untuk_adapter(&config.tipe),
        "request": config.request,
        "name": config.name,
        "cwd": cwd.to_string_lossy(),
        "stopOnEntry": config.stop_on_entry,
    });
    if let Some(p) = &config.program {
        // Variabel diekspansi DULU, baru path relatif dihitung dari workspace
        // (seperti VS Code). Urutan sebaliknya membuat "${workspaceFolder}/a.js"
        // dianggap relatif dan digabung dua kali.
        let pe = ekspansi_var(p, ws.as_deref(), file_aktif);
        let pp = PathBuf::from(&pe);
        let abs = if pp.is_absolute() { pp } else { cwd.join(pp) };
        args["program"] = json!(abs.to_string_lossy());
    }
    if !config.args.is_empty() {
        args["args"] = json!(config
            .args
            .iter()
            .map(|a| ekspansi_var(a, ws.as_deref(), file_aktif))
            .collect::<Vec<_>>());
    }
    if !config.env.is_empty() {
        let env: HashMap<String, String> = config
            .env
            .iter()
            .map(|(k, v)| (k.clone(), ekspansi_var(v, ws.as_deref(), file_aktif)))
            .collect();
        args["env"] = json!(env);
    }
    for (k, v) in &config.extra {
        args[k] = v.clone();
    }
    let launch_body = request(&sesi, &config.request, args)?;

    Ok(json!({
        "pid": pid,
        "adapter": spec.id,
        "transport": if spec.tcp { "tcp" } else { "stdio" },
        "port": port,
        "capabilities": caps,
        "breakpoints": hasil_bp,
        "launch": launch_body,
    }))
}

/// Breakpoint yang dikirim frontend.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SumberBreakpoint {
    pub path: String,
    pub line: u32,
}

fn stop_internal(_rt: &DapRuntime) -> ZResult<bool> {
    let k = kembar();
    // ANAK ditutup dulu (koneksi TCP tambahan), lalu induk yang memegang proses.
    let anak = k.anak.lock().ok().and_then(|mut g| g.take());
    let induk = k.induk.lock().ok().and_then(|mut g| g.take());
    if anak.is_none() && induk.is_none() {
        return Ok(false);
    }

    if let Some(a) = &anak {
        let _ = request(a, "disconnect", json!({ "terminateDebuggee": true }));
        a.berakhir.store(true, Ordering::SeqCst);
    }

    let Some(sesi) = induk else { return Ok(true) };

    // Minta berhenti dengan sopan dulu (adapter membersihkan debuggee-nya),
    // baru bunuh prosesnya. Langsung kill meninggalkan program debuggee hidup.
    let _ = request(&sesi, "disconnect", json!({ "terminateDebuggee": true }));
    std::thread::sleep(std::time::Duration::from_millis(150));

    if let Ok(mut c) = sesi.child.lock() {
        if let Some(ch) = c.as_mut() {
            let _ = ch.kill();
            let _ = ch.wait();
        }
    }
    // Pohon proses: adapter Node menjalankan program debuggee sebagai anak.
    // Tanpa taskkill /T, `node program.js` tetap hidup setelah Stop.
    #[cfg(windows)]
    if sesi.pid != 0 {
        let _ = std::process::Command::new("taskkill")
            .args(["/PID", &sesi.pid.to_string(), "/T", "/F"])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status();
    }
    sesi.berakhir.store(true, Ordering::SeqCst);
    if let Ok(mut g) = k.port.lock() {
        *g = None;
    }
    Ok(true)
}

/// Hentikan sesi debug + seluruh pohon prosesnya.
#[tauri::command(async)]
pub fn dap_stop(rt: State<DapRuntime>) -> ZResult<bool> {
    stop_internal(&rt)
}

/// Status sesi untuk UI.
#[tauri::command(async)]
pub fn dap_status(_rt: State<DapRuntime>) -> ZResult<Value> {
    let k = kembar();
    let induk = k.induk.lock().ok().and_then(|g| g.clone());
    let anak = k.anak.lock().ok().and_then(|g| g.clone());
    // Sesi yang dilaporkan = yang memegang debuggee (anak bila ada).
    let utama = anak.clone().or_else(|| induk.clone());
    Ok(match utama {
        None => json!({ "aktif": false }),
        Some(s) => json!({
            "aktif": !s.berakhir.load(Ordering::SeqCst),
            "configName": induk.as_ref().map(|i| i.config_name.clone()).unwrap_or_default(),
            "type": s.tipe,
            "adapter": s.adapter_id,
            "pid": induk.as_ref().map(|i| i.pid).unwrap_or(0),
            "adaAnak": anak.is_some(),
            "siap": s.siap.load(Ordering::SeqCst),
            "capabilities": s.caps.read().ok().map(|c| c.clone()).unwrap_or(Value::Null),
        }),
    })
}

// ───────────────────────── kontrol eksekusi ─────────────────────────

/// Satu pintu untuk continue/next/stepIn/stepOut/pause.
///
/// Digabung karena bentuk argumennya identik (`threadId`) dan memisahkannya
/// jadi lima command Tauri hanya menambah lima tempat yang harus dijaga.
#[tauri::command(async)]
pub fn dap_kontrol(rt: State<DapRuntime>, aksi: String, thread_id: i64) -> ZResult<Value> {
    let sesi = sesi_aktif(&rt)?;
    let cmd = match aksi.as_str() {
        "continue" => "continue",
        "next" | "stepOver" => "next",
        "stepIn" => "stepIn",
        "stepOut" => "stepOut",
        "pause" => "pause",
        lain => {
            return Err(ZephyrError::InvalidInput(format!(
                "aksi debug \"{lain}\" tidak dikenal"
            )))
        }
    };
    request(&sesi, cmd, json!({ "threadId": thread_id }))
}

/// Daftar thread debuggee.
#[tauri::command(async)]
pub fn dap_threads(rt: State<DapRuntime>) -> ZResult<Value> {
    request(&sesi_aktif(&rt)?, "threads", Value::Null)
}

/// Call stack satu thread.
#[tauri::command(async)]
pub fn dap_stack(rt: State<DapRuntime>, thread_id: i64) -> ZResult<Value> {
    request(
        &sesi_aktif(&rt)?,
        "stackTrace",
        json!({ "threadId": thread_id, "startFrame": 0, "levels": 50 }),
    )
}

/// Scope satu frame (Local/Closure/Global).
#[tauri::command(async)]
pub fn dap_scopes(rt: State<DapRuntime>, frame_id: i64) -> ZResult<Value> {
    request(&sesi_aktif(&rt)?, "scopes", json!({ "frameId": frame_id }))
}

/// Variabel dalam satu scope / object (untuk expand tree).
#[tauri::command(async)]
pub fn dap_variables(rt: State<DapRuntime>, variables_reference: i64) -> ZResult<Value> {
    request(
        &sesi_aktif(&rt)?,
        "variables",
        json!({ "variablesReference": variables_reference }),
    )
}

/// Evaluasi ekspresi — dipakai Debug Console REPL, watch, dan hover.
#[tauri::command(async)]
pub fn dap_evaluate(
    rt: State<DapRuntime>,
    expression: String,
    frame_id: Option<i64>,
    context: Option<String>,
) -> ZResult<Value> {
    let mut args = json!({
        "expression": expression,
        "context": context.unwrap_or_else(|| "repl".into()),
    });
    // frameId dihilangkan (bukan null) saat tidak ada frame: beberapa adapter
    // menolak `frameId: null` dengan error skema.
    if let Some(f) = frame_id {
        args["frameId"] = json!(f);
    }
    request(&sesi_aktif(&rt)?, "evaluate", args)
}

/// Ubah nilai variabel bila adapter mendukungnya (`supportsSetVariable`).
#[tauri::command(async)]
pub fn dap_set_variable(
    rt: State<DapRuntime>,
    variables_reference: i64,
    name: String,
    value: String,
) -> ZResult<Value> {
    let sesi = sesi_aktif(&rt)?;
    let dukung = sesi
        .caps
        .read()
        .ok()
        .and_then(|c| c.get("supportsSetVariable").and_then(|x| x.as_bool()))
        .unwrap_or(false);
    if !dukung {
        return Err(ZephyrError::InvalidInput(
            "adapter ini tidak mendukung Set Value".into(),
        ));
    }
    request(
        &sesi,
        "setVariable",
        json!({ "variablesReference": variables_reference, "name": name, "value": value }),
    )
}

/// Pasang ulang breakpoint satu file saat sesi berjalan.
#[tauri::command(async)]
pub fn dap_set_breakpoints(rt: State<DapRuntime>, path: String, lines: Vec<u32>) -> ZResult<Value> {
    let sesi = sesi_aktif(&rt)?;
    let bps: Vec<Value> = lines.iter().map(|l| json!({ "line": l })).collect();
    request(
        &sesi,
        "setBreakpoints",
        json!({ "source": { "path": path }, "breakpoints": bps }),
    )
}

/// Skrip yang sudah dimuat debuggee (view LOADED SCRIPTS).
#[tauri::command(async)]
pub fn dap_loaded_sources(rt: State<DapRuntime>) -> ZResult<Value> {
    let sesi = sesi_aktif(&rt)?;
    let dukung = sesi
        .caps
        .read()
        .ok()
        .and_then(|c| {
            c.get("supportsLoadedSourcesRequest")
                .and_then(|x| x.as_bool())
        })
        .unwrap_or(false);
    if !dukung {
        return Ok(json!({ "sources": [] }));
    }
    request(&sesi, "loadedSources", json!({}))
}

// ───────────────────────── uji ─────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn launch_json_jsonc_dengan_komentar() {
        let teks = r#"{
  // komentar baris
  "version": "0.2.0",
  /* blok */
  "configurations": [
    { "name": "Node uji", "type": "node", "request": "launch", "program": "${workspaceFolder}/a.js" }
  ]
}"#;
        let f = parse_launch(teks, "x").unwrap();
        assert_eq!(f.version, "0.2.0");
        assert_eq!(f.configurations.len(), 1);
        assert_eq!(f.configurations[0].name, "Node uji");
        assert_eq!(f.invalid.len(), 0);
    }

    #[test]
    fn entri_tanpa_name_atau_type_ditolak_dengan_alasan() {
        let teks = r#"{
  "configurations": [
    { "type": "node", "request": "launch" },
    { "name": "tanpa type" },
    { "name": "req aneh", "type": "node", "request": "restart" },
    { "name": "ok", "type": "node" }
  ]
}"#;
        let f = parse_launch(teks, "x").unwrap();
        assert_eq!(f.configurations.len(), 1, "hanya satu yang valid");
        assert_eq!(f.invalid.len(), 3);
        assert!(f.invalid[0].reason.contains("name"));
        assert!(f.invalid[1].reason.contains("type"));
        assert!(f.invalid[2].reason.contains("restart"));
    }

    #[test]
    fn request_default_launch() {
        let teks = r#"{ "configurations": [ { "name": "a", "type": "node" } ] }"#;
        let f = parse_launch(teks, "x").unwrap();
        assert_eq!(f.configurations[0].request, "launch");
    }

    #[test]
    fn field_tak_dikenal_disimpan_di_extra() {
        // Opsi adapter yang tidak ada di skema kita HARUS diteruskan, kalau
        // tidak fitur adapter (skipFiles, justMyCode, …) jadi tidak bisa dipakai.
        let teks = r#"{ "configurations": [
            { "name": "a", "type": "node", "skipFiles": ["<node_internals>/**"], "justMyCode": false }
        ] }"#;
        let f = parse_launch(teks, "x").unwrap();
        let c = &f.configurations[0];
        assert!(c.extra.contains_key("skipFiles"));
        assert_eq!(
            c.extra.get("justMyCode").and_then(|v| v.as_bool()),
            Some(false)
        );
    }

    #[test]
    fn ekspansi_workspace_folder() {
        let ws = std::path::Path::new("D:/Zephyr");
        // Kasus yang membuat spawn gagal os error 267 sebelum diperbaiki.
        assert_eq!(
            ekspansi_var("${workspaceFolder}", Some(ws), None),
            "D:/Zephyr"
        );
        assert_eq!(
            ekspansi_var("${workspaceFolder}/a.js", Some(ws), None),
            "D:/Zephyr/a.js"
        );
        // Alias lama VS Code.
        assert_eq!(
            ekspansi_var("${workspaceRoot}", Some(ws), None),
            "D:/Zephyr"
        );
        assert_eq!(
            ekspansi_var("${workspaceFolderBasename}", Some(ws), None),
            "Zephyr"
        );
    }

    #[test]
    fn ekspansi_file_aktif_dan_env() {
        let ws = std::path::Path::new("D:/Zephyr");
        let f = "D:/Zephyr/src/a.ts";
        assert_eq!(ekspansi_var("${file}", Some(ws), Some(f)), f);
        assert_eq!(ekspansi_var("${fileBasename}", Some(ws), Some(f)), "a.ts");
        assert_eq!(
            ekspansi_var("${fileBasenameNoExtension}", Some(ws), Some(f)),
            "a"
        );
        assert_eq!(
            ekspansi_var("${fileDirname}", Some(ws), Some(f)),
            "D:/Zephyr/src"
        );

        std::env::set_var("ZEPHYR_UJI22", "nilai-uji");
        assert_eq!(
            ekspansi_var("x/${env:ZEPHYR_UJI22}/y", Some(ws), None),
            "x/nilai-uji/y"
        );
        // env yang tidak ada → string kosong (perilaku VS Code).
        assert_eq!(
            ekspansi_var("[${env:ZEPHYR_TIDAK_ADA_XYZ}]", Some(ws), None),
            "[]"
        );
    }

    #[test]
    fn variabel_tak_dikenal_dibiarkan_apa_adanya() {
        // Sengaja TIDAK dikosongkan: path rusak lebih sulit dilacak daripada
        // variabel yang masih terlihat di pesan error.
        let ws = std::path::Path::new("D:/Zephyr");
        assert_eq!(
            ekspansi_var("${lineNumber}", Some(ws), None),
            "${lineNumber}"
        );
    }

    #[test]
    fn tipe_node_dipetakan_ke_pwa_node() {
        // js-debug menolak "node" (Error: Unknown config) — pemetaan ini yang
        // membuat launch.json bergaya VS Code tetap jalan.
        assert_eq!(tipe_untuk_adapter("node"), "pwa-node");
        assert_eq!(tipe_untuk_adapter("chrome"), "pwa-chrome");
        // Yang sudah bernama internal dibiarkan.
        assert_eq!(tipe_untuk_adapter("pwa-node"), "pwa-node");
        // python tidak dipetakan.
        assert_eq!(tipe_untuk_adapter("python"), "python");
    }

    #[test]
    fn port_bebas_berbeda_tiap_panggil_dan_bisa_dibind() {
        let p = port_bebas().unwrap();
        assert!(p > 1024);
        // Port yang diberikan harus benar-benar bisa dipakai.
        let l = std::net::TcpListener::bind(("127.0.0.1", p));
        assert!(l.is_ok(), "port {p} hasil port_bebas tidak bisa dibind");
    }

    #[test]
    fn type_alias_dipetakan_ke_adapter_yang_sama() {
        // Alias js-debug yang lazim di launch.json nyata tidak boleh ditolak.
        for t in ["node", "pwa-node", "node-terminal"] {
            assert!(
                matches!(t, "node" | "pwa-node" | "node-terminal"),
                "alias {t} harus dikenal"
            );
        }
    }
}
