# Zephyr v1.1.12

Version bumped from 1.1.11 so existing installs receive this build through the
in-app updater.

## Dev Environment

- New view for runtimes, services, terminals, ports, and scanned projects.
  Runtimes report the real versions your terminal sees.
- Start and Stop work from the panel. Stop only kills a process Zephyr started.
- The scan is cached by configuration, so reopening the panel is instant and
  typing in a Settings field no longer starts a scan per keystroke. `Scan again`
  forces a fresh one.
- Every button does something: rows open their folder, `Start all` and
  `Stop all` drive the list, `New project` creates the folder, and the `...`
  menu opens a folder, copies a path, or opens a project in the browser.

## AI

- Streaming no longer truncates. A body that arrived in small pieces could stop
  early (a 46-character answer arrived as 34, with the last events never read);
  the reader now pulls each piece as it lands.
- Rate limit (429) and server errors (5xx) retry twice with backoff, then fall
  back to another provider that has a key.
- A stalled connection fails in 30 seconds instead of 90.
- The context meter shows real token counts when the provider reports them,
  and falls back to an estimate when it does not.
- An agent that calls one tool three times with identical arguments is stopped
  instead of burning its step budget.
- The agent prompt is written, not templated, and each of the ten UI languages
  gets its own text.

## Subagents

- One task line can name its own model, so a batch can run, say, a cheap search
  model next to an expensive one. Pick it per row, or tag the task
  `[model:provider/model-id]`.
- A line can chain with `->`. The second step waits for the first and receives
  its result as context.
- A subagent claims a file the first time it writes, and a second subagent
  handed the same file is refused with the owner's name.
- Each subagent carries an evidence verdict beside its status: proven, partial,
  or unproven, based on what its tool steps actually did. The summary repeats
  the verdict and lists the files written.
- A read-only role is not offered write tools at all.
- The last batch is restored after a restart, so a long run is not lost.
- The idle limit before a step is abandoned is a Setting now.
- The worker list falls back to the saved file when the store is empty, so
  workers no longer vanish until the settings page has been opened once.
- Each row shows the worker's own icon; before this the row was name and tags
  only, so the icon picked in the editor looked discarded on close.
- The edit dialog no longer opens behind the AI panel.

## New views

- Read-only SQLite browser: tables, columns, and SELECT with a filter. Writes
  are refused by an allowlist, a banned-word check, and `SQLITE_OPEN_READ_ONLY`.
- HTTP client: GET and POST, headers, GraphQL, Bearer and API-key auth,
  per-session history. Unsupported schemes are rejected with the reason.
- SFTP and a local port forward on the bundled OpenSSH client, no SSH crate
  added.
- Credentials live in their own encrypted file, separate from `secrets.json`,
  and listing never returns a stored value.

## Language

- The interface is English end to end. Extension descriptions and command
  errors were written in Indonesian while the interface shipped in English, so
  the two never matched: 121 extension descriptions and 259 error messages are
  now English at the source. Translation still happens through the i18n layer,
  so every language keeps its own wording.
- The English and Indonesian dictionaries match now (1280 keys). Around 120
  keys existed only in the Indonesian dictionary, and four of those were still
  Indonesian text, which is why a handful of menus stayed Indonesian with the
  interface set to English.
- The lookup order prefers English over Indonesian. The Indonesian dictionary
  used to be the last fallback, which leaked any key that only it knew into
  every other language. It went unnoticed because those values happened to be
  English already.
- All ten languages are in sync: 1403 keys, checked by
  `scripts/verify-i18n.mjs`.

## Interface

- Terminal, Run and Debug, and Extensions panels rebuilt to match the reference
  layout.
- Extension tabs no longer overlap in a narrow sidebar: the active tab keeps
  its full label, the inactive ones ellipsize.
- Marketplace catalogue icons are inlined and recoloured per path, because an
  `<img>` on a data URI cannot be tinted from outside. No icon renders black.
- Icon colours use each language's official brand hex across 73 packages
  instead of a hash of the package name.
- Minimap, bracket-pair colours, indent guides, ghost text with `Ctrl+Right`
  to accept a word, and the folder open/close animation.

## Integrations

- Discord Rich Presence: on launch Zephyr connects to the local Discord IPC
  pipe and publishes the active workspace folder with an elapsed-time counter.
  Presence clears on exit, so the game slot no longer shows Discord's
  placeholder mark.
- The About page links to the Discord community instead of the WhatsApp group,
  with the real Clyde mark on its native 24x24 grid.

## Fixes

- The TypeScript language server failed to start on a machine with a stale npm
  global shim that pointed at a deleted node. Resolution now prefers the
  project's `node_modules` script and checks a shim before using it.
- The command palette showed four themes twice, and the Help menu listed two
  items on the same command id. Both were duplicate ids, and both are fixed.
- Several `<select>` controls had a `value` prop without `onChange`, which
  produced 33 warnings.
- The menu bar no longer trips the axe `aria-required-children` critical rule.
- Contrast passes AA in all 19 themes. Text on a `--danger` fill uses its own
  token, since one token cannot satisfy both the accent and danger pairings.
- Runtime version labels no longer repeat the name.
- MySQL reads its version from the install folder, and Redis installs with a
  flat layout are detected.
- A SFTP listing read the wrong column for the file size.
- A mistranslated log statement referenced a variable that does not exist,
  which broke the Rust build.
- Editor action buttons no longer show a black-on-black label in the light
  theme.

## Known issues

- The CLI shim check reports "shim not present" unless Zephyr is installed.

## How to update

- **On 1.1.11 or older:** Settings, then About, then Check for updates.
- **First install:** download the installer from
  [Releases](https://github.com/ShinRyu04/Zephyr/releases).

The installer is signed with a minisign key the app verifies before updating.
SmartScreen can still warn because this is not a certificate-authority
code-signing certificate: choose **More info**, then **Run anyway**.
