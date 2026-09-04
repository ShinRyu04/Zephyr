// tasks.rs — task runner ala VS Code (fase 23).
//
// KEPUTUSAN ARSITEKTUR
//
// 1. Task DIJALANKAN SEBAGAI PROSES BIASA (std::process + thread pembaca),
//    BUKAN lewat pty.rs. Alasannya bukan kemalasan: pty menempelkan proses ke
//    terminal semu, jadi outputnya bercampur escape sequence ANSI, prompt
//    shell, dan echo perintah. Problem matcher harus mem-parse baris BERSIH —
//    "src/a.ts(12,5): error TS2322: ..." — dan satu escape sequence saja
//    membuat regex gagal. Untuk task yang memang perlu terminal interaktif,
//    presentation.panel = "terminal" tetap disediakan lewat pane pty biasa
//    (dikerjakan frontend), sedangkan jalur di file ini yang dipakai matcher.
//
// 2. Output di-emit sebagai event `task-output` per BARIS, bukan per potongan
//    byte. Matcher bekerja per baris; membiarkan frontend menyusun ulang baris
//    dari potongan berarti logika penggabungan ada di dua tempat.
//
// 3. Problem matcher dijalankan di RUST, bukan frontend. Regex-nya perlu
//    dipakai untuk setiap baris output build besar (ribuan baris); mengirim
//    semuanya ke JS lalu mem-parse di sana membuang seluruh keuntungan
//    streaming, dan `regex` crate sudah ada di dependensi.
//
// KEAMANAN
// - cwd task WAJIB di dalam workspace (atau folder yang sudah lolos dialog),
//   memakai `ensure_writable`-nya app_state — tasks.json milik repo yang
//   di-clone user tidak boleh menjalankan proses di folder mana pun di disk.
// - Workspace Trust (fase 29) akan memblokir auto-run; hook-nya `trust_ok`.

use crate::app_state::AppState;
use crate::errors::{ZResult, ZephyrError};
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

/// Batas baris output yang disimpan per task (sisanya tetap di-emit, hanya
/// tidak ditahan di memori Rust).
const MAX_SIMPAN_BARIS: usize = 5_000;

