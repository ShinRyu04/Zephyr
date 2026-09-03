// lsp.rs — klien Language Server Protocol (fase 21).
//
// ARSITEKTUR (brief fase 21):
//   * Proses language server di-spawn dari Rust, JSON-RPC lewat stdio.
//   * Satu server per (bahasa, root workspace) — bukan satu per file.
//   * LAZY: server hanya start saat file bertipe itu dibuka.
//   * IDLE-SHUTDOWN: mati sendiri setelah N menit tanpa aktivitas (hemat RAM).
//   * Binary TIDAK dibundel installer: dicari di setting user → %APPDATA%\
//     zephyr\lsp\ → PATH → node_modules (khusus dev).
//
// Kenapa reader-nya OS thread biasa, bukan tokio task:
//   Framing LSP (`Content-Length: N\r\n\r\n{json}`) perlu baca byte-eksak dari
//   stdout. `std::process` + thread blocking jauh lebih sederhana dan tidak
//   menahan runtime tokio; balasan diantar ke pemanggil async lewat oneshot.
//   Pola yang sama dipakai git.rs (std::process, bukan tokio::process).

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicI64, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock, RwLock};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};

use crate::app_state::AppState;
use crate::errors::{ZResult, ZephyrError};

/// Batas waktu satu request LSP. tsserver pada proyek besar bisa lambat saat
/// indexing pertama, jadi jangan terlalu pendek.
const REQ_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(20);

/// Server yang tidak dipakai selama ini akan dimatikan (V5).
const IDLE_SECS_DEFAULT: u64 = 300;

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

// ───────────────────────── state proses ─────────────────────────

struct Server {
    id: String,
    lang: String,
    root: PathBuf,
    pid: u32,
    cmd_line: String,
    child: Mutex<std::process::Child>,
    stdin: Mutex<std::process::ChildStdin>,
    next_id: AtomicI64,
    pending: Mutex<HashMap<i64, std::sync::mpsc::Sender<Result<Value, String>>>>,
    /// kapabilitas dari hasil `initialize`
    caps: RwLock<Value>,
    last_activity: AtomicU64,
    started_at: u64,
    /// file yang sedang dibuka (didOpen) — dipakai untuk tahu kapan boleh idle
    open_docs: Mutex<Vec<String>>,
    idle_secs: AtomicU64,
}

type Registry = RwLock<HashMap<String, Arc<Server>>>;

fn registry() -> &'static Registry {
    static REG: OnceLock<Registry> = OnceLock::new();
    REG.get_or_init(|| RwLock::new(HashMap::new()))
}

fn get(id: &str) -> ZResult<Arc<Server>> {
    registry()
        .read()
        .map_err(|_| ZephyrError::Internal("registry lsp terkunci".into()))?
        .get(id)
        .cloned()
        .ok_or_else(|| ZephyrError::NotFound(format!("language server {id} tidak hidup")))
}

// ───────────────────────── framing JSON-RPC ─────────────────────────

fn write_msg(srv: &Server, msg: &Value) -> ZResult<()> {
    let body = serde_json::to_vec(msg)
        .map_err(|e| ZephyrError::Internal(format!("serialisasi lsp gagal: {e}")))?;
    let mut out = srv
        .stdin
        .lock()
        .map_err(|_| ZephyrError::Internal("stdin lsp terkunci".into()))?;
    // Header WAJIB \r\n — banyak server menolak \n saja.
    out.write_all(format!("Content-Length: {}\r\n\r\n", body.len()).as_bytes())
        .map_err(|e| ZephyrError::Io(format!("tulis header lsp: {e}")))?;
    out.write_all(&body)
        .map_err(|e| ZephyrError::Io(format!("tulis body lsp: {e}")))?;
    out.flush()
        .map_err(|e| ZephyrError::Io(format!("flush lsp: {e}")))?;
    srv.last_activity.store(now_secs(), Ordering::Relaxed);
    Ok(())
}

