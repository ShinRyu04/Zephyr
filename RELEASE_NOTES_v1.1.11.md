# Zephyr v1.1.11

Version bumped from 1.1.10 so existing installs receive this build through the
in-app updater.

## AI

- Tool calls sent as inline XML now run. Some gateway and DeepSeek-style models
  put `<|DSML| invoke>` blocks in the message text instead of the native
  `tool_calls` field. The parser only understood the native field, so the raw
  tags were shown to the user and no tool ran. Three formats are recognized now:
  DSML, `<tool_calls>`, and `<antml:invoke>`. The tags are stripped from the
  visible reply and from stored history.
- The workspace is summarized before the first turn: detected stack, entry
  points, top-level layout, and a short file list. The model no longer needs to
  call a tool just to learn what the project is. Build and cache directories
  (`node_modules`, `.vite`, `.git`, `dist`, `target`, and similar) are excluded
  so the summary is source files, not noise.
- Every project rules file is read now (`AGENTS.md`, `CLAUDE.md`, `ZEPHYR.md`,
  `.cursorrules`). Previously only the first one found was used.
- Each agent turn receives a status block with the current plan, step number,
  recent tool results, and failed calls, so the model stops repeating a call
  that already failed.
- A failed tool call now returns explicit guidance to try a different approach
  instead of a bare error.
- The result of the last step corrects the bubble, so raw tool-call tags never
  remain in a saved message.
- `file_edit` replaces every occurrence with a literal match. The previous
  version replaced only the first match and treated `$&`, `` $` ``, and `$1` in
  the replacement as patterns, which corrupted files that contain a dollar sign.
- The active editor file is included as context in agent mode, so "fix this
  file" resolves without a round trip.
- A provider with no API key now shows a banner in the panel with a button that
  opens the right settings section. Chat and agent sends already offered to
  switch to a provider that has a key and now say so clearly.
- The Chat/Agent choice is remembered across restarts.
- The subagent runner has a 90-second idle watchdog. A provider that hung used
  to leave the whole subagent feature stuck until restart.

## Features

- Git blame for the active file, printed to the Output panel with hash, author,
  and summary per line.
- Git stash: save, list, pop, and drop, from the source control menu.
- Merge conflict actions: take ours or take theirs per conflicted file, then
  stage it.
- Git rebase onto a branch.
- Write a commit message from the staged and unstaged diff with one click. The
  message is filled into the box for review before you commit.

## Interface

- A startup splash shows immediately. In a dev build the window was blank while
  the bundle was assembled, which read as a frozen app with no working buttons.
  The splash closes as soon as React mounts a child and has a timeout as a
  fallback.
- Feature panels load on demand. The sidebar, settings page, command palette,
  and dialogs now load only when opened, which shortens the time to the first
  usable frame.
- The subagent panel shows a progress bar (done over total) above the cards.
- The browser pane starts with no URL, showing a small prompt with a shortcut to
  the dev server. The previous default was `http://localhost:3000`, which is
  usually refused, so the pane looked black and appeared broken.
- The Chat and Agent buttons have tooltips that explain the difference.

## MCP server (port 9222)

- A request waits briefly for the front end to report that its listener is
  attached and retries, so a call made during startup is no longer lost with an
  "UI did not answer" error.
- `/health` performs no UI work. It needs no token, and each call used to hold
  the MCP lock for up to eight seconds, which a local process could flood to
  stall agent calls.
- Pending requests are cleared on every failure path.

## Fixes

- Settings files that start with a UTF-8 BOM are read correctly. The reader
  rejected the BOM as a parse error, moved the file aside as `.broken-*`, and
  the next write saved a near-empty file, which reset the user's preferences.
- A settings patch is cancelled instead of applied when the current file cannot
  be read, so an unreadable file no longer gets overwritten with a minimal one.
- Settings are written atomically (temp file, then rename). A write interrupted
  by a crash, a full disk, or a file lock could leave a truncated JSON file,
  which was then moved aside as `.broken-*` and reset the user's preferences.
- The AI model now follows the saved settings. The panel could keep a stale
  placeholder model (`custom-model`) after startup, which made the provider
  return 401 even when the configured model was correct. The provider and model
  are reconciled from settings at boot and before every send.
- A path containing non-ASCII characters no longer panics the app. The relative
  path helper sliced a string by byte offset, which fails mid-character.
- An extension id such as `C:evil` is rejected. It passed validation and could
  resolve outside the extensions directory on Windows.
- A subagent that never receives a reply now fails with a clear timeout instead
  of hanging.

## How to update

- **Already on 1.1.10 or older:** Settings, then About, then Check for updates.
- **First install:** download the installer from
  [Releases](https://github.com/ShinRyu04/Zephyr/releases).

The installer is signed with a minisign key that the app verifies before
updating. SmartScreen can still warn because this is not a certificate-authority
code-signing certificate: choose **More info**, then **Run anyway**.
