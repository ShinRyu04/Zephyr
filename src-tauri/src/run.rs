use crate::app_state::AppState;
use crate::errors::{ZResult, ZephyrError};
use serde::Serialize;
use serde_json::json;
use std::io::{BufRead, BufReader, Write as _};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

/*
 * Run (without debugging), which the editor did not have.
 *
 * WHY this is separate from `tasks`: a task is a command the reader WROTE in
 * `tasks.json`. Run is a command the editor DERIVES from the open file. Both end
 * up spawning a process and streaming lines, but only Run has to answer
 * questions a written task never asks - what compiles this file, where does the
 * binary land, what do we delete when the reader cancels halfway through a link
 * step. Folding those into `tasks` would have meant a `tasks.json` entry for
 * every file extension.
 *
 * The compile half is the part that matters. Before this, a cancelled run left
 * a half-written `.exe` behind, and the next attempt to launch it failed with
 * "not a valid application for this OS platform" - a message that points at the
 * file, not at the cancel that broke it. Every run here writes its binary under
 * a `.partial` name and renames it only after the compiler exits clean, so a
 * truncated build is never visible under the name the run step executes.
 */

/// Hard stop for runaway output. A program that prints in a tight loop would
/// otherwise grow the panel until the webview runs out of memory.
const MAX_BARIS: usize = 20_000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunOutput {
    pub run_id: String,
    /// `compile` or `program`, so the panel can label the two phases apart.
    pub phase: String,
    pub line: String,
    pub stderr: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunDone {
    pub run_id: String,
    /// `ok`, `build-failed`, `run-failed`, or `killed`.
    pub status: String,
    pub exit_code: Option<i32>,
    pub lines: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolStatus {
    pub tool: String,
    pub found: bool,
    /// Where it was found, shown in the UI so two installs are visible.
    pub path: String,
    pub version: String,
}

/// One process the run pipeline owns, kept so `run_stop` can reach it.
struct RunProc {
    /// `None` between the two phases: there is no live child while the thread
    /// is deciding whether the compile succeeded. Keeping the entry present the
    /// whole time is what makes a cancel during that gap work.
    child: Option<Child>,
    batal: Arc<AtomicBool>,
    pid_anak: Option<u32>,
    /*
     * The PROGRAM phase's stdin, held here so `run_input` can write to it.
     *
     * Only the program gets a pipe: the compile phase is handed `null`, which
     * is what makes `cargo`/`javac` fail fast instead of waiting forever for an
     * answer to a licence prompt nobody can see. A compile that reads stdin
     * would be a hang that looks like a slow build.
     */
    stdin_program: Option<std::process::ChildStdin>,
}

#[derive(Default)]
pub struct RunRuntime {
    /// Shared as an `Arc` so the pipeline thread can release its own
    /// reservation when it finishes, after the command has already returned.
    procs: Arc<Mutex<std::collections::HashMap<String, Arc<Mutex<RunProc>>>>>,
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Kill a process and every child it spawned.
///
/// `taskkill /T` is not optional: a compiler driver (`g++`) runs `cc1plus` and
/// the linker as children, so killing only the parent leaves the linker writing
/// into the output file after we already reported the run as stopped - exactly
/// the half-written binary this module exists to prevent.
#[cfg(windows)]
fn bunuh_pohon(pid: u32) {
    use std::os::windows::process::CommandExt;
    let _ = Command::new("taskkill")
        .args(["/F", "/T", "/PID", &pid.to_string()])
        .creation_flags(0x0800_0000)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
}

#[cfg(not(windows))]
fn bunuh_pohon(pid: u32) {
    let _ = Command::new("kill")
        .args(["-9", &pid.to_string()])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
}

/// Where a toolchain usually lives when it is installed but not on `PATH`.
///
/// WHY this exists: the Run feature failed on this machine with `g++` missing
/// while the compiler was installed the whole time - in the WinGet `mingw64`
/// folder. `PATH` for a GUI app is the one inherited at login; a toolchain
/// installed afterwards, or added to the user `PATH` by an installer that does
/// not broadcast `WM_SETTINGCHANGE`, never reaches it. VS Code has the same
/// blind spot for C/C++ and answers with "cannot find compiler"; a scope
/// without a task runner has to at least look in the obvious places.
///
/// Keys are tool names (no `.exe`); the values are roots whose `bin` child is
/// probed, plus the tool's own subtree for versioned layouts.
#[cfg(windows)]
fn akar_tool(tool: &str) -> &'static [&'static str] {
    match tool {
        "g++" | "gcc" | "gdb" | "mingw32-make" | "gfortran" => &[
            r"C:\msys64\mingw64",
            r"C:\msys64\ucrt64",
            r"C:\msys64\clang64",
            r"C:\MinGW",
            r"C:\mingw64",
            r"C:\minGW\bin",
            r"C:\TDM-GCC-64",
            r"C:\ProgramData\mingw64",
        ],
        "clang" | "clang++" | "lldb" => &[
            r"C:\Program Files\LLVM",
            r"C:\Program Files (x86)\LLVM",
        ],
        "go" => &[r"C:\Program Files\Go", r"C:\Go"],
        "java" | "javac" | "jshell" => &[
            r"C:\Program Files\Java",
            r"C:\Program Files\Eclipse Adoptium",
            r"C:\Program Files\Microsoft",
            r"C:\rea-tools\jdk",
        ],
        "kotlinc" => &[r"C:\Program Files\Kotlin", r"C:\kotlinc"],
        "dotnet" => &[r"C:\Program Files\dotnet"],
        "php" => &[r"C:\laragon\bin\php", r"C:\xampp\php"],
        "ruby" => &[r"C:\Ruby34-x64", r"C:\Ruby33-x64", r"C:\Ruby32-x64"],
        "dart" => &[r"C:\tools\dart-sdk"],
        "swift" => &[r"C:\Program Files\Swift"],
        _ => &[],
    }
}

#[cfg(windows)]
fn kandidat_winget(tool: &str) -> Vec<PathBuf> {
    // WinGet unpacks portable packages under this root, in a package folder
    // whose name changes per publisher and version. Scanning it is how the
    // compiler in this session was found; there is no stable path to hardcode.
    let Some(local) = std::env::var_os("LOCALAPPDATA") else {
        return Vec::new();
    };
    let paket = PathBuf::from(local).join("Microsoft").join("WinGet").join("Packages");
    let Ok(isi) = std::fs::read_dir(&paket) else {
        return Vec::new();
    };
    let nama = format!("{tool}.exe");
    let mut hasil = Vec::new();
    for e in isi.flatten() {
        let folder = e.path();
        if !folder.is_dir() {
            continue;
        }
        // `<pkg>/bin/<tool>.exe` and `<pkg>/mingw64/bin/<tool>.exe` cover the
        // toolchains WinGet ships today; anything deeper is not a normal layout.
        for rel in ["bin", "mingw64/bin", "ucrt64/bin", "clang64/bin"] {
            let calon = folder.join(rel.replace('/', "\\")).join(&nama);
            if calon.is_file() {
                hasil.push(calon);
            }
        }
    }
    hasil
}

/// Resolve an executable without running it.
///
/// Order: `PATH` (what the user's shell uses), then the well-known install
/// roots, then the WinGet package folder, with `<root>/bin` checked before the
/// root itself. The found path is what the run pipeline executes, so a
/// toolchain that is installed but absent from the GUI `PATH` still works.
pub(crate) fn cari_di_path(tool: &str) -> Option<PathBuf> {
    let di_path = || {
        let nama = if cfg!(windows) && !tool.to_lowercase().ends_with(".exe") {
            format!("{tool}.exe")
        } else {
            tool.to_string()
        };
        let path = std::env::var_os("PATH")?;
        std::env::split_paths(&path)
            .map(|dir| dir.join(&nama))
            .find(|calon| calon.is_file())
    };
    if let Some(p) = di_path() {
        return Some(p);
    }

    /*
     * Batch launchers (`npx`, `npm`, `yarn`) are not binaries on Windows.
     * They ship as `npx.cmd` next to a `npx.ps1`/extensionless shim, and
     * `CreateProcess` cannot start a `.cmd` - it answers "program not found",
     * which reads as "the tool is not installed" and sends the reader off to
     * install Node that they already have. Resolving the `.cmd` and launching
     * it through `cmd /c` (see `perlu_shell`) is what `npm`-run languages need.
     */
    #[cfg(windows)]
    {
        let nama_shim = format!("{tool}.cmd");
        let di_path_cmd = || {
            let path = std::env::var_os("PATH")?;
            std::env::split_paths(&path)
                .map(|dir| dir.join(&nama_shim))
                .find(|calon| calon.is_file())
        };
        if let Some(p) = di_path_cmd() {
            return Some(p);
        }

        let nama = if tool.to_lowercase().ends_with(".exe") {
            tool.to_string()
        } else {
            format!("{tool}.exe")
        };
        let inti = tool.trim_end_matches(".exe");
        for akar in akar_tool(inti) {
            let base = Path::new(akar);
            for calon in [base.join("bin").join(&nama), base.join(&nama), base.join(inti).join("bin").join(&nama)] {
                if calon.is_file() {
                    return Some(calon);
                }
            }
        }
        if let Some(p) = kandidat_winget(inti).into_iter().next() {
            return Some(p);
        }
    }
    None
}

/// True when the resolved path needs `cmd /c` to start.
///
/// Only `.cmd`/`.bat` files: a `.exe` started through `cmd` would get its
/// output and exit code funnelled through another process for no reason.
fn perlu_shell(p: &Path) -> bool {
    matches!(
        p.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()).as_deref(),
        Some("cmd") | Some("bat")
    )
}

/// Build the command for the resolved executable, wrapping batch files.
fn perintah(jalur: &Path, args: &[String]) -> Command {
    if perlu_shell(jalur) {
        let mut c = crate::proc::cmd("cmd");
        // `cmd /c` without `/S` and with every argument quoted individually is
        // the form that survives paths containing spaces.
        c.arg("/c").arg(jalur);
        c.args(args);
        c
    } else {
        let mut c = crate::proc::cmd(jalur);
        c.args(args);
        c
    }
}

#[tauri::command]
pub fn run_tool_status(tools: Vec<String>) -> Vec<ToolStatus> {
    tools
        .into_iter()
        .map(|t| {
            let ketemu = cari_di_path(&t);
            let (found, path) = match &ketemu {
                Some(p) => (true, p.to_string_lossy().to_string()),
                None => (false, String::new()),
            };
            // `java -version` writes to stderr; everything else here uses
            // stdout, so both pipes are read and the first non-empty line wins.
            let version = ketemu
                .as_ref()
                .and_then(|p| {
                    crate::proc::cmd(p)
                        .arg("--version")
                        .stdout(Stdio::piped())
                        .stderr(Stdio::piped())
                        .stdin(Stdio::null())
                        .output()
                        .ok()
                })
                .map(|o| {
                    let teks = if o.stdout.is_empty() {
                        String::from_utf8_lossy(&o.stderr).to_string()
                    } else {
                        String::from_utf8_lossy(&o.stdout).to_string()
                    };
                    teks.lines().next().unwrap_or("").trim().to_string()
                })
                .unwrap_or_default();
            ToolStatus {
                tool: t,
                found,
                path,
                version,
            }
        })
        .collect()
}

/// Delete a file we created, ignoring "not there" - that is the normal case.
fn hapus_tenang(p: &Path) {
    if p.exists() {
        let _ = std::fs::remove_file(p);
    }
}

struct Fase {
    label: &'static str,
    cmd: PathBuf,
    args: Vec<String>,
}

/// Stream both pipes of a child into one channel of `(isErr, line)`.
fn pompa_output(child: &mut Child) -> std::sync::mpsc::Receiver<(bool, String)> {
    let (tx, rx) = std::sync::mpsc::channel::<(bool, String)>();

    fn baca<R: std::io::Read + Send + 'static>(
        s: R,
        is_err: bool,
        tx: std::sync::mpsc::Sender<(bool, String)>,
    ) {
        std::thread::spawn(move || {
            let mut rd = BufReader::new(s);
            let mut buf = Vec::new();
            loop {
                buf.clear();
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

    if let Some(s) = child.stdout.take() {
        baca(s, false, tx.clone());
    }
    if let Some(s) = child.stderr.take() {
        baca(s, true, tx.clone());
    }
    drop(tx);
    rx
}

#[allow(clippy::too_many_arguments)]
#[tauri::command(async)]
pub fn run_start(
    app: AppHandle,
    state: State<AppState>,
    rt: State<RunRuntime>,
    run_id: String,
    cwd: String,
    compile_cmd: Option<String>,
    compile_args: Option<Vec<String>>,
    compile_out: Option<String>,
    run_cmd: String,
    run_args: Vec<String>,
) -> ZResult<String> {
    crate::workspace::ensure_trusted(&state, "Menjalankan program")?;

    if run_id.trim().is_empty() {
        return Err(ZephyrError::InvalidInput("empty run id".into()));
    }
    if run_cmd.trim().is_empty() {
        return Err(ZephyrError::InvalidInput("empty run command".into()));
    }

    /*
     * The cwd comes from the UI and is NOT trusted: this command spawns
     * processes, so a path outside the workspace could run a program anywhere
     * on the machine. Two layers, the same ones `agent_exec` uses.
     */
    let dir = crate::paths::validate_cwd(Path::new(&cwd))?;
    if let Some(ws) = state.workspace_path() {
        if !crate::paths::is_inside(&ws, &dir) {
            return Err(ZephyrError::InvalidInput(format!(
                "cwd is outside the workspace: {}",
                dir.to_string_lossy()
            )));
        }
    }

    {
        let procs = rt.procs.lock().unwrap();
        if procs.contains_key(&run_id) {
            return Err(ZephyrError::InvalidInput(format!(
                "run {run_id} is already going"
            )));
        }
    }

    let out_bin = compile_out.unwrap_or_default();
    let ada_kompilasi = compile_cmd
        .as_ref()
        .map(|c| !c.trim().is_empty())
        .unwrap_or(false);

    let mut fase: Vec<Fase> = Vec::new();

    if ada_kompilasi {
        let tool = compile_cmd.clone().unwrap_or_default();
        /*
         * Execute the RESOLVED path, not the bare name.
         *
         * `cari_di_path` also looks outside `PATH`, so a toolchain installed
         * but invisible to this process is still usable - but only if the
         * spawn uses the path it found. Passing the name through would make
         * the lookup pointless: the spawn would search `PATH` again and fail
         * with "program not found", which is the very error this feature was
         * meant to stop producing.
         */
        let Some(exe) = cari_di_path(&tool) else {
            return Err(ZephyrError::NotFound(format!(
                "{tool} was not found - install that toolchain, then run again"
            )));
        };

        /*
         * Redirect the compiler's output file to `<out>.partial`.
         *
         * The UI sends the argument list with the real output path already in
         * it, so rewriting that exact argument is enough: any other flag that
         * happens to look like a path is left alone.
         */
        let mut args = compile_args.unwrap_or_default();
        if !out_bin.is_empty() {
            let sementara = format!("{out_bin}.partial");
            let mut diganti = false;
            for a in args.iter_mut() {
                if a == &out_bin {
                    *a = sementara.clone();
                    diganti = true;
                }
            }
            if !diganti {
                /*
                 * The tool names its own output (javac writes `<Class>.class`).
                 * Nothing to rename later, so remove the previous artefact now:
                 * otherwise a build that fails half way leaves yesterday's
                 * binary in place and the run step executes old code.
                 */
                hapus_tenang(Path::new(&out_bin));
            }
        }
        fase.push(Fase {
            label: "compile",
            cmd: exe,
            args,
        });
    }

    /*
     * The run step gets the same treatment as the compile step: if the program
     * is a tool name (`python`, `java`) resolve it, so a toolchain that is
     * installed but missing from this process's `PATH` still starts. An
     * absolute path - which is what `{bin}` becomes for compiled languages -
     * is left untouched.
     */
    let run_cmd = {
        let p = Path::new(&run_cmd);
        if p.is_absolute() || run_cmd.contains('/') || run_cmd.contains('\\') {
            run_cmd
        } else {
            cari_di_path(&run_cmd)
                .map(|x| x.to_string_lossy().to_string())
                .unwrap_or(run_cmd)
        }
    };

    fase.push(Fase {
        label: "program",
        cmd: PathBuf::from(run_cmd),
        args: run_args,
    });
    let batal = Arc::new(AtomicBool::new(false));
    let slot = Arc::new(Mutex::new(RunProc {
        child: None,
        batal: batal.clone(),
        pid_anak: None,
        stdin_program: None,
    }));
    rt.procs
        .lock()
        .unwrap()
        .insert(run_id.clone(), slot.clone());

    let _ = app.emit(
        "run-status",
        json!({ "runId": run_id, "status": "running", "startedMs": now_ms() }),
    );

    let app2 = app.clone();
    let id2 = run_id.clone();
    let dir2 = dir.clone();
    let batal2 = batal.clone();
    let out2 = out_bin.clone();
    let slot2 = slot.clone();
    /*
     * The map lives in the Tauri state, which outlives this thread, but the
     * `State` guard only lives for the call. Cloning the `Arc` out of the guard
     * keeps the reservation releasable once the pipeline is done - without it a
     * run id would stay taken until the app restarts and the next Run would be
     * rejected as "already going".
     */
    let peta = rt.procs.clone();

    /*
     * The pipeline owns its own thread and the command returns at once.
     *
     * `tasks_run` can hand its single child back to the runtime, but here there
     * are two processes in sequence and the second one must only start when the
     * first exits clean. Waiting for that inside the IPC call would freeze the
     * caller for as long as the program runs - which for a GUI program is
     * forever.
     */
    std::thread::spawn(move || {
        let mut total = 0usize;
        let mut akhir = "ok".to_string();

        for (i, f) in fase.iter().enumerate() {
            if batal2.load(Ordering::SeqCst) {
                akhir = "killed".into();
                break;
            }

            let mut c = perintah(&f.cmd, &f.args);
            let fase_program = f.label == "program";
            c.current_dir(&dir2)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .stdin(if fase_program {
                    Stdio::piped()
                } else {
                    Stdio::null()
                });

            let mut child = match c.spawn() {
                Ok(ch) => ch,
                Err(e) => {
                    let _ = app2.emit(
                        "run-output",
                        RunOutput {
                            run_id: id2.clone(),
                            phase: f.label.into(),
                            line: format!("failed to start {}: {e}", f.cmd.to_string_lossy()),
                            stderr: true,
                        },
                    );
                    akhir = if i == 0 { "build-failed" } else { "run-failed" }.into();
                    break;
                }
            };

            // Publish the pid before reading a single line, so Stop pressed in
            // the first few milliseconds still finds something to kill.
            let pid = child.id();
            {
                let mut g = slot2.lock().unwrap();
                g.pid_anak = Some(pid);
                /*
                 * Publish stdin at the same moment, for the same reason as the
                 * pid: a program whose first act is `input()` must already have
                 * somewhere to read from when the reader presses Enter. Only
                 * the program phase gets a pipe - see `RunProc::stdin_program`.
                 */
                g.stdin_program = if fase_program { child.stdin.take() } else { None };
            }

            let rx = pompa_output(&mut child);
            let mut penuh = false;

            while let Ok((is_err, baris)) = rx.recv() {
                total += 1;
                if total > MAX_BARIS {
                    penuh = true;
                    break;
                }
                let _ = app2.emit(
                    "run-output",
                    RunOutput {
                        run_id: id2.clone(),
                        phase: f.label.into(),
                        line: baris,
                        stderr: is_err,
                    },
                );
            }

            if penuh {
                bunuh_pohon(pid);
                let _ = app2.emit(
                    "run-output",
                    RunOutput {
                        run_id: id2.clone(),
                        phase: f.label.into(),
                        line: format!("[output stopped after {MAX_BARIS} lines]"),
                        stderr: true,
                    },
                );
                akhir = "run-failed".into();
                break;
            }

            // The reader threads end when the pipes close, so `wait` only has to
            // reap the process. It cannot block for long at this point.
            let code = child.wait().ok().and_then(|s| s.code());

            {
                let mut g = slot2.lock().unwrap();
                g.child = None;
                g.pid_anak = None;
                /* `child.wait()` already returned, so the pipe's read end is
                 * gone; a stdin left here would accept a write and lose it. */
                g.stdin_program = None;
            }

            if batal2.load(Ordering::SeqCst) {
                akhir = "killed".into();
                break;
            }
            if i == 0 && code != Some(0) {
                akhir = "build-failed".into();
                break;
            }
            if i > 0 && code != Some(0) {
                akhir = "run-failed".into();
                break;
            }

            /*
             * Compile exited clean: promote the temp binary.
             *
             * A rename is atomic on the same volume, so the run step either
             * sees the whole new binary or the previous one - never a file
             * caught mid-write, which is what produced the "not a valid
             * application" error.
             */
            if i == 0 && !out2.is_empty() {
                let sementara = format!("{out2}.partial");
                if Path::new(&sementara).exists() {
                    hapus_tenang(Path::new(&out2));
                    if std::fs::rename(&sementara, &out2).is_err() {
                        akhir = "build-failed".into();
                        break;
                    }
                }
            }
        }

        // A cancel during the build must not leave the temp file behind, or the
        // next build would find it and the file list would show a ghost.
        if !out2.is_empty() {
            hapus_tenang(Path::new(&format!("{out2}.partial")));
        }

        let _ = app2.emit(
            "run-done",
            RunDone {
                run_id: id2.clone(),
                status: akhir,
                exit_code: None,
                lines: total,
            },
        );

        // Release the reservation whatever happened: a second Run must work
        // without restarting the app.
        peta.lock().unwrap().remove(&id2);
        drop(slot2);
    });

    Ok(run_id)
}

#[tauri::command]
pub fn run_stop(rt: State<RunRuntime>, run_id: String) -> bool {
    let slot = {
        let procs = rt.procs.lock().unwrap();
        procs.get(&run_id).cloned()
    };
    let Some(slot) = slot else {
        return false;
    };

    let g = slot.lock().unwrap();
    g.batal.store(true, Ordering::SeqCst);
    if let Some(pid) = g.pid_anak {
        // Tree kill even here: the linker is a grandchild of the compiler, and
        // it is the one holding the output file open.
        bunuh_pohon(pid);
    }
    true
}

#[tauri::command]
pub fn run_selesai(rt: State<RunRuntime>, run_id: String) {
    rt.procs.lock().unwrap().remove(&run_id);
}

/// Send one line to the running program's stdin.
///
/// WHY this has to exist at all: the Run panel used to give the program an
/// empty stdin, so the very first `input()` / `cin >>` / `scanf` in a beginner's
/// program blocked forever with no window to type into. The panel showed an
/// empty shell and the only way out was Stop. VS Code answers this with a
/// terminal; the Run panel answers it with this command.
///
/// A newline is appended by the CALLER's text plus here, so "send empty" means
/// "press Enter" - which is what `input()` needs - instead of a zero-byte write
/// the program would never notice.
///
/// Returns false when there is nothing to write to (the compile phase, a run
/// that already ended, or an id that is gone). That is not an error: a line
/// typed a moment after the program exited is normal, and an exception would
/// only produce a toast nobody can act on.
#[tauri::command]
pub fn run_input(rt: State<RunRuntime>, run_id: String, text: String) -> bool {
    let slot = {
        let procs = rt.procs.lock().unwrap();
        procs.get(&run_id).cloned()
    };
    let Some(slot) = slot else {
        return false;
    };
    let mut g = slot.lock().unwrap();
    let Some(stdin) = g.stdin_program.as_mut() else {
        return false;
    };
    let mut baris = text;
    if !baris.ends_with('\n') {
        baris.push('\n');
    }
    if stdin.write_all(baris.as_bytes()).is_err() {
        return false;
    }
    /* Flushed explicitly: `ChildStdin` is unbuffered, but the program may be
     * waiting on a read that will never be satisfied if the write is still in
     * the OS buffer of a dead handle. */
    stdin.flush().is_ok()
}

/// Close the program's stdin without stopping it.
///
/// This is "End of input" - Ctrl+Z then Enter in a console. A program reading in
/// a loop until EOF (the common shape of competitive-programming style code)
/// only finishes when the pipe CLOSES; sending an empty line just gives it an
/// empty string and the loop asks again.
#[tauri::command]
pub fn run_input_eof(rt: State<RunRuntime>, run_id: String) -> bool {
    let slot = {
        let procs = rt.procs.lock().unwrap();
        procs.get(&run_id).cloned()
    };
    let Some(slot) = slot else {
        return false;
    };
    let mut g = slot.lock().unwrap();
    g.stdin_program.take().is_some()
}

#[tauri::command]
pub fn run_active(rt: State<RunRuntime>) -> Vec<String> {
    rt.procs.lock().unwrap().keys().cloned().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cari_di_path_menemukan_cmd_windows() {
        // `cmd` is the one executable that is guaranteed present on the test
        // machine; anything else would make the test depend on the toolchain
        // under test, which is exactly what it is checking.
        if cfg!(windows) {
            assert!(cari_di_path("cmd").is_some());
            assert!(cari_di_path("zephyr-tool-yang-tidak-ada").is_none());
        }
    }

    #[test]
    fn batch_file_dijalankan_lewat_cmd() {
        assert!(perlu_shell(Path::new(r"C:\node\npx.cmd")));
        assert!(perlu_shell(Path::new(r"C:\x\build.BAT")));
        assert!(!perlu_shell(Path::new(r"C:\Python314\python.exe")));
        assert!(!perlu_shell(Path::new(r"C:\x\a.out")));
    }
}