/// Baca satu frame LSP. `None` = stream tertutup (server mati).
fn read_frame(r: &mut BufReader<std::process::ChildStdout>) -> Option<Value> {
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
            break; // akhir header
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

// ───────────────────────── resolver binary ─────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerSpec {
    /// id server, mis. "typescript"
    pub id: String,
    /// perintah + argumen. Elemen pertama = executable.
    pub cmd: Vec<String>,
    /// languageId LSP, mis. "typescript"
    pub lang: String,
}

/// Cari entry-point Node untuk sebuah bin name di `node_modules`.
/// Membaca field `bin` di package.json paket yang namanya sama dengan bin-nya
/// (kasus umum: `typescript-language-server`), jadi tidak ada path yang
/// di-hardcode.
fn script_node(node_modules: &Path, bin_name: &str) -> Option<PathBuf> {
    let pkg_dir = node_modules.join(bin_name);
    let pkg_json = pkg_dir.join("package.json");
    let teks = std::fs::read_to_string(&pkg_json).ok()?;
    let v: Value = serde_json::from_str(&teks).ok()?;

    let rel = match v.get("bin") {
        // "bin": "./lib/cli.mjs"
        Some(Value::String(s)) => s.clone(),
        // "bin": { "<nama>": "./lib/cli.mjs" }
        Some(Value::Object(map)) => map
            .get(bin_name)
            .and_then(|x| x.as_str())
            .or_else(|| map.values().next().and_then(|x| x.as_str()))?
            .to_string(),
        _ => return None,
    };

    let p = pkg_dir.join(rel.trim_start_matches("./"));
    if p.is_file() {
        Some(p)
    } else {
        None
    }
}

/// Cari executable dengan urutan: absolut → %APPDATA%\zephyr\lsp\<id>\ →
/// node_modules\.bin milik workspace → PATH.
///
/// node_modules workspace ADA DI DAFTAR dengan sengaja: proyek Node biasanya
/// sudah memasang language server-nya sendiri (typescript-language-server,
/// yaml-language-server, dll), dan memakai versi proyek lebih benar daripada
/// memaksa versi global — perilaku yang sama dengan VS Code untuk TypeScript.
fn resolve_cmd(app: &AppHandle, spec: &ServerSpec, root: &Path) -> ZResult<(String, Vec<String>)> {
    if spec.cmd.is_empty() {
        return Err(ZephyrError::InvalidInput("cmd language server kosong".into()));
    }
    let exe = spec.cmd[0].clone();
    let args: Vec<String> = spec.cmd[1..].to_vec();

    // Path absolut yang benar-benar ada dipakai apa adanya.
    let p = Path::new(&exe);
    if p.is_absolute() && p.exists() {
        return Ok((exe, args));
    }

    // %APPDATA%\zephyr\lsp\<id>\<exe>
    let state = app.state::<AppState>();
    let kandidat = state.data_dir.join("lsp").join(&spec.id).join(&exe);
    if kandidat.exists() {
        return Ok((kandidat.to_string_lossy().to_string(), args));
    }
    for ext in ["exe", "cmd", "bat"] {
        let k = kandidat.with_extension(ext);
        if k.exists() {
            return Ok((k.to_string_lossy().to_string(), args));
        }
    }

    // <workspace>\node_modules\.bin\<exe>[.cmd]
    //
    // Yang dikembalikan BUKAN shim `.cmd`-nya, tapi `node <script.mjs>`.
    // Alasannya penting: shim .cmd dijalankan lewat cmd.exe, jadi PID yang
    // kita pegang adalah cmd.exe — membunuhnya meninggalkan proses node
    // menggantung dan idle-shutdown (V5) tidak benar-benar melepas RAM.
    // Dengan memanggil node langsung, PID di `lsp_status` = proses server asli.
    if !root.as_os_str().is_empty() {
        let nm = root.join("node_modules");
        if let Some(script) = script_node(&nm, &exe) {
            if let Ok(node) = which::which("node") {
                let mut a = vec![script.to_string_lossy().to_string()];
                a.extend(args.clone());
                return Ok((node.to_string_lossy().to_string(), a));
            }
        }
        // Tidak ketemu paketnya → pakai shim Windows (.cmd) sebagai cadangan.
        let bin = nm.join(".bin");
        for nama in [format!("{exe}.cmd"), format!("{exe}.exe"), format!("{exe}.bat")] {
            let k = bin.join(&nama);
            if k.is_file() {
                return Ok((k.to_string_lossy().to_string(), args));
            }
        }
    }

    // PATH.
    if let Ok(found) = which::which(&exe) {
        return Ok((found.to_string_lossy().to_string(), args));
    }

    Err(ZephyrError::NotFound(format!(
        "{exe} tidak ditemukan. Pasang language server '{}' ke PATH atau {}",
        spec.id,
        state.data_dir.join("lsp").join(&spec.id).display()
    )))
}

