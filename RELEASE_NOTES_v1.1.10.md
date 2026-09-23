# Zephyr v1.1.10

## Fixed — performance & layout

**Agent mode was slow.** Every step re-sent the entire conversation to the
provider, so step 10 carried ten times the tokens of step 1 and each step got
slower than the last. The history is now trimmed to the last 8 steps; older
tool results are capped at 1,200 characters and older assistant messages at
800, with a one-line note in their place so the model knows detail was
dropped instead of inventing it. Measured on a 61-message history: **363 KB →
144 KB, 60% smaller**.

**`file_list` had no output limit.** Listing a large folder returned every
name, and that text was then re-sent on every following step. Capped at 300
entries with an explicit "and N more" line.

**Provider timeout was too short.** Streaming calls gave up after 30 seconds;
a slow gateway made long agent steps fail mid-answer. Raised to 90 seconds
(per-call 12 → 120 s).

**Commands from the palette changed nothing.** `commandRegistry` reached the
layout store through a dynamic `import()`, which Vite serves as a *separate
module instance* from the static import `App.tsx` uses. The command mutated a
store the UI never read, so "Toggle Status Bar", layout density and the other
view commands looked broken. Five call sites now use a static import.

**Layout density did nothing visible.** "Compact" changed 1px of padding on
four elements. It now drives real layout metrics — tab bar 34 → 28px, status
bar 24 → 20px, activity bar 48 → 40px, plus tighter tree rows and chat
messages.

**"Rapat" was the wrong word.** In Indonesian *rapat* means "meeting"; the
setting is about visual density. Renamed to **"Padat"** across all ten
languages.

**Background images: more formats.** SVG, AVIF and ICO are accepted now.
SVG has no magic bytes, so it is detected from its XML content — never from
the file extension, which can lie. Loaded through `<img src="data:...">`, where
browsers do not execute embedded scripts.

## Fixed

**Provider API key** — Zephyr no longer tells you to fill in a key for a
provider you do not use. It picks the provider that actually has a key, and if
the active provider is empty while another one is filled, it switches over and
says so in the status message.

**Customize Layout — sidebar position** — the Left/Right buttons now actually
move the sidebar. They wrote to the layout state while the renderer read
`settings.sidebar`, so clicking them changed nothing.

**Sidebar disappearing** — a settings file without a top-level `sidebar` key
left the sidebar unrendered. It now falls back to `left`.


## What's new

This build is mostly about **the AI panel and how it fits the window** — where
it lives, how wide it gets, and what it is allowed to do on its own. Alongside
that: ten new themes, a custom background image, and a shorter About page.

Everything below was verified by running it in the app over CDP, not by reading
the code.

---

## AI panel: dock it right, widen it, full-screen it

The chat panel can sit in the bottom dock (next to the terminal) **or as its own
column on the right**. Pick it in `View: Customize Layout` → *Panel AI*, or
`Settings → Umum → Tempat panel AI`.

- **Right mode does not drag the terminal along.** Moving the chat to the right
  column closes the bottom dock instead of leaving it open beside an empty
  editor. This was the most-requested fix: the terminal kept following the AI
  panel to the right.
- **Drag the divider** to resize the column — 240 px up to the full window.
- **Expand button** in the panel header takes it full width, VS Code style, and
  the editor steps aside. Click again to restore.
- The **AI tab disappears** from the bottom strip while the chat lives on the
  right — no dead tab telling you where the panel went.
- The **subagent info panel** can sit beside the chat (toggle in Customize
  Layout). It is a narrow column, not a second chat.

## Subagents: a tab of their own, started by you

Subagents moved out of the chat panel into their **own tab**, so the chat stays
clean and the agents get room to work.

- **Started by you, never by the model.** The system prompt no longer claims the
  AI can call subagents, because it cannot — batches are launched from the
  Subagents tab, and their results are not injected into your conversation.
- **Six roles**, shown as a badge on each card: ⌕ Cari, ◈ Telaah, ≡ Rencana,
  ✓ Audit, ⚒ Kerja, ⊕ Jelajah. **Only ⚒ Kerja may write files**; the other five
  are read-only, because two agents writing the same file is a data race, not a
  feature.
- Type `@kerja perbaiki bug ini` to pick a role, or let Zephyr guess it from the
  task text.
- **Per-subagent model** — each batch can use the chat model, or a different one
  picked from the same two-level selector.
- Up to **4 in parallel**, each capped at **15 steps**, with a live step log and
  a per-agent cancel button.

## Model picker: two levels, and only the providers you have keys for

The old dropdown was one long list you had to scroll through. Now it is
**provider → model**: pick Gemini, then its models; pick Claude, then its models.

- **Providers without an API key are hidden** — no more picking a model you
  cannot use.
- **Search box** filters across both levels.
- Custom and local providers still work (Settings → Model AI).

## Themes: ten more, nineteen total

Added **Dracula, Catppuccin Mocha, Rosé Pine, Kanagawa, Everforest, GitHub Dark,
Ayu Mirage, Solarized Light, Nord Light, Min Light** — joining Zephyr Dark,
Zephyr Light, Nord, Tokyo Night, Gruvbox, One Dark Pro, Senja, Acrylic, and High
Contrast.

Each theme defines **all 36 tokens** (UI, editor, syntax, terminal), so a theme
never falls through to another theme's colours. The accent colour can still be
overridden on its own.

## Background image

Use any PNG/JPG/GIF/WebP/BMP as the editor backdrop.

- **Strength slider** plus three presets: **Samar / Sedang / Jelas**.
- **Fit mode**: fill, whole, or original size.
- **Translucent panels** switch — turn it off if the wallpaper makes text hard
  to read.
