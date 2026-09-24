# Zephyr v1.1.10

Version number stays **1.1.10**. This update changes the release contents, not
the version.

---

## The important ones

**Automatic update from v1.1.9 works again.** The release signing key was
replaced on 22 September, so v1.1.10 was signed with a different key than the
one embedded in v1.1.9, and the updater rejected it with *"The signature was
created with a different key than the one provided"*. The old key is back,
v1.1.10 was rebuilt, and **v1.1.9 can now update from inside the app**. A guard
was added so this cannot happen again: `scripts/cek-kunci.sh` aborts the release
if the key changes.

**Models from other providers work through a custom gateway.** Typing
`gemini-3.8-flash` under *Custom (OpenAI-compatible)* used to make Zephyr
redirect the request to the Gemini provider and ask for a Gemini API key, even
though the custom gateway served that model itself. The result was a 401. The
model name you type is now used exactly as written.

**Agent mode is much faster.** Every step used to resend the whole
conversation, so step ten carried ten times the tokens of step one. History is
now trimmed to the last 8 steps with a placeholder note. Measured on a 61-message
history: **363 KB to 144 KB, 60% smaller**.

---

## New features

**AI panel in the right column.** The chat can move to the right side without
opening the bottom terminal panel, can be widened by dragging, and can be
maximized like in VS Code. The AI tab in the bottom panel hides automatically
once the chat moves right. The panel also has its own hide button, the way the
VS Code chat panel does.

**Subagents have their own tab.** Six roles: `cari`, `telaah`, `rencana`,
`audit`, `kerja`, `jelajah`. Up to 4 run at once, each agent runs at most 15
steps, with a live step log and a cancel button per agent. Only the **kerja**
role may write files; two agents writing the same file is a data race, not a
feature. You start subagents yourself from the Subagents tab. The AI does not
call them on its own.

**Two-level model picker.** Provider first, then model. Only providers that
already have an API key are listed, with a search box.

**19 themes.** Zephyr Dark and Light, Nord, Tokyo Night, Gruvbox, One Dark Pro,
Senja, Acrylic, High Contrast, Dracula, Catppuccin Mocha, Rosé Pine, Kanagawa,
Everforest, GitHub Dark, Ayu Mirage, Solarized Light, Nord Light, Min Light.
Each theme sets every token at once (UI, editor, syntax, terminal), so no color
leaks in from another theme.

**Custom background.** Set a photo as the editor background: a strength slider
plus **Samar / Sedang / Jelas** presets, a fit mode (fill, fit, original), and
a translucent panel option. The background is stored **separately from the
theme**, so switching themes leaves the wallpaper alone and the other way
around. Supported formats: PNG, JPG, GIF, WebP, BMP, AVIF, ICO, and SVG. Image
type is detected from file contents, not the extension, so a `.png` that is
really a JPEG still renders correctly.

**Reworked About page.** One identity card, one build card, and one row of
buttons: check for updates, **View on GitHub**, **Report an issue**, **Join the
WhatsApp group**, **Support Zephyr**.

**The AI prompt is editable.** Settings, Prompt AI has four separate sections
(Identity, How it works, Rules, Additional instructions) plus the command
permission list. Anything you leave alone keeps its default. A preview shows
exactly what gets sent to the model.

---

## Bug fixes

**Command Palette entries changed nothing.** `commandRegistry` reached the
layout store through a dynamic `import()`, which Vite turns into a *separate
module instance* from the static import `App.tsx` uses. Commands like "Toggle
Status Bar" were changing a store the UI never reads. Five call sites were
switched to static imports.

**The "Padat" density setting changed nothing.** It used to shift 1px of
padding on four elements. It now changes real metrics: tab bar 34 to 28px,
status bar 24 to 20px, activity bar 48 to 40px, plus tighter file tree rows and
chat messages. The label was also fixed from **"Rapat"** (which means meeting)
to **"Padat"** across ten languages.

**Sidebar position from Customize Layout did nothing.** The Left/Right buttons
wrote to `general.layout.posisiSidebar` while the renderer read
`settings.sidebar`. Two different places, so the click had no effect.

**The sidebar could disappear entirely.** If settings had no `sidebar` key, the
position came back `undefined` and every render branch failed, so no sidebar
appeared at all. It now falls back to `left`.

**Reset settings removed the sidebar.** `reset_settings` deletes the whole file,
and the Rust defaults had no `sidebar`, `layout`, `subagent`, or
`general.aiPanel` key. All are present now.

**Zeph claimed to be a different model.** Asked "what model are you", Zeph
answered "I'm Claude by Anthropic", inventing from training bias, then
contradicted the model that was actually configured. A model has no way to read
its own metadata, so its identity is now written as fact in the system prompt
**and** at the end of the user message, from the values actually sent to the
API. Settings, Prompt AI shows this block and deliberately keeps it read-only;
if it were editable, a user could make the AI claim to be a different model.