// ───────────────────────── skema tasks.json ─────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TaskOptions {
    #[serde(default)]
    pub cwd: String,
    #[serde(default)]
    pub env: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TaskPresentation {
    /// always | silent | never
    #[serde(default)]
    pub reveal: String,
    /// output | terminal
    #[serde(default)]
    pub panel: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundSpec {
    #[serde(default)]
    pub active_on_start: bool,
    #[serde(default)]
    pub begins_pattern: String,
    #[serde(default)]
    pub ends_pattern: String,
}

/// Satu task setelah divalidasi.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskDef {
    pub label: String,
    /// shell | process
    pub kind: String,
    pub command: String,
    pub args: Vec<String>,
    pub cwd: String,
    pub env: std::collections::HashMap<String, String>,
    pub group: String,
    pub is_default: bool,
    /// nama matcher ("$tsc") atau pola kustom
    pub problem_matchers: Vec<String>,
    pub depends_on: Vec<String>,
    /// sequence | parallel
    pub depends_order: String,
    pub reveal: String,
    pub panel: String,
    pub is_background: bool,
    pub background: BackgroundSpec,
    /// peringatan skema yang TIDAK fatal (field tak dikenal, dll)
    pub warnings: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TasksFile {
    pub version: String,
    pub tasks: Vec<TaskDef>,
    /// path file yang benar-benar dibaca
    pub path: String,
    /// error skema yang membuat SEBAGIAN task dibuang
    pub errors: Vec<String>,
}

fn sf(v: &Value, k: &str) -> String {
    v.get(k)
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .trim()
        .to_string()
}

fn sarr(v: &Value, k: &str) -> Vec<String> {
    v.get(k)
        .and_then(|x| x.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|x| x.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default()
}

/// `group` dua bentuk.
fn parse_group(v: &Value) -> GroupSpec {
    match v.get("group") {
        Some(Value::String(s)) => GroupSpec {
            kind: s.trim().to_string(),
            is_default: false,
        },
        Some(o @ Value::Object(_)) => GroupSpec {
            kind: sf(o, "kind"),
            is_default: o
                .get("isDefault")
                .and_then(|x| x.as_bool())
                .unwrap_or(false),
        },
        _ => GroupSpec {
            kind: String::new(),
            is_default: false,
        },
    }
}

/// `problemMatcher` boleh string, array string, atau objek pola kustom.
fn parse_matchers(v: &Value) -> Vec<String> {
    match v.get("problemMatcher") {
        Some(Value::String(s)) => vec![s.trim().to_string()],
        Some(Value::Array(a)) => a
            .iter()
            .filter_map(|x| match x {
                Value::String(s) => Some(s.trim().to_string()),
                // Objek pola kustom disimpan apa adanya sebagai JSON string;
                // `matcher_for` mengenalinya lewat awalan '{'.
                Value::Object(_) => serde_json::to_string(x).ok(),
                _ => None,
            })
            .collect(),
        Some(o @ Value::Object(_)) => serde_json::to_string(o).ok().into_iter().collect(),
        _ => vec![],
    }
}

/// Buang komentar `//` dan `/* */` + trailing comma (tasks.json = JSONC).
///
/// Ditulis sendiri karena menambah dependensi JSONC hanya untuk ini tidak
/// sebanding; parser di bawah sadar string literal sehingga `"http://x"` tidak
/// ikut terpotong — itu bug klasik kalau memakai regex naif.
pub fn buang_komentar(src: &str) -> String {
    let b = src.as_bytes();
    let mut out = String::with_capacity(src.len());
    let mut i = 0usize;
    let mut in_str = false;
    let mut escape = false;

    while i < b.len() {
        let c = b[i] as char;
        if in_str {
            out.push(c);
            if escape {
                escape = false;
            } else if c == '\\' {
                escape = true;
            } else if c == '"' {
                in_str = false;
            }
            i += 1;
            continue;
        }
        if c == '"' {
            in_str = true;
            out.push(c);
            i += 1;
            continue;
        }
        if c == '/' && i + 1 < b.len() {
            let n = b[i + 1] as char;
            if n == '/' {
                while i < b.len() && b[i] != b'\n' {
                    i += 1;
                }
                continue;
            }
            if n == '*' {
                i += 2;
                while i + 1 < b.len() && !(b[i] == b'*' && b[i + 1] == b'/') {
                    i += 1;
                }
                i = (i + 2).min(b.len());
                continue;
            }
        }
        out.push(c);
        i += 1;
    }

    // Trailing comma sebelum } atau ].
    let mut bersih = String::with_capacity(out.len());
    let ob = out.as_bytes();
    let mut j = 0usize;
    let mut str2 = false;
    let mut esc2 = false;
    while j < ob.len() {
        let c = ob[j] as char;
        if str2 {
            bersih.push(c);
            if esc2 {
                esc2 = false;
            } else if c == '\\' {
                esc2 = true;
            } else if c == '"' {
                str2 = false;
            }
            j += 1;
            continue;
        }
        if c == '"' {
            str2 = true;
            bersih.push(c);
            j += 1;
            continue;
        }
        if c == ',' {
            let mut k = j + 1;
            while k < ob.len() && (ob[k] as char).is_whitespace() {
                k += 1;
            }
            if k < ob.len() && (ob[k] == b'}' || ob[k] == b']') {
                j += 1;
                continue;
            }
        }
        bersih.push(c);
        j += 1;
    }
    bersih
}

/// `group` boleh string ("build") ATAU objek ({kind, isDefault}) — dua-duanya
/// dipakai di tasks.json nyata, jadi keduanya harus diterima.
///
/// Parsing manual di `parse_group`, bukan `serde` derive: deserialize turunan
/// hanya bisa satu bentuk, sedangkan di sini bentuknya dua macam.
#[derive(Debug, Clone)]
pub struct GroupSpec {
    pub kind: String,
    pub is_default: bool,
}

/// Cari tasks.json: `.zephyr/` lebih dulu, lalu `.vscode/`.
pub fn cari_tasks_file(root: &Path) -> Option<PathBuf> {
    for rel in [".zephyr/tasks.json", ".vscode/tasks.json"] {
        let p = root.join(rel.replace('/', std::path::MAIN_SEPARATOR_STR));
        if p.is_file() {
            return Some(p);
        }
    }
    None
}

/// Field yang dikenal — sisanya dicatat sebagai warning, bukan error.
const FIELD_DIKENAL: &[&str] = &[
    "label",
    "type",
    "command",
    "script",
    "args",
    "options",
    "group",
    "problemMatcher",
    "dependsOn",
    "dependsOrder",
    "presentation",
    "isBackground",
    "background",
    "detail",
    "runOptions",
    "windows",
    "linux",
    "osx",
];

fn parse_satu_task(v: &Value, idx: usize, errors: &mut Vec<String>) -> Option<TaskDef> {
    let label = sf(v, "label");
    if label.is_empty() {
        errors.push(format!("task[{idx}]: field \"label\" wajib ada"));
        return None;
    }
    let kind = {
        let t = sf(v, "type");
        if t.is_empty() {
            "shell".to_string()
        } else if t == "shell" || t == "process" {
            t
        } else if t == "npm" {
            // type "npm" + "script": "watch" → npm run watch.
            // Bentuk ini dominan di tasks.json nyata; tanpa dukungan ini file
            // VS Code yang sah tampak "tidak punya command".
            "npm".to_string()
        } else {
            errors.push(format!(
                "task \"{label}\": type \"{t}\" tidak dikenal — dipakai \"shell\""
            ));
            "shell".to_string()
        }
    };

    // Windows override: `windows.command` menang di platform ini.
    let win = v.get("windows");
    let command = {
        let c = win.map(|w| sf(w, "command")).unwrap_or_default();
        let c = if c.is_empty() { sf(v, "command") } else { c };
        // type "npm" memakai field "script", bukan "command".
        if c.is_empty() && kind == "npm" {
            let script = sf(v, "script");
            if script.is_empty() {
                String::new()
            } else {
                format!("npm run {script}")
            }
        } else {
            c
        }
    };
    let args = {
        let a = win.map(|w| sarr(w, "args")).unwrap_or_default();
        if a.is_empty() {
            sarr(v, "args")
        } else {
            a
        }
    };

    let opts: TaskOptions = v
        .get("options")
        .and_then(|o| serde_json::from_value(o.clone()).ok())
        .unwrap_or_default();
    let pres: TaskPresentation = v
        .get("presentation")
        .and_then(|o| serde_json::from_value(o.clone()).ok())
        .unwrap_or_default();
    let bg: BackgroundSpec = v
        .get("background")
        .and_then(|o| serde_json::from_value(o.clone()).ok())
        .unwrap_or_default();

    let g = parse_group(v);
    let depends_on = match v.get("dependsOn") {
        Some(Value::String(s)) => vec![s.trim().to_string()],
        Some(Value::Array(_)) => sarr(v, "dependsOn"),
        _ => vec![],
    };

    // Task COMPOSITE: `command` boleh kosong kalau ia cuma membungkus
    // `dependsOn`. Bentuk ini dipakai di tasks.json nyata (VS Code docs:
    // label "watch" tanpa command, dependsOn dua task npm) — menolaknya
    // membuat file yang sah gagal dimuat.
    if command.is_empty() && depends_on.is_empty() {
        errors.push(format!(
            "task \"{label}\": butuh \"command\" atau \"dependsOn\""
        ));
        return None;
    }

    let mut warnings = Vec::new();
    if let Some(map) = v.as_object() {
        for k in map.keys() {
            if !FIELD_DIKENAL.contains(&k.as_str()) {
                warnings.push(format!("field \"{k}\" tidak dikenal, diabaikan"));
            }
        }
    }

    Some(TaskDef {
        label,
        kind,
        command,
        args,
        cwd: opts.cwd,
        env: opts.env,
        group: g.kind,
        is_default: g.is_default,
        problem_matchers: parse_matchers(v),
        depends_on,
        depends_order: {
            let d = sf(v, "dependsOrder");
            if d == "parallel" {
                d
            } else {
                "sequence".to_string()
            }
        },
        reveal: {
            let r = pres.reveal;
            if r.is_empty() {
                "always".to_string()
            } else {
                r
            }
        },
        panel: {
            let p = pres.panel;
            if p.is_empty() {
                "output".to_string()
            } else {
                p
            }
        },
        is_background: v
            .get("isBackground")
            .and_then(|x| x.as_bool())
            .unwrap_or(false),
        background: bg,
        warnings,
    })
}

/// Baca + validasi tasks.json milik sebuah workspace.
#[tauri::command]
pub fn tasks_load(state: State<AppState>, root: Option<String>) -> ZResult<TasksFile> {
    let root = match root.filter(|r| !r.trim().is_empty()) {
        Some(r) => PathBuf::from(r),
        None => state
            .workspace_path()
            .ok_or_else(|| ZephyrError::InvalidInput("belum ada workspace".into()))?,
    };

    let file = match cari_tasks_file(&root) {
        Some(f) => f,
        None => {
            return Ok(TasksFile {
                version: String::new(),
                tasks: vec![],
                path: String::new(),
                errors: vec![],
            })
        }
    };

    let raw = std::fs::read_to_string(&file)?;
    let bersih = buang_komentar(&raw);
    let v: Value = serde_json::from_str(&bersih).map_err(|e| {
        ZephyrError::InvalidInput(format!(
            "{} bukan JSON valid: {e}",
            file.file_name().unwrap_or_default().to_string_lossy()
        ))
    })?;

    let mut errors = Vec::new();
    let arr = v
        .get("tasks")
        .and_then(|t| t.as_array())
        .cloned()
        .unwrap_or_default();
    if arr.is_empty() {
        errors.push("tidak ada entri di array \"tasks\"".into());
    }

    let mut tasks = Vec::new();
    for (i, t) in arr.iter().enumerate() {
        if let Some(d) = parse_satu_task(t, i, &mut errors) {
            if tasks.iter().any(|x: &TaskDef| x.label == d.label) {
                errors.push(format!("label \"{}\" dobel — yang kedua dibuang", d.label));
                continue;
            }
            tasks.push(d);
        }
    }

    Ok(TasksFile {
        version: sf(&v, "version"),
        tasks,
        path: file.to_string_lossy().to_string(),
        errors,
    })
}

// ───────────────────────── problem matcher ─────────────────────────

/// Satu pola matcher yang sudah dikompilasi.
///
/// Indeks grup regex disimpan sebagai angka (1-based) sesuai konvensi
/// tasks.json (`"file": 1`), bukan nama grup — supaya pola kustom dari
/// tasks.json user bisa dipakai apa adanya.
#[derive(Debug, Clone)]
pub struct Matcher {
    pub nama: String,
    pub re: Regex,
    pub g_file: usize,
    pub g_line: usize,
    pub g_col: usize,
    pub g_sev: usize,
    pub g_code: usize,
    pub g_msg: usize,
    /// severity tetap kalau regex tidak punya grup severity
    pub sev_default: String,
}

/// Preset bawaan (wajib menurut brief 23): $tsc, $eslint, $gcc, $cargo, $go.
///
/// Pola ditulis longgar di bagian pesan (`(.*)$`) dengan sengaja: pesan
/// compiler sering memuat tanda kurung dan titik dua, dan pola ketat justru
/// membuat baris error nyata tidak terdeteksi.
fn preset(nama: &str) -> Option<Matcher> {
    let m = |nama: &str,
             pola: &str,
             f: usize,
             l: usize,
             c: usize,
             s: usize,
             code: usize,
             msg: usize,
             sd: &str| {
        Regex::new(pola).ok().map(|re| Matcher {
            nama: nama.to_string(),
            re,
            g_file: f,
            g_line: l,
            g_col: c,
            g_sev: s,
            g_code: code,
            g_msg: msg,
            sev_default: sd.to_string(),
        })
    };

    match nama {
        // src/a.ts(12,5): error TS2322: Type 'x' is not assignable...
        "$tsc" | "$tsc-watch" => m(
            "$tsc",
            r"^\s*(\S.*?)\((\d+),(\d+)\):\s+(error|warning|info)\s+([A-Za-z]+\d+):\s+(.*)$",
            1,
            2,
            3,
            4,
            5,
            6,
            "error",
        ),
        // /path/file.ts
        //   12:5  error  Unexpected var  no-var        (bentuk stylish)
        // Dipakai per baris: file diambil dari baris judul oleh pemanggil,
        // jadi preset ini memakai bentuk compact yang berdiri sendiri.
        "$eslint" | "$eslint-stylish" | "$eslint-compact" => m(
            "$eslint",
            r"^\s*(\S.*?):\s*line\s+(\d+),\s*col\s+(\d+),\s*(Error|Warning|Info)\s*-\s*(.*)$",
            1,
            2,
            3,
            4,
            0,
            5,
            "error",
        ),
        // main.c:12:5: error: 'x' undeclared
        "$gcc" | "$gcc-compile" | "$clang" => m(
            "$gcc",
            r"^\s*(\S.*?):(\d+):(\d+):\s+(error|warning|note):\s+(.*)$",
            1,
            2,
            3,
            4,
            0,
            5,
            "error",
        ),
        // error[E0308]: mismatched types
        //  --> src/main.rs:12:5
        // Bentuk satu baris `--> file:line:col` dipakai sebagai anchor; teks
        // error-nya diambil dari baris sebelumnya oleh `MatcherState`.
        "$rustc" | "$cargo" => m(
            "$cargo",
            r"^\s*-->\s+(\S+?):(\d+):(\d+)\s*$",
            1,
            2,
            3,
            0,
            0,
            0,
            "error",
        ),
        // ./main.go:12:5: undefined: x
        "$go" => m(
            "$go",
            r"^\s*(\S.*?\.go):(\d+):(\d+):\s+(.*)$",
            1,
            2,
            3,
            0,
            0,
            4,
            "error",
        ),
        _ => None,
    }
}

/// Matcher dari nama preset ATAU objek pola kustom (JSON string).
fn matcher_for(spec: &str) -> Option<Matcher> {
    let s = spec.trim();
    if s.starts_with('$') {
        return preset(s);
    }
    if !s.starts_with('{') {
        return None;
    }
    // Pola kustom: { "pattern": { "regexp": "...", "file": 1, ... } }
    let v: Value = serde_json::from_str(s).ok()?;
    let pat = v.get("pattern").map(|p| {
        // `pattern` boleh array (multi-baris); ambil yang terakhir karena itu
        // yang memuat lokasi + pesan pada bentuk multiline VS Code.
        match p {
            Value::Array(a) => a.last().cloned().unwrap_or(Value::Null),
            other => other.clone(),
        }
    })?;
    let re = Regex::new(pat.get("regexp")?.as_str()?).ok()?;
    let idx = |k: &str| pat.get(k).and_then(|x| x.as_u64()).unwrap_or(0) as usize;
    Some(Matcher {
        nama: v
            .get("owner")
            .and_then(|x| x.as_str())
            .unwrap_or("custom")
            .to_string(),
        re,
        g_file: idx("file"),
        g_line: idx("line"),
        g_col: idx("column"),
        g_sev: idx("severity"),
        g_code: idx("code"),
        g_msg: idx("message"),
        sev_default: v
            .get("severity")
            .and_then(|x| x.as_str())
            .unwrap_or("error")
            .to_string(),
    })
}

/// Satu masalah hasil parse.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskProblem {
    pub file: String,
    pub line: u32,
    pub column: u32,
    pub severity: String,
    pub message: String,
    pub code: String,
    /// nama matcher yang menangkapnya (untuk diagnosa)
    pub matcher: String,
}

/// State parsing lintas baris (dipakai $cargo yang pesannya di baris atas).
struct MatcherState {
    matchers: Vec<Matcher>,
    /// baris sebelumnya — sumber pesan untuk pola anchor seperti `--> f:l:c`
    baris_lalu: String,
}

impl MatcherState {
    fn baru(spec: &[String]) -> Self {
        Self {
            matchers: spec.iter().filter_map(|s| matcher_for(s)).collect(),
            baris_lalu: String::new(),
        }
    }

    fn ada(&self) -> bool {
        !self.matchers.is_empty()
    }

    fn proses(&mut self, baris: &str, root: &Path) -> Option<TaskProblem> {
        let mut hasil = None;
        for m in &self.matchers {
            if let Some(c) = m.re.captures(baris) {
                let g = |i: usize| {
                    if i == 0 {
                        String::new()
                    } else {
                        c.get(i)
                            .map(|x| x.as_str().trim().to_string())
                            .unwrap_or_default()
                    }
                };
                let file_raw = g(m.g_file);
                if file_raw.is_empty() {
                    continue;
                }
                // Path relatif dijadikan absolut terhadap root task supaya
                // Problems bisa membuka file dengan klik.
                let p = Path::new(&file_raw);
                let file = if p.is_absolute() {
                    file_raw.clone()
                } else {
                    root.join(p).to_string_lossy().to_string()
                };

                let sev_raw = g(m.g_sev).to_lowercase();
                let severity = match sev_raw.as_str() {
                    "error" | "err" | "e" => "error",
                    "warning" | "warn" | "w" => "warning",
                    "info" | "note" | "information" => "info",
                    _ => m.sev_default.as_str(),
                }
                .to_string();

                let mut message = g(m.g_msg);
                if message.is_empty() {
                    // Pola anchor ($cargo): pesan ada di baris sebelumnya.
                    message = self.baris_lalu.trim().to_string();
                }

                hasil = Some(TaskProblem {
                    file,
                    line: g(m.g_line).parse().unwrap_or(1),
                    column: g(m.g_col).parse().unwrap_or(1),
                    severity,
                    code: g(m.g_code),
                    message,
                    matcher: m.nama.clone(),
                });
                break;
            }
        }
        self.baris_lalu = baris.to_string();
        hasil
    }
}

/// Preset yang tersedia — dipakai UI & harness.
#[tauri::command]
pub fn tasks_matchers() -> Vec<String> {
    vec![
        "$tsc".into(),
        "$eslint".into(),
        "$gcc".into(),
        "$cargo".into(),
        "$go".into(),
    ]
}

/// Uji satu baris terhadap sebuah matcher — dipakai harness/diagnosa tanpa
/// harus menjalankan proses.
#[tauri::command]
pub fn tasks_match_line(
    matcher: String,
    line: String,
    root: Option<String>,
) -> ZResult<Option<TaskProblem>> {
    let mut st = MatcherState::baru(&[matcher]);
    if !st.ada() {
        return Err(ZephyrError::InvalidInput(format!(
            "matcher tidak dikenal: {}",
            "lihat tasks_matchers()"
        )));
    }
    let r = root.unwrap_or_default();
    Ok(st.proses(&line, Path::new(&r)))
}

// ───────────────────────── eksekusi task ─────────────────────────

/// Status satu eksekusi.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskRun {
    pub id: String,
    pub label: String,
    /// running | done | failed | killed
    pub status: String,
    pub exit_code: Option<i32>,
    pub pid: Option<u32>,
    pub started_ms: u64,
    pub ended_ms: Option<u64>,
    pub problems: Vec<TaskProblem>,
    /// jumlah baris output (bukan isinya — isinya di outputStore frontend)
    pub lines: usize,
    /// task background yang sudah menyalakan `beginsPattern`
    pub active: bool,
    pub cwd: String,
}

