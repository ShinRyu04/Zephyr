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
pub fn cli_agents_detect() -> ZResult<Vec<CliAgent>> {
    let daftar = RESEP
        .iter()
        .map(|r| {
            let path = cari_di_path(r.bin);
            let terpasang = path.is_some();
            let login = punya_login(r);
            let catatan = if !terpasang {
                format!("{} belum terpasang", r.bin)
            } else if !login {
                format!("jalankan `{}` sekali untuk login", r.bin)
            } else {
                String::new()
            };
            CliAgent {
                id: r.id.to_string(),
                label: r.label.to_string(),
                bin: r.bin.to_string(),
                path,
                terpasang,
                login,
                prompt_args: r.prompt_args.iter().map(|s| s.to_string()).collect(),
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

#[tauri::command]
pub async fn cli_agent_run(
    id: String,
    prompt: String,
    cwd: Option<String>,
) -> ZResult<CliRunResult> {
    if prompt.trim().is_empty() {
        return Err(ZephyrError::InvalidInput("prompt kosong".into()));
    }
    let resep = RESEP
        .iter()
        .find(|r| r.id == id)
        .ok_or_else(|| ZephyrError::InvalidInput(format!("CLI tidak dikenal: {id}")))?;

    let bin = cari_di_path(resep.bin).ok_or_else(|| {
        ZephyrError::NotFound(format!(
            "{} tidak ada di PATH — pasang dulu CLI-nya",
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
            "gagal menjalankan {}: {e}",
            resep.bin
        ))),
        Ok(Err(e)) => Err(ZephyrError::InvalidInput(format!("thread CLI gagal: {e}"))),
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
        let hasil = cli_agents_detect().expect("deteksi harus jalan");
        assert_eq!(hasil.len(), RESEP.len());

        for a in &hasil {
            assert!(!a.id.is_empty());
            assert!(!a.label.is_empty());
            assert!(!a.bin.is_empty());
        }
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

    #[test]
    fn prompt_kosong_ditolak() {
        let rt = tokio::runtime::Runtime::new().expect("runtime");
        let err = rt.block_on(cli_agent_run("codex".into(), "   ".into(), None));
        assert!(err.is_err(), "prompt kosong harus ditolak");
    }

    #[test]
    fn cli_tidak_dikenal_ditolak() {
        let rt = tokio::runtime::Runtime::new().expect("runtime");
        let err = rt.block_on(cli_agent_run("tidak-ada".into(), "halo".into(), None));
        match err {
            Err(ZephyrError::InvalidInput(m)) => assert!(m.contains("tidak dikenal")),
            lain => panic!("harus InvalidInput, dapat {lain:?}"),
        }
    }
}
