# Changelog - Zephyr

All notable changes per release. Format follows the spirit of
[Keep a Changelog](https://keepachangelog.com/); versions use SemVer.

## [Unreleased]

### Security
- The write-tool deny-list existed in three drifting copies (13, 4 and 4
  entries). It is now one exported `TOOL_TULIS` set of **32** members in
  `agentTools.ts`, imported by `subagentStore.ts`; a read-only subagent can no
  longer be offered `shell_exec`, `terminal_exec`, `terminal_kill`,
  `pane_control`, `skill_write`, `skill_delete`, `memory_write`, `cron_create`,
  `cron_delete`, `todo_write`, `mcp_call`, `ssh` or the four `browser_*` tools.
  `browser_read` and `web_search` stay allowed because they only fetch.
  `focus_pane`, `open_file` and `workspace` were added too: none of them touch
  the disk, but they steal focus, add tabs and redirect where later writes land,
  so a read-only caller has no business reaching them;
- A custom sub-agent definition could name `shell_exec` in its allowlist and
  thereby hand an executing tool to a caller with the write flag off. The
  allowlist and the read-only gate now INTERSECT instead of the allowlist
  short-circuiting the deny-list;
- `read-only` mode now refuses the whole write set and both shell tools, where
  it previously blocked only `editor_write` and shell commands, so a read-only
  agent could still rewrite files;
- `isDestructive` was a 12-pattern blacklist that missed the Windows footguns
  it was meant to catch. Now ~40 case-insensitive patterns covering delete in
  any argument order across POSIX/PowerShell/cmd, git force/history/working-tree
  destruction, disk and volume operations, power state and destructive SQL.
  Documented as a best-effort backstop, not a sandbox.

### Added
- Automatic context compaction: when the outgoing history passes 80% of the
  model window the agent summarizes the older turns with a real model call and
  replaces them, with a notice and a six-step cooldown. The token estimate moved
  to a shared `contextBudget.ts` so the meter and the agent can no longer
  disagree. Manual `/compact` is unchanged;
- Git worktrees: `git_worktree_list/add/remove/prune` in Rust (porcelain
  parsing, main worktree protected from removal) and a `worktree` tool for the
  built-in agent;
- Agent tools `notes` (read and write Notes & Todos), `schedule_command`
  (deferred and repeating shell commands on top of the cron backend) and
  `focus_pane` (raises a pane that lives in another tab);
- Queue chips in the AI composer can now be reordered up/down and edited in
  place.

### Fixed
- Agent provider timeouts and transient network failures now retry safely up to
  two times with 1s/2.5s backoff before any tool is dispatched. Retry status is
  visible (`Mencoba lagi ...`), cancellation remains responsive, and auth,
  invalid-request, not-found, tool, and malformed-response failures are not
  retried, so local file/shell side effects cannot be duplicated;
- `scripts/test-subagent.mjs` carried its own hand-copied 23-entry deny-list and
  asserted that size, so the test would stay green while the shipped set drifted
  (it was already 29 by then). It now PARSES `TOOL_TULIS` out of
  `agentTools.ts`, asserts a floor, and gained cases for `mcp_call` /`ssh` /
  `browser_open` refusal, `browser_read` keeping, and the allowlist-and-deny-list
  intersection;
- The dev bridge's `__ZEPHYR_TODO__.tulis` called the tool directly, bypassing
  the read-only gate that the agent loop enforces. It now checks the same gate.
  (Dev-only surface, tree-shaken from release builds - closed for consistency);
- `editor_read` could only ever see the ACTIVE tab, so nothing that lived in
  another tab was reachable through it. It now takes a `path` to read any open
  tab (and reports unsaved state), and lists every open tab when there is no
  active one;
- The `git` tool had no branch operations at all despite the backend commands
  existing. Added `branches`, `checkout`, `create_branch`, `fetch` and `push`;
- `file_copy` claimed to copy folders recursively but only copied the top
  level and left subfolders empty. It now walks the whole tree, reports the real
  file count, and refuses to copy a folder into its own subtree;
- Scheduled jobs now actually run: a `cron-due` listener (`cronRunner.ts`)
  executes the command in a terminal pane, with a non-interactive fallback and
  a notification naming the job. The Rust timer emitted the event all along but
  nothing listened, so no scheduled command had ever executed;
- Queued messages no longer lose their image attachments when they are sent.

## [1.1.13] - 2026-09-30

### Fixed
- Customize Layout no longer closes the window when its lazy-loaded panel is
  opened outside a Suspense boundary.
- The terminal and editor validate the configured font, restoring a monospace
  terminal instead of falling back to a serif face for the invalid `terminal`
  value.
- The command palette repaints when its lazy command list arrives and rebuilds
  on every open, so it is populated on first open.
- The message queue is now a compact row of numbered chips inside the composer.
- The reader-facing reasoning block was removed so model-only thinking no longer
  pushes the answer down the panel.
- The context meter no longer causes a Zustand v5 render loop with no active
  chat session.

### Interface and language
- Added 39 missing interface strings to every language dictionary.
- English no longer falls back to Indonesian for six entries.
- Corrected the malformed built-in prompt and changed the Thinking indicator to
  the project mark with motion instead of a spinner.

### Release gates
- Build, automated test, updater end-to-end, and installer verification remain
  pending for 1.1.13. No installer verification is claimed here.

## [1.1.12] - 2026-09-30

### Dev Environment
- New view for runtimes, services, terminals, ports, and scanned projects;
  runtimes report the real versions the terminal sees.
- Start and Stop work from the panel, and Stop only kills a process Zephyr
  started.
- The scan is cached by configuration, so reopening the panel is instant and
  typing in a Settings field no longer starts a scan per keystroke.
- Every button does something: rows open their folder, `Start all` and
  `Stop all` drive the list, `New project` creates the folder, and the `...`
  menu opens a folder, copies a path, or opens a project in the browser.

### New views
- Read-only SQLite browser: tables, columns, and SELECT with a filter. Writes
  are refused by an allowlist, a banned-word check, and `SQLITE_OPEN_READ_ONLY`.
- HTTP client: GET and POST, headers, GraphQL, Bearer and API-key auth, and
  per-session history.
- SFTP and a local port forward on the bundled OpenSSH client, with no SSH
  crate added.
- Credentials live in their own encrypted file, separate from `secrets.json`,
  and listing never returns a stored value.

### AI
- Streaming no longer truncates when a body arrives in small pieces.
- Rate limit (429) and server errors (5xx) retry twice with backoff, then fall
  back to another provider that has a key.
- A stalled connection fails in 30 seconds instead of 90.
- The context meter shows real token counts when the provider reports them.
- An agent that calls one tool three times with identical arguments is stopped
  instead of burning its step budget.
- The agent prompt is written, not templated, and each of the ten UI languages
  gets its own text.

### Subagents
- One task line can name its own model, or tag the task `[model:provider/id]`.
- A line can chain with `->`, so the second step waits for the first and
  receives its result as context.
- A subagent claims a file the first time it writes; a second subagent handed
  the same file is refused with the owner's name.
- Each subagent carries an evidence verdict beside its status: proven, partial,
  or unproven, based on what its tool steps actually did.
- A read-only role is not offered write tools at all.
- The last batch is restored after a restart.
- The idle limit before a step is abandoned is a Setting now.
- The worker list falls back to the saved file when the store is empty, so
  workers no longer vanish until the settings page has been opened once.
- Each row shows the worker's own icon; before this the row was name and tags
  only, so the icon picked in the editor looked discarded on close.
- The edit dialog no longer opens behind the AI panel.

### Language
- The interface is English end to end. Extension descriptions and command
  errors were written in Indonesian while the interface shipped in English:
  121 extension descriptions and 259 error messages are now English at the
  source, with translation still handled by the i18n layer.
- English and Indonesian dictionaries are the same size (1280 keys). Around
  120 keys existed only in the Indonesian dictionary and four of those were
  still Indonesian text, which is why a few menus stayed Indonesian with the
  interface set to English.
- The lookup order prefers English over Indonesian. The Indonesian dictionary
  used to be the last fallback, leaking any key only it knew into every other
  language. It went unnoticed because those values were already English.
- Ten languages in sync: 1403 keys (`scripts/verify-i18n.mjs`).

### Integrations
- Discord Rich Presence built into the app: on launch Zephyr connects to the
  local Discord IPC pipe and publishes "Zephyr" as the current activity with
  the custom application icon, the active workspace folder as state, and an
  elapsed-time counter. Presence clears on exit, so the game-activity slot no
  longer shows Discord's generic question-mark placeholder.
- The About page links to the Discord community instead of the WhatsApp group,
  with the real Clyde mark on its native 24x24 grid.

### Interface
- Terminal, Run and Debug, and Extensions panels rebuilt to match the
  reference layout.
- Extension tabs no longer overlap in a narrow sidebar: the active tab keeps
  its full label, the inactive ones ellipsize.
- Marketplace catalogue icons are inlined and recoloured per path, because an
  `<img>` on a data URI cannot be tinted from outside. No icon renders black.
- Icon colours use each language's official brand hex across 73 packages
  instead of a hash of the package name.
- Minimap, bracket-pair colours, indent guides, ghost text with `Ctrl+Right`
  to accept a word, and the folder open/close animation.

### Fixes
- The TypeScript language server failed to start on a machine with a stale npm
  global shim that pointed at a deleted node.
- The command palette showed four themes twice, and the Help menu listed two
  items on the same command id.
- Several `<select>` controls had a `value` prop without `onChange`, producing
  33 warnings.
- The menu bar no longer trips the axe `aria-required-children` critical rule.
- Contrast passes AA in all 19 themes.
- Runtime version labels no longer repeat the name.
- MySQL reads its version from the install folder, and Redis installs with a
  flat layout are detected.
- A SFTP listing read the wrong column for the file size.
- A mistranslated log statement referenced a variable that does not exist,
  which broke the Rust build.
- Editor action buttons no longer show a black-on-black label in the light
  theme.

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
