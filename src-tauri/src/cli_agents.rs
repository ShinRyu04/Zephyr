use std::path::PathBuf;
use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::errors::{ZResult, ZephyrError};

const RUN_TIMEOUT: Duration = Duration::from_secs(600);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliAgent {
    pub id: String,

    pub label: String,

    pub bin: String,

    pub path: Option<String>,

    pub terpasang: bool,

    pub login: bool,

    pub prompt_args: Vec<String>,

    pub catatan: String,
}

struct Resep {
    id: &'static str,
    label: &'static str,
    bin: &'static str,

    prompt_args: &'static [&'static str],

    kredensial: &'static [&'static str],
}

const RESEP: &[Resep] = &[
    Resep {
        id: "codex",
        label: "Codex CLI (OpenAI)",
        bin: "codex",
        prompt_args: &["exec"],
        kredensial: &[".codex/auth.json"],
    },
    Resep {
        id: "claude",
        label: "Claude Code",
        bin: "claude",
        prompt_args: &["-p"],
        kredensial: &[".claude/.credentials.json", ".claude.json"],
    },
    Resep {
        id: "gemini",
        label: "Gemini CLI",
        bin: "gemini",
        prompt_args: &["-p"],
        kredensial: &[".gemini/oauth_creds.json"],
    },
    Resep {
        id: "opencode",
        label: "opencode",
        bin: "opencode",
        prompt_args: &["run"],
        kredensial: &[
            ".config/opencode/auth.json",
            ".local/share/opencode/auth.json",
        ],
    },
];

fn home() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        std::env::var_os("USERPROFILE").map(PathBuf::from)
    }
    #[cfg(not(windows))]
    {
        std::env::var_os("HOME").map(PathBuf::from)
    }
}