// ───────────────────────── start / stop ─────────────────────────

fn emit(app: &AppHandle, payload: Value) {
    let _ = app.emit("lsp-event", payload);
}

/// Balas request server→klien yang wajib dijawab, kalau tidak server menggantung.
fn reply_server_request(srv: &Server, id: &Value, method: &str) {
    let result = match method {
        // Kita tidak menyediakan konfigurasi per-scope: kirim array null
        // sepanjang jumlah item yang diminta agar server tidak menunggu.
        "workspace/configuration" => json!([Value::Null]),
        "client/registerCapability" | "client/unregisterCapability" => Value::Null,
        "window/workDoneProgress/create" => Value::Null,
        "workspace/applyEdit" => json!({ "applied": false }),
        _ => Value::Null,
    };
    let _ = write_msg(
        srv,
        &json!({ "jsonrpc": "2.0", "id": id, "result": result }),
    );
}

#[tauri::command(async)]
pub async fn lsp_start(
    app: AppHandle,
    spec: ServerSpec,
    root: String,
    init_options: Option<Value>,
    idle_secs: Option<u64>,
) -> ZResult<Value> {
    let key = format!("{}::{}", spec.id, root.to_lowercase());

    // Sudah hidup? pakai yang ada (satu server per bahasa+root).
    if let Ok(reg) = registry().read() {
        if let Some(s) = reg.get(&key) {
            s.last_activity.store(now_secs(), Ordering::Relaxed);
            return Ok(json!({
                "id": s.id, "pid": s.pid, "reused": true,
                "capabilities": s.caps.read().map(|c| c.clone()).unwrap_or(Value::Null),
            }));
        }
    }

    let (exe, args) = resolve_cmd(&app, &spec, Path::new(&root))?;
    let cmd_line = format!("{exe} {}", args.join(" "));

    let mut c = std::process::Command::new(&exe);
    c.args(&args)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    if !root.is_empty() && Path::new(&root).is_dir() {
        c.current_dir(&root);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW — tanpa ini setiap server memunculkan jendela konsol.
        c.creation_flags(0x0800_0000);
    }

    let mut child = c
        .spawn()
        .map_err(|e| ZephyrError::Io(format!("gagal menjalankan {exe}: {e}")))?;
    let pid = child.id();
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| ZephyrError::Internal("stdin language server tidak ada".into()))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| ZephyrError::Internal("stdout language server tidak ada".into()))?;
    let stderr = child.stderr.take();

    let srv = Arc::new(Server {
        id: key.clone(),
        lang: spec.lang.clone(),
        root: PathBuf::from(&root),
        pid,
        cmd_line: cmd_line.clone(),
        child: Mutex::new(child),
        stdin: Mutex::new(stdin),
        next_id: AtomicI64::new(1),
        pending: Mutex::new(HashMap::new()),
        caps: RwLock::new(Value::Null),
        last_activity: AtomicU64::new(now_secs()),
        started_at: now_secs(),
        open_docs: Mutex::new(Vec::new()),
        idle_secs: AtomicU64::new(idle_secs.unwrap_or(IDLE_SECS_DEFAULT)),
    });

    // Reader stdout: balasan → pending, notifikasi → frontend.
    {
        let srv2 = srv.clone();
        let app2 = app.clone();
        std::thread::spawn(move || {
            let mut r = BufReader::new(stdout);
            while let Some(msg) = read_frame(&mut r) {
                srv2.last_activity.store(now_secs(), Ordering::Relaxed);

                let punya_id = msg.get("id").is_some();
                let punya_method = msg.get("method").is_some();

                if punya_id && !punya_method {
                    // Balasan untuk request kita.
                    let id = msg.get("id").and_then(|v| v.as_i64()).unwrap_or(-1);
                    let hasil = if let Some(err) = msg.get("error") {
                        Err(err
                            .get("message")
                            .and_then(|m| m.as_str())
                            .unwrap_or("error tanpa pesan")
                            .to_string())
                    } else {
                        Ok(msg.get("result").cloned().unwrap_or(Value::Null))
                    };
                    if let Ok(mut pend) = srv2.pending.lock() {
                        if let Some(tx) = pend.remove(&id) {
                            let _ = tx.send(hasil);
                        }
                    }
                    continue;
                }

                if punya_method {
                    let method = msg
                        .get("method")
                        .and_then(|m| m.as_str())
                        .unwrap_or("")
                        .to_string();

                    if punya_id {
                        // Request dari server → wajib dibalas.
                        if let Some(id) = msg.get("id") {
                            reply_server_request(&srv2, id, &method);
                        }
                        continue;
                    }

                    // Notifikasi → frontend (diagnostics, log, dll).
                    emit(
                        &app2,
                        json!({
                            "server": srv2.id,
                            "lang": srv2.lang,
                            "kind": "notification",
                            "method": method,
                            "params": msg.get("params").cloned().unwrap_or(Value::Null),
                        }),
                    );
                }
            }

            // Stream tertutup = proses mati.
            emit(
                &app2,
                json!({ "server": srv2.id, "lang": srv2.lang, "kind": "exit" }),
            );
            if let Ok(mut reg) = registry().write() {
                reg.remove(&srv2.id);
            }
        });
    }

    // Reader stderr: masuk Output channel "LSP" lewat event yang sama.
    if let Some(errout) = stderr {
        let app3 = app.clone();
        let id3 = key.clone();
        std::thread::spawn(move || {
            let r = BufReader::new(errout);
            for line in r.lines().map_while(Result::ok) {
                if line.trim().is_empty() {
                    continue;
                }
                emit(
                    &app3,
                    json!({ "server": id3, "kind": "stderr", "text": line }),
                );
            }
        });
    }

    registry()
        .write()
        .map_err(|_| ZephyrError::Internal("registry lsp terkunci".into()))?
        .insert(key.clone(), srv.clone());

    // initialize + initialized (wajib sebelum request apa pun).
    let root_uri = if root.is_empty() {
        Value::Null
    } else {
        json!(path_to_uri(Path::new(&root)))
    };
    let init = request_blocking(
        &srv,
        "initialize",
        json!({
            "processId": std::process::id(),
            "clientInfo": { "name": "Zephyr", "version": env!("CARGO_PKG_VERSION") },
            "locale": "en",
            "rootUri": root_uri,
            "workspaceFolders": if root.is_empty() { Value::Null } else {
                json!([{ "uri": path_to_uri(Path::new(&root)), "name": "workspace" }])
            },
            "initializationOptions": init_options.unwrap_or(Value::Null),
            "capabilities": client_capabilities(),
        }),
    );

    match init {
        Ok(res) => {
            if let Ok(mut c) = srv.caps.write() {
                *c = res.get("capabilities").cloned().unwrap_or(Value::Null);
            }
            let _ = write_msg(
                &srv,
                &json!({ "jsonrpc": "2.0", "method": "initialized", "params": {} }),
            );
            emit(
                &app,
                json!({ "server": srv.id, "lang": srv.lang, "kind": "ready", "pid": pid,
                        "cmd": cmd_line }),
            );
            Ok(json!({
                "id": srv.id, "pid": pid, "reused": false, "cmd": cmd_line,
                "capabilities": res.get("capabilities").cloned().unwrap_or(Value::Null),
            }))
        }
        Err(e) => {
            // initialize gagal = server tidak berguna; jangan tinggalkan zombie.
            let _ = stop_server(&srv);
            if let Ok(mut reg) = registry().write() {
                reg.remove(&key);
            }
            Err(e)
        }
    }
}

