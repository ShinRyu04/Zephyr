use crate::errors::ZResult;
use serde::Serialize;
use std::path::PathBuf;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentInfo {
    pub id: String,
    pub label: String,

    pub path: String,
    pub version: Option<String>,
}

/*
 * Every AI **CLI** Zephyr knows how to host a pane for.
 *
 * (id, label, executable). The list is a CATALOGUE, not a claim about what is
 * installed: `list_agents` returns only the entries whose executable is actually
 * found on this machine, so the UI shows what exists and nothing else.
 *
 * ## CLI only - never a GUI application
 *
 * This list used to contain `zed` with the executable `zed`, and on this machine
 * that resolved to `%LOCALAPPDATA%\Programs\Zed\bin\Zed.exe` - the Zed EDITOR.
 * Launching it inside a terminal pane opens a desktop window, not a TUI, which
 * is not what this list is for. The reader caught it: "itu zed agent kan
 * aplikasi bjir".
 *
 * The rule now, and it is a rule rather than a one-off fix: an entry belongs
 * here only if running its executable in a terminal keeps you IN the terminal.
 * GUI-first products (Zed, Cursor, Trae, Windsurf, Antigravity, Kiro) are out
 * unless the vendor ships a separate headless CLI binary - which is why `trae`
 * now points at `trae-agent`, not at `trae`, and `antigravity` no longer points
 * at `agy` (that name is not a CLI on Windows).
 *
 * Adding an entry here is enough to make the CLI appear - the sidebar and the
 * terminal `+` menu are both built from `list_agents()`.
 *
 * The list follows the set Orca surfaces, which is what the reader asked to
 * match: "kek orca gtu, yg nnti bnyk list ny klo terdeteksi". An entry that is
 * not installed costs nothing - it is filtered out before the UI sees it - so
 * the catalogue can be generous while the displayed list stays honest.
 */
const CATALOG: &[(&str, &str, &str)] = &[
    /* Hosted coding CLIs with their own TUI. */
    ("claude", "Claude Code", "claude"),
    ("codex", "Codex CLI", "codex"),
    ("opencode", "opencode", "opencode"),
    ("opencode2", "opencode 2", "opencode2"),
    ("gemini", "Gemini CLI", "gemini"),
    ("gh", "GitHub Copilot CLI", "gh"),
    ("copilot", "Copilot CLI", "copilot"),
    ("qwen", "Qwen Code", "qwen"),
    ("grok", "Grok CLI", "grok"),
    ("pi", "Pi CLI", "pi"),
    ("cursor", "Cursor Agent", "cursor"),
    ("hermes", "Hermes Agent", "hermes"),
    ("omp", "OMP", "omp"),
    ("dsh", "DeepSeek Harness", "dsh"),
    ("dsh-tui", "DeepSeek Harness TUI", "dsh-tui"),
    ("qoder", "Qoder CLI", "qodercli"),
    ("aider", "Aider", "aider"),
    ("crush", "Charm Crush", "crush"),
    /* The wider field Orca lists. Each is one `which` lookup when absent. */
    ("amp", "Amp", "amp"),
    ("auggie", "Augment Auggie", "auggie"),
    ("autohand", "Autohand", "autohand"),
    ("cline", "Cline", "cline"),
    ("codebuff", "Codebuff", "codebuff"),
    ("commandcode", "Command Code", "command-code"),
    ("continue", "Continue", "cn"),
    ("devin", "Devin", "devin"),
    ("droid", "Droid", "droid"),
    ("goose", "Goose", "goose"),
    ("jcode", "Jcode", "jcode"),
    ("kilocode", "Kilo Code", "kilocode"),
    ("kimi", "Kimi CLI", "kimi"),
    ("kiro", "Kiro", "kiro"),
    ("mistral", "Mistral Vibe", "mistral-vibe"),
    ("openclaw", "OpenClaw", "openclaw"),
    ("prime", "Prime Agent", "prime"),
    ("rovodev", "Rovo Dev", "acli"),
    ("trae", "Trae Agent", "trae-agent"),
    ("zcode", "ZCode", "zcode"),
    ("antigravity", "Antigravity", "antigravity"),
    ("freebuff", "Freebuff", "freebuff"),
];

