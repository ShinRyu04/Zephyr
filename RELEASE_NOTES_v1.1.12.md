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

## New views

- Read-only SQLite browser: tables, columns, and SELECT with a filter. Writes
  are refused by an allowlist, a banned-word check, and `SQLITE_OPEN_READ_ONLY`.
- HTTP client: GET and POST, headers, GraphQL, Bearer and API-key auth,
  per-session history. Unsupported schemes are rejected with the reason.
- SFTP and a local port forward on the bundled OpenSSH client, no SSH crate
  added.
- Credentials live in their own encrypted file, separate from `secrets.json`,
  and listing never returns a stored value.

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

## Known issues

- The CLI shim check reports "shim not present" unless Zephyr is installed.

## How to update

- **On 1.1.11 or older:** Settings, then About, then Check for updates.
- **First install:** download the installer from
  [Releases](https://github.com/ShinRyu04/Zephyr/releases).

The installer is signed with a minisign key the app verifies before updating.
SmartScreen can still warn because this is not a certificate-authority
code-signing certificate: choose **More info**, then **Run anyway**.
