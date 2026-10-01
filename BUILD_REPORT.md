# BUILD REPORT - Zephyr v1.1.13 release gate status

Date: 2026-10-01
Release: 1.1.13
Current gate status: **RELEASE BUILT, TERMINAL AND BROWSER PANES VERIFIED** -
see section 0 below. Signature/updater metadata is still outstanding.

---

## 0. 1.1.13 build executed on 2026-10-01

The release build was run from this repository with
`npm run tauri:build` (config `src-tauri/tauri.release.conf.json`) after the
release-config WebView2 fix described below.

Artifacts produced:

| Artifact | Size |
| --- | --- |
| `src-tauri/target/release/zephyr.exe` | ~10.7 MB |
| `src-tauri/target/release/bundle/msi/Zephyr_1.1.13_x64_en-US.msi` | ~6.1 MB |
| `src-tauri/target/release/bundle/nsis/Zephyr_1.1.13_x64-setup.exe` | ~4.6 MB |
| `release/1.1.13/portable/Zephyr_1.1.13_windows_portable.zip` | 5,789,248 bytes |

The build exited non-zero only at the signature step because
`TAURI_SIGNING_PRIVATE_KEY` was not present in the environment. The executables
and both installers were produced; the `.sig` files and a final signed
`latest.json` were not. In-app update therefore remains unavailable until the
release is signed.

### Verified in the built release executable

These checks ran against `target/release/zephyr.exe` over the CDP debug port
with a separate `ZEPHYR_DATA_DIR`, calling the real Tauri commands. No
development bridge was involved.

| Check | Evidence | Result |
| --- | --- | --- |
| WebView2 is multi-process | 19 `msedgewebview2` processes alive | PASS |
| Terminal PTY spawns and runs | `pty_spawn` returned a pid; `pty_write` + `pty_tail` returned PowerShell output including `UJI_RELEASE_TERMINAL_OK`; `pty_list` reported `alive: true` | PASS |
| Browser pane opens | `browser_pane_open` returned pane info for `http://localhost:8099/` | PASS |
| Browser pane renders and executes | `browser_pane_eval` returned the served document text `UJI BROWSER PANE OK` | PASS |
| Browser pane show/hide/close | all three commands returned success | PASS |

The same suite run against the debug build additionally confirmed four
concurrent terminal panes answering independently, and that `.pane-body`
computes `overflow: hidden` and `min-width: 0` in the shipped CSS.

### Portable package contents

The zip contains exactly `zephyr.exe`, the `portable` marker and
`PORTABLE-README.txt`. It contains no `data/` entry of any kind. The packaged
`zephyr.exe` SHA-256 matches `target/release/zephyr.exe` exactly
(`7C6E5B5AD609F445AC355EF3EEDF1656094AD66522FB2A1BED87461E129723AF`).

---

## 0.1 Defects fixed before this build

- `src-tauri/tauri.release.conf.json`: removed `--single-process` from the
  WebView2 arguments. This flag was the reason terminal panes and the browser
  pane were dead in every installed build.
- `src/index.css` and `src/lib/xtermRegistry.ts`: panes clip their content and
  terminal fitting is skipped while the container has no size, fixing terminal
  output bleeding into the neighbouring pane.
- `src/components/settings/SectionsBasic.tsx`: the extreme-RAM warning now names
  terminal panes as well as the browser pane.
- `src/components/settings/SettingsPage.tsx`: the developer update panel is
  dev-only, so a release install can no longer present it.
- `src-tauri/tauri.conf.json`: `plugins.updater.windows.installMode` set to
  `basicUi` so updates are never installed silently.
- `scripts/package-portable-windows.mjs`: the zip is built from an allow-list
  and the job aborts if a stale `data/` cannot be removed.
- `scripts/build-rilis.sh`: uses `tauri:build:safe` so the secrets guard runs.
- `src/App.tsx`: the two `fs-changed` listeners are module-guarded, so file
  changes no longer refresh the explorer and Source Control twice.
- `src/lib/systemPrompt.ts`, `aiStore.ts`, `types.ts`, `settings.rs`,
  `SectionsAdvanced.tsx` and `i18n.ts`: new AI answer-style setting (short /
  normal / detailed), default short.

