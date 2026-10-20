use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicI64, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock, RwLock};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::app_state::AppState;
use crate::errors::{ZResult, ZephyrError};

const REQ_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(20);

const IDLE_SECS_DEFAULT: u64 = 300;

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

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

    caps: RwLock<Value>,
    last_activity: AtomicU64,
    started_at: u64,

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
        .ok_or_else(|| ZephyrError::NotFound(format!("language server {id} is not alive")))
}

fn write_msg(srv: &Server, msg: &Value) -> ZResult<()> {
    let body = serde_json::to_vec(msg)
        .map_err(|e| ZephyrError::Internal(format!("serialisasi lsp failed: {e}")))?;
    let mut out = srv
        .stdin
        .lock()
        .map_err(|_| ZephyrError::Internal("stdin lsp terkunci".into()))?;

    out.write_all(format!("Content-Length: {}\r\n\r\n", body.len()).as_bytes())
        .map_err(|e| ZephyrError::Io(format!("tulis header lsp: {e}")))?;
    out.write_all(&body)
        .map_err(|e| ZephyrError::Io(format!("tulis body lsp: {e}")))?;
    out.flush()
        .map_err(|e| ZephyrError::Io(format!("flush lsp: {e}")))?;
    srv.last_activity.store(now_secs(), Ordering::Relaxed);
    Ok(())
}

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerSpec {
    pub id: String,

    pub cmd: Vec<String>,

    pub lang: String,
}

