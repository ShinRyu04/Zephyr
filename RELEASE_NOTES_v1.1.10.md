# Zephyr v1.1.10

## What's new

## New in this build — agent tooling, dev services, and a lighter footprint

This refresh adds fourteen features that were previously "open the terminal and
type it yourself". Everything below was verified by running it, not by reading
the code.

### Parallel subagents

Ask for several jobs in one message and they run **at the same time**, each with
its own name (Comet, Odyssey, Nova…), a live step log, and a cancel button. Up to
**4 run in parallel**, each capped at **15 steps**, and each is **read-only by
design** — two agents writing the same file is a data race, not a feature. A
combined summary is written when the batch finishes.

### Reasoning effort and a visible "Reasoned" block

A **Reasoning** dropdown in the AI panel header sets how hard the model thinks:
`minimal / low / medium / high / ultra`. It maps per provider — OpenAI
`reasoning_effort`, Anthropic `thinking.budget_tokens` (1 024–65 536, always kept
below `max_tokens`), Gemini `thinkingConfig.thinkingBudget` (negative = dynamic,
0 = off). The model's thinking now streams into a collapsible **Reasoned** block
instead of being discarded.

### API client

A Postman-style workspace in its own panel tab: collections, saved requests,
environments with `{{variables}}`, and a response viewer with status, timing,
headers, and body. Collections live in Zephyr's data folder, not in your repo —
for requests you want versioned with the code, `.http` files still work.

### Dev Environment