fn client_capabilities() -> Value {
    json!({
        "workspace": {
            "workspaceFolders": true,
            "configuration": true,
            "didChangeConfiguration": { "dynamicRegistration": false },
            "symbol": { "dynamicRegistration": false }
        },
        "textDocument": {
            "synchronization": { "didSave": true, "willSave": false, "dynamicRegistration": false },
            "completion": {
                "dynamicRegistration": false,
                "completionItem": {
                    "snippetSupport": false,
                    "documentationFormat": ["markdown", "plaintext"],
                    "resolveSupport": { "properties": ["documentation", "detail"] }
                },
                "contextSupport": true
            },
            "hover": { "contentFormat": ["markdown", "plaintext"], "dynamicRegistration": false },
            "signatureHelp": {
                "dynamicRegistration": false,
                "signatureInformation": { "documentationFormat": ["markdown", "plaintext"] }
            },
            "definition": { "linkSupport": false, "dynamicRegistration": false },
            "typeDefinition": { "dynamicRegistration": false },
            "implementation": { "dynamicRegistration": false },
            "references": { "dynamicRegistration": false },
            "documentSymbol": { "hierarchicalDocumentSymbolSupport": true, "dynamicRegistration": false },
            "codeAction": {
                "dynamicRegistration": false,
                "codeActionLiteralSupport": {
                    "codeActionKind": {
                        "valueSet": ["quickfix", "refactor", "refactor.extract",
                                     "refactor.inline", "refactor.rewrite", "source",
                                     "source.organizeImports"]
                    }
                }
            },
            "rename": { "dynamicRegistration": false, "prepareSupport": true },
            "formatting": { "dynamicRegistration": false },
            "rangeFormatting": { "dynamicRegistration": false },
            "publishDiagnostics": { "relatedInformation": true, "versionSupport": false }
        }
    })
}