- Stored **separately from the theme**, so changing the theme never touches your
  wallpaper, and changing the wallpaper never touches the theme.
- Read by Rust into a data URL (max 8 MB). The image type is detected from the
  file's magic bytes, not its extension, so a `.png` that is really a JPEG still
  displays correctly.

## About page, rebuilt

The old page stacked three full tables plus a long note — too much text for a
page you visit once. It is now:

- One **identity card** (logo, name, tagline, version).
- One **build card** (platform, identifier, licence, source repo).
- One **row of buttons**: check for updates, **View on GitHub**, **Report an
  issue**, **Join the WhatsApp group**, **Support Zephyr**.
- Rarely-used utilities (copy system info, open log folder, open data folder,
  releases page) moved down to quiet links.

## Command palette: duplicates removed

The palette was listing some commands twice — the theme entries and seven editor
toggles were defined in two places. The duplicate block is gone: **114 commands,
zero duplicates**. Shortcuts shown in the palette come from the same registry the
editor runs, so the hint cannot drift from the behaviour.

## Fixes in this build

- **Settings reset no longer wipes your layout.** `reset_settings` deletes
  `settings.json`, and the Rust defaults were missing `sidebar`, `layout`,
  `subagent`, and `general.aiPanel` — so after a reset the sidebar vanished
  entirely (the body got `sidebar-pos-undefined`, which matches no CSS rule).
  All four keys now have defaults.
- **The gear icon opens Settings again.** Closing the Settings page left
  `activity` set to `settings`, so the next click on the gear read "already
  active" and *closed* the sidebar instead of opening it.
- **Shortcut remaps from Settings now actually apply.** Remaps were written to
  `settings.shortcuts` while the resolver read `keybindings.json` — two stores,
  one of them ignored. They are now merged, with `settings.shortcuts` winning,
  and a remap clears the old chord for that command.
- **The AI panel no longer disappears** when moved to the right column.
- **Maximize actually widens the panel** — the CSS rule for the maximised state
  did not exist, so the class was a no-op and the column stayed at 340 px.
- **`Ctrl+Shift+O` collision removed** — "Explorer: Open Folder…" duplicated
  "File: Open Folder…" (same handler, same shortcut, two entries).
- **The Language Server section has a title** — it rendered an `h3` where every
  other section renders an `h2`, so its heading was missing.
- **Subagent results no longer leak into the chat.** A finished batch used to
  inject its summary into the conversation; subagents now stand alone.

## Verification

| Harness | Result |
|---|---|
| `uji-t5-tema.mjs` (themes + background) | 32/32 |
| `uji-t4-16.mjs` (reset must not break the UI) | 19/19 |
| `uji-t4-11.mjs` (AI tab, right column, maximize) | 20/20 |
| `uji-t4-15.mjs` (About page) | 25/25 |
| `uji-t4-13.mjs` (subagents stand alone) | 11/11 |
| `uji-t4-10.mjs` (two-level model picker) | 23/23 |
| `sweep-bug.mjs` (all icons, all tabs, all sections) | 30/31 |
| `verify-i18n.mjs` | 577 keys × 10 languages |
| `tsc --noEmit` | 0 errors |

The one `sweep-bug` miss is the harness reading the sidebar before it is set
visible — the eight Activity Bar icons all pass in the same run.

## Carried from earlier builds

**Agent panel** — step-by-step streaming, "just work" approval mode, terminal
output inside the chat, a todo panel, 22 agent tools, and up to 10 image
attachments per message.

**Skills, memory, and scheduled tasks** — `SKILL.md` folders loaded only when
relevant (global and per-workspace), `memory.md` / `user.md` injected into every
conversation with hard character budgets, and `cron_create` / `cron_list` /
`cron_delete` backed by plain JSON.

**Inline assistant** — ghost-text completions (`Alt+\`), inline chat (`Ctrl+I`),
apply-as-replacement / insertion / reviewed diff, clickable `file:line`
references, `@file` / `@folder` / `@symbol` / `@terminal` / `@problems` context,
and a searchable prompt library.

**Custom title bar** — the window chrome is drawn by Zephyr, with a menu bar that
aligns to the same 48 px column as the activity bar.

**10 UI languages, fully synced** — Indonesia, English, 日本語, 한국어, 中文,
Español, Français, Deutsch, Português, العربية. Every string routes through the
translation layer.

**Small and light** — release binary 9.4 MB, ~118 MB at idle (about 104 MB of
that is the WebView2 baseline, which no flag removes). Every child process
spawns with `CREATE_NO_WINDOW`, so nothing flashes a console on startup.

**Linux builds** — `.deb` and `.AppImage` for x86_64, signed with the same
minisign key as the Windows installers.

## Removed

Four features that were second apps bolted onto the editor are gone, rather than
left half-working:

- **Dev Environment** (PHP/Nginx/MariaDB/Redis manager)
- **API client** (Postman-style collections)
- **SQLite browser**
- **Cloudflare Tunnel** panel

`.http` files still run, so request files you version with the code keep working.
API keys are untouched — `reset_settings` never deletes `secrets.json`.

---

## How to update

- **First time:** grab `Zephyr_1.1.10_x64-setup.exe` or the `.msi` from Releases.
- **Already have it:** Settings → About → Check for updates.

The app verifies the installer signature before installing. SmartScreen can still
warn because this is not an EV certificate: click **More info → Run anyway**.

---

**Note:** Installers are signed (minisign) for auto-update, so a downloaded
update only installs if its signature matches.
