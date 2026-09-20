# Security

## Reporting a vulnerability

Email **muhkhalid039@gmail.com** with the subject starting with `[zephyr-security]`.
Do not open a public issue for an unpatched vulnerability.

Include your Zephyr version, Windows version, reproduction steps, and the impact
you observed. Attach a proof-of-concept if you have one.

This is a one-person project, so I cannot promise an SLA. What I can promise:
every report gets read, and if it is valid it will either be patched or — if it
genuinely cannot be patched — recorded openly in this document.

## Supported versions

Only the latest release. No backports to older versions.

## Known security boundaries

This is not a bug list. These are design decisions you should know before
deciding how far to trust Zephyr.

### API keys are obfuscation, not encryption

AI provider keys are stored in `%APPDATA%\zephyr\secrets.json`, XORed with a
BLAKE3 key derived from MachineGuid + hostname + username.

That means: the file cannot be read at a glance, and it is useless if copied to
another machine. But anyone who can already run code as your Windows user can
derive the same key and open it. It protects against passing eyes, not against
an attacker who is already in.

`reset_settings` does **not** delete this file. Delete it manually if needed.

### MCP server on port 9222

The server only listens on localhost and requires a Bearer token. The token
lives in `%APPDATA%\zephyr\` and can be viewed from Settings.

What to be aware of: **any local process** that can read that token file can
drive the Zephyr window — reading editor buffer contents, writing to the
terminal, and running command palette commands. The trust boundary is your
Windows account, not the process.

`editor_write` and `editor_insert` deliberately only touch the in-memory buffer,
never the disk. So a misbehaving AI cannot wreck a file without you pressing
save. The limit is 1 MB per call; `terminal_write` is 64 KB.

The server can be turned off completely in Settings → MCP.

### Workspace Trust

Opening an untrusted folder runs it in Restricted Mode: the tasks runner,
debugger, language server, and extension loading are **rejected on the Rust
side**, not just hidden in the UI. The guard is `ensure_trusted()`.

Trust inherits downward, not upward: trusting `D:\projects` covers its
subfolders, but trusting `D:\projects\sub` does not trust `D:\projects`.
`Unknown` status is treated the same as `Restricted`.

Why this matters: `tasks.json` and `launch.json` can run anything. Cloning a
foreign repo and opening it without this gate is the same as running someone
else's code.

### Extensions do not run JavaScript

v1 extensions only have their `package.json` read, registering
`contributes.commands` into the palette. Their JS code is **never executed**.

This is deliberate and will not change without a proper sandbox. Running
extension JS in the same WebView would give third-party extensions full access
to `window`, and through it to all of IPC — filesystem, PTY, git, and secrets.
Extensions with a broken manifest or a `main` over 1 MB are forced to
`enabled: false`.

### File writes are limited to the workspace

Writes outside the workspace folder are rejected on the Rust side. Paths are
normalized first, so `..\..\Windows\System32` does not slip through.

### The installer is unsigned

There is no code-signing certificate, so SmartScreen will warn. How to verify
what you downloaded: compare its hash against the one published on the release
page.

The updater private key is not in this repository and will never be committed.

### Browser pane

The browser pane uses a sandboxed `<iframe>`, so its contents cannot read the
Zephyr DOM or call IPC. Sites that send `X-Frame-Options: DENY` genuinely
cannot load — that is correct behavior, and the reason is shown along with the
original header, not a generic failure message.

## Out of scope

- An attacker already executing code as your Windows user. All local storage
  — secrets, the MCP token, the trust list — falls in this case.
- Modification of Zephyr files on disk by other processes.
- Vulnerabilities in the WebView2 Runtime itself; those are patched via Windows
  Update.
- Behavior of third-party AI providers toward data you send them.
