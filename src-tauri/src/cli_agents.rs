// cli_agents.rs — deteksi & jalankan CLI AI agent (T1.2/T1.5).
//
// KENAPA modul ini ada: user ingin memakai AKUN LANGGANAN (Codex/ChatGPT,
// Claude Code, Gemini CLI, opencode) di dalam Zephyr, bukan cuma API key.
// Jalur yang dipilih adalah "spawn CLI" (jalur B), bukan "baca token" —
// alasannya keamanan: refresh token milik user tidak pernah disentuh Zephyr,
// jadi kesalahan Zephyr tidak bisa mematikan sesi login CLI di mesin user.
//
// YANG DILAKUKAN MODUL INI
//   1. `cli_agents_detect` — cari binary CLI di PATH + cek apakah sesi login
//      ada (file kredensial milik CLI itu sendiri). Hasilnya untuk UI: badge
//      "terpasang / belum login".
//   2. `cli_agent_run` — jalankan satu prompt secara non-interaktif dan
//      kembalikan stdout. Dipakai panel AI untuk mode CLI.
//
// ATURAN PENTING
//   * Semua spawn lewat `crate::proc::cmd()` — tanpa itu muncul jendela
//     konsol sekejap di Windows (lihat catatan di proc.rs).
//   * Modul ini TIDAK PERNAH membaca isi file kredensial. Yang dibaca hanya
//     `metadata()` (ada/tidak) — token tidak boleh masuk memori Zephyr.
//   * Timeout wajib: CLI yang menunggu input akan menggantung selamanya kalau
//     tidak dibunuh.

use std::path::PathBuf;
use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::errors::{ZResult, ZephyrError};

/// Batas waktu satu pemanggilan CLI. 10 menit: cukup untuk tugas besar,
/// cukup pendek supaya CLI yang menggantung tidak menahan thread selamanya.
const RUN_TIMEOUT: Duration = Duration::from_secs(600);

/// Satu CLI AI yang dikenal Zephyr.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliAgent {
    /// id stabil (dipakai frontend sebagai kunci)
    pub id: String,
    /// nama tampil
    pub label: String,
    /// nama binary yang dicari di PATH
    pub bin: String,
    /// path lengkap kalau ditemukan
    pub path: Option<String>,
    /// true = binary ditemukan di PATH
    pub terpasang: bool,
    /// true = sesi login milik CLI ini ada (file kredensialnya ADA).
    /// Isi file TIDAK pernah dibaca — hanya keberadaannya.
    pub login: bool,
    /// argumen untuk menjalankan satu prompt non-interaktif.
    /// Kosong = CLI ini belum punya mode non-interaktif yang dikenal.
    pub prompt_args: Vec<String>,
    /// catatan singkat untuk UI (mis. "butuh login")
    pub catatan: String,
}

/// Resep per CLI: nama binary, argumen prompt, lokasi kredensial.
struct Resep {
    id: &'static str,
    label: &'static str,
    bin: &'static str,
    /// Argumen SEBELUM prompt. Prompt ditempel di akhir.
    prompt_args: &'static [&'static str],
    /// Path relatif dari HOME yang menandakan "sudah login".
    kredensial: &'static [&'static str],
}