struct RunProc {
    child: Child,
    batal: Arc<AtomicBool>,
}

#[derive(Default)]
pub struct TasksRuntime {
    runs: Mutex<Vec<TaskRun>>,
    procs: Mutex<std::collections::HashMap<String, RunProc>>,
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Regex port yang muncul di output task ("http://localhost:5173",
/// "Listening on port 3000", "127.0.0.1:8080").
///
/// Dipakai untuk fitur "port terdeteksi otomatis" (brief 23.5). Sengaja
/// TIDAK menebak dari nomor telanjang seperti "3000" — output build penuh
/// angka, dan port hantu di panel Ports lebih menyesatkan daripada berguna.
fn deteksi_port(baris: &str) -> Option<(u16, bool)> {
    static POLA: &[&str] = &[
        r"https?://(?:localhost|127\.0\.0\.1|0\.0\.0\.0)\D{0,3}(\d{2,5})",
        r"(?i)listening\D{0,20}?(?:port\s*)(\d{2,5})",
        r"(?i)(?:port|listening on)\D{0,3}(\d{2,5})",
    ];
    for p in POLA {
        if let Ok(re) = Regex::new(p) {
            if let Some(c) = re.captures(baris) {
                if let Some(n) = c.get(1).and_then(|m| m.as_str().parse::<u16>().ok()) {
                    if n >= 80 {
                        let https = baris.contains("https://");
                        return Some((n, https));
                    }
                }
            }
        }
    }
    None
}

/// Jalankan satu task.
///
/// Mengembalikan id run; output mengalir lewat event `task-output`, status
/// lewat `task-status`, masalah lewat `task-problems`, port lewat `task-port`.
#[allow(clippy::too_many_arguments)]
#[tauri::command(async)]
pub fn tasks_run(
    app: AppHandle,
    state: State<AppState>,
    rt: State<TasksRuntime>,
    id: String,
    label: String,
    kind: String,
    command: String,
    args: Vec<String>,
    cwd: Option<String>,
    env: Option<std::collections::HashMap<String, String>>,
    problem_matchers: Option<Vec<String>>,
    is_background: Option<bool>,
    begins_pattern: Option<String>,
    ends_pattern: Option<String>,
) -> ZResult<String> {
    // fase 29: tasks.json datang dari REPO, bukan dari user. Folder yang belum
    // dipercaya tidak boleh menjalankan perintah apa pun — penjaga di sini,
    // bukan di UI: command ini bisa dipanggil dari palette, keybinding, MCP,
    // atau bridge dev, dan tombol yang disembunyikan tidak menahan apa pun.
    crate::workspace::ensure_trusted(&state, "Menjalankan task")?;

    if id.trim().is_empty() {
        return Err(ZephyrError::InvalidInput("id run kosong".into()));
    }
    if command.trim().is_empty() {
        return Err(ZephyrError::InvalidInput("command kosong".into()));
    }
    {
        let procs = rt.procs.lock().unwrap();
        if procs.contains_key(&id) {
            return Err(ZephyrError::InvalidInput(format!("run {id} sudah jalan")));
        }
    }

    // cwd: default workspace. Di luar workspace WAJIB lolos ensure_writable —
    // tasks.json datang dari repo yang bisa jadi bukan milik user.
    let ws = state.workspace_path();
    let workdir = match cwd.filter(|c| !c.trim().is_empty()) {
        Some(raw) => {
            let p = PathBuf::from(&raw);
            let p = if p.is_absolute() {
                p
            } else {
                ws.clone()
                    .ok_or_else(|| ZephyrError::InvalidInput("belum ada workspace".into()))?
                    .join(p)
            };
            // std::fs::canonicalize, sama seperti ext_pkg.rs — hasilnya prefix
            // `\\?\` di Windows, tapi perbandingan starts_with tetap benar
            // karena `ws` dikanonkan dengan cara yang sama di bawah.
            let p = std::fs::canonicalize(&p)
                .map_err(|_| ZephyrError::InvalidInput(format!("cwd tidak ada: {raw}")))?;
            if !p.is_dir() {
                return Err(ZephyrError::InvalidInput(format!(
                    "cwd bukan folder: {raw}"
                )));
            }
            let di_dalam = ws
                .as_ref()
                .and_then(|w| std::fs::canonicalize(w).ok())
                .map(|w| p.starts_with(&w))
                .unwrap_or(false);
            if !di_dalam {
                state.ensure_writable(&p)?;
            }
            p
        }
        None => ws
            .clone()
            .ok_or_else(|| ZephyrError::InvalidInput("belum ada workspace".into()))?,
    };

    // shell vs process vs npm.
    //
    // type "shell" harus melewati shell supaya `&&`, pipe, dan variabel jalan —
    // itu memang yang diminta user saat menulis "npm run build && npm test".
    // type "process" TIDAK melewati shell: argumennya diteruskan mentah,
    // jadi tidak ada interpretasi metakarakter sama sekali.
    // type "npm" sudah diubah jadi "npm run <script>" oleh parser, dan npm di
    // Windows adalah shim .cmd — jadi ia WAJIB lewat shell.
    let shell = std::env::var("ComSpec").unwrap_or_else(|_| "cmd.exe".into());
    let mut cmd = if kind == "process" {
        let mut c = Command::new(&command);
        c.args(&args);
        c
    } else {
        let mut c = Command::new(shell);
        let full = if args.is_empty() {
            command.clone()
        } else {
            format!("{} {}", command, args.join(" "))
        };
        // WAJIB `raw_arg`, BUKAN `.arg()`.
        //
        // `Command::arg` di Windows meng-escape tanda kutip dengan konvensi C
        // runtime (`\"`), sedangkan cmd.exe TIDAK mengenal konvensi itu — ia
        // melihat backslash sebagai karakter biasa. Akibatnya command seperti
        //     node -e "console.log('hai')"
        // sampai ke node dalam keadaan rusak dan gagal dengan
        // "Unterminated string constant". Sudah terbukti lewat verify23.
        //
        // Bentuk `/d /s /c "<seluruh command>"` adalah kombinasi yang
        // didokumentasikan cmd: dengan `/s` + kutip di ujung, cmd membuang
        // HANYA kutip pertama & terakhir lalu menjalankan sisanya apa adanya.
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            c.raw_arg(format!("/d /s /c \"{full}\""));
        }
        #[cfg(not(windows))]
        {
            c.arg("-c").arg(&full);
        }
        c
    };

    cmd.current_dir(&workdir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null());
    if let Some(e) = &env {
        for (k, v) in e {
            cmd.env(k, v);
        }
    }
    // Jangan munculkan jendela konsol (CREATE_NO_WINDOW) — task harus jalan
    // di latar, tidak boleh mengambil layar user.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| ZephyrError::InvalidInput(format!("gagal menjalankan \"{command}\": {e}")))?;
    let pid = child.id();
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let batal = Arc::new(AtomicBool::new(false));

    let run = TaskRun {
        id: id.clone(),
        label: label.clone(),
        status: "running".into(),
        exit_code: None,
        pid: Some(pid),
        started_ms: now_ms(),
        ended_ms: None,
        problems: vec![],
        lines: 0,
        active: !is_background.unwrap_or(false),
        cwd: workdir.to_string_lossy().to_string(),
    };
    rt.runs.lock().unwrap().push(run.clone());
    let _ = app.emit("task-status", json!(run));

    let matchers = problem_matchers.unwrap_or_default();
    let bg = is_background.unwrap_or(false);
    let re_begin = begins_pattern
        .filter(|s| !s.trim().is_empty())
        .and_then(|s| Regex::new(&s).ok());
    let re_end = ends_pattern
        .filter(|s| !s.trim().is_empty())
        .and_then(|s| Regex::new(&s).ok());

    // Satu thread pembaca per stream, digabung lewat channel supaya urutan
    // stdout/stderr apa adanya dan matcher tetap melihat satu aliran baris.
    //
    // ChildStdout dan ChildStderr adalah dua TIPE berbeda, jadi tidak bisa
    // ditaruh di satu array — dibaca lewat fungsi generik `baca_stream`.
    let (tx, rx) = std::sync::mpsc::channel::<(bool, String)>();

    fn baca_stream<R: std::io::Read + Send + 'static>(
        s: R,
        is_err: bool,
        tx: std::sync::mpsc::Sender<(bool, String)>,
    ) {
        std::thread::spawn(move || {
            let mut rd = BufReader::new(s);
            let mut buf = Vec::new();
            loop {
                buf.clear();
                // read_until('\n') bukan lines(): output build bisa memuat byte
                // non-UTF8 (locale Windows), dan lines() akan menggagalkan
                // seluruh sisa stream begitu satu byte tidak valid muncul.
                match rd.read_until(b'\n', &mut buf) {
                    Ok(0) => break,
                    Ok(_) => {
                        let mut t = String::from_utf8_lossy(&buf).to_string();
                        while t.ends_with('\n') || t.ends_with('\r') {
                            t.pop();
                        }
                        if tx.send((is_err, t)).is_err() {
                            break;
                        }
                    }
                    Err(_) => break,
                }
            }
        });
    }