**Zeph asked for a Gemini API key while using its own.** `init()` picked the
active provider from settings without checking whether that provider had a key.
It now picks a provider that actually has one; if the active provider is empty
while another is filled, it switches automatically and says so.

**`file_list` had no limit.** Listing a large folder returned every name, and
that text was resent on every following step. It is now capped at 300 entries
with a "and N more" line.

**Provider timeout was too short.** Streaming calls gave up after 30 seconds,
so long agent steps failed mid-answer. Raised to 90 seconds (per-call 12 to 120
seconds).

**Duplicate palette entries.** Two command systems were live at the same time,
so 12 labels appeared twice.

**Shortcut remap did not take effect.** `mergeBindings` changed the user chord
but never released the old one, and there were two shortcut sources
(`settings.shortcuts` vs `keybindings.json`). Unified: settings is now the
single source of truth.

**The gear icon did not open Settings.** Closing the Settings page left
`activity` set to `settings`, so the next click counted as "already active" and
closed the sidebar instead.

**The AI panel vanished when moved right**, and **the maximize button did
nothing** because the CSS rule for the maximized state did not exist. The class
had no effect and the column stayed 340px.

**`Ctrl+Shift+O` collided.** "Explorer: Open Folder…" duplicated "File: Open
Folder…" (same handler, same shortcut, two entries).

**Empty Language Server section title** used `h3` while other sections used
`h2`.

**Subagent results leaked into chat.** A finished batch used to inject its
summary into the conversation. Subagents now stand alone.

---

## Quality

| Check | Result |
|---|---|
| `tsc --noEmit` | **0 errors** |
| i18n | **581 keys x 10 languages** (ID, EN, JA, KO, ZH, ES, FR, DE, PT, AR) |
| `cargo test --lib` | pass, including 3 new image-format detection tests |
| `uji-t7-performa.mjs` (performance + density) | 10/10 |
| `uji-t6-identitas.mjs` (model identity) | 8/8 |
| `uji-t5-tema.mjs` (themes + background) | 32/32 |
| `uji-t4-16.mjs` (reset does not break UI) | 19/19 |
| `uji-t4-11.mjs` (AI tab, right column, maximize) | 20/20 |
| `uji-t4-15.mjs` (About page) | 25/25 |
| `uji-t4-13.mjs` (subagents stand alone) | 11/11 |
| `uji-t4-10.mjs` (two-level model picker) | 23/23 |
| `uji-subagent-nyata.mjs` | 13/13 |
| `sweep-bug.mjs` (all icons, tabs, sections) | 31/31 |

The release signature is verified cryptographically with the `minisign-verify`
crate against the installer **downloaded from GitHub**, not the local file.

---

## Carried over from the previous build

**Agent panel**: per-step streaming, a "work directly" approval mode, terminal
output inside the chat bubble, a todo panel, 22 agent tools, and up to 10 image
attachments per message.

**Skills, memory, scheduled tasks**: a `SKILL.md` folder loaded only when
relevant (global and per-workspace), `memory.md` / `user.md` injected into every
conversation with a character cap, and `cron_create` / `cron_list` /
`cron_delete` backed by plain JSON.

**Inline assistant**: ghost-text completion (`Alt+\`), inline chat (`Ctrl+I`),
apply as replace/insert/diff, clickable `file:line` references, `@file` /
`@folder` / `@symbol` / `@terminal` / `@problems` context, and a searchable
prompt library.

**Custom title bar**: Zephyr draws its own window chrome, with a menu bar
aligned to the 48px activity bar column.

**Light**: release binary is 9.4 MB, around 118 MB idle (about 104 MB of that
is the WebView2 baseline that no flag removes). Every child process runs with
`CREATE_NO_WINDOW`, so no console flashes at startup.

**Linux build**: `.deb` and `.AppImage` for x86_64, signed with the same
minisign key as the Windows installer.

---

## Removed

Features that turned into a second application inside the editor were dropped
rather than left half-finished:

- **Dev Environment** (PHP/Nginx/MariaDB/Redis manager)
- **API client** (Postman-style collections)
- **SQLite browser**
- **Cloudflare Tunnel**
- **Test Explorer**
- **SFTP + port forwarding**

`.http` files still run. API keys are untouched: `reset_settings` never deletes
`secrets.json`.

---

## How to update

- **First time:** download `Zephyr_1.1.10_x64-setup.exe` or `.msi` from
  Releases.
- **Already installed:** open Zephyr and the update dialog appears on its own.
  Or go to Settings, About, Check for updates.
- **Still on v1.1.9 or older:** if the update button fails, install manually
  once from this page. Automatic updates work normally after that.

The app verifies the installer signature before installing. SmartScreen may
still warn because this is not an EV certificate: click **More info**, then
**Run anyway**.
