# Zephyr v1.1.10

Version stays **1.1.10**: this refreshes the release contents, not the version.

## Highlights

- **Language switching now covers the whole app.** The translator used to check
  the English source before the target-language dictionary, so translated keys
  still rendered in English and missing keys fell through to Indonesian. Fixed,
  keys added, and an automated audit reports zero leftover Indonesian across
  nine languages. Default UI language is now English.
- **Every menu item is enabled.** The six View > Theme entries are now real
  commands; an item is only disabled when its command does not exist.
- **AI can use the browser pane.** The pane is a real child WebView2 now, so the
  agent can read the page and click, type, and navigate it. Pages that refuse to
  be embedded (`X-Frame-Options`) load too.
- **AI can search the web** through `web_search` and `web_fetch`, no API key
  needed.
- **Agent mode is much faster**: history is trimmed to the last 8 steps, 363 KB
  to 144 KB on a 61-message run.
- **Automatic update from v1.1.9 works again**, after the signing key was
  restored and a release guard was added.
- **Smaller and lighter**: optimized release profile, fewer WebView2 processes,
  no console windows on startup.

## Features

- **Subagents** run from their own tab, up to 4 at once, read-only by design,
  each capped at 15 steps with a live step log and cancel.
- **Reasoning effort** dropdown mapped per provider, with the model's thinking
  streamed into a collapsible block.
- **AI panel** docks right or bottom, resizes, and maximizes; step-by-step
  streaming, approval modes, terminal output in the chat, a todo panel, image
  attachments, and inline edit diffs.
- **Two-level model picker** (provider, then model) with search.
- **19 themes**, each setting every token at once.
- **Custom background image**, stored separately from the theme.
- **Skills, memory, and scheduled tasks** stored as plain files under
  `%APPDATA%\zephyr\`.
- **Zen mode, image preview, Customize Layout**, CLI subcommands, and portable
  mode.
- **Apache-2.0 license.**

## Bug fixes

- Command Palette entries that changed nothing (dynamic import created a
  separate store instance) now work.
- The compact density setting now changes real metrics instead of 1px.
- Task and test output that was dropped for a not-yet-created channel is kept.
- SFTP now shows the real connection error and parses aligned listings
  correctly.
- Pressing Run with no `launch.json` writes a detected config and continues.
- The browser pane no longer stutters: the webview position sync is event
  driven instead of a 60 fps loop.

## How to update

- **First time:** download `Zephyr_1.1.10_x64-setup.exe` or the `.msi` from
  [Releases](https://github.com/ShinRyu04/Zephyr/releases).
- **Already installed:** Settings → About → Check for updates.

The installer is signed with a minisign key that the app verifies before
updating. SmartScreen can still warn because this is not a certificate-authority
code-signing certificate: choose **More info** then **Run anyway**.