    if let Some(s) = stdout {
        baca_stream(s, false, tx.clone());
    }
    if let Some(s) = stderr {
        baca_stream(s, true, tx.clone());
    }
    drop(tx);

    let app2 = app.clone();
    let id2 = id.clone();
    let root2 = workdir.clone();
    let batal2 = batal.clone();
    std::thread::spawn(move || {
        let mut st = MatcherState::baru(&matchers);
        let mut problems: Vec<TaskProblem> = Vec::new();
        let mut n = 0usize;
        let mut aktif = !bg;
        let mut port_terkirim: Vec<u16> = Vec::new();

        while let Ok((is_err, baris)) = rx.recv() {
            n += 1;
            let _ = app2.emit(
                "task-output",
                json!({ "id": id2, "line": baris, "stderr": is_err, "n": n }),
            );

            // Task background: beginsPattern menyalakan, endsPattern mematikan.
            // Tanpa ini panel tidak bisa membedakan "watch sedang compile" dari
            // "watch idle", dan Problems dari ronde sebelumnya tidak pernah
            // dibersihkan.
            if bg {
                if let Some(re) = &re_begin {
                    if re.is_match(&baris) && !aktif {
                        aktif = true;
                        problems.clear();
                        let _ = app2.emit("task-round", json!({ "id": id2, "phase": "begin" }));
                    }
                }
                if let Some(re) = &re_end {
                    if re.is_match(&baris) && aktif {
                        aktif = false;
                        let _ = app2.emit(
                            "task-round",
                            json!({ "id": id2, "phase": "end", "problems": problems }),
                        );
                    }
                }
            }

            if st.ada() {
                if let Some(p) = st.proses(&baris, &root2) {
                    problems.push(p.clone());
                    let _ = app2.emit("task-problem", json!({ "id": id2, "problem": p }));
                }
            }
            if let Some((port, https)) = deteksi_port(&baris) {
                if !port_terkirim.contains(&port) {
                    port_terkirim.push(port);
                    let _ = app2.emit(
                        "task-port",
                        json!({ "id": id2, "port": port, "https": https }),
                    );
                }
            }
            if n > MAX_SIMPAN_BARIS && n % 1000 == 0 {
                // Hanya penanda; baris tetap diteruskan ke frontend yang punya
                // batas ring buffer sendiri.
            }
        }

        let dibatalkan = batal2.load(Ordering::SeqCst);
        let _ = app2.emit(
            "task-exit",
            json!({
                "id": id2,
                "killed": dibatalkan,
                "lines": n,
                "problems": problems,
            }),
        );
    });

