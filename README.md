<div align="center">
  <img src="docs/zephyr-logo.svg" width="128" height="128" alt="Zephyr" />
  <h1>Zephyr</h1>

  <p><strong>A lightweight code editor that AI CLIs can drive.</strong></p>
  <p>
    <a href="https://github.com/ShinRyu04/Zephyr/releases/latest">Download</a>
    ·
    <a href="SECURITY.md">Security</a>
    ·
    <a href="CHANGELOG.md">Changelog</a>
  </p>

  <p>
    <img src="https://img.shields.io/github/v/release/ShinRyu04/Zephyr?label=version&color=blue" alt="version" />
    <img src="https://img.shields.io/badge/platform-Windows-lightgrey" alt="platform" />
    <img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="license" />
  </p>
</div>

Zephyr is a Windows desktop code editor built on Tauri 2 + Rust and React 18. There is no bundled browser runtime: it renders with WebView2, which already ships with Windows. The editor is CodeMirror 6, the terminal is xterm.js over ConPTY, and an MCP server on port 9222 lets Claude Code, Codex, Gemini CLI, or opencode read and drive the window. Around 9.5 MB on disk. No telemetry. No account.

## Screenshots

<table>
  <tr>
    <td align="center"><img src="docs/screenshots/01-editor.png" alt="Editor and terminal" /><br/><sub>Editor, file tree, and a terminal with TypeScript and git</sub></td>
    <td align="center"><img src="docs/screenshots/02-source-control.png" alt="Source control" /><br/><sub>Source control with unstaged changes and inline diff</sub></td>
  </tr>
  <tr>
    <td colspan="2" align="center"><img src="docs/screenshots/03-palette.png" alt="Command palette" /><br/><sub>Command palette filtering the command list</sub></td>
  </tr>
</table>

## Features

### Editor

- CodeMirror 6 with multi-file tabs, session restore, and split groups
- Encoding detection: UTF-8, BOM, Windows-1252, UTF-16 LE/BE
- Files over 4 MB open in a light read-only mode instead of freezing the UI
- Find and replace with regex and a step cap, plus multiple cursors and code actions
- Per-language LSP: completion, hover, go-to-definition, diagnostics, rename, format
- Debugging over DAP with breakpoints, stepping, watch, and call stack
- Rendered Markdown, and image, PDF, and SVG preview

### Terminal

- Up to 6 panes per tab through ConPTY: PowerShell, cmd, pwsh, bash, WSL
- Private Terminal whose scrollback is wiped on close
- A dedicated pane for an AI agent CLI (opencode, Claude Code, Codex, Gemini, Copilot)
- Browser pane through "Split With Browser", reading the real page rather than an iframe

### Source control

- Status, diff, stage, unstage, commit, discard, branch, and log
- Push, pull, fetch, and sync, with a pull-first prompt when the remote is ahead
- Binary diffs labeled with their size, not raw bytes
- GitHub login through the OAuth device flow or a PAT

### AI

- Streaming chat with three adapter formats: OpenAI, Anthropic, and Gemini
- Model catalog with logos; keys stay on the Rust side, the UI only sees a masked preview
- Local and custom providers, including Ollama and any OpenAI-compatible endpoint
- Subagents run in parallel from their own tab, each with a role, step log, and cancel
- Optional local RAG that feeds top project chunks to the model as context

### MCP server (port 9222)

- HTTP JSON-RPC with a Bearer token, loopback only, and can be turned off
- More than 20 methods to read panes, write the terminal, and edit buffers
- `editor_write` changes the buffer only and never writes to disk
- One click to register Zephyr with Claude Code, Codex, Gemini CLI, opencode, and more

### Customization

- 19 themes, including a High Contrast theme that passes WCAG AAA
- Background image for the editor, stored separately from the theme
- Customize Layout panel for the menu bar, activity bar, sidebar, panel, and status bar
- 16-section settings page with remappable shortcuts and conflict detection
- UI available in 10 languages, defaulting to English

## Install

Download the latest installer from the [Releases](https://github.com/ShinRyu04/Zephyr/releases/latest) page and run it. If SmartScreen appears, choose **More info** then **Run anyway**; the build is not signed with a paid certificate, and the source is open to inspect. Zephyr auto-updates from Releases.

Requirements: **Windows 10 or 11**. WebView2 is already present on Windows 11. Settings, keys, extensions, and logs live in `%APPDATA%\zephyr\`; delete that folder for a full reset.

## Configure AI

1. Open **Settings → Models**.
2. Pick a provider and paste your API key, or choose **Local** / **Custom** and set the base URL (for Ollama, `http://127.0.0.1:11434/v1`).
3. Keys are stored on the Rust side and are never sent to the frontend.

## Build from source

**Prerequisites:** Rust stable, Node 20 or newer, and the WebView2 Runtime.

```bash
npm install
npm run tauri dev        # development
npm run tauri build      # MSI + NSIS in src-tauri/target/release/bundle/
```

**Checks**

```bash
npx tsc --noEmit
cd src-tauri && cargo test --lib
npm run verify           # CDP verification harnesses in scripts/verify*.mjs
```

## Tech stack

Tauri 2, Rust, `portable-pty`, React 18, TypeScript, Vite, CodeMirror 6, xterm.js, Zustand, axum.

## Contributing

Issues and pull requests are welcome. Bug reports are most useful with the diagnostics report from **Settings → About** (no secrets are included).

## License

Zephyr is licensed under the Apache-2.0 License. See [LICENSE](LICENSE).