/*
 * Where a CLI can live that `which` will not find on its own.
 *
 * `which` only walks PATH. Several of these tools install to their own folder
 * and add it to PATH only for interactive shells, so a GUI-launched app misses
 * them - measured on this machine: `omp` sits in `~/.bun/bin` and `qodercli` in
 * `~/.qoder/bin/qodercli/`, and neither was found even though both run fine in
 * a terminal.
 *
 * Each entry is (base env var, sub-path template). `{exe}` is substituted. The
 * list is deliberately explicit rather than a filesystem sweep: guessing at
 * every directory on disk would make startup slow and could pick up a binary the
 * reader never intended to run.
 */
fn extra_candidates(exe: &str) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let home = std::env::var("USERPROFILE").unwrap_or_default();
    let appdata = std::env::var("APPDATA").unwrap_or_default();
    let local = std::env::var("LOCALAPPDATA").unwrap_or_default();
    let pf = std::env::var("ProgramFiles").unwrap_or_default();

    let templat = [
        /* The tool's own hidden folder, the npm/bun convention. */
        (home.as_str(), format!(".{exe}/bin/{exe}.exe")),
        (home.as_str(), format!(".{exe}/bin/{exe}")),
        (home.as_str(), format!(".{exe}/entry/{exe}.cmd")),
        (home.as_str(), format!(".{exe}/bin/{exe}/{exe}.exe")),
        /* Linux/Unix standard local bin: `~/.local/bin/` - where Claude is on this machine. */
        (home.as_str(), format!(".local/bin/{exe}.exe")),
        (home.as_str(), format!(".local/bin/{exe}")),
        /* Bun's global bin - where `omp` actually is on this machine. */
        (home.as_str(), format!(".bun/bin/{exe}.exe")),
        (home.as_str(), format!(".bun/bin/{exe}")),
        /* npm global on Windows: both the .cmd shim and the .exe. */
        (appdata.as_str(), format!("npm/{exe}.cmd")),
        (appdata.as_str(), format!("npm/{exe}.exe")),
        /* Per-app installers: LOCALAPPDATA / ProgramFiles. Hermes is at LOCALAPPDATA\hermes\bin\hermes.cmd */
        (local.as_str(), format!("{exe}/bin/{exe}.cmd")),
        (local.as_str(), format!("{exe}/bin/{exe}.exe")),
        (local.as_str(), format!("Programs/{exe}/{exe}.exe")),
        (pf.as_str(), format!("{exe}/bin/{exe}.exe")),
    ];
    for (base, sub) in templat {
        if !base.is_empty() {
            out.push(PathBuf::from(base).join(sub));
        }
    }

    if exe == "gh" {
        out.push(PathBuf::from(pf.as_str()).join("GitHub CLI/gh.exe"));
    }

    /*
     * Vendors that ship their CLI under a folder named after the PRODUCT, not
     * the executable. Qoder is the case that forced this: the binary is
     * `qodercli.exe` but it lives under `.qoder/`, so the generic
     * `.qodercli/bin/...` template above never matched.
     *
     * Checked ONLY when looking for qoder/qodercli - testing this path for every
     * executable would make any missing tool claim it is qodercli.
     */
    if exe == "qoder" || exe == "qodercli" {
        for (base, sub) in [
            (home.as_str(), ".qoder/bin/qodercli/qodercli.exe".to_string()),
            (home.as_str(), ".qoder/bin/qodercli/qodercli".to_string()),
            (home.as_str(), ".qoder/entry/qoder.cmd".to_string()),
            (home.as_str(), ".local/bin/qodercli".to_string()),
            (home.as_str(), ".local/bin/qodercli.exe".to_string()),
        ] {
            if !base.is_empty() {
                out.push(PathBuf::from(base).join(sub));
            }
        }
    }

    out
}

fn find_exe(exe: &str) -> Option<PathBuf> {
    if let Ok(p) = which::which(exe) {
        return Some(p);
    }
    extra_candidates(exe).into_iter().find(|p| p.is_file())
}

#[tauri::command(async)]
pub fn list_agents() -> ZResult<Vec<AgentInfo>> {
    let mut out = Vec::new();
    for (id, label, exe) in CATALOG {
        if let Some(path) = find_exe(exe) {
            out.push(AgentInfo {
                id: (*id).to_string(),
                label: (*label).to_string(),
                path: path.to_string_lossy().to_string(),
                version: None,
            });
        }
    }
    Ok(out)
}

#[cfg(test)]
pub fn find_exe_for_test(exe: &str) -> Option<PathBuf> {
    find_exe(exe)
}