    rt.procs
        .lock()
        .unwrap()
        .insert(id.clone(), RunProc { child, batal });

    Ok(id)
}

/// Tunggu sebuah run selesai lalu kembalikan statusnya (dipakai UI & harness).
#[tauri::command(async)]
pub fn tasks_wait(
    rt: State<TasksRuntime>,
    id: String,
    timeout_ms: Option<u64>,
) -> ZResult<TaskRun> {
    let batas = timeout_ms.unwrap_or(120_000);
    let t0 = std::time::Instant::now();
    loop {
        {
            let mut procs = rt.procs.lock().unwrap();
            if let Some(rp) = procs.get_mut(&id) {
                match rp.child.try_wait() {
                    Ok(Some(status)) => {
                        let killed = rp.batal.load(Ordering::SeqCst);
                        let code = status.code();
                        procs.remove(&id);
                        drop(procs);
                        let mut runs = rt.runs.lock().unwrap();
                        if let Some(r) = runs.iter_mut().find(|r| r.id == id) {
                            r.status = if killed {
                                "killed".into()
                            } else if code == Some(0) {
                                "done".into()
                            } else {
                                "failed".into()
                            };
                            r.exit_code = code;
                            r.ended_ms = Some(now_ms());
                            return Ok(r.clone());
                        }
                        return Err(ZephyrError::InvalidInput(format!("run {id} hilang")));
                    }
                    Ok(None) => {}
                    Err(e) => return Err(ZephyrError::InvalidInput(format!("try_wait: {e}"))),
                }
            } else {
                // Sudah selesai sebelumnya.
                let runs = rt.runs.lock().unwrap();
                if let Some(r) = runs.iter().find(|r| r.id == id) {
                    return Ok(r.clone());
                }
                return Err(ZephyrError::InvalidInput(format!("run {id} tidak ada")));
            }
        }
        if t0.elapsed().as_millis() as u64 > batas {
            return Err(ZephyrError::InvalidInput(format!(
                "timeout menunggu run {id}"
            )));
        }
        std::thread::sleep(std::time::Duration::from_millis(60));
    }
}