Run **PHP, Nginx, MariaDB, and Redis** from `D:\DevEnv\` without a XAMPP-style
bundle, with **multiple versions side by side** (PHP 8.3.33 and 8.1.34 both
work). Ports already in use are **refused, never stolen** — taking over a port
would kill somebody else's service without warning. Services stop when Zephyr
closes.

### Database browser

Open a SQLite file and browse tables and views, run `SELECT` queries, and read
results in a grid. The connection is **read-only** unless you flip the write
toggle, so browsing a database your app is using cannot lock or corrupt it.
Results are capped per query, so `SELECT *` on a huge table cannot freeze the UI.

### Cloudflare Tunnel

Expose a local port to the internet in one click (`cloudflared` is fetched to
`D:\DevEnv\bin`). A permanent warning banner stays up while a tunnel is live —
a tunnel is your localhost, open to anyone who knows the URL. Every tunnel is
killed when Zephyr exits.

### Test Explorer

Detects the test runner from your project files (`package.json`, `Cargo.toml`,
`go.mod`, `pytest`, `composer.json`, `Makefile`, plus `npm run
verify/soak/stress/lint`) and runs it from a panel tab. It offers only runners
that actually exist: no `scripts.test` means no `npm test` button, so you never
press a button that answers "missing script".

### SFTP + SSH port forwarding

Browse a remote host's files, download and delete them, and open port tunnels
(`ssh -L` local, `-R` remote, `-D` SOCKS) from one panel. Tunnels are cleaned up
on exit, and a port that is already taken is refused rather than hijacked.

### Zen mode and image preview

`View: Toggle Zen Mode` hides the Activity Bar, sidebar, panel, and status bar,
leaving only the editor. Opening `.png / .jpg / .gif / .webp / .bmp / .ico /
.avif / .svg` shows a real preview with zoom and a transparency checkerboard
instead of dumping binary into the editor.

### CLI subcommands and portable mode

`zephyr ext list`, `zephyr ext remove <id>`, `zephyr ext registry [url]`, and
`zephyr info` work without opening a window, so Zephyr can be driven from scripts
and CI. Drop a file named `portable` next to `zephyr.exe` and **all** data
(settings, keys, extensions, logs) moves into a `data/` folder beside the
executable — Zephyr then runs from a USB stick and leaves nothing behind on the
host machine.

### Three real bugs found and fixed along the way

- **Task and test output was being thrown away.** The output buffer dropped
  every line for a channel that did not exist yet, and nothing created the
  channel before the first line arrived. Running a task produced a spinner and
  an empty panel. Fixed by creating the channel before the process starts.
- **SFTP showed "empty folder" when it could not connect at all.** The exit
  status of `sftp` was never checked, so a dead host, a refused key, and an
  actually-empty directory all looked identical. Now the real error is shown.
- **The SFTP listing parser read file names wrong.** It split on every space
  instead of runs of spaces, so any listing with aligned columns returned the
  tail of the line as the file name.


An agent-first AI panel, a Copilot-style inline assistant, a custom title bar, 10 fully-synced UI languages, a release binary that shrank by two thirds, and a much lighter memory footprint. **This refresh adds skills, memory, and scheduled tasks to the AI panel, plus chat history controls.**

### Skills — teach the agent once, reuse it forever

- **`SKILL.md` folders, loaded only when relevant.** The agent sees a one-line summary of every skill (name + when to use it) in its system prompt, then opens the full instructions only for the task at hand. Your context window stays clean; the agent still knows what it can do.
- **Two scopes.** `%APPDATA%\zephyr\skills\` for skills that apply everywhere, `<workspace>\.zephyr\skills\` for skills that belong to one project.
- **The agent writes its own skills.** After solving something reusable, it saves the steps — concrete commands, paths, and pitfalls — with the `skill_write` tool, and reads them back next session with `skill_view`.
- **A starter skill ships with it.** `godmode` covers prompt-level red-teaming: GODMODE templates, Parseltongue obfuscation tiers, and multi-model racing, with the pitfalls that make each technique fail.

### Memory that survives the session

- **Two files, two lifetimes.** `memory.md` holds the agent's notes about your environment and hard-won technical lessons; `user.md` holds who you are — preferences, style, habits.
- **Injected into every conversation** automatically, with hard character budgets (2200 / 1375) so memory cannot grow until it drowns the prompt.
- **The agent maintains it itself** through `memory_read` / `memory_write`, including replacing and removing entries when a budget fills up. Plain markdown — you can edit it by hand.

### Scheduled tasks

- **`cron_create` / `cron_list` / `cron_delete`.** Ask for a job every N minutes or daily at a given hour; a background timer checks every 30 seconds and hands due work to the UI. Daily schedules use local time, so "8 AM" means your 8 AM.
- **Stored as plain JSON** at `%APPDATA%\zephyr\cron.json` — no hidden scheduler process, no surprise shell execution from a file.

### Chat history controls

- **"Delete all" for chat history**, in both the AI panel header and the sidebar's history row, behind a confirmation dialog that defaults to Cancel.
- **New chat** from the panel header, not just the sidebar.

### AI agent panel

- **Step-by-step streaming:** every agent turn now streams tool calls and results as they happen instead of waiting for the whole turn to finish, so you can watch the agent think and act.
- **"Just work" mode:** safe commands run without asking; only destructive ones stop for confirmation. Approval modes are `ask`, `work` (default), `auto`, and `readonly`.
- **Terminal output in the chat:** command output renders inside a collapsible bubble in the conversation, so you no longer bounce between panel and terminal.
- **Todo panel (opencode-style):** the agent keeps a visible task list through the `todo_write` / `todo_read` tools, and the panel shows live progress.
- **22 agent tools** (up from 13), all following the existing safety rule: tools execute through paths that already exist and are already guarded.
- **Up to 10 image attachments** per message, with per-image size limits and automatic downscaling.

### Copilot-style inline assistant

- **Ghost text completions:** optional inline suggestions in the editor, triggered manually with `Alt+\` — off by default because each suggestion is a paid API call.
- **Inline chat (`Ctrl+I`):** a floating prompt right at the cursor for explain / fix / refactor, with the answer applied in place.
- **Apply & insert:** accept a suggestion as a full replacement, an insertion at the cursor, or a diff you review before it lands.
- **Inline diff review:** proposed edits show as an inline diff you accept or reject hunk by hunk.
- **Clickable file references:** paths in AI answers jump straight to `file:line`.
- **At-mention context:** pull `@file`, `@folder`, `@symbol`, `@terminal`, `@problems`, and `@selection` into a prompt.
- **Slash commands & prompt library:** reusable prompts with a searchable picker.
- **Chat history search & auto titles:** conversations get generated titles and are searchable.
- **Quick chat from selection:** explain / fix / refactor the selected code without opening the panel.
- **Right-side panel at 340px:** dock the AI panel to the right when you want the editor full-width.

### Custom title bar & layout

- **Your own title bar:** the window chrome is drawn by Zephyr (minimize / maximize / close, menus, command palette) instead of the OS frame — no more double title bar.
- **Terminal-first layout option:** put the terminal in the primary area with the editor as the secondary pane, for people who live in the shell.
- **Spacing & theme polish:** shared spacing tokens and a rebalanced dark theme so the UI reads consistently across panels.

### 10 UI languages, fully synced

Settings → General offers **Indonesia, English, 日本語, 한국어, 中文, Español, Français, Deutsch, Português, and العربية**. Every string in the app — including toasts, tooltips, shortcut labels, empty states, and the update notification — now routes through the translation layer, so switching to a non-Indonesian language no longer leaves stray Indonesian text anywhere.

### A shorter, current model list

The provider dropdown is now **8 providers and 50 models** instead of 13 and 92. Groq, OpenRouter, Mistral, and Ollama were removed, along with long-obsolete generations (GPT-3.5, GPT-4, o1/o3, Claude 1–3.5, Gemini 1.x, Grok 2/3). What remains is what you would actually pick: the current flagship and small/fast tiers per provider, plus the specialised entries (reasoning, vision, image generation). Every provider keeps its own brand mark in the model picker.

### Much smaller, much lighter

- **Release binary: 23.8 MB → 9.4 MB on Windows.** An optimized release profile (size-first codegen, LTO, symbol stripping, panic abort) cut the executable to well under half its previous size, even with this release's new features included.
- **Memory: ~208 MB → ~118 MB at idle.** WebView2 now runs its renderer, GPU, and utility work in one process instead of eight, with background networking and the Edge sidebar/collections/sync services switched off. About 104 MB of what remains is the WebView2 baseline inside that single process — it is the floor for this runtime, not something a flag removes. Verified with the editor, terminal, and browser pane all in use.
- **No more console windows:** every child process (registry reads, git, taskkill, LSP/DAP, shell probes) now spawns with `CREATE_NO_WINDOW`, so nothing flashes a black window on startup.
- **Editor, terminal, and AI panel** still respect the built-in low-memory mode.

### Linux builds

This release ships `.deb` (5.6 MB) and `.AppImage` (81 MB) packages for x86_64 Linux, both signed with the same minisign key as the Windows installers.

### Menu bar that matches VS Code's alignment

- **The Zephyr mark is now the size it should be.** The old logo carried a rounded background plate with wide padding, so at a 15 px box only about 7 px of actual letter was drawn — the brand looked tiny next to the menu labels. The mark now renders as a bare glyph that fills 96% of its box, and it is sized from a measurement of VS Code on the same machine (VS Code's logo is 19 px, 1.58× the cap-height of its menu text) rather than from guesswork.
- **Columns line up with the panels below.** The mark sits centred in the same 48 px column as the activity-bar icons, and the first menu label starts exactly at that column's right edge — the same vertical line the sidebar and its sections begin on, so the top bar reads as part of the grid instead of floating above it.

### Account menu on the GitHub button

- **Clicking the avatar now opens a menu** instead of immediately starting a login flow. It shows the signed-in name and a GitHub label, then Sign out of GitHub and Manage GitHub token.
- **Not signed in?** The same menu offers Sign in to GitHub, which runs the device flow when OAuth is configured and otherwise opens the OAuth app guide.
- **Dismisses like a real menu:** click the avatar again, press Escape, or click anywhere else.

### Under the hood

- New Rust modules `skills.rs`, `memory.rs`, and `cron.rs` back skills, memory, and scheduled tasks; all three are covered by unit tests (183 total, up from 166).
- Live verification via a mock provider harness proves the full path end to end: the model requests a tool, the agent loop executes it, and the result actually lands on disk.
- No new ports, no telemetry, no network calls added.

### Bug fixes in this refresh

- **Blank window from Settings → AI Models:** changing any dropdown there (active provider, answer language, RAG fields) sent a partial settings patch that was merged shallowly, so the whole provider list was wiped from state and the next render threw — leaving the window completely empty until a reload. Settings now merge recursively, matching what the Rust side already did, and a render guard keeps a missing field from ever taking the app down again.
- **Render errors no longer kill the window:** the app had no error boundary, so one bad component unmounted the entire tree. A failing area now shows a recovery card with Try again / Reload, and the rest of the editor keeps working.
- **Double paste in terminals:** pressing `Ctrl+V` in the AI terminal (Hermes, opencode) sometimes inserted the clipboard twice. xterm's own paste listener and Zephyr's shortcut both wrote to the shell; the shortcut now stops the default paste, and bracketed paste is only sent when the running program actually asks for it.
- **Update notifications follow your language:** the update panel, banner, and bell notification were hardcoded Indonesian. They now use the same 10 languages as the rest of the UI, including the status text and error messages.
- **Real GitHub profile photo:** the activity-bar button showed the first letter of your username. It now loads your actual GitHub avatar, cached locally after login and falling back to the initial if the image cannot load.
- **Trimmed model catalog:** Groq, OpenRouter, Mistral, and Ollama are gone, and long-obsolete model generations (GPT-3.5, GPT-4, o1/o3, Claude 1–3.5, Gemini 1.x, Grok 2/3) were removed — 92 entries down to 50, so the dropdown is a short, current list.
- **Green-tinted UI:** a WebView2 flag used during memory tuning forced 4-bit-per-channel color, which made the entire dark chrome render green. The flag is gone; colors now match the theme tokens exactly.
- **GitHub avatar color:** the sidebar avatar used a hardcoded GitHub green instead of theme tokens; it now follows the active theme.
- **Window state:** the saved window state no longer restores a decorated frame over the custom title bar.
- **Path traversal is rejected at the Rust boundary** — a skill named `../something` fails validation instead of writing outside the skills folder.

---

## How to update

- **First time:** grab `Zephyr_1.1.10_x64-setup.exe` or the `.msi` from Releases.
- **Already have it:** Settings → About → Check for updates. Or wait for the bell if auto-update is on.

The app verifies the installer signature before installing. SmartScreen can still warn because this is not an EV certificate: click **More info → Run anyway**.

---

**Note:** Installers are signed (minisign) for auto-update, so a downloaded update only installs if its signature matches.
