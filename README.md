<div align="center">

<img src="docs/zephyr-logo.svg" width="112" alt="Logo Zephyr" />

# Zephyr

**Code faster. Lighter. Yours.**

A desktop code editor for Windows, built from scratch with Tauri 2 + React +
Rust. Not a VS Code fork, not Electron.

`v1.1.10` · Tauri 2 · React 18 · TypeScript · Rust

</div>

![Zephyr — editor, explorer, and terminal](docs/screenshots/01-editor.png)

## Why this exists

I wanted an editor that feels like VS Code but does not drag along its own
browser runtime, and that the AI CLIs I already use every day can drive
directly. Zephyr does both: one Rust process, the WebView2 that ships with
Windows as the renderer, and an MCP server on port 9222 so Claude Code, Codex,
Gemini CLI, or opencode can read and change what is in the window.

The NSIS installer is 3.8 MB, the MSI is 5.2 MB, and the app binary itself
is 9.5 MB. For comparison, an Electron-based editor installer is usually
80–120 MB.

## Install

You need **Windows 10/11** (WebView2 Runtime ships with Windows 11, so it
usually runs with nothing extra to install).

### Installing Zephyr (3 steps)

1. **Download the installer** — `Zephyr_1.1.10_x64-setup.exe` (or the `.msi`)
   from the [Releases](https://github.com/ShinRyu04/Zephyr/releases) page. Look
   for the file named `Zephyr_1.1.10_x64-setup.exe`. That is the installer.
2. **Run the installer** — if SmartScreen shows up, click **More info → Run
   anyway**. This is normal for a build without an EV certificate. It does not
   mean the file is harmful. The source is open and can be checked.
3. **Done** — Zephyr opens. In the left sidebar click **Open Folder** for a
   project, or **Open File** for a single file.

Nothing else needs installing. Rust, Node, and WebView2 are handled by the
installer. Data and settings live in `%APPDATA%\zephyr\`.

### Installing extensions (2 ways)

**From the Marketplace:**
1. Open the **Extensions** panel (the grid icon in the left sidebar, or
   `Ctrl+Shift+X`).
2. Go to the **Marketplace** tab → type the extension name in the search box →
   click **Install** on the one you want.
3. Zephyr downloads the `.vsix` straight from **Open VSX**, so public VS Code
   extensions listed there are available too.

**From a manual `.vsix` file:**
1. Download the `.vsix` from anywhere (an extension release page, Open VSX,
   etc.).
2. In the Extensions panel, click the **⋯** button (top-right of the header) →
   **Install from .vsix…** → pick the file.
3. Done. The extension shows up in the **Installed** tab and can be turned on
   and off.

> **Worth knowing about extensions:** extension JS runs in an **isolated
> sandbox Web Worker**. It cannot touch `window`, load system modules, or
> reach the filesystem. Commands from extensions still register in the Command
> Palette; themes, snippets, keymaps, and languages keep working. Extensions
> that need an outside runtime (Python, Java, Docker, etc.) cannot run fully
> because the sandbox is cut off from the system on purpose.

### Using SSH to reach a server/VPS

1. Open **Settings → SSH** (or the terminal panel → Connect SSH dropdown).
2. Click **+ Add host**. Fill in the name, host (IP/domain), port (default 22),
   user, and auth method (SSH key or password).
3. Click **Connect**. A terminal pane opens connected to the server. Type your
   password/passphrase right in the pane when asked.
4. To disconnect: click **X** in the pane header, or right-click the pane →
   **Disconnect**.

Data and settings sit in `%APPDATA%\zephyr\`. Delete that folder for a full
reset.

![Settings → SSH: manage hosts and open sessions as terminal panes](docs/screenshots/04-ssh.png)

## What is inside

**Editor** — CodeMirror 6. Multi-file tabs, encoding detection (UTF-8, BOM,
Windows-1252, UTF-16), files over 4 MB open in a light read-only mode, find &
replace with regex plus a step cap so catastrophic patterns cannot hang the UI.
Snippets use the VS Code format as-is, so old snippet files copy over directly.

**Terminal** — up to 6 panes per tab through ConPTY: PowerShell, cmd, pwsh,
bash, WSL. There is a Private Terminal whose scrollback is wiped when closed, a
dedicated AI agent CLI pane, and a browser pane via "Split With Browser".

**SSH** — keep a host list (name, host, port, user, key/password auth) in
Settings → SSH, then open each connection as a plain terminal pane. Passwords
are stored only if you pick "save", and even then encrypted (XOR+BLAKE3) in
`ssh.json`, not plaintext.

**Source Control** — status, diff, stage, commit, branch, push/pull/sync, log.
Binary file diffs get a label instead of dumping raw bytes. Pushing when the
remote moved ahead offers a pull first instead of failing quietly.

![Source Control with real changes](docs/screenshots/02-source-control.png)

**Language intelligence** — per-language LSP: completion, hover,
go-to-definition, diagnostics, rename. Debugging through DAP (js-debug) with
breakpoints, stepping, watch, and call stack.

**AI Panel** — streaming chat with three adapters (OpenAI, Anthropic, Gemini),
a model catalog with logos (oldest release through newest). API keys stay on
the Rust side; the frontend only sees `hasKey` and a masked version. Custom and
local AI work too: **Settings → Model AI**, pick **Lokal** or **Custom**, fill
in the base URL (for Ollama: `http://127.0.0.1:11434/v1`), type the model name
or pick it from the ▾ dropdown (the **Refresh** button pulls the model list
straight from the provider). Custom models show up in the AI panel dropdown,
not only in the AI terminal. Replies can be **regenerated** ([↻]) or **copied** ([⧉])
from the bubble, and an optional **local RAG** (Settings → Model AI → Local RAG)
searches the whole project through a local server (e.g. enowx-rag + Qdrant +
Ollama) and feeds the top chunks to the model as context.

**AI panel: parallel subagents, effort control, visible reasoning** — ask for
several jobs at once and they run **in parallel**, each with its own name
(Comet, Odyssey, Nova…), live step log, and per-agent cancel. Up to 4 run
together; each is capped at 15 steps and is **read-only by design** (two agents
writing the same file is a data race, not a feature). A **Reasoning** dropdown
sets how hard the model thinks — `minimal / low / medium / high / ultra` — mapped
per provider (OpenAI `reasoning_effort`, Anthropic `thinking.budget_tokens`,
Gemini `thinkingConfig.thinkingBudget`), and the model's thinking streams into a
collapsible **Reasoned** block instead of being thrown away.

![Parallel subagents with live steps](docs/screenshots/06-subagent-paralel.png)

**API client** — a Postman-style workspace in a panel tab: collections, saved
requests, environments with `{{variables}}`, and a response viewer with status,
timing, headers, and body. Collections live in Zephyr's data folder, not in your
repo. (For requests you want versioned with the code, `.http` files still work —
same engine.)

![API client with collections and environments](docs/screenshots/07-api-client.png)

**Dev Environment** — run PHP, Nginx, MariaDB, and Redis from `D:\DevEnv\`
without installing a XAMPP-style bundle. Every service can have **multiple
versions side by side** (PHP 8.3.33 and 8.1.34 both work), and you pick which one
to start. Ports already in use are **refused, never stolen**; services stop when
Zephyr closes.

![Dev Environment with multiple PHP versions](docs/screenshots/08-devenv.png)

**Database browser** — open a SQLite file and browse tables/views, run `SELECT`
queries, and see results in a grid. The connection is **read-only** unless you
explicitly flip the write toggle, so browsing a database your app is using cannot
lock or corrupt it. Rows are capped per query so a `SELECT *` on a huge table
cannot freeze the UI.

![SQLite browser with a live query](docs/screenshots/09-database.png)

**Cloudflare Tunnel** — expose a local port to the internet in one click
(`cloudflared` is downloaded to `D:\DevEnvin`). A permanent warning banner
stays visible while a tunnel is up, and every tunnel is killed when Zephyr exits —
a leftover tunnel means your localhost is open to the internet with nobody
watching.

**Test Explorer** — detects the test runner from your project files
(`package.json`, `Cargo.toml`, `go.mod`, `pytest`, `composer.json`, `Makefile`,
plus `npm run verify/soak/stress/lint`) and runs it from a panel tab. It only
offers runners that actually exist: if your `package.json` has no `scripts.test`,
no `npm test` button appears.

![Test Explorer detecting real runners](docs/screenshots/10-test-explorer.png)

**SFTP + port forwarding** — browse a remote host's files, download and delete
them, and open port tunnels (`ssh -L` local, `-R` remote, `-D` SOCKS) from the
same panel. Tunnels are cleaned up on exit; a port that is already taken is
refused rather than hijacked.

![Cloudflare Tunnel with the exposure warning](docs/screenshots/11-tunnel.png)

![SFTP explorer and port tunnels](docs/screenshots/12-sftp.png)

**Customize Layout** — one panel (the layout button in the title bar, or
`View: Customize Layout`) gathers every visibility control in one place:
**Menu Bar, Activity Bar, Primary Side Bar, Panel, Status Bar**, side bar
position (left/right), layout density (default/compact), and Zen Mode. Each row
shows its current state, and a reset button puts everything back. Your choices
are saved, so the layout you set is the layout you get next time. The AI panel
has its own hide button too — closing it from inside the panel, the way the VS
Code chat panel works.

![Customize Layout panel](docs/screenshots/14-customize-layout.png)

**Zen mode, image preview** — `View: Toggle Zen Mode` (or the command palette)
hides the Activity Bar, sidebar, panel, and status bar so only the editor is
left. Opening a `.png/.jpg/.gif/.webp/.bmp/.ico/.avif/.svg` shows a real preview
with zoom and a checkerboard for transparency, instead of dumping binary into
the editor.

![AI panel with its own hide button](docs/screenshots/15-panel-ai-hide.png)

![Compact layout density](docs/screenshots/16-layout-compact.png)

![Zen mode: editor only](docs/screenshots/13-zen-mode.png)

**CLI subcommands** — `zephyr ext list`, `zephyr ext remove <id>`,
`zephyr ext registry [url]`, and `zephyr info` work without opening a window, so
Zephyr can be driven from scripts and CI.

**Portable mode** — drop a file named `portable` next to `zephyr.exe` and all
data (settings, keys, extensions, logs) moves to a `data/` folder beside the
executable. Zephyr then runs from a USB stick and leaves nothing on the host
machine. `zephyr info` tells you which mode is active.

**MCP Server :9222** — HTTP JSON-RPC with a Bearer token. 20+ methods to read
panes, write to the terminal, open and change editor buffers, and run command
palette commands. `editor_write` only touches the buffer, never the disk, so a
misbehaving AI cannot wreck a file without you saving it.

**Command palette** — two modes in one modal: `Ctrl+Shift+P` for commands,
`Ctrl+P` for files. Matching runs in layers: prefix, word start, substring,
then subsequence.

![Command palette](docs/screenshots/03-palette.png)

**GitHub login** — sign in with your GitHub account through the device flow
(browser), show up as an avatar in the bottom-left corner, push and pull
without credential hassle. Clicking the avatar opens an account menu (name,
sign out, manage token) instead of jumping straight into a login flow.

**Split editor** — split the editor into two groups (View → Split Editor Right,
`Ctrl+\`), each group with its own tab bar, merge back any time.

**Extensions & Marketplace** — find and install extensions from Open VSX right
in the Extensions panel, with real logos, download counts, ratings, and
category filters; or install a manual `.vsix` from a folder.

![Extension marketplace with real logos](docs/screenshots/05-market.png)

**Update notifications** — Zephyr can check for new releases from inside the
app (Settings → Tentang → Check update) and install them itself. Turn on
"Check for updates automatically" in Settings → General: each time the app
opens, Zephyr checks on its own and a bell notification appears when a new
version exists. Clicking "Lihat & pasang" finishes it. A notice confirms the
finished update, after restart a "Zephyr updated to vX" banner shows the
release notes, and bug/news info comes through the Notification Center (the
bell in the status bar).

**Full menu bar** — File / Edit / Selection / View / Go / Run / Terminal /
Help all work: undo-redo, cut-copy-paste, comments, multi-cursor selection,
breadcrumbs/minimap/sticky scroll toggles, theme switching, jumping between
errors, tab history (Go → Back/Forward), reopening closed editors, opening new
windows, and quitting. Every item is also in the Command Palette
(`Ctrl+Shift+P`).

**Donations** — Zephyr is free. If you like it, a **☕ Support** button sits in
the bottom status bar (right side) and in **Settings → About**, opening a
choice of **Trakteer** (`trakteer.id/ryuga-9jfin`) or **Saweria**
(`saweria.co/ShinRyuga04`). It is also under **Help → Support** or in
the Command Palette (type "donate").

**Agent skills, memory, and scheduled tasks** — the AI panel is not just chat.
The agent can save a reusable procedure as a `SKILL.md` and read it back in a
later session; it keeps notes about your environment in `memory.md` and facts
about you in `user.md`, both injected into every conversation with a hard
character budget; and it can schedule recurring work (`cron_create`) that a
background timer hands back to the panel when due. All three live under
`%APPDATA%\zephyr\` as plain files you can edit by hand.

**The rest** — global search through ripgrep, a tasks runner with problem
matchers, local history + timeline, multi-root workspaces with workspace trust,
7 themes (+ Senja), a CLI launcher (`zephyr .`, `--diff`, `--wait`), and a
14-section Settings page with remappable shortcuts plus conflict detection.

## Accessibility

Not a bolt-on. The last phase was entirely about this:

- WCAG AA contrast for text in **7 themes**. 29 tokens moved until they passed,
  checked by `scripts/a11y-kontras.mjs`, which measures final hex values, not
  floats.
- The **High Contrast** theme passes AAA: 23/23 color pairs, main text at 21:1.
- Keyboard-only: focus traps in every modal dialog, a skip link as the first
  focusable element, a two-layer focus ring through `:focus-visible`.
- Screen readers: one live region for the whole app, `screenReaderMode` in
  xterm, and accessible names for the CodeMirror editor area.
- `prefers-reduced-motion` is respected, plus a separate in-app setting.
- axe-core runs against the live document in WebView2. 0 violations.

## Honest state

Marketplace extensions run in an **isolated sandbox Web Worker**: their JS runs
(commands show up in the palette) but cannot touch `window`, system modules
(`fs`, `child_process`, etc.), or Zephyr IPC. Extensions that need an outside
runtime (Python, Java, Docker, etc.) still cannot run fully. That is the
sandbox doing its job, not a bug.

Installers carry a Zephyr minisign key (the app checks it during auto-update),
but that is not a CA-issued code-signing certificate, so SmartScreen can still
warn on first run.

In-app auto-update works: the "Check update" button in Settings → Tentang
checks GitHub Releases and installs the new version from inside the app. Update
artifacts carry the Zephyr minisign key; old versions find new ones through
`latest.json`.

`zephyr ext install <id>` from the CLI prints what to do but does not install
by itself — installation needs the signature check and runtime validation that
only exist inside the app, and two install paths that can disagree is worse than
one.

Dev Environment runs the services you point it at, but it is not a managed
stack: there is no auto-start on login, no service health dashboard, and MySQL/
PostgreSQL browsing (as opposed to SQLite) is not in yet — only SQLite is opened
directly, since it is a file rather than a server.

API keys are stored with XOR + a BLAKE3 key from the MachineGuid. That is
**obfuscation, not encryption**. Enough to stop a key from being read at a
glance, not enough against someone who already holds your Windows account. See
[SECURITY.md](SECURITY.md).

## Build from source

```bash
npm install
npm run tauri dev          # dev mode
npm run tauri build        # MSI + NSIS in src-tauri/target/release/bundle/
```

Needs Rust stable, Node 20+, and the WebView2 Runtime (already on Windows 11).

## Verification

Verification is never "assumed to pass". Every phase is proven against the live
DOM and state through the Chrome DevTools Protocol:

```bash
npm run dev                # terminal 1

# terminal 2 — app with the WebView2 debug port
cd src-tauri
WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9223" \
  ./target/debug/zephyr.exe

npm run verify:31          # terminal 3
```

Harnesses live in `scripts/verify*.mjs`. Rust unit tests: `cd src-tauri &&
cargo test --lib` (148 tests). The screenshots in this README also come from
the live app through `scripts/shot.mjs`, not mockups.

## License

Not licensed. All rights stay with the repository owner.