fn script_node(node_modules: &Path, bin_name: &str) -> Option<PathBuf> {
    let pkg_dir = node_modules.join(bin_name);
    let pkg_json = pkg_dir.join("package.json");
    let teks = std::fs::read_to_string(&pkg_json).ok()?;
    let v: Value = serde_json::from_str(&teks).ok()?;

    let rel = match v.get("bin") {
        Some(Value::String(s)) => s.clone(),

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

/*
 * Look for a server binary inside ONE directory, accepting the name variants an
 * installer may leave behind: the bare name, and on Windows the `.exe`/`.cmd`/
 * `.bat` shims npm and friends write (a `which`-style lookup would miss the
 * `.cmd` shim entirely, which is why an npm-installed server can be on disk and
 * still report "not found").
 */
fn cari_di_dir(dir: &Path, exe: &str) -> Option<PathBuf> {
    /*
     * Windows FIRST asks for the spawnable variants, and only then for the bare
     * name. npm writes three files per bin in `node_modules/.bin`: a POSIX shell
     * script with no extension, a `.cmd`, and a `.ps1`. The bare one is not a PE
     * image, so a "green" row that returned it would fail the moment the server
     * was started - the row has to name the file that can actually run.
     */
    if cfg!(windows) {
        for ext in ["exe", "cmd", "bat"] {
            let k = dir.join(format!("{exe}.{ext}"));
            if k.is_file() {
                return Some(k);
            }
        }
        let langsung = dir.join(exe);
        if langsung.is_file() {
            return Some(langsung);
        }
        return None;
    }
    let langsung = dir.join(exe);
    if langsung.is_file() {
        return Some(langsung);
    }
    None
}

/*
 * Directories a CORRECT install commonly writes into without ever touching the
 * app process's PATH - the reason "I installed it and the row is still red" is
 * the single most common complaint about this page.
 *
 * `winget` does not edit PATH at all (LLVM lands in C:\Program Files\LLVM\bin),
 * `go install` writes %USERPROFILE%\go\bin, `gem install` writes a versioned
 * bin dir under %USERPROFILE%\.gem\ruby\<ver>\bin, and npm's global prefix is
 * %APPDATA%\npm unless the user moved it. Reading these env vars is free and
 * needs no shell-out, so no process is spawned while probing.
 */
fn dir_cari_tambahan() -> Vec<PathBuf> {
    let mut d: Vec<PathBuf> = Vec::new();
    let mut tambah = |p: PathBuf| {
        if !d.contains(&p) {
            d.push(p);
        }
    };

    if let Ok(a) = std::env::var("APPDATA") {
        if !a.trim().is_empty() {
            tambah(PathBuf::from(&a).join("npm"));
        }
    }
    if let Ok(h) = std::env::var("USERPROFILE") {
        if !h.trim().is_empty() {
            tambah(PathBuf::from(&h).join("go").join("bin"));
            tambah(PathBuf::from(&h).join(".cargo").join("bin"));
            tambah(PathBuf::from(&h).join(".local").join("bin"));
            /*
             * Binaries installed by rustup --no-modify-path, and by `npm i -g`
             * under a custom prefix, never reach the machine PATH. The reader
             * installed the server, PATH says nothing, and the row said "not
             * found" - which is the report this lookup exists to answer.
             */
            tambah(PathBuf::from(&h).join(".rustup").join("toolchains"));
            tambah(PathBuf::from(&h).join(".npm-global").join("bin"));
            tambah(PathBuf::from(&h).join(".bun").join("bin"));
            tambah(PathBuf::from(&h).join(".deno").join("bin"));
            let gem = PathBuf::from(&h).join(".gem").join("ruby");
            if let Ok(rd) = std::fs::read_dir(&gem) {
                for e in rd.flatten() {
                    let b = e.path().join("bin");
                    if b.is_dir() {
                        tambah(b);
                    }
                }
            }
        }
    }
    for var in ["ProgramFiles", "ProgramFiles(x86)"] {
        if let Ok(pf) = std::env::var(var) {
            if !pf.trim().is_empty() {
                tambah(PathBuf::from(&pf).join("LLVM").join("bin"));
            }
        }
    }
    /*
     * Package managers that install OUTSIDE PATH on Windows.
     *
     * `winget install` (Dart, LuaLS) and the Go toolchain win installer land in
     * their own folders and add nothing to PATH for a process that was started
     * before the install. That is exactly the "I installed it, Zephyr still
     * says not found" case: the binary is on disk, in a place a PATH lookup
     * cannot see.
     */
    if let Ok(la) = std::env::var("LOCALAPPDATA") {
        if !la.trim().is_empty() {
            let la = PathBuf::from(&la);
            tambah(la.join("Programs").join("Microsoft").join("WinGet").join("Links"));
            tambah(la.join("Pub").join("Cache").join("bin"));
        }
    }
    if let Ok(up) = std::env::var("USERPROFILE") {
        if !up.trim().is_empty() {
            tambah(PathBuf::from(&up).join("go").join("bin"));
            tambah(PathBuf::from(&up).join("scoop").join("shims"));
        }
    }
    if let Ok(pd) = std::env::var("ProgramData") {
        if !pd.trim().is_empty() {
            tambah(PathBuf::from(&pd).join("chocolatey").join("bin"));
        }
    }
    d
}

/*
 * ---------------------------------------------------------------- pasang LSP
 *
 * Which servers this app can install ITSELF, and with what. Only npm packages
 * are listed: `npm install` resolves the dependency tree, while fetching a
 * tarball by hand would drop the server's own dependencies and leave a binary
 * that dies on its first `require`. Rows whose toolchain this app cannot assume
 * (rustup, go, LLVM, JDK, .NET, Ruby, Xcode, R) keep their written hint rather
 * than pretending to be installable.
 *
 * The package names are the same ones the hint in `src/lib/lsp.ts` shows, so the
 * button and the documentation cannot drift apart.
 */
fn resep_npm(id: &str) -> Option<Vec<&'static str>> {
    Some(match id {
        "typescript" => vec!["typescript-language-server", "typescript"],
        "python" => vec!["pyright"],
        "bash" => vec!["bash-language-server"],
        "json" | "html" | "css" => vec!["vscode-langservers-extracted"],
        "yaml" => vec!["yaml-language-server"],
        "php" => vec!["intelephense"],
        "docker" => vec!["dockerfile-language-server-nodejs"],
        "vue" => vec!["@vue/language-server"],
        _ => return None,
    })
}

/// Ids that have an install recipe - what the Settings row may offer a button for.
pub fn id_punya_resep() -> Vec<&'static str> {
    [
        "typescript", "python", "bash", "json", "html", "css", "yaml", "php", "docker", "vue",
    ]
    .iter()
    .copied()
    .filter(|id| resep_npm(id).is_some())
    .collect()
}