/// Konversi path Windows → file:// URI yang diterima language server.
pub fn path_to_uri(p: &Path) -> String {
    let s = crate::paths::strip_unc(p).to_string_lossy().replace('\\', "/");
    let s = if s.starts_with('/') { s } else { format!("/{s}") };
    // Encode karakter yang bermasalah; biarkan '/' , ':' dan alfanumerik.
    let mut out = String::from("file://");
    for ch in s.chars() {
        match ch {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '/' | ':' | '-' | '_' | '.' | '~' => out.push(ch),
            ' ' => out.push_str("%20"),
            c => {
                let mut buf = [0u8; 4];
                for b in c.encode_utf8(&mut buf).as_bytes() {
                    out.push_str(&format!("%{b:02X}"));
                }
            }
        }
    }
    out
}

fn request_blocking(srv: &Arc<Server>, method: &str, params: Value) -> ZResult<Value> {
    let id = srv.next_id.fetch_add(1, Ordering::Relaxed);
    let (tx, rx) = std::sync::mpsc::channel();
    srv.pending
        .lock()
        .map_err(|_| ZephyrError::Internal("pending lsp terkunci".into()))?
        .insert(id, tx);

    write_msg(
        srv,
        &json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params }),
    )?;

    match rx.recv_timeout(REQ_TIMEOUT) {
        Ok(Ok(v)) => Ok(v),
        Ok(Err(msg)) => Err(ZephyrError::Internal(format!("lsp {method}: {msg}"))),
        Err(_) => {
            if let Ok(mut p) = srv.pending.lock() {
                p.remove(&id);
            }
            Err(ZephyrError::Internal(format!(
                "lsp {method} tidak menjawab dalam {}s",
                REQ_TIMEOUT.as_secs()
            )))
        }
    }
}