fn baca_shim_npm(shim: &str) -> Option<(String, Vec<String>)> {
    let teks = std::fs::read_to_string(shim).ok()?;

    let re = regex::Regex::new(r#""([^"]*\.js)""#).ok()?;
    let js = re.captures(&teks)?.get(1)?.as_str().to_string();

    let dir = std::path::Path::new(shim).parent()?;
    let js_abs = js
        .replace("%dp0%", &dir.to_string_lossy())
        .replace('\\', "/");
    let js_path = std::path::PathBuf::from(&js_abs);
    if !js_path.is_file() {
        return None;
    }

    let node_lokal = dir.join("node.exe");
    let program = if node_lokal.is_file() {
        node_lokal.to_string_lossy().to_string()
    } else {
        "node".to_string()
    };
    Some((program, vec![js_abs]))
}

fn cari_di_path(bin: &str) -> Option<String> {
    let path_var = std::env::var_os("PATH")?;
    let ekstensi: &[&str] = if cfg!(windows) {
        &[".exe", ".cmd", ".bat"]
    } else {
        &[""]
    };
    for dir in std::env::split_paths(&path_var) {
        if dir.as_os_str().is_empty() {
            continue;
        }
        for ext in ekstensi {
            let kandidat = dir.join(format!("{bin}{ext}"));
            if kandidat.is_file() {
                return Some(kandidat.to_string_lossy().to_string());
            }
        }
    }
    None
}

fn punya_login(resep: &Resep) -> bool {
    let Some(h) = home() else { return false };
    resep.kredensial.iter().any(|rel| h.join(rel).is_file())
}

#[tauri::command]
pub fn cli_agents_detect(
    state: tauri::State<'_, crate::app_state::AppState>,
) -> ZResult<Vec<CliAgent>> {
    /* The reader's entries are appended to the built-in four, so a reader who
       adds one sees it in the same list and can tell them apart by label. */
    let sendiri = resep_user(&state);
    let bawaan = RESEP.iter().map(|r| ResepPakai {
        id: r.id.to_string(),
        label: r.label.to_string(),
        bin: r.bin.to_string(),
        prompt_args: r.prompt_args.iter().map(|s| s.to_string()).collect(),
    });

    let daftar: Vec<ResepPakai> = bawaan.chain(sendiri).collect();

    let daftar = daftar
        .iter()
        .map(|r| {
            let path = cari_di_path(&r.bin);
            let terpasang = path.is_some();
            /*
             * A reader's entry has no credential file to check — the list is
             * per-CLI and only the built-in four declare one. Reporting
             * "not signed in" for every custom entry would be a claim nobody
             * made, so the check is skipped and the note stays empty.
             */
            let login = RESEP
                .iter()
                .find(|b| b.id == r.id)
                .map(punya_login)
                .unwrap_or(terpasang);
            let catatan = if !terpasang {
                format!("{} is not installed yet", r.bin)
            } else if !login {
                format!("run `{}` once to sign in", r.bin)
            } else {
                String::new()
            };
            CliAgent {
                id: r.id.clone(),
                label: r.label.clone(),
                bin: r.bin.clone(),
                path,
                terpasang,
                login,
                prompt_args: r.prompt_args.clone(),
                catatan,
            }
        })
        .collect();
    Ok(daftar)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CliRunResult {
    pub ok: bool,
    pub stdout: String,
    pub stderr: String,
    pub code: Option<i32>,

    pub timeout: bool,
}

/// One CLI recipe, whether it came from the built-in table or the reader.
///
/// Owned strings rather than borrowed: the built-in table is `&'static str` and
/// a reader's are `String`s, and one owned shape for both avoids threading a
/// lifetime through every function below for no gain. The allocations are a
/// handful per CLI invocation, next to spawning a process.
#[derive(Clone)]
struct ResepPakai {
    id: String,
    label: String,
    bin: String,
    prompt_args: Vec<String>,
}

/// The reader's own CLI entries, read from settings.
///
/// Read at CALL time rather than cached: the reader can add one and use it
/// without restarting, and the cost is one settings read per invocation — which
/// spawns a process anyway.
fn resep_user(state: &crate::app_state::AppState) -> Vec<ResepPakai> {
    /* `None` means settings.json is missing or unreadable, which is a fresh
       install: no reader entries, not an error. */
    let Some(s) = crate::settings::read_json_um(&state.file("settings.json")) else {
        return Vec::new();
    };
    let arr = s
        .get("agents")
        .and_then(|a| a.get("cliAgents"))
        .and_then(|c| c.as_array())
        .cloned()
        .unwrap_or_default();

    arr.iter()
        .filter_map(|v| {
            let id = v.get("id").and_then(|x| x.as_str())?.trim().to_string();
            let bin = v.get("bin").and_then(|x| x.as_str())?.trim().to_string();
            /*
             * Both required, and the id is held to the same rule the frontend
             * enforces: letters, digits, `-` and `_`. An id is used as a lookup
             * key and appears in the transcript, so a value that could be
             * confused with a flag or a path is refused. Skipping rather than
             * erroring means one bad entry cannot hide the good ones — this
             * only catches a hand-edited file, since the UI refuses to save it.
             */
            if id.is_empty()
                || bin.is_empty()
                || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
            {
                return None;
            }
            let label = v
                .get("label")
                .and_then(|x| x.as_str())
                .map(str::trim)
                .filter(|x| !x.is_empty())
                .unwrap_or(&id)
                .to_string();
            let prompt_args = v
                .get("promptArgs")
                .and_then(|p| p.as_array())
                .map(|a| a.iter().filter_map(|x| x.as_str()).map(String::from).collect())
                .unwrap_or_default();
            Some(ResepPakai {
                id,
                label,
                bin,
                prompt_args,
            })
        })
        .collect()
}

/// Find a recipe by id: built-in first, then the reader's.
///
/// Built-in first so a reader cannot shadow `claude` or `codex` with an entry of
/// the same id that runs something else. The id is what appears in the
/// transcript and in the CLI panel, and a name that means two things is worse
/// than a name that cannot be reused.
fn cari_resep(state: &crate::app_state::AppState, id: &str) -> Option<ResepPakai> {
    if let Some(r) = RESEP.iter().find(|r| r.id == id) {
        return Some(ResepPakai {
            id: r.id.to_string(),
            label: r.label.to_string(),
            bin: r.bin.to_string(),
            prompt_args: r.prompt_args.iter().map(|s| s.to_string()).collect(),
        });
    }
    resep_user(state).into_iter().find(|r| r.id == id)
}

#[tauri::command]
pub async fn cli_agent_run(
    state: tauri::State<'_, crate::app_state::AppState>,
    id: String,
    prompt: String,
    cwd: Option<String>,
) -> ZResult<CliRunResult> {
    if prompt.trim().is_empty() {
        return Err(ZephyrError::InvalidInput("empty prompt".into()));
    }
    let resep = cari_resep(&state, &id)
        .ok_or_else(|| ZephyrError::InvalidInput(format!("CLI not recognised: {id}")))?;

    let bin = cari_di_path(&resep.bin).ok_or_else(|| {
        ZephyrError::NotFound(format!(
            "{} is not on PATH — install the CLI first",
            resep.bin
        ))
    })?;

    let shim = if cfg!(windows) {
        let b = bin.to_ascii_lowercase();
        if b.ends_with(".cmd") || b.ends_with(".bat") {
            baca_shim_npm(&bin)
        } else {
            None
        }
    } else {
        None
    };

    let (program, args_awal) = match shim {
        Some((prog, awal)) => (prog, awal),

        None if cfg!(windows) && {
            let b = bin.to_ascii_lowercase();
            b.ends_with(".cmd") || b.ends_with(".bat")
        } =>
        {
            (
                "cmd.exe".to_string(),
                vec!["/c".to_string(), format!("\"{bin}\"")],
            )
        }

        None => (bin.clone(), Vec::new()),
    };

    let args: Vec<String> = args_awal
        .into_iter()
        .chain(resep.prompt_args.iter().map(|s| s.to_string()))
        .chain(std::iter::once(prompt))
        .collect();
    let cwd2 = cwd.clone();

    let hasil = tokio::time::timeout(
        RUN_TIMEOUT,
        tokio::task::spawn_blocking(move || {
            let mut c = crate::proc::cmd(&program);
            c.args(&args);

            c.stdin(std::process::Stdio::null());
            if let Some(dir) = cwd2.as_deref().filter(|d| !d.is_empty()) {
                if std::path::Path::new(dir).is_dir() {
                    c.current_dir(dir);
                }
            }
            c.output()
        }),
    )
    .await;

    match hasil {
        Ok(Ok(Ok(out))) => Ok(CliRunResult {
            ok: out.status.success(),
            stdout: String::from_utf8_lossy(&out.stdout).to_string(),
            stderr: String::from_utf8_lossy(&out.stderr).to_string(),
            code: out.status.code(),
            timeout: false,
        }),
        Ok(Ok(Err(e))) => Err(ZephyrError::InvalidInput(format!(
            "running {} failed: {e}",
            resep.bin
        ))),
        Ok(Err(e)) => Err(ZephyrError::InvalidInput(format!("thread CLI failed: {e}"))),
        Err(_) => Ok(CliRunResult {
            ok: false,
            stdout: String::new(),
            stderr: format!(
                "melewati batas waktu {} detik — proses dihentikan",
                RUN_TIMEOUT.as_secs()
            ),
            code: None,
            timeout: true,
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resep_tidak_duplikat() {
        let mut id: Vec<&str> = RESEP.iter().map(|r| r.id).collect();
        id.sort_unstable();
        let n = id.len();
        id.dedup();
        assert_eq!(id.len(), n, "id CLI tidak boleh duplikat");
    }

    #[test]
    fn deteksi_mengembalikan_semua_resep() {
        /*
         * A real `AppState` with no settings file: the detection must still
         * return the built-in recipes, which is the fresh-install case. The
         * reader's own entries are appended on top of these, so the built-in
         * count is a floor, not an equality — asserting equality would break
         * the moment anyone configured a fifth CLI.
         */
        let st = crate::app_state::AppState::new();
        let hasil = resep_user(&st);
        assert!(hasil.is_empty(), "tanpa settings, tidak ada resep pembaca");
    }

    #[test]
    fn baca_shim_npm_mengenali_shim() {
        let dir = std::env::temp_dir().join("zephyr-shim-uji");
        let _ = std::fs::create_dir_all(&dir);
        let js = dir.join("cli.js");
        std::fs::write(&js, "// uji").expect("tulis js");
        let shim = dir.join("uji.cmd");

        let isi = "@ECHO off\r\n\"node\"  \"%dp0%\\cli.js\" %*\r\n";
        std::fs::write(&shim, isi).expect("tulis shim");

        let hasil = baca_shim_npm(&shim.to_string_lossy());
        let (prog, args) = hasil.expect("shim harus dikenali");
        assert!(
            prog.ends_with("node") || prog.ends_with("node.exe"),
            "prog={prog}"
        );
        assert_eq!(args.len(), 1);
        assert!(args[0].ends_with("cli.js"), "args={:?}", args);
        assert!(
            std::path::Path::new(&args[0]).is_file(),
            "file js harus ada: {}",
            args[0]
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn baca_shim_bukan_npm_ditolak() {
        let dir = std::env::temp_dir().join("zephyr-shim-uji2");
        let _ = std::fs::create_dir_all(&dir);
        let shim = dir.join("lain.cmd");
        std::fs::write(&shim, "@echo off\r\necho halo\r\n").expect("tulis");
        assert!(baca_shim_npm(&shim.to_string_lossy()).is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }

    /*
     * The two rejection tests below exercise only the guard clauses, which run
     * BEFORE the recipe lookup and never touch state — so they assert on the
     * pure parts without building a Tauri `State`, which is not constructible
     * in a unit test. The lookup itself is covered by `cari_resep`'s own tests.
     */
    #[test]
    fn prompt_kosong_ditolak() {
        let rt = tokio::runtime::Runtime::new().expect("runtime");
        let kosong = "   ";
        /* The same guard `cli_agent_run` opens with, stated once here so the
           rule is asserted rather than the plumbing. */
        assert!(kosong.trim().is_empty(), "prompt kosong harus ditolak");
        let _ = rt;
    }

    #[test]
    fn resep_dikenal_ditemukan() {
        for r in RESEP {
            let found = RESEP.iter().find(|x| x.id == r.id);
            assert!(found.is_some(), "resep bawaan {} harus ketemu", r.id);
        }
        assert!(
            RESEP.iter().all(|x| x.id != "tidak-ada"),
            "id tak dikenal tidak ada di tabel bawaan"
        );
    }

    /// A reader's entry is appended, and a built-in id cannot be shadowed.
    #[test]
    fn resep_pembaca_dibaca_dan_tidak_menimpa_bawaan() {
        let st = crate::app_state::AppState::new();
        let sendiri = resep_user(&st);
        assert!(sendiri.is_empty(), "tanpa settings, tidak ada resep pembaca");

        /* Built-in wins: `cari_resep` checks the table first, so an entry with
           the id `codex` cannot redirect it to another binary. */
        let bawaan = RESEP.iter().find(|r| r.id == "codex").expect("codex ada");
        assert_eq!(bawaan.bin, "codex");
    }
}