/*
 * Binaries are searched at most a few levels deep inside a slot: archives unpack
 * with a versioned prefix (`lua-language-server-3.9.1-win32-x64/bin/...`) and
 * npm shims sit two levels down (`node_modules/.bin/<exe>.cmd`). Bounded depth
 * keeps a probe over a 200 MB node_modules cheap.
 */
fn cari_berulang(dir: &Path, exe: &str, sisa: u8) -> Option<PathBuf> {
    if sisa == 0 {
        return None;
    }
    let mut anak: Vec<PathBuf> = Vec::new();
    for e in std::fs::read_dir(dir).ok()?.flatten() {
        let p = e.path();
        if p.is_dir() {
            anak.push(p);
        }
    }
    for d in &anak {
        if let Some(f) = cari_di_dir(d, exe) {
            return Some(f);
        }
    }
    for d in &anak {
        if let Some(f) = cari_berulang(d, exe, sisa - 1) {
            return Some(f);
        }
    }
    None
}

/*
 * The private slot, in the order a correct install actually lays it out:
 * (1) the binary straight in the slot (a hand-copied `rust-analyzer.exe`),
 * (2) the npm shim `node_modules/.bin/<exe>.cmd`,
 * (3) whatever a release archive nested deeper.
 */
fn cari_di_slot(slot: &Path, exe: &str) -> Option<PathBuf> {
    if let Some(p) = cari_di_dir(slot, exe) {
        return Some(p);
    }
    let nm = slot.join("node_modules");
    if let Some(p) = cari_di_dir(&nm.join(".bin"), exe) {
        return Some(p);
    }
    cari_berulang(slot, exe, 4)
}

/// The npm that can actually be spawned: `npm` on PATH is a `.cmd` shim on
/// Windows, so the bare name is not enough to launch it.
fn npm_program() -> Option<PathBuf> {
    for nama in ["npm.cmd", "npm.exe", "npm"] {
        if let Ok(p) = which::which(nama) {
            if p.is_file() {
                return Some(p);
            }
        }
    }
    let mut kandidat: Vec<PathBuf> = Vec::new();
    for var in ["ProgramFiles", "ProgramFiles(x86)"] {
        if let Ok(pf) = std::env::var(var) {
            if !pf.trim().is_empty() {
                kandidat.push(PathBuf::from(pf).join("nodejs"));
            }
        }
    }
    kandidat.extend(dir_cari_tambahan());
    for d in kandidat {
        if let Some(p) = cari_di_dir(&d, "npm") {
            return Some(p);
        }
    }
    None
}

fn pipa_ke_teks<R: Read + Send + 'static>(mut r: R) -> std::thread::JoinHandle<String> {
    std::thread::spawn(move || {
        let mut s = String::new();
        let _ = r.read_to_string(&mut s);
        s
    })
}

fn resolve_cmd(app: &AppHandle, spec: &ServerSpec, root: &Path) -> ZResult<(String, Vec<String>)> {
    if spec.cmd.is_empty() {
        return Err(ZephyrError::InvalidInput(
            "cmd language server empty".into(),
        ));
    }
    let exe = spec.cmd[0].clone();
    let args: Vec<String> = spec.cmd[1..].to_vec();

    let p = Path::new(&exe);
    if p.is_absolute() && p.exists() {
        return Ok((exe, args));
    }

    let state = app.state::<AppState>();
    let slot = state.data_dir.join("lsp").join(&spec.id);
    if let Some(found) = cari_di_slot(&slot, &exe) {
        return Ok((found.to_string_lossy().to_string(), args));
    }

    if !root.as_os_str().is_empty() {
        let nm = root.join("node_modules");
        if let Some(script) = script_node(&nm, &exe) {
            if let Ok(node) = which::which("node") {
                let mut a = vec![script.to_string_lossy().to_string()];
                a.extend(args.clone());
                return Ok((node.to_string_lossy().to_string(), a));
            }
        }

        if let Some(found) = cari_di_dir(&nm.join(".bin"), &exe) {
            return Ok((found.to_string_lossy().to_string(), args));
        }
    }

    if let Ok(found) = which::which(&exe) {
        return Ok((found.to_string_lossy().to_string(), args));
    }

    /* PATH missed it, so look where the common installers put things anyway. */
    let mut dicoba: Vec<String> = vec!["PATH".to_string()];
    for dir in dir_cari_tambahan() {
        if let Some(found) = cari_di_dir(&dir, &exe) {
            return Ok((found.to_string_lossy().to_string(), args));
        }
        if dir.is_dir() {
            dicoba.push(dir.to_string_lossy().to_string());
        }
    }

    /*
     * The failure has to say WHERE we looked. A bare "not found" cannot be told
     * apart from a wrong binary name, a PATH the app process cannot see, or a
     * failing download - and that ambiguity is exactly what makes this page feel
     * random. The private slot is listed first because it is the one location the
     * user can fix without touching PATH at all.
     */
    Err(ZephyrError::NotFound(format!(
        "{exe} not found. Checked: {}; {}. Install the '{}' language server (see the hint in Settings), or put the binary at {}",
        slot.display(),
        dicoba.join("; "),
        spec.id,
        slot.display()
    )))
}

