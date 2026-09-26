# Changelog - Zephyr

All notable changes per release. Format follows the spirit of
[Keep a Changelog](https://keepachangelog.com/); versions use SemVer.

## [1.1.11] - 2026-09-26

### AI
- Parse tool calls that arrive as inline XML (DSML, `<tool_calls>`,
  `<antml:invoke>`), not just the native `tool_calls` field, so gateway and
  DeepSeek-style models run tools instead of printing raw tags.
- Summarize the workspace before the first turn: detected stack, entry points,
  top-level layout, and a short source file list. Build and cache directories
  are excluded.
- Read every project rules file (`AGENTS.md`, `CLAUDE.md`, `ZEPHYR.md`,
  `.cursorrules`) instead of only the first one found.
- Give each agent turn a status block with plan, step number, recent results,
  and failed calls, so the model does not repeat a failed call.
- On a failed tool call, return guidance to try a different approach.
- Include the active editor file as agent context.
- Show a banner, with a link to settings, when the provider has no API key.
- Remember the Chat/Agent choice across restarts.
- Add a 90-second idle watchdog to the subagent runner.
- Fix `file_edit` so it replaces every occurrence and treats `$` sequences in
  the replacement as literal text.

### Interface
- Add a startup splash that shows immediately, closing when React mounts.
- Start the browser pane with no URL, showing a prompt instead of a likely
  refused `localhost:3000` that looked like a black, broken pane.
- Add tooltips that explain the Chat and Agent buttons.

### Git
- Blame the active file into the Output panel (hash, author, summary per line).
- Stash save, list, pop, and drop.
- Conflict resolver with take-ours and take-theirs.
- Rebase onto a branch.
- Write a commit message from the diff with one click.

### MCP server
- Wait for the front end to attach its listener and retry, instead of losing a
  call made during startup.
- Remove UI work from `/health`, so an unauthenticated local caller cannot stall
  agent calls.
- Clear pending requests on every failure path.

### Fixed
- Write settings files atomically to prevent truncated JSON after an interrupted
  write.
- Stop a panic on paths that contain non-ASCII characters.
- Reject an extension id such as `C:evil` that could resolve outside the
  extensions directory.
- Fail a subagent with a clear timeout instead of hanging forever.

## [1.0.0] - 2026-09-03

First release. A Windows desktop code editor built from scratch (not a VS Code
fork): Tauri 2 + React 18 + TypeScript, CodeMirror 6 for the editor, xterm.js +
ConPTY for the terminal, and a Rust backend for all heavy operations.

### Editor
- Multi-file tabs, open/save, Save As, drag-reorder tabs, session restore.
- Automatic encoding detection: UTF-8, UTF-8 BOM, Windows-1252, UTF-16 LE/BE.
  UTF-16 files open read-only with a "Save as UTF-8" button.
- Files >4MB drop into a lightweight read-only mode (no parser or heavy
  extensions) so the UI does not freeze.
- Find & Replace inside the editor: regex, case-sensitive, match count, capped
  at 20,000 steps so patterns like `a*` do not hang the UI.
- Ctrl+S on a file that vanished from disk asks "create new?" instead of
  silently recreating it.
- Language detection for 21 file types, breadcrumbs, Ln/Col & encoding
  indicators.

### Explorer & Search
- File tree with lazy-load, rename/delete/create, multi-select, context menu.
- External-change watcher: the tree refreshes, non-dirty tabs reload.
- Cross-file search with glob, regex, and replace-in-file.
- Quick Open (Ctrl+P) with fuzzy search.

### Terminal
- Multi-pane up to 6 panes per tab: shell, cmd, PowerShell 7, bash, WSL.
- Private Terminal: PSReadLine `SaveNothing` + cleared `HISTFILE`/`HISTSIZE`
  for POSIX shells; scrollback discarded when the pane closes.
- AI Agent Terminal: opencode, Claude Code, Codex CLI, Gemini CLI, GitHub
  Copilot CLI, Grok, Pi - the start command is configurable in Settings.
- Browser pane + "Split With Browser", with an X-Frame-Options header check in
  Rust so the real embed failure reason is shown.
- Copy/paste through the clipboard plugin (paste split into 4KB chunks to avoid
  corruption), Ctrl+C that stops the program without killing Zephyr, and the
  process exit code shown as `[process exited code N]`.

### Source Control
- Status, diff, stage/unstage, commit, discard, branch (create/checkout/delete),
  push/pull/fetch/sync, log.
- Binary file diffs labeled with their size, not raw bytes.
- Pushing when the remote is ahead offers "pull first" instead of a raw git
  error.
- GitHub login: OAuth device flow or PAT; the token is stored encrypted.

### AI Panel
- Streaming chat with three adapter formats: OpenAI, Anthropic, Gemini.
- Model catalog with logos (Gemini, Claude, GPT, DeepSeek, Grok, etc.); the API
  key per provider is stored in Rust and never sent to the frontend.
- Attach the active file (max 12KB), run code blocks in the terminal with
  confirmation for risky commands, clean streaming cancel.
- Messages >8KB are truncated with a visible note.

### MCP Server (port 9222)
- HTTP JSON-RPC server with Bearer token auth; external AI CLIs can read and
  drive the Zephyr window.
- 20+ methods: list_panes, terminal_write/key, editor_open/write/insert/close,
  pane_new/close, run_command, get_settings, set_setting, screenshot_pane, etc.
- `editor_write` ONLY changes the buffer, never writes to disk.
- Payload limits: 1MB for the editor, 64KB for the terminal.
- Writes configuration automatically to Claude Code, Codex, Gemini CLI,
  opencode, Copilot CLI, Cursor, and `.mcp.json` startup.

### Settings
- 11 sections: General, Code Editor, Theme, Shortcuts, Models, Agents,
  Extensions, Source Control, MCP, SSH, About.
- Shortcuts can be remapped with a key recorder and conflict detection.
- RAM saver mode: smooth scroll off, minimap forced off, loaded tab limit 8.
- UI language Indonesian/English, zoom 50–200%, theme follows the system.

### Themes & Extensions
- 6 themes: Zephyr Dark, Zephyr Light, Nord, Tokyo Night, Gruvbox, One Dark Pro.
  The whole UI + editor + ANSI terminal share a single CSS token source.
- Extensions v1 are manifest-only: `contributes.commands` is registered in the
  Command Palette. Extension JS code is NOT executed - a security decision, not
  a limitation.

### Command Palette
- Ctrl+Shift+P for commands, Ctrl+P for files; results are virtualized so 5,000
  files stay light.

### Diagnostics & reliability
- Diagnostics panel: OS, CPU, machine RAM, process RAM + WebView2, uptime, MCP
  port, log file, per-domain status, perf markers, operation counters.
- Quick self-test: write/read a file, resolve the shell, `git --version`, MCP
  socket, write a log - all actually executed.
- Export a JSON report (no secrets) and open the log folder.
- `tracing` logging to `%APPDATA%\zephyr\logs` with 2MB rotation, a panic hook +
  crash dialog, and frontend errors recorded too.
- A corrupt `settings.json` is moved to `.broken-<timestamp>` and defaults are
  used - user settings are never silently lost.
- Windows paths >260 characters supported via the `\\?\` prefix.
- Opening a drive root (`C:\`) as a workspace is rejected with an explanation.

### Auto-update
- Full scaffolding (updater plugin, `.msi.zip` + `.sig` artifacts, UI in
  Settings → About). The release endpoint is not filled in yet; the button
  shows "Update not configured" and the app keeps running normally.

### Not yet in 1.0.0
- SSH remote (phase 07) - postponed pending a test host.
- IntelliSense/LSP, debugger, tasks, minimap, ripgrep global search, local
  history, notification center, menu bar, bottom panel. All are planned to
  arrive through auto-update.