/// Hentikan run — beserta seluruh pohon prosesnya.
///
/// `child.kill()` saja TIDAK cukup untuk type "shell": yang terbunuh hanya
/// cmd.exe, sedangkan `npm`/`node` di bawahnya tetap hidup dan port tetap
/// dipegang. Itu bug yang persis sama dengan pty_interrupt di fase 05.
#[tauri::command(async)]
pub fn tasks_kill(rt: State<TasksRuntime>, id: String) -> ZResult<bool> {
    let mut procs = rt.procs.lock().unwrap();
    let Some(rp) = procs.get_mut(&id) else {
        return Ok(false);
    };
    rp.batal.store(true, Ordering::SeqCst);
    let pid = rp.child.id();

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let _ = Command::new("taskkill")
            .args(["/F", "/T", "/PID", &pid.to_string()])
            .creation_flags(0x0800_0000)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    let _ = rp.child.kill();
    Ok(true)
}

/// Daftar run yang tercatat.
#[tauri::command]
pub fn tasks_runs(rt: State<TasksRuntime>) -> Vec<TaskRun> {
    rt.runs.lock().unwrap().clone()
}

/// Bersihkan riwayat run yang sudah selesai.
#[tauri::command]
pub fn tasks_clear_runs(rt: State<TasksRuntime>) -> usize {
    let mut runs = rt.runs.lock().unwrap();
    let procs = rt.procs.lock().unwrap();
    let sebelum = runs.len();
    runs.retain(|r| procs.contains_key(&r.id));
    sebelum - runs.len()
}