fn stop_server(srv: &Arc<Server>) -> ZResult<()> {
    // shutdown → exit adalah urutan yang benar; kalau server sudah tidak
    // responsif, kill langsung supaya tidak menggantung UI.
    let _ = write_msg(
        srv,
        &json!({ "jsonrpc": "2.0", "id": 999_999, "method": "shutdown", "params": Value::Null }),
    );
    let _ = write_msg(
        srv,
        &json!({ "jsonrpc": "2.0", "method": "exit", "params": Value::Null }),
    );
    std::thread::sleep(std::time::Duration::from_millis(120));
    if let Ok(mut ch) = srv.child.lock() {
        match ch.try_wait() {
            Ok(Some(_)) => {}
            _ => {
                let _ = ch.kill();
                let _ = ch.wait();
            }
        }
    }
    Ok(())
}

// ───────────────────────── command Tauri ─────────────────────────

#[tauri::command(async)]
pub async fn lsp_request(server: String, method: String, params: Value) -> ZResult<Value> {
    let srv = get(&server)?;
    // Jalankan di blocking pool: recv_timeout memblokir thread.
    tokio::task::spawn_blocking(move || request_blocking(&srv, &method, params))
        .await
        .map_err(|e| ZephyrError::Internal(format!("join lsp: {e}")))?
}

#[tauri::command(async)]
pub async fn lsp_notify(server: String, method: String, params: Value) -> ZResult<()> {
    let srv = get(&server)?;
    // didOpen/didClose ikut mencatat dokumen terbuka untuk idle-shutdown.
    if method == "textDocument/didOpen" {
        if let Some(uri) = params.pointer("/textDocument/uri").and_then(|v| v.as_str()) {
            if let Ok(mut d) = srv.open_docs.lock() {
                if !d.iter().any(|x| x == uri) {
                    d.push(uri.to_string());
                }
            }
        }
    } else if method == "textDocument/didClose" {
        if let Some(uri) = params.pointer("/textDocument/uri").and_then(|v| v.as_str()) {
            if let Ok(mut d) = srv.open_docs.lock() {
                d.retain(|x| x != uri);
            }
        }
    }
    write_msg(&srv, &json!({ "jsonrpc": "2.0", "method": method, "params": params }))
}

#[tauri::command(async)]
pub async fn lsp_stop(server: String) -> ZResult<bool> {
    let srv = match get(&server) {
        Ok(s) => s,
        Err(_) => return Ok(false),
    };
    registry()
        .write()
        .map_err(|_| ZephyrError::Internal("registry lsp terkunci".into()))?
        .remove(&server);
    tokio::task::spawn_blocking(move || stop_server(&srv))
        .await
        .map_err(|e| ZephyrError::Internal(format!("join stop lsp: {e}")))??;
    Ok(true)
}

#[tauri::command(async)]
pub async fn lsp_stop_all() -> ZResult<usize> {
    let semua: Vec<Arc<Server>> = {
        let mut reg = registry()
            .write()
            .map_err(|_| ZephyrError::Internal("registry lsp terkunci".into()))?;
        let v = reg.values().cloned().collect();
        reg.clear();
        v
    };
    let n = semua.len();
    tokio::task::spawn_blocking(move || {
        for s in semua {
            let _ = stop_server(&s);
        }
    })
    .await
    .map_err(|e| ZephyrError::Internal(format!("join stop_all lsp: {e}")))?;
    Ok(n)
}

#[derive(Serialize)]
pub struct LspInfo {
    pub id: String,
    pub lang: String,
    pub root: String,
    pub pid: u32,
    pub cmd: String,
    pub uptime: u64,
    pub idle: u64,
    pub open_docs: usize,
    pub alive: bool,
}

#[tauri::command(async)]
pub fn lsp_status() -> ZResult<Vec<LspInfo>> {
    let reg = registry()
        .read()
        .map_err(|_| ZephyrError::Internal("registry lsp terkunci".into()))?;
    let t = now_secs();
    Ok(reg
        .values()
        .map(|s| {
            let alive = s
                .child
                .lock()
                .ok()
                .and_then(|mut c| c.try_wait().ok())
                .map(|st| st.is_none())
                .unwrap_or(false);
            LspInfo {
                id: s.id.clone(),
                lang: s.lang.clone(),
                root: s.root.to_string_lossy().to_string(),
                pid: s.pid,
                cmd: s.cmd_line.clone(),
                uptime: t.saturating_sub(s.started_at),
                idle: t.saturating_sub(s.last_activity.load(Ordering::Relaxed)),
                open_docs: s.open_docs.lock().map(|d| d.len()).unwrap_or(0),
                alive,
            }
        })
        .collect())
}