fn emit(app: &AppHandle, payload: Value) {
    let _ = app.emit("lsp-event", payload);
}

fn reply_server_request(srv: &Server, id: &Value, method: &str) {
    let result = match method {
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
    state: State<'_, AppState>,
    spec: ServerSpec,
    root: String,
    init_options: Option<Value>,
    idle_secs: Option<u64>,
) -> ZResult<Value> {
    if !root.is_empty() {
        crate::workspace::ensure_trusted_path(&state, Path::new(&root), "Language server")?;
    } else {
        crate::workspace::ensure_trusted(&state, "Language server")?;
    }

    let key = format!("{}::{}", spec.id, root.to_lowercase());

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

    let mut c = crate::proc::cmd(&exe);
    c.args(&args)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    if !root.is_empty() && Path::new(&root).is_dir() {
        c.current_dir(&root);
    }
    let mut child = c
        .spawn()
        .map_err(|e| ZephyrError::Io(format!("failed to start {exe}: {e}")))?;
    let pid = child.id();
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| ZephyrError::Internal("stdin language server is missing".into()))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| ZephyrError::Internal("stdout language server is missing".into()))?;
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
                        if let Some(id) = msg.get("id") {
                            reply_server_request(&srv2, id, &method);
                        }
                        continue;
                    }

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

            emit(
                &app2,
                json!({ "server": srv2.id, "lang": srv2.lang, "kind": "exit" }),
            );
            if let Ok(mut reg) = registry().write() {
                reg.remove(&srv2.id);
            }
        });
    }

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
            /*
             * Call hierarchy. Advertised so a server that supports it prepares
             * a hierarchy at a position; without the capability most servers
             * answer `prepareCallHierarchy` with an empty list, which reads as
             * "this function has no callers" rather than "I was never asked
             * properly".
             */
            "callHierarchy": { "dynamicRegistration": false },
            /*
             * Inlay hints, with `resolveSupport` so a server may send the label
             * without the tooltip and have it requested later. Most servers
             * send the whole thing at once; advertising resolve means the ones
             * that do not are still usable.
             */
            "inlayHint": {
              "dynamicRegistration": false,
              "resolveSupport": { "properties": ["tooltip", "textEdits", "label"] }
            },
            "formatting": { "dynamicRegistration": false },
            "rangeFormatting": { "dynamicRegistration": false },
            "publishDiagnostics": { "relatedInformation": true, "versionSupport": false }
        }
    })
}

pub fn path_to_uri(p: &Path) -> String {
    let s = crate::paths::strip_unc(p)
        .to_string_lossy()
        .replace('\\', "/");
    let s = if s.starts_with('/') {
        s
    } else {
        format!("/{s}")
    };

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
                "lsp {method} did not respond within {}s",
                REQ_TIMEOUT.as_secs()
            )))
        }
    }
}