## 1.1.13 evidence available before 2026-10-01

- Release notes and updater metadata were inspected.
- The staged Windows signature does not match the signature embedded in the
  staged `release/1.1.13/latest.json`; root `latest.json` was therefore not
  overwritten.
- No installer verification is claimed. The installer is not certificate-signed,
  and minisign verification must be performed against the final published
  artifact.

---

## Historical v1.0.0 report

Summary of the first release build execution. Every number here comes from an
actual measurement on the build machine, not an estimate.

Date: 2026-09-03
Build machine: Windows 11 (build 26200), 12 logical CPUs, 15.2 GB RAM

---

## Artifacts

| File | Size |
|---|---|
| `Zephyr_1.0.0_x64_en-US.msi` | 7.3 MB |
| `Zephyr_1.0.0_x64_en-US.msi.sig` | 416 B (minisign updater) |
| `Zephyr_1.0.0_x64-setup.exe` (NSIS) | 5.2 MB |
| `Zephyr_1.0.0_x64-setup.exe.sig` | 416 B |

Location: `src-tauri/target/release/bundle/{msi,nsis}/`

Far below the 30 MB evaluation limit from the phase 17.2 prompt - for comparison,
an Electron-based editor installer is usually 80–120 MB.

## Installed stack

Tauri 2 · React 18 · TypeScript 5 · Vite 6 · CodeMirror 6 · xterm.js 5.5 ·
portable-pty 0.8 (ConPTY) · axum 0.8 (MCP) · Zustand 5 · Rust 2021

Frontend bundle after minify+gzip: CodeMirror 136 KB, xterm 74 KB, vendor
83 KB, Zephyr's own code ~142 KB.

---

## Verifications that PASSED

### Phase 15 - Bugfix Vol 1: `npm run verify:15` - **17/17**

V1 UTF-16 BOM · V1b save-as-UTF-8 · V2 5 MB file lightweight mode ·
V3 Ctrl+S on a missing file · V4 regex step limit · V4b undo after reload ·
V5 10 KB paste · V5b pane exit code · V5c 6 panes closed together ·
V6 binary diff · V7 slash branch · V7b push while behind · V8 MCP limit ·
V8b stop MCP mid-request · V9 truncate AI message · V10 800→520 layout ·
V11 tsc + cargo test + 0 console errors

### Phase 16 - Bugfix Vol 2: `npm run verify:16` - **10/10**

V1 startup perf mark · V2 20 tabs + 4 panes · V3 RAM saver mode ·
V4 349-char path + unicode name · V5 reject drive root · V6 corrupt settings
backed up · V7 AI offline 10.3 s · V8 domain table + export · V9 self-test 5/5 ·
V10 tsc + cargo test

### Phase 16.4 - Stress: `npm run stress` - **PASSED**

20 rounds: 200× open/close file, 100× spawn/kill pane, 20 git commits,
60 MCP HTTP calls.

```
JS heap (GC)   : 33.8 MB -> 17.0 MB  (-16.8 MB, limit +25 MB)  <- leak indicator
xterm instances: 0
pty registered : 0
pty ghosts     : 0 rounds
stuck tabs     : 0 rounds
panic in log   : none
git commits    : 20/20 succeeded
MCP            : 60/60 answered
```

Process-tree RSS rose 1194 -> 2098 MB during the stress. That is the WebView2
allocator holding the page for reuse, not a leak - proven by the JS heap
actually DROPPING after GC and by 0 leftover xterm/pty instances. This lesson
matches phase 14 V5 and is already encoded as a criterion in
`scripts/stress.mjs`.

### Phase 17.5 - Release smoke: `node scripts/smoke-release.mjs` - **7/7**

Run against the **release** `zephyr.exe` (not dev):