/// Matikan server yang sudah idle & tidak punya dokumen terbuka (V5).
/// Dipanggil berkala dari frontend supaya kebijakannya satu tempat (UI tahu
/// file mana yang masih dibuka user), bukan timer tersembunyi di Rust.
///
/// Semua pekerjaan yang memegang lock dikurung di fungsi sync `take_idle()`:
/// `RwLockReadGuard`/`MutexGuard` std TIDAK `Send`, jadi kalau guard-nya masih
/// hidup saat `.await` seluruh future berhenti jadi `Send` dan Tauri menolak
/// command-nya ("future cannot be sent between threads safely").
fn take_idle() -> ZResult<(Vec<String>, Vec<Arc<Server>>)> {
    let t = now_secs();
    let mati: Vec<Arc<Server>> = {
        let reg = registry()
            .read()
            .map_err(|_| ZephyrError::Internal("registry lsp terkunci".into()))?;
        reg.values()
            .filter(|s| {
                let idle = t.saturating_sub(s.last_activity.load(Ordering::Relaxed));
                let docs = s.open_docs.lock().map(|d| d.len()).unwrap_or(0);
                docs == 0 && idle >= s.idle_secs.load(Ordering::Relaxed)
            })
            .cloned()
            .collect()
    };
    let ids: Vec<String> = mati.iter().map(|s| s.id.clone()).collect();
    if !ids.is_empty() {
        let mut reg = registry()
            .write()
            .map_err(|_| ZephyrError::Internal("registry lsp terkunci".into()))?;
        for id in &ids {
            reg.remove(id);
        }
    }
    Ok((ids, mati))
}

#[tauri::command(async)]
pub async fn lsp_reap() -> ZResult<Vec<String>> {
    let (ids, mati) = tokio::task::spawn_blocking(take_idle)
        .await
        .map_err(|e| ZephyrError::Internal(format!("join reap lsp: {e}")))??;
    if !mati.is_empty() {
        tokio::task::spawn_blocking(move || {
            for s in mati {
                let _ = stop_server(&s);
            }
        })
        .await
        .map_err(|e| ZephyrError::Internal(format!("join reap lsp: {e}")))?;
    }
    Ok(ids)
}

/// Ubah batas idle satu server (dipakai harness untuk memaksa reap cepat).
#[tauri::command(async)]
pub fn lsp_set_idle(server: String, secs: u64) -> ZResult<()> {
    let srv = get(&server)?;
    srv.idle_secs.store(secs, Ordering::Relaxed);
    Ok(())
}

/// Cek apakah sebuah executable bisa ditemukan (untuk UI Settings).
/// `root` opsional supaya probe juga melihat node_modules\.bin workspace.
#[tauri::command(async)]
pub fn lsp_probe(app: AppHandle, spec: ServerSpec, root: Option<String>) -> ZResult<Value> {
    let r = root.unwrap_or_default();
    match resolve_cmd(&app, &spec, Path::new(&r)) {
        Ok((exe, args)) => Ok(json!({ "ok": true, "exe": exe, "args": args })),
        Err(e) => Ok(json!({ "ok": false, "error": e.to_string() })),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uri_windows_dasar() {
        let u = path_to_uri(Path::new(r"D:\Zephyr\src\App.tsx"));
        assert_eq!(u, "file:///D:/Zephyr/src/App.tsx");
    }

    #[test]
    fn uri_dengan_spasi_dan_unicode() {
        let u = path_to_uri(Path::new(r"D:\a b\中文.ts"));
        assert!(u.starts_with("file:///D:/a%20b/"), "dapat: {u}");
        assert!(u.ends_with(".ts"));
        assert!(!u.contains('中'), "unicode harus di-encode: {u}");
    }
}