/// Deteksi port dari sebuah baris — dipakai harness tanpa menjalankan proses.
#[tauri::command]
pub fn tasks_detect_port(line: String) -> Option<serde_json::Value> {
    deteksi_port(&line).map(|(p, https)| json!({ "port": p, "https": https }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn jsonc_buang_komentar_tapi_jaga_string() {
        let src = r#"{
            // komentar baris
            "a": "http://localhost:5173", /* blok */
            "b": [1, 2,],
        }"#;
        let out = buang_komentar(src);
        let v: Value = serde_json::from_str(&out).expect("harus JSON valid");
        // URL di dalam string TIDAK boleh terpotong oleh aturan '//'.
        assert_eq!(v["a"], "http://localhost:5173");
        assert_eq!(v["b"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn matcher_tsc_menangkap_file_baris_kolom_kode() {
        let mut st = MatcherState::baru(&["$tsc".to_string()]);
        let p = st
            .proses(
                "src/lib/a.ts(12,5): error TS2322: Type 'string' is not assignable.",
                Path::new("D:/proj"),
            )
            .expect("harus cocok");
        assert!(p.file.replace('\\', "/").ends_with("src/lib/a.ts"));
        assert_eq!(p.line, 12);
        assert_eq!(p.column, 5);
        assert_eq!(p.severity, "error");
        assert_eq!(p.code, "TS2322");
        assert!(p.message.contains("not assignable"));
    }

    #[test]
    fn matcher_cargo_ambil_pesan_dari_baris_sebelumnya() {
        let mut st = MatcherState::baru(&["$cargo".to_string()]);
        assert!(st
            .proses("error[E0308]: mismatched types", Path::new("D:/p"))
            .is_none());
        let p = st
            .proses("  --> src/main.rs:12:5", Path::new("D:/p"))
            .expect("anchor harus cocok");
        assert_eq!(p.line, 12);
        assert!(p.message.contains("mismatched types"));
    }

    #[test]
    fn matcher_gcc_dan_go() {
        let mut g = MatcherState::baru(&["$gcc".to_string()]);
        let p = g
            .proses("main.c:9:3: warning: unused variable 'x'", Path::new("."))
            .unwrap();
        assert_eq!(p.severity, "warning");
        let mut go = MatcherState::baru(&["$go".to_string()]);
        let q = go
            .proses("./main.go:4:2: undefined: fmt", Path::new("."))
            .unwrap();
        assert_eq!(q.line, 4);
    }

    #[test]
    fn matcher_kustom_dari_objek_pola() {
        let spec = r#"{"owner":"uji","pattern":{"regexp":"^(\\S+)\\|(\\d+)\\|(.*)$","file":1,"line":2,"message":3},"severity":"warning"}"#;
        let mut st = MatcherState::baru(&[spec.to_string()]);
        let p = st
            .proses("a/b.txt|7|ada yang salah", Path::new("D:/p"))
            .unwrap();
        assert_eq!(p.line, 7);
        assert_eq!(p.severity, "warning");
        assert_eq!(p.matcher, "uji");
    }

    #[test]
    fn deteksi_port_hanya_dari_konteks_jelas() {
        assert_eq!(
            deteksi_port("  ➜  Local: http://localhost:5173/"),
            Some((5173, false))
        );
        assert_eq!(deteksi_port("Listening on port 3000"), Some((3000, false)));
        assert_eq!(
            deteksi_port("serving https://127.0.0.1:8443"),
            Some((8443, true))
        );
        // Angka telanjang bukan port.
        assert_eq!(deteksi_port("compiled 1234 modules"), None);
    }

    #[test]
    fn parse_group_dua_bentuk() {
        let a: Value = serde_json::from_str(r#"{"group":"build"}"#).unwrap();
        assert_eq!(parse_group(&a).kind, "build");
        assert!(!parse_group(&a).is_default);
        let b: Value =
            serde_json::from_str(r#"{"group":{"kind":"test","isDefault":true}}"#).unwrap();
        assert_eq!(parse_group(&b).kind, "test");
        assert!(parse_group(&b).is_default);
    }

    #[test]
    fn task_tanpa_label_atau_command_dibuang_sisanya_tetap() {
        let src = r#"{
          "version": "2.0.0",
          "tasks": [
            { "label": "ok", "type": "shell", "command": "echo hi" },
            { "type": "shell", "command": "echo tanpa label" },
            { "label": "tanpa command" }
          ]
        }"#;
        let v: Value = serde_json::from_str(&buang_komentar(src)).unwrap();
        let mut errors = Vec::new();
        let arr = v["tasks"].as_array().unwrap();
        let ok: Vec<_> = arr
            .iter()
            .enumerate()
            .filter_map(|(i, t)| parse_satu_task(t, i, &mut errors))
            .collect();
        assert_eq!(ok.len(), 1);
        assert_eq!(ok[0].label, "ok");
        assert_eq!(errors.len(), 2);
    }

    /// Bentuk yang dipakai tasks.json NYATA (VS Code docs): task composite
    /// tanpa `command` yang hanya membungkus `dependsOn`, dan task `type: npm`
    /// yang memakai `script` bukan `command`. Dua-duanya pernah membuat
    /// parser ini menolak file yang sah.
    #[test]
    fn task_composite_dan_npm_script_diterima() {
        let src = r#"{
          "version": "2.0.0",
          "tasks": [
            {
              "label": "watch",
              "dependsOn": ["npm: watch:tsc", "npm: watch:esbuild"],
              "presentation": { "reveal": "never" },
              "group": { "kind": "build", "isDefault": true }
            },
            {
              "type": "npm",
              "script": "watch:tsc",
              "label": "npm: watch:tsc",
              "problemMatcher": "$tsc-watch",
              "isBackground": true
            }
          ]
        }"#;
        let v: Value = serde_json::from_str(&buang_komentar(src)).unwrap();
        let mut errors = Vec::new();
        let ok: Vec<_> = v["tasks"]
            .as_array()
            .unwrap()
            .iter()
            .enumerate()
            .filter_map(|(i, t)| parse_satu_task(t, i, &mut errors))
            .collect();
        assert_eq!(ok.len(), 2, "dua-duanya sah: {errors:?}");

        // Composite: command kosong itu WAJAR, yang penting dependsOn terisi.
        assert_eq!(ok[0].label, "watch");
        assert!(ok[0].command.is_empty());
        assert_eq!(ok[0].depends_on.len(), 2);
        assert_eq!(ok[0].group, "build");
        assert!(ok[0].is_default);
        assert_eq!(ok[0].reveal, "never");

        // npm: script -> "npm run <script>".
        assert_eq!(ok[1].kind, "npm");
        assert_eq!(ok[1].command, "npm run watch:tsc");
        assert!(ok[1].is_background);
        assert_eq!(ok[1].problem_matchers, vec!["$tsc-watch".to_string()]);
        assert!(errors.is_empty(), "tidak boleh ada error: {errors:?}");
    }

    /// `$tsc-watch` harus memetakan ke pola $tsc yang sama — kalau tidak,
    /// task watch (bentuk paling umum) tidak menghasilkan Problems sama sekali.
    #[test]
    fn alias_matcher_watch_dikenal() {
        for nama in ["$tsc-watch", "$eslint-stylish", "$gcc-compile", "$rustc"] {
            assert!(preset(nama).is_some(), "alias {nama} harus punya pola",);
        }
    }
}
