# Zephyr v1.1.10

Version number stays **1.1.10**. This update changes the release contents, not
the version.

## What's new in this build

### Language switching now covers the whole app

Changing the UI language used to leave strings behind. The root cause was in the
translator: it checked the English source dictionary before the target-language
dictionary, so any key that already had a Japanese, Korean, or Spanish
translation still rendered in English, and keys missing from a language fell
through to Indonesian. The lookup order is fixed, the missing keys were added,
and every visible string now routes through the translator: the activity bar,
the side panels, the terminal, every settings section, dialogs, toasts,
tooltips, placeholders, and shortcut hints. An automated audit reports zero
leftover Indonesian across nine languages.

The default UI language is now **English**.

### Every menu item is enabled

The eight menus (File, Edit, Selection, View, Go, Run, Terminal, Help) exposed
items that were permanently greyed out. The six View > Theme entries were labels
with no command behind them, and items whose context was missing were disabled
instead of handling it. Every theme entry is now a real command, and a menu item
is only disabled when its command does not exist at all.

### Announcements and release notes are per-language

Announcement titles and details, and release notes, can now be provided as a
per-language object (`{ "en": "...", "id": "...", ... }`). The app picks the
active language and falls back to English.

### Stronger RAM saver mode

The RAM saver toggle now also turns off color decorators and unicode highlight,
lowers the loaded-tab limit to 3, and cuts terminal scrollback to 1000 lines. A
"RAM saver" badge in the status bar makes the active state visible.

### Apache-2.0 license

Zephyr is now licensed under the **Apache-2.0** License. See [LICENSE](LICENSE).

## Earlier in the 1.1.10 line

### Parallel subagents

Run several jobs at once, each with its own name, a live step log, and a cancel
button. Up to 4 run in parallel, each capped at 15 steps, and each is read-only
by design: two agents writing the same file is a data race, not a feature.

### Reasoning effort and a visible "Reasoned" block

A Reasoning dropdown sets how hard the model thinks (`minimal` through
`ultra`), mapped per provider (OpenAI `reasoning_effort`, Anthropic
`thinking.budget_tokens`, Gemini `thinkingConfig.thinkingBudget`). The model's
thinking streams into a collapsible Reasoned block instead of being discarded.

### Zen mode, image preview, and Customize Layout

`View: Toggle Zen Mode` hides every panel and leaves only the editor. Common
image formats open as a real preview with zoom and a transparency checkerboard.
The layout button gathers every visibility control in one panel, and the choices
are saved.

### CLI subcommands and portable mode

`zephyr ext list`, `zephyr ext remove <id>`, `zephyr ext registry [url]`, and
`zephyr info` work without a window. A file named `portable` next to `zephyr.exe`
moves all data into a `data/` folder beside the executable.

### Skills, memory, and scheduled tasks

The AI panel can save a reusable procedure as a `SKILL.md` and read it back
later, keep notes about the environment in `memory.md` and about you in
`user.md` (both injected with a hard character budget), and schedule recurring
work through `cron_create`. All of it lives under `%APPDATA%\zephyr\` as plain
files you can edit by hand.

### AI agent panel

Step-by-step streaming of tool calls, approval modes (`ask`, `work`, `auto`,
`readonly`), terminal output rendered inside the chat, a todo panel, up to 10
image attachments per message, and inline edit diffs you accept or reject hunk
by hunk.

### Smaller and lighter

The optimized release profile (size-first codegen, LTO, symbol stripping, panic
abort) cut the Windows executable to well under half its previous size. WebView2
runs its renderer, GPU, and utility work in fewer processes, and every child
process now spawns with `CREATE_NO_WINDOW`, so no console window flashes on
startup.

### Three real bugs fixed along the way

- Task and test output was dropped for a channel that did not exist yet. The
  channel is now created before the process starts.
- SFTP reported "empty folder" when it could not connect at all. The exit
  status is now checked and the real error is shown.
- The SFTP listing parser split on every space instead of runs of spaces, so
  aligned columns returned the wrong file name.

## How to update

- **First time:** download `Zephyr_1.1.10_x64-setup.exe` or the `.msi` from
  [Releases](https://github.com/ShinRyu04/Zephyr/releases).
- **Already installed:** Settings → About → Check for updates, or wait for the
  bell if auto-update is on.

The app verifies the installer signature before installing. SmartScreen can
still warn because this is not a certificate-authority code-signing
certificate: choose **More info** then **Run anyway**.

---

**Note:** Installers are signed (minisign) for auto-update, so a downloaded
update only installs if its signature matches.
