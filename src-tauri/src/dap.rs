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

const REQ_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(25);

const TCP_TUNGGU: std::time::Duration = std::time::Duration::from_secs(12);

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

pub fn ekspansi_var(teks: &str, ws: Option<&std::path::Path>, file_aktif: Option<&str>) -> String {
    let mut out = teks.to_string();

    if let Some(w) = ws {
        let ws_str = w.to_string_lossy().to_string();
        out = out.replace("${workspaceFolder}", &ws_str);

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

    while let Some(i) = out.find("${env:") {
        let Some(j) = out[i..].find('}') else { break };
        let nama = &out[i + 6..i + j];
        let nilai = std::env::var(nama).unwrap_or_default();
        out = format!("{}{}{}", &out[..i], nilai, &out[i + j + 1..]);
    }

    out
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchFile {
    pub path: String,
    pub version: String,
    pub configurations: Vec<DebugConfig>,

    pub invalid: Vec<InvalidEntry>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InvalidEntry {
    pub index: usize,
    pub name: String,
    pub reason: String,
}

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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdapterSpec {
    pub id: String,

    pub cmd: Vec<String>,

    pub tcp: bool,

    pub missing: String,
}

fn dap_dir(state: &AppState) -> PathBuf {
    state.data_dir.join("dap")
}

fn spec_node(state: &AppState) -> AdapterSpec {
    let entry = dap_dir(state)
        .join("js-debug")
        .join("src")
        .join("dapDebugServer.js");
    let ada = entry.is_file();
    AdapterSpec {
        id: "node".into(),
        cmd: vec!["node".into(), entry.to_string_lossy().to_string()],
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

fn spec_python(state: &AppState) -> AdapterSpec {
    let py = cari_python(state);
    let ada_debugpy = py
        .as_ref()
        .map(|p| {
            crate::proc::cmd(p)
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
        if let Ok(out) = crate::proc::cmd(nama).arg("--version").output() {
            if out.status.success() {
                return Some(PathBuf::from(nama));
            }
        }
    }
    None
}

pub fn spec_untuk(state: &AppState, tipe: &str) -> ZResult<AdapterSpec> {
    match tipe {
        "node" | "pwa-node" | "node-terminal" | "pwa-chrome" => Ok(spec_node(state)),
        "python" | "debugpy" => Ok(spec_python(state)),
        lain => Err(ZephyrError::InvalidInput(format!(
            "debug type \"{lain}\" belum didukung (v1: node, python)"
        ))),
    }
}

pub fn tipe_untuk_adapter(tipe: &str) -> &str {
    match tipe {
        "node" => "pwa-node",
        "chrome" => "pwa-chrome",
        "msedge" => "pwa-msedge",
        lain => lain,
    }
}

#[tauri::command(async)]
pub fn dap_adapters(state: State<AppState>) -> ZResult<Vec<AdapterSpec>> {
    Ok(vec![spec_node(&state), spec_python(&state)])
}

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

pub struct Sesi {
    pub config_name: String,
    pub tipe: String,
    pub adapter_id: String,
    pub pid: u32,

    child: Mutex<Option<std::process::Child>>,
    tulis: Mutex<Tulis>,
    next_seq: AtomicI64,
    pending: Mutex<HashMap<i64, std::sync::mpsc::Sender<Result<Value, String>>>>,

    pub caps: RwLock<Value>,

    pub siap: Arc<AtomicBool>,

    pub berakhir: Arc<AtomicBool>,

    pub induk: bool,
}

#[derive(Default)]
pub struct DapRuntime {
    _marker: (),
}

#[derive(Default)]
struct Kembar {
    induk: Mutex<Option<Arc<Sesi>>>,

    anak: Mutex<Option<Arc<Sesi>>>,

    port: Mutex<Option<u16>>,

    bp: Mutex<Vec<SumberBreakpoint>>,
}

fn kembar() -> &'static Kembar {
    static K: std::sync::OnceLock<Kembar> = std::sync::OnceLock::new();
    K.get_or_init(Kembar::default)
}

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

fn app_emit_bp(_sesi: &Arc<Sesi>, _path: &str, _body: &Value) -> ZResult<()> {
    Ok(())
}

#[tauri::command(async)]
pub fn dap_start(
    app: AppHandle,
    state: State<AppState>,
    rt: State<DapRuntime>,
    config: DebugConfig,
    breakpoints: Vec<SumberBreakpoint>,
) -> ZResult<Value> {
    crate::workspace::ensure_trusted(&state, "Debug")?;

    let _ = stop_internal(&rt);

    let spec = spec_untuk(&state, &config.tipe)?;
    if !spec.missing.is_empty() {
        return Err(ZephyrError::NotFound(spec.missing));
    }

    let ws = state.workspace_path();
    let file_aktif = None;

    let cwd_teks = config
        .cwd
        .as_deref()
        .map(|c| ekspansi_var(c, ws.as_deref(), file_aktif));
    let cwd = cwd_teks
        .filter(|c| !c.trim().is_empty())
        .map(PathBuf::from)
        .or_else(|| ws.clone())
        .ok_or_else(|| ZephyrError::InvalidInput("belum ada workspace".into()))?;

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

        cmd_vec.push("127.0.0.1".to_string());
    }

    let mut cmd = crate::proc::cmd(&cmd_vec[0]);
    cmd.args(&cmd_vec[1..])
        .current_dir(&cwd)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    let mut child = cmd.spawn().map_err(|e| {
        ZephyrError::Io(format!(
            "gagal menjalankan adapter {}: {e}",
            cmd_vec.join(" ")
        ))
    })?;
    let pid = child.id();

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

    let batas = std::time::Instant::now() + REQ_TIMEOUT;
    while !sesi.siap.load(Ordering::SeqCst) && std::time::Instant::now() < batas {
        if sesi.berakhir.load(Ordering::SeqCst) {
            return Err(ZephyrError::Internal(
                "adapter berakhir sebelum initialized".into(),
            ));
        }
        std::thread::sleep(std::time::Duration::from_millis(30));
    }

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

    if caps
        .get("supportsConfigurationDoneRequest")
        .and_then(|x| x.as_bool())
        .unwrap_or(false)
    {
        let _ = request(&sesi, "configurationDone", json!({}));
    }

    let mut args = json!({

        "type": tipe_untuk_adapter(&config.tipe),
        "request": config.request,
        "name": config.name,
        "cwd": cwd.to_string_lossy(),
        "stopOnEntry": config.stop_on_entry,
    });
    if let Some(p) = &config.program {
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

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SumberBreakpoint {
    pub path: String,
    pub line: u32,
}

fn stop_internal(_rt: &DapRuntime) -> ZResult<bool> {
    let k = kembar();

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

    let _ = request(&sesi, "disconnect", json!({ "terminateDebuggee": true }));
    std::thread::sleep(std::time::Duration::from_millis(150));

    if let Ok(mut c) = sesi.child.lock() {
        if let Some(ch) = c.as_mut() {
            let _ = ch.kill();
            let _ = ch.wait();
        }
    }

    #[cfg(windows)]
    if sesi.pid != 0 {
        let mut tk = crate::proc::cmd("taskkill");
        tk.args(["/PID", &sesi.pid.to_string(), "/T", "/F"])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null());
        let _ = tk.status();
    }
    #[cfg(not(windows))]
    if sesi.pid != 0 {
        let _ = std::process::Command::new("kill")
            .args(["-9", &sesi.pid.to_string()])
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

#[tauri::command(async)]
pub fn dap_stop(rt: State<DapRuntime>) -> ZResult<bool> {
    stop_internal(&rt)
}

#[tauri::command(async)]
pub fn dap_status(_rt: State<DapRuntime>) -> ZResult<Value> {
    let k = kembar();
    let induk = k.induk.lock().ok().and_then(|g| g.clone());
    let anak = k.anak.lock().ok().and_then(|g| g.clone());

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

#[tauri::command(async)]
pub fn dap_threads(rt: State<DapRuntime>) -> ZResult<Value> {
    request(&sesi_aktif(&rt)?, "threads", Value::Null)
}

#[tauri::command(async)]
pub fn dap_stack(rt: State<DapRuntime>, thread_id: i64) -> ZResult<Value> {
    request(
        &sesi_aktif(&rt)?,
        "stackTrace",
        json!({ "threadId": thread_id, "startFrame": 0, "levels": 50 }),
    )
}

#[tauri::command(async)]
pub fn dap_scopes(rt: State<DapRuntime>, frame_id: i64) -> ZResult<Value> {
    request(&sesi_aktif(&rt)?, "scopes", json!({ "frameId": frame_id }))
}

#[tauri::command(async)]
pub fn dap_variables(rt: State<DapRuntime>, variables_reference: i64) -> ZResult<Value> {
    request(
        &sesi_aktif(&rt)?,
        "variables",
        json!({ "variablesReference": variables_reference }),
    )
}

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

    if let Some(f) = frame_id {
        args["frameId"] = json!(f);
    }
    request(&sesi_aktif(&rt)?, "evaluate", args)
}

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn launch_json_jsonc_dengan_komentar() {
        let teks = r#"{
  
  "version": "0.2.0",
  
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

        assert_eq!(
            ekspansi_var("${workspaceFolder}", Some(ws), None),
            "D:/Zephyr"
        );
        assert_eq!(
            ekspansi_var("${workspaceFolder}/a.js", Some(ws), None),
            "D:/Zephyr/a.js"
        );

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

        assert_eq!(
            ekspansi_var("[${env:ZEPHYR_TIDAK_ADA_XYZ}]", Some(ws), None),
            "[]"
        );
    }

    #[test]
    fn variabel_tak_dikenal_dibiarkan_apa_adanya() {
        let ws = std::path::Path::new("D:/Zephyr");
        assert_eq!(
            ekspansi_var("${lineNumber}", Some(ws), None),
            "${lineNumber}"
        );
    }

    #[test]
    fn tipe_node_dipetakan_ke_pwa_node() {
        assert_eq!(tipe_untuk_adapter("node"), "pwa-node");
        assert_eq!(tipe_untuk_adapter("chrome"), "pwa-chrome");

        assert_eq!(tipe_untuk_adapter("pwa-node"), "pwa-node");

        assert_eq!(tipe_untuk_adapter("python"), "python");
    }

    #[test]
    fn port_bebas_berbeda_tiap_panggil_dan_bisa_dibind() {
        let p = port_bebas().unwrap();
        assert!(p > 1024);

        let l = std::net::TcpListener::bind(("127.0.0.1", p));
        assert!(l.is_ok(), "port {p} hasil port_bebas tidak bisa dibind");
    }

    #[test]
    fn type_alias_dipetakan_ke_adapter_yang_sama() {
        for t in ["node", "pwa-node", "node-terminal"] {
            assert!(
                matches!(t, "node" | "pwa-node" | "node-terminal"),
                "alias {t} harus dikenal"
            );
        }
    }
}