const RESEP: &[Resep] = &[
    // CATATAN argumen (semua diuji langsung di mesin ini):
    //   * codex exec "<prompt>"          — mode non-interaktif resmi.
    //     Lambat (~2-5 menit) karena memuat sandbox + konteks repo, jadi
    //     JANGAN dipakai untuk uji cepat.
    //   * claude -p "<prompt>"           — print mode (headless).
    //   * gemini -p "<prompt>"           — headless; prompt HARUS lewat -p,
    //     tidak boleh ada positional (CLI menolak keduanya sekaligus).
    //   * opencode run "<prompt>"        — paling cepat (~1s), aman untuk uji.
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

/// Direktori home user (tempat CLI menyimpan kredensialnya).
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

/// Ekstrak target Node dari file `.cmd`/`.bat` buatan npm.
///
/// KENAPA tidak sekadar `cmd /c "<path>"`: cmd.exe punya aturan pengutipan
/// yang tidak kompatibel dengan `std::process::Command` (kutip ganda di
/// dalam kutip ganda dianggap literal, path berspasi terpecah). Dua percobaan
/// gagal membuktikannya:
///   * tanpa kutip -> "'D:\Tools' is not recognized"
///   * dengan kutip -> "The filename, directory name, or volume label syntax
///     is incorrect"
///
/// Jalan yang benar: shim npm selalu berisi baris
///   ... "node" "%dp0%\node_modules\...\cli.js" %*
/// jadi kita baca shim-nya, ambil path `.js` yang ditunjuk, lalu jalankan
/// node LANGSUNG dengan file itu. Tidak ada cmd.exe, tidak ada masalah kutip,
/// dan tidak ada jendela konsol tambahan.
///
/// Balikan: (program, argumen_awal) — mis. ("node", ["<path>/cli.js"]).
/// None = shim tidak dikenali (bukan buatan npm) -> pemanggil pakai cmd.exe.
fn baca_shim_npm(shim: &str) -> Option<(String, Vec<String>)> {
    let teks = std::fs::read_to_string(shim).ok()?;
    // Cari literal path yang diakhiri .js — itu entry point Node-nya.
    // Pola npm: "%dp0%\node_modules\...\x.js" atau "<abs>\...\x.js".
    let re = regex::Regex::new(r#""([^"]*\.js)""#).ok()?;
    let js = re.captures(&teks)?.get(1)?.as_str().to_string();

    // Ganti %dp0% (direktori shim) dengan direktori shim yang sebenarnya.
    let dir = std::path::Path::new(shim).parent()?;
    let js_abs = js
        .replace("%dp0%", &dir.to_string_lossy())
        .replace('\\', "/");
    let js_path = std::path::PathBuf::from(&js_abs);
    if !js_path.is_file() {
        return None;
    }

    // Cari `node.exe` di sebelah shim (npm menaruhnya di sana kalau ada),
    // kalau tidak ada pakai `node` dari PATH.
    let node_lokal = dir.join("node.exe");
    let program = if node_lokal.is_file() {
        node_lokal.to_string_lossy().to_string()
    } else {
        "node".to_string()
    };
    Some((program, vec![js_abs]))
}

/// Cari binary di PATH.
///
/// JEBAKAN WINDOWS: paket npm memasang TIGA file dengan nama sama —
/// `codex` (shell script tanpa ekstensi), `codex.cmd`, dan `codex.ps1`.
/// File tanpa ekstensi BUKAN program Windows; menjalankannya menghasilkan
/// "%1 is not a valid Win32 application". Karena itu di Windows yang dicari
/// hanya .exe/.cmd/.bat, dengan urutan itu (.exe menang: binary native lebih
/// cepat & tidak lewat perantara cmd.exe).
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

/// Apakah CLI ini punya sesi login? Hanya keberadaan file yang diperiksa.
fn punya_login(resep: &Resep) -> bool {
    let Some(h) = home() else { return false };
    resep.kredensial.iter().any(|rel| h.join(rel).is_file())
}

/// Deteksi semua CLI yang dikenal: terpasang di PATH? sudah login?
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

/// Hasil satu pemanggilan CLI.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CliRunResult {
    pub ok: bool,
    pub stdout: String,
    pub stderr: String,
    pub code: Option<i32>,
    /// true = dibunuh karena melewati batas waktu
    pub timeout: bool,
}

/// Jalankan satu prompt lewat CLI non-interaktif.
///
/// `cwd` opsional: kalau diisi, CLI berjalan di direktori itu (penting supaya
/// CLI melihat file proyek yang sama dengan yang dibuka di Zephyr).
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

    // Bangun perintah. Prompt ditempel sebagai argumen TERAKHIR — itu bentuk
    // yang dipakai keempat CLI ini untuk mode non-interaktif.
    //
    // URUTAN PREFERENSI di Windows:
    //   1. `.exe`  -> jalankan langsung (binary native)
    //   2. `.cmd`/`.bat` shim npm -> baca shimnya, jalankan node + file .js
    //      (cmd.exe punya aturan kutip yang tidak kompatibel dengan
    //       std::process::Command — dua percobaan gagal membuktikannya)
    //   3. `.cmd`/`.bat` lain -> cmd /c sebagai upaya terakhir
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
        // Jalur 2: shim npm dikenali -> node langsung.
        Some((prog, awal)) => (prog, awal),
        // Jalur 3: .cmd/.bat yang tidak dikenali -> cmd /c.
        None if cfg!(windows) && {
            let b = bin.to_ascii_lowercase();
            b.ends_with(".cmd") || b.ends_with(".bat")
        } =>
        {
            (
                "cmd.exe".to_string(),
                vec![
                    "/c".to_string(),
                    // Kutip ganda WAJIB: path bisa berspasi.
                    format!("\"{bin}\""),
                ],
            )
        }
        // Jalur 1: .exe atau non-Windows -> langsung.
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
            // WAJIB lewat proc::cmd — tanpa CREATE_NO_WINDOW, Windows
            // memunculkan jendela konsol sekejap tiap pemanggilan.
            let mut c = crate::proc::cmd(&program);
            c.args(&args);
            // Stdin ditutup supaya CLI tidak menunggu input user.
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
        // Setiap entri punya id & label tidak kosong.
        for a in &hasil {
            assert!(!a.id.is_empty());
            assert!(!a.label.is_empty());
            assert!(!a.bin.is_empty());
        }
    }

    /// Shim npm harus dikenali: entry point .js diekstrak, %dp0% diganti
    /// direktori shim, dan hasilnya benar-benar ada di disk.
    #[test]
    fn baca_shim_npm_mengenali_shim() {
        let dir = std::env::temp_dir().join("zephyr-shim-uji");
        let _ = std::fs::create_dir_all(&dir);
        let js = dir.join("cli.js");
        std::fs::write(&js, "// uji").expect("tulis js");
        let shim = dir.join("uji.cmd");
        // Bentuk persis seperti shim npm: node + path %dp0% + %*.
        // \r\n ditulis sebagai ESCAPE (CR literal ditolak rustc).
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

    /// File yang bukan shim npm harus ditolak (bukan panic).
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