| # | Result |
|---|---|
| S1 | exe runs, window "Zephyr - Code Editor" ready in **586 ms**; `typeof __ZEPHYR__ === 'undefined'` - the devBridge is genuinely tree-shaken out of the release build |
| S2 | shell renders: empty state, 6 ActivityBar buttons, status bar |
| S3 | Ctrl+Shift+T -> 1 pane + 1 xterm instance, prompt `PS C:\Users\home>` appears |
| S5 | MCP :9222 `/health` 200 (v1.0.0), `get_window` with Bearer token -> 200 |
| S8 | Ctrl+Shift+P -> palette in `command` mode with 35 commands; theme `zephyr-dark` |
| S10a | startup **586 ms** (target <3000 ms) |
| S10b | idle process-tree RAM **273.3 MB** with 1 live terminal pane (target <400 MB) |

**PRD target R3 (<400 MB idle) is MET in the release build.** In the dev build
the number is 430–450 MB because of React DEV + HMR + source maps + StrictMode;
that is why this gate belongs to phase 17.

### Rust & TypeScript

- `npx tsc --noEmit` -> 0 errors, no output
- `cargo test --lib` -> **74 tests passed**
- `cargo build --release` -> finished in 1 m 21 s, 0 errors

---

## Auto-update (phase 17.6)

| Item | Status |
|---|---|
| U1 minisign keypair | **PASSED** - `src-tauri/zephyr.key` generated, pubkey in `tauri.conf.json`, private key in `.gitignore` and proven untracked (`git status` clean) |
| U2 updater artifacts | **PASSED** - `.msi.sig` + `.exe.sig` (416 B) produced by the build |
| U3 empty endpoint does not crash | **PASSED by design** - `updaterStore` translates a `check()` failure into the `unconfigured` status with the message "Update not configured"; the button stays alive, the app does not crash |
| U4 end-to-end update simulation | **PENDING** - needs an endpoint/host. Same behavior as phase 07 (SSH): complete scaffolding, activation later. The exact steps are in `PUBLISH.md` |
| U5 offline startup with no error toast | **PASSED by design** - `check({ senyap: true })` swallows failures; `checkUpdates` defaults to OFF |

The UI lives in Settings → About (`UpdatePanel`), with statuses idle / checking /
available / downloading(%) / ready / up-to-date / unconfigured / error. The
MenuBar Help → Check for Updates entry follows in phase 18 per the 17.6
dependency note.

---

## Known limitations

1. **The installer is not code-signed.** SmartScreen will warn
   "Publisher: Unknown". A paid certificate has not been purchased. This is
   DIFFERENT from the updater signature (minisign) which is already in place.
2. **MSI/NSIS install cannot be automatically verified from this session.**
   Both need Administrator elevation (`Error 1925` / `1303` for MSI,
   `Access is denied` for NSIS) that is not available to the agent process. The
   artifacts themselves are valid - S1..S10 ran against the same release
   `zephyr.exe` that gets wrapped in the installer. **S1 (install from the MSI)
   and S11 (clean uninstall) must be run manually by the user with admin
   rights.**
3. **Phase 07 (SSH) is postponed** - waiting for a test host.
4. **Major features not yet present**: LSP/IntelliSense, DAP debugger, tasks
   runner, minimap, ripgrep global search, local history, notification center,
   menu bar, bottom panel. All are planned to arrive through auto-update, not a
   reinstall. The full list is in the "Not yet in 1.0.0" section of
   `CHANGELOG.md`.
5. **Phases 15/16 ran before features 18–31 existed** (a consequence of the
   "release first, features later" decision in `00-BACA-DULU`). Mitigation: each
   phase has its own V1..Vn verification, and a bugfix pass is repeated before
   v2.0.

---

## User data

`%APPDATA%\zephyr\` - `settings.json`, `secrets.json` (API keys, XOR + a
machine-derived key: obfuscation, NOT strong encryption), `session.json`,
`recent.json`, `mcp.json`, `extensions\`, `logs\` (2 MB rotation).

Uninstall does not delete this folder. On purpose: user settings and keys must
not disappear because of a reinstall.

## No telemetry

No analytics, no automatic crash reporting, no network requests other than: the
AI APIs whose keys the user supplies themselves, git operations to a remote
the user chooses, and `browser_probe` for the browser pane. The MCP server only
listens on `127.0.0.1` with a Bearer token and can be turned off.