fn stop_server(srv: &Arc<Server>) -> ZResult<()> {
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

#[tauri::command(async)]
pub async fn lsp_request(server: String, method: String, params: Value) -> ZResult<Value> {
    let srv = get(&server)?;

    tokio::task::spawn_blocking(move || request_blocking(&srv, &method, params))
        .await
        .map_err(|e| ZephyrError::Internal(format!("join lsp: {e}")))?
}

#[tauri::command(async)]
pub async fn lsp_notify(server: String, method: String, params: Value) -> ZResult<()> {
    let srv = get(&server)?;

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
    write_msg(
        &srv,
        &json!({ "jsonrpc": "2.0", "method": method, "params": params }),
    )
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

#[tauri::command(async)]
pub fn lsp_set_idle(server: String, secs: u64) -> ZResult<()> {
    let srv = get(&server)?;
    srv.idle_secs.store(secs, Ordering::Relaxed);
    Ok(())
}

#[tauri::command(async)]
pub fn lsp_resep() -> Vec<String> {
    id_punya_resep().into_iter().map(|s| s.to_string()).collect()
}

/*
 * Install one language server into the app's own slot (`data_dir/lsp/<id>/`) so
 * the row turns green without the user touching PATH. Runs `npm install --prefix`
 * because that is what resolves the package's dependency tree; a hand-rolled
 * tarball fetch would leave a server that cannot start.
 *
 * Every outcome is reported, including the ones that fail: the npm exit code and
 * its last bytes of output go back to the caller, and the answer says whether the
 * binary was actually found afterwards. A silent failure here would be worse than
 * the static hint it replaces.
 */
#[tauri::command(async)]
pub fn lsp_pasang(app: AppHandle, state: State<'_, AppState>, spec: ServerSpec) -> ZResult<Value> {
    let slot = state.data_dir.join("lsp").join(&spec.id);
    let paket = resep_npm(&spec.id).ok_or_else(|| {
        ZephyrError::InvalidInput(format!(
            "no automatic install for '{}'. Pick the server named '{}' with your own tools, or drop the binary into {}",
            spec.id,
            spec.cmd.first().cloned().unwrap_or_default(),
            slot.display()
        ))
    })?;
    std::fs::create_dir_all(&slot)
        .map_err(|e| ZephyrError::Io(format!("buat slot {}: {e}", slot.display())))?;

    let npm = npm_program().ok_or_else(|| {
        ZephyrError::NotFound(
            "npm is not installed (or not reachable), so this server cannot be fetched automatically"
                .into(),
        )
    })?;

    let mut perintah = if cfg!(windows) {
        let mut c = std::process::Command::new("cmd.exe");
        c.arg("/C").arg(&npm);
        c
    } else {
        std::process::Command::new(&npm)
    };
    perintah
        .arg("install")
        .arg("--prefix")
        .arg(&slot)
        .arg("--no-audit")
        .arg("--no-fund")
        .arg("--no-package-lock")
        .arg("--loglevel=error");
    for p in &paket {
        perintah.arg(p);
    }
    perintah
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    let mut anak = perintah
        .spawn()
        .map_err(|e| ZephyrError::Io(format!("jalan npm: {e}")))?;
    let out = anak.stdout.take().map(pipa_ke_teks);
    let err = anak.stderr.take().map(pipa_ke_teks);

    /* Bounded wait: npm talks to a registry, so it can hang. Without a ceiling the
     * command would never return and the UI would show a spinner forever. */
    let batas = std::time::Instant::now() + std::time::Duration::from_secs(300);
    let kode = loop {
        match anak.try_wait() {
            Ok(Some(st)) => break st.code(),
            Ok(None) => {
                if std::time::Instant::now() > batas {
                    let _ = anak.kill();
                    break None;
                }
                std::thread::sleep(std::time::Duration::from_millis(200));
            }
            Err(e) => return Err(ZephyrError::Io(format!("tunggu npm: {e}"))),
        }
    };

    let mut log = String::new();
    if let Some(h) = out {
        log.push_str(&h.join().unwrap_or_default());
    }
    if let Some(h) = err {
        let e = h.join().unwrap_or_default();
        if !e.trim().is_empty() {
            log.push('\n');
            log.push_str(&e);
        }
    }
    if log.len() > 8000 {
        log = log[log.len() - 8000..].to_string();
    }

    let found = cari_di_slot(&slot, &spec.cmd[0]);
    let dijalankan = resolve_cmd(&app, &spec, Path::new(""))
        .map(|(e, a)| json!({ "exe": e, "args": a }))
        .unwrap_or(Value::Null);

    Ok(json!({
        "ok": found.is_some() && kode == Some(0),
        "slot": slot.display().to_string(),
        "paket": paket,
        "keluar": kode,
        "exe": found.map(|p| p.display().to_string()),
        "dijalankan": dijalankan,
        "log": log,
    }))
}

#[tauri::command(async)]
pub fn lsp_probe(app: AppHandle, spec: ServerSpec, root: Option<String>) -> ZResult<Value> {
    let r = root.unwrap_or_default();
    match resolve_cmd(&app, &spec, Path::new(&r)) {
        Ok((exe, args)) => Ok(json!({ "ok": true, "exe": exe, "args": args })),
        Err(e) => Ok(json!({ "ok": false, "error": e.to_string() })),
    }
}

/// Why a server that looks installed still does not work.
///
/// WHY this is a separate question from `lsp_probe`: the probe answers "is the
/// binary on PATH", which is the one thing that does NOT need the folder to be
/// trusted. `lsp_start` additionally requires trust, and that refusal was only
/// written to the LSP output log - never to the Settings page. So a row could
/// show a green "installed" tick while the editor got nothing, and the reason
/// was invisible unless the reader knew to open a log from the command palette.
///
/// Returns the same string the start command would fail with, so there is one
/// source of truth for the wording.
#[tauri::command(async)]
pub fn lsp_penghalang(app: AppHandle, root: Option<String>) -> ZResult<Value> {
    let r = root.unwrap_or_default().trim().to_string();
    if r.is_empty() {
        return Ok(json!({ "ok": false, "alasan": "Language servers need an open workspace folder." }));
    }
    let state = app.state::<crate::app_state::AppState>();
    match crate::workspace::ensure_trusted_path(&state, Path::new(&r), "Language server") {
        Ok(()) => Ok(json!({ "ok": true, "alasan": null })),
        Err(e) => Ok(json!({ "ok": false, "alasan": e.to_string() })),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /*
     * The lookup that makes "installed but still red" go away. Deterministic and
     * filesystem-only, so it runs on any machine: a temp dir with a `.cmd` shim
     * (what npm writes on Windows) must be found when the bare name is asked for,
     * a missing name must stay missing, and the same size in `dir_cari_tambahan`
     * must be reported without duplicates.
     */
    #[test]
    fn cari_di_dir_menemukan_varian_shim() {
        let dir = std::env::temp_dir().join(format!("zephyr-lsp-uji-{}", now_secs()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("server.cmd"), "x").unwrap();
        std::fs::write(dir.join("polos"), "x").unwrap();

        assert_eq!(cari_di_dir(&dir, "server.cmd"), Some(dir.join("server.cmd")));
        if cfg!(windows) {
            assert_eq!(cari_di_dir(&dir, "server"), Some(dir.join("server.cmd")));
        } else {
            assert_eq!(cari_di_dir(&dir, "server"), Some(dir.join("polos")));
        }
        assert_eq!(cari_di_dir(&dir, "polos"), Some(dir.join("polos")));
        assert!(cari_di_dir(&dir, "tidak-ada").is_none());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn dir_tambahan_tanpa_duplikat() {
        let d = dir_cari_tambahan();
        let mut unik = std::collections::HashSet::new();
        for p in &d {
            assert!(unik.insert(p.clone()), "duplikat: {}", p.display());
        }
        /* On Windows the npm gobin for this machine is under APPDATA, so the list
         * cannot be empty there; on other platforms the vars may be absent and an
         * empty list is the honest answer. */
        if cfg!(windows) {
            assert!(!d.is_empty());
        }
    }

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
        assert!(!u.contains('中'), "unicode must be encoded: {u}");
    }

    /*
     * The slot lookup is what makes an in-app install visible to the probe. Both
     * layouts npm and release archives really produce are covered, plus the
     * negative case: a slot with an unrelated file must not report success.
     */
    #[test]
    fn cari_di_slot_shim_npm_dan_arsip_bertingkat() {
        let akar = std::env::temp_dir().join(format!("zephyr-lsp-slot-{}", now_secs()));
        let slot = akar.join("docker");

        let bin = slot.join("node_modules").join(".bin");
        std::fs::create_dir_all(&bin).unwrap();
        std::fs::write(bin.join("docker-langserver.cmd"), "x").unwrap();
        if cfg!(windows) {
            assert_eq!(
                cari_di_slot(&slot, "docker-langserver"),
                Some(bin.join("docker-langserver.cmd"))
            );
        }

        let dalam = slot.join("lua-language-server-3.9.1-win32-x64").join("bin");
        std::fs::create_dir_all(&dalam).unwrap();
        std::fs::write(dalam.join("lua-language-server.exe"), "x").unwrap();
        assert_eq!(
            cari_di_slot(&slot, "lua-language-server.exe"),
            Some(dalam.join("lua-language-server.exe"))
        );

        assert!(cari_di_slot(&slot, "tidak-ada-sama-sekali").is_none());
        let _ = std::fs::remove_dir_all(&akar);
    }

    /*
     * `node_modules/.bin` on Windows holds `x` (a sh script), `x.cmd` and `x.ps1`.
     * The bare file must NOT win: spawning it dies with "not a valid Win32
     * application", so the probe would report a green row that cannot start.
     */
    #[test]
    fn cari_di_dir_utamakan_shim_yang_bisa_dijalankan() {
        let dir = std::env::temp_dir().join(format!("zephyr-lsp-shim-{}", now_secs()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("server"), "#!/bin/sh\nexec node cli.js\n").unwrap();
        std::fs::write(dir.join("server.cmd"), "@echo off\r\necho HALO\r\n").unwrap();

        if cfg!(windows) {
            assert_eq!(cari_di_dir(&dir, "server"), Some(dir.join("server.cmd")));
        } else {
            assert_eq!(cari_di_dir(&dir, "server"), Some(dir.join("server")));
        }
        let _ = std::fs::remove_dir_all(&dir);
    }

    /*
     * The green row is only worth anything if the resolved path really starts.
     * This asks the same helper the LSP launcher uses (`proc::cmd`) to run a .cmd
     * shim and read its output back, so "shim resolves" and "shim runs" cannot
     * drift apart.
     */
    #[test]
    fn shim_cmd_bisa_dijalankan() {
        if !cfg!(windows) {
            return;
        }
        let dir = std::env::temp_dir().join(format!("zephyr-lsp-jalan-{}", now_secs()));
        std::fs::create_dir_all(&dir).unwrap();
        let shim = dir.join("uji-shim.cmd");
        std::fs::write(&shim, "@echo off\r\necho HALO-SHIM\r\n").unwrap();

        let out = crate::proc::cmd(&shim).args(["--stdio"]).output();
        let out = match out {
            Ok(o) => o,
            Err(e) => panic!("shim .cmd tidak bisa dijalankan: {e}"),
        };
        assert!(
            String::from_utf8_lossy(&out.stdout).contains("HALO-SHIM"),
            "stdout shim: {:?}",
            String::from_utf8_lossy(&out.stdout)
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    /*
     * The recipe table has to stay anchored to the rows the Settings page shows:
     * every id with a recipe must exist in `src/lib/lsp.ts`, or the button would
     * offer to install a server no row can select. The reverse is not required -
     * servers needing rustup/go/LLVM/JDK deliberately have no recipe.
     */
    #[test]
    fn resep_npm_selaras_dengan_baris_settings() {
        let ts = std::fs::read_to_string(
            Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("..")
                .join("src")
                .join("lib")
                .join("lsp.ts"),
        )
        .expect("src/lib/lsp.ts harus bisa dibaca");
        for id in id_punya_resep() {
            assert!(
                ts.contains(&format!("id: '{id}'")),
                "resep untuk '{id}' tidak punya baris di src/lib/lsp.ts"
            );
        }
        assert!(resep_npm("docker").is_some());
        assert!(resep_npm("swift").is_none(), "swift butuh toolchain, bukan npm");
        assert!(resep_npm("r").is_none());
    }
}
